// 设计 18h：人物检查截图（在游戏里用游戏的材质渲染，正交相机、中灰背景）
// 用法：node shots.mjs <游戏地址，例如 http://localhost:8765/?debug> <输出文件夹> [m|f]（设计 18v：男女各一组，默认搭配按男女）
// 出 01～09、12、13 的单张，10、11 的分图（compose.py 拼成一张），14 游戏里中远景
import { chromium } from 'playwright';
import fs from 'fs';
const [, , URL, OUT, SEX = 'm'] = process.argv;
fs.mkdirSync(OUT, { recursive: true });
const br = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await br.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { if (!sessionStorage.getItem('x')) { localStorage.clear(); sessionStorage.setItem('x', 1) } });
const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
const E = (f, a) => pg.evaluate(f, a);
await pg.goto(URL); await pg.waitForSelector('#creator .cbox', { timeout: 180000 });
if (SEX === 'f') { await pg.tap('[data-ck="sex"][data-cv="f"]'); await pg.waitForTimeout(800) }   // 女：点「女」= 女发型1 + 粉套装
await pg.waitForTimeout(2500); await pg.screenshot({ path: `${OUT}/18_创建人物页.png` });   // 设计 18l：展示用人物站姿，两只手都看得见
await pg.tap('[data-ck="done"]'); await pg.waitForTimeout(6000);
await E(() => __g.go(-20.5, 6.2)); await pg.waitForTimeout(2500);
// 14 游戏里：真游戏、正常玩的视角（游戏自己的相机、灯光、界面），手机横屏大小；按 S 往镜头这边走一小段再停下，人面朝镜头
await pg.keyboard.down('KeyS'); await pg.waitForTimeout(700); await pg.keyboard.up('KeyS'); await pg.waitForTimeout(1500);
await pg.screenshot({ path: `${OUT}/14_游戏里.png` });
await E(() => __g.UI.openPanel('hero')); await pg.waitForTimeout(2500); await pg.screenshot({ path: `${OUT}/19_角色面板.png` }); await E(() => __g.UI.closePanel()); await pg.waitForTimeout(500);
// 准备：只拍主角（相机只看第 7 层：主角 + 灯），中灰背景，不要雾
await E(() => {
  const g = __g, T = g.THREE, sc = g.W.scene;
  window.__hid = []; for (const o of sc.children) if (o !== g.player && !o.isLight) { if (o.visible) { o.visible = false; window.__hid.push(o) } }
  window.__bg = sc.background; window.__fog = sc.fog; sc.background = new T.Color(0x808080); sc.fog = null;
  const R = g.W.renderer; R.setPixelRatio(1); R.setSize(1024, 1024, false);
});
const H2 = 2.0;   // 主角身高（游戏单位）
const shot = async (file, js) => {
  const d = await E(new Function(`const g=__g, T=g.THREE, R=g.W.renderer, P=g.player.position, u=g.player.userData;
    const ortho=(cx,cy,cz,tx,ty,tz,half)=>{ const c=new T.OrthographicCamera(-half,half,half,-half,0.01,100); c.position.set(P.x+cx,cy,P.z+cz); c.lookAt(P.x+tx,ty,P.z+tz); return c };
    const apose=()=>{ for (const k in u.acts) u.acts[k].setEffectiveWeight(0); u.mixer.update(0); g.player.updateMatrixWorld(true) };
    const at=(clip,ph)=>{ for (const k in u.acts) u.acts[k].setEffectiveWeight(k===clip?1:0); const a=u.acts[clip]; a.time=ph*a.getClip().duration; u.mixer.update(0); g.player.updateMatrixWorld(true) };
    ${js}
    g.player.traverse(o=>o.layers.enable(7)); g.W.scene.traverse(o=>{ if (o.isLight) o.layers.enable(7) }); cam.layers.set(7);
    R.shadowMap.needsUpdate=true; R.render(g.W.scene, cam); return R.domElement.toDataURL('image/png')`));
  fs.writeFileSync(`${OUT}/${file}`, Buffer.from(d.split(',')[1], 'base64'));
};
const FULL = H2 / 2 / 0.9, HEAD = 0.40, HY = 1.68;   // 设计 18v：头约占全身 30%（下巴 1.40、头顶 2.0）；双马尾往两边伸，头的画面放宽一点
const base = (lk = '{}') => `g.setLook(g.player,{...g.S.look,hc:2,...${lk}},g.LOOK); g.player.rotation.y=0; apose();`;   // g.S.look 已经是这一组（男 / 女）的默认搭配
await shot('01_全身_正面.png', `${base()} const cam=ortho(0,1,10, 0,1,0, ${FULL});`);
await shot('02_全身_侧面.png', `${base()} const cam=ortho(10,1,0, 0,1,0, ${FULL});`);
await shot('03_全身_背面.png', `${base()} const cam=ortho(0,1,-10, 0,1,0, ${FULL});`);
await shot('04_全身_斜前.png', `${base()} const cam=ortho(7,3.5,7, 0,1,0, ${FULL});`);
await shot('05_头_正面.png', `${base()} const cam=ortho(0,${HY},10, 0,${HY},0, ${HEAD});`);
await shot('06_头_侧面.png', `${base()} const cam=ortho(10,${HY},0, 0,${HY},0, ${HEAD});`);
await shot('07_头_背面.png', `${base()} const cam=ortho(0,${HY},-10, 0,${HY},0, ${HEAD});`);
await shot('08_头_头顶.png', `${base()} const cam=ortho(0,12,0.001, 0,${HY},0, ${HEAD}); cam.up.set(0,0,-1); cam.lookAt(P.x,${HY},P.z);`);
await shot('09_头_斜上.png', `${base()} const cam=ortho(${7.07 * 0.866},${HY + 5},${7.07 * 0.866}, 0,${HY},0, ${HEAD});`);
for (const [i, lk] of [[1, '{hc:0}'], [2, '{hc:1}'], [3, '{hc:5}'], [4, '{hc:8}']]) await shot(`10_发色_${i}.png`, `${base(lk)} const cam=ortho(0,${HY},10, 0,${HY},0, ${HEAD});`);
// 11 套装：所有套装并排（设计 18q）
const OUTS = await E(s => Object.entries(__g.player.userData.alt.n.outfits).filter(([, m]) => !m.userData.sex || m.userData.sex === s).map(([k]) => k), SEX);   // 设计 18x：只放同性别的
for (let i = 0; i < OUTS.length; i++) await shot(`11_套装_${i + 1}.png`, `${base(`{outfit:'${OUTS[i]}'}`)} const cam=ortho(0,1,10, 0,1,0, ${FULL});`);
// 16 发型 × 套装：每颗发型头配每一套，并排
const HS = await E(s => Object.entries(__g.player.userData.alt.n.hairs).filter(([, m]) => !m.userData.sex || m.userData.sex === s).map(([k]) => k), SEX); let n16 = 0;
for (const h of HS) for (const o of OUTS) await shot(`16_发型x套装_${++n16}.png`, `${base(`{hs:'${h}',outfit:'${o}'}`)} const cam=ortho(0,1,10, 0,1,0, ${FULL});`);
for (const [clip, n] of [['walk', '12_走路'], ['run', '13_跑步']]) for (let k = 0; k < 4; k++)
  await shot(`${n}_${k + 1}.png`, `${base()} at('${clip}', ${k / 4}); const cam=ortho(10,1,0, 0,1,0, ${FULL});`);
