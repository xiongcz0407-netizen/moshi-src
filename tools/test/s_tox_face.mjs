/* 设计 95：锁定区域里各位置毒囊头顶、下巴、胸口在屏幕上的位置（SCAN=1 扫整个区域，POOL=1 毒池最多一张；MODE=old 只截一张对比） */
export { pre } from './vtime.mjs';
export default async (pg, shot) => {
  const W = ms => pg.waitForTimeout(ms), ev = (f, a) => pg.evaluate(f, a), T = process.env.TAGW || '844', MODE = process.env.MODE || 'new';
  await ev(() => { const S = __g.S; S.lv.store = Math.max(5, S.lv.store); S.td.scrolls = 99; S.fb.run = 0; S.fb.won = { 1: 1 }; S.fb.pend = null; __g.fbGo(2) });
  for (let i = 0; i < 90 && !(await ev(() => __g.FBV.active() && __g.FBV.phase() === 'fight')); i++) await W(1000);
  await ev(() => { __vtStart() }); await W(2500);
  const pump = (s, o = {}) => ev(([s, o]) => { for (let i = 0; i < Math.round(s * 60); i++) { const F = __g.FBV.fight(); F.player.hp = F.player.max; F.player.god = true; if (o.mz) F.player.z += o.mz * 5 / 60; if (!o.cast) { F.boss.skillT = 99; F.boss.spitCd = 99 } if (o.x != null) { F.player.x = o.x; F.player.z = o.z } __pump(1000 / 60) } }, [s, o]);
  const info = nm => ev(nm => { const F = __g.FBV.fight(), P = F.player, cam = __g.camera, V = __g.THREE.Vector3, H = innerHeight, st = __fbstg(); const pj = (x, y, z) => Math.round((1 - new V(x, y, z).project(cam).y) / 2 * H);
    const f = st.face(), ch = st.bone.Chest.getWorldPosition(new V()); const hud = Math.round(document.querySelector('#fbHud .fbb').getBoundingClientRect().bottom);
    const top = pj(f.x, f.top, f.z), chin = pj(f.x, f.chin - 0.25, f.z), chest = pj(ch.x, ch.y, ch.z), feet = H - pj(P.x, 0, P.z);
    return `${nm}：主角 (${P.x.toFixed(1)}, ${P.z.toFixed(1)}) 离崖边 ${(P.z + 16).toFixed(1)} 米 | 头顶 ${top}px 下巴 ${chin}px 胸口 ${chest}px（BOSS 框下沿 ${hud}px，画面高 ${H}）→ 整张脸${top >= hud ? '在框下面' : '有一部分在框后面'}，胸口${chest > 0 && chest < H ? '在画面里' : '不在'} | 脚离底 ${feet}px（≥ ${Math.round(H / 8)}）` }, nm);
  if (MODE === 'old') { await pump(2, { x: 0, z: -11 }); await pump(1, { x: 0, z: -11 }); await shot(`95_缩小前_主角离崖边5米_${T}`); return }
  /* 走过封线 */
  await pump(0.1); while (!(await ev(() => __g.FBV.fight().locked))) await pump(0.1, { mz: -1 });
  await pump(0.15); if (!process.env.SCAN) { console.log(await info('锁死那一刻')); await shot(`95_锁死那一刻_${T}`) }
  if (!process.env.SCAN) for (const [nm, x, z] of [['最南边', 0, -5.42], ['最南边左角', -6.58, -5.42], ['离崖边6米', 0, -10], ['贴着毒囊', 0, -14.8], ['缩小后_离崖边5米', 0, -11]]) { await pump(2, { x, z }); console.log(await info(nm)); await shot(`95_${nm}_${T}`) }
  /* 一路扫：区域里每 0.5 米 */
  if (process.env.SCAN) { const fast = (x, z) => ev(([x, z]) => { for (let i = 0; i < 15; i++) { const F = __g.FBV.fight(); F.player.x = x; F.player.z = z; F.player.god = true; F.boss.skillT = 99; F.boss.spitCd = 99; __pump(1000 / 15) } }, [x, z]);
  const bad = []; for (let z = -5.42; z >= -14.8; z -= 0.5) for (const x of [-6.58, 0, 6.58]) { await fast(x, z); const s = await info(''); if (/有一部分在框后面/.test(s) && z <= -10) bad.push(s); if (/胸口不在/.test(s)) bad.push(s) } console.log('扫区域：', bad.length ? bad.join('\n') : '离崖边 6 米内整张脸都在框下面；整个区域胸口都在画面里') }
  if (!process.env.POOL) return;
  /* 毒池最多：连放毒弹（半血后 5 个），主角站中间 */
  await ev(() => { const F = __g.FBV.fight(); F.boss.hp = F.boss.max * 0.45 }); 
  for (let i = 0; i < 4; i++) { await pump(0.2, { x: [-3, 3, 0, -1][i], z: [-8, -9, -11, -7][i] }); await ev(() => __g.FBV.fight().forceCast('bolt')); await pump(4.5, { x: [-3, 3, 0, -1][i], z: [-8, -9, -11, -7][i] }) }
  console.log('毒池个数', await ev(() => __g.FBV.fight().pools.length)); await pump(0.2, { x: 5.5, z: -6 }); await shot(`95_毒池最多_${T}`);
};
