/* 副本存档逻辑自测（装备、掉率、炼宝、技能、晶石……）。用法：node tools/test/fbtest.mjs ，全是 ✓ 就对；有 ✗ 时退出码 1 */
import * as FL from '../../src/js/fblogic.js';
import { ITEMS, FB } from '../../src/js/fbcfg.js';
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) process.exitCode = 1 };
const mk = () => ({ coins: 100000, stars: 3, lv: { store: 5 }, td: { scrolls: 10, wins: { 3: 1, 103: 2 } }, st: { earned: 0 }, fb: undefined });
let S = mk(); FL.fbFix(S); S.fb.tix = 10;   /* 设计 108：副本用召唤券 */
ok(!S.td.wins[103] && S.td.wins[3] === 1, '旧存档英雄关进度去掉，普通关留着');
ok(FL.fbLockWhy({ ...S, lv: { store: 4 } }, 1) === '超市 5 级解锁', '超市 4 级：超市 5 级解锁');
ok(FL.fbCanStart(S, 1) === null, '5 级、10 张召唤券：能打第 1 关');
ok(FL.fbLockWhy(S, 2) === '先打赢前一关', '设计 81：第 2 关开放了，要先打赢第 1 关'); ok(FL.fbLockWhy(S, 3) === '先打赢前一关' && FL.fbLockWhy(S, 4) === '先打赢前一关' && FL.fbLockWhy(S, 5) === '先打赢前一关' && FL.fbLockWhy(S, 6) === '还没开放', '设计 102 / 114 / 116：第 3～5 关开放了（要先打赢前一关），第 6 关还没开放');
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
  for (const n of [1, 2, 3, 4, 5]) { const T = mk(); FL.fbFix(T); const h = { ...fbHero(T, { dmg: 10, rate: 0.4, range: 7.5, nadeDmg: 45, nadeR: 2.6, nadeCd: 10 }), dr: 0.6, armor1: true, heart: true }, st = createFight(n, h, { rng: () => 0.5 });
    st.locked = true; st.t = 179.9; st.boss.hp = st.boss.max = 1e12; let first = null, dead = null; const dt = 1 / 30;
    for (let i = 0; i < 30 * 12 && !st.over; i++) { const hp0 = st.player.hp; st.step(dt, {}); if (first === null && st.player.hp < hp0 - 1) first = (hp0 - st.player.hp) / st.player.max; if (st.player.dead) dead = st.t - 180 }
    ok(dead !== null && dead <= 8 + 1 / 30 && first !== null && Math.abs(first - 0.6) < 0.02, `设计 106：第 ${n} 关 3 分钟到放灭杀，第 1 次扣 ${first === null ? '-' : Math.round(first * 100)}%（减伤 60% 也不管），${dead === null ? '没倒下' : dead.toFixed(1) + ' 秒倒下'}（≤ 8 秒）`) } }
/* 设计 106b：灭杀一开始 BOSS 无敌（打上去血不掉），没打完 = 输 */
{ const { createFight } = await import('../../src/js/fbcore.js'); const { fbHero } = await import('../../src/js/fblogic.js');
  for (const n of [1, 2, 3, 4, 5]) { const T = mk(); FL.fbFix(T); const st = createFight(n, fbHero(T, { dmg: 10, rate: 0.4, range: 7.5, nadeDmg: 45, nadeR: 2.6, nadeCd: 10 }), { rng: () => 0.5 });
    st.locked = true; st.t = 179.95; st.boss.hp = 100; const dt = 1 / 30; st.step(dt, {}); st.step(dt, {});
    const b = st.boss; b.x = st.player.x; b.z = st.player.z - 4; let hp0 = b.hp;
    for (let i = 0; i < 30 * 10 && !st.over; i++) st.step(dt, { fire: true, skill: i % 30 === 0 ? 'focus' : i % 45 === 0 ? 'nade' : null });
    ok(st.rage && b.hp === hp0 && !b.dead && st.over && !st.win, `设计 106b：第 ${n} 关灭杀开始后开枪、集火、手雷，BOSS 血 ${hp0} → ${b.hp}（不变），结果：${st.win ? '赢' : '输'}`) } }
