/* ================= 低多边形模型（全部用代码拼） =================
   以后换成正式模型时，只要替换这里的函数，游戏逻辑不用动。 */
import * as THREE from 'three';
import { noCast } from './groundfx.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { JUNK, GOODS, TREASURE, FISH } from './config.js';
import { prop, ranchGoodProp } from './props.js';
import { shelfGood } from './shelfgoods.js';
import { ITEM_MAKERS } from './items.js';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }));
  return matCache.get(key);
}
export function box(w, h, d, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}
export function cyl(rt, rb, h, seg, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}
export function rock(r, color, x = 0, y = 0, z = 0, detail = 0) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), mat(color));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}
const group = (...kids) => { const g = new THREE.Group(); kids.forEach(k => g.add(k)); return g };

/* ---------- 人物：主角 / 顾客 / 丧尸共用一套身体 ---------- */
export function human({ skin = 0xe0b48c, shirt = 0xd9822b, pants = 0x3d4a5c, hair = 0x3a2a1e, pack = false, zombie = false } = {}) {
  const g = new THREE.Group();
  const legL = box(0.22, 0.6, 0.24, pants, -0.13, 0.3, 0), legR = box(0.22, 0.6, 0.24, pants, 0.13, 0.3, 0);
  [legL, legR].forEach(l => { l.geometry.translate(0, -0.3, 0); l.position.y = 0.6 });
  const body = box(0.58, 0.62, 0.34, shirt, 0, 0.92, 0);
  const head = box(0.4, 0.4, 0.38, skin, 0, 1.45, 0);
  const hairM = box(0.42, 0.14, 0.4, hair, 0, 1.66, 0);
  const armL = box(0.16, 0.56, 0.18, shirt, -0.38, 1.18, 0), armR = box(0.16, 0.56, 0.18, shirt, 0.38, 1.18, 0);
  [armL, armR].forEach(a => { a.geometry.translate(0, -0.26, 0) });
  const handL = box(0.15, 0.14, 0.16, skin, 0, -0.56, 0), handR = handL.clone();
  armL.add(handL); armR.add(handR);
  g.add(legL, legR, body, head, hairM, armL, armR);
  if (pack) g.add(box(0.46, 0.5, 0.22, 0x5b6b3a, 0, 1.0, -0.27));
  if (zombie) { armL.rotation.x = armR.rotation.x = -1.35; head.rotation.z = 0.25; g.add(box(0.3, 0.05, 0.02, 0x7a1f1f, 0, 1.38, 0.2)) }
  g.userData = { legL, legR, armL, armR, head, zombie, phase: Math.random() * 6 };
  return g;
}
/* 走路动画：speed 0 = 站着 */
export function animHuman(g, t, speed) {
  const u = g.userData, a = Math.min(1, speed / 3) * 0.7, s = Math.sin(t * (u.zombie ? 6 : 10) + u.phase) * a;
  u.legL.rotation.x = s; u.legR.rotation.x = -s;
  if (u.zombie) { u.armL.rotation.x = -1.35 + s * 0.3; u.armR.rotation.x = -1.35 - s * 0.3; g.rotation.z = Math.sin(t * 3 + u.phase) * 0.06 }
  else { u.armL.rotation.x = -s; u.armR.rotation.x = s }
}

