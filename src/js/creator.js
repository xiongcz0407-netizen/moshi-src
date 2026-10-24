/* ================= 创建人物（设计 18l） =================
   新开一局（或者老存档还没选过外观）时打开。人物预览就是游戏里的 3D 主角：在左边（设计 29：游戏只有横屏），不跟着滚；固定正面往右 20°、平视，不能转（看不到后颈），站着轻轻呼吸。
   下面 / 右边分页（设计 18q / 18v，男女一样）：发型（款式一排 + 发色一排）｜ 套装（一排缩略图，套装颜色固定，没有颜色排）。多了左右滑；一页不用上下滚。
   设计 18v：发型、套装分男女，选男只列男的、选女只列女的。底部固定「随机」「确定」。男 / 女是预览旁边的小按钮：只换默认搭配（男 = 男发型1 + 蓝套装，女 = 女发型1 + 粉套装），不清空已经选的发色。
   点选项只改高亮和预览，不重建列表（以前每点一下整个面板重画，列表跳回最上面）。
   选好的外观存在存档里（S.look）。之后在菜单里点「改外观」还能再改。 */
import { LOOK, randomLook, cleanLook } from './look.js';
import { drawAvatar, loadAvatar } from './avatar.js';
import { $ } from './ui.js';
import { HERO2, hero2Default, hairsFor, outfitsFor } from './hero2.js';

const hex = c => '#' + c.toString(16).padStart(6, '0');
let cur = null, onChange = null, onDone = null, tab = 'hair', thumbs = null, avatarFn = null;   // thumbs(look) → { 套装 id: 缩略图 }

/* 两页（男女一样，设计 18v）：发型（款式 = 这个性别的每颗发型头一个按钮）+ 发色、发尾；套装（这个性别的缩略图） */
function pages() {
  const sw = (key, list) => list.map((c, i) => ({ key, v: i, color: hex(c) }));
  return [
    { id: 'hair', name: '发型', styles: hairsFor(cur.sex).length ? hairsFor(cur.sex) : [{ id: 'm1', name: '发型 1' }], rows: [
      { label: '发色', items: sw('hc', HERO2.hair) },
      { label: '发尾', items: [{ key: 'hc2', v: -1, text: '同发根' }, ...sw('hc2', HERO2.hair)] }] },
    { id: 'outfit', name: '套装', thumbs: true, rows: [] },
  ];
}
/* 现在选中的值：发型 / 套装没选（空）→ 按男女的默认；模型里没有这个 id → 第一个 */
const val = (k) => {
  const h = { ...hero2Default(cur.sex), ...cur }, d = hero2Default(cur.sex);
  const HS = hairsFor(cur.sex), OS = outfitsFor(cur.sex);   // 设计 18v：只算这个性别的
  if (k === 'hs') return HS.find(x => x.id === h.hs) ? h.hs : HS.find(x => x.id === d.hs) ? d.hs : (HS[0] || {}).id;
  if (k === 'outfit') return OS.find(x => x.id === h.outfit) ? h.outfit : OS.find(x => x.id === d.outfit) ? d.outfit : (OS[0] || {}).id;
  return h[k];
};
const STR = { hs: 1, outfit: 1, sex: 1 };   // 这几项的值是字符串，其他是数字
const TH = () => { try { return thumbs ? thumbs(cur) : {} } catch (e) { return {} } };
const btn = it => it.text
  ? `<button class="ct" data-ck="${it.key}" data-cv="${it.v}">${it.text}</button>`
  : `<button class="sw" data-ck="${it.key}" data-cv="${it.v}" style="background:${it.color}"></button>`;

