import { z } from 'zod';

export const PaperStatusSchema = z.enum([
  'unread',
  'reading',
  'done',
  'archived',
  'inspired',
  'idea',
]);
export type PaperStatus = z.infer<typeof PaperStatusSchema>;

export const PaperSourceSchema = z.enum(['arxiv', 'blogger']);
export type PaperSource = z.infer<typeof PaperSourceSchema>;

export const DifficultySchema = z.enum(['easy', 'medium', 'hard']);
export type Difficulty = z.infer<typeof DifficultySchema>;

export const ChapterSchema = z.object({
  id: z.string(),
  title: z.string(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  anchor: z.string(),
});
export type Chapter = z.infer<typeof ChapterSchema>;

export const PaperSchema = z.object({
  id: z.string(),
  title: z.string(),
  authors: z.array(z.string()),
  arxivId: z.string().nullish(),
  externalUrl: z.string(),
  source: PaperSourceSchema,
  bloggerIds: z.array(z.string()).nullish(),
  abstract: z.string(),
  aiSummary: z.string(),
  tags: z.array(z.string()),
  domain: z.string(),
  publishedAt: z.string(),
  addedAt: z.string(),
  readingMinutes: z.number(),
  difficulty: DifficultySchema,
  status: PaperStatusSchema,
  content: z.string().nullish(),
  chapters: z.array(ChapterSchema).nullish(),
});
export type Paper = z.infer<typeof PaperSchema>;

/** AI 结构化卡片 */
export const AICardTypeSchema = z.enum([
  'motivation',
  'method',
  'experiments',
  'limitations',
  'transferable',
]);
export type AICardType = z.infer<typeof AICardTypeSchema>;

export const AICardSchema = z.object({
  id: z.string(),
  paperId: z.string(),
  type: AICardTypeSchema,
  title: z.string(),
  content: z.string(),
  order: z.number(),
  updatedAt: z.string(),
});
export type AICard = z.infer<typeof AICardSchema>;

/** Reader chat（针对单篇论文的问答） */
export const ReaderChatMessageSchema = z.object({
  id: z.string(),
  paperId: z.string(),
  role: z.enum(['user', 'ai']),
  content: z.string(),
  /** 若消息引用了原文段落，记录 anchor */
  citedAnchor: z.string().optional(),
  createdAt: z.string(),
});
export type ReaderChatMessage = z.infer<typeof ReaderChatMessageSchema>;

/** Feed 筛选 */
export const FeedFiltersSchema = z.object({
  domain: z.string().optional(),
  timeRange: z.enum(['today', 'week', 'month', 'all']).optional(),
  source: z.enum(['all', 'arxiv', 'blogger']).optional(),
  keyword: z.string().optional(),
});
export type FeedFilters = z.infer<typeof FeedFiltersSchema>;

export const FeedPageSchema = z.object({
  papers: z.array(PaperSchema),
  nextCursor: z.string().nullable(),
  total: z.number(),
});
export type FeedPage = z.infer<typeof FeedPageSchema>;
