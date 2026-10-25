/* 设计 97：FT=1 副本里超市飘字 / 横幅 / 提示有没有拦住；不给 FT 就是屠夫关最南边墙变半透明的截图 */
export { pre } from './vtime.mjs';
export default async (pg, shot) => {
  const W = ms => pg.waitForTimeout(ms), ev = (f, a) => pg.evaluate(f, a), T = process.env.TAGW || '844', STG = +(process.env.STG || 1);
  await ev(s => { const S = __g.S; S.lv.store = Math.max(5, S.lv.store); S.td.scrolls = 99; S.fb.tix = 99; S.fb.run = 0; S.fb.won = { 1: 1 }; S.fb.pend = null; __g.fbGo(s) }, STG);
  for (let i = 0; i < 90 && !(await ev(() => __g.FBV.active() && __g.FBV.phase() === 'fight')); i++) await W(1000);
  await ev(() => { __vtStart() }); await W(2500);
  const pump = (s, o = {}) => ev(([s, o]) => { for (let i = 0; i < Math.round(s * 30); i++) { const F = __g.FBV.fight(); F.player.hp = F.player.max; F.player.god = true; F.boss.skillT = 99; F.boss.spitCd = 99; if (F.boss.swingCd != null) F.boss.swingCd = 99; if (o.x != null) { F.player.x = o.x; F.player.z = o.z } if (o.bx != null) { F.boss.x = o.bx; F.boss.z = o.bz } __pump(1000 / 30) } }, [s, o]);
  if (process.env.FT) {
    if (STG === 2) { while (!(await ev(() => __g.FBV.fight().locked))) await ev(() => { const F = __g.FBV.fight(); F.player.z -= 0.3; __pump(33) }) }
    await pump(1, { x: 0, z: STG === 2 ? -9 : 0 });
    const r = await ev(() => { document.querySelector('#big').innerHTML = ''; const V = __g.THREE.Vector3; const n0 = document.querySelectorAll('#labels .ft').length;
      __g.UI.big('暴击 ×10', '+10 罐头', 'x10'); __g.UI.floatText(new V(0, 1, -9), '×10 罐头', 'x10'); __g.UI.toast('仓库满了', 'bad'); __g.tick(600);
      const big = document.querySelector('#big').textContent, toasts = document.querySelectorAll('#toasts .toast').length, ft = [...document.querySelectorAll('#labels .ft')].filter(e => e.style.display !== 'none').map(e => e.textContent);
      return { big, toasts, ft } });
    // 打 BOSS：按住攻击一会，看副本自己的伤害飘字照常出
    await ev(() => { window.__fire = true }); 
    const r2 = await ev(() => { const F = __g.FBV.fight(); F.player.x = 0; F.player.z = -9.5; let seen = new Set(); for (let i = 0; i < 90; i++) { F.player.hp = F.player.max; F.boss.skillT = 99; __pump(1000 / 30); if (i === 5) { const b = document.querySelector('[data-fbk=attack]'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7 })) } for (const e of document.querySelectorAll('#labels .ft')) if (e.style.display !== 'none') seen.add(e.textContent) }
      __g.UI.big('暴击 ×10', '+10 罐头', 'x10'); __g.tick(300); return { seen: [...seen].slice(0, 6), big: document.querySelector('#big').textContent, boss: (F.boss.hp / F.boss.max * 100).toFixed(1) } });
    console.log('副本里叫超市的横幅 / 飘字 / 提示 + 超市跑 10 分钟：', JSON.stringify(r)); console.log('打 BOSS 时：', JSON.stringify(r2));
    await shot(`97_副本里超市暴击_打BOSS_${T}`); return }
  const info = nm => ev(nm => { const F = __g.FBV.fight(), P = F.player; return nm + ' ' + JSON.stringify(__g.FBV.occl ? '' : '') }, nm);
  await pump(2, { x: 6.18, z: 18.58, bx: 0, bz: -9.5 }); await shot(`97_屠夫关右下角_${T}`);
  await pump(2, { x: -3, z: 18.58, bx: 0, bz: -9.5 }); await shot(`97_屠夫关最南边左边_${T}`);
  await pump(2, { x: 0, z: 10, bx: 0, bz: -9.5 }); await shot(`97_屠夫关走开以后_${T}`);
};
