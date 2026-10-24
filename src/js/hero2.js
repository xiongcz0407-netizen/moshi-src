import { perfOpt } from './perf.js';
/* ================= 新男主角（设计 18c「定下来的做法」）=================
   一套「套装身体」（混元生成的穿着整套衣服的身体，整个直接用，设计 18q）+ 一颗发型头（头发 + 脸，换发型 = 换整颗头；标准头只当对齐的尺子，设计 18f）。
   骨骼和站 / 走 / 跑、头 / 发型 / 衣服的对齐是 tools/people3/hero.py 做的（设计 18f / 18g）；骨骼名字跟 Kenney 人物一样，端枪的代码照用。
   - 不做眨眼、表情、五官选项、脸型（用户 10-17：「面部的动作可以都没有」）。
   - 换颜色：只有头发（灰度 × 发根→发尾渐变）。套装整套直接用、颜色在生成时定好，游戏里不换色（设计 18q）。
   - 设计 18v：男女都用这个模型（新身体：头约占 30%、腿更长）；发型（几颗发型头）、套装男女都能选。
   - 肤色固定：身体皮肤 = 脸颊的肤色。所有遮罩都放顶点颜色，贴图不带透明通道（手机上透明处会变黑）。 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { loadGLB } from './assets.js';

export const HERO2 = {
  hair: [0x2a2624, 0x4a3426, 0x7a5236, 0x8e3f2a, 0xc8a578, 0xe8c66a, 0xb9bcc2, 0xf2efe8, 0xf0a3bd, 0x9a6ad0, 0x4f86d8, 0x4fae7a, 0xd0463c, 0x3a4a6a],
};
export const SKIN = 0xc19a7f;                 // 标准头贴图的肤色（中位数），身体皮肤调成一样
/* 设计 18v：男女都用新模型。默认搭配：男 = 男发型1 + 学院风蓝，女 = 女发型1 + 学院风粉；发型、套装男女都能选 */
export const DEF_LOOK = { m: { hs: 'm1', outfit: 'xy_blue' }, f: { hs: 'f1', outfit: 'xy_pink' } };
export const hero2Default = (sex = 'm') => ({ hc: 2, hc2: -1, ...(DEF_LOOK[sex] || DEF_LOOK.m) });
/* 套装、发型列表（读模型时从 GLB 里找出来：每套一个 Outfit_<id> 网格，每颗发型头一个 HairHead_<id> 网格） */
export const OUTFITS = [], HAIRS = [];
/* 设计 18l：近距离看主角的地方（创建人物、角色面板、以后的换装 / 试穿）都用这个固定角度：正面往右转 20°（脸朝画面右前方），相机平视，不给转到背面（看不到后颈） */
export const CLOSEUP_YAW = 20 * Math.PI / 180;

let base = null, clips = {};
const GAME_H = 2.0;                           // 主角在游戏里 2 米高（模型身高存在 Rig 的 top 里，设计 18v 新身体 1.178）
export async function loadHero2(dir = 'models/') {
  const g = await loadGLB(dir + 'people/hero_m2.glb');   // 带版本号：模型换了文件名不变，不带的话手机会一直用缓存里的旧模型（V1.81 的问题）
  base = g.scene; g.animations.forEach(c => { clips[c.name] = c });
}
export const hero2Ready = () => !!base;
/* 设计 38：新主角（hero_m2，约 1.6 MB）还没读完就要进游戏时，先用旧主角 hero_m.glb（约 0.3 MB，先读它）顶着，不用方块人；
   新主角读完了 chars.js 的 upgradeHero 换上。旧主角只有身体、头发、衣服 3 块，不能换发型、套装，用它自己的贴图 */
let fbBase = null; const fbClips = {};
export async function loadHeroFb(dir = 'models/') { const g = await loadGLB(dir + 'people/hero_m.glb'); fbBase = g.scene; g.animations.forEach(c => { fbClips[c.name] = c }) }
export const heroFbReady = () => !!fbBase;
export function makeHeroFb() {
  const root = cloneSkinned(fbBase), bones = {};
  root.traverse(o => { if (o.isBone) bones[o.name] = o; if (o.isMesh) { o.castShadow = !perfOpt('sshadow'); o.frustumCulled = false; o.userData.keepMap = true; o.material = new THREE.MeshLambertMaterial({ map: o.material.map || null }) } });
  const mixer = new THREE.AnimationMixer(root), acts = {};
  for (const n of ['idle', 'walk', 'run']) { const c = fbClips[n] || fbClips.idle; if (!c) continue; acts[n] = mixer.clipAction(c); acts[n].play(); acts[n].setEffectiveWeight(n === 'idle' ? 1 : 0) }
  const box = new THREE.Box3().setFromObject(root); root.scale.setScalar(GAME_H / Math.max(0.1, box.max.y - box.min.y));
  return { root, mixer, acts, bones, meshes: {}, outfits: {}, hairs: {}, hm: true, h2: {}, v: { walk: 0.7, run: 4.7 }, fb: true };
}

