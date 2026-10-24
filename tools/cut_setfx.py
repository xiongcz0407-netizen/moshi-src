"""设计 85 / 86：套装特效图（2×2，每格 512，黑底）切开 → src/img/fb/set_*.png
用法：python3 tools/cut_setfx.py 原图 输出目录
中间有白色分隔线（510～513px），每格往里缩 8px。
设计 86：套装改红色（#ff4040）：原图绿色的部分换成红色，金色部分不动；
输出带透明度的 PNG：透明度 = 亮度（最亮的通道），颜色按透明度除回来——黑底 = 全透明，叠在浅色面板、深色底上都对。
- set_ring：左上 符文光环（去掉中间白光，垫在图标后面、脚下用）；set_rune：左上整格；set_burst：右上 爆光；set_pillar：右下 光柱（只留中间一条，两端在代码里淡出）
- set_star0..3：左下 星星粒子里挑 4 颗单独的星星（每颗 48×48）"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB'); W, H = im.size; c = W // 2
tile = lambda x, y: im.crop((x * c + 8, y * c + 8, (x + 1) * c - 8, (y + 1) * c - 8))

def red(a):
    """设计 86b：按色相换色——偏柠檬黄的金色拉回正金色；只把绿色（色相 80°～160°，边上软过渡）换成同样亮度、同样饱和度的红色（色相 0°）；金色、白色不动"""
    a = a.astype(np.float32); mx = a.max(axis=2); mn = a.min(axis=2); d = mx - mn
    r, g, b = a[..., 0], a[..., 1], a[..., 2]; dd = np.maximum(d, 1e-3)
    h = np.where(mx == r, ((g - b) / dd) % 6, np.where(mx == g, (b - r) / dd + 2, (r - g) / dd + 4)) * 60
    sat = d / np.maximum(mx, 1)
    w = (np.clip((h - 70) / 20, 0, 1) * np.clip((170 - h) / 20, 0, 1) * np.clip((sat - 0.08) / 0.12, 0, 1))[..., None]
    redc = np.stack([mx, mn, mn * 0.9], -1)
    # 原图的金色里有一部分偏柠檬黄（色相 55°～80°），跟红色放在一起看着发黄绿：拉到正金色（色相 42°），亮度、饱和度不变
    w2 = (np.clip((h - 52) / 6, 0, 1) * np.clip((85 - h) / 10, 0, 1) * np.clip((sat - 0.08) / 0.12, 0, 1))[..., None] * (1 - w)
    gold = np.stack([mx, mn + (mx - mn) * 0.7, mn], -1)
    return a * (1 - w - w2) + redc * w + gold * w2

def save(arr, name):
    a = red(arr); al = a.max(axis=2); col = np.where(al[..., None] > 0, a * 255 / np.maximum(al[..., None], 1), 0)
    Image.fromarray(np.dstack([np.clip(col, 0, 255), al]).astype(np.uint8), 'RGBA').save(f'{out}/set_{name}.png', optimize=True)

sz = lambda img, w, h: np.asarray(img.resize((w, h), Image.LANCZOS)).astype(np.float32)
r0 = sz(tile(0, 0), 256, 256); yy, xx = np.mgrid[:256, :256]; rr = np.hypot(yy - 127.5, xx - 127.5) / 128
save(r0 * np.clip((rr - 0.30) / 0.22, 0, 1)[..., None], 'ring')
save(r0, 'rune')
save(sz(tile(1, 0), 256, 256), 'burst')
p = tile(1, 1); a = np.asarray(p).astype(np.float32).max(axis=2); cols = np.where(a.mean(axis=0) > 18)[0]
x0, x1 = max(0, cols.min() - 6), min(p.width, cols.max() + 6)
save(sz(p.crop((x0, 0, x1, p.height)), max(32, (x1 - x0) // 2), 256), 'pillar')
s = np.asarray(tile(0, 1)).astype(np.float32); lum = s.max(axis=2)
lab, n = ndimage.label(lum > 120); szs = ndimage.sum(lum > 120, lab, range(1, n + 1)); com = ndimage.center_of_mass(lum > 120, lab, range(1, n + 1))
got = []
for i in np.argsort(-szs):
    y, x = com[i]
    if any(abs(y - gy) < 40 and abs(x - gx) < 40 for gy, gx in got): continue
    got.append((y, x))
    if len(got) == 4: break
for k, (y, x) in enumerate(got):
    r = 26; arr = sz(tile(0, 1).crop((int(x) - r, int(y) - r, int(x) + r, int(y) + r)), 48, 48); yy2, xx2 = np.mgrid[:48, :48]
    save(arr * np.clip(1.25 - np.hypot(yy2 - 23.5, xx2 - 23.5) / 22, 0, 1)[..., None], f'star{k}')
print('done')
