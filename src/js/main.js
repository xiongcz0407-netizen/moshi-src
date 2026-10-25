/* ================= 主程序：把逻辑、场景、界面接起来 ================= */
import * as THREE from 'three';
import { A, loadGLB, netStat, startLazy } from './assets.js';
import * as AD from './assetdb.js';   /* 设计 75：手机里的资源库 */
import { ASSET, mbT } from './assetboot.js';   /* 设计 75：开局检查（boot.js 先跑完才读 main.js） */   // 设计 38：要最先读（给所有读取网址加 hash）
import * as L from './logic.js';
import * as M from './models.js';
import * as SV from './save.js';
import * as UI from './ui.js';
import * as CHAT from './chat.js';
import { setGfxHigh } from './groundfx.js';
import { createWorld, collide, inYard, STREET, PILE_POS, WS_AREA, REC_POS, START_POS, TRUCK_POS, SPAWN_POS, YARD, GATE, SIDE_GATE, REG_POS, GH_AREA, ORCH_AREA, PLOT_POS, TREE_POS, STORE, AISLE_Z, C_DOOR_OUT, C_DOOR_IN, lineSlot, REG_DIR, CAM_X, CAM_Z, PORTAL_POS, WH_POS, ALARM_POS, DOCK_POS, MERCH_POS, TOWER_SPOTS, DORM_AREA, FIRE_POS, POND_LOT, FISHPOND_SIZE, CAMP_C, GUARD_SPOTS , SMITH_POS } from './world.js';
import { createFarmView } from './farmview.js';
import { initInput, moveDir } from './input.js';
import { addFlat, setFlatZombie } from './flatshadow.js';
import { loadChars, loadHeroMain, upgradeHero, charsReady, makeChar, animChar, ZOMBIE_POSE, setLook, portraits, PORTRAIT, syncBlobs, setAnimView } from './chars.js';
import { hero2Expr, initHero2Env, CLOSEUP_YAW, outfitThumbs, heroPortrait, hero2Ready, makeShowcase, fixLookSex } from './hero2.js';
const face = (n, sec) => { if (player && player.userData.h2M) hero2Expr(player.userData.h2M, n, sec) };   // V1.31 男主角表情（设计 18c）
import { LOOK, defaultLook, cleanLook } from './look.js';
import { openCreator } from './creator.js';
import { HELP } from './help.js';
import * as LY from './layout.js';
import { createTD } from './td.js';
import { createFB, FB_ERR } from './fb.js';
import { createPortal, glowTex, glowSprite } from './portal.js';
import * as FL from './fblogic.js';
import { FB_PANELS, FB_TITLES, setSwapFx } from './fbui.js';
import * as RFX from './refinefx.js';
import { makeAura, auraTier } from './heroaura.js';   /* 设计 85：角色页人物的套装光效 */   /* 设计 80：炼宝敲打特效 */
import { FB, CRYSTAL, BOSSES, ITEMS, SKILLS, LEG_SWAP } from './fbcfg.js';
import { penFront, PASTURE, PENS } from './ranch.js';
import { createNav } from './staffnav.js';
import { createScav, SAFE_R } from './scav.js';
import { createFishing, FZONES, zoneAt } from './fishing.js';
import * as FG from './fishgame.js';
import { loadM16, makeM16, M16_TIP } from './m16.js';
import { drawAvatar, loadAvatar } from './avatar.js';
import { loadProps, loadLateProps, propJobCount, prop, fishPropsReady } from './props.js';
import { showTitle, briefOf } from './title.js';
import { FREE, GEAR, FERT, STAFF, STAFF_JOBS, SCAV, JUNK, JUNK_IDS, GOOD_IDS, TREASURE_IDS, GOODS, TREASURE, BUILD, BUILD_ORDER, BAG_SIZES, ZOMBIE, PLAYER, AUTOSAVE, OFFLINE_CAP, SHOP, STORE as STORE_LV, FIXTURE, TIER_NAME, TD, TOWERS, FISH, FISH_RAR, FISHING, HERO, GUARD_GUN, tdName, RANCH, RANCH_IDS, PEN_CAP, STAR, FEED, WS_IDS, WS, MACH, DISHES } from './config.js';
import { APP_V } from './version.js';
import { PERF, perfOpt, perfFrame, setPerfOn, perfStats, PERF_LOAD, PERF_X } from './perf.js';
import { makeShadowCache, farTick, noCast, layerGround } from './groundfx.js';

const { $ } = UI;
const itemName = t => L.isSeed(t) ? GOODS[L.seedCrop(t)].name + '种子' : L.isFish(t) ? FISH[L.fishOf(t)].name : JUNK[t].name;
let S = null;                                    // 当前存档
const W = createWorld($('#cv'));
const FV = createFarmView(W);
const { scene, camera, renderer } = W;
const SSH = perfOpt('sshadow'), shCache = makeShadowCache(renderer);   // 设计 57：影子只画一次
initHero2Env(renderer);   // V1.31 男主角的环境反射（只给主角用）
initInput($('#app'));

/* ---------- 尺寸 ---------- */
/* 画面尺寸：iOS 从主屏幕打开（全屏模式）横屏时 innerHeight 会比屏幕矮一截，底下露出黑边；
   全屏模式下按屏幕实际高度算，再写进 --appH；转屏、地址栏收起后过一会儿再算一次 */
function viewH() {
  let h = innerHeight; const vv = window.visualViewport; if (vv) h = Math.max(h, Math.round(vv.height));
  const full = navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches);
  if (full && screen.width && screen.height) { const sh = innerWidth > innerHeight ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height); if (sh > h && sh - h < 140) h = sh }
  return h;
}
let lastWH = '', scrH = innerHeight;
function resize() { const w = innerWidth, h = viewH(); if (lastWH === w + 'x' + h) return; lastWH = w + 'x' + h; scrH = h; document.documentElement.style.setProperty('--appH', h + 'px'); W.resize(w, h); UI.setSize(w, h) }
const resizeSoon = () => { resize(); setTimeout(resize, 120); setTimeout(resize, 500) };
addEventListener('resize', resizeSoon); addEventListener('orientationchange', resizeSoon); if (window.visualViewport) visualViewport.addEventListener('resize', resizeSoon); resize();

/* ---------- 人物：有 Kenney 模型就用模型，加载失败就退回方块人 ---------- */
const mkHuman = (kind, idx, opts) => charsReady() ? makeChar(kind, idx) : M.human(opts);
const animH = (g, t, sp) => g.userData.mixer ? animChar(g, t, sp) : M.animHuman(g, t, Math.abs(sp));   // 设计 64：负速度 = 倒着走

/* ---------- 主角 ---------- */
let player = null;
const P = { pos: new THREE.Vector3(), vel: new THREE.Vector2(), kb: new THREE.Vector2(), inv: 0, face: 0 };
P.pos.copy(START_POS);

/* ---------- 丧尸 ---------- */
const zombies = [];
const zSkins = [0x8fae7a, 0x9bb08a, 0x7f9f70, 0xa3b38f];
function spawnActors() {
  player = mkHuman('player', 0, { shirt: 0xd9822b, pants: 0x34404f, pack: true });
  player.position.copy(P.pos); P.pos = player.position; scene.add(player);
  for (let i = 0; i < SCAV.zombies; i++) {
    const m = mkHuman('zombie', i, { skin: zSkins[i % 4], shirt: [0x5a5f6a, 0x6b4a3a, 0x4a5a4a, 0x7a6a5a][i % 4], pants: 0x3a3a3a, hair: 0x2a2a2a, zombie: true });
    SC.scene.add(m);                     // 丧尸只在拾荒区（院子门外的马路现在只给尸潮走）
    zombies.push({ m, pos: m.position, mode: 'wander', tgt: null, rest: 0, cd: 0 });
  }
}
/* ---------- 拾荒区：单独一张地图（scav.js），每次进去随机生成；货车进出 ---------- */
const SC = createScav();
let map = null, inScav = false, cur = scene, scavBusy = false;
/* ---------- 钓鱼区（fishing.js）：坐船去，一张固定的小地图，没有丧尸 ---------- */
const FI = createFishing();
let inFish = false;
const away = () => inScav || inFish;                 // 不在超市（拾荒区或钓鱼区）
const spotOf = [];                               // 第 i 个物资刷新位，这一趟放在拾荒区的哪里
const rnd = (a, b) => a + Math.random() * (b - a);

/* ---------- 地上的物资 ---------- */
const spawnMeshes = [], spawnKeys = [];
const dropMeshes = new Map();
/* 院子门口马路上的铁罐、塑料瓶：固定的刷新点 */
const streetMeshes = SPAWN_POS.map(() => null), streetKeys = SPAWN_POS.map(() => '');
function syncStreet() {
  S.street.forEach((s, i) => { if (i >= SPAWN_POS.length) return;
    const k = s.t || ''; if (k === streetKeys[i]) return; streetKeys[i] = k;
    if (streetMeshes[i]) { scene.remove(streetMeshes[i]); streetMeshes[i] = null }
    if (s.t) { const m = M.pickupMesh(s.t); m.position.set(SPAWN_POS[i][0], 0, SPAWN_POS[i][1]); scene.add(m); streetMeshes[i] = m } });
}
/* 拾荒区里的：刷新出来的物资放到这张图上随机的空地（离主角、离别的物资远一点） */
function syncPickups() {
  syncStreet();
  if (!inScav) { clearPickups(); return }
  const nSlots = L.scavSlots(S);
  S.spawns.forEach((s, i) => {
    const k = i < nSlots && s.t || ''; if (k === spawnKeys[i]) return; spawnKeys[i] = k;
    if (spawnMeshes[i]) { SC.scene.remove(spawnMeshes[i]); spawnMeshes[i] = null }
    if (k) {
      const avoid = [[P.pos.x, P.pos.z], ...spotOf.filter((_, j) => j !== i && S.spawns[j] && S.spawns[j].t)];
      spotOf[i] = map.spot(avoid, 3);
      const m = M.pickupMesh(s.t); m.position.set(spotOf[i][0], 0, spotOf[i][1]); SC.scene.add(m); spawnMeshes[i] = m }
  });
  const live = new Set(S.drops);
  for (const [d, m] of dropMeshes) if (!live.has(d)) { SC.scene.remove(m); dropMeshes.delete(d) }
  for (const d of S.drops) if (!dropMeshes.has(d)) { const m = M.pickupMesh(d.t, true); m.position.set(d.x, 0, d.z); SC.scene.add(m); dropMeshes.set(d, m) }
}
function clearPickups() {
  spawnMeshes.forEach((m, i) => { if (m) SC.scene.remove(m); spawnMeshes[i] = null; spawnKeys[i] = '' });
  for (const [, m] of dropMeshes) SC.scene.remove(m); dropMeshes.clear();
}
/* 飞向某处的小物件（捡起、投入回收机） */
const flyers = [];
function fly(t, from, to, done) { const m = noCast(M.junkMesh(t)); m.position.copy(from); cur.add(m); flyers.push({ m, sc: cur, from: from.clone(), to, t: 0, done }) }
function updFlyers(dt) {
  for (let i = flyers.length - 1; i >= 0; i--) { const f = flyers[i]; f.t += dt / 0.35; const k = Math.min(1, f.t), to = typeof f.to === 'function' ? f.to() : f.to;
    f.m.position.lerpVectors(f.from, to, k); f.m.position.y += Math.sin(k * Math.PI) * 1.6; f.m.scale.setScalar(1 - k * 0.5);
    if (k >= 1) { f.sc.remove(f.m); flyers.splice(i, 1); f.done && f.done() } }
}

/* ---------- 标签 ---------- */
const recTop = REC_POS.clone().setY(4.2);
const recLab = UI.label(() => recTop);   // 0.44 用户：营地的建造台去掉了（头顶的建造进度牌也一起去掉）
const shelfLabs = Array.from({ length: LY.SHELF_N }, (_, i) => { const p = new THREE.Vector3(); return UI.label(() => { const l = lay ? lay.l[i] : S.layout[i]; if (!l) return p.set(0, -50, 0); const w = LY.shelfWorld(l); return p.set(w.x, S.shelves[i] && S.shelves[i].type === 'shelf' ? 2.7 : 2.4, w.z) }, 'dim', 'main', { zone: 'store', hold: 1500 }) });   // 设计 69：进了超市才显示；「缺货」变没了也先留 1.5 秒（补货、卖掉在两边来回跳时不闪）
const regTop = REG_POS.clone().setY(2.3), regLab = UI.label(() => regTop.set(REG_POS.x, 2.3, REG_POS.z));   // 收银台能挪：每次取最新位置
const ghTop = new THREE.Vector3((GH_AREA.x0 + GH_AREA.x1) / 2, 3.4, GH_AREA.z0 + 0.6), ghLab = UI.label(() => ghTop);
const playerTop = new THREE.Vector3();
const playerLab = UI.label(() => playerTop.copy(P.pos).setY(2.3), '', 'any', { always: true });
const truckTop = TRUCK_POS.clone().setY(2.2).setZ(TRUCK_POS.z + 1.5), truckLab = UI.label(() => truckTop);
const dockTop = DOCK_POS.clone().setY(2), dockLab = UI.label(() => dockTop, '', 'main', { r: 4 }), merchTop = MERCH_POS.clone().setY(2.5), merchLab = UI.label(() => merchTop);
const fBoatTop = new THREE.Vector3(), fBoatLab = UI.label(() => fBoatTop.set(FI.boatAt.x, 2.2, FI.boatAt.z), '', 'fish');
const fMerchTop = new THREE.Vector3(), fMerchLab = UI.label(() => FI.merchant ? fMerchTop.set(FI.merchant.x, 2.5, FI.merchant.z) : fMerchTop.set(0, -50, 0), '', 'fish');
const fSpotLabs = FZONES.map(Z => { const v = new THREE.Vector3(Z.lab[0], 1.1, Z.lab[1]); return UI.label(() => v, 'dim', 'fish') });
const scavTruckTop = new THREE.Vector3(), scavTruckLab = UI.label(() => scavTruckTop.copy(map ? map.truck : P.pos).setY(3.2), '', 'scav');

/* ---------- 顾客（画面）：从院子南边小门进来 → 进店挑货 → 收银台排队 → 结账后离开 ----------
   买卖在逻辑里（L.customer / L.checkout）；这里只负责让人走到对应的位置。顾客不会去废街。 */
const customers = new Map();                 // id → 画面里的顾客
let tempId = -1;                             // 没买到东西、只是进来看看的顾客（逻辑里没有记录）
const cSkins = [0xe0b48c, 0xc99a6e, 0xf0c8a0, 0xa87a55], cShirts = [0x4a7ab0, 0x9a4a6a, 0x5a8a5a, 0xb08a3a, 0x7a5aa0, 0x3a8a8a];
const V = (x, z) => new THREE.Vector3(x, 0, z);
const C_SPAWN = V((SIDE_GATE.x0 + SIDE_GATE.x1) / 2, YARD.z1 + 2.5), C_GATE = V((SIDE_GATE.x0 + SIDE_GATE.x1) / 2, YARD.z1 - 1.2);
const C_TURN = V((SIDE_GATE.x0 + SIDE_GATE.x1) / 2, AISLE_Z);         // 从小门往北走到超市门口那条路
/* 店里怎么走：按「布置」后的货架位置在网格上找路（layout.js） */
const walk = () => LY.walkGrid(S.layout, S.shelves.length);
const gridPath = (from, to) => LY.findPath(walk(), from, to).map(([x, z]) => V(x, z));
const cellOf = p => LY.toCell(p.x, p.z);
/* 0.31 用户：店面扩大（超市 3 级）以后顾客走南门（从南边小门进院子，走南门近得多）；小店面还是走东门 */
const useSouth = () => false;   // 0.42 用户：顾客还是走东门（超市不再扩大店面，南边是工坊）
const sDoorPts = () => { const [c, r] = LY.sDoorCell(), x = LY.cx(c), z = LY.cz(r) + LY.G.cell / 2 + 0.9; return [V(C_GATE.x, z), V(x, z), V(x, z - 0.9)] };   // 院子里：小门往北 → 往西到南门外 → 门口
const doorCell = () => useSouth() ? LY.sDoorCell() : LY.DOOR_CELL;
const inRoute = () => useSouth() ? [C_GATE, ...sDoorPts()] : [C_GATE, C_TURN, C_DOOR_OUT, C_DOOR_IN];
function shelfPts(i, more) { const s = S.layout[i]; if (i == null || i < 0 || !s) return gridPath(doorCell(), LY.toCell(STORE.x1 - 3, AISLE_Z));
  const out = gridPath(doorCell(), LY.frontCell(s)); let at = LY.frontCell(s);
  for (const k of more || []) { const t = S.layout[k]; if (!t) continue; const f = LY.frontCell(t); out.push(...gridPath(at, f)); at = f }   // 设计 45：这个货柜拿空了，接着去下一个
  return out }
const lastShelf = e => e && e.more && e.more.length ? e.more[e.more.length - 1] : e && e.shelf;
const pathLen = (from, pts) => { let d = 0, a = from; for (const b of pts) { d += a.distanceTo(b); a = b } return d };
function exitPts(p) { const inStore = p.x < STORE.x1 && p.z < LY.cz(LY.sDoorCell()[1]) + 0.5;
  if (useSouth()) { const o = sDoorPts().reverse(); return [...(inStore ? gridPath(cellOf(p), LY.sDoorCell()) : []), ...o, C_GATE, C_SPAWN] }
  return [...(inStore ? [...gridPath(cellOf(p), LY.DOOR_CELL), C_DOOR_IN] : []), C_DOOR_OUT, C_TURN, C_GATE, C_SPAWN] }
function newCust(id, at, pts, mode, e) {
  const m = mkHuman('cust', Math.floor(Math.random() * 12), { skin: cSkins[Math.abs(id) % 4], shirt: cShirts[Math.floor(Math.random() * 6)], pants: 0x3d3d48 });
  m.position.copy(at); scene.add(m);
  const c = { id, m, pts, i: 0, mode, e, wait: 0, sp: 3.2 }; customers.set(id, c); return c;
}
/* 逻辑里来了一位顾客 */
function custArrive(e) {
  if ([...customers.values()].filter(c => c.mode !== 'out').length >= 12) return;   // 正在离开的不算（院子变大，走出去要好几秒）
  if (!e.ok) { const c = newCust(tempId--, C_SPAWN, [...inRoute(), ...shelfPts(-1)], 'browse', e); return }
  const pts = [...inRoute(), ...shelfPts(e.shelf, e.more)], c = newCust(e.id, C_SPAWN, pts, 'shop', e);
  c.sp = Math.max(3.2, pathLen(C_SPAWN, pts) / (SHOP.shopTime - 2.5));      // 走快一点，保证在挑完货之前走到货架
}
/* 读档后：店里已经有的顾客直接放到位置上 */
function custSync() {
  S.shoppers.forEach(c => { if (!customers.has(c.id)) newCust(c.id, inRoute().slice(-1)[0].clone(), shelfPts(c.shelf, c.more), 'shop', c) });
  S.queue.forEach((c, k) => { if (!customers.has(c.id)) newCust(c.id, lineSlot(k), [], 'line', c) });
}
function custLeave(id, txt, cls) {
  const c = customers.get(id); if (!c || c.mode === 'out') return;
  if (txt) UI.floatText(c.m.position.clone().setY(2.4), txt, cls);
  c.mode = 'out'; c.pts = exitPts(c.m.position); c.i = 0; c.wait = 0; c.sp = 3.4;
}
function updCustomers(dt, t) {
  const qIdx = new Map(S.queue.map((c, k) => [c.id, k]));
  for (const [id, c] of customers) {
    const p = c.m.position;
    /* 逻辑里已经排上队了：去对应的排队位置 */
    if (qIdx.has(id) && (c.mode === 'shop' || c.mode === 'line')) {
      const slot = lineSlot(qIdx.get(id));
      if (c.mode === 'shop' && c.i >= c.pts.length) { c.mode = 'line'; c.pts = [...gridPath(cellOf(p), cellOf(slot)), slot]; c.i = 0; c.sp = 3.2 }
      else if (c.mode === 'line') { const last = c.pts[c.pts.length - 1]; if (!last || last.distanceTo(slot) > 0.05) { c.pts = [slot]; c.i = 0 } }
    }
    if (c.wait > 0) { c.wait -= dt; animH(c.m, t, 0); continue }
    const tgt = c.pts[c.i];
    if (!tgt) {                                        // 走到头了
      if (c.mode === 'out') { scene.remove(c.m); customers.delete(id); continue }
      if (c.mode === 'browse') { UI.floatText(p.clone().setY(2.4), `没有${GOODS[c.e.g].name}…`, 'bad'); custLeave(id); c.wait = 0.8; continue }
      if (c.mode === 'line') { c.m.rotation.y = Math.atan2(-REG_DIR.x, -REG_DIR.z) }          // 面朝收银台
      animH(c.m, t, 0); continue;
    }
    const dx = tgt.x - p.x, dz = tgt.z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.08) { c.i++; if (c.mode === 'shop' && c.i >= c.pts.length) { const w = S.layout[lastShelf(c.e)] && LY.shelfWorld(S.layout[lastShelf(c.e)]); if (w) c.m.rotation.y = Math.atan2(w.x - p.x, w.z - p.z) } continue }
    const st = Math.min(d, c.sp * dt); p.x += dx / d * st; p.z += dz / d * st;
    c.m.rotation.y = Math.atan2(dx, dz); animH(c.m, t, c.sp);
  }
  /* 只有排第一个、而且真的走到收银台前的顾客才能结账（你和收银员都一样） */
  const s0 = lineSlot(0);
  S.queue.forEach((q, k) => { const c = customers.get(q.id); q.ready = k === 0 && (!c || (c.mode === 'line' && Math.hypot(c.m.position.x - s0.x, c.m.position.z - s0.z) < 0.3)) });
}

/* ---------- 事件 → 画面效果 ---------- */
function handleEvents(ev) {
  const ft = FBV.active() ? () => {} : UI.floatText;   // 设计 84：打副本时超市那边的飘字（+1 罐头、3倍！）不显示
  for (const e of ev) {
    if (e.type === 'rec') {
      if (!away()) W.recycler.onRec(e);
      const p = recTop.clone().setY(2.6);
      const sk = FBV.active() ? () => {} : a => { shake = a };   // 设计 97：副本里超市暴击不晃镜头
      if (e.kind === 'gem') { UI.big('变宝！', `${JUNK[e.t].name} → ${TREASURE[e.id].name}`, 'gem'); ft(p, TREASURE[e.id].name, 'gem'); sk(0.35) }
      else if (e.kind === 'x10') { UI.big('暴击 ×10', `+10 ${GOODS[e.id].name}`, 'x10'); ft(p, `×10 ${GOODS[e.id].name}`, 'x10'); sk(0.25) }
      else if (e.kind === 'x3') ft(p, `3倍！+3 ${GOODS[e.id].name}`, 'x3');
      else ft(p, `+1 ${GOODS[e.id].name}`);
    } else if (e.type === 'staffJoin') { UI.toast(`营地空出位置，${e.name}住进来了`, 'good', 4500); SV.saveNow()   // 设计 60
    } else if (e.type === 'crafted' && e.x > 1) { UI.critLine(e.k, e.line); if (!away()) { const it = W.wsItems[e.k]; if (it) ft(it.g.position.clone().setY((it.top || 2.4) + 1.2), `暴击 ×${e.x}！`, 'crit') } }   // 37：金色「暴击 ×2！/×3！」，工坊面板那条线闪一下   // V1.01 工坊倍率、暴击
    else if (e.type === 'ranchLuck' && !away()) ft(penFront(e.k).clone().setY(2.4), `暴击 ×${e.x}！`, 'crit');
    else if (e.type === 'cust') custArrive(e);
    else if (e.type === 'angry') custLeave(e.id, '等太久了…', 'bad');
    else if (e.type === 'full') { if (clock - fullShopWarn > 20 && !nearReg && !L.hasCashier(S)) { fullShopWarn = clock; UI.toast('收银台排满了，快回去结账', 'bad') } }
    else if (e.type === 'built' && FIXTURE[e.k]) UI.toast('新货柜已经摆进店里的空位了，想换地方就在店里点「布置」', 'good', 4000);
    if (e.type === 'mysCome') { UI.big('神秘商人来了！', '去院子里找他，交货给大价钱', 'gem'); UI.msg(S, '神秘商人来了：去院子里找他，交货给大价钱（他不收到货不走）', 'good'); SV.saveNow() }
    if (e.type === 'built') face('happy', 1);
    if (e.type === 'built') { const b = BUILD[e.k];
      if (e.k === 'tower') { const t = S.towers[e.i], nm = t ? TOWERS[t.k].name : ''; if (e.to === 1) { UI.big('塔建好了', nm, 'built'); UI.msg(S, `塔建好了：${nm}（${e.i + 1} 号塔位）`, 'good') } else { UI.big('塔升级完成', `${nm} ${e.to} 级`, 'built'); UI.msg(S, `塔升级完成：${nm} ${e.to} 级`, 'good') } }
      else if (e.k === 'tier') { const sh = S.shelves[e.i]; UI.big('货柜升档', `${FIXTURE[sh.type].tiers[e.to - 1]}（${TIER_NAME[e.to]}）`, 'built'); UI.msg(S, `货柜升档完成：${FIXTURE[sh.type].tiers[e.to - 1]}`, 'good') }
      else { const bt = e.k === 'store' ? '超市升级！' : '建造完成', bs = e.k === 'store' ? `${STORE_LV[e.to].name}（${e.to} 级）${e.to === 3 ? '　工坊开放了' : ''}` : `${b.name} ${e.k === 'bag' ? BAG_SIZES[e.to] : e.to} ${b.unit}`; UI.big(bt, bs, 'built'); UI.msg(S, `${bt}${bs}`, 'good') }
      if (e.k === 'store' && e.to === FB.store) { const tx = '铁匠来了：炼宝、传说转换找他（传送门旁边）'; setTimeout(() => { UI.toast(tx, 'good', 5000); UI.msg(S, tx, 'good') }, 2200) }   /* 设计 107 */
      if (BUILD[e.k].ws && e.to === 1) { const tx = `${b.name}盖好了！${L.working(S, 'craft').length ? '工匠会来看着' : '在「员工」里给员工换成「工匠」，或者走进工坊自己做'}`; setTimeout(() => { UI.toast(tx, 'good', 4500); UI.msg(S, tx, 'good') }, 1600) }
      if (RANCH[e.k] && e.to === 1) { const tx = `${b.name}盖好了！去院子里的商人那里买${RANCH[e.k].name}${L.working(S, 'feed').length ? '' : '，再在「员工」里派一个人做「饲养」'}，才会产${GOODS[RANCH[e.k].good].name}`; UI.toast(tx, 'good', 6000); UI.msg(S, tx, 'good') }
      if (e.k === 'store') { const nu = GOOD_IDS.filter(g => (GOODS[g].unlock || 1) === e.to && !GOODS[g].ranch).map(g => GOODS[g].name).join('、'), nr = RANCH_IDS.filter(k => BUILD[k].levels[1].store === e.to).map(k => BUILD[k].name).join('、');
        { const tx = (e.to === 2 ? '解锁了温室和果蔬架。' : e.to === 3 ? `超市南边开放了露天工坊，东门换成了自动门！解锁了果园和冰柜，店面更大、能多放货柜。` : '') + (nu ? `新商品：${nu}，顾客会开始要了。` : '') + (nr ? `牧场能盖${nr}了（建造 → 牧场）。` : '') + '新的升级任务出现了'; UI.toast(tx, 'good', 6000); UI.msg(S, tx, 'good') } }
      SV.saveNow() }
    else if (e.type === 'task') { const tx = `任务完成：${e.name}　奖励 ${e.reward.coins ? e.reward.coins + ' 末日币' : '发条 ×' + e.reward.gear}`; UI.toast(tx, 'good', 3500); UI.msg(S, tx, 'good');
      if (e.all) UI.big('升级任务全部完成', '去「建造」把超市升一级', 'gem'); SV.saveNow() }
    else if (e.type === 'ripe') { if (clock - ripeWarn > 30 && !inFarm && !L.working(S, 'farm').length) { /* 有员工在种地就不提示（用户 10-13） */ ripeWarn = clock; UI.toast(`${GOODS[e.c].name}熟了，去收获`, 'good') } }
    else if (e.type === 'short') UI.msg(S, `现在涨价：${GOODS[e.g].name}，售价 ×1.5`, 'info');
    else if (e.type === 'scavGo') { /* 1 分钟一趟，出门不记消息 */ }
    else if (e.type === 'scavBack') { const p = staffById(e.id); if (p) scavMsg(p, e) }
    else if (e.type === 'fishBack') { const p = staffById(e.id); if (p) fishMsg(p, e) }
    else if (e.type === 'whLost') { whLostG.add(e.g); if (Date.now() - (S.whWarnAt || 0) > 600000) { S.whWarnAt = Date.now(); const names = [...whLostG].map(g => GOODS[g] ? GOODS[g].name : g).join('、'); whLostG.clear(); UI.msg(S, `仓库 ${names} 满了，员工带回来的放不下就丢了，升级仓库`, 'bad') } }   // 设计 41：每 10 分钟最多一次
    else if (e.type === 'needFeeder') UI.msg(S, `牧场有 ${e.n} 个动物棚没人喂：在「员工」里多派一个人做「饲养」（一个人管 4 个棚）`, 'bad');
    else if (e.type === 'noBait') { const p = staffById(e.id); if (p) UI.msg(S, `${p.name}没饵料了，钓鱼停着（去商人那里买饵，放进仓库就会接着去）`, 'bad') }
    else if (e.type === 'staffCheckout') { if (!away()) ft(regTop.clone().setY(2.2), `+$${e.c.pay}`, 'coin'); custLeave(e.c.id) }
    else if (e.type === 'staffFarm' && !away()) { const pos = e.what === 'tree' ? TREE_POS[e.i] : PLOT_POS[e.i]; if (pos && Math.hypot(P.pos.x - pos[0], P.pos.z - pos[1]) < 14) ft(new THREE.Vector3(pos[0], 1.3, pos[1]), e.what === 'plant' ? `种下${GOODS[e.c].name}` : `${e.x > 1 ? `暴击 ×${e.x}！` : ''}+${e.n} ${GOODS[e.c].name}`, e.what === 'plant' ? '' : e.x > 1 ? 'crit' : 'x3') }   // 七：员工收菜、摘果子暴击也飘金色字（floatText 里算发烫上限）
  }
}

