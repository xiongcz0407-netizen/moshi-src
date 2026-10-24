# 主角装配工具（设计 18f / 18g / 18q / 18v）：python3.11 hero.py -- <配置.json>
# 输入：基础身体（只量尺寸、绑骨骼，不进游戏）、标准头（尺子）、几颗发型头（头发 + 脸）、几套套装（穿着整套衣服的身体 GLB）。
# 输出：hero_m2.glb（骨骼 + 站 / 走 / 跑 + 每颗发型头 HairHead_<id> + 每套套装 Outfit_<id>）、report.json（倍数、量到的关节点、18f 的比例检查）。
# 以后换新发型、新套装：改配置里的列表再跑一次就行。
import bpy, bmesh, json, math, os, sys
import numpy as np
from mathutils import Vector, Quaternion
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

CFG = json.load(open(sys.argv[sys.argv.index('--') + 1]))
OUT = CFG['out']; os.makedirs(OUT, exist_ok=True)
REP = {'warn': []}
def log(*a): print('[hero]', *a, flush=True)

# ---------------------------------------------------------------- 工具函数
def imp(path, name):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path)
    o = [x for x in bpy.data.objects if x not in before and x.type == 'MESH'][0]
    for x in [x for x in bpy.data.objects if x not in before and x is not o]: bpy.data.objects.remove(x)
    o.name = name; o.data.name = name; o.parent = None
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bm.to_mesh(o.data); bm.free()
    col = nrm = None
    for n in o.data.materials[0].node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            if 'normal' in n.image.name: nrm = n.image
            elif 'metal' not in n.image.name: col = n.image
    col.name = name + '_col'
    if nrm: nrm.name = name + '_nrm'
    return o, col, nrm
def V(o): return np.array([v.co[:] for v in o.data.vertices])
def setV(o, a):
    for v, c in zip(o.data.vertices, a): v.co = Vector(c)
    o.data.update()
def pix(img):
    W, H = img.size; return np.array(img.pixels[:]).reshape(H, W, 4)[:, :, :3]
def facecols(o, img):
    px = pix(img); H, W = px.shape[:2]; uv = o.data.uv_layers.active.data; out = []
    for p in o.data.polygons:
        u = np.mean([uv[i].uv[:] for i in p.loop_indices], 0); out.append(px[min(H - 1, max(0, int(u[1] * H))), min(W - 1, max(0, int(u[0] * W)))])
    return np.array(out)
def vertcols(o, img):
    px = pix(img); H, W = px.shape[:2]; uv = o.data.uv_layers.active.data; acc = np.zeros((len(o.data.vertices), 3)); n = np.zeros(len(o.data.vertices))
    for l in o.data.loops:
        u = uv[l.index].uv; acc[l.vertex_index] += px[min(H - 1, max(0, int(u[1] * H))), min(W - 1, max(0, int(u[0] * W)))]; n[l.vertex_index] += 1
    return acc / np.maximum(n, 1)[:, None]
def delete_faces(o, mask):
    bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i in np.nonzero(mask)[0]], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS'); bm.to_mesh(o.data); bm.free(); o.data.update()
def drop_small(o, minfrac):
    bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table(); seen = set(); groups = []
    for f in bm.faces:
        if f.index in seen: continue
        st = [f]; g = []; seen.add(f.index)
        while st:
            x = st.pop(); g.append(x)
            for e in x.edges:
                for y in e.link_faces:
                    if y.index not in seen: seen.add(y.index); st.append(y)
        groups.append(g)
    tot = sum(len(g) for g in groups); kill = [f for g in groups if len(g) < tot * minfrac for f in g]
    bmesh.ops.delete(bm, geom=kill, context='FACES'); bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS'); bm.to_mesh(o.data); bm.free()
def decimate(o, target):
    r = min(1, target / max(1, len(o.data.polygons))); m = o.modifiers.new('dec', 'DECIMATE'); m.ratio = r; m.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='dec')
def tidy_rims(o, iters=8, lam=0.5, sel=None):
    """开口边（破洞边、袖口、领口、切口）沿着边磨平：减面 / 按颜色删面后边上的锯齿抹掉。返回每条开口边的顶点序号"""
    bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
    be = [e for e in bm.edges if e.is_boundary]; nb = {}
    for e in be:
        a, b = e.verts; nb.setdefault(a.index, []).append(b.index); nb.setdefault(b.index, []).append(a.index)
    loops, seen = [], set()
    for v0 in nb:
        if v0 in seen: continue
        st, g = [v0], []; seen.add(v0)
        while st:
            x = st.pop(); g.append(x)
            for y in nb[x]:
                if y not in seen: seen.add(y); st.append(y)
        loops.append(g)
    if sel: loops = [g for g in loops if sel(np.array([bm.verts[i].co[:] for i in g]))]
    ids = [i for g in loops for i in g]
    for _ in range(iters):
        P = {i: bm.verts[i].co.copy() for i in ids}
        for i in ids:
            if len(nb[i]) == 2: bm.verts[i].co = P[i] * (1 - lam) + (P[nb[i][0]] + P[nb[i][1]]) * (lam / 2)
    bm.to_mesh(o.data); bm.free(); o.data.update()
    return loops

def bvh(o): return BVHTree.FromObject(o, bpy.context.evaluated_depsgraph_get())
def split_obj(o, mask, name):
    """把 mask 选中的面复制成一个新物体"""
    n = o.copy(); n.data = o.data.copy(); n.name = name; n.data.name = name; bpy.context.collection.objects.link(n)
    delete_faces(n, ~mask); return n
def save_rgba(img, mask, path, size):   # 存带透明通道的 PNG（透明通道 = 遮罩）：Blender 自己存不好透明通道，交给系统 python（PIL）合成
    import subprocess
    tmp = path + '.rgb.png'; im = img.copy(); im.filepath_raw = tmp; im.file_format = 'PNG'; im.save()
    np.save(path + '.mask.npy', mask.astype(np.float32))
    subprocess.run(['python3', '-c', f'''
import numpy as np; from PIL import Image
c = Image.open({tmp!r}).convert('RGB').resize(({size}, {size}), Image.LANCZOS)
m = np.load({path + '.mask.npy'!r}); m = Image.fromarray((np.flipud(m) * 255).astype(np.uint8)).resize(({size}, {size}), Image.BILINEAR)
c.putalpha(m); c.save({path!r})'''], check=True)
def uv_tris(objs, path):
    """这些物体所有面的 UV 三角形存成 .npy（texfix.py 用来算贴图里哪些像素有用）"""
    T = []
    for o in objs:
        uv = o.data.uv_layers.active.data
        for p_ in o.data.polygons:
            li = list(p_.loop_indices)
            for k in range(1, len(li) - 1): T.append([uv[li[0]].uv[:], uv[li[k]].uv[:], uv[li[k + 1]].uv[:]])
    np.save(path, np.array(T, np.float32)); return path
def texfix(img, path, size, objs, mask=None, hair=False, fill_objs=None, hair_tris=None, skin_tris=None, dark_tris=None, red_fix=False):
    """贴图后处理（系统 python 跑 texfix.py）：UV 岛外扩、头发去杂色压范围、衣服里的肉色斑填掉"""
    import subprocess
    tmp = path + '.src.png'; im = img.copy(); im.filepath_raw = tmp; im.file_format = 'PNG'; im.save()
    J = {'rgb': tmp, 'out': path, 'size': size, 'tris': uv_tris(objs, path + '.tris.npy'), 'hair': hair}
    if mask is not None: np.save(path + '.mask.npy', mask.astype(np.float32)); J['mask'] = path + '.mask.npy'
    if fill_objs: J['fill_tris'] = uv_tris(fill_objs, path + '.fill.npy')
    if dark_tris: J['dark_tris'] = dark_tris
    if red_fix: J['red_fix'] = True
    if hair_tris: J['hair_tris'] = hair_tris; J['skin_tris'] = skin_tris; J['upper_tris'] = skin_tris.replace('skin_tris', 'upper_tris')
    json.dump(J, open(path + '.job.json', 'w'))
    r = subprocess.run(['python3', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'texfix.py'), path + '.job.json'], check=True, capture_output=True, text=True)
    return json.loads(r.stdout.strip().splitlines()[-1])
def save_img(img, path, size=None, gray=False):
    im = img.copy(); im.name = os.path.basename(path)
    if size: im.scale(size, size)
    if gray:
        p = np.array(im.pixels[:]).reshape(-1, 4); l = p[:, :3] @ np.array([0.3, 0.59, 0.11]); lo, hi = np.percentile(l, [2, 99.5])
        l = np.clip((l - lo) / max(1e-3, hi - lo), 0, 1); p[:, 0] = p[:, 1] = p[:, 2] = l; im.pixels[:] = p.ravel()
    im.filepath_raw = path; im.file_format = 'JPEG' if path.endswith('.jpg') else 'PNG'; im.save(); return path

# ---------------------------------------------------------------- 1. 身体（设计 18v：基础身体2，头约占 30%、腿更长）：只用来量尺寸、绑骨骼、给套装传权重，不进游戏
bpy.ops.wm.read_factory_settings(use_empty=True)
B, bcol, bnrm = imp(CFG['body'], 'Body')
bv = V(B); TOP = bv[:, 2].max()
def sl(z0, z1, P=None):
    P = bv if P is None else P; return P[(P[:, 2] >= z0) & (P[:, 2] < z1)]
# 脖子 = 0.55～0.80 身高之间最细的一段；下巴 = 脖子以上、比脖子前面往前突出 2.5 厘米的最低点
_zs = np.arange(0.55 * TOP, 0.80 * TOP, 0.004); _w = [np.ptp(sl(z, z + 0.008)[:, 0]) if len(sl(z, z + 0.008)) > 3 else 9 for z in _zs]
NECK = float(_zs[int(np.argmin(_w))] + 0.004)
_nf = sl(NECK - 0.008, NECK + 0.008); NFY = float(_nf[:, 1].min())
_ch = bv[(bv[:, 2] > NECK - 0.02) & (bv[:, 1] < NFY - 0.025) & (np.abs(bv[:, 0]) < 0.06)]
CHIN = float(_ch[:, 2].min())                                   # 原来的下巴
H_BODY = TOP - CHIN
# 裆：从下往上，正中间一条（|x| < 8 毫米）第一次有顶点的高度
CROTCH = next(float(z) for z in np.arange(0.12 * TOP, 0.6 * TOP, 0.003) if (np.abs(sl(z, z + 0.003)[:, 0]) < 0.008).any())
_lg = sl(0.4 * CROTCH, 0.8 * CROTCH); LX = float(np.median(_lg[(_lg[:, 0] > 0.005) & (_lg[:, 0] < 0.25), 0]))   # 腿中线
_az = np.arange(0.03 * TOP, 0.15 * TOP, 0.004); _ay = [np.ptp(s[:, 1]) if len(s := sl(z, z + 0.008)[sl(z, z + 0.008)[:, 0] > 0]) > 3 else 9 for z in _az]
ANKLE = float(_az[int(np.argmin(_ay))] + 0.004)                  # 脚踝：脚上面前后最窄的地方
_ft = bv[(bv[:, 2] < ANKLE) & (bv[:, 0] > 0)]; TOE_Y = float(_ft[:, 1].min())
def yc(z, side=1):                                              # 那一高度（右半边）的前后中心
    s = sl(z - 0.01, z + 0.01); s = s[s[:, 0] * side > 0.005]; return float(np.median(s[:, 1])) if len(s) else 0.0
