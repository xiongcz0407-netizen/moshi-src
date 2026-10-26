/* 设计 116：第 5 关装甲暴君——开场全景、每个技能、护盾柱子电弧、牵引 + 霰弹炮、封锁、主炮、破甲、脸在画面里。SHOTS=逗号分隔只截几张 */
export { pre } from './vtime.mjs';
export default async (pg, shot) => {
  const W = ms => pg.waitForTimeout(ms), ev = (f, a) => pg.evaluate(f, a), T = process.env.TAGW || '844';
  pg.on('pageerror', e => console.log('PAGEERR', e.message));
  await ev(() => { const S = __g.S; S.lv.store = Math.max(5, S.lv.store); S.fb.tix = 99; S.fb.run = 0; S.fb.won = { 1: 1, 2: 1, 3: 1, 4: 1 }; S.fb.pend = null; __g.fbGo(5) });
  for (let i = 0; i < 120 && !(await ev(() => __g.FBV.active() && __g.FBV.phase() === 'fight')); i++) await W(1000);
  await W(3000); await ev(() => { __vtStart() });
  console.log('错误：', JSON.stringify(await ev(() => (__g.FB_ERR || []).map(e => e.m))));
  const pump = (s, o = {}) => ev(([s, o]) => { let evs = []; for (let i = 0; i < Math.round(s * 30); i++) { const F = __g.FBV.fight(); F.player.max = 1e6; if (F.player.hp < 5e5) F.player.hp = 1e6;
    if (!o.free) { F.boss.skillT = 99; F.boss.gunCd = 99 } if (o.x != null) { F.player.x = o.x; F.player.z = o.z } __pump(1000 / 30); evs = evs.concat(F.ev.map(e => e.e)) } return evs }, [s, o]);
  const until = async (name, max = 8, o = {}) => { for (let i = 0; i < max * 10; i++) { const e = await pump(0.1, o); if (e.includes(name)) return true } return false };
  const set = (bx, bz, px, pz) => ev(([bx, bz, px, pz]) => { const F = __g.FBV.fight(); F.boss.x = bx; F.boss.z = bz; F.boss.act = 'idle'; F.boss.cast = null; F.player.x = px; F.player.z = pz }, [bx, bz, px, pz]);
  const cast = k => ev(k => __g.FBV.fight().forceCast(k), k);
  const want = n => !process.env.SHOTS || process.env.SHOTS.split(',').includes(n);
  const sh = async n => { if (want(n)) await shot(`116_${n}_${T}`) };
  await sh('开场全景');
  await pump(1.0); await set(0, -2, 0.5, 6); await pump(0.3, { x: 0.5, z: 6 }); await sh('BOSS待机');
  await ev(() => { const F = __g.FBV.fight(); F.boss.gunCd = 0 }); await pump(0.5, { x: 0.5, z: 6, free: 1 }); await sh('机炮点射'); await pump(1.5, { x: 0.5, z: 6 });
  await cast('laser'); await pump(1.0, { x: 0.5, z: 6 }); await sh('旋转激光_预警'); await pump(1.0, { x: 0.5, z: 6 }); await sh('旋转激光_扫'); await pump(2.5, { x: 0.5, z: 6 });
  await cast('missile'); await pump(0.9, { x: 0.5, z: 6 }); await sh('导弹齐射'); await pump(2.5, { x: 0.5, z: 6 });
  await cast('grid'); await pump(1.0, { x: 0.5, z: 6 }); await sh('激光网格_预警'); await pump(0.45, { x: 0.5, z: 6 }); await sh('激光网格_横线打完竖线亮'); await pump(2, { x: 0.5, z: 6 });
  await cast('carpet'); await pump(1.2, { x: 0.5, z: 6 }); await sh('地毯轰炸_第一波'); await pump(0.6, { x: 0.5, z: 6 }); await sh('地毯轰炸_第二波空地'); await pump(2.5, { x: 0.5, z: 6 });
  await cast('shield'); await pump(2.0, { x: 0.5, z: 6 }); await sh('护盾_柱子电弧'); await ev(() => { for (const m of __g.FBV.fight().mobs) if (m.pylon) { m.hp = 0; m.dead = true; m.deadT = 0 } }); await pump(0.4, { x: 0.5, z: 6 }); await sh('护盾_破盾'); await pump(2.5, { x: 0.5, z: 6 });
  await set(0, -2, 0.5, 6); await cast('pull'); await pump(1.6, { x: null }); await sh('电磁牵引'); await until('cast', 2); await pump(0.25); await sh('贴脸霰弹炮_扇形'); await pump(3);
  await set(0, -2, 0.5, 6); await cast('emp'); await pump(1.2, { x: 0.5, z: 6 }); await sh('电磁脉冲_读条'); await until('plock', 2, { x: 0.5, z: 6 }); await pump(0.3, { x: 0.5, z: 6 }); await sh('封锁'); await pump(3.5, { x: 0.5, z: 6 });
  await set(0, -2, 0.5, 6); await cast('cannon'); await pump(2.0, { x: 1.5, z: 6 }); await sh('过载主炮_红线'); await until('cannonGo', 2, { x: 1.5, z: 6 }); await pump(0.15); await sh('过载主炮_开火'); await pump(2);
  await set(0, -3, 0.5, 5); await ev(() => { const F = __g.FBV.fight(); F.boss.hp = F.boss.max * 0.49 }); await pump(1.2, { x: 0.5, z: 5, free: 1 }); await pump(1.0, { x: 0.5, z: 5 }); await sh('破甲');
  for (const [nm, x, z] of [['脸_主角最南', 0, 18.4], ['脸_主角西南角', -6.4, 18.4], ['脸_主角东南角', 6.4, 18.4]]) { await set(x * 0.3, 9.5, x, z); await pump(1.5, { x, z }); await sh(nm) }
};
