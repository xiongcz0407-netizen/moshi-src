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
  /* 设计 114：第 4 关尖啸者 · 废弃广播电台楼顶。宽 14、长 32；南边楼梯间小屋（门朝北，主角从门里出来），北边带信号塔的小屋。
     BOSS 远程、到处闪现、不追人，不锁战斗区。4 个掩体（空调外机、弯管道、圆水箱、配电箱）分散在中段；4 根立杆喇叭在四角（不挡人、不挡子弹，能打坏） */
  4: { arena: { x0: -7, x1: 7, z0: -13, z1: 19, start: { x: 0, z: 17.6 }, boss: { x: 0, z: -9.5 } }, bossR: 0.9, hitY: 2.2,
    covers: [{ k: 'ac', x: -4.0, z: 5.0, hx: 0.86, hz: 0.44 }, { k: 'pipe', x: 3.7, z: -1.8, hx: 0.84, hz: 0.47 }, { k: 'tank', x: -3.6, z: -5.2, hx: 0.68, hz: 0.91 }, { k: 'box', x: 3.9, z: 8.2, hx: 0.64, hz: 0.53 }],   /* 114B 的模型按 4.8 倍缩（空调 1.3 米高、水箱 1.9 米高），挡的框跟模型一样大 */
    speakers: [{ x: -6.3, z: -12.3 }, { x: 6.3, z: -12.3 }, { x: 6.3, z: 8 }, { x: -6.3, z: 8 }] },   /* 顺时针（从上往下看）：西北 → 东北 → 东南 → 西南。设计 114c：南边两根从 z 18.3 挪到 z 8（两边墙根），原来在右下角按钮底下 */
  /* 设计 116：第 5 关装甲暴君 · 废弃军事实验室。宽 14、长 32；南边被炸开的防爆门（主角从门里进来），北边碎大培养舱（BOSS 从里面出来）。
     BOSS 纯远程、走得慢，不锁战斗区。4 个掩体（翻倒手推车、弹药箱堆、断培养舱底座、倒下的金属柜）；4 个能量柱插座（护盾时升柱） */
  5: { arena: { x0: -7, x1: 7, z0: -13, z1: 19, start: { x: 0, z: 17.6 }, boss: { x: 0, z: -9.5 } }, bossR: 1.3, hitY: 3.0,
    covers: [{ k: 'cart', x: -4.0, z: 5.4, hx: 0.95, hz: 0.6 }, { k: 'ammo', x: 3.9, z: -1.6, hx: 0.8, hz: 0.75 }, { k: 'base', x: -3.7, z: -5.4, hx: 0.85, hz: 0.85 }, { k: 'cabinet', x: 3.8, z: 8.6, hx: 0.75, hz: 0.64 }],   /* 116B：挡的框按模型宽深比（倒下的金属柜 0.33 × 0.28） */
    sockets: [{ x: -4.6, z: -9.6 }, { x: 4.6, z: -9.6 }, { x: -5.2, z: 1.6 }, { x: 5.2, z: 4.6 }] },
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
/* 设计 114：尖啸者（第 4 关）的数。普通技能 = BOSSES[4].dmg（380），大招 = ult（640）。招式表见设计114 第 4 节。
   不要动的手感数：错乱 2 秒（confT）、喷射预警 0.55 秒（pushWarn）、落点黑影 0.3 秒（shadowT） */
export const SCREAM_K = 3.4;   // BOSS 高约 3.4 米（主角 1.8 倍）：模型按包围盒高度缩到这么高
export const SCREAM_CFG = {
  far: [7, 11], walk: 1.0, near: 4,
  boltW: 1, boltWarn: 0.7, boltFly: 0.3, boltK: 0.5, bolt3K: 0.4, bolt3A: 20 * Math.PI / 180, boltGap: 1.6, boltGapRage: 1.12, boltGuard: 1.0,
  blinkEvery: [4, 6], blinkEveryRage: [2.5, 3.5], blinkB: 0.4, blinkBRage: 0.5, vanishT: 0.25, shadowT: 0.3, appearT: 0.3, blinkA: [6, 10], blinkCd: 1.0,
  pushR: 4, pushA: 70 * Math.PI / 180, pushWarn: 0.55, pushK: 1.1, pushGap: 2,
  ringCast: 1.0, ringN: 3, ringGap: 0.6, ringSpd: 7, ringW: 0.9, ringHole: 50 * Math.PI / 180, ringHoleRage: 35 * Math.PI / 180, ringK: 1.1,
  hornWarn: 1.4, hornR: 11, hornA: 60 * Math.PI / 180, hornK: 1.2, hornPush: 3, hornWallK: 0.3,
  flockWarn: 1.3, flockW: 4, flockK: 1.0, crowN: 3, crowHp: 0.004, crowDps: 0.08, crowR: 1.0, crowSpd: 3.2,
  shriekWarn: 1.5, shriek: 90, confT: 2, confImm: 2,   /* 必吃伤害（躲不掉），fbsim 定；错乱结束后 2 秒内不再错乱 */
  bombCast: 2.0, bombGap: 0.8, bombWarn: 1.0, bombRingK: 0.6, towerY: 2.6, tower: { x: 0, z: -13.2 },   /* 设计 114c：广播轰炸时站在塔小屋的屋檐上（原来 4 米高、塔前 -14.2，跑出画面上面看不到脸） */
  spkHp: 0.02, rageK: 1.25,
  calm: 1.8, first: 3, gap: 6, gapRage: 5,
  order: ['rings', 'flock', 'horn', 'shriek', 'rings', 'horn', 'bomb', 'flock'],
};
/* 尖啸者动作的时间（screamer.glb，114B 的 tools/scream_rig 导出；hit = 出手 / 推到最前 / 叫到最响那一刻）。名字照设计114 第 2 节 */
export const SCREAM_ANIM = { idle: { T: 2.4, loop: 1 }, walk: { T: 1.2, loop: 1, speed: 0.119 }, throw: { T: 0.9, hit: 0.5 }, push: { T: 0.8, hit: 0.45 }, spread: { T: 1.4, hit: 1.0 },
  scream: { T: 1.6, hit: 1.2 }, horn: { T: 1.4, hit: 1.2 }, vanish: { T: 0.25 }, appear: { T: 0.3 }, rage: { T: 1.8 }, hit: { T: 0.4 }, stagger: { T: 0.7 }, die: { T: 2.0, hit: 1.55 } };   /* walk.speed：114B 给的 0.134 模型单位 / 秒 × 缩放（3.4 / 1.13）÷ SCREAM_K */
/* 设计 116：装甲暴君（第 5 关）的数。普通技能 = BOSSES[5].dmg，大招 = ult。招式表见设计116 第 4 节。
   不要动的手感数：安静 1.2 秒（calm）、封锁 3 秒（lockT）、牵引 1.2 秒（pullT）、霰弹炮预警 0.5 秒（shotWarn）、网格两段间隔 0.6 秒（gridGap）、地毯两波间隔 0.8 秒（carpetGap） */
export const TYRANT_K = 4.5;   // BOSS 高约 4.5 米（主角 2.5 倍）：模型按包围盒高度缩到这么高
export const TYRANT_CFG = {
  walk: 0.9, walkHalf: 1.3, walkFrom: 9,
  gunN: 3, gunN2: 5, gunR: 1, gunGap: 0.3, gunWarn: 0.6, gunK: 0.35, gunEvery: 1.6, gunGuard: 1.2, kneelGun: 2,
  laserWarn: 1.2, laserLen: 16, laserW: 0.8, laserT: 2.0, laserT2: 2.0, laserK: 1.0,
  missN: 5, missR: 1.6, missGap: 0.35, missWarn: 1.0, missK: 0.8, missFireT: 3, fireK: 0.15,
  gridWarn: 1.4, gridGap: 0.6, gridW: 0.8, gridCell: 2.5, gridK: 0.9,
  carpetWarn: 1.6, carpetGap: 0.8, carpetStep: 2.0, carpetR: 1.15, carpetSafe: 3, carpetSafeR: 1.7, carpetMove: 5, carpetK: 0.8, carpetFireP: 0.15, carpetFireT: 2,
  pylonHp: 0.02, shieldDr: 0.8, arcK: 0.3, arcW: 0.6, breakT: 2, breakK: 1.3, shieldMax: 25,
  pullWarn: 1.0, pullR: 4, pullT: 1.2, pullSpd: 9, pullStop: 1.8, shotWarn: 0.5, shotR: 5, shotA: Math.PI / 2, shotK: 1.4, shotPush: 3,
  empWarn: 1.5, emp: 110, lockT: 3, lockImm: 3,
  cannonWarn: 3.0, cannonLen: 34, cannonW: 1.6, cannonTurn: 0.42, meltT: 4, meltK: 0.2,
  halfDr: -0.15, calm: 1.2, first: 3, gap: 5, gapHalf: 4.5,
  order: ['grid', 'missile', 'laser', 'pull', 'carpet', 'shield', 'emp', 'grid', 'cannon'],
};
/* 装甲暴君动作的时间（tyrant.glb，116B 的 tools/tyrant_rig 导出）。名字照设计116 第 2 节 */
export const TYRANT_ANIM = { idle: { T: 2.4, loop: 1 }, walk: { T: 1.4, loop: 1, speed: 0.126 }, fire: { T: 0.9, loop: 1 }, sweep: { T: 2.0 }, missile: { T: 1.0, hit: 0.6 }, carpet: { T: 1.6, hit: 1.2 }, grid: { T: 1.2, hit: 1.0 },
  kneel: { T: 0.8 }, kneel_loop: { T: 2.0, loop: 1 }, shield_break: { T: 2.0 }, pull: { T: 1.2 }, shotgun: { T: 0.9, hit: 0.45 }, emp: { T: 1.5, hit: 1.3 }, charge: { T: 1.0, loop: 1 }, cannon: { T: 1.0, hit: 0.2 },
  armor_break: { T: 1.6, hit: 0.5 }, hit: { T: 0.4 }, stagger: { T: 0.7 }, die: { T: 2.4, hit: 1.85 } };   /* walk.speed：116B 给的 0.134 模型单位 / 秒 × 缩放（4.5 / 1.06）÷ TYRANT_K */