# 腋下：从脖子往下，右半边第一次在 x 方向分成两块（身子 | 手臂）的高度；GAPS[z] = 两块中间的 x（之后修权重分身子 / 手臂用）
GAPS = {}; _BVB = bvh(B)
def xhits(y, z):                                                # 从右边往左打一条水平线，依次碰到的 x（手臂外侧、手臂内侧、身子外侧…）
    xs, x0 = [], 0.6
    while x0 > 0.0:
        h = _BVB.ray_cast(Vector((x0, y, z)), Vector((-1, 0, 0)), x0)
        if h[0] is None: break
        xs.append(h[0].x); x0 = h[0].x - 0.001
    return xs
for z in np.arange(NECK - 0.05, CROTCH - 0.05, -0.01):
    y0 = yc(z); best = None
    for y in (y0 - 0.02, y0, y0 + 0.02):
        xs = [x for x in xhits(y, z) if x > 0.01]
        if len(xs) >= 3 and xs[1] - xs[2] > 0.006 and (best is None or xs[1] - xs[2] > best[1] - best[0]): best = (xs[2], xs[1])
    if best: GAPS[round(float(z), 3)] = (float(best[0]), float(best[1]))
APZ = max(GAPS); APX = GAPS[APZ][0]
def arm_split(z):                                               # 这一高度身子和手臂之间的 x（没分开 = 不管）
    ks = [k for k in GAPS if abs(k - z) <= 0.011]
    return (GAPS[min(ks, key=lambda k: abs(k - z))][0] + GAPS[min(ks, key=lambda k: abs(k - z))][1]) / 2 if ks else None
_arm = np.array([p for p in bv[(bv[:, 2] < APZ + 0.005) & (bv[:, 0] > 0.02)] if (sp := arm_split(p[2])) is not None and p[0] > sp])
HAND_TIP = _arm[_arm[:, 2] < _arm[:, 2].min() + 0.01].mean(0)
SHO = np.array([APX + 0.035, 0.0, (APZ + NECK) / 2 - 0.01])     # 肩关节
def arm_pt(f):                                                  # 肩→手尖连线上 f 处，按那一高度手臂顶点的中心修正
    p = SHO + (HAND_TIP - SHO) * f; s = _arm[np.abs(_arm[:, 2] - p[2]) < 0.012]
    return np.array([s[:, 0].mean(), s[:, 1].mean(), p[2]]) if len(s) > 3 else p
ELBOW, WRIST = arm_pt(0.47), arm_pt(0.78); SHO[1] = yc(SHO[2] - 0.04)
HIPZ = CROTCH + 0.012; KNEE = ANKLE + (HIPZ - ANKLE) * 0.49
LM = {k: round(float(v), 4) for k, v in dict(neck=NECK, chin=CHIN, crotch=CROTCH, leg_x=LX, ankle=ANKLE, toe_y=TOE_Y, armpit_z=APZ, armpit_x=APX, knee=KNEE).items()}
LM.update(hand_tip=[round(float(x), 3) for x in HAND_TIP], shoulder=[round(float(x), 3) for x in SHO], elbow=[round(float(x), 3) for x in ELBOW], wrist=[round(float(x), 3) for x in WRIST])
# 旧身体（1.152 高）上手调过的高度 → 新身体：身子按 胯～脖子 对应，腿按 0～胯 对应
mt = lambda z: HIPZ + (z - 0.27) * (NECK - 0.045 - HIPZ) / (0.64 - 0.27)
ml = lambda z: z * HIPZ / 0.27
def ears(P, z0, z1):
    s = P[(P[:, 2] > z0) & (P[:, 2] < z1)]; mx = np.abs(s[:, 0]).max(); e = s[np.abs(s[:, 0]) > 0.93 * mx]; return e.mean(0)
EAR_B = ears(bv, CHIN, TOP)
REP['body'] = {'height': round(float(TOP), 4), 'chin': round(float(CHIN), 4), 'head_H': round(float(H_BODY), 4), 'head_ratio': round(float(H_BODY / TOP), 4), 'landmarks': LM}
log('body head H', H_BODY, 'ratio', H_BODY / TOP, LM)
HR = CFG.get('head_ratio', 0.30)
if abs(H_BODY / TOP - HR) > 0.025: REP['warn'].append(f'头高 ÷ 全身高 = {H_BODY / TOP:.3f}（设计 18v：约 {HR}）')
B_ORIG = bvh(B)                                            # 原来的头（发型对齐用）

# ---------------------------------------------------------------- 2. 标准头：等比例，头高 = 原来的头高，下巴对齐，左右居中，前后按耳朵
Hd, hcol, hnrm = imp(CFG['head'], 'Head')
hv = V(Hd); h_top, h_chin = hv[:, 2].max(), hv[:, 2].min(); H_STD = h_top - h_chin
S_HEAD = H_BODY / H_STD
EAR_H = ears(hv, h_chin, h_top)
cx = (hv[:, 0].min() + hv[:, 0].max()) / 2
T_HEAD = np.array([-cx * S_HEAD, EAR_B[1] - EAR_H[1] * S_HEAD, CHIN - h_chin * S_HEAD])
setV(Hd, hv * S_HEAD + T_HEAD)
REP['head_scale'] = round(float(S_HEAD), 4)
log('head scale', S_HEAD)

# 18f 检查用的 5 个数（标准头自己的坐标，等比例缩放不会改）：最宽头宽、眼睛中线、嘴、嘴那一高度的脸宽、0.9H 的脸宽
def head_ratios(o, img, top, chin):
    P = V(o); H = top - chin; col = vertcols(o, img); lum = col.mean(1)
    def width_at(z, front_only=True):
        s = P[(np.abs(P[:, 2] - z) < 0.006 * H / 0.45) & ((P[:, 1] < P[:, 1].mean()) if front_only else True)]
        return (s[:, 0].max() - s[:, 0].min()) / H if len(s) else float('nan')
    face = (P[:, 1] < np.percentile(P[:, 1], 18))
    sat = col.max(1) - col.min(1)                                  # 眼白：脸正面、很亮、没颜色
    eye = P[face & (lum > 0.78) & (sat < 0.12) & (np.abs(P[:, 0]) > 0.08 * H) & (np.abs(P[:, 0]) < 0.42 * H) & (P[:, 2] > chin + 0.2 * H)]
    eye_y = (top - np.median(eye[:, 2])) / H if len(eye) else float('nan')
    red = col[:, 0] - col[:, 1]
    mouth = P[face & (np.abs(P[:, 0]) < 0.12 * H) & (P[:, 2] < chin + 0.35 * H) & (P[:, 2] > chin + 0.08 * H) & ((lum < 0.45) | (red > 0.18))]
    mouth_y = (top - np.median(mouth[:, 2])) / H if len(mouth) else float('nan')
    ws = [width_at(z) for z in np.linspace(chin + 0.45 * H, top - 0.12 * H, 30)]   # 耳朵上面
    return {'头宽': round(float(np.nanmax(ws)), 3), '眼睛中线': round(float(eye_y), 3), '嘴': round(float(mouth_y), 3),
            '嘴那一高度的脸宽': round(float(width_at(top - mouth_y * H)), 3), '0.9H 的脸宽': round(float(width_at(top - 0.9 * H)), 3)}
REF = {'头宽': 0.875, '眼睛中线': 0.62, '嘴': 0.81, '嘴那一高度的脸宽': 0.72, '0.9H 的脸宽': 0.61}
# ---------------------------------------------------------------- 3. 发型头（头发 + 脸一整颗，设计 18f）：按尺子对齐，直接替换身体的头。设计 18v：可以有好几颗（男发型1、女发型1…）
RV = V(Hd)
def band(P, chin, H):                                   # 下巴往上 4%～20% 那一段：宽、中心
    m = (P[:, 2] > chin + 0.04 * H) & (P[:, 2] < chin + 0.20 * H); q = P[m]
    return q[:, 0].max() - q[:, 0].min(), q[:, 1].max() - q[:, 1].min(), (q[:, 0].max() + q[:, 0].min()) / 2, (q[:, 1].max() + q[:, 1].min()) / 2
wR, dR, xR, yR = band(RV, CHIN, H_BODY)
REP['ruler'] = {'chin': round(float(CHIN), 4), 'top': round(float(TOP), 4), 'H': round(float(H_BODY), 4)}
RULER_BVH = bvh(Hd)
bpy.ops.object.select_all(action='DESELECT'); Hd.select_set(True); bpy.context.view_layer.objects.active = Hd
bpy.ops.export_scene.gltf(filepath=OUT + '/ruler_check.glb', use_selection=True, export_format='GLB', export_image_format='JPEG')
bpy.data.objects.remove(Hd)
XR = (RV[:, 0].min() + RV[:, 0].max()) / 2; WR = RV[:, 0].max() - RV[:, 0].min()   # 五官区只在脸中间（不碰鬓角）
def poly_tris(o, sel):
    uv = o.data.uv_layers.active.data; T = []
    for p_ in o.data.polygons:
        if not sel[p_.index]: continue
        li = list(p_.loop_indices)
        for k in range(1, len(li) - 1): T.append([uv[li[0]].uv[:], uv[li[k]].uv[:], uv[li[k + 1]].uv[:]])
    return np.array(T, np.float32)
