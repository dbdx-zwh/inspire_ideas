/**
 * 用户设置路由（当前：LLM 配置）
 * ----------------------------------------
 *   GET    /settings/llm       我的 LLM 配置（apiKey 脱敏）+ 生效来源
 *   POST   /settings/llm/test  连通性测试（真实调一次 ping，保存前校验）
 *   PUT    /settings/llm       保存配置（先测试通过才落库；apiKey 留空=不改动）
 *   DELETE /settings/llm       清除我的配置，回退 env 默认
 *
 * 优先级：本表配置 > env 部署级默认 > 未配置报错（见 llmProvider.resolveProviderConfig）
 */

import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../prisma.js';
import { decryptString, encryptString } from '../lib/crypto.js';
import {
  isLLMConfigured,
  testProviderConfig,
  PROVIDER_DEFAULT_BASE_URL,
  type ProviderConfig,
} from '../lib/llmProvider.js';
import {
  UpsertLlmSettingRequestSchema,
  type UpsertLlmSettingRequest,
} from '@shared/schemas/llm';

/** 个别 provider 有合理默认模型名（与 llmProvider 保持一致） */
const PROVIDER_DEFAULT_MODEL: Record<string, string> = {
  zhipu: 'glm-4-flash',
  gemini: 'gemini-3.5-flash-lite',
};

function maskApiKey(key: string): string {
  if (key.length <= 8) return '***';
  return `${key.slice(0, 3)}***${key.slice(-4)}`;
}

interface LlmSettingRow {
  provider: string;
  apiKeyEnc: string | null;
  baseUrl: string | null;
  modelMain: string | null;
  modelFast: string | null;
  updatedAt: Date;
}

function serializeSetting(row: LlmSettingRow) {
  let apiKeyPreview: string | null = null;
  if (row.apiKeyEnc) {
    try {
      apiKeyPreview = maskApiKey(decryptString(row.apiKeyEnc));
    } catch {
      apiKeyPreview = '***';
    }
  }
  return {
    provider: row.provider,
    hasApiKey: !!row.apiKeyEnc,
    apiKeyPreview,
    baseUrl: row.baseUrl,
    modelMain: row.modelMain,
    modelFast: row.modelFast,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * 组装用于测试/保存的完整配置。
 * apiKey 留空时沿用该用户已保存的同 provider key；返回 error 表示必填项缺失。
 */
async function resolveConfigForTest(
  body: UpsertLlmSettingRequest,
  userId: string
): Promise<ProviderConfig | { error: string }> {
  let apiKey = body.apiKey;
  if (!apiKey) {
    const existing = await prisma.llmSetting.findUnique({
      where: { userId },
    });
    if (existing?.apiKeyEnc && existing.provider === body.provider) {
      try {
        apiKey = decryptString(existing.apiKeyEnc);
      } catch {
        /* 解不开就当作没有 */
      }
    }
  }

  const baseUrl =
    body.baseUrl || PROVIDER_DEFAULT_BASE_URL[body.provider] || '';
  const model =
    body.modelMain ||
    body.modelFast ||
    PROVIDER_DEFAULT_MODEL[body.provider] ||
    '';

  if (!baseUrl || !model) {
    return { error: 'Base URL 与模型名必填（选择 provider 后会自动带出默认值）' };
  }
  if (body.provider !== 'ollama' && !apiKey) {
    return { error: '请填写 API Key' };
  }
  return { provider: body.provider, apiKey, baseUrl, model };
}

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  // ---------- GET /settings/llm ----------
  app.get('/settings/llm', async (request) => {
    const row = await prisma.llmSetting.findUnique({
      where: { userId: request.userId },
    });
    if (!row) {
      return {
        source: isLLMConfigured() ? 'env' : 'none',
        provider: null,
        setting: null,
      };
    }
    return {
      source: 'user',
      provider: row.provider,
      setting: serializeSetting(row),
    };
  });

  // ---------- POST /settings/llm/test ----------
  app.post('/settings/llm/test', async (request, reply) => {
    const body = UpsertLlmSettingRequestSchema.parse(request.body);
    const resolved = await resolveConfigForTest(body, request.userId!);
    if ('error' in resolved) {
      return reply.status(400).send({
        code: 'LLM_CONFIG_INCOMPLETE',
        message: resolved.error,
      });
    }
    const result = await testProviderConfig(resolved);
    return { ...result, model: resolved.model };
  });

  // ---------- PUT /settings/llm ----------
  app.put('/settings/llm', async (request, reply) => {
    const body = UpsertLlmSettingRequestSchema.parse(request.body);
    const resolved = await resolveConfigForTest(body, request.userId!);
    if ('error' in resolved) {
      return reply.status(400).send({
        code: 'LLM_CONFIG_INCOMPLETE',
        message: resolved.error,
      });
    }

    // 保存前必须通过连通性测试，避免落库一个坏配置
    const result = await testProviderConfig(resolved);
    if (!result.ok) {
      return reply.status(400).send({
        code: 'LLM_TEST_FAILED',
        message: `连通性测试失败：${result.message}`,
      });
    }

    const saved = await prisma.llmSetting.upsert({
      where: { userId: request.userId! },
      create: {
        userId: request.userId!,
        provider: body.provider,
        apiKeyEnc: body.apiKey ? encryptString(body.apiKey) : null,
        baseUrl: body.baseUrl || null,
        modelMain: body.modelMain || null,
        modelFast: body.modelFast || null,
      },
      update: {
        provider: body.provider,
        ...(body.apiKey ? { apiKeyEnc: encryptString(body.apiKey) } : {}),
        baseUrl: body.baseUrl || null,
        modelMain: body.modelMain || null,
        modelFast: body.modelFast || null,
      },
    });
    return {
      source: 'user',
      provider: saved.provider,
      setting: serializeSetting(saved),
    };
  });

  // ---------- DELETE /settings/llm ----------
  app.delete('/settings/llm', async (request, reply) => {
    await prisma.llmSetting.deleteMany({
      where: { userId: request.userId },
    });
    return reply.status(204).send();
  });
};