/* 设计 110：落石巨人的控制——眩晕、禁锢、全场滚石只有掩体影子里安全、禁锢后的快速横扫、掩体至少 2 个 */
{ const M = await import('../../src/js/fbcore.js'), { createFight } = M;   /* M.COVERS 每场重新建，要用 M.COVERS（活的），不能解构 */ const { fbHero } = await import('../../src/js/fblogic.js');
  const H = { dmg: 10, rate: 0.4, range: 7.5, nadeDmg: 45, nadeR: 2.6, nadeCd: 10 }, dt = 1 / 30;
  const mk3 = () => { const T = mk(); FL.fbFix(T); const st = createFight(3, { ...fbHero(T, H), hp: 1e6, speed: 5 }, { rng: () => 0.5 }); st.player.max = st.player.hp = 1e6; st.locked = true; st.t = 10; const b = st.boss; b.act = 'chase'; b.skillT = 99; b.basicCd = 99; b.x = 0; b.z = -11; return st };
  const hold = st => { st.boss.skillT = 99; st.boss.basicCd = 99 };
  { const st = mk3(), P = st.player; P.stunT = 1; const x0 = P.x, z0 = P.z, ch = P.charges; let fired = false;
    for (let i = 0; i < 24; i++) { hold(st); st.step(dt, { mx: 1, mz: 0, fire: true, skill: i === 3 ? 'roll' : null }); if (P.firing) fired = true }
    ok(Math.abs(P.x - x0) < 1e-6 && Math.abs(P.z - z0) < 1e-6 && !fired && P.charges === ch && !P.roll, '设计 110：眩晕期间不能走、不能开枪、不能翻滚') }
  { const st = mk3(), P = st.player; P.z = 4; P.x = 0.2; const pil = () => st.warns.push({ type: 'cells', cells: [{ x: P.x, z: P.z }], s: 3, x: P.x, z: P.z, id: 9000 + st.warns.length, k: 'pillars', t: 0, dur: 0.05 });
    const run = s => { const out = { hit: 0 }; for (let i = 0; i < Math.round(s * 30); i++) { hold(st); st.step(dt, {}); for (const e of st.ev) if (e.e === 'pdmg' && e.src === 'pillar') out.hit++ } return out };
    pil(); const a = run(1.2); const s1 = st.stats.stun; pil(); const b = run(0.6); const s2 = st.stats.stun; run(1.0); pil(); const c = run(0.5); const s3 = st.stats.stun;
    ok(a.hit === 1 && s1 === 1 && b.hit === 1 && s2 === 1 && c.hit === 1 && s3 === 2, `设计 110：石柱打中眩晕（${s1}）；眩晕完 0.2 秒再被打中：扣血、不眩晕（${s2}）；过了 1.5 秒再被打中：又眩晕（${s3}）`) }
  { const st = mk3(), P = st.player; P.rootT = 1; const x0 = P.x; for (let i = 0; i < 6; i++) { hold(st); st.step(dt, { mx: 1, mz: 0 }) } const still = Math.abs(P.x - x0) < 1e-6;
    hold(st); st.step(dt, { mx: 1, mz: 0, skill: 'roll' }); ok(still && P.roll && !(P.rootT > 0), '设计 110：禁锢期间不能走，翻滚能解除') }
  const rollAt = (inShadow, rollAfter) => { const st = mk3(), P = st.player, cs = M.COVERS.filter(c => !c.temp), c = cs[0];
    if (inShadow) { P.x = c.x; P.z = c.z + c.hz + 1.2 } else { P.x = 0.1; P.z = 15; if (M.COVERS.some(q => !q.temp && Math.abs(q.x - P.x) < q.hx + 0.4 && P.z > q.z && P.z < q.z + q.hz + 3.5)) P.x = -6 }
    st.forceCast('roll'); let rootAt = null, combo = 0, rolled = false;
    for (let i = 0; i < 30 * 6; i++) { st.boss.skillT = 99; st.boss.basicCd = 99; let sk = null; if (rootAt !== null && rollAfter != null && !rolled && st.t - rootAt >= rollAfter) { sk = 'roll'; rolled = true }
      st.step(dt, sk ? { skill: sk, mx: 0, mz: 1 } : {}); for (const e of st.ev) { if (e.e === 'proot') rootAt = st.t; if (e.e === 'pdmg' && e.src === 'combo') combo++ } }
    return { root: st.stats.root || 0, combo } };
  { const r = rollAt(true, null); ok(r.root === 0, '设计 110：站在掩体南边的影子里，全场滚石不吃、不禁锢') }
  { const r = rollAt(false, null); ok(r.root === 1 && r.combo === 1, `设计 110：不在影子里：吃滚石并禁锢（${r.root} 次），不翻滚被接着的快速横扫打中（${r.combo} 次）`) }
  { const r = rollAt(false, 0.1); ok(r.root === 1 && r.combo === 0, `设计 110：被禁锢 0.1 秒后翻滚：横扫打不中（${r.combo} 次）`) }
  { const st = mk3(); for (const c of M.COVERS.filter(c => !c.temp)) M.COVERS.splice(M.COVERS.indexOf(c), 1); st.forceCast("roll"); ok(M.COVERS.filter(c => !c.temp).length >= 2, `设计 110：场上掩体扔光了，放全场滚石前补到 ${M.COVERS.filter(c => !c.temp).length} 个（≥ 2）`) }
  { mk3(); M.COVERS.length = 0; M.COVERS.push({ k: 'spike', x: 0, z: 0, hx: 0.5, hz: 0.5, temp: true }); const a = M.segHit(0, 5, 0, -5, 0, true), b = M.segHit(0, 5, 0, -5); M.COVERS.length = 0; M.COVERS.push({ k: 'rock', x: 0, z: 0, hx: 0.5, hz: 0.5 }); const c = M.segHit(0, 5, 0, -5, 0, true); ok(!a && !!b && !!c, `设计 110b：石柱不挡子弹（${a ? '挡' : '不挡'}），但挡路（${b ? '挡' : '不挡'}）；掩体照样挡子弹（${c ? '挡' : '不挡'}）`) }
}