/* 员工拾荒 2 分钟一趟：同一个人连着拾荒，消息合并成一条累计（「这几趟一共带回…」），不刷屏 */
function scavMsg(p, e) {
  const top = (S.msgs || [])[0], acc = top && top.scav === p.id && Date.now() - top.at0 < 30 * 60000 ? top.acc : null;
  const a = acc || { n: 0, junk: 0, seeds: 0, got: {} }; a.n++; a.junk += e.junk; a.seeds += e.seeds; for (const [g, n] of Object.entries(e.got || {})) a.got[g] = (a.got[g] || 0) + n;
  const parts = [a.junk ? `物资 ×${a.junk}（堆在货车旁）` : '', a.seeds ? `种子 ×${a.seeds}` : '', ...Object.entries(a.got).map(([g, n]) => GOODS[g] ? `${GOODS[g].name} ×${n}（进仓库）` : `${TREASURE[g] ? TREASURE[g].name : g} ×${n}`)].filter(Boolean);
  const x = `${p.name}拾荒${a.n > 1 ? ` ${a.n} 趟` : ''}带回：${parts.join('，') || '空手'}`;
  if (acc) { S.msgs.shift() }
  UI.msg(S, x, 'good'); const m = S.msgs[0]; if (m && m.x === x) { m.scav = p.id; m.acc = a; m.at0 = acc ? top.at0 : m.at }
}
/* 员工钓鱼 3 分钟一趟：同样合并成一条累计 */
function fishMsg(p, e) {
  const top = (S.msgs || [])[0], acc = top && top.fishP === p.id && Date.now() - top.at0 < 30 * 60000 ? top.acc : null;
  const a = acc || { n: 0, fish: 0, lost: 0 }; a.n++; a.fish += e.n; a.lost += e.lost;
  const x = `${p.name}钓鱼${a.n > 1 ? ` ${a.n} 趟` : ''}带回：鱼 ×${a.fish}（进${L.pondWhere(S)}）${a.lost ? `，${L.pondWhere(S)}放不下扔了 ${a.lost} 条` : ''}`;
  if (acc) S.msgs.shift();
  UI.msg(S, x, 'good'); const m = S.msgs[0]; if (m && m.x === x) { m.fishP = p.id; m.acc = a; m.at0 = acc ? top.at0 : m.at }
}
/* 消息框：每 2 秒看一次有没有新卖完的货、种地的员工有没有种子（只在变成这样的那一刻记一条） */
const soldOut = new Set(); let noSeedMsg = false, msgPolled = false;
function msgPoll() {
  const quiet = !msgPolled; msgPolled = true;          // 第一次只记下现状，不发消息（刚进游戏时本来就空着的不算「卖完了」）
  const onShelf = new Set(); S.shelves.forEach(sh => L.slotsOf(sh).forEach(sl => { if (sl.g) onShelf.add(sl.g) }));
  for (const g of onShelf) { const out = !L.onShelves(S, g) && !(S.stock[g] > 0);
    if (out && !soldOut.has(g)) { soldOut.add(g); if (!quiet) UI.msg(S, `${GOODS[g].name}卖完了，仓库里也没有了`, 'bad') } else if (!out) soldOut.delete(g) }
  const farm = L.working(S, 'farm').length && S.lv.gh, empty = S.plots.some(p => !p), none = !Object.values(S.seeds).some(n => n > 0);
  if (farm && empty && none) { if (!noSeedMsg) { noSeedMsg = true; if (!quiet) UI.msg(S, '没有种子了，种地的员工没法补种（去拾荒区捡种子袋）', 'bad') } } else noSeedMsg = false;
}

/* ---------- 操作（面板按钮） ---------- */
const actions = {
  sell: id => { if (L.sellTreasure(S, id)) UI.toast(`卖出 ${TREASURE[id].name} +${TREASURE[id].sell}`, 'good') },
  buyItem: a => { const [k, n] = a.split(':'), c = L.itemCost(k, +n); if (S.coins < c) { UI.toast('末日币不够', 'bad'); return } UI.ask(`花 <b>${c}</b> 末日币买 ${n} ${k === 'gear' ? '个发条' : '袋肥料'}？`, () => actions._buyItem(a)) },
  _buyItem: a => { const [k, n] = a.split(':'); if (L.buyItem(S, k, +n)) { UI.toast(`买了 ${n} ${k === 'gear' ? '个发条' : '袋肥料'}`, 'good'); SV.saveNow() } else UI.toast('末日币不够', 'bad') },
  freeGear: () => { if (L.freeGear(S, bjDay())) { UI.toast(`领到 ${FREE.star} 颗星星`, 'good'); SV.saveNow(); UI.refreshPanel(true); UI.updateHud(S) } },   // 设计 43：领完马上刷新（商店那一格、红点、商人头顶一起变）
  plotPlan: i => { L.cyclePlotPlan(S, +i); SV.saveNow() },
  perfWin: () => { setPerfOn(!PERF.on) },
  openGear: () => { UI.gst('gear').tab = 'eq'; UI.gst('gear').sel = null; UI.openPanel('gear') },   /* 设计 76：菜单「装备」：打开角色页，停在装备页签 */
  clearAssets: () => UI.ask('清掉手机里存的模型、图片，刷新后重新下载（存档不受影响）？', async () => { SV.saveNow(); await AD.clearLib(); location.reload() }, '清掉', true),   /* 设计 79：游戏里的确认框 */   /* 设计 75 */
  labNear: () => { labNear = !labNear; try { localStorage.setItem('ms_labNear', labNear ? '1' : '0') } catch (e) { /* 存不了就只管这一次 */ } UI.toast(labNear ? '头顶牌子：只显示附近的' : '头顶牌子：全部显示', ''); UI.refreshPanel(true) },   // 设计 69
  eco: () => { eco = !eco; try { localStorage.setItem('ms_eco', eco ? '1' : '0') } catch (e) { /* 存不了就只管这一次 */ } applyEco(); UI.toast(eco ? '省电模式开了：每秒 30 帧，不画会动的小草' : '省电模式关了', '') },
  buildTab: t => UI.setBuildTab(t),
  tdTab: t => UI.setTdTab(t),
  shelfTab: t => UI.setShelfTab(t),
  shelfSlot: j => UI.setShelfSlot(+j),
  shelfPg: d => UI.setShelfPg(+d),
  buyCrew: () => { const c = L.crewNext(S); if (c == null) return; if (S.coins < c) { UI.toast('末日币不够', 'bad'); return } UI.ask(`花 <b>${c}</b> 末日币永久多雇一个施工队？`, () => actions._buyCrew()) },
  _buyCrew: () => { if (L.buyCrew(S)) { UI.toast(`雇到了新的施工队，现在能同时建 ${L.crews(S)} 样`, 'good'); SV.saveNow() } else UI.toast('末日币不够', 'bad') },
  gear: j => { const ev = []; if (L.useGear(S, +j || 0, ev)) { UI.toast(`用了一个发条，建造 −${Math.round(GEAR.cut / 60)} 分钟`, 'good'); handleEvents(ev) } },
  build: k => { if (L.startBuild(S, k)) { UI.toast(`开始建造：${BUILD[k].name}`, 'good'); SV.saveNow() } },
  buyScroll: n => { const k = +n || 1, c = TD.scroll * k; if (S.coins < c) { UI.toast('末日币不够', 'bad'); return } UI.ask(`花 <b>${c}</b> 末日币买 ${k} 张尸潮券？`, () => actions._buyScroll(k)) },
  buyAnimal: a => { const [k, n] = a.split(':'); const got = L.buyAnimal(S, k, +n); if (got) { UI.toast(`买了 ${got} 只${RANCH[k].name}，放进${BUILD[k].name}了${L.working(S, 'feed').length ? '' : '（记得派员工做「饲养」）'}`, 'good'); SV.saveNow() } else UI.toast('末日币不够', 'bad') },
  mysGive: () => { const r = L.mysDeliver(S); if (!r) { UI.toast('仓库里的东西还不够', 'bad'); return }
    UI.closePanel(); UI.big('交货成功', `+${r.coins} 末日币${r.star ? '　额外奖励：星星 ×1' : ''}`, r.star ? 'gem' : 'built'); UI.msg(S, `神秘商人收走了货：+${r.coins} 末日币${r.star ? '，还送了 1 颗星星' : ''}`, 'good');
    if (mysM) { mysLeave = mysBack() } SV.saveNow() },
  mysRef: () => { const r = L.mysRefresh(S); if (r === 'free' || r === 'ticket') { UI.toast(r === 'free' ? '换了一单（这次免费）' : '用了 1 张刷新券，换了一单', 'good'); SV.saveNow() } else UI.toast(r, 'bad') },
  /* 设计 56：副本、装备 */
  fbGo: n => fbGo(+n),
  fbSkill: k => { if (FL.skillUp(S, k)) { UI.toast(`${SKILLS[k].name}升到 ${S.fb.sk[k]} 级`, 'good'); SV.saveNow() } else UI.toast('末日币不够', 'bad') },
  fbRefine: id => {   /* 设计 107：0★ 传说先确认（升星后就不能转换了） */
    const it = FL.itemById(S, +id); if (it && ITEMS[it.k].q === 'l' && !(it.st > 0) && !RFX.busy()) { UI.ask(`<b>${FL.itemName(it)}</b> 升星后就不能做传说转换了。确定炼宝？`, () => actions._fbRefine(id), '炼宝'); return }
    actions._fbRefine(id) },
  _fbRefine: id => {   /* 设计 80：结果点下去就算好，再放 2 秒敲打动画（动画放着时不能再炼） */
    if (RFX.busy()) return; const it0 = FL.itemById(S, +id); if (!it0) return; const from = it0.st || 0, pity0 = it0.pity || 0;
    const r = FL.refine(S, +id); if (!r) return; if (r.why) { UI.toast(r.why, 'bad'); return } SV.saveNow();
    const RP = ['gear', 'smith'], box = document.querySelector('#panel .pbox'); if (!box || !RP.includes(UI.curPanel())) { UI.refreshPanel(true); return }   /* 设计 107：铁匠面板也放敲打动画 */
    document.querySelectorAll('[data-act="fbRefine"]').forEach(b => { b.disabled = true });
    RFX.play({ it: it0, ok: r.ok, from, to: from + 1, next: r.ok ? null : FL.refineInfo(it0).rate, starSel: '#panel .refstars i', hold: { id: it0.id, st: from, pity: pity0 }, box, lit: () => { if (RP.includes(UI.curPanel())) UI.refreshPanel(true) }, done: () => { if (RP.includes(UI.curPanel())) UI.refreshPanel(true) } });
    UI.refreshPanel(true) },
  fbEquip: id => { const r = FL.equip(S, +id); if (r === true) { UI.toast('穿上了', 'good'); SV.saveNow(); gotDone() } else if (r) UI.toast(r, 'bad') },
  fbUnequip: sl => { if (FL.unequip(S, sl)) { SV.saveNow() } else UI.toast('背包满了', 'bad') },
  fbDis: id => { const it = FL.itemById(S, +id); if (!it) return; const D = ITEMS[it.k], go = () => { const n = FL.dismantle(S, +id); UI.toast(`分解了，得到 ${n} 颗晶石`, 'good'); UI.gst('gear').sel = null; SV.saveNow(); gotDone() };
    if (D.q === 'n') go(); else UI.ask(`分解<b>${FL.itemName(it)}</b>（${it.st || 0} 星）？得到 ${FL.dismantleGain(it)} 颗晶石，分解了就没了。`, go) },
  fbTake: () => { if (FL.pendTake(S)) { UI.toast('收下了，在「装备」里', 'good'); SV.saveNow(); gotDone() } else UI.toast('背包满了，穿上或者分解', 'bad') },
  fbToRef: () => toSmith('ref'),   /* 设计 107：炼宝改到铁匠那里 */
  toSmith: a => toSmith(a),
  fbLegSwap: id => {   /* 设计 105b / 107：传说转换（确认 → 结果框 + 光效，光效放完前不能再点） */
    const it = S.fb.bag.find(x => x.id === +id); if (!it) return; const why = FL.legSwapWhy(S, it); if (why) { UI.toast(why, 'bad'); return }
    UI.ask(`花 <b>${LEG_SWAP}</b> 末日币，把 <b>${FL.itemName(it)}</b> 随机换成同一关的另一种传说？`, () => { const r = FL.legSwap(S, +id); if (!r.ok) { UI.toast(r.why, 'bad'); return }
      setSwapFx({ id: it.id, from: r.from, to: r.to, lv: it.lv, st: it.st || 0 }); SV.saveNow(); UI.refreshPanel(true); setTimeout(() => { if (UI.curPanel() === 'smith') UI.refreshPanel(true) }, 1700) }, '转换') },
  fbSwap: sl => { const g = UI.gst('gear'); g.tab = 'bag'; g.f = sl; g.sel = null },   // 「换一件」：跳到背包页签，筛好这个部位
  fbFilter: f => { const g = UI.gst('gear'); g.f = f; g.sel = null },
  fbSort: k => { UI.gst('gear').sort = k },
  fbDisN: () => { const list = FL.normals(S); if (!list.length) { UI.toast('背包里没有普通装备', 'bad'); return } const n = list.reduce((a, it) => a + FL.dismantleGain(it), 0);
    UI.ask(`把背包里 <b>${list.length}</b> 件普通装备都分解？能得到 <b>${n}</b> 颗晶石。`, () => { const g = FL.dismantleNormals(S); UI.toast(`分解了 ${list.length} 件，得到 ${g} 颗晶石`, 'good'); UI.gst('gear').sel = null; SV.saveNow(); UI.refreshPanel(true) }) },
  fbGotClose: () => gotDone(),
  buyCrys: i => { const p = CRYSTAL.packs[+i]; if (!p) return; if (S.coins < p[1]) { UI.toast('末日币不够', 'bad'); return } UI.ask(`花 <b>${p[1]}</b> 末日币买 ${p[0]} 颗晶石？`, () => { if (FL.buyCrystal(S, +i)) { UI.toast(`买了 ${p[0]} 颗晶石`, 'good'); SV.saveNow() } }) },
  /* 设计 77：一次换 n 颗（右边详情选的数量），确认框和右边写同一句，换完数量回到 1 */
  starSwap: a => { const have = S.stars || 0; if (!(have >= 1)) { UI.toast('星星不够', 'bad'); return } const n = Math.max(1, Math.min(have, UI.starQ())), t = UI.STAR_GET(a, n); if (!t) return;
    UI.ask(`${t.line}？`, () => { if (a === 'crys' ? FL.starCrystal(S, n) : L.starSwap(S, a, n)) { UI.starCtl('reset'); UI.toast(`换到了 ${t.got}`, 'good'); SV.saveNow() } }) },
  starN: a => UI.starCtl(a),
  ticN: a => UI.ticCtl(a),   /* 设计 109 */
  mallTab: t => UI.setMallTab(t),
  wsGo: a => { const [k, pick] = a.split(':'), r = L.wsStart(S, k, pick); if (r === true) { UI.toast(`开始做${GOODS[pick].name}`, 'good'); SV.saveNow() } else UI.toast(r, 'bad') },
  wsN: d => UI.setWsN(+d),
  wsGoN: a => { const [k, pick, n] = a.split(':'); let ok = 0, err = ''; for (let i = 0; i < (+n || 1); i++) { const r = L.wsStart(S, k, pick); if (r === true) ok++; else { err = r; break } }
    if (ok) { UI.toast(`开始做 ${ok} 个${GOODS[pick].name}`, 'good'); SV.saveNow() } else UI.toast(err, 'bad') },
  wsPlan: a => { const [k, o, li] = a.split(':'), i = li === '' || li == null ? null : +li; L.wsSetPlan(S, k, o || null, i); UI.toast(`${i == null ? '所有线' : `线${i + 1}`}${o ? `选了${GOODS[o].name}（原料不够时先做别的缺的）` : '改回自动：做最少的那样'}`, ''); UI.setWsLine(null); SV.saveNow() },   // 设计 60：每条线各选各的
  wsLine: i => UI.setWsLine(+i),
  crewPick: k => UI.setCrewPick(k),
  goWsNoCrew: () => { const k = L.crewless(S, 'craft')[0]; if (k) UI.openAt('ws', k); else UI.openPanel('ws') },   // 设计 62
  crewSet: a => { const [j, k, id] = a.split(':'), p = id === 'auto' ? null : staffById(+id), o = L.crewOf(S, j, k);
    const go = () => { const r = L.setCrew(S, j, k, p ? p.id : null); if (r === true) { UI.toast(p ? `${BUILD[k].name}交给${p.name}管了` : `${BUILD[k].name}改成自动分`, 'good'); SV.saveNow(); UI.setCrewPick(null); UI.refreshPanel(true) } else if (r) UI.toast(r, 'bad') };
    if (p && o && o.id !== p.id && L.isPinned(S, o)) UI.ask(`${BUILD[k].name}原来是${o.name}指定管的，交给${p.name}？`, go, '交给' + p.name); else go() },   // 设计 60 / 62
  crewPin: a => { const [id, on] = a.split(':').map(Number), p = staffById(id); if (!p) return; if (!!on === L.isPinned(S, p)) return; if (L.setPin(S, id, !!on)) { UI.toast(on ? `${p.name}改成指定：只管勾的` : `${p.name}改成自动`, ''); SV.saveNow() } },   // 设计 62
  pinToggle: a => { const [id, k] = a.split(':'), p = staffById(+id), o = L.crewOf(S, p.job, k);
    const go = () => { const r = L.pinToggle(S, +id, k); if (r !== true && r) UI.toast(r, 'bad'); else SV.saveNow(); UI.refreshPanel(true) };
    if (o && o.id !== p.id && L.isPinned(S, o)) UI.ask(`${BUILD[k].name}原来是${o.name}指定管的，交给${p.name}？`, go, '交给' + p.name); else go() },
  farmPin: a => { const [id, w] = a.split(':'), r = L.farmPin(S, +id, w); if (r !== true && r) UI.toast(r, 'bad'); else SV.saveNow() },
  chRetry: () => CHAT.retry(), chTab: v => CHAT.ctl.tab(v), chChat: id => CHAT.ctl.chat(id), chCard: id => CHAT.ctl.card(id), chSearch: () => CHAT.ctl.search(), chReq: id => CHAT.ctl.req(id), chSend: () => CHAT.ctl.send(),
  chAccept: id => CHAT.ctl.accept(id), chReject: id => CHAT.ctl.reject(id),
  chUnfriend: id => { const p = CHAT.CH.peer; UI.ask(`删掉好友「${p ? p.name : ''}」？`, () => CHAT.ctl.unfriend(id)) },
  openStars: () => toMerch('star'),
  toMerch: a => toMerch(a),
  buyGun: () => { if (S.coins < GUARD_GUN.price) { UI.toast('末日币不够', 'bad'); return } UI.ask(`花 <b>${GUARD_GUN.price}</b> 末日币买一把守卫用的 M16？`, () => actions._buyGun()) },
  _buyGun: () => { if (L.buyGuardGun(S)) { UI.toast('买了一把 M16，去员工面板给守卫装上', 'good'); SV.saveNow() } },
  equipGun: id => { if (L.equipGun(S, +id)) { UI.toast('装上了 M16', 'good'); SV.saveNow() } },
  unequipGun: id => { if (L.unequipGun(S, +id)) { UI.toast('枪放回仓库了', ''); SV.saveNow() } },
  gunUp: a => { const [id, k] = String(a).split(':'); if (TDR.active()) { UI.toast('尸潮打完再升级', 'bad'); return } if (L.gunUp(S, +id, k)) { UI.toast(`${HERO.names[k]}升级了`, 'good'); SV.saveNow() } },
  _buyScroll: n => { if (L.buyScroll(S, +n || 1)) { UI.ticCtl('reset'); UI.toast(`买了 ${+n || 1} 张尸潮券`, 'good'); SV.saveNow() } else UI.toast('末日币不够', 'bad') },
  tdGo: lv => tdBegin(+lv),
  needScroll: () => toMerch('scroll'),   // 设计 56：尸潮券不够 → 提示 + 商人头顶闪箭头
  needTix: () => toMerch('tix'),   // 设计 108：召唤券不够
  buyTix: n => { const k = +n || 1, c = FL.tixCost(k, UI.mallFar()); if (S.coins < c) { UI.toast('末日币不够', 'bad'); return } UI.ask(`花 <b>${c}</b> 末日币买 ${k} 张召唤券？`, () => { if (FL.buyTix(S, k, UI.mallFar())) { UI.ticCtl('reset'); UI.toast(`买了 ${k} 张召唤券`, 'good'); SV.saveNow() } else UI.toast('末日币不够', 'bad') }) },
  buyLic: () => { if (L.buyLicense(S)) { UI.toast('买到垂钓证了！鱼竿也送你一根', 'good'); SV.saveNow() } else UI.toast('末日币不够', 'bad') },
  buyBait: a => { const [k, n] = a.split(':'), c = L.baitCost(k, +n, UI.mallFar()); if (S.coins < c) { UI.toast('末日币不够', 'bad'); return } UI.ask(`花 <b>${c}</b> 末日币买 ${n} 个${FISHING.bait[k].name}？`, () => actions._buyBait(a)) },
  _buyBait: a => { const [k, n] = a.split(':'); if (L.buyBait(S, k, +n, UI.mallFar())) { UI.toast(`买了 ${n} 个${FISHING.bait[k].name}`, 'good'); FG.refresh(); SV.saveNow() } else UI.toast('末日币不够', 'bad') },
  buyRod: () => { const c = L.rodCost(S, UI.mallFar()); if (S.rodDur >= L.rodCfg(S).dur) { UI.toast('鱼竿耐久是满的，不用换', 'bad'); return } if (S.coins < c) { UI.toast('末日币不够', 'bad'); return } UI.ask(`花 <b>${c}</b> 末日币换一根新鱼竿？`, () => actions._buyRod()) },
  _buyRod: () => { if (L.buyRod(S, UI.mallFar())) { UI.toast(`换了一根新鱼竿，耐久 ${S.rodDur}`, 'good'); FG.refresh(); SV.saveNow() } else UI.toast(S.rodDur >= L.rodCfg(S).dur ? '鱼竿耐久是满的，不用换' : '末日币不够', 'bad') },
  boatGo: () => { UI.closePanel(); boatGo() },
  staffOpen: id => { UI.setStaffSel(+id); UI.openStaff(+id) },   // 设计 29b：员工详情放在员工面板右边，不再单独一页
  staffDTab: t => UI.setStaffDTab(t),
  staffJob: a => { const [id, j] = a.split(':'); if (tdLocked(+id)) return; const p = staffById(+id), was = p && L.onTrip(p) && p.job;
    const r = L.setJob(S, +id, j); if (r !== true) { if (r) UI.toast(r, 'bad'); return }
    if (was && j !== was) UI.toast(`${p.name}从${STAFF_JOBS[was]}的路上回来了（这一趟没带东西）`, ''); SV.saveNow() },
  heroUp: k => { if (TDR.active()) { UI.toast('尸潮打完再升级', 'bad'); return } if (L.heroUp(S, k)) { UI.toast(`${HERO.names[k]}升到 ${S.hero[k]} 级`, 'good'); SV.saveNow(); heroView.refresh() } },
  staffUp: id => { if (tdLocked(+id)) return; const p = staffById(+id); if (L.staffUp(S, +id)) { UI.toast(`${p.name}升到 ${p.lv} 级`, 'good'); SV.saveNow() } else UI.toast('末日币不够', 'bad') },
  staffBye: id => { if (tdLocked(+id)) return; const p = staffById(+id); if (!p) return; const back = L.dismissStaff(S, +id); UI.toast(`${p.name}走了${back ? `，退回升级花的一半：${back} 末日币` : ''}`, ''); UI.openPanel('staff'); SV.saveNow() },
  /* 营地住满了：请走一个老员工让新人留下 / 让新人走 */
  fullSwap: id => { const n = UI.pendingStaff(); if (!n) return; const old = staffById(+id); const back = L.dismissStaff(S, +id); L.addStaff(S, n); UI.setPendingStaff(null);
    UI.toast(`${old ? old.name : ''}走了${back ? `（退回 ${back} 末日币）` : ''}，${n.name}留下了`, 'good'); UI.closePanel(); SV.saveNow() },
  fullTake: () => { const n = UI.pendingStaff(); if (!n) return; if (!L.addStaff(S, n)) { UI.toast('营地还是住满的', 'bad'); return } UI.setPendingStaff(null); UI.toast(`${n.name}住进营地了`, 'good'); UI.closePanel(); SV.saveNow() },   // 设计 60：有空位了直接留下
  fullKeep: () => { const n = UI.pendingStaff(); if (!n) return; const c = L.thankStaff(S, n); UI.setPendingStaff(null); UI.toast(`${n.name}走了，留下 ${c} 末日币当谢礼`, ''); UI.closePanel(); SV.saveNow() },
  towerBuild: a => { const [i, k] = a.split(':'), r = L.towerBuild(S, +i, k); if (r === true) { UI.toast(`开始建${TOWERS[k].name}，${UI.fmtT(TOWERS[k].time)}后建好`, 'good'); SV.saveNow() } else if (r) UI.toast(r, 'bad') },
  towerUp: i => { if (L.towerUpgrade(S, +i)) { UI.toast('开始升级，施工完成后生效', 'good'); SV.saveNow() } },
  towerSell: i => UI.ask('卖掉这座塔？退回一半的钱。', () => { const n = L.towerSell(S, +i); if (n) { UI.toast(`卖掉了，退回 ${n} 末日币`, 'good'); SV.saveNow(); UI.refreshPanel(true) } }, '卖掉'),
  sortWh: () => { S.whSort = !S.whSort; UI.toast(S.whSort ? '按数量从多到少排好了，0 个的先收起来' : '回到按种类排', 'good') },
  whSel: g => UI.whDropCtl('sel', g),
  whN: a => UI.whDropCtl('n', a),
  whDo: () => { const d = UI.whDropSel(); if (!d) return; UI.ask(`丢掉 <b>${d.n}</b> 个${GOODS[d.g].name}？丢了就没了。`, () => { const k = L.dropStock(S, d.g, d.n); UI.whDropCtl('clear'); if (k) { UI.toast(`丢掉了 ${k} 个${GOODS[d.g].name}`, ''); SV.saveNow() } }, '丢掉') },
  bagSel: i => UI.bagDrop('sel', i),
  bagN: a => UI.bagDrop('n', a),
  bagDrop: k => { UI.bagDrop(k); FG.refresh() },
  sortBag: () => { const n = L.sortBag(S); UI.toast(n ? `整理好了，空出 ${n} 格` : '整理好了', 'good') },
  tier: i => { if (L.startTier(S, +i)) { UI.toast('开始升档', 'good'); SV.saveNow() } },
  shelf: a => { const [i, g, j] = a.split(':'); const sh = S.shelves[+i], sl = sh && L.slotsOf(sh)[+j || 0]; L.setShelf(S, +i, sh && sh.x && sl && sl.g === g ? null : g, +j || 0) },   // 果蔬架：再点一次已选的 = 清空这一格
  plantAll: c => { const n = L.plantAll(S, c); UI.toast(n ? `种下了 ${n} 格${GOODS[c].name}` : '没有空地或者种子不够', n ? 'good' : 'bad') },
  plant: a => { const [i, c] = a.split(':'); if (L.plant(S, +i, c)) UI.toast(`种下了${GOODS[c].name}`, 'good') },
  harvestAll: w => { let n = 0, full = 0; const f = r => { if (r && r.full) full++; else if (r) n += r.n };   // 待改小问题 4：温室 / 果园页签各收各的（w = 'p' / 't'；不给 = 两边都收）
    if (w !== 't') S.plots.forEach((p, i) => f(L.harvest(S, i))); if (w !== 'p') S.trees.forEach((t, i) => f(L.pickTree(S, i)));
    UI.toast(full ? `收获了 ${n} 个；还有 ${full} 处仓库放不下，先卖掉一些或者升级仓库` : n ? `收获了 ${n} 个` : '还没有熟的', full ? 'bad' : n ? 'good' : '') },
  treeSwap: a => { const [i, sp] = a.split(':'), t = S.trees[+i]; if (!t) return; const nn = GOODS[TREASURE[sp].tree].name;
    UI.ask(`把这棵${GOODS[t.k].name}树挖掉，换种${nn}树？<br><small>${GOODS[t.k].name}树苗退回仓库，${nn}树要从头长</small>`, () => { if (L.swapTree(S, +i, sp)) { UI.toast(`换种了${nn}树`, 'good'); SV.saveNow() } }) },
  tree: a => { const [i, sp] = a.split(':'); if (L.plantTree(S, +i, sp)) UI.toast(`种下了${TREASURE[sp].name}`, 'good') },
  push: () => { SV.saveNow(); SV.cloudState.busy = true; UI.refreshPanel(true); SV.push(true).then(() => { SV.cloudState.busy = false; UI.refreshPanel(true); UI.toast(SV.cloudState.ok ? '已经存到云端了' : '没存上，等会儿会自动再试', SV.cloudState.ok ? 'good' : 'bad') }) },
  toTitle: () => { SV.saveNow(); SV.beacon(); location.reload() },        // 本机已经存好（选存档时会比较本机和云端，用新的），不用等上传
  update: () => doUpdate(),
  look: () => { if (away()) { UI.toast('回超市以后再改外观', 'bad'); return } editLook(false) },
  layout: () => enterLayout(),
  shelfMiss: () => UI.shelfMiss(S),
  restart: () => UI.ask('确定重新开始？现在的进度会清空。', () => { SV.clearLocal(); location.reload() }, '清空重来', true),
};
UI.initPanels({ S: () => S, act: (a, arg) => actions[a] && actions[a](arg), menuHTML, heroMount: (el, g) => heroView.mount(el, g) });
UI.addPanels(FB_PANELS, FB_TITLES);   // 设计 56：副本、装备、「获得」框
/* 设置（设计 29d）：页签 游戏 / 账号 / 数据 / 说明 / 关于；一项一行，按钮放右边；「更新记录」和「游戏说明」在固定高度的框里滚动 */
function menuHTML() {
  const cs = SV.cloudState, cloud = SV.cloudCan(), g = UI.gst('menu');
  const tabs = [{ id: 'game', name: '游戏' }, { id: 'acct', name: '账号' }, { id: 'stat', name: '数据' }, { id: 'help', name: '说明' }, { id: 'about', name: '关于', dot: !!newV }];
  if (!tabs.find(t => t.id === g.tab)) g.tab = 'game';
  const row = (t, note, btn) => `<div class="srow2"><div class="st"><b>${t}</b><div class="note">${note}</div></div><div class="sc">${btn}</div></div>`;
  let body = '';
  if (g.tab === 'game') body = row('外观、店名', `换性别、发型发色、套装；改超市招牌（现在：${UI.esc(S.storeName || '幸存者超市')}）`, '<button class="btn sm ghost" data-act="look">改外观 / 店名</button>')
    + row('性能小窗（测试用）', '左上角显示帧数、每帧用时、draw call、三角形、影子图画没画、头顶牌子数，还有每项省电优化的开关（改了退出重进生效）', `<button class="tog ${PERF.on ? 'on' : ''}" data-act="perfWin"><i></i>${PERF.on ? '开' : '关'}</button>`)
    + row('头顶牌子', '只显示附近的：进了超市才显示店里的牌子，在工坊、温室、牧场里才显示那里的，别的走到 5 米内才显示；员工饿了、机器停着的小图标在哪都看得到。全部显示：远处的也显示', `<button class="tog ${labNear ? 'on' : ''}" data-act="labNear"><i></i>${labNear ? '附近' : '全部'}</button>`)   // 设计 69
    + row('手机里的资源', `${AD.dbOK() ? `存了 ${AD.storedMB().toFixed(1)} MB（模型、图片存在手机里，以后打开只下改过的）` : '这台手机存不了，照旧从网上读'}；出怪问题（缺图、模型不对）可以清掉重新下载`, `<button class="btn sm ghost" data-act="clearAssets">清掉重新下载</button>`)   /* 设计 75 */
    + row('省电模式', '一直每秒 30 帧，不画会动的小草、小花和落叶，手机更凉更省电；只影响这台手机', `<button class="tog ${eco ? 'on' : ''}" data-act="eco"><i></i>${eco ? '开' : '关'}</button>`)
  else if (g.tab === 'acct') { const st = !cloud ? '本机存档（开发测试模式，没有连云端）' : SV.isOffline() ? '离线中：这一局只存在本机，下次联网登录时会自动和云端比较、用新的那个' : cs.busy ? '正在存到云端……' : cs.ok === false ? `上次没能存到云端（${SV.errTxt(cs.err).replace(/。$/, '')}），联网后会自动补上` : cs.ok ? `已存到云端：${new Date(cs.at).toLocaleTimeString()}` : '每次自动保存都会存到云端';
    body = row(cloud ? `用户 ${UI.esc(SV.acct && SV.acct.name || '')}　存档位 ${SV.slot != null ? SV.slot + 1 : '-'}` : '存档', st, cloud ? '<button class="btn sm" data-act="push">立刻存到云端</button>' : '<button class="btn sm ghost" data-act="restart">重新开始</button>')
      + (cloud ? row('换存档 / 换用户', '回到开始画面选存档位或换个用户登录（现在的进度已经存好）', '<button class="btn sm ghost" data-act="toTitle">换存档 / 换用户</button>') : ''); }
  else if (g.tab === 'stat') body = UI.statsGrid(S);
  else if (g.tab === 'help') { const H = HELP(), sel = H[+g.sel] ? +g.sel : 0;
    body = `<div class="hsplit"><div class="htopics">${H.map(([t], i) => `<button class="${i === sel ? 'on' : ''}" data-gsel="${i}">${UI.esc(t.split('：')[0])}</button>`).join('')}</div><div class="sbox"><b>${UI.esc(H[sel][0])}</b><p>${UI.esc(H[sel][1]).replace(/\n/g, '<br>')}</p></div></div>`; }
  else body = row(`版本 V${(APP_V / 100).toFixed(2)}`, newV ? `发现新版本 V${(newV / 100).toFixed(2)}` : verMsg || '打开游戏时会自动检查更新', newV ? '<button class="btn sm" data-act="update">更新</button>' : '')
    + `<div class="sub2">更新记录</div><div class="sbox log">${UI.CHANGELOG_HTML()}</div>`;
  return UI.frame('menu', { tabs, body, res: '', help: '<b>设置</b><p>游戏：外观、店名、省电模式。账号：云端存档、换存档。数据：这个存档的累计统计。说明：游戏怎么玩。关于：版本和更新记录。</p><p>「说明」和「更新记录」内容多，在框里上下滑着看。</p>' });
}

