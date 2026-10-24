/* ================= 布置：超市里的网格 =================
   超市里面切成 0.8 米一格的网格。货柜按种类占 3×1、2×2、2×1 格（可以转 90°），放的时候要满足：
   1. 整个货柜在店里，不压到收银台、冰箱、盆栽这些固定摆设，也不压到门口、排队、收银员站的地方；
   2. 正面那一排空着（顾客站）；左右两头至少一头能走人；背面可以贴墙、贴别的货柜；
   3. 从门口能走到每个货柜前面、排队的位置和收银台后面（自动检查连通）。
   这个文件不碰画面（没有 three.js），逻辑、画面、顾客找路都用它。 */
import { FIXTURE } from './config.js';
export const G = { x0: -30.8, z0: -9.8, cell: 0.8, cols: 19, rows: 15 };
export const ROWS_SMALL = 15, ROWS_BIG = 25;       // 超市 3 级店面往南扩大以后，网格多 10 行（到 z≈10.2）
export const SHELF_N = 40;                          // 设计 39：货柜不限数量（头顶牌子按这么多准备，没有的不显示）

/* 格子 ↔ 世界坐标（格子中心） */
export const cx = c => G.x0 + (c + 0.5) * G.cell;
export const cz = r => G.z0 + (r + 0.5) * G.cell;
export const toCell = (x, z) => [Math.floor((x - G.x0) / G.cell), Math.floor((z - G.z0) / G.cell)];
const inGrid = (c, r) => c >= 0 && r >= 0 && c < G.cols && r < G.rows;
const key = (c, r) => r * G.cols + c;

/* 店里的摆设（0.13 起都能在「布置」里挪动、旋转）：收银台 + 几样装饰。
   S.fix = { reg: {c, r, rot}, deco: [{k, c, r, rot, hide}] }。收银台像货柜一样有正面：正面一条直线是排队的地方（QLEN 格），
   背面一排是收银员站的地方；装饰只占自己的格子，可以收起来（hide）不摆。门口那块（KEEP_DOOR）永远空着。 */
export const FIX_SIZE = { reg: [3, 1], fridgeDeco: [2, 1], boxes: [2, 1], plantDoor: [1, 1], plantSW: [1, 1], lamp: [1, 1],
  kitchen: [4, 3], kitchen2: [4, 3], mayo: [4, 3], pickle: [4, 3], jam: [4, 3], smoke: [4, 3], loom: [4, 3], cheese: [4, 3],
  wood: [3, 3], sweet: [3, 3], split: [3, 3], can: [3, 3], dry: [3, 3] };   // 设计 31～33 新机器 3×3（工坊 12 台用 wsSpot 摆过，放得下）   // 0.42 用户：机器放大（比人高）   // 0.42 工坊的厨房、机器
export const FIX_NAME = { reg: '收银台', fridgeDeco: '冰箱摆设', boxes: '纸箱', plantDoor: '盆栽', plantSW: '盆栽', lamp: '落地灯',
  kitchen: '厨房', kitchen2: '厨房 2', mayo: '蛋品机', pickle: '腌菜缸', jam: '果酱锅', smoke: '熏炉', loom: '纺织机', cheese: '奶品机',
  wood: '木工台', sweet: '甜品机', split: '分解机', can: '罐头机', dry: '烘干机' };
/* 0.42 用户：超市 3 级起网格往南多 10 行，但第 15 行是店和工坊之间的墙（只有中间 3 格是门）；货柜、收银台、装饰只能放店里（0～14 行），工坊的机器只能放工坊里（16 行以后），也能挪、转 */
export const WALL_R = 15;
/* 设计 43：回到 0.43 的格局——露天工坊贴着超市南墙（x -31～-15、z 2.9～17，0.8 米一格，19 列 × 17 行），从超市南门进出。
   入口在北边正对超市南门（第 9 列、第 0 行），门口那两行空着当走道。12 台默认 3 排 × 4 台，都朝南，台和台之间空一格走人 */
