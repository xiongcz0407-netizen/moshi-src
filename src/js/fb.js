import { perfOpt, PERF_LOAD } from './perf.js';
/* ================= 设计 56：副本（屠夫关）的画面：场地、屠夫、小丧尸、预警、特效、战斗界面、打完开宝箱 =================
   战斗的数都在 fbcore.js（纯逻辑，模拟也用它）；这里只负责画出来、接按键。进出副本、存档在 main.js / fblogic.js。 */
import * as THREE from 'three';
import { loadGLB, lazyTex, A } from './assets.js';
import { prop } from './props.js';
import { addFlat } from './flatshadow.js';
import { createFight, COVERS, ARENA, BUTCHER_ANIM, BOSS_SCALE, push as pushOut, setStage, FB_CFG } from './fbcore.js';
import { buildTox, TOX_ASSETS } from './fbtox.js';   /* 设计 81：第 2 关毒囊 */
import { buildRock, ROCK_ASSETS } from './fbrock.js';   /* 设计 102：第 3 关落石巨人 */
import { buildScream, SCREAM_ASSETS } from './fbscream.js';   /* 设计 114：第 4 关尖啸者 */
import { FB, BOSSES, QUAL, ITEMS, SKILLS } from './fbcfg.js';
import { glowTex, glowMat, glowSprite } from './portal.js';

const tex = (u, rep) => { const t = lazyTex(u); t.colorSpace = THREE.SRGBColorSpace; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]) } t.anisotropy = 4; return t };
const ADD = THREE.AdditiveBlending;
const flatGeo = new THREE.PlaneGeometry(1, 1); flatGeo.rotateX(-Math.PI / 2);
const LIM = { parts: 56, marks: 8 };          // 发烫上限：同时最多几个粒子、地面痕迹（设计 56 第 8 节）
const hyp = Math.hypot;

