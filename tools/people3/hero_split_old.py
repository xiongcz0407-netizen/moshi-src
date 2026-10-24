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
def texfix(img, path, size, objs, mask=None, hair=False, fill_objs=None, hair_tris=None, skin_tris=None):
    """贴图后处理（系统 python 跑 texfix.py）：UV 岛外扩、头发去杂色压范围、衣服里的肉色斑填掉"""
    import subprocess
    tmp = path + '.src.png'; im = img.copy(); im.filepath_raw = tmp; im.file_format = 'PNG'; im.save()
    J = {'rgb': tmp, 'out': path, 'size': size, 'tris': uv_tris(objs, path + '.tris.npy'), 'hair': hair}
    if mask is not None: np.save(path + '.mask.npy', mask.astype(np.float32)); J['mask'] = path + '.mask.npy'
    if fill_objs: J['fill_tris'] = uv_tris(fill_objs, path + '.fill.npy')
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

# 发型头整体往下放一点（设计 18o 第 1 条：露出来的脖子短 40%，Q 版脖子大部分藏起来）。尺子、比例检查不受影响
HEAD_DROP = CFG.get('head_drop', 0.015); hv_ = V(HH); hv_[:, 2] -= HEAD_DROP; setV(HH, hv_); CHIN_N = CHIN - HEAD_DROP
REP['head_drop'] = HEAD_DROP; REP['body']['head_ratio_after_drop'] = round(float((TOP - HEAD_DROP - CHIN_N) / (TOP - HEAD_DROP)), 4)
# ---------------------------------------------------------------- 4. 衣服：等比例对齐身体，删皮肤，按颜色 / 高度切三件
C, ccol, cnrm = imp(CFG['cloth'], 'Cloth')
cv = V(C); S_CLOTH = TOP / cv[:, 2].max()
cv = cv * S_CLOTH; cv[:, 0] -= (cv[:, 0].min() + cv[:, 0].max()) / 2 - (bv[:, 0].min() + bv[:, 0].max()) / 2
cv[:, 1] += np.median(bv[bv[:, 2] < CHIN, 1]) - np.median(cv[cv[:, 2] < CHIN, 1]); cv[:, 2] -= cv[:, 2].min()
setV(C, cv); REP['cloth_scale'] = round(float(S_CLOTH), 4)
cc = facecols(C, ccol); cen = np.array([p.center[:] for p in C.data.polygons]); lum = cc.mean(1); warm = cc[:, 0] - cc[:, 2]
beige = (warm > 0.06) & (cen[:, 2] < 0.2 * TOP)
ANKLE = float(np.percentile(cen[beige, 2], 98)) + 0.003     # 鞋口最高处 = 脚踝
skin = (warm > 0.12) & (cen[:, 2] > ANKLE + 0.03)
skin |= cen[:, 2] > CHIN - 0.01                               # 头和脖子
skin |= (warm > 0.08) & (cen[:, 2] > 0.5 * TOP)                 # 领口、袖口附近暗一点的皮肤
# 上衣 / 裤子：上衣下摆和裤腰之间有一道暗缝，按高度找这道缝（一圈切开）；缝以上 = 上衣，以下 = 裤子
z = cen[:, 2]; zs = np.arange(0.30 * TOP, 0.42 * TOP, 0.003); tor = ~skin & (np.abs(cen[:, 0]) < 0.17)   # 只看身子（不看胳膊）
med = [np.median(lum[(np.abs(z - zz) < 0.003) & tor]) if ((np.abs(z - zz) < 0.003) & tor).sum() > 20 else 9 for zz in zs]
HEM = float(zs[int(np.argmin(med))]); is_shirt = z > HEM
REP['hem'] = round(HEM, 4)
shoes_m = (z < ANKLE) | (beige & (z < ANKLE + 0.02))
rest = ~skin & ~shoes_m
NCX0 = float((bv[:, 0].min() + bv[:, 0].max()) / 2)
SH = split_obj(C, rest & is_shirt, 'Shirt'); PN = split_obj(C, rest & ~is_shirt, 'Pants'); SO = split_obj(C, shoes_m & ~skin, 'Shoes')
bpy.data.objects.remove(C)
for o in (SH, PN, SO): drop_small(o, 0.004)
REP['ankle'] = round(ANKLE, 4)
log('cloth scale', S_CLOTH, 'ankle', ANKLE, {o.name: len(o.data.polygons) for o in (SH, PN, SO)})
# 衣服离身体太近 / 插进去的往外推一点
BB = bvh(B)
for o in (SH, PN):
    P = V(o)
    for i, p in enumerate(P):
        loc, nor, idx, d = BB.find_nearest(Vector(p))
        if loc is not None and (Vector(p) - loc).dot(nor) < 0.004: P[i] = np.array(loc + nor * 0.004)
    setV(o, P)
