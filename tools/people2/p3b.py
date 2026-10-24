import sys,math; sys.path.insert(0,'/tmp/c2')
from common import *
bpy.ops.wm.open_mainfile(filepath='/tmp/c2/out/p2.blend')
B=bpy.data.objects['Body']; Hh=bpy.data.objects['Hair']; S=bpy.data.objects['shirt']; Pn=bpy.data.objects['pants']; So=bpy.data.objects['socks']; Sh=bpy.data.objects['shoes']
for o,n in ((S,'Shirt'),(Pn,'Pants'),(So,'Socks'),(Sh,'Shoes')): o.name=n; o.data.name=n
# V2 发型：男发型1（在我们自己的头上生成），换掉旧的
bpy.data.objects.remove(Hh)
with bpy.data.libraries.load('/tmp/c2/out/hair3.blend') as (src,dst): dst.objects=['Hair']
Hh=dst.objects[0]; bpy.context.collection.objects.link(Hh); print('hair2',len(Hh.data.polygons))
# ---- 标准头（男女共用，设计 18c）：替换身体的头 ----
with bpy.data.libraries.load('/tmp/c2/out/head.blend') as (src,dst): dst.objects=['Head']
Hd=dst.objects[0]; bpy.context.collection.objects.link(Hd); decimate(Hd,10000); print('head',len(Hd.data.polygons))
bm=bmesh.new(); bm.from_mesh(B.data); kill=[f for f in bm.faces if f.calc_center_median().z>0.715]   # 身体原来的头（脖子留着，伸进标准头底下）
bmesh.ops.delete(bm,geom=kill,context='FACES'); bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS'); bm.to_mesh(B.data); bm.free(); print('body head removed',len(kill))
F=Hd
# ---- body: hide under clothes / shoes ----
dg=bpy.context.evaluated_depsgraph_get()
bv={o.name:BVHTree.FromObject(o,dg) for o in (S,Pn,Sh,So)}
bm=bmesh.new(); bm.from_mesh(B.data); bm.normal_update(); kill=[]
for f in bm.faces:
    c=f.calc_center_median(); n=f.normal
    if c.z<0.075: kill.append(f); continue          # 脚藏进鞋里
    for nm in ('Shirt','Pants'):
        if bv[nm].ray_cast(c+n*0.001,n,0.08)[0] is not None:
            ok=all(bv[nm].ray_cast(c+n*0.001,(n+Vector(t)).normalized(),0.1)[0] is not None for t in ((0.3,0,0),(-0.3,0,0),(0,0,0.3),(0,0,-0.3)))
            if ok: kill.append(f); break
bmesh.ops.delete(bm,geom=kill,context='FACES'); bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS'); bm.to_mesh(B.data); bm.free()
print('body hidden',len(kill),'left',len(B.data.polygons))
decimate(B,6000)
# small holes in the cloth (left by inner-layer removal / decimation): fill
for o_ in (S,Pn):
    bm=bmesh.new(); bm.from_mesh(o_.data); r=bmesh.ops.holes_fill(bm,edges=bm.edges,sides=14); bm.to_mesh(o_.data); bm.free(); print(o_.name,'holes filled',len(r['faces']))
for o_ in (S,Pn,Sh): print(o_.name,'loose pieces removed',drop_small(o_,0.004))
# pants top under shirt: cut (otherwise the waistband pokes through the shirt hem)
bm=bmesh.new(); bm.from_mesh(Pn.data); kill=[f for f in bm.faces if f.calc_center_median().z>0.335]
bmesh.ops.delete(bm,geom=kill,context='FACES'); bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS'); bm.to_mesh(Pn.data); bm.free()
# hide socks under shoes
bm=bmesh.new(); bm.from_mesh(So.data); bm.normal_update(); kill=[f for f in bm.faces if f.calc_center_median().z<0.085]
bmesh.ops.delete(bm,geom=kill,context='FACES'); bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS'); bm.to_mesh(So.data); bm.free()
print('counts',{o.name:len(o.data.polygons) for o in (B,F,Hh,S,Pn,So,Sh)})
# body: scalp mask (vertex color R = 1 under the hair, except the forehead under the bangs)
bvH=BVHTree.FromObject(Hh,bpy.context.evaluated_depsgraph_get())
ca=Hd.data.color_attributes.new('COLOR_0','FLOAT_COLOR','POINT'); nsc=0
for i,v in enumerate(Hd.data.vertices):
    t=0.0
    if v.co.z>0.80:
        h=bvH.ray_cast(v.co+v.normal*0.001,v.normal,0.06)
        if h[0] is not None and not (v.co.y<-0.05 and v.co.z<1.02): t=1.0; nsc+=1
    ca.data[i].color=(t,t,t,1)
