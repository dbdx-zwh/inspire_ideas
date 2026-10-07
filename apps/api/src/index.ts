/**
 * Fastify 后端主入口
 * ----------------------------------------
 * 启动顺序：
 * 1. 加载环境变量
 * 2. 初始化 Fastify 实例
 * 3. 注册插件（CORS、Cookie、JWT、Helmet 等）
 * 4. 注册路由
 * 5. 监听端口
 */

import 'dotenv/config';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import { authRoutes } from './routes/auth.js';
import { papersRoutes } from './routes/papers.js';
import { bloggersRoutes } from './routes/bloggers.js';
import { topicsRoutes } from './routes/topics.js';
import { ideasRoutes } from './routes/ideas.js';
import { aiRoutes } from './routes/ai.js';
import { credentialsRoutes } from './routes/credentials.js';
import { settingsRoutes } from './routes/settings.js';
import { requireAuth } from './middleware/auth.js';

const PORT = parseInt(process.env.PORT || '4000', 10);
const IS_PROD = process.env.NODE_ENV === 'production';

async function main() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: IS_PROD
        ? undefined
        : { target: 'pino-pretty', options: { colorize: true } },
    },
  });

  // 插件
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: process.env.FRONTEND_ORIGIN?.split(',') || 'http://localhost:5173',
    credentials: true, // 允许携带 cookie
  });
  await app.register(cookie);
  await app.register(jwt, {
    secret: process.env.JWT_SECRET || 'dev-only-secret-please-change',
    cookie: {
      cookieName: 'inspire_auth',
      signed: false,
    },
  });
  await app.register(sensible);

  // 装饰：为路由添加 requireAuth
  app.decorate('requireAuth', requireAuth);

  // 健康检查
  app.get('/health', async () => ({ status: 'ok', ts: Date.now() }));

  // 路由
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(papersRoutes, { prefix: '/api' });
  await app.register(bloggersRoutes, { prefix: '/api' });
  await app.register(topicsRoutes, { prefix: '/api' });
  await app.register(ideasRoutes, { prefix: '/api' });
  await app.register(aiRoutes, { prefix: '/api' });
  await app.register(credentialsRoutes, { prefix: '/api' });
  await app.register(settingsRoutes, { prefix: '/api' });

  // 全局错误处理
  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      code: (error as { code?: string }).code || 'INTERNAL_ERROR',
      message: error.message || '服务器内部错误',
    });
  });

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    app.log.info(`🚀 Inspire API listening on http://localhost:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
