"""设计 34：把 3×3 的图标原图切开、去白底，存成 src/img/icons/<名字>.png（256×256）。
用法：python3 tools/cut_sheet.py 原图目录 输出目录
和 cutout.py 一样从四周泛洪找背景；但保留所有够大的前景块（火苗、刷新箭头这种分开的小块不丢），去掉第 09 张的灰格线。"""
import sys, os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

SHEETS = {
 '01': ['good_lighter', 'good_torch', 'good_radpickle', 'good_saltegg', 'good_ojuice', 'good_fishcan', 'good_popcorn', 'good_sweater', 'good_icecream'],
 '02': ['good_food', 'good_water', 'good_bandage', 'good_battery', 'good_charcoal', 'good_light', 'good_firewood', 'good_cell', 'good_wire'],
 '03': ['good_mayo', 'good_pickle', 'good_jam', 'good_smoked', 'good_floss', 'good_bacon', 'good_cheese', 'good_spam', 'good_orangecan'],
 '04': ['good_scarf', 'good_hat', 'good_gloves', 'good_pumpseed', 'good_applechip', 'good_fish', 'good_egg', 'good_duckegg', 'good_milk'],
 '05': ['good_radish', 'good_cabbage', 'good_tomato', 'good_carrot', 'good_eggplant', 'good_corn', 'good_pumpkin', 'good_apple', 'good_orange'],
 '06': ['good_truffle', None, None, 'good_pork', 'good_tomegg', 'good_salad', 'good_eggplantfry', 'good_fishsoup', 'good_pumpsoup'],
 '07': ['good_flossrice', 'good_stew', 'good_cornbread', 'good_fur', 'good_wool', 'junk_can', 'junk_bottle', 'junk_cloth', 'junk_wood'],
 '08': ['junk_battery', 'tr_crate', 'tr_filter', 'tr_medkit', 'tr_toolbox', 'tr_genpart', 'tr_sapA', 'tr_sapO', 'it_fert'],
 '09': ['it_gear', None, 'it_ref', 'it_corn', 'it_worm', 'it_rod', 'it_m16', 'it_scroll', None],
}

OPEN_HOLE = {'good_wire'}   # 中间是空的（铜丝圈）：被围住的白底也去掉

def cut(im, out, size=256):
    a = np.asarray(im.convert('RGB')).astype(np.int16)
    edge = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(edge, axis=0)
    near = np.abs(a - bg).sum(axis=2) < 40
    lab, n = ndimage.label(near)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    fg = ~np.isin(lab, list(border))
    if os.path.basename(out)[:-4] in OPEN_HOLE: fg &= ~np.isin(lab, [i + 1 for i, v in enumerate(ndimage.sum(near, lab, range(1, n + 1))) if v > near.size * 0.004])
    fg = ndimage.binary_opening(fg, iterations=2)
    lab2, n2 = ndimage.label(fg)
    if n2 == 0: sys.exit('没找到前景 ' + out)
    sizes = ndimage.sum(fg, lab2, range(1, n2 + 1))
    keep = np.isin(lab2, [i + 1 for i, s in enumerate(sizes) if s >= max(sizes) * 0.02])
    holes = ndimage.binary_fill_holes(keep) & ~keep; hl, hn = ndimage.label(holes)   # 小洞补上；大洞（铜丝圈中间）是背景，留空
    if hn and os.path.basename(out)[:-4] not in OPEN_HOLE: hs = ndimage.sum(holes, hl, range(1, hn + 1)); keep = keep | np.isin(hl, [i + 1 for i, v in enumerate(hs) if v < keep.size * 0.004])
    alpha = Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))
    rgba = im.convert('RGBA'); rgba.putalpha(alpha)
    ys, xs = np.where(keep)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    side = int(max(x1 - x0, y1 - y0) * 1.08)
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(rgba.crop((cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)), (0, 0))
    canvas.resize((size, size), Image.LANCZOS).save(out, optimize=True)

def whiten_lines(im):
    """第 09 张：浅灰格线涂成白色（整行 / 整列大部分是浅灰的就是格线）"""
    a = np.asarray(im.convert('RGB')).copy(); g = a.astype(int)
    grey = (np.abs(g - 220).max(axis=2) < 22) & (g.max(axis=2) - g.min(axis=2) < 10)
    for y in range(a.shape[0]):
        if grey[y].mean() > 0.5: a[max(0, y - 2):y + 3] = 255
    for x in range(a.shape[1]):
        if grey[:, x].mean() > 0.5: a[:, max(0, x - 2):x + 3] = 255
    return Image.fromarray(a)

src, dst = sys.argv[1], sys.argv[2]; os.makedirs(dst, exist_ok=True)
for k, names in SHEETS.items():
    im = Image.open(os.path.join(src, f'商品图标_{k}.jpg')).convert('RGB')
    if k == '09': im = whiten_lines(im)
    W, H = im.size
    for i, nm in enumerate(names):
        if not nm: continue
        c, r = i % 3, i // 3
        pad = 6
        tile = im.crop((c * W // 3 + pad, r * H // 3 + pad, (c + 1) * W // 3 - pad, (r + 1) * H // 3 - pad))
        cut(tile, os.path.join(dst, nm + '.png'))
cut(Image.open(os.path.join(src, '垂钓证.jpg')).convert('RGB'), os.path.join(dst, 'it_lic.png'))
# 35b：第 10 张是一排 3 个（甜品机：酸奶、鸡蛋布丁、冰棍）
p10 = os.path.join(src, '商品图标_10.jpg')
if os.path.exists(p10):
    im = Image.open(p10).convert('RGB'); W, H = im.size
    for i, nm in enumerate(['good_yogurt', 'good_pudding', 'good_popsicle']):
        cut(im.crop((i * W // 3 + 6, 6, (i + 1) * W // 3 - 6, H - 6)), os.path.join(dst, nm + '.png'))
print('ok')