export const WG = { x0: -30.8, z0: 3.0, cell: 0.8, cols: 19, rows: 21 };   /* 设计 70：往南多 4 行（放得下 4×3 的厨房 2 + 正面一格），起点不动 */
export const WS_DEF = { kitchen: { c: 1, r: 3, rot: 0 }, mayo: { c: 6, r: 3, rot: 0 }, pickle: { c: 11, r: 3, rot: 0 }, jam: { c: 16, r: 3, rot: 0 },
  smoke: { c: 1, r: 8, rot: 0 }, loom: { c: 6, r: 8, rot: 0 }, cheese: { c: 11, r: 8, rot: 0 }, kitchen2: { c: 16, r: 8, rot: 0 },
  sweet: { c: 1, r: 13, rot: 0 }, split: { c: 5, r: 13, rot: 0 }, can: { c: 9, r: 13, rot: 0 }, dry: { c: 13, r: 13, rot: 0 }, wood: { c: 17, r: 13, rot: 0 } };
/* 设计 68：多了「厨房 2」（4×3）：默认摆法改成 第 1 排 4 台大的、第 2 排 3 台大的 + 厨房 2、第 3 排 5 台 3×3（木工台挪到第 3 排最东边），13 台都放得下。
   已经摆好的存档不动；厨房 2 在原来的摆法里找不到空地方时，整个工坊换成这个默认摆法（fixWs） */   // c、r 是机器中间那一格
