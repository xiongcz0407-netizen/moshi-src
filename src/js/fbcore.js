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
  /* 设计 102：第 3 关落石巨人 · 塌方采石场。宽 13.6、长 32；南边铁丝网门进（z 19），北边倒塌吊机；两条南北铁轨 x ±3（滚石路线）。
     BOSS 会走动追人，不锁战斗区。4 个掩体分散在中段，有的压到一点铁轨（滚石撞得到） */
  3: { arena: { x0: -6.8, x1: 6.8, z0: -13, z1: 19, start: { x: 0, z: 17.2 }, boss: { x: 0, z: -9 } }, bossR: 1.9, hitY: 2.6,
    covers: [{ k: 'cart', x: -4.3, z: 3.2, hx: 1.2, hz: 0.9 }, { k: 'blocks', x: 3.9, z: -2.4, hx: 0.95, hz: 1.0 }, { k: 'frame', x: 4.2, z: 8.6, hx: 1.0, hz: 0.8 }, { k: 'fallen', x: -3.7, z: -5.6, hx: 0.75, hz: 0.85 }],
    walk: { stuck: 2, stuckGain: 1, replan: 0.3, replanMove: 1 } },
};
export let ARENA = null, COVERS = null;
export function setStage(n) {
  const g = STAGES[n] || STAGES[1];
  ARENA = { ...g.arena, start: { ...g.arena.start }, boss: { ...g.arena.boss } }; COVERS = g.covers.map((c, i) => ({ ...c, id: 'c' + i }));
  return g;
}
setStage(1);
const CFG = {
  bossR: 1.7, coverR: 1.15, turn: Math.PI * 4, edgeGap: 1.5,   /* 设计 64：主角转身每秒 720°；屠夫追人时离场地两边至少 1.5 米 */   /* 脚底碰掩体、找路用：放大到 1.4 时屠夫过不了掩体之间的缝，卡在后面，fbsim 用时 151 秒；脚的占地本来就比肩膀小，留 1.15 */ walk: 1.5,   /* 设计 61：屠夫放大 1.5 倍，身体半径 1.15 → 1.7（挨子弹、碰人、碰掩体都用它） */ swingR: 3.9, swingA: 1.75, swingCd: 2.2, swingK: 0.5,
  chargeLen: 15, chargeW: 2.6, chargeSpd: 11, slamR: 5.6, summonR: 1.4, burstK: 0.6,
  mobHp: 0.02, mobSpd: 2.3, mobHit: 0.04, mobR: 0.45,
  skillGap: 8.5, firstSkill: 5, summonCd: 30, order: ['charge', 'slam', 'summon', 'slam', 'charge', 'summon'],
  regenDelay: 5, regen: 0.01,   /* 设计 101：5 秒没挨打才回血、每秒 1%（原来 3 秒、2%） */
  s1cd: 15,                     /* 设计 101 补充：拾荒者 4 件「挨打后 3 秒回 10%」的冷却 */
  bulletSpd: 42, burst: 3, burstGap: 0.07,
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
/* 设计 102：落石巨人（第 3 关）的数。普通技能 = BOSSES[3].dmg（270），大招 = ult（460）。招式表见设计100 / 102 第 4 节 */
export const ROCK_K = 5.1;   // 模型 1.05 → 约 5.4 米（主角 3 倍）
export const ROCK_CFG = {
  walk: 1.4, walkHalf: 1.82, near: 2.8,
  sweepR: 4, sweepA: Math.PI, sweepWarn: 0.8, sweepK: 0.7, throwR: 1.2, throwWarn: 0.8, throwK: 0.5, throwFly: 0.6, basicCd: 2.5, basicCalm: 1, basicGuard: 2.5,
  grabT: 1.0, grabReach: 1.4, seekMax: 4, tossR: 2.5, tossK: 1.4, tossFly: 0.7,
  lanes: [-3, 3], laneW: 2.5, rollK: 1.3, rollSpd: 18, ballR: 1.1, ballGap: 2.2,
  cell: 3, pillarRows: 5, pillarK: 1.0, pillarStay: 2.0, wave2: 0.8, pillarWaves: 3, pillarWavesHalf: 4,   /* 设计 110：石柱阵前半血 3 波、半血后 4 波，石柱留 2 秒 */
  stunT: 1, stunImm: 1.5, rootT: 1, rollWarn: 1.6, shadowL: 3, minCovers: 2, jumpT: 0.35, comboDelay: 0.1, comboWarn: 0.45, comboK: 1,   /* 设计 110：眩晕 1 秒（之后 1.5 秒不再眩晕）、全场滚石读条 1.6 秒（掩体南边 3 米是安全区）、禁锢 1 秒、禁锢后 0.1 秒跳 0.35 秒 + 横扫蓄力 0.45 秒 */
 
  riftW: 1.2, riftLife: 6, riftDps: 0.3, riftFork: 3.5, riftA: 0.55,
  avaCast: 2.0, wallW: 2.2, rainT: 6, rainWaves: 7, rainN: 3, quake: 70, rubbleDps: 10,   /* 设计 106：落石雨每波 3 个圈；地动、碎石雨（必吃伤害，fbsim 定） */
  rainR: 1.4, rainWarn: 0.62, rainK: 0.6, rainKeep: 3, rockLife: 10, armor: 0.5,
  maxCovers: 6, calm: 1.8, calmRage: 1.4, first: 3, gap: 4.2, gapRage: 3.5,
  /* 设计 103：出招更密、大招更多。10 招一轮，山崩每 5 招一次；半血以后 8 招一轮，山崩每 4 招一次 */
  order: ['grab', 'rift', 'roll', 'ava', 'pillars', 'grab', 'roll', 'rift', 'ava', 'pillars'], orderHalf: ['grab', 'rift', 'roll', 'ava', 'pillars', 'roll', 'rift', 'ava'],
};
/* 落石巨人动作的时间（落石巨人.glb，脚本 tools/golem_rig/anim.py 导出；hit = 拳头砸到 / 东西出手那一刻） */
export const ROCK_ANIM = { idle: { T: 3.2, loop: 1 }, walk: { T: 1.5, loop: 1, speed: 0.177 }, walk_fast: { T: 1.12, loop: 1, speed: 0.298 },
  sweep: { T: 1.7, hit: 0.8 }, throw: { T: 1.6, hit: 0.8 }, grab: { T: 1.0 }, toss: { T: 2.4, hit: 1.5 }, pound: { T: 2.7, hit: 1.5 }, stomp: { T: 2.5, hit: 1.5 },
  roar: { T: 3.1, hit: 2.0 }, hit: { T: 0.5 }, stagger: { T: 1.3 }, crack: { T: 2.1, hit: 0.7 }, die: { T: 2.7, hit: 1.95 } };
export const ROCK_NAME = { sweep: '石拳横扫', throw: '投石', grab: '抓掩体投掷', roll: '全场滚石', pillars: '石柱阵', rift: '地裂', ava: '山崩（全场）' };
/* 毒囊动作的时间（毒囊.glb，脚本 fb2/rig/anim.py 导出；hit = 喷出 / 拍到 / 炸开那一刻） */
export const TOX_ANIM = { idle: { T: 3.0, loop: 1 }, spit: { T: 1.5, hit: 0.8 }, bolt_wind: { T: 0.6 }, bolt_spit: { T: 0.45, hit: 0.12 }, burst: { T: 2.1, hit: 1.15 },
  slam_l: { T: 2.6, hit: 1.5 }, slam_r: { T: 2.6, hit: 1.5 }, surge: { T: 2.8, hit: 2.0 }, hit: { T: 0.4 }, enrage: { T: 2.0 }, die: { T: 3.0, hit: 2.2 } };
export const TOX_NAME = { spit: '酸液喷吐', bolt: '毒弹', burst: '毒囊爆裂', slam: '拍地', surge: '毒雾上涌' };
const hyp = Math.hypot, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angD = (a, b) => { let d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)) };
/* 线段 p→q 有没有穿过掩体；返回第一个碰到的点的比例（0～1），没碰到返回 null */
export function segHit(px, pz, qx, qz, pad = 0, shot = false) {   /* shot：算子弹（设计 110b：石柱阵的临时石柱只挡路、不挡子弹） */
  let best = null;
  for (const c of COVERS) { if (shot && c.k === 'spike') continue;
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
export const segDist = (x, z, g) => { const dx = g.x1 - g.x0, dz = g.z1 - g.z0, L = dx * dx + dz * dz || 1, u = clamp(((x - g.x0) * dx + (z - g.z0) * dz) / L, 0, 1); return hyp(x - g.x0 - dx * u, z - g.z0 - dz * u) };
const inCover = (x, z, r) => COVERS.find(c => Math.abs(x - c.x) < c.hx + r && Math.abs(z - c.z) < c.hz + r);
/* 一点在不在预警形状里（r：人的半径） */
export function inWarn(w, x, z, r = 0.35) {
  const dx = x - w.x, dz = z - w.z;
  if (w.type === 'circle') return hyp(dx, dz) < w.r + r;
  if (w.type === 'fan') { const d = hyp(dx, dz); return d < w.r + r && Math.abs(angD(Math.atan2(dx, dz), w.yaw)) < w.a / 2 + Math.atan2(r, Math.max(d, 0.3)) }
  if (w.type === 'line') { const s = Math.sin(w.yaw), c = Math.cos(w.yaw), along = dx * s + dz * c, side = dx * c - dz * s; return along > -1 && along < w.len + r && Math.abs(side) < w.w / 2 + r }
  if (w.type === 'multi') return w.pts.some(p => hyp(x - p.x, z - p.z) < w.r + r);
  if (w.type === 'cells') return w.cells.some(c => Math.abs(x - c.x) < w.s / 2 + r * 0.5 && Math.abs(z - c.z) < w.s / 2 + r * 0.5);   // 设计 102：石柱阵棋盘格
  if (w.type === 'segs') return w.segs.some(g => segDist(x, z, g) < w.w / 2 + r);   // 设计 102：地裂（Y 字）
  if (w.type === 'lanes') return w.xs.some(lx => Math.abs(x - lx) < w.w / 2 + r);   // 设计 102：滚石铁轨（整条）
  if (w.type === 'field') return x > w.x0 - r && x < w.x1 + r && z > w.z0 - r && z < w.z1 + r && !w.sh.some(q => x > q.x0 + 0.25 && x < q.x1 - 0.25 && z > q.z0 + 0.1 && z < q.z1 - 0.25);   // 设计 110：全场滚石——整片危险，掩体南边的影子安全
  return false;
}

export function createFight(n, hero, opt = {}) {
  const SG = setStage(n), BR = SG.bossR, TOX = n === 2, ROCK = n === 3;   /* 设计 81：第 2 关毒囊（不走动，在北边崖下） */
  const B = BOSSES[n], rnd = opt.rng || Math.random, warnT = FB.warn(n);
  const st = {
    n, t: 0, clk: 0, locked: SG.lockZ == null, lockZ: SG.lockZ ?? null, over: 0, win: false, rage: false, ev: [], warns: [], mobs: [], shots: [], nades: [], nid: 1, pools: [], zones: [], hazards: [], moveK: 1, half: false, shrink: 0, bossR: BR, hitY: SG.hitY,
    boss: { x: ARENA.boss.x, z: ARENA.boss.z, yaw: 0, look: null, hp: B.hp, max: B.hp, act: 'wait', at: 0, anim: 'idle', ts: 1, animId: 0, cast: null, stun: 0, slow: 0, swingCd: 3, skillT: CFG.firstSkill, summonT: 0, oi: 0, bleed: 0, bleedDps: 0, dead: false, interruptible: false },
    player: { x: ARENA.start.x, z: ARENA.start.z, yaw: Math.PI, hp: hero.hp, max: hero.hp, inv: 0, hurtT: 99, roll: null, cd: { focus: 0, roll: 0, stun: 0, nade: 0 }, charges: SKILLS.roll.charges(hero.sk.roll), focus: 0, focusT: 0, shotT: 0, aim: null, regen10: 0, s1cd: 0, firing: false, target: null, dead: false },
    stats: { shots: 0, dmg: 0, taken: 0, hits: 0, casts: {}, interrupts: 0, mobsKilled: 0 },
    hero,
  };
  const E = (e, o = {}) => st.ev.push({ e, ...o });
  const bossDmg = ult => ult ? B.ult : B.dmg;   /* 设计 106：狂暴不再加伤害（改成灭杀） */
  const wdur = base => base;
  const setAnim = (a, ts = 1) => { const b = st.boss; b.anim = a; b.ts = ts; b.animId++; E('anim', { a, ts }) };
  const sk = k => hero.sk[k] || 1;
  const cdOf = k => { if (k === 'nade') return hero.nadeCd || 10; let c = SKILLS[k].cd(sk(k)) * (1 - hero.cdr); if (k === 'focus' && hero.s2four) c *= 0.7; return c };
  const P = st.player, Bo = st.boss;
  if (TOX) { Bo.act = 'idle'; Bo.skillT = TOX_CFG.first; Bo.look = 'p' }
  if (ROCK) { Bo.act = 'wait'; Bo.skillT = ROCK_CFG.first; Bo.look = 'p'; Bo.basicCd = 1.5; st.balls = []; st.rifts = []; st.rain = null; st.coverVer = 0 }
  /* ---------- 设计 83：会走动的 BOSS 找路、卡住换招（通用：这一关配置里有 walk 就用） ---------- */
  const WK = SG.walk || null; let NG = null;
  const navGrid = () => { const k = `${ARENA.x0},${ARENA.x1},${st.coverVer || 0}`; if (!NG || NG.k2 !== k) { NG = makeGrid(ARENA, COVERS, CFG.coverR); NG.k2 = k } return NG };
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

  function hurtPlayer(d, src, sure = false) {   /* sure：必吃伤害（设计 106），翻滚无敌也挡不住 */
    if (P.dead || (P.inv > 0 && !sure) || P.god || st.over) return 0;   // 设计 61：P.god 只给截图、测试用（不显示、正式版不会设）
    const a = Math.round(d * (1 - Math.min(0.9, hero.dr + (P.heartT > 0 ? 0.3 : 0)))); P.hp -= a; P.hurtT = 0; st.stats.taken += a; E('pdmg', { a, src });
    if (hero.s1four && !(P.s1cd > 0)) { P.regen10 = 3; P.s1cd = CFG.s1cd }   // 设计 101：拾荒者 4 件每 15 秒最多触发一次（原来每挨一下都重新触发）
    if (hero.heart && !P.heartUsed && P.hp > 0 && P.hp < P.max * 0.3) { P.heartUsed = true; P.heartT = 5; E('heart') }   // 不眠之心
    if (P.hp <= 0) { P.hp = 0; P.dead = true; end(false) }
    return a;
  }
  function hitEnemy(tg, dmg, crit, kind) {
    if (tg === Bo) { if (Bo.dead) return; if (st.rage) { if (!(st.immT > 0)) { st.immT = 1; E('immune') } return }   /* 设计 106b：灭杀一开始 BOSS 无敌，不掉血（「免疫」字 1 秒最多一次） */ if (Bo.armorT > 0) dmg *= ROCK_CFG.armor; Bo.hp -= dmg; st.stats.dmg += dmg; if (hero.bleed) { Bo.bleed = 3; Bo.bleedDps = Math.max(Bo.bleedDps, dmg * 0.1) } if (hero.slow) Bo.slowHit = 1.5;
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
  const inRange = (t, extra = 0) => !t || (t === Bo ? Bo.dead : t.dead) ? false : t === Bo ? hyp(Bo.x - P.x, Bo.z - P.z) < hero.range + BR + extra : hyp(t.x - P.x, t.z - P.z) < hero.range + extra && (extra > 0 || segHit(P.x, P.z, t.x, t.z, 0, true) === null);
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
    for (const m of st.mobs) { if (m.dead || m.rise > 0) continue; const d = hyp(m.x - P.x, m.z - P.z); if (d < rng && d < bd && segHit(P.x, P.z, m.x, m.z, 0, true) === null) { best = m; bd = d } }
    if (best) return best;
    if (!Bo.dead && hyp(Bo.x - P.x, Bo.z - P.z) < rng + BR) return Bo;
    return null;
  }
  function shoot(tg, mult, kind) {
    const tx = tg.x, tz = tg.z, d = hyp(tx - P.x, tz - P.z), bl = segHit(P.x, P.z, tx, tz, 0, true);
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
  /* 设计 106：狂暴改成「灭杀」（所有关）。3 分钟一到 BOSS 停下所有技能，读条 2 秒（打断不了），全场扣最大生命 60%（无视减伤、不触发保命、翻滚也挡不住）；
     之后每 6 秒一次，第 2 次必死。返回 true = 这一帧 BOSS 只管灭杀 */
  function doomStep(dt) {
    if (Bo.dead) return false;
    if (!st.rage) { if (st.t < FB.time) return false;
      st.rage = true; if (st.rain) { st.rain = null; E('rainEnd') } Bo.armorT = 0; if (Bo.cast && Bo.cast.cancel) Bo.cast.cancel(); Bo.cast = null; st.warns.length = 0; Bo.interruptible = false; Bo.calm = 0; Bo.look = 'p';
      st.doom = { n: 0, t: 0, ph: 'cast' }; E('rage'); doomCast(); return true }
    const D = st.doom; D.t += dt; if (st.immT > 0) st.immT -= dt; if (Bo.cast) Bo.cast.t = D.ph === 'cast' ? D.t : Bo.cast.t;
    if (D.ph === 'cast' && D.t >= FB.doom.cast) { D.n++; D.ph = 'wait'; D.t = 0; Bo.cast = null; Bo.act = 'doomWait'; E('doomHit', { n: D.n });
      if (!P.dead && !st.over && !P.god) { const a = D.n >= 2 ? P.hp : Math.min(P.hp, Math.round(P.max * FB.doom.k)); P.hp -= a; P.hurtT = 0; st.stats.taken += a; E('pdmg', { a, src: 'doom' }); if (D.n >= 2 || P.hp <= 0) { P.hp = 0; P.dead = true; end(false) } } }
    else if (D.ph === 'wait' && D.t >= FB.doom.gap - FB.doom.cast) { D.ph = 'cast'; D.t = 0; doomCast() }
    return true;
  }
  function doomCast() { Bo.act = 'doom'; Bo.interruptible = false; Bo.cast = { k: 'doom', t: 0, dur: FB.doom.cast, ws: [], w: { ult: true }, doom: true }; Bo.yaw = Math.atan2(P.x - Bo.x, P.z - Bo.z);
    setAnim(TOX ? 'enrage' : ROCK ? 'roar' : 'enrage', ROCK ? ROCK_ANIM.roar.hit / FB.doom.cast : 1); E('cast', { k: 'doom', dur: FB.doom.cast, ult: true, name: '灭杀（全场）' }) }
  function bossStep(dt) {
    if (doomStep(dt)) return;
    if (TOX) { toxStep(dt); return }
    if (ROCK) { rockStep(dt); return }
    const b = Bo; if (b.dead) return;
    const tf = b.slow > 0 ? 0.5 : 1; if (b.slow > 0) b.slow -= dt;
    if (b.bleed > 0) { b.bleed -= dt; b.hp -= b.bleedDps * dt; st.stats.dmg += b.bleedDps * dt; if (b.hp <= 0) { b.hp = 0; bossDie(); return } } else b.bleedDps = 0;
    if (b.slowHit > 0) b.slowHit -= dt;
    const dts = dt * tf;
    b.swingCd -= dts; b.skillT -= dts; b.summonT -= dts;
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
      const sp = CFG.walk * (b.slowHit > 0 ? 1 - hero.slow : 1) * dts * face; b.x += Math.sin(b.yaw) * sp; b.z += Math.cos(b.yaw) * sp; push(b, CFG.coverR);
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
      const fill = TX.pusFill;
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
  /* ---------- 设计 102：落石巨人（第 3 关）。会走、追人；技能之间至少安静 2.5 秒（设计 92）；大技能 7 秒一招，只在闲着（含安静）时倒数 ---------- */
  const RK = ROCK_CFG;
  const realCovers = () => COVERS.filter(c => !c.temp);
  const shadowOf = c => ({ x0: c.x - c.hx - 0.15, x1: c.x + c.hx + 0.15, z0: c.z - c.hz, z1: c.z + c.hz + RK.shadowL });   /* 设计 110：掩体南边的影子（滚石从北边来） */
  function coverAdd(c) {   /* 新掩体（山崩落石、半血掉的那一大块、石柱阵临时石柱）。场上真掩体最多 6 个，多了最早的先碎 */
    c.id = c.id || 'n' + st.nid++; c.born = st.t; COVERS.push(c); st.coverVer++;
    if (!c.temp) { const real = realCovers(); while (real.length > RK.maxCovers) { const o = real.shift(); coverGone(o, 'crumble') } }
    E('coverNew', { c }); push(P, 0.42); push(Bo, CFG.coverR);
  }
  function coverGone(c, how) { const i = COVERS.indexOf(c); if (i < 0) return; COVERS.splice(i, 1); st.coverVer++; E('coverGone', { c, how }) }
  const rwarn = (w, k, dur) => { w.id = st.nid++; w.k = k; w.t = 0; w.dur = dur; st.warns.push(w); return w };
  const dropWarn = w => { const i = st.warns.indexOf(w); if (i >= 0) st.warns.splice(i, 1) };
  const cellsAround = (cz, parity) => { const cols = Math.round((ARENA.x1 - ARENA.x0) / RK.cell), cw = (ARENA.x1 - ARENA.x0) / cols, out = [];
    const r0 = clamp(Math.round((cz - ARENA.z0) / RK.cell - RK.pillarRows / 2), 0, Math.floor((ARENA.z1 - ARENA.z0) / RK.cell) - RK.pillarRows);
    for (let j = r0; j < r0 + RK.pillarRows; j++) for (let i = 0; i < cols; i++) if ((i + j) % 2 === parity) out.push({ x: ARENA.x0 + cw * (i + 0.5), z: ARENA.z0 + RK.cell * (j + 0.5) });
    return { cells: out, s: Math.min(cw, RK.cell) } };
  function rockCast(k, fast = false) {
    const b = Bo, c = { k, t: 0, ws: [], w: { ult: k === 'ava' } }, dx = P.x - b.x, dz = P.z - b.z, d = hyp(dx, dz);
    st.stats.casts[k] = (st.stats.casts[k] || 0) + 1; b.yaw = Math.atan2(dx, dz); b.look = 'p';
    c.cancel = () => { for (const w of c.ws) dropWarn(w); if (c.held) { c.held = null } };
    if (k === 'sweep') { c.dur = fast ? RK.comboWarn : wdur(RK.sweepWarn); if (fast) c.nm = '快速横扫！'; c.ws.push(rwarn({ type: 'fan', x: b.x, z: b.z, yaw: b.yaw, r: RK.sweepR, r0: 0.6, a: RK.sweepA, fast }, 'sweep', c.dur)); setAnim('sweep', ROCK_ANIM.sweep.hit / c.dur) }
    else if (k === 'throw') { c.dur = wdur(RK.throwWarn); const w = rwarn({ type: 'circle', x: clamp(P.x, ARENA.x0 + 0.6, ARENA.x1 - 0.6), z: clamp(P.z, ARENA.z0 + 0.6, ARENA.z1 - 0.6), r: RK.throwR }, 'throw', c.dur); c.ws.push(w);
      setAnim('throw', ROCK_ANIM.throw.hit / Math.max(0.3, c.dur - RK.throwFly)) }   // 手松开 = 预警填满前 0.6 秒（石头飞过去，落地那一刻 = 填满）
    else if (k === 'grab') {   /* 先走到最近的掩体（最多 4 秒），抓起来 1 秒（能打断），再扔 */
      const cs = realCovers(); c.cv = cs.length ? cs.reduce((p, q) => hyp(q.x - b.x, q.z - b.z) < hyp(p.x - b.x, p.z - b.z) ? q : p) : null; c.phase = c.cv ? 'seek' : 'toss'; c.dur = 99; c.seekT = 0; c.hideBar = !!c.cv;
      if (!c.cv) startToss(c) }
    else if (k === 'roll') {   /* 设计 110：全场滚石——整片场地从北往南滚过一排大石头，只有掩体南边的影子里安全；放之前场上掩体不够 2 个就先从天上掉石头补 */
      let cs = realCovers();
      if (cs.length < RK.minCovers) { const cand = []; for (const x of [-4.5, -1.5, 1.5, 4.5]) for (let dz = -7; dz <= 1; dz += 2) { const z = clamp(P.z + dz, ARENA.z0 + 3, ARENA.z1 - 4); cand.push({ x, z, s: Math.abs(hyp(x - P.x, z - P.z) - 4.5) + rnd() * 1.5 }) }   // 离主角 4～5 米最好（跑得到）
        cand.sort((p, q) => p.s - q.s);
        for (const q of cand) { if (cs.length >= RK.minCovers) break; if (inCover(q.x, q.z, 1.8) || hyp(q.x - P.x, q.z - P.z) < 2 || hyp(q.x - b.x, q.z - b.z) < 3) continue; coverAdd({ k: 'fallen', x: q.x, z: q.z, hx: 0.8, hz: 0.8, drop: true }); E('coverDrop', { x: q.x, z: q.z }); cs = realCovers() } }
      c.dur = RK.rollWarn; c.nm = '全场滚石！躲岩石后'; c.ws.push(rwarn({ type: 'field', x0: ARENA.x0, x1: ARENA.x1, z0: ARENA.z0, z1: ARENA.z1, sh: cs.map(shadowOf), x: 0, z: 0, ult: false }, 'roll', c.dur)); setAnim('pound', ROCK_ANIM.pound.hit / c.dur) }
    else if (k === 'pillars') { c.dur = wdur(warnT); c.waves = st.half ? RK.pillarWavesHalf : RK.pillarWaves; c.wave = 0; c.cz = P.z; const g = cellsAround(c.cz, 0); c.ws.push(rwarn({ type: 'cells', ...g, x: P.x, z: P.z }, 'pillars', c.dur));
      setAnim('stomp', ROCK_ANIM.stomp.hit / c.dur) }
    else if (k === 'rift') { c.dur = wdur(warnT); const yaw = Math.atan2(dx, dz), L = Math.max(3, d + 1.2), ex = clamp(b.x + Math.sin(yaw) * L, ARENA.x0 + 0.3, ARENA.x1 - 0.3), ez = clamp(b.z + Math.cos(yaw) * L, ARENA.z0 + 0.3, ARENA.z1 - 0.3);
      const segs = [{ x0: b.x + Math.sin(yaw) * 1.6, z0: b.z + Math.cos(yaw) * 1.6, x1: ex, z1: ez }];
      for (const sg of [-1, 1]) { const a = yaw + sg * RK.riftA; segs.push({ x0: ex, z0: ez, x1: clamp(ex + Math.sin(a) * RK.riftFork, ARENA.x0 + 0.3, ARENA.x1 - 0.3), z1: clamp(ez + Math.cos(a) * RK.riftFork, ARENA.z0 + 0.3, ARENA.z1 - 0.3) }) }
      c.ws.push(rwarn({ type: 'segs', segs, w: RK.riftW, x: b.x, z: b.z }, 'rift', c.dur)); setAnim('pound', ROCK_ANIM.pound.hit / c.dur) }
    else if (k === 'ava') { c.dur = wdur(RK.avaCast); const L = ARENA.z1 - ARENA.z0 + 1;
      for (const x of [ARENA.x0 + RK.wallW / 2, ARENA.x1 - RK.wallW / 2]) c.ws.push(rwarn({ type: 'line', x, z: ARENA.z0 - 0.5, yaw: 0, len: L, w: RK.wallW, ult: true }, 'wall', c.dur));
      setAnim('roar', ROCK_ANIM.roar.hit / c.dur) }
    b.cast = c; b.act = 'cast'; b.interruptible = k === 'pillars' || k === 'rift';
    if (k !== 'grab' || c.phase === 'toss') E('cast', { k, dur: c.dur, ult: k === 'ava', name: c.nm || ROCK_NAME[k] });
  }
  /* 设计 106c：画面上被按钮 / 头像挡住的地方（画面那边给 st.blocked；fbsim 用近似镜头算；没给就当都看得到） */
  const scrBlocked = (x, z, r) => !!(st.blocked && st.blocked(x, z, r));
  function startToss(c) {   /* 扔：脚下大圆 2.5 米、1.5 秒；半血以后一次扔 2 个（第 2 个落在主角旁边 3.5 米） */
    const b = Bo; c.phase = 'toss'; c.hideBar = false; c.t = 0; c.dur = wdur(warnT); b.interruptible = false; b.yaw = Math.atan2(P.x - b.x, P.z - b.z);
    const pts = [{ x: P.x, z: P.z }]; if (st.half) { const a0 = rnd() * 6.28; let q = null; for (let i = 0; i < 12; i++) { const a = a0 + i * 0.52, x = clamp(P.x + Math.sin(a) * 3.5, ARENA.x0 + 0.8, ARENA.x1 - 0.8), z = clamp(P.z + Math.cos(a) * 3.5, ARENA.z0 + 0.8, ARENA.z1 - 0.8); q = q || { x, z }; if (!scrBlocked(x, z, RK.tossR)) { q = { x, z }; break } } pts.push(q) }   /* 设计 106c：第 2 个圈避开按钮区、头像区 */
    for (const p of pts) c.ws.push(rwarn({ type: 'circle', x: clamp(p.x, ARENA.x0 + 0.8, ARENA.x1 - 0.8), z: clamp(p.z, ARENA.z0 + 0.8, ARENA.z1 - 0.8), r: RK.tossR, ult: false, cv: c.held || null }, 'toss', c.dur));
    setAnim('toss', ROCK_ANIM.toss.hit / Math.max(0.4, c.dur - RK.tossFly)); E('cast', { k: 'grab', dur: c.dur, ult: false, name: ROCK_NAME.grab, held: c.held ? c.held.k : null });
  }
  function rockHazards(dt) {
    /* 预警到点：按种类结算 */
    for (let i = st.warns.length - 1; i >= 0; i--) { const w = st.warns[i]; if (!w.k || w.t < w.dur) continue; st.warns.splice(i, 1);
      const inW = inWarn(w, P.x, P.z);
      if (w.k === 'sweep') { E('rockHit', { k: 'sweep', w }); if (inW) { hurtPlayer(bossDmg(false) * RK.sweepK * (w.fast ? RK.comboK : 1), w.fast ? 'combo' : 'sweep'); E('knock', { x: Math.sin(Math.atan2(P.x - w.x, P.z - w.z)) * 5, z: Math.cos(Math.atan2(P.x - w.x, P.z - w.z)) * 5 }) } }
      else if (w.k === 'throw') { E('rockHit', { k: 'throw', w }); if (inW) hurtPlayer(bossDmg(false) * RK.throwK, 'throw') }
      else if (w.k === 'toss') { E('rockHit', { k: 'toss', w, cv: w.cv }); if (inW) hurtPlayer(bossDmg(false) * RK.tossK, 'toss') }
      else if (w.k === 'roll') { for (let x = ARENA.x0 + RK.ballGap / 2; x < ARENA.x1; x += RK.ballGap) { const ball = { id: st.nid++, x, z: ARENA.z0 - 1 }; st.balls.push(ball); E('ballGo', { b: ball }) }
        st.front = { z: ARENA.z0 - 1, sh: realCovers().map(shadowOf), done: false } }
      else if (w.k === 'pillars') { E('pillars', { cells: w.cells, s: w.s, stay: RK.pillarStay }); if (inW && hurtPlayer(bossDmg(false) * RK.pillarK, 'pillar') > 0 && !(P.stunImm > 0) && !P.dead) { P.stunT = RK.stunT; P.stunImm = RK.stunT + RK.stunImm; st.stats.stun = (st.stats.stun || 0) + 1; E('pstun', { t: RK.stunT }) }   /* 设计 110：被石柱打中眩晕 1 秒，之后 1.5 秒内不再眩晕 */
        for (const c of w.cells) coverAdd({ k: 'spike', x: c.x, z: c.z, hx: 0.5, hz: 0.5, temp: true, ttl: RK.pillarStay });
        const cc = w.cast; if (cc && cc.wave + 1 < cc.waves) { cc.wave++; const g = cellsAround(cc.cz, cc.wave % 2); st.warns.push(Object.assign({ type: 'cells', ...g, x: P.x, z: P.z }, { id: st.nid++, k: 'pillars', t: 0, dur: wdur(RK.wave2), cast: cc })); E('pillarWave', { n: cc.wave + 1 }) } }
      else if (w.k === 'rift') { const r = { id: st.nid++, segs: w.segs, w: w.w, t: 0, life: RK.riftLife, acc: 0.25 }; st.rifts.push(r); E('rift', { r }); if (inW && !P.roll) hurtPlayer(bossDmg(false) * RK.riftDps * 0.5, 'rift') }
      else if (w.k === 'wall') { E('rockHit', { k: 'wall', w }); if (inW) { hurtPlayer(bossDmg(true), 'wall'); E('knock', { x: w.x < 0 ? 6 : -6, z: 0 }) } }
      else if (w.k === 'rain') { E('rockHit', { k: 'rain', w }); if (inW) hurtPlayer(bossDmg(false) * RK.rainK, 'rain');
        if (w.keep) coverAdd({ k: 'fallen', x: w.x, z: w.z, hx: 0.8, hz: 0.8, ttl: RK.rockLife, rain: true }) }
    }
    /* 设计 110：全场滚石——一排大石头往南滚，碰到掩体就碎在掩体前面（掩体不坏）；滚过主角那一行时，不在掩体影子里（也不在翻滚无敌里）就扣血 + 禁锢 1 秒，BOSS 马上跳过来横扫 */
    for (let i = st.balls.length - 1; i >= 0; i--) { const bl = st.balls[i]; bl.z += RK.rollSpd * dt;
      const cv = COVERS.find(c => !c.temp && Math.abs(c.x - bl.x) < c.hx + RK.ballR * 0.8 && Math.abs(c.z - bl.z) < c.hz + RK.ballR);
      if (cv || bl.z > ARENA.z1 + 3) { st.balls.splice(i, 1); E(cv ? 'ballBreak' : 'ballGone', { b: bl }) } }
    const F = st.front; if (F) { F.z += RK.rollSpd * dt;
      if (!F.done && F.z >= P.z - 0.35) { F.done = true; const safe = F.sh.some(q => P.x > q.x0 && P.x < q.x1 && P.z > q.z0 && P.z < q.z1);
        if (!safe && hurtPlayer(bossDmg(false) * RK.rollK, 'roll') > 0 && !P.dead) { P.rootT = RK.rootT; st.stats.root = (st.stats.root || 0) + 1; E('proot', { t: RK.rootT }); st.combo = { t: RK.comboDelay } } }
      if (F.z > ARENA.z1 + 3) st.front = null }
    /* 地裂：站在裂缝上每 0.5 秒扣一次（每秒 0.3 倍）；翻滚的时候不算 */
    let onRift = false;
    for (let i = st.rifts.length - 1; i >= 0; i--) { const r = st.rifts[i]; r.t += dt; if (r.t >= r.life) { st.rifts.splice(i, 1); E('riftGone', { id: r.id }); continue } if (r.segs.some(g => segDist(P.x, P.z, g) < r.w / 2 + 0.2)) onRift = true }
    if (onRift && !P.roll) { P.riftAcc = (P.riftAcc || 0) + dt; if (P.riftAcc >= 0.5) { P.riftAcc -= 0.5; hurtPlayer(bossDmg(false) * RK.riftDps * 0.5, 'rift') } } else P.riftAcc = 0.25;
    /* 临时掩体（石柱 1 秒、落石 10 秒）到时间碎掉 */
    for (const c of [...COVERS]) if (c.ttl != null) { c.ttl -= dt; if (c.ttl <= 0) coverGone(c, c.temp ? 'sink' : 'crumble') }
    /* 山崩之后的落石雨：一波一波，每波 2 个圈（一个在主角脚下附近），0.6 秒预警；有 3 块留下当掩体 */
    const R = st.rain; if (R) { R.t += dt;
      while (R.wave < RK.rainWaves && R.t >= R.wave * (RK.rainT - RK.rainWarn) / RK.rainWaves) { const keepW = R.wave % 2 === 1;
        for (let j = 0; j < RK.rainN; j++) { let x = 0, z = 0; for (let tr = 0; tr < 20; tr++) { const a = rnd() * 6.28, rr = j === 0 ? rnd() * 1.5 : j === 1 ? 2.5 + rnd() * 5 : 1.5 + rnd() * 3.5; x = clamp(P.x + Math.sin(a) * rr, ARENA.x0 + 1, ARENA.x1 - 1); z = clamp(P.z + Math.cos(a) * rr, ARENA.z0 + 1, ARENA.z1 - 1); if (!inCover(x, z, 1) && (j === 0 || !scrBlocked(x, z, RK.rainR))) break }   /* 设计 106c：瞄脚下的那个照落，别的随机圈避开按钮区、头像区 */
          rwarn({ type: 'circle', x, z, r: RK.rainR, keep: keepW && j === 1 && R.kept < RK.rainKeep }, 'rain', wdur(RK.rainWarn)); if (keepW && j === 1) R.kept++ }
        R.wave++ }
      /* 设计 106：碎石雨——落石雨期间全场每秒掉血（躲不掉，算挨打，期间不自动回血） */
      R.acc = (R.acc || 0) + dt; while (R.acc >= 0.5 && R.t <= RK.rainT) { R.acc -= 0.5; hurtPlayer(RK.rubbleDps * 0.5, 'rubble', true) }
      if (R.t >= RK.rainT) { st.rain = null; Bo.armorT = 0; E('rainEnd') } }
    if (Bo.armorT > 0) Bo.armorT -= dt;
    st.hazards = [...st.rifts.map(r => ({ type: 'segs', segs: r.segs, w: r.w, x: 0, z: 0 })), ...(st.front && !st.front.done ? [{ type: 'field', x0: ARENA.x0, x1: ARENA.x1, z0: st.front.z - 1, z1: ARENA.z1, sh: st.front.sh, x: 0, z: 0 }] : [])];   /* 设计 110：滚石还没滚过主角那一行：整片还是危险（机器人别提前走出掩体） */
  }
  function rockStep(dt) {
    const b = Bo; rockHazards(dt); if (b.dead) return;
    const tf = b.slow > 0 ? 0.5 : 1; if (b.slow > 0) b.slow -= dt;
    if (b.bleed > 0) { b.bleed -= dt; b.hp -= b.bleedDps * dt; st.stats.dmg += b.bleedDps * dt; if (b.hp <= 0) { b.hp = 0; bossDie(); return } } else b.bleedDps = 0;
    if (b.slowHit > 0) b.slowHit -= dt;
    const dts = dt * tf; b.basicCd -= dts;
    /* 设计 110：主角被滚石禁锢 → 0.1 秒后 BOSS 跳到主角身边（0.35 秒）→ 快速横扫（蓄力 0.45 秒）。不翻滚就一定被扫到 */
    if (st.combo) { st.combo.t -= dt; if (st.combo.t <= 0) { st.combo = null;
      if (P.rootT > 0 && !P.dead && b.act !== 'crackAnim') { if (b.cast && b.cast.cancel) b.cast.cancel(); b.cast = null;
        const ex = b.x - P.x, ez = b.z - P.z, el = hyp(ex, ez) || 1, q = { x: P.x + ex / el * 2.2, z: P.z + ez / el * 2.2 }; push(q, CFG.coverR); q.x = clamp(q.x, ARENA.x0 + 1, ARENA.x1 - 1); q.z = clamp(q.z, ARENA.z0 + 1, ARENA.z1 - 1);
        b.act = 'jump'; b.jump = { t: 0, x0: b.x, z0: b.z, x1: q.x, z1: q.z }; b.yaw = Math.atan2(P.x - q.x, P.z - q.z); b.look = 'p'; setAnim('idle'); E('bossJump', { x0: b.x, z0: b.z, x1: q.x, z1: q.z, dur: RK.jumpT }) } } }
    if (b.act === 'jump') { const J = b.jump; J.t += dt; const u = Math.min(1, J.t / RK.jumpT); b.x = J.x0 + (J.x1 - J.x0) * u; b.z = J.z0 + (J.z1 - J.z0) * u; b.jumpY = Math.sin(Math.PI * u) * 2.2;
      if (u >= 1) { b.jumpY = 0; b.act = 'chase'; b.calm = 0; E('bossLand', { x: b.x, z: b.z }); st.stats.combo = (st.stats.combo || 0) + 1; rockCast('sweep', true) } return }
    /* 半血：石化那一侧掉下一大块（落地当掩体），走路快 30%；技能变强 */
    if (!st.half && b.hp < b.max * 0.5 && !b.cast) { st.half = true; E('half'); b.act = 'crackAnim'; b.at = ROCK_ANIM.crack.T; setAnim('crack'); b.chunkT = ROCK_ANIM.crack.hit }
    if (b.chunkT > 0) { b.chunkT -= dts; if (b.chunkT <= 0) { const s = Math.sin(b.yaw), c = Math.cos(b.yaw), x = clamp(b.x - c * 2.6 + s * 0.6, ARENA.x0 + 1, ARENA.x1 - 1), z = clamp(b.z + s * 2.6 + c * 0.6, ARENA.z0 + 1, ARENA.z1 - 1); coverAdd({ k: 'chunk', x, z, hx: 0.85, hz: 0.85 }) } }
    const dx = P.x - b.x, dz = P.z - b.z, d = hyp(dx, dz);
    if (b.act === 'wait') { b.look = 'p'; if (st.t > 0.6) { b.act = 'chase'; setAnim('idle') } return }
    if (b.act === 'stun' || b.act === 'recover' || b.act === 'crackAnim') { b.at -= dts; if (b.at <= 0) { const lk = b.lastK; b.lastK = null;
      /* 设计 103：普攻后只安静 1 秒；地裂放完直接接滚石或石柱阵（连招，不安静）；半血以后石柱阵后面接投石 */
      if (b.act === 'recover' && (lk === 'sweep' || lk === 'throw')) b.calm = RK.basicCalm; else b.calm = st.rage ? RK.calmRage : RK.calm;
      const combo = b.act === 'recover' && !st.rain && (lk === 'rift' ? (() => { const o = st.half ? RK.orderHalf : RK.order, nx = o[b.oi % o.length]; if (nx === 'roll' || nx === 'pillars') { b.oi++; return nx } return b.comboAlt = !b.comboAlt, b.comboAlt ? 'roll' : 'pillars' })() : lk === 'pillars' && st.half && hyp(P.x - b.x, P.z - b.z) < 16 ? 'throw' : null);
      b.act = 'chase'; setAnim('idle');
      if (combo) { b.calm = 0; b.combo = true; if (combo !== 'throw') b.skillT = st.rage ? RK.gapRage : RK.gap; else b.basicCd = RK.basicCd; rockCast(combo); return } b.combo = false } return }
    if (b.act === 'cast') { const c = b.cast; c.t += dts;
      if (c.k === 'grab' && c.phase === 'seek') {   /* 走到掩体旁边 */
        if (!COVERS.includes(c.cv)) { startToss(c); return }
        const cv = c.cv, ex = clamp(b.x, cv.x - cv.hx, cv.x + cv.hx), ez = clamp(b.z, cv.z - cv.hz, cv.z + cv.hz), gap = hyp(b.x - ex, b.z - ez) - CFG.coverR;
        c.seekT += dts; b.yaw += clamp(angD(Math.atan2(cv.x - b.x, cv.z - b.z), b.yaw), -3 * dts, 3 * dts);
        if (gap <= RK.grabReach || c.seekT > RK.seekMax) {
          if (gap > RK.grabReach + 1.5) { startToss(c); return }   // 走不到：直接抠一块石头扔
          c.phase = 'pick'; c.hideBar = false; c.t = 0; c.dur = RK.grabT; b.interruptible = true; setAnim('grab', 1); b.yaw = Math.atan2(cv.x - b.x, cv.z - b.z); b.look = { x: cv.x, z: cv.z };
          E('cast', { k: 'grab', dur: RK.grabT, ult: false, name: '抓掩体', pick: cv.id }); return }
        const sp = (st.half ? RK.walkHalf : RK.walk) * dts, wy = Math.atan2(cv.x - b.x, cv.z - b.z);
        b.x += Math.sin(wy) * sp; b.z += Math.cos(wy) * sp; push(b, CFG.coverR); if (b.anim !== (st.half ? 'walk_fast' : 'walk')) setAnim(st.half ? 'walk_fast' : 'walk', 1);
        b.ts = (st.half ? RK.walkHalf : RK.walk) / ((st.half ? ROCK_ANIM.walk_fast.speed : ROCK_ANIM.walk.speed) * ROCK_K); return }
      if (c.k === 'grab' && c.phase === 'pick') { if (c.t >= c.dur) { c.held = c.cv; coverGone(c.cv, 'grab'); startToss(c) } return }
      if (c.k === 'sweep' || c.k === 'throw') { if (c.t < c.dur * 0.6) { b.yaw += clamp(angD(Math.atan2(dx, dz), b.yaw), -2 * dts, 2 * dts); if (c.k === 'sweep') c.ws[0].yaw = b.yaw } }
      if (c.k === 'pillars' && c.ws[0]) c.ws[0].cast = c;
      if (!c.launched && ((c.k === 'grab' && c.phase === 'toss') || c.k === 'throw') && c.t >= c.dur - (c.k === 'throw' ? RK.throwFly : RK.tossFly)) { c.launched = true;   /* 出手：画面上东西飞过去，填满时落地 */
        if (c.k === 'throw') E('throwGo', { x: c.ws[0].x, z: c.ws[0].z, fly: RK.throwFly, id: c.ws[0].id }); else E('tossGo', { cv: c.held || null, pts: c.ws.map(w => ({ x: w.x, z: w.z, id: w.id })), fly: RK.tossFly }) }
      if (c.t >= c.dur) { b.cast = null;
        const rec = { sweep: 0.9, throw: 0.8, grab: 0.9, roll: 1.2, pillars: 1.0, rift: 1.2, ava: 1.0 }[c.k];
        if (c.k === 'ava') { hurtPlayer(RK.quake, 'quake', true); E('quake');   /* 设计 106：山崩起手「地动」：砸地那一下全场伤害（躲不掉、翻滚无敌也挡不住） */
          st.rain = { t: 0, wave: 0, kept: 0 }; b.armorT = RK.rainT; E('rainStart', { t: RK.rainT }) }
        b.act = 'recover'; b.at = rec; b.lastK = c.k }
      return }
    /* 追人（设计 83 的格子找路，掩体变了就重建） */
    b.look = 'p';
    b.skillT -= dts;
    const near = b.near ? d < RK.near + 0.4 : d < RK.near; b.near = near;
    if (!near) { const lim = ARENA.x1 - CFG.coverR - 0.6; b.direct = segHit(b.x, b.z, P.x, P.z, CFG.coverR * (b.direct ? 0.7 : 1.0)) === null;
      const go = b.direct ? { x: clamp(P.x, -lim, lim), z: P.z } : navNext(b, dts), wy = Math.atan2(go.x - b.x, go.z - b.z), td = angD(wy, b.yaw);
      b.yaw += clamp(td, -2.2 * dts, 2.2 * dts);
      if (!go.end) { const v = (st.half ? RK.walkHalf : RK.walk) * (b.slowHit > 0 ? 1 - hero.slow : 1), face = Math.max(0.25, Math.cos(Math.min(Math.abs(td), Math.PI / 2)));
        b.x += Math.sin(b.yaw) * v * dts * face; b.z += Math.cos(b.yaw) * v * dts * face; push(b, CFG.coverR);
        const wa = st.half ? 'walk_fast' : 'walk'; if (b.anim !== wa) setAnim(wa, 1); b.ts = v / ((st.half ? ROCK_ANIM.walk_fast.speed : ROCK_ANIM.walk.speed) * ROCK_K) }
      else if (b.anim !== 'idle') setAnim('idle') }
    else { b.yaw += clamp(angD(Math.atan2(dx, dz), b.yaw), -2.5 * dts, 2.5 * dts); if (b.anim !== 'idle') setAnim('idle') }
    if (b.calm > 0) { b.calm -= dts; return }   /* 安静时间：照样走、头看着主角，不出招 */
    if (b.skillT <= 0 && !st.rain) { const o = st.half ? RK.orderHalf : RK.order; if (st.half && !b.halfO) { b.halfO = true; b.oi = 1 }   /* 半血换成 8 招一轮，从地裂开始（不会连着两次抓掩体） */ const k = o[b.oi % o.length]; b.oi++; b.skillT = st.rage ? RK.gapRage : RK.gap; rockCast(k); return }
    /* 设计 103：普攻冷却 2.5 秒；离下一个大技能不到 2.5 秒不放（落石雨期间不算大技能） */
    if (b.basicCd <= 0 && (st.rain || b.skillT > RK.basicGuard)) { if (d < RK.sweepR - 0.3) { b.basicCd = RK.basicCd; rockCast('sweep') } else if (d < 16) { b.basicCd = RK.basicCd; rockCast('throw') } }
  }
  /* ---------- 小丧尸 ---------- */
  function mobStep(dt) {
    for (const m of st.mobs) {
      if (m.dead) { m.deadT += dt; continue }
      if (m.pus) continue;   // 设计 81：脓包不走（毒囊那边管）
      if (m.rise > 0) { m.rise -= dt; continue }
      if (m.stun > 0) { m.stun -= dt; continue }
      const dx = P.x - m.x, dz = P.z - m.z, d = hyp(dx, dz); m.yaw = Math.atan2(dx, dz); m.cd -= dt;
      if (m.wind > 0) { m.wind -= dt; if (m.wind <= 0) { m.cd = 0.9; if (d < 1.35) hurtPlayer(P.max * CFG.mobHit, 'mob') } continue }   // 抬手 0.45 秒，走开就打空
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
    /* 设计 110：眩晕——不能走、开枪、放技能（包括翻滚）；禁锢——不能走，能开枪、放技能，翻滚能解除 */
    if (P.stunImm > 0) P.stunImm -= dt;
    if (P.stunT > 0) { P.stunT -= dt; inp = {} }
    if (P.rootT > 0) { P.rootT -= dt; if (inp.skill !== 'roll' || !(P.charges > 0) || P.roll) inp = { ...inp, mx: 0, mz: 0 } }
    /* 技能 */
    const s = inp.skill;
    if (s === 'roll' && P.charges > 0 && !P.roll) {
      /* 设计 79：方向 = 这一帧的摇杆；没推就用最近 0.3 秒里最后一次推的方向（iPhone 两根手指时摇杆可能被系统清零一下）；都没有才往面朝的反方向 */
      let ax = inp.mx || 0, az = inp.mz || 0, src = 'joy';
      if (hyp(ax, az) < 0.2) { if (st.lastMv && st.clk - st.lastMv.t <= 0.3 + 1e-6) { ax = st.lastMv.x; az = st.lastMv.z; src = 'recent' } else { ax = -Math.sin(P.yaw); az = -Math.cos(P.yaw); src = 'back' } }
      const l = hyp(ax, az); ax /= l; az /= l; st.lastRoll = { ax, az, src, t: st.t, age: st.lastMv ? +(st.clk - st.lastMv.t).toFixed(2) : null };
      P.rootT = 0; P.roll = { ax, az, t: 0 }; P.inv = SKILLS.roll.inv; P.charges--; if (P.cd.roll <= 0) P.cd.roll = cdOf('roll'); P.yaw = Math.atan2(ax, az); E('roll', { ax, az });
    }
    if (s === 'focus' && !pre && P.cd.focus <= 0 && !Bo.dead && hyp(Bo.x - P.x, Bo.z - P.z) < hero.range + 4) { P.focus = SKILLS.focus.shots; P.focusT = 0; P.cd.focus = cdOf('focus'); E('focus') }
    if (s === 'stun' && !pre && P.cd.stun <= 0 && !Bo.dead && hyp(Bo.x - P.x, Bo.z - P.z) < hero.range + 4) {
      P.cd.stun = cdOf('stun'); const dur = SKILLS.stun.stun(sk('stun'));
      if (Bo.cast && Bo.interruptible) { if (Bo.cast.cancel) Bo.cast.cancel(); else st.warns.splice(st.warns.indexOf(Bo.cast.w), 1); E('interrupt', { k: Bo.cast.k }); Bo.cast = null; Bo.act = 'stun'; Bo.at = dur; Bo.look = null; if (ROCK) setAnim('stagger', ROCK_ANIM.stagger.T / Math.max(0.8, dur)); else setAnim('hit', 0.35); st.stats.interrupts++ }
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
    /* 回血：5 秒没挨打后慢慢回（设计 101）；拾荒者 4 件：挨打后 3 秒内回 10%，每 15 秒一次 */
    if (P.s1cd > 0) P.s1cd -= dt;
    if (P.hurtT > CFG.regenDelay) P.hp = Math.min(P.max, P.hp + P.max * CFG.regen * dt);
    if (P.regen10 > 0) { P.regen10 -= dt; P.hp = Math.min(P.max, P.hp + P.max * 0.1 / 3 * dt) }
    bossStep(dt); mobStep(dt);
    for (const e of st.ev) if (e.e === 'knock' && !P.dead) P.kb = { x: e.x, z: e.z };
    for (const w of st.warns) if (w !== (Bo.cast && Bo.cast.w)) w.t += dt;
    return st;
  }
  st.step = step; st.cdOf = cdOf; st.forceCast = k => { Bo.act = TOX ? 'idle' : 'chase'; Bo.cast = null; if (!TOX) st.warns.length = 0; const keep = st.ev; st.ev = []; if (TOX) toxCast(k); else if (ROCK) { Bo.calm = 0; rockCast(k) } else startCast(k); st.pend = st.ev; st.ev = keep };   // 截图、测试用
  st.clearCovers = () => { if (!ROCK) return; const keep = st.ev; st.ev = st.pend || []; for (const c of realCovers()) coverGone(c, 'crumble'); st.pend = st.ev; st.ev = keep }; st.coverN = () => realCovers().length;   /* 设计 110：测试用（掩体扔光） */
  st.killPlayer = () => { if (st.over) return; const keep = st.ev; st.ev = []; P.hp = 0; P.dead = true; end(false); st.pend = st.ev; st.ev = keep };   /* 设计 109：测试用（打输） */
  st.killBoss = () => { if (st.over) return; const keep = st.ev; st.ev = []; Bo.hp = 0; bossDie(); st.pend = st.ev; st.ev = keep };   /* 设计 74：测试用（打赢） */
  return st;
}
