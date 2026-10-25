/* ================= 界面：顶部状态、面板、提示、场景标签 ================= */
import { tixCost } from './fblogic.js';   /* 设计 108 */
import * as THREE from 'three';
import { FB, CRYSTAL } from './fbcfg.js';
import { FREE, isKit, FISHPOND, JUNK, GOODS, GOOD_IDS, TREASURE, TREASURE_IDS, BUILD, BUILD_ORDER, RECYCLER, BAG_SIZES, SHELF_CAP, GEAR, STORE, TASKS, GREENHOUSE, CROPS, CROP_IDS, ORCHARD, TREES, STACK, WAREHOUSE, FIXTURE, TIER_NAME, canHold, TD, TD_MAX, tdLevel, TOWERS, TOWER_IDS, STAFF, STAFF_JOBS, FERT, CREW, FISH, FISH_IDS, FISH_RAR, FISHING, STAFF_FISH, FIXTURE_IDS, HERO, GUARD_GUN, RANCH, RANCH_IDS, PEN_CAP, FEED, MYSTERY, STAR, WS, WS_IDS, MACH, DISHES } from './config.js';
import * as L from './logic.js';
import { perfOpt, PERF_X } from './perf.js';
import { CHANGELOG } from './changelog.js';
import { ICONS } from './iconlist.js';
import { A } from './assets.js';
import * as CHAT from './chat.js';

