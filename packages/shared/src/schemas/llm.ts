import { z } from 'zod';

/** 支持的大模型 provider */
export const LlmProviderSchema = z.enum([
  'zhipu',
  'deepseek',
  'gemini',
  'openai',
  'ollama',
  'compatible',
]);
export type LlmProvider = z.infer<typeof LlmProviderSchema>;

/** 我的 LLM 配置（apiKey 永不回传明文，只有脱敏预览） */
export const LlmSettingInfoSchema = z.object({
  provider: LlmProviderSchema,
  hasApiKey: z.boolean(),
  /** 脱敏预览，如 sk-***ab12 */
  apiKeyPreview: z.string().nullish(),
  baseUrl: z.string().nullish(),
  modelMain: z.string().nullish(),
  modelFast: z.string().nullish(),
  updatedAt: z.string(),
});
export type LlmSettingInfo = z.infer<typeof LlmSettingInfoSchema>;

/** GET /settings/llm 的响应：生效来源 + 我的配置 */
export const LlmEffectiveConfigSchema = z.object({
  /** user=使用我的配置；env=未配置但部署级 env 可用；none=完全未配置 */
  source: z.enum(['user', 'env', 'none']),
  provider: LlmProviderSchema.nullish(),
  setting: LlmSettingInfoSchema.nullish(),
});
export type LlmEffectiveConfig = z.infer<typeof LlmEffectiveConfigSchema>;

/** 保存/测试 LLM 配置的请求 */
export const UpsertLlmSettingRequestSchema = z.object({
  provider: LlmProviderSchema,
  /** 留空表示不改动已保存的 key（测试时也沿用旧 key） */
  apiKey: z.string().trim().optional(),
  baseUrl: z.string().trim().nullish(),
  modelMain: z.string().trim().nullish(),
  modelFast: z.string().trim().nullish(),
});
export type UpsertLlmSettingRequest = z.infer<
  typeof UpsertLlmSettingRequestSchema
>;

/** 连通性测试结果 */
export const LlmTestResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  model: z.string().nullish(),
  latencyMs: z.number().nullish(),
});
export type LlmTestResult = z.infer<typeof LlmTestResultSchema>;
