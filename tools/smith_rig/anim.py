"""设计 107：铁匠 3 个动作（idle 待机敲铁砧循环、wipe 擦汗、wave 挥手招呼），推进 NLA，导出 GLB。
角度（度）用骨头自己的轴，X / Y / Z 各转多少；关键帧之间平滑插值。环境变量 IN=.blend OUT=.glb TEST=1 只导出轴测试"""
import bpy, os, math
IN = os.environ.get('IN', '/tmp/smith_rigged.blend'); OUT = os.environ.get('OUT', '/tmp/smith_raw.glb'); FPS = 30
bpy.ops.wm.open_mainfile(filepath=IN)
A = bpy.data.objects['Rig']; sc = bpy.context.scene; sc.render.fps = FPS
for pb in A.pose.bones: pb.rotation_mode = 'XYZ'
D = math.radians
BASE = {'Spine': (4, 0, 0), 'R_Arm': (0, 0, 0), 'L_Arm': (0, 0, 0)}

def make(name, dur, keys, loop=True):
    """keys: [(秒, {骨: (x,y,z)})]，没写的骨头 = BASE / 0；loop 时最后一帧补成第一帧"""
    act = bpy.data.actions.new(name); A.animation_data_create(); A.animation_data.action = act
    bones = set(BASE) | {b for _, p in keys for b in p}
    if loop: keys = keys + [(dur, keys[0][1])]
    for t, p in keys:
        f = round(t * FPS) + 1
        for b in bones:
            v = p.get(b, BASE.get(b, (0, 0, 0))); pb = A.pose.bones[b]
            pb.rotation_euler = (D(v[0]), D(v[1]), D(v[2])); pb.keyframe_insert('rotation_euler', frame=f)
    for fc in getattr(act, 'fcurves', []):
        for kp in fc.keyframe_points: kp.interpolation = 'BEZIER'; kp.easing = 'AUTO'
    tr = A.animation_data.nla_tracks.new(); tr.name = name; st = tr.strips.new(name, 1, act); st.name = name
    A.animation_data.action = None
    for pb in A.pose.bones: pb.rotation_euler = (0, 0, 0)

if os.environ.get('TEST'):
    make('ax', 1, [(0, {'R_Arm': (60, 0, 0), 'L_Arm': (0, 60, 0), 'Head': (0, 0, 40), 'R_ForeArm': (0, 0, 0), 'Spine': (20, 0, 0)})], loop=False)
else:
    import pathlib; exec(pathlib.Path(os.environ.get('POSES', 'tools/smith_rig/poses.py')).read_text())
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_frame_step=1,
  export_image_format='JPEG', export_jpeg_quality=82, export_skins=True, export_def_bones=True, export_anim_slide_to_zero=True,
  export_optimize_animation_size=True, export_morph=False, export_apply=False)
print('done', OUT)
