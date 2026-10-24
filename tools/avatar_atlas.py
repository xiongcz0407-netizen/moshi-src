"""把 Kenney Modular Characters 的 4 张大图里要用的部件挑出来，缩小一半，拼成一张小图集。
用法：python3 tools/avatar_atlas.py <Spritesheet 文件夹>
输出：src/img/avatar.png（图集）、src/js/avatar_atlas.json（每个部件在图集里的位置和大小）"""
import sys, json, os, xml.etree.ElementTree as ET
from PIL import Image
D = sys.argv[1].rstrip('/') + '/'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 0.8
sheets, rects = {}, {}
for n in ['hair', 'skin', 'face', 'shirts']:
    sheets[n] = Image.open(D + f'sheet_{n}.png').convert('RGBA')
    for st in ET.parse(D + f'sheet_{n}.xml').getroot():
        a = st.attrib; rects[a['name'][:-4]] = (n, int(a['x']), int(a['y']), int(a['width']), int(a['height']))
HAIRC = ['black', 'blonde', 'brown1', 'brown2', 'grey', 'red', 'tan', 'white']
SHIRTC = ['blue', 'green', 'grey', 'navy', 'pine', 'red', 'white', 'yellow']
want = []
for t in range(1, 9): want += [f'tint{t}_head', f'tint{t}_neck', f'tint{t}Nose1']
want += [f'eye{c}_{s}' for c in ['Black', 'Blue', 'Brown', 'Green', 'Pine'] for s in ('small', 'large')]
want += [f'mouth_{m}' for m in ['happy', 'glad', 'straight', 'oh', 'teethLower']]
want += [f'{c}Brow1' for c in HAIRC]
for c in HAIRC: want += [f'{c}Man{i}' for i in range(1, 7)] + [f'{c}Woman{i}' for i in range(1, 7)]
for c in SHIRTC: want += [(f'shirtYellow{i}' if c == 'yellow' else f'{c}Shirt{i}') for i in range(1, 9)]
parts = []
for n in want:
    sh, x, y, w, h = rects[n]
    im = sheets[sh].crop((x, y, x + w, y + h)).resize((max(1, round(w * S)), max(1, round(h * S))), Image.LANCZOS)
    parts.append((n, im))
# 简单按高度排序装箱
parts.sort(key=lambda p: -p[1].height)
W, x, y, rowH, pos = 1024, 0, 0, 0, {}
for n, im in parts:
    if x + im.width > W: x, y, rowH = 0, y + rowH + 1, 0
    pos[n] = [x, y, im.width, im.height]; x += im.width + 1; rowH = max(rowH, im.height)
H = y + rowH
atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
for n, im in parts: atlas.alpha_composite(im, (pos[n][0], pos[n][1]))
atlas.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(os.path.join(ROOT, 'src/img/avatar.png'), optimize=True)
json.dump(pos, open(os.path.join(ROOT, 'src/js/avatar_atlas.json'), 'w'), separators=(',', ':'))
print('部件', len(pos), '图集', W, 'x', H, os.path.getsize(os.path.join(ROOT, 'src/img/avatar.png')) // 1024, 'KB')
