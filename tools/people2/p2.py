import sys; sys.path.insert(0,'/tmp/c2')
from common import *
bpy.ops.wm.open_mainfile(filepath='/tmp/c2/out/p1.blend')
B=bpy.data.objects['Body']; bvh=bvh_of(B)
# import cloth pieces from split blend
with bpy.data.libraries.load('/tmp/c2/out/cloth_split.blend') as (src,dst): dst.objects=[n for n in src.objects if n in ('shirt','pants','socks','shoes')]
for o in dst.objects: bpy.context.collection.objects.link(o)
def boxmap(P,src,dst):
    s=(np.array(dst[1])-np.array(dst[0]))/(np.array(src[1])-np.array(src[0])); return (P-np.array(src[0]))*s+np.array(dst[0])
def prep(o,dec1,dec2):
    decimate(o,dec1); k=remove_inner(o); print(o.name,'inner removed',k,'left',len(o.data.polygons)); decimate(o,dec2)
from mathutils.kdtree import KDTree
def fieldfit(o,gmin,gmax,R=0.02,iters=5):
    arr=V(o); n=len(arr); kd=KDTree(n)
    for i,p in enumerate(arr): kd.insert(Vector(p),i)
    kd.balance(); nb=[[j for (_,j,_) in kd.find_range(Vector(p),R)] for p in arr]
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
        arr=arr+D2
    setV(o,arr)
    bm=bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
    nbr=[[e.other_vert(v).index for e in v.link_edges] for v in bm.verts]; bnd=np.array([any(len(e.link_faces)<2 for e in v.link_edges) for v in bm.verts]); bm.free()
    for it in range(2):
        Q=arr.copy()
        for i,ns in enumerate(nbr):
            if not bnd[i] and ns: Q[i]=arr[i]*0.5+arr[ns].mean(0)*0.5
        arr=Q
    arr,m=fitgap(bvh,arr,gmin*0.7); setV(o,arr); print(o.name,'final push',m)
S=bpy.data.objects['shirt']; Pn=bpy.data.objects['pants']; So=bpy.data.objects['socks']; Sh=bpy.data.objects['shoes']
for o,a,b in ((S,40000,4000),(Pn,40000,3500)): prep(o,a,b)
for o,a,b in ((So,20000,1200),(Sh,30000,3000)): prep(o,a,b)
# shirt
P=V(S); src=(P.min(0),P.max(0))
Q=boxmap(P,src,((-0.25,-0.155,0.29),(0.25,0.135,0.665)))
import math
ang=math.radians(-26)
for i,p in enumerate(Q):
    ax=abs(p[0]); w=np.clip((ax-0.14)/0.05,0,1)
    if w<=0: continue
    sg=np.sign(p[0]); px,pz=0.15*sg,0.575; dx,dz=p[0]-px,p[2]-pz; a=-ang*w*sg
    Q[i,0]=px+dx*math.cos(a)-dz*math.sin(a); Q[i,2]=pz+dx*math.sin(a)+dz*math.cos(a)
setV(S,Q)
fieldfit(S,0.008,0.03)
# pants
P=V(Pn); src=(P.min(0),P.max(0))
setV(Pn,boxmap(P,src,((-0.178,-0.12,0.065),(0.178,0.11,0.375))))
fieldfit(Pn,0.007,0.03)
# socks / shoes: per piece (two components) -> per foot
def perfoot(o,boxR,boxL):
    bm=bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
    # components by vertex
    lab=-np.ones(len(bm.verts),int); c=0
    for v in bm.verts:
        if lab[v.index]>=0: continue
        st=[v]; lab[v.index]=c
        while st:
            x=st.pop()
            for e in x.link_edges:
                y=e.other_vert(x)
                if lab[y.index]<0: lab[y.index]=c; st.append(y)
        c+=1
    bm.free(); P=V(o); out=P.copy()
    cents=[P[lab==k].mean(0)[0] for k in range(c)]; sizes=[(lab==k).sum() for k in range(c)]
    big=sorted(range(c),key=lambda k:-sizes[k])[:2]; big.sort(key=lambda k:cents[k])
    mid=(cents[big[0]]+cents[big[1]])/2
    for side,box in ((0,boxR),(1,boxL)):
        m=np.isin(lab,[k for k in range(c) if (cents[k]>mid)==bool(side)])
        mb=lab==big[side]; out[m]=boxmap(P[m],(P[mb].min(0),P[mb].max(0)),box)
    setV(o,out); print(o.name,'components',c)
perfoot(So,((-0.165,-0.14,0.0),(-0.03,0.08,0.11)),((0.03,-0.14,0.0),(0.165,0.08,0.11)))
perfoot(Sh,((-0.18,-0.165,-0.005),(-0.02,0.095,0.105)),((0.02,-0.165,-0.005),(0.18,0.095,0.105)))
fieldfit(So,0.004,0.02)
bpy.ops.wm.save_as_mainfile(filepath='/tmp/c2/out/p2.blend')
bpy.ops.object.select_all(action='DESELECT')
for o in (B,bpy.data.objects['Hair'],S,Pn,So,Sh): o.select_set(True)
bpy.ops.export_scene.gltf(filepath='/tmp/c2/out/p2.glb',use_selection=True,export_image_format='JPEG')
