/* ================= 登录页 / 选存档 =================
   云端可用：必须登录，选 3 个存档位之一。
   云端不可用（本地文件打开、没配置令牌）：直接用本机存档，供开发测试。 */
import * as SV from './save.js';
import { migrate } from './logic.js';
import { $, esc } from './ui.js';
import { APP_V } from './version.js';

let st = { msg: '', ok: false, busy: false, slots: null, confirm: null, onStart: null, started: false };
const go = (o, isNew) => { if (st.started) return; st.started = true; hideTitle(); st.onStart(o, isNew) };
const verTxt = v => `V${(v / 100).toFixed(2)}`;
const fmtTime = t => { if (!t) return ''; const d = new Date(t); return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` };
export const briefOf = S => `超市 ${S.lv.store || 1} 级　末日币 ${Math.floor(S.coins)}　回收机 ${S.lv.rec} 级　货柜 ${(S.shelves || []).length} 个`;

export function showTitle(onStart) {
  st.onStart = onStart; st.msg = ''; st.confirm = null;
  if (!SV.cloudCan()) { const o = migrate(SV.loadLocal()); go(o, !o); return }
  /* 上次登录过：先用本机记下的存档列表马上显示，云端在后台再核对一遍（不用干等网络） */
  if (SV.acct && SV.acct.name) { const c = SV.LS.get('ms_slots_' + SV.acct.name); if (c) { st.slots = c; st.verifying = true; render(); login(false, true) } else { st.slots = null; login(false) } } else render();
}
export const hideTitle = () => { $('#title').innerHTML = '' };

const left = sub => `<div class="tl"><h1>末世超市</h1><p>${sub}</p><p class="ver">作者：小熊cz　版本 ${verTxt(APP_V)}</p></div>`;
function render() {
  const msg = st.msg ? `<p class="msg ${st.ok ? 'ok' : ''}">${esc(st.msg)}</p>` : '', busy = st.busy ? '<p class="busy">正在连接云端……</p>' : '';
  let right;
  if (!st.slots) {
    if (st.confirm === 'create') right = `<div class="card"><p>还没有叫「<b>${esc(SV.acct.name)}</b>」的账号，要新建吗？</p>
      <label class="lf"><span>再输一次口令</span><input id="lpin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></label>
      ${msg}${busy}<button class="btn" data-t="create" ${st.busy ? 'disabled' : ''}>确认新建</button><button class="btn ghost" data-t="back">换个名字</button>
      <p class="note">名字和口令请记好：换手机靠它们登录，忘了口令存档就找不回来。</p></div>`;
    else {
      const offl = st.msg && SV.acct && SV.acct.name && SV.slot != null && SV.loadLocal(SV.acct.name, SV.slot);
      right = `<div class="card">
      <label class="lf"><span>用户名</span><input id="lname" maxlength="12" value="${esc(SV.acct && SV.acct.name || SV.LS.get('ms_lastname') || '')}" placeholder="最多 12 个字" autocomplete="username" autocapitalize="off" spellcheck="false"></label>
      <label class="lf"><span>口令</span><input id="lpin" type="password" inputmode="numeric" maxlength="6" placeholder="6 位数字" autocomplete="current-password"></label>
      ${msg}${busy}<button class="btn" data-t="login" ${st.busy ? 'disabled' : ''}>登录</button>
      ${offl ? `<button class="btn ghost" data-t="offline">先离线继续上次的存档</button>` : ''}
      <p class="note">没有账号的，输入新名字和口令就会新建。存档在云端，换手机也能接着玩。</p></div>`;
    }
  } else if (st.confirm && st.confirm.del != null) {
    const i = st.confirm.del;
    right = `<div class="card"><p>删除存档位 ${i + 1}：<b>${esc(st.slots[i] ? st.slots[i].brief : '')}</b>？删除后找不回来。</p>${msg}
      <button class="btn" data-t="del" data-i="${i}">确定删除</button><button class="btn ghost" data-t="back">返回</button></div>`;
  } else {
    right = `<div class="card"><div class="uline"><span>当前用户 <b>${esc(SV.acct.name)}</b></span><button class="btn ghost sm" data-t="logout" style="width:auto;margin:0">切换用户</button></div>${msg}${busy}
      ${st.slots.map((s, i) => s ? `<div class="slot"><button class="sb ${i === SV.slot ? 'cur' : ''}" data-t="pick" data-i="${i}"><b>${i + 1}　继续游戏</b><small>${esc(s.brief)}<br>保存于 ${fmtTime(s.savedAt)}</small></button><button class="sd" data-t="delask" data-i="${i}">删除</button></div>`
        : `<div class="slot"><button class="sb" data-t="new" data-i="${i}"><b>${i + 1}　空存档位</b><small>开新的一局</small></button></div>`).join('')}</div>`;
  }
  $('#title').innerHTML = `<div class="tw">${left(st.slots ? '选择存档' : '丧尸围城，只有这家超市还亮着灯。')}<div class="tr">${right}</div></div>`;
}

async function login(create, quiet) {
  if (!quiet) { st.busy = true; st.msg = ''; render() }
  const j = await SV.cloudLogin(create); st.busy = false;
  if (st.started) return;
  st.verifying = false;
  if (quiet && j.ok) { SV.LS.set('ms_slots_' + SV.acct.name, j.slots); if (!st.confirm) { st.slots = j.slots; render() } return }
  if (quiet && j.err === 'net') { render(); return }       // 后台核对没连上：先用本机的列表，选存档时会再连
  if (quiet) { st.slots = null; st.confirm = null }        // 口令不对、账号没了：回到登录框
  if (j.ok) { SV.LS.set('ms_lastname', SV.acct.name); SV.LS.set('ms_slots_' + SV.acct.name, j.slots); st.slots = j.slots; st.confirm = null; st.ok = j.created; st.msg = j.created ? '新账号已建好。请记住用户名和口令。' : '' }
  else if (j.err === 'nouser') st.confirm = 'create';
  else { st.ok = false; st.msg = SV.errTxt(j.err); if (j.err === 'pin') SV.setAcct(null) }
  render();
}
async function pick(i) {
  st.busy = true; st.msg = ''; render();
  const j = await SV.cloudLoad(i); st.busy = false;
  if (!j.ok) { st.ok = false; st.msg = SV.errTxt(j.err); render(); return }
  let o = null; try { o = j.data ? JSON.parse(j.data) : null } catch (e) {}
  /* 本机缓存是同一个存档位而且更新（比如上次断网），就用本机的 */
  const loc = SV.loadLocal(SV.acct.name, i);
  /* 有服务器时间就比服务器时间（两台手机的时钟可能不准），没有再比手机时钟 */
  const when = x => x ? Math.max(x.srvAt || x.savedAt || 0, x.gmAt || 0) : 0;   // 0.33 GM 网页改过的存档（gmAt 更新）优先于本机缓存
  if (loc && (!o || when(loc) > when(o))) o = loc;
  o = migrate(o);
  if (!o) { st.msg = '这个存档读不出来。'; render(); return }
  SV.setSlot(i); go(o, false);
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-t]'); if (!b || b.disabled || st.busy || st.started) return; const t = b.dataset.t, i = b.dataset.i != null ? +b.dataset.i : null;
  if (t === 'login') { const n = ($('#lname') || {}).value || '', p = ($('#lpin') || {}).value || '';
    if (!n.trim() || !/^\d{6}$/.test(p)) { st.ok = false; st.msg = SV.errTxt('input'); render(); return }
    const nn = n.trim().slice(0, 12); if (!SV.acct || SV.acct.name !== nn) SV.setSlot(null);
    SV.setAcct({ name: nn, pin: p }); st.slots = null; login(false); return }
  if (t === 'create') { if ((($('#lpin2') || {}).value || '') !== SV.acct.pin) { st.ok = false; st.msg = '两次输入的口令不一样。'; render(); return } login(true); return }
  if (t === 'back') { st.confirm = null; st.msg = ''; if (!st.slots) SV.setAcct(null); render(); return }
  if (t === 'offline') { const o = migrate(SV.loadLocal(SV.acct.name, SV.slot)); if (!o) return; SV.setOfflineMode(true); go(o, false); return }
  if (t === 'logout') { SV.setAcct(null); SV.setSlot(null); st.slots = null; st.msg = ''; render(); return }
  if (t === 'pick') { pick(i); return }
  if ((t === 'new' || t === 'delask' || t === 'del') && st.verifying) { st.ok = true; st.msg = '正在和云端核对存档列表，稍等一下再点'; render(); return }
  if (t === 'new') { SV.setSlot(i); SV.clearLocal(SV.acct.name, i); go(null, true); return }
  if (t === 'delask') { st.confirm = { del: i }; render(); return }
  /* 删除：界面马上变成空存档位，云端在后台删（失败了再提示、恢复） */
  if (t === 'del') { const old = st.slots[i]; st.slots[i] = null; st.confirm = null; st.msg = ''; SV.clearLocal(SV.acct.name, i); if (SV.slot === i) SV.setSlot(null); render();
    SV.cloudDel(i).then(j => { if (j.ok) { SV.LS.set('ms_slots_' + SV.acct.name, j.slots); if (!st.started && !st.confirm) { st.slots = j.slots; render() } return } if (!st.started && st.slots && !st.slots[i]) st.slots[i] = old; st.ok = false; st.msg = '云端没删成：' + SV.errTxt(j.err); if (!st.started) render() }); return }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return; const id = e.target && e.target.id;
  if (id === 'lname') { e.preventDefault(); const p = $('#lpin'); if (p) p.focus() }
  else if (id === 'lpin' || id === 'lpin2') { e.preventDefault(); const b = document.querySelector(id === 'lpin' ? '[data-t="login"]' : '[data-t="create"]'); if (b) b.click() }
});
