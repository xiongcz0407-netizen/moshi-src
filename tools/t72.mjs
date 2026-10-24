/* 设计 72 检查：分解机 3 样、罐头机 / 纺织机新配方、线上在做的照旧做完 */
import fs from 'fs';
import * as L from '../src/js/logic.js';
import { GOODS, MACH } from '../src/js/config.js';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? '✓' : '✗'} ${n}${x ? '　' + x : ''}`);
const R = (k, o) => MACH[k].recipes.find(r => r.out === o);
ok('分解机 3 样、用时 × 0.8', MACH.split.tk === 0.8 && MACH.split.recipes.map(r => `${Object.keys(r.need)}→${r.out}×${r.n || 1}${r.also ? '+' + Object.keys(r.also) : ''}`).join(' ') === 'battery→cell×1+wire food→tin×4 bandage→thread×3');
ok('铁皮、棉线是原料，4 级，5 块', ['tin', 'thread'].every(g => GOODS[g].raw && GOODS[g].unlock === 4 && GOODS[g].price === 5));
ok('罐头机 3 样都要铁皮', ['fishcan', 'orangecan', 'spam'].every(o => R('can', o).need.tin === 1));
ok('毛衣、帽子要棉线；围巾、手套不变', R('loom', 'sweater').need.thread === 1 && R('loom', 'hat').need.thread === 1 && JSON.stringify(R('loom', 'scarf').need) === '{"wool":1,"fur":1}');
const raw = JSON.parse(fs.readFileSync('/mnt/user-data/uploads/末世超市/Claude outputs/xiongcz2_4ff9f6c8a226adbe4d_0.json', 'utf8'));
const o = JSON.parse(JSON.stringify(raw.data || raw)); o.lv.can = 3; o.lv.split = 3; o.lv.store = 5;
const S = L.migrate(o); for (let i = 0; i < 3; i++) { const p = L.rollStaff(S, 'n'); p.job = 'craft'; S.staff.push(p) }
const cm = L.wsOf(S, 'can'); cm.lines.forEach(l => { l.out = null; l.t = 0; l.plan = null }); cm.lines[0].out = 'fishcan'; cm.lines[0].t = 1;
S.stock.tin = 0; S.stock.fishcan = 0; const f0 = S.stock.fishcan; for (let i = 0; i < 120; i++) L.tick(S, 1);
ok('旧存档：线上在做的鱼罐头（没铁皮也）照旧做完', (S.stock.fishcan || 0) > f0, `鱼罐头 ${f0} → ${S.stock.fishcan}，铁皮 ${S.stock.tin}`);
/* 分解机 3 条线各指定一样 */
const sp = L.wsOf(S, 'split'); sp.lines.forEach(l => { l.out = null; l.t = 0 }); L.wsSetPlan(S, 'split', 'cell', 0); L.wsSetPlan(S, 'split', 'tin', 1); L.wsSetPlan(S, 'split', 'thread', 2);
S.stock.battery = 300; S.stock.food = 400; S.stock.bandage = 400; S.stock.tin = 0; S.stock.thread = 0; S.stock.cell = 0; L.tick(S, 1);
ok('分解机 3 条线各指定一样', sp.lines.slice(0, 3).map(l => l.out).join(',') === 'cell,tin,thread', sp.lines.slice(0, 3).map(l => l.out).join(','));
for (let i = 0; i < 200; i++) L.tick(S, 1);
ok('拆出来进仓库', S.stock.tin >= 3 && S.stock.thread >= 3, `铁皮 ${S.stock.tin}、棉线 ${S.stock.thread}、电芯 ${S.stock.cell}`);
/* 设计 73：V5.61 存档里正在拆的罐头照旧出 3 张，下一个出 4 张 */
{ const o2 = JSON.parse(JSON.stringify(raw.data || raw)); o2.lv.split = 3; o2.lv.store = 5; o2.ws = o2.ws || {}; o2.ws.split = { lines: [{ out: 'tin', t: 999, tk: 0.8 }, { out: null, t: 0 }, { out: null, t: 0 }], plan: null };
  const S2 = L.migrate(o2); for (let i = 0; i < 3; i++) { const p = L.rollStaff(S2, 'n'); p.job = 'craft'; S2.staff.push(p) }
  const sp2 = L.wsOf(S2, 'split'); sp2.lines.slice(1).forEach(l => { l.plan = 'cell' }); sp2.lines[0].plan = 'tin'; S2.stock.tin = 0; S2.stock.food = 400; S2.lv.split = 1;
  const seen = []; let prev = 0; for (let i = 0; i < 300 && seen.length < 2; i++) { L.tick(S2, 1); const d = (S2.stock.tin || 0) - prev; if (d > 0) seen.push(d); prev = S2.stock.tin || 0 }
  ok('旧存档：在拆的出 3 张，下一个出 4 张（没暴击时）', seen[0] % 3 === 0 && seen[1] % 4 === 0, `第 1 次 +${seen[0]}、第 2 次 +${seen[1]}`) }
console.log(res.join('\n')); console.log(res.filter(r => r[0] === '✓').length + ' / ' + res.length);
