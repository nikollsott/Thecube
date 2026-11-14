// Escena de concierto alrededor del logo.
// Las imágenes de assets/escena/ van como capas a distintas profundidades;
// el código solo agrega efectos (logo en neón, luces, aros, neones y destellos).
//
// Ejes: X derecha, Y arriba, Z hacia quien mira. Diseñada para un logo de 0,7 de ancho.
// Modo "pared": la escena sale de frente. Modo "mesa": se pone de pie sobre la tarjeta.
import * as THREE from 'three';

const COLOR = {
  pink: '#FF3D8B', magenta: '#D946EF', purple: '#A855F7',
  gold: '#FFC53D', orange: '#FF7A1A', red: '#FF3B30',
};
const BPM = 120;

// Tamaño en píxeles de cada imagen (define su proporción).
const IMAGES = {
  truss: [768, 701], pedestal: [768, 321], publico: [768, 247], 'bola-disco': [339, 512],
  microfono: [152, 600], parlante: [380, 512], claqueta: [495, 512], boleta: [512, 311],
};

const LOGO_BOTTOM = -0.32;
const HERO_THICK = 0.035;
const EXTENT = { side: 0.78, up: 1.32 }; // alcance de la escena desde el centro del logo
const ORIGIN = new THREE.Vector3(0, 0.1, 0);

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x) => x * x * (3 - 2 * x);

