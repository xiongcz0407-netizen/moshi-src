import sys; sys.path.insert(0,'/tmp/c2')
from common import *
bpy.ops.wm.read_factory_settings(use_empty=True)
B,_=imp('/tmp/c2/body.glb','Body'); Hd,img=imp('/tmp/c2/head.glb','Head')
bvh=bvh_of(B); P=V(Hd)
samp=P[(P[:,2]>0.35)]   # 头顶、后脑、两侧（不含下巴、脖子口）
samp=samp[np.random.RandomState(0).choice(len(samp),3000,replace=False)]
s=0.47; t=np.array([-0.005,0.02,0.69])
for it in range(30):
    X=samp*s+t; Q=np.array([bvh.find_nearest(Vector(x))[0][:] for x in X])
    pm=samp.mean(0); qm=Q.mean(0); pc=samp-pm; qc=Q-qm
    s=(pc*qc).sum()/(pc*pc).sum(); t=qm-s*pm
print('head fit s',round(s,4),'t',t.round(4),'err',np.linalg.norm(samp*s+t-Q,axis=1).mean().round(4))
setV(Hd,P*s+t); v=V(Hd); print('head bbox',v.min(0).round(3),v.max(0).round(3))
bpy.data.objects.remove(B)
bpy.ops.wm.save_as_mainfile(filepath='/tmp/c2/out/head.blend')
