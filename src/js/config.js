/* ================= 数值总表 =================
   所有平衡数值都在这里。改数值只改这个文件，设计稿在 设计/01_最小可玩版本.md。 */

export const JUNK = {
  /* where：在哪里捡——street = 院子门口的马路（没有丧尸，只有铁罐和塑料瓶），scav = 拾荒区地图 */
  can:     { name: '生锈铁罐', good: 'food',     treasure: 'crate',   where: 'street', weight: 25, color: 0xb5562b },
  bottle:  { name: '塑料瓶',   good: 'water',    treasure: 'filter',  where: 'street', weight: 25, color: 0x7fb7d6 },
  cloth:   { name: '破布',     good: 'bandage',  treasure: 'toolbox',   /* 设计 68：不再变出急救包 */  where: 'scav',   weight: 22, color: 0x9a8f7a },
  wood:    { name: '碎木板',   good: 'firewood', treasure: 'toolbox', where: 'scav',   weight: 18, color: 0x8a6239 },
  battery: { name: '废电池',   good: 'battery',    treasure: 'toolbox', where: 'scav',   weight: 14, color: 0x3f6b46 },
};
export const JUNK_IDS = Object.keys(JUNK);

export const GOODS = {
  /* unlock = 超市几级解锁：没解锁的顾客不会要、货柜上不能摆、废街不刷对应的物资和种子 */
  /* 设计 31～33（V2.61）：48 种商品；raw = 原料（顾客不买、不上货柜，只进机器 / 厨房）；craft = 哪台机器做的（w 0.4）；dish = 厨房的菜（w 0.2）；
     only = 只能放哪种货柜（冰淇淋只放冰柜） */
  food:     { name: '罐头',   price: 8,  demand: 30, unlock: 1, color: 0xd9a441 },
  water:    { name: '纯净水', price: 7,  demand: 30, unlock: 1, color: 0x5fb2e8 },
  bandage:  { name: '绷带',   price: 10, demand: 18, unlock: 1, color: 0xf2efe6 },
  firewood: { name: '木柴',   price: 10, demand: 0,  unlock: 2, color: 0x9c6b3c, raw: true },   // 设计 31：木柴是原料，在木工台做成木炭、手电筒、火炬（price 只给原料估价用）
  battery:  { name: '电池',   price: 10, demand: 8,  unlock: 2, color: 0x3f8b46 },               // 设计 32：回收机把废电池变成电池（以前变手电筒）
  charcoal: { name: '木炭',   price: 5,  demand: 14, unlock: 2, color: 0x3a3430, craft: 'wood' },   // 设计 31：一个木柴出 2 个；普通商品（w 1），接替原来的木柴
  cell:     { name: '电芯',   price: 5,  demand: 0,  unlock: 3, color: 0x8a9aa8, raw: true },     // 分解机：电池 → 电芯 + 铜丝
  wire:     { name: '铜丝',   price: 5,  demand: 0,  unlock: 3, color: 0xc87a3a, raw: true },
  tin:      { name: '铁皮',   price: 5,  demand: 0,  unlock: 4, color: 0x9aa4ac, raw: true },     /* 设计 72：分解机：罐头 1 → 铁皮（罐头机用）；设计 73：3 → 4 张 */
  thread:   { name: '棉线',   price: 5,  demand: 0,  unlock: 4, color: 0xeee6d4, raw: true },     /* 设计 72：分解机：绷带 1 → 棉线 3（纺织机用） */
  light:    { name: '手电筒', price: 40, demand: 2,  unlock: 3, color: 0xe8d84f, craft: 'wood', w: 0.4 },   // 设计 33：电芯 + 木柴（以前回收机出、卖 15）
  lighter:  { name: '打火机', price: 30, demand: 2,  unlock: 3, color: 0xd07a30, craft: 'wood', w: 0.4 },
  torch:    { name: '火炬',   price: 55, demand: 2,  unlock: 3, color: 0xe86a2a, craft: 'wood', w: 0.4 },
  /* 温室、果园种出来的（要放果蔬架） */
  radish:   { name: '萝卜',   price: 5,  demand: 10, color: 0xd9475a, unlock: 2, fresh: true },
  cabbage:  { name: '卷心菜', price: 6,  demand: 8,  color: 0x8cc152, unlock: 2, fresh: true },
  tomato:   { name: '番茄',   price: 7,  demand: 8,  color: 0xe0442e, unlock: 3, fresh: true },
  carrot:   { name: '胡萝卜', price: 8,  demand: 6,  color: 0xef8a2b, unlock: 3, fresh: true },
  eggplant: { name: '茄子',   price: 8,  demand: 6,  color: 0x6a3a8a, unlock: 3, fresh: true },   // 0.25 用户：果蔬架能多放一种了，超市 3 级多一种菜
  corn:     { name: '玉米',   price: 9,  demand: 5,  color: 0xf2c94c, unlock: 4, fresh: true },
  pumpkin:  { name: '南瓜',   price: 18, demand: 2,  color: 0xe8862a, unlock: 4, fresh: true },
  apple:    { name: '苹果',   price: 6,  demand: 6,  color: 0xc8302a, unlock: 3, fresh: true },
  fish:     { name: '鱼',     price: 30, demand: 14, unlock: 3, color: 0x6a8aa0 },   // 0.14 钓鱼：顾客只说要鱼、不挑哪种，按买走的那条算钱（FISH 里每种的价）
  orange:   { name: '橙子',   price: 8,  demand: 4,  color: 0xf0932b, unlock: 4, fresh: true },
  truffle:  { name: '松茸',   price: 40, demand: 2,  color: 0x4a3426, unlock: 5, fresh: true },   // 设计 33：超市 5 级开放，温室种
  /* 牧场出产：设计 32 起都是原料（不单卖），每样至少能做 2 样东西（ranch = 哪种动物产的） */
  egg:      { name: '鸡蛋',   price: 8,  demand: 0,  color: 0xf3ead8, unlock: 3, ranch: 'chicken', raw: true },
  duckegg:  { name: '鸭蛋',   price: 10, demand: 0,  color: 0xcfe3dc, unlock: 3, ranch: 'duck', raw: true },
  fur:      { name: '兔毛',   price: 16, demand: 0,  color: 0xc9a27e, unlock: 4, ranch: 'rabbit', raw: true },
  wool:     { name: '羊毛',   price: 20, demand: 0,  color: 0xf2efe6, unlock: 4, ranch: 'sheep', raw: true },
  milk:     { name: '牛奶',   price: 18, demand: 0,  color: 0xffffff, unlock: 5, ranch: 'cow', raw: true },
  pork:     { name: '猪肉',   price: 20, demand: 0,  color: 0xe88a8a, unlock: 5, ranch: 'pig', raw: true },
  /* 工坊（机器做的，放货架；w 0.4）——设计 33 的售价 */
  mayo:     { name: '蛋黄酱',   price: 24, demand: 2, color: 0xf3e3a0, unlock: 3, craft: 'mayo', w: 0.4 },
  radpickle:{ name: '腌萝卜',   price: 15, demand: 2, color: 0xe8d8a0, unlock: 3, craft: 'pickle', w: 0.4 },
  pickle:   { name: '泡菜',     price: 18, demand: 2, color: 0x7a9a3a, unlock: 3, craft: 'pickle', w: 0.4 },   // 原来的「腌菜」，现在只用卷心菜
  pidan:    { name: '皮蛋',     price: 30, demand: 2, color: 0x4a4636, unlock: 4, craft: 'mayo', w: 0.4 },   /* 设计 70：鸭蛋 10 × 3 */
  mushegg:  { name: '松茸蒸蛋', price: 110, demand: 2, color: 0xf2d890, unlock: 5, craft: 'mayo', w: 0.4, only: 'deli' },  /* 设计 70：鸭蛋 10 + 松茸 40 = 50 × 2.2。设计 71：熟食，只放熟食柜（还是蛋品机做） */
  ketchup:  { name: '番茄酱',   price: 20, demand: 2, color: 0xc8281e, unlock: 3, craft: 'jam', w: 0.4 },    /* 设计 70：番茄 7 × 2.85 */
  saltegg:  { name: '咸鸭蛋',   price: 28, demand: 2, color: 0xd8e8e0, unlock: 3, craft: 'pickle', w: 0.4 },
  jam:      { name: '苹果酱',   price: 32, demand: 2, color: 0xb0303a, unlock: 3, craft: 'jam', w: 0.4 },      // 原来的「果酱」
  ojuice:   { name: '橙汁',     price: 36, demand: 2, color: 0xf0a030, unlock: 4, craft: 'jam', w: 0.4 },
  smoked:   { name: '熏鱼',     price: 75, demand: 2, color: 0x8a5a30, unlock: 3, craft: 'smoke', w: 0.4 },
  floss:    { name: '肉松',     price: 60, demand: 2, color: 0xd6964e, unlock: 5, craft: 'smoke', w: 0.4 },
  bacon:    { name: '腊肉',     price: 55, demand: 2, color: 0xa04a3a, unlock: 5, craft: 'smoke', w: 0.4 },
  sweater:  { name: '毛衣',     price: 55, demand: 2, color: 0xe8e0c8, unlock: 4, craft: 'loom', w: 0.4 },
  scarf:    { name: '围巾',     price: 85, demand: 2, color: 0xc84040, unlock: 4, craft: 'loom', w: 0.4 },
  hat:      { name: '帽子',     price: 45, demand: 2, color: 0x9a9a9a, unlock: 4, craft: 'loom', w: 0.4 },
  gloves:   { name: '手套',     price: 80, demand: 2, color: 0x8a5a3a, unlock: 4, craft: 'loom', w: 0.4 },
  cheese:   { name: '奶酪',     price: 45, demand: 2, color: 0xf0c040, unlock: 5, craft: 'cheese', w: 0.4 },
  icecream: { name: '冰淇淋',   price: 50, demand: 2, color: 0xf8f0e8, unlock: 5, craft: 'cheese', w: 0.4, only: 'fridge' },   // 只能放冰柜（冰柜再 ×1.3～1.5）
  /* 35b：甜品机（替代第 2 台木工台，超市 5 级）：用牧场富余的牛奶、鸡蛋，只能放冰柜 */
  yogurt:   { name: '酸奶',     price: 40, demand: 2, color: 0xf4f0e6, unlock: 5, craft: 'sweet', w: 0.4, only: 'fridge' },
  pudding:  { name: '鸡蛋布丁', price: 50, demand: 2, color: 0xf0c860, unlock: 5, craft: 'sweet', w: 0.4, only: 'fridge' },
  popsicle: { name: '冰棍',     price: 45, demand: 2, color: 0xf4f0e8, unlock: 5, craft: 'sweet', w: 0.4, only: 'fridge' },
  fishcan:  { name: '鱼罐头',   price: 70, demand: 2, color: 0x7a8aa8, unlock: 4, craft: 'can', w: 0.4 },
  orangecan:{ name: '橘子罐头', price: 22, demand: 2, color: 0xf0a040, unlock: 4, craft: 'can', w: 0.4 },
  spam:     { name: '午餐肉罐头', price: 55, demand: 2, color: 0x4a6ab0, unlock: 5, craft: 'can', w: 0.4 },
  popcorn:  { name: '爆米花',   price: 24, demand: 2, color: 0xf8e8b0, unlock: 4, craft: 'dry', w: 0.4 },
  pumpseed: { name: '南瓜子',   price: 40, demand: 2, color: 0xe0d090, unlock: 4, craft: 'dry', w: 0.4 },
  applechip:{ name: '苹果干',   price: 18, demand: 2, color: 0xf0d8a0, unlock: 4, craft: 'dry', w: 0.4 },
  /* 厨房的菜（熟食柜，w 0.2） */
  tomegg:   { name: '番茄炒蛋', price: 40,  demand: 1, color: 0xe0442e, unlock: 4, dish: true, w: 0.2 },
  salad:    { name: '蔬菜沙拉', price: 50,  demand: 1, color: 0x8cc152, unlock: 4, dish: true, w: 0.2 },
  eggplantfry:{ name: '炸茄条', price: 45,  demand: 1, color: 0xd9a441, unlock: 4, dish: true, w: 0.2 },   // 换掉苹果派
  fishsoup: { name: '鱼汤',     price: 110, demand: 1, color: 0xe8e0d0, unlock: 4, dish: true, w: 0.2 },
  pumpsoup: { name: '南瓜汤',   price: 150, demand: 1, color: 0xe8862a, unlock: 5, dish: true, w: 0.2 },
  flossrice:{ name: '肉松饭',   price: 175, demand: 1, color: 0xc8945a, unlock: 5, dish: true, w: 0.2 },
  stew:     { name: '萝卜炖肉', price: 85,  demand: 1, color: 0xa0503a, unlock: 5, dish: true, w: 0.2 },
  cornbread:{ name: '玉米饼',   price: 45,  demand: 1, color: 0xe8b840, unlock: 5, dish: true, w: 0.2 },
  /* 不再用的（旧存档里有的转成新的，见 logic.js migrate） */
  cloth:    { name: '布',     price: 48, demand: 0, color: 0xd8c8a8, unlock: 99, gone: 'sweater' },
  applepie: { name: '苹果派', price: 55, demand: 0, color: 0xd9a441, unlock: 99, gone: 'eggplantfry' },
};
export const GOOD_IDS = Object.keys(GOODS);

