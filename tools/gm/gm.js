/* ================= 末世超市 GM 网页（设计/19_GM网页.md） =================
   只放在用户电脑上（末世超市/GM/gm.html），不发布。令牌在用户电脑上打包时填进去，不经过云端。
   读云端所有玩家 → 选存档位 → 读出当前数值 → 改 → 保存（先备份一份，再写回去）。 */
import { BOSSES, QUAL, SLOTS, SLOT_NAME, ITEMS, SKILLS, SKILL_IDS, SKILL_MAX, FB } from '../../src/js/fbcfg.js';
import { dropTable, firstDrop, LOG_MAX, itemName, nameAt, fbFix } from '../../src/js/fblogic.js';
import { GOODS, GOOD_IDS, TREASURE, TREASURE_IDS, CROP_IDS, FISH, FISH_IDS, BUILD, BUILD_ORDER, RANCH_IDS, FIXTURE, SHOP, FISHING } from '../../src/js/config.js';

const GH = window.GM_CFG;
const tok = () => atob(GH.k.split('').reverse().join(''));
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const b64e = s => { const b = new TextEncoder().encode(s); let x = ''; for (let i = 0; i < b.length; i += 0x8000) x += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(x) };
const b64d = s => new TextDecoder().decode(Uint8Array.from(atob(String(s).replace(/\s/g, '')), c => c.charCodeAt(0)));

/* ---------- GitHub ---------- */
let srvOff = 0;                                   // GitHub 服务器时间 − 本机时间
const srvNow = () => Date.now() + srvOff;
async function gh(method, path, body) {
  const r = await fetch(`https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${GH.dir}${path}` + (method === 'GET' ? `?t=${Date.now()}` : ''), {
    method, cache: 'no-store', headers: { Authorization: 'Bearer ' + tok(), Accept: 'application/vnd.github+json' }, body: body ? JSON.stringify(body) : undefined });
  const d = Date.parse(r.headers.get('date') || ''); if (d) srvOff = d - Date.now();
  if (r.status === 401 || r.status === 403) throw new Error('令牌不对或没有权限（' + r.status + '）');
  return r;
}
async function getJson(path) { const r = await gh('GET', path); if (r.status === 404) return null; if (!r.ok) throw new Error('读取失败 ' + r.status); const j = await r.json(); return { sha: j.sha, text: b64d(j.content) } }
async function putText(path, text, sha, msg) {
  const r = await gh('PUT', path, { message: msg, content: b64e(text), ...(sha ? { sha } : {}) });
  if (!r.ok) throw new Error(r.status === 409 || r.status === 422 ? '保存冲突：文件刚被改过，请重新读取' : '保存失败 ' + r.status);
  return (await r.json()).content.sha;
}

