/* V1.01 设计/24「地面活起来」：
   1 云影：地面材质里叠一层慢慢飘的云影子（世界坐标采样云影图），不用影子贴图
   2 打破重复：大尺度的深浅起伏 + 草地按两种尺寸叠
   3 会随风摆的 3D 草：一丛 3 根尖叶，InstancedMesh 一个 draw call，顶点里摆（阵风一波一波从南边吹来，主角走过往两边压）
   4 地上的小东西：小花、三叶草、蒲公英、蘑菇（图集，侧视竖着立 + 俯视平贴），3D 小石子
   6 飘落叶 / 花瓣（树下）
   省电模式（设置里关掉，或者帧数一直很低自动关）：只留 1、2。 */
import * as THREE from 'three';
import { perfOpt } from './perf.js';

export const GFX = { time: { value: 0 }, cloud: { value: null }, wind: { value: new THREE.Vector2(0.12, -0.38) }, player: { value: new THREE.Vector3(0, 0, -999) }, windR: { value: 1e4 } };   // windR（设计 57）：离主角多远以内的草才算风
let hi = true;   // 省电模式（main.js 的 eco）关掉 3D 草这些
export const gfxHigh = () => hi;
export function setGfxHigh(v) { hi = !!v; for (const f of onGfx) f(hi) }
const onGfx = [];
export const onGfxChange = f => onGfx.push(f);

/* ---------- 1、2：给地面材质打补丁 ---------- */
export function liven(mat, { antiTile = false, cloudK = 0.2, vary = 1 } = {}) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.gfxTime = GFX.time; sh.uniforms.gfxCloud = GFX.cloud; sh.uniforms.gfxWind = GFX.wind;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vGW;\nuniform float gfxTime;\nuniform sampler2D gfxCloud;\nuniform vec2 gfxWind;`)
      .replace('#include <map_fragment>', `
#ifdef USE_MAP
  vec4 tA = texture2D(map, vMapUv);
  ${antiTile ? `vec4 tB = texture2D(map, mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.41 + vec2(0.31, 0.17));
  tA = mix(tA, tB, smoothstep(0.3, 0.7, texture2D(gfxCloud, vGW.xz / 37.0 + 0.5).r) * 0.55);` : ''}
  diffuseColor *= tA;
