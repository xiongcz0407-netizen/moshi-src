/* ================= 设计 81：副本第 2 关——毒囊 + 毒雾断崖（画面） =================
   战斗的数、招式在 fbcore.js（TOX_CFG）；这里建场地（台地、三面断崖、崖下流动的毒雾海、南边破铁桥、4 个掩体）、毒囊（骨骼动作 + 头跟着主角转 + 头上的特效）、
   每个招式的特效、毒池 / 毒雾 / 脓包的样子。fb.js 进第 2 关时用这里给的 hooks。 */
import * as THREE from 'three';
import { TOX_ANIM } from './fbcore.js';
import * as FC from './fbcore.js';
import { makeFog } from './fbfog.js';

const D = Math.PI / 180, hyp = Math.hypot, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const TOX_ASSETS = ['fb2/toxic', 'fb2/bridge', 'fb2/cover_rock', 'fb2/cover_pipe', 'fb2/cover_stump', 'fb2/barrels', 'fb2/pus', 'fb/rock_1', 'fb/rock_2', 'fb/rock_3', 'fb/chest_1', 'fb/chest_2'];
export const TOX_SKIN = [0.44, 0.52, 0.34];   // 设计 84：皮肤乘这个颜色（线性空间）：亮度降约 20%、偏橄榄绿；原贴图不动
export const TOX_SCALE = 12;              // 毒囊.glb 高 0.55 → 露出来的上半身约 6.6 米（主角 4 倍左右）
/* 设计 89：毒囊关镜头跟第 1 关一样（fb.js 的 camOff0、CAM_N、原 fov），81 的 TOX_CAM 不用了 */

/* 模型里的点（Blender 坐标：x 左右、y 前后（-y 朝前）、z 上）→ 模型本地坐标（three：x, z, -y） */
const B2T = (x, y, z) => new THREE.Vector3(x, z, -y);

