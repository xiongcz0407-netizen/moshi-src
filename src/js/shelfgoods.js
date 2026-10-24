/* ================= 设计 34：货架上的商品全部用代码画 =================
   几种通用形状（玻璃罐、瓶子、罐头、小袋子、纸盒、叠好的衣物、盘子 / 碗 / 砂锅、单个物件），每种商品配颜色和小细节，
   颜色尽量和 2D 图标对上。原点在底面中心，大小约 0.3~0.45（goodMesh 里再缩 0.8）。蔬菜水果、鱼不在这里（保持原来的模型）。 */
import * as THREE from 'three';
import { mat, box, cyl } from './models.js';
import { bandage, flashlight } from './items.js';

const G = (...k) => { const g = new THREE.Group(); k.forEach(x => x && g.add(x)); return g };
const glass = (c, o = 0.55) => mat(c, { transparent: true, opacity: o });
const glowM = c => new THREE.MeshBasicMaterial({ color: c });
const tcyl = (rt, rb, h, seg, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y, z); return o };
const sph = (r, c, x = 0, y = 0, z = 0, sy = 1) => { const o = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat(c)); o.position.set(x, y, z); o.scale.y = sy; return o };

/* 玻璃罐：里面的东西 + 玻璃 + 盖子（布盖 / 铁盖） */
function jar(fill, lid, { cloth = false, dots = 0 } = {}) {
  const g = G(cyl(0.11, 0.11, 0.24, 8, fill, 0, 0.12, 0), tcyl(0.125, 0.125, 0.28, 8, glass(0xdfeff2, 0.35), 0, 0.14, 0));
  if (cloth) { g.add(cyl(0.15, 0.13, 0.05, 8, lid, 0, 0.3, 0)); g.add(cyl(0.135, 0.135, 0.02, 8, 0x8a6a40, 0, 0.27, 0)) }
  else g.add(cyl(0.13, 0.13, 0.05, 8, lid, 0, 0.3, 0));
  if (dots) g.add(cyl(0.1, 0.1, 0.012, 8, dots, 0, 0.33, 0));
  return g;
}
/* 瓶子：液体 + 透明瓶身 + 瓶口 + 盖 / 软木塞 */
function bottle(liquid, cap, { tall = 0.32, label = 0 } = {}) {
  const g = G(tcyl(0.075, 0.075, tall * 0.8, 8, glass(liquid, 0.85), 0, tall * 0.4, 0), tcyl(0.085, 0.085, tall, 8, glass(0xe6f4fa, 0.3), 0, tall / 2, 0),
    tcyl(0.035, 0.07, 0.08, 8, glass(0xe6f4fa, 0.4), 0, tall + 0.04, 0), cyl(0.038, 0.038, 0.05, 8, cap, 0, tall + 0.1, 0));
  if (label) g.add(cyl(0.088, 0.088, 0.08, 8, label, 0, tall * 0.45, 0));
  return g;
}
/* 罐头：铁皮 + 一圈彩色标签；flat = 扁的鱼罐头 */
function tin(label, { r = 0.11, h = 0.2, top = 0xb8b8b0, stripe = 0 } = {}) {
  const g = G(cyl(r, r, h, 10, top, 0, h / 2, 0), cyl(r + 0.004, r + 0.004, h * 0.62, 10, label, 0, h / 2, 0));
  if (stripe) g.add(cyl(r + 0.006, r + 0.006, h * 0.12, 10, stripe, 0, h / 2, 0));
  return g;
}
function flatTin(top, fish) { return G(box(0.3, 0.07, 0.18, top, 0, 0.035, 0), box(0.26, 0.02, 0.14, fish, 0, 0.075, 0), box(0.24, 0.012, 0.15, 0xc8c8c0, -0.02, 0.1, -0.06)) }
/* 小袋子：鼓起来的袋身 + 扎口 + 露出来的东西 */
function sack(c, top, { stripe = 0 } = {}) {
  const b = sph(0.15, c, 0, 0.14, 0, 1.15); b.scale.x = 1.05;
  const g = G(b, cyl(0.06, 0.09, 0.08, 6, c, 0, 0.29, 0), sph(0.07, top, 0, 0.34, 0, 0.6));
  if (stripe) g.add(cyl(0.155, 0.155, 0.04, 8, stripe, 0, 0.14, 0));
  return g;
}
/* 纸盒 / 盒子 */
function carton(w, h, d, c, accent, y2 = 0) { const g = G(box(w, h, d, c, 0, h / 2, 0)); if (accent) g.add(box(w + 0.004, h * 0.3, d + 0.004, accent, 0, h * (y2 || 0.5), 0)); return g }
/* 叠好的衣物：两三层扁方块，边上一条花纹 */
function folded(c, edge, layers = 2) {
  const g = new THREE.Group();
  for (let i = 0; i < layers; i++) { g.add(box(0.36 - i * 0.02, 0.07, 0.26 - i * 0.01, i % 2 ? edge : c, 0, 0.035 + i * 0.07, 0)) }
  g.add(box(0.37, 0.02, 0.04, edge, 0, layers * 0.07 - 0.02, 0.1));
  return g;
}
/* 盘子 / 碗 / 砂锅 + 上面的菜（几团小块） */
function plate(food, { bowl = false, pot = false, rim = 0xf0ece2, soup = 0, bits = [] } = {}) {
  const g = new THREE.Group();
  if (pot) { g.add(cyl(0.17, 0.13, 0.14, 8, 0x7a4a2e, 0, 0.07, 0)); g.add(cyl(0.16, 0.16, 0.02, 8, food, 0, 0.145, 0)); g.add(box(0.06, 0.03, 0.04, 0x7a4a2e, 0.2, 0.11, 0)); g.add(box(0.06, 0.03, 0.04, 0x7a4a2e, -0.2, 0.11, 0)) }
  else if (bowl) { g.add(cyl(0.17, 0.1, 0.12, 9, rim, 0, 0.06, 0)); g.add(cyl(0.16, 0.16, 0.015, 9, soup || food, 0, 0.125, 0)) }
  else { g.add(cyl(0.2, 0.16, 0.03, 10, rim, 0, 0.015, 0)); g.add(sph(0.11, food, 0, 0.05, 0, 0.45)) }
  const y = pot ? 0.15 : bowl ? 0.14 : 0.08;
  bits.forEach(([c, x, z, r = 0.035]) => g.add(sph(r, c, x, y, z, 0.7)));
  return g;
}
const flame = (x, y, z, s = 1) => { const f = new THREE.Mesh(new THREE.ConeGeometry(0.045 * s, 0.11 * s, 6), glowM(0xffa23a)); f.position.set(x, y, z); return f };

