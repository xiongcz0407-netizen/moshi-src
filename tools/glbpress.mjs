// 设计 38：压 GLB。用法：node tools/glbpress.mjs 源 models 文件夹 输出文件夹（要先装 @gltf-transform/core extensions functions、meshoptimizer、sharp）
// 压 GLB：贴图最大 1024（不透明 → JPG，带透明 → PNG，小于等于 256 的不动），几何体 meshopt（量化 + 压缩），顶点数不变
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { reorder, quantize, prune, dedup } from '@gltf-transform/functions';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs'; import path from 'path';
const [SRC, DST] = process.argv.slice(2);
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const files = []; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push(p) } })(SRC);
let a = 0, b = 0; const rep = [];
for (const f of files) {
  const out = path.join(DST, path.relative(SRC, f)); fs.mkdirSync(path.dirname(out), { recursive: true });
  if (!f.endsWith('.glb')) { fs.copyFileSync(f, out); continue }
  const before = fs.statSync(f).size; a += before;
  try {
    const doc = await io.read(f), root = doc.getRoot();
    const nrm = new Set(root.listMaterials().map(m => m.getNormalTexture()).filter(Boolean));
    for (const t of root.listTextures()) {
      const img = t.getImage(); if (!img) continue;
      const s = sharp(Buffer.from(img)), md = await s.metadata(), st = await s.stats();
      const big = Math.max(md.width, md.height);
      if (big <= 256 && t.getMimeType() === 'image/png') continue;           // Kenney 小色板贴图：不动（JPG 会糊色块边）
      const alpha = md.hasAlpha && !st.isOpaque;
      let p = sharp(Buffer.from(img)); if (big > 1024) p = p.resize({ width: 1024, height: 1024, fit: 'inside' });
      const isN = nrm.has(t);
      const buf = alpha ? await p.png({ compressionLevel: 9, effort: 10 }).toBuffer() : await p.jpeg({ quality: isN ? 90 : 86, mozjpeg: true, chromaSubsampling: isN ? '4:4:4' : '4:2:0' }).toBuffer();
      if (buf.byteLength < img.byteLength || big > 1024) { t.setImage(new Uint8Array(buf)); t.setMimeType(alpha ? 'image/png' : 'image/jpeg'); if (t.getURI()) t.setURI(t.getURI().replace(/\.\w+$/, alpha ? '.png' : '.jpg')) }
    }
    const people = /people[\/\\]|character\.glb|merchant|npc[\/\\]/.test(f);
    const hadTT = root.listExtensionsUsed().some(e => e.extensionName === 'KHR_texture_transform');
    const texJSON = await io.writeBinary(doc);   // 贴图改好的版本，量化不行时从这里重来
    let noreo = false; const pack = async (d, uv) => { await d.transform(prune({ keepAttributes: true }), dedup(), ...(noreo ? [] : [reorder({ encoder: MeshoptEncoder, target: 'size' })]),
      quantize({ pattern: uv ? /^(POSITION|TEXCOORD|JOINTS|WEIGHTS|COLOR)(_\d+)?$/ : /^(POSITION|JOINTS|WEIGHTS|COLOR)(_\d+)?$/, patternTargets: /^(POSITION|TEXCOORD|JOINTS|WEIGHTS|COLOR|NORMAL|TANGENT)(_\d+)?$/,
        quantizePosition: people ? 16 : 14, quantizeNormal: 8, quantizeTexcoord: people ? 14 : 12 }));
      d.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER }); return d };
    let d2; try { d2 = await pack(doc, true) } catch (e) { noreo = true; d2 = await pack(await io.readBinary(texJSON), true); console.log('不重排', path.relative(SRC, f)) }
    /* UV 超出 0～1 时量化要靠 KHR_texture_transform 还原，游戏里换了贴图（人物换皮）就会错位：这种文件 UV 不量化 */
    if (!hadTT && d2.getRoot().listExtensionsUsed().some(e => e.extensionName === 'KHR_texture_transform')) { d2 = await pack(await io.readBinary(texJSON), false); console.log('UV 不量化', path.relative(SRC, f)) }
    await io.write(out, d2);
    let after = fs.statSync(out).size;
    if (after >= before) { fs.copyFileSync(f, out); after = before }
    b += after; rep.push([before, after, path.relative(SRC, f)]);
  } catch (e) { console.log("FAIL", f, e.message, (e.stack||"").split("\n").slice(1,4).join(" | ")); fs.copyFileSync(f, out); b += before }
}
rep.sort((x, y) => y[0] - x[0]);
for (const [x, y, n] of rep.slice(0, 15)) console.log((x / 1048576).toFixed(2), '->', (y / 1048576).toFixed(2), 'MB', n);
console.log('GLB 合计', (a / 1048576).toFixed(1), '->', (b / 1048576).toFixed(1), 'MB');
