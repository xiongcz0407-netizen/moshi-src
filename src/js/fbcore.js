/* ================= 设计 56：副本战斗（纯逻辑，没有 three.js）。游戏（fb.js）和模拟（tools/fbsim.mjs）都用它 =================
   场地：x −6.6～6.6（两边山崖），z 19（南边铁门）～ −13（北边平台前沿）；往北（z 变小）打。
   step(dt, input) 每帧推进；input = { mx, mz（摇杆，长度 ≤ 1）, fire（按住攻击）, skill（'focus' | 'roll' | 'stun' | null） }。
   画面需要的东西都在 state 里（boss、player、mobs、warns），一次性的事件放在 ev 里（画面拿去放动作、特效、飘字）。 */
import { FB, BOSSES, SKILLS } from './fbcfg.js';
import { makeGrid, findPath, nextPoint, lineFree } from './fbpath.js';   /* 设计 83：会走动的 BOSS 用格子找路 */

/* 屠夫动作的时间（屠夫.glb 里每个动作多长、哪一刻刀落地；动作脚本 fb/rig/anim.py 导出） */
export const BUTCHER_ANIM = {
  idle: { T: 2.6, loop: 1 }, walk: { T: 1.0, loop: 1, speed: 0.355 }, run: { T: 0.55, loop: 1, speed: 1.435 },
  swing: { T: 1.3, hit: 0.62 }, charge_start: { T: 1.5, hit: 1.5 }, slam: { T: 3.0, hit: 1.5 }, roar: { T: 1.9, hit: 0.8 },
  hit: { T: 0.45 }, enrage: { T: 2.2 }, die: { T: 2.6, hit: 1.85 },
};
export const BOSS_SCALE = 5.7;            // 模型 0.95 → 约 5.4 米高（设计 61：放大 1.5 倍，约主角 3 倍高；原来 3.8）
export const FALL_LEN = 4.2;   // 设计 61：倒下的身子有多长
/* 设计 81：每关一份配置（场地、掩体、BOSS 身体大小）。ARENA / COVERS 是「现在这一关」的（createFight、fb.js 建场地时 setStage 换）。
   掩体：挡子弹、挡人，冲锋撞到就停（半宽 hx、半深 hz） */
export const STAGES = {
  1: { arena: { x0: -6.6, x1: 6.6, z0: -13, z1: 19, start: { x: 0, z: 15.5 }, boss: { x: 0, z: -9.5 } }, bossR: 1.7, hitY: 1.8,
    /* 设计 83：推车、木箱、油桶贴着崖边摆（原来跟崖边隔 1.1～1.3 米：主角钻得过去、屠夫钻不过去，是躲 BOSS 的死角） */
    covers: [{ k: 'block', x: 0, z: 0.5, hx: 1.05, hz: 0.85 }, { k: 'cart', x: -5.4, z: 6.5, hx: 1.2, hz: 0.7 }, { k: 'crates', x: 5.65, z: -3.2, hx: 0.95, hz: 0.95 }, { k: 'barrels', x: -5.7, z: -6.6, hx: 0.9, hz: 0.9 }],
    walk: { stuck: 2, stuckGain: 1, replan: 0.3, replanMove: 1 } },
  /* 第 2 关毒囊：毒雾断崖。台地宽 14、长 38（北边 z −16 是崖边，毒囊在崖下 z −17.6，露上半身、手扒崖边）；南边接破铁桥。掩体两边错开 */
  2: { arena: { x0: -7, x1: 7, z0: -16, z1: 22, start: { x: 0, z: 19 }, boss: { x: 0, z: -17.6 } }, bossR: 2.5, hitY: 2.8, lockZ: -5,   /* 设计 99：出生点照旧在南边铁桥头（z = 19），自己走过台地。设计 95：毒囊缩到 0.7（bossR 3.6 → 2.5，受击高度 4.2 → 2.8）。 */   /* 设计 95：主角往北走过 z = -5 才开打，身后封死，只在北边 11 米里打（毒囊一直在画面里） */
    covers: [{ k: 'rock', x: -3.9, z: -7.5, hx: 1.0, hz: 0.95 }, { k: 'barrels', x: 3.8, z: -6.9, hx: 0.95, hz: 1.1 }, { k: 'pipe', x: -3.4, z: 2.8, hx: 1.45, hz: 0.5 }, { k: 'stump', x: 3.6, z: 8.2, hx: 0.7, hz: 0.75 }] },
};
export let ARENA = null, COVERS = null;
export function setStage(n) {
  const g = STAGES[n] || STAGES[1];
  ARENA = { ...g.arena, start: { ...g.arena.start }, boss: { ...g.arena.boss } }; COVERS = g.covers.map(c => ({ ...c }));
  return g;
}
setStage(1);
const CFG = {
  bossR: 1.7, coverR: 1.15, turn: Math.PI * 4, edgeGap: 1.5,   /* 设计 64：主角转身每秒 720°；屠夫追人时离场地两边至少 1.5 米 */   /* 脚底碰掩体、找路用：放大到 1.4 时屠夫过不了掩体之间的缝，卡在后面，fbsim 用时 151 秒；脚的占地本来就比肩膀小，留 1.15 */ walk: 1.5,   /* 设计 61：屠夫放大 1.5 倍，身体半径 1.15 → 1.7（挨子弹、碰人、碰掩体都用它） */ swingR: 3.9, swingA: 1.75, swingCd: 2.2, swingK: 0.5,
  chargeLen: 15, chargeW: 2.6, chargeSpd: 11, slamR: 5.6, summonR: 1.4, burstK: 0.6,
  mobHp: 0.02, mobSpd: 2.3, mobHit: 0.04, mobR: 0.45,
  skillGap: 8.5, firstSkill: 5, summonCd: 30, order: ['charge', 'slam', 'summon', 'slam', 'charge', 'summon'],
  regenDelay: 3, regen: 0.02, bulletSpd: 42, burst: 3, burstGap: 0.07,
};
export { CFG as FB_CFG };
/* 设计 81：毒囊的数（招式表见设计81 第 5 节）。普通技能 = BOSSES[2].dmg（205），大招 = ult（340） */
/* 设计 95：毒囊整只缩到 0.7（以崖下的原点缩，露出来约 4.3 米，主角的 2.5 倍），拍地的位置、长度跟着手缩 */
export const TOX_K = 0.7;
export const TOX_CFG = {
  spitR: 13, spitA: 0.55, spitK: 0.6, spitWarn: 1.3, spitRange: 12, spitCd: [3, 4], calm: 2.5, calmRage: 2,   /* 设计 92：喷吐读条 0.8 → 1.3 秒；任意两个技能之间至少安静 2.5 秒（狂暴 2 秒） */
  bolts: 3, bolts2: 5, boltR: 1.6, boltGap: 0.5, boltWarn: 1.2, boltFly: 0.6, boltK: 1,
  poolR: 1.4, poolLife: 6, poolLife2: 8, poolMax: 6,   /* 设计 95：区域只剩 11 米深，原 1.7 / 8 / 10 / 8 */
  poolK: 0.25, poolSlow: 0.3,
  pusN: [4, 5], pusR: 2.5, pusFill: 3, pusFly: 0.6, pusK: 1.2, pusHp: 0.015,
  slamX: 2.45, slamW: 4.2, slamL: 4.5,   /* 设计 95：原 3.5 / 6 / 7，跟着毒囊缩 0.7（手落地离崖边 4.5 米） */ slamK: 1.3, surgeWarn: 2.0, surgeLife: 4, surgeK: 0.15,
  shrinkEvery: 25, shrinkStep: 0.6, shrinkMax: 2, shrinkWarn: 3,
  first: 4, gap: 7, gapRage: 5.5, order: ['bolt', 'burst', 'slam', 'bolt', 'surge', 'slam'], orderRage: ['bolt', 'surge', 'slam', 'burst', 'surge', 'slam'],
};
/* 毒囊动作的时间（毒囊.glb，脚本 fb2/rig/anim.py 导出；hit = 喷出 / 拍到 / 炸开那一刻） */
export const TOX_ANIM = { idle: { T: 3.0, loop: 1 }, spit: { T: 1.5, hit: 0.8 }, bolt_wind: { T: 0.6 }, bolt_spit: { T: 0.45, hit: 0.12 }, burst: { T: 2.1, hit: 1.15 },
  slam_l: { T: 2.6, hit: 1.5 }, slam_r: { T: 2.6, hit: 1.5 }, surge: { T: 2.8, hit: 2.0 }, hit: { T: 0.4 }, enrage: { T: 2.0 }, die: { T: 3.0, hit: 2.2 } };