export const $ = s => document.querySelector(s);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const fmtT = s => { s = Math.max(0, Math.ceil(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return h ? `${h}小时${m ? m + '分' : ''}` : m ? `${m}:${String(x).padStart(2, '0')}` : `${x}秒` };
export const fmtN = n => n >= 10000 ? (n / 10000).toFixed(n >= 100000 ? 0 : 1) + '万' : String(Math.floor(n));

/* ---------- 图标：有图片用图片，没有就用色块 + 首字 ---------- */
/* 物品图标：tools/icons.mjs 用游戏里的 3D 模型渲染出来的 */
const IMG = {};
/* 设计 71：厨房 2 没有自己的图标，用厨房的（凡是按 BUILD 的 key 找图标的都走这里） */
export const BD_ICON = { kitchen2: 'kitchen' };
const icFile = (k, id) => k === 'bd' && BD_ICON[id] ? BD_ICON[id] : id;
for (const [k, ids] of [['junk', Object.keys(JUNK)], ['good', Object.keys(GOODS)], ['tr', Object.keys(TREASURE)], ['it', ['gear', 'worm', 'corn', 'rod', 'lic', 'm16', 'ref', 'scroll', 'tix']], ['fish', FISH_IDS], ['tw', TOWER_IDS], ['bd', [...BUILD_ORDER, ...RANCH_IDS, ...WS_IDS]]]) for (const id of ids) if (!ICONS || ICONS.has(`${k}_${icFile(k, id)}`)) IMG[k + ':' + id] = `img/icons/${k}_${icFile(k, id)}.png`;   /* 设计 75：只记路径，用的时候再 A()（手机里的资源库要等开局检查完才有） */   // 设计 33：没有图标图片的新东西用色块
const hex = c => '#' + c.toString(16).padStart(6, '0');
/* 设计 39：小图标点一下 / 按住出名字（data-nm，见下面的 iconTip） */
const nmOf = (kind, id) => { const o = kind === 'junk' ? JUNK[id] : kind === 'good' || kind === 'seed' ? GOODS[id] : kind === 'fish' ? FISH[id] : kind === 'tr' ? TREASURE[id] : kind === 'bd' ? BUILD[id] : null; return o ? esc(o.name) + (kind === 'seed' ? '种子' : '') : '' };
export function icon(kind, id) {
  if (kind === 'seed' && IMG['good:' + id]) return `<span class="icon img seed" data-nm="${nmOf('seed', id)}"><img src="${A(IMG['good:' + id])}" alt=""><i>种</i></span>`;
  if (kind === 'seed') kind = 'good';
  const src = IMG[kind + ':' + id] && A(IMG[kind + ':' + id]);
  if (src) return `<span class="icon img" data-nm="${nmOf(kind, id)}"><img src="${src}" alt=""></span>`;
  const o = kind === 'junk' ? JUNK[id] : kind === 'good' ? GOODS[id] : kind === 'fish' ? FISH[id] : kind === 'bd' ? { name: (BUILD[id] || {}).name || '?', color: 0x8a7a68 } : TREASURE[id] || { name: '?', color: 0x888888 };
  return `<span class="icon" style="background:${hex(o.color)}">${esc(o.name[0])}</span>`;
}

/* ---------- 顶部状态 ---------- */
let lastHud = '', lastCoins = -1;
const setTxt = (sel, t) => { const n = $(sel); if (n.textContent !== t) n.textContent = t };   // 没变就不重写（少重绘）
export function updateHud(S, shortLeft) {
  const cap = L.bagCap(S), key = [S.fb && S.fb.bag ? S.fb.bag.filter(x => x.nw).length : 0,   /* 设计 76：新装备数变了也刷新（头像红点） */ Math.floor(S.coins), S.rep, S.bag.length, L.bagCount(S), cap, S.lv.store, Object.keys(S.tasks).length, S.st.served, S.st.harvest, S.short.g, Math.ceil(S.short.left), S.builds.map(b => Math.ceil(b.left)).join(','), S.st.junk, S.st.rec, S.st.sold, S.st.builds, S.rq.length, CHAT.badge(), CHAT.CH.ok, S.stars || 0, awayCheck()].join('|');
  if (key === lastHud) return; lastHud = key;
  { const c = Math.floor(S.coins), d = c - lastCoins;               // 0.23：钱变多时金币条蹦一下，下面飘「+$N」
    if (lastCoins >= 0 && d > 0) { const chip = $('.chip.coin'); chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump');
      const pop = document.createElement('div'); pop.className = 'coinPop'; pop.textContent = `+$${fmtN(d)}`; chip.appendChild(pop); setTimeout(() => pop.remove(), 1100) }
    lastCoins = c }
  setTxt('#hCoins', fmtN(S.coins)); setTxt('#hStars', String(S.stars || 0));
  setTxt('#hRep', String(S.rep)); $('#hRepBar').style.width = S.rep + '%';
  setTxt('#hBag', `${S.bag.length}/${cap} 格`); $('#hBagBar').style.width = (S.bag.length / cap * 100) + '%';
  $('.bagchip').classList.toggle('full', S.bag.length >= cap);
  $('.bagchip').title = S.bag.map(b => `${b.t.startsWith('seed:') ? GOODS[b.t.slice(5)].name + '种子' : L.isFish(b.t) ? FISH[L.fishOf(b.t)].name : JUNK[b.t].name}×${b.n}`).join('　');
  setTxt('#hShort', `涨价：${GOODS[S.short.g].name}，售价 ×1.5（${fmtT(S.short.left)}）`);
  setTxt('#hGoal', goalText(S));
  /* 红点：收起来的按钮里哪里有事要处理 */
  const dots = hudDots(S); let anyDot = false;
  document.querySelectorAll('[data-dot]').forEach(n => { const on = !!dots[n.dataset.dot]; anyDot = anyDot || on; n.classList.toggle('on', on) });
  { const tb = document.querySelector('.dt.td'); if (tb) tb.classList.toggle('off', awayCheck()) }
  { const n = CHAT.badge(), e = $('#frN'), fb = $('#hFriend'); if (e) { e.classList.toggle('on', n > 0); const v = n > 99 ? '99+' : String(n); if (e.textContent !== v) e.textContent = v } if (fb) fb.classList.toggle('off', CHAT.CH.ok === false) }   // 0.40 好友：没读的消息 + 新申请
  $('#hMore .dot').classList.toggle('on', anyDot || !!(S.mys && S.mys.order));   // 0.31 神秘商人在院子里等着：「☰」亮红点直到交货
  msgBadge(S);
}
/* 消息按钮上的红色数字：没读的条数（来消息、读了、删了都马上更新） */
function msgBadge(S) { const n = msgUnread(S), e = $('#msgN'); if (e) { e.classList.toggle('on', n > 0); const v = n > 99 ? '99+' : String(n); if (e.textContent !== v) e.textContent = v } }

/* 0.25 仓库丢东西（用户：一样菜满了收不了、下一样也种不了，会卡住）：点一格选中，下面选数量，再确认丢掉 */
let whDrop = null;
/* 设计 77：星星兑换换几颗（右边详情「−10 −1 [n] +1 +10 全部」，默认 1，换完回到 1） */
let starQty = 1;
/* 设计 109：商人买尸潮券 / 召唤券选几张（两格共用一个数，换格子时回到 1；跟星星兑换的 starQty 分开） */
let ticQty = 1, ticFor = null;
export const ticQ = () => ticQty;
export function ticCtl(a) { if (a === 'reset') ticQty = 1; else if (a === 'all') ticQty = 1e9; else ticQty = Math.max(1, ticQty + (+a)) }   // 上限在画面那边按钱算（夹住）
export const starQ = () => starQty;
export function starCtl(a) { const S = ctx.S(), have = S.stars || 0; if (a === 'reset') starQty = 1; else starQty = a === 'all' ? Math.max(1, have) : Math.max(1, Math.min(Math.max(1, have), starQty + (+a))) }
export const STAR_GET = (k, n) => { const u = { coins: [STAR.coins, '末日币'], gear: [STAR.gear, '个发条'], toolbox: [STAR.toolbox, '个工具箱'], ref: [STAR.ref, '张刷新券'], crys: [CRYSTAL.perStar, '颗晶石'] }[k]; return u ? { per: u[0], unit: u[1], line: `花 ${n} 颗星星 → 得到 ${n} × ${u[0]} = ${n * u[0]} ${u[1]}`, short: `${n} 颗 → ${n * u[0]} ${u[1].replace(/^[个张颗]/, '')}`, got: `${n * u[0]} ${u[1]}` } : null };   /* 设计 85：short = 小屏一行（「5 颗 → 25000 末日币」） */
export function whDropCtl(k, a) {
  if (k === 'sel') whDrop = whDrop && whDrop.g === a ? null : { g: a, n: 1 };
  else if (k === 'n' && whDrop) { const S = ctx.S(), have = S.stock[whDrop.g] || 0; whDrop.n = a === 'all' ? have : Math.max(1, Math.min(have, whDrop.n + (+a))) }
  else if (k === 'clear') whDrop = null;
  refreshPanel(true);
}
export const whDropSel = () => whDrop;
function whDropHTML(S) {
  if (!whDrop || !(S.stock[whDrop.g] > 0)) { whDrop = null; return '<p class="note">点一样商品可以丢掉一些（仓库满了收不了菜、回收机停下时用）。</p>' }
  const g = whDrop.g, have = S.stock[g]; whDrop.n = Math.min(whDrop.n, have);
  return `<div class="dropbar">${icon('good', g)}<b>${GOODS[g].name}</b><span class="note">（有 ${have}）</span>${[-10, -1].map(d => `<button class="btn sm ghost" data-act="whN" data-arg="${d}" ${whDrop.n > 1 ? '' : 'disabled'}>${d}</button>`).join('')}<b class="dn">${whDrop.n}</b>${[1, 10].map(d => `<button class="btn sm ghost" data-act="whN" data-arg="${d}" ${whDrop.n < have ? '' : 'disabled'}>+${d}</button>`).join('')}<button class="btn sm ghost" data-act="whN" data-arg="all">全部</button><button class="btn" data-act="whDo">丢掉</button></div>`;
}
export const setTdTab = t => { gst('td').tab = t; gst('td').sel = null };
let buildTab = 'b', shelfTab = 'shelf', shelfSlot = 0, wsN = 1, shelfPg = -1;   // 35：货架选货一页 12 个，左右翻（-1 = 翻到在卖的那页）
export const setCrewPick = k => { const g = gst('ws'); g.crewPick = k == null || g.crewPick === k ? null : k; refreshPanel(true) };   // 设计 62：工坊顶上点工匠名字换人
export const setWsLine = i => { const g = gst('ws'); g.line = g.line === i && g.lineK === g.tab ? null : i; g.lineK = g.tab; refreshPanel(true) };   // 设计 60：点开 / 收起这条线的「选」
export const setWsN = d => { wsN = Math.max(1, wsN + d) };
export const setShelfSlot = j => { shelfSlot = j; shelfPg = -1 };
export const setShelfPg = d => { shelfPg = Math.max(0, shelfPg + d) };   // 货架页按种类分开（0.18）：货架 / 果蔬架 / 冰柜
export const setShelfTab = t => { shelfTab = t };
export const setBuildTab = t => { buildTab = t };
/* 哪些按钮要亮红点：建造（有能升的、施工队空着）、员工（有人饿着罢工 / 救回来的人等你决定 / 没安排岗位）、
   尸潮（有没打赢过的关能打）、货架（有空着没选货的货柜）、仓库（有东西放满了）、设置（有新版本） */
let extraDots = {};
let dayFn = () => '';   // 设计 43：北京时间的日期（main 里的 bjDay），每日免费（设计 112：星星）按它判断
export const setDayFn = f => { dayFn = f };
export const setDot = (k, on) => { extraDots[k] = on };
/* ---------- 消息框（0.14 用户要的）：不那么急的事（卖完了、没种子了、升级完了、员工回来了……）记在这里，菜单左边的按钮看；
   S.msgs = [{ at: 时间戳, x: 文字, k: 'good'|'bad'|'info', r: 已读 }]，最新的在最前面，最多留 60 条。
   一条一条读：点一下那条才算已读（用户 0.15 要的；以前打开下拉就全算读过） ---------- */
export function msg(S, x, k = 'info') {
  if (!S) return; S.msgs = S.msgs || [];
  if (S.msgs[0] && S.msgs[0].x === x && Date.now() - S.msgs[0].at < 60000) return;   // 一分钟内同样的消息不重复记
  S.msgs.unshift({ at: Date.now(), x, k }); if (S.msgs.length > 60) S.msgs.length = 60;
  msgBadge(S);
}
/* 旧存档用 S.msgSeen 记「看过的最新时间」，换成每条的 r */
function msgMig(S) { if (S.msgSeen == null) return; for (const m of S.msgs || []) if (m.at <= S.msgSeen) m.r = true; delete S.msgSeen }
const msgUnread = S => { msgMig(S); return (S.msgs || []).filter(m => !m.r).length };
/* 消息下拉：没读的标亮，点一下那条变已读；「全部已读」一次读完；「删除已读」删掉读过的 */
let msgOpen = false, msgHtml = '';
export const msgIsOpen = () => msgOpen;
export function msgToggle(S, on) {
  msgOpen = on; $('#msgDrop').classList.toggle('hidden', !on); $('#hMsg').classList.toggle('open', on);
  if (on) { msgMig(S); msgHtml = ''; msgRender(S) }
}
export function msgRead(S, i) { const m = (S.msgs || [])[i]; if (!m || m.r) return false; m.r = true; msgHtml = ''; msgRender(S); return true }
export function msgReadAll(S) { let n = 0; for (const m of S.msgs || []) if (!m.r) { m.r = true; n++ } msgHtml = ''; msgRender(S); return n }
export function msgDelRead(S) { const before = (S.msgs || []).length; S.msgs = (S.msgs || []).filter(m => !m.r); msgHtml = ''; msgRender(S); return before - S.msgs.length }
export function msgRender(S) {
  if (!S) return; msgBadge(S); if (!msgOpen) return;
  const list = S.msgs || [];
  const K = { good: '好消息', bad: '注意', info: '消息' };
  const html = list.length ? list.map((m, i) => `<div class="mrowx ${m.r ? '' : 'new'}" data-mi="${i}"><span class="mt">${ago(m.at)}</span><span class="mk ${m.k}">${K[m.k] || '消息'}</span><span class="mx">${esc(m.x)}</span></div>`).join('') : '<p class="note">没有消息。卖完了、没种子了、升级完成、员工拾荒回来这些事会记在这里。</p>';
  if (html !== msgHtml) { msgHtml = html; $('#msgDrop .mbody').innerHTML = html }
  const del = $('#msgDrop [data-mdel]'); if (del) del.disabled = !list.some(m => m.r);
  const all = $('#msgDrop [data-mall]'); if (all) all.disabled = !list.some(m => !m.r);
}
const ago = t => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? '刚刚' : s < 3600 ? `${Math.floor(s / 60)} 分钟前` : s < 86400 ? `${Math.floor(s / 3600)} 小时前` : `${Math.floor(s / 86400)} 天前` };
function hudDots(S) {
  return {
    gear: S.lv.store >= FB.store && !!(S.fb && S.fb.bag && S.fb.bag.some(x => x.nw)),   /* 设计 76：背包里有新装备没看过：头像上一个红点 */
    build: !L.crewFull(S) && BUILD_ORDER.some(k => L.buildInfo(S, k).ok),
    staff: !!S.pendingStaff || S.staff.some(p => !p.fed),
    td: Array.from({ length: TD_MAX }, (_, i) => i + 1).some(lv => !(S.td.wins[lv] > 0) && !L.tdCanStart(S, lv)),
    shelf: S.shelves.some(sh => L.slotsOf(sh).some(sl => !sl.g)) || L.notOnShelf(S).length > 0,   // 设计 45：有空货柜没选货，或者有货没上架
    stock: GOOD_IDS.some(g => g !== 'fish' && L.whFull && L.whFull(S, g)),
    menu: !!extraDots.menu,
  };
}

/* ---------- 新手目标：按累计数据判断进度，不用另存 ---------- */
export function goalText(S) {
  const st = S.st;
  if (st.junk < 5) return `目标：坐院子里的货车去拾荒区捡物资（${st.junk}/5）`;
  if (st.rec < 1 && !S.rq.length) return '目标：回院子，走到回收机旁边投入物资';
  if (st.sold < 1) return S.queue.length ? '目标：走到收银台旁边，给排队的顾客结账' : '目标：等顾客进店挑货，到收银台排队';
  if (st.builds < 1 && !S.builds.length) return '目标：点右上角「☰」里的「建造」，升级一样东西';
  /* 新手目标做完以后：显示本阶段第一个还没完成的升级任务 */
  const ts = L.stageTasks(S), t = ts.find(x => !S.tasks[x.id]);
  if (t) return `任务：${t.name}（${Math.min(t.goal, Math.floor(t.prog(S)))}/${t.goal}）`;
  const nx = BUILD.store.levels[S.lv.store + 1];
  if (ts.length && nx && nx.td && !(L.tdCleared(S) >= nx.td) && !L.busyWith(S, 'store')) return `任务完成：再打尸潮，通关第 ${nx.td} 关（现在 ${L.tdCleared(S)} 关）`;
  if (ts.length) return L.busyWith(S, 'store') ? '超市升级中…' : '升级任务全部完成：去「建造」升级超市';
  return '';
}

/* ---------- 提示 ---------- */
/* 设计 97：打副本时超市那边来的飘字、横幅、提示（生产、暴击产出、卖货、员工、仓库满……）一律不显示，回超市也不补放。
   在这里统一拦：main.js 设 mute = 「在副本里」；副本自己的飘字、提示走 raw（main.js 传给副本的 UI 用的是 raw） */
let mute = () => false, userT = -1e9;
export function setMute(f) { mute = f }
/* 玩家自己点的（副本里「获得」框的穿上 / 收下 / 分解、确认框）照常提示：点完 0.4 秒内的提示不拦 */
for (const ev of ['pointerdown', 'click', 'keydown']) document.addEventListener(ev, e => { if (e.target && e.target.closest && e.target.closest('#fbHud, #joyzone, #cv')) return; userT = performance.now() }, true);   // 打副本按的攻击、技能、摇杆不算
const muted = () => mute() && performance.now() - userT > 400;
export function toast(msg, cls = '', ms = 2200) { if (muted()) return; rawToast(msg, cls, ms) }
function rawToast(msg, cls = '', ms = 2200) {
  const box = $('#toasts'); if (box.children.length >= 3) box.firstChild.remove();
  const d = document.createElement('div'); d.className = 'toast ' + cls; d.textContent = msg; box.appendChild(d);
  setTimeout(() => d.remove(), ms);
}
export function big(title, sub, cls = '') { if (muted()) return; rawBig(title, sub, cls) }
function rawBig(title, sub, cls = '') {
  const b = $('#big'); b.innerHTML = `<div class="bx ${cls}"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
}
export function flash() { const f = $('#flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on') }

/* ---------- 场景标签（跟着 3D 物体走的文字） ---------- */
const labels = new Set(); const v3 = new THREE.Vector3();
let W = 1, H = 1; export function setSize(w, h) { W = w; H = h }
/* 标签属于哪张地图：院子（main）、拾荒区（scav）、两边都有（any）；不在当前地图的不显示 */
let curWorld = 'main';
export const setLabelWorld = w => { curWorld = w };
/* 设计 69：牌子多了这些：
   mob = 会走的（顾客、员工、商人、动物的名字），避让时排在固定的后面，压到固定的只让会走的挪开 / 先不画；
   zone / r / r2 / always：走近了才显示（见 setNear）；alert(html)：走远了也显示的小图标（员工饿了的饭碗、机器断料的红点），走近展开成完整的字；
   hold：内容变空以后至少再留几毫秒（「缺货」这种状态在两边来回跳时不闪） */
export function label(getPos, cls = '', world = 'main', opt = {}) {
  const el = document.createElement('div'); el.className = 'lab ' + cls; el.style.opacity = '0'; $('#labels').appendChild(el);
  const o = Object.assign({ el, getPos, world, html: '', alertH: null, shown: '', vis: false, ox: 0, oy: 0, okT: 0, badT: 0, homeT: 0, nearT: -1e9, full: '',
    set(h, pct) {
      if (!h && o.hold && o.full && performance.now() - o.fullAt < o.hold) { if (o.bar && pct != null) o.bar.style.width = pct + '%'; return }   // 设计 69：变空的先留一会儿
      if (h) { o.fullAt = performance.now() }
      if (h !== o.full) { o.full = h; o.dirty = true }
      o.html = o.full || o.alertH || ''; el.style.display = o.html ? '' : 'none';
      if (o.shown === 'full' && o.dirty) render(o);
      if (o.bar && pct != null) o.bar.style.width = pct + '%' },
    alert(h) { h = h || null; if (h === o.alertH) return; o.alertH = h; o.html = o.full || o.alertH || ''; el.style.display = o.html ? '' : 'none'; if (o.shown === 'alert') render(o) },
    remove() { el.remove(); labels.delete(o) } }, opt);
  labels.add(o); return o;
}
function render(o) { const h = o.shown === 'full' ? o.full : o.shown === 'alert' ? o.alertH || '' : ''; if (o.elH !== h) { o.elH = h; o.el.innerHTML = h; o.bar = o.el.querySelector('.pg i'); o.dirty = false } }
/* 设计 69：走近了才显示。main.js 每帧给：on（设置里「只显示附近的」、不在尸潮 / 布置里）、主角 x z、zoneOf(x, z)（牌子在哪块场地：store / ws / gh / orch / ranch / ne / null）、
   inZone(场地)（主角在不在那块场地，边上留了缓冲）。牌子在场地里：主角在同一块场地才显示（r2：还要离主角几米内，牧场的棚）；不在场地里：离主角 r 米内（默认 5）。
   出了范围 0.5 秒后才藏（进来马上显示） */
let NEAR = { on: false };
export function setNear(n) { NEAR = n }
const _np = new THREE.Vector3();
function nearOK(o, now) {
  if (!NEAR.on || o.always || o.world !== 'main' || o.ft) return true;
  const p = o.nearPos ? o.nearPos() : o.getPos(); _np.copy(p);
  const d = Math.hypot(_np.x - NEAR.x, _np.z - NEAR.z), z = o.zone !== undefined ? o.zone : NEAR.zoneOf(_np.x, _np.z);
  const ok = z ? NEAR.inZone(z) && (o.r2 == null || d <= o.r2) : d <= (o.r || 5);
  if (ok) o.nearT = now;
  return now - o.nearT < 500;
}
/* 设计 30：飘字限量 + 重复用 div（尸潮里一秒几十个，每次新建、删除网页元素手机要不停重新排版）：同一时间最多 12 个，多的不出 */
const ftPool = [], ftLive = new Set();
/* 37：暴击时工坊面板那条线闪一下（记下时间，面板重画时 1.5 秒内带 crit） */
const critAt = {};
export function critLine(k, i) { critAt[k + ':' + i] = performance.now(); if (cur === 'ws') refreshPanel(true) }
export function floatText(pos, text, cls = '') { if (muted()) return; rawFloat(pos, text, cls) }
export const raw = { toast: (...a) => rawToast(...a), big: (...a) => rawBig(...a), floatText: (...a) => rawFloat(...a) };
function rawFloat(pos, text, cls = '') {
  if (perfOpt('ft')) {
    if (ftLive.size >= 12) return;
    let o = ftPool.pop();
    if (!o) { const el = document.createElement('div'); $('#labels').appendChild(el); const p = new THREE.Vector3();
      o = { el, p, getPos: () => p, world: curWorld, html: 'x', remove() { el.style.display = 'none'; labels.delete(o); ftLive.delete(o); ftPool.push(o) } } }
    o.p.copy(pos); o.world = curWorld; o.el.className = 'ft ' + cls; o.el.textContent = text; o.el.style.visibility = 'hidden'; labT = 0;
    o.el.style.display = ''; o.el.style.animation = 'none'; void o.el.offsetWidth; o.el.style.animation = '';   // 重新播一遍飘起来的动画
    labels.add(o); ftLive.add(o); clearTimeout(o.tm); o.tm = setTimeout(() => o.remove(), 1300); return;
  }
  const el = document.createElement('div'); el.className = 'ft ' + cls; el.textContent = text; $('#labels').appendChild(el);
  const p = pos.clone(); const o = { el, getPos: () => p, world: curWorld, html: 'x', remove() { el.remove(); labels.delete(o) } };
  labels.add(o); setTimeout(() => o.remove(), 1300);
}
/* 设计 66：头顶牌子每帧都跟位置（以前设计 57 每秒只摆 20 次，画面每帧在动、牌子隔 2～3 帧才跟，看起来所有牌子都在晃）。
   只有避让（互相挤开、躲顶栏和按钮）还是每秒算 20 次（开关「牌子避让20次/秒」），算好的偏移量（ox、oy）和「放不下先不画」存着，每帧照用。
   屏幕外的牌子照旧藏起来不算。牌子用 transform: translate3d 挪（不改 left / top，不触发重新排版）；飘字（.ft）有自己的动画用 transform，还是用 left / top */
let labT = 0;
const placeLab = (o, x, y) => { if (o.ft) { o.el.style.left = x + 'px'; o.el.style.top = y + 'px'; return } const t = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-100%)`; if (o.tf !== t) { o.tf = t; o.el.style.transform = t } };
/* 设计 69：牌子每帧只跟位置（transform）；避让挤开的偏移量用单独的 translate 属性（CSS 里 0.12 秒滑过去），藏 / 显用 opacity（0.15 秒淡入淡出） */
const setOff = (o, x, y) => { const t = `${x.toFixed(0)}px ${y.toFixed(0)}px`; if (o.trn !== t) { o.trn = t; o.el.style.translate = t } };
const setVis = (o, v) => { if (o.visShown === v) return; o.visShown = v; o.el.style.opacity = v ? '1' : '0' };
export function updateLabels(camera) {
  const now = performance.now();
  for (const o of labels) {
    if (!o.html) continue;
    if (o.ft == null) o.ft = o.el.classList.contains('ft');
    if (o.world !== 'any' && o.world !== curWorld) { o.el.style.visibility = 'hidden'; o.sx = null; continue }
    v3.copy(o.getPos()).project(camera);
    if (v3.z > 1 || v3.x < -1.15 || v3.x > 1.15 || v3.y < -1.15 || v3.y > 1.3) { o.el.style.visibility = 'hidden'; o.sx = null; o.vis = false; setVis(o, false); continue }
    o.sx = (v3.x + 1) / 2 * W; o.sy = (1 - v3.y) / 2 * H;
  }
  if (!perfOpt('lab') || now - labT >= 48) { const dt = Math.min(0.25, (now - (labT || now)) / 1000); labT = now; declutter(now, dt) }
  for (const o of labels) {
    if (!o.html || o.sx == null) continue;
    o.el.style.visibility = '';
    if (o.ft) { placeLab(o, o.sx, o.sy); continue }
    placeLab(o, o.sx, o.sy);
  }
}
/* 35b：工坊机器的名字牌（group 'ws'）自动错开：不跟别的牌子（员工名字等）叠在一起，也不被顶部资源条挡住。
   别的牌子不动，工坊牌子按从下往上的顺序一个个放，叠了就往上挪，挪到顶上放不下就改放到下面 */
/* 49（10-21 用户）：牌子不能推进顶栏、右上角按钮、右下角按钮（种菜、升级、布置……）那几块。这几块的位置每 15 帧量一次 */
let noGo = [], noGoN = 0;
function hudRects() {
  const out = [], add = e => { if (!e || e.classList.contains('hidden')) return; const r = e.getBoundingClientRect(); if (r.width > 0 && r.height > 0) out.push({ x0: r.left, x1: r.right, y0: r.top, y1: r.bottom }) };
  const hud = $('#hud'); if (hud && !hud.classList.contains('hidden')) { for (const g of hud.querySelectorAll('.hl > *, .hr > *')) add(g); add($('#hShort')) }
  for (const f of document.querySelectorAll('.fab')) add(f);
  return out;
}
export const labelNoGo = () => noGo;   // 自动检查用
export const labelDbg = () => labels;   // 设计 66 自动检查用：每帧比牌子画的位置和它该在的位置
function declutter(now, dt) {
  /* 八（10-21 用户）：所有头顶牌子共用一套避让——名字牌、货柜缺货牌、温室、棚、机器、施工牌……互相不压字。
     49：压到了先往上错开，往上会碰到顶栏 / 按钮就左右错开，都放不下就先不画。地上的小进度条（.gbar，不写字）原地不动，也不算挡着。
     设计 69：以前每 48 毫秒从头重算、没有记性，顾客名字牌走来走去，货架的「缺货」、升级箭头就在「原地 / 往上一格 / 藏起来」之间来回换，一闪一闪。现在：
       1. 固定的（货架、机器、温室、棚、施工、升级箭头、建筑）先放，会走的（mob：人、动物的名字）后放；会走的压到固定的，只让会走的挪开 / 先不画；
       2. 有记性：上次的位置还空着就不挪；被挤开的，原来的位置连续空 0.5 秒才搬回；藏起来的连续有地方 0.5 秒才显示，显示着的连续放不下 0.3 秒才藏；
       3. 宽度按「数字换成 0 以后一样」的内容记最宽的那次（倒计时、排队数在变时不重新排）；
       4. 走近了才显示（nearOK），走远了只显示小图标（alert） */
  if (noGoN-- <= 0) { noGo = hudRects(); noGoN = 15 }
  const all = [...labels].filter(o => o.html && o.el.style.display !== 'none' && o.sx != null && !o.ft);
  for (const o of all) { const want = nearOK(o, now) && o.full ? 'full' : o.alertH ? 'alert' : ''; if (want !== o.shown) { o.shown = want; if (want) render(o); if (!want) { o.vis = false } } else if (want && o.dirty) render(o) }
  const vis = all.filter(o => o.shown);
  for (const o of all) if (!o.shown) setVis(o, false);
  PERF_X.lab = vis.filter(o => o.vis).length;   // 设计 57：性能小窗「头顶牌子」（设计 69：显示着的）
  for (const o of vis) if (o.szH !== o.elH) { const key = (o.elH || '').replace(/\d/g, '0'); o.szH = o.elH; const w = o.el.offsetWidth, h = o.el.offsetHeight; if (key !== o.szK) { o.szK = key; o.w = w; o.h = h } else { o.w = Math.max(o.w || 0, w); o.h = Math.max(o.h || 0, h) } }
  const rect = (o, x, y) => ({ x0: x - o.w / 2, x1: x + o.w / 2, y0: y - o.h, y1: y });
  const hit = (a, b) => a.x0 < b.x1 + 2 && b.x0 < a.x1 + 2 && a.y0 < b.y1 + 2 && b.y0 < a.y1 + 2;
  const inView = r => r.x0 >= 2 && r.x1 <= W - 2 && r.y0 >= 2 && r.y1 <= H - 2;
  const placed = [], cx = W / 2, cy = H / 2, topY = noGo.filter(r => r.y0 < 80).reduce((a, r) => Math.max(a, r.y1), 0);
  const order = vis.filter(o => !o.el.classList.contains('gbar') && o.w > 0).sort((a, b) => (!!a.mob - !!b.mob) || Math.hypot(a.sx - cx, a.sy - cy) - Math.hypot(b.sx - cx, b.sy - cy));
  for (const o of vis) if (o.el.classList.contains('gbar')) { o.vis = true; setOff(o, 0, 0); setVis(o, true) }
  for (const o of order) {
    const free = r => inView(r) && !noGo.some(p => hit(p, r)) && !placed.some(p => hit(p, r));
    const y0 = Math.max(o.sy, topY + o.h + 2) - o.sy;   // 本来就在顶栏那一条里的（温室、工坊最北边的牌子）：先挪到顶栏下面再排
    const search = () => { for (let k = 0; k <= 4; k++) { const y = y0 - k * (o.h + 3); for (const dx of [0, -1, 1, -2, 2]) { const x = dx * (o.w * 0.55 + 3); if (free(rect(o, o.sx + x, o.sy + y))) return [x, y] } } return null };
    let pos = null;
    if (o.vis && free(rect(o, o.sx + o.ox, o.sy + o.oy))) {                                   // 上次的位置还空着：不挪
      pos = [o.ox, o.oy];
      if ((o.ox !== 0 || o.oy !== y0) && free(rect(o, o.sx, o.sy + y0))) { o.homeT += dt; if (o.homeT >= 0.5) { pos = [0, y0]; o.homeT = 0 } } else o.homeT = 0;
    } else { pos = search(); o.homeT = 0 }
    if (o.vis) {
      if (pos) o.badT = 0;
      else { o.badT += dt; if (o.badT < 0.3) pos = [o.ox, o.oy]; else { o.vis = false; o.crowd = true; o.okT = 0 } }   // 连续放不下 0.3 秒才藏
    } else if (pos) {
      o.okT += dt; if (!o.crowd || o.okT >= 0.5) { o.vis = true; o.crowd = false; o.badT = 0 } else pos = null;   // 被挤掉的：连续有地方 0.5 秒才显示；新出来的马上显示
    } else o.okT = 0;
    if (o.vis && pos) { o.ox = pos[0]; o.oy = pos[1]; setOff(o, o.ox, o.oy); placed.push(rect(o, o.sx + o.ox, o.sy + o.oy)) }
    setVis(o, o.vis);
  }
}


/* ================= 设计 76：角色页页签「主角 | 装备 | 背包 | 技能」（设计 107：炼宝搬到铁匠那里，角色页不再有）=================
   主角 = 角色面板（hero），后 4 个 = 装备面板（gear）的页签；点页签在两个面板之间切（看着是一个面板，标题都叫「角色」）。
   页签 id 以 @ 开头 = 换到别的面板：'@hero'、'@gear:bag'。超市不到 5 级：后 4 个灰着写「超市 5 级开放」（ROLE_OPT.lock = 'grey'），或者不显示（'hide'） */
export const ROLE_OPT = { lock: 'grey' };
export const GEAR_TABS = S => [{ id: 'eq', name: '装备' }, { id: 'bag', name: `背包 ${S.fb.bag.length}/${FB.bag}`, dot: S.fb.bag.some(x => x.nw) }, { id: 'sk', name: '技能' }];
export function roleTabs(S, inGear) {
  const open = S.lv.store >= FB.store, hero = { id: inGear ? '@hero' : 'hero', name: '主角' };
  if (open) return [hero, ...GEAR_TABS(S).map(t => ({ ...t, id: inGear ? t.id : '@gear:' + t.id }))];
  if (ROLE_OPT.lock === 'hide') return [hero];
  return [hero, ...['装备', '背包', '技能'].map((n, i) => ({ id: '!lock' + i, name: n, dis: true }))];
}
/* ================= 设计 29：通用面板框架 =================
   标题栏（图标 + 名字 + 资源条 + ? + 关闭）/ 分页 / 格子区（固定大小，左右翻页，不上下滚）/ 右边详情区。
   面板函数调用 frame(id, 配置) 拿 HTML；分页、页码、选中格子按面板记住（GS），重画时位置不变。
   配置：tabs [{id, name, dot}]、cells [{id, html, cls}]、cols、rows、detail(选中 id) → HTML、empty（没选时详情区）、left（左边固定一栏，可选）、
        top（分页下面一条固定小条，可选）、res（资源条 HTML）、help（「?」里的说明） */
const GS = {};
export const gst = k => GS[k] || (GS[k] = { tab: null, page: 0, sel: null });
let PMETA = null;
export const resChip = (ic, n, cls = '') => `<span class="rchip ${cls}">${ic}<b>${n}</b></span>`;
export function frame(k, o) {
  const g = gst(k), tabs = o.tabs || [];
  if (tabs.length && !tabs.find(t => t.id === g.tab)) { g.tab = tabs[0].id; g.page = 0 }
  /* 37 用户：所有翻页取消，内容多了就往下拉（代替设计 29 的「不滚动、左右翻页」）：格子全部排出来，一个面板一个滚动区（.pf-main） */
  const cells = o.cells || [], per = Math.max(1, cells.length), pages = 1; g.page = 0;
  if (g.jump) { g.scrollTo = g.sel; g.jump = false }   // 从别的地方跳过来选中某一格：画好以后滚到它
  if (g.page >= pages) g.page = pages - 1;
  if (g.sel != null && !o.noGrid && o.body == null && !cells.find(c => c.id === g.sel)) g.sel = null;   // 设计 68 修：设置 → 说明这种整块 body 的面板没有格子，以前每次都把选中的清掉，说明只能看到第一段
  PMETA = { res: o.res || '', help: o.help || '' };
  const pg = cells.slice(g.page * per, g.page * per + per);
  const tabH = tabs.length > 1 ? `<div class="pf-tabs">${tabs.map(t => `<button class="pf-tab ${t.id === g.tab ? 'on' : ''}${t.dis ? ' dis' : ''}" data-gtab="${t.id}">${t.name}${t.dis ? '<small>超市 ' + FB.store + ' 级开放</small>' : ''}${t.dot ? '<i class="dot"></i>' : ''}</button>`).join('')}</div>` : '';   /* 设计 76：dis = 灰着的页签 */
  const pager = '' && pages > 1 ? `<div class="pf-pager"><button data-gpage="-1" ${g.page ? '' : 'disabled'}>◀</button><span>${[...Array(pages)].map((_, i) => `<i class="${i === g.page ? 'on' : ''}"></i>`).join('')}</span><button data-gpage="1" ${g.page < pages - 1 ? '' : 'disabled'}>▶</button></div>` : '';
  const grid = `<div class="pf-grid" style="--cols:${o.cols || 4};--rows:${o.rows || 3}">${pg.map(c => `<div class="pf-cell ${c.cls || ''}${c.id === g.sel ? ' sel' : ''}" ${c.id != null ? `data-gsel="${c.id}"` : ''}>${c.html}</div>`).join('')}${pg.length ? '' : `<div class="pf-empty">${o.none || '空的'}</div>`}</div>`;
  const det = g.sel != null && o.detail ? o.detail(g.sel) : (o.empty || '');
  const topH = o.top ? `<div class="pf-top">${o.top}</div>` : '', head = o.topInTabs && tabH ? tabH.replace(/<\/div>$/, `<div class="pf-tr">${o.top}</div></div>`) : tabH + topH;
  if (o.body != null) return `<div class="pf">${head}<div class="pf-main one"><div class="pf-body">${o.body}</div></div></div>`;
  return `<div class="pf">${head}<div class="pf-main">${o.left ? `<div class="pf-left${o.noGrid ? ' wide' : ''}">${o.left}</div>` : ''}${o.noGrid ? '' : `<div class="pf-gw">${o.lead || ''}${grid}${pager}${o.foot || ''}</div>`}<div class="pf-detail"${o.dw ? ` style="--dw:${o.dw}px"` : ''}>${det}</div></div></div>`;
}
/* 花费用图标 + 数字（够的正常色、不够的红色） */
const costIc = (S, c, time = true) => { const ok = b => b ? '' : ' lack', out = [];
  if (c.coins) out.push(`<span class="cic${ok(S.coins >= c.coins)}"><i class="ico-coin"></i>${c.coins}</span>`);
  for (const [id, n] of Object.entries(c.need || {})) out.push(`<span class="cic${ok((S.treas[id] || 0) >= n)}">${icon('tr', id)}${n}</span>`);
  if (c.td) out.push(`<span class="cic${ok(L.tdCleared(S) >= c.td)}">通关尸潮第 ${c.td} 关 ${L.tdCleared(S) >= c.td ? '✓' : '✗'}</span>`);   // 设计 60
  if (time && c.time) out.push(`<span class="cic tm">⏱${fmtT(c.time)}</span>`);
  return out.join('') };
/* 设计 29b：框架面板重画时不整页换掉，只换变了的部分（某一格、详情区、分页条……），换货、升级时别的格子不动 */
const DEEP = ['pf', 'pf-main', 'pf-gw', 'pf-grid', 'pf-detail', 'pf-left'];   // 设计 44：详情区也只换变了的部分，滚到的位置不丢
function morphKids(o, n) {
  const ok = [...o.children], nk = [...n.children];
  if (ok.length !== nk.length || ok.some((c, i) => c.tagName !== nk[i].tagName || c.classList[0] !== nk[i].classList[0])) { o.replaceChildren(...nk); return }
  ok.forEach((a, i) => { const c = nk[i]; if (a.isEqualNode(c)) return;
    if (DEEP.includes(a.classList[0])) { for (const at of [...a.attributes]) if (!c.hasAttribute(at.name)) a.removeAttribute(at.name); for (const at of [...c.attributes]) if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value); morphKids(a, c) }
    else a.replaceWith(c) });
}
function morphPF(b, html) {
  const o = b.firstElementChild; if (!o || b.children.length !== 1 || !o.classList.contains('pf')) return false;
  const t = document.createElement('div'); t.innerHTML = html; const n = t.firstElementChild;
  if (!n || t.children.length !== 1 || !n.classList.contains('pf')) return false;
  morphKids(o, n); return true;
}

/* ================= 设计 37：就近升级小窗 =================
   t = { kind: 'b' | 'tier' | 'tower', k, i, name }：建筑 / 工坊机器 / 动物棚用 buildInfo，货柜升档用 tierInfo，塔用 towerInfo。
   内容：名字、Lv a → b、升了变成什么样、花费（有 / 要）、条件、【升级】【关闭】；不够时按钮灰、上面写差什么 */
