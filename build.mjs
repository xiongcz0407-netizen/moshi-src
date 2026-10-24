/* 打包：node build.mjs 输出目录 [令牌]
   把 src/ 打成一个 game.js（含 three.js），复制页面、样式、图片，写 version.json。
   给了令牌就打乱后写进云端存档配置；不给就是本机存档版（开发测试用）。 */
import { build } from 'esbuild';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import crypto from 'crypto';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(process.argv[2] || '/tmp/moshi_out'), TOK = process.argv[3] || '';
const CFG = { owner: 'xiongcz0407-netizen', repo: 'fanwang-saves', dir: 'moshi/', ...(process.env.GH_API ? { api: process.env.GH_API } : {}) };   // 存档和王爷那款放同一个私有仓库，各用各的文件夹
const V = +(/APP_V = (\d+)/.exec(fs.readFileSync(path.join(ROOT, 'src/js/version.js'), 'utf8'))[1]);
/* 设计 38：模型、图片按文件内容算短 hash，网址写成 xxx?v=hash；文件没改过网址就不变，手机用缓存（只有 game.js、style.css 跟着版本号） */
const HASH = {}, SIZE = {};   /* 设计 75：再记每个文件多大（手机资源库的清单） */
for (const top of ['img', 'models']) (function walk(d) { for (const f of fs.readdirSync(path.join(ROOT, 'src', d))) { const r = d + '/' + f, p = path.join(ROOT, 'src', r);
  if (fs.statSync(p).isDirectory()) walk(r); else { HASH[r] = crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 8); SIZE[r] = fs.statSync(p).size } } })(top);
const hashRefs = t => t.replace(/((?:img|models)\/[\w\-./]+?\.(?:png|jpg|jpeg|webp|glb|json))(\?v=[\w_]+)?/g, (m, p) => HASH[p] ? p + '?v=' + HASH[p] : m);

fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
/* 令牌写 @INJECT 时留一个占位符，由用户电脑上的打包步骤把真正的（已打乱的）令牌填进去，令牌不经过云端 */
const k = TOK === '@INJECT' ? '@@GHK@@' : TOK ? Buffer.from(TOK).toString('base64').split('').reverse().join('') : '';
const cfg = `export const GH_SAVE = ${JSON.stringify({ ...CFG, k: TOK ? k : '' })};`;
await build({
  entryPoints: [path.join(ROOT, 'src/js/boot.js')], bundle: true, minify: true, format: 'iife', target: ['safari14'],
  outfile: path.join(OUT, 'game.js'), legalComments: 'none',
  plugins: [{ name: 'ghcfg', setup(b) { b.onLoad({ filter: /ghcfg\.js$/ }, () => ({ contents: cfg, loader: 'js' }));
    /* 设计 33：哪些物品有图标图片（新商品的图标没做好之前用色块） */
    b.onLoad({ filter: /hashlist\.js$/ }, () => ({ contents: `export const HASH = ${JSON.stringify(HASH)}; export const SIZE = ${JSON.stringify(SIZE)};`, loader: 'js' }));
    b.onLoad({ filter: /iconlist\.js$/ }, () => ({ contents: `export const ICONS = new Set(${JSON.stringify(fs.readdirSync(path.join(ROOT, 'src/img/icons')).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)))});`, loader: 'js' })) } }],
});
fs.writeFileSync(path.join(OUT, 'index.html'), hashRefs(fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8')).replaceAll('__V__', V));
fs.writeFileSync(path.join(OUT, 'style.css'), hashRefs(fs.readFileSync(path.join(ROOT, 'src/style.css'), 'utf8')));
fs.cpSync(path.join(ROOT, 'src/img'), path.join(OUT, 'img'), { recursive: true });
fs.cpSync(path.join(ROOT, 'src/models'), path.join(OUT, 'models'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'version.json'), JSON.stringify({ v: V }) + '\n');
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
const kb = f => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + ' KB';
console.log(`已打包到 ${OUT}　版本 ${V}　game.js ${kb('game.js')}　云端存档：${TOK ? '开' : '关（本机存档）'}`);