decimate(SH, CFG.get('shirt_faces', 4500)); decimate(PN, CFG.get('pants_faces', 3000)); decimate(SO, CFG.get('shoes_faces', 3000))
# 补内壁：开口（袖口、领口、下摆、裤腰、裤脚、鞋口）的边往里收一圈
def inner_rim(o, depth=0.010):
    o['n_outer'] = len(o.data.vertices)                          # 这个序号以后的顶点 = 内壁（顶点颜色 G = 1，游戏里涂成衣服颜色的暗一点）
    bm = bmesh.new(); bm.from_mesh(o.data); bm.normal_update()
    edges = [e for e in bm.edges if len(e.link_faces) == 1]
    if not edges: bm.free(); return 0
    nrm = {v: v.normal.copy() for e in edges for v in e.verts}
    r = bmesh.ops.extrude_edge_only(bm, edges=edges); nv = [g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)]
    src = {}
    for e in edges:
        for v in e.verts: src.setdefault(v.co.copy().freeze(), nrm[v])
    for v in nv:
        n = src.get(v.co.copy().freeze())
        if n: v.co -= n * depth
    bm.to_mesh(o.data); bm.free(); return len(edges)

def clean_edges(o, passes=3):
    """开口边上的碎三角（有两条边在开口上的面 = 尖刺）删掉，再沿边磨平一圈"""
    n = 0
    for _ in range(passes):
        bm = bmesh.new(); bm.from_mesh(o.data)
        sp = [f for f in bm.faces if sum(1 for e in f.edges if e.is_boundary) >= 2]
        n += len(sp); bmesh.ops.delete(bm, geom=sp, context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS'); bm.to_mesh(o.data); bm.free()
        if not sp: break
    tidy_rims(o, 6, 0.5); return n
REP['edge_spikes_removed'] = {o.name: clean_edges(o) for o in (SH, PN, SO)}
# 上衣下摆：切口放平，再往下长 2 厘米盖住裤腰（贴在裤子外面 3 毫米），下摆和裤腰之间不留缝（第四版检查第 4 条：裤腰前面的黑团）
PB = bvh(PN); bm = bmesh.new(); bm.from_mesh(SH.data); bm.verts.ensure_lookup_table()
he = [e for e in bm.edges if e.is_boundary and max(v.co.z for v in e.verts) < HEM + 0.05 and all(abs(v.co.x - NCX0) < 0.24 for v in e.verts)]
hv = set(v for e in he for v in e.verts)
for v in hv: v.co.z = HEM + 0.004
if he:
    r = bmesh.ops.extrude_edge_only(bm, edges=he); nv = [g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)]
    for v in nv:
        v.co.z = HEM - 0.015; loc, nor, idx, d = PB.find_nearest(v.co)
        if loc is not None and (v.co - loc).dot(nor) < 0.006: v.co = loc + nor * 0.006
REP['hem_overlap_edges'] = len(he)
# 下摆盖住的那一圈裤腰往里收 4 毫米，不从下摆里穿出来
bm.to_mesh(SH.data); SB_ = bvh(SH); P_ = V(PN); nin = 0
for i, p_ in enumerate(P_):
    if HEM - 0.02 < p_[2] < HEM + 0.03:
        loc, nor, idx, d = SB_.find_nearest(Vector(p_))
        if loc is not None and d < 0.012: P_[i] = np.array(Vector(p_) - nor * 0.004); nin += 1
