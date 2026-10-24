/* ================= 设计 80：炼宝敲打特效 =================
   点「炼宝」时结果已经算好（fblogic.refine），这里只是放一段约 2 秒的动画：
   0～0.2 秒 开炼宝台（暗底 + 铁砧 + 装备），0.2～1.4 秒 大锤敲 3 下，1.4～2.2 秒 出结果，停 0.6 秒自动收起。
   设计 88：整段动画不能点掉（连点也不理）；放完停在结果上，结果出来 0.5 秒后点一下才收起。
   画面全是 DOM：图片是 美术/模型/副本/通用/炼宝特效_2x3.jpg 切出来的 img/fb/ref_*.png（tools/cut_refine.py），
   火花、金光、火星用叠加（plus-lighter）混合。整段只跟时间 t 有关（render(t)），所以能跳、能停在某一刻截图。 */
import { A } from './assets.js';
import { QUAL, ITEMS, REFINE, STAT } from './fbcfg.js';
import { itemStats } from './fblogic.js';
import { eqIcon } from './fbui.js';

/* 大锤图（左右翻过的：锤头左上，柄尾右下）：转轴 = 柄尾，在图里的位置（比例）；锤头中心相对转轴的方向、长度（原图像素） */
const HAM = { w: 299, h: 302, px: 283 / 299, py: 283 / 302, hx: 91 - 283, hy: 72 - 283 };
const HAM_W = 124, HS = HAM_W / HAM.w, HEAD_LEN = Math.hypot(HAM.hx, HAM.hy) * HS, HEAD_ANG = Math.atan2(HAM.hy, HAM.hx);   // 原图里锤头方向（左上）
const ANV_W = 150, ANV_H = ANV_W * 241 / 378, ANV_FACE = 0.64;   // 铁砧顶面中心在图里横向 64% 处
const ICON = 64;                                                  // 铁砧上的装备图标大小
/* 舞台坐标（px）：以舞台中心为原点；铁砧顶面 y = 30，装备中心 y = 30 - ICON/2 */
const FACE_Y = 30, ITEM_Y = FACE_Y - ICON / 2 + 4, HIT = { x: 0, y: ITEM_Y - ICON / 2 + 4 };   // 锤头敲在装备顶上
/* 锤头敲中时的方向：往左、稍微朝下 5°；转轴 = 敲中点 − 锤头向量 */
const STRIKE_DIR = Math.PI - 5 * Math.PI / 180, HEAD_HALF = 32;
const PIV = { x: HIT.x - Math.cos(STRIKE_DIR) * (HEAD_LEN) , y: HIT.y - HEAD_HALF - Math.sin(STRIKE_DIR) * HEAD_LEN };
const ROT_STRIKE = STRIKE_DIR - HEAD_ANG, ROT_UP = ROT_STRIKE + 68 * Math.PI / 180;   // 举起：顺时针转回 68°（锤头在右上方）
const ROT_OFF = ROT_UP + 18 * Math.PI / 180;                                         // 刚出来时更靠后一点

let cur = null;            // 正在放的一段
export const busy = () => !!cur;
/* 动画放着时面板照「炼之前」画（点了按钮面板会马上刷新一次），星星等飞到了才亮 */
export const hold = () => cur && cur.o.hold;
const starTarget = C => C.o.starSel ? document.querySelectorAll(C.o.starSel)[C.o.from] : null;

