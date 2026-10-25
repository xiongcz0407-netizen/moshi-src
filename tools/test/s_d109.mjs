/* 设计 109：商人买券选几张；副本「再打一次」没券时问买 */
export default async (pg, shot) => {
  const W = ms => pg.waitForTimeout(ms), ev = (f, a) => pg.evaluate(f, a), T = process.env.TAGW || '844';
  const det = () => ev(() => { const d = document.querySelector('#panel .pf-detail') || document.querySelector('#panel'); return d.innerText.replace(/\s+/g, ' ').slice(0, 220) });
  const click = sel => ev(sel => { const b = document.querySelector(sel); if (b) b.click(); return !!b }, sel);
  const mall = async (sel, coins) => { await ev(([sel, coins]) => { const S = __g.S; S.lv.store = Math.max(5, S.lv.store); S.coins = coins; __g.UI.closePanel(); const g = __g.UI.gst('mall'); g.tab = 'sup'; g.sel = sel; __g.UI.openPanel('mall'); g.tab = 'sup'; g.sel = sel; __g.UI.refreshPanel(true) }, [sel, coins]); await W(1200) };
  await mall('tix', 12345); console.log('召唤券 n=1：', await det()); await shot(`109_召唤券_n1_${T}`);
  for (const a of ['5', '1']) { await click(`[data-act="ticN"][data-arg="${a}"]`); await W(400) }
  console.log('召唤券 n=7：', await det()); await shot(`109_召唤券_n7_${T}`);
  await click('[data-act="ticN"][data-arg="all"]'); await W(500); console.log('召唤券 最多：', await det()); await shot(`109_召唤券_最多_${T}`);
  await mall('tix', 600); console.log('召唤券 钱不够：', await det()); await shot(`109_召唤券_钱不够_${T}`);
  await mall('scroll', 12345); await click('[data-act="ticN"][data-arg="10"]'); await W(400); console.log('尸潮券 +10：', await det()); await shot(`109_尸潮券_${T}`);
  if (process.env.MALLONLY) return;
  /* 再打一次 */
  await ev(() => { const S = __g.S; S.fb.tix = 1; S.fb.run = 0; S.fb.pend = null; S.coins = 5000; __g.UI.closePanel(); __g.fbGo(1) });
  for (let i = 0; i < 120 && !(await ev(() => __g.FBV.active() && __g.FBV.phase() === 'fight')); i++) await W(1000);
  const lose = async () => { await ev(() => __g.FBV.fight().killPlayer()); for (let i = 0; i < 40 && !(await ev(() => !!document.querySelector('[data-fbe="again"]'))); i++) await W(500) };
  await W(2000); await lose();
  console.log('0 张时按钮：', await ev(() => document.querySelector('[data-fbe="again"]').innerText), '券', await ev(() => __g.S.fb.tix), '钱', await ev(() => __g.S.coins));
  await click('[data-fbe="again"]'); await W(800); console.log('0 张有钱：确认框', await ev(() => (document.querySelector('#ask') || document.body).innerText.includes('召唤券用完了'))); await shot(`109_再打一次_0张有钱_确认框_${T}`);
  await ev(() => { const b = [...document.querySelectorAll('#ask button, .ask button, button')].find(b => b.offsetParent && /^确定$/.test(b.innerText.trim())); if (b) b.click() });
  for (let i = 0; i < 40 && !(await ev(() => __g.FBV.phase() === 'fight' && window.__fbAgainT1 > 0)); i++) await W(300);
  console.log('确定以后：阶段', await ev(() => __g.FBV.phase()), '券', await ev(() => __g.S.fb.tix), '钱', await ev(() => __g.S.coins));
  await W(1500); await ev(() => { __g.S.coins = 300 }); await lose();
  console.log('没钱时按钮：', await ev(() => document.querySelector('[data-fbe="again"]').innerText));
  await click('[data-fbe="again"]'); await W(700); await shot(`109_再打一次_0张没钱_提示_${T}`);
  console.log('0 张没钱：还在副本', await ev(() => __g.FBV.active()), '阶段', await ev(() => __g.FBV.phase()), '钱', await ev(() => __g.S.coins), '提示', await ev(() => document.body.innerText.includes('召唤券用完了，末日币也不够')));
};
