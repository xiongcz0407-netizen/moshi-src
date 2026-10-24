/* 设计 70 检查：配方、新商品、猪产量、工坊往南扩后盖厨房 2（别的机器不动） */
import * as L from '../src/js/logic.js';
import { fixWs, wsProblem, WG, WS_DEF } from '../src/js/layout.js';
import { GOODS, MACH, DISHES, RANCH, FEED, canHold } from '../src/js/config.js';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? '✓' : '✗'} ${n}${x ? '　' + x : ''}`);
const rc = (k, o) => JSON.stringify(MACH[k].recipes.find(r => r.out === o).need);
ok('冰淇淋 = 牛奶', rc('cheese', 'icecream') === '{"milk":1}');
ok('冰棍 = 橙子 + 水', rc('sweet', 'popsicle') === '{"orange":1,"water":1}');
ok('南瓜汤 / 肉松饭 / 萝卜炖肉', JSON.stringify([DISHES.pumpsoup, DISHES.flossrice, DISHES.stew]) === '[{"pumpkin":1,"carrot":1,"truffle":1},{"floss":1,"truffle":1,"corn":1},{"pork":1,"radish":1,"eggplant":1}]');
ok('围巾、手套 = 羊毛 + 兔毛', rc('loom', 'scarf') === '{"wool":1,"fur":1}' && rc('loom', 'gloves') === '{"wool":1,"fur":1}');
ok('蛋品机 3 样、果酱锅 3 样', MACH.mayo.recipes.map(r => GOODS[r.out].name).join('、') + ' / ' + MACH.jam.recipes.map(r => GOODS[r.out].name).join('、') === '蛋黄酱、皮蛋、松茸蒸蛋 / 苹果酱、橙汁、番茄酱');
ok('新商品等级；皮蛋、番茄酱放普通货架，松茸蒸蛋只放熟食柜（设计 71）', [['pidan', 4], ['mushegg', 5], ['ketchup', 3]].every(([g, lv]) => GOODS[g].unlock === lv && (g === 'mushegg' ? GOODS[g].only === 'deli' && canHold('deli', g) && !canHold('shelf', g) : !GOODS[g].only) && GOODS[g].w === 0.4), ['pidan', 'mushegg', 'ketchup'].map(g => `${GOODS[g].name} ${GOODS[g].price}`).join('、'));
ok('猪每只每批 7 个', RANCH.pig.yield === 7);
/* 每样原料用几次（工坊 + 厨房 + 喂动物） */
const use = {}; const add = (g, w) => (use[g] = use[g] || []).push(w);
for (const [k, m] of Object.entries(MACH)) for (const r of m.recipes) for (const g of Object.keys(r.need)) add(g, GOODS[r.out].name);
for (const [d, n] of Object.entries(DISHES)) for (const g of Object.keys(n)) add(g, GOODS[d].name);
for (const [a, g] of Object.entries(FEED.diet)) add(g, '喂' + RANCH[a].name);
const RAWS = ['radish', 'cabbage', 'tomato', 'carrot', 'eggplant', 'corn', 'pumpkin', 'truffle', 'apple', 'orange', 'milk', 'egg', 'pork', 'duckegg', 'fur', 'wool', 'water', 'fish'];
ok('每样原料至少用 3 次', RAWS.every(g => (use[g] || []).length >= 3), RAWS.map(g => `${GOODS[g].name} ${(use[g] || []).length}`).join('、'));
/* 工坊：没挪过机器的存档（V4.91 以前的默认摆法，12 台），盖厨房 2 */
const OLD = { kitchen: { c: 1, r: 3, rot: 0 }, mayo: { c: 6, r: 3, rot: 0 }, pickle: { c: 11, r: 3, rot: 0 }, jam: { c: 16, r: 3, rot: 0 }, smoke: { c: 1, r: 8, rot: 0 }, loom: { c: 6, r: 8, rot: 0 }, cheese: { c: 11, r: 8, rot: 0 }, wood: { c: 16, r: 8, rot: 0 }, sweet: { c: 1, r: 13, rot: 0 }, split: { c: 6, r: 13, rot: 0 }, can: { c: 11, r: 13, rot: 0 }, dry: { c: 16, r: 13, rot: 0 } };
const S = { lv: {}, fix: { wsV: 6, ws: Object.entries(OLD).map(([k, p]) => ({ k, ...p })) } };
for (const k of Object.keys(OLD)) S.lv[k] = 3;
ok('旧摆法本身没问题', !wsProblem(S.fix.ws));
const before = JSON.stringify(S.fix.ws);
S.lv.kitchen2 = 1; fixWs(S);
const k2 = S.fix.ws.find(w => w.k === 'kitchen2'), rest = JSON.stringify(S.fix.ws.filter(w => w.k !== 'kitchen2'));
ok('盖了厨房 2：放得下，别的 12 台一台没动', k2 && rest === before && !wsProblem(S.fix.ws), k2 ? `厨房 2 在 第 ${k2.c} 列 第 ${k2.r} 行（原来最南是第 16 行），朝向 ${k2.rot}` : '没放进去');
ok('工坊网格起点没动，21 行', WG.x0 === -30.8 && WG.z0 === 3.0 && WG.rows === 21);
/* 新存档默认摆法：13 台都放得下 */
const S2 = { lv: {}, fix: { wsV: 6, ws: [] } }; for (const k of Object.keys(WS_DEF)) S2.lv[k] = 1; fixWs(S2);
ok('新存档 13 台照 68a 默认摆法', S2.fix.ws.length === 13 && S2.fix.ws.every(w => w.c === WS_DEF[w.k].c && w.r === WS_DEF[w.k].r));
/* 设计 71：旧存档普通货架上的松茸蒸蛋退回仓库 */
{ const fs = await import('fs'); const raw = JSON.parse(fs.readFileSync('/mnt/user-data/uploads/末世超市/Claude outputs/xiongcz2_4ff9f6c8a226adbe4d_0.json', 'utf8')); const o = JSON.parse(JSON.stringify(raw.data || raw));
  const sh = o.shelves.find(s => s.type === 'shelf'); sh.g = 'mushegg'; sh.n = 7; o.lv.store = 5; o.lv.mayo = Math.max(o.lv.mayo || 0, 1); const st0 = o.stock.mushegg || 0; const S3 = L.migrate(o); const sh3 = S3.shelves[o.shelves.indexOf(sh)];
  ok('旧存档：普通货架上的松茸蒸蛋退回仓库、那格变空', sh3.g == null && (S3.stock.mushegg || 0) === st0 + 7, `仓库 ${st0} → ${S3.stock.mushegg}`) }
console.log(res.join('\n')); console.log(res.filter(r => r[0] === '✓').length + ' / ' + res.length);
