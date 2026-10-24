import * as C from '../src/js/config.js';
const { SHOP, STORE, GOODS, GOOD_IDS, CROPS, TREES, GREENHOUSE, ORCHARD, RECYCLER, STAFF, STAFF_FISH, JUNK } = C;
const recMul = R => 1 + R.x3 * 2 + R.x10 * 9;            // 一件物资平均变几个商品
for (const lv of [2, 3, 4, 5]) {
  const wanted = GOOD_IDS.filter(g => (GOODS[g].unlock || 1) <= lv);
  for (const rep of [50, 100]) {
    const gap = SHOP.custBase * (1.4 - rep / 100) / STORE[lv].traffic, cpm = 60 / gap;          // 顾客/分钟
    const sw = wanted.reduce((a, g) => a + (GOODS[g].w || 1), 0), per = cpm / sw * (SHOP.buyMin + SHOP.buyMax) / 2;   // 普通商品每种每分钟卖多少（0.42 机器产品 ×0.4、菜 ×0.2）
    console.log(`超市${lv}级 口碑${rep}: 顾客 ${cpm.toFixed(1)}/分钟，${wanted.length} 种商品，每种每分钟要 ${per.toFixed(2)} 个`);
    const X = SHOP.extra, xp = rep < X.from ? 0 : X.top * (rep - X.from) / (100 - X.from), xk = 1 + (rep >= X.two ? X.twoP : 0), xn = (X.nMin + X.nMax) / 2;
    const xper = cpm * xp * xk * xn / sw;   // 多买（只从货多的货柜拿，最多这么多）
    console.log(`  └ 口碑多买：${(xp * 100).toFixed(0)}% 的顾客多拿，每种每分钟最多再多 ${xper.toFixed(2)} 个（只拿剩一半以上的，不会拿断）`);
  }
}
/* 供给（每分钟） */
const R = RECYCLER[2], m = recMul(R), sc = STAFF.scav, eff = 1.3;
const trip = sc.trip / 60, scavN = sc.haul * eff, types = 3;
console.log(`回收机2级平均倍数 ${m.toFixed(2)}，每分钟最多处理 ${(60 / R.time).toFixed(1)} 件`);
console.log(`一个拾荒员工（效率${eff}）：每种拾荒物资 ${(scavN / types / trip).toFixed(2)} 件/分钟 → 商品 ${(scavN / types / trip * m).toFixed(2)}/分钟；铁罐/塑料瓶 各 ${(7 * eff / trip).toFixed(2)} → ${(7 * eff / trip * m).toFixed(2)}/分钟；种子 ${((sc.seeds ? (sc.seeds[0] + sc.seeds[1]) / 2 : 5) / trip).toFixed(2)} 包/分钟`);
for (const c of Object.keys(CROPS)) console.log(`  ${GOODS[c].name}: 一格 ${(CROPS[c].yield / CROPS[c].time * 60).toFixed(2)}/分钟`);
for (const k of Object.keys(TREES)) console.log(`  ${GOODS[k].name}树: 一棵 ${(TREES[k].yield / TREES[k].every * 60).toFixed(2)}/分钟`);
console.log(`钓鱼员工: ${((STAFF_FISH.fish[0] + STAFF_FISH.fish[1]) / 2 / (STAFF_FISH.trip / 60)).toFixed(2)} 条/分钟`);
console.log('温室格数', GREENHOUSE.slice(1).map(g => g.plots).join('/'), '果园树位', ORCHARD.join('/'));
/* 按需求算温室要几格（每种菜每分钟要 d 个） */
for (const [lv, d] of [[3, 1.33], [4, 1.24], [4, 2.8], [5, 3.2]]) {
  const veg = Object.keys(CROPS).filter(c => (GOODS[c].unlock || 1) <= lv), plots = veg.reduce((a, c) => a + d / (CROPS[c].yield / CROPS[c].time * 60), 0);
  const seeds = veg.reduce((a, c) => a + d / CROPS[c].yield, 0);
  console.log(`超市${lv}级 每种 ${d}/分钟：${veg.length} 种菜要 ${plots.toFixed(1)} 格（温室最多 ${GREENHOUSE[Math.min(5, lv + 1)].plots}），种子 ${seeds.toFixed(1)} 包/分钟（收菜多得约 ${(seeds * 0.4).toFixed(1)}）`);
}
/* 0.28 牧场：每个棚 2/4/6 只，每分钟产多少；饲料每分钟吃多少 */
{ const { RANCH, PEN_CAP, FEED } = C;
  for (const [k, R] of Object.entries(RANCH)) console.log(`牧场 ${R.name}（${GOODS[R.good].name}，超市 ${GOODS[R.good].unlock} 级）：2/4/6 只 每分钟 ${PEN_CAP.slice(1).map(n => (n * R.yield / R.cycle * 60).toFixed(1)).join('/')} 个，一只 ${R.price} 币，${(R.price / (R.yield / R.cycle * 60 * GOODS[R.good].price)).toFixed(0)} 分钟回本`);
  /* 0.36 每种动物吃一样菜；满级 6 只每分钟吃 6×60/meal 顿，南瓜 / 苹果一个顶几顿 */
  let plots = 0, trees = 0;
  for (const [k, f] of Object.entries(FEED.diet)) { const per = PEN_CAP[3] * 60 / FEED.meal / (FEED.meals[f] || 1);
    const rate = CROPS[f] ? CROPS[f].yield / CROPS[f].time * 60 : C.TREES[f].yield / C.TREES[f].every * 60;
    if (CROPS[f]) plots += per / rate; else trees += per / rate;
    console.log(`  饲料 ${RANCH[k].name}吃${GOODS[f].name}：满级每分钟 ${per.toFixed(2)} 个 = ${(per / rate).toFixed(2)} ${CROPS[f] ? '格温室' : '棵树'}`) }
  console.log(`饲料一共：温室 ${plots.toFixed(1)} 格，果树 ${trees.toFixed(2)} 棵`);
  const d = 1.95;   // 超市 5 级口碑 100 每种每分钟（V1.01：加了工坊以后是 1.95，见下面「工坊」段）
  const veg = Object.keys(CROPS), sell = veg.reduce((a, c) => a + d / (CROPS[c].yield / CROPS[c].time * 60), 0);
  console.log(`超市5级口碑100：顾客要的菜 ${sell.toFixed(1)} 格 + 饲料 ${plots.toFixed(1)} 格 = ${(sell + plots).toFixed(1)} 格（温室最多 ${GREENHOUSE[5].plots}）`);
  const ap = C.TREES.apple.yield / C.TREES.apple.every * 60;
  console.log(`苹果：2 棵每分钟 ${(2 * ap).toFixed(1)}，顾客要 ${d} + 奶牛 ${(trees * ap).toFixed(1)} = ${(d + trees * ap).toFixed(1)}；橙子 2 棵 ${(2 * C.TREES.orange.yield / C.TREES.orange.every * 60).toFixed(1)}，要 ${d}`); }

