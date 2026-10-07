/**
 * 爬虫登录态（Credential）路由
 * ----------------------------------------
 * 产品内扫码绑定小红书账号：
 *
 *   GET    /credentials                          我的登录态列表（不含敏感内容）
 *   POST   /credentials/xiaohongshu/login        启动扫码会话（幂等）
 *   GET    /credentials/xiaohongshu/login/stream SSE 推页面截图帧 + 终态事件
 *   POST   /credentials/xiaohongshu/login/cancel 取消进行中的会话
 *   DELETE /credentials/xiaohongshu              解绑（删除凭证）
 *
 * SSE 事件约定（沿用全局 sse.ts 协议）：
 *   delta → { image: <jpeg base64> }   每 ~1.5s 一帧
 *   end   → { status, nickname?, message? }  终态：success/timeout/error/canceled
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { beginSSE, endSSE, sendEvent } from '../lib/sse.js';
import {
  cancelLoginSession,
  captureSessionScreenshot,
  clickInSession,
  getLoginSession,
  reloadSessionPage,
  startLoginSession,
} from '../lib/xhsLoginSession.js';

const FRAME_INTERVAL_MS = 1_500;

export const credentialsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  // ---------- GET /credentials ----------
  app.get('/credentials', async (request) => {
    const rows = await prisma.crawlerCredential.findMany({
      where: { userId: request.userId },
    });
    return rows.map((r) => ({
      platform: r.platform,
      status: r.status,
      nickname: r.nickname,
      lastVerifiedAt: r.lastVerifiedAt.toISOString(),
    }));
  });

  // ---------- POST /credentials/xiaohongshu/login ----------
  app.post('/credentials/xiaohongshu/login', async (request, reply) => {
    try {
      const session = await startLoginSession(request.userId!);
      return { status: session.status };
    } catch (e) {
      return reply.status(429).send({
        code: 'LOGIN_SESSION_BUSY',
        message: (e as Error).message || '登录请求过多，请稍后再试',
      });
    }
  });

  // ---------- GET /credentials/xiaohongshu/login/stream ----------
  app.get('/credentials/xiaohongshu/login/stream', async (request, reply) => {
    const userId = request.userId!;
    const session = getLoginSession(userId);

    beginSSE(reply);
    sendEvent(reply, 'start');

    if (!session) {
      endSSE(reply, {
        status: 'error',
        message: '登录会话不存在或已结束，请重新发起扫码',
      });
      return;
    }

    // 客户端断开只停止推流；登录会话本身继续（用户可能重新打开弹窗接上）
    let clientGone = false;
    request.raw.on('close', () => {
      clientGone = true;
    });

    while (!clientGone) {
      if (session.status !== 'pending') {
        endSSE(reply, {
          status: session.status,
          nickname: session.nickname,
          message: session.error,
        });
        return;
      }
      const frame = await captureSessionScreenshot(session);
      if (clientGone) break;
      if (frame) {
        sendEvent(reply, 'delta', { image: frame });
      } else {
        // 心跳：无新帧也定期发包，防止连接被中间层按空闲掐断，
        // 同时喂给前端看门狗（流死亡可检测）
        sendEvent(reply, 'delta', { heartbeat: true });
      }
      await new Promise((r) => setTimeout(r, FRAME_INTERVAL_MS));
    }

    // 客户端已断开，直接收尾（不再写事件）
    reply.raw.end();
  });

  // ---------- POST /credentials/xiaohongshu/login/click ----------
  // 前端画面点击转发：body 为页面 viewport 坐标（1440x900）
  app.post('/credentials/xiaohongshu/login/click', async (request, reply) => {
    const body = z
      .object({ x: z.number().min(0), y: z.number().min(0) })
      .parse(request.body);
    const ok = await clickInSession(request.userId!, body.x, body.y);
    if (!ok) {
      return reply.status(409).send({
        code: 'LOGIN_SESSION_ENDED',
        message: '登录会话已结束，请关闭弹窗重新发起扫码',
      });
    }
    return reply.status(204).send();
  });

  // ---------- POST /credentials/xiaohongshu/login/reload ----------
  // 刷新登录页面并重新弹登录框（二维码异常时的自助恢复）
  app.post('/credentials/xiaohongshu/login/reload', async (request, reply) => {
    const ok = await reloadSessionPage(request.userId!);
    if (!ok) {
      return reply.status(409).send({
        code: 'LOGIN_SESSION_ENDED',
        message: '登录会话已结束，请关闭弹窗重新发起扫码',
      });
    }
    return reply.status(204).send();
  });

  // ---------- POST /credentials/xiaohongshu/login/cancel ----------
  app.post('/credentials/xiaohongshu/login/cancel', async (request, reply) => {
    await cancelLoginSession(request.userId!);
    return reply.status(204).send();
  });

  // ---------- DELETE /credentials/xiaohongshu ----------
  app.delete('/credentials/xiaohongshu', async (request, reply) => {
    await prisma.crawlerCredential.deleteMany({
      where: { userId: request.userId, platform: 'xiaohongshu' },
    });
    return reply.status(204).send();
  });
};
