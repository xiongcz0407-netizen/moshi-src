/* ================= 场景模型（Kenney Car Kit、City Kit Commercial、Food Kit、Survival Kit，CC0） =================
   读进来以后统一「做旧」：颜色压暗、偏灰土色，车辆歪斜、有的侧翻，看起来像末世废街。 */
import * as THREE from 'three';
import { gltfLoader, loadGLB } from './assets.js';

export const CARS = ['sedan', 'suv', 'van', 'taxi', 'police', 'truck'];
export const DEBRIS = ['debris-tire', 'debris-door', 'debris-plate-a', 'debris-bumper', 'cone', 'box'];
export const BUILDINGS = ['building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-f', 'building-g', 'building-h'];
export const FOOD = ['can-open', 'can', 'soda-can-crushed', 'soda-bottle', 'carton'];          // 货架商品、地上的物资
export const FOOD_DEBRIS = ['fish-bones', 'plate-broken', 'styrofoam', 'bag'];     // 路上的生活杂物
export const SURV = ['FishingRod', 'fish', 'fish-large', 'floor', 'floor-old', 'campfire-fishing-stand', 'rock-flat', 'rock-sand-a', 'rock-b', 'tree-log', 'signpost-single', 'tree-autumn', 'fence', 'grass-large', 'barrel-open', 'tent', 'tent-canvas', 'campfire-pit', 'box', 'box-large', 'barrel', 'bucket', 'workbench', 'tool-hoe', 'tool-shovel', 'tree', 'tree-tall', 'rock-a', 'signpost', 'resource-planks', 'resource-wood', 'chest', 'bedroll', 'structure-metal', 'structure-metal-wall', 'workbench-grind', 'box-large-open', 'structure', 'structure-canvas', 'structure-metal-roof', 'structure-metal-doorway'];
export const FARM_GOODS = ['egg', 'mushroom', 'carton-small'];   // 0.28 牧场产品用的 Food Kit 模型（鸡蛋、鸭蛋；松露用蘑菇染深；牛奶盒）
export const RECYCLERS = ['recycle-1', 'recycle-2', 'recycle-3', 'recycle-4', 'recycle-5'];   // 0.28 回收机 1～5 级（用户做的模型）
export const NPCS = ['mystery'];
/* 0.42 工坊（用户生成的模型，减面到约 4500 面）：厨房、6 台机器各 1～3 级；熟食柜 1～3 档；g_ 开头的是加工品和菜 */
export const WS_MODELS = [...['tianpinji', 'mugongtai', 'fenjieji', 'guantouji', 'honganji', 'chufang', 'jiaobanji', 'yancai', 'guojiangguo', 'xunyu', 'zhibu', 'nainao', 'shushigui', 'huojia', 'guoshujia', 'bingui', 'jiqiangpao', 'paota', 'jiansuta', 'jujita', 'chitang'].flatMap(n => [1, 2, 3].map(i => `${n}-${i}`)), 'shouyintai', 'qiang', 'qiang_chuang', 'lizhu', 'zhanqiao', 'yuchuan',
];   // 设计 34：货架上的加工品、菜改成代码画，不再读 g_ 开头的模型   // 0.31 神秘商人（用户生成的模型，从一个 GLB 里截出左边那个人）
export const ANIMALS = ['chicken', 'duck', 'rabbit', 'sheep', 'cow', 'pig'];   // 0.28 牧场动物（用户生成的模型，减面到约 3000 面）
export const CROP_MODELS = ['radish', 'cabbage', 'tomato', 'eggplant', 'carrot', 'corn', 'pumpkin', 'apple', 'orange'];   // Food Kit 里的蔬菜水果
export const FURN = ['doorwayFront', 'books', 'kitchenFridgeLarge', 'pottedPlant', 'trashcan', 'rugDoormat', 'cardboardBoxClosed', 'cardboardBoxOpen', 'computerScreen', 'radio', 'lampRoundFloor'];
export const TDK = ['tile-river-straight', 'tile-river-bridge', 'tile-river-corner', 'wood-structure', 'wood-structure-part', 'wood-structure-high', 'wood-structure-high-part', 'detail-rocks', 'detail-rocks-large', 'tile-rock', 'tower-round-bottom-a', 'tower-round-bottom-b', 'tower-round-middle-a', 'tower-round-top-a', 'tower-round-top-c', 'tower-square-bottom-a', 'tower-square-middle-a', 'tower-square-top-a', 'tower-round-crystals', 'weapon-turret', 'weapon-cannon', 'weapon-ballista', 'tower-round-base', 'tower-round-bottom-c', 'tower-round-middle-b', 'tower-round-middle-c', 'tower-round-roof-a', 'tower-round-roof-b', 'tower-round-roof-c', 'tower-round-top-b', 'tower-square-bottom-b', 'tower-square-bottom-c', 'tower-square-middle-b', 'tower-square-middle-c', 'tower-square-roof-a', 'tower-square-roof-b', 'tower-square-roof-c', 'tower-square-top-b', 'tower-square-top-c', 'weapon-catapult'];   // Tower Defense Kit
export const WATER = ['boat-fishing-small', 'boat-row-small', 'buoy', 'buoy-flag', 'cargo-pile-a'];   // Watercraft Pack：钓鱼区的船、浮标
export const BLASTER = ['blaster-a'];
/* 0.14 新包（名字和别的包重复，读进来以后前面加前缀）：Pirate Kit「p:」、Mini Market「m:」、Coaster Kit「c:」 */
export const PIRATE = ['palm-bend', 'palm-detailed-bend', 'palm-detailed-straight', 'palm-straight', 'ship-small', 'ship-medium', 'boat-row-small', 'boat-row-large', 'structure-platform-dock', 'structure-platform-dock-small', 'structure-platform', 'structure-platform-small', 'platform-planks', 'platform', 'structure', 'structure-roof', 'structure-fence', 'structure-fence-sides', 'patch-sand', 'patch-sand-foliage', 'patch-grass', 'patch-grass-foliage', 'grass-patch', 'grass-plant', 'grass', 'rocks-a', 'rocks-b', 'rocks-c', 'rocks-sand-a', 'rocks-sand-b', 'rocks-sand-c', 'barrel', 'crate', 'crate-bottles', 'chest', 'flag', 'flag-pennant', 'flag-high', 'flag-high-pennant', 'mast', 'mast-ropes', 'tool-paddle', 'bottle-large', 'hole', 'ship-wreck'];
export const MARKET = ['bottle-return', 'cash-register', 'column', 'display-bread', 'display-fruit', 'fence', 'fence-door-rotate', 'floor', 'freezer', 'freezers-standing', 'shelf-bags', 'shelf-boxes', 'shelf-end', 'shopping-basket', 'shopping-cart', 'wall', 'wall-corner', 'wall-door-rotate', 'wall-window'];
export const COASTER = ['bench', 'flowers', 'grass', 'stall-drinks', 'stall-food', 'stall-information', 'trash', 'tree-large', 'tree', 'path-straight', 'park-entrance'];   // Blaster Kit：塔防时主角的枪
export const FAR = ['low-detail-building-a', 'low-detail-building-b', 'low-detail-building-c', 'low-detail-building-d', 'low-detail-building-e', 'low-detail-building-f'];

