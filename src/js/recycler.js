/* ================= 0.28 回收机：用户做的 5 个模型（recycle-1～5 对应 1～5 级），替换原来的铁皮棚 =================
   模型正面（+z）是投料口，右侧（+x）是出料：1 级出到木箱，2、3 级走滑槽进灰桶，4 级机械臂分到 3 个桶，5 级先进玻璃罩转一圈再分到 4 个桶。
   正着摆：投料口朝南（对着镜头）。
   下面的坐标都是「占模型长宽高的比例」：x、z 在 −0.5～0.5，y 在 0～1（看渲染的网格图量的）。 */
import * as THREE from 'three';
import { noCast } from './groundfx.js';
import { prop } from './props.js';
import { junkMesh, goodModel } from './models.js';
import { GOOD_IDS } from './config.js';

const SCALE = 5.2, RY = 0;   // 0.28 用户：正着放（投料口朝南），不斜；0.42 用户：太小了，放大 30%
const LOOK = {
  1: { feed: [-0.25, 0.44, 0.5], out: [[-0.19, 0.18, 0.62], [0.12, 0.36, 0.42]], bins: [[0.33, 0.14, 0]] },
  2: { feed: [-0.28, 0.44, 0.5], out: [[0.26, 0.52, 0], [0.36, 0.33, 0]], bins: [[0.32, 0.12, 0]] },
  3: { feed: [-0.32, 0.51, 0.5], out: [[0.07, 0.5, 0], [0.17, 0.38, 0]], bins: [[0.19, 0.12, 0], [0.43, 0.08, 0]] },
  4: { feed: [-0.28, 0.43, 0.5], out: [[0.45, 0.42, 0.19], [0.5, 0.52, 0.05]], bins: [[0.32, 0.14, 0.28], [0.32, 0.14, 0], [0.32, 0.14, -0.28]] },
  5: { feed: [-0.19, 0.32, 0.5], dome: [-0.06, 0.62, 0.14, 0.09], out: [[0.46, 0.4, 0]], bins: [[0.35, 0.12, 0.32], [0.35, 0.12, 0.11], [0.35, 0.12, -0.06], [0.35, 0.12, -0.27]] },
};

export function createRecycler({ scene, obstacles, pos, fallback, obb }) {
  const root = new THREE.Group(); root.position.set(pos.x, 0, pos.z); scene.add(root);
  const body = new THREE.Group(); body.rotation.y = RY; root.add(body);      // 机器（会抖）
  const fx = new THREE.Group(); fx.rotation.y = RY; root.add(fx);           // 飞的物资、商品（不跟着抖）
  root.add(fallback);
  const box = obb(pos.x, pos.z, 1.2, 0.9, 0); obstacles.push(box);
  let lv = 0, want = 1, model = null, sz = new THREE.Vector3(1, 1, 1);
  const P = (a, out = new THREE.Vector3()) => out.set(a[0] * sz.x * SCALE, a[1] * sz.y * SCALE, a[2] * sz.z * SCALE);
  function setLv(n) { want = Math.max(1, Math.min(5, n || 1)) }
  function load() {
    if (lv === want) return;
    const m = prop('recycle-' + want, { scale: SCALE, tint: 0xffffff }); if (!m) return;   // 模型还没读到：先用旧的方块机器
    if (model) body.remove(model);
    model = m; lv = want; fallback.visible = false;
    m.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(m); bb.getSize(sz); sz.divideScalar(SCALE);
    const c = bb.getCenter(new THREE.Vector3()); m.position.set(-c.x, -bb.min.y, -c.z); body.add(m);
    Object.assign(box, obb(pos.x, pos.z, sz.x * SCALE / 2 - 0.1, sz.z * SCALE / 2 - 0.05, RY));
    for (const f of items) fx.remove(f.m); items.length = 0;
  }
  /* 一件东西的动画：jobs = [{m, pts:[Vector3...], t, dur, delay, dome}] */
  const items = [];
  function push(m, pts, dur, delay = 0, dome = null) { noCast(m); m.userData.s0 = m.scale.x; m.visible = false; fx.add(m); items.push({ m, pts, t: -delay, dur, dome }) }
  /* 回收出一件（或 3 件、10 件）：先把物资塞进投料口，再从出料那边出来落进桶里 */
  function onRec(e) {
    const L = LOOK[lv]; if (!L || !model) return;
    const feed = P(L.feed), front = feed.clone().add(new THREE.Vector3(0, 0.5, 1.4));
    const j = junkMesh(e.t); j.scale.multiplyScalar(0.9); push(j, [front, feed], 0.35);
    if (e.kind === 'gem') return;
    const n = e.kind === 'x10' ? 6 : e.kind === 'x3' ? 3 : 1, gi = Math.max(0, GOOD_IDS.indexOf(e.id));
    const bin = P(L.bins[gi % L.bins.length]);
    for (let i = 0; i < n; i++) {
      const g = goodModel(e.id); if (!g) continue; g.scale.multiplyScalar(0.65);
      const pts = L.out.map(a => P(a)).concat([bin.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3))]);
      push(g, pts, L.dome ? 2.2 : 1.1, 0.4 + i * 0.18, L.dome ? { c: P(L.dome), r: L.dome[3] * sz.x * SCALE, spin: Math.random() * 6 } : null);
    }
  }
  const tv = new THREE.Vector3();
  function tick(dt, clock, busy) {
    load();
    if (model) {                                          // 干活时整台机器微微抖动、上下颠
      model.rotation.z = busy ? Math.sin(clock * 37) * 0.006 : 0;
      model.scale.y = SCALE * (busy ? 1 + Math.sin(clock * 22) * 0.008 : 1);
    }
    for (let i = items.length - 1; i >= 0; i--) {
      const f = items[i]; f.t += dt; if (f.t < 0) continue;
      const k = Math.min(1, f.t / f.dur); f.m.visible = true;
      if (f.dome) {                                       // 5 级：先在玻璃罩里转一圈（前 45%），再从出料口出来落进桶
        if (k < 0.45) { const a = f.dome.spin + k * 30, r = f.dome.r * (0.4 + k); f.m.position.set(f.dome.c.x + Math.cos(a) * r, f.dome.c.y + Math.sin(k * 20) * 0.05, f.dome.c.z + Math.sin(a) * r); f.m.rotation.y += dt * 8 }
        else along(f.m, [f.dome.c, ...f.pts], (k - 0.45) / 0.55);
      } else along(f.m, f.pts, k);
      if (k >= 1) { fx.remove(f.m); items.splice(i, 1) }
    }
  }
  /* 沿着几个点走（最后一段带一点抛物线：落进桶里） */
  function along(m, pts, k) {
    const n = pts.length - 1, s = Math.min(n - 1e-6, k * n), i = Math.floor(s), u = s - i;
    tv.lerpVectors(pts[i], pts[i + 1], u); if (i === n - 1) tv.y += Math.sin(u * Math.PI) * 0.5;
    m.position.copy(tv); m.rotation.x += 0.15; m.scale.setScalar(m.userData.s0 * Math.max(0.35, 1 - Math.max(0, k - 0.85) * 4));
  }
  return { setLv, onRec, tick, root };
}