export const TREASURE = {
  crate:   { name: '一箱罐头',   sell: 40, color: 0xd9a441 },
  filter:  { name: '净水滤芯',   sell: 50, color: 0x5fb2e8 },
  medkit:  { name: '急救包',     sell: 60, color: 0xd94a3d },
  toolbox: { name: '工具箱',     sell: 70, color: 0xc0392b },
  genpart: { name: '发电机零件', sell: 90, color: 0x8e9aa6 },
  sapA:    { name: '苹果树苗',   sell: 30, color: 0x6a9a3a, tree: 'apple' },
  sapO:    { name: '橙子树苗',   sell: 40, color: 0x7aa040, tree: 'orange' },
};
export const TREASURE_IDS = Object.keys(TREASURE);

/* 回收机：每级的用时、排队上限、各结果概率（剩下的是「原样」）、保底件数 */
/* 37 供给模拟：超市 1 级只靠员工时回收机是瓶颈（罐头、水、绷带轮流空），每级都快一点：4/3.5/3/2.5/2 → 2.8/2.5/2.3/2.1/1.9 秒 */
/* 设计 41：超市 1 级（回收机能到 2 级）罐头、水、绷带要过量 1.3 倍：2 级 2.5 → 2.0 秒，后面跟着排：1.95 / 1.9 / 1.85
   42：×3、×10 不再超过仓库上限以后（以前超出的部分白送），1 级又不够了：2～5 级再快 0.3 秒 → 1.7 / 1.65 / 1.6 / 1.55 */
export const RECYCLER = [
  null,
  { time: 2.8, queue: 10, x3: 0.20, x10: 0.06, gem: 0.04, pity: 30 },
  { time: 1.7, queue: 15, x3: 0.22, x10: 0.07, gem: 0.05, pity: 26 },
  { time: 1.65, queue: 20, x3: 0.24, x10: 0.08, gem: 0.06, pity: 22 },
  { time: 1.6, queue: 30, x3: 0.26, x10: 0.09, gem: 0.07, pity: 18 },
  { time: 1.55, queue: 40, x3: 0.28, x10: 0.10, gem: 0.08, pity: 15 },
];

export const SHELF_CAP = 10;
export const BAG_SIZES = [0, 4, 5, 6, 8, 10];        // 背包等级 → 格数（同一种东西一格叠加）
export const STACK = 20;                              // 一格最多叠几个
export const SHELF_MAX = 7;                           // 普通货架最多几个（货柜总数看超市等级 STORE.shelves）