HAIRS = CFG.get('hairheads') or [{'id': 'm1', 'name': '男发型 1', 'glb': CFG['hairhead'], 'sex': 'm'}]
def load_hairhead(spec):
    hid = spec['id']; REPH = {}
    HH, hhcol, hhnrm = imp(spec['glb'], 'HairHead_' + hid)
    P0 = V(HH)
    # 下巴、脸宽只看皮肤色的面（女发型1 有双马尾垂到下巴以下，不能拿最低点当下巴、拿最宽当脸宽）
    _fc = facecols(HH, hhcol); _ce = np.array([p_.center[:] for p_ in HH.data.polygons])
    _sk = _ce[((_fc.max(1) - _fc.min(1)) > 0.25) & (_fc.mean(1) > 0.35)]; _xm = np.median(_sk[:, 0])
    c0 = float(_sk[np.abs(_sk[:, 0] - _xm) < 0.2 * np.ptp(_sk[:, 0]), 2].min())
    def bandS(chin, H):                                 # 皮肤面定出脸的左右范围（放宽 25%，鬓角算进来），范围里的所有顶点量宽、深、中心（双马尾在范围外）
        m = (_sk[:, 2] > chin + 0.04 * H) & (_sk[:, 2] < chin + 0.20 * H); lo, hi = np.percentile(_sk[m, 0], [1, 99]); xc_, hw = (lo + hi) / 2, (hi - lo) / 2 * 1.25
        q = P0[(P0[:, 2] > chin + 0.04 * H) & (P0[:, 2] < chin + 0.20 * H) & (np.abs(P0[:, 0] - xc_) < hw)]
        return q[:, 0].max() - q[:, 0].min(), q[:, 1].max() - q[:, 1].min(), (q[:, 0].max() + q[:, 0].min()) / 2, (q[:, 1].max() + q[:, 1].min()) / 2
    s_ = S_HEAD                                           # 从标准头的倍数开始（发型头跟标准头差不多大）
    for it in range(4):                                     # 这一段在发型头里的高度跟倍数有关，迭代几次
        wH, dH, xH, yH = bandS(c0, H_BODY / s_); s_ = wR / wH
    wH, dH, xH, yH = bandS(c0, H_BODY / s_)
    S_HH = s_; T_HH = np.array([xR - xH * S_HH, yR - yH * S_HH, CHIN - c0 * S_HH])
    setV(HH, P0 * S_HH + T_HH)
    REPH.update({'scale': round(float(S_HH), 4), 'scale_vs_ruler': round(float(S_HH / S_HEAD), 4), 'depth_diff': round(float(dH * S_HH / dR - 1), 4)})
    # 眼睛高度（眼白：正面、很亮、没颜色）→ 跟尺子比（尺子眼睛中线在头顶往下 0.62H）
    _P1 = _ce * S_HH + T_HH; _fr = _P1[:, 1] < np.percentile(_P1[:, 1], 25)
    _ey = _P1[_fr & (_fc.mean(1) > 0.8) & ((_fc.max(1) - _fc.min(1)) < 0.12) & (_P1[:, 2] > CHIN + 0.1 * H_BODY) & (_P1[:, 2] < CHIN + 0.7 * H_BODY) & (np.abs(_P1[:, 0] - xR) < 0.35 * wR)]
    REPH['eye_line'] = round(float((TOP - np.median(_ey[:, 2])) / H_BODY), 3) if len(_ey) > 5 else None
    if not 0.95 <= S_HH / S_HEAD <= 1.05: REP['warn'].append(f'{hid} 发型头倍数（相对标准头）{S_HH / S_HEAD:.3f} 不在 0.95～1.05')
    if abs(REPH['depth_diff']) > 0.03: REP['warn'].append(f"{hid} 发型头深度跟标准头差 {REPH['depth_diff'] * 100:.1f}%（超过 3%）")
    log('hairhead', hid, 'scale', S_HH, REPH)
    # 头发遮罩：贴图里没颜色（灰）的 = 头发；肉色、眼睛、眉毛、嘴、腮红不是。脸那一块（贴着脸、在眉毛以下）的再排除一次
    hp = pix(hhcol); Hh_, Wh_ = hp.shape[:2]
    sat = hp.max(2) - hp.min(2); lum = hp.mean(2)
    mask = np.clip((0.17 - sat) / 0.05, 0, 1) * np.clip((lum - 0.16) / 0.06, 0, 1)
    # 脸部五官区：发型头正面、下巴往上 0～0.68H 内，离尺子脸面 < 6 毫米的面所占的贴图区域 → 不算头发（刘海浮在脸前面，不受影响）
    uvl = HH.data.uv_layers.active.data; face_px = np.zeros((Hh_, Wh_), bool)
    for poly in HH.data.polygons:
        c = poly.center
        if c.y > yR or c.z > CHIN + 0.68 * H_BODY or abs(c.x - XR) > 0.34 * WR: continue
        loc, nor, idx, d = RULER_BVH.find_nearest(c)
        if loc is None or abs((c - loc).dot(nor)) > 0.006: continue
        uv = np.array([uvl[i].uv[:] for i in poly.loop_indices]); x0, y0 = (uv.min(0) * [Wh_, Hh_]).astype(int); x1, y1 = (uv.max(0) * [Wh_, Hh_]).astype(int) + 1
        face_px[max(0, y0):y1, max(0, x0):x1] = True
    mask[face_px] = 0
    # 身体肤色：脸颊中间（眼睛下面、鼻子两边，不含腮红）的平均颜色
    chk = []
    for poly in HH.data.polygons:
        c = poly.center; dx = abs(c.x - XR)
        if c.y > yR or not (CHIN + 0.20 * H_BODY < c.z < CHIN + 0.32 * H_BODY) or not (0.10 * WR < dx < 0.24 * WR): continue
        loc, nor, idx, d = RULER_BVH.find_nearest(c)
        if loc is None or abs((c - loc).dot(nor)) > 0.006: continue
        uv = np.array([uvl[i].uv[:] for i in poly.loop_indices]).mean(0); chk.append(hp[min(Hh_ - 1, int(uv[1] * Hh_)), min(Wh_ - 1, int(uv[0] * Wh_))])
    chk = np.array(chk); rg = chk[:, 0] - chk[:, 1]; keep = rg <= np.median(rg) + 0.02          # 偏红的（腮红）不算
    CHEEK = chk[keep].mean(0) if len(chk) > 5 else None
    if CHEEK is None or (CHEEK.max() - CHEEK.min()) < 0.2:                 # 量到的不像皮肤（脸的位置跟尺子差得多）→ 改用整颗头上皮肤色面的中位数
        _f = facecols(HH, hhcol); _s = _f.max(1) - _f.min(1); _m = (_s > 0.25) & (_s < 0.45) & (_f.mean(1) > 0.55); _rg = _f[:, 0] - _f[:, 1]; _m &= _rg <= (np.percentile(_rg[_m], 70) if _m.sum() > 20 else 9)   # 偏红的 30%（腮红、嘴）不算
        if _m.sum() > 20: CHEEK = np.median(_f[_m], 0); REPH['cheek_fallback'] = True
    REPH['cheek_samples'] = int(keep.sum()) if len(chk) > 5 else 0
    # 头发里的小块肉色斑也算头发：按网格连起来找「不是头发」的面，只有连成一大片的（脸）才算脸，小块的填成头发
    fc = facecols(HH, hhcol); fsat = fc.max(1) - fc.min(1); flum = fc.mean(1)
    bm = bmesh.new(); bm.from_mesh(HH.data); bm.faces.ensure_lookup_table()
    nonhair = (fsat > 0.17) | (flum < 0.16)
    for poly in HH.data.polygons:                                   # 五官区里的面也算脸
        c = poly.center
        if c.y <= yR and c.z <= CHIN + 0.55 * H_BODY and abs(c.x - XR) <= 0.34 * WR:
            loc, nor, idx, d = RULER_BVH.find_nearest(c)
            if loc is not None and abs((c - loc).dot(nor)) <= 0.003 and (fsat[poly.index] > 0.12 or flum[poly.index] > 0.78 or flum[poly.index] < 0.16): nonhair[poly.index] = True   # 只算贴着脸、颜色不像头发的（眼白、睫毛、皮肤）；贴在额头上的刘海尖是灰的，算头发
    nb_ = 0; HHB = bvh(HH)
    # 两只眼睛的框（眼白面的范围，四周放大 1 厘米）
    _E = np.array([p_.center[:] for p_ in HH.data.polygons if p_.center.y <= yR and fc[p_.index].mean() > 0.8 and (fc[p_.index].max() - fc[p_.index].min()) < 0.12 and CHIN + 0.08 * H_BODY < p_.center.z < CHIN + 0.7 * H_BODY and abs(p_.center.x - XR) < 0.36 * WR])
    EYEB = [(_E[s_ * (_E[:, 0] - XR) > 0].min(0) - 0.01, _E[s_ * (_E[:, 0] - XR) > 0].max(0) + 0.01) for s_ in (1, -1) if len(_E) and (s_ * (_E[:, 0] - XR) > 0).sum() > 3]
    in_eye = lambda c: any(all(lo[k] <= c[k] <= hi[k] for k in (0, 2)) for lo, hi in EYEB)
    for poly in HH.data.polygons:                                   # 刘海尖（贴图上带了肤色）：往里打一条线 1.5 厘米内碰到自己的另一层（额头）= 浮在前面的头发
        c = poly.center
        if not nonhair[poly.index] or c.y > yR or c.z < CHIN + 0.30 * H_BODY or flum[poly.index] < 0.16 or fsat[poly.index] > 0.30: continue
        n_ = poly.normal; hit = HHB.ray_cast(c - n_ * 0.0008, -n_, 0.015)
        if hit[0] is not None and hit[2] != poly.index: nonhair[poly.index] = False; nb_ += 1
    for poly in HH.data.polygons:                                   # 额头、鼻梁上被烘焙上头发影子的地方（灰米色，不像皮肤）：算头发，跟着染
        c = poly.center; col = fc[poly.index]
        if not nonhair[poly.index] or c.y > yR or not (CHIN + 0.30 * H_BODY < c.z < CHIN + 0.75 * H_BODY): continue
        if 0.35 < flum[poly.index] < 0.76 and (col[0] - col[2]) < 0.23 and fsat[poly.index] < 0.25: nonhair[poly.index] = False; nb_ += 1
    for poly in HH.data.polygons:                                   # 设计 18v：脸颊两边垂下来的鬓发（女发型1）：灰 / 白（高光）、浮在脸前面 → 头发（只看下巴往上 0.3H 以内，眼睛以下）
        c = poly.center
        if not nonhair[poly.index] or c.y > yR or not (CHIN - 0.01 < c.z < CHIN + 0.30 * H_BODY) or fsat[poly.index] > 0.17 or in_eye(c): continue
        n_ = poly.normal; hit = HHB.ray_cast(c - n_ * 0.0008, -n_, 0.02)
        if hit[0] is not None and hit[2] != poly.index: nonhair[poly.index] = False; nb_ += 1
    # 设计 18y 复查：发梢（鬓发末端、双马尾末端）上烘焙的深棕 / 白色高光被当成脸，游戏里不染色 → 白点。
    #   「不是头发」的面里，颜色不像皮肤（耳朵、腮红这种偏红的也算皮肤）、又不在五官区（眼睛眉毛一条、嘴一小块）的 → 算头发
    TIPFIX = spec.get('tip_fix', False)                               # 只给配置里写了 tip_fix 的发型头做（女发型1）；男发型1 原来就对
    nt_ = 0; he_ = 1 - (REPH.get('eye_line') or 0.62)                    # 眼睛中线在下巴往上多少（按这颗头自己量的）
    for poly in (HH.data.polygons if TIPFIX else []):
        if not nonhair[poly.index]: continue
        c = poly.center; col = fc[poly.index]; dx = abs(c.x - XR); h_ = (c.z - CHIN) / H_BODY
        skinish = (col[0] - col[2] > 0.2 and col[0] >= col[1] >= col[2] - 0.02 and flum[poly.index] > 0.35 and fsat[poly.index] > 0.17)
        feature = c.y <= yR and ((he_ - 0.14 < h_ < he_ + 0.32 and dx < 0.33 * WR) or (0.02 < h_ <= he_ - 0.14 and dx < 0.14 * WR))
        far = dx > 0.55 * WR or h_ < -0.02                                   # 耳朵外面（双马尾）、下巴下面（发梢）
        chd = np.linalg.norm(col / max(col.sum(), 1e-3) - (CHEEK / CHEEK.sum() if CHEEK is not None else np.array([0.4, 0.33, 0.27])))
        realskin = chd < 0.05 and flum[poly.index] > 0.4 and fsat[poly.index] > 0.28   # 发梢的棕色饱和度低，皮肤高
        grayish = fsat[poly.index] < 0.12 and flum[poly.index] > 0.5                     # 发梢的白色高光
        if feature: grayish = False
        if 0.13 * WR < dx < 0.42 * WR and h_ < he_ + 0.05 and not in_eye(c) and (dx < 0.3 * WR or not realskin):   # 耳朵（肤色、在外面）也是浮着的，不算            # 脸颊两边的鬓发末端（贴图上画成了肤色 / 白色）：浮在脸前面 4 厘米内 → 头发（眼睛框里的不算，眼白也是浮着的）
            n_ = poly.normal; hit = HHB.ray_cast(c - n_ * 0.0008, -n_, 0.04)
            if hit[0] is not None and hit[2] != poly.index: grayish = True; realskin = False
        if (far and not realskin) or grayish: nonhair[poly.index] = False; nt_ += 1   # 只管离脸远的（双马尾、鬓发末端）；脸上暗一点的皮肤不动，贴着脸的鬓发末端交给下面「浮在脸前面」的判断
    ne_ = 0
    for poly in (HH.data.polygons if TIPFIX else []):                                   # 眼睛框里的眼白（白、没颜色）一定是脸，不染发色（女发型1 的脸跟尺子对不齐，前面「贴着尺子」的判断管不到，眼白被当成头发）
        if nonhair[poly.index] or poly.center.y > yR or not in_eye(poly.center) or flum[poly.index] < 0.72 or fsat[poly.index] > 0.15: continue
        n_ = poly.normal; hit = HHB.ray_cast(poly.center - n_ * 0.0008, -n_, 0.015)
        if hit[0] is None or hit[2] == poly.index: nonhair[poly.index] = True; ne_ += 1     # 浮在前面的是刘海，不动
    REPH['eye_white_faces'] = ne_
    REPH['tip_faces'] = nt_
    REPH['bang_tip_faces'] = nb_
    area = np.array([f.calc_area() for f in bm.faces]); seen = np.zeros(len(bm.faces), bool); comps = []
    for f in bm.faces:
        if seen[f.index] or not nonhair[f.index]: continue
        st = [f]; g = []; seen[f.index] = True
        while st:
            x = st.pop(); g.append(x.index)
            for e in x.edges:
                for y in e.link_faces:
                    if not seen[y.index] and nonhair[y.index]: seen[y.index] = True; st.append(y)
        comps.append(g)
    bm.free()
    tot = area[nonhair].sum(); filled = 0
    for g in comps:
        if area[g].sum() < 0.03 * tot:                              # 小块 = 头发里的斑
            for fi in g:
                uv = np.array([uvl[i].uv[:] for i in HH.data.polygons[fi].loop_indices]); x0, y0 = (uv.min(0) * [Wh_, Hh_]).astype(int); x1, y1 = (uv.max(0) * [Wh_, Hh_]).astype(int) + 1
                mask[max(0, y0):y1, max(0, x0):x1] = 1.0
            filled += 1
            nonhair[g] = False
    REPH['hair_spots_filled'] = filled
    # 头发遮罩按面来定（不按像素颜色）：大块「不是头发」的面（脸、耳朵）和五官区 = 脸，其余全是头发。
    # 用减面前的面在贴图上画出来，带棕色 / 米色的发片也算头发，不会有漏染的斑
    upper = np.array([p_.center.z > CHIN + 0.55 * H_BODY for p_ in HH.data.polygons])   # 眉毛以上「脸」的面（额头、发际线）：这里按像素颜色分，画着头发的地方也染
    np.save(OUT + f'/hair_tris_{hid}.npy', poly_tris(HH, ~nonhair)); np.save(OUT + f'/skin_tris_{hid}.npy', poly_tris(HH, nonhair & ~upper)); np.save(OUT + f'/upper_tris_{hid}.npy', poly_tris(HH, nonhair & upper))
    REPH['hair_faces_pct'] = round(float((~nonhair).mean()), 3)
    _FC = np.array([p_.center[:] for p_ in HH.data.polygons]); _FN = np.array([p_.normal[:] for p_ in HH.data.polygons]); _FH = ~nonhair.copy()
    # 发型头自己的脖子（下巴以下、不是头发的面）删掉，露出身体的脖子（身体肤色 = 脸的肤色），接缝藏在下巴里
    bm = bmesh.new(); bm.from_mesh(HH.data); bm.faces.ensure_lookup_table()
    dl = [f for f in bm.faces if nonhair[f.index] and f.calc_center_median().z < CHIN - 0.004]
    REPH['hairhead_neck_faces_removed'] = len(dl)
    bmesh.ops.delete(bm, geom=dl, context='FACES'); bm.to_mesh(HH.data); bm.free(); HH.data.update()
    # 减面
    # 每个面是不是头发（按面分好的结果）记下来（面中心 + 法线），减面后按最近的原来的面查；顶点颜色按它 + 贴图遮罩（18y 复查：鬓发末端 UV 跟脸重叠，贴图遮罩算成脸 → 白点）
    # 设计 18v：头高（头顶 → 下巴）统一 = 第一颗头（男发型1）：别的头以下巴为中心等比例放大 / 缩小
    global REF_TOP
    P2 = V(HH); top_ = float(P2[:, 2].max())
    if REF_TOP is None: REF_TOP = top_; REPH['height_scale'] = 1.0
    else:
        k2 = (REF_TOP - CHIN) / max(1e-4, top_ - CHIN); c2 = np.array([xR, yR, CHIN]); setV(HH, c2 + (P2 - c2) * k2); _FC = c2 + (_FC - c2) * k2
        REPH['height_scale'] = round(float(k2), 4); REPH['scale'] = round(float(S_HH * k2), 4)
    REPH['head_top'] = round(float(V(HH)[:, 2].max()), 4)
    decimate(HH, spec.get('faces', CFG.get('hairhead_faces', 15000)))
    REPH['hair_mask_pct'] = round(float(mask.mean()), 3)
    HH['hair'] = hid; HH['hair_name'] = spec.get('name', hid); HH['sex'] = spec.get('sex', '')
    HH['hy0'] = round(float(CHIN + 0.04), 4); HH['hy1'] = round(float(TOP + 0.10), 4)       # 游戏里发色渐变的范围（发尾 → 发根，模型坐标的高度）
    REP['hairheads'][hid] = REPH
    return dict(obj=HH, col=hhcol, nrm=hhnrm, hp=hp, cheek=CHEEK, id=hid, fc=_FC, fn=_FN, fh=_FH)
