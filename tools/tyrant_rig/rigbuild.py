import bpy, bmesh, sys, numpy as np
import os as _os; RD=_os.environ.get('RD','/home/claude/fb5/rig'); SRC=_os.environ.get('SRC','/home/claude/fb5/src/BOSS_装甲暴君.glb')
from mathutils import Vector, Matrix
sys.path.insert(0,_os.path.dirname(_os.path.abspath(__file__))); from joints import J, PAR
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
B=[x for x in bpy.context.scene.objects if x.type=='MESH'][0]; B.name='Tyrant'
bpy.context.view_layer.objects.active=B; B.select_set(True); bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
# 材质：只留颜色贴图，1024
mat=B.data.materials[0]; nt=mat.node_tree; bsdf=[n for n in nt.nodes if n.type=='BSDF_PRINCIPLED'][0]
for inp in ['Normal','Metallic','Roughness']:
    for l in list(bsdf.inputs[inp].links): nt.links.remove(l)
bsdf.inputs['Metallic'].default_value=0; bsdf.inputs['Roughness'].default_value=0.8
for n in list(nt.nodes):
    if n.type=='TEX_IMAGE' and not any(l.to_socket==bsdf.inputs['Base Color'] for l in n.outputs[0].links): nt.nodes.remove(n)
    elif n.type in ('NORMAL_MAP','SEPARATE_COLOR','SEPARATE_RGB'): nt.nodes.remove(n)
for im in bpy.data.images:
    if im.users and im.size[0]>1024: im.scale(1024,1024)
# 减面 → 约 7000
m=B.modifiers.new('d','DECIMATE'); m.ratio=7000/len(B.data.polygons); bpy.ops.object.modifier_apply(modifier='d')
print('faces',len(B.data.polygons))
# 骨架
arm=bpy.data.armatures.new('Rig'); A=bpy.data.objects.new('Rig',arm); bpy.context.collection.objects.link(A)
bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active=A; A.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for n,(h,t) in J.items():
    b=arm.edit_bones.new(n); b.head=Vector(h); b.tail=Vector(t)
    b.align_roll(Vector((0,-1,0)) if abs((Vector(t)-Vector(h)).normalized().y)<0.9 else Vector((0,0,1)))
for n,p in PAR.items():
    eb=arm.edit_bones[n]; eb.parent=arm.edit_bones[p]; eb.use_connect=False
bpy.ops.object.mode_set(mode='OBJECT')
# 代理：体素重建（连成一块），自动权重，再传给原模型
P=B.copy(); P.data=B.data.copy(); bpy.context.collection.objects.link(P); P.name='Proxy'
P.modifiers.clear(); r=P.modifiers.new('r','REMESH'); r.mode='VOXEL'; r.voxel_size=float(_os.environ.get('VOX','0.01'))
bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active=P; P.select_set(True); bpy.ops.object.modifier_apply(modifier='r')
print('proxy',len(P.data.vertices))
bpy.ops.object.select_all(action='DESELECT'); P.select_set(True); A.select_set(True); bpy.context.view_layer.objects.active=A
P.scale=(10,10,10); A.scale=(10,10,10); bpy.context.view_layer.update()   # 模型太小（1.1）骨骼热度权重会算不出来，放大 10 倍算
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
P.parent=None; P.scale=(1,1,1); A.scale=(1,1,1); bpy.context.view_layer.update()
print('proxy groups',len(P.vertex_groups), [g.name for g in P.vertex_groups][:5])
for g in P.vertex_groups: B.vertex_groups.new(name=g.name)
dt=B.modifiers.new('dt','DATA_TRANSFER'); dt.object=P; dt.use_vert_data=True; dt.data_types_verts={'VGROUP_WEIGHTS'}; dt.vert_mapping='POLYINTERP_NEAREST'
dt.layers_vgroup_select_src='ALL'; dt.layers_vgroup_select_dst='NAME'
bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active=B; B.select_set(True); bpy.ops.object.modifier_apply(modifier='dt')
bpy.data.objects.remove(P)
G={g.name:g for g in B.vertex_groups}
for n in J:
    if n not in G: G[n]=B.vertex_groups.new(name=n)
me=B.data
# 修权重：离骨头太远的点（数据转移串错、没权重）改成按最近的骨头
import numpy as np
segs={n:(Vector(h),Vector(t)) for n,(h,t) in J.items()}
def dseg(p,a,b):
    ab=b-a; u=max(0,min(1,(p-a).dot(ab)/ab.length_squared)); return (p-(a+ab*u)).length
idx={g.index:g.name for g in B.vertex_groups}
nfix=0
for v in me.vertices:
    gs=[(idx[g.group],g.weight) for g in v.groups if g.weight>0.01]
    tot=sum(w for _,w in gs)
    dav=sum(w*dseg(v.co,*segs[n]) for n,w in gs if n in segs)/tot if tot>0.3 else 9
    near=sorted((dseg(v.co,a,b),n) for n,(a,b) in segs.items())
    if dav>near[0][0]+0.07:
        for g in v.groups: g.weight=0
        d0,n0=near[0]; d1,n1=near[1]
        w0=1/(d0+1e-3)**2; w1=1/(d1+1e-3)**2
        G[n0].add([v.index],w0/(w0+w1),'REPLACE'); G[n1].add([v.index],w1/(w0+w1),'REPLACE'); nfix+=1