/* 建造：key → 每一级（下标 = 目标等级）的花费 */
export const BUILD = {
  rec: { name: '回收机', unit: '级', levels: [null, null,
    { coins: 150,  need: {},                         time: 180 },
    { coins: 500,  need: { toolbox: 2 },               time: 600,  store: 2 },
    { coins: 1500, need: { toolbox: 3 },  time: 2400, store: 3 },
    { coins: 4000, need: { toolbox: 4 }, time: 7200, store: 4 },
  ] },
  shelf: { name: '货架', unit: '个', levels: [null, null, null,
    { coins: 80,   need: {},                        time: 120 },
    { coins: 300,  need: { toolbox: 1 },              time: 300,  store: 2 },
    { coins: 1000, need: { toolbox: 2 }, time: 900,  store: 2 },
    { coins: 2500, need: { toolbox: 2 }, time: 1800, store: 3 },
    { coins: 5000, need: { toolbox: 2 }, time: 3600, store: 3 },
    { coins: 8000,  need: { toolbox: 3 }, time: 5400, store: 4 },   // 超市 4 级：店里能放 12 个货柜，多出来的 2 个是货架
    { coins: 12000, need: { toolbox: 4 }, time: 7200, store: 4 },
  ] },
  bag: { name: '背包', unit: '格', levels: [null, null,
    { coins: 120,  need: {},                         time: 180 },
    { coins: 400,  need: { toolbox: 1 },              time: 480 },
    { coins: 1200, need: { toolbox: 2 },              time: 1800, store: 3 },
    { coins: 3500, need: { toolbox: 3 },  time: 5400, store: 4 },
  ] },
  /* 仓库：每种商品最多存多少（WAREHOUSE）。1 级开局就有 */
  /* 营地宿舍楼（0.21 以前是帐篷）：每级住 2 个员工；1 级开局就有 */
  camp: { name: '宿舍楼', unit: '级', levels: [null, null,
    { coins: 500,  need: { toolbox: 1 },   time: 600,  store: 2 },
    { coins: 1500, need: { toolbox: 1 }, time: 1800, store: 3 },
    { coins: 4000, need: { toolbox: 1 }, time: 3600, store: 4 },
    { coins: 10000, need: { toolbox: 2 }, time: 3600, store: 5 },   // V1.01 用户：宿舍加一级；35b：5 级住 12 个（全自动要 9～10 个员工）
  ] },
  /* 0.22 池塘（设计/09_池塘.md）：钓到的鱼放这里，冰柜从这里补鱼；不繁殖 */
  pond: { name: '池塘', unit: '级', levels: [null,
    { coins: 1500, need: { toolbox: 1 }, time: 1800, store: 3 },
    { coins: 4000, need: { toolbox: 2 }, time: 3600, store: 4 },
    { coins: 9000, need: { toolbox: 3 }, time: 7200, store: 5 },
  ] },
  /* 0.28 牧场的动物棚（设计/14_农场.md）：1/2/3 级住 2/4/6 只 */
  chicken: { name: '鸡舍', unit: '级', ranch: true, levels: [null,
    { coins: 1500, need: {}, time: 600, store: 3 },
    { coins: 3000, need: { toolbox: 1 }, time: 1800, store: 3 },
    { coins: 6000, need: { toolbox: 2 }, time: 3600, store: 3 },
  ] },
  duck: { name: '鸭舍', unit: '级', ranch: true, levels: [null,
    { coins: 1500, need: {}, time: 600, store: 3 },
    { coins: 3000, need: { toolbox: 1 }, time: 1800, store: 3 },
    { coins: 6000, need: { toolbox: 2 }, time: 3600, store: 3 },
  ] },
  rabbit: { name: '兔笼', unit: '级', ranch: true, levels: [null,
    { coins: 4000, need: { toolbox: 1 }, time: 600, store: 4 },
    { coins: 8000, need: { toolbox: 2 }, time: 1800, store: 4 },
    { coins: 15000, need: { toolbox: 3 }, time: 3600, store: 4 },
  ] },
  sheep: { name: '羊圈', unit: '级', ranch: true, levels: [null,
    { coins: 4000, need: { toolbox: 1 }, time: 600, store: 4 },
    { coins: 8000, need: { toolbox: 2 }, time: 1800, store: 4 },
    { coins: 15000, need: { toolbox: 3 }, time: 3600, store: 4 },
  ] },
  cow: { name: '牛棚', unit: '级', ranch: true, levels: [null,
    { coins: 10000, need: { toolbox: 2 }, time: 600, store: 5 },
    { coins: 18000, need: { toolbox: 3 }, time: 1800, store: 5 },
    { coins: 30000, need: { toolbox: 4 }, time: 3600, store: 5 },
  ] },
  pig: { name: '猪圈', unit: '级', ranch: true, levels: [null,
    { coins: 10000, need: { toolbox: 2 }, time: 600, store: 5 },
    { coins: 18000, need: { toolbox: 3 }, time: 1800, store: 5 },
    { coins: 30000, need: { toolbox: 4 }, time: 3600, store: 5 },
  ] },
  /* 0.42 工坊（设计/15）：厨房 + 6 台机器，每样 3 级（升级加快速度）；熟食柜是货柜（unit 个，最多 2 个） */
  kitchen: { name: '厨房', unit: '级', ws: true, levels: [null,
    { coins: 3000, need: { toolbox: 1 }, time: 600, store: 4 },
    { coins: 8000, need: { toolbox: 2 }, time: 1800, store: 4 },
    { coins: 15000, need: { toolbox: 3 }, time: 3600, store: 4 },
  ] },
  /* 设计 68：第二个厨房，跟厨房一样（8 道菜、1～3 级、花费和时间、模型），超市 5 级开放 */
  kitchen2: { name: '厨房 2', unit: '级', ws: true, levels: [null,
    { coins: 3000, need: { toolbox: 1 }, time: 600, store: 5 },
    { coins: 8000, need: { toolbox: 2 }, time: 1800, store: 5 },
    { coins: 15000, need: { toolbox: 3 }, time: 3600, store: 5 },
  ] },
  mayo: { name: '蛋品机', unit: '级', ws: true, levels: [null,
    { coins: 1500, need: {}, time: 600, store: 3 }, { coins: 3000, need: { toolbox: 1 }, time: 1800, store: 3 }, { coins: 6000, need: { toolbox: 2 }, time: 3600, store: 3 }] },
  pickle: { name: '腌菜缸', unit: '级', ws: true, levels: [null,
    { coins: 1500, need: {}, time: 600, store: 3 }, { coins: 3000, need: { toolbox: 1 }, time: 1800, store: 3 }, { coins: 6000, need: { toolbox: 2 }, time: 3600, store: 3 }] },
  jam: { name: '果酱锅', unit: '级', ws: true, levels: [null,
    { coins: 1500, need: {}, time: 600, store: 3 }, { coins: 3000, need: { toolbox: 1 }, time: 1800, store: 3 }, { coins: 6000, need: { toolbox: 2 }, time: 3600, store: 3 }] },
  smoke: { name: '熏炉', unit: '级', ws: true, levels: [null,
    { coins: 1500, need: {}, time: 600, store: 3 }, { coins: 3000, need: { toolbox: 1 }, time: 1800, store: 3 }, { coins: 6000, need: { toolbox: 2 }, time: 3600, store: 3 }] },
  loom: { name: '纺织机', unit: '级', ws: true, levels: [null,
    { coins: 4000, need: { toolbox: 1 }, time: 600, store: 4 }, { coins: 8000, need: { toolbox: 2 }, time: 1800, store: 4 }, { coins: 15000, need: { toolbox: 3 }, time: 3600, store: 4 }] },
  cheese: { name: '奶品机', unit: '级', ws: true, levels: [null,
    { coins: 10000, need: { toolbox: 2 }, time: 600, store: 5 }, { coins: 18000, need: { toolbox: 3 }, time: 1800, store: 5 }, { coins: 30000, need: { toolbox: 4 }, time: 3600, store: 5 }] },
  /* 设计 31 / 33：木工台（超市 2 级就能盖，是第一台机器）；第 2 台木工台超市 4 级，单独升级；分解机、罐头机、烘干机 */
  wood: { name: '木工台', unit: '级', ws: true, levels: [null,
    { coins: 400, need: {}, time: 300, store: 2 }, { coins: 1500, need: { toolbox: 1 }, time: 1800, store: 3 }, { coins: 4000, need: { toolbox: 2 }, time: 3600, store: 4 }] },
  /* 35b：甜品机（超市 5 级，费用和奶品机一样）；第 2 台木工台去掉了（wood2 只留着给旧存档退钱用，不在 WS_IDS 里，建造里不出现） */
  sweet: { name: '甜品机', unit: '级', ws: true, levels: [null,
    { coins: 10000, need: { toolbox: 2 }, time: 600, store: 5 }, { coins: 18000, need: { toolbox: 3 }, time: 1800, store: 5 }, { coins: 30000, need: { toolbox: 4 }, time: 3600, store: 5 }] },
  wood2: { name: '木工台（第 2 台）', unit: '级', ws: true, gone: true, levels: [null,
    { coins: 3000, need: { toolbox: 1 }, time: 600, store: 4 }, { coins: 1500, need: { toolbox: 1 }, time: 1800, store: 4 }, { coins: 4000, need: { toolbox: 2 }, time: 3600, store: 4 }] },
  split: { name: '分解机', unit: '级', ws: true, levels: [null,
    { coins: 1500, need: { toolbox: 1 }, time: 600, store: 3 }, { coins: 3000, need: { toolbox: 2 }, time: 1800, store: 3 }, { coins: 6000, need: { toolbox: 3 }, time: 3600, store: 3 }] },
  can: { name: '罐头机', unit: '级', ws: true, levels: [null,
    { coins: 4000, need: { toolbox: 1 }, time: 600, store: 4 }, { coins: 8000, need: { toolbox: 2 }, time: 1800, store: 4 }, { coins: 15000, need: { toolbox: 3 }, time: 3600, store: 4 }] },
  dry: { name: '烘干机', unit: '级', ws: true, levels: [null,
    { coins: 4000, need: { toolbox: 1 }, time: 600, store: 4 }, { coins: 8000, need: { toolbox: 2 }, time: 1800, store: 4 }, { coins: 15000, need: { toolbox: 3 }, time: 3600, store: 4 }] },
  deli: { name: '熟食柜', unit: '个', levels: [null,
    { coins: 3000, need: { toolbox: 1 }, time: 1800, store: 4 },
    { coins: 5000, need: { toolbox: 2 }, time: 1800, store: 5 },
  ] },
  wh: { name: '仓库', unit: '级', levels: [null, null,
    { coins: 200,  need: {},               time: 300 },
    { coins: 600,  need: { toolbox: 1 },     time: 900, store: 2 },
    { coins: 2000, need: { toolbox: 1 },   time: 1800, store: 3 },
    { coins: 6000, need: { toolbox: 2 },   time: 3600, store: 4 },   // V1.01 用户：仓库、温室建造变快，跟动物棚、工坊机器差不多（同样的钱差不多同样的时间）
  ] },
  veg: { name: '果蔬架', unit: '个', levels: [null,
    { coins: 500,  need: {},           time: 600,  store: 2 },
    { coins: 1500, need: { toolbox: 1 }, time: 1800, store: 3 },
  ] },
  fridge: { name: '冰柜', unit: '个', levels: [null,
    { coins: 2000, need: { toolbox: 1 }, time: 1800, store: 3 },
    { coins: 4000, need: { toolbox: 2 }, time: 1800, store: 5 },   // 35b：第 2 个冰柜超市 5 级（放甜品机的 3 样）
  ] },
  /* 单个货柜升档（在「货架」页里点），levels 下标 = 升到第几档 */
  tier: { name: '货柜升档', unit: '档', levels: [null, null,
    { coins: 300,  need: { toolbox: 1 },   time: 600 },
    { coins: 1200, need: { toolbox: 1 }, time: 1800, store: 3 },
  ] },
  /* 尸潮的塔升级（数值在 TOWERS.up，这里只给名字） */
  tower: { name: '塔升级', unit: '级', levels: [] },
  /* 超市是主建筑：升级要先完成本阶段的升级任务（TASKS）；设计 60：4 级要通关尸潮第 5 关，5 级要通关第 9 关（经验点去掉了） */
  store: { name: '超市', unit: '级', main: true, levels: [null, null,
    { coins: 400,   need: { toolbox: 1 },              time: 900 },
    { coins: 2000,  need: { toolbox: 2 },            time: 7200 },
    { coins: 8000,  need: { toolbox: 6 }, time: 14400, td: 5 },   // 设计 60：通关尸潮第 5 关
    { coins: 20000, need: { toolbox: 11 }, time: 28800, td: 9 },   // 设计 60：通关尸潮第 9 关（以前经验点 1000 ≈ 前 9 关各赢一次）
  ] },
  gh: { name: '温室', unit: '级', levels: [null,
    { coins: 300,   need: {},                         time: 600,   store: 2 },
    { coins: 800,   need: { toolbox: 1 },             time: 1200,  store: 2 },
    { coins: 2000,  need: { toolbox: 2 },              time: 1800,  store: 3 },
    { coins: 5000,  need: { toolbox: 2 },             time: 3600, store: 4 },   // 0.43 用户：温室跟作物走——3 级 10 格（超市 3 级 5 种菜 ×2）、4 级 14 格要超市 4 级（7 种 ×2）、5 级要超市 5 级
    { coins: 12000, need: { toolbox: 4 }, time: 5400, store: 5 },
  ] },
  orchard: { name: '果园', unit: '级', levels: [null,
    { coins: 1500, need: {}, time: 1800, store: 3 },
    { coins: 6000, need: {}, time: 3600, store: 4 },   // V1.01 果园也跟着变快
    { coins: 12000, need: { toolbox: 3 }, time: 5400, store: 5 },   // 设计 48：3 级 6 个树位
  ] },
  rod: { name: '鱼竿', unit: '级', levels: [null, null,
    { coins: 800,  need: {},             time: 1200, store: 3 },
    { coins: 2500, need: { toolbox: 1 }, time: 3600, store: 4 },
  ] },
};
/* 设计 39：货柜不限数量（只看店里有没有空位）。表里没有的第 N 个：价格 = 上一个 × 1.3（取整到 100），工具箱 +1（最多 5），用时、要的超市等级跟最后一档一样 */
for (const k of ['shelf', 'veg', 'fridge', 'deli']) {
  const t = BUILD[k].levels, memo = {};
  const at = n => { if (n < t.length) return t[n]; if (memo[n]) return memo[n]; const p = at(n - 1);
    return (memo[n] = { coins: Math.round(p.coins * 1.3 / 100) * 100, need: { toolbox: Math.min(5, ((p.need && p.need.toolbox) || 0) + 1) }, time: p.time, ...(p.store ? { store: p.store } : {}), extra: true }) };
  BUILD[k].levels = new Proxy(t, { get: (o, key) => typeof key === 'string' && /^\d+$/.test(key) && +key >= o.length ? at(+key) : o[key] });
}
export const BUILD_ORDER = ['store', 'rec', 'wh', 'shelf', 'veg', 'fridge', 'deli', 'bag', 'gh', 'orchard', 'rod', 'pond', 'camp'];   // V1.01 用户：员工不会受伤（设计 68 把医院整个删了）