/* 整个面板只在打开、换男女、换分页时画；点颜色只走 mark() */
function build() {
  const L = cur, P = pages(); if (!P.find(p => p.id === tab)) tab = P[0].id;
  const pg = P.find(p => p.id === tab);
  $('#creator').innerHTML = `
    <div class="cprev">
      <div class="csex">${LOOK.sex.map(s => `<button class="ct" data-ck="sex" data-cv="${s.id}">${s.name}</button>`).join('')}</div>
      <canvas id="cAvatar" width="168" height="194"></canvas>
    </div>
    <div class="cbox">
      <div class="cname"><b>创建你的幸存者</b><input id="cName" maxlength="8" placeholder="店名：幸存者超市" value="${(L.storeName || '').replace(/[&<>"]/g, '')}"></div>
      <div class="ctabs">${P.map(p => `<button class="ctab ${p.id === tab ? 'on' : ''}" data-ctab="${p.id}">${p.name}</button>`).join('')}</div>
      <div class="cpage">
        ${pg.thumbs ? `<div class="chs cthumbs">${outfitsFor(cur.sex).map(o => `<button class="cthumb" data-ck="outfit" data-cv="${o.id}"><img alt="" src="${(TH()[o.id]) || ''}"><span>${o.name}</span></button>`).join('')}</div>`
        : `<div class="crow2"><span class="cl">款式</span><div class="chs">${pg.styles.map(s => `<button class="cstyle" data-ck="hs" data-cv="${s.id}">${s.name}</button>`).join('')}</div></div>`}
        ${pg.rows.map(r => `<div class="crow2"><span class="cl">${r.label}</span><div class="chs">${r.items.map(btn).join('')}</div></div>`).join('')}
      </div>
      <div class="cfoot"><button class="btn ghost" data-ck="random">随机</button><button class="btn" data-ck="done">确定</button></div>
    </div>`;
  mark();
}
/* 只更新高亮和预览（不动 DOM 结构，滚动位置不变） */
function mark() {
  document.querySelectorAll('#creator [data-ck]').forEach(b => {
    const k = b.dataset.ck; if (k === 'random' || k === 'done') return;
    const v = b.dataset.cv; b.classList.toggle('on', k === 'sex' ? cur.sex === v : STR[k] ? val(k) === v : val(k) === +v);
  });
  if (avatarFn) avatarFn($('#cAvatar'), cur); else drawAvatar($('#cAvatar'), cur, { bg: '#3a332b' });
  onChange && onChange({ ...cur });
}

export async function openCreator(look, change, done, opt = {}) {
  cur = { ...look }; onChange = change; onDone = done; tab = 'hair'; thumbs = opt.thumbs || null; avatarFn = opt.avatar || null;
  await loadAvatar();
  $('#creator').classList.remove('hidden'); document.body.classList.add('creating'); build();
}
export const creatorOpen = () => !$('#creator').classList.contains('hidden');

/* 手指拖动：横向拖色块那一排是滑动，不算点；拖预览不做任何事（设计 18l：预览不能转） */
let down = null;
document.addEventListener('pointerdown', e => { if (!cur || !e.target.closest('#creator')) return; down = { x: e.clientX, y: e.clientY, moved: false } });
document.addEventListener('pointermove', e => { if (!down) return;
  if (Math.abs(e.clientX - down.x) > 8 || Math.abs(e.clientY - down.y) > 8) down.moved = true });
document.addEventListener('pointerup', () => { setTimeout(() => { down = null }, 0) });

document.addEventListener('click', e => {
  if (!cur) return;
  if (down && down.moved) return;                 // 刚才是拖动，不算点
  const t = e.target.closest('#creator [data-ctab]'); if (t) { tab = t.dataset.ctab; build(); return }
  const b = e.target.closest('#creator [data-ck]'); if (!b) return;
  const k = b.dataset.ck, v = b.dataset.cv, nm = $('#cName'); if (nm) cur.storeName = nm.value;
  if (k === 'done') {
    cur.storeName = (cur.storeName || '').trim().replace(/[<>&"]/g, '').slice(0, 8);
    $('#creator').classList.add('hidden'); $('#creator').innerHTML = ''; document.body.classList.remove('creating');
    const l = cur; cur = null; onDone && onDone(l); return;
  }
  const pick = a => a.length ? a[Math.floor(Math.random() * a.length)].id : '';
  if (k === 'random') { const r = randomLook(cur.sex); r.hs = pick(hairsFor(cur.sex)); r.outfit = pick(outfitsFor(cur.sex)); cur = { ...cur, ...r }; mark(); return }    // 随机：发型、发色、套装（不换男女）
  if (k === 'sex') { if (cur.sex !== v) { const d = hero2Default(v); cur = { ...cleanLook({ ...cur, sex: v }), hs: d.hs, outfit: d.outfit, storeName: cur.storeName }; build() } return }   // 换男女：换成那边的默认发型 + 套装，发色留着
  cur[k] = STR[k] ? v : +v; mark();
});
