/* ================= 场景：院子 + 超市 + 废街 =================
   坐标：x 向东（屏幕右），z 向南（朝镜头）。院子在左，废街在右。
   院子从西到东：温室和果园 → 超市（南边留了扩建用地）→ 回收机、建造台、帐篷营地 → 大门通废街。 */
import * as THREE from 'three';
import { perfOpt } from './perf.js';
import { createRanch, PASTURE } from './ranch.js';
import { createRecycler } from './recycler.js';
import { shelfWorld, cellsOf, defaultFix, wsWorld, wsCells, WG } from './layout.js';
import * as M from './models.js';
import { SHELF_MAX, STREET_SPAWN, FISH, FISH_RAR, FISHPOND } from './config.js';
import { createGroundFx, liven, GFX, makeSunFollow, FAR_SMALL, noCast } from './groundfx.js';
import { prop, propsReady, CARS, DEBRIS, BUILDINGS, FAR, FOOD_DEBRIS } from './props.js';

export const YARD = { x0: -70, x1: -2, z0: -25, z1: 29 };   /* 设计 70：工坊往南扩 3 米，池塘跟着往南挪 3 米，院子南边也扩 3 米（26 → 29） */   // 设计 56：东北角往北再扩 3 米放传送门   // 设计 43：院子再往南扩 6 米（20 → 26）；V1.01 往北扩到 -22
export const STREET = { x0: -2, x1: 46, z0: -11, z1: 11 };
export const GATE = { x: -2, z0: -3.6, z1: 0.4 };   // 大门和门口那条柏油路一样宽（路中心 z -1.6、宽 4 米）
export const REC_POS = new THREE.Vector3(-17.4, 0, -13);   // 0.45 回收机：超市北墙外、靠东（离大门近）
export const BENCH_POS = new THREE.Vector3(-8.5, 0, 3.8);
export const START_POS = new THREE.Vector3(-6, 0, 0.5);
export const SIDE_GATE = { x0: -14, x1: -12 };                       // 院子南边的小门（顾客走）
/* 超市：四面都是高墙（0.44 用户：不要矮墙），各留一个门；挡住主角的那段墙变透明（wallFade） */
export const STORE = { x0: -31, x1: -15, z0: -10, z1: 2.5 };
export const WS_AREA = { x0: -31, x1: -15, z0: 2.9, z1: 20 };   /* 设计 70：只往南扩（z1 17 → 20，网格 17 → 21 行），起点不动，玩家的机器位置不变 */   // 设计 43：回到 0.43 的格局——露天工坊贴着超市南墙，从南门进出
export const PLAZA = { x0: -15, x1: -3, z0: -21, z1: -10 };       // 设计 43：院子商人、神秘商人搬到东北角空地（大门北边）
export const DEFAULT_STORE_NAME = '幸存者超市';
export const REG_POS = new THREE.Vector3(-17.6, 0, 1.0);            // 收银台（0.13 起能在「布置」里挪，syncFix 会更新这个点）
export const REG_DIR = new THREE.Vector3(-1, 0, 0);                  // 收银台正面朝哪（顾客排队的方向）
export const DOOR = { z0: -2.6, z1: -0.6 };                          // 东墙上的门
export const DOOR_BIG = { z0: -3.0, z1: -0.2 };                      // 0.42 超市 3 级起：东门换成大自动门（双开、往两边滑）
export const SDOOR = { x0: -24.4, x1: -22.0 };                       // 南墙上的门（0.15 用户要的：南面加矮墙 + 门；对着布置网格第 8～10 列，那几格永远空着）
export const AISLE_Z = -1.6;                                         // 店里靠门的那条通道
export const C_DOOR_OUT = new THREE.Vector3(STORE.x1 + 1.5, 0, AISLE_Z), C_DOOR_IN = new THREE.Vector3(STORE.x1 - 1, 0, AISLE_Z);
/* 货架：前排 3 个、后排 3 个、西墙 1 个（朝东） */
export const SHELF_POS = [[-20, -3.9], [-24, -3.9], [-28, -3.9], [-20, -7.6], [-24, -7.6], [-28, -7.6], [-30.1, -5.75]].slice(0, SHELF_MAX);
export const SHELF_ROT = [0, 0, 0, 0, 0, 0, Math.PI / 2];
/* 顾客走到第 i 个货架前面要经过的点（从门口那条通道出发） */
export function shelfApproach(i) {
  const V = (x, z) => new THREE.Vector3(x, 0, z);
  if (i === 6) return [V(-26, AISLE_Z), V(-26, -5.75), V(-29.1, -5.75)];
  if (i == null || i < 0 || !SHELF_POS[i]) return [V(-22, AISLE_Z)];
  const [sx, sz] = SHELF_POS[i], ax = sx + 2, fz = sz + 0.95;
  return [V(ax, AISLE_Z), V(ax, fz), V(sx + 0.7, fz)];
}
export const lineSlot = k => REG_POS.clone().addScaledVector(REG_DIR, 2 + k * 1.1);   // 从收银台正面往前排
/* 温室（院子最西边、和超市左右并排）：4×4 的菜地；果园在温室南边：4 个树位 */
export const GH_AREA = { x0: -45, x1: -35, z0: -10.6, z1: 2.8 };   // 设计 48：往南加长，4 × 4 → 4 × 6   // 设计 43：温室在超市西边（牧场走道北边）
export const PLOT_POS = []; for (let j = 0; j < 6; j++) for (let i = 0; i < 4; i++) PLOT_POS.push([GH_AREA.x0 + 2 + i * 2, GH_AREA.z0 + 1.9 + j * 2]);
export const ORCH_AREA = { x0: -45.4, x1: -34.6, z0: 12.8, z1: 22.4 };   // 设计 48：温室加长以后，果园整块挪到南边空地（湖东边、工坊西边）   // 设计 43：果园在温室南边同一列（牧场走道南边）
export const TREE_POS = [[1.9, 2.6], [8.9, 2.6], [1.9, 7.0], [8.9, 7.0], [5.4, 2.6], [5.4, 7.0]].map(   /* 设计 48：3 列 × 2 排；旧存档的 4 棵按原来的顺序放在四个角，3 级多的 2 棵在中间一列 */([x, z]) => [ORCH_AREA.x0 + x, ORCH_AREA.z0 + z]);
export const CAM_X = [-66, 38];   // 0.45 西边到工坊、湖
export const CAM_Z = [-19, 24.5];   // 设计 56：往北能看到传送门   // 设计 43：院子往南扩了 6 米
/* 0.21 用户定：员工不住帐篷了，住宿舍楼（营地几级换几号楼，越来越高 / 越来越宽）；营地那块沙地一分为二：
   北边宿舍楼、楼前篝火（员工围着坐），南边空着（以前的医院去掉了）。 */
export const DORM_POS = new THREE.Vector3(-5.8, 0, 7.3);              // 宿舍楼（正面朝南）
export const DORM_AREA = { x0: -9.4, x1: -2.2, z0: 5.6, z1: 9.0 };
export const FIRE_POS = new THREE.Vector3(-7.2, 0, 11.2);             // 篝火（宿舍楼前）
export const POND_LOT = new THREE.Vector3(-23, 0, 25);   /* 设计 70：22 → 25（工坊往南扩了 3 米） */             // 设计 43：养鱼池塘在工坊南边
/* 0.22 池塘大小（宽 × 深，按等级；0 级是放水桶的那一小块） */
export const FISHPOND_SIZE = [[2.6, 1.6], [5, 3.2], [7, 4.2], [9, 5.2]];
export const CAMP_C = new THREE.Vector3(-6.6, 0, 12.4);              // 营地中间（休息、饿着的员工待在这附近）
/* 尸潮时守卫站的位置：大门到超市门口那条路的两边 */
export const GUARD_SPOTS = [[-10.2, -2.9], [-6.6, -2.9], [-3.4, -2.9], [-10.2, -0.3], [-6.6, -0.3], [-3.4, -0.3], [-12.6, -1.6], [-8.4, -1.6], [-4.8, -1.6], [-13.6, -0.3]];   // V1.01 全体员工上阵，最多 10 个位置
export const TRUCK_POS = new THREE.Vector3(-36, 0, -13.4);           // 0.45 去拾荒区的旧货车：超市北边偏西（车头朝南）
export const PILE_POS = [-41, -13.8];                                // 0.45 物资堆：货车西边
export const WH_POS = new THREE.Vector3(-25, 0, -13.2);   // 设计 40：仓库回到超市北墙外、回收机旁边（0.44），门朝南；等级高了往北（后面）加深
/* ---------- 尸潮塔防：丧尸从废街进大门，沿院子中间往西走到超市门口（防线）；路两边各 3 个塔位 ---------- */
/* 0.15 用户定：丧尸从门外马路的尽头（东头）刷出来，沿马路绕开废车、锥桶走到院子大门，再走到超市门口。
   路线是按马路上的障碍算好的（离障碍 0.9 米以上，丧尸左右散开也碰不到）；改了马路上的摆设要重算 */
export const TD_SPAWN = new THREE.Vector3(43, 0, -3.6);         // 马路尽头，比中线偏北一点（中线上有锥桶）
export const TD_PATH = [[36.5, -6.2], [29.8, -6], [27.2, -3.8], [19.2, 1.5], [10, 1.2], [8.5, -1], [-1.5, -1.6], [-14.4, -1.6]].map(([x, z]) => new THREE.Vector3(x, 0, z));   // 最后一段：大门 → 超市门口
export const TD_LINE = TD_PATH[TD_PATH.length - 1];                   // 防线：超市门口
export const BARRICADE = new THREE.Vector3(-13.3, 0, -1.6);            // 路障（丧尸要先打烂它），横在路上
export const TOWER_SPOTS = [[-12, -4.2], [-8.4, -4.2], [-4.8, -4.2], [-12, 1], [-8.4, 1], [-4.8, 1]];   // 路两边各 3 个，左右对齐
export const ALARM_POS = new THREE.Vector3(-11.4, 0, 6.2);
/* 0.14 钓鱼：院子西南角的小码头（小水塘 + 木栈桥 + 小船），走到栈桥头点「坐船」；院子里的商人在营地东边、小路旁 */
export const POND = { x0: -64, x1: -52.5, z0: 12.6, z1: 24.85 };      // 设计 43：湖在牧场南边（整片往东 5.5、往南 5 米，形状不变）
export const DOCK_POS = new THREE.Vector3(-57, 0, 13.8);
export const MERCH_POS = new THREE.Vector3(-8.6, 0, -15.2);
/* 设计 107：铁匠摊（超市 5 级才出现）：传送门西边、北边围栏前的空地（离回收机、商人都远）；SMITH_POS 是铁匠站的位置，摊子在他身前 */
export const SMITH_POS = new THREE.Vector3(-16.6, 0, -22.2);
export const PORTAL_POS = new THREE.Vector3(-11.4, 0, -22.3);          // 设计 56：传送门在商人空地北边，门朝南（对着大门过来的石板路）           // 设计 43：院子商人在东北角空地（大门北边）
/* 物资刷新点（避开障碍） */
/* 院子门口马路上的物资刷新点（只有铁罐、塑料瓶；其他的去拾荒区捡） */
export const SPAWN_POS = [[3, -6], [5, 5], [8, -2], [12, -8], [14, 2], [19, 8], [22, -1], [27, 5], [33, 8], [39, 2]].slice(0, STREET_SPAWN.count);

/* 画布贴图：砖墙、地砖、条纹雨棚 */
function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; return t;
}
const brickDraw = (base, mortar) => (g, w, h) => {
  g.fillStyle = mortar; g.fillRect(0, 0, w, h);
  const bh = h / 8, bw = w / 4;
  for (let r = 0; r < 8; r++) for (let c = -1; c < 5; c++) {
    const x = c * bw + (r % 2 ? bw / 2 : 0), shade = 0.86 + ((r * 7 + c * 13 + 50) % 5) * 0.035;
    const col = new THREE.Color(base).multiplyScalar(shade); g.fillStyle = '#' + col.getHexString(); g.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
  }
};
/* 废街的柏油路：底色 + 颗粒 + 裂缝 + 补丁 + 两边磨掉一半的白线（一张贴图 = 8 米长、14 米宽） */
const rnd01 = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(7);
/* 人行道：方砖 + 靠马路一边的路沿石。curb = 'top' / 'bottom' 表示路沿在贴图的上边还是下边 */
const sidewalkDraw = curb => (g, w, h) => {
  const s = w / 10, cb = h * 0.12; g.fillStyle = '#8a8478'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 10; i++) for (let j = 0; j < 4; j++) { const v = 128 + (rnd01() * 22 | 0); g.fillStyle = `rgb(${v + 6},${v},${v - 10})`; g.fillRect(i * s + 1, j * (h - cb) / 4 + (curb === 'top' ? cb : 0) + 1, s - 2, (h - cb) / 4 - 2) }
  g.fillStyle = '#b4ae9e'; g.fillRect(0, curb === 'top' ? 0 : h - cb, w, cb); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, curb === 'top' ? cb - 2 : h - cb, w, 2);
  for (let i = 0; i < 6; i++) { g.strokeStyle = 'rgba(60,55,50,.5)'; g.lineWidth = 1; let x = rnd01() * w, y = rnd01() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (rnd01() - 0.5) * 30; y += (rnd01() - 0.5) * 20; g.lineTo(x, y) } g.stroke() }
};
const tileDraw = (a, b) => (g, w, h) => { const n = 4, s = w / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = (i + j) % 2 ? a : b; g.fillRect(i * s, j * s, s, s) } g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 2; for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke() } };
/* 0.42 用户：超市、工坊的地砖换成大格子（1.6 米一块，等于布置网格的 2×2 格），对齐网格 */
/* 0.44 用户画的店内地砖（米白大瓷砖，一张图 8×8 块）：一块 1.6 米 = 布置网格 2×2 格，一张图 12.8 米 */
const bigTileMat = (w, d, x0, z0) => { const t = new THREE.TextureLoader().load('img/ground/floor.jpg'); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  t.repeat.set(w / 12.8, d / 12.8); t.offset.set(((x0 + 30.8) % 1.6) / -12.8, ((z0 + 9.8) % 1.6) / -12.8); return new THREE.MeshLambertMaterial({ map: t }) };
const stripeDraw = (a, b) => (g, w, h) => { const n = 8; for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(i * w / n, 0, w / n, h) } };

/* ---------- 塔模型 ---------- */
const TS = 1.55;                                       // 塔的模型放大倍数（Kenney 塔一格 1 米）
/* 0.14 用户定：塔用 Tower Defense Kit 的 Variation A 配色；1 级矮塔、2 级加高一节、3 级再加高 + 城垛顶 + 小旗子 */
const TWR = {
  gun:    { bottom: 'tower-square-bottom-a', mid: ['tower-square-middle-b', 'tower-square-middle-a'], top: 'tower-square-top-b', hb: 0.5, hm: 0.5, w: 'weapon-turret', ws: 1.15 },
  cannon: { bottom: 'tower-round-bottom-a', mid: ['tower-round-middle-a', 'tower-round-middle-b'], top: 'tower-round-top-a', hb: 0.6, hm: 0.6, w: 'weapon-cannon', ws: 1.15 },
  slow:   { bottom: 'tower-round-bottom-c', mid: ['tower-round-middle-c', 'tower-round-middle-c'], top: 'tower-round-top-b', hb: 0.6, hm: 0.6, w: 'tower-round-crystals', ws: 0.85 },
  sniper: { bottom: 'tower-round-bottom-b', mid: ['tower-round-middle-b', 'tower-round-middle-a', 'tower-round-middle-b'], top: 'tower-round-top-a', hb: 0.6, hm: 0.6, w: 'weapon-ballista', ws: 1.15, extra: 1 },
};
/* 0.44 用户生成的塔模型（4 种 × 3 级）：整座塔跟着目标转；模型正面（枪口）朝 +z，个别生成歪了的用 ry 转正。
   大小：1 / 2 / 3 级高 2 / 2.6 / 3.2 米，宽不超过 1.9 米（底座 1.1 米见方，枪管可以伸出去） */
const TWR_USER = { gun: { n: 'jiqiangpao', ry: [0, 0, 0] }, cannon: { n: 'paota', ry: [Math.PI / 4, 0, 0] }, slow: { n: 'jiansuta', ry: [0, 0, 0] }, sniper: { n: 'jujita', ry: [-Math.PI / 2, 0, 0] } };
const TWR_H = [2.7, 2.7, 3.5, 4.3];   // V1.11 用户：塔太小，放大 1.35 倍
function towerUser(k, lv) {
  const U = TWR_USER[k], L = Math.max(1, Math.min(3, lv)), src = U && prop(`${U.n}-${L}`, { scale: 1, tint: lv < 1 ? 0x9a948a : 0xffffff }); if (!src) return null;
  src.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(src), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
  const s = Math.min(TWR_H[L] / sz.y, 2.4 / Math.max(sz.x, sz.z)) * (lv < 1 ? 0.6 : 1);   // 正在建：灰一点、小一点
  const g = new THREE.Group(), aim = new THREE.Group(), body = new THREE.Group(); g.add(aim); aim.add(body);
  src.position.set(-c.x, -bb.min.y, -c.z); body.add(src); body.scale.setScalar(s); body.rotation.y = U.ry[L - 1];
  g.userData = { aim: lv < 1 ? null : aim, top: sz.y * s * 0.78 };
  return g;
}
export function towerMesh(k, lv) {   // 0.23：挪到外面，图标页也要用（塔图标）
  { const u = towerUser(k, lv); if (u) return u }
  const g = new THREE.Group(), D = TWR[k] || TWR.gun;
  let y = 0; const put = (n, sc = TS) => { const o = prop(n, { scale: sc, tint: 0xffffff, skin: 'td-a' }); if (o) { o.position.y = y; g.add(o) } return o };
  if (lv < 1) { if (!put(D.bottom)) g.add(M.cyl(0.5, 0.55, 0.5, 8, 0x8a8478, 0, 0.25, 0)); g.userData = { aim: null, top: 1 }; return g }   // 正在建：只有塔座，没有炮
  if (!put(D.bottom)) { g.add(M.cyl(0.5, 0.55, 0.7 + lv * 0.4, 8, 0x8a8478, 0, (0.7 + lv * 0.4) / 2, 0)); y = 0.7 + lv * 0.4 }
  else {
    y = D.hb * TS;
    for (let i = 0; i < lv - 1 + (D.extra || 0); i++) { put(D.mid[i % D.mid.length]); y += D.hm * TS }
    if (lv >= 3) { put(D.top); y += 0.14 }
  }
  const aim = new THREE.Group(); aim.position.y = y; g.add(aim);
  const w = prop(D.w, { scale: TS * D.ws, tint: 0xffffff, skin: 'td-a' });
  if (w) aim.add(w); else aim.add(M.box(0.4, 0.3, 0.7, 0x555555, 0, 0.15, 0));
  if (lv >= 3) { const f = prop('p:flag-pennant', { scale: 0.42, tint: 0xffffff }); if (f) { f.position.set(-0.42 * TS, y - 0.1, -0.3 * TS); g.add(f) } }
  g.userData = { aim, top: y + 0.5 };
  return g;
}