/* ---------- 货柜（布置）：三种，每种分低中高三档 ----------
   size：占几格（宽 × 深，网格 0.8 米一格）；cap：每档放几件；mult：每档的售价倍数；goods：能放什么（null = 不限） */
export const FIXTURE = {
  shelf:  { name: '货架',   size: [3, 1], kinds: [1, 2, 3], cap: [10, 20, 30], mult: [1, 1.1, 1.2], tiers: ['旧货架', '货架', '精品货架'], note: '放罐头、水、绷带、电池、木炭和工坊做的东西' },
  veg:    { name: '果蔬架', size: [2, 2], kinds: [3, 4, 5], cap: [10, 12, 14], mult: [1, 1.1, 1.2], tiers: ['旧果蔬筐', '阶梯果蔬架', '精品果蔬架'], note: '只放蔬菜和水果' },
  deli:   { name: '熟食柜', size: [2, 1], kinds: [2, 3, 4], cap: [6, 8, 10], mult: [1, 1.1, 1.2], tiers: ['熟食柜', '双层熟食柜', '精品熟食柜'], note: '只放熟食（厨房的菜、松茸蒸蛋）' },   // 0.42 工坊
  fridge: { name: '冰柜',   size: [2, 1], kinds: [1, 2, 3], cap: [12, 24, 36], mult: [1.3, 1.4, 1.5], tiers: ['二手冰柜', '双冰柜', '立式冷柜'], note: '放纯净水（冰镇的卖得更贵）、鱼（按每条鱼的价钱）、冰淇淋、酸奶、鸡蛋布丁、冰棍' },   // 0.28 用户：冰柜升档能多放种类（低档 1 种、中档 2 种、高档 3 种）
};
/* 0.28 牧场（设计/14_农场.md）：每只每分钟都产 0.5 个；scale 是模型缩放（模型高约 1 米）；price：在院子商人那里买一只多少钱（用户定：约 40 分钟回本） */
/* V1.01：每种都快了约 13%（留余量：动物只吃货柜放满后仓库剩下的菜，工坊也只拿剩下的，余量太薄就会一串断货） */
/* 35b：甜品机也要鸡蛋、牛奶（布丁、冰棍、酸奶），供给模拟里鸡蛋、牛奶常见底：鸡 96 → 72 秒、奶牛 288 → 210 秒、猪每轮 4 → 5 个 */
export const RANCH = {
  chicken: { name: '鸡',   good: 'egg',     cycle: 72, yield: 1, scale: 0.7, price: 160 },
  duck:    { name: '鸭',   good: 'duckegg', cycle: 210, yield: 2, scale: 0.7, price: 200 },
  rabbit:  { name: '兔子', good: 'fur',     cycle: 210, yield: 3,   /* 设计 70：围巾、手套也要兔毛，2 → 3 */ scale: 0.66, price: 320 },
  sheep:   { name: '绵羊', good: 'wool',    cycle: 315, yield: 4,   /* 设计 70：围巾、手套也要羊毛，3 → 4 */ scale: 1.3, price: 400 },
  cow:     { name: '奶牛', good: 'milk',    cycle: 210, yield: 3, scale: 1.9, price: 360 },
  pig:     { name: '猪',   good: 'pork',    cycle: 420, yield: 7,   /* 设计 70：5 → 7 */ scale: 1.6, price: 800 },
};
export const RANCH_IDS = Object.keys(RANCH);
/* 0.42 工坊（设计/15）：机器一种原料出一种商品，1 个换 1 个，哪种原料多用哪种；厨房几样原料出一道菜。
   t：1/2/3 级做一个要几秒；keep：原料仓库里每种留几个不拿；perCraft：一个工匠管几台（厨房算 1 台） */
/* 设计 32：12 台（厨房 + 11 台机器），4 个工匠正好管满；顺序 = 工匠先管哪台 */
export const WS_IDS = ['kitchen', 'kitchen2', 'wood', 'mayo', 'pickle', 'jam', 'smoke', 'split', 'loom', 'can', 'dry', 'cheese', 'sweet'];
/* 设计 31～33 配方：need = 几样原料一起用（每样几个）；n = 出几个（默认 1）；tk = 用时倍数（默认 1）；also = 顺带出的（分解机） */
/* econ.mjs（V2.61）：木工台按原来的机器用时（60/55/50 秒）、两样原料的 ×1.5，超市 3 级口碑 100 时要忙到 193% 做不过来；
   改成木工台自己的用时 25/24/22 秒（木工活快），手电筒、打火机、火炬不再 ×1.5 → 2 级口碑 100 约 76%、3 级约 62% */
