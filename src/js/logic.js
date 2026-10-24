/* ================= 游戏逻辑（不碰画面） =================
   存档 S 只存「剩余秒数」，不存时钟时间。在线时每帧 tick，离线时按离线秒数分段 tick。
   不玩就没有收益：离线时回收机和顾客都停下（店里排队的人也原地等着），只有建造倒计时、种菜、果树、
   物资刷新、紧缺轮换照常走。顾客：进店挑货 → 去收银台排队 → 玩家站到收银台旁边才结账付钱；等太久会生气走掉。
   模拟机器人（docs/sim.mjs）也直接用这个文件。 */
import { fbNew, fbFix } from './fblogic.js';
import { JUNK, JUNK_IDS, GOODS, GOOD_IDS, TREASURE, TREASURE_IDS, RECYCLER, SHELF_CAP, BAG_SIZES, STACK,
  BUILD, MYSTERY, STAR, WS, WS_IDS, MACH, LUCK, DISHES, recipeOf, isKit, RANCH, RANCH_IDS, PEN_CAP, FEED, FISHPOND, GUARD_GUN, SHOP, GEAR, SPAWN, STREET_SPAWN, ZOMBIE, OFFLINE_CAP, STORE, TASKS, GREENHOUSE, CROPS, CROP_IDS, ORCHARD, TREES, FARM, WAREHOUSE, FIXTURE, canHold, TD, TD_MAX, tdLevel, TOWERS, TOWER_SPOTS_N, STAFF, STAFF_JOBS, STAFF_FISH, HERO, FERT, CREW, FISH, FISH_IDS, FISH_RAR, FISHING } from './config.js';
import { defaultLayout, fixLayout, layoutProblem, setExpanded, migrateOldDefault, defaultFix, frontCell, DOOR_CELL } from './layout.js';

export const SAVE_V = 7;   // 7：设计 60 去掉经验点   // 6：设计 59 去掉主角血量升级（返还）   // 3：设计 31～33（48 种商品、12 台机器）；4：35b 第 2 台木工台换成甜品机；5：37 修新机器等级缺字段
let rng = Math.random;
export const setRng = f => { rng = f || Math.random };
const pickW = (ids, w) => { let s = 0; for (const id of ids) s += w(id); let r = rng() * s;
  for (const id of ids) { r -= w(id); if (r < 0) return id } return ids[ids.length - 1] };
/* ---------- 商品解锁：超市几级解锁（GOODS.unlock）。没解锁的：顾客不要、货柜不能摆、废街不刷、不出种子和树苗 ---------- */
export const unlocked = (S, g) => (S.lv.store || 1) >= (GOODS[g].unlock || 1);
export const junkOpen = (S, j) => unlocked(S, JUNK[j].good);
export const cropsOpen = S => CROP_IDS.filter(c => unlocked(S, c));
const randJunk = (S, where = 'scav') => { const all = JUNK_IDS.filter(j => JUNK[j].where === where), ids = all.filter(j => junkOpen(S, j)); return pickW(ids.length ? ids : all, id => JUNK[id].weight) };
const randSeed = S => { const ids = cropsOpen(S); return ids.length ? pickW(ids, c => CROPS[c].seedW) : null };
/* 废街刷新点刷出来的东西：大多是物资，偶尔是种子袋（'seed:radish' 这样的 id）；还没解锁任何菜时不刷种子 */
/* 拾荒区开几个刷新点：每解锁一种拾荒区的物资开 SPAWN.perKind 个（超市 1 级只有破布，开 6 个；2 级三种都有，开满） */
export const scavSlots = S => Math.min(SPAWN.count, SPAWN.perKind * Math.max(1, JUNK_IDS.filter(j => JUNK[j].where === 'scav' && junkOpen(S, j)).length));
/* 院子门口马路：刷新点一半固定刷铁罐、一半固定刷塑料瓶 */
const streetJunk = i => i % 2 ? 'bottle' : 'can';
/* 0.27 用户：拾荒区电池太多、别的太少（按权重随机刷，玩家捡走常用的，剩下的越积越多）—— 改成刷「地图上现在最少的那种」，几种一样多 */
const evenJunk = S => { const ids = JUNK_IDS.filter(j => JUNK[j].where === 'scav' && junkOpen(S, j)); if (!ids.length) return randJunk(S);
  const n = Object.fromEntries(ids.map(j => [j, 0])); for (const sp of S.spawns || []) if (sp.t in n) n[sp.t]++;
  const m = Math.min(...ids.map(j => n[j])); const low = ids.filter(j => n[j] === m); return low[Math.floor(rng() * low.length)] };
const randSpawn = S => { const c = rng() < FARM.seedSpawn ? randSeed(S) : null; return c ? 'seed:' + c : evenJunk(S) };
const zero = ids => Object.fromEntries(ids.map(id => [id, 0]));
export const isSeed = t => typeof t === 'string' && t.startsWith('seed:');
export const seedCrop = t => t.slice(5);

export function newState() {
  setExpanded(false);
  return {
    v: SAVE_V, gid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    savedAt: 0, srvAt: 0,
    coins: 0, rep: SHOP.repStart, gear: 0,
    bag: [],                 // 背包：[{t, n}]，同一种东西一格，一格最多 STACK 个
    stock: zero(GOOD_IDS), treas: zero(TREASURE_IDS), seeds: zero(CROP_IDS),
    lv: { store: 1, rec: 1, shelf: 2, bag: 1, gh: 0, orchard: 0, wh: 1, veg: 0, fridge: 0, camp: 1, rod: 1, pond: 0, chicken: 0, duck: 0, rabbit: 0, sheep: 0, cow: 0, pig: 0, kitchen: 0, mayo: 0, pickle: 0, jam: 0, smoke: 0, loom: 0, cheese: 0, deli: 0, wood: 0, sweet: 0, split: 0, can: 0, dry: 0 },   // 37：新机器也要有 0（以前没有 → 建造里显示「满级」）   // shelf/veg/fridge 是各自建了几个
    tasks: {},               // 完成过的升级任务 id → true
    rq: [], rp: 0, pity: 0,
    shelves: [{ type: 'shelf', tier: 1, g: 'food', n: 0 }, { type: 'shelf', tier: 1, g: 'water', n: 0 }],   // 货柜：种类、档次、放什么、放了几件
    layout: defaultLayout(), layoutV: 2, fix: defaultFix(false),   // fix：收银台、装饰摆在哪（layout.js）
    td: { scrolls: 0, day: '', used: 0, best: 0, wins: {} },   // 尸潮卷几张、今天是哪天（北京时间）、今天打了几次、打赢的最高关、每关赢过几次
    towers: Array(TOWER_SPOTS_N).fill(null),                 // 塔位：null 或 {k, lv, spent}  // 货架摆在哪：[{c, r, rot}]，见 layout.js（「布置」里可以拖动）
    plots: [],               // 温室的格子：null（空）或 {c, left, total}
    trees: [],               // 果园的树位：null（空）或 {k, left, total}
    grown: {},
    stars: 0, refTix: 0,     // 0.31 星星（新货币，设计/17）、神秘商人的刷新卷
    mys: { order: null, next: MYSTERY.first, free: true, seen: {} },   // 0.31 神秘商人：order 在院子里等着交的单；next 还有几秒来；free 这次来还能免费换一单；seen 仓库里出现过的商品
    herd: {},                // 0.28 牧场：每个棚里买了几只（棚升级只加能住几只，动物在院子商人那里买）
    pens: {},                // 0.28 牧场：每种动物的棚 {food（还够吃多少「只·秒」）, t（这一轮产了多久）, out（产出来还没收的）}
    staff: [],               // 员工：{id, name, q, lv, job, spent, look, fed}（见下面「员工」）
    staffDay: '', nextStaff: 1, farmT: 0, cashT: 0, pendingStaff: null, pile: [], mallDay: '', fert: 0, builds: [], crewBuy: 0, bt50: 1, plotPlan: [],   // plotPlan[i]：员工给第 i 块地补种什么（null = 自动）
      // builds：正在建的（施工队几个就能同时建几个）
      // pile：拾荒员工带回来、堆在货车旁的物资
      // pendingStaff：营地住满时救回来、还没决定留不留的人               // 种出来过的菜和水果：种出来过，顾客才会开始要
    spawns: Array.from({ length: SPAWN.count }, (_, i) => ({ t: i < SPAWN.perKind ? randSpawn({ lv: { store: 1 } }) : null, left: 0 })),        // 拾荒区地图里的物资
    street: Array.from({ length: STREET_SPAWN.count }, (_, i) => ({ t: streetJunk(i), left: 0 })),   // 院子门口马路上的（只有铁罐、塑料瓶）
    drops: [],               // 被丧尸碰掉在地上的：{t, n, x, z}
    cust: 8,
    shoppers: [],            // 正在店里挑货的顾客 {id,g,qty,pay,left}
    queue: [],               // 在收银台排队的顾客 {id,g,qty,pay,left}，排在最前面的先结账
    nextId: 1,
    short: { g: 'water', left: SHOP.shortEvery },
    st: { junk: 0, rec: 0, x3: 0, x10: 0, gem: 0, sold: 0, earned: 0, miss: 0, angry: 0, served: 0, harvest: 0, hits: 0, play: 0, builds: 0, fish: 0 },
    awayOn: false, awayBank: 0,       // 离开超市期间收银员收的钱
    guns: [], fishLic: false, rodDur: 0, bait: { worm: 0, corn: 0 }, fishQ: {},   // 钓鱼：垂钓证、鱼竿耐久、饵料、仓库里每种鱼几条（总数在 stock.fish）
    hero: { dmg: 1, rate: 1, range: 1, nade: 1 },  // 0.20 主角属性；V1.01 M16 拆成伤害、射速、射程三条
    fb: fbNew(),             // 设计 56 副本：打赢过的关、装备背包、身上的装备、晶石、技能等级、上次打赢的奖励（pend 还没收下的装备）
  };
}

/* 读档时补齐缺的字段（以后加字段不会弄坏旧存档） */
export function migrate(o) {
  if (!o || typeof o !== 'object' || !o.lv) return null;
  const layV = o.layoutV || 0, sv = o.v || 1;
  const bt50 = o.bt50;                            // 同上：0.13 建造时间减半前的存档没有这个                    // 先记下来：下面补字段会把它填成新版本
  /* 0.28 用户：动物要买，不再盖棚就送。之前测试版盖了棚的存档：动物清空，按送的那些退一半钱 */
  if (o.herd === undefined && o.lv) { let back = 0; for (const k of RANCH_IDS) if (o.lv[k] > 0) back += Math.round(PEN_CAP[o.lv[k]] * RANCH[k].price / 2); if (back) { o.coins = (o.coins || 0) + back; o.herdRefund = back } o.herd = {} }
  const d = newState();
  for (const k of Object.keys(d)) if (o[k] === undefined) o[k] = d[k];
  for (const k of ['stock', 'treas', 'seeds', 'st', 'lv', 'td', 'bait', 'hero']) o[k] = Object.assign({}, d[k], o[k]);
  fbFix(o);
  delete o.xp; if (o.td && o.td.wins) o.td.best = tdCleared(o)   /* 设计 61：best 跟打赢过的关一致 */;   // 设计 60：经验点去掉了（旧存档直接删）
  /* 设计 59：主角血量不升级了。升过的退回末日币（每级 100×n）和工具箱，进游戏提示一次 */
  if (o.hero && o.hero.hp > 1) { let c = 0, t = 0; for (let n = 2; n <= o.hero.hp; n++) { const k = HERO.cost(n); c += k.coins; t += k.toolbox } o.coins = (o.coins || 0) + c; o.treas.toolbox = (o.treas.toolbox || 0) + t; o.hpRefund = { coins: c, toolbox: t, lv: o.hero.hp } }
  if (o.hero) delete o.hero.hp;
  /* 0.13 菜长得快了：地里已经种着的，剩余时间不超过新的生长时间 */
  o.trees.forEach(t => { if (t && TREES[t.k] && t.total > TREES[t.k].every) { t.left = Math.min(t.left, TREES[t.k].every); t.total = TREES[t.k].every } });   // 0.27 果树改成 15 分钟：已经种着的剩余时间也缩短
  o.plots.forEach(p => { if (p && CROPS[p.c] && p.total > CROPS[p.c].time) { p.left = Math.min(p.left, CROPS[p.c].time); p.total = CROPS[p.c].time } });
  /* 0.13 以前只有一个施工队：S.build → S.builds */
  if (o.build) { o.builds.push(o.build) } delete o.build;
  /* 0.13 建造时间减半：已经在建的剩余时间也减半（只做一次） */
  if (!bt50) { for (const b of o.builds) { b.left = Math.round(b.left / 2); b.total = Math.round(b.total / 2) } o.bt50 = 1 }
  while (o.towers.length < TOWER_SPOTS_N) o.towers.push(null);
  /* 0.02 以前的背包是一件一件的，改成按种类叠起来 */
  if (o.bag.length && typeof o.bag[0] === 'string') { const old = o.bag; o.bag = []; for (const t of old) addBag(o, t, 1, true) }
  o.drops = o.drops.map(x => ({ n: 1, ...x }));
  while (o.spawns.length < SPAWN.count) o.spawns.push({ t: null, left: SPAWN.respawn });
  /* V1.01：松露饭 → 肉松饭；松露（以后种的松茸）先不卖——货柜上的松露、松露饭退回仓库换成钱（松露 40、松露饭 140） */
  if (o.stock.truffrice) { o.coins += o.stock.truffrice * 140; delete o.stock.truffrice }
  if (sv < 3) { for (const sh of o.shelves || []) for (const sl of slotsOf(sh)) if (sl.g === 'truffrice' || sl.g === 'truffle') { o.coins += (sl.n || 0) * (sl.g === 'truffle' ? 40 : 140); sl.g = null; sl.n = 0 }
    if (o.stock.truffle) { o.coins += o.stock.truffle * 40; o.stock.truffle = 0 } }   // 设计 33 起松茸能种了，只有旧存档才换钱
  if (o.grown) delete o.grown.truffrice;
  for (const M of Object.values(o.ws || {})) for (const l of M.lines || []) if (l.out === 'tin' && l.n == null) l.n = 3;   /* 设计 73：V5.61 存档里正在拆的罐头照旧出 3 张铁皮（以后开工的线都记着 n） */
  if (o.mys && o.mys.order) for (const it of o.mys.order.items || []) if (it.g === 'truffrice' || it.g === 'truffle') it.g = it.g === 'truffle' ? 'pork' : 'flossrice';
  /* 设计 31～33（存档版本 3）：布 → 毛衣、苹果派 → 炸茄条；货柜上的原料（木柴、蛋、毛、牛奶）下面统一退回仓库；神秘商人的单里要原料的换成用它做的东西；
     工坊里做着已经没有的东西的线清空；老玩家进游戏提示一次木柴的改动 */
  if (sv < 3) {
    for (const sh of o.shelves || []) for (const sl of slotsOf(sh)) if (sl.g && GOODS[sl.g] && GOODS[sl.g].gone) { o.stock[sl.g] = (o.stock[sl.g] || 0) + (sl.n || 0); sl.g = null; sl.n = 0 }
    for (const [g, G] of Object.entries(GOODS)) if (G.gone && o.stock[g]) { o.stock[G.gone] = (o.stock[G.gone] || 0) + o.stock[g]; o.stock[g] = 0 }
    const SWAP = { firewood: 'charcoal', egg: 'mayo', duckegg: 'saltegg', fur: 'hat', wool: 'sweater', milk: 'cheese', pork: 'floss', cloth: 'sweater', applepie: 'eggplantfry' };
    if (o.mys && o.mys.order) for (const it of o.mys.order.items || []) if (SWAP[it.g]) it.g = SWAP[it.g];
    for (const M of Object.values(o.ws || {})) { for (const l of M.lines || []) if (l.out && (!GOODS[l.out] || GOODS[l.out].gone)) { l.out = null; l.t = 0; l.inp = null } if (M.plan && (!GOODS[M.plan] || GOODS[M.plan].gone)) M.plan = null; for (const l of M.lines || []) if (l.plan && (!GOODS[l.plan] || GOODS[l.plan].gone)) l.plan = null }
    if (o.fert) { o.coins += o.fert * FERT.price; o.fert = 0 }   // 35 用户：肥料去掉了，剩下的按原价退成末日币
    if ((o.lv.store || 1) >= 2) o.notice61 = true;
  }
  /* 37：所有建筑的等级都要是数字（新机器在旧存档里是 undefined，建造里显示「满级」盖不了） */
  for (const k of Object.keys(BUILD)) if (BUILD[k].gone) continue; else if (typeof o.lv[k] !== 'number' || isNaN(o.lv[k])) o.lv[k] = 0;
  /* 35b：第 2 台木工台换成甜品机：已经盖了（或正在盖）的拆掉，花的末日币和工具箱全退 */
  if (sv < 4) {
    const lv2 = (o.lv && o.lv.wood2) || 0, ref = { coins: 0, toolbox: 0 }, add = L => { const c = BUILD.wood2.levels[L]; if (c) { ref.coins += c.coins; for (const [id, n] of Object.entries(c.need || {})) ref[id] = (ref[id] || 0) + n } };
    for (let L = 1; L <= lv2; L++) add(L);
    o.builds = (o.builds || []).filter(b => { if (b.k !== 'wood2') return true; add(b.to); return false });
    if (o.lv) delete o.lv.wood2; if (o.ws) delete o.ws.wood2; if (o.fix && o.fix.ws) o.fix.ws = o.fix.ws.filter(w => w.k !== 'wood2');
    if (ref.coins) { o.coins = (o.coins || 0) + ref.coins; o.treas = o.treas || {}; for (const [id, n] of Object.entries(ref)) if (id !== 'coins' && n) o.treas[id] = (o.treas[id] || 0) + n; o.notice62 = ref }
  }
  for (const g of Object.keys(o.stock)) if (!GOODS[g]) delete o.stock[g];
  for (const g of GOOD_IDS) if (o.stock[g] == null) o.stock[g] = 0;
  while (o.shelves.length < o.lv.shelf) o.shelves.push({ g: null, n: 0 });
  /* 0.05 以前的货架没有种类、档次；蔬菜水果改成只能放果蔬架，原来放在普通货架上的退回仓库 */
  for (const sh of o.shelves) { sh.type = sh.type || 'shelf'; sh.tier = sh.tier || 1; normSlots(o, sh);
    for (const sl of slotsOf(sh)) if (sl.g && (!canHold(sh.type, sl.g) || !unlocked(o, sl.g))) { slotBack(o, sl, sl.n); sl.g = null; sl.n = 0; delete sl.fq } }   // 没解锁的、放错柜子的退回仓库
  /* 0.07 以前没有 grown：仓库里有的、货柜上摆着的、地里树上长着的，都算种出来过 */
  for (const g of GOOD_IDS) if (GOODS[g].fresh && (o.stock[g] > 0 || o.shelves.some(sh => slotsOf(sh).some(sl => sl.g === g)) || o.plots.some(p => p && p.c === g) || o.trees.some(t => t && t.k === g))) o.grown[g] = true;
  o.staff.forEach(p => { if (p.trip && p.trip.left > STAFF.scav.trip) p.trip = { left: STAFF.scav.trip, total: STAFF.scav.trip } });   // 0.15：拾荒改成 2 分钟一趟
  if ((o.stock.fish || 0) > 0 || Object.values(o.fishQ || {}).some(n => n > 0) || o.shelves.some(sh => slotsOf(sh).some(sl => sl.g === 'fish'))) (o.grown = o.grown || {}).fish = true;   // 0.23：老存档有鱼就算钓到过
  /* V1.01 工坊多条线：以前 {t, cur(原料或菜)} → {lines:[{t, out, inp}], plan} */
  for (const [k, M] of Object.entries(o.ws || {})) if (!M.lines) { const line = { t: M.t || 0, out: null, inp: null };
    if (M.cur) { if (k === 'kitchen') line.out = DISHES[M.cur] ? M.cur : null; else { const r = (MACH[k] && MACH[k].recipes.find(x => x.need && x.need[M.cur])); line.out = r ? r.out : null; line.inp = M.cur } if (!line.out) line.t = 0 }
    o.ws[k] = { lines: [line], plan: null } }
  if (o.hero && o.hero.gun) { const g = o.hero.gun; o.hero.dmg = o.hero.dmg || g; o.hero.rate = o.hero.rate || g; o.hero.range = o.hero.range || 1; delete o.hero.gun }   // V1.01 M16 一条拆成三条：原来的等级伤害、射速都保留
  /* V1.11 用户：员工的 M16 也分开升（伤害 / 射速 / 射程），以前一把枪一个等级 → {dmg, rate, range} */
  const g3 = g => typeof g === 'number' ? (g > 0 ? { dmg: g, rate: g, range: 1 } : 0) : g;
  o.guns = (o.guns || []).map(g3).filter(Boolean); o.staff.forEach(p => { p.gun = g3(p.gun || 0) });
  o.staff.forEach(p => { if (p.job === 'guard') p.job = 'rest'; if (p.fed == null) p.fed = true; delete p.hp; delete p.heal; delete p.hurtT });   // 设计 68：员工不会受伤，旧存档的血量、疗伤记录清掉
  if (o.lv) delete o.lv.hosp;   // 设计 68：医院去掉（V1.01 起就不能盖了）
  while (o.street.length < STREET_SPAWN.count) o.street.push({ t: streetJunk(o.street.length), left: 0 });
  o.street.forEach((s, i) => { if (s.t) s.t = streetJunk(i) });   // 0.13：铁罐、塑料瓶一半一半
  o.spawns.forEach(sp => { if (sp.t && !isSeed(sp.t) && (!junkOpen(o, sp.t) || JUNK[sp.t].where !== 'scav')) sp.t = randJunk(o);   // 0.07：铁罐、塑料瓶只在门口马路，拾荒区里换成别的
    if (sp.t && isSeed(sp.t) && !unlocked(o, seedCrop(sp.t))) sp.t = randJunk(o) });
  syncFarm(o); migrateOldDefault(o, layV); fixLayout(o);
  /* 42：以前有几处往仓库加东西没看上限（回收机 ×3 / ×10、货柜退货、顾客退货），旧存档里超过上限的压回上限 */
  for (const g of GOOD_IDS) if ((o.stock[g] || 0) > stockCap(o, g)) { o.stock[g] = stockCap(o, g); if (g === 'fish' && o.fishQ) { let k = Object.values(o.fishQ).reduce((a, n) => a + n, 0) - o.stock.fish; for (const id of Object.keys(o.fishQ)) { const d = Math.min(k, o.fishQ[id]); o.fishQ[id] -= d; k -= d } } }
  o.v = SAVE_V;
  return o;
}