/* ---------- 预警（地上）：红色半透明 + 边缘一圈 + 从里往外慢慢填满，填满就打下来；最后 20% 闪 ---------- */
const warnMat = (kind) => new THREE.ShaderMaterial({
  uniforms: { p: { value: 0 }, t: { value: 0 }, len: { value: 1 }, wid: { value: 1 }, r: { value: 1 }, col: { value: new THREE.Color(0xff3020) }, kind: { value: kind } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float p, t, len, wid, r, kind; uniform vec3 col; varying vec3 vP;
    void main(){
      float a = 0.0;
      float blink = p > 0.8 ? 0.75 + 0.25 * sin(t * 40.0) : 1.0;
      if (kind < 0.5) {                                  // 圆、扇形：按到中心的距离
        float d = length(vP.xz) / r;
        float edge = smoothstep(0.90, 0.97, d) * (1.0 - smoothstep(0.985, 1.0, d));
        float fill = 1.0 - smoothstep(p - 0.015, p, d);
        a = 0.16 + fill * 0.30 + edge * 0.75;
        a *= 1.0 - smoothstep(0.985, 1.0, d);
      } else if (kind > 1.5) {                            // 设计 102：方格（石柱阵）：按到中心的方形距离
        float d = max(abs(vP.x), abs(vP.z)) / (wid * 0.5);
        float edge = smoothstep(0.86, 0.95, d);
        float fill = 1.0 - smoothstep(p - 0.015, p, d);
        a = 0.16 + fill * 0.30 + edge * 0.7;
        a *= 1.0 - smoothstep(0.97, 1.0, d);
      } else {                                            // 长条：z 是往前（0～len），x 是左右
        float u = vP.z / len, s = abs(vP.x) / (wid * 0.5);
        float edge = smoothstep(0.86, 0.95, s);
        float fill = 1.0 - smoothstep(p - 0.01, p, u);
        float ch = fract(vP.z * 0.55 - t * 1.6 + s * 0.35);   // 往前的箭头
        float arrow = smoothstep(0.0, 0.08, ch) * (1.0 - smoothstep(0.18, 0.26, ch)) * (1.0 - smoothstep(0.55, 0.75, s));
        a = 0.16 + fill * 0.28 + edge * 0.7 + arrow * 0.45;
        a *= 1.0 - smoothstep(0.97, 1.0, s);
      }
      gl_FragColor = vec4(col, a * blink);
    }`,
  transparent: true, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -20,
});
function warnMesh(w) {
  let geo, m;
  if (w.type === 'circle') { geo = new THREE.CircleGeometry(w.r, 48); geo.rotateX(-Math.PI / 2); m = warnMat(0); m.uniforms.r.value = w.r }
  else if (w.type === 'fan') { geo = new THREE.RingGeometry(w.r0 || 0.01, w.r, 32, 1, Math.PI / 2 - w.a / 2, w.a);   /* 设计 61：从刀能碰到的地方开始画（屠夫身子外面） */ geo.rotateX(-Math.PI / 2); geo.rotateY(Math.PI); m = warnMat(0); m.uniforms.r.value = w.r }
  else if (w.type === 'line') { geo = new THREE.PlaneGeometry(w.w, w.len); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, w.len / 2); m = warnMat(1); m.uniforms.len.value = w.len; m.uniforms.wid.value = w.w }
  else if (w.type === 'cells') { const g = new THREE.Group(); for (const c of w.cells) { const q = new THREE.PlaneGeometry(w.s - 0.12, w.s - 0.12); q.rotateX(-Math.PI / 2); const mm = warnMat(2); mm.uniforms.wid.value = w.s - 0.12; const o = new THREE.Mesh(q, mm); o.position.set(c.x, 0.04, c.z); o.renderOrder = 4; g.add(o) } return g }   // 设计 102
  else if (w.type === 'field') {   /* 设计 110：全场滚石——整片发红，每个掩体南边一块绿色安全区 */
    const g = new THREE.Group(), L = w.z1 - w.z0, W = w.x1 - w.x0, ge = new THREE.PlaneGeometry(W, L); ge.rotateX(-Math.PI / 2); ge.translate(0, 0, L / 2); const mm = warnMat(1); mm.uniforms.len.value = L; mm.uniforms.wid.value = W;
    const o = new THREE.Mesh(ge, mm); o.position.set((w.x0 + w.x1) / 2, 0.035, w.z0); o.renderOrder = 4; g.add(o);
    for (const q of w.sh) { const sg = new THREE.PlaneGeometry(q.x1 - q.x0, q.z1 - q.z0); sg.rotateX(-Math.PI / 2); const sm = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0x3cff6a, transparent: true, opacity: 0.5, depthWrite: false, fog: false, toneMapped: false }));
      sm.position.set((q.x0 + q.x1) / 2, 0.06, (q.z0 + q.z1) / 2); sm.renderOrder = 5; g.add(sm) }
    return g }
  else if (w.type === 'lanes' || w.type === 'segs') { const g = new THREE.Group();   // 设计 102：滚石铁轨（整条）、地裂（Y 字）
    const segs = w.type === 'lanes' ? w.xs.map(x => ({ x0: x, z0: w.z0, x1: x, z1: w.z1 })) : w.segs;
    for (const q of segs) { const L = Math.hypot(q.x1 - q.x0, q.z1 - q.z0), ge = new THREE.PlaneGeometry(w.w, L); ge.rotateX(-Math.PI / 2); ge.translate(0, 0, L / 2); const mm = warnMat(1); mm.uniforms.len.value = L; mm.uniforms.wid.value = w.w; if (w.ult) mm.uniforms.col.value.setHex(0xff1a0a);
      const o = new THREE.Mesh(ge, mm); o.position.set(q.x0, 0.04, q.z0); o.rotation.y = Math.atan2(q.x1 - q.x0, q.z1 - q.z0); o.renderOrder = 4; g.add(o) } return g }
  else { const g = new THREE.Group(); for (const p of w.pts) { const c = new THREE.CircleGeometry(w.r, 28); c.rotateX(-Math.PI / 2); const mm = warnMat(0); mm.uniforms.r.value = w.r; const o = new THREE.Mesh(c, mm); o.position.set(p.x, 0.04, p.z); o.renderOrder = 4; g.add(o) } return g }
  if (w.ult) m.uniforms.col.value.setHex(0xff1a0a);
  const o = new THREE.Mesh(geo, m); o.position.set(w.x, 0.04, w.z); if (w.type !== 'circle') o.rotation.y = w.yaw; o.renderOrder = 4; return o;
}
const warnSet = (o, p, t) => o.traverse(c => { if (c.material && c.material.uniforms) { c.material.uniforms.p.value = p; c.material.uniforms.t.value = t } });
const disposeTree = o => o.traverse(c => { if (c.geometry && c.geometry !== flatGeo) c.geometry.dispose(); if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => m.dispose()) });

/* 设计 74：副本读取出的错（文件名、原因），?debug 的 __g.FB_ERR 和性能小窗里看得到 */
export const FB_ERR = [];
export function fbErr(e) { const m = (e && e.message) || String(e); FB_ERR.push({ t: new Date().toTimeString().slice(0, 8), m }); if (FB_ERR.length > 5) FB_ERR.shift(); PERF_LOAD.fb = `副本读取失败 ${FB_ERR.length} 次：${m}`; console.error('[副本读取]', e) }
export function createFB(ctx) {
  let scene = null, fight = null, boss = null, mixer = null, acts = {}, curAct = null, active = false, phase = '', n = 1;
  const nades = [], nadeGeo = new THREE.SphereGeometry(0.16, 10, 8), nadeMat = new THREE.MeshLambertMaterial({ color: 0x3d4a2a });
  const cliffCam = { value: 30 };   // 56b：山崖靠镜头的部分压低（着色器里按镜头 z 算）
  const parts = [], marks = [], tracers = [], warnObjs = new Map(), mobVis = new Map();
  let T = null;   // 贴图
  let camFix = null, chest = null, hud = null, endT = 0, res = null, dmgAcc = new Map(), rollFx = 0, prevPos = new THREE.Vector3(), flashT = 0, rageT = 0;
  const camOff0 = new THREE.Vector3(0, 14, 14.5).multiplyScalar(1.15), camOff = camOff0.clone(), camTgt = new THREE.Vector3(), CAM_N = 4.2;

  /* ---------- 读模型（第一次进副本时读，之后留着） ---------- */
  /* 设计 74：每个文件失败自动重试 2 次（隔 1 秒）；整体失败时把 assets 清掉（以前失败的 Promise 一直留着，之后每次进副本都直接失败），出错的文件记进 FB_ERR */
  const glbRetry = async (u, tries = 2) => { for (let i = 0; ; i++) { try { return await loadGLB(u) } catch (e) { if (i >= tries) { const er = new Error(`${u.split('/').pop()}：${(e && e.message) || e}`); er.file = u; throw er } await new Promise(r => setTimeout(r, 1000)) } } };
  /* 设计 81：每关自己的模型（第 2 关毒囊在 models/fb2/，崖边石块、宝箱跟第 1 关共用） */
  const ASSET_LIST = { 1: ['butcher', 'shed', 'block', 'cart', 'cleaver', 'gate_1', 'gate_2', 'gate_3', 'gate_4', 'rock_1', 'rock_2', 'rock_3', 'chest_1', 'chest_2'].map(k => 'fb/' + k), 2: TOX_ASSETS, 3: ROCK_ASSETS, 4: SCREAM_ASSETS };
  const assetsP = {};
  function load(lv = 1) {
    if (assetsP[lv]) return assetsP[lv];
    const names = ASSET_LIST[lv] || ASSET_LIST[1];
    const p = Promise.all(names.map(k => glbRetry(`models/${k}.glb`).then(g => [k.split('/').pop(), g]))).then(a => Object.fromEntries(a));
    assetsP[lv] = p; p.catch(e => { if (assetsP[lv] === p) delete assetsP[lv]; fbErr(e) });
    return p;
  }
  const lambert = o => { o.traverse(c => { if (c.isMesh) { const old = c.material; c.material = new THREE.MeshLambertMaterial({ map: old.map }); if (c.isSkinnedMesh) c.frustumCulled = false; old.dispose(); c.castShadow = !(c.isSkinnedMesh && perfOpt('sshadow')); c.receiveShadow = true } }); return o };   // 设计 57：屠夫会动，用脚下的假影子
  const place = (g, k, s, x, y, z, ry = 0) => { const o = lambert(g[k].scene.clone(true)); o.scale.setScalar(s); o.position.set(x, y, z); o.rotation.y = ry; scene.add(o); return o };

  /* ---------- 场地（照场景样式图）：南边铁门 → 中间水泥空地和掩体 → 北边平台和屠宰棚，两边山崖 ---------- */
  /* 设计 74：场地建到一半出错：scene / boss 都丢掉，下次进副本从头再建（以前 scene 已经有值，下次不重建，boss 是空的） */
  /* 设计 81：每关一个场景，建好了留着（第 1 关屠夫照旧 buildAll，第 2 关毒囊在 fbtox.js） */
  const SCN = {}; let stg = null, occl = []; const tox = () => !!(stg && stg.tox);   // 设计 102：毒囊（不走动）专用的位置判断，第 3 关会走动的巨人不算   // occl：设计 97，挡住主角时会变半透明的东西（屠夫关南边矮墙、铁门、崖脚石头）
  function build(g) { try { if (n === 2) buildTox2(g); else if (n === 3) buildRock3(g); else if (n === 4) buildScream4(g); else buildAll(g); SCN[n] = { scene, boss, mixer, acts, T, stg, occl } } catch (e) { scene = null; boss = null; mixer = null; acts = {}; T = null; stg = null; occl = []; delete SCN[n]; throw e } }
  function buildRock3(g) {   /* 设计 102 */
    scene = new THREE.Scene(); occl = []; T = { dust: tex('img/fb/fx_dust.png'), rock: tex('img/fb/fx_rock.png'), star: tex('img/fb/fx_star.png'), crack: tex('img/fb/mark_crack.png'), hole: tex('img/fb/mark_hole.png'), drag: tex('img/fb/mark_drag.png') };
    stg = buildRock({ scene, g, T, tex, part, mark, dust, rocks, shock, glowTex, glowMat, glowSprite, flatGeo, ADD, ctx, ARENA, COVERS });
    boss = stg.boss; mixer = stg.mixer; acts = stg.acts; boss.userData.mats = stg.mats; occl = stg.occl;
  }
  function buildScream4(g) {   /* 设计 114 */
    scene = new THREE.Scene(); occl = []; T = { dust: tex('img/fb/fx_dust.png'), rock: tex('img/fb/fx_rock.png'), star: tex('img/fb/fx_star.png'), crack: tex('img/fb/mark_crack.png'), hole: tex('img/fb/mark_hole.png'), drag: tex('img/fb/mark_drag.png') };
    stg = buildScream({ scene, g, T, tex, part, mark, dust, rocks, shock, glowTex, glowMat, glowSprite, flatGeo, ADD, ctx, ARENA, COVERS, fight: () => fight });
    boss = stg.boss; mixer = stg.mixer; acts = stg.acts; boss.userData.mats = stg.mats; occl = stg.occl;
  }
  function buildTox2(g) {
    scene = new THREE.Scene(); T = { dust: tex('img/fb/fx_dust.png'), rock: tex('img/fb/fx_rock.png'), star: tex('img/fb/fx_star.png'), crack: tex('img/fb/mark_crack.png'), hole: tex('img/fb/mark_hole.png'), drag: tex('img/fb/mark_drag.png') };
    stg = buildTox({ scene, g, T, tex, place, part, mark, dust, rocks, shock, glowTex, glowMat, glowSprite, flatGeo, ADD, ctx, ARENA, COVERS });
    boss = stg.boss; mixer = stg.mixer; acts = stg.acts; boss.userData.mats = stg.mats;
  }
  /* 设计 79：掩体模型（海盗包的木箱存在 lib['p:crate']，以前写成 prop('crate') 拿不到，木箱没画、挡子弹的框还在 = 空气墙）。
     读不到就记进副本错误记录，用一个木头色方块 / 圆桶代替——不能有看不见的掩体 */
  function coverProp(name, opt, size, round = false) {
    const o = prop(name, opt); if (o) return o;
    fbErr(new Error(`掩体模型没读到：${name}（用方块代替）`));
    const geo = round ? new THREE.CylinderGeometry(size[0] / 2, size[0] / 2, size[1], 12) : new THREE.BoxGeometry(...size); geo.translate(0, size[1] / 2, 0);
    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: round ? 0x6a5a48 : 0x8a6a42 }));
  }
  function buildAll(g) {
    stg = null; occl = []; scene = new THREE.Scene(); scene.background = new THREE.Color(0x4a3b33); scene.fog = new THREE.Fog(0x4a3b33, 34, 70);
    T = { concrete: tex('img/fb/tex_concrete.jpg', [3.5, 8]), wood: tex('img/fb/tex_wood.jpg', [3, 2]), cliff: tex('img/fb/tex_cliff.jpg', [6, 1.6]), drain: tex('img/fb/tex_drain.jpg', [1, 8]),
      dirt: tex('img/ground/dirt.jpg', [3, 2]), dust: tex('img/fb/fx_dust.png'), rock: tex('img/fb/fx_rock.png'), slash: tex('img/fb/fx_slash.png'), star: tex('img/fb/fx_star.png'),
      crack: tex('img/fb/mark_crack.png'), drag: tex('img/fb/mark_drag.png'), hole: tex('img/fb/mark_hole.png'), decals: ['blood', 'oil', 'crack', 'gravel'].map(k => tex(`img/fb/decal_${k}.png`)) };
    const hemi = new THREE.HemisphereLight(0xffe8d0, 0x5a4636, 1.25); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffd8b0, 1.9); sun.position.set(-8, 18, 10); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 26, bottom: -26, near: 1, far: 60 }); sun.target.position.set(0, 0, 2); scene.add(sun, sun.target);
    /* 地面：水泥地，两边排水沟，南边泥土路 */
    const W0 = ARENA.x1 - ARENA.x0 + 1.2, L0 = ARENA.z1 - ARENA.z0 + 1;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W0, L0), new THREE.MeshLambertMaterial({ map: T.concrete })); ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, (ARENA.z0 + ARENA.z1) / 2 + 0.5); ground.receiveShadow = true; scene.add(ground);
    const dirt = new THREE.Mesh(new THREE.PlaneGeometry(26, 16), new THREE.MeshLambertMaterial({ map: T.dirt })); dirt.rotation.x = -Math.PI / 2; dirt.position.set(0, -0.01, ARENA.z1 + 8); dirt.receiveShadow = true; scene.add(dirt);
    for (const x of [ARENA.x0 + 0.35, ARENA.x1 - 0.35]) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.62, L0 - 1), new THREE.MeshLambertMaterial({ map: T.drain })); d.rotation.x = -Math.PI / 2; d.position.set(x, 0.012, (ARENA.z0 + ARENA.z1) / 2 + 0.5); d.receiveShadow = true; scene.add(d) }
    /* 随机污渍贴花 */
    for (let i = 0; i < 16; i++) { const k = i % 4, m = new THREE.Mesh(flatGeo, new THREE.MeshLambertMaterial({ map: T.decals[k], transparent: true, depthWrite: false, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
      const s = k === 3 ? 1.6 : 1.2 + Math.random() * 1.8; m.scale.set(s, 1, s); m.rotation.y = Math.random() * 6.28; m.position.set(ARENA.x0 + 1 + Math.random() * (W0 - 3), 0.015, ARENA.z0 + 1 + Math.random() * (L0 - 3)); m.renderOrder = 1; scene.add(m) }
    /* 两边山崖：代码做主体（起伏的岩壁），边上摆石块 */
    /* 56b：山崖分成 8 米一段；贴图按 4 米一格（不拉伸）；靠镜头那几段压低（frame 里按镜头位置调），不挡画面 */
    T.cliff.repeat.set(1, 1); const cliffMat = new THREE.MeshLambertMaterial({ map: T.cliff, side: THREE.DoubleSide });
    cliffMat.onBeforeCompile = sh => { sh.uniforms.uCamZ = cliffCam; sh.vertexShader = 'uniform float uCamZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  { float wz = (modelMatrix * vec4(position, 1.0)).z; transformed.y *= clamp((uCamZ - 9.0 - wz) / 10.0, 0.22, 1.0); }') };
    for (const sd of [-1, 1]) {
      {
        const geo = new THREE.PlaneGeometry(64, 11, 64, 10), pos = geo.attributes.position, uv = geo.attributes.uv;
        for (let i = 0; i < pos.count; i++) { const u = pos.getX(i), v = pos.getY(i) + 5.5, wz = 3 + (sd > 0 ? u : -u);
          const n = Math.sin(wz * 0.7 + sd) * 0.6 + Math.sin(wz * 1.9 + v * 0.8) * 0.35 + Math.sin(v * 2.3 + wz * 0.4) * 0.25;
          const h = v * (0.95 + 0.25 * Math.sin(wz * 0.23 + sd * 2)), out = v * 0.32 + n + 0.2 * v * v / 11;
          pos.setXYZ(i, u, h, -(out + 0.5)); uv.setXY(i, wz / 4, (h + out * 0.5) / 4) }
        geo.computeVertexNormals();
        const c = new THREE.Mesh(geo, cliffMat); c.rotation.y = sd > 0 ? -Math.PI / 2 : Math.PI / 2; c.position.set(sd * (ARENA.x1 + 0.9), 0, 3); c.receiveShadow = true; c.castShadow = true; scene.add(c);
      }
      /* 山崖石块：放在地上的崖脚，底部埋进地里一点（56b：以前像挂在半空） */
      for (let i = 0; i < 4; i++) { const k = 'rock_' + (1 + (i + (sd > 0 ? 1 : 0)) % 3), sc = 3.6 + Math.random() * 2.2; occl.push(place(g, k, sc, sd * (ARENA.x1 + 0.55 + Math.random() * 0.3), -0.25, -9 + i * 8 + Math.random() * 2.5, Math.random() * 6)) }   // 一边 4 块（每块 4000 面，发烫）
    }
    { const bt = T.cliff.clone(); bt.repeat.set(10, 4); const back = new THREE.Mesh(new THREE.PlaneGeometry(40, 16, 20, 6), new THREE.MeshLambertMaterial({ map: bt })); back.position.set(0, 6, -26.5); scene.add(back) }
    /* 北边平台：高一截（矮墙 + 中间台阶），上面铺旧木地板，屠宰棚，大剁刀插在平台上 */
    const pz0 = ARENA.z0 - 0.15, pz1 = -26, ph = 0.8, cm = new THREE.MeshLambertMaterial({ map: T.concrete, color: 0xbdb2a6 });
    const plat = new THREE.Mesh(new THREE.BoxGeometry(W0 + 4, ph, pz0 - pz1), cm); plat.position.set(0, ph / 2, (pz0 + pz1) / 2); plat.receiveShadow = true; plat.castShadow = true; scene.add(plat);
    const wm = new THREE.MeshLambertMaterial({ map: T.concrete, color: 0x9d9286 });
    for (const [x0, x1] of [[ARENA.x0 - 2, -1.7], [1.7, ARENA.x1 + 2]]) { const w = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.55, 0.32), wm); w.position.set((x0 + x1) / 2, ph + 0.27, pz0 - 0.16); w.castShadow = true; scene.add(w) }
    for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(3.2, ph * (i + 1) / 3, 0.45), cm); s.position.set(0, ph * (i + 1) / 6, pz0 + 0.45 * (3 - i) - 0.2); s.receiveShadow = true; scene.add(s) }
    { const f = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 7.5), new THREE.MeshLambertMaterial({ map: T.wood })); f.rotation.x = -Math.PI / 2; f.position.set(0, ph + 0.01, -19.6); f.receiveShadow = true; scene.add(f) }
    place(g, 'shed', 9.4, 0, ph, -20.2, 0);
    place(g, 'cleaver', 3.1, 4.6, ph, -15.2, -0.5);
    /* 南边：破铁门（左扇半开） */
    const gz = ARENA.z1 + 0.4, gs = 4.6;
    occl.push(place(g, 'gate_1', gs, -2.25, 0, gz), place(g, 'gate_4', gs, 2.25, 0, gz));
    { const l = place(g, 'gate_2', gs, -1.4, 0, gz + 0.5, -1.05); l.position.x = -1.8; occl.push(l, place(g, 'gate_3', gs, 1.05, 0, gz)) }
    for (const x of [-4.6, 4.6]) { const w = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.6, 0.4), wm.clone()); w.position.set(x, 0.8, gz); w.castShadow = true; scene.add(w); occl.push(w) }
    /* 掩体 */
    for (const c of COVERS) {
      if (c.k === 'block') place(g, 'block', 2.2, c.x, 0, c.z, 0.15);
      else if (c.k === 'cart') place(g, 'cart', 2.3, c.x, 0, c.z, 0.08);
      else if (c.k === 'crates') { for (const [dx, dz, y, r] of [[-0.45, -0.4, 0, 0.1], [0.5, -0.35, 0, -0.2], [0, 0.45, 0, 0.3], [0.05, -0.35, 1.0, 0.5]]) { const o = coverProp('p:crate', { scale: 1.9 }, [0.75, 0.75, 0.75]); if (o) { o.position.set(c.x + dx, y, c.z + dz); o.rotation.y = r; o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } }); scene.add(o) } } }
      else if (c.k === 'barrels') { for (const [dx, dz, r] of [[-0.45, -0.35, 0], [0.45, -0.3, 1], [0, 0.42, 2]]) { const o = coverProp('barrel', { scale: 2.3 }, [0.7, 0.95, 0.7], true); if (o) { o.position.set(c.x + dx, 0, c.z + dz); o.rotation.y = r; o.traverse(m => { if (m.isMesh) m.castShadow = true }); scene.add(o) } } }
    }
    /* 屠夫 */
    boss = new THREE.Group(); const bm = g.butcher.scene; lambert(bm); bm.scale.setScalar(BOSS_SCALE); boss.add(bm); scene.add(boss);
    boss.userData.mats = []; bm.traverse(c => { if (c.isMesh) { c.material.emissive = new THREE.Color(0); boss.userData.mats.push(c.material) } });
    mixer = new THREE.AnimationMixer(bm); acts = {};
    for (const clip of g.butcher.animations) { const a = mixer.clipAction(clip); const m = BUTCHER_ANIM[clip.name] || {}; if (!m.loop) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true } acts[clip.name] = a }
    /* 设计 67：屠夫的影子用压扁影子（以前脚下一块软边圆片） */
    boss.userData.flatR = 2.6; addFlat(boss);
    /* 设计 62：狂暴的样子——模型照常显示（贴图看得见），外面一圈红色描边（同一副骨头的反面外扩壳），脚下一圈红光（光效 2×2 第 4 格：光圈） */
    const rageMat = new THREE.MeshBasicMaterial({ color: 0xff2a14, side: THREE.BackSide, transparent: true, opacity: 0.8, depthWrite: false, fog: false });
    rageMat.userData.w = { value: 0.012 };
    rageMat.onBeforeCompile = sh => { sh.uniforms.uW = rageMat.userData.w; sh.vertexShader = 'uniform float uW;\n' + sh.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n#ifdef USE_SKINNING\n vec3 nrmW = normalize((skinMatrix * vec4(objectNormal, 0.0)).xyz);\n#else\n vec3 nrmW = normalize(objectNormal);\n#endif\n transformed += nrmW * uW;') };
    const shells = []; bm.traverse(c => { if (c.isSkinnedMesh) { const o = new THREE.SkinnedMesh(c.geometry, rageMat); o.bind(c.skeleton, c.bindMatrix); o.frustumCulled = false; o.renderOrder = -1; o.visible = false; c.parent.add(o); shells.push(o) } });
    const ring = new THREE.Mesh(flatGeo, glowMat(glowTex().ring, 0xff2a14, 0.9)); ring.position.y = 0.06; ring.scale.setScalar(5.2); ring.renderOrder = 2; ring.visible = false; boss.add(ring);
    boss.userData.rage = { mat: rageMat, shells, ring };
  }
  function play(name, ts = 1, fade = 0.2) {
    if (stg) { stg.play(name, ts, fade); return }
    const a = acts[name]; if (!a) return;
    if (curAct === a) { a.timeScale = ts; if (!BUTCHER_ANIM[name].loop) { a.reset(); a.play() } return }
    a.reset(); a.timeScale = ts; a.setEffectiveWeight(1); a.play();
    if (curAct) curAct.crossFadeTo(a, fade, false);
    curAct = a;
  }

  /* ---------- 粒子、地面痕迹（有上限） ---------- */
  function part(map, x, y, z, o = {}) {
    if (parts.length >= LIM.parts) { const old = parts.shift(); scene.remove(old.s); old.s.material.dispose() }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: o.color || 0xffffff, transparent: true, opacity: o.op ?? 1, depthWrite: false, blending: o.add ? ADD : THREE.NormalBlending, fog: false }));
    s.position.set(x, y, z); s.scale.setScalar(o.size || 1); s.material.rotation = Math.random() * 6.28; scene.add(s);
    parts.push({ s, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, g: o.g || 0, life: o.life || 0.8, t: 0, grow: o.grow || 1, op: o.op ?? 1, size: o.size || 1, spin: o.spin || 0, noFloor: o.noFloor, topY: o.topY });
  }
  function mark(map, x, z, s, life, yaw = 0, sx) {
    if (marks.length >= LIM.marks) { const old = marks.shift(); scene.remove(old.m); old.m.material.dispose() }
    const m = new THREE.Mesh(flatGeo, new THREE.MeshLambertMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 }));
    m.scale.set(sx || s, 1, s); m.position.set(x, 0.02, z); m.rotation.y = yaw; m.renderOrder = 2; scene.add(m); marks.push({ m, life, t: 0 });
  }
  /* 尘土：烟团从 r0 外面开始贴地往外飘（56b：不要盖住屠夫的身体，最高到小腿），大小不一、边缘碎 */
  const dust = (x, z, n, sz = 1.2, sp = 2, r0 = 0.4) => { for (let i = 0; i < n; i++) { const a = i / n * 6.28 + Math.random() * 0.5, r = r0 + Math.random() * 0.4, k = 0.6 + Math.random() * 0.7;
    part(T.dust, x + Math.cos(a) * r, 0.22 + Math.random() * 0.15, z + Math.sin(a) * r, { vx: Math.cos(a) * sp * (0.7 + Math.random() * 0.6), vy: 0.15 + Math.random() * 0.25, vz: Math.sin(a) * sp * (0.7 + Math.random() * 0.6), size: sz * k, grow: 1.7, life: 0.7 + Math.random() * 0.6, op: 0.7 }) } };
  const rocks = (x, z, n) => { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, sp = 2 + Math.random() * 4; part(T.rock, x, 0.3, z, { vx: Math.cos(a) * sp, vy: 4 + Math.random() * 4, vz: Math.sin(a) * sp, g: 16, size: 0.35 + Math.random() * 0.3, life: 0.9, grow: 1, spin: 8 }) } };
  /* 冲击波圆环（往外扩、变淡） */
  function shock(x, z, r, col = 0xffd8a0, op = 1) { const m = new THREE.Mesh(flatGeo, glowMat(glowTex().ring, col, op)); m.position.set(x, 0.08, z); m.scale.setScalar(1); m.renderOrder = 1; scene.add(m); parts.push({ s: m, ring: r, t: 0, life: 0.55, op }) }

  /* ---------- 子弹（亮色小光弹，飞到目标） ---------- */
  const bulletGeo = new THREE.BoxGeometry(0.07, 0.07, 0.7); bulletGeo.translate(0, 0, -0.35);
  const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffe07a, toneMapped: false, fog: false }), focusMat = new THREE.MeshBasicMaterial({ color: 0x8fe0ff, toneMapped: false, fog: false });
  function tracer(e) {
    const from = ctx.muzzleOf(ctx.player), to = new THREE.Vector3(e.tx, e.tg ? (e.tg === fight.boss ? fight.hitY || 1.8 : 1.0) : 0.9, e.tz);
    let b = tracers.find(t => !t.on); if (!b) { if (tracers.length > 30) return; b = { m: new THREE.Mesh(bulletGeo, bulletMat) }; tracers.push(b) }
    if (b.m.parent !== scene) scene.add(b.m);   /* 设计 89：每关场景分开，重复用的子弹可能还挂在别的关的场景里 */
    b.on = true; b.m.visible = true; b.m.material = e.kind === 'focus' ? focusMat : bulletMat; b.from = from; b.to = to; b.t = 0; b.dur = from.distanceTo(to) / 42; b.blocked = e.blocked; b.m.position.copy(from); b.m.lookAt(to);
  }

  /* ---------- 战斗界面（学魔兽：左上头像框、上面中间 BOSS 框和施法条、右上倒计时；右下攻击 + 3 个技能，王者荣耀样式） ---------- */
  const inp = { fire: false, skill: null };
  /* 设计 106：全屏一闪（灭杀、地动） */
  let tintT = 0, tintD = 1, stunFx = 0, confSpr = null;
  function tint(col, dur) { const el = hud && hud.querySelector('.fbtint'); if (!el) return; tintT = dur; tintD = dur || 1; el.style.background = col ? '#' + col.toString(16).padStart(6, '0') : 'transparent'; el.style.opacity = dur ? 0.55 : 0 }
  const scatter = (n, f) => { for (let i = 0; i < n; i++) f(ARENA.x0 + 0.8 + Math.random() * (ARENA.x1 - ARENA.x0 - 1.6), ARENA.z0 + 0.8 + Math.random() * (ARENA.z1 - ARENA.z0 - 1.6)) };
  /* 设计 106：灭杀打下来——屠夫：狂暴砸地，全场冲击波；毒囊：毒雾吞没全场；落石巨人：整个采石场塌下来 */
  function doomFx(k) {
    const P = fight.player, B = fight.boss; ctx.shake(1.2);
    if (n === 1) { for (let i = 0; i < 4; i++) shock(B.x, B.z, 14 + i * 9, 0xff6a3a, 0.9 - i * 0.15); dust(B.x, B.z, 24, 2.2, 9, 1.5); rocks(B.x, B.z, 14); scatter(16, (x, z) => { dust(x, z, 3, 1.4, 2); mark(T.crack, x, z, 3 + Math.random() * 2, 8, Math.random() * 6) }); tint(0xff3010, 0.7) }
    else if (n === 2) { scatter(40, (x, z) => part(T.dust, x, 0.8 + Math.random() * 1.5, z, { size: 4 + Math.random() * 3, grow: 1.8, life: 1.8, color: 0x7ad040, op: 0.85 })); part(glowTex().ball, P.x, 1, P.z, { size: 9, grow: 2, life: 1.2, add: true, color: 0x6cff40, op: 0.6 }); tint(0x3a8a10, 1.0) }
    else if (n === 4 && stg && stg.doomFx) { stg.doomFx(k); tint(0xffffff, 0.8) }   /* 设计 114：全部喇叭 + 信号塔一起轰、漫天乌鸦，画面全白闪 */
    else { scatter(26, (x, z) => { rocks(x, z, 4); dust(x, z, 4, 1.6, 3); part(T.rock, x, 9 + Math.random() * 5, z, { vy: -18, size: 1.6 + Math.random(), life: 0.6, g: -20 }) }); rocks(P.x, P.z, 8); dust(P.x, P.z, 10, 2, 5); tint(0x6a5038, 0.9) }
    if (k >= 2) tint(0x8a0000, 1.4);
  }
  /* 设计 106：第 3 关山崩起手「地动」——全场尘土、屏幕大震 */
  /* 设计 106c：碎石雨看得出来——每 0.5 秒全场掉 16 块碎石（比原来大一倍），落地冒一小团尘；
     用自己的一池精灵（最多 64 个，循环用，不新建材质），不占通用粒子上限，手机不发烫 */
  const rub = [], RUB_MAX = 64;
  function rubSprite() { let o = rub.find(q => !q.on); if (!o && rub.length < RUB_MAX) { o = { s: new THREE.Sprite(new THREE.SpriteMaterial({ map: T.rock, transparent: true, depthWrite: false, fog: false })), on: false }; scene.add(o.s); rub.push(o) } return o }
  function rubbleFx() { const P = fight.player;
    for (let i = 0; i < 16; i++) { const o = rubSprite(); if (!o) break; const nearP = i < 5;   // 5 块落在主角附近（画面里一定看得到），其余全场
      const x = nearP ? P.x + (Math.random() - 0.5) * 7 : ARENA.x0 + 0.6 + Math.random() * (ARENA.x1 - ARENA.x0 - 1.2), z = nearP ? P.z + (Math.random() - 0.5) * 7 - 1 : ARENA.z0 + 0.6 + Math.random() * (ARENA.z1 - ARENA.z0 - 1.2);
      if (o.s.parent !== scene) scene.add(o.s); o.on = true; o.ph = 0; o.y = 7 + Math.random() * 5; o.vy = -12 - Math.random() * 4; o.sz = 0.75 + Math.random() * 0.45; o.s.material.map = T.rock; o.s.material.color.setHex(0xd8ccb8); o.s.material.opacity = 1; o.s.material.rotation = Math.random() * 6.28;
      o.s.position.set(x, o.y, z); o.s.scale.setScalar(o.sz); o.s.visible = true } }
  function rubFrame(dt) { for (const o of rub) { if (!o.on) continue;
    if (o.ph === 0) { o.vy -= 18 * dt; o.y += o.vy * dt; o.s.material.rotation += dt * 6; if (o.y <= 0.15) { o.ph = 1; o.t = 0; o.y = 0.3; o.s.material.map = T.dust; o.s.material.color.setHex(0xcbb894); o.s.material.rotation = Math.random() * 6.28 } o.s.position.y = o.y }
    else { o.t += dt; const u = o.t / 0.4; if (u >= 1) { o.on = false; o.s.visible = false; continue } o.s.scale.setScalar(o.sz * (1.2 + 1.6 * u)); o.s.material.opacity = 0.75 * (1 - u) } } }
  /* 设计 106b：地动尘土铺满全场（自己管的大尘团，不占粒子上限；中间淡一点） */
  const qfx = [];
  function quakeFx() { ctx.shake(1.0); tint(0xb09070, 0.45);
    for (let x = ARENA.x0 + 1; x <= ARENA.x1 - 1; x += 2.6) for (let z = ARENA.z0 + 1.5; z <= ARENA.z1 - 1; z += 3.2) {
      const edge = Math.min(1, Math.abs(x) / (ARENA.x1 * 0.7)), s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dust, color: 0xd8c6a2, transparent: true, opacity: 0, depthWrite: false, fog: false }));
      s.position.set(x + (Math.random() - 0.5) * 1.5, 0.7 + Math.random() * 0.8, z + (Math.random() - 0.5) * 1.8); s.material.rotation = Math.random() * 6.28; scene.add(s);
      qfx.push({ s, t: -Math.random() * 0.1, op: 0.45 + 0.4 * edge, sz: 4.2 + Math.random() * 1.8 }) } }
  function qfxFrame(dt) { for (let i = qfx.length - 1; i >= 0; i--) { const q = qfx[i]; q.t += dt; const u = Math.max(0, q.t) / 1.8; if (u >= 1) { scene.remove(q.s); q.s.material.dispose(); qfx.splice(i, 1); continue }
    q.s.material.opacity = q.op * (u < 0.04 ? u / 0.04 : 1 - (u - 0.04) / 0.96); q.s.scale.setScalar(q.sz * (1 + 0.6 * u)) } }
  function mkHud() {
    if (hud) return hud;
    const el = document.createElement('div'); el.id = 'fbHud'; el.className = 'hidden';
    const btn = (k, img) => `<button class="fbk ${k}" data-fbk="${k}"><i style="background-image:url(${A('img/fb/btn_' + img + '.png')})"></i><em class="cdv"></em><b class="cdn"></b>${k === 'roll' ? '<s class="chg"></s>' : ''}</button>`;
    el.innerHTML = `<div class="fbtint"></div><div class="fbconf"></div><div class="fbp"><canvas class="fav" width="96" height="96"></canvas><div class="fpi"><b class="fname">我</b><div class="fbar"><i class="lag"></i><i class="cur"></i><span class="ftxt"></span></div><div class="fbuffs"></div></div></div>
      <div class="fbb"><div class="bav"><img src="${A('img/fb/boss_' + 1 + '.png')}" alt=""></div><div class="bnm"><b></b><small></small></div><div class="bbar"><i class="lag"></i><i class="cur"></i><s style="left:75%"></s><s style="left:50%"></s><s style="left:25%"></s><span class="bpct"></span></div><div class="bcast hidden"><i></i><span></span></div></div>
      <div class="fbt"><b>3:00</b></div><div class="fbrage hidden">BOSS 狂暴</div><button class="fbq">撤退</button>
      <div class="fbend hidden"></div>
      <div class="fbkeys">${btn('attack', 'attack')}${btn('focus', 'focus')}${btn('roll', 'roll')}${btn('stun', 'stun')}${btn('nade', 'nade')}</div>`;
    document.getElementById('app').appendChild(el);
    const press = (k, on) => { if (k === 'attack') inp.fire = on; else if (on) inp.skill = k };
    el.querySelectorAll('[data-fbk]').forEach(b => {
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); b._pid = e.pointerId; try { b.setPointerCapture(e.pointerId) } catch (er) { /* 抓不住也照样按 */ } b.classList.add('dn'); press(b.dataset.fbk, true) });
      const up = e => { if (b._pid != null && e.pointerId !== b._pid) return; b._pid = null; b.classList.remove('dn'); if (b.dataset.fbk === 'attack') inp.fire = false };   /* 设计 79：只认按下它的那根手指 */
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    });
    /* 设计 79：打完了（赢输都一样）点「撤退」直接回超市（打赢没开宝箱的，回超市弹「获得」框）；没打完才问「撤退算输」 */
    el.querySelector('.fbq').onclick = () => { if (!active) return; if (!fight || fight.over) { exit(); return } ctx.UI.ask('撤退算输，召唤券不退。确定撤退吗？', () => { if (!fight || fight.over) return; fight.player.hp = 0; fight.player.dead = true; fight.over = fight.t || 0.01; fight.win = false; onEnd(false) }, '撤退', true) };   /* 设计 79：游戏里的确认框（弹出时战斗暂停） */
    el.querySelector('.fbend').addEventListener('click', e => { const b = e.target.closest('[data-fbe]'); if (!b) return; const a = b.dataset.fbe; if (a === 'again') ctx.again(n); else if (a === 'home') exit(); else if (a === 'open') openChest() });
    addEventListener('keydown', e => { if (!active || e.repeat) return; const k = { ' ': 'attack', q: 'focus', e: 'roll', r: 'stun', g: 'nade', j: 'attack', k: 'roll' }[e.key.toLowerCase()]; if (k) { press(k, true); e.preventDefault() } });
    addEventListener('keyup', e => { if (!active) return; if (e.key === ' ' || e.key.toLowerCase() === 'j') inp.fire = false });
    hud = el; return el;
  }
  function releaseKeys() { inp.fire = false; inp.skill = null; if (!hud) return; hud.querySelectorAll('[data-fbk]').forEach(b => { if (b._pid != null) { try { if (b.hasPointerCapture(b._pid)) b.releasePointerCapture(b._pid) } catch (e) { /* 已经放了 */ } b._pid = null } b.classList.remove('dn') }) }
  const $h = s => hud.querySelector(s);
  let hpLag = 1, bLag = 1;
  function hudFrame(dt) {
    const P = fight.player, B = fight.boss, k = P.hp / P.max, bk = B.hp / B.max;
    hpLag = Math.max(k, hpLag - dt * 0.5 * (hpLag > k + 0.002 ? 1 : 0)); if (hpLag < k) hpLag = k;
    bLag = Math.max(bk, bLag - dt * 0.35); if (bLag < bk) bLag = bk;
    $h('.fbp .cur').style.width = (k * 100) + '%'; $h('.fbp .lag').style.width = (hpLag * 100) + '%';
    const tx = `${Math.ceil(P.hp)} / ${P.max}`; if ($h('.ftxt').textContent !== tx) $h('.ftxt').textContent = tx;
    $h('.fbp').classList.toggle('low', k < 0.3 && !P.dead);
    $h('.fbb .cur').style.width = (bk * 100) + '%'; $h('.fbb .lag').style.width = (bLag * 100) + '%';
    $h('.fbb').classList.toggle('rage', !!fight.rage && !B.dead); $h('.fbb').classList.toggle('dead', !!B.dead);   // 设计 61：狂暴头像框红色闪，击败变灰
    const pc = B.dead ? '击败' : Math.ceil(bk * 100) + '%'; if ($h('.bpct').textContent !== pc) $h('.bpct').textContent = pc;
    const cast = $h('.bcast'), c = B.cast && !B.cast.hideBar ? B.cast : null;   // 设计 102：巨人走去抓掩体那一段不显示施法条
    if (c) { cast.classList.remove('hidden'); cast.classList.toggle('ult', !!c.w.ult); cast.querySelector('i').style.width = Math.min(100, c.t / c.dur * 100) + '%'; const nm = c.nm ? c.nm : c.k === 'doom' ? '灭杀（全场）' : stg ? stg.castName(c.k) : { swing: '挥刀', charge: '冲锋', slam: '砸地（大招）', summon: '叫小丧尸' }[c.k]; if (cast.querySelector('span').textContent !== nm) cast.querySelector('span').textContent = nm }
    else cast.classList.add('hidden');
    const left = FB.time - fight.t, tt = left > 0 ? `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}` : '狂暴';
    const tb = $h('.fbt b'); if (tb.textContent !== tt) tb.textContent = tt; $h('.fbt').classList.toggle('red', left < 30);
    /* 增益 / 减益小图标 */
    const bf = []; if (P.stunT > 0) bf.push(['眩晕', P.stunT]); if (P.rootT > 0) bf.push(['禁锢', P.rootT]); if (P.confT > 0) bf.push(['错乱', P.confT]);   /* 设计 114 */ if (P.inv > 0 && P.inv <= 3) bf.push(['无敌', P.inv]);   /* 设计 61：只有翻滚（0.4 秒）、不灭之铠（2 秒）的无敌；测试用的长时间无敌不显示 */ if (P.regen10 > 0) bf.push(['回血', P.regen10]); if (P.hurtT > FB_CFG.regenDelay && P.hp < P.max) bf.push(['回血', 0]);   /* 设计 101：跟 fbcore 的自动回血一样（5 秒） */ if (fight.rage) bf.push(['BOSS 狂暴', 0]);
    const bh = bf.map(([n, s]) => `<span>${n}${s > 0 ? ' ' + s.toFixed(1) : ''}</span>`).join(''); if ($h('.fbuffs').innerHTML !== bh) $h('.fbuffs').innerHTML = bh;
    for (const kk of ['focus', 'roll', 'stun', 'nade']) {
      const b = $h(`.fbk.${kk}`), cd = P.cd[kk], full = fight.cdOf(kk), ready = kk === 'roll' ? P.charges > 0 : cd <= 0;
      b.classList.toggle('cd', !ready); const frac = ready ? 0 : Math.max(0, cd / full);
      b.querySelector('.cdv').style.setProperty('--f', frac); const nt = ready ? '' : Math.ceil(cd); if (b.querySelector('.cdn').textContent !== String(nt)) b.querySelector('.cdn').textContent = nt;
      if (b._r === false && ready) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop') } b._r = ready;
      if (kk === 'roll') { const ch = SKILLS.roll.charges(fight.hero.sk.roll) > 1 ? String(P.charges) : ''; if (b.querySelector('.chg').textContent !== ch) b.querySelector('.chg').textContent = ch }
    }
  }

  /* ---------- 进副本 ---------- */
  /* 设计 102b：等这一关用到的贴图读完（最多等 ms 毫秒；读失败的不等，lazyTex 自己会再试） */
  async function texWait(ms) {
    const want = new Set(), add = t => { if (t && t.isTexture && !t.image) want.add(t) };
    scene.traverse(o => { for (const m of [].concat(o.material || [])) for (const k of ['map', 'emissiveMap', 'alphaMap', 'normalMap']) add(m[k]); if (o.material && o.material.uniforms) for (const u of Object.values(o.material.uniforms)) add(u && u.value) });
    const walk = (v, d = 0) => { if (!v || d > 3) return; if (v.isTexture) add(v); else if (Array.isArray(v) || (typeof v === 'object' && !v.isObject3D && !v.isMaterial)) for (const x of Object.values(v)) walk(x, d + 1) }; walk(T);
    const t0 = performance.now(); while ([...want].some(t => !t.image) && performance.now() - t0 < ms) await new Promise(r => setTimeout(r, 80));
  }
  async function enter(lv, hero, look) {
    n = lv; const g = await load(n); setStage(n);
    if (SCN[n]) ({ scene, boss, mixer, acts, T, stg, occl } = SCN[n]); else build(g);
    await texWait(15000);   /* 设计 102b：场景里的贴图（地面、石壁、铁轨……）都读到了才开场，没读完时一直显示读取界面（以前先进场景，图没到的地方是黑的） */
    mkHud(); hud.classList.remove('hidden'); $h('.fbrage').classList.add('hidden'); tint(0, 0); hud.querySelector('.fbend').classList.add('hidden'); hud.querySelector('.fbend').innerHTML = '';
    $h('.fbb .bnm b').textContent = BOSSES[n].name; $h('.fbb .bnm small').textContent = `第 ${n} 关`; $h('.fbb .bav img').src = A('img/fb' + (n === 1 ? '' : n) + '/boss_' + n + '.png');
    $h('.fname').textContent = (look && look.name) || '我'; ctx.drawAvatar($h('.fav'));
    fight = createFight(n, hero); fight.blocked = scrBlocked; phase = 'fight'; active = true; endT = 0; res = null; hpLag = bLag = 1; rageT = 0;
    /* 设计 89：上一次的东西可能挂在别的关的场景里（这时 scene 已经换成这一关的了），用 removeFromParent 从它自己的场景里拿掉 */
    for (const [, o] of warnObjs) { o.removeFromParent(); disposeTree(o) } warnObjs.clear();
    for (const [, v] of mobVis) { v.m.removeFromParent(); if (v.bar) v.bar.removeFromParent(); if (v.stun) v.stun.removeFromParent() } mobVis.clear();
    for (const q of qfx) { q.s.removeFromParent(); q.s.material.dispose() } qfx.length = 0; for (const o of rub) { o.s.removeFromParent(); o.s.material.dispose() } rub.length = 0; for (const p of parts) p.s.removeFromParent(); parts.length = 0; for (const m of marks) m.m.removeFromParent(); marks.length = 0;
    for (const g of nades) g.m.removeFromParent(); nades.length = 0; for (const b of tracers) { b.on = false; b.m.visible = false; scene.add(b.m) }
    if (chest) { chest.g.removeFromParent(); chest = null }
    if (stg) stg.reset(); else { boss.position.set(fight.boss.x, 0, fight.boss.z); boss.rotation.y = 0; boss.visible = true; for (const m of boss.userData.mats) m.emissive.setHex(0);
      mixer.stopAllAction(); curAct = null; play('idle') }
    scene.add(ctx.player); ctx.player.position.set(fight.player.x, 0, fight.player.z); ctx.player.rotation.set(0, Math.PI, 0); ctx.holdGun(true);
    if (fov0 == null) fov0 = ctx.camera.fov; ctx.camera.fov = fov0; ctx.camera.updateProjectionMatrix();   /* 设计 89：所有关卡同一套镜头（81 的毒囊关大视角 TOX_CAM 不用了） */
    snap(); inp.fire = false; inp.skill = null; flashT = 0.6;
  }
  function snap() { camTarget(); ctx.camera.position.copy(camTgt).add(camOff); ctx.camera.lookAt(ctx.camera.position.x, 0, ctx.camera.position.z - camOff.z) }
  /* 设计 61：镜头往北（BOSS 那边）多看，主角在画面下 1/3。
     设计 65：往北多看多少跟主角离 BOSS 的距离走——BOSS 在射程里照旧 4.2 米；离得越远越少，射程外 8 米时只多看 1.6 米（主角在画面下 40% 左右）。
     场地南边到头时镜头不再往南跟：看的点最南到 z1 - 4.6，主角站到最南（离南边 0.5 米）时脚在画面下 1/4 左右，整个人都在画面里。 */
  function camTarget() {
    const P = fight.player, B = fight.boss, CN = CAM_N;
    const far = B.dead ? 0 : Math.max(0, Math.hypot(B.x - P.x, B.z - P.z) - (fight.hero.range + fight.bossR));
    const k = CN - (CN - 1.6) * Math.min(1, far / 8);
    camTgt.set(P.x * 0.35, 0, Math.max(ARENA.z0 + 1.5, Math.min(ARENA.z1 - 4.6, P.z - k)));
    camOff.copy(camOff0);   /* 设计 89：每关都用这一套（偏移、往北多看、南北边界），新关卡默认也是 */
    if (stg && stg.face && !B.dead) toxLook(P);
    keyAvoid(P);
  }
  /* 设计 106c：地上一个圈在画面上会不会被右下角按钮、左上角头像血条挡住（圈心和四周 4 个点投到屏幕上，落进挡住的框就算） */
  let blkBox = null, blkAt = 0; const _bv = new THREE.Vector3();
  function scrBlocked(x, z, r) {
    if (!hud) return false;
    if (performance.now() - blkAt > 500) { blkAt = performance.now(); const ks = [...hud.querySelectorAll('.fbkeys .fbk')].map(b => b.getBoundingClientRect()).filter(q => q.width > 0), pp = hud.querySelector('.fbp'), pr = pp && pp.getBoundingClientRect();
      blkBox = []; if (ks.length) blkBox.push({ l: Math.min(...ks.map(q => q.left)) - 6, t: Math.min(...ks.map(q => q.top)) - 6, r: innerWidth, b: innerHeight }); if (pr && pr.width > 0) blkBox.push({ l: 0, t: 0, r: pr.right + 6, b: pr.bottom + 6 }) }
    if (!blkBox.length || !(innerWidth > 0)) return false;
    const cam = ctx.camera; cam.updateMatrixWorld();
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) { _bv.set(x + dx, 0, z + dz).project(cam); const sx = (_bv.x + 1) / 2 * innerWidth, sy = (1 - _bv.y) / 2 * innerHeight;
      for (const q of blkBox) if (sx >= q.l && sx <= q.r && sy >= q.t && sy <= q.b) return true }
    return false;
  }
  /* 设计 96：主角走到右下角时会躲到技能按钮后面（毒囊关区域浅、离底边近，最明显）。
     主角越靠近按钮那一块的高度，镜头越往右挪，让主角整个人留在最左边那颗按钮的左边（再空 10px）；
     离开那一块高度就慢慢不挪（按高度渐变，不会一下跳），往右挪多少是连续的，镜头本身还有平滑跟随，不晃 */
  let keyBox = null, keyAt = 0;
  function keyAvoid(P) {
    if (--keyAt <= 0) { keyAt = 30; keyBox = null; const ks = hud ? [...hud.querySelectorAll('.fbkeys .fbk')].map(b => b.getBoundingClientRect()).filter(r => r.width > 0) : [];
      if (ks.length && innerHeight > 0) keyBox = { l: Math.min(...ks.map(r => r.left)), t: Math.min(...ks.map(r => r.top)), W: innerWidth, H: innerHeight } }
    if (!keyBox) return;
    const cam = ctx.camera; _pc.fov = cam.fov; _pc.aspect = cam.aspect; _pc.near = cam.near; _pc.far = cam.far; _pc.updateProjectionMatrix();
    const { l, t, W, H } = keyBox, tz = camTgt.z;
    const scr = tx => { const sx = v => (v.x + 1) / 2 * W, sy = v => (1 - v.y) / 2 * H; camTgt.x = tx;
      const a = ndc(tz, P.x + 0.45, 0, P.z), r = sx(a), bot = sy(a), b = ndc(tz, P.x + 0.45, 1.9, P.z); return { r: Math.max(r, sx(b)), bot } };
    const x0 = camTgt.x, s0 = scr(x0), on = Math.max(0, Math.min(1, (s0.bot - (t - 40)) / 40));   // 脚在按钮最上沿往上 40px 开始渐渐要躲
    const lim = (l - 10) + (1 - on) * (W - (l - 10));
    if (on <= 0 || s0.r <= lim) { camTgt.x = x0; return }
    let lo = x0, hi = x0 + 12; for (let i = 0; i < 16; i++) { const m = (lo + hi) / 2; if (scr(m).r <= lim) hi = m; else lo = m }
    camTgt.x = hi;
  }
  /* 设计 94：毒囊不会走过来，镜头高度、角度、视角跟第 1 关一样，只加大「往北多看」：
     让毒囊的脸（头顶）露在顶上 BOSS 框下面；但主角的脚离画面底边至少 1/8 画面高，两个冲突时先保主角。 */
  const _pc = new THREE.PerspectiveCamera(), _pv = new THREE.Vector3(); let hudY = 0.62, hudAt = 0;
  function ndc(tz, x, y, z) { _pc.position.set(camTgt.x, 0, tz).add(camOff0); _pc.lookAt(camTgt.x, 0, tz); _pc.updateMatrixWorld(); return _pv.set(x, y, z).project(_pc) }
  function toxLook(P) {
    const cam = ctx.camera; _pc.fov = cam.fov; _pc.aspect = cam.aspect; _pc.near = cam.near; _pc.far = cam.far; _pc.updateProjectionMatrix();
    if (--hudAt <= 0) { hudAt = 30; const b = hud && hud.querySelector('.fbb'); if (b && innerHeight > 0) { const r = b.getBoundingClientRect(); if (r.height > 0) hudY = 1 - 2 * (r.bottom + 6) / innerHeight } }   // BOSS 框下沿（再空 6px），换成 -1～1
    const F = stg.face(), FEET = -0.75;   // 脚：离底边 1/8 画面高
    const bin = (lo, hi, ok) => { for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (ok(m)) hi = m; else lo = m } return hi };   // lo 端不成立、hi 端成立，找分界
    const faceOk = tz => ndc(tz, F.x, F.top, F.z).y <= hudY;                        // 头顶在 BOSS 框下面（镜头越往北，脸越往下）
    const feetOk = tz => P.z < tz + camOff0.z - 2 && ndc(tz, P.x, 0, P.z).y >= FEET;   // 先要在镜头前面（在镜头后面时投影出来的数不能用）   // 主角的脚在下 1/8 以上（镜头越往北，脚越往下）
    let tz = camTgt.z;
    if (!faceOk(tz)) tz = -bin(-tz, -(tz - 40), nz => faceOk(-nz));                   // 往北挪到头顶刚好露在 BOSS 框下面
    if (!feetOk(tz)) tz = bin(Math.max(tz, P.z - 16), P.z, feetOk);                  // 主角会出画面：往回挪，先保主角
    camTgt.z = tz;
  }
  let fov0 = null;
  function exit() { if (fov0 != null) { ctx.camera.fov = fov0; ctx.camera.updateProjectionMatrix() } active = false; phase = ''; releaseKeys(); if (hud) hud.classList.add('hidden'); const d = document.getElementById('fbDbg'); if (d) d.remove(); try { ctx.holdGun(false) } catch (e) { fbErr(e) } ctx.onExit(res) }   /* 设计 79：不依赖每帧的代码，任何时候都能回超市 */

  /* ---------- 打完 ---------- */
  function onEnd(win) {
    if (res) return;
    releaseKeys();   /* 设计 79：打完把攻击键抓着的手指放掉（不然 iPhone 上后面的按钮点不动） */
    res = ctx.finish(n, win, fight.t);   // 打赢：马上给奖励（不开宝箱也全给）
    endT = 0; phase = win ? 'win' : 'lose';
    if (!win) setTimeout(() => showEnd(false), 1400);
  }
  function showEnd(win) {
    const e = hud.querySelector('.fbend'), sc = FB.tix, ag = ctx.tixHave && ctx.tixHave() < sc ? `再打一次（买 ${sc} 张召唤券）` : `再打一次（${sc} 张召唤券）`;   /* 设计 108：召唤券，每关 1 张；设计 109：没券写「买 1 张」 */
    e.innerHTML = win ? `<div class="fbbtns"><button class="btn" data-fbe="again">${ag}</button><button class="btn ghost" data-fbe="home">回超市</button></div>`
      : `<div class="fblose"><b>你倒下了</b><small>没有掉落，召唤券不退</small></div><div class="fbbtns"><button class="btn" data-fbe="again">${ag}</button><button class="btn ghost" data-fbe="home">回超市</button></div>`;
    e.classList.remove('hidden');
  }
  /* 宝箱：BOSS 倒下 1 秒后从上面掉下来，周围一直有光（按品质染色），走近点「打开宝箱」 */
  function dropChest() {
    /* 屠夫往前扑倒（身子在前面 2 米多），宝箱放在他旁边、靠场地中间那一侧 */
    const B = fight.boss, s0 = Math.sin(B.yaw), c0 = Math.cos(B.yaw), side = (B.x * c0 - B.z * s0) > 0 ? -1 : 1;
    /* 设计 61：屠夫放大 1.5 倍，宝箱离身子远一点（2.6 → 3.9 米）；再从掩体里推出来（宝箱半径约 1.3 米）。设计 81：毒囊关落在台地北段 */
    const cp = stg && stg.chestSpot ? stg.chestSpot() : { x: Math.max(ARENA.x0 + 1.5, Math.min(ARENA.x1 - 1.5, B.x + c0 * 3.9 * side + s0 * 1.5)), z: Math.max(ARENA.z0 + 1.5, Math.min(ARENA.z1 - 2, B.z - s0 * 3.9 * side + c0 * 1.5)) };
    pushOut(cp, 1.7); const x = Math.max(ARENA.x0 + 1.5, Math.min(ARENA.x1 - 1.5, cp.x)), z = Math.max(ARENA.z0 + 1.5, Math.min(ARENA.z1 - 2, cp.z));
    const q = res && res.item ? ITEMS[res.item.k].q : 'n', col = new THREE.Color(QUAL[q].color), G = glowTex(), legend = q === 'l';
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    const box = lambert(assets_.chest_1.scene.clone(true)); box.scale.setScalar(3.2); box.rotation.y = Math.atan2(fight.player.x - x, fight.player.z - z); g.add(box);
    const ring = new THREE.Mesh(flatGeo, glowMat(G.ring, col, 0.9)); ring.scale.setScalar(3.4); ring.position.y = 0.05; ring.renderOrder = 5; g.add(ring);
    const ball = glowSprite(G.ball, col, 0.7); ball.scale.setScalar(3.2); ball.position.y = 0.8; g.add(ball);
    const pillar = glowSprite(G.pillar, col, 0.85); pillar.scale.set(legend ? 2.6 : 1.7, 9, 1); pillar.position.y = 4.4; pillar.center.set(0.5, 0.5); g.add(pillar);
    const stars = [], dots = [];
    for (let i = 0; i < 5; i++) { const s = glowSprite(G.star, legend ? 0xffd27a : col, 0); s.userData = { ph: Math.random() * 6, a: Math.random() * 6.28 }; g.add(s); stars.push(s) }
    for (let i = 0; i < (legend ? 14 : 9); i++) { const s = glowSprite(G.ball, legend ? 0xffc84a : col, 0); s.userData = { y: Math.random() * 3, a: Math.random() * 6.28, r: 0.7 + Math.random() * 0.8, sp: 0.5 + Math.random() * 0.6 }; g.add(s); dots.push(s) }
    chest = { g, box, ring, ball, pillar, stars, dots, t: 0, y0: 9, open: false, fade: 1, x, z, landed: false };
    box.position.y = 9;
  }
  function openChest() {
    if (!chest || chest.open) return; chest.open = true;
    const rot = chest.box.rotation.y; chest.g.remove(chest.box); disposeTree(chest.box);
    chest.box = lambert(assets_.chest_2.scene.clone(true)); chest.box.scale.setScalar(3.2); chest.box.rotation.y = rot; chest.g.add(chest.box);
    const col = new THREE.Color(QUAL[res && res.item ? ITEMS[res.item.k].q : 'n'].color), G = glowTex();
    part(G.ball, chest.x, 1.4, chest.z, { size: 2.2, grow: 2.6, life: 0.9, add: true, color: col, op: 1 });
    for (let i = 0; i < 6; i++) { const a = Math.random() * 6.28; part(G.star, chest.x + Math.cos(a) * 0.3, 1.3, chest.z + Math.sin(a) * 0.3, { vx: Math.cos(a) * 1.6, vy: 1.5 + Math.random() * 1.5, vz: Math.sin(a) * 1.6, size: 0.6, grow: 0.6, life: 1.1, add: true, color: 0xfff2c0 }) }
    hud.querySelector('.fbend').classList.add('hidden');
    ctx.showGot(res, () => showEnd(true));
  }
  let assets_ = null;

  /* ---------- 每帧 ---------- */
  /* 设计 79：每帧包 try/catch：出错不让副本卡死，错误记进性能小窗和 FB_ERR（同一个只记一次） */
  const errSeen = new Set(), DBG = /[?&]debug/.test(location.search);
  if (DBG) { window.__fbstg = () => stg; window.__fbocc = () => occl }   // 测试用
  /* 设计 97：主角站在屠夫关最南边时，南边矮墙、铁门、崖脚石头在主角和镜头之间，会把人挡住。
     从镜头往主角脚、腰、头连三条线，碰到谁的包围盒，谁就在 0.2 秒里变成半透明（0.3），离开了再变回来 */
  const _ray = new THREE.Ray(), _bx = new THREE.Box3(), _pt = new THREE.Vector3(), _hit = new THREE.Vector3();
  function seeThrough(dt) {
    if (!occl.length || !fight) return; const P = fight.player, cam = ctx.camera.position;
    for (const o of occl) {
      const u = o.userData; if (!u.box) { o.updateMatrixWorld(true); u.box = new THREE.Box3().setFromObject(o); u.mats = []; o.traverse(c => { if (c.isMesh) for (const m of [].concat(c.material)) u.mats.push(m) }); u.a = 1 }
      let hit = false; for (const y of [0.25, 1.0, 1.8]) { _pt.set(P.x, y, P.z); const d = cam.distanceTo(_pt); _ray.origin.copy(cam); _ray.direction.copy(_pt).sub(cam).normalize(); if (_ray.intersectBox(u.box, _hit) && cam.distanceTo(_hit) < d - 0.3) { hit = true; break } }
      const want = hit ? 0.3 : 1; if (u.a === want) continue; u.a = want > u.a ? Math.min(want, u.a + dt / 0.2) : Math.max(want, u.a - dt / 0.2);
      for (const m of u.mats) { m.opacity = u.a; const tr = u.a < 0.99; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true } m.depthWrite = !tr } }   // 不透明的材质着色器里会把透明度写死成 1，切换时要重新编译
  }
  function frame(dt, clock) {
    try { frameIn(dt, clock) } catch (e) { const k = (e && e.message) || String(e); if (!errSeen.has(k)) { errSeen.add(k); fbErr(new Error(`每帧出错：${k}${e && e.stack ? ' @ ' + (e.stack.split('\n')[1] || '').trim() : ''}`)) } }
    if (DBG && active && fight) { let d = document.getElementById('fbDbg'); if (!d) { d = document.createElement('div'); d.id = 'fbDbg'; d.style.cssText = 'position:absolute;left:4px;bottom:4px;z-index:60;font:11px monospace;color:#fff;background:rgba(0,0,0,.55);padding:2px 5px;pointer-events:none'; document.getElementById('app').appendChild(d) }
      const j = ctx.moveDir(), r = fight.lastRoll; d.textContent = `摇杆 ${j.x.toFixed(2)}, ${j.y.toFixed(2)}　翻滚 ${r ? `${r.ax.toFixed(2)}, ${r.az.toFixed(2)}（${r.src === 'joy' ? '摇杆' : r.src === 'recent' ? '0.3秒内' : '面朝反方向'}）` : '-'}` }
  }
  function frameIn(dt, clock) {
    if (!active) return;
    const panel = ctx.panelOpen();
    const d = panel ? { x: 0, y: 0 } : ctx.moveDir();
    if (fight && (!panel || fight.over)) { fight.step(dt, { mx: d.x, mz: d.y, fire: inp.fire && !panel, skill: inp.skill }); inp.skill = null }   // 开着面板时战斗暂停（打完以后照常）
    else if (fight) fight.ev = [];
    const P = fight.player, B = fight.boss;
    /* 事件 → 动作、特效、飘字 */
    for (const e of fight.ev) {
      if (stg && e.e !== 'anim' && stg.onEvent(e)) continue;   /* 设计 81：这一关自己的特效 */
      if (e.e === 'anim') play(e.a, e.ts, e.a === 'run' ? 0.12 : 0.2);
      else if (e.e === 'shot') tracer(e);
      else if (e.e === 'hit') { const key = e.who === 'boss' ? 'b' : e.m.id, o = dmgAcc.get(key) || { a: 0, crit: false, t: 0, m: e.m }; o.a += e.a; o.crit = o.crit || e.crit; dmgAcc.set(key, o); if (e.who === 'boss') { for (const m of boss.userData.mats) m.emissive.setHex(0x553322); setTimeout(() => { if (!fight.rage) for (const m of boss.userData.mats) m.emissive.setHex(0) }, 70) } }
      else if (e.e === 'pdmg' && e.src === 'rubble') { rubbleFx(); ctx.UI.floatText(new THREE.Vector3(P.x, 2.3, P.z), '-' + e.a, 'bad') }   /* 设计 106/106c：碎石雨 */
      else if (e.e === 'pdmg') { ctx.hurt(); ctx.UI.floatText(new THREE.Vector3(P.x, 2.3, P.z), '-' + e.a, 'bad') }
      else if (e.e === 'release') {
        const w = e.w;
        if (e.k === 'slam') { const s = Math.sin(B.yaw), c = Math.cos(B.yaw), x = B.x + s * 3.15, z = B.z + c * 3.15; shock(B.x, B.z, w.r * 2.1, 0xfff0d8, 0.55); dust(B.x, B.z, 16, 1.1, 5, 2.6); dust(x, z, 6, 0.9, 3, 0.6); rocks(x, z, 8); mark(T.crack, x, z, 6, 6, Math.random() * 6); ctx.shake(0.6) }   // 56b：冲击波一圈细的，尘土贴地往外飘
        else if (e.k === 'swing') { const sl = new THREE.Mesh(flatGeo, new THREE.MeshBasicMaterial({ map: T.slash, transparent: true, blending: ADD, depthWrite: false, toneMapped: false })); sl.scale.set(w.r * 1.7, 1, w.r * 1.7); sl.position.set(B.x + Math.sin(w.yaw) * w.r * 0.45, 1.6, B.z + Math.cos(w.yaw) * w.r * 0.45); sl.rotation.y = w.yaw + Math.PI; scene.add(sl); parts.push({ s: sl, t: 0, life: 0.3, op: 1, slash: 1 }); ctx.shake(0.12) }
        else if (e.k === 'summon') { for (const p of w.pts) { dust(p.x, p.z, 4, 1.4, 1.8); rocks(p.x, p.z, 3); mark(T.hole, p.x, p.z, 2.2, 6, Math.random() * 6) } ctx.shake(0.25) }
      }
      else if (e.e === 'drag') { const L = hyp(e.x1 - e.x0, e.z1 - e.z0); if (L > 1) { const s = Math.sin(e.yaw), c = Math.cos(e.yaw); for (const sd of [-0.55, 0.55]) mark(T.drag, (e.x0 + e.x1) / 2 + c * sd, (e.z0 + e.z1) / 2 - s * sd, L, 4, e.yaw, 0.7) } }
      else if (e.e === 'bump') { part(T.star, e.x, 1.6, e.z, { size: 2.2, grow: 1.5, life: 0.4, add: true }); dust(e.x, e.z, 8, 1.1, 3, 1.3); ctx.shake(0.5); ctx.UI.floatText(new THREE.Vector3(e.x, 3.4, e.z), '撞到掩体，晕了', 'good') }
      else if (e.e === 'knock' && e.star) { part(T.star, P.x, 1.4, P.z, { size: 1.6, grow: 1.6, life: 0.35, add: true }); ctx.shake(0.35) }
      else if (e.e === 'interrupt') ctx.UI.floatText(new THREE.Vector3(B.x, tox() ? 5.6 : 5.7, tox() ? ARENA.z0 : B.z), '打断！', 'x10');
      else if (e.e === 'slowed') ctx.UI.floatText(new THREE.Vector3(B.x, tox() ? 5.6 : 5.7, tox() ? ARENA.z0 : B.z), '大招打断不了，慢 50%', '');
      else if (e.e === 'stunShot') { shock(e.x, e.z, 7, 0x9fe8ff); part(T.star, e.x, 2.2, e.z, { size: 2, grow: 1.4, life: 0.4, add: true, color: 0x9fe8ff }) }
      else if (e.e === 'roll') { rollFx = 0.32; dust(P.x, P.z, 3, 0.9, 1) }
      else if (e.e === 'nadeThrow') { const m = new THREE.Mesh(nadeGeo, nadeMat); m.position.set(e.x0, 1.2, e.z0); scene.add(m); nades.push({ m, ...e, t: 0 }) }
      else if (e.e === 'boom') { shock(e.x, e.z, e.r * 2.2, 0xffb060); part(T.star, e.x, 0.9, e.z, { size: e.r * 1.4, grow: 1.6, life: 0.3, add: true, color: 0xffc070 }); dust(e.x, e.z, 6, 1.6, 3); rocks(e.x, e.z, 4); mark(T.crack, e.x, e.z, e.r * 1.2, 3, Math.random() * 6); ctx.shake(0.3) }
      else if (e.e === 'far') ctx.UI.floatText(new THREE.Vector3(P.x, 2.3, P.z), '太远了', 'far');   // 设计 64
      else if (e.e === 'noTarget') ctx.UI.toast('附近没有能扔的目标', '', 1200);
      else if (e.e === 'heart') { ctx.UI.floatText(new THREE.Vector3(P.x, 2.6, P.z), '不眠之心：减伤 +30%', 'x10'); part(glowTex().ball, P.x, 1.2, P.z, { size: 2.6, grow: 1.4, life: 0.8, add: true, color: 0xffb040 }) }
      else if (e.e === 'mobSpawn') { if ((e.m.pus || e.m.crow) && stg) stg.spawnPus(e.m); else spawnMob(e.m) }   /* 设计 114：小乌鸦第 4 关自己画 */
      else if (e.e === 'rage') { rageT = 0.01; $h('.fbrage').classList.remove('hidden'); ctx.UI.toast(`3 分钟到了，${BOSSES[n].name}要放「灭杀」，吃两次必倒`, 'bad', 3000) }   /* 设计 106 */
      else if (e.e === 'doomHit') doomFx(e.n);
      else if (e.e === 'quake') quakeFx();
      else if (e.e === 'pstun') { ctx.UI.floatText(new THREE.Vector3(P.x, 2.6, P.z), '眩晕', 'bad'); stunFx = e.t }   /* 设计 110 */
      else if (e.e === 'proot') { ctx.UI.floatText(new THREE.Vector3(P.x, 2.6, P.z), '禁锢', 'bad'); for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28; part(T.rock, P.x + Math.cos(a) * 0.5, 0.15, P.z + Math.sin(a) * 0.5, { size: 0.55 + Math.random() * 0.25, life: e.t, op: 1, noFloor: true }) } dust(P.x, P.z, 6, 0.9, 1.5, 0.3) }
      else if (e.e === 'pconf') { ctx.UI.floatText(new THREE.Vector3(P.x, 2.6, P.z), '错乱：方向反了', 'bad') }   /* 设计 114：头顶紫色漩涡、画面边缘紫色波纹 */
      else if (e.e === 'immune') ctx.UI.floatText(new THREE.Vector3(B.x, 5.6, tox() ? ARENA.z0 : B.z), '免疫', '');   /* 设计 106b：灭杀期间打 BOSS 不掉血 */
      else if (e.e === 'win' || e.e === 'lose') onEnd(e.e === 'win');
      else if (e.e === 'cast' && e.ult) ctx.UI.floatText(new THREE.Vector3(B.x, tox() ? 6.3 : 6.4, tox() ? ARENA.z0 - 0.5 : B.z), e.name, 'bad');
    }
    qfxFrame(dt); rubFrame(dt);
    if (stunFx > 0) { stunFx -= dt; if (Math.random() < dt * 14) { const a = clock * 9 + Math.random(); part(T.star, P.x + Math.cos(a) * 0.45, 2.15, P.z + Math.sin(a) * 0.45, { size: 0.45, life: 0.3, add: true, color: 0xffe066 }) } }   /* 设计 110：眩晕——头顶星星转圈、身子晃 */
    if (ctx.player) ctx.player.rotation.z = P.stunT > 0 ? Math.sin(clock * 16) * 0.12 : 0;
    /* 设计 114：错乱——头顶紫色漩涡转圈，画面边缘紫色一圈（刺耳尖叫读条时也慢慢泛紫） */
    { const on = P.confT > 0; if (on && !confSpr && stg && T.blk) { confSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.blk[3], transparent: true, blending: ADD, depthWrite: false, fog: false })); confSpr.scale.setScalar(1.1) }
      if (confSpr) { if (confSpr.parent !== scene) scene.add(confSpr); confSpr.visible = on; if (on) { confSpr.position.set(P.x, 2.45, P.z); confSpr.material.rotation += dt * 6; confSpr.material.opacity = Math.min(1, P.confT * 3) } }
      const cv = hud && hud.querySelector('.fbconf'), ck = B.cast && B.cast.k === 'shriek' ? 0.6 * Math.min(1, B.cast.t / B.cast.dur) : 0, op = on ? 0.75 + 0.25 * Math.sin(clock * 8) : ck; if (cv && cv._op !== op) { cv._op = op; cv.style.opacity = op } }
    if (tintT > 0) { tintT -= dt; const el = hud.querySelector('.fbtint'); if (el) el.style.opacity = 0.55 * Math.max(0, tintT / tintD) }
    /* 飘伤害数字：同一个目标 0.25 秒合一次（一秒十几发，一发一个字太多了） */
    for (const [k, o] of dmgAcc) { o.t += dt; if (o.t >= 0.25) { const pos = k === 'b' ? (tox() ? new THREE.Vector3(B.x + (Math.random() - 0.5) * 2, 4.6, ARENA.z0 - 0.6) : new THREE.Vector3(B.x + (Math.random() - 0.5), 5.4, B.z)) : new THREE.Vector3(o.m.x, 2.1, o.m.z); ctx.UI.floatText(pos, (o.crit ? '暴击 ' : '') + o.a, o.crit ? 'x10' : 'x3'); dmgAcc.delete(k) } }
    /* 预警 */
    const live = new Set(fight.warns.map(w => w.id));
    for (const [id, o] of warnObjs) if (!live.has(id)) { scene.remove(o); disposeTree(o); warnObjs.delete(id) }
    for (const w of fight.warns) { let o = warnObjs.get(w.id); if (!o) { o = warnMesh(w); scene.add(o); warnObjs.set(w.id, o) } if (w.type === 'fan') o.rotation.y = w.yaw; warnSet(o, Math.min(1, w.t / w.dur), clock) }
    /* 设计 81：毒囊（动作、头、头上的特效、倒下沉进毒雾）、场地（毒雾、毒池、毒雾上涌）、脓包 */
    if (stg) { stg.bossFrame(dt, clock, fight, phase, B.dead ? endT : 0); stg.frame(dt, clock, fight); stg.pusFrame(fight, dt, clock);
      if (B.dead && phase === 'win') { endT += dt; if (endT > 3.2 && !chest) dropChest() } }
    else {
    /* 屠夫 */
    boss.position.set(B.x, 0, B.z); let dy = B.yaw - boss.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); boss.rotation.y += dy * Math.min(1, dt * 12);
    if (curAct && B.anim === 'walk') curAct.timeScale = B.ts;
    mixer.update(dt * (B.slow > 0 ? 0.5 : 1));
    { const R = boss.userData.rage, on = fight.rage && !B.dead; if (R) { for (const o of R.shells) o.visible = on; R.ring.visible = on }
      if (on) { rageT += dt; const k = 0.5 + 0.5 * Math.sin(rageT * 6); for (const m of boss.userData.mats) m.emissive.setRGB(0.18 * k, 0.02 * k, 0.01 * k);   // 设计 62：身上只淡淡一层红（原来 0.6 红把贴图都盖没了）
        if (R) { R.mat.opacity = 0.45 + 0.45 * k; R.mat.userData.w.value = 0.009 + 0.006 * k; R.ring.material.opacity = 0.5 + 0.4 * k; R.ring.scale.setScalar(5 + 0.6 * k) } } }
    if (B.dead && phase === 'win') { endT += dt; if (endT > BUTCHER_ANIM.die.hit && !boss.userData.fell) { boss.userData.fell = 1; dust(B.x + Math.sin(B.yaw) * 2.4, B.z + Math.cos(B.yaw) * 2.4, 12, 1.2, 3, 2.6); ctx.shake(0.5) } if (endT > 1.0 + BUTCHER_ANIM.die.hit - 0.85 && !chest) dropChest() }
    else boss.userData.fell = 0;
    }
    /* 主角 */
    const mvx = P.x - prevPos.x, mvz = P.z - prevPos.z, moved0 = hyp(mvx, mvz) / Math.max(dt, 1e-3); prevPos.set(P.x, 0, P.z);
    /* 设计 64：脸朝 BOSS、往后退的时候腿倒着走（走路 / 跑步动作倒放，速度对上） */
    const back = moved0 > 0.3 && !P.roll && (mvx * Math.sin(P.yaw) + mvz * Math.cos(P.yaw)) / (hyp(mvx, mvz) || 1) < -0.35, moved = back ? -moved0 : moved0;
    ctx.player.position.set(P.x, 0, P.z); let py = P.yaw - ctx.player.rotation.y; py = Math.atan2(Math.sin(py), Math.cos(py)); ctx.player.rotation.y += py * Math.min(1, dt * 18);
    ctx.P.pos.set(P.x, 0, P.z);
    ctx.animH(ctx.player, clock, P.dead ? 0 : Math.max(-8, Math.min(8, moved)));
    if (rollFx > 0) { rollFx -= dt; const k = Math.sin(Math.max(0, rollFx) / 0.32 * Math.PI); ctx.player.scale.set(1, 1 - 0.3 * k, 1); ctx.player.rotation.x = 0.5 * k } else { ctx.player.scale.set(1, 1, 1); ctx.player.rotation.x = 0 }
    if (P.dead) { ctx.player.rotation.x = -Math.PI / 2 * Math.min(1, (fight.after || 0) * 3); ctx.player.position.y = 0.25 }
    else ctx.aimArms(ctx.player);
    ctx.player.visible = !(P.inv > 0 && P.inv < 3 && !P.roll && Math.floor(P.inv * 12) % 2);
    /* 小丧尸 */
    for (const m of fight.mobs) { if (m.pus || m.crow) continue; const v = mobVis.get(m.id); if (!v) continue;
      v.m.position.set(m.x, m.rise > 0 ? -1.7 * (m.rise / 0.9) : m.dead ? -Math.max(0, m.deadT - 1.2) * 0.8 : 0, m.z); v.m.rotation.y = m.yaw || 0;
      if (m.dead) { v.m.rotation.x = -Math.min(1, m.deadT * 3) * Math.PI / 2 * 0.9; v.bar.visible = false } else { ctx.animH(v.m, clock + v.off, m.rise > 0 || m.stun > 0 || m.wind > 0 ? 0 : 2.3); v.bar.visible = m.hp < m.max; const k = m.hp / m.max; v.fg.scale.x = Math.max(0.001, k); v.fg.position.x = -(1 - k) / 2; v.bar.position.set(m.x, 2.2, m.z); v.bar.quaternion.copy(ctx.camera.quaternion) }
      v.stun.visible = m.stun > 0 && !m.dead; if (v.stun.visible) { v.stun.position.set(m.x, 2.05, m.z); v.stun.material.rotation += dt * 4 } }
    for (const [id, v] of mobVis) if (!fight.mobs.find(m => m.id === id && !m.pus && !m.crow)) { scene.remove(v.m); scene.remove(v.bar); scene.remove(v.stun); mobVis.delete(id) }
    /* 手雷：抛物线飞过去 */
    for (let i = nades.length - 1; i >= 0; i--) { const g = nades[i]; g.t += dt; const k = Math.min(1, g.t / g.dur); g.m.position.set(g.x0 + (g.x - g.x0) * k, 1.2 + 3 * k * (1 - k) - 1.0 * k, g.z0 + (g.z - g.z0) * k); g.m.rotation.x += dt * 12; if (k >= 1) { scene.remove(g.m); nades.splice(i, 1) } }
    /* 子弹 */
    for (const b of tracers) { if (!b.on) continue; b.t += dt; const k = Math.min(1, b.t / Math.max(0.02, b.dur)); b.m.position.lerpVectors(b.from, b.to, k); if (k >= 1) { b.on = false; b.m.visible = false; if (b.blocked || Math.random() < 0.3) part(T.star, b.to.x, b.to.y, b.to.z, { size: 0.45, grow: 1.5, life: 0.15, add: true, color: 0xffd08a }) } }
    /* 粒子、痕迹 */
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.t += dt; const k = p.t / p.life;
      if (k >= 1) { scene.remove(p.s); p.s.material.dispose(); parts.splice(i, 1); continue }
      if (p.ring) { const s = 1 + (p.ring - 1) * (1 - (1 - k) * (1 - k)); p.s.scale.setScalar(s); p.s.material.opacity = p.op * (1 - k); continue }
      if (p.slash) { p.s.material.opacity = 1 - k; continue }
      p.vy -= p.g * dt; p.s.position.x += p.vx * dt; p.s.position.y = p.noFloor ? p.s.position.y + p.vy * dt : Math.max(0.05, p.s.position.y + p.vy * dt); p.s.position.z += p.vz * dt; p.vx *= 1 - dt * 2; p.vz *= 1 - dt * 2;
      p.s.scale.setScalar(p.size * (1 + (p.grow - 1) * k)); p.s.material.opacity = p.op * (1 - k * k); if (p.spin) p.s.material.rotation += p.spin * dt;
      if (p.topY != null) { const over = p.s.position.y - p.topY; if (over > 0) { p.vy *= 1 - Math.min(1, dt * 4); p.s.material.opacity *= Math.max(0, 1 - over / 1.2) } } }   // 设计 84c：飘过 topY 就慢下来、淡掉
    for (let i = marks.length - 1; i >= 0; i--) { const m = marks[i]; m.t += dt; const k = m.t / m.life; if (k >= 1) { scene.remove(m.m); m.m.material.dispose(); marks.splice(i, 1); continue } m.m.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3 }
    /* 宝箱 */
    if (chest) chestFrame(dt, clock);
    hudFrame(dt);
    /* 镜头 */
    if (camFix) { ctx.camera.position.copy(camFix.pos); ctx.camera.lookAt(camFix.at) }   // 截图、录屏用
    else { camTarget(); const want = camTgt.clone().add(camOff); ctx.camera.position.lerp(want, Math.min(1, dt * 5)); ctx.cameraShake(dt); ctx.camera.lookAt(ctx.camera.position.x, 0, ctx.camera.position.z - camOff.z) }
    cliffCam.value = ctx.camera.position.z; seeThrough(dt);   // 56b：靠镜头的山崖压低
    if (flashT > 0) flashT -= dt;
  }
  /* 设计 95：BOSS 出了画面的红箭头（设计 61）取消了，所有关卡都不画 */
  const _cm = new THREE.Matrix4(), _cf = new THREE.Frustum(), _cs = new THREE.Sphere(new THREE.Vector3(), 3.5);
  function chestFrame(dt, clock) {
    const c = chest; c.t += dt;
    if (!c.landed) { const k = Math.min(1, c.t / 0.45); c.box.position.y = c.y0 * (1 - k * k); if (k >= 1) { c.landed = true; dust(c.x, c.z, 10, 1.0, 2.6, 1.0); ctx.shake(0.3) } }
    if (perfOpt('anim')) { ctx.camera.updateMatrixWorld(); _cm.multiplyMatrices(ctx.camera.projectionMatrix, ctx.camera.matrixWorldInverse); _cf.setFromProjectionMatrix(_cm); _cs.center.set(c.x, 1.5, c.z); if (!_cf.intersectsSphere(_cs)) return }   // 设计 57：宝箱不在画面里，光效不动
    c.fade = c.open ? Math.max(0, c.fade - dt / 2.5) : 1;
    const pul = 0.75 + 0.25 * Math.sin(clock * 2.2), on = c.landed ? 1 : 0;
    c.ring.material.opacity = 0.9 * pul * c.fade * on; c.ball.material.opacity = 0.55 * pul * c.fade * on; c.pillar.material.opacity = 0.8 * c.fade * on * (0.85 + 0.15 * Math.sin(clock * 3));
    for (const s of c.stars) { const u = s.userData; u.ph += dt * 3; s.position.set(Math.cos(u.a) * 1.1, 0.8 + Math.sin(u.a * 3) * 0.5, Math.sin(u.a) * 1.1); const tw = Math.max(0, Math.sin(u.ph)); s.material.opacity = tw * c.fade * on; s.scale.setScalar(0.4 + 0.5 * tw); if (tw < 0.02) u.a = Math.random() * 6.28 }
    for (const s of c.dots) { const u = s.userData; u.y += u.sp * dt; if (u.y > 3.4) { u.y = 0.1; u.a = Math.random() * 6.28 } u.a += dt * 0.8; s.position.set(Math.cos(u.a) * u.r, u.y, Math.sin(u.a) * u.r); s.material.opacity = Math.sin(u.y / 3.4 * Math.PI) * 0.9 * c.fade * on; s.scale.setScalar(0.18) }
    const P = fight.player, near = c.landed && !c.open && hyp(P.x - c.x, P.z - c.z) < 1.5 + 1.0;
    const e = hud.querySelector('.fbend');
    if (!c.open) { const want = near ? 'open' : 'far'; if (e.dataset.st !== want) { e.dataset.st = want; e.innerHTML = near ? '<div class="fbbtns"><button class="btn" data-fbe="open">打开宝箱</button></div>' : `<div class="fbbtns"><button class="btn ghost" data-fbe="home">回超市</button></div>`; e.classList.toggle('hidden', !c.landed) } if (c.landed) e.classList.remove('hidden') }
  }
  function spawnMob(m) {
    const z = ctx.mkZombie(m.id); z.position.set(m.x, -1.7, m.z); scene.add(z);
    const bar = new THREE.Group(), bg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.2), new THREE.MeshBasicMaterial({ color: 0x141414, depthTest: false, transparent: true, opacity: 0.85 })), fg = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.13), new THREE.MeshBasicMaterial({ color: 0xff4a3a, depthTest: false, transparent: true }));
    bg.renderOrder = 8; fg.renderOrder = 9; bar.add(bg, fg); bar.visible = false; scene.add(bar);
    const stun = glowSprite(T.star, 0x9fe8ff, 0.9); stun.scale.setScalar(0.6); stun.visible = false; scene.add(stun);
    mobVis.set(m.id, { m: z, bar, fg, stun, off: Math.random() * 3 });
  }
  return {
    active: () => active, scene: () => scene, phase: () => phase, fight: () => fight,
    async enter(lv, hero, look) {   /* 设计 74：读、建场地出错：副本状态清掉，错误记下来，再抛给 main.js（main.js 不扣券、让主角走出门） */
      let loaded = false;
      try { assets_ = await load(lv); loaded = true; return await enter(lv, hero, look) } catch (e) { active = false; phase = ''; if (hud) hud.classList.add('hidden'); if (loaded) fbErr(e); throw e } },
    frame, exit, preload: (lv = 1) => load(lv).catch(() => null),   /* 设计 74：后台先读，失败不提示（点挑战时再读） */
    abort() { active = false; phase = ''; if (hud) hud.classList.add('hidden') },   /* 设计 74：进副本失败：副本这边的状态清掉 */
    shot: () => ({ boss, play, stg, tracers, scene }), camFix: v => { camFix = v }, chestPos: () => chest && { x: chest.x, z: chest.z },
  };
}
