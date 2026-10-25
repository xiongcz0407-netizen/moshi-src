import bpy, bmesh, sys, numpy as np
import os as _os; RD=_os.environ.get('RD','/home/claude/fb4/rig'); SRC=_os.environ.get('SRC','/home/claude/fb4/src/BOSS_尖啸者.glb')
from mathutils import Vector, Matrix
sys.path.insert(0,_os.path.dirname(_os.path.abspath(__file__))); from joints import J, PAR
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
B=[x for x in bpy.context.scene.objects if x.type=='MESH'][0]; B.name='Screamer'
import math; B.rotation_euler=(math.radians(90),0,0)  # 原模型 Y 朝上 → Z 朝上，脸朝 -Y
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
# 减面 50000 → 约 6000
m=B.modifiers.new('d','DECIMATE'); m.ratio=0.12; bpy.ops.object.modifier_apply(modifier='d')
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
P.modifiers.clear(); r=P.modifiers.new('r','REMESH'); r.mode='VOXEL'; r.voxel_size=float(_os.environ.get('VOX','0.006'))
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
# 下巴：jaw 骨单独管下巴（自动权重分不出来，按位置手动给）
JW=G['jaw']; HD=G['head']; NK=G['neck']
for v in me.vertices:
    x,y,z=v.co
    if abs(x)<0.075 and y<-0.005 and 0.945<z<1.05:
        wz=min(1,max(0,(1.035-z)/0.03))*min(1,max(0,(z-0.945)/0.02))   # 嘴角往下渐变
        wy=min(1,max(0,(-0.005-y)/0.03)); wx=min(1,max(0,(0.075-abs(x))/0.025))
        w=wz*wy*wx
        if w>0.02:
            for g in v.groups:
                if g.group in (HD.index,NK.index): g.weight*=1-w
            JW.add([v.index],w,'REPLACE')
bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL',lock_active=False)
bpy.ops.wm.save_as_mainfile(filepath=RD+'/rigged.blend')
print('saved')
