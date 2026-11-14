// Escena 3D de concierto que sale del logo.
// Unidades: el ancho del marcador = 1. Origen en el centro del marcador,
// X a la derecha, Y hacia arriba, Z saliendo del papel hacia la cámara.
//
// Todo se construye por código (sin descargas). Gráficos 2D propios opcionales:
// ver assets/fx/LEEME.md.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const BRAND = '#DA2950';
const PALETTE = [BRAND, '#FF4FD8', '#FFD166', '#4CC9F0', '#8B5CF6', '#FFFFFF'];
const BPM = 120;

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

// ---------------------------------------------------------------------------
// Gráficos 2D propios (opcionales) en assets/fx/
export async function loadCustomTextures(base = './assets/fx/') {
  const loader = new THREE.TextureLoader();
  const load = (name) => new Promise((resolve) => {
    loader.load(base + name, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.userData.aspect = t.image.width / t.image.height;
      resolve(t);
    }, undefined, () => resolve(null));
  });
  const [floaters, sparkle, glow, ring] = await Promise.all([
    Promise.all([1, 2, 3, 4, 5, 6].map((i) => load(`flotante${i}.png`))),
    load('destello.png'), load('halo.png'), load('onda.png'),
  ]);
  const out = {};
  const f = floaters.filter(Boolean);
  if (f.length) out.floaters = f;
  if (sparkle) out.sparkle = sparkle;
  if (glow) out.glow = glow;
  if (ring) out.ring = ring;
  return out;
}

