import bpy, bmesh, numpy as np, math
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree
bpy.ops.wm.open_mainfile(filepath='/tmp/ch/out/stage2.blend')
B=bpy.data.objects['Body']; S=bpy.data.objects['Shirt']; Hh=bpy.data.objects['Hair']
dg=bpy.context.evaluated_depsgraph_get()
# ---- hide body under shirt ----
sb=BVHTree.FromObject(S,dg)
bm=bmesh.new(); bm.from_mesh(B.data); bm.faces.ensure_lookup_table()
kill=[]
for f in bm.faces:
    c=f.calc_center_median(); n=f.normal
    hit=sb.ray_cast(c+n*0.001, n, 0.07)
    if hit[0] is not None:
        # also require shirt hit in a slightly tilted directions (avoid edges)
        ok=True
        for t in [Vector((0.3,0,0)),Vector((-0.3,0,0)),Vector((0,0,0.3)),Vector((0,0,-0.3))]:
            d=(n+t).normalized()
            if sb.ray_cast(c+n*0.001,d,0.09)[0] is None: ok=False;break
        if ok: kill.append(f)
bmesh.ops.delete(bm, geom=kill, context='FACES'); bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.to_mesh(B.data); bm.free(); print('body faces hidden',len(kill),'left',len(B.data.polygons))
# ---- armature ----
J={ 'Hips':((0,0.0,0.50),(0,0.0,0.58)), 'Spine':((0,0,0.58),(0,0,0.68)), 'Chest':((0,0,0.68),(0,0,0.78)), 'UpperChest':((0,0,0.78),(0,0,0.885)),
    'Neck':((0,0,0.885),(0,-0.005,0.935)), 'Head':((0,-0.005,0.935),(0,-0.01,1.10)) }
for s,k in (('Left',1),('Right',-1)):
    J[s+'Shoulder']=((0.03*k,0.0,0.865),(0.15*k,0.02,0.83))
    J[s+'Arm']=((0.15*k,0.02,0.83),(0.335*k,0.03,0.712))
    J[s+'ForeArm']=((0.335*k,0.03,0.712),(0.425*k,0.0,0.637))
    J[s+'Hand']=((0.425*k,0.0,0.637),(0.50*k,-0.01,0.595))
    J[s+'UpLeg']=((0.085*k,0.0,0.50),(0.115*k,0.0,0.285))
    J[s+'Leg']=((0.115*k,0.0,0.285),(0.15*k,0.02,0.06))
    J[s+'Foot']=((0.15*k,0.02,0.06),(0.17*k,-0.085,0.015))
PAR={'Spine':'Hips','Chest':'Spine','UpperChest':'Chest','Neck':'UpperChest','Head':'Neck'}
for s in ('Left','Right'):
    PAR.update({s+'Shoulder':'UpperChest',s+'Arm':s+'Shoulder',s+'ForeArm':s+'Arm',s+'Hand':s+'ForeArm',s+'UpLeg':'Hips',s+'Leg':s+'UpLeg',s+'Foot':s+'Leg'})
arm=bpy.data.armatures.new('Rig'); A=bpy.data.objects.new('Rig',arm); bpy.context.collection.objects.link(A)
bpy.context.view_layer.objects.active=A; bpy.ops.object.mode_set(mode='EDIT')
for n,(h,t) in J.items():
    b=arm.edit_bones.new(n); b.head=Vector(h); b.tail=Vector(t); b.roll=0
for n,p in PAR.items():
    arm.edit_bones[n].parent=arm.edit_bones[p]; 
    if n in ('Spine','Chest','UpperChest','Neck','Head') or n.endswith(('ForeArm','Hand','Leg','Foot')) and not n.endswith('UpLeg'): arm.edit_bones[n].use_connect=False
# align roll so local X ~ world X for all bones
for b in arm.edit_bones: b.align_roll(Vector((0,-1,0)))
bpy.ops.object.mode_set(mode='OBJECT')
# ---- body weights: automatic (heat) ----
def bind(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); A.select_set(True); bpy.context.view_layer.objects.active=A
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
bind(B)
empty=[g.name for g in B.vertex_groups if not any(g.index in [x.group for x in v.groups if x.weight>0.01] for v in B.data.vertices[:])]
cnt=sum(1 for v in B.data.vertices if not any(x.weight>0.01 for x in v.groups))
print('body unweighted verts',cnt,'empty groups',empty)
# ---- shirt: transfer weights from body ----
bpy.ops.object.select_all(action='DESELECT'); S.select_set(True); bpy.context.view_layer.objects.active=S
for g in B.vertex_groups: S.vertex_groups.new(name=g.name)
m=S.modifiers.new('dt','DATA_TRANSFER'); m.object=B; m.use_vert_data=True; m.data_types_verts={'VGROUP_WEIGHTS'}; m.vert_mapping='POLYINTERP_NEAREST'
m.layers_vgroup_select_src='ALL'; m.layers_vgroup_select_dst='NAME'
bpy.ops.object.modifier_apply(modifier='dt')
S.parent=A; am=S.modifiers.new('Armature','ARMATURE'); am.object=A
# ---- hair: rigid on Head ----
g=Hh.vertex_groups.new(name='Head'); g.add([v.index for v in Hh.data.vertices],1.0,'REPLACE')
Hh.parent=A; am=Hh.modifiers.new('Armature','ARMATURE'); am.object=A
# ---- square face shape key ----
B.shape_key_add(name='Basis'); sk=B.shape_key_add(name='square',from_mix=False)
def ss(a,b,x): t=np.clip((x-a)/(b-a),0,1); return t*t*(3-2*t)
n_moved=0
for i,v in enumerate(B.data.vertices):
    x,y,z=v.co
    if z<0.895 or z>1.0: continue
    wz=ss(0.895,0.93,z)*(1-ss(0.955,0.995,z))           # peak at jaw angle 0.93~0.955
    wy=1-ss(-0.005,0.035,y)                               # front half + sides
    wx=ss(0.012,0.05,abs(x))
    w=wz*wy*wx
    dx=np.sign(x)*0.011*w
    # chin: flatten & widen bottom center
    wc=ss(0.94,0.915,z)*(1-ss(0.0,0.04,abs(x)))*(1-ss(-0.04,-0.01,y))
    dz=0.004*wc; dx+=np.sign(x)*0.004*wc*ss(0.0,0.02,abs(x))
    if w>0 or wc>0: sk.data[i].co=Vector((x+dx,y,z+dz)); n_moved+=1
print('square moved',n_moved)
bpy.ops.wm.save_as_mainfile(filepath='/tmp/ch/out/stage3.blend')
