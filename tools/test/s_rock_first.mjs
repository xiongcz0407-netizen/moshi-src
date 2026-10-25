/* 设计 102b：干净浏览器第一次进第 3 关，第一帧有没有黑场景（不用虚拟时间，照真的时间走）。
   进到战斗的那一刻马上截图，再数场景里还没读到图的贴图有几张（应该是 0） */
export default async (pg, shot) => {
  const W = ms => pg.waitForTimeout(ms), ev = (f, a) => pg.evaluate(f, a), T = process.env.TAGW || '844';
  if (process.env.SLOW) { const c = await pg.context().newCDPSession(pg); await c.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 400000, uploadThroughput: 100000 }) }
  await ev(() => { const S = __g.S; S.lv.store = Math.max(5, S.lv.store); S.td.scrolls = 99; S.fb.run = 0; S.fb.won = { 1: 1, 2: 1 }; S.fb.pend = null; __g.fbGo(3) });
  const t0 = Date.now(); let ovSeen = false;
  for (let i = 0; i < 1200; i++) { const r = await ev(() => ({ a: __g.FBV.active(), ov: !document.querySelector('#fbLoad, .fbload') || null })); if (r.a) break; await W(50) }
  const blank = () => ev(() => { let n = 0, all = 0; __g.FBV.scene().traverse(o => { if (!o.isMesh && !o.isSprite) return; for (const m of [].concat(o.material)) for (const k of ['map']) { const t = m && m[k]; if (t) { all++; if (!t.image) n++ } } }); return `贴图 ${all} 张，还没读到 ${n} 张` });
  console.log('进战斗用了', Date.now() - t0, 'ms；', await blank());
  await shot(`102b_开场全景_第一帧_${T}`); await W(400); await shot(`102b_开场全景_04秒_${T}`); await W(2000); console.log('2.4 秒后', await blank()); await shot(`102b_开场全景_24秒_${T}`);
};
