import { prisma } from '../prisma.js';
import { decryptString } from './crypto.js';

export type LLMTask = 'fast' | 'main';

interface CompletionInput {
  system: string;
  prompt: string;
  task?: LLMTask;
  /** 发起调用的用户；提供时优先使用该用户在「设置」中保存的 LLM 配置 */
  userId?: string;
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  jsonSchema?: {
    name: string;
    schema: Record<string, unknown>;
  };
  /** 单次 HTTP 请求超时；长文批处理可以覆盖通用超时。 */
  timeoutMs?: number;
  /** 包含首次请求在内的最大尝试次数。 */
  maxAttempts?: number;
}

export interface ProviderConfig {
  provider: string;
  apiKey?: string;
  baseUrl: string;
  model: string;
}

export class LLMError extends Error {
  readonly statusCode: number;

  constructor(
    message: string,
    public readonly code: 'LLM_NOT_CONFIGURED' | 'LLM_REQUEST_FAILED' | 'LLM_INVALID_RESPONSE',
    statusCode = 502
  ) {
    super(message);
    this.name = 'LLMError';
    this.statusCode = statusCode;
  }
}

export function isLLMConfigured(): boolean {
  try {
    getProviderConfig('fast');
    return true;
  } catch {
    return false;
  }
}

/** 调用 OpenAI-compatible Chat Completions 接口。 */
export async function completeText(input: CompletionInput): Promise<string> {
  const config = await resolveProviderConfig(input.task || 'fast', input.userId);
  const endpoint = toChatCompletionsUrl(config.baseUrl);
  const timeoutMs = input.timeoutMs ?? (Number(process.env.LLM_TIMEOUT_MS) || 90_000);
  const maxAttempts = Math.max(1, input.maxAttempts ?? 3);
  const payload: Record<string, unknown> = {
    model: config.model,
    messages: [
      { role: 'system', content: input.system },
      { role: 'user', content: input.prompt },
    ],
    stream: false,
  };
  if (config.provider === 'openai') {
    payload.max_completion_tokens = input.maxTokens ?? 1200;
    // OpenAI reasoning model不接受 temperature；普通 Chat 模型仍可使用。
    if (!/^(?:o\d|gpt-5)/i.test(config.model)) {
      payload.temperature = input.temperature ?? 0.2;
    }
  } else {
    payload.max_tokens = input.maxTokens ?? 1200;
    payload.temperature = input.temperature ?? 0.2;
  }
  if (input.jsonSchema) {
    payload.response_format = {
      type: 'json_schema',
      json_schema: {
        name: input.jsonSchema.name,
        strict: true,
        schema: input.jsonSchema.schema,
      },
    };
  } else if (input.json) {
    payload.response_format = { type: 'json_object' };
  }

  let lastError: unknown;
  let jsonModeFallback = input.jsonSchema ? 2 : input.json ? 1 : 0;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const responseText = await response.text();
        // 兼容能力较弱的服务可能只支持 json_object，甚至完全不支持
        // response_format。按 json_schema → json_object → Prompt-only 逐级降级。
        if (response.status === 400 && jsonModeFallback > 0) {
          if (jsonModeFallback === 2) {
            payload.response_format = { type: 'json_object' };
          } else {
            delete payload.response_format;
          }
          jsonModeFallback -= 1;
          continue;
        }
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt < maxAttempts - 1) {
          await delay(500 * 3 ** attempt);
          continue;
        }
        throw new LLMError(
          `${config.provider} 模型请求失败（HTTP ${response.status}）：${safeProviderMessage(responseText)}`,
          'LLM_REQUEST_FAILED'
        );
      }

      const data = (await response.json()) as {
        choices?: Array<{
          message?: { content?: string | Array<{ type?: string; text?: string }> };
        }>;
      };
      const rawContent = data.choices?.[0]?.message?.content;
      const content = Array.isArray(rawContent)
        ? rawContent.map((part) => part.text || '').join('')
        : rawContent;
      if (!content?.trim()) {
        throw new LLMError(
          `${config.provider} 返回了空内容。`,
          'LLM_INVALID_RESPONSE'
        );
      }
      return content.trim();
    } catch (error) {
      if (error instanceof LLMError) throw error;
      lastError = error;
      // 超时通常意味着当前上下文/输出规模已经超过本次请求可承受范围；
      // 原样重试只会让用户再等待一整个超时周期。
      if (isTimeoutError(error)) break;
      if (attempt < maxAttempts - 1) {
        await delay(500 * 3 ** attempt);
        continue;
      }
    }
  }

  const reason = isTimeoutError(lastError)
    ? `请求超过 ${Math.round(timeoutMs / 1000)} 秒。模型可能正在处理过长上下文或服务繁忙`
    : lastError instanceof Error
      ? lastError.message
      : String(lastError);
  throw new LLMError(
    `无法连接大模型服务：${reason}`,
    'LLM_REQUEST_FAILED'
  );
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (
    error.name === 'TimeoutError' ||
    error.name === 'AbortError' ||
    /aborted due to timeout|timed?\s*out/i.test(error.message)
  );
}

/** 各 provider 的默认 Base URL（用户在设置中未填时使用） */
export const PROVIDER_DEFAULT_BASE_URL: Record<string, string> = {
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com',
  ollama: 'http://localhost:11434/v1',
  compatible: '',
};

/** 个别 provider 有合理的默认模型名（其余必须显式填写） */
const PROVIDER_DEFAULT_MODEL: Record<string, string> = {
  zhipu: 'glm-4-flash',
  gemini: 'gemini-3.5-flash-lite',
};

