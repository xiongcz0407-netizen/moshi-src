/* 设计 108：副本召唤券。用法：node tools/test/fb108test.mjs */
import * as FL from '../../src/js/fblogic.js';
import * as L from '../../src/js/logic.js';
import { FB } from '../../src/js/fbcfg.js';
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) process.exitCode = 1 };
/* 新存档 0 张；老存档读一次 +3 张，再读不重复 */
const N = L.newState(); ok(N.fb.tix === 0, `新存档召唤券 ${N.fb.tix} 张`);
const N2 = L.migrate(JSON.parse(JSON.stringify(N))); ok(N2.fb.tix === 0 && !N2.tixGift, '新存档存了再读：不送');
const old = JSON.parse(JSON.stringify(N)); delete old.fb.tix; old.td.scrolls = 7; old.lv.store = 5;
const O1 = L.migrate(old); ok(O1.fb.tix === 3 && O1.tixGift === 3 && O1.td.scrolls === 7, `老存档（没有召唤券字段）：送 ${O1.fb.tix} 张，提示一次；尸潮券 ${O1.td.scrolls} 不动`);
delete O1.tixGift; const O2 = L.migrate(JSON.parse(JSON.stringify(O1))); ok(O2.fb.tix === 3 && !O2.tixGift, '再读一次：不重复送');
const old2 = JSON.parse(JSON.stringify(N)); delete old2.fb; const O3 = L.migrate(old2); ok(O3.fb.tix === 3, '更老的存档（没有副本数据）也送 3 张');
/* 挑战第 1 关、第 3 关都只扣 1 张；尸潮券不变；不够不能开打；输了不退 */
const S = L.migrate(JSON.parse(JSON.stringify(N))); S.lv.store = 5; S.fb.won = { 1: 1, 2: 1 }; S.fb.tix = 2; S.td.scrolls = 5;
ok(FB.tix === 1, '每关 1 张');
ok(FL.fbStart(S, 1) && S.fb.tix === 1 && S.td.scrolls === 5, '第 1 关扣 1 张，尸潮券不变'); FL.fbLose(S); ok(S.fb.tix === 1, '输了不退');
ok(FL.fbStart(S, 3) && S.fb.tix === 0 && S.td.scrolls === 5, '第 3 关也只扣 1 张'); FL.fbLose(S);
ok(FL.fbCanStart(S, 1) === '召唤券不够，去院子商人那里买' && !FL.fbStart(S, 1) && S.fb.run === 0, '0 张：不能开打（提示去院子商人那里买）');
S.td.scrolls = 99; ok(FL.fbCanStart(S, 1) === '召唤券不够，去院子商人那里买', '尸潮券再多也不能打副本');
/* 买 */
S.coins = 6500; ok(FL.buyTix(S, 1) && S.fb.tix === 1 && S.coins === 5500, '买 1 张扣 1000'); ok(FL.buyTix(S, 5) && S.fb.tix === 6 && S.coins === 500, '买 5 张扣 5000');
ok(!FL.buyTix(S, 1) && S.fb.tix === 6 && S.coins === 500, '钱不够买不了');
ok(FL.tixCost(1, true) === 1200 && FL.tixCost(5, true) === 6000, '钓鱼区贵 20%：1200 / 6000');
