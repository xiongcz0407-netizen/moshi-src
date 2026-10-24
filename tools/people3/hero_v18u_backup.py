# 男主角装配工具（设计 18f / 18g）：python3.11 hero.py -- <配置.json>
# 输入：基础身体、标准头、发型（带光头的 GLB）、衣服（穿着衣服的身体 GLB）。
# 输出：hero_m2.glb（骨骼 + 站 / 走 / 跑 + 身体 / 头 / 头发 / 上衣 / 裤子 / 鞋）、report.json（倍数、18f 的比例检查）。
# 以后换新发型、新衣服：改配置里的路径再跑一次就行。
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
def texfix(img, path, size, objs, mask=None, hair=False, fill_objs=None, hair_tris=None, skin_tris=None, dark_tris=None):
    """贴图后处理（系统 python 跑 texfix.py）：UV 岛外扩、头发去杂色压范围、衣服里的肉色斑填掉"""
    import subprocess
    tmp = path + '.src.png'; im = img.copy(); im.filepath_raw = tmp; im.file_format = 'PNG'; im.save()
    J = {'rgb': tmp, 'out': path, 'size': size, 'tris': uv_tris(objs, path + '.tris.npy'), 'hair': hair}
    if mask is not None: np.save(path + '.mask.npy', mask.astype(np.float32)); J['mask'] = path + '.mask.npy'
    if fill_objs: J['fill_tris'] = uv_tris(fill_objs, path + '.fill.npy')
    if dark_tris: J['dark_tris'] = dark_tris
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

# ---------------------------------------------------------------- 1. 身体、原来的头
bpy.ops.wm.read_factory_settings(use_empty=True)
B, bcol, bnrm = imp(CFG['body'], 'Body')
bv = V(B); TOP = bv[:, 2].max()
front = bv[(bv[:, 2] > 0.55 * TOP) & (bv[:, 1] < -0.10) & (np.abs(bv[:, 0]) < 0.12)]
CHIN = front[:, 2].min()                                   # 原来的下巴
H_BODY = TOP - CHIN
def ears(P, z0, z1):
    s = P[(P[:, 2] > z0) & (P[:, 2] < z1)]; mx = np.abs(s[:, 0]).max(); e = s[np.abs(s[:, 0]) > 0.93 * mx]; return e.mean(0)
EAR_B = ears(bv, CHIN, TOP)
REP['body'] = {'height': round(float(TOP), 4), 'chin': round(float(CHIN), 4), 'head_H': round(float(H_BODY), 4), 'head_ratio': round(float(H_BODY / TOP), 4)}
log('body head H', H_BODY, 'ratio', H_BODY / TOP)
if abs(H_BODY / TOP - 0.41) > 0.01: REP['warn'].append(f'头高 ÷ 全身高 = {H_BODY / TOP:.3f}（规范 0.41 ± 0.01）')
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

# ---------------------------------------------------------------- 3. 发型头（头发 + 脸一整颗，设计 18f）：按尺子对齐，直接替换身体的头
HH, hhcol, hhnrm = imp(CFG['hairhead'], 'HairHead')
P0 = V(HH); c0 = P0[:, 2].min()
RV = V(Hd)
def band(P, chin, H):                                   # 下巴往上 4%～20% 那一段：宽、中心
    m = (P[:, 2] > chin + 0.04 * H) & (P[:, 2] < chin + 0.20 * H); q = P[m]
    return q[:, 0].max() - q[:, 0].min(), q[:, 1].max() - q[:, 1].min(), (q[:, 0].max() + q[:, 0].min()) / 2, (q[:, 1].max() + q[:, 1].min()) / 2
wR, dR, xR, yR = band(RV, CHIN, H_BODY)
s_ = S_HEAD                                           # 从标准头的倍数开始（发型头跟标准头差不多大）
for it in range(4):                                     # 这一段在发型头里的高度跟倍数有关，迭代几次
    wH, dH, xH, yH = band(P0, c0, H_BODY / s_); s_ = wR / wH
