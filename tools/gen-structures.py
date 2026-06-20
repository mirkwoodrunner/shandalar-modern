#!/usr/bin/env python3
"""
gen-structures.py -- deterministic generator for the overworld structure icon
PNGs used by src/ui/overworld/WorldMap.jsx.

Output: 5 static 32x32 RGBA PNGs under src/assets/sprites/structures/:
  town.png           -- TOWN structure icon
  dungeon.png        -- DUNGEON structure icon
  castle.png         -- CASTLE structure icon (active)
  castle-defeated.png -- CASTLE structure icon (defeated / desaturated)
  ruin.png           -- RUIN structure icon

Shapes are drawn at 4x supersample (128x128) and downscaled with LANCZOS for
the soft, anti-aliased, no-hard-outline look that matches forest_tileset.png
and the creature sprite sheets from gen-sprites.py. The Cell helper is
duplicated locally (not imported from gen-sprites.py) to keep both generators
independent -- consistent with the no-shared-state pattern for asset generators.

This art is original, generated, released CC0 (see src/assets/sprites/CREDITS.md).
Re-run:  python3 tools/gen-structures.py
"""

import os
from PIL import Image, ImageDraw

SS = 4          # supersample factor
CELL = 32       # logical cell size (px)
C = CELL * SS   # supersampled cell size

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'src', 'assets', 'sprites', 'structures')

# ---------------------------------------------------------------------------
# Cell draw helper (same interface as gen-sprites.py -- do not import from there)
# ---------------------------------------------------------------------------

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

    def downscaled(self):
        return self.img.resize((CELL, CELL), Image.LANCZOS)


# ---------------------------------------------------------------------------
# Structure icon drawing functions
# ---------------------------------------------------------------------------

# TOWN: two cottages with peaked roofs, doors and window accents
# Palette -- warm tan walls, brownish-red roofs, dark doors, warm window glow
TOWN_WALL     = (195, 168, 120, 255)   # warm sandstone
TOWN_WALL_SH  = (150, 128, 85, 255)   # shadow side of wall
TOWN_ROOF     = (148, 78, 45, 255)    # dark red-brown roof
TOWN_ROOF_HI  = (180, 105, 65, 255)  # roof highlight
TOWN_DOOR     = (65, 42, 22, 255)     # dark door
TOWN_WIN      = (215, 195, 120, 255)  # warm window glow

def draw_town(c):
    # Left cottage -- smaller, slightly behind
    c.poly([(3, 15), (15, 15), (9, 7)], TOWN_ROOF)              # left roof
    c.poly([(4, 14), (10, 14), (9, 7)], TOWN_ROOF_HI)           # roof highlight
    c.rect(4, 14, 14, 29, TOWN_WALL)                            # left wall body
    c.rect(4, 14, 7, 29, TOWN_WALL_SH)                         # shadow left face
    c.rect(7, 21, 11, 29, TOWN_DOOR)                            # left door
    c.rect(5, 17, 8, 20, TOWN_WIN)                              # left window

    # Right cottage -- larger, slightly in front
    c.poly([(14, 13), (29, 13), (22, 4)], TOWN_ROOF)            # right roof
    c.poly([(15, 12), (22, 12), (22, 4)], TOWN_ROOF_HI)         # roof highlight
    c.rect(15, 12, 28, 29, TOWN_WALL)                           # right wall body
    c.rect(15, 12, 19, 29, TOWN_WALL_SH)                       # shadow left face
    c.rect(20, 18, 25, 29, TOWN_DOOR)                           # right door
    c.rect(16, 15, 19, 19, TOWN_WIN)                            # right window
    c.rect(23, 15, 27, 19, TOWN_WIN)                            # second window


# DUNGEON: stone archway with dark cave interior, jagged cave mouth
# Palette -- medium stone, dark interior, rough ground
DNG_STONE     = (108, 92, 72, 255)   # medium stone
DNG_STONE_HI  = (145, 125, 98, 255) # lighter stone face
DNG_STONE_SH  = (70, 58, 44, 255)  # dark stone shadow
DNG_CAVE      = (22, 16, 10, 255)   # cave interior -- very dark
DNG_GROUND    = (88, 76, 60, 255)   # ground/floor

