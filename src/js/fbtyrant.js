/* ================= 设计 116：副本第 5 关「装甲暴君 · 废弃军事实验室」的画面（场地、暴君、掩体、能量柱、激光 / 导弹 / 护盾特效） =================
   战斗的数和规则在 fbcore.js（TYRANT_CFG、tyStep）；这里照 fbscream.js 的写法：buildTyrant(api) 返回这一关自己的 boss / 动作 / 每帧 / 事件。
   素材（116B 出）：models/fb5/ tyrant（BOSS，动作名见 TYRANT_ANIM；骨头 gun / pod_L / pod_R / core / head / neck）、plates（plate1～3）、door（南边防爆门）、tank（北边碎大培养舱）、
   console（控制台，复制几个摆两边）、covers（cart / ammo / base / cabinet）、pylon（pylon 柱子、socket 插座）；
   img/fb5/ floor、wall、fx_laser（3×2：红激光、导弹尾焰、爆炸火球、地面火、主炮光柱、熔化地面）、fx_shield（3×2：护盾罩、电弧、电磁脉冲环、牵引漩涡、封锁电火花、核心光）、decals（3×2：烧痕、弹坑、黄黑警示条、碎玻璃、绿色培养液）、boss_5。
   模型大小一律按包围盒缩（跟第 4 关一样）。 */
import * as THREE from 'three';
import { TYRANT_ANIM, TYRANT_K, TYRANT_CFG, TYRANT_NAME } from './fbcore.js';

export const TYRANT_ASSETS = ['fb5/tyrant', 'fb5/plates', 'fb5/door', 'fb5/tank', 'fb5/console', 'fb5/covers', 'fb5/pylon', 'fb/chest_1', 'fb/chest_2'];
const D = Math.PI / 180, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), hyp = Math.hypot;
const _box = new THREE.Box3(), _sz = new THREE.Vector3(), _v = new THREE.Vector3();

