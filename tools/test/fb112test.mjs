/* 设计 112：院子商人每日免费改送 1 颗星星。用法：node tools/test/fb112test.mjs */
import * as L from '../../src/js/logic.js';
import { FREE } from '../../src/js/config.js';
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) process.exitCode = 1 };
const S = L.newState(); S.stars = 5; S.gear = 2;
ok(FREE.star === 1, '每天送 1 颗');
ok(L.freeReady(S, '2026-10-25') && L.freeGear(S, '2026-10-25') && S.stars === 6 && S.gear === 2, '领一次：星星 +1，发条不变');
ok(!L.freeReady(S, '2026-10-25') && !L.freeGear(S, '2026-10-25') && S.stars === 6, '同一天第二次领不了');
ok(L.freeGear(S, '2026-10-26') && S.stars === 7, '第二天又能领');
const T = L.newState(); T.mallDay = '2026-10-25'; T.stars = 0; ok(!L.freeGear(T, '2026-10-25') && T.stars === 0 && L.freeGear(T, '2026-10-26') && T.stars === 1, '今天已经领过发条的存档：今天不能再领，明天领星星');
