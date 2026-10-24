/* 打包 GM 网页：node tools/gm/build.mjs 输出文件 [@INJECT]
   打成一个 gm.html（脚本、样式都在里面），双击用浏览器打开。只放用户电脑上，不发布。
   令牌：写 @INJECT 时留占位符 @@GHK@@，由用户电脑上的步骤填进去（和 game.js 一样，令牌不经过云端）。 */
import { build } from 'esbuild';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.resolve(process.argv[2] || '/tmp/gm.html'), TOK = process.argv[3] || '';
const CFG = { owner: 'xiongcz0407-netizen', repo: 'fanwang-saves', dir: 'moshi/', k: TOK === '@INJECT' ? '@@GHK@@' : '' };
const r = await build({ entryPoints: [path.join(ROOT, 'tools/gm/gm.js')], bundle: true, minify: true, format: 'iife', target: ['chrome100', 'safari15'], write: false, legalComments: 'none' });
const js = r.outputFiles[0].text.replaceAll('</script', '<\\/script');
const css = `
:root{--bg:#f6e3b4;--card:#fff6dc;--ink:#3b2412;--line:#c98d4b;--good:#3d8b3d;--bad:#c0392b;--warn:#c77a12}
*{box-sizing:border-box}body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
h1{margin:0 0 8px;font-size:22px}h2{margin:16px 0 4px;font-size:18px}
button{font:inherit;padding:4px 12px;border:2px solid var(--line);border-radius:8px;background:#f0b860;color:var(--ink);cursor:pointer;font-weight:700}
button:hover{filter:brightness(1.05)}button.main{background:var(--good);color:#fff;border-color:#2b6a2b;padding:8px 28px;font-size:17px}
table{border-collapse:collapse;width:100%;background:var(--card);border:2px solid var(--line)}th,td{border:1px solid #e3c08c;padding:6px 8px;text-align:left;vertical-align:top}
td small{display:block;color:#7a5a3a;font-size:12px;margin-top:2px}
.msg{margin:8px 0;padding:6px 10px;border-radius:8px;background:var(--card)}.msg.bad{background:#f8d7d3;color:var(--bad)}.msg.good{background:#d9efd2;color:var(--good)}
.state{padding:8px 12px;border-radius:8px;font-weight:700}.state.off{background:#d9efd2;color:var(--good)}.state.on{background:#f8d7d3;color:var(--bad)}.state.warn{background:#fbe6c4;color:var(--warn)}
fieldset{border:2px solid var(--line);border-radius:10px;background:var(--card);margin:10px 0}legend{font-weight:800;padding:0 6px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:6px 14px}
label{display:flex;align-items:center;gap:6px}label span{flex:1}label em{font-size:11px;color:#9a7a5a;width:44px;font-style:normal}
input{width:90px;font:inherit;padding:2px 6px;border:2px solid #d8b07a;border-radius:6px;background:#fff}input.changed{border-color:var(--good);background:#e6f6df}input.bad{border-color:var(--bad)}
.note{font-size:13px;color:#7a5a3a}h3{margin:10px 0 4px;font-size:16px}table.gt{width:auto;min-width:60%}table.gt td,table.gt th{padding:4px 8px}table.gt label{gap:4px}input.st{width:60px}.addrow{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin:6px 0}select{font:inherit;padding:2px 6px;border:2px solid #d8b07a;border-radius:6px;background:#fff;max-width:100%}.bad{color:var(--bad)}button[disabled]{opacity:.45;cursor:not-allowed}.logbox{max-height:340px;overflow:auto}#gmsg:empty{display:none}.bar{position:sticky;bottom:0;background:var(--bg);padding:10px 0;border-top:2px solid var(--line)}#chg{margin-left:10px;color:#7a5a3a}`;
const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>末世超市 GM</title><style>${css}</style></head>
<body><h1>末世超市 GM</h1><p><button data-users>刷新玩家列表</button> <small class="note">只放在你电脑上，别发给别人（里面有存档仓库的令牌）。每次保存前会自动备份原存档。</small></p>
<div id="msg" class="msg"></div><div id="list"></div><div id="edit"></div>
<script>window.GM_CFG=${JSON.stringify(CFG)};</script><script>${js}</script></body></html>`;
fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, html);
console.log('GM 网页已打包到', OUT, (html.length / 1024).toFixed(0) + ' KB');
