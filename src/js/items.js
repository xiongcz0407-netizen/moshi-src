/* ================= 物品模型（Kenney 里没有的，用代码拼的低多边形） =================
   破布、废电池、绷带、木柴、手电筒、一箱罐头、净水滤芯、急救包（设计 68 起不再出，只能卖）、工具箱、发电机零件。
   每个函数返回一个 Group，原点在底面中心，大小大约 0.4~0.6，地上、货架上、图标里都用同一个。 */
import * as THREE from 'three';
import { mat, box, cyl } from './models.js';

const G = (...k) => { const g = new THREE.Group(); k.forEach(x => g.add(x)); return g };
const glow = c => new THREE.MeshBasicMaterial({ color: c });

/* 固定随机数：同一个模型每次长得一样 */
function rnd(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647 }

/* 皱巴巴的一团：把二十面体的顶点随机推拉，再压扁 */
function lump(r, color, seed, flat = 0.4) {
  const geo = new THREE.IcosahedronGeometry(r, 1), p = geo.attributes.position, R = rnd(seed), v = new THREE.Vector3(), memo = new Map();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const k = v.toArray().map(n => n.toFixed(3)).join();
    if (!memo.has(k)) memo.set(k, 0.75 + R() * 0.5);
    v.multiplyScalar(memo.get(k)); v.y *= flat; p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat(color)); m.castShadow = m.receiveShadow = true; return m;
}

/* 破布：两团脏布 + 一条撕下来的布条 */
export function rag() {
  const a = lump(0.26, 0x8f8470, 7), b = lump(0.18, 0x6f6656, 31, 0.5), s = box(0.42, 0.025, 0.09, 0xa39a84);
  a.position.y = 0.08; b.position.set(0.14, 0.13, 0.06);
  s.position.set(-0.12, 0.03, 0.2); s.rotation.set(0.1, 0.5, 0.08);
  return G(a, b, s);
}

/* 废电池：汽车电瓶，红正极黑负极，前面一条黄标签，锈了一块 */
export function battery() {
  const g = G(box(0.5, 0.32, 0.32, 0x2f3a36, 0, 0.16, 0), box(0.52, 0.05, 0.34, 0x3d4a45, 0, 0.335, 0),
    cyl(0.04, 0.045, 0.07, 6, 0xc23b2b, -0.16, 0.39, 0.06), cyl(0.04, 0.045, 0.07, 6, 0x1c1c1c, 0.16, 0.39, 0.06),
    box(0.34, 0.08, 0.01, 0xe8c547, 0, 0.2, 0.161), box(0.14, 0.1, 0.012, 0x8a4a2a, 0.15, 0.08, 0.162));
  return g;
}

/* 绷带：一卷白纱布，侧放，拖一截尾巴 */
export function bandage() {
  const roll = cyl(0.12, 0.12, 0.15, 10, 0xf2efe6, 0, 0.12, 0); roll.rotation.x = Math.PI / 2;
  const core = cyl(0.045, 0.045, 0.152, 8, 0xc9c2b0, 0, 0.12, 0); core.rotation.x = Math.PI / 2;
  const tail = box(0.22, 0.012, 0.14, 0xe8e3d6, 0.17, 0.006, 0); tail.rotation.z = -0.05;
  const stripe = cyl(0.122, 0.122, 0.03, 10, 0xd94a3d, 0, 0.12, 0); stripe.rotation.x = Math.PI / 2;
  return G(roll, core, tail, stripe);
}

/* 木柴：三根圆木捆在一起，截面颜色浅一点 */
export function firewood() {
  const g = new THREE.Group();
  for (const [x, y, c] of [[-0.1, 0.09, 0x6b4a2c], [0.1, 0.09, 0x7a5532], [0, 0.25, 0x5e4127]]) {
    const log = cyl(0.09, 0.09, 0.46, 6, c, x, y, 0); log.rotation.x = Math.PI / 2; g.add(log);
    for (const z of [-0.231, 0.231]) { const e = cyl(0.075, 0.075, 0.005, 6, 0xc9a26b, x, y, z); e.rotation.x = Math.PI / 2; g.add(e) }
  }
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.015, 4, 10), mat(0xb59a6a)); rope.position.set(0, 0.16, 0); rope.scale.y = 0.95; g.add(rope);
  return g;
}

/* 手电筒：黄色筒身、灰色灯头、亮的镜片，横放 */
export function flashlight() {
  const body = cyl(0.06, 0.06, 0.3, 8, 0xe0c23a, 0, 0, 0), head = cyl(0.1, 0.065, 0.12, 8, 0x3a3f44, 0, 0.21, 0);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.01, 8), glow(0xfff4b8)); lens.position.y = 0.275;
  const grip = cyl(0.064, 0.064, 0.1, 8, 0x2b2b2b, 0, -0.08, 0), btn = box(0.04, 0.03, 0.05, 0x1c1c1c, 0, 0.06, 0.06);
  const g = G(body, head, lens, grip, btn); g.rotation.z = Math.PI / 2; g.position.y = 0.1;
  return G(g);
}

