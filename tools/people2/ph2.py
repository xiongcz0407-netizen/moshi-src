import sys; sys.path.insert(0,'/tmp/c2')
from common import *

bpy.ops.wm.open_mainfile(filepath='/tmp/c2/out/head.blend'); B=bpy.data.objects['Head']; H,img=imp('/tmp/c2/hair2.glb','Hair')
bvh=bvh_of(B)
c=facecols(H,img); warm=c[:,0]-c[:,2]
P=V(H)
cen=np.array([p.center[:] for p in H.data.polygons])
samp=cen[(warm>0.16)]
samp=samp[np.random.RandomState(0).choice(len(samp),min(3000,len(samp)),replace=False)]
s=0.46; t=np.array([0.0,0.022,0.70])
for it in range(30):
    X=samp*s+t; Q=np.array([bvh.find_nearest(Vector(x))[0][:] for x in X])
    pm=samp.mean(0); qm=Q.mean(0); pc=samp-pm; qc=Q-qm
    s=(pc*qc).sum()/(pc*pc).sum(); t=qm-s*pm
    if it%5==0 or it==29: print(it,'s',round(s,4),'t',t.round(4),'err',np.linalg.norm(X-Q,axis=1).mean().round(4))
np.save('/tmp/c2/out/hairfit3.npy',np.r_[s,t])
setV(H,P*s+t)
# delete head (skin-colored faces on/inside body surface) and neck
bm=bmesh.new(); bm.from_mesh(H.data); bm.faces.ensure_lookup_table(); kill=np.zeros(len(bm.faces),bool)
for f in bm.faces:
    cc=f.calc_center_median(); loc,nor,idx,d=bvh.find_nearest(cc); sd=(cc-loc).dot(nor)
    kill[f.index]=(sd<0.006 and warm[f.index]>0.10) or (sd<0.025 and warm[f.index]>0.14) or sd<-0.004 or cc.z<0.68
bm.free(); delete_faces(H,kill); print('kept',len(H.data.polygons),'groups',drop_small(H,0.002))
P,n=fitgap(bvh,V(H),0.002); setV(H,P); print('pushed',n)
decimate(H,10000); print('dec',len(H.data.polygons))
bpy.data.objects.remove(B)
bpy.ops.wm.save_as_mainfile(filepath='/tmp/c2/out/hair3.blend')
bpy.ops.export_scene.gltf(filepath='/tmp/c2/out/hair3v.glb',export_image_format='JPEG')
