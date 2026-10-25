/* ================= 设计 102：副本第 3 关「落石巨人 · 塌方采石场」的画面（场地、巨人、掩体、技能特效） =================
   战斗的数和规则在 fbcore.js（ROCK_CFG、rockStep）；这里照 fbtox.js 的写法：buildRock(api) 返回这一关自己的 boss / 动作 / 每帧 / 事件。
   - 场地照样式图：南边铁丝网门（左扇歪开）+ 警示牌，北边倒塌吊机（歪着、半埋碎石）；两条南北铁轨 x ±3（滚石路线）；两边采石场台阶石壁。
   - 掩体：开场 4 个（翻倒矿车、方石块堆、木吊架 + 锈油桶、大落石）；会被巨人抓起来扔掉、被滚石撞碎；山崩落石、半血掉下的一大块会变成新掩体。
   - 巨人：约主角 3 倍高；石拳一侧的裂缝橘光一明一暗地呼吸，放大招时更亮，半血后更亮；技能空档里头跟着主角转（跟毒囊一样）。 */
import * as THREE from 'three';
import { ROCK_ANIM, ROCK_K, ROCK_CFG } from './fbcore.js';

export const ROCK_ASSETS = ['fb3/golem', 'fb3/rk_set', 'fb3/rk_cover', 'fb3/rk_stone', 'fb/chest_1', 'fb/chest_2'];
const D = Math.PI / 180, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), hyp = Math.hypot;

