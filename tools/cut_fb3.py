"""设计 102：第 3 关落石巨人的 2D 图切开 → src/img/fb3/
用法：python3 tools/cut_fb3.py 落石巨人素材文件夹 输出文件夹
- 特效_落石_2x3（黑底）：fx_burst 尘爆、fx_shards 碎石、fx_crack 地裂缝、fx_spikecrack 石柱破土、fx_trail 滚石尘带、fx_lava 岩浆裂纹；叠加画。
- 贴花_5个_2x3（白底）：mark_crack 裂纹、mark_rubble 碎石堆、mark_crater 落石坑、mark_drag 拖痕、mark_oil 锈水油污。
- 头像：只用右下角 → boss_3。贴图：碎石地（上下接缝淡化）、石壁、铁轨。"""
import sys, os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
src, out = sys.argv[1], sys.argv[2]
def crop_bbox(arr, pad=6):
    a = arr[..., 3]; ys, xs = np.nonzero(a > 6)
    if not len(xs): return arr
    y0, y1, x0, x1 = max(0, ys.min() - pad), min(a.shape[0], ys.max() + pad), max(0, xs.min() - pad), min(a.shape[1], xs.max() + pad)
    return arr[y0:y1, x0:x1]
def sq(img, size=256):
    w, h = img.size; s = max(w, h); c = Image.new('RGBA', (s, s), (0, 0, 0, 0)); c.paste(img, ((s - w) // 2, (s - h) // 2)); return c.resize((size, size), Image.LANCZOS)
def glow(cell):
    a = np.asarray(cell).astype(np.float32)
    m = a.max(axis=2); al = np.clip((m - 14) / 200, 0, 1) ** 0.9
    c = np.where(al[..., None] > 0.01, np.clip(a / np.maximum(al[..., None], 1e-3), 0, 255), 0)
    return np.dstack([c, al * 255]).astype(np.uint8)
def unwhite(cell, k=70):
    a = np.asarray(cell).astype(np.float32)
    al = np.clip((246 - a.min(axis=2)) / k, 0, 1)
    c = np.where(al[..., None] > 0.01, np.clip((a - 255 * (1 - al[..., None])) / np.maximum(al[..., None], 1e-3), 0, 255), 0)
    return np.dstack([c, al * 255]).astype(np.uint8)
def solid(cell):
    a = np.asarray(cell).astype(np.int16)
    near = np.abs(a - 250).sum(axis=2) < 45
    lab, n = ndimage.label(near)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    fg = ndimage.binary_fill_holes(~np.isin(lab, list(border)))
    al = np.asarray(Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0)))
    return np.dstack([np.asarray(cell), al]).astype(np.uint8)
# ---- 特效_落石_2x3.jpg（黑底，格子间白线，每格往里缩 8px）：叠加混合，不抠，亮度当透明 ----
im = Image.open(os.path.join(src, '特效_落石_2x3.jpg')).convert('RGB'); W, H = im.size
for i, nm in enumerate(['burst', 'shards', 'crack', 'spikecrack', 'trail', 'lava']):
    c, r = i % 2, i // 2; cell = im.crop((round(W * c / 2) + 8, round(H * r / 3) + 8, round(W * (c + 1) / 2) - 8, round(H * (r + 1) / 3) - 8))
    g = glow(cell); g[:6, :, 3] = 0; g[-6:, :, 3] = 0; g[:, :6, 3] = 0; g[:, -6:, 3] = 0
    sq(Image.fromarray(crop_bbox(g), 'RGBA')).save(f'{out}/fx_{nm}.png', optimize=True)
# ---- 贴花_5个_2x3.jpg（白底，格子间黑线，每格往里缩 8px）：抠白 ----
im = Image.open(os.path.join(src, '贴花_5个_2x3.jpg')).convert('RGB'); W, H = im.size
for i, nm in enumerate(['crack', 'rubble', 'crater', 'drag', 'oil']):
    c, r = i % 2, i // 2; cell = im.crop((round(W * c / 2) + 8, round(H * r / 3) + 8, round(W * (c + 1) / 2) - 8, round(H * (r + 1) / 3) - 8))
    sq(Image.fromarray(crop_bbox(unwhite(cell, 90 if nm in ('crater', 'drag') else 60)), 'RGBA')).save(f'{out}/mark_{nm}.png', optimize=True)
# ---- 头像：只用右下角 ----
im = Image.open(os.path.join(src, '头像_旧贴花作废_2x3.jpg')).convert('RGB'); W, H = im.size
cell = im.crop((W // 2 + 4, H * 2 // 3 + 4, W - 4, H - 4))
sq(Image.fromarray(crop_bbox(solid(cell), 4), 'RGBA')).save(f'{out}/boss_3.png', optimize=True)
# ---- 贴图 ----
for f, nm, sz in [('贴图_碎石地.jpg', 'tex_gravel', (1024, 1024)), ('贴图_采石场石壁.jpg', 'tex_quarry', (1024, 1024)), ('贴图_矿车铁轨.jpg', 'tex_rail', (256, 1032))]:
    t = Image.open(os.path.join(src, f)).convert('RGB').resize(sz, Image.LANCZOS)
    if nm == 'tex_gravel':   # 上下有一条很淡的接缝：上下各 24 行跟对边交叉淡化
        a = np.asarray(t).astype(np.float32); n = 24; top = a[:n].copy(); bot = a[-n:].copy()
        for k in range(n): w = 0.5 * (1 - k / n); a[k] = top[k] * (1 - w) + bot[n - 1 - k] * w; a[-1 - k] = bot[n - 1 - k] * (1 - w) + top[k] * w
        t = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    t.save(f'{out}/{nm}.jpg', quality=84)
print('ok')
