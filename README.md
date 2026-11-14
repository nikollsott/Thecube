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
python tools/servidor.py 8080
```

Abre http://localhost:8080/?demo en el computador. La cámara del celular **solo
funciona con https://**, así que para probar en el celular hay que publicarla
(Netlify, GitHub Pages, Vercel…) o usar un túnel https temporal (por ejemplo
`cloudflared tunnel --url http://localhost:8080`).

**No uses `python -m http.server`**: entrega cualquier archivo de la carpeta (incluida
`.git/`, con el historial y el correo del autor) y queda abierto a toda la red Wi-Fi.
`tools/servidor.py` solo entrega los archivos públicos de la página, sin listados de
carpetas ni archivos ocultos, y escucha únicamente en este computador.

## Librerías

three.js 0.160.0 y MindAR 1.2.5 están copiados en `vendor/` (idénticos a los de npm),
así la página no carga código de servidores externos ni depende de una CDN el día del evento.

## Notas sobre el marcador

El logo es limpio y de un solo color, lo que le da pocos puntos de detalle
(331 de detección, solo 5–6 de seguimiento). Por eso la app:

- suaviza la posición para reducir el temblor,
- mantiene el contenido ~1,6 s si el logo se pierde un instante,
- funciona mejor con el logo grande, bien iluminado y sin reflejos.

Si cambias el logo o la imagen del marcador, recompila `targets.mind` con el
compilador de MindAR y ajusta `IMG_W`, `IMG_H` y la caja del logo en `js/app.js`.

## La escena (estilo "concierto")

`js/effects.js` arma un diorama alrededor del logo con las imágenes de `assets/escena/`
puestas como capas a distintas profundidades (paralaje), más efectos por código:

- **Composición** (como la referencia): el logo de pie sobre la tarjeta con reflejo rosado;
  arriba y detrás, un escenario compacto (truss + pedestal como tarima + público); alrededor,
  en racimo: claqueta, parlante, bola de disco, micrófono y boleta.
- **Imágenes**: se usan las 8 de `assets/escena/` tal cual, con sus colores originales.
- **Por código** (solo efectos): el logo en neón, conos de luz desde cada reflector, aros de
  luz en la base del logo, notas/estrellas/forma de onda en neón y destellos.
- **Animación**: el público salta, la bola de disco se balancea y destella, la claqueta
  aplaude, el parlante late con el bajo y la boleta flota. Todo a 120 BPM.

Para cambiar una imagen, reemplaza el PNG (fondo transparente) con el mismo nombre. Si
cambia su tamaño en píxeles, actualiza `IMAGES` al inicio de `js/effects.js`.

**Caché:** al modificar `js/effects.js` o `js/app.js`, sube el número `?v=` en `index.html`
y en el `import` de `js/app.js`, para que los celulares no usen la versión vieja.

### Modo mesa y modo pared

- **Mesa**: si el logo se ve inclinado (impreso sobre una mesa), la escena se pone **de pie** sobre él.
- **Pared**: si el logo se ve de frente (afiche, pared, camiseta), la escena sale de frente.

Se detecta solo. Para forzarlo: `?modo=mesa` o `?modo=pared` (también en el demo).
El umbral está en `TABLE_TILT` dentro de `js/app.js`.

### Estilo anterior

El estilo de trazo (línea) quedó guardado en `js/estilos/effects-linea.js`.