const css = `
#refFx{position:fixed;z-index:60;overflow:hidden;border-radius:12px;touch-action:none;user-select:none;-webkit-user-select:none}
#refFx .rdim{position:absolute;inset:0;background:rgba(12,8,5,.8)}
#refFx .rst{position:absolute;left:50%;top:53%;width:0;height:0}
#refFx img{position:absolute;pointer-events:none;-webkit-user-drag:none}
#refFx .add{mix-blend-mode:plus-lighter}
@supports not (mix-blend-mode:plus-lighter){#refFx .add{mix-blend-mode:screen}}
#refFx .ritem{position:absolute;width:${ICON}px;height:${ICON}px;margin:${-ICON / 2}px 0 0 ${-ICON / 2}px}
#refFx .ritem .eqic{width:${ICON}px;height:${ICON}px}
#refFx .rglow{position:absolute;width:150px;height:150px;margin:-75px 0 0 -75px;border-radius:50%}
#refFx .rtxt{position:absolute;left:-170px;width:340px;top:${FACE_Y + 10}px;text-align:center;pointer-events:none}   /* 设计 85：大字放在铁砧原来的位置（出结果时铁砧往下淡出） */
#refFx .rtxt b{display:block;font-size:30px;font-weight:900;letter-spacing:2px;text-shadow:0 2px 0 #3a1e06,0 0 14px rgba(0,0,0,.6)}
#refFx .rtxt b.ok{color:#ffd54a}#refFx .rtxt b.bad{color:#d8d0c4}
#refFx .rtxt small{display:block;font-size:15px;color:#f3e6cc;margin-top:3px;text-shadow:0 1px 2px #000}
#refFx .rtxt small.st{color:#ffd54a;font-size:19px;font-weight:900}
#refFx .rtxt small.pity{color:#9fe08a}
#refFx .rtxt b.sm{font-size:26px}#refFx .rtxt b.sm + small.st{font-size:17px;margin-top:0}
#refFx .rtxt .rdf{display:inline-grid;grid-template-columns:auto auto;column-gap:14px;row-gap:0;margin-top:3px;font-size:13px;line-height:1.3;color:#f3e6cc;text-shadow:0 1px 2px #000;text-align:left}
#refFx .rtxt .rdf i{font-style:normal;color:#8fe06a;font-weight:800}#refFx .rtxt .rdf em{grid-column:1 / 3;font-style:normal;font-size:12px;color:#d8c8a8;text-align:center}
#refFx .rstar{position:fixed;font-size:22px;color:#ffd54a;text-shadow:0 0 10px #ffb400,0 0 3px #fff;pointer-events:none;margin:-14px 0 0 -9px}
#refFx .rskip{position:absolute;right:10px;bottom:8px;font-size:11px;color:rgba(255,240,210,.5);pointer-events:none}
`;
function ensureCss() { if (document.getElementById('refFxCss')) return; const s = document.createElement('style'); s.id = 'refFxCss'; s.textContent = css; document.head.appendChild(s) }

/* 小工具 */
const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const seg = (t, a, b) => cl((t - a) / (b - a));
const eIn = k => k * k, eOut = k => 1 - (1 - k) * (1 - k), eBack = k => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2) };
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 }
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e };
const img = (name, cls = '') => { const e = el('img', cls); e.src = A('img/fb/ref_' + name + '.png'); e.alt = ''; e.draggable = false; return e };

/* 设计 88：成功时列出这次变化的属性：「属性名　旧值 → 新值 ↑」，最多 4 行，多了写「…还有 N 项」 */
function diffRows(o) {
  const a = itemStats({ ...o.it, st: o.from }), b = itemStats({ ...o.it, st: o.to }), pc = k => STAT[k].pct ? '%' : '';
  const rows = [...Object.keys(a.main).map(k => [k, a.main[k], b.main[k]]), ...a.aff.map(([k, v], i) => [k, v, b.aff[i][1]])].filter(([, x, y]) => y !== x);
  if (!rows.length) return '';
  return `<div class="rdf">${rows.slice(0, 4).map(([k, x, y]) => `<span>${STAT[k].name}</span><span>${x}${pc(k)} → <i>${y}${pc(k)} ↑</i></span>`).join('')}${rows.length > 4 ? `<em>…还有 ${rows.length - 4} 项</em>` : ''}</div>`;
}
/* 时间表（秒）。9 星以上：第 3 下前多停 0.2 秒、锤子发光 */
function plan(o) {
  const tense = o.to >= 9, h3 = tense ? 1.5 : 1.3;
  const hits = [0.45, 0.85, h3], res = h3 + 0.1;   // 出结果的时刻（第 3 下敲完一点点）
  return { hits, tense, res, end: res + 0.8, close: res + 0.8 + 0.6, raise: 0.28, fall: 0.1 };
}

