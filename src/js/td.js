/* ================= 尸潮塔防：打的过程（只在玩的时候跑，不存档） =================
   丧尸从门外马路尽头刷出来，沿 TD_PATH 走进大门、走到超市门口（防线）；路障挡一下；塔和主角自动开火。
   赢 = 所有波打完、场上没有丧尸；输 = 防线血量扣完，或者主角倒下。
   存档里的数（尸潮券、次数、奖励）在 logic.js（tdStart / tdEnd）。 */
import * as THREE from 'three';
import { perfOpt } from './perf.js';
import { sharedMat, addBlob } from './chars.js';
import { TD, ZT, tdLevel, tdName, TOWERS, STAFF } from './config.js';
import { TD_SPAWN, TD_PATH, TD_LINE, BARRICADE, TOWER_SPOTS, STORE } from './world.js';
import { prop } from './props.js';
import { lazyTex } from './assets.js';
import { M16_TIP } from './m16.js';

const tmp = new THREE.Vector3(), _bq = new THREE.Quaternion();
/* 血条（0.16 用户要明显一点）：粗一点、黑边，按剩余血量变色：60% 以上绿、30%～60% 橙、30% 以下红 */
const barGeo = new THREE.PlaneGeometry(1, 0.16), barBgGeo = new THREE.PlaneGeometry(1.1, 0.26);
const barBg = new THREE.MeshBasicMaterial({ color: 0x141414, depthTest: false, depthWrite: false, transparent: true, opacity: 0.9, fog: false, toneMapped: false });
const barCol = [0xff3b30, 0xff9f0a, 0x34e05a].map(c => new THREE.MeshBasicMaterial({ color: c, depthTest: false, depthWrite: false, transparent: true, fog: false, toneMapped: false }));   // 不受尸潮的暗雾影响，颜色鲜亮
const barMat = k => barCol[k > 0.6 ? 2 : k > 0.3 ? 1 : 0];
const coinGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.06, 14), coinMat = new THREE.MeshBasicMaterial({ color: 0xf2c230 });
const boomGeo = new THREE.RingGeometry(0.2, 0.35, 24), slowGeo = new THREE.RingGeometry(0.9, 1, 32);
/* 0.19 用户：开枪要看得见 —— 粗一点的亮色弹道（细长方块，朝目标拉长）、枪口火光、打中的丧尸闪一下白、头上飘伤害数字 */
const beamGeo = new THREE.BoxGeometry(0.07, 0.07, 1); beamGeo.translate(0, 0, 0.5);
const fxMat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95, depthWrite: false, fog: false, toneMapped: false });
const BEAM = { gun: fxMat(0xffd84a), sniper: fxMat(0xffffff), player: fxMat(0xffe27a), guard: fxMat(0x9fe0ff) };
const flashGeo = new THREE.SphereGeometry(0.16, 8, 6), flashMat = fxMat(0xfff2a0);
const nadeGeo = new THREE.SphereGeometry(0.16, 10, 8), nadeMat = new THREE.MeshLambertMaterial({ color: 0x3d4a2a });
/* 0.23 用户：冲锋枪要有打击感 —— 一次开火打 3 发连射（伤害分成 3 份，加起来不变），每发是一颗飞过去的亮色小光弹（带拖尾），飞到了才算打中 */
const bulletGeo = new THREE.BoxGeometry(0.08, 0.08, 0.6); bulletGeo.translate(0, 0, -0.3);   // 头在原点，拖尾往后
const sparkGeo = new THREE.SphereGeometry(0.09, 6, 4);
const BURST = { n: 3, gap: 0.07, speed: 42 };
/* 0.24 用户：炮塔、手雷要像爆炸，不是一个圈 —— 火球（橙黄、一下子胀大再散）、白闪、往上飘的黑烟、四散的碎片和火星、地上一块焦黑、镜头一震 */
const ballGeo = new THREE.SphereGeometry(1, 14, 10), chipGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12), scorchGeo = new THREE.CircleGeometry(1, 20);
const fireMat = () => new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 1, depthWrite: false, fog: false, toneMapped: false, blending: THREE.AdditiveBlending });
const coreMat = () => new THREE.MeshBasicMaterial({ color: 0xfff4c0, transparent: true, opacity: 1, depthWrite: false, fog: false, toneMapped: false, blending: THREE.AdditiveBlending });
const smokeMat = () => new THREE.MeshLambertMaterial({ color: 0x3a3430, transparent: true, opacity: 0.75, depthWrite: false });
const chipMat = new THREE.MeshBasicMaterial({ color: 0xffc04a, fog: false, toneMapped: false });
const scorchMat = () => new THREE.MeshBasicMaterial({ color: 0x1a1612, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16 });
/* 守卫能走动的范围：大门到超市门口那段路（两边的人行道也算） */
const GZ = { x0: -13.2, x1: -3.2, z0: -4.6, z1: 1.8 };
const SHARED_GEO = new Set([boomGeo, slowGeo, beamGeo, flashGeo, nadeGeo, bulletGeo, sparkGeo, ballGeo, chipGeo, scorchGeo]);
/* 0.44 用户画的特效图（美术/特效 → img/fx）：枪口火光、火星、爆炸火球、烟、地面焦痕、狙击弹道、冷气雾、雪花、冰霜圈、炮弹 */
const FXT = {}; { const TL = { load: lazyTex }; for (const n of ['flash', 'spark', 'fire', 'smoke', 'scorch', 'streak', 'mist', 'flake', 'shell']) { /* 设计 38：进游戏以后才下载 */ const t = TL.load(`img/fx/${n}.png`); t.colorSpace = THREE.SRGBColorSpace; FXT[n] = t }
  const fr = TL.load('img/fx/frost.jpg'); fr.colorSpace = THREE.SRGBColorSpace; FXT.frost = fr }
const ADD = THREE.AdditiveBlending;
/* 一张图做成的特效：spr 是面朝镜头的贴片，flat 是平躺在地上的贴片 */
const sprite = (n, size, add = true, color = 0xffffff, op = 1) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: FXT[n], color, transparent: true, opacity: op, depthWrite: false, fog: false, toneMapped: false, blending: add ? ADD : THREE.NormalBlending })); s.scale.setScalar(size); s.material.rotation = Math.random() * Math.PI * 2; return s };
const flatGeo = new THREE.PlaneGeometry(1, 1); flatGeo.rotateX(-Math.PI / 2);
const streakGeo = new THREE.PlaneGeometry(0.34, 1); streakGeo.rotateX(-Math.PI / 2); streakGeo.translate(0, 0, 0.5);
SHARED_GEO.add(flatGeo); SHARED_GEO.add(streakGeo);
const flat = (n, size, add, op = 1) => { const m = new THREE.Mesh(flatGeo, new THREE.MeshBasicMaterial({ map: FXT[n], transparent: true, opacity: op, depthWrite: false, fog: false, toneMapped: false, blending: add ? ADD : THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16 })); m.scale.setScalar(size); return m };

