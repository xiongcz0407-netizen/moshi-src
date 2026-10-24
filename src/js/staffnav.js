/* 0.43 员工走路找路：以前员工离得远（> 22 米）或者要进超市 / 工坊时直接「闪现」过去，用户要真的走过去。
   把院子 + 牧场铺成 0.4 米的格子，碰撞盒（墙、围栏、货柜、机器……）占的格子不能走（往外多留半个人宽），
   A* 找格子路，再拉直（两点之间看得见就直接连），员工沿着这些点走。 */
const CELL = 0.4, R = 0.38;

export function createNav(bounds) {
  const { x0, z0 } = bounds, W = Math.ceil((bounds.x1 - x0) / CELL), H = Math.ceil((bounds.z1 - z0) / CELL);
  let grid = new Uint8Array(W * H), builtAt = -1e9;
  const ci = x => Math.floor((x - x0) / CELL), cj = z => Math.floor((z - z0) / CELL);
  const cxw = i => x0 + (i + 0.5) * CELL, czw = j => z0 + (j + 0.5) * CELL;
  function build(boxes) {
    grid = new Uint8Array(W * H);
    for (const b of boxes) {
      if (b.hw !== undefined) {   // 斜矩形
        const ext = Math.hypot(b.hw, b.hd) + R;
        for (let j = Math.max(0, cj(b.cz - ext)); j <= Math.min(H - 1, cj(b.cz + ext)); j++) for (let i = Math.max(0, ci(b.cx - ext)); i <= Math.min(W - 1, ci(b.cx + ext)); i++) {
          const dx = cxw(i) - b.cx, dz = czw(j) - b.cz, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
          if (Math.abs(lx) < b.hw + R && Math.abs(lz) < b.hd + R) grid[j * W + i] = 1 }
        continue }
      if (b.x0 === b.x1 && b.z0 === b.z1) continue;
      for (let j = Math.max(0, cj(b.z0 - R)); j <= Math.min(H - 1, cj(b.z1 + R)); j++) for (let i = Math.max(0, ci(b.x0 - R)); i <= Math.min(W - 1, ci(b.x1 + R)); i++) {
        const px = cxw(i), pz = czw(j); if (px > b.x0 - R && px < b.x1 + R && pz > b.z0 - R && pz < b.z1 + R) grid[j * W + i] = 1 }
    }
  }
  const free = (i, j) => i >= 0 && j >= 0 && i < W && j < H && !grid[j * W + i];
  /* 起点 / 终点在挡着的格子里（站在门边、机器边上）：找最近的空格 */
  function nearFree(i, j) {
    if (free(i, j)) return [i, j];
    for (let r = 1; r < 8; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (Math.max(Math.abs(di), Math.abs(dj)) === r && free(i + di, j + dj)) return [i + di, j + dj];
    return null;
  }
  function sight(ax, az, bx, bz) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL * 0.5));
    for (let k = 1; k < n; k++) { const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n; if (!free(ci(x), cj(z))) return false }
    return true;
  }
  /* 小顶堆 */
  function astar(s, g) {
    const N = W * H, G = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = [], hf = [];
    const push = (n, f) => { heap.push(n); hf.push(f); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= hf[k]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; [hf[p], hf[k]] = [hf[k], hf[p]]; k = p } };
    const pop = () => { const top = heap[0], ln = heap.pop(), lf = hf.pop(); if (heap.length) { heap[0] = ln; hf[0] = lf; let k = 0; for (;;) { const a = 2 * k + 1, b = a + 1; let m = k; if (a < heap.length && hf[a] < hf[m]) m = a; if (b < heap.length && hf[b] < hf[m]) m = b; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; [hf[m], hf[k]] = [hf[k], hf[m]]; k = m } } return top };
    const gi = g % W, gj = (g / W) | 0, h = n => { const dx = Math.abs(n % W - gi), dz = Math.abs(((n / W) | 0) - gj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz) };
    G[s] = 0; push(s, h(s));
    let guard = 0;
    while (heap.length && guard++ < 60000) {
      const n = pop(); if (closed[n]) continue; closed[n] = 1; if (n === g) break;
      const i = n % W, j = (n / W) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { if (!di && !dj) continue; const a = i + di, b = j + dj; if (!free(a, b)) continue;
        if (di && dj && (!free(i + di, j) || !free(i, j + dj))) continue;   // 斜着走不切墙角
        const m = b * W + a, c = G[n] + (di && dj ? 1.414 : 1); if (c < G[m]) { G[m] = c; from[m] = n; push(m, c + h(m)) } }
    }
    if (from[g] < 0 && g !== s) return null;
    const out = []; for (let n = g; n !== -1; n = from[n]) out.push(n); return out.reverse();
  }
  return {
    /* boxes：现在所有挡路的盒子；每次找路前最多 2 秒重铺一次格子（门开关、货柜挪了都会跟着变） */
    path(a, b, boxes, now) {
      if (now - builtAt > 2) { build(boxes); builtAt = now }
      const s = nearFree(ci(a.x), cj(a.z)), g = nearFree(ci(b.x), cj(b.z)); if (!s || !g) return null;
      const cells = astar(s[1] * W + s[0], g[1] * W + g[0]); if (!cells) return null;
      const pts = cells.map(n => [cxw(n % W), czw((n / W) | 0)]);
      /* 拉直：从当前点往后找最远的能直接看见的点 */
      const out = []; let cur = [a.x, a.z], k = 0;
      while (k < pts.length - 1) { let far = k + 1; for (let t = pts.length - 1; t > k + 1; t--) if (sight(cur[0], cur[1], pts[t][0], pts[t][1])) { far = t; break } out.push(pts[far]); cur = pts[far]; k = far }
      out.push([b.x, b.z]);
      return out;
    },
    dirty() { builtAt = -1e9 },
  };
}