export const bagCap = S => BAG_SIZES[S.lv.bag];
/* 货柜：每个能放几件、售价倍数；店里一共能放几个货柜（看超市等级） */
export const capOf = sh => FIXTURE[sh.type || 'shelf'].cap[(sh.tier || 1) - 1];      // 果蔬架是「每种」能放几件
/* 果蔬架一个能放好几种（低档 2、中档 3、高档 4）：第一种存在货柜本身（sh.g / sh.n），其余的在 sh.x 里 */
export const kindsOf = sh => { const k = FIXTURE[sh.type || 'shelf'].kinds; return k ? k[(sh.tier || 1) - 1] : 1 };
export const slotsOf = sh => sh.x ? [sh, ...sh.x] : [sh];
export function normSlots(S, sh) {
  const k = kindsOf(sh); if (k <= 1 && !sh.x) return;
  sh.x = sh.x || []; while (sh.x.length < k - 1) sh.x.push({ g: null, n: 0 });
  while (sh.x.length > k - 1) { const sl = sh.x.pop(); if (sl.g && sl.n) slotBack(S, sl, sl.n) }
  for (const sl of slotsOf(sh)) if (sl.n > capOf(sh)) { slotBack(S, sl, sl.n - capOf(sh)); sl.n = capOf(sh) }
  if (!sh.x.length) delete sh.x;
}
/* 店里所有货柜加起来，某种东西摆了几件 */
/* ---------- 鱼：仓库里 S.stock.fish 是总数，S.fishQ 记每种几条；货柜上的鱼在 sl.fq 里一条一条记（顾客买走哪条按哪条的价钱） ---------- */
export const isFish = t => typeof t === 'string' && t.startsWith('fish:');
export const fishOf = t => t.slice(5);
export const isJunk = t => !!JUNK[t];
export function fishIn(S, ids) { S.fishQ = S.fishQ || {}; const room = whRoom(S, 'fish'); if (ids.length > room) { lostQ.push({ type: 'whLost', g: 'fish', n: ids.length - room }); ids = ids.slice(0, room) }   // 42：池塘放不下的丢掉
  for (const id of ids) S.fishQ[id] = (S.fishQ[id] || 0) + 1; S.stock.fish += ids.length; if (ids.length) (S.grown = S.grown || {}).fish = true }   // 0.23 修：员工钓回来的鱼以前不算「钓到过」，顾客一直不来买鱼
function fishOut(S, n) {
  S.fishQ = S.fishQ || {}; const out = [];
  while (out.length < n) { const ids = FISH_IDS.filter(i => S.fishQ[i] > 0); if (!ids.length) break; const id = pickW(ids, i => S.fishQ[i]); S.fishQ[id]--; out.push(id) }   // 按数量随机拿，各种鱼混着上架
  S.stock.fish -= out.length; return out;
}
/* 货柜上的 n 件退回仓库（鱼要把是哪几条一起退回去） */
function slotBack(S, sl, n) {
  if (!sl.g || n <= 0) return;
  if (sl.g !== 'fish') { putStock(S, sl.g, n); return }   // 42：放不下的丢掉
  const ids = (sl.fq || []).splice(-n); fishIn(S, ids); if (ids.length < n) putStock(S, 'fish', n - ids.length);
}
export const onShelves = (S, g) => S.shelves.reduce((a, sh) => a + slotsOf(sh).reduce((b, sl) => b + (sl.g === g ? sl.n : 0), 0), 0);
export const isOnShelf = (S, g) => S.shelves.some(sh => slotsOf(sh).some(sl => sl.g === g));
export const multOf = sh => FIXTURE[sh.type || 'shelf'].mult[(sh.tier || 1) - 1];
export const fixtureMax = S => STORE[S.lv.store].shelves;
export const hasType = (S, t) => S.shelves.some(sh => sh.type === t);
/* 新货柜建好后会摆在哪：在副本上跑一遍 fixLayout（和真的建好时一样）；放不下返回 null */
export function spotFor(S, t) {
  const c = { lv: S.lv, shelves: [...S.shelves, { type: t }], layout: (S.layout || []).map(x => x && { ...x }) };
  fixLayout(c); const s = c.layout[c.shelves.length - 1]; return s && !layoutProblem(c.layout, c.shelves.length) ? s : null;
}
/* 仓库：每种商品的上限；满了回收机停下、菜收不了（东西不会丢） */
export const whCap = S => WAREHOUSE[S.lv.wh || 1];
/* 0.22：鱼不放仓库了，放池塘（没盖池塘时放水桶）；容量看池塘等级 */
export const pondCap = S => FISHPOND.cap[S.lv.pond || 0];
export const stockCap = (S, g) => g === 'fish' ? pondCap(S) : whCap(S);
export const whRoom = (S, g) => Math.max(0, stockCap(S, g) - (S.stock[g] || 0));
export const pondWhere = S => S.lv.pond ? '池塘' : '水桶';
export const whFull = (S, g) => whRoom(S, g) <= 0;
/* 42：往仓库加东西都走这里：放得下多少加多少，放不下的丢掉，记一条 whLost（下一次 tick 发给 main.js 提示「仓库 ×× 满了」）；返回实际加了几个 */
const lostQ = [];
export function putStock(S, g, n) {
  const k = Math.max(0, Math.min(n, whRoom(S, g))); S.stock[g] = (S.stock[g] || 0) + k;
  if (n > k) lostQ.push({ type: 'whLost', g, n: n - k }); return k;
}
/* 设计 41：工匠的停手线跟着仓库变：仓库里这样产品有这么多就先做别的 */
export const wsEnough = S => Math.max(WS.enough, Math.round(whCap(S) * WS.enoughK));
/* 回收机：跳过仓库已经放满的那几种，先处理放得下的；全都放不下才停 */
export const pileLive = S => (S.pile || []).filter(j => !whFull(S, JUNK[j].good)).length;   // 堆里仓库还放得下的件数
/* 42：先回收仓库里最少的那种（以前按排队顺序，铁罐、瓶子常常占着回收机，出来的 ×10 又放不下丢掉，绷带反而不够） */
export const recNext = S => { let best = -1, bv = Infinity; S.rq.forEach((t, i) => { const g = JUNK[t].good; if (whFull(S, g)) return; const v = (S.stock[g] || 0) + onShelves(S, g); if (v < bv) { bv = v; best = i } }); return best };
export const recBlocked = S => !!S.rq.length && recNext(S) < 0;
export const recFullGoods = S => [...new Set(S.rq.map(t => JUNK[t].good).filter(g => whFull(S, g)))];
export const bagCount = S => S.bag.reduce((a, s) => a + s.n, 0);
export const recCfg = S => RECYCLER[S.lv.rec];
export const storeCfg = S => STORE[S.lv.store];
export const isShort = (S, g) => S.short && S.short.g === g;
export const priceOf = (S, g) => Math.round(GOODS[g].price * (isShort(S, g) ? SHOP.shortPrice : 1));
export const custGap = S => SHOP.custBase * (1.4 - S.rep / 100) / storeCfg(S).traffic;
/* 顾客想买的东西：蔬菜水果要超市到一定等级才有人买 */
export const wanted = S => GOOD_IDS.filter(g => unlocked(S, g) && !GOODS[g].raw && (!GOODS[g].only || hasType(S, GOODS[g].only)) && (GOODS[g].craft ? S.lv[GOODS[g].craft] > 0 && !!(S.grown && S.grown[g]) : GOODS[g].dish ? S.lv.kitchen > 0 && hasType(S, 'deli') && !!(S.grown && S.grown[g]) : g === 'fish' ? hasType(S, 'fridge') && S.grown && S.grown.fish : GOODS[g].ranch ? S.lv[GOODS[g].ranch] > 0 && S.grown && S.grown[g] && (g !== 'milk' || hasType(S, 'fridge')) : !GOODS[g].fresh || (hasType(S, 'veg') && S.grown && S.grown[g])));   // 0.28 牧场的：盖了棚、收到过才有人买（牛奶还要有冰柜）   // 鱼：有冰柜、钓到过才有人来买   // 解锁了的都有人要；蔬菜水果：有果蔬架、并且种出来过才有人来买

/* ---------- 背包 ---------- */
export function bagRoom(S, t) { const s = S.bag.find(x => x.t === t && x.n < STACK); return s ? STACK - s.n : S.bag.length < bagCap(S) ? STACK : 0 }
/* 放进背包，返回放进去几个；force=true 时不管格数（读旧存档用） */
export function addBag(S, t, n = 1, force) {
  let left = n;
  for (const s of S.bag) { if (!left) break; if (s.t === t && s.n < STACK) { const k = Math.min(left, STACK - s.n); s.n += k; left -= k } }
  while (left > 0 && (force || S.bag.length < bagCap(S))) { const k = Math.min(left, STACK); S.bag.push({ t, n: k }); left -= k }
  return n - left;
}
/* 整理背包：同一种东西合并成满格（20 个一格），按 物资（铁罐→塑料瓶→破布→碎木板→废电池）→ 种子 的顺序排，同种的满格在前 */
export function sortBag(S) {
  const before = S.bag.length, tot = new Map();
  for (const s of S.bag) tot.set(s.t, (tot.get(s.t) || 0) + s.n);
  const rank = t => isSeed(t) ? 100 + CROP_IDS.indexOf(seedCrop(t)) : isFish(t) ? 200 + FISH_IDS.indexOf(fishOf(t)) : JUNK_IDS.indexOf(t);
  S.bag = [];
  for (const t of [...tot.keys()].sort((a, b) => rank(a) - rank(b))) { let n = tot.get(t); while (n > 0) { const k = Math.min(STACK, n); S.bag.push({ t, n: k }); n -= k } }
  return before - S.bag.length;                  // 空出来几格
}
function takeOne(S, pred) { const i = S.bag.findIndex(s => pred(s.t)); if (i < 0) return null; const s = S.bag[i]; s.n--; if (!s.n) S.bag.splice(i, 1); return s.t }

/* ---------- 玩家操作 ---------- */
export function pickup(S, t) { if (!addBag(S, t, 1)) return false; if (isJunk(t)) S.st.junk++; return true }
export function takeSpawn(S, i, pool = 'spawns') { const s = S[pool][i]; if (!s || !s.t) return false;
  if (!pickup(S, s.t)) return false; s.t = null; s.left = pool === 'street' ? STREET_SPAWN.respawn : SPAWN.respawn; return true }
export function takeDrop(S, i) { const d = S.drops[i]; if (!d) return false;
  const k = addBag(S, d.t, d.n); if (!k) return false; d.n -= k; if (d.n <= 0) S.drops.splice(i, 1); return true }

