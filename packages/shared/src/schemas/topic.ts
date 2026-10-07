import { z } from 'zod';

export const TopicSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  paperCount: z.number(),
  createdAt: z.string(),
});
export type Topic = z.infer<typeof TopicSchema>;

export const CreateTopicRequestSchema = z.object({
  name: z.string().min(1),
  parentId: z.string().nullable(),
});

export const ArchiveEntrySchema = z.object({
  id: z.string(),
  paperId: z.string(),
  topicId: z.string(),
  summary: z.string(),
  createdAt: z.string(),
});
export type ArchiveEntry = z.infer<typeof ArchiveEntrySchema>;

export const ArchiveRequestSchema = z.object({
  paperId: z.string(),
  topicIds: z.array(z.string()).min(1),
  summary: z.string(),
});

/** AI 目录推荐 */
export const TopicRecommendationSchema = z.object({
  topicId: z.string(),
  score: z.number().min(0).max(1),
  reason: z.string(),
});
export type TopicRecommendation = z.infer<typeof TopicRecommendationSchema>;

/** AI 归档总结 */
export const ArchiveSummaryDraftSchema = z.object({
  paperId: z.string(),
  topicId: z.string(),
  content: z.string(),
});
export type ArchiveSummaryDraft = z.infer<typeof ArchiveSummaryDraftSchema>;
