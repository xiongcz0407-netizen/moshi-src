/* ================= 设计 56：副本相关的面板（副本选关、装备（装备 / 炼宝 / 技能）、打完的「获得」框） ================= */
import { frame, gst, resChip, icon, roleTabs } from './ui.js';
import { A } from './assets.js';
import { FB, BOSSES, FB_MAX, QUAL, SLOTS, SLOT_NAME, STAT, ITEMS, SETS, SKILLS, SKILL_IDS, SKILL_MAX, skillCost, CRYSTAL, LEG_SWAP } from './fbcfg.js';
import * as FL from './fblogic.js';
import { busy as refBusy, hold as refHold } from './refinefx.js';   /* 设计 80：敲打动画放着时「炼宝」灰掉 */

export const crysIc = { toString: () => `<img class="crysic" src="${A('img/fb/eq_crystal.png')}" alt="">` };   /* 设计 75：用的时候才算网址 */
const tixIc = () => icon('it', 'tix');   /* 设计 108：召唤券 */
/* 装备图标：品质边框、角上星数 */
/* 设计 85：套装（q-s）图标：左上角红色星星角标 + 边框流光；星越高越华丽（t0 0～3★、t1 4～7★、t2 8～11★、t3 12★），全是 CSS 动画，不跑 JS */
export const setTier = st => st >= 12 ? 3 : st >= 8 ? 2 : st >= 4 ? 1 : 0;
export const setDeco = (q, st) => q !== 's' ? '' : `${setTier(st) >= 3 ? `<i class="srn" style="background-image:url(${A('img/fb/set_ring.png')})"></i>` : ''}<i class="sfl"></i>${setTier(st) >= 2 ? '<i class="sdt"></i>' : ''}<i class="sbg"></i>`;
/* 设计 105：左下角「Lv3」牌子（物品等级 = 第几关；套装按这套的 Lv5 / Lv10），四种品质都标 */
export const lvOf = it => { const D = ITEMS[it.k]; return D && D.set ? D.lv : it.lv || 1 };
const lvTag = lv => `<b class="eqlv">Lv${lv}</b>`;
export const eqIcon = (it, big) => { const D = ITEMS[it.k], st = it.st || 0; return `<span class="eqic q-${D.q}${D.q === 's' ? ' t' + setTier(st) : ''}${big ? ' big' : ''}">${setDeco(D.q, st)}<img src="${A('img/fb/eq_' + (D.ic || it.k) + '.png')}" alt="">${lvTag(lvOf(it))}${st ? `<em${st >= 12 ? ' class="mx"' : ''}>${st}★</em>` : ''}</span>` };
const iname = it => FL.itemName(it);
/* 设计 105（设计104 第 7 条）：套装效果一档一档列，穿够的那档整行绿色加粗，没生效的灰色；以后新套装照样用 */
export const setRows = (k, n) => `<div class="setrows">${[['2 件', 'two', 2], ['4 件', 'four', 4], ['5 件', 'five', 5]].map(([t, f, c]) => `<div class="setrow ${n >= c ? 'on' : 'off'}"><span>${t}</span><b>${SETS[k][f]}</b></div>`).join('')}</div>`;
const setHead = (k, n) => `${SETS[k].name}套装（穿了 <span class="${n >= 2 ? 'setn on' : 'setn'}">${n}/5</span>）`;
/* 设计 105：背包、炼宝的排序 品质 → Lv（高的在前）→ 星级 */
const QO = { l: 4, s: 3, e: 2, n: 1 };
export const gearKey = it => QO[ITEMS[it.k].q] * 10000 + lvOf(it) * 100 + (it.st || 0);
const qName = q => `<b style="color:${QUAL[q].tx}">${QUAL[q].name}</b>`;
const statLines = it => { const s = FL.itemStats(it); return Object.entries(s.main).map(([k, v]) => `<div class="drow"><span>${STAT[k].name}</span><b>${STAT[k].pct ? '+' + v + '%' : '+' + v}</b></div>`).join('') + s.aff.map(([k, v]) => `<div class="drow aff"><span>${STAT[k].name}</span><b>${STAT[k].pct ? '+' + v + '%' : '+' + v}</b></div>`).join('') };
const fmtS = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const bossIc = n => n <= 3 && BOSSES[n].open ? `<img class="bossic" src="${A(n === 1 ? 'img/fb/boss_1.png' : `img/fb${n}/boss_${n}.png`)}" alt="">` : `<span class="bossic q">?</span>`;   /* 设计 81：第 2 关毒囊的头像 */
let refFx = null;   // 炼宝结果动画 { ok, at }
export const setRefFx = r => { refFx = r ? { ...r, at: performance.now() } : null };
/* 设计 105b：传说转换的结果（{ id, from, to, lv, st }）；放完光效（1.6 秒）之前「转换」按钮灰着，不能连点 */
let swapFx = null;
export const setSwapFx = r => { swapFx = r ? { ...r, at: performance.now() } : null };
export const swapBusy = () => !!swapFx && performance.now() - swapFx.at < 1600;