export const WS_ENTRY = [9, 0];
export const WS_BLOCK = [];   // 设计 40：仓库不在工坊里了
export const wsCells = w => cellsOf({ ...w, t: '_' + w.k });
export const wcx = c => WG.x0 + (c + 0.5) * WG.cell, wcz = r => WG.z0 + (r + 0.5) * WG.cell;
export const wsToCell = (x, z) => [Math.floor((x - WG.x0) / WG.cell), Math.floor((z - WG.z0) / WG.cell)];
const inWG = (c, r) => c >= 0 && r >= 0 && c < WG.cols && r < WG.rows, wkey = (c, r) => r * WG.cols + c;
/* 机器在世界里的位置（占的格子的中心）和朝向；正面那一排、正中那一格（工匠站的地方） */
export const wsWorld = w => { const cs = wsCells(w); return { x: cs.reduce((a, [c]) => a + wcx(c), 0) / cs.length, z: cs.reduce((a, [, r]) => a + wcz(r), 0) / cs.length, ry: w.rot * Math.PI / 2 } };
export const wsFront = w => frontRow({ ...w, t: '_' + w.k });
export const wsFrontWorld = w => { const [c, r] = frontCell({ ...w, t: '_' + w.k }); return { x: wcx(c), z: wcz(r) } };
/* 工坊的摆法行不行：机器都在网格里、不重叠，正面一排空着，从入口走得到每台机器前面。返回 {which: 下标, why} 或 null */
export function wsProblem(ws) {
  const occ = new Map(WS_BLOCK.map(([c, r]) => [wkey(c, r), '仓库']));
  for (let i = 0; i < ws.length; i++) { const nm = FIX_NAME[ws[i].k];
    for (const [c, r] of wsCells(ws[i])) { if (!inWG(c, r)) return { which: i, why: '超出工坊了' }; const k = wkey(c, r); if (occ.has(k)) return { which: i, why: `和${occ.get(k)}重叠了` }; occ.set(k, nm) } }
  if (occ.has(wkey(...WS_ENTRY))) { for (let i = 0; i < ws.length; i++) if (wsCells(ws[i]).some(([c, r]) => c === WS_ENTRY[0] && r === WS_ENTRY[1])) return { which: i, why: '入口要空着' } }
  for (let i = 0; i < ws.length; i++) for (const [c, r] of wsFront(ws[i])) if (!inWG(c, r) || occ.has(wkey(c, r))) return { which: i, why: '正面要空出一格（站人做东西）' };
  const seen = new Uint8Array(WG.cols * WG.rows), q = [wkey(...WS_ENTRY)]; seen[q[0]] = 1;
  while (q.length) { const k = q.shift(), c = k % WG.cols, r = (k / WG.cols) | 0;
    for (const [dc, dr] of FRONT) { const a = c + dc, b = r + dr, kk = wkey(a, b); if (inWG(a, b) && !occ.has(kk) && !seen[kk]) { seen[kk] = 1; q.push(kk) } } }
  for (let i = 0; i < ws.length; i++) { const [c, r] = frontCell({ ...ws[i], t: '_' + ws[i].k }); if (!seen[wkey(c, r)]) return { which: i, why: `走不到${FIX_NAME[ws[i].k]}前面` } }
  return null;
}
/* 给第 i 台机器找个放得下的地方 */
export function wsSpot(ws, i) {
  const old = { ...ws[i] };
  for (const rot of [0, 2, 1, 3]) for (let r = 0; r < WG.rows; r++) for (let c = 0; c < WG.cols; c++) { Object.assign(ws[i], { c, r, rot }); if (!wsProblem(ws)) { const p = { c, r, rot }; Object.assign(ws[i], old); return p } }
  Object.assign(ws[i], old); return null;
}
/* 读档、盖好机器后：盖好的都有位置（没有就放默认，不行再找空位），没盖的去掉；0.45 以前的存档（机器在店南边的房间里）全部换成新的默认摆法 */
export function fixWs(S) {
  if (!S.fix) return;
  if (S.fix.wsV === 4 || S.fix.wsV === 5) { S.fix.wsV = 6; Object.defineProperty(S, 'wsMoved', { value: true, enumerable: false, configurable: true }) }   // 设计 43：工坊搬到超市南边：机器在网格里的格子不变（整片平移），放不下的下面用 wsSpot 重新找
  else if (S.fix.wsV !== 6) { S.fix.ws = []; S.fix.wsV = 6 }   // 更老的存档（0.45 以前）：换成默认摆法
  S.fix.ws = (S.fix.ws || []).filter(w => S.lv && S.lv[w.k] > 0 && FIX_SIZE[w.k] && WS_DEF[w.k]);
  if (S.wsMoved && wsProblem(S.fix.ws)) S.fix.ws = [];   // 设计 43：平移过来放不下（网格变矮了），整片换成默认摆法（下面按默认位置一台台放回去，一台都不丢）
  for (const k of Object.keys(WS_DEF)) if (S.lv && S.lv[k] > 0 && !S.fix.ws.some(w => w.k === k)) {
    S.fix.ws.push({ k, ...WS_DEF[k] }); const i = S.fix.ws.length - 1;
    if (wsProblem(S.fix.ws)) { const sp = wsSpot(S.fix.ws, i); if (sp) Object.assign(S.fix.ws[i], sp) } }
  for (let t = 0; t < 8; t++) { const p = wsProblem(S.fix.ws); if (!p) break; const sp = wsSpot(S.fix.ws, p.which); if (sp) Object.assign(S.fix.ws[p.which], sp); else S.fix.ws.splice(p.which, 1) }
  /* 设计 70：去掉 68 的「整个工坊换成默认摆法」：网格往南多了 4 行，厨房 2 先找原来的场地（wsSpot 从北往南找），没空地就放进南边新的一条；别的机器不动 */
}
export const QLEN = 10;                             // 排队那条线有几格
const SMALL_S = 14;                                 // 小店面最南一行
export const defaultFix = big => ({ reg: { c: 16, r: 13, rot: 3 }, deco: [
  { k: 'fridgeDeco', c: 16, r: 0, rot: 0 }, { k: 'boxes', c: 0, r: 0, rot: 0 }, { k: 'plantDoor', c: 18, r: 7, rot: 0 },
  { k: 'plantSW', c: 0, r: SMALL_S, rot: 0 }, { k: 'lamp', c: 18, r: SMALL_S, rot: 0 }], ws: [] });   // 0.42：店面不再扩大，南边的盆栽、落地灯一直在店里
