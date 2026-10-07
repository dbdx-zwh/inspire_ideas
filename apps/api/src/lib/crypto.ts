/**
 * 敏感凭证加解密（AES-256-GCM）
 * ----------------------------------------
 * 用途：爬虫登录态（Playwright storageState，等价于用户密码）落库前加密。
 *
 * 密钥来源：环境变量 CREDENTIAL_ENCRYPTION_KEY（64 位十六进制 = 32 字节）。
 * 生成方式：node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * - 生产环境未配置密钥时直接抛错（不允许弱默认值）
 * - 开发环境用固定派生 key，方便本地调试（密文不可跨密钥解读）
 * - 密文格式：iv.authTag.cipher（均为 hex），自包含可独立解密
 */

import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // GCM 推荐 96-bit IV

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const hex = process.env.CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (hex && /^[0-9a-f]{64}$/i.test(hex)) {
    cachedKey = Buffer.from(hex, 'hex');
    return cachedKey;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'CREDENTIAL_ENCRYPTION_KEY 未配置或格式非法（需要 64 位十六进制字符串）。生产环境拒绝使用默认密钥。'
    );
  }

  // 开发环境兜底：固定字符串派生，避免每次改代码都要配 key
  console.warn(
    '[Crypto] CREDENTIAL_ENCRYPTION_KEY 未配置，使用开发环境默认派生密钥（请勿用于生产）'
  );
  cachedKey = crypto
    .createHash('sha256')
    .update('inspire-dev-credential-key')
    .digest();
  return cachedKey;
}

/** 加密字符串，返回 `iv.authTag.cipher`（hex）格式 */
export function encryptString(plain: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('hex'),
    tag.toString('hex'),
    encrypted.toString('hex'),
  ].join('.');
}

/** 解密 encryptString 产出的密文；格式非法或密钥不符时抛错 */
export function decryptString(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 3) {
    throw new Error('密文格式非法');
  }
  const [ivHex, tagHex, dataHex] = parts;
  const decipher = crypto.createDecipheriv(
    ALGO,
    getKey(),
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}
