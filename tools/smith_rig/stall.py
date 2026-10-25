"""设计 107：铁匠摊——减面（5 万 → 约 4000 面）、贴图 1024，只留颜色贴图；土地底边缘压暗（顶点色不用，直接把贴图里很黄绿的颜色压暗一点）。SRC= OUT="""
import bpy, os
SRC = os.environ.get('SRC', '美术/模型/铁匠/铁匠摊.glb'); OUT = os.environ.get('OUT', '/tmp/smith_stall.glb')
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=SRC)
B = [x for x in bpy.context.scene.objects if x.type == 'MESH'][0]; B.name = 'SmithStall'
bpy.context.view_layer.objects.active = B; B.select_set(True); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
mat = B.data.materials[0]; nt = mat.node_tree; bsdf = [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'][0]
for inp in ['Normal', 'Metallic', 'Roughness']:
    for l in list(bsdf.inputs[inp].links): nt.links.remove(l)
bsdf.inputs['Metallic'].default_value = 0; bsdf.inputs['Roughness'].default_value = 0.85
for n in list(nt.nodes):
    if n.type == 'TEX_IMAGE' and not any(l.to_socket == bsdf.inputs['Base Color'] for l in n.outputs[0].links): nt.nodes.remove(n)
    elif n.type in ('NORMAL_MAP', 'SEPARATE_COLOR', 'SEPARATE_RGB'): nt.nodes.remove(n)
import numpy as np
for im in bpy.data.images:
    if im.users and im.size[0] > 1024: im.scale(1024, 1024)
    if im.users:   # 很黄绿的像素（地皮边缘）压暗、偏土色，跟院子地面不突兀
        px = np.array(im.pixels[:]).reshape(-1, 4); r, g, b = px[:, 0], px[:, 1], px[:, 2]
        m = (g > b * 1.6) & (r > b * 1.4) & (g > 0.35)
        px[m, 0] *= 0.62; px[m, 1] *= 0.55; px[m, 2] *= 0.6; im.pixels[:] = px.ravel(); im.pack()
m = B.modifiers.new('d', 'DECIMATE'); m.ratio = float(os.environ.get('RATIO', '0.08')); bpy.ops.object.modifier_apply(modifier='d')
B.data.calc_loop_triangles(); print('tris', len(B.data.loop_triangles))
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=82, export_apply=True); print('done', OUT)