let BLOCK = new Set(), KEEP = new Set(), big = null, FX = null;
const mark = (set, c0, c1, r0, r1) => { for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) if (inGrid(c, r)) set.add(key(c, r)) };
/* 收银台：自己的格子、收银员站的一排（背面）、排队的一条线（正面中间往前 QLEN 格） */
export const regCells = reg => cellsOf({ ...reg, t: '_reg' });
export const cashierRow = reg => { const [w] = FIX_SIZE.reg; return span(w).map(u => toGrid(reg, u, -1)) };
export const queueCells = reg => Array.from({ length: QLEN }, (_, k) => toGrid(reg, 0, k + 1));
export const cashierCell = reg => toGrid(reg, 0, -1);
export const decoCells = d => d.hide ? [] : cellsOf({ ...d, t: '_' + d.k });
function rebuild() {
  BLOCK = new Set(); KEEP = new Set();
  mark(KEEP, 16, 18, 8, 11);       // 门口（固定）
  mark(KEEP, 8, 10, G.rows - 1, G.rows - 1);   // 南墙的门（0.15）：进门那一排空着
  if (big) { for (let c = 0; c < G.cols; c++) if (c < 8 || c > 10) BLOCK.add(key(c, WALL_R)); mark(KEEP, 8, 10, WALL_R - 1, WALL_R + 1) }   // 0.42 店和工坊之间的墙、门
  if (!FX) return;
  for (const [c, r] of regCells(FX.reg)) if (inGrid(c, r)) BLOCK.add(key(c, r));
  for (const d of FX.deco) for (const [c, r] of decoCells(d)) if (inGrid(c, r)) BLOCK.add(key(c, r));
  for (const [c, r] of [...cashierRow(FX.reg), ...queueCells(FX.reg)]) if (inGrid(c, r) && !BLOCK.has(key(c, r))) KEEP.add(key(c, r));
}
export function setExpanded(b) { b = !!b; if (b === big) return; big = b; G.rows = b ? ROWS_BIG : ROWS_SMALL; rebuild() }
/* 换一套摆设位置（读档、布置时挪动收银台/装饰都要调） */
export function setFixtures(fx) { FX = fx; rebuild() }
export const getFixtures = () => FX;
setExpanded(false);
export const isExpanded = () => big;
export const isBlock = (c, r) => BLOCK.has(key(c, r));
export const isKeep = (c, r) => KEEP.has(key(c, r));
export const DOOR_CELL = [18, 10];                 // 进门第一格（东门）
export const sDoorCell = () => [9, G.rows - 1];    // 0.31 南门进门第一格（店面扩大后顾客走南门）
/* 摆设本身放得下吗（不查连通，连通在 layoutProblem 里查）：返回出错原因或 null。which = 'reg' 或 deco 的下标 */
export function fixProblem(fx, lay, n) {
  const occ = new Map(); const take = (cells, who) => { for (const [c, r] of cells) { const k = key(c, r); if (occ.has(k)) return occ.get(k); occ.set(k, who) } return null };
  for (let j = 0; j < n; j++) if (lay[j]) take(cellsOf(lay[j]), '货柜');
  const door = new Set(); mark(door, 16, 18, 8, 11); mark(door, 8, 10, G.rows - 1, G.rows - 1); if (big) mark(door, 8, 10, WALL_R - 1, WALL_R + 1);
  const own = (cells, nm, ws) => { for (const [c, r] of cells) { if (!inGrid(c, r)) return ws ? '超出工坊了' : '超出店面了'; if (door.has(key(c, r))) return '门口要空着';
    if (big && !ws && r >= WALL_R) return '要放在店里（南边是工坊）'; if (ws && r <= WALL_R) return '机器要放在工坊里' } const o = take(cells, nm); return o ? `和${o}重叠了` : null };
  let p = own(regCells(fx.reg), '收银台'); if (p) return { which: 'reg', why: p };
  for (const [c, r] of cashierRow(fx.reg)) if (!inGrid(c, r) || occ.has(key(c, r))) return { which: 'reg', why: '收银台背面要空出一排给收银员站' };
  for (const [c, r] of queueCells(fx.reg)) if (!inGrid(c, r) || occ.has(key(c, r))) return { which: 'reg', why: `收银台正面要空出一条 ${QLEN} 格的线给顾客排队` };
  const keep = new Set([...cashierRow(fx.reg), ...queueCells(fx.reg)].map(([c, r]) => key(c, r)));
  for (let i = 0; i < fx.deco.length; i++) { const d = fx.deco[i]; if (d.hide) continue;
    const cs = decoCells(d); if (cs.some(([c, r]) => keep.has(key(c, r)))) return { which: i, why: '排队和收银员站的地方要空着' };
    p = own(cs, FIX_NAME[d.k]); if (p) return { which: i, why: p } }
  return null;
}

/* 货柜：{c, r, rot, t}。t = 种类（shelf / veg / fridge），c、r 是锚点格，rot 0~3 每次转 90°。
   在货柜自己的坐标里：u 是宽（左右），v 是深，正面（顾客站的那边）是 +v。rot 0 正面朝南、1 朝东、2 朝北、3 朝西 */
