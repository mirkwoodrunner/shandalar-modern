#!/usr/bin/env python3
"""convert-sample-sprites.py -- convert three high-res sample renders of a
character (front, side, back views on a baked checkerboard background) into a
128x128 overworld sprite sheet compatible with src/ui/overworld/Sprite.jsx:
4 rows (down, up, left, right) x 4 columns (idle, walk1, walk2, walk3) of
32x32 cells, no padding.

Color model matches tools/gen-sprites.py: the character's MAIN MASS is
converted to grayscale so the runtime palette tint applies, while ACCENTS
(skin, wood/gold, coral/pink) keep their saturated intrinsic colors
(Sprite.jsx tints only pixels with channel spread < 38).

The "right" row is the horizontally flipped side view; walk frames 1 and 3
apply the same -0.8px bob as gen-sprites.py, executed at source resolution so
the downscale renders it as a smooth subpixel shift.

Usage:
  python3 tools/convert-sample-sprites.py \
      --front front.png --side side.png --back back.png \
      --out src/assets/sprites/<kind>.png [--side-facing left|right]

First used to produce src/assets/sprites/merfolk.png (bg-mode color) and
src/assets/sprites/vampire.png (bg-mode flood), 2026-07-03.
"""

import argparse
import colorsys

from PIL import Image, ImageFilter

CELL = 32
BOTTOM = 31          # bottom row of the sprite within the cell (feet line)
MAX_H = 30           # max sprite height in the cell
MAX_W = 32
BOB = {0: 0.0, 1: -0.8, 2: 0.0, 3: -0.8}   # same walk bob as gen-sprites.py


def hue_of(r, g, b):
    h, _, _ = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    return h * 360


def extract(path, bg_mode='color'):
    """Remove the baked checkerboard; return an RGBA image with real alpha.

    bg_mode 'color': every checker-like pixel (near-gray, brightness >= 70) is
    background. Right for characters whose own colors are all saturated (also
    clears checker showing through enclosed gaps in the silhouette).

    bg_mode 'flood': only near-gray pixels connected to the image border are
    background. Required for characters with neutral-gray or pale regions
    (skin, vests) that a pure color rule would eat; the art's darker outlines
    stop the flood at the silhouette.
    """
    # Median-filter first: sample renders carry chroma noise (stray saturated
    # specks) that would otherwise survive as accent-colored dots.
    im = Image.open(path).convert('RGB').filter(ImageFilter.MedianFilter(5))
    w, h = im.size
    px = im.load()
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    opx = out.load()
    if bg_mode == 'color':
        for y in range(h):
            for x in range(w):
                r, g, b = px[x, y]
                mx, mn = max(r, g, b), min(r, g, b)
                # Checker squares are noisy neutral grays, brightness ~80..230.
                if mx - mn < 22 and mx >= 70:
                    continue
                opx[x, y] = (r, g, b, 255)
        return out

    # flood: BFS over neutral-gray pixels starting from every border pixel.
    # The checker (median-filtered) is truly neutral (spread <= ~5); even the
    # darkest garment pixels carry a color cast (spread >= ~10), so a tight
    # spread threshold keeps the flood out of dark clothing.
    bg = [[False] * w for _ in range(h)]
    def grayish(x, y):
        r, g, b = px[x, y]
        return max(r, g, b) - min(r, g, b) < 8
    stack = [(x, y) for x in range(w) for y in (0, h - 1) if grayish(x, y)]
    stack += [(x, y) for y in range(h) for x in (0, w - 1) if grayish(x, y)]
    for x, y in stack:
        bg[y][x] = True
    while stack:
        x, y = stack.pop()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not bg[ny][nx] and grayish(nx, ny):
                bg[ny][nx] = True
                stack.append((nx, ny))
    for y in range(h):
        for x in range(w):
            if not bg[y][x]:
                opx[x, y] = px[x, y] + (255,)
    return out


def keep_big_components(im, min_size=120):
    """Drop tiny disconnected specks (checker noise that survived the mask)."""
    w, h = im.size
    px = im.load()
    seen = [[False] * w for _ in range(h)]
    for y0 in range(h):
        for x0 in range(w):
            if seen[y0][x0] or px[x0, y0][3] == 0:
                continue
            stack = [(x0, y0)]
            comp = []
            seen[y0][x0] = True
            while stack:
                x, y = stack.pop()
                comp.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny][3]:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            if len(comp) < min_size:
                for x, y in comp:
                    px[x, y] = (0, 0, 0, 0)
    return im


def erode_halo(im, rounds=2):
    """Drop sprite pixels that hug the transparent background AND look like a
    gray blend (anti-aliased halo against the checker)."""
    for _ in range(rounds):
        px = im.load()
        w, h = im.size
        kill = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a == 0:
                    continue
                if max(r, g, b) - min(r, g, b) >= 34:
                    continue
                near_bg = False
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                        near_bg = True
                        break
                if near_bg and max(r, g, b) >= 60:
                    kill.append((x, y))
        for x, y in kill:
            px[x, y] = (0, 0, 0, 0)
    return im


