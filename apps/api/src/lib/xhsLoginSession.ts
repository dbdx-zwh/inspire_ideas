/**
 * 小红书扫码登录会话管理器
 * ----------------------------------------
 * 产品内扫码绑定的服务端核心：
 *
 * 1. startLoginSession(userId)
 *    为单个用户启动 headless Chrome（独立临时 context，不落盘），
 *    打开小红书登录页（二维码）。前端通过 SSE 接收页面截图流，
 *    用户用手机小红书 App 扫码完成登录。
 *
 * 2. 后台 monitor 每 2s 轮询 cookie jar，出现 web_session 即判定成功：
 *    导出 storageState → AES 加密入库（CrawlerCredential）→ 关闭会话。
 *
 * 3. 资源保护三道保险：
 *    - 同一用户同时只允许一个进行中会话（重复调用幂等复用）
 *    - 全局并发上限 MAX_CONCURRENT_SESSIONS
 *    - SESSION_TTL_MS 超时强制回收
 */

import type { BrowserContext, Page } from 'playwright';
import { prisma } from '../prisma.js';
import { encryptString } from './crypto.js';
import {
  CONTEXT_OPTIONS,
  STEALTH_INIT_SCRIPT,
  getBrowser,
} from './crawlers/browser.js';

export type XhsLoginSessionStatus =
  | 'pending'
  | 'success'
  | 'timeout'
  | 'error'
  | 'canceled';

export interface XhsLoginSession {
  userId: string;
  status: XhsLoginSessionStatus;
  nickname: string | null;
  error: string | null;
  createdAt: number;
  /** 最后一次用户活动（点击/刷新）时间；超时判定以此为准 */
  lastActivityAt: number;
  /**
   * 打开登录页后记录到的初始（匿名）web_session。
   * 小红书会给未登录访客也种匿名 web_session，因此"存在"不代表登录；
   * 只有扫码确认后该值被更新，才视为登录候选。
   */
  initialWebSession: string | null;
  context: BrowserContext;
  page: Page;
  closed: boolean;
}

const sessions = new Map<string, XhsLoginSession>();

/** 无活动会话的存活时间（点击/刷新会续命） */
const SESSION_TTL_MS = 10 * 60 * 1000;
/** 终态后在内存中保留多久（给前端轮询终态留时间） */
const FINAL_STATE_KEEP_MS = 60 * 1000;
const MAX_CONCURRENT_SESSIONS = 3;
const MONITOR_INTERVAL_MS = 2_000;

const XHS_HOME_URL = 'https://www.xiaohongshu.com/';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 读取当前 cookie jar 中的 web_session 值（不存在返回 null） */
async function getWebSessionValue(
  context: BrowserContext
): Promise<string | null> {
  const cookies = await context.cookies(XHS_HOME_URL);
  const hit = cookies.find((c) => c.name === 'web_session' && c.value.length > 0);
  return hit?.value ?? null;
}

/**
 * 确保登录弹窗可见。
 * 小红书主站在未登录状态下通常会自动弹出扫码登录框；
 * 若没自动弹出，则尝试点击页面上的「登录」入口触发。
 */
async function ensureLoginDialogVisible(page: Page): Promise<void> {
  const visible = await page
    .evaluate(() => {
      const selectors = [
        '.login-container',
        '[class*="login-modal"]',
        '[class*="loginModal"]',
        '[class*="login"] [class*="qrcode"]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.getBoundingClientRect().height > 0) return true;
      }
      // 兜底：页面出现登录相关文案也算已弹出
      return /扫码登录|验证码登录|登录后查看/.test(
        document.body?.innerText || ''
      );
    })
    .catch(() => false);
  if (visible) return;

  // 未自动弹出：点击常见登录入口
  await page
    .evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll('button, a, span, div')
      );
      const entry = candidates.find((el) => {
        const text = el.textContent?.trim();
        return text === '登录' || text === '立即登录' || text === '登录/注册';
      });
      if (entry instanceof HTMLElement) entry.click();
    })
    .catch(() => null);
}

function activeSessionCount(): number {
  let count = 0;
  for (const s of sessions.values()) {
    if (s.status === 'pending') count += 1;
  }
  return count;
}

function scheduleRemoval(userId: string): void {
  setTimeout(() => {
    const s = sessions.get(userId);
    if (s && s.status !== 'pending') sessions.delete(userId);
  }, FINAL_STATE_KEEP_MS);
}

async function closeSessionContext(session: XhsLoginSession): Promise<void> {
  if (session.closed) return;
  session.closed = true;
  await session.context.close().catch(() => null);
}

/** 从页面抓取用户昵称（已登录才会有），抓不到返回 null */
async function grabNickname(page: Page): Promise<string | null> {
  return page
    .evaluate(() => {
      const candidates = [
        '.side-bar .user .name',
        '.user .name',
        '.info .name',
        '[class*="user"] [class*="name"]',
      ];
      for (const sel of candidates) {
        const text = document.querySelector(sel)?.textContent?.trim();
        if (text && text.length > 0 && text.length < 30) return text;
      }
      return null;
    })
    .catch(() => null);
}

