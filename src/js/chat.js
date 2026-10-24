/* ================= 0.40 好友和聊天（设计/20_好友聊天.md） =================
   用 Supabase（免费版）：profiles 名片、friends 好友关系、messages 消息；权限在数据库里（RLS，见 tools/supabase/chat.sql）。
   账号：游戏的用户名 + 6 位口令 → 在 Supabase 自动建一个对应账号（玩家看不到）；只有登录了云存档才能用。
   不一直连着：开着聊天每 5 秒查一次，平时 30 秒；开着游戏每分钟报一次在线（2 分钟没报算不在线）。 */
const SB = { url: 'https://ttxkbjiciiwdeertgluz.supabase.co', key: 'sb_publishable_G92rNBBVdKsdgMsFc0NbnA_xnEPjLW5' };   // 公开 key（本来就放在网页里用）
const DOMAINS = ['moshi-game.com', 'gmail.com'];       // 账号邮箱用哪个域名（不发邮件；前一个被拒就用下一个）
const ONLINE_MS = 120000, MAX_LEN = 100;

const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(x => x.toString(16).padStart(2, '0')).join('');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- 状态 ---------- */
export const CH = {
  ok: null, err: '', me: null,          // ok：null 没试过 / true 连上了 / false 连不上；me：我的 id
  friends: [], reqIn: [], reqOut: [],   // friends: [{id,name,store_name,store_lv,last_seen}]；reqIn 别人申请我的；reqOut 我申请别人的
  unread: {},                           // 好友 id → 没读的条数
  view: 'list', peer: null, msgs: [], draft: '', addName: '', addMsg: '', busy: false,
};
let tok = null, tokExp = 0, acctKey = '', srvOff = 0, getAcct = null, getS = null, onChange = () => {}, open = () => false;
export function initChat(o) { getAcct = o.acct; getS = o.S; onChange = o.onChange || onChange; open = o.isOpen || open }
const srvNow = () => Date.now() + srvOff;
export const isOnline = p => !!p && srvNow() - Date.parse(p.last_seen) < ONLINE_MS;
export const badge = () => Object.values(CH.unread).reduce((a, n) => a + n, 0) + CH.reqIn.length;
export const usable = () => { const a = getAcct && getAcct(); return !!(a && a.name && a.pin) };

/* ---------- 请求 ---------- */
async function call(path, { method = 'GET', body, auth = true, prefer } = {}) {
  const h = { apikey: SB.key, 'Content-Type': 'application/json' };
  if (auth) { await login(); h.Authorization = 'Bearer ' + tok }
  if (prefer) h.Prefer = prefer;
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), 12000);
  let r; try { r = await fetch(SB.url + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: ac.signal }) } finally { clearTimeout(to) }
  const d = Date.parse(r.headers.get('date') || ''); if (d) srvOff = d - Date.now();
  if (r.status === 401 && auth) { tok = null }
  const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null } catch (e) {}
  if (!r.ok) { const e = new Error((j && (j.msg || j.message || j.error_description || j.error_code)) || ('HTTP ' + r.status)); e.status = r.status; e.code = j && (j.error_code || j.code); throw e }
  return j;
}
/* 用游戏账号登录 Supabase（没有就建一个）；邮箱、密码都从用户名 + 口令算出来，换手机也一样 */
async function login() {
  const a = getAcct(); if (!a || !a.name || !a.pin) throw new Error('nologin');
  const key = a.name + '|' + a.pin; if (tok && key === acctKey && Date.now() < tokExp) return;
  const uk = (await sha('ms|' + String(a.name).trim().slice(0, 12))).slice(0, 40), pw = (await sha('sb|' + uk + '|' + a.pin)).slice(0, 32);
  let last = null;
  for (const dom of DOMAINS) {
    const email = `m${uk.slice(0, 24)}@${dom}`;
    try { const j = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: pw }, auth: false }); return use(j, key) } catch (e) { last = e }
    try { const j = await call('/auth/v1/signup', { method: 'POST', body: { email, password: pw }, auth: false }); if (j && j.access_token) return use(j, key) } catch (e) { last = e; if (/already|registered|exists/i.test(e.message)) continue }
  }
  throw last || new Error('login');
}
function use(j, key) { tok = j.access_token; tokExp = Date.now() + Math.max(60, (j.expires_in || 3600) - 120) * 1000; acctKey = key; CH.me = j.user && j.user.id; return true }

