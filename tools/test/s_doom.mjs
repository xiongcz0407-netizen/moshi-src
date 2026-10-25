/* 设计 106：灭杀（3 分钟到）、第 3 关地动 / 碎石雨截图。STAGE=1|2|3 */
export { pre } from './vtime.mjs';
export default async (pg, shot) => {
  const W = ms => pg.waitForTimeout(ms), ev = (f, a) => pg.evaluate(f, a), T = process.env.TAGW || '844', n = +(process.env.STAGE || 3), NM = ['', '屠夫', '毒囊', '落石巨人'][n];
  pg.on('pageerror', e => console.log('PAGEERR', e.message));
  await ev(n => { const S = __g.S; S.lv.store = Math.max(5, S.lv.store); S.td.scrolls = 99; S.fb.tix = 99; S.fb.run = 0; S.fb.won = { 1: 1, 2: 1 }; S.fb.pend = null; __g.fbGo(n) }, n);
  for (let i = 0; i < 120 && !(await ev(() => __g.FBV.active() && __g.FBV.phase() === 'fight')); i++) await W(1000);
  await W(4000); await ev(() => { __vtStart() });
  /* god：截技能时不掉血；灭杀那段不能 god（god 不吃灭杀） */
  const pump = (s, god = true, pos = null) => ev(([s, god, pos]) => { for (let i = 0; i < Math.round(s * 30); i++) { const F = __g.FBV.fight(); F.locked = true; if (god) { F.player.hp = F.player.max; F.player.god = true } else F.player.god = false; if (pos) { F.player.x = pos[0]; F.player.z = pos[1] } __pump(1000 / 30) } }, [s, god, pos]);
  const pos = process.env.POS ? process.env.POS.split(',').map(Number) : n === 2 ? [1.5, -4] : n === 3 ? [1, 3] : [1, 6], PF = process.env.PFX || '106', TG = process.env.TAG ? '_' + process.env.TAG : '';   /* 设计 106c：POS=x,z 主角站哪；NODOOM=1 只截地动、碎石雨 */
  await pump(1, true, pos);
  if (n === 3) {   /* 山崩：读条 → 砸地（地动）→ 碎石雨 */
    await ev(() => { const F = __g.FBV.fight(); F.boss.x = 0; F.boss.z = -5; F.forceCast('ava') }); await pump(1.95, true, pos);
    await ev(() => { const P = __g.FBV.fight().player; P.god = false; P.max0 = P.max; P.max = P.hp = 6000 });   /* 截图用：血加厚，碎石雨期间站着不动也不会被落石砸死（看得到碎石雨在掉血） */
    for (let i = 0; i < 6; i++) { await pump(1 / 30, false, pos); const q = await ev(() => __g.FBV.fight().ev.some(e => e.e === 'quake')); if (q) break }
    await pump(0.3, false, pos); console.log('地动：主角血', await ev(() => { const P = __g.FBV.fight().player; return `${Math.round(P.hp)} / ${P.max}` })); await shot(`${PF}_落石巨人_地动_全场尘土${TG}_${T}`);
    await pump(2.5, false, pos); console.log('碎石雨 2.5 秒：主角血', await ev(() => { const P = __g.FBV.fight().player; return `${Math.round(P.hp)} / ${P.max}` })); await shot(`${PF}_落石巨人_碎石雨中${TG}_${T}`);
    await pump(4, true, pos); await ev(() => { const P = __g.FBV.fight().player; P.max = P.hp = P.max0 }) }
  if (process.env.NODOOM) return;
  await ev(() => { const F = __g.FBV.fight(); F.t = 179.6; F.player.hp = F.player.max });
  await pump(0.5, false, pos); await shot(`106_${NM}_BOSS狂暴字_${T}`);
  await pump(0.9, false, pos); await shot(`106_${NM}_灭杀读条_${T}`);
  for (let i = 0; i < 40; i++) { await pump(1 / 30, false, pos); if (await ev(() => __g.FBV.fight().doom && __g.FBV.fight().doom.n >= 1)) break }
  await pump(0.15, false, pos); console.log(`${NM} 灭杀第 1 次：主角血`, await ev(() => { const P = __g.FBV.fight().player; return `${Math.round(P.hp)} / ${P.max}` })); await shot(`106_${NM}_灭杀打下来_${T}`);
  await pump(6.2, false, pos); console.log(`${NM} 灭杀第 2 次：`, await ev(() => { const F = __g.FBV.fight(); return `倒下 ${F.player.dead}，第 ${(F.over - 180).toFixed(1)} 秒` }));
};
