import * as THREE from 'three';
import { createEffects, loadCustomTextures } from './effects.js';

// ---------------- Configuración ----------------
const TARGET_SRC = './targets/targets.mind';
// Posición del logo dentro de la imagen del marcador (1580x1600 px).
// El logo ocupa aprox. de x=205 a 1305 y de y=268 a 1368 px.
const IMG_W = 1580, IMG_H = 1600;
const LOGO = {
  cx: (205 + 1305) / 2 / IMG_W - 0.5,
  cy: -((268 + 1368) / 2 - IMG_H / 2) / IMG_W,
  size: (1305 - 205) / IMG_W,
  planeH: IMG_H / IMG_W,   // alto de la imagen del marcador en unidades
};
const HOLD_MS = 1600;   // cuánto se mantiene el contenido si se pierde el logo
const SMOOTH = 14;      // suavizado extra de la posición (más alto = más rápido)

const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
const DEBUG = params.has('debug');

const $ = (id) => document.getElementById(id);
const ui = {
  start: $('start'), startBtn: $('start-btn'), demoBtn: $('demo-btn'),
  loading: $('loading'), hint: $('hint'), error: $('error'), errorMsg: $('error-msg'),
  debug: $('debug'), container: $('ar'),
};
const show = (el, on = true) => el.classList.toggle('hidden', !on);

if (DEMO) {
  show(ui.start, false);
  startDemo();
} else {
  ui.startBtn.addEventListener('click', startAR);
}
ui.demoBtn.addEventListener('click', () => { location.search = '?demo'; });

// ---------------- Modo AR (cámara + MindAR) ----------------
async function startAR() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return fail('La cámara solo funciona si la página se abre con https://. Revisa el enlace.');
  }
  show(ui.start, false);
  show(ui.loading, true);

  let mindar;
  try {
    const { MindARThree } = await import('mindar-image-three');
    mindar = new MindARThree({
      container: ui.container,
      imageTargetSrc: TARGET_SRC,
      uiLoading: 'no', uiScanning: 'no', uiError: 'no',
      filterMinCF: 0.001, filterBeta: 30,   // menos temblor
      warmupTolerance: 2, missTolerance: 8,  // aparece rápido, no se suelta tan fácil
    });
  } catch (e) {
    console.error(e);
    return fail('No se pudo cargar el motor de realidad aumentada. Revisa tu conexión.');
  }

  const { renderer, scene, camera } = mindar;
  setupRenderer(renderer);
  const anchor = mindar.addAnchor(0);

  // El contenido NO va dentro del anchor: lo movemos nosotros para suavizar
  // y para que no desaparezca de golpe cuando el logo se pierde un instante.
  const content = new THREE.Group();
  scene.add(content);
  const custom = await loadCustomTextures();
  const fx = createEffects({ renderer, logo: LOGO, custom });
  content.add(fx.group);

  let tracked = false, everSeen = false, snap = true, lastSeen = -1e9, fade = 0;

  anchor.onTargetFound = () => {
    const now = performance.now();
    if (!everSeen || now - lastSeen > HOLD_MS) { snap = true; fx.burst(); vibrate(); }
    tracked = true; everSeen = true;
  };
  anchor.onTargetLost = () => { tracked = false; lastSeen = performance.now(); };

  try {
    await mindar.start();
  } catch (e) {
    console.error(e);
    return fail('No pudimos acceder a la cámara. Da permiso a la cámara en tu navegador y vuelve a intentarlo.');
  }
  show(ui.loading, false);
  show(ui.hint, true);

  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  let prev = performance.now(), frames = 0, fpsT = prev, fps = 0;

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;

    if (tracked) {
      anchor.group.matrix.decompose(p, q, s);
      if (snap) {
        content.position.copy(p); content.quaternion.copy(q); content.scale.copy(s);
        snap = false;
      } else {
        const k = 1 - Math.exp(-SMOOTH * dt);
        content.position.lerp(p, k); content.quaternion.slerp(q, k); content.scale.lerp(s, k);
      }
      lastSeen = now;
    }
    const holding = everSeen && now - lastSeen < HOLD_MS;
    const target = tracked || holding ? 1 : 0;
    fade += (target - fade) * Math.min(1, dt * (target > fade ? 10 : 3));

    fx.setFade(fade);
    fx.update(now / 1000, dt);
    show(ui.hint, !tracked && fade < 0.05);
    renderer.render(scene, camera);

    if (DEBUG) {
      frames++;
      if (now - fpsT > 500) { fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; }
      ui.debug.textContent = `${tracked ? 'DETECTADO' : holding ? 'memoria' : 'buscando'} · ${fps} fps`;
    }
  });
  if (DEBUG) show(ui.debug, true);
}

// ---------------- Modo demo (sin cámara) ----------------
// Muestra el logo con los efectos y mueve la cámara virtual con el dedo,
// el mouse o la inclinación del celular, para enseñar el paralaje.
async function startDemo() {
  document.body.classList.add('demo');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  setupRenderer(renderer);
  ui.container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 50);

  const logoTex = new THREE.TextureLoader().load('./assets/logo.png');
  logoTex.colorSpace = THREE.SRGBColorSpace;
  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(1, IMG_H / IMG_W),
    new THREE.MeshBasicMaterial({ map: logoTex, transparent: true })
  );
  scene.add(card);

  const custom = await loadCustomTextures();
  const fx = createEffects({ renderer, logo: LOGO, custom });
  scene.add(fx.group);
  fx.setFade(1);
  fx.burst();

  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const look = { x: 0, y: 0, tx: 0, ty: 0, user: false };
  window.addEventListener('pointermove', (e) => {
    look.user = true;
    look.tx = (e.clientX / window.innerWidth) * 2 - 1;
    look.ty = (e.clientY / window.innerHeight) * 2 - 1;
  });
  window.addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    look.user = true;
    look.tx = Math.max(-1, Math.min(1, e.gamma / 30));
    look.ty = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
  });
  renderer.domElement.addEventListener('click', () => fx.burst());

  let prev = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    const t = now / 1000;
    if (!look.user) { look.tx = Math.sin(t * 0.5); look.ty = Math.sin(t * 0.37) * 0.5; }
    look.x += (look.tx - look.x) * Math.min(1, dt * 4);
    look.y += (look.ty - look.y) * Math.min(1, dt * 4);

    const dist = camera.aspect < 1 ? 2.2 / camera.aspect : 3.0;
    camera.position.set(look.x * 1.1, -look.y * 0.7, dist);
    camera.lookAt(0, 0, 0.15);

    fx.update(t, dt);
    renderer.render(scene, camera);
  });
}

// ---------------- Utilidades ----------------
function setupRenderer(renderer) {
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); // rendimiento en celulares
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
}

function fail(msg) {
  show(ui.loading, false);
  show(ui.start, false);
  ui.errorMsg.textContent = msg;
  show(ui.error, true);
}

function vibrate() {
  try { navigator.vibrate?.(30); } catch (_) { /* no disponible */ }
}