/* ---------- 物资 ---------- */
export function junkMesh(t) {
  /* 种子袋：纸袋（Food Kit 的 bag）染成绿色，旁边插一棵小苗 */
  if (t.startsWith('seed:')) { const g = new THREE.Group(), b = prop('bag', { scale: 1.6, tint: 0x9bd06a }) || box(0.3, 0.4, 0.2, 0x9bd06a, 0, 0.2, 0);
    g.add(b); const sp = cyl(0, 0.06, 0.28, 4, 0x4f9a3a, 0.2, 0.14, 0.1); sp.rotation.z = -0.3; g.add(sp); return g }
  /* 鱼（背包里的 'fish:id'，被丧尸撞掉在地上、飞进背包时用） */
  if (t.startsWith('fish:')) { const F = FISH[t.slice(5)] || {}, g = new THREE.Group(); const o = prop(F.m || 'fish', { scale: 2.2, solid: F.color || 0x9fb4c4 }) || box(0.4, 0.12, 0.16, F.color || 0x9fb4c4, 0, 0.06, 0); o.rotation.y = 0.6; g.add(o); return g }
  const c = JUNK[t].color; let m;
  /* 有 Kenney 食物模型的就用模型：压扁的生锈易拉罐、倒在地上的塑料瓶 */
  if (t === 'can' && (m = prop('soda-can-crushed', { scale: 1.9, tint: 0xb87048 }))) { m.rotation.z = 0.25; return m }
  if (t === 'bottle' && (m = prop('soda-bottle', { scale: 1.35, solid: 0x8fcbea, opacity: 0.9 }))) { m.rotation.z = Math.PI / 2; m.position.y = 0.09; return m }
  /* 代码拼的物品模型（破布、废电池） */
  if (ITEM_MAKERS['junk:' + t]) { m = ITEM_MAKERS['junk:' + t](); m.scale.setScalar(1.3); m.rotation.y = 0.5; return m }
  if (t === 'can') { m = cyl(0.2, 0.18, 0.34, 7, c, 0, 0.17, 0); m.rotation.z = 0.3; m.add(cyl(0.21, 0.21, 0.04, 7, 0x9a9a9a, 0, 0.17, 0)) }
  else if (t === 'bottle') { m = cyl(0.13, 0.13, 0.42, 6, c, 0, 0.21, 0, ); m.material = mat(c, { transparent: true, opacity: 0.85 });
    m.add(cyl(0.06, 0.1, 0.14, 6, c, 0, 0.27, 0)); m.add(cyl(0.065, 0.065, 0.06, 6, 0x2e6fd1, 0, 0.36, 0)); m.rotation.z = 1.2; m.position.y = 0.14 }
  else if (t === 'cloth') { m = rock(0.28, c, 0, 0.1, 0); m.scale.set(1.2, 0.35, 1) }
  else if (t === 'wood') { m = group(box(0.7, 0.08, 0.16, c, 0, 0.05, 0), box(0.6, 0.08, 0.14, 0x76522f, 0.05, 0.13, 0.05)); m.children[1].rotation.y = 0.6 }
  else { m = group(box(0.26, 0.4, 0.26, c, 0, 0.2, 0), cyl(0.06, 0.06, 0.06, 6, 0xbfbfbf, 0, 0.43, 0)); m.rotation.z = 0.2 }
  return m;
}
/* 地上可以捡的东西：物资 + 下面一个亮圈 */
const ringGeo = new THREE.RingGeometry(0.42, 0.52, 20);
export function pickupMesh(t, drop) {
  const g = new THREE.Group(), j = junkMesh(t); g.add(j);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: drop ? 0xff6b4a : 0xfff3c4, transparent: true, opacity: 0.8 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
  g.userData = { j, ring }; noCast(g);   // 设计 57
  return g;
}

/* ---------- 货架和上面的货 ---------- */
const goodGeo = new THREE.BoxGeometry(0.34, 0.34, 0.34);
/* 一件商品的模型 */
function goodMesh(g, i) {
  /* 设计 34：加工品、菜、罐头、水……都用代码画（shelfgoods.js）；蔬菜水果、鱼保持原来的模型 */
  const sg = shelfGood(g); if (sg) { sg.scale.setScalar(0.8); sg.rotation.y = (i * 0.7) % 1 - 0.5; return sg }
  const fresh = GOODS[g].fresh;
  const m = GOODS[g].ranch ? ranchGoodProp(g, 0.75) : g === 'fish' ? prop(i % 3 ? 'fish' : 'fish-large', { scale: i % 3 ? 2 : 1.6, solid: [0x9fb4c4, 0xd08a4a, 0x7d8f5a][i % 3] }) : fresh ? prop(g, { scale: g === 'pumpkin' ? 0.9 : 0.75, tint: 0xffffff }) : null;
  if (m) { m.rotation.y = (i * 0.7) % 1 - 0.5; return m }
  const b = new THREE.Mesh(goodGeo, mat(GOODS[g].color)); b.castShadow = true; b.position.y = 0.17; const w = new THREE.Group(); w.add(b); return w;
}

/* V1.01 优化（手机烫）：一堆不会动的小东西（货柜上的货、围栏的柱子和横杆）合成几块——同一种材质、同样的顶点格式的并成一个网格，
   一个货架从二三十次绘制变成几次。src 里的东西按 src 自己的坐标合，返回一个新的 Group（合出来的几何体记在 userData.own，扔掉时要 dispose） */
