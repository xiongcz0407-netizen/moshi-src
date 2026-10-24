/* 设计 30：手机发烫 —— 性能小窗 + 每项优化的开关（开关存在这台手机上，改了重新进游戏生效，方便同一个版本量「改前 / 改后」）
   小窗：每秒帧数、每帧用时（CPU，毫秒）、draw call、三角形、场上丧尸数、影子图这一秒画了几次、头顶牌子几个（设计 57）；设置 → 游戏 → 「性能小窗」打开，或网址加 ?perf */
const KEY = 'ms_perf';
const DEF = { shadow: 1, cull: 1, mat: 1, ft: 1, fps: 1, pr: 1, sshadow: 1, fps45: 0, aa: 1, lab: 1, anim: 1, grass: 1, lod: 1, far: 1, flat: 1 };   // 35b 用户：手机默认画面 1.25 倍（电脑不变）   // 设计 57：后面 8 个
export const PERF_NAMES = { shadow: '丧尸假影子', cull: '视野裁剪', mat: '共用材质', ft: '飘字限量', fps: '尸潮自动30帧', pr: '画面1.25倍',
  sshadow: '影子只画一次', fps45: '走路45帧（会抖）', aa: '关抗锯齿', lab: '牌子避让20次/秒', anim: '看不到的不动（远处30次/秒）', grass: '草减半', lod: '大模型减面', far: '远处小物件不画', flat: '压扁影子' };   // 设计 67   // 设计 57
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch (e) { return {} } };
const st = load();
export const PERF = { opts: { ...DEF, ...(st.opts || {}) }, on: !!st.on || /[?&]perf/.test(location.search) };   // 设计 66：「流畅模式」删了（走路本来就 60 帧）
if (st.pv !== 2) PERF.opts.pr = 1;
if ((st.pv || 0) < 3) for (const k of ['sshadow', 'fps45', 'aa', 'lab', 'anim', 'grass', 'lod', 'far']) PERF.opts[k] = 1;   // 设计 57：新开关默认开   // 35b：以前存过开关的手机也换成默认 1.25 倍（之后自己关掉就记住）
if ((st.pv || 0) < 5) PERF.opts.flat = 1;   // 设计 67：新开关默认开
if ((st.pv || 0) < 4) { PERF.opts.fps45 = 0; PERF.opts.lab = 1; PERF.opts.anim = 1 }   // 设计 66：45 帧档默认关（帧间隔忽长忽短，跑起来画面一抖一抖）；牌子、远处的人的开关意思变了，回到默认开
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ opts: PERF.opts, on: PERF.on, pv: 5 })) } catch (e) { /* 存不了就只管这一次 */ } };
export const perfOpt = k => !!PERF.opts[k];
export function setPerfOn(on) { PERF.on = on; save(); box(); }
export function togglePerfOpt(k) { PERF.opts[k] = PERF.opts[k] ? 0 : 1; save() }
/* 设计 57：小窗多显示的：这一秒影子图画了几次、头顶牌子几个（main.js 每帧填） */
export const PERF_X = { sh: 0, lab: 0, cap: 60 };

/* 统计：渲染出来的帧之间的间隔（算帧数）、每帧 CPU 用时、最后一帧的 draw call / 三角形 */
const acc = { t0: 0, n: 0, cpu: 0, gapSum: 0, last: 0, sh: 0, calls: 0, tris: 0, gmin: 1e9, gmax: 0 }, out = { fps: 0, ms: 0, cpu: 0, calls: 0, tris: 0, z: 0, sh: 0, lab: 0, cap: 0, gmin: 0, gmax: 0 };
let el = null;
function box() {
  if (!PERF.on) { if (el) el.style.display = 'none'; return }
  if (!el) { el = document.createElement('div'); el.id = 'perfBox'; document.body.appendChild(el);
    el.addEventListener('click', e => { const b = e.target.closest('[data-pk]'); if (!b) return; togglePerfOpt(b.dataset.pk); paint(); el.querySelector('.pnote').textContent = '改了开关：退出重进游戏生效' }) }
  el.style.display = ''; paint();
}
function paint() {
  if (!el) return;
  el.innerHTML = `<div class="pnum">${paintNum()}</div>`
    + `<div class="popts">${Object.keys(PERF_NAMES).map(k => `<button data-pk="${k}" class="${PERF.opts[k] ? 'on' : ''}">${PERF_NAMES[k]}</button>`).join('')}</div><div class="pnote"></div>`;
}
/* 每画一帧调用一次：now = 这一帧开始的时间，cpu = 这一帧逻辑 + 画图用了几毫秒 */
export function perfFrame(renderer, now, cpu, zombies) {
  if (acc.last) { const g = now - acc.last; acc.gapSum += g; acc.gmin = Math.min(acc.gmin, g); acc.gmax = Math.max(acc.gmax, g) } acc.last = now; acc.n++; acc.cpu += cpu; acc.calls += renderer.info.render.calls; acc.tris += renderer.info.render.triangles; if (PERF_X.shNow) acc.sh++; PERF_X.shNow = 0;
  if (!acc.t0) acc.t0 = now;
  if (now - acc.t0 < 1000) return;
  out.fps = Math.round(acc.n * 1000 / (now - acc.t0)); out.ms = (acc.gapSum / Math.max(1, acc.n - 1)).toFixed(1); out.cpu = (acc.cpu / acc.n).toFixed(1);
  out.calls = Math.round(acc.calls / acc.n); out.tris = acc.tris / acc.n; out.z = zombies; out.sh = acc.sh; out.lab = PERF_X.lab; out.cap = PERF_X.cap; out.gmin = acc.gmin < 1e9 ? acc.gmin : 0; out.gmax = acc.gmax;   // 设计 66：帧上限、这一秒帧间隔最短～最长（一样长才不抖）   // 设计 57：draw call、三角形按这一秒平均（含影子图那一遍）
  acc.t0 = now; acc.n = 0; acc.cpu = 0; acc.gapSum = 0; acc.sh = 0; acc.calls = 0; acc.tris = 0; acc.gmin = 1e9; acc.gmax = 0;
  if (PERF.on) { if (!el) box(); else el.querySelector('.pnum') ? el.querySelector('.pnum').innerHTML = paintNum() : paint() }
}
/* 设计 38：这次加载下了几 MB、用了几秒（main.js 加载完时填） */
export const PERF_LOAD = { txt: '', fb: '' };
const paintNum = () => `<b>${out.fps}</b> 帧/秒（上限 ${out.cap}）　每帧 <b>${out.ms}</b> 毫秒（算 ${out.cpu}）<br>帧间隔 ${out.gmin.toFixed(1)}～${out.gmax.toFixed(1)} 毫秒<br>draw call <b>${out.calls}</b>　三角形 <b>${(out.tris / 1000).toFixed(0)}k</b>　丧尸 <b>${out.z}</b><br>影子图 <b class="${out.sh ? 'shon' : ''}">${out.sh ? `这一秒画了 ${out.sh} 次` : '没画'}</b>　头顶牌子 <b>${out.lab}</b>${PERF_LOAD.txt ? '<br>' + PERF_LOAD.txt : ''}${PERF_LOAD.fb ? '<br><span style="color:#ff9a8a">' + PERF_LOAD.fb + '</span>' : ''}`;   /* 设计 74 */
export const perfStats = () => ({ ...out });
if (PERF.on) setTimeout(box, 0);
