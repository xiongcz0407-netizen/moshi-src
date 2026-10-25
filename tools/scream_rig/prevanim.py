import bpy, sys, os
import os as _os; RD=_os.environ.get('RD','/home/claude/fb4/rig'); SRC=_os.environ.get('SRC','/home/claude/fb4/src/BOSS_尖啸者.glb')
from mathutils import Vector
sys.path.insert(0,_os.path.dirname(_os.path.abspath(__file__))); from anim import ACT, ORDER, FPS
SH=[x.split(':') for x in os.environ['SHOTS'].split(',')]; VIEW=os.environ.get('VIEW','0.35,-1,0.45')
bpy.ops.wm.open_mainfile(filepath=RD+'/animated.blend')
A=bpy.data.objects['Rig']
for tr in A.animation_data.nla_tracks: tr.mute=True
sc=bpy.context.scene; sc.render.engine='BLENDER_WORKBENCH'; sc.display.shading.light='STUDIO'; sc.display.shading.color_type='TEXTURE'
sc.render.resolution_x=300; sc.render.resolution_y=360
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera=cam
cam.data.type='ORTHO'; cam.data.ortho_scale=float(os.environ.get('ORTHO','1.4'))
d=Vector([float(x) for x in VIEW.split(',')]).normalized(); cam.location=Vector((0,0,float(os.environ.get('CZ','0.6'))))+d*3; cam.rotation_euler=(-d).to_track_quat('-Z','Y').to_euler()
ST={}; st=1
for nm in ORDER:
    ac=ACT[nm]; n=int(round(ac['T']*FPS))+(0 if ac['loop'] else 1); ST[nm]=st; st+=n+10
for i,(nm,t) in enumerate(SH):
    ac=bpy.data.actions[nm]; A.animation_data.action=ac
    if hasattr(ac,'slots') and len(ac.slots): A.animation_data.action_slot=ac.slots[0]
    sc.frame_set(ST[nm]+int(round(float(t)*FPS)))
    sc.render.filepath=RD+f'/pa_{i:02d}.png'; bpy.ops.render.render(write_still=True)