const WOOD = [
  { out: 'charcoal', need: { firewood: 1 }, n: 2 },
  { out: 'light',    need: { cell: 1, firewood: 1 } },
  { out: 'lighter',  need: { cell: 1, wire: 1 } },
  { out: 'torch',    need: { bandage: 1, firewood: 1 } },
];
export const MACH = {
  wood:   { recipes: WOOD, t: [0, 25, 24, 22], tk: 0.6 },   // 设计 41 tk：用时 × tk（产量要 ≥ 卖掉的 1.3 倍）
  mayo:   { recipes: [{ out: 'mayo', need: { egg: 1 } }, { out: 'pidan', need: { duckegg: 1 } }, { out: 'mushegg', need: { duckegg: 1, truffle: 1 } }] },   // 设计 70：加皮蛋、松茸蒸蛋
  pickle: { tk: 0.6, recipes: [{ out: 'radpickle', need: { radish: 1 } }, { out: 'pickle', need: { cabbage: 1 } }, { out: 'saltegg', need: { duckegg: 1 } }] },
  jam:    { recipes: [{ out: 'jam', need: { apple: 1, water: 1 } }, { out: 'ojuice', need: { orange: 1, water: 1 } }, { out: 'ketchup', need: { tomato: 1 } }] },   // 设计 70：加番茄酱
  smoke:  { t: [0, 48, 44, 40], recipes: [{ out: 'smoked', need: { fish: 1 } }, { out: 'floss', need: { pork: 1 } }, { out: 'bacon', need: { pork: 1 } }] },
  split:  { tk: 0.8, recipes: [{ out: 'cell', need: { battery: 1 }, also: { wire: 1 } }, { out: 'tin', need: { food: 1 }, n: 4 }, { out: 'thread', need: { bandage: 1 }, n: 3 }] },   // 设计 72：拆 3 样原料，用时 × 0.8
  loom:   { tk: 0.7, recipes: [{ out: 'sweater', need: { wool: 1, thread: 1 } }, { out: 'scarf', need: { wool: 1, fur: 1 } }, { out: 'hat', need: { fur: 1, thread: 1 } }, { out: 'gloves', need: { wool: 1, fur: 1 } }] },
  can:    { recipes: [{ out: 'fishcan', need: { fish: 1, tin: 1 } }, { out: 'orangecan', need: { orange: 1, tin: 1 } }, { out: 'spam', need: { pork: 1, tin: 1 } }] },   // 设计 72：都要铁皮
  dry:    { tk: 0.85, recipes: [{ out: 'popcorn', need: { corn: 1 } }, { out: 'pumpseed', need: { pumpkin: 1 } }, { out: 'applechip', need: { apple: 1 } }] },
  cheese: { recipes: [{ out: 'cheese', need: { milk: 1 } }, { out: 'icecream', need: { milk: 1 } }] },
  sweet:  { tk: 0.7, recipes: [{ out: 'yogurt', need: { milk: 1 } }, { out: 'pudding', need: { milk: 1, egg: 1 } }, { out: 'popsicle', need: { orange: 1, water: 1 } }] },
};
export const DISHES = {
  tomegg:     { tomato: 1, egg: 1 },
  salad:      { radish: 1, cabbage: 1, tomato: 1 },
  eggplantfry:{ eggplant: 1, food: 1 },
  fishsoup:   { fish: 1, carrot: 1, water: 1 },
  pumpsoup:   { pumpkin: 1, carrot: 1, truffle: 1 },   // 设计 70
  flossrice:  { floss: 1, truffle: 1, corn: 1 },   // 设计 70
  stew:       { pork: 1, radish: 1, eggplant: 1 },   // 设计 70
  cornbread:  { corn: 1, egg: 1 },
};
/* 配方（厨房的菜也按同一种写法）：{ out, need, n, tk, also } */
/* 设计 68：两个厨房（kitchen、kitchen2）做一样的菜 */
export const isKit = k => k === 'kitchen' || k === 'kitchen2';
export const recipeOf = (k, out) => isKit(k) ? (DISHES[out] ? { out, need: DISHES[out], n: 1, tk: 1 } : null) : (MACH[k] && MACH[k].recipes.find(r => r.out === out)) || null;
/* V1.01 用户：工坊多开生产线——机器 / 厨房几级就同时开几条线（1/2/3 条），每条做一个的时间：机器 60/55/50 秒、厨房 36/33/30 秒 */
export const WS = { vegKeepPct: 0.2,   /* 设计 48：菜果工匠只用仓库上限 20% 以上的部分 */ lines: [0, 1, 2, 3], linesBy: { kitchen: [0, 1, 2, 4], kitchen2: [0, 1, 2, 4], wood: [0, 1, 2, 4], loom: [0, 1, 2, 4] },   /* 设计 68：能做 4 样的厨房、木工台、纺织机 3 级 4 条线（还是最高 3 级） */ machT: [0, 60, 55, 50], kitchenT: [0, 30, 27, 24],   /* 35b：36/33/30 → 30/27/24（5 级 8 道菜，供给模拟里厨房一直满着做不过来） */   /* V1.01 用户：厨房加快，每一级都够顾客买（4 级店 4 道菜要 1.54/分、5 级店 6 道要 2.34/分） */ keep: 10, perCraft: 3, enough: 30, enoughK: 0.4 };   /* 设计 41：停手线跟着仓库变 = max(enough, 仓库每种上限 × enoughK)，仓库 1～5 级 30 / 48 / 100 / 200 / 400 */   // 35b enough：工匠做的时候，仓库里这样产品已经有 enough 个就先不做（别把原料都做成一种囤着，菜、果子留给货柜和动物）
export const PEN_CAP = [0, 2, 4, 6];
/* V1.01 用户：种地、牧场、工坊也像回收机一样有倍率和暴击（不然不够做神秘商人的单）：
   每收一次 / 每做好一个，按等级有机会 ×2、×3（暴击）。lv = 温室 / 动物棚 / 机器的等级 */
export const LUCK = {
  crop:  { x2: lv => 0.12 + 0.03 * (lv - 1), x3: lv => 0.03 + 0.01 * (lv - 1) },
  /* 37 用户：牧场、工坊暴击提高（种地不变）：×2 = 20% + 每级 5%，×3 = 5% + 每级 2% */
  ranch: { x2: lv => 0.20 + 0.05 * (lv - 1), x3: lv => 0.05 + 0.02 * (lv - 1) },
  ws:    { x2: lv => 0.20 + 0.05 * (lv - 1), x3: lv => 0.05 + 0.02 * (lv - 1) },
};
/* 喂：每只吃一个萝卜或卷心菜管 meal 秒（用户 10-14 定 5 分钟）；仓库里各留 keep 个不拿；一个饲养员管 perFeeder 个棚；棚里每只最多存 full 顿 */
/* 0.36 用户：每种动物吃一样菜（以前都吃萝卜、卷心菜）；南瓜一个顶 3 顿、苹果顶 2 顿（长得慢，不然温室 / 果园不够） */
export const FEED = { diet: { chicken: 'cabbage', duck: 'radish', rabbit: 'carrot', sheep: 'eggplant', cow: 'apple', pig: 'pumpkin' }, meals: { pumpkin: 3, apple: 2 }, meal: 300, keep: 5, perFeeder: 3, full: 2 };
export const FIXTURE_IDS = Object.keys(FIXTURE);
export const TIER_NAME = ['', '低档', '中档', '高档'];
/* 货柜能放的东西 */
export const canHold = (type, g) => { const G = GOODS[g]; if (!G || G.raw || G.unlock > 50) return false; if (G.only) return type === G.only;   // 设计 33：冰淇淋只放冰柜
  return type === 'veg' ? !!G.fresh : type === 'fridge' ? g === 'water' || g === 'fish' : type === 'deli' ? !!G.dish : !G.fresh && !G.dish && g !== 'fish' };
/* 仓库等级 → 每种商品最多存几个（珍品、种子、树苗不占仓库） */
export const WAREHOUSE = [0, 60, 120, 250, 500, 1000];

/* 超市各级 */
export const STORE = [null,
  { name: '小卖部',     shelves: 3, traffic: 1 },
  { name: '便利店',     shelves: 6, traffic: 1 },
  { name: '社区超市',   shelves: 12, traffic: 1.2 },   // 0.28 牧场多了蛋、毛、松露、牛奶：3/4/5 级各多 2 个货柜
  { name: '大卖场',     shelves: 14, traffic: 1.4 },
  { name: '末世安全区', shelves: 16, traffic: 1.6 },
];

/* 升级任务：key = 超市当前等级（完成这一级的全部任务才能升到下一级）。
   prog(S) 返回当前进度，达到 goal 就算完成；完成一次就记下来，以后数值掉下去也不收回。 */
export const TASKS = {
  1: [
    { id: 't1rec',   name: '回收机升到 2 级',     goal: 2,  prog: S => S.lv.rec,          reward: { coins: 60 } },
    { id: 't1shelf', name: '建好第 3 个货架',     goal: 3,  prog: S => S.lv.shelf,        reward: { coins: 60 } },
    { id: 't1serve', name: '累计结账 30 位顾客',  goal: 30, prog: S => S.st.served || 0,  reward: { gear: 1 } },
    { id: 't1rep',   name: '口碑到 40',           goal: 40, prog: S => S.rep,             reward: { coins: 80 } },
  ],
  2: [
    { id: 't2veg',   name: '温室收获 20 个蔬菜',  goal: 20, prog: S => S.st.harvest || 0, reward: { coins: 150 } },
    { id: 't2bag',   name: '背包升到 6 格',       goal: 6,  prog: S => BAG_SIZES[S.lv.bag], reward: { coins: 150 } },
    { id: 't2rep',   name: '口碑到 60',           goal: 60, prog: S => S.rep,             reward: { gear: 2 } },
    { id: 't2sold',  name: '累计卖出 300 件',     goal: 300, prog: S => S.st.sold,        reward: { coins: 200 } },
  ],
  3: [
    { id: 't3td',    name: '尸潮塔防打赢第 3 关', goal: 3,  prog: S => Math.max(0, ...Object.entries((S.td && S.td.wins) || {}).filter(([k, n]) => n > 0 && +k <= 100).map(([k]) => +k)), reward: { coins: 500 } },
    { id: 't3tower', name: '建好 3 座塔',         goal: 3,  prog: S => (S.towers || []).filter(t => t && t.lv >= 1).length, reward: { coins: 300 } },
    { id: 't3serve', name: '累计结账 300 位顾客', goal: 300, prog: S => S.st.served || 0, reward: { gear: 3 } },
    { id: 't3rep',   name: '口碑到 80',           goal: 80, prog: S => S.rep,             reward: { coins: 400 } },
  ],
};