/* 设计 31～33（V2.61）：48 种商品、12 台机器。按超市 2～5 级、口碑 50 / 100 算：
   每种商品每分钟要卖多少 → 每台机器忙到百分之几（机器按这一级能升到的最高级算）→ 原料每分钟要多少、能产多少 */
{ const { WS, MACH, DISHES, RANCH, PEN_CAP, LUCK, BUILD, WS_IDS, FEED, recipeOf, FIXTURE } = C;
  const maxLv = (k, lv) => { let L = 0; const ls = BUILD[k].levels; for (let i = 1; i < ls.length; i++) if (ls[i] && (ls[i].store || 1) <= lv) L = i; return L };
  const luckAvg = (kind, l) => 1 + LUCK[kind].x2(l) + 2 * LUCK[kind].x3(l);
  const pct = x => (x * 100).toFixed(0) + '%';
  for (const lv of [2, 3, 4, 5]) for (const rep of [50, 100]) {
    /* 顾客要的：解锁了的、能卖的（工坊产品要有机器，菜要有厨房 + 熟食柜，冰淇淋要冰柜） */
    const deli = maxLv('deli', lv) > 0 && maxLv('kitchen', lv) > 0;
    const sell = GOOD_IDS.filter(g => { const G = GOODS[g]; if (G.raw || G.gone || (G.unlock || 1) > lv) return false; if (G.craft) return maxLv(G.craft, lv) > 0; if (G.dish) return deli; return true });
    const sw = sell.reduce((a, g) => a + (GOODS[g].w || 1), 0), cpm = 60 / (SHOP.custBase * (1.4 - rep / 100) / STORE[lv].traffic), per = cpm / sw * (SHOP.buyMin + SHOP.buyMax) / 2;
    /* 35b：加上口碑高时顾客顺手多拿的（只从货柜上剩一半以上的拿，按种类平均；鱼不算）——以前没算，菜和果子少算了约 40% */
    const X = SHOP.extra, xp = rep < X.from ? 0 : X.top * (rep - X.from) / (100 - X.from), xk = 1 + (rep >= X.two ? X.twoP : 0), xper = cpm * xp * xk * (X.nMin + X.nMax) / 2 / Math.max(1, sell.length - 1);
    const d = Object.fromEntries(sell.map(g => [g, per * (GOODS[g].w || 1) + (g === 'fish' ? 0 : xper)]));
    console.log(`\n=== 超市 ${lv} 级 口碑 ${rep}：顾客 ${cpm.toFixed(1)}/分，能卖 ${sell.length} 种（货架 ${sell.filter(g => !GOODS[g].fresh && !GOODS[g].dish && g !== 'fish' && g !== 'water' && !GOODS[g].only).length} / 果蔬 ${sell.filter(g => GOODS[g].fresh).length} / 冰柜 ${sell.filter(g => g === 'water' || g === 'fish' || GOODS[g].only === 'fridge').length} / 熟食 ${sell.filter(g => GOODS[g].dish).length}），普通商品每种 ${per.toFixed(2)}/分，工坊 ${(per * 0.4).toFixed(2)}，菜 ${(per * 0.2).toFixed(2)}`);
    /* 机器：每分钟要做几次（出几个 ÷ 每次出几个 ÷ 暴击平均倍数），每次几秒，几条线 */
    const raw = {}, use = (g, n) => { raw[g] = (raw[g] || 0) + n };
    const rows = [];
    for (const k of WS_IDS) { const L = maxLv(k, lv); if (!L) continue;
      const outs = k === 'kitchen' ? Object.keys(DISHES) : MACH[k].recipes.map(r => r.out);
      let sec = 0, made = [];
      for (const o of outs) { const r = recipeOf(k, o); let need = d[o] || 0;
        if (k === 'split') need = (raw.cell || 0) + 0;          // 分解机：按木工台要的电芯算（下面木工台先算）
        if (!need) continue; const runs = need / (r.n || 1) / luckAvg('ws', L);
        sec += runs * (k === 'kitchen' ? WS.kitchenT[L] : (MACH[k].t || WS.machT)[L]) * (r.tk || 1);
        for (const [g, c] of Object.entries(r.need)) use(g, runs * c); made.push(`${GOODS[o].name} ${need.toFixed(2)}`) }
      let cap = WS.lines[L] * 60;   // 每分钟能做的「秒数」
      rows.push([k, L, sec / cap, made.join('、')]) }
    /* 分解机在木工台之后算（木工台的手电筒、打火机要电芯） */
    for (const row of rows) if (row[0] === 'split') { const L = row[1], runs = (raw.cell || 0) / luckAvg('ws', L); use('battery', runs); row[2] = runs * WS.machT[L] / (WS.lines[L] * 60); row[3] = `电芯 ${(raw.cell || 0).toFixed(2)}（铜丝顺带 ${(runs * luckAvg('ws', L)).toFixed(2)}，打火机要 ${(raw.wire || 0).toFixed(2)}）` }
    console.log('  机器忙到（这一级能升到的最高级）：');
    for (const [k, L, b, m] of rows) console.log(`    ${BUILD[k].name} ${L} 级：${pct(b)}${b > 1 ? ' ✗ 做不过来' : b > 0.85 ? ' ⚠ 很满' : ''}　${m}`);
    /* 原料：顾客直接买的 + 机器 + 厨房 + 喂动物 */
    const direct = g => d[g] || 0;
    const feed = {}; for (const [an, f] of Object.entries(FEED.diet)) { const pen = RANCH[an], G = GOODS[pen.good]; if ((G.unlock || 1) > lv) continue; const per = PEN_CAP[3] * 60 / FEED.meal / (FEED.meals[f] || 1); feed[f] = (feed[f] || 0) + per }
    const totalOf = g => direct(g) + (raw[g] || 0) + (feed[g] || 0);
    /* 供给 */
    const ghL = maxLv('gh', lv), plots = ghL ? GREENHOUSE[ghL].plots : 0, spd = ghL ? GREENHOUSE[ghL].speed : 1, cropLuck = luckAvg('crop', ghL || 1);
    const veg = Object.keys(CROPS).filter(c => (GOODS[c].unlock || 1) <= lv);
    const plotNeed = veg.reduce((a, c) => a + totalOf(c) / (CROPS[c].yield / CROPS[c].time * 60 * spd * cropLuck), 0);
    const orL = maxLv('orchard', lv), trees = orL ? ORCHARD[orL] : 0, treeNeed = ['apple', 'orange'].filter(t => (GOODS[t].unlock || 1) <= lv).reduce((a, t) => a + totalOf(t) / (TREES[t].yield / TREES[t].every * 60 * cropLuck), 0);
    console.log(`  温室：要 ${plotNeed.toFixed(1)} 格 / 有 ${plots} 格 ${plotNeed <= plots ? '✓' : '✗ 不够'}（${veg.map(c => `${GOODS[c].name} ${totalOf(c).toFixed(2)}`).join('、')}）`);
    /* 35b 种子：每种菜每分钟要种几次（要的个数 ÷ 每格收几个 ÷ 收成暴击平均），种子从哪来：拾荒员工每趟 seeds 包（按 seedW 抽解锁了的菜）、
       收菜多得 1 包（bonusSeed）、顾客结账给（tipSeed）；主角自己捡的不算 */
    { const { FARM } = C, w = veg.reduce((a, c) => a + CROPS[c].seedW, 0), scavSeed = (STAFF.scav.seeds[0] + STAFF.scav.seeds[1]) / 2 / (STAFF.scav.trip / 60);
      const rows = veg.map(c => { const need = totalOf(c) / (CROPS[c].yield * cropLuck), share = CROPS[c].seedW / w, get = scavSeed * share + cpm * FARM.tipSeed * share + need * FARM.bonusSeed; return [c, need, get] });
      const tn = rows.reduce((a, r) => a + r[1], 0), tg = rows.reduce((a, r) => a + r[2], 0);
      console.log(`  种子：要种 ${tn.toFixed(2)} 次/分，来 ${tg.toFixed(2)} 包/分（拾荒 ${scavSeed.toFixed(2)} + 顾客 ${(cpm * FARM.tipSeed).toFixed(2)} + 收菜多得 ${(tn * FARM.bonusSeed).toFixed(2)}）${tg >= tn * 1.15 ? ' ✓' : tg >= tn ? ' ⚠ 余量不到 15%' : ' ✗ 不够'}`);
      console.log('    ' + rows.map(([c, n, g]) => `${GOODS[c].name} 要 ${n.toFixed(2)} 来 ${g.toFixed(2)}${g >= n * 1.15 ? '' : g >= n ? '⚠' : '✗'}`).join('、'));
      const farm = 60 / STAFF.farmGap * 1.3, acts = tn * 2 + treeNeed * 0;   // 种地员工每分钟能做几件事（收 + 种算 2 件）
      console.log(`  种地员工：每分钟要收 + 种 ${acts.toFixed(1)} 件（另外摘果），一个人（效率 1.3）能做 ${farm.toFixed(1)} 件 ${acts <= farm * 0.85 ? '✓' : '⚠ 很满'}`) }
    if (lv >= 3) console.log(`  果园：要 ${treeNeed.toFixed(2)} 棵 / 有 ${trees} 棵 ${treeNeed <= trees ? '✓' : '✗ 不够'}（苹果 ${totalOf('apple').toFixed(2)}${lv >= 4 ? `、橙子 ${totalOf('orange').toFixed(2)}` : ''}）`);
    const fishM = (STAFF_FISH.fish[0] + STAFF_FISH.fish[1]) / 2 / (STAFF_FISH.trip / 60);
    if (lv >= 3) console.log(`  鱼：要 ${totalOf('fish').toFixed(2)}/分，一个钓鱼员工 ${fishM.toFixed(2)} ${totalOf('fish') <= fishM ? '✓' : '✗ 要两个人或主角自己钓'}`);
    for (const [an, R] of Object.entries(RANCH)) { const g = R.good; if ((GOODS[g].unlock || 1) > lv) continue; const make = PEN_CAP[3] * R.yield / R.cycle * 60 * luckAvg('ranch', 3);
      console.log(`  ${GOODS[g].name}：要 ${totalOf(g).toFixed(2)}/分，满棚 6 只 ${make.toFixed(2)} ${totalOf(g) <= make ? '✓' : '✗ 不够'}`) }
    /* 回收机出的：水（马路塑料瓶 + 拾荒员工）、木柴（碎木板）、电池（废电池）、绷带（破布） */
    const recL = Math.min(5, maxLv('rec', lv) || 1), m = 1 + RECYCLER[recL].x3 * 2 + RECYCLER[recL].x10 * 9, sc = STAFF.scav, eff = 1.3, trip = sc.trip / 60;
    const types = Object.values(JUNK).filter(j => j.where === 'scav' && (GOODS[j.good].unlock || 1) <= lv).length;
    const perJunk = sc.haul * eff / types / trip * m, water = (sc.cans.bottle[0] + sc.cans.bottle[1]) / 2 * eff / trip * m;
    for (const g of ['water', 'bandage', 'firewood', 'battery']) { if ((GOODS[g].unlock || 1) > lv) continue; const have = g === 'water' ? water : perJunk;
      console.log(`  ${GOODS[g].name}：要 ${totalOf(g).toFixed(2)}/分（顾客 ${direct(g).toFixed(2)} + 加工 ${(raw[g] || 0).toFixed(2)}），一个拾荒员工 + 回收机 ${recL} 级约 ${have.toFixed(2)} ${totalOf(g) <= have ? '✓' : '⚠ 要主角也去捡'}`) }
  }
}