def is_accent(r, g, b):
    """Accents keep intrinsic color: skin, wood/gold weapons, coral/pink."""
    mx, mn = max(r, g, b), min(r, g, b)
    spread = mx - mn
    if spread < 22:
        return False              # near-gray outline -> mass
    h = hue_of(r, g, b)
    # Wood / gold: warm browns and oranges.
    if 10 <= h <= 55 and mx >= 70:
        return True
    # Coral / pink / red trim.
    if (h >= 330 or h <= 9) and mx >= 90:
        return True
    # Skin: pale tones -- high value, modest saturation.
    if 100 <= h <= 185 and mx >= 165 and spread <= 75:
        return True
    return False


def recolor(im):
    """Grayscale the mass (tintable), keep accents; boost mass brightness so
    the multiply tint lands in the same range as the generated sheets."""
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or is_accent(r, g, b):
                continue
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            v = int(min(255, lum * 1.35 + 14))
            px[x, y] = (v, v, v, a)
    return im


def premultiplied_resize(im, size):
    """LANCZOS resize without transparent-black fringing."""
    w, h = im.size
    pm = Image.new('RGBA', (w, h))
    spx, dpx = im.load(), pm.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = spx[x, y]
            dpx[x, y] = (r * a // 255, g * a // 255, b * a // 255, a)
    pm = pm.resize(size, Image.LANCZOS)
    dpx = pm.load()
    for y in range(pm.height):
        for x in range(pm.width):
            r, g, b, a = dpx[x, y]
            if a > 0:
                dpx[x, y] = (min(255, r * 255 // a), min(255, g * 255 // a),
                             min(255, b * 255 // a), a)
            else:
                dpx[x, y] = (0, 0, 0, 0)
    return pm


def clean_cell(im):
    """Post-downscale cleanup: kill near-transparent fuzz and resampling
    ringing (off-hue saturated specks that are not legitimate accent colors)."""
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if a < 40:
                px[x, y] = (0, 0, 0, 0)
                continue
            if max(r, g, b) - min(r, g, b) >= 30 and not is_accent(r, g, b):
                v = int(min(255, 0.299 * r + 0.587 * g + 0.114 * b))
                px[x, y] = (v, v, v, a)
    return im


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--front', required=True, help='front view (down row)')
    ap.add_argument('--side', required=True, help='side view (left/right rows)')
    ap.add_argument('--back', required=True, help='back view (up row)')
    ap.add_argument('--out', required=True, help='output sheet path')
    ap.add_argument('--side-facing', choices=['left', 'right'], default='left',
                    help='which way the side render faces (default left)')
    ap.add_argument('--bg-mode', choices=['color', 'flood'], default='color',
                    help='background removal mode (see extract); use flood '
                         'for characters with pale or neutral-gray regions')
    args = ap.parse_args()

    views = {}
    for d, path in (('down', args.front), ('side', args.side), ('up', args.back)):
        im = extract(path, args.bg_mode)
        im = erode_halo(im)
        im = keep_big_components(im)
        im = recolor(im)
        views[d] = im.crop(im.getbbox())
        print(d, 'cropped to', views[d].size)

    # One shared scale so the character height matches across rows.
    scale = MAX_H / max(v.height for v in views.values())
    widest = max(v.width for v in views.values())
    if widest * scale > MAX_W:
        scale = MAX_W / widest

    sheet = Image.new('RGBA', (CELL * 4, CELL * 4), (0, 0, 0, 0))
    rows = ['down', 'up', 'left', 'right']   # DIR_ROW order in Sprite.jsx
    for row, d in enumerate(rows):
        src = views['side'] if d in ('left', 'right') else views[d]
        flip = d in ('left', 'right') and d != args.side_facing
        for col in range(4):
            # Apply the bob at source resolution for a subpixel-smooth result.
            bob_src = int(round(-BOB[col] / scale))   # positive = pad below
            work = src.transpose(Image.FLIP_LEFT_RIGHT) if flip else src
            if bob_src:
                padded = Image.new('RGBA', (work.width, work.height + bob_src),
                                   (0, 0, 0, 0))
                padded.paste(work, (0, 0))
                work = padded
            tw = max(1, int(round(work.width * scale)))
            th = max(1, int(round(work.height * scale)))
            small = clean_cell(premultiplied_resize(work, (tw, th)))
            cell = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
            cell.paste(small, ((CELL - tw) // 2, BOTTOM + 1 - th))
            sheet.paste(cell, (col * CELL, row * CELL))

    sheet.save(args.out)
    print('wrote', args.out, sheet.size)


if __name__ == '__main__':
    main()