wH, dH, xH, yH = band(P0, c0, H_BODY / s_)
S_HH = s_; T_HH = np.array([xR - xH * S_HH, yR - yH * S_HH, CHIN - c0 * S_HH])
setV(HH, P0 * S_HH + T_HH)
REP['hairhead'] = {'scale': round(float(S_HH), 4), 'scale_vs_ruler': round(float(S_HH / S_HEAD), 4), 'depth_diff': round(float(dH * S_HH / dR - 1), 4)}
if not 0.95 <= S_HH / S_HEAD <= 1.05: REP['warn'].append(f'发型头倍数（相对标准头）{S_HH / S_HEAD:.3f} 不在 0.95～1.05')
if abs(REP['hairhead']['depth_diff']) > 0.03: REP['warn'].append(f"发型头深度跟标准头差 {REP['hairhead']['depth_diff'] * 100:.1f}%（超过 3%）")
log('hairhead scale', S_HH, REP['hairhead'])
# 尺子（标准头）的位置记下来，不显示、不导出
REP['ruler'] = {'chin': round(float(CHIN), 4), 'top': round(float(TOP), 4), 'H': round(float(H_BODY), 4)}
RULER_BVH = bvh(Hd)
# 尺子单独存一份 ruler_check.glb，只给 check.py 量比例用，不进游戏
bpy.ops.object.select_all(action='DESELECT'); Hd.select_set(True); bpy.context.view_layer.objects.active = Hd
bpy.ops.export_scene.gltf(filepath=OUT + '/ruler_check.glb', use_selection=True, export_format='GLB', export_image_format='JPEG')
bpy.data.objects.remove(Hd)
# 头发遮罩：贴图里没颜色（灰）的 = 头发；肉色、眼睛、眉毛、嘴、腮红不是。脸那一块（贴着脸、在眉毛以下）的再排除一次
hp = pix(hhcol); Hh_, Wh_ = hp.shape[:2]
sat = hp.max(2) - hp.min(2); lum = hp.mean(2)
mask = np.clip((0.17 - sat) / 0.05, 0, 1) * np.clip((lum - 0.16) / 0.06, 0, 1)
# 脸部五官区：发型头正面、下巴往上 0～0.68H 内，离尺子脸面 < 6 毫米的面所占的贴图区域 → 不算头发（刘海浮在脸前面，不受影响）
XR = (RV[:, 0].min() + RV[:, 0].max()) / 2; WR = RV[:, 0].max() - RV[:, 0].min()   # 五官区只在脸中间（不碰鬓角）
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
REP['cheek_samples'] = int(keep.sum()) if len(chk) > 5 else 0
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
for poly in HH.data.polygons:                                   # 刘海尖（贴图上带了肤色）：往里打一条线 1.5 厘米内碰到自己的另一层（额头）= 浮在前面的头发
    c = poly.center
    if not nonhair[poly.index] or c.y > yR or c.z < CHIN + 0.30 * H_BODY or flum[poly.index] < 0.16 or fsat[poly.index] > 0.30: continue
    n_ = poly.normal; hit = HHB.ray_cast(c - n_ * 0.0008, -n_, 0.015)
    if hit[0] is not None and hit[2] != poly.index: nonhair[poly.index] = False; nb_ += 1
for poly in HH.data.polygons:                                   # 额头、鼻梁上被烘焙上头发影子的地方（灰米色，不像皮肤）：算头发，跟着染
    c = poly.center; col = fc[poly.index]
    if not nonhair[poly.index] or c.y > yR or not (CHIN + 0.30 * H_BODY < c.z < CHIN + 0.75 * H_BODY): continue
    if 0.35 < flum[poly.index] < 0.76 and (col[0] - col[2]) < 0.23 and fsat[poly.index] < 0.25: nonhair[poly.index] = False; nb_ += 1
REP['bang_tip_faces'] = nb_
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
REP['hair_spots_filled'] = filled
# 头发遮罩按面来定（不按像素颜色）：大块「不是头发」的面（脸、耳朵）和五官区 = 脸，其余全是头发。
# 用减面前的面在贴图上画出来，带棕色 / 米色的发片也算头发，不会有漏染的斑
def poly_tris(o, sel):
    uv = o.data.uv_layers.active.data; T = []
    for p_ in o.data.polygons:
        if not sel[p_.index]: continue
        li = list(p_.loop_indices)
        for k in range(1, len(li) - 1): T.append([uv[li[0]].uv[:], uv[li[k]].uv[:], uv[li[k + 1]].uv[:]])
    return np.array(T, np.float32)
upper = np.array([p_.center.z > CHIN + 0.55 * H_BODY for p_ in HH.data.polygons])   # 眉毛以上「脸」的面（额头、发际线）：这里按像素颜色分，画着头发的地方也染
np.save(OUT + '/hair_tris.npy', poly_tris(HH, ~nonhair)); np.save(OUT + '/skin_tris.npy', poly_tris(HH, nonhair & ~upper)); np.save(OUT + '/upper_tris.npy', poly_tris(HH, nonhair & upper))
REP['hair_faces_pct'] = round(float((~nonhair).mean()), 3)
# 发型头自己的脖子（下巴以下、不是头发的面）删掉，露出身体的脖子（身体肤色 = 脸的肤色），接缝藏在下巴里
bm = bmesh.new(); bm.from_mesh(HH.data); bm.faces.ensure_lookup_table()
dl = [f for f in bm.faces if nonhair[f.index] and f.calc_center_median().z < CHIN - 0.004]
REP['hairhead_neck_faces_removed'] = len(dl)
bmesh.ops.delete(bm, geom=dl, context='FACES'); bm.to_mesh(HH.data); bm.free(); HH.data.update()
# 减面
decimate(HH, CFG.get('hairhead_faces', 15000))
REP['hair_mask_pct'] = round(float(mask.mean()), 3)

