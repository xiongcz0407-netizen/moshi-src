/* 设计 105 截图：背包 Lv 牌子 / 排序 / 金色 ⇡、同星对比、获得框传说、副本掉落列表、套装整行绿、老存档迁移（MIG=1）。WH 换宽度，TAG 写进文件名 */
export default async (pg, shot) => {
  const W = ms => pg.waitForTimeout(ms), ev = (f, a) => pg.evaluate(f, a), T = process.env.TAG || '844';
  const open = async (p, o) => { await ev(([p, o]) => { __g.UI.closePanel(); const g = __g.UI.gst(p); Object.assign(g, o); __g.UI.openPanel(p) }, [p, o]); await W(1200) };
  const scrollDetail = async sel => { await ev(sel => { const e = document.querySelector(sel); if (e) e.scrollIntoView({ block: 'center' }) }, sel); await W(300) };
  if (process.env.MIG) {   /* 老存档读进来：獠牙 l1 → l_w1，拾荒者头盔 Lv1 → Lv5 */
    console.log('迁移后', JSON.stringify(await ev(() => { const e = __g.S.fb.eq; return { w: e.w, h: e.h } })));
    await open('gear', { tab: 'eq', sel: 'eq:w' }); await shot(`105_老存档_獠牙_${T}`);
    await open('gear', { tab: 'eq', sel: 'eq:h' }); await shot(`105_老存档_拾荒者头盔Lv5_${T}`);
    return;
  }
  await ev(() => { const S = __g.S, f = S.fb; S.lv.store = Math.max(5, S.lv.store); let id = 500; const it = (k, lv, st) => ({ id: id++, k, lv, st, crys: 0 });
    f.eq = { w: it('e_w1', 1, 7), h: it('e_h1', 1, 4), a: it('e_a1', 2, 3), g: it('e_g2', 1, 7), b: it('n_b', 1, 0), m: it('e_m2', 1, 7) };
    f.bag = [it('e_w1', 2, 0), it('e_w1', 3, 0), it('e_w1', 1, 7), it('n_w', 3, 2), it('e_h2', 3, 0), it('l_w2', 2, 0), it('s1_g', 3, 0), it('e_b1', 2, 1)]; f.nid = id; f.pend = null; f.won = { 1: 5, 2: 3 } });
  /* 1 背包（武器筛选）+ 2 详情：碎岩 Lv3 0★ 对比身上铁吼 Lv1 7★ */
  const sui = await ev(() => __g.S.fb.bag.find(x => x.k === 'e_w1' && x.lv === 3).id);
  await open('gear', { tab: 'bag', f: 'all', sort: 'q', sel: null }); await shot(`105_背包_全部_${T}`);
  await open('gear', { tab: 'bag', f: 'w', sort: 'q', sel: String(sui) }); await shot(`105_背包_武器_碎岩详情_${T}`);
  await scrollDetail('.samest'); await shot(`105_详情_同星对比_${T}`);
  /* 3 获得框：第 3 关掉的传说 岩眼头盔 Lv3 */
  await ev(() => { const S = __g.S; S.fb.pend = { id: 900, k: 'l_h1', lv: 3, st: 0, crys: 0, nw: 1 }; S.fb.got = { n: 3, coins: 2500, crys: 2, first: false, secs: 131 }; __g.UI.closePanel(); __g.UI.openPanel('fbGot') }); await W(1200);
  await shot(`105_获得框_岩眼头盔Lv3_${T}`); await ev(() => { __g.S.fb.pend = null; __g.S.fb.got = null; __g.UI.closePanel() });
  /* 4 副本面板第 1、3 关 */
  for (const n of ['1', '3']) { await open('fb', { sel: n }); await scrollDetail('.fbdq'); await shot(`105_副本第${n}关_掉落_${T}`) }
  /* 5 穿 2 件拾荒者 */
  await ev(() => { const f = __g.S.fb; f.eq.h = { id: 950, k: 's1_h', lv: 5, st: 3, crys: 0 }; f.eq.a = { id: 951, k: 's1_a', lv: 5, st: 0, crys: 0 } });
  await open('gear', { tab: 'eq', sel: 'eq:h' }); await scrollDetail('.setrows'); await shot(`105_拾荒者2件_详情_${T}`);
  await open('gear', { tab: 'eq', sel: null }); await scrollDetail('.setprog'); await shot(`105_拾荒者2件_套装进度_${T}`);
};