// ---------------------------------------------------------------------------
export function createEffects({ renderer, logo = { cx: 0, cy: 0, size: 1 }, custom = {}, logoUrl = './assets/logo.png' } = {}) {
  const tex = { ...makeTextures(), ...custom };
  const tint = (key, color) => (custom[key] ? '#ffffff' : color);
  const aspect = (map) => (map && map.userData.aspect) || 1;

  const root = new THREE.Group();
  const C = new THREE.Vector3(logo.cx, logo.cy, 0);
  const S = logo.size;
  // posición X a los lados del logo (para que nada pase por encima de él)
  const sideX = () => C.x + (Math.random() < 0.5 ? -1 : 1) * rand(S * 0.72, 1.05);
  const state = { fade: 0, introT: 99, started: false };
  const fading = [];     // [material, opacidad] para capas transparentes
  const updaters = [];   // funciones (t, dt, kick, beat)

  // Entorno de reflejos para que los metales brillen
  let env = null;
  if (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }
  const std = (o) => new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 1.3, ...o });
  const appear = (delay, dur) => clamp01((state.introT - delay) / dur);

  // ---------- Luces (se mueven con el logo) ----------
  root.add(new THREE.HemisphereLight('#ffffff', '#40142a', 1.5));
  const key = new THREE.DirectionalLight('#ffffff', 2.4);
  key.position.set(0.7, 1.2, 1.6);
  root.add(key, key.target);
  const pulseLight = new THREE.PointLight(BRAND, 2, 2.5, 1.2);
  pulseLight.position.set(C.x, C.y, 0.35);
  root.add(pulseLight);

  // ---------- EL LOGO, protagonista: se levanta del papel con grosor ----------
  {
    const logoTex = new THREE.TextureLoader().load(logoUrl);
    logoTex.colorSpace = THREE.SRGBColorSpace;
    logoTex.anisotropy = 4;
    // misma medida que la imagen del marcador, centrada en el logo para que gire sobre sí mismo
    const geo = new THREE.PlaneGeometry(1, logo.planeH || 1).translate(-C.x, -C.y, 0);
    const hero = new THREE.Group();
    const LAYERS = 10, THICK = 0.035;
    const dark = new THREE.Color('#3d0614'), white = new THREE.Color('#ffffff');
    for (let i = 0; i < LAYERS; i++) {
      const f = i / (LAYERS - 1);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        map: logoTex, alphaTest: 0.5, toneMapped: false,
        color: i === LAYERS - 1 ? white : dark.clone().lerp(white, f * 0.55),
      }));
      m.position.z = f * THICK;
      hero.add(m);
    }
    const flash = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: logoTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    flash.position.z = THICK + 0.001;
    hero.add(flash);
    const shadow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: logoTex, color: '#000000', transparent: true, depthWrite: false }));
    root.add(shadow, hero);
    updaters.push((t, dt, kick) => {
      const e = Math.max(0, easeOutBack(appear(0, 0.8)));
      const lift = 0.075 * e;
      hero.position.set(C.x, C.y, lift);
      hero.rotation.set(Math.sin(t * 0.9) * 0.09 * e, Math.sin(t * 0.7) * 0.12 * e, 0);
      hero.scale.setScalar(1 + kick * 0.035 * e);
      shadow.position.set(C.x + lift * 0.25, C.y - lift * 0.35, 0.002);
      fading.push([flash.material, kick * 0.45 * e], [shadow.material, 0.5 * Math.min(1, e)]);
    });
  }

  // ---------- Contraluz: resplandor y ondas DETRÁS del logo ----------
  const deepGlow = sprite(tex.glow, tint('glow', BRAND), true);
  deepGlow.position.set(C.x, C.y, -0.2);
  const halo = sprite(tex.glow, tint('glow', BRAND), true);
  halo.position.set(C.x, C.y, -0.03);
  root.add(deepGlow, halo);
  const rings = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: tex.ring, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(C.x, C.y, -0.02);
    root.add(m);
    return m;
  });
  updaters.push((t, dt, kick) => {
    const pop = easeOutBack(appear(0, 0.6));
    deepGlow.scale.setScalar(S * (2.8 + kick * 0.4) * Math.max(0.001, pop));
    halo.scale.setScalar(S * (1.9 + kick * 0.25) * Math.max(0.001, pop));
    fading.push([deepGlow.material, 0.35 + kick * 0.2], [halo.material, 0.55 + kick * 0.35]);
    rings.forEach((r, i) => {
      const first = i === 0 && state.introT < 1;
      const p = first ? clamp01(state.introT) : ((t * BPM / 60) / 2 + i / rings.length) % 1;
      r.scale.setScalar(S * (1.25 + p * (first ? 2.4 : 1.5)));
      fading.push([r.material, (1 - p) * (first ? 1 : 0.35)]);
    });
    pulseLight.intensity = 1 + kick * 4;
  });

  // ---------- Ecualizador 3D alrededor del logo ----------
  {
    const BARS = 40, R = S * 0.82;
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
    const mat = std({ color: '#ffffff', metalness: 0.35, roughness: 0.3, emissive: '#220010', emissiveIntensity: 1 });
    const bars = new THREE.InstancedMesh(geo, mat, BARS);
    const col = new THREE.Color();
    const stops = [new THREE.Color(BRAND), new THREE.Color('#FF4FD8'), new THREE.Color('#FFD166'), new THREE.Color(BRAND)];
    for (let i = 0; i < BARS; i++) {
      const u = (i / BARS) * (stops.length - 1);
      const k = Math.floor(u);
      col.copy(stops[k]).lerp(stops[Math.min(stops.length - 1, k + 1)], u - k);
      bars.setColorAt(i, col);
    }
    root.add(bars);
    const o = new THREE.Object3D();
    updaters.push((t, dt, kick) => {
      for (let i = 0; i < BARS; i++) {
        const a = (i / BARS) * TAU;
        const grow = easeOutBack(appear(i * 0.012, 0.45));
        const wave = 0.5 + 0.5 * Math.sin(a * 3 - t * 5);
        const jitter = 0.5 + 0.5 * Math.sin(t * (7 + (i % 5)) + i * 1.9);
        const bass = Math.pow(Math.max(0, Math.cos(a * 2)), 2);
        const h = 0.015 + 0.17 * clamp01(0.15 + 0.35 * wave * jitter + 0.6 * kick * (0.4 + bass));
        o.position.set(C.x + Math.cos(a) * R, C.y + Math.sin(a) * R, 0);
        o.rotation.set(0, 0, a);
        o.scale.set(0.03, 0.042, Math.max(0.001, h * grow));
        o.updateMatrix();
        bars.setMatrixAt(i, o.matrix);
      }
      bars.instanceMatrix.needsUpdate = true;
    });
  }

  // ---------- Reflectores de escenario (conos de luz 3D) ----------
  {
    const xs = [-0.75, -0.25, 0.25, 0.75];
    const lights = xs.map((x, i) => {
      const g = new THREE.Group();
      // detrás del logo: contraluz de escenario
      g.position.set(C.x + x * S * 1.2, C.y + S * 1.1, i === 0 || i === 3 ? -0.1 : -0.22);
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.036, 0.07, 18),
        std({ color: '#22222a', metalness: 0.9, roughness: 0.35 }));
      const lens = sprite(tex.glow, PALETTE[i % PALETTE.length], true);
      lens.position.y = -0.04; lens.scale.setScalar(0.12);
      const coneMat = new THREE.MeshBasicMaterial({
        map: tex.cone, color: PALETTE[(i + 1) % 4], transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.5, 32, 1, true).translate(0, -0.75, 0), coneMat);
      g.add(cone, can, lens);
      g.userData = { base: (x < 0 ? -1 : 1) * 0.25, speed: rand(0.6, 1.0), phase: rand(0, TAU), cone, lens };
      root.add(g);
      return g;
    });
    updaters.push((t, dt, kick) => {
      const on = appear(0.6, 0.6);
      lights.forEach((g) => {
        const d = g.userData;
        g.rotation.z = d.base + Math.sin(t * d.speed + d.phase) * 0.55;
        g.rotation.x = 0.35 + Math.sin(t * d.speed * 0.7 + d.phase) * 0.2;
        g.scale.setScalar(Math.max(0.001, easeOutBack(appear(0.5, 0.5))));
        fading.push([d.cone.material, (0.22 + kick * 0.12) * on], [d.lens.material, 0.9 * on]);
      });
    });
  }

  // ---------- Bola de disco ----------
  {
    const disco = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 3),
      std({ color: '#f2f2fa', metalness: 1, roughness: 0.08, flatShading: true, envMapIntensity: 2.4 }));
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.6, 6).translate(0, 0.4, 0),
      std({ color: '#888', metalness: 0.8, roughness: 0.4 }));
    disco.add(ball, cord);
    const home = new THREE.Vector3(C.x, C.y + S * 0.86, 0.34);
    root.add(disco);

    const dots = [];
    for (let i = 0; i < 16; i++) {
      const s = sprite(tex.sparkle, pick(['#ffffff', '#FFD166', '#4CC9F0', '#FF4FD8']), true);
      s.userData = { r: rand(0.18, 0.5), a: rand(0, TAU), tilt: rand(-0.4, 0.4), sp: rand(0.5, 1.2), size: rand(0.03, 0.06), ph: rand(0, TAU) };
      root.add(s);
      dots.push(s);
    }
    updaters.push((t, dt, kick) => {
      const e = appear(0.45, 0.9);
      disco.position.set(home.x, home.y + (1 - easeOutBack(e)) * 0.8, home.z);
      disco.scale.setScalar(Math.max(0.001, e));
      ball.rotation.y += dt * 1.3;
      disco.rotation.z = Math.sin(t * 1.1) * 0.06;
      dots.forEach((s) => {
        const d = s.userData;
        d.a += dt * d.sp;
        s.position.set(
          disco.position.x + Math.cos(d.a) * d.r,
          disco.position.y + Math.sin(d.a) * d.r * d.tilt * 0.4,
          disco.position.z + Math.sin(d.a) * d.r * 0.8
        );
        const tw = Math.pow(0.5 + 0.5 * Math.sin(t * 6 + d.ph), 4);
        s.scale.setScalar(d.size * (0.4 + tw) * e);
        fading.push([s.material, tw * e]);
      });
    });
  }

  // ---------- Vinilo con el logo en la etiqueta ----------
  {
    const vinylTex = makeVinylTexture(logoUrl);
    const rim = std({ color: '#111116', metalness: 0.4, roughness: 0.4 });
    const face = std({ map: vinylTex, metalness: 0.05, roughness: 0.35, envMapIntensity: 0.5 });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.01, 64), [rim, face, face]);
    const g = new THREE.Group();
    g.add(disc);
    const home = new THREE.Vector3(C.x - S * 0.92, C.y + S * 0.28, 0.24);
    root.add(g);
    updaters.push((t, dt) => {
      const e = easeOutBack(appear(0.3, 0.8));
      g.position.lerpVectors(C, home, Math.min(1, e));
      g.position.y += Math.sin(t * 1.4) * 0.02;
      g.scale.setScalar(Math.max(0.001, e));
      g.rotation.set(Math.PI / 2 - 0.35 + Math.sin(t * 0.8) * 0.12, 0, 0.45);
      disc.rotation.y -= dt * 3.5;
    });
  }

  // ---------- Micrófono ----------
  {
    const mic = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.LatheGeometry([
      new THREE.Vector2(0.0, -0.24), new THREE.Vector2(0.02, -0.24), new THREE.Vector2(0.024, -0.1),
      new THREE.Vector2(0.032, 0.01), new THREE.Vector2(0.036, 0.04), new THREE.Vector2(0.0, 0.04),
    ], 28), std({ color: '#1b1b22', metalness: 0.85, roughness: 0.3 }));
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.037, 0.007, 10, 28).rotateX(Math.PI / 2).translate(0, 0.042, 0),
      std({ color: BRAND, metalness: 0.7, roughness: 0.25 }));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.056, 28, 18).translate(0, 0.095, 0),
      std({ color: '#c9c9d4', metalness: 0.95, roughness: 0.38 }));
    const grill = new THREE.Mesh(new THREE.SphereGeometry(0.0575, 14, 9).translate(0, 0.095, 0),
      new THREE.MeshBasicMaterial({ color: '#2a2a33', wireframe: true }));
    mic.add(handle, collar, head, grill);
    const home = new THREE.Vector3(C.x + S * 0.92, C.y + S * 0.24, 0.26);
    root.add(mic);
    updaters.push((t, dt, kick) => {
      const e = easeOutBack(appear(0.38, 0.8));
      mic.position.lerpVectors(C, home, Math.min(1, e));
      mic.position.y += Math.sin(t * 1.2 + 1) * 0.025;
      mic.scale.setScalar(Math.max(0.001, e) * (1 + kick * 0.04));
      mic.rotation.set(0.35, Math.sin(t * 0.9) * 0.5, -0.55 + Math.sin(t * 1.3) * 0.08);
    });
  }

  // ---------- Parlantes que laten con el bajo ----------
  {
    const makeSpeaker = () => {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.25, 0.1), std({ color: '#17171d', metalness: 0.2, roughness: 0.55 }));
      const trim = std({ color: BRAND, metalness: 0.6, roughness: 0.3 });
      const metal = std({ color: '#3a3a44', metalness: 0.8, roughness: 0.35 });
      const woofer = new THREE.Group();
      woofer.add(
        new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.009, 10, 32), trim),
        new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.025, 32, 1, true).rotateX(-Math.PI / 2), metal),
        new THREE.Mesh(new THREE.SphereGeometry(0.016, 16, 10), std({ color: '#0d0d10', metalness: 0.5, roughness: 0.3 }))
      );
      woofer.position.set(0, -0.04, 0.05);
      const tweeter = new THREE.Group();
      tweeter.add(
        new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 8, 24), trim),
        new THREE.Mesh(new THREE.SphereGeometry(0.014, 14, 8), metal)
      );
      tweeter.position.set(0, 0.075, 0.05);
      g.add(box, woofer, tweeter);
      g.userData.woofer = woofer;
      return g;
    };
    const speakers = [-1, 1].map((side) => {
      const s = makeSpeaker();
      s.userData.home = new THREE.Vector3(C.x + side * S * 0.86, C.y - S * 0.58, 0.06);
      s.userData.side = side;
      root.add(s);
      return s;
    });
    updaters.push((t, dt, kick) => {
      const e = easeOutBack(appear(0.15, 0.6));
      speakers.forEach((s) => {
        const d = s.userData;
        s.position.copy(d.home);
        s.rotation.set(0.15, -d.side * 0.4, 0);
        s.scale.set(Math.max(0.001, e) * (1 + kick * 0.05), Math.max(0.001, e) * (1 + kick * 0.05), Math.max(0.001, e));
        d.woofer.position.z = 0.05 + kick * 0.018;
        d.woofer.scale.setScalar(1 + kick * 0.12);
      });
    });
  }

  // ---------- Notas musicales 3D (con grosor) ----------
  const noteGeos = makeNoteGeometries();
  const notes = [];
  for (let i = 0; i < 14; i++) {
    const color = PALETTE[i % PALETTE.length];
    const m = new THREE.Mesh(noteGeos[i % noteGeos.length],
      std({ color, metalness: 0.55, roughness: 0.22, emissive: color, emissiveIntensity: 0.25 }));
    m.userData = { v: new THREE.Vector3(), age: 0, life: 1, size: 0.1, spin: 1, ph: 0 };
    spawnNote(m, false);
    m.userData.age = rand(0, m.userData.life);
    root.add(m);
    notes.push(m);
  }
  // Las notas nacen en el borde del logo y se alejan hacia afuera: nunca lo tapan.
  function spawnNote(m, burst) {
    const d = m.userData;
    const a = rand(0, TAU);
    const r = S * rand(0.78, 0.9);
    m.position.set(C.x + Math.cos(a) * r, C.y + Math.sin(a) * r, rand(0.02, 0.12));
    const sp = burst ? rand(0.35, 0.6) : rand(0.08, 0.16);
    d.v.set(Math.cos(a) * sp, Math.sin(a) * sp, burst ? rand(0.08, 0.2) : rand(0.0, 0.06));
    d.age = 0;
    d.life = rand(3, 4.5);
    d.size = rand(0.09, 0.14);
    d.spin = rand(1.2, 2.5) * (Math.random() < 0.5 ? -1 : 1);
    d.ph = rand(0, TAU);
    m.rotation.set(rand(-0.3, 0.3), rand(0, TAU), rand(-0.3, 0.3));
  }
  updaters.push((t, dt, kick) => {
    notes.forEach((m) => {
      const d = m.userData;
      d.age += dt;
      if (d.age >= d.life) spawnNote(m, false);
      // frena la ráfaga pero mantiene un empuje suave hacia afuera
      const damp = Math.exp(-0.9 * dt);
      const len = Math.hypot(d.v.x, d.v.y);
      if (len > 0.1) { d.v.x *= damp; d.v.y *= damp; }
      d.v.z *= Math.exp(-1.2 * dt);
      m.position.addScaledVector(d.v, dt);
      m.position.x += Math.sin(d.age * 2 + d.ph) * 0.04 * dt;
      m.rotation.y += d.spin * dt;
      m.rotation.z = Math.sin(d.age * 1.7 + d.ph) * 0.3;
      const s = d.size * easeOutBack(clamp01(d.age / 0.45)) * clamp01((d.life - d.age) / 0.7) * (1 + kick * 0.1);
      m.scale.setScalar(Math.max(0.001, s));
    });
  });

  // ---------- Estrellas doradas en órbita (pasan por delante y por detrás) ----------
  {
    const starGeo = makeStarGeometry();
    const gold = std({ color: '#FFD166', metalness: 0.9, roughness: 0.18, emissive: '#5a3a00', emissiveIntensity: 0.6 });
    const stars = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(starGeo, gold);
      m.userData = { a: (i / 6) * TAU, sp: rand(0.25, 0.4), r: S * rand(1.1, 1.3), size: rand(0.05, 0.08), ph: rand(0, TAU) };
      root.add(m);
      stars.push(m);
    }
    updaters.push((t, dt) => {
      const e = easeOutBack(appear(0.7, 0.7));
      stars.forEach((m) => {
        const d = m.userData;
        d.a += dt * d.sp;
        m.position.set(C.x + Math.cos(d.a) * d.r, C.y + Math.sin(d.a) * d.r * 0.85, 0.1 + Math.sin(d.a + d.ph) * 0.25);
        m.rotation.y += dt * 2;
        m.rotation.x = Math.sin(t + d.ph) * 0.4;
        m.scale.setScalar(Math.max(0.001, d.size * e));
      });
    });
  }

  // ---------- Confeti 3D ----------
  const CONF = 90;
  const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.018, 0.03),
    std({ color: '#ffffff', metalness: 0.3, roughness: 0.45, side: THREE.DoubleSide }), CONF);
  const conf = [];
  {
    const col = new THREE.Color();
    for (let i = 0; i < CONF; i++) {
      confetti.setColorAt(i, col.set(PALETTE[i % PALETTE.length]));
      const c = { p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(rand(0, TAU), rand(0, TAU), 0), w: new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-3, 3)), ph: rand(0, TAU), live: false };
      resetConfetti(c, true);
      conf.push(c);
    }
    root.add(confetti);
  }
  // El confeti cae por los lados, dejando libre la zona del logo.
  function resetConfetti(c, anywhere) {
    c.p.set(sideX(), C.y + (anywhere ? rand(-0.9, 1.2) : rand(1.0, 1.3)), rand(-0.1, 0.45));
    c.v.set(0, rand(-0.18, -0.1), 0);
  }
  {
    const o = new THREE.Object3D();
    updaters.push((t, dt) => {
      const show = state.started;
      for (let i = 0; i < CONF; i++) {
        const c = conf[i];
        c.v.y = Math.max(c.v.y - 0.7 * dt, -0.16);
        c.v.x *= Math.exp(-1.4 * dt);
        c.v.z *= Math.exp(-1.4 * dt);
        c.p.addScaledVector(c.v, dt);
        c.p.x += Math.sin(t * 2 + c.ph) * 0.05 * dt;
        // si cae sobre el logo, lo empuja hacia el costado
        const dx = c.p.x - C.x;
        if (Math.abs(dx) < S * 0.62 && Math.abs(c.p.y - C.y) < S * 0.75 && c.p.z > -0.05) {
          c.v.x += Math.sign(dx || 1) * 3 * dt;
        }
        if (c.p.y < C.y - 1.0) resetConfetti(c, false);
        c.r.x += c.w.x * dt; c.r.y += c.w.y * dt; c.r.z += c.w.z * dt;
        o.position.copy(c.p);
        o.rotation.copy(c.r);
        o.scale.setScalar(show ? 1 : 0.001);
        o.updateMatrix();
        confetti.setMatrixAt(i, o.matrix);
      }
      confetti.instanceMatrix.needsUpdate = true;
    });
  }

  // ---------- Destellos (2D, a varias profundidades) ----------
  {
    const sparkles = [];
    for (let i = 0; i < 26; i++) {
      const s = sprite(tex.sparkle, tint('sparkle', pick(['#ffffff', '#FFD166', '#FF4FD8'])), true);
      s.position.set(sideX(), C.y + rand(-0.8, 1.0), rand(-0.3, 0.45));
      s.userData = { size: rand(0.03, 0.07), f: rand(1.5, 4), ph: rand(0, TAU), vy: rand(0.01, 0.05) };
      root.add(s);
      sparkles.push(s);
    }
    updaters.push((t, dt) => {
      const e = clamp01(state.introT * 2);
      sparkles.forEach((s) => {
        const d = s.userData;
        const tw = Math.pow(0.5 + 0.5 * Math.sin(t * d.f + d.ph), 3);
        s.position.y += d.vy * dt;
        if (s.position.y > C.y + 1.0) s.position.y = C.y - 0.8;
        const sz = d.size * (0.3 + tw);
        s.scale.set(sz * aspect(s.material.map), sz, 1);
        s.material.rotation = t * 0.5 + d.ph;
        fading.push([s.material, tw * e]);
      });
    });
  }

  // ---------- Imágenes propias flotando (solo si existen en assets/fx/) ----------
  if (custom.floaters) {
    const floaters = [];
    for (let i = 0; i < 10; i++) {
      const s = sprite(custom.floaters[i % custom.floaters.length], '#ffffff', false);
      s.userData = { age: rand(0, 4), life: rand(3, 4.5), v: new THREE.Vector3(), size: rand(0.1, 0.16), ph: rand(0, TAU) };
      respawnFloater(s);
      root.add(s);
      floaters.push(s);
    }
    function respawnFloater(s) {
      const d = s.userData;
      const a = rand(0, TAU), r = S * rand(0.8, 0.95);
      s.position.set(C.x + Math.cos(a) * r, C.y + Math.sin(a) * r, rand(0.05, 0.2));
      d.v.set(Math.cos(a) * 0.12, Math.sin(a) * 0.12, rand(0.0, 0.05));
      d.age = 0;
    }
    updaters.push((t, dt) => {
      floaters.forEach((s) => {
        const d = s.userData;
        d.age += dt;
        if (d.age > d.life) respawnFloater(s);
        s.position.addScaledVector(d.v, dt);
        const life = clamp01(d.age / 0.4) * clamp01((d.life - d.age) / 0.8);
        const sz = d.size * (0.6 + 0.4 * life);
        s.scale.set(sz * aspect(s.material.map), sz, 1);
        s.material.rotation = Math.sin(d.age * 1.5 + d.ph) * 0.25;
        fading.push([s.material, life]);
      });
    });
  }

  // ---------- API ----------
  function burst() {
    state.introT = 0;
    state.started = true;
    notes.slice(0, 9).forEach((n) => spawnNote(n, true));
    conf.forEach((c, i) => {
      if (i % 2) return;
      const a = rand(0, TAU), r = S * 0.85;
      c.p.set(C.x + Math.cos(a) * r, C.y + Math.sin(a) * r, 0.05);
      c.v.set(Math.cos(a) * rand(0.4, 1.0), Math.sin(a) * rand(0.4, 1.0) + 0.2, rand(0.0, 0.25));
    });
  }

  function setFade(f) {
    state.fade = f;
    root.visible = f > 0.002;
    root.scale.setScalar(Math.max(0.001, easeOutCubic(f)));
  }

  function update(t, dt) {
    fading.length = 0;
    state.introT = Math.min(99, state.introT + dt);
    const beat = (t * BPM / 60) % 1;
    const kick = Math.pow(1 - beat, 4);
    for (const u of updaters) u(t, dt, kick, beat);
    for (const [mat, o] of fading) mat.opacity = o * state.fade;
  }

  return { group: root, update, burst, setFade };
}