export function mergeStatic(src, { shadow = true } = {}) {
  src.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(src.matrixWorld).invert(), out = new THREE.Group(), buckets = new Map(), mm = new THREE.Matrix4();
  out.userData.own = [];
  src.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.visible) return;
    mm.multiplyMatrices(inv, o.matrixWorld);
    if (Array.isArray(o.material)) { const c = o.clone(); c.matrixAutoUpdate = false; c.matrix.copy(mm); c.castShadow = shadow && o.castShadow; out.add(c); return }
    const g = o.geometry, key = o.material.uuid + '|' + Object.keys(g.attributes).sort().join(',') + (g.index ? 'i' : 'n') + (o.castShadow ? 's' : '');
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, list: [], cast: o.castShadow, recv: o.receiveShadow });
    const gg = g.clone(); gg.applyMatrix4(mm); for (const k of Object.keys(gg.morphAttributes)) delete gg.morphAttributes[k]; buckets.get(key).list.push(gg);
  });
  for (const b of buckets.values()) {
    const geo = b.list.length === 1 ? b.list[0] : mergeGeometries(b.list, false);
    if (b.list.length > 1) for (const g of b.list) g.dispose();
    if (!geo) continue;
    const m = new THREE.Mesh(geo, b.mat); m.castShadow = shadow && b.cast; m.receiveShadow = b.recv; out.add(m); out.userData.own.push(geo);
  }
  return out;
}
export const disposeMerged = g => { for (const geo of (g.userData.own || [])) geo.dispose(); g.userData.own = [] };
/* 0.28 回收机出料动画用：一件商品的模型 */
export const goodModel = g => goodMesh(g, 0);
/* 货柜上摆货：按「放了几件 / 能放几件」决定摆出几个模型（摆位在 userData.slots 里） */
/* list：[{g, n}]（果蔬架可以放好几种，摆放位置平均分给每一种）；cap 是每一种能放几件 */
export function fillShelf(sh, list, cap = 10) {
  const key = list.map(s => s.g + ':' + s.n).join('|') + ':' + cap; if (sh.userData.shown === key) return; sh.userData.shown = key;
  const grp = sh.userData.goods; for (const c of grp.children) disposeMerged(c); grp.clear();
  const slots = sh.userData.slots, per = Math.floor(slots.length / list.length), tmp = new THREE.Group();
  list.forEach(({ g, n }, j) => { if (!g || !n) return;
    const k = Math.max(1, Math.min(per, Math.round(n / cap * per)));
    for (let i = 0; i < k; i++) { const m = goodMesh(g, i), [x, y, z, s = 1] = slots[j * per + i]; m.position.x = x; m.position.y += y; m.position.z = z; if (s !== 1) m.scale.multiplyScalar(s); tmp.add(m) } });
  if (tmp.children.length) grp.add(mergeStatic(tmp, { shadow: false }));   // V1.01：货合成几块、不投影子（小东西的影子看不出来，但每件都要多画一遍）
}

/* ---------- 货柜模型：三种 × 三档。都以中心为原点、正面朝 +z ----------
   货架 2.4×0.8：木货架 → 铁货架 → 玻璃展柜；果蔬架 1.6×1.6：木箱果蔬摊 → 阶梯果蔬架 → 冷藏果蔬柜；
   冰柜 1.6×0.8：二手冰柜（卧式）→ 双门冰柜 → 玻璃冷柜 */
const glassMat = new THREE.MeshLambertMaterial({ color: 0xbfe6f5, transparent: true, opacity: 0.28, depthWrite: false });
const glowMat = c => new THREE.MeshBasicMaterial({ color: c });
function glass(w, h, d, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glassMat); m.position.set(x, y, z); m.renderOrder = 2; return m }
function rowSlots(ys, n, w, z = 0.05) { const out = []; for (const y of ys) for (let i = 0; i < n; i++) out.push([-w / 2 + (i + 0.5) * w / n, y, z]); return out }
/* 0.14 用户定：货柜换成 Kenney Mini Market（红色配色 variation-b）。低档灰旧、中档原色、高档加招牌和灯条。
   模型没读到时退回下面代码拼的版本。 */
const DULL = 0x9c958c, VIVID = 0xffffff;
function mk(n, sx, sy, sz, tier, x = 0, y = 0, z = 0, ry = 0) {
  const o = prop('m:' + n, { scale: 1, tint: tier === 1 ? DULL : VIVID, skin: 'market-b', bare: true }); if (!o) return null;
  o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.rotation.y = ry; return o;
}
function topSign(w, y, z, color = 0xc8442f) {   // 高档：顶上一块红色招牌 + 一条暖光灯条
  const g = new THREE.Group(); g.add(box(w, 0.26, 0.06, color, 0, y + 0.13, z), box(w + 0.06, 0.04, 0.1, 0x3a3a40, 0, y, z));
  const led = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.03, 0.04), glowMat(0xfff2c0)); led.position.set(0, y - 0.04, z + 0.06); g.add(led); return g;
}
/* 0.43 用户生成的货架 / 果蔬架 / 冰柜模型（huojia、guoshujia、bingui 各 1～3 档）：跟工坊的机器一样按占的格子放大——
   占满宽度（窄的模型并排摆两个，稍微拉宽一点），前后可以比格子多出一点，高度不超过 hc 米；
   货摆在哪：从上往下照，找出朝上的板子（层板、台面、筐底），每层摆一排 */