/* ---------- 顶栏「☰」：点开往下展开图标格子；点格子里的按钮、点别处、打开面板时收起 ---------- */
const hDrop = $('#hDrop'), hMore = $('#hMore');
const dropOpen = on => { hDrop.classList.toggle('hidden', !on); hMore.classList.toggle('open', on) };
hMore.addEventListener('click', e => { e.stopPropagation(); if (UI.msgIsOpen()) UI.msgToggle(S, false); dropOpen(hDrop.classList.contains('hidden')) });
document.addEventListener('pointerdown', e => { if (!hDrop.classList.contains('hidden') && !e.target.closest('#hDrop, #hMore')) dropOpen(false) }, true);
/* 消息下拉（0.14）：点按钮开 / 关，点别处收起；「删除已读」 */
/* ---------- 0.42 自动门（用户）：东门（超市 3 级起）平时一直开着，尸潮时关上、主角走近才开；工坊门有人走近就开，走开就关 ---------- */
function doorFrame(dt) {
  const D = W.doors; if (!D || !D.east) return;
  const near = (d, r) => { if (!away() && Math.hypot(P.pos.x - d.cx, P.pos.z - d.cz) < r) return true;
    for (const v of staffVis.values()) if (v.m && v.m.visible && Math.hypot(v.m.position.x - d.cx, v.m.position.z - d.cz) < r) return true; return false };
  D.east.want = !TDR.active() || near(D.east, 2.6) ? 1 : 0;
  D.ws.want = near(D.ws, 2.3) ? 1 : 0;
  D.east.tick(dt); D.ws.tick(dt);
}
/* ---------- 0.40 好友和聊天（chat.js） ---------- */
CHAT.initChat({ acct: () => SV.cloudCan() && !SV.isOffline() && SV.acct && SV.slot != null ? SV.acct : null, S: () => S, isOpen: () => UI.panelIs('friends'), onChange: () => { if (UI.panelIs('friends')) UI.refreshPanel(true) } });
setInterval(() => { if (S && !document.hidden) CHAT.tick() }, 1000);
$('#hFriend').addEventListener('click', e => { e.stopPropagation(); if (!S) return; dropOpen(false); if (UI.msgIsOpen()) UI.msgToggle(S, false); if (CHAT.CH.view === 'card') CHAT.ctl.tab('list'); UI.openPanel('friends'); CHAT.tick(true) });
$('#hMsg').addEventListener('click', e => { e.stopPropagation(); if (!S) return; dropOpen(false); UI.msgToggle(S, !UI.msgIsOpen()) });
document.addEventListener('pointerdown', e => { if (UI.msgIsOpen() && !e.target.closest('#msgDrop, #hMsg')) UI.msgToggle(S, false) }, true);
$('#msgDrop').addEventListener('click', e => { e.stopPropagation();
  if (e.target.closest('[data-mdel]')) { const n = UI.msgDelRead(S); if (n) { UI.toast(`删了 ${n} 条已读消息`, ''); SV.saveNow() } }
  else if (e.target.closest('[data-mall]')) { if (UI.msgReadAll(S)) SV.saveNow() }
  else { const r = e.target.closest('[data-mi]'); if (r && UI.msgRead(S, +r.dataset.mi)) SV.saveNow() } });   // 点一条 = 读了这条
hDrop.addEventListener('click', e => { if (e.target.closest('[data-open], [data-act]')) dropOpen(false) });   /* 设计 76：菜单「装备」是 data-act */

/* ---------- 版本检查 ---------- */
let newV = 0, verMsg = '', verAt = 0;
async function checkUpdate() {
  if (location.protocol === 'file:') return; verAt = Date.now();
  try { const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); const j = await r.json();
    if ((+j.v || 0) > APP_V) {
      /* 还没开始玩：自动更新；同一个新版本 2 分钟内只自动试一次，防止网站还没更新完时一直刷新 */
      let tried = null; try { tried = JSON.parse(sessionStorage.getItem('ms_upd') || 'null') } catch (e) {}
      if (!S && !(tried && tried.v === +j.v && Date.now() - tried.at < 120000)) { try { sessionStorage.setItem('ms_upd', JSON.stringify({ v: +j.v, at: Date.now() })) } catch (e) {} doUpdate(); return } if (!newV) UI.toast('有新版本了：右上角「☰」→「设置」里点「更新」（进度不会丢）', '', 4000); newV = +j.v; UI.setDot('menu', true) } } catch (e) {}
}
async function doUpdate() { if (S) { SV.saveNow(); await Promise.race([SV.push(true), new Promise(r => setTimeout(r, 6000))]) }   // 上传最多等 6 秒，本机已经存好
  const base = location.pathname.replace(/index\.html$/, '');
  await Promise.all([base, base + 'index.html'].map(u => fetch(u, { cache: 'reload' }).catch(() => {})));
  location.replace(base + '?u=' + Date.now()) }
document.addEventListener('click', () => { if (Date.now() - verAt > 300000) checkUpdate() }, true);

/* ---------- 离线结算 ---------- */
function settle(secs, why) {
  if (secs < 20) { if (secs > 0) handleEvents(L.tick(S, secs, false).filter(e => e.type === 'built' || e.type === 'mysCome')); return }
  /* 不玩没有收益：离开的这段时间只算建造等计时，回收机和顾客都停着 */
  const r = L.offline(S, secs); r.built.forEach(b => handleEvents([b])); if (r.mys) handleEvents([{ type: 'mysCome' }]);   // 0.31 修：不在线时神秘商人来了也要提示
  if (secs >= 60) UI.toast(`离开了 ${UI.fmtT(Math.min(secs, OFFLINE_CAP))}${r.built.length ? '，建造已完成' : S.builds.length ? '，建造还在继续' : ''}${r.ripe ? `，有 ${r.ripe} 处菜和果子熟了` : ''}${r.scav ? `，拾荒的员工带回 ${r.scav} 件物资` : ''}`, '', 3500);
  syncPickups();
}

/* ---------- 货架摆放：布局变了就把模型挪过去 ---------- */
let bigShown = null;
let fixShown = '';
function syncShelves() {
  const big = S.lv.store >= 3; if (big !== bigShown) { bigShown = big; W.setStoreBig(big); LY.setExpanded(false); gridMesh && (layGroup.remove(gridMesh), gridMesh = null) }   // 0.42：3 级起南边盖工坊、东门换自动门；店面不再变大
  const fxo = lay ? lay.fx : S.fix, fk = JSON.stringify(fxo) + WS_IDS.map(k => S.lv[k] || 0).join(''); if (fk !== fixShown) { fixShown = fk; W.syncFix(fxo); if (!W.syncWs(fxo.ws || [], S.lv)) fixShown = '' }   // 0.42 工坊的机器（模型还没读好就下一帧再试）   // 收银台、装饰
  const fx = W.syncFixtures(S.shelves, lay ? lay.l : S.layout);
  fx.forEach((f, i) => { const sh = S.shelves[i]; if (f.m && sh) M.fillShelf(f.m, L.slotsOf(sh), L.capOf(sh)) });
}

/* ---------- 仓库满了的提示（别刷屏） ---------- */
let whWarn = -99, whShown = 0;
/* 0.27：新收的菜自动摆上果蔬架 / 果蔬架没空位的提醒（没空位的每种一局只提醒一次） */
const vegTold = new Set();
function vegTip(g, how) {
  if (how === 'put') UI.toast(`${GOODS[g].name}自动摆上果蔬架了`, 'good');
  else if (how === 'none' && !vegTold.has(g)) { vegTold.add(g); UI.toast(`果蔬架没空位摆${GOODS[g].name}：去「货架」换一种，或给果蔬架升档`, 'bad', 3500) }
}
function fullWarnAt(name) { if (clock - whWarn < 4) return; whWarn = clock; UI.toast(`仓库里的${name}放满了，先卖掉一些或者升级仓库`, 'bad'); UI.msg(S, `仓库里的${name}放满了`, 'bad') }

/* ---------- 施工现场：正在建的建筑外面围一圈脚手架，头顶显示进度和剩余时间 ---------- */
const WH_SIZE = [null, [1, 1], [2, 1], [2, 1], [3, 1], [3, 2]];
function siteOf(k, to, b) {
  const c = (A, h) => ({ x: (A.x0 + A.x1) / 2, z: (A.z0 + A.z1) / 2, w: A.x1 - A.x0, d: A.z1 - A.z0, h });
  if (k === 'store') return c(STORE, 4.2);
  if (k === 'rec') return { x: REC_POS.x, z: REC_POS.z, w: 4.9, d: 2.6, h: 2.8 };
  if (k === 'wh') { const [w, d] = WH_SIZE[to] || [3, 2], m = 2.16; return { x: WH_POS.x, z: WH_POS.z - (d - 1) * m / 2, w: w * m + 0.8, d: d * m + 0.8, h: 2.8 } }
  if (k === 'tower') { const [x, z] = TOWER_SPOTS[b.i]; return { x, z, w: 1.6, d: 1.6, h: 3.2 } }
  if (k === 'tier' || FIXTURE[k]) {
    /* 新货柜：先算出它会摆在哪（和建好后 fixLayout 找的一样）；升档：就是那个货柜的位置 */
    let l = k === 'tier' ? S.layout[b.i] : L.spotFor(S, k);
    if (!l) return null; const w = LY.shelfWorld(l), [fw, fd] = LY.footSize(l); return { x: w.x, z: w.z, w: fw + 0.5, d: fd + 0.5, h: 2.1 } }
  if (k === 'bag') return null;   // 背包升级没有施工位置（以前在建造台）
  if (k === 'gh') return c(GH_AREA, 3.6);
  if (k === 'orchard') return c(ORCH_AREA, 2.2);
  if (k === 'camp') return c(DORM_AREA, 2.6 + to * 0.6);   // 0.21 宿舍楼：围栏围住整栋楼
  if (RANCH[k]) { const A = PENS[k]; return { ...c({ x0: A.x0 - 0.3, x1: A.x1 + 0.3, z0: A.z0 - 0.3, z1: A.z1 + 0.3 }, 1.6), ranch: true } }   // 0.29 动物棚：围起整个棚，里面堆木料
  if (k === 'pond') { const [w, d] = FISHPOND_SIZE[to]; return { x: POND_LOT.x, z: POND_LOT.z, w: w + 1.2, d: d + 1.2, h: 1.6 } }
  if (BUILD[k] && BUILD[k].ws) { const w = (S.fix.ws || []).find(x => x.k === k) || { k, ...LY.WS_DEF[k] }, p = LY.wsWorld(w); return { x: p.x, z: p.z, w: w.rot % 2 ? 2.8 : 3.6, d: w.rot % 2 ? 3.6 : 2.8, h: 2.2 } }   // 0.45 露天工坊的机器
  return null;
}
const poleMat = new THREE.MeshLambertMaterial({ color: 0xe08a2a }), railMat = new THREE.MeshLambertMaterial({ color: 0xb8b8b0 });
/* 每个在建的东西一个施工围栏 + 牌子（施工队可以有好几个） */
const sites = new Map();      // key → { g, st, top, lab }
function makeSite(st) {
  const g = new THREE.Group(), add = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; g.add(o) };
  const hw = st.w / 2, hd = st.d / 2;
  const posts = (len, n) => Array.from({ length: n + 1 }, (_, i) => -len / 2 + len * i / n);
  const nx = Math.max(1, Math.round(st.w / 2.4)), nz = Math.max(1, Math.round(st.d / 2.4));
  for (const x of posts(st.w, nx)) for (const z of [-hd, hd]) add(0.1, st.h, 0.1, poleMat, x, st.h / 2, z);
  for (const z of posts(st.d, nz)) for (const x of [-hw, hw]) add(0.1, st.h, 0.1, poleMat, x, st.h / 2, z);
  for (const y of [st.h * 0.5, st.h]) { for (const z of [-hd, hd]) add(st.w, 0.07, 0.07, railMat, 0, y, z); for (const x of [-hw, hw]) add(0.07, 0.07, st.d, railMat, x, y, 0) }
  /* 正面一块黄黑相间的「施工中」挡板 */
  const tape = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(2.4, st.w * 0.8), 0.5), new THREE.MeshBasicMaterial({ map: stripeTex(), side: THREE.DoubleSide }));
  tape.position.set(0, 0.55, hd + 0.06); g.add(tape);
  /* 0.29 动物棚施工：棚里堆木板、木头、工具，像在搭棚子 */
  if (st.ranch) [['resource-planks', -1.2, -1.5, 0.3, 2], ['resource-wood', 1.3, 0.8, 1.2, 2], ['resource-planks', 0.6, -2.6, 2.1, 1.8], ['tool-shovel', -0.4, 1.8, 0.6, 2.2], ['tool-hoe', 0.2, 1.9, -0.4, 2.2], ['box-large', -1.6, 2.6, 0, 1.6], ['workbench', 1.4, -1, 1.57, 2]].forEach(([n, x, z, ry, sc]) => { const o = prop(n, { scale: sc * 1.5, tint: 0xd8c8a8 }); if (o) { o.position.set(x, 0, z); o.rotation.y = ry; g.add(o) } });
  g.position.set(st.x, 0, st.z); scene.add(g); return g;
}
let _stripe = null;
function stripeTex() { if (_stripe) return _stripe; const c = document.createElement('canvas'); c.width = 128; c.height = 32; const x = c.getContext('2d');
  x.fillStyle = '#f2c230'; x.fillRect(0, 0, 128, 32); x.fillStyle = '#222'; for (let i = -32; i < 160; i += 24) { x.beginPath(); x.moveTo(i, 32); x.lineTo(i + 12, 32); x.lineTo(i + 44, 0); x.lineTo(i + 32, 0); x.fill() }
  _stripe = new THREE.CanvasTexture(c); _stripe.colorSpace = THREE.SRGBColorSpace; return _stripe }
function updSite() {
  const lk = JSON.stringify(S.layout) + '|' + JSON.stringify(S.fix && S.fix.ws || []) + '|' + S.lv.store;   // 六（10-21 修）：以前 key 里只有货柜摆法，工坊机器挪了施工围栏还在原地
  const want = new Map(S.builds.map(b => [b.k + ':' + b.to + ':' + (b.i ?? '') + ':' + lk, b]));   // 布置改了、店面扩大了，施工位置跟着变
  for (const [key, s] of sites) if (!want.has(key)) { if (s.g) { scene.remove(s.g); s.g.traverse(o => { if (o.geometry) o.geometry.dispose() }) } s.lab.remove(); sites.delete(key) }
  for (const [key, b] of want) {
    let s = sites.get(key);
    if (!s) { const st = siteOf(b.k, b.to, b), top = new THREE.Vector3(); s = { st, top, g: st ? makeSite(st) : null, lab: UI.label(() => top) }; sites.set(key, s);
      if (st) top.set(st.x, st.h + (b.k === 'bag' ? 1.9 : 1.2), st.z); if (st && st.ranch) top.copy(penFront(b.k)).setY(2.4) }   // 动物棚：施工牌放在棚门口   // 回收机、建造台头顶本来有牌子，施工牌再往上放
    if (!s.st || b.k === 'rec') { s.lab.set(''); continue }     // 回收机施工进度写在它自己的牌子上
    const bb = BUILD[b.k], lv = b.k === 'bag' ? BAG_SIZES[b.to] : b.to, nm = b.k === 'tower' ? `${TOWERS[S.towers[b.i] ? S.towers[b.i].k : 'gun'].name}${b.to === 1 ? ' 建造' : ` → ${b.to} 级`}` : b.k === 'tier' ? `${FIXTURE[S.shelves[b.i].type].tiers[b.to - 1]}（${TIER_NAME[b.to]}）` : `${bb.name} → ${lv} ${bb.unit}`;
    s.lab.set(`<div class="box">施工中：${nm}<br><small>还要 ${UI.fmtT(b.left)}</small><span class="pg"><i></i></span></div>`, (1 - b.left / b.total) * 100);
  }
}

/* ---------- 货架挡路：建好的货架不能穿过去 ---------- */
const shelfBoxes = () => S.shelves.map((_, i) => { const l = S.layout[i]; if (!l) return { x0: 0, x1: 0, z0: 0, z1: 0 }; const w = LY.shelfWorld(l), [fw, fd] = LY.footSize(l), hw = fw / 2 - 0.15, hd = fd / 2 - 0.15; return { x0: w.x - hw, x1: w.x + hw, z0: w.z - hd, z1: w.z + hd } });

/* ---------- 布置：俯视超市、按网格拖动货架 ----------
   规则在 layout.js：货架四周留一格通道；门口、排队、收银员站的地方不能放；顾客要走得到每个货架。
   参考常见经营游戏：拖动时货架贴着网格走，脚下绿色 = 能放、红色 = 不能放（松手会弹回原处并说明原因）；
   选中的货架可以「旋转」；「还原」回到默认摆法；「完成」才生效，「取消」不保存。布置时游戏暂停。 */
let lay = null;
/* 0.45 布置有两张网格：店里（LY.G）和露天工坊（LY.WG，院子西北角）；在工坊里点「布置」就只摆机器 */
const GRS = { store: { G: LY.G, cx: LY.cx, cz: LY.cz, toCell: LY.toCell, block: LY.isBlock, keep: LY.isKeep },
  ws: { G: LY.WG, cx: LY.wcx, cz: LY.wcz, toCell: LY.wsToCell, block: () => false, keep: (c, r) => c === LY.WS_ENTRY[0] && r === LY.WS_ENTRY[1] } };
const GR = () => GRS[lay && lay.mode === 'ws' ? 'ws' : 'store'];
const inWsArea = p => p.x > WS_AREA.x0 && p.x < WS_AREA.x1 && p.z > WS_AREA.z0 && p.z < WS_AREA.z1 + 1.5;
const layGroup = new THREE.Group(); layGroup.visible = false; scene.add(layGroup);
const cellGeo = new THREE.PlaneGeometry(LY.G.cell * 0.94, LY.G.cell * 0.94);
const cellMat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.5, depthWrite: false });
const M_OK = cellMat(0x48d060), M_BAD = cellMat(0xe8503a), M_RING = cellMat(0xf2d27a), M_END = new THREE.MeshBasicMaterial({ color: 0xf2d27a, transparent: true, opacity: 0.22, depthWrite: false });
let gridMesh = null; const markGroup = new THREE.Group(); layGroup.add(markGroup);
function gridOverlay() {
  if (gridMesh) return gridMesh;
  const Q = GR(), GG = Q.G, px = 32, c = document.createElement('canvas'); c.width = GG.cols * px; c.height = GG.rows * px; const g = c.getContext('2d');
  for (let r = 0; r < GG.rows; r++) for (let k = 0; k < GG.cols; k++) {
    g.fillStyle = Q.block(k, r) ? 'rgba(40,30,25,.55)' : Q.keep(k, r) ? 'rgba(80,150,230,.35)' : 'rgba(255,255,255,.06)';
    g.fillRect(k * px, r * px, px, px); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.5; g.strokeRect(k * px + .5, r * px + .5, px - 1, px - 1) }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  gridMesh = new THREE.Mesh(new THREE.PlaneGeometry(GG.cols * GG.cell, GG.rows * GG.cell), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  gridMesh.rotation.x = -Math.PI / 2; gridMesh.position.set(GG.x0 + GG.cols * GG.cell / 2, 0.045, GG.z0 + GG.rows * GG.cell / 2); gridMesh.renderOrder = 5;
  layGroup.add(gridMesh); return gridMesh;
}
function layMarks() {
  markGroup.clear(); if (!lay || !lay.sel) return;
  const bad = !!lay.why, own = selCells(lay.sel);
  const put = (c, r, m, y) => { const o = new THREE.Mesh(cellGeo, m); o.rotation.x = -Math.PI / 2; o.position.set(GR().cx(c), y, GR().cz(r)); o.renderOrder = 6; markGroup.add(o) };
  if (lay.sel.t === 's') { const s = lay.l[lay.sel.i];
    for (const [c, r] of LY.frontRow(s)) put(c, r, M_RING, 0.05);                          // 正面：顾客站的地方，要空着
    for (const side of [-1, 1]) for (const [c, r] of LY.endCol(s, side)) put(c, r, M_END, 0.05) }   // 左右两头：至少一头要空着
  if (lay.sel.t === 'w') { const w = lay.fx.ws[lay.sel.i]; for (const [c, r] of LY.frontRow({ ...w, t: '_' + w.k })) put(c, r, M_RING, 0.05) }   // 机器正面：干活的人站的地方
  if (lay.sel.t === 'r') { for (const [c, r] of LY.queueCells(lay.fx.reg)) put(c, r, M_RING, 0.05); for (const [c, r] of LY.cashierRow(lay.fx.reg)) put(c, r, M_END, 0.05) }   // 排队的线、收银员站的地方
  for (const [c, r] of own) put(c, r, bad ? M_BAD : M_OK, 0.06);
}
function layCheck() { const p = lay.mode === 'ws' ? LY.wsProblem(lay.fx.ws || []) : LY.layoutProblem(lay.l, lay.n); lay.why = p ? p.why : '' ; return !p }
function layMsg(txt, cls = '') { const m = $('#layMsg'); if (m) { m.textContent = txt; m.className = 'lmsg ' + cls } }
function layRender(keepMsg) {
  /* 字别挡货柜：顶上只留一个小标题 + 一行提示，说明和颜色图例收进「?」里，点开才显示；拖动时所有字变淡 */
  const msg = keepMsg && $('#layMsg') ? $('#layMsg').outerHTML : '<div id="layMsg" class="lmsg">点一样东西选中，按住拖动</div>';
  const wsM = lay && lay.mode === 'ws', hid = lay && !wsM ? lay.fx.deco.map((d, i) => [d, i]).filter(([d]) => d.hide) : [];
  $('#layUI').innerHTML = `<div class="ltop"><div class="ltitle"><b>${wsM ? '布置工坊' : '布置超市'}</b><button class="lhelpb" data-lay="help">?</button></div>${msg}</div>
    <div class="lhelp hidden"><p>${wsM ? '工坊的厨房、机器都能拖动、旋转：正面空一格给工匠站，从南边入口（蓝色那格）要走得到每台机器前面。' : '店里的东西都能拖动、旋转：货柜正面空一格给顾客站，左右至少一头能走人，背面可以靠墙；收银台正面要空出一条线给顾客排队，背面站收银员；装饰可以「收起」不摆。'}</p>
      <div class="legend"><span><i style="background:#48d060"></i>能放</span><span><i style="background:#e8503a"></i>不能放</span><span><i style="background:#f2d27a"></i>正面要空着 / 排队的线（两头淡黄：至少空一头；收银台背后：收银员站）</span><span><i style="background:#5096e6"></i>门口、排队、收银（空着）</span></div></div>
    ${hid.length ? `<div class="ltray"><span>收起来的：</span>${hid.map(([d, i]) => `<button class="btn sm ghost" data-lay="show:${i}">摆出${LY.FIX_NAME[d.k]}</button>`).join('')}</div>` : ''}
    <div class="lzoom"><button class="zl" data-lay="zin">＋</button><div class="ztrack"><i class="zfill"></i><b class="zknob"></b></div><button class="zl" data-lay="zout">－</button></div>
    <div class="laybar">${lay && lay.sel && lay.sel.t === 'd' ? '<button class="btn ghost" data-lay="hide">收起</button>' : ''}<button class="btn ghost" data-lay="rot">旋转</button><button class="btn ghost" data-lay="reset">还原</button><button class="btn ghost" data-lay="cancel">取消</button><button class="btn" data-lay="done">完成</button></div>`;
}
function enterLayout() {
  if (lay || creating) return;
  const mode = inWsArea(P.pos) ? 'ws' : 'store';
  if (mode === 'store' && !S.shelves.length) { UI.toast('还没有货柜', 'bad'); return }
  if (mode === 'ws' && !(S.fix.ws || []).length) { UI.toast('工坊里还没有机器', 'bad'); return }
  UI.closePanel(); $('#hud').classList.add('hidden'); $('#labels').classList.add('hidden'); $('#joyzone').style.display = 'none';
  $('#layBtn').classList.add('hidden'); $('#farmBtn').classList.add('hidden');
  lay = { mode, l: S.layout.map(x => ({ ...x })), fx: JSON.parse(JSON.stringify(S.fix)), n: S.shelves.length, sel: null, drag: null, why: '', zoom: LAY_ZOOM.def, px: 0, pz: 0 };
  LY.setFixtures(lay.fx); regrid();
  gridOverlay(); layGroup.visible = true;
  for (const c of customers.values()) c.m.visible = false; player.visible = false;
  $('#layUI').classList.remove('hidden'); layRender(); layMarks();
}
function exitLayout(save) {
  if (!lay) return;
  if (save) {
    S.layout = lay.l; S.fix = lay.fx; LY.fixLayout(S); SV.saveNow();
    /* 店里的顾客按新的摆法重新找路 */
    for (const [id, c] of customers) { const p = c.m.position;
      if (c.mode === 'shop' && c.e) { c.pts = gridPath(cellOf(p), LY.frontCell(S.layout[lastShelf(c.e)] || S.layout[0])); c.i = 0 }
      else if (c.mode === 'out' || c.mode === 'browse') { c.pts = exitPts(p); c.i = 0; c.mode = 'out' } }
    UI.toast('摆好了', 'good');
  } else LY.setFixtures(S.fix);
  regrid();
  lay = null; layGroup.visible = false; markGroup.clear(); syncShelves();
  for (const c of customers.values()) c.m.visible = true; player.visible = true;
  $('#layUI').classList.add('hidden'); $('#layUI').innerHTML = ''; $('#hud').classList.remove('hidden'); $('#labels').classList.remove('hidden'); $('#joyzone').style.display = '';
  last = performance.now();
}
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
function cellAt(e) { const r = renderer.domElement.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, camera); return ray.ray.intersectPlane(ground, hitP) ? GR().toCell(hitP.x, hitP.z) : null }
/* 选中的东西：{t:'s', i} 货柜 / {t:'r'} 收银台 / {t:'d', i} 装饰 */
function itemAt(c, r) {
  const hit = it => LY.cellsOf(it).some(([a, b]) => a === c && b === r);
  if (lay.mode === 'ws') { const ws = lay.fx.ws || []; for (let i = 0; i < ws.length; i++) if (hit({ ...ws[i], t: '_' + ws[i].k })) return { t: 'w', i }; return null }   // 0.45 露天工坊：只摆机器
  for (let i = 0; i < lay.n; i++) if (hit(lay.l[i])) return { t: 's', i };
  if (hit({ ...lay.fx.reg, t: '_reg' })) return { t: 'r' };
  for (let i = 0; i < lay.fx.deco.length; i++) { const d = lay.fx.deco[i]; if (!d.hide && hit({ ...d, t: '_' + d.k })) return { t: 'd', i } }
  return null;
}
const selGet = sel => sel.t === 's' ? lay.l[sel.i] : sel.t === 'r' ? lay.fx.reg : sel.t === 'w' ? lay.fx.ws[sel.i] : lay.fx.deco[sel.i];
const selCells = sel => sel.t === 's' ? LY.cellsOf(lay.l[sel.i]) : sel.t === 'r' ? LY.regCells(lay.fx.reg) : sel.t === 'w' ? LY.wsCells(lay.fx.ws[sel.i]) : LY.decoCells(lay.fx.deco[sel.i]);
function selSet(sel, v) {
  if (sel.t === 's') { lay.l[sel.i] = v; return }
  if (sel.t === 'r') lay.fx.reg = v; else if (sel.t === 'w') lay.fx.ws[sel.i] = v; else lay.fx.deco[sel.i] = v;
  LY.setFixtures(lay.fx); lay.gridDirty = true;           // 收银台、装饰挪了：能放的格子变了，地上的格子图重画
}
function regrid() { if (gridMesh) { layGroup.remove(gridMesh); gridMesh.material.map.dispose(); gridMesh.material.dispose(); gridMesh.geometry.dispose(); gridMesh = null } if (lay) gridOverlay() }
function selName(sel) {
  if (sel.t === 'r') return '收银台：正面那条线是排队的地方，背面站收银员';
  if (sel.t === 'd') return `${LY.FIX_NAME[lay.fx.deco[sel.i].k]}：可以挪、转，也可以「收起」`;
  if (sel.t === 'w') return `${BUILD[lay.fx.ws[sel.i].k].name}：只能放在工坊里，正面空一格给人站`;
  const i = sel.i; return `第 ${i + 1} 个：${FIXTURE[S.shelves[i].type].tiers[S.shelves[i].tier - 1]}${L.slotsOf(S.shelves[i]).some(sl => sl.g) ? '（' + L.slotsOf(S.shelves[i]).filter(sl => sl.g).map(sl => GOODS[sl.g].name).join('、') + '）' : ''}`;
}
function layApply() { if (lay && lay.gridDirty) { lay.gridDirty = false; regrid() } syncShelves(); layMarks() }
const layPts = new Map();   // 屏幕上按着的手指（双指捏放大缩小、拖着看）
const LAY_ZOOM = { def: 1.15, min: 1, max: 3 };
/* 0.20 用户：放大缩小做成竖条，手指上下拖（上面放大、下面缩小）；按对数刻度，拖起来均匀 */
const zFrac = z => Math.log(z / LAY_ZOOM.min) / Math.log(LAY_ZOOM.max / LAY_ZOOM.min), fracZ = f => LAY_ZOOM.min * Math.pow(LAY_ZOOM.max / LAY_ZOOM.min, Math.max(0, Math.min(1, f)));
function zoomKnob() { const tr = $('#layUI .ztrack'); if (!tr) return; const f = zFrac(lay.zoom); if (tr._z !== undefined && Math.abs(f - tr._z) < 0.002) return; tr._z = f; tr.style.setProperty('--z', f.toFixed(3)) }   // 面板重画后新的轨道也会补上
let zDrag = null;
document.addEventListener('pointerdown', e => { const tr = e.target.closest && e.target.closest('#layUI .ztrack'); if (!tr || !lay) return; e.preventDefault(); zDrag = { id: e.pointerId, tr }; tr.setPointerCapture && tr.setPointerCapture(e.pointerId); zSet(e) });
const zSet = e => { const r = zDrag.tr.getBoundingClientRect(); lay.zoom = fracZ(1 - (e.clientY - r.top - 8) / (r.height - 16)) };
document.addEventListener('pointermove', e => { if (zDrag && e.pointerId === zDrag.id && lay) zSet(e) });
document.addEventListener('pointerup', e => { if (zDrag && e.pointerId === zDrag.id) zDrag = null });
document.addEventListener('pointercancel', e => { if (zDrag && e.pointerId === zDrag.id) zDrag = null });
const layZoomBy = k => { if (lay) lay.zoom = Math.max(LAY_ZOOM.min, Math.min(LAY_ZOOM.max, lay.zoom * k)) };
const pinchInfo = () => { const [a, b] = [...layPts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
renderer.domElement.addEventListener('wheel', e => { if (!lay) return; e.preventDefault(); layZoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12) }, { passive: false });
renderer.domElement.addEventListener('pointerdown', e => {
  if (!lay) return; const hp = $('#layUI .lhelp'); if (hp) hp.classList.add('hidden');   // 点场景就收起说明
  layPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (layPts.size === 2) {   // 第二根手指按下：取消拖货柜，开始捏合 / 平移
    if (lay.drag) { selSet(lay.sel, lay.drag.orig); lay.drag = null; $('#layUI').classList.remove('dragging'); layCheck(); layApply() }
    lay.pinch = pinchInfo(); lay.pan = null; return }
  if (layPts.size > 2) return;
  const cell = cellAt(e);
  if (!cell || (!lay.sel && !itemAt(...cell))) { lay.pan = { x: e.clientX, y: e.clientY, id: e.pointerId }; return }   // 没选中东西时拖空地 = 挪镜头
  const hit = itemAt(...cell);
  if (hit) { const it = selGet(hit); lay.sel = hit; lay.drag = { off: [it.c - cell[0], it.r - cell[1]], orig: { ...it }, id: e.pointerId }; renderer.domElement.setPointerCapture(e.pointerId); $('#layUI').classList.add('dragging');
    layCheck(); layMsg(selName(hit) + (hit.t === 's' ? '，拖到想放的地方' : '')); layRender(true); layMarks(); return }
  /* 已经选中了，点空地：直接搬过去（放得下才搬） */
  if (lay.sel) { const old = { ...selGet(lay.sel) }; selSet(lay.sel, { ...old, c: cell[0], r: cell[1] });
    if (!layCheck()) { const w = lay.why; selSet(lay.sel, old); layCheck(); layMsg('放不下：' + w, 'bad') } else layMsg('搬过去了', 'good'); layApply() }
});
renderer.domElement.addEventListener('pointermove', e => {
  if (!lay) return;
  if (layPts.has(e.pointerId)) layPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (lay.pinch && layPts.size >= 2) { const p = pinchInfo(); if (lay.pinch.d > 0) layZoomBy(p.d / lay.pinch.d); lay.px -= (p.x - lay.pinch.x) * (lay.wpp || 0.02); lay.pz -= (p.y - lay.pinch.y) * (lay.wpp || 0.02); lay.pinch = p; return }
  if (lay.pan && e.pointerId === lay.pan.id) { lay.px -= (e.clientX - lay.pan.x) * (lay.wpp || 0.02); lay.pz -= (e.clientY - lay.pan.y) * (lay.wpp || 0.02); lay.pan.x = e.clientX; lay.pan.y = e.clientY; return }
  if (!lay.drag || e.pointerId !== lay.drag.id) return; const cell = cellAt(e); if (!cell) return;
  const it = selGet(lay.sel), c = cell[0] + lay.drag.off[0], r = cell[1] + lay.drag.off[1]; if (it.c === c && it.r === r) return;
  selSet(lay.sel, { ...it, c, r }); layCheck(); layMsg(lay.why ? '这里不行：' + lay.why : '这里可以放', lay.why ? 'bad' : 'good'); layApply();
});
const layUp = e => {
  layPts.delete(e.pointerId); if (!lay) return;
  if (layPts.size < 2) lay.pinch = null; if (lay.pan && lay.pan.id === e.pointerId) lay.pan = null;
  if (!lay.drag || e.pointerId !== lay.drag.id) return;
  if (!layCheck()) { const w = lay.why; selSet(lay.sel, lay.drag.orig); layCheck(); layMsg('放不下，回到原处：' + w, 'bad') }
  lay.drag = null; $('#layUI').classList.remove('dragging'); layApply();
};
renderer.domElement.addEventListener('pointerup', layUp); renderer.domElement.addEventListener('pointercancel', layUp);
/* 收起来的装饰重新摆出来：从店里找一个放得下的地方 */
function showDeco(i) {
  const d = lay.fx.deco[i];
  for (const rot of [0, 1, 2, 3]) for (let r = 0; r < LY.G.rows; r++) for (let c = 0; c < LY.G.cols; c++) {
    lay.fx.deco[i] = { ...d, c, r, rot, hide: false }; LY.setFixtures(lay.fx);
    if (!LY.layoutProblem(lay.l, lay.n)) { lay.gridDirty = true; return true }
  }
  lay.fx.deco[i] = d; LY.setFixtures(lay.fx); return false;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-lay]'); if (!b || !lay) return; const a = b.dataset.lay;
  if (a === 'zin' || a === 'zout') { layZoomBy(a === 'zin' ? 1.25 : 0.8); return }
  if (a === 'help') { $('#layUI .lhelp').classList.toggle('hidden'); return }
  if (a === 'cancel') return exitLayout(false);
  if (a === 'done') { if (!layCheck()) { layMsg('还有问题：' + lay.why, 'bad'); return } return exitLayout(true) }
  if (a === 'reset' && lay.mode === 'ws') { lay.fx.ws = []; LY.fixWs({ fix: lay.fx, lv: S.lv }); lay.sel = null; layCheck(); layRender(); layMsg('机器回到默认摆法了'); layApply(); return }
  if (a === 'reset') { const keepWs = lay.fx.ws, keepV = lay.fx.wsV; lay.fx = LY.defaultFix(false); lay.fx.ws = keepWs; lay.fx.wsV = keepV; LY.setFixtures(lay.fx); lay.gridDirty = true;   // 店里还原：工坊的机器不动
    const t = { lv: S.lv, shelves: S.shelves, layout: null, fix: lay.fx }; LY.fixLayout(t); lay.fx = t.fix; LY.setFixtures(lay.fx); lay.l = t.layout; lay.sel = null; layCheck(); layRender(); layMsg('回到默认摆法了'); layApply(); return }
  if (a === 'hide') { if (!lay.sel || lay.sel.t !== 'd') { layMsg('先点一下要收起的装饰（货柜和收银台不能收起）', 'bad'); return }
    selSet(lay.sel, { ...selGet(lay.sel), hide: true }); lay.sel = null; layCheck(); layRender(); layMsg('收起来了，左下角能再摆出来', 'good'); layApply(); return }
  if (a.startsWith('show:')) { const i = +a.slice(5); if (showDeco(i)) { lay.sel = { t: 'd', i }; layCheck(); layRender(); layMsg(`${LY.FIX_NAME[lay.fx.deco[i].k]}摆出来了，拖到想放的地方`, 'good') } else layMsg('店里没地方了', 'bad'); layApply(); return }
  if (a === 'rot') { if (!lay.sel) { layMsg('先点一下要转的东西', 'bad'); return }
    const old = selGet(lay.sel); selSet(lay.sel, { ...old, rot: (old.rot + 1) % 4 });
    if (!layCheck()) { const w = lay.why; selSet(lay.sel, old); layCheck(); layMsg('转不过来：' + w, 'bad') } else layMsg(lay.sel.t === 'r' ? '转好了，亮的那条线是排队的地方' : lay.sel.t === 's' ? '转好了，正面（亮的那一格）是顾客站的地方' : lay.sel.t === 'w' ? '转好了，亮的那一排是干活的人站的地方' : '转好了', 'good'); layApply() }
});
$('#layBtn').onclick = () => enterLayout();