/* 开始放。o = { it（已经炼完的装备）, ok, from（炼之前几星）, to（要升到几星）, next（失败后下次成功率，可空）, starSel（右边星星那排的选择器，飞到第 from 颗）, hold（动画中面板照这个画）, box（盖住的面板框）, done } */
export function play(o) {
  stop(true); ensureCss();
  const P = plan(o), D = ITEMS[o.it.k], q = D.q, Q = QUAL[q], leg = q === 'l', R = rng(o.it.id * 977 + (o.to || 1) * 31);
  const box = o.box.getBoundingClientRect();
  const root = el('div'); root.id = 'refFx'; Object.assign(root.style, { left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px' });
  const dim = el('div', 'rdim'), st = el('div', 'rst'); root.append(dim, st);
  /* 品质光、铁砧、装备、锤子 */
  const glow = el('div', 'rglow add'); glow.style.background = `radial-gradient(circle, ${Q.color}cc 0%, ${Q.color}55 35%, transparent 68%)`; glow.style.left = '0px'; glow.style.top = ITEM_Y + 'px';
  const anv = img('anvil'); Object.assign(anv.style, { width: ANV_W + 'px', left: (-ANV_W * ANV_FACE) + 'px', top: (FACE_Y - ANV_H * 0.04) + 'px' });
  const item = el('div', 'ritem', eqIcon({ ...o.it, st: o.from }, true)); item.style.left = '0px';
  const ham = img('hammer'); Object.assign(ham.style, { width: HAM_W + 'px', left: (PIV.x - HAM.px * HAM_W) + 'px', top: (PIV.y - HAM.py * HAM.h * HS) + 'px', transformOrigin: `${HAM.px * 100}% ${HAM.py * 100}%` });
  /* 敲击火花（每下一张）、小火星（每下几颗） */
  const sparks = P.hits.map(() => { const s = img('spark', 'add'); s.style.width = '150px'; s.style.left = (HIT.x - 75) + 'px'; s.style.top = (HIT.y - 75) + 'px'; s.style.opacity = 0; return s });
  const embers = []; P.hits.forEach((h, i) => { const n = i === 2 ? 11 : 6; for (let k = 0; k < n; k++) { const a = -Math.PI * (0.05 + 0.9 * R()), sp = (i === 2 ? 190 : 140) * (0.6 + 0.6 * R()); const e = img('ember', 'add'); e.style.width = (i === 2 ? 26 : 20) + 'px'; e.style.left = '0px'; e.style.top = '0px'; e.style.opacity = 0; embers.push({ e, h, vx: Math.cos(a) * sp * (R() < 0.5 ? 1 : 1), vy: Math.sin(a) * sp, life: 0.4 + 0.25 * R() }) } });
  /* 结果：金光 / 灰烟 */
  const burst = img('burst', 'add'), bw = leg ? 330 : 250; burst.style.width = bw + 'px'; burst.style.left = (-bw / 2) + 'px'; burst.style.top = (ITEM_Y - bw / 2) + 'px'; burst.style.opacity = 0;
  const smoke = img('smoke'); smoke.style.width = '210px'; smoke.style.left = '-105px'; smoke.style.top = (ITEM_Y - 120) + 'px'; smoke.style.opacity = 0;
  const deco = []; if (o.ok) { const n = leg ? 9 : 4; for (let k = 0; k < n; k++) { const a = Math.PI * 2 * k / n + R() * 0.5, d = (leg ? 120 : 85) * (0.7 + 0.5 * R()); const s = el('div', 'rstar', '★'); s.style.position = 'absolute'; s.style.opacity = 0; deco.push({ s, a, d }) } }
  st.append(glow, anv, item, ...sparks, ...embers.map(x => x.e), smoke, ham, burst, ...deco.map(x => x.s));
  /* 大字 */
  const txt = el('div', 'rtxt'); txt.style.opacity = 0;
  if (o.ok) txt.innerHTML = `<b class="ok${diffRows(o) ? ' sm' : ''}">炼宝成功！</b><small class="st">★ ${o.to} 星</small>${diffRows(o)}`;
  else txt.innerHTML = `<b class="bad">失败了</b><small>星星没掉</small>${o.to >= REFINE.pityFrom && o.to <= REFINE.pityTo && o.next != null ? `<small class="pity">下次成功率 +${Math.round(REFINE.pity * 100)}%（现在 ${Math.round(o.next * 100)}%）</small>` : ''}`;
  st.append(txt); const hint = el('div', 'rskip', '点一下关闭'); hint.style.opacity = 0; root.append(hint);   /* 设计 88：动画不能跳过；结果出来 0.5 秒后才提示、才能点关 */
  /* 飞到右边星星那排的一颗 */
  let fly = null;
  if (o.ok && o.starSel) { fly = el('div', 'rstar', '★'); fly.style.opacity = 0; root.append(fly) }
  setTimeout(() => { const s = cur && starTarget(cur); if (s) s.scrollIntoView({ block: 'nearest' }) }, 0);   // 星星那排在详情里被卷走了就卷回来
  document.body.appendChild(root);
  const C = { sc: Math.max(0.72, Math.min(1, box.height / 380)), o, P, root, dim, st, glow, anv, item, ham, sparks, embers, burst, smoke, deco, txt, fly, t: 0, last: performance.now(), frozen: false, closing: false, hint, raf: 0, swapped: false, lit: false, leg, Q };
  root.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); tap() });
  root.addEventListener('click', e => { e.preventDefault(); e.stopPropagation() });
  cur = C; render(C, 0);
  const loop = now => { if (cur !== C) return; const dt = Math.min(0.25, (now - C.last) / 1000); C.last = now; if (!C.frozen) C.t += dt; if (!C.closing && C.t > P.end) C.t = P.end;   /* 设计 88：放完停在结果上，等玩家点 */
    C.hint.style.opacity = !C.closing && C.t >= P.res + 0.5 ? 1 : 0; render(C, C.t); if (C.t >= P.close) { stop(); return } C.raf = requestAnimationFrame(loop) };
  C.raf = requestAnimationFrame(loop);
  return C;
}

