/**
 * SSE 辅助工具
 * ----------------------------------------
 * 用 reply.raw 时绕过了 @fastify/cors 的响应头，需要手动补充 CORS 头，
 * 否则浏览器跨源请求会被拦截。
 */

import type { FastifyReply } from 'fastify';

export type StreamEventType = 'start' | 'delta' | 'end' | 'error';

export function beginSSE(reply: FastifyReply) {
  // Fastify hijack：告诉 Fastify 不要再管这个响应
  reply.hijack();

  const req = reply.request;
  const origin = (req.headers.origin as string) || '*';

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    // 手动补 CORS 头（因为 hijack 绕过了 cors 插件）
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  });
  // 立即刷一次头，避免代理缓冲
  if (typeof (reply.raw as unknown as { flushHeaders?: () => void }).flushHeaders === 'function') {
    (reply.raw as unknown as { flushHeaders: () => void }).flushHeaders();
  }
}

export function sendEvent(
  reply: FastifyReply,
  type: StreamEventType,
  data?: unknown
) {
  const payload = JSON.stringify({ type, data });
  reply.raw.write(`data: ${payload}\n\n`);
}

export function endSSE(reply: FastifyReply, finalData?: unknown) {
  sendEvent(reply, 'end', finalData);
  reply.raw.end();
}

/** 逐 token 流式返回文本 */
export async function streamTextResponse(
  reply: FastifyReply,
  text: string,
  chunkSize = 6,
  intervalMs = 30
) {
  beginSSE(reply);
  sendEvent(reply, 'start');
  for (let i = 0; i < text.length; i += chunkSize) {
    const chunk = text.slice(i, i + chunkSize);
    sendEvent(reply, 'delta', chunk);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  endSSE(reply);
}