/* ---------- 尸潮塔防 ---------- */
const bjDay = () => new Date(SV.srvNow() + 8 * 3600e3).toISOString().slice(0, 10);       // 北京时间的日期（每天 0 点重置次数）
UI.setDayFn(bjDay);   // 设计 43：商店里每日免费（设计 112：星星）按北京时间的日期判断
let tdGun = null;
const TDR = createTD({ scene, camera, W, L, UI, P, get player() { return player }, S: () => S, animH, hero: () => L.heroStats(S), eco: () => eco,
  mkZombie: i => mkHuman('zombie', i, { skin: 0x8fae7a, shirt: 0x5a5f6a, pants: 0x3a3a3a, hair: 0x2a2a2a, zombie: true }),
  onHit: () => { UI.flash(); shake = 0.25; face('hurt', 0.5) },
  shake: a => { shake = Math.max(shake, a) },
  collide: p => { collide(p, 0.4, W.obstacles); collide(p, 0.4, shelfBoxes()) },
  aimArms: m => aimArms(m), muzzleOf: m => { const g = m.userData.gun; return g && g.visible ? (m.updateMatrixWorld(true), g.localToWorld(M16_TIP.clone())) : m.position.clone().setY(1.1) },
  onEnd: r => tdFinish(r) });
/* ---------- 设计 56：副本。院子东北角的传送门（一直显示，超市 5 级才能进），进门打开副本面板选关 ---------- */
const portal = createPortal(); portal.group.position.copy(PORTAL_POS); scene.add(portal.group);
W.obstacles.push({ x0: PORTAL_POS.x - 2.4, x1: PORTAL_POS.x - 0.78, z0: PORTAL_POS.z - 0.8, z1: PORTAL_POS.z + 0.75 }, { x0: PORTAL_POS.x + 0.78, x1: PORTAL_POS.x + 2.4, z0: PORTAL_POS.z - 0.8, z1: PORTAL_POS.z + 0.75 });   // 两边门柱挡人
const PORTAL_FRONT = new THREE.Vector3(PORTAL_POS.x, 0, PORTAL_POS.z + 2.3);
let fbWalk = null, gotCb = null;
const fbHero = () => ({ ...FL.fbHero(S, L.heroStats(S)), speed: PLAYER.speed });
const FBV = createFB({ get player() { return player }, P, camera, moveDir, animH, aimArms, holdGun, UI: { ...UI, ...UI.raw },   /* 设计 97：副本自己的飘字、提示不受「副本里不显示超市飘字」影响 */
  muzzleOf: m => { const g = m.userData.gun; return g && g.visible ? (m.updateMatrixWorld(true), g.localToWorld(M16_TIP.clone())) : m.position.clone().setY(1.1) },
  mkZombie: i => mkHuman('zombie', i, { skin: 0x8fae7a, shirt: 0x5a5f6a, pants: 0x3a3a3a, hair: 0x2a2a2a, zombie: true }),
  shake: a => { shake = Math.max(shake, a) },
  cameraShake: dt => { if (shake > 0) { shake -= dt; camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake } },
  hurt: () => { UI.flash(); face('hurt', 0.5) },
  drawAvatar: c => { if (S && S.look) drawLookAvatar(c, S.look, { bg: '#3a332b', crop: 'head' }) },
  panelOpen: () => UI.panelOpen(),
  finish: (n, win, t) => { let r = null; if (win) r = FL.fbWin(S, n, Math.random, t); else FL.fbLose(S); SV.saveNow(); return r },
  showGot: (res, cb) => { gotCb = cb; UI.openPanel('fbGot') },
  again: n => fbAgain(n), tixHave: () => (S.fb && S.fb.tix) || 0, onExit: () => fbLeave() });
/* 「获得」框收好了（穿上 / 收下 / 分解）：关框，接着做后面的（副本里出「再打一次」「回超市」） */
function gotDone() { if (S.fb.pend) return; if (UI.curPanel() === 'fbGot') UI.closePanel(); if (gotCb) { const c = gotCb; gotCb = null; c() } }
/* 设计 74：超市够级、走到传送门附近或打开副本面板时，后台先把副本读好（失败不提示，过 30 秒才再试；点「挑战」时照常读） */
let fbPreT = -1e9;
function fbPreload() { const now = performance.now(); if (now - fbPreT < 30000) return; fbPreT = now; const two = S.fb.won[1] > 0, three = S.fb.won[2] > 0;   /* 设计 81：第 1 关打赢过，第 2 关（毒囊包）也先下、先读；设计 102：第 2 关打赢过，第 3 关也先读 */
  AD.ensurePack('fb1').then(() => FBV.preload(1)).then(a => { if (!a) fbPreT = now + 270000; return two ? AD.ensurePack('fb2').then(() => FBV.preload(2)).then(() => three ? AD.ensurePack('fb3').then(() => FBV.preload(3)) : null) : null }) }   /* 设计 75：先下进手机资源库，再读 */   // 后台读失败：5 分钟内不再自己读（断网时别一直下）
function fbLoad(txt, work, fail) {
  const ov = $('#scavLoad'), bar = $('#scavBarI'); $('#scavTxt').textContent = txt; $('#scavTip').textContent = '地上出红色预警就躲开，填满就打下来；震荡弹能打断白色施法条'; bar.style.width = '10%'; ov.classList.remove('hidden');
  const t0 = performance.now();
  setTimeout(async () => { try { await work() } catch (e) { console.error(e); if (fail) fail(e); else UI.raw.toast('副本没读出来，再试一次', 'bad') }
    bar.style.width = '100%'; setTimeout(() => { ov.classList.add('hidden'); last = performance.now(); UI.flash() }, Math.max(150, 700 - (performance.now() - t0))) }, 60);
}
function fbGo(n) {
  if (TDR.active()) { UI.toast('尸潮中，打完再来', 'bad'); return }
  const w = FL.fbCanStart(S, n); if (w) { if ((S.fb.tix || 0) < FB.tix) toMerch('tix'); else UI.toast(w, 'bad'); return }
  UI.closePanel();
  /* 主角走进门（门光一亮）→ 读取界面 → 屠夫场地。设计 74：读好、进去了才扣召唤券（以前先扣券再读，读失败券白扣、S.fb.run 停着）；读失败主角从门里走回门前 */
  fbWalk = { from: P.pos.clone(), to: PORTAL_POS.clone().setZ(PORTAL_POS.z + 0.2), t: 0, dur: 0.85, done: () => fbLoad('正在进入副本…', async () => {
    await FBV.enter(n, fbHero(), S.look); FL.fbStart(S, n); SV.saveNow(); cur = FBV.scene(); UI.setLabelWorld('fb'); $('#hud').classList.add('hidden') }, () => fbFail(false)) };
  portal.flash();
}
function fbAgain(n) {
  const w = FL.fbCanStart(S, n);
  /* 设计 109：召唤券用完了——钱够 1 张就问要不要买 1 张接着打；不够就提示，留在结算界面（不自动回超市） */
  if (w && (S.fb.tix || 0) < FB.tix) { const c = FL.tixCost(1, false);
    if (S.coins >= c) UI.ask(`召唤券用完了。花 <b>${c}</b> 末日币买 1 张，再打一次？`, () => { if (FL.buyTix(S, 1, false)) { SV.saveNow(); fbAgain(n) } else UI.toast('末日币不够', 'bad') });
    else { const b = document.querySelector('#fbHud .fbend .fbbtns'); if (b) { const p = b.querySelector('.fbnote') || b.appendChild(document.createElement('div')); p.className = 'fbnote'; p.textContent = `召唤券用完了，末日币也不够（1 张要 ${c}）` } else UI.raw.toast(`召唤券用完了，末日币也不够（1 张要 ${c}）`, 'bad', 3500) }
    return }
  if (w) { UI.toast(w, 'bad'); return }
  /* 用户 10-25：人已经在副本里、东西都读好了，不要读取界面——屏幕黑一下（淡入 0.15 秒 → 重置场地 → 淡出 0.15 秒）就开打，不写字、不转圈、不硬等；真读失败照旧 fbFail */
  const ov = fbBlack(); ov.style.opacity = '1'; window.__fbAgainT0 = performance.now();
  setTimeout(async () => {
    try { await FBV.enter(n, fbHero(), S.look); FL.fbStart(S, n); SV.saveNow(); cur = FBV.scene() } catch (e) { console.error(e); ov.style.opacity = '0'; fbFail(true); return }
    last = performance.now(); requestAnimationFrame(() => { ov.style.opacity = '0'; window.__fbAgainT1 = performance.now() });
  }, 150);
}
let fbBlackEl = null;
function fbBlack() { if (!fbBlackEl) { fbBlackEl = document.createElement('div'); fbBlackEl.id = 'fbBlack'; Object.assign(fbBlackEl.style, { position: 'fixed', inset: '0', background: '#000', opacity: '0', pointerEvents: 'none', transition: 'opacity .15s linear', zIndex: '9000' }); document.body.appendChild(fbBlackEl) } return fbBlackEl }
/* 设计 74：进副本失败：券没扣（本来就是进去以后才扣），run 清零，回超市（再来一次时人在副本里，也回超市），主角走到门前站好 */
function fbFail(inFb) {
  FBV.abort(); if (S.fb.run) { S.fb.run = 0 } SV.saveNow();
  cur = scene; if (player.parent !== scene) scene.add(player); player.rotation.set(0, 0, 0); player.scale.set(1, 1, 1); player.visible = true; UI.setLabelWorld('main'); $('#hud').classList.remove('hidden');
  if (inFb) { P.pos.copy(PORTAL_POS).setZ(PORTAL_POS.z + 0.2); P.kb.set(0, 0); snapCam() }
  fbWalk = { from: P.pos.clone(), to: PORTAL_FRONT.clone(), t: 0, dur: 0.8, done: () => {} };
  UI.raw.toast('副本没读出来（网络不好？），召唤券没扣，再试一次', 'bad', 5000);
}
function fbLeave() {
  fbLoad('正在回超市…', async () => {
    cur = scene; scene.add(player); player.rotation.set(0, 0, 0); player.scale.set(1, 1, 1); player.visible = true; UI.setLabelWorld('main'); $('#hud').classList.remove('hidden');
    P.pos.copy(PORTAL_POS).setZ(PORTAL_POS.z + 0.2); P.kb.set(0, 0); snapCam();
    /* 打完（输赢都一样）从门里走出来，门光一亮；宝箱没开的话「获得」框在这里弹 */
    fbWalk = { from: P.pos.clone(), to: PORTAL_FRONT.clone(), t: 0, dur: 0.8, done: () => { if (S.fb.pend) { gotCb = null; UI.openPanel('fbGot') } } };
    portal.flash(); SV.saveNow();
  });
}
$('#fbBtn').onclick = () => {
  if (TDR.active()) { UI.toast('尸潮中，打完再来', 'bad'); return }
  if (S.lv.store < FB.store) { UI.toast(`超市升到 ${FB.store} 级才能进副本`, 'bad'); return }
  fbPreload(); UI.openPanel('fb');
};
/* 气氛：天变暗、发红 */
const ATMO = { bg: scene.background.clone(), fog: scene.fog.color.clone(), sun: W.sun.intensity, sunC: W.sun.color.clone(), hemi: W.hemi.intensity };
function atmo(on) {
  const red = new THREE.Color(0x5a2e2a);
  scene.background.copy(on ? red : ATMO.bg); scene.fog.color.copy(on ? red : ATMO.fog);
  W.sun.intensity = on ? ATMO.sun * 0.45 : ATMO.sun; W.sun.color.copy(on ? new THREE.Color(0xff8a70) : ATMO.sunC); W.hemi.intensity = on ? ATMO.hemi * 0.4 : ATMO.hemi;
  document.body.classList.toggle('tdon', on);
}
/* 枪挂到人物右手骨骼上（0.20 换成 M16，颜色跟 M16 等级走；没读到模型时用原来的 Kenney 小枪） */
/* 0.20：M16 端在胸前（挂在人物上，不挂在手上），两只手臂伸过去握住：右手握把、左手护木（aimArms 每帧在动画之后改手臂骨骼） */
const GUN_POSE = { len: 0.95, pos: [-0.1, 0.88, 0.34], grip: [0, -0.08, -0.1], fore: [0, -0.04, 0.18] };
const GUN_POSE_HM = { len: 0.9, pos: [-0.1, 0.8, 0.34], grip: [0, -0.08, -0.1], fore: [0, -0.04, 0.18] };   // V1.31 Q 版男主角：手短，枪端低一点
const gunPose = ch => ch.userData.hm ? GUN_POSE_HM : GUN_POSE;
function gunOnHand(ch, skin) {
  let g = makeM16(skin);
  if (!g) { const u = ch.userData, bone = u.bones && (u.bones.RightHand || Object.values(u.bones).find(b => /right.*hand/i.test(b.name))); g = prop('blaster-a', { scale: 1, tint: 0xd8d0c4 }); if (!g || !bone) return null;
    const ws = new THREE.Vector3(); ch.updateMatrixWorld(true); bone.getWorldScale(ws); g.scale.setScalar(0.55 / ws.x); g.rotation.set(0, Math.PI / 2, 0); bone.add(g); return g }
  const GP = gunPose(ch); g.scale.setScalar(GP.len); g.position.set(...GP.pos); ch.add(g); ch.userData.gun = g; return g;
}
const _ad = new THREE.Vector3(), _aq = new THREE.Quaternion(), _ap = new THREE.Vector3(), _at = new THREE.Vector3(), _ae = new THREE.Vector3(), _pole = new THREE.Vector3(), _bp = new THREE.Vector3();
/* 把 bone 转到让它的子骨骼 child 指向世界坐标 tgt */
function pointBone(bone, child, tgt) {
  bone.getWorldPosition(_bp); _ad.subVectors(tgt, _bp).normalize();
  bone.parent.getWorldQuaternion(_aq).invert(); _ad.applyQuaternion(_aq);
  bone.quaternion.setFromUnitVectors(_ap.copy(child.position).normalize(), _ad); bone.updateMatrixWorld(true);
}
/* 两节手臂 IK：肩到手的距离不够时肘往下、往外弯 */
function aimArms(ch) {
  const g = ch.userData.gun, b = ch.userData.bones; if (!g || !g.visible || !b) return;
  ch.updateMatrixWorld(true);
  for (const [arm, fore, hand, pt, side] of [[b.RightArm, b.RightForeArm, b.RightHand, gunPose(ch).grip, -1], [b.LeftArm, b.LeftForeArm, b.LeftHand, gunPose(ch).fore, 1]]) {
    if (!arm || !fore || !hand || !arm.parent) continue;
    g.localToWorld(_at.set(pt[0], pt[1], pt[2]));                                   // 手要放的地方
    const S0 = arm.getWorldPosition(new THREE.Vector3()), E0 = fore.getWorldPosition(new THREE.Vector3()), H0 = hand.getWorldPosition(new THREE.Vector3());
    const a = S0.distanceTo(E0), c = E0.distanceTo(H0), dv = new THREE.Vector3().subVectors(_at, S0), d = Math.min(dv.length(), a + c - 1e-3);
    dv.normalize();
    const cosA = Math.max(-1, Math.min(1, (a * a + d * d - c * c) / (2 * a * d))), sinA = Math.sqrt(1 - cosA * cosA);
    _pole.set(side * 0.6, -1, 0).applyQuaternion(ch.getWorldQuaternion(_aq)); _pole.addScaledVector(dv, -_pole.dot(dv)).normalize();   // 肘的方向：往下、往外
    _ae.copy(S0).addScaledVector(dv, cosA * a).addScaledVector(_pole, sinA * a);
    pointBone(arm, fore, _ae); pointBone(fore, hand, _at); hand.quaternion.identity();
  }
}
/* 角色面板的 3D 预览（0.20）：单独一个小画布 + 自己的渲染器，主角（自己选的样子）端着 M16 慢慢转；只在面板开着时画 */
const heroView = (() => {
  let R = null, sc = null, cam = null, ch = null, gun = null, cv = null, key = '', shw = null, withGun = false, fw = 0, fh = 0;
  let aura = null, auraKey = '';   // 设计 85：套装光效（换装、升星后马上刷新：每帧比一下穿的几件和星）
  /* 设计 63：装备页的主角手里拿着穿的武器（没有每把武器单独的模型：用 M16，颜色按武器品质——普通黑、史诗 / 套装迷彩、传说金；没穿武器拿默认 M16，颜色跟角色页一样） */
  const WSKIN = { n: 'black', e: 'camo', s: 'camo', l: 'gold' };
  const gunSkin = () => { const w = S.fb && S.fb.eq && S.fb.eq.w; return w && ITEMS[w.k] ? WSKIN[ITEMS[w.k].q] || 'black' : HERO.skin(S.hero.dmg || 1) };
  const keyOf = () => HERO.skin(S.hero.dmg || 1) + JSON.stringify(S.look || {}) + (withGun ? '|g' + gunSkin() : '');
  function build() {
    cv = document.createElement('canvas'); cv.className = 'heroCv';
    R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); R.setPixelRatio(Math.min(2, devicePixelRatio)); R.setSize(220, 260, false);
    R.outputColorSpace = renderer.outputColorSpace; R.toneMapping = renderer.toneMapping;
    sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xfff4e0, 0x5a5048, 1.6)); const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(2, 4, 3); sc.add(d);
    aura = makeAura(sc);
    cam = new THREE.PerspectiveCamera(30, 220 / 260, 0.1, 50); cam.position.set(0, 1.0, 4.6); cam.lookAt(0, 1.0, 0);   // 设计 18l：平视
  }
  function refresh() {
    if (!R) return; key = keyOf();
    if (ch) { sc.remove(ch); ch = null; gun = null }
    shw = makeShowcase();   // 设计 18l 最新版：展示用人物（只有发型头、套装、骨骼、待机动作，不挂任何东西）
    if (shw) { if (S.look) shw.set(S.look); ch = shw.root } else { ch = mkHuman('player', 0, { pack: true }); if (S.look) setLook(ch, S.look, LOOK) }
    sc.add(ch); if (aura) aura.attach(ch);
    if (withGun) { if (shw) { ch.userData.bones = shw.M.bones; ch.userData.hm = true } gun = gunOnHand(ch, gunSkin()) }
  }
  /* 设计 76：画布按框的实际大小画（以前固定 220 × 260、CSS 硬拉到装备页 84 × 150 的框里，人被横向压窄）；
     相机比例 = 框的宽 / 高；视角 30° 竖着不变（头到脚一样大），框太窄、左右放不下 1.2 米时往后退 */
  function fit() {
    const el = cv && cv.parentNode; if (!el) return; const w = el.clientWidth, h = el.clientHeight; if (!w || !h || (w === fw && h === fh)) return; fw = w; fh = h;
    R.setSize(w, h, false); cam.aspect = w / h;
    const halfW = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect, d = Math.max(4.6, 0.6 / halfW);
    cam.position.set(0, 1.0, d); cam.lookAt(0, 1.0, 0); cam.updateProjectionMatrix();
  }
  return {
    mount(el, g = false) { if (!el) return; if (!R) build(); withGun = !!g; if (key !== keyOf()) refresh(); if (cv.parentNode !== el) el.appendChild(cv); fit() },   // 换了外观、M16 换色才重做人物
    refresh,
    get ch() { return ch }, get aura() { return aura },
    frame(dt) { if (!R || !ch || !cv.isConnected) return; fit(); if (aura) { const eq = S.fb && S.fb.eq, k = eq ? ['w', 'h', 'a', 'g', 'b'].map(s => eq[s] ? eq[s].k + ':' + (eq[s].st || 0) : '-').join(',') : ''; if (k !== auraKey) { auraKey = k; aura.set(auraTier(eq)) } aura.update(dt) } if (shw) { shw.update(dt); if (gun) aimArms(ch) } else { ch.rotation.y = CLOSEUP_YAW; animH(ch, clock, 0) } R.render(sc, cam) },   // 设计 18l：固定正面往右 20°、空手站着轻轻呼吸，不再自己转、不端枪
  };
})();
function holdGun(on) {
  const skin = HERO.skin((S.hero || {}).dmg || 1);
  if (tdGun && tdGun.userData.skin !== skin) { tdGun.removeFromParent(); tdGun = null }   // 升级换了外观：重新拿一把
  if (on && !tdGun && player) tdGun = gunOnHand(player, skin);
  if (tdGun) tdGun.visible = on;
}
function tdBegin(lv) {
  if (inScav) { UI.toast('先坐货车回超市，再打尸潮', 'bad'); return }
  if (inFish) { UI.toast('先坐船回超市，再打尸潮', 'bad'); return }
  L.tdDay(S, bjDay());
  const why = L.tdCanStart(S, lv); if (why) { UI.toast(why, 'bad'); return }
  if (lay) exitLayout(false);
  L.tdStart(S, lv); SV.saveNow(); UI.closePanel();
  L.setShopPaused(true); L.cancelShop(S).forEach(id => custLeave(id)); for (const [id] of customers) custLeave(id);
  for (const z of zombies) z.m.visible = false;
  if (P.pos.x > -2.5) P.pos.set(-6, 0, 0.5);
  atmo(true); holdGun(true); face('fight', 0); TDR.start(lv, tdGuards());
  $('#tdHud').classList.remove('hidden'); $('#hud').classList.add('hidden'); $('#nadeBtn').classList.remove('hidden');
}
function tdFinish(r) {
  /* 设计 68：尸潮打完员工不扣血，照常干活（员工不会受伤） */
  for (const [, v] of staffVis) { v.inTD = false; if (v.m.userData.gun) v.m.userData.gun.visible = false }
  atmo(false); holdGun(false); face(null, 0); for (const z of zombies) z.m.visible = true;
  $('#nadeBtn').classList.add('hidden'); $('#tdHud').classList.add('hidden'); $('#tdHud').innerHTML = ''; $('#tdHud')._built = false; $('#hud').classList.remove('hidden'); SV.saveNow();
  UI.big(r.win ? '守住了！' : '失败了', `${r.win ? '' : r.why + '　'}末日币 +${r.coins}${r.picked ? `（另外捡到 ${r.picked}）` : ''}${r.tool ? `　工具箱 +${r.tool}` : ''}`, r.win ? 'built' : 'bad');
  UI.toast(r.win ? (r.first ? `第一次打赢${tdName(r.lv)}！` : `${tdName(r.lv)}重复打赢，奖励减半`) : '输了也有 1/4 的奖励', r.win ? 'good' : '', 4500);
  if (r.staff) { UI.setReveal(r.staff); setTimeout(() => UI.openPanel('staffNew'), 2200) }   // 尸潮奖励的员工：翻卡揭晓
}
function tdHud() {
  const h = TDR.hud(); if (!h) return;
  const pct = (a, b) => Math.max(0, Math.min(100, a / b * 100)) + '%';
  const el = $('#tdHud');
  if (!el._built) {      // 框和按钮只建一次，之后只改文字和血条宽度（每帧重建会让「撤退」「2 倍速」点不中）
    el.innerHTML = `<div class="tdbox"><span class="tdcoin"><i class="ico-coin"></i><b data-h="coin"></b></span><span class="tdlv" data-h="lv"></span><span class="note" data-h="left"></span>
    <span class="meter"><span>防线</span><span class="mb"><i data-h="lineW"></i></span><b data-h="line"></b></span>
    <span class="meter hpm"><span>血</span><span class="mb"><i data-h="hpW"></i></span></span>
    <span class="meter barm"><span data-h="barT"></span><span class="mb"><i data-h="barW"></i></span></span>
    <button class="btn sm ghost" data-tdx="speed"></button><button class="btn sm ghost" data-tdx="quit">撤退</button></div>`;
    el._q = {}; el.querySelectorAll('[data-h]').forEach(n => el._q[n.dataset.h] = n); el._q.speed = el.querySelector('[data-tdx="speed"]'); el._built = true;
  }
  const q = el._q, set = (n, v) => { if (n.textContent !== v) n.textContent = v }, w = (n, v) => { if (n.style.width !== v) n.style.width = v };
  set(q.coin, UI.fmtN(S.coins)); set(q.lv, `第 ${h.lv} 关　第 ${h.wave}/${h.waves} 波`); set(q.left, `剩 ${h.left} 只`);
  w(q.lineW, pct(h.line, TD.lineHP)); set(q.line, String(Math.max(0, h.line))); w(q.hpW, pct(h.hp, h.hpMax));
  { const nb = $('#nadeBtn'), k = (h.gcd / h.gcdMax).toFixed(3), sp = nb.querySelector('span'), t = h.gcd > 0 ? String(Math.ceil(h.gcd)) : '手雷';   // 手雷按钮：冷却遮罩 + 秒数
    if (nb.style.getPropertyValue('--cd') !== k) nb.style.setProperty('--cd', k); if (sp.textContent !== t) sp.textContent = t; nb.classList.toggle('cool', h.gcd > 0) }
  set(q.barT, h.repairing ? '修路障中' : '路障'); w(q.barW, pct(h.bar, TD.barricade.hp)); set(q.speed, h.speed > 1 ? '1 倍速' : '2 倍速');
}
$('#nadeBtn').addEventListener('click', e => { e.stopPropagation(); TDR.throwNade() });
addEventListener('keydown', e => { if (e.code === 'KeyG' && TDR.active() && e.target.tagName !== 'INPUT') TDR.throwNade() });
document.addEventListener('click', e => { const b = e.target.closest('[data-tdx]'); if (!b) return;
  if (b.dataset.tdx === 'speed') { const h = TDR.hud(); TDR.setSpeed(h && h.speed > 1 ? 1 : 2) }
  if (b.dataset.tdx === 'quit') UI.ask('撤退算输，没有奖励。确定撤退吗？', () => { if (TDR.active()) TDR.quit() }, '撤退', true) });   /* 设计 79：td.js 撤退什么都不给（不是 1/4）；弹框时尸潮暂停 */

