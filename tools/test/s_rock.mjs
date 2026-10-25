/* 设计 102：第 3 关落石巨人截图。SHOT=list 用逗号分：overview（开场全景）、idle、sweep、throw、grab、roll、pillars、rift、ava、half、covers、face（几个位置看脸）、win */
export { pre } from './vtime.mjs';
export default async (pg, shot) => {
  const W = ms => pg.waitForTimeout(ms), ev = (f, a) => pg.evaluate(f, a), T = process.env.TAGW || '844', SH = (process.env.SHOT || 'overview').split(','), PF = process.env.PFX || '102';
  pg.on('pageerror', e => console.log('PAGEERR', e.message));
  await ev(() => { const S = __g.S; S.lv.store = Math.max(5, S.lv.store); S.td.scrolls = 99; S.fb.tix = 99; S.fb.run = 0; S.fb.won = { 1: 1, 2: 1 }; S.fb.pend = null; __g.fbGo(3) });
  for (let i = 0; i < 120 && !(await ev(() => __g.FBV.active() && __g.FBV.phase() === 'fight')); i++) await W(1000);
  await W(5000); await ev(() => { __vtStart() });
  const pump = (s, o = {}) => ev(([s, o]) => { for (let i = 0; i < Math.round(s * 30); i++) { const F = __g.FBV.fight(); F.player.hp = F.player.max; F.player.god = true; if (o.hold) { F.boss.skillT = 99; F.boss.basicCd = 99 } if (o.x != null) { F.player.x = o.x; F.player.z = o.z } if (o.bx != null) { F.boss.x = o.bx; F.boss.z = o.bz } __pump(1000 / 30) } }, [s, o]);
  const info = nm => ev(nm => { const F = __g.FBV.fight(), B = F.boss, P = F.player, cam = __g.camera, V = __g.THREE.Vector3, H = innerHeight, st = __fbstg(); const pj = (x, y, z) => Math.round((1 - new V(x, y, z).project(cam).y) / 2 * H);
    const f = st.face(), hud = Math.round(document.querySelector('#fbHud .fbb').getBoundingClientRect().bottom), top = pj(f.x, f.top, f.z), chin = pj(f.x, f.chin, f.z), fv = new V(f.x, f.top, f.z).project(cam);
    return `${nm}：主角 (${P.x.toFixed(1)}, ${P.z.toFixed(1)}) 巨人 (${B.x.toFixed(1)}, ${B.z.toFixed(1)}) ${B.act}/${B.anim} | 头顶 ${top}px 下巴 ${chin}px（BOSS 框下沿 ${hud}，画面高 ${H}，左右 ${fv.x.toFixed(2)}）→ ${top >= hud && chin < H && Math.abs(fv.x) < 1 ? '整张脸在框下面' : '看不全'} | 掩体 ${F.cover ? '' : ''}${__g.FBV.fight().coversN ?? ''}` }, nm);
  /* 连拍：巨人走过来 → 横扫 → 抓掩体扔（15 秒，每 0.25 秒一张，fbrun 外面拼成视频） */
  if (SH.includes('clip')) { await pump(0.3, { hold: 1, x: 0, z: 6, bx: 0.5, bz: -1.5 }); await ev(() => { const F = __g.FBV.fight(); F.boss.basicCd = 99; F.boss.skillT = 99 });
    for (let i = 0; i < 60; i++) { const t = i * 0.25;
      await ev(t => { const F = __g.FBV.fight(), B = F.boss; if (t === 3.5) { B.basicCd = 0; B.calm = 0 } if (t === 8) { B.calm = 0; F.forceCast('grab') } if (t > 3.6 && t < 8) B.basicCd = 99 }, t);
      await pump(0.25, { x: 0, z: 6 }); await shot(`clip_${String(i).padStart(3, '0')}`) } return }
  if (SH.includes('overview')) { await pump(0.5); console.log(await info('开场')); await shot(`${PF}_开场全景_主角在铁丝网门_${T}`) }
  if (SH.includes('idle')) { await pump(2, { hold: 1, x: 0, z: -2, bx: 0, bz: -8 }); console.log(await info('待机')); await shot(`${PF}_巨人待机_${T}`) }
  const cast = async (k, nm, waitS, o = {}) => { await pump(0.6, { hold: 1, ...o }); await ev(k => __g.FBV.fight().forceCast(k), k); await pump(waitS, o); console.log(await info(nm)); await shot(`${PF}_${nm}_${T}`) };
  if (SH.includes('sweep')) await cast('sweep', '石拳横扫', 0.75, { x: 0, z: -5, bx: 0, bz: -8 });
  if (SH.includes('throw')) await cast('throw', '投石_出手', 0.45, { x: 0, z: 2, bx: 0, bz: -8 });
  if (SH.includes('grab')) { await pump(0.3, { hold: 1, x: 0, z: 4, bx: -2, bz: 0.5 }); await ev(() => __g.FBV.fight().forceCast('grab')); let ok = 0; for (let i = 0; i < 40 && !ok; i++) { await pump(0.1, { x: 0, z: 4 }); ok = await ev(() => { const c = __g.FBV.fight().boss.cast; return c && c.phase === 'toss' && c.t > c.dur - 0.5 }) }
    console.log(await info('抓掩体扔_在空中')); await shot(`${PF}_投掷_掩体在空中_${T}`); await pump(1.5, { x: 0, z: 4 }); await shot(`${PF}_掩体被扔掉以后_${T}`) }
  if (SH.includes('roll')) { await cast('roll', '滚石_两条铁轨亮', 1.0, { x: -3, z: 6, bx: 0, bz: -9 }); await pump(1.5, { x: 0, z: 6 }); await shot(`${PF}_滚石_滚下来_${T}`) }
  if (SH.includes('pillars')) { await cast('pillars', '石柱阵_第一波亮', 1.0, { x: 0, z: 2, bx: 0, bz: -8 }); await pump(0.75, { x: 0, z: 2 }); await shot(`${PF}_石柱阵_第一波冒出_第二波亮_${T}`) }
  if (SH.includes('rift')) { await cast('rift', '地裂_预警', 1.0, { x: 1, z: 2, bx: 0, bz: -6 }); await pump(1.0, { x: -3, z: 3 }); await shot(`${PF}_地裂_Y字裂缝_${T}`) }
  if (SH.includes('ava')) { await cast('ava', '山崩_举拳吼', 1.6, { x: 0, z: 3, bx: 0, bz: -6 }); await pump(2.5, { x: 0, z: 3 }); await shot(`${PF}_山崩_落石雨_${T}`); await pump(4, { x: 0, z: 3 }); await shot(`${PF}_山崩_新掩体_${T}`) }
  if (SH.includes('half')) { await pump(0.5, { hold: 1, x: 0, z: -1, bx: 0, bz: -7 }); await ev(() => { const F = __g.FBV.fight(); F.boss.hp = F.boss.max * 0.49 }); for (const [i, dt] of [[1, 0.3], [2, 0.25], [3, 0.25], [4, 0.35]]) { await pump(dt, { hold: 1, x: 0, z: -1 }); if (i === 2) console.log(await info('半血裂开')); await shot(`${PF}_半血裂开_${i}_${T}`) }   /* 设计 102b：裂开过程连续 4 帧（0.3 / 0.55 / 0.8 / 1.15 秒） */ await pump(2, { hold: 1, x: 0, z: -1 }); await shot(`${PF}_半血以后_掉下的一块_${T}`) }
  if (SH.includes('face')) for (const [nm, x, z, bx, bz] of [['最南边_巨人在北边', 0, 18.5, 0, -9], ['左下角_巨人在北边', -6.3, 18.5, 0, -9], ['右下角_巨人在北边', 6.3, 18.5, 0, -9], ['巨人追到跟前', 0, 5, 0, 1.5]]) { await pump(2, { hold: 1, x, z, bx, bz }); console.log(await info(nm)); await shot(`${PF}_脸_${nm}_${T}`) }
  if (SH.includes('win')) { await pump(0.5, { hold: 1, x: 0, z: 2, bx: 0, bz: -4 }); await ev(() => __g.FBV.fight().killBoss()); await pump(5, { x: 0, z: 2 }); await shot(`${PF}_打赢_宝箱落地_${T}`) }
};
