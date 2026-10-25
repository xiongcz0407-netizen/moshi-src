/* 5b：「再打一次」不要读取界面——量从调用 fbAgain 到黑屏淡出（能动）用了多久；读取界面有没有出来 */
export default async (pg, shot) => {
  const W = ms => pg.waitForTimeout(ms), ev = (f, a) => pg.evaluate(f, a);
  await ev(() => { const S = __g.S; S.lv.store = Math.max(5, S.lv.store); S.fb.tix = 99; S.fb.run = 0; S.fb.pend = null; __g.fbGo(1) });
  for (let i = 0; i < 120 && !(await ev(() => __g.FBV.active() && __g.FBV.phase() === 'fight')); i++) await W(1000);
  await W(3000);
  for (let k = 0; k < 3; k++) {
    await ev(() => { window.__fbAgainT1 = 0; window.__sawLoad = false; window.__poll = setInterval(() => { if (!document.querySelector('#scavLoad').classList.contains('hidden')) window.__sawLoad = true }, 10); __g.fbAgain(1) });
    for (let i = 0; i < 100 && !(await ev(() => window.__fbAgainT1 > 0)); i++) await W(50);
    console.log(`第 ${k + 1} 次：从点「再打一次」到黑屏开始淡出 ${await ev(() => Math.round(window.__fbAgainT1 - window.__fbAgainT0))} 毫秒（再加淡出 150 毫秒），读取界面出现过：${await ev(() => window.__sawLoad)}，阶段 ${await ev(() => __g.FBV.phase())}，召唤券 ${await ev(() => __g.S.fb.tix)}`);
    await ev(() => clearInterval(window.__poll)); await W(1500);
  }
  await shot('5b_再打一次以后_844');
};