setV(PN, P_); REP['pants_tucked'] = nin
bm.to_mesh(SH.data); bm.free(); SH.data.update()
from mathutils.kdtree import KDTree
for o in (SH, PN):                                                         # 离开口多远（领口、袖口、下摆、裤脚边上 1.5 厘米内的贴图有残留的毛边，游戏里用平的衣服颜色）
    bm = bmesh.new(); bm.from_mesh(o.data); bv_ = [v.co.copy() for e in bm.edges if e.is_boundary for v in e.verts]; bm.free()
    kd = KDTree(len(bv_))
    for i, c in enumerate(bv_): kd.insert(c, i)
    kd.balance(); o['edged'] = [float(kd.find(v.co)[2]) if bv_ else 1.0 for v in o.data.vertices]
tidy_rims(SO, 12, 0.5)                                                     # 鞋口磨平（抬腿时露出来的白色锯齿）
REP['inner_rim_edges'] = {o.name: inner_rim(o) for o in (SH, PN, SO)}

# ---------------------------------------------------------------- 5. 身体：去掉原来的头、衣服盖住的、鞋里的脚；皮肤顶点颜色
HD = bvh(HH); dg = bpy.context.evaluated_depsgraph_get(); CV = {o.name: BVHTree.FromObject(o, dg) for o in (SH, PN)}
bm = bmesh.new(); bm.from_mesh(B.data); bm.normal_update(); kill = []
SH_TOP = V(SH)[:, 2].max()
# 脖子（设计 18j 第 5 条 + 第四版检查第 3 条）：原来身体的脖子和头全删，换一根圆柱：下端插进领口，上端伸进发型头（融进下巴）
_bv = np.array([v.co[:] for v in bm.verts]); _nk = _bv[(_bv[:, 2] > CHIN - 0.03) & (_bv[:, 2] < CHIN - 0.01)]
NCX = float((bv[:, 0].min() + bv[:, 0].max()) / 2); NCY = float(np.median(_nk[:, 1]))
bmS = bmesh.new(); bmS.from_mesh(SH.data)
_cl = [((e.verts[0].co + e.verts[1].co) / 2) for e in bmS.edges if e.is_boundary]
_cl = np.array([c[:] for c in _cl if np.hypot(c.x - NCX, c.y - NCY) < 0.16 and c.z > HEM + 0.12]); bmS.free()   # 领口那一圈
COLLAR_LOW = float(_cl[:, 2].min()) if len(_cl) else CHIN - 0.06
Z_LOW = COLLAR_LOW - 0.02
FACE_W = float(np.ptp(V(HH)[np.abs(V(HH)[:, 2] - (CHIN_N + 0.18 * H_BODY)) < 0.01, 0])) if True else 0.4
R_TOP, R_BOT = 0.32 * FACE_W / 2, 0.29 * FACE_W / 2                  # 脖子粗细 = 脸宽的 32%（上）～ 29%（下）（18o：背面看不要一根宽柱子）
REP['neck'] = {'face_w': round(FACE_W, 4), 'd_top': round(2 * R_TOP, 4), 'd_bottom': round(2 * R_BOT, 4), 'collar_low': round(COLLAR_LOW, 4), 'bottom_z': round(Z_LOW, 4)}
# 原来脖子的 UV（新脖子用最近的原脖子 UV：皮肤贴图 + 法线贴图照样有）
_uvl = bm.loops.layers.uv.active; NECK_UV = KDTree(len(bm.verts)); _vuv = {}
for v in bm.verts:
    NECK_UV.insert(v.co, v.index)
    if v.link_loops: _vuv[v.index] = tuple(v.link_loops[0][_uvl].uv)