/* ---------- 材质：平滑 PBR + 法线贴图 + 一点环境反射（只给主角，不用三档色阶） ---------- */
const WARM = '\n  reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.10, 0.05, 0.03);\n';   // 阴影偏暖、不发灰
let ENV = null;
export function initHero2Env(renderer) { try { const pm = new THREE.PMREMGenerator(renderer); ENV = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose() } catch (e) { ENV = null } }
/* 遮罩（皮肤区、头发、内壁…）放在模型的顶点颜色里，读进来以后改名成 aMask：材质不开 vertexColors，
   这样不管哪段代码、哪个手机，都不会把遮罩当颜色乘到贴图上（乘上去就是全身红 / 黑） */
const MASK_V = 'attribute vec4 aMask; varying vec4 vMask;\n', MASK_F = 'varying vec4 vMask;\n';
const maskVS = vs => MASK_V + vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n vMask = aMask;');
function pbr(map, extra) {
  const m = new THREE.MeshStandardMaterial({ map, roughness: extra.rough ?? 0.85, metalness: 0, envMap: ENV, envMapIntensity: extra.env ?? 0.35, side: extra.side ?? THREE.FrontSide });
  m.userData.u = extra.uniforms; m.customProgramCacheKey = () => extra.key;
  m.onBeforeCompile = sh => { Object.assign(sh.uniforms, extra.uniforms); extra.patch(sh) };
  return m;
}
/* 身体：顶点颜色 R = 皮肤（涂成固定肤色，= 脸颊的颜色），B = 衣服下面看不到的腰腿（涂暗）；贴图不带透明通道 */
function bodyMat(map) {   // 套装：aMask R = 皮肤区（换成脸的肤色），G = 下巴底下脖子的影子，B = 开口内壁（衣服色 × 0.8）
  return pbr(map, { key: 'h2body', rough: 0.7, env: 0.45, side: THREE.DoubleSide, uniforms: { uSkin: { value: new THREE.Color(SKIN) }, uRim: { value: new THREE.Color(0xb0b0b0) } }, patch: sh => {
    sh.vertexShader = maskVS(sh.vertexShader);
    sh.fragmentShader = MASK_F + 'uniform vec3 uSkin; uniform vec3 uRim;\n' + sh.fragmentShader.replace('#include <map_fragment>',
      'vec4 tx = texture2D( map, vMapUv );\n diffuseColor.rgb *= mix( tx.rgb, uSkin, vMask.r );\n diffuseColor.rgb *= 1.0 - 0.35 * vMask.g * vMask.g;\n diffuseColor.rgb = mix( diffuseColor.rgb, uRim, vMask.b );')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n if ( !gl_FrontFacing ) totalEmissiveRadiance += diffuseColor.rgb * 0.45;\n totalEmissiveRadiance += uRim * 0.35 * vMask.b;')   // 衣服里面（袖口、领口内壁）亮一点，不发黑（18s）
      .replace('#include <color_fragment>', '').replace('#include <aomap_fragment>', '#include <aomap_fragment>' + WARM);
  } });
}
/* 发型头（头发 + 脸一整颗，设计 18f）：顶点颜色 R = 头发遮罩（不放贴图透明通道：手机 Safari / 微信会把透明处的颜色变黑，脸就全黑了）；头发 = 灰度（已去杂色、压到窄范围，设计 18j）× 发根→发尾渐变 + 头顶一圈高光带，脸不染 */
function hairHeadMat(map) {
  return pbr(map, { key: 'h2hh', rough: 0.7, env: 0.45, side: THREE.DoubleSide,
    uniforms: { uBack: { value: new THREE.Color(SKIN) }, uRoot: { value: new THREE.Color(0x7a5236) }, uTip: { value: new THREE.Color(0x7a5236) }, uY: { value: new THREE.Vector2(0.72, 1.25) } }, patch: sh => {
      sh.vertexShader = 'varying float vHY; varying float vNY;\n' + maskVS(sh.vertexShader).replace('#include <begin_vertex>', '#include <begin_vertex>\n vHY = position.y; vNY = normal.y;');
      sh.fragmentShader = MASK_F + 'uniform vec3 uBack; uniform vec3 uRoot; uniform vec3 uTip; uniform vec2 uY; varying float vHY; varying float vNY;\n' + sh.fragmentShader.replace('#include <map_fragment>',
        `vec4 tx = texture2D( map, vMapUv ); float hm = vMask.r;   // aMask R = 头发
         float g = clamp( ( dot( tx.rgb, vec3( 0.3, 0.59, 0.11 ) ) - 0.55 ) / 0.45, 0.0, 1.0 );   // 贴图里头发灰度已经去杂色、压到 0.55～1
         float k = clamp( ( uY.y - vHY ) / ( uY.y - uY.x ), 0.0, 1.0 );
         vec3 hc = mix( uRoot, uTip, smoothstep( 0.1, 0.95, k ) );
         diffuseColor.rgb *= mix( tx.rgb, hc * ( 0.72 + 0.4 * g ), hm );
         float ug = vMask.g;   // aMask G = 下巴底下朝下的那一圈
         if ( hm < 0.5 ) diffuseColor.rgb = mix( diffuseColor.rgb, uBack, gl_FrontFacing ? ug : 1.0 );   // 下巴底下（朝下的面，贴图里烘焙成深色）和头底开口里面涂肤色，不是一条黑缝（18s）`)
        .replace('#include <color_fragment>', '')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix( roughnessFactor, 0.38, hm );')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n float band = exp( -pow( ( normal.y - 0.42 ) / 0.13, 2.0 ) ) * hm;\n totalEmissiveRadiance += mix( hc, vec3( 1.0 ), 0.55 ) * band * 0.22;')   // 光泽靠材质的高光带（头顶一圈），不靠贴图亮斑
        .replace('#include <aomap_fragment>', '#include <aomap_fragment>' + WARM +
          '  float rim = pow( 1.0 - clamp( abs( dot( normalize( vNormal ), normalize( vViewPosition ) ) ), 0.0, 1.0 ), 3.0 );\n  reflectedLight.indirectDiffuse += mix( hc, vec3( 1.0 ), 0.3 ) * rim * 0.35 * hm;\n');
    } });
}