const lib = {};
/* V1.01 用户：WiFi 进游戏卡在 30%——工坊机器、塔、加工品这 45 个模型（一共约 10MB）不挡加载条，进游戏以后在后台慢慢读（读好了再换上，之前先用简易模型） */
const LATE_PRE = ['tianpinji', 'mugongtai', 'fenjieji', 'guantouji', 'honganji', 'chufang', 'jiaobanji', 'yancai', 'guojiangguo', 'xunyu', 'zhibu', 'nainao', 'jiqiangpao', 'paota', 'jiansuta', 'jujita'];
const isLate = n => n.startsWith('g_') || LATE_PRE.some(p => n.startsWith(p + '-'));
const lateRank = n => n.endsWith('-1') ? 0 : n.startsWith('g_') ? 1 : n.endsWith('-2') ? 2 : 3;   // 先读 1 级的（新存档、刚盖的都是 1 级），再读加工品、2 级、3 级
const EARLY_WS = WS_MODELS.filter(n => !isLate(n)), LATE_WS = WS_MODELS.filter(isLate).sort((a, b) => lateRank(a) - lateRank(b));
/* 一个文件最多等 20 秒（有的网络某个请求一直挂着，以前整个加载条就卡死）；同时最多读 10 个，别一下子几百个请求把 WiFi 堵住 */
function pool(list, n, fn) { let i = 0; const run = async () => { while (i < list.length) { const k = i++; await fn(list[k]) } }; return Promise.all(Array.from({ length: Math.min(n, list.length) }, run)) }
const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
/* 设计 38：钓鱼区才用的（Watercraft 包、Pirate 包里超市这边用不到的）也放到后面读；超市池塘边用到的几样留在前面 */
const HOME_PIRATE = new Set(['barrel', 'chest', 'crate', 'crate-bottles', 'flag-pennant', 'boat-row-small', 'flag-high-pennant', 'platform', 'ship-small']);
const fishOnly = ([kit, n]) => kit === 'water' || (kit === 'pirate' && !HOME_PIRATE.has(n));
const allJobs = () => [...CARS, ...DEBRIS].map(n => ['car', n]).concat([...BUILDINGS, ...FAR].map(n => ['city', n]), [...FOOD, ...FOOD_DEBRIS, ...CROP_MODELS, ...FARM_GOODS].map(n => ['food', n]), ANIMALS.map(n => ['animals', n]), RECYCLERS.map(n => ['recycler', n]), NPCS.map(n => ['npc', n]), WS_MODELS.map(n => ['ws', n]), SURV.map(n => ['survival', n]), FURN.map(n => ['furniture', n]), TDK.map(n => ['td', n]), BLASTER.map(n => ['blaster', n]), WATER.map(n => ['water', n]),
  PIRATE.map(n => ['pirate', n, 'p:' + n]), MARKET.map(n => ['market', n, 'm:' + n]), COASTER.map(n => ['coaster', n, 'c:' + n]));