const USER_FIX = { shelf: { n: 'huojia', W: 2.2, D: 0.6, hc: 2.3, cols: 6 }, veg: { n: 'guoshujia', W: 1.4, D: 1.4, hc: 2.0, cols: 4 }, fridge: { n: 'bingui', W: 1.7, D: 0.75, hc: 2.2, cols: 6 } };   // 0.44 用户：冰柜太小——占满 2 格宽（左右各多出 5 厘米），卧式冰柜高 0.8～1 米、立式冷柜约 2 米，跟原来的和新货架对得上
function fixtureUser(type, tier) {
  const U = USER_FIX[type], src0 = U && prop(`${U.n}-${tier}`, { scale: 1, tint: 0xffffff }); if (!src0) return null;
  src0.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(src0), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
  let k = Math.min(U.hc / sz.y, (U.D + 0.25) / sz.z); const n = Math.max(1, Math.round(U.W / (sz.x * k))); k = Math.min(k, U.W / (n * sz.x)); const sx = Math.min(1.2, U.W / (n * sz.x * k));
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  for (let i = 0; i < n; i++) { const src = i ? prop(`${U.n}-${tier}`, { scale: 1, tint: 0xffffff }) : src0, o = new THREE.Group(); src.position.set(-c.x, -bb.min.y, -c.z); o.add(src);
    o.scale.set(k * sx, k, k); o.position.x = (i - (n - 1) / 2) * sz.x * k * sx; body.add(o) }
  body.updateMatrixWorld(true);
  const w = n * sz.x * k * sx, d = sz.z * k, rc = new THREE.Raycaster(), dn = new THREE.Vector3(0, -1, 0), nm = new THREE.Vector3();
  const levels = new Map();   // 每个 z 一组层高
  const zs = type === 'veg' ? [-0.22 * d, 0.22 * d] : [0.08 * d];
  const xs = Array.from({ length: U.cols }, (_, i) => -w * 0.44 + (i + 0.5) * w * 0.88 / U.cols);
  const slots = [];
  for (const z of zs) {
    /* 在中间那一列找层高 */
    rc.set(new THREE.Vector3(w * 0.23, 6, z), dn); /* 别对着两个模型中间的缝 */ const ys = [];
    for (const h of rc.intersectObject(body, true)) { nm.copy(h.face.normal).transformDirection(h.object.matrixWorld); if (nm.y < 0.6 || h.point.y > 1.85 || h.point.y < 0.08) continue; if (!ys.some(y => Math.abs(y - h.point.y) < 0.18)) ys.push(h.point.y) }
    const top = sz.y * k, low = ys.filter(y => y < top - 0.15);   /* 最上面那块是顶棚 / 顶板，不摆货（只有一层的卧式冰柜除外） */
    levels.set(z, (low.length ? low : ys).sort((a, b) => a - b).slice(-4));
  }
  for (const z of zs) for (const y of levels.get(z)) for (const x of xs) slots.push([x, y, z, type === 'shelf' ? 1 : 0.9]);
  if (!slots.length) for (const x of xs) slots.push([x, sz.y * k, 0, 0.9]);   // 一层都没找到：摆在顶上
  const goods = new THREE.Group(); g.add(goods); g.userData = { goods, shown: '', slots }; return g;
}
function fixtureKenney(type, tier) {
  { const u = fixtureUser(type, tier); if (u) return u }
  const g = new THREE.Group(); let slots = [];
  if (type === 'deli') {
    /* 0.42 熟食柜（用户生成的模型 shushigui-1~3）：正面朝 +z，宽 1.5 米（前后比 0.8 米的格子略深一点）；
       玻璃看不清里面，菜摆在柜台面上：从上往下照一下找台面的高度 */
    const src = prop('shushigui-' + tier, { scale: 1, tint: 0xffffff }); if (!src) return null;
    src.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(src), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    /* 用户：熟食柜要跟其他货柜对齐——跟冰柜（同样占 2×1 格）一样：占满 1.7 米宽、前后不超过 1 米、高不超过 2.2 米，窄了就横向拉一点（最多 1.2 倍） */
    const k = Math.min(1.0 / sz.z, 2.2 / sz.y, 1.7 / sz.x * 1.2), sx = Math.min(1.2, 1.7 / (sz.x * k)), o = new THREE.Group(); src.position.set(-c.x, -bb.min.y, -c.z); o.add(src); o.scale.set(k * sx, k, k); g.add(o);
    o.updateMatrixWorld(true); const rc = new THREE.Raycaster(), wd = sz.x * k * sx - 0.3, dn = new THREE.Vector3(0, -1, 0);
    slots = []; for (const z of [-0.02, 0.2]) for (let i = 0; i < 6; i++) { const x = -wd / 2 + (i + 0.5) * wd / 6; rc.set(new THREE.Vector3(x, 5, z * sz.z * k), dn); const h = rc.intersectObject(o, true)[0]; slots.push([x, h ? h.point.y : sz.y * k, z * sz.z * k, 0.85]) }
    const goods = new THREE.Group(); g.add(goods); g.userData = { goods, shown: '', slots }; return g;
  }
  if (type === 'shelf') {
    /* 三节双面货架（每节 0.8 宽），正面两层板 + 顶上 */
    for (const x of [-0.8, 0, 0.8]) { const o = mk('shelf-boxes', 1, 2, 1.1, tier, x); if (!o) return null; g.add(o) }
    if (tier >= 2) g.add(box(2.4, 0.06, 0.02, 0xc8442f, 0, 0.3, 0.39), box(2.4, 0.06, 0.02, 0xc8442f, 0, 1.04, 0.39));   // 价签条
    if (tier === 3) g.add(topSign(2.3, 1.75, -0.02));
    slots = tier === 1 ? rowSlots([0.38, 1.12], 5, 2.2, 0.22) : rowSlots([0.38, 1.12, 1.62], 6, 2.2, 0.2);
  } else if (type === 'veg') {
    /* 四个果蔬筐（2×2），后排垫高；中档起筐子是新的，高档后面立招牌 */
    const lift = tier === 1 ? 0 : 0.28;
    for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) {
      const y = z < 0 ? lift : 0, o = mk('display-bread', 1.12, 1.15, 1.25, tier, x, y, z); if (!o) return null; g.add(o);
      if (y) g.add(box(0.74, y, 0.7, 0x5a5f66, x, y / 2, z));
    }
    if (tier === 3) { for (const x of [-0.76, 0.76]) g.add(box(0.06, 1.6, 0.06, 0x3a3a40, x, 0.8, -0.78)); g.add(topSign(1.6, 1.5, -0.78)) }
    slots = []; for (const [cx, cz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) for (const [dx, dz] of [[-0.15, -0.1], [0.15, -0.1], [-0.15, 0.15], [0.15, 0.15]]) slots.push([cx + dx, 0.3 + (cz < 0 ? lift : 0), cz + dz]);
  } else {
    if (tier < 3) {
      /* 两台卧式冰柜，东西摆在玻璃盖上面一排一排 */
      for (const x of [-0.4, 0.4]) { const o = mk('freezer', 1, 2.3, 1.3, tier, x); if (!o) return null; g.add(o) }
      if (tier === 2) g.add(topSign(1.5, 1.25, -0.42));
      slots = []; for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) slots.push([-0.62 + i * 0.25, 0.81, -0.15 + r * 0.3]);
      if (tier === 2) for (let i = 0; i < 6; i++) slots.push([-0.62 + i * 0.25, 0.81, 0.3]);
    } else {
      /* 两台立式敞口冷柜，里面三层 */
      for (const x of [-0.4, 0.4]) { const o = mk('freezers-standing', 0.8, 2.1, 1.6, tier, x, 0, 0.4); if (!o) return null; g.add(o) }
      for (const y of [0.42, 0.92, 1.42]) g.add(box(1.5, 0.03, 0.6, 0xc8ccd2, 0, y, -0.02));
      g.add(topSign(1.6, 1.95, 0.38));
      slots = rowSlots([0.45, 0.95, 1.45], 6, 1.4, 0);
    }
  }
  const goods = new THREE.Group(); g.add(goods);
  g.userData = { goods, shown: '', slots };
  return g;
}
export function fixtureMesh(type = 'shelf', tier = 1) {
  { const k = fixtureKenney(type, tier); if (k) return k }
  const g = new THREE.Group(); let slots = [];
  if (type === 'shelf') {
    if (tier === 1) {
      const wood = 0x8c6a46;
      g.add(box(2.4, 0.08, 0.8, wood, 0, 0.35, 0), box(2.4, 0.08, 0.8, wood, 0, 0.95, 0), box(2.4, 1.4, 0.08, 0x6e5338, 0, 0.7, -0.36));
      for (const x of [-1.15, 1.15]) g.add(box(0.1, 1.4, 0.8, 0x6e5338, x, 0.7, 0));
      slots = rowSlots([0.39, 0.99], 5, 2.2);
    } else if (tier === 2) {
      const steel = 0x8a9299, dark = 0x4d555c;
      for (const y of [0.12, 0.62, 1.12]) g.add(box(2.36, 0.05, 0.72, steel, 0, y, 0.02), box(2.36, 0.09, 0.03, 0xe0a030, 0, y - 0.04, 0.39));   // 层板 + 橙色价签条
      g.add(box(2.36, 1.75, 0.04, dark, 0, 0.88, -0.36));
      for (const x of [-1.16, 1.16]) for (const z of [-0.34, 0.34]) g.add(box(0.06, 1.75, 0.06, dark, x, 0.88, z));
      g.add(box(2.4, 0.3, 0.06, 0xc0392b, 0, 1.9, -0.34));
      slots = rowSlots([0.15, 0.65, 1.15], 6, 2.2);
    } else {
      const white = 0xeceae4;
      g.add(box(2.4, 0.3, 0.8, 0x3a3a40, 0, 0.15, 0), box(2.4, 1.6, 0.06, white, 0, 1.1, -0.37));
      for (const x of [-1.17, 1.17]) g.add(box(0.06, 1.9, 0.8, white, x, 0.95, 0));
      for (const y of [0.32, 0.82, 1.32]) g.add(glass(2.28, 0.03, 0.72, 0, y, 0));
      g.add(box(2.4, 0.08, 0.8, white, 0, 1.9, 0), new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.03, 0.06), glowMat(0xfff2c0)));
      g.children[g.children.length - 1].position.set(0, 1.85, 0.3);
      g.add(glass(2.28, 1.55, 0.02, 0, 1.1, 0.38));
      slots = rowSlots([0.34, 0.84, 1.34], 6, 2.1, 0.02);
    }
  } else if (type === 'veg') {
    if (tier === 1) {
      /* 四个斜放的木箱 */
      for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) {
        const c = new THREE.Group(); c.position.set(x, z < 0 ? 0.45 : 0.22, z); c.rotation.x = 0.25;
        c.add(box(0.74, 0.06, 0.7, 0x9c7a50, 0, 0, 0), box(0.74, 0.22, 0.05, 0x8a6a44, 0, 0.11, 0.33), box(0.74, 0.22, 0.05, 0x8a6a44, 0, 0.11, -0.33), box(0.05, 0.22, 0.7, 0x8a6a44, 0.35, 0.11, 0), box(0.05, 0.22, 0.7, 0x8a6a44, -0.35, 0.11, 0));
        g.add(c); if (z < 0) g.add(box(0.7, 0.42, 0.5, 0x6e5338, x, 0.21, z));
      }
      slots = [[-0.55, 0.5, -0.45], [-0.25, 0.52, -0.35], [-0.55, 0.27, 0.35], [-0.25, 0.29, 0.45], [-0.4, 0.55, -0.55], [-0.4, 0.3, 0.25], [0.25, 0.5, -0.45], [0.55, 0.52, -0.35], [0.25, 0.27, 0.35], [0.55, 0.29, 0.45], [0.4, 0.55, -0.55], [0.4, 0.3, 0.25]];   // 左边一半放第一种、右边一半放第二种
    } else if (tier === 2) {
      /* 三层阶梯，后面高；顶上绿色招牌 */
      for (let k = 0; k < 3; k++) { const z = 0.5 - k * 0.5, y = 0.25 + k * 0.35; g.add(box(1.56, y, 0.5, 0x8c6a46, 0, y / 2, z), box(1.56, 0.04, 0.5, 0x5e8a3a, 0, y + 0.02, z)) }
      for (const x of [-0.76, 0.76]) g.add(box(0.06, 1.9, 0.06, 0x6e5338, x, 0.95, -0.72));
      g.add(box(1.6, 0.32, 0.05, 0x3f7a3a, 0, 1.85, -0.72));
      slots = []; for (let k = 0; k < 3; k++) for (let i = 0; i < 5; i++) slots.push([-0.6 + i * 0.3, 0.29 + k * 0.35, 0.5 - k * 0.5]);
    } else {
      /* 冷藏果蔬柜：白色斜面柜 + 玻璃挡板 + 顶上喷雾灯条 */
      g.add(box(1.6, 0.6, 1.4, 0xeceae4, 0, 0.3, 0), box(1.6, 1.4, 0.2, 0xeceae4, 0, 0.7, -0.7));
      const tray = box(1.5, 0.05, 1.2, 0x2e6b46, 0, 0.75, 0.05); tray.rotation.x = 0.25; g.add(tray);
      g.add(glass(1.5, 0.35, 0.02, 0, 0.82, 0.7), box(1.5, 0.06, 0.12, 0x9aa4aa, 0, 1.38, -0.55));
      const led = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.03, 0.05), glowMat(0xd8f4ff)); led.position.set(0, 1.34, -0.5); g.add(led);
      slots = []; for (let k = 0; k < 3; k++) for (let i = 0; i < 5; i++) slots.push([-0.6 + i * 0.3, 0.84 - k * 0.1, 0.4 - k * 0.38]);
    }
  } else {
    if (tier === 1) {
      /* 卧式冰柜：白色矮柜、玻璃推拉盖，东西在里面 */
      g.add(box(1.56, 0.8, 0.76, 0xe8e6e0, 0, 0.4, 0), box(1.48, 0.06, 0.68, 0x2a4a5a, 0, 0.6, 0), glass(1.5, 0.03, 0.7, 0, 0.82, 0), box(1.56, 0.12, 0.05, 0x3a7fc0, 0, 0.7, 0.39));
      slots = []; for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) slots.push([-0.6 + i * 0.24, 0.63, -0.15 + r * 0.3]);
    } else {
      /* 立式冷柜：二档白色双门、三档黑框玻璃 + 灯 */
      const frame = tier === 2 ? 0xe8e6e0 : 0x2c2f33;
      g.add(box(1.56, 2.0, 0.08, frame, 0, 1.0, -0.36), box(0.06, 2.0, 0.76, frame, -0.75, 1.0, 0), box(0.06, 2.0, 0.76, frame, 0.75, 1.0, 0), box(1.56, 0.25, 0.76, frame, 0, 0.12, 0), box(1.56, 0.25, 0.76, frame, 0, 1.88, 0));
      for (const y of [0.55, 1.0, 1.45]) g.add(box(1.44, 0.03, 0.66, 0x9aa4aa, 0, y, 0));
      g.add(glass(tier === 2 ? 0.7 : 1.44, 1.5, 0.03, tier === 2 ? -0.37 : 0, 1.0, 0.37)); if (tier === 2) g.add(glass(0.7, 1.5, 0.03, 0.37, 1.0, 0.37), box(0.03, 1.5, 0.04, frame, 0, 1.0, 0.37));
      g.add(box(1.56, 0.22, 0.05, 0x2a6fb0, 0, 1.88, 0.39));
      if (tier === 3) { const led = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.03, 0.04), glowMat(0xe0f6ff)); led.position.set(0, 1.74, 0.3); g.add(led) }
      slots = rowSlots([0.28, 0.58, 1.03, 1.48], 6, 1.3, 0);
    }
  }
  const goods = new THREE.Group(); g.add(goods);
  g.userData = { goods, shown: '', slots };
  return g;
}
export const shelfMesh = () => fixtureMesh('shelf', 1);

