/* ================= 人物模型（Kenney Animated Characters Survivors，CC0） =================
   一个带骨骼的模型 + 4 张皮肤贴图（2 个幸存者、2 个丧尸）+ 3 个动作（待机、跑、跳）。
   顾客的衣服颜色是在贴图上改色生成的，所以同一个模型能有很多不同的人。
   没有「走路」动作：走路用跑步动作放慢；丧尸用跑步动作放得更慢，再把手臂往前抬。 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { A, loadGLB } from './assets.js';
import { loadHero2, hero2Ready, makeHero2, applyHero2, hero2Tick, loadHeroFb, heroFbReady, makeHeroFb } from './hero2.js';
import { perfOpt } from './perf.js';
import { addFlat, syncFlat } from './flatshadow.js';

const SCALE = 2.1 / 376;            // 模型原始高度约 376；Kenney 人物是大头比例，放到 2.1 高看起来和场景匹配
let base = null, clips = {};
const skins = {};                    // 名字 → THREE.Texture

/* 贴图上各部分的位置（四张皮肤布局一样）：衣服、裤子 */
const SHIRT = { x0: 160, x1: 480, y0: 490, y1: 1024 };
const PANTS = { x0: 624, x1: 1024, y0: 764, y1: 1024 };

function loadImg(src) { return new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = A(src) }) }
function texFrom(canvasOrImg) {
  const t = new THREE.Texture(canvasOrImg); t.colorSpace = THREE.SRGBColorSpace; t.flipY = true; t.needsUpdate = true; return t;
}
/* 把一块区域染成目标颜色（保留原来的明暗和脏污） */
function tint(d, w, R, hex, strength = 1) {
  const tr = (hex >> 16 & 255) / 255, tg = (hex >> 8 & 255) / 255, tb = (hex & 255) / 255;
  for (let y = R.y0; y < R.y1; y++) for (let x = R.x0; x < R.x1; x++) {
    const i = (y * w + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
    const lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    if (sat > 60 && lum < 0.55) continue;             // 污渍、深色细节保留
    if (R.skip && R.skip(r, g, b)) continue;
    if (R.skinSkip && r > g + 12 && g > b + 8 && r - b > 40) continue;   // 皮肤（衣服领口露出来的脖子）不染
    const k = Math.min(1.25, 0.35 + lum * 0.9) * 255;
    d[i] = d[i] + (tr * k - d[i]) * strength; d[i + 1] = d[i + 1] + (tg * k - d[i + 1]) * strength; d[i + 2] = d[i + 2] + (tb * k - d[i + 2]) * strength;
  }
}
/* 女性幸存者原贴图的肤色偏大红，改成自然的深棕肤色（保留明暗） */
function fixRedSkin(d) {
  const base = 0x87 * 0.3 + 0x22 * 0.59 + 0x1a * 0.11;
  for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2];
    if (r > 70 && r > g * 1.9 && r > b * 2.2) { const k = (0.3 * r + 0.59 * g + 0.11 * b) / base; d[i] = Math.min(255, 0x9a * k); d[i + 1] = Math.min(255, 0x66 * k); d[i + 2] = Math.min(255, 0x48 * k) } }
}
/* Retro 包的贴图是 256×256，衣服、裤子的范围按比例算（模型是同一个，贴图的分区一样） */
const frac = (w, R) => ({ x0: Math.round(R[0] * w), x1: Math.round(R[1] * w), y0: Math.round(R[2] * w), y1: Math.round(R[3] * w), skinSkip: true });
function variant(img, shirt, pants, redFix, retro) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, c.width, c.height);
  if (redFix) fixRedSkin(id.data);
  const SH = retro ? frac(c.width, [0, 0.6, 0.48, 1]) : SHIRT, PA = retro ? frac(c.width, [0.6, 1, 0.73, 1]) : PANTS;
  if (shirt != null) tint(id.data, c.width, SH, shirt);
  if (pants != null) tint(id.data, c.width, PA, pants, 0.8);
  g.putImageData(id, 0, 0); return texFrom(c);
}

