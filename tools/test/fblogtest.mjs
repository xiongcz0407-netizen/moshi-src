/* 设计 90 / 94：掉落记录 8 项。用法：node tools/test/fblogtest.mjs */
import * as FL from '../../src/js/fblogic.js';
import { ITEMS } from '../../src/js/fbcfg.js';
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) process.exitCode = 1 };
const mk = () => ({ coins: 0, stars: 0, lv: { store: 5 }, td: { scrolls: 0, wins: {} }, st: { earned: 0 }, fb: undefined });
let S = mk(); FL.fbFix(S);
let r = FL.fbWin(S, 1, () => 0.5); let L = S.fb.log.at(-1);
ok(L.a === 'win' && L.n === 1 && L.how === 'first' && L.k === r.item.k && L.id === r.item.id && L.t > 0, '1 第一次打赢记「保底」：' + JSON.stringify(L));
r = FL.fbWin(S, 1, () => 0.3); L = S.fb.log.at(-1);
ok(L.a === 'win' && L.how === 'rand', '2 第二次打赢记「随机」：' + ITEMS[L.k].q);
const id1 = S.fb.pend.id; FL.pendTake(S); L = S.fb.log.at(-1);
ok(L.a === 'take' && L.id === id1 && S.fb.bag.some(x => x.id === id1), '3 收下记一条');
FL.fbWin(S, 1, () => 0.3); const id2 = S.fb.pend.id; FL.equip(S, id2); L = S.fb.log.at(-1);
ok(L.a === 'wear' && L.id === id2, '4 从获得框穿上记一条');
const n0 = S.fb.log.length; FL.equip(S, id1); ok(S.fb.log.length === n0, '5 背包里换装不记（只记从获得框穿上）');
FL.fbWin(S, 1, () => 0.1); const id3 = S.fb.pend.id; FL.dismantle(S, id3); L = S.fb.log.at(-1);
ok(L.a === 'dis' && L.id === id3 && 'st' in L, '6 分解（获得框里的）记一条');
for (let i = 0; i < 3; i++) { S.fb.bag.push({ id: 900 + i, k: Object.keys(ITEMS).find(k => ITEMS[k].q === 'n'), lv: 1, st: 0, crys: 0 }) }
const before = S.fb.log.length; FL.dismantleNormals(S);
ok(S.fb.log.length - before >= 3 && S.fb.log.slice(-3).every(e => e.a === 'dis'), '7 一键分解普通，每件各记一条');
for (let i = 0; i < 150; i++) { FL.fbWin(S, 1, () => 0.1); FL.dismantle(S, S.fb.pend.id) }
ok(S.fb.log.length === 100 && S.fb.log.at(-1).a === 'dis', '8a 只留最近 100 条：' + S.fb.log.length);
const old = mk(); old.fb = { won: { 1: 3 }, bag: [], eq: {}, crys: 5 }; FL.fbFix(old);
ok(Array.isArray(old.fb.log) && old.fb.log.length === 0 && old.fb.won[1] === 3, '8b 老存档没有 log，读进来补成空的');
