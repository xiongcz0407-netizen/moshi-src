import { perfOpt } from './perf.js';
import { addBlob } from './chars.js';
import { FAR_SMALL } from './groundfx.js';
/* ================= 0.28 牧场（设计/14_农场.md）：6 个动物棚（0.45 起在超市西边，设计/22）=================
   这里只管画面：围栏、棚、动物在棚里走来走去。喂和产在 logic.js（ranchTick）。 */
import * as THREE from 'three';
import { RANCH, RANCH_IDS, PEN_CAP, BUILD } from './config.js';
import { prop, propsReady } from './props.js';

/* 0.45 整体布局（设计/22）：牧场挪到超市西边（跟超市西墙留 2 米路），2 排 × 3 列，每个棚 7 × 8.4 米，两排中间 2.2 米走道，棚门朝走道 */
export const PASTURE = { x0: -70, x1: -47, z0: -9.5, z1: 9.5 };   // 设计 43：牧场往西挪到院子最西边（温室、果园在它和超市中间），棚和走道大小不变
const COL = [[-53.4, -47], [-61.7, -55.3], [-70, -63.6]], ROW_N = [-9.5, -1.1], ROW_S = [1.1, 9.5];   // V1.01 用户：牧场左右都能走——棚和棚之间空 1.9 米（以前只空 1 米，人走不过去，像空气墙）
/* 北边一排：鸡、兔、牛；南边一排：鸭、羊、猪（越先开的越靠近院子） */
export const PENS = {
  chicken: { x0: COL[0][0], x1: COL[0][1], z0: ROW_N[0], z1: ROW_N[1], north: true },
  rabbit:  { x0: COL[1][0], x1: COL[1][1], z0: ROW_N[0], z1: ROW_N[1], north: true },
  cow:     { x0: COL[2][0], x1: COL[2][1], z0: ROW_N[0], z1: ROW_N[1], north: true },
  duck:    { x0: COL[0][0], x1: COL[0][1], z0: ROW_S[0], z1: ROW_S[1] },
  sheep:   { x0: COL[1][0], x1: COL[1][1], z0: ROW_S[0], z1: ROW_S[1] },
  pig:     { x0: COL[2][0], x1: COL[2][1], z0: ROW_S[0], z1: ROW_S[1] },
};
/* 棚门口（靠中间小路那一边的正中）：饲养员走到这里干活，头顶的字也在这附近 */
export const penFront = k => { const p = PENS[k]; return new THREE.Vector3((p.x0 + p.x1) / 2, 0, p.north ? p.z1 + 0.9 : p.z0 - 0.9) };
const HOP = { cycle: 0.62, air: 0.36, h: 0.32 };   // 兔子一跳：一共多久、在空中多久、跳多高（米）
const SPEED = { chicken: 0.7, duck: 0.6, rabbit: 0.9, sheep: 0.6, cow: 0.5, pig: 0.55 };

