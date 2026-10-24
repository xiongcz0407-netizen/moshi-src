/* 尸潮塔防平衡测试（node）：用假的画面跑 td.js，看不同塔配置下每关能不能守住。
   用法：node tools/tdsim.mjs  */
import * as THREE from 'three';
import * as L from '../src/js/logic.js';
import { createTD } from '../src/js/td.js';
import { TD_LEVELS, TD_MAX } from '../src/js/config.js';
import { BARRICADE } from '../src/js/world.js';

function runLevel(lv, towers, playerAt) {
  const S = L.newState(); S.towers = towers.map(t => t && { ...t, spent: 0 }); S.coins = 0;
  /* 设计 59：超市等级按这一关要求（至少 lv/2），角色页 4 项按上限；血量 = HERO.hpByStore[超市等级] */
  if (process.env.CAP) { const st = Math.max(TD_LEVELS[lv].store || 1, Math.ceil(lv / 2)); S.lv.store = st; for (const k of ['dmg', 'rate', 'range', 'nade']) S.hero[k] = 5 * st }
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const W = { towers: towers.map(() => ({ g: { userData: { top: 2 } }, aim: new THREE.Group() })), setBarricade() {} };
  const P = { pos: new THREE.Vector3(...playerAt), kb: new THREE.Vector2() };
  let res = null;
  const td = createTD({ scene, camera, W, L, UI: { big() {}, toast() {}, floatText() {} }, P, player: new THREE.Group(), S: () => S, animH() {}, hero: () => L.heroStats(S), eco: () => true, collide() {}, aimArms() {}, onHit() {}, shake() {}, muzzleOf: m => m.position.clone().setY(1.1),
    mkZombie: () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())); return g }, onEnd: r => { res = r } });
  td.start(lv);
  /* 主角：守在路障后面；血少了躲进店里回血，回满再出来 */
  let hide = false;
  let t = 0; while (!res && t < 900) { td.update(0.05, t); t += 0.05; const h = td.hud(); if (h) { if (h.hp < 40) hide = true; if (h.hp > 90) hide = false }
    P.pos.set(...(hide ? [-17.5, 0, -1.6] : playerAt)) }
  return { ...res, t: Math.round(t), line: res ? undefined : 'timeout' };
}
const T = (k, lv = 1) => ({ k, lv });
const setups = {
  '无塔，主角守路障': [null, null, null, null, null, null],
  '1 机枪': [T('gun'), null, null, null, null, null],
  '2 机枪': [T('gun'), null, null, T('gun'), null, null],
  '机枪+炮+减速': [T('gun'), T('cannon'), null, T('slow'), null, null],
  '4 座 1 级': [T('gun'), T('cannon'), T('slow'), T('sniper'), null, null],
  '6 座 1 级': [T('gun'), T('cannon'), T('slow'), T('sniper'), T('gun'), T('cannon')],
  '6 座 1 级（3机枪）': [T('gun'), T('cannon'), T('gun'), T('sniper'), T('gun'), T('slow')],
  '6 座 2 级': [T('gun', 2), T('cannon', 2), T('slow', 2), T('sniper', 2), T('gun', 2), T('cannon', 2)],
  '6 座 3 级': [T('gun', 3), T('cannon', 3), T('slow', 3), T('sniper', 3), T('gun', 3), T('cannon', 3)],
};
for (const [name, tw] of Object.entries(setups).filter(([n]) => !process.env.ONLY || process.env.ONLY.split('|').includes(n))) {
  const row = []; for (let lv = 1; lv <= TD_MAX; lv++) { const r = runLevel(lv, tw, [BARRICADE.x - 0.5, 0, BARRICADE.z - 0.8]); row.push(`${lv}:${r.win ? '赢' : '输'}(${r.t}s${r.win ? '' : ',' + r.why})`) }
  console.log(name.padEnd(12), row.join('  '));
}