/**
 * 配置解析（两级优先级）：
 *   用户在「设置」中保存的 LLM 配置（DB，per-user） > env 部署级默认
 * 用户配置存在但不完整时直接报错（不静默回退 env），便于用户发现配置问题。
 */
export async function resolveProviderConfig(
  task: LLMTask,
  userId?: string
): Promise<ProviderConfig> {
  if (userId) {
    const row = await prisma.llmSetting
      .findUnique({ where: { userId } })
      .catch(() => null);
    if (row) {
      const model =
        (task === 'main' ? row.modelMain : row.modelFast) ||
        row.modelMain ||
        row.modelFast ||
        PROVIDER_DEFAULT_MODEL[row.provider] ||
        '';
      const apiKey = row.apiKeyEnc ? decryptString(row.apiKeyEnc) : undefined;
      return requireConfig({
        provider: row.provider,
        apiKey,
        baseUrl: row.baseUrl || PROVIDER_DEFAULT_BASE_URL[row.provider] || '',
        model,
      });
    }
  }
  return getProviderConfig(task);
}

function getProviderConfig(task: LLMTask): ProviderConfig {
  const inferredProvider = process.env.ZHIPU_API_KEY
    ? 'zhipu'
    : process.env.GEMINI_API_KEY
      ? 'gemini'
      : process.env.DEEPSEEK_API_KEY
        ? 'deepseek'
        : process.env.OPENAI_API_KEY
          ? 'openai'
          : process.env.OLLAMA_BASE_URL
            ? 'ollama'
            : '';
  const provider = (process.env.LLM_PROVIDER || inferredProvider).toLowerCase();

  if (provider === 'zhipu') {
    return requireConfig({
      provider,
      apiKey: process.env.ZHIPU_API_KEY,
      baseUrl:
        process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
      model:
        (task === 'main' ? process.env.ZHIPU_MODEL_MAIN : process.env.ZHIPU_MODEL_FAST) ||
        process.env.ZHIPU_MODEL_MAIN ||
        process.env.ZHIPU_MODEL_FAST ||
        process.env.ZHIPU_MODEL ||
        'glm-4-flash',
    });
  }

  if (provider === 'gemini') {
    return requireConfig({
      provider,
      apiKey: process.env.GEMINI_API_KEY,
      baseUrl:
        process.env.GEMINI_BASE_URL ||
        'https://generativelanguage.googleapis.com/v1beta/openai',
      model:
        (task === 'main' ? process.env.GEMINI_MODEL_MAIN : process.env.GEMINI_MODEL_FAST) ||
        process.env.GEMINI_MODEL_MAIN ||
        process.env.GEMINI_MODEL_FAST ||
        'gemini-3.5-flash-lite',
    });
  }

  if (provider === 'openai') {
    return requireConfig({
      provider,
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      model:
        (task === 'main' ? process.env.OPENAI_MODEL_MAIN : process.env.OPENAI_MODEL_FAST) ||
        process.env.OPENAI_MODEL_MAIN ||
        process.env.OPENAI_MODEL_FAST ||
        '',
    });
  }

  if (provider === 'deepseek') {
    return requireConfig({
      provider,
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      model: process.env.DEEPSEEK_MODEL || '',
    });
  }

  if (provider === 'ollama') {
    return requireConfig({
      provider,
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
      model: process.env.OLLAMA_MODEL || '',
    });
  }

  if (provider === 'compatible') {
    return requireConfig({
      provider,
      apiKey: process.env.LLM_API_KEY,
      baseUrl: process.env.LLM_BASE_URL || '',
      model:
        (task === 'main' ? process.env.LLM_MODEL_MAIN : process.env.LLM_MODEL_FAST) ||
        process.env.LLM_MODEL ||
        '',
    });
  }

  throw new LLMError(
    '尚未配置大模型。请点右上角 ⚙️ 设置，填入你的大模型 API Key（或由管理员在 env 配置默认 Key）。',
    'LLM_NOT_CONFIGURED',
    503
  );
}

function requireConfig(config: ProviderConfig): ProviderConfig {
  const keyRequired = config.provider !== 'ollama';
  if (!config.baseUrl || !config.model || (keyRequired && !config.apiKey)) {
    throw new LLMError(
      `大模型 ${config.provider} 配置不完整，请检查 API Key、Base URL 和模型名。`,
      'LLM_NOT_CONFIGURED',
      503
    );
  }
  return config;
}

function toChatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  return normalized.endsWith('/chat/completions')
    ? normalized
    : `${normalized}/chat/completions`;
}

function safeProviderMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string }; message?: string };
    return (parsed.error?.message || parsed.message || '未知错误').slice(0, 300);
  } catch {
    return raw.replace(/\s+/g, ' ').slice(0, 300) || '未知错误';
  }
}

/** 连通性测试：用给定配置真实调一次最小补全（ping），供保存前校验 */
export async function testProviderConfig(config: ProviderConfig): Promise<{
  ok: boolean;
  message: string;
  latencyMs: number;
}> {
  const start = Date.now();
  try {
    const endpoint = toChatCompletionsUrl(config.baseUrl);
    const payload: Record<string, unknown> = {
      model: config.model,
      messages: [{ role: 'user', content: 'ping' }],
      temperature: 0,
    };
    if (config.provider === 'openai') {
      payload.max_completion_tokens = 8;
    } else {
      payload.max_tokens = 8;
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    const latencyMs = Date.now() - start;
    if (!response.ok) {
      const text = await response.text();
      return {
        ok: false,
        message: `HTTP ${response.status}：${safeProviderMessage(text)}`,
        latencyMs,
      };
    }
    return { ok: true, message: '连接成功', latencyMs };
  } catch (e) {
    return {
      ok: false,
      message: (e as Error).message,
      latencyMs: Date.now() - start,
    };
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
