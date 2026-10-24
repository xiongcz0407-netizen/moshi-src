import bpy
bpy.ops.wm.open_mainfile(filepath='/home/claude/fb/rig/animated.blend')
A=bpy.data.objects['Rig']; A.animation_data.action=None
bpy.ops.export_scene.gltf(filepath='/home/claude/fb/out/butcher_raw.glb', export_format='GLB', export_animation_mode='NLA_TRACKS',
  export_force_sampling=True, export_frame_step=1, export_image_format='JPEG', export_jpeg_quality=82, export_skins=True, export_def_bones=True,
  export_anim_slide_to_zero=True, export_optimize_animation_size=True, export_morph=False, export_apply=False)
print('done')
