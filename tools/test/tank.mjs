/* 设计 101：「站着不躲」机器人。走到 BOSS 前 6 米（毒囊关先走过封线），一直开枪，不躲、不翻滚、不放技能。
   4 套装备 × 两关，每种 N 局（默认 30），报赢几局、最低血量、吸血 / 自动回血 / 拾荒者 4 件回血各回了多少。
   用法：node tools/test/tank.mjs [局数]　　环境变量 GEAR=xiongL 只跑一套、STAGE=2 只跑一关 */
import { createFight, FB_CFG as CFG } from '../../src/js/fbcore.js';
import { fbHero, fbNew } from '../../src/js/fblogic.js';
const N = +(process.argv[2] || 30), LV = 25;
const G = { dmg: 10, dmgK: 0.15, rate: 0.4, rateK: 0.04, range: 7.5, rangePer: 0.15 }, N0 = { dmg: 45, dmgPer: 8, r: 2.6, rPer: 0.05, cd: 10, cdPer: 0.15 };
const hs = { dmg: G.dmg * (1 + G.dmgK * (LV - 1)), rate: G.rate / (1 + G.rateK * (LV - 1)), range: G.range + G.rangePer * (LV - 1), nadeDmg: N0.dmg + N0.dmgPer * (LV - 1), nadeR: N0.r + N0.rPer * (LV - 1), nadeCd: N0.cd - N0.cdPer * (LV - 1) };
export const GEARS = {
  none: {},
  e3x2: { w: ['e_w1', 3], h: ['e_h1', 3] },
  xiong: { w: ['e_w1', 7], h: ['s1_h', 12], a: ['n_a', 0], g: ['e_g2', 7], b: ['n_b', 0], m: ['e_m2', 7] },
  xiongL: { w: ['l1', 0], h: ['s1_h', 12], a: ['n_a', 0], g: ['e_g2', 7], b: ['n_b', 0], m: ['e_m2', 7] },
  s1x4: { w: ['s1_w', 6], h: ['s1_h', 6], a: ['s1_a', 6], g: ['s1_g', 6], b: ['n_b', 0], m: ['e_m2', 6] },   /* 拾荒者 4 件以上：看「挨打后 3 秒回 10%」回了多少 */
};
let seed = 7; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = process.env.GEAR ? process.env.GEAR.split(',') : ['none', 'e3x2', 'xiong', 'xiongL'], stages = process.env.STAGE ? [+process.env.STAGE] : [1, 2];
for (const gn of pick) for (const STG of stages) {
  const g = GEARS[gn], S = { fb: fbNew() }; let id = 1; for (const [s, [k, st]] of Object.entries(g)) S.fb.eq[s] = { id: id++, k, lv: 1, st };
  const hero = { ...fbHero(S, hs), speed: 5 };
  let wins = 0, tt = 0, minHp = 1, taken = 0; const heal = { leech: 0, regen: 0, s1: 0 };
  for (let r = 0; r < N; r++) {
    const st = createFight(STG, hero, { rng }); const P = st.player, B = st.boss; let lo = 1;
    while (!st.over && st.t < 400) {
      let mx = 0, mz = 0; const d = Math.hypot(P.x - B.x, P.z - B.z);
      if (STG === 2 && !st.locked) mz = -1; else if (d > 6) { mx = (B.x - P.x) / d; mz = (B.z - P.z) / d }
      /* 回血按来源记：先看这一帧前的状态 */
      const hp0 = P.hp, r10 = P.regen10 > 0, idle = P.hurtT > CFG.regenDelay;
      const tk0 = st.stats.taken;
      st.step(1 / 30, { mx, mz, fire: true, skill: null });
      /* 这一帧回了多少 = 血的变化 + 这一帧挨的打；先算自动回血、拾荒者 4 件，剩下的是吸血 */
      if (!P.dead) { const dt = 1 / 30; let h = Math.max(0, P.hp - hp0 + (st.stats.taken - tk0));
        const reg = idle ? Math.min(h, P.max * CFG.regen * dt) : 0; h -= reg; const s1 = r10 ? Math.min(h, P.max * 0.1 / 3 * dt) : 0; h -= s1;
        heal.regen += reg; heal.s1 += s1; heal.leech += h }
      lo = Math.min(lo, P.hp / P.max);
    }
    if (st.win) wins++; tt += st.t; minHp = Math.min(minHp, lo); taken += st.stats.taken;
  }
  console.log(`${gn.padEnd(6)} 关${STG}　生命 ${hero.hp}　减伤 ${(hero.dr * 100).toFixed(1)}%　吸血 ${(hero.leech * 100).toFixed(1)}%　| 站着不躲：赢 ${wins}/${N}　平均 ${(tt / N).toFixed(0)} 秒　最低血 ${(minHp * 100).toFixed(0)}%　挨打 ${(taken / N).toFixed(0)}/局　回血/局：吸血 ${(heal.leech / N).toFixed(0)}、自动 ${(heal.regen / N).toFixed(0)}、拾荒者4件 ${(heal.s1 / N).toFixed(0)}`);
}