export const FRONT = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const span = n => { const a = -Math.floor((n - 1) / 2); return Array.from({ length: n }, (_, i) => a + i) };
const sizeOf = s => s.t && s.t[0] === '_' ? FIX_SIZE[s.t.slice(1)] : (FIXTURE[s.t || 'shelf'] || FIXTURE.shelf).size;
const toGrid = (s, u, v) => { const [dc, dr] = [[u, v], [v, -u], [-u, -v], [-v, u]][s.rot]; return [s.c + dc, s.r + dr] };
export function cellsOf(s) { const [w, d] = sizeOf(s), out = []; for (const u of span(w)) for (const v of span(d)) out.push(toGrid(s, u, v)); return out }
/* 正面那一排格子、左右两头的格子 */
export const frontRow = s => { const [w, d] = sizeOf(s), vm = Math.max(...span(d)); return span(w).map(u => toGrid(s, u, vm + 1)) };
export const endCol = (s, side) => { const [w, d] = sizeOf(s), us = span(w), u = side < 0 ? us[0] - 1 : us[us.length - 1] + 1; return span(d).map(v => toGrid(s, u, v)) };
export const frontCell = s => frontRow(s)[Math.floor((sizeOf(s)[0] - 1) / 2)];
export const shelfWorld = s => { const cs = cellsOf(s); return { x: cs.reduce((a, [c]) => a + cx(c), 0) / cs.length, z: cs.reduce((a, [, r]) => a + cz(r), 0) / cs.length, ry: s.rot * Math.PI / 2 } };
export const footSize = s => { const [w, d] = sizeOf(s); return s.rot % 2 ? [d * G.cell, w * G.cell] : [w * G.cell, d * G.cell] };

/* 默认摆法（2026-10-12 改）：后排 3 个背靠北墙、前排 3 个、西边 1 个背靠西墙（朝东），把店中间空出来。
   其余的（果蔬架、冰柜、扩建后多出来的）由 findSpot 找位置 */
export const defaultLayout = () => [
  { c: 13, r: 5, rot: 0 }, { c: 9, r: 5, rot: 0 }, { c: 5, r: 5, rot: 0 },
  { c: 13, r: 0, rot: 0 }, { c: 9, r: 0, rot: 0 }, { c: 5, r: 0, rot: 0 },
  { c: 0, r: 4, rot: 1 },
].map(x => ({ ...x, t: 'shelf' }));
/* 0.05 早期的默认摆法：老存档如果一直没动过，就换成新的默认摆法 */
const OLD_DEFAULT = [[13, 6, 0], [9, 6, 0], [5, 6, 0], [13, 2, 0], [9, 2, 0], [5, 2, 0], [1, 4, 1]];

/* 第 i 个货柜放在 s 这里，单看它自己和别的货柜行不行（不查连通）；返回出错原因或 null。
   规则（2026-10-12 用户定）：正面那一排要空着给顾客站；左右两头至少有一头能走人；背面可以贴墙、贴别的货柜。 */
export function localProblem(lay, n, i, s) {
  const own = cellsOf(s);
  for (const [c, r] of own) {
    if (!inGrid(c, r)) return '超出店面了';
    if (isBlock(c, r)) return '压到固定摆设了';
    if (isKeep(c, r)) return '门口、排队和收银的地方要空着';
    if (big && r >= WALL_R) return '货柜要放在店里（南边是工坊）';
  }
  const occ = new Set(); for (let j = 0; j < n; j++) if (j !== i && lay[j]) for (const [c, r] of cellsOf(lay[j])) occ.add(key(c, r));
  for (const [c, r] of own) if (occ.has(key(c, r))) return '和别的货柜重叠了';
  const free = ([c, r]) => inGrid(c, r) && !isBlock(c, r) && !occ.has(key(c, r));
  if (!frontRow(s).every(free)) return '正面要空出一格给顾客站';
  if (!endCol(s, -1).every(free) && !endCol(s, 1).every(free)) return '左右两头至少要有一头能走人';
  return null;
}