REP['hairheads'] = {}; REF_TOP = None
HEADS = [load_hairhead(sp) for sp in HAIRS]

# ---------------------------------------------------------------- 4. 套装（设计 18q / 18v）：整套直接用，不切开、不换色。
#   设计 18v（定死，10-18 最新）：「标准脖子接口」
#   - 标准脖子 = 基础身体2 自己的脖子（脖子中间 → 下巴底下，上端伸进发型头里 1.2 厘米），跟发型头对好一次，所有套装共用
#   - 每套套装在「脖子中间」那一圈（固定高度）截平，工具自动把标准脖子焊上去（截口两圈顶点对齐、平滑）；领口不碰
#   - 自动检查：套装脖子在截口的粗细跟标准脖子差 > 8%、截口以上有衣服（领子太高）→ 报出来
#   配置 outfits: [{"id": "xy_blue", "name": "学院风 蓝", "glb": ".../套装_xxx.glb", "skin_legs": true}, ...]
OUTFITS = CFG.get('outfits') or [{'id': 'tee_test', 'name': 'T 恤长裤（测试）', 'glb': CFG['cloth']}]
_nk = sl(NECK - 0.016, NECK - 0.008); _nk = _nk[np.abs(_nk[:, 0]) < 0.07]                  # 脖子中心：脖子最细处下面一点（再往上会量到下巴，中心往前偏）
NCX = float((_nk[:, 0].min() + _nk[:, 0].max()) / 2); NCY = float((_nk[:, 1].min() + _nk[:, 1].max()) / 2)
HBVH = [bvh(h['obj']) for h in HEADS]
def head_under(x, y):                                     # 这个位置正上方，每颗发型头最下面的高度（取最高的那颗：脖子要伸进每颗头里）；头不在正上方 = None
    zs_ = []
    for T_ in HBVH:
        hit = T_.ray_cast(Vector((x, y, CHIN - 0.15)), Vector((0, 0, 1)), 0.6)
        if hit[0] is None: return None
        zs_.append(hit[0].z)
    return max(zs_)
def skin_like(c, ref):                                     # 跟套装自己头上的肤色比：色相（r,g,b 占比）差 < 0.02 = 皮肤；粉色衣服偏蓝，不会被当成皮肤
    ch = c / np.maximum(c.sum(1, keepdims=True), 1e-3); rch = ref / max(ref.sum(), 1e-3)
    return (np.linalg.norm(ch - rch, axis=1) < 0.02) & (ch[:, 2] < 0.29) & (c.mean(1) > 0.6 * ref.mean())
def skin_loose(c):                                         # 阴影里的皮肤（偏红、偏暗）：r 占比比 b 高 0.1 以上、b 占比低
    ch = c / np.maximum(c.sum(1, keepdims=True), 1e-3); return ((ch[:, 0] - ch[:, 2]) > 0.10) & (ch[:, 2] < 0.29) & (c.mean(1) > 0.12)
def ring_r(P, z, rmax, dz=0.003):                          # 某一高度、离脖子中心 rmax 以内的顶点：中位半径、按角度（36 份）的半径
    s = P[(np.abs(P[:, 2] - z) < dz) & (np.hypot(P[:, 0] - NCX, P[:, 1] - NCY) < rmax)]
    if len(s) < 6: return None, None
    r = np.hypot(s[:, 0] - NCX, s[:, 1] - NCY); a = np.arctan2(s[:, 1] - NCY, s[:, 0] - NCX); bi = ((a + np.pi) / (2 * np.pi) * 36).astype(int) % 36
    prof = np.array([np.median(r[bi == k]) if (bi == k).any() else np.nan for k in range(36)]); ok = ~np.isnan(prof)
    prof = np.interp(np.arange(36), np.arange(36)[ok], prof[ok], period=36) if ok.any() else prof
    return float(np.median(r)), prof
# 脖子根（往下第一次比脖子最细处宽 1.5 倍的高度）→ 截口 = 脖子根和下巴底下的正中间
_nw = np.ptp(sl(NECK - 0.003, NECK + 0.003)[:, 0]) / 2
NECK_BASE = next((float(z) for z in np.arange(NECK, NECK - 0.12, -0.002) if np.ptp(sl(z - 0.003, z + 0.003)[:, 0]) / 2 > 1.5 * _nw), NECK - 0.03)
Z_CUT = CFG.get('neck_cut', round((NECK_BASE + CHIN) / 2, 4))
NR0, NPROF = ring_r(bv, Z_CUT, 0.09)
REP['std_neck'] = {'neck_base': round(NECK_BASE, 4), 'cut_z': Z_CUT, 'chin': round(CHIN, 4), 'radius': round(NR0, 4)}
# 标准脖子：按基础身体2 的脖子量出来的形状（每个高度、按角度 36 份的半径）做一根干净的管子：
#   下端 = 套装截口往下 OVL（插进套装脖子里面），上端 = 正上方发型头的最低处 + neck_in（伸进头里，后脑那边头底高就伸得高）
#   脖子最细处以上（下巴底下）按最细处的形状直着往上；下端 1/3 慢慢变成套装截口那一圈的粗细（× 0.985，插在里面）
NECK_IN = CFG.get('neck_in', 0.012); OVL = CFG.get('neck_overlap', 0.006)
_BP = {}
def body_prof(z):
    k = round(min(z, NECK - 0.006) / 0.002)                 # 脖子最细处再往下一点以上都按这一圈（再往上量会量到下巴）
    if k not in _BP: _BP[k] = ring_r(bv, k * 0.002, 0.07)[1]
    return _BP[k]
_tops = []
for k in range(36):
    a_ = -math.pi + (k + 0.5) * 2 * math.pi / 36; r_ = body_prof(NECK)[k] * 0.9
    zh = head_under(NCX + r_ * math.cos(a_), NCY + r_ * math.sin(a_)); _tops.append((zh if zh is not None else CHIN + 0.01) + NECK_IN)
