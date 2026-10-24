/* ================= 设计 67：压扁影子 =================
   人、动物的影子 = 把它自己的模型沿太阳光方向压扁贴在地上，画成一层半透明的黑（看得出头、帽子、背包、猪的腿）。
   - 每个网格一份「影子壳」：跟本体共用同一个几何体；带骨骼的共用同一副骨骼（SkinnedMesh.bind 同一个 skeleton，不复制骨骼），所以动作自动跟上。
   - 画的时候世界矩阵 = 压扁矩阵 × 本体的世界矩阵（在 onBeforeRender 里算，那时本体的矩阵已经是这一帧的）。
   - 方向用这个场景里投影子的那盏太阳光，跟房子、机器的真影子一样；不进影子图（castShadow 关），不会让影子图重画。
   - 深浅按这个场景的光照算：真影子里只剩半球光，所以影子 = 地面亮度 ×（半球光 ÷（半球光 + 太阳光 × cos）），换成屏幕颜色再算透明度。
   - 模板缓冲：画过影子的像素记一下，同一个像素不再画第二遍，所以一个人的影子身上叠的部分（手臂压在身子上）不会更黑，两个人的影子叠在一起也不会更黑（跟真影子一样）。
   - 按脚下的高度画（压到本体所在的高度 + 2 厘米，台阶、平台、地砖都对）。
   - 画面外、离主角 25 米以外的不画。性能小窗开关「压扁影子」（perf 'flat'）。 */
import * as THREE from 'three';
import { perfOpt } from './perf.js';

