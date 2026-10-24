import { chromium } from '/home/claude/moshi/node_modules/playwright/index.mjs';
const [,, url, out] = process.argv;
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const pg = await br.newPage({ viewport: { width: 1000, height: 1000 } }); pg.on('pageerror', e => console.log('ERR', e.message)); pg.on('console', m => console.log('LOG', m.text()));
await pg.goto('http://localhost:8770/v.html?' + url); await pg.waitForFunction(() => window.done, null, { timeout: 100000 });
await pg.screenshot({ path: out }); await br.close();
