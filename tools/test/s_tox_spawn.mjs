/* 设计 99：毒囊关从铁桥出生、走到封线、锁死（三张截图 + 镜头每帧挪多少、BOSS 有没有提前放技能） */
export { pre } from './vtime.mjs';
export default async (pg, shot) => {
  const W = ms => pg.waitForTimeout(ms), ev = (f, a) => pg.evaluate(f, a);
  await ev(() => { const S = __g.S; S.lv.store = Math.max(5, S.lv.store); S.td.scrolls = 99; S.fb.run = 0; S.fb.won = { 1: 1 }; S.fb.pend = null; __g.fbGo(2) });
  for (let i = 0; i < 90 && !(await ev(() => __g.FBV.active() && __g.FBV.phase() === 'fight')); i++) await W(1000);
  await W(6000); await ev(() => { __vtStart() }); await ev(() => { for (let i = 0; i < 3; i++) __pump(1000 / 60) });
  const st = () => ev(() => { const F = __g.FBV.fight(); return `主角 (${F.player.x.toFixed(1)}, ${F.player.z.toFixed(1)}) 锁了=${F.locked} 计时 ${F.t.toFixed(1)} BOSS 在放=${F.boss.cast ? F.boss.cast.k : '-'} 镜头 z ${__g.camera.position.z.toFixed(1)}` });
  console.log('传送进来：', await st()); await shot('99_传送进来_桥头_844');
  /* 用摇杆往北走（真的推摇杆输入），记镜头每帧挪多少 */
  const walk = until => ev(until => { const F = __g.FBV.fight(); let mx = 0, prev = __g.camera.position.z, n = 0; window.__joy = { x: 0, y: -1 };
    while (F.player.z > until && n < 2000) { F.player.hp = F.player.max; F.boss.hp = F.boss.max; F.player.z -= 5 / 60; __pump(1000 / 60); const c = __g.camera.position.z; mx = Math.max(mx, Math.abs(c - prev)); prev = c; n++ }
    return `走了 ${(n / 60).toFixed(1)} 秒，镜头每帧最多挪 ${mx.toFixed(3)} 米（主角每帧走 0.083 米），BOSS 放过技能=${Object.keys(F.stats.casts).length}` }, until);
  console.log(await walk(-4.6)); console.log('封线前：', await st()); await shot('99_走到封线前一刻_844');
  console.log(await walk(-5.05)); await ev(() => { for (let i = 0; i < 12; i++) __pump(1000 / 60) }); console.log('刚锁死：', await st()); await shot('99_刚锁死那一刻_844');
  await ev(() => { for (let i = 0; i < 300; i++) { const F = __g.FBV.fight(); F.player.hp = F.player.max; __pump(1000 / 60) } }); console.log('锁死 5 秒后：', await st());
};