NECK_UV.balance(); moved = set(); far = set()
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().z > CHIN_N - 0.01 or (f.calc_center_median().z > Z_LOW + 0.01 and np.hypot(f.calc_center_median().x - NCX, f.calc_center_median().y - NCY) < 0.12)], context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS'); bm.normal_update()
for f in bm.faces:
    c = f.calc_center_median(); n = f.normal
    if c.z < ANKLE - 0.035: kill.append(f); continue                      # 脚藏进鞋里（脚踝留一截在鞋口里，抬腿时裤脚和鞋口之间看到的是暗的腿，不是鞋里面的白边）
    loc, nor, idx, d = HD.find_nearest(c)
    if loc is not None and (c - loc).dot(nor) < 0 and c.z < CHIN - 0.02: kill.append(f); continue   # 下巴附近的不删（已经贴进头里，删了边上会一排锯齿）
    if any(v.index in moved for v in f.verts) or c.z > SH_TOP: continue
    if c.z < SH_TOP - 0.01 and CV['Shirt'].ray_cast(c - n * 0.001, -n, 0.015)[0] is not None: kill.append(f); continue   # 从 T 恤里穿出来的
    if c.z < SH_TOP:                                                       # 跟 T 恤贴在一起的（背后领口下那一条，两层打架会闪出肉色）
        loc, nor, idx, d = CV['Shirt'].find_nearest(c)
        if loc is not None and d < 0.006 and abs(nor.dot(n)) > 0.7: kill.append(f); continue  # 脖子（挪进头里的）和领口以上的不会被衣服盖住，不做下面的检查
    for nm in ('Shirt', 'Pants'):
        if CV[nm].ray_cast(c + n * 0.001, n, 0.08)[0] is not None and all(CV[nm].ray_cast(c + n * 0.001, (n + Vector(tt)).normalized(), 0.1)[0] is not None for tt in ((0.3, 0, 0), (-0.3, 0, 0), (0, 0, 0.3), (0, 0, -0.3))):
            kill.append(f); break
bmesh.ops.delete(bm, geom=kill, context='FACES'); bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS'); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(B.data); bm.free()
REP['body_edge_spikes_removed'] = clean_edges(B, 4)                      # 删衣服盖住的面以后，袖口里手臂的边是锯齿，从袖口能看到
# 新脖子：圆柱，24 段 × 9 圈，从领口里（Z_LOW）到下巴上 3.5 厘米（发型头里），上粗下略细
bm = bmesh.new(); bm.from_mesh(B.data); uvl = bm.loops.layers.uv.active
NSEG = 24; zs_ = np.linspace(Z_LOW, CHIN_N - 0.014, 5); rings = []
BK = lambda sn: 0.93 if sn < 0 else 0.80          # 脖子背面（+y）细一点，背面看不是一根宽柱子
for z_ in zs_:
    t = float(np.clip((z_ - Z_LOW) / (CHIN_N - Z_LOW), 0, 1)); r_ = R_BOT + (R_TOP - R_BOT) * t * t
    rings.append([bm.verts.new((NCX + r_ * np.cos(a_), NCY + BK(np.sin(a_)) * r_ * np.sin(a_), z_)) for a_ in np.linspace(0, 2 * np.pi, NSEG, endpoint=False)])
# 上端：每一列往上打一条线找发型头的底面（下巴、后脑勺底面高低不一样），最后两圈放到底面里面，稍微张开 → 脖子贴着头的形状融进去，不会从头外面露出一圈
up = [[], [], []]; HDB = bvh(HH)
for j, a_ in enumerate(np.linspace(0, 2 * np.pi, NSEG, endpoint=False)):
    x0, y0 = NCX + R_TOP * 1.1 * np.cos(a_), NCY + BK(np.sin(a_)) * R_TOP * 1.1 * np.sin(a_)
    hit = HDB.ray_cast(Vector((x0, y0, CHIN_N - 0.05)), Vector((0, 0, 1)), 0.2); zh = hit[0].z if hit[0] is not None else CHIN_N + 0.01
    for k, (dz, fl) in enumerate(((-0.004, 1.10), (0.004, 1.18), (0.02, 1.12))):     # 上端往外张开，贴着下颌底 / 后脑勺下沿过渡进头里
        up[k].append(bm.verts.new((NCX + R_TOP * fl * np.cos(a_), NCY + BK(np.sin(a_)) * R_TOP * fl * np.sin(a_), max(zh + dz, CHIN_N - 0.012 + dz))))
