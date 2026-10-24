/* ================= 钓鱼的操作：选饵 → 抛竿 → 等咬钩 → 拉力条 =================
   拉力条（0.20 起竖着，学星露谷）：按住「收线」指针往上走，松开往下落；把指针保持在绿区里，下面的进度条就涨，满了钓上来；
   出了绿区进度条会掉，掉光鱼就跑了；指针顶到最上面（线绷太紧）超过一会儿就断线。
   越稀有的鱼：绿区越窄、跑得越快；鱼竿等级越高：绿区越宽、指针越好控制。 */
import * as L from './logic.js';
import { $, esc, toast } from './ui.js';
import { FISH, FISH_RAR, FISHING } from './config.js';

const ZB = { near: ['worm'], deep: ['corn'], bridge: ['worm', 'corn'] };   // 每个区域能用哪种饵
let G = null;       // 当前状态：{ spot, bait, phase: 'idle'|'wait'|'bite'|'pull'|'done', ... }
let hold = false, cb = null, getS = null;

export function initFishGame(opts) {
  getS = opts.getS; cb = opts;
  const box = $('#fishUI');
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    const k = b.dataset.f;
    if (k === 'bait') { G.bait = b.dataset.arg; draw() }
    else if (k === 'cast') { if (!locked()) cast() }   // 0.38：刚拉完鱼 1.5 秒内点不了抛竿（收线和抛竿在同一个位置，连点会误抛）
    else if (k === 'leave') close();
    else if (k === 'reel' && G.phase === 'wait' && G.t > 1.2) {   /* 0.31：抛竿后 1.2 秒内点不了收竿（防连点误收） */ G.phase = 'idle'; cb.onEnd(); toast('收竿了，饵没了', ''); draw() }   // 没等到就收竿：饵算用掉了
    else if (k === 'shop') cb.openShop();
    else if (k === 'bag') cb.openBag();
  });
  const down = e => { if (e.target.closest('#fishHold')) { hold = true; e.preventDefault() } };
  box.addEventListener('pointerdown', down);
  addEventListener('pointerup', () => { hold = false }); addEventListener('pointercancel', () => { hold = false });
  addEventListener('keydown', e => { if (G && e.code === 'Space' && e.target.tagName !== 'INPUT') { hold = true; e.preventDefault() } });
  addEventListener('keyup', e => { if (e.code === 'Space') hold = false });
}
export const fishing = () => !!G;
export const busy = () => !!G && G.phase !== 'idle';             // 0.24：抛出去以后才不能走（idle 时能随便走开）
export function moveSpot(x, z) { if (G && G.phase === 'idle') { G.spot.x = x; G.spot.z = z } }
export const fishPhase = () => G ? G.phase : null;
export const fishSpot = () => G && G.spot;

export function open(spot) {
  const S = getS(), zb = ZB[spot.zone];
  G = { spot, bait: zb.find(b => S.bait[b] > 0) || zb[0], phase: 'idle' };
  $('#fishUI').classList.remove('hidden'); draw();
}
export function close(force) {
  if (!G) return; if (!force && G.phase !== 'idle') return;   // 鱼上钩了不能走（坐船走时强制关）
  G = null; hold = false; $('#fishUI').classList.add('hidden'); $('#fishUI').classList.remove('pull'); cb.onClose();
}

function cast() {
  const S = getS(), r = L.cast(S, G.spot.zone, G.bait);
  if (r.why) { toast(r.why, 'bad'); return }
  const F = FISH[r.id], R = FISH_RAR[F.rar], rod = L.rodCfg(S);
  /* 绿区宽度、绿区移动速度、指针加速度 */
  G = { ...G, phase: 'wait', id: r.id, wait: 1.2 + Math.random() * 3, t: 0,
    gw: Math.max(0.12, Math.min(0.42, 0.3 * rod.ctrl / R.diff * (R.zw || 1))), gc: 0.5, gv: 0, gtgt: 0.5, gsp: 0.35 * R.diff,
    p: 0.2, v: 0, prog: 0.3, strain: 0 };
  cb.onCast(G); draw();
}

/* 每帧调用：dt 秒 */
export function update(dt) {
  if (!G) return;
  G.t += dt;
  if (G.phase === 'wait') { G.wait -= dt; if (G.wait <= 0) { G.phase = 'bite'; G.bt = 0.5; cb.onBite(G); draw() } return }
  if (G.phase === 'bite') { G.bt -= dt; if (G.bt <= 0) { G.phase = 'pull'; draw() } return }
  if (G.phase !== 'pull') return;
  const S = getS(), rod = L.rodCfg(S);
  /* 鱼：绿区朝一个随机目标游，到了再换一个；越稀有换得越勤、游得越快 */
  if (Math.abs(G.gtgt - G.gc) < 0.02 || Math.random() < dt * 0.6 * G.gsp) G.gtgt = G.gw / 2 + Math.random() * (1 - G.gw);
  G.gv += ((G.gtgt - G.gc) * 3 * G.gsp - G.gv * 2.2) * dt; G.gc = Math.max(G.gw / 2, Math.min(1 - G.gw / 2, G.gc + G.gv * dt));
  /* 指针：按住往右加速、松开往左；鱼竿越好越稳 */
  const acc = (hold ? 2.6 : -2.2) / Math.sqrt(rod.ctrl);
  G.v = (G.v + acc * dt) * Math.pow(0.25, dt); G.p += G.v * dt;
  if (G.p < 0) { G.p = 0; G.v = Math.max(0, G.v) * -0.2 }
  if (G.p > 1) { G.p = 1; G.v = 0 }
  const inZ = Math.abs(G.p - G.gc) <= G.gw / 2;
  G.prog += (inZ ? 0.22 : -0.12 * FISH_RAR[FISH[G.id].rar].diff) * dt;
  G.strain = G.p >= 0.985 ? G.strain + dt : Math.max(0, G.strain - dt * 2);
  if (G.strain > 0.9) return finish('snap');
  if (G.prog >= 1) return finish('catch');
  if (G.prog <= 0) return finish('lost');
  drawBar(inZ);
}