/* ---------- 外观：创建人物 / 改外观 ---------- */
let creating = false; const creatorCam = new THREE.PerspectiveCamera(28, 1, 1, 200);   // 设计 18l：创建人物的固定预览相机
/* 头像：用新模型拍的固定角度头像（设计 18v：男女都是新模型）；新模型没读到才用旧的 2D 头像 */
function drawLookAvatar(c, look, opt) {
  if (!c || !look) return;
  if (hero2Ready()) { const p = heroPortrait(renderer, look), g = c.getContext('2d'); g.fillStyle = opt.bg; g.fillRect(0, 0, c.width, c.height); if (p) g.drawImage(p, 0, 0, c.width, c.height); return }
  loadAvatar().then(() => drawAvatar(c, look, opt));
}
function drawHudAvatar() { const c = $('#hAvatar'); if (c && S && S.look) drawLookAvatar(c, S.look, { bg: '#3a332b', crop: 'head' }) }
/* 设计 18l 最新版：创建人物 / 改外观时，场景里放一个单独的展示用人物（不挂枪、鱼竿），游戏里的主角先藏起来，确定后再出来 */
let show = null;
function showcaseOn(on, look) {
  if (on) { if (!show) show = makeShowcase(); if (show) { show.root.position.set(START_POS.x, 0, START_POS.z); scene.add(show.root); if (look) show.set(look) } }
  else if (show) scene.remove(show.root);
}
function editLook(first) {
  creating = true; UI.closePanel(); $('#hud').classList.add('hidden'); $('#labels').classList.add('hidden');
  const look0 = fixLookSex(cleanLook(S.look || defaultLook())); showcaseOn(true, look0);
  openCreator({ ...look0, storeName: S.storeName || '' }, l => { if (show) show.set(l); else setLook(player, l, LOOK) }, l => {
    if (l.storeName !== undefined) { S.storeName = l.storeName; delete l.storeName; W.setStoreName(S.storeName); CHAT.tick(true) }   // 0.40：改了店名马上告诉好友那边
    S.look = fixLookSex(cleanLook(l)); setLook(player, S.look, LOOK); creating = false; showcaseOn(false); player.visible = true; drawHudAvatar(); SV.saveNow();
    $('#hud').classList.remove('hidden'); $('#labels').classList.remove('hidden'); last = performance.now();
    if (first) UI.toast('坐超市北边的旧货车去拾荒区捡物资，带回来投进回收机', '', 5000);
  }, { thumbs: l => outfitThumbs(renderer, l), avatar: (c, l) => drawLookAvatar(c, l, { bg: '#3a332b' }) });
}

/* ---------- 货车旁的物资堆（拾荒员工带回来的）：最多摆 10 个模型 ---------- */
const PILE_OFF = [[0, 0, 0], [0.45, 0, 0.2], [-0.4, 0, 0.25], [0.15, 0, -0.4], [-0.3, 0, -0.3], [0.1, 0.28, 0.05], [0.5, 0, -0.25], [-0.6, 0, -0.05], [-0.1, 0.26, -0.25], [0.3, 0.24, 0.25]];
const pileMeshes = []; let pileKey = '';
function syncPile() {
  const show = S.pile.slice(0, PILE_OFF.length), key = show.join(','); if (key === pileKey) return; pileKey = key;
  for (const m of pileMeshes.splice(0)) scene.remove(m);
  show.forEach((t, i) => { const m = M.pickupMesh(t), o = PILE_OFF[i]; m.userData.ring.visible = false; m.scale.setScalar(1.25); m.position.set(PILE_POS[0] + o[0], o[1], PILE_POS[1] + o[2]); m.rotation.y = i * 1.7; scene.add(m); pileMeshes.push(m) });
}

/* ---------- 员工（画面）：按状态站到对应的地方 ----------
   收银：收银台东边；种地：温室菜地之间走动（没温室就去果园）；守卫：大门到超市门口那条路的两边；
   休息、饿着：营地篝火旁边；出门拾荒：看不见。 */
const staffById = id => S && S.staff.find(p => p.id === id);
L.setAdmitHold(() => UI.curPanel() === 'staffFull');   // 设计 60：「营地住满了」开着的时候新人先不自动住进来
const tdLocked = id => { const v = staffVis.get(id); if (TDR.active() && v && v.inTD) { UI.toast('尸潮打完再改这个员工', 'bad'); return true } return false };
const staffVis = new Map();                      // id → { m, lab, tgt, wait }
const QCOL = q => STAFF.qual[q].color;
const STORE_BOX = () => ({ x0: STORE.x0 - 0.5, x1: STORE.x1 + 0.3, z0: STORE.z0 - 0.5, z1: STORE.z1 + 0.3 });   // 0.45 南边不再有工坊房间
const crossStore = (a, b) => { const B = STORE_BOX(); for (let k = 0; k <= 20; k++) { const x = a.x + (b.x - a.x) * k / 20, z = a.z + (b.z - a.z) * k / 20; if (x > B.x0 && x < B.x1 && z > B.z0 && z < B.z1) return true } return false };
function staffSpot(p, idx) {
  const st = L.staffState(S, p), on = L.onDuty(st);
  if (L.onTrip(p)) return null;                                  // 出门拾荒：看不见
  if (on && p.job === 'cash') { const k = idx.cash++, s = k ? (k % 2 ? 0.8 : -0.8) * Math.ceil(k / 2) : 0;   // 收银台背面，多的往两边站
    return V(REG_POS.x - REG_DIR.x * 0.9 + REG_DIR.z * s, REG_POS.z - REG_DIR.z * 0.9 - REG_DIR.x * s) }
  if (on && p.job === 'guard') { const g = GUARD_SPOTS[idx.guard++ % GUARD_SPOTS.length]; return V(g[0], g[1]) }
  if (on && p.job === 'farm' && (S.lv.gh || S.lv.orchard)) {
    const pts = S.lv.gh ? PLOT_POS.slice(0, S.plots.length) : S.lv.orchard ? TREE_POS.slice(0, S.trees.length).map(([x, z]) => [x + 1.1, z]) : null;
    if (pts && pts.length) { const v = staffVis.get(p.id); if (v && v.farmT > 0 && v.tgt) return v.tgt; const q = pts[Math.floor(Math.random() * pts.length)]; return V(q[0] + 0.7, q[1] + 0.7) }
  }
  if (on && p.job === 'craft') {                       // 0.42 工匠：在自己管的机器前面来回走
    const sv = L.crewKeys(S, 'craft', p.id), ws = (S.fix.ws || []).filter(w => w && sv.includes(w.k));   // 设计 60：只在分给自己的机器前走
    if (sv.length && !ws.length) return null;                     // 刚读档、机器还没摆好：先别出现（不然会从营地走过去）
    if (ws.length) { const v = staffVis.get(p.id); if (v && v.farmT > 0 && v.tgt) return v.tgt; const w = ws[Math.min(ws.length - 1, Math.floor(Math.random() * ws.length))]; const f = LY.wsFrontWorld(w); return V(f.x + (Math.random() - 0.5) * 0.6, f.z) }   // 0.45 露天工坊
  }
  if (on && p.job === 'feed') {                        // 0.28 饲养员：在自己管的几个棚门口来回走
    const ks = L.crewKeys(S, 'feed', p.id); if (ks.length) { const v = staffVis.get(p.id); if (v && v.farmT > 0 && v.tgt) return v.tgt; const f = penFront(ks[Math.floor(Math.random() * ks.length)]); return V(f.x + (Math.random() - 0.5) * 2.4, f.z) }
  }
  const k = idx.camp++, a = k * 1.25 + 0.6;            // 营地：围着篝火坐一圈
  return V(FIRE_POS.x + Math.cos(a) * 1.9, FIRE_POS.z + Math.sin(a) * 1.3);
}
function syncStaff(dt) {
  const live = new Set(S.staff.map(p => p.id));
  for (const [id, v] of staffVis) if (!live.has(id)) { scene.remove(v.m); v.lab.remove(); staffVis.delete(id) }
  const idx = { cash: 0, guard: 0, camp: 0 }, tdOn = TDR.active();
  for (const p of S.staff) {
    let v = staffVis.get(p.id);
    if (!v) { const m = mkHuman('cust', p.look % 12, { skin: cSkins[p.look % 4], shirt: cShirts[p.look % 6], pants: 0x3d3d48 }); scene.add(m);
      v = { m, tgt: null, farmT: 0, lab: UI.label(() => v.m.position.clone().setY(2.35), 'dim', 'main', { mob: true }) }; staffVis.set(p.id, v); m.position.copy(CAMP_C) }   /* 设计 69：会走的名字牌（mob） */
    const st = L.staffState(S, p), m = v.m, key = st + p.job;
    if (v.key !== key) { v.key = key; v.tgt = null; v.farmT = 0 }
    if (tdOn && v.inTD) { v.lab.set(''); continue }          // 尸潮里上阵的员工由 td.js 控制
    const want = staffSpot(p, idx);
    /* 0.43 用户：牧场、工坊的员工本来就在那里干活，读档、刚出现时直接站在干活的地方；只有拾荒回来（从货车）才走过去 */
    if (!want) v.hid = L.onTrip(p) ? 'trip' : null;
    else if (!v.placed || !m.visible) { const from = !v.placed ? null : v.hid === 'trip' ? V(TRUCK_POS.x + 2, TRUCK_POS.z + 2) : null;
      m.position.copy(from || want); v.placed = true; v.path = null; v.pathTo = null }
    m.visible = !!want;
    const near = !away() && Math.hypot(P.pos.x - m.position.x, P.pos.z - m.position.z) < 9;
    const tag = st === 'hungry' ? '　<small class="warn">饿了，不干活</small>' : st === 'work' ? `　<small>${STAFF_JOBS[p.job]}</small>` : '';
    /* 设计 60：饿了头顶一直有个饭碗（不用走近）；名字一律深色，品质用前面的小色块 */
    /* 设计 69：「只显示附近的」时名字牌交给 ui.js 按场地 / 5 米判断，饿了的饭碗是小图标（在哪都看得到，走近展开成字）；「全部显示」时照旧 9 米内写名字 */
    v.lab.alert(want && st === 'hungry' ? '<div class="hungry"><i class="ico-hungry"></i></div>' : null);
    v.lab.set((labNear || near) && want ? `<div class="box">${st === 'hungry' ? '<i class="ico-hungry"></i>' : ''}<i class="qdot" style="background:${QCOL(p.q)}"></i>${p.name} Lv${p.lv}${L.isPinned(S, p) ? '<i class="ico-pin" title="指定"></i>' : ''}${tag}</div>` : '');
    if (!want) continue;
    if (L.onDuty(st) && ((p.job === 'farm' && (S.lv.gh || S.lv.orchard)) || (p.job === 'feed' && L.crewKeys(S, 'feed', p.id).length) || (p.job === 'craft' && L.crewKeys(S, 'craft', p.id).length))) { v.farmT -= dt; if (!v.tgt || v.farmT <= 0 && m.position.distanceTo(v.tgt) < 0.3) { v.tgt = null; v.farmT = 2 + Math.random() * 3; v.tgt = staffSpot(p, idx) } }
    else v.tgt = want;
    const tgt = v.tgt || want, d = m.position.distanceTo(tgt);
    /* 0.43 用户：不再闪现，按找好的路走过去（找不到路才直接到位） */
    if (d > 0.08 && (!v.pathTo || v.pathTo.distanceTo(tgt) > 0.05)) { v.pathTo = tgt.clone(); v.path = d > 1.2 || crossStore(m.position, tgt) ? NAV.path(m.position, tgt, navBoxes(), clock) : [[tgt.x, tgt.z]]; if (!v.path) { m.position.copy(tgt); v.path = [] } }
    let nx = tgt; if (v.path && v.path.length) { const q = v.path[0]; nx = tmpN.set(q[0], 0, q[1]); if (v.path.length > 1 && Math.hypot(q[0] - m.position.x, q[1] - m.position.z) < 0.15) { v.path.shift(); const q2 = v.path[0]; nx = tmpN.set(q2[0], 0, q2[1]) } }
    const dn = m.position.distanceTo(nx);
    if (d > 0.08 && dn > 0.01) { const sp = Math.min(dn, 2.6 * dt); m.position.addScaledVector(tmpV.subVectors(nx, m.position).normalize(), sp); m.rotation.y = Math.atan2(nx.x - m.position.x, nx.z - m.position.z); animH(m, clock, 2.6) }
    else { animH(m, clock, 0); if (p.job === 'cash' && L.onDuty(st)) m.rotation.y = Math.atan2(REG_DIR.x, REG_DIR.z); else if (p.job === 'guard' && L.onDuty(st)) m.rotation.y = Math.PI / 2 }
  }
}
const tmpV = new THREE.Vector3(), tmpN = new THREE.Vector3(); const wallAt = new THREE.Vector3(), regAt = new THREE.Vector3(), qAt = new THREE.Vector3();
const NAV = createNav({ x0: YARD.x0, x1: STREET.x1, z0: YARD.z0, z1: YARD.z1 }), navBoxes = () => [...W.obstacles, ...shelfBoxes()];
/* 尸潮：在岗的守卫交给 td.js（位置、开枪、挨打、倒下） */
function tdGuards() {
  /* V1.01 用户：尸潮时所有员工自动上阵（出门拾荒、钓鱼不在院子里的除外），打完回去干自己的活 */
  return S.staff.filter(p => { const v = staffVis.get(p.id); return v && !v.hid }).slice(0, GUARD_SPOTS.length).map((p, k) => { const v = staffVis.get(p.id); if (!v) return null; v.inTD = true; const g = GUARD_SPOTS[k]; v.m.position.set(g[0], 0, g[1]); v.m.visible = true;
    const s = L.staffStats(p), gs = p.gun ? L.gunStats(p.gun) : null;
    if (gs) { const old = v.m.userData.gun; if (!old || old.userData.skin !== HERO.skin(p.gun.dmg)) { if (old) old.removeFromParent(); gunOnHand(v.m, HERO.skin(p.gun.dmg)) } v.m.userData.gun.visible = true }   // 0.25 有枪的守卫端着 M16
    return { id: p.id, m: v.m, hp: s.hp, max: s.hp, atk: s.atk, def: s.def, gun: gs } }).filter(Boolean);
}

/* ---------- 拾荒区里被困的幸存者：站旁边 3 秒救下，跟着你回货车 ---------- */
let resc = null;
const rescLab = UI.label(() => resc ? resc.m.position.clone().setY(2.4) : P.pos, '', 'scav');
function placeSurvivor() {
  resc = null;
  if (!window.__forceRescue && Math.random() >= STAFF.rescue.chance) return;   // __forceRescue 只给测试用
  let c = null; for (let t = 0; t < 80 && !c; t++) { const q = map.cand[Math.floor(Math.random() * map.cand.length)]; if (q && Math.hypot(q[0] - map.truck.x, q[1] - map.truck.z) > 18) c = q }
  if (!c) return;
  const look = Math.floor(Math.random() * 1000), m = mkHuman('cust', look % 12, { skin: cSkins[look % 4], shirt: cShirts[look % 6], pants: 0x3d3d48 });
  m.position.set(c[0], 0, c[1]); SC.scene.add(m);
  resc = { m, look, prog: 0, follow: false, p: null };
  /* 旁边放 2 只丧尸 */
  zombies.slice(0, STAFF.rescue.zombies).forEach((z, k) => { const a = k * Math.PI + 0.6; for (let r = 2.2; r < 6; r += 0.8) { const x = c[0] + Math.cos(a) * r, zz = c[1] + Math.sin(a) * r; if (map.canReach(x, zz)) { z.pos.set(x, 0, zz); z.mode = 'wander'; z.tgt = null; break } } });
}
function updSurvivor(dt) {
  if (!resc) { rescLab.set(''); return }
  const m = resc.m, d = Math.hypot(P.pos.x - m.position.x, P.pos.z - m.position.z);
  if (!resc.follow) {
    const frozenNow = UI.panelOpen() || portrait.matches;
    if (d < 1.7 && P.inv <= 0 && !frozenNow) resc.prog += dt; else if (P.inv > 0) resc.prog = 0;   // 开着面板、竖屏时丧尸不动，解救也不算时间
    animH(m, clock, 0); m.rotation.y = Math.atan2(P.pos.x - m.position.x, P.pos.z - m.position.z);
    if (resc.prog >= STAFF.rescue.time) {
      resc.follow = true; resc.p = L.rollStaff(S); resc.p.look = resc.look;
      UI.big('救下了！', '带他回货车，点「回超市」', 'built');          // 品质、名字回超市才揭晓
    }
    rescLab.set(resc.prog > 0 ? `<div class="box">解救中…<span class="pg"><i></i></span></div>` : '<div class="box" style="color:#ffd27a">救命！<br><small>站到旁边 3 秒</small></div>', resc.prog / STAFF.rescue.time * 100);
  } else {
    /* 跟着主角走：停在身后 1.3 米 */
    const back = tmpV.set(P.pos.x - Math.sin(player.rotation.y) * 1.3, 0, P.pos.z - Math.cos(player.rotation.y) * 1.3);
    const dd = m.position.distanceTo(back);
    if (dd > 12) m.position.copy(back);
    else if (dd > 0.2) { const sp = Math.min(dd, (dd > 3 ? 6 : 4.8) * dt); m.position.addScaledVector(back.clone().sub(m.position).normalize(), sp); collide(m.position, 0.35, map.obstacles, map.B); m.rotation.y = Math.atan2(P.pos.x - m.position.x, P.pos.z - m.position.z); animH(m, clock, 4.8) }
    else animH(m, clock, 0);
    rescLab.set('<div class="box">幸存者</div>');
  }
}
function survivorHome() {
  if (!resc) return; SC.scene.remove(resc.m);
  const n = resc.follow ? resc.p : null; resc = null; rescLab.set('');
  if (!n) return;
  n.fed = true;
  if (!L.addStaff(S, n)) UI.setPendingStaff(n);       // 营地住满：揭晓卡上有「去决定留谁」
  SV.saveNow(); UI.setReveal(n); setTimeout(() => UI.openPanel('staffNew'), 900);
}

/* ---------- 去拾荒区 / 回超市：黑屏 + 读取条，随机生成一张新的拾荒区 ---------- */
const SCAV_TIPS = ['货车旁边是安全区，丧尸不会追过来', '被丧尸碰到会掉东西，离开前记得捡回来', '丧尸转弯不灵活，急转弯能甩开它', '楼进不去，楼后面的空地可以从楼缝里钻进去', '背包满了就回货车，回超市卸货'];
function goScav(on, seed) {
  if (scavBusy || !S || on === inScav || inFish) return;
  if (on && TDR.active()) return;
  scavBusy = true; UI.closePanel();
  const ov = $('#scavLoad'), bar = $('#scavBarI');
  $('#scavTxt').textContent = on ? '正在开往拾荒区…' : '正在开回超市…'; $('#scavTip').textContent = SCAV_TIPS[Math.floor(Math.random() * SCAV_TIPS.length)];
  bar.style.width = '0%'; ov.classList.remove('hidden');
  const t0 = performance.now();
  setTimeout(() => {
    if (on) enterScav(seed); else leaveScav();
    bar.style.width = '70%';
    /* 读取界面至少显示一小会儿，看得清在换地图 */
    const wait = Math.max(150, 900 - (performance.now() - t0));
    setTimeout(() => { bar.style.width = '100%'; setTimeout(() => { ov.classList.add('hidden'); scavBusy = false; last = performance.now() }, 180) }, wait);
  }, 60);
}
function enterScav(seed) {
  L.setAway(S, true);
  map = SC.gen(seed ?? (Date.now() & 0x7fffffff)); M.fixDecals(SC.scene); M.trimShadows(SC.scene);   // seed 只给测试用
  if (!L.hasCashier(S)) { L.cancelShop(S).forEach(id => custLeave(id)); for (const [id] of customers) custLeave(id) }   // 没有收银员：去拾荒时超市关门，店里的顾客放下东西离开（不扣口碑）；有收银员照常营业
  S.drops = []; spotOf.length = 0; clearPickups();
  inScav = true; cur = SC.scene; SC.scene.add(player); P.pos.copy(map.start); P.kb.set(0, 0); P.inv = 0;
  for (const z of zombies) {
    let c = null; for (let t = 0; t < 80 && !c; t++) { const q = map.cand[Math.floor(Math.random() * map.cand.length)]; if (q && Math.hypot(q[0] - map.truck.x, q[1] - map.truck.z) > 16 && zombies.every(o => o === z || o.pos.distanceTo(new THREE.Vector3(q[0], 0, q[1])) > 4 || !o.placed)) c = q }
    c = c || [map.truck.x + 30, map.zr]; z.pos.set(c[0], 0, c[1]); z.mode = 'wander'; z.tgt = null; z.rest = Math.random() * 2; z.cd = 0; z.m.visible = true; z.placed = true;
  }
  zombies.forEach(z => { z.placed = false });
  placeSurvivor();
  UI.setLabelWorld('scav'); syncPickups(); snapCam();
  SV.saveNow();
  setTimeout(() => UI.toast('到拾荒区了。背包满了走回货车旁边，点「回超市」', '', 4000), 400);
}
function leaveScav() {
  awayPay();
  const lost = S.drops.reduce((a, d) => a + d.n, 0); S.drops = [];
  survivorHome();
  clearPickups(); inScav = false; cur = scene; scene.add(player);
  P.pos.set(TRUCK_POS.x + 2.6, 0, TRUCK_POS.z + 2.6);   // 0.45 货车南边是牧场的棚：下车站在货车东南边 P.kb.set(0, 0); P.inv = 0;
  UI.setLabelWorld('main'); SC.clear(); map = null; snapCam();
  SV.saveNow();
  if (lost) setTimeout(() => UI.toast(`地上还有 ${lost} 件被丧尸撞掉的东西没捡回来，丢了`, 'bad', 4000), 400);
}
function camTarget(out) {
  if (inFish) return out.set(Math.max(7, Math.min(FI.B.x1 - 7, P.pos.x)), 0, Math.max(4, Math.min(FI.B.z1 - 7, P.pos.z - 1.6)));
  if (inScav) return out.set(Math.max(6, Math.min(map.B.x1 - 6, P.pos.x)), 0, Math.max(3, Math.min(map.B.z1 - 7, P.pos.z - 1.6)));
  return out.set(Math.max(CAM_X[0], Math.min(CAM_X[1], P.pos.x)), 0, Math.max(CAM_Z[0], Math.min(CAM_Z[1], P.pos.z - 1.6)));
}
function snapCam() { camTarget(camTgt); camera.position.copy(camTgt).add(camOff); camera.lookAt(camera.position.x, 0, camera.position.z - camOff.z) }
$('#scavBtn').onclick = () => goScav(!inScav);

/* ---------- 钓鱼区：码头坐船去（没证先买证、每趟付船费），船边点「坐船回去」 ---------- */
const FISH_TIPS = ['近岸用蚯蚓，深水（栈桥尽头）用玉米饵，桥下两种都行', '越稀有的鱼越难拉，鱼竿升级以后好控制', '指针顶到最上面太久会断线，鱼竿多掉耐久', '钓到的鱼回超市自动进仓库，冰柜选「鱼」就能卖', '金鱼王只在桥下出现，非常少见'];
/* 回到超市：收银员在你离开期间收的钱，这时候才加进末日币 */
function awayPay() { const n = L.collectAway(S); if (n > 0) setTimeout(() => { UI.big('离开期间超市赚了', `+${n} 末日币（收银员收的）`, 'gem'); UI.msg(S, `离开期间收银员收了 ${n} 末日币`, 'good'); SV.saveNow() }, 700) }
function boatGo() {
  if (!S || scavBusy || inScav) return;
  if (inFish) { goFish(false); return }
  if (!L.fishOpen(S)) { UI.toast(`超市 ${FISHING.store} 级开放钓鱼`, 'bad'); return }
  if (!S.fishLic) { UI.openPanel('fishLic'); return }
  if (S.coins < FISHING.boat) { UI.toast(`船费 ${FISHING.boat} 末日币，不够`, 'bad'); return }
  if (TDR.active()) return;
  L.payBoat(S); goFish(true);
}
function goFish(on) {
  if (scavBusy || !S || on === inFish) return;
  if (on && !fishPropsReady()) { UI.toast('钓鱼区的模型还在下载，等一会儿再坐船（网慢的时候要一两分钟）', 'bad', 3500); return }   // 设计 38
  scavBusy = true; UI.closePanel(); FG.close(true);
  const ov = $('#scavLoad'), bar = $('#scavBarI');
  $('#scavTxt').textContent = on ? '正在坐船去钓鱼…' : '正在坐船回超市…'; $('#scavTip').textContent = FISH_TIPS[Math.floor(Math.random() * FISH_TIPS.length)];
  bar.style.width = '0%'; ov.classList.remove('hidden');
  const t0 = performance.now();
  setTimeout(() => {
    if (on) enterFish(); else leaveFish();
    bar.style.width = '70%';
    const wait = Math.max(150, 900 - (performance.now() - t0));
    setTimeout(() => { bar.style.width = '100%'; setTimeout(() => { ov.classList.add('hidden'); scavBusy = false; last = performance.now() }, 180) }, wait);
  }, 60);
}
function enterFish() {
  L.setAway(S, true);
  FI.build(); M.fixDecals(FI.scene); M.trimShadows(FI.scene);
  if (!L.hasCashier(S)) { L.cancelShop(S).forEach(id => custLeave(id)); for (const [id] of customers) custLeave(id) }   // 和拾荒一样：没有收银员就关门
  inFish = true; cur = FI.scene; FI.scene.add(player); P.pos.copy(FI.start); P.kb.set(0, 0); P.inv = 0;
  if (fMerch) FI.scene.add(fMerch);
  UI.setLabelWorld('fish'); snapCam(); SV.saveNow();
  setTimeout(() => UI.toast('到钓鱼区了。走到地上的圆圈（钓鱼点）开始钓；钓完回船边坐船回去', '', 4500), 400);
}
function leaveFish() {
  awayPay();
  FG.close(true); FI.setFloat(false); rod.visible = false;
  inFish = false; cur = scene; scene.add(player);
  P.pos.set(DOCK_POS.x, 0, DOCK_POS.z - 2.4); P.kb.set(0, 0);
  UI.setLabelWorld('main'); snapCam();
  const n = L.unloadFish(S), left = S.bag.filter(b => L.isFish(b.t)).reduce((a, b) => a + b.n, 0);
  if (n || left) setTimeout(() => UI.toast(`${n ? `${n} 条鱼放进${L.pondWhere(S)}了` : ''}${left ? `${n ? '，' : ''}${L.pondWhere(S)}放不下的 ${left} 条还在背包里（卖掉一些${S.lv.pond < 3 ? '或升级池塘' : ''}后走到池塘边就能放进去）` : ''}${n && !L.hasType(S, 'fridge') ? '。建个冰柜就能卖鱼' : ''}`, left ? 'bad' : 'good', 4000), 400);
  SV.saveNow();
}
/* 钓鱼时手里的竿（细长的棍子，挂在主角身上） */
/* 鱼竿：握把 + 卷线器 + 两节竿身（上面一节拉鱼时会弯）；颜色看鱼竿等级（用户 10-13）：1 级原木色、2 级墨绿、3 级黑金 */
const ROD_LOOK = [null, { shaft: 0x9a6a3a, grip: 0x4a3626, ring: 0xb8b0a0 }, { shaft: 0x2f6a46, grip: 0x1f2a22, ring: 0xd8d8d8 }, { shaft: 0x26282e, grip: 0x141518, ring: 0xe8b83a }];
const rod = new THREE.Group(), rodUp = new THREE.Group(); let rodLv = 0;
rod.position.set(0.32, 1.0, 0.2); rod.visible = false;
let rodModel = false;   // 用户给的鱼竿模型（FishingRod.glb，1.9 米，竿子朝 +y）读到了就用它；没读到用下面代码拼的
const ROD_TINT = [null, 0xffffff, 0x8fc49a, 0x6e6870];     // 等级颜色：1 级原木色、2 级偏绿、3 级深色
function buildRod(lv) {
  rodLv = lv; rod.clear(); rodUp.clear(); const L = ROD_LOOK[lv] || ROD_LOOK[1];
  const m = prop('FishingRod', { scale: 1.37, tint: ROD_TINT[lv] || 0xffffff });
  if (m) { m.position.y = 0.17 * 1.37; m.rotation.y = Math.PI / 2; rod.add(m); rodUp.position.y = 1.6; rod.add(rodUp); rodModel = true; return }   // 竿尖在 2.6 米（rodUp 上 1 米）
  rodModel = false;
  const cyl = (r0, r1, h, c, y) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, 6), M.mat(c)); m.position.y = y; return m };
  rod.add(cyl(0.035, 0.04, 0.5, L.grip, 0.1), cyl(0.022, 0.032, 1.3, L.shaft, 0.95));
  const reel = cyl(0.07, 0.07, 0.06, L.ring, 0.42); reel.rotation.z = Math.PI / 2; reel.position.x = 0.06; rod.add(reel);
  for (const y of [0.75, 1.35]) rod.add(cyl(0.035, 0.035, 0.025, L.ring, y));
  rodUp.position.y = 1.6; rodUp.add(cyl(0.008, 0.022, 1.0, L.shaft, 0.5), cyl(0.02, 0.02, 0.05, L.ring, 1.0)); rod.add(rodUp);
}
const rodTip = new THREE.Vector3(), castAt = new THREE.Vector3();
let castT = -1, reelT = -1; const flyAt = new THREE.Vector3();   // 抛竿 / 收竿动作的计时（-1 = 没在做）
const CAST_T = 0.75, REEL_T = 0.55;
let fMerch = null, yMerch = null;
UI.setFarCheck(() => inFish);
UI.setAwayCheck(() => away());
FG.initFishGame({
  getS: () => S,
  openShop: () => UI.openMall(inFish),
  openBag: () => UI.openPanel('bag'),
  onCast: () => { const sp = FG.fishSpot(); castAt.set(sp.x + Math.sin(sp.ry) * 4.6, 0, sp.z + Math.cos(sp.ry) * 4.6) ; castT = 0; reelT = -1 },
  onBite: () => UI.floatText(castAt.clone().setY(0.8), '！', 'bad'),
  onCatch: (id, ok) => { reelT = 0; const F = FISH[id], R = FISH_RAR[F.rar];
    if (!ok) { UI.toast('背包放不下了，鱼放走了', 'bad'); return }
    UI.big(`钓到了 ${F.name}`, `${R.name}　售价 ${F.price}`, F.rar === 'l' ? 'gem' : F.rar === 'r' ? 'built' : '');
    if (!L.fishFits(S, FG.fishSpot() && FG.fishSpot().zone)) setTimeout(() => { if (inFish) UI.toast('背包满了：打开背包丢掉一些鱼接着钓，或者回船边坐船回去', 'bad', 4500) }, 1600);   // 用户 10-13：不自动回去
    SV.saveNow() },
  onEnd: () => { reelT = 0 },
  onClose: () => { FI.setFloat(false); rod.visible = false; castT = reelT = -1 },
});
UI.setMute(() => FBV.active());   /* 设计 97：副本里超市来的飘字、横幅、提示一律不显示（副本自己的走 UI.raw） */
/* 0.22 池塘：主角在池塘（或水桶）旁边 r 米以内 */
const nearPond = r => { const [w, d] = FISHPOND_SIZE[S.lv.pond || 0]; return Math.abs(P.pos.x - POND_LOT.x) < w / 2 + r && Math.abs(P.pos.z - POND_LOT.z) < d / 2 + r };
function showBtn(sel, on, txt) { const b = $(sel); b.classList.toggle('hidden', !on || UI.panelOpen() || scavBusy); if (txt && b.textContent !== txt) b.textContent = txt }

