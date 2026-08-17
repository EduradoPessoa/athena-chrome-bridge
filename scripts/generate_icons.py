#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera os ícones da extensão Athena Chrome Bridge (16/32/48/128 px).

Design: quadrado arredondado com gradiente diagonal do brand
(#6d5df6 -> #22d3ee) + rosto de coruja estilizado em branco.

Uso:
    python scripts/generate_icons.py
Saída:
    extension/icons/icon{16,32,48,128}.png
"""
import os
from PIL import Image, ImageDraw

BASE = 512  # supersampling 4x (128*4) para anti-aliasing
SIZES = [16, 32, 48, 128]
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "extension", "icons")

C1 = (109, 93, 246)   # #6d5df6
C2 = (34, 211, 238)   # #22d3ee
WHITE = (255, 255, 255, 255)
DARK = (11, 13, 20, 255)      # #0b0d14
AMBER = (251, 191, 36, 255)   # #fbbf24

S = BASE


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def diagonal_gradient(size):
    """Gradiente linear diagonal (topo-esquerda -> baixo-direita)."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    max_t = 2 * (size - 1)
    for y in range(size):
        for x in range(size):
            t = (x + y) / max_t
            px[x, y] = lerp(C1, C2, t)
    return img


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def draw_owl(draw):
    """Desenha o rosto de coruja estilizado em um canvas BASE x BASE."""
    # orelhas (tufts)
    draw.polygon([(152, 116), (176, 32), (224, 116)], fill=WHITE)
    draw.polygon([(288, 116), (336, 32), (360, 116)], fill=WHITE)
    # cabeça
    draw.ellipse([120, 96, 392, 368], fill=WHITE)
    # olhos
    for cx, cy in ((208, 232), (304, 232)):
        draw.ellipse([cx - 36, cy - 36, cx + 36, cy + 36], fill=DARK)
        draw.ellipse([cx - 13, cy - 13, cx + 13, cy + 13], fill=WHITE)  # brilho
    # bico
    draw.polygon([(240, 280), (272, 280), (256, 314)], fill=AMBER)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    grad = diagonal_gradient(S)
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    canvas.paste(grad, (0, 0), rounded_mask(S, int(S * 0.215)))
    draw_owl(ImageDraw.Draw(canvas))

    for size in SIZES:
        icon = canvas.resize((size, size), Image.LANCZOS)
        path = os.path.join(OUT_DIR, f"icon{size}.png")
        icon.save(path, "PNG")
        print(f"gerado: {os.path.normpath(path)} ({size}x{size})")


if __name__ == "__main__":
    main()
