"""设计 107：铁匠——减面（5 万 → 约 5000 面）、贴图 1024、绑 19 根骨（体素代理自动权重，跟落石巨人一样做法）。
用法：python3 -c "import bpy; exec(open('tools/smith_rig/rigbuild.py').read())"  （SRC=原模型 OUT=.blend）"""
import bpy, os, sys
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(os.environ.get('RIGDIR', 'tools/smith_rig/x'))))
from joints import J, PAR
SRC = os.environ.get('SRC', '美术/模型/铁匠/铁匠.glb'); OUT = os.environ.get('OUT', '/tmp/smith_rigged.blend')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
B = [x for x in bpy.context.scene.objects if x.type == 'MESH'][0]; B.name = 'Smith'
bpy.context.view_layer.objects.active = B; B.select_set(True); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
mat = B.data.materials[0]; nt = mat.node_tree; bsdf = [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'][0]
for inp in ['Normal', 'Metallic', 'Roughness']:
    for l in list(bsdf.inputs[inp].links): nt.links.remove(l)
bsdf.inputs['Metallic'].default_value = 0; bsdf.inputs['Roughness'].default_value = 0.8
for n in list(nt.nodes):
    if n.type == 'TEX_IMAGE' and not any(l.to_socket == bsdf.inputs['Base Color'] for l in n.outputs[0].links): nt.nodes.remove(n)
    elif n.type in ('NORMAL_MAP', 'SEPARATE_COLOR', 'SEPARATE_RGB'): nt.nodes.remove(n)
for im in bpy.data.images:
    if im.users and im.size[0] > 1024: im.scale(1024, 1024)
m = B.modifiers.new('d', 'DECIMATE'); m.ratio = float(os.environ.get('RATIO', '0.1')); bpy.ops.object.modifier_apply(modifier='d')
B.data.calc_loop_triangles(); print('tris', len(B.data.loop_triangles))
arm = bpy.data.armatures.new('Rig'); A = bpy.data.objects.new('Rig', arm); bpy.context.collection.objects.link(A)
bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = A; A.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for n, (h, t) in J.items():
    b = arm.edit_bones.new(n); b.head = Vector(h); b.tail = Vector(t)
    b.align_roll(Vector((0, -1, 0)) if abs((Vector(t) - Vector(h)).normalized().y) < 0.9 else Vector((0, 0, 1)))
for n, p in PAR.items():
    eb = arm.edit_bones[n]; eb.parent = arm.edit_bones[p]; eb.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
P = B.copy(); P.data = B.data.copy(); bpy.context.collection.objects.link(P); P.name = 'Proxy'
P.modifiers.clear(); r = P.modifiers.new('r', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = 0.008
bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = P; P.select_set(True); bpy.ops.object.modifier_apply(modifier='r')
bpy.ops.object.select_all(action='DESELECT'); P.select_set(True); A.select_set(True); bpy.context.view_layer.objects.active = A
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
print('proxy groups', len(P.vertex_groups))
for g in P.vertex_groups: B.vertex_groups.new(name=g.name)
dt = B.modifiers.new('dt', 'DATA_TRANSFER'); dt.object = P; dt.use_vert_data = True; dt.data_types_verts = {'VGROUP_WEIGHTS'}; dt.vert_mapping = 'POLYINTERP_NEAREST'
dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = B; B.select_set(True); bpy.ops.object.modifier_apply(modifier='dt')
bpy.data.objects.remove(P)
G = {g.name: g for g in B.vertex_groups}
for n in J:
    if n not in G: G[n] = B.vertex_groups.new(name=n)
segs = {n: (Vector(h), Vector(t)) for n, (h, t) in J.items()}
def dseg(p, a, b):
    ab = b - a; u = max(0, min(1, (p - a).dot(ab) / ab.length_squared)); return (p - (a + ab * u)).length
idx = {g.index: g.name for g in B.vertex_groups}; nfix = 0
for v in B.data.vertices:
    gs = [(idx[g.group], g.weight) for g in v.groups if g.weight > 0.01]; tot = sum(w for _, w in gs)
    dav = sum(w * dseg(v.co, *segs[n]) for n, w in gs if n in segs) / tot if tot > 0.3 else 9
    near = sorted((dseg(v.co, a, b), n) for n, (a, b) in segs.items())
    if dav > near[0][0] + 0.05:
        for g in v.groups: g.weight = 0
        d0, n0 = near[0]; d1, n1 = near[1]; w0 = 1 / (d0 + 1e-3) ** 2; w1 = 1 / (d1 + 1e-3) ** 2
        G[n0].add([v.index], w0 / (w0 + w1), 'REPLACE'); G[n1].add([v.index], w1 / (w0 + w1), 'REPLACE'); nfix += 1
print('fixed', nfix)
bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = B; B.select_set(True)
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
md = B.modifiers.new('Armature', 'ARMATURE'); md.object = A; B.parent = A
bpy.ops.wm.save_as_mainfile(filepath=OUT); print('saved', OUT)