/* 温室：每级的格子数、生长加速 */
export const GREENHOUSE = [null, { plots: 6, speed: 1 }, { plots: 9, speed: 1 }, { plots: 14, speed: 1.1 }, { plots: 19, speed: 1.2 }, { plots: 24, speed: 1.3 }];   // 设计 48：每级多给地（原来 4 / 6 / 10 / 14 / 16），温室 4 × 6   // 0.43 用户：4 级每种菜（超市 4 级 7 种）都能种 2 格：12 → 14
/* 作物：生长秒数、每格收获、种子稀有度权重（废街刷出种子袋时按这个抽） */
export const CROPS = {
  /* 0.27 用户：要算销售、成熟、获取速度，东西不能断货。顾客在解锁的商品里平均挑，超市 3～5 级每种每分钟要卖约 1.3～3 个；
     按这个调：慢的菜（胡萝卜、玉米、南瓜）缩短时间，种子按「一包种子收几个」反过来配比例，收得少的种子掉得多，每种菜产出差不多 */
  radish:  { time: 30,   yield: 3, seedW: 36 },   // 设计 41：26 → 36   // 35b：seedW 按「每分钟要种几次」配（萝卜、卷心菜要得最多：卖 + 腌菜 + 沙拉 + 喂鸡鸭）
  cabbage: { time: 60,   yield: 4, seedW: 33 },   // 设计 41：每格 3 → 4 个   // 设计 41：28 → 33（萝卜、番茄种子加了以后卷心菜少了）   // 37：沙拉、泡菜都缺卷心菜 24 → 28
  tomato:  { time: 90,   yield: 4, seedW: 24 },   // 设计 41：种子 15 → 24；120 → 90 秒
  eggplant: { time: 120, yield: 6, seedW: 15 },   // 设计 41：每格 5 → 6 个   // 设计 41：180 → 120 秒   // 35b：慢的菜每格多收 1 个（温室格子 5 级口碑 100 要用到约 90%，太满）
  carrot:  { time: 120,  yield: 6, seedW: 17 },   // 设计 41：每格 5 → 6 个   // 设计 41：180 → 120 秒
  corn:    { time: 200,  yield: 6, seedW: 15 },   // 设计 41：13 → 15   // 设计 41：240 → 200 秒
  pumpkin: { time: 200,  yield: 6, seedW: 16 },   /* 设计 52：13 → 16（结束时种子 10～12 包，偏少） */   // 设计 41：14 → 13   // 设计 41：240 → 200 秒   // 35b：300 → 240 秒（南瓜还要喂猪，猪饿了猪肉、肉松一串断）
  truffle: { time: 300,  yield: 3, seedW: 22 },   /* 设计 52：13 → 22（结束时只剩 4～8 包） */   // 设计 41：360 → 300 秒    // 设计 33：松茸超市 5 级开放，温室种
};
export const CROP_IDS = Object.keys(CROPS);
export const ORCHARD = [0, 2, 4, 6];   // 设计 48：果园加到 3 级（6 个树位）                     // 果园等级 → 树位
export const TREES = {
  apple:  { first: 900, every: 900, yield: 50 },   // 设计 41：34 → 50（+30% 不够，再加到 +47%）   // 35b：30 → 34（果酱锅、苹果干、奶牛都要）   // V1.01 留 15% 余量（工坊只用货柜放满以后剩下的，余量太薄果酱、苹果派老断货）：26 → 30   // 0.42 工坊的果酱、苹果派也要苹果：24 → 26   // 0.36：奶牛要吃苹果，果树产量翻倍（一棵每分钟 1.6 个）   // 0.27 用户：果树太慢不够卖 —— 15 分钟结一次、一次 12 个（两棵每分钟约 1.6 个，够卖）
  orange: { first: 900, every: 900, yield: 48 },   // 设计 41：32 → 48（+50%）   // 35b：28 → 32（橙汁、橘子罐头也要）   // V1.01：24 → 28
};
export const FARM = {
  seedSpawn: 0.12,          // 废街刷新点刷出种子袋的机会
  tipSeed: 0.08,            // 结账时顾客多给一包种子的机会（设计 52：0.05 → 0.08）
  bonusSeed: 0.6,           // 收菜时多得 1 包同样种子的机会（设计 51：0.4 → 0.6）
  sapling: 0.1,             // 变宝时改成果树苗的机会（超市 3 级以后）
};

export const SHOP = {
  repStart: 30, repMax: 100,
  repGood: 1, repBad: 1,           // 买到东西（结账）+1，想买的没货 −1（用户 10-12 定）
  custBase: 10,             // 顾客间隔 = custBase × (1.4 − 口碑/100) 秒
  buyMin: 1, buyMax: 3,
  /* 0.27 用户定：口碑高的顾客会顺手多拿 —— 口碑 50 起有几率，100 时 50%；多拿 1 样（口碑 90 以上一半几率 2 样），每样 1～2 件；
     只拿货柜上还剩一半以上的（不把快卖完的拿空）；多拿的没货不扣口碑，只有最初想买的没货才扣 */
  extra: { from: 50, top: 0.5, two: 90, twoP: 0.5, nMin: 1, nMax: 2, keep: 0.5 },
  shortEvery: 360,          // 每 6 分钟换一种紧缺
  shortDemand: 2, shortPrice: 1.5,
  /* 顾客要走进店里挑货、到收银台排队，玩家站到收银台旁边才能结账 */
  shopTime: 10,             // 进店挑货要多久（秒），之后去收银台排队
  lineMax: 6,               // 店里最多同时有几位顾客（挑货的 + 排队的），满了后面的人就不进来
  patience: 150,            // 排队最多等多久（秒），等不到就把东西放回去、生气走掉
  repAngry: 1,              // 等太久走掉扣的口碑
  checkoutTime: 0.8,        // 结账一位顾客要多久（秒）
  checkoutR: 2.4,           // 站在收银台多近才能结账
};

/* 0.31 神秘商人（设计/16）：超市 3 级起，走后 30 分钟再来（离线也算）；一单 1～3 种、共 10～20 个；给货架售价的 5 倍；10% 多给 1 颗星星 */
export const MYSTERY = { store: 3, first: 120, gap: 1800, kinds: [1, 3], total: [10, 20], mult: 5, starP: 0.1, fishPrice: 30, refPrice: 100, refPack: [5, 0.9] };
/* 0.31 星星（设计/17）：以后充值才有；现在只有神秘商人掉。兑换：1 星星 = 5000 末日币 / 5 个发条 / 3 个工具箱 */
export const STAR = { coins: 5000, gear: 5, toolbox: 3, ref: 5 };   // 0.37 用户：刷新券也只能用星星换（1 颗 5 张）
export const GEAR = { name: '发条', cut: 1800, price: 300, packs: [[1, 1], [5, 0.9], [20, 0.8]], free: 1 };   // 建造剩余时间 −30 分钟；商城卖 1 / 5 / 20 个（9 折、8 折），每天免费领 1 个
export const CREW = { cost: [1000, 2500, 5000] };   // 商城买施工队：第 1、2、3 个（永久，最多同时 4 个）
export const FERT = { name: '肥料', cut: 1800, price: 200, packs: [[1, 1], [5, 0.9], [20, 0.8]] };   // 一块菜地或一棵果树剩余时间 −30 分钟；商城卖

export const SPAWN = { count: 18, perKind: 6, respawn: 45 };    // 拾荒区地图：最多几个刷新点（解锁一种拾荒区的物资开 6 个）、被捡后多少秒刷新
export const STREET_SPAWN = { count: 10, respawn: 45 };   // 院子门口马路：铁罐、塑料瓶
export const SCAV = { zombies: 8 };                 // 拾荒区里的丧尸数量

export const ZOMBIE = {
  count: 4, wander: 1.2, chase: 3.1, see: 5.5, lose: 10,
  react: 0.6,      // 发现主角后愣一下（秒）再追
  turn: 3,         // 追的时候每秒最多转多少弧度（转弯没那么灵活，主角能绕开）
  dropRate: 0.3, invuln: 2,
};
export const PLAYER = { speed: 5, pickR: 1.3, recR: 2.6 };

export const OFFLINE_CAP = 8 * 3600;
export const AUTOSAVE = 15;          // 秒
export const CLOUD_GAP = 60000;      // 两次上传云端至少隔多久（毫秒）

