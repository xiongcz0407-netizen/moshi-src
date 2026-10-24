/* ================= 设计 85 第 6.4 条：角色页人物身上的套装光效（参考《征途》升星后人物出光） =================
   只在角色页的 3D 预览里（heroView：「主角」页签、装备页左边的人物），副本战斗、超市里的人物不加。
   看同一套穿了几件（武器、头盔、护甲、手套、鞋子 5 件，护符不算）和这几件里最低的星（两套都没凑齐时按件数多的那套）：
   - 1 档 穿满 3 件：脚下一圈很淡的红色符文光圈，平放、慢转
   - 2 档 穿满 5 件：光圈变亮，身边几颗红色光点绕着往上飘
   - 3 档 5 件都 ≥ 6★：再加人物轮廓的淡红色边缘光（一明一暗地呼吸），光点变多
   - 4 档 5 件都 12★：光圈、光点变红金色；身后一道往上流动的淡光柱；每隔几秒脚下扩出一圈淡光波
   特效图：美术/模型/副本/通用/套装炼宝特效_2x2.jpg 切出来的 img/fb/set_*（tools/cut_setfx.py），黑底，一律叠加混合。要淡、要慢，不挡脸和身体。 */
import * as THREE from 'three';
import { A } from './assets.js';
import { ITEMS } from './fbcfg.js';

const SET_SLOTS = ['w', 'h', 'a', 'g', 'b'];
/* 档位：{ tier 0～4, set, n（件数）, min（最低星） } */
export function auraTier(eq) {
  const by = {};
  for (const sl of SET_SLOTS) { const it = eq && eq[sl], D = it && ITEMS[it.k]; if (!D || !D.set) continue; const b = by[D.set] || (by[D.set] = { n: 0, min: 99 }); b.n++; b.min = Math.min(b.min, it.st || 0) }
  let best = null; for (const k in by) if (!best || by[k].n > best.n || (by[k].n === best.n && by[k].min > best.min)) best = { set: k, ...by[k] };
  if (!best || best.n < 3) return { tier: 0, ...(best || {}) };
  const tier = best.n < 5 ? 1 : best.min >= 12 ? 4 : best.min >= 6 ? 3 : 2;
  return { tier, ...best };
}