# ---------------------------------------------------------------- 4. 套装（设计 18q）：整套直接用，不切开、不换色、不删皮肤；只去掉头、接上发型头的脖子、做「皮肤区」遮罩
#   配置 outfits: [{"id": "tee_test", "name": "T 恤长裤（测试）", "glb": ".../套装_xxx.glb"}, ...]；没写就用 cloth 当唯一一套
OUTFITS = CFG.get('outfits') or [{'id': 'tee_test', 'name': 'T 恤长裤（测试）', 'glb': CFG['cloth']}]
NCX = float((bv[:, 0].min() + bv[:, 0].max()) / 2); _nk = bv[(bv[:, 2] > CHIN - 0.03) & (bv[:, 2] < CHIN - 0.01)]; NCY = float(np.median(_nk[:, 1]))
def load_outfit(spec):
    C, ccol, cnrm = imp(spec['glb'], 'Outfit_' + spec['id'])
    cv = V(C); sc_ = TOP / cv[:, 2].max()
    cv = cv * sc_; cv[:, 0] -= (cv[:, 0].min() + cv[:, 0].max()) / 2 - (bv[:, 0].min() + bv[:, 0].max()) / 2
    cv[:, 1] += np.median(bv[bv[:, 2] < CHIN, 1]) - np.median(cv[cv[:, 2] < CHIN, 1]); cv[:, 2] -= cv[:, 2].min()
    setV(C, cv)
    fc = facecols(C, ccol); warm = fc[:, 0] - fc[:, 2]; skin_f = (warm > 0.12) & ((fc.max(1) - fc.min(1)) > 0.1) & (fc.mean(1) > 0.35)
    cen = np.array([p_.center[:] for p_ in C.data.polygons]); rr = np.hypot(cen[:, 0] - NCX, cen[:, 1] - NCY)
    cl = cen[(~skin_f) & (rr < 0.16) & (cen[:, 2] > 0.5 * TOP) & (cen[:, 2] < CHIN + 0.01)]
    collar_top = float(np.percentile(cl[:, 2], 99)) if len(cl) else CHIN - 0.05      # 领口：脖子附近、不是皮肤的面的最高处
    return C, ccol, cnrm, sc_, skin_f, cen, rr, collar_top
# 发型头往下放多少：露出来的脖子（领口到下巴）留 1.5 厘米（设计 18o / 18q），按所有套装里最低的领口算；领口本来就贴着下巴就不往下放
_cols = []
for sp in OUTFITS:
    _x = load_outfit(sp); _cols.append(_x[-1]); bpy.data.objects.remove(_x[0])