/* 走到回收机旁：种子直接放进仓库，物资一件一件进排队 */
export function unloadSeeds(S) {
  let n = 0;
  for (let i = S.bag.length - 1; i >= 0; i--) { const s = S.bag[i]; if (!isSeed(s.t)) continue; S.seeds[seedCrop(s.t)] += s.n; n += s.n; S.bag.splice(i, 1) }
  return n;
}
/* 丢掉背包第 i 格里的 n 条鱼（只能丢鱼） */
/* 背包里丢东西（0.18 起什么都能丢：物资、种子、鱼） */
/* 0.25 仓库丢东西（返回丢了几个） */
export function dropStock(S, g, n) { const k = Math.max(0, Math.min(n, S.stock[g] || 0)); S.stock[g] -= k; return k }
export function dropItem(S, i, n) { const s = S.bag[i]; if (!s || n <= 0) return 0; const k = Math.min(n, s.n); s.n -= k; if (!s.n) S.bag.splice(i, 1); return k }
export function dropFish(S, i, n) { const s = S.bag[i]; if (!s || !isFish(s.t) || n <= 0) return 0; const k = Math.min(n, s.n); s.n -= k; if (!s.n) S.bag.splice(i, 1); return k }
/* 钓到的鱼：放进仓库（仓库满了的留在背包里） */
export function unloadFish(S) {
  let n = 0;
  for (let i = S.bag.length - 1; i >= 0; i--) { const s = S.bag[i]; if (!isFish(s.t)) continue; const k = Math.min(s.n, whRoom(S, 'fish')); if (!k) continue;
    fishIn(S, Array(k).fill(fishOf(s.t))); s.n -= k; n += k; if (!s.n) S.bag.splice(i, 1) }
  if (n) { S.grown = S.grown || {}; S.grown.fish = true; restock(S) }
  return n;
}
export function deposit(S) { let n = 0; while (S.rq.length < recCfg(S).queue) { const t = takeOne(S, isJunk); if (!t) break; S.rq.push(t); n++ } return n }
export function depositOne(S) {
  if (!S.bag.some(s => isJunk(s.t))) return null; if (S.rq.length >= recCfg(S).queue) return false;
  const t = takeOne(S, isJunk); S.rq.push(t); return t;
}

/* 被丧尸碰到：每种东西掉 30%（向上取整），返回 [{t, n}] */
export function hit(S) {
  S.st.hits++; const out = [];
  for (let i = S.bag.length - 1; i >= 0; i--) { const s = S.bag[i], k = Math.ceil(s.n * ZOMBIE.dropRate); s.n -= k; out.push({ t: s.t, n: k }); if (!s.n) S.bag.splice(i, 1) }
  return out;
}

export function setShelf(S, i, g, j = 0) {
  const sh = S.shelves[i]; if (!sh) return; const sl = slotsOf(sh)[j]; if (!sl || sl.g === g) return;
  if (g && (!canHold(sh.type || 'shelf', g) || !unlocked(S, g))) return;   // 设计 45：同一种货能摆好几个货柜、同一个货柜的好几层
  if (sl.g && sl.n) slotBack(S, sl, sl.n);
  sl.g = g; sl.n = 0; if (g === 'fish') sl.fq = []; else delete sl.fq; restock(S);
}

/* ---------- 升级任务 ---------- */
export const stageTasks = S => TASKS[S.lv.store] || [];
export const taskDone = (S, t) => !!S.tasks[t.id];
export const allTasksDone = S => stageTasks(S).every(t => S.tasks[t.id]);
function checkTasks(S, ev) {
  for (const t of stageTasks(S)) if (!S.tasks[t.id] && t.prog(S) >= t.goal) {
    S.tasks[t.id] = true;
    if (t.reward.coins) { S.coins += t.reward.coins; S.st.earned += t.reward.coins }
    if (t.reward.gear) S.gear += t.reward.gear;
    ev.push({ type: 'task', id: t.id, name: t.name, reward: t.reward, all: allTasksDone(S) });
  }
}

/* ---------- 建造 ---------- */
export function buildInfo(S, k) {
  const b = BUILD[k], cur = S.lv[k] || 0, to = cur + 1, L = b.levels[to];
  if (!L) return { max: true, cur };
  if (L.locked) return { cur, to, cost: L, lack: [L.why || '以后开放'], ok: false, locked: true };
  if (L.store && S.lv.store < L.store) return { cur, to, cost: L, lack: [`需要超市 ${L.store} 级`], ok: false, needStore: L.store };
  if (k === 'rod' && !S.fishLic) return { cur, to, cost: L, lack: ['先买垂钓证（第一次去码头坐船时买）'], ok: false, locked: true };
  if (FIXTURE[k] && !spotFor(S, k)) return { cur, to, cost: L, lack: ['店里放不下了，先在「布置」里挪一挪，或者升级超市（店面变大）'], ok: false, locked: true, noRoom: true };   // 设计 39：货柜不限数量，只看店里有没有空位
  const lack = [];
  if (b.main && !allTasksDone(S)) lack.push('还有升级任务没完成');
  if (L.td && !(tdCleared(S) >= L.td)) lack.push(`要通关尸潮第 ${L.td} 关`);   // 设计 60
  if (S.coins < L.coins) lack.push(`末日币差 ${L.coins - Math.floor(S.coins)}`);
  for (const [id, n] of Object.entries(L.need)) if ((S.treas[id] || 0) < n) lack.push(`${TREASURE[id].name}差 ${n - (S.treas[id] || 0)}`);
  { const bl = busyLack(S, k); if (bl) lack.unshift(bl) }
  return { cur, to, cost: L, lack, ok: !lack.length };
}
/* 单个货柜升档：也占建造队列 */
export function tierInfo(S, i) {
  const sh = S.shelves[i]; if (!sh) return null;
  const to = (sh.tier || 1) + 1, L = BUILD.tier.levels[to];
  if (!L) return { max: true, cur: sh.tier };
  if (L.store && S.lv.store < L.store) return { cur: sh.tier, to, cost: L, lack: [`需要超市 ${L.store} 级`], ok: false, needStore: L.store };
  const lack = [];
  if (S.coins < L.coins) lack.push(`末日币差 ${L.coins - Math.floor(S.coins)}`);
  for (const [id, n] of Object.entries(L.need)) if ((S.treas[id] || 0) < n) lack.push(`${TREASURE[id].name}差 ${n - (S.treas[id] || 0)}`);
  { const bl = busyLack(S, 'tier', i); if (bl) lack.unshift(bl) }
  return { cur: sh.tier, to, cost: L, lack, ok: !lack.length };
}
export function startTier(S, i) {
  const inf = tierInfo(S, i); if (!inf || !inf.ok) return false;
  S.coins -= inf.cost.coins; for (const [id, n] of Object.entries(inf.cost.need)) S.treas[id] -= n;
  S.builds.push({ k: 'tier', i, to: inf.to, left: inf.cost.time, total: inf.cost.time }); return true;
}
export function startBuild(S, k) {
  const inf = buildInfo(S, k); if (!inf.ok) return false;
  S.coins -= inf.cost.coins;
  for (const [id, n] of Object.entries(inf.cost.need)) S.treas[id] -= n;
  S.builds.push({ k, to: inf.to, left: inf.cost.time, total: inf.cost.time });
  return true;
}
export function sellTreasure(S, id) { if (!(S.treas[id] > 0)) return false;
  S.treas[id]--; S.coins += TREASURE[id].sell; S.st.earned += TREASURE[id].sell; return true }
/* 商城：发条（gear）按包卖（35：肥料去掉了） */
const MALL = { gear: GEAR };
export const itemCost = (k, n) => { const I = MALL[k], p = I.packs.find(x => x[0] === n); return Math.round(I.price * n * (p ? p[1] : 1)) };
export const gearCost = n => itemCost('gear', n);
export function buyItem(S, k, n = 1) { if (!MALL[k] || k === 'gear') return false;   /* 0.31 用户：发条不再用末日币买，只能用星星换 */ const c = itemCost(k, n); if (S.coins < c) return false; S.coins -= c; S[k] = (S[k] || 0) + n; return true }
export const buyGear = (S, n = 1) => buyItem(S, 'gear', n);
/* 商城每天免费领：day 是北京时间的日期 */
/* 设计 43：今天的免费发条还没领（商人头顶、商店那一格、补给页签红点都看这个；day 用北京时间的日期） */
export const freeReady = (S, day) => !!day && S.mallDay !== day;
export function freeGear(S, day) { if (S.mallDay === day) return false; S.mallDay = day; S.gear += GEAR.free; return true }
export function useGear(S, idx = 0, ev = []) { const b = S.builds[idx]; if (!S.gear || !b) return false; S.gear--; b.left -= GEAR.cut;
  if (b.left <= 0) finishBuild(S, b, ev); return true }
/* 施工队：一开始 1 个，商城能再买 CREW.cost.length 个（永久） */
export const crews = S => 1 + (S.crewBuy || 0);
export const crewFull = S => S.builds.length >= crews(S);
export const crewNext = S => CREW.cost[S.crewBuy || 0];                    // 下一个多少钱；undefined = 买满了
export function buyCrew(S) { const c = crewNext(S); if (c == null || S.coins < c) return false; S.coins -= c; S.crewBuy = (S.crewBuy || 0) + 1; return true }
export const busyWith = (S, k, i) => S.builds.find(b => b.k === k && (i == null || b.i === i));
function busyLack(S, k, i) { if (busyWith(S, k, i)) return k === 'tower' ? '正在升级' : '正在建造'; if (crewFull(S)) return '施工队都在忙'; return null }

function finishBuild(S, b, ev) {
  const j = S.builds.indexOf(b); if (j < 0) return;
  S.builds.splice(j, 1); S.st.builds++;
  if (b.k === 'tower') { const t = S.towers[b.i]; if (t) t.lv = b.to; ev.push({ type: 'built', k: b.k, to: b.to, i: b.i }); return }
  if (b.k === 'tier') { const sh = S.shelves[b.i]; if (sh) { sh.tier = b.to; normSlots(S, sh) } restock(S); ev.push({ type: 'built', k: b.k, to: b.to, i: b.i }); return }
  S.lv[b.k] = b.to;
  if (b.k === 'rod') S.rodDur = rodCfg(S).dur;          // 鱼竿升级：耐久补满到新的上限
  if (FIXTURE[b.k]) { const sh = { type: b.k, tier: 1, g: null, n: 0 }; normSlots(S, sh); S.shelves.push(sh); fixLayout(S); restock(S) }
  if (b.k === 'store' || BUILD[b.k].ws) fixLayout(S);   // 超市 3 级：网格多出工坊；0.42 工坊的机器盖好了：摆到默认位置
  syncFarm(S);
  ev.push({ type: 'built', k: b.k, to: b.to });
}

/* ---------- 温室和果园 ---------- */
export const plotCount = S => S.lv.gh ? GREENHOUSE[S.lv.gh].plots : 0;
function syncFarm(S) {
  while (S.plots.length < plotCount(S)) S.plots.push(null);
  while (S.trees.length < ORCHARD[S.lv.orchard]) S.trees.push(null);
}
export function plant(S, i, c) {
  if (!CROPS[c] || !unlocked(S, c)) return false;
  if (i < 0 || i >= plotCount(S) || S.plots[i] || !(S.seeds[c] > 0)) return false;
  const t = Math.round(CROPS[c].time / GREENHOUSE[S.lv.gh].speed);
  S.seeds[c]--; S.plots[i] = { c, left: t, total: t }; return true;
}
/* 把空格子都种上（种子不够就种到没有为止） */
export function plantAll(S, c) { let n = 0; for (let i = 0; i < plotCount(S); i++) if (!S.plots[i] && plant(S, i, c)) n++; return n }
/* 0.27：新收的菜/水果果蔬架上还没摆 → 有空的格子就自动摆上；没空格子返回 'none' 让界面提醒 */
function autoVeg(S, g) {
  if (!S.shelves.some(sh => sh.type === 'veg')) return null;
  if (S.shelves.some(sh => slotsOf(sh).some(sl => sl.g === g))) return null;
  for (const sh of S.shelves) if (sh.type === 'veg') { normSlots(S, sh); const sl = slotsOf(sh).find(o => !o.g); if (sl) { sl.g = g; sl.n = 0; return 'put' } }
  return 'none';
}
/* force（设计 41，员工收）：仓库放不下也收，放不下的丢掉（lost），不然熟了的地一直占着，别的菜种不下去 */
export function harvest(S, i, force) {
  const p = S.plots[i]; if (!p || p.left > 0) return null;
  const n0 = CROPS[p.c].yield; if (!force && whRoom(S, p.c) < n0) return { full: true, c: p.c };
  const x = luckN('crop', S.lv.gh || 1), n = Math.min(whRoom(S, p.c), n0 * x), lost = n0 * x - n;   // V1.01 倍率、暴击
  const bonus = rng() < FARM.bonusSeed ? 1 : 0;
  S.stock[p.c] += n; S.st.harvest += n; (S.grown = S.grown || {})[p.c] = true; S.seeds[p.c] += bonus; S.plots[i] = null; const shelf = autoVeg(S, p.c); restock(S);
  return { c: p.c, n, bonus, shelf, x, lost };
}
export function plantTree(S, i, sap) {
  const k = TREASURE[sap] && TREASURE[sap].tree;
  if (!k || !unlocked(S, k) || i < 0 || i >= S.trees.length || S.trees[i] || !(S.treas[sap] > 0)) return false;
  S.treas[sap]--; S.trees[i] = { k, left: TREES[k].first, total: TREES[k].first }; return true;
}
/* 0.29 用户：果树能换种 —— 挖掉第 i 棵（树苗退回仓库），种上另一种树苗，从头长 */
export function swapTree(S, i, sap) {
  const t = S.trees[i], k = TREASURE[sap] && TREASURE[sap].tree;
  if (!t || !k || k === t.k || !unlocked(S, k) || !(S.treas[sap] > 0)) return false;
  const old = TREASURE_IDS.find(id => TREASURE[id].tree === t.k); if (old) S.treas[old] = (S.treas[old] || 0) + 1;
  S.trees[i] = null; return plantTree(S, i, sap);
}
export function pickTree(S, i, force) {
  const t = S.trees[i]; if (!t || t.left > 0) return null;
  const n0 = TREES[t.k].yield; if (!force && whRoom(S, t.k) < n0) return { full: true, k: t.k };
  const x = luckN('crop', S.lv.orchard || 1), n = Math.min(whRoom(S, t.k), n0 * x), lost = n0 * x - n;
  S.stock[t.k] += n; (S.grown = S.grown || {})[t.k] = true; t.left = t.total = TREES[t.k].every; const shelf = autoVeg(S, t.k); restock(S);
  return { k: t.k, n, shelf, x, lost };
}

/* ---------- 时间推进 ---------- */
/* 设计 45：同一种货在好几个货柜（好几层）上时，仓库的货先补最空的（装了几个 ÷ 容量 最低的），一个一个轮着补 */
export function restock(S) {
  const by = new Map();
  for (const sh of S.shelves) for (const sl of slotsOf(sh)) if (sl.g) { const cap = capOf(sh); if (sl.n < cap) { if (!by.has(sl.g)) by.set(sl.g, []); by.get(sl.g).push({ sl, cap }) } }
  for (const [g, list] of by) {
    let left = S.stock[g] || 0; if (left <= 0) continue;
    if (list.length === 1) { const { sl, cap } = list[0]; addTo(S, sl, Math.min(cap - sl.n, left)); continue }
    const want = list.map(o => 0);
    while (left > 0) { let k = -1, kv = Infinity;
      list.forEach((o, i) => { if (o.sl.n + want[i] >= o.cap) return; const v = (o.sl.n + want[i]) / o.cap; if (v < kv) { kv = v; k = i } });
      if (k < 0) break; want[k]++; left-- }
    list.forEach((o, i) => { if (want[i]) addTo(S, o.sl, want[i]) });
  }
}
function addTo(S, sl, add) {
  if (add <= 0) return;
  if (sl.g === 'fish') { const ids = fishOut(S, add); sl.fq = (sl.fq || []).concat(ids); sl.n += ids.length } else { sl.n += add; S.stock[sl.g] -= add }
}
/* 设计 45：货柜离东门多远（按店里的网格走几格算，粗略）——顾客先去最近的、还有这样货的货柜拿 */
const shelfDist = (S, i) => { const s = S.layout && S.layout[i]; if (!s) return 999; try { const [c, r] = frontCell(s); return Math.abs(c - DOOR_CELL[0]) + Math.abs(r - DOOR_CELL[1]) } catch (e) { return 999 } };
export const shelvesWith = (S, g) => S.shelves.map((sh, i) => i).filter(i => slotsOf(S.shelves[i]).some(sl => sl.g === g && sl.n > 0)).sort((a, b) => shelfDist(S, a) - shelfDist(S, b));
/* 设计 45：能卖、仓库里有、但哪个货柜都没摆的货（货架面板顶上「有 N 样货没上架」、选货格子「没上架」、菜单红点） */
export const notOnShelf = S => wanted(S).filter(g => !isOnShelf(S, g) && (g === 'fish' ? (S.stock.fish || 0) > 0 : (S.stock[g] || 0) > 0) && S.shelves.some(sh => canHold(sh.type || 'shelf', g)));