export const TOX_NAME = { spit: '酸液喷吐', bolt: '毒弹', burst: '毒囊爆裂', slam: '拍地', surge: '毒雾上涌' };
const hyp = Math.hypot, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angD = (a, b) => { let d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)) };
/* 线段 p→q 有没有穿过掩体；返回第一个碰到的点的比例（0～1），没碰到返回 null */
export function segHit(px, pz, qx, qz, pad = 0) {
  let best = null;
  for (const c of COVERS) {
    const dx = qx - px, dz = qz - pz; let t0 = 0, t1 = 1;
    for (const [p, d, lo, hi] of [[px, dx, c.x - c.hx - pad, c.x + c.hx + pad], [pz, dz, c.z - c.hz - pad, c.z + c.hz + pad]]) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { t0 = 2; break } continue }
      let a = (lo - p) / d, b = (hi - p) / d; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) break;
    }
    if (t0 <= t1 && t0 <= 1 && (best === null || t0 < best)) best = t0;
  }
  return best;
}
/* 圆（人、怪）推出掩体和场地边 */
export function push(p, r) {
  for (const c of COVERS) {
    const nx = clamp(p.x, c.x - c.hx, c.x + c.hx), nz = clamp(p.z, c.z - c.hz, c.z + c.hz), dx = p.x - nx, dz = p.z - nz, d = hyp(dx, dz);
    if (d < r) { if (d > 1e-6) { p.x = nx + dx / d * r; p.z = nz + dz / d * r } else { const ox = p.x - c.x, oz = p.z - c.z; if (c.hx - Math.abs(ox) < c.hz - Math.abs(oz)) p.x = c.x + Math.sign(ox || 1) * (c.hx + r); else p.z = c.z + Math.sign(oz || 1) * (c.hz + r) } }
  }
  p.x = clamp(p.x, ARENA.x0 + r, ARENA.x1 - r); p.z = clamp(p.z, ARENA.z0 + r, ARENA.z1 - r);
}
/* 绕开掩体：从 a 去 b 被掩体挡住时，先走到掩体旁边的一点（离直线近、在场地里的那边） */
export function detour(a, b, r) {
  const t = segHit(a.x, a.z, b.x, b.z, r); if (t === null) return b;
  const hx = a.x + (b.x - a.x) * t, hz = a.z + (b.z - a.z) * t;
  const c = COVERS.reduce((p, q) => Math.hypot(hx - q.x, hz - q.z) < Math.hypot(hx - p.x, hz - p.z) ? q : p);
  const pts = [[c.x - c.hx - r - 0.35, c.z - c.hz - r - 0.35], [c.x + c.hx + r + 0.35, c.z - c.hz - r - 0.35], [c.x - c.hx - r - 0.35, c.z + c.hz + r + 0.35], [c.x + c.hx + r + 0.35, c.z + c.hz + r + 0.35]]
    .filter(([x, z]) => x > ARENA.x0 + r && x < ARENA.x1 - r && z > ARENA.z0 + r && z < ARENA.z1 - r);
  let best = b, bl = 1e9;
  for (const [x, z] of pts) { if (Math.hypot(x - a.x, z - a.z) < 0.3) continue; if (segHit(a.x, a.z, x, z, r - 0.05) !== null) continue; const l = Math.hypot(x - a.x, z - a.z) + Math.hypot(b.x - x, b.z - z); if (l < bl) { bl = l; best = { x, z } } }
  return best;
}
const inCover = (x, z, r) => COVERS.find(c => Math.abs(x - c.x) < c.hx + r && Math.abs(z - c.z) < c.hz + r);
/* 一点在不在预警形状里（r：人的半径） */
export function inWarn(w, x, z, r = 0.35) {
  const dx = x - w.x, dz = z - w.z;
  if (w.type === 'circle') return hyp(dx, dz) < w.r + r;
  if (w.type === 'fan') { const d = hyp(dx, dz); return d < w.r + r && Math.abs(angD(Math.atan2(dx, dz), w.yaw)) < w.a / 2 + Math.atan2(r, Math.max(d, 0.3)) }
  if (w.type === 'line') { const s = Math.sin(w.yaw), c = Math.cos(w.yaw), along = dx * s + dz * c, side = dx * c - dz * s; return along > -1 && along < w.len + r && Math.abs(side) < w.w / 2 + r }
  if (w.type === 'multi') return w.pts.some(p => hyp(x - p.x, z - p.z) < w.r + r);
  return false;
}

