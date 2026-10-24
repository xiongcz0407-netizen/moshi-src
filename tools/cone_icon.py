"""35d：冰淇淋图标换成甜筒（下面锥形饼干、上面彩色冰淇淋球），画法跟 2D 图标一样：深棕描边、亮面高光。
用法：python3 tools/cone_icon.py 输出.png"""
import sys, math
from PIL import Image, ImageDraw, ImageFilter
S = 1024; im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
OUT = (92, 56, 30, 255); W = 14
# 锥形饼干
top_y, tip = 520, (512, 960); L, R = (300, top_y), (724, top_y)
d.polygon([L, R, tip], fill=(222, 168, 92, 255))
cone = Image.new('L', (S, S), 0); ImageDraw.Draw(cone).polygon([L, R, tip], fill=255)
grid = Image.new('RGBA', (S, S), (0, 0, 0, 0)); g = ImageDraw.Draw(grid)
for k in range(-12, 13):   # 斜格子
    x = 512 + k * 62
    g.line([(x - 500, top_y - 500), (x + 500, top_y + 500)], fill=(170, 112, 50, 255), width=9)
    g.line([(x + 500, top_y - 500), (x - 500, top_y + 500)], fill=(170, 112, 50, 255), width=9)
sh = Image.new('RGBA', (S, S), (0, 0, 0, 0)); ImageDraw.Draw(sh).polygon([(512, top_y), R, tip], fill=(120, 70, 20, 60))   # 右半边暗一点
im.paste(grid, (0, 0), Image.composite(grid, Image.new('RGBA', (S, S), (0, 0, 0, 0)), cone))
im.alpha_composite(Image.composite(sh, Image.new('RGBA', (S, S), (0, 0, 0, 0)), cone))
d = ImageDraw.Draw(im); d.line([L, R, tip, L], fill=OUT, width=W, joint='curve')
# 冰淇淋球：左粉、右薄荷绿、上柠檬黄
def ball(cx, cy, r, col, hi):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col, outline=OUT, width=W)
    # 右下暗面：球形遮罩里减去往左上挪的圆，剩下的月牙涂深一点，再模糊一下像手绘的过渡
    m = Image.new('L', (S, S), 0); md = ImageDraw.Draw(m); md.ellipse([cx - r + W, cy - r + W, cx + r - W, cy + r - W], fill=110)
    md.ellipse([cx - r - r * 0.25, cy - r - r * 0.3, cx + r - r * 0.25, cy + r - r * 0.3], fill=0); m = m.filter(ImageFilter.GaussianBlur(18))
    dark = Image.new('RGBA', (S, S), tuple(int(c * 0.7) for c in col[:3]) + (255,)); im.paste(dark, (0, 0), m)
    d.ellipse([cx - r * 0.55, cy - r * 0.62, cx - r * 0.05, cy - r * 0.25], fill=hi)
    # 底下一圈波浪边（化开的样子）
    for a in range(0, 180, 30):
        t = math.radians(a + 15); x, y = cx + r * 0.82 * math.cos(t), cy + r * 0.82 * math.sin(t)
        d.ellipse([x - r * 0.2, y - r * 0.2, x + r * 0.2, y + r * 0.2], fill=col)
ball(400, 470, 150, (245, 150, 178, 255), (255, 214, 226, 255))
ball(624, 470, 150, (150, 222, 190, 255), (214, 248, 232, 255))
ball(512, 330, 160, (250, 222, 110, 255), (255, 246, 196, 255))
# 糖粒
import random; random.seed(3)
for _ in range(26):
    cx, cy = random.choice([(400, 470, ), (624, 470), (512, 330)]); a = random.random() * 6.28; rr = random.random() * 110
    x, y = cx + rr * math.cos(a), cy + rr * math.sin(a) * 0.8; c = random.choice([(230, 70, 70), (70, 140, 230), (250, 250, 250), (120, 70, 200)])
    ang = random.random() * 3.14; dx, dy = 18 * math.cos(ang), 18 * math.sin(ang)
    d.line([(x - dx, y - dy), (x + dx, y + dy)], fill=c + (255,), width=11)
bb = im.getbbox(); side = int(max(bb[2] - bb[0], bb[3] - bb[1]) * 1.08); cx, cy = (bb[0] + bb[2]) // 2, (bb[1] + bb[3]) // 2
out = Image.new('RGBA', (side, side), (0, 0, 0, 0)); out.paste(im.crop((cx - side // 2, cy - side // 2, cx + side - side // 2, cy + side - side // 2)), (0, 0))
out.resize((256, 256), Image.LANCZOS).save(sys.argv[1], optimize=True)
