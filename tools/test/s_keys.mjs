/* 设计 96：主角在右下、左下、南边中间、右边中间时有没有被技能按钮盖住（STG=1 屠夫关 / 2 毒囊关），再走一圈看镜头稳不稳 */
export { pre } from './vtime.mjs';
export default async (pg, shot) => {
  const W = ms => pg.waitForTimeout(ms), ev = (f, a) => pg.evaluate(f, a), T = process.env.TAGW || '844', STG = +(process.env.STG || 2);
  await ev(s => { const S = __g.S; S.lv.store = Math.max(5, S.lv.store); S.td.scrolls = 99; S.fb.run = 0; S.fb.won = { 1: 1 }; S.fb.pend = null; __g.fbGo(s) }, STG);
  for (let i = 0; i < 90 && !(await ev(() => __g.FBV.active() && __g.FBV.phase() === 'fight')); i++) await W(1000);
  await ev(() => { __vtStart() }); await W(2500);
  const pump = (s, o = {}) => ev(([s, o]) => { for (let i = 0; i < Math.round(s * 30); i++) { const F = __g.FBV.fight(); F.player.hp = F.player.max; F.player.god = true; F.boss.skillT = 99; F.boss.spitCd = 99; if (F.boss.swingCd != null) F.boss.swingCd = 99; if (o.x != null) { F.player.x = o.x; F.player.z = o.z } if (o.bx != null) { F.boss.x = o.bx; F.boss.z = o.bz } __pump(1000 / 30) } }, [s, o]);
  if (STG === 2) { await pump(0.1); while (!(await ev(() => __g.FBV.fight().locked))) await ev(() => { const F = __g.FBV.fight(); F.player.z -= 0.3; __pump(33) }); await pump(1) }
  const info = nm => ev(nm => { const F = __g.FBV.fight(), P = F.player, cam = __g.camera, V = __g.THREE.Vector3, W = innerWidth, H = innerHeight;
    const pj = (x, y, z) => { const v = new V(x, y, z).project(cam); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H] };
    const r = Math.max(pj(P.x + 0.45, 0, P.z)[0], pj(P.x + 0.45, 1.9, P.z)[0]), top = pj(P.x, 1.9, P.z)[1], bot = pj(P.x, 0, P.z)[1];
    const ks = [...document.querySelectorAll('#fbHud .fbk')].map(b => b.getBoundingClientRect()); const hit = ks.filter(k => r > k.left && pj(P.x - 0.45, 0, P.z)[0] < k.right && bot > k.top && top < k.bottom).length;
    return `${nm}：主角 (${P.x.toFixed(1)}, ${P.z.toFixed(1)}) 屏幕右沿 ${Math.round(r)}px 脚 ${Math.round(bot)}px | 最左按钮左沿 ${Math.round(Math.min(...ks.map(k => k.left)))}px，被 ${hit} 个按钮盖住 | 镜头 x ${cam.position.x.toFixed(2)}` }, nm);
  const S2 = STG === 2, zS = S2 ? -5.42 : 18.58, xR = S2 ? 6.58 : 6.18, nm0 = S2 ? '毒囊关' : '屠夫关', bpos = S2 ? {} : { bx: 0, bz: -9.5 };
  for (const [nm, x, z] of [['右下角', xR, zS], ['左下角', -xR, zS], ['南边中间', 0, zS], ['右边中间', xR, S2 ? -10 : 5]]) { await pump(1.5, { x, z, ...bpos }); console.log(await info(nm0 + nm)); if (nm !== '左下角' && nm !== '右边中间') await shot(`96_${nm0}${nm}_${T}`) }
  /* 平滑：从左下角走到右下角，再往北走 */
  const path = []; for (let x = -xR; x <= xR; x += 0.25) path.push([x, zS]); for (let z = zS; z >= zS - 6; z -= 0.25) path.push([xR, z]);
  console.log('走一圈镜头 x 每帧最多变', await ev(([path, bp]) => { let prev = null, mx = 0; for (let i = 0; i < 40; i++) { const F = __g.FBV.fight(); F.player.x = path[0][0]; F.player.z = path[0][1]; __pump(1000 / 30) } for (const [x, z] of path) for (let i = 0; i < 2; i++) { const F = __g.FBV.fight(); F.player.x = x; F.player.z = z; F.boss.skillT = 99; if (bp.bx != null) { F.boss.x = bp.bx; F.boss.z = bp.bz } __pump(1000 / 30); const c = __g.camera.position.x; if (prev != null) mx = Math.max(mx, Math.abs(c - prev)); prev = c } return mx.toFixed(3) + ' 米（主角每帧走 0.125 米）' }, [path, bpos]));
};