/* 设计 38：超市里看得到、但不是马上要的：回收机 2～5 级、货柜 / 熟食柜 / 池塘的 2、3 档、神秘商人 —— 进游戏后第一批读（读到之前先用简易模型或 1 级的样子） */
const homeLate = ([kit, n]) => (kit === 'recycler' || kit === 'ws' || kit === 'npc') && /^(recycle-[2-5]|(huojia|guoshujia|bingui|shushigui|chitang)-[23]|mystery)$/.test(n);
const earlyJob = j => !(j[0] === 'ws' && isLate(j[1])) && !fishOnly(j) && !homeLate(j);
export const propJobCount = () => allJobs().filter(earlyJob).length;
/* 换配色：同一个模型换一张贴图（Mini Market 红色 variation-b、Tower Defense variation-a） */
const SKINS = { 'market-b': 'market/Textures/variation-b.png', 'td-a': 'td/Textures/variation-a.png' }, skinTex = {};
export async function loadProps(dir = 'models/', onEach = () => {}) {
  const L = gltfLoader();
  const TL = new THREE.TextureLoader();
  await Promise.all(Object.entries(SKINS).map(async ([k, f]) => { try { const t = await TL.loadAsync(dir + f); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; skinTex[k] = t } catch (e) { /* 没有就用原贴图 */ } }));
  const jobs = allJobs();
  const one = ([kit, n, key]) => loadGLB(`${dir}${kit}/${n}.glb`, L).then(g => { lib[key || n] = g.scene }, () => { /* 读不到就用简易模型 */ });
  await pool(jobs.filter(earlyJob), 10, j => withTimeout(one(j), 20000).finally(onEach));
  homeJobs = jobs.filter(homeLate); fishJobs = jobs.filter(fishOnly); lateJobs = LATE_WS.map(n => ['ws', n]); lateOne = one; earlyDone();
}
let lateJobs = [], fishJobs = [], homeJobs = [], lateOne = null, fishDone = false, earlyDone = null;
const earlyP = new Promise(r => { earlyDone = r });   // 设计 38：网慢、45 秒先进了游戏时，等前面的读完再接着读后面的（以前这时候后面的就不读了）
/* 进游戏以后调：在后台读剩下的模型（一次 3 个）。设计 38：先读超市里看得到的高等级模型，再读钓鱼区的，最后读工坊机器、塔；每读完一批回调 onEach（换上模型） */
const latePool = list => pool(list, 3, j => withTimeout(lateOne(j), 30000));
export function loadLateProps(onEach) { const cb = () => onEach && onEach(); return earlyP.then(() => latePool(homeJobs)).then(() => { cb(); return latePool(fishJobs) }).then(() => { fishDone = true; return latePool(lateJobs) }).then(cb) }
/* 钓鱼区的模型读完了没有（没读完先别去钓鱼区：钓鱼区只搭一次，缺的模型就一直缺） */
export const fishPropsReady = () => fishDone;
export const propsReady = () => Object.keys(lib).length > 0;

