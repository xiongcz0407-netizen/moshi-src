/* 设计 105b / 107 截图：副本掉落列表（传说 6 个）、老存档 l5→獠牙（MIG=1）、铁匠面板（炼宝、传说转换：有传说 / 钱不够 / 空 / 结果）。TAG 写进文件名 */
export default async (pg, shot) => {
  const W = ms => pg.waitForTimeout(ms), ev = (f, a) => pg.evaluate(f, a), T = process.env.TAG || '844';
  const open = async (p, o) => { await ev(([p, o]) => { __g.UI.closePanel(); const g = __g.UI.gst(p); Object.assign(g, o); __g.UI.openPanel(p) }, [p, o]); await W(1200) };
  const scrollTo = async sel => { await ev(sel => { const e = document.querySelector(sel); if (e) e.scrollIntoView({ block: 'center' }) }, sel); await W(300) };
  if (process.env.MIG) { console.log('迁移后', JSON.stringify(await ev(() => ({ w: __g.S.fb.eq.w, log: __g.S.fb.log.filter(e => e.a === 'adj') })))); await open('gear', { tab: 'eq', sel: 'eq:w' }); await shot(`105b_老存档_雷鸣M16变獠牙_${T}`); return }
  await ev(() => { const S = __g.S, f = S.fb; S.lv.store = Math.max(5, S.lv.store); let id = 600; const it = (k, lv, st) => ({ id: id++, k, lv, st, crys: 0 });
    f.eq = { w: it('e_w1', 1, 7), h: it('l_h', 2, 2), a: it('e_a1', 2, 3), g: it('e_g2', 1, 7), b: it('n_b', 1, 0), m: it('e_m2', 1, 7) };
    f.bag = [it('l_m', 3, 0), it('l_w', 1, 0), it('e_w1', 3, 0), it('l_b', 2, 6)]; f.nid = id; f.pend = null; f.won = { 1: 5, 2: 3 }; f.crys = 40; S.coins = 12000 });
  if (!process.env.ONLYSMITH) for (const n of ['1', '3']) { await open('fb', { sel: n }); await scrollTo('.fbdq'); await shot(`105b_副本第${n}关_掉落_${T}`) }
  const lm = await ev(() => String(__g.S.fb.bag[0].id)), lb = await ev(() => String(__g.S.fb.bag[3].id));
  await open('smith', { tab: 'ref', sel: lm }); await shot(`105b_铁匠_炼宝_0星传说提醒_${T}`);
  await open('smith', { tab: 'swap', sel: lb }); await shot(`105b_铁匠_传说转换_升过星_${T}`);
  await open('smith', { tab: 'swap', sel: lm }); await shot(`105b_铁匠_传说转换_${T}`);
  if (process.env.SWAP) {   /* 设计 107 接上 fbLegSwap 以后：点「转换」→ 确认 → 结果框 */
    await ev(() => document.querySelector('[data-act="fbLegSwap"]').click()); await W(500); await shot(`105b_铁匠_转换确认_${T}`);
    await ev(() => { const b = [...document.querySelectorAll('#askBox button')].find(x => /确定|转换/.test(x.textContent)); b && b.click() }); await W(500); await shot(`105b_铁匠_转换结果_光效_${T}`);
    await W(1800); await shot(`105b_铁匠_转换结果_${T}`);
    console.log('转换后', JSON.stringify(await ev(() => ({ coins: __g.S.coins, it: __g.S.fb.bag[0], log: __g.S.fb.log.slice(-1) }))));
    await ev(() => { __g.S.coins = 12000 });
  }
  await ev(() => { __g.S.coins = 1500 }); await open('smith', { tab: 'swap', sel: lm }); await shot(`105b_铁匠_传说转换_钱不够_${T}`);
  await ev(() => { __g.S.fb.bag = __g.S.fb.bag.filter(x => __g.FL.itemName(x) && x.k[0] !== 'l') }); await open('smith', { tab: 'swap', sel: null }); await shot(`105b_铁匠_传说转换_空_${T}`);
};
