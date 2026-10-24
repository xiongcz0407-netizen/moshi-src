import sys; sys.path.insert(0,'/tmp/c2')
from common import *
bpy.ops.wm.read_factory_settings(use_empty=True)
B,bimg=imp('/tmp/c2/body.glb','Body'); Hh,himg=imp('/tmp/c2/hair.glb','Hair')
bvh=bvh_of(B)
# ---- hair transform ----
P=V(Hh); c=facecols(Hh,himg)
sx,sy,sz=0.80,0.80,0.62; top=1.22
Q=P.copy(); Q[:,0]=P[:,0]*sx; Q[:,1]=(P[:,1]-0.012)*sy+0.03; Q[:,2]=top+(P[:,2]-1.102)*sz
# bangs: front part (y<-0.05 in result) can't go below z_cut; squeeze range [lo, z_cut+...]
front=np.clip((-Q[:,1]-0.02)/0.08,0,1)  # 0 at back, 1 at front
zc=0.95; low=0.80
w=front*np.clip((zc+0.06-Q[:,2])/0.10,0,1)
Q[:,2]=Q[:,2]+w*(zc+ (Q[:,2]-low)*0.35 - Q[:,2]).clip(0)
setV(Hh,Q)
# ---- remove mannequin: gray faces, faces inside head, anything below chin ----
sat=c.max(1)-c.min(1)
bm=bmesh.new(); bm.from_mesh(Hh.data); bm.faces.ensure_lookup_table(); kill=np.zeros(len(bm.faces),bool)
for f in bm.faces:
    cc=f.calc_center_median(); loc,nor,idx,d=bvh.find_nearest(cc)
    inside=(cc-loc).dot(nor)<0.003
    kill[f.index]= inside or cc.z<0.66 or (sat[f.index]<0.045 and (d<0.05 or cc.y<-0.12))
bm.free(); delete_faces(Hh,kill); print('hair after cut',len(Hh.data.polygons),'groups',drop_small(Hh,0.003))
P,n=fitgap(bvh,V(Hh),0.004); setV(Hh,P); print('pushed',n)
bpy.ops.wm.save_as_mainfile(filepath='/tmp/c2/out/p1.blend')
bpy.ops.object.select_all(action='DESELECT'); B.select_set(True); Hh.select_set(True)
bpy.ops.export_scene.gltf(filepath='/tmp/c2/out/p1.glb',use_selection=True,export_image_format='JPEG')
