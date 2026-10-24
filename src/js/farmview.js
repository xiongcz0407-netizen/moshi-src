/* ================= 温室、果园的画面 =================
   根据存档里的格子（S.plots）、树位（S.trees）摆出菜苗、作物、果树。只管画面，不改存档。 */
import * as THREE from 'three';
import { noCast } from './groundfx.js';
import { perfOpt } from './perf.js';
import * as M from './models.js';
import { prop } from './props.js';
import { fruitTree } from './items.js';
import { PLOT_POS, TREE_POS } from './world.js';
import { CROPS } from './config.js';

/* 每种作物模型的大小（Food Kit 里的模型大小不一样） */
const CROP_SCALE = { radish: 1.4, cabbage: 1.5, tomato: 1.6, eggplant: 1.5, carrot: 1.4, corn: 1.3, pumpkin: 2.3, apple: 1.6, orange: 1.6 };
const ringGeo = new THREE.RingGeometry(0.62, 0.72, 20);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85 });

function sprout() { const g = new THREE.Group(); for (const [x, z, r] of [[0, 0, 0], [0.12, 0.05, 0.6], [-0.1, 0.08, -0.5]]) { const c = M.cyl(0.0, 0.07, 0.3, 4, 0x6aa84f, x, 0.15, z); c.rotation.z = r * 0.4; g.add(c) } return g }
function cropModel(c) {
  const o = prop(c, { scale: CROP_SCALE[c] || 1.4, tint: 0xffffff });
  if (o) return o;
  return M.rock(0.25, 0xd9475a, 0, 0.25, 0);
}

export function createFarmView(W) {
  const plots = PLOT_POS.map(([x, z]) => { const g = new THREE.Group(); g.position.set(x, 0.12, z); W.ghBuilt.add(g); return { g, key: '' } });
  const trees = TREE_POS.map(([x, z]) => { const g = new THREE.Group(); g.position.set(x, 0, z); W.orBuilt.add(g); return { g, key: '' } });

  function update(S, clock) {
    W.ghRuin.visible = !S.lv.gh; W.ghBuilt.visible = !!S.lv.gh;
    W.orRuin.visible = !S.lv.orchard; W.orBuilt.visible = !!S.lv.orchard;
    /* 菜地：没开放的格子变暗 */
    W.plotMeshes.forEach((m, i) => { m.visible = true;   /* 设计 48：4 × 6 的地都画出来（没开的颜色浅） */ m.material = M.mat(i < S.plots.length ? 0x5a4330 : 0x8a7a62) });
    plots.forEach((v, i) => {
      const p = S.plots[i], k = p ? (p.left <= 0 ? 'ripe' : (1 - p.left / p.total) < 0.35 ? 'sprout' : 'grow') : '', key = p ? p.c + ':' + k : '';
      if (key !== v.key) {
        v.key = key; v.g.clear(); v.model = null; v.ring = null;
        if (p && k === 'sprout') v.g.add(noCast(sprout()));
        else if (p) { v.model = noCast(cropModel(p.c)); v.g.add(v.model); if (k === 'ripe') { v.ring = new THREE.Mesh(ringGeo, ringMat); v.ring.rotation.x = -Math.PI / 2; v.ring.position.y = 0.02; v.g.add(v.ring) } }
      }
      if (v.model && p) { const f = p.left <= 0 ? 1 : 0.55 + 0.45 * (1 - p.left / p.total); v.model.scale.setScalar((CROP_SCALE[p.c] || 1.4) * f); if (v.ring) v.model.position.y = Math.abs(Math.sin(clock * 3 + i)) * 0.08 }
    });
    /* 果树：第一次结果前慢慢长大；熟了挂满果子 */
    trees.forEach((v, i) => {
      const t = S.trees[i], key = t ? t.k + ':' + (t.left <= 0 ? 'ripe' : 'grow') : '';
      if (key !== v.key) {
        v.key = key; v.g.clear(); v.tree = null;
        if (t) {
          v.tree = fruitTree(); v.g.add(v.tree);
          if (t.left <= 0) for (let j = 0; j < 6; j++) { const a = j / 6 * Math.PI * 2, f = prop(t.k, { scale: 1.3, tint: 0xffffff }) || M.rock(0.12, 0xc8302a); f.position.set(Math.cos(a) * 0.95, 1.7 + (j % 3) * 0.4, Math.sin(a) * 0.95); v.g.add(f) }
          if (t.left <= 0) { const r = new THREE.Mesh(ringGeo, ringMat); r.rotation.x = -Math.PI / 2; r.position.y = 0.03; r.scale.setScalar(1.3); v.g.add(r) }
        }
      }
      if (v.tree && t) { const young = t.total > 0 && t.left > 0 && t.total >= 14400 ? 0.45 + 0.55 * (1 - t.left / t.total) : 1; v.tree.scale.setScalar(perfOpt('sshadow') ? Math.round(young * 20) / 20 : young) }   // 设计 57：小树按 5% 一档长（影子不用一直重画）
    });
  }
  return { update };
}
