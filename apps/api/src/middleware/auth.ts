import type { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string };
    user: { userId: string };
  }
}

/** 身份验证中间件 · 用于需要登录的路由 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // 从 httpOnly cookie 解析 JWT
    await request.jwtVerify();
    request.userId = request.user.userId;
  } catch {
    return reply.status(401).send({
      code: 'UNAUTHORIZED',
      message: '请先登录',
    });
  }
}