export const CUSTOMER_SKINS = 12;
/* ---------- 主角外观：按创建人物时选的颜色重新染贴图 ---------- */
let baseImg = {};
const hexRGB = h => [h >> 16 & 255, h >> 8 & 255, h & 255];
/* 底图里哪些像素是皮肤、哪些是头发（按颜色判断；头发只看贴图上半部分，免得把黑鞋子也染了） */
const MASK = {
  m: { skin: (r, g, b) => r > 170 && r - g > 60 && r - g < 150 && g - b > 5 && g - b < 50, skinL: 175,
       hair: (r, g, b) => r > 120 && r < 195 && g > 75 && g < 130 && b > 40 && b < 90 && r - g > 40 && r - g < 80, hairL: 116 },
  f: { skin: (r, g, b) => r > 70 && r > g * 1.9 && g - b < 24 && g - b > -6, skinL: 64,
       hair: (r, g, b) => r < 80 && r >= g && g < 40 && b < 40, hairL: 22,
       skin2: (r, g, b) => r > 185 && g > 90 && g < 150 && b > 30 && b < 95 && r - g > 65, skin2L: 146 },   // 女底图腿上的皮肤是橙色
};
/* 按「原图」判断每个像素是不是皮肤 / 头发（1 = 皮肤，2 = 头发），先记下来，再染色 */
function tintMasked(d, w, R, mask, hex, strength) {
  const tr = (hex >> 16 & 255) / 255, tg = (hex >> 8 & 255) / 255, tb = (hex & 255) / 255;
  for (let y = R.y0; y < R.y1; y++) for (let x = R.x0; x < R.x1; x++) {
    const p = y * w + x; if (mask[p]) continue; const i = p * 4, r = d[i], g = d[i + 1], b = d[i + 2];
    const lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255, sat = Math.max(r, g, b) - Math.min(r, g, b);
    if (sat > 60 && lum < 0.55) continue;
    const k = Math.min(1.25, 0.35 + lum * 0.9) * 255;
    d[i] += (tr * k - d[i]) * strength; d[i + 1] += (tg * k - d[i + 1]) * strength; d[i + 2] += (tb * k - d[i + 2]) * strength;
  }
}
function maskOf(d, w, k) {
  const m = new Uint8Array(d.length / 4), hairLim = Math.floor(0.48 * w) * w;
  for (let p = 0; p < m.length; p++) { const i = p * 4, r = d[i], g = d[i + 1], b = d[i + 2];
    if (k.skin(r, g, b)) m[p] = 1; else if (k.skin2 && k.skin2(r, g, b)) m[p] = 3; else if (p < hairLim && k.hair(r, g, b)) m[p] = 2 }
  return m;
}
function recolor(d, mask, which, refL, target, minK = 0.55, maxK = 1.35) {
  const [tr, tg, tb] = hexRGB(target);
  for (let p = 0; p < mask.length; p++) { if (mask[p] !== which) continue; const i = p * 4, r = d[i], g = d[i + 1], b = d[i + 2];
    const f = Math.max(minK, Math.min(maxK, (0.3 * r + 0.59 * g + 0.11 * b) / refL));
    d[i] = Math.min(255, tr * f); d[i + 1] = Math.min(255, tg * f); d[i + 2] = Math.min(255, tb * f) }
}
export function lookTexture(look, L) {
  look = { skin: 1, hair: 1, shirt: 0, pants: 0, ...look };   // 设计 18v 以后存档里没有这几项了（新模型读不到才会走到这里）
  const img = baseImg[look.sex] || baseImg.m; if (!img) return null;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, c.width, c.height), k = MASK[look.sex] || MASK.m, mask = maskOf(id.data, c.width, k);
  /* 衣服、裤子按区域染（皮肤、头发的像素跳过），皮肤、头发按原图记下的位置染 */
  tintMasked(id.data, c.width, SHIRT, mask, L.shirt[look.shirt].hex, 1);
  tintMasked(id.data, c.width, PANTS, mask, L.pants[look.pants].hex, 0.85);
  recolor(id.data, mask, 1, k.skinL, L.skin[look.skin].hex);
  if (k.skin2) recolor(id.data, mask, 3, k.skin2L, L.skin[look.skin].hex);
  recolor(id.data, mask, 2, k.hairL, L.hair[look.hair].hex, look.sex === 'f' ? 0.8 : 0.7, 1.4);
  g.putImageData(id, 0, 0); return texFrom(c);
}
/* 换主角的样子（创建人物时一边选一边看） */
export function setLook(g, look, L) { useModel(g, look, L); if (g.userData.model === 'n' || g.userData.alt) return;   // 新模型（男女都是）：发型、发色、套装在 applyHero2 里做，不换贴图、不染衣服（设计 18q / 18v）
  const t = lookTexture(look, L); if (!t) return; g.traverse(o => { if (o.isMesh && o.material && o.material.map && !o.userData.keepMap) { const old = o.material.map; o.material.map = t; o.material.needsUpdate = true; if (old !== t && old !== skins.player) old.dispose() } }) }
