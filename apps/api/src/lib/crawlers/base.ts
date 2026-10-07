/**
 * Crawler 抽象接口
 * ----------------------------------------
 * 每个平台实现一个 Crawler。上层调用者不关心平台细节。
 */

import type { StorageState } from './browser.js';

export interface CrawledPost {
  platformPostId: string;
  title: string;
  content: string;
  url: string;
  publishedAt?: Date;
}

/** 博主主页元信息 */
export interface CrawledProfile {
  name?: string;
  avatarUrl?: string;
  bio?: string;
}

export interface CrawlResult {
  profile: CrawledProfile;
  posts: CrawledPost[];
}

export interface CrawlProgress {
  processed: number;
  total: number;
  label: string;
}

export interface Crawler {
  /** 平台标识 */
  platform: 'xiaohongshu' | 'zhihu';

  /**
   * 解析用户输入：可能是纯用户编码，也可能是完整主页 URL
   * 返回标准化的用户编码 + 主页链接
   */
  parseInput(input: string): { platformUserId: string; externalUrl: string } | null;

  /**
   * 抓取指定博主的主页信息 + 最近帖子。
   * onProgress 回调用于实时更新前端进度条。
   * 静态解析拿到什么算什么，即使 posts 为空也应该尽量返回 profile。
   *
   * credential：调用方传入的 per-user 登录态（Playwright storageState）。
   * 缺省时回退到开发用的本地持久化目录（见 browser.ts）。
   */
  crawl(
    platformUserId: string,
    onProgress?: (p: CrawlProgress) => void,
    credential?: { storageState: StorageState }
  ): Promise<CrawlResult>;
}
