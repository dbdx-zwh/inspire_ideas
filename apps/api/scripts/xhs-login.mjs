/**
 * XHS 登录辅助脚本
 * ----------------------------------------
 * 用途：一次性给爬虫的 Chrome 用户目录登录 XHS。登录完成后所有爬取
 *      都会自动带上登录态。
 *
 * 使用方式：
 *   cd apps/api
 *   npm run xhs:login
 *
 * 步骤：
 *   1. 会弹出一个 Chrome 窗口，自动打开 xhs 首页
 *   2. 你手动登录（扫码或手机号）
 *   3. 登录成功后，回到终端按 Ctrl+C
 *   4. 登录状态保存在 apps/api/.crawler-profile/ 里，永久有效（直到 cookie 过期）
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const userDataDir = path.resolve(__dirname, '..', '.crawler-profile');
fs.mkdirSync(userDataDir, { recursive: true });

console.log('');
console.log('==========================================================');
console.log('  🍅 小红书爬虫登录窗口');
console.log('==========================================================');
console.log(`  用户目录: ${userDataDir}`);
console.log('  即将打开 Chrome，请在窗口里登录你的 XHS 账号');
console.log('  登录完成后回到此终端，按 Ctrl+C 关闭');
console.log('==========================================================');
console.log('');

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  channel: 'chrome',
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  ignoreDefaultArgs: ['--enable-automation'],
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
  ],
});

// 用已有 page 或新开
const page = context.pages()[0] || (await context.newPage());

try {
  // 用 location.href 模拟用户导航（比 page.goto 更能过 XHS 反爬）
  await Promise.all([
    page.waitForURL(/xiaohongshu\.com/, {
      waitUntil: 'commit',
      timeout: 30_000,
    }),
    page.evaluate(() => {
      window.location.href = 'https://www.xiaohongshu.com/';
    }),
  ]);
  console.log('✅ XHS 首页已打开，请在浏览器窗口里扫码或手机号登录');
} catch (e) {
  console.error(`⚠️ 自动打开失败：${e.message}`);
  console.error('   请在浏览器地址栏手动输入 https://www.xiaohongshu.com/');
  console.error('   (窗口不会关闭，你可以慢慢来)');
}

console.log('');
console.log('登录完成后，请按 Ctrl+C 关闭此脚本');
console.log('(浏览器窗口关闭也会导致脚本退出)');
console.log('');

// 检测浏览器窗口关闭
context.on('close', () => {
  console.log('\n🔒 浏览器窗口已关闭，登录状态已持久化');
  process.exit(0);
});

// 保持进程活着
await new Promise(() => {});