export function createWorld(canvas) {
  /* 0.26 用户：手机玩会烫 —— 不要求显卡全速（powerPreference 默认）；画面分辨率最多 1.5 倍（手机屏幕 3 倍时像素少一半多）；
     影子不再每帧重画，由 main.js 每两帧更新一次 */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !(matchMedia('(pointer:coarse)').matches && perfOpt('pr') && perfOpt('aa')), powerPreference: 'default', stencil: true });   // 设计 67：压扁影子要模板缓冲（一个人的影子叠的地方不会更黑）   // 设计 57：手机上画面 1.25 倍时不开抗锯齿
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const sky = 0xa9c08e;   // 0.44 用户：画面照效果图——不要发黄的雾，换成清爽一点的草绿灰（远处融进草地）
  scene.background = new THREE.Color(sky);
  scene.fog = new THREE.Fog(sky, 55, 115);

  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 1, 120);   // 0.21：近裁剪面 0.5 → 1，深度精度翻倍（地面不容易闪）
  const hemi = new THREE.HemisphereLight(0xffffff, 0x7a8662, 1.6); scene.add(hemi);   // 0.44 光照照效果图：白一点、亮一点，影子清楚
  const sun = new THREE.DirectionalLight(0xfff3dc, 2.1);
  /* 太阳固定不动，影子贴图一次盖住整张地图（院子 + 废街）。
     以前太阳跟着镜头走，人一跑影子边缘就一直闪、像一圈黑影在转，手机上更明显。 */
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0012; sun.shadow.normalBias = 0.05;
  sun.target.position.set(0, 0, 0); sun.position.set(-10, 22, 14).multiplyScalar(2.2);
  sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
  {
    const cam = sun.shadow.camera; cam.position.copy(sun.position); cam.lookAt(sun.target.position); cam.updateMatrixWorld();
    const inv = cam.matrixWorldInverse.copy(cam.matrixWorld).invert(), v = new THREE.Vector3();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const x of [YARD.x0 - 2, STREET.x1 + 3]) for (const y of [0, 9]) for (const z of [YARD.z0 - 5, YARD.z1 + 3]) {
      v.set(x, y, z).applyMatrix4(inv); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); z0 = Math.min(z0, -v.z); z1 = Math.max(z1, -v.z) }
    Object.assign(cam, { left: x0, right: x1, top: y1, bottom: y0, near: Math.max(0.5, z0 - 5), far: z1 + 5 }); cam.updateProjectionMatrix();
  }
  scene.add(sun, sun.target);
  const sunFollow = makeSunFollow(sun, 22, 1024);   // V1.01 优化（手机烫）：影子只算主角周围 ±22 米

  const obstacles = [];               // 主角和丧尸都挡：{x0,x1,z0,z1}
  const zombieOnly = [];              // 只挡丧尸（院子门口）
  const solid = (x0, x1, z0, z1) => obstacles.push({ x0, x1, z0, z1 });
  /* 斜着放的东西（歪停的车、斜放的路障）用「转了角度的矩形」挡路，不再用一个把空地也框进去的大方框 */
  const solidRot = (cx, cz, hw, hd, ry) => obstacles.push(obb(cx, cz, hw, hd, ry));
  const add = (o, x, z, ry = 0) => { o.position.x = x; o.position.z = z; o.rotation.y = ry; scene.add(o); return o };
  const later = [];                   // 场景模型（Kenney）加载好以后再摆的东西
  let lakeTex = null; const LFX = { t: 0, caus: [], foam: [], boat: null };   // 0.44 水面动画（设计/23「水面动画」）：亮纹贴图滑动、岸边白浪一深一浅、船轻轻浮动                 // 0.45 湖面贴图（pondTick 里跟池塘一起慢慢流）

  /* 地面 */
  const ground = (w, d, color, x, z, mat) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat || M.mat(color));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0, z); m.receiveShadow = true; scene.add(m); return m };
  /* 院子地面：Kenney Isometric Roads 的贴图（把斜着画的格子顶面掰正成方形，加了颗粒），一格贴图 = 4 米 */
  const TL = new THREE.TextureLoader();
  const gmat = (name, w, d, tile = 4) => { const t = TL.load(`img/ground/${name}${/^(grass|dirt|concrete|pasture|shore|asphalt|sand)$/.test(name) ? ".jpg" : ".png"}`); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / tile, d / tile); t.anisotropy = 4; return liven(new THREE.MeshLambertMaterial({ map: t }), { antiTile: /^(grass|dirt|pasture)$/.test(name) }) };   // V1.01 设计/24：云影、深浅起伏、草地打破重复
  const noGrass = [];   // V1.01 不长 3D 草的地方：铺了别的地面的长方形 {x0,x1,z0,z1}，或者多边形 {poly}
  const gpatch = (name, w, d, x, z, y = 0.006, tile = 4) => { const m = ground(w, d, 0, x, z, gmat(name, w, d, tile)); m.position.y = y; if (name !== 'grass') noGrass.push({ x0: x - w / 2 - 0.1, x1: x + w / 2 + 0.1, z0: z - d / 2 - 0.1, z1: z + d / 2 + 0.1 }); return m };
  ground(170, 100, 0, 0, 0, gmat('grass', 170, 100, 5)).position.y = -0.03;   // 0.44 远处也是草地（效果图四周是草和树林，不是荒地）
  const YW = YARD.x1 - YARD.x0, YD = YARD.z1 - YARD.z0;
  ground(YW, YD, 0, (YARD.x0 + YARD.x1) / 2, (YARD.z0 + YARD.z1) / 2, gmat('grass', YW, YD, 5));
  const RW = STREET.x1 - STREET.x0 + 4, RX = (STREET.x0 + STREET.x1) / 2 + 2;
  ground(RW, 14, 0, RX, 0, gmat('asphalt', RW, 14, 7));   // 马路：0.44 换成用户画的手绘沥青（深灰、画出来的裂缝和补丁），一张 7 米
  for (const z of [-6.35, 6.35]) { const l = ground(RW, 0.16, 0, RX, z, new THREE.MeshLambertMaterial({ color: 0xd8d2bc, transparent: true, opacity: 0.6 })); l.position.y = 0.009 }   // 两边的白线
  for (let x = 1; x < 46; x += 4) { const l = ground(2, 0.25, 0, x, 0, new THREE.MeshLambertMaterial({ color: 0xd8cf9e, transparent: true, opacity: 0.55 + (x * 7 % 5) * 0.08 })); l.position.y = 0.01 }   // 中线（旧了，深浅不一）
  ground(RW, 3, 0, RX, -8.5, new THREE.MeshLambertMaterial({ map: canvasTex(320, 96, sidewalkDraw('bottom'), RW / 8, 1) })).position.y = 0.004;   // 北侧人行道（路沿在南边）
  ground(RW, 3, 0, RX, 8.5, new THREE.MeshLambertMaterial({ map: canvasTex(320, 96, sidewalkDraw('top'), RW / 8, 1) })).position.y = 0.004;     // 南侧人行道
  /* 院子里的土路：大门 → 超市门口；南边小门 → 超市门口；超市 → 温室、果园 */
  /* 大门 → 超市门口：带路沿的柏油路（尸潮时丧尸也走这条）；其他是土路；营地铺沙地；回收站、塔位下面垫一块水泥地 */
  gpatch('concrete', 13.0, 4, -8.5, -1.6, 0.008, 3.2);   /* 设计 65：西头截到超市地砖边上（x -15），不压地砖 */   // 0.44 用户：院子里的路都用手绘石板贴图（设计/23），一张贴图 3.2 米、一块石板约 0.7 米
  /* 南边小门 → 大门那条路：用户——别从炮台底下穿过去，走到两个炮台中间再拐上去 */
  gpatch('concrete', 2.4, 24.2, -13, 16.7, 0.006, 3.2);   /* 设计 70：院子南边扩到 29，路接到小门 */    // 小门往北（z 4.6～25.8；设计 43 院子往南扩了 6 米）。设计 65：北头截到往东拐那条的南边，路口那块只铺往东拐的
  gpatch('concrete', 5.0, 2.4, -11.7, 3.4, 0.0061, 3.2);   // 往东拐（x -14.2～-9.2）
  gpatch('concrete', 1.8, 1.8, -10.2, 1.3, 0.0062, 3.2);   // 从 x -12、-8.4 两个炮台中间往北接到大门那条路（设计 65：z 0.4～2.2，两头都截到别的路边上）
  /* 设计 43：回到 0.43 的格局——工坊贴着超市南墙（露天石板，从南门进出）、工坊南边养鱼池塘、超市西边温室和果园、再往西牧场、牧场南边湖，商人在东北角 */
  blob([[-30.6, 3.0], [-26.5, 2.85], [-22.5, 3.0], [-18.5, 2.85], [-15.2, 3.1], [-14.9, 6.4], [-15.3, 9.6], [-14.9, 13.2], [-15.2, 16.4], [-15.4, 19.5], [-18.6, 20.1], [-22.4, 19.8], [-26.2, 20.2], [-29.4, 19.7], [-31.0, 17.2], [-30.7, 14.2], [-30.6, 10.6], [-31.0, 6.8]], 'concrete', 3.2, 0.007, { rim: [0.2, 0.3], flats: [{ z: 2.85, a: [-31.3, -15.2], tol: 0.6 }, { x: -31.3, a: [2.85, 5.5], tol: 0.7 }, { z: 19.9, a: [-24.3, -22.1], tol: 0.6 }] });   // 工坊的石板地（设计 65：北边贴店墙脚、西边接西门那条和温室南边东西向、南边接去池塘那条，这几段是直边、不留渐变）
  gpatch('concrete', 1.9, 14.6, -32.25, -4.0, 0.0072, 3.2);               // 超市西门口：往北接货车那片泥地、往南接温室南边东西向（z -11.3～3.3）；广场西边不铺，留草地。设计 65：原来的「西门往南」并进来，x 往西挪 0.2 贴着店墙脚
  gpatch('concrete', 24.9, 2.2, -57.55, 0, 0.0071, 3.2);   // 设计 48：牧场中间走道（x -70～-45.1）；温室加长到 z 2.8，走道从温室南边绕过去
    gpatch('concrete', 13.8, 2.2, -38.2, 4.4, 0.00714, 3.2);  //   温室南边东西向（设计 65：x -45.1～-31.3，西头截到牧场东头往南那条的边上，东头接工坊石板地）
  gpatch('concrete', 1.8, 7.3, -40, 9.15, 0.00716, 3.2);     //   往南到果园（新位置；设计 65：从东西向那条的南边 z 5.5 开始）
  gpatch('concrete', 2.2, 2.0, -23.2, 20.9, 0.0068, 3.2);   /* 设计 70：工坊、池塘都往南 3 米 */                // 设计 43：工坊 → 养鱼池塘（设计 65：从石板地南边 z 16.9 开始）
  gpatch('concrete', 1.8, 8.6, -46, 5.4, 0.0069, 3.2);                   // 设计 43：牧场走道东头往南（牧场和果园中间）→ 码头（设计 65：z 1.1～9.7，到沿湖那条的北边截住）
  gpatch('concrete', 12.0, 1.8, -51.1, 10.6, 0.00695, 3.2);              //   往西沿湖的北岸到码头（设计 65：往北挪 1.1 米，不压湖岸那圈；x -57.1～-45.1，拐角这块归它）
  gpatch('concrete', 1.8, 6.6, -10.2, -6.9, 0.0067, 3.2);                // 设计 43：大门那条路 → 往北（从 x -12、-8.4 两座炮台中间穿过）→ 东北角商人（z -10.2～-3.6，两头正好接上）
  blob([[-12.6, -10.6], [-9.8, -10.2], [-6.4, -10.7], [-4.4, -11.6], [-4.0, -14.6], [-4.6, -17.6], [-7.2, -19.4], [-8.4, -22.6], [-10.6, -24.3], [-13.2, -24.0], [-14.8, -21.4], [-14.0, -18.0], [-13.4, -13.6]], 'concrete', 3.2, 0.0066, { rim: [0.2, 0.3], flats: [{ z: -10.2, a: [-11.1, -9.3], tol: 0.8 }] });   // 东北角商人那块小空地（设计 65：南边接往北那条路的那段是直边）
  /* V1.01 用户：地面贴图别方方正正的（除了路和边界）——一圈控制点连成圆润的不规则形状，外面一圈宽窄不一、慢慢透明接草地 */
  /* 设计 65：flats = 跟路、店墙脚接上的那几段改成直边（{ z 或 x: 那条线, a: [起, 止], tol: 离线多近的点才拉过去 }），直边那段不留渐变边；
     填充和外圈渐变做成同一个网格（以前是两层：填充在 y、渐变外圈在 y - 0.0002，叠着） */
  function flatRing(ring, flats) {
    for (const f of flats) {
      const ax = 'z' in f ? 1 : 0, ot = 1 - ax, v = 'z' in f ? f.z : f.x, [lo, hi] = f.a;
      const on = p => p[ot] >= lo - 1e-6 && p[ot] <= hi + 1e-6 && Math.abs(p[ax] - v) < f.tol;
      const k = ring.findIndex(p => !on(p)); if (k < 0) continue; ring = ring.slice(k).concat(ring.slice(0, k));
      const out = []; let i = 0;
      while (i < ring.length) {
        if (!on(ring[i])) { out.push(ring[i]); i++; continue }
        let e = i; while (e + 1 < ring.length && on(ring[e + 1])) e++;
        const prev = ring[(i - 1 + ring.length) % ring.length], next = ring[(e + 1) % ring.length], up = next[ot] > prev[ot];
        const s0 = up ? lo : hi, s1 = up ? hi : lo, m = Math.max(1, Math.round(Math.abs(s1 - s0) / 0.4));
        for (let j = 0; j <= m; j++) { const q = []; q[ax] = v; q[ot] = s0 + (s1 - s0) * j / m; q.fl = true; out.push(q) }
        i = e + 1 }
      ring = out }
    /* 设计 65b：标记用 .fl，不能叫 .flat（数组自带 flat() 方法，永远是真的，65a 因此每个点都当成直边，整圈都没有渐变边） */
    return ring.filter((p, i) => { const q = ring[(i + 1) % ring.length]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.05) return true; q.fl = q.fl || p.fl; return false });
  }
  function blob(LK, texName, T, y, { grass = true, n = 120, rim = [0.5, 0.7], flats = [] } = {}) {
    let ring = new THREE.CatmullRomCurve3(LK.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal').getSpacedPoints(n).slice(0, n).map(v => [v.x, v.z]);
    if (flats.length) { ring = flatRing(ring, flats); n = ring.length }
    let ar = 0; for (let i = 0; i < n; i++) { const a = ring[i], b = ring[(i + 1) % n]; ar += a[0] * b[1] - b[0] * a[1] }
    const nor = ring.map((p, i) => { const a = ring[(i + n - 1) % n], b = ring[(i + 1) % n], tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1, sg = ar < 0 ? -1 : 1; return [sg * tz / l, -sg * tx / l] });
    const tex = TL.load(`img/ground/${texName}.jpg`); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
    if (grass) noGrass.push({ poly: ring.map((p, i) => [p[0] + nor[i][0] * 0.4, p[1] + nor[i][1] * 0.4]) });
    const pos = [], col = [], uvs = [], idx = [], wob = i => 0.55 + 0.45 * Math.sin(i * 1.7) * Math.sin(i * 0.53);   // 边上的过渡宽窄不一，更不规整
    for (let i = 0; i < n; i++) { const p = ring[i], nb = k => ring[(i + k + n) % n].fl, d = p.fl || nb(-1) || nb(1) ? 0 : (rim[0] + wob(i) * rim[1]) * (nb(-2) || nb(2) ? 0.5 : 1), q = [p[0] + nor[i][0] * d, p[1] + nor[i][1] * d];
      pos.push(p[0], 0, p[1], q[0], 0, q[1]); col.push(1, 1, 1, 1, 1, 1, 1, 0); uvs.push(p[0] / T, -p[1] / T, q[0] / T, -q[1] / T) }
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(ring.map(([x, z]) => new THREE.Vector2(x, z)), [])) idx.push(a * 2, b * 2, c * 2);   // 填充：只用里圈的点
    const nFill = idx.length;
    for (let i = 0; i < n; i++) { const a = i * 2, b = ((i + 1) % n) * 2; idx.push(a, b, a + 1, b, b + 1, a + 1) }                                      // 外圈渐变
    /* 设计 65b：三角形一律朝上（从上往下看逆时针）。65a 填充用 triangulateShape 出来的三角形从上面看是顺时针，材质又是两面画，
       three 画背面时把法线翻成朝下，太阳光照不到，整块只剩一点环境光，变成深墨绿 / 黑色 */
    for (let t = 0; t < idx.length; t += 3) { const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map(k => [pos[k * 3], pos[k * 3 + 2]]);
      if ((b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) < 0) { const k = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = k } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => i % 3 === 1 ? 1 : 0), 3)); g.setIndex(idx);
    /* 设计 65b：还是一个网格（形状上一层，填充和外圈不叠），但分两组画：填充用不透明材质（跟 V4.71 的填充一样，跟路一样在不透明那一遍画，
       亮度、贴图、脚下的软影子都跟以前一样）；外圈用顶点透明度、不写深度（跟 V4.71 的外圈一样）。65a 整块都标成半透明，人和箱子脚下的软影子被它盖掉 */
    g.addGroup(0, nFill, 0); g.addGroup(nFill, idx.length - nFill, 1);
    const fillMat = liven(new THREE.MeshLambertMaterial({ map: tex }), { antiTile: true });
    const rimMat = liven(new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false }));
    const m = new THREE.Mesh(g, [fillMat, rimMat]);
    m.position.y = y; m.receiveShadow = true; scene.add(m);
    return ring;
  }
  /* 用户：货车这一片是种菜那种泥地（牧场北边一整片，用户画的红框） */
  /* 设计 65：往西铺到牧场西边那块（x -61.5）的上面；南边贴着牧场两块的北边（z -9.3）、温室北墙（z -10.6）、西门那条路的北头（z -11.3）都是直边，不叠也不留缝 */
  blob([[-61.8, -14.6], [-60.2, -15.5], [-57, -15.4], [-54.2, -15.7], [-50.5, -15.5], [-47, -15.85], [-43, -15.5], [-39, -15.8], [-35.4, -15.6], [-32.6, -15.2], [-31.3, -13.9], [-31.5, -11.6], [-33.4, -10.4], [-36.6, -11.0], [-39.8, -10.3], [-43.2, -10.9], [-46.4, -10.2], [-49.8, -9.6], [-52.8, -9.6], [-56, -9.6], [-59, -9.6], [-61.6, -10.2], [-62.1, -12.2]], 'dirt', 4.2, 0.0066,
    { flats: [{ z: -9.3, a: [-61.5, -47.2], tol: 1.0 }, { z: -10.6, a: [-45, -35], tol: 0.8 }, { z: -11.3, a: [-33.2, -31.3], tol: 1.0 }] });


  /* 设计 43：西北角原来的工坊地铺回草地 */


  /* 用户：宿舍、篝火这里就是草地，不铺沙 */
  /* 0.28 用户：回收机下面不要水泥地 */
  /* V1.01 用户：塔位下面不垫贴图（以前一块块沥青 + 圆圈，很丑） */

  /* 院子围栏（东边留大门，南边留小门） */
  const fence = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(len / 2);
    const tmp = new THREE.Group();   // V1.01 优化：一段围栏的柱子、横杆合成两块（以前每根柱子一次绘制，院子 + 牧场两百多根）
    for (let i = 0; i <= n; i++) tmp.add(M.fencePost(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n));
    for (const y of [0.45, 1.0]) { const b = M.box(Math.abs(x1 - x0) || 0.08, 0.12, Math.abs(z1 - z0) || 0.08, 0x8a7356, (x0 + x1) / 2, y, (z0 + z1) / 2); tmp.add(b) }
    scene.add(M.mergeStatic(tmp));
    solid(Math.min(x0, x1) - 0.15, Math.max(x0, x1) + 0.15, Math.min(z0, z1) - 0.15, Math.max(z0, z1) + 0.15);
  };
  fence(YARD.x0, YARD.z0, YARD.x1, YARD.z0);
  fence(YARD.x0, YARD.z1, SIDE_GATE.x0, YARD.z1); fence(SIDE_GATE.x1, YARD.z1, YARD.x1, YARD.z1);
  scene.add(M.box(0.3, 1.8, 0.3, 0x5a4a3a, SIDE_GATE.x0, 0.9, YARD.z1), M.box(0.3, 1.8, 0.3, 0x5a4a3a, SIDE_GATE.x1, 0.9, YARD.z1));
  solid(SIDE_GATE.x0, SIDE_GATE.x1, YARD.z1 - 0.15, YARD.z1 + 0.15);      // 主角不能从小门出去
  /* 0.45 整体布局（设计/22）：院子和牧场合成一块，西边一整道围栏 */
  fence(YARD.x0, YARD.z0, YARD.x0, YARD.z1);
  const ranch = createRanch({ scene, fence, gpatch });
  fence(YARD.x1, YARD.z0, YARD.x1, GATE.z0);
  fence(YARD.x1, GATE.z1, YARD.x1, YARD.z1);
  zombieOnly.push({ x0: YARD.x1 - 0.6, x1: YARD.x1 + 0.6, z0: GATE.z0, z1: GATE.z1 });
  /* 门口：两根柱子 + 一盏灯（「唯一亮灯的地方」） */
  scene.add(M.box(0.4, 2.4, 0.4, 0x5a4a3a, YARD.x1, 1.2, GATE.z0 - 0.2), M.box(0.4, 2.4, 0.4, 0x5a4a3a, YARD.x1, 1.2, GATE.z1 + 0.2));
  scene.add(M.box(0.4, 0.3, GATE.z1 - GATE.z0 + 0.8, 0x5a4a3a, YARD.x1, 2.5, (GATE.z0 + GATE.z1) / 2));   // 门头横梁：正好搭在两根门柱上
  add(M.lampMesh(), YARD.x1 - 1, GATE.z1 + 1.5);
  const glow = new THREE.PointLight(0xffd27a, 8, 10, 1.5); glow.position.set(YARD.x1 - 1, 3.2, GATE.z1 + 1.5); scene.add(glow);

  /* ---------- 超市 ---------- */
  const S0 = STORE, sw = S0.x1 - S0.x0, sd = S0.z1 - S0.z0, scx = (S0.x0 + S0.x1) / 2, scz = (S0.z0 + S0.z1) / 2;
  ground(sw, sd, 0, scx, scz, bigTileMat(sw, sd, S0.x0, S0.z0)).position.y = 0.012;   // 浅色地砖（0.42 大格子）
  const southStrip = ground(sw + 0.6, 0.35, 0x8a7a66, scx, S0.z1 + 0.175);   /* 设计 65：从地砖边上开始，不压地砖 */ southStrip.position.y = 0.02;   // 店南边一条边
  const oldWalls = [], addOld = (...o) => { scene.add(...o); oldWalls.push(...o) };            // 红砖墙（0.14 起 Mini Market 模型读好后藏起来，碰撞照旧）
  const brick = (w, h) => new THREE.MeshLambertMaterial({ map: canvasTex(256, 128, brickDraw(0xb0705a, '#d8cbb8'), w / 3, h / 1.6) });
  const wall = (w, h, d, x, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, h / 2, z); m.castShadow = m.receiveShadow = true; scene.add(m); oldWalls.push(m); solid(x - w / 2, x + w / 2, z - d / 2, z + d / 2); return m };
  wall(sw, 3.4, 0.3, scx, S0.z0, brick(sw, 3.4));                                          // 北墙
  /* 0.24 用户：西墙开个门通温室、果园（正对那条土路），走路方便 */
  const WD = { z0: -6.7, z1: -4.3 }, wn = WD.z0 - S0.z0, ws = S0.z1 - WD.z1;
  wall(0.3, 3.4, wn, S0.x0, S0.z0 + wn / 2, brick(wn, 3.4)); wall(0.3, 3.4, ws, S0.x0, WD.z1 + ws / 2, brick(ws, 3.4));   // 西墙（门两边）
  const eastN = DOOR.z0 - S0.z0, eastS = S0.z1 - DOOR.z1;
  /* 东墙（矮墙）：小门（超市 1、2 级）/ 大自动门（3 级起，0.42 用户）两套，setStoreBig 里切换；碰撞跟着换 */
  const eastSolids = [{}, {}].map(b => (obstacles.push(Object.assign(b, { x0: 0, x1: 0, z0: 0, z1: 0 })), b));
  const eastSeg = D => [[S0.z0, D.z0], [D.z1, S0.z1]].map(([a, b]) => ({ x0: S0.x1 - 0.15, x1: S0.x1 + 0.15, z0: a, z1: b }));
  const eastSmall = new THREE.Group(), eastBig = new THREE.Group(); eastBig.visible = false; scene.add(eastSmall, eastBig);
  for (const [grp, D] of [[eastSmall, DOOR], [eastBig, DOOR_BIG]]) for (const sg of eastSeg(D)) { const dd = sg.z1 - sg.z0, m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, dd), brick(dd, 1.2)); m.position.set(S0.x1, 0.6, (sg.z0 + sg.z1) / 2); m.castShadow = m.receiveShadow = true; grp.add(m); oldWalls.push(m) }
  eastSeg(DOOR).forEach((sg, i) => Object.assign(eastSolids[i], sg));
  /* 南面矮墙（门两边）：小店面在 S0.z1，超市 3 级扩建后挪到 BIG_Z；碰撞跟着挪（setStoreBig 里） */
  const southSmall = new THREE.Group(); scene.add(southSmall);
  const southSolids = [{}, {}].map(b => (obstacles.push(Object.assign(b, { x0: 0, x1: 0, z0: 0, z1: 0 })), b));
  const southSeg = z => [[S0.x0, SDOOR.x0], [SDOOR.x1, S0.x1]].map(([a, b]) => ({ x0: a, x1: b, z0: z - 0.15, z1: z + 0.15 }));
  const southBox = (grp, z) => southSeg(z).forEach(sg => { const w = sg.x1 - sg.x0, m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, 0.3), brick(w, 1.2)); m.position.set((sg.x0 + sg.x1) / 2, 0.6, z); m.castShadow = m.receiveShadow = true; grp.add(m); oldWalls.push(m) });
  southBox(southSmall, S0.z1); southSeg(S0.z1).forEach((sg, i) => Object.assign(southSolids[i], sg));
  /* 墙顶压檐、北墙窗户 */
  { const a = M.box(sw + 0.5, 0.25, 0.6, 0x6e5a48, scx, 3.5, S0.z0), b = M.box(0.6, 0.25, sd + 0.3, 0x6e5a48, S0.x0, 3.5, scz); scene.add(a, b); oldWalls.push(a, b) }
  for (const x of [S0.x0 + 3.5, scx, S0.x1 - 3.5]) { addOld(M.box(2.2, 1.3, 0.06, 0x3b4a55, x, 2.1, S0.z0 + 0.17)); addOld(M.box(2.4, 0.12, 0.12, 0xe8e0d0, x, 1.42, S0.z0 + 0.2), M.box(2.4, 0.12, 0.12, 0xe8e0d0, x, 2.78, S0.z0 + 0.2), M.box(0.1, 1.4, 0.1, 0xe8e0d0, x, 2.1, S0.z0 + 0.2)) }
  /* 门框 + 雨棚（红白条纹）+「营业中」 */
  const dz = (DOOR.z0 + DOOR.z1) / 2;
  for (const [grp, D] of [[eastSmall, DOOR], [eastBig, DOOR_BIG]]) grp.add(M.box(0.25, 2.8, 0.25, 0x5a4636, S0.x1, 1.4, D.z0), M.box(0.25, 2.8, 0.25, 0x5a4636, S0.x1, 1.4, D.z1), M.box(0.3, 0.3, D.z1 - D.z0 + 0.3, 0x5a4636, S0.x1, 2.85, (D.z0 + D.z1) / 2));
  const awn = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 3.2), new THREE.MeshLambertMaterial({ map: canvasTex(128, 32, stripeDraw('#c9452f', '#f2ead8')) })); awn.position.set(S0.x1 + 0.7, 2.75, dz); awn.rotation.z = -0.35; awn.castShadow = true; scene.add(awn);
  const open = signMesh('营业中', 1.4, 0.45, '#2f6b3a'); open.position.set(S0.x1 + 0.17, 3.3, dz); open.rotation.y = Math.PI / 2; scene.add(open);
  /* 收银台 */
  /* 收银台竖着放（南北向）：店员站在东边、面朝西边的货架和排队的顾客 */
  /* 0.13：收银台和店里的装饰都放进各自的组里，组的中心 = 默认摆法里它占的格子的中心；「布置」挪动时整组搬过去、转过去（syncFix） */
  const FX0 = defaultFix(false), fixG = {}, fixBox = {}, REG0 = REG_POS.clone();   // REG0：收银台默认位置（组里的东西按它摆）
  const fixCenter = (k, it) => { const w = shelfWorld({ ...it, t: '_' + k }); return [w.x, w.z] };
  for (const [k, it] of [['reg', FX0.reg], ...FX0.deco.map(d => [d.k, d])]) {
    const g = new THREE.Group(), [x, z] = fixCenter(k, it); g.position.set(x, 0, z); g.userData = { x, z, rot0: it.rot }; scene.add(g); fixG[k] = g;
    const b = { x0: 0, x1: 0, z0: 0, z1: 0 }; obstacles.push(b); fixBox[k] = b;
  }
  const inFix = (k, o, x, y, z) => { o.position.set(x - fixG[k].userData.x, y, z - fixG[k].userData.z); fixG[k].add(o); return o };
  const regOld = [inFix('reg', M.box(0.8, 1, 2.2, 0x7a5d3a, 0, 0, 0), REG0.x, 0.5, REG0.z), inFix('reg', M.box(0.9, 0.08, 2.3, 0x5a4434, 0, 0, 0), REG0.x, 1.02, REG0.z),
    inFix('reg', M.box(0.4, 0.35, 0.5, 0x3a3a3a, 0, 0, 0), REG0.x, 1.22, REG0.z + 0.5)];          // 收银机
  /* 按存档里的摆法摆好（读档、布置时调）；hide 的装饰不显示 */
  function syncFix(fx) {
    if (!fx) return;
    for (const [k, it] of [['reg', fx.reg], ...fx.deco.map(d => [d.k, d])]) {
      const g = fixG[k]; if (!g) continue; const b = fixBox[k];
      if (it.hide) { g.visible = false; Object.assign(b, { x0: 0, x1: 0, z0: 0, z1: 0 }); continue }
      const [x, z] = fixCenter(k, it); g.visible = true; g.position.set(x, 0, z); g.rotation.y = (it.rot - g.userData.rot0) * Math.PI / 2;
      const cs = cellsOf({ ...it, t: '_' + k }), xs = cs.map(([c]) => c), zs = cs.map(([, r]) => r);
      Object.assign(b, { x0: -30.8 + Math.min(...xs) * 0.8 + 0.1, x1: -30.8 + (Math.max(...xs) + 1) * 0.8 - 0.1, z0: -9.8 + Math.min(...zs) * 0.8 + 0.1, z1: -9.8 + (Math.max(...zs) + 1) * 0.8 - 0.1 });
      if (k === 'reg') { REG_POS.set(x, 0, z); const a = it.rot * Math.PI / 2; REG_DIR.set(Math.round(Math.sin(a)), 0, Math.round(Math.cos(a))) }
    }
  }
  /* 店招：画在画布上的字，立在北墙顶上 */
  const sign = signMesh(DEFAULT_STORE_NAME, 7, 1.3); sign.position.set(scx, 4.4, S0.z0 + 0.25); scene.add(sign);
  for (const x of [scx - 3.2, scx + 3.2]) scene.add(M.box(0.12, 1.4, 0.12, 0x444444, x, 4.2, S0.z0 + 0.1));
  /* 超市 3 级：店面往南扩大到原来的扩建用地（地砖、西墙、东边矮墙跟着延长，南边的盆栽、落地灯挪过去） */
  const BIG_Z = 10.4, southDeco = [], wsSolids = [{}, {}].map(b => (obstacles.push(Object.assign(b, { x0: 0, x1: 0, z0: 0, z1: 0 })), b)), bigGrp = new THREE.Group(); bigGrp.visible = false; scene.add(bigGrp);
  const bigSolids = [{}, {}].map(b => (obstacles.push(Object.assign(b, { x0: 0, x1: 0, z0: 0, z1: 0 })), b));
  {
    const ed = BIG_Z - S0.z1, ez = (S0.z1 + BIG_Z) / 2;
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(sw, ed + 0.1), bigTileMat(sw, ed + 0.1, S0.x0, S0.z1 - 0.05));
    fl.rotation.x = -Math.PI / 2; fl.position.set(scx, 0.013, ez); fl.receiveShadow = true; bigGrp.add(fl);
    const wm = (w, h, d, x, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, h / 2, z); o.castShadow = o.receiveShadow = true; bigGrp.add(o); oldWalls.push(o) };
    wm(0.3, 3.4, ed, S0.x0, ez, brick(ed, 3.4)); { const c = M.box(0.6, 0.25, ed, 0x6e5a48, S0.x0, 3.5, ez); bigGrp.add(c); oldWalls.push(c) }     // 西墙延长 + 压檐
    wm(0.3, 1.2, ed, S0.x1, ez, brick(ed, 1.2));                                                                // 东边矮墙延长
    southBox(bigGrp, BIG_Z);                                                                                     // 南面矮墙挪到扩建后的南边
    const st = new THREE.Mesh(new THREE.PlaneGeometry(sw + 0.6, 0.35), M.mat(0x8a7a66)); st.rotation.x = -Math.PI / 2; st.position.set(scx, 0.02, BIG_Z + 0.1); bigGrp.add(st);
  }
  /* 0.44 用户：墙挡住主角时那段墙变透明（跟拾荒区的楼一样）。每片墙自己一份材质，算好包围盒；每帧从镜头往主角拉一条线，穿过的墙片慢慢变淡 */
  const thru = [];
  function seeThru(o) { o.traverse(c => { if (c.isMesh) { c.material = c.material.clone(); c.material.transparent = false } }); thru.push({ o, a: 1, box: null }) }
  const _ray = new THREE.Ray(), _hit = new THREE.Vector3();
  /* at：主角；more：别的要看得见的点（V1.01：收银台和排队的人——墙高了以后南墙会把收银台整个挡住） */
  const _rays = [];
  function wallFade(cam, at, dt, more = []) {
    const pts = [at, ...more];
    while (_rays.length < pts.length) _rays.push({ r: new THREE.Ray(), L: 0 });
    pts.forEach((p, i) => { const R = _rays[i]; R.r.origin.copy(cam.position); R.r.direction.copy(p).sub(cam.position); R.L = R.r.direction.length(); R.r.direction.divideScalar(R.L) });
    for (const w of thru) {
      if (!w.box) { w.o.updateMatrixWorld(true); w.box = new THREE.Box3().setFromObject(w.o); w.box.expandByScalar(0.05) }
      let vis = w.o.visible; for (let p = w.o.parent; vis && p; p = p.parent) vis = p.visible;
      let hit = false; if (vis) for (let i = 0; i < pts.length && !hit; i++) { const R = _rays[i]; hit = !!R.r.intersectBox(w.box, _hit) && _hit.distanceTo(cam.position) < R.L - 0.3 }
      const want = hit ? 0.22 : 1;
      if (Math.abs(w.a - want) < 0.01) continue;
      w.a += Math.sign(want - w.a) * Math.min(Math.abs(want - w.a), dt * 4);
      const tr = w.a < 0.99; w.o.traverse(c => { if (c.isMesh) { c.material.opacity = w.a; if (c.material.transparent !== tr) { c.material.transparent = tr; c.material.depthWrite = !tr; c.material.needsUpdate = true } } });
    }
  }
  /* 0.14 用户定：外墙换成 Kenney Mini Market 的墙（红色配色）：北墙三扇窗，转角立柱；东边门两侧是矮墙 */
  later.push(() => {
    /* 0.44 用户生成的墙片、带窗墙片、立柱：缩成 1×1×1 的方块（宽 × 高 × 厚），下面 run / col 再拉到要的长度和高度（墙厚 0.3 米） */
    const USERW = { wall: ['qiang', 0.6], 'wall-window': ['qiang_chuang', 0.6], column: ['lizhu', 1] };
    const userPiece = n => { const U = USERW[n], src = U && prop(U[0], { scale: 1, tint: 0xffffff }); if (!src) return null;
      src.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(src), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
      const inner = new THREE.Group(); src.position.set(-c.x, -bb.min.y, -c.z); inner.add(src); inner.scale.set(1 / sz.x, 1 / sz.y, U[1] / sz.z); const g = new THREE.Group(); g.add(inner); g.userData.user = true; return g };   /* 墙片两头有倒角：铺的时候每片加宽 8%，前后叠一点，不留缝 */
    const T = n => userPiece(n) || prop('m:' + n, { scale: 1, tint: 0xffffff, skin: 'market-b' });
    if (!T('wall')) return;
    const run = (grp, x0, z0, x1, z1, h, wins = [], kind = 'wall', y0 = 0) => {   // 沿一条线铺墙片（每片约 2 米）
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2)), ry = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
      for (let i = 0; i < n; i++) { const k = (i + 0.5) / n, o = T(wins.includes(i) ? 'wall-window' : kind); o.scale.set(len / n * (o.userData.user ? 1.08 : 1), h, 0.5); o.rotation.y = ry; o.position.set(x0 + (x1 - x0) * k, y0, z0 + (z1 - z0) * k); grp.add(o); seeThru(o) }
    };
    const col = (grp, x, z, h) => { const o = T('column'); o.scale.set(0.75, h, 0.75); o.position.set(x, 0, z); grp.add(o); seeThru(o) };
    run(scene, S0.x0, S0.z0, S0.x1, S0.z0, 3.4, [1, 4, 6]);                         // 北墙（8 片，三扇窗）
    run(scene, S0.x0, S0.z0, S0.x0, WD.z0, 3.4); run(scene, S0.x0, WD.z1, S0.x0, S0.z1, 3.4, [1]); col(scene, S0.x0, WD.z0, 3.6); col(scene, S0.x0, WD.z1, 3.6);   // 西墙（中间留门）
    /* 0.44 用户：不要矮墙 —— 东墙、南墙也是 3.4 米高墙；门上面补一截墙；挡住主角的那段墙变透明（wallFade） */
    for (const [grp, D, dh] of [[eastSmall, DOOR, 3], [eastBig, DOOR_BIG, 3]]) { run(grp, S0.x1, S0.z0, S0.x1, D.z0, 3.4); run(grp, S0.x1, D.z1, S0.x1, S0.z1, 3.4); run(grp, S0.x1, D.z0, S0.x1, D.z1, 3.4 - dh, [], 'wall', dh); col(grp, S0.x1, D.z0, 3.6); col(grp, S0.x1, D.z1, 3.6) }   // 东墙（小门 / 大自动门两套）
    col(scene, S0.x0, S0.z0, 3.6); col(scene, S0.x1, S0.z0, 3.6); col(scene, S0.x0, S0.z1, 3.6);
    run(bigGrp, S0.x0, S0.z1, S0.x0, BIG_Z, 3.4, [2]); run(bigGrp, S0.x1, S0.z1, S0.x1, BIG_Z, 3.4); col(bigGrp, S0.x0, BIG_Z, 3.6); col(bigGrp, S0.x1, BIG_Z, 3.6);
    for (const [grp, z] of [[southSmall, S0.z1], [bigGrp, BIG_Z]]) { run(grp, S0.x0, z, SDOOR.x0, z, 1.3, []); run(grp, SDOOR.x1, z, S0.x1, z, 1.3, []); run(grp, SDOOR.x0, z, SDOOR.x1, z, 0.35, [], 'wall', 2.35); col(grp, SDOOR.x0, z, 2.7); col(grp, SDOOR.x1, z, 2.7) }   // V1.01 用户：南墙（最下面那面）改回半墙 1.3 米，看得到店里；门两边立柱 2.7 米 + 门上一截（半墙模型等用户生成，设计/26）
    col(southSmall, S0.x1, S0.z1, 3.6);
    oldWalls.forEach(o => { o.visible = false });
  });
  /* 0.42 自动门（用户）：两扇门往两边滑开；模型用 Kenney Furniture 的 doorwayFront（门板）。k：0 关、1 全开；want 由 main.js 每帧给 */
  const doors = {};
  function mkDoor(name, grp, cx, cz, along, w, h, out) {
    const d = doors[name] = { k: name === 'east' ? 1 : 0, want: 0, panels: [], cx, cz, along };
    const place = () => { for (const p of d.panels) { const off = p.s * (w / 4 + d.k * (w / 2 - 0.08)); if (along === 'z') p.g.position.set(cx + out, 0, cz + off); else p.g.position.set(cx + off, 0, cz + out) } };
    d.tick = dt => { if (d.k === d.want) return; d.k += Math.sign(d.want - d.k) * Math.min(Math.abs(d.want - d.k), dt * 2.4); place() };
    later.push(() => {
      for (const s of [-1, 1]) {
        const src = prop('doorwayFront', { scale: 1, tint: 0xdfeaf0 }); if (!src) return;
        src.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(src), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
        src.position.set(-c.x, -bb.min.y, -c.z); const g = new THREE.Group(), inner = new THREE.Group(); inner.add(src);
        inner.scale.set((w / 2) / sz.x * s, h / sz.y, 1); if (along === 'z') g.rotation.y = Math.PI / 2; g.add(inner); grp.add(g); d.panels.push({ g, s });
      }
      place();
    });
    return d;
  }
  mkDoor('east', eastBig, S0.x1, (DOOR_BIG.z0 + DOOR_BIG.z1) / 2, 'z', DOOR_BIG.z1 - DOOR_BIG.z0, 2.45, 0.22);
  mkDoor('ws', southSmall, (SDOOR.x0 + SDOOR.x1) / 2, S0.z1, 'x', SDOOR.x1 - SDOOR.x0, 2.3, 0.22);   // 0.45 南门（设计 43：通南边的工坊）：有人走近自动开
  /* 0.42 工坊里的厨房、机器（用户生成的模型，等级不同模型不同）：位置在存档的 S.fix.ws 里（能在「布置」里挪、转），按占的格子缩放到刚好放得下 */
  const WS_MODEL = { wood: 'mugongtai', sweet: 'tianpinji', split: 'fenjieji', can: 'guantouji', dry: 'honganji', kitchen: 'chufang', kitchen2: 'chufang', mayo: 'jiaobanji', pickle: 'yancai', jam: 'guojiangguo', smoke: 'xunyu', loom: 'zhibu', cheese: 'nainao' };
  /* 设计 34：4 台新机器的模型到了（第 2 台木工台和第 1 台同一个）；没有模型的才用方块占位 */
  const WS_HOLD = { sweet: 0xe8c0d0, wood: 0x9a6a3a, split: 0x6a8a7a, can: 0x6a7aa0, dry: 0xa05a3a };
  const holdBox = k => { const g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color: WS_HOLD[k] || 0x888888 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 1.4), m); b.position.y = 0.6; b.castShadow = b.receiveShadow = true; g.add(b);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.7), new THREE.MeshLambertMaterial({ color: 0x5a5a5a })); t.position.set(0, 1.45, 0); t.castShadow = true; g.add(t); return g };
  const wsItems = {};
  function syncWs(list, lv) {
    for (const k of Object.keys(wsItems)) if (!list.some(w => w.k === k)) { const it = wsItems[k]; scene.remove(it.g); Object.assign(it.box, { x0: 0, x1: 0, z0: 0, z1: 0 }); delete wsItems[k] }
    for (const w of list) {
      let it = wsItems[w.k]; if (!it) { const box = { x0: 0, x1: 0, z0: 0, z1: 0 }; obstacles.push(box); it = wsItems[w.k] = { g: new THREE.Group(), box, lv: 0 }; scene.add(it.g) }
      const L = Math.max(1, Math.min(3, lv[w.k] || 1));
      if (it.lv !== L) { const src = WS_MODEL[w.k] ? prop(`${WS_MODEL[w.k]}-${L}`, { scale: 1, tint: 0xffffff }) : holdBox(w.k);
        if (src) { if (it.m) it.g.remove(it.m); src.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(src), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
          const t = { ...w, t: '_' + w.k }, [cw, cd] = [cellsOf({ ...t, rot: 0 }).reduce((a, [x]) => Math.max(a, x), -99) - cellsOf({ ...t, rot: 0 }).reduce((a, [x]) => Math.min(a, x), 99) + 1, cellsOf({ ...t, rot: 0 }).reduce((a, [, y]) => Math.max(a, y), -99) - cellsOf({ ...t, rot: 0 }).reduce((a, [, y]) => Math.min(a, y), 99) + 1];
          const k = Math.min((cw * 0.8 - 0.2) / sz.x, (cd * 0.8 - 0.2) / sz.z, (w.k === 'kitchen' || w.k === 'kitchen2' ? 3.2 : 3.0) / sz.y);   /* 放得下，也别太高 */ const m = new THREE.Group(); src.position.set(-c.x, -bb.min.y, -c.z); m.add(src); m.scale.setScalar(k);
          it.g.add(m); it.m = m; it.lv = L; it.top = sz.y * k } }   // 35b：模型多高（名字牌放在模型头顶，不再统一 3.4 米）
      const p = wsWorld(w); it.g.position.set(p.x, 0, p.z); it.g.rotation.y = w.rot * Math.PI / 2;   // 0.45 露天工坊自己的网格（layout.js WG）
      const cs = wsCells(w), xs = cs.map(([c]) => c), zs = cs.map(([, r]) => r);
      Object.assign(it.box, { x0: WG.x0 + Math.min(...xs) * WG.cell + 0.1, x1: WG.x0 + (Math.max(...xs) + 1) * WG.cell - 0.1, z0: WG.z0 + Math.min(...zs) * WG.cell + 0.1, z1: WG.z0 + (Math.max(...zs) + 1) * WG.cell - 0.1 });
    }
    return list.every(w => wsItems[w.k] && wsItems[w.k].m);
  }
  const lotStuff = [];
  function setStoreBig(big) {
    /* 0.42 用户：超市不再扩大店面；3 级起原来的扩建地盖成「工坊」（店面南墙照旧，工坊的南墙在 BIG_Z，门在同一个位置），东门换成大自动门 */
    /* 0.45 整体布局（设计/22）：工坊搬到院子西北角露天，超市南边不再有房间；这里只换东门（3 级起大自动门）和工坊空地的牌子 */
    bigGrp.visible = false; lotStuff.forEach(o => { o.visible = !big });
    eastSmall.visible = !big; eastBig.visible = big; eastSeg(big ? DOOR_BIG : DOOR).forEach((sg, i) => Object.assign(eastSolids[i], sg));
    return 0;
  }
  /* 店里、门口的摆设（Kenney Furniture / Survival Kit） */
  later.push(() => {
    const put = (n, x, z, ry, scale, tint = 0xffffff) => { const o = prop(n, { scale, tint }); if (o) { o.position.set(x, 0, z); o.rotation.y = ry; scene.add(o) } return o || { position: {} } };
    const putF = (k, n, x, z, ry, scale, tint = 0xffffff) => { const o = prop(n, { scale, tint }); if (o) { o.rotation.y = ry; inFix(k, o, x, 0, z) } return o || { position: {} } };
    putF('fridgeDeco', 'kitchenFridgeLarge', S0.x1 - 1.6, S0.z0 + 0.55, 0, 2.1);    // 冰箱摆设（以后卖鱼）
    putF('plantDoor', 'pottedPlant', fixG.plantDoor.userData.x, fixG.plantDoor.userData.z, 0, 2.6); putF('plantSW', 'pottedPlant', fixG.plantSW.userData.x, fixG.plantSW.userData.z, 0, 2.6);
    put('trashcan', S0.x1 + 0.9, DOOR.z1 + 0.9, 0, 1.3, 0xbfbfbf); put('rugDoormat', S0.x1 - 0.5, dz, Math.PI / 2, 3);
    putF('boxes', 'cardboardBoxClosed', S0.x0 + 0.8, S0.z0 + 0.8, 0.3, 2.6); putF('boxes', 'cardboardBoxOpen', S0.x0 + 1.6, S0.z0 + 0.7, -0.2, 2.6); putF('boxes', 'cardboardBoxClosed', S0.x0 + 0.8, S0.z0 + 0.8, 0.8, 2.2).position.y = 0.72;
    /* 0.14：收银台换成 Mini Market 的收银机柜台（红色配色），后面接一段灰色柜台 */
    { const cr = prop('m:cash-register', { scale: 1, tint: 0xffffff, skin: 'market-b' });
      if (cr) { cr.scale.set(1.15, 1.75, 1.15); cr.rotation.y = -Math.PI / 2; inFix('reg', cr, REG0.x, 0, REG0.z + 0.55); inFix('reg', M.box(0.85, 1.0, 1.2, 0x6c6f78, 0, 0, 0), REG0.x, 0.5, REG0.z - 0.55); inFix('reg', M.box(0.9, 0.06, 1.25, 0x4a4d55, 0, 0, 0), REG0.x, 1.02, REG0.z - 0.55); regOld.forEach(o => { o.visible = false }) } }
    putF('reg', 'computerScreen', REG0.x + 0.1, REG0.z - 0.35, Math.PI / 2, 2).position.y = 1.05; putF('reg', 'radio', REG0.x - 0.1, REG0.z - 0.9, Math.PI / 2 + 0.3, 1.6).position.y = 1.05;
    /* 0.44 收银台换成用户生成的模型 shouyintai（一体的收银柜台 + 传送带）：长 2.3 米顺着收银台的 3 格放，高 1 米；原来拼的那些藏起来 */
    { const src = prop('shouyintai', { scale: 1, tint: 0xffffff });
      if (src) { for (const c of fixG.reg.children) c.visible = false;
        src.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(src), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3()), k = 2.3 / sz.x;
        const o = new THREE.Group(); src.position.set(-c.x, -bb.min.y, -c.z); o.add(src); o.scale.set(k, Math.min(k * 1.25, 1.0 / sz.y), k); o.rotation.y = -Math.PI / 2; inFix('reg', o, REG0.x, 0, REG0.z) } }
    putF('lamp', 'lampRoundFloor', fixG.lamp.userData.x, fixG.lamp.userData.z, 0, 2.4);
    /* 门外：木桶、木箱 */
    put('barrel', S0.x1 + 0.8, DOOR.z0 - 1.6, 0, 3);   // V1.01 东北角的木箱去掉（那里是新工坊）
    solid(S0.x1 + 0.4, S0.x1 + 1.3, DOOR.z0 - 2, DOOR.z0 - 1.2);
  });

  /* 货柜：种类、档次变了就换模型；位置由存档里的布局（S.layout）决定 */
  const fixtures = [];               // [{ m, key }]
  function syncFixtures(list, lay) {
    for (let i = 0; i < Math.max(list.length, fixtures.length); i++) {
      const sh = list[i], f = fixtures[i] || (fixtures[i] = { m: null, key: '' }), key = sh ? (sh.type || 'shelf') + ':' + (sh.tier || 1) : '';
      if (key !== f.key) { if (f.m) scene.remove(f.m); f.m = sh ? M.fixtureMesh(sh.type || 'shelf', sh.tier || 1) : null; f.key = key; if (f.m) scene.add(f.m) }
      if (f.m) { f.m.visible = !!lay[i]; if (lay[i]) { const w = shelfWorld(lay[i]); f.m.position.set(w.x, 0, w.z); f.m.rotation.y = w.ry } }
    }
    return fixtures;
  }

  /* 回收机、建造台 */
  /* 0.28 回收机换成用户做的 5 个等级的模型（recycler.js）；模型读到之前先摆原来的方块机器 */
  const recOld = M.recyclerMesh(); recOld.userData.light.visible = false;
  const recycler = createRecycler({ scene, obstacles, pos: REC_POS, fallback: recOld, obb });
  /* ---------- 仓库：5 个等级 5 种样子，从小木棚到大铁皮库房 ----------
     铁皮棚一格 = 0.54 × 4 = 2.16 米。门朝南（+z）。 */
  const whRoot = new THREE.Group(); whRoot.position.copy(WH_POS); scene.add(whRoot);
  const whBox = { x0: 0, x1: 0, z0: 0, z1: 0 }; obstacles.push(whBox);
  const WM = 0.54 * 4;
  /* 每级：w × d 格、用什么材料、门口堆几样东西 */
  const WH_LV = [null,
    { w: 1, d: 1, kind: 'wood' },
    { w: 2, d: 1, kind: 'wood' },
    { w: 2, d: 1, kind: 'metal' },
    { w: 3, d: 1, kind: 'metal' },
    { w: 3, d: 2, kind: 'metal' },
  ];
  const whLevels = [null];
  const whFallback = [null];
  for (let lv = 1; lv <= 5; lv++) {
    const L = WH_LV[lv], g = new THREE.Group(); g.visible = false; whRoot.add(g); whLevels.push(g);
    /* 模型没读到时的方块版 */
    const f = M.box(L.w * WM, 1.8 + lv * 0.15, L.d * WM, L.kind === 'wood' ? 0x8a6a46 : 0x7d8a8f, 0, 0.9 + lv * 0.075, -(L.d - 1) * WM / 2); g.add(f); whFallback.push(f);
  }
  /* 0.14 用户定：仓库换成 Mini Market 的墙（红色配色）盖的小库房：正面中间一扇门、两边窗，平顶；等级越高越大，门口的箱子桶越多 */
  let whNew = false;
  later.push(() => {
    const T = n => prop('m:' + n, { scale: 1, tint: 0xffffff, skin: 'market-b' }); if (!T('wall')) return;
    whNew = true;
    for (let lv = 1; lv <= 5; lv++) {
      const L = WH_LV[lv], g = whLevels[lv], W = L.w * WM, D = L.d * WM, h = 2.3 + lv * 0.12, cz = -(L.d - 1) * WM / 2;
      const x0 = -W / 2, x1 = W / 2, z0 = WM / 2 - D, z1 = WM / 2;
      const run = (ax, az, bx, bz, kinds) => { const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 1.4)), ry = Math.atan2(bx - ax, bz - az) - Math.PI / 2;
        for (let i = 0; i < n; i++) { const k = (i + 0.5) / n, o = T(kinds(i, n)); o.scale.set(len / n, h, 0.45); o.rotation.y = ry; o.position.set(ax + (bx - ax) * k, 0, az + (bz - az) * k); g.add(o) } };
      run(x0, z1, x1, z1, (i, n) => i === Math.floor(n / 2) ? 'wall-door-rotate' : 'wall-window');   // 正面
      run(x0, z0, x1, z0, () => 'wall'); run(x0, z0, x0, z1, () => 'wall'); run(x1, z0, x1, z1, (i) => i % 2 ? 'wall' : 'wall-window');
      for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) { const c = T('column'); c.scale.set(0.6, h + 0.1, 0.6); c.position.set(x, 0, z); g.add(c) }
      g.add(M.box(W + 0.5, 0.22, D + 0.5, 0x5a5d66, 0, h + 0.11, cz), M.box(W + 0.56, 0.12, D + 0.56, 0xc8442f, 0, h + 0.02, cz));   // 平顶 + 红色檐边
      const ex = x1 + 0.6, stuff = [['p:crate', ex, z1 - 0.5, 0.75], ['p:barrel', x0 - 0.6, z1 - 0.6, 0.6], ['p:crate-bottles', ex, z1 - 1.5, 0.75], ['p:barrel', x0 - 0.6, z1 - 1.5, 0.6], ['p:crate', ex + 0.1, z1 - 2.5, 0.7], ['p:chest', x0 - 0.7, z1 - 2.5, 0.6]];
      stuff.slice(0, lv + 1).forEach(([n, x, z, sc], i) => { const o = prop(n, { scale: sc, tint: 0xe8e0d4 }); if (o) { o.position.set(x, 0, z); o.rotation.y = i * 0.7; g.add(o) } });
      whFallback[lv].visible = false;
    }
  });
  later.push(() => {
    if (whNew) return;
    for (let lv = 1; lv <= 5; lv++) {
      const L = WH_LV[lv], g = whLevels[lv], parts = [];
      const put = (n, x, y, z, ry, sc = 4, tint = 0xd0c8b8) => { const o = prop(n, { scale: sc, tint }); if (o) { o.position.set(x, y, z); o.rotation.y = ry; parts.push(o) } return o };
      const xs = Array.from({ length: L.w }, (_, i) => (i - (L.w - 1) / 2) * WM), zs = Array.from({ length: L.d }, (_, j) => -j * WM);
      const back = zs[zs.length - 1];
      for (const x of xs) for (const z of zs) {
        if (L.kind === 'wood') { put('structure', x, 0, z, 0); put('structure-canvas', x, 0, z, 0, 4, 0xe0d8c0) }
        else { put('structure-metal', x, 0, z, 0); put('structure-metal-roof', x, 0, z, 0, 4, lv === 5 ? 0xb8c4c8 : 0xc8b8a0) }
      }
      if (L.kind === 'wood') {                                  // 木棚：铺一层木板顶，稍微斜一点
        const roof = M.box(L.w * WM + 0.3, 0.1, L.d * WM + 0.4, 0x7a5a3a, 0, WM + 0.05, -(L.d - 1) * WM / 2); roof.rotation.x = -0.08; parts.push(roof);
        for (let i = 0; i < L.w * 3; i++) { const pl = M.box(0.06, 0.04, L.d * WM + 0.42, 0x5e4430, -L.w * WM / 2 + (i + 0.5) * WM / 3, WM + 0.12, -(L.d - 1) * WM / 2); pl.rotation.x = -0.08; parts.push(pl) }
      }
      if (L.kind === 'metal') {
        for (const x of xs) put('structure-metal-wall', x, 0, back, 0);                          // 后墙
        for (const z of zs) { put('structure-metal-wall', xs[0], 0, z, Math.PI / 2); put('structure-metal-wall', xs[xs.length - 1], 0, z, -Math.PI / 2) }  // 两边
        xs.forEach((x, i) => put(i === Math.floor(xs.length / 2) ? 'structure-metal-doorway' : 'structure-metal-wall', x, 0, 0, Math.PI));   // 前面：中间一格是门
      }
      /* 门口和旁边堆的箱子、桶，等级越高越多 */
      const ex = xs[xs.length - 1] + WM / 2, fz = WM / 2;
      const stuff = [['box', ex + 0.5, fz - 0.4, 3], ['barrel', xs[0] - WM / 2 - 0.5, fz - 0.6, 3], ['box-large', ex + 0.6, fz - 1.6, 3.2], ['box', ex + 0.5, fz - 1.6, 2.6, 0.9], ['barrel', xs[0] - WM / 2 - 0.5, fz - 1.5, 3], ['box-large', ex + 0.6, back - 0.6, 3.2], ['chest', xs[0] - WM / 2 - 0.6, back - 0.4, 3.2]];
      stuff.slice(0, lv + 1).forEach(([n, x, z, sc, ry]) => put(n, x, 0, z, ry || 0, sc));   // 设计 40：仓库回到超市北边，门口和旁边又堆上箱子、桶
      if (parts.length < 3) continue;
      whFallback[lv].visible = false; parts.forEach(o => g.add(o));
    }
  });
  const whSign = signMesh('仓库', 1.4, 0.45, '#5a4a2f'); whRoot.add(whSign);
  function setWarehouse(lv) {
    lv = Math.max(1, Math.min(5, lv || 1)); const L = WH_LV[lv];
    whLevels.forEach((g, i) => { if (g) g.visible = i === lv });
    const hw = L.w * WM / 2, d = L.d * WM;
    /* 设计 40：回到 0.44——超市北墙外、回收机旁边，门朝南对着超市；位置固定，等级高了往北（后面）加深 */
    whRoot.position.copy(WH_POS);
    Object.assign(whBox, { x0: WH_POS.x - hw + 0.1, x1: WH_POS.x + hw - 0.1, z0: WH_POS.z - d + WM / 2 + 0.1, z1: WH_POS.z + WM / 2 - 0.1 });
    whSign.position.set(0, whNew ? 2.3 + lv * 0.12 + 0.5 : L.kind === 'wood' ? 2.3 : 2.25, WM / 2 + 0.08);
  }
  setWarehouse(1);

  /* ---------- 尸潮：塔位、塔、路障、警报器 ---------- */
  const towerSolids = TOWER_SPOTS.map(() => { const b = { x0: 0, x1: 0, z0: 0, z1: 0 }; obstacles.push(b); return b });
  const spotPads = TOWER_SPOTS.map(([x, z]) => { const m = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 24), new THREE.MeshBasicMaterial({ color: 0xe8c06a, transparent: true, opacity: 0.55, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.03, z); m.visible = false; return m });   // V1.01：空塔位也不画圆圈
  const towers = TOWER_SPOTS.map(() => ({ g: null, key: '', aim: null }));
  function syncTowers(list) {
    list.forEach((t, i) => {
      const f = towers[i], key = t ? t.k + ':' + t.lv : '', [x, z] = TOWER_SPOTS[i];
      if (key !== f.key) { if (f.g) scene.remove(f.g); f.key = key; f.g = t ? towerMesh(t.k, t.lv) : null; if (f.g) { f.g.position.set(x, 0, z); f.g.rotation.y = 0; scene.add(f.g) } f.aim = f.g && f.g.userData.aim }
      spotPads[i].visible = false;
      Object.assign(towerSolids[i], t ? { x0: x - 0.75, x1: x + 0.75, z0: z - 0.75, z1: z + 0.75 } : { x0: 0, x1: 0, z0: 0, z1: 0 });
    });
    return towers;
  }
  /* 路障：木桩 + 横木，血量越少越破 */
  const barricade = new THREE.Group(); barricade.position.copy(BARRICADE); barricade.rotation.y = Math.PI / 2; scene.add(barricade);
  const barParts = [];
  for (const x of [-0.9, 0, 0.9]) { const p = M.box(0.14, 1.1, 0.14, 0x6e5338, x, 0.55, 0); barricade.add(p); barParts.push(p) }
  for (const y of [0.35, 0.8]) { const b = M.box(2.2, 0.16, 0.08, 0x8c6a46, 0, y, 0.08); b.rotation.z = y > 0.5 ? 0.06 : -0.05; barricade.add(b); barParts.push(b) }
  barricade.visible = false;
  function setBarricade(on, frac = 1) { barricade.visible = on; barParts.forEach((p, i) => { p.visible = frac > i / barParts.length * 0.9 }) }
  /* 警报器：杆子 + 红色警灯 + 牌子 */
  /* 0.13 用户定：去掉院子里的尸潮警报器，尸潮只从「☰」→「尸潮」开打（警灯留个空对象，免得别处引用出错） */
  const alarm = new THREE.Group(); alarm.position.copy(ALARM_POS); alarm.visible = false;
  alarm.add(M.box(0.16, 2.2, 0.16, 0x4a4a4a, 0, 1.1, 0), M.box(0.9, 0.5, 0.5, 0x5a5f66, 0, 2.3, 0), M.box(1.1, 0.12, 0.6, 0x3a3f44, 0, 2.05, 0));
  const alarmLight = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff3a2a })); alarmLight.position.set(0, 2.75, 0); alarm.add(alarmLight);
  { const sg = signMesh('尸潮警报', 1.2, 0.4, '#8a2a20'); sg.position.set(0, 1.5, 0.1); alarm.add(sg) }

  /* 小码头：水面（比地面高一点点盖住草）、四周一圈岸边，模型见下面
     0.44 用户：湖不要方方正正的（设计/23「湖面形状」）——15 个控制点围一圈圆润不规则的轮廓（CatmullRom 闭合曲线），
     栈桥根部那段岸比较直；外面一圈岸边带（往外 1 米，外缘慢慢透明接草地），里面一圈浅水颜色浅一点；碰撞按轮廓切成 0.5 米的横条 */
  { const LK = [[-64.4, 7.75], [-62.5, 7.6], [-60.8, 7.75], [-59.2, 8.7], [-58.3, 10.7], [-58.7, 12.9], [-58.1, 15.2], [-58.7, 17.6], [-60.5, 18.6], [-63.3, 18.9], [-66.1, 18.5], [-68.5, 17.4], [-69.2, 15.5], [-68.4, 13], [-69, 10.5], [-67.4, 8.4]].map(([x, z]) => [x + 5.5, z + 5]);   // 设计 43：整片挪到牧场南边
    const cv = new THREE.CatmullRomCurve3(LK.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal'), ring = cv.getSpacedPoints(96).slice(0, 96).map(v => [v.x, v.z]);
    const n = ring.length, nor = ring.map((p, i) => { const a = ring[(i + n - 1) % n], b = ring[(i + 1) % n], tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1; return [tz / l, -tx / l] });
    { let ar = 0; for (let i = 0; i < n; i++) { const p = ring[i], q = ring[(i + 1) % n]; ar += p[0] * q[1] - q[0] * p[1] } if (ar < 0) for (const v of nor) { v[0] = -v[0]; v[1] = -v[1] } }   // 法线一律朝外
    const off = d => ring.map((p, i) => [p[0] + nor[i][0] * d, p[1] + nor[i][1] * d]);
    noGrass.push({ poly: off(0.75) });
    /* 平面多边形（世界 x、z）→ 贴地的网格，UV 按世界坐标（每 tile 米一张贴图，不拉伸） */
    const flat = (poly, y, mat, tile, hole) => { const sh = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z))); if (hole) sh.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))));   // 设计 65：中间挖掉（深水那块），两层不叠
      const g = new THREE.ShapeGeometry(sh, 1), uv = g.attributes.uv, ps = g.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, ps.getX(i) / tile, ps.getY(i) / tile);
      const m = new THREE.Mesh(g, mat); m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; scene.add(m); return m };
    /* 岸边带：内圈（水下 0.3 米）到外圈 1 米，外面 0.45 米慢慢透明 */
    { const A = off(0), B = off(0.55), C = off(1.0),   /* 设计 65：里圈从水边开始（以前伸到水下 0.3 米，被水盖住，白叠一层） */ pos = [], col = [], uvs = [], idx = [];
      const put = (p, al) => { pos.push(p[0], 0, p[1]); col.push(1, 1, 1, al); uvs.push(p[0] / 3, -p[1] / 3) };
      for (let i = 0; i < n; i++) { put(A[i], 1); put(B[i], 1); put(C[i], 0) }
      for (let i = 0; i < n; i++) { const j = (i + 1) % n, a = i * 3, b = j * 3; for (let k = 0; k < 2; k++) idx.push(a + k, b + k, a + k + 1, b + k, b + k + 1, a + k + 1) }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => i % 3 === 1 ? 1 : 0), 3)); g.setIndex(idx);
      const st = TL.load('img/ground/shore.jpg');   // 用户画的湖岸边贴图
      st.colorSpace = THREE.SRGBColorSpace; st.wrapS = st.wrapT = THREE.RepeatWrapping;
      const m = new THREE.Mesh(g, liven(new THREE.MeshLambertMaterial({ map: st, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide })));
      m.position.y = 0.0085; m.receiveShadow = true; scene.add(m) }
    const ldTex = (f, rx = 1, ry = 1) => { const t = TL.load(`img/ground/${f}`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return t };
    const addMat = (map, op) => new THREE.MeshBasicMaterial({ map, color: 0xffffff, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
    /* 沿一圈（或一圈椭圆）铺一条带子：A 是里圈、B 是外圈，u 顺着走的长度（整圈正好整数张，接口不露缝），v 从里到外 0→1 */
    const band = (A, B, uLen, mat, y, wgt) => { const m2 = A.length, len = [0]; for (let i = 1; i <= m2; i++) len.push(len[i - 1] + Math.hypot(A[i % m2][0] - A[i - 1][0], A[i % m2][1] - A[i - 1][1]));
      const reps = Math.max(1, Math.round(len[m2] / uLen)), pos = [], uvs = [], idx = [];
      const cols = []; for (let i = 0; i <= m2; i++) { const a = A[i % m2], b = B[i % m2], u = len[i] / len[m2] * reps, w = wgt ? wgt[i % m2] : 1; pos.push(a[0], 0, a[1], b[0], 0, b[1]); uvs.push(u, 0, u, 1); cols.push(w, w, w, w, w, w) }
      for (let i = 0; i < m2; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1) }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx);
      if (wgt) { g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); mat.vertexColors = true }   // 加色混合：颜色越黑越淡
      mat.side = THREE.DoubleSide; const m = new THREE.Mesh(g, mat); m.position.y = y; m.renderOrder = 2; scene.add(m); return m };
    const wt = TL.load('img/ground/water.jpg'); wt.colorSpace = THREE.SRGBColorSpace; wt.wrapS = wt.wrapT = THREE.RepeatWrapping; lakeTex = wt;   // 0.45 湖面也用用户画的水面贴图（慢慢流）
    flat(ring, 0.012, liven(new THREE.MeshLambertMaterial({ map: wt, color: 0xd2ecee }), { vary: 0, cloudK: 0.16 }), 4, off(-0.55));   // 浅水（设计 65：只铺外圈，深水那块挖掉）
    flat(off(-0.55), 0.013, liven(new THREE.MeshLambertMaterial({ map: wt, color: 0xb0d2dc }), { vary: 0, cloudK: 0.16 }), 4);   // 深一点的水
    /* 第 2 层：黑底白纹的亮纹贴图加色叠上去，往另一个方向滑；第 3 层：岸边一圈白浪，栈桥、渔船周围各一圈小白浪 */
    { const ct = ldTex('caustic.jpg'); LFX.caus.push(ct); const cm = flat(off(-0.2), 0.0145, addMat(ct, 0.15), 3.5); cm.renderOrder = 2; cm.receiveShadow = false }
    /* 物理上：风从南边吹来，浪往北走——北岸（下风）浪打上来白浪多，南岸（上风）几乎没有；白浪一涌一退（贴图沿 v 往岸上推再退回来） */
    { const ft = ldTex('foam.jpg'); LFX.foamTex = ft; const fm = addMat(ft, 0.5); LFX.foam.push(fm);
      band(off(-0.4), off(0), 4, fm, 0.016,   /* 设计 65：外圈到水边为止，不再压到岸边带上 */ nor.map(([, nz]) => 0.15 + 0.85 * Math.max(0, -nz))) }
    /* 栈桥木桩、渔船旁边：浪碰到东西，一圈圈涟漪从里往外扩散、变淡（不是贴着模型的一圈白边） */
    { const rg = new THREE.RingGeometry(0.86, 1, 36); rg.rotateX(-Math.PI / 2);
      const src = [[DOCK_POS.x - 0.62, POND.z0 + 1.6, 0.18, 0.18], [DOCK_POS.x + 0.42, POND.z0 + 3.0, 0.18, 0.18], [DOCK_POS.x - 0.62, POND.z0 + 4.2, 0.18, 0.18], [DOCK_POS.x + 1.85, POND.z0 + 3.2, 0.7, 1.6]];
      LFX.rip = []; for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); m.position.y = 0.017; m.renderOrder = 2; m.visible = false; scene.add(m); LFX.rip.push({ m, age: 9, s: null }) }
      LFX.ripSrc = src; LFX.ripNext = 0 }
    /* 碰撞：每 0.5 米一条横条，条里落在轮廓内的 x 段都挡住；栈桥那条走道（DOCK_POS.x ± 0.8，到 z0 + 5.2）留空 */
    const DZ = POND.z0 + 5.2;
    for (let z = POND.z0 - 0.5; z < POND.z1 + 0.5; z += 0.5) { const zc = z + 0.25, xs = [];
      for (let i = 0; i < n; i++) { const p = ring[i], q = ring[(i + 1) % n]; if ((p[1] > zc) !== (q[1] > zc)) xs.push(p[0] + (zc - p[1]) / (q[1] - p[1]) * (q[0] - p[0])) }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) { const x0 = xs[k] + 0.15, x1 = xs[k + 1] - 0.15; if (x1 <= x0) continue;   // 往里收 0.15 米：人可以站到水边
        if (zc < DZ && x0 < DOCK_POS.x - 0.8 && x1 > DOCK_POS.x + 0.8) { solid(x0, DOCK_POS.x - 0.8, z, z + 0.5); solid(DOCK_POS.x + 0.8, x1, z, z + 0.5) }
        else solid(x0, x1, z, z + 0.5) } }
    /* 0.14 用户定：用 Pirate Kit 重新布置——木板栈桥、小帆船、椰子树、沙地石头；院子商人用 Coaster Kit 的小卖亭 */
    later.push(() => {
      const P = (n, sc, x, z, ry = 0, y = 0, tint = 0xf0e8dc) => { const o = prop('p:' + n, { scale: sc, tint }); if (o) { o.position.set(x, y, z); o.rotation.y = ry; scene.add(o) } return o };
      /* 0.44 用户生成的木栈桥 zhanqiao、小渔船 yuchuan（设计/23）：栈桥一整条，宽 1.6 米（走道），从岸上 z0-1.2 伸到 z0+4.4；
         木板面贴着地（下面的木桩藏到水面下）；渔船顺着栈桥停在东边。没加载到就用原来的 Kenney 木板 + 小帆船 */
      const user = (n, w, len, x, z, ry, deck) => { const src = prop(n, { scale: 1, tint: 0xffffff }); if (!src) return null;
        src.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.side = THREE.DoubleSide } });   // 栈桥木板有的面是反的，两面都画（找木板高度的射线也要打得到）
        src.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(src), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
        const k = w / sz.x, kz = len / sz.z, o = new THREE.Group(); src.position.set(-c.x, -bb.min.y, -c.z); o.add(src); o.scale.set(k, k, kz);
        let dy = 0; if (deck) { const hs = [];   // 木板面高度：顺着栈桥打 7 根射线取中间值（有的会从木板缝里漏到下面的横梁）
          for (let t = -3; t <= 3; t++) { const rc = new THREE.Raycaster(new THREE.Vector3(c.x - sz.x * 0.1, bb.max.y + 1, c.z + sz.z * t * 0.13), new THREE.Vector3(0, -1, 0)); const h = rc.intersectObject(src, true).find(q => q.point.y < bb.min.y + sz.y * 0.6); if (h) hs.push(h.point.y) }
          hs.sort((a, b) => a - b); if (hs.length) dy = -(hs[hs.length >> 1] - bb.min.y) * k + 0.12 }
        o.position.set(x, deck ? dy : -0.35, z); o.rotation.y = ry; o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } }); scene.add(o); return o };
      const dk = user('zhanqiao', 1.7, 5.6, DOCK_POS.x, POND.z0 + 1.6, 0, true);
      if (dk) {   // 用户：栈桥不能漏水、不能被水淹——把整条木板面量一遍（从上往下打一排射线），最低的木板也要比水面高 15 厘米；木板下面垫一块深木色的实心底，板缝里看不到水
        dk.updateMatrixWorld(true); const hit = []; const cast = (x, z) => new THREE.Raycaster(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0)).intersectObject(dk, true).find(q => q.point.y < 1.2);
        for (let z = POND.z0 - 1.1; z <= POND.z0 + 4.3; z += 0.2) for (let x = DOCK_POS.x - 1; x <= DOCK_POS.x + 1; x += 0.08) { const h = cast(x, z); if (h) hit.push([x, z, h.point.y]) }
        if (hit.length) { const ys = hit.map(h => h[2]).sort((a, b) => a - b), mid = ys[ys.length >> 1], deck = hit.filter(h => Math.abs(h[2] - mid) < 0.12);
          const lo = Math.min(...deck.map(h => h[2])); if (lo < 0.15) { dk.position.y += 0.15 - lo }
          const x0 = Math.min(...deck.map(h => h[0])) + 0.25, x1 = Math.max(...deck.map(h => h[0])) - 0.3, z0 = Math.min(...deck.map(h => h[1])) + 0.1, z1 = Math.max(...deck.map(h => h[1])) - 0.1, top = Math.max(lo, 0.15) - 0.04;
          const ub = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, top + 0.05, z1 - z0), new THREE.MeshLambertMaterial({ color: 0x5a3e26 })); ub.position.set((x0 + x1) / 2, (top - 0.05) / 2, (z0 + z1) / 2); scene.add(ub) } }
      if (!dk) {
        for (let z = POND.z0 - 1.2; z < POND.z0 + 3.6; z += 1.7) P('platform', 0.68, DOCK_POS.x, z + 0.85, 0, -0.02);   // 0.45 湖变成南北长：栈桥从北岸伸进去 5 米
        P('flag-high-pennant', 0.55, DOCK_POS.x + 0.7, POND.z0 + 3.4, -0.4) }
      const bt = user('yuchuan', 1.35, 3.2, DOCK_POS.x + 1.85, POND.z0 + 3.2, 0, false); if (bt) {   // 用户：船别沉在水里、水别漏进船里——找船舱底板的高度（从上往下打几根射线取最低的那一下），让底板比水面高 12 厘米；pondTick 里跟着浪摇
        bt.position.y = 0; bt.updateMatrixWorld(true); let fl = Infinity;
        for (const [dx, dz] of [[0, -0.6], [0, 0], [0, 0.6], [0.2, 0.3], [-0.2, -0.3]]) { const h = new THREE.Raycaster(new THREE.Vector3(bt.position.x + dx, 5, bt.position.z + dz), new THREE.Vector3(0, -1, 0)).intersectObject(bt, true)[0]; if (h && h.point.y < 0.9) fl = Math.min(fl, h.point.y) }
        LFX.boatY = Math.min(0, 0.13 - (fl === Infinity ? 0.2 : fl)); bt.position.y = LFX.boatY; LFX.boat = noCast(bt) }   // 设计 57：船一直在晃，不进影子图
      if (!bt) P('ship-small', 0.36, DOCK_POS.x + 2.9, POND.z0 + 3.6, Math.PI / 2, -0.15);                    // 小帆船
      P('boat-row-small', 0.55, POND.x0 + 2.2, POND.z1 - 1.4, 0.5, 0.02);
      for (const [n, sc, x, z, ry] of [['palm-bend', 0.95, POND.x0 + 0.2, POND.z0 - 0.9, 0.6], ['palm-detailed-straight', 0.9, POND.x1 + 0.9, POND.z0 - 0.4, 2], ['palm-straight', 0.8, POND.x1 + 1.6, POND.z1 - 1.4, 1], ['palm-detailed-bend', 0.9, POND.x0 - 0.2, POND.z1 - 2.2, -0.8]]) {
        if (P(n, sc, x, z, ry)) solid(x - 0.3, x + 0.3, z - 0.3, z + 0.3) }
      for (const [n, sc, x, z] of [['rocks-sand-c', 0.32, POND.x0 + 0.5, POND.z0 + 0.4], ['rocks-sand-a', 0.26, POND.x1 - 0.6, POND.z0 + 0.5], ['rocks-c', 0.2, POND.x1 - 0.4, POND.z1 - 0.6]]) P(n, sc, x, z, x);
      for (const [n, sc, x, z] of [['crate', 0.6, DOCK_POS.x - 1.3, POND.z0 - 1.6], ['barrel', 0.5, DOCK_POS.x - 1.4, POND.z0 - 0.7], ['grass-plant', 0.9, POND.x0 + 3.6, POND.z0 - 0.9], ['patch-grass-foliage', 0.35, POND.x1 + 2, POND.z0 - 1.6]]) P(n, sc, x, z, x * 2);
      solid(DOCK_POS.x - 1.9, DOCK_POS.x - 0.8, POND.z0 - 2.1, POND.z0 - 0.3);
      /* 院子商人（0.14 用户定：就是一个人，不要店面）：身边放几个货箱、木桶 */
      for (const [n, sc, dx, dz, ry] of [['crate', 0.55, -1.0, -0.6, 0.3], ['crate-bottles', 0.5, -1.0, 0.5, -0.2], ['barrel', 0.45, -0.3, 1.1, 0]]) P(n, sc, MERCH_POS.x + dx, MERCH_POS.z + dz, ry);
    });
    solid(MERCH_POS.x - 1.5, MERCH_POS.x - 0.5, MERCH_POS.z - 1.1, MERCH_POS.z + 0.9); solid(MERCH_POS.x - 0.3, MERCH_POS.x + 0.3, MERCH_POS.z - 0.3, MERCH_POS.z + 0.3);
  }
  /* 0.44 用户：建造台去掉（没必要） */
  /* 营地：宿舍楼、篝火，在院子东南 */
  /* 宿舍楼：营地 1～4 级换 City Kit 的楼（2 层 → 2 层加宽 → 3 层 → 4 层），暖色墙面；模型没读到就用代码拼的方块楼 */
  const dormRoot = new THREE.Group(); dormRoot.position.copy(DORM_POS); scene.add(dormRoot);
  const dormBox = { x0: 0, x1: 0, z0: 0, z1: 0 }; obstacles.push(dormBox);
  const DORM_MODEL = [null, ['building-c', 3.4], ['building-e', 3.4], ['building-b', 3.4], ['building-g', 3.4]];
  const DORM_TINT = [0, 0xe8c7a0, 0xe6b98e, 0xdcae86, 0xd8a47c];
  function setCamp(lv) {
    dormRoot.clear(); Object.assign(dormBox, { x0: 0, x1: 0, z0: 0, z1: 0 }); lv = Math.max(1, Math.min(4, lv || 1));
    const [n, sc] = DORM_MODEL[lv]; let o = prop(n, { scale: sc, tint: DORM_TINT[lv] });
    if (!o) o = M.ruinMesh(3 + lv * 0.6, 2 + lv * 0.8, 3, DORM_TINT[lv]);
    o.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(o), w = bb.max.x - bb.min.x, d = bb.max.z - bb.min.z;
    const k = Math.min(1, (DORM_AREA.x1 - DORM_AREA.x0) / w, (DORM_AREA.z1 - DORM_AREA.z0) / d); o.scale.multiplyScalar(k); o.updateMatrixWorld(true); bb.setFromObject(o);
    o.position.set(-(bb.min.x + bb.max.x) / 2, 0, -(bb.min.z + bb.max.z) / 2); dormRoot.add(o);
    const hw = (bb.max.x - bb.min.x) / 2, hd = (bb.max.z - bb.min.z) / 2;
    Object.assign(dormBox, { x0: DORM_POS.x - hw + 0.15, x1: DORM_POS.x + hw - 0.15, z0: DORM_POS.z - hd + 0.15, z1: DORM_POS.z + hd - 0.15 });
    const sg = signMesh('宿舍', 1.6, 0.6, '#8a5a2a'); sg.position.set(0, Math.min(2.4, bb.max.y - bb.min.y - 0.4), hd + 0.08); dormRoot.add(sg);
  }
  const unlockSignG = (text, x, z) => { const g = new THREE.Group(); g.add(M.box(0.12, 1.5, 0.12, 0x6e5338, 0, 0.75, 0)); const sg = signMesh(text, 2.4, 1.0); sg.position.set(0, 1.6, 0.07); g.add(sg); g.position.set(x, 0, z); return g };
  const fire = add(M.fireMesh(), FIRE_POS.x, FIRE_POS.z); solid(FIRE_POS.x - 0.6, FIRE_POS.x + 0.6, FIRE_POS.z - 0.6, FIRE_POS.z + 0.6);
  const fireLight = new THREE.PointLight(0xff9a40, 10, 9, 1.6); fireLight.position.set(FIRE_POS.x, 1.2, FIRE_POS.z); scene.add(fireLight);
  /* ---------- 0.22 池塘（设计/09_池塘.md）：没盖时是几个水桶；1～3 级一个越来越大的椭圆水塘，鱼在里面游 ---------- */
  const pondRoot = new THREE.Group(); pondRoot.position.copy(POND_LOT); scene.add(pondRoot);
  const pondBox = { x0: 0, x1: 0, z0: 0, z1: 0 }; obstacles.push(pondBox);
  const flatMat = (color, lv, extra = {}) => new THREE.MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: -lv, polygonOffsetUnits: -lv * 8, ...extra });
  /* 0.22 用户：池塘别是正圆，弄得不规则一点 —— 半径按角度起伏（几个正弦叠起来），水面、沙边、深水区、鱼能游的范围、石头都按同一个形状 */
  const blobR = th => (1 + 0.17 * Math.sin(2 * th + 0.7) + 0.1 * Math.sin(3 * th + 2.1) + 0.06 * Math.cos(5 * th + 0.4)) / 1.22;
  const blobPt = (th, rx, rz, k) => { const r = blobR(th) * k; return [Math.cos(th) * rx * r, -Math.sin(th) * rz * r] };   // → 地上的 (x, z)
  const ellipse = (rx, rz, mat, y, k = 1, hole = 0) => { const sh = new THREE.Shape();
    for (let i = 0; i <= 72; i++) { const [x, z] = blobPt(i / 72 * Math.PI * 2, rx, rz, k); i ? sh.lineTo(x, -z) : sh.moveTo(x, -z) }
    if (hole) { const [hx, hz, hk] = hole, h = new THREE.Path(); for (let i = 0; i <= 72; i++) { const [x, z] = blobPt(i / 72 * Math.PI * 2, hx, hz, hk); i ? h.lineTo(x, -z) : h.moveTo(x, -z) } sh.holes.push(h) }   // 设计 65：中间挖空，几层不叠
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh, 2), mat); m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; return m };
  const pf = { lv: -1, rx: 1, rz: 1, list: [], key: '' };
  const waterTex = new THREE.TextureLoader().load('img/ground/water.jpg'); waterTex.colorSpace = THREE.SRGBColorSpace; waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;   // 0.44 用户画的水面          // 鱼：rx/rz 能游的椭圆半径
  const fishGrp = new THREE.Group(); pondRoot.add(fishGrp);
  function setPond(lv) {
    for (const c of [...pondRoot.children]) if (c !== fishGrp) pondRoot.remove(c);
    const [w, d] = FISHPOND_SIZE[lv] || FISHPOND_SIZE[0]; pf.lv = lv; pf.key = ''; fishGrp.clear(); pf.list = [];
    if (!lv) {                                                     // 还没盖：三个水桶 + 牌子
      for (const [x, z] of [[-0.8, 0.1], [0, -0.2], [0.8, 0.15]]) { const b = prop('bucket', { scale: 4, tint: 0x8aa0b0 }) || M.barrelMesh(0x6a8aa0); b.position.set(x, 0, z); pondRoot.add(b) }
      const sg = unlockSignG('池塘\n在「建造」里盖', 0, -1.3); pondRoot.add(sg);
      Object.assign(pondBox, { x0: POND_LOT.x - 1.3, x1: POND_LOT.x + 1.3, z0: POND_LOT.z - 0.5, z1: POND_LOT.z + 0.5 });
      pf.rx = 0; return;
    }
    const rx = w / 2, rz = d / 2; pf.rx = rx - 0.45; pf.rz = rz - 0.35;
    /* 0.44 用户生成的池塘模型（chitang-1~3）：铺满原来的椭圆（模型是圆的，按椭圆拉一下）；鱼在模型的水面上游，上面再盖一层会动的水面贴图 */
    const src = prop(`chitang-${Math.min(3, lv)}`, { scale: 1, tint: 0xffffff }); pf.model = !!src;
    if (src) {
      src.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(src), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
      const kx = (w + 1.4) / sz.x, kz = (d + 1.2) / sz.z, o = new THREE.Group(); src.position.set(-c.x, -bb.min.y, -c.z); o.add(src); o.scale.set(kx, Math.min(kx, kz) * 0.45, kz); pondRoot.add(o);
      o.updateMatrixWorld(true); const hit = new THREE.Raycaster(new THREE.Vector3(POND_LOT.x, 5, POND_LOT.z), new THREE.Vector3(0, -1, 0)).intersectObject(o, true)[0];
      const wy = hit ? Math.min(hit.point.y, 1) : 0.05; fishGrp.position.y = wy;
      const film = ellipse(rx, rz, new THREE.MeshLambertMaterial({ map: waterTex, color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }), wy + 0.1); film.receiveShadow = false; film.renderOrder = 3; pondRoot.add(film); pf.film = film;
      { const ct = LFX.pondCaus || (LFX.pondCaus = (() => { const t = TL.load('img/ground/caustic.jpg'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 2.5, 1 / 2.5); LFX.caus.push(t); return t })());
        const cf = ellipse(rx, rz, new THREE.MeshBasicMaterial({ map: ct, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }), wy + 0.11); cf.receiveShadow = false; cf.renderOrder = 4; pondRoot.add(cf) }   // 0.44 池塘也叠一层亮纹，跟湖一样
      waterTex.repeat.set(1 / 3, 1 / 3);   // 形状的 UV 就是米：3 米一张
      /* V1.01 用户：池塘旁边不立「池塘」牌子 */
      Object.assign(pondBox, { x0: POND_LOT.x - rx * 0.92, x1: POND_LOT.x + rx * 0.92, z0: POND_LOT.z - rz * 0.9, z1: POND_LOT.z + rz * 0.9 });
      return;
    }
    fishGrp.position.y = 0;
    pondRoot.add(ellipse(rx + 0.55, rz + 0.5, flatMat(0xd9c38c, 2), 0.01, 1, [rx, rz, 1]));   // 沙子边（同一个形状放大一圈；设计 65：只铺水外面那一圈）
    pondRoot.add(ellipse(rx, rz, flatMat(0x3d8db0, 4), 0.02, 1, [rx, rz, 0.66]));     // 水（设计 65：深的那块挖掉）
    pondRoot.add(ellipse(rx, rz, flatMat(0x2f7393, 6), 0.022, 0.66));                 // 深一点的中间
    const film = ellipse(rx, rz, new THREE.MeshLambertMaterial({ color: 0x8fd4ec, transparent: true, opacity: 0.28, depthWrite: false }), 0.13); film.receiveShadow = false; film.renderOrder = 3; pondRoot.add(film);   // 水面（鱼在下面）
    const n = 6 + lv * 3;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + 0.3, nm = ['rock-sand-a', 'rock-flat', 'grass-large', 'rock-b'][i % 4];
      const o = prop(nm, { scale: nm === 'grass-large' ? 1.3 : 0.45 + (i % 3) * 0.15, tint: nm === 'grass-large' ? 0x7fae5a : 0xb8ad98 }); if (!o) continue;
      const [ox, oz] = blobPt(a, rx + 0.35, rz + 0.3, 1); o.position.set(ox, 0, oz); o.rotation.y = a * 2.3; pondRoot.add(o) }
    /* V1.01 不立「池塘」牌子 */
    Object.assign(pondBox, { x0: POND_LOT.x - rx * 0.92, x1: POND_LOT.x + rx * 0.92, z0: POND_LOT.z - rz * 0.9, z1: POND_LOT.z + rz * 0.9 });
  }
  /* 鱼游：每种至少游一条，剩下的按数量轮着加，最多 FISHPOND.show 条；名单变了才重新摆 */
  const FISH_SC = 3.4;
  function pondTick(q, dt) {
    if (lakeTex) { lakeTex.offset.x += dt * 0.004; lakeTex.offset.y -= dt * 0.03 }   // 湖面：风从南边吹来（屏幕下往上），水纹往北走
    LFX.t += dt; const t = LFX.t;
    for (const c of LFX.caus) { c.offset.x -= dt * 0.006; c.offset.y -= dt * 0.045 }   // 亮纹也往北走，比水面快一点（两层错开就会一闪一闪）
    { const surge = Math.sin(t * 1.25); if (LFX.foamTex) { LFX.foamTex.offset.y = -0.12 * surge; LFX.foamTex.offset.x += dt * 0.01 } for (const f of LFX.foam) f.opacity = 0.42 + 0.22 * surge }   // 白浪涌上岸更白，退回去变淡
    if (LFX.rip) {   // 涟漪：每 0.7 秒从一个木桩 / 船边冒一圈，2.6 秒扩到 1.2 米外淡掉
      LFX.ripNext -= dt; if (LFX.ripNext <= 0) { LFX.ripNext = 0.6 + Math.random() * 0.3; const r = LFX.rip.find(q => q.age >= 2.6); if (r) { r.s = LFX.ripSrc[(Math.random() * LFX.ripSrc.length) | 0]; r.age = 0; r.m.visible = true; r.m.position.x = r.s[0]; r.m.position.z = r.s[1] } }
      for (const r of LFX.rip) { if (r.age >= 2.6) continue; r.age += dt; const k = Math.min(1, r.age / 2.6), g = 0.15 + k * 1.2; r.m.scale.set(r.s[2] + g, 1, r.s[3] + g); r.m.material.opacity = 0.25 * (1 - k) * Math.min(1, r.age * 4); if (r.age >= 2.6) r.m.visible = false } }
    if (LFX.boat) { const b = LFX.boat;   // 船跟着浪：几个不同快慢的 sin 叠起来（不会一看就是规律的来回），起伏、左右晃、前后点头、船头慢慢转一点
      b.position.y = LFX.boatY + Math.sin(t * 1.3) * 0.025 + Math.sin(t * 2.3 + 0.7) * 0.012;
      b.rotation.z = Math.sin(t * 1.05) * 0.045 + Math.sin(t * 1.9 + 1.3) * 0.015;
      b.rotation.x = Math.sin(t * 0.8 + 1) * 0.02 + Math.sin(t * 1.7) * 0.008;
      b.rotation.y = Math.sin(t * 0.23) * 0.06 }
    if (pf.lv <= 0) { if (fishGrp.children.length) { fishGrp.clear(); pf.list = []; pf.key = '' } return }
    if (!pf.model && !pf.retried && propsReady()) { pf.retried = true; setPond(pf.lv) }   // 模型后读好的：换上（只试一次）
    waterTex.offset.x += dt * 0.02; waterTex.offset.y += dt * 0.013;   // 水面慢慢流
    const ids = Object.keys(FISH).filter(id => (q[id] || 0) > 0), left = Object.fromEntries(ids.map(id => [id, q[id]])), want = [];
    let more = true; while (want.length < FISHPOND.show && more) { more = false; for (const id of ids) if (left[id] > 0 && want.length < FISHPOND.show) { want.push(id); left[id]--; more = true } }
    const key = want.join(',');
    if (key !== pf.key) {
      pf.key = key; fishGrp.clear(); pf.list = [];
      for (const id of want) { const F = FISH[id], glow = F.rar === 'r' || F.rar === 'l';
        const o = prop(F.m || 'fish', { scale: FISH_SC * (F.size || 1), solid: F.color }) || M.box(0.7, 0.1, 0.22, F.color, 0, 0.05, 0);
        if (glow) o.traverse(c => { if (c.isMesh) { c.material = c.material.clone(); c.material.emissive = new THREE.Color(F.rar === 'l' ? 0xffa030 : 0xb070ff); c.material.emissiveIntensity = 0.45 } });
        o.rotation.set(-Math.PI / 2, Math.PI, 0);                                         // 模型鱼头朝 -x：先掉头（朝 +x 游），再侧躺：从上往下看是鱼的侧面轮廓（像星露谷那样一眼看出是鱼）
        const g = new THREE.Group(); g.add(noCast(o)); g.scale.y = 0.4;                           // 压薄，整条在水面下
        const [sx, sz] = blobPt(Math.random() * Math.PI * 2, pf.rx, pf.rz, Math.sqrt(Math.random()) * 0.85);
        g.position.set(sx, 0.025, sz);
        const f = { g, tx: 0, tz: 0, sp: 0.35 + Math.random() * 0.3, yaw: Math.random() * 6.28, wait: Math.random() * 2, ph: Math.random() * 6.28 };
        g.rotation.y = f.yaw; fishGrp.add(g); pf.list.push(f); newTarget(f) }
    }
    for (const f of pf.list) {
      f.ph += dt * 6; const p = f.g.position;
      if (f.wait > 0) { f.wait -= dt; f.g.rotation.y = f.yaw + Math.sin(f.ph * 0.5) * 0.08; continue }
      const dx = f.tx - p.x, dz = f.tz - p.z, dd = Math.hypot(dx, dz);
      if (dd < 0.15) { newTarget(f); if (Math.random() < 0.4) f.wait = 0.5 + Math.random() * 2; continue }
      const want = Math.atan2(-dz, dx); let da = want - f.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
      f.yaw += Math.max(-2 * dt, Math.min(2 * dt, da));                                   // 慢慢转弯
      const sp = f.sp * (Math.abs(da) > 1 ? 0.4 : 1);
      p.x += Math.cos(f.yaw) * sp * dt; p.z -= Math.sin(f.yaw) * sp * dt;
      f.g.rotation.y = f.yaw + Math.sin(f.ph) * 0.12;                                     // 摆尾
    }
  }
  function newTarget(f) { const [x, z] = blobPt(Math.random() * Math.PI * 2, pf.rx, pf.rz, Math.sqrt(Math.random()) * 0.9); f.tx = x; f.tz = z; f.sp = 0.3 + Math.random() * 0.35 }
  for (const [x, z, r] of [[-3.6, -5.6, Math.PI / 2], [-3.6, 4.2, Math.PI / 2]]) { add(M.sandbags(4), x, z, r); solid(x - 0.35, x + 0.35, z - 1.7, z + 1.7) }
  const crates = [], barrels = [];
  /* 35 用户：工坊里不要遮挡物、障碍物 —— 原来工坊里的 2 个纸箱和旁边的油桶去掉 */
  for (const [x, z] of [[-2.9, 6.6]]) { barrels.push(add(M.barrelMesh(), x, z)); solid(x - 0.45, x + 0.45, z - 0.45, z + 0.45) }
  /* 去拾荒区的旧货车：走过去点「去拾荒区」 */
  const truckFallback = add(M.carMesh(0x6a7a5a), TRUCK_POS.x, TRUCK_POS.z, Math.PI / 2);
  solidRot(TRUCK_POS.x, TRUCK_POS.z, 1.0, 2.3, 0);
  later.push(() => { const o = prop('truck', { scale: 1.6, tint: 0xa89a86 }); if (!o) return; o.position.copy(TRUCK_POS); o.rotation.y = 0; scene.add(o); truckFallback.visible = false });
  later.push(() => {
    const put = (n, x, z, ry, scale, tint = 0xc8bca8) => { const o = prop(n, { scale, tint }); if (o) { o.position.set(x, 0, z); o.rotation.y = ry; scene.add(o) } return o };
    put('bedroll', -6.4, 7.6, 0.3, 4); put('resource-wood', -4.2, 7.3, 0.6, 5); put('chest', -10, 9.8, 0.2, 3.5); solid(-10.6, -9.4, 9.2, 10.4);
    put('signpost', -2.9, -3, -0.3, 4);
  });

  /* ---------- 温室：盖好以前是一片废墟 + 牌子；盖好以后是铁架玻璃房 + 木框菜地 ---------- */
  const G = GH_AREA, gw = G.x1 - G.x0, gd = G.z1 - G.z0, gcx = (G.x0 + G.x1) / 2, gcz = (G.z0 + G.z1) / 2;
  const ghRuin = new THREE.Group(), ghBuilt = new THREE.Group(); scene.add(ghRuin, ghBuilt);
  for (const [x, z, r] of [[3, 2.5, 0.9], [7, 7.1, 0.7], [8, 1.9, 0.55], [1.6, 8.1, 0.5]]) ghRuin.add(M.rock(r, 0x7d766b, G.x0 + x, r * 0.4, G.z0 + z));   // 0.45 位置跟着温室走
  ghRuin.add(M.box(1.8, 0.12, 0.3, 0x6e5338, G.x0 + 5, 0.06, G.z0 + 5)); ghRuin.add(M.box(1.3, 0.12, 0.3, 0x5e4630, G.x0 + 4.7, 0.15, G.z0 + 5.3));
  const ghFloor = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd), gmat('dirt', gw, gd, 2.4));
  ghFloor.rotation.x = -Math.PI / 2; ghFloor.position.set(gcx, 0.015, gcz); ghFloor.receiveShadow = true; ghBuilt.add(ghFloor);
  const steel = 0x6f7c84, glass = M.mat(0xc6eaf2, { transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }), eave = 2.6, ridge = 4.2;
  /* 铁架：柱子、檐梁、屋脊、斜梁 */
  for (const x of [G.x0, gcx - gw / 4, gcx, gcx + gw / 4, G.x1]) for (const z of [G.z0, G.z1]) ghBuilt.add(M.box(0.16, eave, 0.16, steel, x, eave / 2, z));
  for (const x of [G.x0, G.x1]) ghBuilt.add(M.box(0.16, eave, 0.16, steel, x, eave / 2, gcz));
  for (const x of [G.x0, G.x1]) ghBuilt.add(M.box(0.14, 0.14, gd, steel, x, eave, gcz));
  for (const z of [G.z0, G.z1]) ghBuilt.add(M.box(gw, 0.14, 0.14, steel, gcx, eave, z));
  ghBuilt.add(M.box(gw, 0.14, 0.14, steel, gcx, ridge, gcz));                              // 屋脊（东西向）
  const slopeLen = Math.hypot(gd / 2, ridge - eave), slopeA = Math.atan2(ridge - eave, gd / 2);
  for (const x of [G.x0, gcx - gw / 4, gcx, gcx + gw / 4, G.x1]) for (const s of [-1, 1]) { const b = M.box(0.1, 0.1, slopeLen, steel, x, (eave + ridge) / 2, gcz + s * gd / 4); b.rotation.x = s * slopeA; ghBuilt.add(b) }
  /* 玻璃：北墙整面，西墙、南墙、东墙只到腰（看得到里面）；屋顶北边一面斜玻璃（南边敞开，镜头看得进去） */
  const glassPlane = (w, h, x, y, z, ry = 0, rx = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glass); m.position.set(x, y, z); m.rotation.set(rx, ry, 0, 'YXZ'); ghBuilt.add(m) };
  glassPlane(gw, eave, gcx, eave / 2, G.z0); glassPlane(gd, 0.8, G.x0, 0.4, gcz, Math.PI / 2);   // V1.01 用户：温室左右都能走——西墙也只到腰、不挡人
  glassPlane(gw, 0.8, gcx, 0.4, G.z1); glassPlane(gd, 0.8, G.x1, 0.4, gcz, Math.PI / 2);
  glassPlane(gw, slopeLen, gcx, (eave + ridge) / 2, gcz - gd / 4, 0, -Math.PI / 2 + slopeA);
  /* 木框菜地 */
  const plotMeshes = PLOT_POS.map(([x, z]) => { const g = new THREE.Group();
    const soil = M.box(1.5, 0.18, 1.5, 0x4f3a28, 0, 0.12, 0); soil.castShadow = false; g.add(soil);
    for (const [w, d, ox, oz] of [[1.7, 0.12, 0, 0.8], [1.7, 0.12, 0, -0.8], [0.12, 1.7, 0.8, 0], [0.12, 1.7, -0.8, 0]]) g.add(M.box(w, 0.3, d, 0x8a6a46, ox, 0.15, oz));
    g.position.set(x, 0, z); ghBuilt.add(g); return soil });
  solid(G.x0, G.x1, G.z0 - 0.1, G.z0 + 0.1);   // 只有北墙挡人（西墙以前是空气墙，用户：走不到码头）
  later.push(() => {
    for (const [n, x, z, r, sc] of [['tool-hoe', G.x1 - 0.5, G.z0 + 0.5, 0.4, 4], ['tool-shovel', G.x1 - 0.9, G.z0 + 0.45, -0.3, 4], ['bucket', G.x1 - 0.6, G.z0 + 1.2, 0, 4], ['barrel-open', G.x0 + 0.7, G.z1 - 0.7, 0, 3.2], ['bucket', G.x0 + 1.4, G.z1 - 0.5, 0.5, 4]]) { const o = prop(n, { scale: sc, tint: 0xd8ccb8 }); if (o) { o.position.set(x, 0, z); o.rotation.y = r; ghBuilt.add(o) } }
  });

  /* ---------- 果园：草地 + 树位 ---------- */
  const O = ORCH_AREA, orRuin = new THREE.Group(), orBuilt = new THREE.Group(); scene.add(orRuin, orBuilt);
  for (const [x, z, r] of [[4, 3.2, 0.8], [7, 6.8, 0.6], [1.6, 7.8, 0.5]]) orRuin.add(M.rock(r, 0x847c70, O.x0 + x, r * 0.4, O.z0 + z));
  const orFloor = new THREE.Mesh(new THREE.PlaneGeometry(O.x1 - O.x0, O.z1 - O.z0), gmat("dirt", O.x1 - O.x0, O.z1 - O.z0, 3));   /* 0.44 果园地面用手绘泥土贴图（以前是一块纯绿色） */ orFloor.rotation.x = -Math.PI / 2; orFloor.position.set((O.x0 + O.x1) / 2, 0.012, (O.z0 + O.z1) / 2); orFloor.receiveShadow = true; orFloor.visible = false; orBuilt.add(orFloor);   // 用户：果树就种在草地上，不要一块泥土地
  const treeSlots = TREE_POS.map(([x, z]) => { const m = new THREE.Mesh(new THREE.CircleGeometry(0.8, 12), M.mat(0x5a4330)); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z); orBuilt.add(m); return m });
  later.push(() => {
    /* 0.29 用户：果树周围不要围栏（以前有一圈木围栏） */
    for (const [x, z] of [[1, 0.8], [9, 8.4], [5, 4.7]]) { const o = prop('grass-large', { scale: 3, tint: 0xd8e0c0 }); if (o) { o.position.set(O.x0 + x, 0, O.z0 + z); orBuilt.add(o) } }
  });
  const unlockSign = (text, x, z) => { const g = new THREE.Group(); g.add(M.box(0.12, 1.5, 0.12, 0x6e5338, 0, 0.75, 0)); const sg = signMesh(text, 2.4, 1.0); sg.position.set(0, 1.6, 0.07); g.add(sg); g.position.set(x, 0, z); return g };
  ghRuin.add(unlockSign('温室\n超市 2 级解锁', gcx, G.z1 - 0.8));
  orRuin.add(unlockSign('果园\n超市 3 级解锁', (O.x0 + O.x1) / 2, O.z1 - 0.8));
  { const us = unlockSign('工坊用地\n超市 2 级先盖木工台', (WS_AREA.x0 + WS_AREA.x1) / 2, WS_AREA.z1 - 1); scene.add(us); lotStuff.push(us) }   // 设计 43 工坊在超市南边

  /* 废街：先用代码拼的简易版（楼、车、远景），场景模型加载成功后由 useProps() 换成正式模型 */
  const legacy = new THREE.Group(); scene.add(legacy);
  const legacySolids = [];
  const addL = (o, x, z, ry = 0) => { o.position.x = x; o.position.z = z; o.rotation.y = ry; legacy.add(o); return o };
  const solidL = (x0, x1, z0, z1) => { const b = { x0, x1, z0, z1 }; obstacles.push(b); legacySolids.push(b) };
  const ruinCols = [0x8a7f73, 0x7d8a8f, 0x9a8a78, 0x6f7a6a, 0x8f8070];
  let x = 0; let i = 0;
  while (x < 50) { const w = 5 + (i * 37 % 4), h = 5 + (i * 53 % 6); addL(M.ruinMesh(w, h, 6, ruinCols[i % 5]), x + w / 2, -15); x += w + 0.6; i++ }
  solid(-2, 50, -14, -9.2);
  for (let k = 0; k < 9; k++) { const rx = 1 + k * 5.4; add(M.rock(0.9 + (k % 3) * 0.3, 0x7d766b, rx, 0.3, 12.2 + (k % 2)), rx, 12.2 + (k % 2)) }
  solid(-2, 50, 9.6, 14);
  /* 尽头路障 */
  for (let z = -8; z <= 8; z += 2.2) add(M.barrierMesh(), 46, z, Math.PI / 2);
  solid(45.5, 52, -14, 14);
  /* 废车、路障、箱子（挡路） */
  const cars = [[6.5, 1.5, 0.2, 0x8a5a44], [15.5, -6, -0.4, 0x5a6e8a], [20.5, 4.5, 1.4, 0x6b7a4a], [31.5, 1, -0.2, 0x8a3c3c], [41, 6, 0.9, 0x7a7a7a]];
  for (const [cx, cz, r, c] of cars) { addL(M.carMesh(c), cx, cz, r); const b = obb(cx, cz, 1.9, 1.0, r); obstacles.push(b); legacySolids.push(b) }
  for (const [bx, bz, r] of [[11, -1, 0.3], [26, 2, -0.2], [35, -2, 1.6]]) { add(M.barrierMesh(), bx, bz, r); solidRot(bx, bz, 1, 0.35, r) }
  for (const [bx, bz] of [[18, 0], [29, -7.5], [38, 7.5]]) { add(M.crateMesh(0x8f6e46), bx, bz, 0.5); solid(bx - 0.55, bx + 0.55, bz - 0.55, bz + 0.55) }   // 木箱（用户说木箱留着，障碍物多样一点）

  /* 远处的废楼剪影（填满画面） */
  for (let k = 0; k < 8; k++) legacy.add(M.box(6, 8 + (k % 3) * 4, 6, 0x9b8e7c, -30 + k * 12, 4, -26));

  /* 换成正式模型：楼（City Kit）、废车和杂物（Car Kit）。位置和以前一样，物资刷新点不受影响 */
  /* V1.01 设计/24：3D 草、小花小草、石子、落叶（场景模型都摆好以后再撒，好避开所有挡路的东西） */
  let gfx = null;
  { const ct = TL.load('img/fx/cloud.jpg'); ct.wrapS = ct.wrapT = THREE.RepeatWrapping; GFX.cloud.value = ct }
  function initGfx() {
    if (gfx) return;
    const inPoly = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c };
    const blocked = [...noGrass,
      { x0: STORE.x0 - 0.5, x1: STORE.x1 + 0.5, z0: STORE.z0 - 0.5, z1: STORE.z1 + 0.5 },
      { x0: GH_AREA.x0 - 0.3, x1: GH_AREA.x1 + 0.3, z0: GH_AREA.z0 - 0.3, z1: GH_AREA.z1 + 0.3 },
      { x0: POND_LOT.x - 5.2, x1: POND_LOT.x + 5.2, z0: POND_LOT.z - 3.2, z1: POND_LOT.z + 3.2 },
      ...obstacles.filter(b => b.hw === undefined && b.x1 > b.x0 && (b.x1 - b.x0) * (b.z1 - b.z0) < 400).map(b => ({ x0: b.x0 - 0.2, x1: b.x1 + 0.2, z0: b.z0 - 0.2, z1: b.z1 + 0.2 }))];
    const pen = (x, z) => x > PASTURE.x0 - 0.2 && x < PASTURE.x1 + 0.2 && z > PASTURE.z0 - 0.2 && z < PASTURE.z1 + 0.2 && Math.abs(z) > 1.2;   // 牧场围栏里（另有贴图，不撒）
    const okGrass = (x, z) => { if (x > -2.6 || pen(x, z)) return false; for (const b of blocked) if (b.poly ? inPoly(x, z, b.poly) : (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1)) return false; return true };
    const nearEdge = (x, z) => !okGrass(x + 0.7, z) || !okGrass(x - 0.7, z) || !okGrass(x, z + 0.7) || !okGrass(x, z - 0.7);
    const dt = TL.load('img/fx/ground_deco.png'); dt.colorSpace = THREE.SRGBColorSpace; const lt = TL.load('img/fx/leaves.png'); lt.colorSpace = THREE.SRGBColorSpace;
    gfx = createGroundFx(scene, { area: { x0: YARD.x0 + 0.3, x1: -2.6, z0: YARD.z0 + 0.3, z1: YARD.z1 - 0.3 }, okGrass, nearEdge, trees: TREE_POS.map(([x, z]) => [x, z]), decoTex: dt, leafTex: lt });
  }
  const gfxTick = (dt, p) => { if (gfx) gfx.tick(dt, p); else GFX.time.value += dt };
  function useProps() {
    fixtures.forEach(f => { f.key = '' });     // 货柜、塔也换成正式模型
    towers.forEach(f => { f.key = '' });
    const box3 = new THREE.Box3();
    const place = (o, x, z, ry = 0, tilt = 0) => { o.position.set(x, 0, z); o.rotation.set(0, ry, 0); if (tilt) o.rotateZ(tilt); scene.add(o); return o };
    /* 模型自己的大小（不算水平转角），再按转角放成斜矩形 */
    const solidOf = (o, ry, pad = 0.15) => {
      const q = o.quaternion.clone();
      o.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ry)); o.updateMatrixWorld(true); box3.setFromObject(o);
      const ox = (box3.min.x + box3.max.x) / 2 - o.position.x, oz = (box3.min.z + box3.max.z) / 2 - o.position.z;
      const hw = (box3.max.x - box3.min.x) / 2 - pad, hd = (box3.max.z - box3.min.z) / 2 - pad;
      o.quaternion.copy(q); o.updateMatrixWorld(true);
      const c = Math.cos(ry), sn = Math.sin(ry);
      solidRot(o.position.x + ox * c + oz * sn, o.position.z - ox * sn + oz * c, hw, hd, ry);
    };
    const test = prop(CARS[0]); if (!test) return false;
    scene.remove(legacy); for (const b of legacySolids) { const k = obstacles.indexOf(b); if (k >= 0) obstacles.splice(k, 1) }
    /* 北侧的楼：一栋挨一栋，颜色压暗，有的微微歪 */
    let bx = -1, k = 0;
    while (bx < 50) {
      const o = prop(BUILDINGS[(k * 5) % BUILDINGS.length], { scale: 6.4, tint: [0xa89c8a, 0x9a9488, 0xb0a08c][k % 3] });
      o.updateMatrixWorld(true); box3.setFromObject(o); const w = box3.max.x - box3.min.x;
      place(o, bx + w / 2, -15.2, 0, k % 4 === 2 ? 0.035 : 0);
      bx += w + 0.3; k++;
    }
    /* 远景：低模楼当剪影 */
    for (let j = 0; j < 10; j++) { const o = prop(FAR[j % FAR.length], { scale: 7 + (j % 3), tint: 0x8f8678 }); place(o, -34 + j * 10, -27 - (j % 2) * 3) }
    /* 废车：位置和以前一样；有的烧过、有的侧翻 */
    const wrecks = [[6.5, 1.5, 0.2, 'sedan', 0], [15.5, -6, -0.4, 'van', 0], [20.5, 4.5, 1.4, 'suv', 1], [31.5, 1, -0.2, 'police', 0], [41, 6, 0.9, 'taxi', 0], [27, -8.6, 0.05, 'truck', 0], [37.5, 8.7, 3.1, 'sedan', 0]];
    wrecks.forEach(([cx, cz, r, n, flip], j) => {
      const o = prop(n, { scale: 1.45, tint: [0x9c8f80, 0x8a8278, 0xa09080][j % 3], burnt: j === 3 || j === 6 });
      place(o, cx, cz, r + Math.PI / 2, flip ? Math.PI / 2 * 0.98 : (j % 2 ? 0.04 : -0.03));   // 以前少传了 z，车全挤在马路中线上排成一堵墙
      if (flip) o.position.y = 1.05;
      solidOf(o, r + Math.PI / 2);
    });
    /* 路上的雪糕筒（锥桶），三三两两摆着，挡路（以前的轮胎、车门、钢板去掉了） */
    const bits = [[3.5, 3.2], [9, -4], [13, 6.5], [17.5, -1.8], [23.5, 2.5], [25.5, -5.5], [29, 6], [34, -4.5], [39.5, -1], [43, 3], [8, 8.3], [21, -8.3]];
    bits.forEach(([dx, dz], j) => { for (let k = 0; k < 1 + (j % 3); k++) { const o = prop('cone', { scale: 1.45, tint: 0xc8b8a4 }); if (!o) return; if (perfOpt('far')) FAR_SMALL.push(o); place(o, dx + k * 0.75, dz + (k % 2) * 0.4, j * 1.7 + k); if (k === 2) o.rotateZ(Math.PI / 2 * 0.95), o.position.y = 0.25; solidOf(o, j * 1.7 + k, 0.02) } });
    /* 生活杂物：鱼骨头、碎盘子、泡沫饭盒、纸袋（Food Kit） */
    const trash = [[2.5, -1.5], [7.5, 6.2], [12, -7.8], [16.5, 2.8], [22.5, -6.5], [26, 7.5], [32.5, -0.5], [36.5, 4.5], [42, -6.8], [-0.5, 7.5]];
    trash.forEach(([dx, dz], j) => { const n = FOOD_DEBRIS[j % FOOD_DEBRIS.length], o = prop(n, { scale: n === 'styrofoam' ? 1.0 : 1.6, tint: 0x8f8574 }); if (o) { place(o, dx, dz, j * 2.3); if (perfOpt('far')) FAR_SMALL.push(o) } });
    /* 院子：帐篷、篝火、木箱、木桶换成 Survival Kit 模型；再摆店里、温室、果园的 Kenney 模型 */
    const swap = (old, name, scale, ry = 0) => { const o = prop(name, { scale, tint: 0xc8bca8 }); if (!o) return; o.position.copy(old.position); o.rotation.y = ry || old.rotation.y; old.visible = false; scene.add(o); return o };
    if (swap(fire, 'campfire-pit', 4)) fire.children.forEach(c => { if (!fire.userData.flames.includes(c)) c.visible = false }), fire.visible = true;
    for (const o of [...crates.map(c => swap(c, 'box-large', 3.4)), ...barrels.map(b => swap(b, 'barrel', 3))]) if (o && perfOpt('far')) FAR_SMALL.push(o);   // 设计 57：远处的箱子、桶不画
    later.forEach(f => f());
    initGfx();
    return true;
  }

  function resize(w, h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix() }
  /* 店招改名（玩家自己起的超市名字） */
  const setStoreName = t => { const n = signMesh(t || DEFAULT_STORE_NAME, 7, 1.3); sign.material.map.dispose(); sign.material.map = n.material.map; sign.material.needsUpdate = true; n.geometry.dispose() };
  /* V1.01：后台读好的模型（工坊机器、塔、加工品）换上 */
  function refreshUser() { fixtures.forEach(f => { f.key = '' }); towers.forEach(f => { f.key = '' }); for (const it of Object.values(wsItems)) it.lv = 0; if (!pf.model) pf.retried = false }   // 设计 38：池塘 2、3 级的模型后读到的也换上
  return { refreshUser, sunFollow, gfxTick, wallFade, doors, syncWs, wsItems, ranch, syncFix, setCamp, setPond, pondTick, hemi, syncTowers, towers, setBarricade, alarmLight, syncFixtures, fixtures, setStoreBig, setStoreName, setWarehouse, renderer, scene, camera, sun, obstacles, zombieOnly, recycler, resize, fire, fireLight, useProps,
    ghRuin, ghBuilt, plotMeshes, orRuin, orBuilt, treeSlots };
}

