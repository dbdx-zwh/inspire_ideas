import type { FastifyPluginAsync } from 'fastify';
import argon2 from 'argon2';
import { prisma } from '../prisma.js';
import {
  LoginRequestSchema,
  RegisterRequestSchema,
} from '@shared/schemas/auth';

const IS_PROD = process.env.NODE_ENV === 'production';
const COOKIE_NAME = 'inspire_auth';

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/register', async (request, reply) => {
    const body = RegisterRequestSchema.parse(request.body);
    const existing = await prisma.user.findUnique({
      where: { email: body.email },
    });
    if (existing) {
      return reply.badRequest('该邮箱已注册');
    }
    const passwordHash = await argon2.hash(body.password);
    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash,
      },
    });
    const token = app.jwt.sign({ userId: user.id }, { expiresIn: '30d' });
    setAuthCookie(reply, token);
    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt.toISOString(),
      },
    });
  });

  app.post('/login', async (request, reply) => {
    const body = LoginRequestSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) return reply.badRequest('邮箱或密码错误');
    const ok = await argon2.verify(user.passwordHash, body.password);
    if (!ok) return reply.badRequest('邮箱或密码错误');
    const token = app.jwt.sign({ userId: user.id }, { expiresIn: '30d' });
    setAuthCookie(reply, token);
    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt.toISOString(),
      },
    });
  });

  app.post('/logout', async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return reply.send({ ok: true });
  });

  app.get('/me', { preHandler: app.requireAuth }, async (request) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: request.userId! },
    });
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt.toISOString(),
      },
    };
  });
};

function setAuthCookie(reply: import('fastify').FastifyReply, token: string) {
  reply.setCookie(COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60,
  });
}