export function createFight(n, hero, opt = {}) {
  const SG = setStage(n), BR = SG.bossR, TOX = n === 2;   /* 设计 81：第 2 关毒囊（不走动，在北边崖下） */
  const B = BOSSES[n], rnd = opt.rng || Math.random, warnT = FB.warn(n);
  const st = {
    n, t: 0, clk: 0, locked: SG.lockZ == null, lockZ: SG.lockZ ?? null, over: 0, win: false, rage: false, ev: [], warns: [], mobs: [], shots: [], nades: [], nid: 1, pools: [], zones: [], hazards: [], moveK: 1, half: false, shrink: 0, bossR: BR, hitY: SG.hitY,
    boss: { x: ARENA.boss.x, z: ARENA.boss.z, yaw: 0, look: null, hp: B.hp, max: B.hp, act: 'wait', at: 0, anim: 'idle', ts: 1, animId: 0, cast: null, stun: 0, slow: 0, swingCd: 3, skillT: CFG.firstSkill, summonT: 0, oi: 0, bleed: 0, bleedDps: 0, dead: false, interruptible: false },
    player: { x: ARENA.start.x, z: ARENA.start.z, yaw: Math.PI, hp: hero.hp, max: hero.hp, inv: 0, hurtT: 99, roll: null, cd: { focus: 0, roll: 0, stun: 0, nade: 0 }, charges: SKILLS.roll.charges(hero.sk.roll), focus: 0, focusT: 0, shotT: 0, aim: null, regen10: 0, firing: false, target: null, dead: false },
    stats: { shots: 0, dmg: 0, taken: 0, hits: 0, casts: {}, interrupts: 0, mobsKilled: 0 },
    hero,
  };
  const E = (e, o = {}) => st.ev.push({ e, ...o });
  const bossDmg = ult => (ult ? B.ult : B.dmg) * (st.rage ? FB.rage.dmg : 1);
  const wdur = base => base * (st.rage ? FB.rage.warn : 1);
  const setAnim = (a, ts = 1) => { const b = st.boss; b.anim = a; b.ts = ts; b.animId++; E('anim', { a, ts }) };
  const sk = k => hero.sk[k] || 1;
  const cdOf = k => { if (k === 'nade') return hero.nadeCd || 10; let c = SKILLS[k].cd(sk(k)) * (1 - hero.cdr); if (k === 'focus' && hero.s2four) c *= 0.7; return c };
  const P = st.player, Bo = st.boss;
  if (TOX) { Bo.act = 'idle'; Bo.skillT = TOX_CFG.first; Bo.look = 'p' }
  /* ---------- 设计 83：会走动的 BOSS 找路、卡住换招（通用：这一关配置里有 walk 就用） ---------- */
  const WK = SG.walk || null; let NG = null;
  const navGrid = () => { const k = `${ARENA.x0},${ARENA.x1}`; if (!NG || NG.k2 !== k) { NG = makeGrid(ARENA, COVERS, CFG.coverR); NG.k2 = k } return NG };
  /* 朝哪走：每 0.3 秒或主角走了 1 米以上重算一次路；走不到主角那格就去离主角最近、走得到的那格 */
  function navNext(b, dt) {
    const N = b.nav || (b.nav = { t: 0, px: 1e9, pz: 1e9, pts: null, reach: true });
    N.t -= dt;
    if (N.t <= 0 || !N.pts || hyp(P.x - N.px, P.z - N.pz) > WK.replanMove) {
      const r = findPath(navGrid(), b, P); N.t = WK.replan; N.px = P.x; N.pz = P.z; st.stats.replans = (st.stats.replans || 0) + 1;
      /* 两边绕都差不多远时别来回换边（不然屠夫左右摆）：旧路还走得通、不比新路远 1.5 米以上就接着走旧路，终点换成主角现在的位置 */
      const len = (a, pts) => { let L = 0, q = a; for (const p of pts) { L += hyp(p.x - q.x, p.z - q.z); q = p } return L };
      let keep = false;
      if (N.pts && N.reach && r.reach && N.pts.length > 1) { const old = N.pts.slice(0, -1).filter(p => hyp(p.x - b.x, p.z - b.z) > 0.3); old.push({ x: P.x, z: P.z });
        if (old.length > 1 && len(b, old) < len(b, r.pts) + 1.5) { const nx = nextPoint(NG, b, old); if (nx !== old[old.length - 1] || hyp(nx.x - b.x, nx.z - b.z) > 0.01) { N.pts = old; keep = true } } }
      if (!keep) { N.pts = r.pts; N.reach = r.reach } }
    /* 下一步 = 路上直线看得到的最远那个点；跟上次选的只差一格时接着用上次的（格子边上看得到 / 看不到来回跳，屠夫就左右摆） */
    let nx = nextPoint(NG, b, N.pts); const ci = N.pts.indexOf(nx), pi = N.cur ? N.pts.indexOf(N.cur) : -1;
    if (pi >= 0 && Math.abs(ci - pi) <= 1 && hyp(N.cur.x - b.x, N.cur.z - b.z) > 0.6 && lineFree(NG, b, N.cur)) nx = N.cur;
    N.cur = nx; return { x: nx.x, z: nx.z, end: !N.reach && hyp(nx.x - b.x, nx.z - b.z) < 0.35 && nx === N.pts[N.pts.length - 1] };
  }
  /* 卡住了：想往主角走、2 秒内没近 1 米 → 直线能冲就冲锋；5.6 米内就砸地；都不行就叫小丧尸（从主角那边钻出来）。只把下一招提前 */
  function stuckCheck(b, d, dts) {
    const K = b.stk || (b.stk = { t: 0, d0: d, x0: b.x, z0: b.z }); K.t += dts;
    /* 走近了 1 米、或者自己确实在走（2 秒走了 1 米以上，比如主角在前面跑、屠夫在后面追）都不算卡住 */
    if (d < K.d0 - WK.stuckGain || d < CFG.swingR - 0.4 || hyp(b.x - K.x0, b.z - K.z0) > WK.stuckGain) { K.t = 0; K.d0 = d; K.x0 = b.x; K.z0 = b.z; return null }
    if (K.t < WK.stuck) return null;
    K.t = 0; K.d0 = d; K.x0 = b.x; K.z0 = b.z; const yaw = Math.atan2(P.x - b.x, P.z - b.z);
    st.stats.stuck = (st.stats.stuck || 0) + 1;
    if (segHit(b.x, b.z, P.x, P.z, 0.35) === null && chargeLen(b, yaw) >= Math.min(d, CFG.chargeLen) - 0.6) return 'charge';
    if (d < CFG.slamR) return 'slam';
    if (st.mobs.filter(m => !m.dead).length < 4) return 'summon';
    return 'charge';
  }

  function hurtPlayer(d, src) {
    if (P.dead || P.inv > 0 || P.god || st.over) return 0;   // 设计 61：P.god 只给截图、测试用（不显示、正式版不会设）
    const a = Math.round(d * (1 - Math.min(0.9, hero.dr + (P.heartT > 0 ? 0.3 : 0)))); P.hp -= a; P.hurtT = 0; st.stats.taken += a; E('pdmg', { a, src });
    if (hero.s1four) P.regen10 = 3;
    if (hero.heart && !P.heartUsed && P.hp > 0 && P.hp < P.max * 0.3) { P.heartUsed = true; P.heartT = 5; E('heart') }   // 不眠之心
    if (P.hp <= 0) { P.hp = 0; P.dead = true; end(false) }
    return a;
  }
  function hitEnemy(tg, dmg, crit, kind) {
    if (tg === Bo) { if (Bo.dead) return; Bo.hp -= dmg; st.stats.dmg += dmg; if (hero.bleed) { Bo.bleed = 3; Bo.bleedDps = Math.max(Bo.bleedDps, dmg * 0.1) } if (hero.slow) Bo.slowHit = 1.5;
      E('hit', { who: 'boss', a: Math.round(dmg), crit, kind }); if (Bo.hp <= 0) { Bo.hp = 0; bossDie() } }
    else { if (tg.dead) return; tg.hp -= dmg; E('hit', { who: 'mob', m: tg, a: Math.round(dmg), crit }); if (tg.hp <= 0) { tg.dead = true; tg.deadT = 0; st.stats.mobsKilled++; E('mobDie', { m: tg }) } }
    if (hero.leech) { P.hp = Math.min(P.max, P.hp + dmg * hero.leech) }
  }
  /* 设计 61：屠夫往前扑倒，身子在前面约 4 米：挑一个不压进掩体、崖壁的方向（从现在朝的方向往两边找） */
  function fallYaw(b) {
    const ok = y => { const s = Math.sin(y), c = Math.cos(y); for (let L = 0.5; L <= FALL_LEN; L += 0.5) { const x = b.x + s * L, z = b.z + c * L; if (x < ARENA.x0 + 1 || x > ARENA.x1 - 1 || z < ARENA.z0 + 1 || z > ARENA.z1 - 1 || inCover(x, z, 0.7)) return false } return true };
    for (let k = 0; k <= 12; k++) for (const sg of k ? [1, -1] : [1]) { const y = b.yaw + sg * k * Math.PI / 12; if (ok(y)) return y }
    return b.yaw;
  }
  function bossDie() {
    Bo.dead = true; Bo.cast = null; st.warns.length = 0; Bo.act = 'dead'; if (!TOX) Bo.yaw = fallYaw(Bo); Bo.look = null; setAnim('die');
    for (const m of st.mobs) if (!m.dead) { m.dead = true; m.deadT = 0; E('mobDie', { m }) }
    E('bossDie'); end(true);
  }
  function end(win) { if (st.over) return; st.over = st.t || 0.01; st.win = win; E(win ? 'win' : 'lose') }

  /* ---------- 主角开枪 ---------- */
  /* 设计 64：目标粘一会儿——锁上的目标出了射程，再多 1.5 米或 0.5 秒才放；小丧尸和 BOSS 之间换目标至少隔 0.4 秒。
     返回 { tg（瞄着谁，脸朝它）, shoot（真的在射程里、可以开枪） } */
  const inRange = (t, extra = 0) => !t || (t === Bo ? Bo.dead : t.dead) ? false : t === Bo ? hyp(Bo.x - P.x, Bo.z - P.z) < hero.range + BR + extra : hyp(t.x - P.x, t.z - P.z) < hero.range + extra && (extra > 0 || segHit(P.x, P.z, t.x, t.z) === null);
  function lockTarget(dt) {
    const L = P.lock || (P.lock = { tg: null, out: 0, sw: 9 }); L.sw += dt;
    const cand = targetOf();
    if (L.tg && !inRange(L.tg, 1.5)) L.tg = null;                         // 远出 1.5 米：放
    if (L.tg) { L.out = inRange(L.tg) ? 0 : L.out + dt; if (L.out > 0.5) L.tg = null }   // 出射程 0.5 秒：放
    if (cand && cand !== L.tg && (!L.tg || L.sw >= 0.4)) { L.tg = cand; L.out = 0; L.sw = 0 }
    if (!L.tg && cand) { L.tg = cand; L.sw = 0 }
    return { tg: L.tg, shoot: L.tg && inRange(L.tg) ? L.tg : null };
  }
  function targetOf() {
    const rng = hero.range;
    let best = null, bd = 1e9;
    for (const m of st.mobs) { if (m.dead || m.rise > 0) continue; const d = hyp(m.x - P.x, m.z - P.z); if (d < rng && d < bd && segHit(P.x, P.z, m.x, m.z) === null) { best = m; bd = d } }
    if (best) return best;
    if (!Bo.dead && hyp(Bo.x - P.x, Bo.z - P.z) < rng + BR) return Bo;
    return null;
  }
  function shoot(tg, mult, kind) {
    const tx = tg.x, tz = tg.z, d = hyp(tx - P.x, tz - P.z), bl = segHit(P.x, P.z, tx, tz);
    const isB = tg === Bo, crit = rnd() < hero.crit + (isB ? hero.bossCrit : 0);
    const dmg = hero.dmg * mult * (crit ? hero.cdmg : 1) * (isB ? hero.boss : 1);
    st.stats.shots++;
    if (bl !== null && bl * d < d - (isB ? BR : 0.3)) { E('shot', { tx: P.x + (tx - P.x) * bl, tz: P.z + (tz - P.z) * bl, blocked: true, kind }); return }
    st.shots.push({ tg, dmg, crit, kind, t: d / CFG.bulletSpd }); E('shot', { tx, tz, tg, kind, crit });
  }

  /* ---------- BOSS ---------- */
  /* 冲锋能冲多远：一路到场地边或者掩体前（预警长条就画这么长） */
  function chargeLen(b, yaw) {
    const s = Math.sin(yaw), c = Math.cos(yaw);
    for (let L = 0.5; L <= CFG.chargeLen; L += 0.25) { const x = b.x + s * L, z = b.z + c * L; if (x < ARENA.x0 + 0.8 || x > ARENA.x1 - 0.8 || z < ARENA.z0 + 0.8 || z > ARENA.z1 - 0.8 || inCover(x, z, CFG.coverR * 0.7)) return L }
    return CFG.chargeLen;
  }
  function startCast(k) {
    const b = Bo, dx = P.x - b.x, dz = P.z - b.z; b.yaw = Math.atan2(dx, dz);
    const id = st.nid++; let w = null, dur;
    st.stats.casts[k] = (st.stats.casts[k] || 0) + 1;
    if (k === 'swing') { dur = wdur(0.6); w = { id, type: 'fan', x: b.x, z: b.z, yaw: b.yaw, r: CFG.swingR, r0: CFG.bossR * 0.8, a: CFG.swingA }; setAnim('swing', BUTCHER_ANIM.swing.hit / dur) }
    else if (k === 'charge') { dur = wdur(warnT);
      const len = chargeLen(b, b.yaw);
      w = { id, type: 'line', x: b.x, z: b.z, yaw: b.yaw, len: Math.max(2, len), w: CFG.chargeW }; setAnim('charge_start', BUTCHER_ANIM.charge_start.hit / dur) }
    else if (k === 'slam') { dur = wdur(warnT); w = { id, type: 'circle', x: b.x, z: b.z, r: CFG.slamR, ult: true }; setAnim('slam', BUTCHER_ANIM.slam.hit / dur) }
    else if (k === 'summon') { dur = wdur(warnT); const pts = [];
      for (let i = 0; i < 4; i++) { let x = 0, z = 0; for (let t = 0; t < 30; t++) { const a = rnd() * Math.PI * 2, r = 3 + rnd() * 3.5; x = clamp(P.x + Math.sin(a) * r, ARENA.x0 + 1, ARENA.x1 - 1); z = clamp(P.z + Math.cos(a) * r, ARENA.z0 + 1, ARENA.z1 - 1); if (!inCover(x, z, 0.8) && pts.every(p => hyp(p.x - x, p.z - z) > 2.2)) break } pts.push({ x, z }) }
      w = { id, type: 'multi', pts, r: CFG.summonR, x: P.x, z: P.z }; b.summonT = CFG.summonCd; setAnim('roar', 1) }
    w.t = 0; w.dur = dur; w.k = k; w.ult = k === 'slam'; st.warns.push(w);
    b.cast = { k, w, t: 0, dur }; b.interruptible = k !== 'slam'; b.act = 'cast';
    E('cast', { k, dur, ult: w.ult, name: { swing: '挥刀', charge: '冲锋', slam: '砸地', summon: '叫小丧尸' }[k] });
  }
  function release() {
    const b = Bo, c = b.cast, w = c.w; st.warns.splice(st.warns.indexOf(w), 1); b.cast = null;
    E('release', { k: c.k, w });
    if (c.k === 'swing') { if (inWarn(w, P.x, P.z)) { hurtPlayer(bossDmg(false) * CFG.swingK, 'swing'); E('knock', { x: Math.sin(w.yaw) * 4, z: Math.cos(w.yaw) * 4 }) } b.act = 'recover'; b.at = 0.75; b.swingCd = CFG.swingCd }
    else if (c.k === 'slam') { if (inWarn(w, P.x, P.z)) { hurtPlayer(bossDmg(true), 'slam'); const d = hyp(P.x - b.x, P.z - b.z) || 1; E('knock', { x: (P.x - b.x) / d * 7, z: (P.z - b.z) / d * 7 }) } b.act = 'recover'; b.at = 1.4; b.swingCd = 1 }
    else if (c.k === 'summon') { for (const p of w.pts) { if (hyp(P.x - p.x, P.z - p.z) < w.r + 0.35) hurtPlayer(bossDmg(false) * CFG.burstK, 'burst');
        const m = { id: st.nid++, x: p.x, z: p.z, yaw: Math.atan2(P.x - p.x, P.z - p.z), hp: B.hp * CFG.mobHp, max: B.hp * CFG.mobHp, rise: 0.9, stun: 0, cd: 0.5, dead: false }; st.mobs.push(m); E('mobSpawn', { m }) }
      b.act = 'recover'; b.at = 0.5 }
    else if (c.k === 'charge') { b.act = 'dash'; b.dash = { yaw: w.yaw, left: w.len, hit: false, x0: b.x, z0: b.z }; setAnim('run', CFG.chargeSpd / (BUTCHER_ANIM.run.speed * BOSS_SCALE)) }
  }
  function bossStep(dt) {
    if (TOX) { toxStep(dt); return }
    const b = Bo; if (b.dead) return;
    const tf = b.slow > 0 ? 0.5 : 1; if (b.slow > 0) b.slow -= dt;
    if (b.bleed > 0) { b.bleed -= dt; b.hp -= b.bleedDps * dt; st.stats.dmg += b.bleedDps * dt; if (b.hp <= 0) { b.hp = 0; bossDie(); return } } else b.bleedDps = 0;
    if (b.slowHit > 0) b.slowHit -= dt;
    const dts = dt * tf;
    b.swingCd -= dts; b.skillT -= dts; b.summonT -= dts;
    if (!st.rage && st.t >= FB.time) { st.rage = true; E('rage'); if (b.act !== 'dash' && !b.cast) { b.act = 'rageAnim'; b.at = BUTCHER_ANIM.enrage.T; setAnim('enrage') } }
    const dx = P.x - b.x, dz = P.z - b.z, d = hyp(dx, dz);
    if (b.act === 'wait') { if (d < 15 || st.t > 2.5) { b.act = 'rageAnim'; b.at = 1.6; setAnim('roar') } return }
    if (b.act === 'stun' || b.act === 'recover' || b.act === 'rageAnim') { b.at -= dts; if (b.at <= 0) { b.act = 'chase'; setAnim('walk', 1) } return }
    if (b.act === 'cast') { const c = b.cast; c.t += dts; c.w.t = c.t; if (c.k === 'swing' && c.t < c.dur * 0.6) { b.yaw += clamp(angD(Math.atan2(dx, dz), b.yaw), -2 * dts, 2 * dts); c.w.yaw = b.yaw } if (c.t >= c.dur) release(); return }
    if (b.act === 'dash') {
      const D = b.dash, step = Math.min(D.left, CFG.chargeSpd * dts), s = Math.sin(D.yaw), c = Math.cos(D.yaw);
      const nx = b.x + s * step, nz = b.z + c * step;
      if (inCover(nx, nz, CFG.coverR * 0.7)) { E('bump', { x: nx, z: nz }); E('drag', { x0: D.x0, z0: D.z0, x1: b.x, z1: b.z, yaw: D.yaw }); b.act = 'stun'; b.at = 1.4; setAnim('hit', 0.6); return }
      b.x = nx; b.z = nz; D.left -= step;
      if (!D.hit && hyp(P.x - b.x, P.z - b.z) < CFG.chargeW / 2 + 0.35) {   /* 设计 61：冲锋撞人按预警长条的宽度算（预警大小不变），不跟着身子变大 */ D.hit = true; if (hurtPlayer(bossDmg(false), 'charge') || P.inv <= 0) E('knock', { x: s * 6 + Math.sign((P.x - b.x) * c - (P.z - b.z) * s || 1) * c * 4, z: c * 6 - Math.sign((P.x - b.x) * c - (P.z - b.z) * s || 1) * s * 4, star: 1 }) }
      if (D.left <= 0.01) { E('drag', { x0: D.x0, z0: D.z0, x1: b.x, z1: b.z, yaw: D.yaw }); b.act = 'recover'; b.at = 0.7; setAnim('idle') }
      return;
    }
    /* chase：走过去；够近就挥刀；到时间放技能。设计 83：找路换成格子 A*，只朝路上下一个点转身 */
    if (WK) b.direct = segHit(b.x, b.z, P.x, P.z, CFG.coverR * (b.direct ? 0.7 : 1.0)) === null;   /* 设计 83：中间没掩体就直接朝主角走（进出差一点，不在两种走法之间来回跳） */
    const lim = ARENA.x1 - CFG.coverR - CFG.edgeGap;   /* 设计 64：空地上追人时离场地两边留 1.5 米（设计 83：改成直接把要去的点收进来，不再每帧把位置往回拉） */
    const far = WK ? (b.near ? d > 2.75 : d > 2.4) : d > 2.4; b.near = !far;   /* 设计 83：停下 / 起步差 0.35 米，不在 2.4 米上来回走走停停 */
    const go = far ? (WK ? (b.direct ? { x: clamp(P.x, -lim, lim), z: P.z } : navNext(b, dts)) : detour(b, P, CFG.coverR)) : P;
    const wantYaw = Math.atan2(go.x - b.x, go.z - b.z), turnD = angD(wantYaw, b.yaw);
    if (!go.end && !(WK && d <= 2.4 && Math.abs(turnD) < 0.15)) b.yaw += clamp(turnD, -3 * dts, 3 * dts);   /* 设计 83：贴着主角时差 9° 以内不转（主角在身边蹭来蹭去时不跟着抖） */
    if (WK && b.skillT > 0 && d > CFG.swingR - 0.4) { const k = stuckCheck(b, d, dts); if (k) { b.slamWait = 0; b.chargeWait = 0; b.skillT = CFG.skillGap; if (k === 'summon') b.summonT = CFG.summonCd; E('stuckSwitch', { k }); startCast(k); return } }
    if (b.skillT <= 0) {
      let k = CFG.order[b.oi % CFG.order.length];
      if (k === 'summon' && (b.summonT > 0 || st.mobs.filter(m => !m.dead).length >= 2)) k = 'charge';
      if (k === 'slam' && d > CFG.slamR + 1) { b.slamWait = (b.slamWait || 0) + dts; if (b.slamWait < 4) k = null; else k = 'charge' }   // 离得远砸不到：先走过去，4 秒还够不着就冲锋
      /* 56b：冲锋前面几米就是掩体（冲不起来、预警只有一小块）：先绕着走，3 秒还不行就换别的招 */
      if (k === 'charge' && chargeLen(b, Math.atan2(dx, dz)) < Math.min(7, d + 1)) { b.chargeWait = (b.chargeWait || 0) + dts; if (b.chargeWait < 3) k = null; else k = d < CFG.slamR + 1 ? 'slam' : b.summonT <= 0 ? 'summon' : 'charge' }
      if (k) { b.slamWait = 0; b.chargeWait = 0; b.oi++; b.skillT = CFG.skillGap; startCast(k); return }
    }
    if (d < CFG.swingR - 0.4 && b.swingCd <= 0) { startCast('swing'); return }
    if (far && !go.end) { const face = WK ? Math.max(0.25, Math.cos(Math.min(Math.abs(turnD), Math.PI / 2))) : 1;   /* 设计 83：转身的时候走慢一点，不擦着掩体打滑 */
      const sp = CFG.walk * (b.slowHit > 0 ? 1 - hero.slow : 1) * (st.rage ? 1.25 : 1) * dts * face; b.x += Math.sin(b.yaw) * sp; b.z += Math.cos(b.yaw) * sp; push(b, CFG.coverR);
      /* 设计 64：追人时慢慢让开场地两边，主角能从他和崖壁之间过去。设计 83：只在空地上让（屠夫和主角之间没有掩体）；路线要贴边走时可以走到离墙 coverR */
      if (!WK) { if (Math.abs(b.x) > lim) b.x -= Math.sign(b.x) * Math.min(Math.abs(b.x) - lim, sp) }
      if (b.anim !== 'walk') setAnim('walk', 1); b.ts = CFG.walk / (BUTCHER_ANIM.walk.speed * BOSS_SCALE) }
    else if (b.anim !== 'idle') setAnim('idle');
    if (go.end && b.anim !== 'idle') setAnim('idle');
  }

  /* ---------- 设计 81：毒囊（第 2 关） ---------- */
  const TX = TOX_CFG, mouth = () => ({ x: Bo.x, z: ARENA.z0 + 0.2 });
  const sideX = sd => { const hw = (ARENA.x1 - ARENA.x0) / 2; return sd > 0 ? ARENA.x1 - hw / 2 : ARENA.x0 + hw / 2 };
  function toxCast(k) {
    const b = Bo, id = st.nid++; let dur, w = null; const c = { k, t: 0, w: { ult: false } };
    st.stats.casts[k] = (st.stats.casts[k] || 0) + 1;
    if (k === 'spit') { const m = mouth(), yaw = Math.atan2(P.x - m.x, P.z - m.z); dur = wdur(TX.spitWarn);
      w = { id, type: 'fan', x: m.x, z: m.z, yaw, r: TX.spitR, r0: 0.6, a: TX.spitA }; setAnim('spit', TOX_ANIM.spit.hit / dur); b.look = { x: P.x, z: P.z } }
    else if (k === 'bolt') { c.n = st.half ? TX.bolts2 : TX.bolts; c.spawned = 0; c.wd = wdur(TX.boltWarn); dur = (c.n - 1) * TX.boltGap + c.wd - TX.boltFly + 0.25;
      c.cancel = () => { c.n = c.spawned }; setAnim('bolt_wind'); b.look = { x: P.x, z: P.z } }
    else if (k === 'burst') { dur = wdur(TOX_ANIM.burst.hit); setAnim('burst', 1); b.look = null }
    else if (k === 'slam') { const sd = b.side = -(b.side || -1); dur = wdur(warnT);
      w = { id, type: 'line', x: clamp(sd * TX.slamX, ARENA.x0 + TX.slamW / 2, ARENA.x1 - TX.slamW / 2), z: ARENA.z0 - 0.3, yaw: 0, len: TX.slamL + 0.3, w: TX.slamW }; c.side = sd;
      setAnim(sd > 0 ? 'slam_l' : 'slam_r', TOX_ANIM.slam_l.hit / dur); b.look = { x: w.x, z: ARENA.z0 + TX.slamL / 2 } }
    else if (k === 'surge') { const sd = Math.abs(P.x) > 0.3 ? Math.sign(P.x) : (rnd() < 0.5 ? -1 : 1); dur = wdur(TX.surgeWarn); const hw = (ARENA.x1 - ARENA.x0) / 2;
      w = { id, type: 'line', x: sideX(sd), z: ARENA.z1 + 0.5, yaw: Math.PI, len: ARENA.z1 - ARENA.z0 + 1, w: hw + 0.3, ult: true }; c.side = sd; c.w = w;
      setAnim('surge', TOX_ANIM.surge.hit / dur); b.look = null }
    if (w) { w.t = 0; w.dur = dur; w.k = k; w.ult = !!w.ult; st.warns.push(w); c.w = w }
    c.dur = dur; b.cast = c; b.interruptible = k !== 'surge'; b.act = 'cast';
    E('cast', { k, dur, ult: k === 'surge', name: TOX_NAME[k], side: c.side });
  }
  function toxRelease() {
    const b = Bo, c = b.cast; b.cast = null; const w = c.w;
    if (w && st.warns.includes(w)) st.warns.splice(st.warns.indexOf(w), 1);
    if (c.k === 'spit') { E('release', { k: 'spit', w }); if (inWarn(w, P.x, P.z)) hurtPlayer(bossDmg(false) * TX.spitK, 'spit'); b.act = 'recover'; b.at = 0.45 }
    else if (c.k === 'bolt') { b.act = 'recover'; b.at = 0.3 }
    else if (c.k === 'burst') {
      const n = TX.pusN[0] + (rnd() < 0.5 ? 1 : 0), pts = [];
      for (let i = 0; i < n; i++) { let x = 0, z = 0; for (let t = 0; t < 40; t++) { const a = rnd() * Math.PI * 2, r = 2.5 + rnd() * 5; x = clamp(P.x + Math.sin(a) * r, ARENA.x0 + 1.2, ARENA.x1 - 1.2); z = clamp(P.z + Math.cos(a) * r, ARENA.z0 + 1.2, ARENA.z1 - 1.5); if (!inCover(x, z, 1.0) && pts.every(p => hyp(p.x - x, p.z - z) > 3)) break } pts.push({ x, z }) }
      const fill = TX.pusFill * (st.rage ? FB.rage.warn : 1);
      for (const p of pts) { const pw = { id: st.nid++, type: 'circle', x: p.x, z: p.z, r: TX.pusR, t: -TX.pusFly, dur: fill, k: 'pus' }; st.warns.push(pw);
        const m = { id: st.nid++, pus: true, x: p.x, z: p.z, yaw: 0, hp: B.hp * TX.pusHp, max: B.hp * TX.pusHp, rise: TX.pusFly, stun: 0, cd: 0, dead: false, w: pw }; st.mobs.push(m); E('mobSpawn', { m }) }
      E('release', { k: 'burst', pts }); b.act = 'recover'; b.at = 0.7 }
    else if (c.k === 'slam') { E('release', { k: 'slam', w, side: c.side }); if (inWarn(w, P.x, P.z)) { hurtPlayer(bossDmg(false) * TX.slamK, 'slam'); E('knock', { x: 0, z: 7 }) } b.act = 'recover'; b.at = 0.9 }
    else if (c.k === 'surge') { const z = { id: st.nid++, side: c.side, x0: c.side > 0 ? 0 : -50, x1: c.side > 0 ? 50 : 0, t: 0, life: TX.surgeLife, acc: 0 };
      st.zones.push(z); E('release', { k: 'surge', w, side: c.side }); if (inZone(z)) hurtPlayer(bossDmg(true), 'surge'); b.act = 'recover'; b.at = 0.8 }
  }
  const inZone = z => P.x > z.x0 - 0.3 && P.x < z.x1 + 0.3;
  function toxHazards(dt) {
    /* 毒弹：预警到点前 0.6 秒从嘴里吐出去，填满落地 → 毒池 */
    for (let i = st.warns.length - 1; i >= 0; i--) { const w = st.warns[i]; if (w.k !== 'bolt') continue;
      if (!w.launched && w.t >= w.dur - TX.boltFly) { w.launched = true; E('boltLaunch', { x: w.x, z: w.z, fly: TX.boltFly, id: w.id }); if (Bo.cast && Bo.cast.k === 'bolt') { setAnim('bolt_spit'); Bo.look = { x: w.x, z: w.z } } }
      if (w.t >= w.dur) { st.warns.splice(i, 1); E('boltLand', { x: w.x, z: w.z });
        if (inWarn(w, P.x, P.z)) hurtPlayer(bossDmg(false) * TX.boltK, 'bolt');
        st.pools.push({ id: st.nid++, type: 'circle', x: w.x, z: w.z, r: TX.poolR, t: 0, life: st.half ? TX.poolLife2 : TX.poolLife });
        while (st.pools.length > TX.poolMax) { const o = st.pools.shift(); E('poolGone', { id: o.id }) } } }
    /* 脓包：圈填满就炸；先被打掉就不炸 */
    for (const m of st.mobs) { if (!m.pus) continue;
      if (m.rise > 0) { m.rise -= dt; continue }
      if (m.dead && !m.gone) { m.gone = true; const i = st.warns.indexOf(m.w); if (i >= 0) st.warns.splice(i, 1); if (!m.boom) E('pusKill', { x: m.x, z: m.z }) }
      if (m.dead) continue;
      if (m.w.t >= m.w.dur) { m.dead = true; m.boom = true; m.gone = true; m.deadT = 0; const i = st.warns.indexOf(m.w); if (i >= 0) st.warns.splice(i, 1);
        E('pusBoom', { x: m.x, z: m.z, r: TX.pusR }); if (hyp(P.x - m.x, P.z - m.z) < TX.pusR + 0.35) hurtPlayer(bossDmg(false) * TX.pusK, 'pus') } }
    /* 毒池：站在里面每 0.5 秒扣一次、减速 */
    let inPool = false;
    for (let i = st.pools.length - 1; i >= 0; i--) { const p = st.pools[i]; p.t += dt; if (p.t >= p.life) { st.pools.splice(i, 1); E('poolGone', { id: p.id }); continue } if (hyp(P.x - p.x, P.z - p.z) < p.r + 0.2) inPool = true }
    st.moveK = inPool && !P.roll ? 1 - TX.poolSlow : 1;
    if (inPool) { P.poolAcc = (P.poolAcc || 0) + dt; if (P.poolAcc >= 0.5) { P.poolAcc -= 0.5; hurtPlayer(bossDmg(false) * TX.poolK * 0.5, 'pool') } } else P.poolAcc = 0.25;
    /* 毒雾盖住半边：之后还在里面每 0.5 秒扣一次 */
    for (let i = st.zones.length - 1; i >= 0; i--) { const z = st.zones[i]; z.t += dt; if (z.t >= z.life) { st.zones.splice(i, 1); E('zoneGone', { id: z.id, side: z.side }); continue }
      if (inZone(z)) { z.acc += dt; if (z.acc >= 0.5) { z.acc -= 0.5; hurtPlayer(bossDmg(true) * TX.surgeK * 0.5, 'surgeDot') } } else z.acc = 0 }
    st.hazards = [...st.pools, ...st.zones.map(z => ({ type: 'line', x: z.side > 0 ? ARENA.x1 / 2 + 0.5 : ARENA.x0 / 2 - 0.5, z: ARENA.z1 + 1, yaw: Math.PI, len: ARENA.z1 - ARENA.z0 + 2, w: (ARENA.x1 - ARENA.x0) / 2 + 1.2 }))];
  }
  function toxStep(dt) {
    const b = Bo; toxHazards(dt); if (b.dead) return;
    const tf = b.slow > 0 ? 0.5 : 1; if (b.slow > 0) b.slow -= dt;
    if (b.bleed > 0) { b.bleed -= dt; b.hp -= b.bleedDps * dt; st.stats.dmg += b.bleedDps * dt; if (b.hp <= 0) { b.hp = 0; bossDie(); return } } else b.bleedDps = 0;
    if (b.slowHit > 0) b.slowHit -= dt;
    const dts = dt * tf; b.spitCd = (b.spitCd ?? 2.5) - dts;
    if (!st.rage && st.t >= FB.time) { st.rage = true; E('rage'); if (!b.cast) { b.act = 'rageAnim'; b.at = TOX_ANIM.enrage.T; b.look = null; setAnim('enrage') } }
    /* 半血以后：毒弹 5 个、毒池留 10 秒；每 25 秒两边毒雾往里收 0.6 米（最多 2 次），收之前 3 秒崖边亮红线 */
    if (!st.half && b.hp < b.max * 0.5) { st.half = true; st.shrinkT = TX.shrinkEvery; E('half') }
    if (st.half && st.shrink < TX.shrinkMax) { st.shrinkT -= dt;
      if (st.shrinkT <= TX.shrinkWarn && !st.shrinkWarned) { st.shrinkWarned = true; E('shrinkWarn', { n: st.shrink + 1 }) }
      if (st.shrinkT <= 0) { st.shrink++; ARENA.x0 += TX.shrinkStep; ARENA.x1 -= TX.shrinkStep; st.shrinkT = TX.shrinkEvery; st.shrinkWarned = false; E('shrink', { n: st.shrink, x0: ARENA.x0, x1: ARENA.x1 }); push(P, 0.42) } }
    if (b.act === 'stun' || b.act === 'recover' || b.act === 'rageAnim') { b.at -= dts; if (b.at <= 0) { if (b.act !== 'rageAnim') b.calm = st.rage ? TX.calmRage : TX.calm; b.act = 'idle'; setAnim('idle') } else return }   // 设计 92：技能（硬直、被打断）结束开始算安静时间
    if (b.act === 'cast') { const c = b.cast; c.t += dts;
      if (c.k === 'bolt') { while (c.spawned < c.n && c.t >= c.spawned * TX.boltGap) { const w = { id: st.nid++, type: 'circle', x: clamp(P.x, ARENA.x0 + 0.5, ARENA.x1 - 0.5), z: clamp(P.z, ARENA.z0 + 0.5, ARENA.z1 - 0.5), r: TX.boltR, t: 0, dur: c.wd, k: 'bolt' }; st.warns.push(w); c.spawned++; E('boltWarn', { x: w.x, z: w.z }) }
        c.w.t = c.t }
      else if (c.w && c.w !== null && c.k !== 'burst') c.w.t = c.t;
      if (c.t >= c.dur || (c.k === 'bolt' && c.spawned >= c.n && !st.warns.some(w => w.k === 'bolt' && !w.launched))) toxRelease();
      return }
    b.look = 'p'; if (b.anim !== 'idle') setAnim('idle');
    b.skillT -= dts;   /* 设计 92：大技能的间隔只在毒囊闲着（含安静时间）的时候走，放技能、硬直的时候不走：不然安静 2.5 秒以后永远插不进喷吐 */
    if (b.calm > 0) { b.calm -= dts; return }   /* 设计 92：安静时间没过完：看着玩家，不放任何技能（大技能到了也先等） */
    if (b.skillT <= 0) { const ord = st.rage ? TX.orderRage : TX.order, k = ord[b.oi % ord.length]; b.oi++; b.skillT = st.rage ? TX.gapRage : TX.gap; toxCast(k); return }
    const m = mouth();
    if (b.spitCd <= 0 && hyp(P.x - m.x, P.z - m.z) < TX.spitRange && b.skillT > wdur(TX.spitWarn) + 0.45 + (st.rage ? TX.calmRage : TX.calm)) {   /* 设计 92：喷吐读条 + 硬直 + 安静时间之内要轮到大技能，就不插喷吐 */
      b.spitCd = TX.spitCd[0] + rnd() * (TX.spitCd[1] - TX.spitCd[0]); toxCast('spit') }
  }
  /* ---------- 小丧尸 ---------- */
  function mobStep(dt) {
    for (const m of st.mobs) {
      if (m.dead) { m.deadT += dt; continue }
      if (m.pus) continue;   // 设计 81：脓包不走（毒囊那边管）
      if (m.rise > 0) { m.rise -= dt; continue }
      if (m.stun > 0) { m.stun -= dt; continue }
      const dx = P.x - m.x, dz = P.z - m.z, d = hyp(dx, dz); m.yaw = Math.atan2(dx, dz); m.cd -= dt;
      if (m.wind > 0) { m.wind -= dt; if (m.wind <= 0) { m.cd = 0.9; if (d < 1.35) hurtPlayer(P.max * CFG.mobHit * (st.rage ? FB.rage.dmg : 1), 'mob') } continue }   // 抬手 0.45 秒，走开就打空
      if (d > 0.95) { const sp = CFG.mobSpd * dt; m.x += dx / d * sp; m.z += dz / d * sp; push(m, CFG.mobR) }
      else if (m.cd <= 0) { m.wind = 0.45; E('mobAtk', { m }) }
    }
    st.mobs = st.mobs.filter(m => !m.dead || m.deadT < 3);
  }

  /* ---------- 每帧 ---------- */
  function step(dt, inp = {}) {
    st.ev = st.pend || []; st.pend = null;
    if (st.over) { st.t += 0; st.after = (st.after || 0) + dt; mobStep(dt);
      /* 设计 79：打赢以后主角照样能走、能转身（走去开宝箱），不能开枪、放技能，也不会受伤（hurtPlayer 里 st.over 就不扣血）；打输照旧不动 */
      if (st.win && !P.dead) { const mx = inp.mx || 0, mz = inp.mz || 0, ml = hyp(mx, mz), sp = hero.speed * hero.spd * dt;
        P.roll = null; P.kb = null; P.firing = false; P.target = null; P.burst = null; P.focus = 0; P.aimYaw = null;
        if (ml > 0.1) { P.x += mx * sp; P.z += mz * sp; push(P, 0.42); let d = Math.atan2(mx, mz) - P.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); const t = CFG.turn * dt; P.yaw += Math.max(-t, Math.min(t, d)) } }
      return st }
    const pre = !st.locked;   /* 设计 95：还没进战斗区：只能走路、翻滚，不计时，BOSS 不动，打不到 BOSS */
    st.clk += dt; if (!pre) st.t += dt;
    if (!pre && st.lockZ != null && ARENA.z1 > st.lockZ) ARENA.z1 = Math.max(st.lockZ, ARENA.z1 - 2.5 * dt);
    if (hyp(inp.mx || 0, inp.mz || 0) >= 0.2) st.lastMv = { x: inp.mx, z: inp.mz, t: st.clk };   /* 设计 79：最近一次推摇杆的方向（翻滚用） */
    for (const k of ['focus', 'roll', 'stun', 'nade']) if (P.cd[k] > 0) P.cd[k] -= dt; if (P.heartT > 0) P.heartT -= dt;
    if (P.cd.roll <= 0 && P.charges < SKILLS.roll.charges(sk('roll'))) { P.charges++; if (P.charges < SKILLS.roll.charges(sk('roll'))) P.cd.roll = cdOf('roll') }
    P.inv -= dt; P.hurtT += dt;
    /* 技能 */
    const s = inp.skill;
    if (s === 'roll' && P.charges > 0 && !P.roll) {
      /* 设计 79：方向 = 这一帧的摇杆；没推就用最近 0.3 秒里最后一次推的方向（iPhone 两根手指时摇杆可能被系统清零一下）；都没有才往面朝的反方向 */
      let ax = inp.mx || 0, az = inp.mz || 0, src = 'joy';
      if (hyp(ax, az) < 0.2) { if (st.lastMv && st.clk - st.lastMv.t <= 0.3 + 1e-6) { ax = st.lastMv.x; az = st.lastMv.z; src = 'recent' } else { ax = -Math.sin(P.yaw); az = -Math.cos(P.yaw); src = 'back' } }
      const l = hyp(ax, az); ax /= l; az /= l; st.lastRoll = { ax, az, src, t: st.t, age: st.lastMv ? +(st.clk - st.lastMv.t).toFixed(2) : null };
      P.roll = { ax, az, t: 0 }; P.inv = SKILLS.roll.inv; P.charges--; if (P.cd.roll <= 0) P.cd.roll = cdOf('roll'); P.yaw = Math.atan2(ax, az); E('roll', { ax, az });
    }
    if (s === 'focus' && !pre && P.cd.focus <= 0 && !Bo.dead && hyp(Bo.x - P.x, Bo.z - P.z) < hero.range + 4) { P.focus = SKILLS.focus.shots; P.focusT = 0; P.cd.focus = cdOf('focus'); E('focus') }
    if (s === 'stun' && !pre && P.cd.stun <= 0 && !Bo.dead && hyp(Bo.x - P.x, Bo.z - P.z) < hero.range + 4) {
      P.cd.stun = cdOf('stun'); const dur = SKILLS.stun.stun(sk('stun'));
      if (Bo.cast && Bo.interruptible) { if (Bo.cast.cancel) Bo.cast.cancel(); else st.warns.splice(st.warns.indexOf(Bo.cast.w), 1); E('interrupt', { k: Bo.cast.k }); Bo.cast = null; Bo.act = 'stun'; Bo.at = dur; Bo.look = null; setAnim('hit', 0.35); st.stats.interrupts++ }
      else { Bo.slow = 2; E('slowed') }
      for (const m of st.mobs) if (!m.dead && hyp(m.x - Bo.x, m.z - Bo.z) < 7) m.stun = 3;
      E('stunShot', { x: Bo.x, z: Bo.z });
    }
    /* 设计 59：手雷也是按键扔（自动瞄小丧尸最多的地方，没有小丧尸就扔 BOSS） */
    if (s === 'nade' && !pre && P.cd.nade <= 0) {
      let tx = null, tz = null, best = 0;
      for (const m of st.mobs) { if (m.dead || m.rise > 0 || hyp(m.x - P.x, m.z - P.z) > hero.range + 2) continue; const c = st.mobs.filter(o => !o.dead && hyp(o.x - m.x, o.z - m.z) < hero.nadeR).length; if (c > best) { best = c; tx = m.x; tz = m.z } }
      if (tx === null && !Bo.dead && hyp(Bo.x - P.x, Bo.z - P.z) < hero.range + 3) { tx = Bo.x; tz = Bo.z }
      if (tx !== null) { P.cd.nade = cdOf('nade'); st.nades.push({ x0: P.x, z0: P.z, x: tx, z: tz, t: 0, dur: 0.55 }); E('nadeThrow', { x0: P.x, z0: P.z, x: tx, z: tz, dur: 0.55 }) }
      else E('noTarget');
    }
    for (const nd of st.nades) { nd.t += dt; if (nd.t >= nd.dur && !nd.done) { nd.done = true; E('boom', { x: nd.x, z: nd.z, r: hero.nadeR });
      if (!Bo.dead && hyp(Bo.x - nd.x, Bo.z - nd.z) < hero.nadeR + BR) hitEnemy(Bo, hero.nadeDmg * hero.boss, false, 'nade');
      for (const m of st.mobs) if (!m.dead && m.rise <= 0 && hyp(m.x - nd.x, m.z - nd.z) < hero.nadeR + 0.3) hitEnemy(m, hero.nadeDmg, false, 'nade') } }
    st.nades = st.nades.filter(nd => !nd.done);
    /* 走路 / 翻滚 */
    const px0 = P.x, pz0 = P.z;
    if (P.roll) { const R = P.roll, sp = SKILLS.roll.dist / 0.32 * dt; P.x += R.ax * sp; P.z += R.az * sp; R.t += dt; if (R.t >= 0.32) P.roll = null }
    else { const mx = inp.mx || 0, mz = inp.mz || 0, sp = hero.speed * hero.spd * st.moveK * dt; P.x += mx * sp; P.z += mz * sp; if (P.kb) { P.x += P.kb.x * dt; P.z += P.kb.z * dt } }
    if (P.kb) { P.kb.x *= Math.max(0, 1 - dt * 6); P.kb.z *= Math.max(0, 1 - dt * 6); if (hyp(P.kb.x, P.kb.z) < 0.1) P.kb = null }
    push(P, 0.42);
    /* 设计 64：主角跟屠夫用脚的大小碰（1.15，跟屠夫碰掩体一样，不用身体的 1.7）；挨子弹、预警照旧用身体 */
    const bossPush = () => { if (Bo.dead) return null; const dx = P.x - Bo.x, dz = P.z - Bo.z, d = hyp(dx, dz), r = CFG.coverR + 0.42; if (d < r && d > 1e-4) { P.x = Bo.x + dx / d * r; P.z = Bo.z + dz / d * r; return { x: dx / d, z: dz / d } } return null };
    const bn = bossPush();
    /* 顶上屠夫、掩体（迎面、几乎走不动）时沿它的边往摇杆偏的那边滑（正对着就往场地中间那边滑），不原地顶住；顶着两边崖壁不滑（那是自己往墙上走） */
    if (!P.roll && !P.kb) { const mx = inp.mx || 0, mz = inp.mz || 0, ml = hyp(mx, mz), sp = hero.speed * hero.spd * st.moveK * dt;
      const headOn = bn && ml > 0.2 && (mx * bn.x + mz * bn.z) / ml < -0.3;   // 顶着屠夫：法线就是从屠夫中心往外
      if (ml > 0.2 && (headOn || hyp(P.x - px0, P.z - pz0) < sp * ml * 0.5)) {
        let nx = headOn ? bn.x : P.x - (px0 + mx * sp), nz = headOn ? bn.z : P.z - (pz0 + mz * sp); const nl = hyp(nx, nz);
        const wall = Math.abs(P.x) >= ARENA.x1 - 0.43 || P.z <= ARENA.z0 + 0.43 || P.z >= ARENA.z1 - 0.43;
        if (nl > 1e-4 && !wall) { nx /= nl; nz /= nl; let tx = -nz, tz = nx; const side = (mx * tx + mz * tz) / ml;
          if (Math.abs(side) < 0.15) { const keep = st.clk - (P.slideAt || -9) < 0.3 ? P.slideS : 0, want = keep || (Math.abs(P.x + tx) > Math.abs(P.x - tx) ? -1 : 1); if (want < 0) { tx = -tx; tz = -tz } }   // 正对着：接着刚才滑的方向（不来回），刚开始滑就往场地中间那边
          else if (side < 0) { tx = -tx; tz = -tz }
          P.slideS = Math.abs(side) < 0.15 ? (P.slideS && st.clk - (P.slideAt || -9) < 0.3 ? P.slideS : (tx === -nz ? 1 : -1)) : (side > 0 ? 1 : -1); P.slideAt = st.clk;
          P.x += tx * sp * 0.85; P.z += tz * sp * 0.85; push(P, 0.42); bossPush() } } }
    if (pre) {   /* 设计 95：走进战斗区（离线 0.6 米）就封死身后：南边界挪到封线，开始计时 */
      if (P.z <= st.lockZ) { st.locked = true; ARENA.z1 = Math.max(st.lockZ, P.z + 0.43); E('lock', { z: st.lockZ }) }   // 过线：南边界先停在主角身后，下面几帧往北收到封线，把主角慢慢推进区域（不会卡在墙里）
      P.firing = false; P.target = null; P.aimYaw = null; const mx = inp.mx || 0, mz = inp.mz || 0;
      if (hyp(mx, mz) > 0.1 && !P.roll) { let d = Math.atan2(mx, mz) - P.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); const t = CFG.turn * dt; P.yaw += Math.max(-t, Math.min(t, d)) }
      if (inp.fire) { P.farT = (P.farT || 0) - dt; if (P.farT <= 0) { P.farT = 0.5; E('far') } }
      return st }
    /* 开枪：按住攻击才开；有小怪先打小怪 */
    /* 设计 64：按着攻击就一直朝目标（目标刚出射程也朝最后那个方向），松开才转回走路方向；转身每秒最多 720° */
    P.shotT -= dt; P.firing = false; const lk = !P.roll && inp.fire ? lockTarget(dt) : (P.lock && (P.lock.tg = null), { tg: null, shoot: null }), tg = lk.shoot; P.target = tg;
    if (lk.tg) P.aimYaw = Math.atan2(lk.tg.x - P.x, lk.tg.z - P.z);
    let want = null;
    if (inp.fire && !P.roll && P.aimYaw != null) want = P.aimYaw;
    else { P.aimYaw = null; if (hyp(inp.mx || 0, inp.mz || 0) > 0.1 && !P.roll) want = Math.atan2(inp.mx, inp.mz) }
    if (want != null) { let d = want - P.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); const mx = CFG.turn * dt; P.yaw += Math.max(-mx, Math.min(mx, d)) }
    if (tg) { P.firing = true; if (P.shotT <= 0) { P.shotT = hero.rate; P.burst = { n: CFG.burst, t: 0, tg } } }
    else if (inp.fire && !P.roll) { P.farT = (P.farT || 0) - dt; if (P.farT <= 0) { P.farT = 0.5; E('far') } }   // 出了射程还按着：头顶淡淡写「太远了」
    if (P.burst) { P.burst.t -= dt; while (P.burst && P.burst.t <= 0) { const b = P.burst; if ((b.tg === Bo ? !Bo.dead : !b.tg.dead)) shoot(b.tg, 1, 'gun'); b.n--; b.t += CFG.burstGap; if (b.n <= 0) P.burst = null } }
    if (P.focus > 0) { P.focusT -= dt; while (P.focus > 0 && P.focusT <= 0) { if (!Bo.dead) shoot(Bo, SKILLS.focus.mult(sk('focus')), 'focus'); P.focus--; P.focusT += 0.08 } }
    for (const b of st.shots) { b.t -= dt; if (b.t <= 0) hitEnemy(b.tg, b.dmg, b.crit, b.kind) } st.shots = st.shots.filter(b => b.t > 0);
    /* 回血：离开战斗 3 秒后慢慢回；拾荒者 4 件：挨打后 3 秒内回 10% */
    if (P.hurtT > CFG.regenDelay) P.hp = Math.min(P.max, P.hp + P.max * CFG.regen * dt);
    if (P.regen10 > 0) { P.regen10 -= dt; P.hp = Math.min(P.max, P.hp + P.max * 0.1 / 3 * dt) }
    bossStep(dt); mobStep(dt);
    for (const e of st.ev) if (e.e === 'knock' && !P.dead) P.kb = { x: e.x, z: e.z };
    for (const w of st.warns) if (w !== (Bo.cast && Bo.cast.w)) w.t += dt;
    return st;
  }
  st.step = step; st.cdOf = cdOf; st.forceCast = k => { Bo.act = TOX ? 'idle' : 'chase'; Bo.cast = null; if (!TOX) st.warns.length = 0; const keep = st.ev; st.ev = []; if (TOX) toxCast(k); else startCast(k); st.pend = st.ev; st.ev = keep };   // 截图、测试用
  st.killBoss = () => { if (st.over) return; const keep = st.ev; st.ev = []; Bo.hp = 0; bossDie(); st.pend = st.ev; st.ev = keep };   /* 设计 74：测试用（打赢） */
  return st;
}