COLLAR_MIN = min(_cols)
HEAD_DROP = CFG.get('head_drop', float(np.clip((CHIN - COLLAR_MIN) - 0.015, 0, 0.02)))
hv_ = V(HH); hv_[:, 2] -= HEAD_DROP; setV(HH, hv_); CHIN_N = CHIN - HEAD_DROP
REP['head_drop'] = round(HEAD_DROP, 4); REP['collar_min'] = round(COLLAR_MIN, 4); REP['body']['head_ratio_after_drop'] = round(float((TOP - HEAD_DROP - CHIN_N) / (TOP - HEAD_DROP)), 4)
FACE_W = float(np.ptp(V(HH)[np.abs(V(HH)[:, 2] - (CHIN_N + 0.18 * H_BODY)) < 0.01, 0]))
R_TOP, R_BOT = 0.32 * FACE_W / 2, 0.29 * FACE_W / 2                  # 脖子粗细 = 脸宽的 32%（上）～ 29%（下）（18o）
BK = lambda sn: 0.93 if sn < 0 else 0.80                              # 脖子背面（+y）细一点
HD = bvh(HH); HDB = HD
REP['outfits'] = {}; OFS = []
def build_outfit(spec):
    C, ccol, cnrm, sc_, skin_f, cen, rr, collar_top = load_outfit(spec)
    R = {'scale': round(float(sc_), 4), 'glb': os.path.basename(spec['glb']), 'collar_top': round(collar_top, 4)}
    # 去掉头（下巴以上）和露出来的脖子皮肤，换成第六版那根脖子；领口布料不动
    # 领口线（设计 18s 第 1 条）：脖子周围按角度分 36 份，每份里「衣服」（不是皮肤）的面的最高处 = 那个角度的领口高度；
    # 领口线以上的面（不管什么颜色：套装自带的脖子、肉色碎片）全删，切口磨平，新脖子从领口里伸出来
    ang = np.arctan2(cen[:, 1] - NCY, cen[:, 0] - NCX); nb = 36; bi = ((ang + np.pi) / (2 * np.pi) * nb).astype(int) % nb
    zone = (rr < 0.17) & (cen[:, 2] > 0.5 * TOP) & (cen[:, 2] < CHIN + 0.004)
    fcz = facecols(C, ccol); darkwarm = ((fcz[:, 0] - fcz[:, 2]) > 0.04) & (fcz.mean(1) < 0.42)     # 套装自带的头下巴底下（烘焙成深棕色的皮肤）      # 下巴以上是套装自带的头（后脑勺暗，会被当成衣服），不算
    cl_h = np.full(nb, collar_top)
    for k in range(nb):
        m_ = zone & (bi == k) & ~skin_f & ~darkwarm & (rr > R_TOP * 1.05)
        if m_.sum() >= 3: cl_h[k] = float(np.percentile(cen[m_, 2], 97))
    cl_h = np.array([np.median(np.take(cl_h, range(k - 2, k + 3), mode='wrap')) for k in range(nb)])   # 平滑一下，领口线不锯齿
    cl_h = np.clip(cl_h, collar_top - 0.045, None)                     # 某个角度没量到衣服（数太低）→ 不比最高领口低太多，免得后领口切出一个缺口
    R['collar_line'] = [round(float(cl_h.min()), 4), round(float(cl_h.max()), 4)]
    z_low = float(cl_h.min()) - 0.03                                   # 新脖子下端：最低的领口再往下 3 厘米（插进衣服里）
    kill = (cen[:, 2] > max(CHIN_N, collar_top) + 0.006) | (zone & (cen[:, 2] > cl_h[bi] + 0.001)) | (zone & darkwarm & (cen[:, 2] > cl_h[bi] - 0.02) & (rr < 0.12)) | ((cen[:, 2] > cl_h.max() + 0.003) & (rr < 0.25))      # 领口最高处以上、脖子附近剩下的（套装自带下巴底下的一片薄片） | (skin_f & (cen[:, 2] > z_low + 0.01) & (rr < 0.13))
    delete_faces(C, kill); drop_small(C, 0.004)
    R['collar_rim'] = len(tidy_rims(C, 10, 0.5, sel=lambda P: len(P) > 12 and P[:, 2].mean() > 0.5 * TOP and np.hypot(P[:, 0].mean() - NCX, P[:, 1].mean() - NCY) < 0.08))
    bm = bmesh.new(); bm.from_mesh(C.data); uvl = bm.loops.layers.uv.active
    NU = KDTree(len(bm.verts)); vuv = {}; vsk = {}
    for v in bm.verts:
        NU.insert(v.co, v.index)
        if v.link_loops: vuv[v.index] = tuple(v.link_loops[0][uvl].uv)
    NU.balance()
    rings = []
    for z_ in np.linspace(z_low, max(CHIN_N - 0.014, z_low + 0.012), 5):
        t = float(np.clip((z_ - z_low) / (CHIN_N - z_low), 0, 1)); r_ = R_BOT + (R_TOP - R_BOT) * t * t
        rings.append([bm.verts.new((NCX + r_ * np.cos(a_), NCY + BK(np.sin(a_)) * r_ * np.sin(a_), z_)) for a_ in np.linspace(0, 2 * np.pi, 24, endpoint=False)])
    up = [[], [], []]
    for a_ in np.linspace(0, 2 * np.pi, 24, endpoint=False):
        x0, y0 = NCX + R_TOP * 1.1 * np.cos(a_), NCY + BK(np.sin(a_)) * R_TOP * 1.1 * np.sin(a_)
        hit = HDB.ray_cast(Vector((x0, y0, CHIN_N - 0.05)), Vector((0, 0, 1)), 0.2); zh = hit[0].z if hit[0] is not None else CHIN_N + 0.01
        for k, (dz, fl) in enumerate(((-0.002, 1.04), (0.008, 1.06), (0.022, 1.0))):     # 上端贴着下颌底伸进头里，不往外翻（翻出来朝下的一圈是暗的）
            up[k].append(bm.verts.new((NCX + R_TOP * fl * np.cos(a_), NCY + BK(np.sin(a_)) * R_TOP * fl * np.sin(a_), max(zh + dz, CHIN_N - 0.012 + dz))))
    rings += up; tube = set(v for r_ in rings for v in r_)
    for k in range(len(rings) - 1):
        for j in range(24):
            f = bm.faces.new((rings[k][j], rings[k][(j + 1) % 24], rings[k + 1][(j + 1) % 24], rings[k + 1][j]))
            for lp in f.loops:
                co, idx, d = NU.find(lp.vert.co)
                if idx in vuv: lp[uvl].uv = vuv[idx]
    bm.normal_update()
    for f in bm.faces:
        if all(v in tube for v in f.verts):
            c = f.calc_center_median()
            if f.normal.dot(Vector((c.x - NCX, c.y - NCY, 0))) < 0: f.normal_flip()
    bm.normal_update()
    bm.to_mesh(C.data); bm.free(); C.data.update()
    for p_ in C.data.polygons: p_.use_smooth = True
    if C.data.has_custom_normals: bpy.context.view_layer.objects.active = C; bpy.ops.mesh.customdata_custom_splitnormals_clear()
    decimate(C, spec.get('faces', CFG.get('outfit_faces', 15000)))
    # 顶点颜色：R = 皮肤区（游戏里换成脸的肤色；脚踝以下不算，米色鞋会被认成皮肤），G = 下巴底下脖子的影子，B = 0
    vc = vertcols(C, ccol); ca = C.data.color_attributes.new('COLOR_0', 'FLOAT_COLOR', 'POINT')
    # 皮肤区往外长几圈：手、手腕上烘焙成深棕的阴影（偏暖、但太暗，原来的规则认不出来，18s 第 4 条）也算皮肤
    strict = ((vc[:, 0] - vc[:, 2]) > 0.08) & ((vc.max(1) - vc.min(1)) > 0.06) & (vc.mean(1) > 0.3)
    loose = ((vc[:, 0] - vc[:, 2]) > 0.03) & (vc.mean(1) > 0.06)
    nbr = [[] for _ in C.data.vertices]
    for e in C.data.edges: a_, b_ = e.vertices; nbr[a_].append(b_); nbr[b_].append(a_)
    grown = strict.copy()
    for _ in range(8):
        add = [i for i in range(len(grown)) if not grown[i] and loose[i] and any(grown[j] for j in nbr[i])]
        if not add: break
        grown[add] = True
    # 长出来的那部分如果紧挨着衣服（1.5 厘米内）→ 是袖口 / 领口里面的内壁，不算皮肤，下面算内壁
    cl_ids = [i for i in range(len(grown)) if not grown[i] and vc[i].mean() > 0.3]; kdC = KDTree(len(cl_ids) or 1)
    for j, i in enumerate(cl_ids): kdC.insert(C.data.vertices[i].co, j)
    kdC.balance(); wall = np.zeros(len(grown), bool)
    for i in range(len(grown)):
        if grown[i] and not strict[i] and cl_ids and kdC.find(C.data.vertices[i].co)[2] < 0.015: wall[i] = True
    grown &= ~wall
    if not spec.get('skin_legs'):                                     # 长裤的套装腿上不会有皮肤（裤子上的米色污渍会被当成皮肤）；短裤套装配置里写 skin_legs: true
        legs = np.array([v.co.z < 0.40 * TOP and abs(v.co.x - NCX) < 0.2 for v in C.data.vertices]); grown &= ~legs
    R['skin_grown'] = int(grown.sum() - strict.sum())
    # 开口内壁（袖口、领口、裤脚里面一圈烘焙成深色）：挨着皮肤 2.5 厘米内、不是皮肤、颜色暗的顶点 → B = 1，游戏里涂成衣服色 × 0.8（18s 第 3 条）
    sk_ids = [i for i in range(len(grown)) if grown[i]]; kdS = KDTree(len(sk_ids) or 1)
    for j, i in enumerate(sk_ids): kdS.insert(C.data.vertices[i].co, j)
    kdS.balance(); cloth_med = np.median(vc[~grown & (vc.mean(1) > 0.25)], 0) if (~grown & (vc.mean(1) > 0.25)).any() else np.array([0.7, 0.7, 0.7])
    rimv = np.zeros(len(grown), bool)
    for i, v in enumerate(C.data.vertices):
        if grown[i] or not sk_ids: continue
        if kdS.find(v.co)[2] < 0.025 and vc[i].mean() < 0.75 * cloth_med.mean(): rimv[i] = True
    rimv |= wall
    C['rim'] = '#%02x%02x%02x' % tuple(int(min(1, x * 0.8) * 255) for x in cloth_med); R['rim_verts'] = int(rimv.sum())
    for i, v in enumerate(C.data.vertices):
        r_ = np.hypot(v.co.x - NCX, v.co.y - NCY); neck = r_ < R_TOP * 1.12 and v.co.z > z_low - 0.005
        kb = int(((np.arctan2(v.co.y - NCY, v.co.x - NCX) + np.pi) / (2 * np.pi) * nb)) % nb
        collar_band = (not neck) and r_ < 0.17 and v.co.z > cl_h[kb] - 0.015            # 领口一圈 1.5 厘米只算衣服（18s）
        sk = 1.0 if neck else 0.0 if (collar_band or v.co.z < spec.get('skin_min_z', 0.13)) else (1.0 if grown[i] else 0.0)
        g_ = float(np.clip((v.co.z - (collar_top - 0.005)) / max(0.01, CHIN_N - collar_top), 0, 1)) if neck else 0.0
        ca.data[i].color = (sk, g_, 1.0 if (rimv[i] and sk < 0.5 and not collar_band) else 0.0, 1)
    R['skin_vert_pct'] = round(float(np.mean([ca.data[i].color[0] > 0.5 for i in range(len(C.data.vertices))])), 3)
    R['faces'] = len(C.data.polygons)
    # 开口边的深色（袖口、领口、裤脚里面，混元烘焙成深色，18s 第 3 条）：挨着皮肤 2 厘米内的衣服面，交给 texfix 把太暗的像素换成旁边衣服色 × 0.85
    fc2 = facecols(C, ccol); sk2 = ((fc2[:, 0] - fc2[:, 2]) > 0.12) & ((fc2.max(1) - fc2.min(1)) > 0.1) & (fc2.mean(1) > 0.35)
    ce2 = np.array([p_.center[:] for p_ in C.data.polygons]); kd_ = KDTree(int(sk2.sum()) or 1)
    for i_, c_ in enumerate(ce2[sk2]): kd_.insert(Vector(c_), i_)
    kd_.balance(); near = np.zeros(len(ce2), bool)
    if sk2.any():
        for i_, c_ in enumerate(ce2):
            if not sk2[i_] and kd_.find(Vector(c_))[2] < 0.02: near[i_] = True
    C['rim_faces'] = int(near.sum()); C['_rim'] = near.astype(np.uint8).tobytes().hex()
    C['outfit'] = spec['id']; C['outfit_name'] = spec.get('name', spec['id'])
    REP['outfits'][spec['id']] = R
    return C, ccol, cnrm