function recycleOne(S, t, ev) {
  const c = recCfg(S), J = JUNK[t]; S.pity++; S.st.rec++;
  const r = rng();
  if (S.pity >= c.pity || r < c.gem) { S.pity = 0; S.st.gem++;
    /* 超市 3 级以后，变宝有机会变出果树苗 */
    const saps = ['sapA', 'sapO'].filter(sp => unlocked(S, TREASURE[sp].tree));
    /* 0.15：升级只要工具箱，所以变宝多半出工具箱（60%），其余出这种物资对应的珍品（铁罐→一箱罐头、塑料瓶→滤芯；破布只出工具箱） */
    const id = saps.length && rng() < FARM.sapling ? (saps.length > 1 && rng() >= 0.6 ? saps[1] : saps[0]) : rng() < 0.6 ? 'toolbox' : J.treasure || 'toolbox';   // 设计 68：破布不再变出急救包（只给医院用，医院去掉了），变宝都出工具箱
    S.treas[id]++; ev.push({ type: 'rec', t, kind: 'gem', id, n: 1 }); return }
  const n = r < c.gem + c.x10 ? 10 : r < c.gem + c.x10 + c.x3 ? 3 : 1;
  if (n === 10) S.st.x10++; else if (n === 3) S.st.x3++;
  putStock(S, J.good, n);   // 42：×3、×10 以前不看仓库上限（木柴 1020/1000 就是这里来的），放不下的丢掉
  ev.push({ type: 'rec', t, kind: n === 10 ? 'x10' : n === 3 ? 'x3' : 'x1', id: J.good, n });
}

/* 来了一位顾客：进店挑货（从货架上拿走），挑完去收银台排队，等玩家结账才付钱 */
export const inShop = S => S.shoppers.length + S.queue.length;
function customer(S, ev) {
  if (inShop(S) >= SHOP.lineMax) { ev.push({ type: 'full' }); return }      // 店里挤满了，这位不进来
  const g = pickW(wanted(S), id => (GOODS[id].w || 1) * (isShort(S, id) ? SHOP.shortDemand : 1));   // 0.42：机器产品 0.4、菜 0.2（设计/15 供需）   // 0.21 用户定：解锁的商品每种被买的机会一样（紧缺的那种照旧翻倍）
  if (!g) return;
  const have = onShelves(S, g);
  if (!have) {
    S.rep = Math.max(0, S.rep - SHOP.repBad); S.st.miss++;
    ev.push({ type: 'cust', g, ok: false }); return }
  let q = Math.min(have, SHOP.buyMin + Math.floor(rng() * (SHOP.buyMax - SHOP.buyMin + 1)));
  const qty = q, order = shelvesWith(S, g), shelfIdx = order[0], went = [];   // 设计 45：先去最近的、还有这样货的货柜，拿空了再去下一个
  let pay = 0;                                   // 高档货柜、冰柜卖得贵一些：按从哪个货柜拿的算钱
  const fq = [];
  for (const si of order) { const sh = S.shelves[si]; if (q && !went.includes(si)) went.push(si); for (const sl of slotsOf(sh)) { if (sl.g !== g || !q) continue; const k = Math.min(q, sl.n); sl.n -= k; q -= k;
    if (g === 'fish') { const ids = (sl.fq || []).splice(0, k); fq.push(...ids); for (const id of ids) pay += Math.round(FISH[id].price * (isShort(S, g) ? SHOP.shortPrice : 1)); if (ids.length < k) pay += (k - ids.length) * Math.round(priceOf(S, g)) }   // 鱼按每条的价钱，不乘冰柜的加价
    else pay += k * Math.round(priceOf(S, g) * multOf(sh)) } }
  const c = { id: S.nextId++, g, qty, pay, left: SHOP.shopTime, shelf: shelfIdx }; if (went.length > 1) c.more = went.slice(1); if (g === 'fish') c.fq = fq;
  extraBuy(S, c);
  S.shoppers.push(c);
  restock(S);
  ev.push({ type: 'cust', g, ok: true, id: c.id, qty, shelf: shelfIdx, more: c.more });
}
/* 0.27 口碑高的顾客顺手多拿（SHOP.extra）：只拿货柜上还剩一半以上的，鱼不算；钱算进这位顾客的账里 */
export const extraP = rep => { const X = SHOP.extra; return rep < X.from ? 0 : X.top * (rep - X.from) / (100 - X.from) };
function extraBuy(S, c) {
  const X = SHOP.extra; if (rng() >= extraP(S.rep)) return;
  let kinds = 1 + (S.rep >= X.two && rng() < X.twoP ? 1 : 0);
  const pool = [];
  for (const sh of S.shelves) for (const sl of slotsOf(sh)) if (sl.g && sl.g !== c.g && sl.g !== 'fish' && sl.n >= 2 && sl.n >= capOf(sh) * X.keep && !pool.some(o => o.sl.g === sl.g)) pool.push({ sh, sl });
  c.ex = [];
  while (kinds-- > 0 && pool.length) {
    const { sh, sl } = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    const n = Math.min(sl.n - 1, X.nMin + Math.floor(rng() * (X.nMax - X.nMin + 1)));
    sl.n -= n; c.pay += n * Math.round(priceOf(S, sl.g) * multOf(sh)); c.ex.push({ g: sl.g, n });
  }
  if (!c.ex.length) delete c.ex;
}
/* 结账：收银台排在最前面的那位付钱走人（偶尔多给一包种子当小费） */
/* 0.14 用户定：有收银员时，主角去拾荒区 / 钓鱼区期间收的钱先存着，回到超市弹「离开期间赚了多少」再加进末日币 */
export function setAway(S, on) { S.awayOn = !!on }
export function collectAway(S) { const n = Math.round(S.awayBank || 0); S.awayBank = 0; S.awayOn = false; S.coins += n; return n }
export function checkout(S) {
  const c = S.queue.shift(); if (!c) return null;
  if (S.awayOn) S.awayBank = (S.awayBank || 0) + c.pay; else S.coins += c.pay;   // 主角去拾荒 / 钓鱼时收银员收的钱先存着，回超市再领
  S.st.sold += c.qty + (c.ex || []).reduce((a, x) => a + x.n, 0); S.st.earned += c.pay; S.st.served++;
  S.rep = Math.min(SHOP.repMax, S.rep + SHOP.repGood);
  if (rng() < FARM.tipSeed) { const t = randSeed(S); if (t) { c.tip = t; S.seeds[t]++ } }
  return c;
}
/* ---------- 0.31 神秘商人（设计/16_神秘商人.md） ----------
   超市 3 级起；他走后 MYSTERY.gap 秒再来（离线也算）。一单 1～3 种、共 10～20 个，只从仓库拿；给「数量 × 货架售价 × 5」，10% 多给 1 颗星星。 */
const mysPrice = g => g === 'fish' ? MYSTERY.fishPrice : GOODS[g].price;
export const mysValue = o => Math.round(o.items.reduce((a, it) => a + it.n * mysPrice(it.g), 0) * MYSTERY.mult);
const mysHave = (S, g) => S.stock[g] || 0;
export const mysCanDeliver = S => !!(S.mys && S.mys.order) && S.mys.order.items.every(it => mysHave(S, it.g) >= it.n);
function mysCands(S) { const seen = S.mys.seen || {}; return GOOD_IDS.filter(g => unlocked(S, g) && seen[g] && !GOODS[g].raw && !GOODS[g].gone) }   // 设计 31：原料不要
function mysOrder(S, avoid) {
  let c = mysCands(S); if (!c.length) return null;
  if (avoid && c.length > 1) { const a = c.filter(g => !avoid.includes(g)); if (a.length) c = a }   // 换一单：尽量换成别的东西
  const k = Math.min(c.length, MYSTERY.kinds[0] + Math.floor(rng() * (MYSTERY.kinds[1] - MYSTERY.kinds[0] + 1)));
  const pick = []; while (pick.length < k) { const g = c[Math.floor(rng() * c.length)]; if (!pick.includes(g)) pick.push(g) }
  const total = MYSTERY.total[0] + Math.floor(rng() * (MYSTERY.total[1] - MYSTERY.total[0] + 1));
  const ns = pick.map(() => 3); let left = total - 3 * k; while (left-- > 0) ns[Math.floor(rng() * k)]++;   // 每样至少 3 个，其余随机分
  return { items: pick.map((g, i) => ({ g, n: ns[i] })) };
}
function mysTick(S, dt, ev) {
  S.mys = S.mys || { order: null, next: MYSTERY.first, free: true, seen: {} }; const M = S.mys; M.seen = M.seen || {};
  for (const g of GOOD_IDS) if (S.stock[g] > 0) M.seen[g] = 1;
  if ((S.lv.store || 1) < MYSTERY.store || M.order) return;
  M.next -= dt; if (M.next > 0) return;
  const o = mysOrder(S); if (!o) { M.next = 60; return }
  M.order = o; M.free = true; ev.push({ type: 'mysCome' });
}
export function mysDeliver(S) {
  if (!mysCanDeliver(S)) return null; const o = S.mys.order, coins = mysValue(o);
  for (const it of o.items) { if (it.g === 'fish') { const k = fishOut(S, it.n).length; S.stock.fish -= it.n - k } else S.stock[it.g] -= it.n }   // 鱼：老存档每种鱼的数可能对不上总数，差的也扣掉
  S.coins += coins; S.st.earned += coins; S.st.mys = (S.st.mys || 0) + 1;
  const star = rng() < MYSTERY.starP ? 1 : 0; S.stars = (S.stars || 0) + star;
  S.mys.order = null; S.mys.next = MYSTERY.gap; S.mys.free = true;
  return { coins, star };
}
/* 换一单：这次来第一次免费，之后用 1 张刷新卷；返回 'free' / 'ticket' / 原因 */
export function mysRefresh(S) {
  const M = S.mys; if (!M || !M.order) return '他不在';
  const how = M.free ? 'free' : S.refTix > 0 ? 'ticket' : null; if (!how) return '没有刷新卷了';
  const o = mysOrder(S, M.order.items.map(it => it.g)); if (!o) return '没有别的东西可换';
  if (how === 'free') M.free = false; else S.refTix--;
  M.order = o; return how;
}
export const refCost = n => Math.round(MYSTERY.refPrice * n * (n === MYSTERY.refPack[0] ? MYSTERY.refPack[1] : 1));
export function buyRefTix(S, n) { const c = refCost(n); if (S.coins < c) return false; S.coins -= c; S.refTix = (S.refTix || 0) + n; return true }
/* 星星兑换（设计/17）：what = 'coins' / 'gear' / 'toolbox' */
/* 设计 77：一次换 n 颗（取整，至少 1；星星不够就不换）。不传 n 照旧是 1 */
export function starSwap(S, what, n = 1) {
  n = Math.max(1, Math.floor(+n || 1));
  if (!((S.stars || 0) >= n) || !STAR[what]) return false; S.stars -= n;
  if (what === 'coins') { S.coins += STAR.coins * n; S.st.earned += STAR.coins * n } else if (what === 'gear') S.gear += STAR.gear * n; else if (what === 'ref') S.refTix = (S.refTix || 0) + STAR.ref * n; else S.treas.toolbox = (S.treas.toolbox || 0) + STAR.toolbox * n;
  return true;
}
/* ---------- 0.42 工坊（设计/15_加工坊.md） ----------
   机器：一种原料 → 一个商品（1 换 1），哪种原料多用哪种；厨房：几样原料 → 一道菜，工匠挑「货柜 + 仓库里最少的那道」。
   工匠（员工岗位 craft）一人管 WS.perCraft 台（按 WS_IDS 的顺序），原料在仓库里每种留 WS.keep 个不拿；主角在工坊里也能自己点「做一个」（不留）。
   做好的放进仓库；仓库放不下就等着（机器停在做好的状态）。 */
export const wsBuilt = S => WS_IDS.filter(k => S.lv[k] > 0);
/* 设计 47：工匠、饲养员也看效率——按效率从高到低，一人管几台（设计 68：普通、精英 4，史诗 5，传说 6），先管排在前面的（WS_IDS / 鸡鸭兔羊牛猪的顺序）；
   管的机器速度、棚产得快 ×（1 + 0.5 ×（效率 − 1）） */
export const effSpd = p => 1 + STAFF.effMach * (staffStats(p).eff - 1);
export const manageN = p => STAFF.qual[p.q].manage || 3;
/* 设计 60：工匠、饲养员按机器 / 棚固定分（存档 S.crew[job] = {机器: 员工 id}）；有人不在（饿了）只停他管的那几台，别人不顶上。
   新盖的机器 / 新换来的人：没人管的按效率从高到低分给还管得过来的人（在岗的先） */
export const onDuty = st => st === 'work';   // 只有饿了才停
/* 设计 62：员工两种管法——自动（默认）/ 指定（S.crewPin[id] = true：只管玩家勾的那几台，1～manageN 台；补人时跳过他，清理时也不动他的，
   除非机器拆了、人换岗了）。种地的指定记成 S.crewPin[id] = { gh, orch }（只管温室 / 只管果园 / 都管） */
export const isPinned = (S, p) => !!(p && S.crewPin && S.crewPin[p.id]);
const crewBuilt = (S, job) => job === 'craft' ? wsBuilt(S) : ranchBuilt(S);
function crewMap(S, job, list) {
  S.crew = S.crew || {}; const m = S.crew[job] = S.crew[job] || {}, pool = S.staff.filter(p => p.job === job), built = crewBuilt(S, job);
  const pin = id => !!(S.crewPin && S.crewPin[id]);
  for (const k of Object.keys(m)) if (!(pin(m[k]) ? built : list).includes(k) || !pool.some(p => p.id === m[k])) delete m[k];   // 指定的人：机器还在就留着（棚暂时没动物也不丢）
  const cnt = id => Object.values(m).filter(x => x === id).length;
  for (const p of pool) { const mine = built.filter(k => m[k] === p.id); for (const k of mine.slice(manageN(p))) delete m[k] }
  for (const p of pool) if (pin(p.id) && !cnt(p.id)) delete S.crewPin[p.id];   // 指定的一台都没了（机器拆了）：改回自动
  const order = pool.filter(p => !pin(p.id)).sort((a, b) => onDuty(staffState(S, b)) - onDuty(staffState(S, a)) || staffStats(b).eff - staffStats(a).eff || a.id - b.id);
  for (const k of list) if (m[k] == null) { const p = order.find(q => cnt(q.id) < manageN(q)); if (p) m[k] = p.id }
  return m;
}
function assignCrew(S, job, list) { const m = crewMap(S, job, list), out = new Map();
  for (const k of list) { const p = m[k] != null && S.staff.find(q => q.id === m[k]); if (p && onDuty(staffState(S, p))) out.set(k, p) }
  return out }
const crewList = (S, job) => job === 'craft' ? wsBuilt(S) : ranchLive(S);
/* 这台机器 / 这个棚分给了谁（不管他现在在不在岗） */
export const crewOf = (S, job, k) => { const m = crewMap(S, job, crewList(S, job)); return m[k] != null ? S.staff.find(q => q.id === m[k]) || null : null };
export const crewKeys = (S, job, id) => { const m = crewMap(S, job, crewList(S, job)); return crewBuilt(S, job).filter(k => m[k] === id) };
/* 员工面板 / 工坊下拉换人：k 交给 id；他是自动的、管满了就把他最后一台换给原来管 k 的人（对调）；他是指定的、满了就不行。
   id = null：「自动分」——k 从现在的人手里拿走，交给自动的人去补 */