print('fixed',nfix)
# 归一化、每点最多 4 根骨
bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active=B; B.select_set(True)
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL',limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL',lock_active=False)
md=B.modifiers.new('Armature','ARMATURE'); md.object=A; B.parent=A
# 装甲是一块块硬壳，自动权重在胸口 / 腰甲 / 机炮挨着大腿的地方会串（机炮一抬，腰甲被拽成长条）。
# 按位置收一下：里面的（身子、腿）不准跟手臂动；外面的（机炮、铁拳）只准跟手臂动；中间一圈保留自动权重
ARMS={'R':['R_Shoulder','R_Arm','R_ForeArm','gun'],'L':['L_Shoulder','L_Arm','L_ForeArm','L_Hand']}
ALLARM={G[n].index for k in ARMS for n in ARMS[k]}
LEGI={G[n].index for n in ('R_UpLeg','R_Leg','R_Foot','L_UpLeg','L_Leg','L_Foot')}
for v in me.vertices:   # 胸口高度不准跟腿走；头盔一圈不准跟肩膀走
    x,y,z=v.co
    for g in v.groups:
        if (z>0.58 and g.group in LEGI) or (abs(x)<0.15 and z>0.93 and g.group in ALLARM): g.weight=0
for v in me.vertices:
    x,y,z=v.co; side='R' if x<0 else 'L'; ax=abs(x); keep={G[n].index for n in ARMS[side]}
    inner = (ax<0.25) if z<0.55 else (ax<0.19 if z<0.86 else False)
    outer = (ax>0.29 and 0.12<z<=0.55) or (ax>0.25 and 0.55<z<0.86)
    if not inner and not outer and 0.12<z<0.86:   # 中间一圈：离手臂近就整块跟手臂，离身子近就整块跟身子（不混，免得拉出片）
        da=min(dseg(v.co,*segs[n]) for n in ARMS[side]); db=min(dseg(v.co,*segs[n]) for n in segs if n not in ARMS['R']+ARMS['L'] and n not in ('core','pod_L','pod_R'))
        if da<db: outer=True
        else: inner=True
    if inner:
        tot=0
        for g in v.groups:
            if g.group in ALLARM: g.weight=0
            tot+=g.weight
        if tot<0.05:
            cand=[n for n in segs if n not in ARMS['R']+ARMS['L'] and n not in ('core','pod_L','pod_R')]
            G[sorted((dseg(v.co,*segs[n]),n) for n in cand)[0][1]].add([v.index],1.0,'REPLACE')
    elif outer:
        tot=0
        for g in v.groups:
            if g.group not in keep: g.weight=0
            tot+=g.weight
        if tot<0.05: G[sorted((dseg(v.co,*segs[n]),n) for n in ARMS[side])[0][1]].add([v.index],1.0,'REPLACE')
# 原模型（混元一整块）手臂内侧跟大腿 / 腰甲是连在一起的面：手一抬就拉出大片。腰以下这种「一头跟手臂、一头跟腿 / 身子」的面直接删掉
import bmesh
def armdom(v):
    a=sum(g.weight for g in v.groups if g.group in ALLARM); return a>0.5
bm=bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
dom=[armdom(v) for v in me.vertices]
kill=[f for f in bm.faces if len({dom[v.index] for v in f.verts})>1 and max(v.co.z for v in f.verts)<0.7]
print('bridge faces removed',len(kill))
bmesh.ops.delete(bm,geom=kill,context='FACES_ONLY'); bm.to_mesh(me); bm.free()
# 再按连在一起的块投票：一块里大部分跟手臂，这块就整块跟手臂（机炮里面靠大腿那几片别留在腰上）；反过来也一样
import collections
adj=collections.defaultdict(set)
for pg in me.polygons:
    vs=list(pg.vertices)
    for a in vs:
        adj[a].update(vs)
seen=set(); nflip=0
for st in range(len(me.vertices)):
    if st in seen or st not in adj: continue
    comp=[]; stack=[st]; seen.add(st)
    while stack:
        a=stack.pop(); comp.append(a)
        for b in adj[a]:
            if b not in seen: seen.add(b); stack.append(b)
    zs=[me.vertices[i].co.z for i in comp]
    if max(zs)>0.62 or len(comp)>4000: continue
    da=[armdom(me.vertices[i]) for i in comp]; arm=sum(da)>len(da)/2
    for i,d in zip(comp,da):
        if d==arm: continue
        v=me.vertices[i]; side='R' if v.co.x<0 else 'L'
        for g in v.groups: g.weight=0
        cand=ARMS[side] if arm else [n for n in segs if n not in ARMS['R']+ARMS['L'] and n not in ('core','pod_L','pod_R')]
        G[sorted((dseg(v.co,*segs[n]),n) for n in cand)[0][1]].add([i],1.0,'REPLACE'); nflip+=1
print('island flips',nflip)
# 肩上导弹箱：整个箱子 100% 跟 pod_L / pod_R（开盖时整个往前上翻）；核心 core 不带权重（只给开发1 挂光）
PL=G['pod_L']; PR=G['pod_R']; CO=G['core']
for v in me.vertices:
    x,y,z=v.co
    pod = PL if x>0 else PR
    if z>0.875 and 0.145<abs(x)<0.34 and y>-0.12:
        for g in v.groups: g.weight=0
        pod.add([v.index],1.0,'REPLACE')
    else:
        for g in v.groups:
            if g.group in (PL.index,PR.index): g.weight=0
    for g in v.groups:
        if g.group==CO.index: G['Chest'].add([v.index],g.weight,'ADD'); g.weight=0
core_i=CO.index
for v in me.vertices:   # 没有权重的点（包括原来只跟 core 的）给最近的骨
    if sum(g.weight for g in v.groups if g.group!=core_i)<0.05:
        G[sorted((dseg(v.co,*segs[n]),n) for n in segs if n!='core')[0][1]].add([v.index],1.0,'REPLACE')
bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL',lock_active=False)
bpy.ops.wm.save_as_mainfile(filepath=RD+'/rigged.blend')
print('saved')
