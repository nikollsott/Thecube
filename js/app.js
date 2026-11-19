import * as THREE from 'three';
import { createEffects } from './effects.js?v=24'; // ?v= evita que el celular use una versión vieja
import { createCapture, shareFile, downloadFile } from './capture.js?v=24';

// ---------- Configuración ----------
// Marcadores del mismo logo (ver targets/fuentes): 0 fondo claro, 1 fondo oscuro,
// 2 foto de la pared, 3-4 fotos de la pared con otra luz.
const TARGET_SRC = './targets/targets.mind?v=4'; // subir ?v= al cambiar los marcadores
const TARGET_COUNT = 5;

// Ubicación del logo dentro de la imagen del marcador (en píxeles).
const IMG_W = 1580;
const IMG_H = 1600;
const LOGO = {
  cx: (205 + 1305) / 2 / IMG_W - 0.5,
  cy: -((268 + 1368) / 2 - IMG_H / 2) / IMG_W,
  size: (1305 - 205) / IMG_W,
  planeH: IMG_H / IMG_W,
};

const HOLD_MS = 250;             // tolera parpadeos del seguimiento
const REINTRO_MS = 1500;         // si se perdió más tiempo, se repite la entrada
const FADE_IN = 10;
const FADE_OUT = 12;
const SMOOTH = 14;               // suavizado del movimiento
const FIT_FILL = 0.92;           // parte de la pantalla que puede ocupar la escena
const FIT_MAX = 3.5;             // agrandamiento máximo al escanear de lejos
const TABLE_TILT = 0.4;          // inclinación desde la que se considera "mesa"
const MODE_SAMPLES = 15;
const SLOW_START_MS = 12000;

const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
const DEBUG = params.has('debug');
const FORCED_MODE = ['mesa', 'pared'].includes(params.get('modo')) ? params.get('modo') : null;

// ---------- Interfaz ----------
const $ = (id) => document.getElementById(id);
const ui = {
  start: $('start'), startBtn: $('start-btn'), demoBtn: $('demo-btn'),
  loading: $('loading'), loadingMsg: $('loading-msg'), loadingRetry: $('loading-retry'),
  hint: $('hint'), error: $('error'), errorMsg: $('error-msg'),
  debug: $('debug'), container: $('ar'),
  capture: $('capture'), shutter: $('shutter'), recTime: $('rec-time'), flash: $('flash'),
  preview: $('preview'), previewImg: $('preview-img'), previewVideo: $('preview-video'),
  shareBtn: $('share-btn'), saveBtn: $('save-btn'), closePreview: $('close-preview'),
};
const show = (el, on = true) => el.classList.toggle('hidden', !on);
const setLoadingMsg = (text) => { ui.loadingMsg.textContent = text; };
const showProgress = (p) => setLoadingMsg(`Cargando escena… ${Math.round(p * 100)}%`);

if (DEMO) {
  show(ui.start, false);
  startDemo();
} else {
  ui.startBtn.addEventListener('click', startAR);
}
ui.demoBtn.addEventListener('click', () => { location.search = '?demo'; });

// Al volver "atrás" desde la caché la cámara ya no existe: recargar.
window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });

