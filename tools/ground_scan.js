/* 设计 64 / 65：地面闪烁自动检查。在 ?debug 的游戏页里先注入这个文件，再调 __gscan2(__g.W.scene, '超市', { img: [x0, x1, z0, z1] })。
   65 起按真实形状算（每块贴片的三角形铺到 0.1 米的格子上），两块共享 ≥ 3 格（0.03 平方米）就算叠在一起，不管有没有分层；img 给范围就画一张俯视图（叠的地方红色） */
/* 设计 65：地面贴片叠在一起的检查（按真实形状，不按外框）。每块贴片的三角形按 0.1 米格子栅格化，两块共享的格子 ≥ 3 个（0.03 平方米）算叠在一起，不管有没有分层 */
window.__gscan2 = (scene, tag, opt = {}) => {
  const T = __g.THREE, pats = [], b = new T.Box3(), C = 0.1, v = new T.Vector3();
  scene.updateMatrixWorld(true);
  scene.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.geometry || !o.material) return; const ms = [].concat(o.material);   // 65b：一个网格两组材质（填充 + 外圈）也算
    let vis = true, q = o; while (q) { if (!q.visible) { vis = false; break } q = q.parent } if (!vis) return;
    const m = ms[0]; if (ms.every(q => q.transparent && !q.map)) return;   // 路上的白线、中线这种画上去的线不算
    b.setFromObject(o); const h = b.max.y - b.min.y, A = (b.max.x - b.min.x) * (b.max.z - b.min.z);
    if (h > 0.004 || b.max.y > 0.05 || b.min.y < -0.05 || A < 0.05 || A > 1500) return;
    const g = o.geometry, ps = g.attributes.position, ix = g.index ? g.index.array : [...Array(ps.count).keys()], cells = new Set();
    const pt = i => { v.fromBufferAttribute(ps, i).applyMatrix4(o.matrixWorld); return [v.x, v.z] };
    for (let t = 0; t < ix.length; t += 3) { const [a, c, d] = [pt(ix[t]), pt(ix[t + 1]), pt(ix[t + 2])];
      const x0 = Math.floor(Math.min(a[0], c[0], d[0]) / C), x1 = Math.ceil(Math.max(a[0], c[0], d[0]) / C), z0 = Math.floor(Math.min(a[1], c[1], d[1]) / C), z1 = Math.ceil(Math.max(a[1], c[1], d[1]) / C);
      const ar = (c[0] - a[0]) * (d[1] - a[1]) - (d[0] - a[0]) * (c[1] - a[1]); if (Math.abs(ar) < 1e-9) continue;
      for (let X = x0; X <= x1; X++) for (let Z = z0; Z <= z1; Z++) { const px = (X + 0.5037) * C, pz = (Z + 0.4971) * C;   // 格子中心错开一点点，正好贴着的边不算叠
        const w1 = ((c[0] - px) * (d[1] - pz) - (d[0] - px) * (c[1] - pz)) / ar, w2 = ((d[0] - px) * (a[1] - pz) - (a[0] - px) * (d[1] - pz)) / ar, w3 = 1 - w1 - w2;
        if (w1 >= -1e-6 && w2 >= -1e-6 && w3 >= -1e-6) cells.add(X * 100000 + Z) } }
    pats.push({ o, cells, y: (b.min.y + b.max.y) / 2, bb: [b.min.x, b.max.x, b.min.z, b.max.z], name: `${(b.max.x - b.min.x).toFixed(1)}×${(b.max.z - b.min.z).toFixed(1)}@(${((b.min.x + b.max.x) / 2).toFixed(1)},${((b.min.z + b.max.z) / 2).toFixed(1)}) y${((b.min.y + b.max.y) / 2).toFixed(5)}${m.depthWrite === false ? ' 不写深度' : ''}${ms.some(q => q.vertexColors) ? ' 边缘渐变' : ''}` });
  });
  const out = [], hit = new Set();
  for (let i = 0; i < pats.length; i++) for (let j = i + 1; j < pats.length; j++) { const a = pats[i], c = pats[j];
    if (a.bb[1] < c.bb[0] || c.bb[1] < a.bb[0] || a.bb[3] < c.bb[2] || c.bb[3] < a.bb[2]) continue;
    const [s, l] = a.cells.size < c.cells.size ? [a, c] : [c, a]; let n = 0, sx = 0, sz = 0;
    for (const k of s.cells) if (l.cells.has(k)) { n++; const X = Math.round(k / 100000), Z = k - X * 100000; sx += X; sz += Z; hit.add(k) }
    if (n >= 3) out.push({ a: a.name, b: c.name, m2: +(n * C * C).toFixed(2), at: `(${(sx / n * C).toFixed(1)}, ${(sz / n * C).toFixed(1)})` }) }
  let img = null;
  if (opt.img) { const [X0, X1, Z0, Z1] = opt.img, s = opt.px || 12, cv = document.createElement('canvas'); cv.width = (X1 - X0) * s; cv.height = (Z1 - Z0) * s; const g = cv.getContext('2d'); g.fillStyle = '#5d7a43'; g.fillRect(0, 0, cv.width, cv.height);
    const cols = ['#c9b79a', '#b9c4cf', '#d8c08a', '#a7b98d', '#cfa9a0', '#9fc3bd', '#d6b4d8', '#e0d28e'];
    pats.forEach((p, i) => { g.fillStyle = cols[i % cols.length]; for (const k of p.cells) { const X = Math.round(k / 100000), Z = k - X * 100000; g.fillRect((X * C - X0) * s, (Z * C - Z0) * s, C * s + 0.5, C * s + 0.5) } });
    g.fillStyle = '#e0201a'; for (const k of hit) { const X = Math.round(k / 100000), Z = k - X * 100000; g.fillRect((X * C - X0) * s, (Z * C - Z0) * s, C * s + 0.5, C * s + 0.5) }
    g.fillStyle = '#fff'; g.font = '14px sans-serif'; for (let x = Math.ceil(X0 / 10) * 10; x <= X1; x += 10) g.fillText('x' + x, (x - X0) * s + 2, 14); for (let z = Math.ceil(Z0 / 10) * 10; z <= Z1; z += 10) g.fillText('z' + z, 2, (z - Z0) * s - 2);
    img = cv.toDataURL('image/png') }
  return { tag, n: pats.length, pairs: out, img };
};