/* 还没建的货架位：地上画一个框 */
export function shelfSlotMesh() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.03; return m;
}

/* ---------- 回收机 ---------- */
export function recyclerMesh() {
  const g = new THREE.Group();
  g.add(box(2.4, 1.6, 1.8, 0x4f7a6a, 0, 0.8, 0));
  g.add(box(2.5, 0.2, 1.9, 0x3c5c50, 0, 1.6, 0));
  const hopper = cyl(0.9, 0.5, 0.7, 4, 0x8a9a9a, -0.4, 2.05, 0); hopper.rotation.y = Math.PI / 4; g.add(hopper);
  g.add(cyl(0.18, 0.18, 1.2, 6, 0x5a5a5a, 0.8, 2.2, -0.5));
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0x55ff88 }));
  light.position.set(0.8, 1.2, 0.92); g.add(light);
  const chute = box(0.9, 0.5, 0.3, 0x2f4a40, 0.2, 0.4, 0.95); g.add(chute);
  g.add(box(0.5, 0.5, 0.06, 0xe8c547, -0.7, 1.05, 0.92));        // 黄色警示牌
  g.userData = { light, hopper };
  return g;
}

/* ---------- 场景物件 ---------- */
export function carMesh(color = 0x8a5a44) {
  const g = new THREE.Group();
  g.add(box(3.6, 0.8, 1.7, color, 0, 0.65, 0), box(2, 0.7, 1.5, color, -0.2, 1.4, 0));
  g.add(box(1.9, 0.5, 1.52, 0x2b3540, -0.2, 1.42, 0));            // 车窗
  for (const [x, z] of [[-1.2, 0.85], [1.2, 0.85], [-1.2, -0.85], [1.2, -0.85]]) { const w = cyl(0.36, 0.36, 0.3, 8, 0x222222, x, 0.36, z); w.rotation.x = Math.PI / 2; g.add(w) }
  return g;
}
export function barrierMesh() {
  const g = new THREE.Group();
  g.add(box(2, 0.3, 0.2, 0xd9d9d9, 0, 0.8, 0), box(0.2, 0.9, 0.2, 0x777777, -0.8, 0.45, 0), box(0.2, 0.9, 0.2, 0x777777, 0.8, 0.45, 0));
  for (let i = 0; i < 3; i++) g.add(box(0.3, 0.34, 0.24, 0xd23c2c, -0.6 + i * 0.6, 0.8, 0));   // 0.21：红条前后都比白杆厚一点（以前背面和白杆贴在同一面上，会闪）
  return g;
}
export function ruinMesh(w, h, d, color) {
  const g = new THREE.Group();
  g.add(box(w, h, d, color, 0, h / 2, 0));
  const top = box(w * 0.6, h * 0.25, d, color, -w * 0.15, h + h * 0.12, 0); top.rotation.z = 0.08; g.add(top);
  for (let i = 0; i < Math.floor(w / 1.6); i++) for (let j = 0; j < Math.floor(h / 1.8); j++)
    g.add(box(0.7, 0.8, 0.05, (i + j) % 3 ? 0x1e252b : 0x3d4650, -w / 2 + 0.9 + i * 1.6, 1 + j * 1.8, d / 2 + 0.01));
  g.add(rock(0.7, 0x7a746a, w * 0.3, 0.3, d / 2 + 0.5), rock(0.45, 0x8a8478, w * 0.3 + 0.8, 0.2, d / 2 + 0.4));
  return g;
}
export function fencePost(x, z) { return box(0.16, 1.3, 0.16, 0x6b5a45, x, 0.65, z) }
export function crateMesh(color = 0x9c7a4f) { const g = box(0.9, 0.9, 0.9, color, 0, 0.45, 0); g.add(box(0.92, 0.12, 0.92, 0x7a5d3a, 0, 0.2, 0)); return g }
export function barrelMesh(color = 0x3f6b8a) { const g = cyl(0.4, 0.4, 1, 8, color, 0, 0.5, 0); g.add(cyl(0.42, 0.42, 0.08, 8, 0x2a2a2a, 0, 0.3, 0)); return g }
export function lampMesh() {
  const g = new THREE.Group(); g.add(cyl(0.08, 0.1, 3.2, 6, 0x444444, 0, 1.6, 0));
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
  bulb.position.y = 3.25; g.add(bulb); return g;
}
export function benchMesh() {
  const g = new THREE.Group();
  g.add(box(2.2, 0.12, 1, 0x8c6a46, 0, 0.9, 0));
  for (const [x, z] of [[-1, 0.4], [1, 0.4], [-1, -0.4], [1, -0.4]]) g.add(box(0.12, 0.9, 0.12, 0x6e5338, x, 0.45, z));
  g.add(box(0.5, 0.25, 0.3, 0xc0392b, -0.5, 1.08, 0), box(0.6, 0.06, 0.12, 0x9a9a9a, 0.4, 0.99, 0.1));
  return g;
}
export const TREASURE_COLOR = id => TREASURE[id].color;

