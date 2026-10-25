/* ================= 设计 75：模型、图片存在手机里（IndexedDB），以后打开只下载改过的 =================
   - 库 ms_assets，表 files：{ path, hash, blob }（老 Safari 存不了 Blob 时存 { buf, type }）。
   - 清单 = 打包时算好的 HASH（路径 → 内容短 hash）+ SIZE（路径 → 字节数），在 hashlist.js 里。
   - 打开游戏：把库里 hash 对得上的文件都变成 blob 网址（A() 先查这里）；对不上的、清单里没有的删掉；
     基础包缺的先下载（同时 4 个，失败隔 1 秒重试 3 次），下一个存一个（关掉了下次接着下）。
   - 尸潮、副本、钓鱼、_hi 这几包进游戏以后在后台下；没下好的文件照旧从网上读（设计 38 的办法）。
   - 浏览器没有 IndexedDB、打不开、存不进去：自动退回从网上读，不影响玩。
   - game.js、style.css 不放进库（跟着版本号从网上下）。 */
import { HASH, SIZE } from './hashlist.js';

const DB = 'ms_assets', ST = 'files';
const URLS = new Map();          // 路径 → blob 网址（库里有、hash 对得上的）
let db = null, broken = false, storedBytes = 0;
export const blobOf = k => URLS.get(k);
export const dbOK = () => !!db && !broken;
export const storedMB = () => storedBytes / 1048576;

