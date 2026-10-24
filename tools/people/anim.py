import bpy, math
from mathutils import Quaternion, Vector, Matrix
bpy.ops.wm.open_mainfile(filepath='/tmp/ch/out/stage3.blend')
A=bpy.data.objects['Rig']; bpy.context.scene.render.fps=30
def Rx(a): return Quaternion((1,0,0),a)
def Ry(a): return Quaternion((0,1,0),a)
def Rz(a): return Quaternion((0,0,1),a)
rest={b.name:b.matrix_local.to_quaternion() for b in A.data.bones}
hinge={}
for b in A.data.bones:
    d=(b.tail_local-b.head_local).normalized(); ax=d.cross(Vector((0,-1,0)))
    hinge[b.name]=ax.normalized() if ax.length>1e-4 else Vector((1,0,0))
def flex(name,a): return Quaternion(hinge[name],a)
def setrot(pb,R):
    r=rest[pb.name]; pb.rotation_mode='QUATERNION'; pb.rotation_quaternion=r.inverted()@R@r
D=math.radians
ARM_DOWN=D(40)
def pose(kind,ph):
    P=A.pose.bones; s=math.sin(2*math.pi*ph); c=math.cos(2*math.pi*ph)
    for pb in P: pb.rotation_mode='QUATERNION'; pb.rotation_quaternion=(1,0,0,0); pb.location=(0,0,0)
    if kind=='idle':
        br=math.sin(2*math.pi*ph)
        setrot(P['Chest'],Rx(D(1.2)*br)); setrot(P['Head'],Rx(-D(1)*br))
        P['Hips'].location=(0,0.002*br,0)
        for side,k in (('Left',1),('Right',-1)):
            setrot(P[side+'Arm'],Ry(k*(ARM_DOWN+D(2)*br)))
            setrot(P[side+'ForeArm'],flex(side+'ForeArm',D(8)))
        return
    if kind=='walk': A_leg,K0,K1,A_arm,E0,E1,bob,lean,tw=D(24),D(4),D(38),D(20),D(10),D(14),0.006,D(3),D(5)
    else:            A_leg,K0,K1,A_arm,E0,E1,bob,lean,tw=D(38),D(10),D(80),D(32),D(60),D(20),0.014,D(10),D(8)
    P['Hips'].location=(0,bob*math.cos(4*math.pi*ph),0)
    setrot(P['Hips'],Rz(tw*0.5*s))
    setrot(P['Spine'],Rx(lean)@Rz(-tw*s))
    setrot(P['Chest'],Rz(-tw*0.4*s))
    for side,k,sg in (('Left',1,1),('Right',-1,-1)):
        a=A_leg*s*sg                                  # 正 = 腿往前
        mv=c*sg                                       # >0 往前摆
        knee=K0+K1*max(0,mv)**1.5
        setrot(P[side+'UpLeg'],Rx(-a))
        setrot(P[side+'Leg'],Rx(knee))
        setrot(P[side+'Foot'],Rx(-knee*0.5+a*0.3))
        sw=-A_arm*s*sg
        setrot(P[side+'Arm'],Rx(-sw)@Ry(k*ARM_DOWN))
        setrot(P[side+'ForeArm'],flex(side+'ForeArm',E0+E1*max(0,sw/A_arm)))
CL={'idle':(3.0,90),'walk':(1.0,30),'run':(0.66,20)}
A.animation_data_create()
for name,(dur,nf) in CL.items():
    act=bpy.data.actions.new(name); act.use_fake_user=True; A.animation_data.action=act
    for f in range(nf+1):
        pose(name,f/nf)
        for pb in A.pose.bones:
            pb.keyframe_insert('rotation_quaternion',frame=f+1)
            if pb.name=='Hips': pb.keyframe_insert('location',frame=f+1)
    print('action',name,nf)
A.animation_data.action=bpy.data.actions['idle']
for pb in A.pose.bones: pb.rotation_quaternion=(1,0,0,0); pb.location=(0,0,0)
# ---- materials: base color only, smaller textures ----
for o,sz in ((bpy.data.objects['Body'],1024),(bpy.data.objects['Shirt'],512),(bpy.data.objects['Hair'],512)):
    mat=o.data.materials[0]; nt=mat.node_tree; img=None
    for n in nt.nodes:
        if n.type=='TEX_IMAGE' and n.image and n.image.name.endswith('_tex'): img=n.image
    img.scale(sz,sz)
    for n in list(nt.nodes): nt.nodes.remove(n)
    out=nt.nodes.new('ShaderNodeOutputMaterial'); bs=nt.nodes.new('ShaderNodeBsdfPrincipled'); tx=nt.nodes.new('ShaderNodeTexImage'); tx.image=img
    mat.use_backface_culling=(o.name!='Shirt'); bs.inputs['Metallic'].default_value=0; bs.inputs['Roughness'].default_value=1
    nt.links.new(tx.outputs['Color'],bs.inputs['Base Color']); nt.links.new(bs.outputs['BSDF'],out.inputs['Surface'])
    mat.name=o.name+'Mat'
bpy.ops.wm.save_as_mainfile(filepath='/tmp/ch/out/stage4.blend')
bpy.ops.object.select_all(action='DESELECT')
for n in ['Rig','Body','Shirt','Hair']: bpy.data.objects[n].select_set(True)
bpy.ops.export_scene.gltf(filepath='/tmp/ch/out/hero_m.glb', use_selection=True, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=85,
  export_animations=True, export_animation_mode='ACTIONS', export_skins=True, export_morph=True, export_morph_normal=False, export_def_bones=False, export_apply=False, export_yup=True)
import os; print('size',os.path.getsize('/tmp/ch/out/hero_m.glb'))