/**
 * 真实登录态证据判定：
 * - 能抓到昵称/头像用户名 → 铁证
 * - 或者页面上可见的「登录」入口消失（登录后侧边栏变成头像）→ 旁证
 * 用于防止"匿名 web_session 轮换"被误判为扫码成功。
 */
async function collectLoginEvidence(
  page: Page
): Promise<{ ok: boolean; nickname: string | null }> {
  const nickname = await grabNickname(page);
  if (nickname) return { ok: true, nickname };

  const loginEntryGone = await page
    .evaluate(() => {
      const els = Array.from(
        document.querySelectorAll('button, a, span, div')
      );
      const hasLoginEntry = els.some((el) => {
        const text = el.textContent?.trim();
        if (text !== '登录' && text !== '登录/注册') return false;
        const rect = el.getBoundingClientRect();
        return rect.height > 0 && rect.width > 0;
      });
      return !hasLoginEntry;
    })
    .catch(() => false);
  return { ok: loginEntryGone, nickname: null };
}

/**
 * 登录候选成功后的验证 + 入库。
 * 返回 true 表示真实登录成功（已入库并关闭会话）；
 * 返回 false 表示误报（调用方应更新基线 web_session 并继续监控）。
 */
async function handleLoginSuccess(
  session: XhsLoginSession
): Promise<boolean> {
  // 等 2s 让 cookie/页面状态稳定
  await sleep(2_000);

  // 跳首页验证真实登录态
  try {
    await session.page.evaluate((url) => {
      window.location.href = url;
    }, XHS_HOME_URL);
    await session.page
      .waitForLoadState('domcontentloaded', { timeout: 15_000 })
      .catch(() => null);
  } catch {
    /* 忽略，继续用当前页验证 */
  }
  await sleep(2_000);

  let evidence = await collectLoginEvidence(session.page);
  if (!evidence.ok) {
    // 页面可能未加载完，宽限 3s 再验证一次
    await sleep(3_000);
    evidence = await collectLoginEvidence(session.page);
  }
  if (!evidence.ok) {
    console.log(
      `[XHS Login] 用户 ${session.userId} web_session 发生变化但未通过登录态验证，按误报处理（可能是匿名会话轮换）`
    );
    return false;
  }

  const nickname = evidence.nickname;
  const storageState = await session.context.storageState();
  const storageStateEnc = encryptString(JSON.stringify(storageState));
  await prisma.crawlerCredential.upsert({
    where: {
      userId_platform: { userId: session.userId, platform: 'xiaohongshu' },
    },
    create: {
      userId: session.userId,
      platform: 'xiaohongshu',
      storageStateEnc,
      status: 'valid',
      nickname,
      lastVerifiedAt: new Date(),
    },
    update: {
      storageStateEnc,
      status: 'valid',
      ...(nickname ? { nickname } : {}),
      lastVerifiedAt: new Date(),
    },
  });

  session.status = 'success';
  session.nickname = nickname;
  console.log(
    `[XHS Login] 用户 ${session.userId} 绑定成功${nickname ? `（昵称：${nickname}）` : ''}`
  );
  await closeSessionContext(session);
  scheduleRemoval(session.userId);
  return true;
}

/** 后台轮询：检测 cookie jar 中的 web_session。
 *  超时按"最后一次用户活动"计算——用户在点击/刷新说明还活着，
 *  只有完全无操作满 SESSION_TTL_MS 才终结会话并回收 Chrome。 */
async function monitorSession(session: XhsLoginSession): Promise<void> {
  while (Date.now() - session.lastActivityAt < SESSION_TTL_MS) {
    if (session.closed || session.status !== 'pending') return;
    try {
      // 关键：匿名访客也会被种 web_session，"存在"不算登录；
      // 只有值相对初始基线"发生变化"才进入登录候选。
      const current = await getWebSessionValue(session.context);
      const changed =
        current !== null && current !== session.initialWebSession;
      if (changed) {
        const verified = await handleLoginSuccess(session);
        if (!verified) {
          // 误报（匿名 session 轮换等）：更新基线，继续监控
          session.initialWebSession = current;
          await sleep(MONITOR_INTERVAL_MS);
          continue;
        }
        return;
      }
    } catch {
      // context 已关闭（用户取消或浏览器崩溃）
      if (session.status === 'pending') {
        session.status = 'error';
        session.error = '登录浏览器意外关闭';
        scheduleRemoval(session.userId);
      }
      return;
    }
    await sleep(MONITOR_INTERVAL_MS);
  }

  if (session.status === 'pending') {
    session.status = 'timeout';
    console.log(`[XHS Login] 用户 ${session.userId} 扫码超时`);
    await closeSessionContext(session);
    scheduleRemoval(session.userId);
  }
}