/* V1.21 设计/27：子弹不要线条 —— 所有枪都打一颗颗光弹（bullet.jpg，加色混合、黑色等于透明），枪口火光 3 张图集（muzzle3.jpg），
   抛黄铜弹壳；光弹、火光用对象池（不每发新建） */
const BT = (() => { const TL = { load: lazyTex }, f = n => { const t = TL.load(`img/fx/${n}.jpg`); t.colorSpace = THREE.SRGBColorSpace; return t }; return { bul: f('bullet'), muz: f('muzzle3') } })();
const addMat = (map, color = 0xffffff) => new THREE.MeshBasicMaterial({ map, color, transparent: true, depthWrite: false, fog: false, toneMapped: false, blending: ADD, side: THREE.DoubleSide });
const bulGeo = new THREE.PlaneGeometry(1, 1); bulGeo.translate(-0.4, 0, 0);    // 弹头在原点附近，尾巴往后
const BUL = { player: { len: 0.38, w: 0.14, sp: 26, mat: addMat(BT.bul), muz: 0.6 }, guard: { len: 0.32, w: 0.12, sp: 26, mat: addMat(BT.bul), muz: 0.5 },
  gun: { len: 0.38, w: 0.14, sp: 28, mat: addMat(BT.bul, 0xffc080), muz: 0.8 }, sniper: { len: 0.7, w: 0.22, sp: 55, mat: addMat(BT.bul, 0xfff2dc), muz: 0.9 } };
/* 火光 3 张：0、2 号火焰根部在左边，1 号（大的）根部在 1/4 处 */
const muzGeo = [0, 1, 2].map(i => { const g = new THREE.PlaneGeometry(1, 1); g.translate(i === 1 ? 0.25 : 0.45, 0, 0); const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / 3); return g });
const muzMat = addMat(BT.muz);
/* 弹壳：小黄铜圆柱 */
const caseGeo = new THREE.CylinderGeometry(0.0125, 0.0125, 0.07, 6), caseMat = new THREE.MeshLambertMaterial({ color: 0xc9953a, emissive: 0x3a2508 });
SHARED_GEO.add(bulGeo); SHARED_GEO.add(caseGeo); muzGeo.forEach(g => SHARED_GEO.add(g));
/* 贴片顺着 dir 摆、尽量正对镜头 */
const _ax = new THREE.Vector3(), _ay = new THREE.Vector3(), _az = new THREE.Vector3(), _m4 = new THREE.Matrix4();
function faceAlong(o, dir, cam) { _ax.copy(dir).normalize(); _az.subVectors(cam.position, o.position); _ay.crossVectors(_az, _ax); if (_ay.lengthSq() < 1e-8) _ay.set(0, 1, 0); _ay.normalize(); _az.crossVectors(_ax, _ay); _m4.makeBasis(_ax, _ay, _az); o.quaternion.setFromRotationMatrix(_m4) }