function signMesh(text, w, h, bg = '#b5422f') {
  /* 牌子上的字：自动缩小字号、可用 \n 分行，保证不超出牌子边框 */
  const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w);
  const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#f2d27a'; g.lineWidth = 8; g.strokeRect(8, 8, c.width - 16, c.height - 16);
  const lines = String(text).split('\n'), pad = 30, maxW = c.width - pad * 2, maxH = c.height - pad * 1.2;
  const font = px => `bold ${px}px "PingFang SC","Microsoft YaHei",sans-serif`;
  let px = Math.round(Math.min(c.height * 0.58, maxH / lines.length / 1.15));
  g.font = font(px);
  const wid = () => Math.max(...lines.map(l => g.measureText(l).width));
  while (px > 10 && wid() > maxW) { px -= 2; g.font = font(px) }
  g.fillStyle = '#fff3d6'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lh = px * 1.15, y0 = c.height / 2 - (lines.length - 1) * lh / 2 + 3;
  lines.forEach((l, i) => g.fillText(l, c.width / 2, y0 + i * lh));
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex })); return m;
}

/* 圆形（半径 r）和一组矩形碰撞，把位置推出来 */
/* 转了角度的矩形：中心 (cx,cz)，半宽 hw（模型自己的 x 方向）、半深 hd，水平转角 ry（和 three.js 的 rotation.y 一样） */
export function obb(cx, cz, hw, hd, ry) { return { cx, cz, hw, hd, c: Math.cos(ry), s: Math.sin(ry), ry } }
export function collide(p, r, boxes, B) {   // B：活动范围（拾荒区用自己的范围；不给就是院子 + 门外马路）
  for (const b of boxes) {
    if (b.hw !== undefined) {                     // 斜矩形：换到矩形自己的坐标里算，再换回来
      const dx = p.x - b.cx, dz = p.z - b.cz, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      if (Math.abs(lx) > b.hw + r || Math.abs(lz) > b.hd + r) continue;
      const q = { x: lx, z: lz }; collide1(q, r, -b.hw, b.hw, -b.hd, b.hd);
      p.x = b.cx + q.x * b.c + q.z * b.s; p.z = b.cz - q.x * b.s + q.z * b.c; continue;
    }
    if (b.x0 === b.x1 && b.z0 === b.z1) continue;   // 空着的占位（还没建的塔位、没扩建的店面），不挡路
    collide1(p, r, b.x0, b.x1, b.z0, b.z1);
  }
  if (B) { p.x = Math.max(B.x0 + r, Math.min(B.x1 - r, p.x)); p.z = Math.max(B.z0 + r, Math.min(B.z1 - r, p.z)); return }
  p.x = Math.max(YARD.x0 + r, Math.min(STREET.x1 - r, p.x)); p.z = Math.max((p.x > YARD.x1 ? -16 : YARD.z0) + r, Math.min(YARD.z1 - r, p.z));   // 门外马路那边还是到 -16
}
function collide1(p, r, x0, x1, z0, z1) {
  const cx = Math.max(x0, Math.min(p.x, x1)), cz = Math.max(z0, Math.min(p.z, z1));
  const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return;
  if (d2 > 1e-6) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k }
  else { /* 圆心在矩形里：从最近的边推出去 */
    const l = p.x - x0, rr = x1 - p.x, t = p.z - z0, bb = z1 - p.z, m = Math.min(l, rr, t, bb);
    if (m === l) p.x = x0 - r; else if (m === rr) p.x = x1 + r; else if (m === t) p.z = z0 - r; else p.z = z1 + r }
}
export const inYard = p => p.x < YARD.x1;