export function tentMesh(color = 0x6b7a4a) {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(1.5, 1.5, 3, 3, 1); geo.rotateZ(Math.PI / 2);
  const m = new THREE.Mesh(geo, mat(color)); m.position.y = 0.75; m.rotation.x = Math.PI; m.castShadow = m.receiveShadow = true; g.add(m);
  g.add(box(0.05, 1.3, 0.9, 0x2a2a20, 1.51, 0.65, 0));
  return g;
}
export function sandbags(n = 4) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) { const b = box(0.8, 0.32, 0.45, 0xb8a77a, -n * 0.4 + 0.4 + i * 0.8, 0.16, 0); b.rotation.y = (i % 2 ? 0.08 : -0.06); g.add(b) }
  for (let i = 0; i < n - 1; i++) g.add(box(0.8, 0.32, 0.45, 0xa8976a, -n * 0.4 + 0.8 + i * 0.8, 0.48, 0));
  return g;
}
export function fireMesh() {
  const g = new THREE.Group();
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; g.add(rock(0.18, 0x6a645a, Math.cos(a) * 0.5, 0.1, Math.sin(a) * 0.5)) }
  const log1 = box(0.8, 0.12, 0.14, 0x5a3a22, 0, 0.12, 0); log1.rotation.y = 0.6; const log2 = log1.clone(); log2.rotation.y = -0.6; g.add(log1, log2);
  const flames = [];
  for (const [x, z, s, c] of [[0, 0, 0.32, 0xff8a2a], [0.1, 0.05, 0.22, 0xffd25a], [-0.08, -0.06, 0.2, 0xff6a1a]]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(s, s * 2.6, 5), new THREE.MeshBasicMaterial({ color: c })); f.position.set(x, 0.2 + s * 1.3, z); g.add(f); flames.push(f);
  }
  g.userData = { flames };
  return g;
}

