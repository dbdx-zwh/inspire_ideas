/**
 * MSW 流式响应辅助
 * ----------------------------------------
 * 用真正的 ReadableStream 模拟 SSE，让前端的 useStreamingResource
 * 与最终真实后端行为完全一致。
 */

const encoder = new TextEncoder();

function serializeEvent(type: 'start' | 'delta' | 'end' | 'error', data?: unknown): Uint8Array {
  const payload = JSON.stringify({ type, data });
  return encoder.encode(`data: ${payload}\n\n`);
}

/** 逐 token 流式返回文本，模拟 LLM 逐字生成 */
export function streamText(text: string, chunkSize = 8, intervalMs = 40): Response {
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(serializeEvent('start'));
      for (let i = 0; i < text.length; i += chunkSize) {
        const chunk = text.slice(i, i + chunkSize);
        controller.enqueue(serializeEvent('delta', chunk));
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      controller.enqueue(serializeEvent('end'));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}

/** 逐字段流式返回结构化 JSON */
export function streamJson(
  fields: Array<{ key: string; value: unknown; delayMs?: number }>
): Response {
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(serializeEvent('start'));
      for (const f of fields) {
        await new Promise((r) => setTimeout(r, f.delayMs ?? 300));
        controller.enqueue(serializeEvent('delta', { [f.key]: f.value }));
      }
      controller.enqueue(serializeEvent('end'));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