/* 能走的格子（固定摆设和前 n 个货柜以外的） */
export function walkGrid(lay, n) {
  const g = new Uint8Array(G.cols * G.rows).fill(1);
  for (const k of BLOCK) g[k] = 0;
  for (let j = 0; j < n; j++) if (lay[j]) for (const [c, r] of cellsOf(lay[j])) if (inGrid(c, r)) g[key(c, r)] = 0;
  return g;
}
/* 从门口走得到的格子 */
function reach(g) {
  const seen = new Uint8Array(g.length), q = [key(...DOOR_CELL)]; seen[q[0]] = 1;
  while (q.length) { const k = q.shift(), c = k % G.cols, r = (k / G.cols) | 0;
    for (const [dc, dr] of FRONT) { const a = c + dc, b = r + dr, kk = key(a, b); if (inGrid(a, b) && g[kk] && !seen[kk]) { seen[kk] = 1; q.push(kk) } } }
  return seen;
}
/* 整个布局行不行：每个货柜本身没问题，并且门口能走到所有货柜正面、排队位置和收银员的位置 */
export function layoutProblem(lay, n) {
  if (FX) { const fp = fixProblem(FX, lay, n); if (fp) return { i: -1, fix: fp.which, why: fp.why } }
  for (let i = 0; i < n; i++) { const p = localProblem(lay, n, i, lay[i]); if (p) return { i, why: p } }
  const g = walkGrid(lay, n), seen = reach(g);
  for (let i = 0; i < n; i++) { const [c, r] = frontCell(lay[i]); if (!inGrid(c, r) || !seen[key(c, r)]) return { i, why: '顾客走不到这个货柜前面' } }
  if (FX) for (const [c, r] of [cashierCell(FX.reg), ...queueCells(FX.reg).slice(0, 6)]) if (!seen[key(c, r)]) return { i: -1, fix: 'reg', why: '把去收银台、排队的路堵住了' };
  return null;
}

/* 新建的货柜：自动找一个能放的地方（先找正面朝南的；从店里靠里的地方开始找） */
export function findSpot(lay, n, t) {
  for (const rot of [0, 2, 1, 3]) for (let r = 1; r < G.rows - 1; r++) for (let c = G.cols - 2; c >= 1; c--) {
    const s = { c, r, rot, t }, test = lay.slice(); test[n - 1] = s;
    if (!localProblem(test, n, n - 1, s) && !layoutProblem(test, n)) return s;
  }
  return null;
}
/* 摆设：没有就用默认；店面扩大后，还在老南墙边的南边盆栽、落地灯挪到新的南墙；放不下的回到默认，默认也不行的装饰收起来 */
function fixFixtures(S) {
  if (!S.fix || !S.fix.reg) S.fix = defaultFix(big);
  const df = defaultFix(big);
  for (const d of df.deco) if (!S.fix.deco.some(x => x.k === d.k)) S.fix.deco.push({ ...d });
  for (const d of S.fix.deco) if (d.r > SMALL_S) d.r = SMALL_S;   // 0.42：扩大店面时挪到新南墙的盆栽、落地灯挪回来
  if (S.fix.reg && S.fix.reg.r > SMALL_S) S.fix.reg = { ...df.reg };
  setFixtures(S.fix);
  const n = S.shelves ? S.shelves.length : 0, lay = S.layout || [];
  if (!fixProblem(S.fix, lay, n)) return;
  S.fix.reg = { ...df.reg }; setFixtures(S.fix);
  for (let i = 0; i < S.fix.deco.length; i++) { const p = fixProblem(S.fix, lay, n); if (!p || p.which === 'reg') break;
    const d = S.fix.deco[p.which], dd = df.deco.find(x => x.k === d.k); Object.assign(d, dd); if (fixProblem(S.fix, lay, n)?.which === p.which) d.hide = true; setFixtures(S.fix) }
}
/* 只在读老存档时调用：一直没动过的旧默认摆法，换成新的默认摆法（玩家自己摆过的不动） */
export function migrateOldDefault(S, v) {
  S.layoutV = 2; if (v >= 2) return;
  const d = defaultLayout();
  if (Array.isArray(S.layout) && S.layout.length && S.layout.every((l, i) => !l || (OLD_DEFAULT[i] ? l.c === OLD_DEFAULT[i][0] && l.r === OLD_DEFAULT[i][1] && l.rot === OLD_DEFAULT[i][2] : l.t !== 'shelf')))
    S.layout = S.layout.map((l, i) => l && OLD_DEFAULT[i] ? { ...d[i], t: l.t || 'shelf' } : l);
}
/* 读档、建好新货柜、超市扩建后：补齐、修正布局，保证已建的都合法（S.shelves[i].type 决定种类） */
export function fixLayout(S) {
  setExpanded(false);                         // 0.45 工坊搬出去了：店里的网格一直是 15 行
  if (S.fix) { fixFixtures(S); fixWs(S) }
  const d = defaultLayout();
  if (!Array.isArray(S.layout)) S.layout = [];
  const n = S.shelves.length;
  for (let i = 0; i < n; i++) { const t = S.shelves[i].type || 'shelf'; if (!S.layout[i]) S.layout[i] = t === 'shelf' && d[i] ? { ...d[i] } : { c: -9, r: -9, rot: 0, t }; S.layout[i].t = t }
  S.layout.length = Math.max(n, 0);
  if (!layoutProblem(S.layout, n)) return;
  /* 一个一个加进来，放不下的重新找位置；还不行就整体从默认开始 */
  for (let k = 1; k <= n; k++) if (layoutProblem(S.layout, k)) {
    const t = S.layout[k - 1].t, dd = t === 'shelf' && d[k - 1] ? { ...d[k - 1] } : null;
    if (dd) { S.layout[k - 1] = dd; if (!layoutProblem(S.layout, k)) continue }
    const s = findSpot(S.layout, k, t); if (s) S.layout[k - 1] = s;
  }
  if (!layoutProblem(S.layout, n)) return;
  /* 还是不行（很少见）：全部从默认摆法重新排，默认位置放不下的再找空位 */
  const old = S.layout; S.layout = [];
  for (let k = 1; k <= n; k++) { const t = old[k - 1].t, dd = t === 'shelf' && d[k - 1] ? { ...d[k - 1] } : null;
    S.layout[k - 1] = dd || { c: -9, r: -9, rot: 0, t }; if (!dd || layoutProblem(S.layout, k)) { const s = findSpot(S.layout, k, t); if (s) S.layout[k - 1] = s } }
}