// ---------- Modo AR ----------
async function startAR() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return fail('La cámara solo funciona si la página se abre con https://. Revisa el enlace.');
  }
  show(ui.start, false);
  show(ui.loading, true);

  const mindar = await loadMindAR();
  if (!mindar) return fail('No se pudo cargar el motor de realidad aumentada. Revisa tu conexión.');

  const { renderer, scene, camera } = mindar;
  setupRenderer(renderer);
  const anchors = Array.from({ length: TARGET_COUNT }, (_, i) => mindar.addAnchor(i));

  // La escena sigue al logo con suavizado (no va dentro del anchor).
  const content = new THREE.Group();
  scene.add(content);
  const fx = createEffects({ logo: LOGO, onProgress: showProgress });
  content.add(fx.group);

  const state = {
    anchor: anchors[0], tracked: false, everSeen: false, snap: true, lastSeen: -Infinity,
    fade: 0, fit: 1, mode: FORCED_MODE || 'pared', modeSamples: 0, modeSum: 0,
  };

  for (const anchor of anchors) {
    anchor.onTargetFound = () => {
      if (!state.everSeen || performance.now() - state.lastSeen > REINTRO_MS) {
        Object.assign(state, { snap: true, modeSamples: 0, modeSum: 0 });
        fx.burst();
        vibrate();
      }
      state.anchor = anchor;
      state.tracked = state.everSeen = true;
    };
    anchor.onTargetLost = () => {
      if (state.anchor !== anchor) return;
      state.tracked = false;
      state.lastSeen = performance.now();
    };
  }

  askCameraAndMicrophoneOnce();
  const slowTimer = setTimeout(() => explainSlowStart(mindar), SLOW_START_MS);
  try {
    await mindar.start();
  } catch (e) {
    console.warn('Cámara no disponible', e);
    clearTimeout(slowTimer);
    mindar.video = null; // evita un error interno de MindAR al girar la pantalla
    return fail('No pudimos acceder a la cámara. Da permiso a la cámara en tu navegador y vuelve a intentarlo.');
  }

  await fx.ready; // nunca mostrar la escena a medio cargar
  clearTimeout(slowTimer);
  show(ui.loadingRetry, false);
  show(ui.loading, false);
  show(ui.hint, true);
  resumeCameraOnReturn(mindar);
  const capture = setupCapture(renderer, () => mindar.video);

  const pose = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };
  const fps = createFpsMeter();
  let prev = performance.now();

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;

    if (state.tracked) {
      followAnchor(content, state.anchor, pose, state, dt);
      state.lastSeen = now;
      detectMode(state.anchor, state, fx);
      state.fit = fitToScreen(content, camera, fx, state.fit, dt);
      fx.setFit(state.fit);
    }

    const holding = state.everSeen && now - state.lastSeen < HOLD_MS;
    const target = state.tracked || holding ? 1 : 0;
    state.fade += (target - state.fade) * Math.min(1, dt * (target > state.fade ? FADE_IN : FADE_OUT));

    fx.setFade(state.fade);
    fx.update(now / 1000, dt);
    show(ui.hint, !state.tracked && state.fade < 0.05);
    renderer.render(scene, camera);
    capture.afterRender();

    if (DEBUG) {
      const status = state.tracked ? 'DETECTADO' : holding ? 'memoria' : 'buscando';
      ui.debug.textContent = `${status} · modo ${state.mode} · x${state.fit.toFixed(1)} · ${fps(now)} fps`;
    }
  });
  if (DEBUG) show(ui.debug, true);
}

async function loadMindAR() {
  try {
    const { MindARThree } = await import('mindar-image-three');
    return new MindARThree({
      container: ui.container,
      imageTargetSrc: TARGET_SRC,
      uiLoading: 'no', uiScanning: 'no', uiError: 'no',
      filterMinCF: 0.001, filterBeta: 30,     // menos temblor
      warmupTolerance: 2, missTolerance: 3,   // aparece y desaparece rápido
    });
  } catch (e) {
    console.error(e);
    return null;
  }
}

// Un solo aviso de permisos: cuando MindAR pide la cámara, se pide también el micrófono.
// El micrófono se apaga enseguida (queda el permiso) y solo se enciende al grabar video.
// Si no dan el micrófono, sigue solo con la cámara.
function askCameraAndMicrophoneOnce() {
  const media = navigator.mediaDevices;
  const original = media.getUserMedia.bind(media);
  media.getUserMedia = async (constraints) => {
    media.getUserMedia = original; // solo la primera llamada (la de MindAR)
    try {
      const stream = await original({ ...constraints, audio: true });
      stream.getAudioTracks().forEach((t) => t.stop());
      return new MediaStream(stream.getVideoTracks());
    } catch {
      return original(constraints);
    }
  };
}

function explainSlowStart(mindar) {
  setLoadingMsg(mindar.video?.srcObject
    ? 'La conexión está lenta, seguimos cargando…'
    : 'Esperando el permiso de la cámara. Si no ves el aviso, revisa los permisos de cámara de tu navegador.');
  show(ui.loadingRetry, true);
}

// Al volver de otra app: reanuda el video o avisa si la cámara se cerró.
function resumeCameraOnReturn(mindar) {
  document.addEventListener('visibilitychange', () => {
    const video = mindar.video;
    if (document.hidden || !video) return;

    const tracks = video.srcObject?.getVideoTracks?.() || [];
    if (tracks.length && tracks.every((t) => t.readyState === 'ended')) {
      mindar.renderer.setAnimationLoop(null);
      fail('La cámara se detuvo al salir de la página. Toca "Intentar de nuevo" para reactivarla.');
      return;
    }
    if (video.paused) video.play().catch(() => {});
  });
}

function followAnchor(content, anchor, pose, state, dt) {
  anchor.group.matrix.decompose(pose.p, pose.q, pose.s);
  if (state.snap) {
    content.position.copy(pose.p);
    content.quaternion.copy(pose.q);
    content.scale.copy(pose.s);
    state.snap = false;
    return;
  }
  const k = 1 - Math.exp(-SMOOTH * dt);
  content.position.lerp(pose.p, k);
  content.quaternion.slerp(pose.q, k);
  content.scale.lerp(pose.s, k);
}

