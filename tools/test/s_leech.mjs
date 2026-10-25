/* 设计 101：截带吸血词条的装备详情（身上武器獠牙、手套钢指手套）。不给存档里的装备也行：脚本自己穿上 */
export default async (pg, shot) => {
  const W = ms => pg.waitForTimeout(ms), ev = (f, a) => pg.evaluate(f, a);
  await ev(() => { const S = __g.S; S.lv.store = Math.max(5, S.lv.store); const e = S.fb.eq; let id = 900;
    e.w = { id: id++, k: 'l1', lv: 1, st: 0, crys: 0, nw: 0 }; e.h = { id: id++, k: 's1_h', lv: 1, st: 12, crys: 0, nw: 0 }; e.g = { id: id++, k: 'e_g2', lv: 1, st: 7, crys: 0, nw: 0 }; e.m = { id: id++, k: 'e_m2', lv: 1, st: 7, crys: 0, nw: 0 };
    e.a = { id: id++, k: 'n_a', lv: 1, st: 0, crys: 0, nw: 0 }; e.b = { id: id++, k: 'n_b', lv: 1, st: 0, crys: 0, nw: 0 }; S.fb.nid = id });
  for (const [sl, n] of [['w', '101_装备详情_獠牙_844'], ['g', '101_装备详情_钢指手套_844']]) {
    await ev(sl => { __g.UI.closePanel(); const g = __g.UI.gst('gear'); g.tab = 'eq'; g.sel = 'eq:' + sl; __g.UI.openPanel('gear') }, sl); await W(1500);
    console.log(n, await ev(() => (document.querySelector('.panel, #panel') || document.body).innerText.replace(/\s+/g, ' ').match(/吸血[^ ]* ?[^ ]*/g)));
    await shot(n);
  }
};
