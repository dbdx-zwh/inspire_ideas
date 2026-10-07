import { z } from 'zod';

/** 通用错误响应 */
export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** SSE 事件通用格式 */
export const StreamEventSchema = z.object({
  type: z.enum(['start', 'delta', 'end', 'error']),
  data: z.unknown().optional(),
});
export type StreamEvent = z.infer<typeof StreamEventSchema>;