/* 点一下：没到结果 → 直接跳到结果出完；已经在结果上 → 收起 */
/* 设计 88：点屏幕：动画放着时不理；结果出来 0.5 秒后点一下才收起（淡出），连点也不会提前关 */
export function tap() { const C = cur; if (!C || C.closing || C.t < C.P.res + 0.5) return; C.closing = true; if (C.t < C.P.end) C.t = C.P.end }
/* 测试用：直接跳到结果放完（游戏里不用） */
export function skip() { const C = cur; if (!C) return; if (C.t < C.P.end - 0.05) { C.t = C.P.end; C.frozen = false; render(C, C.t) } else stop() }
/* 收起（quiet = 被新的一段顶掉，不回调也行） */
export function stop(quiet) { const C = cur; if (!C) return; cur = null; cancelAnimationFrame(C.raf); C.root.remove(); if (!quiet && C.o.done) C.o.done() }
/* 测试用：停在第 t 秒 / 接着放 */
export function seek(t) { const C = cur; if (!C) return; C.t = t; C.frozen = true; render(C, t) }
export function resume() { const C = cur; if (!C) return; C.frozen = false; C.last = performance.now() }
export const info = () => cur && { t: +cur.t.toFixed(2), res: cur.P.res, end: cur.P.end, close: cur.P.close, ok: cur.o.ok, to: cur.o.to, closing: cur.closing };

