"""设计 80：炼宝特效图（2×3）切开 → src/img/fb/ref_*.png
用法：python3 tools/cut_refine.py 原图 输出目录
上排：铁砧、大锤、敲击火花；下排：成功金光、失败灰烟、小火星。
- 铁砧、大锤：从四周泛洪去白底（实心），边缘羽化一点。大锤左右翻过来（锤头在左上，锤柄末端在右下，从右上方落下）。
- 灰烟：软边，alpha 按「离白多远」算（核心灰色算不透明），颜色从白底里除回来。
- 火花、金光、火星：发光软边，alpha ≈ 1 − 最暗通道/255（放大一点），被光包住的亮芯算不透明，颜色用原色；游戏里用叠加（plus-lighter）画。"""
import sys, json
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB'); W, H = im.size
cell = lambda c, r: im.crop((round(W * c / 3), round(H * r / 2), round(W * (c + 1) / 3), round(H * (r + 1) / 2)))

def solid(img):
    a = np.asarray(img).astype(np.int16)
    near = (np.abs(a - 250).sum(axis=2) < 45)
    lab, n = ndimage.label(near)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    fg = ~np.isin(lab, list(border)); fg = ndimage.binary_opening(fg, iterations=1)
    lab2, n2 = ndimage.label(fg); sz = ndimage.sum(fg, lab2, range(1, n2 + 1))
    keep = np.isin(lab2, [i + 1 for i, s in enumerate(sz) if s > 400]); keep = ndimage.binary_fill_holes(keep)
    al = np.asarray(Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0)))
    return np.dstack([np.asarray(img), al]).astype(np.uint8)

def unwhite(img, k=None, floor=6, radial=False):
    a = np.asarray(img).astype(np.float32)
    if k is None:                                      # 发光：越白越透明；被光包住的亮芯算不透明，颜色用原色（叠加时 = 原色 × alpha）
        m = 1 - a.min(axis=2) / 255
        if radial:                                     # 金光：中间整片是淡黄白，用中心往外渐淡的圆代替亮芯（不然是一块硬边的饼）
            yy, xx = np.mgrid[:a.shape[0], :a.shape[1]]; r = np.hypot(yy - a.shape[0] / 2, xx - a.shape[1] / 2) / (min(a.shape[:2]) / 2)
            holes = ndimage.binary_fill_holes(m > 0.2).astype(np.float32)
            core = np.maximum(np.clip(1.15 - r * 1.6, 0, 1) ** 1.5, holes * np.clip(1.2 - r, 0, 1)) * 255
        else: core = ndimage.binary_fill_holes(m > 0.25) * 255
        core = np.asarray(Image.fromarray(core.astype(np.uint8)).filter(ImageFilter.GaussianBlur(4))).astype(np.float32) / 255
        al = np.maximum(np.clip((m - 0.05) / 0.4, 0, 1) * (0.75 if radial else 1), core)
        if radial:                                     # 设计 85：外圈那层淡灰去掉——① 从半径 0.45 往外越来越透明，到 0.9 全透明；② 外圈发白、不黄的地方颜色换成金黄（叠加时不会是一层灰）
            al = al * np.clip((0.9 - r) / 0.45, 0, 1) ** 1.4
            mx = a.max(axis=2); sat = (mx - a.min(axis=2)) / np.maximum(mx, 1)
            w = (np.clip((0.3 - sat) / 0.15, 0, 1) * np.clip((r - 0.3) / 0.2, 0, 1))[..., None]
            a = a * (1 - w) + np.array([255, 205, 110], np.float32) * (mx / 255)[..., None] * w
        al[al < floor / 255] = 0
        return np.dstack([a, al * 255]).astype(np.uint8)
    else: al = np.clip((250 - a.mean(axis=2)) / k, 0, 1)   # 灰烟：核心灰算不透明
    al[al < floor / 255] = 0
    c = np.where(al[..., None] > 0, (a - 255 * (1 - al[..., None])) / np.maximum(al[..., None], 1e-3), 0)
    return np.dstack([np.clip(c, 0, 255), al * 255]).astype(np.uint8)

def save(arr, name, pad=6, flip=False):
    img = Image.fromarray(arr, 'RGBA'); bb = img.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    img = img.crop((max(0, bb[0] - pad), max(0, bb[1] - pad), min(img.width, bb[2] + pad), min(img.height, bb[3] + pad)))
    if flip: img = img.transpose(Image.FLIP_LEFT_RIGHT)
    img.save(f'{out}/ref_{name}.png', optimize=True); return img

ONLY = sys.argv[3].split(',') if len(sys.argv) > 3 else None   # 设计 85：只重切某几张（比如 burst）
_save = save
save = lambda arr, name, **kw: _save(arr, name, **kw) if not ONLY or name in ONLY else None
save(solid(cell(0, 0)), 'anvil')
h = save(solid(cell(1, 0)), 'hammer', flip=True)
save(unwhite(cell(2, 0)), 'spark')
save(unwhite(cell(0, 1), radial=True), 'burst')
s = unwhite(cell(1, 1), k=95); save(s, 'smoke')
save(unwhite(cell(2, 1)), 'ember')
print('done')
