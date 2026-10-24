/* 35b 供给模拟：用游戏里同一套逻辑（logic.js 的 tick）按时间跑，看超市和工坊会不会断货。
   用法：node tools/supplysim.mjs [分钟=60] [跑几局=3]
   场景：超市 3 / 4 / 5 级，口碑一直 100，建筑都升到这一级能升的最高级，员工按需要配满（精英 1 级，效率 1.3），
   先跑 30 分钟不记（仓库进入平常状态），再每秒一步记 60 分钟。主角不动（不捡马路上的东西、不收银），全靠员工。
   记录：每种商品货架上是 0 的时间占比、每台机器因为没原料停着的时间占比、每种原料仓库最低剩多少（含种子）。 */
import fs from 'fs';
import * as L from '../src/js/logic.js';
import { fixLayout } from '../src/js/layout.js';
import { FARM, GREENHOUSE, STAFF, BUILD, GOODS, GOOD_IDS, CROPS, CROP_IDS, RANCH_IDS, PEN_CAP, WS, WS_IDS, MACH, DISHES, FIXTURE, STORE, ORCHARD, recipeOf, isKit } from '../src/js/config.js';
/* 设计 68：PIN=1 —— 每条线都「指定一样」（两个厨房 8 条线各一道菜，别的机器按线轮着分产品），看指定的线有多少时间在等 */
const PIN = !!process.env.PIN;
/* 设计 68：BASE=1 —— 按改之前跑（没有厨房 2，3 级都是 3 条线、工匠管 3 台），对比用 */
if (process.env.BASE) { WS.linesBy = {}; BUILD.kitchen2.levels.forEach(l => { if (l) l.store = 9 }); STAFF.qual.n.manage = 3; STAFF.qual.e.manage = 3 }

const MIN = +process.argv[2] || 60, RUNS = +process.argv[3] || 3, WARM = +(process.env.WARM ?? 30), DBG = process.env.DBG && process.env.DBG.split(',');   // DBG=3,apple,jam,jam：每分钟打印超市 3 级这些东西的 仓库/货柜 和机器在做什么
const maxLv = (k, lv) => { let n = 0; const ls = BUILD[k].levels; for (let i = 1; i < ls.length; i++) if (ls[i] && (ls[i].store || 1) <= lv) n = i; return n };
const RAW = [...CROP_IDS, 'apple', 'orange', 'egg', 'duckegg', 'fur', 'wool', 'milk', 'pork', 'fish', 'water', 'firewood', 'battery', 'cell', 'wire', 'tin', 'thread', 'bandage', 'food'];

