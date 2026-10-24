import fs from 'fs';
import * as L from '../src/js/logic.js';
import { BUILD, STAFF, WS } from '../src/js/config.js';
const raw = JSON.parse(fs.readFileSync('/mnt/user-data/uploads/末世超市/Claude outputs/xiongcz2_4ff9f6c8a226adbe4d_0.json', 'utf8'));
const res = []; const ok = (n, c, x = '') => res.push(`${c ? '✓' : '✗'} ${n}${x ? '　' + x : ''}`);
const fresh = (lv3) => { const o = JSON.parse(JSON.stringify(raw.data || raw)); if (lv3) { o.lv.kitchen = 3; o.lv.wood = 3; o.lv.loom = 3 } o.lv.can = o.lv.can || 3; const S = L.migrate(o); for (let i = 0; i < 3; i++) { const p = L.rollStaff(S, 'n'); p.job = 'craft'; S.staff.push(p) } for (const p of S.staff) p.fed = true; S.staffDay = '9999'; return S };
let S = fresh();
ok('读档：store ' + S.lv.store, true, `厨房 ${S.lv.kitchen} 级 ${L.wsLines(S, 'kitchen')} 条线、木工台 ${S.lv.wood} 级 ${L.wsLines(S, 'wood')} 条、纺织机 ${S.lv.loom} 级 ${L.wsLines(S, 'loom')} 条、熏炉 ${S.lv.smoke} 级 ${L.wsLines(S, 'smoke')} 条`);
ok('三台 3 级 4 条线，其他 3 条', [1,2,3].map(l => { S.lv.kitchen = l; S.lv.wood = l; S.lv.loom = l; S.lv.smoke = l; return [L.wsLines(S, 'kitchen'), L.wsLines(S, 'wood'), L.wsLines(S, 'loom'), L.wsLines(S, 'smoke')].join('/') }).join(' ') === '1/1/1/1 2/2/2/2 4/4/4/3');
S = fresh(true); ok('旧存档 3 级读进来多一条空线', L.wsOf(S, 'kitchen').lines.length >= 4 && !L.wsOf(S, 'kitchen').lines[3].out && L.wsOf(S, 'kitchen').lines[3].plan == null, `厨房 ${L.wsOf(S, 'kitchen').lines.length} 条、木工台 ${L.wsOf(S, 'wood').lines.length} 条、纺织机 ${L.wsOf(S, 'loom').lines.length} 条`);
ok('厨房 2 要超市 5 级', BUILD.kitchen2.levels[1].store === 5);
ok('普通 / 精英 / 史诗 / 传说管 4 / 4 / 5 / 6', ['n', 'e', 'p', 'l'].map(q => L.manageN({ q })).join('/') === '4/4/5/6');
ok('员工没有受伤 / 疗伤状态，旧血量清掉', S.staff.every(p => p.hp === undefined && p.heal === undefined && ['work', 'rest', 'hungry'].includes(L.staffState(S, p))));
/* 指定 */
const run = (S, sec) => { for (let i = 0; i < sec; i++) L.tick(S, 1) };
S = fresh(); const sm = L.wsOf(S, 'smoke'); sm.lines.forEach(l => { l.out = null; l.t = 0 }); L.wsSetPlan(S, 'smoke', 'bacon', 0); L.wsSetPlan(S, 'smoke', 'bacon', 1); L.wsSetPlan(S, 'smoke', 'bacon', 2);
S.stock.pork = 200; S.stock.bacon = 0; run(S, 1);
ok('指定腊肉、有猪肉 → 做腊肉', sm.lines.slice(0, 3).every(l => l.out === 'bacon'), sm.lines.slice(0, 3).map(l => l.out).join(','));
sm.lines.forEach(l => { l.out = null; l.t = 0 }); S.stock.pork = 0; S.stock.fish = 500; S.stock.smoked = 0; run(S, 1);
const w0 = L.wsWhy(S, 'smoke');
ok('没猪肉 → 等着、不做熏鱼', sm.lines.slice(0, 3).every(l => !l.out), `线上：${w0.lines[0]}　头顶：${w0.short}`);
S.stock.pork = 100; run(S, 1);
ok('猪肉来了 → 自动开工', sm.lines.slice(0, 3).every(l => l.out === 'bacon'), sm.lines.slice(0, 3).map(l => l.out).join(','));
sm.lines.forEach(l => { l.out = null; l.t = 0 }); S.stock.pork = 500; S.stock.bacon = L.wsEnough(S) + 2; run(S, 1);
const w1 = L.wsWhy(S, 'smoke');
ok('到停手线 → 等着', sm.lines.slice(0, 3).every(l => !l.out), `线上：${w1.lines[0]}　头顶：${w1.short}`);
/* 抢猪肉：熏炉线 1 指定腊肉（腊肉少），罐头机线 1 指定午餐肉（午餐肉多）；猪肉 < 60 */
S = fresh(); for (const k of ['smoke', 'can', 'kitchen']) L.wsOf(S, k).lines.forEach(l => { l.out = null; l.t = 0; l.plan = null; l.waitT = 0 });
L.wsSetPlan(S, 'smoke', 'bacon'); L.wsSetPlan(S, 'can', 'spam');
S.stock.bacon = 5; S.stock.floss = 300; S.stock.spam = 200; S.stock.tin = 300;   /* 设计 72：午餐肉要铁皮 */ for (const sh of S.shelves) for (const sl of L.slotsOf(sh)) if (['bacon', 'spam'].includes(sl.g)) sl.n = 0;
let canGot = 0, smGot = 0, firstCan = null, msg = '';
for (let t = 0; t < 400; t++) { S.stock.pork = 1; S.stock.bacon = Math.min(S.stock.bacon, 5); S.stock.spam = 200;   // 每秒只来 1 个猪肉，腊肉一直少
  const before = L.wsOf(S, 'can').lines.map(l => l.out), bs = L.wsOf(S, 'smoke').lines.map(l => l.out);
  if (t === 5) msg = L.wsWhy(S, 'can').lines[0];
  L.tick(S, 1);
  L.wsOf(S, 'can').lines.forEach((l, i) => { if (l.out && !before[i]) { canGot++; if (firstCan == null) firstCan = t } });
  L.wsOf(S, 'smoke').lines.forEach((l, i) => { if (l.out && !bs[i]) smGot++ });
  for (const k of ['smoke', 'can']) L.wsOf(S, k).lines.forEach(l => { if (l.out && l.t > 0) { l.out = null; l.t = 0 } }) }
