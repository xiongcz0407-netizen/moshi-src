import bpy, bmesh, numpy as np, math, sys
from mathutils import Vector, Matrix, Quaternion, Euler
from mathutils.bvhtree import BVHTree
STAGE = sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'all'
bpy.ops.wm.read_factory_settings(use_empty=True)
def imp(f, name):
    before=set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=f'/tmp/ch/{f}.glb')
    o=[o for o in bpy.data.objects if o not in before and o.type=='MESH'][0]
    for x in [x for x in bpy.data.objects if x not in before and x is not o]:
        bpy.data.objects.remove(x)
    o.name=name; o.data.name=name
    # apply transform
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o
    o.parent=None; bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    mat=o.data.materials[0]; img=None
    for n in mat.node_tree.nodes:
        if n.type=='TEX_IMAGE' and n.image and 'normal' not in n.image.name and 'metal' not in n.image.name: img=n.image
    img.name=name+'_tex'
    bm=bmesh.new(); bm.from_mesh(o.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bm.to_mesh(o.data); bm.free()
    return o,img
def facecols(o,img):
    W,H=img.size; px=np.array(img.pixels[:]).reshape(H,W,4)[:,:,:3]
    me=o.data; uv=me.uv_layers.active.data; out=[]
    for p in me.polygons:
        u=np.mean([uv[i].uv[:] for i in p.loop_indices],0)
        out.append(px[min(H-1,max(0,int(u[1]*H))),min(W-1,max(0,int(u[0]*W)))])
    return np.array(out)
def delete_faces(o, mask):
    bm=bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i in np.nonzero(mask)[0]], context='FACES')
    # loose verts
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(o.data); bm.free(); o.data.update()
def keep_largest(o, minfrac=0.02):
    bm=bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
    seen=set(); groups=[]
    for f in bm.faces:
        if f.index in seen: continue
        st=[f]; g=[]; seen.add(f.index)
        while st:
            x=st.pop(); g.append(x)
            for e in x.edges:
                for y in e.link_faces:
                    if y.index not in seen: seen.add(y.index); st.append(y)
        groups.append(g)
    tot=sum(len(g) for g in groups)
    kill=[f for g in groups if len(g)<tot*minfrac for f in g]
    bmesh.ops.delete(bm, geom=kill, context='FACES'); bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(o.data); bm.free(); return len(groups)
def decimate(o, target):
    r=min(1,target/len(o.data.polygons)); m=o.modifiers.new('dec','DECIMATE'); m.ratio=r; m.use_collapse_triangulate=True
    bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier='dec')
def verts(o): return np.array([v.co[:] for v in o.data.vertices])
def setverts(o,a):
    for v,c in zip(o.data.vertices,a): v.co=Vector(c)
    o.data.update()

body,bimg=imp('body','Body'); shirt,simg=imp('shirt','Shirt'); hair,himg=imp('hair','Hair')
print('loaded', len(body.data.polygons), len(shirt.data.polygons), len(hair.data.polygons))
# ---------- shirt: remove neck (skin) + pants (dark) ----------
c=facecols(shirt,simg); z=np.array([p.center.z for p in shirt.data.polygons])
lum=c.mean(1); sat=c.max(1)-c.min(1)
kill=((lum<0.3)&(sat<0.07)&(z<0.25)) | (((c[:,0]-c[:,2])>0.26)&(z>0.8))
delete_faces(shirt,kill); print('shirt groups',keep_largest(shirt), len(shirt.data.polygons))
# ---------- hair: remove mannequin ----------
c=facecols(hair,himg); lum=c.mean(1)
mann_v=None
hv=verts(hair); 
# mannequin skull top / size measured from mannequin faces
mf=np.array([p.center[:] for p,l in zip(hair.data.polygons,lum) if l>=0.33])
zc=np.array([p.center.z for p in hair.data.polygons]); delete_faces(hair, (lum>=0.33)|(zc<0.36)); print('hair groups',keep_largest(hair,0.005), len(hair.data.polygons))
np.save('/tmp/ch/out/mann.npy', mf)
# shirt: initial placement on body + remove inner layer (full res, normals consistent)
from mathutils.bvhtree import BVHTree
sz=(0.915-0.50)/(0.962-0.044); sx=0.54; sy=0.52
for v in shirt.data.vertices:
    x,y,z=v.co; v.co=Vector((x*sx,(y+0.013)*sy-0.02,0.50+(z-0.044)*sz))
shirt.data.update()
bm=bmesh.new(); bm.from_mesh(shirt.data); bm.faces.ensure_lookup_table(); bm.normal_update()
bvhS=BVHTree.FromBMesh(bm); kill=[]
for f in bm.faces:
    c=f.calc_center_median(); n=f.normal; vis=False
    for t in (Vector((0,0,0)),Vector((0.35,0,0)),Vector((-0.35,0,0)),Vector((0,0.35,0)),Vector((0,-0.35,0)),Vector((0,0,0.35)),Vector((0,0,-0.35))):
        d=(n+t).normalized()
        if d.dot(n)<0.5: continue
        o=c+d*2.0; hit=bvhS.ray_cast(o,-d,2.5)
        if hit[0] is not None and (hit[2]==f.index or (hit[0]-c).length<0.002): vis=True; break
    if not vis: kill.append(f)
print('inner',len(kill),'of',len(bm.faces))
bmesh.ops.delete(bm,geom=kill,context='FACES'); bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
bm.to_mesh(shirt.data); bm.free(); print('shirt groups after inner',keep_largest(shirt,0.01), len(shirt.data.polygons))
decimate(shirt,3000); decimate(hair,3000); decimate(body,7500)
print('dec',len(body.data.polygons),len(shirt.data.polygons),len(hair.data.polygons))
bpy.ops.wm.save_as_mainfile(filepath='/tmp/ch/out/stage1.blend')