OFT = [build_outfit(sp) for sp in OUTFITS]; OFS = [x[0] for x in OFT]
bpy.data.objects.remove(B)                                            # 基础身体只用来量尺寸，不进游戏
REP['cloth_scale'] = REP['outfits'][OUTFITS[0]['id']]['scale']; REP['hem'] = None; REP['ankle'] = None
# ---------------------------------------------------------------- 6. 骨骼（跟第一版一样，名字跟 Kenney 一样）+ 权重
J = {'Hips': ((0, 0, 0.27), (0, 0, 0.36)), 'Spine': ((0, 0, 0.36), (0, 0, 0.45)), 'Chest': ((0, 0, 0.45), (0, 0, 0.55)), 'UpperChest': ((0, 0, 0.55), (0, 0, 0.64)),
     'Neck': ((0, 0, 0.64), (0, 0, 0.70)), 'Head': ((0, 0, 0.70), (0, 0, 1.15))}
for sd_, k in (('Left', 1), ('Right', -1)):
    J[sd_ + 'Shoulder'] = ((0.04 * k, 0, 0.60), (0.15 * k, 0, 0.565)); J[sd_ + 'Arm'] = ((0.15 * k, 0, 0.565), (0.265 * k, 0, 0.485)); J[sd_ + 'ForeArm'] = ((0.265 * k, 0, 0.485), (0.33 * k, 0, 0.425))
    J[sd_ + 'Hand'] = ((0.33 * k, 0, 0.425), (0.385 * k, 0, 0.37)); J[sd_ + 'UpLeg'] = ((0.075 * k, 0, 0.27), (0.085 * k, 0, 0.165)); J[sd_ + 'Leg'] = ((0.085 * k, 0, 0.165), (0.088 * k, 0, 0.065))
    J[sd_ + 'Foot'] = ((0.088 * k, 0, 0.065), (0.095 * k, -0.12, 0.02))
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
        if v.co.z > 0.50 or abs(v.co.x - NCX) > 0.19: continue           # 身子、腿（两手之间）
        bad = [x for x in v.groups if gi_[x.group] in ARMS and x.weight > 0]
        if not bad: continue
        n_ += 1
        for x in bad: x.weight = 0.0
        tot = sum(x.weight for x in v.groups)
        if tot < 1e-3: o.vertex_groups['Spine' if v.co.z > 0.36 else 'Hips'].add([v.index], 1.0, 'REPLACE')
        else:
            for x in v.groups: x.weight /= tot
    return n_
