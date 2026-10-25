import bpy
import os as _os; RD=_os.environ.get('RD','/home/claude/fb5/rig'); SRC=_os.environ.get('SRC','/home/claude/fb5/src/BOSS_装甲暴君.glb')
bpy.ops.wm.open_mainfile(filepath=RD+'/animated.blend')
A=bpy.data.objects['Rig']; A.animation_data.action=None
bpy.ops.export_scene.gltf(filepath=RD+'/tyrant_raw.glb', export_format='GLB', export_animation_mode='NLA_TRACKS',
  export_force_sampling=True, export_frame_step=1, export_image_format='JPEG', export_jpeg_quality=82, export_skins=True, export_def_bones=True,
  export_anim_slide_to_zero=True, export_optimize_animation_size=True, export_morph=False, export_apply=False)
print('done')
