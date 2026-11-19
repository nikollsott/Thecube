# Thecube — experiencia WebAR

Página web (sin app) que reconoce el logo con la cámara del celular y muestra una escena
de concierto alrededor: el logo en 3D de pie, un escenario con luces y público, y objetos
animados a distintas profundidades (efecto paralaje).

**Enlace:** https://nikollsott.github.io/Thecube/

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | Pantalla de inicio, carga, guía para apuntar y errores |
| `js/app.js` | Cámara + MindAR, seguimiento suavizado, modo mesa/pared, ajuste a pantalla, demo |
| `js/effects.js` | La escena: imágenes en capas y efectos animados |
| `assets/escena/` | Imágenes de la escena (PNG con fondo transparente) |
| `assets/logo.png` | Logo con fondo transparente |
| `targets/targets.mind` | 6 marcadores del logo: fondo claro, fondo oscuro y 4 fotos del logo real |
| `targets/fuentes/` | Imágenes con las que se compilaron los marcadores |
| `vendor/` | three.js 0.160.0 y MindAR 1.2.5 (copias locales, sin CDN) |
| `tools/servidor.py` | Servidor local de pruebas |

## Modos

- `?demo` — sin cámara; la escena se mueve con el dedo, el mouse o inclinando el celular.
- `?debug` — muestra detección, modo, ajuste de tamaño y FPS.
- `?modo=mesa` / `?modo=pared` — fuerza el modo (si no, se detecta solo).
  - **Mesa**: logo impreso sobre una mesa → la escena se pone de pie sobre él.
  - **Pared**: logo de frente (afiche, pared, camiseta) → la escena sale de frente.

## Probar en local

```bash
python tools/servidor.py 8080
```

Abre http://localhost:8080/?demo. En el celular la cámara solo funciona con **https://**:
usa el enlace publicado o un túnel temporal (`cloudflared tunnel --url http://localhost:8080`).

No uses `python -m http.server`: entrega cualquier archivo de la carpeta (incluida `.git/`)
y queda abierto a toda la red Wi‑Fi. `tools/servidor.py` solo entrega los archivos públicos
y escucha únicamente en este computador.

## Cambios frecuentes

- **Cambiar una imagen:** reemplaza el PNG en `assets/escena/` con el mismo nombre. Si cambia
  su tamaño en píxeles, actualiza `IMAGES` en `js/effects.js`.
- **Cambiar el logo:** recompila `targets.mind` con el compilador de MindAR y ajusta `IMG_W`,
  `IMG_H` y la caja del logo en `js/app.js`.
- **Caché:** al modificar `js/app.js` o `js/effects.js`, sube el número `?v=` en `index.html`
  y en el `import` de `js/app.js`.

## Sobre el marcador

El logo es limpio y de un solo color, con pocos puntos de detalle. Por eso la app suaviza el
movimiento y tolera parpadeos breves. Funciona mejor con el logo grande, bien iluminado y sin
reflejos.

MindAR reconoce en escala de grises: el logo rojo se ve **oscuro sobre fondo claro** y **claro
sobre fondo oscuro**, y para el algoritmo son imágenes distintas. Además, el logo físico brilla,
refleja la luz y está sobre una superficie con textura. Por eso `targets.mind` trae varios
marcadores: los dos dibujados y 4 fotos del logo real (de videos de prueba con celular).

Para agregar otro marcador (por ejemplo, el logo en otro lugar): tomar una foto de frente, recortarla
para que el logo quede en la misma posición que en `targets/fuentes/foto-a.jpg`, compilarla con
MindAR y sumarla a `targets.mind`; luego actualizar `TARGET_COUNT` y el `?v=` en `js/app.js`.
