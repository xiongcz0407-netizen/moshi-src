/* 设计 105 / 105b：每关不同名字、传说 6 种每关都能掉、套装不吃 Lv、老存档迁移、同星对比、传说转换。用法：node tools/test/fb105test.mjs */
import * as FL from '../../src/js/fblogic.js';
import { ITEMS, LEG_KEYS, LEG_SWAP } from '../../src/js/fbcfg.js';
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) process.exitCode = 1 };
const mk = () => { const S = { coins: 0, stars: 0, lv: { store: 5 }, td: { scrolls: 99, wins: {} }, st: { earned: 0 } }; FL.fbFix(S); return S };
/* 名字 */
const all = []; for (let n = 1; n <= 10; n++) for (const k of Object.keys(ITEMS)) if (!ITEMS[k].set) all.push(FL.nameAt(k, n));
ok(new Set(all).size === all.length && all.length === 240, `史诗 12 + 普通 6 + 传说 6 = 24 种 × 10 关，名字全都不一样（${new Set(all).size}/${all.length}）`);
ok(FL.itemName({ k: 'e_w1', lv: 1 }) === '铁吼' && FL.itemName({ k: 'e_w1', lv: 2 }) === '酸蚀' && FL.itemName({ k: 'e_w1', lv: 3 }) === '碎岩', '史诗武器 Lv1/2/3：铁吼 / 酸蚀 / 碎岩');
ok(FL.itemName({ k: 'l_h', lv: 3 }) === '岩眼头盔' && FL.itemName({ k: 'l_m', lv: 3 }) === '岩心' && FL.itemName({ k: 'l_w', lv: 10 }) === '终焉之牙' && FL.itemName({ k: 'n_m', lv: 10 }) === '废铁牌', '传说、普通名字（岩眼头盔、岩心、终焉之牙、废铁牌）');
ok(FL.itemName({ k: 's1_h', lv: 5 }) === '拾荒者·头盔', '套装不查表');
ok(LEG_KEYS.length === 6 && !Object.keys(ITEMS).some(k => /^l_.2$/.test(k) || /^l_.1$/.test(k)), '传说只有 6 种（l_w l_h l_a l_g l_b l_m），没有 l_x1 / l_x2');
/* 传说：每关都能掉 6 种，各约 1/6，lv = 那一关 */
for (const n of [1, 3]) {
  const c = {}; let bad = 0; const N = 10000;
  for (let i = 0; i < N; i++) { const S = mk(); S.fb.won[n] = 1; let k = 0; const r = FL.fbWin(S, n, () => k++ ? Math.random() : 0.999); c[r.item.k] = (c[r.item.k] || 0) + 1; if (ITEMS[r.item.k].q !== 'l' || r.item.lv !== n) bad++ }
  const v = LEG_KEYS.map(k => c[k] || 0), mn = Math.min(...v) / N, mx = Math.max(...v) / N;
  ok(!bad && Object.keys(c).length === 6 && mn > 1 / 6 - 0.015 && mx < 1 / 6 + 0.015, `第 ${n} 关掉传说 ${N} 次：6 种都出现，每种 ${(mn * 100).toFixed(1)}%～${(mx * 100).toFixed(1)}%（1/6 = 16.7%），Lv 都是 ${n}`);
}
{ const t = FL.dropTable(3).find(x => x.q === 'l'); ok(t.keys.length === 6, '副本掉落列表：传说那一行 6 个'); const nm = t.keys.map(k => FL.nameAt(k, 3)); ok(new Set(nm).size === 6, '第 3 关 6 个传说：' + nm.join('、')) }
/* Lv 跟着关卡；套装 Lv5 / Lv10 */
{ const S = mk(); S.fb.won[3] = 1; let k = 0; const r = FL.fbWin(S, 3, () => [0.8, 0.3][k++] ?? 0.5); ok(ITEMS[r.item.k].q === 'e' && r.item.lv === 3, `第 3 关掉的史诗 Lv3（${FL.itemName(r.item)}）`) }
{ const S = mk(); S.fb.won[2] = 1; let k = 0; const r = FL.fbWin(S, 2, () => k++ ? 0.5 : 0.92); ok(r.item.k === 's1_a' && r.item.lv === 5, `第 2 关掉的套装件 拾荒者·护甲 Lv${r.item.lv}`) }
ok(ITEMS.s2_b.lv === 10 && ITEMS.s2_w.at === 6 && ITEMS.s1_h.at === 1, '套装：猎杀者 Lv10，每件还在原来那一关掉');
{ const a = FL.itemStats({ k: 's1_h', lv: 1, st: 0 }); ok(a.main.hp === 144, `拾荒者头盔（存档 lv 1）也按 Lv5 算：生命 ${a.main.hp}`) }
/* 老存档迁移 */
{ const S = { lv: { store: 5 }, td: { wins: {} }, fb: { won: { 1: 37 }, bag: [{ id: 7, k: 'l3', lv: 3, st: 2, crys: 5 }, { id: 8, k: 's1_a', lv: 2, st: 0 }, { id: 10, k: 'l6', lv: 6, st: 3 }, { id: 11, k: 'l8', lv: 8, st: 1 }, { id: 12, k: 'l9', lv: 9, st: 0 }],
    eq: { w: { id: 1, k: 'l5', lv: 5, st: 4 }, h: { id: 2, k: 's1_h', lv: 1, st: 12 }, m: { id: 3, k: 'l_m', lv: 10, st: 1 }, g: { id: 4, k: 'e_g2', lv: 1, st: 7 }, b: { id: 5, k: 'l7', lv: 7, st: 0 } }, pend: { id: 9, k: 'l10', lv: 10, st: 0 }, log: [{ a: 'win', k: 'l1', n: 1 }] } };
  FL.fbFix(S); const f = S.fb;
  ok(f.eq.w.k === 'l_w' && f.eq.w.lv === 5 && f.eq.w.st === 4 && FL.itemName(f.eq.w) === '钢牙', `雷鸣 M16（l5 Lv5 4★）→ ${f.eq.w.k} Lv${f.eq.w.lv} ${f.eq.w.st}★「${FL.itemName(f.eq.w)}」`);
  ok(f.bag[2].k === 'l_a' && f.bag[3].k === 'l_h' && f.bag[4].k === 'l_g' && f.pend.k === 'l_b' && f.bag[2].st === 3 && f.bag[3].lv === 8, '荆棘战甲→护甲、冰霜之冠→头盔、快手→手套、幻影步→鞋子（Lv、星保留）');
  ok(f.eq.m.k === 'l_m' && f.eq.m.lv === 10 && FL.itemName(f.eq.m) === '永夜之心' && f.eq.b.k === 'l_b' && f.bag[0].k === 'l_a' && f.bag[0].crys === 5, '不眠之心、疾风之靴、不灭之铠照常换（炼进去的晶石保留）');
  ok(f.eq.h.lv === 5 && f.bag[1].lv === 5 && f.eq.h.st === 12, '拾荒者头盔、护甲 Lv → 5（星保留）');
  ok(f.eq.g.k === 'e_g2' && f.eq.g.lv === 1, '史诗不动');
  const adj = f.log.filter(e => e.a === 'adj').map(e => e.txt); ok(adj.length === 5 && adj.includes('传说调整：雷鸣 M16 换成 钢牙') && adj.includes('传说调整：幻影步 换成 狂风之靴'), '掉落记录 5 条「传说调整」：' + adj.join(' / '));
  ok(f.log[0].k === 'l_w', '掉落记录里的老 key 也换了');
  FL.fbFix(S); ok(f.log.filter(e => e.a === 'adj').length === 5, '再读一次不会重复记');
  const h = FL.fbHero(S, { dmg: 46, rate: 0.2, range: 11, nadeDmg: 237, nadeR: 3.8, nadeCd: 6.4 }); ok(h.bleed && h.heart && !('focusHeal' in h), '獠牙流血、不眠之心照常；fbHero 不再有 focusHeal');
  f.eq.h = { id: 2, k: 'l_h', lv: 3, st: 0 }; const h2 = FL.fbHero(S, { dmg: 46, rate: 0.2, range: 11 }); ok(h2.range === 13 && h2.bossCrit === 0.1, '鹰眼（l_h）射程 +2、打 BOSS 暴击 +10%');
}
{ const S = { lv: { store: 5 }, td: { wins: {} }, fb: { bag: [{ id: 1, k: 'l_w2', lv: 2, st: 0 }, { id: 2, k: 'l_m2', lv: 3, st: 1 }, { id: 3, k: 'l_h1', lv: 1, st: 0 }], eq: {}, log: [] } };
  FL.fbFix(S); ok(S.fb.bag.map(x => x.k).join() === 'l_w,l_m,l_h', '105a 的中间 key（l_w2、l_m2、l_h1）换成同部位新 key') }
