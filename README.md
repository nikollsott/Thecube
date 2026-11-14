# Experiencia WebAR — logo que cobra vida

Página web (sin app) que reconoce el logo con la cámara del celular y hace salir
notas musicales, luces de concierto, destellos y ondas en capas a distintas
profundidades (efecto paralaje).

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | Página: pantalla de inicio, guía "apunta al logo", errores |
| `js/app.js` | Cámara + MindAR, suavizado, "memoria" cuando se pierde el logo, modo demo |
| `js/effects.js` | Las capas animadas (notas, haces de luz, destellos, halo, ondas) |
| `targets/targets.mind` | Marcador compilado del logo (imagen 1580×1600) |
| `assets/logo.png` | Logo con fondo transparente (para la interfaz y el demo) |

## Modos

- `index.html` — experiencia real con cámara.
- `index.html?demo` — sin cámara: muestra el logo con los efectos; se mueve con el dedo,
  el mouse o inclinando el celular. Útil para presentar la idea.
- `index.html?debug` — muestra estado de detección y FPS.

## Probar en local

```bash
python -m http.server 8080
```

Abre http://localhost:8080/?demo en el computador. La cámara del celular **solo
funciona con https://**, así que para probar en el celular hay que publicarla
(Netlify, GitHub Pages, Vercel…) o usar un túnel https temporal.

## Notas sobre el marcador

El logo es limpio y de un solo color, lo que le da pocos puntos de detalle
(331 de detección, solo 5–6 de seguimiento). Por eso la app:

- suaviza la posición para reducir el temblor,
- mantiene el contenido ~1,6 s si el logo se pierde un instante,
- funciona mejor con el logo grande, bien iluminado y sin reflejos.

Si cambias el logo o la imagen del marcador, recompila `targets.mind` con el
compilador de MindAR y ajusta `IMG_W`, `IMG_H` y la caja del logo en `js/app.js`.

## La escena 3D

`js/effects.js` construye todo por código, sin descargar modelos:

- **Ecualizador 3D** en anillo alrededor del logo, saliendo del papel.
- **Reflectores** de escenario con conos de luz que barren.
- **Bola de disco** que baja del techo, con reflejos girando.
- **Vinilo** girando con el logo de la marca en la etiqueta.
- **Micrófono** flotando.
- **Parlantes** que laten con el bajo.
- **Notas musicales 3D** con grosor y brillo que salen del logo hacia la cámara.
- **Estrellas doradas** en órbita (pasan por delante y por detrás del logo).
- **Confeti 3D**, destellos, halo y ondas.

Todo va sincronizado a un ritmo de 120 BPM. Colores y ritmo (`BRAND`, `PALETTE`, `BPM`)
están al inicio de `js/effects.js`.

## Gráficos propios

Para sumar imágenes de la marca, ver `assets/fx/LEEME.md`.
