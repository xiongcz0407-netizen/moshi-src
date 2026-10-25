"""设计 114B：第 4 关尖啸者的 2D 图处理 → src/img/fb4/
用法：python3 tools/scream_rig/cut2d.py 尖啸者素材文件夹 输出文件夹
都是 2x3 拼图（每格往里缩 8px 去掉分隔线），输出 768×512 的拼图（每格 256，排法跟原图一样：上排 0 1 2、下排 3 4 5）：
- fx_sound.png（黑底 → 透明）：0 声波圆环、1 喇叭音爆锥、2 声刃、3 电火花、4 黑羽毛、5 红色尖啸波纹
- fx_blink.png（黑底 → 透明）：0 黑紫烟团、1 落点黑影圈、2 手心黑羽毛旋涡、3 紫色错乱漩涡、4 暗红嗜血光环、5 红雾
  亮的格子按亮度出透明（适合叠加画），暗的格子（黑羽毛、烟、黑影圈、羽毛旋涡）按「比黑底亮多少」出透明，保留原色（普通混合画）
- crow.png / crow_red.png（白底抠掉）：0～3 扇翅、4 滑翔、5 俯冲；6 帧用同一个裁法，中心、大小对齐；红眼版眼睛点红 + 身上带一点暗红
- decals.png（白底抠掉）：0 裂纹、1 羽毛堆、2 锈水渍、3 断电线、4 碎玻璃、5 空（头像另出）
- boss_4.png：贴花图第 6 格的头像，圆形抠出来，256×256（跟前三关一样）
- floor.jpg：楼顶水泥地 1024，黑色沥青块压淡（不像地上有洞）
- skyline.jpg：夜晚城市天际线，左右接缝交叉淡化，2048×512，左右能接上"""
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


# ---- 特效 ----
cs = cells('特效_声波_2x3.jpg')
sheet([fit(glow(c)) if i != 4 else fit(dark(c)) for i, c in enumerate(cs)], 'fx_sound.png')
cs = cells('特效_闪现嗜血_2x3.jpg')
sheet([fit(dark(c)) if i in (0, 1, 2) else fit(glow(c)) for i, c in enumerate(cs)], 'fx_blink.png')

# ---- 乌鸦：6 帧同一个裁法（原图每格里乌鸦位置一致），不按各自外框居中，免得扇翅时身子跳 ----
cs = cells('乌鸦_2x3.jpg')
crows = [fit(unwhite(c, k=60)) for c in cs]
sheet(crows, 'crow.png')
red = []
for im in crows:
    a = np.asarray(im).astype(np.float32); al = a[..., 3] > 40
    # 身上带一点暗红
    a[..., 0] = np.clip(a[..., 0] * 1.0 + 40 * (a[..., 3] / 255), 0, 255); a[..., 1] *= 0.8; a[..., 2] *= 0.8
    r = Image.fromarray(a.astype(np.uint8), 'RGBA')
    # 眼睛：嘴尖 = 上半身最右的不透明点，眼睛在嘴根上方偏左
    ys, xs = np.nonzero(al); keep = ys > 90; ys, xs = ys[keep], xs[keep]; i = np.argmax(xs); bx, by = xs[i], ys[i]
    col = al[:, max(0, bx - 60):bx + 1]
    hy = by
    ex, ey = bx - 38, by - 8
    for k in range(6):   # 往上找头顶，眼睛放在头部中间
        if ey - 1 > 0 and al[ey - 1, ex]: ey -= 1
    d = ImageDraw.Draw(r)
    for rad, colr in ((7, (255, 30, 20, 90)), (4, (255, 40, 30, 220)), (2, (255, 200, 160, 255))):
        d.ellipse((ex - rad, ey - rad, ex + rad, ey + rad), fill=colr)
    red.append(r)
sheet(red, 'crow_red.png')

# ---- 贴花 + 头像 ----
cs = cells('贴花和头像_2x3.jpg')
dec = [fit(crackonly(cs[0])), fit(unwhite(cs[1])), fit(unwhite(cs[2], k=90)), fit(unwhite(cs[3])), fit(unwhite(cs[4], k=40)), None]
sheet(dec, 'decals.png')
av = cs[5]; a = np.asarray(av).astype(np.int16)
m = (np.abs(a - a[4, 4]).sum(axis=2) > 40); ys, xs = np.nonzero(m)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max(); s = max(x1 - x0, y1 - y0)
cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
av = av.crop((cx - s // 2, cy - s // 2, cx + s // 2, cy + s // 2)).resize((CELL * 4, CELL * 4), Image.LANCZOS).convert('RGBA')
mask = Image.new('L', av.size, 0); ImageDraw.Draw(mask).ellipse((4, 4, av.size[0] - 4, av.size[1] - 4), fill=255)
av.putalpha(mask); save(av.resize((CELL, CELL), Image.LANCZOS), 'boss_4.png')

# ---- 地面：黑沥青块压淡 ----
fl = Image.open(os.path.join(SRC, '贴图_楼顶水泥地.jpg')).convert('RGB').resize((1024, 1024), Image.LANCZOS)
a = np.asarray(fl).astype(np.float32); lum = a @ [0.3, 0.59, 0.11]
m = np.clip((115 - lum) / 45, 0, 1)
m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(4))).astype(np.float32) / 255
conc = a[lum > 110].mean(axis=0)               # 水泥的平均颜色
tgt = conc * 0.8 + (a - a.mean()) * 0.12       # 沥青块变成「深一点的水泥」，留一点原来的纹理
out = a + (tgt - a) * (m[..., None] * 0.9)
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(os.path.join(OUT, 'floor.jpg'), quality=85, optimize=True)

# ---- 天际线：左右接缝 ----
sk = Image.open(os.path.join(SRC, '远景_夜晚城市天际线.jpg')).convert('RGB'); a = np.asarray(sk).astype(np.float32); W = a.shape[1]; ov = 200
w = np.linspace(0, 1, ov)[None, :, None]; w = w * w * (3 - 2 * w)
res = a[:, :W - ov].copy()
res[:, :ov] = a[:, W - ov:] * (1 - w) + a[:, :ov] * w   # 开头从原图最后那段渐变过来，所以 res 的末尾接 res 的开头
Image.fromarray(res.astype(np.uint8)).resize((2048, 512), Image.LANCZOS).save(os.path.join(OUT, 'skyline.jpg'), quality=84, optimize=True)
for f in sorted(os.listdir(OUT)): print(f, Image.open(os.path.join(OUT, f)).size, os.path.getsize(os.path.join(OUT, f)))