print('scalp verts',nsc)
cb=B.data.color_attributes.new('COLOR_0','FLOAT_COLOR','POINT')
for i in range(len(B.data.vertices)): cb.data[i].color=(0,0,0,1)
# shoes sole mask (vertex color: 1 = tint, 0 = sole)
for o in (S,Pn,So,Sh):
    ca=o.data.color_attributes.new('COLOR_0','FLOAT_COLOR','POINT')
    for i,v in enumerate(o.data.vertices):
        t=0.0 if (o is Sh and v.co.z<0.028) else 1.0; ca.data[i].color=(t,t,t,1)
# ---- armature ----
J={'Hips':((0,0,0.27),(0,0,0.36)),'Spine':((0,0,0.36),(0,0,0.45)),'Chest':((0,0,0.45),(0,0,0.55)),'UpperChest':((0,0,0.55),(0,0,0.64)),
   'Neck':((0,0,0.64),(0,0,0.70)),'Head':((0,0,0.70),(0,0,1.15))}
for s,k in (('Left',1),('Right',-1)):
    J[s+'Shoulder']=((0.04*k,0,0.60),(0.15*k,0,0.565)); J[s+'Arm']=((0.15*k,0,0.565),(0.265*k,0,0.485)); J[s+'ForeArm']=((0.265*k,0,0.485),(0.33*k,0,0.425))
    J[s+'Hand']=((0.33*k,0,0.425),(0.385*k,0,0.37)); J[s+'UpLeg']=((0.075*k,0,0.27),(0.085*k,0,0.165)); J[s+'Leg']=((0.085*k,0,0.165),(0.088*k,0,0.065))
    J[s+'Foot']=((0.088*k,0,0.065),(0.095*k,-0.12,0.02))
PAR={'Spine':'Hips','Chest':'Spine','UpperChest':'Chest','Neck':'UpperChest','Head':'Neck'}
for s in ('Left','Right'): PAR.update({s+'Shoulder':'UpperChest',s+'Arm':s+'Shoulder',s+'ForeArm':s+'Arm',s+'Hand':s+'ForeArm',s+'UpLeg':'Hips',s+'Leg':s+'UpLeg',s+'Foot':s+'Leg'})
arm=bpy.data.armatures.new('Rig'); A=bpy.data.objects.new('Rig',arm); bpy.context.collection.objects.link(A)
bpy.context.view_layer.objects.active=A; bpy.ops.object.mode_set(mode='EDIT')
for n,(h,t) in J.items(): b=arm.edit_bones.new(n); b.head=Vector(h); b.tail=Vector(t)
for n,p in PAR.items(): arm.edit_bones[n].parent=arm.edit_bones[p]
for b in arm.edit_bones: b.align_roll(Vector((0,-1,0)))
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='DESELECT'); B.select_set(True); A.select_set(True); bpy.context.view_layer.objects.active=A
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
print('unweighted',sum(1 for v in B.data.vertices if not any(x.weight>0.01 for x in v.groups)))
def transfer(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o
    for g in B.vertex_groups: o.vertex_groups.new(name=g.name)
    m=o.modifiers.new('dt','DATA_TRANSFER'); m.object=B; m.use_vert_data=True; m.data_types_verts={'VGROUP_WEIGHTS'}; m.vert_mapping='POLYINTERP_NEAREST'; m.layers_vgroup_select_src='ALL'; m.layers_vgroup_select_dst='NAME'
    bpy.ops.object.modifier_apply(modifier='dt'); o.parent=A; am=o.modifiers.new('Armature','ARMATURE'); am.object=A
for o in (S,Pn,So): transfer(o)
# T 恤只跟上半身走（下摆以前会被腿的权重拉成一条，走路时挂在两腿中间）
LEG=('LeftUpLeg','RightUpLeg','LeftLeg','RightLeg','LeftFoot','RightFoot')
gi={g.index:g.name for g in S.vertex_groups}
for v in S.data.vertices:
    tot=sum(x.weight for x in v.groups if gi[x.group] not in LEG); legw=sum(x.weight for x in v.groups if gi[x.group] in LEG)
    if legw<=0: continue
    for x in v.groups:
        if gi[x.group] in LEG: x.weight=0.0
    if tot<1e-4: S.vertex_groups['Hips'].add([v.index],1.0,'REPLACE')
    else:
        for x in v.groups:
            if gi[x.group] not in LEG: x.weight=x.weight/tot
print('shirt leg weights removed')
def rigid(o,bone_of):
    gs={}
    for v in o.data.vertices:
        b=bone_of(v.co)
        if b not in gs: gs[b]=o.vertex_groups.new(name=b)
        gs[b].add([v.index],1.0,'REPLACE')
    o.parent=A; am=o.modifiers.new('Armature','ARMATURE'); am.object=A
rigid(Hh,lambda c:'Head'); rigid(F,lambda c:'Head'); rigid(Sh,lambda c:'LeftFoot' if c.x>0 else 'RightFoot')
bpy.ops.wm.save_as_mainfile(filepath='/tmp/c2/out/p3b.blend')