NECK_TOP = np.array(_tops)
REP['std_neck'].update(top_z=[round(float(NECK_TOP.min()), 4), round(float(NECK_TOP.max()), 4)])
log('std neck', REP['std_neck'])
def make_neck(zc, oprof, name):
    """标准脖子管子（36 × 12 个点），返回新物体"""
    me = bpy.data.meshes.new(name); NR_, NA_ = 12, 36; z0 = zc - OVL; vs = []
    for i in range(NR_):
        u = i / (NR_ - 1)
        for k in range(NA_):
            a_ = -math.pi + (k + 0.5) * 2 * math.pi / NA_; z_ = z0 + (NECK_TOP[k] - z0) * u
            rb = body_prof(z_)[k]
            t = float(np.clip((z_ - zc) / 0.03, 0, 1))   # 3 厘米内慢慢变回标准粗细（太短会像一个台阶）; t = t * t * (3 - 2 * t)
            r_ = rb + (oprof[k] * 0.985 - rb) * (1 - t) if oprof is not None else rb
            if u > 0.85: r_ *= 1 - (u - 0.85) * 0.3            # 最上面往里收一点（在头里面，不会从头的侧面穿出来）
            vs.append((NCX + r_ * math.cos(a_), NCY + r_ * math.sin(a_), z_))
    fs = [(i * NA_ + k, i * NA_ + (k + 1) % NA_, (i + 1) * NA_ + (k + 1) % NA_, (i + 1) * NA_ + k) for i in range(NR_ - 1) for k in range(NA_)]
    me.from_pydata(vs, [], fs); me.update()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    for p_ in o.data.polygons: p_.use_smooth = True
    return o
REP['outfits'] = {}
def build_outfit(spec):
    C, ccol, cnrm = imp(spec['glb'], 'Outfit_' + spec['id'])
    cv = V(C); sc_ = TOP / cv[:, 2].max()                                # 按身高缩放（套装是照着 身体参考2 生成的，脖子高度对得上）
    cv = cv * sc_; cv[:, 0] -= (cv[:, 0].min() + cv[:, 0].max()) / 2 - (bv[:, 0].min() + bv[:, 0].max()) / 2
    cv[:, 1] += np.median(bv[bv[:, 2] < CHIN, 1]) - np.median(cv[cv[:, 2] < CHIN, 1]); cv[:, 2] -= cv[:, 2].min()
    setV(C, cv)
    R = {'scale': round(float(sc_), 4), 'glb': os.path.basename(spec['glb'])}
    fc = facecols(C, ccol); cen = np.array([p_.center[:] for p_ in C.data.polygons]); rr = np.hypot(cen[:, 0] - NCX, cen[:, 1] - NCY)
    # 套装自带的（光）头脸颊的颜色 = 这套的肤色参考
    hs = (cen[:, 2] > CHIN + 0.2 * H_BODY) & (cen[:, 2] < CHIN + 0.45 * H_BODY) & (cen[:, 1] < NCY - 0.05) & (np.abs(cen[:, 0] - NCX) < 0.08)
    SKREF = np.median(fc[hs], 0) if hs.sum() > 10 else np.array([0.8, 0.65, 0.55]); R['skin_ref'] = '#%02x%02x%02x' % tuple(int(min(1, x) * 255) for x in SKREF)
    fsk = skin_like(fc, SKREF) | skin_loose(fc)
    # 自动检查 2：截口以上、下巴以下、脖子周围有不是皮肤的东西（领子太高）→ 报出来，截口自动挪到领子上面一点（标准脖子跟着按新截口切）
    up = (cen[:, 2] > Z_CUT - 0.003) & (cen[:, 2] < CHIN - 0.004) & (rr < 0.11) & ~fsk & (fc.mean(1) > 0.3)
    zc = Z_CUT; R['cloth_above_cut'] = int(up.sum())
    if up.sum() > 10:
        ct = float(np.percentile(cen[up, 2], 98)); zc = float(min(ct + 0.004, CHIN - 0.004)); R['collar_top'] = round(ct, 4)
        REP['warn'].append(f"{spec['id']} 截口以上有衣服（领子到 {ct:.3f}，比截口 {Z_CUT:.3f} 高 {(ct - Z_CUT) * 100:.1f} 厘米）→ 这套截口自动挪到 {zc:.3f}")
    R['cut_z'] = round(zc, 4)
    # 自动检查 1：套装脖子在截口那一圈的粗细 vs 标准脖子
    NPROFc = body_prof(zc); NR0c = float(np.median(NPROFc))          # 标准脖子在截口的粗细（下巴以上按脖子最细处那一圈）
    ro, OPROF = ring_r(cv, zc - 0.003, NR0c * 1.6); NR = ro or NR0c          # 截口下面一点量（截口以上是要切掉的）
    R['neck_r_std'] = round(NR0c, 4); R['neck_r_at_cut'] = round(ro, 4) if ro else None; R['neck_r_diff'] = round(ro / NR0c - 1, 3) if ro else None
    # 截口以上全切掉（头、套装自己的上半截脖子）
    bm = bmesh.new(); bm.from_mesh(C.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, zc), plane_no=(0, 0, 1), clear_outer=True)
    bm.to_mesh(C.data); bm.free(); C.data.update(); drop_small(C, 0.004)
    # 截口下面一点、离脖子远的皮肤色 / 深色面 = 套装自带的头的下颌底面（这套的头比较低），删掉；领子（浅色布）不动
    _fc = facecols(C, ccol); _ce = np.array([p_.center[:] for p_ in C.data.polygons]); _rr = np.hypot(_ce[:, 0] - NCX, _ce[:, 1] - NCY)
    _nzs = np.array([p_.normal.z for p_ in C.data.polygons])
    NRb = float(np.median(body_prof(zc))); R['neck_r_body'] = round(NRb, 4)
    _bk = ((np.arctan2(_ce[:, 1] - NCY, _ce[:, 0] - NCX) + np.pi) / (2 * np.pi) * 36).astype(int) % 36
    _thr = (np.minimum(OPROF, NPROFc * 1.35)[_bk] * 1.25) if OPROF is not None else np.full(len(_ce), NRb * 1.4); _thr = np.maximum(_thr, NRb * 1.4)   # 比这套自己的脖子粗 25% 以外才算下颌
    _light = (_fc.mean(1) > 0.55) & ~(skin_like(_fc, SKREF) | skin_loose(_fc))
    _jaw = (_ce[:, 2] > zc - 0.015) & (_rr > _thr) & (_rr < 0.2) & (skin_like(_fc, SKREF) | skin_loose(_fc) | (_fc.mean(1) < 0.4))   # 皮肤色或深色（领子是布，不动）
    _nzs2 = np.array([abs(p_.normal.z) for p_ in C.data.polygons])
    _jaw |= (_ce[:, 2] > zc - 0.012) & (_rr > NPROFc[_bk] * 1.15) & (_rr < 0.2) & (_nzs2 > 0.6) & ~_light      # 截口附近平的一圈（这套自己的下巴底面已经开始往外翻了）
    for i_ in np.nonzero((_ce[:, 2] > zc - 0.015) & (_rr > _thr) & (_rr < 0.2) & ~_jaw)[0]:      # 浅色的也算：紧贴在发型头底下（1.5 厘米内），或者头底下没头、跟截口一样高 → 是套装自带的头，不是领子
        zh_ = head_under(_ce[i_, 0], _ce[i_, 1])
        if (zh_ is None and _ce[i_, 2] > zc - 0.008) or (zh_ is not None and zh_ - _ce[i_, 2] < 0.015): _jaw[i_] = True
    R['jaw_faces_removed'] = int(_jaw.sum())
    if _jaw.any(): delete_faces(C, _jaw); drop_small(C, 0.004)
    # 截口那一圈套装脖子的实际粗细（按角度 36 份，取截口上皮肤色的点里最外面的；没有皮肤点就用全部）
    _ids = [v.index for v in C.data.vertices if abs(v.co.z - zc) < 1e-4 and math.hypot(v.co.x - NCX, v.co.y - NCY) < NR0c * 1.8]
    OPROF2 = None
    if len(_ids) >= 8:
        _sel = np.array([C.data.vertices[i].co[:] for i in _ids])
        _r = np.hypot(_sel[:, 0] - NCX, _sel[:, 1] - NCY); _b = ((np.arctan2(_sel[:, 1] - NCY, _sel[:, 0] - NCX) + np.pi) / (2 * np.pi) * 36).astype(int) % 36
        _p = np.array([_r[_b == k].max() if (_b == k).any() else np.nan for k in range(36)]); _ok = ~np.isnan(_p)   # 最外面那层（里面可能还有一层内壁）
        _p = np.interp(np.arange(36), np.arange(36)[_ok], _p[_ok], period=36)
        _p = np.array([np.median(np.take(_p, range(k - 2, k + 3), mode='wrap')) for k in range(36)])   # 去掉个别角度的毛刺
        _bp = body_prof(zc); OPROF2 = np.clip(_p, _bp * 0.75, _bp * 1.6)                             # 差太多（量错了）就不跟到底，报警告让人看
    if ro is not None:
        R['neck_r_at_cut'] = round(ro, 4); R['neck_r_diff'] = round(ro / NR0c - 1, 3)
    if ro is None or abs(ro / NR0c - 1) > 0.08: REP['warn'].append(f"{spec['id']} 套装脖子在截口的粗细跟标准脖子差 {((ro / NR0c - 1) * 100 if ro else float('nan')):+.1f}%（超过 8%，已自动把标准脖子下端放粗 / 收细接上）")
    # 标准脖子：做一根，UV 借旁边套装脖子的（皮肤区涂成脸的肤色，贴图看不到），并进套装
    N = make_neck(zc, OPROF2, 'Neck_' + spec['id'])
    uvl = C.data.uv_layers.active.data; kdU = KDTree(len(C.data.vertices)); vuv = {}
    for l in C.data.loops: vuv.setdefault(l.vertex_index, tuple(uvl[l.index].uv))
    for v in C.data.vertices: kdU.insert(v.co, v.index)
    kdU.balance(); N.data.uv_layers.new(); nuv = N.data.uv_layers.active.data
    for l in N.data.loops:
        co, idx, d = kdU.find(N.data.vertices[l.vertex_index].co); nuv[l.index].uv = vuv.get(idx, (0.5, 0.5))
    for m_ in C.data.materials: N.data.materials.append(m_)
    for ca_ in list(C.data.color_attributes): C.data.color_attributes.remove(ca_)
    if C.data.uv_layers.active.name != N.data.uv_layers.active.name: N.data.uv_layers.active.name = C.data.uv_layers.active.name
    nb_ = len(C.data.vertices)
    bpy.ops.object.select_all(action='DESELECT'); N.select_set(True); C.select_set(True); bpy.context.view_layer.objects.active = C; bpy.ops.object.join()
    # 不缝合：标准脖子下端往下多留 OVL（6 毫米）插进套装脖子里面、比截口细 1.5%，两边都是同一个肤色 → 截口一圈看不出来，也不会有缝
    R['weld'] = {'overlap_mm': OVL * 1000, 'neck_top': [round(float(NECK_TOP.min()), 4), round(float(NECK_TOP.max()), 4)], 'inside_pct': 1.5}
    R['neck_r'] = round(NR, 4)
    for p_ in C.data.polygons: p_.use_smooth = True
    if C.data.has_custom_normals: bpy.context.view_layer.objects.active = C; bpy.ops.mesh.customdata_custom_splitnormals_clear()
    decimate(C, spec.get('faces', CFG.get('outfit_faces', 15000)))
    # 顶点颜色：R = 皮肤区（游戏里换成脸的肤色；脚踝以下不算），G = 下巴底下脖子的影子，B = 开口内壁
    vc = vertcols(C, ccol); ca = C.data.color_attributes.new('COLOR_0', 'FLOAT_COLOR', 'POINT')
    strict = skin_like(vc, SKREF); loose = skin_loose(vc)
    nbr = [[] for _ in C.data.vertices]
    for e in C.data.edges: a_, b_ = e.vertices; nbr[a_].append(b_); nbr[b_].append(a_)
    grown = strict.copy()
    for _ in range(8):
        add = [i for i in range(len(grown)) if not grown[i] and loose[i] and any(grown[j] for j in nbr[i])]
        if not add: break
        grown[add] = True
    # 长出来的那部分如果紧挨着衣服（1.5 厘米内）→ 是袖口 / 裤脚里面的内壁，不算皮肤
    cl_ids = [i for i in range(len(grown)) if not grown[i] and vc[i].mean() > 0.3]; kdC = KDTree(len(cl_ids) or 1)
    for j, i in enumerate(cl_ids): kdC.insert(C.data.vertices[i].co, j)
    kdC.balance(); wall = np.zeros(len(grown), bool)
    for i in range(len(grown)):
        if grown[i] and not strict[i] and cl_ids and kdC.find(C.data.vertices[i].co)[2] < 0.015: wall[i] = True
    grown &= ~wall
    if not spec.get('skin_legs'):                                     # 长裤的套装腿上不会有皮肤；短裤 / 短裙套装配置里写 skin_legs: true
        legs = np.array([v.co.z < CROTCH + 0.03 and abs(v.co.x - NCX) < 0.2 for v in C.data.vertices]); grown &= ~legs
    R['skin_grown'] = int(grown.sum() - strict.sum())
    sk_ids = [i for i in range(len(grown)) if grown[i]]; kdS = KDTree(len(sk_ids) or 1)
    for j, i in enumerate(sk_ids): kdS.insert(C.data.vertices[i].co, j)
    kdS.balance(); cloth_med = np.median(vc[~grown & (vc.mean(1) > 0.25)], 0) if (~grown & (vc.mean(1) > 0.25)).any() else np.array([0.7, 0.7, 0.7])
    rimv = np.zeros(len(grown), bool)
    for i, v in enumerate(C.data.vertices):
        if grown[i] or not sk_ids: continue
        if kdS.find(v.co)[2] < 0.025 and vc[i].mean() < 0.75 * cloth_med.mean(): rimv[i] = True
    rimv |= wall
    C['rim'] = '#%02x%02x%02x' % tuple(int(min(1, x * 0.8) * 255) for x in cloth_med); R['rim_verts'] = int(rimv.sum())
    smin = spec.get('skin_min_z', ANKLE + 0.02)
    for i, v in enumerate(C.data.vertices):
        r_ = np.hypot(v.co.x - NCX, v.co.y - NCY); neck = r_ < max(NR, NR0c) * 1.6 and v.co.z > zc - 0.012      # 截口附近和标准脖子一定是皮肤
        sk = 1.0 if neck else 0.0 if v.co.z < smin else (1.0 if grown[i] else 0.0)
        g_ = float(np.clip((v.co.z - (NECK - 0.03)) / max(0.01, CHIN - (NECK - 0.03)), 0, 1)) * (1.0 if sk > 0.5 and r_ < NR * 1.4 else 0.0)
        ca.data[i].color = (sk, g_, 1.0 if (rimv[i] and sk < 0.5) else 0.0, 1)
    R['skin_vert_pct'] = round(float(np.mean([ca.data[i].color[0] > 0.5 for i in range(len(C.data.vertices))])), 3)
    R['neck_dbg'] = {'ncx': round(NCX, 4), 'ncy': round(NCY, 4), 'NR': round(float(NR), 4), 'NR0c': round(NR0c, 4), 'zc': round(zc, 4), 'above_cut_not_skin': int(sum(1 for i, v in enumerate(C.data.vertices) if v.co.z > zc + 0.002 and ca.data[i].color[0] < 0.5))}
    R['faces'] = len(C.data.polygons)
    # 开口边的深色（袖口、领口、裤脚里面）：挨着皮肤 2 厘米内的衣服面，交给 texfix 把太暗的像素换成旁边衣服色 × 0.85
    fc2 = facecols(C, ccol); sk2 = skin_like(fc2, SKREF)
    ce2 = np.array([p_.center[:] for p_ in C.data.polygons]); kd_ = KDTree(int(sk2.sum()) or 1)
    for i_, c_ in enumerate(ce2[sk2]): kd_.insert(Vector(c_), i_)
    kd_.balance(); near = np.zeros(len(ce2), bool)
    if sk2.any():
        for i_, c_ in enumerate(ce2):
            if not sk2[i_] and kd_.find(Vector(c_))[2] < 0.02: near[i_] = True
    C['rim_faces'] = int(near.sum()); C['_rim'] = near.astype(np.uint8).tobytes().hex()
    C['outfit'] = spec['id']; C['outfit_name'] = spec.get('name', spec['id']); C['sex'] = spec.get('sex', '')
    REP['outfits'][spec['id']] = R
    return C, ccol, cnrm
