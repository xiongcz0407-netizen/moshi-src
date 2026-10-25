/* ================= 设计 56：副本的存档逻辑（装备、炼宝、技能、晶石、挑战和奖励）。打的过程在 fbcore.js ================= */
import { FB, BOSSES, QUAL, SLOTS, STAT, AFF, MAIN, ITEMS, SETS, setOf, legOf, DROP, LV_NAMES, LEG_OLD, LEG_KEYS, LEG_GONE, LEG_SWAP, REFINE, CRYSTAL, SKILLS, SKILL_IDS, SKILL_MAX, skillCost } from './fbcfg.js';

export const fbNew = () => ({ won: {}, bag: [], eq: { w: null, h: null, a: null, g: null, b: null, m: null }, crys: 0, sk: { focus: 1, roll: 1, stun: 1 }, nid: 1, run: 0, pend: null, best: {}, log: [] });
export function fbFix(S) {
  const d = fbNew(); S.fb = Object.assign(d, S.fb || {}); S.fb.eq = Object.assign(d.eq, S.fb.eq || {}); S.fb.sk = Object.assign({ focus: 1, roll: 1, stun: 1 }, S.fb.sk || {});
  for (const id of Object.keys(S.td.wins || {})) if (+id > 100) delete S.td.wins[id];   // 设计 56：英雄尸潮去掉了，旧存档的英雄关进度不留
  if (!Array.isArray(S.fb.log)) S.fb.log = [];
  /* 设计 105：老存档迁移——传说 l1～l10、l_m 换成新 key（lv 保留）；套装件的 lv 改成这套的（拾荒者 5、猎杀者 10） */
  const fix = it => { if (!it) return; if (!(it.lv >= 1)) it.lv = 1;
    if (LEG_OLD[it.k] && LEG_OLD[it.k] !== it.k) { const to = LEG_OLD[it.k];   /* 设计 105b：不用了的传说换成同部位的，掉落记录写一条 */
      if (LEG_GONE[it.k]) fbLog(S, { a: 'adj', from: LEG_GONE[it.k], to, lv: it.lv, id: it.id, txt: `传说调整：${LEG_GONE[it.k]} 换成 ${nameAt(to, it.lv)}` });
      it.k = to }
    const D = ITEMS[it.k]; if (D && D.set) it.lv = D.lv };
  S.fb.bag.forEach(fix); for (const sl of SLOTS) fix(S.fb.eq[sl]); fix(S.fb.pend);
  for (const e of S.fb.log) if (e && e.k && LEG_OLD[e.k]) e.k = LEG_OLD[e.k];
  return S.fb;
}
/* 设计 105：显示用的名字。史诗、普通、传说按 it.lv（第几关）查 LV_NAMES，每关都不一样；套装用原名。名字现算，存档不存 */
export const nameAt = (k, lv) => { const D = ITEMS[k]; if (!D) return k; return (!D.set && LV_NAMES[lv] && LV_NAMES[lv][k]) || D.name };
export const itemName = it => nameAt(it.k, it.lv);
/* 设计 90：掉落记录（GM 页面查「刷了很多次都没出 X」用）。a：win 打赢掉落 / take 收下 / wear 穿上 / dis 分解；只留最近 100 条 */
export const LOG_MAX = 100;
export function fbLog(S, e) { const L = Array.isArray(S.fb.log) ? S.fb.log : (S.fb.log = []); L.push({ t: Date.now(), ...e }); if (L.length > LOG_MAX) L.splice(0, L.length - LOG_MAX) }
const r1 = x => Math.round(x * 10) / 10;
export const stageK = lv => 1 + 0.15 * (lv - 1);
export const starK = st => 1 + 0.1 * st;
/* 一件装备的数值：main 主属性、aff 固定属性（[属性, 值]），按 物品等级 × 星数 × 品质倍数 */
export function itemStats(it) {
  const D = ITEMS[it.k], k = stageK(D.set ? D.lv : it.lv) * starK(it.st || 0), q = QUAL[D.q];   // 设计 105：套装不吃掉落关，按这套的 lv（拾荒者 5、猎杀者 10）
  const main = {}; for (const [s, v] of Object.entries(MAIN[D.slot][D.q])) main[s] = r1(v * k);
  const aff = D.aff.map(s => [s, s === 'pierce' ? 1 : r1(AFF[s] * k * q.k)]);
  return { main, aff };
}
export const statTxt = (s, v) => `${STAT[s].name} ${STAT[s].pct ? '+' + v + '%' : '+' + v}`;
const W8 = { dmg: 1, rate: 1, crit: 1, cdmg: 0.3, hp: 0.06, dr: 1, spd: 0.6, leech: 1, slow: 0.3, pierce: 5, ndmg: 0.2, ncd: 0.3, boss: 0.8, cdr: 0.8 };
export function itemScore(it) {
  if (!it) return 0; const s = itemStats(it), D = ITEMS[it.k]; let v = 0;
  for (const [k, x] of Object.entries(s.main)) v += x * (W8[k] || 0) * 1.2;
  for (const [k, x] of s.aff) v += x * (W8[k] || 0);
  return v + (D.q === 'l' ? 8 : D.q === 's' ? 3 : 0);
}
export const itemById = (S, id) => S.fb.bag.find(x => x.id === id) || SLOTS.map(s => S.fb.eq[s]).find(x => x && x.id === id) || (S.fb.pend && S.fb.pend.id === id ? S.fb.pend : null);
export const better = (S, it) => itemScore(it) > itemScore(S.fb.eq[ITEMS[it.k].slot]) + 0.01;
/* 设计 105（设计104 第 4、5 条）：炼到 st 星时的属性（超过这件最高星按最高星）；跟身上同星比 */
export const capSt = (it, st) => Math.min(QUAL[ITEMS[it.k].q].stars, Math.max(0, st || 0));
export const statsAt = (it, st) => itemStats({ ...it, st: capSt(it, st) });
export function betterAt(S, it) { const cur = S.fb.eq[ITEMS[it.k].slot]; if (!cur) return false; return itemScore({ ...it, st: capSt(it, cur.st) }) > itemScore(cur) + 0.01 }
/* 身上装备加起来（含套装效果、上限） */
export function gearStats(S) {
  const t = {}; for (const k of Object.keys(STAT)) t[k] = 0;
  const sets = {}, legs = [];
  for (const sl of SLOTS) { const it = S.fb.eq[sl]; if (!it) continue; const st = itemStats(it), D = ITEMS[it.k];
    for (const [k, v] of Object.entries(st.main)) t[k] += v; for (const [k, v] of st.aff) t[k] += v;
    if (D.set) sets[D.set] = (sets[D.set] || 0) + 1; if (D.q === 'l') legs.push(it.k) }
  if (sets.s1 >= 2) t.hpPct += 15; if (sets.s2 >= 2) t.boss += 15;
  if (sets.s1 >= 4) { t.all += SETS.s1.four4; t.dr += 10 } if (sets.s2 >= 4) { t.cdmg += 50; t.all += SETS.s2.four4 }
  if (sets.s1 >= 5) t.all += SETS.s1.five5; if (sets.s2 >= 5) t.all += SETS.s2.five5;   // 设计 59：5 件套「全部伤害 +10%」
  if (legs.includes('l_w')) t.leech += 2;   // 设计 101：獠牙（设计 105b 起 key 是 l_w）自带吸血 2%
  for (const [k, d] of Object.entries(STAT)) if (d.cap) t[k] = Math.min(d.cap, t[k]);
  t.sets = sets; t.legs = legs; return t;
}
/* 换上 it 以后整身的总属性（装备页对比用，含套装效果） */
export function gearAfter(S, it) { const eq = { ...S.fb.eq, [ITEMS[it.k].slot]: it }; return gearStats({ fb: { ...S.fb, eq } }) }
/* 打副本用的主角数值：主角升级（heroStats）+ 装备 + 技能等级 */
export function fbHero(S, hs) {
  const g = gearStats(S);
  return { hp: Math.round((FB.baseHp + g.hp) * (1 + g.hpPct / 100)), dmg: hs.dmg * (1 + g.dmg / 100) * (1 + g.all / 100), all: g.all / 100, rate: hs.rate / (1 + g.rate / 100), range: hs.range + (g.legs.includes('l_h') ? 2 : 0),
    crit: g.crit / 100, cdmg: 1.5 + g.cdmg / 100, dr: g.dr / 100, spd: 1 + g.spd / 100 + (g.sets.s1 >= 4 ? 0.15 : 0), leech: g.leech / 100, slow: g.slow / 100, pierce: g.pierce,
    nadeDmg: (hs.nadeDmg || 45) * (1 + g.ndmg / 100) * (1 + g.all / 100), nadeR: hs.nadeR || 2.6, nadeCd: (hs.nadeCd || 10) * (1 - g.ncd / 100), heart: g.legs.includes('l_m'),
    boss: 1 + g.boss / 100, cdr: g.cdr / 100, bleed: g.legs.includes('l_w'), s1four: g.sets.s1 >= 4, s2four: g.sets.s2 >= 4, bossCrit: g.legs.includes('l_h') ? 0.1 : 0,
    sk: { ...S.fb.sk } };
}
/* ---------- 挑战 ---------- */
export function fbLockWhy(S, n) {
  const B = BOSSES[n]; if (!B) return '没有这一关';
  if (S.lv.store < FB.store) return `超市 ${FB.store} 级解锁`;
  if (!B.open) return '还没开放';
  if (n > 1 && !(S.fb.won[n - 1] > 0)) return '先打赢前一关';
  return null;
}
export function fbCanStart(S, n) { const w = fbLockWhy(S, n); if (w) return w; if (S.td.scrolls < FB.scrolls(n)) return '尸潮卷不够，去院子商人那里买'; if (S.fb.pend) return '上次的装备还没收下'; return null }
export function fbStart(S, n) { if (fbCanStart(S, n)) return false; S.td.scrolls -= FB.scrolls(n); S.fb.run = n; return true }
export function fbLose(S) { S.fb.run = 0 }
const newItem = (S, k, lv) => ({ id: S.fb.nid++, k, lv: ITEMS[k].lv || lv, st: 0, crys: 0, nw: 1 });   // nw：新得到、还没看过（背包里画红点）
const pick = (a, r) => a[Math.floor(r * a.length) % a.length];
/* 设计 82：第一次打赢的保底（副本面板也读这里）：第 1 关史诗武器、第 5 关一件史诗、第 10 关传说 */
export function firstDrop(n) {
  if (n === 1) return { q: 'e', what: '史诗武器', keys: ['e_w1', 'e_w2'] };
  if (n === 5) return { q: 'e', what: '一件史诗', keys: Object.keys(ITEMS).filter(x => ITEMS[x].q === 'e') };
  if (n === 10) return { q: 'l', what: '一件传说（随机部位）', keys: LEG_KEYS };   // 设计 105b：6 种随机
  return null;
}
/* 设计 82：每次打赢能掉什么（按品质，从好到差）：[{ q, p（概率）, keys }] */
export function dropTable(n) {
  const d = DROP(n), of = q => Object.keys(ITEMS).filter(x => ITEMS[x].q === q);
  return [{ q: 'l', p: d[3], keys: LEG_KEYS },   /* 设计 105b：传说 6 种每关都能掉 */ { q: 's', p: d[2], keys: [setOf(n)] }, { q: 'e', p: d[1], keys: of('e') }, { q: 'n', p: d[0], keys: of('n') }];
}
/* 打赢：末日币、晶石、1 件装备（第一次打赢第 1 关必掉史诗武器）。装备先放 pend，在「获得」框里穿上 / 收下 / 分解 */
export function fbWin(S, n, rng = Math.random, secs = 0) {
  const first = !(S.fb.won[n] > 0); S.fb.won[n] = (S.fb.won[n] || 0) + 1; S.fb.run = 0;
  if (secs && (!S.fb.best[n] || secs < S.fb.best[n])) S.fb.best[n] = Math.round(secs);
  const coins = FB.coins(n), crys = FB.crystals(n); S.coins += coins; S.st.earned += coins; S.fb.crys += crys;
  let k;
  const fd = first && firstDrop(n);
  if (fd) k = n === 10 ? legOf(10, rng()) : pick(fd.keys, rng());
  else { const d = DROP(n), r = rng();
    if (r < d[0]) k = pick(Object.keys(ITEMS).filter(x => ITEMS[x].q === 'n'), rng());
    else if (r < d[0] + d[1]) k = pick(Object.keys(ITEMS).filter(x => ITEMS[x].q === 'e'), rng());
    else if (r < d[0] + d[1] + d[2]) k = setOf(n); else k = legOf(n, rng()) }
  const item = newItem(S, k, n); S.fb.pend = item; S.fb.got = { n, coins, crys, first, secs: Math.round(secs) };
  fbLog(S, { a: 'win', n, k, lv: item.lv, id: item.id, how: fd ? 'first' : 'rand' });
  return { n, coins, crys, item, first, secs };
}
export const bagFull = S => S.fb.bag.length >= FB.bag;
/* 「获得」框：收下（进背包）/ 穿上 / 分解 */
export function pendTake(S) { const it = S.fb.pend; if (!it || bagFull(S)) return false; S.fb.bag.push(it); S.fb.pend = null; fbLog(S, { a: 'take', k: it.k, lv: it.lv, id: it.id }); return true }
export function equip(S, id) {
  let it = S.fb.pend && S.fb.pend.id === id ? S.fb.pend : null, from = 'pend';
  if (!it) { const i = S.fb.bag.findIndex(x => x.id === id); if (i < 0) return false; it = S.fb.bag[i]; from = i }
  const sl = ITEMS[it.k].slot, old = S.fb.eq[sl];
  if (from === 'pend') { if (old && bagFull(S)) return '背包满了，先分解一件'; S.fb.pend = null; if (old) S.fb.bag.push(old); fbLog(S, { a: 'wear', k: it.k, lv: it.lv, id: it.id }) }
  else { S.fb.bag.splice(from, 1); if (old) S.fb.bag.push(old) }
  S.fb.eq[sl] = it; return true;
}
export function unequip(S, sl) { const it = S.fb.eq[sl]; if (!it || bagFull(S)) return false; S.fb.eq[sl] = null; S.fb.bag.push(it); return true }
/* 一键分解普通（背包里的，不含穿着的） */
export const normals = S => S.fb.bag.filter(it => ITEMS[it.k].q === 'n');
export function dismantleNormals(S) { let n = 0; for (const it of normals(S)) n += dismantle(S, it.id); return n }
export const dismantleGain = it => QUAL[ITEMS[it.k].q].crys + Math.floor((it.crys || 0) / 2);
export function dismantle(S, id) {
  let it = null;
  if (S.fb.pend && S.fb.pend.id === id) { it = S.fb.pend; S.fb.pend = null }
  else { const i = S.fb.bag.findIndex(x => x.id === id); if (i < 0) return 0; it = S.fb.bag.splice(i, 1)[0] }
  const n = dismantleGain(it); S.fb.crys += n; fbLog(S, { a: 'dis', k: it.k, lv: it.lv, id: it.id, st: it.st || 0 }); return n;
}
/* ---------- 设计 105b：传说转换（铁匠）：背包里的传说花 2000 末日币，随机换成同一关的另外 5 种之一（各 1/5，不会换回自己），Lv、星、id 不变 ---------- */
export const swapTargets = it => LEG_KEYS.filter(k => k !== it.k);
export function legSwapWhy(S, it) { if (!it || !S.fb.bag.includes(it)) return '只能转换背包里的传说'; if (!ITEMS[it.k] || ITEMS[it.k].q !== 'l') return '只有传说能转换'; if (S.coins < LEG_SWAP) return '末日币不够'; return null }
export function legSwap(S, id, rng = Math.random) {
  const it = S.fb.bag.find(x => x.id === id), why = legSwapWhy(S, it); if (why) return { ok: false, why };
  const from = it.k, to = pick(swapTargets(it), rng());
  S.coins -= LEG_SWAP; it.k = to; fbLog(S, { a: 'swap', from, to, k: to, lv: it.lv, id: it.id, st: it.st || 0 });
  return { ok: true, from, to, it };
}
/* ---------- 炼宝 ---------- */
export function refineInfo(it) {
  const to = (it.st || 0) + 1, max = QUAL[ITEMS[it.k].q].stars; if (to > max) return { max: true };
  const base = REFINE.rate[to], pity = to >= REFINE.pityFrom && to <= REFINE.pityTo ? (it.pity || 0) * REFINE.pity : 0;
  return { to, cost: to, rate: Math.min(1, base + pity), base, pity, luck: to > REFINE.pityTo };
}
export function refine(S, id, rng = Math.random) {
  const it = itemById(S, id); if (!it) return null; const inf = refineInfo(it); if (inf.max) return null;
  if (S.fb.crys < inf.cost) return { ok: false, why: '晶石不够' };
  S.fb.crys -= inf.cost; it.crys = (it.crys || 0) + inf.cost;
  if (rng() < inf.rate) { it.st = inf.to; it.pity = 0; return { ok: true, star: it.st } }
  if (inf.to >= REFINE.pityFrom && inf.to <= REFINE.pityTo) it.pity = (it.pity || 0) + 1;
  return { ok: false, star: it.st || 0 };
}
/* ---------- 技能 ---------- */
export function skillUp(S, k) { const lv = S.fb.sk[k] || 1; if (lv >= SKILL_MAX) return false; const c = skillCost(lv + 1); if (S.coins < c) return false; S.coins -= c; S.fb.sk[k] = lv + 1; return true }
/* ---------- 晶石 ---------- */
export function buyCrystal(S, i) { const p = CRYSTAL.packs[i]; if (!p || S.coins < p[1]) return false; S.coins -= p[1]; S.fb.crys += p[0]; return true }
export function starCrystal(S, stars = 1) { stars = Math.max(1, Math.floor(+stars || 1)); if ((S.stars || 0) < stars) return false;   /* 设计 77：n 取整、至少 1 */ S.stars -= stars; S.fb.crys += stars * CRYSTAL.perStar; return true }
export { SKILLS, SKILL_IDS };