/* 同星对比、金色 ⇡ */
{ const S = mk(); S.fb.eq.w = { id: 1, k: 'e_w1', lv: 1, st: 7 }; const c = { id: 2, k: 'e_w1', lv: 3, st: 0 };
  const a = FL.statsAt(c, 7), b = FL.itemStats(S.fb.eq.w);
  ok(!FL.better(S, c) && FL.betterAt(S, c), `碎岩 Lv3 0★ 现在不如 铁吼 Lv1 7★（↑ 不亮），炼到 7★ 更好（⇡）：伤害 ${a.main.dmg} vs ${b.main.dmg}`);
  S.fb.eq.w.st = 12; ok(FL.capSt(c, 12) === 9, '身上 12★，史诗最高 9★：按 9★ 比'); }
/* 传说转换 legSwap */
{ const N = 10000, c = {}; let back = 0, keep = 1, cost = 1;
  for (let i = 0; i < N; i++) { const S = mk(); S.coins = 5000; const lv = i % 2 ? 1 : 10; S.fb.bag = [{ id: 77, k: 'l_g', lv, st: 0, crys: 0 }];
    const r = FL.legSwap(S, 77); const it = S.fb.bag[0]; if (!r.ok) { keep = 0; continue } if (it.k === 'l_g') back++; c[it.k] = (c[it.k] || 0) + 1;
    if (it.lv !== lv || it.st !== 0 || it.id !== 77) keep = 0; if (S.coins !== 5000 - LEG_SWAP) cost = 0 }
  const v = Object.values(c), mn = Math.min(...v) / N, mx = Math.max(...v) / N;
  ok(back === 0, `legSwap ${N} 次：从不换回自己`); ok(Object.keys(c).length === 5 && mn > 0.2 - 0.015 && mx < 0.2 + 0.015, `另外 5 种都出现，每种 ${(mn * 100).toFixed(1)}%～${(mx * 100).toFixed(1)}%（1/5 = 20%）`);
  ok(keep, 'Lv、id 不变，星还是 0'); ok(cost && LEG_SWAP === 2000, '每次扣 2000（Lv1、Lv10 一样）'); }
{ const S = mk(); S.coins = 1999; S.fb.bag = [{ id: 1, k: 'l_w', lv: 3, st: 0 }, { id: 2, k: 'e_w1', lv: 3, st: 0 }, { id: 4, k: 'l_b', lv: 3, st: 1 }]; S.fb.eq.h = { id: 3, k: 'l_h', lv: 3, st: 0 }; const before = JSON.stringify(S);
  const a = FL.legSwap(S, 1); S.coins = 9999; const b = FL.legSwap(S, 2), c2 = FL.legSwap(S, 3), d2 = FL.legSwap(S, 4); S.coins = 1999;
  ok(!a.ok && a.why === '末日币不够' && !b.ok && b.why === '只有传说能转换' && !c2.ok && c2.why === '只能转换背包里的传说' && !d2.ok && d2.why === '升过星的不能转换' && JSON.stringify(S) === before, `钱不够、不是传说、穿在身上、升过星（1★）：都失败、存档不变（${a.why} / ${b.why} / ${c2.why} / ${d2.why}）`) }
{ const S = mk(); S.coins = 2000; S.fb.bag = [{ id: 5, k: 'l_m', lv: 3, st: 0 }]; const r = FL.legSwap(S, 5, () => 0); const e = S.fb.log[S.fb.log.length - 1];
  ok(r.ok && r.from === 'l_m' && e.a === 'swap' && e.from === 'l_m' && e.to === r.to && e.lv === 3 && S.coins === 0, `掉落记录 {a:'swap', from, to, lv}：岩心 → ${FL.nameAt(r.to, 3)}（Lv3）`) }