// ---------------------------------------------------------------------------
// Geometrías

function makeNoteGeometries() {
  const extrude = (shapes) => {
    const g = new THREE.ExtrudeGeometry(shapes, {
      depth: 0.14, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 3, curveSegments: 14,
    });
    g.center();
    return g;
  };
  const head = (x, y) => { const s = new THREE.Shape(); s.absellipse(x, y, 0.29, 0.2, 0, TAU, false, 0.4); return s; };
  const rect = (x, y, w, h) => { const s = new THREE.Shape(); s.moveTo(x, y); s.lineTo(x + w, y); s.lineTo(x + w, y + h); s.lineTo(x, y + h); s.closePath(); return s; };

  // corchea
  const flag = new THREE.Shape();
  flag.moveTo(0.2, 1.05);
  flag.bezierCurveTo(0.3, 0.8, 0.68, 0.75, 0.55, 0.32);
  flag.bezierCurveTo(0.62, 0.62, 0.4, 0.72, 0.2, 0.8);
  flag.closePath();
  const eighth = extrude([head(0, 0), rect(0.2, 0, 0.09, 1.05), flag]);

  // dos corcheas unidas
  const beam = new THREE.Shape();
  beam.moveTo(0.2, 0.86); beam.lineTo(0.99, 1.04); beam.lineTo(0.99, 1.22); beam.lineTo(0.2, 1.04); beam.closePath();
  const beamed = extrude([head(0, 0), head(0.7, 0.18), rect(0.2, 0, 0.09, 1.04), rect(0.9, 0.18, 0.09, 1.04), beam]);

  // negra
  const quarter = extrude([head(0, 0), rect(0.2, 0, 0.09, 1.0)]);

  return [eighth, beamed, eighth, quarter, beamed];
}