/* ---------- 顾客找路：8 方向，不切墙角；返回世界坐标的点（去掉一条直线上的中间点） ---------- */
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
export function nearestFree(g, c, r) {
  c = Math.max(0, Math.min(G.cols - 1, c)); r = Math.max(0, Math.min(G.rows - 1, r));
  if (g[key(c, r)]) return [c, r];
  for (let d = 1; d < 20; d++) for (let a = -d; a <= d; a++) for (let b = -d; b <= d; b++) {
    if (Math.max(Math.abs(a), Math.abs(b)) !== d) continue; const x = c + a, y = r + b; if (inGrid(x, y) && g[key(x, y)]) return [x, y]; }
  return [c, r];
}
export function findPath(g, from, to) {
  const [sc, sr] = nearestFree(g, ...from), [tc, tr] = nearestFree(g, ...to);
  const start = key(sc, sr), goal = key(tc, tr), prev = new Int32Array(g.length).fill(-1), dist = new Float32Array(g.length).fill(1e9);
  dist[start] = 0; const open = [start];
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
    const k = open.splice(bi, 1)[0]; if (k === goal) break;
    const c = k % G.cols, r = (k / G.cols) | 0;
    for (const [dc, dr] of DIRS) {
      const a = c + dc, b = r + dr, kk = key(a, b); if (!inGrid(a, b) || !g[kk]) continue;
      if (dc && dr && (!g[key(c + dc, r)] || !g[key(c, r + dr)])) continue;    // 不切墙角
      const nd = dist[k] + (dc && dr ? 1.414 : 1); if (nd < dist[kk]) { if (dist[kk] >= 1e9) open.push(kk); dist[kk] = nd; prev[kk] = k }
    }
  }
  const cells = []; let k = goal; if (prev[k] < 0 && k !== start) return [[cx(tc), cz(tr)]];
  while (k >= 0) { cells.push(k); if (k === start) break; k = prev[k] }
  cells.reverse();
  /* 只留拐弯的点 */
  const C = k => [k % G.cols, (k / G.cols) | 0], pts = [];
  cells.forEach((k, i) => {
    const [c, r] = C(k);
    if (i > 0 && i < cells.length - 1) { const [pc, pr] = C(cells[i - 1]), [nc, nr] = C(cells[i + 1]); if (c - pc === nc - c && r - pr === nr - r) return }
    pts.push([cx(c), cz(r)]);
  });
  return pts;
}
