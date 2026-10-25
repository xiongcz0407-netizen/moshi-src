/* 设计 108 截图：老存档送 3 张召唤券的提示（存档里没有 fb.tix）、院子商人补给页召唤券、副本面板第 3 关、召唤券不够点挑战、星星兑换 / 神秘商人的刷新券新图标。TAG 写进文件名 */
export default async (pg, shot) => {
  const W = ms => pg.waitForTimeout(ms), ev = (f, a) => pg.evaluate(f, a), T = process.env.TAG || '844';
  console.log('读档后召唤券', await ev(() => __g.S.fb.tix), '尸潮券', await ev(() => __g.S.td.scrolls));
  await shot(`108_老存档送3张提示_${T}`);
  await ev(() => { const S = __g.S; S.lv.store = Math.max(5, S.lv.store); S.coins = 12000; S.fb.won = { 1: 2, 2: 1 }; __g.UI.closePanel() }); await W(300);
  await ev(() => { __g.UI.openMall && __g.UI.openMall(false); const g = __g.UI.gst('mall'); g.tab = 'sup'; g.sel = 'tix'; __g.UI.refreshPanel(true) }); await W(1200); await shot(`108_商人补给_召唤券_${T}`);
  await ev(() => { const g = __g.UI.gst('mall'); g.tab = 'star'; g.sel = 'ref'; __g.UI.refreshPanel(true) }); await W(1000); await shot(`108_星星兑换_刷新券新图标_${T}`);
  await ev(() => { __g.UI.closePanel(); const g = __g.UI.gst('fb'); g.sel = '3'; __g.UI.openPanel('fb') }); await W(1200); await shot(`108_副本第3关_召唤券_${T}`);
  await ev(() => { __g.S.fb.tix = 0; __g.flashMs = 30000; __g.UI.refreshPanel(true) }); await W(800); await shot(`108_副本_召唤券0张_${T}`);
  await ev(() => document.querySelector('[data-act="needTix"]').click()); await W(1200); await shot(`108_召唤券不够点挑战_${T}`);
  if (await ev(() => typeof __g.mysM !== 'undefined')) { await ev(() => { __g.S.refTix = 2; __g.UI.closePanel(); __g.UI.openPanel('mys') }); await W(1200); await shot(`108_神秘商人_刷新券新图标_${T}`) }
};