function setup(lv, rep = 100) {
  const S = L.newState(); S.lv.store = lv; S.rep = rep;
  for (const k of Object.keys(BUILD)) { if (BUILD[k].gone || BUILD[k].main || k === 'tier' || k === 'tower' || k === 'hosp') continue; if (['shelf', 'veg', 'fridge', 'deli'].includes(k)) continue; const m = maxLv(k, lv); if (m) S.lv[k] = Math.max(S.lv[k] || 0, m) }
  S.grown = {}; for (const g of GOOD_IDS) S.grown[g] = true;
  /* 要卖的东西（跟 wanted 一样的条件，先把机器、动物都当作有）→ 按货柜种类分 */
  const tierMax = maxLv('tier', lv) || 1;
  const sell = GOOD_IDS.filter(g => { const G = GOODS[g]; if (G.raw || G.gone || (G.unlock || 1) > lv) return false; if (G.craft) return S.lv[G.craft] > 0; if (G.dish) return S.lv.kitchen > 0 && maxLv('deli', lv) > 0; return true });
  const typeOf = g => GOODS[g].only || (GOODS[g].fresh ? 'veg' : GOODS[g].dish ? 'deli' : g === 'fish' || (g === 'water' && maxLv('fridge', lv)) ? 'fridge' : 'shelf');   // 没冰柜的时候水放货架
  const want = {}; for (const g of sell) (want[typeOf(g)] = want[typeOf(g)] || []).push(g);
  /* 货柜：每种需要几个（满档能放几种），总数不超过这一级的货柜上限；冰柜、果蔬架、熟食柜受建造上限 */
  const kinds = t => FIXTURE[t].kinds[tierMax - 1];
  let left = process.env.FULL ? 999 : STORE[lv].shelves; S.shelves = [];   // 设计 39：FULL=1 货柜不限数量（只看店里放不放得下）
  const caps = { fridge: maxLv('fridge', lv), veg: maxLv('veg', lv), deli: maxLv('deli', lv) ? 99 : 0, shelf: 99 };   /* 设计 71：熟食柜照设计 39 不限数量（能盖了就按要摆几种算） */
  if (process.env.FULL) for (const t of ['fridge', 'veg', 'deli']) if (caps[t]) caps[t] = 99;
  const plan = {};
  for (const t of ['fridge', 'veg', 'deli', 'shelf']) { const need = Math.ceil((want[t] || []).length / kinds(t)); plan[t] = Math.min(need, caps[t], left); left -= plan[t] }
  for (const t of ['fridge', 'veg', 'deli', 'shelf']) { const list = [...(want[t] || [])];
    for (let i = 0; i < plan[t]; i++) { if (process.env.FULL && !L.spotFor(S, t)) { plan[t] = i; break } const sh = { type: t, tier: tierMax, g: null, n: 0 }; L.normSlots(S, sh); S.shelves.push(sh); fixLayout(S);
      for (const sl of L.slotsOf(sh)) { const g = list.shift(); if (g) { sl.g = g; sl.n = Math.round(L.capOf(sh) / 2) } } }
    if (list.length) plan[t + '_没地方'] = list.map(g => GOODS[g].name) }
  /* 设计 45：DUP=1 —— 在推荐配置上，把最贵的 3 样货各多摆 2 个货柜（同种类，第一层放它） */
  if (process.env.DUP) { const top = sell.filter(g => g !== 'fish').sort((a, b) => GOODS[b].price - GOODS[a].price).slice(0, 3); plan.dup = top.map(g => GOODS[g].name);
    for (const g of top) for (let k = 0; k < 2; k++) { const t = typeOf(g); if (!L.spotFor(S, t)) { plan.dup.push(GOODS[g].name + '放不下'); continue } const sh = { type: t, tier: tierMax, g: null, n: 0 }; L.normSlots(S, sh); S.shelves.push(sh); fixLayout(S); plan[t] = (plan[t] || 0) + 1; sh.g = g; sh.n = Math.round(L.capOf(sh) / 2) }
    DUPG.splice(0, DUPG.length, ...top) }
  S.lv.shelf = plan.shelf; S.lv.veg = plan.veg; S.lv.fridge = plan.fridge; S.lv.deli = plan.deli;
  /* 仓库开局每种 20 个、种子每种 5 包；温室种满（进度随机），果树种满，动物住满 */
  for (const g of GOOD_IDS) S.stock[g] = GOODS[g].raw || GOODS[g].fresh || ['fish', 'water', 'food', 'bandage', 'battery'].includes(g) ? 20 : 10;
  if (S.lv.gh) { while (S.plots.length < L.plotCount(S)) S.plots.push(null); const open = L.cropsOpen(S);
    S.plots.forEach((p, i) => { const c = open[i % open.length]; const t = CROPS[c].time; S.plots[i] = { c, left: Math.random() * t, total: t } }) }
  for (const c of CROP_IDS) S.seeds[c] = 5;
  const nT = ORCHARD[S.lv.orchard || 0] || 0; while (S.trees.length < nT) S.trees.push(null);
  for (let i = 0; i < nT; i++) { S.treas.sapA = 1; S.treas.sapO = 1; L.plantTree(S, i, i % 2 && lv >= 4 ? 'sapO' : 'sapA'); if (S.trees[i]) S.trees[i].left = Math.random() * S.trees[i].total }
  S.herd = {}; for (const k of RANCH_IDS) if (S.lv[k]) { S.herd[k] = PEN_CAP[S.lv[k]]; L.penOf(S, k).food = 1 }
  S.bait = { worm: 9999, corn: 9999 }; S.fishLic = 1;
  /* 员工：工匠（机器 ÷ 3）、饲养（棚 ÷ 3）、拾荒、钓鱼、种地、收银 2 */
  const ws = L.wsBuilt(S).length, pens = RANCH_IDS.filter(k => S.lv[k]).length;
  /* 37：按宿舍住得下的人数配（1、2 级只住 2、4 人）：先收银、拾荒、种地，再工匠、饲养、钓鱼，多的再加一个收银 */
  const wantJ = ['cash', 'scav', ...(S.lv.gh ? Array(FARMERS).fill('farm') : []), ...Array(Math.ceil(ws / MAN)).fill('craft'), ...Array(Math.ceil(pens / MAN)).fill('feed'), ...(lv >= 3 ? ['fish'] : []), 'cash'];
  const jobs = wantJ.slice(0, L.staffCap(S));
  S.staff = []; for (const j of jobs) { const p = L.rollStaff(S, SQ); p.job = j; p.fed = true; p.lv = SLV; p.hp = L.staffStats(p).hp; S.staff.push(p) }
  S.staffDay = '9999';
  if (PIN) { const dishes = Object.keys(DISHES).filter(d => L.dishOpen(S, d)); let di = 0;
    for (const k of L.wsBuilt(S)) { const M = L.wsOf(S, k), n = L.wsLines(S, k), cs = L.wsChoices(S, k);
      for (let i = 0; i < n; i++) M.lines[i].plan = isKit(k) ? dishes[di++ % dishes.length] : cs[i % cs.length] } }
  return { S, sell, plan, jobs };
}