def draw_dungeon(c):
    # Ground bar
    c.rect(2, 25, 30, 30, DNG_GROUND)

    # Stone pillars (arch sides)
    c.rect(4, 10, 12, 26, DNG_STONE)
    c.rect(4, 10, 8, 26, DNG_STONE_HI)        # left face highlight
    c.rect(20, 10, 28, 26, DNG_STONE)
    c.rect(20, 10, 23, 26, DNG_STONE_SH)      # right face shadow

    # Arch keystone / top block
    c.rect(4, 8, 28, 14, DNG_STONE)
    c.rect(4, 8, 28, 11, DNG_STONE_HI)        # top face lighter

    # Arch opening (cave interior) -- semi-ellipse cut into the stone
    c.ell(10, 6, 22, 20, DNG_CAVE)            # arch curve interior

    # Dark cave mouth rectangle beneath the arch
    c.rect(10, 14, 22, 26, DNG_CAVE)

    # Jagged teeth at cave mouth top to signal danger / entrance
    c.poly([(10, 18), (12, 14), (14, 18)], DNG_STONE_SH)
    c.poly([(14, 18), (16, 13), (18, 18)], DNG_STONE_SH)
    c.poly([(18, 18), (20, 14), (22, 18)], DNG_STONE_SH)

    # Rough crack details on the pillar face
    c.line(6, 12, 7, 18, DNG_STONE_SH, 0.5)
    c.line(23, 14, 24, 22, DNG_STONE_SH, 0.5)


# CASTLE: turreted keep with crenellations and a flag.
# Stone palette is fixed (no per-mage tinting). Only the flag color varies.
CST_WALL      = (162, 152, 138, 255)
CST_WALL_HI   = (200, 190, 174, 255)
CST_WALL_SH   = (106,  96,  84, 255)
CST_DARK      = ( 72,  64,  55, 255)

# Flag color pairs (fill, shadow) for each mage color + neutral default.
_FLAG = {
    'default': ((200,  58,  38, 255), (145,  35,  20, 255)),  # red (neutral)
    'W':       ((222, 215, 192, 255), (165, 158, 138, 255)),  # ivory / white
    'U':       (( 38,  85, 195, 255), ( 20,  52, 132, 255)),  # royal blue
    'B':       (( 55,  25,  80, 255), ( 28,  10,  50, 255)),  # deep purple
    'R':       ((200,  58,  38, 255), (145,  35,  20, 255)),  # red
    'G':       (( 30, 145,  38, 255), ( 16,  88,  20, 255)),  # green
}

def _draw_castle(c, flag_col, flag_sh):
    # Main tower body
    c.rect(8, 11, 24, 29, CST_WALL)
    c.rect(8, 11, 13, 29, CST_WALL_HI)
    c.rect(20, 11, 24, 29, CST_WALL_SH)
    # Crenellations
    c.rect( 8, 7, 12, 11, CST_WALL); c.rect( 8, 7, 11,  9, CST_WALL_HI)
    c.rect(15, 7, 19, 11, CST_WALL); c.rect(15, 7, 18,  9, CST_WALL_HI)
    c.rect(21, 7, 25, 11, CST_WALL); c.rect(21, 7, 24,  9, CST_WALL_HI)
    # Gate arch
    c.rect(12, 19, 20, 29, CST_DARK)
    c.ell(12, 15, 20, 23, CST_DARK)
    for gy in (20, 23, 26):
        c.line(12, gy, 20, gy, CST_WALL_SH, 0.5)
    # Side turrets
    c.rect( 3, 14,  9, 29, CST_WALL_HI); c.rect( 3, 11,  7, 14, CST_WALL)
    c.rect(23, 14, 29, 29, CST_WALL_SH); c.rect(25, 11, 29, 14, CST_WALL)
    # Flag pole + pennant
    c.line(17, 1, 17, 7, CST_DARK, 0.6)
    c.poly([(17, 1), (17, 5), (24, 3)], flag_col)
    c.poly([(17, 3), (17, 5), (22, 4)], flag_sh)

def draw_castle(c):
    _draw_castle(c, *_FLAG['default'])

def draw_castle_white(c):
    _draw_castle(c, *_FLAG['W'])

def draw_castle_blue(c):
    _draw_castle(c, *_FLAG['U'])

def draw_castle_black(c):
    _draw_castle(c, *_FLAG['B'])

def draw_castle_red(c):
    _draw_castle(c, *_FLAG['R'])

def draw_castle_green(c):
    _draw_castle(c, *_FLAG['G'])



# CASTLE DEFEATED: broken silhouette -- crumbled merlon, snapped pole, cracks,
# rubble at base. Desaturated+darkened palette AND altered composition so the
# shape itself reads "fallen" at a glance (not just a recolor of the active icon).
CST_D_WALL    = (100, 95, 88, 255)   # desaturated wall
CST_D_WALL_HI = (128, 122, 114, 255) # desaturated lit face
CST_D_WALL_SH = (62, 58, 52, 255)   # desaturated shadow (darker than active)
CST_D_DARK    = (42, 38, 34, 255)   # very dark crevices / gate interior
CST_D_RUBBLE  = (82, 76, 68, 255)   # fallen stone / rubble chunks
CST_D_CRACK   = (48, 44, 40, 255)   # crack lines