// Mesa o pared: según cuánto se aleja de la cámara el "arriba" del logo.
function detectMode(anchor, state, fx) {
  if (FORCED_MODE || state.modeSamples >= MODE_SAMPLES) return;

  const e = anchor.group.matrix.elements;
  state.modeSum += -e[6] / Math.hypot(e[4], e[5], e[6]);
  state.modeSamples++;

  if (state.modeSamples === 1 || state.modeSamples === MODE_SAMPLES) {
    state.mode = state.modeSum / state.modeSamples > TABLE_TILT ? 'mesa' : 'pared';
    fx.setMode(state.mode, state.modeSamples === 1);
  }
}

// Si el logo se ve pequeño (lejos), agranda la escena hasta llenar la pantalla.
function fitToScreen(content, camera, fx, current, dt) {
  const visH = 2 * content.position.length() * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const visW = visH * camera.aspect;
  const unit = content.scale.x; // ancho del marcador
  const target = Math.min(
    FIT_FILL * (visW / 2) / (fx.extent.side * unit),
    FIT_FILL * (visH / 2) / (fx.extent.up * unit),
  );
  return current + (THREE.MathUtils.clamp(target, 1, FIT_MAX) - current) * Math.min(1, dt * 3);
}

function createFpsMeter() {
  let frames = 0, since = performance.now(), fps = 0;
  return (now) => {
    frames++;
    if (now - since > 500) {
      fps = Math.round(frames * 1000 / (now - since));
      frames = 0;
      since = now;
    }
    return fps;
  };
}

// ---------- Modo demo (sin cámara) ----------
async function startDemo() {
  document.body.classList.add('demo');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  setupRenderer(renderer);
  ui.container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 50);
  const mode = FORCED_MODE || 'mesa';
  scene.add(createPrintedLogo(mode === 'mesa'));

  show(ui.loading, true);
  const fx = createEffects({ logo: LOGO, onProgress: showProgress });
  fx.setMode(mode, true);
  scene.add(fx.group);
  await fx.ready;
  show(ui.loading, false);
  fx.setFade(1);
  fx.burst();

  fitRendererToWindow(renderer, camera);
  const viewer = trackViewer(renderer, fx);
  const capture = setupCapture(renderer, null);
  let prev = performance.now();

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    const t = now / 1000;

    viewer.update(t, dt);
    placeDemoCamera(camera, viewer, mode);
    fx.update(t, dt);
    renderer.render(scene, camera);
    capture.afterRender();
  });
}

// ---------- Foto y video ----------
function setupCapture(renderer, getVideo) {
  const capture = createCapture({ container: ui.container, renderer, getVideo });
  const modeButtons = [...ui.capture.querySelectorAll('[data-mode]')];
  let mode = 'photo';
  let current = null; // { blob, name, url }

  if (!capture.canRecord()) modeButtons.find((b) => b.dataset.mode === 'video').disabled = true;

  const setMode = (m) => {
    mode = m;
    modeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    ui.shutter.classList.toggle('video', m === 'video');
    ui.shutter.setAttribute('aria-label', m === 'video' ? 'Grabar video' : 'Tomar foto');
  };
  modeButtons.forEach((b) => b.addEventListener('click', () => { if (!capture.isRecording()) setMode(b.dataset.mode); }));

  const openPreview = (blob, kind, ext) => {
    current = { blob, name: `thecube-${Date.now()}.${ext}`, url: URL.createObjectURL(blob) };
    show(ui.previewImg, kind === 'photo');
    show(ui.previewVideo, kind === 'video');
    if (kind === 'photo') ui.previewImg.src = current.url;
    else {
      // Con sonido si el navegador lo permite; si no, en silencio (se activa en los controles).
      ui.previewVideo.src = current.url;
      ui.previewVideo.muted = false;
      ui.previewVideo.play().catch(() => { ui.previewVideo.muted = true; ui.previewVideo.play().catch(() => {}); });
    }
    show(ui.capture, false);
    show(ui.preview, true);
  };
  const closePreview = () => {
    ui.previewVideo.pause();
    ui.previewVideo.removeAttribute('src');
    URL.revokeObjectURL(current?.url);
    current = null;
    show(ui.preview, false);
    show(ui.capture, true);
  };

  // Contador y anillo de progreso mientras se graba.
  const tickRecording = () => {
    if (!capture.isRecording()) return;
    ui.shutter.style.setProperty('--p', capture.progress().toFixed(3));
    const s = Math.floor(capture.progress() * 15);
    ui.recTime.textContent = `0:${String(s).padStart(2, '0')}`;
    requestAnimationFrame(tickRecording);
  };
  const stopRecordingUI = () => {
    ui.shutter.classList.remove('recording');
    ui.shutter.style.setProperty('--p', 0);
    show(ui.recTime, false);
    setMode(mode);
  };

  ui.shutter.addEventListener('click', async () => {
    if (mode === 'photo') {
      ui.flash.classList.remove('on');
      void ui.flash.offsetWidth; // reinicia la animación del destello
      ui.flash.classList.add('on');
      setTimeout(() => ui.flash.classList.remove('on'), 400);
      const blob = await capture.photo();
      if (blob) openPreview(blob, 'photo', 'jpg');
      return;
    }
    if (capture.isRecording()) return capture.stopVideo();
    const started = await capture.startVideo((blob, ext) => { stopRecordingUI(); openPreview(blob, 'video', ext); });
    if (!started) return;
    ui.shutter.classList.add('recording');
    ui.shutter.setAttribute('aria-label', 'Detener video');
    show(ui.recTime, true);
    tickRecording();
  });

  ui.shareBtn.addEventListener('click', () => current && shareFile(current.blob, current.name));
  ui.saveBtn.addEventListener('click', () => current && downloadFile(current.blob, current.name));
  ui.closePreview.addEventListener('click', closePreview);

  setMode('photo');
  show(ui.capture, true);
  return capture;
}