export function setCrew(S, job, k, id) {
  const list = crewList(S, job), built = crewBuilt(S, job), m = crewMap(S, job, list);
  if (!built.includes(k)) return false; const old = m[k] != null ? S.staff.find(q => q.id === m[k]) : null;
  if (id == null) { if (old && isPinned(S, old) && crewKeys(S, job, old.id).length <= 1) delete S.crewPin[old.id]; delete m[k]; crewMap(S, job, list); return true }
  const p = S.staff.find(q => q.id === id && q.job === job); if (!p) return false; if (old && old.id === id) return true;
  const mine = built.filter(x => m[x] === id);
  if (mine.length >= manageN(p)) { if (isPinned(S, p)) return `${p.name}指定的已经满 ${manageN(p)} 台了`; const give = mine[mine.length - 1]; if (old) m[give] = old.id; else delete m[give] }
  if (old && isPinned(S, old) && crewKeys(S, job, old.id).length <= 1) delete S.crewPin[old.id];   // 他指定的最后一台被拿走：改回自动
  m[k] = id; crewMap(S, job, list); return true;
}
/* 设计 62：自动 / 指定 切换。指定时先留着他现在管的（至少 1 台：一台都没有就先给他一台没人管的、再没有就第一台） */
export function setPin(S, id, on) {
  const p = S.staff.find(q => q.id === id); if (!p) return false; S.crewPin = S.crewPin || {};
  if (p.job === 'farm') { if (on) S.crewPin[id] = { gh: true, orch: true }; else delete S.crewPin[id]; return true }
  if (p.job !== 'craft' && p.job !== 'feed') return false;
  if (!on) { delete S.crewPin[id]; crewMap(S, p.job, crewList(S, p.job)); return true }
  const job = p.job, list = crewList(S, job), m = crewMap(S, job, list);
  if (!crewKeys(S, job, id).length) { const built = crewBuilt(S, job), k = built.find(x => m[x] == null) || built[0]; if (!k) return false; setCrew(S, job, k, id) }
  S.crewPin[id] = true; crewMap(S, job, list); return true;
}
/* 指定的人勾 / 取消一台：取消时至少留 1 台；勾的时候满了不行；勾了别人在管的直接拿过来（别人是指定的，界面先问一句） */
export function pinToggle(S, id, k) {
  const p = S.staff.find(q => q.id === id); if (!p || !isPinned(S, p)) return false;
  const job = p.job, list = crewList(S, job), m = crewMap(S, job, list), mine = crewKeys(S, job, id);
  if (mine.includes(k)) { if (mine.length <= 1) return '至少要管 1 台'; delete m[k]; crewMap(S, job, list); return true }
  if (mine.length >= manageN(p)) return `最多管 ${manageN(p)} 台`;
  return setCrew(S, job, k, id);
}
/* 种地指定：温室 / 果园（至少选一个） */
export function farmPin(S, id, where) {
  const P = S.crewPin && S.crewPin[id]; if (!P || typeof P !== 'object') return false;
  const n = { ...P, [where]: !P[where] }; if (!n.gh && !n.orch) return '至少选一个'; S.crewPin[id] = n; return true;
}
export const farmStaffed = (S, where) => working(S, 'farm').some(p => farmDoes(S, p, where));   // 温室 / 果园有没有在岗的人管
export const farmDoes = (S, p, where) => { const P = S.crewPin && S.crewPin[p.id]; return !P || typeof P !== 'object' || !!P[where] };
/* 没人管的机器 / 有动物的棚（给红点、员工面板顶上的提示用） */
export const crewless = (S, job) => { const list = crewList(S, job), m = crewMap(S, job, list); return list.filter(k => m[k] == null) };
export const wsCrew = S => assignCrew(S, 'craft', wsBuilt(S));            // 机器 → 管它的工匠
export const wsServed = S => [...wsCrew(S).keys()];
export const wsSpeed = (S, k) => { const p = wsCrew(S).get(k); return p ? effSpd(p) : 1 };
export const wsTime = (S, k) => (isKit(k) ? WS.kitchenT : (MACH[k] && MACH[k].t) || WS.machT)[S.lv[k] || 1] * ((MACH[k] && MACH[k].tk) || 1);   // 设计 41：tk 加快   // 木工台有自己的用时
export const wsLines = (S, k) => (WS.linesBy[k] || WS.lines)[Math.max(1, Math.min(3, S.lv[k] || 1))];   // 设计 68：厨房、木工台、纺织机 3 级 4 条线，其他 3 条
/* V1.01：一台机器 {lines:[{t, out, tk}], plan}——几级就几条线同时做；plan = 选定做哪样（产品 / 菜），null = 自动 */
/* 设计 60：每条线自己选做什么：M.lines[i].plan（null = 自动）；旧存档的 M.plan 给每条线 */
export const wsOf = (S, k) => { S.ws = S.ws || {}; const M = S.ws[k] || (S.ws[k] = { lines: [] }); if (!M.lines) M.lines = [];
  if ('plan' in M) { for (const l of M.lines) if (l.plan === undefined) l.plan = M.plan || null; delete M.plan }
  const n = wsLines(S, k); while (M.lines.length < n) M.lines.push({ t: 0, out: null, inp: null, plan: null }); return M };
export const wsOut = (k, line) => line.out;
export const dishOpen = (S, d) => (GOODS[d].unlock || 1) <= S.lv.store;
export const dishOk = (S, d, keep = 0) => Object.entries(DISHES[d]).every(([g, n]) => (S.stock[g] || 0) >= n + keep);
/* 这台机器现在能选的产品（开放了的） */
export const wsChoices = (S, k) => isKit(k) ? Object.keys(DISHES).filter(d => dishOpen(S, d)) : MACH[k].recipes.map(r => r.out).filter(g => unlocked(S, g));
export { recipeOf };
/* 一样产品做一个要多少秒（tk = 用时倍数：木工台的手电筒、打火机、火炬 ×1.5） */
export const wsTimeOf = (S, k, out) => wsTime(S, k) * ((recipeOf(k, out) || {}).tk || 1);
const have = (S, g) => onShelves(S, g) + (S.stock[g] || 0);
function takeIn(S, g, n) { if (g === 'fish') { const k = fishOut(S, n).length; S.stock.fish -= n - k } else S.stock[g] -= n }
/* 原料留几个：工匠做的时候，会上货柜卖的原料（绷带、罐头、水、蔬果、鱼…）仓库里留 WS.keep 个；纯原料（蛋、毛、木柴、电芯…）不留 */
/* 设计 47：员工效率高了机器做得快，会把货柜要卖的菜、果子先用光——按优先顺序 货柜 > 喂动物 > 工坊：
   工匠自动做的时候，这样原料仓库里先留够「货柜上摆它的那几层补满」+「吃它的动物吃两顿」，多出来的才拿去做 */
const shelfNeed = (S, g) => S.shelves.reduce((a, sh) => a + slotsOf(sh).reduce((b, sl) => b + (sl.g === g ? Math.max(0, capOf(sh) - sl.n) : 0), 0), 0);   // 留够把货柜上这几层补满
const feedNeed = (S, g) => RANCH_IDS.reduce((a, k) => a + (FEED.diet[k] === g && S.lv[k] > 0 ? Math.ceil(herdOf(S, k) * FEED.full / (FEED.meals[g] || 1)) : 0), 0);
/* 设计 48：菜和果子（顾客买的鲜货）工匠只拿仓库里超过「仓库每种上限 × 20%」的部分（仓库 1～5 级留 12 / 24 / 50 / 100 / 200，跟 WS.keep 取大的）；
   主角自己点「做一个」（keep = 0）不受限制；蛋、毛、奶、肉、木柴、电芯这些原料（raw）照旧不留 */
export const vegKeep = S => Math.round(whCap(S) * WS.vegKeepPct);
const shelfCap = (S, g) => S.shelves.reduce((a, sh) => a + slotsOf(sh).reduce((b, sl) => b + (sl.g === g ? capOf(sh) : 0), 0), 0);
/* 例外（设计 48 跑 supplysim 发现的）：做出来的东西快没了（货柜 + 仓库不够把它的货柜摆满一次），菜果只按原来的留法（不留 20%），
   不然 4、5 级的炸茄条、沙拉、南瓜汤这些熟食货柜三到五成时间是空的 */
const prodShort = (S, out) => !!out && have(S, out) < Math.max(WS.keep * 2, shelfCap(S, out));
const keepOf = (S, g, keep, out) => keep && !GOODS[g].raw ? (GOODS[g].fresh && !prodShort(S, out) ? Math.max(keep, vegKeep(S)) : keep) + shelfNeed(S, g) + feedNeed(S, g) : 0;
/* 原料够不够做 n 个 */
export const wsNeedOk = (S, k, out, keep = 0, n = 1) => { const r = recipeOf(k, out); return !!r && Object.entries(r.need).every(([g, c]) => (S.stock[g] || 0) >= c * n + keepOf(S, g, keep, out)) };
/* 能不能开工做 out：返回 true 或原因 */
function canMake(S, k, out, keep) {
  if (whRoom(S, out) <= 0) return '仓库放不下了';
  return wsNeedOk(S, k, out, keep) ? true : '原料不够';
}
/* 设计 60：正在线上做的也算进库存（不然几条线一起挑同一样，熏制机三条线全做肉松） */
export const wsMaking = (S, o) => Object.entries(S.ws || {}).reduce((a, [k, M]) => a + (M.lines || []).reduce((b, l) => b + (l.out === o ? ((recipeOf(k, o) || {}).n || 1) : 0), 0), 0);
/* 工匠做这一样为什么不行（null = 能做）：停手线 / 仓库放不下 / 原料不够 / 原料要留给货柜、动物 / 原料先给更缺的。line = 哪条线（排队等得久的优先，见 wsShare） */
export function wsWhyNot(S, k, o, keep = WS.keep, line = null) {
  if (keep > 0 && (S.stock[o] || 0) + wsMaking(S, o) >= wsEnough(S)) return `仓库够多了（停手线 ${wsEnough(S)}）`;
  if (whRoom(S, o) <= 0) return '仓库放不下了';
  if (!wsNeedOk(S, k, o, 0)) return '原料不够';
  if (!wsNeedOk(S, k, o, keep)) return '原料要留给货柜、动物';
  if (keep > 0) { const sh = wsShare(S, k, o, line); if (sh) return `${GOODS[sh.g].name}先给更缺的${GOODS[sh.best].name}` }
  return null;
}
/* 设计 61：几台机器抢同一样少的原料（猪肉：肉松、腊肉、午餐肉罐头、萝卜炖肉；牛奶…）时，先给「货柜 + 仓库 + 线上在做的」少的那样。
   不丧的存档：萝卜炖肉 372、午餐肉罐头 232 还在用猪肉，腊肉只有 69，猪肉一直是 0，熏炉一直「原料不够」。
   设计 68：指定的线也排这个队；一条线等原料等了 SHARE.maxWait 秒以上，就不再让给别人（空着的线按等了多久排，等得最久的先拿），不会一直轮不到 */
const SHARE = { low: 60, gap: 30, maxWait: 90 };
const wsMk = (S, o) => have(S, o) + wsMaking(S, o);
function wsShare(S, k, o, line = null) {
  const r = recipeOf(k, o); if (!r) return null;
  if (line && (line.waitT || 0) >= SHARE.maxWait) return null;
  for (const g of Object.keys(r.need)) { if (!GOODS[g].raw || (S.stock[g] || 0) >= SHARE.low) continue;
    let best = null;
    for (const k2 of wsBuilt(S)) for (const p of wsChoices(S, k2)) { if (p === o || (isKit(k2) && !isOnShelf(S, p))) continue; const r2 = recipeOf(k2, p); if (!r2 || !r2.need[g]) continue;
      if ((S.stock[p] || 0) + wsMaking(S, p) >= wsEnough(S) || whRoom(S, p) <= 0) continue;
      if (wsMk(S, p) + SHARE.gap < wsMk(S, o) && (!best || wsMk(S, p) < wsMk(S, best))) best = p }
    if (best) return { g, best } }
  return null;
}
/* 设计 68：指定的线做不了时在等什么：{ long: 线上写的, short: 头顶写的 }；null = 能做 */
export function wsWait(S, k, o, line = null) {
  if (!wsChoices(S, k).includes(o)) return { long: `${GOODS[o].name}还没开放`, short: '还没开放' };
  const E = wsEnough(S), st = S.stock[o] || 0;
  if (st + wsMaking(S, o) >= E) return { long: `够多了（仓库 ${st} / 停手线 ${E}）`, short: '够多了' };
  if (whRoom(S, o) <= 0) return { long: '仓库放不下了', short: '仓库满了' };
  const r = recipeOf(k, o), need = Object.entries(r.need);
  const lack = need.filter(([g, c]) => (S.stock[g] || 0) < c).map(([g]) => GOODS[g].name);
  if (lack.length) return { long: `等原料：${lack.join('、')}`, short: '等原料' };
  const kept = need.filter(([g, c]) => (S.stock[g] || 0) < c + keepOf(S, g, WS.keep, o)).map(([g]) => GOODS[g].name);
  if (kept.length) return { long: `等原料：${kept.join('、')}（要留给货柜、动物）`, short: '等原料' };
  const sh = wsShare(S, k, o, line); if (sh) return { long: `等原料：${GOODS[sh.g].name}（先给更缺的${GOODS[sh.best].name}）`, short: '等原料' };
  return null;
}
/* 开工：pick = 做哪样（产品 / 菜；旧版本传原料 id 也认）；不给就按这条线选的 / 自动挑。li = 哪条线（不给 = 第一条空着的） */
export function wsStart(S, k, pick, keep = 0, li = null) {
  if (!(S.lv[k] > 0)) return '还没盖'; const M = wsOf(S, k), ls = M.lines.slice(0, wsLines(S, k)), line = li != null ? ls[li] : ls.find(l => !l.out);
  if (!line) return '几条线都在做'; if (line.out) return '这条线在做';
  let out = pick;
  if (out && !recipeOf(k, out) && !isKit(k)) { const r = MACH[k].recipes.find(x => x.need[out]); out = r ? r.out : null }
  if (!out) out = wsAuto(S, k, keep, line.plan, line);
  if (!out) return '原料不够';
  if (!wsChoices(S, k).includes(out)) return '还没开放';
  const ok = canMake(S, k, out, keep); if (ok !== true) return ok;
  const r = recipeOf(k, out); for (const [g, n] of Object.entries(r.need)) takeIn(S, g, n);
  line.out = out; line.t = 0; line.tk = r.tk || 1; line.n = r.n || 1; line.inp = null;   /* 设计 73：开工时记下出几个（配方以后改了，在做的照旧） */ line.sub = null; return true;
}
/* 自动挑（设计 68 改）：这条线指定了一样（plan）就只做它，做不了（没原料、到停手线、排队轮不到）就等着，不做别的；
   没指定（自动）就做「货柜 + 仓库 + 线上正在做的」最少的那样（厨房只做熟食柜上摆着的菜；两个厨房线上在做的都算），这样做不了换下一样；
   设计 31：木工台先保证木炭（顾客常买），木炭够了（货柜 + 仓库 ≥ 停手线）再做手电筒、打火机、火炬里最少的；分解机只有一样 */
function wsAuto(S, k, keep, plan = null, line = null) {
  const ok = o => (!isKit(k) || isOnShelf(S, o) || o === plan) && (keep > 0 ? wsWhyNot(S, k, o, keep, line) === null : canMake(S, k, o, 0) === true);
  if (plan) return wsChoices(S, k).includes(plan) && ok(plan) ? plan : null;
  let cs = wsChoices(S, k).filter(o => ok(o));
  /* 设计 68：两个厨房自动挑菜时，别的厨房线上（和自己别的线上）正在做的菜先不挑，有别的能做就做别的（不会 8 条线一起做鱼汤） */
  if (isKit(k)) { const busy = new Set(['kitchen', 'kitchen2'].flatMap(kk => (S.ws && S.ws[kk] ? S.ws[kk].lines : []).map(l => l.out).filter(Boolean))), free = cs.filter(o => !busy.has(o)); if (free.length) cs = free }
  const mk = o => have(S, o) + wsMaking(S, o);
  if (k === 'wood' && cs.includes('charcoal') && mk('charcoal') < Math.max(40, wsEnough(S))) return 'charcoal';   // 设计 41：40 → 跟着停手线（木炭要攒得起来）
  if (k === 'wood') cs = cs.filter(o => o !== 'charcoal' || cs.length === 1);
  /* 厨房要用的加工品（肉松饭的肉松）：设计 60 只在仓库里不够厨房做一轮（几条线各一份）时才往前排 10 个（原来不到 20 个就 −30，肉松一直插队，熏制机只做肉松）；设计 68：两个厨房的线都算 */
  const kl = ['kitchen', 'kitchen2'].reduce((a, kk) => a + (S.lv[kk] > 0 ? wsLines(S, kk) : 0), 0);
  const round = o => kl ? Object.keys(DISHES).filter(d => isOnShelf(S, d) && DISHES[d][o]).reduce((a, d) => a + DISHES[d][o], 0) * kl : 0;
  const score = o => mk(o) <= 0 ? -1e9 : mk(o) - ((S.stock[o] || 0) + wsMaking(S, o) < round(o) ? 10 : 0);
  return cs.sort((a, b) => score(a) - score(b))[0] || null;
}
/* 选这条线（li = null：所有线）做什么；out = null 自动，有值 = 指定只做这一样 */
export function wsSetPlan(S, k, out, li = null) { const M = wsOf(S, k), v = out && wsChoices(S, k).includes(out) ? out : null;
  M.lines.forEach((l, i) => { if (li == null || +li === i) { l.plan = v; l.sub = null; l.waitT = 0 } }); return true }
