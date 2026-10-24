import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const q = new URLSearchParams(location.search);
const files = (q.get('f') || '').split(',').filter(Boolean);
const R = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); R.setSize(+q.get('w') || 800, +q.get('h') || 800); document.body.appendChild(R.domElement);
R.outputColorSpace = THREE.SRGBColorSpace;
const sc = new THREE.Scene(); sc.background = new THREE.Color(q.get('bg') ? '#' + q.get('bg') : '#8899aa');
sc.add(new THREE.HemisphereLight(0xffffff, 0x445544, 1.6)); const d = new THREE.DirectionalLight(0xffffff, 2); d.position.set(2, 4, 5); sc.add(d);
const oh = +q.get('ortho') || 0, asp = (+q.get('w') || 800) / (+q.get('h') || 800);
const cam = oh ? new THREE.OrthographicCamera(-oh * asp, oh * asp, oh, -oh, 0.01, 100) : new THREE.PerspectiveCamera(+q.get('fov') || 30, asp, 0.01, 100);
const [cx, cy, cz, tx, ty, tz] = (q.get('cam') || '0,0.6,3,0,0.55,0').split(',').map(Number); cam.position.set(cx, cy, cz); cam.lookAt(tx, ty, tz);
const L = new GLTFLoader(); let n = 0;
window.done = false;
for (const f of files) L.load(f, g => { sc.add(g.scene);
  const rq = {}; g.scene.traverse(o => { if (o.isBone) rq[o.name] = o.quaternion.clone() });
  const an = q.get('anim'); if (an) { const clip = g.animations.find(c => c.name === an); const mx = new THREE.AnimationMixer(g.scene); mx.clipAction(clip).play(); mx.update(+(q.get('t') || 0) * clip.duration) }
  if (q.get('hand')) { const [x, y, z, s] = q.get('hand').split(',').map(Number); g.scene.traverse(o => { if (o.isBone && /Hand$/.test(o.name)) { const k = /Left/.test(o.name) ? 1 : -1;
    o.quaternion.copy(rq[o.name]).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x * Math.PI / 180, k * y * Math.PI / 180, k * z * Math.PI / 180, 'YXZ'))); o.scale.set(1, s || 1, 1) } }) }
  if (q.get('morph')) g.scene.traverse(o => { if (o.morphTargetInfluences) o.morphTargetInfluences[0] = +q.get('morph') });
  if (q.get('rot')) g.scene.rotation.y = +q.get('rot');
  if (q.get('only')) g.scene.traverse(o => { if (o.isMesh && !o.name.includes(q.get('only'))) o.visible = false });
  if (q.get('novc')) g.scene.traverse(o => { if (o.isMesh) { o.material.vertexColors = false; o.material.needsUpdate = true } });
  console.log('clips', g.animations.map(c => c.name + ':' + c.duration.toFixed(2)).join(','));
  if (++n === files.length) { R.render(sc, cam); window.done = true } });
if (!files.length) window.done = true;