def draw_castle_defeated(c):
    # Main tower body -- same footprint as active castle
    c.rect(8, 11, 24, 29, CST_D_WALL)
    c.rect(8, 11, 13, 29, CST_D_WALL_HI)
    c.rect(20, 11, 24, 29, CST_D_WALL_SH)

    # Crenellations -- left merlon intact, center merlon BROKEN (jagged top),
    # right merlon completely gone (wall just ends flat)
    c.rect(8, 7, 12, 11, CST_D_WALL)            # left merlon (intact)
    c.rect(8, 7, 11, 9, CST_D_WALL_HI)

    # Center merlon: jagged broken top -- draw body then irregular top poly
    c.rect(15, 9, 19, 11, CST_D_WALL)           # merlon lower stub
    c.poly([(15, 9), (15, 7), (16, 8), (17, 6), (19, 9)], CST_D_WALL)  # crumbled top

    # Right merlon: gone -- rubble chunk fallen outward onto right turret top
    c.poly([(21, 11), (25, 11), (24, 14), (20, 13)], CST_D_RUBBLE)     # fallen block

    # Gate -- open (portcullis destroyed), no bars, larger dark void
    c.rect(12, 16, 20, 29, CST_D_DARK)
    c.ell(12, 13, 20, 21, CST_D_DARK)

    # Side turrets
    c.rect(3, 14, 9, 29, CST_D_WALL_HI)
    c.rect(3, 11, 7, 14, CST_D_WALL)
    c.rect(23, 14, 29, 29, CST_D_WALL_SH)
    # Right turret top: also broken -- irregular jagged edge instead of clean merlon
    c.poly([(23, 14), (26, 11), (27, 13), (29, 11), (29, 14)], CST_D_WALL)

    # Diagonal crack through the main wall
    c.line(13, 13, 10, 22, CST_D_CRACK, 0.6)
    c.line(19, 15, 22, 25, CST_D_CRACK, 0.6)

    # Snapped flag pole stub -- just a short broken stump, no flag
    c.line(17, 7, 17, 10, CST_D_CRACK, 0.7)
    # Broken-off tip: a tiny fallen piece leaning to the side
    c.line(17, 7, 20, 5, CST_D_CRACK, 0.6)

    # Rubble at the base of the gate
    c.poly([(11, 27), (14, 25), (16, 28), (11, 29)], CST_D_RUBBLE)
    c.poly([(18, 26), (21, 25), (21, 29), (17, 29)], CST_D_RUBBLE)


# CASTLE BOSS: three-tower obsidian keep, Gothic spires, glowing evil eye,
# forked dark war-banner. Distinct silhouette from the regular castle.
BOSS_WALL    = ( 40,  34,  30, 255)  # obsidian stone
BOSS_WALL_HI = ( 64,  55,  49, 255)  # lit stone face
BOSS_WALL_SH = ( 18,  15,  12, 255)  # deep shadow
BOSS_GATE    = (  6,   5,   4, 255)  # gate abyss
BOSS_EYE     = (212,  32,  12, 255)  # glowing red eye
BOSS_EYE_HI  = (255,  90,  50, 255)  # eye highlight
BOSS_FLAG    = ( 14,   8,   8, 255)  # near-black banner
BOSS_FLAG_AC = (165,  16,  10, 255)  # blood-red accent stripe

def draw_castle_boss(c):
    # --- Left side tower (shorter) ---
    c.rect(1, 15, 9, 29, BOSS_WALL)
    c.rect(1, 15, 5, 29, BOSS_WALL_HI)
    c.rect(7, 15, 9, 29, BOSS_WALL_SH)
    # Two pointed fangs on left tower top
    c.poly([(1, 15), (2, 11), (4, 15)], BOSS_WALL_HI)
    c.poly([(5, 15), (6, 11), (8, 15)], BOSS_WALL)

    # --- Right side tower (shorter) ---
    c.rect(23, 15, 31, 29, BOSS_WALL)
    c.rect(23, 15, 27, 29, BOSS_WALL_HI)
    c.rect(28, 15, 31, 29, BOSS_WALL_SH)
    # Two pointed fangs on right tower top
    c.poly([(23, 15), (25, 11), (27, 15)], BOSS_WALL)
    c.poly([(27, 15), (29, 11), (31, 15)], BOSS_WALL_SH)

    # --- Center keep (much taller) ---
    c.rect(8, 7, 24, 29, BOSS_WALL)
    c.rect(8, 7, 13, 29, BOSS_WALL_HI)
    c.rect(20, 7, 24, 29, BOSS_WALL_SH)

    # Three Gothic spires rising from the keep top
    # Left spire
    c.poly([( 8, 7), (11, 3), (14, 7)], BOSS_WALL_HI)
    # Center spire (tallest -- reaches top of canvas)
    c.poly([(13, 7), (16, 0), (19, 7)], BOSS_WALL)
    c.poly([(13, 7), (16, 2), (18, 7)], BOSS_WALL_HI)   # lit left face
    # Right spire
    c.poly([(18, 7), (21, 3), (24, 7)], BOSS_WALL_SH)

    # Wide pointed gate arch (Gothic, darker than regular castle)
    c.rect(12, 20, 20, 29, BOSS_GATE)
    c.poly([(12, 20), (16, 15), (20, 20)], BOSS_GATE)

    # Glowing evil eye window -- drawn on the wall between spire base and gate
    c.ell(13,  9, 19, 15, BOSS_WALL_SH)   # dark socket
    c.ell(14, 10, 18, 14, BOSS_EYE)       # red glow fill
    c.ell(15, 11, 17, 13, BOSS_EYE_HI)   # hot highlight center

    # Dark forked war-banner at center spire tip (serpent-tongue shape)
    c.poly([(16, 0), (16, 3), (23, 1)], BOSS_FLAG)        # upper fork
    c.poly([(16, 2), (16, 5), (22, 5)], BOSS_FLAG)        # lower fork
    c.poly([(17, 1), (22, 1), (20, 3), (17, 2)], BOSS_FLAG_AC)  # blood stripe


