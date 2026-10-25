/* 设计 95：毒囊酸液喷吐在锁定区域里各位置能不能躲开（走路 / 走路 + 翻滚，普通 / 狂暴）。用法：node tools/test/spitdodge.mjs */
import { createFight, inWarn, ARENA } from '../../src/js/fbcore.js';
import { fbHero, fbNew } from '../../src/js/fblogic.js';
const LV = 25, G = { dmg: 10, dmgK: 0.15, rate: 0.4, rateK: 0.04, range: 7.5, rangePer: 0.15 }, N0 = { dmg: 45, dmgPer: 8, r: 2.6, rPer: 0.05, cd: 10, cdPer: 0.15 };
const hs = { dmg: G.dmg * (1 + G.dmgK * (LV - 1)), rate: G.rate / (1 + G.rateK * (LV - 1)), range: G.range + G.rangePer * (LV - 1), nadeDmg: N0.dmg + N0.dmgPer * (LV - 1), nadeR: N0.r + N0.rPer * (LV - 1), nadeCd: N0.cd };
const hero = { ...fbHero({ fb: fbNew() }, hs), speed: 5 };
const out = [];
const run = (rage, x, z, side, roll) => { const st = createFight(2, hero, {}); const P = st.player; P.x = x; P.z = -4; while (!st.locked) st.step(1 / 60, { mz: -1 });
  for (let i = 0; i < 120; i++) st.step(1 / 60, {}); P.x = x; P.z = z; st.rage = rage; st.boss.calm = 0; st.boss.skillT = 99;
  st.forceCast('spit'); const w = st.boss.cast.w, dur = st.boss.cast.dur; const sx = Math.cos(w.yaw) * side, sz = -Math.sin(w.yaw) * side;
  let t = 0, hpb = P.hp, rolled = false; while (st.boss.cast && t < 3) { const sk = roll && !rolled && t > 0.15 ? (rolled = true, 'roll') : null; st.step(1 / 60, { mx: sx, mz: sz, skill: sk }); t += 1 / 60 }
  return { hit: P.hp < hpb, dur } };
for (const rage of [false, true]) for (const z of [-5.42, -8, -11, -13.5]) for (const x of [-6.5, -3, 0, 3, 6.5]) {
  const walk = [1, -1].some(sd => !run(rage, x, z, sd, false).hit), roll = [1, -1].some(sd => !run(rage, x, z, sd, true).hit);
  out.push(`${rage ? '狂暴' : '普通'} (${x}, ${z})：走 ${walk ? '躲开' : '躲不开'}，走+翻滚 ${roll ? '躲开' : '躲不开'}`) }
console.log(out.filter(l => l.includes('躲不开')).join('\n') || '全部躲得开'); console.log('共', out.length, '个位置');