function fishFrame(dt) {
  FI.update(clock);
  if (rod.parent !== player) player.add(rod);
  if (rodLv !== (S.lv.rod || 1)) buildRod(S.lv.rod || 1);
  /* 0.24：站进钓鱼区域就打开钓鱼（右边出现饵料和「抛竿」），走出去就关；抛出去以后（等咬钩、拉鱼）不能走 */
  const busyF = FG.busy();
  if (!busyF) { const Z = zoneAt(P.pos.x, P.pos.z), cur = FG.fishSpot();
    if (Z && (!cur || cur.zone !== Z.zone || cur.Z !== Z)) { FG.close(true); if (!UI.panelOpen()) FG.open({ x: P.pos.x, z: P.pos.z, ry: Z.ry, zone: Z.zone, Z }) }
    else if (Z) FG.moveSpot(P.pos.x, P.pos.z);
    else if (cur) FG.close(true) }
  const fishingNow = FG.busy();
  showBtn('#boatBtn', !fishingNow && Math.hypot(P.pos.x - FI.boatAt.x, P.pos.z - FI.boatAt.z) < 2.6, '坐船回去');
  showBtn('#fishBtn', false);
  if (!fishingNow && reelT < 0) { rod.visible = false; return }      // 没抛竿、也不在收竿动画里：竿子收起来
  const sp = FG.fishSpot() || { x: P.pos.x, z: P.pos.z, ry: player.rotation.y }, ph = FG.fishPhase();
  if (fishingNow) { P.pos.x += (sp.x - P.pos.x) * Math.min(1, dt * 8); P.pos.z += (sp.z - P.pos.z) * Math.min(1, dt * 8);
    let da = sp.ry - player.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); player.rotation.y += da * Math.min(1, dt * 10) }
  /* 竿子往前斜伸到水面上方，再往右偏一点（镜头在身后，正前方的竿子看着像竖着）；拉鱼时竿子抬起、上面一节往前弯 */
  rod.visible = true;
  const pull = ph === 'pull', bite = ph === 'bite';
  const tip = () => { rod.updateMatrixWorld(true); rodTip.set(0, 1.0, 0); return rodUp.localToWorld(rodTip) };
  const arc = (a, b, u, h) => flyAt.lerpVectors(a, b, u).setY(a.y + (b.y - a.y) * u + Math.sin(u * Math.PI) * h);
  if (castT >= 0) {
    /* 抛竿：先把竿子往后举过头，再往前一甩，浮漂划一道弧落到水里 */
    castT += dt; const k = Math.min(1, castT / CAST_T);
    rod.rotation.set(k < 0.35 ? 1.35 - (k / 0.35) * 1.45 : -0.1 + ((k - 0.35) / 0.65) * 1.2, 0, -0.45); rodUp.rotation.x = rodModel ? 0 : k < 0.35 ? -0.35 : 0.25 * (1 - k);
    const p = tip(); if (k < 0.4) FI.setFloat(true, p, p.clone().setY(p.y - 0.4), 0, clock, true, p.y - 0.4);
    else { const u = (k - 0.4) / 0.6, w = castAt.clone().setY(-0.36); arc(p.clone().setY(p.y - 0.4), w, u, 1.6); FI.setFloat(true, p, flyAt, 0, clock, true, flyAt.y) }
    if (k >= 1) castT = -1;
  } else if (reelT >= 0) {
    /* 收竿：竿子往上一提，浮漂飞回竿尖 */
    reelT += dt; const k = Math.min(1, reelT / REEL_T);
    rod.rotation.set(1.1 - k * 0.8, 0, -0.45); rodUp.rotation.x = rodModel ? 0 : 0.4 * (1 - k);
    const p = tip(), w = castAt.clone().setY(-0.36); arc(w, p.clone().setY(p.y - 0.4), k, 1.0); FI.setFloat(k < 1, p, flyAt, 0, clock, true, flyAt.y);
    if (k >= 1) reelT = -1;
  } else {
    rod.rotation.set(pull ? 0.75 + Math.sin(clock * 9) * 0.05 : ph === 'idle' ? 1.35 : 1.1, 0, -0.45);
    rodUp.rotation.x = rodModel ? 0 : pull ? 0.55 + Math.sin(clock * 11) * 0.12 : bite ? 0.35 : 0.08;   // 模型竿子是硬的，不弯
    if (ph === 'wait' || bite || pull) { tip(); FI.setFloat(true, rodTip, castAt, bite ? 1 : pull ? 0.6 + Math.sin(clock * 11) * 0.4 : 0, clock, pull) }
    else FI.setFloat(false);
  }
  if (!UI.panelOpen()) FG.update(dt);
}
const whLostG = new Set();   // 设计 41：这 10 分钟里因为仓库满了丢掉的货
/* 商人：院子里一个（大门北边）、钓鱼区一个（船旁边），点开就是原来的商城页面（钓鱼区的贵 20%）。设计 40：菜单里去掉了商城 */
let merchFlash = 0;
const MERCH_TIP = { scroll: '尸潮券不够，去院子商人那里买', tix: '召唤券不够，去院子商人那里买', crew: '施工队去院子商人那里雇（大门北边）', m16: 'M16 去院子商人那里买（大门北边）', star: '星星兑换在院子商人那里（大门北边）' };
function toMerch(a) { UI.closePanel(); UI.toast(MERCH_TIP[a] || '去院子商人那里买（大门北边）', '', 3500); merchFlash = performance.now() + ((window.__g && window.__g.flashMs) || 3000) }   // flashMs：截图测试用（测试机一帧要一秒多）

/* 商人模型（0.15 用户找的：Survivalist，去掉了战术背心那几件，带一段「说话」动作循环）；没读到就用顾客模型 */
let merchSrc = null;
/* 0.20 换成用户给的新商人（AI 生成的静态模型，没有骨骼）：已去掉脚下的灰色底座、减面、贴图压到 1024；身高 1、面朝 +z */
const loadMerchant = () => loadGLB('models/merchant.glb').then(g => { merchSrc = g.scene }, e => console.warn('商人模型加载失败，用顾客模型代替', e));   // 在加载页读完再进游戏
function mkMerchant(idx) {
  if (!merchSrc) return mkHuman('cust', idx, {});
  const m = merchSrc.clone(true); m.scale.setScalar(2.05);                // 放到和玩家一样高（约 2.05）
  m.traverse(o => { if (o.isMesh) o.castShadow = true });
  const g = new THREE.Group(); g.add(noCast(m)); g.userData.merch = { m, t: Math.random() * 10 };
  return g;
}
/* 没有骨骼，就做个简单的待机：轻轻呼吸、左右晃一点 */
const animMerch = (g, dt) => {
  if (!g) return; const u = g.userData.merch; if (!u) { animH(g, clock, 0); return }
  u.t += dt; const b = Math.sin(u.t * 2.2);
  u.m.scale.set(2.05 * (1 - b * 0.006), 2.05 * (1 + b * 0.012), 2.05 * (1 - b * 0.006));
  u.m.rotation.z = Math.sin(u.t * 0.9) * 0.025; u.m.rotation.y = Math.sin(u.t * 0.45) * 0.08;
};
function placeMerch() {
  if (!yMerch) { yMerch = mkMerchant(9); yMerch.position.copy(MERCH_POS); yMerch.rotation.y = 0; scene.add(yMerch); addFlat(yMerch) }   // 设计 67：压扁影子
  if (!fMerch && FI.merchant) { fMerch = mkMerchant(5); fMerch.position.set(FI.merchant.x, 0, FI.merchant.z); fMerch.rotation.y = Math.PI / 4; FI.scene.add(fMerch); addFlat(fMerch) }
}
function merchFrame(dt) {
  placeMerch();
  if (inFish) animMerch(fMerch, dt); else if (!away()) animMerch(yMerch, dt);
  const near = inFish ? FI.merchant && Math.hypot(P.pos.x - FI.merchant.x, P.pos.z - FI.merchant.z) < 3.4 && !FG.busy() : !away() && Math.hypot(P.pos.x - MERCH_POS.x, P.pos.z - MERCH_POS.z) < 3.4;   // 在商人周围一圈都能进商店
  showBtn('#merchBtn', !!near && !TDR.active() && !(inFish && FG.fishing()), '进商店');   // 0.38：站在钓鱼区里不出「进商店」（跟抛竿按钮叠在一起），往岸上走一步就有
  showBtn('#pondBtn', !inFish && !away() && !near && !TDR.active() && nearPond(1.6), S.lv.pond ? '看池塘' : '看水桶');
}
/* ---------- 设计 107：铁匠（超市 5 级才出现，传送门旁边）：待机敲铁砧、偶尔擦汗、玩家走近挥一次手；走近出「找铁匠」→ 铁匠面板（炼宝 | 传说转换） ---------- */
const SMITH = { scale: 1.83, stallScale: 2.6, stallOff: V(0.78, 0.62), fire: [0.06, 0.36, -0.12], r: 3.4 };   // 铁匠模型高 1.095 → 约 2 米；摊子按铁砧到腰放大
let smithSrc = null, smithG = null, smithMix = null, smithActs = null, smithObs = null, smithFlash = 0, smithNear = false, smithNext = 12, smithFire = null;
const smithTop = SMITH_POS.clone().setY(2.6), smithLab = UI.label(() => smithTop);
const loadSmith = () => Promise.all([loadGLB('models/npc/smith.glb'), loadGLB('models/npc/smith_stall.glb')]).then(([a, b]) => { smithSrc = { a, b } }, e => console.warn('铁匠模型加载失败', e));
const smithOn = () => !!S && S.lv.store >= FB.store;
function placeSmith() {
  const on = smithOn() && smithSrc;
  if (on && !smithG) {
    const g = new THREE.Group(); g.position.copy(SMITH_POS);
    const st = smithSrc.b.scene; st.scale.setScalar(SMITH.stallScale); st.position.set(SMITH.stallOff.x, 0, SMITH.stallOff.z); st.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } }); g.add(st);
    const m = smithSrc.a.scene; m.scale.setScalar(SMITH.scale); m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false } }); g.add(m);
    smithMix = new THREE.AnimationMixer(m); smithActs = {}; for (const c of smithSrc.a.animations) smithActs[c.name] = smithMix.clipAction(c);
    for (const k of ['wipe', 'wave']) if (smithActs[k]) { smithActs[k].setLoop(THREE.LoopOnce); smithActs[k].clampWhenFinished = false }
    if (smithActs.idle) smithActs.idle.play();
    smithMix.addEventListener('finished', () => { if (smithActs.idle) { smithActs.idle.reset().fadeIn(0.25).play() } });
    /* 炉子的火：两层叠加的光斑，轻轻跳（一张贴图、两个精灵，手机不发烫） */
    const tx = glowTex().ball, f1 = glowSprite(tx, 0xff8a2a, 0.75), f2 = glowSprite(tx, 0xffd060, 0.6); smithFire = [f1, f2];
    for (const f of smithFire) { f.position.set(SMITH.stallOff.x + SMITH.fire[0] * SMITH.stallScale, SMITH.fire[1] * SMITH.stallScale, SMITH.stallOff.z + SMITH.fire[2] * SMITH.stallScale); g.add(f) }
    scene.add(g); addFlat(m); smithG = g;
    /* 摊子、铁匠的碰撞（出现了才有） */
    const o = SMITH.stallOff, k = SMITH.stallScale, X = SMITH_POS.x, Z = SMITH_POS.z;
    smithObs = [{ x0: X + o.x - 0.43 * k, x1: X + o.x + 0.49 * k, z0: Z + o.z - 0.40 * k, z1: Z + o.z + 0.30 * k }, { x0: X - 0.4, x1: X + 0.4, z0: Z - 0.35, z1: Z + 0.35 }];
    W.obstacles.push(...smithObs);
  } else if (!on && smithG) { scene.remove(smithG); smithG = null; smithMix = null; for (const b of smithObs || []) { const i = W.obstacles.indexOf(b); if (i >= 0) W.obstacles.splice(i, 1) } smithObs = null }
}
function smithPlay(k) { const a = smithActs && smithActs[k]; if (!a || a.isRunning()) return; for (const [n, b] of Object.entries(smithActs)) if (n !== k && b.isRunning()) b.fadeOut(0.25); a.reset().fadeIn(0.25).play() }
function smithFrame(dt) {
  placeSmith(); if (!smithG) { showBtn('#smithBtn', false); smithLab.set(''); return }
  if (!away()) { smithMix.update(dt); const t = clock.elapsedTime;
    if (smithFire) { smithFire[0].scale.setScalar(0.9 + 0.12 * Math.sin(t * 9) + 0.06 * Math.sin(t * 23)); smithFire[1].scale.setScalar(0.5 + 0.08 * Math.sin(t * 13 + 1)); smithFire[0].material.opacity = 0.6 + 0.15 * Math.sin(t * 7) }
    smithNext -= dt; if (smithNext <= 0) { smithNext = 15 + Math.random() * 10; if (!smithNear) smithPlay('wipe') } }
  const d = Math.hypot(P.pos.x - SMITH_POS.x, P.pos.z - SMITH_POS.z), near = !away() && d < SMITH.r;
  if (near && !smithNear) smithPlay('wave'); if (d > SMITH.r + 1.5) smithNear = false; else if (near) smithNear = true;
  showBtn('#smithBtn', near && !TDR.active(), '找铁匠');
  smithLab.set(!away() && performance.now() < smithFlash ? '<div class="marrow"><i></i></div>' : '');
}
const SMITH_TIP = { ref: '炼宝找铁匠（传送门旁边）', swap: '传说转换找铁匠（传送门旁边）' };
function toSmith(a) { UI.closePanel(); UI.toast(SMITH_TIP[a] || SMITH_TIP.ref, '', 3500); smithFlash = performance.now() + ((window.__g && window.__g.flashMs) || 3000) }
/* ---------- 0.31 神秘商人（设计/16）：有单子时在超市地图里沿固定路线来回走（不去拾荒区）；走近出「神秘商人」按钮；交完货从南边小门离开 ---------- */
const MYS_ROUTE = [[-10.2, -11.2], [-5.4, -11.8], [-4.9, -16.4], [-7.8, -18.2], [-11.6, -17.6], [-12.8, -13.6]].map(([x, z]) => V(x, z));   // 设计 43：在东北角商人那块空地里绕一圈，走到头再往回走
const MYS_IN = [[1.2, -1.6], [-3.2, -1.6], [-10.2, -1.6], [-10.2, -7]].map(([x, z]) => V(x, z));   // 设计 43：从大门进来，往西走到两座炮台中间，再往北到空地（从马路上来、回马路上去）
let mysIn = [], mysM = null, mysI = 1, mysDir = 1, mysWait = 0, mysLeave = null, mysShown = false;
const mysLab = UI.label(() => mysM ? mysM.position.clone().setY(2.5) : V(0, -50), 'dim', 'main', { mob: true });
const MYS_H = 2.1;   // 主角模型的高度（米）
function mysMesh() {
  const src = prop('mystery', { scale: 2.6, tint: 0xffffff }); if (!src) return null;
  const g = new THREE.Group(); g.add(src); src.updateMatrixWorld(true);
  let bb = new THREE.Box3().setFromObject(src); src.scale.multiplyScalar(MYS_H / (bb.max.y - bb.min.y)); src.updateMatrixWorld(true);   // 0.34 用户：跟主角一样高
  bb = new THREE.Box3().setFromObject(src); const c = bb.getCenter(new THREE.Vector3()); src.position.set(-c.x, -bb.min.y, -c.z);
  g.userData.body = src; noCast(g); scene.add(g); addFlat(g); return g;   // 设计 67：神秘商人也画压扁影子
}
/* 交完货：沿原路线走回南边，再从南边小门出去（不穿过超市） */
function mysBack() { const out = []; for (let i = Math.min(MYS_ROUTE.length - 1, mysDir > 0 ? mysI - 1 : mysI); i >= 0; i--) out.push(MYS_ROUTE[i]); return [...out, ...MYS_IN.slice().reverse()] }
function mysFrame(dt) {
  const here = !!S.mys && !!S.mys.order && !TDR.active();
  if ((here || mysLeave) && !mysM) { mysM = mysMesh(); if (mysM) { mysM.position.copy(MYS_IN[0]); mysIn = MYS_IN.slice(1); mysI = 0; mysDir = 1 } }
  if (!mysM) return;
  mysM.visible = (here || !!mysLeave) && !away();
  const body = mysM.userData.body;
  if (here || mysLeave) {
    const tgt = mysLeave ? mysLeave[0] : mysIn.length ? mysIn[0] : MYS_ROUTE[mysI], d = mysM.position.distanceTo(tgt);
    if (mysWait > 0 && !mysLeave) { mysWait -= dt; body.rotation.z = 0 }     // 停下来看看
    else if (d < 0.1) {
      if (!mysLeave && mysIn.length) mysIn.shift();   // 设计 43：还在从大门进来的路上
      else if (mysLeave) { mysLeave.shift(); if (!mysLeave.length) { mysLeave = null; mysM.visible = false; mysM.position.copy(MYS_IN[0]); mysIn = MYS_IN.slice(1); mysI = 0; mysDir = 1; mysWait = 0 } }   // 0.31 修：他下次来从南边小门进来、从路线起点开始走（以前会从上次走到的地方直线穿过超市）
      else { if (Math.random() < 0.35) mysWait = 1.5 + Math.random() * 2.5; mysI += mysDir; if (mysI >= MYS_ROUTE.length || mysI < 0) { mysDir = -mysDir; mysI += 2 * mysDir } }
    } else {
      const st = Math.min(d, (mysLeave ? 2.6 : 1.6) * dt); mysM.position.addScaledVector(tmpV.subVectors(tgt, mysM.position).normalize(), st);
      let da = Math.atan2(tgt.x - mysM.position.x, tgt.z - mysM.position.z) - mysM.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); mysM.rotation.y += da * Math.min(1, dt * 6);
      body.rotation.z = Math.sin(clock * 7) * 0.05;     // 走路左右晃（模型没骨骼）
    }
  }
  const near = here && !away() && mysM.position.distanceTo(P.pos) < 2.6;
  mysLab.set('');   // V1.01 用户：神秘商人头顶不标了（走近点按钮看要什么）
  showBtn('#mysBtn', near, '神秘商人');
  if (here !== mysShown) mysShown = here;
}
$('#mysBtn').onclick = () => UI.openPanel('mys');
/* 0.42 工坊：机器头顶写名字和在做什么（走进工坊才显示） */
const wsLab = {}, wsAlertT = {};
function wsLabels(on) {
  const near3 = on ? WS_IDS.filter(k => W.wsItems[k] && W.wsItems[k].g.position.distanceTo(P.pos) <= 5).sort((a, b) => W.wsItems[a].g.position.distanceTo(P.pos) - W.wsItems[b].g.position.distanceTo(P.pos)).slice(0, 3) : [];
  for (const k of WS_IDS) { const it = W.wsItems[k];
    if (!it) { if (wsLab[k]) wsLab[k].set(''); continue }
    if (!wsLab[k]) { const top = new THREE.Vector3(); wsLab[k] = UI.label(() => top.copy(W.wsItems[k] ? W.wsItems[k].g.position : V(0, -50)).setY(W.wsItems[k] && W.wsItems[k].top ? W.wsItems[k].top + 0.35 : 3.4), 'dim'); wsLab[k].group = 'ws' }
    /* 设计 69：没人管、断料停着的机器：头顶一个红点小图标（在哪都看得到），走近 3 台以内展开成字。每秒算一次 */
    if (on && clock - (wsAlertT[k] || -9) > 1) { wsAlertT[k] = clock; const M0 = L.wsOf(S, k), n0 = L.wsLines(S, k), idle = M0.lines.slice(0, n0).every(l => !l.out), w0 = idle ? L.wsWhy(S, k) : null;
      wsLab[k].alert(!L.wsServed(S).includes(k) || (w0 && /等原料|原料不够|没有工匠/.test(w0.short || '')) ? '<div class="adot"><i></i></div>' : null) }
    if (!on) wsLab[k].alert(null);
    if (!on || !near3.includes(k)) { wsLab[k].set(''); continue }   // 35b：只显示离主角最近的 3 台（5 米以内），别挤成一片
    const M = L.wsOf(S, k), T = L.wsTime(S, k), n = L.wsLines(S, k), act = M.lines.slice(0, n).filter(l => l.out), served = L.wsServed(S).includes(k);
    const TT = l => T * (l.tk || 1), done = act.find(l => l.t >= TT(l)), run = act.filter(l => l.t < TT(l)), lead = run.sort((a, b) => b.t / TT(b) - a.t / TT(a))[0];
    const why = !lead && !done ? L.wsWhy(S, k) : null;   // 设计 60：停着写原因
    const st = done ? `<small class="warn">${GOODS[done.out].name}做好了，仓库放不下了</small>` : lead ? `<small>${[...new Set(run.map(l => GOODS[l.out].name))].join('、')}　${run.length}/${n} 条线</small><span class="pg"><i></i></span>` : `<small class="warn">${why.short === '工匠饿了' ? '<i class="ico-hungry"></i>' : ''}停着：${why.short || '等原料'}</small>`;
    wsLab[k].set(`<div class="box${lead && !done ? ' ok' : ''}">${BUILD[k].name}${/\d$/.test(BUILD[k].name) ? '　' : ' '}${S.lv[k]} 级<br>${st}</div>`, lead && !done ? lead.t / TT(lead) * 100 : null) }
}

/* ================= 设计 37：就近升级 =================
   走到已经盖好、还能升级的东西 2.5 米内（建筑、工坊机器、牧场棚、货柜、塔、温室、果园），右下角「布置」上面出「⬆ 升级 ××」；
   正在升级的写「升级中 剩余时间」；没盖的、满级的不出。现在就能升的头顶画绿色小 ⬆（只画屏幕里的）。点按钮打开小窗。原来的升级入口都留着 */
const UP_R = 2.5, UP_B = ['store', 'rec', 'wh', 'camp', 'gh', 'orchard', 'pond'];
function upTargets() {
  const out = [], add = (t, st) => { if (st) out.push({ ...t, st }) };
  for (const k of UP_B) if (S.lv[k] > 0) add({ kind: 'b', k, name: k === 'store' ? '超市' : BUILD[k].name, key: k }, k === 'store' ? { x: REG_POS.x, z: REG_POS.z, w: 3, d: 2, h: 2.6 } : siteOf(k, S.lv[k], {}));
  for (const k of [...WS_IDS, ...RANCH_IDS]) if (S.lv[k] > 0) add({ kind: 'b', k, name: BUILD[k].name, key: k }, siteOf(k, S.lv[k], {}));
  S.shelves.forEach((sh, i) => { if (S.layout && S.layout[i]) add({ kind: 'tier', i, name: `${i + 1} 号${FIXTURE[sh.type || 'shelf'].tiers[(sh.tier || 1) - 1]}`, key: 'tier' + i }, siteOf('tier', 0, { i })) });
  S.towers.forEach((t, i) => { if (t && t.lv >= 1) add({ kind: 'tower', i, name: `${i + 1} 号${TOWERS[t.k].name}`, key: 'tw' + i }, siteOf('tower', 0, { i })) });
  return out;
}
/* 设计 60：走到机器、货柜 1.8 米以内，右下角出「查看 xx」（最近的那个），点了才打开（原来设计 46 是停下来 0.5 秒直接弹面板）。「布置」、尸潮、开着面板、院子商人旁边不出 */
const POP_R = 1.8, popBlock = new Set();
function popTargets() {
  const out = [];
  if (S.lv.store >= 3) for (const w of S.fix.ws || []) if (S.lv[w.k] > 0) { const st = siteOf(w.k, S.lv[w.k], {}); if (st) out.push({ key: 'ws:' + w.k, name: BUILD[w.k].name, st, open: () => UI.openAt('ws', w.k) }) }
  S.shelves.forEach((sh, i) => { if (!S.layout || !S.layout[i]) return; const st = siteOf('tier', 0, { i }); if (st) out.push({ key: 'sh:' + i, name: `${i + 1} 号${FIXTURE[sh.type || 'shelf'].name || '货柜'}`, st, open: () => UI.openAt('shelf', sh.type || 'shelf', i) }) });
  return out;
}
/* 设计 60：走近机器 / 货柜不再直接打开，右下角出「查看 xx」（跟「进商店」一样），点了才打开；对最近的那个 */
let viewCur = null;
function autoPop(dt, home) {
  const btn = $('#viewBtn'); let best = null;
  if (home && !lay && !TDR.active() && !away() && !UI.panelOpen() && !scavBusy && Math.hypot(P.pos.x - MERCH_POS.x, P.pos.z - MERCH_POS.z) >= 3.4) {
    let bd = POP_R; for (const t of popTargets()) { const d = rectDist(t.st, P.pos); if (d <= bd) { bd = d; best = t } } }
  viewCur = best;
  if (!best) { btn.classList.add('hidden'); return }
  const tx = `查看 ${best.name}`; if (btn.textContent !== tx) btn.textContent = tx;
  btn.classList.remove('hidden'); btn.classList.toggle('hi2', !$('#upBtn').classList.contains('hidden'));   // 「⬆ 升级」在的时候往上挪一格
}
$('#viewBtn').onclick = () => { if (viewCur) viewCur.open() };
const rectDist = (st, p) => Math.hypot(Math.max(Math.abs(p.x - st.x) - st.w / 2, 0), Math.max(Math.abs(p.z - st.z) - st.d / 2, 0));
const upMarks = new Map(), upTierIn = new Set(), upShown = new Set(); let upAt = 0, upCur = null, upWinT = null;
function nearUp(on) {
  const btn = $('#upBtn'), now = performance.now(); if (now - upAt < 250) return; upAt = now;
  const list = on ? upTargets() : [];
  /* 头顶绿色 ⬆：现在就能升的（没在升、条件都够） */
  /* 待改小问题：⬆ 太多还压字 —— 只画离主角最近的 3 个；货柜头顶有缺货牌的，⬆ 画在牌子右上角（shelfLabs 里画），不压字 */
  const okKeys = new Set(); upTierIn.clear();
  const okList = list.filter(t => { const inf = UI.upInfo(S, t); return inf && inf.ok && !UI.upBusy(S, t) }).sort((a, b) => rectDist(a.st, P.pos) - (upShown.has(a.key) ? 1.5 : 0) - rectDist(b.st, P.pos) + (upShown.has(b.key) ? 1.5 : 0)).slice(0, 3);   // 设计 69：已经画着的优先留着（近 1.5 米算），主角走两步不会一会儿这个一会儿那个
  for (const t of okList) { if (t.kind === 'tier' && shelfLabs[t.i] && shelfLabs[t.i].html) { upTierIn.add(t.i); continue } { okKeys.add(t.key);
    let m = upMarks.get(t.key); if (!m) { const v = new THREE.Vector3(); m = { v, lab: UI.label(() => v, 'upmark', 'main', { hold: 1000 }) }; upMarks.set(t.key, m) }
    m.v.set(t.st.x, (t.k && W.wsItems[t.k] && W.wsItems[t.k].top ? W.wsItems[t.k].top : t.st.h) + 0.9, t.st.z); m.lab.set('<b>⬆</b>') } }
  for (const [k, m] of upMarks) if (!okKeys.has(k)) m.lab.set('');
  upShown.clear(); for (const t of okList) upShown.add(t.key);
  /* 最近的那个 */
  let best = null, bd = UP_R;
  for (const t of list) { const inf = UI.upInfo(S, t), busy = UI.upBusy(S, t); if (!busy && (!inf || inf.max)) continue; const d = rectDist(t.st, P.pos); if (d <= bd) { bd = d; best = t } }
  upCur = best;
  if (!best || UI.panelOpen() || scavBusy) { btn.classList.add('hidden') }
  else { const busy = UI.upBusy(S, best), tx = busy ? `升级中 ${UI.fmtT(busy.left)}` : `⬆ 升级 ${best.name}`; if (btn.textContent !== tx) btn.textContent = tx; btn.classList.remove('hidden'); btn.classList.toggle('busy', !!busy); btn.classList.toggle('can', !busy && !!(UI.upInfo(S, best) || {}).ok) }
  if (upWinT) { const b = $('#upWin .ubox'), h = UI.upHTML(S, upWinT); if (b.__h !== h) { b.__h = h; b.innerHTML = h } }
}
function upOpen(t) { upWinT = t; const w = $('#upWin'); w.querySelector('.ubox').innerHTML = UI.upHTML(S, t); w.classList.remove('hidden') }
function upClose() { upWinT = null; $('#upWin').classList.add('hidden') }
$('#upBtn').onclick = () => { if (upCur) upOpen(upCur) };
$('#upWin').addEventListener('click', e => { const b = e.target.closest('[data-up]'); if (!b && e.target.id !== 'upWin') return; if (!b || b.dataset.up === 'close') { upClose(); return }
  if (b.disabled || !upWinT) return; const t = upWinT;
  if (t.kind === 'tier') actions.tier(t.i); else if (t.kind === 'tower') actions.towerUp(t.i); else actions.build(t.k);
  upClose(); upAt = 0 });
$('#boatBtn').onclick = () => boatGo();
$('#fishBtn').onclick = () => {};
$('#merchBtn').onclick = () => UI.openMall(inFish);
{ const b = $('#merchBtn').cloneNode(); b.id = 'smithBtn'; b.textContent = '找铁匠'; $('#merchBtn').after(b); b.onclick = () => { const g = UI.gst('smith'); g.sel = null; UI.openPanel('smith') } }   /* 设计 107 */
$('#pondBtn').onclick = () => UI.openPanel('pond');

/* ---------- 开始游戏 ---------- */
function start(S0, isNew) {
  if (S) return;                                 // 防止连点两次开两局
  S = S0 || L.newState();
  $('#hud').classList.remove('hidden');
  SV.bindSave(() => S, briefOf);
  if (!isNew) {
    /* 有服务器时间就按服务器时间算；拿不到（断网从缓存打开）就按手机时钟算，但最多 1 小时，防止改时钟 */
    const secs = S.srvAt && SV.hasSrv() ? (SV.srvNow() - S.srvAt) / 1000 : S.savedAt ? Math.min(3600, (Date.now() - S.savedAt) / 1000) : 0;
    settle(Math.max(0, secs));
  }
  if (S.awayOn || S.awayBank) awayPay();        // 上次在拾荒区 / 钓鱼区时关了游戏：存着的钱现在领
  if (S.herdRefund) { const tx = `牧场的动物改成要在院子商人那里买了：棚里原来送的动物收回，退还 ${S.herdRefund} 末日币`; setTimeout(() => { UI.toast(tx, 'good', 6000); UI.msg(S, tx, 'good') }, 1500); delete S.herdRefund }
  if (S.notice61) { const tx = '木柴改成原料了：去「建造」→「工坊」盖木工台，把木柴做成木炭、手电筒、火炬再卖；牧场的蛋、毛、牛奶、猪肉也要在工坊做成东西卖'; setTimeout(() => { UI.toast(tx, 'good', 7000); UI.msg(S, tx, 'info') }, 2000); delete S.notice61 }   // 设计 31～33 老玩家提示一次
  if (S.notice62) { const r = S.notice62, tx = `第 2 台木工台换成甜品机了，费用已退回（${r.coins} 末日币${r.toolbox ? ` + ${r.toolbox} 个工具箱` : ''}）`; setTimeout(() => { UI.toast(tx, 'good', 7000); UI.msg(S, tx, 'info') }, 2600); delete S.notice62 }   // 35b
  delete S.bgAt; delete S.closedAt;              // 0.33 给 GM 网页看的：切后台 / 关游戏的时间（进游戏就清掉）
  if (S.wsMoved) { delete S.wsMoved; const tx = '格局改了：工坊在超市南边，农田在超市西边，商人在大门北边'; setTimeout(() => { UI.toast(tx, 'good', 6000); UI.msg(S, tx, 'info') }, 2500) }   // 设计 40：旧存档提示一次
  if (S.gmAt && S.gmNote) { const tx = '存档被管理员修改过：' + S.gmNote; setTimeout(() => { UI.toast(tx, 'good', 6000); UI.msg(S, tx, 'info') }, 1500); delete S.gmNote }
  S.drops = [];                                  // 每次进游戏都在超市里；以前掉在废街上的东西不要了
  syncPickups(); custSync(); L.restock(S); SV.saveNow();
  W.setStoreName(S.storeName); L.tdDay(S, bjDay()); L.staffDay(S, bjDay()); 
  if (S.tixGift) { const tx = `副本改用召唤券了：送你 ${S.tixGift} 张，以后在院子商人那里买（${FB.tixPrice} 末日币一张）。尸潮券还是打尸潮用。`; delete S.tixGift; SV.saveNow(); setTimeout(() => { UI.toast(tx, 'good', 7000); UI.msg(S, tx, 'good') }, 2600) }   // 设计 108
  if (S.hpRefund) { const r = S.hpRefund, tx = `主角血量不用升级了，已退回 末日币 ${r.coins}、工具箱 ${r.toolbox}`; delete S.hpRefund; SV.saveNow(); setTimeout(() => { UI.toast(tx, 'good', 6000); UI.msg(S, tx, 'good') }, 2000) }   // 设计 59
  if (S.fb.run) { const n = S.fb.run; FL.fbLose(S); SV.saveNow(); setTimeout(() => UI.toast(`上次副本第 ${n} 关没打完就离开了，按输算`, '', 5000), 1500) }   // 设计 56
  if (S.fb.pend) setTimeout(() => { if (!UI.panelOpen()) UI.openPanel('fbGot') }, 2500);   // 上次打赢的装备还没收下
  if (S.td.run) { const lv = S.td.run, r = L.tdEnd(S, lv, false, true); SV.saveNow();      // 上次尸潮打到一半就关掉了：按撤退算，什么都不给（V1.01）
    setTimeout(() => UI.toast(`上次${tdName(lv)}没打完就离开了，按撤退算，没有奖励`, "", 5000), 1500) }
  if (S.look) { S.look = fixLookSex(cleanLook(S.look)); setLook(player, S.look, LOOK); drawHudAvatar() } else editLook(true);   // 旧存档里男主角的上衣 / 裤子颜色读档时去掉
  $('#farmBtn').onclick = () => UI.openPanel('farm');
  last = performance.now(); requestAnimationFrame(loop);
}

