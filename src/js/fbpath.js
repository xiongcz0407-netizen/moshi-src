/* ================= 设计 83：会走动的 BOSS 找路（通用，跟设计81「每关一份配置」一起用） =================
   场地按 0.5 米一格：掩体按 BOSS 的找路半径往外胀、场地边按找路半径收进来，标成走不了；8 方向 A*（斜着走不能擦掩体的角）。
   要去的那格走不到（主角贴墙躲在掩体后面）→ 去「离主角最近、走得到」的那格。
   路找好以后挑「直线看得到的最远的路点」当下一步（不在格子上走锯齿）。纯逻辑，没有 three.js。 */
const CELL = 0.5;
export function makeGrid(arena, covers, r) {
  const x0 = arena.x0, z0 = arena.z0, nx = Math.ceil((arena.x1 - x0) / CELL), nz = Math.ceil((arena.z1 - z0) / CELL);
  const free = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + (i + 0.5) * CELL, z = z0 + (j + 0.5) * CELL;
    let ok = x > arena.x0 + r - 1e-6 && x < arena.x1 - r + 1e-6 && z > arena.z0 + r - 1e-6 && z < arena.z1 - r + 1e-6;
    if (ok) for (const c of covers) { const dx = Math.max(0, Math.abs(x - c.x) - c.hx), dz = Math.max(0, Math.abs(z - c.z) - c.hz); if (dx * dx + dz * dz < r * r) { ok = false; break } }
    free[j * nx + i] = ok ? 1 : 0;
  }
  return { x0, z0, nx, nz, free, r, key: `${arena.x0},${arena.x1},${arena.z0},${arena.z1},${covers.map(c => c.x + ':' + c.z).join(',')}` };
}
const cellOf = (G, x, z) => [Math.max(0, Math.min(G.nx - 1, Math.floor((x - G.x0) / CELL))), Math.max(0, Math.min(G.nz - 1, Math.floor((z - G.z0) / CELL)))];
const ctr = (G, i, j) => ({ x: G.x0 + (i + 0.5) * CELL, z: G.z0 + (j + 0.5) * CELL });
const isFree = (G, i, j) => i >= 0 && j >= 0 && i < G.nx && j < G.nz && G.free[j * G.nx + i] === 1;
/* 两点之间直线能不能走（每 0.25 米看一格） */
export function lineFree(G, a, b) {
  const L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(L / 0.25));
  for (let k = 0; k <= n; k++) { const t = k / n, [i, j] = cellOf(G, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t); if (!isFree(G, i, j)) return false }
  return true;
}
/* 最近的空格（BOSS 自己被挤进不能走的格子时用） */
function nearestFree(G, i0, j0) {
  if (isFree(G, i0, j0)) return [i0, j0];
  for (let r = 1; r < 12; r++) { let best = null, bd = 1e9; for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; const i = i0 + di, j = j0 + dj; if (isFree(G, i, j)) { const d = di * di + dj * dj; if (d < bd) { bd = d; best = [i, j] } } } if (best) return best }
  return [i0, j0];
}
/* A*：从 a 到 b。走不到 b 时去离 b 最近、走得到的格子。返回 { pts（世界坐标路点，含终点）, reach（能不能到 b 那格）} */
export function findPath(G, a, b) {
  const [si, sj] = nearestFree(G, ...cellOf(G, a.x, a.z)), [ti, tj] = cellOf(G, b.x, b.z), N = G.nx * G.nz, S = sj * G.nx + si;
  const g = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const open = [S]; g[S] = 0; const h = k => Math.hypot((k % G.nx) - ti, Math.floor(k / G.nx) - tj);
  let best = S, bestH = h(S), goal = isFree(G, ti, tj) ? tj * G.nx + ti : -1;
  while (open.length) {
    let bi = 0; for (let q = 1; q < open.length; q++) if (g[open[q]] + h(open[q]) < g[open[bi]] + h(open[bi])) bi = q;
    const k = open[bi]; open[bi] = open[open.length - 1]; open.pop(); if (closed[k]) continue; closed[k] = 1;
    const hk = h(k); if (hk < bestH) { bestH = hk; best = k }
    if (k === goal) break;
    const i = k % G.nx, j = (k - i) / G.nx;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const ni = i + di, nj = j + dj; if (!isFree(G, ni, nj)) continue;
      if (di && dj && (!isFree(G, i + di, j) || !isFree(G, i, j + dj))) continue;   // 斜着走不能擦角
      const nk = nj * G.nx + ni, ng = g[k] + (di && dj ? 1.4142 : 1); if (ng < g[nk]) { g[nk] = ng; from[nk] = k; open.push(nk) }
    }
  }
  const end = goal >= 0 && closed[goal] ? goal : best, cells = [];
  for (let k = end; k >= 0; k = from[k]) cells.push(k);
  cells.reverse();
  const pts = cells.map(k => ctr(G, k % G.nx, Math.floor(k / G.nx)));
  if (end === goal) pts[pts.length - 1] = { x: b.x, z: b.z };
  return { pts, reach: end === goal };
}
/* 下一步：路上「从 a 直线看得到」的最远那个点 */
export function nextPoint(G, a, pts) {
  let nxt = pts[Math.min(1, pts.length - 1)] || a;
  for (let k = pts.length - 1; k >= 1; k--) if (lineFree(G, a, pts[k])) { nxt = pts[k]; break }
  return nxt;
}
/* 设计 83 第 4 条：掩体摆放检查——任意两个掩体之间、掩体和场地边之间的缝，要么 ≥ BOSS 宽 + 0.6（能过），要么 ≤ 主角宽（谁都过不去）。返回不合格的缝 */
export function gapCheck(arena, covers, bossW, playerW) {
  const bad = [], all = [];
  const gapRect = (a, b) => { const dx = Math.max(0, Math.abs(a.x - b.x) - a.hx - b.hx), dz = Math.max(0, Math.abs(a.z - b.z) - a.hz - b.hz); return Math.hypot(dx, dz) };
  for (let i = 0; i < covers.length; i++) {
    const c = covers[i];
    for (const [nm, g] of [['左墙', c.x - c.hx - arena.x0], ['右墙', arena.x1 - c.x - c.hx], ['北边', c.z - c.hz - arena.z0], ['南边', arena.z1 - c.z - c.hz]]) all.push({ a: c.k, b: nm, g });
    for (let j = i + 1; j < covers.length; j++) all.push({ a: c.k, b: covers[j].k, g: gapRect(c, covers[j]) });
  }
  for (const o of all) { o.g = +o.g.toFixed(2); o.ok = o.g >= bossW + 0.6 - 1e-6 || o.g <= playerW + 1e-6; if (!o.ok) bad.push(o) }
  return { all, bad };
}