def waist_fix(o, z_top=0.36, z_bot=0.19):
    gi_ = {g.index: g.name for g in o.vertex_groups}; hg = o.vertex_groups['Hips']; n_ = 0
    for v in o.data.vertices:
        f_ = float(np.clip((v.co.z - z_bot) / (z_top - z_bot), 0, 1)) ** 0.7
        if abs(v.co.x - NCX) < 0.05: f_ = max(f_, 0.6 * float(np.clip((v.co.z - 0.12) / 0.1, 0, 1)))
        if f_ <= 0 or v.co.z > 0.45: continue
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
rigid(HH, lambda c: 'Head')

# ---------------------------------------------------------------- 7. 动作：站 / 走 / 跑（跟第一版一样）
bpy.context.scene.render.fps = 30
rest = {b.name: b.matrix_local.to_quaternion() for b in A.data.bones}; hinge = {}
for b in A.data.bones:
    d = (b.tail_local - b.head_local).normalized(); ax = d.cross(Vector((0, -1, 0))); hinge[b.name] = ax.normalized() if ax.length > 1e-4 else Vector((1, 0, 0))
BDIR = {b.name: (b.tail_local - b.head_local).normalized() for b in A.data.bones}
Rx = lambda a: Quaternion((1, 0, 0), a); Ry = lambda a: Quaternion((0, 1, 0), a); Rz = lambda a: Quaternion((0, 0, 1), a); flex = lambda n, a: Quaternion(hinge[n], a)
def setrot(pb, R): r = rest[pb.name]; pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = r.inverted() @ R @ r
D = math.radians; ARM_DOWN = D(36)
# 设计 18m：走 / 跑重做。一条腿的一个循环 p = 0～1 用关键点（大腿角、膝盖角）插值；胯的高度按「着地那只脚贴地」算（脚不悬空、不插地），跑步腾空时再往上弹
#   大腿角 + = 往前抬；膝盖角 + = 往后弯
LEGK = {
    'run':  [(0.00, 36, 15), (0.12, 0, 28), (0.25, -42, 14), (0.42, -26, 105), (0.60, 30, 115), (0.80, 70, 85), (0.92, 50, 38), (1.00, 36, 15)],   # 0～0.25 着地蹬地；0.42 脚跟往上踢；0.8 膝盖抬到快水平
    'walk': [(0.00, 30, 4), (0.30, 0, 8), (0.58, -28, 6), (0.70, -18, 40), (0.86, 18, 30), (1.00, 30, 4)],
}
STANCE = {'run': 0.25, 'walk': 0.60}          # 着地占一条腿循环的多少（跑 30% → 两次腾空；走 62% → 双脚着地有重叠，没有腾空）
def legk(kind, p):
    K = LEGK[kind]; p %= 1.0
    for (p0, t0, k0), (p1, t1, k1) in zip(K, K[1:]):
        if p0 <= p <= p1:
            u = (p - p0) / (p1 - p0); u = 0.5 - 0.5 * math.cos(math.pi * u); return D(t0 + (t1 - t0) * u), D(k0 + (k1 - k0) * u)
    return D(K[0][1]), D(K[0][2])