/* ---------- 我的名片：第一次建，之后每分钟更新店名、等级、在线时间 ---------- */
let made = false;
async function ping() {
  const a = getAcct(), S = getS(); await login();
  if (!made) { await call('/rest/v1/profiles', { method: 'POST', body: { id: CH.me, name: String(a.name).trim().slice(0, 12) }, prefer: 'resolution=ignore-duplicates,return=minimal' }); made = true }
  await call(`/rest/v1/profiles?id=eq.${CH.me}`, { method: 'PATCH', body: { store_name: (S && S.storeName) || '', store_lv: (S && S.lv.store) || 1, last_seen: new Date(srvNow()).toISOString() }, prefer: 'return=minimal' });
}
/* ---------- 拉一遍：好友、申请、没读的 ---------- */
async function pull() {
  const me = CH.me, rel = await call('/rest/v1/friends?select=a,b,status');
  const ids = [...new Set(rel.map(f => f.a === me ? f.b : f.a))];
  const ps = ids.length ? await call(`/rest/v1/profiles?select=id,name,store_name,store_lv,last_seen&id=in.(${ids.join(',')})`) : [];
  const P = Object.fromEntries(ps.map(p => [p.id, p]));
  CH.friends = rel.filter(f => f.status === 'ok').map(f => P[f.a === me ? f.b : f.a]).filter(Boolean).sort((x, y) => (isOnline(y) - isOnline(x)) || x.name.localeCompare(y.name));
  CH.reqIn = rel.filter(f => f.status === 'pending' && f.b === me).map(f => P[f.a]).filter(Boolean);
  CH.reqOut = rel.filter(f => f.status === 'pending' && f.a === me).map(f => P[f.b]).filter(Boolean);
  const un = await call(`/rest/v1/messages?select=from_id&to_id=eq.${me}&read=eq.false`); CH.unread = {};
  for (const m of un) CH.unread[m.from_id] = (CH.unread[m.from_id] || 0) + 1;
  if (CH.view === 'chat' && CH.peer) await loadChat();
}
async function loadChat() {
  const me = CH.me, p = CH.peer.id;
  CH.msgs = await call(`/rest/v1/messages?select=id,from_id,body,created_at&or=(and(from_id.eq.${me},to_id.eq.${p}),and(from_id.eq.${p},to_id.eq.${me}))&order=id.desc&limit=100`);
  CH.msgs.reverse();
  if (CH.unread[p] && open()) { await call(`/rest/v1/messages?from_id=eq.${p}&to_id=eq.${me}&read=eq.false`, { method: 'PATCH', body: { read: true }, prefer: 'return=minimal' }); delete CH.unread[p] }
}

/* ---------- 定时：报在线 + 拉消息（一次只跑一个） ---------- */
/* 设计 38：Supabase 在国内常连不上 —— 进游戏 10 秒以后才第一次连（不跟加载抢网），连续失败 3 次就停 5 分钟再试 */
const FIRST_WAIT = 10000, FAIL_MAX = 3, PAUSE_MS = 300000;
let running = false, lastPing = 0, lastPull = 0, t0 = 0, fails = 0;
export const CHN = { pauseUntil: 0 };
export async function tick(force) {
  if (running || !usable()) return; const now = Date.now(), fast = open() && CH.view === 'chat';
  if (!t0) t0 = now; if (now - t0 < FIRST_WAIT || now < CHN.pauseUntil) return;
  if (!force && now - lastPull < (fast ? 5000 : 30000)) return;
  running = true;
  try { if (force || now - lastPing > 60000) { await ping(); lastPing = now } await pull(); lastPull = Date.now(); CH.ok = true; CH.err = ''; fails = 0 }
  catch (e) { CH.ok = false; CH.err = e.message; lastPull = Date.now() - 20000;   // 失败 10 秒后再试
    if (++fails >= FAIL_MAX) { fails = 0; CHN.pauseUntil = Date.now() + PAUSE_MS } }   // 连续 3 次：停 5 分钟
  finally { running = false; onChange() }
}
/* 好友面板里点「再试一次」：不等 5 分钟 */
export function retry() { CHN.pauseUntil = 0; fails = 0; t0 = Math.min(t0 || Date.now(), Date.now() - FIRST_WAIT); return tick(true) }
/* 有改动的操作：做完马上刷新 */
async function act(f) { if (CH.busy) return; CH.busy = true; onChange(); try { await f(); CH.ok = true } catch (e) { CH.addMsg = errTxt(e) } finally { CH.busy = false; onChange(); await tick(true) } }   // 先把结果显示出来，再刷新列表
const errTxt = e => e.message === 'nologin' ? '要先登录云存档才能用好友。' : /fetch|network|abort/i.test(e.message) ? '连不上好友服务器，稍后再试。' : '出错了：' + e.message;

