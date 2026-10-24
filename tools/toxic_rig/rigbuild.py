import bpy, sys, os, numpy as np
from mathutils import Vector
sys.path.insert(0,'/home/claude/fb2/rig'); from joints import J, PAR
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='/home/claude/fb2/src/BOSS_毒囊.glb')
B=[x for x in bpy.context.scene.objects if x.type=='MESH'][0]; B.name='Toxic'
bpy.context.view_layer.objects.active=B; B.select_set(True); bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
mat=B.data.materials[0]; nt=mat.node_tree; bsdf=[n for n in nt.nodes if n.type=='BSDF_PRINCIPLED'][0]
for inp in ['Normal','Metallic','Roughness']:
    for l in list(bsdf.inputs[inp].links): nt.links.remove(l)
bsdf.inputs['Metallic'].default_value=0; bsdf.inputs['Roughness'].default_value=0.8
for n in list(nt.nodes):
    if n.type=='TEX_IMAGE' and not any(l.to_socket==bsdf.inputs['Base Color'] for l in n.outputs[0].links): nt.nodes.remove(n)
    elif n.type in ('NORMAL_MAP','SEPARATE_COLOR','SEPARATE_RGB'): nt.nodes.remove(n)
for im in bpy.data.images:
    if im.users and im.size[0]>1024: im.scale(1024,1024)
m=B.modifiers.new('d','DECIMATE'); m.ratio=0.44; bpy.ops.object.modifier_apply(modifier='d')
import bmesh
bm_=bmesh.new(); bm_.from_mesh(B.data); r_=bmesh.ops.remove_doubles(bm_,verts=bm_.verts,dist=float(os.environ.get('MERGE','0.0006'))); bm_.to_mesh(B.data); bm_.free()
print('faces',len(B.data.polygons),'verts',len(B.data.vertices))
arm=bpy.data.armatures.new('Rig'); A=bpy.data.objects.new('Rig',arm); bpy.context.collection.objects.link(A)
bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active=A; A.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for n,(h,t) in J.items():
    b=arm.edit_bones.new(n); b.head=Vector(h); b.tail=Vector(t)
    b.align_roll(Vector((0,-1,0)) if abs((Vector(t)-Vector(h)).normalized().y)<0.9 else Vector((0,0,1)))
for n,p in PAR.items():
    eb=arm.edit_bones[n]; eb.parent=arm.edit_bones[p]; eb.use_connect=False
bpy.ops.object.mode_set(mode='OBJECT')
P=B.copy(); P.data=B.data.copy(); bpy.context.collection.objects.link(P); P.name='Proxy'
P.modifiers.clear(); r=P.modifiers.new('r','REMESH'); r.mode='VOXEL'; r.voxel_size=0.008
bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active=P; P.select_set(True); bpy.ops.object.modifier_apply(modifier='r')
print('proxy',len(P.data.vertices))
bpy.ops.object.select_all(action='DESELECT'); P.select_set(True); A.select_set(True); bpy.context.view_layer.objects.active=A
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
for g in P.vertex_groups: B.vertex_groups.new(name=g.name)
dt=B.modifiers.new('dt','DATA_TRANSFER'); dt.object=P; dt.use_vert_data=True; dt.data_types_verts={'VGROUP_WEIGHTS'}; dt.vert_mapping='POLYINTERP_NEAREST'
dt.layers_vgroup_select_src='ALL'; dt.layers_vgroup_select_dst='NAME'
bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active=B; B.select_set(True); bpy.ops.object.modifier_apply(modifier='dt')
bpy.data.objects.remove(P)
G={g.name:g for g in B.vertex_groups}
for n in J:
    if n not in G: G[n]=B.vertex_groups.new(name=n)
me=B.data
# 下巴：嘴缝以下、下巴尖以上、脸前面（嘴张开靠它）
nj=0
for v in me.vertices:
    p=v.co
    if abs(p.x)<0.062 and p.y<-0.015 and 0.365<p.z<0.425:
        w=min(1,(0.425-p.z)/0.01)*min(1,(0.062-abs(p.x))/0.015)*min(1,(-0.015-p.y)/0.02)
        if w>0.02:
            for g in v.groups: g.weight*=(1-w)
            G['Jaw'].add([v.index],w,'ADD'); nj+=1
print('jaw verts',nj)
# 肚子：前面、腰上
for v in me.vertices:
    p=v.co
    if abs(p.x)<0.24 and p.y<-0.03 and 0.04<p.z<0.30:
        w=min(1,(-0.03-p.y)/0.08)*max(0,1-abs(p.z-0.15)/0.14)*max(0,1-abs(p.x)/0.24)*0.7
        if w>0.02:
            for g in v.groups: g.weight*=(1-w)
            G['Belly'].add([v.index],w,'ADD')