export function makeAura(sc) {
  const L = new THREE.TextureLoader(), tx = {};
  const T = n => tx[n] || (tx[n] = (() => { const t = L.load(A('img/fb/' + n)); t.colorSpace = THREE.SRGBColorSpace; return t })());
  /* 画布是透明底、后面是浅色面板：叠加在浅底上只会发白、看不出绿。所以这里用「亮度当透明度」的正常混合：
     黑底（亮度 0）= 全透明，光照原色画上去（设计 86：特效图切成带透明度的 PNG，透明度 = 亮度） */
  const ADDB = { blending: THREE.NormalBlending };
  const add = (map, op = 1, extra = {}) => new THREE.MeshBasicMaterial({ map, transparent: true, opacity: op, ...ADDB, depthWrite: false, toneMapped: false, ...extra });
  const g = new THREE.Group(); g.visible = false; sc.add(g);
  const GREEN = new THREE.Color(1.5, 1.15, 1.15), GOLD = new THREE.Color(1.6, 1.35, 0.6);   // 设计 86：特效图已换成红色（GREEN 这个名字留着，现在是红）   // 浅色面板上要稍微提亮才看得出
  /* 脚下光圈：平放（往镜头那边翘一点，平视的镜头也看得出是一圈） */
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), add(T('set_ring.png'), 0)); ring.rotation.x = -Math.PI / 2 + 0.28; ring.position.y = 0.03; ring.renderOrder = 1; g.add(ring);
  /* 光波（4 档）：爆光那格压扁平放，从脚下往外扩 */
  const wave = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), add(T('set_burst.png'), 0)); wave.rotation.x = -Math.PI / 2 + 0.28; wave.position.y = 0.04; wave.renderOrder = 1; g.add(wave);
  /* 光柱（4 档）：人身后，纹理往上流；两端用顶点颜色淡出（叠加时黑 = 不加光） */
  const pg = new THREE.PlaneGeometry(0.95, 2.7, 1, 8), col = []; for (let i = 0; i < pg.attributes.position.count; i++) { const v = pg.attributes.uv.getY(i), f = Math.min(1, v / 0.25, (1 - v) / 0.3); col.push(1, 1, 1, f) }
  pg.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));   // 两端靠顶点的透明度淡出
  const pt = T('set_pillar.png').clone(); pt.wrapT = THREE.RepeatWrapping; pt.needsUpdate = true;
  const pillar = new THREE.Mesh(pg, add(pt, 0, { vertexColors: true })); pillar.position.set(0, 1.3, -0.45); pillar.renderOrder = 0; g.add(pillar);
  /* 光点：左下格拆出来的 4 颗星，绕着人往上飘 */
  const dots = []; for (let i = 0; i < 26; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T('set_star' + (i % 4) + '.png'), transparent: true, opacity: 0, ...ADDB, depthWrite: false, toneMapped: false }));
    s.userData = { a: Math.random() * 6.28, r: 0.42 + Math.random() * 0.3, y: Math.random() * 2, sp: 0.18 + Math.random() * 0.22, w: (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.35), sz: 0.13 + Math.random() * 0.1, ph: Math.random() * 6 }; s.visible = false; g.add(s); dots.push(s) }
  /* 边缘光（3 档以上）：人物的材质复制一份，加一层菲涅尔自发光（不影响超市里的主角） */
  const U = { k: { value: 0 }, c: { value: new THREE.Color(1.0, 0.3, 0.28) } };
  function attach(root) {
    if (!root) return;
    root.traverse(o => { if (!o.isMesh || !o.material) return;
      const one = m => { const c = m.clone(), prev = m.onBeforeCompile, pk = m.customProgramCacheKey ? m.customProgramCacheKey() : ''; c.onBeforeCompile = (sh, r) => { if (prev) prev.call(m, sh, r); if (!sh.fragmentShader.includes('totalEmissiveRadiance') || !sh.fragmentShader.includes('vViewPosition')) return;
        sh.uniforms.uRimK = U.k; sh.uniforms.uRimC = U.c;
        sh.fragmentShader = 'uniform float uRimK; uniform vec3 uRimC;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += uRimC * uRimK * pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.2);') };
        c.customProgramCacheKey = () => pk + '|heroRim'; return c };
      o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material) });
  }
  let tier = 0, t = 0, waveT = 0, fade = 0;
  function set(info) { tier = info.tier }
  function update(dt) {
    t += dt; fade += ((tier > 0 ? 1 : 0) - fade) * Math.min(1, dt * 4); g.visible = fade > 0.01;
    const gold = tier >= 4, tint = gold ? GOLD : GREEN;
    /* 光圈 */
    ring.material.opacity = fade * [0, 0.6, 0.9, 1, 1][tier] * (0.85 + 0.15 * Math.sin(t * 1.3)); ring.rotation.z = t * 0.25; ring.material.color.copy(tint);
    /* 光点 */
    const nd = [0, 0, 10, 20, 26][tier];
    dots.forEach((s, i) => { const u = s.userData, on = i < nd; s.visible = on && g.visible; if (!on) return;
      u.y += u.sp * dt; if (u.y > 2.1) { u.y = 0.05; u.a = Math.random() * 6.28 } u.a += u.w * dt;
      s.position.set(Math.cos(u.a) * u.r, u.y, Math.sin(u.a) * u.r * 0.7);
      const life = Math.min(1, u.y / 0.3, (2.1 - u.y) / 0.6); s.material.opacity = fade * life * (0.6 + 0.4 * Math.sin(t * 3 + u.ph)); s.scale.setScalar(u.sz * (0.8 + 0.3 * Math.sin(t * 2 + u.ph))); s.material.color.copy(tint) });
    /* 边缘光：一明一暗地呼吸 */
    U.k.value = tier >= 3 ? fade * (0.75 + 0.45 * Math.sin(t * 1.8)) : 0;   // 设计 86：红色在肤色上不如绿色显眼，再加强一点   // 设计 85b：加强，最暗时也看得出一圈淡绿 U.c.value.setRGB(1.0, gold ? 0.5 : 0.42, gold ? 0.18 : 0.23);   // 设计 86b：轮廓光偏红金（#ff6a3a），纯红落在脸、手上像脸红   // 设计 86：套装改红
    /* 光柱 + 光波（4 档） */
    pillar.visible = tier >= 4; if (pillar.visible) { pillar.material.opacity = fade * (0.5 + 0.1 * Math.sin(t * 1.1)); pt.offset.y = (pt.offset.y - dt * 0.35) % 1 }
    wave.visible = tier >= 4; if (wave.visible) { waveT += dt; if (waveT > 3.5) waveT = 0; const k = Math.min(1, waveT / 1.4); wave.scale.setScalar(0.4 + 2.4 * (1 - (1 - k) * (1 - k))); wave.material.opacity = fade * 0.8 * (1 - k) * Math.min(1, waveT / 0.1) }
  }
  return { attach, set, update, group: g, get tier() { return tier } };
}
