/* 设计 56：副本战斗模拟。用法：node tools/fbsim.mjs [局数] [主角等级]（环境变量 GEAR=1 给一套史诗 3 星试试）
   主角按 25 级（没装备）；机器人：保持 6～7 米、躲预警（来不及就翻滚）、80% 时间按着攻击、集火好了就放、震荡弹打断冲锋 / 叫小丧尸（70%） */
import { createFight, inWarn, ARENA, FB_CFG, segHit, COVERS, push, detour } from '../src/js/fbcore.js';
import { fbHero, fbNew } from '../src/js/fblogic.js';
import { BOSSES } from '../src/js/fbcfg.js';
const N = +(process.argv[2] || 200), LV = +(process.argv[3] || 25), STG = +(process.env.STAGE || 1);   /* 设计 81：STAGE=2 打毒囊 */
const HP = { base: 100, per: 20 }, G = { dmg: 10, dmgK: 0.15, rate: 0.4, rateK: 0.04, range: 7.5, rangePer: 0.15 };
const N0 = { dmg: 45, dmgPer: 8, r: 2.6, rPer: 0.05, cd: 10, cdPer: 0.15 };
const hs = { dmg: G.dmg * (1 + G.dmgK * (LV - 1)), rate: G.rate / (1 + G.rateK * (LV - 1)), range: G.range + G.rangePer * (LV - 1), nadeDmg: N0.dmg + N0.dmgPer * (LV - 1), nadeR: N0.r + N0.rPer * (LV - 1), nadeCd: N0.cd - N0.cdPer * (LV - 1) };
let seed = 7; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const S = { fb: fbNew() };
/* 设计 81：GEARSET=e3x2 → 2 件史诗 3 星（第 1 关刷出来的武器 + 头盔，第 2 关的过关装备线） */
if (process.env.GEARSET === 'e3x2') { S.fb.eq.w = { id: 1, k: 'e_w1', lv: 1, st: 3 }; S.fb.eq.h = { id: 2, k: 'e_h1', lv: 1, st: 3 } }
const hero = { ...fbHero(S, hs), speed: 5 };
const GAP = { norm: [], rage: [], min: { norm: { g: 1e9 }, rage: { g: 1e9 } }, spit: new Set(), end: null, wasBusy: false };   // 设计 92
let SL = null; const DBG = []; const res = [], SRC = {}, FT = { n: 0, boss: 0, mob: 0, none: 0, blk: 0, sh: 0, stuck: 0, flip: 0 };
for (let r = 0; r < N; r++) {
  const st = createFight(STG, hero, { rng }); const P = st.player, B = st.boss; GAP.end = null; GAP.wasBusy = false;
  let fireOn = true, fireT = 0, stunWait = -1, dt = 1 / 30;
  while (!st.over && st.t < 400) {
    fireT -= dt; if (fireT <= 0) { fireOn = rng() < 0.8; fireT = 0.4 + rng() * 0.8 }
    /* 想站的位置：BOSS 南边 6.5 米 */
    let mx = 0, mz = 0;
    const dx = P.x - B.x, dz = P.z - B.z, d = Math.hypot(dx, dz) || 1, want = STG === 2 ? 13.0 : 6.5;
    if (STG === 2) {   /* 毒囊不走动：在离它 13.6 米那条弧上挑一个不在毒池、毒雾、预警里、离自己最近的点站 */
      const HZ = [...st.warns, ...(st.hazards || [])]; let best = null;
      for (let a = -0.42; a <= 0.42; a += 0.06) { const q = { x: B.x + Math.sin(a) * want, z: B.z + Math.cos(a) * want }; if (q.x < ARENA.x0 + 0.8 || q.x > ARENA.x1 - 0.8) continue; push(q, 0.42);
        const sc = Math.hypot(q.x - P.x, q.z - P.z) + (HZ.some(w => inWarn(w, q.x, q.z, 0.9)) ? 100 : 0); if (!best || sc < best.sc) best = { ...q, sc } }
      if (best) { const gx = best.x - P.x, gz = best.z - P.z, gl = Math.hypot(gx, gz); if (gl > 0.4) { mx = gx / gl; mz = gz / gl } }
    } else { if (Math.abs(d - want) > 0.8) { const k = d > want ? -1 : 1; mx = dx / d * k; mz = dz / d * k } mx += (0 - P.x) * 0.05; if (P.z < -9) mz += 0.4; if (P.z > 16) mz -= 0.4 }
    if (segHit(P.x, P.z, B.x, B.z) !== null) { const g = detour(P, B, 0.42); const l = Math.hypot(g.x - P.x, g.z - P.z) || 1; mx = (g.x - P.x) / l; mz = (g.z - P.z) / l }
    { let near = null, nd = 3.2; for (const m of st.mobs) { if (m.dead || m.rise > 0) continue; const q = Math.hypot(m.x - P.x, m.z - P.z); if (q < nd) { nd = q; near = m } }
      if (near) { let ex = P.x - near.x, ez = P.z - near.z; const l = Math.hypot(ex, ez) || 1; ex /= l; ez /= l; if (P.x + ex * 1.5 < ARENA.x0 + 0.6 || P.x + ex * 1.5 > ARENA.x1 - 0.6) { ex = 0; ez = ez >= 0 ? 1 : -1 } if (P.z + ez * 1.5 > ARENA.z1 - 0.6 || P.z + ez * 1.5 < ARENA.z0 + 0.6) { ez = 0; ex = P.x > 0 ? -1 : 1 } mx = ex; mz = ez } }
    let skill = null, danger = null;
    for (const w of [...st.warns, ...(st.hazards || [])]) if (inWarn(w, P.x, P.z, 0.7)) { danger = w; break }
    if (danger) { const w = danger; let best = null;
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, ex = Math.sin(a), ez = Math.cos(a), q = { x: P.x, z: P.z }; let tt = 0;
        for (; tt < 3; tt += 0.05) { q.x += ex * 0.25; q.z += ez * 0.25; push(q, 0.42); if (![...st.warns, ...(st.hazards || [])].some(v => inWarn(v, q.x, q.z, 0.6))) break }
        const sc = tt + (STG === 2 ? (Math.hypot(q.x - B.x, q.z - B.z) > st.hero.range + st.bossR - 0.4 ? 0.6 : 0) : 0.02 * Math.hypot(q.x, q.z - 3) / 5); if (!best || sc < best.sc) best = { sc, ex, ez, tt } }
      if (STG === 2 && P.esc && st.t - P.esc.t < 0.5) best = { ...best, ex: P.esc.x, ez: P.esc.z }; else P.esc = { x: best.ex, z: best.ez, t: st.t };   /* 毒池挨着时别来回抖：方向保持 0.5 秒 */
      mx = best.ex; mz = best.ez;
      if (w.dur != null && w.dur - w.t < best.tt + 0.12 && P.charges > 0) skill = 'roll';
    }
    if (!skill && P.cd.focus <= 0 && fireOn) skill = 'focus';
    if (!skill && P.cd.nade <= 0 && (st.mobs.some(m => !m.dead && m.rise <= 0) || Math.hypot(P.x - B.x, P.z - B.z) < hs.range)) skill = 'nade';
    if (!skill && B.cast && B.interruptible && B.cast.k !== 'swing' && B.cast.k !== 'spit') { if (stunWait < 0) stunWait = rng() < 0.7 ? 0.3 : 99; stunWait -= dt; if (stunWait <= 0 && P.cd.stun <= 0) { skill = 'stun'; stunWait = -1 } } else if (!B.cast) stunWait = -1;
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml }
    if (process.env.TRACE && r === 0 && Math.floor(st.t * 30) % 60 === 0) console.log(st.t.toFixed(0), 'P', P.x.toFixed(1), P.z.toFixed(1), 'B', B.x.toFixed(1), B.z.toFixed(1), B.act, 'd', d.toFixed(1), 'tg', P.target === B ? 'boss' : P.target ? 'mob' : '-', 'mv', mx.toFixed(1), mz.toFixed(1), danger ? 'DANGER' : '');
    /* 设计 64：有输入但几乎没动的帧数（翻滚、击退不算）；脸一帧转超过 70° 的次数 */
    const px0 = P.x, pz0 = P.z, yaw0 = P.yaw, rollB = !!P.roll || !!P.kb;
    if (process.env.DBG2 && r === 0 && st.t > 8 && st.t < 8.3) console.log('dbg', st.t.toFixed(2), P.x.toFixed(2), P.z.toFixed(2), mx.toFixed(2), mz.toFixed(2), skill, st.moveK, JSON.stringify(P.kb), !!P.roll, P.inv.toFixed(2), danger && danger.type);
    st.step(dt, { mx, mz, fire: fireOn, skill });
    /* 设计 92：两个技能之间的空档（上一个硬直结束 → 下一个开始读条）、喷吐预警时长 */
    if (STG === 2) { const busy = B.act === 'recover' || B.act === 'stun' || B.act === 'cast';
      if (GAP.wasBusy && !busy && !B.dead) GAP.end = st.t - dt;
      for (const e of st.ev) if (e.e === 'cast') { if (GAP.end != null) { const g = st.t - dt - GAP.end, key = st.rage ? 'rage' : 'norm'; GAP[key].push(g); if (g < GAP.min[key].g) GAP.min[key] = { g, k: e.k } } GAP.end = null; if (e.k === 'spit') GAP.spit.add((st.rage ? '狂暴 ' : '') + e.dur.toFixed(2)) }
      GAP.wasBusy = busy || !!B.cast }
    { const want = Math.hypot(mx, mz), got = Math.hypot(P.x - px0, P.z - pz0) / dt; const intoWall = (P.x >= ARENA.x1 - 0.43 && mx > 0.5 * want) || (P.x <= ARENA.x0 + 0.43 && mx < -0.5 * want) || (P.z <= ARENA.z0 + 0.43 && mz < -0.5 * want) || (P.z >= ARENA.z1 - 0.43 && mz > 0.5 * want);
      if (want > 0.5 && !intoWall && !rollB && !P.roll && !P.kb && !P.dead && got < want * st.hero.speed * st.hero.spd * 0.15) { FT.stuck++; if (process.env.STK) { const why = Math.hypot(P.x - B.x, P.z - B.z) < 1.8 ? 'boss' : Math.abs(P.x) > 6.0 || P.z < ARENA.z0 + 0.6 || P.z > ARENA.z1 - 0.6 ? 'edge' : 'cover/other'; FT.why = FT.why || {}; FT.why[why] = (FT.why[why] || 0) + 1; if (FT.why[why] < 4) console.log('stuck', why, P.x.toFixed(2), P.z.toFixed(2), 'in', mx.toFixed(2), mz.toFixed(2), 'B', B.x.toFixed(1), B.z.toFixed(1)) } } let dy = P.yaw - yaw0; dy = Math.abs(Math.atan2(Math.sin(dy), Math.cos(dy))); if (dy > 70 * Math.PI / 180 && !P.roll) FT.flip++ }
    FT.n++; if (P.target === B) FT.boss++; else if (P.target) FT.mob++; else if (fireOn) FT.none++; for (const e of st.ev) { if (e.e === 'shot' && e.blocked) FT.blk++; if (e.e === 'shot') FT.sh++ } for (const e of st.ev) { if (e.e === 'cast' && e.k === 'slam') SL = { d0: Math.hypot(P.x - B.x, P.z - B.z).toFixed(1), x: P.x.toFixed(1), z: P.z.toFixed(1), ch: P.charges }; if (e.e === 'pdmg' && e.src === 'slam' && DBG.length < 8) DBG.push({ ...SL, d1: Math.hypot(P.x - B.x, P.z - B.z).toFixed(1), x1: P.x.toFixed(1), z1: P.z.toFixed(1), ch1: P.charges, inv: P.inv.toFixed(2) }) } for (const e of st.ev) if (e.e === 'pdmg') SRC[e.src] = (SRC[e.src] || 0) + e.a / N;
  }
  res.push({ bhp: B.hp / B.max * 100, win: st.win, t: st.over || st.t, hp: P.hp / P.max, taken: st.stats.taken, casts: st.stats.casts, mobs: st.stats.mobsKilled, intr: st.stats.interrupts });
}
if (STG === 2) { const q = a => a.sort((x, y) => x - y)[Math.floor(a.length / 2)]; console.log(`设计 92：技能之间最短空档 普通 ${GAP.min.norm.g.toFixed(2)} 秒（下一个是 ${GAP.min.norm.k}），狂暴 ${GAP.min.rage.g === 1e9 ? '-' : GAP.min.rage.g.toFixed(2) + ' 秒（' + GAP.min.rage.k + '）'}；空档中位 ${q(GAP.norm)?.toFixed(2)} / 狂暴 ${GAP.rage.length ? q(GAP.rage).toFixed(2) : '-'}；喷吐预警 ${[...GAP.spit].join('、')} 秒`) }
const wins = res.filter(r => r.win), ts = wins.map(r => r.t).sort((a, b) => a - b), avg = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const cast = {}; for (const r of res) for (const [k, v] of Object.entries(r.casts)) cast[k] = (cast[k] || 0) + v / N;
console.log(`${BOSSES[STG].name} 血 ${BOSSES[STG].hp}，角色页 ${LV} 级：血 ${hero.hp}（基础）伤害 ${hero.dmg.toFixed(1)}×3 发 / ${hero.rate.toFixed(3)} 秒，手雷 ${Math.round(hero.nadeDmg)} 每 ${hero.nadeCd.toFixed(1)} 秒`);
console.log(`${N} 局：赢 ${wins.length}（${(wins.length / N * 100).toFixed(0)}%）  用时 平均 ${avg(ts).toFixed(1)} 秒，中位 ${ts[Math.floor(ts.length / 2)]?.toFixed(1)}，10%～90% ${ts[Math.floor(ts.length * 0.1)]?.toFixed(1)}～${ts[Math.floor(ts.length * 0.9)]?.toFixed(1)}`);
console.log(`剩血 平均 ${(avg(wins.map(r => r.hp)) * 100).toFixed(0)}%，挨打 ${avg(res.map(r => r.taken)).toFixed(0)}，打小丧尸 ${avg(res.map(r => r.mobs)).toFixed(1)}，打断 ${avg(res.map(r => r.intr)).toFixed(1)}`);
console.log('每局挨打（来源）', Object.entries(SRC).map(([k, v]) => `${k} ${v.toFixed(0)}`).join('，'), ' 死的时间', avg(res.filter(r => !r.win).map(r => r.t)).toFixed(0), ' BOSS 剩血', avg(res.map(r=>r.bhp)).toFixed(0));
if (FT.why) console.log(JSON.stringify(FT.why));
console.log(`设计 64：有输入但几乎没动 每局 ${(FT.stuck / res.length).toFixed(1)} 帧（翻滚、击退、自己往两边崖壁上顶不算）；脸一帧转超过 70°（翻滚不算）每局 ${(FT.flip / res.length).toFixed(1)} 次`);
console.log(`时间：打 BOSS ${(FT.boss / FT.n * 100).toFixed(0)}%，打小怪 ${(FT.mob / FT.n * 100).toFixed(0)}%，按着但没目标 ${(FT.none / FT.n * 100).toFixed(0)}%；子弹被挡 ${(FT.blk / FT.sh * 100).toFixed(0)}%`);
console.log('每局放技能', Object.entries(cast).map(([k, v]) => `${k} ${v.toFixed(1)}`).join('，'));

