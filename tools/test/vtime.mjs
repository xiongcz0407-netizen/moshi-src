/* 虚拟时间：页面的 requestAnimationFrame / performance.now 换成手动推（__vtStart() 开始，__pump(毫秒) 推一帧），截图、测数不受机器快慢影响。
   场景脚本里写 export { pre } from './vtime.mjs' 就带上 */
export async function pre(pg) {
  await pg.context().addInitScript(() => {
    const rn = performance.now.bind(performance), oraf = window.requestAnimationFrame.bind(window); let q = [];
    window.__vt = { on: false, t: 0 }; window.__fogQ = 1;
    window.requestAnimationFrame = cb => { if (!__vt.on) return oraf(cb); q.push(cb); return q.length };
    performance.now = () => __vt.on ? __vt.t : rn();
    window.__vtStart = () => { __vt.t = rn(); __vt.on = true };
    window.__pump = step => { __vt.t += step; const c = q; q = []; for (const f of c) f(__vt.t) };
  });
}
