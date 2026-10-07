/**
 * Playwright 浏览器管理
 * ----------------------------------------
 * 两种使用模式：
 *
 * 1) withEphemeralPage（推荐 · 产品化路径）
 *    调用方传入用户自己的 storageState（DB 解密得到），基于共享 browser
 *    单例创建临时 context。不落盘、用完即毁，天然支持 per-user 登录态
 *    与无状态后端部署。
 *
 * 2) withPage（开发 fallback · 旧路径）
 *    使用本地持久化用户目录 .crawler-profile/（需先跑 npm run xhs:login）。
 *    仅用于开发者本地调试，终端用户不会走这条路。
 *
 * Chrome 通道适配：
 * - 本地开发优先用系统 Chrome（channel: 'chrome'），指纹更真实
 * - 失败自动回退 Playwright 内置 chromium（Docker 容器场景）
 */

import path from 'path';
import fs from 'fs';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, BrowserContext, Page } from 'playwright';

// 注册 stealth 插件：完整指纹伪装（navigator.webdriver/chrome.runtime/
// WebGL/Canvas/权限 API/媒体编码等），并抹除 UA 里的 HeadlessChrome 标识。
// 对所有 launch / launchPersistentContext / newContext 自动生效。
chromium.use(StealthPlugin());

/** 防 webdriver 检测的 stealth 注入脚本（登录会话与爬虫共用） */
export const STEALTH_INIT_SCRIPT = `
  (function() {
    globalThis.__name = (fn) => fn;
    globalThis.__pow = Math.pow;
    globalThis.__publicField = (o,k,v) => { o[k]=v; return v; };
    try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); } catch(e){}
    try {
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN','zh','en-US','en'] });
    } catch(e){}
    try {
      Object.defineProperty(navigator, 'plugins', { get: () => [{name:'PDF'},{name:'Chrome PDF'}] });
    } catch(e){}
  })();
`;

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
];

/** Context 通用配置（爬虫与扫码登录会话共用） */
export const CONTEXT_OPTIONS = {
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
} as const;

function isHeadless(): boolean {
  return process.env.CRAWLER_HEADLESS !== 'false';
}

function preferSystemChrome(): boolean {
  return process.env.USE_SYSTEM_CHROME !== 'false';
}

/** 给 Page 做 stealth 注入 + 资源拦截 + 默认超时（两种模式共用） */
async function preparePage(page: Page, timeoutMs: number): Promise<void> {
  await page.addInitScript({ content: STEALTH_INIT_SCRIPT });
  // 只屏蔽 media，其他资源保留
  await page.route('**/*', (route) => {
    if (route.request().resourceType() === 'media') return route.abort();
    return route.continue();
  });
  page.setDefaultTimeout(timeoutMs);
}

// ---------------------------------------------------------------------------
// 共享 Browser 单例（ephemeral 模式）
// ---------------------------------------------------------------------------

let browserPromise: Promise<Browser> | null = null;

/** 启动 Browser：优先系统 Chrome，失败回退内置 chromium（容器无系统 Chrome） */
async function launchBrowser(): Promise<Browser> {
  const headless = isHeadless();
  if (preferSystemChrome()) {
    try {
      return await chromium.launch({
        headless,
        channel: 'chrome',
        ignoreDefaultArgs: ['--enable-automation'],
        args: LAUNCH_ARGS,
      });
    } catch (e) {
      console.warn(
        `[Browser] 系统 Chrome 启动失败，回退内置 chromium：${(e as Error).message}`
      );
    }
  }
  return chromium.launch({
    headless,
    ignoreDefaultArgs: ['--enable-automation'],
    args: LAUNCH_ARGS,
  });
}

export async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const browser = await browserPromise;
      if (browser.isConnected()) return browser;
    } catch {
      /* 上次启动失败，走重新启动 */
    }
    browserPromise = null;
  }
  browserPromise = launchBrowser();
  browserPromise
    .then((browser) => {
      browser.on('disconnected', () => {
        console.log('[Browser] disconnected, will re-launch on next use');
        browserPromise = null;
      });
    })
    .catch((e) => {
      console.error('[Browser] launch failed:', (e as Error).message);
      browserPromise = null;
    });
  return browserPromise;
}