export function upInfo(S, t) { return t.kind === 'tier' ? L.tierInfo(S, t.i) : t.kind === 'tower' ? L.towerInfo(S, t.i) : L.buildInfo(S, t.k) }
export function upBusy(S, t) { return t.kind === 'tier' ? L.busyWith(S, 'tier', t.i) : t.kind === 'tower' ? L.busyWith(S, 'tower', t.i) : L.busyWith(S, t.k) }
function upEffect(S, t, inf) {
  if (t.kind === 'tier') { const sh = S.shelves[t.i], f = FIXTURE[sh.type], a = inf.cur, b = inf.to, ka = f.kinds ? f.kinds[a - 1] : 1, kb = f.kinds ? f.kinds[b - 1] : 1;
    return `${f.tiers[a - 1]} → <b>${f.tiers[b - 1]}</b><br>每种 ${f.cap[a - 1]} → <b>${f.cap[b - 1]}</b> 件${kb > ka ? `，${ka} → <b>${kb}</b> 种` : ''}${f.mult[b - 1] > f.mult[a - 1] ? `<br>售价 ×${f.mult[a - 1]} → <b>×${f.mult[b - 1]}</b>` : ''}` }
  if (t.kind === 'tower') { const T = TOWERS[S.towers[t.i].k], A = T.lv[inf.cur], B = T.lv[inf.to];
    return `伤害 ${A.dmg} → <b>${B.dmg}</b><br>射程 ${A.range} → <b>${B.range}</b> 米${B.slow ? `<br>减速 ${Math.round(A.slow * 100)}% → <b>${Math.round(B.slow * 100)}%</b>` : ''}` }
  return effTxt(t.k, inf.to) || '';
}
export function upHTML(S, t) {
  const inf = upInfo(S, t), busy = upBusy(S, t);
  const lv = n => t.kind === 'tier' ? TIER_NAME[n] : `Lv ${n}`;
  if (busy) return `<h4>${t.name}</h4><p class="ulv">${lv(inf.cur || 0)} → ${lv(busy.to)}</p><p>升级中，还要 <b>${fmtT(busy.left)}</b></p><div class="ubtns"><button class="btn ghost" data-up="close">关闭</button></div>`;
  if (!inf || inf.max) return `<h4>${t.name}</h4><p>已经满级了</p><div class="ubtns"><button class="btn ghost" data-up="close">关闭</button></div>`;
  const c = inf.cost || {}, row = (ic, nm, have, need) => `<div class="ucost${have >= need ? '' : ' lack'}">${ic}<span>${nm}</span><b>${Math.floor(have)} / ${need}</b></div>`;
  const costs = [row('<i class="ico-coin"></i>', '末日币', S.coins, c.coins || 0), ...Object.entries(c.need || {}).map(([id, n]) => row(icon('tr', id), TREASURE[id].name, S.treas[id] || 0, n))];
  const cond = []; if (c.store) cond.push(`超市 ${c.store} 级（现在 ${S.lv.store} 级）${S.lv.store >= c.store ? ' ✓' : ''}`); if (c.time) cond.push(`占一个施工队 ${fmtT(c.time)}`);
  const why = inf.ok ? '' : `<p class="uwhy">${(inf.lack || []).join('；')}</p>`;
  return `<h4>${t.name}<span class="ulv">${lv(inf.cur || 0)} → <b>${lv(inf.to)}</b></span></h4>
    <div class="ueff">${upEffect(S, t, inf)}</div>
    <div class="uh">花费（有 / 要）</div><div class="ucosts">${costs.join('')}</div>
    ${cond.length ? `<div class="uh">条件</div><div class="ucond">${cond.join('；')}</div>` : ''}
    ${why}<div class="ubtns"><button class="btn" data-up="go" ${inf.ok ? '' : 'disabled'}>升级</button><button class="btn ghost" data-up="close">关闭</button></div>`;
}
/* 设计 47：员工详情里「效率」下面一行：这个效率在他现在的岗位上有什么用 */
function effUse(S, p) {
  const e = L.staffStats(p).eff, pc = Math.round((e - 1) * 100), sp = Math.round((L.effSpd(p) - 1) * 100), n = L.manageN(p);
  const t = { craft: `管 ${n} 台机器，做得快 ${sp}%`, feed: `管 ${n} 个棚，产得快 ${sp}%`, farm: `干活快 ${pc}%`, cash: `结账快 ${pc}%`, scav: `每趟多带 ${pc}%`, fish: `每趟多带 ${pc}%` }[p.job];
  return t ? `<div class="drow"><span>用处</span><b class="nw">${t}</b></div>` : '';
}
/* ---------- 面板 ---------- */
let cur = null, ctx = null, lastBody = '', heroPop = null;   // heroPop：刚升级的格子，重画后闪一下
/* 37 滚动不能误点：手指按下后移动超过 8px 就算拖动（滚动），这一下不算点击 */
let dragFrom = null, dragged = false;
document.addEventListener('pointerdown', e => { dragFrom = [e.clientX, e.clientY]; dragged = false }, true);
document.addEventListener('pointermove', e => { if (dragFrom && Math.hypot(e.clientX - dragFrom[0], e.clientY - dragFrom[1]) > 8) dragged = true }, true);
document.addEventListener('click', e => { if (dragged && e.target.closest && e.target.closest('#panel')) { e.stopPropagation(); e.preventDefault() } dragged = false; dragFrom = null }, true);
/* 37：关了面板再打开回到原来滚到的位置（按面板 + 页签记）。设计 44：左边格子、右边详情、最左一栏、整块的分开记；
   左边换了一格，右边回到最上面 */
const scrollMem = {};
const SCROLLERS = [['.pf-main.one', 'm'], ['.pf-gw', 'l'], ['.pf-detail', 'r'], ['.pf-left', 'x']];
function keepScroll() {
  const b = $('#pbody'); if (!b || !cur) return; const g = gst(cur), base = cur + '|' + (g.tab || '');
  for (const [sel, side] of SCROLLERS) { const m = b.querySelector(sel); if (!m) continue;
    const key = base + '|' + side + (side === 'r' ? '|' + (g.sel ?? '') : '');
    if (!m.__rs) { m.__rs = true; m.addEventListener('scroll', () => { if (m.__key) scrollMem[m.__key] = m.scrollTop }, { passive: true }) }
    if (m.__key !== key) { m.__key = key; m.scrollTop = scrollMem[key] || 0 } }
  if (g.scrollTo != null) { const c = b.querySelector(`[data-gsel="${g.scrollTo}"]`); if (c) c.scrollIntoView({ block: 'nearest' }); g.scrollTo = null }
}
export function initPanels(c) {
  ctx = c;
  document.addEventListener('click', e => {
    const o = e.target.closest('[data-open]'); if (o) { if (o.dataset.open === 'td' && awayCheck()) { toast('回到超市才能打尸潮', 'bad'); return } openPanel(o.dataset.open); return }   // 0.42 用户：在拾荒区、钓鱼区时尸潮是灰的、打不开
    if (e.target.closest('[data-close]') || e.target.id === 'panel') { closePanel(); return }
    const a = e.target.closest('[data-act]'); if (a && !a.disabled) { if (a.dataset.act === 'heroUp') heroPop = a.dataset.arg; ctx.act(a.dataset.act, a.dataset.arg); refreshPanel(true); return }
    /* 设计 29 框架：分页 / 翻页 / 选格子 / 「?」 */
    const hp = e.target.closest('[data-phelp]'); if (hp) { const box = $('#phelpBox'); box.classList.toggle('hidden'); return }
    if (!e.target.closest('#phelpBox')) $('#phelpBox').classList.add('hidden');
    if (cur) { const g = gst(cur);
      const t = e.target.closest('#pbody [data-gtab]');
      if (t && t.dataset.gtab[0] === '!') { toast(`超市 ${FB.store} 级开放`, 'bad'); return }   /* 设计 76：灰着的页签 */
      if (t && t.dataset.gtab[0] === '@') { const [p, tb] = t.dataset.gtab.slice(1).split(':'); if (tb) { const g2 = gst(p); g2.tab = tb; g2.sel = null } openPanel(p); return }   /* 设计 76：主角 ↔ 装备几个页签 */
      if (t) { if (g.tab !== t.dataset.gtab) { g.tab = t.dataset.gtab; g.page = 0; g.sel = null; refreshPanel(true) } return }
      const p = e.target.closest('#pbody [data-gpage]'); if (p) { g.page = Math.max(0, g.page + +p.dataset.gpage); refreshPanel(true); return }
      const c = e.target.closest('#pbody [data-gsel]'); if (c) { g.sel = g.sel === c.dataset.gsel ? null : c.dataset.gsel; scrollMem[cur + '|' + (g.tab || '') + '|r|' + (g.sel ?? '')] = 0;   // 设计 44：左边点了另一格，右边回到最上面
        shelfSlot = 0; shelfPg = -1; wsN = 1; staffDTab = 'a'; refreshPanel(true); return } }
  });
}
export const panelOpen = () => !!cur || askOpen();   /* 设计 79：确认框开着也算（副本、尸潮暂停，摇杆不动） */
export const panelIs = k => cur === k;
let awayCheck = () => false;
export const setAwayCheck = f => { awayCheck = f };
export const curPanel = () => cur;
/* 商人：打开就是商城页面；far = 钓鱼区的商人（饵料、鱼竿贵 20%） */
let mallAt = null;
let farFn = () => false;
export const setFarCheck = f => { farFn = f };
export const mallFar = () => farFn();   // 贵不贵看人在哪（在钓鱼区就贵 20%），不看从哪打开的
export function openMall(far) { openPanel('mall'); mallAt = far ? 'far' : 'yard'; refreshPanel(true) }
/* 设计 46 / 60：点「查看」打开：打开工坊 / 货架面板，切到这台机器的页签 / 这个货柜的种类页签并选中它 */
export function openAt(name, tab, sel) { const g = gst(name); g.tab = tab; g.sel = sel == null ? null : String(sel); g.jump = sel != null; if (name === 'shelf') shelfSlot = 0; if (name === 'ws') wsN = 1; openPanel(name) }
export function openPanel(name) { mallAt = null; if (name === 'mall') { mallTab = 'shop'; gst('mall').tab = 'sup'; gst('mall').sel = null } cur = name; $('#panel').classList.remove('hidden'); lastBody = ''; refreshPanel(true); $('#pbody').scrollTop = 0 }
export function closePanel() { cur = null; mallAt = null; $('#panel').classList.add('hidden') }
let staffSel = 0, pending = null, revealP = null, staffDTab = 'a';
export const setStaffDTab = t => { staffDTab = t };
/* 员工详情「岗位」页下面的一句话（长的说明放「?」） */
const JOB_TIP = { cash: '在收银台收钱，你不在店里也照常营业。', farm: '自动收菜、补种、摘果（离线也干）。', scav: '一次只能派一个人，带回的物资堆在货车旁。半路换岗这一趟白跑。', fish: '一次只能派一个人，没饵料就停着。', feed: '在牧场喂动物、收鸡蛋牛奶。', craft: '在工坊看机器、做菜。', rest: '不干活。' };
/* 从别的地方（新员工到了、营地住满了）打开员工面板并选中这个人 */
export function openStaff(id) { const g = gst('staff'); g.tab = 'all'; g.sel = String(id); g.jump = true; staffDTab = 'a'; openPanel('staff') }
/* 员工头像：图片放进一张样式表（.pt0～.pt11），面板里只写 class，不把图片塞进 HTML（面板对比内容时不用比一大串） */
export function setPortraits(urls) {
  if (!urls || !urls.length) return;
  const st = document.createElement('style'); st.textContent = urls.map((u, i) => `.sav .pt${i}{background-image:url(${u})}`).join('\n'); document.head.appendChild(st);
  document.body.classList.add('has-pt');
}
export const setReveal = p => { revealP = p };
/* 有种地的员工时，每块地下面一个「员工补种：X」按钮，点一下换一种 */
const planBtn = (S, i) => { if (!S.staff.some(p => p.job === 'farm')) return ''; const w = (S.plotPlan || [])[i]; return `<button class="gchip plan" data-act="plotPlan" data-arg="${i}">员工补种：${w ? GOODS[w].name : '自动'}</button>` };
/* 在岗时显示什么：拾荒的要看是出门了还是堆满了在等 */
/* 设计 60：员工详情 → 岗位页：工匠、饲养员按机器 / 棚固定分，这里看他管哪几台，点「换给他」把别人管的换过来（他管满了就跟那个人对调一台） */
/* 设计 62：「管哪几台」顶上一个开关「自动 / 指定」。
   自动：照旧，每台写谁管，能「换给他」；指定：列出这个岗位全部机器 / 棚，勾选框（勾满 manageN 台别的变灰，写「最多管 N 台」），勾了别人指定的那台先问一句。
   种地的指定：选「温室」「果园」（可以都选） */
const crewBox = (S, p) => {
  const pin = L.isPinned(S, p), sw = `<div class="pinsw"><span>管法</span><button class="btn sm ${pin ? 'ghost' : ''}" data-act="crewPin" data-arg="${p.id}:0">自动</button><button class="btn sm ${pin ? '' : 'ghost'}" data-act="crewPin" data-arg="${p.id}:1">指定</button></div>`;
  if (p.job === 'farm') { const P = pin && S.crewPin[p.id];
    return `<div class="dsub">管哪里：</div>${sw}${pin ? `<div class="crewl">${[['gh', '温室', S.lv.gh], ['orch', '果园', S.lv.orchard]].map(([w, n, lv]) => `<label class="cr chk${lv ? '' : ' off'}"><input type="checkbox" data-act="farmPin" data-arg="${p.id}:${w}" ${P[w] ? 'checked' : ''} ${lv ? '' : 'disabled'}><span>${n}${lv ? '' : '（还没盖）'}</span></label>`).join('')}</div><p class="note">只管温室的不去摘果子；只管果园的只摘果子。</p>` : '<p class="note">自动：温室、果园都管。</p>'}` }
  if (p.job !== 'craft' && p.job !== 'feed') return '';
  const list = p.job === 'craft' ? L.wsBuilt(S) : L.ranchBuilt(S), mine = L.crewKeys(S, p.job, p.id), cap = L.manageN(p), unit = p.job === 'craft' ? '台' : '个';
  if (!list.length) return '';
  const tag = o => o ? `${o.name}${L.isPinned(S, o) ? '（指定）' : ''}管` : '<span class="warn">没人管</span>';
  if (!pin) return `<div class="dsub">管哪几${unit}（${mine.length}/${cap}）：</div>${sw}<div class="crewl">${list.map(k => { const o = L.crewOf(S, p.job, k), me = o && o.id === p.id;
    return `<div class="cr"><span>${BUILD[k].name}　<small>${me ? `<b class="good">${p.name}管</b>` : tag(o)}</small></span>${me ? '' : `<button class="btn sm ghost" data-act="crewSet" data-arg="${p.job}:${k}:${p.id}">换给他${mine.length >= cap && o ? '（对调）' : ''}</button>`}</div>` }).join('')}</div><p class="note">自动：没人管的${unit === '台' ? '机器' : '棚'}按效率补给自动的人，补到 ${cap} ${unit}。</p>`;
  const full = mine.length >= cap;
  return `<div class="dsub">只管勾的（${mine.length}/${cap}）${full ? `<span class="warn">　最多管 ${cap} ${unit}</span>` : ''}：</div>${sw}<div class="crewl">${list.map(k => { const o = L.crewOf(S, p.job, k), me = o && o.id === p.id, dis = !me && full;
    return `<label class="cr chk${dis ? ' off' : ''}"><input type="checkbox" data-act="pinToggle" data-arg="${p.id}:${k}" ${me ? 'checked' : ''} ${dis ? 'disabled' : ''}><span>${BUILD[k].name}　<small>${me ? `<b class="good">${p.name}管</b>` : tag(o)}</small></span></label>` }).join('')}</div><p class="note">指定：只管你勾的几${unit}（1～${cap} ${unit}），别的不会补给他；效率高的放在最要紧的${unit === '台' ? '机器' : '棚'}上。</p>`;
};
/* 设计 60：名字下面写「工作：管什么」——工匠写管的机器，饲养员写管的棚 */
const DUTY = { cash: '收银台', farm: '温室、果园', scav: '拾荒区', fish: '钓鱼区', rest: '不干活' };
export const dutyTxt = (S, p) => { const ks = p.job === 'craft' || p.job === 'feed' ? L.crewKeys(S, p.job, p.id) : null;
  return `${STAFF_JOBS[p.job]}：${ks ? (ks.length ? ks.map(k => BUILD[k].name).join('、') : '还没分到') : DUTY[p.job] || ''}` };
const sname = p => `<i class="qsq q-${p.q}"></i><b class="sname">${p.name}</b>`;
const workTxt = (S, p) => p.job === 'fish' ? (p.trip ? `钓鱼中 <span data-tl="s${p.id}"></span>` : !((S.bait.worm || 0) + (S.bait.corn || 0)) ? '<span class="warn">没饵料，等着</span>' : L.whFull(S, 'fish') ? `<span class="warn">${L.pondWhere(S)}里鱼放满了，等着</span>` : '准备出门钓鱼')
  : p.job !== 'scav' ? `${STAFF_JOBS[p.job]}中` : p.trip ? `拾荒中 <span data-tl="s${p.id}"></span>` : L.pileLive(S) >= STAFF.scav.pile ? '<span class="warn">物资堆满了，等着</span>' : '准备出门拾荒';
/* 头像框：品质决定框的颜色（白 / 蓝 / 紫 / 橙），左上角等级，底下品质名 */
const avatar = (p, cls = '', hide) => `<div class="sav q-${hide ? 'x' : p.q} ${cls}"><div class="in">${hide ? '<span class="qm">?</span>' : `<i class="pt pt${(p.look || 0) % 12}"></i>`}</div>${hide ? '' : `<em class="lvb">Lv${p.lv}</em><em class="qn">${STAFF.qual[p.q].name}</em>`}<s class="c1"></s><s class="c2"></s></div>`;
/* V1.11 用户：员工详情页右上角的「关闭」换成「返回」（回员工列表），不另放返回按钮 */
function setCloseBtn(back) { const b = document.querySelector('#panel .px[data-close]'); if (!b || b.dataset.back === (back || '')) return; b.dataset.back = back || '';
  if (back) { b.dataset.open = back; b.innerHTML = '‹ 返回' } else { delete b.dataset.open; b.innerHTML = `<i class="hi" style="--ic:url(${A('img/ui/icons/cross.png')})"></i>关闭` } }
export const setStaffSel = id => { staffSel = id };
export const pendingStaff = () => ctx && ctx.S() && ctx.S().pendingStaff;
export const setPendingStaff = p => { const S = ctx && ctx.S(); if (S) S.pendingStaff = p };
const TITLES = { hero: '角色', msg: '消息', fishLic: '垂钓证', mall: '商城', staff: '员工', staffOne: '员工', staffFull: '营地住满了', staffNew: '新员工到了', td: '尸潮', bag: '背包', stock: '仓库', build: '建造', shelf: '货架', menu: '设置', log: '开发者说明', stats: '我的数据', tasks: '升级任务', farm: '温室和果园', pond: '池塘', mys: '神秘商人', friends: '好友', ws: '工坊' };
/* 面板内容只在真正变了的时候重画（每帧重画会让 iPhone 上的按钮点不到）；进度条、倒计时单独更新 */
/* 0.27：手指按着面板的时候不重画（重画会把按下去的按钮换掉，松手时点击就丢了，看起来像按钮点不动） */
let pHold = false, pUpAt = 0;
addEventListener('pointerdown', () => { pHold = true }, true);
addEventListener('pointerup', () => { pHold = false; pUpAt = performance.now() }, true);
addEventListener('pointercancel', () => { pHold = false; pUpAt = performance.now() }, true);
export function refreshPanel(force) {
  if (!cur) return; const S = ctx.S(); if (!S) return;
  if (!force && (pHold || performance.now() - pUpAt < 350)) return;
  if (CHAT.composing()) return;                                     // 0.40：正在用输入法打中文，先别重画
  PMETA = null; const html = PANELS[cur](S);
  { const r = $('#pres'), h = $('#phelp'); if (r) r.innerHTML = PMETA ? PMETA.res : ''; if (h) h.classList.toggle('hidden', !(PMETA && PMETA.help)); if (PMETA && PMETA.help) $('#phelpBox').innerHTML = PMETA.help; $('#pbody').classList.toggle('framed', !!PMETA); $('#panel .pbox').classList.toggle('framed', !!PMETA) }
  if (force || html !== lastBody) { lastBody = html; setCloseBtn(cur === 'staffOne' ? 'staff' : null); $('#ptitle').textContent = cur === 'mall' && mallAt ? (mallAt === 'far' ? '商人（钓鱼区，贵 20%）' : '商人') : TITLES[cur]; const b = $('#pbody'), st = b.scrollTop, ae = document.activeElement, fid = ae && b.contains(ae) && ae.id, sel = fid && ae.selectionStart; if (!(PMETA && morphPF(b, html))) b.innerHTML = html; b.scrollTop = st;
    if (fid) { const n = b.querySelector('#' + fid); if (n) { n.focus(); try { n.setSelectionRange(sel, sel) } catch (e) {} } }   // 0.40 聊天：重画面板时输入框不丢焦点
    const lg = b.querySelector('#chatLog'); if (lg) lg.scrollTop = lg.scrollHeight;
    const ci = b.querySelector('#chatIn'); if (ci) ci.value = CHAT.CH.draft; const ca = b.querySelector('#chatAdd'); if (ca) ca.value = CHAT.CH.addName }
  keepScroll();
  { const tb = $('#pbody').querySelector('.pf-tabs'), on = tb && tb.querySelector('.pf-tab.on');   // 37：页签多了左右滑（最右边渐隐），选中的那个滑到看得见
    if (on && (on.offsetLeft < tb.scrollLeft || on.offsetLeft + on.offsetWidth > tb.scrollLeft + tb.clientWidth)) tb.scrollLeft = on.offsetLeft < tb.scrollLeft ? Math.max(0, on.offsetLeft - 12) : on.offsetLeft + on.offsetWidth - tb.clientWidth + 40;
    if (tb) tb.classList.toggle('more', tb.scrollLeft + tb.clientWidth < tb.scrollWidth - 4) }
  if (cur === 'hero' && ctx.heroMount) ctx.heroMount($('#pbody').querySelector('#heroView'));
  if (cur === 'gear' && ctx.heroMount) { const el = $('#pbody').querySelector('[data-heromount]'); if (el) ctx.heroMount(el) }   /* 设计 63：用户 10-22 定装备页主角空手（设计 36 的「手里拿武器」作废） */   // 设计 56：装备页左边的主角（端着枪）   // 角色面板：把 3D 预览的画布放进去（画布一直留着，重画面板不重建）
  $('#pbody').querySelectorAll('[data-bbar]').forEach(n => { const b = S.builds[+n.dataset.bbar]; if (b) n.style.width = (1 - b.left / b.total) * 100 + '%' });
  $('#pbody').querySelectorAll('[data-bleft]').forEach(n => { const b = S.builds[+n.dataset.bleft]; const v = b ? fmtT(b.left) : ''; if (n.textContent !== v) n.textContent = v });
  $('#pbody').querySelectorAll('[data-coin]').forEach(n => { const v = fmtN(S.coins); if (n.textContent !== v) n.textContent = v });
  /* 菜地、果树的倒计时和进度条：只改文字和宽度，不重画整个面板（不然 iPhone 上点不中格子、关不掉） */
  const b = $('#pbody'), get = k => k[0] === 'p' ? S.plots[+k.slice(1)] : k[0] === 's' ? (S.staff.find(x => x.id === +k.slice(1)) || {}).trip : S.trees[+k.slice(1)];
  b.querySelectorAll('[data-tl]').forEach(n => { const x = get(n.dataset.tl); const v = x ? fmtT(Math.max(0, x.left)) : ''; if (n.textContent !== v) n.textContent = v });
  b.querySelectorAll('[data-tw]').forEach(n => { const x = get(n.dataset.tw); const v = x ? Math.round((1 - x.left / x.total) * 100) + '%' : '0%'; if (n.style.width !== v) n.style.width = v });
}

