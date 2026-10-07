import { z } from 'zod';

export const CrawlStatusSchema = z.enum(['idle', 'crawling', 'done', 'failed']);
export type CrawlStatus = z.infer<typeof CrawlStatusSchema>;

export const BloggerPlatformSchema = z.enum(['xiaohongshu', 'zhihu']);
export type BloggerPlatform = z.infer<typeof BloggerPlatformSchema>;

export const BloggerSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullish(),
  externalUrl: z.string().nullish(),
  platform: BloggerPlatformSchema,
  platformUserId: z.string(),
  followedAt: z.string(),
  crawlStatus: CrawlStatusSchema,
  crawlProgress: z.number().nullish(),
  crawlProgressLabel: z.string().nullish(),
  lastCrawledAt: z.string().nullish(),
  errorMessage: z.string().nullish(),
  // 以下两个字段由后端在返回时聚合计算，不再是存储字段
  recommendCount: z.number(),
  deepReadRatio: z.number().nullable(),
});
export type Blogger = z.infer<typeof BloggerSchema>;

/** 添加博主的请求 */
export const AddBloggerRequestSchema = z.object({
  platform: BloggerPlatformSchema,
  /** 用户输入：可以是用户编码，也可以是完整主页链接（后端解析） */
  query: z.string().min(1),
});
export type AddBloggerRequest = z.infer<typeof AddBloggerRequestSchema>;

export const CrawlProgressResponseSchema = z.object({
  status: CrawlStatusSchema,
  progress: z.number(),
  label: z.string().nullish(),
});

/** 博主帖子（可选返回给前端做溯源展示） */
export const BloggerPostSchema = z.object({
  id: z.string(),
  bloggerId: z.string(),
  platformPostId: z.string(),
  title: z.string(),
  content: z.string(),
  url: z.string(),
  publishedAt: z.string().nullish(),
  extractedArxivIds: z.array(z.string()),
  crawledAt: z.string(),
});
export type BloggerPost = z.infer<typeof BloggerPostSchema>;