/* 0.21 地面一块块闪：路面、人行道、沙地、地砖这些贴地的平面只差 0.001～0.005 米高，手机上深度精度不够就互相打架（一会儿显示这块、一会儿那块）。
   这里把贴地的水平面按高度给一个 polygonOffset（越高的越往前），叠在一起也稳定；同一份材质用在不同高度时各复制一份。 */
/* 0.26 手机发烫：小东西（罐子、碎片、小盆栽这类半径 0.3 米以下的）不投影子，影子那一遍少画很多 */
export function trimShadows(root, minR = 0.3) {
  const s = new THREE.Vector3();
  root.traverse(o => { if (!o.isMesh || !o.castShadow || !o.geometry) return; if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    o.getWorldScale(s); if (o.geometry.boundingSphere.radius * Math.max(s.x, s.y, s.z) < minR) o.castShadow = false });
}
const decalCache = new Map();
export function fixDecals(root) {
  if (decalCache.size > 400) decalCache.clear(); const cache = decalCache, b = new THREE.Box3();
  root.traverse(o => {
    if (!o.isMesh || !o.material || Array.isArray(o.material) || o.material.userData.decal) return;
    b.setFromObject(o); if (b.isEmpty()) return;
    const h = b.max.y - b.min.y, y = (b.max.y + b.min.y) / 2;
    if (h > 0.004 || y < 0.0005 || y > 0.04) return;                 // 只管贴地的薄平面（不含地面本身 y=0）
    const lv = Math.round(y * 1000), k = o.material.uuid + ':' + lv;
    let m = cache.get(k);
    if (!m) { m = o.material.clone(); m.polygonOffset = true; m.polygonOffsetFactor = -Math.min(8, lv * 0.25); m.polygonOffsetUnits = -lv * 4; m.userData.decal = 1; cache.set(k, m) }
    o.material = m;
  });
}