/* 一箱罐头：敞口纸箱，露出 4 个罐头 */
export function crateOfCans() {
  const g = G(box(0.5, 0.3, 0.4, 0xa77d4e, 0, 0.15, 0), box(0.5, 0.02, 0.18, 0x8f6a40, 0, 0.31, -0.24));
  g.children[1].rotation.x = -0.6;
  for (const [x, z] of [[-0.12, -0.08], [0.12, -0.08], [-0.12, 0.09], [0.12, 0.09]]) { g.add(cyl(0.08, 0.08, 0.12, 8, 0xd9a441, x, 0.3, z)); g.add(cyl(0.07, 0.07, 0.01, 8, 0xbfbfbf, x, 0.365, z)) }
  return g;
}

/* 净水滤芯：白色外壳 + 蓝色箍 + 蓝色盖子 */
export function filter() {
  const g = G(cyl(0.11, 0.11, 0.34, 10, 0xeef2f4, 0, 0.17, 0), cyl(0.12, 0.12, 0.05, 10, 0x2e7fd1, 0, 0.36, 0), cyl(0.04, 0.04, 0.06, 8, 0x2e7fd1, 0, 0.41, 0), cyl(0.12, 0.12, 0.04, 10, 0x2e7fd1, 0, 0.02, 0));
  for (const y of [0.1, 0.17, 0.24]) g.add(cyl(0.113, 0.113, 0.018, 10, 0x8fc4ea, 0, y, 0));
  return g;
}

/* 急救包：白盒子、红十字、提手 */
export function medkit() {
  const g = G(box(0.48, 0.28, 0.32, 0xf0ede6, 0, 0.14, 0), box(0.49, 0.03, 0.33, 0xd94a3d, 0, 0.21, 0),
    box(0.13, 0.04, 0.012, 0xd94a3d, 0, 0.1, 0.162), box(0.04, 0.13, 0.012, 0xd94a3d, 0, 0.1, 0.162),
    box(0.16, 0.035, 0.035, 0x444444, 0, 0.33, 0), box(0.03, 0.05, 0.035, 0x444444, -0.07, 0.3, 0), box(0.03, 0.05, 0.035, 0x444444, 0.07, 0.3, 0));
  return g;
}

/* 工具箱：红色铁箱、提手、两个扣，旁边插一把扳手 */
export function toolbox() {
  const g = G(box(0.52, 0.24, 0.26, 0xb83228, 0, 0.12, 0), box(0.54, 0.06, 0.28, 0x9a281f, 0, 0.27, 0),
    box(0.26, 0.03, 0.04, 0x2b2b2b, 0, 0.36, 0), box(0.03, 0.07, 0.04, 0x2b2b2b, -0.12, 0.33, 0), box(0.03, 0.07, 0.04, 0x2b2b2b, 0.12, 0.33, 0),
    box(0.05, 0.06, 0.02, 0xc9c9c9, -0.16, 0.22, 0.135), box(0.05, 0.06, 0.02, 0xc9c9c9, 0.16, 0.22, 0.135));
  const w = box(0.04, 0.24, 0.02, 0x9aa3ab, 0.2, 0.36, -0.04); w.rotation.z = -0.3; g.add(w);
  return g;
}

/* 发电机零件：金属齿轮 + 轴套 + 一颗螺栓 */
export function gear() {
  const g = new THREE.Group(), steel = 0x8e9aa6;
  const disc = cyl(0.17, 0.17, 0.07, 12, steel, 0, 0.035, 0); g.add(disc);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, t = box(0.07, 0.07, 0.06, steel, Math.cos(a) * 0.19, 0.035, Math.sin(a) * 0.19); t.rotation.y = -a; g.add(t) }
  g.add(cyl(0.07, 0.07, 0.12, 8, 0x5b646d, 0, 0.06, 0), cyl(0.03, 0.03, 0.125, 6, 0x2b2f33, 0, 0.065, 0));
  const bolt = cyl(0.03, 0.03, 0.16, 6, 0xb8a46a, 0.26, 0.02, 0.12); bolt.rotation.z = Math.PI / 2; g.add(bolt);
  g.rotation.x = -0.25; g.position.y = 0.05;
  return G(g);
}

/* 果树：Kenney 的树是松树，不像果树，这里自己拼一棵圆冠的树（高约 3） */
export function fruitTree() {
  const g = G(cyl(0.16, 0.24, 1.6, 6, 0x6b4a2c, 0, 0.8, 0));
  const a = lump(1.05, 0x5f9a3c, 11, 0.85), b = lump(0.7, 0x6faa44, 23, 0.85), c = lump(0.6, 0x568c36, 37, 0.85);
  a.position.set(0, 2.2, 0); b.position.set(0.6, 1.95, 0.25); c.position.set(-0.55, 2.0, -0.2); g.add(a, b, c);
  return g;
}

export const ITEM_MAKERS = {
  'junk:cloth': rag, 'junk:battery': battery,
  'good:bandage': bandage, 'good:firewood': firewood, 'good:light': flashlight,
  'tr:crate': crateOfCans, 'tr:filter': filter, 'tr:medkit': medkit, 'tr:toolbox': toolbox, 'tr:genpart': gear,
};
