/* ================= 设计 56：院子东北角的传送门（副本入口） =================
   门框是混元模型（portal.glb，正面朝 +z）；门洞里是漩涡（黑底手绘图，叠加发光，按门洞形状裁：下面方、上面圆拱），慢慢转、一明一暗；
   门边飘光点（光效 1、2 格），地上一圈光圈（光效 4 格）。不在画面里时不动（省电）。 */
import * as THREE from 'three';
import { loadGLB, lazyTex } from './assets.js';

const H = { w: 0.25, y0: 0.09, sp: 0.575, r: 0.125 };   // 门洞（模型单位）：宽、底、圆拱圆心高度、半径
export const PORTAL_H = 4.7;                             // 门有多高（米）
const tex = (u, srgb = true) => { const t = lazyTex(u); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t };
let GLOW = null;
export function glowTex() {
  if (!GLOW) GLOW = { ball: tex('img/fb/glow_ball.jpg'), star: tex('img/fb/glow_star.jpg'), pillar: tex('img/fb/glow_pillar.jpg'), ring: tex('img/fb/glow_ring.jpg') };
  return GLOW;
}
const add = THREE.AdditiveBlending;
export const glowMat = (map, color, op = 1) => new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity: op, blending: add, depthWrite: false, fog: false, toneMapped: false });
export const glowSprite = (map, color, op = 1) => new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, opacity: op, blending: add, depthWrite: false, fog: false, toneMapped: false }));

/* 漩涡：在门洞里转，外面裁掉 */
function vortexMat() {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: tex('img/fb/vortex.jpg') }, t: { value: 0 }, k: { value: 1 }, flash: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D map; uniform float t, k, flash; varying vec2 vUv;
      void main(){
        float w = ${H.w.toFixed(3)}, y0 = ${H.y0.toFixed(3)}, sp = ${H.sp.toFixed(3)}, r = ${H.r.toFixed(3)};
        vec2 p = vec2((vUv.x - 0.5) * w, y0 + vUv.y * (sp + r - y0));
        float d = p.y > sp ? length(vec2(p.x, p.y - sp)) - r : abs(p.x) - r;   // 门洞外面 > 0
        float edge = smoothstep(0.0, -0.018, d);
        if (edge <= 0.0) discard;
        vec2 c = vec2(0.0, (sp - y0) * 0.62 + y0);                           // 漩涡中心（门洞中间偏下）
        vec2 q = (p - c) / (r * 2.3);
        float a = t * 0.45, s = sin(a), co = cos(a);
        vec2 uv = vec2(q.x * co - q.y * s, q.x * s + q.y * co) * 0.5 + 0.5;
        vec3 col = texture2D(map, uv).rgb;
        float a2 = -t * 0.25; s = sin(a2); co = cos(a2);
        vec2 uv2 = vec2(q.x * co - q.y * s, q.x * s + q.y * co) * 0.36 + 0.5;
        col = col * 0.75 + texture2D(map, uv2).rgb * 0.45;
        float pulse = 0.82 + 0.18 * sin(t * 1.7);
        gl_FragColor = vec4(col * edge * pulse * k * 0.72 + flash * edge * vec3(0.9, 0.85, 1.0), 1.0);
      }`,
    transparent: true, blending: add, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
  });
}
/* 一整个传送门：门框 + 漩涡 + 光点 + 光圈。scale：门框模型放大多少 */
export function createPortal(opt = {}) {
  const g = new THREE.Group(), G = glowTex(), S = PORTAL_H / 0.857;
  const frame = new THREE.Group(); g.add(frame);
  loadGLB('models/fb/portal.glb').then(m => { const o = m.scene; o.scale.setScalar(S); o.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; const old = c.material; c.material = new THREE.MeshLambertMaterial({ map: old.map, color: 0xffffff }); old.dispose() } }); frame.add(o) }).catch(e => console.warn('传送门模型没读到', e));
  const vm = vortexMat(), vg = new THREE.PlaneGeometry(H.w * S, (H.sp + H.r - H.y0) * S);
  const vortex = new THREE.Mesh(vg, vm); vortex.position.set(0, (H.y0 + (H.sp + H.r - H.y0) / 2) * S, 0.0); vortex.renderOrder = 3; g.add(vortex);
  const glowBack = glowSprite(G.ball, 0x9a7cff, 0.35); glowBack.scale.set(3.2, 4.4, 1); glowBack.position.set(0, 2.2, 0.15); g.add(glowBack);
  const ringGeo = new THREE.PlaneGeometry(1, 1); ringGeo.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, glowMat(G.ring, 0x7fb8ff, 0.4)); ring.scale.setScalar(4.6); ring.position.set(0, 0.16, 1.15); ring.renderOrder = 2; g.add(ring);
  const dots = [];
  for (let i = 0; i < 12; i++) { const s = glowSprite(i % 3 ? G.ball : G.star, [0xb48cff, 0x8fe8ff, 0xffb8ec][i % 3], 0.9); s.userData = { a: Math.random() * 6.28, r: 1.1 + Math.random() * 1.0, y: Math.random() * 4, sp: 0.35 + Math.random() * 0.5, sz: 0.18 + Math.random() * 0.22 }; g.add(s); dots.push(s) }
  let t = 0, fl = 0; const box = new THREE.Box3(), frus = new THREE.Frustum(), pm = new THREE.Matrix4();
  return {
    group: g, front: new THREE.Vector3(0, 0, 2.0),
    flash() { fl = 1 },
    /* 画面外不动 */
    update(dt, camera) {
      box.setFromCenterAndSize(g.getWorldPosition(new THREE.Vector3()).setY(2.3), new THREE.Vector3(6, 5.5, 6));
      pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frus.setFromProjectionMatrix(pm);
      const vis = frus.intersectsBox(box); g.visible = vis; if (!vis) return false;
      t += dt; fl = Math.max(0, fl - dt * 1.4);
      vm.uniforms.t.value = t; vm.uniforms.flash.value = fl;
      ring.material.opacity = 0.32 + 0.14 * Math.sin(t * 1.6) + fl * 0.5; ring.scale.setScalar(4.6 + 0.15 * Math.sin(t * 1.6));
      glowBack.material.opacity = 0.28 + 0.1 * Math.sin(t * 1.7) + fl;
      for (const s of dots) { const u = s.userData; u.y += u.sp * dt; if (u.y > 4.6) { u.y = 0.2; u.a = Math.random() * 6.28 } u.a += dt * 0.5;
        s.position.set(Math.cos(u.a) * u.r * 1.15, u.y, 0.6 + Math.sin(u.a) * u.r * 0.6); const k = Math.sin(Math.min(1, u.y / 4.6) * Math.PI); s.material.opacity = 0.85 * k * (0.6 + 0.4 * Math.sin(t * 5 + u.a * 3)); s.scale.setScalar(u.sz * (0.7 + 0.5 * k)) }
      return true;
    },
  };
}
