/* 设计 75：开局检查资源（在 main.js 之前跑：boot.js 先等这里检查完、缺的下好，再读 main.js——
   所以 main.js 一开始建场景时读的贴图、模型就已经能从手机资源库里拿了）。只用到 assetdb.js，不读 three.js */
import * as AD from './assetdb.js';
const $ = s => document.querySelector(s);
/* ---------- 设计 75：开局检查资源（登录界面之前）：库里没有、改过的下载，进度条写下了多少 ---------- */
export const ASSET = { ok: false, why: '', first: false, cnt: 0, bytes: 0, base: 0 };
export const mbT = b => (b / 1048576).toFixed(1);
export async function assetCheck() {
  const r = await AD.openLib(); ASSET.ok = r.ok; ASSET.why = r.why || '';
  if (!r.ok) { console.warn('[设计75] 手机资源库不能用，照旧从网上读：', r.why); return }
  const list = AD.packList('base'); ASSET.first = AD.packPct('base') < 70; ASSET.base = AD.packSize('base');   /* 基础包还差三成以上（第一次、或第一次没下完）就写「下载资源」 */
  const bar = $('#lbarI'), txt = $('#ltxt');
  for (;;) {
    const res = await AD.fetchList(list, (b, t, c, n) => { if (!n) return; bar.style.width = (t ? b / t * 100 : 100).toFixed(1) + '%';
      txt.textContent = ASSET.first ? `第一次打开，下载资源 ${mbT(b)} / ${mbT(t)} MB` : `更新资源 ${c} / ${n} 个文件（${mbT(b)} / ${mbT(t)} MB）` });
    ASSET.cnt += res.cnt; ASSET.bytes += res.bytes;
    if (!res.fail) break;
    txt.textContent = `网络不好，还有 ${res.fail} 个文件没下好`; $('#lbtns').classList.remove('hidden');
    const c = await new Promise(ok => { $('#lRetry').onclick = () => ok('retry'); $('#lSkip').onclick = () => ok('skip') });
    $('#lbtns').classList.add('hidden'); if (c === 'skip') break;   // 先进游戏：没下好的照旧边玩边从网上读
  }
  if (ASSET.cnt && !ASSET.first) { bar.style.width = '100%'; txt.textContent = `更新了 ${ASSET.cnt} 个文件（${ASSET.bytes < 104858 ? Math.max(1, Math.round(ASSET.bytes / 1024)) + ' KB' : mbT(ASSET.bytes) + ' MB'}）`; await new Promise(r => setTimeout(r, 900)) }
  bar.style.width = '0%'; txt.textContent = '正在加载…';
  patchDom();
}
/* 网页里写死的图片（index.html 的 <img>、行内样式、style.css 的 url()）换成库里的 blob 网址 */
function patchDom() {
  const swap = s => s.replace(/url\((["']?)([^"')]*?((?:img|models)\/[^"')?]+))(\?v=\w+)?\1\)/g, (m, q, all, p) => { const b = AD.blobOf(p); return b ? `url("${b}")` : m });
  for (const im of document.querySelectorAll('img[src]')) { const p = im.getAttribute('src').split('?')[0].replace(/^\.\//, ''), b = AD.blobOf(p); if (b) im.src = b }
  for (const el of document.querySelectorAll('[style*="url("]')) el.setAttribute('style', swap(el.getAttribute('style')));
  const walk = rules => { for (const r of rules) { if (r.style && r.style.cssText.includes('url(')) { const v = r.style.cssText, nv = swap(v); if (nv !== v) r.style.cssText = nv }   /* 整条换（拆成单项再设，像 background 这种会多出个 initial，设不进去） */ if (r.cssRules) walk(r.cssRules) } };
  for (const sh of document.styleSheets) { let rs = null; try { rs = sh.cssRules } catch (e) { /* 别的网站的样式表读不了 */ } if (rs) walk(rs) }
}
