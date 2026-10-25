/* 副本截图 / 测数用的浏览器外壳：横屏手机尺寸打开 ?debug 的游戏，读入存档，跑场景脚本（export default async (pg, shot) => {...}）。
   先打包并开个本地网页：node build.mjs /tmp/b && (cd /tmp/b && python3 -m http.server 8794 &)
   再跑：SAVE=存档.json SCRIPT=tools/test/s_tox_spawn.mjs O=/tmp/shots node tools/test/fbrun.mjs
   - WH='[667,375]' 换屏宽；CHROME=浏览器路径（不给就用 playwright 自带的）；页面报错会列在最后（没有就是 no errors）
   - 存档别提交进仓库 */
import { chromium } from 'playwright';
import fs from 'fs'; import path from 'path';
if (!process.env.SAVE || !process.env.SCRIPT) { console.log('用法：SAVE=存档.json SCRIPT=场景脚本.mjs [O=截图目录] [WH=[844,390]] [PORT=8794] node tools/test/fbrun.mjs'); process.exit(1) }
const save = fs.readFileSync(process.env.SAVE, 'utf8');
const O = process.env.O || '/tmp/shots'; fs.mkdirSync(O, { recursive: true });
const [W, H] = JSON.parse(process.env.WH || '[844,390]');
const br = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const ctx = await br.newContext({ viewport:{width:W,height:H}, deviceScaleFactor:2, isMobile:true, hasTouch:true, ...(process.env.VID ? { recordVideo: { dir: process.env.VID, size: { width: W, height: H } } } : {}) });
await ctx.addInitScript(s => { if(!sessionStorage.getItem('x')){ localStorage.clear(); localStorage.setItem('ms_save_local', s); sessionStorage.setItem('x',1) } }, save);
const pg = await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('console', m => { if (m.type()==='error') errs.push('c:'+m.text()) });
const mod = await import(path.resolve(process.env.SCRIPT)); if (mod.pre) await mod.pre(pg);
await pg.goto('http://localhost:' + (process.env.PORT || 8794) + '/?debug'); await pg.waitForFunction(()=>window.__g&&__g.S,null,{timeout:180000}); await pg.waitForTimeout(5000);
const shot = async n => { try { await pg.screenshot({ path: `${O}/${n}.png`, timeout: 60000 }); console.log('shot', n) } catch (e) { console.log('SHOTFAIL', n, e.message.slice(0, 200)) } };
const step = process.env.STEP || 'all';
globalThis.pg = pg; globalThis.shot = shot; globalThis.O = O;
await mod.default(pg, shot);
console.log(errs.join('\n') || 'no errors'); if (process.env.VID) { const v = pg.video(); await ctx.close(); console.log('VIDEO', await v.path()) } await br.close();
