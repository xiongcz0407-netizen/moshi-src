/* ================= 摇杆 =================
   左半屏任意位置按下就出现摇杆，拖动控制方向；电脑上也可以用 WASD / 方向键。 */
export const joy = { x: 0, y: 0, active: false };
const keys = new Set();

export function initInput(root) {
  const base = document.createElement('div'); base.className = 'joy';
  const knob = document.createElement('div'); knob.className = 'knob'; base.appendChild(knob);
  root.appendChild(base);
  let id = null, ox = 0, oy = 0; const R = 56;
  const zone = document.getElementById('joyzone');
  zone.addEventListener('pointerdown', e => {
    if (id !== null) return; id = e.pointerId; ox = e.clientX; oy = e.clientY;
    base.style.left = ox + 'px'; base.style.top = oy + 'px'; base.classList.add('on');
    knob.style.transform = 'translate(-50%,-50%)'; joy.active = true;
    zone.setPointerCapture(id); e.preventDefault();
  });
  const move = e => {
    if (e.pointerId !== id) return;
    let dx = e.clientX - ox, dy = e.clientY - oy; const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d }
    knob.style.transform = `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`;
    const m = Math.min(1, d / (R * 0.45)), a = Math.atan2(dy, dx);   // 推出去一点点就是全速，不会因为手指没推到底而时快时慢
    joy.x = d > 6 ? Math.cos(a) * m : 0; joy.y = d > 6 ? Math.sin(a) * m : 0;
  };
  zone.addEventListener('pointermove', move);

  const end = e => { if (e.pointerId !== id) return; id = null; joy.x = joy.y = 0; joy.active = false; base.classList.remove('on') };
  /* 设计 79：多根手指时只认按下摇杆的那根；别的手指按下 / 抬起不影响。抓手指（pointer capture）被系统收走时不清零：
     改在整个页面上接着认这根手指的移动和抬起（iPhone 一手推摇杆、一手按翻滚时，以前摇杆会被清零，翻滚就往后滚） */
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
  document.addEventListener('pointermove', e => { if (e.pointerId === id && e.target !== zone && !zone.hasPointerCapture(id)) move(e) });
  document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
  /* 切到后台再回来：摇杆复位，免得主角自己一直走 */
  document.addEventListener('visibilitychange', () => { id = null; joy.x = joy.y = 0; joy.active = false; base.classList.remove('on'); keys.clear() });
  addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; keys.add(e.key.toLowerCase()) });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
}
/* 返回移动方向（屏幕坐标：x 右，y 下），长度 0~1 */
export function moveDir() {
  if (joy.active) return { x: joy.x, y: joy.y };
  let x = 0, y = 0;
  if (keys.has('a') || keys.has('arrowleft')) x--; if (keys.has('d') || keys.has('arrowright')) x++;
  if (keys.has('w') || keys.has('arrowup')) y--; if (keys.has('s') || keys.has('arrowdown')) y++;
  const d = Math.hypot(x, y); return d ? { x: x / d, y: y / d } : { x: 0, y: 0 };
}