/* 做旧：把材质颜色乘上一个灰土色；burnt = 烧过的车，更黑 */
const matCache = new Map();
function grime(m, tint, skin) {
  const key = m.uuid + tint.getHexString() + (skin || '');
  if (!matCache.has(key)) {
    const n = new THREE.MeshLambertMaterial({ map: (m.map && skin && skinTex[skin]) || m.map || null, color: (m.color ? m.color.clone() : new THREE.Color(1, 1, 1)).multiply(tint), flatShading: false });
    if (n.map) n.map.colorSpace = THREE.SRGBColorSpace;
    matCache.set(key, n);
  }
  return matCache.get(key);
}
const solidCache = new Map();
function solidMat(c, op) { const k = c + ':' + op; if (!solidCache.has(k)) solidCache.set(k, new THREE.MeshLambertMaterial({ color: c, transparent: op < 1, opacity: op })); return solidCache.get(k) }
export function prop(name, { scale = 1, tint = 0xb0a493, burnt = false, solid = null, opacity = 1, skin = null, bare = false } = {}) {
  const src = lib[name]; if (!src) return null;
  const o = src.clone(true), t = new THREE.Color(burnt ? 0x4a4440 : tint);
  /* bare：Mini Market 的货架、面包架自带商品模型，去掉（我们自己摆货） */
  if (bare) { const rm = []; o.traverse(m => { if (m !== o && /^(bag|carton|box|bottle|bread)/.test(m.name)) rm.push(m) }); rm.forEach(m => m.parent && m.parent.remove(m)) }
  /* solid：不用原贴图，整个换成一种颜色（比如把棕色玻璃瓶改成透明的水瓶） */
  const sm = solid != null ? solidMat(solid, opacity) : null;
  o.traverse(m => { if (m.isMesh) { m.material = sm || (Array.isArray(m.material) ? m.material.map(x => grime(x, t, skin)) : grime(m.material, t, skin)); m.castShadow = true; m.receiveShadow = true } });
  o.scale.setScalar(scale);
  return o;
}

/* 0.28 牧场产品的模型（货柜上摆的、图标）：蛋、毛、牛奶、松露；不是牧场产品返回 null */
/* 0.42 工坊的产品、菜（用户生成的模型）：缩放到差不多一样大（最长边 size 米），底贴地、居中 */
/* 设计 34：以前的 g_ 加工品模型不用了（货架上的货改成代码画，见 shelfgoods.js） */
export function ranchGoodProp(g, scale = 1) {
  if (g === 'egg') return prop('egg', { scale: 1.5 * scale, tint: 0xffffff });
  if (g === 'duckegg') return prop('egg', { scale: 1.6 * scale, solid: 0xdcebe2 });
  if (g === 'fur') return prop('bag', { scale: 0.9 * scale, solid: 0xc9a27e });
  if (g === 'wool') return prop('bag', { scale: 0.9 * scale, solid: 0xf2efe6 });
  if (g === 'milk') return prop('carton', { scale: 0.9 * scale, tint: 0xffffff });
  if (g === 'truffle') return prop('mushroom', { scale: 1.2 * scale, solid: 0x4e3a2c });
  return null;
}
