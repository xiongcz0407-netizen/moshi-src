import bpy,bmesh,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
def imp(path,name):
    before=set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path)
    o=[x for x in bpy.data.objects if x not in before and x.type=='MESH'][0]
    for x in [x for x in bpy.data.objects if x not in before and x is not o]: bpy.data.objects.remove(x)
    o.name=name; o.data.name=name; o.parent=None
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bm=bmesh.new(); bm.from_mesh(o.data); bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=1e-5); bm.to_mesh(o.data); bm.free()
    img=None
    for n in o.data.materials[0].node_tree.nodes:
        if n.type=='TEX_IMAGE' and n.image and 'normal' not in n.image.name and 'metal' not in n.image.name: img=n.image
    if img: img.name=name+'_tex'
    return o,img
def V(o): return np.array([v.co[:] for v in o.data.vertices])
def setV(o,a):
    for v,c in zip(o.data.vertices,a): v.co=Vector(c)
    o.data.update()
def facecols(o,img):
    W,H=img.size; px=np.array(img.pixels[:]).reshape(H,W,4)[:,:,:3]
    uv=o.data.uv_layers.active.data; out=[]
    for p in o.data.polygons:
        u=np.mean([uv[i].uv[:] for i in p.loop_indices],0); out.append(px[min(H-1,max(0,int(u[1]*H))),min(W-1,max(0,int(u[0]*W)))])
    return np.array(out)
def delete_faces(o,mask):
    bm=bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[bm.faces[i] for i in np.nonzero(mask)[0]],context='FACES')
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS'); bm.to_mesh(o.data); bm.free(); o.data.update()
def drop_small(o,minfrac):
    bm=bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table(); seen=set(); groups=[]
    for f in bm.faces:
        if f.index in seen: continue
        st=[f]; g=[]; seen.add(f.index)
        while st:
            x=st.pop(); g.append(x)
            for e in x.edges:
                for y in e.link_faces:
                    if y.index not in seen: seen.add(y.index); st.append(y)
        groups.append(g)
    tot=sum(len(g) for g in groups); kill=[f for g in groups if len(g)<tot*minfrac for f in g]
    bmesh.ops.delete(bm,geom=kill,context='FACES'); bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS'); bm.to_mesh(o.data); bm.free(); return len(groups)
def decimate(o,target):
    r=min(1,target/max(1,len(o.data.polygons))); m=o.modifiers.new('dec','DECIMATE'); m.ratio=r; m.use_collapse_triangulate=True
    bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier='dec')
def bvh_of(o): return BVHTree.FromObject(o,bpy.context.evaluated_depsgraph_get())
def remove_inner(o):
    # delete faces not visible from outside along their normal (inner layer of cloth shells)
    bm=bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table(); bm.normal_update(); B=BVHTree.FromBMesh(bm); kill=[]
    for f in bm.faces:
        c=f.calc_center_median(); n=f.normal; vis=False
        for t in ((0,0,0),(0.35,0,0),(-0.35,0,0),(0,0.35,0),(0,-0.35,0),(0,0,0.35),(0,0,-0.35)):
            d=(n+Vector(t)).normalized()
            if d.dot(n)<0.5: continue
            h=B.ray_cast(c+d*2.0,-d,2.5)
            if h[0] is not None and (h[2]==f.index or (h[0]-c).length<0.002): vis=True; break
        if not vis: kill.append(f)
    bmesh.ops.delete(bm,geom=kill,context='FACES'); bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS'); bm.to_mesh(o.data); bm.free(); return len(kill)
def fitgap(bvh,arr,gmin,gmax=9.0):
    out=arr.copy(); n=0
    for i,p in enumerate(arr):
        loc,nor,idx,d=bvh.find_nearest(Vector(p))
        if loc is None: continue
        dv=Vector(p)-loc; s=dv.dot(nor)
        if s<gmin: out[i]=loc+nor*gmin; n+=1
        elif d>gmax: out[i]=loc+dv.normalized()*gmax
    return out,n
