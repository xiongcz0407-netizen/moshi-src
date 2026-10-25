"""设计 116B：实验室建筑 / 掩体 / 能量柱拆开、减面、原点放底部中心；从 BOSS 装甲上复制 3 块装甲板。导出 GLB（压缩另跑 tools/glbpress.mjs）。
用法：python3 tools/tyrant_rig/props.py 素材文件夹 输出文件夹
- 实验室建筑.glb → door.glb（炸开的防爆门带框）、tank.glb（碎大培养舱 + 管线底座 + 地上一滩培养液 + 碎玻璃）、console.glb（控制台）
- 掩体_4个.glb → covers.glb：节点 cart / ammo / base / cabinet
- 能量柱.glb → pylon.glb：节点 pylon（柱子，原点在底部中心）、socket（地面插座，贴地）；里面的 Q 版小士兵删掉
- BOSS_装甲暴君.glb → plates.glb：节点 plate1 / plate2 / plate3（从装甲上复制的 3 块板）
模型单位保持原样（不缩放），坐标 Z 朝上、-Y 朝前；导出 glTF 时转成 Y 朝上（-Y 前 → glTF +Z）。"""
import bpy, sys
from mathutils import Vector, Matrix
SRC, OUTDIR = sys.argv[-2], sys.argv[-1]


def bld_rule(c):
    if c.y < -0.3: return 'console'
    if c.y > 0.22: return 'door'
    return 'tank'
COV = {'cart': (-0.17, -0.42), 'base': (-0.45, -0.12), 'ammo': (0.32, 0.07), 'cabinet': (0.07, 0.40)}   # 4 个掩体在原图里的大致中心（俯视）
def cov_rule(c):
    return min(COV, key=lambda k: (c.x - COV[k][0]) ** 2 + (c.y - COV[k][1]) ** 2)
def pyl_rule(c):
    if c.x < -0.05: return 'pylon'
    if c.z < 0.045: return 'socket'
    return None          # Q 版小士兵：删掉
PLATES = {'plate1': Vector((0.015, 0.093, 0.678)), 'plate2': Vector((0.246, 0.009, 0.812)), 'plate3': Vector((0.283, 0.034, 0.673))}   # 背甲、肩甲、臂甲（有厚度的几块）
FACES = {'door': 4500, 'tank': 5000, 'console': 1800, 'cart': 1400, 'ammo': 1400, 'base': 1400, 'cabinet': 1400,
         'pylon': 2400, 'socket': 700, 'plate1': 500, 'plate2': 500, 'plate3': 500}


def load(src, tex=1024):
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=src)
    o = [x for x in bpy.context.scene.objects if x.type == 'MESH'][0]
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = o; o.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    mat = o.data.materials[0]; nt = mat.node_tree; bsdf = [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'][0]
    for inp in ['Normal', 'Metallic', 'Roughness']:
        for l in list(bsdf.inputs[inp].links): nt.links.remove(l)
    bsdf.inputs['Metallic'].default_value = 0; bsdf.inputs['Roughness'].default_value = 0.8
    for n in list(nt.nodes):
        if n.type == 'TEX_IMAGE' and not any(l.to_socket == bsdf.inputs['Base Color'] for l in n.outputs[0].links): nt.nodes.remove(n)
        elif n.type in ('NORMAL_MAP', 'SEPARATE_COLOR', 'SEPARATE_RGB'): nt.nodes.remove(n)
    for im in bpy.data.images:
        if im.users and im.size[0] > tex: im.scale(tex, tex)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
    return [x for x in bpy.context.scene.objects if x.type == 'MESH']


def center(p):
    v = [p.matrix_world @ Vector(c) for c in p.bound_box]; return sum(v, Vector()) / 8


def bbox(ob):
    v = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    return Vector([min(q[i] for q in v) for i in range(3)]), Vector([max(q[i] for q in v) for i in range(3)])


def join(nm, ps):
    bpy.ops.object.select_all(action='DESELECT')
    for p in ps: p.select_set(True)
    bpy.context.view_layer.objects.active = ps[0]
    if len(ps) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; ob.name = nm; ob.data.name = nm
    n0 = len(ob.data.polygons)
    if n0 > FACES[nm]:
        m = ob.modifiers.new('d', 'DECIMATE'); m.ratio = FACES[nm] / n0; bpy.ops.object.modifier_apply(modifier='d')
    mn, mx = bbox(ob); ob.data.transform(Matrix.Translation(-Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z)))); ob.location = (0, 0, 0)
    mn, mx = bbox(ob); print('part', nm, 'size', [round(mx[i] - mn[i], 3) for i in range(3)], 'faces', len(ob.data.polygons))
    return ob


def group(parts, rule):
    g = {}
    for p in parts:
        nm = rule(center(p))
        if nm is None: bpy.data.objects.remove(p); continue
        g.setdefault(nm, []).append(p)
    return {nm: join(nm, ps) for nm, ps in g.items()}


def export(obs, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_image_format='JPEG', export_jpeg_quality=86)
    print('saved', path)


g = group(load(f'{SRC}/实验室建筑.glb'), bld_rule)
for nm in ('door', 'tank', 'console'): export([g[nm]], f'{OUTDIR}/{nm}.glb')
g = group(load(f'{SRC}/掩体_4个.glb'), cov_rule)
export([g[n] for n in ('cart', 'ammo', 'base', 'cabinet')], f'{OUTDIR}/covers.glb')
g = group(load(f'{SRC}/能量柱.glb'), pyl_rule)
export([g['pylon'], g['socket']], f'{OUTDIR}/pylon.glb')
parts = load(f'{SRC}/BOSS_装甲暴君.glb')
pick = {}
for nm, c in PLATES.items():
    best = min(parts, key=lambda p: (center(p) - c).length); pick[nm] = best; parts.remove(best)
for p in parts: bpy.data.objects.remove(p)
obs = []
for nm, p in pick.items():
    ob = join(nm, [p])   # 原模型的装甲是一层皮：加厚一点，单独落地时两面都看得到
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    m = ob.modifiers.new('s', 'SOLIDIFY'); m.thickness = 0.012; m.offset = 1; bpy.ops.object.modifier_apply(modifier='s'); obs.append(ob)
export(obs, f'{OUTDIR}/plates.glb')
