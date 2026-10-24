import { perfOpt } from './perf.js';
/* 设计 38：国内加载慢
   - 模型、图片的网址带文件内容的短 hash（?v=xxxxxxxx，打包时算），文件没改过网址就不变，手机直接用缓存；只有 game.js、style.css 跟着版本号。
   - 所有 three.js 的读取（GLTFLoader、TextureLoader、GLB 里引用的贴图）都走 DefaultLoadingManager，这里统一加 hash；
     HTML 里的图片（图标、按钮）用 A() 包一下。
   - GLB 用 meshopt 压缩过（EXT_meshopt_compression + 顶点量化），读的时候要解码器；
     读进来以后把量化的顶点数据换回浮点（defloat），合并静态模型、改几何体的代码照旧能用。 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { HASH } from './hashlist.js';
import { blobOf } from './assetdb.js';

/* 设计 75：手机资源库里有的，换成库里的 blob 网址；没有的照旧走网络（带 ?v=） */
export const A = p => { if (!p || /^(data|blob|https?):/.test(p)) return p; const k = p.replace(/^\.\//, '').split('?')[0], b = blobOf(k); if (b) return b; const h = HASH[k]; return h ? k + '?v=' + h : p };
THREE.DefaultLoadingManager.setURLModifier(u => A(u));
try { performance.setResourceTimingBufferSize(3000) } catch (e) { /* 默认只记 250 个文件，我们要读 400 多个 */ }

/* 量化过的顶点属性（Int8/Int16 归一化）换回 Float32：合并几何体、applyMatrix4 不会被截到 [-1, 1] */
const FLOATS = ['position', 'normal', 'uv', 'uv1', 'tangent', 'color'];
export function defloat(root) {
  const seen = new Set();
  root.traverse(o => {
    if (!o.isMesh || !o.geometry || seen.has(o.geometry)) return; seen.add(o.geometry);
    const g = o.geometry;
    for (const n of FLOATS) {
      const a = g.attributes[n]; if (!a || (a.array instanceof Float32Array && !a.isInterleavedBufferAttribute)) continue;
      const s = a.itemSize, f = new Float32Array(a.count * s), get = [a.getX, a.getY, a.getZ, a.getW];
      for (let i = 0; i < a.count; i++) for (let c = 0; c < s; c++) f[i * s + c] = get[c].call(a, i);
      g.setAttribute(n, new THREE.BufferAttribute(f, s));
    }
  });
  return root;
}
/* 读一个 GLB（带 meshopt 解码器），读好以后 defloat */
export function gltfLoader() { return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder) }
/* 设计 57：减了一半面的大模型（减速塔 3 级、甜品机 3 级、烘干机 1 级、院子商人、主角）；性能小窗关掉「大模型减面」就读原来的（*_hi.glb） */
const LOD_HI = /(ws\/(jiansuta-3|tianpinji-3|honganji-1)|merchant|people\/hero_m2)\.glb/;
export async function loadGLB(url, L = gltfLoader()) { if (!perfOpt('lod') && LOD_HI.test(url)) url = url.replace(/\.glb/, '_hi.glb'); const g = await L.loadAsync(url); defloat(g.scene); return g }

/* 设计 38：这次加载下了多少（浏览器记的每个文件实际传输的字节，用缓存的算 0） */
export function netStat() {
  let b = 0, n = 0, c = 0;
  try { for (const e of performance.getEntriesByType('resource')) { n++; b += e.transferSize || 0; if (!e.transferSize && e.decodedBodySize) c++ } } catch (e) { /* 老浏览器没有 */ }
  return { mb: b / 1048576, n, cached: c };
}

/* 设计 38：进游戏以后才用的图（尸潮特效），加载时不下载，进了游戏再下载（先给一张空贴图，图到了自动换上） */
const lazyQ = []; let lazyGo = false;
export function lazyTex(url) {
  /* 设计 74：读失败隔 1 秒再试一次 */
  const t = new THREE.Texture(), run = (k = 0) => new THREE.ImageLoader().load(url, im => { t.image = im; t.needsUpdate = true }, undefined, () => { if (k < 1) setTimeout(() => run(k + 1), 1000) });
  if (lazyGo) run(); else lazyQ.push(run); return t;
}
export function startLazy() { lazyGo = true; lazyQ.splice(0).forEach(f => f()) }