export function createEffects({
  logo = { cx: 0, cy: 0, size: 0.7 },
  logoUrl = './assets/logo.png',
  imagesUrl = './assets/escena/',
  onProgress = null,
} = {}) {
  // `ready` se cumple cuando cargaron todas las imágenes.
  const manager = new THREE.LoadingManager();
  const ready = new Promise((resolve) => { manager.onLoad = resolve; });
  manager.onError = (url) => console.warn('No se pudo cargar', url);
  manager.onProgress = (_, loaded, total) => onProgress?.(loaded / total);
  const loader = new THREE.TextureLoader(manager);
  const tex = makeTextures();

  const K = logo.size / 0.7;
  const root = new THREE.Group();
  const stage = new THREE.Group();
  stage.scale.setScalar(K);
  root.add(stage);

  const state = { fade: 0, fit: 1, introT: 99, mode: 0, modeTarget: 0 };
  const updaters = [];
  const fading = [];
  const fadeTo = (material, opacity) => fading.push([material, opacity]);
  const appear = (delay, dur) => clamp01((state.introT - delay) / dur);
  const pop = (delay, dur = 0.6) => Math.max(0.001, easeOutBack(appear(delay, dur)));

  const glowMat = (color, map = tex.softGlow) => new THREE.MeshBasicMaterial({
    map, color, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const glowSprite = (color, map = tex.dot) => new THREE.Sprite(new THREE.SpriteMaterial({
    map, color, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));

  // Imagen como plano. `pivot` es el punto desde el que se anima.
  function card(name, width, pivot = 'center') {
    const [pw, ph] = IMAGES[name];
    const h = width * ph / pw;
    const geo = new THREE.PlaneGeometry(width, h);
    if (pivot === 'bottom') geo.translate(0, h / 2, 0);
    if (pivot === 'top') geo.translate(0, -h / 2, 0);
    const map = loader.load(imagesUrl + name + '.png');
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }));
  }

  // Coloca un objeto: entra desde el logo (si `fly`) y luego flota.
  function place(obj, home, delay, { fly = true, bob = 0.01, sway = 0.06, speed = 1 } = {}) {
    const baseRot = obj.rotation.clone();
    const ph = rand(0, TAU);
    obj.position.copy(home);
    stage.add(obj);
    updaters.push((t) => {
      const e = pop(delay, 0.7);
      if (fly) obj.position.lerpVectors(ORIGIN, home, Math.min(1, e));
      else obj.position.copy(home);
      obj.position.y += Math.sin(t * 1.3 * speed + ph) * bob;
      obj.scale.setScalar(e);
      obj.rotation.set(baseRot.x, baseRot.y + Math.sin(t * 0.8 * speed + ph) * sway, baseRot.z);
      if (obj.material) fadeTo(obj.material, appear(delay, 0.3));
    });
    return obj;
  }

  function addBackdrop() {
    const back = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.5), glowMat(COLOR.purple));
    back.position.set(0, 0.35, -0.5);
    stage.add(back);
    updaters.push((t, dt, kick) => fadeTo(back.material, (0.55 + kick * 0.15) * appear(0.1, 0.8)));
  }

  // Escenario arriba del logo, sin taparlo: truss, pedestal como tarima, público y luces.
  function addStage() {
    const W = 0.88;
    const trussBottom = 0.36;
    const trussTop = trussBottom + W * IMAGES.truss[1] / IMAGES.truss[0];
    place(card('truss', W, 'bottom'), new THREE.Vector3(0, trussBottom, -0.34), 0.25, { fly: false, bob: 0, sway: 0 });

    const stageGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), glowMat(COLOR.orange));
    stageGlow.position.set(0, trussBottom + 0.3, -0.33);
    stage.add(stageGlow);

    const PW = 0.7;
    const pedH = PW * IMAGES.pedestal[1] / IMAGES.pedestal[0];
    place(card('pedestal', PW, 'bottom'), new THREE.Vector3(0, trussBottom - 0.01, -0.22), 0.3, { fly: false, bob: 0, sway: 0 });

    // Pies del público sobre la tapa del pedestal (fila 79 de 321 en la imagen).
    const crowdY = trussBottom - 0.01 + pedH * (1 - 79 / IMAGES.pedestal[1]) - 0.06;
    const crowd = place(card('publico', 0.68, 'bottom'), new THREE.Vector3(0, crowdY, -0.26), 0.5, { fly: false, bob: 0, sway: 0 });

    // Conos de luz desde los 5 reflectores de la imagen, con el color de cada lente.
    const u = W / IMAGES.truss[0];
    const lensX = [160, 272, 388, 503, 613];
    const lensY = trussTop - 205 * u;
    const colors = [COLOR.red, COLOR.orange, COLOR.gold, COLOR.orange, COLOR.pink];
    const spots = lensX.map((px, i) => {
      const g = new THREE.Group();
      g.position.set((px - IMAGES.truss[0] / 2) * u, lensY, -0.3);
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.1, 0.5, 24, 1, true).translate(0, -0.25, 0),
        new THREE.MeshBasicMaterial({
          map: tex.cone, color: colors[i], transparent: true, blending: THREE.AdditiveBlending,
          depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
        }),
      );
      const flare = glowSprite(colors[i]);
      flare.scale.setScalar(0.1);
      flare.position.z = 0.01;
      g.add(cone, flare);
      g.userData = { cone, flare, ph: i * 1.3, dir: i - 2 };
      stage.add(g);
      return g;
    });

    updaters.push((t, dt, kick, beats) => {
      crowd.position.y = crowdY + Math.abs(Math.sin(beats * Math.PI)) * 0.01; // el público salta
      fadeTo(stageGlow.material, (0.4 + kick * 0.3) * appear(0.4, 0.5));
      const on = appear(0.7, 0.6);
      for (const g of spots) {
        const d = g.userData;
        g.rotation.z = d.dir * 0.15 + Math.sin(t * 0.9 + d.ph) * 0.3;
        g.rotation.x = -0.5 + Math.sin(t * 0.7 + d.ph) * 0.15;
        fadeTo(d.cone.material, (0.28 + kick * 0.15) * on);
        fadeTo(d.flare.material, (0.6 + kick * 0.4) * on);
      }
    });
  }

  // Logo 3D en neón: capas apiladas del logo, brillo, halo y reflejo en el papel.
  function addHero() {
    const logoTex = loader.load(logoUrl);
    logoTex.colorSpace = THREE.SRGBColorSpace;
    logoTex.anisotropy = 4;
    const geo = new THREE.PlaneGeometry(1, logo.planeH || 1).translate(-logo.cx, -logo.cy, 0);
    geo.scale(0.7 / logo.size, 0.7 / logo.size, 1);

    const hero = new THREE.Group();
    const LAYERS = 18;
    const dark = new THREE.Color('#8a1030');
    const white = new THREE.Color('#ffffff');
    for (let i = 0; i < LAYERS; i++) {
      const f = i / (LAYERS - 1);
      const layer = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        map: logoTex, alphaTest: 0.5, toneMapped: false, side: THREE.DoubleSide,
        color: i === LAYERS - 1 ? white : dark.clone().lerp(white, f * 0.6),
      }));
      layer.position.z = f * HERO_THICK - HERO_THICK / 2;
      hero.add(layer);
    }

    const shine = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: logoTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    shine.position.z = HERO_THICK / 2 + 0.001;
    const halo = new THREE.Mesh(geo, glowMat(COLOR.pink, null));
    halo.scale.setScalar(1.12);
    halo.position.z = -HERO_THICK / 2 - 0.01;
    hero.add(shine, halo);
    stage.add(hero);

    const img = new Image();
    img.onload = () => { halo.material.map = blurredTexture(img); halo.material.needsUpdate = true; };
    img.src = logoUrl;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6).rotateX(-Math.PI / 2), glowMat(COLOR.pink));
    floor.position.set(0, LOGO_BOTTOM + 0.002, 0.05);
    stage.add(floor);

    updaters.push((t, dt, kick) => {
      const e = Math.max(0.001, easeOutBack(appear(0.05, 0.8)));
      const beat = 1 + kick * 0.03;
      hero.position.set(0, 0.03, 0);
      hero.scale.set(e * beat, Math.min(1.2, e) * beat, e);
      hero.rotation.y = Math.sin(t * 0.6) * 0.08;
      fadeTo(shine.material, 0.25 + kick * 0.45);
      fadeTo(halo.material, halo.material.map ? 0.9 + kick * 0.3 : 0);
      fadeTo(floor.material, (0.55 + kick * 0.3) * appear(0, 0.6));
    });
  }

  // Aros de luz que giran en la base del logo, con un destello que los recorre.
  function addOrbits() {
    const orbit = (rx, rz, y, tilt, color, speed, delay) => {
      const pts = [];
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * TAU;
        pts.push(new THREE.Vector3(Math.cos(a) * rx, y + Math.sin(a) * tilt, Math.sin(a) * rz));
      }
      const curve = new THREE.CatmullRomCurve3(pts, true);
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 200, 0.004, 6, true),
        new THREE.MeshBasicMaterial({ color: '#ffe3f1', toneMapped: false })));
      const glow = new THREE.Mesh(new THREE.TubeGeometry(curve, 200, 0.014, 6, true), glowMat(color, null));
      const comet = glowSprite('#ffffff');
      comet.scale.setScalar(0.06);
      g.add(glow, comet);
      stage.add(g);

      updaters.push((t) => {
        const e = appear(delay, 0.8);
        const s = Math.max(0.001, easeOutBack(e));
        g.scale.set(s, 1, s);
        g.rotation.y = t * speed;
        comet.position.copy(curve.getPointAt((t * 0.25) % 1));
        fadeTo(glow.material, 0.6 * e);
        fadeTo(comet.material, e);
      });
    };
    orbit(0.55, 0.24, -0.16, 0.08, COLOR.magenta, 0.3, 0.5);
    orbit(0.62, 0.3, -0.26, -0.05, COLOR.pink, -0.2, 0.6);
  }

  function addProps() {
    const clap = card('claqueta', 0.22);
    clap.rotation.z = 0.18;
    place(clap, new THREE.Vector3(-0.52, 0.5, 0.08), 0.45, { bob: 0.012, sway: 0.2 });
    updaters.push((t, dt, kick, beats) => {
      const p = (beats / 2) % 1; // aplaude cada 2 tiempos
      clap.rotation.z = 0.18 + (p < 0.12 ? Math.sin(p / 0.12 * Math.PI) * 0.12 : 0);
    });

    const speaker = place(card('parlante', 0.21), new THREE.Vector3(-0.46, 0.1, 0.16), 0.3, { bob: 0.004, sway: 0.15 });
    updaters.push((t, dt, kick) => { if (state.introT > 1) speaker.scale.setScalar(1 + kick * 0.05); });

    const disco = place(card('bola-disco', 0.19, 'top'), new THREE.Vector3(0.56, 1.2, -0.12), 0.55, { bob: 0, sway: 0 });
    const sparks = [0, 1, 2, 3].map(() => {
      const s = glowSprite('#ffffff', tex.sparkle);
      s.userData = { x: rand(-0.06, 0.06), y: rand(-0.27, -0.12), ph: rand(0, TAU), f: rand(3, 6) };
      disco.add(s);
      return s;
    });
    updaters.push((t) => {
      disco.rotation.z = Math.sin(t * 1.2) * 0.06; // péndulo
      for (const s of sparks) {
        const d = s.userData;
        const tw = Math.pow(0.5 + 0.5 * Math.sin(t * d.f + d.ph), 6);
        s.position.set(d.x, d.y, 0.01);
        s.scale.setScalar(0.02 + tw * 0.06);
        fadeTo(s.material, tw * appear(0.6, 0.4));
      }
    });

    const mic = place(card('microfono', 0.15, 'bottom'), new THREE.Vector3(0.44, -0.2, 0.14), 0.4, { bob: 0, sway: 0.08 });
    updaters.push((t) => { mic.rotation.z = 0.22 + Math.sin(t * 0.9) * 0.025; });

    const ticket = card('boleta', 0.19);
    ticket.rotation.z = 0.3;
    place(ticket, new THREE.Vector3(0.55, 0.12, 0.2), 0.5, { bob: 0.016, sway: 0.35, speed: 1.2 });
  }

  function addNeon() {
    const icon = (map, size, home, delay) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }));
      s.scale.setScalar(size);
      const g = new THREE.Group();
      g.add(s);
      place(g, home, delay, { bob: 0.016, sway: 0, speed: 0.8 + Math.random() * 0.4 });
      updaters.push((t, dt, kick) => {
        s.material.rotation = Math.sin(t * 1.2 + home.x * 5) * 0.12;
        fadeTo(s.material, appear(delay, 0.4) * (0.85 + kick * 0.15));
      });
    };
    icon(tex.neonNote, 0.12, new THREE.Vector3(-0.6, 0.85, -0.05), 0.6);
    icon(tex.neonStar, 0.1, new THREE.Vector3(0.58, 0.62, 0.02), 0.65);
    icon(tex.neonBeamed, 0.1, new THREE.Vector3(0.66, 0.3, 0.05), 0.7);
    icon(tex.neonStar, 0.08, new THREE.Vector3(-0.6, 0.44, 0.0), 0.75);

    // Forma de onda que se mueve con la música.
    const wave = new THREE.Group();
    const bars = [];
    for (let i = 0; i < 11; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.007, 1, 0.004),
        new THREE.MeshBasicMaterial({ color: '#ffd1f0', toneMapped: false }));
      bar.position.x = (i - 5) * 0.019;
      wave.add(bar);
      bars.push(bar);
    }
    const waveGlow = glowSprite(COLOR.magenta, tex.softGlow);
    waveGlow.scale.set(0.28, 0.14, 1);
    wave.add(waveGlow);
    place(wave, new THREE.Vector3(0.58, -0.06, 0.16), 0.7, { bob: 0.008, sway: 0.1 });
    updaters.push((t, dt, kick) => {
      bars.forEach((bar, i) => {
        const edge = Math.abs(i - 5) / 5;
        const level = clamp01(0.35 + 0.35 * Math.sin(t * (7 + i % 3) + i) + 0.5 * kick);
        bar.scale.y = 0.02 + (1 - edge * 0.7) * 0.08 * level;
      });
      fadeTo(waveGlow.material, 0.6 + kick * 0.3);
    });
  }

  function addSparkles() {
    const sparkles = [];
    const colors = [COLOR.pink, COLOR.gold, '#ffffff', COLOR.orange];
    for (let i = 0; i < 20; i++) {
      const s = glowSprite(colors[i % 4], tex.sparkle);
      const a = rand(0, TAU);
      const r = rand(0.45, 0.75);
      s.position.set(Math.cos(a) * r, 0.3 + Math.sin(a) * r * 0.75, rand(-0.25, 0.3));
      s.userData = { size: rand(0.022, 0.045), f: rand(2, 5), ph: rand(0, TAU) };
      stage.add(s);
      sparkles.push(s);
    }
    updaters.push((t) => {
      const e = appear(0.6, 0.5);
      for (const s of sparkles) {
        const d = s.userData;
        const tw = Math.pow(0.5 + 0.5 * Math.sin(t * d.f + d.ph), 3);
        s.scale.setScalar(d.size * (0.3 + tw));
        fadeTo(s.material, tw * e);
      }
    });
  }

  // Pared: el logo 3D queda sobre el impreso. Mesa: la base del logo se apoya en el papel.
  function addModeTransition() {
    const wallPos = new THREE.Vector3(logo.cx, logo.cy - 0.03 * K, (HERO_THICK / 2) * K);
    const tablePos = new THREE.Vector3(logo.cx, logo.cy + 0.06 * K, (-LOGO_BOTTOM + 0.005) * K);
    updaters.push((t, dt) => {
      state.mode += (state.modeTarget - state.mode) * Math.min(1, dt * 4);
      const m = easeInOut(clamp01(state.mode));
      stage.rotation.x = m * Math.PI / 2;
      stage.position.lerpVectors(wallPos, tablePos, m);
    });
  }

  addBackdrop();
  addStage();
  addHero();
  addOrbits();
  addProps();
  addNeon();
  addSparkles();
  addModeTransition();

  return {
    group: root,
    ready,
    extent: { side: EXTENT.side * K, up: EXTENT.up * K },
    burst() { state.introT = 0; },
    setMode(mode, instant = false) {
      state.modeTarget = mode === 'mesa' ? 1 : 0;
      if (instant) state.mode = state.modeTarget;
    },
    setFade(f) {
      state.fade = f;
      root.visible = f > 0.002;
    },
    setFit(f) { state.fit = f; },
    update(t, dt) {
      fading.length = 0;
      state.introT = Math.min(99, state.introT + dt);
      const beats = t * BPM / 60;
      const kick = Math.pow(1 - (beats % 1), 4); // golpe al inicio de cada tiempo
      for (const u of updaters) u(t, dt, kick, beats);
      for (const [material, opacity] of fading) material.opacity = opacity * state.fade;
      root.scale.setScalar(Math.max(0.001, easeOutCubic(state.fade)) * state.fit);
    },
  };
}

