"""设计 116B：第 5 关装甲暴君的 2D 图处理 → src/img/fb5/
用法：python3 tools/tyrant_rig/cut2d.py 装甲暴君素材文件夹 输出文件夹
都是 2x3 拼图（每格往里缩 8px 去掉分隔线），输出 768×512 的拼图（每格 256，排法跟 fb4 一样：上排 0 1 2、下排 3 4 5）：
- fx_laser.png（黑底 → 透明；原图每格中间有灰色十字格线，先抹掉）：0 红激光、1 导弹尾焰、2 爆炸火球、3 地面火、4 主炮光柱、5 熔化地面
  0～4 叠加画；5 熔化地面带黑石头，按普通混合画
- fx_shield.png（黑底 → 透明）：0 护盾罩、1 电弧、2 电磁脉冲环、3 牵引漩涡、4 封锁电火花、5 核心光；全部叠加画
- decals.png（白底抠掉）：0 烧痕、1 弹坑、2 黄黑警示条、3 碎玻璃、4 绿色培养液、5 空（头像另出）；普通混合画
- boss_5.png：贴花图第 6 格的头像，圆形抠出来，256×256
- floor.jpg：金属格栅地板 1024；wall.jpg：实验室墙 1024（原图本来就是无缝的，只重新压）"""
import sys, os
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
CELL = 256


def cells(fn, inset=8):
    im = Image.open(os.path.join(SRC, fn)).convert('RGB'); W, H = im.size; cw, ch = W / 3, H / 2
    out = []
    for r in range(2):
        for c in range(3):
            x0, y0 = int(c * cw) + inset, int(r * ch) + inset; x1, y1 = int((c + 1) * cw) - inset, int((r + 1) * ch) - inset
            out.append(im.crop((x0, y0, x1, y1)))
    return out