export const FB_TITLES = { fb: '副本', gear: '角色', fbGot: '获得', smith: '铁匠' };   /* 设计 76：装备并进角色页 */
/* 设计 105b：炼宝页（角色页「炼宝」页签和铁匠面板共用）：格子、详情、敲打动画、底部固定栏 */
function refView(S, k, { tabs, res, help }) {
    const H = refHold(), show = it => H && it && H.id === it.id ? { ...it, st: H.st, pity: H.pity } : it;   /* 设计 80：敲打动画放着时照炼之前画 */
    const all = [...SLOTS.map(s => S.fb.eq[s]).filter(Boolean), ...S.fb.bag].map(show).sort((a, b) => gearKey(b) - gearKey(a));   /* 设计 105：品质 → Lv → 星 */
    const cells = all.map(it => ({ id: String(it.id), cls: 'eqcell', html: `${eqIcon(it)}<small>${iname(it)}</small>${Object.values(S.fb.eq).some(e => e && e.id === it.id) ? '<span class="itag ok">穿着</span>' : ''}` }));
    const detail = id => { const it = show(FL.itemById(S, +id)); if (!it) return ''; const D = ITEMS[it.k], max = QUAL[D.q].stars, inf = FL.refineInfo(it);
      const stars = Array.from({ length: 12 }, (_, i) => `<i class="${i < (it.st || 0) ? 'on' : i < max ? '' : 'no'}${refFx && refFx.id === it.id && performance.now() - refFx.at < 1500 && i === (refFx.ok ? it.st - 1 : it.st) ? (refFx.ok ? ' pop' : ' bad') : ''}">★</i>`).join('');
      const nx = inf.max ? null : { ...it, st: inf.to };
      /* 设计 88：属性一直显示（没满星：现在 → 下一星；满星：现在的值）；只有属性这一块上下滚，顶上（图标、星星）和底下的炼宝栏不动 */
      const a = FL.itemStats(it), b = nx && FL.itemStats(nx), pc = k => STAT[k].pct ? '%' : '';
      const list = [...Object.keys(a.main).map(k => [k, a.main[k], b && b.main[k]]), ...a.aff.map(([k, v], i) => [k, v, b && b.aff[i][1]])];
      const attrs = list.map(([k, x, y]) => `<div class="drow"><span>${STAT[k].name}</span><b>${x}${pc(k)}${b && y !== x ? ` → <span class="good">${y}${pc(k)}</span>` : ''}</b></div>`).join('');
      const ok = !inf.max && S.fb.crys >= inf.cost && !refBusy();
      const legWarn = D.q === 'l' && !(it.st > 0) ? '<p class="rfwarn">升星后就不能转换了</p>' : '';   /* 设计 105b：0★ 传说炼宝前提醒 */
      const foot = inf.max ? `<div class="fbfoot rffoot"><span class="fbfl lk">已满星</span><button class="btn" disabled>炼宝</button></div>`
        : `<div class="fbfoot rffoot"><span class="fbfl"><b>升到 ${inf.to} 星　${inf.luck ? '<span class="warn">看运气</span> ' : ''}成功率 ${Math.round(inf.rate * 100)}%${inf.pity ? `（保底 +${Math.round(inf.pity * 100)}%）` : ''}</b><span class="${S.fb.crys >= inf.cost ? '' : 'lack'}">${crysIc}${inf.cost}（有 ${S.fb.crys}）</span></span>
          <button class="btn" data-act="fbRefine" data-arg="${it.id}" ${ok ? '' : 'disabled'}>炼宝</button></div>`;
      return `<div class="fbdw rfw"><div class="rftop"><div class="rfhd">${eqIcon(it, true)}<div><b style="color:${QUAL[D.q].tx}">${iname(it)}</b><small>${QUAL[D.q].name} · Lv${lvOf(it)} · 最高 ${max} 星</small></div></div><div class="refstars">${stars}</div></div>
        <div class="fbds">${attrs}${inf.max ? `<p class="note">最高 ${max} 星，满了。</p>` : ''}
        ${refFx && refFx.id === it.id && performance.now() - refFx.at < 2500 ? `<p class="note ${refFx.ok ? 'good' : 'warn'}">${refFx.ok ? `成功！升到 ${it.st} 星` : '失败了，星星没掉'}</p>` : ''}</div>${legWarn}${foot}</div>` };
    return frame(k, { tabs, cols: 5, rows: 3, cells, detail, dw: 250, res, help, none: '还没有装备，去副本打 BOSS 掉', empty: '<p class="note">点一件装备炼宝（穿着的也能炼）。</p>' });
}
export const FB_PANELS = {
  /* 副本面板：左边 10 关，右边 BOSS 技能、能掉的套装件 / 传说、推荐装备线、要几张召唤券（设计 108） */
  fb(S) {
    FL.fbFix(S);
    const cells = Array.from({ length: FB_MAX }, (_, i) => i + 1).map(n => { const B = BOSSES[n], lock = FL.fbLockWhy(S, n), won = S.fb.won[n] > 0;
      return { id: String(n), cls: 'fbcell' + (lock ? ' locked' : '') + (won ? ' won' : ''), html: `${bossIc(n)}<b>第 ${n} 关</b><small>${B.name}</small>${lock ? `<span class="tdst lk">🔒 ${B.open ? lock : '还没开放'}</span>` : ''}` } });
    const g = gst('fb'); if (g.sel == null) g.sel = '1';
    /* 设计 82：能掉的全列出来（按品质 4 行，从 fblogic.dropTable / firstDrop 读；82b：不写掉落率，每件写名字）；「挑战」固定在详情最下面一条 */
    /* 设计 105：第 n 关的名字（传说点图标看全名 + 特效）、Lv 牌子 */
    const smIc = (k, n) => { const D = ITEMS[k], nm = FL.nameAt(k, n) + (D.fx ? '：' + D.fx : ''); return `<span class="eqic sm q-${D.q}${D.q === 's' ? ' t0' : ''} eqtip" data-nm="${nm}" data-nmc="${QUAL[D.q].color}">${setDeco(D.q, 0)}<img src="${A('img/fb/eq_' + (D.ic || k) + '.png')}" alt="">${lvTag(D.set ? D.lv : n)}</span>` };
    const detail = id => { const n = +id, B = BOSSES[n], why = FL.fbCanStart(S, n), need = FB.tix, have = S.fb.tix || 0, lock = FL.fbLockWhy(S, n), fd = !(S.fb.won[n] > 0) && FL.firstDrop(n);
      const ORD = { s: 0, l: 1, e: 2, n: 3 };   /* 设计 87：显示顺序套装 → 传说 → 史诗 → 普通（只改显示，dropTable 本身不动） */
      const rows = FL.dropTable(n).slice().sort((a, b) => ORD[a.q] - ORD[b.q]).map(r => `<div class="fbdq"><b style="color:${QUAL[r.q].tx}">${QUAL[r.q].name}</b><span class="fbdics">${r.keys.map(k => `<span class="fbdit">${smIc(k, n)}<small style="color:${QUAL[ITEMS[k].q].tx}">${FL.nameAt(k, n)}</small></span>`).join('')}</span></div>`).join('');
      const fdTxt = fd ? `<p class="fbfirst">第一次打赢必掉：${fd.what}（${fd.keys.length <= 3 ? fd.keys.map(k => FL.nameAt(k, n)).join(' / ') : `${fd.keys.length} 件里随机`}）</p>` : '';
      const btn = have < need && !lock ? `<button class="btn grey" data-act="needTix">挑战</button>` : `<button class="btn" data-act="fbGo" data-arg="${n}" ${why ? 'disabled' : ''}>挑战</button>`;
      const foot = lock ? `<span class="fbfl lk">🔒 ${lock}</span>` : `<span class="fbfl need${have >= need ? '' : ' lack'}">${tixIc()}召唤券 ×${need}</span>`;   /* 82d：只写要几张（不写我有几张），居中 */
      return `<div class="fbdw"><div class="fbds">
        <h5>${bossIc(n)} ${B.name}<small>第 ${n} 关</small></h5>
        ${B.skills ? `<div class="dsub">技能（都会先在地上出红色预警）</div>${B.skills.map(([a, b]) => `<div class="fbsk"><b>${a}</b><span>${b}</span></div>`).join('')}` : '<p class="note">这一关还没开放，先打第 1 关刷装备。</p>'}
        <div class="dsub">能掉（每次打赢掉 1 件装备）</div>${fdTxt}${rows}
        <div class="fbdx">另外：<i class="ico-coin"></i>×${FB.coins(n)}　${crysIc}×${FB.crystals(n)}</div>
        <div class="drow"><span>推荐装备</span><b>${B.rec}</b></div>
        ${S.fb.best[n] ? `<div class="drow"><span>最快</span><b>${fmtS(S.fb.best[n])}</b></div>` : ''}
        ${why && !lock && have >= need ? `<p class="note warn">${why}</p>` : ''}
      </div><div class="fbfoot">${foot}${btn}</div></div>` };
    return frame('fb', { cols: 2, rows: 5, cells, detail, dw: 250,
      res: resChip(tixIc(), S.fb.tix || 0) + resChip(crysIc, S.fb.crys),
      top: `<span>只能主角一个人打，3 分钟后 BOSS 狂暴</span><span>召唤券在院子商人那里买</span>`,
      help: `<b>副本</b><p>超市 ${FB.store} 级开放。走进院子商人旁边的传送门，选一关挑战，打 BOSS 掉装备。每次挑战 1 张召唤券（不管第几关，院子商人那里买，${FB.tixPrice} 末日币一张）。</p><p>右下角：大按钮按住才开枪（有小丧尸先打小丧尸）；集火、翻滚、震荡弹有冷却。地上出红色预警就躲开，填满就打下来。震荡弹能打断白色施法条的技能，红色的大招打断不了。</p><p>3 分钟后 BOSS 狂暴（伤害 ×2、出招更快）。倒下就输，没有掉落，召唤券不退。</p><p>第 2 关毒囊在北边崖下不会走动，要躲毒池和毒雾；看它的头就知道要放什么招（大招时眼睛变红）。</p><p>打赢：末日币、晶石、1 件装备。宝箱不开就回超市也照样给。</p>` });
  },
  /* 装备（设计36 第十二节；设计56 10-21：装备 / 背包 / 炼宝 / 技能 4 个页签，左右两栏各自滚动） */
  gear(S) {
    FL.fbFix(S);
    const full = FL.bagFull(S);
    const tabs = roleTabs(S, true), g = gst('gear'); if (!tabs.find(t => t.id === g.tab) || g.tab[0] === '@') g.tab = 'eq';   /* 设计 76：前面多一个「主角」页签（回角色面板） */
    const res = resChip(crysIc, S.fb.crys) + resChip('<i class="ico-coin"></i>', Math.floor(S.coins));
    const help = `<b>装备</b><p>5 个部位：武器、头盔、护甲、手套、鞋子。品质：普通（灰）、史诗（紫）、套装（红）、传说（橙），属性固定。装备只在副本里有用。</p><p>背包最多 ${FB.bag} 件：比身上好的角上有绿色 ↑，新得到的有红点。不要的分解成晶石（普通 1 颗、史诗 3 颗、套装和传说 6 颗，再退一半炼进去的晶石）。</p><p>炼宝：找铁匠（传送门旁边），用晶石升星，每星所有数值 +10%。普通最高 6 星、史诗 9 星、套装和传说 12 星。失败不掉星；4～8 星每失败一次下次 +5%（保底），9 星以上看运气。传说没升过星时，可以在铁匠那里转换成同一关的另一种传说。</p><p>晶石：副本打赢给，院子商人补给页买，或者星星兑换（1 星 = ${CRYSTAL.perStar} 颗）。</p><p>技能：花末日币升级，最高 ${SKILL_MAX} 级。</p>`;
    const gs = FL.gearStats(S);
    /* 一件装备的详情；cmp：跟身上那件逐条比（多的绿、少的红） */
    const itemDetail = (it, worn) => {
      const D = ITEMS[it.k], cur = S.fb.eq[D.slot], up = !worn && FL.better(S, it);
      /* 跟身上比：把这件换上去，整身的总属性（含套装效果）差多少；多的绿、少的红 */
      const after = FL.gearAfter(S, it), before = gs;
      const own = FL.itemStats(it), ownT = {}; for (const [k, v] of Object.entries(own.main)) ownT[k] = (ownT[k] || 0) + v; for (const [k, v] of own.aff) ownT[k] = (ownT[k] || 0) + v;
      const keys = [...new Set([...Object.keys(ownT), ...(worn ? [] : Object.keys(STAT).filter(k => Math.abs((after[k] || 0) - (before[k] || 0)) > 0.05))])];
      const rows = keys.map(k => { const v = ownT[k], d = worn ? 0 : +((after[k] || 0) - (before[k] || 0)).toFixed(1); return `<div class="drow"><span>${STAT[k].name}</span><b>${v != null ? '+' + +(+v).toFixed(1) + (STAT[k].pct ? '%' : '') : '—'}${d ? ` <em class="${d > 0 ? 'up' : 'dn'}">${d > 0 ? '+' : ''}${d}${STAT[k].pct ? '%' : ''}</em>` : ''}</b></div>` }).join('');
      const setChg = worn ? '' : Object.keys(SETS).filter(k => (after.sets[k] || 0) !== (before.sets[k] || 0)).map(k => { const a = before.sets[k] || 0, b = after.sets[k] || 0, da = +((after.all || 0) - (before.all || 0)).toFixed(0);
        return `<p class="setchg ${b < a ? 'dn' : 'up'}">${b < a ? '卸下身上那件' : '换上'}：${SETS[k].name} ${a}/5 → ${b}/5${da ? `，全部伤害 ${da > 0 ? '+' : '−'}${Math.abs(da)}%` : ''}</p>` }).join('');
      const setP = D.set ? `<div class="dsub">${setHead(D.set, gs.sets[D.set] || 0)}</div>${setRows(D.set, gs.sets[D.set] || 0)}` : D.slot === 'm' ? '<p class="note">护符不属于套装。</p>' : '';
      /* 设计 105（设计104 第 4、5 条）：炼到跟身上一样的星级时比一比；现在不如身上、同星更好时金色 ⇡ */
      const upAt = !worn && !up && FL.betterAt(S, it);
      const same = !worn && cur ? (() => { const at = FL.capSt(it, cur.st), a = FL.statsAt(it, cur.st), b = FL.itemStats(cur), pc = k => STAT[k].pct ? '%' : '';
        const ln = Object.keys(a.main).map(k => { const x = a.main[k], y = b.main[k] || 0; return `<span class="${x > y + 0.05 ? 'good' : x < y - 0.05 ? 'bad' : ''}">${STAT[k].name} ${x}${pc(k)}（身上 ${y}${pc(k)}）${x > y + 0.05 ? '↑' : x < y - 0.05 ? '↓' : ''}</span>` }).join('　');
        return `<div class="samest"><small>炼到跟身上一样的 ${at}★${at < (cur.st || 0) ? `（这件最高 ${at}★）` : ''}：</small>${ln}</div>` })() : '';
      return `<h5>${eqIcon(it)} ${iname(it)}<small>${qName(D.q)} · ${SLOT_NAME[D.slot]}</small></h5>
        <div class="drow"><span>物品等级</span><b>Lv${lvOf(it)}　${it.st || 0}★</b></div>${!worn ? '<div class="dsub">属性（右边小字：换上以后整身变化，含套装）</div>' : ''}${rows}${setChg}
        ${D.fx ? `<div class="drow"><span>传说特效</span><b class="nw" style="color:${QUAL.l.tx}">${D.fx}</b></div>` : ''}${setP}
        ${!worn ? `<div class="dsub">${cur ? `身上：${iname(cur)} Lv${lvOf(cur)} ${cur.st || 0}★　<span class="${up ? 'good' : upAt ? 'gold' : 'warn'}">${up ? '↑ 这件更好' : upAt ? '⇡ 炼了更好' : '身上的更好'}</span>` : `身上${SLOT_NAME[D.slot]}还空着`}</div>${same}` : ''}
        <div class="btns">${worn ? `<button class="btn" data-act="fbSwap" data-arg="${D.slot}">换一件</button>` : `<button class="btn" data-act="fbEquip" data-arg="${it.id}">穿上</button><button class="btn ghost" data-act="fbDis" data-arg="${it.id}">分解（${crysIc}${FL.dismantleGain(it)}）</button>`}<button class="btn ghost" data-act="toSmith" data-arg="ref">去铁匠那里炼宝</button>${!worn && D.q === 'l' && S.fb.bag.includes(it) ? '<button class="btn ghost" data-act="toSmith" data-arg="swap">去铁匠那里转换</button>' : ''}</div>` };
    if (g.tab === 'sk') {
      const cells = SKILL_IDS.map(k => ({ id: k, cls: 'skcell', html: `<img class="skic" src="${A('img/fb/btn_' + k + '.png')}" alt=""><b>${SKILLS[k].name}</b><small>${S.fb.sk[k]} 级</small>` }));
      const detail = id => { const K = SKILLS[id], lv = S.fb.sk[id], nx = lv + 1, c = skillCost(nx);
        return `<h5><img class="skic sm" src="${A('img/fb/btn_' + id + '.png')}" alt=""> ${K.name}<small>${K.key}　${lv} 级</small></h5>
          <div class="drow"><span>现在</span><b class="nw">${K.d(lv)}；冷却 ${K.cd(lv)} 秒</b></div>
          ${lv < SKILL_MAX ? `<div class="drow"><span>${nx} 级</span><b class="nw good">${K.d(nx)}；冷却 ${K.cd(nx)} 秒</b></div><button class="btn" data-act="fbSkill" data-arg="${id}" ${S.coins >= c ? '' : 'disabled'}>升到 ${nx} 级　<span class="cic${S.coins >= c ? '' : ' lack'}"><i class="ico-coin"></i>${c}</span></button>` : '<p class="note">满级了。</p>'}` };
      if (g.sel == null) g.sel = 'focus';
      return frame('gear', { tabs, cols: 3, rows: 1, cells, detail, dw: 280, res, help });
    }
    if (g.tab === 'ref') g.tab = 'eq';   /* 设计 107：角色页没有炼宝页签了（老的跳转到这里的，改看装备） */
    if (g.tab === 'bag') {
      const f = g.f || 'all', sort = g.sort || 'q';
      let list = S.fb.bag.filter(it => f === 'all' || ITEMS[it.k].slot === f);
      const key = { q: gearKey, st: it => (it.st || 0) * 10000 + QO[ITEMS[it.k].q] * 100 + lvOf(it), lv: it => lvOf(it) * 10000 + QO[ITEMS[it.k].q] * 100 + (it.st || 0), new: it => it.id }[sort];
      list = list.slice().sort((a, b) => key(b) - key(a));
      const sel = g.sel != null ? FL.itemById(S, +g.sel) : null; if (sel && sel.nw) delete sel.nw;   // 看过了：红点去掉
      const cells = list.map(it => { const up = FL.better(S, it), upAt = !up && FL.betterAt(S, it); return { id: String(it.id), cls: 'eqcell', html: `${eqIcon(it)}<small>${iname(it)}</small>${up ? '<span class="equp">↑</span>' : upAt ? '<span class="equp gold">⇡</span>' : ''}${it.nw ? '<i class="eqnew"></i>' : ''}` } });
      const chip = (act, v, cur, txt) => `<button class="gchip${v === cur ? ' on' : ''}" data-act="${act}" data-arg="${v}">${txt}</button>`;
      const lead = `<div class="baghd"><b class="${full ? 'warn' : ''}">${full ? `背包满了（${S.fb.bag.length}/${FB.bag}）` : `背包 ${S.fb.bag.length}/${FB.bag}`}</b></div>
        <div class="bagbar">${chip('fbFilter', 'all', f, '全部')}${SLOTS.map(sl => chip('fbFilter', sl, f, SLOT_NAME[sl])).join('')}</div>
        <div class="bagbar sm"><span>排序</span>${chip('fbSort', 'q', sort, '品质')}${chip('fbSort', 'st', sort, '星数')}${chip('fbSort', 'lv', sort, '掉落关数')}${chip('fbSort', 'new', sort, '新得到的')}</div>`;
      const nN = FL.normals(S).length;
      const foot = `<div class="bagft"><button class="btn sm ghost" data-act="fbDisN" ${nN ? '' : 'disabled'}>一键分解普通（${nN} 件）</button></div>`;
      const detail = id => { const it = FL.itemById(S, +id); return it ? itemDetail(it, false) : '' };
      return frame('gear', { tabs, cols: 4, rows: 3, cells, detail, dw: 230, res, help, lead, foot, none: f === 'all' ? '背包是空的，去副本打 BOSS 掉' : `背包里没有${SLOT_NAME[f]}`,
        empty: '<p class="note">点一件装备，看属性、跟身上那件比。</p>' });
    }
    /* 装备页：只放身上 5 个格子 + 主角 + 总属性 + 套装进度；点格子右边看详情 */
    const slot = s => { const it = S.fb.eq[s]; return `<div class="eqslot ${it ? 'has' : ''}${g.sel === 'eq:' + s ? ' sel' : ''}" data-gsel="eq:${s}">${it ? eqIcon(it) : '<span class="eqic none"></span>'}<small>${SLOT_NAME[s]}</small></div>` };
    const tot = Object.entries(gs).filter(([k, v]) => STAT[k] && v > 0).map(([k, v]) => `<div class="drow"><span>${STAT[k].name}</span><b>${STAT[k].pct ? '+' + (+v.toFixed(1)) + '%' : '+' + Math.round(v)}</b></div>`).join('') || '<p class="note">还没穿装备，去副本打 BOSS 掉。</p>';
    const sets = Object.keys(SETS).map(k => { const n = gs.sets[k] || 0; return `<div class="setprog"><div class="setnm">${setHead(k, n)}</div>${setRows(k, n)}</div>` }).join('');   /* 设计 105：跟详情同一个 setRows */
    const legs = SLOTS.map(s => S.fb.eq[s]).filter(it => it && ITEMS[it.k].q === 'l').map(it => `<div class="drow"><span>${iname(it)}</span><b class="nw" style="color:${QUAL.l.tx}">${ITEMS[it.k].fx}</b></div>`).join('');
    const left = `<div class="eqfig"><div class="eqcol">${['w', 'h', 'a'].map(slot).join('')}</div><div class="eqhero" data-heromount></div><div class="eqcol">${['g', 'b', 'm'].map(slot).join('')}</div></div>`;
    const detail = id => { const sl = id.slice(3), it = S.fb.eq[sl]; return it ? itemDetail(it, true) : `<h5>${SLOT_NAME[sl]}</h5><p class="note">还空着。</p><div class="btns"><button class="btn" data-act="fbSwap" data-arg="${sl}">换一件</button></div>` };
    const summary = `<h5>总属性</h5>${tot}<div class="dsub">套装</div>${sets}${legs ? `<div class="dsub">传说特效</div>${legs}` : ''}`;
    if (g.sel != null && !String(g.sel).startsWith('eq:')) g.sel = null;
    return frame('gear', { tabs, noGrid: true, left, detail, dw: 300, res, help, empty: summary });
  },
  /* 设计 105b：铁匠面板（炼宝 | 传说转换）。设计 107 里铁匠 NPC 走近就打开它 */
  smith(S) {
    FL.fbFix(S);
    const tabs = [{ id: 'ref', name: '炼宝' }, { id: 'swap', name: '传说转换' }], g = gst('smith'); if (!tabs.find(t => t.id === g.tab)) g.tab = 'ref';
    const res = resChip(crysIc, S.fb.crys) + resChip('<i class="ico-coin"></i>', Math.floor(S.coins));
    const help = `<b>铁匠</b><p>炼宝给装备升星；传说转换把背包里没升过星的传说花 ${LEG_SWAP} 末日币随机换成同一关的另一种传说。升星以后就不能转换了。</p><p>炼宝：用晶石升星，每星所有数值 +10%。普通最高 6 星、史诗 9 星、套装和传说 12 星。失败不掉星；4～8 星每失败一次下次 +5%（保底），9 星以上看运气。</p><p>传说转换：只有 0★（没升过星）的传说能转；结果随机（另外 5 种机会一样，不会换回自己），不能选；Lv 不变。身上穿着的传说要先卸下。</p>`;
    if (g.tab === 'ref') return refView(S, 'smith', { tabs, res, help });
    /* 0★ 的排前面；升过星的排后面、变灰，角上写「已升星」 */
    const legs = S.fb.bag.filter(it => ITEMS[it.k].q === 'l').sort((a, b) => (FL.swapOk(b) - FL.swapOk(a)) * 1e6 + gearKey(b) - gearKey(a));
    const cells = legs.map(it => ({ id: String(it.id), cls: 'eqcell' + (FL.swapOk(it) ? '' : ' swno'), html: `${eqIcon(it)}<small>${iname(it)}</small>${FL.swapOk(it) ? '' : '<span class="itag swst">已升星</span>'}` }));
    const detail = id => {
      const it = S.fb.bag.find(x => x.id === +id); if (!it) return ''; const D = ITEMS[it.k], lv = lvOf(it), busy = swapBusy();
      const fx = swapFx && swapFx.id === it.id && performance.now() - swapFx.at < 60000 ? swapFx : null;
      const res = fx ? `<div class="swapres${busy ? ' play' : ''}"><div class="swl">传说转换</div><div class="swt"><b class="old">${FL.nameAt(fx.from, fx.lv)}</b> Lv${fx.lv} <span>→</span> <b style="color:${QUAL.l.tx}">${FL.nameAt(fx.to, fx.lv)}</b> Lv${fx.lv}</div><div class="swfx">${ITEMS[fx.to].fx}</div></div>` : '';
      const tg = FL.swapTargets(it).map(k => `<span class="swtg eqtip" data-nm="${FL.nameAt(k, lv)}（${SLOT_NAME[ITEMS[k].slot]}）：${ITEMS[k].fx}">${FL.nameAt(k, lv)}</span>`).join('');   /* 设计 107b：5 个名字一行排开、不用滚就看得到；点名字看部位和特效 */
      const okSt = FL.swapOk(it), can = okSt && S.coins >= LEG_SWAP && !busy;
      return `<div class="fbdw"><div class="fbds">${res}
        <h5>${eqIcon(it)} ${iname(it)}<small>${qName(D.q)} · ${SLOT_NAME[D.slot]} · Lv${lv} · ${it.st || 0}★</small></h5>
        ${okSt ? `<p class="note swnote2">随机换成下面 5 种之一（机会一样，Lv 不变）：</p>
        <div class="swtgs">${tg}</div>` : '<p class="note warn swnote">升过星的传说不能转换（只有 0★ 的能转）。</p>'}
        <div class="drow"><span>传说特效</span><b class="nw" style="color:${QUAL.l.tx}">${D.fx}</b></div></div>
        <div class="fbfoot"><span class="fbfl need${S.coins >= LEG_SWAP || !okSt ? '' : ' lack'}"><i class="ico-coin"></i>${LEG_SWAP}</span><button class="btn" data-act="fbLegSwap" data-arg="${it.id}" ${can ? '' : 'disabled'}>转换</button></div></div>` };
    return frame('smith', { tabs, cols: 5, rows: 3, cells, detail, dw: 260, res, help,
      none: '背包里没有传说装备。副本里打到的传说，没升星前可以在这里换成同一关的其他传说。', empty: `<p class="note">点一件背包里没升过星的传说：花 ${LEG_SWAP} 末日币随机换成同一关的另一种传说。</p>` });
  },
  /* 「获得」框（设计53 第三节） */
  fbGot(S) {
    const r = S.fb.got; if (!r) return '<p class="note">没有东西。</p>';
    const it = S.fb.pend, D = it && ITEMS[it.k], full = FL.bagFull(S), up = it && FL.better(S, it), upAt = it && !up && FL.betterAt(S, it);
    return `<div class="got"><div class="gothd"><b>击败 ${BOSSES[r.n].name}</b><span>用时 ${fmtS(r.secs || 0)}</span>${r.first ? '<em>首次击败</em>' : ''}</div>
      ${it ? `<div class="gotit q-${D.q}">${eqIcon(it, true)}<div><b style="color:${QUAL[D.q].tx}">${iname(it)}</b><small>${QUAL[D.q].name} · ${SLOT_NAME[D.slot]} · Lv${lvOf(it)}</small>${statLines(it)}${D.fx ? `<div class="note" style="color:${QUAL.l.tx}">${D.fx}</div>` : ''}${up ? '<div class="good">↑ 比身上的好</div>' : upAt ? '<div class="gold">⇡ 炼到跟身上一样的星级会更好</div>' : ''}</div></div>` : `<div class="note">装备已经收好了。</div>`}
      <div class="gotres"><span>${crysIc}×${r.crys}</span><span><i class="ico-coin"></i>×${r.coins}</span></div>
      ${it ? `<div class="btns">${up ? `<button class="btn" data-act="fbEquip" data-arg="${it.id}">穿上</button>` : ''}<button class="btn ${up ? 'ghost' : ''}" data-act="fbTake" ${full ? 'disabled' : ''}>${full ? '背包满了' : '收下'}</button><button class="btn ghost" data-act="fbDis" data-arg="${it.id}">分解（${crysIc}${FL.dismantleGain(it)}）</button></div>` : `<div class="btns"><button class="btn" data-act="fbGotClose">好的</button></div>`}</div>`;
  },
};
