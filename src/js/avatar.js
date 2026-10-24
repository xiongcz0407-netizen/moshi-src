/* ================= 2D 头像（Kenney Modular Characters，CC0） =================
   部件在 img/avatar.png 图集里（tools/avatar_atlas.py 生成），这里按选好的外观拼成一张半身像。 */
import ATLAS from './avatar_atlas.json';
import { LOOK, FIXED } from './look.js';
import { A } from './assets.js';

let img = null, loading = null;
export function loadAvatar(src = 'img/avatar.png') {
  if (!loading) loading = new Promise(r => { const i = new Image(); i.onload = () => { img = i; r(true) }; i.onerror = () => r(false); i.src = A(src) });
  return loading;
}
/* 原图（缩小前）的排版：画布 260×320，头的中心 x=130 */
const K = 0.8, Lay = { head: 40, eyeY: 88, eyeDX: 30, browY: 66, noseY: 104, mouthY: 126, hairDY: -28, neck: 190, shirt: 212 };
export function drawAvatar(cv, look, { bg = null, crop = 'bust' } = {}) {
  const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, cv.width, cv.height) }
  if (!img || !look) return;
  look = { skin: 1, hair: 1, shirt: 0, pants: 0, ...look, ...FIXED };   // 设计 18v 以后存档里没有肤色 / 上衣这些了（只有新模型读不到时才画这个 2D 头像）                  // 老存档里选过的发型/眼睛/款式不再用，和 3D 保持一致
  /* 半身像：取原排版里 x 0~260、y 0~300 这一块，缩放到画布 */
  const src = crop === 'head' ? { x: 20, y: 0, w: 220, h: 230 } : { x: 0, y: 0, w: 260, h: 300 };
  const s = Math.min(cv.width / src.w, cv.height / src.h), ox = (cv.width - src.w * s) / 2 - src.x * s, oy = (cv.height - src.h * s) / 2 - src.y * s;
  const put = (name, cx, y, mid, flip) => { const r = ATLAS[name]; if (!r) return; const w = r[2] / K * s, h = r[3] / K * s, x = ox + cx * s - w / 2, yy = oy + y * s - (mid ? h / 2 : 0);
    if (flip) { g.save(); g.translate(x + w, yy); g.scale(-1, 1); g.drawImage(img, r[0], r[1], r[2], r[3], 0, 0, w, h); g.restore() } else g.drawImage(img, r[0], r[1], r[2], r[3], x, yy, w, h) };
  const t = LOOK.skin[look.skin].t, hc = LOOK.hair[look.hair].c, sc = LOOK.shirt[look.shirt].c, hd = Lay.head;
  put(sc === 'yellow' ? `shirtYellow${look.shirtStyle}` : `${sc}Shirt${look.shirtStyle}`, 130, Lay.shirt);
  put(`tint${t}_neck`, 130, Lay.neck); put(`tint${t}_head`, 130, hd);
  const eye = `eye${LOOK.eyes[look.eye]}_large`; put(eye, 130 - Lay.eyeDX, hd + Lay.eyeY, 1); put(eye, 130 + Lay.eyeDX, hd + Lay.eyeY, 1);
  put(`${hc}Brow1`, 130 - Lay.eyeDX, hd + Lay.browY, 1); put(`${hc}Brow1`, 130 + Lay.eyeDX, hd + Lay.browY, 1, true);
  put(`tint${t}Nose1`, 130, hd + Lay.noseY, 1); put(`mouth_${LOOK.mouth[look.mouth || 0]}`, 130, hd + Lay.mouthY, 1);
  put(`${hc}${look.sex === 'f' ? 'Woman' : 'Man'}${look.style}`, 130, hd + Lay.hairDY);
}