function finish(how) {
  const S = getS(), id = G.id;
  if (how === 'catch') { const ok = L.landFish(S, id); cb.onCatch(id, ok) }
  else if (how === 'snap') { L.snapLine(S); toast(`线断了！鱼跑了，鱼竿耐久 −${FISHING.snap}`, 'bad', 3000); cb.onEnd() }
  else { toast('鱼跑了……', 'bad'); cb.onEnd() }
  G.phase = 'idle'; G.lockTo = performance.now() + 1500; hold = false; draw();
  setTimeout(() => { if (G && G.phase === 'idle') draw() }, 1550);   // 不靠每帧更新（没抛竿时这里不跑）
}
const locked = () => !!G && G.lockTo > performance.now();

/* ---------- 画面 ---------- */
function draw() {
  if (!G) return;
  const S = getS(), rod = L.rodCfg(S), zb = ZB[G.spot.zone];
  const zn = FISHING.zones[G.spot.zone];
  let body = '';
  /* 0.24 用户：不要单独的抛竿面板 —— 走进钓鱼区域右边就出现饵料 + 「抛竿」（在收线按钮的位置）；收竿以后就能走开，走出区域自己消失 */
  const info = `<div class="vinfo">${zn}　鱼竿 ${S.lv.rod || 1} 级　耐久 <b class="${S.rodDur <= 3 ? 'warn' : ''}">${S.rodDur}/${rod.dur}</b></div>`;
  if (G.phase === 'idle') {
    const chips = zb.map(b => `<button class="gchip ${G.bait === b ? 'on' : ''}" data-f="bait" data-arg="${b}">${FISHING.bait[b].name} ×${S.bait[b] || 0}</button>`).join('');
    const noBait = !zb.some(b => S.bait[b] > 0);
    body = `${info}<div class="vbait">${chips}${noBait ? '<button class="btn sm ghost" data-f="shop">买饵</button>' : ''}</div>
      ${L.fishFits(S, G.spot.zone) ? '' : '<div class="vfull"><span class="warn">背包满了</span><button class="btn sm ghost" data-f="bag">丢鱼</button></div>'}
      <button id="fishCast" class="btn big" data-f="cast" ${locked() ? 'disabled style="visibility:hidden"' : ''}>抛竿</button>`;
  } else if (G.phase === 'wait') body = `${info}<div class="vinfo fwait">等鱼咬钩…</div><div class="vreel"><button class="btn sm ghost" data-f="reel">收竿（不钓了）</button></div><div class="vgap"></div>`;   /* 0.31 用户：收竿和抛竿不在一个位置（以前都在右下角大按钮，容易连点误收） */
  else if (G.phase === 'bite') { const R = FISH_RAR[FISH[G.id].rar]; body = `${info}<b class="fbite" style="color:${R.color}">咬钩了！${G.id && FISH[G.id].rar !== 'c' ? esc(R.name) + '的鱼！' : ''}</b>` }
  else if (G.phase === 'pull') {
    const R = FISH_RAR[FISH[G.id].rar];
    /* 0.20 学星露谷：竖着的拉力条，没有外面的面板框；下面照旧写鱼竿等级和耐久 */
    body = `<div class="vwrap"><div class="fbar"><i class="gz" style="border-color:${R.color}"></i><i class="pt"></i><i class="end"></i></div><div class="fprog"><i></i></div></div>
      ${info}<small class="vtip">按住往上，松开往下</small><button id="fishHold" class="btn big">收线</button>`;
  }
  $('#fishUI').classList.add('pull');
  $('#fishUI').innerHTML = body;
  if (G.phase === 'pull') drawBar(false);
}
function drawBar(inZ) {
  const box = $('#fishUI'), gz = box.querySelector('.gz'); if (!gz) return;
  gz.style.bottom = ((G.gc - G.gw / 2) * 100) + '%'; gz.style.height = (G.gw * 100) + '%'; gz.classList.toggle('in', inZ);   // 竖着：0 在最下面、1 在最上面
  box.querySelector('.pt').style.bottom = (G.p * 100) + '%';
  box.querySelector('.end').classList.toggle('hot', G.strain > 0.05);
  box.querySelector('.fprog i').style.height = (Math.max(0, Math.min(1, G.prog)) * 100) + '%';
}
export const refresh = () => { if (G && G.phase === 'idle') draw() };
export const _dbg = () => ({ G, hold });