/* 单个物件 */
const BUILDERS = {
  /* 罐头（红色标签）、纯净水 */
  food: () => tin(0xc0392b, { stripe: 0xe8d8a8 }),
  water: () => bottle(0xbfe3f5, 0x2e6fd1, { label: 0x4a8fd0 }),
  bandage: () => { const m = bandage(); return m },
  battery: () => { const one = x => G(cyl(0.05, 0.05, 0.22, 8, 0x3f9a46, x, 0.11, 0), cyl(0.051, 0.051, 0.05, 8, 0x2b2b2b, x, 0.025, 0), cyl(0.02, 0.02, 0.02, 6, 0xc8c8c8, x, 0.23, 0)); return G(one(-0.06), one(0.06)) },
  charcoal: () => sack(0x9a7a52, 0x2a2624),
  light: () => flashlight(),
  lighter: () => G(box(0.14, 0.2, 0.06, 0x8a8a84, 0, 0.1, 0), box(0.14, 0.06, 0.062, 0x6a6a64, 0, 0.23, 0), flame(0.02, 0.31, 0)),
  torch: () => { const s = cyl(0.03, 0.035, 0.42, 6, 0x6a4428, 0, 0, 0), w = cyl(0.055, 0.05, 0.12, 6, 0xe6dcc6, 0, 0.17, 0), f = flame(0, 0.28, 0, 1.4); const g = G(s, w, f); g.rotation.z = 1.25; g.position.y = 0.06; return G(g) },
  /* 玻璃罐：蛋黄酱、腌萝卜、泡菜、苹果酱、肉松 */
  mayo: () => jar(0xf3ead0, 0xe8e2d0),
  radpickle: () => jar(0xf0e0c8, 0xd8c8a0, { cloth: true, dots: 0xe07a3a }),
  pickle: () => jar(0xd9452e, 0xd8c8a0, { cloth: true }),
  jam: () => jar(0xb8242a, 0xd94a4a, { cloth: true, dots: 0xf2ece0 }),
  floss: () => jar(0xd8a860, 0xd8c8a0, { cloth: true }),
  ketchup: () => G(jar(0xc8281e, 0xd8d0c0), sph(0.06, 0xe0442e, 0.15, 0.06, 0.06, 0.9)),   // 设计 70：番茄酱 = 玻璃罐（铁盖）+ 旁边一个小番茄
  ojuice: () => bottle(0xf5a524, 0xb88a5a, { tall: 0.3 }),
  /* 罐头：鱼罐头（扁）、午餐肉（蓝标签）、橘子罐头（橙色） */
  fishcan: () => flatTin(0xb0a878, 0x8a98a8),
  spam: () => tin(0x3a6ab0, { r: 0.1, h: 0.16, stripe: 0xe8a0a0 }),
  orangecan: () => tin(0xf08a1c, { stripe: 0xf5d060 }),
  /* 小袋子：南瓜子、爆米花（红白） */
  pumpseed: () => sack(0x9a7a52, 0xe8d8a0),
  popcorn: () => G(cyl(0.13, 0.1, 0.26, 10, 0xf2efe6, 0, 0.13, 0), cyl(0.132, 0.12, 0.08, 10, 0xd8352a, 0, 0.17, 0), cyl(0.118, 0.103, 0.06, 10, 0xd8352a, 0, 0.05, 0), sph(0.13, 0xfff4d0, 0, 0.27, 0, 0.6)),
  /* 纸盒：冰淇淋（白纸杯）、炸茄条 */
  icecream: () => G(cyl(0.085, 0.012, 0.22, 8, 0xdea85c, 0, 0.11, 0), sph(0.075, 0xf596b2, -0.035, 0.25, 0), sph(0.075, 0x96dec0, 0.04, 0.25, 0.01), sph(0.07, 0xf8dc6e, 0, 0.33, 0)),   // 35d：甜筒（锥形饼干 + 彩色球），跟图标一样
  eggplantfry: () => { const g = carton(0.26, 0.14, 0.18, 0xd8c09a); for (let i = 0; i < 5; i++) { const s = box(0.03, 0.16, 0.03, i % 2 ? 0xd8a040 : 0xe8b850, -0.08 + i * 0.04, 0.2, (i % 2) * 0.04 - 0.02); s.rotation.z = (i - 2) * 0.15; g.add(s) } g.add(cyl(0.04, 0.035, 0.04, 8, 0xc8302a, 0.15, 0.02, 0.08)); return g },
  /* 35b 甜品机（冰柜）：酸奶小杯、布丁杯、冰棍 */
  yogurt: () => G(cyl(0.08, 0.07, 0.14, 10, 0xf6f2ea, 0, 0.07, 0), tcyl(0.092, 0.078, 0.17, 10, glass(0xeef6f8, 0.35), 0, 0.085, 0), box(0.025, 0.12, 0.015, 0xc8925a, 0.03, 0.18, 0)),
  pudding: () => G(tcyl(0.1, 0.08, 0.12, 10, glass(0xeef6f8, 0.4), 0, 0.06, 0), cyl(0.09, 0.075, 0.1, 10, 0xf2c860, 0, 0.055, 0), cyl(0.07, 0.085, 0.025, 10, 0x8a4a1e, 0, 0.115, 0)),
  popsicle: () => { const g = G(box(0.1, 0.2, 0.05, 0xf4f0e8, 0, 0.14, 0), box(0.104, 0.03, 0.054, 0xe8e2d4, 0, 0.23, 0), box(0.022, 0.08, 0.012, 0xd8b07a, 0, 0.02, 0)); g.rotation.z = 0.12; return g },
  /* 衣物 */
  sweater: () => folded(0xe8dcc0, 0xd4c4a0, 3),
  scarf: () => folded(0xb8322a, 0x8a2420, 2),
  hat: () => G(sph(0.14, 0x8a8a8a, 0, 0.1, 0, 0.75), cyl(0.15, 0.16, 0.05, 8, 0xd8d4cc, 0, 0.03, 0), box(0.1, 0.12, 0.04, 0xd8d4cc, 0.15, 0.05, 0), box(0.1, 0.12, 0.04, 0xd8d4cc, -0.15, 0.05, 0)),
  gloves: () => { const one = (x, r) => { const g = G(box(0.12, 0.04, 0.2, 0x6a4428, 0, 0.02, 0), box(0.13, 0.05, 0.06, 0xe8e0d0, 0, 0.025, -0.11), box(0.04, 0.035, 0.08, 0x6a4428, 0.08, 0.02, 0.04)); g.position.set(x, 0, 0); g.rotation.y = r; return g }; return G(one(-0.08, 0.2), one(0.08, -0.25)) },
  /* 单个物件：熏鱼、腊肉、奶酪、松茸 */
  smoked: () => { const b = sph(0.12, 0xb0702a, 0, 0.06, 0, 0.45); b.scale.x = 2.2; const t = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.1, 4), mat(0x9a5a20)); t.rotation.z = Math.PI / 2; t.position.set(0.3, 0.06, 0); return G(b, t) },
  bacon: () => { const g = G(box(0.3, 0.06, 0.16, 0x8a2e22, 0, 0.03, 0), box(0.3, 0.02, 0.16, 0xe8d0b0, 0, 0.07, 0), box(0.3, 0.04, 0.16, 0x7a2a1e, 0, 0.1, 0), cyl(0.01, 0.01, 0.14, 4, 0xb59a6a, -0.1, 0.18, 0)); return g },
  cheese: () => { const w = cyl(0.16, 0.16, 0.12, 10, 0xf2c23a, 0, 0.06, 0); const wedge = box(0.1, 0.1, 0.08, 0xf5d050, 0.2, 0.05, 0.06); wedge.rotation.y = 0.5; return G(w, wedge) },
  truffle: () => { const one = (x, z, s) => G(cyl(0.025 * s, 0.035 * s, 0.12 * s, 6, 0xeee4d0, x, 0.06 * s, z), sph(0.07 * s, 0x8a5a32, x, 0.13 * s, z, 0.55)); return G(one(0, 0, 1.2), one(0.1, 0.06, 0.9), one(-0.09, 0.05, 0.8)) },
  /* 盘子 / 碗 / 砂锅 */
  saltegg: () => plate(0xf2efe6, { rim: 0xe8e0d0, bits: [[0xe8742a, -0.04, 0.02, 0.04], [0xf2f0ea, 0.06, -0.03, 0.06]] }),
  /* 设计 70：皮蛋 = 盘子上一个整的（灰褐壳）+ 两个切开的（深绿蛋黄、琥珀色蛋白）；松茸蒸蛋 = 白碗里黄色蒸蛋 + 松茸片 + 葱花 */
  pidan: () => plate(0x6a6250, { rim: 0xe8e0d0, bits: [[0x9a6a2a, -0.07, 0.04, 0.055], [0x3e5a3a, -0.07, 0.04, 0.03], [0x9a6a2a, 0.06, 0.05, 0.055], [0x3e5a3a, 0.06, 0.05, 0.03]] }),
  mushegg: () => plate(0xf2d070, { bowl: true, rim: 0xeeeae2, bits: [[0x8a5a32, -0.05, 0.01, 0.04], [0x8a5a32, 0.05, -0.02, 0.04], [0x5aa030, 0, 0.06, 0.018], [0x5aa030, 0.02, -0.06, 0.018]] }),
  applechip: () => plate(0xe8c890, { bits: [[0xe8d0a0, -0.06, 0.03], [0xc8402a, 0.05, -0.04, 0.03], [0xe8d0a0, 0.06, 0.05]] }),
  tomegg: () => plate(0xf2c83a, { bits: [[0xd8352a, -0.05, 0.02], [0xd8352a, 0.05, -0.03], [0xf5d050, 0.02, 0.06]] }),
  salad: () => plate(0x6ab83a, { bowl: true, rim: 0xc8a070, bits: [[0x5aa030, -0.05, 0], [0xd8352a, 0.06, 0.02, 0.03], [0xf2f0ea, 0, -0.06, 0.03]] }),
  fishsoup: () => plate(0, { bowl: true, soup: 0xece4d0, bits: [[0xf2f0ea, 0.04, 0.02, 0.03], [0x6aa040, -0.05, -0.02, 0.02]] }),
  pumpsoup: () => plate(0, { bowl: true, soup: 0xe8862a, bits: [[0xf2f0ea, 0, 0, 0.025]] }),
  flossrice: () => plate(0, { bowl: true, soup: 0xf5f2ea, bits: [[0xd8a860, -0.03, 0.02, 0.05], [0xe8742a, 0.06, -0.02, 0.035]] }),
  stew: () => plate(0x8a3a20, { pot: true, bits: [[0xf2f0ea, -0.05, 0.02, 0.035], [0x8a3a20, 0.05, -0.03, 0.04], [0xe8742a, 0.02, 0.06, 0.03]] }),
  cornbread: () => { const g = plate(0xe8b840, { rim: 0xc89a6a }); g.add(cyl(0.08, 0.08, 0.03, 8, 0xe8b840, 0.02, 0.1, 0.01)); g.add(cyl(0.08, 0.08, 0.03, 8, 0xd8a030, -0.03, 0.13, -0.01)); return g },
};
export const SHELF_MAKERS = Object.fromEntries(Object.entries(BUILDERS).map(([k, f]) => [k, f]));
export function shelfGood(g) { const f = BUILDERS[g]; return f ? f() : null }