/* 设计 60：机器停着（有空线、没在做）的原因：先看工匠，再看每条线。设计 68：指定的线写在等什么（「等原料：猪肉」「够多了（仓库 402 / 停手线 400）」），
   自动的线写为什么一样都做不了。返回 { why, short（头顶）, lines: [线的原因] } */
export function wsWhy(S, k) {
  const M = wsOf(S, k), n = wsLines(S, k), p = crewOf(S, 'craft', k), st = p && staffState(S, p);
  const who = !p ? '没有工匠管' : st === 'hungry' ? '工匠饿了' : null;
  const cs = wsChoices(S, k).filter(o => !isKit(k) || isOnShelf(S, o));
  const autoWhy = () => { if (!cs.length) return isKit(k) ? '熟食柜上没有菜' : '没有能做的';
    const by = {}; for (const o of cs) { const w = wsWhyNot(S, k, o) || '能做'; (by[w] = by[w] || []).push(GOODS[o].name) }
    const ks = Object.keys(by); return ks.length === 1 ? ks[0] : ks.map(w => `${by[w].join('、')}${w === '能做' ? '能做' : '：' + w}`).join('；') };
  const autoShort = () => [...new Set(cs.map(o => (wsWhyNot(S, k, o) || '').replace(/（停手线 \d+）/, '').replace(/^.+先给更缺的.+$/, '原料先给更缺的')).filter(Boolean))].join(' / ') || (isKit(k) ? '熟食柜上没有菜' : '没有能做的');
  const idle = M.lines.slice(0, n).map(l => l.out ? null : l), wait = idle.map(l => l && l.plan ? wsWait(S, k, l.plan, l) || { long: '马上开工', short: '马上开工' } : null);
  const lines = idle.map((l, i) => !l ? null : who || (wait[i] ? wait[i].long : autoWhy()));
  const short = who || (idle.some(Boolean) ? [...new Set(idle.map((l, i) => !l ? null : wait[i] ? wait[i].short : autoShort()).filter(Boolean))].join(' / ') : null);
  return { why: who || lines.find(x => x) || null, short, who: p, lines };
}
/* 做好一个：按机器等级有机会 ×2、×3（LUCK.ws），仓库放不下的部分不算 */
export function luckN(kind, lv) { const L = LUCK[kind], r = rng(); return r < L.x3(lv) ? 3 : r < L.x3(lv) + L.x2(lv) ? 2 : 1 }
function wsTick(S, dt, ev) {
  const built = wsBuilt(S); if (!built.length) return;
  const crew = wsCrew(S); let got = false; const idle = [];
  for (const k of built) {
    const M = wsOf(S, k), T = wsTime(S, k), n = wsLines(S, k), spd = crew.get(k) ? effSpd(crew.get(k)) : 1;   // 设计 47：工匠效率高，机器做得快
    for (const [li, line] of M.lines.slice(0, n).entries()) {
      if (!line.out) continue; const TT = T * (line.tk || 1); line.t = Math.min(TT, line.t + dt * spd);
      if (line.t >= TT) { const g = line.out, r = recipeOf(k, g) || { n: 1 }, room = whRoom(S, g);
        if (room > 0) { const lk = luckN('ws', S.lv[k] || 1), x = Math.min(room, lk * (line.n || r.n || 1)); S.stock[g] += x; (S.grown = S.grown || {})[g] = true; S.st.craft = (S.st.craft || 0) + x;
          for (const [a, c] of Object.entries(r.also || {})) { const y = Math.min(whRoom(S, a), lk * c); S.stock[a] = (S.stock[a] || 0) + y; S.grown[a] = true }   // 分解机：顺带出的铜丝
          line.out = null; line.inp = null; line.tk = 1; line.n = null; line.t = 0; got = true; if (lk > 1) ev.push({ type: 'crafted', k, g, x: lk, line: li }) } }
    }
    if (crew.has(k)) for (let i = 0; i < n; i++) if (M.lines[i] && !M.lines[i].out) idle.push([k, i, M.lines[i]]);   // 设计 60：每条线各挑各的
  }
  /* 设计 68：空着的线按「等原料等了多久」排，等得最久的先拿原料；指定的线等原料时 waitT 往上加（等「够多了」不算），开工了清零 */
  idle.sort((a, b) => (b[2].waitT || 0) - (a[2].waitT || 0));
  for (const [k, i, line] of idle) {
    if (wsStart(S, k, null, WS.keep, i) === true) { line.waitT = 0; continue }
    const w = line.plan ? wsWait(S, k, line.plan, line) : null; line.waitT = w && w.short === '等原料' ? (line.waitT || 0) + dt : 0;
  }
  if (got) restock(S);
}

/* ---------- 0.28 牧场（设计/14_农场.md） ----------
   动物吃饱了才产（每只一个菜管 FEED.meal 秒）；只有饲养员喂和收：一个饲养员管 FEED.perFeeder 个棚（按鸡、鸭、兔、羊、牛、猪的顺序）。
   饲养员从仓库拿这种动物吃的菜（FEED.diet，留 FEED.keep 个不拿；南瓜、苹果一个顶几顿见 FEED.meals），产出收进仓库；仓库满了先存在棚里（最多一轮），存满就停产。 */
export const penOf = (S, k) => { S.pens = S.pens || {}; return S.pens[k] || (S.pens[k] = { food: 0, t: 0, out: 0 }) };
export const herdOf = (S, k) => Math.min((S.herd && S.herd[k]) || 0, PEN_CAP[S.lv[k]] || 0);
export const ranchBuilt = S => RANCH_IDS.filter(k => S.lv[k] > 0);
export const ranchLive = S => ranchBuilt(S).filter(k => herdOf(S, k) > 0);        // 有动物的棚（饲养员只管这些）
/* 在院子商人那里买动物：n 只（不超过棚还能住的） */
export function animalRoom(S, k) { return S.lv[k] > 0 ? PEN_CAP[S.lv[k]] - herdOf(S, k) : 0 }
export function buyAnimal(S, k, n) {
  n = Math.min(n, animalRoom(S, k)); if (!RANCH[k] || n <= 0) return 0;
  const c = n * RANCH[k].price; if (S.coins < c) return 0;
  S.coins -= c; S.herd = S.herd || {}; S.herd[k] = herdOf(S, k) + n; return n;
}
export const ranchCrew = S => assignCrew(S, 'feed', ranchLive(S));      // 棚 → 管它的饲养员
export const ranchServed = S => [...ranchCrew(S).keys()];
export const ranchSpeed = (S, k) => { const p = ranchCrew(S).get(k); return p ? effSpd(p) : 1 };
function feedOne(S, k) {
  const f = FEED.diet[k]; if (!(S.stock[f] > FEED.keep)) return 0;
  S.stock[f]--; S.st.fed = (S.st.fed || 0) + 1; return FEED.meals[f] || 1;   // 返回顶几顿
}
/* 一个棚现在怎么样：给界面和头顶的字用 */
export function penInfo(S, k) {
  const P = penOf(S, k), n = herdOf(S, k), R = RANCH[k];
  const who = ranchCrew(S).get(k), spd = who ? effSpd(who) : 1;
  return { n, cap: PEN_CAP[S.lv[k]] || 0, food: P.food, hungry: P.food <= 0, out: P.out, full: P.out >= n * R.yield, left: Math.max(0, R.cycle - P.t) / spd, cycle: R.cycle / spd, served: !!who, who, spd };
}
function ranchTick(S, dt, ev) {
  const built = ranchLive(S); if (!built.length) return;
  const crew = ranchCrew(S), served = [...crew.keys()];
  if (built.length > served.length) { if (!S.feedWarn) { S.feedWarn = true; ev.push({ type: 'needFeeder', n: built.length - served.length }) } } else S.feedWarn = false;
  let left = dt, got = false;
  while (left > 0) {                                       // 离线一下子过很久：一分钟一分钟地算（中间饲养员会接着喂）
    const u = Math.min(60, left); left -= u;
    for (const k of built) {
      const P = penOf(S, k), n = herdOf(S, k), R = RANCH[k], on = served.includes(k), cap = n * R.yield;
      if (on && P.food < n * FEED.meal) { let m; while (P.food < n * FEED.meal * FEED.full && (m = feedOne(S, k))) P.food += FEED.meal * m }
      if (P.food > 0 && P.out < cap) { const w = Math.min(u, P.food / n); P.food = Math.max(0, P.food - w * n); P.t += w * (crew.get(k) ? effSpd(crew.get(k)) : 1);   // 设计 47：饲养员效率高，产得快（吃的照旧）
        while (P.t >= R.cycle) { P.t -= R.cycle; const x = luckN('ranch', S.lv[k] || 1); P.out = Math.min(cap * 3, P.out + cap * x); if (x > 1) ev.push({ type: 'ranchLuck', k, x }) } }   // V1.01 倍率、暴击
      if (on && P.out > 0) { const m = Math.min(P.out, whRoom(S, R.good)); if (m > 0) { S.stock[R.good] += m; P.out -= m; (S.grown = S.grown || {})[R.good] = true; S.st.ranch = (S.st.ranch || 0) + m; got = true } }
    }
  }
  if (got) restock(S);
}
/* 挑货、排队的计时（只在玩的时候走） */
function tickShop(S, dt, ev) {
  for (let i = S.shoppers.length - 1; i >= 0; i--) { const c = S.shoppers[i]; c.left -= dt;
    if (c.left <= 0) { S.shoppers.splice(i, 1); c.left = SHOP.patience; c.ready = false; S.queue.push(c); ev.push({ type: 'queue', id: c.id }) } }
  for (let i = S.queue.length - 1; i >= 0; i--) { const c = S.queue[i]; c.left -= dt;
    if (c.left <= 0) { S.queue.splice(i, 1); custBack(S, c); S.rep = Math.max(0, S.rep - SHOP.repAngry); S.st.angry++;
      ev.push({ type: 'angry', id: c.id, g: c.g }) } }
}

/* 推进 dt 秒。online=false（不在玩）时回收机和顾客不动。返回这段时间里发生的事件 */
/* 设计 60：营地一有空位（请走人、宿舍楼升好、任何地方），等着的新人自动住进来（「营地住满了」面板开着的时候先不动，面板里写「营地有空位了」） */
let admitHold = () => false; export const setAdmitHold = f => { admitHold = f };
export function admitPending(S, ev = []) { const p = S.pendingStaff; if (!p || admitHold() || S.staff.length >= staffCap(S)) return false; S.pendingStaff = null; S.staff.push(p); ev.push({ type: 'staffJoin', id: p.id, name: p.name, q: p.q }); return true }
export function tick(S, dt, online = true, ev = []) {
  if (online) S.st.play += dt;
  admitPending(S, ev);
  if (lostQ.length) ev.push(...lostQ.splice(0));   // 42：别处（退货等）因为仓库满了丢掉的
  /* 回收机（货车旁物资堆里的东西：回收机快空了就自己拿） */
  /* 0.20 用户：仓库里某样满了，别让整条线卡住 —— 只从堆里拿仓库还放得下的那几种；排队里等着的（满了的）不算数 */
  if (S.pile && S.pile.length) {
    const live = () => S.rq.filter(t => !whFull(S, JUNK[t].good)).length;
    while (live() < STAFF.scav.feedTo && S.rq.length < recCfg(S).queue) { const i = S.pile.findIndex(t => !whFull(S, JUNK[t].good)); if (i < 0) break; S.rq.push(S.pile.splice(i, 1)[0]) }
  }
  let t = online ? dt : 0;
  if (S.rp > recCfg(S).time) S.rp = recCfg(S).time;     // 升级后每件用时变短，已经做了一半的不能超过新用时
  while (S.rq.length && t > 0) {
    const idx = recNext(S); if (idx < 0) break;             // 仓库都放不下了：回收机停着等，物资不丢
    const need = recCfg(S).time - S.rp;
    if (t >= need) { t -= need; S.rp = 0; recycleOne(S, S.rq.splice(idx, 1)[0], ev); restock(S) }
    else { S.rp += t; t = 0 }
  }
  if (!S.rq.length) S.rp = 0;
  /* 建造 */
  for (const b of [...S.builds]) { b.left -= dt; if (b.left <= 0) finishBuild(S, b, ev) }
  /* 温室、果园（不玩也照样长） */
  for (const p of S.plots) if (p && p.left > 0) { p.left -= dt; if (p.left <= 0) { p.left = 0; ev.push({ type: 'ripe', c: p.c }) } }
  for (const tr of S.trees) if (tr && tr.left > 0) { tr.left -= dt; if (tr.left <= 0) { tr.left = 0; ev.push({ type: 'ripe', c: tr.k }) } }
  /* 员工：吃饭（离线也算）；种地、饲养、拾荒、钓鱼只在玩的时候干（0.39 用户） */
  tickStaff(S, dt, online, ev);
  if (online) wsTick(S, dt, ev);          // 0.42 工坊（不在玩的时候停着；没有员工也能自己点着做）
  mysTick(S, dt, ev);                     // 0.31 神秘商人（离线也计时）
  /* 物资刷新 */
  { const n = scavSlots(S); S.spawns.forEach((s, i) => { if (s.t || i >= n) return; s.left -= dt; if (s.left <= 0) { s.t = randSpawn(S); s.left = 0 } }) }
  S.street.forEach((s, i) => { if (s.t) return; s.left -= dt; if (s.left <= 0) { s.t = streetJunk(i); s.left = 0 } });
  /* 紧缺 */
  S.short.left -= dt;
  while (S.short.left <= 0) { const prev = S.short.g;
    S.short.g = pickW(wanted(S).filter(g => g !== prev), () => 1); S.short.left += SHOP.shortEvery;
    ev.push({ type: 'short', g: S.short.g }) }
  restock(S);
  /* 顾客 */
  if (online && !shopPaused) { tickShop(S, dt, ev); S.cust -= dt; while (S.cust <= 0) { customer(S, ev); S.cust += custGap(S) } }
  checkTasks(S, ev);
  return ev;
}

