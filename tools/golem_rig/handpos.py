import bpy, sys, os, json
sys.path.insert(0,'/home/claude/fb3/rig'); from anim import ACT, ORDER, FPS
bpy.ops.wm.open_mainfile(filepath='/home/claude/fb3/rig/animated.blend')
A=bpy.data.objects['Rig']
for tr in A.animation_data.nla_tracks: tr.mute=True
ST={}; st=1
for nm in ORDER:
    ac=ACT[nm]; n=int(round(ac['T']*FPS))+(0 if ac['loop'] else 1); ST[nm]=st; st+=n+10
sc=bpy.context.scene
for x in os.environ['SHOTS'].split(','):
    nm,t=x.split(':'); ac=bpy.data.actions[nm]; A.animation_data.action=ac
    if hasattr(ac,'slots') and len(ac.slots): A.animation_data.action_slot=ac.slots[0]
    sc.frame_set(ST[nm]+int(round(float(t)*FPS)))
    out=[]
    for b in ['R_Hand','L_Hand','Head']:
        pb=A.pose.bones[b]; p=A.matrix_world@pb.tail; out.append(f"{b} ({p.x:.2f},{p.y:.2f},{p.z:.2f})")
    print('POS',nm,t,' '.join(out))
