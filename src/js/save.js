/* ================= 存档：本机 + GitHub 云端 + 服务器时间 =================
   和《藩王修仙录》同一套思路：
     <dir>users/u_xxx.json   一个用户一个文件：名字、口令哈希、三个存档位摘要
     <dir>saves/<id>_<位>.json 一个存档位一个文件
     <dir>saves/arch_*.json  删档 / 同一存档位开新局时，旧的一局匿名保留，用来调平衡
   本机一直保留一份当前存档，断网照常玩，联网后自动补传。
   本地文件打开（file://）或令牌为空时，只用本机存档（开发测试用）。 */
import { GH_SAVE } from './ghcfg.js';
import { CLOUD_GAP } from './config.js';

export const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)) } catch (e) { return null } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) {} },
  del(k) { try { localStorage.removeItem(k) } catch (e) {} },
};
export const SLOTS = 3;

/* ---------- 服务器时间：用来算离线时长，改手机时钟没用 ---------- */
let srvBase = 0, perfBase = 0;
export async function syncTime() {
  if (location.protocol === 'file:') return false;
  try {
    const t0 = performance.now();
    const ac = new AbortController(), to = setTimeout(() => ac.abort(), 5000);   // V1.01：网卡住最多等 5 秒，不卡加载
    let r; try { r = await fetch('version.json?t=' + Date.now(), { method: 'HEAD', cache: 'no-store', signal: ac.signal }) } finally { clearTimeout(to) }
    const d = Date.parse(r.headers.get('date') || ''); if (!d) return false;
    srvBase = d + (performance.now() - t0) / 2; perfBase = performance.now(); return true;
  } catch (e) { return false }
}
export const hasSrv = () => srvBase > 0;
/* 有服务器时间就用服务器时间（之后按设备的单调时钟走，不受改时钟影响），没有就退回本机时钟 */
export const srvNow = () => srvBase ? srvBase + (performance.now() - perfBase) : Date.now();

/* ---------- GitHub 读写 ---------- */
const GH = GH_SAVE;
export const cloudCan = () => typeof fetch !== 'undefined' && location.protocol !== 'file:' && !!(GH && GH.owner && GH.repo && GH.k);
const tok = () => atob(GH.k.split('').reverse().join(''));
const b64e = s => { const b = new TextEncoder().encode(s); let x = ''; for (let i = 0; i < b.length; i += 0x8000) x += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(x) };
const b64d = s => new TextDecoder().decode(Uint8Array.from(atob(String(s).replace(/\s/g, '')), c => c.charCodeAt(0)));
async function sha256(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('') }
const shas = {};
class GhErr extends Error { constructor(code) { super(code); this.code = code } }
/* 每个请求最多等 15 秒：手机网络卡住时不会把后面排队的云端操作全堵死 */
async function req(method, path, body, keep) {
  const ac = !keep && typeof AbortController !== 'undefined' ? new AbortController() : null, to = ac && setTimeout(() => ac.abort(), 15000);
  try { return await req1(method, path, body, keep, ac) } catch (e) { if (e instanceof GhErr) throw e; throw new GhErr('net') } finally { to && clearTimeout(to) }
}
async function req1(method, path, body, keep, ac) {
  const r = await fetch(`${GH.api || 'https://api.github.com'}/repos/${GH.owner}/${GH.repo}/contents/${GH.dir || ''}${path}` + (method === 'GET' ? `?t=${Date.now()}` : ''), {
    method, cache: 'no-store', keepalive: !!keep, signal: ac ? ac.signal : undefined,
    headers: { Authorization: 'Bearer ' + tok(), Accept: 'application/vnd.github+json' }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401 || r.status === 403) throw new GhErr('token');
  return r;
}
async function get(path) { const r = await req('GET', path); if (r.status === 404) { delete shas[path]; return null }
  if (!r.ok) throw new GhErr('net'); const j = await r.json(); shas[path] = j.sha; return b64d(j.content) }
async function put(path, text, msg, keep) {
  for (let i = 0; i < 2; i++) {
    const body = { message: msg || 'save', content: b64e(text) }; if (shas[path]) body.sha = shas[path];
    const r = await req('PUT', path, body, keep);
    if (r.ok) { const j = await r.json().catch(() => null); if (j && j.content) shas[path] = j.content.sha; return true }
    if ((r.status === 409 || r.status === 422) && i === 0) { await get(path); continue }
    throw new GhErr('net');
  }
  throw new GhErr('net');
}
async function del(path) { if (!shas[path]) await get(path); if (!shas[path]) return;
  const r = await req('DELETE', path, { message: 'del', sha: shas[path] }); if (r.ok || r.status === 404) { delete shas[path]; return } throw new GhErr('net') }
async function archive(path) {
  const t = await get(path); if (!t) return; const d = new Date(), p = n => String(n).padStart(2, '0');
  await put(`saves/arch_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}_${Math.random().toString(36).slice(2, 8)}.json`, t, 'archive');
}
const savePath = (u, slot) => `saves/${u.id}_${slot}.json`;
const gidOf = data => { const m = /"gid":"([^"]+)"/.exec(data); return m ? m[1] : '' };

/* ---------- 账号 ---------- */
export let acct = LS.get('ms_acct');       // {name,pin}
export let slot = LS.get('ms_slot');
let user = null;                           // {uk,path,u}
export function setAcct(a) { acct = a; if (a) LS.set('ms_acct', a); else { LS.del('ms_acct'); user = null } }
export function setSlot(i) { slot = i; if (i == null) LS.del('ms_slot'); else LS.set('ms_slot', i) }