await shot('18_待机_正面.png', `${base()} at('idle', 0.25); const cam=ortho(0,1,10, 0,1,0, ${FULL});`);   // 设计 18l：待机站姿，手垂在两侧、离身体留空隙
// 18z：跑 / 走一圈 8 帧侧面，左手、左腿临时涂成红色（沿骨头画红色粗条，盖在最上面），一眼看是不是对侧配合
const RED = `if (window.__red) { window.__red.forEach(m => m.removeFromParent()); } window.__red = [];
  const B = u.bones, W = n => B[n].getWorldPosition(new T.Vector3()), mat = new T.MeshBasicMaterial({ color: 0xff2020, depthTest: false, transparent: true, opacity: 0.85 });
  const seg = (a, b, r) => { const d = new T.Vector3().subVectors(b, a), L = d.length(), m = new T.Mesh(new T.CylinderGeometry(r, r, L, 10), mat);
    m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); m.renderOrder = 99; m.layers.enable(7); g.W.scene.add(m); window.__red.push(m) };
  g.player.updateMatrixWorld(true);
  const sh = W('LeftArm'), el = W('LeftForeArm'), wr = W('LeftHand'), tip = wr.clone().addScaledVector(new T.Vector3().subVectors(wr, el).normalize(), 0.13);
  const hp = W('LeftUpLeg'), kn = W('LeftLeg'), an = W('LeftFoot'), toe = an.clone().add(new T.Vector3(0, -0.12, 0.2).applyQuaternion(g.player.getWorldQuaternion(new T.Quaternion())));
  seg(sh, el, 0.05); seg(el, wr, 0.045); seg(wr, tip, 0.05); seg(hp, kn, 0.07); seg(kn, an, 0.06); seg(an, toe, 0.05);`;
const UNRED = `if (window.__red) { window.__red.forEach(m => m.removeFromParent()); window.__red = [] }`;
for (const [clip, n] of [['run', '20_跑步_左侧红'], ['walk', '21_走路_左侧红']]) for (let k = 0; k < 8; k++)
  await shot(`${n}_${k + 1}.png`, `${base()} at('${clip}', ${k / 8}); ${RED} const cam=ortho(10,1,0, 0,1,0, ${FULL});`);
await E(new Function(UNRED));
for (let k = 0; k < 4; k++) await shot(`15_跑步_正面_${k + 1}.png`, `${base()} at('run', ${k / 4}); const cam=ortho(0,1,10, 0,1,0, ${FULL});`);   // 设计 18m：正面看手臂、腿有没有穿进身体
console.log(errs.join('|') || 'ok'); await br.close();
