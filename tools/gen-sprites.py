#!/usr/bin/env python3
"""
gen-sprites.py -- deterministic generator for the overworld character sprite
sheets used by src/ui/overworld/Sprite.jsx.

Output: one PNG per creature kind under src/assets/sprites/, each a 128x128
sheet laid out as 4 rows (down, up, left, right) x 4 columns (idle, walk1,
walk2, walk3) of 32x32 cells, with NO padding between cells.

Color model: each sprite's MAIN MASS (robe, body, wings...) is drawn in
grayscale value only, while ACCENTS (skin, eyes, mane, staff, hooves, teeth,
fins...) are drawn in saturated intrinsic colors. At draw time Sprite.jsx tints
ONLY the low-saturation (gray) pixels by the per-color palette, leaving the
saturated accents untouched -- so one sheet per kind serves every palette
variant (gold/white/blue/black/red/green) while still looking multi-colored.

Shapes are drawn at 4x supersample and downscaled with LANCZOS for the soft,
anti-aliased, no-hard-outline look that matches forest_tileset.png.

This art is original, generated, released CC0 (see src/assets/sprites/CREDITS.md).
Re-run:  python3 tools/gen-sprites.py
"""

import os
from PIL import Image, ImageDraw

SS = 4                      # supersample factor
CELL = 32                   # logical cell size (px)
C = CELL * SS               # supersampled cell size
DIRS = ['down', 'up', 'left', 'right']
NFRAMES = 4

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'src', 'assets', 'sprites')

# --- Grayscale MASS tones (tinted at runtime). value only, saturation 0. ------
HI = (238, 238, 238, 255)
LT = (205, 205, 205, 255)
MD = (165, 165, 165, 255)
DK = (120, 120, 120, 255)
SH = (84, 84, 84, 255)

# --- Saturated ACCENT colors (kept at runtime; saturation >= ~42). ------------
SKIN    = (232, 201, 160, 255)
SKIN_SH = (196, 160, 120, 255)
PUPIL   = (78, 46, 30, 255)     # dark brown eyes (kept, reads dark on any tint)
EYE_W   = (244, 230, 196, 255)  # ivory eye-white
GOLD    = (216, 176, 72, 255)   # trim / hat band
WOOD    = (140, 98, 56, 255)    # staff / loincloth
ORB     = (84, 202, 214, 255)   # staff orb
MANE    = (240, 228, 196, 255)  # cream mane / wing edge
HOOF    = (82, 58, 36, 255)
LEG     = (78, 52, 34, 255)     # spider legs
EYE_Y   = (242, 212, 84, 255)   # goblin/spider eyes
NOSE    = (152, 94, 68, 255)
TEETH   = (244, 232, 200, 255)
BELLY   = (240, 226, 194, 255)

# Per-frame vertical body bob (logical px). Idle frame is still.
BOB = {0: 0.0, 1: -0.8, 2: 0.0, 3: -0.8}
# Per-frame leg stride offset (logical px).
STRIDE = {0: 0.0, 1: 1.4, 2: 0.0, 3: -1.4}