rings += up
for k in range(len(rings) - 1):
    for j in range(NSEG):
        f = bm.faces.new((rings[k][j], rings[k][(j + 1) % NSEG], rings[k + 1][(j + 1) % NSEG], rings[k + 1][j]))
        for lp in f.loops:
            co, idx, d = NECK_UV.find(lp.vert.co)
            if idx in _vuv: lp[uvl].uv = _vuv[idx]
bm.normal_update(); nfl = 0
tube = set(v for r_ in rings for v in r_)
for f in bm.faces:                                                         # 法线朝外（跟圆柱半径同向）
    if all(v in tube for v in f.verts):
        c = f.calc_center_median()
        if f.normal.dot(Vector((c.x - NCX, c.y - NCY, 0))) < 0: f.normal_flip(); nfl += 1
        f.smooth = True
bm.normal_update(); REP['neck']['flipped'] = nfl
REP['neck']['faces'] = NSEG * (len(rings) - 1)
bm.to_mesh(B.data); bm.free(); B.data.update()
for p_ in B.data.polygons: p_.use_smooth = True
if B.data.has_custom_normals:                                              # 导入时带的自定义法线清掉（新加的脖子没有，会变成一块平的颜色），按平滑重新算
    bpy.context.view_layer.objects.active = B; bpy.ops.mesh.customdata_custom_splitnormals_clear()
decimate(B, CFG.get('body_faces', 5000))
cb = B.data.color_attributes.new('COLOR_0', 'FLOAT_COLOR', 'POINT')
for i, v in enumerate(B.data.vertices):   # R：身体一律涂肤色（贴图不再带透明通道）；G：脖子越往上越在下巴的影子里（只压暗，法线、高光照常）
    t_ = 1.0; g_ = float(np.clip((v.co.z - (COLLAR_LOW - 0.005)) / max(0.01, CHIN_N - COLLAR_LOW), 0, 1)) if np.hypot(v.co.x - NCX, v.co.y - NCY) < 0.1 else 0.0; u_ = 1.0 if (v.co.z < HEM + 0.035 and abs(v.co.x) < 0.17) else 0.0   # B：腰、腿（衣服下面）涂暗，从缝里看到的不是白背心
    cb.data[i].color = (t_, g_, u_, 1)
