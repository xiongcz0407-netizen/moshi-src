import bpy,bmesh,numpy as np
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='/tmp/c2/cloth.glb')
o=[o for o in bpy.data.objects if o.type=='MESH'][0]
bpy.context.view_layer.objects.active=o; o.select_set(True); o.parent=None
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
bm=bmesh.new(); bm.from_mesh(o.data); bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=1e-5); bm.to_mesh(o.data); bm.free()
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
parts=[x for x in bpy.data.objects if x.type=='MESH']
print('parts',len(parts))
groups={'shirt':[],'pants':[],'socks':[],'shoes':[]}
for p in parts:
    v=np.array([x.co[:] for x in p.data.vertices]); c=v.mean(0); n=len(p.data.polygons)
    if n<300: groups.setdefault('junk',[]).append(p); continue
    k=('shirt' if c[0]<-0.08 else 'pants') if c[2]>0.28 else ('socks' if c[0]<-0.08 else 'shoes')
    groups[k].append(p)
for k,ps in groups.items():
    print(k,[len(p.data.polygons) for p in ps])
    if k=='junk':
        for p in ps: bpy.data.objects.remove(p)
        continue
    bpy.ops.object.select_all(action='DESELECT')
    for p in ps: p.select_set(True)
    bpy.context.view_layer.objects.active=ps[0]; bpy.ops.object.join(); ps[0].name=k
    v=np.array([x.co[:] for x in ps[0].data.vertices]); print(' ',k,v.min(0).round(3),v.max(0).round(3))
bpy.ops.wm.save_as_mainfile(filepath='/tmp/c2/out/cloth_split.blend')