/** Playwright storageState 类型（cookies + origins/localStorage） */
export type StorageState = NonNullable<
  Parameters<Browser['newContext']>[0]
>['storageState'];

/**
 * 用调用方提供的 storageState 创建临时 context 执行任务。
 * 不落盘、用完即毁，适合 per-user 登录态。
 */
export async function withEphemeralPage<T>(
  storageState: StorageState,
  fn: (page: Page) => Promise<T>,
  options: { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = 90_000 } = options;
  const browser = await getBrowser();
  const context = await browser.newContext({
    ...CONTEXT_OPTIONS,
    storageState,
  });
  let page: Page | null = null;
  try {
    page = await context.newPage();
    await preparePage(page, timeoutMs);
    const timeoutPromise = new Promise<T>((_, reject) => {
      setTimeout(
        () => reject(new Error(`爬取超时（${timeoutMs / 1000}s）`)),
        timeoutMs
      );
    });
    return await Promise.race([fn(page), timeoutPromise]);
  } finally {
    if (page) await page.close().catch(() => null);
    await context.close().catch(() => null);
  }
}

// ---------------------------------------------------------------------------
// 持久化 Context（开发 fallback · 旧路径）
// ---------------------------------------------------------------------------

let contextPromise: Promise<BrowserContext> | null = null;

/** 默认爬虫用户目录：项目本地 apps/api/.crawler-profile/ */
function getUserDataDir(): string {
  const custom = process.env.CRAWLER_USER_DATA_DIR;
  if (custom) return custom;
  return path.resolve(process.cwd(), '.crawler-profile');
}

async function isContextAlive(): Promise<boolean> {
  if (!contextPromise) return false;
  try {
    const ctx = await contextPromise;
    const b = ctx.browser();
    if (b && !b.isConnected()) return false;
    ctx.pages();
    return true;
  } catch {
    return false;
  }
}

async function launchPersistent(userDataDir: string): Promise<BrowserContext> {
  const headless = isHeadless();
  const baseOptions = {
    headless,
    slowMo: headless ? 0 : 200,
    ...CONTEXT_OPTIONS,
    ignoreDefaultArgs: ['--enable-automation'],
    args: LAUNCH_ARGS,
  } as const;

  if (preferSystemChrome()) {
    try {
      return await chromium.launchPersistentContext(userDataDir, {
        ...baseOptions,
        channel: 'chrome',
      });
    } catch (e) {
      console.warn(
        `[Browser] 系统 Chrome 启动失败，回退内置 chromium：${(e as Error).message}`
      );
    }
  }
  return chromium.launchPersistentContext(userDataDir, baseOptions);
}

async function getContext(): Promise<BrowserContext> {
  if (contextPromise && !(await isContextAlive())) {
    console.log('[Browser] previous context is dead, will re-launch');
    contextPromise = null;
  }

  if (!contextPromise) {
    const userDataDir = getUserDataDir();
    fs.mkdirSync(userDataDir, { recursive: true });
    console.log(
      `[Browser] launching persistent context (userDataDir=${userDataDir}, headless=${isHeadless()})`
    );

    contextPromise = launchPersistent(userDataDir);
    contextPromise
      .then((ctx) => {
        console.log('[Browser] persistent context ready');
        ctx.on('close', () => {
          console.log('[Browser] context closed, will re-launch on next crawl');
          contextPromise = null;
        });
      })
      .catch((e) => {
        console.error('[Browser] launch failed:', (e as Error).message);
        contextPromise = null;
      });
  }
  return contextPromise;
}

/**
 * 打开一个新 Page 执行 fn（开发 fallback：共享持久化 context）。
 */
export async function withPage<T>(
  fn: (page: Page) => Promise<T>,
  options: {
    timeoutMs?: number;
  } = {}
): Promise<T> {
  const { timeoutMs = 90_000 } = options;

  const context = await getContext();
  let page: Page | null = null;
  try {
    page = await context.newPage();
    await preparePage(page, timeoutMs);

    const timeoutPromise = new Promise<T>((_, reject) => {
      setTimeout(
        () => reject(new Error(`爬取超时（${timeoutMs / 1000}s）`)),
        timeoutMs
      );
    });

    return await Promise.race([fn(page), timeoutPromise]);
  } finally {
    if (page) await page.close().catch(() => null);
  }
}