# 鞋底遮罩（灰的、没颜色的 = 鞋底，不染）；上衣、裤子全染
for o in (SH, PN, SO):
    vc = vertcols(o, ccol); ca = o.data.color_attributes.new('COLOR_0', 'FLOAT_COLOR', 'POINT')
    for i in range(len(o.data.vertices)):
        t_ = 0.0 if (o is SO and (vc[i, 0] - vc[i, 2]) < 0.04) else 1.0; ed = o.get('edged'); eb = float(np.clip(1 - (ed[i] - 0.004) / 0.012, 0, 1)) if (ed is not None and i < len(ed)) else 0.0
        ca.data[i].color = (t_, 1.0 if i >= o.get('n_outer', 10 ** 9) else 0.0, eb, 1)
    l = vc.mean(1); o['ref'] = float(np.median(l[(vc[:, 0] - vc[:, 2]) >= (0.04 if o is SO else -9)]))   # 这件衣服的平均亮度：染色时 平均亮度 → 选的颜色

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
bpy.ops.object.select_all(action='DESELECT'); B.select_set(True); A.select_set(True); bpy.context.view_layer.objects.active = A
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
def transfer(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    for g in B.vertex_groups: o.vertex_groups.new(name=g.name)
    m = o.modifiers.new('dt', 'DATA_TRANSFER'); m.object = B; m.use_vert_data = True; m.data_types_verts = {'VGROUP_WEIGHTS'}; m.vert_mapping = 'POLYINTERP_NEAREST'; m.layers_vgroup_select_src = 'ALL'; m.layers_vgroup_select_dst = 'NAME'
    bpy.ops.object.modifier_apply(modifier='dt'); o.parent = A; am = o.modifiers.new('Armature', 'ARMATURE'); am.object = A
for o in (SH, PN): transfer(o)
def weld_weights(o):
    """同一个位置上拆开的顶点（贴图接缝）权重取平均，不然动起来接缝会裂开（跑步时裤腿前面一道缝）"""
    key = {}; gi_ = {g.index: g.name for g in o.vertex_groups}
    for v in o.data.vertices: key.setdefault(tuple(np.round(v.co[:], 4)), []).append(v)
    n_ = 0
    for vs in key.values():
        if len(vs) < 2: continue
        acc = {}
        for v in vs:
            for x in v.groups: acc[gi_[x.group]] = acc.get(gi_[x.group], 0) + x.weight / len(vs)
        for v in vs:
            for g, w in acc.items(): o.vertex_groups[g].add([v.index], w, 'REPLACE')
        n_ += 1
    return n_
LEG = ('LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot')     # 上衣只跟上半身走
gi = {g.index: g.name for g in SH.vertex_groups}
for v in SH.data.vertices:
    tot = sum(x.weight for x in v.groups if gi[x.group] not in LEG)
    if not any(gi[x.group] in LEG and x.weight > 0 for x in v.groups): continue
    for x in v.groups:
        if gi[x.group] in LEG: x.weight = 0.0
        elif tot > 1e-4: x.weight /= tot
    if tot < 1e-4: SH.vertex_groups['Hips'].add([v.index], 1.0, 'REPLACE')
# 裤腰、屁股那一圈只跟胯走，越往下越跟大腿走（不然跑步抬腿时裤腰前面被大腿往上扯，裤子撕到胸口，设计 18m）
def waist_fix(o, z_top=0.36, z_bot=0.19):
    gi_ = {g.index: g.name for g in o.vertex_groups}; hg = o.vertex_groups['Hips']; n_ = 0
    for v in o.data.vertices:
        f_ = float(np.clip((v.co.z - z_bot) / (z_top - z_bot), 0, 1)) ** 0.7
        if abs(v.co.x - NCX0) < 0.05: f_ = max(f_, 0.6 * float(np.clip((v.co.z - 0.12) / 0.1, 0, 1)))   # 两腿中间（裆）跟胯走多一点
        if f_ <= 0: continue
        moved_ = 0.0
        for x in v.groups:
            if gi_[x.group] in LEG: moved_ += x.weight * f_; x.weight *= 1 - f_
        if moved_ > 0: hg.add([v.index], moved_, 'ADD'); n_ += 1
    return n_
# 裤子只能跟胯和腿走（身体被裤子盖住的地方已经删了，最近的身体有时是手 → 裤腿外侧被手带着飞起来）
OKP = set(LEG) | {'Hips', 'Spine'}; gi_p = {g.index: g.name for g in PN.vertex_groups}; nbad = 0
for v in PN.data.vertices:
    bad = [x for x in v.groups if gi_p[x.group] not in OKP and x.weight > 0]
    if not bad: continue
    nbad += 1
    for x in bad: x.weight = 0.0
    tot = sum(x.weight for x in v.groups)
    if tot < 1e-3:
        side = 'Left' if v.co.x > NCX0 else 'Right'; f_ = float(np.clip((v.co.z - 0.12) / 0.1, 0, 1))
        PN.vertex_groups[side + ('UpLeg' if f_ > 0.3 else 'Leg')].add([v.index], 1.0, 'REPLACE')
    else:
        for x in v.groups: x.weight /= tot
REP['pants_bad_weights'] = nbad
# 上衣身子那一块（腋下以下、两手之间）不跟手臂走（最近的身体有时是手，跑步摆手时下摆被拽出去）
ARMS = {sd + n for sd in ('Left', 'Right') for n in ('Arm', 'ForeArm', 'Hand')}; gi_s = {g.index: g.name for g in SH.vertex_groups}; nsb = 0
for v in SH.data.vertices:
    if v.co.z > 0.50 or abs(v.co.x - NCX0) > 0.19: continue
    bad = [x for x in v.groups if gi_s[x.group] in ARMS and x.weight > 0]
    if not bad: continue
    nsb += 1
    for x in bad: x.weight = 0.0
    tot = sum(x.weight for x in v.groups)
    if tot < 1e-3: SH.vertex_groups['Spine'].add([v.index], 1.0, 'REPLACE')
    else:
        for x in v.groups: x.weight /= tot
REP['shirt_arm_weights_removed'] = nsb
REP['waist_fix_verts'] = {o.name: waist_fix(o) for o in (PN, B)}
REP['welded_weight_spots'] = {o.name: weld_weights(o) for o in (SH, PN, B)}
def rigid(o, bone_of):
    gs = {}
    for v in o.data.vertices:
        b = bone_of(v.co)
        if b not in gs: gs[b] = o.vertex_groups.new(name=b)
        gs[b].add([v.index], 1.0, 'REPLACE')
    o.parent = A; am = o.modifiers.new('Armature', 'ARMATURE'); am.object = A
rigid(HH, lambda c: 'Head'); rigid(SO, lambda c: 'LeftFoot' if c.x > 0 else 'RightFoot')

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
# 身体贴图：透明通道 = 皮肤（游戏里涂成标准头的肤色）
bp = pix(bcol); sk = ((bp[:, :, 0] - bp[:, :, 2]) > 0.12) & ((bp.max(2) - bp.min(2)) > 0.1)
save_img(bcol, OUT + '/body_tex.png', 1024)          # 不带透明通道（手机 Safari / 微信会把透明的地方颜色变黑）
# 发型头脸的肤色（中位数）——身体皮肤用这个颜色
fp = hp[::8, ::8].reshape(-1, 3); fm = ((fp.max(1) - fp.min(1)) > 0.2) & (fp.mean(1) > 0.5) & (fp[:, 0] > fp[:, 2] + 0.15)
skc = (CHEEK * 0.92) if CHEEK is not None else np.median(fp[fm], 0)   # 脸颊贴图里带了烘焙的亮光，身体再乘 0.92 跟头亮度一致
REP['skin_hex'] = '#%02x%02x%02x' % tuple(int(round(min(1, x) * 255)) for x in skc); B['skin'] = REP['skin_hex']
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
for i in range(len(HH.data.vertices)): t_ = vh.get(i, 0.0); ch_.data[i].color = (t_, t_, t_, 1)
REP['hair_vert_pct'] = round(float(np.mean([vh.get(i, 0) for i in range(len(HH.data.vertices))])), 3)
TEX = {'Body': (OUT + '/body_tex.png', bnrm, 1024), 'HairHead': (OUT + '/hairhead_tex.png', hhnrm, 1024), 'Cloth': (OUT + '/cloth_tex.png', cnrm, 1024)}
REP['tex_cloth'] = texfix(ccol, OUT + '/cloth_tex.png', 1024, [SH, PN, SO], fill_objs=[SH, PN])
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
cm = mat('ClothMat', 'Cloth', True)
for o, m in ((B, mat('BodyMat', 'Body', True)), (HH, mat('HairHeadMat', 'HairHead', True)), (SH, cm), (PN, cm), (SO, cm)):
    o.data.materials.clear(); o.data.materials.append(m)
REP['faces'] = {o.name: len(o.data.polygons) for o in (B, HH, SH, PN, SO)}
bpy.ops.wm.save_as_mainfile(filepath=OUT + '/hero.blend')
bpy.ops.object.select_all(action='DESELECT')
for o in (A, B, HH, SH, PN, SO): o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT + '/hero_m2.glb', use_selection=True, export_format='GLB', export_image_format='AUTO', export_animations=True, export_animation_mode='ACTIONS',
    export_skins=True, export_morph=False, export_def_bones=False, export_yup=True, export_vertex_color='ACTIVE', export_extras=True)
REP['size_kb'] = os.path.getsize(OUT + '/hero_m2.glb') // 1024
json.dump(REP, open(OUT + '/report.json', 'w'), ensure_ascii=False, indent=1)
log('REPORT', json.dumps(REP, ensure_ascii=False))
os._exit(0)
