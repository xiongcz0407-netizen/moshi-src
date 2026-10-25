/* 设计 110：石柱眩晕、全场滚石（红 + 绿色安全区）、禁锢 + BOSS 跳过来快速横扫、掩体被扔光时补石头 */
export { pre } from './vtime.mjs';
export default async (pg, shot) => {
  const W = ms => pg.waitForTimeout(ms), ev = (f, a) => pg.evaluate(f, a), T = process.env.TAGW || '844';
  pg.on('pageerror', e => console.log('PAGEERR', e.message));
  await ev(() => { const S = __g.S; S.lv.store = Math.max(5, S.lv.store); S.fb.tix = 99; S.fb.run = 0; S.fb.won = { 1: 1, 2: 1 }; S.fb.pend = null; __g.fbGo(3) });
  for (let i = 0; i < 120 && !(await ev(() => __g.FBV.active() && __g.FBV.phase() === 'fight')); i++) await W(1000);
  await W(4000); await ev(() => { __vtStart() });
  /* 不用 god（god 不吃眩晕 / 禁锢），血调很厚；BOSS 别自己出招 */
  const pump = (s, o = {}) => ev(([s, o]) => { let evs = []; for (let i = 0; i < Math.round(s * 30); i++) { const F = __g.FBV.fight(); F.player.god = false; F.player.max = 1e6; if (F.player.hp < 5e5) F.player.hp = 1e6; F.boss.skillT = 99; F.boss.basicCd = 99; if (o.x != null) { F.player.x = o.x; F.player.z = o.z } __pump(1000 / 30); evs = evs.concat(F.ev.map(e => e.e)) } return evs }, [s, o]);
  const until = async (name, max = 8, o = {}) => { for (let i = 0; i < max * 10; i++) { const e = await pump(0.1, o); if (e.includes(name)) return true } return false };
  const stat = () => ev(() => { const F = __g.FBV.fight(), P = F.player, B = F.boss; return `主角 (${P.x.toFixed(1)}, ${P.z.toFixed(1)}) 眩晕 ${(P.stunT || 0).toFixed(2)} 禁锢 ${(P.rootT || 0).toFixed(2)} | 巨人 (${B.x.toFixed(1)}, ${B.z.toFixed(1)}) ${B.act} 离地 ${(B.jumpY || 0).toFixed(1)} 施法 ${B.cast ? B.cast.nm || B.cast.k : '-'}` });
  await pump(0.5, { x: 0.3, z: 4 });
  /* 1. 石柱阵：站着不动，第 3 波 + 眩晕 */
  await ev(() => { const F = __g.FBV.fight(); F.boss.x = 0; F.boss.z = -6; F.forceCast('pillars') });
  let waves = 0, stunShot = false; for (let i = 0; i < 80 && waves < 3; i++) { const e = await pump(0.1, { x: 0.3, z: 4 }); waves += e.filter(x => x === 'pillars').length;
    if (!stunShot && e.includes('pstun')) { stunShot = true; await pump(0.1); console.log(`石柱第 ${waves} 波打中：`, await stat()); await shot(`110_石柱阵_被打中_眩晕_${T}`) } }
  await pump(0.15); console.log('石柱第 3 波：', await stat()); await shot(`110_石柱阵_第3波_${T}`);
  await pump(3);
  /* 2. 全场滚石：预警（整片红 + 掩体后绿色）、滚到一半 */
  await ev(() => { const F = __g.FBV.fight(); F.boss.x = 0; F.boss.z = -8; F.player.x = 0.5; F.player.z = 6; F.forceCast('roll') }); await pump(1.0); console.log('滚石预警：', await stat()); await shot(`110_全场滚石_预警_红和绿色安全区_${T}`);
  await pump(1.4); console.log('滚到一半：', await stat()); await shot(`110_全场滚石_滚到一半_${T}`);
  /* 3. 被砸中禁锢 → BOSS 跳过来 → 快速横扫预警 */
  const got = await until('proot', 3); console.log('禁锢：', got, await stat());
  await pump(0.25); console.log('跳在半空：', await stat()); await shot(`110_禁锢_BOSS跳过来_${T}`);
  await until('bossLand', 2); await pump(0.2); console.log('横扫预警：', await stat()); await shot(`110_禁锢_快速横扫预警_${T}`);
  await pump(2);
  /* 4. 掩体被扔光：放滚石前从天上补 */
  await ev(() => __g.FBV.fight().clearCovers()); await pump(0.5, { x: 0, z: 4 });
  await ev(() => { const F = __g.FBV.fight(); F.boss.x = 0; F.boss.z = -9; F.forceCast('roll') }); await pump(0.75, { x: 0, z: 4 }); console.log('补石头：', await ev(() => __g.FBV.fight().coverN()), '个真掩体'); await shot(`110_掩体扔光_天上补石头_${T}`);
};