export const ctl = {
  tab: v => { CH.view = v; CH.addMsg = ''; if (v !== 'add') CH.found = null; if (v !== 'chat') CH.peer = null },
  chat: id => { CH.peer = CH.friends.find(f => f.id === id) || null; if (!CH.peer) return; CH.view = 'chat'; CH.msgs = []; act(loadChat) },
  card: id => { CH.peer = CH.friends.find(f => f.id === id) || CH.reqIn.find(f => f.id === id) || null; if (CH.peer) CH.view = 'card' },
  /* 0.40 用户：加好友改成「搜索」→ 列出找到的人 → 点「加好友」（以前回车 / 点按钮直接发申请，打中文时输入法一回车就去找、找不到就报错） */
  search: () => act(async () => {
    const n = CH.addName.trim(); CH.found = null; if (!n) { CH.addMsg = '先输入对方的用户名。'; return }
    await login(); const me = String(getAcct().name).trim();
    if (n === me) { CH.addMsg = '不能加自己。'; return }
    const r = await call(`/rest/v1/profiles?select=id,name,store_name,store_lv,last_seen&name=eq.${encodeURIComponent(n)}`);   // 0.42 用户：要输全名才搜得到（不模糊搜索）
    CH.found = r; CH.addMsg = CH.found.length ? '' : `没找到「${n}」：要输对方完整的用户名；对方也要先进过一次游戏、打开过「好友」才能被找到。`;
  }),
  req: id => act(async () => {
    const p = (CH.found || []).find(x => x.id === id); if (!p) return;
    if (CH.reqIn.some(f => f.id === id)) { await call(`/rest/v1/friends?a=eq.${id}&b=eq.${CH.me}`, { method: 'PATCH', body: { status: 'ok' }, prefer: 'return=minimal' }); CH.addMsg = `「${p.name}」之前申请过加你，现在你们是好友了。`; return }
    await call('/rest/v1/friends', { method: 'POST', body: { a: CH.me, b: id }, prefer: 'return=minimal' }); CH.addMsg = `已经发给「${p.name}」，等对方同意。`;
  }),
  accept: id => act(() => call(`/rest/v1/friends?a=eq.${id}&b=eq.${CH.me}`, { method: 'PATCH', body: { status: 'ok' }, prefer: 'return=minimal' })),
  reject: id => act(() => call(`/rest/v1/friends?or=(and(a.eq.${id},b.eq.${CH.me}),and(a.eq.${CH.me},b.eq.${id}))`, { method: 'DELETE', prefer: 'return=minimal' })),
  unfriend: id => act(async () => { await call(`/rest/v1/friends?or=(and(a.eq.${id},b.eq.${CH.me}),and(a.eq.${CH.me},b.eq.${id}))`, { method: 'DELETE', prefer: 'return=minimal' }); CH.view = 'list'; CH.peer = null }),
  send: () => { const t = CH.draft.trim().slice(0, MAX_LEN); if (!t || !CH.peer) return; CH.draft = '';
    act(async () => { await call('/rest/v1/messages', { method: 'POST', body: { from_id: CH.me, to_id: CH.peer.id, body: t }, prefer: 'return=minimal' }); await loadChat() }) },
};

