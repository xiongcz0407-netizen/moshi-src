from PIL import Image
import numpy as np, json
from scipy import ndimage
def c2a(arr):
    a=np.clip((1-arr.min(-1))*1.15,0,1); rgb=np.where(a[...,None]>0.01,(arr-(1-a[...,None]))/np.maximum(a[...,None],0.01),0); return np.clip(rgb,0,1),a
def crop(rgba,pad=4):
    ys,xs=np.nonzero(rgba[...,3]>0.03)
    y0,y1,x0,x1=max(0,ys.min()-pad),ys.max()+pad,max(0,xs.min()-pad),xs.max()+pad; return rgba[y0:y1+1,x0:x1+1]
def eye_piece(arr):
    rgb,a=c2a(arr); dark=arr.min(-1)<0.55
    # 眼睛轮廓：深色线条闭合后填满 = 眼睛里面（眼白保留）
    from skimage.morphology import convex_hull_image, remove_small_objects
    d2=remove_small_objects(dark,40)
    hull=convex_hull_image(d2) if d2.any() else dark
    hull=ndimage.binary_erosion(hull,iterations=2)
    a=np.where(hull,1.0,a); rgb=np.where(hull[...,None],arr,rgb); return np.dstack([rgb,a])
sprites={}
E=np.asarray(Image.open('eyes.jpg').convert('RGB')).astype(float)/255
cw,ch=1408/4,768/2
names_open=['round','calm','sharp','sleepy']; names_ex=['happy','closed','blink','wide']
for r in range(2):
    for c in range(4):
        cell=E[int(r*ch)+8:int(r*ch+ch*0.70),int(c*cw)+8:int((c+1)*cw)-8]
        nm=(names_open if r==0 else names_ex)[c]; mid=cell.shape[1]//2
        for side,part in (('R',cell[:,:mid]),('L',cell[:,mid:])):
            sprites[f'eye_{nm}_{side}']=crop(eye_piece(part) if nm not in ('happy','closed') else np.dstack(c2a(part)))
Bm=np.asarray(Image.open('brows.jpg').convert('RGB')).astype(float)/255
cw,ch=1408/4,768/3
rows=[['brow_flat','brow_up','brow_soft','brow_worry'],['mouth_smile','mouth_grin','mouth_o','mouth_flat'],['deco_blush','deco_freckle','deco_bandage','deco_dirt']]
for r in range(3):
    for c in range(4):
        cell=Bm[int(r*ch)+4:int((r+1)*ch)-4,int(c*cw)+4:int((c+1)*cw)-4]; nm=rows[r][c]
        rgb,a=c2a(cell)
        if nm in ('mouth_grin','mouth_o','deco_bandage'):
            dark=cell.min(-1)<0.6; hull=ndimage.binary_fill_holes(ndimage.binary_closing(dark,iterations=4)); a=np.where(hull,1.0,a); rgb=np.where(hull[...,None],cell,rgb)
        if nm.startswith('brow') or nm=='deco_blush':
            mid=cell.shape[1]//2
            for side,sl in (('R',slice(0,mid)),('L',slice(mid,None))): sprites[f'{nm}_{side}']=crop(np.dstack([rgb[:,sl],a[:,sl]]))
        else: sprites[nm]=crop(np.dstack([rgb,a]))
items=sorted(sprites.items(),key=lambda kv:-kv[1].shape[0]); W=1024; x=y=rowh=0; rects={}
for k,im in items:
    h,w=im.shape[:2]
    if x+w>W: x=0; y+=rowh+2; rowh=0
    rects[k]=[x,y,w,h]; x+=w+2; rowh=max(rowh,h)
H=y+rowh+2; atlas=np.zeros((H,W,4))
for k,(x,y,w,h) in rects.items(): atlas[y:y+h,x:x+w]=sprites[k]
Image.fromarray((atlas*255).astype(np.uint8),'RGBA').save('out/face_atlas.png'); json.dump(rects,open('out/face_atlas.json','w'))
bg=Image.new('RGBA',(W,H),(120,160,200,255)); bg.alpha_composite(Image.open('out/face_atlas.png')); bg.convert('RGB').save('/tmp/c2/atlas_view.png')