export const ZOMBIE_POSE = { x: -1.25, y: 0, z: 0.15 };
export async function loadChars(dir = 'models/') {
  /* 设计 38：先读小的（Kenney 人物 + 皮肤图 + 旧主角 hero_m，一共不到 1 MB），新主角 hero_m2 由 main.js 接着单独读（loadHeroMain），
     这样网慢的时候顾客、丧尸和主角至少都是正常的人，不会是方块人 */
  const [gltf] = await Promise.all([loadGLB(dir + 'character.glb'), loadHeroFb(dir).catch(e => console.warn('旧主角没读到', e))]);
  base = gltf.scene; gltf.animations.forEach(c => { clips[c.name] = c });
  const [mB, fA, zA, zC] = await Promise.all(['survivorMaleB', 'survivorFemaleA', 'zombieA', 'zombieC'].map(n => loadImg(dir + n + '.png')));
  baseImg = { m: mB, f: fA };
  skins.zombieA = texFrom(zA); skins.zombieC = texFrom(zC);
  /* Retro 包：多 2 个普通人、2 个丧尸（加载失败也不影响） */
  const retro = await Promise.all(['humanMaleA', 'humanFemaleA', 'zombieMaleA', 'zombieFemaleA'].map(n => loadImg(dir + n + '.png').catch(() => null)));
  if (retro[2]) skins.zombieM = texFrom(retro[2]); if (retro[3]) skins.zombieF = texFrom(retro[3]);
  skins.player = variant(mB, 0xd9822b, 0x3b4252);                 // 主角：橙色外套
  const shirts = [0x4a7ab0, 0xb04a5a, 0x5a9a5a, 0xd0b050, 0x7a5aa0, 0x3a9a9a, 0xe0e0e0, 0x9a6a4a];
  const pants = [0x2a2a2a, 0x3b4f73, 0x8a7350, 0x4a4a4a];
  for (let i = 0; i < 8; i++) skins['cust' + i] = variant(i % 2 ? fA : mB, shirts[i], pants[i % 4], i % 2);
  const rs = [0x8a3a3a, 0x3a5a8a, null, 0x6a8a4a];
  for (let i = 0; i < 4; i++) { const im = retro[i % 2]; skins['cust' + (8 + i)] = im ? variant(im, rs[i], i > 1 ? 0x5a4a3a : null, false, true) : skins['cust' + i] }
}
export const charsReady = () => !!base;

/* 设计 30：共用材质（按贴图 + 颜色）和假影子 */
const matCache = new Map();
export function sharedMat(map, tint) { const k = map.uuid + ':' + tint; let m = matCache.get(k); if (!m) { m = new THREE.MeshLambertMaterial({ map }); m.color.setHex(tint); matCache.set(k, m) } return m }
/* 设计 67：脚下的圆影子（设计 30 / 57 的 InstancedMesh）整批不画、不建，改成压扁影子（flatshadow.js）。
   addBlob / syncBlobs 名字留着（尸潮、牧场、main.js 在用），里面换成压扁影子 */