/* 设计 114：尖啸者——错乱（走、翻滚都反）、错乱后 2 秒不再错乱、闪现落点、掩体挡鸦弹、喇叭全坏不放音爆、半血修好喇叭 */
{ const M = await import('../../src/js/fbcore.js'), { createFight } = M; const { fbHero } = await import('../../src/js/fblogic.js');
  const H = { dmg: 10, rate: 0.4, range: 7.5, nadeDmg: 45, nadeR: 2.6, nadeCd: 10 }, dt = 1 / 30;
  const mk4 = (seed = 0.5) => { const T = mk(); FL.fbFix(T); let q = seed; const st = createFight(4, { ...fbHero(T, H), hp: 1e6, speed: 5 }, { rng: () => (q = (q * 9301 + 0.49297) % 1) }); st.player.max = st.player.hp = 1e6; st.t = 10; const b = st.boss; b.act = 'idle'; b.skillT = 99; b.basicCd = 99; b.blinkT = 99; b.blinkCd = 99; return st };
  const hold = st => { const b = st.boss; b.skillT = 99; b.basicCd = 99; b.blinkT = 99; b.blinkCd = 99 };
  { const st = mk4(), P = st.player; P.x = 0; P.z = 8; P.confT = 2; const x0 = P.x; for (let i = 0; i < 6; i++) { hold(st); st.step(dt, { mx: 1, mz: 0 }) }
    const went = P.x - x0; hold(st); st.step(dt, { mx: 1, mz: 0, skill: 'roll' }); const r = st.lastRoll;
    ok(went < -0.3 && r && r.ax < -0.9, `设计 114：错乱时摇杆往右推，人往左走（${went.toFixed(2)} 米），翻滚也往左（${r ? r.ax.toFixed(2) : '-'}）`) }
  { const st = mk4(), P = st.player, B = st.boss; P.x = 0; P.z = 8; B.x = 0; B.z = 0; let conf = 0; const cast = () => { hold(st); st.forceCast('shriek'); for (let i = 0; i < 30 * 1.6; i++) { hold(st); st.step(dt, {}); conf += st.ev.filter(e => e.e === 'pconf').length; if (st.boss.act === 'blink') { st.boss.act = 'idle'; st.boss.hidden = false } } };
    cast(); const a = conf; for (let i = 0; i < 30 * 2.3; i++) { hold(st); st.step(dt, {}) } cast(); const b2 = conf; for (let i = 0; i < 30 * 2.5; i++) { hold(st); st.step(dt, {}) } cast();
    ok(a === 1 && b2 === 1 && conf === 2, `设计 114：刺耳尖叫后错乱 2 秒；错乱完 2 秒内再叫不错乱（${a} → ${b2}），过了再叫又错乱（${conf}）`) }
  { const st = mk4(0.37), P = st.player, B = st.boss; P.x = 0; P.z = 6; B.x = 0; B.z = -3; B.blinkT = 2; B.skillT = 3; const land = [];
    for (let i = 0; i < 30 * 120 && !st.over; i++) { st.player.hp = 1e6; const mz = Math.sin(i / 90) * 0.8, mx = Math.cos(i / 70) * 0.8; st.step(dt, { mx, mz }); for (const e of st.ev) if (e.e === 'blinkIn' && !e.tower) land.push({ x: e.x, z: e.z }) }
    const bad = land.filter(q => q.x < M.ARENA.x0 + 0.99 || q.x > M.ARENA.x1 - 0.99 || q.z < M.ARENA.z0 + 0.99 || q.z > M.ARENA.z1 - 0.99 || M.COVERS.some(c => Math.abs(q.x - c.x) < c.hx + 0.6 && Math.abs(q.z - c.z) < c.hz + 0.6) || st.speakers.some(s => Math.hypot(s.x - q.x, s.z - q.z) < 1.2));
    ok(land.length > 20 && bad.length === 0, `设计 114：2 分钟里闪现落地 ${land.length} 次，落在场外 / 掩体里 / 喇叭杆上的 ${bad.length} 次`) }
  { const st = mk4(), P = st.player, B = st.boss, tank = M.COVERS.find(c => c.k === 'tank'); B.x = tank.x; B.z = tank.z - 4; P.x = tank.x; P.z = tank.z + 3; const hp0 = P.hp;
    st.forceCast('bolt'); for (let i = 0; i < 30; i++) { hold(st); st.step(dt, {}) } const hidden = hp0 - P.hp; P.x = tank.x + 3.2; B.x = P.x; const hp1 = P.hp; st.forceCast('bolt'); for (let i = 0; i < 30; i++) { hold(st); st.step(dt, {}) }
    ok(hidden === 0 && hp1 - P.hp > 0, `设计 114：躲在圆水箱后面鸦弹打不到（扣 ${hidden}），没掩体扣 ${Math.round(hp1 - P.hp)}`) }
  { const st = mk4(), P = st.player; P.x = 0; P.z = 8; for (const q of st.speakers) { q.hp = 0; q.dead = true } hold(st); st.forceCast('horn');
    ok(st.boss.cast && st.boss.cast.k === 'rings' && !st.stats.casts.horn, `设计 114：喇叭全坏了：喇叭音爆换成声波三环（放的是 ${st.boss.cast && st.boss.cast.k}）`) }
  { const st = mk4(), B = st.boss, [a, b2] = st.speakers; a.hp = 0; a.dead = true; b2.hp = b2.max * 0.3; B.hp = B.max * 0.49; hold(st); st.step(dt, {});
    ok(st.half && b2.hp === b2.max && a.dead, `设计 114：半血嗜血：没坏的喇叭回满血（${Math.round(b2.hp / b2.max * 100)}%），坏了的还是坏的`) }
  { const st = mk4(), P = st.player, B = st.boss; P.x = 0; P.z = 8; B.x = 0; B.z = 0; const q = st.speakers[0]; let shot = 0; for (let i = 0; i < 30 * 3; i++) { hold(st); B.x = 30; st.step(dt, { fire: true }); if (P.target === q) shot++ }
    ok(shot > 0 || Math.hypot(q.x - P.x, q.z - P.z) > 12, `设计 114：BOSS 不在射程里时打射程里的喇叭`) }
  /* 设计 114d：广播轰炸不上塔——闪到主角北边 8～10 米、站地上；最后那道声波环从 BOSS 脚下出 */
  for (const pz of [3, 16]) { const st = mk4(0.61), P = st.player, B = st.boss; P.x = 0.5; P.z = pz; B.x = 0; B.z = -2; hold(st); st.forceCast('bomb'); const d = Math.hypot(B.x - P.x, B.z - P.z), bx = B.x, bz = B.z;
    let ring = null; for (let i = 0; i < 30 * 6 && !ring; i++) { hold(st); st.step(dt, {}); ring = (st.rings || []).find(r => r.k < 0) || null }
    ok(!B.y && d >= 7.9 && d <= 10.1 && bz < pz && ring && Math.hypot(ring.x - bx, ring.z - bz) < 0.01, `设计 114d：主角在 z ${pz}，广播轰炸闪到 ${d.toFixed(1)} 米外（z ${bz.toFixed(1)}，高 ${B.y || 0}），声波环从 BOSS 脚下出（${ring ? 'ok' : '没有'}）`) }
  /* 设计 114d：BOSS 在射程里时先打 BOSS，喇叭离得再近也不打；正在打喇叭时 BOSS 一能打就马上换 */
  { const st = mk4(), P = st.player, B = st.boss, q = st.speakers[2]; P.x = q.x - 1.2; P.z = q.z; B.x = P.x - 1; B.z = P.z - 6; let spk = 0, boss = 0; for (let i = 0; i < 30 * 2; i++) { hold(st); st.step(dt, { fire: true }); if (P.target === q) spk++; if (P.target === B) boss++ }
    B.x = 40; for (let i = 0; i < 30; i++) { hold(st); B.x = 40; st.step(dt, { fire: true }) } const onSpk = P.target === q; B.x = P.x - 1; hold(st); st.step(dt, { fire: true }); st.step(dt, { fire: true });
    ok(spk === 0 && boss > 50 && onSpk && P.target === B, `设计 114d：BOSS 在射程里打 BOSS（BOSS ${boss} 帧、喇叭 ${spk} 帧）；BOSS 走远了打喇叭（${onSpk}），回来马上换回 BOSS（${P.target === B}）`) }
}

