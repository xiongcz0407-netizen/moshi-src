/* 自测：iPhone 横屏尺寸打开游戏，按脚本走动、截图、收集报错。
   用法：node tools/shot.mjs [网址]  截图在 /tmp/shots/ */
import { chromium } from 'playwright';
import fs from 'fs';
const URL = process.argv[2] || 'http://localhost:8765/';
fs.mkdirSync('/tmp/shots', { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()) });
await page.goto(URL); await page.waitForTimeout(2500);
const shot = async n => { await page.screenshot({ path: `/tmp/shots/${n}.png` }); console.log('shot', n) };
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key) };
await shot('01_start');
const steps = JSON.parse(process.env.STEPS || '[]');
for (const s of steps) {
  if (s.k) await hold(s.k, s.ms);
  if (s.waitFor) await page.waitForSelector(s.waitFor, { timeout: 20000 });
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.click) await page.click(s.click);
  if (s.eval) console.log('eval', JSON.stringify(await page.evaluate(s.eval)));
  if (s.shot) await shot(s.shot);
}
console.log(errs.length ? errs.join('\n') : '没有报错');
await browser.close();