/* 37：真实存档：读进来（走一遍 migrate），按存档里实际的员工、地、动物、货柜跑，口碑用存档里的（会随卖货变） */
function setupReal(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')), S = L.migrate(raw.data || raw);
  for (const p of S.staff) { p.fed = true; p.hp = L.staffStats(p).hp; p.heal = null; p.hurtT = 0 } S.staffDay = '9999'; S.queue = []; S.shoppers = [];
  return { S, sell: L.wanted(S), plan: '存档里的', jobs: S.staff.map(p => p.job), real: true };
}
const DUPG = [], dupLow = [];
/* 设计 48：OLDFARM=1 —— 温室、果园还是原来的地和树（4 / 6 / 10 / 14 / 16 块，果园 2 级 4 棵），只看 A（菜果留 20%）的效果；FARMERS=n 种地员工几个 */
if (process.env.OLDFARM) { [4, 6, 10, 14, 16].forEach((n, i) => { GREENHOUSE[i + 1].plots = n }); ORCHARD[3] = 4 }
const FARMERS = +(process.env.FARMERS || 1);
if (process.env.BONUSSEED) FARM.bonusSeed = +process.env.BONUSSEED;   // 设计 48：试收菜多得种子的机会
/* 设计 47：STAFFQ=n/e/p/l、STAFFLV=几级——员工全换成这个品质、等级（默认精英 1 级）；工匠、饲养员按「一人管几台」配 */
const SQ = process.env.STAFFQ || 'e', SLV = +(process.env.STAFFLV || 1), MAN = STAFF.qual[SQ].manage || 3;
function run(lv, file, rep = 100) {
  const { S, sell, plan, jobs, real } = file ? setupReal(file) : setup(lv, rep); const keepRep = r => { if (!real) S.rep = rep };
  const zero = Object.fromEntries(sell.map(g => [g, 0])), stall = {}, idle = {}, low = Object.fromEntries(RAW.map(g => [g, Infinity])), seedLow = Object.fromEntries(CROP_IDS.map(c => [c, Infinity]));
  /* 先跑 WARM 分钟（默认 30）不记：开局仓库每种只有 10～20 个，跟真玩到这一级时不一样；跑一会儿让仓库、货柜进入平常的样子 */
  for (let t = 0; t < (file ? 0 : WARM) * 60; t++) { keepRep(); for (const c of S.queue) c.ready = true; L.tick(S, 1) }
  /* 设计 41：过量率 =（卖掉 + 仓库和货架净增）/ 卖掉；仓库这种满了的时间也记下（满了净增就涨不上去） */
  const have = g => (S.stock[g] || 0) + L.onShelves(S, g), have0 = Object.fromEntries(sell.map(g => [g, have(g)])), fullT = {};
  const lostG = {};   // 设计 41：仓库 / 池塘满了丢掉的（也是产出来的）
  const dl = {}, dz = {}, whyN = {}, rawZero = {};   // 设计 61：原料仓库是 0 的时间（不丧的存档猪肉一直 0）
  const pinT = {};   // 设计 68：指定的线：做 / 等原料 / 够多了 的秒数（按机器）
  const served = L.wsServed(S); let plotE = 0, plotR = 0; const got = {}, sold = {}, wsUse = {}, prevOut = {};
  for (let t = 0; t < MIN * 60; t++) {
    keepRep(); for (const c of S.queue) c.ready = true;
    const ev = L.tick(S, 1); for (const e of ev) { if (e.type === 'whLost') lostG[e.g] = (lostG[e.g] || 0) + e.n; if (e.type === 'staffFarm' && e.what !== 'plant') got[e.c] = (got[e.c] || 0) + e.n;
      if (e.type === 'cust' && e.ok) { const c = S.shoppers.find(x => x.id === e.id); if (c) { sold[c.g] = (sold[c.g] || 0) + c.qty; for (const x of c.ex || []) sold[x.g] = (sold[x.g] || 0) + x.n } } }
    for (const k of L.wsBuilt(S)) { const M = L.wsOf(S, k); M.lines.forEach((l, i) => { const key = k + i; if (l.out && prevOut[key] !== l.out + l.t0) {} });
      M.lines.forEach((l, i) => { const key = k + i, was = prevOut[key]; if (l.out && l.t <= 1 && was !== 'busy') { const r = recipeOf(k, l.out); for (const [g, n] of Object.entries(r.need)) wsUse[g] = (wsUse[g] || 0) + n } prevOut[key] = l.out && l.t > 1 ? 'busy' : l.out ? 'start' : null }) }
    if (DBG && DBG[0] == lv && t % 60 === 0) console.log(`  ${t / 60}分 ` + DBG.slice(1).map(g => `${g} ${S.stock[g] ?? '-'}/${L.onShelves(S, g)}`).join('  ') + '  ' + DBG.slice(1).filter(g => L.wsBuilt(S).includes(g)).map(k => k + ':' + L.wsOf(S, k).lines.map(l => l.out || '空').join(',')).join(' '));
    for (const g of sell) { if (L.onShelves(S, g) <= 0) zero[g]++; if (L.whFull(S, g) || (GOODS[g].fresh && (S.stock[g] || 0) >= L.stockCap(S, g) * 0.78) || ((GOODS[g].craft || GOODS[g].dish) && (S.stock[g] || 0) + L.onShelves(S, g) >= L.wsEnough(S) * 0.9)) fullT[g] = (fullT[g] || 0) + 1 }   // 工坊做的：到了停手线（工匠主动不做了）也算够
    for (const k of served) { const M = L.wsOf(S, k), n = L.wsLines(S, k); if (!M.lines.slice(0, n).some(l => !l.out)) continue;
      const cs = L.wsChoices(S, k).filter(o => !isKit(k) || L.isOnShelf(S, o));
      const room = cs.filter(o => L.whRoom(S, o) > 0);
      if (!room.length) { idle[k] = (idle[k] || 0) + 1; continue }   // 仓库放不下（货够多），不算断
      /* 只算「产品快没了（仓库 + 货柜 < 10 个）却因为没原料做不了」的时间；产品还多、原料被别处先用掉的不算断（机器比顾客要的快，本来就会歇） */
      const needy = room.filter(o => (S.stock[o] || 0) + L.onShelves(S, o) < 10);
      if (needy.length && !room.some(o => L.wsNeedOk(S, k, o, WS.keep))) stall[k] = (stall[k] || 0) + 1 }
    if (PIN) for (const k of served) { const M = L.wsOf(S, k), n = L.wsLines(S, k), b = pinT[k] || (pinT[k] = { run: 0, raw: 0, full: 0, other: 0 });
      for (const l of M.lines.slice(0, n)) { if (!l.plan) continue; if (l.out) { b.run++; continue } const w = L.wsWait(S, k, l.plan, l); if (!w) b.other++; else if (w.short === '等原料') b.raw++; else if (w.short === '够多了' || w.short === '仓库满了') b.full++; else b.other++ } }
    S.plots.forEach((p, i) => { if (!p) whyN[L.plotEmptyWhy(S, i)] = (whyN[L.plotEmptyWhy(S, i)] || 0) + 1 / Math.max(1, S.plots.length) });   // 设计 50
    { let e = 0, r = 0; for (const p of S.plots) { if (!p) e++; else if (p.left <= 0) r++ } if (S.plots.length) { plotE += e / S.plots.length; plotR += r / S.plots.length } }
    for (const g of RAW) if (S.stock[g] != null && S.stock[g] <= 0 && (GOODS[g].unlock || 1) <= S.lv.store) rawZero[g] = (rawZero[g] || 0) + 1;
    for (const g of DUPG) { dl[g] = Math.min(dl[g] ?? Infinity, S.stock[g] || 0); if (!(S.stock[g] > 0)) dz[g] = (dz[g] || 0) + 1 }
    if (true) { for (const g of RAW) if (S.stock[g] != null) low[g] = Math.min(low[g], S.stock[g] + (g === 'fish' ? 0 : 0)); for (const c of L.cropsOpen(S)) seedLow[c] = Math.min(seedLow[c], S.seeds[c]) }
  }
  const net = Object.fromEntries(sell.map(g => [g, have(g) - have0[g]]));
  if (DUPG.length) { dupLow.push(Object.fromEntries(DUPG.map(g => [g, [dl[g], dz[g] || 0]]))) }
  return { pinT, rawZero, whyN, net, fullT, lostG, rep0: 0, repEnd: S.rep, soldBy: sold, wsUse, got, plotE: plotE / (MIN * 60), plotR: plotR / (MIN * 60), S, sell, plan, jobs, zero, stall, idle, low, seedLow, served, end: { ...S.stock }, seedEnd: { ...S.seeds }, miss: S.st.miss, sold: S.st.sold };
}