export function buildRock(api) {
  const { scene, g, T, tex, part, mark, dust, rocks, shock, glowTex, flatGeo, ADD, ctx, ARENA, COVERS } = api;
  const G = glowTex();
  Object.assign(T, {
    gravel: tex('img/fb3/tex_gravel.jpg', [3, 7]), gravel2: tex('img/fb3/tex_gravel.jpg', [6, 4]), quarry: tex('img/fb3/tex_quarry.jpg'), rail: tex('img/fb3/tex_rail.jpg', [1, 6]),
    fx: Object.fromEntries(['burst', 'shards', 'crack', 'spikecrack', 'trail', 'lava'].map(k => [k, tex(`img/fb3/fx_${k}.png`)])),
    mk: Object.fromEntries(['crack', 'rubble', 'crater', 'drag', 'oil'].map(k => [k, tex(`img/fb3/mark_${k}.png`)])),
  });
  T.quarry.wrapS = T.quarry.wrapT = THREE.RepeatWrapping;
  /* 灰黄尘土天 */
  scene.background = new THREE.Color(0xb8ae98); scene.fog = new THREE.Fog(0xb4a990, 30, 78);
  scene.add(new THREE.HemisphereLight(0xf4ecd8, 0x6a5e4a, 1.3));
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.65); sun.position.set(-8, 20, 9); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 26, bottom: -26, near: 1, far: 70 }); sun.target.position.set(0, 0, 3); scene.add(sun, sun.target);
  const X0 = ARENA.x0, X1 = ARENA.x1, Z0 = ARENA.z0, Z1 = ARENA.z1, W0 = X1 - X0, L0 = Z1 - Z0;
  const occl = [];   // 设计 97：挡住主角时变半透明（铁丝网门、警示牌、石壁脚下的石头）
  const lam = (map, color = 0xffffff) => new THREE.MeshLambertMaterial({ map, color });
  const pieces = { set: g.rk_set.scene, cover: g.rk_cover.scene, stone: g.rk_stone.scene };
  /* 素材里的一件（按名字拿出来、换成兰伯特材质、开影子） */
  function piece(pack, name, s, x, y, z, ry = 0) {
    const src = pieces[pack].getObjectByName(name); if (!src) throw new Error('第 3 关模型里没有 ' + name);
    const k = src.clone(true); k.traverse(c => { if (c.isMesh) { c.material = lam(c.material.map); c.castShadow = true; c.receiveShadow = true } });
    const o = new THREE.Group(); o.add(k);   // 压缩过的模型自己带缩放（量化），外面再包一层来放大、摆位置
    o.position.set(x, y, z); o.rotation.y = ry; o.scale.setScalar(s); scene.add(o); return o;
  }

  /* ---------- 地面：碎石地 + 两条铁轨 + 外面一圈 ---------- */
  { const gr = new THREE.Mesh(new THREE.PlaneGeometry(W0 + 1, L0 + 1), lam(T.gravel, 0xe8e2d6)); gr.rotation.x = -Math.PI / 2; gr.position.set(0, 0, (Z0 + Z1) / 2); gr.receiveShadow = true; scene.add(gr);
    const out = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), lam(T.gravel2, 0xd8d0c0)); out.rotation.x = -Math.PI / 2; out.position.set(0, -0.02, Z1 + 14); out.receiveShadow = true; scene.add(out);
    const north = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), lam(T.gravel2, 0xcfc6b4)); north.rotation.x = -Math.PI / 2; north.position.set(0, -0.02, Z0 - 7.5); north.receiveShadow = true; scene.add(north);
    for (const x of ROCK_CFG.lanes) { const r = new THREE.Mesh(new THREE.PlaneGeometry(1.7, L0 + 9), new THREE.MeshLambertMaterial({ map: T.rail, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
      T.rail.repeat.set(1, (L0 + 9) / 6.6); r.rotation.x = -Math.PI / 2; r.position.set(x, 0.012, (Z0 + Z1) / 2 + 1.5); r.receiveShadow = true; r.renderOrder = 1; scene.add(r) }
    /* 装饰贴花：裂纹、碎石堆、锈水油污（不伤人） */
    const decoK = ['crack', 'rubble', 'oil', 'rubble', 'crack', 'oil', 'rubble'];
    for (let i = 0, n = 0; i < 60 && n < 12; i++) { const x = X0 + 0.8 + Math.random() * (W0 - 1.6), z = Z0 + 1 + Math.random() * (L0 - 2);
      if (ROCK_CFG.lanes.some(l => Math.abs(x - l) < 1.2) || COVERS.some(c => Math.abs(x - c.x) < c.hx + 0.8 && Math.abs(z - c.z) < c.hz + 0.8)) continue;
      const k = decoK[n % decoK.length], m = new THREE.Mesh(flatGeo, new THREE.MeshLambertMaterial({ map: T.mk[k], transparent: true, depthWrite: false, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 }));
      m.scale.setScalar(k === 'oil' ? 1.8 : 1.4 + Math.random()); m.rotation.y = Math.random() * 6.28; m.position.set(x, 0.015, z); m.renderOrder = 1; scene.add(m); n++ } }

  /* ---------- 两边采石场台阶石壁：往外斜的一大面（贴图本身就是一层层石台），从场地边往上 14 米 ---------- */
  function terrace(sd, len, zc) {
    const H = 15, t = T.quarry.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(len / 7.5, H / 7.5);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H, 1, 1), new THREE.MeshLambertMaterial({ map: t, color: 0xe8e2d8 }));
    m.rotation.order = 'YXZ'; m.rotation.y = sd > 0 ? -Math.PI / 2 : Math.PI / 2; m.rotation.x = -0.42;   // 往外仰 24°
    m.position.set(sd * (W0 / 2 + 0.1 + Math.sin(0.42) * H / 2), Math.cos(0.42) * H / 2, zc); m.receiveShadow = true; scene.add(m);
  }
  for (const sd of [-1, 1]) terrace(sd, L0 + 16, (Z0 + Z1) / 2 - 2);
  { const back = new THREE.Mesh(new THREE.PlaneGeometry(46, 12), new THREE.MeshLambertMaterial({ color: 0xe8e2d8 })); back.material.map = T.quarry.clone(); back.material.map.needsUpdate = true; back.material.map.repeat.set(46 / 6, 2); back.position.set(0, 6, Z0 - 14.5); scene.add(back) }
  /* 石壁脚下摆碎石（埋一截），南北两头也摆一些 */
  const rub = ['rubble_1', 'rubble_2', 'rubble_3'];
  for (const sd of [-1, 1]) for (let i = 0; i < 6; i++) { const o = piece('stone', rub[(i + (sd > 0 ? 1 : 0)) % 3], 4 + Math.random() * 3, sd * (W0 / 2 + 0.35 + Math.random() * 0.3), -0.15, Z0 + 1.5 + i * 5.6 + Math.random() * 2, Math.random() * 6); occl.push(o) }
  for (const [x, z, s] of [[-W0 / 2 + 0.6, Z1 - 0.2, 5], [W0 / 2 - 0.5, Z1 - 0.4, 4.4], [-W0 / 2 + 1, Z0 + 0.4, 5.5], [W0 / 2 - 1.2, Z0 + 0.6, 4.8]]) occl.push(piece('stone', rub[Math.floor(Math.random() * 3)], s, x, -0.2, z, Math.random() * 6));

  /* ---------- 南边：铁丝网门（左扇歪开）+ 两边铁丝网 + 警示牌 ---------- */
  { const gz = Z1 + 0.6, S = 7.2;
    occl.push(piece('set', 'gate_post_l', S, -2.05, 0, gz), piece('set', 'gate_post_r', S, 2.05, 0, gz));
    const dl = piece('set', 'gate_door_l', S, -1.15, 0, gz + 0.65, -0.95); dl.position.x = -1.65; occl.push(dl);   // 左扇歪开（往外推开）
    occl.push(piece('set', 'gate_door_r', S, 0.95, 0, gz));
    for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) occl.push(piece('set', sd < 0 ? 'gate_door_l' : 'gate_door_r', S, sd * (3.2 + i * 1.32), 0, gz + 0.05, 0));
    occl.push(piece('set', 'sign', 5.2, -3.4, 0, gz + 1.6, 0.35)) }

  /* ---------- 北边：倒塌吊机（歪着、一头埋进碎石堆里），巨人开场站在它前面 ---------- */
  { const cr = piece('set', 'crane', 10.5, 1.5, -1.0, Z0 - 4.2, 0.55); cr.rotation.z = -0.32; cr.rotation.x = 0.12;
    for (let i = 0; i < 6; i++) piece('stone', rub[i % 3], 5 + Math.random() * 3, -4 + i * 2.2 + Math.random(), -0.4, Z0 - 2.6 - Math.random() * 2.5, Math.random() * 6);
    piece('stone', 'fallen', 6, -5.2, -0.3, Z0 - 1.6, 0.8); piece('stone', 'boulder', 5, 5.6, -0.2, Z0 - 1.8, 0.3) }

  /* ---------- 空中飘的细灰（少量，别挡视线） ---------- */
  const motes = [];
  for (let i = 0; i < 14; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dust || G.ball, color: 0xe8dcc0, transparent: true, opacity: 0.0, depthWrite: false, fog: false }));
    s.userData = { x: X0 + Math.random() * W0, z: Z0 + Math.random() * L0, y: 1 + Math.random() * 6, vx: 0.2 + Math.random() * 0.3, ph: Math.random() * 6, sz: 0.25 + Math.random() * 0.35 }; scene.add(s); motes.push(s) }

  /* ---------- 掩体：每个掩体一组模型，跟 COVERS 同步（被抓走、撞碎、新落下） ---------- */
  const coverVis = new Map();
  function coverMesh(c) {
    const grp = new THREE.Group(); grp.position.set(c.x, 0, c.z); scene.add(grp);
    const add = (pack, name, s, x, z, ry) => { const o = piece(pack, name, s, 0, 0, 0, ry); scene.remove(o); o.position.set(x, 0, z); grp.add(o); return o };
    if (c.k === 'cart') add('cover', 'cover_cart', 6.2, 0, 0, 0.12);
    else if (c.k === 'blocks') add('cover', 'cover_blocks', 6.4, 0, 0, 0.3);
    else if (c.k === 'frame') { add('cover', 'cover_frame', 5.8, -0.25, -0.15, 0.2); add('cover', 'cover_barrels', 4.6, 0.45, 0.35, 1.0) }
    else if (c.k === 'fallen') add('stone', c.rain ? rub[Math.floor(Math.random() * 3)] : 'fallen', c.rain ? 8 : 5.8, 0, 0, Math.random() * 6);
    else if (c.k === 'chunk') add('stone', 'fallen', 6.2, 0, 0, Math.random() * 6);
    else if (c.k === 'spike') add('stone', 'pillar', 4.6, 0, 0, Math.random() * 6);
    grp.userData = { c, t: 0, rise: c.k === 'spike' ? 0 : 1, sink: -1 };
    if (c.k !== 'spike') occl.push(grp);   // 设计 97：挡住主角时变半透明
    return grp;
  }
  const unOccl = m => { const i = occl.indexOf(m); if (i >= 0) occl.splice(i, 1) };
  function syncCovers() { for (const [, v] of coverVis) { scene.remove(v); unOccl(v) } coverVis.clear(); for (const c of COVERS) coverVis.set(c.id, coverMesh(c)) }
  syncCovers();

  /* ---------- 巨人 ---------- */
  const boss = new THREE.Group(); const bm = g.golem.scene; bm.scale.setScalar(ROCK_K); boss.add(bm); scene.add(boss);
  const U = { glow: { value: 0.4 }, rage: { value: 0 } }, mats = [];
  bm.traverse(c => { if (!c.isMesh) return; const old = c.material; c.material = new THREE.MeshLambertMaterial({ map: old.map }); old.dispose(); c.frustumCulled = false; c.castShadow = true; c.receiveShadow = false;
    c.material.emissive = new THREE.Color(0); mats.push(c.material);
    /* 石化裂缝的橘光：贴图里橘黄的地方（红明显大于蓝）发光，一明一暗；狂暴时身上淡淡一层红 */
    c.material.onBeforeCompile = sh => { Object.assign(sh.uniforms, { uGlow: U.glow, uRage: U.rage });
      sh.fragmentShader = 'uniform float uGlow, uRage;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float orng = smoothstep(0.10, 0.26, diffuseColor.r - diffuseColor.b) * smoothstep(0.22, 0.45, diffuseColor.r);
        totalEmissiveRadiance += vec3(1.0, 0.45, 0.08) * orng * uGlow + vec3(0.42, 0.04, 0.02) * uRage;`) } });
  const mixer = new THREE.AnimationMixer(bm), acts = {};
  for (const clip of g.golem.animations) { const a = mixer.clipAction(clip); if (!(ROCK_ANIM[clip.name] || {}).loop) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true } acts[clip.name] = a }
  const bone = {}; bm.traverse(c => { if (c.isBone) bone[c.name] = c });
  const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _a = new THREE.Vector3();
  let curAct = null;
  function play(name, ts = 1, fade = 0.25) {
    const a = acts[name]; if (!a) return;
    if (curAct === a) { a.timeScale = ts; if (!(ROCK_ANIM[name] || {}).loop) { a.reset(); a.play() } return }
    a.reset(); a.timeScale = ts; a.setEffectiveWeight(1); a.play(); if (curAct) curAct.crossFadeTo(a, fade, false); curAct = a;
  }
  /* 头跟着主角转（有重量：弹簧慢慢跟、稍微过头再回来）；放技能时由动作接管，放完慢慢转回来 */
  const look = { yaw: 0, pitch: 0, vy: 0, vp: 0, w: 0 };
  function rotWorld(b, axis, ang) { if (!b || !ang) return; b.parent.getWorldQuaternion(_p); _q.setFromAxisAngle(axis, ang); const pi = _p.clone().invert(); b.quaternion.premultiply(pi.multiply(_q).multiply(_p)); b.updateMatrixWorld(true) }
  function lookFrame(dt, B, P) {
    const tgt = B.look === 'p' && !B.cast ? { x: P.x, z: P.z, y: 1.2 } : null;
    look.w = clamp(look.w + (tgt ? dt : -dt) / 0.35, 0, 1);
    boss.updateMatrixWorld(true); const h = bone.Head.getWorldPosition(_v), by = boss.rotation.y;
    let wy = look.yaw, wp = look.pitch;
    if (tgt) { let a = Math.atan2(tgt.x - h.x, tgt.z - h.z) - by; a = Math.atan2(Math.sin(a), Math.cos(a)); wy = clamp(a, -75 * D, 75 * D); const dd = hyp(tgt.x - h.x, tgt.z - h.z); wp = clamp(Math.atan2(h.y - tgt.y, dd) - 12 * D, -20 * D, 30 * D);
      /* 设计 102b：离主角 6 米内，越近脖子、头越往上抬（驼背 + 俯视镜头，近了只看得到头顶）：2.5 米内抬到 -38°，让脸朝上露出来 */
      let nk = clamp((6 - dd) / 3.5, 0, 1); nk = nk * nk * (3 - 2 * nk); wp = wp * (1 - nk) - 38 * D * nk; look.up = nk }
    const W = 4.0, Z = 0.5;
    look.vy += (W * W * (wy - look.yaw) - 2 * Z * W * look.vy) * dt; look.yaw += look.vy * dt;
    look.vp += (W * W * (wp - look.pitch) - 2 * Z * W * look.vp) * dt; look.pitch += look.vp * dt;
    const k = look.w * look.w * (3 - 2 * look.w); if (k <= 0.001) return;
    const yaw = look.yaw * k, pit = look.pitch * k;
    _a.set(0, 1, 0); rotWorld(bone.Chest, _a, yaw * 0.25); rotWorld(bone.Neck, _a, yaw * 0.3); rotWorld(bone.Head, _a, yaw * 0.45);
    const wyaw = by + yaw; _a.set(Math.cos(wyaw), 0, -Math.sin(wyaw)); if (pit < 0) rotWorld(bone.Chest, _a, pit * 0.3); rotWorld(bone.Neck, _a, pit * 0.45); rotWorld(bone.Head, _a, pit * 0.65);   // 设计 102b：往上抬时胸口也挺一点
  }

  /* ---------- 特效小工具 ---------- */
  const flyers = [];
  function boom(x, z, r, strong = 1) {   /* 砸地：尘爆 + 碎石飞溅 + 落石坑 */
    part(T.fx.burst, x, 0.9 * r, z, { size: r * 2.6, grow: 1.5, life: 0.5, op: 0.9 }); part(T.fx.shards, x, 0.7, z, { size: r * 2.2, grow: 1.3, life: 0.4, add: true, op: 0.8 });
    dust(x, z, Math.round(6 + 4 * strong), 1.1 * r, 2.5 + strong, r * 0.5); rocks(x, z, Math.round(4 + 4 * strong)); mark(T.mk.crater, x, z, r * 1.6, 4, Math.random() * 6);
  }
  const handPos = () => { const a = bone.R_Hand.getWorldPosition(new THREE.Vector3()), b = bone.L_Hand.getWorldPosition(new THREE.Vector3()); return a.add(b).multiplyScalar(0.5) };
  let held = null;   // 抓在手里的掩体模型
  const fall = [];   // 从天上掉下来的落石（山崩、石壁砸下、半血掉的那一块）
  function dropRock(x, z, t, s = 4) { const o = piece('stone', rub[Math.floor(Math.random() * 3)], s, x, 14, z, Math.random() * 6); fall.push({ o, x, z, t: 0, life: t, y0: 13 }) }
  const balls = new Map(), rifts = new Map(), spikes = [];

  function onEvent(e) {
    if (e.e === 'coverNew') { const c = e.c, m = coverMesh(c); coverVis.set(c.id, m);
      if (c.k === 'chunk') { const h = handPos(); m.userData.drop = { from: h, t: 0 } } else if (c.drop) { m.userData.drop = { from: new THREE.Vector3(c.x, 14, c.z), t: 0 } }   /* 设计 110：掩体不够 2 个，从天上掉一块补上 */ else if (c.k === 'fallen' && c.rain) { /* 落石雨留下的：落地那一下已经有特效 */ }
      return true }
    if (e.e === 'coverGone') { const m = coverVis.get(e.c.id); if (!m) return true; coverVis.delete(e.c.id); unOccl(m); m.traverse(o => { if (o.material) { o.material.opacity = 1; o.material.transparent = false; o.material.depthWrite = true; o.material.needsUpdate = true } });
      if (e.how === 'grab') { held = m; m.userData.held = true; return true }
      if (e.how === 'sink') { m.userData.sink = 0; spikes.push(m); return true }
      boom(e.c.x, e.c.z, 1.3, e.how === 'smash' ? 1.2 : 0.6); scene.remove(m); if (e.how === 'smash') ctx.shake(0.35); return true }
    if (e.e === 'throwGo') { const h = handPos(), o = piece('stone', rub[Math.floor(Math.random() * 3)], 3.2, h.x, h.y, h.z, 0); flyers.push({ o, from: h, to: new THREE.Vector3(e.x, 0.4, e.z), t: 0, life: e.fly, arc: 3, id: e.id }); return true }
    if (e.e === 'tossGo') { const h = handPos(); e.pts.forEach((p, i) => { let o = i === 0 && held ? held : piece('stone', 'fallen', 4.5, h.x, h.y, h.z, 0); if (o === held) { held = null; o.userData.held = false }
        flyers.push({ o, from: o.position.clone().setY(h.y), to: new THREE.Vector3(p.x, 0.6, p.z), t: 0, life: e.fly, arc: 5, spin: 3, id: p.id }) }); return true }
    if (e.e === 'rockHit') { const w = e.w;
      for (let i = flyers.length - 1; i >= 0; i--) if (flyers[i].id === w.id) { scene.remove(flyers[i].o); flyers.splice(i, 1) }
      if (e.k === 'sweep') { const a = w.yaw; for (let i = -2; i <= 2; i++) { const b = a + i * 0.6; dust(w.x + Math.sin(b) * 3, w.z + Math.cos(b) * 3, 3, 1.1, 3.5, 0.3) } part(T.fx.trail, w.x + Math.sin(a) * 2.6, 0.9, w.z + Math.cos(a) * 2.6, { size: 4.4, grow: 1.2, life: 0.35, op: 0.8 }); ctx.shake(0.3); return true }
      if (e.k === 'throw') { boom(w.x, w.z, 1.0, 0.6); ctx.shake(0.2); return true }
      if (e.k === 'toss') { boom(w.x, w.z, 1.9, 1.3); shock(w.x, w.z, 5, 0xe8d8b0, 0.6); ctx.shake(0.5); return true }
      if (e.k === 'wall') { for (let z = Z0 + 1; z < Z1; z += 3.2) { part(T.fx.burst, w.x, 1.4, z, { size: 3.4, grow: 1.4, life: 0.55, op: 0.85 }); rocks(w.x, z, 3) } ctx.shake(0.8); return true }
      if (e.k === 'rain') { boom(w.x, w.z, 1.4, 1); ctx.shake(0.25); return true }
      return true }
    if (e.e === 'ballGo') { const o = piece('stone', 'boulder', 6.6, e.b.x, 0, e.b.z, 0); balls.set(e.b.id, { o, last: e.b.z, tr: 0 }); ctx.shake(0.3); return true }
    if (e.e === 'ballBreak') { const v = balls.get(e.b.id); if (v) { scene.remove(v.o); balls.delete(e.b.id) } boom(e.b.x, e.b.z, 1.2, 0.7); return true }   /* 设计 110：滚石撞到掩体碎在前面（掩体不坏） */
    if (e.e === 'bossJump') { dust(e.x0, e.z0, 8, 1.4, 3, 1.2); return true }
    if (e.e === 'bossLand') { boom(e.x, e.z, 2.2, 1); ctx.shake(0.6); return true }
    if (e.e === 'ballGone') { const v = balls.get(e.b.id); if (v) { scene.remove(v.o); balls.delete(e.b.id) } return true }
    if (e.e === 'pillars') { for (const c of e.cells) { part(T.fx.spikecrack, c.x, 0.05, c.z, { size: e.s * 1.4, life: 0.6, op: 0.9 }); dust(c.x, c.z, 3, 0.9, 2, 0.4) } ctx.shake(0.45); return true }
    if (e.e === 'pillarWave') return true;
    if (e.e === 'rift') { const grp = new THREE.Group(); scene.add(grp);   /* 设计 102b：一整条连着的裂缝（代码画的裂缝带，沿线锯齿、首尾相接），不再是一块块印子 */
      const segs = e.r.segs, w = e.r.w;
      segs.forEach((sg, i) => { const fork = i > 0;   // 第 0 段是主干（从巨人脚下到分叉点），后面两段是 Y 字的两叉
        const tp = u => fork ? 1 - 0.75 * u : 0.55 + 0.45 * u;   // 主干越往前越宽，两叉越往外越细
        grp.add(riftStrip(sg, w * 1.9, tp, 0x000000, 0.3, 0, 1, 4));   // 外圈：地面压暗
        grp.add(riftStrip(sg, w * 0.95, tp, 0x1c120c, 0.95, 0.22, 0, 5));   // 黑缝（锯齿边）
        const g = riftStrip(sg, w * 0.42, tp, 0xffa050, 1, 0.12, 0.6, 6, true); g.userData.glow = 1; grp.add(g) });   // 缝里的橘光（会呼吸）
      rifts.set(e.r.id, { grp, t: 0, life: e.r.life }); ctx.shake(0.55); return true }
    if (e.e === 'riftGone') { const v = rifts.get(e.id); if (v) { scene.remove(v.grp); v.grp.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose() } }); rifts.delete(e.id) } return true }
    if (e.e === 'rainStart') { glowBoost = 1; return true }
    if (e.e === 'half') { ctx.UI.toast('落石巨人半血：石化那一侧裂开，走得更快了', 'bad', 2600); halfT = 0; return true }
    if (e.e === 'cast' && e.k === 'ava') return false;
    return false;
  }
  /* 设计 102b：沿一段线画一条裂缝带。宽 W，tp(u) 宽度比例，jag 边缘锯齿，soft 横向羽化（0 硬边） */
  let rseed = 1; const rr = () => ((rseed = (rseed * 16807) % 2147483647) / 2147483647);
  const riftTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 4; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 64, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.35, 'rgba(255,255,255,1)'); gr.addColorStop(0.65, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 4); return new THREE.CanvasTexture(c) })();
  function riftStrip(sg, W, tp, col, op, jag, soft, ro, add = false) {
    rseed = Math.floor((sg.x0 * 131 + sg.z0 * 71 + 1000) * 97) % 2147483646 + 1;
    const dx = sg.x1 - sg.x0, dz = sg.z1 - sg.z0, L = Math.hypot(dx, dz) || 1, N = Math.max(6, Math.round(L / 0.35)), px = dz / L, pz = -dx / L, pos = [], uv = [], idx = [];
    const off = []; for (let i = 0; i <= N; i++) off.push(i === 0 || i === N ? 0 : (rr() - 0.5) * 0.5);   // 中线左右折一点（两头不折，接得上）
    for (let i = 0; i <= N; i++) { const u = i / N, hw = W / 2 * tp(u), cx = sg.x0 + dx * u + px * off[i], cz = sg.z0 + dz * u + pz * off[i];
      const a = hw * (1 + (rr() - 0.5) * 2 * jag), b = hw * (1 + (rr() - 0.5) * 2 * jag);
      pos.push(cx - px * a, 0, cz - pz * a, cx + px * b, 0, cz + pz * b); uv.push(0, u, 1, u);
      if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2) } }
    const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); ge.setIndex(idx);
    const m = new THREE.Mesh(ge, new THREE.MeshBasicMaterial({ color: col, map: soft > 0 ? riftTex : null, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, fog: !add, toneMapped: !add, blending: add ? ADD : THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -2 - ro }));
    m.position.y = 0.015 + ro * 0.004; m.renderOrder = ro; m.userData.op = op; return m;
  }
  let glowBoost = 0, halfT = -1;

  /* ---------- 每帧：巨人 ---------- */
  function bossFrame(dt, clock, fight, phase, endT) {
    const B = fight.boss, P = fight.player;
    boss.position.set(B.x, B.jumpY || 0, B.z); let dy = B.yaw - boss.rotation.y;   /* 设计 110：跳过来时离地 */ dy = Math.atan2(Math.sin(dy), Math.cos(dy)); boss.rotation.y += dy * Math.min(1, dt * 8);
    if (curAct && (B.anim === 'walk' || B.anim === 'walk_fast')) curAct.timeScale = B.ts;
    mixer.update(dt * (B.slow > 0 ? 0.5 : 1));
    if (!B.dead) lookFrame(dt, B, P); else look.w = 0;
    /* 裂缝橘光：呼吸；放大招时越来越亮；半血以后更亮；倒下慢慢灭 */
    const c = B.cast, ava = c && c.k === 'ava';
    let gk = (0.45 + 0.3 * Math.sin(clock * 1.8)) * (fight.half ? 1.5 : 1);
    if (ava) gk += 1.2 * Math.min(1, c.t / c.dur) * (0.8 + 0.2 * Math.sin(clock * 20));
    if (glowBoost > 0) { glowBoost = Math.max(0, glowBoost - dt / 6); gk += 0.6 * glowBoost }
    if (B.dead) gk *= Math.max(0, 1 - (endT || 0) / 2.5);
    U.glow.value = gk;
    U.rage.value = fight.rage && !B.dead ? 0.18 + 0.12 * Math.sin(clock * 6) : 0;
    if (held) { held.position.copy(handPos()); held.position.y -= 0.6; held.rotation.y = boss.rotation.y }
    if (halfT >= 0) { halfT += dt; if (halfT < 1.2 && Math.random() < dt * 20) { const h = bone.R_Arm.getWorldPosition(_v); part(T.fx.shards, h.x, h.y, h.z, { vy: -2, size: 0.8, life: 0.5, add: true, op: 0.7 }) } }
    /* 倒下：最后一下砸地扬尘 */
    if (B.dead && endT > ROCK_ANIM.die.hit && !boss.userData.fell) { boss.userData.fell = 1; dust(B.x + Math.sin(B.yaw) * 2.6, B.z + Math.cos(B.yaw) * 2.6, 14, 1.4, 3.5, 2.6); ctx.shake(0.6) }
  }
  /* ---------- 每帧：场地 ---------- */
  function frame(dt, clock, fight) {
    for (const s of motes) { const u = s.userData; u.x += u.vx * dt; if (u.x > X1 + 2) u.x = X0 - 2; s.position.set(u.x, u.y + 0.3 * Math.sin(clock * 0.5 + u.ph), u.z); s.scale.setScalar(u.sz); s.material.opacity = 0.28 + 0.12 * Math.sin(clock + u.ph) }
    /* 飞行物（投石、扔掩体）：抛物线，打转 */
    for (let i = flyers.length - 1; i >= 0; i--) { const f = flyers[i]; f.t += dt; const k = Math.min(1, f.t / f.life);
      f.o.position.lerpVectors(f.from, f.to, k); f.o.position.y += f.arc * 4 * k * (1 - k); f.o.rotation.x += dt * (f.spin || 6); if (k >= 1 && f.t > f.life + 0.3) { scene.remove(f.o); flyers.splice(i, 1) } }
    /* 滚石：跟着逻辑里的位置走，边滚边转，后面一条尘带、地上留拖痕 */
    for (const b of fight.balls || []) { const v = balls.get(b.id); if (!v) continue; v.o.position.set(b.x, 0, b.z); v.o.rotation.x += (b.z - v.last) / 1.1; v.last = b.z;
      v.tr -= dt; if (v.tr <= 0) { v.tr = 0.12; part(T.fx.trail, b.x, 0.7, b.z - 1.2, { size: 2.6, grow: 1.4, life: 0.5, op: 0.6 }); dust(b.x, b.z - 0.8, 2, 0.9, 1.5, 0.6) }
      if (Math.floor(b.z / 4) !== Math.floor((b.z - 13 * dt) / 4)) mark(T.mk.drag, b.x, b.z - 2, 2.2, 3, 0) }
    /* 地裂：裂缝橘光呼吸，最后 1 秒淡掉 */
    for (const [, v] of rifts) { v.t += dt; const left = v.life - v.t, op = (0.75 + 0.25 * Math.sin(clock * 5)) * Math.min(1, left); v.grp.children.forEach(m => { m.material.opacity = m.userData.glow ? op : (m.userData.op ?? 1) * Math.min(1, left) }) }
    /* 落石（山崩起手、落石雨）：从天上掉下来，正好在预警填满时落地 */
    for (const w of fight.warns) if ((w.k === 'rain' || w.k === 'wall') && !w.fell && w.t >= w.dur - 0.55) { w.fell = true;
      if (w.k === 'rain') dropRock(w.x, w.z, 0.55, w.keep ? 5 : 3.6);
      else for (let z = Z0 + 1.5; z < Z1 - 1; z += 3.5) dropRock(w.x + (Math.random() - 0.5) * 1.2, z + Math.random() * 1.5, 0.55, 4 + Math.random() * 2) }
    for (let i = fall.length - 1; i >= 0; i--) { const f = fall[i]; f.t += dt; const k = Math.min(1, f.t / f.life); f.o.position.y = f.y0 * (1 - k * k); f.o.rotation.x += dt * 4;
      if (k >= 1) { if (f.o.scale.x < 0.01 || f.t > f.life + 0.05) { scene.remove(f.o); fall.splice(i, 1) } } }
    /* 掩体：石柱冒出来 / 沉下去；半血掉的那一块从手上掉到地上 */
    for (const [, m] of coverVis) { const u = m.userData; if (u.rise < 1) { u.rise = Math.min(1, u.rise + dt / 0.18); m.position.y = -2.2 * (1 - u.rise) }
      if (u.drop) { u.drop.t += dt; const k = Math.min(1, u.drop.t / 0.5); m.position.set(u.drop.from.x + (u.c.x - u.drop.from.x) * k, u.drop.from.y * (1 - k * k), u.drop.from.z + (u.c.z - u.drop.from.z) * k); if (k >= 1) { delete u.drop; u.box = null; boom(u.c.x, u.c.z, 1.4, 1); ctx.shake(0.45) } } }
    for (let i = spikes.length - 1; i >= 0; i--) { const m = spikes[i]; m.userData.sink += dt; const k = Math.min(1, m.userData.sink / 0.4); m.position.y = -2.4 * k; if (k >= 1) { scene.remove(m); spikes.splice(i, 1) } }
  }
  function reset() {
    mixer.stopAllAction(); curAct = null; play('idle'); look.yaw = look.pitch = look.vy = look.vp = 0; look.w = 0; U.rage.value = 0; glowBoost = 0; halfT = -1; boss.userData.fell = 0;
    boss.position.set(ARENA.boss.x, 0, ARENA.boss.z); boss.rotation.y = 0; boss.visible = true;
    for (const f of flyers) scene.remove(f.o); flyers.length = 0; for (const f of fall) scene.remove(f.o); fall.length = 0;
    for (const [, v] of balls) scene.remove(v.o); balls.clear(); for (const [, v] of rifts) scene.remove(v.grp); rifts.clear(); for (const m of spikes) scene.remove(m); spikes.length = 0;
    if (held) { scene.remove(held); held = null }
    syncCovers();
  }
  /* 镜头用的巨人的脸：头顶、下巴（世界坐标） */
  const face = () => { const h = bone.Head.getWorldPosition(new THREE.Vector3()); return { x: h.x, z: h.z, top: h.y + 0.11 * ROCK_K, chin: h.y - 0.05 * ROCK_K } };
  const NAME = { sweep: '石拳横扫', throw: '投石', grab: '抓掩体投掷', roll: '全场滚石', pillars: '石柱阵', rift: '地裂', ava: '山崩（大招）' };
  return { tox: false, face, boss, mixer, acts, play, mats, onEvent, bossFrame, frame, spawnPus: () => {}, pusFrame: () => {}, reset, bone, look, occl, coverVis, castName: k => NAME[k] || k };
}
