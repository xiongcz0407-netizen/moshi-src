import bpy, sys, bmesh
from mathutils import Vector
SRC, OUT, RATIO = sys.argv[-3], sys.argv[-2], float(sys.argv[-1])
RULES = {
 '吊机和大门': [('crane', lambda c: c.z > 0.38), ('gate_post_l', lambda c: c.x < -0.285), ('gate_door_l', lambda c: c.x < -0.088), ('gate_door_r', lambda c: c.x < 0.095 and c.z > 0.004), ('gate_post_r', lambda c: c.x < 0.24), ('sign', lambda c: True)],
 '掩体_4个': [('cover_frame', lambda c: c.z > 0.19), ('cover_blocks', lambda c: c.x < -0.12), ('cover_barrels', lambda c: c.y < -0.2), ('cover_cart', lambda c: c.y > 0.25), (None, lambda c: True)],
 '石头_6块': [('rubble_1', lambda c: c.y < -0.3 and c.x < -0.03), ('rubble_2', lambda c: c.y < -0.3 and c.x < 0.19), ('rubble_3', lambda c: c.y < -0.3), ('boulder', lambda c: c.x < -0.09), ('fallen', lambda c: c.x < 0.175), ('pillar', lambda c: True)],
}
name = SRC.split('/')[-1][:-4]; rules = RULES[name]
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=SRC)
o = [x for x in bpy.context.scene.objects if x.type == 'MESH'][0]; bpy.context.view_layer.objects.active = o; o.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
mat = o.data.materials[0]; nt = mat.node_tree; bsdf = [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'][0]
for inp in ['Normal', 'Metallic', 'Roughness']:
    for l in list(bsdf.inputs[inp].links): nt.links.remove(l)
bsdf.inputs['Metallic'].default_value = 0; bsdf.inputs['Roughness'].default_value = 0.85
for n in list(nt.nodes):
    if n.type == 'TEX_IMAGE' and not any(l.to_socket == bsdf.inputs['Base Color'] for l in n.outputs[0].links): nt.nodes.remove(n)
    elif n.type in ('NORMAL_MAP', 'SEPARATE_COLOR', 'SEPARATE_RGB'): nt.nodes.remove(n)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
groups = {}
for p in [x for x in bpy.context.scene.objects if x.type == 'MESH']:
    v = [p.matrix_world @ Vector(c) for c in p.bound_box]; c = sum(v, Vector()) / 8
    for nm, f in rules:
        if f(c): break
    if nm is None: bpy.data.objects.remove(p); continue
    groups.setdefault(nm, []).append(p)
for nm, ps in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for p in ps: p.select_set(True)
    bpy.context.view_layer.objects.active = ps[0]
    if len(ps) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; ob.name = nm
    m = ob.modifiers.new('d', 'DECIMATE'); m.ratio = RATIO; bpy.ops.object.modifier_apply(modifier='d')
    v = [Vector(c) for c in ob.bound_box]; mn = Vector([min(q[i] for q in v) for i in range(3)]); mx = Vector([max(q[i] for q in v) for i in range(3)])
    piv = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    ob.data.transform(__import__('mathutils').Matrix.Translation(-piv)); ob.location = (0, 0, 0)
    print('part', nm, 'size', [round(mx[i] - mn[i], 3) for i in range(3)], 'faces', len(ob.data.polygons))
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True)
print('saved', OUT)
