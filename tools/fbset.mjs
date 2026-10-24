/* 设计 59 套装验收：同星数（默认 12 星）下比输出。
   A = 5 件套；B = 4 件套 + 1 件最好的传说（试遍缺哪一格、放哪件传说，取最高）；C = 5 件最好的散装传说（每格挑输出最高的那件）。
   输出 = 打 BOSS 的期望每秒伤害：普攻（3 发连射）× 暴击期望 × 对 BOSS + 集火 + 手雷；角色页按 25 级，护符都不穿（三组一样）。
   用法：node tools/fbset.mjs [星数] */
import { fbHero, fbNew } from '../src/js/fblogic.js';
import { ITEMS, SKILLS, SETS } from '../src/js/fbcfg.js';
if (process.env.SET) { const [a, b, c, d] = process.env.SET.split(',').map(Number); SETS.s1.four4 = a; SETS.s1.five5 = b; SETS.s2.four4 = c; SETS.s2.five5 = d }
const ST = +(process.argv[2] ?? 12), LV = 25; let MODE = 'dps';
const G = { dmg: 10, dmgK: 0.15, rate: 0.4, rateK: 0.04, range: 7.5, rangePer: 0.15 }, N0 = { dmg: 45, dmgPer: 8, r: 2.6, rPer: 0.05, cd: 10, cdPer: 0.15 };
const hs = { dmg: G.dmg * (1 + G.dmgK * (LV - 1)), rate: G.rate / (1 + G.rateK * (LV - 1)), range: G.range + G.rangePer * (LV - 1), nadeDmg: N0.dmg + N0.dmgPer * (LV - 1), nadeR: N0.r, nadeCd: N0.cd - N0.cdPer * (LV - 1) };
let id = 1; const it = k => ({ id: id++, k, lv: ITEMS[k].lv || 10, st: Math.min(ST, { n: 6, e: 9, s: 12, l: 12 }[ITEMS[k].q]) });
function dps(keys) {
  const S = { fb: fbNew() }; for (const k of keys) S.fb.eq[ITEMS[k].slot] = it(k); S.fb.sk = { focus: 10, roll: 10, stun: 10 };
  const h = fbHero(S, hs), critF = 1 + Math.min(0.6, h.crit + h.bossCrit) * (h.cdmg - 1);
  const gun = 3 * h.dmg / h.rate * critF * h.boss;
  const fcd = SKILLS.focus.cd(10) * (1 - h.cdr) * (h.s2four ? 0.7 : 1), focus = SKILLS.focus.shots * SKILLS.focus.mult(10) * h.dmg * critF * h.boss / fcd;
  const nade = h.nadeDmg * h.boss / h.nadeCd;
  const v = gun + focus + nade; return MODE === 'pow' ? v * h.hp / (1 - h.dr) / 1000 : v;
}
const LEG = Object.keys(ITEMS).filter(k => ITEMS[k].q === 'l' && ITEMS[k].slot !== 'm');
const SLOT5 = ['w', 'h', 'a', 'g', 'b'];
const bestLeg = (sl, band) => LEG.filter(k => ITEMS[k].slot === sl && band.includes(ITEMS[k].lv)).map(k => [k, dps([k])]).sort((a, b) => b[1] - a[1]).map(x => x[0])[0];
let ok = true;
for (const set of ['s1', 's2']) {
  MODE = set === 's1' ? 'pow' : 'dps';   // 拾荒者是生存套：比「输出 × 有效生命」
  /* 同一段的传说：拾荒者（1～5 关掉）比 1～5 关的传说，猎杀者（6～10 关）比全部传说 */
  const band = set === 's1' ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], LB = LEG.filter(k => band.includes(ITEMS[k].lv));
  const C = SLOT5.map(sl => bestLeg(sl, band)).filter(Boolean), dC = C.length === 5 ? dps(C) : 0;
  const A = SLOT5.map(sl => `${set}_${sl}`), dA = dps(A);
  let best = null; for (const miss of SLOT5) for (const L of LB.filter(k => ITEMS[k].slot === miss)) { const keys = [...A.filter(k => ITEMS[k].slot !== miss), L], d = dps(keys); if (!best || d > best.d) best = { d, keys, L } }
  const r1 = dA / best.d, r2 = dC ? best.d / dC : 99;
  console.log(`${set === 's1' ? '拾荒者' : '猎杀者'}（${ST} 星）：5 件套 ${dA.toFixed(0)}/秒；4 件 + ${ITEMS[best.L].name} ${best.d.toFixed(0)}/秒；5 件散装传说（${C.map(k => ITEMS[k].name).join('、')}）${dC ? dC.toFixed(0) + '/秒' : '凑不齐 5 格'}`);
  console.log(`  5 件套 ÷ (4 件 + 传说) = ${r1.toFixed(3)}（要 ≥ 1.05）${r1 >= 1.05 ? ' ✓' : ' ✗'}；(4 件 + 传说) ÷ 散装 = ${r2.toFixed(3)}（要 ≥ 1.15）${r2 >= 1.15 ? ' ✓' : ' ✗'}`);
  ok = ok && r1 >= 1.05 && r2 >= 1.15;
}
/* 设计 62：猎杀者 5 件（毕业套）打 BOSS 的输出 ≥ 拾荒者 5 件 × 1.15 */
{ MODE = 'dps'; const d1 = dps(SLOT5.map(sl => `s1_${sl}`)), d2 = dps(SLOT5.map(sl => `s2_${sl}`)), r3 = d2 / d1;
  console.log(`猎杀者 5 件 ${d2.toFixed(0)}/秒 ÷ 拾荒者 5 件 ${d1.toFixed(0)}/秒 = ${r3.toFixed(3)}（要 ≥ 1.15）${r3 >= 1.15 ? ' ✓' : ' ✗'}`); ok = ok && r3 >= 1.15 }
console.log(ok ? '都过' : '没过');