function createPrintedLogo(withPaper) {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(1, IMG_H / IMG_W);
  if (withPaper) {
    const paper = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#efeaf2' }));
    paper.position.z = -0.002;
    group.add(paper);
  }
  const map = new THREE.TextureLoader().load('./assets/logo.png');
  map.colorSpace = THREE.SRGBColorSpace;
  group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map, transparent: true })));
  return group;
}

function fitRendererToWindow(renderer, camera) {
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();
}

// Punto de vista del demo: dedo, mouse o inclinación; sin interacción, se mueve solo.
function trackViewer(renderer, fx) {
  const view = { x: 0, y: 0, tx: 0, ty: 0, touched: false };

  window.addEventListener('pointermove', (e) => {
    view.touched = true;
    view.tx = (e.clientX / window.innerWidth) * 2 - 1;
    view.ty = (e.clientY / window.innerHeight) * 2 - 1;
  });
  window.addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    view.touched = true;
    view.tx = THREE.MathUtils.clamp(e.gamma / 30, -1, 1);
    view.ty = THREE.MathUtils.clamp((e.beta - 45) / 30, -1, 1);
  });

  // En iPhone los sensores piden permiso, y solo se puede pedir tras un toque.
  let askedMotion = false;
  renderer.domElement.addEventListener('click', async () => {
    fx.burst();
    if (askedMotion || typeof window.DeviceOrientationEvent?.requestPermission !== 'function') return;
    askedMotion = true;
    try { await DeviceOrientationEvent.requestPermission(); } catch { /* sin permiso: se usa el dedo */ }
  });

  view.update = (t, dt) => {
    if (!view.touched) {
      view.tx = Math.sin(t * 0.5);
      view.ty = Math.sin(t * 0.37) * 0.5;
    }
    const k = Math.min(1, dt * 4);
    view.x += (view.tx - view.x) * k;
    view.y += (view.ty - view.y) * k;
  };
  return view;
}

function placeDemoCamera(camera, view, mode) {
  const fit = Math.max(1.3, 0.95 / camera.aspect); // aleja la cámara en pantallas angostas
  if (mode === 'mesa') {
    camera.up.set(0, 0, 1);
    camera.position.set(view.x * 0.9 * fit, (-2.0 + view.y * 0.25) * fit, (1.25 - view.y * 0.35) * fit);
    camera.lookAt(0, 0.05, 0.62);
  } else {
    camera.up.set(0, 1, 0);
    camera.position.set(view.x * 1.1, 0.3 - view.y * 0.7, 2.5 * fit);
    camera.lookAt(0, 0.35, 0.15);
  }
}

// ---------- Utilidades ----------
function setupRenderer(renderer) {
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); // limita el costo en celulares
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
}

function fail(msg) {
  show(ui.loading, false);
  show(ui.start, false);
  show(ui.hint, false);
  show(ui.capture, false);
  ui.errorMsg.textContent = msg;
  show(ui.error, true);
}

function vibrate() {
  try { navigator.vibrate?.(30); } catch { /* no disponible */ }
}