export function buildTyrant(api) {
  const { scene, g, T, tex, part, mark, dust, shock, glowTex, flatGeo, ADD, ctx, ARENA, COVERS } = api;
  const G = glowTex(), TY = TYRANT_CFG;
  const cells = url => [0, 1, 2, 3, 4, 5].map(i => { const t = tex(url); t.repeat.set(1 / 3, 1 / 2); t.offset.set((i % 3) / 3, i < 3 ? 0.5 : 0); return t });
  Object.assign(T, { floor: tex('img/fb5/floor.jpg', [3.5, 8]), wall: tex('img/fb5/wall.jpg', [8, 1.5]), lz: cells('img/fb5/fx_laser.png'), sh: cells('img/fb5/fx_shield.png'), dec: cells('img/fb5/decals.png') });
  /* 冷蓝 + 警报红 */
  scene.background = new THREE.Color(0x10161e); scene.fog = new THREE.Fog(0x10161e, 40, 90);
  const hemi = new THREE.HemisphereLight(0x9ab8d8, 0x202830, 1.3); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xc8e4ff, 1.35); key.position.set(-6, 20, 10); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -16, right: 16, top: 26, bottom: -26, near: 1, far: 70 }); key.target.position.set(0, 0, 3); scene.add(key, key.target);
  const alarmL = new THREE.PointLight(0xff2010, 0, 40, 1.2); alarmL.position.set(0, 7, 3); scene.add(alarmL);
  const X0 = ARENA.x0, X1 = ARENA.x1, Z0 = ARENA.z0, Z1 = ARENA.z1, W0 = X1 - X0, L0 = Z1 - Z0;
  const occl = [];
  const lam = (old, color) => new THREE.MeshLambertMaterial({ map: old && old.map || null, color: color ?? (old && !old.map && old.color ? old.color.getHex() : 0xffffff) });
  function piece(src, fit, x, y, z, ry = 0) {
    if (!src) return null;
    const k = src.clone(true); k.traverse(c => { if (c.isMesh) { const old = c.material; c.material = lam(old); c.castShadow = true; c.receiveShadow = true; if (!c.geometry.attributes.normal) c.geometry.computeVertexNormals() } });
    const inner = new THREE.Group(); inner.add(k); k.position.set(0, 0, 0); k.updateMatrixWorld(true); _box.setFromObject(k); _box.getSize(_sz);
    let s = 1; if (fit.h) s = fit.h / Math.max(_sz.y, 1e-4); else if (fit.w) s = fit.w / Math.max(_sz.x, 1e-4); else if (fit.fx) s = Math.min(fit.fx / Math.max(_sz.x, 1e-4), fit.fz / Math.max(_sz.z, 1e-4));
    const c = _box.getCenter(new THREE.Vector3()); k.position.set(-c.x, -_box.min.y, -c.z);
    const o = new THREE.Group(); inner.scale.setScalar(s); o.add(inner); o.position.set(x, y, z); o.rotation.y = ry; scene.add(o); o.userData.h = _sz.y * s; return o;
  }
  const node = (pack, name) => { const sc = g[pack] && g[pack].scene; if (!sc) return null; return name ? sc.getObjectByName(name) : sc };

  /* ---------- 地面：金属格栅地板 + 黄黑警示线；两边钢板墙；外面一圈地板 ---------- */
  { const fl = new THREE.Mesh(new THREE.PlaneGeometry(W0 + 2, L0 + 10), new THREE.MeshLambertMaterial({ map: T.floor, color: 0xc8d0d8 })); T.floor.repeat.set((W0 + 2) / 3.5, (L0 + 10) / 3.5);
    fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0, (Z0 + Z1) / 2); fl.receiveShadow = true; scene.add(fl);
    const wallMat = new THREE.MeshLambertMaterial({ map: T.wall, color: 0xb8c4d0 });
    for (const sd of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(L0 + 10, 7), wallMat); w.rotation.y = sd < 0 ? Math.PI / 2 : -Math.PI / 2; w.position.set(sd * (W0 / 2 + 1), 3.5, (Z0 + Z1) / 2); w.receiveShadow = true; scene.add(w) }
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W0 + 2, 7), wallMat.clone()); back.material.map = T.wall; back.position.set(0, 3.5, Z0 - 5); scene.add(back);
    /* 黄黑警示线（贴花）：沿两边、门口、培养舱前 */
    const stripe = (x, z, len, yaw) => { const m = new THREE.Mesh(flatGeo, new THREE.MeshLambertMaterial({ map: T.dec[2], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 })); m.scale.set(len, 1, 0.7); m.rotation.y = yaw; m.position.set(x, 0.016, z); m.renderOrder = 1; scene.add(m) };
    for (const sd of [-1, 1]) for (let z = Z0 + 2; z < Z1 - 1; z += 4.2) stripe(sd * (W0 / 2 - 0.35), z, 4, Math.PI / 2);
    stripe(0, Z1 - 0.6, 5, 0); stripe(0, Z0 + 1.2, 6, 0);
    /* 烧痕、弹坑、碎玻璃、培养液（不伤人） */
    for (let i = 0, n = 0; i < 80 && n < 12; i++) { const x = X0 + 0.8 + Math.random() * (W0 - 1.6), z = Z0 + 1 + Math.random() * (L0 - 2);
      if (COVERS.some(c => Math.abs(x - c.x) < c.hx + 0.8 && Math.abs(z - c.z) < c.hz + 0.8)) continue;
      const k = [0, 1, 3, 4][n % 4], m = new THREE.Mesh(flatGeo, new THREE.MeshLambertMaterial({ map: T.dec[k], transparent: true, depthWrite: false, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 }));
      m.scale.setScalar(1.4 + Math.random() * 1.2); m.rotation.y = Math.random() * 6.28; m.position.set(x, 0.015, z); m.renderOrder = 1; scene.add(m); n++ } }

  /* ---------- 北边：碎大培养舱（BOSS 从里面出来，地上一滩绿培养液）；南边：被炸开的防爆门；两边一排破培养舱（绿水、气泡）+ 控制台 ---------- */
  piece(node('tank'), { w: 4.2 }, 0, 0, Z0 - 2.2);
  { const m = new THREE.Mesh(flatGeo, new THREE.MeshLambertMaterial({ map: T.dec[4], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 })); m.scale.setScalar(5); m.position.set(0, 0.017, Z0 + 0.6); m.renderOrder = 1; scene.add(m) }
  const door = piece(node('door'), { w: 5.2 }, 0, 0, Z1 + 1.4, Math.PI);   // 116B：门面朝 +Z，转过来朝北（朝场内） if (door) occl.push(door);
  const tubes = [], bubbles = [];
  const glass = new THREE.MeshLambertMaterial({ color: 0x7ab8a8, transparent: true, opacity: 0.28, depthWrite: false }), goo = new THREE.MeshBasicMaterial({ color: 0x30e080, transparent: true, opacity: 0.45, depthWrite: false, fog: false });
  for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) { const z = Z0 + 4 + i * 7.6, x = sd * (W0 / 2 + 0.2), broken = (i + (sd > 0 ? 1 : 0)) % 3 === 0;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.4, 16), new THREE.MeshLambertMaterial({ color: 0x404850 })); base.position.set(x, 0.2, z); scene.add(base);
    const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, broken ? 1.2 : 2.6, 16, 1, true), glass); gl.position.set(x, broken ? 1.0 : 1.7, z); scene.add(gl);
    if (!broken) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 2.1, 16), goo); w.position.set(x, 1.45, z); scene.add(w); tubes.push({ x, z }) }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.25, 16), new THREE.MeshLambertMaterial({ color: 0x505860 })); cap.position.set(x, broken ? 1.65 : 3.05, z); scene.add(cap);
    const con = piece(node('console'), { w: 1.4 }, sd * (W0 / 2 + 0.3), 0, z + 3.6, sd < 0 ? Math.PI / 2 : -Math.PI / 2); if (con) con.userData.scr = Math.random() * 6 }
  for (let i = 0; i < 18; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.ball, color: 0x9affc8, transparent: true, blending: ADD, depthWrite: false, fog: false, opacity: 0.7 })); s.scale.setScalar(0.12); scene.add(s); bubbles.push({ s, t: Math.random() * 2, q: tubes[i % Math.max(1, tubes.length)] }) }
  /* 天花板一排红色警报灯在转 */
  const sirens = [];
  for (const sd of [-1, 1]) for (let z = Z0 + 1; z < Z1; z += 6.4) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.ball, color: 0xff3020, transparent: true, blending: ADD, depthWrite: false, fog: false })); s.position.set(sd * (W0 / 2 + 0.7), 5.6, z); s.scale.setScalar(1.2); scene.add(s); sirens.push({ s, ph: Math.random() * 6 }) }
  /* 垂下来的电缆 */
  for (let i = 0; i < 10; i++) { const h = 1.5 + Math.random() * 2.5, m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h, 5), new THREE.MeshLambertMaterial({ color: 0x1a1a1a })); m.position.set((Math.random() < 0.5 ? -1 : 1) * (W0 / 2 + 0.5 - Math.random() * 1.2), 7 - h / 2, Z0 + Math.random() * L0); m.rotation.z = (Math.random() - 0.5) * 0.3; scene.add(m) }

  /* ---------- 掩体（挡子弹、挡机炮、挡主炮；不挡激光、导弹、霰弹炮）+ 半血掉下来的装甲板 ---------- */
  const coverVis = new Map();
  function coverMesh(c) { const pk = /^plate/.test(c.k) ? 'plates' : 'covers', o = piece(node(pk, c.k), { fx: c.hx * 2.1, fz: c.hz * 2.1 }, c.x, 0, c.z, 0); if (!o) return null; occl.push(o); o.userData.c = c; return o }
  function syncCovers() { for (const [, v] of coverVis) { scene.remove(v); const i = occl.indexOf(v); if (i >= 0) occl.splice(i, 1) } coverVis.clear(); for (const c of COVERS) { const m = coverMesh(c); if (m) coverVis.set(c.id, m) } }
  syncCovers();
  /* ---------- 能量柱插座（平时发暗青光）；护盾时升起柱子（fbcore 的 mobs 里 pylon: true） ---------- */
  const sockets = (api.stage.sockets || []).map(q => { const o = piece(node('pylon', 'socket'), { w: 1.4 }, q.x, 0, q.z); const gl = new THREE.Mesh(flatGeo, new THREE.MeshBasicMaterial({ map: G.ring, color: 0x40d8ff, transparent: true, blending: ADD, depthWrite: false, fog: false, opacity: 0.35 })); gl.scale.setScalar(1.8); gl.position.set(q.x, 0.05, q.z); gl.renderOrder = 2; scene.add(gl); return { q, o, gl } });

  /* ---------- 装甲暴君 ---------- */
  const boss = new THREE.Group(); const bm = g.tyrant.scene; scene.add(boss);
  { bm.updateMatrixWorld(true); _box.setFromObject(bm); _box.getSize(_sz); const s = TYRANT_K / Math.max(_sz.y, 1e-4), c = _box.getCenter(new THREE.Vector3()); bm.scale.multiplyScalar(s); bm.position.set(-c.x * s, -_box.min.y * s, -c.z * s); boss.add(bm) }
  const mats = [], U = { rage: { value: 0 } };
  bm.traverse(c => { if (!c.isMesh) return; const old = c.material; c.material = lam(old); old.dispose(); c.frustumCulled = false; c.castShadow = true; c.receiveShadow = false; c.material.emissive = new THREE.Color(0); mats.push(c.material);
    c.material.onBeforeCompile = sh => { sh.uniforms.uRage = U.rage; sh.fragmentShader = 'uniform float uRage;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(0.5, 0.05, 0.02) * uRage + diffuseColor.rgb * 0.12;') } });
  const mixer = new THREE.AnimationMixer(bm), acts = {};
  for (const clip of g.tyrant.animations || []) { const a = mixer.clipAction(clip); if (!(TYRANT_ANIM[clip.name] || {}).loop) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true } acts[clip.name] = a }
  const bone = {}; bm.traverse(c => { if (c.isBone) bone[c.name] = c }); const HEAD = bone.head || bone.Head, NECK = bone.neck || bone.Neck, GUN = bone.gun, CORE = bone.core;
  let curAct = null;
  function play(name, ts = 1, fade = 0.25) { const a = acts[name]; if (!a) return; if (curAct === a) { a.timeScale = ts; if (!(TYRANT_ANIM[name] || {}).loop) { a.reset(); a.play() } return } a.reset(); a.timeScale = ts; a.setEffectiveWeight(1); a.play(); if (curAct) curAct.crossFadeTo(a, fade, false); curAct = a }
  const look = { yaw: 0, pitch: 0, vy: 0, vp: 0, w: 0 }, _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _a = new THREE.Vector3();
  function rotWorld(b, axis, ang) { if (!b || !ang) return; b.parent.getWorldQuaternion(_p); _q.setFromAxisAngle(axis, ang); const pi = _p.clone().invert(); b.quaternion.premultiply(pi.multiply(_q).multiply(_p)); b.updateMatrixWorld(true) }
  function lookFrame(dt, B, P) {
    if (!HEAD) return; const tgt = B.look === 'p' && !B.cast ? { x: P.x, z: P.z, y: 1.2 } : null; look.w = clamp(look.w + (tgt ? dt : -dt) / 0.35, 0, 1);
    boss.updateMatrixWorld(true); const h = HEAD.getWorldPosition(_v), by = boss.rotation.y; let wy = look.yaw, wp = look.pitch;
    if (tgt) { let a = Math.atan2(tgt.x - h.x, tgt.z - h.z) - by; a = Math.atan2(Math.sin(a), Math.cos(a)); wy = clamp(a, -60 * D, 60 * D); wp = clamp(Math.atan2(h.y - tgt.y, hyp(tgt.x - h.x, tgt.z - h.z)) - 10 * D, -20 * D, 30 * D) }
    const W = 3.5, Z = 0.6; look.vy += (W * W * (wy - look.yaw) - 2 * Z * W * look.vy) * dt; look.yaw += look.vy * dt; look.vp += (W * W * (wp - look.pitch) - 2 * Z * W * look.vp) * dt; look.pitch += look.vp * dt;
    const k = look.w * look.w * (3 - 2 * look.w); if (k <= 0.001) return;
    _a.set(0, 1, 0); rotWorld(NECK, _a, look.yaw * k * 0.4); rotWorld(HEAD, _a, look.yaw * k * 0.6);
    const wyaw = by + look.yaw * k; _a.set(Math.cos(wyaw), 0, -Math.sin(wyaw)); rotWorld(NECK, _a, look.pitch * k * 0.4); rotWorld(HEAD, _a, look.pitch * k * 0.6);
  }
  /* 胸口蓝核心：一直亮，放技能、破甲以后更亮；护盾罩 */
  const coreS = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.sh[5], transparent: true, blending: ADD, depthWrite: false, fog: false })); coreS.scale.setScalar(1.4); scene.add(coreS);
  const coreL = new THREE.PointLight(0x50c8ff, 2, 9, 1.5); scene.add(coreL);
  const dome = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.sh[0], transparent: true, blending: ADD, depthWrite: false, fog: false, opacity: 0 })); dome.scale.setScalar(TYRANT_K * 1.7); scene.add(dome);
  const corePos = () => { if (CORE) return CORE.getWorldPosition(new THREE.Vector3()); return new THREE.Vector3(boss.position.x + Math.sin(boss.rotation.y) * 0.6, boss.position.y + TYRANT_K * 0.62, boss.position.z + Math.cos(boss.rotation.y) * 0.6) };
  const gunPos = () => { if (GUN) return GUN.getWorldPosition(new THREE.Vector3()); const s = Math.sin(boss.rotation.y), c = Math.cos(boss.rotation.y); return new THREE.Vector3(boss.position.x - c * 1.0 + s * 1.2, TYRANT_K * 0.55, boss.position.z + s * 1.0 + c * 1.2) };
  const podPos = sd => { const b = sd < 0 ? bone.pod_L : bone.pod_R; if (b) return b.getWorldPosition(new THREE.Vector3()); const s = Math.sin(boss.rotation.y), c = Math.cos(boss.rotation.y); return new THREE.Vector3(boss.position.x + c * 0.9 * sd, TYRANT_K * 0.92, boss.position.z - s * 0.9 * sd) };

  /* ---------- 特效 ---------- */
  const flyers = [], beams = [], fireVis = new Map(), meltVis = new Map(), pyVis = new Map();
  const flat = (map, x, z, sx, sz, yaw, add = true, y = 0.05) => { const m = new THREE.Mesh(flatGeo, new THREE.MeshBasicMaterial({ map, transparent: true, blending: add ? ADD : THREE.NormalBlending, depthWrite: false, fog: false })); m.scale.set(sx, 1, sz); m.rotation.y = yaw; m.position.set(x, y, z); m.renderOrder = 3; scene.add(m); return m };
  const lineFlash = (w, map, col, life = 0.3) => { const L = w.len, m = flat(map, w.x + Math.sin(w.yaw) * L / 2, w.z + Math.cos(w.yaw) * L / 2, L, w.w * 1.8, w.yaw - Math.PI / 2, true, 0.6);   /* 光束贴图是横的：长度沿贴图 u */ m.material.color.setHex(col); flyers.push({ m, t: 0, life, fade: 1 }) };
  function boom(x, z, s = 1) { part(T.lz[2], x, 0.9 * s, z, { size: 2.4 * s, grow: 1.5, life: 0.45, add: true, op: 1 }); dust(x, z, Math.round(4 * s), 1, 2.5, 0.4); mark(T.dec[1], x, z, 1.6 * s, 5, Math.random() * 6) }
  /* 旋转激光：一条长光（红激光贴图横着拉长），跟着 fight.beam.ys 转 */
  function beamMesh() { const m = new THREE.Mesh(flatGeo, new THREE.MeshBasicMaterial({ map: T.lz[0], color: 0xffd0c0, transparent: true, blending: ADD, depthWrite: false, fog: false, toneMapped: false })); m.renderOrder = 6; scene.add(m); return m }
  let alarmT = 0, alarmCol = 0xff2010, empT = 0;

  function onEvent(e) {
    const F = api.fight(), B = F.boss;
    if (e.e === 'gunFire') { const h = gunPos(); for (let i = 0; i < e.n; i++) setTimeout(() => part(G.ball, h.x, h.y, h.z, { size: 0.9, grow: 1.4, life: 0.1, add: true, color: 0xffd060, op: 1 }), i * TY.gunGap * 1000); return true }
    if (e.e === 'gunHit') { const h = gunPos(); const to = new THREE.Vector3(e.bx, 0.4, e.bz), m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1), new THREE.MeshBasicMaterial({ color: 0xffe080, toneMapped: false, fog: false })); m.position.copy(h); m.lookAt(to); scene.add(m); flyers.push({ m, from: h, to, t: 0, life: 0.08, kill: 1 });
      part(G.star || G.ball, e.bx, 0.5, e.bz, { size: 0.9, grow: 1.4, life: 0.18, add: true, color: 0xffc060 }); if (!e.blocked) mark(T.dec[0], e.x, e.z, 0.9, 3, Math.random() * 6); return true }
    if (e.e === 'missGo') { for (const sd of [-1, 1]) part(T.lz[1], podPos(sd).x, podPos(sd).y + 0.3, podPos(sd).z, { vy: 6, size: 1.2, life: 0.35, add: true, op: 0.9 });
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.lz[1], transparent: true, blending: ADD, depthWrite: false, fog: false })); m.scale.setScalar(1.3); scene.add(m); const from = podPos(Math.random() < 0.5 ? -1 : 1); flyers.push({ m, from, to: new THREE.Vector3(e.x, 0.3, e.z), t: 0, life: e.fly, arc: 7, id: e.id, kill: 1 }); return true }
    if (e.e === 'missHit') { boom(e.x, e.z, 1.1); ctx.shake(0.25); return true }
    if (e.e === 'fires') { for (const f of e.list) if (!fireVis.has(f.id)) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.lz[3], transparent: true, blending: ADD, depthWrite: false, fog: false })); s.scale.setScalar(f.r * 2.2); s.position.set(f.x, f.r * 0.7, f.z); scene.add(s); fireVis.set(f.id, s) } return true }
    if (e.e === 'fireGone') { const s = fireVis.get(e.id); if (s) { scene.remove(s); s.material.dispose(); fireVis.delete(e.id) } return true }
    if (e.e === 'gridHit') { lineFlash(e.w, T.lz[0], 0xff6050, 0.25); if (e.w.v) ctx.shake(0.2); return true }
    if (e.e === 'alarm') { alarmT = e.dur; alarmCol = e.col === 'blue' ? 0x3080ff : 0xff2010; return true }
    if (e.e === 'carpetHit') { const pts = e.pts, n = Math.min(14, pts.length); for (let i = 0; i < n; i++) { const p = pts[Math.floor(Math.random() * pts.length)]; boom(p.x + (Math.random() - 0.5), p.z + (Math.random() - 0.5), 0.9 + Math.random() * 0.4) } ctx.shake(0.55); return true }
    if (e.e === 'beamGo') { for (let i = 0; i < e.n; i++) beams.push(beamMesh()); return true }
    if (e.e === 'beamEnd') { for (const m of beams) { scene.remove(m); m.material.dispose() } beams.length = 0; return true }
    if (e.e === 'shieldUp') { dome.material.opacity = 0.01; return true }
    if (e.e === 'shieldDown') { dome.material.opacity = 0; if (e.broken) { part(T.sh[2], B.x, 2, B.z, { size: 7, grow: 1.6, life: 0.6, add: true, op: 1 }); ctx.shake(0.6); ctx.UI.floatText(new THREE.Vector3(B.x, TYRANT_K + 1, B.z), '破盾！', 'x10') } return true }
    if (e.e === 'pylonDie') { const v = pyVis.get(e.m.id); boom(e.m.x, e.m.z, 1.2); part(T.sh[1], e.m.x, 1.5, e.m.z, { size: 2.6, grow: 1.4, life: 0.4, add: true, op: 1 }); if (v) v.fall = 0; ctx.shake(0.35); return true }
    if (e.e === 'pullGo') { part(T.sh[3], B.x, 0.2, B.z, { size: 8, grow: 0.6, life: e.dur, add: true, op: 0.9, spin: -4 }); return true }
    if (e.e === 'shotgunGo') { const w = e.w, m = flat(T.lz[4], w.x + Math.sin(w.yaw) * w.r * 0.5, w.z + Math.cos(w.yaw) * w.r * 0.5, w.r * 1.1, w.r * 1.2, w.yaw - Math.PI / 2, true, 1.2); flyers.push({ m, t: 0, life: 0.3, fade: 1 });
      for (let i = 0; i < 8; i++) { const a = w.yaw + (Math.random() - 0.5) * w.a; part(G.ball, w.x + Math.sin(a) * 2, 1.2, w.z + Math.cos(a) * 2, { vx: Math.sin(a) * 9, vz: Math.cos(a) * 9, size: 0.4, life: 0.3, add: true, color: 0xffd080 }) } ctx.shake(0.5); return true }
    if (e.e === 'empGo') { part(T.sh[2], B.x, 1.5, B.z, { size: 6, grow: 5, life: 0.7, add: true, op: 1 }); shock(B.x, B.z, 30, 0x60b0ff, 0.9); empT = 0.6; ctx.shake(0.7); return false }
    if (e.e === 'cannonGo') { const w = e.w; lineFlash(w, T.lz[4], 0xffffff, 0.5); const ex = w.x + Math.sin(w.yaw) * w.len, ez = w.z + Math.cos(w.yaw) * w.len; boom(ex, ez, 1.6); if (e.cv) { const m = coverVis.get(e.cv.id); if (m) m.traverse(o => { if (o.material && o.material.color) o.material.color.multiplyScalar(0.45) }) } ctx.shake(0.9); return true }
    if (e.e === 'meltGone') { const m = meltVis.get(e.id); if (m) { scene.remove(m); m.material.dispose(); meltVis.delete(e.id) } return true }
    if (e.e === 'coverNew') { const c = e.c, m = coverMesh(c); if (m) { coverVis.set(c.id, m); if (c.from) { m.userData.fly = { x0: c.from.x, z0: c.from.z, t: 0 }; m.position.set(c.from.x, TYRANT_K * 0.6, c.from.z) } } return true }
    if (e.e === 'half') { ctx.UI.toast('装甲暴君半血：装甲炸飞了——受伤更多，但火力更猛、走得更快', 'bad', 2600); for (let i = 0; i < 6; i++) part(G.ball, B.x, TYRANT_K * 0.6, B.z, { vx: (Math.random() - 0.5) * 8, vy: 4 + Math.random() * 3, vz: (Math.random() - 0.5) * 8, g: 12, size: 0.5, life: 0.7, add: true, color: 0xffa040 }); ctx.shake(0.6); return true }
    return false;
  }

  function bossFrame(dt, clock, fight, phase, endT) {
    const B = fight.boss, P = fight.player;
    boss.position.set(B.x, 0, B.z); let dy = B.yaw - boss.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); boss.rotation.y += dy * Math.min(1, dt * 6);
    if (curAct && B.anim === 'walk') curAct.timeScale = B.ts;
    mixer.update(dt * (B.slow > 0 ? 0.5 : 1));
    if (!B.dead) lookFrame(dt, B, P); else look.w = 0;
    if (GUN && fight.queue && fight.queue.length) GUN.rotation.y += dt * 25;   // 开火时转管
    const c = B.cast, cp = corePos(); coreS.position.copy(cp); coreL.position.copy(cp);
    let ck = 0.8 + 0.2 * Math.sin(clock * 3) + (fight.half ? 0.5 : 0); if (c && (c.k === 'cannon' || c.k === 'laser' || c.k === 'emp')) ck += 1.5 * Math.min(1, c.t / c.dur);
    if (B.dead) ck *= Math.max(0, 1 - (endT || 0) / 2); coreS.scale.setScalar(0.9 + 0.6 * ck); coreL.intensity = 1.5 * ck;
    dome.position.set(B.x, TYRANT_K * 0.45, B.z); if (B.shield) dome.material.opacity = Math.min(0.75, dome.material.opacity + dt * 2) * (0.9 + 0.1 * Math.sin(clock * 6));
    U.rage.value = fight.rage && !B.dead ? 0.2 + 0.1 * Math.sin(clock * 6) : 0;
    /* 走路每步地面轻震 */
    if (B.anim === 'walk' && !B.dead) { boss.userData.step = (boss.userData.step || 0) + dt * B.ts; if (boss.userData.step > TYRANT_ANIM.walk.T / 2) { boss.userData.step = 0; dust(B.x, B.z, 3, 0.9, 1.5, 0.8); ctx.shake(0.08) } }
    if (B.dead && endT > TYRANT_ANIM.die.hit && !boss.userData.fell) { boss.userData.fell = 1; dust(B.x + Math.sin(B.yaw) * 2, B.z + Math.cos(B.yaw) * 2, 14, 1.4, 3.5, 2.2); ctx.shake(0.7) }
  }
  function frame(dt, clock, fight) {
    /* 警报：激光网格（红）、电磁脉冲（蓝）时整个大厅闪 */
    if (alarmT > 0) alarmT -= dt; alarmL.color.setHex(alarmCol); alarmL.intensity = alarmT > 0 ? 3 * (0.5 + 0.5 * Math.sin(clock * 14)) : 0;
    for (const s of sirens) { const k = 0.5 + 0.5 * Math.sin(clock * (alarmT > 0 ? 10 : 3) + s.ph); s.s.material.opacity = 0.35 + 0.65 * k; s.s.material.color.setHex(alarmT > 0 ? alarmCol : 0xff3020) }
    for (const b of bubbles) { if (!b.q) continue; b.t += dt; if (b.t > 2) b.t = 0; b.s.position.set(b.q.x + Math.sin(b.t * 7 + b.q.z) * 0.3, 0.6 + b.t * 1.1, b.q.z + Math.cos(b.t * 5) * 0.3) }
    /* 飞的东西（导弹抛物线、机炮弹道）、闪一下的地面光 */
    for (let i = flyers.length - 1; i >= 0; i--) { const f = flyers[i]; f.t += dt; const k = Math.min(1, f.t / f.life);
      if (f.from) { f.m.position.lerpVectors(f.from, f.to, k); if (f.arc) f.m.position.y += f.arc * 4 * k * (1 - k) }
      if (f.fade) f.m.material.opacity = 1 - k;
      if (k >= 1) { scene.remove(f.m); if (f.m.material) f.m.material.dispose(); flyers.splice(i, 1) } }
    /* 旋转激光 */
    const Bm = fight.beam; if (Bm && Bm.ys) Bm.ys.forEach((y, i) => { const m = beams[i]; if (!m) return; const L = TY.laserLen; m.scale.set(L, 1, TY.laserW * 2.2); m.rotation.y = y - Math.PI / 2; m.position.set(Bm.x + Math.sin(y) * L / 2, 1.3, Bm.z + Math.cos(y) * L / 2);
      if (Math.random() < dt * 20) mark(T.dec[0], Bm.x + Math.sin(y) * (2 + Math.random() * (L - 2)), Bm.z + Math.cos(y) * (2 + Math.random() * (L - 2)), 0.9, 3, Math.random() * 6) });
    /* 熔化的地面 */
    for (const f of fight.melts || []) if (!meltVis.has(f.id)) { const m = flat(T.lz[5], f.x + Math.sin(f.yaw) * f.len / 2, f.z + Math.cos(f.yaw) * f.len / 2, f.len, f.w * 1.5, f.yaw - Math.PI / 2, false, 0.03); meltVis.set(f.id, m) }
    for (const [id, m] of meltVis) { const f = (fight.melts || []).find(q => q.id === id); if (f) m.material.opacity = Math.min(1, (f.life - f.t) / 0.8) }
    for (const [id, s] of fireVis) { const f = (fight.fires || []).find(q => q.id === id); if (f) s.material.opacity = Math.min(1, (f.life - f.t) / 0.5) * (0.85 + 0.15 * Math.sin(clock * 12 + id)) }
    /* 能量柱：插座升起、电弧、倒下 */
    const alive = [];
    for (const [id, v] of pyVis) { const m = (fight.mobs || []).find(q => q.id === id); if (m && !m.dead) alive.push(v);
      if (v.fall != null) { v.fall += dt; v.o.rotation.z = Math.min(1.4, v.fall * 3); v.o.position.y = -Math.max(0, v.fall - 0.6) * 2; if (v.fall > 1.6) { scene.remove(v.o); scene.remove(v.bar); pyVis.delete(id) } continue }
      if (m) { v.o.position.y = -2.6 * clamp(m.rise / 0.5, 0, 1); v.bar.visible = m.hp < m.max; if (v.bar.visible) { const k = m.hp / m.max; v.fg.scale.x = Math.max(0.001, k); v.fg.position.x = -(1 - k) / 2; v.bar.position.set(m.x, 3.3, m.z); v.bar.quaternion.copy(ctx.camera.quaternion) } } }
    arcFrame(alive, clock);
    for (const s of sockets) s.gl.material.opacity = 0.25 + 0.15 * Math.sin(clock * 2 + s.q.x);
    /* 装甲板飞出去落地 */
    for (const [, m] of coverVis) { const u = m.userData; if (!u.fly) continue; u.fly.t += dt; const k = Math.min(1, u.fly.t / 0.6), c = u.c; m.position.set(u.fly.x0 + (c.x - u.fly.x0) * k, TYRANT_K * 0.6 * (1 - k) + 2.5 * 4 * k * (1 - k), u.fly.z0 + (c.z - u.fly.z0) * k); m.rotation.x = (1 - k) * 6; if (k >= 1) { delete u.fly; u.box = null; boom(c.x, c.z, 0.8); ctx.shake(0.3) } }
    if (empT > 0) empT -= dt;
  }
  /* 电弧：活着的柱子之间连蓝色锯齿光（每帧重拉） */
  const arcs = [];
  function arcFrame(alive, clock) {
    const segs = []; for (let i = 0; i < alive.length; i++) { if (alive.length === 2 && i === 1) break; if (alive.length < 2) break; segs.push([alive[i].q, alive[(i + 1) % alive.length].q]) }
    while (arcs.length < segs.length) { const m = flat(T.sh[1], 0, 0, 1, 1, 0, true, 1.4); m.renderOrder = 6; arcs.push(m) }
    arcs.forEach((m, i) => { const s = segs[i]; m.visible = !!s; if (!s) return; const [a, b] = s, L = hyp(b.x - a.x, b.z - a.z); m.scale.set(1.2 + 0.3 * Math.sin(clock * 30 + i), 1, L); m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z); m.position.set((a.x + b.x) / 2, 1.4, (a.z + b.z) / 2); m.material.opacity = 0.7 + 0.3 * Math.random() });
  }
  function spawnPus(m) { if (!m.pylon) return;
    const o = piece(node('pylon', 'pylon'), { h: 2.6 }, m.x, -2.6, m.z) || new THREE.Group();
    const bar = new THREE.Group(), bg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.16), new THREE.MeshBasicMaterial({ color: 0x141414, depthTest: false, transparent: true, opacity: 0.85 })), fg = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.1), new THREE.MeshBasicMaterial({ color: 0x40d8ff, depthTest: false, transparent: true }));
    bg.renderOrder = 8; fg.renderOrder = 9; bar.add(bg, fg); bar.visible = false; scene.add(bar);
    pyVis.set(m.id, { o, bar, fg, q: m, fall: null }); part(T.sh[4], m.x, 0.5, m.z, { size: 2, grow: 1.5, life: 0.5, add: true }) }
  function pusFrame() {}
  function doomFx() { const B = api.fight().boss; part(T.sh[5], B.x, TYRANT_K * 0.6, B.z, { size: 6, grow: 6, life: 0.9, add: true, op: 1 }); for (let i = 0; i < 4; i++) shock(B.x, B.z, 12 + i * 10, 0xffffff, 0.9 - i * 0.15) }
  function reset() {
    mixer.stopAllAction(); curAct = null; play('idle'); look.yaw = look.pitch = look.vy = look.vp = 0; look.w = 0; U.rage.value = 0; boss.userData.fell = 0;
    boss.position.set(ARENA.boss.x, 0, ARENA.boss.z); boss.rotation.y = 0; boss.visible = true; dome.material.opacity = 0; alarmT = 0; empT = 0;
    for (const f of flyers) scene.remove(f.m); flyers.length = 0; for (const m of beams) scene.remove(m); beams.length = 0;
    for (const [, s] of fireVis) scene.remove(s); fireVis.clear(); for (const [, m] of meltVis) scene.remove(m); meltVis.clear();
    for (const [, v] of pyVis) { scene.remove(v.o); scene.remove(v.bar) } pyVis.clear(); for (const m of arcs) m.visible = false;
    syncCovers();
  }
  const face = () => { if (HEAD) { const h = HEAD.getWorldPosition(new THREE.Vector3()); return { x: h.x, z: h.z, top: h.y + 0.35, chin: h.y - 0.25 } } return { x: boss.position.x, z: boss.position.z, top: TYRANT_K + 0.1, chin: TYRANT_K * 0.84 } };
  const chestSpot = () => { const B = api.fight().boss; return { x: clamp(B.x + 2.6, ARENA.x0 + 1.5, ARENA.x1 - 1.5), z: clamp(B.z + 2, ARENA.z0 + 1.5, ARENA.z1 - 2) } };
  return { tox: false, face, boss, mixer, acts, play, mats, onEvent, bossFrame, frame, spawnPus, pusFrame, chestSpot, doomFx, reset, bone, look, occl, coverVis, empT: () => empT, castName: k => TYRANT_NAME[k] || k };
}
