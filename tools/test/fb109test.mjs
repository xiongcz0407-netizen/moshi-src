/* 设计 109：买 n 张尸潮券 / 召唤券（扣钱、加券、钓鱼区贵 20%、刚好够 / 差 1 块、最多能买几张） */
import * as FL from '../../src/js/fblogic.js';
import * as L from '../../src/js/logic.js';
import { FB } from '../../src/js/fbcfg.js';
import { TD } from '../../src/js/config.js';
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) process.exitCode = 1 };
const mk = coins => ({ coins, fb: { tix: 0 }, td: { scrolls: 0 } });
{ const S = mk(10000); ok(FL.buyTix(S, 7, false) && S.coins === 3000 && S.fb.tix === 7, '召唤券买 7 张：扣 7000、券 +7') }
{ const S = mk(10000); ok(FL.buyTix(S, 7, true) && S.coins === 10000 - 8400 && S.fb.tix === 7, '钓鱼区买 7 张：扣 8400（贵 20%）') }
{ const S = mk(7000); ok(FL.buyTix(S, 7, false) && S.coins === 0, '钱刚好够 7 张：买得到，剩 0') }
{ const S = mk(6999); ok(!FL.buyTix(S, 7, false) && S.coins === 6999 && S.fb.tix === 0, '差 1 块：买不了，什么都不变') }
for (const [c, far] of [[0, false], [999, false], [1000, false], [5432, false], [5432, true], [1199, true], [1200, true]]) { const u = FL.tixCost(1, far), mx = Math.floor(c / u), S = mk(c);
  ok((mx === 0 || FL.buyTix(S, mx, far)) && (mx === 0 || S.coins < u) && !FL.buyTix(mk(c), mx + 1, far), `召唤券「最多」：${c} 末日币${far ? '（钓鱼区）' : ''} → 最多 ${mx} 张（买得起 ${mx} 张，买不起 ${mx + 1} 张）`) }
{ const S = mk(TD.scroll * 6); ok(L.buyScroll(S, 6) && S.coins === 0 && S.td.scrolls === 6, `尸潮券买 6 张：扣 ${TD.scroll * 6}、券 +6`) }
{ const S = mk(TD.scroll * 6 - 1); ok(!L.buyScroll(S, 6) && S.td.scrolls === 0, '尸潮券差 1 块：买不了') }
ok(FB.tixPrice === 1000 && FL.tixCost(1, false) === 1000 && FL.tixCost(1, true) === 1200, '单价：召唤券 1000，钓鱼区 1200');
