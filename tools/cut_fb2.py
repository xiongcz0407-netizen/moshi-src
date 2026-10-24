"""设计 81：毒囊关的 2D 图切开 → src/img/fb2/
用法：python3 tools/cut_fb2.py 毒囊素材文件夹 输出文件夹
- 特效_毒_2x4.jpg（黑底发光）：alpha = 最亮通道（平滑），颜色除回来；游戏里叠加（additive）画。第 7 张毒雾墙右边平切：左右镜像拼成一整条。
- 贴花和头像_2x3.jpg（白底，有灰格线）：每格往里收 8 像素去掉格线；贴花按「离白多远」转透明（软边留着）；头像从四周泛洪去白底。
- 贴图：台地岩石、毒雾海 → 1024 的 jpg。"""
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
im = Image.open(os.path.join(src, '特效_毒_2x4.jpg')).convert('RGB'); W, H = im.size
names = ['bolt', 'spray', 'pop', 'drops', 'cloud', 'wisp', 'wall', 'bubbles']
for i, nm in enumerate(names):
    c, r = i % 4, i // 4; cell = im.crop((round(W * c / 4) + 4, round(H * r / 2) + 4, round(W * (c + 1) / 4) - 4, round(H * (r + 1) / 2) - 4))
    g = glow(cell); g[:10, :, 3] = 0; g[-10:, :, 3] = 0; g[:, :10, 3] = 0; g[:, -10:, 3] = 0   # 贴边的杂线（隔壁格子漏过来的）不要
    if nm != 'wall':   # 很小的孤立亮点（杂点）去掉
        lab, n = ndimage.label(g[..., 3] > 20); sz = ndimage.sum(g[..., 3] > 20, lab, range(1, n + 1)); big = max(sz) if n else 0
        for k, v in enumerate(sz):
            if v < max(30, big * (0.3 if nm == 'wisp' else 0.004)): g[lab == k + 1, 3] = 0   # 毒雾丝只留主体那一缕
    if nm == 'wall':
        g = crop_bbox(g, 0); g = np.concatenate([g, g[:, ::-1]], axis=1)   # 右边平切 → 镜像拼成一整条
        Image.fromarray(g, 'RGBA').resize((512, int(512 * g.shape[0] / g.shape[1])), Image.LANCZOS).save(f'{out}/fx_{nm}.png', optimize=True); continue
    sq(Image.fromarray(crop_bbox(g), 'RGBA')).save(f'{out}/fx_{nm}.png', optimize=True)
im = Image.open(os.path.join(src, '贴花和头像_2x3.jpg')).convert('RGB'); W, H = im.size
names = ['puddle', 'pool', 'acid', 'corrode', 'crater', 'boss_2']
for i, nm in enumerate(names):
    c, r = i % 3, i // 3; cell = im.crop((round(W * c / 3) + 8, round(H * r / 2) + 8, round(W * (c + 1) / 3) - 8, round(H * (r + 1) / 2) - 8))
    if nm == 'boss_2': sq(Image.fromarray(crop_bbox(solid(cell), 4), 'RGBA')).save(f'{out}/boss_2.png', optimize=True); continue
    sq(Image.fromarray(crop_bbox(unwhite(cell, 90 if nm in ('crater', 'corrode') else 60)), 'RGBA')).save(f'{out}/mark_{nm}.png', optimize=True)
for f, nm in [('贴图_台地岩石.jpg', 'tex_plateau'), ('贴图_毒雾海.jpg', 'tex_mist')]:
    t = Image.open(os.path.join(src, f)).convert('RGB'); t.resize((1024, 1024), Image.LANCZOS).save(f'{out}/{nm}.jpg', quality=84)
print('ok')