def pose(kind, ph, hip=0.0):
    P = A.pose.bones; s_ = math.sin(2 * math.pi * ph)
    for pb in P: pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
    if kind == 'idle':
        br = math.sin(2 * math.pi * ph); setrot(P['Chest'], Rx(D(1.5) * br)); setrot(P['Head'], Rx(-D(1.5) * br) @ Rz(D(2) * math.sin(2 * math.pi * ph + 1))); P['Hips'].location = (0, 0.002 * br, 0)
        for sd_, k in (('Left', 1), ('Right', -1)): setrot(P[sd_ + 'Arm'], Ry(k * (ARM_DOWN + D(2) * br))); setrot(P[sd_ + 'ForeArm'], flex(sd_ + 'ForeArm', D(10)))
        return
    run = kind == 'run'
    lean, tw, AF, AB, EL = (D(13), D(8), D(62), D(42), D(88)) if run else (D(2), D(4), D(18), D(16), D(8))
    P['Hips'].location = (0, hip, 0)
    setrot(P['Hips'], Rz(tw * 0.6 * s_)); setrot(P['Spine'], Rx(lean * 0.6) @ Rz(-tw * s_)); setrot(P['Chest'], Rx(lean * 0.4) @ Rz(-tw * 0.5 * s_))
    setrot(P['Head'], Rx(-lean * 0.7 + (D(3) * math.cos(4 * math.pi * ph - 0.6) if run else 0)))     # 头抬一点看前方；跑的时候落地往下点一下
    for sd_, k, off in (('Left', 1, 0.0), ('Right', -1, 0.5)):
        th, kn = legk(kind, ph + off)
        setrot(P[sd_ + 'UpLeg'], Rx(-th - lean * 0.6)); setrot(P[sd_ + 'Leg'], Rx(kn)); setrot(P[sd_ + 'Foot'], Rx(-kn * 0.35 + th * 0.25 + (D(12) if run else 0) * max(0, math.sin(2 * math.pi * (ph + off) - 2.0))))
        # 手臂跟同侧的腿反着摆：腿往前时手往后
        sw = -math.sin(2 * math.pi * (ph + off) + (0.35 if run else 0)); sw = AF * max(0, sw) - AB * max(0, -sw)
        setrot(P[sd_ + 'Arm'], Rx(-sw - lean * 0.6) @ Ry(k * (ARM_DOWN - (D(14) if run else 0)))); setrot(P[sd_ + 'ForeArm'], flex(sd_ + 'ForeArm', EL + (D(10) * max(0, math.sin(2 * math.pi * (ph + off))) if run else D(6) * max(0, -sw / AB))))
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
FRAMES = {'idle': 90, 'walk': 26, 'run': 12}                                # 30 帧/秒：走 0.87 秒、跑 0.4 秒一个循环
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
A.animation_data.action = bpy.data.actions['idle']
for pb in A.pose.bones: pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)

