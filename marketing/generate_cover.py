#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera a imagem de capa do post do LinkedIn (1200x627) da Athena Chrome Bridge.

Uso:
    python marketing/generate_cover.py
Saída:
    marketing/cover-linkedin.png
"""
import os
import textwrap
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 627
OUT = os.path.join(os.path.dirname(__file__), "cover-linkedin.png")

C1 = (109, 93, 246)    # #6d5df6
C2 = (34, 211, 238)    # #22d3ee
BG = (11, 13, 20)      # #0b0d14
TEXT = (238, 241, 248) # #eef1f8
MUTED = (139, 147, 171)  # #8b93ab
MUTED2 = (93, 100, 124)  # #5d647c
SURFACE = (21, 26, 43)   # #151a2b
BORDER = (255, 255, 255, 26)
WHITE = (255, 255, 255, 255)
AMBER = (251, 191, 36, 255)

FONT_DIR = r"C:\Windows\Fonts"
FONTS = {
    "light": os.path.join(FONT_DIR, "segoeuil.ttf"),
    "regular": os.path.join(FONT_DIR, "segoeui.ttf"),
    "semibold": os.path.join(FONT_DIR, "seguisb.ttf"),
    "bold": os.path.join(FONT_DIR, "segoeuib.ttf"),
    "mono": os.path.join(FONT_DIR, "consola.ttf"),
}
for k in list(FONTS):
    if not os.path.exists(FONTS[k]):
        FONTS[k] = FONTS["regular"] if k != "bold" else FONTS["segoeuib"]

def font(kind, size):
    return ImageFont.truetype(FONTS[kind], size)

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def diagonal_gradient(w, h):
    img = Image.new("RGB", (w, h))
    px = img.load()
    max_t = (w - 1) + (h - 1)
    for y in range(h):
        for x in range(w):
            px[x, y] = lerp(C1, C2, (x + y) / max_t)
    return img

def draw_gradient_text(draw, xy, text, fnt, target):
    """Desenha texto preenchido com o gradiente do brand."""
    tmp = Image.new("L", (W, H), 0)
    ImageDraw.Draw(tmp).text(xy, text, font=fnt, fill=255)
    grad = diagonal_gradient(W, H)
    base = Image.new("RGB", (W, H), BG)
    colored = Image.composite(grad, base, tmp)
    target.paste(colored, (0, 0), tmp)

def draw_owl_tile(img, x, y, size):
    """Tile de marca (gradiente + coruja) posicionado em (x, y), lado `size`."""
    s = size
    tile = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    grad = diagonal_gradient(s, s).convert("RGBA")
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.215), fill=255)
    tile.paste(grad, (0, 0), mask)
    d = ImageDraw.Draw(tile)
    # orelhas
    d.polygon([(int(s*.297), int(s*.227)), (int(s*.344), int(s*.062)), (int(s*.438), int(s*.227))], fill=WHITE)
    d.polygon([(int(s*.562), int(s*.227)), (int(s*.656), int(s*.062)), (int(s*.703), int(s*.227))], fill=WHITE)
    # cabeça
    d.ellipse([int(s*.234), int(s*.188), int(s*.766), int(s*.719)], fill=WHITE)
    # olhos
    for cx in (int(s*.406), int(s*.594)):
        d.ellipse([cx - int(s*.070), int(s*.453) - int(s*.070), cx + int(s*.070), int(s*.453) + int(s*.070)], fill=(11, 13, 20, 255))
        d.ellipse([cx - int(s*.025), int(s*.453) - int(s*.025), cx + int(s*.025), int(s*.453) + int(s*.025)], fill=WHITE)
    # bico
    d.polygon([(int(s*.469), int(s*.547)), (int(s*.531), int(s*.547)), (int(s*.5), int(s*.613))], fill=AMBER)
    img.paste(tile, (x, y), tile)

def wrap(draw, text, fnt, max_w):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=fnt) <= max_w:
            cur = trial
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)
    return lines

def main():
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # ---------- fundo: aurora ----------
    aur = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ad = ImageDraw.Draw(aur)
    for cx, cy, r, color in (
        (200, 80, 480, (109, 93, 246, 34)),
        (980, 140, 420, (34, 211, 238, 28)),
        (560, 640, 500, (109, 93, 246, 22)),
    ):
        ad.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    img.paste(Image.alpha_composite(img.convert("RGBA"), aur).convert("RGB"), (0, 0))

    # ---------- faixa de gradiente no topo ----------
    band = Image.new("RGB", (W, 6))
    bpx = band.load()
    for x in range(W):
        bpx[x, 0] = bpx[x, 1] = bpx[x, 2] = bpx[x, 3] = bpx[x, 4] = bpx[x, 5] = lerp(C1, C2, x / (W - 1))
    img.paste(band, (0, 0))

    # ---------- tile da marca (esquerda) ----------
    draw_owl_tile(img, 96, 122, 380)

    # ---------- coluna de texto (direita) ----------
    tx = 560
    max_w = W - tx - 96  # até 1104

    # eyebrow
    draw.text((tx, 130), "NOVO  ·  GRATUITO  ·  OPEN SOURCE", font=font("semibold", 24), fill=C2)

    # título
    draw.text((tx, 178), "Athena", font=font("bold", 78), fill=TEXT)
    draw.text((tx, 268), "Chrome Bridge", font=font("bold", 78), fill=TEXT)

    # tagline com gradiente
    draw_gradient_text(draw, (tx, 368), "Sua IA no controle do seu navegador", font("semibold", 40), img)
    draw = ImageDraw.Draw(img)

    # descrição (wrap)
    desc = ("Extensão gratuita para Chrome que conecta o navegador a qualquer IA "
            "OpenAI-compatible — DeepSeek V4, GPT e outros. Navegue, leia, clique e "
            "preencha com um simples comando.")
    fy = 428
    for line in wrap(draw, desc, font("regular", 24), max_w):
        draw.text((tx, fy), line, font=font("regular", 24), fill=MUTED)
        fy += 34

    # chips
    chips = ["Grátis", "Open source", "Manifest V3", "MCP"]
    cx = tx
    cy = fy + 14
    chip_h = 44
    for label in chips:
        w = int(draw.textlength(label, font=font("semibold", 22))) + 44
        draw.rounded_rectangle([cx, cy, cx + w, cy + chip_h], radius=chip_h // 2,
                               fill=(255, 255, 255, 8), outline=BORDER, width=2)
        tw = draw.textlength(label, font=font("semibold", 22))
        draw.text((cx + (w - tw) / 2, cy + 8), label, font=font("semibold", 22), fill=TEXT)
        cx += w + 16

    # URL (pill)
    url = "github.com/EduradoPessoa/athena-chrome-bridge"
    uy = cy + chip_h + 22
    uw = int(draw.textlength(url, font=font("mono", 22))) + 48
    uh = 46
    draw.rounded_rectangle([tx, uy, tx + uw, uy + uh], radius=12, fill=SURFACE, outline=BORDER, width=2)
    draw.text((tx + 24, uy + 9), url, font=font("mono", 22), fill=C2)

    # ---------- rodapé ----------
    draw.line([72, H - 74, W - 72, H - 74], fill=(255, 255, 255, 26), width=1)
    draw.text((72, H - 56), "Feito por Phoenyx Tecnologia", font=font("semibold", 22), fill=MUTED)
    draw.text((W - 72, H - 56), "phoenyx.com.br", font=font("semibold", 22), fill=MUTED, anchor="ra")

    img.save(OUT, "PNG")
    print(f"gerado: {os.path.normpath(OUT)} ({W}x{H})")


if __name__ == "__main__":
    main()
