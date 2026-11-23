/* Grid Log background module — Hex OS unified treatment (Nov 20, 2026).
   WebGPU fragment field + 360 panorama, outer frame only, behind UI panels.
   Architecture per the incorporation plan: Three.js r187 WebGPURenderer +
   TSL compute — fragments live in GPU storage buffers (rest / position /
   velocity); light repulsion + spring return + damping run on the GPU;
   one draw call. The movable light follows the cursor / touch and tints
   per active sigil. Panorama: the locked level-canon sky (pink-to-purple
   gradient, striped sun) rendered procedurally as an equirect texture —
   canon art lands here per surface; never stock. Fallbacks: any failure
   (no WebGPU, init error, first-frame watchdog) hands over to the page's
   light 2D tier. Reduced motion: one frozen frame, no drift, no pan. */
import * as THREE from 'three';
import { Fn, uniform, instancedArray, instanceIndex, vec3, float, mix, length, normalize, smoothstep } from 'three/tsl';

const canvas = document.getElementById('gl-webgpu');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let done = false;
function fallback(){ if(!done){ done = true; window.__glFallback && window.__glFallback(); } }
setTimeout(() => { if(!started) fallback(); }, 6000);
let started = false;
window.__glStarted = () => started;

async function init(){
  if(!navigator.gpu) return fallback();
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, alpha: false });
  await renderer.init();
  started = true;

  const scene = new THREE.Scene();

  /* --- 360 panorama: locked sky canon, procedural equirect (2048x1024) --- */
  const pc = document.createElement('canvas'); pc.width = 2048; pc.height = 1024;
  const g = pc.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0, '#2a0a4a'); grad.addColorStop(0.45, '#7b2d8b');
  grad.addColorStop(0.72, '#e754a8'); grad.addColorStop(0.86, '#3b115c'); grad.addColorStop(1, '#05010f');
  g.fillStyle = grad; g.fillRect(0, 0, 2048, 1024);
  // striped sun (level canon: pink vaporwave sun, horizontal stripes, lower half cut by bands)
  const sx = 1450, sy = 430, sr = 150;
  g.save(); g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.clip();
  const sg = g.createLinearGradient(0, sy - sr, 0, sy + sr);
  sg.addColorStop(0, '#ffd319'); sg.addColorStop(0.55, '#ff2975'); sg.addColorStop(1, '#8c1eff');
  g.fillStyle = sg; g.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
  g.fillStyle = grad; // re-cut stripes with sky bands growing downward
  let y = sy + 6, h = 3;
  while(y < sy + sr){ g.fillRect(sx - sr, y, sr * 2, h); y += h + 10; h += 2.5; }
  g.restore();
  g.fillStyle = 'rgba(5,1,15,0.9)'; g.fillRect(0, 900, 2048, 124); // dark horizon band
  const pano = new THREE.CanvasTexture(pc);
  pano.mapping = THREE.EquirectangularReflectionMapping;
  pano.colorSpace = THREE.SRGBColorSpace;
  scene.background = pano;
  scene.backgroundIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 0, 6);

  /* --- fragment field: GPU storage buffers + TSL compute --- */
  const isMobile = Math.min(innerWidth, innerHeight) < 700 || (navigator.hardwareConcurrency || 8) <= 4;
  const COUNT = isMobile ? 30000 : 150000;
  const rest = new Float32Array(COUNT * 3), pos0 = new Float32Array(COUNT * 3), vel0 = new Float32Array(COUNT * 3);
  for(let i = 0; i < COUNT; i++){
    const x = (Math.random() - 0.5) * 26, y = (Math.random() - 0.5) * 15, z = (Math.random() - 0.5) * 10 - 2;
    rest.set([x, y, z], i * 3); pos0.set([x, y, z], i * 3);
  }
  const restBuf = instancedArray(rest, 'vec3');
  const posBuf = instancedArray(pos0, 'vec3');
  const velBuf = instancedArray(vel0, 'vec3');
  const light = uniform(new THREE.Vector3(0, 0, 0));
  const sigil = getComputedStyle(document.documentElement).getPropertyValue('--nv-accent').trim() || '#7c3aed';

  const compute = Fn(() => {
    const p = posBuf.element(instanceIndex);
    const v = velBuf.element(instanceIndex);
    const r = restBuf.element(instanceIndex);
    const toFrag = p.sub(light);
    const dist = length(toFrag);
    const fall = float(1.0).sub(smoothstep(0.0, 3.2, dist));
    const repel = normalize(toFrag).mul(fall.mul(0.045));
    const spring = r.sub(p).mul(0.012);
    v.assign(v.mul(0.92).add(repel).add(spring));
    p.assign(p.add(v));
  })().compute(COUNT);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos0.slice(), 3)); // bounding only; real positions come from the buffer node
  const Mat = THREE.PointsNodeMaterial || THREE.PointsMaterial;
  const mat = new Mat({ size: 0.055, transparent: true, opacity: 0.85, depthWrite: false });
  mat.color = new THREE.Color(sigil);
  mat.positionNode = posBuf.toAttribute();
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  /* --- light follows cursor / touch; gentle idle wander --- */
  const target = new THREE.Vector3(0, 0, 0); let idle = 0;
  function toWorld(cx, cy){ return new THREE.Vector3((cx / innerWidth - 0.5) * 22, -(cy / innerHeight - 0.5) * 12.5, 0); }
  addEventListener('pointermove', e => { target.copy(toWorld(e.clientX, e.clientY)); idle = 0; }, { passive: true });
  addEventListener('touchmove', e => { if(e.touches[0]){ target.copy(toWorld(e.touches[0].clientX, e.touches[0].clientY)); idle = 0; } }, { passive: true });

  /* --- panorama pan: drag on background margins + slow idle drift --- */
  let dragging = false, lastX = 0, rotY = 0;
  document.addEventListener('pointerdown', e => { if(!e.target.closest('a,input,button,.card')){ dragging = true; lastX = e.clientX; } });
  addEventListener('pointerup', () => dragging = false);
  addEventListener('pointermove', e => { if(dragging){ rotY -= (e.clientX - lastX) * 0.0006; lastX = e.clientX; } }, { passive: true });

  function resize(){ camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); }
  addEventListener('resize', resize); resize();

  renderer.setAnimationLoop(() => {
    if(document.hidden) return;
    idle += 0.016;
    if(idle > 2.5 && !reduced){ target.set(Math.sin(performance.now() * 0.00022) * 6, Math.cos(performance.now() * 0.00017) * 3, 0); }
    light.value.lerp(target, 0.08);
    if(!reduced){ rotY += 0.00012; scene.backgroundRotation.y = rotY; }
    renderer.compute(compute);
    renderer.render(scene, camera);
    if(reduced) renderer.setAnimationLoop(null); // one frozen frame
  });
}
init().catch(fallback);
