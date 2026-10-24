import bpy, sys, math, json, os
from mathutils import Vector, Matrix
sys.path.insert(0,'/home/claude/fb2/rig')
import importlib, anim; importlib.reload(anim)
from anim import ACT, ORDER, FPS, CH, D
ONLY=os.environ.get('ONLY','').split(',') if os.environ.get('ONLY') else ORDER
bpy.ops.wm.open_mainfile(filepath='/home/claude/fb2/rig/rigged.blend')
A=bpy.data.objects['Rig']; bpy.context.scene.render.fps=30
PB=A.pose.bones; MR={b.name:b.bone.matrix_local.to_3x3() for b in PB}
for b in PB: b.rotation_mode='QUATERNION'
def E(e):
    x,y,z=e; return Matrix.Rotation(D(z),3,'Z')@Matrix.Rotation(D(x),3,'X')@Matrix.Rotation(D(y),3,'Y')
def setrel(n,R):
    M=MR[n]; PB[n].rotation_quaternion=(M.inverted()@R@M).to_quaternion()
meta={}
if A.animation_data is None: A.animation_data_create()
start=1
for name in ONLY:
    ac=ACT[name]; T=ac['T']; n=int(round(T*FPS))+(0 if ac['loop'] else 1)
    act=bpy.data.actions.new(name); A.animation_data.action=act
    for i in range(n):
        p={c:(0,0,0) for c in CH}; p.update(ac['f'](i/FPS)); fr=start+i
        PB['Hips'].location=MR['Hips'].inverted()@Vector(p['root']); PB['Hips'].keyframe_insert('location',frame=fr)
        for c in CH:
            if c!='root': setrel(c,E(p[c]))
        for b in PB: b.keyframe_insert('rotation_quaternion',frame=fr)
    meta[name]=dict(T=T,loop=ac['loop'],**{k:ac[k] for k in ('hit',) if k in ac})
    tr=A.animation_data.nla_tracks.new(); tr.name=name
    st=tr.strips.new(name,start,act); st.extrapolation='NOTHING'; A.animation_data.action=None
    start+=n+10
json.dump(meta,open('/home/claude/fb2/rig/meta.json','w'),indent=1)
bpy.ops.wm.save_as_mainfile(filepath='/home/claude/fb2/rig/animated.blend')
print(json.dumps(meta))
