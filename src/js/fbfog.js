/* ================= 设计 84：台地上的毒雾——一团团会动的软雾（不是一块贴图） =================
   毒雾上涌那半边、半血以后两边收进来的那一条，都用这里画：
   - 雾团：很多张大团毒雾（fx_cloud）+ 毒雾丝（fx_wisp），一次画完（实例化，一个 draw call）。每团大小、角度、透明度、高度都不一样，
     慢慢飘、慢慢转、一胀一缩、一明一暗。贴近地面、崖壁的地方淡掉（软粒子），不会出现一刀切的底边。
   - 贴地雾：很淡（≤ 0.35），边用噪声做遮罩、一直在起伏，不是直线、不是矩形；判定的那条线上留一条淡淡的红边。
   判定照旧按矩形（fbcore.js），这里只管画。台地上同时最多 40 团左右；手机上帧数掉到 45 以下就少画几团、每团画大一点。 */
import * as THREE from 'three';
import * as FC from './fbcore.js';   // FC.ARENA：现在的场地（每打一次重新建，半血以后两边往里收）

const R = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const eOut = u => 1 - (1 - clamp(u, 0, 1)) ** 2.4, eIn = u => clamp(u, 0, 1) ** 2, eSm = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u) };
const MAXN = 64;

export function makeFog({ scene, T, X0, X1, Z0, Z1, W0, L0, camera }) {
  const HW = W0 / 2, ZC = (Z0 + Z1) / 2;
  /* ---------- 雾团：实例化的面片，顶点着色器里朝着镜头 ---------- */
  const base = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index; geo.setAttribute('position', base.attributes.position); geo.setAttribute('uv', base.attributes.uv);
  const aP = new THREE.InstancedBufferAttribute(new Float32Array(MAXN * 3), 3), aS = new THREE.InstancedBufferAttribute(new Float32Array(MAXN * 4), 4), aY = new THREE.InstancedBufferAttribute(new Float32Array(MAXN), 1);
  for (const a of [aP, aS, aY]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aP', aP); geo.setAttribute('aS', aS); geo.setAttribute('aY', aY); geo.instanceCount = 0;
  const U = { uCloud: { value: T.fx.cloud }, uWisp: { value: T.fx.wisp }, uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) },
    uPlat: { value: new THREE.Vector4(-HW, HW, Z0 - 0.35, Z1 + 0.35) }, uCol: { value: new THREE.Color(0xd2f0a0) }, uCol2: { value: new THREE.Color(0xc8ff8a) } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, depthTest: true,
    vertexShader: `attribute vec3 aP; attribute vec4 aS; attribute float aY; uniform vec3 uRight, uUp; varying vec2 vUv; varying float vA, vT; varying vec3 vW;
      void main() { vUv = uv; vA = aS.z; vT = aS.w; vec2 q = position.xy; q.y *= aY; if (aS.w > 0.5) q.y += 0.5 * aY - 0.5;
        float c = cos(aS.y), s = sin(aS.y); vec2 r = vec2(c * q.x - s * q.y, s * q.x + c * q.y) * aS.x;
        vec3 w = aP + uRight * r.x + uUp * r.y; vW = w; gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }`,
    fragmentShader: `uniform sampler2D uCloud, uWisp; uniform vec4 uPlat; uniform vec3 uCol, uCol2; varying vec2 vUv; varying float vA, vT; varying vec3 vW;
      void main() { vec4 t = vT < 0.5 ? texture2D(uCloud, vUv) : texture2D(uWisp, vUv);
        float dx = max(max(uPlat.x - vW.x, vW.x - uPlat.y), max(uPlat.z - vW.z, vW.z - uPlat.w));
        /* 离台地地面、崖壁多远：台地上面 = 高度；崖下 = 离崖壁（崖壁越往下越往外 0.22）多远 */
        float d = dx < 0.0 ? vW.y : (vW.y > 0.0 ? 9.0 : dx + 0.22 * vW.y);
        float a = t.a * vA * smoothstep(0.0, 0.85, d);
        if (a < 0.004) discard;
        gl_FragColor = vec4(t.rgb * (vT < 0.5 ? uCol : uCol2), a); }` });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 4; scene.add(mesh);

  /* ---------- 贴地雾：一块盖住台地的面，按区域画，边用噪声起伏 ---------- */
  const NR = 4;   // 0、1：毒雾上涌（最多两次叠着）；2：左边那条；3：右边那条
  const GU = { uT: { value: 0 }, uMist: { value: T.mist2 }, uReg: { value: Array.from({ length: NR }, () => new THREE.Vector4(0, 1, 0, 0)) }, uHit: { value: Array.from({ length: NR }, () => new THREE.Vector2(0, 0)) } };
  const gmat = new THREE.ShaderMaterial({ uniforms: GU, transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uT; uniform sampler2D uMist; uniform vec4 uReg[${NR}]; uniform vec2 uHit[${NR}]; varying vec3 vW;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() { float a = 0.0, red = 0.0;
        float nz = n2(vec2(vW.x * 0.7 + uT * 0.21, vW.z * 0.55 - uT * 0.13)) * 0.65 + n2(vec2(vW.x * 1.9 - uT * 0.4, vW.z * 1.6 + uT * 0.31)) * 0.35;
        float tex = texture2D(uMist, vW.xz * 0.11 + vec2(uT * 0.015, -uT * 0.01)).g;
        for (int i = 0; i < ${NR}; i++) { vec4 r = uReg[i]; if (r.z <= 0.0) continue;
          /* r.x：雾的内边（会动），r.y：哪一边（+1 往右 / -1 往左），r.z：浓淡，r.w：边起伏多少 */
          /* 设计 84 补：r.x = 判定线。线以内（有毒那边）整片够浓；线外侧 r.w 米（1.5～2）慢慢淡出，
             淡出带的宽度、浓淡都用噪声扰动，边是弯弯曲曲、一块一块的，跟着时间慢慢蠕动 */
          float s = r.y * (vW.x - r.x);
          float nA = n2(vec2(vW.z * 0.75 + uT * 0.12, vW.x * 0.6 - uT * 0.05 + float(i) * 7.0));
          float nB = n2(vec2(vW.z * 1.7 - uT * 0.18, vW.x * 1.5 + uT * 0.14 + float(i) * 3.0));
          float e = r.w * (0.6 * nA + 0.4 * nB);           // 绿色往判定线外面伸出去多远：0～r.w 米，弯弯曲曲
          float F = 0.45 + 0.55 * nB;                        // 再用多宽淡掉
          float m = smoothstep(-F, 0.2, s + e) * mix(0.5 + 0.5 * nB, 1.0, smoothstep(-0.3, 0.5, s));
          a = max(a, m * r.z * (0.75 + 0.25 * tex) * (0.85 + 0.3 * nz));
          if (uHit[i].y > 0.0) red = max(red, (1.0 - smoothstep(0.03, 0.09, abs(vW.x - uHit[i].x))) * uHit[i].y); }
        vec3 col = mix(vec3(0.6, 0.88, 0.34), vec3(1.0, 0.25, 0.12), red);
        float alpha = max(min(a, 0.35), red * 0.28);
        if (alpha < 0.004) discard; gl_FragColor = vec4(col, alpha); }` });
  const gnd = new THREE.Mesh(new THREE.PlaneGeometry(W0 + 1.2, L0, 1, 1), gmat); gnd.rotation.x = -Math.PI / 2; gnd.position.set(0, 0.05, ZC); gnd.renderOrder = 3; scene.add(gnd);
  const reg = Array.from({ length: NR }, () => ({ on: false, x: 0, sd: 1, k: 0, amp: 0.55, hit: 0, hitK: 0 }));

  /* ---------- 雾团的逻辑 ---------- */
  const P = [];   // 每团：{ x, y, z, sz, rot, rv, a, tex, st:0 冒丝 / 1 翻进来 / 2 停着翻滚 / 3 退回去 / 4 崖边冒起来, own, ... }
  let cap = 40, sm = 1, q = 1, fpsAcc = 0, fpsN = 0, fpsT = 0, goodT = 0;
  const room = (n = 1) => P.length + n <= cap;
  function add(o) { if (!room()) return null; const p = Object.assign({ t: 0, ph: R(0, 6.28), rot: R(0, 6.28), rv: R(-0.18, 0.18), tex: 0, ys: 1, vx: 0, vy: 0, vz: 0 }, o); P.push(p); return p }
  /* 毒雾丝：从崖下往上冒，越冒越淡 */
  function wisp(x, z, o = {}) { if (P.filter(p => p.st === 0).length >= Math.round(12 * q)) return null; return add(Object.assign({ st: 0, x, z, y: R(-2.6, -1.2), vy: R(1.1, 1.9), vx: 0, sz: R(1.3, 2.2), ys: 2.2, tex: 1, rot: 0, rv: 0, a0: R(0.32, 0.5), life: R(1.5, 2.3) }, o)) }
  /* 大团毒雾：从 (x0, y0) 翻到 (x1, y1, z)，dly 秒以后开始，用 dur 秒 */
  function roll(own, x0, x1, z, y1, dly, dur, sz, after) { return add({ st: 1, own, x: x0, y: -1.8, z, x0, x1, y1, z0: z, dly, dur, sz0: sz, sz: 0.01, a0: R(0.25, 0.55), drift: [R(-0.25, 0.25), R(-0.3, 0.3)], after }) }

  const zv = new Map();   // 毒雾上涌：每次一份
  const strip = [-1, 1].map(sd => ({ sd, w: 0, wv: 0, warn: false, nextOut: R(2, 4), wispT: 0, slot: sd < 0 ? 2 : 3 }));
  let warnSide = 0, warnK = 0, shrinkWarn = false;

  function zoneStart(z) {
    const sd = z.side, slot = zv.size % 2, v = { id: z.id, sd, t: 0, gone: -1, slot, eruptT: 0 };
    zv.set(z.id, v); const r = reg[slot]; Object.assign(r, { on: true, x: sd * HW, sd, k: 0.0, amp: 1.4, hit: 0, hitK: 0 });
    /* 0.6 秒内一团团翻进来：从崖边出来，近崖边的先到、远的后到，像浪 */
    const n = Math.round(26 * q);
    /* 地方不够：先让掉预警时冒的丝（最老的先走） */
    for (let i = 0; i < P.length && P.length + n + 6 > cap; ) { if (P[i].st === 0 || (P[i].st === 4 && P[i].own == null)) P.splice(i, 1); else i++ }
    for (let i = 0; i < n; i++) { const fx = R(0.05, 1), x1 = sd * (-0.5 + fx * (HW + 0.1)), zz = R(Z0 + 0.5, Z1 - 0.5);
      const dly = (1 - fx) * 0.18 + R(0, 0.14), y1 = Math.random() < 0.6 ? R(0.25, 1.2) : R(1.2, 2.5);
      roll(z.id, sd * (HW + R(0.3, 1.0)), x1, zz, y1, dly, Math.max(0.2, 0.6 - dly), R(2.8, 5.2) * sm) }
  }
  function zoneEnd(v) {
    v.gone = 0;
    for (const p of P) if (p.own === v.id && (p.st === 1 || p.st === 2)) { p.st = 3; p.t = 0; p.dly = R(0, 0.4) + (1 - Math.abs(p.x) / HW) * 0.15; p.xr = p.x; p.yr = p.y; p.ar = p.a }
  }

  function setRed(slot, x, k) { reg[slot].hit = x; reg[slot].hitK = k }

  /* 每帧。st：{ cast（BOSS 在放的招）, zones, x0, x1（现在的场地两边）, half } */
  function update(dt, clock, fight) {
    /* 帧数：2 秒看一次，掉到 45 以下少画几团、画大一点；好了再慢慢加回来（测试可以用 window.__fogQ 固定） */
    fpsAcc += dt; fpsN++; fpsT += dt;
    if (fpsT >= 2) { const fps = fpsN / fpsAcc; fpsAcc = fpsN = fpsT = 0;
      if (typeof window !== 'undefined' && window.__fogQ) q = window.__fogQ;
      else if (fps < 45) { q = Math.max(0.5, q - 0.25); goodT = 0 } else if (fps > 55 && q < 1) { goodT += 2; if (goodT >= 6) { q = Math.min(1, q + 0.25); goodT = 0 } }
      cap = Math.round(40 * q); sm = 1 / Math.sqrt(q) }
    GU.uT.value = clock;
    const c = fight.boss && fight.boss.cast;
    /* 毒雾上涌预警：那一侧崖边越冒越多毒雾丝 */
    if (c && c.k === 'surge' && !fight.boss.dead) { warnSide = c.side; warnK = clamp(c.t / c.dur, 0, 1) } else warnK = 0;
    if (warnK > 0) { const rate = 4 + 18 * warnK; if (Math.random() < dt * rate) wisp(warnSide * (HW + R(0.1, 0.9)), R(Z0, Z1), { vx: -warnSide * R(0.1, 0.4), vy: R(1.3, 2.4) * (0.7 + warnK * 0.6), a0: R(0.35, 0.55) });
      if (warnK > 0.7 && Math.random() < dt * 5) add({ st: 4, x: warnSide * (HW + R(0.4, 1.1)), z: R(Z0 + 1, Z1 - 1), y: -2.4, vy: R(1.2, 2), sz0: R(1.8, 3) * sm, sz: 1, a0: R(0.25, 0.4), life: R(0.9, 1.3), rv: R(-0.3, 0.3) }) }
    /* 毒雾上涌：每次一份 */
    const live = new Set();
    for (const z of fight.zones) { live.add(z.id); if (!zv.has(z.id)) zoneStart(z) }
    for (const [id, v] of zv) {
      v.t += dt; const r = reg[v.slot];
      if (!live.has(id) && v.gone < 0) zoneEnd(v);
      if (v.gone < 0) {
        /* 贴地雾跟着翻进来：内边从崖边推到场地中线 */
        const k = eOut(v.t / 0.6); r.x = v.sd * HW * (1 - k); r.k = 0.34 * eSm(v.t / 0.4); setRed(v.slot, 0, 0);   // 设计 84 补：不再画直的红线（看着像框）
        /* 崖边随机位置冒起来再散开的几团（同时 6～10 团，各自不同时刻） */
        v.eruptT -= dt; const er = P.filter(p => p.st === 4 && p.own === id).length;
        if (v.t > 0.3 && P.length < cap && (er < 6 || (er < 9 && v.eruptT <= 0))) { v.eruptT = R(0.15, 0.4); add({ st: 4, own: id, x: v.sd * (HW + R(0.2, 1.0)), z: R(Z0 + 0.5, Z1 - 0.5), y: R(-2.8, -1.8), vy: R(1.4, 2.4), vx: -v.sd * R(0.2, 0.6), sz0: R(2.2, 4.2) * sm, sz: 1, a0: R(0.28, 0.48), life: R(1.2, 1.8), rv: R(-0.35, 0.35) }) }
      } else {
        v.gone += dt; const k = eIn(v.gone / 0.8); r.x = v.sd * (HW + 2.2) * k; r.k = 0.34 * (1 - eSm((v.gone - 0.4) / 0.5)); setRed(v.slot, 0, 0);
        if (v.gone > 1.2 && !P.some(p => p.own === id)) { r.on = false; zv.delete(id) }
      }
    }
    /* 半血以后两边的那一条 */
    const want = { '-1': FC.ARENA.x0 - X0, '1': X1 - FC.ARENA.x1 };
    for (const s of strip) {
      const w = Math.max(0, want[s.sd] || 0), r = reg[s.slot];
      if (w > s.w + 0.01) {   // 收进来：从崖边慢慢爬进来（1.2 秒），几团大雾跟着往里爬
        const n = Math.min(8, Math.max(2, cap - P.length - 4));
        for (let i = 0; i < n; i++) { const z = R(Z0 + 0.5, Z1 - 0.5), dly = R(0, 0.5); roll('k' + s.sd, s.sd * (HW + R(0.3, 1)), s.sd * (HW - w + R(-0.1, 0.5)), z, R(0.25, 1.3), dly, R(0.8, 1.2), R(2, 3.4) * sm, { life: R(2.5, 4.5), home: s.sd * (HW - w * 0.5), homeW: w * 0.5 + 0.6, drift: [s.sd * 0.05, R(-0.25, 0.25)] }) }
        s.w0 = s.w; s.wv = 0; s.w = w }
      s.wv += dt; const cur = s.w > 0 ? (s.w0 || 0) + (s.w - (s.w0 || 0)) * eSm(s.wv / 1.2) : 0;
      r.on = cur > 0.01; r.sd = s.sd; r.x = s.sd * (HW - cur); r.amp = 1.2; r.k = cur > 0.01 ? 0.32 : 0;
      setRed(s.slot, 0, 0);
      /* 收进来以后：那一条一直有雾在翻滚、往上冒丝，偶尔一团往里飘一点再散 */
      if (cur > 0.01) {
        const mine = P.filter(p => p.own === 'k' + s.sd).length, need = Math.round((6 + 3 * Math.min(2, (fight.shrink || 1))) * q);
        if (mine < need && Math.random() < dt * 6) add({ st: 2, own: 'k' + s.sd, x: s.sd * (HW - cur * R(0.1, 0.9) + R(0, 0.9)), z: R(Z0 + 0.3, Z1 - 0.3), y: R(0.25, 1.5), sz0: R(2, 3.4) * sm, sz: 0.01, a0: R(0.25, 0.5), life: R(4, 7), grow: 0, drift: [s.sd * R(-0.05, 0.08), R(-0.25, 0.25)], home: s.sd * (HW - cur * 0.5), homeW: cur * 0.5 + 0.6 });
        s.wispT -= dt; if (s.wispT <= 0) { s.wispT = R(0.4, 0.8); wisp(s.sd * (HW - cur * R(0, 1)), R(Z0, Z1), { y: R(-0.4, 0.2), vy: R(0.8, 1.4), sz: R(1, 1.7), a0: R(0.25, 0.4), life: R(1.4, 2) }) }
        s.nextOut -= dt; if (s.nextOut <= 0) { s.nextOut = R(2, 4); add({ st: 5, own: 'o', x: s.sd * (HW - cur), z: R(Z0 + 1, Z1 - 1), y: R(0.4, 1.2), vx: -s.sd * R(0.45, 0.7), sz0: R(2, 3) * sm, sz: 0.01, a0: R(0.25, 0.4), life: R(1.8, 2.4) }) }
      }
    }
    /* 收之前：两边那条范围里开始冒毒雾丝 */
    if (shrinkWarn) for (const sd of [-1, 1]) if (Math.random() < dt * 5) wisp(sd * (HW - R(0, 0.9)), R(Z0, Z1), { y: R(-0.6, 0.1), vy: R(0.9, 1.5), sz: R(1.1, 1.8), a0: R(0.3, 0.45) });

    /* ---------- 动起来 ---------- */
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; p.t += dt; p.rot += p.rv * dt; let kill = false;
      const pulse = 1 + 0.08 * Math.sin(clock * 0.9 + p.ph), glow = 0.85 + 0.15 * Math.sin(clock * 0.7 + p.ph * 1.7);
      if (p.st === 0) { const k = p.t / p.life; p.x += p.vx * dt; p.y += p.vy * dt; p.a = p.a0 * Math.sin(Math.PI * clamp(k, 0, 1)); p.sz *= 1 + dt * 0.25; kill = k >= 1 }
      else if (p.st === 1) { const u = (p.t - p.dly) / p.dur;   // 翻进来：先往上翻出崖边，再往里滚，落到自己的高度
        if (u < 0) { p.a = 0 } else { const k = eOut(u); p.x = p.x0 + (p.x1 - p.x0) * k; p.y = -1.8 + (p.y1 + 1.8) * eOut(u * 1.6) + 0.8 * Math.sin(Math.PI * clamp(u, 0, 1)); p.sz = p.sz0 * (0.35 + 0.65 * eOut(u)); p.a = p.a0 * eSm(u * 2.5); p.rot += (p.x1 > p.x0 ? -1 : 1) * dt * 1.6 * (1 - k);
          if (u >= 1) { p.st = 2; p.t = 0; p.life = 1e9; if (p.after) { Object.assign(p, p.after); p.t = 0.8 } } } }
      else if (p.st === 2) { p.x += p.drift[0] * dt; p.z += p.drift[1] * dt; p.y += Math.sin(clock * 0.8 + p.ph) * 0.05 * dt;
        if (p.home != null) { if (Math.abs(p.x - p.home) > p.homeW) p.drift[0] = -Math.sign(p.x - p.home) * Math.abs(p.drift[0] || 0.05) }
        else if (p.own != null && zv.has(p.own)) { const v = zv.get(p.own); if (v.sd * p.x < 0.2 || v.sd * p.x > HW - 0.3) p.drift[0] = -p.drift[0] }
        if (p.z < Z0 + 0.3 || p.z > Z1 - 0.3) p.drift[1] = -p.drift[1];
        if (p.sz0 && p.sz < p.sz0) p.sz = Math.min(p.sz0, p.sz + dt * p.sz0 * 1.5);
        const fade = p.life < 1e8 ? Math.min(1, p.t / 0.8, (p.life - p.t) / 1.2) : 1; p.a = p.a0 * glow * clamp(fade, 0, 1); p.szp = pulse; kill = p.t >= p.life }
      else if (p.st === 3) { const u = (p.t - p.dly) / 0.6;   // 退回崖边：一团团往外退、变淡，过了崖边就掉下去
        if (u > 0) { const k = eIn(u); const ex = Math.sign(p.xr || 1) * (HW + 0.8); p.x = p.xr + (ex - p.xr) * k; p.a = p.ar * (1 - 0.7 * k); if (Math.abs(p.x) > HW) { p.vy -= 9 * dt; p.y += p.vy * dt; p.a *= clamp(1 + p.y / 3, 0, 1) } }
        kill = u > 1.6 || p.y < -4 }
      else if (p.st === 4) { const k = p.t / p.life; p.y += p.vy * dt * (1 - 0.6 * k); p.x += (p.vx || 0) * dt; p.sz = p.sz0 * (0.5 + 0.8 * eOut(k)); p.a = p.a0 * Math.sin(Math.PI * clamp(k, 0, 1)) ** 0.7; kill = k >= 1 }
      else if (p.st === 5) { const k = p.t / p.life; p.x += p.vx * dt * (1 - k); p.sz = p.sz0 * (0.6 + 0.6 * k); p.a = p.a0 * Math.sin(Math.PI * clamp(k, 0, 1)); kill = k >= 1 }
      if (kill) P.splice(i, 1) }
    /* 画：从远到近排好（半透明叠起来才对） */
    const cp = camera.position; for (const p of P) p.d = (p.x - cp.x) ** 2 + (p.y - cp.y) ** 2 + (p.z - cp.z) ** 2;
    P.sort((a, b) => b.d - a.d);
    camera.updateMatrixWorld(); const m = camera.matrixWorld.elements; U.uRight.value.set(m[0], m[1], m[2]); U.uUp.value.set(m[4], m[5], m[6]);
    const n = Math.min(MAXN, P.length);
    for (let i = 0; i < n; i++) { const p = P[i]; aP.array.set([p.x, p.y, p.z], i * 3); aS.array.set([p.sz * (p.szp || 1), p.rot, clamp(p.a || 0, 0, 0.6), p.tex], i * 4); aY.array[i] = p.ys }
    geo.instanceCount = n; aP.needsUpdate = aS.needsUpdate = aY.needsUpdate = true;
    for (let i = 0; i < NR; i++) { const r = reg[i]; GU.uReg.value[i].set(r.x, r.sd, r.on ? r.k : 0, r.amp); GU.uHit.value[i].set(r.hit, r.on ? r.hitK : 0) }
  }
  function warnShrink(on) { shrinkWarn = on }
  function reset() { P.length = 0; zv.clear(); for (const r of reg) r.on = false; for (const s of strip) { s.w = 0; s.w0 = 0; s.wv = 0 } shrinkWarn = false; geo.instanceCount = 0 }
  const info = () => ({ n: P.length, cap, q, zones: zv.size, reg: reg.map(r => r.on ? +r.k.toFixed(2) : 0) });
  return { update, warnShrink, reset, info, mesh, gnd, P };
}
