import bpy, sys, math, json, os
from mathutils import Vector, Matrix
sys.path.insert(0,'/home/claude/fb3/rig')
import importlib, anim; importlib.reload(anim)
from anim import ACT, ORDER, FPS, CH, D
ONLY=os.environ.get('ONLY','').split(',') if os.environ.get('ONLY') else ORDER
bpy.ops.wm.open_mainfile(filepath='/home/claude/fb3/rig/rigged.blend')
A=bpy.data.objects['Rig']; B=bpy.data.objects['Golem']; bpy.context.scene.render.fps=30; bpy.context.scene.render.fps_base=1
PB=A.pose.bones; MR={b.name:b.bone.matrix_local.to_3x3() for b in PB}
for b in PB: b.rotation_mode='QUATERNION'
def E(e):
    x,y,z=e; return Matrix.Rotation(D(z),3,'Z')@Matrix.Rotation(D(x),3,'X')@Matrix.Rotation(D(y),3,'Y')
def setrel(n,R):
    M=MR[n]; PB[n].rotation_quaternion=(M.inverted()@R@M).to_quaternion()
H0=Vector(anim.J['Hips'][0])
def leg(side,Rh,root,tgt):
    up,lo,ft=side+'_UpLeg',side+'_Leg',side+'_Foot'
    h=Vector(anim.J[up][0]); k=Vector(anim.J[lo][0]); a=Vector(anim.J[ft][0])
    hip=H0+Vector(root)+Rh@(h-H0)
    tv=k-h; sv=a-k
    l1=math.hypot(tv.y,tv.z); l2=math.hypot(sv.y,sv.z)
    a1=math.atan2(tv.y,-tv.z); a2=math.atan2(sv.y,-sv.z)
    x,y,z,pitch=tgt
    dy=y-hip.y; dz=z-hip.z; L=math.hypot(dy,dz); L=min(L,l1+l2-1e-4); L=max(L,abs(l1-l2)+1e-3)
    beta=math.atan2(dy,-dz)
    al=math.acos(max(-1,min(1,(l1*l1+L*L-l2*l2)/(2*l1*L))))
    th1=beta-al   # 膝盖朝前（-Y）
    kn=(math.sin(th1)*l1, -math.cos(th1)*l1)
    th2=math.atan2(dy-kn[0], -(dz-kn[1]))
    Rt=Matrix.Rotation(th1-a1,3,'X'); Rs=Matrix.Rotation(th2-a2,3,'X'); Rf=Matrix.Rotation(D(pitch),3,'X')
    setrel(up,Rh.inverted()@Rt); setrel(lo,Rt.inverted()@Rs); setrel(ft,Rs.inverted()@Rf)
class Spring:
    def __init__(s,w,z): s.w=w; s.z=z; s.x=None; s.v=0
    def step(s,tgt,dt):
        if s.x is None: s.x=tgt
        n=8; h=dt/n
        for _ in range(n):
            a=s.w*s.w*(tgt-s.x)-2*s.z*s.w*s.v; s.v+=a*h; s.x+=s.v*h
        return s.x
def secondary(frames,dt,loop,still=()):
    """石拳（右手）用弹簧跟：比身体晚一点到位，停下来晃一下；头也轻轻跟一下"""
    KS={'R_Arm':(10.5,0.36),'R_ForeArm':(12,0.34),'R_Hand':(13,0.3),'R_Shoulder':(12,0.4)}
    sp={(c,i):Spring(*KS[c]) for c in KS for i in range(3)}
    hsp=[Spring(14,0.42) for _ in range(2)]
    reps=3 if loop else 1; out=None
    for r in range(reps):
        res=[]
        for p in frames:
            q=dict(p)
            for c in KS:
                q[c]=tuple(sp[(c,i)].step(p[c][i],dt) for i in range(3))
            hs=p['Chest'][0]+p['Spine'][0]+p['Hips'][0]; hz=p['Chest'][2]+p['Spine'][2]+p['Hips'][2]
            hx_=hsp[0].step(hs,dt); hz_=hsp[1].step(hz,dt); cl=lambda v,m: max(-m,min(m,v))
            q['Head']=(p['Head'][0]+cl((hx_-hs)*0.45,10), p['Head'][1], p['Head'][2]+cl((hz_-hz)*0.4,8))
            res.append(q)
        out=res
    return out
meta={}
if A.animation_data is None: A.animation_data_create()
start=1
for name in ONLY:
    ac=ACT[name]; T=ac['T']; n=int(round(T*FPS))+ (0 if ac['loop'] else 1)
    prim=[];feet=[]
    for i in range(n):
        p,f=ac['f'](i/FPS)
        full={c:anim.BASE.get(c,(0,0,0)) for c in CH}; full.update(p); prim.append(full); feet.append(f)
    sec=secondary(prim,1/FPS,ac['loop'],ac.get('still',()))
    act=bpy.data.actions.new(name); A.animation_data.action=act
    for i,(p,f) in enumerate(zip(sec,feet)):
        fr=start+i
        r=p['root']; PB['Hips'].location=MR['Hips'].inverted()@Vector(r)
        PB['Hips'].keyframe_insert('location',frame=fr)
        Rh=E(p['Hips']); setrel('Hips',Rh)
        for c in CH:
            if c in ('root','Hips'): continue
            setrel(c,E(p[c]))
        for s in ('L','R'): leg(s,Rh,r,f[s])
        for b in PB: b.keyframe_insert('rotation_quaternion',frame=fr)
    if ac['loop']:  # 循环：最后补一帧 = 第一帧
        pass
    meta[name]=dict(T=T,loop=ac['loop'],start=start,n=n,**{k:ac[k] for k in ('hit','warn','speed','shake') if k in ac})
    tr=A.animation_data.nla_tracks.new(); tr.name=name
    st=tr.strips.new(name,start,act); st.extrapolation='NOTHING'; A.animation_data.action=None
    start+=n+10
json.dump(meta,open('/home/claude/fb3/rig/meta.json','w'),indent=1)
bpy.ops.wm.save_as_mainfile(filepath='/home/claude/fb3/rig/animated.blend')
print(json.dumps(meta))
