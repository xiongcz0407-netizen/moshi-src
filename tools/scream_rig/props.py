"""设计 114B：楼顶建筑 / 掩体拆开、减面、原点放底部中心，导出成游戏用的几个 GLB（压缩另跑 tools/glbpress.mjs）。
用法：python3 tools/scream_rig/props.py 楼顶建筑.glb 掩体_4个.glb 输出文件夹
- 楼顶建筑.glb → tower_house.glb（带信号塔那栋）、stair_house.glb（带楼梯的入口小屋，门朝 -Y）、
  speaker.glb（立杆喇叭：节点 speaker 下面 pole + horn，horn 原点在跟杆子接的地方，打坏时开发1 转 horn 让它歪下来）
- 掩体_4个.glb → covers.glb，4 个节点 ac / pipe / tank / box，各自底部贴地、原点在底部中心
模型单位保持原样（不缩放），坐标 Z 朝上、-Y 朝前；导出 glTF 时转成 Y 朝上。"""
import bpy, sys
from mathutils import Vector, Matrix
BLD, COV, OUTDIR = sys.argv[-3], sys.argv[-2], sys.argv[-1]

# 每块：名字、按零件中心分到哪块的规则、减到多少面、贴图边长
def bld_rule(c):
    if abs(c.x - 0.005) < 0.075 and c.z > 0.64: return 'horn'          # 立杆喇叭的头（圆口喇叭）
    if abs(c.x - 0.01) < 0.035 and c.z > 0.2 and c.y < 0.06: return 'pole'   # 杆子 + 缠在杆上的电线
    if c.x > 0.1: return 'stair_house'
    return 'tower_house'
def cov_rule(c):
    if c.z > 0.45: return 'ac' if c.x < 0.02 else 'pipe'
    return 'tank' if c.x < 0.02 else 'box'
FACES = {'tower_house': 9000, 'stair_house': 6000, 'pole': 500, 'horn': 900, 'ac': 1600, 'pipe': 1400, 'tank': 1800, 'box': 1400}


def load(src, tex):
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=src)
    o = [x for x in bpy.context.scene.objects if x.type == 'MESH'][0]
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = o; o.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    mat = o.data.materials[0]; nt = mat.node_tree; bsdf = [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'][0]
    for inp in ['Normal', 'Metallic', 'Roughness']:
        for l in list(bsdf.inputs[inp].links): nt.links.remove(l)
    bsdf.inputs['Metallic'].default_value = 0; bsdf.inputs['Roughness'].default_value = 0.85
    for n in list(nt.nodes):
        if n.type == 'TEX_IMAGE' and not any(l.to_socket == bsdf.inputs['Base Color'] for l in n.outputs[0].links): nt.nodes.remove(n)
        elif n.type in ('NORMAL_MAP', 'SEPARATE_COLOR', 'SEPARATE_RGB'): nt.nodes.remove(n)
    for im in bpy.data.images:
        if im.users and im.size[0] > tex: im.scale(tex, tex)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
    return [x for x in bpy.context.scene.objects if x.type == 'MESH']


def group(parts, rule):
    g = {}
    for p in parts:
        v = [p.matrix_world @ Vector(c) for c in p.bound_box]; c = sum(v, Vector()) / 8
        g.setdefault(rule(c), []).append(p)
    out = {}
    for nm, ps in g.items():
        bpy.ops.object.select_all(action='DESELECT')
        for p in ps: p.select_set(True)
        bpy.context.view_layer.objects.active = ps[0]
        if len(ps) > 1: bpy.ops.object.join()
        ob = bpy.context.view_layer.objects.active; ob.name = nm; ob.data.name = nm
        n0 = len(ob.data.polygons)
        if n0 > FACES[nm]:
            m = ob.modifiers.new('d', 'DECIMATE'); m.ratio = FACES[nm] / n0; bpy.ops.object.modifier_apply(modifier='d')
        out[nm] = ob
    return out


def bbox(ob):
    v = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    return Vector([min(q[i] for q in v) for i in range(3)]), Vector([max(q[i] for q in v) for i in range(3)])


def pivot(ob, piv):
    ob.data.transform(Matrix.Translation(-piv)); ob.location = (0, 0, 0)


def export(obs, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs:
        o.select_set(True)
        for c in o.children_recursive: c.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_image_format='JPEG', export_jpeg_quality=86)
    print('saved', path)


def report(nm, ob):
    mn, mx = bbox(ob); print('part', nm, 'size', [round(mx[i] - mn[i], 3) for i in range(3)], 'faces', len(ob.data.polygons))


# ---- 楼顶建筑 ----
g = group(load(BLD, 1024), bld_rule)
for nm in ('tower_house', 'stair_house'):
    ob = g[nm]; mn, mx = bbox(ob); pivot(ob, Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))); report(nm, ob)
    for o in list(bpy.context.scene.objects):
        o.select_set(o == ob)
    export([ob], f'{OUTDIR}/{nm}.glb')
pole, horn = g['pole'], g['horn']
pmn, pmx = bbox(pole); hmn, hmx = bbox(horn)
base = Vector(((pmn.x + pmx.x) / 2, (pmn.y + pmx.y) / 2, pmn.z))
joint = Vector(((pmn.x + pmx.x) / 2, (pmn.y + pmx.y) / 2, hmn.z + 0.012))   # 喇叭头跟杆子接的地方
pivot(pole, base); pivot(horn, joint)
root = bpy.data.objects.new('speaker', None); bpy.context.collection.objects.link(root)
pole.parent = root; horn.parent = root; horn.location = joint - base
report('pole', pole); report('horn', horn); print('horn joint height', round((joint - base).z, 3))
export([root], f'{OUTDIR}/speaker.glb')

# ---- 掩体 ----
g = group(load(COV, 1024), cov_rule)
for nm, ob in g.items():
    mn, mx = bbox(ob); pivot(ob, Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))); report(nm, ob)
export([g[n] for n in ('ac', 'pipe', 'tank', 'box')], f'{OUTDIR}/covers.glb')
