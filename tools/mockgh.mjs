/* 模拟 GitHub 内容接口（只在本地测试云存档用）：node tools/mockgh.mjs 端口 */
import http from 'http'; import crypto from 'crypto';
const files = new Map(); const port = +process.argv[2] || 8799, delay = +process.argv[3] || 0;   // 第二个参数：每个请求故意慢多少毫秒（模拟真实网络）
const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }); res.end(obj ? JSON.stringify(obj) : '') };
http.createServer((req, res) => { setTimeout(() => handle(req, res), delay) }).listen(port, () => console.log('mock gh on', port, 'delay', delay));
function handle(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204);
  const m = /\/repos\/[^/]+\/[^/]+\/contents\/([^?]+)/.exec(req.url); if (!m) return send(res, 404, { message: 'no' });
  const p = decodeURIComponent(m[1]); let body = '';
  req.on('data', c => body += c); req.on('end', () => {
    if (req.headers.authorization !== 'Bearer TESTTOKEN') return send(res, 401, {});
    const f = files.get(p);
    if (req.method === 'GET') return f ? send(res, 200, { sha: f.sha, content: f.content }) : send(res, 404, {});
    const b = body ? JSON.parse(body) : {};
    if (req.method === 'PUT') { if (f && b.sha !== f.sha) return send(res, 409, {}); const sha = crypto.randomBytes(8).toString('hex'); files.set(p, { sha, content: b.content });
      console.log('PUT', p); return send(res, f ? 200 : 201, { content: { sha } }) }
    if (req.method === 'DELETE') { files.delete(p); console.log('DEL', p); return send(res, 200, {}) }
    send(res, 405, {});
  });
}