OFT = [build_outfit(sp) for sp in OUTFITS]; OFS = [x[0] for x in OFT]
bpy.data.objects.remove(B)                                            # 基础身体只用来量尺寸、取标准脖子的形状，不进游戏
REP['cloth_scale'] = REP['outfits'][OUTFITS[0]['id']]['scale']; REP['hem'] = None; REP['ankle'] = None
# ---------------------------------------------------------------- 6. 骨骼（名字跟 Kenney 一样）+ 权重
# 设计 18v：关节位置按基础身体2 量出来的点（裆、腿中线、脚踝、腋下、肩、肘、腕、手尖、脖子）定，不再写死
_ts = [HIPZ + (NECK - 0.045 - HIPZ) * f for f in (0.0, 0.243, 0.486, 0.757, 1.0)]
J = {'Hips': ((0, 0, _ts[0]), (0, 0, _ts[1])), 'Spine': ((0, 0, _ts[1]), (0, 0, _ts[2])), 'Chest': ((0, 0, _ts[2]), (0, 0, _ts[3])), 'UpperChest': ((0, 0, _ts[3]), (0, 0, _ts[4])),
     'Neck': ((0, 0, _ts[4]), (0, 0, NECK + 0.015)), 'Head': ((0, 0, NECK + 0.015), (0, 0, TOP - 0.03))}
_kz, _az_ = KNEE, ANKLE
for sd_, k in (('Left', 1), ('Right', -1)):
    m_ = lambda p: (float(p[0]) * k, float(p[1]), float(p[2]))
    J[sd_ + 'Shoulder'] = ((0.035 * k, 0, SHO[2] + 0.035), m_(SHO)); J[sd_ + 'Arm'] = (m_(SHO), m_(ELBOW)); J[sd_ + 'ForeArm'] = (m_(ELBOW), m_(WRIST))
    J[sd_ + 'Hand'] = (m_(WRIST), m_(HAND_TIP)); J[sd_ + 'UpLeg'] = ((LX * k, 0, HIPZ), ((LX + 0.008) * k, yc(_kz), _kz)); J[sd_ + 'Leg'] = (((LX + 0.008) * k, yc(_kz), _kz), ((LX + 0.012) * k, yc(_az_), _az_))
    J[sd_ + 'Foot'] = (((LX + 0.012) * k, yc(_az_), _az_), ((LX + 0.018) * k, TOE_Y + 0.025, 0.02))
REP['joints'] = {n: [[round(x, 3) for x in h], [round(x, 3) for x in t_]] for n, (h, t_) in J.items() if not n.startswith('Right')}
PAR = {'Spine': 'Hips', 'Chest': 'Spine', 'UpperChest': 'Chest', 'Neck': 'UpperChest', 'Head': 'Neck'}
for sd_ in ('Left', 'Right'): PAR.update({sd_ + 'Shoulder': 'UpperChest', sd_ + 'Arm': sd_ + 'Shoulder', sd_ + 'ForeArm': sd_ + 'Arm', sd_ + 'Hand': sd_ + 'ForeArm', sd_ + 'UpLeg': 'Hips', sd_ + 'Leg': sd_ + 'UpLeg', sd_ + 'Foot': sd_ + 'Leg'})
arm = bpy.data.armatures.new('Rig'); A = bpy.data.objects.new('Rig', arm); bpy.context.collection.objects.link(A)
bpy.context.view_layer.objects.active = A; bpy.ops.object.mode_set(mode='EDIT')
for n, (h, t_) in J.items(): b = arm.edit_bones.new(n); b.head = Vector(h); b.tail = Vector(t_)
for n, p in PAR.items(): arm.edit_bones[n].parent = arm.edit_bones[p]
for b in arm.edit_bones: b.align_roll(Vector((0, -1, 0)))
bpy.ops.object.mode_set(mode='OBJECT')
# 套装：自动权重（骨头热度），再修几处：身子不跟手臂走、裤腰跟胯走、接缝两边权重取平均
LEG = ('LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot')
ARMS = {sd + n for sd in ('Left', 'Right') for n in ('Arm', 'ForeArm', 'Hand')}
def fix_weights(o):
    gi_ = {g.index: g.name for g in o.vertex_groups}; n_ = 0
    for v in o.data.vertices:
        sp_ = arm_split(v.co.z)
        if v.co.z > mt(0.50) or (sp_ is not None and abs(v.co.x - NCX) > sp_) or (sp_ is None and abs(v.co.x - NCX) > 0.19): continue   # 身子、腿（身子和手臂分开处的里面）
        bad = [x for x in v.groups if gi_[x.group] in ARMS and x.weight > 0]
        if not bad: continue
        n_ += 1
        for x in bad: x.weight = 0.0
        tot = sum(x.weight for x in v.groups)
        if tot < 1e-3: o.vertex_groups['Spine' if v.co.z > mt(0.36) else 'Hips'].add([v.index], 1.0, 'REPLACE')
        else:
            for x in v.groups: x.weight /= tot
    return n_
def waist_fix(o, z_top=None, z_bot=None):
    z_top = mt(0.36) if z_top is None else z_top; z_bot = ml(0.19) if z_bot is None else z_bot
    gi_ = {g.index: g.name for g in o.vertex_groups}; hg = o.vertex_groups['Hips']; n_ = 0
    for v in o.data.vertices:
        f_ = float(np.clip((v.co.z - z_bot) / (z_top - z_bot), 0, 1)) ** 0.7
        if abs(v.co.x - NCX) < 0.62 * LX: f_ = max(f_, 0.6 * float(np.clip((v.co.z - ml(0.12)) / (ml(0.22) - ml(0.12)), 0, 1)))
        if f_ <= 0 or v.co.z > mt(0.45): continue
        moved_ = 0.0
        for x in v.groups:
            if gi_[x.group] in LEG: moved_ += x.weight * f_; x.weight *= 1 - f_
        if moved_ > 0: hg.add([v.index], moved_, 'ADD'); n_ += 1
    return n_
def weld_weights(o):
    key = {}; gi_ = {g.index: g.name for g in o.vertex_groups}; n_ = 0
    for v in o.data.vertices: key.setdefault(tuple(np.round(v.co[:], 4)), []).append(v)
    for vs in key.values():
        if len(vs) < 2: continue
        acc = {}
        for v in vs:
            for x in v.groups: acc[gi_[x.group]] = acc.get(gi_[x.group], 0) + x.weight / len(vs)
        for v in vs:
            for g, w in acc.items(): o.vertex_groups[g].add([v.index], w, 'REPLACE')
        n_ += 1
    return n_