export const TYRANT_NAME = { laser: '旋转激光', missile: '导弹齐射', grid: '激光网格（全场）', carpet: '地毯轰炸（全场）', shield: '能量护盾', pull: '电磁牵引', shotgun: '贴脸霰弹炮', emp: '电磁脉冲（全场）', cannon: '过载主炮（大招）' };
export const SCREAM_NAME = { bolt: '鸦弹', push: '鸦群喷射', rings: '声波三环', horn: '喇叭音爆', flock: '乌鸦群', shriek: '刺耳尖叫（全场）', bomb: '广播轰炸（大招）' };
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
  if (w.type === 'ring') { const d = hyp(dx, dz); if (Math.abs(d - w.r) > w.w / 2 + r) return false; return !(w.hole > 0 && Math.abs(angD(Math.atan2(dx, dz), w.ga)) < w.hole / 2 - Math.atan2(r, Math.max(d, 0.5))) }   // 设计 114：声波圆环（带缺口）
  if (w.type === 'field') return x > w.x0 - r && x < w.x1 + r && z > w.z0 - r && z < w.z1 + r && !w.sh.some(q => x > q.x0 + 0.25 && x < q.x1 - 0.25 && z > q.z0 + 0.1 && z < q.z1 - 0.25);   // 设计 110：全场滚石——整片危险，掩体南边的影子安全
  return false;
}