class Cell:
    """Draw helper in logical 32-space; scales to the supersampled canvas."""

    def __init__(self):
        self.img = Image.new('RGBA', (C, C), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def _s(self, v):
        return v * SS

    def ell(self, x0, y0, x1, y1, col):
        self.d.ellipse([self._s(x0), self._s(y0), self._s(x1), self._s(y1)], fill=col)

    def rect(self, x0, y0, x1, y1, col):
        self.d.rectangle([self._s(x0), self._s(y0), self._s(x1), self._s(y1)], fill=col)

    def poly(self, pts, col):
        self.d.polygon([(self._s(x), self._s(y)) for x, y in pts], fill=col)

    def line(self, x0, y0, x1, y1, col, w=1):
        self.d.line([self._s(x0), self._s(y0), self._s(x1), self._s(y1)],
                    fill=col, width=max(1, int(self._s(w))))

    def flip_h(self):
        self.img = self.img.transpose(Image.FLIP_LEFT_RIGHT)
        self.d = ImageDraw.Draw(self.img)

    def rotate(self, deg):
        self.img = self.img.transpose(deg)
        self.d = ImageDraw.Draw(self.img)

    def downscaled(self):
        return self.img.resize((CELL, CELL), Image.LANCZOS)


# ---------------------------------------------------------------------------
# Creature drawing -- mass in gray (tinted), accents in saturated color (kept).
# ---------------------------------------------------------------------------

def draw_mage(c, d, f):
    dy = BOB[f]
    st = STRIDE[f]
    # feet (mass)
    c.rect(13 - st, 27, 15 - st, 30, SH)
    c.rect(17 + st, 27, 19 + st, 30, SH)
    # robe (mass)
    c.poly([(12, 14 + dy), (20, 14 + dy), (23, 28), (9, 28)], MD)
    c.poly([(12, 14 + dy), (15, 14 + dy), (13, 28), (9, 28)], LT)   # highlight
    c.poly([(18, 22), (23, 28), (16, 28)], DK)                       # shadow hem
    # hands (accent skin) + sleeves (mass)
    c.ell(7, 17 + dy, 11, 22 + dy, MD)
    c.ell(21, 17 + dy, 25, 22 + dy, MD)
    c.ell(7.5, 20 + dy, 10, 22.5 + dy, SKIN)
    c.ell(22, 20 + dy, 24.5, 22.5 + dy, SKIN)
    # staff (accent)
    c.rect(23.5, 6 + dy, 25, 27, WOOD)
    c.ell(22.5, 3 + dy, 26, 6.5 + dy, ORB)
    # head (accent skin)
    c.ell(12, 8 + dy, 20, 16 + dy, SKIN)
    c.ell(12.5, 8.5 + dy, 17, 13 + dy, (244, 218, 182, 255))  # face highlight
    # hat (mass) + gold band (accent)
    c.poly([(16, 1.5 + dy), (10, 12 + dy), (22, 12 + dy)], MD)
    c.poly([(16, 1.5 + dy), (12, 12 + dy), (15.5, 12 + dy)], LT)
    c.rect(9, 11 + dy, 23, 13.2 + dy, GOLD)                          # hat band
    # face by direction
    if d == 'down':
        c.ell(13.2, 11.3 + dy, 14.9, 13.1 + dy, PUPIL)
        c.ell(17.1, 11.3 + dy, 18.8, 13.1 + dy, PUPIL)
    elif d == 'left':
        c.ell(12.4, 11.3 + dy, 14.1, 13.2 + dy, PUPIL)
    elif d == 'right':
        c.ell(17.9, 11.3 + dy, 19.6, 13.2 + dy, PUPIL)
    else:  # up: back of head, no eyes
        c.ell(12.5, 8.5 + dy, 19.5, 13.5 + dy, SKIN_SH)


def draw_pegasus(c, d, f):
    dy = BOB[f]
    st = STRIDE[f]
    if d in ('left', 'right'):
        c.ell(7, 12 + dy, 22, 22 + dy, MD)                 # body (mass)
        c.ell(7, 12 + dy, 17, 19 + dy, LT)
        for i, lx in enumerate((9, 13, 17, 20)):           # legs (mass) + hooves
            off = st if i % 2 == 0 else -st
            c.rect(lx, 21 + dy, lx + 1.6, 28 + off, MD)
            c.rect(lx - 0.2, 27 + off, lx + 1.8, 28.4 + off, HOOF)
        c.poly([(19, 14 + dy), (24, 6 + dy), (26, 9 + dy), (22, 17 + dy)], MD)  # neck
        c.ell(23, 4 + dy, 28, 9 + dy, MD)                  # head (mass)
        c.poly([(18, 9 + dy), (23, 5 + dy), (22, 14 + dy)], MANE)  # mane (accent)
        c.poly([(10, 13 + dy), (17, 8 + dy - st), (15, 17 + dy)], LT)  # wing (mass)
        c.poly([(11, 14 + dy), (16, 10 + dy), (14, 17 + dy)], HI)
        c.line(10.5, 12.5 + dy, 16, 9 + dy, MANE, 0.5)     # wing edge (accent)
        c.ell(25.4, 5.4 + dy, 27, 7 + dy, PUPIL)           # eye (accent)
        if d == 'right':
            c.flip_h()
    else:
        c.ell(9, 13 + dy, 23, 24 + dy, MD)                 # body (mass)
        c.ell(10, 13 + dy, 20, 20 + dy, LT)
        for i, lx in enumerate((10, 14, 18, 21)):
            off = st if i % 2 == 0 else -st
            c.rect(lx, 22 + dy, lx + 1.6, 28 + off, MD)
            c.rect(lx - 0.2, 27 + off, lx + 1.8, 28.4 + off, HOOF)
        c.poly([(9, 14 + dy), (2, 9 + dy), (8, 20 + dy)], LT)    # wings (mass)
        c.poly([(23, 14 + dy), (30, 9 + dy), (24, 20 + dy)], LT)
        c.line(2.5, 9.5 + dy, 8.5, 14 + dy, MANE, 0.5)
        c.line(29.5, 9.5 + dy, 23.5, 14 + dy, MANE, 0.5)
        c.ell(12, 6 + dy, 20, 14 + dy, MD)                 # head (mass)
        if d == 'down':
            c.ell(13.5, 9 + dy, 15, 10.5 + dy, PUPIL)
            c.ell(17, 9 + dy, 18.5, 10.5 + dy, PUPIL)
            c.poly([(13, 6 + dy), (16, 4 + dy), (19, 6 + dy)], MANE)  # forelock
        else:
            c.poly([(12.5, 6 + dy), (16, 4 + dy), (19.5, 6 + dy)], MANE)


def draw_spider(c, d, f):
    dy = BOB[f]
    wig = 2.0 if f in (1, 3) else 0.0
    wsign = 1 if f == 1 else -1

    # Jointed legs in 4 pairs: (attach_x, attach_y, knee_x, knee_y, tip_x, tip_y)
    # Mirrored left/right around cx=16. Alternate pairs offset for walk cycle.
    leg_specs = [
        (13, 10,  3,  4,  0, 10),   # pair 0 - frontmost
        (12, 13,  2,  9,  0, 16),   # pair 1
        (12, 16,  2, 16,  0, 22),   # pair 2
        (13, 19,  4, 23,  1, 27),   # pair 3 - rearmost
    ]
    for i, (ax, ay, kx, ky, tx, ty) in enumerate(leg_specs):
        off = (wsign * wig if i % 2 == 0 else -wsign * wig)
        ky_a = ky + off
        c.line(ax,      ay + dy, kx,      ky_a + dy, LEG, 1.1)
        c.line(kx,      ky_a + dy, tx,    ty + dy,   LEG, 1.1)
        c.line(32 - ax, ay + dy, 32 - kx, ky_a + dy, LEG, 1.1)
        c.line(32 - kx, ky_a + dy, 32 - tx, ty + dy, LEG, 1.1)

    # Abdomen (mass) - large lower oval with highlight and shadow
    c.ell(9,  14 + dy, 23, 28 + dy, MD)
    c.ell(10, 14 + dy, 19, 21 + dy, LT)   # highlight
    c.ell(12, 23 + dy, 21, 27 + dy, SH)   # shadow underside

    # Cephalothorax (mass) - smaller, overlaps abdomen top
    c.ell(11, 7 + dy, 21, 17 + dy, DK)
    c.ell(12, 7 + dy, 19, 13 + dy, MD)    # mid highlight
    c.ell(13, 8 + dy, 18, 12 + dy, LT)   # bright crown

    # Direction-offset for eyes and fangs
    ex = -1.5 if d == 'left' else (1.5 if d == 'right' else 0.0)
    ey =  0.5 if d != 'up'   else -1.5

    if d == 'up':
        # Rear view: darken carapace, no eyes, show spinnerets
        c.ell(11, 7 + dy, 21, 17 + dy, SH)
        c.ell(12, 8 + dy, 19, 13 + dy, DK)
        c.ell(14.5, 26 + dy, 17.5, 28.5 + dy, DK)   # spinnerets
    else:
        # Eye cluster: 4 prominent eyes (down) or 2 (side)
        n_eyes = 4 if d == 'down' else 2
        eye_pos = [
            (12.4, 9.0),   # front outer-left
            (17.0, 8.6),   # front outer-right (mirrored by ex)
            (14.2, 11.2),  # rear inner-left
            (18.6, 10.6),  # rear inner-right
        ]
        for (px, py) in eye_pos[:n_eyes]:
            c.ell(px + ex,       py + ey + dy, px + 2.6 + ex, py + 2.6 + ey + dy, EYE_Y)
            c.ell(px + 0.6 + ex, py + 0.6 + ey + dy, px + 1.9 + ex, py + 1.9 + ey + dy, PUPIL)
        # Chelicerae / fangs
        c.rect(14.0 + ex, 14.2 + dy, 15.2 + ex, 16.4 + dy, LEG)
        c.rect(16.8 + ex, 14.2 + dy, 18.0 + ex, 16.4 + dy, LEG)


def draw_zombie(c, d, f):
    dy = BOB[f]
    st = STRIDE[f]
    c.rect(11 - st, 27, 14 - st, 30, SH)                  # feet (mass)
    c.rect(18 + st, 27, 21 + st, 30, SH)
    c.rect(11, 14 + dy, 21, 26, MD)                       # torso (mass)
    c.poly([(11, 14 + dy), (15, 14 + dy), (12, 26), (11, 26)], LT)
    c.rect(11, 23, 21, 26, DK)
    c.poly([(13, 16 + dy), (15, 22), (12.5, 22)], HI)     # tattered light rag
    c.rect(5, 15 + dy, 11, 18 + dy, MD)                  # arms (mass)
    c.rect(21, 15 + dy, 27, 18 + dy, MD)
    c.ell(4.5, 15.5 + dy, 7, 18 + dy, SKIN_SH)           # hands (accent)
    c.ell(25, 15.5 + dy, 27.5, 18 + dy, SKIN_SH)
    c.ell(11, 5 + dy, 21, 15 + dy, MD)                   # head (mass)
    c.ell(11.5, 5.5 + dy, 17, 11 + dy, LT)
    c.rect(13, 13 + dy, 19, 14.4 + dy, SH)               # mouth
    if d == 'down':
        c.ell(13, 8.6 + dy, 15, 10.8 + dy, EYE_W)
        c.ell(17, 8.6 + dy, 19, 10.8 + dy, EYE_W)
        c.ell(13.4, 9 + dy, 14.6, 10.4 + dy, PUPIL)
        c.ell(17.4, 9 + dy, 18.6, 10.4 + dy, PUPIL)
    elif d == 'left':
        c.ell(12.4, 8.8 + dy, 14.3, 10.8 + dy, PUPIL)
    elif d == 'right':
        c.ell(17.7, 8.8 + dy, 19.6, 10.8 + dy, PUPIL)
    else:
        c.ell(11.5, 5.5 + dy, 20.5, 11 + dy, DK)


def draw_goblin(c, d, f):
    dy = BOB[f]
    st = STRIDE[f]
    c.rect(11 - st, 27, 14 - st, 30, SH)                 # feet (mass)
    c.rect(18 + st, 27, 21 + st, 30, SH)
    c.ell(9, 14 + dy, 23, 27, MD)                        # body (mass = team skin)
    c.ell(10, 14 + dy, 18, 22, LT)
    c.rect(11, 22.5, 21, 26.5, WOOD)                     # loincloth (accent)
    c.ell(6, 16 + dy, 11, 21 + dy, MD)                  # arms (mass)
    c.ell(21, 16 + dy, 26, 21 + dy, MD)
    c.ell(10, 5 + dy, 22, 16 + dy, MD)                  # head (mass)
    c.ell(10.5, 5.5 + dy, 18, 11 + dy, LT)
    c.poly([(10, 8 + dy), (2, 5 + dy), (10, 12 + dy)], MD)   # ears (mass)
    c.poly([(22, 8 + dy), (30, 5 + dy), (22, 12 + dy)], MD)
    c.ell(15, 11 + dy, 17, 13.6 + dy, NOSE)             # nose (accent)
    c.rect(13.5, 13.5 + dy, 18.5, 14.6 + dy, TEETH)     # teeth (accent)
    if d == 'down':
        c.ell(12.4, 8.6 + dy, 14.4, 10.6 + dy, EYE_Y)
        c.ell(17.6, 8.6 + dy, 19.6, 10.6 + dy, EYE_Y)
        c.ell(12.9, 9 + dy, 13.9, 10.1 + dy, PUPIL)
        c.ell(18.1, 9 + dy, 19.1, 10.1 + dy, PUPIL)
    elif d == 'left':
        c.ell(12, 8.8 + dy, 14, 10.8 + dy, EYE_Y)
        c.ell(12.5, 9.2 + dy, 13.5, 10.3 + dy, PUPIL)
    elif d == 'right':
        c.ell(18, 8.8 + dy, 20, 10.8 + dy, EYE_Y)
        c.ell(18.5, 9.2 + dy, 19.5, 10.3 + dy, PUPIL)
    else:
        c.ell(10.5, 5.5 + dy, 21.5, 11 + dy, DK)


def draw_fish(c, d, f):
    dy = BOB[f]
    tw = (1.6 if f == 1 else -1.6 if f == 3 else 0.0)
    c.poly([(3, 11 + dy + tw), (3, 21 + dy - tw), (10, 16 + dy)], DK)   # tail (mass)
    c.ell(8, 9 + dy, 27, 23 + dy, MD)                    # body (mass)
    c.ell(10, 9.5 + dy, 24, 17 + dy, LT)                 # back highlight
    c.ell(11, 17 + dy, 24, 22 + dy, BELLY)              # belly (accent)
    c.poly([(13, 9 + dy), (17, 4 + dy), (20, 9 + dy)], DK)    # top fin (mass)
    c.poly([(14, 22 + dy), (18, 26 + dy), (20, 22 + dy)], DK) # bottom fin (mass)
    c.line(20, 11 + dy, 20, 20 + dy, SH, 0.8)            # gill
    c.ell(22, 12.6 + dy, 25.2, 15.8 + dy, EYE_W)         # eye (accent)
    c.ell(23, 13.6 + dy, 24.6, 15.2 + dy, PUPIL)
    if d == 'left':
        c.flip_h()
    elif d == 'up':
        c.rotate(Image.ROTATE_90)
    elif d == 'down':
        c.rotate(Image.ROTATE_270)


DRAWERS = {
    'mage': draw_mage,
    'pegasus': draw_pegasus,
    'spider': draw_spider,
    'zombie': draw_zombie,
    'goblin': draw_goblin,
    'fish': draw_fish,
}


def build_sheet(kind):
    drawer = DRAWERS[kind]
    sheet = Image.new('RGBA', (CELL * NFRAMES, CELL * len(DIRS)), (0, 0, 0, 0))
    for row, d in enumerate(DIRS):
        for col in range(NFRAMES):
            cell = Cell()
            drawer(cell, d, col)
            sheet.paste(cell.downscaled(), (col * CELL, row * CELL))
    return sheet


def main():
    out = os.path.normpath(OUT_DIR)
    os.makedirs(out, exist_ok=True)
    for kind in DRAWERS:
        sheet = build_sheet(kind)
        path = os.path.join(out, f'{kind}.png')
        sheet.save(path)
        print(f'wrote {path}  ({sheet.width}x{sheet.height})')


if __name__ == '__main__':
    main()