async function auth(create, fresh) {
  const name = String(acct && acct.name || '').trim().slice(0, 12), pin = String(acct && acct.pin || '');
  if (!name || !/^\d{6}$/.test(pin)) throw new GhErr('input');
  const uk = 'u_' + (await sha256('ms|' + name)).slice(0, 40), path = `users/${uk}.json`;
  const ph = await sha256('pin|' + uk + '|' + pin);
  if (!fresh && user && user.uk === uk && user.u.ph === ph) return user;
  const t = await get(path); let u = t ? JSON.parse(t) : null, created = false;
  if (!u) { if (!create) throw new GhErr('nouser'); u = { id: uk.slice(2, 20), name, ph, slots: [null, null, null], created: Date.now() }; await put(path, JSON.stringify(u), 'new user'); created = true }
  else if (u.ph !== ph) throw new GhErr('pin');
  user = { uk, path, u, created }; return user;
}
/* 所有云端操作排队一个一个做（删存档在后台跑时，马上开新局的上传会等它做完，不会互相打架） */
let chain = Promise.resolve();
const wrap = f => (...a) => { const p = chain.then(async () => { try { return await f(...a) } catch (e) { return { ok: false, err: e && e.code || 'net' } } }); chain = p.catch(() => {}); return p };
export const cloudLogin = wrap(async create => { const a = await auth(create, true); return { ok: true, slots: a.u.slots, created: a.created } });
export const cloudLoad = wrap(async i => { const a = await auth(); const d = await get(savePath(a.u, i)); return { ok: true, data: d } });
export const cloudDel = wrap(async i => { const a = await auth(); await archive(savePath(a.u, i)); await del(savePath(a.u, i)); a.u.slots[i] = null; await put(a.path, JSON.stringify(a.u), 'del slot'); return { ok: true, slots: a.u.slots } });
export const cloudSave = wrap(async (i, data, brief) => {
  const a = await auth(); if (data.length > 900000) return { ok: false, err: 'size' };
  const at = Date.now(), gid = gidOf(data), old = a.u.slots[i];
  if (old && old.gid && gid && old.gid !== gid) await archive(savePath(a.u, i));      // 这个存档位换了一局：旧的先匿名保留
  await put(savePath(a.u, i), data, 'save');
  a.u.slots[i] = { brief: String(brief || '').slice(0, 80), savedAt: at, gid };
  await put(a.path, JSON.stringify(a.u), 'slots');
  return { ok: true, savedAt: at };
});
export const errTxt = e => ({ pin: '口令不对。', input: '用户名不能为空，口令要 6 位数字。', nouser: '这个名字还没有账号。', token: '云端存档的钥匙失效了，请联系作者。', net: '连不上云端，检查一下网络。', size: '存档太大，存不进去。' }[e] || '云端出错了，请稍后再试。');

/* ---------- 保存：本机马上存，云端至少隔 1 分钟传一次 ---------- */
export const cloudState = { ok: null, at: 0, err: '' };
let pushed = '', lastPush = 0, timer = null, getS = null, briefOf = null;
export function bindSave(getter, brief) { getS = getter; briefOf = brief }
/* 离线继续模式：这一局只存本机，不往云端传（免得旧的本机进度盖掉别的手机上更新的云端进度）。
   下次正常登录选这个存档位时，会比较本机和云端哪个更新，用新的那个。 */
let offlineMode = false;
export const setOfflineMode = v => { offlineMode = v };
export const isOffline = () => offlineMode;
const onCloud = () => !offlineMode && cloudCan() && acct && acct.name && slot != null;
/* 本机存档按「用户名 + 存档位」分开存，换存档位不会弄丢没传上去的进度 */
const localKey = (name = acct && acct.name, s = slot) => cloudCan() ? `ms_save_${name || ''}_${s}` : 'ms_save_local';
export const loadLocal = (name, s) => LS.get(localKey(name, s));
export const clearLocal = (name, s) => { LS.del(localKey(name, s)); pushed = '' };
export function saveNow() {
  const S = getS && getS(); if (!S) return;
  S.savedAt = Date.now(); S.srvAt = hasSrv() ? srvNow() : 0;
  LS.set(localKey(), S);
  if (onCloud()) { clearTimeout(timer); timer = setTimeout(push, Math.max(1500, lastPush + CLOUD_GAP - Date.now())) }
}
/* 同一时间只传一次：上一次还没传完，就等它传完再传，免得两次上传互相覆盖 */
let inflight = Promise.resolve();
export function push(force) { inflight = inflight.then(() => push1(force)).catch(() => {}); return inflight }
async function push1(force) {
  const S = getS && getS(); if (!S || !onCloud()) return;
  const data = JSON.stringify(S); if (!force && data === pushed) return; lastPush = Date.now();
  const j = await cloudSave(slot, data, briefOf ? briefOf(S) : '');
  if (j.ok) { pushed = data; Object.assign(cloudState, { ok: true, at: j.savedAt, err: '' }) }
  else Object.assign(cloudState, { ok: false, at: Date.now(), err: j.err });
}
/* 关页面前补传：只写存档文件本身（keepalive，页面关了请求也会发出去） */
export function beacon() {
  const S = getS && getS(); if (!S || !onCloud() || !user) return;
  const data = JSON.stringify(S); if (data === pushed) return;
  const p = savePath(user.u, slot); if (!shas[p]) return;
  const os = user.u.slots[slot]; if (os && os.gid && S.gid && os.gid !== S.gid) return;
  try { req('PUT', p, { message: 'save', content: b64e(data), sha: shas[p] }, true)
    .then(r => r.ok ? r.json().then(j => { if (j && j.content) shas[p] = j.content.sha; pushed = data }) : (delete shas[p]))
    .catch(() => {}) } catch (e) {}
}