/* 画第 t 秒 */
function render(C, t) {
  const { P, o } = C;
  /* 开台：暗底、铁砧、装备淡入 */
  const k0 = eOut(seg(t, 0, 0.2)), kc = t > P.end ? 1 - seg(t, P.close - 0.15, P.close) : 1;
  C.dim.style.opacity = k0 * kc; C.st.style.opacity = kc; C.txt.style.opacity = (t >= P.res ? eOut(seg(t, P.res, P.res + 0.15)) : 0) * kc;
  C.st.style.transform = `scale(${(0.85 + 0.15 * k0) * C.sc})`;
  /* 锤子：举起 → 落下快（0.1 秒，加速）→ 抬起慢（0.28 秒，减速） */
  let rot = ROT_OFF + (ROT_UP - ROT_OFF) * eOut(seg(t, 0.12, 0.35)), hit = -1, since = 9;
  for (let i = 0; i < 3; i++) {
    const h = P.hits[i];
    if (t >= h - P.fall && t < h) rot = ROT_UP + (ROT_STRIKE - ROT_UP) * eIn(seg(t, h - P.fall, h));
    else if (t >= h && t < h + P.raise && i < 2) rot = ROT_STRIKE + (ROT_UP - ROT_STRIKE) * eOut(seg(t, h, h + P.raise));
    if (t >= h) { hit = i; since = t - h }
  }
  if (t >= P.hits[2]) { const k = seg(t, P.hits[2] + 0.05, P.hits[2] + 0.35); rot = ROT_STRIKE + (ROT_UP - ROT_STRIKE) * 0.55 * eOut(k) }   // 第 3 下敲完稍微抬一点停住
  const hamOn = t >= 0.08 && t < P.res + 0.15 ? 1 : 1 - seg(t, P.res + 0.15, P.res + 0.4);
  C.ham.style.opacity = seg(t, 0.08, 0.22) * hamOn;
  C.ham.style.transform = `rotate(${rot}rad)`;
  /* 9 星以上：第 3 下前锤子发光 */
  const tense = P.tense && t >= P.hits[1] + 0.2 && t < P.hits[2] + 0.05;
  C.ham.style.filter = tense ? `drop-shadow(0 0 ${6 + 6 * Math.abs(Math.sin(t * 24))}px #ffcf4a) brightness(1.25)` : '';
  /* 敲中：铁砧、装备往下一顿，框轻震（第 3 下最重） */
  const pw = hit === 2 ? 1.6 : 1, dip = hit >= 0 && since < 0.14 ? Math.sin(seg(since, 0, 0.14) * Math.PI) * 6 * pw : 0;
  const ag = t >= P.res ? eOut(seg(t, P.res, P.res + 0.3)) : 0;   // 设计 85：出结果时铁砧往下淡出，把位置让给大字
  C.anv.style.transform = `translateY(${dip * 0.6 + 46 * ag}px)`; C.anv.style.opacity = 1 - ag;
  let sx = 0, sy = 0; if (hit >= 0 && since < 0.16) { const a = (1 - since / 0.16) * 3 * pw; sx = Math.sin(t * 173) * a; sy = Math.cos(t * 131) * a }
  C.root.style.transform = `translate(${sx}px,${sy}px)`;
  C.sparks.forEach((s, i) => { const d = t - P.hits[i]; if (d < 0 || d > 0.28) { s.style.opacity = 0; return } const big = i === 2 ? 1.45 : 1; s.style.opacity = 1 - eIn(seg(d, 0.06, 0.28)); s.style.transform = `scale(${(0.45 + 0.6 * eOut(seg(d, 0, 0.12))) * big}) rotate(${i * 40 + d * 90}deg)` });
  for (const m of C.embers) { const d = t - m.h; if (d < 0 || d > m.life) { m.e.style.opacity = 0; continue }
    const x = HIT.x + m.vx * d, y = HIT.y + m.vy * d + 420 * d * d, vx = m.vx, vy = m.vy + 840 * d, ang = Math.atan2(vy, vx) * 180 / Math.PI - 45;   // 火星图本身朝右下（45°）
    m.e.style.opacity = 1 - seg(d, m.life * 0.5, m.life); m.e.style.transform = `translate(${x - 10}px,${y - 10}px) rotate(${ang}deg)` }
  /* 装备：敲中下顿；结果 → 成功放大回弹 / 失败左右抖、变灰半秒 */
  let isc = 1, ix = 0, gray = 0;
  const r = t - P.res;
  if (r >= 0 && o.ok) { isc = r < 0.12 ? 1 + 0.45 * eOut(r / 0.12) * (C.leg ? 1.2 : 1) : 1 + 0.45 * (C.leg ? 1.2 : 1) * (1 - eBack(seg(r, 0.12, 0.5))) ; isc = Math.max(1, isc) }
  if (r >= 0 && !o.ok) { ix = r < 0.4 ? Math.sin(r * 55) * 7 * (1 - r / 0.4) : 0; gray = r < 0.5 ? 1 : 1 - seg(r, 0.5, 0.7) }
  C.item.style.transform = `translate(${ix}px,${ITEM_Y + dip}px) scale(${isc})`;
  C.item.style.filter = gray ? `grayscale(${gray}) brightness(${1 - 0.35 * gray})` : '';
  if (o.ok && r >= 0 && !C.swapped) { C.swapped = true; C.item.innerHTML = eqIcon(o.it, true) }
  if (o.ok && r < 0 && C.swapped) { C.swapped = false; C.item.innerHTML = eqIcon({ ...o.it, st: o.from }, true) }
  /* 品质光：一直带着，敲中亮一下；成功更亮，失败熄掉 */
  const gp = (hit >= 0 && since < 0.2 ? 0.5 * (1 - since / 0.2) : 0) + 0.75 + 0.15 * Math.sin(t * 6);
  C.glow.style.opacity = k0 * (r >= 0 ? (o.ok ? 1 : 0.25) : gp);
  C.glow.style.transform = `scale(${r >= 0 && o.ok ? 1.3 : 1})`;
  /* 金光 / 灰烟 */
  if (o.ok) { C.burst.style.opacity = r < 0 ? 0 : (r < 0.1 ? r / 0.1 : 1 - eIn(seg(r, 0.25, 0.8))); C.burst.style.transform = `scale(${r < 0 ? 0.3 : 0.35 + 0.85 * eOut(seg(r, 0, 0.35))}) rotate(${r * 30}deg)` }
  else { C.smoke.style.opacity = r < 0 ? 0 : 0.95 * (r < 0.15 ? r / 0.15 : 1 - 0.6 * seg(r, 0.4, 0.8)); C.smoke.style.transform = `translateY(${r < 0 ? 0 : -24 * eOut(seg(r, 0, 0.8))}px) scale(${r < 0 ? 0.5 : 0.6 + 0.5 * eOut(seg(r, 0, 0.5))})` }
  for (const d of C.deco) { const k = seg(r, 0.03, 0.6); d.s.style.opacity = r < 0 ? 0 : 1 - eIn(seg(r, 0.35, 0.75)); d.s.style.transform = `translate(${Math.cos(d.a) * d.d * eOut(k)}px,${ITEM_Y + Math.sin(d.a) * d.d * eOut(k)}px) scale(${0.6 + 0.6 * (1 - k)})` }
  /* 一颗星从装备飞到右边星星那排，落下就亮 */
  if (C.fly) {
    const k = seg(r, 0.15, 0.6), sr = C.st.getBoundingClientRect(), s0 = { x: sr.left, y: sr.top + ITEM_Y }, se = starTarget(C), rr = se && se.getBoundingClientRect(), tg = rr && rr.width ? { x: rr.left + rr.width / 2, y: rr.top + rr.height / 2 } : { x: sr.left + 200, y: sr.top - 80 };
    if (r < 0.15) C.fly.style.opacity = 0;
    else { const x = s0.x + (tg.x - s0.x) * eIn(k) , y = s0.y + (tg.y - s0.y) * k - 60 * Math.sin(k * Math.PI); C.fly.style.opacity = 1; C.fly.style.left = x + 'px'; C.fly.style.top = y + 'px';
      C.fly.style.transform = `scale(${k < 1 ? 1.4 - 0.4 * k : 1 + 0.6 * (1 - seg(r, 0.6, 0.8))})` }
    if (k >= 1 && !C.lit) { C.lit = true; C.o.hold = null; if (se) se.classList.add('on', 'pop'); if (C.o.lit) C.o.lit() }   // 设计 88：右边详情马上换成新属性   // 落下：面板以后照真的画
  }
}
