/* ================= 拾荒区：单独一张地图，每次进来都随机生成 =================
   坐标：x 向东 0..SW，z 向南 0..SD（和院子的场景分开，用自己的 THREE.Scene）。
   一条东西向的主路 + 1～2 条南北向的路，路把地图切成一块一块：有的是楼（整块挡住），有的是空地（能进去捡东西）。
   货车停在主路最西头：进出拾荒区都在这里，周围一圈是安全区（丧尸不追）。
   所有挡路的东西都按模型实际大小加碰撞；随机完以后用网格算一遍主角能走到哪，物资和丧尸只放在走得到的地方。 */
import * as THREE from 'three';
import { makeSunFollow } from './groundfx.js';
import * as M from './models.js';
import { prop, CARS, BUILDINGS, FAR, FOOD_DEBRIS } from './props.js';
import { obb, collide } from './world.js';

export const SW = 64, SD = 44;
const B = { x0: 0, x1: SW, z0: 0, z1: SD };
const CELL = 0.5, GW = SW / CELL, GD = SD / CELL;
export const SAFE_R = 5;                                   // 货车周围的安全区半径

/* 可以重复的随机数（同一个 seed 生成同一张图，方便查问题） */
function rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

export function createScav() {
  const scene = new THREE.Scene();
  const sky = 0xcdb894;
  scene.background = new THREE.Color(sky); scene.fog = new THREE.Fog(sky, 36, 70);
  const hemi = new THREE.HemisphereLight(0xfff0dc, 0x5e544a, 1.8); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdcb0, 1.55);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0012; sun.shadow.normalBias = 0.05;
  sun.target.position.set(SW / 2, 0, SD / 2); sun.position.set(SW / 2 - 22, 48, SD / 2 + 30);
  sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
  {   /* 影子贴图一次盖住整张拾荒区（和院子一样，太阳不跟着镜头走，免得影子闪） */
    const cam = sun.shadow.camera; cam.position.copy(sun.position); cam.lookAt(sun.target.position); cam.updateMatrixWorld();
    const inv = cam.matrixWorldInverse.copy(cam.matrixWorld).invert(), v = new THREE.Vector3();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const x of [-2, SW + 2]) for (const y of [0, 12]) for (const z of [-4, SD + 2]) {
      v.set(x, y, z).applyMatrix4(inv); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); z0 = Math.min(z0, -v.z); z1 = Math.max(z1, -v.z) }
    Object.assign(cam, { left: x0, right: x1, top: y1, bottom: y0, near: Math.max(0.5, z0 - 5), far: z1 + 5 }); cam.updateProjectionMatrix();
  }
  scene.add(sun, sun.target);
  const sunFollow = makeSunFollow(sun, 22, 1024);   // V1.01 优化：影子只算主角周围

  /* 地面贴图（院子用的同一套 Kenney Isometric Roads 加工图） */
  const TL = new THREE.TextureLoader(), texBase = {};
  const tex = name => texBase[name] || (texBase[name] = (() => { const t = TL.load(`img/ground/${name}${/^(grass|dirt|concrete|pasture|shore|asphalt|sand)$/.test(name) ? ".jpg" : ".png"}`); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t })());

  let root = null, own = [];
  function clear() {
    if (!root) return;
    scene.remove(root);
    const walkDispose = o => { if (o.userData.prop) return; if (o.isMesh && o.geometry) o.geometry.dispose(); o.children.forEach(walkDispose) };   // Kenney 模型和模型库共用几何体，不能释放
    walkDispose(root);
    for (const x of own) x.dispose();
    root = null; own = [];
  }

  function gen(seed = Date.now()) {
    clear();
    const R = rng(seed), ri = (a, b) => a + R() * (b - a), pick = a => a[Math.floor(R() * a.length)];
    root = new THREE.Group(); scene.add(root);
    const obstacles = [], fades = [];
    let blkN = 0;                       // 楼的「排」编号（makeBuildings 里用）
    const solid = (x0, x1, z0, z1) => obstacles.push({ x0, x1, z0, z1 });
    const add = (o, x, z, ry = 0) => { o.position.x = x; o.position.z = z; o.rotation.y = ry; root.add(o); return o };
    const plane = (name, w, d, x, z, y, tile = 4, rot = 0) => {
      let m;
      if (typeof name === 'number') m = M.mat(name);              // 纯色（人行道、楼下的水泥地）
      else { const t = tex(name).clone(); t.needsUpdate = true; t.repeat.set((rot ? d : w) / tile, (rot ? w : d) / tile); own.push(t); m = new THREE.MeshLambertMaterial({ map: t }); own.push(m) }
      const g = new THREE.PlaneGeometry(rot ? d : w, rot ? w : d); const mesh = new THREE.Mesh(g, m);
      mesh.rotation.set(-Math.PI / 2, 0, rot); mesh.position.set(x, y, z); mesh.receiveShadow = true; root.add(mesh); return mesh;
    };
    /* 模型实际占的地方（不算水平转角），按转角变成斜矩形挡路；pad 往里缩一点，免得看着没碰到就被挡住 */
    const box3 = new THREE.Box3();
    const solidOf = (o, ry, pad = 0.1) => {
      const q = o.quaternion.clone();
      o.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ry)); o.updateMatrixWorld(true); box3.setFromObject(o);
      const ox = (box3.min.x + box3.max.x) / 2 - o.position.x, oz = (box3.min.z + box3.max.z) / 2 - o.position.z;
      const hw = Math.max(0.15, (box3.max.x - box3.min.x) / 2 - pad), hd = Math.max(0.15, (box3.max.z - box3.min.z) / 2 - pad);
      o.quaternion.copy(q); o.updateMatrixWorld(true);
      const c = Math.cos(ry), sn = Math.sin(ry), b = obb(o.position.x + ox * c + oz * sn, o.position.z - ox * sn + oz * c, hw, hd, ry);
      obstacles.push(b); return b;
    };
    const P = (name, opts) => { const o = prop(name, opts); if (o) o.userData.prop = true; return o };

    /* ---------- 1. 路 ---------- */
    const RW = 6, WALK = 1.5, HALF = RW / 2 + WALK;          // 柏油 6 米，两边人行道各 1.5 米
    const zr = pick([12, 16, 20, 24, 28, 32]);                  // 主路（东西向）
    const nV = R() < 0.35 ? 1 : 2;
    const xs = nV === 1 ? [ri(24, 42)] : [ri(16, 27), ri(38, 52)];
    const vroads = xs.map(x => { const k = R(); return { x: Math.round(x), z0: k < 0.25 ? zr - HALF : 0, z1: k > 0.75 ? zr + HALF : SD } });   // 有的路只通到一边（丁字路口）
    /* 小巷（土路，3 米宽）：随机从主路往南或往北伸出去一条 */
    const alley = R() < 0.7 ? (() => { const x = Math.round(ri(8, SW - 8)); return xs.some(v => Math.abs(v - x) < 9) ? null : { x, north: R() < 0.5 } })() : null;
    /* 网格：哪些格子是路（路 + 人行道） */
    const road = new Uint8Array(SW * SD);
    const markRoad = (x0, x1, z0, z1) => { for (let z = Math.max(0, Math.floor(z0)); z < Math.min(SD, Math.ceil(z1)); z++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(SW, Math.ceil(x1)); x++) road[z * SW + x] = 1 };
    markRoad(0, SW, zr - HALF, zr + HALF);
    for (const v of vroads) markRoad(v.x - HALF, v.x + HALF, v.z0, v.z1);
    if (alley) alley.north ? markRoad(alley.x - 1.5, alley.x + 1.5, 0, zr - HALF) : markRoad(alley.x - 1.5, alley.x + 1.5, zr + HALF, SD);

    /* 地面：外面一大片荒地；路是柏油 + 人行道 */
    plane('dirt', SW + 80, SD + 80, SW / 2, SD / 2, -0.02, 6);
    const WALKC = 0x9a9286, BLDC = 0x6e675d;
    plane(WALKC, SW, HALF * 2, SW / 2, zr, 0.004);
    plane('asphalt', SW, RW, SW / 2, zr, 0.008, 4);
    for (const v of vroads) { plane(WALKC, HALF * 2, v.z1 - v.z0, v.x, (v.z0 + v.z1) / 2, 0.005, 3); plane('asphalt', RW, v.z1 - v.z0, v.x, (v.z0 + v.z1) / 2, 0.009, 4) }
    if (alley) { const a0 = alley.north ? 0 : zr + HALF, a1 = alley.north ? zr - HALF : SD; plane('dirt', 3, a1 - a0, alley.x, (a0 + a1) / 2, 0.006, 2.4) }
    plane('asphalt', HALF * 2, HALF * 2, xs[0], zr, 0.011, 4); if (xs[1]) plane('asphalt', HALF * 2, HALF * 2, xs[1], zr, 0.011, 4);   // 路口

    /* ---------- 2. 货车（进出口） ---------- */
    const truck = new THREE.Vector3(3.6, 0, zr - 1.2), start = new THREE.Vector3(7.5, 0, zr + 0.6);
    {
      const o = P('truck', { scale: 1.6, tint: 0xa89a86 }) || M.carMesh(0x6a7a5a);
      add(o, truck.x, truck.z, Math.PI / 2); solidOf(o, Math.PI / 2, 0.15);
      /* 车后面（地图最西边）一排路障 + 沙袋，表示「从这边进来」 */
      for (let z = zr - HALF + 1; z <= zr + HALF - 1; z += 2.1) add(M.barrierMesh(), 0.6, z, Math.PI / 2);
    }
    const nearTruck = (x, z, r) => Math.hypot(x - truck.x, z - truck.z) < r;

    /* ---------- 3. 路上的废车、路障、零碎（全都挡路） ---------- */
    const onRoad = [];          // 已经放了东西的位置，别叠在一起
    const freeOnRoad = (x, z, r) => !nearTruck(x, z, 9) && onRoad.every(([a, b, rr]) => Math.hypot(a - x, b - z) > r + rr);
    const roadSpot = () => {    // 随机一个路上的点：主路或者南北向的路
      if (R() < 0.6 || !vroads.length) return { x: ri(10, SW - 3), z: zr + ri(-RW / 2 + 1.2, RW / 2 - 1.2), ry: (R() < 0.5 ? 0 : Math.PI) + ri(-0.35, 0.35) };
      const v = pick(vroads); return { x: v.x + ri(-RW / 2 + 1.2, RW / 2 - 1.2), z: ri(v.z0 + 2, v.z1 - 2), ry: Math.PI / 2 + (R() < 0.5 ? 0 : Math.PI) + ri(-0.35, 0.35) };
    };
    const nCars = 6 + Math.floor(R() * 4);
    for (let i = 0, tries = 0; i < nCars && tries < 80; tries++) {
      const s = roadSpot(); if (!freeOnRoad(s.x, s.z, 3)) continue;
      const burnt = R() < 0.25, flip = R() < 0.12, o = P(pick(CARS), { scale: 1.45, tint: pick([0x9c8f80, 0x8a8278, 0xa09080]), burnt }) || M.carMesh(pick([0x8a5a44, 0x5a6e8a, 0x6b7a4a]));
      add(o, s.x, s.z, s.ry); if (flip) { o.rotateZ(Math.PI / 2 * 0.98); o.position.y = 1.05 } else o.rotateZ(R() < 0.5 ? 0.04 : -0.03);
      solidOf(o, s.ry); onRoad.push([s.x, s.z, 2.6]); i++;
    }
    for (let i = 0, tries = 0; i < 6 && tries < 50; tries++) {
      const s = roadSpot(); if (!freeOnRoad(s.x, s.z, 1.6)) continue;
      const o = add(M.barrierMesh(), s.x, s.z, s.ry); solidOf(o, s.ry, 0.05); onRoad.push([s.x, s.z, 1.4]); i++;
    }
    /* 雪糕筒（锥桶）：一两个到三个一堆，有的倒在地上 */
    const cones = (x, z, n) => { for (let k = 0; k < n; k++) { const cx = x + (k % 2) * 0.7, cz = z + Math.floor(k / 2) * 0.7, o = P('cone', { scale: 1.45, tint: 0xc8b8a4 }); if (!o) return; add(o, cx, cz, ri(0, 6.28)); if (R() < 0.25) { o.rotateZ(Math.PI / 2 * 0.95); o.position.y = 0.25 } solidOf(o, o.rotation.y, 0.02) } };
    for (let i = 0, tries = 0; i < 9 && tries < 80; tries++) {
      const s = roadSpot(); if (!freeOnRoad(s.x, s.z, 1.3)) continue;
      cones(s.x, s.z, 1 + Math.floor(R() * 3)); onRoad.push([s.x, s.z, 1]); i++;
    }
    /* 木箱：一个或者两个摞在一起 */
    for (let i = 0, tries = 0; i < 5 && tries < 50; tries++) {
      const s = roadSpot(); if (!freeOnRoad(s.x, s.z, 1.3)) continue;
      const ry = ri(0, 6.28), o = P(R() < 0.5 ? 'box-large' : 'box', { scale: 3.4, tint: 0xb4a890 }) || M.crateMesh(0x8f6e46); add(o, s.x, s.z, ry); solidOf(o, ry, 0.05);
      if (R() < 0.4) { const o2 = P('box', { scale: 3.4, tint: 0xa89c84 }); if (o2) { add(o2, s.x + 0.1, s.z, ry + 0.4); o2.position.y = 0.85 } }
      onRoad.push([s.x, s.z, 1]); i++;
    }
    /* 不挡路的生活杂物（鱼骨头、纸袋、泡沫饭盒） */
    for (let i = 0; i < 14; i++) { const s = roadSpot(); const n = pick(FOOD_DEBRIS), o = P(n, { scale: n === 'styrofoam' ? 1 : 1.6, tint: 0x8f8574 }); if (o) { add(o, s.x, s.z, ri(0, 6.28)); o.position.y = 0.01 } }

    /* ---------- 4. 路切出来的地块：楼（整块挡住）或者空地 ---------- */
    const seen = new Uint8Array(SW * SD), blocks = [];
    for (let z = 0; z < SD; z++) for (let x = 0; x < SW; x++) {
      const k = z * SW + x; if (road[k] || seen[k]) continue;
      let x1 = x; while (x1 + 1 < SW && !road[z * SW + x1 + 1]) x1++;
      let z1 = z; while (z1 + 1 < SD && !road[(z1 + 1) * SW + x]) z1++;
      for (let zz = z; zz <= z1; zz++) for (let xx = x; xx <= x1; xx++) seen[zz * SW + xx] = 1;
      blocks.push({ x0: x, x1: x1 + 1, z0: z, z1: z1 + 1 });
    }
    const isRoad = (x, z) => x >= 0 && z >= 0 && x < SW && z < SD && road[Math.floor(z) * SW + Math.floor(x)];
    let lots = 0;
    blocks.sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0));
    blocks.forEach((b, bi) => {
      const w = b.x1 - b.x0, d = b.z1 - b.z0;
      const wantLot = w < 5 || d < 5 ? true : lots < 2 ? R() < 0.7 : R() < 0.4;
      if (wantLot) { lots++; makeLot(b) } else makeBuildings(b);
    });

    /* 楼：整块挡住；沿着靠路的那几边摆楼（City Kit），中间用低模楼填；楼挡住主角时变半透明 */
    function makeBuildings(b) {
      const bid = ++blkN;                 // 同一块地、同一边（同一排）的楼一起变透明
      /* 每栋楼自己挡路；楼后面剩下的空地能走进去（从楼和楼之间的空隙进），也会刷物资 */
      plane(pick(['dirt', 'dirt', 'grass']), b.x1 - b.x0, b.z1 - b.z0, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 0.002, 3);
      const placed = [];
      const bld = (x0, x1, z0, z1) => { placed.push({ x0, x1, z0, z1 }); solid(x0 + 0.1, x1 - 0.1, z0 + 0.1, z1 - 0.1); plane(BLDC, x1 - x0 + 0.6, z1 - z0 + 0.6, (x0 + x1) / 2, (z0 + z1) / 2, 0.004) };
      const fits = (x0, x1, z0, z1) => x0 >= b.x0 - 0.01 && x1 <= b.x1 + 0.01 && z0 >= b.z0 - 0.01 && z1 <= b.z1 + 0.01 && placed.every(p => x1 <= p.x0 + 0.05 || x0 >= p.x1 - 0.05 || z1 <= p.z0 + 0.05 || z0 >= p.z1 - 0.05);
      /* 哪几边靠路：楼的正面朝那边 */
      const sides = [];
      if (isRoad((b.x0 + b.x1) / 2, b.z1 + 0.5)) sides.push({ ry: 0, along: 'x', edge: 'z1' });          // 南边是路：楼正面朝南（朝镜头）
      if (isRoad((b.x0 + b.x1) / 2, b.z0 - 0.5)) sides.push({ ry: Math.PI, along: 'x', edge: 'z0' });
      if (isRoad(b.x1 + 0.5, (b.z0 + b.z1) / 2)) sides.push({ ry: Math.PI / 2, along: 'z', edge: 'x1' });
      if (isRoad(b.x0 - 0.5, (b.z0 + b.z1) / 2)) sides.push({ ry: -Math.PI / 2, along: 'z', edge: 'x0' });
      if (!sides.length) sides.push({ ry: 0, along: 'x', edge: 'z1' });
      for (const sd of sides) {
        let t = sd.along === 'x' ? b.x0 : b.z0; const end = sd.along === 'x' ? b.x1 : b.z1;
        for (let n = 0; n < 12 && t < end - 2; n++) {
          const name = pick(BUILDINGS), sc = ri(3.2, 3.9);          // 两三层的楼，别太高挡住街
          const o = P(name, { scale: sc, tint: pick([0xa89c8a, 0x9a9488, 0xb0a08c, 0x948a7c]) });
          let bw, bd, g;
          if (o) { o.rotation.y = sd.ry; o.position.set(0, 0, 0); o.updateMatrixWorld(true); box3.setFromObject(o); bw = box3.max.x - box3.min.x; bd = box3.max.z - box3.min.z; g = o }
          else { bw = ri(4, 7); bd = ri(4, 6); g = M.ruinMesh(bw, ri(3, 6), bd, pick([0x8f8273, 0x9a8b78, 0x7f7466])) }
          const cx0 = o ? (box3.min.x + box3.max.x) / 2 : 0, cz0 = o ? (box3.min.z + box3.max.z) / 2 : 0;
          let x0, x1, z0, z1;
          if (sd.along === 'x') { x0 = t; x1 = t + bw; if (sd.edge === 'z1') { z1 = b.z1 - 0.3; z0 = z1 - bd } else { z0 = b.z0 + 0.3; z1 = z0 + bd } }
          else { z0 = t; z1 = t + bd; if (sd.edge === 'x1') { x1 = b.x1 - 0.3; x0 = x1 - bw } else { x0 = b.x0 + 0.3; x1 = x0 + bw } }
          if (!fits(x0, x1, z0, z1)) { t += 1.5; continue }
          g.position.set((x0 + x1) / 2 - cx0, 0, (z0 + z1) / 2 - cz0); if (o) g.rotation.y = sd.ry; root.add(g);
          if (R() < 0.25) g.rotateZ(R() < 0.5 ? 0.025 : -0.025);       // 有的楼微微歪
          bld(x0, x1, z0, z1); addFade(g, x0, x1, z0, z1, bid + ':' + sd.edge);
          t = (sd.along === 'x' ? x1 : z1) + (R() < 0.3 ? ri(0.5, 2) : 0.2);
        }
      }
      /* 中间空着的：低模楼、废墟块 */
      for (let n = 0; n < 6; n++) {
        const s = ri(2.6, 3.4), o = P(pick(FAR), { scale: s, tint: 0x8f8678 });
        const g = o || M.ruinMesh(ri(3, 5), ri(3, 5), ri(3, 5), 0x857a6c);
        g.position.set(0, 0, 0); g.updateMatrixWorld(true); box3.setFromObject(g);
        const bw = box3.max.x - box3.min.x, bd = box3.max.z - box3.min.z, cx = ri(b.x0 + bw / 2, b.x1 - bw / 2), cz = ri(b.z0 + bd / 2, b.z1 - bd / 2);
        if (b.x1 - b.x0 < bw || b.z1 - b.z0 < bd || !fits(cx - bw / 2, cx + bw / 2, cz - bd / 2, cz + bd / 2)) continue;
        g.position.set(cx - (box3.min.x + box3.max.x) / 2, 0, cz - (box3.min.z + box3.max.z) / 2); root.add(g);
        bld(cx - bw / 2, cx + bw / 2, cz - bd / 2, cz + bd / 2); addFade(g, cx - bw / 2, cx + bw / 2, cz - bd / 2, cz + bd / 2, bid + ':fill');
      }
      makeLot(b, placed);             // 剩下的地方当空地：围栏、废车、木箱……
    }
    /* 空地：能进去，物资也会刷在这里；四周没靠路的那几边围上围栏，里面随机放箱子、油桶、石头、树、帐篷、废车 */
    function makeLot(b, placed) {
      const w = b.x1 - b.x0, d = b.z1 - b.z0;
      if (!placed) plane(pick(['dirt', 'grass', 'sand']), w, d, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 0.003, 3);
      const inBld = (x, z, m) => (placed || []).some(p => x > p.x0 - m && x < p.x1 + m && z > p.z0 - m && z < p.z1 + m);
      const fence = (x0, z0, x1, z1) => {
        const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(len / 2));
        for (let i = 0; i <= n; i++) root.add(M.fencePost(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n));
        for (const y of [0.45, 1.0]) root.add(M.box(Math.abs(x1 - x0) || 0.08, 0.12, Math.abs(z1 - z0) || 0.08, 0x7a6a52, (x0 + x1) / 2, y, (z0 + z1) / 2));
        solid(Math.min(x0, x1) - 0.12, Math.max(x0, x1) + 0.12, Math.min(z0, z1) - 0.12, Math.max(z0, z1) + 0.12);
      };
      /* 地图边上的那几边一定围上；靠路的边敞开 */
      if (b.z0 <= 0.01) fence(b.x0, b.z0 + 0.2, b.x1, b.z0 + 0.2); else if (!isRoad((b.x0 + b.x1) / 2, b.z0 - 0.5)) fence(b.x0, b.z0 + 0.2, b.x1, b.z0 + 0.2);
      if (b.z1 >= SD - 0.01) fence(b.x0, b.z1 - 0.2, b.x1, b.z1 - 0.2);
      if (b.x0 <= 0.01) fence(b.x0 + 0.2, b.z0, b.x0 + 0.2, b.z1);
      if (b.x1 >= SW - 0.01) fence(b.x1 - 0.2, b.z0, b.x1 - 0.2, b.z1);
      const taken = [];
      const n = Math.round(w * d / (placed ? 40 : 28));
      const kinds = [['car', 1.45], ['car', 1.45], ['barrier', 1], ['barrier', 1], ['cone', 1], ['cone', 1], ['box-large', 3.4], ['box', 3.4], ['tree', 3.4], ['tree-tall', 3]];   // 挡路的只用废车、警示栏杆、雪糕筒（加几棵树）
      for (let i = 0, tries = 0; i < n && tries < n * 6; tries++) {
        const [name, sc] = pick(kinds), x = ri(b.x0 + 1.5, b.x1 - 1.5), z = ri(b.z0 + 1.5, b.z1 - 1.5), rr = name === 'car' ? 2.6 : name === 'barrier' ? 1.2 : 1;
        if (taken.some(([a, c, r2]) => Math.hypot(a - x, c - z) < rr + r2 + 1.2) || inBld(x, z, rr + 1)) continue;
        const ry = ri(0, 6.28);
        if (name === 'cone') { cones(x, z, 2 + Math.floor(R() * 2)); taken.push([x, z, rr]); i++; continue }
        const o = name === 'car' ? (P(pick(CARS), { scale: 1.45, tint: 0x8a8278, burnt: R() < 0.5 }) || M.carMesh(0x6a5a4a)) : name === 'barrier' ? M.barrierMesh() : (P(name, { scale: sc, tint: 0xb4a890 }) || M.crateMesh());
        add(o, x, z, ry); solidOf(o, ry, name.startsWith('tree') ? 0.6 : name === 'barrier' ? 0.02 : 0.08); taken.push([x, z, rr]); i++;
      }
    }
    function addFade(g, x0, x1, z0, z1, row) {
      g.updateMatrixWorld(true); box3.setFromObject(g); const h = box3.max.y;
      const mats = [];
      g.traverse(m => { if (!m.isMesh) return; m.material = Array.isArray(m.material) ? m.material.map(x => { const c = x.clone(); own.push(c); mats.push(c); return c }) : (() => { const c = m.material.clone(); own.push(c); mats.push(c); return c })() });
      fades.push({ x0, x1, z0, z1, h, mats, op: 1, row });
    }

    /* 地图边：东、北、南没有楼的地方也挡住（主路、南北路通到地图边的口子用路障封上） */
    for (const v of vroads) { if (v.z0 <= 0) for (let x = v.x - HALF + 1; x < v.x + HALF; x += 2.1) add(M.barrierMesh(), x, 0.5, 0); if (v.z1 >= SD) for (let x = v.x - HALF + 1; x < v.x + HALF; x += 2.1) add(M.barrierMesh(), x, SD - 0.5, 0) }
    for (let z = zr - HALF + 1; z < zr + HALF; z += 2.1) add(M.barrierMesh(), SW - 0.5, z, Math.PI / 2);
    if (alley) { const zz = alley.north ? 0.5 : SD - 0.5; add(M.barrierMesh(), alley.x, zz, 0) }

    /* ---------- 5. 网格：主角能走到哪 ---------- */
    const walk = new Uint8Array(GW * GD), q = { x: 0, z: 0 };
    for (let j = 0; j < GD; j++) for (let i = 0; i < GW; i++) {
      q.x = (i + 0.5) * CELL; q.z = (j + 0.5) * CELL; const ox = q.x, oz = q.z;
      collide(q, 0.45, obstacles, B);
      walk[j * GW + i] = Math.abs(q.x - ox) < 1e-4 && Math.abs(q.z - oz) < 1e-4 ? 1 : 0;
    }
    /* 从货车旁边出发，能走到的格子 */
    const reach = new Uint8Array(GW * GD), cellOf = (x, z) => [Math.max(0, Math.min(GW - 1, Math.floor(x / CELL))), Math.max(0, Math.min(GD - 1, Math.floor(z / CELL)))];
    { const [si, sj] = cellOf(start.x, start.z), qq = [sj * GW + si]; reach[qq[0]] = 1;
      while (qq.length) { const k = qq.pop(), i = k % GW, j = (k - i) / GW;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= GW || nj >= GD) continue; const nk = nj * GW + ni; if (walk[nk] && !reach[nk]) { reach[nk] = 1; qq.push(nk) } } } }
    /* 物资能放的地方：走得到、四周也空、离货车远一点 */
    const cand = [];
    for (let j = 1; j < GD - 1; j++) for (let i = 1; i < GW - 1; i++) {
      const k = j * GW + i; if (!reach[k]) continue;
      let ok = true; for (let dj = -1; dj <= 1 && ok; dj++) for (let di = -1; di <= 1; di++) if (!reach[k + dj * GW + di]) { ok = false; break }
      const x = (i + 0.5) * CELL, z = (j + 0.5) * CELL; if (ok && !nearTruck(x, z, 9)) cand.push([x, z]);
    }
    const canReach = (x, z) => { const [i, j] = cellOf(x, z); return !!reach[j * GW + i] };
    /* 随机一个能放东西的点：离 avoid 里的点都至少 minD 远 */
    function spot(avoid = [], minD = 3) {
      for (let t = 0; t < 60; t++) { const c = cand[Math.floor(Math.random() * cand.length)]; if (c && avoid.every(([x, z]) => Math.hypot(x - c[0], z - c[1]) >= minD)) return c }
      return cand[Math.floor(Math.random() * cand.length)] || [start.x + 2, start.z];
    }
    /* 丧尸闲逛的目标：附近 r 米内走得到的点 */
    function near(x, z, r) { for (let t = 0; t < 20; t++) { const a = Math.random() * 6.28, d = Math.random() * r, nx = x + Math.cos(a) * d, nz = z + Math.sin(a) * d; if (nx > 0.5 && nz > 0.5 && nx < SW - 0.5 && nz < SD - 0.5 && canReach(nx, nz) && !nearTruck(nx, nz, SAFE_R + 1)) return new THREE.Vector3(nx, 0, nz) } return null }

    return { seed, obstacles, B, truck, start, cand, spot, near, canReach, fades, zr };
  }

  /* 楼挡住主角时变半透明（镜头在南边斜着往北看：主角在楼北边、离楼不远就会被挡住） */
  const tmp = new THREE.Vector3();
  function update(map, p, dt) {
    /* 只要这一排里有一栋挡住主角，整排一起变透明（用户 10-12：走到楼后面时整排楼都透明，看得清） */
    const rows = new Set();
    for (const f of map.fades) if (p.x > f.x0 - 1.2 && p.x < f.x1 + 1.2 && p.z < f.z1 && p.z > f.z0 - f.h * 0.95 - 1) rows.add(f.row);
    for (const f of map.fades) {
      const want = rows.has(f.row) ? 0.25 : 1; if (Math.abs(f.op - want) < 0.01) continue;
      f.op += (want - f.op) * Math.min(1, dt * 8); if (Math.abs(f.op - want) < 0.01) f.op = want;
      for (const m of f.mats) { const tr = f.op < 0.99; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true } m.opacity = f.op; m.depthWrite = !tr }
    }
  }
  return { scene, gen, update, clear, B, sunFollow };
}