/* 29d：建造详情里超市那条太长，解锁商品只写几种，名单放进「?」 */
const lockShort = w => /前一关/.test(w) ? '前一关' : /普通第 (\d+) 关/.test(w) ? `普通${w.match(/普通第 (\d+) 关/)[1]}关` : /超市 (\d+) 级/.test(w) ? `超市${w.match(/超市 (\d+) 级/)[1]}级` : w;
/* 设计 31：原料的用处（仓库详情写）：「原料：在木工台做成木炭、手电筒、火炬」 */
const rawUse = g => { const by = {}; for (const [k, M] of Object.entries(MACH)) for (const r of M.recipes) if (r.need[g]) (by[BUILD[k].name] = by[BUILD[k].name] || []).push(GOODS[r.out].name);
  for (const [d, nd] of Object.entries(DISHES)) if (nd[g]) (by['厨房'] = by['厨房'] || []).push(GOODS[d].name);
  return '原料，顾客不买：' + Object.entries(by).map(([m, l]) => `在${m}做成${l.join('、')}`).join('；') };
const effDet = (k, lv) => { if (k !== 'store') return effTxt(k, lv); const c = STORE[lv], nu = GOOD_IDS.filter(g => (GOODS[g].unlock || 1) === lv);
  return `${c.name}：店面更大、能多放货柜${c.traffic > 1 ? `，顾客 ×${c.traffic}` : ''}${nu.length && lv > 1 ? `；解锁 ${nu.length} 种新商品` : ''}${lv === 2 ? '；解锁温室' : lv === 3 ? '；开放工坊、果园、冰柜' : ''}` };
const effTxt = (k, lv) => {
  if (k === 'store') { const c = STORE[lv], nu = GOOD_IDS.filter(g => (GOODS[g].unlock || 1) === lv); return `${c.name}：店面更大、能多放货柜${c.traffic > 1 ? `，顾客 ×${c.traffic}` : ''}${nu.length && lv > 1 ? `<br>解锁商品：${nu.map(g => GOODS[g].name).join('、')}` : ''}${lv === 2 ? '<br>解锁温室，蔬菜能上架' : lv === 3 ? '<br>开放工坊（南边）、东门换自动门，解锁果园、冰柜' : ''}` }
  if (k === 'gh') { const g = GREENHOUSE[lv]; return `${g.plots} 格菜地${g.speed > 1 ? `，长得快 ${Math.round((g.speed - 1) * 100)}%` : ''}` }
  if (k === 'orchard') return `${ORCHARD[lv]} 个树位`;
  if (k === 'rec') { const r = RECYCLER[lv]; return `每件 ${r.time} 秒，排队 ${r.queue} 件<br>3倍 ${Math.round(r.x3 * 100)}%　暴击 ${Math.round(r.x10 * 100)}%　变宝 ${Math.round(r.gem * 100)}%` }
  if (FIXTURE[k]) { const f = FIXTURE[k]; return `${f.note}<br>低档放 ${f.kinds ? `${f.kinds[0]} 种、每种 ` : ''}${f.cap[0]} 件，可以在「货架」页升档${f.mult[0] > 1 ? `；售价 ×${f.mult[0]}` : ''}` }
  if (k === 'wh') return `每种商品最多存 ${WAREHOUSE[lv]} 个<br>满了回收机会停下、菜收不了`;
  if (k === 'pond') return `能养 ${FISHPOND.cap[lv]} 条鱼${lv > 1 ? '，池塘更大' : ''}<br>钓到的鱼自动放进来，冰柜从这里补鱼`;
  if (BUILD[k] && BUILD[k].ranch) { const R = RANCH[k], n = PEN_CAP[lv]; return `能住 ${n} 只${R.name}（住满每分钟产 ${(n * R.yield / R.cycle * 60).toFixed(1)} 个${GOODS[R.good].name}）<br>${R.name}在院子里的商人那里买，${R.price} 币一只` }
  if (BUILD[k] && BUILD[k].ws) { const t = (isKit(k) ? WS.kitchenT : (MACH[k] && MACH[k].t) || WS.machT)[lv], LN = WS.linesBy[k] || WS.lines;   // 设计 68：线数按机器
    return (isKit(k) ? `做菜（${Object.keys(DISHES).map(d => GOODS[d].name).join('、')}）<br>做好的菜放熟食柜` : '做' + MACH[k].recipes.map(r => GOODS[r.out].name + (r.also ? ' + ' + Object.keys(r.also).map(a => GOODS[a].name).join('、') : '')).join('、')) + `<br>${LN[lv]} 条线同时做${lv > 1 && LN[lv - 1] !== LN[lv] ? `（${LN[lv - 1]} → ${LN[lv]} 条线）` : ''}，一个 ${t} 秒` }   // 0.42 工坊
  if (k === 'camp') return `${lv} 级宿舍楼，住 ${STAFF.campCap[lv] || lv * STAFF.perTent} 个员工`;
  if (k === 'rod') { const r = FISHING.rod[lv]; return `耐久上限 ${r.dur}${r.ctrl > 1 ? `，拉力条更好控制` : ''}${r.rare > 1 ? `<br>少见、稀有的鱼机会 ×${r.rare}` : ''}<br>升级完耐久补满` }
  return `${BAG_SIZES[lv]} 格，同一种东西一格叠 ${STACK} 个`;
};

