import { z } from 'zod';

export const IdeaStatusSchema = z.enum([
  'draft',
  'deepening',
  'confirmed',
  'discarded',
]);
export type IdeaStatus = z.infer<typeof IdeaStatusSchema>;

export const IdeaSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  sourcePaperIds: z.array(z.string()),
  scenario: z.string(),
  codeRef: z.string().nullish(),
  hypothesis: z.string(),
  changes: z.string(),
  sourceCitation: z.string(),
  feasibility: z.number().min(0).max(5),
  risk: z.string(),
  status: IdeaStatusSchema,
  anchorIds: z.array(z.string()),
});
export type Idea = z.infer<typeof IdeaSchema>;

export const AnchorSchema = z.object({
  id: z.string(),
  ideaId: z.string(),
  content: z.string(),
  createdAt: z.string(),
});
export type Anchor = z.infer<typeof AnchorSchema>;

export const ChatMessageSchema = z.object({
  id: z.string(),
  ideaId: z.string(),
  role: z.enum(['user', 'ai']),
  content: z.string(),
  createdAt: z.string(),
  createdAnchorIds: z.array(z.string()).optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const GenerateIdeaRequestSchema = z.object({
  paperIds: z
    .array(z.string().min(1))
    .min(1)
    .max(10, '一次最多选择 10 篇论文生成 Idea')
    .refine((ids) => new Set(ids).size === ids.length, '论文列表中存在重复项'),
  scenario: z.string().trim().min(1).max(8_000),
  codeRef: z.string().trim().max(1_000).optional(),
  anchorContents: z.array(z.string().trim().min(1).max(2_000)).max(20).optional(),
});

export const SendIdeaMessageRequestSchema = z.object({
  content: z.string().min(1),
});
