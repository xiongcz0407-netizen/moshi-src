# 18f 第 3 条：正交正面渲染标准头（只显示头），量 5 个比例，跟标准头规范比，差 > 3% 报出来
# 用法：python3 check.py ortho_head.png（图是 viewer 正交正面、绿底渲染出来的）
import sys, json
import numpy as np
from PIL import Image
from scipy import ndimage
REF = {'头宽': 0.873, '眼睛中线': 0.600, '嘴': 0.820, '嘴那一高度的脸宽': 0.716, '0.9H 的脸宽': 0.609}   # 18f 表「写代码的窗口量」那一列
a = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(float) / 255
bg = (a[..., 1] > 0.9) & (a[..., 0] < 0.2) & (a[..., 2] < 0.2); fg = ~bg
rows = np.nonzero(fg.any(1))[0]; top, chin = rows.min(), rows.max(); H = chin - top
lum = a.mean(-1); sat = a.max(-1) - a.min(-1)
def wrow(r): xs = np.nonzero(fg[r])[0]; return (xs.max() - xs.min()) / H
# 眼睛：睫毛（很黑）+ 眼白 + 瞳孔（橙棕）连成的两大块，中心高度
eye = fg & ((lum < 0.22) | ((lum > 0.85) & (sat < 0.12)) | ((sat > 0.35) & (a[..., 0] > a[..., 2]) & (lum < 0.75)))
eye[:top + int(0.4 * H)] = False; eye[top + int(0.78 * H):] = False
lab, n = ndimage.label(ndimage.binary_closing(eye, iterations=3)); sz = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1)); big = np.argsort(sz)[::-1][:2] + 1
eyes = [((np.nonzero(lab == b)[0].min() + np.nonzero(lab == b)[0].max()) / 2 - top) / H for b in big]
# 嘴：中间那几列，0.72～0.92H 里比周围皮肤暗的那一行
cols = np.nonzero(fg.any(0))[0]; cx = int((cols.min() + cols.max()) / 2); w = int(0.06 * H)
band = lum[top + int(0.72 * H): top + int(0.92 * H), cx - w: cx + w].mean(1); mouth = (int(0.72 * H) + int(np.argmin(band))) / H
res = {'头宽': max(wrow(top + int(f * H)) for f in np.linspace(0.08, 0.42, 30)), '眼睛中线': float(np.mean(eyes)), '嘴': mouth,
       '嘴那一高度的脸宽': wrow(top + int(mouth * H)), '0.9H 的脸宽': wrow(top + int(0.9 * H))}
out = {k: {'量到': round(v, 3), '规范': REF[k], '差': round(v / REF[k] - 1, 3)} for k, v in res.items()}
print(json.dumps(out, ensure_ascii=False))
