/**
 * Crawler 注册中心
 */

import type { Crawler } from './base.js';
import { xiaohongshuCrawler } from './xiaohongshu.js';

export * from './base.js';
export { extractArxivIds } from './extractArxiv.js';

const registry: Record<string, Crawler> = {
  xiaohongshu: xiaohongshuCrawler,
  // zhihu: zhihuCrawler, // 未来
};

export function getCrawler(platform: string): Crawler | null {
  return registry[platform] || null;
}

export function listSupportedPlatforms(): string[] {
  return Object.keys(registry);
}
