/* 设计 110b：施法条名字放得下（全场滚石、快速横扫、山崩、灭杀），844 / 667 */
export { pre } from './vtime.mjs';
export default async (pg, shot) => {
  const W = ms => pg.waitForTimeout(ms), ev = (f, a) => pg.evaluate(f, a), T = process.env.TAGW || '844';
  await ev(() => { const S = __g.S; S.lv.store = Math.max(5, S.lv.store); S.fb.tix = 99; S.fb.run = 0; S.fb.won = { 1: 1, 2: 1 }; S.fb.pend = null; __g.fbGo(3) });
  for (let i = 0; i < 120 && !(await ev(() => __g.FBV.active() && __g.FBV.phase() === 'fight')); i++) await W(1000);
  await W(4000); await ev(() => { __vtStart() });
  const pump = (s, o = {}) => ev(([s, o]) => { let evs = []; for (let i = 0; i < Math.round(s * 30); i++) { const F = __g.FBV.fight(); F.player.god = false; F.player.max = 1e6; if (F.player.hp < 5e5) F.player.hp = 1e6; F.boss.skillT = 99; F.boss.basicCd = 99; if (o.x != null) { F.player.x = o.x; F.player.z = o.z } __pump(1000 / 30); evs = evs.concat(F.ev.map(e => e.e)) } return evs }, [s, o]);
  const bar = () => ev(() => { const b = document.querySelector('#fbHud .bcast'), s = b.querySelector('span'); return `「${s.textContent}」字宽 ${Math.round(s.scrollWidth)} / 条宽 ${Math.round(b.clientWidth)}` });
  await pump(0.5, { x: 0.5, z: 6 });
  await ev(() => { const F = __g.FBV.fight(); F.boss.x = 0; F.boss.z = -8; F.player.x = 0.5; F.player.z = 6; F.forceCast('roll') }); await pump(0.6); console.log('滚石：', await bar()); await shot(`110b_施法条_全场滚石_${T}`);
  for (let i = 0; i < 40; i++) { const e = await pump(0.1); if (e.includes('bossLand')) break } await pump(0.1); console.log('快速横扫：', await bar()); await shot(`110b_施法条_快速横扫_${T}`);
  await pump(2);
  await ev(() => { const F = __g.FBV.fight(); F.forceCast('ava') }); await pump(0.8); console.log('山崩：', await bar()); await shot(`110b_施法条_山崩_${T}`);
  await pump(8);
  await ev(() => { const F = __g.FBV.fight(); F.t = 179.7 }); await pump(1.0); console.log('灭杀：', await bar()); await shot(`110b_施法条_灭杀_${T}`);
  for (const k of ['pillars', 'rift', 'grab']) { await ev(() => { const F = __g.FBV.fight(); F.t = 30 }); }
};
