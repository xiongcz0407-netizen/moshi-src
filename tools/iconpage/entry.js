/* 图标渲染页：把游戏里的 3D 物品渲染成 PNG 图标（透明背景、斜上方 3/4 视角） */
import * as THREE from 'three';
import { junkMesh } from '../../src/js/models.js';
import { loadProps, loadLateProps, prop, ranchGoodProp } from '../../src/js/props.js';
import { ITEM_MAKERS, fruitTree } from '../../src/js/items.js';
import { JUNK, GOODS, TREASURE, FISH, TOWERS, BUILD_ORDER, RANCH_IDS, WS_IDS } from '../../src/js/config.js';
import { towerMesh } from '../../src/js/world.js';
import { loadM16, makeM16 } from '../../src/js/m16.js';

const S = 256;
const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
r.setSize(S, S); r.outputColorSpace = THREE.SRGBColorSpace; r.setClearColor(0, 0); document.body.appendChild(r.domElement);
const cam = new THREE.PerspectiveCamera(24, 1, 0.01, 100);

function make(kind, id) {
  if (kind === 'fish') { const F = FISH[id]; const o = prop(F.m, { scale: 1, solid: F.color }); o.rotation.y = 0.6; return o }
  if (kind === 'good' && id === 'fish') { const o = prop('fish', { scale: 1, solid: 0x9fb4c4 }); o.rotation.y = 0.6; return o }
  if (kind === 'it' && id === 'worm') return prop('can-open', { scale: 1, tint: 0x9a7a5a });     // 一罐蚯蚓
  if (kind === 'it' && id === 'corn') return prop('corn', { scale: 1, tint: 0xffe08a });         // 玉米饵
  if (kind === 'it' && id === 'rod') { const g = new THREE.Group(), o = prop('FishingRod', { scale: 1, tint: 0xffffff }) || prop('campfire-fishing-stand', { scale: 1, tint: 0xffffff }); o.rotation.z = -0.8; g.add(o); return g }
  if (kind === 'it' && id === 'm16') { const g = new THREE.Group(), m = makeM16('black'); m.rotation.y = Math.PI / 2 + 0.5; m.rotation.z = 0.15; g.add(m); return g }   // 0.25 守卫的枪
  if (kind === 'it' && id === 'lic') return prop('books', { scale: 1, tint: 0x8ab0c8 });         // 垂钓证
  if (kind === 'it' && id === 'fert') return prop('bag', { scale: 1, tint: 0x7a9a4a });   // 肥料袋（Food Kit 的 bag，染成绿褐色）
  if (kind === 'tw') return towerMesh(id, 2);
  if (kind === 'bd') return buildIcon(id);                                         // 0.23 塔图标（2 级的样子）
  if (kind === 'junk') return junkMesh(id);
  if (kind === 'good' && id === 'food') return prop('can', { scale: 1, tint: 0xffffff });
  if (kind === 'good' && id === 'water') return prop('soda-bottle', { scale: 1, solid: 0x8fcbea, opacity: 0.9 });
  if (kind === 'good' && GOODS[id].ranch) return ranchGoodProp(id);
  if (kind === 'good' && GOODS[id].fresh) return prop(id, { scale: 1, tint: 0xffffff });
  if (kind === 'tr' && TREASURE[id].tree) { const g = new THREE.Group(), t = fruitTree(); t.scale.setScalar(0.55); g.add(t); const f = prop(TREASURE[id].tree, { scale: 1.6, tint: 0xffffff }); f.position.set(0.7, 0, 0.6); g.add(f); return g }
  return ITEM_MAKERS[kind + ':' + id]();
}
/* 0.23 建造页图标：每种建筑挑一个最像的模型 */
function buildIcon(k) {
  const P = (n, o = {}) => prop(n, { scale: 1, tint: 0xffffff, ...o });
  if (RANCH_IDS.includes(k)) return P(k);
  const WSM = { wood: 'mugongtai', sweet: 'tianpinji', split: 'fenjieji', can: 'guantouji', dry: 'honganji', kitchen: 'chufang', mayo: 'jiaobanji', pickle: 'yancai', jam: 'guojiangguo', smoke: 'xunyu', loom: 'zhibu', cheese: 'nainao', deli: 'shushigui' };
  if (WSM[k]) return P(WSM[k] + (k === 'deli' ? '-2' : '-1'));   // 0.42 工坊的机器、熟食柜                                          // 0.28 动物棚：用那只动物
  switch (k) {
    case 'store': return P('m:shopping-cart', { skin: 'market-b' }) || P('m:shopping-cart');
    case 'rec': return P('recycle-2') || P('m:bottle-return');                        // 0.28 回收机换成用户的模型
    case 'wh': { const g = new THREE.Group(); const a = P('box-large'); const b = P('box'); if (a) g.add(a); if (b) { b.position.set(0.45, 0, 0.3); g.add(b) } return g }
    case 'shelf': return P('m:shelf-boxes', { skin: 'market-b' }) || P('m:shelf-boxes');
    case 'veg': return P('m:display-fruit', { skin: 'market-b' }) || P('m:display-fruit');
    case 'fridge': return P('m:freezer', { skin: 'market-b' }) || P('m:freezer');
    case 'bag': return P('bag', { tint: 0xb08a5a });
    case 'gh': { const g = new THREE.Group(); [['cabbage', -0.12, 0], ['radish', 0.14, 0.05], ['carrot', 0, 0.2]].forEach(([n, x, z]) => { const o = P(n); if (o) { o.position.set(x, 0, z); g.add(o) } }); return g }
    case 'orchard': { const t = fruitTree(); return t }
    case 'rod': { const g = new THREE.Group(), o = P('FishingRod') || P('campfire-fishing-stand'); o.rotation.z = -0.8; g.add(o); return g }
    case 'pond': { const g = new THREE.Group(); const w = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshLambertMaterial({ color: 0x3d8db0 })); w.rotation.x = -Math.PI / 2; g.add(w);
      const f = P('fish', { solid: 0xffb020 }); if (f) { f.scale.setScalar(3); f.rotation.set(-Math.PI / 2, 0.5, 0); f.position.y = 0.05; g.add(f) } return g }
    case 'camp': return P('building-c', { tint: 0xe8c7a0 });
    case 'hosp': { const g = new THREE.Group(), b = P('building-f', { tint: 0xd8d2c6 }); if (b) g.add(b); const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.04), new THREE.MeshBasicMaterial({ color: 0xc0392b })), c2 = c1.clone(); c2.rotation.z = Math.PI / 2; for (const c of [c1, c2]) { c.position.set(0, 1.0, 0.55); g.add(c) } return g }
  }
  return P('box');
}
function shot(kind, id) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e2, 0x6a5e52, 2.2));
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.2); sun.position.set(3, 6, 4); scene.add(sun);
  const rim = new THREE.DirectionalLight(0xc8dcff, 0.8); rim.position.set(-4, 2, -3); scene.add(rim);
  const o = make(kind, id); if (!o) { console.log('没有模型', kind, id); return null } o.position.set(0, 0, 0); scene.add(o);
  o.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3()).length();
  const dir = new THREE.Vector3(0.55, 0.75, 1).normalize(), d = sz / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.08;
  cam.position.copy(c).addScaledVector(dir, d); cam.lookAt(c); cam.updateProjectionMatrix();
  r.render(scene, cam);
  return r.domElement.toDataURL('image/png');
}
window.renderIcons = async () => {
  await loadProps('/src/models/'); await loadLateProps(); await loadM16('/src/models/');
  const out = {};
  /* 设计 34：商品、原料、物资、珍品、道具的图标换成 2D 手绘（tools/cut_sheet.py 切的），这里只渲染鱼、塔、建筑 */
  for (const [kind, T] of [['fish', FISH], ['tw', TOWERS], ['bd', Object.fromEntries([...BUILD_ORDER, ...RANCH_IDS, ...WS_IDS].map(k => [k, 1]))]]) for (const id of Object.keys(T)) { const v = shot(kind, id); if (v) out[kind + '_' + id] = v }
  return out;
};