const isSeedT = t => t.startsWith('seed:');
/* 丢鱼：点背包里的鱼 → 选数量 → 「丢掉」→ 再点「确定丢掉」才真的丢 */
let drop = null;   // { i, t, n, ask }
export function bagDrop(k, a) {
  const S = ctx.S(); if (!S) return;
  if (k === 'sel') { const i = +a, b = S.bag[i]; drop = drop && drop.i === i ? null : b ? { i, t: b.t, n: 1, ask: false } : null }
  else if (!drop) return;
  else if (k === 'n') { const max = S.bag[drop.i].n; drop.n = a === 'all' ? max : Math.max(1, Math.min(max, drop.n + +a)); drop.ask = false }
  else if (k === 'ask') drop.ask = true;
  else if (k === 'no') drop.ask = false;
  else if (k === 'yes') { const nm = bagName(drop.t), u = bagUnit(drop.t), n = L.dropItem(S, drop.i, drop.n); drop = null; if (n) toast(`丢掉了 ${n} ${u}${nm}`, '') }
  refreshPanel(true);
}
/* 背包里的东西：名字、量词、图标（物资、种子、鱼） */
const bagName = t => isSeedT(t) ? GOODS[t.slice(5)].name + '种子' : L.isFish(t) ? FISH[L.fishOf(t)].name : JUNK[t].name;
const bagUnit = t => isSeedT(t) ? '包' : L.isFish(t) ? '条' : '个';
const bagIcon = t => isSeedT(t) ? icon('seed', t.slice(5)) : L.isFish(t) ? icon('fish', L.fishOf(t)) : icon('junk', t);
function dropHTML(S) {
  if (!S.bag.length) return '';
  if (!drop || !S.bag[drop.i] || S.bag[drop.i].t !== drop.t) { drop = null; return '<p class="note">点一格东西，可以丢掉不要的。</p>' }
  const b = S.bag[drop.i], nm = bagName(b.t), u = bagUnit(b.t);
  if (drop.ask) return `<div class="dropbar warn"><b>确定丢掉 ${drop.n} ${u}${nm}？丢了就没了。</b><button class="btn" data-act="bagDrop" data-arg="yes">确定丢掉</button><button class="btn ghost" data-act="bagDrop" data-arg="no">取消</button></div>`;
  return `<div class="dropbar">${bagIcon(b.t)}<b>${nm}</b><button class="btn sm ghost" data-act="bagN" data-arg="-1" ${drop.n > 1 ? '' : 'disabled'}>−</button><b class="dn">${drop.n}</b><button class="btn sm ghost" data-act="bagN" data-arg="1" ${drop.n < b.n ? '' : 'disabled'}>＋</button><button class="btn sm ghost" data-act="bagN" data-arg="all">全部 ${b.n}</button><button class="btn" data-act="bagDrop" data-arg="ask">丢掉</button></div>`;
}
const fishSub = S => { const q = FISH_IDS.filter(id => (S.fishQ || {})[id] > 0); return q.length ? q.map(id => `${FISH[id].name}${S.fishQ[id]}`).join(' ') : '按每条鱼的价钱卖' };
/* 商城里的钓鱼区：垂钓证、饵料、新鱼竿（钓鱼区商人贵 20%） */
const lvTxt = (k, lv) => k === 'bag' ? BAG_SIZES[lv] : lv;
const showGood = (S, g) => g !== 'fish' && !GOODS[g].gone && (S.stock[g] > 0 || L.isOnShelf(S, g) || (L.unlocked(S, g) && ((!GOODS[g].fresh && !GOODS[g].ranch && !GOODS[g].craft && !GOODS[g].dish) || L.wanted(S).includes(g))));   /* 0.28 牧场产品：收到过才显示 */   // 0.22：鱼在池塘面板看，仓库里不显示
/* ---------- 0.31 星星（设计/17）和神秘商人（设计/16） ---------- */
const starIc = { toString: () => `<img class="staric" src="${A('img/ui/icons/star_gold.png')}" alt="">` };   /* 设计 75：用的时候才算网址 */
let mallTab = 'shop';
/* 设计 45：「有 N 样货没上架」：跳到第一个能放它的货柜（空着的那格优先） */
export function shelfMiss(S) {
  const miss = L.notOnShelf(S); if (!miss.length) return; const x = miss[0];
  let i = S.shelves.findIndex(sh => canHold(sh.type || 'shelf', x) && L.slotsOf(sh).some(sl => !sl.g)); if (i < 0) i = S.shelves.findIndex(sh => canHold(sh.type || 'shelf', x)); if (i < 0) return;
  const g = gst('shelf'); g.tab = S.shelves[i].type || 'shelf'; g.sel = String(i); g.jump = true; shelfSlot = Math.max(0, L.slotsOf(S.shelves[i]).findIndex(sl => !sl.g)); refreshPanel(true);
}
export const setMallTab = t => { mallTab = t; gst('mall').tab = { shop: 'sup', animal: 'ani' }[t] || t; gst('mall').sel = null };
/* 设计 56：副本相关的面板在 fbui.js，开局时并进来 */
export function addPanels(P, T) { Object.assign(PANELS, P); Object.assign(TITLES, T) }
const PANELS = {
  /* 尸潮：尸潮券、今天的次数、选关开打；塔位（建塔、升级、卖） */
  /* 尸潮（设计 29d）：10 关 5 × 2 格子，右边详情：几波、Boss、打赢奖励、员工机会、开打（设计 56：英雄本页签去掉了，副本从传送门进） */
  td(S) {
    const left = L.tdLeft(S), tdNeed = BUILD.store.levels[S.lv.store + 1] && BUILD.store.levels[S.lv.store + 1].td;
    const hero = false, base = 0, Qn = q => `<b style="color:${STAFF.qual[q].color}">${STAFF.qual[q].name}</b>`, pc = x => +(x * 100).toFixed(1) + '%';
    const scrollIc = icon('it', 'scroll');
    const bossOf = T => { const c = {}; for (const w of T.waves) for (const [k, n] of w) if (k === 'boss' || k === 'miniboss') c[k] = (c[k] || 0) + n; return c };
    const cells = Array.from({ length: TD_MAX }, (_, i) => base + i + 1).map(lv => { const T = tdLevel(lv), won = S.td.wins[lv] > 0, lock = L.tdLockWhy(S, lv), fq = !hero && !won && STAFF.td.first[lv];
      const st = lock ? `<span class="tdst lk">🔒 ${lockShort(lock)}</span>` : '';   /* 设计 87：去掉「✓ 打赢过」「能打」，只留锁 */
      return { id: String(lv), cls: 'tdcell' + (lock ? ' locked' : '') + (won ? ' won' : ''), html: `<b class="tdn">第 ${lv - base} 关</b><small>${T.waves.length} 波</small>${st}${fq ? `<span class="itag q-${fq}">必得${STAFF.qual[fq].name}</span>` : ''}` } });
    const detail = id => { const lv = +id, T = tdLevel(lv), won = S.td.wins[lv] > 0, why = L.tdCanStart(S, lv), lock = L.tdLockWhy(S, lv), n = lv - base, tool = TD.tool[n] || 0, m = won ? TD.repeat : 1, b = bossOf(T);
      const fq = STAFF.td.first[lv], o = L.tdStaffOdds(lv);
      const staff = hero ? '' : `<div class="drow"><span>员工</span><b class="nw">${!won && fq ? `第一次打赢必得${Qn(fq)}` : o ? `${Qn('p')} ${pc(o[0])}　${Qn('l')} ${pc(o[1])}` : '不出'}</b></div>`;
      return `<h5>${hero ? '英雄 ' : ''}第 ${n} 关<small>${T.waves.length} 波${T.hp > 1 ? ` · 丧尸血 ×${+T.hp.toFixed(2)}` : ''}</small></h5>
        <div class="drow"><span>Boss</span><b>${[b.boss ? `Boss ×${b.boss}` : '', b.miniboss ? `小 Boss ×${b.miniboss}` : ''].filter(Boolean).join('　') || '没有'}</b></div>
        <div class="dsub">打赢奖励${won ? '<span class="warn">（打赢过，奖励减半）</span>' : ''}</div>
        <div class="dcost"><span class="cic"><i class="ico-coin"></i>${Math.round(T.coins * m)}</span>${!won && tool ? `<span class="cic">${icon('tr', 'toolbox')}${tool}</span>` : ''}</div>
        ${staff}
        <div class="drow"><span>尸潮券</span><b class="${S.td.scrolls >= 1 ? '' : 'lack'}">我有 ${S.td.scrolls} 张 / 要 1 张</b></div>
        ${why ? `<p class="note warn">${why}</p>` : ''}${why === L.SCROLL_SHORT ? `<button class="btn grey" data-act="needScroll">开打　<span class="cic">${scrollIc}1</span></button>` : `<button class="btn" data-act="tdGo" data-arg="${lv}" ${why ? 'disabled' : ''}>开打　<span class="cic">${scrollIc}1</span></button>`}` };
    return frame('td', { cols: 5, rows: 2, cells, detail, dw: 220,
      empty: '<p class="note">点一关看奖励、员工机会，再开打。</p><p class="note">塔在「建造」→「塔」里建、升级。</p>',
      top: `<span>${tdNeed ? `超市升 ${S.lv.store + 1} 级要通关第 ${tdNeed} 关${L.tdCleared(S) >= tdNeed ? ' ✓' : `（现在 ${L.tdCleared(S)} 关）`}` : `通关到第 ${L.tdCleared(S)} 关`}</span><span>尸潮券在院子商人那里买</span>`,
      res: resChip(scrollIc, S.td.scrolls) + `<span class="rchip"><b>今天 ${left}/${TD.daily}</b></span>`,
      help: `<b>尸潮</b><p>每关用 1 张尸潮券，每天最多打 ${TD.daily} 次（北京时间 0 点重置，输了也算）。打的时候超市暂停营业；丧尸从东边大门进来，守住超市门口的防线。主角会自动开枪，被围住血会掉，躲进店里丧尸进不来、回血更快；站到路障旁边能修路障。</p><p>要按顺序打，后面几关还要超市等级。打赢过的关再打奖励减半。</p><p>员工：第一次打赢第 3 关必得史诗、第 5 关必得传说；之后打赢普通第 3 关以上也有机会得到，关卡越高机会越大。</p><p>副本（打 BOSS 掉装备）不在这里：走到院子商人那边的传送门。</p><p>超市升 4 级要通关第 5 关，升 5 级要通关第 9 关。塔在「建造」→「塔」里建、升级。</p>` });
  },
  /* 背包（0.21 学星露谷）：上面一条是钱包（末日币、发条、饵料、鱼竿，不占格子）；下面是方格子，图标居中、数量在右下角，点一格在下面显示名字、可以丢 */
  bag(S) {
    const cap = L.bagCap(S), parts = new Set(S.bag.map(b => b.t)).size < S.bag.length;
    if (drop && (!S.bag[drop.i] || S.bag[drop.i].t !== drop.t)) drop = null;
    const cell = (b, i) => { if (!b) return '<div class="bslot"></div>';
      return `<div class="bslot pick${drop && drop.i === i ? ' on' : ''}" data-act="bagSel" data-arg="${i}" title="${bagName(b.t)}">${bagIcon(b.t)}<div class="bc">${b.n}</div></div>` };
    const w = (ic, nm, n) => `<div class="wchip">${ic}<span class="wn">${nm}</span><b>${n}</b></div>`;
    return `<div class="bwallet">${w('<span class="icon" style="background:none"><i class="ico-coin" style="width:22px;height:22px"></i></span>', '末日币', '<span data-coin></span>')}${w(icon('it', 'gear'), GEAR.name, S.gear)}${''}
        ${S.fishLic ? w(icon('it', 'worm'), '蚯蚓', S.bait.worm || 0) + w(icon('it', 'corn'), '玉米饵', S.bait.corn || 0) + w(icon('it', 'rod'), `鱼竿 ${S.lv.rod || 1} 级`, S.rodDur) : ''}</div>
      <div class="sec"><h4>背包 ${S.bag.length}/${cap} 格<button class="btn sm" data-act="sortBag" ${S.bag.length > 1 || parts ? '' : 'disabled'}>整理</button></h4>
      <div class="bslots">${Array.from({ length: cap }, (_, i) => cell(S.bag[i], i)).join('')}</div>${dropHTML(S)}</div>`;
  },
  /* 0.22 池塘：每种鱼几条；冰柜会自动从这里捞鱼上架 */
  pond(S) {
    const cap = L.pondCap(S), n = S.stock.fish || 0, q = S.fishQ || {}, onShelf = L.onShelves(S, 'fish');
    const ids = FISH_IDS.filter(id => q[id] > 0).sort((a, b) => FISH[b].price - FISH[a].price);
    const head = S.lv.pond ? `池塘 ${S.lv.pond} 级：<b>${n}/${cap}</b> 条` : `还没盖池塘，鱼先放在水桶里：<b>${n}/${cap}</b> 条　<span class="note">在「建造」里盖池塘（超市 3 级）</span>`;
    const rows = ids.map(id => { const F = FISH[id], R = FISH_RAR[F.rar];
      return `<div class="cell">${icon('fish', id)}<div><div class="nm">${F.name} <small style="color:${R.color === '#e4e8ee' ? 'var(--dim)' : R.color}">${R.name}</small></div><div class="sub"><span>每条 ${F.price} 末日币</span></div></div><div class="n">${q[id]}<small> 条</small></div></div>` }).join('');
    return `<div class="sec"><h4>${head}${S.lv.pond && S.lv.pond < 3 ? '<button class="btn sm ghost" data-open="build">升级池塘</button>' : ''}</h4>
      ${rows ? `<div class="grid">${rows}</div>` : '<p class="note">还没有鱼。去码头坐船到钓鱼区钓，或者派员工去钓。</p>'}</div>
      <p class="note">钓到的鱼坐船回来、员工钓鱼回来都会自动放进${L.pondWhere(S)}；冰柜选「鱼」就会自动从这里捞鱼上架${onShelf ? `（冰柜上现在 ${onShelf} 条）` : ''}。${L.hasType(S, 'fridge') ? '' : '还没有冰柜：在「建造」里买一个才能卖鱼。'}</p>`;
  },
  /* 仓库（设计 29 框架）：分页 货物 / 种子 / 珍品 / 钓鱼用品（没有的不显示）；格子 = 图标 + 数量；右边详情：价格、用途、丢掉 / 卖 */
  stock(S) {
    const srt = !!S.whSort, ord = (ids, n) => srt ? ids.filter(id => n(id) > 0).sort((a, b) => n(b) - n(a)) : ids, cap = L.whCap(S);
    const gcat = g => { const G = GOODS[g]; return G.raw ? 4 : G.fresh ? 3 : G.dish ? 2 : G.craft ? 1 : 0 };   // 35b：普通商品 → 工坊加工品 → 菜 → 蔬果 → 原料
    const goods = ord(GOOD_IDS.filter(g => showGood(S, g)).sort((a, b) => gcat(a) - gcat(b)), g => S.stock[g]), seeds = ord(CROP_IDS.filter(c => S.seeds[c] > 0), c => S.seeds[c]);
    const trs = ord(TREASURE_IDS.filter(id => !TREASURE[id].tree || S.treas[id] > 0), id => S.treas[id]);
    const tabs = [{ id: 'g', name: '货物' }]; if (seeds.length) tabs.push({ id: 's', name: '种子' }); tabs.push({ id: 't', name: '珍品' }); if (S.fishLic) tabs.push({ id: 'f', name: '钓鱼用品' });
    const g = gst('stock'); if (!tabs.find(t => t.id === g.tab)) g.tab = 'g';
    const C = (id, ic, nm, n, extra = '', cls = '') => ({ id, cls: 'icell ' + cls, html: `${ic}<div class="in">${n}</div><div class="inm">${nm}</div>${extra}` });
    let cells = [], detail = null, empty = '';
    if (g.tab === 'g') {
      cells = goods.map(id => C(id, icon('good', id), GOODS[id].name, `${S.stock[id]}<small>/${cap}</small>`, (S.stock[id] || 0) >= L.stockCap(S, id) ? '<span class="itag full">满</span>' : GOODS[id].raw ? '<span class="itag raw">原料</span>' : (S.stock[id] || 0) <= 0 ? '<span class="itag">紧缺</span>' : L.isShort(S, id) ? '<span class="itag hot">涨价</span>' : '', L.whFull(S, id) ? 'full' : ''));
      detail = id => { if (!whDrop || whDrop.g !== id) whDrop = { g: id, n: 1 }; const have = S.stock[id]; whDrop.n = Math.max(1, Math.min(whDrop.n, have || 1));
        return `<h5>${icon('good', id)} ${GOODS[id].name}${GOODS[id].raw ? '<span class="itag raw">原料</span>' : have <= 0 ? '<span class="itag">紧缺</span>' : ''}${L.isShort(S, id) ? '<span class="itag hot">涨价 ×1.5</span>' : ''}</h5><div class="drow"><span>仓库</span><b>${have}/${cap}</b></div>${GOODS[id].raw ? `<p class="note">${rawUse(id)}</p>` : `<div class="drow"><span>货架上</span><b>${L.onShelves(S, id)}</b></div><div class="drow"><span>售价</span><b>${L.priceOf(S, id)}</b></div>`}
          ${have > 0 ? `<div class="dsub">丢掉一些（仓库满了用）</div><div class="dstep">${[-10, -1].map(d => `<button class="btn sm ghost" data-act="whN" data-arg="${d}" ${whDrop.n > 1 ? '' : 'disabled'}>${d}</button>`).join('')}<b>${whDrop.n}</b>${[1, 10].map(d => `<button class="btn sm ghost" data-act="whN" data-arg="${d}" ${whDrop.n < have ? '' : 'disabled'}>+${d}</button>`).join('')}</div><div class="dstep"><button class="btn sm ghost" data-act="whN" data-arg="all">全部</button><button class="btn sm" data-act="whDo">丢掉</button></div>` : ''}` };
      empty = `<p class="note">货架会自动从仓库补货。点一样货看价格，也能丢掉一些。</p>`;
    } else if (g.tab === 's') {
      cells = seeds.map(id => C(id, icon('seed', id), GOODS[id].name, S.seeds[id]));
      detail = id => `<h5>${icon('seed', id)} ${GOODS[id].name}种子</h5><div class="drow"><span>有</span><b>${S.seeds[id]}</b></div><div class="drow"><span>长成</span><b>${fmtT(CROPS[id].time)}</b></div><div class="drow"><span>每次收</span><b>${CROPS[id].yield} 个</b></div><p class="note">在温室里种。</p>`;
      empty = '<p class="note">种子在拾荒区捡、顾客给的小费、收菜时多得的。</p>';
    } else if (g.tab === 't') {
      cells = trs.map(id => C(id, icon('tr', id), TREASURE[id].name, S.treas[id]));
      detail = id => `<h5>${icon('tr', id)} ${TREASURE[id].name}</h5><div class="drow"><span>有</span><b>${S.treas[id]}</b></div><div class="drow"><span>收购价</span><b>${TREASURE[id].sell}</b></div>${TREASURE[id].tree ? '<p class="note">种在果园。</p>' : '<p class="note">升级要用，也能卖。</p>'}<button class="btn" data-act="sell" data-arg="${id}" ${S.treas[id] > 0 ? '' : 'disabled'}>卖 1 个</button>`;
      empty = '<p class="note">珍品是回收机变宝得到的，升级要用，也能卖给收购商。</p>';
    } else {
      const F = { worm: ['蚯蚓', S.bait.worm || 0, '近岸、桥下用'], corn: ['玉米饵', S.bait.corn || 0, '深水、桥下用'], rod: [`鱼竿 ${S.lv.rod || 1} 级`, `${S.rodDur}<small>/${L.rodCfg(S).dur}</small>`, '耐久用完要修（院子商人）'] };
      cells = Object.keys(F).map(id => C(id, icon('it', id), F[id][0], F[id][1], '', id === 'rod' && S.rodDur <= 3 ? 'full' : ''));
      detail = id => `<h5>${icon('it', id)} ${F[id][0]}</h5><div class="drow"><span>${id === 'rod' ? '耐久' : '有'}</span><b>${F[id][1]}</b></div><p class="note">${F[id][2]}。不占背包，买了随时能用。</p>`;
      empty = '<p class="note">钓鱼用品不占背包，买了随时能用。</p>';
    }
    if (g.tab !== 'g' && whDrop) whDrop = null;
    return frame('stock', { tabs, topInTabs: true, cols: 5, rows: 2, cells, detail, empty, none: '还没有',
      top: `<span>仓库 ${S.lv.wh || 1} 级，每种最多 ${cap} 个</span><button class="btn sm ${srt ? 'ghost' : ''}" data-act="sortWh">${srt ? '按种类排' : '整理'}</button>`,
      res: resChip('<i class="ico-coin"></i>', Math.floor(S.coins)) + resChip(icon('tr', 'toolbox'), S.treas.toolbox || 0),
      help: '<b>仓库</b><p>货架会自动从仓库补货；每种货最多存的数量看仓库等级。</p><p>「整理」：按数量从多到少排，0 个的先收起来；再点一次回到按种类排。</p><p>仓库满了收不了菜、回收机会停下：点一样货可以丢掉一些。</p><p>种子在拾荒区捡、顾客给的小费、收菜时多得的；珍品是回收机变宝得到的，升级要用，也能卖。钓鱼用品不占背包。</p>' });
  },
  /* 建造（设计 29b）：上面一条施工队（每队在忙什么、还要多久、用发条），下面能建的东西一样一格（花费图标、没解锁的上锁写条件），右边详情 */
  build(S) {
    const cn = L.crews(S), nx = L.crewNext(S);
    const what = b => { const bb = BUILD[b.k]; return b.k === 'tower' && S.towers[b.i] ? `${b.i + 1} 号${TOWERS[S.towers[b.i].k].name}${b.to === 1 ? '' : ` → ${b.to} 级`}` : b.k === 'tier' && S.shelves[b.i] ? `${b.i + 1} 号货柜 → ${TIER_NAME[b.to]}` : `${bb.name} → ${lvTxt(b.k, b.to)}` };
    const crew = [...Array(cn)].map((_, j) => { const b = S.builds[j]; if (!b) return '<div class="crew idle">🔨 空闲</div>';
      return `<div class="crew"><span class="cw">🔨 ${what(b)}</span><div class="prog"><i data-bbar="${j}"></i></div><span class="cl" data-bleft="${j}"></span><button class="btn sm ${S.gear ? '' : 'ghost'}" data-act="gear" data-arg="${j}" ${S.gear ? '' : 'disabled'} title="用发条 −${Math.round(GEAR.cut / 60)} 分钟">${icon('it', 'gear')}</button></div>` }).join('');
    /* 设计 45 顺手改：施工队一个一行（第一行「施工队 N/M」+【多雇】），放在左边格子上面，跟着一起拉 */
    const lead = `<div class="crews2"><div class="crh"><b>施工队 ${S.builds.length}/${cn}</b>${nx != null ? '<button class="btn sm ghost" data-act="toMerch" data-arg="crew">多雇</button>' : ''}</div>${crew}</div>`;
    const tabs = [{ id: 'b', name: '建筑' }, { id: 'r', name: '牧场' }, { id: 'w', name: '工坊' }, { id: 't', name: '塔' }];
    const g = gst('build'); if (!tabs.find(t => t.id === g.tab)) g.tab = 'b';
    const title = k => { const b = BUILD[k]; return b.main ? `超市 · ${STORE[S.lv[k]].name}` : b.name };
    let cells, detail;
    if (g.tab !== 't') {
      const list = g.tab === 'r' ? RANCH_IDS : g.tab === 'w' ? WS_IDS : BUILD_ORDER;
      cells = list.map(k => { const inf = L.buildInfo(S, k), b = BUILD[k], cur = S.lv[k], bk = L.busyWith(S, k);
        const fx = !!FIXTURE[k], lv = fx ? `已有 ${cur || 0} 个` : cur ? `${lvTxt(k, cur)} ${b.unit}` : '没盖';   // 设计 39：货柜不限数量，写「已有 N 个」
        const foot = bk ? '<span class="bst">建造中…</span>' : inf.max ? '<span class="bst">满级</span>' : inf.locked || inf.needStore ? `<span class="block">🔒 ${inf.lack[0]}</span>` : `<span class="bcost">${costIc(S, { coins: inf.cost.coins, need: inf.cost.need }, false)}</span>`;
        return { id: k, cls: 'bdcell' + (inf.locked || inf.needStore ? ' locked' : '') + (inf.ok && !bk ? ' can' : ''), html: `${icon('bd', k)}<b class="bdn">${b.main ? '超市' : b.name}</b><small>${lv}${fx ? '' : !inf.max && !bk && inf.to ? ` → ${lvTxt(k, inf.to)}` : bk ? ` → ${lvTxt(k, bk.to)}` : ''}</small>${foot}${inf.ok && !bk ? '<span class="itag ok">能建</span>' : ''}` } });
      detail = k => { const inf = L.buildInfo(S, k), b = BUILD[k], cur = S.lv[k], bk = L.busyWith(S, k), lvShow = cur ? `${lvTxt(k, cur)} ${b.unit}` : '还没盖';
        const h = `<h5>${icon('bd', k)} ${title(k)}</h5>`;
        if (bk) return h + `<div class="drow"><span>等级</span><b>${lvShow} → ${lvTxt(k, bk.to)}</b></div><div class="deff"><b class="dk">建好以后：</b>${effDet(k, bk.to)}</div><p class="note">建造中，看上面的施工队。</p>`;
        if (inf.max) return h + `<div class="drow"><span>等级</span><b>${lvShow}（满级）</b></div><div class="deff">${cur ? effDet(k, cur) : ''}</div>`;
        const tasks = b.main ? (() => { const ts = L.stageTasks(S), d = ts.filter(t => S.tasks[t.id]).length; return `<div class="drow"><span>任务</span><b>${d}/${ts.length}</b>${d < ts.length ? '<button class="btn sm ghost un" data-open="tasks">看任务</button>' : ' ✓'}</div>` })() : '';
        const lock = inf.locked || inf.needStore;
        return h + (FIXTURE[k] ? `<div class="drow"><span>数量</span><b>已有 ${cur || 0} 个，买第 ${inf.to} 个</b></div>` : `<div class="drow"><span>等级</span><b>${lvShow} → ${lvTxt(k, inf.to)} ${b.unit}</b></div>`) + `<div class="deff"><b class="dk">建好以后：</b>${effDet(k, inf.to)}</div>${tasks}
          ${lock ? `<p class="note warn">🔒 ${inf.lack[0]}</p>` : `<div class="dcost">${costIc(S, inf.cost)}</div><button class="btn" data-act="build" data-arg="${k}" ${inf.ok ? '' : 'disabled'}>${L.crewFull(S) ? '施工队都在忙' : inf.ok ? '开始建造' : b.main && !L.allTasksDone(S) ? '任务没完成' : '材料不够'}</button>`}` };
    } else {
      cells = S.towers.map((t, i) => ({ id: String(i), cls: 'bdcell', html: t ? `${icon('tw', t.k)}<b class="bdn">${i + 1} 号 ${TOWERS[t.k].name}</b><small>${t.lv < 1 ? '建造中' : t.lv + ' 级'}</small>${L.busyWith(S, 'tower', i) ? '<span class="bst">施工中…</span>' : ''}` : `<span class="tw0">＋</span><b class="bdn">${i + 1} 号塔位</b><small>空着</small>` }));
      detail = id => { const i = +id, t = S.towers[i];
        if (!t) { const cf = L.crewFull(S); return `<h5>${i + 1} 号塔位（空）</h5><div class="dsub">${cf ? '<span class="warn">施工队都在忙，等一会儿再建</span>' : '选一种塔建上'}</div>${TOWER_IDS.map(k => { const T = TOWERS[k], ok = !cf && S.coins >= T.build; return `<button class="btn sm twb" data-act="towerBuild" data-arg="${i}:${k}" ${ok ? '' : 'disabled'}><img class="twi" src="${A(`img/icons/tw_${k}.png`)}" alt="">${T.name}<span class="cic${S.coins >= T.build ? '' : ' lack'}"><i class="ico-coin"></i>${T.build}</span><span class="cic tm">⏱${fmtT(T.time)}</span></button>` }).join('')}` }
        const T = TOWERS[t.k], inf = L.towerInfo(S, i), busy = !!L.busyWith(S, 'tower', i);
        return `<h5>${icon('tw', t.k)} ${i + 1} 号 ${T.name}<small>${t.lv < 1 ? '建造中' : t.lv + ' 级'}</small></h5><div class="deff">${T.desc}</div>
          ${busy ? '<p class="note">施工中，看上面的施工队。</p>' : inf.max ? '<p class="note">已满级</p>' : `<div class="dsub">升到 ${inf.to} 级</div><div class="dcost">${costIc(S, inf.cost)}</div>`}
          <div class="dbtns">${busy || inf.max ? '' : `<button class="btn sm" data-act="towerUp" data-arg="${i}" ${inf.ok ? '' : 'disabled'}>升级</button>`}<button class="btn sm ghost bye" data-act="towerSell" data-arg="${i}" ${busy ? 'disabled' : ''}>卖掉</button></div>` };
    }
    const cr = L.working(S, 'craft').length, nb = L.wsBuilt(S).length, fd = L.working(S, 'feed').length, nr = L.ranchLive(S).length;
    const warn = g.tab === 'w' && cr && L.wsServed(S).length < nb ? '工匠不够' : g.tab === 'w' && !cr && nb ? '工匠不够' : g.tab === 'r' && L.ranchServed(S).length < nr ? '饲养员不够' : '';   // 设计 47：一人管几台看品质
    const trs = [...new Set(BUILD_ORDER.flatMap(k => BUILD[k].levels.filter(Boolean).flatMap(l => Object.keys(l.need || {}))))].filter(id => TREASURE[id]);
    return frame('build', { tabs: tabs.map(t => t.id === g.tab && warn ? { ...t, name: `${t.name}（${warn}）` } : t), cols: 4, rows: 2, cells, detail, dw: 224, lead,
      empty: g.tab === 't' ? '<p class="note">塔位在院子里丧尸那条路两边，建了一直都在。点一个塔位建塔、升级或卖掉。</p>' : '<p class="note">点一样看建好以后有什么用、要多久、要什么材料。</p><p class="note">珍品靠回收机「变宝」获得。</p>',
      res: resChip('<i class="ico-coin"></i>', Math.floor(S.coins)) + trs.slice(0, 3).map(id => resChip(icon('tr', id), S.treas[id] || 0)).join('') + resChip(icon('it', 'gear'), S.gear || 0),
      help: `<b>建造</b>${(() => { const nl = S.lv.store + 1, nu = GOOD_IDS.filter(x => (GOODS[x].unlock || 1) === nl); return nu.length ? `<p>超市升到 ${nl} 级解锁商品：${nu.map(x => GOODS[x].name).join('、')}。</p>` : '' })()}<p>有几个施工队就能同时建几样，院子商人那里能多雇（最多 ${1 + CREW.cost.length} 个）。离线也会继续建。发条：一个让一样建造少等 ${Math.round(GEAR.cut / 60)} 分钟。</p><p>超市是主建筑：升级要先完成这一阶段的升级任务；其他建筑能升到几级要看超市等级。珍品靠回收机「变宝」获得。</p><p>牧场：在院子西边，动物要饲养员喂和收，一个饲养员管 ${FEED.perFeeder} 个棚（现在 ${fd} 个饲养员、${nr} 个棚）。动物在院子里的商人那里买。</p><p>工坊：在院子西北角（超市 3 级开放），一个工匠管 ${WS.perCraft} 台（现在 ${cr} 个工匠、${nb} 台）。你走进工坊也能自己做。机器、厨房能在「布置」里挪、转。</p><p>塔：建塔、升级都占一个施工队，可以用发条加速；卖掉退一半的钱。</p>` });
  },
  tasks(S) {
    const ts = L.stageTasks(S), lv = S.lv.store;
    if (!ts.length) return `<p>现在是 <b>${STORE[lv].name}</b>（${lv} 级）。下一阶段的任务和尸潮后 5 关一起在后面的版本开放。</p>`;
    const rows = ts.map(t => { const d = !!S.tasks[t.id], p = Math.min(t.goal, Math.floor(t.prog(S)));
      return `<div class="trow ${d ? 'done' : ''}"><div class="ck">${d ? '✓' : ''}</div><div class="tn">${t.name}<div class="tbar"><i style="width:${p / t.goal * 100}%"></i></div></div><div><div class="tp">${d ? '完成' : `${p}/${t.goal}`}</div><div class="rw">${t.reward.coins ? '+' + t.reward.coins + ' 末日币' : '发条 ×' + t.reward.gear}</div></div></div>` }).join('');
    const nx = BUILD.store.levels[lv + 1], all = L.allTasksDone(S);
    return `<p><b>${STORE[lv].name}</b> → <b>${STORE[lv + 1].name}</b>：完成下面全部任务，再交够材料，就能在「建造」里升级超市。</p><div class="tasks">${rows}</div>
      ${nx ? `<p class="note">升级材料：${nx.coins} 末日币${Object.entries(nx.need).map(([id, n]) => `、${TREASURE[id].name} ×${n}`).join('')}，施工 ${fmtT(nx.time)}</p>` : ''}
      ${all ? '<p><button class="btn" data-open="build">去建造升级超市</button></p>' : ''}`;
  },
  /* 温室和果园（设计 29d）：页签 温室 / 果园，一块地或一棵树一格（图标、进度条、能不能收），右边详情：种什么、还要多久、收获 */
  farm(S) {
    if (!S.lv.gh) return frame('farm', { cells: [], none: '温室还没盖：超市升到 2 级以后，在「建造」里盖温室', help: '<b>温室和果园</b><p>超市升到 2 级以后，在「建造」里盖温室。</p>' });
    const tabs = [{ id: 'p', name: `温室 ${S.lv.gh} 级` }]; if (S.lv.orchard) tabs.push({ id: 't', name: `果园 ${S.lv.orchard} 级` });
    const g = gst('farm'); if (!tabs.find(t => t.id === g.tab)) g.tab = 'p';
    const tree = g.tab === 't', list = tree ? S.trees : S.plots, ripeN = list.filter(x => x && x.left <= 0).length;   // 待改小问题 4：只算这个页签的
    const nm = x => tree ? `${GOODS[x.k].name}树` : GOODS[x.c].name;
    const cells = list.map((x, i) => { if (!x) return { id: String(i), cls: 'fcell empty', html: `<span class="tw0">＋</span><b class="fn">${tree ? '空树位' : '空地'} ${i + 1}</b><small>${tree ? '种树苗' : '种菜'}</small>${tree ? '' : `<small class="why">${L.EMPTY_WHY[L.plotEmptyWhy(S, i)]}</small>`}` };   // 设计 50：空着的原因
      const ripe = x.left <= 0;
      return { id: String(i), cls: 'fcell' + (ripe ? ' ripe' : ''), html: `${icon('good', tree ? x.k : x.c)}<b class="fn">${nm(x)}</b><div class="sbar"><i data-tw="${g.tab}${i}"></i></div><small>${ripe ? '熟了' : `<span data-tl="${g.tab}${i}"></span>`}</small>${ripe ? '<span class="itag ok">能收</span>' : ''}` } });
    const seeds = CROP_IDS.filter(c => L.unlocked(S, c)), saps = TREASURE_IDS.filter(id => TREASURE[id].tree && L.unlocked(S, TREASURE[id].tree));
    /* 待改小问题 2：图标上不压「种」字，下面写名字和数量；0 个的变灰但名字照样写 */
    const seedGrid = (act, arg) => `<div class="ggrid named">${seeds.map(c => { const n = S.seeds[c] || 0; return `<button class="gpick ${n ? '' : 'no'}" data-act="${act}" data-arg="${arg(c)}" ${n ? '' : 'disabled'}>${icon('good', c)}<small class="gn">${GOODS[c].name}</small><small>×${n}</small></button>` }).join('')}</div>`;
    const sapGrid = (act, i, skip) => { const l = saps.filter(sp => TREASURE[sp].tree !== skip); return l.length ? `<div class="ggrid">${l.map(sp => { const n = S.treas[sp] || 0; return `<button class="gpick ${n ? '' : 'no'}" data-act="${act}" data-arg="${i}:${sp}" ${n ? '' : 'disabled'} title="${TREASURE[sp].name}">${icon('tr', sp)}<small>${n || '没有'}</small></button>` }).join('')}</div>` : '' };
    const detail = id => { const i = +id, x = list[i];
      if (!x) return tree ? `<h5>空树位 ${i + 1}</h5><div class="dsub">种什么（树苗，回收机「变宝」得到）</div>${sapGrid('tree', i) || '<p class="note">还没解锁果树。</p>'}<div class="dlegend">灰色：没有这种树苗</div>`
        : `<h5>空地 ${i + 1}</h5><div class="dsub">种什么</div>${seedGrid('plant', c => `${i}:${c}`)}<div class="dlegend">灰色：仓库没这种种子</div>${S.staff.some(p => p.job === 'farm') ? `<div class="drow"><span>员工补种</span><button class="btn sm ghost un" data-act="plotPlan" data-arg="${i}">${(S.plotPlan || [])[i] ? GOODS[S.plotPlan[i]].name : '自动'}</button></div>` : ''}`;
      const ripe = x.left <= 0, C = tree ? TREES[x.k] : CROPS[x.c];
      return `<h5>${icon('good', tree ? x.k : x.c)} ${nm(x)}<small>${tree ? `树位 ${i + 1}` : `第 ${i + 1} 块地`}</small></h5>
        <div class="drow"><span>还要</span><b>${ripe ? '<span class="good">熟了</span>' : `<span data-tl="${g.tab}${i}"></span>`}</b></div><div class="sbar wide"><i data-tw="${g.tab}${i}"></i></div>
        <div class="drow"><span>收获</span><b>${C.yield} 个${GOODS[tree ? x.k : x.c].name}</b><em>${tree ? '每次' : '有机会 ×2、×3'}</em></div>
        ${ripe ? `<p class="note">走过去就能收，或者点下面收全部。</p><button class="btn" data-act="harvestAll" data-arg="${g.tab}">${tree ? '收全部熟了的果子' : '收全部熟了的菜'}</button>` : ''}
        ${tree ? (() => { const other = TREASURE_IDS.filter(sp => TREASURE[sp].tree && TREASURE[sp].tree !== x.k);
          return `<div class="dsub">换种别的树</div>${other.length ? `<div class="ggrid named">${other.map(sp => { const fr = TREASURE[sp].tree, op = L.unlocked(S, fr), n = S.treas[sp] || 0, ok = op && n > 0;
            return `<button class="gpick ${ok ? '' : 'no'}" data-act="treeSwap" data-arg="${i}:${sp}" ${ok ? '' : 'disabled'} title="${TREASURE[sp].name}">${icon('tr', sp)}<small class="gn">${GOODS[fr].name}树</small><small>${!op ? `超市${GOODS[fr].unlock}级` : `×${n}`}</small></button>` }).join('')}</div>` : '<p class="note">没有别的果树。</p>'}` })() : S.staff.some(p => p.job === 'farm') ? `<div class="drow"><span>员工补种</span><button class="btn sm ghost un" data-act="plotPlan" data-arg="${i}">${(S.plotPlan || [])[i] ? GOODS[S.plotPlan[i]].name : '自动'}</button></div>` : ''}` };
    const empty = tree ? '<p class="note">点一个树位种树、换种。</p><p class="note">果树苗只能从回收机「变宝」得到。</p>'
      : `<div class="dsub">选一种种子，把空地全种上</div>${seedGrid('plantAll', c => c)}<div class="dlegend">灰色：仓库没这种种子</div>`;
    return frame('farm', { tabs, topInTabs: true, cols: 5, rows: 2, cells, detail, empty, dw: 210,
      top: `<button class="btn sm" data-act="harvestAll" data-arg="${g.tab}" ${ripeN ? '' : 'disabled'}>${tree ? '收全部果子' : '收全部菜'}${ripeN ? ` ${ripeN}` : ''}</button>`,
      res: resChip('<i class="ico-coin"></i>', Math.floor(S.coins)),
      help: `<b>温室和果园</b><p>点一块空地，在右边选种子种下；没选格子时右边可以一次把空地全种上。不玩的时候菜也照样长。收菜时有机会 ×2、×3（温室、果园等级越高机会越大），还有 60% 的机会多得一包种子。种地员工收完一块地，有种子、仓库没快满就马上种回同一种（指定了种什么就种那种）。</p><p>种子在拾荒区捡、顾客给的小费、收菜时多得的。超市等级不够的种子先留着。</p><p>有种地的员工时：自动收菜、补种、摘果（离线也干）；「员工补种」点一下换一种，「自动」= 种最缺的。</p><p>果园：果树苗只能从回收机「变宝」得到；种下以后一直结果，可以换种别的树。</p>` });
  },
  /* 货架（设计 29b）：页签 = 货柜种类，一个货柜一格（名字、档、摆的货、库存条），右边详情：用货物图标选货、升档 */
  shelf(S) {
    const opts = GOOD_IDS.filter(g => showGood(S, g) || (g === 'fish' && (L.wanted(S).includes('fish') || L.isOnShelf(S, 'fish'))));   // 0.28 修：鱼在仓库页不显示（看池塘），但冰柜里要能选
    const types = FIXTURE_IDS.filter(k => S.shelves.some(sh => sh.type === k));
    const miss = L.notOnShelf(S);   // 设计 45：能卖、仓库有、哪个货柜都没摆的
    const tabs = types.map(k => ({ id: k, name: `${FIXTURE[k].name} ${S.shelves.filter(sh => sh.type === k).length}`, dot: S.shelves.some(sh => sh.type === k && L.slotsOf(sh).some(sl => !sl.g)) || miss.some(x => canHold(k, x)) }));
    const g = gst('shelf'); if (!types.includes(g.tab)) g.tab = types[0] || 'shelf';
        const cells = S.shelves.map((sh, i) => { if (sh.type !== g.tab) return null; const f = FIXTURE[sh.type], cap = L.capOf(sh), sls = L.slotsOf(sh), n = sls.reduce((a, s) => a + (s.n || 0), 0), all = cap * sls.length, busy = !!L.busyWith(S, 'tier', i), emp = sls.some(s => !s.g);
      const ics = sls.map(s => `<span class="shit">${s.g ? icon('good', s.g) : '<span class="shnone">空</span>'}<small>${s.g ? GOODS[s.g].name : '空'}</small></span>`).join('');   // 设计 39：每个图标下面写名字
      return { id: String(i), cls: 'shcell' + (emp ? ' emp' : ''), html: `<div class="shn"><b>${i + 1}</b> ${f.tiers[sh.tier - 1]}</div><div class="shg">${ics}</div><div class="sbar"><i style="width:${all ? Math.round(n / all * 100) : 0}%"></i></div><div class="shc">${n}/${all}</div>${busy ? '<span class="itag hot">升档中</span>' : emp ? '<span class="itag">没选货</span>' : ''}` } }).filter(Boolean);
    const detail = id => { const i = +id, sh = S.shelves[i]; if (!sh) return ''; const f = FIXTURE[sh.type], cap = L.capOf(sh), sls = L.slotsOf(sh), ti = L.tierInfo(S, i), busy = !!L.busyWith(S, 'tier', i);
      if (shelfSlot >= sls.length) shelfSlot = 0; const sl = sls[shelfSlot], j = shelfSlot;
      const slotTabs = sls.length > 1 ? `<div class="dtabs">${sls.map((s, k) => `<button class="${k === j ? 'on' : ''}" data-act="shelfSlot" data-arg="${k}">${s.g ? icon('good', s.g) : k + 1}</button>`).join('')}</div>` : '';
      const pick = opts.filter(x => canHold(sh.type, x));
      /* 设计 45（代替 V1.11 / 29d）：同一种货能摆好几个货柜、好几层，别处在卖的照样能选，写「也在 2、5号卖」 */
      const elsewhere = x => { const ks = S.shelves.map((o, k) => L.slotsOf(o).some(z => z !== sl && z.g === x) ? k + 1 : 0).filter(Boolean); return ks.length ? `也在 ${ks.join('、')}号卖` : '' };
      const PER = pick.length || 1, np = 1; shelfPg = 0;   // 37：选货不翻页，全部排出来（3 列、带名字），多了往下拉
      const pg = pick.slice(shelfPg * PER, shelfPg * PER + PER);
      const pager = '' && np > 1 ? `<span class="gpager"><button data-act="shelfPg" data-arg="-1" ${shelfPg ? '' : 'disabled'}>◀</button><b>${shelfPg + 1}/${np}</b><button data-act="shelfPg" data-arg="1" ${shelfPg < np - 1 ? '' : 'disabled'}>▶</button></span>` : '';
      const fr = true;   // 35d：冰柜选货写名字；37：所有货柜的选货都写名字、3 列
      const grid = pick.length ? `<div class="ggrid named fr">${pg.map(x => { const st = S.stock[x] || 0, no = x !== 'fish' && !(S.stock[x] > 0), el = elsewhere(x), ms = miss.includes(x);
        return `<button class="gpick ${sl.g === x ? 'on' : ''} ${no ? 'no' : ''}" data-act="shelf" data-arg="${i}:${x}:${j}" title="${GOODS[x].name}">${ms ? '<span class="nots">没上架</span>' : ''}${icon('good', x)}${fr ? `<small class="gn">${GOODS[x].name}</small>` : ''}<small>${no ? '没货' : x === 'fish' ? '' : st}</small>${el ? `<small class="also">${el}</small>` : ''}</button>` }).join('')}</div>` : `<p class="note">${f.note}</p>`;
      const now = sl.g ? `<div class="drow"><span>在卖</span><b>${GOODS[sl.g].name}</b><em class="cnt">${sl.n}/${cap}</em>${sl.g !== 'fish' && !(S.stock[sl.g] > 0) ? '<span class="itag">仓库没货</span>' : ''}</div>` : `<div class="drow"><span>在卖</span><b class="warn">还没选</b></div>`;
      const up = busy ? '<p class="note">升档中…（看「建造」上面的施工队）</p>' : ti.max ? '<p class="note">已是高档</p>' : ti.needStore ? `<p class="note">升${TIER_NAME[ti.to]}要超市 ${ti.needStore} 级</p>` : (() => {
        const nc = FIXTURE[sh.type].cap[ti.to - 1], nk = sh.type === 'veg' ? FIXTURE.veg.kinds[ti.to - 1] : 0, nm = f.mult[ti.to - 1];
        const gain = sh.type === 'veg' && nk > sls.length ? `每种 ${cap}→${nc}<br>${sls.length}→${nk} 种` : `容量 ${cap}→${nc}${nm > f.mult[sh.tier - 1] ? `<br>售价 ×${nm}` : ''}`;   // 待改小问题 1：分两行，不从词中间断
        return `<div class="dup"><div class="dsub dgain"><span>升${TIER_NAME[ti.to]}：</span><em class="good">${gain}</em></div><div class="dcost">${costIc(S, ti.cost)}<button class="btn sm" data-act="tier" data-arg="${i}" ${ti.ok ? '' : 'disabled'}>升档</button></div>${ti.ok ? '' : `<div class="note warn">${ti.lack[0]}</div>`}</div>` })();
      return `<h5>${i + 1} 号 ${f.tiers[sh.tier - 1]}<small>${TIER_NAME[sh.tier]}${f.mult[sh.tier - 1] > 1 ? ` ×${f.mult[sh.tier - 1]}` : ''}</small></h5>${slotTabs}${now}${grid}<div class="dlegend"><span class="lgt">灰色＝仓库没货</span>${pager}</div>${up}` };
    const fr = L.wanted(S).filter(x => GOODS[x].fresh), room = S.shelves.reduce((a, sh) => a + (sh.type === 'veg' ? L.kindsOf(sh) : 0), 0);
    const warn = g.tab === 'veg' && fr.length > room ? `<span class="warn">想买的菜和水果 ${fr.length} 种，果蔬架只能放 ${room} 种</span>` : '';
    const need = L.wanted(S).map(x => GOODS[x].name).join('、');
    const trs = [...new Set(BUILD.tier.levels.filter(Boolean).flatMap(l => Object.keys(l.need)))];
    return frame('shelf', { tabs, topInTabs: true, cols: 3, rows: 2, cells, detail, dw: 230, none: '这种货柜还没有',
      empty: '<p class="note">点一个货柜，选它卖什么，或者升档。</p><p class="note">货会自动从仓库补上。</p>',
      top: `<button class="btn sm" data-act="layout">布置货柜位置</button>${miss.length ? `<button class="btn sm warnb" data-act="shelfMiss">有 ${miss.length} 样货没上架</button>` : ''}<span>${warn || `货柜 ${S.shelves.length} 个`}</span>`,
      res: resChip('<i class="ico-coin"></i>', Math.floor(S.coins)) + trs.map(id => resChip(icon('tr', id), S.treas[id] || 0)).join(''),
      help: `<b>货架</b><p>点货柜，在右边用货物图标选它卖什么，会自动从仓库补货。灰色的货仓库里没有，选了也要等仓库有货才会摆上。同一种货可以摆好几个货柜（一个货柜的好几层也行），别处在卖的格子下面写「也在 几号卖」；补货先补最空的那个，顾客先去最近的、还有货的货柜拿。只有能卖、仓库有、但哪个货柜都没摆的货，格子右上角写红色「没上架」，顶上写「有 N 样货没上架」，点一下跳到能放它的货柜。</p><p>蔬菜水果只能放果蔬架，一个果蔬架能放好几种（上面的小图标切换第几种，再点一次已选的 = 清空）；有了果蔬架、种出来过的菜和水果才会有人买；冰柜放纯净水卖得更贵。</p><p>升档：容量变大（果蔬架还能多放几种），要末日币和工具箱，占一个施工队。</p><p>「布置货柜位置」：拖动换地方、转方向。店里一共能放 ${L.fixtureMax(S)} 个货柜，新货柜在「建造」里买。</p><p>顾客想买的东西所有货柜都没了，口碑才会下降。现在有人买的：${need}。累计没买到：${S.st.miss} 次。</p>` });
  },
  friends() { return CHAT.panel() },
  /* 0.42 工坊：每台机器在做什么、自己点「做一个」 */
  /* 工坊（设计 29d）：一台机器一个页签，一个配方一格（成品、原料、用时），右边详情：原料够不够、做几个、开始做；页签下面一条是每条线在做什么 */
  ws(S) {
    const built = L.wsBuilt(S); if (!built.length) return frame('ws', { cells: [], none: '工坊里还没有机器：在「建造」→「工坊」里盖', help: '<b>工坊</b><p>在「建造」→「工坊」里盖机器、厨房（超市 3 级开放）。</p>' });
    const noCrew = L.crewless(S, 'craft');   // 设计 62：没人管的机器标签上红点
    const tabs = built.map(k => ({ id: k, name: BUILD[k].name, dot: noCrew.includes(k) || (L.wsOf(S, k).lines.slice(0, L.wsLines(S, k)).some(l => !l.out) && L.wsChoices(S, k).length > 0) }));
    const g = gst('ws'); if (!tabs.find(t => t.id === g.tab)) g.tab = built.find(x => L.wsChoices(S, x).length) || built[0];
    const k = g.tab, M = L.wsOf(S, k), T = L.wsTime(S, k), nl = L.wsLines(S, k), ch = L.wsChoices(S, k), kit = isKit(k), who = L.wsCrew(S).get(k), served = !!who, spd = who ? L.effSpd(who) : 1;   // 设计 47
    const free = M.lines.slice(0, nl).filter(l => !l.out).length;
    /* 设计 31～33：配方都是「几样原料一起用」：need {原料: 几个}；n = 出几个；tk = 用时倍数；also = 顺带出的 */
    const R = o => L.recipeOf(k, o) || { need: {}, n: 1 }, ins = o => Object.entries(R(o).need).map(([x, n]) => ({ g: x, n }));
    const canDo = o => L.wsNeedOk(S, k, o), maxN = o => Math.min(...ins(o).map(x => Math.floor((S.stock[x.g] || 0) / x.n)));
    const tOf = o => Math.round(L.wsTimeOf(S, k, o)), tTxt = o => spd > 1.001 ? `${Math.round(L.wsTimeOf(S, k, o) / spd)} 秒（原 ${tOf(o)}）` : `${tOf(o)} 秒`,   /* 设计 48 顺手改：工匠快了以后写实际秒数 */ outTxt = o => { const r = R(o), also = Object.entries(r.also || {}); return (r.n > 1 ? ` ×${r.n}` : '') + (also.length ? ` + ${also.map(([a, c]) => GOODS[a].name + (c > 1 ? ' ×' + c : '')).join('、')}` : '') };
    const stopN = L.wsEnough(S);   // 设计 61：格子上写「仓库 402 / 停手线 400」
    const cells = ch.map(o => { const ok = canDo(o);
      return { id: o, cls: 'wcell' + (ok ? '' : ' lack'), html: `${icon('good', o)}<b class="fn">${GOODS[o].name}${R(o).n > 1 ? `<small> ×${R(o).n}</small>` : ''}</b><small class="wstk${(S.stock[o] || 0) >= stopN ? ' full' : ''}">仓库 ${S.stock[o] || 0} / 停手线 ${stopN}</small><span class="wins">${ins(o).map(x => `<span class="cic${(S.stock[x.g] || 0) >= x.n ? '' : ' lack'}">${icon('good', x.g)}${x.n > 1 ? x.n : ''}</span>`).join('<i>+</i>')}</span><small class="wtm">⏱${spd > 1.001 ? `${Math.round(L.wsTimeOf(S, k, o) / spd)} 秒<br>（原 ${tOf(o)}）` : `${tOf(o)} 秒`}</small>${M.lines.slice(0, nl).some(l => l.plan === o) ? `<span class="itag ok">${M.lines.slice(0, nl).map((l, i) => l.plan === o ? '线' + (i + 1) : '').filter(Boolean).join(' ')}</span>` : ''}` } });
    const detail = o => { if (!ch.includes(o)) return ''; const n = Math.max(1, Math.min(wsN, free || 1, Math.max(1, maxN(o)))); wsN = n;
      const rows = `<div class="ggrid">${ins(o).map(x => { const h = S.stock[x.g] || 0; return `<span class="gpick ${h >= x.n ? '' : 'no'}" title="${GOODS[x.g].name}">${icon('good', x.g)}<small>${h}/${x.n}</small></span>` }).join('')}</div>`;
      const ok = canDo(o) && free > 0 && L.whRoom(S, o) > 0, why = !free ? '几条线都在做，等一条做完' : !(L.whRoom(S, o) > 0) ? '仓库放不下了' : !canDo(o) ? '原料不够' : '';
      return `<h5>${icon('good', o)} ${GOODS[o].name}${outTxt(o)}<small>一次 ${tTxt(o)}</small></h5><div class="dsub">原料（有 / 要）：${ins(o).map(x => GOODS[x.g].name).join(' + ')}</div>${rows}
        <div class="dstep"><span>做几次</span><button class="btn sm ghost" data-act="wsN" data-arg="-1" ${n > 1 ? '' : 'disabled'}>−1</button><b>${n}</b><button class="btn sm ghost" data-act="wsN" data-arg="1" ${n < Math.min(free, maxN(o)) ? '' : 'disabled'}>+1</button><small>空线 ${free}</small></div>
        ${why ? `<p class="note warn">${why}</p>` : ''}<div class="dbtns"><button class="btn sm" data-act="wsGoN" data-arg="${k}:${o}:${n}" ${ok ? '' : 'disabled'}>开始做</button></div>
        <div class="dsub">工匠用哪条线做它（再点一次改回自动）：</div><div class="dbtns">${M.lines.slice(0, nl).map((l, i) => `<button class="btn sm ${l.plan === o ? '' : 'ghost'}" data-act="wsPlan" data-arg="${k}:${l.plan === o ? '' : o}:${i}">线${i + 1}${l.plan === o ? ' ✓' : ''}</button>`).join('')}${nl > 1 ? `<button class="btn sm ghost" data-act="wsPlan" data-arg="${k}:${o}:">全部线</button>` : ''}</div>` };
    const fl = i => critAt[k + ':' + i] && performance.now() - critAt[k + ':' + i] < 1500 ? ' crit' : '';
    /* 设计 60：每条线一行：在做什么 + 「选：自动 / 产品」（点开换）+ 停着的原因 / 自动换的提示 */
    const why = L.wsWhy(S, k), pick = g.line != null && g.line < nl && g.lineK === k ? g.line : null;
    const lines = M.lines.slice(0, nl).map((ln, i) => { const st = !ln.out ? `<span class="wst idle${ln.plan ? ' wait' : ''}">${ln.plan && !/^工匠|^没有工匠/.test(why.lines[i] || '') ? '' : '停着：'}${why.lines[i] || '等原料'}</span>` : ln.t >= T * (ln.tk || 1) ? `<span class="wst full">${icon('good', ln.out)}${GOODS[ln.out].name}做好了，仓库放不下了</span>` : `<span class="wst">${icon('good', ln.out)}${GOODS[ln.out].name}<span class="prog"><i style="width:${(ln.t / (T * (ln.tk || 1)) * 100).toFixed(0)}%"></i></span>${Math.ceil((T * (ln.tk || 1) - ln.t) / spd)}秒</span>`;
      const sel = ln.plan ? `指定：${GOODS[ln.plan].name}` : '自动', sub = '';   // 设计 68：指定只做这一样，不再「先做别的」
      const opts = pick === i ? `<div class="wopts"><button class="btn sm ${ln.plan ? 'ghost' : ''}" data-act="wsPlan" data-arg="${k}::${i}">自动</button>${ch.map(o => `<button class="btn sm ${ln.plan === o ? '' : 'ghost'}" data-act="wsPlan" data-arg="${k}:${o}:${i}">${icon('good', o)}${GOODS[o].name}</button>`).join('')}</div>` : '';
      return `<div class="wrow${fl(i)}"><b>线${i + 1}</b>${st}<button class="btn sm ghost wsel${pick === i ? ' on' : ''}" data-act="wsLine" data-arg="${i}">${ln.plan ? '' : '选：'}${sel}${sub} ▾</button></div>${opts}` }).join('');
    return frame('ws', { tabs, cols: 4, rows: 2, cells, detail, dw: 214, none: kit ? `还没有能做的菜：超市 ${Math.min(...Object.keys(DISHES).map(d => GOODS[d].unlock || 1))} 级开放第一道菜` : '这台机器还没有能做的东西',
      top: `<div class="wlines"><b>${BUILD[k].name}${/\d$/.test(BUILD[k].name) ? '　' : ' '}${S.lv[k]} 级</b><span class="${served ? 'good' : 'warn'}">工匠：</span><button class="btn sm ghost crewbtn${served ? '' : ' warn'}${g.crewPick === k ? ' on' : ''}" data-act="crewPick" data-arg="${k}">${why.who ? `${why.who.name}（${L.isPinned(S, why.who) ? '<i class="ico-pin"></i>指定' : '自动'}）` : '没有工匠管'} ▾</button><span class="${served ? 'good' : 'warn'}">${who ? `Lv${who.lv}　快 ${Math.round((spd - 1) * 100)}%` : why.who ? why.why.replace(/^工匠/, '') : ''}</span></div>`,
      lead: (g.crewPick === k ? `<div class="wopts crewopts"><span>换人：</span>${S.staff.filter(p => p.job === 'craft').map(p => { const n = L.crewKeys(S, 'craft', p.id).length, cap = L.manageN(p), me = why.who && why.who.id === p.id, full = L.isPinned(S, p) && n >= cap && !me;
        return `<button class="btn sm ${me ? '' : 'ghost'}" data-act="crewSet" data-arg="craft:${k}:${p.id}" ${full ? 'disabled' : ''}>${L.isPinned(S, p) ? '<i class="ico-pin"></i>' : ''}${p.name}<small> ${n}/${cap}${full ? ' 满' : ''}</small></button>` }).join('')}<button class="btn sm ghost" data-act="crewSet" data-arg="craft:${k}:auto">自动分</button></div>` : '') + `<div class="wlist">${lines}</div>`,
      empty: `<p class="note">点一样看原料够不够、做几个。</p><p class="note">做好的自动进仓库。每条线各选各的：自动：做最缺的；指定：只做这一样，没原料就等着。</p>`,
      res: resChip('<i class="ico-coin"></i>', Math.floor(S.coins)),
      help: `<b>工坊</b><p>机器、厨房几级就同时开几条线（格子上面每条线一行：在做什么、选了什么、停着的原因）；每做好一个有机会 ×2、×3（等级越高机会越大），做好的自动进仓库，仓库放不下就停在线上。</p><p>每样东西要的原料格子里写着（几样一起用），原料不够的那格是灰的。木炭一次出 2 个；分解机拆一个电池出 1 个电芯 + 1 根铜丝、一个罐头出 4 张铁皮、一卷绷带出 3 根棉线；木工台做得快（一次 25 秒起）。</p><p>鸡蛋、鸭蛋、兔毛、羊毛、牛奶、猪肉、木柴、电芯、铜丝、铁皮、棉线是原料，顾客不买，只能在这里做成东西卖。冰淇淋只能放冰柜。</p><p>工匠：普通、精英一人管 4 台，史诗 5 台，传说 6 台（超市 5 级 13 台，4 个普通工匠正好管完）。每条线点「选：」各选各的。自动：做最缺的（货柜 + 仓库 + 线上在做的加起来最少的那样，两个厨房在做的都算），这样做不了就换别的；木工台自动时先做木炭。指定：只做这一样，没原料、到停手线就等着，不做别的（线上写「等原料：猪肉」「够多了」），原料一到自动开工；几条线抢同一样原料时先给更缺的那样，等得最久的线下一次优先。工匠按机器固定分，在「员工」→ 工匠 →「管哪几台」里看、换，也能点上面工匠的名字直接换人；「指定」的人只管勾的几台（名字后面写「指定」、头顶有小图钉），没人管的机器标签上有红点；谁饿了，只停他管的那几台。机器停着，线上写为什么：工匠饿了 / 没有工匠管 / 仓库够多了（停手线）/ 原料要留给货柜、动物 / 原料不够 / 仓库放不下了。工匠会在仓库里给要上货柜卖的原料（绷带、罐头、水、菜、鱼…）每种留 ${WS.keep} 个；自己点「开始做」不留。</p>` });
  },
  mys(S) {
    const o = S.mys && S.mys.order; if (!o) return '<p>神秘商人已经走了。</p>';
    const rows = o.items.map(it => { const h = S.stock[it.g] || 0, ok = h >= it.n; return `<div class="cell">${icon('good', it.g)}<div><div class="nm">${GOODS[it.g].name}</div><div class="sub">要 ${it.n} 个</div></div><div class="n ${ok ? '' : 'full'}">${h}<small>/${it.n}</small></div></div>` }).join('');
    const can = L.mysCanDeliver(S), free = S.mys.free, tix = S.refTix || 0;
    return `<p class="mysq">「这些东西我全要了，价钱好说。」</p><div class="grid">${rows}</div>
      <p>奖励：<b class="gold"><i class="ico-coin"></i> ${L.mysValue(o)}</b> 末日币<small class="note">（货架售价的 ${MYSTERY.mult} 倍；有机会多送 1 颗星星）</small></p>
      <div class="btns"><button class="btn" data-act="mysGive" ${can ? '' : 'disabled'}>${can ? '交货' : '仓库里还不够'}</button>
      <button class="btn ghost" data-act="mysRef" ${free || tix ? '' : 'disabled'}>换一单（${free ? '这次免费' : `刷新券 ${tix} 张`}）</button>${!free && !tix ? '<button class="btn sm ghost" data-act="openStars">去星星兑换换刷新券</button>' : ''}</div>
      <p class="note">只从仓库拿，货柜上的不动。不交货他不走；交完货他离开，${Math.round(MYSTERY.gap / 60)} 分钟后再来。</p>`;
  },
  /* 商城（设计 29b）：页签 补给 / 设施 / 员工武器 / 动物 / 星星兑换，商品一格一样，右边详情 + 购买；星星兑换页资源条换成星星 */
  mall(S) {
    const far = mallAt === 'far', yard = mallAt === 'yard', coin = n => `<span class="cic${S.coins >= n ? '' : ' lack'}"><i class="ico-coin"></i>${n}</span>`;
    const tabs = [{ id: 'sup', name: '补给', dot: L.freeReady(S, dayFn()) }, { id: 'fac', name: '设施' }, { id: 'gun', name: '员工武器' }];
    if (!far) tabs.push({ id: 'ani', name: '动物' }, { id: 'star', name: `${starIc}星星兑换` });
    const g = gst('mall'); if (!tabs.find(t => t.id === g.tab)) g.tab = 'sup';
    const it = [];   // { id, ic, nm, sub, d: 详情 HTML }
    const buyBtn = (act, arg, ok, txt) => `<button class="btn" data-act="${act}"${arg != null ? ` data-arg="${arg}"` : ''} ${ok ? '' : 'disabled'}>${txt}</button>`;
    if (g.tab === 'sup') {
      const freeOk = L.freeReady(S, dayFn());   // 设计 43 修：以前看 extraDots.mall，V3.11 删了菜单的商城入口以后没人设它了，一直是「今天领过了」
      it.push({ id: 'free', ic: `<span class="icon img"><img src="${A('img/ui/icons/star_gold.png')}" alt=""></span>`, n: `×${FREE.star}`, nm: '每日免费', sub: freeOk ? '<b class="good">领取</b>' : '今天领过了', cls: freeOk ? 'hot' : 'got', d: `<div class="deff">每天免费领 ${FREE.star} 颗星星，北京时间 0 点刷新。星星可以在「星星兑换」里换末日币、发条、工具箱、刷新券、晶石。</div>${buyBtn('freeGear', null, freeOk, freeOk ? '领取' : '今天领过了')}` });
      /* 设计 109：尸潮券、召唤券各一格，详情里选买几张（−10 −5 −1 [n] +1 +5 +10、最多），去掉 5 张一包 */
      if (g.sel !== ticFor) { ticQty = 1; ticFor = g.sel }
      const ticD = (kind, unit, have, note, act, name) => { const max = Math.floor(S.coins / unit), q = Math.max(1, Math.min(ticQty, Math.max(1, max))); if (g.sel === kind) ticQty = q;
        const dis = c => (max < 1 || !c) ? 'disabled' : '';
        const b = d => `<button class="btn sm ghost" data-act="ticN" data-arg="${d}" ${dis(d < 0 ? q > 1 : q < max)}>${d > 0 ? '+' : ''}${d}</button>`;   /* 按钮 44px（手指点得到），一排放不下 7 个，分两排：−10 −5 −1 [n]　/　+1 +5 +10 最多 */
        return `<div class="deff">${note}有 ${have} 张。</div><div class="dstep tq">${[-10, -5, -1].map(b).join('')}<b class="${max < 1 ? 'dim' : ''}">${max < 1 ? 0 : q}</b></div>
          <div class="dstep tq">${[1, 5, 10].map(b).join('')}<button class="btn sm ghost tqall" data-act="ticN" data-arg="all" ${max > 1 ? '' : 'disabled'}>最多（${Math.max(max, 0)}）</button></div>
          <div class="dstep sbtns">${buyBtn(act, q, max >= 1, max >= 1 ? `买 ${q} 张，花 ${coin(unit * q)}` : `末日币不够（1 张要 ${unit}）`)}</div>` };   /* 「花多少」写在买的按钮上、「最多能买几张」写在「最多」上，省一行，844 / 667 都不用往下拉 */
      it.push({ id: 'scroll', ic: icon('it', 'scroll'), n: '', nm: '尸潮券', sub: coin(TD.scroll), d: ticD('scroll', TD.scroll, S.td.scrolls, '打尸潮用。', 'buyScroll') });
      /* 设计 108：召唤券（打副本用），超市 5 级以后卖；钓鱼区贵 20% */
      if (S.lv.store >= FB.store && S.fb) { const u = tixCost(1, far); it.push({ id: 'tix', ic: icon('it', 'tix'), n: '', nm: '召唤券', sub: coin(u), d: ticD('tix', u, S.fb.tix || 0, `打副本，每关 1 张。${far ? '<span class="warn">这里贵 20%。</span>' : ''}`, 'buyTix') }) }
      /* 设计 56：晶石（炼宝用），超市 5 级以后卖 */
      if (S.lv.store >= FB.store) for (const [i, [n, c]] of CRYSTAL.packs.entries()) it.push({ id: 'crys' + n, ic: `<span class="icon img"><img src="${A('img/fb/eq_crystal.png')}" alt=""></span>`, n: `×${n}`, nm: `${n} 颗晶石`, sub: coin(c), tag: n * 200 > c ? `省 ${n * 200 - c}` : '',
        d: `<div class="deff">炼宝（找铁匠给装备升星）用。现在有 ${S.fb ? S.fb.crys : 0} 颗。也能用星星换（1 星 = ${CRYSTAL.perStar} 颗）。</div>${buyBtn('buyCrys', i, S.coins >= c, coin(c) + ' 买')}` });
      if (L.fishOpen(S) && S.fishLic) {
        for (const k of ['worm', 'corn']) for (const [n] of FISHING.baitPacks) { const c = L.baitCost(k, n, far), full = Math.round(FISHING.bait[k].price * n * (far ? FISHING.farMult : 1));
          it.push({ id: k + n, ic: icon('it', k), n: `×${n}`, nm: `${n} 个${FISHING.bait[k].name}`, sub: coin(c), tag: full > c ? `省 ${full - c}` : '', d: `<div class="deff">每抛一竿用 1 个（${k === 'worm' ? '近岸、桥下' : '深水、桥下'}用）。现在有 ${S.bait[k] || 0} 个。${far ? '<br><span class="warn">这里贵 20%</span>' : ''}</div>${buyBtn('buyBait', `${k}:${n}`, S.coins >= c, coin(c) + ' 买')}` }) }
        const r = L.rodCfg(S), rc = L.rodCost(S, far), full = S.rodDur >= r.dur;
        it.push({ id: 'rod', ic: icon('it', 'rod'), n: `${S.lv.rod || 1}级`, nm: '新鱼竿', sub: full ? '耐久是满的' : coin(rc), d: `<div class="deff">耐久补满到 ${r.dur}（现在 ${S.rodDur}）。鱼竿等级在「建造」里升。${far ? '<br><span class="warn">这里贵 20%</span>' : ''}</div>${buyBtn('buyRod', null, !full && S.coins >= rc, full ? '耐久是满的' : coin(rc) + ' 买')}` });
      }
    } else if (g.tab === 'fac') {
      const nx = L.crewNext(S);
      it.push({ id: 'crew', ic: `<span class="icon"><i class="hi" style="--ic:url(${A('img/ui/icons/wrench.png')})"></i></span>`, n: '+1', nm: '施工队', sub: nx != null ? coin(nx) : '已雇满', d: `<div class="deff">永久多一个施工队，能同时多建一样东西。现在 ${L.crews(S)} 个，最多 ${1 + CREW.cost.length} 个。</div>${nx != null ? buyBtn('buyCrew', null, S.coins >= nx, coin(nx) + ` 雇第 ${L.crews(S) + 1} 个`) : '<p class="note">已经雇满了。</p>'}` });
      if (L.fishOpen(S)) it.push({ id: 'lic', ic: icon('it', 'lic'), n: '', nm: '垂钓证', sub: S.fishLic ? '已经有了' : coin(FISHING.license), d: `<div class="deff">买一次永久有效，送一根 1 级鱼竿。院子西南角的小码头坐船去钓鱼，每趟船费 ${FISHING.boat}。</div>${S.fishLic ? '<p class="note">已经有垂钓证了。</p>' : buyBtn('buyLic', null, S.coins >= FISHING.license, coin(FISHING.license) + ' 买')}` });
    } else if (g.tab === 'gun') {
      it.push({ id: 'm16', ic: icon('it', 'm16'), n: '', nm: 'M16（员工用）', sub: coin(GUARD_GUN.price), d: `<div class="deff">给员工装上（在员工面板 → 武器里装），伤害、射速、射程分开升。</div><div class="drow"><span>1 级</span><b>伤害 ${HERO.gun.dmg}　${(1 / HERO.gun.rate).toFixed(1)} 发/秒</b></div><div class="drow"><span>没装的</span><b>${(S.guns || []).length} 把</b></div>${buyBtn('buyGun', null, S.coins >= GUARD_GUN.price, coin(GUARD_GUN.price) + ' 买')}` });
    } else if (g.tab === 'ani') {
      for (const k of RANCH_IDS) { const R = RANCH[k], lv = S.lv[k] || 0, have = L.herdOf(S, k), room = L.animalRoom(S, k);
        it.push({ id: k, ic: icon('bd', k), n: lv ? `${have}/${PEN_CAP[lv]}` : '', nm: R.name, sub: lv ? coin(R.price) : `先盖${BUILD[k].name}`, cls: lv ? '' : 'locked',
          d: !lv ? `<p class="note warn">🔒 先在「建造」→「牧场」里盖${BUILD[k].name}。</p>` : `<div class="deff">买了直接放进${BUILD[k].name}（要有饲养员喂），产${GOODS[R.good].name}。</div><div class="drow"><span>棚里</span><b>${have}/${PEN_CAP[lv]} 只</b></div>${!yard ? '<p class="note">在院子里的商人那里买。</p>' : room ? `${buyBtn('buyAnimal', `${k}:1`, S.coins >= R.price, coin(R.price) + ' 买 1 只')}${room > 1 ? `<button class="btn ghost sm" data-act="buyAnimal" data-arg="${k}:${room}" ${S.coins >= R.price * room ? '' : 'disabled'}>买满 ${room} 只 ${coin(R.price * room)}</button>` : ''}` : '<p class="note">棚住满了（升级棚能多住）。</p>'}` }) }
    } else {
      const n = S.stars || 0; starQty = Math.max(1, Math.min(starQty, Math.max(1, n)));
      /* 设计 77：换几颗 −10 −1 [n] +1 +10 全部（样子跟仓库「丢掉一些」一样）；下面实时写换到多少；0 颗时整排灰 */
      const qty = k => { const q = starQty, dis = c => (n < 1 || !c) ? 'disabled' : '';
        return `<div class="dsub">换几颗（有 ${n} 颗星星）</div><div class="dstep">${[-10, -1].map(d => `<button class="btn sm ghost" data-act="starN" data-arg="${d}" ${dis(q > 1)}>${d}</button>`).join('')}<b class="${n < 1 ? 'dim' : ''}">${n < 1 ? 0 : q}</b>${[1, 10].map(d => `<button class="btn sm ghost" data-act="starN" data-arg="${d}" ${dis(q < n)}>+${d}</button>`).join('')}</div>
          <p class="note sline">${n < 1 ? '没有星星' : `<span class="slg">${STAR_GET(k, q).line}</span><span class="ssh">${STAR_GET(k, q).short}</span>`}</p>` };
      const allBtn = () => `<button class="btn sm ghost" data-act="starN" data-arg="all" ${n > 1 ? '' : 'disabled'}>全部（${Math.max(n, 0)}）</button>`;   /* 「全部」跟「兑换」放一排，小屏不用往下拉也看得到 */
      const sw = (k, ic, cnt, nm, note, short) => it.push({ id: k, ic, n: cnt, nm: short, full: nm, sub: `${starIc}1`, d: `<div class="deff stx">${note}</div>${qty(k)}<div class="dstep sbtns">${allBtn()}${buyBtn('starSwap', k, n >= 1, n >= 1 ? `兑换（${starIc}${starQty}）` : '还差 1 颗星星')}</div>${n < 1 ? '<p class="note">神秘商人交货时有机会送星星。</p>' : ''}` });
      sw('coins', '<span class="icon img coinic"><i class="ico-coin"></i></span>', `×${STAR.coins}`, `${STAR.coins} 末日币`, `1 颗星星换 ${STAR.coins} 末日币。`, '末日币');
      sw('gear', icon('it', 'gear'), `×${STAR.gear}`, `${STAR.gear} 个发条`, '建造 −30 分钟。', '发条');
      sw('toolbox', icon('tr', 'toolbox'), `×${STAR.toolbox}`, `${STAR.toolbox} 个工具箱`, '升级要用。', '工具箱');
      sw('ref', icon('it', 'ref'), `×${STAR.ref}`, `${STAR.ref} 张刷新券`, `神秘商人换一单用（有 ${S.refTix || 0} 张）。`, '刷新券');
      if (S.lv.store >= FB.store) sw('crys', `<span class="icon img"><img src="${A('img/fb/eq_crystal.png')}" alt=""></span>`, `×${CRYSTAL.perStar}`, `${CRYSTAL.perStar} 颗晶石`, `炼宝用（有 ${S.fb ? S.fb.crys : 0} 颗）。`, '晶石');   // 设计 56；设计 85：格子上写短名（数量看角标），详情写全称
    }
    const cells = it.map(x => ({ id: x.id, cls: 'mcell ' + (x.cls || ''), html: `<div class="mic">${x.ic}${x.n ? `<em>${x.n}</em>` : ''}</div><b class="mnm">${x.nm}</b><span class="msub">${x.sub}</span>${x.tag ? `<span class="itag ok">${x.tag}</span>` : ''}` }));
    const detail = id => { const x = it.find(y => y.id === id); return x ? `<h5>${x.ic} ${x.full || x.nm}</h5>${x.d}` : '' };
    const res = g.tab === 'star' ? resChip(starIc, S.stars || 0) + resChip('<i class="ico-coin"></i>', Math.floor(S.coins))
      : resChip('<i class="ico-coin"></i>', Math.floor(S.coins)) + resChip(icon('it', 'gear'), S.gear || 0) + resChip(icon('it', 'scroll'), S.td.scrolls) + (S.lv.store >= FB.store && S.fb ? resChip(icon('it', 'tix'), S.fb.tix || 0) : '');
    return frame('mall', { tabs, cols: 4, rows: 2, cells, detail, dw: 214, res, none: g.tab === 'ani' ? '超市 3 级以后在「建造」→「牧场」里盖动物棚' : '没有东西卖',
      empty: g.tab === 'star' ? '<p class="note">每样 1 颗星星。神秘商人交货时有机会送星星。</p>' : g.tab === 'ani' ? `<p class="note">${yard ? '买了直接放进棚里。' : '动物在院子里的商人那里买。'}</p>` : '<p class="note">点一样看详情、购买。</p>',
      help: `<b>院子商人</b><p>补给：每天免费领 ${FREE.star} 颗星星（北京时间 0 点刷新）；尸潮券打尸潮用；有垂钓证以后这里卖饵料和鱼竿。</p><p>设施：施工队永久多一个，能同时多建一样东西；垂钓证买一次永久有效。</p><p>员工武器：M16 给员工装上（在员工面板里装），伤害、射速、射程分开升。</p><p>动物：先在「建造」→「牧场」盖棚，在院子里的商人那里买，买了直接放进棚里。</p><p>星星兑换：每样 1 颗星星，星星是神秘商人交货时送的。</p>${far ? '<p class="warn">钓鱼区的商人贵 20%。</p>' : ''}` });
  },
  /* 消息框（旧的面板版，现在用下拉）：没读的标亮 */
  msg(S) {
    const list = S.msgs || [];
    const K = { good: '好消息', bad: '注意', info: '消息' };
    return list.length ? `<div class="mlist">${list.map(m => `<div class="mrowx ${m.r ? '' : 'new'}"><span class="mt">${ago(m.at)}</span><span class="mk ${m.k}">${K[m.k] || '消息'}</span><span class="mx">${esc(m.x)}</span></div>`).join('')}</div>` : '<p class="note">还没有消息。卖完了、没种子了、升级完成、员工回来了这些事都会记在这里。</p>';
  },
  /* 第一次在码头坐船：没有垂钓证先买 */
  fishLic(S) {
    if (S.fishLic) return `<div class="mfree"><span class="art">${icon('it', 'lic')}</span><div><b>已经有垂钓证了</b><div class="note">船费每趟 ${FISHING.boat} 末日币</div></div><button class="btn" data-act="boatGo" ${S.coins >= FISHING.boat ? '' : 'disabled'}><i class="ico-coin"></i>${FISHING.boat} 坐船</button></div>`;
    return `<div class="mfree"><span class="art">${icon('it', 'lic')}</span><div><b>垂钓证</b><div class="note">买一次永久有效，送一根 1 级鱼竿（耐久 ${FISHING.rod[1].dur}）。以后每趟船费 ${FISHING.boat}。</div></div><button class="btn" data-act="buyLic" ${S.coins >= FISHING.license ? '' : 'disabled'}><i class="ico-coin"></i>${FISHING.license}</button></div>
      <p class="note">钓鱼区：近岸用蚯蚓、深水用玉米饵、桥下两种都行。饵料在商人那里买（大门北边有一个）。</p>`;
  },
  /* 员工（设计 29b）：页签按岗位筛选，一人一格（头像、名字、岗位、等级），右边详情：属性 / 岗位 / 武器 三个小页签 */
  /* 设计 60：工匠 / 饲养员「管哪几台」：每台写谁管，能换给这个人 */
  staff(S) {
    const cap = L.staffCap(S), F = STAFF.food, unfed = S.staff.filter(p => !p.fed).length;
    const tabs = [{ id: 'all', name: `全部 ${S.staff.length}` }, ...Object.entries(STAFF_JOBS).map(([j, n]) => { const c = S.staff.filter(p => p.job === j).length; return { id: j, name: c ? `${n} ${c}` : n } })];
    const g = gst('staff'); if (!tabs.find(t => t.id === g.tab)) g.tab = 'all';
    const stOf = (p, short) => { const s = L.staffState(S, p); return s === 'hungry' ? '<span class="warn"><i class="ico-hungry"></i>饿了，不干活</span>' : s === 'work' ? (short ? `${STAFF_JOBS[p.job]}中` : workTxt(S, p)) : '休息' };
    const cells = S.staff.filter(p => g.tab === 'all' || p.job === g.tab).map(p => ({ id: String(p.id), cls: 'stcell', html: `${avatar(p, 'sm')}<b class="stn"><i class="qsq q-${p.q}"></i>${p.name}</b><small>${stOf(p, true)}</small>` }));
    const detail = id => { const p = S.staff.find(x => x.id === +id); if (!p) return ''; const Q = STAFF.qual[p.q], st = L.staffStats(p), up = L.staffUpInfo(S, p), state = L.staffState(S, p), nx = up.max || up.cap ? null : L.staffStats({ ...p, lv: p.lv + 1 });
      const dt = ['a', 'j', 'w'].includes(staffDTab) ? staffDTab : 'a';
      const head = `<h5 class="sth">${avatar(p, 'xs')}<span><b>${p.name}</b><small><i class="qd q-${p.q}"></i>${Q.name} · Lv${p.lv}/${L.staffMaxLv(S)}</small></span></h5><div class="dtabs">${[['a', '属性'], ['j', '岗位'], ['w', '武器']].map(([k, n]) => `<button class="${k === dt ? 'on' : ''}" data-act="staffDTab" data-arg="${k}">${n}</button>`).join('')}</div>`;
      let body = '';
      if (dt === 'a') { const row = (n, v, w) => `<div class="drow"><span>${n}</span><b>${v}</b>${w != null ? `<em>→ ${w}</em>` : ''}</div>`;
        body = `<div class="drow"><span>现在</span><b class="nw">${stOf(p)}</b></div>${row('血量', st.hp, nx && nx.hp)}${row('攻击', st.atk, nx && nx.atk)}${row('防御', st.def, nx && nx.def)}${row('效率', '×' + st.eff, nx && '×' + nx.eff)}${effUse(S, p)}
          ${nx ? `<div class="note">升级后 效率 ${st.eff} → <b>${nx.eff}</b></div>` : ''}<div class="dbtns">${up.max ? '<span class="note">已经满级</span>' : up.cap ? `<span class="note">超市 ${up.need} 级才能再升</span>` : `<button class="btn sm ${up.ok ? '' : 'ghost'}" data-act="staffUp" data-arg="${p.id}" ${up.ok ? '' : 'disabled'}>升到 Lv${p.lv + 1}　<span class="cic${up.ok ? '' : ' lack'}"><i class="ico-coin"></i>${up.cost}</span></button>`}<button class="btn sm ghost bye" data-act="staffBye" data-arg="${p.id}">请走</button></div>` }
      else if (dt === 'j') body = `<div class="jgrid">${Object.entries(STAFF_JOBS).map(([j, n]) => { const o = j === 'scav' ? L.scavPerson(S) : j === 'fish' ? L.fishPerson(S) : null, busy = o && o !== p, lock = (j === 'fish' && (S.lv.store < FISHING.store || !S.fishLic)) || (j === 'feed' && !L.ranchBuilt(S).length);
          return `<button class="${p.job === j ? 'on' : ''}" data-act="staffJob" data-arg="${p.id}:${j}" ${busy || lock ? 'disabled' : ''}>${n}${busy ? `<small>${o.name}在做</small>` : lock ? `<small>${j === 'feed' ? '先盖动物棚' : S.lv.store < FISHING.store ? `超市 ${FISHING.store} 级` : '要垂钓证'}</small>` : ''}</button>` }).join('')}</div><p class="note">${JOB_TIP[p.job] || ''}</p>${crewBox(S, p)}`;
      else { const guns = (S.guns || []).length;
        if (!p.gun) body = guns ? `<p class="note">仓库里有 ${guns} 把 M16。</p><button class="btn sm" data-act="equipGun" data-arg="${p.id}">装上 M16</button>` : '<p class="note">没有枪：尸潮里只能用拳脚，打得很弱。</p><button class="btn sm ghost" data-act="toMerch" data-arg="m16">去院子商人那里买 M16</button>';
        else { const s = L.gunStats(p.gun);
          body = `<div class="drow"><span>M16</span><b>${{ black: '黑色', camo: '迷彩', gold: '金色' }[HERO.skin(p.gun.dmg)]}</b><button class="btn sm ghost un" data-act="unequipGun" data-arg="${p.id}">卸下</button></div>` + [['dmg', '伤害', x => x.dmg, ''], ['rate', '射速', x => (1 / x.rate).toFixed(1), '/秒'], ['range', '射程', x => x.range, '米']].map(([k, lab, f, u]) => {
            const inf = L.gunUpInfo(S, p.id, k), ns = inf && !inf.max && !inf.capped ? L.gunStats({ ...p.gun, [k]: inf.to }) : null;
            const b = inf.max ? '<span class="note">满级</span>' : inf.capped ? '<span class="note">要升超市</span>' : `<button class="btn sm ${inf.ok ? '' : 'ghost'}" data-act="gunUp" data-arg="${p.id}:${k}" ${inf.ok ? '' : 'disabled'}>${costIc(S, { coins: inf.cost.coins, need: { toolbox: inf.cost.toolbox } }, false)}</button>`;
            return `<div class="gupr"><span>${lab}<small>${p.gun[k]}级</small></span><b>${f(s)}${u}</b>${ns ? `<em>→${f(ns)}</em>` : '<em></em>'}${b}</div>` }).join('') } }
      return head + body };
    const pend = S.pendingStaff ? `<button class="btn sm" data-open="staffFull">${S.pendingStaff.name}在等你决定留不留</button>` : '';
    const ncW = L.wsBuilt(S).length ? L.crewless(S, 'craft').length : 0, ncR = L.ranchLive(S).length ? L.crewless(S, 'feed').length : 0;   // 设计 62：没人管的提示
    const nc = (ncW ? `<button class="btn sm warnb" data-act="goWsNoCrew">${ncW} 台机器没人管</button>` : '') + (ncR ? `<span class="warn">　${ncR} 个棚没人喂</span>` : '');
    return frame('staff', { tabs, cols: 4, rows: 2, cells, detail, dw: 236, none: S.staff.length ? '这个岗位没有人' : '还没有员工：去拾荒区救被困的幸存者',
      empty: '<p class="note">点一个员工看属性、换岗位、升级、装枪。</p><p class="note">尸潮来了全员上阵，打完回去干活。</p>',
      top: `<span>宿舍楼 ${S.lv.camp} 级，住了 <b>${S.staff.length}/${cap}</b> 人　${unfed ? `<span class="warn">${unfed} 人没吃上饭，不干活</span>` : '今天都吃过了'}</span>${nc}${pend}`,
      res: resChip('<i class="ico-coin"></i>', Math.floor(S.coins)) + resChip(icon('tr', 'toolbox'), S.treas.toolbox || 0) + resChip('🔫', (S.guns || []).length),
      help: `<b>员工</b><p>员工在拾荒区救回来（普通、精英），史诗、传说要打尸潮：第一次打赢第 3 关必得史诗、第 5 关必得传说；之后打赢普通第 3 关以上也有机会得到，关卡越高机会越大。</p><p>每人每天吃 ${F.food} 个罐头 + ${F.water} 瓶水（北京时间 0 点；先吃仓库的，不够从货架拿），没吃上的罢工。</p><p>收银：有人在岗，你不在收银台、去拾荒区时超市也照常营业。种地：自动收菜、补种、摘果（离线也干）。拾荒、钓鱼：一次只能派一个人。饲养：一个人管几个动物棚，工匠：一个人管几台机器（普通、精英 4，史诗 5，传说 6；按机器、棚固定分给人，存档记住，在岗位页「管哪几台」里看、换；谁饿了只停他管的那几台。管法有两种：自动（没人管的按效率补给自动的人）、指定（只管你勾的 1～N 台 / 个，别的不会补给他；效率高的放在最要紧的机器上，管得少不会更快）。种地的也能指定只管温室或只管果园），效率越高，管的棚产得越快、机器做得越快（×（1 + 0.5 ×（效率 − 1）））。</p><p>等级越高、品质越好，干活越快、越能打。品质救下来就定了。请走退回升级花的一半。</p><p>武器：M16 在院子商人那里买，伤害、射速、射程分开升（末日币 + 工具箱）。</p>` });
  },
  /* 角色面板（设计 28 / 29 框架）：左边 3D 展示用人物，中间升级格子 3 × 2（5 个升级 + 1 个上锁格），右边详情区；资源在标题栏 */
  hero(S) {
    const st = L.heroStats(S), cap = L.heroCap(S), n1 = { ...S }, tb = S.treas.toolbox || 0;
    const next = k => { const inf = L.heroInfo(S, k); if (inf.max || inf.capped) return null; n1.hero = { ...S.hero, [k]: inf.to }; return L.heroStats(n1) };
    const SK = { black: '黑', camo: '迷彩', gold: '金' };
    const ICON = { hp: '❤️', dmg: '💥', rate: '⚡', range: '🎯', nade: '💣' }, NAME = { hp: '主角', dmg: '伤害', rate: '射速', range: '射程', nade: '手雷' };
    const VAL = { hp: [['血量', s => s.hp, '']], dmg: [['每发伤害', s => s.dmg, '']], rate: [['射速', s => (1 / s.rate).toFixed(1), ' 发/秒']], range: [['射程', s => s.range, ' 米']],
      nade: [['伤害', s => s.nadeDmg, ''], ['半径', s => s.nadeR, ' 米'], ['冷却', s => s.nadeCd, ' 秒']] };
    const btn = (k, inf) => { const cOk = S.coins >= inf.cost.coins, tOk = tb >= inf.cost.toolbox;
      return `<button class="btn hup ${inf.ok ? '' : 'no'}" data-act="heroUp" data-arg="${k}" ${inf.ok ? '' : 'disabled'}><span class="cic${cOk ? '' : ' lack'}"><i class="ico-coin"></i>${inf.cost.coins}</span><span class="cic${tOk ? '' : ' lack'}">${icon('tr', 'toolbox')}${inf.cost.toolbox}</span></button>` };   /* 设计 85：按钮里也用图片图标（以前是 💰 🧰） */
    const foot = (k, inf) => inf.max ? '<div class="hfoot max">已满级</div>' : inf.capped ? `<div class="hfoot cap">超市升到 ${S.lv.store + 1} 级</div>` : btn(k, inf);
    const cell = k => { const inf = L.heroInfo(S, k), nx = next(k), [, f, u] = VAL[k][0];
      const pop = heroPop === k ? ' pop' : ''; if (pop) heroPop = null;
      return { id: k, cls: `hcell ${inf.max ? 'is-max' : inf.capped ? 'is-cap' : inf.ok ? 'is-ok' : 'is-lack'}${pop}`,
        html: `<div class="hname">${ICON[k]} ${NAME[k]}${k === 'dmg' ? `<span class="skin s-${HERO.skin(S.hero.dmg)}">${SK[HERO.skin(S.hero.dmg)]}</span>` : ''}</div><div class="hlv">Lv ${S.hero[k]}</div><div class="hval">${f(st)}${u}${nx ? `<em>→ ${f(nx)}</em>` : ''}</div>${foot(k, inf)}` } };
    const detail = k => {   /* 设计 76：设计 28 留下的「🔒 以后开放：护甲、装备」占位去掉了（装备有自己的页签） */
      const inf = L.heroInfo(S, k), nx = next(k);
      const rows = VAL[k].map(([lab, f, u]) => `<div class="drow"><span>${lab}</span><b>${f(st)}${u}</b>${nx ? `<em>→ ${f(nx)}${u}</em>` : ''}</div>`).join('');
      const more = k === 'dmg' ? `<p class="note">10 级变迷彩、20 级变金色（现在：${SK[HERO.skin(S.hero.dmg)]}）</p>` : k === 'hp' ? '<p class="note">只在尸潮里用。</p>' : '';
      return `<h5>${ICON[k]} ${HERO.names[k]} <small>Lv ${S.hero[k]}${inf.max ? '' : ` → ${inf.to}`}</small></h5>${rows}${more}${inf.max ? '<p class="good">已满级</p>' : inf.capped ? `<p class="warn">等级上限 ${cap} 级：超市升到 ${S.lv.store + 1} 级才能继续升</p>` : `${inf.lack.length ? `<p class="warn">${inf.lack.join('，')}</p>` : ''}${btn(k, inf).replace('btn hup', 'btn hup big')}`}` };
    const tabs = roleTabs(S, false); gst('hero').tab = 'hero';
    return frame('hero', { tabs, cols: 2, rows: 2, cells: ['dmg', 'rate', 'range', 'nade'].map(cell),   // 设计 59：去掉主角血量（尸潮血量跟超市等级走），2 × 2
      left: `<div class="hview"><div id="heroView"></div><p class="note">等级上限 ${cap} 级<br>超市 ${S.lv.store} 级</p></div>`,
      detail, empty: `<p class="note">点一个格子看这一项的全部数值。升级马上生效。</p><p class="note">尸潮里主角血量跟超市等级走（现在 ${st.hp}）。</p>`,
      res: resChip('<i class="ico-coin"></i>', Math.floor(S.coins)) + resChip(icon('tr', 'toolbox'), tb),   /* 设计 77：跟别的面板一样用图片图标（以前是 💰 🧰） */
      help: '<b>角色</b><p>M16 的伤害 / 射速 / 射程、手雷，都在这里升级，升级马上生效。尸潮只看这 4 项；副本里再加上装备和技能。</p><p>尸潮里主角的血量跟超市等级走（超市 1～5 级：180 / 280 / 380 / 480 / 580），不用升级。</p><p>每级要末日币和工具箱；等级上限看超市等级（超市 1 级最多 5 级，每升一级超市 +5）。</p><p>M16 伤害 10 级变迷彩、20 级变金色。工具箱靠回收机变宝、尸潮打赢、员工拾荒得到。</p>' });
  },
  staffNew(S) {
    const p = revealP; if (!p) return '<p>没事了。</p>';
    const Q = STAFF.qual[p.q], st = L.staffStats(p), kept = S.staff.some(x => x.id === p.id), full = !kept && S.pendingStaff && S.pendingStaff.id === p.id;
    const btn = kept ? `<button class="btn" data-act="staffOpen" data-arg="${p.id}">给他安排工作</button>　<button class="btn ghost" data-close>好</button>` : full ? '<button class="btn" data-open="staffFull">营地住满了，去决定留谁</button>' : '<button class="btn ghost" data-close>好</button>';
    return `<div class="reveal q-${p.q}"><div class="stage"><div class="rays"></div><div class="flip"><div class="face back">${avatar(p, 'big', true)}</div><div class="face front">${avatar(p, 'big')}</div></div></div>
      <div class="after"><h3 class="sname"><i class="qsq q-${p.q}"></i>${p.name}<small style="font-size:13px;color:#5a4028">　${Q.name}</small></h3>
      <div class="stats">${[['血量', st.hp], ['攻击', st.atk], ['防御', st.def], ['干活效率', '×' + st.eff]].map(([n, v]) => `<div>${n}<b>${v}</b></div>`).join('')}</div>
      <p>${btn}</p></div></div>`;
  },
  /* 设计 60：名字一律深色、品质用小色块；名字下面写工作 + 管什么，按工作分组；新人写「新人」。营地有空位了：写「营地有空位了」+「留下他」，不出「请他走」 */
  staffFull(S) {
    const n = S.pendingStaff; if (!n) return '<p>没事了。</p>';
    const room = S.staff.length < L.staffCap(S);
    const card = (p, act, isNew) => { const q = STAFF.qual[p.q], s = L.staffStats(p); return `<div class="srow">${avatar(p, 'sm')}<div class="sn">${sname(p)}${isNew ? '<span class="newtag">新人</span>' : ''}<small>${q.name}　Lv${p.lv}</small>${isNew ? '' : `<div class="sduty">${dutyTxt(S, p)}</div>`}<div class="note">血 ${s.hp}　攻 ${s.atk}　防 ${s.def}　效率 ×${s.eff}</div></div>${act}</div>` };
    if (room) return `<div class="freebox"><b>营地有空位了（${S.staff.length}/${L.staffCap(S)}）</b></div>${card(n, '<button class="btn" data-act="fullTake">留下他</button>', true)}`;
    const groups = Object.keys(STAFF_JOBS).map(j => [j, S.staff.filter(p => p.job === j)]).filter(([, ps]) => ps.length);
    return `<p>营地住满了（${S.staff.length}/${L.staffCap(S)}）。新救回来的：</p>${card(n, '', true)}
      <p>请一个老员工离开，让新人留下（退回他升级花的一半）：</p>${groups.map(([j, ps]) => `<div class="sgrp">${STAFF_JOBS[j]}（${ps.length}）</div>${ps.map(p => card(p, `<button class="btn sm" data-act="fullSwap" data-arg="${p.id}">请他走</button>`)).join('')}`).join('')}
      <p><button class="btn ghost" data-act="fullKeep">让新人走（他会留下 ${STAFF.thanks[n.q]} 末日币当谢礼）</button></p><p class="note">升级宿舍楼能住更多人；营地一有空位，等着的新人会自己住进来。</p>`;
  },
  menu(S) { return ctx.menuHTML(S) },
  log() {
    return `<div class="log">${CHANGELOG.map(d => `<h5>${d.date}</h5><ul>${d.items.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`).join('')}</div><p><button class="btn ghost" data-open="menu">返回</button></p>`;
  },
  stats(S) { return `${statsGrid(S)}<p><button class="btn ghost" data-open="menu">返回</button></p>` },
};
export const CHANGELOG_HTML = () => CHANGELOG.map(d => `<h5>${d.date}</h5><ul>${d.items.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`).join('');
export function statsGrid(S) { {
    const st = S.st, rows = [['游戏时长', fmtT(st.play)], ['捡到物资', st.junk], ['回收', st.rec], ['3 倍', st.x3], ['10 倍暴击', st.x10], ['变宝', st.gem],
      ['卖出商品', st.sold], ['结账顾客', st.served || 0], ['收获蔬果', st.harvest || 0], ['累计收入', fmtN(st.earned)], ['顾客没买到', st.miss], ['等太久走掉', st.angry || 0], ['被丧尸碰到', st.hits], ['完成建造', st.builds]];
    return `<div class="stats">${rows.map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('')}</div>`; }
}

/* 0.20 用户：商城买东西都要确认 —— 游戏里的确认框（不用浏览器的 confirm，手机上好看、不卡） */
let askYes = null;
/* 设计 79：游戏里的确认框（代替浏览器的 confirm）。danger = 确定按钮红色；开着的时候算「面板开着」，副本、尸潮暂停 */
export const askOpen = () => { const el = document.getElementById('askBox'); return !!el && !el.classList.contains('hidden') };
export function ask(html, yes, okText = '确定', danger = false) {
  let el = document.getElementById('askBox');
  if (!el) { el = document.createElement('div'); el.id = 'askBox'; el.className = 'hidden'; document.body.appendChild(el);
    el.addEventListener('click', e => { const b = e.target.closest('[data-ask]'); if (!b && e.target !== el) return; e.stopPropagation(); const f = askYes; askYes = null; el.classList.add('hidden'); if (b && b.dataset.ask === 'yes' && f) f() }) }
  el.innerHTML = `<div class="abox"><p>${html}</p><div class="btns"><button class="btn ghost" data-ask="no">取消</button><button class="btn${danger ? ' danger' : ''}" data-ask="yes">${okText}</button></div></div>`;
  askYes = yes; el.classList.remove('hidden');
}

/* 设计 39：只有图标、写不下名字的地方（工坊配方的原料、花费），点一下或按住出名字；格子里本来就写了名字的大图标不出 */
{ let tipEl = null, tipT = 0;
  document.addEventListener('pointerdown', e => {
    const ic = e.target.closest && e.target.closest('.icon[data-nm], .eqtip[data-nm]'); if (!ic || !ic.dataset.nm) return;   /* 设计 82：副本「能掉」的小装备图标也出名字（带品质颜色） */
    const r = ic.getBoundingClientRect(); if (r.width > 34) return;
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'ictip'; document.body.appendChild(tipEl) }
    tipEl.textContent = ic.dataset.nm; tipEl.style.color = ic.dataset.nmc || ''; tipEl.style.left = (r.left + r.width / 2) + 'px'; tipEl.style.top = (r.top - 6) + 'px'; tipEl.classList.add('on');
    clearTimeout(tipT); tipT = setTimeout(() => tipEl.classList.remove('on'), 1600);
  }, true) }