function makeStarGeometry() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.42 : 1;
    const a = Math.PI / 2 + (i / 10) * TAU;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.25, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 2 });
  g.center();
  return g;
}

// ---------------------------------------------------------------------------
// Texturas

function sprite(map, color, additive) {
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map, color, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  }));
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function pixelTexture(w, h, fn) {
  return canvasTexture(w, h, (g) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(clamp01(fn(x / (w - 1), y / (h - 1))) * 255);
    }
    g.putImageData(img, 0, 0);
  });
}

function makeTextures() {
  const glow = pixelTexture(128, 128, (u, v) => Math.pow(clamp01(1 - Math.hypot(u - 0.5, v - 0.5) * 2), 2.2));
  const ring = pixelTexture(256, 256, (u, v) => Math.exp(-Math.pow((Math.hypot(u - 0.5, v - 0.5) * 2 - 0.82) / 0.07, 2)));
  // haz del reflector: brillante en la punta (arriba de la textura), se desvanece hacia la base
  const cone = pixelTexture(4, 256, (u, v) => Math.pow(1 - v, 1.4) * 0.9);

  const sparkle = canvasTexture(128, 128, (g, s) => {
    g.translate(s / 2, s / 2);
    const core = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.22);
    core.addColorStop(0, 'rgba(255,255,255,1)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = core;
    g.beginPath(); g.arc(0, 0, s * 0.22, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.95)';
    for (let k = 0; k < 2; k++) {
      g.save(); g.rotate(k * Math.PI / 2);
      g.beginPath();
      g.moveTo(0, -s * 0.48);
      g.quadraticCurveTo(s * 0.035, 0, 0, s * 0.48);
      g.quadraticCurveTo(-s * 0.035, 0, 0, -s * 0.48);
      g.fill(); g.restore();
    }
  });

  return { glow, ring, cone, sparkle };
}