/* ---------- 面板 ---------- */
const dot = p => `<i class="fdot ${isOnline(p) ? 'on' : ''}"></i>`;
const shop = p => `${esc(p.store_name || '无名超市')}　超市 ${p.store_lv || 1} 级`;
const when = t => { const d = new Date(t), p = n => String(n).padStart(2, '0'), today = new Date().toDateString() === d.toDateString(); return (today ? '' : `${d.getMonth() + 1}-${d.getDate()} `) + `${p(d.getHours())}:${p(d.getMinutes())}` };
export function panel() {
  if (!usable()) return '<p class="note">要先用云存档登录（用户名 + 口令）才能加好友、聊天。</p>';
  const left = CHN.pauseUntil - Date.now();
  /* 设计 38：连不上就直接说连不上（不一直写「正在连接」）；停着的时候写几分钟后再试，可以手动再试 */
  const down = `<p class="note warn">好友服务器连不上${left > 0 ? `，${Math.ceil(left / 60000)} 分钟后自动再试` : '，过一会儿自动再试'}。</p><p class="note">国内网络有时连不上好友服务器，不影响玩游戏和云存档。</p><div class="btns"><button class="btn sm" data-act="chRetry" ${running ? 'disabled' : ''}>再试一次</button></div>`;
  if (CH.ok === false && !CH.me) return down;
  if (CH.ok === null) return running ? '<p class="note">正在连接好友服务器…</p>' : '<p class="note">进游戏 10 秒后连接好友服务器。</p>';
  const tabs = `<div class="btabs"><button class="gchip ${CH.view === 'list' || CH.view === 'chat' || CH.view === 'card' ? 'on' : ''}" data-act="chTab" data-arg="list">好友 ${CH.friends.length}</button><button class="gchip ${CH.view === 'req' ? 'on' : ''}" data-act="chTab" data-arg="req">申请${CH.reqIn.length ? `<em class="cntc">${CH.reqIn.length}</em>` : ''}</button><button class="gchip ${CH.view === 'add' ? 'on' : ''}" data-act="chTab" data-arg="add">加好友</button></div>`;
  const bad = CH.ok === false ? down : '';
  if (CH.view === 'chat' && CH.peer) {
    const p = CH.peer, log = CH.msgs.map(m => `<div class="cmsg ${m.from_id === CH.me ? 'me' : ''}"><span class="cb">${esc(m.body)}</span><small>${when(m.created_at)}</small></div>`).join('') || '<p class="note">还没有消息，打个招呼吧。</p>';
    return `<div class="chead"><button class="btn sm ghost" data-act="chTab" data-arg="list">← 好友</button><b>${dot(p)}${esc(p.name)}</b><button class="btn sm ghost" data-act="chCard" data-arg="${p.id}">名片</button></div>${bad}
      <div class="clog" id="chatLog">${log}</div>
      <div class="cin"><input id="chatIn" maxlength="${MAX_LEN}" placeholder="说点什么（最多 ${MAX_LEN} 个字）" autocomplete="off"><button class="btn" data-act="chSend" ${CH.busy ? 'disabled' : ''}>发送</button></div>`;
  }
  if (CH.view === 'card' && CH.peer) {
    const p = CH.peer, fr = CH.friends.some(f => f.id === p.id);
    return `${tabs}<div class="ccard"><div class="cav">${esc(p.name.slice(0, 1))}</div><div><b class="cn">${esc(p.name)}</b><div>${dot(p)}${isOnline(p) ? '在线' : '不在线'}</div><div>${shop(p)}</div></div></div>
      <div class="btns">${fr ? `<button class="btn" data-act="chChat" data-arg="${p.id}">发消息</button><button class="btn ghost" data-act="chUnfriend" data-arg="${p.id}">删好友</button>` : ''}<button class="btn ghost" data-act="chTab" data-arg="list">返回</button></div>`;
  }
  if (CH.view === 'req') {
    const inn = CH.reqIn.map(p => `<div class="frow"><div class="fn"><b>${esc(p.name)}</b><small>${shop(p)}</small></div><div class="btns"><button class="btn sm" data-act="chAccept" data-arg="${p.id}">同意</button><button class="btn sm ghost" data-act="chReject" data-arg="${p.id}">拒绝</button></div></div>`).join('');
    const out = CH.reqOut.map(p => `<div class="frow"><div class="fn"><b>${esc(p.name)}</b><small>等对方同意</small></div><div class="btns"><button class="btn sm ghost" data-act="chReject" data-arg="${p.id}">撤回</button></div></div>`).join('');
    return tabs + bad + (inn || out ? inn + out : '<p class="note">没有好友申请。</p>');
  }
  if (CH.view === 'add') {
    const st = p => CH.friends.some(f => f.id === p.id) ? '<span class="note">已是好友</span>' : CH.reqOut.some(f => f.id === p.id) ? '<span class="note">等对方同意</span>'
      : `<button class="btn sm" data-act="chReq" data-arg="${p.id}" ${CH.busy ? 'disabled' : ''}>${CH.reqIn.some(f => f.id === p.id) ? '同意他的申请' : '加好友'}</button>`;
    const res = (CH.found || []).map(p => `<div class="frow"><div class="fn"><b>${dot(p)}${esc(p.name)}</b><small>${shop(p)}</small></div>${st(p)}</div>`).join('');
    return `${tabs}${bad}<div class="cin"><input id="chatAdd" maxlength="12" placeholder="输入对方的用户名" autocomplete="off"><button class="btn" data-act="chSearch" ${CH.busy ? 'disabled' : ''}>搜索</button></div>${res}${CH.addMsg ? `<p class="note">${esc(CH.addMsg)}</p>` : ''}<p class="note chelp">输入对方完整的用户名点「搜索」，找到以后点「加好友」；对方同意后就是好友，好友之间才能发消息。</p>`;
  }
  const rows = CH.friends.map(p => `<div class="frow" data-act="chChat" data-arg="${p.id}"><div class="fn"><b>${dot(p)}${esc(p.name)}</b><small>${shop(p)}</small></div>${CH.unread[p.id] ? `<em class="cntc">${CH.unread[p.id]}</em>` : ''}<button class="btn sm ghost" data-act="chCard" data-arg="${p.id}">名片</button></div>`).join('');
  return tabs + bad + (rows || '<p class="note">还没有好友：到「加好友」输入对方的用户名发申请。</p>');
}
/* 输入框：打字存进 draft（面板重画时不丢），回车发送 */
/* 0.40 修：打中文时输入法在「拼音」阶段，面板一重画输入法就断了 —— 输入框的字不放进面板 HTML（打字不会触发重画），正在拼音时也不重画 */
let comp = false;
/* 0.42 用户：手机键盘弹出来，聊天框、加好友的输入框被挡住 —— 输入框有焦点时面板贴到「键盘上面剩下的那块屏幕」（visualViewport），只留输入框、消息和返回 */
const vv = window.visualViewport;
function kbFit() { const on = document.body.classList.contains('kbon'), p = document.getElementById('panel'); if (!p) return;
  if (on && vv) { p.style.setProperty('--vvt', vv.offsetTop + 'px'); p.style.setProperty('--vvh', vv.height + 'px') } }
