/* 卷 → 券（V9.01）：院子商人补给页的尸潮券、神秘商人的刷新券 */
export default async (pg, shot) => {
  const W = ms => pg.waitForTimeout(ms), ev = (f, a) => pg.evaluate(f, a), T = process.env.TAGW || '844';
  await ev(() => { const S = __g.S; S.lv.store = Math.max(5, S.lv.store); S.td.scrolls = 3; __g.UI.openPanel('mall') }); await W(2500);
  console.log('补给页里有「尸潮券」', await ev(() => document.querySelector('#panel').innerText.includes('尸潮券')), '还有「卷」', await ev(() => (document.querySelector('#panel').innerText.match(/.{0,4}卷.{0,4}/g) || []).join(' / ')));
  await shot(`券_院子商人补给页_尸潮券_${T}`);
  await ev(() => { const S = __g.S, g = Object.keys(S.stock).find(k => S.stock[k] > 0) || 'carrot'; S.mys = S.mys || { seen: {} }; S.mys.order = { items: [{ g, n: 3 }] }; S.mys.free = false; S.refTix = 2; __g.UI.closePanel(); __g.UI.openPanel('mys') }); await W(2500);
  console.log('神秘商人里有「刷新券」', await ev(() => document.querySelector('#panel').innerText.includes('刷新券')), '还有「卷」', await ev(() => (document.querySelector('#panel').innerText.match(/.{0,4}卷.{0,4}/g) || []).join(' / ')));
  await shot(`券_神秘商人_刷新券_${T}`);
};
