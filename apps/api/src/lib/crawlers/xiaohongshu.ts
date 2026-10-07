/**
 * 小红书博主抓取（层级 2 · Playwright headless）
 * ----------------------------------------
 * - 用 Playwright 打开博主主页，等 JS 渲染完成后提取
 * - 移动端 UA + 移动视口，反爬压力更小
 * - 尽力抓取博主 profile（昵称/头像/bio）和最近笔记
 * - 每篇笔记单独打开详情页拿完整正文（最多 8 篇，避免超时）
 */

import type {
  CrawledPost,
  CrawledProfile,
  Crawler,
  CrawlProgress,
  CrawlResult,
} from './base.js';
import {
  withPage,
  withEphemeralPage,
  type StorageState,
} from './browser.js';
import type { Page } from 'playwright';

const XHS_HOST = 'https://www.xiaohongshu.com';
const MAX_NOTES = 20; // 每次抓取最多深入的笔记数

export const xiaohongshuCrawler: Crawler = {
  platform: 'xiaohongshu',

  parseInput(input: string) {
    const trimmed = input.trim();
    if (!trimmed) return null;

    const urlMatch = trimmed.match(
      /xiaohongshu\.com\/user\/profile\/([a-f0-9]{20,32})/i
    );
    if (urlMatch) {
      return {
        platformUserId: urlMatch[1],
        externalUrl: `${XHS_HOST}/user/profile/${urlMatch[1]}`,
      };
    }
    if (/^[a-f0-9]{20,32}$/i.test(trimmed)) {
      return {
        platformUserId: trimmed.toLowerCase(),
        externalUrl: `${XHS_HOST}/user/profile/${trimmed.toLowerCase()}`,
      };
    }
    return null;
  },

  async crawl(
    platformUserId: string,
    onProgress?: (p: CrawlProgress) => void,
    credential?: { storageState: StorageState }
  ): Promise<CrawlResult> {
    const profileUrl = `${XHS_HOST}/user/profile/${platformUserId}`;

    onProgress?.({
      processed: 5,
      total: 100,
      label: '启动 Chrome...',
    });

    // 有 per-user 登录态走临时 context（产品化路径）；
    // 否则回退本地持久化目录（开发调试路径）
    const runInPage = (fn: (page: Page) => Promise<CrawlResult>) =>
      credential
        ? withEphemeralPage(credential.storageState, fn)
        : withPage(fn);

    return runInPage(async (page) => {
      // 监听所有响应，用于诊断
      const responseLog: Array<{ url: string; status: number }> = [];
      page.on('response', (resp) => {
        const url = resp.url();
        // 只关心 xhs 主站的响应
        if (url.includes('xiaohongshu.com') && !url.includes('.js') && !url.includes('.css') && !url.includes('.png')) {
          responseLog.push({ url, status: resp.status() });
          console.log(`[XHS Response] ${resp.status()} ${url}`);
        }
      });

      // 预热：先访问 XHS 首页（用 location.href 模拟用户导航）
      onProgress?.({ processed: 10, total: 100, label: '预热首页...' });
      let homepageOk = false;
      try {
        await Promise.all([
          page.waitForURL(/xiaohongshu\.com/, {
            waitUntil: 'commit',
            timeout: 20_000,
          }),
          page.evaluate(() => {
            window.location.href = 'https://www.xiaohongshu.com/';
          }),
        ]);
        homepageOk = true;
        console.log(`[XHS] 首页 URL: ${page.url()}`);
        await page.waitForTimeout(1500);
      } catch (e) {
        console.log(`[XHS] 首页超时: ${(e as Error).message}`);
      }
      if (!homepageOk) {
        throw new Error(
          '连小红书首页都访问不了。可能是网络问题，或小红书登录态未绑定/已失效。请在「管理关注博主」弹窗中检查登录态。'
        );
      }

      onProgress?.({ processed: 20, total: 100, label: '打开博主主页...' });

      // 访问博主主页：用 location.href 而不是 page.goto
      // page.goto 走 CDP Page.navigate 命令，XHS 会检测；location.href 是普通 JS 导航
      try {
        await Promise.all([
          page.waitForURL(/xiaohongshu\.com\/user\/profile/, {
            waitUntil: 'commit',
            timeout: 30_000,
          }),
          page.evaluate((url) => {
            window.location.href = url;
          }, profileUrl),
        ]);
        console.log(`[XHS] 博主主页 URL after: ${page.url()}`);
        await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => null);
      } catch (err) {
        console.log('[XHS] 响应日志汇总:', responseLog);
        throw new Error(
          `打开博主主页失败：${(err as Error).message}. 首页 OK 但博主页不通，说明小红书判定登录态失效或触发风控，请重新扫码绑定。`
        );
      }

      onProgress?.({ processed: 30, total: 100, label: '等待 JS 渲染...' });

      // 等主要内容出现（可能是 note-item 或类似容器）
      // 用多个可能的选择器做兜底
      await page
        .waitForSelector(
          [
            'section.note-item',
            'a[href*="/explore/"]',
            '.note-detail-mask',
            '[data-v-notes-item]',
          ].join(', '),
          { timeout: 10_000 }
        )
        .catch(() => null);

      // 再稍等一下让延后加载完成
      await page.waitForTimeout(1500);

      // 登录态检测：如果 URL 或页面 title 显示登录/安全验证，说明 cookie 过期了
      const currentUrl = page.url();
      const pageTitle = await page.title().catch(() => '');
      const isLoginRequired =
        /\/login|\/verify|\/captcha|\/passport/i.test(currentUrl) ||
        /登录|安全验证|请先登录/.test(pageTitle);
      if (isLoginRequired) {
        console.log(`[XHS] 登录态失效 · URL=${currentUrl} · title=${pageTitle}`);
        throw new Error('COOKIE_EXPIRED');
      }

      onProgress?.({ processed: 45, total: 100, label: '提取博主信息...' });

      // 提取博主 profile
      const profile: CrawledProfile = await page.evaluate(() => {
        const q = (sel: string) => document.querySelector(sel);
        const meta = (name: string) =>
          (q(`meta[property="${name}"]`) || q(`meta[name="${name}"]`))?.getAttribute(
            'content'
          ) || null;

        // 尝试从 og 标签取
        let name = meta('og:title') || document.title || '';
        // 清理小红书后缀
        name = name.replace(/\s*[-|·]\s*小红书.*$/i, '').replace(/\s*的主页.*$/i, '').trim();

        // 尝试从可见 DOM 元素补充（更精准）
        const nameEl = q('.user-name, .nickname, [class*="userName"], h1');
        if (nameEl?.textContent) {
          const domName = nameEl.textContent.trim();
          if (domName.length > 0 && domName.length < 50) name = domName;
        }

        const avatarUrl = meta('og:image') || null;
        const bio = meta('og:description') || meta('description') || null;

        return { name, avatarUrl, bio };
      });

      // 再一层保险：如果博主名等于典型的验证/登录页标题，也算过期
      if (profile.name && /^(安全验证|登录|请登录|验证)$/i.test(profile.name.trim())) {
        console.log(`[XHS] 抓到博主名 "${profile.name}"，判定为登录态过期`);
        throw new Error('COOKIE_EXPIRED');
      }
      if (profile.name) {
        onProgress?.({
          processed: 55,
          total: 100,
          label: `识别到博主：${profile.name}`,
        });
      }

      // 提取笔记链接列表
      onProgress?.({ processed: 60, total: 100, label: '扫描笔记列表...' });

      const noteLinks: { id: string; url: string; title: string }[] =
        await page.evaluate((maxNotes) => {
          const links = Array.from(
            document.querySelectorAll('a[href*="/explore/"]')
          ) as HTMLAnchorElement[];
          const seen = new Set<string>();
          const out: { id: string; url: string; title: string }[] = [];
          for (const a of links) {
            const m = a.href.match(/\/explore\/([a-f0-9]{20,32})/i);
            if (!m) continue;
            const id = m[1];
            if (seen.has(id)) continue;
            seen.add(id);
            // 找同容器内的标题文本
            let title = '';
            const parent = a.closest('section, article, li, div');
            if (parent) {
              const t = parent.querySelector(
                '[class*="title"], [class*="Title"], .footer, .desc'
              );
              if (t?.textContent) title = t.textContent.trim().slice(0, 200);
            }
            if (!title) title = a.textContent?.trim().slice(0, 200) || '';
            out.push({ id, url: a.href, title });
            if (out.length >= maxNotes) break;
          }
          return out;
        }, MAX_NOTES);

      if (noteLinks.length === 0) {
        onProgress?.({
          processed: 100,
          total: 100,
          label: profile.name
            ? `已识别博主"${profile.name}"，但未找到笔记链接（可能博主主页需要登录）`
            : '未找到任何笔记链接',
        });
        return { profile, posts: [] };
      }

      onProgress?.({
        processed: 65,
        total: 100,
        label: `发现 ${noteLinks.length} 条笔记，逐条读取...`,
      });

      // 逐个访问笔记详情页，抓取完整正文
      const posts: CrawledPost[] = [];
      for (let i = 0; i < noteLinks.length; i++) {
        const nl = noteLinks[i];
        try {
          const detail = await fetchNoteDetail(page, nl.url);
          posts.push({
            platformPostId: nl.id,
            title: detail.title || nl.title || '(无标题笔记)',
            content: detail.content,
            url: nl.url,
            publishedAt: detail.publishedAt,
          });
        } catch (e) {
          // 单篇失败不影响整体
          posts.push({
            platformPostId: nl.id,
            title: nl.title || '(无标题笔记)',
            content: '',
            url: nl.url,
          });
        }
        onProgress?.({
          processed: 65 + Math.round(((i + 1) / noteLinks.length) * 30),
          total: 100,
          label: `已处理 ${i + 1}/${noteLinks.length} 条笔记`,
        });
      }

      onProgress?.({
        processed: 100,
        total: 100,
        label: `完成 · 抓取 ${posts.length} 条笔记`,
      });

      return { profile, posts };
    });
  },
};