/* ---------- 每帧 ---------- */
const portrait = matchMedia('(orientation:portrait) and (max-width:900px)');
const penBars = {}, plotLabs = [], treeLabs = [], tmpLab = new THREE.Vector3(), plotTxt = [], plotTxtI = [];
const penLabs = {};
let frameN = 0;
/* 设计 69：头顶牌子走近了才显示。设置里「头顶牌子：只显示附近的 / 全部显示」，默认只显示附近的（存在这台手机上）。
   场地：超市里、工坊石板地、温室、果园、牧场、东北角空地；牌子在哪块场地，主角在同一块场地才显示（场地边上留 1 米缓冲，温室、果园 2 米；出来 0.5 秒后才藏，见 ui.js nearOK）；
   不在场地里的（回收机、宿舍、仓库、塔、施工、院子里的人）离主角 5 米内才显示；码头 4 米。尸潮、布置时照旧全部显示 */
let labNear = (() => { try { return localStorage.getItem('ms_labNear') !== '0' } catch (e) { return true } })();
const ZONES = { store: [STORE, 1], ws: [WS_AREA, 1], gh: [GH_AREA, 2], orch: [ORCH_AREA, 2], ranch: [{ x0: -71, x1: -44.2, z0: -9.8, z1: 12.8 }, 1], ne: [{ x0: -15.2, x1: -3.8, z0: -24.8, z1: -10.1 }, 1] };
const inRect = (a, x, z, m = 0) => x >= a.x0 - m && x <= a.x1 + m && z >= a.z0 - m && z <= a.z1 + m;
const zoneOf = (x, z) => { for (const [k, [a]] of Object.entries(ZONES)) if (inRect(a, x, z)) return k; return null };
const inZone = k => { const Z = ZONES[k]; return !!Z && inRect(Z[0], P.pos.x, P.pos.z, Z[1]) };
function setNear() { UI.setNear({ on: labNear && !TDR.active() && !lay && !away(), x: P.pos.x, z: P.pos.z, zoneOf, inZone }) }
let eco = (() => { try { return localStorage.getItem('ms_eco') === '1' } catch (e) { return false } })();   // 0.26 省电模式：隔一帧画一次
/* 省电模式：30 帧、不画 3D 草这些、画面分辨率降到 1 倍 */
const touchDev = matchMedia('(pointer:coarse)').matches;   // 手机 / 平板
function applyEco() { setGfxHigh(!eco); W.renderer.setPixelRatio(eco ? 1 : Math.min(touchDev && perfOpt('pr') ? 1.25 : 1.5, window.devicePixelRatio || 1)); lastWH = ''; resize() }   // 设计 30：手机画面 1.25 倍（开关，用户看过对比图再定）
applyEco();
/* V1.01 手机吃力自动开省电：开始玩以后量 20 秒帧数，平均不到 40 帧就开（只自动开一次，设置里可以关） */
const fpsProbe = { t: 0, n: 0, done: /[?&]debug/.test(location.search) || (() => { try { return !!localStorage.getItem('ms_eco_auto') } catch (e) { return true } })() };
function probeFps(rawDt) {
  if (fpsProbe.done || eco || document.hidden || rawDt > 0.25) return;
  fpsProbe.t += rawDt; fpsProbe.n++;
  if (fpsProbe.t < 20) return;
  fpsProbe.done = true; try { localStorage.setItem('ms_eco_auto', '1') } catch (e) { /* 存不了下次再量 */ }
  if (fpsProbe.n / fpsProbe.t < 40) { eco = true; try { localStorage.setItem('ms_eco', '1') } catch (e) { /* 只管这一次 */ } applyEco(); UI.toast('手机有点吃力，自动开了省电模式（设置里可以关）', '', 4000) }
}
let campShown = -1, pondShown = -1, fullShopWarn = -99, nearReg = false, coT = 0, ripeWarn = -99, inFarm = false;
let camLock = null, dbgSpeed = 1, last = 0, saveT = 0, shake = 0, fullWarn = 0, queueWarn = 0, depT = 0, clock = 0;
const camTgt = new THREE.Vector3(), camOff = new THREE.Vector3(0, 14, 14.5).multiplyScalar(1.15);   // 0.10：用户要远一点，拉远 15%
/* V1.21 手机发烫：
   - 最多每秒 60 帧（高刷手机 120Hz 以前跟着跑 120 帧，最烫）；
   - 站着不动、没在打尸潮、不在拾荒区和钓鱼区时，降到每秒 30 帧（摸一下屏幕或走起来马上回到 60）；
   - 省电模式一直 30 帧；开着面板时，后面的 3D 画面每秒只画 10 次（被面板挡着） */
let hotAt = 0, lastDraw = 0, lastRun = 0, farT = 0, glT = 0;
document.addEventListener('pointerdown', () => { hotAt = performance.now() }, true);
document.addEventListener('keydown', () => { hotAt = performance.now() }, true);
const isHot = now => now - hotAt < 2000;
/* 设计 30：尸潮里最近 3 秒平均每帧超过 22 毫秒（撑不住 45 帧）就降到 30 帧，提示一次 */
let tdLow = false; const tdProbe = { t: 0, n: 0 };
let flatZOff = false;   // 设计 67：尸潮里撑不住 50 帧（平均每帧超过 20 毫秒），先不画丧尸的压扁影子；还撑不住再降到 30 帧
function probeTd(gapMs) {
  if (!TDR.active() && flatZOff) { flatZOff = false; setFlatZombie(true) }
  if (tdLow || eco || !perfOpt('fps') || !TDR.active() || document.hidden || gapMs > 250) { tdProbe.t = tdProbe.n = 0; return }
  tdProbe.t += gapMs; tdProbe.n++;
  if (tdProbe.t < 3000) return;
  if (!flatZOff && perfOpt('flat') && tdProbe.t / tdProbe.n > 20) { flatZOff = true; setFlatZombie(false); tdProbe.t = tdProbe.n = 0; return }
  if (tdProbe.t / tdProbe.n > 22) { tdLow = true; UI.toast('手机有点吃力，尸潮改成 30 帧', '', 3500) }
  tdProbe.t = tdProbe.n = 0;
}
function loop(now) {
  requestAnimationFrame(loop);
  /* 设计 66：帧数只用 30 / 60（屏幕 60、120 赫兹的约数，帧间隔一样长）：走路、跑动 60，站着 30，省电 30。
     设计 57 的「走路 45 帧」默认关了（45 不是 60 的约数，帧间隔 16.7 / 16.7 / 33.3 毫秒忽长忽短，镜头一移画面就一抖一抖）；性能小窗里还能打开对比 */
  const cap45 = touchDev && perfOpt('fps45') && !TDR.active() && !FBV.active() && !FG.busy() && !lay && !creating;
  const gap = eco || (tdLow && TDR.active()) || (!isHot(now) && S && !lay && !creating) ? 1000 / 30 : cap45 ? 1000 / 45 : 1000 / 60;
  PERF_X.cap = Math.round(1000 / gap);   // 设计 66：性能小窗写现在的帧上限
  if (now - lastRun < gap - 3) return; probeTd(now - lastRun); lastRun = now - lastRun > gap * 2 ? now : lastRun + gap;   // dt 按真实时间算，帧少了速度不变；lastRun 按步长加（45 帧 = 4 帧画 3 帧）
  const cpu0 = performance.now();
  const rawDt = (now - last) / 1000;
  const dt = Math.min(0.1, (now - last) / 1000) * dbgSpeed; last = now; clock += dt;   // 手机掉帧时也按真实时间走（以前卡到 0.05 会让人和丧尸时快时慢）
  if (!S) return;
  setAnimView(camera, P.pos, player);   // 设计 57：看不到的人不更新动画
  if (isHot(now)) probeFps(rawDt);   // 只在 60 帧的时候量
  /* 创建人物：游戏暂停，镜头拉近看主角（正面站着，不转） */
  if (lay) {                                     /* 布置：游戏暂停，俯视整个超市 */
    const GG = GR().G, mx = GG.x0 + GG.cols * GG.cell / 2, mz = GG.z0 + GG.rows * GG.cell / 2, asp = camera.aspect;
    /* 上面有说明框、下面有按钮条：网格放在屏幕中间偏下的 70% 高度里 */
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), h0 = 0.85 * Math.max(15, (LY.G.rows * LY.G.cell / 2 + 1) / (t * 0.7), (LY.G.cols * LY.G.cell / 2 + 1) / (t * asp * 0.8));   // 布置时镜头近 15%（用户要的）
    /* 0.20 用户：布置时太远 —— 能放大缩小（双指捏、滚轮、＋－按钮），放大后能拖着看（双指，或者没选中东西时单指拖空地） */
    const h = h0 / lay.zoom, hx = Math.max(0, LY.G.cols * LY.G.cell / 2 - h * t * asp * 0.8), hz = Math.max(0, LY.G.rows * LY.G.cell / 2 - h * t * 0.7);
    lay.px = Math.max(-hx, Math.min(hx, lay.px)); lay.pz = Math.max(-hz, Math.min(hz, lay.pz)); lay.wpp = 2 * h * t / scrH;   // 屏幕上 1 像素 ≈ 地上多少米
    const cx = mx + lay.px, cz = mz + lay.pz; zoomKnob();
    camera.position.set(cx, h, cz + h * 0.12 - 0.08 * h * t); camera.lookAt(cx, 0, cz - 0.08 * h * t);
    UI.updateLabels(camera); renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera); return;
  }
  if (creating) {
    if (show) { player.visible = false; show.update(dt) } else { player.position.set(START_POS.x, 0, START_POS.z); player.visible = true; player.rotation.y = CLOSEUP_YAW; animH(player, clock, 0) }   // 设计 18l：展示用人物（站姿、空手）
    /* 设计 18l：固定角度（正面往右转 20°）、平视（相机在胸口高度，水平看），不能转。用单独的相机：近裁剪面放到人前面一点，人和相机之间的墙、柱子不挡；
       人物放左边：平移画面（setViewOffset），不倾斜相机 */
    const cw = renderer.domElement.width, chh = renderer.domElement.height, d = 6.3, eye = 1.12;   // 设计 29：只有横屏   // 设计 18v / 18y：新身体头小、腿长；女生双马尾高，镜头往后拉、往上抬一点，头顶上方留空；稍高一点
    creatorCam.aspect = cw / chh; creatorCam.near = d - 1.4; creatorCam.position.set(START_POS.x, eye, START_POS.z + d); creatorCam.lookAt(START_POS.x, eye, START_POS.z);
    creatorCam.setViewOffset(cw, chh, cw * 0.24, 0, cw, chh);
    renderer.shadowMap.needsUpdate = true; renderer.render(scene, creatorCam); return;
  }
  /* 逻辑 */
  L.setShopPaused(TDR.active() || FBV.active() || (away() && !L.hasCashier(S)));   // 设计 56：打副本时也暂停营业          // 尸潮时、没有收银员时去拾荒区：暂停营业
  handleEvents(L.tick(S, dt, true));
  if (clock % 2 < dt) msgPoll();
  if (clock % 1 < dt) UI.msgRender(S);          // 消息下拉开着时：新消息、「几分钟前」随时更新
  if (clock % 5 < dt) { L.tdDay(S, bjDay()); L.staffDay(S, bjDay()) }
  const tdOn = TDR.active();
  if (UI.curPanel() === 'hero' || UI.curPanel() === 'gear') heroView.frame(dt);
  if (tdOn) { if (!UI.panelOpen() && !portrait.matches) TDR.update(dt, clock); tdHud() }      // 开着面板、竖屏时尸潮也暂停
  saveT += dt; if (saveT >= AUTOSAVE) { saveT = 0; SV.saveNow() }
  /* 设计 56：在副本里，画副本的场景（超市那边只跑逻辑） */
  if (FBV.active()) {
    hotAt = now; FBV.frame(dt, clock); frameN++; if (frameN % 8 === 0) UI.refreshPanel(); UI.updateLabels(camera);
    if (UI.panelOpen() && now - lastDraw < 100) return; lastDraw = now;
    if (SSH) { if (shCache.frame(FBV.scene(), now, false)) PERF_X.shNow = 1 } else { renderer.shadowMap.needsUpdate = true; PERF_X.shNow = 1 }   // 设计 57：副本也一样（屠夫、小丧尸、主角都是假影子）
    syncBlobs(FBV.scene(), camera, player.position); renderer.render(FBV.scene(), camera);   // 设计 67：压扁影子
    if (PERF.on) perfFrame(renderer, now, performance.now() - cpu0, FBV.fight() ? FBV.fight().mobs.length : 0);
    return;
  }

  /* 主角移动 */
  const home0 = !away();
  const d = UI.panelOpen() || FG.busy() || fbWalk ? { x: 0, y: 0 } : moveDir(), sp = PLAYER.speed;   // 抛出去以后站着不动（0.24 起没抛竿时能随便走）
  const mv = Math.hypot(d.x, d.y); if (mv > 0.01 || tdOn || !home0 || FG.busy() || camLock) hotAt = now;
  /* 分小步走、每步都检查碰撞，被丧尸撞飞时也不会一下穿过货架或墙 */
  { const mx = (d.x * sp + P.kb.x) * dt, mz = (d.y * sp + P.kb.y) * dt, n = Math.max(1, Math.ceil(Math.hypot(mx, mz) / 0.2)), sb = away() ? [] : shelfBoxes(), obs = inScav ? map.obstacles : inFish ? FI.obstacles : W.obstacles, bnd = inScav ? map.B : inFish ? FI.B : undefined;
    for (let i = 0; i < n; i++) { P.pos.x += mx / n; P.pos.z += mz / n; collide(P.pos, 0.42, obs, bnd); if (sb.length) collide(P.pos, 0.42, sb) } }
  P.kb.multiplyScalar(Math.max(0, 1 - dt * 6));
  if (fbWalk) { const w = fbWalk; w.t += dt; const k = Math.min(1, w.t / w.dur); P.pos.lerpVectors(w.from, w.to, k); player.rotation.y = Math.atan2(w.to.x - w.from.x, w.to.z - w.from.z); hotAt = now; if (k >= 1) { fbWalk = null; w.done && w.done() } }   // 设计 56：走进 / 走出传送门
  const aimY = tdOn ? TDR.aimYaw() : null;            // 0.23：尸潮里刚开过枪就一直面朝目标（边走边打，枪口对着丧尸）
  if (aimY != null) { let da = aimY - player.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); player.rotation.y += da * Math.min(1, dt * 18) }
  else if (mv > 0.05) { const a = Math.atan2(d.x, d.y); let da = a - player.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); player.rotation.y += da * Math.min(1, dt * 14) }
  animH(player, clock, fbWalk ? 3.5 : mv * sp);
  if (tdGun && tdGun.visible) aimArms(player);   // 尸潮时双手端着 M16
  if (P.inv > 0) { P.inv -= dt; player.visible = Math.floor(P.inv * 10) % 2 === 0 || P.inv <= 0 } else player.visible = true;

  /* 捡物资（同一种东西叠在一格里；没有空格、也没有能叠的格子就捡不起来） */
  const cap = L.bagCap(S);
  /* 0.28：尸潮时门口马路（超市的拾荒区）上的物资收起来，不能捡 */
  for (const m of streetMeshes) if (m) m.visible = !tdOn;
  if (!away() && !tdOn) S.street.forEach((s, i) => { if (!s.t || !SPAWN_POS[i]) return; const [x, z] = SPAWN_POS[i];
    if (Math.hypot(P.pos.x - x, P.pos.z - z) > PLAYER.pickR) return;
    if (!L.bagRoom(S, s.t)) { if (clock - fullWarn > 3) { fullWarn = clock; UI.toast(`背包 ${cap} 格都占满了，装不下「${itemName(s.t)}」`, 'bad') } return }
    const t = s.t; L.takeSpawn(S, i, 'street'); fly(t, new THREE.Vector3(x, 0.3, z), () => P.pos.clone().setY(1.2)); UI.floatText(new THREE.Vector3(x, 1.4, z), itemName(t), '');
  });
  if (inScav) S.spawns.forEach((s, i) => { if (!s.t || !spotOf[i] || !spawnMeshes[i]) return; const [x, z] = spotOf[i];
    if (Math.hypot(P.pos.x - x, P.pos.z - z) > PLAYER.pickR) return;
    if (!L.bagRoom(S, s.t)) { if (clock - fullWarn > 3) { fullWarn = clock; UI.toast(`背包 ${cap} 格都占满了，装不下「${itemName(s.t)}」`, 'bad') } return }
    const t = s.t; L.takeSpawn(S, i); fly(t, new THREE.Vector3(x, 0.3, z), () => P.pos.clone().setY(1.2)); UI.floatText(new THREE.Vector3(x, 1.4, z), itemName(t), L.isSeed(t) ? 'x3' : '');
  });
  if (inScav) for (let i = S.drops.length - 1; i >= 0; i--) { const dd = S.drops[i];
    if (P.inv > 0 || Math.hypot(P.pos.x - dd.x, P.pos.z - dd.z) > PLAYER.pickR) continue;   // 刚被碰到的 2 秒内捡不起来
    if (!L.bagRoom(S, dd.t)) continue;
    const t = dd.t; L.takeDrop(S, i); fly(t, new THREE.Vector3(dd.x, 0.3, dd.z), () => P.pos.clone().setY(1.2)) }
  syncPickups();

  /* 投入回收机：站在旁边，一件一件飞进去 */
  depT -= dt;
  const home = !away();
  if (home && S.bag.length && Math.hypot(P.pos.x - REC_POS.x, P.pos.z - REC_POS.z) < PLAYER.recR + 0.4) { const ns = L.unloadSeeds(S); if (ns) UI.toast(`${ns} 包种子放进仓库了`, 'good') }
  if (home && S.bag.length && Math.hypot(P.pos.x - REC_POS.x, P.pos.z - REC_POS.z) < PLAYER.recR + 0.4 && depT <= 0) {
    const t = L.depositOne(S);
    if (t) { depT = 0.12; fly(t, P.pos.clone().setY(1.2), recTop.clone().setY(2.3)) }
    else if (t === false && clock - queueWarn > 3) { queueWarn = clock; UI.toast('回收机排满了，等它处理一会儿', 'bad') }
  }

  /* 背包里剩下的鱼（上次池塘放不下的）：走到池塘边自动放进去（0.22 起鱼放池塘，没盖池塘时放水桶） */
  if (home && nearPond(3) && S.bag.some(b => L.isFish(b.t))) {
    const nf = L.unloadFish(S); if (nf) UI.toast(`${nf} 条鱼放进${L.pondWhere(S)}了`, 'good'); else if (clock - whWarn > 4) { whWarn = clock; UI.toast(`${L.pondWhere(S)}里的鱼放满了，卖掉一些${S.lv.pond < 3 ? '或者升级池塘' : ''}`, 'bad') } }
  /* 温室、果园：走过熟了的菜和果树就自动收 */
  const inA = (A, pad = 0.8) => P.pos.x > A.x0 - pad && P.pos.x < A.x1 + pad && P.pos.z > A.z0 - pad && P.pos.z < A.z1 + pad;
  inFarm = home && ((S.lv.gh && inA(GH_AREA)) || (S.lv.orchard && inA(ORCH_AREA)));
  $('#farmBtn').classList.toggle('hidden', !inFarm || UI.panelOpen());
  const inStore = home && P.pos.x > STORE.x0 && P.pos.x < STORE.x1 && P.pos.z > STORE.z0 && P.pos.z < STORE.z1;
  const inWs = home && S.lv.store >= 3 && inWsArea(P.pos);   // 设计 43 露天工坊（超市南边）
  $('#layBtn').classList.toggle('hidden', !(inStore || (inWs && (S.fix.ws || []).length)) || UI.panelOpen() || inFarm || TDR.active());
  $('#hDrop .dt.ws').classList.toggle('hidden', !(S.lv.store >= 3));
  $('#hDrop .dt.fbgear').classList.toggle('hidden', !(S.lv.store >= FB.store));   // 设计 56：装备（超市 5 级以后）   // 0.43 用户：工坊按钮放进菜单（超市 3 级起）
  wsLabels(inWs);
  nearUp(home && !TDR.active());   // 37 就近升级
  autoPop(dt, home);   // 设计 60：走近出「查看」按钮
  const nearTruck = inFish ? false : inScav ? Math.hypot(P.pos.x - map.truck.x, P.pos.z - map.truck.z) < 3.8 : Math.hypot(P.pos.x - TRUCK_POS.x, P.pos.z - TRUCK_POS.z) < 3.6;
  { const b = $('#scavBtn'); b.classList.toggle('hidden', !nearTruck || UI.panelOpen() || TDR.active() || scavBusy); const tx = inScav ? '回超市' : '去拾荒区'; if (b.textContent !== tx) b.textContent = tx }
  if (home && S.lv.gh) S.plots.forEach((p, i) => { if (!p || p.left > 0) return; const [x, z] = PLOT_POS[i]; if (Math.hypot(P.pos.x - x, P.pos.z - z) > 1.1) return;
    const r = L.harvest(S, i); if (r && r.full) fullWarnAt(GOODS[r.c].name); else if (r) { face('happy', 1); UI.floatText(new THREE.Vector3(x, 1.3, z), `${r.x > 2 ? '暴击 ×3！' : r.x > 1 ? '×2！' : ''}+${r.n} ${GOODS[r.c].name}${r.bonus ? '　+1 种子' : ''}`, r.x > 2 ? 'x10' : 'x3'); vegTip(r.c, r.shelf) } });
  if (home) S.trees.forEach((t, i) => { if (!t || t.left > 0) return; const [x, z] = TREE_POS[i]; if (Math.hypot(P.pos.x - x, P.pos.z - z) > 1.7) return;
    const r = L.pickTree(S, i); if (r && r.full) fullWarnAt(GOODS[r.k].name); else if (r) { UI.floatText(new THREE.Vector3(x, 2.6, z), `${r.x > 2 ? '暴击 ×3！' : r.x > 1 ? '×2！' : ''}+${r.n} ${GOODS[r.k].name}`, r.x > 2 ? 'x10' : 'x3'); vegTip(r.k, r.shelf) } });

  /* 收银台：站在旁边就一位一位结账 */
  nearReg = home && Math.hypot(P.pos.x - REG_POS.x, P.pos.z - REG_POS.z) < SHOP.checkoutR;
  if (nearReg && S.queue.length && S.queue[0].ready !== false) { coT -= dt; if (coT <= 0) { coT = SHOP.checkoutTime; const c = L.checkout(S);
    if (c) { face('happy', 1); UI.floatText(regTop.clone().setY(2.2), `+$${c.pay}${c.ex ? '　多买了' + c.ex.map(x => GOODS[x.g].name).join('、') : ''}${c.tip ? '　小费：' + GOODS[c.tip].name + '种子' : ''}`, 'coin'); custLeave(c.id) } } } else coT = Math.min(coT, 0.3);

  /* 丧尸：打开面板、或者手机竖着（显示「请横过来」）时，丧尸原地不动，也不会咬人 */
  const safe = !inScav || Math.hypot(P.pos.x - map.truck.x, P.pos.z - map.truck.z) < SAFE_R, frozen = UI.panelOpen() || portrait.matches || tdOn || scavBusy;
  if (inScav) for (const z of zombies) {
    if (frozen) { animH(z.m, clock, 0); continue }
    const p = z.pos, dx = P.pos.x - p.x, dz = P.pos.z - p.z, dist = Math.hypot(dx, dz);
    if (z.cd > 0) z.cd -= dt;
    if (z.mode !== 'chase' && !safe && dist < ZOMBIE.see && z.cd <= 0) { z.mode = 'chase'; z.react = ZOMBIE.react; z.hd = null; UI.floatText(p.clone().setY(2.3), '！', 'bad') }
    if (z.mode === 'chase' && (safe || dist > ZOMBIE.lose)) { z.mode = 'wander'; z.tgt = null }
    let vx = 0, vz = 0, s = 0;
    if (z.mode === 'chase' && z.react > 0) z.react -= dt;
    else if (z.mode === 'chase' && z.cd <= 0) {      // 朝主角转过去，但每秒只能转这么多，急转弯会甩开它
      const want = Math.atan2(dx, dz); if (z.hd == null) z.hd = z.m.rotation.y;
      let da = want - z.hd; da = Math.atan2(Math.sin(da), Math.cos(da)); const mx = ZOMBIE.turn * dt; z.hd += Math.max(-mx, Math.min(mx, da));
      vx = Math.sin(z.hd); vz = Math.cos(z.hd); s = ZOMBIE.chase * (Math.abs(da) > 1.2 ? 0.6 : 1) }
    else if (z.rest > 0) z.rest -= dt;
    else { if (!z.tgt) { z.tgt = map.near(p.x, p.z, 9); z.stuck = 0; if (!z.tgt) z.rest = 1 }
      if (z.tgt) { const tx = z.tgt.x - p.x, tz = z.tgt.z - p.z, td = Math.hypot(tx, tz);
        z.stuck = (z.stuck || 0) + dt; if (td < 0.5 || z.stuck > 8) { z.tgt = null; z.rest = rnd(1, 3) } else { vx = tx / td; vz = tz / td; s = ZOMBIE.wander } } }
    /* 丧尸之间别挤在一起 */
    for (const o of zombies) if (o !== z) { const ox = p.x - o.pos.x, oz = p.z - o.pos.z, od = Math.hypot(ox, oz); if (od < 1 && od > 0) { p.x += ox / od * (1 - od) * 0.5; p.z += oz / od * (1 - od) * 0.5 } }
    p.x += vx * s * dt; p.z += vz * s * dt;
    collide(p, 0.4, map.obstacles, map.B);
    if (Math.hypot(p.x - map.truck.x, p.z - map.truck.z) < SAFE_R - 0.5) { const a = Math.atan2(p.z - map.truck.z, p.x - map.truck.x); p.x = map.truck.x + Math.cos(a) * (SAFE_R - 0.5); p.z = map.truck.z + Math.sin(a) * (SAFE_R - 0.5); z.mode = 'wander'; z.tgt = null }   // 丧尸不进货车旁边的安全区
    if (s) { const a = Math.atan2(vx, vz); let da = a - z.m.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); z.m.rotation.y += da * Math.min(1, dt * 8) }
    animH(z.m, clock, s);
    /* 碰到主角 */
    if (!safe && dist < 0.85 && P.inv <= 0) {
      const lost = L.hit(S); P.inv = ZOMBIE.invuln; z.cd = 1.5; z.mode = 'wander'; z.rest = 1.2;
      P.kb.set(dx / (dist || 1) * 10, dz / (dist || 1) * 10); UI.flash(); shake = 0.3;
      lost.forEach(({ t, n }, k) => { const a = (k / Math.max(1, lost.length)) * Math.PI * 2 + Math.random(), r = rnd(1.2, 2.2);
        const q = { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r }; collide(q, 0.5, map.obstacles, map.B); if (!map.canReach(q.x, q.z)) { q.x = P.pos.x; q.z = P.pos.z } S.drops.push({ t, n, x: q.x, z: q.z }) });
      const nl = lost.reduce((a, x) => a + x.n, 0);
      UI.toast(nl ? `被丧尸碰到了，掉了 ${nl} 件东西在地上` : '被丧尸碰到了', 'bad');
    }
  }

  /* 画面 */
  updFlyers(dt); updCustomers(dt, clock); FV.update(S, clock); syncShelves(); W.syncTowers(S.towers); updSite(); if (whShown !== S.lv.wh) { whShown = S.lv.wh; W.setWarehouse(S.lv.wh) }
  if (inScav) { SC.update(map, P.pos, dt); updSurvivor(dt) }
  if (inFish) fishFrame(dt);
  else { const nd = Math.hypot(P.pos.x - DOCK_POS.x, P.pos.z - DOCK_POS.z) < 2.2; showBtn('#boatBtn', home && nd && !tdOn, AD.packPct('fish') < 100 ? `资源下载中 ${AD.packPct('fish')}%` : '坐船去钓鱼'); showBtn('#fishBtn', false) }
  merchFrame(dt); smithFrame(dt); mysFrame(dt);
  /* 设计 56 传送门：画面外不转；门前 2 米出按钮（没到 5 级灰色写「超市 5 级解锁」，尸潮中写「尸潮中，打完再来」） */
  portal.update(dt, camera);
  { const nearP = home && !fbWalk && Math.hypot(P.pos.x - PORTAL_FRONT.x, P.pos.z - PORTAL_FRONT.z) < 2, lock = S.lv.store < FB.store, tdN = TDR.active();
    showBtn('#fbBtn', nearP, tdN ? '尸潮中，打完再来' : lock ? `超市 ${FB.store} 级解锁` : AD.packPct('fb1') < 100 ? `资源下载中 ${AD.packPct('fb1')}%` : '进入副本');   /* 设计 75：没下完也能点（照旧从网上读） */ $('#fbBtn').classList.toggle('grey', lock || tdN) }
  syncStaff(dt); if (campShown !== S.lv.camp) { campShown = S.lv.camp; W.setCamp(campShown) }
  W.ranch.sync(S); W.ranch.tick(dt, clock, !away() && P.pos.x < -36);   // 0.28 牧场的动物
  if (pondShown !== (S.lv.pond || 0)) { pondShown = S.lv.pond || 0; W.setPond(pondShown) } if (!inFish && !away()) { W.pondTick(S.fishQ || {}, dt); W.gfxTick(dt, P.pos) }   // V1.01 草随风摆、落叶、云影
  for (const m of [...spawnMeshes, ...streetMeshes]) if (m) { m.userData.j.position.y = 0.1 + Math.sin(clock * 3 + m.position.x) * 0.08; m.userData.j.rotation.y += dt }
  W.fire.userData.flames.forEach((f, i) => { f.scale.y = 0.8 + Math.sin(clock * (9 + i * 3) + i) * 0.25 }); W.fireLight.intensity = 9 + Math.sin(clock * 13) * 1.5 + Math.sin(clock * 7) * 1;
  const busy = S.rq.length > 0 && !L.recBlocked(S); W.recycler.setLv(S.lv.rec); W.recycler.tick(dt, clock, busy);   // 0.28 回收机：按等级换模型、干活时抖、出料动画

  /* 标签 */
  const rc = L.recCfg(S);
  const blk = L.recBlocked(S);
  const rb = L.busyWith(S, 'rec'), recUp = rb ? `<br><small>施工中 → ${rb.to} 级　还要 ${UI.fmtT(rb.left)}</small>` : '';
  recLab.set(`<div class="box">回收机 ${S.lv.rec} 级　排队 ${S.rq.length}/${rc.queue}${recUp}${L.recFullGoods(S).length ? `<br><small class="warn">仓库的${L.recFullGoods(S).map(g => GOODS[g].name).join('、')}满了${blk ? '，停着等' : '，先做别的'}</small>` : busy ? '<span class="pg"><i></i></span>' : '<br><small>把物资带到这里</small>'}</div>`, S.rp / rc.time * 100);
  const nearStore = P.pos.x < STORE.x1 + 4 && P.pos.x > STORE.x0 - 2;
  /* 设计 45：同一种货在好几个货柜上，全部货柜都空了才写「缺货」；只是这个货柜空了（别的还有），画一个灰色小点 */
  shelfLabs.forEach((lb, i) => { const sh = S.shelves[i]; if (!sh || !(nearStore || lay)) { lb.set(''); return }
    if (lay) { lb.set(`<div class="box">${i + 1} ${FIXTURE[sh.type].name}</div>`); return }
    const sls = L.slotsOf(sh); if (!sls.some(sl => sl.g)) { lb.set(`<div class="box">空${FIXTURE[sh.type].name}</div>`); return }
    const emp = sls.filter(sl => sl.g && !sl.n), out = [...new Set(emp.filter(sl => !L.onShelves(S, sl.g)).map(sl => sl.g))], dot = emp.some(sl => L.onShelves(S, sl.g) > 0), up = upTierIn.has(i) ? '<b class="upin">⬆</b>' : '';
    lb.set(out.length ? `<div class="box warn">${out.map(g => `${GOODS[g].name}　缺货`).join('<br>')}${up}</div>` : dot ? `<div class="sgdot"><i></i>${up}</div>` : '') });   // V1.01 用户：货柜头顶只显示缺货的，有货的不显示
  /* 0.23 用户：菜和果树头上显示还要多久熟（走到温室 / 果园附近才显示，进度条 + 剩余时间；熟了写「熟了」） */
  { const show = home && !lay, near = (x, z) => show && Math.hypot(P.pos.x - x, P.pos.z - z) < 9;
    /* 设计 45 顺手改：16 块地的牌子挤成一团 —— 每块地只画一条小进度条（熟了变金色）；离主角最近的 3 块另外写「名字 剩余时间 / 熟了」，互相避开（ui.js declutter） */
    const nearP = [];
    S.plots.forEach((p, i) => { const pos = PLOT_POS[i]; if (!pos) return; const lb = plotLabs[i] || (plotLabs[i] = UI.label(() => tmpLab.set(pos[0], 1.05, pos[1]).clone(), 'grow gbar'));
      const on = p && near(pos[0], pos[1]); if (on) nearP.push([Math.hypot(P.pos.x - pos[0], P.pos.z - pos[1]), i]);
      lb.set(on ? (p.left <= 0 ? '<span class="pg ripe"><i></i></span>' : '<span class="pg"><i></i></span>') : '', p && p.total ? (p.left <= 0 ? 100 : (1 - p.left / p.total) * 100) : 0) });
    nearP.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < 3; k++) { const lb = plotTxt[k] || (plotTxt[k] = Object.assign(UI.label(() => { const pos = PLOT_POS[plotTxtI[k]] || [0, 0]; return tmpLab.set(pos[0], 1.05, pos[1]).clone() }, 'grow gtxt'), { group: 'ws' }));
      const it = nearP[k], p = it && S.plots[it[1]]; plotTxtI[k] = it ? it[1] : -1;
      lb.set(p ? (p.left <= 0 ? `<div class="box ok">${GOODS[p.c].name} 熟了</div>` : `<div class="box">${GOODS[p.c].name} ${UI.fmtT(p.left)}</div>`) : '') }
    const orchNo = !L.farmStaffed(S, 'orch');   // 设计 62：果园没人管（种地的都指定只管温室，或者没人种地）
    S.trees.forEach((t, i) => { const pos = TREE_POS[i]; if (!pos) return; const lb = treeLabs[i] || (treeLabs[i] = UI.label(() => tmpLab.set(pos[0], 3.1, pos[1]).clone(), 'grow'));
      lb.set(t && near(pos[0], pos[1]) ? (t.left <= 0 ? (orchNo ? `<div class="box warn">${GOODS[t.k].name} 结果了　没人摘</div>` : `<div class="box ok">${GOODS[t.k].name} 结果了</div>`) : `<div class="box">${GOODS[t.k].name} ${UI.fmtT(t.left)}<span class="pg"><i></i></span></div>`) : '', t && t.total ? (1 - t.left / t.total) * 100 : 0) }) }
  /* 0.28 牧场：走到牧场附近，棚门口写几级几只、在不在产、谁在喂。
     八（10-21 用户）：6 个棚的牌子压在一起 —— 只给离主角最近的 2 个棚写完整牌子；其他棚只画一条小进度条，饿了 / 存满了进度条变红、画「!」 */
  { const show = home && !lay && P.pos.x < PASTURE.x1 + 4 && P.pos.x > PASTURE.x0 - 4 && P.pos.z > PASTURE.z0 - 4 && P.pos.z < PASTURE.z1 + 4, served = show ? L.ranchServed(S) : [];
    const dist = k => Math.hypot(P.pos.x - penFront(k).x, P.pos.z - penFront(k).z), near2 = show ? RANCH_IDS.filter(k => S.lv[k] && dist(k) <= 11 && !L.busyWith(S, k)).sort((a, b) => dist(a) - dist(b)).slice(0, 2) : [];
    RANCH_IDS.forEach(k => { const lb = penLabs[k] || (penLabs[k] = UI.label(() => penFront(k).setY(1.6), 'grow', 'main', { r2: 6 }));   // 设计 69：在牧场、离这个棚 6 米内
      const bar = penBars[k] || (penBars[k] = UI.label(() => penFront(k).setY(1.25), 'grow gbar', 'main', { r2: 6 }));
      if (!show || dist(k) > 11 || L.busyWith(S, k)) { lb.set(''); bar.set(''); return }   // 在盖 / 在升级：头顶写施工剩余时间（施工牌）
      const lv = S.lv[k] || 0, b = BUILD[k];
      if (!lv) { bar.set(''); lb.set(dist(k) < 6 ? `<div class="box">${b.name}　还没盖<br><small>${S.lv.store < b.levels[1].store ? `超市 ${b.levels[1].store} 级开放` : '在「建造」→「牧场」里盖'}</small></div>` : ''); return }
      const R = RANCH[k], f = L.penInfo(S, k), g = GOODS[R.good].name, bad = !f.n || f.hungry || f.full, pct = f.n && !bad ? (1 - f.left / f.cycle) * 100 : 100;
      if (!near2.includes(k)) { lb.set(''); bar.set(`<span class="pg${bad ? ' bad' : ''}"><i></i></span>${bad ? '<b class="ex">!</b>' : ''}`, pct); return }
      bar.set('');
      if (!f.n) { lb.set(`<div class="box">${b.name} ${lv} 级　0/${f.cap} 只<br><small class="warn">去院子里的商人那里买${R.name}</small></div>`); return }
      const who = f.who ? `<br><small>饲养员：${f.who.name}（${L.isPinned(S, f.who) ? '指定' : '自动'}，快 ${Math.round((f.spd - 1) * 100)}%）</small>` : '<br><small class="warn">没有饲养员</small>';   // 设计 62
      const st = f.full ? `<small class="warn">${g}存满了，${served.includes(k) ? '仓库满了收不进去' : '没人收'}</small>` : f.hungry ? `<small class="warn">${served.includes(k) ? `饿了：仓库里${GOODS[FEED.diet[k]].name}不够` : '饿了：没有饲养员喂'}</small>` : `<small>下一批${g} ${UI.fmtT(f.left)}</small><span class="pg"><i></i></span>`;
      lb.set(`<div class="box${f.hungry || f.full ? '' : ' ok'}">${b.name} ${lv} 级　${f.n}/${f.cap} 只${R.name}${who}<br>${st}</div>`, f.hungry || f.full ? null : pct) }) }
  /* 设计 50：空地后面写原因「（仓库快满 7、没种子 2）」，只有一种原因就只写那一种 */
  const emptyWhyTxt = () => { const n = { full: 0, seed: 0, staff: 0 }; S.plots.forEach((p, i) => { if (!p) n[L.plotEmptyWhy(S, i)]++ }); const ks = Object.keys(n).filter(k => n[k]);
    return ks.length ? `（${ks.length === 1 ? L.EMPTY_WHY[ks[0]] : ks.map(k => L.EMPTY_WHY[k] + ' ' + n[k]).join('、')}）` : '' };
  if (S.lv.gh) { const ripe = S.plots.filter(p => p && p.left <= 0).length, empty = S.plots.filter(p => !p).length;
    ghLab.set(P.pos.x < GH_AREA.x1 + 6 ? `<div class="box${ripe ? ' ok' : ''}">温室 ${S.lv.gh} 级${ripe ? `　熟了 ${ripe} 格` : ''}${empty ? `　空地 ${empty} 格${emptyWhyTxt()}` : ''}</div>` : '') } else ghLab.set('');
  const nq = S.queue.length, oldest = nq ? Math.min(...S.queue.map(c => c.left)) : 0;
  { const cs = L.hasCashier(S);   /* V1.01 用户：收银台头顶平时什么都不显示；只有排着队却没人结账（没收银员、你也不在旁边）才提示，快有人等不及了再闪红 */
    regLab.set(nq && !cs && !nearReg ? `<div class="box${oldest < 40 ? ' warn' : ''}">没人结账：排队 ${nq} 人<br><small>走到收银台旁边，或者派一个收银员</small></div>` : '') }
  /* V1.01 用户：商人、船、货车头顶都不标名字了；只在物资堆满了、背包满了这种要处理的时候提示 */
  truckLab.set(home && L.pileLive(S) >= STAFF.scav.pile && Math.hypot(P.pos.x - TRUCK_POS.x, P.pos.z - TRUCK_POS.z) < 14 ? `<div class="box warn">物资堆满了，拾荒的员工停着等</div>` : '');
  syncPile();
  scavTruckLab.set(inScav ? `<div class="box">货车　回超市${S.bag.length >= cap ? '<br><small class="warn">背包满了，回去卸货</small>' : ''}</div>` : '');
  dockLab.set('');
  /* 设计 40：菜单里没有商城了，买东西找院子商人。今天的免费星星（设计 112，原来是发条）没领：商人头顶写「免费星星可以领」（原来商城入口上的红点挪到这里）；
     别处点了「多雇」「买 M16」这类按钮：头顶闪一个箭头 3 秒 */
  { const free = home && L.freeReady(S, bjDay()), fl = home && performance.now() < merchFlash;
    merchLab.set(free || fl ? `${fl ? '<div class="marrow"><i></i></div>' : ''}${free ? '<div class="box ok mfree2">免费星星可以领<i class="rdot"></i></div>' : ''}` : '') }
  if (inFish) { fBoatLab.set(S.bag.length >= cap ? '<div class="box warn">背包满了，坐船回去卖</div>' : ''); fMerchLab.set('');
    FZONES.forEach((Z, i) => fSpotLabs[i].set(FG.busy() ? '' : `<div class="box">${FISHING.zones[Z.zone]}</div>`)) }
  playerLab.set(S.bag.length >= cap && away() ? `<div class="box" style="color:#e5604f">背包 ${cap} 格满了</div>` : '');

  /* 镜头 */
  camTarget(camTgt);
  if (camLock) camTgt.copy(camLock);
  const want = camTgt.clone().add(camOff);
  camera.position.lerp(want, Math.min(1, dt * 5));
  if (shake > 0) { shake -= dt; camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake }
  camera.lookAt(camera.position.x, 0, camera.position.z - camOff.z);

  /* 0.26 手机发烫：面板每 8 帧刷新一次（以前每帧重新拼一遍面板），影子每 2 帧重画一次；开着面板时 3D 画面只画 1/4 的帧（被面板挡着） */
  doorFrame(dt); if (!lay && !away()) { const more = []; if (home && S.queue.length) { more.push(regAt.set(REG_POS.x, 1, REG_POS.z)); const c = customers.get(S.queue[S.queue.length - 1].id); if (c) more.push(qAt.copy(c.m.position).setY(1)) } W.wallFade(camera, wallAt.copy(P.pos).setY(1.1), dt, more) }   // 0.44 挡住主角的墙变透明；V1.01 挡住收银台、排队的墙也变透明
  frameN++; UI.updateHud(S); if (frameN % 8 === 0) UI.refreshPanel(); setNear(); UI.updateLabels(camera);
  if (frameN % 30 === 0 && S.lv.store >= FB.store && cur === scene && Math.hypot(P.pos.x - PORTAL_POS.x, P.pos.z - PORTAL_POS.z) < 8) fbPreload();   /* 设计 74：走到传送门附近先读副本 */
  if (UI.panelOpen()) { if (now - lastDraw < 100) return } lastDraw = now;
  const sunMoved = (cur === scene ? W : cur === SC.scene ? SC : cur === FI.scene ? FI : W).sunFollow(P.pos, SSH ? 3 : 0);   // V1.01 影子只算主角周围
  /* 设计 57：影子图只在不动的东西变了、影子相机挪了（走 3 米）时画一次；人、动物用假影子。关掉这个开关 = 0.26.1 的每帧都画 */
  if (SSH) { if (shCache.frame(cur, now, sunMoved)) PERF_X.shNow = 1 } else { renderer.shadowMap.needsUpdate = true; PERF_X.shNow = 1 }
  syncBlobs(cur, camera, P.pos);   // 设计 67：压扁影子
  if (now - glT > 3000) { glT = now; layerGround(cur) }   // 设计 64：地面贴片不再互相比深度（地面闪烁）
  if (perfOpt('far') && cur === scene && now - farT > 250) { farT = now; farTick(P.pos) }   // 设计 57：远处的小东西（箱子、桶、锥桶、花、石子）不画
  renderer.render(cur, camera);
  if (PERF.on) perfFrame(renderer, now, performance.now() - cpu0, TDR.active() ? TDR.zn() : zombies.filter(z => z.m.visible).length);   // 设计 30：性能小窗
}