/* 分包：按路径分（副本每个 BOSS 一包，现在只有屠夫 fb1） */
const HOME_PIRATE = /\/(barrel|chest|crate|crate-bottles|flag-pennant|boat-row-small|flag-high-pennant|platform|ship-small)\.glb$/;
export function packOf(p) {
  if (/_hi\.glb$/.test(p)) return 'hi';
  if (/^models\/fb2\//.test(p) || /^img\/fb2\//.test(p)) return 'fb2';
  if (/^models\/fb3\//.test(p) || /^img\/fb3\//.test(p)) return 'fb3';
  if (/^models\/fb4\//.test(p) || /^img\/fb4\//.test(p)) return 'fb4';   /* 设计 114：第 4 关尖啸者 */   /* 设计 102：第 3 关落石巨人 */   /* 设计 81：每个 BOSS 一包（第 2 关毒囊） */
  if (/^models\/fb\//.test(p)) return /portal\.glb$/.test(p) ? 'base' : 'fb1';
  if (/^img\/fb\//.test(p)) return /\/(glow_\w+|vortex)\.jpg$/.test(p) ? 'base' : 'fb1';   // 传送门的光效在院子里就看得到
  if (/^models\/water\/[^/]+\.glb$/.test(p) || (/^models\/pirate\/[^/]+\.glb$/.test(p) && !HOME_PIRATE.test(p))) return 'fish';
  if (/^img\/fx\//.test(p) && !/(cloud|ground_deco|leaves)\./.test(p)) return 'td';
  return 'base';
}
export const PACK_NAME = { base: '基础', td: '尸潮', fb1: '副本·屠夫', fb2: '副本·毒囊', fb3: '副本·落石巨人', fb4: '副本·尖啸者', fish: '钓鱼', hi: '大模型原版' };
export function packList(name) { return Object.keys(HASH).filter(p => packOf(p) === name) }
export function packSize(name) { return packList(name).reduce((a, p) => a + (SIZE[p] || 0), 0) }
/* 这一包下好了几成（0～100）；库不能用时算 100（照旧走网络） */
export function packPct(name) {
  if (!dbOK()) return 100; const l = packList(name); if (!l.length) return 100;
  const tot = l.reduce((a, p) => a + (SIZE[p] || 1), 0), have = l.reduce((a, p) => a + (URLS.has(p) ? SIZE[p] || 1 : 0), 0);
  return Math.floor(have / tot * 100);
}

const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) });
function openDB() {
  return new Promise((res, rej) => {
    let r; try { r = indexedDB.open(DB, 1) } catch (e) { rej(e); return }
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(ST)) r.result.createObjectStore(ST, { keyPath: 'path' }) };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked'));
    setTimeout(() => rej(new Error('timeout')), 8000);
  });
}
const tx = (mode) => db.transaction(ST, mode).objectStore(ST);

/* 打开库，把对得上的文件变成 blob 网址，删掉旧的。返回 { ok, have, files } */
export async function openLib() {
  if (!Object.keys(HASH).length) return { ok: false, why: '开发版（没有清单）' };
  if (typeof indexedDB === 'undefined') return { ok: false, why: '浏览器不支持' };
  try { db = await openDB() } catch (e) { db = null; return { ok: false, why: '打不开：' + ((e && e.message) || e) } }
  try {
    const all = await req(tx('readonly').getAll()), del = [];
    for (const r of all) {
      if (HASH[r.path] && HASH[r.path] === r.hash && (r.blob || r.buf)) {
        const b = r.blob || new Blob([r.buf], { type: r.type || '' });
        URLS.set(r.path, URL.createObjectURL(b)); storedBytes += b.size || SIZE[r.path] || 0;
      } else del.push(r.path);   // 清单里没有了、或者文件改了（hash 不一样）
    }
    if (del.length) { const s = tx('readwrite'); for (const p of del) s.delete(p) }
    return { ok: true, have: URLS.size, removed: del.length };
  } catch (e) { broken = true; return { ok: false, why: '读不出来：' + ((e && e.message) || e) } }
}

async function putFile(path, hash, blob) {
  if (!db || broken) return false;
  try { await req(tx('readwrite').put({ path, hash, blob })); return true } catch (e) {
    /* 老 Safari 存不了 Blob：换成 ArrayBuffer 再试；空间不够（QuotaExceeded）就不存了，退回网络 */
    try { const buf = await blob.arrayBuffer(); await req(tx('readwrite').put({ path, hash, buf, type: blob.type })); return true } catch (e2) {
      if (/quota/i.test(String((e2 && e2.name) || '') + String(e2 && e2.message))) broken = true; return false } }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fetchOne(path, tries = 3) {
  for (let i = 0; ; i++) {
    try { const r = await fetch(path + '?v=' + HASH[path]); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.blob() }
    catch (e) { if (i >= tries) throw e; await sleep(1000) }
  }
}
/* 下载一批（库里没有的），同时 n 个；onProg(下好的字节, 总字节, 下好几个, 一共几个)。返回没下好的个数 */
const busy = new Map();   // 同一个文件同时只下一次（基础包和后台包不会重复下）
export async function fetchList(list, onProg = () => {}, n = 4) {
  const need = list.filter(p => !URLS.has(p)), total = need.reduce((a, p) => a + (SIZE[p] || 0), 0);
  let got = 0, cnt = 0, fail = 0, i = 0; onProg(0, total, 0, need.length);
  const one = async p => {
    try {
      if (!busy.has(p)) busy.set(p, (async () => { const b = await fetchOne(p); await putFile(p, HASH[p], b); if (!URLS.has(p)) { URLS.set(p, URL.createObjectURL(b)); storedBytes += b.size } })().finally(() => busy.delete(p)));
      await busy.get(p); got += SIZE[p] || 0; cnt++;
    } catch (e) { fail++ }
    onProg(got, total, cnt, need.length);
  };
  /* 一个都没下好、已经连着失败 8 个：多半是断网，剩下的不试了（算没下好），马上让玩家选「重试 / 先进游戏」 */
  await Promise.all(Array.from({ length: Math.min(n, need.length) }, async () => { while (i < need.length) { if (!cnt && fail >= 8) { fail += need.length - i; i = need.length; break } await one(need[i++]) } }));
  return { fail, total, cnt, bytes: got };
}
/* 后台下一包（失败不提示，下次再下） */
const packP = {};
export function ensurePack(name) {
  if (!dbOK()) return Promise.resolve(null);
  if (packPct(name) >= 100) return Promise.resolve({ fail: 0 });
  if (!packP[name]) packP[name] = fetchList(packList(name), () => {}, 2).finally(() => { delete packP[name] });
  return packP[name];
}
/* 设置里「清掉重新下载」：删库，刷新网页 */
export async function clearLib() {
  for (const u of URLS.values()) URL.revokeObjectURL(u); URLS.clear(); storedBytes = 0;
  try { if (db) db.close() } catch (e) { /* 关不了也照删 */ }
  db = null;
  await new Promise(r => { try { const q = indexedDB.deleteDatabase(DB); q.onsuccess = q.onerror = q.onblocked = () => r() } catch (e) { r() } });
}