for o in OFS:
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); A.select_set(True); bpy.context.view_layer.objects.active = A
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    REP['outfits'][o['outfit']]['weights'] = {'arm_removed': fix_weights(o), 'waist': waist_fix(o), 'welded': weld_weights(o)}
def rigid(o, bone_of):
    gs = {}
    for v in o.data.vertices:
        b = bone_of(v.co)
        if b not in gs: gs[b] = o.vertex_groups.new(name=b)
        gs[b].add([v.index], 1.0, 'REPLACE')
    o.parent = A; am = o.modifiers.new('Armature', 'ARMATURE'); am.object = A
for h_ in HEADS: rigid(h_['obj'], lambda c: 'Head')
# ---------------------------------------------------------------- 7. 动作：站 / 走 / 跑（跟第一版一样）
bpy.context.scene.render.fps = 30
rest = {b.name: b.matrix_local.to_quaternion() for b in A.data.bones}; hinge = {}
for b in A.data.bones:
    d = (b.tail_local - b.head_local).normalized(); ax = d.cross(Vector((0, -1, 0))); hinge[b.name] = ax.normalized() if ax.length > 1e-4 else Vector((1, 0, 0))
BDIR = {b.name: (b.tail_local - b.head_local).normalized() for b in A.data.bones}
Rx = lambda a: Quaternion((1, 0, 0), a); Ry = lambda a: Quaternion((0, 1, 0), a); Rz = lambda a: Quaternion((0, 0, 1), a); flex = lambda n, a: Quaternion(hinge[n], a)
def setrot(pb, R): r = rest[pb.name]; pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = r.inverted() @ R @ r
D = math.radians
# 设计 18v：待机时手臂往下放多少 = 身体自己 A 字站姿的手臂角度 − 10°（手臂垂在身体两侧、留一点空隙；以前写死 36° 是按旧身体，手臂平，新身体手臂本来就往下，再转 36° 就插进身体）
_ad = BDIR['LeftArm']; ARM_REST = math.degrees(math.atan2(abs(_ad.x), -_ad.z)); ARM_DOWN = D(max(0.0, ARM_REST - CFG.get('arm_gap_deg', 10)))
REP['arm'] = {'rest_deg_from_vertical': round(ARM_REST, 1), 'idle_down_deg': round(math.degrees(ARM_DOWN), 1)}
# 设计 18m：走 / 跑重做。一条腿的一个循环 p = 0～1 用关键点（大腿角、膝盖角）插值；胯的高度按「着地那只脚贴地」算（脚不悬空、不插地），跑步腾空时再往上弹
#   大腿角 + = 往前抬；膝盖角 + = 往后弯
LEGK = {
    'run':  [(0.00, 36, 15), (0.12, 0, 28), (0.25, -42, 14), (0.42, -26, 105), (0.60, 30, 115), (0.80, 70, 85), (0.92, 50, 38), (1.00, 36, 15)],   # 0～0.25 着地蹬地；0.42 脚跟往上踢；0.8 膝盖抬到快水平
    'walk': [(0.00, 30, 4), (0.30, 0, 8), (0.58, -28, 6), (0.70, -18, 40), (0.86, 18, 30), (1.00, 30, 4)],
}
# 设计 18v：腿长了（游戏里腿长约 1.5 倍），大腿前后摆的角度 × 0.8（步子、抬膝小一点），一圈慢一点 → 跑步地面速度 ≈ 5（游戏里跑的速度），脚不打滑
STRIDE = CFG.get('stride', {'run': 0.8, 'walk': 0.8})
STANCE = {'run': 0.25, 'walk': 0.60}          # 着地占一条腿循环的多少（跑 30% → 两次腾空；走 62% → 双脚着地有重叠，没有腾空）
def legk(kind, p):
    K = LEGK[kind]; p %= 1.0
    for (p0, t0, k0), (p1, t1, k1) in zip(K, K[1:]):
        if p0 <= p <= p1:
            u = (p - p0) / (p1 - p0); u = 0.5 - 0.5 * math.cos(math.pi * u); return D((t0 + (t1 - t0) * u) * STRIDE[kind]), D(k0 + (k1 - k0) * u)
    return D(K[0][1] * STRIDE[kind]), D(K[0][2])
DMAX = {k: max(abs(math.degrees(legk(k, p / 200 + 0.5)[0] - legk(k, p / 200)[0])) for p in range(200)) for k in LEGK}   # 两条大腿岔开的最大角度
def pose(kind, ph, hip=0.0):
    P = A.pose.bones; s_ = math.sin(2 * math.pi * ph)
    for pb in P: pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
    if kind == 'idle':
        br = math.sin(2 * math.pi * ph); setrot(P['Chest'], Rx(D(1.5) * br)); setrot(P['Head'], Rx(-D(1.5) * br) @ Rz(D(2) * math.sin(2 * math.pi * ph + 1))); P['Hips'].location = (0, 0.002 * br, 0)
        for sd_, k in (('Left', 1), ('Right', -1)): setrot(P[sd_ + 'Arm'], Ry(k * (ARM_DOWN + D(2) * br))); setrot(P[sd_ + 'ForeArm'], flex(sd_ + 'ForeArm', D(10)))
        return
    run = kind == 'run'
    # 18z 跑步同手同脚：手臂改成跟「对侧大腿」走：对侧大腿最前的那一帧手正好最前，最后的那一帧手正好最后；前后摆幅一样大
    #   AF / AB = 手往前 / 往后摆的角度（以竖直为 0，已经抵掉身子前倾），ELF / ELB = 手在最前 / 最后时肘弯多少（往后时肘伸开一点，手才到身体后面）
    lean, tw, AF, AB, ELF, ELB = (D(13), D(8), D(50), D(50), D(95), D(55)) if run else (D(2), D(4), D(22), D(22), D(18), D(8))
    P['Hips'].location = (0, hip, 0)
    setrot(P['Hips'], Rz(tw * 0.6 * s_)); setrot(P['Spine'], Rx(lean * 0.6) @ Rz(-tw * s_)); setrot(P['Chest'], Rx(lean * 0.4) @ Rz(-tw * 0.5 * s_))
    setrot(P['Head'], Rx(-lean * 0.7 + (D(3) * math.cos(4 * math.pi * ph - 0.6) if run else 0)))     # 头抬一点看前方；跑的时候落地往下点一下
    for sd_, k, off in (('Left', 1, 0.0), ('Right', -1, 0.5)):
        th, kn = legk(kind, ph + off)
        setrot(P[sd_ + 'UpLeg'], Rx(-th - lean * 0.6)); setrot(P[sd_ + 'Leg'], Rx(kn)); setrot(P[sd_ + 'Foot'], Rx(-kn * 0.35 + th * 0.25 + (D(12) if run else 0) * max(0, math.sin(2 * math.pi * (ph + off) - 2.0))))
        # 手臂跟对侧的腿一起摆（左腿往前 = 右手往前、左手往后）：直接用对侧大腿的角度，前后最大值对得上同一帧
        dth = math.degrees(legk(kind, ph + off + 0.5)[0] - legk(kind, ph + off)[0]); u_ = max(-1.0, min(1.0, dth / DMAX[kind]))   # 对侧大腿减同侧大腿：-1（同侧腿在最前）～ 1（对侧腿在最前），两条腿岔得最开的那一帧手摆到头
        sw = AF * u_ if u_ > 0 else AB * u_
        el = ELB + (ELF - ELB) * (u_ + 1) / 2
        setrot(P[sd_ + 'Arm'], Rx(-sw - lean) @ Ry(k * (ARM_DOWN - (D(14) if run else 0)))); setrot(P[sd_ + 'ForeArm'], flex(sd_ + 'ForeArm', el))
        if run:   # 跑步手轻轻握拳：手心转向身体、手指往里弯、手掌收小一点（手没有手指骨头，用整只手的转 + 缩代替）
            P[sd_ + 'Hand'].rotation_quaternion = Quaternion((0, 0, 1), -k * D(80)); P[sd_ + 'Hand'].scale = (1, 0.65, 1)   # 骨头自己的 z 轴转 80° + 手掌缩短 = 手指收拢（在 viewer 里试过几种，这个最像握拳）
def ankles():
    bpy.context.view_layer.update(); M = A.matrix_world
    return [(M @ A.pose.bones[n].head) for n in ('LeftFoot', 'RightFoot')]
A.animation_data_create(); bpy.context.view_layer.objects.active = A
pose('walk', 0); 
for pb in A.pose.bones: pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
H0 = ankles()[0].z                                                          # 站直时脚踝离地的高度
GAME_K = 2.0 / TOP                                                          # 身体高 → 游戏里 2 米
A['top'] = round(float(TOP), 4)                                             # 游戏里按这个缩放到 2 米（设计 18v：新身体高度变了）
FRAMES = {'idle': 90, 'walk': 30, 'run': 14}                                # 30 帧/秒：走 1 秒、跑 0.47 秒一个循环（18v 腿长了，步频慢一点）
REP['anim'] = {}
for name in ('idle', 'walk', 'run'):
    nf = FRAMES[name]; act = bpy.data.actions.new(name); act.use_fake_user = True; A.animation_data.action = act
    hips = [0.0] * (nf + 1); stance_v = []
    if name != 'idle':
        st = STANCE[name]; low = []; contact = []
        for f in range(nf + 1):
            ph = f / nf; pose(name, ph); a_ = ankles()
            on = [((ph + o) % 1.0) < st for o in (0.0, 0.5)]                 # 哪只脚在着地
            low.append(a_); contact.append(on)
        base = []
        for f in range(nf + 1):
            zs_ = [low[f][i].z for i in (0, 1) if contact[f][i]]
            base.append(H0 - min(zs_) if zs_ else None)                     # 着地那只脚贴地要的胯高度
        idx = [f for f in range(nf + 1) if base[f] is not None]
        for f in range(nf + 1):
            if base[f] is not None: hips[f] = base[f]; continue
            f0 = max([i for i in idx if i < f], default=idx[-1] - nf); f1 = min([i for i in idx if i > f], default=idx[0] + nf)
            b0, b1 = base[f0 % (nf + 1) if f0 >= 0 else f0 + nf], base[f1 % nf if f1 > nf else f1]; u = (f - f0) / max(1, f1 - f0)
            hips[f] = b0 + (b1 - b0) * u + 0.034 * TOP * math.sin(math.pi * u)            # 腾空：往上弹（身高的 ~2%，加上蹬地的起伏一共 4%～5%）
        # 着地那只脚往后扫的速度（身体坐标）= 角色往前跑的速度 → 游戏里按这个配播放速度，脚不打滑
        for f in range(nf):
            for i in (0, 1):
                if contact[f][i] and contact[f + 1][i]: stance_v.append((low[f + 1][i].y - low[f][i].y) * 30)
    for f in range(nf + 1):
        pose(name, f / nf, hips[f])
        for pb in A.pose.bones:
            pb.keyframe_insert('rotation_quaternion', frame=f)
            if pb.name == 'Hips': pb.keyframe_insert('location', frame=f)
            if pb.name.endswith('Hand'): pb.keyframe_insert('scale', frame=f)
    if stance_v:
        v = float(np.median(stance_v)) * GAME_K; A['v_' + name] = round(v, 3)
        REP['anim'][name] = {'cycle_s': round(nf / 30, 3), 'ground_speed_game': round(v, 3), 'hip_range': round(float(max(hips) - min(hips)) / TOP, 4)}
