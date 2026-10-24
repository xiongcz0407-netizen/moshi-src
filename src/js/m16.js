import { perfOpt } from './perf.js';
/* ================= M16 模型（0.20 主角属性） =================
   用户下载的 Weapons.fbx（CGTrader r2detta 的 Low Poly Weapon Asset Pack）里的 M16A4，转成 models/m16.glb（约 56KB）。
   原文件颜色丢了，按部件自己上色：m16_1 枪托、m16_2 机匣、m16_3 握把和准星、m16_4 护木和枪管、m16_Magazine 弹匣。
   模型 1 米长，枪管朝 +z，原点在机匣中间。外观三档：black（1～9 级）、camo（10 级起）、gold（20 级起）。 */
import * as THREE from 'three';
import { loadGLB } from './assets.js';

let src = null;
/* 0.23 枪口位置（M16 自己的坐标里）：读模型时找枪管最前面那一截的中心，子弹从这里打出去 */
export const M16_TIP = new THREE.Vector3(0, 0.03, 0.55);
function findTip(root) {
  root.updateMatrixWorld(true); const v = new THREE.Vector3(); let maxZ = -1e9; const pts = [];
  root.traverse(o => { if (!o.isMesh) return; const P = o.geometry.attributes.position; for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); pts.push(v.x, v.y, v.z); if (v.z > maxZ) maxZ = v.z } });
  let n = 0, x = 0, y = 0; for (let i = 0; i < pts.length; i += 3) if (pts[i + 2] > maxZ - 0.03) { x += pts[i]; y += pts[i + 1]; n++ }
  if (n) M16_TIP.set(x / n, y / n, maxZ);
}
export const loadM16 = (dir = 'models/') => loadGLB(dir + 'm16.glb').then(g => { src = g.scene; findTip(src) }, e => console.warn('M16 模型加载失败', e));
export const m16Ready = () => !!src;

const SKIN = {
  black: { '1': [0x26282a, 0.35, 0.6], '2': [0x34373a, 0.5, 0.45], '3': [0x1e1f20, 0.3, 0.6], '4': [0x2c2e30, 0.5, 0.45], Magazine: [0x3e4144, 0.5, 0.5] },
  camo:  { '1': [0x6b6440, 0.1, 0.8], '2': [0x4d5a33, 0.2, 0.7], '3': [0x2a2b24, 0.2, 0.7], '4': [0x7a6a44, 0.1, 0.8], Magazine: [0x59683a, 0.2, 0.7] },
  gold:  { '1': [0x2b2016, 0.1, 0.6], '2': [0xf0bd3a, 0.45, 0.3], '3': [0x1e1a14, 0.3, 0.5], '4': [0xffcc4a, 0.45, 0.28], Magazine: [0xe0a830, 0.45, 0.32] },   // 没有环境贴图，金属度太高会发黑
};
const mats = {};   // 同一档同一个部件共用一份材质
function mat(skin, part) {
  const k = skin + ':' + part; if (mats[k]) return mats[k];
  const [c, metal, rough] = (SKIN[skin] || SKIN.black)[part] || [0x333333, 0.4, 0.5];
  return (mats[k] = new THREE.MeshStandardMaterial({ color: c, metalness: metal, roughness: rough }));
}
/* 生成一把 M16（skin：black / camo / gold）；没读到模型返回 null */
export function makeM16(skin = 'black') {
  if (!src) return null;
  const g = src.clone(true);
  g.traverse(o => { if (o.isMesh) { o.material = mat(skin, o.name.replace(/^m16_/, '')); o.castShadow = !perfOpt('sshadow') } });
  g.userData.skin = skin;
  return g;
}
