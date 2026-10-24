// 设计 81：破铁桥四个角的亮绿小草调暗调黄（贴图里饱和的亮绿 → 暗黄褐）。用法：node tools/tint_grass.mjs 源.glb 出.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
const [SRC, DST] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(SRC);
let n = 0, tot = 0;
for (const t of doc.getRoot().listTextures()) {
  const img = t.getImage(); if (!img) continue;
  const { data, info } = await sharp(Buffer.from(img)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i], g = data[i + 1], b = data[i + 2]; tot++;
    if (g > 55 && g > r * 1.06 && g > b * 1.3) {   // 亮绿
      const l = (r + g + b) / 3, k = Math.min(1, (g - Math.max(r, b)) / 25);
      const nr = l * 1.05, ng = l * 0.95, nb = l * 0.6;   // 暗黄褐（枯草）
      data[i] = r + (nr * 0.85 - r) * k; data[i + 1] = g + (ng * 0.85 - g) * k; data[i + 2] = b + (nb * 0.85 - b) * k; n++;
    }
  }
  t.setImage(new Uint8Array(await sharp(data, { raw: info }).jpeg({ quality: 88 }).toBuffer())); t.setMimeType('image/jpeg');
}
await io.write(DST, doc); console.log('改了', n, '/', tot, '个像素');