/* ---------- 做一个人 ---------- */
export function makeHero2() {
  const root = cloneSkinned(base);
  const bones = {}, meshes = {}, outfits = {}, hairs = {};
  root.traverse(o => {
    if (o.isBone) bones[o.name] = o;
    if (!o.isMesh) return;
    const ud = { ...((o.parent && o.parent.userData) || {}), ...o.userData };   // 先读模型里带的信息（套装 id、肤色、内壁色），再改 userData
    o.castShadow = !perfOpt('sshadow'); o.frustumCulled = false; o.userData.keepMap = true;
    const g = o.geometry; if (g.attributes.color && !g.attributes.aMask) { g.setAttribute('aMask', g.attributes.color); g.deleteAttribute('color') }   // 遮罩改名，不当顶点颜色
    if (!g.attributes.aMask) g.setAttribute('aMask', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 4), 4));
    const n = o.name.replace(/_\d+$/, ''), map = o.material.map, nrm = o.material.normalMap;
    if (/HairHead/.test(n)) {   // 每颗发型头带自己的肤色（脸颊的颜色），选这颗头时身体皮肤区跟着换
      o.material = hairHeadMat(map); if (ud.skin) o.material.userData.u.uBack.value.set(ud.skin); if (ud.hy0) o.material.userData.u.uY.value.set(ud.hy0, ud.hy1);
      const id = ud.hair || n.replace(/^HairHead_?/, '') || 'm1'; hairs[id] = o; o.userData.skin = ud.skin; o.userData.sex = ud.sex || '';
      if (!HAIRS.find(x => x.id === id)) HAIRS.push({ id, name: ud.hair_name || id, sex: ud.sex || '' });
    }
    else if (/Outfit/.test(n)) {   // 设计 18q：套装整套直接用、不换色；只有皮肤区（顶点颜色 R）换成脸的肤色
      o.material = bodyMat(map); if (ud.skin) o.material.userData.u.uSkin.value.set(ud.skin); if (ud.rim) o.material.userData.u.uRim.value.set(ud.rim);   // B = 开口内壁 → 衣服色 × 0.8
      const id = ud.outfit || n.replace(/^Outfit_?/, ''); outfits[id] = o; o.userData.sex = ud.sex || ''; if (!OUTFITS.find(x => x.id === id)) OUTFITS.push({ id, name: ud.outfit_name || id, sex: ud.sex || '' });
    }
    if (nrm) { o.material.normalMap = nrm; o.material.normalScale.set(0.8, 0.8) }
  });
  HAIRS.sort((a, b) => (a.sex === 'f') - (b.sex === 'f') || a.id.localeCompare(b.id));   // 男发型在前
  meshes.hair = Object.values(hairs)[0];
  const mixer = new THREE.AnimationMixer(root), acts = {};
  for (const n of ['idle', 'walk', 'run']) { acts[n] = mixer.clipAction(clips[n]); acts[n].play(); acts[n].setEffectiveWeight(n === 'idle' ? 1 : 0) }
  let rv = {}; root.traverse(o => { if (o.userData && o.userData.v_run) rv = o.userData });
  const v = { walk: rv.v_walk || 0.7, run: rv.v_run || 4.7 };            // 动作对应的地面速度（hero.py 按着地那只脚往后扫的速度算的，已经是游戏单位），播放速度 = 实际速度 ÷ 这个 → 脚不打滑
  root.scale.setScalar(GAME_H / (rv.top || 1.152));
  return { root, mixer, acts, bones, meshes, outfits, hairs, hm: true, h2: {}, v };
}
/* 设计 18v：发型、套装分男女（配置里标了性别）。只列这个性别的；没标性别的男女都能用 */
export const hairsFor = sex => HAIRS.filter(x => !x.sex || x.sex === (sex === 'f' ? 'f' : 'm'));
export const outfitsFor = sex => OUTFITS.filter(x => !x.sex || x.sex === (sex === 'f' ? 'f' : 'm'));
/* 读旧存档、随机：发型 / 套装跟性别对不上（或模型里没有）→ 换成这个性别的默认搭配，发色不动 */
export function fixLookSex(look) {
  if (!look || !HAIRS.length) return look;
  const d = hero2Default(look.sex), o = { ...look };
  if (!hairsFor(o.sex).find(x => x.id === o.hs)) o.hs = d.hs;
  if (!outfitsFor(o.sex).find(x => x.id === o.outfit)) o.outfit = d.outfit;
  return o;
}
/* 选中的发型 / 套装 id（存档里没有或模型里没有 → 按男女的默认，再没有就第一个） */
export function pickHair(M, look) { const d = hero2Default(look && look.sex); const ids = Object.keys(M.hairs); return M.hairs[look && look.hs] ? look.hs : M.hairs[d.hs] ? d.hs : ids[0] }
export function pickOutfit(M, look) { const d = hero2Default(look && look.sex); const ids = Object.keys(M.outfits); return M.outfits[look && look.outfit] ? look.outfit : M.outfits[d.outfit] ? d.outfit : ids[0] }
/* 换样子：发型（换整颗发型头）、发色（发根 / 发尾）、套装（设计 18q：显示选中的那一套，其他藏起来；套装不换色）。
   套装的皮肤区涂成选中那颗头的脸颊肤色 */