// ---------- Texturas dibujadas por código ----------
function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Desenfoque barato: el logo reducido a 40 px y ampliado.
function blurredTexture(img) {
  const small = document.createElement('canvas');
  small.width = 40;
  small.height = Math.round(40 * img.height / img.width);
  small.getContext('2d').drawImage(img, 0, 0, small.width, small.height);
  const texture = new THREE.CanvasTexture(small);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function mixWhite(hex, k) {
  return '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), k).getHexString();
}

// Trazo de neón: varias pasadas de brillo y un núcleo claro.
function neonTexture(path, color, width = 12) {
  return canvasTexture(256, 256, (g) => {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const [w, alpha, blur] of [[width * 3, 0.25, 30], [width * 1.7, 0.45, 16], [width, 1, 8]]) {
      g.globalAlpha = alpha;
      g.strokeStyle = color;
      g.shadowColor = color;
      g.shadowBlur = blur;
      g.lineWidth = w;
      path(g);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.shadowBlur = 0;
    g.strokeStyle = mixWhite(color, 0.75);
    g.lineWidth = width * 0.45;
    path(g);
    g.stroke();
  });
}

function makeTextures() {
  const radial = (stops) => canvasTexture(128, 128, (g, s) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    stops.forEach(([p, a]) => grd.addColorStop(p, `rgba(255,255,255,${a})`));
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  });

  const cone = canvasTexture(4, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });

  const sparkle = canvasTexture(64, 64, (g, s) => {
    g.translate(s / 2, s / 2);
    g.fillStyle = '#fff';
    for (let k = 0; k < 2; k++) {
      g.save();
      g.rotate(k * Math.PI / 2);
      g.beginPath();
      g.moveTo(0, -s * 0.48);
      g.quadraticCurveTo(s * 0.05, 0, 0, s * 0.48);
      g.quadraticCurveTo(-s * 0.05, 0, 0, -s * 0.48);
      g.fill();
      g.restore();
    }
  });

  const note = (g) => {
    g.beginPath();
    g.ellipse(92, 186, 22, 15, -0.4, 0, TAU);
    g.moveTo(112, 180); g.lineTo(112, 56);
    g.moveTo(112, 56); g.bezierCurveTo(150, 70, 186, 92, 170, 140);
  };
  const beamedNotes = (g) => {
    g.beginPath();
    g.ellipse(70, 194, 20, 14, -0.4, 0, TAU);
    g.moveTo(198, 172); g.ellipse(180, 172, 20, 14, -0.4, 0, TAU);
    g.moveTo(88, 190); g.lineTo(88, 72);
    g.moveTo(198, 168); g.lineTo(198, 50);
    g.moveTo(88, 72); g.lineTo(198, 50);
  };
  const star = (g) => {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 40 : 92;
      const a = -Math.PI / 2 + (i / 10) * TAU;
      const x = 128 + Math.cos(a) * r;
      const y = 132 + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
  };

  return {
    dot: radial([[0, 1], [0.25, 0.8], [1, 0]]),
    softGlow: radial([[0, 0.9], [0.5, 0.3], [1, 0]]),
    cone,
    sparkle,
    neonNote: neonTexture(note, COLOR.pink),
    neonBeamed: neonTexture(beamedNotes, COLOR.magenta),
    neonStar: neonTexture(star, COLOR.gold),
  };
}