/**
 * 启动（或幂等复用）扫码登录会话。
 * 已有进行中会话时直接返回现有会话，前端可继续推流。
 */
export async function startLoginSession(
  userId: string
): Promise<XhsLoginSession> {
  const existing = sessions.get(userId);
  if (existing && existing.status === 'pending') return existing;

  // 清理该用户的终态旧会话
  if (existing) {
    await closeSessionContext(existing);
    sessions.delete(userId);
  }

  if (activeSessionCount() >= MAX_CONCURRENT_SESSIONS) {
    throw new Error('当前登录请求过多，请稍后再试');
  }

  const browser = await getBrowser();
  const context = await browser.newContext({ ...CONTEXT_OPTIONS });
  const page = await context.newPage();
  await page.addInitScript({ content: STEALTH_INIT_SCRIPT });

  const session: XhsLoginSession = {
    userId,
    status: 'pending',
    nickname: null,
    error: null,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    initialWebSession: null,
    context,
    page,
    closed: false,
  };
  sessions.set(userId, session);

  context.on('close', () => {
    session.closed = true;
    if (session.status === 'pending') {
      session.status = 'error';
      session.error = '登录浏览器意外关闭';
      scheduleRemoval(userId);
    }
  });

  // 打开主站（不直达 /login，更接近真实用户路径，降低风控关注）；
  // 未登录时小红书会自动弹出扫码登录框，未弹出则主动触发
  try {
    await Promise.all([
      page.waitForURL(/xiaohongshu\.com/, {
        waitUntil: 'commit',
        timeout: 30_000,
      }),
      page.evaluate((url) => {
        window.location.href = url;
      }, XHS_HOME_URL),
    ]);
    await page
      .waitForLoadState('domcontentloaded', { timeout: 15_000 })
      .catch(() => null);

    // 给前端 JS 几秒时间决定是否弹登录框，随后兜底主动触发
    await sleep(2_500);
    await ensureLoginDialogVisible(page);

    // 记录初始（匿名）web_session 基线，之后监测"变化"才算登录
    session.initialWebSession = await getWebSessionValue(context).catch(
      () => null
    );
  } catch (e) {
    console.warn(
      `[XHS Login] 登录页打开异常（用户仍可手动等待页面加载）：${(e as Error).message}`
    );
  }

  // 后台监控（不阻塞路由返回）
  monitorSession(session).catch((e) =>
    console.error('[XHS Login] monitor crashed:', (e as Error).message)
  );

  return session;
}

export function getLoginSession(userId: string): XhsLoginSession | undefined {
  return sessions.get(userId);
}

/** 当前页面截图（jpeg base64，不含 data: 前缀）；页面不可用时返回 null */
export async function captureSessionScreenshot(
  session: XhsLoginSession
): Promise<string | null> {
  if (session.closed || session.page.isClosed()) return null;
  try {
    const buf = await session.page.screenshot({
      type: 'jpeg',
      quality: 55,
      timeout: 5_000,
    });
    return buf.toString('base64');
  } catch {
    return null;
  }
}

/** 用户主动取消（关闭弹窗时调用） */
export async function cancelLoginSession(userId: string): Promise<void> {
  const session = sessions.get(userId);
  if (!session) return;
  if (session.status === 'pending') {
    session.status = 'canceled';
  }
  await closeSessionContext(session);
  scheduleRemoval(userId);
}

/**
 * 把用户点击坐标转发到会话页面（截图流可交互化）。
 * 坐标系为页面 viewport（CONTEXT_OPTIONS.viewport，1440x900）。
 * 二维码过期时点「刷新」、切换登录方式 tab 等都靠这个通道。
 */
export async function clickInSession(
  userId: string,
  x: number,
  y: number
): Promise<boolean> {
  const session = sessions.get(userId);
  if (!session || session.closed || session.status !== 'pending') {
    return false;
  }
  session.lastActivityAt = Date.now(); // 用户活动，续命
  const { width, height } = CONTEXT_OPTIONS.viewport;
  const cx = Math.max(0, Math.min(Math.round(x), width));
  const cy = Math.max(0, Math.min(Math.round(y), height));
  await session.page.mouse.click(cx, cy).catch(() => null);
  return true;
}

/** 刷新页面并重新确保登录框弹出（二维码异常时的自助恢复）。
 *  返回 false 表示会话已结束（前端据此提示用户重新开始）。 */
export async function reloadSessionPage(userId: string): Promise<boolean> {
  const session = sessions.get(userId);
  if (!session || session.closed || session.status !== 'pending') {
    return false;
  }
  session.lastActivityAt = Date.now(); // 用户活动，续命
  try {
    await session.page.reload({
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    });
    await sleep(2_500);
    await ensureLoginDialogVisible(session.page);
  } catch {
    /* 页面可能已失效，忽略（截图流会把当前状态推给前端） */
  }
  return true;
}