/** 在同一 page 上打开笔记详情页并提取正文 */
async function fetchNoteDetail(
  page: import('playwright').Page,
  noteUrl: string
): Promise<{ title: string; content: string; publishedAt?: Date }> {
  // 用 location.href 而不是 page.goto，避免 XHS 检测 CDP navigate
  await Promise.all([
    page.waitForURL(/xiaohongshu\.com\/(explore|discovery)/, {
      waitUntil: 'commit',
      timeout: 20_000,
    }),
    page.evaluate((u) => {
      window.location.href = u;
    }, noteUrl).catch(() => null),
  ]).catch(() => null);
  await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => null);
  await page.waitForTimeout(800);

  return page.evaluate(() => {
    const q = (sel: string) => document.querySelector(sel);
    const meta = (name: string) =>
      (q(`meta[property="${name}"]`) || q(`meta[name="${name}"]`))?.getAttribute(
        'content'
      ) || '';

    // 标题
    let title = meta('og:title') || document.title || '';
    title = title.replace(/\s*[-|·]\s*小红书.*$/i, '').trim();

    // 正文：多策略
    const contentSelectors = [
      '.note-content',
      '.note-text',
      '.desc',
      '[class*="Description"]',
      '[class*="noteContent"]',
      'article',
    ];
    let content = '';
    for (const sel of contentSelectors) {
      const el = q(sel);
      if (el?.textContent && el.textContent.length > content.length) {
        content = el.textContent.trim();
      }
    }
    // og:description 兜底
    if (!content) {
      content = meta('og:description') || meta('description') || '';
    }

    // 发布时间
    let publishedAt: string | undefined;
    const timeEl = q('time, .publish-date, [class*="date"]');
    const dateStr =
      timeEl?.getAttribute('datetime') || timeEl?.textContent?.trim();
    if (dateStr) {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) publishedAt = parsed.toISOString();
    }

    return { title, content, publishedAt };
  }).then((r) => ({
    ...r,
    publishedAt: r.publishedAt ? new Date(r.publishedAt) : undefined,
  }));
}
