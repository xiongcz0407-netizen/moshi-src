/* 设计 105：每关不同名字、传说 12 种每关都能掉、套装不吃 Lv、老存档迁移、同星对比。用法：node tools/test/fb105test.mjs */
import * as FL from '../../src/js/fblogic.js';
import { ITEMS, LV_NAMES, LEG_KEYS, SETS } from '../../src/js/fbcfg.js';
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) process.exitCode = 1 };
const mk = () => { const S = { coins: 0, stars: 0, lv: { store: 5 }, td: { scrolls: 99, wins: {} }, st: { earned: 0 } }; FL.fbFix(S); return S };
/* 名字 */
const all = []; for (let n = 1; n <= 10; n++) for (const k of Object.keys(ITEMS)) if (!ITEMS[k].set) all.push(FL.nameAt(k, n));
ok(new Set(all).size === all.length && all.length === 300, `史诗 12 + 普通 6 + 传说 12 = 30 种 × 10 关，名字全都不一样（${new Set(all).size}/${all.length}）`);
ok(FL.itemName({ k: 'e_w1', lv: 1 }) === '铁吼' && FL.itemName({ k: 'e_w1', lv: 2 }) === '酸蚀' && FL.itemName({ k: 'e_w1', lv: 3 }) === '碎岩', '史诗武器 Lv1/2/3：铁吼 / 酸蚀 / 碎岩');
ok(FL.itemName({ k: 'l_h1', lv: 3 }) === '岩眼头盔' && FL.itemName({ k: 'n_m', lv: 10 }) === '废铁牌' && FL.itemName({ k: 'l_m2', lv: 1 }) === '血契护符', '传说、普通、新护符名字');
ok(FL.itemName({ k: 's1_h', lv: 5 }) === '拾荒者·头盔', '套装不查表');
/* 传说：每关都能掉 12 种，各约 1/12，lv = 那一关 */
for (const n of [1, 3]) {
  const c = {}; let bad = 0; const N = 12000;
  for (let i = 0; i < N; i++) { const S = mk(); S.fb.won[n] = 1; let k = 0; const r = FL.fbWin(S, n, () => k++ ? Math.random() : 0.999); c[r.item.k] = (c[r.item.k] || 0) + 1; if (ITEMS[r.item.k].q !== 'l' || r.item.lv !== n) bad++ }
  const v = LEG_KEYS.map(k => c[k] || 0), mn = Math.min(...v) / N, mx = Math.max(...v) / N;
  ok(!bad && Object.keys(c).length === 12 && mn > 1 / 12 - 0.012 && mx < 1 / 12 + 0.012, `第 ${n} 关掉传说 ${N} 次：12 种都出现，每种 ${(mn * 100).toFixed(1)}%～${(mx * 100).toFixed(1)}%（1/12 = 8.3%），Lv 都是 ${n}`);
}
{ const t = FL.dropTable(3).find(x => x.q === 'l'); ok(t.keys.length === 12, '副本掉落列表：传说那一行 12 个'); const nm = t.keys.map(k => FL.nameAt(k, 3)); ok(new Set(nm).size === 12, '第 3 关 12 个传说名字各不相同：' + nm.join('、')) }
/* Lv 跟着关卡；套装 Lv5 / Lv10 */
{ const S = mk(); S.fb.won[3] = 1; let k = 0; const r = FL.fbWin(S, 3, () => [0.8, 0.3][k++] ?? 0.5); ok(ITEMS[r.item.k].q === 'e' && r.item.lv === 3, `第 3 关掉的史诗 Lv3（${FL.itemName(r.item)}）`) }
{ const S = mk(); S.fb.won[2] = 1; let k = 0; const r = FL.fbWin(S, 2, () => k++ ? 0.5 : 0.92); ok(r.item.k === 's1_a' && r.item.lv === 5, `第 2 关掉的套装件 拾荒者·护甲 Lv${r.item.lv}`) }
ok(ITEMS.s2_b.lv === 10 && ITEMS.s2_w.at === 6 && ITEMS.s1_h.at === 1, '套装：猎杀者 Lv10，每件还在原来那一关掉');
{ const a = FL.itemStats({ k: 's1_h', lv: 1, st: 0 }), b = FL.itemStats({ k: 's1_w', lv: 5, st: 0 }); ok(a.main.hp === 144 && b.main.dmg === +(11 * 1.6).toFixed(1), `拾荒者头盔（存档 lv 1）也按 Lv5 算：生命 ${a.main.hp}`) }
/* 老存档迁移（xiongcz2 那种结构） */
{ const S = { lv: { store: 5 }, td: { wins: {} }, fb: { won: { 1: 37 }, bag: [{ id: 7, k: 'l3', lv: 3, st: 2 }, { id: 8, k: 's1_a', lv: 2, st: 0 }], eq: { w: { id: 1, k: 'l1', lv: 1, st: 0 }, h: { id: 2, k: 's1_h', lv: 1, st: 12 }, m: { id: 3, k: 'l_m', lv: 10, st: 1 }, g: { id: 4, k: 'e_g2', lv: 1, st: 7 } }, pend: { id: 9, k: 'l10', lv: 10, st: 0 }, log: [{ a: 'win', k: 'l1', n: 1 }] } };
  FL.fbFix(S); const f = S.fb;
  ok(f.eq.w.k === 'l_w1' && f.eq.w.lv === 1 && FL.itemName(f.eq.w) === '獠牙', `獠牙 l1 Lv1 → ${f.eq.w.k} Lv${f.eq.w.lv}「${FL.itemName(f.eq.w)}」`);
  ok(f.eq.m.k === 'l_m1' && f.eq.m.lv === 10 && FL.itemName(f.eq.m) === '永夜之心', `不眠之心 l_m Lv10 → ${f.eq.m.k} Lv10「${FL.itemName(f.eq.m)}」（第 10 关的名字）`);
  ok(f.bag[0].k === 'l_a1' && f.bag[0].lv === 3 && f.bag[0].st === 2 && f.pend.k === 'l_b2', '背包 l3 → l_a1（Lv、星保留），获得框 l10 → l_b2');
  ok(f.eq.h.lv === 5 && f.bag[1].lv === 5 && f.eq.h.st === 12, '拾荒者头盔、护甲 Lv → 5（星保留）');
  ok(f.eq.g.k === 'e_g2' && f.eq.g.lv === 1, '史诗不动');
  ok(f.log[0].k === 'l_w1', '掉落记录里的老 key 也换了');
  const h = FL.fbHero(S, { dmg: 46, rate: 0.2, range: 11, nadeDmg: 237, nadeR: 3.8, nadeCd: 6.4 }); ok(h.bleed && h.heart && h.focusHeal === 0, '迁移后獠牙流血、不眠之心照常；没穿 l_m2 时 focusHeal 0');
  f.eq.m = { id: 3, k: 'l_m2', lv: 1, st: 0 }; ok(FL.fbHero(S, { dmg: 46, rate: 0.2, range: 11 }).focusHeal === 0.005, '穿 l_m2：fbHero 返回 focusHeal 0.005');
  f.eq.h = { id: 2, k: 'l_h1', lv: 3, st: 0 }; const h2 = FL.fbHero(S, { dmg: 46, rate: 0.2, range: 11 }); ok(h2.range === 13 && h2.bossCrit === 0.1, '鹰眼（l_h1）射程 +2、打 BOSS 暴击 +10%');
}
/* 同星对比、金色 ⇡ */
{ const S = mk(); S.fb.eq.w = { id: 1, k: 'e_w1', lv: 1, st: 7 }; const c = { id: 2, k: 'e_w1', lv: 3, st: 0 };
  const a = FL.statsAt(c, 7), b = FL.itemStats(S.fb.eq.w);
  ok(!FL.better(S, c) && FL.betterAt(S, c), `碎岩 Lv3 0★ 现在不如 铁吼 Lv1 7★（↑ 不亮），炼到 7★ 更好（⇡）：伤害 ${a.main.dmg} vs ${b.main.dmg}`);
  ok(a.main.dmg === +(10 * 1.3 * 1.7).toFixed(1), `statsAt 按 Lv3 × 7★ 算：${a.main.dmg}`);
  S.fb.eq.w.st = 12; ok(FL.capSt(c, 12) === 9, '身上 12★，史诗最高 9★：按 9★ 比'); }
ok(SETS.s1 && SETS.s2, 'SETS 还在');