/* ctx: { scene, camera, W, S(), L, UI, mkZombie(i), animH, P, player, onEnd(result) } */
export function createTD(ctx) {
  const { scene, camera, W, L, UI } = ctx;
  let run = null;

  /* 把一关拆成每一波的出场顺序（同一波里的种类交错出场） */
  function waveList(w) { const out = [], q = w.map(([k, n]) => ({ k, n })); while (q.some(x => x.n > 0)) for (const x of q) if (x.n > 0) { out.push(x.k); x.n-- } return out }

  /* 丧尸模型用完放回池子里下次再用（0.16 丧尸多了 3 倍：每只都新建一个带骨骼的人物会卡）；每帧最多新建 1 个 */
  const pool = []; let made = 0;
  function getZombie() {
    let m = pool.pop();
    if (!m) { m = ctx.mkZombie(made++);
      const bar = new THREE.Group(), bg = new THREE.Mesh(barBgGeo, barBg), fg = new THREE.Mesh(barGeo, barCol[2]); bg.renderOrder = 20; fg.renderOrder = 21; fg.position.z = 0.001;
      bar.add(bg, fg); m.add(bar); m.userData.bar = bar; m.userData.fg = fg;
      const mats = []; m.traverse(o => { if (o.isMesh && o.material && o.material.emissive && o.material.map) mats.push(o.material) }); m.userData.mats = mats }
    m.rotation.set(0, 0, 0); m.scale.setScalar(1); m.visible = true; m.userData.last = -1; for (const mt of m.userData.mats) mt.emissive.setHex(0);
    return m;
  }
  function putBack(z) { scene.remove(z.m); pool.push(z.m) }
  function spawn(type, z0) {
    const T = ZT[type], m = getZombie(), { bar, fg } = m.userData;
    m.scale.multiplyScalar(T.size);
    const tint = type === 'fat' ? 0x9fc48a : type === 'runner' ? 0xd8c8a8 : type.includes('boss') ? 0xd07070 : 0xffffff;
    m.traverse(o => { if (o.isMesh && o.material && o.material.color && o.material.map) { if (perfOpt('mat')) o.material = sharedMat(o.material.map, tint); else o.material.color.setHex(tint) } });   // 设计 30：按皮肤 + 颜色共用材质
    const z = Math.max(-1.5, Math.min(1.5, z0 + (Math.random() - 0.5) * 1.6));
    m.position.set(TD_SPAWN.x + Math.random() * 1.8, 0, TD_SPAWN.z + z); scene.add(m); addBlob(m);
    bar.visible = false; bar.position.y = 2.25; bar.scale.setScalar(0.9); fg.scale.x = 1; fg.position.x = 0; fg.material = barCol[2];
    const hp = T.hp * (tdLevel(run.lv).hp || 1);
    run.zs.push({ m, type, T, hp, max: hp, seg: 0, off: z * 0.25, slow: 0, slowT: 0, hitCd: 0, bar, fg, dead: 0 });
  }

  /* guards：在岗的守卫员工 [{id, m, hp, max, atk, def}]（站在路边，自动开枪；丧尸会顺路打他们） */
  function start(lv, guards = []) {
    const LV = tdLevel(lv);
    const hs = ctx.hero();   // 0.20 主角属性：血量、M16、手雷按等级算（开打时定下来）
    run = { lv, hs, waves: LV.waves.map(waveList), wi: 0, queue: [], spawnT: 0, waveT: 0, zs: [], line: TD.lineHP, hp: hs.hp, hurtT: 99, shotT: 0,
      guards: guards.map((g, i) => ({ ...g, cd: Math.random(), down: false, home: g.m.position.clone(), lane: (i % 3 - 1) * 0.7 })), bar: TD.barricade.hp, repT: 0, coins: 0, kills: 0, t: 0, speed: 1, fx: [], bursts: [], drops: [], towerCd: TOWER_SPOTS.map(() => 0), over: false, announce: 0 };
    run.queue = run.waves[0].slice(); run.spawnT = 2.5; run.pend = []; run.gcd = 0;
    W.setBarricade(true, 1);
    UI.big(`尸潮来了！`, `${tdName(lv)}　共 ${LV.waves.length} 波`, 'bad');
  }

  /* ---------- 特效：子弹轨迹、炮弹爆炸、减速波 ---------- */
  function tracer(from, to, kind, life = 0.08) {
    if (kind === 'sniper') {   // 0.44 狙击：一道金色的光（弹道图），慢慢淡掉；打中的地方冒火星
      const b = new THREE.Mesh(streakGeo, new THREE.MeshBasicMaterial({ map: FXT.streak, transparent: true, depthWrite: false, fog: false, toneMapped: false, blending: ADD, side: THREE.DoubleSide }));
      b.position.copy(from); b.lookAt(to); b.scale.set(1.6, 1, from.distanceTo(to)); scene.add(b); run.fx.push({ o: b, life: 0.22, max: 0.22, kind: 'fade', own: true });
      hitSpark(to, 1.6);
    } else { const b = new THREE.Mesh(beamGeo, BEAM[kind] || BEAM.gun); b.position.copy(from); b.lookAt(to); b.scale.set(1, 1, from.distanceTo(to)); scene.add(b);
      run.fx.push({ o: b, life, max: life, kind: 'beam' }) }
    muzzle(from, kind === 'sniper' ? 1.1 : 0.7);
  }
  /* V1.21 光弹：z 是目标丧尸（飞的时候一直朝它飞，飞到才扣血；它先死了就飞到最后的位置、地上冒一小团土） */
  const bPool = [], mPool = [];
  function bullet(from, to, kind, onHit, z) {
    const B = BUL[kind] || BUL.gun, o = bPool.pop() || new THREE.Mesh(bulGeo, B.mat); o.material = B.mat; o.scale.set(B.len, B.w, 1); o.position.copy(from); scene.add(o);
    const dir = to.clone().sub(from); faceAlong(o, dir, camera);
    run.fx.push({ o, life: 9, max: 9, kind: 'bul', B, kd: kind, to: to.clone(), dy: to.y - (z ? z.m.position.y : 0), z, onHit, pool: bPool, trail: 0 });
    muzzleFx(from, dir, kind); casing(from, dir, kind === 'sniper' ? 1.5 : 1);
  }
  function muzzleFx(at, dir, kind) {
    if (run.fx.length > 150) return;
    const B = BUL[kind] || BUL.gun, i = kind === 'sniper' ? 1 : Math.random() < 0.5 ? 0 : 2, o = mPool.pop() || new THREE.Mesh(muzGeo[0], muzMat);
    o.geometry = muzGeo[i]; const sz = B.muz * (0.8 + Math.random() * 0.4); o.scale.set(sz, sz, 1); o.position.copy(at); scene.add(o);
    faceAlong(o, dir, camera); o.rotateX((Math.random() - 0.5) * 0.6);
    run.fx.push({ o, life: 0.05, max: 0.05, kind: 'muz', pool: mPool });
    if (kind === 'sniper') { const sm = sprite('smoke', 0.3, false, 0xdedad4, 0.7); sm.position.copy(at); scene.add(sm); run.fx.push({ o: sm, life: 0.4, max: 0.4, kind: 'smokes', r0: 0.3, r1: 0.7, vy: 0.8, own: true }) }
  }
  /* 抛弹壳：往侧后方抛、翻着落地、弹两下、躺一会儿；同时最多 30 颗，省电模式不抛 */
  function casing(from, dir, big) {
    if (run.fx.length > 150 || (ctx.eco && ctx.eco())) return;
    const cs = run.fx.filter(f => f.kind === 'case'); if (cs.length >= 30) cs[0].life = 0;
    const d = dir.clone().setY(0).normalize(), side = new THREE.Vector3(d.z, 0, -d.x).multiplyScalar(Math.random() < 0.5 ? 1 : -1), o = new THREE.Mesh(caseGeo, caseMat);
    o.scale.setScalar(big); o.position.copy(from); o.rotation.set(Math.random() * 3, Math.random() * 3, 0); scene.add(o);
    const v = side.multiplyScalar(1.2 + Math.random() * 0.8).addScaledVector(d, -0.6).setY(2.2 + Math.random());
    run.fx.push({ o, life: 1.6, max: 1.6, kind: 'case', v, sp: 12 + Math.random() * 8, bounce: 0, big });
  }
  function dust(at, size = 0.3) { if (run.fx.length > 150) return; const sm = sprite('smoke', size, false, 0x9a9088, 0.6); sm.position.copy(at); scene.add(sm); run.fx.push({ o: sm, life: 0.22, max: 0.22, kind: 'fade', own: true }) }
  /* 0.44 枪口火光（星形火光图，转个随机角度，一闪就没）、打中的火星；场上特效太多（> 150 个）时这些小的先不画，手机别太烫 */
  function muzzle(at, size) { if (run.fx.length > 150) return; const f = sprite('flash', size * (0.8 + Math.random() * 0.4)); f.position.copy(at); scene.add(f); run.fx.push({ o: f, life: 0.06, max: 0.06, kind: 'fade', own: true }) }
  function hitSpark(at, size = 1) { if (run.fx.length > 150) return; for (let i = 0; i < 1; i++) { const s = sprite('spark', 0.35 * size); s.position.copy(at); s.position.x += (Math.random() - 0.5) * 0.2; s.position.y += (Math.random() - 0.5) * 0.2; scene.add(s); run.fx.push({ o: s, life: 0.12, max: 0.12, kind: 'fade', own: true }) } }
  /* 连射：fromFn 每发重新算枪口（主角边走边打） */
  function burst(fromFn, z, dmg, kind, show, tw) { run.bursts.push({ n: BURST.n, t: 0, fromFn, z, dmg: dmg / BURST.n, kind, show, tw }) }
  /* 爆炸：r 是伤害半径（火球按它的大小来） */
  function explode(at, r) {
    const add = (o, f) => { scene.add(o); run.fx.push({ o, ...f }) };
    /* 0.44 用户画的图：火球（胀大再淡掉）、白闪、往上飘的烟、四散的火星、地上一块焦痕 */
    const ball = sprite('fire', 1); ball.renderOrder = 4; ball.position.set(at.x, 0.7, at.z); add(ball, { life: 0.5, max: 0.5, kind: 'exs', r0: 0.6, r1: r * 1.6, own: true });
    const core = sprite('flash', 1); core.renderOrder = 5; core.position.set(at.x, 0.8, at.z); add(core, { life: 0.16, max: 0.16, kind: 'exs', r0: 0.8, r1: r * 1.3, own: true });
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.random(), d = r * 0.35 * Math.random();   // 0.44 手机别太烫：烟 4 团、火星 6 颗
      const sm = sprite('smoke', 1, false, 0x6a625a, 0.85); sm.position.set(at.x + Math.cos(a) * d, 0.5, at.z + Math.sin(a) * d);
      add(sm, { life: 1.1 + Math.random() * 0.5, max: 1.4, kind: 'smokes', r0: 0.5, r1: r * (0.8 + Math.random() * 0.4), vy: 1.2 + Math.random(), own: true }) }
    for (let i = 0; i < 6; i++) { const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 5;
      const c = sprite('spark', 0.3); c.position.set(at.x, 0.5, at.z); add(c, { life: 0.6, max: 0.6, kind: 'chip', own: true, v: new THREE.Vector3(Math.cos(a) * sp, 3 + Math.random() * 4, Math.sin(a) * sp) }) }
    const sc = flat('scorch', r * 1.3, false, 0.6); sc.material.rotation = 0; sc.rotation.y = Math.random() * Math.PI * 2; sc.position.set(at.x, 0.02, at.z); add(sc, { life: 4, max: 4, kind: 'scorchs', own: true });
    ctx.shake && ctx.shake(Math.min(0.35, 0.12 + r * 0.06));
  }
  function ring(pos, geo, color, life, grow) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(pos.x, 0.08, pos.z); scene.add(m); run.fx.push({ o: m, life, max: life, kind: 'ring', grow });
  }
  function shell(from, to, dmg, splash) {
    const m = sprite('shell', 0.5, false); m.position.copy(from); scene.add(m); muzzle(from, 1.2);   // 0.44 用户画的炮弹图，飞的时候转
    run.fx.push({ o: m, life: 0.55, max: 0.55, kind: 'shell', own: true, from: from.clone(), to: to.clone(), dmg, splash });
  }

  /* show：在头上飘伤害数字（主角、守卫、手雷打的才飘，塔打的太多不飘） */
  function hurt(z, dmg, show, cls = 'hit') {
    if (z.dead) return; z.hp -= dmg; z.bar.visible = true;   // 血条挨打了才显示（满血的不画，丧尸多的时候省很多）
    if (show) UI.floatText(z.m.position.clone().setY(2.3 * z.T.size), `-${Math.round(typeof show === 'number' ? show : dmg)}`, cls);   // 0.23：连射只在第一发飘一次整轮的伤害（数字大、看得清）
    if (z.hp <= 0) {
      z.dead = 0.8; run.kills++; z.bar.visible = false;
      if (Math.random() < TD.coinDrop || z.type.includes('boss')) {
        const n = z.type.includes('boss') ? 40 : TD.coinDropN[0] + Math.floor(Math.random() * (TD.coinDropN[1] - TD.coinDropN[0] + 1));
        const c = new THREE.Mesh(coinGeo, coinMat); c.position.set(z.m.position.x, 0.4, z.m.position.z); scene.add(c); run.drops.push({ c, n, t: 0 });
      }
    }
  }

  const alive = () => run.zs.filter(z => !z.dead);
  const nadeCfg = () => ({ ...TD.grenade, dmg: run.hs.nadeDmg, radius: run.hs.nadeR, cd: run.hs.nadeCd });
  /* 手雷（0.19 主角的手动技能）：自动扔向射程里丧尸最密的地方，炸一片；冷却 TD.grenade.cd 秒 */
  function throwNade() {
    if (!run || run.over || run.gcd > 0) return false;
    const G = nadeCfg(), P = ctx.P, near = alive().filter(z => Math.hypot(z.m.position.x - P.pos.x, z.m.position.z - P.pos.z) < G.range);
    if (!near.length) { UI.toast('附近没有丧尸', ''); return false }
    let best = near[0], bn = 0;
    for (const a of near) { let n = 0; for (const b of near) if (Math.hypot(a.m.position.x - b.m.position.x, a.m.position.z - b.m.position.z) < G.radius) n++; if (n > bn) { bn = n; best = a } }
    const to = best.m.position.clone().setY(0), from = P.pos.clone().setY(1.4), o = new THREE.Mesh(nadeGeo, nadeMat); o.position.copy(from); scene.add(o);
    run.fx.push({ o, life: 0.6, max: 0.6, kind: 'nade', from, to }); run.gcd = G.cd; return true;
  }
  function boom(at) {
    const G = nadeCfg(); let n = 0;
    for (const e of alive()) if (Math.hypot(e.m.position.x - at.x, e.m.position.z - at.z) < G.radius) hurt(e, G.dmg, n++ < 6);
    explode(at, G.radius);
  }
  const progress = z => z.seg * 100 - tmp.copy(TD_PATH[Math.min(z.seg, TD_PATH.length - 1)]).distanceTo(z.m.position);   // 越接近防线越大

  function update(dtReal, clock) {
    if (!run || run.over) return;
    const dt = dtReal * run.speed, S = ctx.S(), P = ctx.P, pl = ctx.player;
    run.t += dt;
    /* ---------- 出怪 ---------- */
    /* 一小群一小群地涌出来（TD.group 只）；场上满 TD.cap 只就先等着；一群里的每帧出一只（不一下子新建好几个模型） */
    if (run.pend.length) { const [k, z0] = run.pend.shift(); spawn(k, z0) }
    else if (run.queue.length) { run.spawnT -= dt; if (run.spawnT <= 0 && alive().length < TD.cap) { const [a, b] = TD.group, n = a + Math.floor(Math.random() * (b - a + 1)), z0 = (Math.random() - 0.5) * 2; for (let i = 0; i < n && run.queue.length; i++) run.pend.push([run.queue.shift(), z0]); run.spawnT = TD.spawnGap } }
    else if (run.wi < run.waves.length - 1) {
      run.waveT += dt;
      if (run.waveT > TD.waveGap || !alive().length) { run.wi++; run.queue = run.waves[run.wi].slice(); run.waveT = 0; run.spawnT = 1.5; UI.big(`第 ${run.wi + 1} 波`, run.wi === run.waves.length - 1 ? '最后一波！' : '', 'bad') }
    }
    /* ---------- 丧尸 ---------- */
    const inStore = P.pos.x < STORE.x1 - 0.3, nA = alive().length; run.f = (run.f || 0) + 1; let zi = 0;
    for (const z of run.zs) { zi++;
      const p = z.m.position;
      if (z.dead) { if (z.flash) { z.flash = 0; for (const mt of z.m.userData.mats) mt.emissive.setHex(0) } z.dead -= dt; z.m.rotation.x = Math.min(Math.PI / 2, z.m.rotation.x + dt * 4); if (z.dead <= 0) { putBack(z); z.gone = true } continue }
      z.hitCd -= dt; z.slowT -= dt; if (z.slowT <= 0) z.slow = 0;
      if (z.flash > 0) { z.flash -= dt; if (z.flash <= 0) { z.flash = 0; for (const mt of z.m.userData.mats) mt.emissive.setHex(0) } }
      const sp = z.T.sp * (1 - z.slow);
      /* 主角在院子里、离得近：追主角；主角躲进店里就不追了 */
      const dP = Math.hypot(P.pos.x - p.x, P.pos.z - p.z), chase = !inStore && dP < 3.2;
      let tx, tz, attacking = false;
      /* 路边的守卫挨着了：停下来打他 */
      const gNear = !chase && run.guards.find(g => !g.down && Math.hypot(g.m.position.x - p.x, g.m.position.z - p.z) < 1.5 + z.T.size * 0.2);
      if (gNear) { attacking = true; z.m.rotation.y = Math.atan2(gNear.m.position.x - p.x, gNear.m.position.z - p.z);
        if (z.hitCd <= 0) { z.hitCd = 1.1; gNear.hp -= z.T.hit * 40 / (40 + gNear.def); ctx.UI.floatText(gNear.m.position.clone().setY(2.1), `-${Math.round(z.T.hit * 40 / (40 + gNear.def))}`, 'bad');
          if (gNear.hp <= 0) { gNear.hp = 0; gNear.down = true; gNear.m.rotation.x = -Math.PI / 2 * 0.9; gNear.m.position.y = 0.3; ctx.UI.toast('有守卫被打倒了', 'bad') } } }
      if (gNear) {}
      else if (chase) { tx = P.pos.x; tz = P.pos.z }
      else {
        if (run.bar > 0 && z.seg >= TD_PATH.length - 2 && Math.hypot(p.x - BARRICADE.x, p.z - BARRICADE.z) < 1.1 + z.T.size * 0.2) { attacking = true; run.bar -= z.T.atk * dt; if (run.bar <= 0) { run.bar = 0; UI.toast('路障被打烂了！站到旁边能修好', 'bad') } }
        const w = TD_PATH[z.seg]; tx = w.x; tz = w.z + (z.seg < TD_PATH.length - 1 ? z.off : 0);
      }
      if (!attacking) {
        const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
        if (!chase && d < 0.3) {
          if (z.seg < TD_PATH.length - 1) z.seg++;
          else { run.line -= z.T.leak; z.dead = 0.01; z.bar.visible = false; ctx.UI.floatText(p.clone().setY(2), `防线 −${z.T.leak}`, 'bad'); continue }
        } else if (d > 0.01) { const st = Math.min(d, sp * dt); p.x += dx / d * st; p.z += dz / d * st; z.m.rotation.y = Math.atan2(dx, dz) }
      }
      const far = perfOpt('cull') && Math.abs(p.x - ctx.P.pos.x) + Math.abs(p.z - ctx.P.pos.z) > 26;   // 设计 30：离主角很远（马路尽头排队）的动作隔一帧更新
      if ((nA < 30 && !far) || ((zi + run.f) & 1) === 0) ctx.animH(z.m, clock, attacking ? 0 : sp);   // 丧尸多的时候动作隔一帧更新一次（各一半轮流），省手机 CPU
      /* 碰到主角：扣血、撞开 */
      if (dP < 0.65 + z.T.size * 0.25 && z.hitCd <= 0 && !inStore) {
        z.hitCd = 1.1; run.hp -= z.T.hit; run.hurtT = 0;
        const k = 6 / Math.max(0.3, dP); P.kb.set((P.pos.x - p.x) * k, (P.pos.z - p.z) * k); ctx.onHit && ctx.onHit();
      }
      if (z.bar.visible) { const k = Math.max(0, z.hp / z.max); z.fg.scale.x = k; z.fg.position.x = -(1 - k) / 2; z.fg.material = barMat(k); z.m.updateMatrixWorld(); z.m.getWorldQuaternion(_bq).invert(); z.bar.quaternion.copy(_bq).multiply(camera.quaternion) }   // 正对屏幕：先抵消丧尸自己的朝向
    }
    run.zs = run.zs.filter(z => !z.gone);
    /* ---------- 主角：自动打射程内最近的丧尸 ---------- */
    run.shotT -= dt; run.hurtT += dt; if (run.aim) { run.aim.t -= dt; if (run.aim.t <= 0) run.aim = null } if (run.gcd > 0) run.gcd -= dt;
    if (run.shotT <= 0) {
      let best = null, bd = run.hs.range || TD.player.range;
      for (const z of alive()) { const d = z.m.position.distanceTo(P.pos); if (d < bd) { bd = d; best = z } }
      if (best) { run.shotT = run.hs.rate; pl.rotation.y = Math.atan2(best.m.position.x - P.pos.x, best.m.position.z - P.pos.z);
        const muzzle = () => { const g = pl.userData.gun; return g && g.visible ? (pl.updateMatrixWorld(true), g.localToWorld(M16_TIP.clone())) : P.pos.clone().setY(1.1) };   // 0.23：子弹从 M16 枪口出去（先转身再算枪口）
        run.lastFrom = muzzle(); burst(muzzle, best, run.hs.dmg, 'player', true); run.aim = { yaw: pl.rotation.y, t: run.hs.rate + 0.3 } }
    }
    /* ---------- 守卫（0.37 用户）：不再跟着主角，自己找丧尸打；跟丧尸保持距离（站在射程边上开枪），丧尸靠近了往外躲；血少于 35% 退回超市门口。装了 M16 的和主角一样 3 连射 ---------- */
    for (const g of run.guards) {
      if (g.down) continue;
      const gp = g.m.position, range = g.gun ? g.gun.range || TD.player.range : STAFF.guard.range, keep = range * 0.78;
      let best = null, bd = 40;
      for (const z of alive()) { const d = z.m.position.distanceTo(gp); if (d < bd) { bd = d; best = z } }
      /* 躲：附近每只丧尸把守卫往外推（越近推得越狠），其他守卫也稍微推开一点免得挤成一团 */
      let rx = 0, rz = 0;
      for (const z of alive()) { const zx = gp.x - z.m.position.x, zz = gp.z - z.m.position.z, d = Math.hypot(zx, zz), R = 2.8 + z.T.size * 0.6; if (d < R && d > 0.01) { const k = (R - d) / R * (z.T.sp > 2 ? 1.6 : 1); rx += zx / d * k; rz += zz / d * k } }
      for (const o of run.guards) if (o !== g && !o.down) { const ox = gp.x - o.m.position.x, oz = gp.z - o.m.position.z, d = Math.hypot(ox, oz); if (d < 1.6 && d > 0.01) { rx += ox / d * 0.4 * (1.6 - d); rz += oz / d * 0.4 * (1.6 - d) } }
      let mx = 0, mz = 0, sp = 3.2;
      if (g.hp < g.max * 0.35) { mx = GZ.x0 + 0.5 - gp.x; mz = GZ.z1 - 0.4 + g.lane * 0.5 - gp.z; sp = 3.6 }   // 血少：退到超市门口
      else if (Math.hypot(rx, rz) > 0.12) { mx = rx; mz = rz; sp = 3.6 }                                         // 丧尸太近：往外躲
      else if (best && bd > keep + 0.6) { mx = best.m.position.x - gp.x; mz = best.m.position.z - gp.z }      // 离得远：走过去，走到射程边上
      else if (best && bd < keep - 0.6) { mx = gp.x - best.m.position.x; mz = gp.z - best.m.position.z; sp = 2.4 }   // 太近：退一点
      else if (!best) { mx = g.home.x - gp.x; mz = g.home.z - gp.z; if (Math.hypot(mx, mz) < 0.4) mx = mz = 0 }    // 没丧尸：回原位
      const md = Math.hypot(mx, mz); let moving = false;
      if (md > 0.05) {
        /* 被墙、东西挡住就试着斜着走（左右各转 50°、100°），免得卡在角落里 */
        const st = sp * dt, ux = mx / md, uz = mz / md;
        for (const a of [0, 0.87, -0.87, 1.75, -1.75]) {
          const c = Math.cos(a), sn = Math.sin(a), dx = ux * c - uz * sn, dz = ux * sn + uz * c, q = { x: gp.x + dx * st, z: gp.z + dz * st };
          if (ctx.collide) ctx.collide(q);
          if (Math.hypot(q.x - gp.x, q.z - gp.z) > st * 0.6 || a === -1.75) { gp.x = q.x; gp.z = q.z; break }
        }
        moving = true; if (!best || bd > range) g.m.rotation.y = Math.atan2(mx, mz);
      }
      g.cd -= dt;
      if (best && bd < range) {
        g.m.rotation.y = Math.atan2(best.m.position.x - gp.x, best.m.position.z - gp.z);
        if (g.cd <= 0) { if (g.gun) { g.cd = g.gun.rate; const m = g.m; burst(() => ctx.muzzleOf(m), best, g.gun.dmg, 'guard', true) }
          else { g.cd = STAFF.guard.rate; const z = best, atk = g.atk; bullet(gp.clone().setY(1.1), z.m.position.clone().setY(1), 'guard', () => hurt(z, atk, true), z) } }
      }
      ctx.animH(g.m, clock, moving ? 2.8 : 0); if (g.gun && ctx.aimArms) ctx.aimArms(g.m);
    }
    if (run.hurtT > TD.player.regenDelay) run.hp = Math.min(run.hs.hp, run.hp + (inStore ? TD.player.safeRegen : TD.player.regen) * dt);
    /* ---------- 修路障：站在旁边 ---------- */
    if (run.bar < TD.barricade.hp && Math.hypot(P.pos.x - BARRICADE.x, P.pos.z - BARRICADE.z) < 1.8) { run.bar = Math.min(TD.barricade.hp, run.bar + TD.barricade.hp / TD.barricade.repair * dt); run.repairing = true } else run.repairing = false;
    W.setBarricade(true, run.bar / TD.barricade.hp);
    /* ---------- 塔 ---------- */
    for (const f of W.towers) if (f && f.aim && f.wantYaw != null) { let d = f.wantYaw - f.aim.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); f.aim.rotation.y += Math.sign(d) * Math.min(Math.abs(d), dt * 9)
      f.rc = (f.rc || 0) * Math.exp(-dt * 30); const y = f.aim.rotation.y; f.aim.position.x = -Math.sin(y) * f.rc; f.aim.position.z = -Math.cos(y) * f.rc }   // V1.21 开枪往后坐一下，很快弹回
    S.towers.forEach((t, i) => {
      if (!t || t.lv < 1) return; /* lv 0：还在建 */ run.towerCd[i] -= dt; if (run.towerCd[i] > 0) return;
      const T = TOWERS[t.k], st = T.lv[t.lv], [x, z] = TOWER_SPOTS[i], here = tmp.set(x, 0, z).clone(), f = W.towers[i];
      const inR = alive().filter(e => Math.hypot(e.m.position.x - x, e.m.position.z - z) < st.range);
      if (!inR.length) return;
      run.towerCd[i] = st.rate;
      const top = here.clone().setY(f && f.g ? f.g.userData.top : 2);
      if (t.k === 'slow') { let nf = 0; for (const e of inR) { e.slow = Math.max(e.slow, st.slow); e.slowT = 1.3; hurt(e, st.dmg);
          if (nf < 4 && Math.random() < 0.5 && ++nf) { const fl = sprite('flake', 0.45); fl.position.copy(e.m.position).setY(1.6 + Math.random() * 0.5); scene.add(fl); run.fx.push({ o: fl, life: 0.7, max: 0.7, kind: 'flake', own: true }) } }   // 被冻住的丧尸头上飘雪花
        /* 0.44 冰霜圈铺满范围、塔身冒冷气 */
        const fr = flat('frost', 1, true, 0.7); fr.position.set(x, 0.03, z); scene.add(fr); run.fx.push({ o: fr, life: 0.9, max: 0.9, kind: 'frost', own: true, R: st.range * 2 });
        for (let q = 0; q < 2; q++) { const a = Math.random() * Math.PI * 2, mi = sprite('mist', 0.8, true, 0xffffff, 0.8); mi.position.set(x + Math.cos(a) * 0.5, top.y * 0.8, z + Math.sin(a) * 0.5); scene.add(mi);
          run.fx.push({ o: mi, life: 0.9, max: 0.9, kind: 'mist', own: true, v: new THREE.Vector3(Math.cos(a) * 1.6, -0.6, Math.sin(a) * 1.6) }) }
        return }
      const tgt = t.k === 'sniper' ? inR.reduce((a, b) => (b.hp > a.hp ? b : a)) : inR.reduce((a, b) => (progress(b) > progress(a) ? b : a));
      if (f && f.aim) f.wantYaw = Math.atan2(tgt.m.position.x - x, tgt.m.position.z - z);   // 0.44 整座塔慢慢转过去（下面每帧转）
      const at = tgt.m.position.clone().setY(1);
      if (t.k === 'cannon') shell(top, at, st.dmg, st.splash);
      else if (t.k === 'gun') burst(() => top, tgt, st.dmg, 'gun', false, f);
      else { const dmg = st.dmg; bullet(top, at, 'sniper', () => hurt(tgt, dmg, true, 'hit big'), tgt); if (f) f.rc = 0.08 }   // V1.21 狙击：一颗又大又快的白金光弹，塔往后坐一下
    });
    /* ---------- 连射：每隔 BURST.gap 打一发；目标死了剩下的不打 ---------- */
    for (const b of run.bursts) { b.t -= dt; if (b.t > 0) continue; if (b.z.dead || b.z.gone) { b.n = 0; continue }
      const z = b.z, dmg = b.dmg, show = b.show && b.n === BURST.n ? b.dmg * BURST.n : false; bullet(b.fromFn(), z.m.position.clone().setY(1 + (Math.random() - 0.5) * 0.3), b.kind, () => hurt(z, dmg, show), z); if (b.tw) b.tw.rc = 0.05; b.n--; b.t = BURST.gap }
    run.bursts = run.bursts.filter(b => b.n > 0);
    /* ---------- 特效 ---------- */
    for (const f of run.fx) {
      f.life -= dt; const k = 1 - f.life / f.max;
      if (f.kind === 'shell') { f.o.position.lerpVectors(f.from, f.to, k); f.o.position.y += Math.sin(k * Math.PI) * 2.2; f.o.material.rotation += dt * 10;
        if (f.life <= 0) { for (const e of alive()) if (e.m.position.distanceTo(tmp.set(f.to.x, 0, f.to.z)) < f.splash) hurt(e, f.dmg); explode(f.to, Math.max(1.6, f.splash)) } }
      else if (f.kind === 'ring') { f.o.scale.setScalar(1 + k * (f.grow || 1)); f.o.material.opacity = 0.8 * (1 - k) }
      else if (f.kind === 'nade') { f.o.position.lerpVectors(f.from, f.to, k); f.o.position.y += Math.sin(k * Math.PI) * 3; f.o.rotation.x += dt * 12; if (f.life <= 0) boom(f.to) }
      else if (f.kind === 'line') f.o.material.opacity = Math.max(0, f.life / f.max);
      else if (f.kind === 'ex') { f.o.scale.setScalar(f.r0 + (f.r1 - f.r0) * (1 - Math.pow(1 - k, 3))); f.o.material.opacity = Math.max(0, 1 - k * k) }
      else if (f.kind === 'smoke') { f.o.scale.setScalar(f.r0 + (f.r1 - f.r0) * Math.min(1, k * 1.6)); f.o.position.y += f.vy * dt; f.o.material.opacity = 0.75 * Math.max(0, 1 - k) }
      else if (f.kind === 'chip') { f.v.y -= 18 * dt; f.o.position.addScaledVector(f.v, dt); if (f.o.position.y < 0.05) { f.o.position.y = 0.05; f.v.multiplyScalar(0.4) } f.o.rotation.x += dt * 14; if (f.own) f.o.material.opacity = 1 - k * k }
      else if (f.kind === 'scorch') f.o.material.opacity = 0.55 * Math.min(1, f.life / 1.2);
      else if (f.kind === 'fade') f.o.material.opacity = Math.max(0, 1 - k);
      else if (f.kind === 'exs') { f.o.scale.setScalar(f.r0 + (f.r1 - f.r0) * (1 - Math.pow(1 - k, 3))); f.o.material.opacity = Math.max(0, 1 - k * k) }
      else if (f.kind === 'smokes') { f.o.scale.setScalar(f.r0 + (f.r1 - f.r0) * Math.min(1, k * 1.6)); f.o.position.y += f.vy * dt; f.o.material.opacity = 0.8 * Math.min(1, k * 3) * Math.max(0, 1 - k); f.o.material.rotation += dt * 0.6 }   // 烟慢慢浮出来，别一下子盖住火球
      else if (f.kind === 'scorchs') f.o.material.opacity = 0.6 * Math.min(1, f.life / 1.2);
      else if (f.kind === 'frost') { f.o.scale.setScalar(f.R * (0.35 + 0.65 * (1 - Math.pow(1 - Math.min(1, k * 2.5), 2)))); f.o.material.opacity = 0.45 * Math.min(1, (1 - k) * 2.5) }
      else if (f.kind === 'mist') { f.o.position.addScaledVector(f.v, dt); f.o.scale.setScalar(0.8 + k * 1.6); f.o.material.opacity = 0.8 * (1 - k); f.o.material.rotation += dt }
      else if (f.kind === 'flake') { f.o.position.y += dt * 0.6; f.o.material.rotation += dt * 2; f.o.material.opacity = Math.min(1, (1 - k) * 2) }
      else if (f.kind === 'bul') {
        const z = f.z && !f.z.dead && !f.z.gone ? f.z : null; if (z) f.to.set(z.m.position.x, z.m.position.y + f.dy, z.m.position.z);
        const p = f.o.position, d = tmp.subVectors(f.to, p), dist = d.length(), st = f.B.sp * dt;
        if (dist <= st) { p.copy(f.to); f.life = 0;
          if (z) { f.onHit(); hitSpark(f.to, f.kd === 'sniper' ? 1.8 : 1); if (f.kd === 'sniper' && run.fx.length < 150) { const fl = sprite('flash', 0.9); fl.position.copy(f.to); scene.add(fl); run.fx.push({ o: fl, life: 0.08, max: 0.08, kind: 'fade', own: true }) } dust(f.to, 0.25) }   // 用户 10-18：打中不往后退、不闪白
          else dust(tmp.copy(f.to).setY(0.15), 0.4) }                                                                                // 没打着：地上一小团土
        else { p.addScaledVector(d, st / dist); faceAlong(f.o, d, camera);
          if (f.kd === 'sniper') { f.trail += st; if (f.trail > 0.6 && run.fx.length < 150) { f.trail = 0; const sm = sprite('smoke', 0.15, false, 0xe8e4dc, 0.6); sm.position.copy(p); scene.add(sm); run.fx.push({ o: sm, life: 0.25, max: 0.25, kind: 'fade', own: true }) } } } }
      else if (f.kind === 'case') { const o = f.o; f.v.y -= 18 * dt; o.position.addScaledVector(f.v, dt); o.rotation.x += f.sp * dt; o.rotation.z += f.sp * 0.6 * dt;
        if (o.position.y < 0.02) { o.position.y = 0.02; if (f.bounce < 2) { f.v.y = Math.abs(f.v.y) * 0.35; f.v.x *= 0.5; f.v.z *= 0.5; f.sp *= 0.5; f.bounce++ } else { f.v.set(0, 0, 0); f.sp = 0; o.rotation.x = Math.PI / 2 } }
        if (f.life < 0.3) o.scale.setScalar(Math.max(0.01, f.life / 0.3) * f.big) }
      else if (f.kind === 'bullet') { const k2 = Math.min(1, k); f.o.position.lerpVectors(f.from, f.to, k2); f.o.scale.z = Math.max(0.01, Math.min(1, k2 * f.d / 0.6));   // 刚出枪口拖尾短，飞起来拉长
        if (f.life <= 0) { f.onHit(); hitSpark(f.to) } }
      if (f.life <= 0 && f.pool) { scene.remove(f.o); f.pool.push(f.o); continue }
      if (f.life <= 0) { scene.remove(f.o); f.o.isSprite || SHARED_GEO.has(f.o.geometry) || f.o.geometry.dispose(); if (f.own || f.kind === 'ex' || f.kind === 'smoke' || f.kind === 'scorch') f.o.material.dispose() }
    }
    run.fx = run.fx.filter(f => f.life > 0);
    /* ---------- 掉的末日币：走过去捡 ---------- */
    /* 0.18 用户：掉在门外马路上的捡不到 → 自动拾取：掉出来停 0.8 秒，然后自己飞到主角身上 */
    for (const d of run.drops) { d.t += dt; d.c.rotation.y += dt * 6;
      if (d.t < 0.8) d.c.position.y = 0.4 + Math.sin(d.t * 4) * 0.08;
      else { const dx = P.pos.x - d.c.position.x, dz = P.pos.z - d.c.position.z, dd = Math.hypot(dx, dz), st = Math.min(dd, (8 + (d.t - 0.8) * 30) * dt);
        if (dd > 0.01) { d.c.position.x += dx / dd * st; d.c.position.z += dz / dd * st } d.c.position.y = 0.4 + Math.min(1.2, dd * 0.15) }
      if (Math.hypot(d.c.position.x - P.pos.x, d.c.position.z - P.pos.z) < 1.3) { S.coins += d.n; S.st.earned += d.n; run.coins += d.n; UI.floatText(d.c.position.clone().setY(1.6), `+$${d.n}`, 'coin'); scene.remove(d.c); d.got = true } }
    run.drops = run.drops.filter(d => !d.got);
    /* ---------- 输赢 ---------- */
    if (run.line <= 0) return finish(false, '防线被突破了');
    if (run.hp <= 0) return finish(false, '你倒下了');
    if (run.wi === run.waves.length - 1 && !run.queue.length && !run.pend.length && !alive().length && !run.zs.length) return finish(true);
  }

  function finish(win, why, quit = false) {
    const S = ctx.S(), r = L.tdEnd(S, run.lv, win, quit);
    run.over = true;
    for (const z of run.zs) putBack(z); for (const f of run.fx) { scene.remove(f.o); if (f.own) f.o.material.dispose() } for (const d of run.drops) scene.remove(d.c);
    W.setBarricade(false);
    for (const g of run.guards) { g.m.rotation.x = 0; g.m.position.y = 0 }          // 倒下的站起来（打完照常干活）
    const res = { win, why, lv: run.lv, ...r, kills: run.kills, picked: run.coins, guards: run.guards.map(g => ({ id: g.id, hp: g.hp, max: g.max, down: g.down })) };
    run = null; ctx.onEnd(res);
  }
  function quit() { if (run) finish(false, '撤退了', true) }   // V1.01：撤退不给奖励
  const hud = () => run && { lv: run.lv, wave: run.wi + 1, waves: run.waves.length, line: run.line, hp: run.hp, bar: run.bar, speed: run.speed, kills: run.kills, repairing: run.repairing, gcd: Math.max(0, run.gcd || 0), gcdMax: run.hs.nadeCd, hpMax: run.hs.hp, left: run.queue.length + run.pend.length + alive().length + run.waves.slice(run.wi + 1).reduce((a, w) => a + w.length, 0) };
  return { start, update, quit, hud, throwNade, active: () => !!run, zn: () => run ? run.zs.filter(z => !z.dead).length : 0, _explode: (x, z, r) => explode({ x, z }, r), _fx: () => { explode({ x: -8.4, z: -1.6 }, 2); tracer(new THREE.Vector3(-4.8, 2.4, 1), new THREE.Vector3(-1, 1, -1.6), 'sniper'); shell(new THREE.Vector3(-8.4, 2, -4.2), new THREE.Vector3(-5, 0.5, -1.6), 0, 1); muzzle(new THREE.Vector3(-12, 1.8, -4.2), 1.2); const fr = flat('frost', 9, true, 0.7); fr.position.set(-4.8, 0.03, -4.2); scene.add(fr); run.fx.push({ o: fr, life: 0.9, max: 0.9, kind: 'frost', own: true, R: 9 }) }, aimYaw: () => run && run.aim ? run.aim.yaw : null, _run: () => run, setSpeed: s => { if (run) run.speed = s } };
}
