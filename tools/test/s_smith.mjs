/* 设计 107 截图 / 测数：院子里的铁匠 + 摊子（远、近）、走近「找铁匠」、铁匠面板、角色页页签（没有炼宝）、「去铁匠那里炼宝」+ 头顶闪、超市 4 级没有铁匠；帧数、draw call、三角形（有 / 没有铁匠）。TAG 写进文件名 */
export default async (pg, shot) => {
  const W = ms => pg.waitForTimeout(ms), ev = (f, a) => pg.evaluate(f, a), T = process.env.TAG || '844';
  const cam = async (n, p, t, w = 900, h = 600) => { const d = await ev(([p, t, w, h]) => __g.camShot(...p, ...t, w, h, 40), [p, t, w, h]); const b = Buffer.from(d.split(',')[1], 'base64'); (await import('fs')).writeFileSync(`${globalThis.O}/${n}.png`, b); console.log('shot', n) };
  await ev(() => { const S = __g.S; S.lv.store = Math.max(5, S.lv.store); __g.UI.closePanel() }); await W(6000);
  const sp = await ev(() => [__g.SMITH_POS.x, __g.SMITH_POS.z]); console.log('铁匠在', sp, '有铁匠', await ev(() => !!__g.smithG), '动作', await ev(() => __g.smithActs && Object.keys(__g.smithActs)));
  if (!process.env.NOCAM) {
    await cam(`107_院子_远_铁匠传送门商人`, [sp[0] + 7, 11, sp[1] + 14], [sp[0] + 3, 0, sp[1] - 0.5], 1100, 620);
    await cam(`107_院子_近_铁匠摊`, [sp[0] + 1.6, 3.2, sp[1] + 6.2], [sp[0] + 0.4, 1.0, sp[1]], 900, 600);
    await cam(`107_院子_近_铁匠摊_侧`, [sp[0] - 4.5, 2.8, sp[1] + 4.2], [sp[0] + 0.4, 1.0, sp[1]], 900, 600);
  }
  /* 帧数：页面里数 4 秒 rAF（测试机是软件渲染，只看有 / 没有铁匠的相对差别） */
  const perf = async () => { await W(1500); return await ev(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else r({ fps: +(n * 1000 / (performance.now() - t0)).toFixed(1) }) }; requestAnimationFrame(f) })) };
  /* 走近：右下角「找铁匠」，铁匠挥手 */
  await ev(([x, z]) => { __g.go(x + 0.2, z + 2.6); __g.faceTo(x, z) }, sp); await W(2500);
  console.log('走近：按钮', await ev(() => { const b = document.querySelector('#smithBtn'); return b && !b.classList.contains('hidden') && b.textContent }), '挥手', await ev(() => __g.smithActs.wave.isRunning()));
  await shot(`107_走近_找铁匠_${T}`);
  const pNear = await perf();
  await ev(() => document.querySelector('#smithBtn').click()); await W(1500); await shot(`107_铁匠面板_${T}`);
  await ev(() => __g.UI.closePanel());
  await ev(([x, z]) => __g.go(x + 9, z + 9), sp); await W(1500); console.log('走远：按钮', await ev(() => !document.querySelector('#smithBtn').classList.contains('hidden')));
  /* 角色页页签、「去铁匠那里炼宝」 */
  await ev(() => { const f = __g.S.fb; f.bag = [{ id: 801, k: 'l_g', lv: 2, st: 0, crys: 0 }, { id: 802, k: 'e_w1', lv: 3, st: 0, crys: 0 }]; f.eq.w = { id: 803, k: 'e_w1', lv: 1, st: 7, crys: 0 } });
  await ev(() => { __g.UI.closePanel(); const g = __g.UI.gst('gear'); g.tab = 'bag'; g.f = 'all'; g.sel = '801'; __g.UI.openPanel('gear') }); await W(1200);
  console.log('角色页页签', await ev(() => [...document.querySelectorAll('[data-gtab]')].map(e => e.textContent.trim()).join(' | ')));
  await ev(() => { const e = document.querySelector('[data-arg="swap"][data-act="toSmith"]'); if (e) e.scrollIntoView({ block: 'center' }) }); await W(300); await shot(`107_角色页_去铁匠那里炼宝_${T}`);
  await ev(() => { __g.flashMs = 30000; document.querySelector('[data-act="toSmith"][data-arg="ref"]').click() }); await W(1500); await shot(`107_点了去铁匠_提示和头顶闪_${T}`);
  /* 帧数比一比：有铁匠 / 超市 4 级没有铁匠（同一个位置） */
  await ev(([x, z]) => __g.go(x + 1, z + 5), sp); const p5 = await perf();
  await ev(() => { __g.S.lv.store = 4 }); await W(800); const p4 = await perf();
  console.log('性能 有铁匠', JSON.stringify(p5), '没有铁匠（4 级）', JSON.stringify(p4), '走近时', JSON.stringify(pNear));
  console.log('4 级：有铁匠', await ev(() => !!__g.smithG), '按钮', await ev(() => !document.querySelector('#smithBtn').classList.contains('hidden')));
  if (!process.env.NOCAM) await cam(`107_超市4级_没有铁匠`, [sp[0] + 7, 11, sp[1] + 14], [sp[0] + 3, 0, sp[1] - 0.5], 1100, 620);
  await shot(`107_超市4级_${T}`);
};