ok('抢猪肉：先给更缺的腊肉，午餐肉的线等着', /先给更缺的腊肉/.test(msg), `5 秒时罐头机线 1：${msg}`);
ok('罐头机有人管', !!L.wsCrew(S).get('can'));
ok('等得久的线不会一直轮不到', canGot > 0 && firstCan != null, `400 秒里罐头机拿到 ${canGot} 次（第一次在第 ${firstCan} 秒），熏炉 ${smGot} 次`);
/* 自动 */
S = fresh(); const ws = L.wsOf(S, 'wood'); ws.lines.forEach(l => { l.out = null; l.plan = null }); S.stock.firewood = 100; S.stock.cell = 0; S.stock.charcoal = 999; S.stock.bandage = 100; S.stock.torch = 0; run(S, 1);
ok('自动：照旧挑能做的（电芯没了做火炬）', ws.lines.some(l => l.out === 'torch'), ws.lines.map(l => l.out).join(','));
S = fresh(true); S.lv.kitchen2 = 3; for (const k of ['kitchen', 'kitchen2']) L.wsOf(S, k).lines.forEach(l => { l.out = null; l.plan = null; l.t = 0 }); for (const g of Object.keys(S.stock)) S.stock[g] = Math.max(S.stock[g], 300); run(S, 1);
{ const outs = ['kitchen', 'kitchen2'].flatMap(k => L.wsOf(S, k).lines.slice(0, 4).map(l => l.out)).filter(Boolean), sh = Object.keys((await import('../src/js/config.js')).DISHES).filter(d => L.isOnShelf(S, d)).length;
  ok('两个厨房自动不一起做同一道（熟食柜上有几道就分开做几道）', new Set(outs).size === Math.min(outs.length, sh), `${outs.length} 条在做：${outs.join(',')}；熟食柜上 ${sh} 道菜`) }
console.log(res.join('\n'));
