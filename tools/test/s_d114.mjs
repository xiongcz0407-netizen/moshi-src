/* 设计 114：第 4 关尖啸者——开场全景、每个技能、错乱、喇叭打坏、嗜血、脸在画面里（114c：广播轰炸主角中间 / 南边各一张、嗜血后 3 秒）。SHOTS=逗号分隔只截几张（默认全截） */
export { pre } from './vtime.mjs';
export default async (pg, shot) => {
  const W = ms => pg.waitForTimeout(ms), ev = (f, a) => pg.evaluate(f, a), T = process.env.TAGW || '844';
  pg.on('pageerror', e => console.log('PAGEERR', e.message));
  await ev(() => { const S = __g.S; S.lv.store = Math.max(5, S.lv.store); S.fb.tix = 99; S.fb.run = 0; S.fb.won = { 1: 1, 2: 1, 3: 1 }; S.fb.pend = null; __g.fbGo(4) });
  for (let i = 0; i < 120 && !(await ev(() => __g.FBV.active() && __g.FBV.phase() === 'fight')); i++) await W(1000);
  await W(3000); await ev(() => { __vtStart() });
  console.log('错误：', JSON.stringify(await ev(() => (__g.FB_ERR || []).map(e => e.m))));
  /* 血调很厚；BOSS 别自己出招 / 闪现（o.free = 让它自己来） */
  const pump = (s, o = {}) => ev(([s, o]) => { let evs = []; for (let i = 0; i < Math.round(s * 30); i++) { const F = __g.FBV.fight(); F.player.god = false; F.player.max = 1e6; if (F.player.hp < 5e5) F.player.hp = 1e6;
    if (!o.free) { F.boss.skillT = 99; F.boss.basicCd = 99; F.boss.blinkT = 99; F.boss.blinkCd = 99 } if (o.x != null) { F.player.x = o.x; F.player.z = o.z } __pump(1000 / 30); evs = evs.concat(F.ev.map(e => e.e)) } return evs }, [s, o]);
  const until = async (name, max = 8, o = {}) => { for (let i = 0; i < max * 10; i++) { const e = await pump(0.1, o); if (e.includes(name)) return true } return false };
  const set = (bx, bz, px, pz) => ev(([bx, bz, px, pz]) => { const F = __g.FBV.fight(); F.boss.x = bx; F.boss.z = bz; F.boss.y = 0; F.boss.hidden = false; F.boss.act = 'idle'; F.player.x = px; F.player.z = pz }, [bx, bz, px, pz]);
  const cast = k => ev(k => __g.FBV.fight().forceCast(k), k);
  const want = n => !process.env.SHOTS || process.env.SHOTS.split(',').includes(n);
  const sh = async n => { if (want(n)) await shot(`114_${n}_${T}`) };
  await sh('开场全景');
  await pump(1.0); await set(0, -2, 0.5, 6); await pump(0.3, { x: 0.5, z: 6 }); await sh('BOSS待机');
  await cast('bolt'); await pump(0.5, { x: 0.5, z: 6 }); await sh('扔鸦弹');
  await pump(1.5, { x: 0.5, z: 6 });
  await cast('rings'); await pump(0.6, { x: 0.5, z: 6 }); await sh('声波三环_读条看缺口'); await pump(0.9, { x: 0.5, z: 6 }); await sh('声波三环'); await pump(3, { x: 0.5, z: 6 });
  await set(0, -2, 4, 10); await cast('horn'); await pump(1.0, { x: 4, z: 10 }); await sh('喇叭音爆_预警');   /* 设计 114c：主角靠东南那根（新位置 z 8） */ await until('hornBlast', 2); await pump(0.12); await sh('喇叭音爆_推开'); await pump(2);
  await set(0, -2, 0.5, 6); await cast('flock'); await pump(1.0, { x: 0.5, z: 6 }); await sh('乌鸦群_横带'); await until('flockGo', 2, { x: 0.5, z: 6 }); await pump(0.3, { x: 0.5, z: 6 }); await sh('乌鸦群_飞过'); await pump(1.0); await sh('小乌鸦');
  await ev(() => { for (const m of __g.FBV.fight().mobs) if (m.crow) m.hp = 0.1 }); await pump(2);
  await set(0, -2, 0.5, 6); await cast('shriek'); await pump(1.2, { x: 0.5, z: 6 }); await sh('刺耳尖叫_读条'); await until('pconf', 2, { x: 0.5, z: 6 }); await pump(0.3); await sh('错乱');
  /* 尖叫后接闪现 B：落点黑影 → 喷射 */
  await until('blinkMark', 3, { free: 0 }); await pump(0.12); await sh('闪现_烟和落点黑影'); await until('blinkIn', 2); await pump(0.2); await sh('鸦群喷射'); await pump(2);
  await set(0, -2, 0.5, 3); await cast('bomb'); await pump(1.0, { x: 0.5, z: 3 }); await sh('广播轰炸_BOSS在塔上_主角中间'); await pump(1.6, { x: 0.5, z: 3 }); await sh('广播轰炸_喇叭依次响'); await pump(4, { x: 0.5, z: 3 });
  /* 设计 114c：主角在南边时 BOSS 在塔上也要看得到脸 */
  await set(0, -2, 0.5, 16); await cast('bomb'); await pump(1.0, { x: 0.5, z: 16 }); await sh('广播轰炸_BOSS在塔上_主角南边'); await pump(5.6, { x: 0.5, z: 16 });
  /* 打坏一个喇叭 */
  await ev(() => { const F = __g.FBV.fight(), q = F.speakers[3]; F.player.x = q.x + 2; F.player.z = q.z - 2; q.hp = 1 }); await pump(0.2, { x: -4.3, z: 6 });
  await ev(() => { const F = __g.FBV.fight(), q = F.speakers[3]; q.hp = 0; q.dead = true; F.pend = [{ e: 'spkDie', s: q }] }); await pump(1.0, { x: -4.3, z: 6 }); await sh('喇叭打坏');
  /* 嗜血 */
  await set(0, -3, 0.5, 5); await ev(() => { const F = __g.FBV.fight(); F.boss.hp = F.boss.max * 0.49 }); await pump(0.6, { x: 0.5, z: 5, free: 1 }); await pump(1.4, { x: 0.5, z: 5 }); await sh('嗜血');
  /* 设计 114c：嗜血以后 3 秒，BOSS 自己出招、主角一直挨打，画面四周不该再有红边 */
  await pump(3, { x: 0.5, z: 5, free: 1 }); await sh('嗜血后3秒');
  /* 脸在画面里：主角在最南边、两个南角，BOSS 在北边 11 米（它平时离主角 7～11 米，超过 11 米会走过来） */
  for (const [nm, x, z] of [['脸_主角最南', 0, 18.4], ['脸_主角西南角', -6.4, 18.4], ['脸_主角东南角', 6.4, 18.4]]) { await set(x * 0.3, 7.6, x, z);   /* BOSS 离主角 11 米（再远它会走过来） */ await pump(1.5, { x, z }); await sh(nm) }
};