# ---------------------------------------------------------------- 8. 贴图、材质、导出
# 发型头脸的肤色（中位数）——身体皮肤用这个颜色
fp = hp[::8, ::8].reshape(-1, 3); fm = ((fp.max(1) - fp.min(1)) > 0.2) & (fp.mean(1) > 0.5) & (fp[:, 0] > fp[:, 2] + 0.15)
skc = (CHEEK * 0.92) if CHEEK is not None else np.median(fp[fm], 0)   # 脸颊贴图里带了烘焙的亮光，身体再乘 0.92 跟头亮度一致
REP['skin_hex'] = '#%02x%02x%02x' % tuple(int(round(min(1, x) * 255)) for x in skc)
for o in OFS: o['skin'] = REP['skin_hex']
# 发型头贴图：RGB = 原贴图，透明通道 = 头发遮罩
REP['tex_hairhead'] = texfix(hhcol, OUT + '/hairhead_tex.png', 2048, [HH], hair=True, hair_tris=OUT + '/hair_tris.npy', skin_tris=OUT + '/skin_tris.npy')
# 头发遮罩放进顶点颜色 R（不放贴图透明通道）：每个面在遮罩上取样（3 个角 + 中心），头发 / 脸交界的边拆开，两边各是 1 / 0
HM = np.load(OUT + '/hairhead_tex.png.hairmask.npy'); MH, MW = HM.shape
bm = bmesh.new(); bm.from_mesh(HH.data); uvl_ = bm.loops.layers.uv.active; isH = {}
for f in bm.faces:
    pts = [l[uvl_].uv for l in f.loops]; pts.append(sum(pts, Vector((0, 0))) / len(pts))
    isH[f] = np.mean([HM[min(MH - 1, int((1 - p.y) * MH)), min(MW - 1, int(p.x * MW))] for p in pts]) > 0.5
cut = [e for e in bm.edges if len(e.link_faces) == 2 and isH[e.link_faces[0]] != isH[e.link_faces[1]]]
bmesh.ops.split_edges(bm, edges=cut); REP['hair_mask_split_edges'] = len(cut)
bm.to_mesh(HH.data); bm.free(); HH.data.update()
fh = {p_.index for p_ in HH.data.polygons}
bm = bmesh.new(); bm.from_mesh(HH.data); bm.faces.ensure_lookup_table(); vh = {}
for f in bm.faces:
    pts = [l[bm.loops.layers.uv.active].uv for l in f.loops]; pts.append(sum(pts, Vector((0, 0))) / len(pts))
    h_ = np.mean([HM[min(MH - 1, int((1 - p.y) * MH)), min(MW - 1, int(p.x * MW))] for p in pts]) > 0.5
    for v in f.verts: vh[v.index] = max(vh.get(v.index, 0.0), 1.0 if h_ else 0.0)
bm.free()
ch_ = HH.data.color_attributes.new('COLOR_0', 'FLOAT_COLOR', 'POINT')
for i, v in enumerate(HH.data.vertices):   # R = 头发；G = 下巴底下朝下的那一圈（贴图烘焙成深棕色）→ 游戏里涂肤色，侧面看不到黑缝（18s 第 2 条）
    t_ = vh.get(i, 0.0); ug = 1.0 if (t_ < 0.5 and v.co.z < CHIN_N + 0.035 and v.normal.z < -0.15) else 0.0; ch_.data[i].color = (t_, ug, 0, 1)
REP['chin_under_verts'] = int(sum(1 for i in range(len(HH.data.vertices)) if ch_.data[i].color[1] > 0.5))
REP['hair_vert_pct'] = round(float(np.mean([vh.get(i, 0) for i in range(len(HH.data.vertices))])), 3)
TEX = {'HairHead': (OUT + '/hairhead_tex.png', hhnrm, 1024)}
for (o, ccol_, cnrm_), sp in zip(OFT, OUTFITS):                      # 每套一张贴图（颜色就是生成出来的样子，不换色）；开口边太暗的像素提亮（18s）
    near = np.frombuffer(bytes.fromhex(o['_rim']), np.uint8).astype(bool); del o['_rim']
    np.save(OUT + f"/outfit_{sp['id']}_rim.npy", poly_tris(o, near) if near.any() else np.zeros((0, 3, 2), np.float32))
    p_ = OUT + f"/outfit_{sp['id']}_tex.png"
    REP['outfits'][sp['id']]['tex'] = texfix(ccol_, p_, 1024, [o], dark_tris=OUT + f"/outfit_{sp['id']}_rim.npy")
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
HH.data.materials.clear(); HH.data.materials.append(mat('HairHeadMat', 'HairHead', True))
for o, sp in zip(OFS, OUTFITS): o.data.materials.clear(); o.data.materials.append(mat('OutfitMat_' + sp['id'], 'Outfit_' + sp['id'], True))
REP['faces'] = {o.name: len(o.data.polygons) for o in [HH] + OFS}
bpy.ops.wm.save_as_mainfile(filepath=OUT + '/hero.blend')
bpy.ops.object.select_all(action='DESELECT')
for o in [A, HH] + OFS: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT + '/hero_m2.glb', use_selection=True, export_format='GLB', export_image_format='AUTO', export_animations=True, export_animation_mode='ACTIONS',
    export_skins=True, export_morph=False, export_def_bones=False, export_yup=True, export_vertex_color='ACTIVE', export_extras=True)
REP['size_kb'] = os.path.getsize(OUT + '/hero_m2.glb') // 1024
json.dump(REP, open(OUT + '/report.json', 'w'), ensure_ascii=False, indent=1)
log('REPORT', json.dumps(REP, ensure_ascii=False))
os._exit(0)
