/* ================= 设计 114：副本第 4 关「尖啸者 · 废弃广播电台楼顶」的画面（场地、尖啸者、喇叭、掩体、乌鸦、声波特效） =================
   战斗的数和规则在 fbcore.js（SCREAM_CFG、screamStep）；这里照 fbrock.js 的写法：buildScream(api) 返回这一关自己的 boss / 动作 / 每帧 / 事件。
   素材（114B 出）：models/fb4/ screamer（BOSS，动作名见 SCREAM_ANIM）、tower_house（北边带信号塔的小屋）、stair_house（南边入口小屋，门朝北）、speaker（立杆喇叭，喇叭头节点 horn）、covers（节点 ac / pipe / tank / box）；
   img/fb4/ floor、skyline、fx_sound（3×2：声波环、音爆锥、声刃、电火花、黑羽毛、红色尖啸波纹）、fx_blink（3×2：黑紫烟团、落点黑影、羽毛旋涡、紫色错乱漩涡、暗红嗜血光环、红雾）、
   crow / crow_red（3×2：6 帧乌鸦，1～4 扇翅、5 滑翔、6 俯冲）、decals（3×2：裂纹、羽毛堆、锈水渍、断电线、碎玻璃）、boss_4（头像）。
   模型大小不靠素材自己的单位：一律按包围盒缩到要的高度 / 占地（素材换了也不用改这里）。 */
import * as THREE from 'three';
import { SCREAM_ANIM, SCREAM_K, SCREAM_CFG, SCREAM_NAME } from './fbcore.js';

export const SCREAM_ASSETS = ['fb4/screamer', 'fb4/tower_house', 'fb4/stair_house', 'fb4/speaker', 'fb4/covers', 'fb/chest_1', 'fb/chest_2'];
const D = Math.PI / 180, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), hyp = Math.hypot;
const _box = new THREE.Box3(), _sz = new THREE.Vector3(), _v = new THREE.Vector3();

