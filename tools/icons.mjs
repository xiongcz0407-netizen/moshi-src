/* 生成物品图标：node tools/icons.mjs  →  src/img/icons/<种类>_<id>.png
   用游戏里同一套 3D 模型渲染，图标和场景里的东西长得一样。 */
import { build } from 'esbuild'; import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = '/tmp/iconpage'; fs.mkdirSync(tmp, { recursive: true });
await build({ entryPoints: [path.join(ROOT, 'tools/iconpage/entry.js')], bundle: true, format: 'iife', outfile: path.join(tmp, 'icons.js') });
fs.writeFileSync(path.join(tmp, 'index.html'), '<!doctype html><body style="margin:0;background:#0000"><script src="/icons.js"></script>');
const srv = http.createServer((q, s) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = u.startsWith('/src/') ? path.join(ROOT, u) : path.join(tmp, u === '/' ? 'index.html' : u);
  fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); return } s.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); s.end(d) }) }).listen(8790);
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const pg = await br.newPage(); pg.on('pageerror', e => console.log('err', e.message)); pg.on('console', m => console.log(m.text()));
await pg.goto('http://localhost:8790/'); const out = await pg.evaluate(() => window.renderIcons());
const dir = path.join(ROOT, 'src/img/icons'); fs.mkdirSync(dir, { recursive: true });
for (const [k, v] of Object.entries(out)) fs.writeFileSync(path.join(dir, k + '.png'), Buffer.from(v.split(',')[1], 'base64'));
console.log('图标', Object.keys(out).length, '个 →', dir); await br.close(); srv.close();
