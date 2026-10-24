"""抠图：去掉纯色/浅色背景（含即梦水印），裁成正方形图标。
用法：python3 tools/cutout.py 原图 输出.png [边长=256]
做法：从四周边缘泛洪找背景（和边缘颜色接近的连通区域），只保留最大的一块前景（水印是孤立小块，会被丢掉），
边缘做一点羽化，再按前景范围裁成正方形、留 6% 边距。"""
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

src, out = sys.argv[1], sys.argv[2]
size = int(sys.argv[3]) if len(sys.argv) > 3 else 256
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(np.int16)
h, w, _ = a.shape
edge = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
bg = np.median(edge, axis=0)
diff = np.abs(a - bg).sum(axis=2)
near = diff < 38                                   # 和背景色接近
lab, n = ndimage.label(near)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bgmask = np.isin(lab, list(border))
fg = ~bgmask
fg = ndimage.binary_opening(fg, iterations=2)
lab2, n2 = ndimage.label(fg)
if n2 == 0:
    sys.exit('没找到前景')
sizes = ndimage.sum(fg, lab2, range(1, n2 + 1))
keep = lab2 == (int(np.argmax(sizes)) + 1)
keep = ndimage.binary_fill_holes(keep)
alpha = Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
rgba = im.convert('RGBA'); rgba.putalpha(alpha)
ys, xs = np.where(keep)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
side = int(max(x1 - x0, y1 - y0) * 1.12)
cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
canvas.paste(rgba.crop((cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)), (0, 0))
canvas.resize((size, size), Image.LANCZOS).save(out, optimize=True)
print(f'{out}  前景 {x1 - x0}x{y1 - y0}  → {size}x{size}')