/* ================= 尸潮塔防（设计/03_尸潮塔防.md） ================= */
export const TD = {
  scroll: 300,              // 一张尸潮券多少末日币（每关一样）
  daily: 5,                 // 每天最多发动几次（北京时间 0 点重置，输了也算）
  lineHP: 60,               // 超市门口防线血量（0.16：丧尸多了 3 倍，防线也 ×3）
  repeat: 0.5, lose: 0.25,  // 重复打奖励倍数、输了给的倍数
  coinDrop: 0.07, coinDropN: [3, 8],             // 0.16：丧尸多了 3 倍，掉币机会降到 1/3                // 丧尸被打死掉末日币的机会、每次掉几个
  player: { hp: 100, regen: 2, safeRegen: 20, regenDelay: 3, dmg: 10, rate: 0.4, range: 7.5 },   // V1.01 射程 6 → 7.5（实际按主角射程等级，见 HERO.gun）   // 0.19：伤害 7→10、0.5→0.4 秒一枪、射程 5→6
  grenade: { cd: 10, dmg: 45, radius: 2.6, range: 12 },
  tool: { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 3, 8: 4, 9: 4, 10: 5 },          // 0.20：第一次打赢给几个工具箱；重复打赢一半机会给一半（至少 1）   // 0.19 主角手动技能：手雷，冷却 10 秒，扔向 12 米内丧尸最密的地方，半径 2.6 米每只扣 45   // 主角：血量、平时每秒回血、在店里每秒回血、被打后几秒开始回、枪
  barricade: { hp: 120, repair: 2 },               // 路障血量、站在旁边几秒修满
  waveGap: 12, spawnGap: 2, group: [3, 5], cap: 60,   // 0.16 用户要场面壮观：每 2 秒涌出一小群（3～5 只）；场上最多 60 只（手机上流畅），多的在马路尽头等着
};
/* 丧尸：hp 血量、sp 速度、leak 漏进防线扣几点、hit 碰主角扣血、size 模型大小、atk 打路障每秒伤害 */
export const ZT = {
  /* 0.19：主角加强 + 有了手雷，普通丧尸、跑尸、胖子血再 ×1.8（用户：怪要适当增强）。
     0.16 用户要场面壮观：普通丧尸、跑尸、胖子数量 ×3，单只变弱（血 ×0.38，打路障、撞人约 1/3）；Boss 不变，漏进防线扣的 ×3（防线也 ×3） */
  normal: { name: '丧尸', hp: 34,  sp: 1.3, leak: 1,  hit: 5,  size: 1,    atk: 3 },
  runner: { name: '跑尸', hp: 20,  sp: 2.6, leak: 1,  hit: 4,  size: 0.92, atk: 2 },
  fat:    { name: '胖子', hp: 164,  sp: 0.65, leak: 3, hit: 10, size: 1.35, atk: 6 },
  boss:   { name: 'Boss', hp: 1600, sp: 0.75, leak: 30, hit: 35, size: 1.9, atk: 40 },
  miniboss: { name: '小 Boss', hp: 500, sp: 0.8, leak: 18, hit: 25, size: 1.6, atk: 25 },
};
/* 关卡：每波是 [[种类, 数量], ...]（0.16 起普通丧尸、跑尸、胖子是原来的 3 倍）；coins 是第一次打赢的奖励（设计 60：经验点去掉了）；hp = 这一关丧尸血量倍数 */
export const TD_LEVELS = [null,
  { coins: 200, waves: [[['normal', 24]], [['normal', 36]], [['normal', 36], ['miniboss', 1]]] },
  { coins: 300, hp: 1.1, waves: [[['normal', 30]], [['normal', 24], ['runner', 24]], [['runner', 30], ['normal', 30]], [['normal', 36], ['miniboss', 1]]] },
  { coins: 400, hp: 1.3, waves: [[['normal', 30], ['runner', 18]], [['fat', 9], ['normal', 30]], [['runner', 42], ['fat', 9]], [['normal', 42], ['fat', 12], ['miniboss', 1]]] },
  { coins: 500, hp: 1.6, waves: [[['runner', 48]], [['fat', 15], ['normal', 36]], [['runner', 54], ['normal', 24]], [['fat', 18], ['runner', 36]], [['fat', 18], ['normal', 36], ['miniboss', 2]]] },
  { coins: 700, hp: 2.0, waves: [[['normal', 48], ['runner', 24]], [['fat', 18], ['runner', 42]], [['normal', 54], ['fat', 18]], [['runner', 66], ['fat', 18]], [['fat', 24], ['runner', 42], ['boss', 1]]] },
  /* 0.26 普通 6～10 关（设计/11_尸潮普通英雄.md）：store 是要超市几级才能打 */
  { coins: 900,  hp: 2.7, store: 3, waves: [[['normal', 54], ['runner', 24]], [['fat', 21], ['normal', 42]], [['runner', 66], ['fat', 18]], [['normal', 60], ['fat', 24], ['miniboss', 1]], [['runner', 54], ['fat', 27], ['miniboss', 2]]] },
  { coins: 1100, hp: 3.1, store: 3, waves: [[['runner', 60], ['normal', 30]], [['fat', 27], ['runner', 42]], [['normal', 72], ['fat', 24]], [['runner', 72], ['fat', 27], ['miniboss', 1]], [['fat', 30], ['normal', 54], ['runner', 30]], [['fat', 27], ['runner', 48], ['boss', 1]]] },
  { coins: 1400, hp: 3.3, store: 4, waves: [[['normal', 66], ['runner', 36]], [['fat', 30], ['runner', 54]], [['normal', 78], ['fat', 30], ['miniboss', 1]], [['runner', 84], ['fat', 30]], [['fat', 36], ['normal', 60], ['miniboss', 2]], [['fat', 33], ['runner', 60], ['boss', 1]]] },
  { coins: 1700, hp: 3.5, store: 4, waves: [[['runner', 78], ['normal', 42]], [['fat', 36], ['normal', 66]], [['runner', 90], ['fat', 33], ['miniboss', 1]], [['normal', 84], ['fat', 39]], [['fat', 42], ['runner', 72], ['miniboss', 2]], [['fat', 39], ['normal', 72], ['miniboss', 2], ['boss', 1]]] },
  { coins: 2200, hp: 3.9, store: 5, waves: [[['normal', 84], ['runner', 48]], [['fat', 42], ['runner', 78]], [['normal', 96], ['fat', 42], ['miniboss', 2]], [['runner', 102], ['fat', 42]], [['fat', 48], ['normal', 84], ['miniboss', 3]], [['fat', 45], ['runner', 84], ['miniboss', 2], ['boss', 1]]] },
];
export const TD_MAX = 10;                             // 普通 10 关（0.26 起）
/* 设计 56：英雄本（尸潮）去掉了，改成传送门进的副本（fb.js） */
export const tdName = lv => `第 ${lv} 关`;
export const tdLevel = lv => TD_LEVELS[lv] || null;
/* 塔：一级直接建好；升 2、3 级要施工（占施工队）。dmg 每发伤害、rate 几秒一发、range 射程、splash 溅射半径、slow 减速比例 */
export const TOWERS = {
  gun:    { name: '机枪塔', build: 300, time: 120, desc: '单体、射得快',           lv: [null, { dmg: 6,  rate: 0.35, range: 5.5 }, { dmg: 9,  rate: 0.32, range: 5.8 }, { dmg: 13, rate: 0.28, range: 6.2 }],
            up: [null, null, { coins: 600, need: {}, time: 1200 }, { coins: 1500, need: { toolbox: 1 }, time: 3600 }] },
  cannon: { name: '炮塔',   build: 600, time: 240, desc: '范围伤害、射得慢',       lv: [null, { dmg: 22, rate: 1.8, range: 6, splash: 1.8 }, { dmg: 32, rate: 1.7, range: 6.3, splash: 2 }, { dmg: 46, rate: 1.6, range: 6.6, splash: 2.2 }],
            up: [null, null, { coins: 1200, need: {}, time: 1800 }, { coins: 3000, need: { toolbox: 1 }, time: 7200 }] },
  slow:   { name: '减速塔', build: 400, time: 180, desc: '范围里的丧尸变慢',       lv: [null, { dmg: 2, rate: 1, range: 4.5, slow: 0.4 }, { dmg: 3, rate: 1, range: 4.8, slow: 0.5 }, { dmg: 4, rate: 1, range: 5.2, slow: 0.6 }],
            up: [null, null, { coins: 800, need: {}, time: 1200 }, { coins: 2000, need: { toolbox: 1 }, time: 3600 }] },
  sniper: { name: '狙击塔', build: 800, time: 300, desc: '射程最远，专打胖子和 Boss', lv: [null, { dmg: 45, rate: 2.2, range: 10 }, { dmg: 70, rate: 2.1, range: 11 }, { dmg: 100, rate: 2, range: 12 }],
            up: [null, null, { coins: 1600, need: {}, time: 1800 }, { coins: 4000, need: { toolbox: 1 }, time: 7200 }] },
};
export const TOWER_IDS = Object.keys(TOWERS);
export const TOWER_SPOTS_N = 6;

/* ================= 员工（幸存者，在拾荒区救回来）================= */
export const STAFF = {
  /* 品质：从低到高。mult 属性倍数，chance 救到的机会，cost 升级花费系数 */
  qual: {
    n: { name: '普通', mult: 1,   chance: 0.70, cost: 1,   color: '#e4e8ee', manage: 4 },   /* 设计 68：3 → 4（超市 5 级 13 台机器，4 个普通工匠正好管完）；精英 3 → 4，史诗 4 → 5，传说 5 → 6 */   // 设计 47：manage 工匠一人管几台机器 / 饲养员一人管几个棚
    e: { name: '精英', mult: 1.3, chance: 0.30, cost: 1.2, color: '#4aa8ff', manage: 4 },
    p: { name: '史诗', mult: 1.7, chance: 0,    cost: 1.5, color: '#c27bff', manage: 5 },
    l: { name: '传说', mult: 2.2, chance: 0,    cost: 2,   color: '#ff9a2e', manage: 6 },
  },
  base: { hp: 120, atk: 5, def: 4 },
  perLv: 0.12,              // 每级属性 +12%
  effPerLv: 0.06,           // 每级干活效率 +6%
  effMach: 0.5,             // 设计 47：工匠管的机器速度、饲养员管的棚产得快 ×（1 + effMach ×（效率 − 1））
  maxLv: [0, 5, 10, 15, 20],                     // 超市等级 → 员工最高等级
  upCost: lv => Math.round(60 * Math.pow(lv, 1.5)),   // 从 lv 升到 lv+1（再乘品质系数）
  perTent: 2, campCap: [0, 2, 4, 8, 11, 12],   // 35b 用户：宿舍 5 级住 12 人；35d 用户：3 级 8 人、4 级 11 人
  food: { food: 1, water: 1 },                   // 每人每天吃的
  cashGap: 1.5,             // 收银员：每 (结账时间 × 1.5 / 效率) 结一位
  farmGap: 3,               // 种地：每 3 秒 / 效率 做一件事（35b 供给模拟：6 秒时 5 级温室有约 20% 的地空着等员工种，改成 3 秒）
  guard: { range: 4.5, rate: 1 },
  /* 派去拾荒（一次只能一个人）：出门 trip 秒，带回 haul × 干活效率 件（±20%）；每件有 seed 机会是种子（进仓库）。
     物资卸在货车旁的物资堆（最多 pile 件，满了就不出门）；回收机排队少于 feedTo 件时自动从堆里拿（给你自己送的留位置）。
     cans：另外再带回几个铁罐、塑料瓶（× 效率），也进物资堆，回收机回收能出 ×3、×10（0.15 用户定：以前是直接带罐头和水进仓库，没法翻倍） */
  scav: { trip: 120, haul: 18,   /* 35b：15 → 18（废电池不够分解机 + 货架一起用） */ street: 0.5, seed: 0, seeds: [11, 15],   /* 设计 52：8～11 → 11～15 */   /* 35b：6～9 → 8～11（5 级口碑 100 每分钟要种约 7 次，原来刚好打平） */ cans: { can: [6, 10], bottle: [6, 11] }   /* 设计 41：铁罐 5～9 → 6～10、瓶子（纯净水）5～9 → 6～11 */, tool: 0.08,   // tool：0.20 每趟有这个机会带回 1 个工具箱
           pile: 100, feedTo: 3 },   // 42：物资堆 60 → 100 件（1 级时员工一趟带回的铁罐、瓶子、破布有 90 多件，堆不下）
  rescue: { chance: 0.4, time: 3, zombies: 2 },
  /* chance 是拾荒区救人的机会：只出普通、精英。史诗、传说只从尸潮来：
     第 3 关第一次打赢送 1 个史诗，第 5 关第一次打赢送 1 个传说；之后 3 关以上每次打赢有小机会再得 */
  td: { first: { 3: 'p', 5: 'l' }, minLv: 3, repeat: { 3: [0.10, 0.02], 4: [0.12, 0.025], 5: [0.14, 0.03], 6: [0.16, 0.04], 7: [0.18, 0.05], 8: [0.20, 0.06], 9: [0.22, 0.07], 10: [0.25, 0.08] } },   // 设计 29b：普通本打赢后得 [史诗, 传说] 员工的机会，关卡越高越大；英雄本不出
  thanks: { n: 40, e: 80, p: 160, l: 300 },      // 营地住满、让新人离开时他留下的谢礼
  names: ['老王', '阿强', '小梅', '大刘', '阿芳', '老陈', '小赵', '胖虎', '阿娟', '老周', '小林', '阿杰', '翠花', '铁柱', '小雨', '老马', '阿宝', '春妮', '大壮', '小七', '老孙', '阿亮', '秀兰', '二狗'],
};
export const STAFF_JOBS = { cash: '收银', farm: '种地', scav: '拾荒',   /* V1.01：不再有「守卫」岗位，尸潮时全员上阵 */ fish: '钓鱼', feed: '饲养', craft: '工匠', rest: '休息' };
/* 0.18 派员工去钓鱼（一次只能一个人，超市 3 级、有垂钓证）：出门 trip 秒，每趟用掉最多 bait 个饵（仓库里哪种多用哪种），
   带回 fish 条（× 干活效率，饵不够按比例少），只出常见～稀有（没有传说），放进仓库；没饵就停着、消息里说一声 */