# RUIN: crumbled stone walls, partial stubs, rubble pile
# Palette -- worn stone, dust/debris, dark cracks; distinct from dungeon
# Dungeon = archway entrance (intact frame, dark opening)
# Ruin = broken walls, no roof, rubble (no intact structure)
RN_STONE      = (140, 122, 98, 255)  # weathered stone
RN_STONE_HI   = (175, 155, 125, 255) # lighter stone face
RN_STONE_SH   = (88, 75, 58, 255)  # dark stone / crack
RN_RUBBLE     = (115, 100, 80, 255) # loose rubble
RN_DUST       = (165, 148, 118, 255) # dusty ground

def draw_ruin(c):
    # Rubble/dust ground base
    c.rect(3, 24, 29, 30, RN_DUST)

    # Rubble chunks scattered at base
    c.poly([(3, 24), (9, 24), (7, 28), (2, 27)], RN_RUBBLE)
    c.poly([(12, 24), (18, 24), (20, 28), (10, 29)], RN_STONE_SH)
    c.poly([(20, 24), (28, 24), (29, 27), (22, 28)], RN_RUBBLE)

    # Left wall stub -- standing partial wall, jagged broken top
    c.rect(4, 10, 12, 25, RN_STONE)
    c.rect(4, 10, 7, 25, RN_STONE_HI)         # lit face
    c.rect(10, 10, 12, 25, RN_STONE_SH)        # shadow
    # Crumbled / jagged top of left stub
    c.poly([(4, 10), (7, 7), (8, 10)], RN_STONE_HI)
    c.poly([(8, 10), (10, 6), (12, 10)], RN_STONE)
    # Crack through the left wall
    c.line(7, 14, 6, 22, RN_STONE_SH, 0.5)

    # Right wall fragment -- shorter, tilted feel, further crumbled
    c.rect(20, 14, 28, 25, RN_STONE)
    c.rect(20, 14, 23, 25, RN_STONE_HI)
    c.rect(26, 14, 28, 25, RN_STONE_SH)
    # Jagged broken top on right stub
    c.poly([(20, 14), (22, 11), (24, 14)], RN_STONE)
    c.poly([(24, 14), (27, 9), (28, 14)], RN_STONE_HI)
    # Crack
    c.line(24, 17, 25, 24, RN_STONE_SH, 0.5)

    # Fallen stone block in the middle (horizontal)
    c.rect(11, 19, 21, 24, RN_STONE)
    c.rect(11, 19, 21, 21, RN_STONE_HI)   # top face lighter
    c.rect(11, 22, 21, 24, RN_STONE_SH)   # bottom shadow


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

ICONS = {
    'town':             draw_town,
    'dungeon':          draw_dungeon,
    'castle':           draw_castle,
    'castle-white':     draw_castle_white,
    'castle-blue':      draw_castle_blue,
    'castle-black':     draw_castle_black,
    'castle-red':       draw_castle_red,
    'castle-green':     draw_castle_green,
    'castle-defeated':  draw_castle_defeated,
    'castle-boss':      draw_castle_boss,
    'ruin':             draw_ruin,
}


def main():
    out = os.path.normpath(OUT_DIR)
    os.makedirs(out, exist_ok=True)
    for name, draw_fn in ICONS.items():
        cell = Cell()
        draw_fn(cell)
        img = cell.downscaled()
        path = os.path.join(out, f'{name}.png')
        img.save(path)
        print(f'wrote {path}  ({img.width}x{img.height})')


if __name__ == '__main__':
    main()
