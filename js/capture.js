// Foto y video de lo que se ve en pantalla (cámara + escena) para guardar o compartir.
// Todo se procesa en el celular; nada se envía a ningún servidor.
const MAX_VIDEO_MS = 15000;
const VIDEO_TYPES = [
  ['video/mp4;codecs=avc1.42E01E', 'mp4'],
  ['video/mp4', 'mp4'],
  ['video/webm;codecs=vp9', 'webm'],
  ['video/webm', 'webm'],
];

export function createCapture({ container, renderer, getVideo, logoUrl = './assets/logo.png' }) {
  const out = document.createElement('canvas');
  const ctx = out.getContext('2d');
  const watermark = new Image();
  watermark.src = logoUrl;

  let pendingPhoto = null;
  let recording = null;
  let scale = 1;

  const videoType = () => (window.MediaRecorder && VIDEO_TYPES.find(([t]) => MediaRecorder.isTypeSupported(t))) || null;

  function resize(newScale) {
    scale = newScale;
    out.width = Math.round(container.clientWidth * scale / 2) * 2;   // pares: requisito del video H.264
    out.height = Math.round(container.clientHeight * scale / 2) * 2;
  }

  // Posición en pantalla de un elemento, según los estilos que le pone MindAR.
  function rectOf(el) {
    const w = parseFloat(el.style.width), h = parseFloat(el.style.height);
    if (!w || !h) return [0, 0, container.clientWidth, container.clientHeight];
    return [parseFloat(el.style.left) || 0, parseFloat(el.style.top) || 0, w, h];
  }

  function compose() {
    const W = container.clientWidth, H = container.clientHeight;
    ctx.setTransform(out.width / W, 0, 0, out.height / H, 0, 0);
    ctx.fillStyle = '#0b0710';
    ctx.fillRect(0, 0, W, H);
    const video = getVideo?.();
    if (video && video.readyState >= 2) ctx.drawImage(video, ...rectOf(video));
    ctx.drawImage(renderer.domElement, ...rectOf(renderer.domElement));

    if (watermark.naturalWidth) {
      const w = Math.min(W, H) * 0.2;
      const h = w * watermark.naturalHeight / watermark.naturalWidth;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(watermark, W - w - 8, H - h - 8, w, h);
      ctx.globalAlpha = 1;
    }
  }

  return {
    canRecord: () => !!videoType(),
    isRecording: () => !!recording,
    progress: () => (recording ? Math.min(1, (performance.now() - recording.start) / MAX_VIDEO_MS) : 0),

    // Pide una foto; se toma justo después del siguiente cuadro dibujado.
    photo() {
      if (recording) return Promise.resolve(null);
      return new Promise((resolve) => { pendingPhoto = resolve; });
    },

    startVideo(onDone) {
      const type = videoType();
      if (!type || recording) return false;
      resize(Math.min(1.5, 1280 / Math.max(container.clientWidth, container.clientHeight)));
      compose();
      const recorder = new MediaRecorder(out.captureStream(30), { mimeType: type[0], videoBitsPerSecond: 6e6 });
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        clearTimeout(recording.timer);
        recording = null;
        onDone(new Blob(chunks, { type: type[0].split(';')[0] }), type[1]);
      };
      recorder.start(250);
      recording = { recorder, start: performance.now(), timer: setTimeout(() => recorder.stop(), MAX_VIDEO_MS) };
      return true;
    },

    stopVideo() {
      if (recording?.recorder.state === 'recording') recording.recorder.stop();
    },

    // Llamar justo después de renderer.render(): el lienzo 3D aún tiene la imagen del cuadro.
    afterRender() {
      if (recording) compose();
      if (pendingPhoto) {
        const resolve = pendingPhoto;
        pendingPhoto = null;
        resize(Math.min(2, window.devicePixelRatio || 1));
        compose();
        out.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92);
      }
    },
  };
}

// Abre el menú de compartir del celular; si no se puede, descarga el archivo.
export async function shareFile(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // el usuario cerró el menú
    }
  }
  downloadFile(blob, name);
}

export function downloadFile(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