/* ---------- 切到后台 / 回来 ---------- */
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (!S) return;
  if (document.hidden) { hiddenAt = SV.srvNow(); S.bgAt = hiddenAt; SV.saveNow(); SV.beacon() }   // bgAt：GM 网页据此提示「玩家切到后台了」
  else if (hiddenAt) { delete S.bgAt;
    /* 回来时重新对一次服务器时间（手机锁屏时设备时钟可能停走）；对不上就按手机时钟算，最多 1 小时 */
    const h = hiddenAt; hiddenAt = 0;
    SV.syncTime().then(ok => { let secs = (SV.srvNow() - h) / 1000; if (!ok) secs = Math.min(secs, 3600); last = performance.now(); if (secs > 1) settle(secs) });
  }
});
addEventListener('pagehide', () => { if (S) { S.closedAt = SV.srvNow(); SV.saveNow(); SV.beacon() } });
/* 0.33 心跳：开着游戏时每分钟存一次（云端每分钟最多传一次），GM 网页据此判断玩家在不在线 */
setInterval(() => { if (S && !document.hidden) SV.saveNow() }, 60000);

/* ---------- 测试用：网址带 ?debug 时可以在控制台里操作 ---------- */
if (/[?&]debug/.test(location.search)) setTimeout(() => { if (window.__g) Object.assign(window.__g, { FB_ERR, AD, ASSET, handleEvents, fbAgain }) }, 0);   /* 设计 74：副本读取的错 */
if (/[?&]debug/.test(location.search)) window.__g = { RFX, topShot: (x0, x1, z0, z1, ppm = 24, sc = null) => {   /* 设计 79：sc = 别的场景（副本） */   /* 设计 70 检查：从正上方往下拍一块地（正交镜头，北在上） */
    const w = Math.round((x1 - x0) * ppm), h = Math.round((z1 - z0) * ppm), cam = new THREE.OrthographicCamera(x0, x1, -z0, -z1, 0.1, 200); cam.position.set(0, 80, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0);
    cam.left = x0; cam.right = x1; cam.top = -z0; cam.bottom = -z1; cam.updateProjectionMatrix();
    const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace; const old = renderer.getRenderTarget(); renderer.setRenderTarget(rt); renderer.clear(); renderer.render(sc || scene, cam);
    const px = new Uint8Array(w * h * 4); renderer.readRenderTargetPixels(rt, 0, 0, w, h, px); renderer.setRenderTarget(old); rt.dispose();
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g2 = cv.getContext('2d'), im = g2.createImageData(w, h); for (let r = 0; r < h; r++) im.data.set(px.subarray((h - 1 - r) * w * 4, (h - r) * w * 4), r * w * 4); g2.putImageData(im, 0, 0); return cv.toDataURL('image/png') },
  camShot: (px, py, pz, tx, ty, tz, w = 900, h = 600, fov = 40) => {   /* 设计 70 检查：随便放一个镜头拍一张（看货架上的东西） */
    const cam = new THREE.PerspectiveCamera(fov, w / h, 0.05, 200); cam.position.set(px, py, pz); cam.lookAt(tx, ty, tz);
    const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace; const old = renderer.getRenderTarget(); renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, cam);
    const px2 = new Uint8Array(w * h * 4); renderer.readRenderTargetPixels(rt, 0, 0, w, h, px2); renderer.setRenderTarget(old); rt.dispose();
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g2 = cv.getContext('2d'), im = g2.createImageData(w, h); for (let r = 0; r < h; r++) im.data.set(px2.subarray((h - 1 - r) * w * 4, (h - r) * w * 4), r * w * 4); g2.putImageData(im, 0, 0); return cv.toDataURL('image/png') },
  heroShot: (size = 800, y = 1.62, d = 1.2, fov = 30) => {   // 设计 38 检查：主角近景（离屏拍一张）
    const sm = makeShowcase(); if (!sm) return null; sm.set(S && S.look); sm.update(0); const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xfff4e6, 0x3a3f4a, 1.7)); const dl = new THREE.DirectionalLight(0xffffff, 2.0); dl.position.set(1.2, 2, 2.5); sc.add(dl, sm.root);
    const cam = new THREE.PerspectiveCamera(fov, 1, 0.05, 30); cam.position.set(0, y, d); cam.lookAt(0, y - 0.02, 0); const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace;
    const old = renderer.getRenderTarget(); renderer.setRenderTarget(rt); renderer.setClearColor(0xeadcc0, 1); renderer.clear(); renderer.render(sc, cam); const px = new Uint8Array(size * size * 4); renderer.readRenderTargetPixels(rt, 0, 0, size, size, px); renderer.setRenderTarget(old); rt.dispose();
    const cv = document.createElement('canvas'); cv.width = cv.height = size; const g2 = cv.getContext('2d'), im = g2.createImageData(size, size); for (let r = 0; r < size; r++) im.data.set(px.subarray((size - 1 - r) * size * 4, (size - r) * size * 4), r * size * 4); g2.putImageData(im, 0, 0); return cv.toDataURL('image/png') },
  perf: () => perfStats(), shCache, fbShadow: () => { if (SSH) { if (shCache.frame(FBV.scene(), performance.now(), false)) PERF_X.shNow = 1 } else renderer.shadowMap.needsUpdate = true }, get cur() { return cur }, faceTo: (x, z) => { player.rotation.y = Math.atan2(x - P.pos.x, z - P.pos.z) }, popT: () => popTargets().map(t => [t.key, +rectDist(t.st, P.pos).toFixed(2), t.st]), popBlock, get loadStat() { return LOADSTAT }, syncBlobs, tdSim: (lv, n = 1000) => { const c = { p: 0, l: 0 }; for (let i = 0; i < n; i++) { const q = L.tdStaffRoll(lv, Math.random()); if (q) c[q]++ } return { lv, n, ...c, odds: L.tdStaffOdds(lv) } }, CHAT, mkHuman, animH, setLook, LOOK, get mysM() { return mysM }, COL: collide, muzzle: () => tdGun && (player.updateMatrixWorld(true), tdGun.localToWorld(M16_TIP.clone())), GUN_POSE, holdGun, heroView, aimArms, get tdGun() { return tdGun }, get S() { return S }, prop, PILE_POS, repile: () => { pileKey = '' }, portraits: () => portraits(renderer), PORTRAIT, get map() { return map }, get resc() { return resc }, staffVis, UI, get inScav() { return inScav }, get inFish() { return inFish }, msgPoll, get msgPolled() { return msgPolled }, get soldOut() { return [...soldOut] }, get clock() { return clock }, goFish, boatGo, FI, FG, goScav, SC, W, P, LY, TDR, tdBegin, camera, zs: zombies, camOff, ZP: ZOMBIE_POSE, get player() { return player }, THREE, L, FBV, FL, fbGo, fbLeave, portal, PORTAL_FRONT, get fbWalk() { return fbWalk }, tick: s => handleEvents(L.tick(S, s, true)), go: (x, z) => P.pos.set(x, 0, z), settle, speed: k => { dbgSpeed = k }, look: (x, z) => { camLock = x == null ? null : new THREE.Vector3(x, 0, z) },
  showBoxes: () => { const pts = []; const y = 0.3; for (const b of [...W.obstacles, ...shelfBoxes()]) { let c; if (b.hw !== undefined) { c = [[-b.hw, -b.hd], [b.hw, -b.hd], [b.hw, b.hd], [-b.hw, b.hd]].map(([lx, lz]) => [b.cx + lx * b.c + lz * b.s, b.cz - lx * b.s + lz * b.c]) } else c = [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]]; for (let i = 0; i < 4; i++) { const [a1, a2] = c[i], [b1, b2] = c[(i + 1) % 4]; pts.push(a1, y, a2, b1, y, b2) } } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xff0000, depthTest: false })); m.renderOrder = 99; scene.add(m); return W.obstacles.length },
  get smithG() { return smithG }, get smithActs() { return smithActs }, SMITH_POS, toSmith,   /* 设计 107 测试用 */
  custDemo: () => { for (let i = 0; i < 8; i++) { const m = mkHuman('cust', i, {}); m.position.set(-9 + i * 1.3, 0, 1.5); scene.add(m) } return 8 } };

/* ---------- 预热：游戏里才会出现的东西（拾荒区、员工、塔、帐篷、地上的物资）在加载页先画一遍，
   让显卡先把着色器编译好、贴图传上去，玩的时候第一次出现不会卡一下 ---------- */
function warmup() {
  const tmp = [];
  try {
    const save = camera.position.clone();
    /* 拾荒区：随机生成一张，画一帧，再清掉 */
    const m = SC.gen(12345); camera.position.set(m.start.x, 14, m.start.z + 14.5); camera.lookAt(m.start.x, 0, m.start.z);
    for (const t of [...JUNK_IDS, 'seed:radish']) { const o = M.pickupMesh(t); o.position.set(m.start.x + 2, 0, m.start.z); SC.scene.add(o); tmp.push([SC.scene, o]) }
    renderer.compile(SC.scene, camera); renderer.render(SC.scene, camera);
    /* 楼变透明用的材质也先编译一遍（不然第一次走到楼后面会卡一下） */
    const fm = m.fades.flatMap(f => f.mats); fm.forEach(x => { x.transparent = true; x.opacity = 0.25; x.depthWrite = false; x.needsUpdate = true });
    renderer.compile(SC.scene, camera); renderer.render(SC.scene, camera);
    fm.forEach(x => { x.transparent = false; x.opacity = 1; x.depthWrite = true; x.needsUpdate = true });
    for (const [sc, o] of tmp.splice(0)) sc.remove(o); SC.clear();
    /* 院子：员工（顾客模型）、各级宿舍楼、塔 */
    for (let i = 0; i < 4; i++) { const h = mkHuman('cust', i * 3, { skin: cSkins[i], shirt: cShirts[i], pants: 0x3d3d48 }); h.position.set(START_POS.x + i, 0, START_POS.z + 2); scene.add(h); tmp.push([scene, h]) }
    W.setCamp(4); W.syncTowers(['gun', 'cannon', 'slow', 'sniper', 'gun', 'cannon'].map((k, i) => ({ k, lv: 1 + (i % 3) })));
    camera.position.set(-14, 40, 30); camera.lookAt(-14, 0, 0);
    for (let lv = 4; lv >= 0; lv--) { if (lv) W.setCamp(lv); if (lv < 4) { W.setPond(lv); W.pondTick({ crucian: 2, carp: 1, mandarin: 1, goldking: 1 }, 0.016) } renderer.compile(scene, camera); renderer.render(scene, camera) }   // 宿舍楼各级也先画一遍
    W.setCamp(1); W.setPond(0); W.syncTowers(Array(6).fill(null));
    for (const [sc, o] of tmp.splice(0)) sc.remove(o);
    camera.position.copy(save); camera.lookAt(START_POS.x, 0, START_POS.z - 1.6);
  } catch (e) { console.warn('预热失败（不影响游戏）', e); for (const [sc, o] of tmp) sc.remove(o) }
}
/* 员工头像：模型拍大头照（加载页做，游戏里直接用图片） */
function makePortraits() { try { UI.setPortraits(portraits(renderer)) } catch (e) { console.warn('头像生成失败（用剪影代替）', e) } }

/* ---------- 启动：先把模型、图片全部读完（显示加载条），再出登录界面 ---------- */
/* 设计 38：这次加载下了多少、用了几秒（性能小窗里显示） */
const LOADSTAT = { sec: 0, mb: 0, files: 0, cached: 0, hero: '', heroAt: 0 };
/* 后台下其他包：尸潮、钓鱼进游戏就下；副本超市够级才下；_hi 只在关掉「大模型减面」时下 */
function packsTick() { if (!AD.dbOK()) return; AD.ensurePack('td').then(() => AD.ensurePack('fish')).then(() => { if (S && S.lv.store >= FB.store) AD.ensurePack('fb1') }).then(() => { if (S && S.fb && S.fb.won[1] > 0) return AD.ensurePack('fb2') }).then(() => { if (S && S.fb && S.fb.won[2] > 0) return AD.ensurePack('fb3') }).then(() => { if (!perfOpt('lod')) AD.ensurePack('hi') }) }
function preloadImgs(list, onEach) { return Promise.all(list.map(src => new Promise(r => { const i = new Image(); i.onload = i.onerror = () => { onEach(); r() }; i.src = A(src) }))) }
(async () => {
  camera.position.copy(START_POS).add(camOff).setZ(START_POS.z - 1.6 + camOff.z); camera.lookAt(START_POS.x, 0, START_POS.z - 1.6);
  const imgs = ['img/title_bg.jpg', 'img/avatar.png', ...['grass', 'dirt', 'asphalt', 'road_ew', 'sand', 'lot', 'concrete', 'pasture'].map(n => `img/ground/${n}${/^(grass|dirt|concrete|pasture|shore|asphalt|sand)$/.test(n) ? ".jpg" : ".png"}`), 'img/ui/panel.png', 'img/ui/card.png', 'img/ui/card-on.png', 'img/ui/divider.png', ...['shoppingBasket', 'wrench', 'menuGrid', 'warning', 'menuList', 'cross', 'singleplayer', 'gear'].map(n => `img/ui/icons/${n}.png`), ...['sv_panel', 'sv_card', 'sv_card_on', 'sv_slot', 'sv_chip'].map(n => `img/ui/${n}.png`)];
  /* 设计 38：物品图标（135 张约 7 MB）不挡加载条，进游戏以后在后台读（打开面板时没读到的会自己读） */
  const iconImgs = [...JUNK_IDS.map(i => `img/icons/junk_${i}.png`), ...GOOD_IDS.map(i => `img/icons/good_${i}.png`), ...TREASURE_IDS.map(i => `img/icons/tr_${i}.png`), 'img/icons/it_gear.png', ...['gun', 'cannon', 'slow', 'sniper'].map(k => `img/icons/tw_${k}.png`), ...BUILD_ORDER.filter(k => k !== 'kitchen2').map(k => `img/icons/bd_${k}.png`)]   /* 设计 71：厨房 2 用厨房的图标 */;
  const total = propJobCount() + imgs.length + 4; let done = 0;
  const tick1 = () => { done++; const k = Math.min(1, done / total); $('#lbarI').style.width = (k * 100).toFixed(1) + '%'; $('#ltxt').textContent = `正在加载… ${Math.round(k * 100)}%` };
  /* V1.01：加载条最多等 45 秒，网太慢就先进游戏（没读完的模型在后台接着读，读好了自动换上）
     设计 38：先读人物（Kenney 人物、旧主角 hero_m → 新主角 hero_m2），再读场景；新主角 12 秒还没读完也开始读场景（别都卡在一个文件上）。
     45 秒到了新主角还没读完，主角先用旧的 hero_m，读完再换上（不再用方块人） */
  const heroP = loadChars().catch(e => console.warn('人物模型加载失败，用方块人代替', e)).finally(tick1)
    .then(() => loadHeroMain().catch(e => console.warn('新主角没读到，先用旧主角', e))).finally(() => { tick1(); LOADSTAT.heroAt = performance.now() / 1000 });
  const rest = Promise.race([heroP, new Promise(r => setTimeout(r, 12000))]).then(() => Promise.all([
    loadProps('models/', tick1).then(() => W.useProps()).catch(e => console.warn('场景模型加载失败，用简易场景代替', e)),
    preloadImgs(imgs, tick1), loadAvatar().finally(tick1), loadM16().finally(tick1),
  ]));
  await Promise.race([new Promise(r => setTimeout(r, 45000)), Promise.all([heroP, rest])]);
  if (!hero2Ready()) heroP.then(() => { if (player && upgradeHero(player, S && S.look, LOOK)) drawHudAvatar() });
  spawnActors(); placeMerch(); M.fixDecals(scene); M.trimShadows(scene);
  $('#ltxt').textContent = '正在准备场景…';
  await new Promise(r => setTimeout(r, 0));
  warmup(); makePortraits();
  renderer.render(scene, camera);                                   // 先画一帧，把模型和贴图传给显卡
  await SV.syncTime();
  $('#loading').classList.add('hidden');
  { const n = netStat(); LOADSTAT.sec = performance.now() / 1000; LOADSTAT.mb = n.mb; LOADSTAT.files = n.n; LOADSTAT.cached = n.cached; LOADSTAT.hero = hero2Ready() ? 'new' : 'old'; console.log('[设计38] 加载完成', JSON.stringify(LOADSTAT));
    PERF_LOAD.txt = `加载 <b>${LOADSTAT.sec.toFixed(1)}</b> 秒　下了 <b>${LOADSTAT.mb.toFixed(1)}</b> MB（${LOADSTAT.files} 个文件，${LOADSTAT.cached} 个用缓存）${LOADSTAT.hero === 'old' ? '　先用旧主角' : ''}` }
  PERF_LOAD.txt += ASSET.ok ? `<br>手机资源库 ${AD.storedMB().toFixed(1)} MB，这次下了 ${ASSET.cnt} 个（${mbT(ASSET.bytes)} MB）` : `<br>手机资源库没开：${ASSET.why}`;   /* 设计 75 */
  checkUpdate();
  showTitle(start);
  AD.ensurePack('td').finally(startLazy);   // 设计 38：尸潮特效图（设计 75：先把尸潮包下进库里，再读）
  packsTick(); setInterval(packsTick, 60000);   /* 设计 75：其他包在后台下（下好了就不再下） */
  /* 设计 38：商人模型（0.5 MB）进游戏以后再读，读好了把先顶着的顾客模型换掉 */
  loadSmith();   /* 设计 107：铁匠（0.5 MB）也是进游戏以后读，读好了超市 5 级才摆出来 */
  loadMerchant().then(() => { if (!merchSrc) return; if (yMerch) { scene.remove(yMerch); yMerch = null } if (fMerch) { FI.scene.remove(fMerch); fMerch = null } });
  loadLateProps(() => { W.refreshUser(); fixShown = '' }).then(() => preloadImgs(iconImgs, () => {})).then(() => { const n = netStat(); PERF_LOAD.txt += `<br>后台又下了 <b>${(n.mb - LOADSTAT.mb).toFixed(1)}</b> MB，全部读完 <b>${(performance.now() / 1000).toFixed(0)}</b> 秒`; LOADSTAT.all = performance.now() / 1000; LOADSTAT.allMb = n.mb });   // V1.01 工坊机器、塔、加工品在后台读；设计 38：然后读物品图标
})();
