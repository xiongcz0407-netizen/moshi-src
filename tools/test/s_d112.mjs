/* 设计 112 截图：院子商人头顶「免费星星可以领」、补给页每日免费（可以领 / 领完）。TAG 写进文件名 */
export default async (pg, shot) => {
  const W = ms => pg.waitForTimeout(ms), ev = (f, a) => pg.evaluate(f, a), T = process.env.TAG || '844';
  await ev(() => { const S = __g.S; S.mallDay = ''; __g.UI.closePanel(); const p = __g.MERCH_POS || { x: -8.6, z: -15.2 }; __g.go(p.x + 1.5, p.z + 4.5) }); await W(2500);
  await shot(`112_商人头顶_免费星星可以领_${T}`);
  const s0 = await ev(() => __g.S.stars);
  await ev(() => { __g.UI.openMall(false); const g = __g.UI.gst('mall'); g.tab = 'sup'; g.sel = 'free'; __g.UI.refreshPanel(true) }); await W(1200); await shot(`112_补给_每日免费_可以领_${T}`);
  await ev(() => document.querySelector('[data-act="freeGear"]').click()); await W(1200); await shot(`112_补给_每日免费_领完_${T}`);
  console.log('星星', s0, '→', await ev(() => __g.S.stars));
};