if (vv) { vv.addEventListener('resize', kbFit); vv.addEventListener('scroll', kbFit) }
document.addEventListener('focusin', e => { if (e.target.id === 'chatIn' || e.target.id === 'chatAdd') { document.body.classList.add('kbon'); kbFit(); setTimeout(kbFit, 300) } });
document.addEventListener('focusout', e => { if (e.target.id === 'chatIn' || e.target.id === 'chatAdd') setTimeout(() => { const a = document.activeElement; if (!a || (a.id !== 'chatIn' && a.id !== 'chatAdd')) { document.body.classList.remove('kbon'); window.scrollTo(0, 0) } }, 120) });
export const composing = () => comp;
document.addEventListener('compositionstart', () => { comp = true });
document.addEventListener('compositionend', e => { comp = false; if (e.target.id === 'chatIn') CH.draft = e.target.value; else if (e.target.id === 'chatAdd') CH.addName = e.target.value });
document.addEventListener('input', e => { if (e.target.id === 'chatIn') CH.draft = e.target.value; else if (e.target.id === 'chatAdd') CH.addName = e.target.value });
document.addEventListener('keydown', e => { if (e.key !== 'Enter' || e.isComposing || comp || e.keyCode === 229) return;   // 输入法选字的那个回车不算
  if (e.target.id === 'chatIn') { e.preventDefault(); ctl.send() } else if (e.target.id === 'chatAdd') { e.preventDefault(); ctl.search() } });