export function createFight(n, hero, opt = {}) {
  const SG = setStage(n), BR = SG.bossR, TOX = n === 2, ROCK = n === 3, SCR = n === 4, TYR = n === 5;   /* 设计 116：第 5 关装甲暴君 */   /* 设计 114：第 4 关尖啸者 */   /* 设计 81：第 2 关毒囊（不走动，在北边崖下） */
  const B = BOSSES[n], rnd = opt.rng || Math.random, warnT = FB.warn(n);
  const st = {
    n, t: 0, clk: 0, locked: SG.lockZ == null, lockZ: SG.lockZ ?? null, over: 0, win: false, rage: false, ev: [], warns: [], mobs: [], shots: [], nades: [], nid: 1, pools: [], zones: [], hazards: [], moveK: 1, half: false, shrink: 0, bossR: BR, hitY: SG.hitY,
    boss: { x: ARENA.boss.x, z: ARENA.boss.z, yaw: 0, look: null, hp: B.hp, max: B.hp, act: 'wait', at: 0, anim: 'idle', ts: 1, animId: 0, cast: null, stun: 0, slow: 0, swingCd: 3, skillT: CFG.firstSkill, summonT: 0, oi: 0, bleed: 0, bleedDps: 0, dead: false, interruptible: false },
    player: { x: ARENA.start.x, z: ARENA.start.z, yaw: Math.PI, hp: hero.hp, max: hero.hp, inv: 0, hurtT: 99, roll: null, cd: { focus: 0, roll: 0, stun: 0, nade: 0 }, charges: SKILLS.roll.charges(hero.sk.roll), focus: 0, focusT: 0, shotT: 0, aim: null, regen10: 0, s1cd: 0, firing: false, target: null, dead: false },
    stats: { shots: 0, dmg: 0, taken: 0, hits: 0, casts: {}, interrupts: 0, mobsKilled: 0 },
    hero,
  };
  const E = (e, o = {}) => st.ev.push({ e, ...o });
  const bossDmg = ult => (ult ? B.ult : B.dmg) * (SCR && st.half ? SCREAM_CFG.rageK : 1);   /* 设计 106：狂暴不再加伤害（改成灭杀）。设计 114：尖啸者半血嗜血 ×1.25 */
  const wdur = base => base;
  const setAnim = (a, ts = 1) => { const b = st.boss; b.anim = a; b.ts = ts; b.animId++; E('anim', { a, ts }) };
  const sk = k => hero.sk[k] || 1;
  const cdOf = k => { if (k === 'nade') return hero.nadeCd || 10; let c = SKILLS[k].cd(sk(k)) * (1 - hero.cdr); if (k === 'focus' && hero.s2four) c *= 0.7; return c };
  const P = st.player, Bo = st.boss;
  if (TOX) { Bo.act = 'idle'; Bo.skillT = TOX_CFG.first; Bo.look = 'p' }
  if (ROCK) { Bo.act = 'wait'; Bo.skillT = ROCK_CFG.first; Bo.look = 'p'; Bo.basicCd = 1.5; st.balls = []; st.rifts = []; st.rain = null; st.coverVer = 0 }
  if (SCR) { const SC0 = SCREAM_CFG; Bo.act = 'wait'; Bo.skillT = SC0.first; Bo.look = 'p'; Bo.basicCd = 1.2; Bo.blinkT = SC0.blinkEvery[0]; Bo.blinkCd = 0; Bo.y = 0; Bo.hidden = false; st.rings = []; st.bombQ = [];
    st.speakers = SG.speakers.map((q, i) => ({ id: 'spk' + i, i, spk: true, x: q.x, z: q.z, yaw: Math.atan2(-q.x, (ARENA.z0 + ARENA.z1) / 2 - q.z), hp: B.hp * SC0.spkHp, max: B.hp * SC0.spkHp, dead: false }));
    Object.assign(st.stats, { conf: 0, pushHit: 0, hornHit: 0, spkKill: 0, blinkA: 0, blinkB: 0 }) }
  if (TYR) { Bo.act = 'wait'; Bo.skillT = TYRANT_CFG.first; Bo.look = 'p'; Bo.gunCd = 1.2; st.queue = []; st.fires = []; st.melts = []; st.beam = null; st.pull = null; st.pylons = null; st.coverVer = 0 }
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
    if (tg === Bo) { if (Bo.dead) return; if (st.rage) { if (!(st.immT > 0)) { st.immT = 1; E('immune') } return }   /* 设计 106b：灭杀一开始 BOSS 无敌，不掉血（「免疫」字 1 秒最多一次） */ if (Bo.armorT > 0) dmg *= ROCK_CFG.armor; if (TYR) { if (Bo.shield) dmg *= 1 - TYRANT_CFG.shieldDr; if (Bo.vuln > 0) dmg *= TYRANT_CFG.breakK; if (st.half) dmg *= 1 - TYRANT_CFG.halfDr }   /* 设计 116：护盾 −80%、破盾瘫着 +30%、破甲后 +15% */ Bo.hp -= dmg; st.stats.dmg += dmg; if (hero.bleed) { Bo.bleed = 3; Bo.bleedDps = Math.max(Bo.bleedDps, dmg * 0.1) } if (hero.slow) Bo.slowHit = 1.5;
      E('hit', { who: 'boss', a: Math.round(dmg), crit, kind }); if (Bo.hp <= 0) { Bo.hp = 0; bossDie() } }
    else if (tg.spk) { if (tg.dead) return; tg.hp -= dmg; E('hit', { who: 'spk', m: tg, a: Math.round(dmg), crit }); if (tg.hp <= 0) { tg.hp = 0; tg.dead = true; st.stats.spkKill++; E('spkDie', { s: tg }) } }   /* 设计 114：喇叭 */
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
    Bo.dead = true; Bo.cast = null; st.warns.length = 0; Bo.act = 'dead'; if (SCR) { Bo.hidden = false; Bo.y = 0; Bo.onTower = false; st.rings.length = 0; st.bombQ.length = 0 } if (TYR) tyRage(); if (!TOX) Bo.yaw = fallYaw(Bo); Bo.look = null; setAnim('die');
    for (const m of st.mobs) if (!m.dead) { m.dead = true; m.deadT = 0; E('mobDie', { m }) }
    E('bossDie'); end(true);
  }
  function end(win) { if (st.over) return; st.over = st.t || 0.01; st.win = win; E(win ? 'win' : 'lose') }

  /* ---------- 主角开枪 ---------- */
  /* 设计 64：目标粘一会儿——锁上的目标出了射程，再多 1.5 米或 0.5 秒才放；小丧尸和 BOSS 之间换目标至少隔 0.4 秒。
     返回 { tg（瞄着谁，脸朝它）, shoot（真的在射程里、可以开枪） } */
  const inRange = (t, extra = 0) => !t || (t === Bo ? Bo.dead || Bo.hidden : t.dead) ? false : t === Bo ? hyp(Bo.x - P.x, Bo.z - P.z) < hero.range + BR + extra : hyp(t.x - P.x, t.z - P.z) < hero.range + extra && (extra > 0 || segHit(P.x, P.z, t.x, t.z, 0, true) === null);
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
    if (!Bo.dead && !Bo.hidden && hyp(Bo.x - P.x, Bo.z - P.z) < rng + BR) return Bo;
    /* 设计 114：BOSS 不在射程里（或闪走了）时，顺手打射程里没坏的喇叭 */
    if (st.speakers) { let sp = null, sd = 1e9; for (const q of st.speakers) { if (q.dead) continue; const d = hyp(q.x - P.x, q.z - P.z); if (d < rng && d < sd && segHit(P.x, P.z, q.x, q.z, 0, true) === null) { sp = q; sd = d } } if (sp) return sp }
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
      st.rage = true; if (SCR) screamRage(); if (TYR) tyRage(); if (st.rain) { st.rain = null; E('rainEnd') } Bo.armorT = 0; if (Bo.cast && Bo.cast.cancel) Bo.cast.cancel(); Bo.cast = null; st.warns.length = 0; Bo.interruptible = false; Bo.calm = 0; Bo.look = 'p';
      st.doom = { n: 0, t: 0, ph: 'cast' }; E('rage'); doomCast(); return true }
    const D = st.doom; D.t += dt; if (st.immT > 0) st.immT -= dt; if (Bo.cast) Bo.cast.t = D.ph === 'cast' ? D.t : Bo.cast.t;
    if (D.ph === 'cast' && D.t >= FB.doom.cast) { D.n++; D.ph = 'wait'; D.t = 0; Bo.cast = null; Bo.act = 'doomWait'; E('doomHit', { n: D.n });
      if (!P.dead && !st.over && !P.god) { const a = D.n >= 2 ? P.hp : Math.min(P.hp, Math.round(P.max * FB.doom.k)); P.hp -= a; P.hurtT = 0; st.stats.taken += a; E('pdmg', { a, src: 'doom' }); if (D.n >= 2 || P.hp <= 0) { P.hp = 0; P.dead = true; end(false) } } }
    else if (D.ph === 'wait' && D.t >= FB.doom.gap - FB.doom.cast) { D.ph = 'cast'; D.t = 0; doomCast() }
    return true;
  }
  function doomCast() { Bo.act = 'doom'; Bo.interruptible = false; Bo.cast = { k: 'doom', t: 0, dur: FB.doom.cast, ws: [], w: { ult: true }, doom: true }; Bo.yaw = Math.atan2(P.x - Bo.x, P.z - Bo.z);
    setAnim(TOX ? 'enrage' : ROCK ? 'roar' : SCR ? 'scream' : TYR ? 'charge' : 'enrage', ROCK ? ROCK_ANIM.roar.hit / FB.doom.cast : SCR ? SCREAM_ANIM.scream.hit / FB.doom.cast : 1); E('cast', { k: 'doom', dur: FB.doom.cast, ult: true, name: '灭杀（全场）' }) }
  function bossStep(dt) {
    if (doomStep(dt)) { if (SCR) screamHazards(dt); if (TYR) tyHazards(dt); return }
    if (TOX) { toxStep(dt); return }
    if (ROCK) { rockStep(dt); return }
    if (SCR) { screamStep(dt); return }
    if (TYR) { tyStep(dt); return }
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
  /* ---------- 设计 114：尖啸者（第 4 关）。远程、到处闪现、不追人；技能之间至少安静 1.8 秒；大技能 6 秒一招，只在闲着（含安静）时倒数 ---------- */
  const SC = SCREAM_CFG;
  const swarn = (w, k, dur) => { w.id = st.nid++; w.k = k; w.t = 0; w.dur = dur; st.warns.push(w); return w };
  const okSpot = (x, z) => x > ARENA.x0 + 1 && x < ARENA.x1 - 1 && z > ARENA.z0 + 1 && z < ARENA.z1 - 1 && !inCover(x, z, 0.9) && !(st.speakers || []).some(q => hyp(q.x - x, q.z - z) < 1.3);
  /* 闪现落点。A：离主角 6～10 米，尽量在主角北边（镜头往北看，脸在画面里）；B：主角身前 2 米（朝 BOSS 原来那边，偏北） */
  function blinkSpot(kind) {
    if (kind === 'B') { let a0 = Math.atan2(Bo.x - P.x, Bo.z - P.z); if (Math.cos(a0) > -0.2) a0 = Math.PI;   // 原来那边偏南：改成正北
      for (let i = 0; i < 13; i++) { const a = a0 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.35, x = P.x + Math.sin(a) * SC.pushGap, z = P.z + Math.cos(a) * SC.pushGap; if (okSpot(x, z)) return { x, z } }
      return null }
    let best = null, bs = -1e9;
    for (let i = 0; i < 40; i++) { const a = Math.PI + (rnd() - 0.5) * 1.9, r = SC.blinkA[0] + rnd() * (SC.blinkA[1] - SC.blinkA[0]), x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r;
      if (!okSpot(x, z)) continue; const sc = -Math.abs(x) * 0.15 - hyp(x - Bo.x, z - Bo.z) * 0.02 + rnd(); if (sc > bs) { bs = sc; best = { x, z } } }
    if (!best) for (let i = 0; i < 60 && !best; i++) { const x = ARENA.x0 + 1 + rnd() * (ARENA.x1 - ARENA.x0 - 2), z = ARENA.z0 + 1 + rnd() * (ARENA.z1 - ARENA.z0 - 2); if (okSpot(x, z) && hyp(x - P.x, z - P.z) > 5) best = { x, z } }
    return best || { x: ARENA.boss.x, z: ARENA.boss.z };
  }
  function startBlink(kind, after = null) {
    const q = blinkSpot(kind); if (!q) { if (after === 'push') kind = 'A'; else return false }
    const to = q || blinkSpot('A'); if (Bo.cast && Bo.cast.cancel) Bo.cast.cancel(); Bo.cast = null;
    Bo.act = 'blink'; Bo.blink = { t: 0, kind, x0: Bo.x, z0: Bo.z, x1: to.x, z1: to.z, after: kind === 'B' ? 'push' : null }; Bo.interruptible = false; Bo.look = null;
    st.stats['blink' + kind]++; setAnim('vanish', SCREAM_ANIM.vanish.T / SC.vanishT);
    E('blinkOut', { x: Bo.x, z: Bo.z, y: Bo.y || 0 }); E('blinkMark', { x: to.x, z: to.z, dur: SC.shadowT, kind }); Bo.blinkCd = SC.blinkCd; return true;
  }
  function screamCast(k) {
    if (k === 'horn' && !st.speakers.some(q => !q.dead)) k = 'rings';   /* 喇叭全坏了：喇叭音爆换成声波三环 */
    const b = Bo, c = { k, t: 0, ws: [], w: { ult: k === 'bomb' } }, dx = P.x - b.x, dz = P.z - b.z, d = hyp(dx, dz);
    st.stats.casts[k] = (st.stats.casts[k] || 0) + 1; b.yaw = Math.atan2(dx, dz); b.look = 'p';
    c.cancel = () => { for (const w of c.ws) { const i = st.warns.indexOf(w); if (i >= 0) st.warns.splice(i, 1) } };
    if (k === 'bolt') { c.dur = SC.boltWarn; c.hideBar = true; const n = st.half ? 3 : 1;
      for (let i = 0; i < n; i++) { const yaw = b.yaw + (n > 1 ? (i - 1) * SC.bolt3A : 0); c.ws.push(swarn({ type: 'line', x: b.x, z: b.z, yaw, len: Math.min(d + 1.5, 18), w: SC.boltW, n }, 'bolt', c.dur)) }
      setAnim('throw', SCREAM_ANIM.throw.hit / Math.max(0.2, c.dur - SC.boltFly)) }
    else if (k === 'push') { c.dur = SC.pushWarn; c.ws.push(swarn({ type: 'fan', x: b.x, z: b.z, yaw: b.yaw, r: SC.pushR, r0: 0.4, a: SC.pushA }, 'push', c.dur)); setAnim('push', SCREAM_ANIM.push.hit / c.dur) }
    else if (k === 'rings') { c.dur = SC.ringCast; setAnim('scream', SCREAM_ANIM.scream.hit / c.dur);
      /* 3 道环一开始就定好缺口（读条时地上就看得到）：第 1 道在主角那边偏一点，后面每道往同一边挪 26～34°（缺口 50°，前后两道的缺口有一点重叠），要跟着走 */
      const pa = Math.atan2(dx, dz); const sg = rnd() < 0.5 ? -1 : 1; let ga = pa - sg * (0.15 + rnd() * 0.3);
      for (let i = 0; i < SC.ringN; i++) { ringGo(b.x, b.z, SC.ringK, ga, -(SC.ringCast + i * SC.ringGap) * SC.ringSpd); ga += sg * (0.45 + rnd() * 0.15) } }
    else if (k === 'horn') { const live = st.speakers.filter(q => !q.dead);
      const sp = live.reduce((p, q) => hyp(q.x - P.x, q.z - P.z) < hyp(p.x - P.x, p.z - P.z) ? q : p); c.spk = sp; c.dur = SC.hornWarn;
      c.ws.push(swarn({ type: 'fan', x: sp.x, z: sp.z, yaw: Math.atan2(P.x - sp.x, P.z - sp.z), r: SC.hornR, r0: 0.5, a: SC.hornA, spk: sp.id }, 'horn', c.dur));
      b.yaw = Math.atan2(sp.x - b.x, sp.z - b.z); b.look = { x: sp.x, z: sp.z }; setAnim('horn', SCREAM_ANIM.horn.hit / c.dur); E('hornCharge', { s: sp, dur: c.dur }) }
    else if (k === 'flock') { c.dur = SC.flockWarn; const W = ARENA.x1 - ARENA.x0, sd = P.x > 0 ? -1 : 1, z = clamp(P.z, ARENA.z0 + SC.flockW / 2, ARENA.z1 - SC.flockW / 2);
      c.ws.push(swarn({ type: 'line', x: sd < 0 ? ARENA.x0 - 0.3 : ARENA.x1 + 0.3, z, yaw: sd < 0 ? Math.PI / 2 : -Math.PI / 2, len: W + 0.6, w: SC.flockW, sd }, 'flock', c.dur));
      if (st.half) { const x = clamp(P.x, ARENA.x0 + SC.flockW / 2, ARENA.x1 - SC.flockW / 2); c.ws.push(swarn({ type: 'line', x, z: ARENA.z0 - 0.3, yaw: 0, len: ARENA.z1 - ARENA.z0 + 0.6, w: SC.flockW, sd: 0 }, 'flock', c.dur)) }   // 嗜血：两条带交叉
      setAnim('spread', SCREAM_ANIM.spread.hit / c.dur) }
    else if (k === 'shriek') { c.dur = SC.shriekWarn; setAnim('scream', SCREAM_ANIM.scream.hit / c.dur) }
    else if (k === 'bomb') { c.dur = SC.bombCast; E('blinkOut', { x: b.x, z: b.z, y: b.y || 0 }); b.x = SC.tower.x; b.z = SC.tower.z; b.y = SC.towerY; b.yaw = Math.atan2(P.x - b.x, P.z - b.z); E('blinkIn', { x: b.x, z: b.z, y: b.y, tower: true });
      for (const q of st.speakers) if (!q.dead) E('hornCharge', { s: q, dur: c.dur }); setAnim('scream', SCREAM_ANIM.scream.hit / c.dur) }
    b.cast = c; b.act = 'cast'; b.interruptible = k === 'horn' || k === 'flock' || k === 'push';
    E('cast', { k, dur: c.dur, ult: k === 'bomb', name: SCREAM_NAME[k], hide: !!c.hideBar });
  }
  function ringGo(x, z, k, holeA = null, r0 = 0.3) {   /* 一道往外扩的声波圆环（缺口位置各不相同）。r0 < 0：还没出来（读条时先画缺口位置） */
    const ga = holeA != null ? holeA : rnd() * Math.PI * 2; const r = { id: st.nid++, type: 'ring', x, z, r: r0, w: SC.ringW, hole: st.half ? SC.ringHoleRage : SC.ringHole, ga, k, hit: false };
    st.rings.push(r); E('ringGo', { r }); return r }
  function hornBlast(sp, w, k) {   /* 喇叭音爆：扇形里扣血 + 往外推 3 米；推到女儿墙再撞一下 */
    E('hornBlast', { s: sp, w });
    if (!inWarn(w, P.x, P.z)) return;
    if (hurtPlayer(bossDmg(false) * k, 'horn') > 0 || P.inv <= 0) { st.stats.hornHit++; const ex = P.x - sp.x, ez = P.z - sp.z, el = hyp(ex, ez) || 1, ux = ex / el, uz = ez / el;
      const tx = P.x + ux * SC.hornPush, tz = P.z + uz * SC.hornPush, wall = tx < ARENA.x0 + 0.42 || tx > ARENA.x1 - 0.42 || tz < ARENA.z0 + 0.42 || tz > ARENA.z1 - 0.42;
      E('knock', { x: ux * SC.hornPush * 6, z: uz * SC.hornPush * 6 }); if (wall) { hurtPlayer(bossDmg(false) * SC.hornWallK, 'hornWall', false); E('wallBump', { x: clamp(tx, ARENA.x0, ARENA.x1), z: clamp(tz, ARENA.z0, ARENA.z1) }) } }
  }
  function screamRelease() {
    const b = Bo, c = b.cast; b.cast = null;
    for (const w of c.ws) { const i = st.warns.indexOf(w); if (i >= 0) st.warns.splice(i, 1) }
    let rec = 0.4;
    if (c.k === 'bolt') { for (const w of c.ws) {   /* 乌鸦沿直线飞：掩体能挡（撞上去散羽毛） */
        const len = hyp(P.x - w.x, P.z - w.z), t = segHit(w.x, w.z, w.x + Math.sin(w.yaw) * w.len, w.z + Math.cos(w.yaw) * w.len, 0, true), stop = t === null ? w.len : t * w.len;
        const hitP = inWarn(w, P.x, P.z) && stop >= len - 0.3; E('crowShot', { x: w.x, z: w.z, yaw: w.yaw, len: hitP ? len : stop, blocked: !hitP && t !== null, red: st.half });
        if (hitP) hurtPlayer(bossDmg(false) * (w.n > 1 ? SC.bolt3K : SC.boltK), 'bolt') }
      b.basicCd = st.half ? SC.boltGapRage : SC.boltGap; rec = 0.15 }
    else if (c.k === 'push') { const w = c.ws[0]; E('pushGo', { w, red: st.half }); if (inWarn(w, P.x, P.z) && hurtPlayer(bossDmg(false) * SC.pushK, 'push') > 0) st.stats.pushHit++; rec = 0.3; c.thenA = true }
    else if (c.k === 'rings') { E('screamFx', { x: b.x, z: b.z, y: b.y || 0 }); rec = 0.6 }
    else if (c.k === 'horn') { hornBlast(c.spk, c.ws[0], SC.hornK); rec = 0.5 }
    else if (c.k === 'flock') { for (const w of c.ws) { E('flockGo', { w, red: st.half }); if (inWarn(w, P.x, P.z)) hurtPlayer(bossDmg(false) * SC.flockK, 'flock') }
      for (let i = 0; i < SC.crowN; i++) { const a = i / SC.crowN * Math.PI * 2, m = { id: st.nid++, crow: true, x: P.x + Math.sin(a) * 2.5, z: P.z + Math.cos(a) * 2.5, a, yaw: 0, hp: B.hp * SC.crowHp, max: B.hp * SC.crowHp, rise: 0.4, stun: 0, cd: 0, dead: false, red: st.half }; st.mobs.push(m); E('mobSpawn', { m }) }
      rec = 0.5 }
    else if (c.k === 'shriek') { E('screamFx', { x: b.x, z: b.z, y: b.y || 0, shriek: true }); hurtPlayer(SC.shriek, 'shriek', true);
      if (!P.dead && !(P.confImm > 0)) { P.confT = SC.confT; P.confImm = SC.confT + SC.confImm; st.stats.conf++; E('pconf', { t: SC.confT }) }
      rec = 0.3; c.thenB = true }
    else if (c.k === 'bomb') { const live = st.speakers.filter(q => !q.dead);
      live.forEach((q, i) => st.bombQ.push({ t: i * SC.bombGap, f: () => { const w = swarn({ type: 'fan', x: q.x, z: q.z, yaw: Math.atan2(P.x - q.x, P.z - q.z), r: SC.hornR, r0: 0.5, a: SC.hornA, spk: q.id, ult: true }, 'bombHorn', SC.bombWarn); w.spkRef = q } }));
      ringGo(SC.tower.x, SC.tower.z, -1, Math.atan2(P.x - SC.tower.x, P.z - SC.tower.z) + (rnd() - 0.5) * 1.2, -(live.length * SC.bombGap + SC.bombWarn) * SC.ringSpd);
      rec = live.length * SC.bombGap + SC.bombWarn + 0.6; c.thenA = true; b.onTower = true }
    b.act = 'recover'; b.at = rec; b.lastK = c.k; b.then = c.thenB ? 'B' : c.thenA ? 'A' : null;
  }
  function screamRage() {   /* 灭杀：BOSS 回到地上、看得见；喇叭都修好 */
    if (Bo.hidden || Bo.onTower || Bo.y) { Bo.hidden = false; Bo.onTower = false; Bo.y = 0; Bo.x = ARENA.boss.x; Bo.z = ARENA.boss.z; E('blinkIn', { x: Bo.x, z: Bo.z, y: 0 }) }
    Bo.blink = null; st.bombQ.length = 0; for (const q of st.speakers) { q.dead = false; q.hp = q.max; E('spkFix', { s: q }) }
  }
  function screamHazards(dt) {
    /* 排着的事（声波一道一道出去、广播轰炸一个一个喇叭） */
    for (let i = st.bombQ.length - 1; i >= 0; i--) { const q = st.bombQ[i]; q.t -= dt; if (q.t <= 0) { st.bombQ.splice(i, 1); q.f() } }
    /* 广播轰炸的喇叭预警到点 */
    for (let i = st.warns.length - 1; i >= 0; i--) { const w = st.warns[i]; if (w.k !== 'bombHorn' || w.t < w.dur) continue; st.warns.splice(i, 1); if (!w.spkRef.dead) hornBlast(w.spkRef, w, SC.hornK) }
    /* 声波圆环往外扩：扫过主角那一圈，不在缺口里、不在翻滚无敌里就扣血（掩体不挡） */
    for (let i = st.rings.length - 1; i >= 0; i--) { const r = st.rings[i]; const d0 = r.r; r.r += SC.ringSpd * dt; const d = hyp(P.x - r.x, P.z - r.z);
      if (r.r <= 0) continue;
      if (!r.hit && d >= d0 - r.w / 2 - 0.35 && d <= r.r + r.w / 2 + 0.35 && inWarn({ ...r, r: clamp(d, d0, r.r) }, P.x, P.z)) { r.hit = true; hurtPlayer(r.k < 0 ? B.ult * SC.bombRingK * (st.half ? SC.rageK : 1) : bossDmg(false) * r.k, r.k < 0 ? 'towerRing' : 'ring') }
      if (r.r > 45) { st.rings.splice(i, 1); E('ringGone', { id: r.id }) } }
    /* 小乌鸦：绕着主角飞、啄；普攻优先打它们 */
    for (const m of st.mobs) { if (!m.crow || m.dead) continue; if (m.rise > 0) { m.rise -= dt; continue } if (m.stun > 0) { m.stun -= dt; continue }
      m.a += dt * 2.2; const tx = P.x + Math.sin(m.a) * SC.crowR, tz = P.z + Math.cos(m.a) * SC.crowR, ex = tx - m.x, ez = tz - m.z, el = hyp(ex, ez), sp = SC.crowSpd * dt;
      if (el > sp) { m.x += ex / el * sp; m.z += ez / el * sp } else { m.x = tx; m.z = tz } m.yaw = Math.atan2(P.x - m.x, P.z - m.z);
      if (hyp(P.x - m.x, P.z - m.z) < SC.crowR + 0.4) { m.acc = (m.acc || 0) + dt; if (m.acc >= 0.5) { m.acc -= 0.5; hurtPlayer(bossDmg(false) * SC.crowDps * 0.5, 'crow') } } }
    st.hazards = st.rings.map(r => ({ ...r, w: r.w + 1.2 }));
  }
  function screamStep(dt) {
    const b = Bo; screamHazards(dt); if (b.dead) return;
    const tf = b.slow > 0 ? 0.5 : 1; if (b.slow > 0) b.slow -= dt;
    if (b.bleed > 0) { b.bleed -= dt; b.hp -= b.bleedDps * dt; st.stats.dmg += b.bleedDps * dt; if (b.hp <= 0) { b.hp = 0; bossDie(); return } } else b.bleedDps = 0;
    if (b.slowHit > 0) b.slowHit -= dt;
    const dts = dt * tf; b.basicCd -= dts; b.blinkCd -= dts;
    const dx = P.x - b.x, dz = P.z - b.z, d = hyp(dx, dz);
    if (b.act === 'wait') { b.look = 'p'; if (st.t > 0.6) { b.act = 'idle'; setAnim('idle') } return }
    /* 闪现：消失（0.25 秒）→ 落点黑影 0.3 秒到了就出现（0.3 秒）；B 接鸦群喷射 */
    if (b.act === 'blink') { const K = b.blink; K.t += dt;
      if (!b.hidden && K.t >= SC.vanishT) { b.hidden = true; b.y = 0; b.onTower = false }
      if (K.t >= SC.shadowT) { b.x = K.x1; b.z = K.z1; b.hidden = false; b.y = 0; b.yaw = Math.atan2(P.x - b.x, P.z - b.z); b.act = 'appear'; b.at = SC.appearT; setAnim('appear', SCREAM_ANIM.appear.T / SC.appearT); E('blinkIn', { x: b.x, z: b.z, y: 0 });
        if (K.after === 'push' && !st.rage) { screamCast('push'); b.appearT = SC.appearT } }
      return }
    if (b.act === 'appear') { b.at -= dt; if (b.at <= 0) { b.act = 'idle'; b.look = 'p'; setAnim('idle') } return }
    /* 半血：嗜血（抱头尖叫 1.8 秒；没坏的喇叭修好回满血） */
    if (!st.half && b.hp < b.max * 0.5 && !b.cast && b.act !== 'recover') { st.half = true; b.act = 'rageAnim'; b.at = SCREAM_ANIM.rage.T; b.look = null; setAnim('rage'); for (const q of st.speakers) if (!q.dead) { q.hp = q.max; E('spkFix', { s: q }) } E('half'); return }
    if (b.act === 'stun' || b.act === 'recover' || b.act === 'rageAnim') { b.at -= dts; if (b.at <= 0) { const th = b.then; b.then = null; b.onTower = false;
      if (b.act !== 'rageAnim' && b.lastK !== 'bolt') b.calm = SC.calm; b.act = 'idle'; b.look = 'p'; setAnim('idle');
      if (th && !st.rage) startBlink(th) } return }
    if (b.act === 'cast') { const c = b.cast; c.t += dts; if (c.k === 'bolt') { b.calm -= dts; b.skillT -= dts } if (c.k === 'push' && b.appearT > 0) b.appearT -= dt;
      if ((c.k === 'push') && c.t < c.dur * 0.5) { b.yaw += clamp(angD(Math.atan2(dx, dz), b.yaw), -2 * dts, 2 * dts); c.ws[0].yaw = b.yaw }
      if (c.t >= c.dur) screamRelease(); return }
    /* 闲着：看着主角；离主角太远慢慢挪过去；太近马上闪走（A） */
    b.look = 'p'; b.yaw += clamp(angD(Math.atan2(dx, dz), b.yaw), -3 * dts, 3 * dts);
    if (d > SC.far[1]) { const v = SC.walk * (b.slowHit > 0 ? 1 - hero.slow : 1) * dts; b.x += dx / d * v; b.z += dz / d * v; push(b, 0.6); if (b.anim !== 'walk') setAnim('walk', 1); b.ts = SC.walk / (SCREAM_ANIM.walk.speed * SCREAM_K) }
    else if (b.anim !== 'idle') setAnim('idle');
    if (d < SC.near && b.blinkCd <= 0) { if (startBlink('A')) return }
    b.skillT -= dts; b.blinkT -= dts;
    if (b.calm > 0) { b.calm -= dts;   /* 安静时间：照样扔鸦弹、闪现 */ }
    else if (b.skillT <= 0) { const k = SC.order[b.oi % SC.order.length]; b.oi++; b.skillT = st.half ? SC.gapRage : SC.gap; screamCast(k); return }
    if (b.blinkT <= 0) { const E2 = st.half ? SC.blinkEveryRage : SC.blinkEvery; b.blinkT = E2[0] + rnd() * (E2[1] - E2[0]); if (startBlink(rnd() < (st.half ? SC.blinkBRage : SC.blinkB) ? 'B' : 'A')) return }
    if (b.basicCd <= 0 && b.skillT > SC.boltGuard && d < 20) { screamCast('bolt'); return }
  }
  /* ---------- 设计 116：装甲暴君（第 5 关）。纯远程、走得慢；技能之间安静 1.2 秒，安静时间一直机炮点射；大技能 5 秒一招，只在闲着（含安静）时倒数 ---------- */
  const TY = TYRANT_CFG;
  const twarn = (w, k, dur) => { w.id = st.nid++; w.k = k; w.t = 0; w.dur = dur; st.warns.push(w); return w };
  const tdrop = w => { const i = st.warns.indexOf(w); if (i >= 0) st.warns.splice(i, 1) };
  const inArena = (x, z, m = 0.6) => x > ARENA.x0 + m && x < ARENA.x1 - m && z > ARENA.z0 + m && z < ARENA.z1 - m;
  /* 机炮点射：主角脚下小圆一连 3 个（半血 5 个），每个跟着主角出；掩体挡（BOSS 到圈心中间有掩体就打不到） */
  function gunBurst() { const n = st.half ? TY.gunN2 : TY.gunN; for (let i = 0; i < n; i++) st.queue.push({ t: i * TY.gunGap, f: () => { if (Bo.dead || st.rage) return; twarn({ type: 'circle', x: clamp(P.x, ARENA.x0 + 0.5, ARENA.x1 - 0.5), z: clamp(P.z, ARENA.z0 + 0.5, ARENA.z1 - 0.5), r: TY.gunR }, 'gun', TY.gunWarn) } }); E('gunFire', { n, dur: (n - 1) * TY.gunGap + TY.gunWarn }) }
  /* 激光网格：横线、竖线随机，但格子（两条线之间的空地）至少 2.5 米宽，而且主角附近一定有一条线 */
  function gridLines(n, lo, hi, near) {
    const W = TY.gridW, need = TY.gridCell + W;   // 两条线中心至少隔开这么多
    for (let tr = 0; tr < 60; tr++) { const xs = [clamp(near + (rnd() - 0.5) * 1.6, lo + 0.6, hi - 0.6)];
      for (let k = 0; k < 200 && xs.length < n; k++) { const v = lo + 0.6 + rnd() * (hi - lo - 1.2); if (xs.every(q => Math.abs(q - v) >= need)) xs.push(v) }
      if (xs.length === n) return xs.sort((a, b) => a - b) }
    const out = []; for (let i = 0; i < n; i++) out.push(lo + (hi - lo) * (i + 0.5) / n); return out;   // 放不下就平均分
  }
  /* 地毯轰炸：全场一格一个圆（间隔 2 米），安全地 3～4 块（半血少 1 块）附近的圆不亮；第一块安全地离主角 2.5～5 米（跑得到） */
  function carpetWave(prev) {
    const nSafe = (st.half ? TY.carpetSafe - 1 : TY.carpetSafe) + (rnd() < 0.5 ? 1 : 0), safe = [];
    const ok = (x, z) => inArena(x, z, 1.6) && !inCover(x, z, 0.8) && safe.every(q => hyp(q.x - x, q.z - z) > 4.5);
    if (!prev) { for (let t = 0; t < 60; t++) { const a = rnd() * 6.283, r = 2.5 + rnd() * 2.5, x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r; if (ok(x, z)) { safe.push({ x, z }); break } } }
    else for (const q of prev) { for (let t = 0; t < 60; t++) { const a = rnd() * 6.283, r = 2.6 + rnd() * 2.2, x = q.x + Math.sin(a) * r, z = q.z + Math.cos(a) * r; if (ok(x, z) && hyp(x - q.x, z - q.z) <= TY.carpetMove) { safe.push({ x, z }); break } } }   /* 第二波：每块安全地都在第一波某块安全地 5 米以内 */
    for (let t = 0; t < 200 && safe.length < nSafe; t++) { const x = ARENA.x0 + 1.6 + rnd() * (ARENA.x1 - ARENA.x0 - 3.2), z = ARENA.z0 + 1.6 + rnd() * (ARENA.z1 - ARENA.z0 - 3.2); if (ok(x, z) && (!prev || prev.some(q => hyp(q.x - x, q.z - z) <= TY.carpetMove))) safe.push({ x, z }) }
    const pts = []; for (let x = ARENA.x0 + 1; x < ARENA.x1; x += TY.carpetStep) for (let z = ARENA.z0 + 1; z < ARENA.z1; z += TY.carpetStep) if (!safe.some(q => hyp(q.x - x, q.z - z) < TY.carpetSafeR + TY.carpetR - 0.2)) pts.push({ x, z });
    return { pts, safe };
  }
  function pylonsUp() {   /* 能量护盾：插座升柱（3 根，半血 4 根），柱子之间连电弧 */
    const n = st.half ? 4 : 3, socks = [...SG.sockets].sort((a, b) => hyp(a.x - P.x, a.z - P.z) - hyp(b.x - P.x, b.z - P.z)).slice(0, n);
    st.pylons = socks.map((q, i) => { const m = { id: st.nid++, pylon: true, x: q.x, z: q.z, yaw: 0, hp: B.hp * TY.pylonHp, max: B.hp * TY.pylonHp, rise: 0.5, stun: 0, cd: 0, dead: false, si: SG.sockets.indexOf(q) }; st.mobs.push(m); E('mobSpawn', { m }); return m });
    st.shieldT = 0; E('shieldUp', { n });
  }
  function shieldOff(broken) { if (!st.pylons) return; for (const m of st.pylons) if (!m.dead) { m.dead = true; m.deadT = 0; m.quiet = true } st.pylons = null; Bo.shield = false; E('shieldDown', { broken }); if (broken) { Bo.act = 'stun'; Bo.at = TY.breakT; Bo.vuln = TY.breakT; Bo.cast = null; setAnim('shield_break'); st.stats.shieldT = (st.stats.shieldT || 0) + st.shieldT; st.stats.shieldN = (st.stats.shieldN || 0) + 1 } }
  const arcSegs = () => { const ps = (st.pylons || []).filter(m => !m.dead && m.rise <= 0); if (ps.length < 2) return []; const out = []; for (let i = 0; i < ps.length; i++) { const a = ps[i], b = ps[(i + 1) % ps.length]; if (ps.length === 2 && i === 1) break; out.push({ x0: a.x, z0: a.z, x1: b.x, z1: b.z }) } return out };
  function tyCast(k) {
    const b = Bo, c = { k, t: 0, ws: [], w: { ult: k === 'cannon' } }, dx = P.x - b.x, dz = P.z - b.z;
    st.stats.casts[k] = (st.stats.casts[k] || 0) + 1; b.yaw = Math.atan2(dx, dz); b.look = 'p';
    c.cancel = () => { for (const w of c.ws) tdrop(w); if (k === 'missile') st.queue = st.queue.filter(q => q.c !== c) };
    if (k === 'laser') { c.dur = TY.laserWarn; c.ws.push(twarn({ type: 'line', x: b.x, z: b.z, yaw: b.yaw, len: TY.laserLen, w: TY.laserW }, 'laserAim', c.dur)); setAnim('idle') }
    else if (k === 'missile') { c.dur = missileQueue(c); setAnim('missile', TYRANT_ANIM.missile.hit / Math.min(TYRANT_ANIM.missile.hit, c.dur)) }
    else if (k === 'grid') { c.dur = TY.gridWarn; const nh = st.half ? 5 : 4, nv = st.half ? 4 : 3;
      for (const z of gridLines(nh, ARENA.z0, ARENA.z1, P.z)) c.ws.push(twarn({ type: 'line', x: ARENA.x0 - 0.2, z, yaw: Math.PI / 2, len: ARENA.x1 - ARENA.x0 + 0.4, w: TY.gridW, h: 1 }, 'gridH', TY.gridWarn));
      for (const x of gridLines(nv, ARENA.x0, ARENA.x1, P.x)) c.ws.push(twarn({ type: 'line', x, z: ARENA.z0 - 0.2, yaw: 0, len: ARENA.z1 - ARENA.z0 + 0.4, w: TY.gridW, v: 1 }, 'gridV', TY.gridWarn + TY.gridGap));
      setAnim('grid', TYRANT_ANIM.grid.hit / c.dur); E('alarm', { col: 'red', dur: TY.gridWarn + TY.gridGap }) }
    else if (k === 'carpet') { c.dur = TY.carpetWarn; const W1 = carpetWave(null); c.safe = W1.safe; c.ws.push(twarn({ type: 'multi', pts: W1.pts, r: TY.carpetR, x: P.x, z: P.z, safe: W1.safe, wave: 1 }, 'carpet', c.dur));
      setAnim('carpet', TYRANT_ANIM.carpet.hit / c.dur) }
    else if (k === 'shield') { c.dur = TYRANT_ANIM.kneel.T; setAnim('kneel') }
    else if (k === 'pull') { c.dur = TY.pullWarn; c.ws.push(twarn({ type: 'circle', x: b.x, z: b.z, r: TY.pullR, pull: 1 }, 'pullAim', c.dur)); setAnim('pull', 1) }
    else if (k === 'shotgun') { c.dur = TY.shotWarn; c.ws.push(twarn({ type: 'fan', x: b.x, z: b.z, yaw: b.yaw, r: TY.shotR, r0: 0.6, a: TY.shotA }, 'shotgun', c.dur)); setAnim('shotgun', TYRANT_ANIM.shotgun.hit / c.dur) }
    else if (k === 'emp') { c.dur = TY.empWarn; setAnim('emp', TYRANT_ANIM.emp.hit / c.dur); E('alarm', { col: 'blue', dur: c.dur }) }
    else if (k === 'cannon') { c.dur = TY.cannonWarn; c.ws.push(twarn({ type: 'line', x: b.x, z: b.z, yaw: b.yaw, len: TY.cannonLen, w: TY.cannonW, ult: true }, 'cannonAim', c.dur)); setAnim('charge', 1) }
    b.cast = c; b.act = 'cast'; b.interruptible = k === 'missile' || k === 'pull';
    E('cast', { k, dur: c.dur, ult: k === 'cannon', name: TYRANT_NAME[k] });
  }
  /* 导弹齐射：主角周围依次 5 个圆（第 1 个在脚下），每个 1 秒预警，间隔 0.35 秒；没发的被打断就不发 */
  function missileQueue(c) { for (let i = 0; i < TY.missN; i++) st.queue.push({ c, t: i * TY.missGap, f: () => { if (Bo.dead || st.rage) return; let x = P.x, z = P.z; if (i > 0) { const a = rnd() * 6.283, r = 1 + rnd() * 2.8; x = P.x + Math.sin(a) * r; z = P.z + Math.cos(a) * r }
      const w = twarn({ type: 'circle', x: clamp(x, ARENA.x0 + 0.8, ARENA.x1 - 0.8), z: clamp(z, ARENA.z0 + 0.8, ARENA.z1 - 0.8), r: TY.missR }, 'miss', TY.missWarn); E('missGo', { x: w.x, z: w.z, fly: TY.missWarn, id: w.id }) } });
    return (TY.missN - 1) * TY.missGap + 0.3 }
  function tyRelease() {
    const b = Bo, c = b.cast; b.cast = null; if (c.k !== 'grid') for (const w of c.ws) tdrop(w);   /* 网格的横线、竖线留着，到点由下面结算 */
    let rec = 0.5, then = null;
    if (c.k === 'laser') { const n = st.half ? 2 : 1, y0 = c.ws[0].yaw; st.beam = { t: 0, dur: st.half ? TY.laserT2 : TY.laserT, n, y0: st.half ? y0 : y0 - Math.PI / 2, span: Math.PI, dir: rnd() < 0.5 ? 1 : -1, hit: false, x: b.x, z: b.z };
      if (st.beam.dir < 0 && !st.half) st.beam.y0 = y0 + Math.PI / 2; E('beamGo', { n }); setAnim('sweep', TYRANT_ANIM.sweep.T / st.beam.dur); rec = st.beam.dur + 0.3 }
    else if (c.k === 'missile') { rec = TY.missWarn + 0.3 }
    else if (c.k === 'grid') { rec = TY.gridGap + 0.4 }   // 竖线还挂着（0.6 秒后打）
    else if (c.k === 'carpet') { const w = c.ws[0]; E('carpetHit', { pts: w.pts, wave: 1 }); if (inWarn(w, P.x, P.z, 0.3)) { hurtPlayer(bossDmg(false) * TY.carpetK, 'carpet'); st.stats.carpetHit = (st.stats.carpetHit || 0) + 1 } carpetFire(w.pts);
      const W2 = carpetWave(c.safe); twarn({ type: 'multi', pts: W2.pts, r: TY.carpetR, x: P.x, z: P.z, safe: W2.safe, wave: 2 }, 'carpet2', TY.carpetGap); rec = TY.carpetGap + 0.4 }
    else if (c.k === 'shield') { b.shield = true; pylonsUp(); b.act = 'kneel'; b.kneelGun = TY.kneelGun; setAnim('kneel_loop'); return }
    else if (c.k === 'pull') { st.pull = { t: 0, dur: TY.pullT }; P.pullT = TY.pullT; E('pullGo', { dur: TY.pullT }); b.act = 'pulling'; b.interruptible = true; b.cast = { k: 'pull', t: 0, dur: TY.pullT, ws: [], w: { ult: false }, nm: '电磁牵引', cancel: () => { st.pull = null; P.pullT = 0 } }; return }
    else if (c.k === 'shotgun') { const w = c.ws[0]; E('shotgunGo', { w }); if (inWarn(w, P.x, P.z) && hurtPlayer(bossDmg(false) * TY.shotK, 'shotgun') > 0) { st.stats.shotHit = (st.stats.shotHit || 0) + 1; const ex = P.x - b.x, ez = P.z - b.z, el = hyp(ex, ez) || 1; E('knock', { x: ex / el * TY.shotPush * 6, z: ez / el * TY.shotPush * 6 }) } rec = 0.3; then = 'missile' }
    else if (c.k === 'emp') { E('empGo'); hurtPlayer(TY.emp, 'emp', true); if (!P.dead && !(P.lockImm > 0) && !(P.pullT > 0)) { P.lockT = TY.lockT; P.lockImm = TY.lockT + TY.lockImm; st.stats.lock = (st.stats.lock || 0) + 1; E('plock', { t: TY.lockT }) } rec = 0.3; then = 'carpet' }
    else if (c.k === 'cannon') { const w = c.ws[0], L = w.len, t = segHit(w.x, w.z, w.x + Math.sin(w.yaw) * L, w.z + Math.cos(w.yaw) * L, 0, true), stop = t === null ? L : t * L, cv = t === null ? null : COVERS.find(q => { const hx = w.x + Math.sin(w.yaw) * stop, hz = w.z + Math.cos(w.yaw) * stop; return Math.abs(hx - q.x) < q.hx + 0.2 && Math.abs(hz - q.z) < q.hz + 0.2 });
      const hitW = { ...w, len: stop }; E('cannonGo', { w: hitW, cv }); if (inWarn(hitW, P.x, P.z, 0.3)) hurtPlayer(bossDmg(true), 'cannon');
      st.melts.push({ id: st.nid++, type: 'line', x: w.x, z: w.z, yaw: w.yaw, len: stop, w: TY.cannonW, t: 0, life: TY.meltT }); setAnim('cannon', 1); rec = 0.8 }
    b.act = 'recover'; b.at = rec; b.lastK = c.k; b.then = then;
  }
  function carpetFire(pts) { for (const p of pts) if (rnd() < TY.carpetFireP) st.fires.push({ id: st.nid++, type: 'circle', x: p.x, z: p.z, r: TY.carpetR * 0.8, t: 0, life: TY.carpetFireT }) ; E('fires', { list: st.fires }) }
  function tyHazards(dt) {
    for (let i = st.queue.length - 1; i >= 0; i--) { const q = st.queue[i]; q.t -= dt; if (q.t <= 0) { st.queue.splice(i, 1); q.f() } }
    /* 预警到点：机炮、导弹、网格（横线先打、0.6 秒后竖线）、地毯第二波 */
    for (let i = st.warns.length - 1; i >= 0; i--) { const w = st.warns[i]; if (!w.k || w.t < w.dur) continue;
      if (w.k === 'gun') { st.warns.splice(i, 1); const bl = segHit(Bo.x, Bo.z, w.x, w.z, 0, true), d = hyp(w.x - Bo.x, w.z - Bo.z), blocked = bl !== null && bl * d < d - 0.6;
        E('gunHit', { x: w.x, z: w.z, blocked, bx: blocked ? Bo.x + (w.x - Bo.x) * bl : w.x, bz: blocked ? Bo.z + (w.z - Bo.z) * bl : w.z }); if (!blocked && inWarn(w, P.x, P.z)) hurtPlayer(bossDmg(false) * TY.gunK, 'gun') }
      else if (w.k === 'miss') { st.warns.splice(i, 1); E('missHit', { x: w.x, z: w.z, id: w.id }); if (inWarn(w, P.x, P.z)) hurtPlayer(bossDmg(false) * TY.missK, 'missile'); st.fires.push({ id: st.nid++, type: 'circle', x: w.x, z: w.z, r: TY.missR * 0.8, t: 0, life: TY.missFireT }); E('fires', { list: st.fires }) }
      else if (w.k === 'gridH' || w.k === 'gridV') { st.warns.splice(i, 1); E('gridHit', { w }); if (inWarn(w, P.x, P.z, 0.3)) { hurtPlayer(bossDmg(false) * TY.gridK, 'grid'); st.stats.gridHit = (st.stats.gridHit || 0) + 1 } }
      else if (w.k === 'carpet2') { st.warns.splice(i, 1); E('carpetHit', { pts: w.pts, wave: 2 }); if (inWarn(w, P.x, P.z, 0.3)) { hurtPlayer(bossDmg(false) * TY.carpetK, 'carpet'); st.stats.carpetHit = (st.stats.carpetHit || 0) + 1 } carpetFire(w.pts) } }
    /* 旋转激光：扫过主角那一下扣一次（掩体挡不住，翻滚无敌能穿） */
    const Bm = st.beam; if (Bm) { Bm.t += dt; const u = Math.min(1, Bm.t / Bm.dur), ys = [];
      for (let j = 0; j < Bm.n; j++) ys.push(Bm.y0 + j * Math.PI + Bm.dir * Bm.span * u);
      Bm.ys = ys; Bm.x = Bo.x; Bm.z = Bo.z;
      if (!Bm.hit && ys.some(y => inWarn({ type: 'line', x: Bm.x, z: Bm.z, yaw: y, len: TY.laserLen, w: TY.laserW }, P.x, P.z, 0.25))) { if (hurtPlayer(bossDmg(false) * TY.laserK, 'laser') > 0) { Bm.hit = true; st.stats.laserHit = (st.stats.laserHit || 0) + 1 } }
      if (u >= 1) { st.beam = null; E('beamEnd') } }
    /* 牵引：主角被吸向 BOSS（往外走走不过，翻滚能挣出一段） */
    if (st.pull) { const Pl = st.pull; Pl.t += dt; const ex = Bo.x - P.x, ez = Bo.z - P.z, el = hyp(ex, ez);
      if (el > TY.pullStop && !P.roll) { const v = Math.min(el - TY.pullStop, TY.pullSpd * dt); P.x += ex / el * v; P.z += ez / el * v; push(P, 0.42) }
      if (Pl.t >= Pl.dur) { st.pull = null; P.pullT = 0; if (hyp(Bo.x - P.x, Bo.z - P.z) < TY.shotR) st.stats.pulled = (st.stats.pulled || 0) + 1; if (Bo.act === 'pulling' && !Bo.dead && !st.rage) { Bo.act = 'idle'; Bo.cast = null; tyCast('shotgun') } } }
    /* 火、熔化的地面、护盾电弧：站在里面每 0.5 秒扣一次 */
    let burn = 0;
    for (let i = st.fires.length - 1; i >= 0; i--) { const f = st.fires[i]; f.t += dt; if (f.t >= f.life) { st.fires.splice(i, 1); E('fireGone', { id: f.id }); continue } if (hyp(P.x - f.x, P.z - f.z) < f.r + 0.2) burn = Math.max(burn, TY.fireK) }
    for (let i = st.melts.length - 1; i >= 0; i--) { const f = st.melts[i]; f.t += dt; if (f.t >= f.life) { st.melts.splice(i, 1); E('meltGone', { id: f.id }); continue } if (inWarn(f, P.x, P.z, 0.1)) burn = Math.max(burn, TY.meltK) }
    const arcs = arcSegs(); if (arcs.some(g => segDist(P.x, P.z, g) < TY.arcW / 2 + 0.3) && !P.roll) burn = Math.max(burn, TY.arcK);
    if (burn > 0) { P.burnAcc = (P.burnAcc || 0) + dt; if (P.burnAcc >= 0.5) { P.burnAcc -= 0.5; hurtPlayer(bossDmg(false) * burn * 0.5, 'burn') } } else P.burnAcc = 0.25;
    /* 柱子升起来、打掉；3 根都掉了破盾；护盾最多 25 秒 */
    if (st.pylons) { st.shieldT += dt; for (const m of st.pylons) { if (m.rise > 0) m.rise -= dt; if (m.dead && !m.told) { m.told = true; if (!m.quiet) E('pylonDie', { m }) } }
      if (st.pylons.every(m => m.dead)) shieldOff(true); else if (st.shieldT > TY.shieldMax) shieldOff(false) }
    st.hazards = [...st.fires, ...st.melts, ...arcs.map(g => ({ type: 'segs', segs: [g], w: TY.arcW + 0.4, x: 0, z: 0 })), ...(st.beam ? st.beam.ys.map(y => ({ type: 'line', x: st.beam.x, z: st.beam.z, yaw: y, len: TY.laserLen, w: TY.laserW + 0.6, beam: 1 })) : [])];
  }
  function tyStep(dt) {
    const b = Bo; tyHazards(dt); if (b.dead) return;
    const tf = b.slow > 0 ? 0.5 : 1; if (b.slow > 0) b.slow -= dt;
    if (b.bleed > 0) { b.bleed -= dt; b.hp -= b.bleedDps * dt; st.stats.dmg += b.bleedDps * dt; if (b.hp <= 0) { b.hp = 0; bossDie(); return } } else b.bleedDps = 0;
    if (b.slowHit > 0) b.slowHit -= dt; if (b.vuln > 0) b.vuln -= dt;
    const dts = dt * tf; b.gunCd -= dts;
    const dx = P.x - b.x, dz = P.z - b.z, d = hyp(dx, dz);
    if (b.act === 'wait') { b.look = 'p'; if (st.t > 0.6) { b.act = 'idle'; setAnim('idle') } return }
    /* 半血：破甲（3 块装甲板炸飞落地当掩体） */
    if (!st.half && b.hp < b.max * 0.5 && !b.cast && b.act !== 'kneel' && b.act !== 'recover' && b.act !== 'pulling') { st.half = true; b.act = 'breakAnim'; b.at = TYRANT_ANIM.armor_break.T; b.plateT = TYRANT_ANIM.armor_break.hit; setAnim('armor_break'); E('half'); return }
    if (b.plateT > 0) { b.plateT -= dts; if (b.plateT <= 0) { const made = []; for (let i = 0; i < 3; i++) { for (let t = 0; t < 40; t++) { const a = rnd() * 6.283, r = 3 + rnd() * 3.5, x = b.x + Math.sin(a) * r, z = b.z + Math.cos(a) * r;
        if (!inArena(x, z, 1.2) || inCover(x, z, 1.0) || hyp(x - P.x, z - P.z) < 1.6 || made.some(q => hyp(q.x - x, q.z - z) < 2.2)) continue; const PL = [[0.64, 0.46], [0.48, 0.4], [0.39, 0.39]][i], c = { k: 'plate' + (i + 1), x, z, hx: PL[0], hz: PL[1], id: 'p' + st.nid++, from: { x: b.x, z: b.z } };   /* 116B：背甲、肩甲、臂甲，挡的框按模型宽深比 */ COVERS.push(c); made.push(c); break } }
        st.coverVer = (st.coverVer || 0) + 1; for (const c of made) E('coverNew', { c }); push(P, 0.42) } }
    /* 跪着开护盾：每 2 秒一轮机炮 */
    if (b.act === 'kneel') { b.look = 'p'; b.yaw += clamp(angD(Math.atan2(dx, dz), b.yaw), -1.2 * dts, 1.2 * dts); if (!b.shield) { b.act = 'idle'; setAnim('idle'); b.calm = TY.calm; return } b.kneelGun -= dts; if (b.kneelGun <= 0) { b.kneelGun = TY.kneelGun; gunBurst() } return }
    if (b.act === 'pulling') { b.look = 'p'; if (b.cast) b.cast.t += dt; return }
    if (b.act === 'stun' || b.act === 'recover' || b.act === 'breakAnim') { b.at -= dts; if (b.at <= 0) { const th = b.then; b.then = null; b.act = 'idle'; b.look = 'p'; setAnim('idle'); b.calm = TY.calm;
      if (th && !st.rage) { b.calm = 0; tyCast(th) } } return }
    if (b.act === 'cast') { const c = b.cast; c.t += dts;
      if (c.k === 'cannonAim' || c.k === 'cannon') { const w = c.ws[0], want = Math.atan2(P.x - b.x, P.z - b.z); w.yaw += clamp(angD(want, w.yaw), -TY.cannonTurn * dts, TY.cannonTurn * dts); b.yaw = w.yaw }   /* 主炮红线跟着主角慢慢转（比主角绕着跑慢一点） */
      else if (c.k === 'laser' || c.k === 'shotgun') { if (c.t < c.dur * 0.6) { b.yaw += clamp(angD(Math.atan2(dx, dz), b.yaw), -1.5 * dts, 1.5 * dts); c.ws[0].yaw = b.yaw } }
      else if (c.k === 'pull' && c.ws[0]) { c.ws[0].x = b.x; c.ws[0].z = b.z }
      if (c.t >= c.dur) tyRelease(); return }
    /* 闲着：慢慢往主角那边挪（离 9 米以上才走，5 米以内不靠近）；安静时间一直机炮点射 */
    b.look = 'p'; const turn = angD(Math.atan2(dx, dz), b.yaw); b.yaw += clamp(turn, -1.4 * dts, 1.4 * dts);
    if (d > TY.walkFrom) { const v = TY.walk * (st.half ? TY.walkHalf : 1) * (b.slowHit > 0 ? 1 - hero.slow : 1) * dts * Math.max(0.3, Math.cos(Math.min(Math.abs(turn), Math.PI / 2)));
      b.x += Math.sin(b.yaw) * v; b.z += Math.cos(b.yaw) * v; push(b, CFG.coverR); const wa = 'walk'; if (b.anim !== wa) setAnim(wa, 1); b.ts = TY.walk * (st.half ? TY.walkHalf : 1) / (TYRANT_ANIM.walk.speed * TYRANT_K) }
    else if (b.anim !== 'idle') setAnim('idle');
    b.skillT -= dts;
    if (b.calm > 0) b.calm -= dts;
    else if (b.skillT <= 0) { const k = TY.order[b.oi % TY.order.length]; b.oi++; b.skillT = st.half ? TY.gapHalf : TY.gap; tyCast(k); return }
    if (b.gunCd <= 0 && b.skillT > TY.gunGuard && d < 22) { b.gunCd = TY.gunEvery; gunBurst() }
  }
  function tyRage() { shieldOff(false); st.beam = null; st.pull = null; P.pullT = 0; st.queue.length = 0 }
  /* ---------- 小丧尸 ---------- */
  function mobStep(dt) {
    for (const m of st.mobs) {
      if (m.dead) { m.deadT += dt; continue }
      if (m.pus || m.crow || m.pylon) continue;   // 设计 81：脓包不走（毒囊那边管）；设计 114：小乌鸦尖啸者那边管
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
    /* 设计 114：错乱——摇杆方向全反（走路、翻滚都反） */
    if (P.lockImm > 0) P.lockImm -= dt; if (P.lockT > 0) { P.lockT -= dt; if (P.lockT <= 0) E('plockEnd') }   /* 设计 116：技能封锁——集火、翻滚、震荡弹用不了 */
    if (P.lockT > 0 && (inp.skill === 'focus' || inp.skill === 'roll' || inp.skill === 'stun')) { E('lockedTry', { k: inp.skill }); inp = { ...inp, skill: null } }
    if (P.confImm > 0) P.confImm -= dt;
    if (P.confT > 0) { P.confT -= dt; if (P.confT <= 0) E('pconfEnd'); inp = { ...inp, mx: -(inp.mx || 0), mz: -(inp.mz || 0) } }
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
    if (s === 'focus' && !pre && P.cd.focus <= 0 && !Bo.dead && !Bo.hidden && hyp(Bo.x - P.x, Bo.z - P.z) < hero.range + 4) { P.focus = SKILLS.focus.shots; P.focusT = 0; P.cd.focus = cdOf('focus'); E('focus') }
    if (s === 'stun' && !pre && P.cd.stun <= 0 && !Bo.dead && hyp(Bo.x - P.x, Bo.z - P.z) < hero.range + 4) {
      P.cd.stun = cdOf('stun'); const dur = SKILLS.stun.stun(sk('stun'));
      if (Bo.cast && Bo.interruptible) { if (Bo.cast.cancel) Bo.cast.cancel(); else st.warns.splice(st.warns.indexOf(Bo.cast.w), 1); E('interrupt', { k: Bo.cast.k }); Bo.cast = null; Bo.act = 'stun'; Bo.at = dur; Bo.look = null; if (ROCK) setAnim('stagger', ROCK_ANIM.stagger.T / Math.max(0.8, dur)); else if (SCR) setAnim('stagger', SCREAM_ANIM.stagger.T / Math.max(0.6, dur)); else if (TYR) setAnim('stagger', TYRANT_ANIM.stagger.T / Math.max(0.6, dur)); else setAnim('hit', 0.35); st.stats.interrupts++ }
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
  st.step = step; st.cdOf = cdOf; st.forceCast = k => { Bo.act = TOX ? 'idle' : 'chase'; Bo.cast = null; if (!TOX) st.warns.length = 0; const keep = st.ev; st.ev = []; if (TOX) toxCast(k); else if (ROCK) { Bo.calm = 0; rockCast(k) } else if (SCR) { Bo.calm = 0; Bo.hidden = false; Bo.y = 0; screamCast(k) } else if (TYR) { Bo.calm = 0; tyCast(k) } else startCast(k); st.pend = st.ev; st.ev = keep };   // 截图、测试用
  st.clearCovers = () => { if (!ROCK) return; const keep = st.ev; st.ev = st.pend || []; for (const c of realCovers()) coverGone(c, 'crumble'); st.pend = st.ev; st.ev = keep }; st.coverN = () => realCovers().length;   /* 设计 110：测试用（掩体扔光） */
  st.killPlayer = () => { if (st.over) return; const keep = st.ev; st.ev = []; P.hp = 0; P.dead = true; end(false); st.pend = st.ev; st.ev = keep };   /* 设计 109：测试用（打输） */
  st.killBoss = () => { if (st.over) return; const keep = st.ev; st.ev = []; Bo.hp = 0; bossDie(); st.pend = st.ev; st.ev = keep };   /* 设计 74：测试用（打赢） */
  return st;
}