/* fence(x0,z0,x1,z1)：world.js 的围栏（带碰撞）；gpatch：铺地面贴图 */
export function createRanch({ scene, fence, gpatch }) {
  const root = new THREE.Group(); scene.add(root);
  /* 每个棚：围栏（门口那边中间留 1.6 米的口）+ 一块土地；没盖的只有一块草皮和牌子（牌子是 main.js 里的字） */
  const built = {};
  for (const k of RANCH_IDS) {
    const p = PENS[k];
    gpatch('pasture', p.x1 - p.x0 - 0.4, p.z1 - p.z0 - 0.4, (p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2, 0.006, 3);   // 0.44 牧场围栏里换成深色泥土 + 牧草（设计/23「牧场地面」）
    built[k] = { lv: '', fenced: false, deco: null, animals: [] };
  }
  function buildFence(k) {
    const p = PENS[k], mx = (p.x0 + p.x1) / 2, gz = p.north ? p.z1 : p.z0, bz = p.north ? p.z0 : p.z1;
    fence(p.x0, bz, p.x1, bz); fence(p.x0, p.z0, p.x0, p.z1); fence(p.x1, p.z0, p.x1, p.z1);
    fence(p.x0, gz, mx - 0.8, gz); fence(mx + 0.8, gz, p.x1, gz);
  }
  /* 棚（帆布棚子）+ 食槽（水桶、木板），模型读好以后才摆 */
  function buildDeco(k) {
    const p = PENS[k], g = new THREE.Group(), bz = p.north ? p.z0 + 1.8 : p.z1 - 1.8, mx = (p.x0 + p.x1) / 2;
    const hay = prop('box-large-open', { scale: 1.6, tint: 0xd8c090 }); if (hay) { hay.position.set(mx - 1.6, 0, bz); g.add(hay) }   // 草料箱
    const bk = prop('bucket', { scale: 1.4, tint: 0xd0c0a0 }); if (bk) { bk.position.set(mx + 0.4, 0, bz); g.add(bk) }               // 水桶
    const tr = prop('tree', { scale: 2.2, tint: 0xc8d0b0 }); if (tr) { tr.position.set(p.x0 + 0.9, 0, p.north ? p.z0 + 0.9 : p.z1 - 0.9); g.add(tr) }   // 角落一棵树遮阴
    if (perfOpt('far')) for (const o of [hay, bk]) if (o) FAR_SMALL.push(o);   // 设计 57：远处的草料箱、水桶不画
    root.add(g); return g;
  }
  function addAnimal(k) {
    const R = RANCH[k], p = PENS[k], src = prop(k, { scale: R.scale, tint: 0xffffff }); if (!src) return null;
    const m = new THREE.Group(); m.add(src); src.updateMatrixWorld(true);       // 模型原点不一定在脚底：套一层，把脚放到地面、身体放到中间
    const bb = new THREE.Box3().setFromObject(src), c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3()); src.position.set(-c.x, -bb.min.y, -c.z);
    const r = Math.max(sz.x, sz.z) / 2 + 0.4;                                    // 离围栏留多远（牛长，留得多）
    const a = { m, k, r, x: p.x0 + r + Math.random() * (p.x1 - p.x0 - 2 * r), z: p.z0 + r + Math.random() * (p.z1 - p.z0 - 2 * r), tx: 0, tz: 0, wait: Math.random() * 3, ph: Math.random() * 6 };
    a.tx = a.x; a.tz = a.z; m.position.set(a.x, 0, a.z); m.rotation.y = Math.random() * 6.28; root.add(m);
    if (perfOpt('sshadow')) { src.traverse(o => { if (o.isMesh) o.castShadow = false }); m.userData.flatH = 0; addBlob(m, true) }   // 设计 57：动物会走，不进影子图。设计 67：画压扁影子；兔子蹦起来时影子还在地上（flatH = 0）
    return a;
  }
  /* 跟存档对上：盖了几级就有几只 */
  function sync(S) {
    if (!propsReady()) return;
    for (const k of RANCH_IDS) {
      const b = built[k], lv = S.lv[k] || 0, n = Math.min((S.herd && S.herd[k]) || 0, PEN_CAP[lv] || 0), key = lv + ':' + n; if (b.lv === key) continue; b.lv = key;   // 0.28 动物是买的：有几只摆几只
      if (lv > 0 && !b.fenced) { b.fenced = true; buildFence(k); b.deco = buildDeco(k) }
      while (b.animals.length < n) { const a = addAnimal(k); if (!a) break; b.animals.push(a) }
      while (b.animals.length > n) { const a = b.animals.pop(); root.remove(a.m) }
    }
  }
  /* 动物：在自己的棚里挑个地方慢慢走过去，停一会儿（低头吃草 / 啄地），再挑下一个；兔子一蹦一蹦的 */
  function tick(dt, clock, near) {
    for (const k of RANCH_IDS) for (const a of built[k].animals) {
      const p = PENS[k], m = a.m;
      if (!near) { m.position.y = 0; m.scale.set(1, 1, 1); continue }
      const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
      if (d < 0.05) {
        a.wait -= dt;
        m.rotation.x = Math.max(0, Math.sin(clock * 3 + a.ph)) * 0.18;   // 低头吃东西
        m.position.y = 0;
        m.scale.set(1, 1, 1); a.hop = 0;
        if (a.wait <= 0) { a.tx = p.x0 + a.r + Math.random() * (p.x1 - p.x0 - 2 * a.r); a.tz = p.z0 + a.r + Math.random() * (p.z1 - p.z0 - 2 * a.r); a.wait = 2 + Math.random() * 5 }
      } else if (k === 'rabbit') {
        /* 0.35 用户：兔子真的一跳一跳 —— 只在空中往前移，落地压扁一下、停一停再跳；起跳身子前倾，落地后仰 */
        a.hop = (a.hop || 0) + dt / HOP.cycle; if (a.hop >= 1) a.hop -= 1;
        const u = a.hop * HOP.cycle / HOP.air;                       // 0～1：在空中；>1：在地上
        let da = Math.atan2(dx, dz) - m.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); m.rotation.y += da * Math.min(1, dt * 8);
        if (u < 1) {
          const st = Math.min(d, SPEED.rabbit * HOP.cycle / HOP.air * dt); a.x += dx / d * st; a.z += dz / d * st;
          m.position.y = Math.sin(u * Math.PI) * HOP.h; m.rotation.x = (u - 0.5) * 0.5; m.scale.set(1, 1 + Math.sin(u * Math.PI) * 0.08, 1);
        } else {
          const g = (u - 1) / (HOP.cycle / HOP.air - 1), sq = Math.sin(Math.min(1, g * 2) * Math.PI) * 0.18;   // 刚落地压扁，再弹回来
          m.position.y = 0; m.rotation.x = 0; m.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
        }
      } else {
        const st = Math.min(d, SPEED[k] * dt); a.x += dx / d * st; a.z += dz / d * st;
        let da = Math.atan2(dx, dz) - m.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); m.rotation.y += da * Math.min(1, dt * 5);
        m.rotation.x = 0;
        m.position.y = Math.abs(Math.sin(clock * 8 + a.ph)) * 0.03;
      }
      m.position.x = a.x; m.position.z = a.z;
    }
  }
  return { sync, tick, built };
}
export const PEN_NAME = k => BUILD[k].name;