#endif
  { float nv = texture2D(gfxCloud, vGW.xz / 61.0 + 0.27).r;
    diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(1.05, 1.04, 0.93), vec3(0.9, 0.97, 0.9), nv), ${vary.toFixed(2)});
    float cs = texture2D(gfxCloud, (vGW.xz - gfxWind * gfxTime * 1.1) / 52.0).r;
    diffuseColor.rgb *= 1.0 - ${cloudK.toFixed(3)} * smoothstep(0.15, 0.85, cs); }`);
  };
  mat.customProgramCacheKey = () => 'gfx' + (antiTile ? 1 : 0) + cloudK + vary;
  return mat;
}

/* ---------- 3：草 ---------- */
const rnd = (() => { let s = 20261016; return () => (s = (s * 16807) % 2147483647) / 2147483647 })();
function tuftGeo() {
  /* 一丛 3 根尖叶，每根 1 个三角形（两面都画）；根部深绿、尖上浅黄绿；uv.y = 高度（顶点里按它摆） */
  const pos = [], col = [], uv = [], root = new THREE.Color(0x3f7a2a), tip = new THREE.Color(0xb6d15a);
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + rnd() * 0.8, r = 0.05 + rnd() * 0.05, w = 0.045, h = 0.24 + rnd() * 0.14, lean = (rnd() - 0.5) * 0.12;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    pos.push(cx - px, 0, cz - pz, cx + px, 0, cz + pz, cx + Math.cos(a) * lean, h, cz + Math.sin(a) * lean);
    for (const c of [root, root, tip]) col.push(c.r, c.g, c.b); uv.push(0, 0, 1, 0, 0.5, 1) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
  /* 草叶的法线一律朝上（不然侧面那根背光会发黑，卡通草不要这种明暗） */
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); return g;
}
/* 顶点里的风：s = 高度（0 根、1 尖），阵风沿风向一波一波；离主角 1 米内往外压 */
const WIND_GLSL = `
  vec4 gw0 = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 dp = gw0.xz - gfxPlayer.xz; float dl = length(dp);
  if (dl < gfxWindR) {   // 设计 57：只算主角（镜头）附近的风，远处的草不动
  float gs = uv.y;
  vec2 wd = normalize(gfxWind);
  float gust = 0.55 + 0.45 * sin(dot(gw0.xz, wd) * 0.22 + gfxTime * 1.6);
  float sway = sin(gfxTime * 2.3 + gw0.x * 0.7 + gw0.z * 0.45) * 0.35 + gust;
  vec2 bend = wd * sway * 0.11 * gs * gs * smoothstep(gfxWindR, gfxWindR - 4.0, dl);
  bend += (dl < 1.1 ? normalize(dp + 0.0001) * (1.1 - dl) * 0.22 * gs : vec2(0.0));
  transformed.xz += bend; transformed.y *= 1.0 - 0.25 * length(bend); }`;
function windMat(base) {
  base.onBeforeCompile = sh => {
    sh.uniforms.gfxTime = GFX.time; sh.uniforms.gfxWind = GFX.wind; sh.uniforms.gfxPlayer = GFX.player; sh.uniforms.gfxWindR = GFX.windR;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float gfxTime;\nuniform vec2 gfxWind;\nuniform vec3 gfxPlayer;\nuniform float gfxWindR;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + WIND_GLSL);
  };
  base.customProgramCacheKey = () => 'wind' + (base.map ? 1 : 0);
  return base;
}

/* 在一块地里撒点：ok(x, z) 能不能长草；dens 每平方米几丛；clump 一簇一簇的（用低频噪声挑） */
function scatter(area, n, ok, weight) {
  const out = []; let tries = 0;
  while (out.length < n && tries++ < n * 12) { const x = area.x0 + rnd() * (area.x1 - area.x0), z = area.z0 + rnd() * (area.z1 - area.z0);
    if (!ok(x, z)) continue; if (weight && rnd() > weight(x, z)) continue; out.push([x, z]) }
  return out;
}
const clumpy = (x, z) => { const v = Math.sin(x * 0.31 + Math.sin(z * 0.17) * 2) * Math.sin(z * 0.27 + Math.cos(x * 0.13) * 2); return 0.25 + 0.75 * Math.max(0, v + 0.35) };

/* 设计 57：小花、小石子按 12 米一块分开；每块记下中心，画面外的块 three 自己不画，离主角远的块 farTick 藏起来 */
const DTILE = 12;
const tileSplit = list => { if (!perfOpt('far')) return [list]; const m = new Map(); for (const p of list) { const k = Math.floor(p[0] / DTILE) + ',' + Math.floor(p[1] / DTILE); (m.get(k) || m.set(k, []).get(k)).push(p) } return [...m.values()] };
/* 设计 57：会动的小东西（菜、地上捡的、池塘的鱼、商人……）不进影子图（影子只画一次时） */
export const noCast = o => { if (o && perfOpt('sshadow')) o.traverse(c => { if (c.isMesh) c.castShadow = false }); return o };
export const FAR_SMALL = [];   // 离主角远就不画的小东西（main.js 每 0.25 秒 farTick）
export function farTick(c, R = 22) { for (const o of FAR_SMALL) { const f = o.userData.farC || o.position; o.visible = Math.hypot(f.x - c.x, f.z - c.z) < R + (o.userData.farR || 0) } }
function tileIM(im, list) {
  if (!perfOpt('far')) { im.frustumCulled = false; return }
  im.computeBoundingSphere(); im.boundingSphere.radius += 0.6; im.frustumCulled = true;
  let x = 0, z = 0; for (const p of list) { x += p[0]; z += p[1] } im.userData.farC = { x: x / list.length, z: z / list.length }; im.userData.farR = DTILE * 0.7; FAR_SMALL.push(im);
}
/* ---------- 主入口：world.js 建好地面以后调一次 ---------- */
export function createGroundFx(scene, { area, okGrass, nearEdge, trees = [], decoTex, leafTex, counts = {} }) {
  const root = new THREE.Group(); scene.add(root);
  /* 3 草：边上（路边、墙角）密，空地上一簇一簇 */
  /* 设计 57：手机上草减半（3200 → 1600）；按 12 米一块分开画，画面外的那几块不画；风只算主角附近 18 米 */
  const lite = perfOpt('grass') && matchMedia('(pointer:coarse)').matches;
  if (perfOpt('grass')) GFX.windR.value = 18;
  const nG = Math.round((counts.grass || 3200) * (lite ? 0.5 : 1));
  const pts = scatter(area, nG, okGrass, (x, z) => Math.min(1, clumpy(x, z) + (nearEdge(x, z) ? 0.8 : 0)));
  const gMat = windMat(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })), gGeo = tuftGeo(), TILE = perfOpt('grass') ? 12 : 1e5, tiles = new Map();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), tint = new THREE.Color();
  pts.forEach(p => { const k = Math.floor(p[0] / TILE) + ',' + Math.floor(p[1] / TILE); (tiles.get(k) || tiles.set(k, []).get(k)).push(p) });
  const grass = new THREE.Group(); root.add(grass);
  for (const list of tiles.values()) { const im = new THREE.InstancedMesh(gGeo, gMat, list.length);
    list.forEach(([x, z], i) => { e.set(0, rnd() * 6.28, 0); q.setFromEuler(e); const s = 0.75 + rnd() * 0.6; sc.set(s, s * (0.8 + rnd() * 0.5), s); m4.compose(v.set(x, 0, z), q, sc); im.setMatrixAt(i, m4);
      tint.setHSL(0.24 + rnd() * 0.05, 0.55 + rnd() * 0.2, 0.42 + rnd() * 0.14); tint.multiplyScalar(1.45); im.setColorAt(i, tint) });
    if (TILE < 1e4) { im.computeBoundingSphere(); im.boundingSphere.radius += 0.5; im.frustumCulled = true } else im.frustumCulled = false;
    grass.add(im) }

  /* 4 小花小草：图集 4×4，每行两种东西，每种「俯视、侧视」两格：雏菊、毛茛 / 紫花、三叶草 / 草丛、蒲公英 / 小石子、蘑菇。
     竖着的（侧视，交叉两片，跟草一起摆）一个 InstancedMesh、平贴的（俯视）一个，每个实例带自己是哪一格（aCell） */
  const deco = new THREE.Group(); root.add(deco);
  const KINDS = [[0, 0], [0, 2], [1, 0], [1, 2], [2, 2], [3, 2]];   // [行, 俯视那格的列]：雏菊、毛茛、紫花、三叶草、蒲公英、蘑菇（草丛、石子用 3D）
  const side = [], flat = [];
  const decoDens = counts.deco || 240;   // 用户：花草、落叶少量就好，别太密
  KINDS.forEach(([r, c0], k) => {
    const mush = k === 5, n = Math.round(decoDens / KINDS.length * (mush ? 0.35 : 1));
    const where = mush ? (x, z) => trees.some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 2.2) && okGrass(x, z) : okGrass;
    const P = mush ? trees.flatMap(([tx, tz]) => scatter({ x0: tx - 2.2, x1: tx + 2.2, z0: tz - 2.2, z1: tz + 2.2 }, Math.ceil(n / Math.max(1, trees.length)), where)) : scatter(area, n, where, (x, z) => clumpy(x * 1.7 + k * 9, z * 1.7) ** 2 + (nearEdge(x, z) ? 0.35 : 0));
    P.forEach(([x, z], i) => (i % 2 ? flat : side).push([x, z, c0 + (i % 2 ? 0 : 1), r, mush]));
  });
  const cellMat = (wind, base) => { base.onBeforeCompile = sh => {
      sh.uniforms.gfxTime = GFX.time; sh.uniforms.gfxWind = GFX.wind; sh.uniforms.gfxPlayer = GFX.player; sh.uniforms.gfxWindR = GFX.windR;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCell;\nuniform float gfxTime;\nuniform vec2 gfxWind;\nuniform vec3 gfxPlayer;\nuniform float gfxWindR;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vec2((aCell.x + uv.x) / 4.0, 1.0 - (aCell.y + 1.0 - uv.y) / 4.0);')
        .replace('#include <begin_vertex>', '#include <begin_vertex>' + (wind ? WIND_GLSL : ''));
    }; base.customProgramCacheKey = () => 'cell' + wind; return base };
  const mkDeco = (list0, isFlat) => {
    const dm = cellMat(!isFlat, new THREE.MeshLambertMaterial({ map: decoTex, alphaTest: 0.45, side: THREE.DoubleSide }));
    for (const list of tileSplit(list0)) {   // 设计 57：按 12 米一块分开（画面外的不画，离主角远的不画）
    if (!list.length) continue;
    const g = new THREE.PlaneGeometry(0.5, 0.5); if (isFlat) { g.rotateX(-Math.PI / 2); g.translate(0, 0.012, 0) } else g.translate(0, 0.25, 0);
    if (isFlat) { const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setY(i, 0) }   // 平贴的 uv.y 当高度用 = 0，不摆（贴图坐标在 shader 里另算）
    const per = isFlat ? 1 : 2, N = list.length * per, cells = new Float32Array(N * 2);
    const im = new THREE.InstancedMesh(g, dm, N);
    let j = 0;
    for (const [x, z, c, r, mush] of list) { const s = (mush ? 0.75 : 0.6) + rnd() * 0.45, ry = rnd() * 6.28;
      for (let t = 0; t < per; t++) { e.set(0, ry + t * Math.PI / 2, 0); q.setFromEuler(e); m4.compose(v.set(x, 0, z), q, sc.set(s, s, s)); im.setMatrixAt(j, m4); cells[j * 2] = c; cells[j * 2 + 1] = r; j++ } }
    if (isFlat) { /* 平的那张贴图坐标要用原来的 uv：重新给一份 */ const u = new THREE.PlaneGeometry(0.5, 0.5).attributes.uv; g.setAttribute('uv', u.clone()); g.userData.flat = true }
    g.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
    tileIM(im, list); deco.add(im) } };
  mkDeco(side, false); mkDeco(flat, true);
  /* 3D 小石子：歪圆块，几种灰 */
  { const g = new THREE.IcosahedronGeometry(0.07, 0); g.scale(1, 0.55, 0.8); const P = scatter(area, counts.pebble || 80, okGrass, (x, z) => nearEdge(x, z) ? 1 : 0.25);
    const pm = new THREE.MeshLambertMaterial({ flatShading: true });
    for (const PP of tileSplit(P)) { const im = new THREE.InstancedMesh(g, pm, PP.length);
    PP.forEach(([x, z], i) => { e.set(rnd() * 0.5, rnd() * 6.28, rnd() * 0.5); q.setFromEuler(e); const s = 0.6 + rnd() * 1.1; m4.compose(v.set(x, 0.02, z), q, sc.set(s, s, s)); im.setMatrixAt(i, m4); const gr = 0.45 + rnd() * 0.25; im.setColorAt(i, tint.setRGB(gr * 1.05, gr, gr * 0.92)) });
    tileIM(im, PP); deco.add(im) } }

  /* 6 落叶 / 花瓣：树下一片一片往下飘，一边翻一边落，跟阵风同一个方向（一个 InstancedMesh，每帧改十几个矩阵） */
  const LEAF_N = counts.leaves || 6, leaves = [];
  const leafGeo = new THREE.PlaneGeometry(0.16, 0.16), lc = new Float32Array(LEAF_N * 2);
  for (let i = 0; i < LEAF_N; i++) { lc[i * 2] = i % 3; lc[i * 2 + 1] = (i % 6) / 3 | 0 }
  leafGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(lc, 2));
  const leafMat = new THREE.MeshLambertMaterial({ map: leafTex, alphaTest: 0.45, side: THREE.DoubleSide });
  leafMat.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCell;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vec2((aCell.x + uv.x) / 3.0, 1.0 - (aCell.y + 1.0 - uv.y) / 2.0);') };
  leafMat.customProgramCacheKey = () => 'leaf';
  const leafIM = new THREE.InstancedMesh(leafGeo, leafMat, LEAF_N); leafIM.frustumCulled = false; root.add(leafIM);
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < LEAF_N; i++) { leaves.push({ on: false, t: rnd() * 6, life: 0, vy: 0, p: new THREE.Vector3(), r: new THREE.Euler(), spin: new THREE.Vector3() }); leafIM.setMatrixAt(i, hide) }
  const spawnLeaf = L => { if (!trees.length) return; const [tx, tz] = trees[(rnd() * trees.length) | 0];
    L.p.set(tx + (rnd() - 0.5) * 2.2, 2.2 + rnd() * 1.2, tz + (rnd() - 0.5) * 2.2); L.vy = 0.35 + rnd() * 0.25; L.life = 0; L.on = true;
    L.spin.set(1 + rnd() * 2, 0.5 + rnd(), 1 + rnd() * 2); L.r.set(rnd() * 6, rnd() * 6, rnd() * 6) };
  function setOn(v) { grass.visible = v; deco.visible = v; leafIM.visible = v }
  setOn(hi); onGfxChange(setOn);
  return {
    root, grass,
    tick(dt, playerPos) {
      GFX.time.value += dt; if (playerPos) GFX.player.value.copy(playerPos);
      if (!hi) return;
      const w = GFX.wind.value, gust = 0.55 + 0.45 * Math.sin(GFX.time.value * 1.6);
      for (let i = 0; i < leaves.length; i++) { const L = leaves[i];
        if (!L.on) { L.t -= dt; if (L.t <= 0) { spawnLeaf(L); L.t = 6 + rnd() * 10 } if (!L.on) continue }
        L.life += dt; const p = L.p;
        if (L.vy > 0) { p.y -= L.vy * dt; p.x += (w.x * 2.2 * gust + Math.sin(L.life * 2.1) * 0.35) * dt; p.z += (w.y * 2.2 * gust + Math.cos(L.life * 1.7) * 0.25) * dt;
          L.r.x += L.spin.x * dt; L.r.y += L.spin.y * dt; L.r.z += L.spin.z * dt;
          if (p.y <= 0.02) { p.y = 0.02; L.r.set(-Math.PI / 2, L.r.y, 0); L.vy = 0; L.life = 0 } }   // 落地躺几秒再消失
        else if (L.life > 5) { L.on = false; L.t = 4 + rnd() * 8; leafIM.setMatrixAt(i, hide); continue }
        q.setFromEuler(L.r); m4.compose(p, q, sc.set(1, 1, 1)); leafIM.setMatrixAt(i, m4) }
      leafIM.instanceMatrix.needsUpdate = true;
    },
  };
}

/* V1.01 优化：影子只算主角周围 ±R 米（以前一张大影子贴图盖住整张地图，每帧把所有东西都画一遍影子，手机烫）；
   跟着主角挪的时候按影子贴图的一个像素对齐着挪，影子边缘不会闪 */
/* 设计 57：影子图不每帧画——不动的东西（房子、机器、货柜、塔、树）的影子只在变了的时候画一次；会动的（人、动物）不进影子图，用脚下的假影子。
   怎么知道「变了」：每 0.25 秒把场景里投影子的东西（看得见的）的位置、大小算一个数，跟上次不一样就重画；换场景、影子相机挪了也重画 */
export function makeShadowCache(renderer) {
  let dirty = true, sig = '', t = 0, last = null, drawn = 0, pend = false;
  const sign = scene => { let h = 0, n = 0;   // 位置按 5 厘米取整：回收机干活时那种小抖动不算变
    scene.traverseVisible(o => { if (!(o.isMesh && o.castShadow)) return; const e = o.matrixWorld.elements, k = (n % 89) + 1;
      const r = x => Math.round(x * 20); h += (r(e[12]) * 1.31 + r(e[13]) * 2.17 + r(e[14]) * 3.11 + r(e[0]) * 0.71 + r(e[5]) * 0.93 + r(e[10]) * 0.37) * k; if (o.isInstancedMesh) h += (o.instanceMatrix.version * 7 + o.count) * k; n++ });
    return n + ':' + h.toFixed(3) };
  return {
    dirty() { dirty = true },
    /* 每帧画之前调：返回这一帧要不要画影子图 */
    frame(scene, now, moved) {
      const sm = renderer.shadowMap; sm.autoUpdate = false;
      if (scene !== last) { last = scene; dirty = true }
      if (moved) dirty = true;
      if (now - t > 250) { t = now; const s = sign(scene); if (s !== sig) { sig = s; if (now - drawn > 1000) dirty = true; else pend = true } }   // 还有在动的投影子东西：最多每秒重画一次
      if (pend && now - drawn > 1000) { pend = false; dirty = true }
      if (dirty) drawn = now;
      sm.needsUpdate = dirty; const d = dirty; dirty = false; return d;
    },
    /* 调试用：这 0.25 秒里位置变了的投影子物件（找「一直在重画」的原因） */
    movers(scene) { const out = []; scene.traverseVisible(o => { if (o.isMesh && o.castShadow) { const e = o.matrixWorld.elements, k = o.uuid, v = [e[12], e[13], e[14], e[0], e[5]].map(x => x.toFixed(3)).join(); if (this._m && this._m[k] && this._m[k] !== v) { const ch = []; let q = o; for (let i = 0; i < 5 && q; i++, q = q.parent) ch.push((q.name || q.type) + (q.userData && Object.keys(q.userData).length ? '{' + Object.keys(q.userData).slice(0, 3).join('|') + '}' : '')); out.push(ch.join('<') + ' @' + e[12].toFixed(0) + ',' + e[14].toFixed(0)) }; (this._m = this._m || {})[k] = v } }); return out },
  };
}
export function makeSunFollow(sun, R = 22, size = 1024) {
  const OFF = sun.position.clone().sub(sun.target.position);
  sun.shadow.mapSize.set(size, size);
  const cam = sun.shadow.camera; Object.assign(cam, { left: -R, right: R, top: R, bottom: -R, near: 1, far: OFF.length() + 60 }); cam.updateProjectionMatrix();
  const lx = new THREE.Vector3(), ly = new THREE.Vector3(), lz = new THREE.Vector3(), c = new THREE.Vector3();
  new THREE.Matrix4().lookAt(OFF, new THREE.Vector3(), new THREE.Vector3(0, 1, 0)).extractBasis(lx, ly, lz);
  /* 设计 57：影子只画一次时（step = 3 米）影子相机按 3 米一格挪：主角走 3 米影子图才重画一次（返回 true = 挪了，要重画） */
  return (p, step = 0) => {
    const tx = 2 * R / size, st = step ? Math.max(1, Math.round(step / tx)) * tx : tx, a = Math.round(p.dot(lx) / st) * st, b = Math.round(p.dot(ly) / st) * st, d = step ? Math.round(p.dot(lz) / st) * st : p.dot(lz);
    c.copy(lx).multiplyScalar(a).addScaledVector(ly, b).addScaledVector(lz, d);
    if (c.distanceToSquared(sun.target.position) < 1e-6) return false;
    sun.target.position.copy(c); sun.position.copy(c).add(OFF); sun.target.updateMatrixWorld(); sun.updateMatrixWorld(); return true;
  };
}

/* 设计 64：地面闪烁——好几块贴地的平面（路、石板地、泥地、池塘、超市地砖……）叠在一起，高度只差 0.00002～0.0004 米，远处分不清上下就来回闪。
   统一处理：场景里离地 0.05 米以内、平躺着的面（不算整块大草地），按高度排成一层一层（同样高的算一层），每层各给一级 polygonOffset（越高的往前推得越多），
   材料各拷一份（不影响别处共用的材料）。原来谁在上面现在还是谁在上面，但不再靠 0.0001 米的高度差分上下，不会闪。
   （试过「不写深度 + renderOrder」：地砖下面的地板盒子、后画的大草地会把贴片整块盖掉，不用。）新盖的、新长出来的贴片每 3 秒补一次 */
const _gb = new THREE.Box3();
export function isGroundPatch(o) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.geometry || !o.material) return false;
  if (Array.isArray(o.material) && !o.material.every(m => m.map)) return false;   // 设计 65b：石板地、泥地是一个网格两组材质（填充 + 外圈渐变），也要分层
  _gb.setFromObject(o); const h = _gb.max.y - _gb.min.y, A = (_gb.max.x - _gb.min.x) * (_gb.max.z - _gb.min.z);
  if (h > 0.004 || _gb.max.y > 0.05 || _gb.min.y < -0.05 || A < 0.05 || A > 1500) return false;
  return (_gb.min.y + _gb.max.y) / 2;
}
const GL = { ys: [], list: [] };
export const GL_STEP = 4;   // 一层 4 个单位
export function layerGround(scene) {
  let add = false;
  scene.traverse(o => {
    if (!o.isMesh || o.userData.gl64 != null) return;
    o.updateWorldMatrix(true, false); const y = isGroundPatch(o); o.userData.gl64 = y === false ? 0 : 1; if (y === false) return;
    if (!Array.isArray(o.material) && o.material.transparent && !o.material.map) { o.userData.gl64 = 0; return }   // 半透明的特效圈不管
    o.material = Array.isArray(o.material) ? o.material.map(cloneM) : cloneM(o.material); const yk = Math.round(y * 1e6); o.userData.glY = yk; GL.list.push(o); if (!GL.ys.includes(yk)) { GL.ys.push(yk); add = true }
    setLv(o);
  });
  if (add) { GL.ys.sort((a, b) => a - b); for (const o of GL.list) setLv(o) }   // 来了新的一层高度：全部重新排
  return GL.list.length;
}
function setLv(o) { const lv = GL.ys.indexOf(o.userData.glY) + 1; for (const m of [].concat(o.material)) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -GL_STEP * lv; m.needsUpdate = true } }
/* 设计 65b：clone() 不带 onBeforeCompile，所以分层以后路、石板地、泥地都没有 liven 的效果（V4.61 时这些贴片也已经没有）。
   这次保持原样：带上以后石板地会叠出一层转了角度的大石板花纹，跟现在看惯的样子不一样 */
const cloneM = m => m.clone();