export function buildTox(api) {
  const { scene, g, T, tex, place, part, mark, dust, rocks, shock, glowTex, glowSprite, flatGeo, ADD, ctx, ARENA, COVERS } = api;
  const G = glowTex();
  Object.assign(T, {
    plateau: tex('img/fb2/tex_plateau.jpg', [3, 8]), mist: tex('img/fb2/tex_mist.jpg', [9, 9]), mist2: tex('img/fb2/tex_mist.jpg', [5, 5]), cliff2: tex('img/fb/tex_cliff.jpg', [1, 1]),
    fx: Object.fromEntries(['bolt', 'spray', 'pop', 'drops', 'cloud', 'wisp', 'wall', 'bubbles'].map(k => [k, tex(`img/fb2/fx_${k}.png`)])),
    mk: Object.fromEntries(['puddle', 'pool', 'acid', 'corrode', 'crater'].map(k => [k, tex(`img/fb2/mark_${k}.png`)])),
  });
  T.mist2.wrapS = T.mist2.wrapT = THREE.RepeatWrapping;
  scene.background = new THREE.Color(0x26302a); scene.fog = new THREE.Fog(0x3a4636, 34, 90);
  const hemi = new THREE.HemisphereLight(0xe6eed8, 0x3c4a32, 1.25); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.75); sun.position.set(-9, 20, 8); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 28, bottom: -28, near: 1, far: 70 }); sun.target.position.set(0, 0, 2); scene.add(sun, sun.target);
  const X0 = ARENA.x0, X1 = ARENA.x1, Z0 = ARENA.z0, Z1 = ARENA.z1;   // 开场时的场地（半血以后两边会收，但台地本身不变）

  /* ---------- 台地：竖长条，台地岩石贴图 ---------- */
  const W0 = X1 - X0 + 0.7, L0 = Z1 - Z0 + 0.7;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W0, L0), new THREE.MeshLambertMaterial({ map: T.plateau })); ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, (Z0 + Z1) / 2); ground.receiveShadow = true; scene.add(ground);
  /* 崖壁：代码做（起伏的岩壁往下 10 米，越往下越往外），贴山崖岩石 */
  const cliffMat = new THREE.MeshLambertMaterial({ map: T.cliff2, side: THREE.DoubleSide, color: 0x9a9488 });
  function wall(len, h, seed) {
    const geo = new THREE.PlaneGeometry(len, h, Math.max(8, Math.round(len * 1.6)), 10), pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) { const u = pos.getX(i), v = -pos.getY(i) + h / 2;   // v：从崖边往下的深度
      const n = Math.sin(u * 0.9 + seed) * 0.45 + Math.sin(u * 2.3 + v * 0.7 + seed * 2) * 0.3 + Math.sin(v * 1.9 + u * 0.4) * 0.22, out = v * 0.22 + n * Math.min(1, v / 1.2);
      pos.setXYZ(i, u, -v, out); uv.setXY(i, (u + seed * 3) / 4, -v / 4) }
    geo.computeVertexNormals(); const m = new THREE.Mesh(geo, cliffMat); m.receiveShadow = true; return m;
  }
  { const L = L0 + 2, h = 11;
    for (const sd of [-1, 1]) { const w = wall(L, h, sd * 3); w.rotation.y = sd > 0 ? Math.PI / 2 : -Math.PI / 2; w.position.set(sd * (W0 / 2), 0, (Z0 + Z1) / 2); scene.add(w) }
    const wn = wall(W0 + 2, h, 7); wn.rotation.y = Math.PI; wn.position.set(0, 0, Z0 - 0.35); scene.add(wn);
    for (const sx of [-1, 1]) { const ws = wall(W0 / 2 - 2.6, h, 11 + sx); ws.position.set(sx * (W0 / 4 + 1.3), 0, Z1 + 0.35); scene.add(ws) } }
  /* 崖边摆山崖石块（埋下去一截，只露个头，把直边打碎）；对面远处也是崖壁 */
  for (const sd of [-1, 1]) for (let i = 0; i < 5; i++) { const k = 'rock_' + (1 + (i + (sd > 0 ? 1 : 0)) % 3); place(g, k, 2.4 + Math.random() * 1.6, sd * (W0 / 2 + 0.25 + Math.random() * 0.3), -1.1, Z0 + 3 + i * 8 + Math.random() * 3, Math.random() * 6) }
  for (const [x, z, s] of [[-W0 / 2 - 0.2, Z0 + 0.2, 2.6], [W0 / 2 + 0.2, Z0 + 0.4, 2.8], [-W0 / 2 - 0.1, Z1 - 0.3, 2.2], [W0 / 2 + 0.1, Z1 - 0.2, 2.4]]) place(g, 'rock_' + (1 + Math.floor(Math.random() * 3)), s, x, -1.0, z, Math.random() * 6);
  { const far = (len, h, x, z, ry, seed) => { const w = wall(len, h, seed); w.position.set(x, 6, z); w.rotation.y = ry; scene.add(w) };
    far(90, 22, -26, 0, Math.PI / 2, 21); far(90, 22, 26, 0, -Math.PI / 2, 23); far(70, 22, 0, -52, 0, 25) }
  /* 南边：对岸一小块地 + 破铁桥接进台地（桥下也是毒雾） */
  { const far = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshLambertMaterial({ map: T.plateau })); far.rotation.x = -Math.PI / 2; far.position.set(0, 0, Z1 + 21); far.receiveShadow = true; scene.add(far);
    const wf = wall(40, 11, 31); wf.rotation.y = Math.PI; wf.position.set(0, 0, Z1 + 11.2); scene.add(wf);
    const br = place(g, 'bridge', 8.6, 0, -0.35, Z1 + 5.5, 0); br.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } }) }
  /* 崖下毒雾海：两层反向慢慢流，下层不透明、上层半透明 */
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshBasicMaterial({ map: T.mist, color: 0x6a8058 }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -8.5; scene.add(sea); T.mist.repeat.set(16, 16);
  const sea2 = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshBasicMaterial({ map: T.mist2, color: 0xa8c888, transparent: true, opacity: 0.4, depthWrite: false }));
  sea2.rotation.x = -Math.PI / 2; sea2.position.y = -6.6; sea2.renderOrder = 1; scene.add(sea2); T.mist2.repeat.set(9, 9);
  /* 掩体：裂石、断管道、枯树桩、毒桶堆 */
  for (const c of COVERS) {
    const o = c.k === 'rock' ? place(g, 'cover_rock', 5.0, c.x, 0, c.z, 0.4) : c.k === 'pipe' ? place(g, 'cover_pipe', 5.2, c.x, 0, c.z, Math.PI / 2 + 0.08)
      : c.k === 'stump' ? place(g, 'cover_stump', 4.6, c.x, 0, c.z, 1.1) : place(g, 'barrels', 3.7, c.x, 0, c.z, -0.5);
    o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } });
  }
  /* 装饰贴花：小毒水滩、被腐蚀的地面（不伤人）；两只手扒的地方抓出裂纹 */
  const deco = (map, x, z, s, op = 0.92, glow = false) => { const m = new THREE.Mesh(flatGeo, glow ? new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, opacity: op, color: 0xd8f0c0 }) : new THREE.MeshLambertMaterial({ map, transparent: true, depthWrite: false, opacity: op, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    m.scale.set(s, 1, s); m.rotation.y = Math.random() * 6.28; m.position.set(x, 0.014, z); m.renderOrder = 1; scene.add(m); return m };
  const free = (x, z, r) => COVERS.every(c => Math.abs(x - c.x) > c.hx + r || Math.abs(z - c.z) > c.hz + r);
  for (let i = 0, n = 0; i < 60 && n < 11; i++) { const x = X0 + 1 + Math.random() * (X1 - X0 - 2), z = Z0 + 4 + Math.random() * (Z1 - Z0 - 6); if (!free(x, z, 1.2)) continue; n++; n % 2 ? deco(T.mk.puddle, x, z, 1.1 + Math.random() * 0.9, 0.85, true) : deco(T.mk.corrode, x, z, 1.6 + Math.random() * 1.2, 0.75) }
  for (const sx of [-1, 1]) { deco(T.mk.corrode, sx * 5.0, Z0 + 1.3, 3.4, 0.8); deco(T.mk.crater, sx * 4.6, Z0 + 0.9, 2.6, 0.7) }

  /* ---------- 毒囊：上半身扒在北边崖边，腰以下藏在毒雾里 ---------- */
  const boss = new THREE.Group(); const bm = g.toxic.scene; bm.scale.setScalar(TOX_SCALE); boss.add(bm); scene.add(boss);
  const BZ = ARENA.boss.z; boss.position.set(ARENA.boss.x, -0.36, BZ);
  const U = { pus: { value: 0.35 }, rage: { value: 0 }, hit: { value: 0 }, skin: { value: new THREE.Vector3(...TOX_SKIN) } };
  const mats = [];
  bm.traverse(c => { if (!c.isMesh) return; const old = c.material; c.material = new THREE.MeshLambertMaterial({ map: old.map }); old.dispose(); c.frustumCulled = false; c.castShadow = true; c.receiveShadow = false;
    c.material.emissive = new THREE.Color(0); mats.push(c.material);
    /* 身上的脓包（贴图里黄绿色那些点）一明一暗发光；狂暴时身上淡淡一层红 */
    c.material.onBeforeCompile = sh => { Object.assign(sh.uniforms, { uPus: U.pus, uRage: U.rage, uSkin: U.skin });
      sh.fragmentShader = 'uniform float uPus, uRage; uniform vec3 uSkin;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n float pusY = smoothstep(0.20, 0.40, (diffuseColor.r + diffuseColor.g) * 0.5 - diffuseColor.b);')
        /* 设计 84：① 手臂、手（离中线 0.2 以外）一律换成身上的灰绿色调（亮度照留）：贴图里手的部分偏土黄，乘了橄榄绿以后发黄（84c）；褐色大块（手臂内侧、手心）再提亮；② 皮肤深一点、偏橄榄绿（脓包、滴液不动）；
           ③ 朝着镜头的面补一点光（手举起来背着太阳时不会变成一只深褐色的手） */
        .replace('float pusY = smoothstep(0.20, 0.40, (diffuseColor.r + diffuseColor.g) * 0.5 - diffuseColor.b);', 'float pusY = smoothstep(0.20, 0.40, (diffuseColor.r + diffuseColor.g) * 0.5 - diffuseColor.b);\n vec3 c0 = diffuseColor.rgb; float lum = dot(c0, vec3(0.3, 0.59, 0.11));\n float warm = smoothstep(-0.005, 0.03, c0.r - c0.g) * (1.0 - pusY);\n float lumT = mix(lum, clamp(lum * 1.9, 0.06, 0.3), warm);\n c0 = mix(c0, lumT * vec3(0.92, 1.077, 0.80), vArm * (1.0 - pusY));\n diffuseColor.rgb = mix(c0 * uSkin, diffuseColor.rgb, pusY);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(0.62, 0.95, 0.12) * pusY * uPus + vec3(0.42, 0.04, 0.02) * uRage + diffuseColor.rgb * (0.04 + 0.3 * vArm) * max(0.0, normal.z);');
      sh.vertexShader = 'varying float vArm;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vArm = smoothstep(0.2, 0.26, abs(position.x));');
      sh.fragmentShader = 'varying float vArm;\n' + sh.fragmentShader } });
  const mixer = new THREE.AnimationMixer(bm), acts = {};
  for (const clip of g.toxic.animations) { const a = mixer.clipAction(clip); if (!(TOX_ANIM[clip.name] || {}).loop) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true } acts[clip.name] = a }
  /* 腰下面接一截身子沉进毒雾里（模型底下是平切的，不接会看到空的）+ 腰上一圈毒雾 */
  { const low = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 1.8, 9.5, 18, 1, true), new THREE.MeshLambertMaterial({ color: 0x3e4a30 })); low.scale.set(1.3, 1, 1); low.position.set(0, -4.9, BZ - 0.7); scene.add(low) }
  const waist = []; for (let i = 0; i < 9; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.fx.cloud, color: 0xc4dc9a, transparent: true, opacity: 0.5, depthWrite: false })); const a = i / 9 * Math.PI * 2;
    s.userData = { a, r: 3.6 + Math.random() * 1.2, y: -0.9 + Math.random() * 0.7, ph: Math.random() * 6, sz: 3.6 + Math.random() * 1.6 }; scene.add(s); waist.push(s) }
  /* 骨头 */
  const bone = {}; bm.traverse(c => { if (c.isBone) bone[c.name] = c });
  boss.updateMatrixWorld(true);
  const onBone = (name, p, obj) => { const b = bone[name]; const w = bm.localToWorld(p.clone()); obj.position.copy(b.worldToLocal(w)); b.add(obj); return obj };
  const ws = 1 / TOX_SCALE;   // 挂在骨头上的东西要除掉模型的放大
  /* 眼睛：黄绿色发光（柔光球），一明一暗慢慢呼吸 */
  const eyes = [-1, 1].map(sx => { const s = glowSprite(G.ball, 0xd6ff3a, 0.95); s.scale.setScalar(0.55 * ws); s.renderOrder = 6; return onBone('Head', B2T(sx * 0.035, -0.07, 0.483), s) });
  const eyeCore = [-1, 1].map(sx => { const s = glowSprite(G.star, 0xf4ff9a, 0.8); s.scale.setScalar(0.42 * ws); s.renderOrder = 7; return onBone('Head', B2T(sx * 0.035, -0.072, 0.483), s) });
  /* 红眼珠用的圆点（带透明，正常混合；叠加的光在绿皮肤、绿雾上会变成黄色） */
  const redDot = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.75, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t })();
  const eyeRed = [-1, 1].map(sx => { const s = glowSprite(redDot, 0xff1808, 0); s.material.blending = THREE.NormalBlending; s.material.depthTest = false; s.scale.setScalar(0.34 * ws); s.renderOrder = 20; return onBone('Head', B2T(sx * 0.035, -0.074, 0.483), s) });   // 设计 84
  const mouthC = [-1, 1].map(sx => onBone('Jaw', B2T(sx * 0.028, -0.07, 0.405), new THREE.Object3D()));
  const mouth = onBone('Jaw', B2T(0, -0.08, 0.415), new THREE.Object3D());
  const throat = onBone('Neck', B2T(0, -0.06, 0.39), glowSprite(G.ball, 0x9cff3a, 0)); throat.scale.setScalar(2.2 * ws);
  const chestP = onBone('Chest', B2T(0, -0.12, 0.30), new THREE.Object3D());
  const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _a = new THREE.Vector3();
  const wpos = o => o.getWorldPosition(new THREE.Vector3());
  const headTop = () => bone.Head.getWorldPosition(_v).y + 0.13 * TOX_SCALE;   // 头骨长 0.13 × 12 ≈ 1.56 米：头骨根往上到头顶

  /* ---------- 动作 ---------- */
  let curAct = null;
  function play(name, ts = 1, fade = 0.25) {
    const a = acts[name]; if (!a) return;
    if (curAct === a) { a.timeScale = ts; if (!(TOX_ANIM[name] || {}).loop) { a.reset(); a.play() } return }
    a.reset(); a.timeScale = ts; a.setEffectiveWeight(1); a.play(); if (curAct) curAct.crossFadeTo(a, name === 'bolt_spit' ? 0.08 : fade, false); curAct = a;
  }
  /* ---------- 头：技能空档里跟着主角转（有重量：弹簧慢慢跟、停下稍微过头再回来），放技能时交给技能动作，放完 0.3 秒转回来 ---------- */
  const look = { yaw: 0, pitch: 0, vy: 0, vp: 0, w: 0 };
  function rotWorld(b, axis, ang) {
    if (!b || !ang) return; b.parent.getWorldQuaternion(_p); _q.setFromAxisAngle(axis, ang);
    const pi = _p.clone().invert(); b.quaternion.premultiply(pi.multiply(_q).multiply(_p)); b.updateMatrixWorld(true);
  }
  function lookFrame(dt, B, P) {
    let tgt = null; if (B.look === 'p') tgt = { x: P.x, z: P.z, y: 1.2 }; else if (B.look && typeof B.look === 'object') tgt = { x: B.look.x, z: B.look.z, y: 0 };
    look.w = clamp(look.w + (tgt ? dt : -dt) / 0.3, 0, 1);
    boss.updateMatrixWorld(true); const h = bone.Head.getWorldPosition(_v);
    let wy = look.yaw, wp = look.pitch;
    if (tgt) { wy = clamp(Math.atan2(tgt.x - h.x, tgt.z - h.z), -85 * D, 85 * D); wp = clamp(Math.atan2(h.y - (tgt.y || 0), hyp(tgt.x - h.x, tgt.z - h.z)) - 16 * D, -25 * D, 25 * D) }
    const W = 4.2, Z = 0.48;   // 弹簧：慢慢跟、稍微过头
    look.vy += (W * W * (wy - look.yaw) - 2 * Z * W * look.vy) * dt; look.yaw += look.vy * dt;
    look.vp += (W * W * (wp - look.pitch) - 2 * Z * W * look.vp) * dt; look.pitch += look.vp * dt;
    const k = look.w * look.w * (3 - 2 * look.w); if (k <= 0.001) return;
    const yaw = look.yaw * k, pit = look.pitch * k, main = clamp(yaw, -70 * D, 70 * D), extra = clamp(yaw - main, -15 * D, 15 * D);
    _a.set(0, 1, 0); rotWorld(bone.Chest, _a, extra); rotWorld(bone.Neck, _a, main * 0.4); rotWorld(bone.Head, _a, main * 0.6);
    _a.set(Math.cos(yaw), 0, -Math.sin(yaw)); rotWorld(bone.Neck, _a, pit * 0.3); rotWorld(bone.Head, _a, pit * 0.7);
  }

  /* ---------- 招式特效 ---------- */
  const flyers = [], wisps = [], clouds = [], poolVis = new Map(), pusVis = new Map();
  let dimT = 0, sinkT = -1, dripT = 0, puffT = 2, wispT = 0, cloudT = 0, rageT = 0;
  const sprite = (map, color, op, add) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, opacity: op, depthWrite: false, blending: add ? ADD : THREE.NormalBlending, fog: !add })); scene.add(s); return s };
  function splash(x, y, z, n, sp = 3, size = 0.6) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, v = sp * (0.5 + Math.random() * 0.7); part(T.fx.drops, x, y, z, { vx: Math.cos(a) * v, vy: 2 + Math.random() * 3, vz: Math.sin(a) * v, g: 14, size: size * (0.6 + Math.random() * 0.6), life: 0.6, grow: 0.8, add: true, color: 0xd8ff8a }) } }
  /* 酸液喷流：一条从嘴里喷到地上的光带（平面，朝喷的方向） */
  const sprayGeo = new THREE.PlaneGeometry(1, 1); sprayGeo.translate(0.5, 0, 0);
  function spray(from, to, w = 2.4, life = 0.4) {
    const m = new THREE.Mesh(sprayGeo, new THREE.MeshBasicMaterial({ map: T.fx.spray, transparent: true, blending: ADD, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false, color: 0xe8ff9a }));
    const d = to.clone().sub(from), L = d.length(); m.position.copy(from); m.scale.set(L, w, 1);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize()); m.rotateX(Math.PI / 2); m.renderOrder = 6; scene.add(m); flyers.push({ kind: 'fade', m, t: 0, life });
  }
  function onEvent(e) {
    if (e.e === 'release') {
      const w = e.w;
      if (e.k === 'spit') { const m = wpos(mouth), end = new THREE.Vector3(w.x + Math.sin(w.yaw) * w.r * 0.85, 0.2, w.z + Math.cos(w.yaw) * w.r * 0.85);
        spray(m, end, 3.2, 0.45); splash(m.x, m.y, m.z, 4, 2, 0.5); splash(end.x, 0.4, end.z, 8, 3.5, 0.7);
        mark(T.mk.acid, w.x + Math.sin(w.yaw) * w.r * 0.6, w.z + Math.cos(w.yaw) * w.r * 0.6, 4.4, 3, w.yaw); return true }
      if (e.k === 'slam') { const x = w.x, z = Z0 + 3.2; dust(x, z, 12, 1.4, 4, 1.4); rocks(x, z, 9); shock(x, z, 8, 0xe8f0c0, 0.6); mark(T.crack, x, z, 6, 4, Math.random() * 6); ctx.shake(0.65); flashEye(); return true }
      if (e.k === 'burst') { const c = wpos(chestP); part(T.fx.pop, c.x, c.y, c.z, { size: 5, grow: 1.6, life: 0.4, add: true, color: 0xe0ff8a }); splash(c.x, c.y, c.z, 10, 5, 0.9); return true }
      if (e.k === 'surge') { ctx.shake(0.4); return true }
      return true;
    }
    if (e.e === 'boltLaunch') { const m = wpos(mouth), s = sprite(T.fx.bolt, 0xeaff9a, 1, true); s.scale.setScalar(1.7); flyers.push({ kind: 'bolt', s, from: m, to: new THREE.Vector3(e.x, 0.3, e.z), t: 0, life: e.fly });
      part(T.fx.cloud, m.x, m.y, m.z, { size: 1.6, grow: 2, life: 0.6, add: true, color: 0x9aff4a, op: 0.6 }); return true }
    if (e.e === 'boltLand') { part(T.fx.pop, e.x, 0.5, e.z, { size: 3.2, grow: 1.5, life: 0.35, add: true, color: 0xd8ff8a }); splash(e.x, 0.4, e.z, 7, 3, 0.6); return true }
    if (e.e === 'pusBoom') { part(T.fx.pop, e.x, 0.9, e.z, { size: e.r * 2.6, grow: 1.4, life: 0.4, add: true, color: 0xe6ff7a }); splash(e.x, 0.6, e.z, 12, 5, 0.9); shock(e.x, e.z, e.r * 2.2, 0xcfff6a, 0.8);
      mark(T.mk.crater, e.x, e.z, e.r * 1.7, 4, Math.random() * 6); ctx.shake(0.35); return true }
    if (e.e === 'pusKill') { part(T.fx.pop, e.x, 0.8, e.z, { size: 1.8, grow: 1.4, life: 0.3, add: true, color: 0xbfff6a }); splash(e.x, 0.6, e.z, 5, 2.5, 0.5); return true }
    if (e.e === 'interrupt') { dimT = 0.6; return false }
    if (e.e === 'shrinkWarn') { warnLines(true); fog.warnShrink(true); ctx.UI.toast('两边的毒雾要往里收了！', 'bad', 2200); return true }
    if (e.e === 'shrink') { warnLines(false); fog.warnShrink(false); return true }
    if (e.e === 'half') { ctx.UI.toast('毒囊半血：毒弹更多、两边毒雾开始往里收', 'bad', 2600); return true }
    if (e.e === 'bossDie') { sinkT = 0; return false }
    return false;
  }
  function flashEye() { for (const s of eyes) s.userData.flash = 0.35 }
  /* 半血以后两边毒雾往里收：收之前崖边亮红线；收了以后那一条盖一层毒雾 */
  const redLines = [-1, 1].map(sd => { const m = new THREE.Mesh(flatGeo, new THREE.MeshBasicMaterial({ color: 0xff2a14, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false })); m.scale.set(0.14, 1, L0 - 1); m.position.set(0, 0.03, (Z0 + Z1) / 2); m.renderOrder = 5; scene.add(m); m.userData.sd = sd; return m });
  let redOn = false; function warnLines(on) { redOn = on; for (const m of redLines) { m.position.x = (m.userData.sd > 0 ? FC.ARENA.x1 - 0.6 : FC.ARENA.x0 + 0.6) } }
  /* 设计 84：台地上的毒雾（上涌那半边、收进来的两条）改成一团团会动的软雾，见 fbfog.js */
  const fog = makeFog({ scene, T, X0, X1, Z0, Z1, W0, L0, camera: ctx.camera });

  /* ---------- 每帧 ---------- */
  function bossFrame(dt, clock, fight, phase, endT) {
    const B = fight.boss, P = fight.player;
    mixer.update(dt * (B.slow > 0 ? 0.5 : 1));
    if (!B.dead) lookFrame(dt, B, P); else look.w = 0;
    /* 眼睛：呼吸；大招、狂暴变红；毒囊爆裂快速闪亮黄；拍下那一刻亮一下；被打断暗一下；倒下慢慢灭 */
    const c = B.cast; dimT -= dt;
    const red = fight.rage || (c && c.k === 'surge'), burst = c && c.k === 'burst';
    let ek = 0.75 + 0.25 * Math.sin(clock * 2.2);
    if (burst) ek = 0.8 + 0.6 * Math.abs(Math.sin(clock * 22));
    if (dimT > 0) ek *= 0.25;
    if (B.dead) ek *= Math.max(0, 1 - (endT || 0) / 2.2);
    for (const s of [...eyes, ...eyeCore]) { const f = s.userData.flash > 0 ? (s.userData.flash -= dt, 1.6) : 1;
      s.material.color.setHex(red ? 0xff2008 : burst ? 0xfff23a : s === eyeCore[0] || s === eyeCore[1] ? 0xf4ff9a : 0xd6ff3a); s.material.opacity = clamp(ek * f, 0, 1);
      const base = eyes.includes(s) ? (fight.rage ? 0.85 : 0.55) : 0.26; s.scale.setScalar(base * ws * (burst ? 1.25 : 1) * (f > 1 ? 1.4 : 1)) }
    for (const s of eyeRed) { s.material.opacity += ((red && !B.dead ? 1 : 0) - s.material.opacity) * Math.min(1, dt * 10); s.scale.setScalar((fight.rage ? 0.46 : 0.42) * ws * (0.92 + 0.08 * Math.sin(clock * 9))) }
    /* 身上的脓包：一明一暗；毒囊爆裂时全身一起亮 */
    U.pus.value = B.dead ? Math.max(0, 0.35 - (endT || 0) * 0.15) : burst ? 0.7 + 0.5 * Math.abs(Math.sin(clock * 18)) : 0.2 + 0.1 * Math.sin(clock * 1.7);
    /* 喉咙、腮帮：毒弹时越来越亮 */
    throat.material.opacity = c && c.k === 'bolt' ? Math.min(0.95, c.t / 0.6) * (0.75 + 0.25 * Math.sin(clock * 15)) : Math.max(0, throat.material.opacity - dt * 3);
    /* 狂暴：身上淡淡一层红 */
    if (fight.rage && !B.dead) { rageT += dt; U.rage.value = 0.18 + 0.12 * Math.sin(rageT * 6) } else U.rage.value = 0;
    /* 嘴角一直往下滴绿液，偶尔冒一小缕毒气 */
    dripT -= dt; if (dripT <= 0 && sinkT < 0) { dripT = 0.28 + Math.random() * 0.35; const p = wpos(mouthC[Math.random() < 0.5 ? 0 : 1]); part(T.fx.drops, p.x, p.y, p.z, { vx: (Math.random() - 0.5) * 0.4, vy: -0.5, vz: 0.4, g: 9, size: 0.45, life: 1.7, add: true, color: 0xb8ff5a, noFloor: 1, grow: 0.9 }) }
    puffT -= dt; if (puffT <= 0 && !B.dead) { puffT = 2 + Math.random() * 2.5; const p = wpos(mouth); part(T.fx.wisp, p.x, p.y + 0.3, p.z, { vy: 0.9, vz: 0.2, size: 1.6, grow: 1.8, life: 1.6, add: true, color: 0x9aff6a, op: 0.45 }) }
    /* 毒雾上涌：仰头时嘴里往上喷一大股毒雾 */
    if (c && c.k === 'surge' && c.t > c.dur * 0.45 && Math.random() < dt * 14) { const p = wpos(mouth); part(Math.random() < 0.5 ? T.fx.cloud : T.fx.wisp, p.x + (Math.random() - 0.5), p.y + 0.5, p.z, { vy: 3 + Math.random() * 2, vx: (Math.random() - 0.5) * 1.5, size: 2.2, grow: 2.4, life: 1.2, add: true, color: 0xa6ff5a, op: 0.7, topY: headTop() + 2.0 }) }   // 设计 84c：头顶往上约 1.5 个头高就开始淡
    /* 毒弹：每吐一发嘴边一团小绿雾（boltLaunch 里放了）；鼓腮的时候喉咙亮着 */
    /* 倒下：嚎叫，手抓不住崖边滑下去，整个沉进毒雾里，冒一大团毒雾和气泡 */
    if (sinkT >= 0) { sinkT += dt; const k = clamp((sinkT - 1.5) / 2.6, 0, 1);
      boss.position.y = -0.36 - 11 * k * k; boss.position.z = BZ - 1.2 * k;
      if (sinkT > 1.5 && sinkT < 4.2 && Math.random() < dt * 10) { const x = (Math.random() - 0.5) * 9; part(Math.random() < 0.6 ? T.fx.cloud : T.fx.bubbles, x, -0.5 - Math.random(), Z0 - 1.5 + Math.random() * 1.5, { vy: 1.5 + Math.random(), size: 3 + Math.random() * 2, grow: 1.8, life: 1.6, add: Math.random() < 0.5, color: 0xb8ff6a, op: 0.7, noFloor: 1 }) }
      if (sinkT > 1.5 && !boss.userData.sunk) { boss.userData.sunk = 1; ctx.shake(0.4) } }
    else { boss.position.set(ARENA.boss.x, -0.36, BZ); boss.userData.sunk = 0 }
    /* 腰上那圈毒雾慢慢转 */
    for (const s of waist) { const u = s.userData; u.a += dt * 0.08; s.position.set(Math.cos(u.a) * u.r, boss.position.y + 0.36 + u.y + 0.2 * Math.sin(clock + u.ph), BZ - 0.7 + Math.sin(u.a) * u.r * 0.55); s.scale.setScalar(u.sz); s.material.opacity = 0.45 + 0.1 * Math.sin(clock * 0.7 + u.ph) }
  }
  function frame(dt, clock, fight) {
    /* 毒雾海两层反向流 */
    T.mist.offset.x = (T.mist.offset.x + dt * 0.012) % 1; T.mist.offset.y = (T.mist.offset.y + dt * 0.006) % 1;
    T.mist2.offset.x = (T.mist2.offset.x - dt * 0.02) % 1; T.mist2.offset.y = (T.mist2.offset.y + dt * 0.011) % 1;
    /* 崖边一路往上冒毒雾丝；零星飘大团毒雾（淡淡的，别挡人） */
    wispT -= dt; if (wispT <= 0 && wisps.length < 14) { wispT = 0.35; const side = Math.floor(Math.random() * 3), x = side === 2 ? (Math.random() - 0.5) * W0 : (side ? 1 : -1) * (W0 / 2 + 0.6 + Math.random() * 1.2), z = side === 2 ? Z0 - 1.2 - Math.random() * 1.5 : Z0 + Math.random() * L0;
      const s = sprite(T.fx.wisp, 0xb4ff7a, 0, true); s.center.set(0.5, 0); s.userData = { x, z, y: -3 - Math.random() * 2, t: 0, life: 3.5 + Math.random() * 2, sz: 1.6 + Math.random() * 1.3 }; wisps.push(s) }
    for (let i = wisps.length - 1; i >= 0; i--) { const s = wisps[i], u = s.userData; u.t += dt; const k = u.t / u.life; if (k >= 1) { scene.remove(s); s.material.dispose(); wisps.splice(i, 1); continue }
      s.position.set(u.x + Math.sin(u.t * 0.8) * 0.3, u.y + u.t * 1.1, u.z); s.scale.set(u.sz, u.sz * 2.2, 1); s.material.opacity = 0.42 * Math.sin(Math.PI * k) }
    cloudT -= dt; if (cloudT <= 0 && clouds.length < 7) { cloudT = 1.4; const sd = Math.random() < 0.5 ? -1 : 1, s = sprite(T.fx.cloud, 0xb6d88a, 0, false);
      s.userData = { x: sd * (W0 / 2 + 1.5 + Math.random() * 4), z: Z0 + Math.random() * L0, y: -2.6 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 0.6, t: 0, life: 8 + Math.random() * 5, sz: 4 + Math.random() * 3 }; clouds.push(s) }
    for (let i = clouds.length - 1; i >= 0; i--) { const s = clouds[i], u = s.userData; u.t += dt; const k = u.t / u.life; if (k >= 1) { scene.remove(s); s.material.dispose(); clouds.splice(i, 1); continue }
      s.position.set(u.x, u.y + u.t * 0.15, u.z + u.vz * u.t); s.scale.setScalar(u.sz); s.material.opacity = 0.38 * Math.sin(Math.PI * k) }
    /* 毒弹在天上飞（弧线），喷流淡掉 */
    for (let i = flyers.length - 1; i >= 0; i--) { const f = flyers[i]; f.t += dt; const k = Math.min(1, f.t / f.life);
      if (f.kind === 'bolt') { f.s.position.lerpVectors(f.from, f.to, k); f.s.position.y += 3.2 * k * (1 - k) * 2; f.s.material.rotation += dt * 6;
        if (Math.random() < dt * 20) part(T.fx.drops, f.s.position.x, f.s.position.y, f.s.position.z, { vy: -1, size: 0.4, life: 0.35, add: true, color: 0xb8ff6a, noFloor: 1 });
        if (k >= 1) { scene.remove(f.s); f.s.material.dispose(); flyers.splice(i, 1) } }
      else if (f.kind === 'fade') { f.m.material.opacity = 1 - k * k; if (k >= 1) { scene.remove(f.m); f.m.material.dispose(); flyers.splice(i, 1) } } }
    /* 毒池：冒泡的大毒池 + 气泡往上冒；最后 1 秒闪一闪再消失 */
    const live = new Set();
    for (const p of fight.pools) { live.add(p.id); let v = poolVis.get(p.id);
      if (!v) { const m = new THREE.Mesh(flatGeo, new THREE.MeshBasicMaterial({ map: T.mk.pool, transparent: true, depthWrite: false, color: 0xdaf0c8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 })); m.scale.setScalar(p.r * 2.3); m.position.set(p.x, 0.025, p.z); m.rotation.y = Math.random() * 6; m.renderOrder = 2; scene.add(m); v = { m, bt: 0 }; poolVis.set(p.id, v) }
      const left = p.life - p.t, grow = Math.min(1, p.t / 0.25); v.m.scale.setScalar(p.r * 2.3 * (0.4 + 0.6 * grow)); v.m.material.opacity = left < 1 ? (Math.floor(left * 10) % 2 ? 0.25 : 0.95) * left : 0.95;
      v.bt -= dt; if (v.bt <= 0) { v.bt = 0.35 + Math.random() * 0.4; const a = Math.random() * 6.28, r = Math.random() * p.r * 0.8; part(T.fx.bubbles, p.x + Math.cos(a) * r, 0.25, p.z + Math.sin(a) * r, { vy: 0.7, size: 0.7, grow: 1.3, life: 0.9, add: true, color: 0xb8ff6a, op: 0.8 }) } }
    for (const [id, v] of poolVis) if (!live.has(id)) { scene.remove(v.m); v.m.material.dispose(); poolVis.delete(id) }
    /* 毒雾上涌、两边收进来的毒雾 */
    fog.update(dt, clock, fight);
    /* 收毒雾前的红线 */
    for (const m of redLines) m.material.opacity = redOn ? 0.55 + 0.4 * Math.sin(clock * 10) : 0;
  }
  /* ---------- 脓包（毒囊爆裂飞出去的）：黄绿色、发光；落地弹一下，一明一暗越闪越快 ---------- */
  function spawnPus(m) {
    const o = g.pus.scene.clone(true); o.scale.setScalar(1.75); const mm = [];
    o.traverse(c => { if (c.isMesh) { c.material = new THREE.MeshLambertMaterial({ map: c.material.map, color: 0xd6ff5a, emissive: new THREE.Color(0x2a4a00) }); c.castShadow = true; mm.push(c.material) } });
    scene.add(o); const glow = glowSprite(G.ball, 0xc8ff3a, 0.5); glow.scale.setScalar(3); scene.add(glow);
    const bar = new THREE.Group(), bg = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.2), new THREE.MeshBasicMaterial({ color: 0x141414, depthTest: false, transparent: true, opacity: 0.85 })), fg = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.13), new THREE.MeshBasicMaterial({ color: 0xb8ff3a, depthTest: false, transparent: true }));
    bg.renderOrder = 8; fg.renderOrder = 9; bar.add(bg, fg); scene.add(bar);
    const from = wpos(chestP); pusVis.set(m.id, { o, mm, glow, bar, fg, from, t: 0 });
  }
  function pusFrame(fight, dt, clock) {
    for (const m of fight.mobs) { if (!m.pus) continue; const v = pusVis.get(m.id); if (!v) continue;
      if (m.dead) { v.o.visible = false; v.glow.visible = false; v.bar.visible = false; continue }
      v.t += dt; const fly = Math.max(0, m.rise), k = 1 - fly / 0.6;
      if (fly > 0) { v.o.position.lerpVectors(v.from, new THREE.Vector3(m.x, 0, m.z), k); v.o.position.y += 4.5 * k * (1 - k) * 2; v.o.rotation.x += dt * 6; v.bar.visible = false;
        if (Math.random() < dt * 14) part(T.fx.drops, v.o.position.x, v.o.position.y, v.o.position.z, { vy: -1, size: 0.35, life: 0.35, add: true, color: 0xc8ff5a, noFloor: 1 }) }
      else { const land = Math.max(0, 1 - (v.t - 0.6) / 0.35), b = Math.abs(Math.sin((v.t - 0.6) * 14)) * land; v.o.position.set(m.x, b * 0.6, m.z); v.o.rotation.x = 0; v.o.scale.set(1.75 * (1 + 0.15 * land), 1.75 * (1 - 0.12 * land), 1.75 * (1 + 0.15 * land));
        v.bar.visible = m.hp < m.max; const hk = m.hp / m.max; v.fg.scale.x = Math.max(0.001, hk); v.fg.position.x = -(1 - hk) * 0.6; v.bar.position.set(m.x, 2.1, m.z); v.bar.quaternion.copy(ctx.camera.quaternion) }
      const fill = m.w ? clamp(m.w.t / m.w.dur, 0, 1) : 0, hz = 1.5 + fill * fill * 11, on = 0.5 + 0.5 * Math.sin(clock * hz * 6.28);
      for (const mt of v.mm) mt.emissive.setRGB(0.16 + 0.42 * on * (0.4 + fill), 0.3 + 0.6 * on * (0.4 + fill), 0.02);
      v.glow.position.set(v.o.position.x, v.o.position.y + 0.8, v.o.position.z); v.glow.material.opacity = (0.2 + 0.5 * on * (0.3 + fill)) * (fly > 0 ? 0 : Math.min(1, (v.t - 0.6) / 0.35)); v.glow.scale.setScalar(2.2 + fill * 1.4) }
    for (const [id, v] of pusVis) if (!fight.mobs.find(m => m.id === id)) { scene.remove(v.o); scene.remove(v.glow); scene.remove(v.bar); pusVis.delete(id) }
  }
  /* 宝箱落在台地北段（不能掉到崖下） */
  const chestSpot = () => ({ x: 0, z: Z0 + 4.6 });
  function reset() {
    mixer.stopAllAction(); curAct = null; play('idle'); sinkT = -1; dimT = 0; rageT = 0; look.yaw = look.pitch = look.vy = look.vp = 0; look.w = 0; U.rage.value = 0;
    boss.position.set(ARENA.boss.x, -0.36, BZ); boss.visible = true; redOn = false; fog.reset();
    for (const f of flyers) { scene.remove(f.s || f.m) } flyers.length = 0;
    for (const [, v] of poolVis) scene.remove(v.m); poolVis.clear();
    for (const [, v] of pusVis) { scene.remove(v.o); scene.remove(v.glow); scene.remove(v.bar) } pusVis.clear();
  }
  /* 设计 94：镜头、红箭头用的毒囊的脸：头顶（上沿）、下巴（下沿），世界坐标 */
  const face = () => { const h = bone.Head.getWorldPosition(new THREE.Vector3()); return { x: h.x, z: h.z, top: h.y + 0.13 * TOX_SCALE, chin: wpos(mouth).y } };
  return { face, fog, eyeRed, boss, mixer, acts, play, mats, onEvent, bossFrame, frame, spawnPus, pusFrame, chestSpot, reset, bone, look, castName: k => ({ spit: '酸液喷吐', bolt: '毒弹', burst: '毒囊爆裂', slam: '拍地', surge: '毒雾上涌（大招）' })[k] };
}
