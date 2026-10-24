import bpy, bmesh, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
bpy.ops.wm.open_mainfile(filepath='/tmp/ch/out/stage1.blend')
B=bpy.data.objects['Body']; S=bpy.data.objects['Shirt']; Hh=bpy.data.objects['Hair']
dg=bpy.context.evaluated_depsgraph_get()
bvh=BVHTree.FromObject(B,dg)
def V(o): return np.array([v.co[:] for v in o.data.vertices])
def setV(o,a):
    for v,c in zip(o.data.vertices,a): v.co=Vector(c)
    o.data.update()
# ---- shirt ----
v=V(S)
sz=(0.915-0.50)/(0.962-0.044); sx=0.54; sy=0.52
v2=v.copy()
def fitgap(arr, gmin, gmax):
    out=arr.copy(); n_in=0
    for i,p in enumerate(arr):
        loc,nor,idx,d=bvh.find_nearest(Vector(p))
        if loc is None: continue
        dv=Vector(p)-loc; s=dv.dot(nor)
        if s<gmin: out[i]=loc+nor*gmin; n_in+=1
        elif d>gmax: out[i]=loc+dv.normalized()*gmax
    return out,n_in
from mathutils.kdtree import KDTree
def fieldfit(arr, gmin, gmax, R=0.025, iters=4):
    arr=arr.copy(); n=len(arr)
    kd=KDTree(n)
    for i,p in enumerate(arr): kd.insert(Vector(p),i)
    kd.balance()
    nb=[ [j for (_,j,_) in kd.find_range(Vector(p),R)] for p in arr]
    for it in range(iters):
        D=np.zeros_like(arr); w=np.zeros(n); cnt=0
        for i,p in enumerate(arr):
            loc,nor,idx,d=bvh.find_nearest(Vector(p))
            if loc is None: continue
            dv=Vector(p)-loc; s=dv.dot(nor)
            if s<gmin: D[i]=np.array(loc+nor*gmin)-p; w[i]=1; cnt+=1
            elif d>gmax: D[i]=np.array(loc+dv.normalized()*gmax)-p; w[i]=0.5
        D2=np.zeros_like(D)
        for i in range(n):
            js=nb[i]; ww=w[js]
            if ww.sum()>0: D2[i]=(D[js]*ww[:,None]).sum(0)/max(ww.sum(),len(js)*0.3)
        arr=arr+D2; print(' field it',it,'viol',cnt)
    return arr
v2=fieldfit(v2,0.008,0.016,R=0.02,iters=6)
setV(S,v2)
bm=bmesh.new(); bm.from_mesh(S.data); bm.verts.ensure_lookup_table()
nbr=[[e.other_vert(v).index for e in v.link_edges] for v in bm.verts]
bnd=np.array([any(len(e.link_faces)<2 for e in v.link_edges) for v in bm.verts]); bm.free()
P=V(S)
for it in range(3):
    Q=P.copy()
    for i,ns in enumerate(nbr):
        if bnd[i] or not ns: continue
        Q[i]=P[i]*0.5+P[ns].mean(0)*0.5
    P=Q
setV(S,P)
v2,n=fitgap(V(S),0.006,9.0); print('hard push',n)
setV(S,v2)
# ---- hair: box fit to body skull ----
hv0=V(Hh); sx,sy,sz=0.265,0.255,0.21
hv=np.empty_like(hv0); hv[:,0]=(hv0[:,0]+0.0035)*sx-0.005; hv[:,1]=(hv0[:,1]-0.0025)*sy-0.024; hv[:,2]=1.118+(hv0[:,2]-0.986)*sz
fr=np.clip((-hv0[:,1]-0.1)/0.15,0,1); fr=fr*fr*(3-2*fr); hv[:,2]+=0.012*fr*np.clip((0.9-hv0[:,2])/0.2,0,1)
# push hair out of skull
out,n=fitgap(hv,0.003,9.0); setV(Hh,out); print('hair pushed',n)

bpy.ops.wm.save_as_mainfile(filepath='/tmp/ch/out/stage2.blend')
