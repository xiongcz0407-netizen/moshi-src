/* 模拟机器人：像真人一样出门捡垃圾、回来投回收机、建造。看各项升级大概在第几分钟完成。
   用法：node docs/sim.mjs [局数] [分钟]  */
import * as L from '../src/js/logic.js';
import { BUILD, SPAWN, JUNK_IDS, CROP_IDS, BUILD_ORDER } from '../src/js/config.js';

const RUNS = +process.argv[2] || 20, MIN = +process.argv[3] || 90;
const order = BUILD_ORDER;
const res = [];
for (let run = 0; run < RUNS; run++) {
  const S = L.newState(); const log = {}; let t = 0;
  const step = (sec) => { for (let i = 0; i < sec; i++) { L.tick(S, 1); t++; } };
  /* 货架：先放 5 种物资，多出来的货架放库存最多的蔬菜 */
  const assign = () => { const fresh = [...CROP_IDS, 'apple', 'orange'].filter(c => L.wanted(S).includes(c) || S.stock[c] > 0).sort((a, b) => (L.wanted(S).includes(b) - L.wanted(S).includes(a)) || (S.stock[b] - S.stock[a]));
    const pri = ['food', 'water', 'bandage', 'firewood', 'light'].filter(g => L.unlocked(S, g));
    let pi = 0, vi = 0;
    S.shelves.forEach((sh, i) => L.slotsOf(sh).forEach((sl, j) => { const want = sh.type === 'veg' ? fresh[vi++] : sh.type === 'fridge' ? 'water' : pri[pi++ % pri.length]; if (want && sl.g !== want) L.setShelf(S, i, want, j); })); };
  /* 种地：收熟了的，用最多的种子把空地种满 */
  const farm = () => { S.plots.forEach((p, i) => { if (p && p.left <= 0) L.harvest(S, i) });
    const best = L.cropsOpen(S).sort((a, b) => S.seeds[b] - S.seeds[a])[0]; if (S.seeds[best] > 0) L.plantAll(S, best);
    S.trees.forEach((t, i) => { if (t && t.left <= 0) L.pickTree(S, i); if (!t) { for (const sp of ['sapA', 'sapO']) if (S.treas[sp] > 0 && L.plantTree(S, i, sp)) break } }); };
  while (t < MIN * 60) {
    /* 门口马路：走过去 8 秒，每捡一件 3 秒（没有丧尸），回来 8 秒 */
    step(8);
    for (let i = 0; i < S.street.length; i++) if (S.street[i].t && L.takeSpawn(S, i, 'street')) step(3);
    step(8);
    /* 拾荒区：坐货车（读取 + 开过去 10 秒），每捡一件 5 秒，背包满或没垃圾了就回来；去的时候超市暂停营业 */
    if (L.bagCap(S) - S.bag.length > 0) {
      L.setShopPaused(true); L.cancelShop(S); step(10);
      for (let i = 0; i < L.scavSlots(S); i++) if (S.spawns[i].t && L.takeSpawn(S, i)) step(5);
      if (Math.random() < 0.25) { const lost = L.hit(S); for (const x of lost) if (Math.random() < 0.6) L.addBag(S, x.t, x.n); }
      step(10); L.setShopPaused(false);
    }
    /* 投回收机，满了就在旁边等一会再投 */
    L.unloadSeeds(S);
    let guard = 0; while (S.bag.length && guard++ < 12) { L.deposit(S); if (S.bag.length) step(5); }   // 回收机排满了最多等 1 分钟，先去收银
    step(4); farm();
    /* 走到收银台（4 秒），把排队的人结完账；挑货的人等一会儿（最多 20 秒）也结掉 */
    step(4); let w = 0;
    while ((S.queue.length || (S.shoppers.length && w < 20))) { if (S.queue.length) { L.checkout(S); step(1) } else { step(1); w++ } }
    assign();
    for (const k of order) if (L.buildInfo(S, k).ok) { L.startBuild(S, k); log[`${k}${S.builds[S.builds.length - 1].to}`] = Math.round(t / 60); }
    for (const k of Object.keys(log)) {}
  }
  res.push({ log, coins: S.coins, lv: { ...S.lv }, st: S.st, rep: S.rep, treas: S.treas, tasks: S.tasks });
}
const keys = [...new Set(res.flatMap(r => Object.keys(r.log)))].sort();
console.log(`${RUNS} 局 × ${MIN} 分钟。开始建造的分钟（中位数 / 最快 / 最慢 / 达成局数）`);
for (const k of keys) { const v = res.map(r => r.log[k]).filter(x => x != null).sort((a, b) => a - b);
  console.log(k.padEnd(8), String(v[v.length >> 1]).padStart(4), String(v[0]).padStart(4), String(v[v.length - 1]).padStart(4), `${v.length}/${RUNS}`); }
const avg = f => (res.reduce((a, r) => a + f(r), 0) / RUNS).toFixed(1);
console.log('结束时 末日币', avg(r => r.coins), '口碑', avg(r => r.rep), '回收', avg(r => r.st.rec), '卖出', avg(r => r.st.sold), '没货', avg(r => r.st.miss), '等太久走掉', avg(r => r.st.angry), '变宝', avg(r => r.st.gem));
console.log('剩余珍品', JSON.stringify(res[0].treas));
console.log('第一局：超市', res[0].lv.store, '级　收获', res[0].st.harvest, '　任务', Object.keys(res[0].tasks || {}).length);
