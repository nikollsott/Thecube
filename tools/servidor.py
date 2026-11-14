"""Servidor local de pruebas.

Solo entrega los archivos públicos de la página (sin ocultos ni listados de carpetas)
y escucha únicamente en este computador.

Uso: python tools/servidor.py [puerto] [--red]
     --red  lo abre también a la red local (no recomendado).
"""
import http.server
import os
import posixpath
import re
import sys
import urllib.parse

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PERMITIDAS = [re.compile(p + r"\Z") for p in (
    r"/",
    r"/index\.html",
    r"/js/[\w.-]+\.js",
    r"/assets/logo\.png",
    r"/assets/escena/[\w.-]+\.png",
    r"/targets/[\w.-]+\.mind",
    r"/vendor/[\w./-]+\.js",
)]

CABECERAS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
    "Cache-Control": "no-cache",
}


class Manejador(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript; charset=utf-8",
        ".mind": "application/octet-stream",
        ".html": "text/html; charset=utf-8",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=RAIZ, **kwargs)

    def es_publica(self):
        ruta = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
        if "\\" in ruta or "\x00" in ruta:
            return False
        if any(parte.startswith(".") for parte in ruta.split("/") if parte):
            return False  # ocultos y ".."
        normal = posixpath.normpath(ruta)
        if ruta.endswith("/") and normal != "/":
            return False  # carpetas
        return any(p.match(normal) for p in PERMITIDAS)

    def send_head(self):
        if not self.es_publica():
            self.send_error(404, "No encontrado")
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404, "No encontrado")
        return None

    def end_headers(self):
        for nombre, valor in CABECERAS.items():
            self.send_header(nombre, valor)
        super().end_headers()


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    puerto = int(args[0]) if args else 8080
    host = "0.0.0.0" if "--red" in sys.argv else "127.0.0.1"
    servidor = http.server.ThreadingHTTPServer((host, puerto), Manejador)
    print(f"Sirviendo en http://{host}:{puerto} (solo archivos públicos)", flush=True)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