const pct = (n) => (n / (MIN * 60) * 100);
const REAL = process.env.REAL ? process.env.REAL.split(',') : null, LVS = process.env.LVS ? process.env.LVS.split(',').map(Number) : [1, 2, 3, 4, 5];
const OVER = {};   // 设计 41：过量率，JSON 输出给结果文档（OVERJSON=路径）
const CASES = REAL || LVS.flatMap(lv => (process.env.REPS ? process.env.REPS.split(',').map(Number) : lv >= 4 ? [100, 50] : [100]).map(rep => [lv, rep]));
for (const cs of CASES) {
  const [lv, rep] = REAL ? [cs, 100] : cs;
  const rs = Array.from({ length: RUNS }, () => REAL ? run(0, lv) : run(lv, null, rep)); const r0 = rs[0];
  const avg = f => rs.reduce((a, r) => a + f(r), 0) / RUNS, mn = f => Math.min(...rs.map(f));
  if (REAL) console.log(`\n=== 真实存档 ${lv.split('/').pop()}：超市 ${r0.S.lv.store} 级，口碑结束时 ${Math.round(avg(r => r.repEnd))}，不先跑，记 ${MIN} 分钟 × ${RUNS} 局 ===`);
  else console.log(`\n=== 超市 ${lv} 级 口碑 ${rep}，先跑 ${WARM} 分钟再记 ${MIN} 分钟 × ${RUNS} 局 ===`);
  console.log(`员工 ${r0.jobs.length} 人：${Object.entries(r0.jobs.reduce((a, j) => (a[j] = (a[j] || 0) + 1, a), {})).map(([j, n]) => `${{ craft: '工匠', feed: '饲养', scav: '拾荒', fish: '钓鱼', farm: '种地', cash: '收银' }[j]} ${n}`).join('、')}；货柜 ${JSON.stringify(r0.plan)}`);
  console.log(`卖出 ${avg(r => r.sold).toFixed(0)} 件，顾客要的没货 ${avg(r => r.miss).toFixed(0)} 次；温室空着 ${(avg(r => r.plotE || 0) * 100).toFixed(0)}%、熟了没收（仓库满了或员工没空）${(avg(r => r.plotR || 0) * 100).toFixed(0)}%`);
  if (dupLow.length) { const d = dupLow.splice(0); console.log('设计 45 多摆的：' + r0.plan.dup.join('、') + '；仓库最低 / 仓库是 0 的时间：' + Object.keys(d[0]).map(g => `${GOODS[g].name} ${Math.min(...d.map(x => x[g][0]))} / ${(d.reduce((a, x) => a + x[g][1], 0) / d.length / (MIN * 60) * 100).toFixed(1)}%`).join('、')) }
  if (r0.S.lv.gh) console.log('温室空地的原因（占地的比例）：' + ['full', 'seed', 'staff'].map(k => `${L.EMPTY_WHY[k]} ${(avg(r => (r.whyN[k] || 0)) / (MIN * 60) * 100).toFixed(1)}%`).join('、'));
  const zs = r0.sell.map(g => [g, avg(r => pct(r.zero[g]))]).sort((a, b) => b[1] - a[1]);
  console.log('货架是 0 的时间（超过 5% 标 ✗）：' + zs.map(([g, p]) => `${GOODS[g].name} ${p.toFixed(1)}%${p > 5 ? '✗' : ''}`).join('、'));
  { const rows = r0.sell.map(g => { const sd = avg(r => (r.soldBy[g] || 0) / MIN), nt = avg(r => r.net[g] / MIN), ls = avg(r => (r.lostG[g] || 0) / MIN), full = avg(r => (r.fullT[g] || 0) / (MIN * 60)), k = sd > 0 ? (sd + nt + ls) / sd : null;
      return { g, name: GOODS[g].name, sold: sd, net: nt, lost: ls, over: k, full, ok: full > 0.1 || (sd > 0 && ls / sd >= 0.05) || (k != null && k >= 1.3) }   /* 42：满了丢掉的 ≥ 卖掉的 5% 也算够（仓库放不下了，产量本来就过量） */ });
    OVER[`${lv}|${rep}`] = rows;
    console.log('过量率 =（卖掉 + 净增 + 满了丢掉）/ 卖掉（卖掉/分、净增/分、过量率；< 1.3 标 ✗，仓库满着或工坊的货到了停手线的时间 > 10% 写「满」算够）：' + rows.map(x => `${x.name} ${x.sold.toFixed(2)}/${x.net >= 0 ? '+' : ''}${x.net.toFixed(2)}/${x.lost > 0.01 ? `（丢 ${x.lost.toFixed(2)}）` : ''}${x.over == null ? '-' : x.over.toFixed(2)}${x.full > 0.1 || (x.sold > 0 && x.lost / x.sold >= 0.05) ? '满' : ''}${x.ok ? '' : '✗'}`).join('、'));
    const bad = rows.filter(x => !x.ok && x.sold > 0); console.log(`  不到 1.3 的：${bad.length ? bad.map(x => x.name + ' ' + x.over.toFixed(2)).join('、') : '没有'}`) }
  console.log('机器缺原料停着（产品快卖完了却没原料，超过 10% 标 ✗）：' + r0.served.map(k => { const p = avg(r => pct(r.stall[k] || 0)), q = avg(r => pct(r.idle[k] || 0)); return `${BUILD[k].name} ${p.toFixed(1)}%${p > 10 ? '✗' : ''}${q > 1 ? `（货满歇着 ${q.toFixed(0)}%）` : ''}` }).join('、'));
  { const z = RAW.map(g => [g, avg(r => pct(r.rawZero[g] || 0))]).filter(x => x[1] > 0.5); console.log('原料仓库是 0 的时间（超过 20% 标 ✗）：' + (z.length ? z.map(([g, p]) => `${GOODS[g].name} ${p.toFixed(0)}%${p > 20 ? '✗' : ''}`).join('、') : '没有')) }
  console.log('原料仓库最低/ 结束时：' + RAW.filter(g => (GOODS[g].unlock || 1) <= r0.S.lv.store && r0.low[g] !== Infinity).map(g => `${GOODS[g].name} ${mn(r => r.low[g])}/${Math.round(avg(r => r.end[g]))}`).join('、'));

  console.log('菜和果子 收获 / 卖掉 / 工坊用（个/分）：' + Object.keys(r0.got).map(c => `${GOODS[c].name} ${avg(r => (r.got[c] || 0) / MIN).toFixed(2)}/${avg(r => (r.soldBy[c] || 0) / MIN).toFixed(2)}/${avg(r => (r.wsUse[c] || 0) / MIN).toFixed(2)}`).join('、') + '　sold ' + Object.values(r0.soldBy).reduce((a, b) => a + b, 0));
  /* 设计 41：结束时仓库里各类货大概有多少（WARM=0 MIN=30 就是「开局跑 30 分钟」） */
  { const cat = g => GOODS[g].dish ? '熟食' : GOODS[g].craft ? '加工品' : GOODS[g].raw ? '原料' : GOODS[g].fresh ? '菜和果子' : '拾荒货';
    const by = {}; for (const g of GOOD_IDS) { if ((GOODS[g].unlock || 1) > r0.S.lv.store || GOODS[g].gone) continue; const v = avg(r => r.end[g] || 0); if (!v) continue; (by[cat(g)] = by[cat(g)] || []).push(`${GOODS[g].name} ${Math.round(v)}`) }
    console.log(`结束时仓库（仓库每种上限 ${L.whCap(r0.S)}）：` + Object.entries(by).map(([k, l]) => `【${k}】${l.join('、')}`).join(' ')) }
  if (PIN) console.log('设计 68 每条线都指定：在做 / 等原料 / 够多了（占这台机器线·时间的比例）：' + r0.served.map(k => { const b = r0.pinT[k] || {}, tot = (b.run + b.raw + b.full + b.other) || 1; return `${BUILD[k].name} ${(b.run / tot * 100).toFixed(0)}/${(b.raw / tot * 100).toFixed(0)}/${(b.full / tot * 100).toFixed(0)}%` }).join('、'));
  console.log('机器线数：' + r0.served.map(k => `${BUILD[k].name} ${L.wsLines(r0.S, k)}`).join('、') + `；熟食柜 ${r0.S.shelves.filter(s => s.type === 'deli').length} 个`);
  console.log('种子最低 / 结束时：' + L.cropsOpen(r0.S).map(c => `${GOODS[c].name} ${mn(r => r.seedLow[c])}/${Math.round(avg(r => r.seedEnd[c]))}`).join('、'));
}
if (process.env.OVERJSON) fs.writeFileSync(process.env.OVERJSON, JSON.stringify(OVER));
