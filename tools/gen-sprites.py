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

    if d == 'down':
        # FRONT-FACING pose (ref 1): spider looking at viewer.
        # Body vertical, cephalothorax upper-center, abdomen below.
        # Front leg pairs angle upward-outward; rear pairs angle downward-outward.
        leg_pairs = [
            # ax,   ay,   kx,  ky,   tx,   ty
            (13.5, 10.5,  5.0,  3.5,  0.0,  8.0),  # front - sweep up then out
            (12.5, 13.0,  3.0,  9.5,  0.0, 15.0),
            (12.5, 16.5,  3.0, 17.0,  0.0, 22.0),
            (13.5, 19.5,  5.0, 24.5,  1.0, 29.0),  # rear - sweep down then out
        ]
        for i, (ax, ay, kx, ky, tx, ty) in enumerate(leg_pairs):
            off = (wsign * wig if i % 2 == 0 else -wsign * wig)
            c.line(ax,      ay + dy, kx,      ky + off + dy, LEG, 1.2)
            c.line(kx,      ky + off + dy, tx, ty + dy,      LEG, 1.2)
            c.line(32 - ax, ay + dy, 32 - kx, ky + off + dy, LEG, 1.2)
            c.line(32 - kx, ky + off + dy, 32 - tx, ty + dy, LEG, 1.2)

        # Abdomen below, smaller since partially occluded
        c.ell(10, 16 + dy, 22, 28 + dy, MD)
        c.ell(11, 16 + dy, 19, 22 + dy, LT)
        c.ell(13, 23 + dy, 21, 27 + dy, SH)

        # Cephalothorax larger/prominent since we face it
        c.ell(10, 7 + dy, 22, 18 + dy, DK)
        c.ell(11, 7 + dy, 20, 14 + dy, MD)
        c.ell(12, 8 + dy, 18, 13 + dy, LT)

        # 4 large eyes spread across cephalothorax
        for (px, py) in ((11.5, 8.8), (16.5, 8.4), (13.5, 11.5), (19.0, 11.2)):
            c.ell(px, py + dy, px + 3.0, py + 3.0 + dy, EYE_Y)
            c.ell(px + 0.7, py + 0.7 + dy, px + 2.2, py + 2.2 + dy, PUPIL)

        # Chelicerae
        c.rect(13.5, 14.8 + dy, 15.0, 17.2 + dy, LEG)
        c.rect(17.0, 14.8 + dy, 18.5, 17.2 + dy, LEG)

    elif d == 'up':
        # TOP-DOWN REAR pose (ref 2): spider walking away, seen from above.
        # Abdomen dominates lower half; cephalothorax small at top.
        # All 8 legs spread symmetrically to sides.
        leg_pairs = [
            (13.5,  9.5,  4.5,  4.0,  0.0,  9.0),
            (12.5, 13.0,  3.0, 10.0,  0.0, 16.0),
            (12.5, 17.0,  3.0, 18.0,  0.0, 23.0),
            (13.5, 21.0,  5.0, 26.0,  1.0, 30.0),
        ]
        for i, (ax, ay, kx, ky, tx, ty) in enumerate(leg_pairs):
            off = (wsign * wig if i % 2 == 0 else -wsign * wig)
            c.line(ax,      ay + dy, kx,      ky + off + dy, LEG, 1.2)
            c.line(kx,      ky + off + dy, tx, ty + dy,      LEG, 1.2)
            c.line(32 - ax, ay + dy, 32 - kx, ky + off + dy, LEG, 1.2)
            c.line(32 - kx, ky + off + dy, 32 - tx, ty + dy, LEG, 1.2)

        # Abdomen - large and round, fills most of the cell
        c.ell(8, 13 + dy, 24, 30 + dy, MD)
        c.ell(9, 13 + dy, 20, 21 + dy, LT)
        c.ell(10, 23 + dy, 22, 29 + dy, DK)
        c.ell(14, 28.5 + dy, 18, 30.5 + dy, SH)   # spinnerets

        # Cephalothorax - small, at top, showing carapace from above
        c.ell(11, 5 + dy, 21, 15 + dy, SH)
        c.ell(12, 5 + dy, 19, 11 + dy, DK)
        c.ell(13, 6 + dy, 17, 10 + dy, MD)

    else:
        # SIDE-PROFILE pose (ref 3): left/right directions.
        # Body horizontal: cephalothorax at left end, abdomen at right end.
        # Legs spread above and below the horizontal body.
        # 8 legs total: 4 upper (arching up), 4 lower (arching down).
        side_legs = [
            # (attach_x, attach_y, knee_x, knee_y, tip_x, tip_y)
            # upper legs (arch upward)
            ( 8.0, 15.0,  5.0,  9.0,  1.0,  6.0),
            (12.0, 14.5,  9.0,  8.0,  5.0,  4.5),
            (17.0, 14.5, 20.5,  8.0, 24.0,  4.5),
            (22.0, 15.0, 25.5,  9.5, 30.0,  7.0),
            # lower legs (arch downward)
            ( 8.0, 17.0,  5.0, 22.5,  1.0, 26.0),
            (12.0, 17.5,  9.0, 23.0,  5.0, 27.5),
            (17.0, 17.5, 20.5, 23.0, 24.0, 27.5),
            (22.0, 17.0, 25.5, 22.5, 30.0, 26.0),
        ]
        for i, (ax, ay, kx, ky, tx, ty) in enumerate(side_legs):
            off = (wsign * wig if i % 2 == 0 else -wsign * wig)
            ky_a = ky + (off if i < 4 else -off)
            c.line(ax, ay + dy, kx, ky_a + dy, LEG, 1.1)
            c.line(kx, ky_a + dy, tx, ty + dy, LEG, 1.1)

        # Abdomen - right end, large oval
        c.ell(15, 10 + dy, 29, 22 + dy, MD)
        c.ell(16, 10 + dy, 26, 16 + dy, LT)
        c.ell(18, 18 + dy, 27, 22 + dy, SH)

        # Cephalothorax - left end, smaller
        c.ell(4, 11 + dy, 18, 21 + dy, DK)
        c.ell(5, 11 + dy, 16, 17 + dy, MD)
        c.ell(6, 12 + dy, 14, 16 + dy, LT)

        # 2 eyes on cephalothorax (side-facing)
        for (px, py) in ((5.5, 12.0), (8.5, 11.0)):
            c.ell(px, py + dy, px + 2.6, py + 2.6 + dy, EYE_Y)
            c.ell(px + 0.6, py + 0.6 + dy, px + 1.8, py + 1.8 + dy, PUPIL)

        # Fangs at left tip
        c.rect(3.0, 14.5 + dy, 4.2, 16.5 + dy, LEG)
        c.rect(3.0, 17.0 + dy, 4.2, 19.0 + dy, LEG)

        if d == 'right':
            c.flip_h()


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