def fit(cell, size=CELL):
    w, h = cell.size; s = max(w, h); c = Image.new('RGBA', (s, s), (0, 0, 0, 0)); c.paste(cell, ((s - w) // 2, (s - h) // 2))
    return c.resize((size, size), Image.LANCZOS)


def glow(cell):          # 亮的特效：透明度 = 亮度，颜色还原成不透明的颜色
    a = np.asarray(cell).astype(np.float32); m = a.max(axis=2)
    al = np.clip((m - 14) / 200, 0, 1) ** 0.9
    c = np.where(al[..., None] > 0.01, np.clip(a / np.maximum(al[..., None], 1e-3), 0, 255), 0)
    return Image.fromarray(np.dstack([c, al * 255]).astype(np.uint8), 'RGBA')


def dark(cell, lo=9, k=42):   # 黑底上的暗东西（黑羽毛、烟）：比黑底亮一点就算不透明，颜色保留
    a = np.asarray(cell).astype(np.float32); m = a.max(axis=2)
    al = np.clip((m - lo) / k, 0, 1)
    return Image.fromarray(np.dstack([a, al * 255]).astype(np.uint8), 'RGBA')


def unwhite(cell, k=70, hi=None):   # 白底抠掉（底色按四个角量，有的格子底是浅灰）
    a = np.asarray(cell).astype(np.float32)
    if hi is None:
        cn = np.concatenate([a[:12, :12], a[:12, -12:], a[-12:, :12], a[-12:, -12:]]).reshape(-1, 3).min(axis=1)
        hi = min(246, float(np.median(cn)) - 6)
    al = np.clip((hi - a.min(axis=2)) / k, 0, 1)
    c = np.where(al[..., None] > 0.01, np.clip((a - 255 * (1 - al[..., None])) / np.maximum(al[..., None], 1e-3), 0, 255), 0)
    return Image.fromarray(np.dstack([c, al * 255]).astype(np.uint8), 'RGBA')


def crackonly(cell):     # 裂纹那格是一整块水泥：只留暗的裂缝，水泥面透明
    a = np.asarray(cell).astype(np.float32); lum = a @ [0.3, 0.59, 0.11]
    blur = np.asarray(Image.fromarray(lum.astype(np.uint8)).filter(ImageFilter.GaussianBlur(9))).astype(np.float32)
    al = np.clip((blur - lum - 14) / 40, 0, 1)
    # 格子外圈的白边去掉
    al[(a.min(axis=2) > 236)] = 0
    h, w = al.shape; yy, xx = np.mgrid[0:h, 0:w]; r = np.hypot((xx - w / 2) / (w / 2), (yy - h / 2) / (h / 2))
    al *= np.clip((0.86 - r) / 0.3, 0, 1)   # 往外圈淡掉，原图那块水泥的方框边就没了
    c = np.clip(a * 0.8, 0, 255)
    return Image.fromarray(np.dstack([c, al * 255]).astype(np.uint8), 'RGBA')


def sheet(imgs, name):
    S = Image.new('RGBA', (CELL * 3, CELL * 2), (0, 0, 0, 0))
    for i, im in enumerate(imgs):
        if im is not None: S.paste(im, ((i % 3) * CELL, (i // 3) * CELL))
    save(S, name); return S


def save(im, name):   # 透明 PNG 压成 256 色（看不出差别，文件小 4～5 倍）
    im.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG).save(os.path.join(OUT, name), optimize=True)



def unline(im):   # 抹掉原图里的灰色细格线（整列 / 整行大部分是偏灰的点）
    a = np.asarray(im).astype(np.float32); H, W, _ = a.shape
    L = a.mean(axis=2)
    # 格线：上下（左右）隔 3 像素都是黑底、自己却是灰的点；一行（列）里这种点够多就算格线（线压在特效下面的那段也一起抹）
    def lines(L):
        nb = (np.roll(L, 3, 0) < 22) & (np.roll(L, -3, 0) < 22); hit = nb & (L > 24)
        return [y for y in range(3, L.shape[0] - 3) if hit[y].sum() > 25 and hit[y].sum() > 0.5 * nb[y].sum()]
    rows = lines(L); cols = lines(L.T)
    out = a.copy()
    for x in cols:
        l, r = max(0, x - 3), min(W - 1, x + 3)
        while l in cols and l > 0: l -= 1
        while r in cols and r < W - 1: r += 1
        out[:, x] = np.minimum(a[:, l], a[:, r]) * 0.5 + (a[:, l] + a[:, r]) * 0.25
    a = out.copy()
    for y in rows:
        u, d = max(0, y - 3), min(H - 1, y + 3)
        while u in rows and u > 0: u -= 1
        while d in rows and d < H - 1: d += 1
        out[y] = np.minimum(a[u], a[d]) * 0.5 + (a[u] + a[d]) * 0.25
    print('格线', len(cols), '列', len(rows), '行')
    return Image.fromarray(out.astype(np.uint8))


cs = [unline(c) for c in cells('特效_激光导弹_2x3.jpg')]
sheet([fit(glow(c)) if i != 5 else fit(dark(c, lo=14, k=40)) for i, c in enumerate(cs)], 'fx_laser.png')
cs = cells('特效_护盾电磁_2x3.jpg')
sheet([fit(glow(c)) for c in cs], 'fx_shield.png')

cs = cells('贴花和头像_2x3.jpg')
sheet([fit(unwhite(cs[0], k=90)), fit(unwhite(cs[1])), fit(unwhite(cs[2])), fit(unwhite(cs[3], k=40)), fit(unwhite(cs[4])), None], 'decals.png')
av = cs[5]; a = np.asarray(av).astype(np.int16)
m = (np.abs(a - a[4, 4]).sum(axis=2) > 40); ys, xs = np.nonzero(m)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max(); s = max(x1 - x0, y1 - y0)
cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
av = av.crop((cx - s // 2, cy - s // 2, cx + s // 2, cy + s // 2)).resize((CELL * 4, CELL * 4), Image.LANCZOS).convert('RGBA')
mask = Image.new('L', av.size, 0); ImageDraw.Draw(mask).ellipse((4, 4, av.size[0] - 4, av.size[1] - 4), fill=255)
av.putalpha(mask); save(av.resize((CELL, CELL), Image.LANCZOS), 'boss_5.png')

for src, dst in (('贴图_金属格栅地板.jpg', 'floor.jpg'), ('贴图_实验室墙.jpg', 'wall.jpg')):
    Image.open(os.path.join(SRC, src)).convert('RGB').resize((1024, 1024), Image.LANCZOS).save(os.path.join(OUT, dst), quality=84, optimize=True)
for f in sorted(os.listdir(OUT)): print(f, Image.open(os.path.join(OUT, f)).size, os.path.getsize(os.path.join(OUT, f)))
