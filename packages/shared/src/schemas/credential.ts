import { z } from 'zod';
import { BloggerPlatformSchema } from './blogger';

/**
 * 爬虫登录态（per-user）。
 * 注意：绝不包含 storageState 本身，敏感凭证只在服务端加密存储。
 */
export const CrawlerCredentialStatusSchema = z.enum(['valid', 'expired']);
export type CrawlerCredentialStatus = z.infer<
  typeof CrawlerCredentialStatusSchema
>;

export const CrawlerCredentialInfoSchema = z.object({
  platform: BloggerPlatformSchema,
  status: CrawlerCredentialStatusSchema,
  nickname: z.string().nullish(),
  lastVerifiedAt: z.string().nullish(),
});
export type CrawlerCredentialInfo = z.infer<
  typeof CrawlerCredentialInfoSchema
>;

/** 扫码登录会话的终态 */
export const XhsLoginResultStatusSchema = z.enum([
  'success',
  'timeout',
  'error',
  'canceled',
]);
export type XhsLoginResultStatus = z.infer<typeof XhsLoginResultStatusSchema>;

/** SSE 终态事件（end）携带的数据 */
export const XhsLoginResultSchema = z.object({
  status: XhsLoginResultStatusSchema,
  nickname: z.string().nullish(),
  message: z.string().nullish(),
});
export type XhsLoginResult = z.infer<typeof XhsLoginResultSchema>;
