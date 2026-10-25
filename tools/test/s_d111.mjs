/* 设计 111：角色页装备页「套装进度」只列身上穿着的套装；没穿就整块不显示。WH 换宽度，TAG 写进文件名 */
export default async (pg, shot) => {
  const W = ms => pg.waitForTimeout(ms), ev = (f, a) => pg.evaluate(f, a), T = process.env.TAG || '844';
  const open = async () => { await ev(() => { __g.UI.closePanel(); const g = __g.UI.gst('gear'); Object.assign(g, { tab: 'eq', sel: null }); __g.UI.openPanel('gear') }); await W(1200) };
  const info = () => ev(() => { const p = document.querySelector('.panel') || document.body; return { 套装标题: [...p.querySelectorAll('.dsub')].filter(e => e.textContent === '套装').length, 套装: [...p.querySelectorAll('.setprog .setnm')].map(e => e.textContent.slice(0, 12)) } });
  await ev(() => { const S = __g.S, f = S.fb; S.lv.store = Math.max(5, S.lv.store); let id = 500; const it = (k, lv, st) => ({ id: id++, k, lv, st, crys: 0 });
    f.eq = { w: it('e_w1', 1, 7), h: it('e_h1', 1, 4), a: it('e_a1', 2, 3), g: it('e_g2', 1, 7), b: it('n_b', 1, 0), m: it('e_m2', 1, 7) }; f.nid = id; f.pend = null });
  await open(); console.log('没穿套装', JSON.stringify(await info())); await shot(`111_没穿套装_${T}`);
  await ev(() => { const f = __g.S.fb; f.eq.h = { id: 950, k: 's1_h', lv: 5, st: 3, crys: 0 }; f.eq.a = { id: 951, k: 's1_a', lv: 5, st: 0, crys: 0 } });
  await open(); console.log('2 件拾荒者', JSON.stringify(await info()));
  await ev(() => { const e = document.querySelector('.setprog'); if (e) e.scrollIntoView({ block: 'center' }) }); await W(300); await shot(`111_拾荒者2件_${T}`);
  await ev(() => { const f = __g.S.fb; f.eq.g = { id: 952, k: 's2_g', lv: 10, st: 0, crys: 0 } });
  await open(); console.log('2 拾荒者 + 1 猎杀者', JSON.stringify(await info()));
  await ev(() => { __g.UI.closePanel(); const g = __g.UI.gst('gear'); Object.assign(g, { tab: 'eq', sel: 'eq:w' }); __g.UI.openPanel('gear') }); await W(800);
  console.log('点非套装那件', JSON.stringify(await info()));
};
