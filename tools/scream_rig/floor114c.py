"""设计 114c：第 4 关楼顶地面重做 → src/img/fb4/floor.jpg
原图（贴图_楼顶水泥地.jpg）一块块黑沥青 + 凸起，游戏里看着像深蓝灰的鹅卵石路。这里：
1. 黑沥青块、锈水挖掉，用周围水泥的大模糊补上；
2. 整体换成偏浅灰的水泥色（不发蓝），对比度降低，只留细细的一点颗粒；
3. 裂纹单独找出来（比周围暗的细线）叠回去。原图本来就无缝，模糊都用环绕方式算，接缝不会断。
用法：python3 tools/scream_rig/floor114c.py 原图.jpg 输出.jpg"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage
src, out = sys.argv[1], sys.argv[2]
a = np.asarray(Image.open(src).convert('RGB').resize((1024, 1024), Image.LANCZOS)).astype(np.float32)
L = a @ [0.3, 0.59, 0.11]
sat = a.max(axis=2) - a.min(axis=2)
blur = lambda x, s: ndimage.gaussian_filter(x, s, mode='wrap')
# 1. 要挖掉的：黑沥青（暗的大块）、锈水（偏橙）
bad = (blur(L, 3) < 95) | (sat > 38)
bad = ndimage.binary_dilation(bad, iterations=4)
ok = (~bad).astype(np.float32)
base = blur(L * ok, 28) / np.maximum(blur(ok, 28), 1e-3)          # 周围水泥的亮度（大模糊）
# 2. 细颗粒：只取好水泥上的高频，压小
rng = np.random.default_rng(114)
n1 = blur(rng.normal(0, 1, L.shape).astype(np.float32), 0.8); n2 = blur(rng.normal(0, 1, L.shape).astype(np.float32), 7); n3 = blur(rng.normal(0, 1, L.shape).astype(np.float32), 40)
fine = n1 / n1.std() * 4.5 + n2 / n2.std() * 3.0 + n3 / n3.std() * 6.0   # 水泥颗粒 + 一点点斑驳（整张都有，补过的地方不会是一块光板）
# 3. 裂纹：比周围（半径 5）暗、细的线；沥青块边缘不算
crack = np.clip((blur(L, 5) - L - 14) / 30, 0, 1) * (1 - ndimage.binary_dilation(bad, iterations=6))   # 沥青块周围一圈的「裂纹」其实是块的边，不要
crack = np.maximum(crack, 0)
# 浅灰水泥：亮度往 172 拉，起伏压到原来的 30%
b = 172 + (base - base.mean()) * 0.15
g = b + fine - crack * 70
col = np.stack([g * 1.0, g * 0.99, g * 0.965], axis=2)          # 一点点暖灰，不发蓝
Image.fromarray(np.clip(col, 0, 255).astype(np.uint8)).save(out, quality=85, optimize=True)
print('bad %.0f%%' % (bad.mean() * 100), 'crack px', int((crack > 0.3).sum()), 'mean', round(float(g.mean()), 1))
