/* ================= 主角外观：创建人物时选的样子 =================
   设计 18v：男女都用新模型：发型（hs）+ 发色（hc / hc2）+ 套装（outfit），衣服不换色。男女只决定默认搭配（hero2.js 的 DEF_LOOK）。
   3D 模型的脸、发型、衣服款式是做死的，所以头像也固定用和 3D 接近的发型、黑眼睛、T 恤（FIXED），保证两边一样。 */
export const FIXED = { style: 1, eye: 1, mouth: 0, shirtStyle: 1 };
export const LOOK = {
  sex: [{ id: 'm', name: '男' }, { id: 'f', name: '女' }],
  /* 肤色：按 Modular 包的 8 种肤色，从浅到深排；hex 是 3D 用的颜色 */
  skin: [{ t: 3, hex: 0xf3d9bd }, { t: 1, hex: 0xf0cfa4 }, { t: 2, hex: 0xe6c08e }, { t: 4, hex: 0xd2a774 }, { t: 5, hex: 0xc39761 }, { t: 6, hex: 0xb08654 }, { t: 7, hex: 0x987246 }, { t: 8, hex: 0x7e5f38 }],
  hair: [{ c: 'black', hex: 0x2e2c2c, name: '黑' }, { c: 'brown1', hex: 0x5e432f, name: '棕' }, { c: 'brown2', hex: 0x55493f, name: '深棕' }, { c: 'red', hex: 0xb8704a, name: '红' }, { c: 'blonde', hex: 0xc9ac78, name: '金' }, { c: 'tan', hex: 0xc4b89e, name: '浅金' }, { c: 'grey', hex: 0x8a8a8a, name: '灰' }, { c: 'white', hex: 0xd8d8d8, name: '白' }],
  shirt: [{ c: 'red', hex: 0xd9583f }, { c: 'blue', hex: 0x3b8fd0 }, { c: 'green', hex: 0x5ea845 }, { c: 'yellow', hex: 0xf0c020 }, { c: 'pine', hex: 0x179880 }, { c: 'navy', hex: 0x34495e }, { c: 'grey', hex: 0x95a5a6 }, { c: 'white', hex: 0xe8e8e8 }],
  pants: [{ hex: 0x34404f }, { hex: 0x3b5b8a }, { hex: 0x2a2a2a }, { hex: 0x6b5a45 }, { hex: 0xa08a6a }, { hex: 0x4f5e3a }],
  styles: { m: [1, 2, 3, 4, 5, 6], f: [1, 2, 3, 4, 5, 6] },
  eyes: ['Brown', 'Black', 'Blue', 'Green', 'Pine'],
  mouth: ['happy', 'glad', 'straight', 'oh', 'teethLower'],
  shirtStyle: [1, 2, 3, 4, 5, 6, 7, 8],
};
/* 发型 hs、套装 outfit 留空 = 按男女的默认（男发型1 + 蓝套装 / 女发型1 + 粉套装） */
export const defaultLook = (sex = 'm') => ({ sex, hc: 2, hc2: -1, hs: '', outfit: '', ...FIXED });
const OLD_KEYS = ['skin', 'hair', 'shirt', 'pants', 'shoes'];   // 旧模型的肤色、发色、上衣、裤子（设计 18q / 18v 以后不用了）
/* 读档 / 改外观时清理：去掉旧版存的颜色；缺的补默认 */
export function cleanLook(l) {
  const o = { ...(l || defaultLook()) };
  if (o.sex !== 'f') o.sex = 'm';
  for (const k of OLD_KEYS) delete o[k];
  if (o.hc == null) o.hc = 2; if (o.hc2 == null) o.hc2 = -1; if (typeof o.hs !== 'string') o.hs = ''; if (typeof o.outfit !== 'string') o.outfit = '';
  return o;
}
export function randomLook(sex = Math.random() < 0.5 ? 'm' : 'f') {
  const r = n => Math.floor(Math.random() * n);
  return { sex, ...FIXED, hc: r(14), hc2: Math.random() < 0.3 ? r(14) : -1, hs: '', outfit: '' };   // 发型、套装由创建人物页的随机来挑
}