segs={n:(Vector(h),Vector(t)) for n,(h,t) in J.items() if n not in ('Jaw','Belly')}
def dseg(p,a,b):
    ab=b-a; u=max(0,min(1,(p-a).dot(ab)/ab.length_squared)); return (p-(a+ab*u)).length
idx={g.index:g.name for g in B.vertex_groups}
nfix=0
for v in me.vertices:
    gs=[(idx[g.group],g.weight) for g in v.groups if g.weight>0.01]
    if any(n in ('Jaw',) for n,_ in gs): continue
    tot=sum(w for _,w in gs)
    dav=sum(w*dseg(v.co,*segs[n]) for n,w in gs if n in segs)/tot if tot>0.3 else 9
    near=sorted((dseg(v.co,a,b),n) for n,(a,b) in segs.items())
    if dav>near[0][0]+0.08:
        for g in v.groups: g.weight=0
        d0,n0=near[0]; d1,n1=near[1]
        w0=1/(d0+1e-3)**2; w1=1/(d1+1e-3)**2
        G[n0].add([v.index],w0/(w0+w1),'REPLACE'); G[n1].add([v.index],w1/(w0+w1),'REPLACE'); nfix+=1
print('fixed',nfix)
bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active=B; B.select_set(True)
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL',limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL',lock_active=False)

# ===== 设计 84：肩膀 / 腋下 / 手肘权重平滑 + 小块（脓包）整块跟着动 =====
import numpy as np
nv=len(me.vertices); names=[g.name for g in B.vertex_groups]; gi={n:i for i,n in enumerate(names)}
Wt=np.zeros((nv,len(names)),np.float32)
for v in me.vertices:
    for g in v.groups: Wt[v.index,g.group]=g.weight
E2=np.array([e.vertices[:] for e in me.edges],np.int64)
CO=np.array([v.co[:] for v in me.vertices],np.float32)
# 连通块
par=np.arange(nv)
def fd(x):
    r=x
    while par[r]!=r: r=par[r]
    while par[x]!=r: par[x],x=r,par[x]
    return r
for a,b in E2:
    ra,rb=fd(a),fd(b)
    if ra!=rb: par[ra]=rb
root=np.array([fd(i) for i in range(nv)]); _,lab,cnt=np.unique(root,return_inverse=True,return_counts=True)
# 区域：肩、腋下、手肘（左右各一），越近越强
JT=[(0.24,0.06,0.41,0.12),(0.40,0.06,0.24,0.10),(0.16,0.07,0.33,0.10),(0.06,0.04,0.39,0.08)]
mask=np.zeros(nv,np.float32)
for sx in (1,-1):
    for x,y,z,r in JT:
        d=np.linalg.norm(CO-np.array([sx*x,y,z],np.float32),axis=1); mask=np.maximum(mask,np.clip(1-d/r,0,1))
mask=np.clip(mask*1.6,0,1)
lock=Wt[:,gi['Jaw']]>0.01 if 'Jaw' in gi else np.zeros(nv,bool)
mask[lock]=0
nb=[[] for _ in range(nv)]
for a,b in E2: nb[a].append(b); nb[b].append(a)
deg=np.array([max(1,len(x)) for x in nb],np.float32)
rows=np.concatenate([np.full(len(x),i) for i,x in enumerate(nb) if x]); cols=np.concatenate([np.array(x) for x in nb if x])
SM=int(os.environ.get('SMOOTH','14'))
for it in range(SM):
    acc=np.zeros_like(Wt); np.add.at(acc,rows,Wt[cols]); avg=acc/deg[:,None]
    Wt=Wt+(avg-Wt)*(0.5*mask)[:,None]
# 小块（脓包、滴液）：整块用同一组权重（平均），动起来还是圆的
small=cnt[lab]<int(os.environ.get('SMALL','0'))
for c in np.unique(lab[small]):
    idx=np.where(lab==c)[0]
    if lock[idx].any() or CO[idx,2].max()>0.37 and np.abs(CO[idx,0]).max()<0.09: continue   # 嘴里、头上的不动
    Wt[idx]=Wt[idx].mean(0)
# 每个顶点只留最大的 4 个，归一
o=np.argsort(-Wt,axis=1); keep=np.zeros_like(Wt,bool); np.put_along_axis(keep,o[:,:4],True,axis=1); Wt=np.where(keep,Wt,0); Wt/=np.maximum(Wt.sum(1,keepdims=True),1e-6)
for g in B.vertex_groups: g.remove(list(range(nv)))
for j,n in enumerate(names):
    idx=np.where(Wt[:,j]>0.003)[0]
    for i in idx: B.vertex_groups[j].add([int(i)],float(Wt[i,j]),'REPLACE')
print('smooth done, small comps',int(np.unique(lab[small]).size),'comps',len(cnt),sorted(cnt)[-6:])
md=B.modifiers.new('Armature','ARMATURE'); md.object=A; B.parent=A
bpy.ops.wm.save_as_mainfile(filepath='/home/claude/fb2/rig/rigged.blend')
print('saved')
