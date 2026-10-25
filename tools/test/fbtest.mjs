/* 副本存档逻辑自测（装备、掉率、炼宝、技能、晶石……）。用法：node tools/test/fbtest.mjs ，全是 ✓ 就对；有 ✗ 时退出码 1 */
import * as FL from '../../src/js/fblogic.js';
import { ITEMS, FB } from '../../src/js/fbcfg.js';
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) process.exitCode = 1 };
const mk = () => ({ coins: 100000, stars: 3, lv: { store: 5 }, td: { scrolls: 10, wins: { 3: 1, 103: 2 } }, st: { earned: 0 }, fb: undefined });
let S = mk(); FL.fbFix(S); S.fb.tix = 10;   /* 设计 108：副本用召唤券 */
ok(!S.td.wins[103] && S.td.wins[3] === 1, '旧存档英雄关进度去掉，普通关留着');
ok(FL.fbLockWhy({ ...S, lv: { store: 4 } }, 1) === '超市 5 级解锁', '超市 4 级：超市 5 级解锁');
ok(FL.fbCanStart(S, 1) === null, '5 级、10 张召唤券：能打第 1 关');
ok(FL.fbLockWhy(S, 2) === '先打赢前一关', '设计 81：第 2 关开放了，要先打赢第 1 关'); ok(FL.fbLockWhy(S, 3) === '先打赢前一关' && FL.fbLockWhy(S, 4) === '还没开放', '设计 102：第 3 关开放了（要先打赢第 2 关），第 4 关还没开放');
FL.fbStart(S, 1); ok(S.fb.tix === 9 && S.td.scrolls === 10 && S.fb.run === 1, '设计 108：挑战第 1 关扣 1 张召唤券，尸潮券不动');
FL.fbLose(S); ok(S.fb.run === 0 && !S.fb.pend && S.fb.crys === 0, '输了：没有掉落');
FL.fbStart(S, 1); const c0 = S.coins; const r = FL.fbWin(S, 1, () => 0.3, 121);
ok(S.coins - c0 === 1500 && S.fb.crys === 2 && ITEMS[r.item.k].q === 'e' && ITEMS[r.item.k].slot === 'w' && r.first, '第一次打赢：1500 币、2 晶石、史诗武器');
ok(FL.fbCanStart(S, 1) === '上次的装备还没收下', '装备没收下不能再打');
ok(FL.equip(S, r.item.id) === true && S.fb.eq.w && !S.fb.pend, '穿上');
/* 第二次：按掉率 */
const cnt = { n: 0, e: 0, s: 0, l: 0 }; for (let i = 0; i < 4000; i++) { const T = { ...mk() }; FL.fbFix(T); T.fb.won[1] = 1; const x = FL.fbWin(T, 1); cnt[ITEMS[x.item.k].q]++ }
ok(Math.abs(cnt.n / 4000 - 0.66) < 0.03 && Math.abs(cnt.e / 4000 - 0.25) < 0.03 && Math.abs(cnt.s / 4000 - 0.03) < 0.015 && Math.abs(cnt.l / 4000 - 0.06) < 0.02,   /* 设计 98：所有关卡 66 / 25 / 3 / 6 */ `重复打赢掉率 普通 ${(cnt.n / 40).toFixed(1)}% 史诗 ${(cnt.e / 40).toFixed(1)}% 套装 ${(cnt.s / 40).toFixed(1)}% 传说 ${(cnt.l / 40).toFixed(1)}%`);
/* 背包满 */
for (let i = 0; i < FB.bag; i++) { FL.fbWin(S, 1, () => 0.1); FL.pendTake(S) }
ok(S.fb.bag.length === FB.bag, '背包 30 件');
FL.fbWin(S, 1, () => 0.1); ok(!FL.pendTake(S) && FL.bagFull(S), '背包满了：收下不行');
const d = FL.dismantle(S, S.fb.pend.id); ok(d === 1 && !S.fb.pend, '普通分解 1 晶石');
/* 不开宝箱：奖励在 fbWin 时已经给了 */
ok(S.fb.got && S.fb.got.coins === 1500, '不开宝箱也已经给了（got 记着，回超市弹框）');
/* 炼宝 */
const w = S.fb.eq.w; S.fb.crys = 1000;
for (let i = 0; i < 3; i++) FL.refine(S, w.id, () => 0.99); ok(w.st === 3, '1～3 星 100%');
let f = FL.refine(S, w.id, () => 0.95); ok(!f.ok && w.st === 3 && w.pity === 1, '4 星失败：不掉星，保底 +1');
ok(Math.abs(FL.refineInfo(w).rate - 0.95) < 1e-9, '保底后成功率 90% → 95%');
f = FL.refine(S, w.id, () => 0.9); ok(f.ok && w.st === 4 && w.pity === 0, '成功后保底清零');
for (let i = 0; i < 4; i++) { let g = 0; while (!FL.refine(S, w.id, () => 0).ok && g++ < 5); } ok(w.st === 8, '升到 8 星');
FL.refine(S, w.id, () => 0.99); ok(w.st === 8 && !w.pity, '9 星失败没有保底（看运气）');
ok(FL.refineInfo(w).luck, '9 星写看运气');
w.st = 9; ok(FL.refineInfo(w).max, '史诗最高 9 星');
const crysIn = w.crys; S.fb.eq.w = null; S.fb.bag.pop(); S.fb.bag.push(w); const g = FL.dismantle(S, w.id); ok(g === 3 + Math.floor(crysIn / 2), `分解史诗 9 星：3 + 炼进去的一半 = ${g}`);
/* 技能 */
const c1 = S.coins; ok(FL.skillUp(S, 'focus') && S.fb.sk.focus === 2 && c1 - S.coins === 1000, '集火 1→2 级 1000 币');
for (let i = 0; i < 20; i++) FL.skillUp(S, 'focus'); ok(S.fb.sk.focus === 10, '最高 10 级');
/* 晶石 */
const k0 = S.fb.crys; FL.buyCrystal(S, 1); ok(S.fb.crys - k0 === 10, '买 10 颗晶石'); FL.starCrystal(S, 1); ok(S.fb.crys - k0 === 25 && S.stars === 2, '1 星换 15 晶石');
/* 数值：设计55 对表 */
const st = FL.itemStats({ k: 's1_h', lv: 1, st: 0 }); ok(st.main.hp === 144 && st.aff[0][1] === 88 && st.aff[1][1] === 5.3, `设计 105：拾荒者·头盔 不吃掉落关、按 Lv5：生命 ${st.main.hp}，固定 ${st.aff.map(a => a[1]).join(' / ')}（90×1.6 = 144，88 / 5.3）`);
const l1 = FL.itemStats({ k: 'l_w', lv: 1, st: 0 }); /* 设计 101：吸血词条 1.5 → 0.6，獠牙 1.9 → 0.8 */ ok(l1.main.dmg === 12 && l1.aff.map(a => a[1]).join() === '7.5,18.8,0.8', `獠牙 ${JSON.stringify(l1)}`);
const s2 = FL.itemStats({ k: 's2_w', lv: 6, st: 0 }); ok(s2.main.dmg === 25.8 && s2.aff[0][1] === 38.8 && s2.aff[1][1] === 15.5, `设计 105：猎杀者·武器 按 Lv10 ${JSON.stringify(s2)}（25.8 / 38.8 / 15.5）`);
/* 设计 59 */
import { heroStats } from '../../src/js/logic.js';
{ const T = mk(); T.lv.store = 3; T.hero = { dmg: 5, rate: 5, range: 5, nade: 5 }; T.treas = {}; FL.fbFix(T); const a = heroStats(T); T.fb.eq.w = { id: 1, k: 'l_w', lv: 1, st: 12 }; T.fb.eq.m = { id: 2, k: 'l_m', lv: 10, st: 12 }; const b = heroStats(T);
  ok(JSON.stringify(a) === JSON.stringify(b) && a.hp === 380, `尸潮数值不看装备，超市 3 级血量 ${a.hp}`) }
{ const T = mk(); FL.fbFix(T); const h = FL.fbHero(T, { dmg: 46, rate: 0.2, range: 11, nadeDmg: 237, nadeR: 3.8, nadeCd: 6.4 }); ok(h.hp === 580 && h.dr === 0, `副本基础生命 ${h.hp}、减伤 ${h.dr}`) }
{ const st = FL.itemStats({ k: 'n_m', lv: 1, st: 0 }), e1 = FL.itemStats({ k: 'e_m1', lv: 1, st: 0 }), l = FL.itemStats({ k: 'l_m', lv: 10, st: 0 });
  ok(st.main.hp === 50 && st.main.dr === 2 && e1.main.hp === 70 && e1.aff[0][1] === 50 && e1.aff[1][1] === 0.6, '平安符 生命 50 减伤 2；铁片护符 70/3 + 生命 50、吸血 0.6（设计 101）');
  ok(l.main.hp === Math.round(90 * 2.35 * 10) / 10, `不眠之心 主属性 ${JSON.stringify(l.main)}，固定 ${JSON.stringify(l.aff)}`) }
{ const c = {}; for (let i = 0; i < 2000; i++) { const T = mk(); FL.fbFix(T); const r = FL.fbWin(T, 10, Math.random); c[r.item.k] = (c[r.item.k] || 0) + 1; if (ITEMS[r.item.k].q !== 'l' || r.item.lv !== 10) c.bad = 1 } ok(!c.bad && Object.keys(c).length === 6, `设计 105b：第 10 关第一次打赢保底传说，6 种随机部位：${Object.keys(c).length} 种`) }
{ const c = {}; for (let i = 0; i < 3000; i++) { const T = mk(); FL.fbFix(T); T.fb.won[1] = 1; const r = FL.fbWin(T, 1, (() => { let k = 0; return () => k++ ? Math.random() : 0.1 })()); c[ITEMS[r.item.k].slot] = (c[ITEMS[r.item.k].slot] || 0) + 1 } ok(Object.keys(c).length === 6 && c.m > 400, `普通随机部位 6 个：${JSON.stringify(c)}`) }
{ const T = mk(); FL.fbFix(T); T.fb.crys = 100; T.fb.pend = null; T.fb.bag = [{ id: 9, k: 'e_m2', lv: 1, st: 0, crys: 0 }]; FL.refine(T, 9, () => 0); ok(T.fb.bag[0].st === 1, '护符能炼宝'); ok(FL.equip(T, 9) === true && T.fb.eq.m.k === 'e_m2', '护符能穿'); T.fb.bag.push({ id: 10, k: 'l_m', lv: 10, st: 0, crys: 0 }); ok(FL.dismantle(T, 10) === 6, '不眠之心分解 6 晶石') }
{ const T = mk(); FL.fbFix(T); for (const sl of ['w', 'h', 'a', 'g', 'b']) T.fb.eq[sl] = { id: sl, k: 's2_' + sl, lv: 6, st: 0 }; const g5 = FL.gearStats(T); T.fb.eq.h = null; const g4 = FL.gearStats(T); ok(g5.all - g4.all === 30 && g4.all === 10, `猎杀者 5 件全部伤害 ${g5.all}%，4 件 ${g4.all}%`) }
{ const T = mk(); FL.fbFix(T); for (const sl of ['w', 'h', 'a', 'g', 'b']) T.fb.eq[sl] = { id: sl, k: 's1_' + sl, lv: 5, st: 0 }; const g5 = FL.gearStats(T); T.fb.eq.h = null; const g4 = FL.gearStats(T); ok(g5.all - g4.all === 65 && g4.all === 10, `拾荒者 5 件全部伤害 +${g5.all - g4.all}%（要 65），4 件 +${g4.all}%`) }
/* 设计 106：狂暴 = 灭杀：3 分钟到，不管多少血、有没有减伤 / 不灭之铠 / 不眠之心，8 秒内一定倒下；第 1 次扣最大生命 60%（无视减伤） */
{ const { createFight } = await import('../../src/js/fbcore.js'); const { fbHero } = await import('../../src/js/fblogic.js');
  for (const n of [1, 2, 3]) { const T = mk(); FL.fbFix(T); const h = { ...fbHero(T, { dmg: 10, rate: 0.4, range: 7.5, nadeDmg: 45, nadeR: 2.6, nadeCd: 10 }), dr: 0.6, armor1: true, heart: true }, st = createFight(n, h, { rng: () => 0.5 });
    st.locked = true; st.t = 179.9; st.boss.hp = st.boss.max = 1e12; let first = null, dead = null; const dt = 1 / 30;
    for (let i = 0; i < 30 * 12 && !st.over; i++) { const hp0 = st.player.hp; st.step(dt, {}); if (first === null && st.player.hp < hp0 - 1) first = (hp0 - st.player.hp) / st.player.max; if (st.player.dead) dead = st.t - 180 }
    ok(dead !== null && dead <= 8 + 1 / 30 && first !== null && Math.abs(first - 0.6) < 0.02, `设计 106：第 ${n} 关 3 分钟到放灭杀，第 1 次扣 ${first === null ? '-' : Math.round(first * 100)}%（减伤 60% 也不管），${dead === null ? '没倒下' : dead.toFixed(1) + ' 秒倒下'}（≤ 8 秒）`) } }
/* 设计 106b：灭杀一开始 BOSS 无敌（打上去血不掉），没打完 = 输 */
{ const { createFight } = await import('../../src/js/fbcore.js'); const { fbHero } = await import('../../src/js/fblogic.js');
  for (const n of [1, 2, 3]) { const T = mk(); FL.fbFix(T); const st = createFight(n, fbHero(T, { dmg: 10, rate: 0.4, range: 7.5, nadeDmg: 45, nadeR: 2.6, nadeCd: 10 }), { rng: () => 0.5 });
    st.locked = true; st.t = 179.95; st.boss.hp = 100; const dt = 1 / 30; st.step(dt, {}); st.step(dt, {});
    const b = st.boss; b.x = st.player.x; b.z = st.player.z - 4; let hp0 = b.hp;
    for (let i = 0; i < 30 * 10 && !st.over; i++) st.step(dt, { fire: true, skill: i % 30 === 0 ? 'focus' : i % 45 === 0 ? 'nade' : null });
    ok(st.rage && b.hp === hp0 && !b.dead && st.over && !st.win, `设计 106b：第 ${n} 关灭杀开始后开枪、集火、手雷，BOSS 血 ${hp0} → ${b.hp}（不变），结果：${st.win ? '赢' : '输'}`) } }