export const addBlob = (g, force) => { if (force || perfOpt('shadow') || perfOpt('sshadow')) addFlat(g, { zombie: g.userData && g.userData.kind === 'zombie' }) };   // 从池子里拿回来重新放进场景的人物（尸潮丧尸）
/* 设计 57：假影子的软边圆片用 shader 算，比原来深一倍多（原来的画布贴图在石板地上几乎看不出来，人、动物都改用假影子以后要看得见）。half = 圆片半径，k = 深浅 */
export function blobMat(half, k = 1, xy = false) {
  const m = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -200 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vBl;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBl = position.' + (xy ? 'xy' : 'xz') + ' / ' + half.toFixed(3) + ';');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vBl;').replace('#include <opaque_fragment>', '{ float q = length(vBl); diffuseColor.a *= ' + k.toFixed(2) + ' * (q < 0.6 ? 0.42 - 0.2 * q / 0.6 : 0.22 * max(0.0, 1.0 - (q - 0.6) / 0.4)); }\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'blob' + half + k + xy;
  return m;
}
export function syncBlobs(scene, cam, center) { syncFlat(scene, cam, center) }
/* 生成一个人物：kind = player / zombie / cust；返回一个 Group，动画用 animChar 驱动 */
export function makeChar(kind, idx = 0) {
  const g = new THREE.Group();
  const m = cloneSkinned(base); m.scale.setScalar(SCALE);
  const zs = ['zombieA', 'zombieC', 'zombieM', 'zombieF'].filter(k => skins[k]);
  const skin = kind === 'zombie' ? skins[zs[idx % zs.length]] : kind === 'player' ? skins.player : skins['cust' + (idx % CUSTOMER_SKINS)];
  /* 设计 30：丧尸按皮肤共用材质（以前每个人一份，60 只丧尸 60 份）；主角、顾客、员工照旧一人一份 */
  const mat = kind === 'zombie' && perfOpt('mat') ? sharedMat(skin, 0xffffff) : new THREE.MeshLambertMaterial({ map: skin });
  const bones = {}, fake = (kind !== 'player' && perfOpt('shadow')) || perfOpt('sshadow'),   /* 设计 57：影子只画一次时主角也用假影子 */ cull = kind !== 'player' && perfOpt('cull');
  m.traverse(o => { if (o.isMesh) { o.material = mat; o.castShadow = !fake; o.frustumCulled = cull;
    if (cull && o.geometry && !o.geometry.userData.bigSphere) { o.geometry.computeBoundingSphere(); o.geometry.boundingSphere.radius *= 1.6; o.geometry.userData.bigSphere = 1 } }   // 包围球放大，动作伸出去不会被误裁掉闪一下
    if (o.isBone) bones[o.name] = o });
  g.add(m);
  if (fake) addFlat(g, { zombie: kind === 'zombie' });                       // 设计 67：不画真影子（不进影子图），画压扁影子（以前是脚下一个淡黑圆片）
  if (kind === 'player') {                                                   // 背包挂在胸口骨骼上
    /* 背包按「世界里的大小」来定（约 0.42×0.48×0.22 米），再换算成骨骼自己的单位。
       以前直接用了模型原始单位，背包大了 100 倍（几十米），镜头在箱子里面看不见，但它的大影子跟着人转。 */
    const bone = bones.UpperChest || bones.Chest || m, ws = new THREE.Vector3();
    g.updateMatrixWorld(true); bone.getWorldScale(ws);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.42 / ws.x, 0.48 / ws.y, 0.22 / ws.z), new THREE.MeshLambertMaterial({ color: 0x5b6b3a, flatShading: true }));
    pack.position.set(0, 0.04 / ws.y, -0.2 / ws.z); pack.castShadow = !perfOpt('sshadow'); bone.add(pack);
  }
  const mixer = new THREE.AnimationMixer(m), acts = {};
  for (const n of ['idle', 'run']) { acts[n] = mixer.clipAction(clips[n]); acts[n].play(); acts[n].setEffectiveWeight(n === 'idle' ? 1 : 0) }
  g.userData = { mixer, acts, bones, kind, last: -1, w: 0, phase: Math.random() };
  mixer.setTime(Math.random() * 2);
  if (kind === 'player' && (hero2Ready() || heroFbReady())) {
    const k = { m, mixer, acts, bones }, n = hero2Ready() ? makeHero2() : makeHeroFb(); g.add(n.root); n.root.visible = false;
    g.userData.alt = { k, n }; g.userData.model = 'k';
  }
  return g;
}
/* 主角切换模型：设计 18v 男女都用新模型（有的话），新模型没读到才用 Kenney */
export function useModel(g, look, L) {
  const a = g.userData.alt; if (!a) return;
  const want = 'n', M = a[want];
  a.k.m.visible = want === 'k'; a.n.root.visible = want === 'n';
  Object.assign(g.userData, { mixer: M.mixer, acts: M.acts, bones: M.bones, model: want, hm: want === 'n', hv: M.v });
  g.userData.h2M = want === 'n' ? a.n : null;
  if (want === 'n' && look && !a.n.fb) applyHero2(a.n, look);
}
/* V1.31 新主角（Q 版）读这里；设计 38：跟小的模型分开，main.js 先读完小的再读它 */
export const loadHeroMain = (dir = 'models/') => loadHero2(dir);
/* 设计 38：主角先用的旧模型（hero_m），新主角读完以后换上；换了返回 true */
export function upgradeHero(g, look, L) {
  const a = g && g.userData.alt; if (!a || !a.n.fb || !hero2Ready()) return false;
  const shown = a.n.root.visible; g.remove(a.n.root); a.n = makeHero2(); g.add(a.n.root); a.n.root.visible = false;
  if (shown) useModel(g, look || {}, L); return true;
}
/* t：游戏时钟（秒）；speed：当前移动速度 */
const _dir = new THREE.Vector3(), _a = new THREE.Vector3(), _q = new THREE.Quaternion();
/* 设计 57：看不到的人不更新动画（不在画面里）。设计 66：离主角 25 米以外的每秒更新 30 次（以前 15 次，跑动时远处的人一卡一卡）；25 米以内、画面里的每帧都动。main.js 每帧先 setAnimView */
const AV = { on: false, fr: new THREE.Frustum(), m: new THREE.Matrix4(), c: new THREE.Vector3(), sph: new THREE.Sphere(new THREE.Vector3(), 1.6), skip: null, n: 0, cut: 0 };
export function setAnimView(cam, center, skip) { AV.on = perfOpt('anim'); if (!AV.on) return; cam.updateMatrixWorld(); AV.m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); AV.fr.setFromProjectionMatrix(AV.m); AV.c.copy(center); AV.skip = skip }
export const animCut = () => AV;
export function animChar(g, t, speed) {
  const u = g.userData;
  if (AV.on && g !== AV.skip) { g.getWorldPosition(AV.sph.center); AV.sph.center.y += 0.9;
    if (!AV.fr.intersectsSphere(AV.sph)) return;
    if (u.last >= 0 && t - u.last < 0.03 && Math.hypot(AV.sph.center.x - AV.c.x, AV.sph.center.z - AV.c.z) > 25) return }
  const dt = u.last < 0 ? 0 : Math.min(0.1, t - u.last); u.last = t;
  const bk = speed < 0 ? -1 : 1; speed = Math.abs(speed);   // 设计 64：速度是负的 = 倒着走（动作倒放）
  if (u.hm) {   // 新模型：站 / 走 / 跑三个动作按速度混合，步子快慢跟着速度走
    /* 设计 18m：站 / 走 / 跑按速度切，0.18 秒过渡；播放速度 = 实际速度 ÷ 动作的地面速度（脚不打滑），太慢 / 太快时限一下（中间速度脚会稍微滑一点） */
    const A = u.acts, V = u.hv || { walk: 0.7, run: 4.7 }, w = speed < 0.2 ? 0 : speed < 1.6 ? 1 : 2; u.w3 = u.w3 || [1, 0, 0];
    for (let i = 0; i < 3; i++) { const tg = i === w ? 1 : 0, st = dt / 0.18; u.w3[i] += Math.max(-st, Math.min(st, tg - u.w3[i])) }
    A.idle.setEffectiveWeight(u.w3[0]); A.walk.setEffectiveWeight(u.w3[1]); A.run.setEffectiveWeight(u.w3[2]);
    A.walk.timeScale = bk * Math.min(2.2, Math.max(0.6, speed / V.walk)); A.run.timeScale = bk * Math.min(1.35, Math.max(0.75, speed / V.run));
    u.mixer.update(dt); if (u.h2M) hero2Tick(u.h2M, dt); return;
  }
  const want = speed > 0.2 ? 1 : 0; u.w += (want - u.w) * Math.min(1, dt * 10);
  u.acts.run.setEffectiveWeight(u.w); u.acts.idle.setEffectiveWeight(1 - u.w);
  const ref = u.kind === 'zombie' ? 2.2 : 5.2;                   // 跑步动作对应的移动速度
  u.acts.run.timeScale = bk * Math.max(0.45, speed / ref);
  u.mixer.update(dt);
  if (u.kind === 'zombie') {                                     // 丧尸：两只手臂朝正前方伸直，头歪着，身子摇晃
    const b = u.bones, s = Math.sin(t * 3 + u.phase * 6);
    g.updateMatrixWorld(true);
    const ry = g.rotation.y;
    for (const [arm, fore, k] of [[b.LeftArm, b.LeftForeArm, 1], [b.RightArm, b.RightForeArm, -1]]) {
      if (!arm || !fore || !arm.parent) continue;
      _dir.set(Math.sin(ry) + Math.cos(ry) * 0.12 * k, -0.25 + s * 0.08 * k, Math.cos(ry) - Math.sin(ry) * 0.12 * k).normalize();
      arm.parent.getWorldQuaternion(_q).invert(); _dir.applyQuaternion(_q);           // 世界方向 → 肩膀骨骼的坐标
      _a.copy(fore.position).normalize();                                              // 手臂骨骼本身朝哪个方向
      arm.quaternion.setFromUnitVectors(_a, _dir);
      fore.quaternion.identity();
    }
    if (b.Head) b.Head.rotation.z += 0.3;
    g.rotation.z = s * 0.05;
  }
}

