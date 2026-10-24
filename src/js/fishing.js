/* ================= 钓鱼区（0.14，设计/05）：一张固定的小地图，没有丧尸 =================
   坐标：x 向东 0..FW，z 向南 0..FD（自己的 THREE.Scene，和拾荒区一样切场景）。
   北边一片湖（近岸钓鱼点在湖岸上），湖中间伸出一条木栈桥（尽头是深水钓鱼点），
   东边一条南北向的河，河上一座木桥（桥两头的岸边是桥下钓鱼点）。
   船停在湖的西岸：进出钓鱼区都在这里，旁边是钓鱼区的商人。 */
import * as THREE from 'three';
import { makeSunFollow, liven } from './groundfx.js';
import { prop } from './props.js';

export const FW = 48, FD = 27;
const B = { x0: 0, x1: FW, z0: 0, z1: FD };
const SHORE = 12.2;                         // 湖岸（再往北是水）
const PIER = { x0: 25.2, x1: 26.8, z0: 3.4 };   // 木栈桥（从岸边伸到湖里）
const RIV = { x0: 37.6, x1: 42.4 };          // 河（南北向）
const BRIDGE = { z0: 18.8, z1: 21.2 };       // 河上的木桥

/* V1.01 用户：钓鱼区别方方正正的（设计/23「钓鱼区地图」）——湖岸改成一条弯弯的线：中间一个凹进去的小湖湾、河口西边一个凸出去的沙嘴；
   栈桥根部（x 24～28）和上船的地方（x 2～9）岸是平的。河的位置不动，桥前后各 3 米保持直，河口做成喇叭口。 */