function makeVinylTexture(logoUrl) {
  const S = 512, c = S / 2;
  const tex = canvasTexture(S, S, (g) => {
    g.fillStyle = '#0c0c10';
    g.beginPath(); g.arc(c, c, c, 0, TAU); g.fill();
    for (let r = c * 0.36; r < c * 0.98; r += 2.5) {
      g.strokeStyle = `rgba(255,255,255,${0.025 + Math.random() * 0.05})`;
      g.lineWidth = 1;
      g.beginPath(); g.arc(c, c, r, 0, TAU); g.stroke();
    }
    for (const a0 of [0.7, 0.7 + Math.PI]) {
      const grd = g.createRadialGradient(c, c, c * 0.36, c, c, c);
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(0.5, 'rgba(255,255,255,0.14)');
      grd.addColorStop(1, 'rgba(255,255,255,0.03)');
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(c, c); g.arc(c, c, c * 0.98, a0 - 0.22, a0 + 0.22); g.closePath(); g.fill();
    }
    g.fillStyle = BRAND; g.beginPath(); g.arc(c, c, c * 0.34, 0, TAU); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(c, c, c * 0.29, 0, TAU); g.fill();
    g.fillStyle = '#0c0c10'; g.beginPath(); g.arc(c, c, c * 0.025, 0, TAU); g.fill();
  });
  // pone el logo de la marca en la etiqueta del vinilo
  const img = new Image();
  img.onload = () => {
    const g = tex.image.getContext('2d');
    const w = S * 0.4, h = w * img.height / img.width;
    g.drawImage(img, c - w / 2, c - h / 2, w, h);
    g.fillStyle = '#0c0c10'; g.beginPath(); g.arc(c, c, c * 0.025, 0, TAU); g.fill();
    tex.needsUpdate = true;
  };
  img.src = logoUrl;
  return tex;
}