# 18z 自查：一圈 8 帧，左大腿、左上臂的前后角度（往前为正，世界坐标，侧面看）；两者要正好相反，最前 / 最后在同一帧
def seg_ang(a, b): d = b - a; return math.degrees(math.atan2(-d.y, -d.z))
REP['swing'] = {}
for name in ('run', 'walk'):
    A.animation_data.action = bpy.data.actions[name]; nf = FRAMES[name]; rows = []
    for i in range(nf):
        bpy.context.scene.frame_set(i); bpy.context.view_layer.update(); M = A.matrix_world; P = A.pose.bones
        rows.append((i, seg_ang(M @ P['LeftUpLeg'].head, M @ P['LeftUpLeg'].tail), seg_ang(M @ P['LeftArm'].head, M @ P['LeftArm'].tail),
                     seg_ang(M @ P['RightArm'].head, M @ P['RightArm'].tail), (M @ P['LeftHand'].tail).y - (M @ P['Spine'].head).y))
    th = np.array([r[1] for r in rows]); al = np.array([r[2] for r in rows]); ar = np.array([r[3] for r in rows])
    corr = float(np.corrcoef(th, al)[0, 1]); fmax_leg, fmax_arm, fmax_armR = int(np.argmax(th)), int(np.argmin(al)), int(np.argmax(ar))
    REP['swing'][name] = {'frames8': [[rows[round(i * nf / 8) % nf][0], round(rows[round(i * nf / 8) % nf][1], 1), round(rows[round(i * nf / 8) % nf][2], 1), round(rows[round(i * nf / 8) % nf][4], 3)] for i in range(8)],
                          'rightarm_front_frame': fmax_armR,
                          'corr_leftleg_leftarm': round(corr, 3), 'leftleg_front_frame': fmax_leg, 'leftarm_back_frame': fmax_arm,
                          'arm_range_L': [round(float(al.min()), 1), round(float(al.max()), 1)], 'arm_range_R': [round(float(ar.min()), 1), round(float(ar.max()), 1)],
                          'hand_behind_body_max': round(float(max(r[4] for r in rows)), 3)}
    log('swing', name, REP['swing'][name])
    if corr > -0.9 or abs(fmax_leg - fmax_arm) > 1 or abs(fmax_leg - fmax_armR) > 1: REP['warn'].append(f'{name}：左腿、左手不是正好反着摆（相关 {corr:.2f}，左腿最前第 {fmax_leg} 帧，左手最后第 {fmax_arm} 帧，右手最前第 {fmax_armR} 帧）')
A.animation_data.action = bpy.data.actions['idle']
for pb in A.pose.bones: pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
# ---------------------------------------------------------------- 8. 贴图、材质、导出
# 每颗发型头：脸颊的肤色 → 这颗头配的身体皮肤色（游戏里换发型时，套装的皮肤区跟着换）；头发遮罩放进顶点颜色
TEX = {}
for h_ in HEADS:
    HH, hhcol, hhnrm, hp, CHEEK, hid = h_['obj'], h_['col'], h_['nrm'], h_['hp'], h_['cheek'], h_['id']
    fp = hp[::8, ::8].reshape(-1, 3); fm = ((fp.max(1) - fp.min(1)) > 0.2) & (fp.mean(1) > 0.5) & (fp[:, 0] > fp[:, 2] + 0.15)
    skc = (CHEEK * 0.92) if CHEEK is not None else np.median(fp[fm], 0)   # 脸颊贴图里带了烘焙的亮光，身体再乘 0.92 跟头亮度一致
    HH['skin'] = '#%02x%02x%02x' % tuple(int(round(min(1, x) * 255)) for x in skc); REP['hairheads'][hid]['skin_hex'] = HH['skin']
    p_tex = OUT + f'/hairhead_{hid}_tex.png'
    if h_ is not HEADS[0] and CHEEK is not None and HEADS[0]['cheek'] is not None:   # 设计 18v：全员用第一颗头（男发型1）的肤色：只改脸上皮肤色的像素，眼睛、腮红、头发不动
        W_, H_ = hhcol.size; px_ = np.empty(W_ * H_ * 4, np.float32); hhcol.pixels.foreach_get(px_); px_ = px_.reshape(-1, 4)
        c_ = px_[:, :3]; ch_ = c_ / np.maximum(c_.sum(1, keepdims=True), 1e-3); rch_ = CHEEK / CHEEK.sum()
        d_ = np.linalg.norm(ch_ - rch_, axis=1); lr_ = c_.mean(1) / CHEEK.mean()
        w_ = np.clip((0.045 - d_) / 0.015, 0, 1) * np.clip((lr_ - 0.45) / 0.1, 0, 1) * np.clip((1.45 - lr_) / 0.1, 0, 1)
        ratio_ = HEADS[0]['cheek'] / np.maximum(CHEEK, 1e-3)
        c_[:] = c_ * (1 - w_[:, None]) + np.clip(c_ * ratio_, 0, 1) * w_[:, None]; px_[:, :3] = c_
        hhcol.pixels.foreach_set(px_.ravel()); REP['hairheads'][hid]['skin_recolor_px'] = int((w_ > 0.5).sum())
        HH['skin'] = HEADS[0]['obj']['skin']; REP['hairheads'][hid]['skin_hex'] = HH['skin']
    REP['hairheads'][hid]['tex'] = texfix(hhcol, p_tex, 2048, [HH], hair=True, hair_tris=OUT + f'/hair_tris_{hid}.npy', skin_tris=OUT + f'/skin_tris_{hid}.npy')
    HM = np.load(p_tex + '.hairmask.npy'); MH, MW = HM.shape
    _kd = KDTree(len(h_['fc']))
    for i_, c_ in enumerate(h_['fc']): _kd.insert(Vector(c_), i_)
    _kd.balance()
    def face_is_hair(f):                                   # 减面后的面 → 最近的几个原来的面（朝向差不多的）多数是头发 = 头发
        n_ = f.normal; votes = [h_['fh'][i_] for co_, i_, d_ in _kd.find_n(f.calc_center_median(), 4) if np.dot(h_['fn'][i_], n_[:]) > 0.3]
        return bool(votes) and np.mean(votes) > 0.5
    bm = bmesh.new(); bm.from_mesh(HH.data); uvl_ = bm.loops.layers.uv.active; isH = {}; bm.normal_update()
    for f in bm.faces:
        pts = [l[uvl_].uv for l in f.loops]; pts.append(sum(pts, Vector((0, 0))) / len(pts))
        isH[f] = face_is_hair(f) or np.mean([HM[min(MH - 1, int((1 - p.y) * MH)), min(MW - 1, int(p.x * MW))] for p in pts]) > 0.5
    cut = [e for e in bm.edges if len(e.link_faces) == 2 and isH[e.link_faces[0]] != isH[e.link_faces[1]]]
    bmesh.ops.split_edges(bm, edges=cut); REP['hairheads'][hid]['hair_mask_split_edges'] = len(cut)
    bm.to_mesh(HH.data); bm.free(); HH.data.update()
    bm = bmesh.new(); bm.from_mesh(HH.data); bm.faces.ensure_lookup_table(); vh = {}; bm.normal_update()
    for f in bm.faces:
        pts = [l[bm.loops.layers.uv.active].uv for l in f.loops]; pts.append(sum(pts, Vector((0, 0))) / len(pts))
        hh_ = face_is_hair(f) or np.mean([HM[min(MH - 1, int((1 - p.y) * MH)), min(MW - 1, int(p.x * MW))] for p in pts]) > 0.5
        for v in f.verts: vh[v.index] = max(vh.get(v.index, 0.0), 1.0 if hh_ else 0.0)
    bm.free()
    ch_ = HH.data.color_attributes.new('COLOR_0', 'FLOAT_COLOR', 'POINT')
    for i, v in enumerate(HH.data.vertices):   # R = 头发；G = 下巴底下朝下的那一圈（贴图烘焙成深棕色）→ 游戏里涂肤色，侧面看不到黑缝（18s 第 2 条）
        t_ = vh.get(i, 0.0); ug = 1.0 if (t_ < 0.5 and v.co.z < CHIN + 0.035 and v.normal.z < -0.15) else 0.0; ch_.data[i].color = (t_, ug, 0, 1)
    REP['hairheads'][hid]['chin_under_verts'] = int(sum(1 for i in range(len(HH.data.vertices)) if ch_.data[i].color[1] > 0.5))
    REP['hairheads'][hid]['hair_vert_pct'] = round(float(np.mean([vh.get(i, 0) for i in range(len(HH.data.vertices))])), 3)
    TEX['HairHead_' + hid] = (p_tex, hhnrm, 1024)
REP['skin_hex'] = HEADS[0]['obj']['skin']
for o in OFS: o['skin'] = REP['skin_hex']                              # 默认（第一颗头）的肤色；游戏里按选的发型换
for (o, ccol_, cnrm_), sp in zip(OFT, OUTFITS):                      # 每套一张贴图（颜色就是生成出来的样子，不换色）；开口边太暗的像素提亮（18s）
    near = np.frombuffer(bytes.fromhex(o['_rim']), np.uint8).astype(bool); del o['_rim']
    np.save(OUT + f"/outfit_{sp['id']}_rim.npy", poly_tris(o, near) if near.any() else np.zeros((0, 3, 2), np.float32))
    p_ = OUT + f"/outfit_{sp['id']}_tex.png"
    REP['outfits'][sp['id']]['tex'] = texfix(ccol_, p_, 1024, [o], dark_tris=OUT + f"/outfit_{sp['id']}_rim.npy", red_fix=sp.get('red_fix', False))
    TEX['Outfit_' + sp['id']] = (p_, cnrm_, 1024)
def mat(name, key, double=False):   # 透明通道只是遮罩，不接到材质的 Alpha（不然导出成半透明）
    path, nimg, ns = TEX[key]; m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); bs = nt.nodes.new('ShaderNodeBsdfPrincipled'); bs.inputs['Roughness'].default_value = 1; bs.inputs['Metallic'].default_value = 0
    tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = bpy.data.images.load(path); nt.links.new(tx.outputs['Color'], bs.inputs['Base Color'])
    if nimg:
        ni = nimg.copy(); ni.scale(ns, ns); ni.filepath_raw = OUT + f'/{key.lower()}_nrm.jpg'; ni.file_format = 'JPEG'; ni.save()
        t2 = nt.nodes.new('ShaderNodeTexImage'); t2.image = bpy.data.images.load(OUT + f'/{key.lower()}_nrm.jpg'); t2.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(t2.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bs.inputs['Normal'])
    nt.links.new(bs.outputs['BSDF'], out.inputs['Surface']); m.use_backface_culling = not double; m.blend_method = 'OPAQUE'; return m
for h_ in HEADS: h_['obj'].data.materials.clear(); h_['obj'].data.materials.append(mat('HairHeadMat_' + h_['id'], 'HairHead_' + h_['id'], True))
for o, sp in zip(OFS, OUTFITS): o.data.materials.clear(); o.data.materials.append(mat('OutfitMat_' + sp['id'], 'Outfit_' + sp['id'], True))
REP['faces'] = {o.name: len(o.data.polygons) for o in [h_['obj'] for h_ in HEADS] + OFS}
bpy.ops.wm.save_as_mainfile(filepath=OUT + '/hero.blend')
bpy.ops.object.select_all(action='DESELECT')
for o in [A] + [h_['obj'] for h_ in HEADS] + OFS: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT + '/hero_m2.glb', use_selection=True, export_format='GLB', export_image_format='AUTO', export_animations=True, export_animation_mode='ACTIONS',
    export_skins=True, export_morph=False, export_def_bones=False, export_yup=True, export_vertex_color='ACTIVE', export_extras=True)
REP['size_kb'] = os.path.getsize(OUT + '/hero_m2.glb') // 1024
json.dump(REP, open(OUT + '/report.json', 'w'), ensure_ascii=False, indent=1)
log('REPORT', json.dumps(REP, ensure_ascii=False))
os._exit(0)