export function applyHero2(M, look) {
  const h = { ...hero2Default(look && look.sex), ...look }, root = HERO2.hair[h.hc] ?? HERO2.hair[2];
  const hs = pickHair(M, h), of = pickOutfit(M, h);
  for (const id in M.hairs) M.hairs[id].visible = id === hs;
  const hh = M.hairs[hs]; M.meshes.hair = hh;
  if (hh) { const u = hh.material.userData.u; u.uRoot.value.setHex(root); u.uTip.value.setHex(h.hc2 >= 0 ? HERO2.hair[h.hc2] ?? root : root) }
  for (const id in M.outfits) { const o = M.outfits[id]; o.visible = id === of; if (hh && hh.userData.skin) o.material.userData.u.uSkin.value.set(hh.userData.skin) }
}
/* 设计 18l 最新版：角色展示用人物（创建人物、改外观、角色面板、头像都用它）。
   单独一个新模型：只有发型头、发色、套装、骨骼和待机动作；不挂任何手持物品，不受游戏里主角状态影响；固定正面往右 20°，不能转 */
export function makeShowcase() {
  if (!base) return null;
  const M = makeHero2(); M.root.rotation.y = CLOSEUP_YAW;
  for (const n in M.acts) M.acts[n].setEffectiveWeight(n === 'idle' ? 1 : 0);
  M.root.traverse(o => { if (o.isMesh) o.castShadow = true });
  return { root: M.root, M, set(look) { applyHero2(M, look) }, update(dt) { M.root.rotation.y = CLOSEUP_YAW; M.mixer.update(dt) } };
}
/* 面部动作不做了（设计 18c）；留着空函数，别处调用不出错 */
export function hero2Expr() {}
export function hero2Tick() {}

