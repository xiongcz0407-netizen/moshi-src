import bpy, sys, json, os, math
from mathutils import Vector
from PIL import Image, ImageDraw
bpy.ops.wm.open_mainfile(filepath='/home/claude/fb/rig/animated.blend')
meta=json.load(open('/home/claude/fb/rig/meta.json'))
sc=bpy.context.scene; sc.render.engine='BLENDER_WORKBENCH'; sc.display.shading.color_type='TEXTURE'
sc.display.shading.light='STUDIO'
R=int(os.environ.get('R','300')); sc.render.resolution_x=R; sc.render.resolution_y=R
cam=bpy.data.objects.new('c',bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera=cam; cam.data.type='ORTHO'; cam.data.ortho_scale=float(os.environ.get('OS','1.25'))
VIEW=os.environ.get('VIEW','q')
ctr=Vector((0.0,-0.12,0.45))
d={'q':Vector((-0.7,-1,0.45)),'s':Vector((1,0,0.05)),'f':Vector((0,-1,0.1))}[VIEW].normalized()
cam.location=ctr+d*4; cam.rotation_euler=(-d).to_track_quat('-Z','Y').to_euler()
# 地面
bpy.ops.mesh.primitive_plane_add(size=3,location=(0,0,0))
acts=os.environ.get('ACTS','').split(',')
NF=int(os.environ.get('NF','8'))
rows=[]
for a in acts:
    m=meta[a]; fr=[m['start']+round(i*(m['n']-1)/(NF-1)) for i in range(NF)]
    if os.environ.get('FR_'+a): fr=[m['start']+int(x) for x in os.environ['FR_'+a].split(',')]
    ims=[]
    for f in fr:
        sc.frame_set(f); p=f'/tmp/pv_{f}.png'; sc.render.filepath=p; bpy.ops.render.render(write_still=True)
        im=Image.open(p).convert('RGB'); ImageDraw.Draw(im).text((5,5),f'{a} {(f-m["start"])/30:.2f}s',fill=(255,0,0)); ims.append(im)
    rows.append(ims)
W=max(len(r) for r in rows)
sheet=Image.new('RGB',(W*R,len(rows)*R),'white')
for j,r in enumerate(rows):
    for i,im in enumerate(r): sheet.paste(im,(i*R,j*R))
out=os.environ.get('OUT','/tmp/sheet.jpg'); sheet.save(out,quality=85); print('ok',out)