const SHORE_PTS = [[-14, 12.2], [0, 12.3], [3, 12.2], [8.6, 12.2], [11.5, 13.2], [14.5, 14.1], [17.5, 13.9], [20.5, 12.9], [23.6, 12.2], [28.4, 12.2], [30.6, 11.3], [32.6, 10.7], [34.6, 11.6], [36.2, 12.4], [44, 12.6], [46.5, 12.0], [62, 12.2]];
const shoreCurve = new THREE.CatmullRomCurve3(SHORE_PTS.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
const SH_N = 260, SH_LINE = shoreCurve.getSpacedPoints(SH_N).map(v => [v.x, v.z]);
export function shoreZ(x) {   // 湖岸线在 x 处的 z（再往北是水）
  for (let i = 1; i < SH_LINE.length; i++) { const [x0, z0] = SH_LINE[i - 1], [x1, z1] = SH_LINE[i]; if (x <= x1) return x1 === x0 ? z1 : z0 + (z1 - z0) * Math.max(0, (x - x0) / (x1 - x0)) }
  return SHORE;
}
/* 河两岸：桥前后（z 15.8～24.2）直，往南轻轻弯一点，河口往外张开 */
const riverW = z => { const mouth = Math.max(0, 15.2 - z) / 3; return mouth * mouth * 2.2 };
const wig = z => (z > 15.8 && z < 24.2) ? 0 : Math.sin(z * 0.55) * 0.5 * Math.min(1, Math.max(0, z < 15.8 ? (15.8 - z) / 1.5 : (z - 24.2) / 1.5));
export const riverX0 = z => RIV.x0 - riverW(z) + wig(z), riverX1 = z => RIV.x1 + riverW(z) * 1.2 + wig(z) * 0.7;

/* 0.24 用户：不要圈圈了，站在哪块范围里就钓哪块的鱼。ry 鱼竿甩出去的方向（弧度，0 = 朝南），lab 区域名字标在哪。
   V1.01：近岸区 = 原来的 x 范围里、站在岸上离水边 1.6 米以内；桥边区 = 河两岸 1.4 米以内（桥前后 4 米） */
export const FZONES = [
  { zone: 'near', x0: 8, x1: 23.8, ry: Math.PI, lab: [16, shoreZ(16) + 0.8], test: (x, z) => x >= 8 && x <= 23.8 && z - shoreZ(x) >= 0.05 && z - shoreZ(x) <= 1.6 },
  { zone: 'deep', x0: PIER.x0 - 0.1, x1: PIER.x1 + 0.1, z0: PIER.z0 - 0.3, z1: PIER.z0 + 4.6, ry: Math.PI, lab: [26, PIER.z0 + 2.2] },
  { zone: 'bridge', ry: Math.PI / 2, lab: [RIV.x0 - 0.8, BRIDGE.z0 - 2.4], test: (x, z) => z >= BRIDGE.z0 - 4 && z <= BRIDGE.z1 + 4 && x <= riverX0(z) - 0.1 && x >= riverX0(z) - 1.5 },
  { zone: 'bridge', ry: -Math.PI / 2, lab: [RIV.x1 + 0.8, BRIDGE.z0 - 2.4], test: (x, z) => z >= BRIDGE.z0 - 4 && z <= BRIDGE.z1 + 4 && x >= riverX1(z) + 0.1 && x <= riverX1(z) + 1.5 },
];
export const zoneAt = (x, z) => FZONES.find(Z => Z.test ? Z.test(x, z) : x >= Z.x0 && x <= Z.x1 && z >= Z.z0 && z <= Z.z1) || null;
/* 以前的钓鱼点（员工钓鱼、测试还在用位置）：贴着新岸线 */
export const SPOTS = [
  { x: 12, z: shoreZ(12) + 0.5, ry: Math.PI, zone: 'near' },
  { x: 17, z: shoreZ(17) + 0.5, ry: Math.PI, zone: 'near' },
  { x: 21.5, z: shoreZ(21.5) + 0.5, ry: Math.PI, zone: 'near' },
  { x: 26, z: PIER.z0 + 0.5, ry: Math.PI, zone: 'deep' },
  { x: PIER.x1 - 0.35, z: PIER.z0 + 3.6, ry: Math.PI / 2, zone: 'deep' },
  { x: RIV.x0 - 0.5, z: BRIDGE.z0 - 2.2, ry: Math.PI / 2, zone: 'bridge' },
  { x: RIV.x0 - 0.5, z: BRIDGE.z1 + 2.2, ry: Math.PI / 2, zone: 'bridge' },
  { x: RIV.x1 + 0.5, z: BRIDGE.z0 - 2.2, ry: -Math.PI / 2, zone: 'bridge' },
];

export function createFishing() {
  const scene = new THREE.Scene();
  const sky = 0xbcd2d6;
  scene.background = new THREE.Color(sky); scene.fog = new THREE.Fog(sky, 34, 64);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x50604e, 1.8));
  const sun = new THREE.DirectionalLight(0xffe6c0, 1.5);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0012; sun.shadow.normalBias = 0.05;
  sun.target.position.set(FW / 2, 0, FD / 2); sun.position.set(FW / 2 - 20, 46, FD / 2 + 28);
  {   /* 影子贴图一次盖住整张图 */
    const cam = sun.shadow.camera; cam.position.copy(sun.position); cam.lookAt(sun.target.position); cam.updateMatrixWorld();
    const inv = cam.matrixWorldInverse.copy(cam.matrixWorld).invert(), v = new THREE.Vector3();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const x of [-2, FW + 2]) for (const y of [0, 10]) for (const z of [-4, FD + 2]) {
      v.set(x, y, z).applyMatrix4(inv); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); z0 = Math.min(z0, -v.z); z1 = Math.max(z1, -v.z) }
    Object.assign(cam, { left: x0, right: x1, top: y1, bottom: y0, near: Math.max(0.5, z0 - 5), far: z1 + 5 }); cam.updateProjectionMatrix();
  }
  scene.add(sun, sun.target);
  const sunFollow = makeSunFollow(sun, 26, 1024);   // V1.01 优化：影子只算主角周围

  const TL = new THREE.TextureLoader();

  const obstacles = [], solid = (x0, x1, z0, z1) => obstacles.push({ x0, x1, z0, z1 });
  let built = false, merchant = null, boat = null;
  const bobs = [];   // 水面上一晃一晃的东西（浮标、船）
  const WFX = { tex: [], foam: null, foamTex: null };   // V1.01 水面动画

  /* 模型要等 Kenney 模型读好才有，第一次进钓鱼区时再摆 */
  function build() {
    if (built) return; built = true;
    const add = (name, opt, x, z, ry = 0, y = 0) => { const o = prop(name, opt); if (!o) return null; o.position.set(x, y, z); o.rotation.y = ry; scene.add(o); return o };

    /* V1.01 地面：岸上是两块按岸线、河岸切出来的草地（河西、河东），沿湖岸一条沙滩、河岸一条窄沙带（外缘慢慢透明接草地）；
       水面用院子一样的水面贴图 + 亮纹 + 下风岸边的白浪（风从南边吹来，浪打在南岸——这里湖在北边，所以白浪少一点、贴着岸） */
    const gtex = (n, rep = 1) => { const t = TL.load(`img/ground/${n}.jpg`); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.repeat.set(rep, rep); return t };
    const flatPoly = (poly, y, mat, tile) => { const sh = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z))), g = new THREE.ShapeGeometry(sh, 1), uv = g.attributes.uv, ps = g.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, ps.getX(i) / tile, ps.getY(i) / tile);
      const m = new THREE.Mesh(g, mat); m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; scene.add(m); return m };
    /* 一条带子：A、B 两条线（点数一样），u 顺着走（tile 米一张）、v 从 A 到 B；al：每个点 A、B 两边的透明度 */
    const strip = (A, B, tile, mat, y, al) => { const pos = [], uvs = [], col = [], idx = []; let L = 0;
      for (let i = 0; i < A.length; i++) { if (i) L += Math.hypot(A[i][0] - A[i - 1][0], A[i][1] - A[i - 1][1]); pos.push(A[i][0], 0, A[i][1], B[i][0], 0, B[i][1]); uvs.push(L / tile, 0, L / tile, 1); const [a, b] = al ? al(i) : [1, 1]; col.push(1, 1, 1, a, 1, 1, 1, b) }
      const up = ((A[1][0] - A[0][0]) * (B[0][1] - A[0][1]) - (A[1][1] - A[0][1]) * (B[0][0] - A[0][0])) < 0;   // 三角形一律朝上（朝下的在手机上会被当背面去掉）
      for (let i = 0; i + 1 < A.length; i++) { const k = i * 2; if (up) idx.push(k, k + 2, k + 1, k + 2, k + 3, k + 1); else idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3) }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => i % 3 === 1 ? 1 : 0), 3)); g.setIndex(idx);
      mat.side = THREE.DoubleSide; if (al) { mat.vertexColors = true; mat.transparent = true; mat.depthWrite = false }
      const m = new THREE.Mesh(g, mat); m.position.y = y; m.receiveShadow = true; scene.add(m); return m };
    const grassM = liven(new THREE.MeshLambertMaterial({ map: gtex('sand') }), { antiTile: true });   // 用户：钓鱼这边是沙滩（岸上整片沙地）
    const rz = []; for (let z = shoreZ(RIV.x0) - 0.5; z <= FD + 12; z += 0.5) rz.push(z);
    const lakeW = SH_LINE.filter(([x]) => x < riverX0(shoreZ(x)) - 0.01), lakeE = SH_LINE.filter(([x]) => x > riverX1(shoreZ(x)) + 0.01);
    const zW = lakeW[lakeW.length - 1][1], zE = lakeE[0][1];
    flatPoly([...lakeW, ...rz.filter(z => z >= zW).map(z => [riverX0(z), z]), [riverX0(FD + 12), FD + 12], [-14, FD + 12]], 0, grassM, 5);   // 河西
    flatPoly([...rz.filter(z => z >= zE).map(z => [riverX1(z), z]), [riverX1(FD + 12), FD + 12], [62, FD + 12], ...[...lakeE].reverse()], 0, grassM, 5);   // 河东
    /* 用户：桥那一带才是草地——河东整片草地，河西沿河 7 米宽一条草地（西边慢慢过渡到沙滩） */
    { const gm = liven(new THREE.MeshLambertMaterial({ map: gtex('grass') }), { antiTile: true });
      const gzs = rz.filter(z => z >= zE + 2.2); flatPoly([...gzs.map(z => [riverX1(z) + 0.6, z]), [riverX1(FD + 12) + 0.6, FD + 12], [62, FD + 12], [62, gzs[0]]], 0.006, gm, 5);
      const wz = rz.filter(z => z >= zW + 2.6);
      strip(wz.map(z => [riverX0(z) - 0.6, z]), wz.map(z => [riverX0(z) - 7.5, z]), 5, liven(new THREE.MeshLambertMaterial({ map: gtex('grass') })), 0.007, () => [1, 0]);
      strip(wz.map(z => [riverX0(z) - 0.6, z]), wz.map(z => [riverX0(z) - 4.5, z]), 5, liven(new THREE.MeshLambertMaterial({ map: gtex('grass') })), 0.0072, () => [1, 1]) }
    /* 水边湿沙：沿湖岸往岸上 1.4 米（外缘透明），河岸 0.9 米 */
    const sandM = () => liven(new THREE.MeshLambertMaterial({ map: gtex('shore') }));   // 水边一圈湿一点的沙（湖岸边贴图），往岸上慢慢透明
    strip(lakeW, lakeW.map(([x, z]) => [x, z + 1.4]), 3, sandM(), 0.012, () => [1, 0]);
    strip(lakeE, lakeE.map(([x, z]) => [x, z + 1.4]), 3, sandM(), 0.012, () => [1, 0]);
    const bankW = rz.filter(z => z >= zW).map(z => [riverX0(z), z]), bankE = rz.filter(z => z >= zE).map(z => [riverX1(z), z]);
    strip(bankW, bankW.map(([x, z]) => [x - 0.9, z]), 3, sandM(), 0.013, () => [1, 0]);
    strip(bankE, bankE.map(([x, z]) => [x + 0.9, z]), 3, sandM(), 0.013, () => [1, 0]);
    /* 水：湖一大块（铺到地图外）+ 河；水面贴图 + 亮纹各一层，河往南流得快一点 */
    const wtL = gtex('water', 1), wtR = gtex('water', 1), caL = TL.load('img/ground/caustic.jpg'); caL.wrapS = caL.wrapT = THREE.RepeatWrapping;
    WFX.tex = [[wtL, 0.004, -0.02], [wtR, 0.0, 0.06], [caL, -0.006, -0.04]];
    const lakePoly = [[-14, -24], [62, -24], [62, 13], ...[...SH_LINE].reverse().map(([x, z]) => [x, z + 0.3]), [-14, 13]];
    flatPoly(lakePoly, -0.32, liven(new THREE.MeshLambertMaterial({ map: wtL, color: 0xc4e2ea }), { vary: 0, cloudK: 0.16 }), 4);
    const rv = rz.map(z => [riverX0(z) - 0.3, z]), rv2 = rz.map(z => [riverX1(z) + 0.3, z]);
    strip(rv, rv2, 4, liven(new THREE.MeshLambertMaterial({ map: wtR, color: 0xc4e2ea }), { vary: 0, cloudK: 0.16 }), -0.315);
    { const cm = flatPoly(lakePoly, -0.3, new THREE.MeshBasicMaterial({ map: caL, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }), 3.5); cm.renderOrder = 2; cm.receiveShadow = false }
    /* 白浪：湖岸水边一条（一涌一退），河口两边各一小段 */
    { const ft = TL.load('img/ground/foam.jpg'); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; WFX.foamTex = ft;
      const fm = new THREE.MeshBasicMaterial({ map: ft, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }); WFX.foam = fm;
      for (const part of [lakeW, lakeE]) { const m = strip(part.map(([x, z]) => [x, z - 0.5]), part.map(([x, z]) => [x, z + 0.25]), 4, fm, -0.29); m.renderOrder = 3; m.receiveShadow = false } }

    /* 走不过去的水：湖按岸线切成 0.5 米的竖条（栈桥那一条除外），河按两岸切成 0.5 米的横条（桥那一段除外） */
    for (let x = -20; x < 62; x += 0.5) { const zs = Math.min(shoreZ(x), shoreZ(x + 0.5)) - 0.15;
      if (x + 0.5 > PIER.x0 && x < PIER.x1) { solid(x, x + 0.5, -20, PIER.z0); if (x < PIER.x0) solid(x, PIER.x0, PIER.z0, zs); if (x + 0.5 > PIER.x1) solid(PIER.x1, x + 0.5, PIER.z0, zs) }
      else solid(x, x + 0.5, -20, zs) }
    for (let z = shoreZ(RIV.x0) - 0.5; z < FD + 20; z += 0.5) { if (z + 0.5 > BRIDGE.z0 && z < BRIDGE.z1) continue; const zz = Math.min(FD + 12, z + 0.25); solid(riverX0(zz) + 0.15, riverX1(zz) - 0.15, z, z + 0.5) }

    /* 0.14 用户定：用 Pirate Kit 重新布置（椰子树、木板码头、帆船、沙滩石头），商人用 Coaster Kit 的饮料亭 */
    const P = (n, sc, x, z, ry = 0, y = 0, tint = 0xf0e8dc) => add('p:' + n, { scale: sc, tint }, x, z, ry, y);
    /* V1.01 栈桥换成用户生成的木栈桥（跟院子码头同一个模型），一整条拉长到 9 米多；木板面比地面高 5 厘米，下面垫实心木底（板缝里看不到水） */
    const fitUser = (n, w, len, x, z, ry, deckY) => { const src = prop(n, { scale: 1, tint: 0xffffff }); if (!src) return null;
      src.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.side = THREE.DoubleSide; m.castShadow = true; m.receiveShadow = true } });
      src.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(src), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
      const k = w / sz.x, o = new THREE.Group(); src.position.set(-c.x, -bb.min.y, -c.z); o.add(src); o.scale.set(k, k, len / sz.z); o.rotation.y = ry;
      let dy = 0; if (deckY != null) { const hs = []; for (let t = -3; t <= 3; t++) { const h = new THREE.Raycaster(new THREE.Vector3(c.x - sz.x * 0.1, bb.max.y + 1, c.z + sz.z * t * 0.13), new THREE.Vector3(0, -1, 0)).intersectObject(src, true).find(q => q.point.y < bb.min.y + sz.y * 0.6); if (h) hs.push(h.point.y) }
        hs.sort((a, b) => a - b); dy = hs.length ? deckY - (hs[hs.length >> 1] - bb.min.y) * k : deckY - 0.1 * k }
      o.position.set(x, dy, z); scene.add(o); return o };
    const px = (PIER.x0 + PIER.x1) / 2, pz0 = PIER.z0 - 0.2, pz1 = SHORE + 0.8, seg = (pz1 - pz0) / 2;
    const okPier = !!fitUser('zhanqiao', 1.7, seg * 2, px - 0.2, (pz0 + pz1) / 2, Math.PI, 0.12);   // 用户：栈道高度统一——一整条拉长（以前两段拼，接口一高一低），灯笼杆在湖那头
    if (okPier) { const ub = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.44, pz1 - pz0 - 0.4), new THREE.MeshLambertMaterial({ color: 0x5a3e26 })); ub.position.set(px - 0.15, -0.14, (pz0 + pz1) / 2); scene.add(ub) }
    else for (let z = SHORE + 0.4; z > PIER.z0 - 0.2; z -= 1.6) P('structure-platform', 0.64, px, z - 0.8, 0, -0.55);
    P('barrel', 0.36, PIER.x1 - 0.25, PIER.z0 + 1.6, 0.3, 0);
    for (let x = RIV.x0 - 0.8; x < RIV.x1 + 0.8; x += 1.6) for (const z of [BRIDGE.z0 + 0.6, BRIDGE.z1 - 0.6]) P('structure-platform', 0.64, x + 0.8, z, 0, -0.55);
    for (let x = RIV.x0 - 0.4; x < RIV.x1; x += 1.6) for (const z of [BRIDGE.z0 + 0.05, BRIDGE.z1 - 0.05]) { const o = prop('wood-structure-part', { scale: 1.6, tint: 0xd8c8b0 }); if (o) { o.scale.y = 1.1; o.position.set(x + 0.8, 0, z); scene.add(o) } }
    solid(RIV.x0 - 0.4, RIV.x1 + 0.4, BRIDGE.z0 - 0.1, BRIDGE.z0 + 0.15); solid(RIV.x0 - 0.4, RIV.x1 + 0.4, BRIDGE.z1 - 0.15, BRIDGE.z1 + 0.1);   // 扶手挡住，从桥两头上下

    /* 船：湖西岸停一艘小渔船（V1.01 换成跟院子码头同一条船，来回一致），旁边一段短栈桥当上船的地方；湖里几个红白浮标（代码做的） */
    boat = fitUser('yuchuan', 1.35, 3.2, 4.8, SHORE - 2.4, Math.PI / 2, null);
    if (boat) { boat.position.y = 0; boat.updateMatrixWorld(true); let fl = Infinity;
      for (const [dx, dz] of [[-0.6, 0], [0, 0], [0.6, 0], [0.3, 0.2], [-0.3, -0.2]]) { const h = new THREE.Raycaster(new THREE.Vector3(boat.position.x + dx, 5, boat.position.z + dz), new THREE.Vector3(0, -1, 0)).intersectObject(boat, true)[0]; if (h && h.point.y < 0.9) fl = Math.min(fl, h.point.y) }
      const by = -0.32 + 0.13 - (fl === Infinity ? 0.2 : fl); boat.position.y = by; bobs.push({ o: boat, y: by, k: 1, boat: true }) }
    else { boat = P('ship-medium', 0.42, 4.6, SHORE - 2.6, Math.PI / 2, -0.45); if (boat) bobs.push({ o: boat, y: -0.45, k: 0.6 }) }
    if (!fitUser('zhanqiao', 1.3, 6, 5.6, SHORE - 0.45, Math.PI / 2, 0.1)) for (let x = 2.6; x < 8.6; x += 1.6) P('platform', 0.64, x, SHORE - 0.5, 0, -0.04);   // 上船的木板
    { const red = new THREE.MeshLambertMaterial({ color: 0xe8442e }), white = new THREE.MeshLambertMaterial({ color: 0xf4f0e6 }), dark = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
      for (const [x, z, flag] of [[10, 6, 0], [31, 5, 0], [19, 3, 1]]) { const g = new THREE.Group();
        const lo = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), red), hi = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), white);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, flag ? 1.1 : 0.6, 6), dark); pole.position.y = flag ? 0.75 : 0.5; g.add(lo, hi, pole);
        if (flag) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.22), new THREE.MeshLambertMaterial({ color: 0xe8442e, side: THREE.DoubleSide })); f.position.set(0.19, 1.15, 0); g.add(f) }
        g.traverse(m => { if (m.isMesh) m.castShadow = true }); g.position.set(x, -0.38, z); scene.add(g); bobs.push({ o: g, y: -0.38, k: 1 + x * 0.05 }) } }
    P('ship-wreck', 0.4, 35, 3.2, 0.7, -0.9);
    P('boat-row-small', 0.55, RIV.x1 + 2.2, BRIDGE.z1 + 3.6, 0.3, 0.02);   // 岸上拖着一条小划艇
    solid(RIV.x1 + 1.4, RIV.x1 + 3, BRIDGE.z1 + 2.8, BRIDGE.z1 + 4.4);

    /* 钓鱼区的商人：船旁边的饮料亭 + 木箱木桶 */
    merchant = { x: 8.6, z: SHORE + 3.2 };
    solid(merchant.x - 0.3, merchant.x + 0.3, merchant.z - 0.3, merchant.z + 0.3);   // 商人就是一个人（0.14 用户定，不要店面）
    P('crate', 0.6, merchant.x + 0.2, merchant.z - 1.7, 0.3); P('crate-bottles', 0.55, merchant.x - 0.9, merchant.z - 1.9, -0.4); P('barrel', 0.5, merchant.x + 0.3, merchant.z + 1.7);
    solid(merchant.x - 1.4, merchant.x + 0.6, merchant.z - 2.4, merchant.z - 1.3); solid(merchant.x - 0.1, merchant.x + 0.7, merchant.z + 1.3, merchant.z + 2.1);

    /* 沙滩：几块沙地、草丛、石头；椰子树围在南边和东边（不挡钓鱼点） */
    /* V1.01 用户：钓鱼区是沙滩，不要草皮、泥土块（以前的 patch-sand / patch-grass 贴片去掉） */
    const rocks = [['rocks-sand-a', 0.3, 2.6, SHORE + 0.9], ['rocks-sand-c', 0.32, 30.5, SHORE + 0.9], ['rocks-sand-b', 0.28, 34.2, SHORE + 2.6], ['rocks-a', 0.24, riverX0(BRIDGE.z0 - 5) - 1.3, BRIDGE.z0 - 5], ['rocks-c', 0.3, riverX1(BRIDGE.z0 - 5.2) + 1.3, BRIDGE.z0 - 5.2], ['rocks-sand-c', 0.26, RIV.x0 - 1.4, BRIDGE.z1 + 4.6]];
    for (const [n, sc, x, z] of rocks) if (P(n, sc, x, z, x * 1.3)) solid(x - 0.6, x + 0.6, z - 0.6, z + 0.6);
    const palms = [[3, 24.5], [8, 26], [14, 25], [21, 26.5], [27, 25], [33, 26], [2, 19], [45.5, 25], [46, 14], [46.5, 20], [31, 21.5], [12, 21], [19.5, SHORE + 5.8], [35.5, SHORE + 4.5]];
    const PN = ['palm-bend', 'palm-detailed-straight', 'palm-straight', 'palm-detailed-bend'];
    palms.forEach(([x, z], i) => { if (P(PN[i % 4], 0.95 + (i % 3) * 0.1, x, z, i * 1.7)) solid(x - 0.35, x + 0.35, z - 0.35, z + 0.35) });

    P('chest', 0.45, 20.5, SHORE + 5.4, 0.6); P('tool-paddle', 0.6, px + 1.3, SHORE + 0.8, 0.9);
  }

  /* 浮漂（抛竿以后落在水里，咬钩时往下沉） */
  /* 浮漂：红白两色的小球 + 白色立杆（放大一点，正常视角也看得清）；鱼线：一串细圆柱拼成的、往下垂一点的线 */
  const float = new THREE.Group();
  { const red = new THREE.MeshLambertMaterial({ color: 0xff3a2a }), white = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const lo = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), red);
    const hi = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), white);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 6), red); st.position.y = 0.3;
    float.add(lo, hi, st); float.visible = false; scene.add(float) }
  const SEG = 10, segGeo = new THREE.CylinderGeometry(1, 1, 1, 4), segMat = new THREE.MeshBasicMaterial({ color: 0xf4f4f4 });
  const segs = Array.from({ length: SEG }, () => { const m = new THREE.Mesh(segGeo, segMat); m.visible = false; m.frustumCulled = false; scene.add(m); return m });
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
  const pt = (from, to, sag, t, out) => out.lerpVectors(from, to, t).setY(from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * sag);

  function update(t) {
    for (const b of bobs) { if (b.boat) { b.o.position.y = b.y + Math.sin(t * 1.3) * 0.025 + Math.sin(t * 2.3 + 0.7) * 0.012; b.o.rotation.x = Math.sin(t * 1.05) * 0.045 + Math.sin(t * 1.9 + 1.3) * 0.015; b.o.rotation.z = Math.sin(t * 0.8 + 1) * 0.02; continue }
      b.o.position.y = b.y + Math.sin(t * b.k) * 0.04; b.o.rotation.z = Math.sin(t * b.k * 0.8) * 0.03 }
    /* V1.01 水面动画：湖慢慢往北流、河往南流得快一点、亮纹另一个方向；岸边白浪一涌一退 */
    const dt = WFX.last == null ? 0 : Math.min(0.1, Math.max(0, t - WFX.last)); WFX.last = t;
    for (const [tx, vx, vy] of WFX.tex) { tx.offset.x += vx * dt; tx.offset.y += vy * dt }
    if (WFX.foam) { const sg = Math.sin(t * 1.25); WFX.foam.opacity = 0.3 + 0.15 * sg; WFX.foamTex.offset.y = -0.12 * sg; WFX.foamTex.offset.x += dt * 0.01 }
  }
  /* 浮漂位置：from（竿尖）→ at（水面上的点）；sink 0..1 往下沉；tight：拉鱼时线绷直 */
  /* airY：抛竿、收竿时浮漂在空中飞（不给就浮在水面上） */
  function setFloat(on, from, at, sink = 0, t = 0, tight = false, airY = null) {
    float.visible = on; segs.forEach(m => { m.visible = on }); if (!on) return;
    float.position.set(at.x, airY != null ? airY : -0.36 + Math.sin(t * 3) * 0.025 - sink * 0.22, at.z);
    _c.set(float.position.x, float.position.y + 0.46, float.position.z);
    const sag = tight ? 0.05 : 0.5;
    for (let i = 0; i < SEG; i++) {
      pt(from, _c, sag, i / SEG, _a); pt(from, _c, sag, (i + 1) / SEG, _b);
      const m = segs[i], len = _a.distanceTo(_b); m.position.copy(_a).add(_b).multiplyScalar(0.5);
      m.scale.set(0.012, len, 0.012); m.quaternion.setFromUnitVectors(_up, _d.subVectors(_b, _a).normalize());
    }
  }
  const start = new THREE.Vector3(6.4, 0, SHORE + 1.4);
  return { scene, sunFollow, build, update, setFloat, B, obstacles, start, get boat() { return boat }, get merchant() { return merchant }, boatAt: { x: 5.2, z: SHORE + 0.9 } };
}