export const STAFF_FISH = { trip: 150, fish: [28, 42], bait: 4 };   // 设计 41：×2.5（鱼要卖、熏、做罐头、鱼汤）（鱼刚好够卖、熏、做罐头和鱼汤）   // 35b 用户：每趟多带回 25%（9～13 ×1.25）；供给模拟：鱼还是常在底线（熏鱼、鱼罐头、鱼汤都要），一趟 180 → 150 秒   // V1.01 留余量：8～12 → 9～13   // 0.42 工坊熏鱼也要鱼：7～11 → 8～12（设计/15）   // 0.26：每分钟约 3 条，够冰柜卖
/* ================= 主角属性（设计/06_主角属性.md，0.20） =================
   三条线分开升：主角（血量）、M16（伤害、射速）、手雷（伤害、半径、冷却）。射程固定。
   等级上限看超市等级（同员工）；升到 n 级要末日币 100×n + 工具箱（2～10 级 1 个、11～20 级 2 个、21～25 级 3 个）；马上生效 */
export const HERO = {
  cap: [0, 5, 10, 15, 20, 25],
  names: { hp: '主角', dmg: 'M16 伤害', rate: 'M16 射速', range: 'M16 射程', nade: '手雷' },   // V1.01 用户：武器属性分开升级（以前「M16」一条同时加伤害和射速）
  hp: { base: 100, per: 20 },   // 设计 59：血量不能升级了（旧存档返还用这个算）
  hpByStore: [0, 180, 280, 380, 480, 580],   // 设计 59：尸潮里主角血量跟超市等级走（= 以前每级能升到的最高）
  gun: { dmg: 10, dmgK: 0.15, rate: 0.4, rateK: 0.04, range: 7.5, rangePer: 0.15 },   // V1.01：射程 6 → 7.5，每级 +0.15 米（25 级 11.1 米）；分开升以后伤害、射速每级多加一点
  nade: { dmg: 45, dmgPer: 8, r: 2.6, rPer: 0.05, cd: 10, cdPer: 0.15 },
  cost: n => ({ coins: 100 * n, toolbox: n <= 10 ? 1 : n <= 20 ? 2 : 3 }),
  skin: lv => lv >= 20 ? 'gold' : lv >= 10 ? 'camo' : 'black',      // M16 外观：1～9 黑、10 起迷彩、20 起金
};

/* 建造时间倍数（用户 10-12：现阶段是基础玩法，所有升级时间先减半；以后内容多了再调回来）。
   上面表里写的是原来的时间，这里统一乘一次，游戏里所有地方看到的都是乘过的 */
export const BUILD_TIME_K = 0.5;
for (const b of Object.values(BUILD)) for (const l of b.levels) if (l && l.time) l.time = Math.round(l.time * BUILD_TIME_K);
for (const t of Object.values(TOWERS)) for (const l of t.up) if (l && l.time) l.time = Math.round(l.time * BUILD_TIME_K);

/* ================= 0.14 钓鱼区（设计/05_钓鱼.md） =================
   zone：near 近岸 / deep 深水 / bridge 桥下；bait：worm 蚯蚓 / corn 玉米饵 / any 都行；rar：c 常见 u 少见 r 稀有 l 传说 */
export const FISH = {
  crucian:   { name: '鲫鱼',   zone: 'near',   bait: 'worm', rar: 'c', price: 8,   color: 0x8f957e, size: 0.9, m: 'fish' },
  grass:     { name: '草鱼',   zone: 'near',   bait: 'worm', rar: 'c', price: 12,  color: 0x7d8f5a, size: 1.15, m: 'fish' },
  carp:      { name: '鲤鱼',   zone: 'near',   bait: 'worm', rar: 'u', price: 18,  color: 0xd08a4a, size: 1.1, m: 'fish' },
  yellowcat: { name: '黄颡鱼', zone: 'near',   bait: 'worm', rar: 'u', price: 22,  color: 0xd8b24a, size: 0.95, m: 'fish' },
  mandarin:  { name: '鳜鱼',   zone: 'near',   bait: 'worm', rar: 'r', price: 45,  color: 0xa49250, size: 1.0, m: 'fish-large' },
  silver:    { name: '鲢鱼',   zone: 'deep',   bait: 'corn', rar: 'c', price: 14,  color: 0xc8d2dc, size: 1.05, m: 'fish' },
  bighead:   { name: '鳙鱼',   zone: 'deep',   bait: 'corn', rar: 'c', price: 18,  color: 0x7e8590, size: 1.05, m: 'fish-large' },
  perch:     { name: '鲈鱼',   zone: 'deep',   bait: 'corn', rar: 'u', price: 35,  color: 0xa0b0a6, size: 1.0, m: 'fish' },
  blackcarp: { name: '青鱼',   zone: 'deep',   bait: 'corn', rar: 'u', price: 40,  color: 0x3f5163, size: 1.2, m: 'fish-large' },
  yellowcheek: { name: '鳡鱼', zone: 'deep',   bait: 'corn', rar: 'r', price: 70,  color: 0xdcc274, size: 1.3, m: 'fish-large' },
  catfish:   { name: '鲶鱼',   zone: 'bridge', bait: 'worm', rar: 'u', price: 32,  color: 0x5e4e3e, size: 1.2, m: 'fish-large' },
  snakehead: { name: '黑鱼',   zone: 'bridge', bait: 'worm', rar: 'u', price: 40,  color: 0x2e2e30, size: 1.1, m: 'fish-large' },
  sturgeon:  { name: '鲟鱼',   zone: 'bridge', bait: 'corn', rar: 'r', price: 120, color: 0x6c7c8c, size: 1.5, m: 'fish-large' },
  goldking:  { name: '金鱼王', zone: 'bridge', bait: 'any',  rar: 'l', price: 300, color: 0xffb020, size: 1.4, m: 'fish-large' },
};
export const FISH_IDS = Object.keys(FISH);
/* 0.25 守卫的 M16（设计/10_守卫武器.md）：商城买，一人一把，数值和升级花费都照主角 M16（HERO.gun / HERO.cost），等级上限看超市等级 */
export const GUARD_GUN = { price: 800 };
/* 池塘能放几条鱼：下标 = 池塘等级，0 = 还没盖（先放水桶里）；show：池塘里最多同时游几条（多了只显示这么多，保证流畅） */
export const FISHPOND = { cap: [30, 60, 120, 200], show: 30 };   // 设计 41：20/40/80/150 → 30/60/120/200（池塘满了员工钓回来的鱼就丢了）
/* w：出现的权重；diff：拉力条难度（绿区越窄、鱼挣得越猛） */
export const FISH_RAR = { c: { name: '常见', w: 60, diff: 1, color: '#e4e8ee' }, u: { name: '少见', w: 28, diff: 1.3, color: '#4aa8ff' }, r: { name: '稀有', w: 9, diff: 1.65, color: '#c27bff' }, l: { name: '传说', w: 1.2, diff: 2.0, zw: 1.3, color: '#ff9a2e' } };   // zw：绿框宽度再乘（0.18 用户：传说鱼稍微简单一点）
export const FISHING = {
  store: 3, license: 500, boat: 100, farMult: 1.2,                  // 超市 3 级开放；垂钓证、船费；钓鱼区商人贵 20%
  zones: { near: '近岸', deep: '深水', bridge: '桥下' },
  bait: { worm: { name: '蚯蚓', price: 5 }, corn: { name: '玉米饵', price: 8 } }, baitPacks: [[1, 1], [20, 0.8], [100, 0.7]],   // 0.18 加 100 个一包（钓鱼的员工用得多）
  rod: [null, { dur: 30, price: 150, ctrl: 1, rare: 1 }, { dur: 40, price: 300, ctrl: 1.25, rare: 1.5 }, { dur: 50, price: 500, ctrl: 1.5, rare: 2 }],   // ctrl：拉力条好控制多少；rare：少见以上的鱼机会 ×
  snap: 3,                                                          // 拉断线掉几点耐久
};