export const SCROLL_SHORT = '尸潮卷不够，去院子商人那里买';
/* ================= 尸潮塔防（只管存档里的数：尸潮卷、次数、奖励、塔；打的过程在 td.js） ================= */
let shopPaused = false;
export const setShopPaused = b => { shopPaused = !!b };          // 尸潮期间超市暂停营业：不来新顾客
/* 每天的次数：day 是北京时间的日期 'YYYY-MM-DD'（由画面那边按服务器时间算好传进来） */
export function tdDay(S, day) { if (!S.td.day || day > S.td.day) { S.td.day = day; S.td.used = 0 } }   // 只往后翻：把手机时间往回调不会再清一次
/* 设计 61：「通关到第几关」只看一个数：打赢过的最高一关（S.td.wins），尸潮面板顶上、关卡上的「打赢过」、建造的「通关尸潮第 N 关 ✓/✗」都用它 */
export const tdCleared = S => { let m = 0; for (const [k, n] of Object.entries((S.td && S.td.wins) || {})) if (n > 0 && +k <= 100 && +k > m) m = +k; return m };
export const tdLeft = S => Math.max(0, TD.daily - S.td.used);
export function buyScroll(S, n = 1) { if (S.coins < TD.scroll * n) return false; S.coins -= TD.scroll * n; S.td.scrolls += n; return true }
/* 0.26：按顺序 + 超市等级 */
export function tdLockWhy(S, lv) {
  const T = tdLevel(lv); if (!T) return '没有这一关';
  if (lv > tdCleared(S) + 1) return '先打赢前一关';
  if (T.store && S.lv.store < T.store) return `超市 ${T.store} 级才能打`;
  return null;
}
export const tdUnlocked = (S, lv) => !tdLockWhy(S, lv);
export function tdCanStart(S, lv) {
  { const w = tdLockWhy(S, lv); if (w) return w }
  if (!S.td.scrolls) return '尸潮卷不够，去院子商人那里买';   // 设计 56：尸潮卷只在院子商人那里买
  if (!tdLeft(S)) return '今天的 5 次用完了，明天 0 点（北京时间）再来';
  if (S.queue.length || S.shoppers.length) return null;      // 店里还有顾客也可以开打（顾客会先离开）
  return null;
}
/* 尸潮开始：店里的顾客都先离开，拿的东西放回仓库（不扣口碑） */
/* 顾客没买成：东西退回仓库（鱼按是哪几条退） */
function custBack(S, c) { if (c.g === 'fish') { const ids = c.fq || []; fishIn(S, ids); putStock(S, 'fish', Math.max(0, c.qty - ids.length)) } else putStock(S, c.g, c.qty); for (const x of c.ex || []) putStock(S, x.g, x.n) }   // 42：退回仓库也看上限
export function cancelShop(S) { for (const c of [...S.shoppers, ...S.queue]) custBack(S, c); const ids = [...S.shoppers, ...S.queue].map(c => c.id); S.shoppers = []; S.queue = []; return ids }
export function tdStart(S, lv) { if (tdCanStart(S, lv)) return false; S.td.scrolls--; S.td.used++; S.td.run = lv; return true }   // run：正在打第几关（打到一半关掉游戏，下次进来按输算）
/* 打完：赢了给全部（打过的关减半），输了给 1/4；返回实际给了多少 */
/* 设计 29b：普通第 lv 关打赢后得员工的机会 [史诗, 传说]（英雄本、1～2 关没有） */
export const tdStaffOdds = lv => STAFF.td.repeat[lv] || null;
/* 一次打赢最多 1 个：先看传说，没中再看史诗 */
export function tdStaffRoll(lv, r) { const o = tdStaffOdds(lv); if (!o) return null; return r < o[1] ? 'l' : r < o[1] + o[0] ? 'p' : null }
export function tdEnd(S, lv, win, quit = false) {
  const L = tdLevel(lv), first = win && !(S.td.wins[lv] > 0), k = win ? (first ? 1 : TD.repeat) : quit ? 0 : TD.lose;   // V1.01 用户：中途退出什么都不给（以前退出也给 1/4，比卷轴还值钱）
  const coins = Math.round(L.coins * k);
  delete S.td.run; S.coins += coins; S.st.earned += coins;
  if (win) { S.td.wins[lv] = (S.td.wins[lv] || 0) + 1; S.td.best = Math.max(S.td.best, lv) }
  /* 史诗、传说员工：第一次打赢保底，之后有小机会 */
  let staff = null;
  if (win) { const T = STAFF.td, fq = first && T.first[lv];
    let q = fq || null; if (!q) q = tdStaffRoll(lv, rng());
    if (q) { staff = rollStaff(S, q); if (!addStaff(S, staff)) { if (!S.pendingStaff) S.pendingStaff = staff; else S.staff.push(staff) } } }   // 住满又已经有人在等：先挤进营地，玩家自己请走一个
  /* 0.20 工具箱：第一次打赢给 TD.tool[关]，重复打赢一半机会给一半（至少 1） */
  let tool = 0;
  if (win) { const n = TD.tool[lv] || 0; tool = first ? n : rng() < 0.5 ? Math.max(1, Math.floor(n / 2)) : 0; if (tool) S.treas.toolbox = (S.treas.toolbox || 0) + tool }
  return { coins, first, staff, tool };
}
/* 塔：建（0.15 起要施工 TOWERS.time 秒，lv 0 = 正在建，打尸潮不开火）、升级都占施工队；卖掉退一半（总共花的钱的一半） */
export function towerBuild(S, i, k) {
  const T = TOWERS[k]; if (!T || i < 0 || i >= TOWER_SPOTS_N || S.towers[i]) return '';
  if (crewFull(S)) return '施工队都在忙'; if (S.coins < T.build) return '末日币不够';
  S.coins -= T.build; S.towers[i] = { k, lv: 0, spent: T.build }; S.builds.push({ k: 'tower', i, to: 1, left: T.time, total: T.time }); return true;
}
export function towerInfo(S, i) {
  const t = S.towers[i]; if (!t) return null;
  const to = t.lv + 1, L = TOWERS[t.k].up[to]; if (!L) return { max: true, cur: t.lv };
  const lack = [];
  if (S.coins < L.coins) lack.push(`末日币差 ${L.coins - Math.floor(S.coins)}`);
  for (const [id, n] of Object.entries(L.need)) if ((S.treas[id] || 0) < n) lack.push(`${TREASURE[id].name}差 ${n - (S.treas[id] || 0)}`);
  { const bl = busyLack(S, 'tower', i); if (bl) lack.unshift(bl) }
  return { cur: t.lv, to, cost: L, lack, ok: !lack.length };
}
export function towerUpgrade(S, i) {
  const inf = towerInfo(S, i); if (!inf || !inf.ok) return false;
  S.coins -= inf.cost.coins; for (const [id, n] of Object.entries(inf.cost.need)) S.treas[id] -= n;
  S.towers[i].spent += inf.cost.coins;
  S.builds.push({ k: 'tower', i, to: inf.to, left: inf.cost.time, total: inf.cost.time }); return true;
}
export function towerSell(S, i) {
  const t = S.towers[i]; if (!t || busyWith(S, 'tower', i)) return 0;
  const back = Math.floor(t.spent / 2); S.coins += back; S.towers[i] = null; return back;
}

/* 离线结算：分 10 秒一段推进（只有建造、种地这类计时在走），返回汇总 */
export function offline(S, secs) {
  secs = Math.max(0, Math.min(OFFLINE_CAP, secs));
  const ev = [];
  for (let left = secs; left > 0; left -= 10) tick(S, Math.min(10, left), false, ev);
  return { secs, mys: ev.some(e => e.type === 'mysCome'), built: ev.filter(e => e.type === 'built'), ripe: ev.filter(e => e.type === 'ripe').length, scav: ev.filter(e => e.type === 'scavBack').reduce((a, e) => a + e.junk, 0), capped: secs >= OFFLINE_CAP };
}

/* ================= 钓鱼（0.14，设计/05） ================= */
export const fishOpen = S => S.lv.store >= FISHING.store;
export const rodCfg = S => FISHING.rod[S.lv.rod || 1];
export function buyLicense(S) { if (S.fishLic || S.coins < FISHING.license) return false; S.coins -= FISHING.license; S.fishLic = true; S.rodDur = rodCfg(S).dur; return true }
export function payBoat(S) { if (!S.fishLic || S.coins < FISHING.boat) return false; S.coins -= FISHING.boat; return true }
/* far = 在钓鱼区的商人那里买（贵 20%） */
export const baitCost = (k, n, far) => { const p = FISHING.baitPacks.find(x => x[0] === n); return Math.round(FISHING.bait[k].price * n * (p ? p[1] : 1) * (far ? FISHING.farMult : 1)) };
export function buyBait(S, k, n, far) { if (!FISHING.bait[k]) return false; const c = baitCost(k, n, far); if (S.coins < c) return false; S.coins -= c; S.bait[k] = (S.bait[k] || 0) + n; return true }
export const rodCost = (S, far) => Math.round(rodCfg(S).price * (far ? FISHING.farMult : 1));
export function buyRod(S, far) { if (!S.fishLic) return false; const c = rodCost(S, far); if (S.coins < c || S.rodDur >= rodCfg(S).dur) return false; S.coins -= c; S.rodDur = rodCfg(S).dur; return true }
/* 背包还能不能装鱼：有空格，或者有这个区域的鱼能叠上去（zone 不给就看任何鱼） */
export const fishFits = (S, zone) => S.bag.length < bagCap(S) || S.bag.some(s => isFish(s.t) && s.n < STACK && (!zone || (FISH[fishOf(s.t)] || {}).zone === zone));
/* 抛竿：检查能不能钓，用掉 1 个饵，决定这一竿咬钩的是什么鱼；返回 { id } 或 { why } */
export function cast(S, zone, bait) {
  if (!S.fishLic) return { why: '还没有垂钓证' };
  if (S.rodDur <= 0) return { why: '鱼竿坏了，去商人那里买一根新的' };
  if (!(S.bait[bait] > 0)) return { why: `没有${FISHING.bait[bait].name}了` };
  if (!fishFits(S, zone)) return { why: '背包满了' };
  const cands = FISH_IDS.filter(id => FISH[id].zone === zone && (FISH[id].bait === bait || FISH[id].bait === 'any'));
  const free = S.bag.length < bagCap(S), cands2 = free ? cands : cands.filter(id => S.bag.some(s => s.t === 'fish:' + id && s.n < STACK));   // 背包没空格时只会钓到能叠上去的鱼
  if (!cands.length) return { why: '这里用这种饵钓不到鱼' };
  if (!cands2.length) return { why: '背包满了' };
  S.bait[bait]--;
  const rare = rodCfg(S).rare;
  return { id: pickW(cands2, id => FISH_RAR[FISH[id].rar].w * (FISH[id].rar === 'c' ? 1 : rare)) };
}
/* 钓上来了：放进背包，鱼竿掉 1 点耐久 */
export function landFish(S, id) { if (!addBag(S, 'fish:' + id, 1)) return false; S.rodDur = Math.max(0, S.rodDur - 1); S.st.fish = (S.st.fish || 0) + 1; return true }
/* 拉断线：鱼跑了，饵没了，耐久多掉几点 */
export function snapLine(S) { S.rodDur = Math.max(0, S.rodDur - FISHING.snap) }

/* ================= 员工（幸存者）=================
   p = { id, name, q: 品质 n/e/p/l, lv, job: cash/farm/guard/rest, spent: 升级花了多少, look: 外观编号, fed: 今天吃过没有 } */