export function buildScream(api) {
  const { scene, g, T, tex, part, dust, shock, glowTex, flatGeo, ADD, ctx, ARENA, COVERS } = api;
  const G = glowTex();
  /* 3×2 的图：一格一张贴图（同一个文件读 6 次，浏览器有缓存）。fx_sound / fx_blink 是黑底，一律叠加混合 */
  const cells = url => [0, 1, 2, 3, 4, 5].map(i => { const t = tex(url); t.repeat.set(1 / 3, 1 / 2); t.offset.set((i % 3) / 3, i < 3 ? 0.5 : 0); return t });
  Object.assign(T, { floor: tex('img/fb4/floor.jpg', [3.5, 8]), sky: tex('img/fb4/skyline.jpg', [3, 1]), snd: cells('img/fb4/fx_sound.png'), blk: cells('img/fb4/fx_blink.png'),
    crow: cells('img/fb4/crow.png'), crowR: cells('img/fb4/crow_red.png'), dec: cells('img/fb4/decals.png') });
  T.sky.wrapT = THREE.ClampToEdgeWrapping;
  /* 夜里：紫青夜空 */
  scene.background = new THREE.Color(0x231a3c); scene.fog = new THREE.Fog(0x231a3c, 42, 110);
  scene.add(new THREE.HemisphereLight(0x9a88d0, 0x22303c, 1.25));
  const moon = new THREE.DirectionalLight(0xa8dcff, 1.35); moon.position.set(7, 20, 9); moon.castShadow = true; moon.shadow.mapSize.set(1024, 1024);
  Object.assign(moon.shadow.camera, { left: -16, right: 16, top: 26, bottom: -26, near: 1, far: 70 }); moon.target.position.set(0, 0, 3); scene.add(moon, moon.target);
  const X0 = ARENA.x0, X1 = ARENA.x1, Z0 = ARENA.z0, Z1 = ARENA.z1;
  const RX0 = X0 - 0.45, RX1 = X1 + 0.45, RZ0 = Z0 - 4.4, RZ1 = Z1 + 3.8;   // 整个楼顶（女儿墙里面）：北边多出来放信号塔小屋，南边放楼梯间
  const occl = [];   // 设计 97：挡住主角时变半透明（南边女儿墙、楼梯间、掩体）
  const lam = (old, color) => { const m = new THREE.MeshLambertMaterial({ map: old && old.map || null, color: color ?? (old && !old.map && old.color ? old.color.getHex() : 0xffffff) }); return m };
  /* 素材里的一件：换成兰伯特材质、开影子；按包围盒缩到 fit（{ h } 高、{ w } 宽、{ fx, fz } 占地），底面贴地、中心对齐 */
  function piece(src, fit, x, y, z, ry = 0) {
    if (!src) return null;
    const k = src.clone(true); k.traverse(c => { if (c.isMesh) { const old = c.material; c.material = lam(old); c.castShadow = true; c.receiveShadow = true; if (!c.geometry.attributes.normal) c.geometry.computeVertexNormals() } });
    const inner = new THREE.Group(); inner.add(k); k.position.set(0, 0, 0); k.updateMatrixWorld(true); _box.setFromObject(k); _box.getSize(_sz);
    let s = 1; if (fit.h) s = fit.h / Math.max(_sz.y, 1e-4); else if (fit.w) s = fit.w / Math.max(_sz.x, 1e-4); else if (fit.fx) s = Math.min(fit.fx / Math.max(_sz.x, 1e-4), fit.fz / Math.max(_sz.z, 1e-4));
    const c = _box.getCenter(new THREE.Vector3()); k.position.set(-c.x, -_box.min.y, -c.z);
    const o = new THREE.Group(); inner.scale.setScalar(s); o.add(inner); o.position.set(x, y, z); o.rotation.y = ry; scene.add(o); o.userData.h = _sz.y * s; return o;
  }
  const node = (pack, name) => { const sc = g[pack] && g[pack].scene; if (!sc) return null; return name ? sc.getObjectByName(name) : sc };

  /* ---------- 地面：裂纹水泥楼顶 + 女儿墙 + 楼身往下 ---------- */
  { const W = RX1 - RX0, L = RZ1 - RZ0, fl = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshLambertMaterial({ map: T.floor, color: 0xd8d4e0 })); T.floor.repeat.set(W / 4, L / 4);
    fl.rotation.x = -Math.PI / 2; fl.position.set((RX0 + RX1) / 2, 0, (RZ0 + RZ1) / 2); fl.receiveShadow = true; scene.add(fl);
    const wm = new THREE.MeshLambertMaterial({ color: 0x8a8494 }), H = 0.9, th = 0.4;
    const wall = (x0, x1, z0, z1, south) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, H, z1 - z0), south ? wm.clone() : wm); m.position.set((x0 + x1) / 2, H / 2, (z0 + z1) / 2); m.castShadow = m.receiveShadow = true; scene.add(m); if (south) occl.push(m); return m };
    wall(RX0 - th, RX1 + th, RZ0 - th, RZ0); wall(RX0 - th, RX1 + th, RZ1, RZ1 + th, true); wall(RX0 - th, RX0, RZ0, RZ1); wall(RX1, RX1 + th, RZ0, RZ1);
    const cap = new THREE.MeshLambertMaterial({ color: 0x6c6678 });   // 墙头一圈压顶
    for (const [x0, x1, z0, z1] of [[RX0 - th - 0.05, RX1 + th + 0.05, RZ0 - th - 0.05, RZ0 + 0.05], [RX0 - th - 0.05, RX0 + 0.05, RZ0, RZ1], [RX1 - 0.05, RX1 + th + 0.05, RZ0, RZ1]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.1, z1 - z0), cap); m.position.set((x0 + x1) / 2, H + 0.05, (z0 + z1) / 2); scene.add(m) }
    const body = new THREE.Mesh(new THREE.BoxGeometry(W + 1, 30, L + 1), new THREE.MeshLambertMaterial({ color: 0x4a4458 })); body.position.set((RX0 + RX1) / 2, -15.02, (RZ0 + RZ1) / 2); scene.add(body);
    /* 女儿墙外：一圈城市天际线远景（不受雾影响） */
    const sky = new THREE.Mesh(new THREE.CylinderGeometry(52, 52, 30, 48, 1, true), new THREE.MeshBasicMaterial({ map: T.sky, side: THREE.BackSide, fog: false, color: 0xd0c8e8 }));
    sky.position.set(0, 1, (RZ0 + RZ1) / 2); scene.add(sky);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshBasicMaterial({ color: 0x141020, fog: false })); under.rotation.x = -Math.PI / 2; under.position.set(0, -13.5, (RZ0 + RZ1) / 2); scene.add(under);
    /* 装饰贴花：裂纹、羽毛堆、锈水渍、断电线、碎玻璃（不伤人） */
    for (let i = 0, n = 0; i < 80 && n < 14; i++) { const x = X0 + 0.8 + Math.random() * (X1 - X0 - 1.6), z = Z0 + 1 + Math.random() * (Z1 - Z0 - 2);
      if (COVERS.some(c => Math.abs(x - c.x) < c.hx + 0.8 && Math.abs(z - c.z) < c.hz + 0.8)) continue;
      const k = n % 5, m = new THREE.Mesh(flatGeo, new THREE.MeshLambertMaterial({ map: T.dec[k], transparent: true, depthWrite: false, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 }));
      m.scale.setScalar(k === 0 ? 2.4 + Math.random() : 1.3 + Math.random() * 0.7); m.rotation.y = Math.random() * 6.28; m.position.set(x, 0.015, z); m.renderOrder = 1; scene.add(m); n++ } }

  /* ---------- 北边：带信号塔的小屋（BOSS 开场在塔前），塔顶一颗红灯一闪一闪；南边：楼梯间小屋（门朝北，主角从门里出来） ---------- */
  const tower = piece(node('tower_house'), { w: 5.4 }, SCREAM_CFG.tower.x, 0, RZ0 + 2.2);
  const redL = new THREE.PointLight(0xff3020, 3, 14, 1.6), redS = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.ball, color: 0xff3020, transparent: true, blending: ADD, depthWrite: false, fog: false }));
  { const top = tower ? tower.userData.h : 13; redL.position.set(SCREAM_CFG.tower.x, top + 0.2, RZ0 + 2.2); redS.position.copy(redL.position); redS.scale.setScalar(1.4); scene.add(redL, redS) }
  const stair = piece(node('stair_house'), { w: 3.8 }, 0, 0, Z1 + 1.9); if (stair) occl.push(stair);

  /* ---------- 4 根立杆喇叭（四角，喇叭口朝场内）：能打坏——冒电火花、喇叭头歪下来、不再响 ---------- */
  const spkVis = [];
  function mkSpeaker(q) {
    const o = piece(node('speaker'), { h: 3.4 }, q.x, 0, q.z, q.yaw); if (!o) return null;
    const horn = o.getObjectByName('horn') || o.children[0];
    const bar = new THREE.Group(), bg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.16), new THREE.MeshBasicMaterial({ color: 0x141414, depthTest: false, transparent: true, opacity: 0.85 })), fg = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.1), new THREE.MeshBasicMaterial({ color: 0xffb040, depthTest: false, transparent: true }));
    bg.renderOrder = 8; fg.renderOrder = 9; bar.add(bg, fg); bar.visible = false; scene.add(bar);
    const v = { q, o, horn, rx0: horn.rotation.x, rz0: horn.rotation.z, bar, fg, shake: 0, broke: 0, spark: 0 }; spkVis.push(v); return v;
  }
  const spkOf = s => spkVis.find(v => v.q.id === s.id);

  /* ---------- 掩体：空调外机、弯管道、圆水箱、配电箱（挡子弹、挡鸦弹；不挡声波） ---------- */
  const coverVis = new Map();
  function coverMesh(c) { const o = piece(node('covers', c.k), { fx: c.hx * 2.1, fz: c.hz * 2.1 }, c.x, 0, c.z, 0); if (!o) return null; occl.push(o); return o }
  function syncCovers() { for (const [, v] of coverVis) { scene.remove(v); const i = occl.indexOf(v); if (i >= 0) occl.splice(i, 1) } coverVis.clear(); for (const c of COVERS) { const m = coverMesh(c); if (m) coverVis.set(c.id, m) } }
  syncCovers();

  /* ---------- 远处飘的小乌鸦（装饰） ---------- */
  const deco = [];
  for (let i = 0; i < 7; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.crow[0], transparent: true, depthWrite: false, fog: false, color: 0x302838 }));
    s.userData = { a: Math.random() * 6.28, r: 18 + Math.random() * 14, y: 7 + Math.random() * 8, sp: (0.12 + Math.random() * 0.12) * (Math.random() < 0.5 ? -1 : 1), f: Math.random() * 4, sz: 0.9 + Math.random() * 0.6 }; scene.add(s); deco.push(s) }

  /* ---------- 尖啸者 ---------- */
  const boss = new THREE.Group(); const bm = g.screamer.scene; scene.add(boss);
  { bm.updateMatrixWorld(true); _box.setFromObject(bm); _box.getSize(_sz); const s = SCREAM_K / Math.max(_sz.y, 1e-4), c = _box.getCenter(new THREE.Vector3()); bm.scale.multiplyScalar(s); bm.position.set(-c.x * s, -_box.min.y * s, -c.z * s); boss.add(bm) }
  const mats = [], U = { rage: { value: 0 } };
  bm.traverse(c => { if (!c.isMesh) return; const old = c.material; c.material = lam(old); old.dispose(); c.frustumCulled = false; c.castShadow = true; c.receiveShadow = false; c.material.emissive = new THREE.Color(0); mats.push(c.material);
    c.material.onBeforeCompile = sh => { sh.uniforms.uRage = U.rage; sh.fragmentShader = 'uniform float uRage;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(0.5, 0.03, 0.02) * uRage;') } });
  const mixer = new THREE.AnimationMixer(bm), acts = {};
  for (const clip of g.screamer.animations || []) { const a = mixer.clipAction(clip); if (!(SCREAM_ANIM[clip.name] || {}).loop) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true } acts[clip.name] = a }
  const bone = {}; bm.traverse(c => { if (c.isBone) bone[c.name] = c }); const HEAD = bone.head || bone.Head, NECK = bone.neck || bone.Neck, JAW = bone.jaw || bone.Jaw;
  let curAct = null;
  function play(name, ts = 1, fade = 0.2) {
    const a = acts[name]; if (!a) return;
    if (curAct === a) { a.timeScale = ts; if (!(SCREAM_ANIM[name] || {}).loop) { a.reset(); a.play() } return }
    a.reset(); a.timeScale = ts; a.setEffectiveWeight(1); a.play(); if (curAct) curAct.crossFadeTo(a, fade, false); curAct = a;
  }
  /* 头跟着主角转（毒囊那套：弹簧慢慢跟），放技能时由动作接管 */
  const look = { yaw: 0, pitch: 0, vy: 0, vp: 0, w: 0 }, _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _a = new THREE.Vector3();
  function rotWorld(b, axis, ang) { if (!b || !ang) return; b.parent.getWorldQuaternion(_p); _q.setFromAxisAngle(axis, ang); const pi = _p.clone().invert(); b.quaternion.premultiply(pi.multiply(_q).multiply(_p)); b.updateMatrixWorld(true) }
  function lookFrame(dt, B, P) {
    if (!HEAD) return;
    const tgt = B.look === 'p' && !B.cast ? { x: P.x, z: P.z, y: 1.2 } : null; look.w = clamp(look.w + (tgt ? dt : -dt) / 0.35, 0, 1);
    boss.updateMatrixWorld(true); const h = HEAD.getWorldPosition(_v), by = boss.rotation.y; let wy = look.yaw, wp = look.pitch;
    if (tgt) { let a = Math.atan2(tgt.x - h.x, tgt.z - h.z) - by; a = Math.atan2(Math.sin(a), Math.cos(a)); wy = clamp(a, -70 * D, 70 * D); wp = clamp(Math.atan2(h.y - tgt.y, hyp(tgt.x - h.x, tgt.z - h.z)) - 10 * D, -20 * D, 30 * D) }
    const W = 4.5, Z = 0.5; look.vy += (W * W * (wy - look.yaw) - 2 * Z * W * look.vy) * dt; look.yaw += look.vy * dt; look.vp += (W * W * (wp - look.pitch) - 2 * Z * W * look.vp) * dt; look.pitch += look.vp * dt;
    const k = look.w * look.w * (3 - 2 * look.w); if (k <= 0.001) return;
    _a.set(0, 1, 0); rotWorld(NECK, _a, look.yaw * k * 0.4); rotWorld(HEAD, _a, look.yaw * k * 0.6);
    const wyaw = by + look.yaw * k; _a.set(Math.cos(wyaw), 0, -Math.sin(wyaw)); rotWorld(NECK, _a, look.pitch * k * 0.4); rotWorld(HEAD, _a, look.pitch * k * 0.6);
  }
  /* 嗜血：脚下暗红光环 + 身边红雾 */
  const aura = new THREE.Mesh(flatGeo, new THREE.MeshBasicMaterial({ map: T.blk[4], transparent: true, blending: ADD, depthWrite: false, fog: false, opacity: 0 })); aura.position.y = 0.05; aura.scale.setScalar(3.2); aura.renderOrder = 2; boss.add(aura);
  const fogS = [0, 1, 2].map(i => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.blk[5], transparent: true, blending: ADD, depthWrite: false, fog: false, opacity: 0 })); s.userData.ph = i * 2.1; boss.add(s); return s });

  /* ---------- 乌鸦（面向镜头的贴片动画，按飞的方向左右翻；嗜血后红眼） ---------- */
  const crows = [];   // { s, x0,z0,y0, x1,z1,y1, t, life, ph, done(), red }
  function crowSprite(red, sz = 0.9) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: (red ? T.crowR : T.crow)[0], transparent: true, depthWrite: false, fog: false })); s.scale.set(sz, sz, 1); s.userData.sz = sz; scene.add(s); return s }
  function flyCrow(o) { const s = crowSprite(o.red, o.sz || 0.95); crows.push({ s, t: -(o.delay || 0), ph: Math.random() * 4, ...o }); }
  function feathers(x, y, z, n = 1, sz = 1.4) { for (let i = 0; i < n; i++) part(T.snd[4], x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4, { add: true, vx: (Math.random() - 0.5) * 2, vy: 0.5 + Math.random(), vz: (Math.random() - 0.5) * 2, g: 1.5, size: sz, grow: 1.3, life: 0.9, op: 0.9, spin: 2 }) }
  const handPos = () => { const b = bone.R_Hand || bone.hand_r || bone.RightHand; if (b) return b.getWorldPosition(new THREE.Vector3()); return new THREE.Vector3(boss.position.x + Math.sin(boss.rotation.y) * 0.6, boss.position.y + SCREAM_K * 0.62, boss.position.z + Math.cos(boss.rotation.y) * 0.6) };

  /* ---------- 声波圆环（带缺口）：每帧按半径重做一圈环 ---------- */
  const rings = new Map();
  function ringGeo(r, w, ga, hole) { const ge = new THREE.RingGeometry(Math.max(0.05, r - w / 2), r + w / 2, 72, 1, ga + hole / 2 - Math.PI / 2, Math.PI * 2 - hole); ge.rotateX(-Math.PI / 2); return ge }
  /* 设计 114：喇叭音爆的锥形音浪（地上一片，顺着扇形方向） */
  const cones = [];
  function hornWave(s, w, red) { const m = new THREE.Mesh(flatGeo, new THREE.MeshBasicMaterial({ map: T.snd[1], transparent: true, blending: ADD, depthWrite: false, fog: false, color: red ? 0xffa0a0 : 0xffffff }));
    m.scale.set(w.r * 0.9, 1, w.r * 0.9); m.position.set(s.x + Math.sin(w.yaw) * w.r * 0.45, 1.2, s.z + Math.cos(w.yaw) * w.r * 0.45); m.rotation.y = w.yaw - Math.PI / 2; m.renderOrder = 3; scene.add(m); cones.push({ m, t: 0, life: 0.45 }) }
  const shadows = [];   // 闪现落点黑影
  let halfT = -1;

  function onEvent(e) {
    if (e.e === 'blinkOut') { part(T.blk[0], e.x, (e.y || 0) + 1.6, e.z, { add: true, size: 3.4, grow: 1.4, life: 0.55, op: 0.95 }); feathers(e.x, (e.y || 0) + 2, e.z, 4); return true }
    if (e.e === 'blinkMark') { const m = new THREE.Mesh(flatGeo, new THREE.MeshBasicMaterial({ map: T.blk[1], transparent: true, blending: ADD, depthWrite: false, opacity: 0, fog: false })); m.scale.setScalar(2.2); m.position.set(e.x, 0.03, e.z); m.renderOrder = 3; scene.add(m); shadows.push({ m, t: 0, dur: e.dur }); return true }
    if (e.e === 'blinkIn') { part(T.blk[0], e.x, (e.y || 0) + 1.4, e.z, { add: true, size: 2.6, grow: 1.5, life: 0.45, op: 0.85 }); feathers(e.x, (e.y || 0) + 1.8, e.z, 3); return true }
    if (e.e === 'crowShot') { const h = handPos(), L = e.len; flyCrow({ x0: h.x, y0: h.y, z0: h.z, x1: e.x + Math.sin(e.yaw) * L, y1: 1.1, z1: e.z + Math.cos(e.yaw) * L, life: SCREAM_CFG.boltFly * Math.max(0.6, L / 10), red: e.red, sz: 1.0, end: 'burst' });
      part(T.blk[2], h.x, h.y, h.z, { add: true, size: 1.2, grow: 1.4, life: 0.3, op: 0.8 }); return true }
    if (e.e === 'pushGo') { const w = e.w; for (let i = 0; i < 9; i++) { const a = w.yaw + (Math.random() - 0.5) * w.a, r = w.r * (0.7 + Math.random() * 0.35); flyCrow({ x0: w.x, y0: 1.6, z0: w.z, x1: w.x + Math.sin(a) * r, y1: 0.8 + Math.random() * 1.2, z1: w.z + Math.cos(a) * r, life: 0.28 + Math.random() * 0.12, red: e.red, sz: 0.8, delay: i * 0.015, end: 'fade' }) }
      part(T.blk[2], w.x + Math.sin(w.yaw) * 0.8, 1.8, w.z + Math.cos(w.yaw) * 0.8, { add: true, size: 2.2, grow: 1.6, life: 0.35, op: 0.9 }); ctx.shake(0.25); return true }
    if (e.e === 'flockGo') { const w = e.w, s = Math.sin(w.yaw), c = Math.cos(w.yaw);
      for (let i = 0; i < 16; i++) { const off = (Math.random() - 0.5) * w.w, ox = c * off, oz = -s * off, d0 = -2 - Math.random() * 2; flyCrow({ x0: w.x + s * d0 + ox, y0: 1 + Math.random() * 1.6, z0: w.z + c * d0 + oz, x1: w.x + s * (w.len + 2) + ox, y1: 1 + Math.random() * 1.6, z1: w.z + c * (w.len + 2) + oz, life: 0.55 + Math.random() * 0.2, red: e.red, sz: 0.85 + Math.random() * 0.3, delay: Math.random() * 0.25, end: 'fade' }) }
      ctx.shake(0.3); return true }
    if (e.e === 'hornCharge') { const v = spkOf(e.s); if (v) v.shake = e.dur; return true }
    if (e.e === 'hornBlast') { const v = spkOf(e.s); if (v) v.shake = 0; hornWave(e.s, e.w, !!e.w.ult); shock(e.s.x, e.s.z, 6, 0x9fe8ff, 0.7); part(T.snd[0], e.s.x, 2.9, e.s.z, { size: 2, grow: 2.2, life: 0.4, add: true, op: 0.9 }); ctx.shake(0.35); return true }
    if (e.e === 'wallBump') { dust(e.x, e.z, 6, 1, 2.5, 0.4); part(T.star, e.x, 1.2, e.z, { size: 1.4, grow: 1.5, life: 0.35, add: true }); ctx.shake(0.4); return true }
    if (e.e === 'screamFx') { part(T.snd[5], e.x, (e.y || 0) + SCREAM_K * 0.85, e.z, { size: e.shriek ? 7 : 4.5, grow: 1.8, life: 0.7, add: true, op: 0.9 }); if (e.shriek) ctx.shake(0.6); return false }
    if (e.e === 'spkDie') { const v = spkOf(e.s); if (v) { v.broke = 1; v.bar.visible = false; for (let i = 0; i < 3; i++) part(T.snd[3], e.s.x, 3, e.s.z, { size: 1.6, grow: 1.6, life: 0.35, add: true, op: 1 }); ctx.shake(0.3) } ctx.UI.floatText(new THREE.Vector3(e.s.x, 3.6, e.s.z), '喇叭坏了', 'good'); return true }
    if (e.e === 'spkFix') { const v = spkOf(e.s); if (v) { v.broke = 0; v.horn.rotation.x = v.rx0; v.horn.rotation.z = v.rz0; part(G.ball, e.s.x, 3, e.s.z, { size: 1.4, grow: 1.6, life: 0.5, add: true, color: 0xff6040, op: 0.8 }) } return true }
    if (e.e === 'ringGo') { return true }
    if (e.e === 'ringGone') { const v = rings.get(e.id); if (v) { scene.remove(v); v.geometry.dispose(); v.material.dispose(); rings.delete(e.id) } return true }
    if (e.e === 'half') { ctx.UI.toast('尖啸者半血：嗜血了——伤害更高、闪得更勤，喇叭修好了', 'bad', 2600); halfT = 0; return true }
    return false;
  }

  /* ---------- 每帧：尖啸者 ---------- */
  function bossFrame(dt, clock, fight, phase, endT) {
    const B = fight.boss, P = fight.player;
    boss.position.set(B.x, B.y || 0, B.z); let dy = B.yaw - boss.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); boss.rotation.y += dy * Math.min(1, dt * 10);
    /* 闪现：缩一下没了 → 落点出现、伸展开 */
    let sc = 1; if (B.act === 'blink') sc = B.hidden ? 0 : Math.max(0.05, 1 - B.blink.t / SCREAM_CFG.vanishT); else if (B.act === 'appear') sc = clamp(1 - B.at / SCREAM_CFG.appearT, 0.05, 1);
    boss.visible = sc > 0.01; boss.scale.setScalar(0.4 + 0.6 * sc); if (sc < 1 && sc > 0) boss.scale.y = sc;
    if (curAct && B.anim === 'walk') curAct.timeScale = B.ts;
    mixer.update(dt * (B.slow > 0 ? 0.5 : 1));
    if (!B.dead) lookFrame(dt, B, P); else look.w = 0;
    if (JAW && B.cast && (B.cast.k === 'shriek' || B.cast.k === 'rings' || B.cast.k === 'bomb' || B.cast.k === 'horn')) JAW.rotation.x += 0.5 * Math.min(1, B.cast.t / B.cast.dur);   // 尖叫时下巴张到最大
    /* 嗜血 / 灭杀：身上一层暗红，脚下光环、身边红雾 */
    const red = fight.half || fight.rage; U.rage.value = red && !B.dead ? 0.22 + 0.1 * Math.sin(clock * 5) : 0;
    aura.material.opacity = red && !B.dead ? 0.55 + 0.25 * Math.sin(clock * 3) : 0; aura.rotation.y += dt * 0.8;
    fogS.forEach(s => { const u = s.userData; s.material.opacity = red && !B.dead ? 0.35 + 0.15 * Math.sin(clock * 1.3 + u.ph) : 0; s.position.set(Math.sin(clock * 0.4 + u.ph) * 1.4, 0.9 + 0.3 * Math.sin(clock + u.ph), Math.cos(clock * 0.4 + u.ph) * 1.4); s.scale.setScalar(2.4) });
    if (halfT >= 0) { halfT += dt; if (halfT < 1.6 && Math.random() < dt * 10) feathers(B.x, (B.y || 0) + 2.6, B.z, 1) }
    /* 平时手心一团黑羽毛旋涡（扔鸦弹的时候更大） */
    if (!B.dead && B.cast && B.cast.k === 'bolt' && Math.random() < dt * 12) { const h = handPos(); part(T.blk[2], h.x, h.y, h.z, { add: true, size: 0.9, grow: 1.2, life: 0.25, op: 0.7 }) }
    if (B.dead && endT > SCREAM_ANIM.die.hit && !boss.userData.fell) { boss.userData.fell = 1; dust(B.x + Math.sin(B.yaw) * 1.6, B.z + Math.cos(B.yaw) * 1.6, 10, 1.2, 3, 1.4); feathers(B.x, 1.2, B.z, 8, 1.6); ctx.shake(0.4) }
  }
  /* ---------- 每帧：场地 ---------- */
  function frame(dt, clock, fight) {
    redL.intensity = Math.sin(clock * 3) > 0.2 ? 3 : 0.4; redS.material.opacity = redL.intensity > 1 ? 1 : 0.25;
    for (const s of deco) { const u = s.userData; u.a += u.sp * dt; u.f += dt * 8; s.position.set(Math.sin(u.a) * u.r, u.y + Math.sin(clock + u.a) * 0.6, (RZ0 + RZ1) / 2 + Math.cos(u.a) * u.r); s.material.map = T.crow[Math.floor(u.f) % 4]; s.scale.set(u.sz * (u.sp > 0 ? 1 : -1), u.sz, 1) }
    /* 乌鸦飞：直线 + 一点弧、扇翅膀；到了就散羽毛 */
    for (let i = crows.length - 1; i >= 0; i--) { const c = crows[i]; c.t += dt; if (c.t < 0) { c.s.visible = false; continue } c.s.visible = true; const k = Math.min(1, c.t / c.life);
      c.s.position.set(c.x0 + (c.x1 - c.x0) * k, c.y0 + (c.y1 - c.y0) * k + Math.sin(k * Math.PI) * 0.4, c.z0 + (c.z1 - c.z0) * k);
      c.ph += dt * 18; c.s.material.map = (c.red ? T.crowR : T.crow)[k > 0.7 ? 5 : Math.floor(c.ph) % 4];
      const goRight = ctx.camera ? ((c.x1 - c.x0) >= 0) : true, sz = c.s.userData.sz; c.s.scale.set(goRight ? sz : -sz, sz, 1);
      if (k >= 1) { if (c.end === 'burst') feathers(c.x1, c.y1, c.z1, 3, 1.2); else if (c.end === 'fade') feathers(c.x1, c.y1, c.z1, 1, 1); scene.remove(c.s); c.s.material.dispose(); crows.splice(i, 1) } }
    /* 声波圆环：r ≤ 0 时还没出来（读条），在 BOSS 脚下淡淡画一圈先看缺口 */
    const live = new Set();
    for (const r of fight.rings || []) { live.add(r.id); let m = rings.get(r.id);
      const pre = r.r <= 0, R = pre ? 1.6 + (r.k < 0 ? 0 : 0.7 * (fight.rings.filter(q => q.x === r.x && q.z === r.z && q.r <= 0).indexOf(r))) : r.r, W = pre ? 0.25 : r.w;
      if (!m) { m = new THREE.Mesh(ringGeo(R, W, r.ga, r.hole), new THREE.MeshBasicMaterial({ color: r.k < 0 ? 0xff5040 : 0x5fe6ff, transparent: true, blending: ADD, depthWrite: false, fog: false, side: THREE.DoubleSide, toneMapped: false })); m.position.set(r.x, 0.07, r.z); m.renderOrder = 5; scene.add(m); rings.set(r.id, m) }
      else { m.geometry.dispose(); m.geometry = ringGeo(R, W, r.ga, r.hole) }
      m.material.opacity = pre ? 0.35 + 0.2 * Math.sin(clock * 10) : 0.85 * clamp(1 - (r.r - 30) / 15, 0, 1) }
    for (const [id, m] of rings) if (!live.has(id)) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); rings.delete(id) }
    for (let i = cones.length - 1; i >= 0; i--) { const c = cones[i]; c.t += dt; const k = c.t / c.life; if (k >= 1) { scene.remove(c.m); c.m.material.dispose(); cones.splice(i, 1); continue } c.m.material.opacity = 1 - k; c.m.scale.multiplyScalar(1 + dt * 0.6) }
    for (let i = shadows.length - 1; i >= 0; i--) { const s = shadows[i]; s.t += dt; const k = s.t / (s.dur + 0.25); if (k >= 1) { scene.remove(s.m); s.m.material.dispose(); shadows.splice(i, 1); continue } s.m.material.opacity = Math.min(1, s.t / 0.1) * (k > 0.8 ? (1 - k) / 0.2 : 1); s.m.rotation.y += dt }
    /* 喇叭：蓄力时抖、头上小血条；坏了歪着冒火花 */
    for (const v of spkVis) { const q = (fight.speakers || []).find(s => s.id === v.q.id) || v.q;
      if (v.shake > 0) { v.shake -= dt; v.horn.rotation.z = v.rz0 + Math.sin(clock * 60) * 0.05 } else if (!v.broke) v.horn.rotation.z = v.rz0;
      if (v.broke) { v.horn.rotation.x += (v.rx0 + 0.7 - v.horn.rotation.x) * Math.min(1, dt * 6); v.spark -= dt; if (v.spark <= 0) { v.spark = 0.4 + Math.random() * 0.8; part(T.snd[3], q.x + (Math.random() - 0.5) * 0.4, 2.7 + Math.random() * 0.5, q.z, { size: 0.8 + Math.random() * 0.6, life: 0.2, add: true, op: 1 }) } }
      v.bar.visible = !q.dead && q.hp < q.max; if (v.bar.visible) { const k = q.hp / q.max; v.fg.scale.x = Math.max(0.001, k); v.fg.position.x = -(1 - k) / 2; v.bar.position.set(q.x, 3.9, q.z); v.bar.quaternion.copy(ctx.camera.quaternion) } }
  }
  /* ---------- 小乌鸦（乌鸦群扫完留下 3 只，绕着主角啄；fbcore 的 mobs 里 crow: true） ---------- */
  const small = new Map();
  function spawnPus(m) { if (!m.crow) return; const s = crowSprite(m.red, 0.75); s.position.set(m.x, 1.4, m.z); small.set(m.id, { s, ph: Math.random() * 4 }) }
  function pusFrame(fight, dt) {
    for (const m of fight.mobs) { if (!m.crow) continue; const v = small.get(m.id); if (!v) continue;
      if (m.dead) { if (!v.gone) { v.gone = true; feathers(m.x, 1.3, m.z, 4, 1.2); scene.remove(v.s); v.s.material.dispose() } continue }
      v.ph += dt * 16; v.s.material.map = (m.red ? T.crowR : T.crow)[Math.floor(v.ph) % 4]; const dx = Math.cos(m.a); v.s.scale.set(dx >= 0 ? 0.75 : -0.75, 0.75, 1);
      v.s.position.set(m.x, 1.3 + Math.sin(v.ph * 0.3) * 0.15 + (m.rise > 0 ? m.rise * 2 : 0), m.z) }
    for (const [id, v] of small) if (!fight.mobs.find(m => m.id === id)) { if (!v.gone) { scene.remove(v.s); v.s.material.dispose() } small.delete(id) }
  }
  /* 灭杀：全部喇叭 + 信号塔一起轰，漫天乌鸦 */
  function doomFx() { const P = api.fight().player; for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28, r = 3 + Math.random() * 9; flyCrow({ x0: P.x + Math.sin(a) * 16, y0: 3 + Math.random() * 4, z0: P.z + Math.cos(a) * 16, x1: P.x + Math.sin(a + 3) * r, y1: 0.8 + Math.random() * 2, z1: P.z + Math.cos(a + 3) * r, life: 0.5 + Math.random() * 0.3, red: true, sz: 1.0, delay: Math.random() * 0.3, end: 'fade' }) }
    for (const v of spkVis) { hornWave(v.q, { yaw: Math.atan2(P.x - v.q.x, P.z - v.q.z), r: 11, ult: true }, true); shock(v.q.x, v.q.z, 8, 0xff8060, 0.8) } shock(SCREAM_CFG.tower.x, SCREAM_CFG.tower.z, 30, 0xff5040, 0.9) }
  function reset() {
    mixer.stopAllAction(); curAct = null; play('idle'); look.yaw = look.pitch = look.vy = look.vp = 0; look.w = 0; U.rage.value = 0; halfT = -1; boss.userData.fell = 0;
    boss.position.set(ARENA.boss.x, 0, ARENA.boss.z); boss.rotation.y = 0; boss.visible = true; boss.scale.setScalar(1);
    for (const c of crows) { scene.remove(c.s); c.s.material.dispose() } crows.length = 0; for (const [, m] of rings) { scene.remove(m); m.geometry.dispose() } rings.clear();
    for (const c of cones) scene.remove(c.m); cones.length = 0; for (const s of shadows) scene.remove(s.m); shadows.length = 0;
    for (const [, v] of small) scene.remove(v.s); small.clear();
    for (const v of spkVis) { scene.remove(v.o); scene.remove(v.bar); const i = occl.indexOf(v.o); if (i >= 0) occl.splice(i, 1) } spkVis.length = 0;
    for (const q of api.fight().speakers || []) mkSpeaker(q);
    syncCovers();
  }
  /* 镜头用的脸：头顶、下巴（世界坐标）。没有骨头（占位模型）时按身高算 */
  const face = () => { if (HEAD) { const h = HEAD.getWorldPosition(new THREE.Vector3()); return { x: h.x, z: h.z, top: h.y + 0.25, chin: h.y - 0.2 } } const y = boss.position.y; return { x: boss.position.x, z: boss.position.z, top: y + SCREAM_K + 0.1, chin: y + SCREAM_K * 0.82 } };
  const chestSpot = () => { const B = api.fight().boss; return { x: clamp(B.x + 2, ARENA.x0 + 1.5, ARENA.x1 - 1.5), z: clamp(B.z + 1.5, ARENA.z0 + 1.5, ARENA.z1 - 2) } };
  return { tox: false, face, boss, mixer, acts, play, mats, onEvent, bossFrame, frame, spawnPus, pusFrame, chestSpot, doomFx, reset, bone, look, occl, coverVis, castName: k => SCREAM_NAME[k] || k };
}