/* ---------- 员工头像：加载页把每种顾客模型拍一张大头照（只拍一次，存成图片） ---------- */
export const PORTRAIT = { aim: 0.22, x: 0.25, y: 0.05, d: 2.6, fov: 24 };   // 镜头：对准头的哪里、往右/上偏多少、离多远
export function portraits(renderer, size = 192) {
  if (!base) return [];
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xfff4e6, 0x3a3f4a, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1.2, 2, 2.5); sc.add(key);
  const rim = new THREE.DirectionalLight(0xbfd8ff, 1.2); rim.position.set(-2, 1.5, -1.5); sc.add(rim);
  const cam = new THREE.PerspectiveCamera(PORTRAIT.fov, 1, 0.05, 20);
  const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace;
  const px = new Uint8Array(size * size * 4), cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g2 = cv.getContext('2d'), img = g2.createImageData(size, size), out = [];
  const oldRT = renderer.getRenderTarget(), oldC = new THREE.Color(), oldA = renderer.getClearAlpha(); renderer.getClearColor(oldC);
  const oldSh = renderer.shadowMap.enabled; renderer.shadowMap.enabled = false;
  renderer.setClearColor(0x000000, 0);
  for (let i = 0; i < CUSTOMER_SKINS; i++) {
    const g = makeChar('cust', i); g.userData.mixer.setTime(0.15); sc.add(g); g.updateMatrixWorld(true);
    const B = g.userData.bones, hp = new THREE.Vector3(0, 1.5, 0), he = new THREE.Vector3(0, 2.1, 0);
    if (B.Head) B.Head.getWorldPosition(hp); if (B.Head_end) B.Head_end.getWorldPosition(he); else he.copy(hp).y += 0.6;
    const look = hp.clone().lerp(he, PORTRAIT.aim);
    cam.position.set(look.x + PORTRAIT.x, look.y + PORTRAIT.y, look.z + PORTRAIT.d); cam.lookAt(look);
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(sc, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    g2.clearRect(0, 0, size, size); g2.putImageData(img, 0, 0); out.push(cv.toDataURL('image/png'));
    sc.remove(g); g.traverse(o => { if (o.isMesh) o.material.dispose() });
  }
  renderer.setRenderTarget(oldRT); renderer.setClearColor(oldC, oldA); renderer.shadowMap.enabled = oldSh; rt.dispose();
  return out;
}