const QS = ['n', 'e', 'p', 'l'];
export const staffCap = S => STAFF.campCap[S.lv.camp || 1] || (S.lv.camp || 1) * STAFF.perTent;
export const staffMaxLv = S => STAFF.maxLv[Math.min(S.lv.store, STAFF.maxLv.length - 1)];
export function staffStats(p) {
  const m = STAFF.qual[p.q].mult, k = 1 + STAFF.perLv * (p.lv - 1);
  return { hp: Math.round(STAFF.base.hp * m * k), atk: Math.round(STAFF.base.atk * m * k * 10) / 10, def: Math.round(STAFF.base.def * m * k * 10) / 10, eff: Math.round(m * (1 + STAFF.effPerLv * (p.lv - 1)) * 100) / 100 };
}
export const staffUpCost = p => Math.round(STAFF.upCost(p.lv) * STAFF.qual[p.q].cost);
/* 现在的状态：hungry（没吃饭罢工）/ work（在岗）/ rest（设计 68：员工不会受伤，只有这三种） */
export function staffState(S, p) {
  if (!p.fed) return 'hungry';
  return p.job === 'rest' ? 'rest' : 'work';
}
export const working = (S, job) => S.staff.filter(p => p.job === job && onDuty(staffState(S, p)));
export const hasCashier = S => working(S, 'cash').length > 0;
/* 救到一个新的：随机品质、名字、外观 */
export function rollStaff(S, force) {
  let r = rng(), q = 'n'; if (force) q = force; else for (const k of QS) { r -= STAFF.qual[k].chance; if (r < 0) { q = k; break } }
  const used = new Set(S.staff.map(p => p.name)), pool = STAFF.names.filter(n => !used.has(n));
  const name = (pool.length ? pool : STAFF.names)[Math.floor(rng() * (pool.length || STAFF.names.length))];
  const p = { id: S.nextStaff++, name, q, lv: 1, job: 'rest', spent: 0, look: Math.floor(rng() * 1000), fed: true };
  return p;
}
export function addStaff(S, p) { if (S.staff.length >= staffCap(S)) return false; S.staff.push(p); return true }
/* 请走一个老员工：退一半升级花的钱 */
export function dismissStaff(S, id) { const i = S.staff.findIndex(p => p.id === id); if (i < 0) return 0; if (S.staff[i].gun) { (S.guns = S.guns || []).push(S.staff[i].gun) }   /* 0.25：人走了枪退回仓库 */ const back = Math.floor(S.staff[i].spent / 2); S.coins += back; if (S.crewPin) delete S.crewPin[id]; S.staff.splice(i, 1); return back }
/* 新人不留下：留下一点末日币当谢礼 */
export function thankStaff(S, p) { const n = STAFF.thanks[p.q] || 40; S.coins += n; S.st.earned += n; return n }
/* 换岗位；拾荒一次只能派一个人（返回 false = 已经有人在拾荒）。拾荒途中换岗，这一趟就白跑了 */
export const scavPerson = S => S.staff.find(p => p.job === 'scav');
/* 员工补种：这块地指定了种什么、仓库也有这种种子就种它；没指定或者没种子了，就种仓库里最多的那种（用户 10-12 定） */
export function plotSeed(S, i) {
  const want = (S.plotPlan || [])[i]; if (want && S.seeds[want] > 0 && unlocked(S, want)) return want;
  /* 设计 41：仓库快满（≥ 80%）的菜先不种（种了收不下，地白占着），都快满了才照旧 */
  /* 设计 50：都快满了就先不种（以前「都快满了才照旧种」，地白占着、收了也放不下；用户也是按「快满就不种」理解的），地空着写原因 */
  const has = cropsOpen(S).filter(c => S.seeds[c] > 0), room = has.filter(c => (S.stock[c] || 0) < stockCap(S, c) * 0.8);
  return room.sort((a, b) => S.seeds[b] - S.seeds[a])[0] || null;
}
/* 设计 51：员工收完一块地马上补种（跟收算同一件事）：指定了种什么就种那种（有种子就种）；没指定就种回同一种——要有种子、仓库没到 80%；不行就空着等下一件事 */
export function replantSeed(S, i, c) {
  const want = (S.plotPlan || [])[i]; if (want) return S.seeds[want] > 0 && unlocked(S, want) ? want : null;
  /* 设计 52：种子多了以后，一直种回同一种会把地「锁」在最早种的那几样上，别的菜（胡萝卜、萝卜）货柜会空 ——
     有别的菜（有种子、没快满）货柜 + 仓库不到这种的一半，就改种那种最少的 */
  const ok = x => S.seeds[x] > 0 && (S.stock[x] || 0) < stockCap(S, x) * 0.8, hv = x => (S.stock[x] || 0) + onShelves(S, x);
  const low = cropsOpen(S).filter(ok).sort((a, b) => hv(a) - hv(b))[0];
  if (!ok(c)) return null;   // 这种没种子或者快满：照 51 空着，等下一件事
  return low && low !== c && hv(low) < hv(c) * 0.5 ? low : c;
}
/* 设计 50：这块空地为什么空着 —— 'seed' 种子都用完了 / 'full' 能种的种子对应的菜仓库里都 ≥ 80% / 'staff' 没有种地员工，或者员工在忙、还没走过来 */
export function plotEmptyWhy(S, i) {
  const want = (S.plotPlan || [])[i]; if (want && S.seeds[want] > 0 && unlocked(S, want)) return 'staff';
  const has = cropsOpen(S).filter(c => S.seeds[c] > 0); if (!has.length) return 'seed';
  if (!has.some(c => (S.stock[c] || 0) < stockCap(S, c) * 0.8)) return 'full';
  return 'staff';
}
export const EMPTY_WHY = { full: '仓库快满', seed: '没种子', staff: '没人种' };
/* 点一下换一种：自动 → 第一种菜 → 第二种 → … → 自动 */
export function cyclePlotPlan(S, i) {
  S.plotPlan = S.plotPlan || []; const opts = [null, ...cropsOpen(S)], k = opts.indexOf(S.plotPlan[i] || null);
  S.plotPlan[i] = opts[(k + 1) % opts.length]; return S.plotPlan[i];
}
export const fishPerson = S => S.staff.find(p => p.job === 'fish');
/* 换岗位：成功返回 true，不行返回原因（文字） */
export function setJob(S, id, job) {
  const p = S.staff.find(x => x.id === id); if (!p || !(job in STAFF_JOBS)) return '';
  if (job === 'scav') { const o = scavPerson(S); if (o && o !== p) return `拾荒一次只能派一个人，${o.name}已经在拾荒了` }
  if (job === 'fish') { if (S.lv.store < FISHING.store) return `超市 ${FISHING.store} 级才能钓鱼`; if (!S.fishLic) return '先买垂钓证（第一次去码头坐船时买）';
    const o = fishPerson(S); if (o && o !== p) return `钓鱼一次只能派一个人，${o.name}已经在钓鱼了` }
  if (job === 'feed' && !RANCH_IDS.some(k => S.lv[k] > 0)) return '先在「建造」→「牧场」里盖一个动物棚';
  if (job === 'craft' && !wsBuilt(S).length) return '先在「建造」→「工坊」里盖一台机器';
  if (job !== p.job) delete p.trip;
  if (S.crewPin && job !== p.job) delete S.crewPin[p.id];   // 设计 62：换岗，指定的去掉
  p.job = job; return true;
}
/* 拾荒、钓鱼：出门在外（画面上看不见） */
export const onTrip = p => (p.job === 'scav' || p.job === 'fish') && !!p.trip;
/* 员工钓鱼回来：按出门时带的饵，近岸鱼（蚯蚓）/ 深水鱼（玉米饵），不出传说；放进仓库（放不下的扔回去） */
function fishBack(S, p, ev) {
  const C = STAFF_FISH, st = staffStats(p), used = p.trip.bait || {}, nb = (used.worm || 0) + (used.corn || 0);
  const n = Math.round((C.fish[0] + rng() * (C.fish[1] - C.fish[0])) * st.eff * nb / C.bait);
  const ids = [];
  for (let i = 0; i < n; i++) {
    const b = rng() * nb < (used.worm || 0) ? 'worm' : 'corn', zone = b === 'worm' ? 'near' : 'deep';
    const cands = FISH_IDS.filter(id => FISH[id].zone === zone && FISH[id].rar !== 'l' && (FISH[id].bait === b || FISH[id].bait === 'any'));
    if (cands.length) ids.push(pickW(cands, id => FISH_RAR[FISH[id].rar].w));
  }
  const keep = ids.slice(0, whRoom(S, 'fish')); fishIn(S, keep);
  const got = {}; for (const id of keep) got[id] = (got[id] || 0) + 1;
  delete p.trip;
  ev.push({ type: 'fishBack', id: p.id, n: keep.length, lost: ids.length - keep.length, got });
  if (ids.length > keep.length) ev.push({ type: 'whLost', g: 'fish', n: ids.length - keep.length });   // 设计 41
}
function scavBack(S, p, ev) {
  const C = STAFF.scav, st = staffStats(p);
  let n = Math.max(1, Math.round(C.haul * st.eff * (0.8 + rng() * 0.4)));
  let junk = 0, seeds = 0;
  /* 0.15 用户定：另外再带回几个铁罐、塑料瓶，也进物资堆，让回收机回收（能翻倍） */
  /* 0.20 用户：仓库里满了的那种就不带了（堆里原来堆着的这种也扔掉），其他照样带回来 */
  const full = j => whFull(S, JUNK[j].good);
  for (const j of new Set([...S.pile, ...JUNK_IDS.filter(j => (JUNK[j].where === 'scav' && junkOpen(S, j)) || (C.cans || {})[j])].filter(full))) ev.push({ type: 'whLost', g: JUNK[j].good, n: 1 });   // 设计 41：仓库满了，这种带回来也放不下（扔掉 / 不带）
  S.pile = S.pile.filter(j => !full(j));
  const got = {};
  /* 37 供给模拟：超市 1 级拾荒区只有破布一种，铁罐、塑料瓶（罐头、水）太少（货架 1/5 的时间是空的）→ 1 级多带 70% */
  const lv1 = JUNK_IDS.filter(j => JUNK[j].where === 'scav' && junkOpen(S, j)).length <= 1, canX = lv1 ? 2.2 : 1;   // 设计 41：1.7 → 2.2；破布也 ×2.2（1 级要过量 1.3 倍；42 修了回收机超上限以后 1.7 不够）
  if (lv1) n = Math.round(n * 2.2);
  const add = [];   // 42：带回来的先放一起打乱再进物资堆（以前铁罐、瓶子先进，堆满 60 件以后破布进不去，1 级绷带一直不够）
  for (const [j, [a, b]] of Object.entries(C.cans || {})) { if (full(j)) continue; let k = Math.round((a + rng() * (b - a)) * st.eff * canX); for (let i = 0; i < k; i++) add.push(j) }
  /* 0.27 用户：员工带回的东西要平均 —— n 件平分给解锁了的几种拾荒区物资（破布、碎木板、废电池），余数随机给；铁罐、塑料瓶照旧各带 cans 里的数量 */
  { const ids = JUNK_IDS.filter(j => JUNK[j].where === 'scav' && junkOpen(S, j) && !full(j));
    if (ids.length) { const each = Math.floor(n / ids.length), extra = n - each * ids.length, order = [...ids].sort(() => rng() - 0.5);
      ids.forEach(j => { const k = each + (order.indexOf(j) < extra ? 1 : 0); for (let i = 0; i < k; i++) add.push(j) }) } }
  for (let i = add.length - 1; i > 0; i--) { const k = Math.floor(rng() * (i + 1)); [add[i], add[k]] = [add[k], add[i]] }
  for (const j of add) { if (S.pile.length >= C.pile) break; S.pile.push(j); junk++ }
  /* 0.20 偶尔带回 1 个工具箱 */
  if (C.tool && rng() < C.tool) { S.treas.toolbox = (S.treas.toolbox || 0) + 1; got.toolbox = 1 }
  /* 0.18 用户：种子不够种，每趟直接带回 seeds 包（按解锁的菜抽；还没解锁菜时没有） */
  if (C.seeds) { let k = C.seeds[0] + Math.floor(rng() * (C.seeds[1] - C.seeds[0] + 1)); for (let i = 0; i < k; i++) { const c = randSeed(S); if (c) { S.seeds[c]++; seeds++ } } }
  delete p.trip;
  ev.push({ type: 'scavBack', id: p.id, junk, seeds, got });
}
export function staffUpInfo(S, p) {
  if (p.lv >= 20) return { max: true };
  if (p.lv >= staffMaxLv(S)) return { cap: true, need: STAFF.maxLv.findIndex(m => m > p.lv) };
  const c = staffUpCost(p); return { cost: c, ok: S.coins >= c };
}
export function staffUp(S, id) {
  const p = S.staff.find(x => x.id === id); if (!p) return false; const u = staffUpInfo(S, p); if (!u.ok) return false;
  S.coins -= u.cost; p.spent += u.cost; p.lv++; return true;
}
/* 每天的伙食：day 是北京时间日期（画面那边按服务器时间算好传进来），只往后翻 */
export function staffDay(S, day) { if (!S.staffDay || day > S.staffDay) { S.staffDay = day; for (const p of S.staff) p.fed = false; feedStaff(S) } }
function takeFood(S, g, n) {
  if (S.stock[g] >= n) { S.stock[g] -= n; return true }
  if (S.stock[g] + onShelves(S, g) < n) return false;
  let left = n - S.stock[g]; S.stock[g] = 0;
  for (const sh of S.shelves) for (const sl of slotsOf(sh)) if (sl.g === g && left > 0) { const k = Math.min(left, sl.n); sl.n -= k; left -= k }
  return true;
}
export function feedStaff(S) {
  const hungry = S.staff.filter(p => !p.fed).sort((a, b) => QS.indexOf(b.q) - QS.indexOf(a.q));
  for (const p of hungry) {
    const F = STAFF.food;
    if (S.stock.food + onShelves(S, 'food') < F.food || S.stock.water + onShelves(S, 'water') < F.water) break;
    takeFood(S, 'food', F.food); takeFood(S, 'water', F.water); p.fed = true;
  }
}
function tickStaff(S, dt, online, ev) {
  if (!S.staff || !S.staff.length) return;
  if (S.staff.some(p => !p.fed)) feedStaff(S);
  /* 种地：每隔一会儿做一件事：收菜 → 摘果 → 补种 */
  /* 设计 62：种地的人分三拨干活：自动的（和指定两边都管的）照旧「收菜 → 摘果 → 补种」一起算；只管温室的只收菜、补种；只管果园的只摘果 */
  const farmers = online ? working(S, 'farm') : [];   // 0.39 用户：不在玩的时候种地员工不干活（菜和果树照样长）
  const grp = { both: [], gh: [], orch: [] }; for (const p of farmers) { const g = farmDoes(S, p, 'gh'), o = farmDoes(S, p, 'orch'); grp[g && o ? 'both' : g ? 'gh' : 'orch'].push(p) }
  const harvestOne = () => { for (let i = 0; i < S.plots.length; i++) { const pl = S.plots[i]; if (pl && pl.left <= 0) { const r = harvest(S, i, true); if (r && r.lost > 0) ev.push({ type: 'whLost', g: r.c, n: r.lost }); if (r && !r.full) { const re = replantSeed(S, i, r.c); if (re) plant(S, i, re); ev.push({ type: 'staffFarm', what: 'harvest', i, c: r.c, n: r.n, x: r.x || 1, re }); return true } } } return false };   // 设计 51：收完马上补种，算同一件事
  const pickOne = () => { for (let i = 0; i < S.trees.length; i++) { const t = S.trees[i]; if (t && t.left <= 0) { const r = pickTree(S, i, true); if (r && r.lost > 0) ev.push({ type: 'whLost', g: r.k, n: r.lost }); if (r && !r.full) { ev.push({ type: 'staffFarm', what: 'tree', i, c: r.k, n: r.n, x: r.x || 1 }); return true } } } return false };
  const plantOne = () => { const empty = S.plots.findIndex(x => !x), seed = empty >= 0 ? plotSeed(S, empty) : null; if (empty >= 0 && seed && plant(S, empty, seed)) { ev.push({ type: 'staffFarm', what: 'plant', i: empty, c: seed }); return true } return false };
  for (const [g, key, jobs] of [['both', 'farmT', [harvestOne, pickOne, plantOne]], ['gh', 'farmTg', [harvestOne, plantOne]], ['orch', 'farmTo', [pickOne]]]) {
    const ps = grp[g]; if (!ps.length) { if (online) S[key] = 0; continue }
    S[key] = (S[key] || 0) + dt * ps.reduce((a, p) => a + staffStats(p).eff, 0);
    let guard = 0;
    while (S[key] >= STAFF.farmGap && guard++ < 200) {
      S[key] -= STAFF.farmGap;
      if (!jobs.some(f => f())) { S[key] = Math.min(S[key], STAFF.farmGap); break }      // 没活干：别攒着
    }
  }
  if (online) ranchTick(S, dt, ev);
  // 0.39 用户：不在玩的时候牧场停着（饲养员不喂不收，动物不产）
  /* 拾荒：堆没满就出门，到点回来卸货（0.39 用户：不在玩的时候停着，出门的这一趟也暂停） */
  const sp = scavPerson(S);
  if (online && sp && staffState(S, sp) === 'work') {
    let t = dt;
    while (t > 0) {
      if (!sp.trip) { if (pileLive(S) >= STAFF.scav.pile) break; sp.trip = { left: STAFF.scav.trip, total: STAFF.scav.trip }; ev.push({ type: 'scavGo', id: sp.id }) }
      const u = Math.min(t, sp.trip.left); sp.trip.left -= u; t -= u;
      if (sp.trip.left <= 0) { scavBack(S, sp, ev); if (staffState(S, sp) !== 'work') break }
    }
  }
  /* 钓鱼：有饵就出门（带上最多 STAFF_FISH.bait 个，哪种多先用哪种），到点回来把鱼放进仓库；没饵停着，消息只说一次 */
  const fp = fishPerson(S);
  if (online && fp && staffState(S, fp) === 'work') {   // 0.39 用户：不在玩的时候也停着
    let t = dt;
    while (t > 0) {
      if (!fp.trip) {
        const have = (S.bait.worm || 0) + (S.bait.corn || 0);
        if (!have) { if (!fp.noBait) { fp.noBait = true; ev.push({ type: 'noBait', id: fp.id }) } break }
        if (whRoom(S, 'fish') <= 0) break;
        fp.noBait = false;
        const bait = { worm: 0, corn: 0 };
        for (let k = 0; k < STAFF_FISH.bait; k++) { const b = (S.bait.worm || 0) >= (S.bait.corn || 0) ? 'worm' : 'corn'; if (!(S.bait[b] > 0)) break; S.bait[b]--; bait[b]++ }
        fp.trip = { left: STAFF_FISH.trip, total: STAFF_FISH.trip, bait };
      }
      const u = Math.min(t, fp.trip.left); fp.trip.left -= u; t -= u;
      if (fp.trip.left <= 0) { fishBack(S, fp, ev); if (staffState(S, fp) !== 'work') break }
    }
  }
  /* 收银：有人在岗就一位一位结账（只在玩的时候；不玩时顾客本来就不来） */
  const cash = online ? working(S, 'cash') : [];
  if (cash.length && S.queue.length && S.queue[0].ready !== false) {   // ready：顾客真的走到收银台前了（画面那边设置）
    const eff = Math.max(...cash.map(p => staffStats(p).eff));
    S.cashT = (S.cashT || 0) + dt * eff;
    while (S.cashT >= SHOP.checkoutTime * STAFF.cashGap && S.queue.length && S.queue[0].ready !== false) { S.cashT -= SHOP.checkoutTime * STAFF.cashGap; const c = checkout(S); if (c) ev.push({ type: 'staffCheckout', c }) }
  } else S.cashT = 0;
}

/* ================= 主角属性（0.20） ================= */
export const heroCap = S => HERO.cap[S.lv.store] || 5;
export function heroStats(S) {
  const h = S.hero || { hp: 1, dmg: 1, rate: 1, range: 1, nade: 1 }, G = HERO.gun, N = HERO.nade;
  return { hp: HERO.hpByStore[(S.lv && S.lv.store) || 1] || HERO.hpByStore[1],   // 设计 59：尸潮血量跟超市等级走，不能升
    dmg: +(G.dmg * (1 + G.dmgK * ((h.dmg || 1) - 1))).toFixed(1), rate: +(G.rate / (1 + G.rateK * ((h.rate || 1) - 1))).toFixed(3), range: +(G.range + G.rangePer * ((h.range || 1) - 1)).toFixed(2),
    nadeDmg: N.dmg + N.dmgPer * (h.nade - 1), nadeR: +(N.r + N.rPer * (h.nade - 1)).toFixed(2), nadeCd: +(N.cd - N.cdPer * (h.nade - 1)).toFixed(2) };
}
/* ---------- 0.25 员工的 M16：S.guns 是没装上的枪，p.gun 是这个员工手上那把；V1.11 起每把记 {dmg, rate, range} 三个等级 ---------- */
export const GUN_KEYS = ['dmg', 'rate', 'range'];
export const gunSum = g => g ? g.dmg + g.rate + g.range : 0;
export const gunStats = g => { const G = HERO.gun; return { dmg: +(G.dmg * (1 + G.dmgK * (g.dmg - 1))).toFixed(1), rate: +(G.rate / (1 + G.rateK * (g.rate - 1))).toFixed(3), range: +(G.range + G.rangePer * (g.range - 1)).toFixed(2) } };
export function buyGuardGun(S) { if (S.coins < GUARD_GUN.price) return false; S.coins -= GUARD_GUN.price; (S.guns = S.guns || []).push({ dmg: 1, rate: 1, range: 1 }); return true }
export function equipGun(S, id) { const p = S.staff.find(x => x.id === id); if (!p || p.gun || !(S.guns || []).length) return false;
  let i = 0; S.guns.forEach((g, j) => { if (gunSum(g) > gunSum(S.guns[i])) i = j }); p.gun = S.guns.splice(i, 1)[0]; return true }   // 先给升得最多的那把
export function unequipGun(S, id) { const p = S.staff.find(x => x.id === id); if (!p || !p.gun) return false; (S.guns = S.guns || []).push(p.gun); p.gun = 0; return true }
/* V1.11：员工 M16 跟主角一样分三条升，花费、上限照主角 */
export function gunUpInfo(S, id, k) {
  const p = S.staff.find(x => x.id === id); if (!p || !p.gun || !GUN_KEYS.includes(k)) return null;
  const cur = p.gun[k], to = cur + 1, cap = heroCap(S);
  if (to > HERO.cap[HERO.cap.length - 1]) return { cur, max: true };
  const cost = HERO.cost(to);
  if (to > cap) return { cur, to, cost, capped: true, lack: [`超市 ${S.lv.store + 1} 级才能继续升`], ok: false };
  const lack = [];
  if (S.coins < cost.coins) lack.push(`末日币差 ${cost.coins - Math.floor(S.coins)}`);
  if ((S.treas.toolbox || 0) < cost.toolbox) lack.push(`工具箱差 ${cost.toolbox - (S.treas.toolbox || 0)}`);
  return { cur, to, cost, lack, ok: !lack.length };
}
export function gunUp(S, id, k) { const inf = gunUpInfo(S, id, k); if (!inf || !inf.ok) return false; S.coins -= inf.cost.coins; S.treas.toolbox -= inf.cost.toolbox; S.staff.find(x => x.id === id).gun[k] = inf.to; return true }
export function heroInfo(S, k) {
  if (k === 'hp') return { cur: 1, max: true };   // 设计 59：血量不升级了
  const cur = (S.hero || {})[k] || 1, to = cur + 1, cap = heroCap(S);
  if (to > HERO.cap[HERO.cap.length - 1]) return { cur, max: true };
  const cost = HERO.cost(to);
  if (to > cap) return { cur, to, cost, capped: true, lack: [`超市 ${S.lv.store + 1} 级才能继续升`], ok: false };
  const lack = [];
  if (S.coins < cost.coins) lack.push(`末日币差 ${cost.coins - Math.floor(S.coins)}`);
  if ((S.treas.toolbox || 0) < cost.toolbox) lack.push(`工具箱差 ${cost.toolbox - (S.treas.toolbox || 0)}`);
  return { cur, to, cost, lack, ok: !lack.length };
}
export function heroUp(S, k) {
  const inf = heroInfo(S, k); if (!inf.ok) return false;
  S.coins -= inf.cost.coins; S.treas.toolbox -= inf.cost.toolbox; S.hero[k] = inf.to; return true;
}