/* ---------- 状态 ---------- */
let users = [], cur = null;    // cur = { u, upath, usha, slot, path, sha, S, orig }
const fmtT = t => { if (!t) return '—'; const d = new Date(t), p = n => String(n).padStart(2, '0'); return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}` };
const ago = ms => { const s = Math.max(0, ms / 1000); return s < 90 ? `${Math.round(s)} 秒前` : s < 5400 ? `${Math.round(s / 60)} 分钟前` : s < 172800 ? `${Math.round(s / 3600)} 小时前` : `${Math.round(s / 86400)} 天前` };
function msg(t, k = '') { const m = $('#msg'); m.className = 'msg ' + k; m.innerHTML = t }

/* 玩家在不在线：游戏开着时每分钟存一次；切后台记 bgAt，关游戏记 closedAt */
function onlineState(S) {
  const last = S.srvAt || S.savedAt || 0, now = srvNow();
  if (S.closedAt && S.closedAt >= last - 5000) return { k: 'off', t: `不在线：${ago(now - S.closedAt)}关了游戏。可以放心改。` };
  if (S.bgAt && S.bgAt >= last - 5000) return { k: 'warn', t: `玩家 ${ago(now - S.bgAt)}把游戏切到后台了，没关。如果他切回游戏，游戏里的进度会把你改的覆盖掉。最好让他先彻底关掉游戏。` };
  if (now - last < 180000) return { k: 'on', t: `玩家在线（${ago(now - last)}还在玩）。现在改的话，他的游戏一分钟内会把你改的覆盖掉。请先让他关掉游戏。` };
  return { k: 'off', t: `不在线：最后一次存档是 ${ago(now - last)}。可以改。` };
}

/* ---------- 玩家列表 ---------- */
async function loadUsers() {
  msg('读取玩家列表…'); $('#list').innerHTML = ''; cur = null; $('#edit').innerHTML = '';
  const r = await gh('GET', 'users'); if (!r.ok) throw new Error('读不到玩家列表 ' + r.status);
  const files = (await r.json()).filter(f => f.name.endsWith('.json'));
  users = (await Promise.all(files.map(async f => { const j = await getJson('users/' + f.name); try { return { path: 'users/' + f.name, u: JSON.parse(j.text) } } catch (e) { return null } }))).filter(Boolean);
  users.sort((a, b) => lastOf(b.u) - lastOf(a.u));
  $('#list').innerHTML = users.length ? `<table><tr><th>玩家</th>${[0, 1, 2].map(i => `<th>存档位 ${i + 1}</th>`).join('')}</tr>${users.map((x, ui) => `<tr><td><b>${esc(x.u.name)}</b><small>注册 ${fmtT(x.u.created)}</small></td>${[0, 1, 2].map(i => { const s = x.u.slots[i];
    return s ? `<td><button data-load="${ui}:${i}">读取</button><small>${esc(s.brief || '')}<br>保存于 ${fmtT(s.savedAt)}</small></td>` : '<td><small>空</small></td>' }).join('')}</tr>`).join('')}</table>` : '<p>还没有玩家。</p>';
  msg(`共 ${users.length} 个玩家（最近玩过的在上面）。`);
}
const lastOf = u => Math.max(0, ...u.slots.filter(Boolean).map(s => s.savedAt || 0));

/* ---------- 读一个存档 ---------- */
async function loadSave(ui, slot) {
  const x = users[ui], path = `saves/${x.u.id}_${slot}.json`;
  msg('读取存档…'); const j = await getJson(path); if (!j) { msg('这个存档文件不存在。', 'bad'); return }
  const S = JSON.parse(j.text);
  if (S.fb && S.td) fbFix(S);   /* 设计 105：老存档的传说 key、套装 Lv 先按游戏的规则换好再显示（保存时一起写回去，跟游戏读档一样） */
  cur = { x, slot, path, sha: j.sha, S, orig: JSON.parse(j.text) };
  render(); msg(`读到了：${esc(x.u.name)} 的存档位 ${slot + 1}。改好以后点最下面的「保存」。`);
}

/* 每个能改的数：[分组, 标签, 读, 写, 最小, 最大] */
function fields(S) {
  const F = [], add = (g, label, get, set, min = 0, max = 1e9) => F.push({ g, label, get, set, min, max });
  const p = (obj, k) => [() => obj()[k] || 0, v => { obj()[k] = v }];
  add('货币和道具', '末日币', ...p(() => S, 'coins'));
  add('货币和道具', '星星', ...p(() => S, 'stars'));
  add('货币和道具', '发条', ...p(() => S, 'gear'));
  add('货币和道具', '肥料', ...p(() => S, 'fert'));
  add('货币和道具', '刷新券', ...p(() => S, 'refTix'));
  add('货币和道具', '尸潮券', ...p(() => S.td, 'scrolls'));
  for (const k of Object.keys(FISHING.bait)) add('货币和道具', FISHING.bait[k].name, ...p(() => (S.bait = S.bait || {}), k));
  for (const id of TREASURE_IDS) add('货币和道具', TREASURE[id].name, ...p(() => S.treas, id));
  for (const id of CROP_IDS) add('货币和道具', GOODS[id].name + '种子', ...p(() => S.seeds, id));
  for (const g of GOOD_IDS) if (g !== 'fish') add('仓库商品', GOODS[g].name, ...p(() => S.stock, g));
  for (const id of FISH_IDS) { add('仓库商品', FISH[id].name, ...p(() => (S.fishQ = S.fishQ || {}), id)); F[F.length - 1].fish = true }
  for (const k of [...BUILD_ORDER, ...RANCH_IDS]) { const B = BUILD[k]; if (B.unit !== '级') continue;
    add('等级', B.name, ...p(() => S.lv, k), k === 'store' || k === 'rec' || k === 'wh' || k === 'bag' || k === 'camp' || k === 'rod' ? 1 : 0, B.levels.length - 1) }
  add('等级', '口碑', ...p(() => S, 'rep'), 0, SHOP.repMax);
  add('等级', '经验点', ...p(() => S, 'xp'));
  /* 设计 90：副本（存档里有 S.fb 才列） */
  if (S.fb) {
    add('副本', '晶石', ...p(() => S.fb, 'crys'));
    add('副本', '召唤券', ...p(() => S.fb, 'tix'));   /* 设计 108 */
    for (const n of openLv()) add('副本', `打赢 ${BOSSES[n].name}（第 ${n} 关）`, ...p(() => (S.fb.won = S.fb.won || {}), n));
    for (const k of SKILL_IDS) add('副本', `技能 ${SKILLS[k].name}`, () => (S.fb.sk || {})[k] || 1, v => { (S.fb.sk = S.fb.sk || {})[k] = v }, 1, SKILL_MAX);
  }
  (S.shelves || []).forEach((sh, i) => add('等级', `${i + 1} 号${FIXTURE[sh.type] ? FIXTURE[sh.type].name : '货柜'}档次（1 低 2 中 3 高）`, () => sh.tier || 1, v => { sh.tier = v }, 1, 3));
  return F;
}

function render() {
  const { x, slot, S } = cur, st = onlineState(S), F = fields(S); cur.G = gearInit(S);
  const groups = [...new Set(F.map(f => f.g))];
  $('#edit').innerHTML = `<h2>${esc(x.u.name)} · 存档位 ${slot + 1}</h2>
    <p class="state ${st.k}">${st.t}</p>
    <p><small>超市 ${S.lv.store} 级 · 最后存档 ${fmtT(S.savedAt)}${S.gmAt ? ` · 上次 GM 修改 ${fmtT(S.gmAt)}` : ''}</small>　<button data-reload>重新读取</button></p>
    ${groups.map(g => `<fieldset><legend>${g}</legend><div class="grid">${F.map((f, i) => f.g !== g ? '' : `<label><span>${esc(f.label)}</span><input type="number" data-f="${i}" min="${f.min}" ${f.max < 1e9 ? `max="${f.max}"` : ''} value="${Math.max(f.min, Math.min(f.max, f.get()))}"><em>${f.max < 1e9 ? `${f.min}～${f.max}` : ''}</em></label>`).join('')}</div></fieldset>`).join('')}
    ${gearHtml()}${logHtml()}
    <p class="note">等级调低可能让已经盖好的东西不能用（比如超市降到 2 级店面会变小），慎改。正在施工的建筑改了等级，施工完会再 +1。</p>
    <div class="bar"><button class="main" data-save>保存</button> <span id="chg"></span></div>`;
  cur.F = F; gstMax(); showChanges();
}
function readForm() {
  const ch = [];
  for (const el of document.querySelectorAll('[data-f]')) { const f = cur.F[+el.dataset.f], old = f.get(); let v = Math.floor(+el.value);
    if (el.value === el.defaultValue) { el.classList.remove('changed', 'bad'); continue }   // 没动过的不算（比如老存档缺的字段显示成最小值）
    el.classList.toggle('bad', !Number.isFinite(v) || v < f.min || v > f.max);
    if (!Number.isFinite(v)) continue; v = Math.max(f.min, Math.min(f.max, v));
    el.classList.toggle('changed', v !== old); if (v !== old) ch.push({ f, old, v }) }
  return ch;
}
function showChanges() { const n = readForm().length + diffCount(gearDiff()); $('#chg').textContent = n ? `改了 ${n} 项` : '还没改' }

/* ================= 设计 90：副本装备（身上 / 背包 / 加装备 / 掉落记录） =================
   改的是 cur.G（S.fb 里装备的一份副本），点「保存」才写回存档；改了什么跟原来的比出来（gearDiff）。 */
const openLv = () => BOSSES.map((b, n) => b && b.open ? n : 0).filter(Boolean);
const QORD = ['s', 'l', 'e', 'n'];
const maxSt = k => QUAL[ITEMS[k].q].stars;
const iname = it => `${ITEMS[it.k] ? itemName(it) : it.k} ${it.st || 0}★`;   /* 设计 105：名字按 Lv 查表 */
const lvOf = it => { const D = ITEMS[it.k]; return D && D.set ? D.lv : it.lv || 1 };
const qspan = (k, t) => { const D = ITEMS[k], q = D ? QUAL[D.q] : null; return `<b style="color:${q ? q.tx : '#333'}">${esc(t || (D ? D.name : k))}</b>` };
const lvName = n => BOSSES[n] && BOSSES[n].name ? BOSSES[n].name : `第 ${n} 关`;
const fromTxt = k => { const D = ITEMS[k]; return D.q === 's' ? lvName(D.at) + '（按 Lv' + D.lv + '）' : '各关都掉' };   /* 设计 105：传说也是各关都掉 */
const clone = o => JSON.parse(JSON.stringify(o));
function gearInit(S) {
  if (!S.fb) return null;
  const G = { eq: clone(S.fb.eq || {}), bag: clone(S.fb.bag || []), nid: S.fb.nid || 1, ops: [] };
  const ids = [...G.bag, ...SLOTS.map(s => G.eq[s])].filter(Boolean).map(x => x.id || 0);
  if (S.fb.pend) ids.push(S.fb.pend.id || 0);
  G.nid = Math.max(G.nid, 1 + Math.max(0, ...ids));   // id 不能跟已有的撞
  return G;
}
const bagMax = () => FB.bag;
const haveK = (G, S) => new Set([...G.bag, ...SLOTS.map(s => G.eq[s]), S.fb.pend].filter(Boolean).map(x => x.k + '|' + lvOf(x)));   /* 设计 105：同一个 key 不同关是不同的装备 */
function addItem(G, k, lv, st) { const it = { id: G.nid++, k, lv: ITEMS[k].lv || lv, st, crys: 0, nw: 1 }; G.bag.push(it); return it }

/* 跟原存档比：加了 / 删了 / 卸下 / 改星 */
function gearDiff() {
  if (!cur.G) return [];
  const S = cur.S, where = (eq, bag) => { const m = new Map(); for (const s of SLOTS) if (eq[s]) m.set(eq[s].id, { it: eq[s], at: s }); for (const it of bag) m.set(it.id, { it, at: 'bag' }); return m };
  const A = where(S.fb.eq || {}, S.fb.bag || []), B = where(cur.G.eq, cur.G.bag), out = [];
  const add = new Map();
  for (const [id, b] of B) if (!A.has(id)) { const key = b.it.k + '|' + (b.it.st || 0) + '|' + lvOf(b.it); add.set(key, (add.get(key) || 0) + 1) }
  for (const [key, c] of add) { const [k, st, lv] = key.split('|'); out.push({ t: 'add', txt: `加 ${nameAt(k, +lv)} Lv${lv} ${st}★${c > 1 ? ' ×' + c : ''}`, n: c }) }
  for (const [id, a] of A) {
    const b = B.get(id);
    if (!b) { out.push({ t: 'del', txt: `删 ${iname(a.it)}${a.at !== 'bag' ? '（身上）' : ''}`, n: 1 }); continue }
    if (a.at !== b.at) out.push({ t: 'mv', txt: `卸下 ${itemName(a.it)}`, n: 1 });
    if ((a.it.st || 0) !== (b.it.st || 0)) out.push({ t: 'st', txt: `${itemName(a.it)} ${a.it.st || 0}★→${b.it.st || 0}★`, n: 1 });
  }
  return out;
}
const diffCount = d => d.reduce((a, x) => a + x.n, 0);
/* gmNote 用：同一类合成一句，太长写前 3 件 + 「等 N 件」 */
function gearNote(d) {
  const part = (t, head, cut) => { const xs = d.filter(x => x.t === t); if (!xs.length) return ''; const n = diffCount(xs), names = xs.map(x => x.txt.slice(cut));
    return head + names.slice(0, 3).join('、') + (xs.length > 3 ? ` 等 ${n} 件` : n > xs.length ? `（共 ${n} 件）` : '') };
  return [part('add', '加了 ', 2), part('del', '删了 ', 2), part('mv', '卸下 ', 3), part('st', '改星 ', 0)].filter(Boolean).join('；');
}

function gearHtml() {
  const S = cur.S, G = cur.G;
  if (!G) return `<fieldset><legend>副本装备</legend><p class="note">这个存档还没有副本数据（没进过副本）。</p></fieldset>`;
  const stIn = (it, where) => `<input type="number" class="st" data-gst="${where}:${it.id}" min="0" max="${maxSt(it.k)}" value="${it.st || 0}"><em>0～${maxSt(it.k)}★</em>`;
  const full = G.bag.length >= bagMax();
  const eqRows = SLOTS.map(s => { const it = G.eq[s];
    return `<tr><td>${SLOT_NAME[s]}</td>${it ? `<td>${qspan(it.k, itemName(it))} <small>${QUAL[ITEMS[it.k].q].name}　Lv${lvOf(it)}</small></td><td><label>${stIn(it, 'eq')}</label></td><td><button data-gun="${s}" ${full ? 'disabled title="背包满了"' : ''}>卸到背包</button></td>` : '<td colspan="3"><small>空着</small></td>'}</tr>` }).join('');
  const bagRows = G.bag.map((it, i) => `<tr><td>${i + 1}</td><td>${qspan(it.k, itemName(it))} <small>${SLOT_NAME[ITEMS[it.k].slot]}　${QUAL[ITEMS[it.k].q].name}　Lv${lvOf(it)}${it.nw ? '　新' : ''}</small></td><td><label>${stIn(it, 'bag')}</label></td><td><button data-gdel="${it.id}">删除</button></td></tr>`).join('');
  const opts = QORD.map(q => `<optgroup label="${QUAL[q].name}">${Object.keys(ITEMS).filter(k => ITEMS[k].q === q).map(k => `<option value="${k}">${esc(ITEMS[k].set ? ITEMS[k].name : ITEMS[k].name + ' 等')}　${SLOT_NAME[ITEMS[k].slot]}　${fromTxt(k)}</option>`).join('')}</optgroup>`).join('');
  const lvOpts = (sel) => openLv().map(n => `<option value="${n}" ${n === sel ? 'selected' : ''}>第 ${n} 关 ${lvName(n)}</option>`).join('');
  const pend = S.fb.pend ? `<p class="note">还有一件刚掉、玩家没收下的：${qspan(S.fb.pend.k, iname(S.fb.pend))}（在「获得」框里，GM 不动它）。</p>` : '';
  return `<fieldset id="gear"><legend>副本装备</legend>
    <h3>身上</h3><table class="gt"><tr><th>部位</th><th>装备</th><th>星级</th><th></th></tr>${eqRows}</table>
    <h3>背包 <span class="${full ? 'bad' : ''}">${G.bag.length} / ${bagMax()}</span></h3>${pend}
    ${G.bag.length ? `<table class="gt"><tr><th>#</th><th>装备</th><th>星级</th><th></th></tr>${bagRows}</table>` : '<p class="note">背包是空的。</p>'}
    <h3>加装备</h3>
    <div class="addrow"><select id="gk">${opts}</select>
      <label>星级 <input type="number" id="gst" min="0" value="0"><em id="gstmax"></em></label>
      <label>数量 <input type="number" id="gn" min="1" max="${bagMax()}" value="1"></label>
      <label title="史诗、普通、传说按第几关算 Lv 和名字；套装固定（拾荒者 Lv5、猎杀者 Lv10）">算第几关的（Lv） <select id="glv">${lvOpts(1)}</select></label>
      <button data-gadd>加到背包</button></div>
    <div class="addrow"><select id="gfill">${lvOpts(openLv().slice(-1)[0])}</select> <button data-gfill>这一关缺的都给</button>
      <small class="note">这一关能掉、身上和背包里都没有的传说、史诗各加 1 件（0★）；套装要在上面单独选。</small></div>
    <p id="gmsg" class="msg"></p>
  </fieldset>`;
}
const LOG_TXT = { win: '打赢掉落', take: '收下', wear: '穿上', dis: '分解', gm: 'GM', swap: '传说转换', adj: '传说调整' };
function logHtml() {
  const L = cur.S.fb && Array.isArray(cur.S.fb.log) ? cur.S.fb.log.slice().reverse() : null;
  if (!L) return '';
  const row = e => { const what = e.a === 'swap' && ITEMS[e.from] && ITEMS[e.to] ? `${qspan(e.from, nameAt(e.from, e.lv))} → ${qspan(e.to, nameAt(e.to, e.lv))}（Lv${e.lv}）` : e.a === 'adj' ? esc(e.txt || '') : e.k && ITEMS[e.k] ? qspan(e.k, nameAt(e.k, e.lv || e.n || 1) + (e.lv || e.n ? ` Lv${ITEMS[e.k].set ? ITEMS[e.k].lv : e.lv || e.n}` : '') + (e.a === 'dis' ? ` ${e.st || 0}★` : '')) : esc(e.txt || '');
    const how = e.a === 'win' ? `第 ${e.n} 关 ${lvName(e.n)}　${e.how === 'first' ? '<b>第一次保底</b>' : '随机'}` : e.a === 'gm' ? '管理员改的' : '';
    return `<tr><td>${fmtT(e.t)}</td><td>${LOG_TXT[e.a] || esc(e.a)}</td><td>${what}</td><td><small>${how}</small></td></tr>` };
  return `<fieldset><legend>掉落记录（最新的在上面，最多 ${LOG_MAX} 条）</legend>${L.length ? `<div class="logbox"><table class="gt"><tr><th>时间</th><th>事</th><th>装备</th><th>说明</th></tr>${L.map(row).join('')}</table></div>` : '<p class="note">还没有记录（这个版本以后打赢副本、收下、分解才会记）。</p>'}</fieldset>`;
}
function gearRefresh(m, k = '') { const el = $('#gear'); if (!el) return; const v = { k: $('#gk').value, st: $('#gst').value, n: $('#gn').value, lv: $('#glv').value, f: $('#gfill').value };
  el.outerHTML = gearHtml(); $('#gk').value = v.k; $('#gst').value = v.st; $('#gn').value = v.n; $('#glv').value = v.lv; $('#gfill').value = v.f; gstMax();
  if (m) { const g = $('#gmsg'); g.className = 'msg ' + k; g.innerHTML = m } showChanges() }
function gstMax() { const k = $('#gk') && $('#gk').value; if (!k) return; const mx = maxSt(k); $('#gst').max = mx; $('#gstmax').textContent = `0～${mx}★`; if (+$('#gst').value > mx) $('#gst').value = mx }
function gearAdd() {
  const G = cur.G, k = $('#gk').value, st = Math.max(0, Math.min(maxSt(k), Math.floor(+$('#gst').value || 0))), n = Math.max(1, Math.floor(+$('#gn').value || 1)), lv = +$('#glv').value || 1;
  const room = bagMax() - G.bag.length;
  if (n > room) { gearRefresh(`背包放不下：还能放 ${room} 件，要加 ${n} 件。没加。`, 'bad'); return }
  for (let i = 0; i < n; i++) addItem(G, k, lv, st);
  gearRefresh(`加到背包：${nameAt(k, lv)} Lv${ITEMS[k].lv || lv} ${st}★${n > 1 ? ' ×' + n : ''}（还没保存）`, 'good');
}
function gearFill() {
  const G = cur.G, n = +$('#gfill').value, tb = dropTable(n), have = haveK(G, cur.S);
  const fd = firstDrop(n), keys = [...new Set([...tb.filter(x => x.q === 'l' || x.q === 'e').flatMap(x => x.keys), ...(fd ? fd.keys : [])])].filter(k => ITEMS[k].q === 'l' || ITEMS[k].q === 'e');
  const miss = keys.filter(k => !have.has(k + '|' + (ITEMS[k].lv || n))).sort((a, b) => QORD.indexOf(ITEMS[a].q) - QORD.indexOf(ITEMS[b].q));
  if (!miss.length) { gearRefresh(`第 ${n} 关能掉的传说、史诗，身上和背包里都有了。`); return }
  const room = bagMax() - G.bag.length;
  if (miss.length > room) { gearRefresh(`缺 ${miss.length} 件（${miss.map(k => nameAt(k, n)).join('、')}），背包只能放 ${room} 件。没加，先删几件或者单独加。`, 'bad'); return }
  for (const k of miss) addItem(G, k, n, 0);
  gearRefresh(`加了 ${miss.length} 件：${miss.map(k => qspan(k, nameAt(k, n))).join('、')}（还没保存）`, 'good');
}

/* ---------- 保存 ---------- */
async function save() {
  const ch = readForm(), gd = gearDiff(); if (!ch.length && !gd.length) { msg('什么都没改。'); return }
  /* 设计 90：玩家在线时不让保存（游戏一分钟自动存一次档，会把改的盖掉） */
  if (onlineState(cur.S).k === 'on') { msg('玩家正在玩，先让他完全关掉游戏，再点「重新读取」改。', 'bad'); return }
  /* 存之前再读一次：玩家这期间存过档的话，不能拿旧数据盖掉 */
  const j = await getJson(cur.path); if (!j) { msg('存档文件不见了。', 'bad'); return }
  if (j.sha !== cur.sha) { const S2 = JSON.parse(j.text); if (S2.fb && S2.td) fbFix(S2); cur.sha = j.sha; cur.S = S2; cur.orig = JSON.parse(j.text); render(); msg(`读取以后玩家又存过档（${onlineState(S2).t}）。已经重新读出最新的，请再改一次。`, 'bad'); return }
  const st = onlineState(cur.S);
  if (st.k === 'on') { render(); msg('玩家正在玩，先让他完全关掉游戏，再点「重新读取」改。', 'bad'); return }
  const list = [...ch.map(c => `${c.f.label}：${c.old} → ${c.v}`), ...gd.map(g => '装备：' + g.txt)].join('\n');
  if (!confirm(`${st.k !== 'off' ? '⚠ ' + st.t + '\n\n' : ''}确定保存这些修改？\n\n${list}`)) return;
  const S = cur.S;
  for (const c of ch) c.f.set(c.v);
  /* 鱼：总数 = 每种加起来 */
  if (ch.some(c => c.f.fish)) S.stock.fish = FISH_IDS.reduce((a, id) => a + ((S.fishQ || {})[id] || 0), 0);
  /* 设计 90：装备改动写回 S.fb；掉落记录里也记一条 GM */
  if (gd.length) { S.fb.eq = cur.G.eq; S.fb.bag = cur.G.bag; S.fb.nid = cur.G.nid; const L = Array.isArray(S.fb.log) ? S.fb.log : (S.fb.log = []);
    for (const g of gd) L.push({ t: srvNow(), a: 'gm', txt: g.txt }); if (L.length > LOG_MAX) L.splice(0, L.length - LOG_MAX) }
  const nAll = ch.length + diffCount(gd);
  S.gmAt = srvNow(); S.gmNote = [ch.slice(0, 6).map(c => `${c.f.label} ${c.old}→${c.v}`).join('，') + (ch.length > 6 ? ` 等 ${ch.length} 项` : ''), gd.length ? '装备：' + gearNote(gd) : ''].filter(Boolean).join('；');
  /* 先备份原来的，再写 */
  const d = new Date(), p = n => String(n).padStart(2, '0');
  msg('备份原存档…');
  await putText(`saves/gm_bak_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}_${cur.x.u.id}_${cur.slot}.json`, j.text, null, 'gm backup');
  msg('保存…');
  cur.sha = await putText(cur.path, JSON.stringify(S), cur.sha, 'gm edit');
  /* 存档位摘要（标题页显示的那行）也跟着改 */
  const uj = await getJson(cur.x.path); const u = JSON.parse(uj.text);
  if (u.slots[cur.slot]) { u.slots[cur.slot].brief = `超市 ${S.lv.store || 1} 级　末日币 ${Math.floor(S.coins)}　回收机 ${S.lv.rec} 级　货柜 ${(S.shelves || []).length} 个`; u.slots[cur.slot].savedAt = Date.now();
    await putText(cur.x.path, JSON.stringify(u), uj.sha, 'gm slots'); cur.x.u = u }
  cur.orig = JSON.parse(JSON.stringify(S)); render();
  msg(`已保存 ${nAll} 项（原存档备份在 saves/gm_bak_…）。玩家下次进游戏选这个存档位就是新的数值，会提示「存档被管理员修改过」。`, 'good');
}

/* ---------- 事件 ---------- */
document.addEventListener('click', e => {
  const t = e.target; const run = f => f().catch(err => msg(esc(err.message || err), 'bad'));
  if (t.matches('[data-users]')) run(loadUsers);
  else if (t.matches('[data-load]')) { const [u, s] = t.dataset.load.split(':'); run(() => loadSave(+u, +s)) }
  else if (t.matches('[data-reload]')) run(() => loadSave(users.indexOf(cur.x), cur.slot));
  else if (t.matches('[data-save]')) run(save);
  /* 设计 90：装备 */
  else if (t.matches('[data-gun]')) { const G = cur.G, sl = t.dataset.gun, it = G.eq[sl]; if (!it) return; if (G.bag.length >= bagMax()) { gearRefresh('背包满了，卸不下。', 'bad'); return } G.eq[sl] = null; G.bag.push(it); gearRefresh(`卸下 ${ITEMS[it.k].name}（还没保存）`, 'good') }
  else if (t.matches('[data-gdel]')) { const G = cur.G, i = G.bag.findIndex(x => x.id === +t.dataset.gdel); if (i < 0) return; const it = G.bag.splice(i, 1)[0]; gearRefresh(`删了 ${iname(it)}（还没保存）`, 'good') }
  else if (t.matches('[data-gadd]')) gearAdd();
  else if (t.matches('[data-gfill]')) gearFill();
});
document.addEventListener('input', e => { if (e.target.matches('[data-f]')) showChanges();
  else if (e.target.matches('[data-gst]')) { const [w, id] = e.target.dataset.gst.split(':'), G = cur.G, it = w === 'eq' ? SLOTS.map(s => G.eq[s]).find(x => x && x.id === +id) : G.bag.find(x => x.id === +id); if (!it) return;
    const v = Math.floor(+e.target.value), mx = maxSt(it.k), ok = e.target.value !== '' && Number.isFinite(v) && v >= 0 && v <= mx; e.target.classList.toggle('bad', !ok);
    if (ok) it.st = v; const o = [...SLOTS.map(s => (cur.S.fb.eq || {})[s]), ...(cur.S.fb.bag || [])].find(x => x && x.id === it.id); e.target.classList.toggle('changed', ok && (!o || (o.st || 0) !== v)); showChanges() } });
document.addEventListener('change', e => { if (e.target.id === 'gk') gstMax() });
if (!GH || !GH.k || GH.k.startsWith('@')) msg('令牌还没填进来：请在末世超市文件夹里重新运行打包。', 'bad'); else loadUsers().catch(err => msg(esc(err.message || err), 'bad'));
