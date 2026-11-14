#!/usr/bin/env python3
"""Prototipo desechable del lector webtoon.

Genera 300 páginas locales (si faltan) y sirve la carpeta por HTTP para
probarlo desde el móvil en la misma Wi-Fi.

Uso: python3 prototype/reader/serve.py [puerto]
"""
import colorsys
import http.server
import json
import os
import random
import socket
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PAGES_DIR = ROOT / "pages"
MANIFEST = PAGES_DIR / "manifest.json"
COUNT = 300
WIDTH = 720


def _color(h, s, v):
    return tuple(round(c * 255) for c in colorsys.hsv_to_rgb(h, s, v))


def generate():
    from PIL import Image, ImageDraw, ImageFont

    PAGES_DIR.mkdir(exist_ok=True)
    rnd = random.Random(42)
    font = None
    for path in (
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ):
        if os.path.exists(path):
            try:
                font = ImageFont.truetype(path, 150)
                break
            except OSError:
                pass

    pages = []
    print(f"generando {COUNT} páginas en {PAGES_DIR} …", flush=True)
    for i in range(COUNT):
        height = rnd.randint(1400, 2200)
        img = Image.new("RGB", (WIDTH, height))
        draw = ImageDraw.Draw(img)

        hue_top = (i * 37) % 360
        hue_bot = (hue_top + 50) % 360
        top = _color(hue_top / 360, 0.35, 0.55)
        bottom = _color(hue_bot / 360, 0.55, 0.12)
        band = 12
        for y in range(0, height, band):
            t = y / height
            c = tuple(round(top[k] * (1 - t) + bottom[k] * t) for k in range(3))
            draw.rectangle([0, y, WIDTH, min(height, y + band)], fill=c)

        # formas claras/oscuras para tener referencia visual al hacer scroll
        draw.rectangle([40, int(height * 0.10), WIDTH - 40, int(height * 0.32)], fill=(245, 245, 245))
        draw.rectangle([40, int(height * 0.40), WIDTH - 40, int(height * 0.58)], fill=(30, 30, 30))
        draw.rectangle([40, int(height * 0.66), WIDTH - 40, int(height * 0.90)], fill=(245, 245, 245))

        if font:
            text = str(i + 1)
            box = draw.textbbox((0, 0), text, font=font)
            tw, th = box[2] - box[0], box[3] - box[1]
            draw.text(((WIDTH - tw) / 2, (height - th) / 2 - box[1]), text, font=font, fill=(20, 20, 20))

        name = f"{i + 1:04d}.jpg"
        img.save(PAGES_DIR / name, "JPEG", quality=82, progressive=True, optimize=True)
        pages.append({"src": f"pages/{name}", "w": WIDTH, "h": height})

    MANIFEST.write_text(json.dumps({"pages": pages}))
    print("listo", flush=True)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        if self.path.endswith((".html", ".json")) or self.path == "/":
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    if not MANIFEST.exists():
        generate()
    else:
        print(f"usando páginas existentes en {PAGES_DIR}")

    server = http.server.ThreadingHTTPServer(("0.0.0.0", port), Handler)
    ip = lan_ip()
    print(f"\n  Escritorio: http://localhost:{port}/")
    print(f"  Móvil:      http://{ip}:{port}/  (misma Wi-Fi)\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