const owners = new Set();
const FAR = 25;
const _p = new THREE.Vector3(), _L = new THREE.Vector3(), _m = new THREE.Matrix4(), _fr = new THREE.Frustum(), _sph = new THREE.Sphere(new THREE.Vector3(), 2.2);
const matCache = new Map();   // 透明度（两位小数）→ 材质；带骨骼的和不带的可以共用（three 自己分着编译）
function shadowMat(op) {
  const k = op.toFixed(2); let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: op, depthWrite: false, fog: false,
      polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -200,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp });
    matCache.set(k, m);
  }
  return m;
}
/* 场景的太阳方向、影子深浅：第一次用时从场景里找（投影子的平行光 + 半球光），记在 scene.userData.flat */
function sceneInfo(scene) {
  let s = scene.userData.flat; if (s) return s;
  let sun = null, hemi = 0;
  scene.traverse(o => { if (o.isDirectionalLight && (o.castShadow || !sun)) sun = o; if (o.isHemisphereLight) hemi += o.intensity });
  const L = new THREE.Vector3(10, -22, -14).normalize();   // 找不到太阳就用超市的方向
  let op = 0.42;
  if (sun) {
    sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
    L.copy(sun.target.getWorldPosition(new THREE.Vector3())).sub(sun.getWorldPosition(new THREE.Vector3())).normalize();
    const c = sun.color, lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b, dir = sun.intensity * lum * Math.max(0, -L.y);
    const lin = hemi / Math.max(0.01, hemi + dir);   // 影子里的亮度 ÷ 太阳下的亮度（线性）
    op = (1 - Math.pow(lin, 1 / 2.2)) * 1.08;        // 画到屏幕上是 sRGB，半透明黑是在屏幕颜色上乘 (1 - op)；× 1.08：实测真影子（偏冷色）比算出来的深一点点
  }
  s = scene.userData.flat = { L, op: Math.min(0.75, Math.max(0.2, op)), root: null };
  return s;
}
/* 登记一个人 / 动物（Group 或模型根节点）。zombie：尸潮丧尸（以后要单独关就看这个） */
export function addFlat(g, opt = {}) { if (!g) return g; g.userData.flatOpt = opt; owners.add(g); return g }
export const flatOwners = () => owners;   // 自动检查用
/* 尸潮里手机撑不住 50 帧时先不画丧尸的影子（main.js probeTd 量的，尸潮结束恢复） */
let skipZ = false;
export function setFlatZombie(on) { skipZ = !on }
function shellFor(src, mat) {
  let sh;
  if (src.isSkinnedMesh) { sh = new THREE.SkinnedMesh(src.geometry, mat); sh.bindMode = src.bindMode; sh.bind(src.skeleton, src.bindMatrix) }
  else sh = new THREE.Mesh(src.geometry, mat);
  if (src.morphTargetInfluences) { sh.morphTargetInfluences = src.morphTargetInfluences; sh.morphTargetDictionary = src.morphTargetDictionary }
  sh.matrixAutoUpdate = false; sh.matrixWorldAutoUpdate = false; sh.frustumCulled = false; sh.castShadow = sh.receiveShadow = false; sh.renderOrder = 1;
  sh.userData.src = src; sh.userData.S = new THREE.Matrix4();
  sh.raycast = () => {};   // 点地面、选东西时不会点到影子
  /* 带骨骼的：three 每帧把本体的 bindMatrixInverse 设成本体世界矩阵的逆（attached 模式），壳也要用本体的，最后算出来 = 压扁矩阵 × 骨骼动起来的世界坐标 */
  sh.onBeforeRender = () => { sh.matrixWorld.multiplyMatrices(sh.userData.S, src.matrixWorld); if (src.isSkinnedMesh) { sh.bindMatrix.copy(src.bindMatrix); sh.bindMatrixInverse.copy(src.bindMatrixInverse) } };
  return sh;
}
const chainVisible = (o, top) => { while (o && o !== top) { if (!o.visible) return false; o = o.parent } return !!o && o.visible };
const isBody = o => (o.isMesh || o.isSkinnedMesh) && !o.isInstancedMesh && o.geometry && o.material && !(Array.isArray(o.material) ? o.material[0] : o.material).transparent && !o.userData.noFlat;
/* 每帧画之前调一次：scene = 这一帧要画的场景，cam = 镜头，center = 主角位置 */
export function syncFlat(scene, cam, center) {
  const on = perfOpt('flat');
  const s = sceneInfo(scene);
  if (!s.root) { s.root = new THREE.Group(); s.root.name = 'flatShadows'; s.root.matrixAutoUpdate = false; scene.add(s.root) }
  if (s.root.parent !== scene) scene.add(s.root);
  s.root.visible = on; if (!on) return;
  cam.updateMatrixWorld(); _m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_m);
  const mat = shadowMat(s.op), L = s.L, ax = -L.x / L.y, az = -L.z / L.y;
  for (const g of owners) {
    const u = g.userData;
    if (!g.parent) { if (u.flatSh) { for (const sh of u.flatSh.values()) sh.removeFromParent(); u.flatSh.clear() } owners.delete(g); continue }   // 离开场景（走掉的顾客、池子里的丧尸）：壳扔掉、不再管，丧尸回来时 addFlat 再登记
    let root = g; while (root.parent) root = root.parent;
    if (root !== scene) continue;   // 别的场景的人，那个场景画的时候再管
    let show = chainVisible(g, scene) && !(skipZ && u.flatOpt && u.flatOpt.zombie);
    if (show) { g.getWorldPosition(_p); _sph.center.set(_p.x, _p.y + 1, _p.z); _sph.radius = 2.2 * Math.max(1, g.scale.x * (u.flatR || 1)); show = Math.hypot(_p.x - center.x, _p.z - center.z) <= FAR && _fr.intersectsSphere(_sph) }
    const map = u.flatSh || (u.flatSh = new Map());
    if (!show) { for (const sh of map.values()) sh.visible = false; continue }
    /* 压扁矩阵：沿光线 L 投到 y = h 的平面上：x' = x + ax (y - h)，y' = h，z' = z + az (y - h)。ax = -Lx/Ly */
    /* flatH：固定的地面高度（会蹦的兔子，影子留在地上） */
    const h = (u.flatH != null ? u.flatH : _p.y) + 0.02, S = _m.set(1, ax, 0, -ax * h, 0, 0, 0, h, 0, az, 1, -az * h, 0, 0, 0, 1);
    const seen = new Set();
    g.traverse(o => { if (!isBody(o)) return; seen.add(o);
      let sh = map.get(o); if (!sh) { sh = shellFor(o, mat); map.set(o, sh) }
      if (sh.material !== mat) sh.material = mat;
      if (sh.parent !== s.root) s.root.add(sh);
      sh.userData.S.copy(S); sh.visible = chainVisible(o, g) });
    for (const [o, sh] of map) if (!seen.has(o)) { sh.removeFromParent(); map.delete(o) }   // 换了模型（主角换装、新主角读完）：旧的壳扔掉
  }
}
