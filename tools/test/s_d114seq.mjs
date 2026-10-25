/* 设计 114：连拍（每 0.3 秒一张，约 7 秒）：扔鸦弹 → 刺耳尖叫 → 错乱 → 闪到身前 → 鸦群喷射；拼成一张 */
export { pre } from './vtime.mjs';
export default async (pg, shot) => {
  const W = ms => pg.waitForTimeout(ms), ev = (f, a) => pg.evaluate(f, a), T = process.env.TAGW || '844';
  pg.on('pageerror', e => console.log('PAGEERR', e.message));
  await ev(() => { const S = __g.S; S.lv.store = Math.max(5, S.lv.store); S.fb.tix = 99; S.fb.run = 0; S.fb.won = { 1: 1, 2: 1, 3: 1 }; S.fb.pend = null; __g.fbGo(4) });
  for (let i = 0; i < 120 && !(await ev(() => __g.FBV.active() && __g.FBV.phase() === 'fight')); i++) await W(1000);
  await W(3000); await ev(() => { __vtStart() });
  const pump = s => ev(s => { for (let i = 0; i < Math.round(s * 30); i++) { const F = __g.FBV.fight(); F.player.max = 1e6; if (F.player.hp < 5e5) F.player.hp = 1e6; F.boss.skillT = 99; F.boss.basicCd = 99; F.boss.blinkT = 99; __pump(1000 / 30) } }, s);
  await ev(() => { const F = __g.FBV.fight(); F.boss.x = 0; F.boss.z = -2; F.boss.act = 'idle'; F.player.x = 0.5; F.player.z = 6 }); await pump(0.5);
  let n = 0; const snap = async () => { await shot(`114连拍_${String(++n).padStart(2, '0')}_${T}`) };
  await ev(() => __g.FBV.fight().forceCast('bolt')); for (let i = 0; i < 4; i++) { await pump(0.25); await snap() }
  await pump(0.6); await ev(() => __g.FBV.fight().forceCast('shriek')); for (let i = 0; i < 18; i++) { await pump(0.3); await snap() }
};
