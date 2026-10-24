# 贴图后处理（系统 python：numpy / scipy / PIL）。hero.py 用 subprocess 调：python3 texfix.py job.json
# job：rgb（Blender 存的 PNG）、out、size、tris（UV 三角形 .npy，(N,3,2)，算哪些像素有用）、
#      mask（可选，头发遮罩 .npy，Blender 像素顺序 = 下到上）→ 存进透明通道
#      hair（true：头发灰度去杂色 + 压到窄范围）、fill_tris + fill（衣服里的小肉色斑换成旁边衣服的颜色）
#      dilate（UV 岛外面用最近的岛内颜色填满，减面 / 缩小后边上不会采到黑底）
import sys, json, numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd
J = json.load(open(sys.argv[1])); R = {}
c = np.asarray(Image.open(J['rgb']).convert('RGB'), np.float32) / 255; H, W = c.shape[:2]
def cover(path):
    im = Image.new('L', (W, H), 0); d = ImageDraw.Draw(im)
    for t in np.load(path): d.polygon([(u * W, (1 - v) * H) for u, v in t], fill=255)
    return nd.binary_dilation(np.asarray(im) > 0, iterations=2)
cov = cover(J['tris'])
m = np.flipud(np.load(J['mask'])).astype(np.float32) if J.get('mask') else None
lum = c @ np.array([0.3, 0.59, 0.11], np.float32)
if J.get('hair_tris'):                         # 头发遮罩按面画：头发面 = 1，脸的面盖回 0，边上软 1 像素
    ch, cs, cu = cover(J['hair_tris']), cover(J['skin_tris']), cover(J['upper_tris']); hmk = ch & ~cs & ~cu; known = ch | cs | cu
    idx = nd.distance_transform_edt(~known, return_distances=False, return_indices=True)   # 都没画到的像素（减面后面片跨过的缝）跟最近的走
    hmk = hmk[idx[0], idx[1]]
    m = nd.gaussian_filter(hmk.astype(np.float32), 0.8)
    sat = c.max(2) - c.min(2); pc = np.clip((0.17 - sat) / 0.05, 0, 1) * np.clip((lum - 0.16) / 0.06, 0, 1)   # 额头、发际线：画着头发（灰、没颜色）的像素算头发
    cu2 = cu & ~ch; m[cu2] = nd.gaussian_filter(pc, 1.0)[cu2]
if m is not None and m.shape != (H, W): m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR), np.float32) / 255
if J.get('hair') and m is not None:
    hm = (m > 0.5) & cov; s = J.get('blur', 3.0)
    l = nd.gaussian_filter(lum * hm, s) / np.maximum(nd.gaussian_filter(hm.astype(np.float32), s), 1e-3)   # 只在头发里模糊：去小斑点，留大块明暗
    lo, hi = np.percentile(l[hm], [3, 97]); a, b = J.get('range', [0.55, 1.0])
    l = np.clip(a + (l - lo) / max(hi - lo, 1e-3) * (b - a), a, b)
    c = c * (1 - m[..., None]) + l[..., None] * m[..., None]
    R['hair_lum_before'] = [round(float(x), 3) for x in np.percentile(lum[hm], [5, 50, 95])]
    R['hair_lum_after'] = [round(float(x), 3) for x in np.percentile(l[hm], [5, 50, 95])]
if J.get('fill_tris'):
    fc = cover(J['fill_tris']) & cov; warm = c[..., 0] - c[..., 2]
    lm = nd.median_filter(np.where(fc, lum, np.nan_to_num(lum)), size=21)          # 周围衣服的亮度
    skin = fc & (((warm > J.get('warm', 0.10)) & (lum > 0.30)) | (lum - lm > 0.28))  # 肉色块 + 比周围亮很多的小白斑（裤腰上的）
    skin = nd.binary_dilation(skin, iterations=2) & fc
    good = fc & ~skin
    if skin.any() and good.any():
        idx = nd.distance_transform_edt(~good, return_distances=False, return_indices=True)
        c[skin] = c[idx[0][skin], idx[1][skin]]
    R['cloth_skin_px'] = int(skin.sum())
if J.get('dark_tris') and len(np.load(J['dark_tris'])):   # 开口边（袖口、领口、裤脚）太暗的像素 → 旁边衣服的颜色 × 0.85（设计 18s）
    dz = cover(J['dark_tris']) & cov
    lm = nd.median_filter(np.where(cov, lum, 0), size=31); lm2 = nd.maximum_filter(lm, size=15)
    dark = dz & (lum < 0.62 * lm2); good = cov & ~dark
    if dark.any() and good.any():
        idx = nd.distance_transform_edt(~good, return_distances=False, return_indices=True)
        c[dark] = c[idx[0][dark], idx[1][dark]] * 0.85
    R['rim_dark_px'] = int(dark.sum())
if J.get('red_fix'):                           # 设计 18v：套装上生成出来的红斑（粉开衫前胸两块、背后下摆）→ 换成旁边衣服的颜色
    red = cov & ((c[..., 0] - c[..., 1]) > 0.25) & ((c[..., 0] - c[..., 2]) > 0.2) & (c[..., 0] > 0.4)
    red = nd.binary_dilation(red, iterations=3) & cov; good = cov & ~red
    if red.any() and good.any():
        idx = nd.distance_transform_edt(~good, return_distances=False, return_indices=True)
        c[red] = c[idx[0][red], idx[1][red]]
    R['red_fixed_px'] = int(red.sum())
if J.get('dilate', True):
    idx = nd.distance_transform_edt(~cov, return_distances=False, return_indices=True)
    c = c[idx[0], idx[1]]
    if m is not None: m = m[idx[0], idx[1]]
    R['coverage'] = round(float(cov.mean()), 3)
# 颜色和透明通道分开缩小（PIL 缩 RGBA 会按透明度预乘，透明的地方颜色会变黑）
sz = J.get('size') or W
out = Image.fromarray((np.clip(c, 0, 1) * 255).astype(np.uint8))
if sz != W: out = out.resize((sz, sz), Image.LANCZOS)
if m is not None:                              # 遮罩另存（hero.py 放进顶点颜色），贴图本身不带透明通道
    np.save(J['out'] + '.hairmask.npy', np.asarray(Image.fromarray((np.clip(m, 0, 1) * 255).astype(np.uint8)).resize((1024, 1024), Image.BILINEAR), np.float32) / 255)
out.convert('RGB').save(J['out']); print(json.dumps(R))