/* 套装缩略图（设计 18q：创建人物的套装页是一排缩略图，每张就是那套的样子）：用游戏的渲染器离屏拍一次，存成图片。
   固定近景角度（正面往右 20°、平视，设计 18l），站着、空手；头按当前发型、发色拍 */
const THUMBS = {};
export function outfitThumbs(renderer, look, size = 128) {
  if (!base) return {};
  const key = JSON.stringify([look.hc, look.hc2, look.hs, look.sex]); if (THUMBS._k === key) return THUMBS;
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xfff4e6, 0x3a3f4a, 1.7));
  const d = new THREE.DirectionalLight(0xffffff, 2.0); d.position.set(1.2, 2, 2.5); sc.add(d);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 30); cam.position.set(0, 1.0, 4.6); cam.lookAt(0, 1.0, 0);
  const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace;
  const px = new Uint8Array(size * size * 4), cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g2 = cv.getContext('2d'), img = g2.createImageData(size, size);
  const oldRT = renderer.getRenderTarget(), oldC = new THREE.Color(), oldA = renderer.getClearAlpha(); renderer.getClearColor(oldC);
  const oldSh = renderer.shadowMap.enabled; renderer.shadowMap.enabled = false; renderer.setClearColor(0x000000, 0);
  const M = makeHero2(); M.root.rotation.y = CLOSEUP_YAW; sc.add(M.root); M.mixer.update(0);
  for (const id of Object.keys(M.outfits)) {
    applyHero2(M, { ...look, outfit: id }); M.root.updateMatrixWorld(true);
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(sc, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    g2.clearRect(0, 0, size, size); g2.putImageData(img, 0, 0); THUMBS[id] = cv.toDataURL('image/png');
  }
  M.root.traverse(o => { if (o.isMesh) o.material.dispose() });
  renderer.setRenderTarget(oldRT); renderer.setClearColor(oldC, oldA); renderer.shadowMap.enabled = oldSh; rt.dispose();
  THUMBS._k = key; return THUMBS;
}

/* 新男主角的头像（左上角、创建人物页角落的小头像）：用模型离屏拍，固定近景角度（正面往右 20°、平视，设计 18l），只拍头和肩。
   按发色、套装缓存，换了才重拍 */
const PORTRAITS = {};
export function heroPortrait(renderer, look, size = 128) {
  if (!base) return null;
  const h = { ...hero2Default(look && look.sex), ...look }, key = [h.sex, h.hs, h.hc, h.hc2, h.outfit, size].join('|'); if (PORTRAITS[key]) return PORTRAITS[key];
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xfff4e6, 0x3a3f4a, 1.7));
  const d = new THREE.DirectionalLight(0xffffff, 2.0); d.position.set(1.2, 2, 2.5); sc.add(d);
  const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 30); cam.position.set(0, 1.64, 2.1); cam.lookAt(0, 1.62, 0);   // 设计 18v：头约占全身 30%，头在 1.4～2.0 米
  const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace;
  const px = new Uint8Array(size * size * 4), cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g2 = cv.getContext('2d'), img = g2.createImageData(size, size);
  const oldRT = renderer.getRenderTarget(), oldC = new THREE.Color(), oldA = renderer.getClearAlpha(); renderer.getClearColor(oldC);
  const oldSh = renderer.shadowMap.enabled; renderer.shadowMap.enabled = false; renderer.setClearColor(0x000000, 0);
  const M = makeHero2(); M.root.rotation.y = CLOSEUP_YAW; sc.add(M.root); M.mixer.update(0); applyHero2(M, h); M.root.updateMatrixWorld(true);
  renderer.setRenderTarget(rt); renderer.clear(); renderer.render(sc, cam); renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
  for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  g2.putImageData(img, 0, 0);
  M.root.traverse(o => { if (o.isMesh) o.material.dispose() });
  renderer.setRenderTarget(oldRT); renderer.setClearColor(oldC, oldA); renderer.shadowMap.enabled = oldSh; rt.dispose();
  return (PORTRAITS[key] = cv);
}