/* 设计 116：装甲暴君——封锁、牵引、护盾、激光网格格子、地毯第二波、掩体挡主炮 */
{ const M = await import('../../src/js/fbcore.js'), { createFight } = M; const { fbHero } = await import('../../src/js/fblogic.js');
  const H = { dmg: 10, rate: 0.4, range: 7.5, nadeDmg: 45, nadeR: 2.6, nadeCd: 10 }, dt = 1 / 30;
  const mk5 = (seed = 0.5) => { const T = mk(); FL.fbFix(T); let q = seed; const st = createFight(5, { ...fbHero(T, H), hp: 1e6, speed: 5 }, { rng: () => (q = (q * 9301 + 0.49297) % 1) }); st.player.max = st.player.hp = 1e6; st.t = 10; const b = st.boss; b.act = 'idle'; b.skillT = 99; b.gunCd = 99; return st };
  const hold = st => { st.boss.skillT = 99; st.boss.gunCd = 99 };
  { const st = mk5(), P = st.player, B = st.boss; P.x = 0; P.z = 6; B.x = 0; B.z = -4; st.forceCast('emp'); for (let i = 0; i < 30 * 1.6; i++) { hold(st); st.step(dt, {}) }
    const lk = P.lockT > 0, cd0 = { ...P.cd }, ch = P.charges; st.step(dt, { skill: 'roll' }); st.step(dt, { skill: 'focus' }); st.step(dt, { skill: 'stun' });
    const blocked = P.charges === ch && !P.roll && P.cd.focus === Math.max(0, cd0.focus - 3 * dt) * 0 + P.cd.focus && !(P.focus > 0);
    for (let i = 0; i < 30 * 3; i++) { hold(st); st.boss.act = 'idle'; st.boss.cast = null; st.step(dt, {}) } const free = !(P.lockT > 0); const imm = P.lockImm > 0;
    ok(lk && blocked && !(P.focus > 0) && free && imm, `设计 116：电磁脉冲后技能封锁 3 秒：翻滚、集火、震荡弹按不了（翻滚次数 ${ch} → ${P.charges}）；3 秒后解开、之后 3 秒内不再封锁（免疫 ${imm}）`) }
  { const st = mk5(), P = st.player, B = st.boss; P.x = 0; P.z = 6; B.x = 0; B.z = -4; P.lockImm = 9; st.forceCast('emp'); for (let i = 0; i < 30 * 1.6; i++) { hold(st); st.step(dt, {}) }
    ok(!(P.lockT > 0), '设计 116：封锁结束后 3 秒内再中电磁脉冲不封锁') }
  const pullRun = roll => { const st = mk5(), P = st.player, B = st.boss; P.x = 0; P.z = 1; B.x = 0; B.z = -4; st.forceCast('pull'); let rolled = false;   /* 读条时站着（还在打），吸起来才往外跑 */
    for (let i = 0; i < 30 * 2.3; i++) { hold(st); const d = Math.hypot(P.x - B.x, P.z - B.z); const sk = roll && !rolled && P.pullT > 0 && d < 4 ? (rolled = true, 'roll') : null; st.step(dt, { mx: 0, mz: P.pullT > 0 ? 1 : 0, skill: sk }); if (st.boss.act !== 'pulling' && !(P.pullT > 0) && i > 40) break }
    return Math.hypot(P.x - B.x, P.z - B.z) };
  { const a = pullRun(false), b = pullRun(true); ok(a < 5 && b >= 5, `设计 116：电磁牵引一直往外走被吸到 ${a.toFixed(1)} 米（霰弹炮够得着），往外翻滚挣到 ${b.toFixed(1)} 米（够不着）`) }
  { const st = mk5(), P = st.player, B = st.boss; P.x = 0; P.z = 6; B.x = 0; B.z = -4; st.forceCast('shield'); for (let i = 0; i < 30 * 1.5; i++) { hold(st); st.step(dt, {}) }
    const hp0 = B.hp; st.player.cd.focus = 99; P.x = B.x; P.z = B.z + 5; const shots = []; for (let i = 0; i < 30; i++) { hold(st); B.hp = hp0; st.step(dt, {}) }
    const n = st.pylons ? st.pylons.length : 0; let dmgS = 0; { const h0 = B.hp; B.hp = 1e9; st.boss.hp = 1e9; const before = B.hp; st.pend = null; }
    for (const m of st.pylons || []) { m.hp = 0; m.dead = true; m.deadT = 0 } hold(st); st.step(dt, {}); hold(st); st.step(dt, {});
    ok(n === 3 && !B.shield && B.vuln > 0, `设计 116：能量护盾升 ${n} 根柱子，3 根都打掉就破盾（破盾瘫着受伤 +30%：${(B.vuln || 0).toFixed(1)} 秒）`) }
  { const st = mk5(), B = st.boss; B.shield = true; const a0 = B.hp; st.boss.hp = 100000; st.boss.max = 1e6; const P = st.player; P.x = 0; P.z = B.z + 4; const hp1 = B.hp;
    const hit = k => { const keep = B.hp; B.hp = 100000; B.shield = k; let got = 0; for (let i = 0; i < 30 * 2; i++) { hold(st); st.step(dt, { fire: true }); for (const e of st.ev) if (e.e === 'hit' && e.who === 'boss') got += e.a } return got };
    const off = hit(false), on = hit(true); ok(on > 0 && on < off * 0.3, `设计 116：护盾时打 BOSS 伤害 ${on}，没护盾 ${off}（约 −80%）`) }
  { let minCell = 99, n = 0; for (let sd = 0.05; sd < 1; sd += 0.09) { const st = mk5(sd), P = st.player; P.x = (sd - 0.5) * 10; P.z = -8 + sd * 20; st.forceCast('grid');
      const hz = st.warns.filter(w => w.k === 'gridH').map(w => w.z).sort((a, b) => a - b), vx = st.warns.filter(w => w.k === 'gridV').map(w => w.x).sort((a, b) => a - b);
      for (const arr of [hz, vx]) for (let i = 1; i < arr.length; i++) minCell = Math.min(minCell, arr[i] - arr[i - 1] - 0.8); n++ }
    ok(minCell >= 2.5 - 1e-6, `设计 116：激光网格 ${n} 次，最小的格子 ${minCell.toFixed(2)} 米（≥ 2.5）`) }
  { let worst = 0, n = 0; for (let sd = 0.05; sd < 1; sd += 0.09) { const st = mk5(sd), P = st.player; P.x = (sd - 0.5) * 8; P.z = -6 + sd * 18; st.forceCast('carpet'); const s1 = st.boss.cast.safe;
      for (let i = 0; i < 30 * 1.7; i++) { hold(st); st.step(dt, {}) } const w2 = st.warns.find(w => w.k === 'carpet2'); if (!w2) continue; n++;
      for (const q of w2.safe) worst = Math.max(worst, Math.min(...s1.map(p => Math.hypot(p.x - q.x, p.z - q.z)))) }
    ok(n > 5 && worst <= 5 + 1e-6, `设计 116：地毯轰炸 ${n} 次，第二波每块空地离第一波最近的空地最远 ${worst.toFixed(2)} 米（≤ 5）`) }
  { const st = mk5(), P = st.player, B = st.boss, c = M.COVERS.find(q => q.k === 'base'); B.x = c.x; B.z = c.z - 5; P.x = c.x; P.z = c.z + 3; st.forceCast('cannon'); const hp0 = P.hp;
    for (let i = 0; i < 30 * 3.3; i++) { hold(st); P.x = c.x; P.z = c.z + 3; st.step(dt, {}) } const hid = hp0 - P.hp;
    const st2 = mk5(), P2 = st2.player, B2 = st2.boss; B2.x = 0; B2.z = -6; P2.x = 0; P2.z = 4; st2.forceCast('cannon'); const h2 = P2.hp; for (let i = 0; i < 30 * 3.3; i++) { hold(st2); st2.step(dt, {}) }
    ok(hid === 0 && h2 - P2.hp > 0, `设计 116：躲在掩体后面主炮打不到（扣 ${hid}），没挡扣 ${Math.round(h2 - P2.hp)}`) }
}
