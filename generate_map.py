"""
Generates azhora_map.png — a schoolchild's map of Corav, as kept in
the Azhoran Academy of Natural History's Prelloss Omath Collection.
"""
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import Polygon, Ellipse, FancyBboxPatch
from matplotlib.patheffects import withStroke
import numpy as np

W, H = 220, 150
rng = np.random.default_rng(42)


def wobble(pts, strength=0.9):
    """Add child-hand wobble to polygon coordinates."""
    arr = np.array(pts, dtype=float)
    arr += rng.normal(0, strength, arr.shape)
    return arr.tolist()


def make_map():
    fig, ax = plt.subplots(figsize=(22, 15))
    ax.set_xlim(0, W)
    ax.set_ylim(0, H)
    ax.set_aspect('equal')
    ax.axis('off')

    # ── notebook paper background ────────────────────────────────────────────
    fig.patch.set_facecolor('#f5f0e4')
    ax.set_facecolor('#e8f0f8')   # child's blue = ocean

    # faint ruled lines like notebook paper
    for yi in np.arange(6, H, 7):
        ax.axhline(yi, color='#aac4e0', linewidth=0.35, alpha=0.5, zorder=0)

    # ── crayon helper ─────────────────────────────────────────────────────────
    def crayon(pts, color, edge=None, lw=2.2, z=2, alpha=0.82):
        """Draw a filled polygon with rough crayon-stroke edges."""
        w = wobble(pts, 1.1)
        ec = edge or color
        ax.add_patch(Polygon(w, closed=True, facecolor=color,
                             edgecolor=ec, linewidth=lw,
                             zorder=z, alpha=alpha,
                             capstyle='round', joinstyle='round'))
        # second stroke slightly offset — crayon layering effect
        w2 = wobble(pts, 0.6)
        ax.add_patch(Polygon(w2, closed=True, facecolor='none',
                             edgecolor=ec, linewidth=lw * 0.5,
                             zorder=z, alpha=alpha * 0.4,
                             capstyle='round', joinstyle='round'))

    def kid_text(x, y, text, fs=7, color='#1a1a6a', angle=0, ha='center',
                 bold=False):
        ax.text(x, y + rng.uniform(-0.4, 0.4), text,
                fontsize=fs, color=color,
                fontweight='bold' if bold else 'normal',
                fontstyle='normal', zorder=12,
                ha=ha, va='center', rotation=angle + rng.uniform(-2, 2),
                path_effects=[withStroke(linewidth=2, foreground='#f5f0e4')])

    # ── NORTHERN CONTINENT (green band, child draws it flat) ─────────────────
    crayon([
        (0, 130), (18, 126), (38, 124), (58, 122), (76, 122),
        (94, 123), (112, 124), (132, 126), (150, 124), (168, 126),
        (188, 128), (210, 130), (220, 132),
        (220, 150), (0, 150)
    ], '#5aaa3a', '#3a7a22', lw=2.5, alpha=0.85)

    # dark smudge — child colours the forest extra hard
    crayon([(48, 126), (68, 123), (86, 123), (102, 125),
            (94, 133), (72, 135), (50, 134)],
           '#2a6018', '#1a4010', lw=1.5, alpha=0.7, z=3)

    # ── ICE SPEAR (child makes it a big dramatic spike) ───────────────────────
    crayon([
        (71, 122), (68, 116), (67, 110), (68, 105),
        (70, 102), (72, 105), (73, 111), (72, 118), (71, 122)
    ], '#ddf0ff', '#90c8e0', lw=2.0, z=4, alpha=0.9)

    # ── COLD STONES (child draws as chunky white blobs) ──────────────────────
    for pts in [
        [(78, 120), (83, 118), (87, 120), (85, 124), (79, 123)],
        [(89, 116), (95, 114), (99, 117), (97, 121), (90, 120)],
        [(102, 120), (107, 118), (111, 121), (108, 125), (103, 124)],
        [(92, 122), (96, 121), (99, 124), (95, 126)],
    ]:
        crayon(pts, '#e8f4f8', '#90b8cc', lw=1.5, z=3, alpha=0.85)

    # ── AZHORA BASE (arid yellow — drawn BIG because it's home) ──────────────
    azhora = [
        (20, 108),
        (24, 113), (29, 117), (34, 113),   # Bay of Lol
        (39, 117), (45, 115), (51, 117),   # N coast
        (57, 115), (63, 117), (69, 115),   # N coast
        (75, 112), (81, 108), (87, 113),   # Smunders Bay
        (93, 115), (99, 113), (107, 109),  # NE
        (115, 103), (121, 95), (127, 86),  # E coast
        (132, 75), (136, 63), (134, 52),   # E lower
        (128, 42), (120, 35), (110, 30),   # SE
        (100, 28), (90, 28), (80, 30),     # S
        (70, 32), (64, 36), (60, 40),      # SW
        (57, 35), (55, 27), (53, 19),      # Bouén E
        (51, 12), (50, 8),
        (48, 8), (46, 12),                 # tip
        (44, 19), (42, 27), (40, 35),      # Bouén W
        (38, 42),
        (34, 50), (30, 60), (26, 72),      # W coast
        (22, 84), (20, 96), (20, 108)
    ]
    crayon(azhora, '#e8b830', '#c89010', lw=2.8, alpha=0.88)

    # ── GREEN WESTERN REGION (Mittolo — child presses hard with green) ────────
    azhora_green = [
        (20, 108),
        (24, 113), (29, 117), (34, 113),
        (39, 117), (45, 115), (51, 117),
        (57, 115), (63, 117), (69, 115),
        (73, 113),
        # green-yellow boundary — wavy, imprecise
        (71, 105), (69, 97), (66, 88),
        (64, 79), (61, 70), (59, 61),
        (56, 52), (54, 44), (51, 38),
        (44, 42), (40, 50), (36, 58),
        (30, 68), (26, 78), (22, 90),
        (20, 100), (20, 108)
    ]
    crayon(azhora_green, '#5aaa3a', '#3a8022', lw=2.5, alpha=0.85, z=3)

    # redraw coast outline over everything — thick child crayon
    ax.add_patch(Polygon(wobble(azhora, 1.0), closed=True, facecolor='none',
                         edgecolor='#6a3a00', linewidth=2.2, zorder=7,
                         capstyle='round', joinstyle='round'))

    # ── BOUÉN (slightly different green, child remembers it's cold) ───────────
    bouen = [
        (60, 40), (57, 35), (55, 27), (53, 19),
        (51, 12), (50, 8), (48, 8), (46, 12),
        (44, 19), (42, 27), (40, 35), (38, 42),
        (40, 48), (46, 51), (54, 51), (59, 46)
    ]
    crayon(bouen, '#4a9838', '#2a6820', lw=2.0, alpha=0.88, z=5)

    # ── dark forest smudges on green Azhora ───────────────────────────────────
    for pts in [
        [(36, 100), (44, 97), (50, 100), (47, 107), (39, 107), (35, 104)],
        [(26, 75), (34, 73), (39, 76), (37, 83), (29, 83), (24, 80)],
        [(52, 89), (60, 87), (64, 91), (60, 98), (53, 97)],
        [(43, 65), (51, 63), (56, 67), (52, 73), (44, 73)],
    ]:
        crayon(pts, '#2a6018', '#1a4010', lw=1.4, alpha=0.72, z=6)

    # ── AZNER SHORES ─────────────────────────────────────────────────────────
    for pts in [
        [(60, 28), (66, 26), (70, 28), (68, 32), (61, 31)],
        [(68, 21), (74, 19), (78, 22), (76, 26), (69, 25)],
        [(77, 27), (83, 25), (87, 28), (84, 32), (78, 31)],
        [(66, 14), (72, 12), (76, 15), (74, 19), (66, 18)],
    ]:
        crayon(pts, '#5aaa3a', '#3a8022', lw=1.6, alpha=0.82, z=4)

    # stepping stone
    crayon([(53, 6), (58, 4), (62, 6), (60, 10), (54, 10)],
           '#5aaa3a', '#3a8022', lw=1.5, alpha=0.8, z=4)

    # ── SOUTHERN ARCHIPELAGO ─────────────────────────────────────────────────
    crayon([(68, 14), (77, 11), (88, 10), (96, 12), (100, 17),
            (95, 22), (86, 23), (77, 22), (68, 18)],
           '#5aaa3a', '#3a8022', lw=2.0, alpha=0.84, z=4)
    crayon([(88, 10), (96, 12), (100, 17), (93, 20), (85, 17), (82, 12)],
           '#c09020', '#a07010', lw=1.2, alpha=0.7, z=5)

    crayon([(104, 14), (113, 12), (120, 14), (122, 19),
            (117, 23), (108, 24), (103, 19)],
           '#5aaa3a', '#3a8022', lw=1.8, alpha=0.84, z=4)

    crayon([(126, 10), (135, 8), (143, 10), (145, 15),
            (140, 19), (131, 20), (125, 16)],
           '#5aaa3a', '#3a8022', lw=1.8, alpha=0.84, z=4)
    crayon([(135, 8), (143, 10), (145, 15), (138, 17),
            (130, 13), (128, 9)],
           '#c09020', '#a07010', lw=1.2, alpha=0.7, z=5)

    for pts in [
        [(80, 5), (87, 3), (91, 6), (89, 10), (81, 9)],
        [(98, 5), (105, 4), (108, 7), (105, 10), (98, 9)],
        [(112, 5), (119, 4), (122, 7), (119, 10), (112, 9)],
        [(146, 11), (153, 10), (156, 13), (153, 17), (146, 16)],
    ]:
        crayon(pts, '#3a8828', '#286018', lw=1.4, alpha=0.8, z=4)

    # ── IBEROS SEA ISLANDS ───────────────────────────────────────────────────
    for pts in [
        [(120, 90), (126, 88), (130, 91), (127, 95), (121, 94)],
        [(130, 80), (136, 78), (140, 81), (137, 85), (131, 84)],
        [(122, 72), (128, 70), (132, 73), (130, 78), (123, 77)],
        [(137, 72), (142, 70), (146, 73), (143, 77), (138, 76)],
        [(124, 62), (130, 60), (134, 63), (131, 67), (125, 66)],
        [(141, 62), (147, 60), (151, 63), (148, 67), (142, 66)],
        [(120, 103), (125, 101), (129, 103), (127, 107), (121, 106)],
    ]:
        crayon(pts, '#3a8828', '#286018', lw=1.6, alpha=0.82, z=4)

    # Pebbles
    for pts in [
        [(148, 108), (154, 106), (158, 109), (155, 113), (149, 112)],
        [(156, 105), (160, 104), (163, 106), (160, 109)],
    ]:
        crayon(pts, '#3a8828', '#286018', lw=1.4, alpha=0.8, z=4)

    # Suval
    crayon([(158, 88), (168, 84), (178, 86), (182, 95),
            (177, 104), (167, 106), (158, 101), (154, 94)],
           '#3a8828', '#286018', lw=2.0, alpha=0.84, z=4)
    crayon([(168, 84), (178, 86), (182, 95), (175, 100),
            (165, 94), (162, 87)],
           '#c09020', '#a07010', lw=1.2, alpha=0.7, z=5)

    # Canon (partially off edge — child ran out of paper)
    crayon([(191, 91), (202, 87), (214, 90), (219, 100),
            (213, 110), (202, 112), (191, 107), (188, 99)],
           '#3a8828', '#286018', lw=2.0, alpha=0.84, z=4)

    # ── WESTERN LANDMASS ─────────────────────────────────────────────────────
    crayon([(0, 60), (10, 56), (15, 62), (17, 73), (14, 84),
            (9, 90), (4, 88), (0, 84)],
           '#5aaa3a', '#3a8022', lw=2.0, alpha=0.82, z=4)

    # ── THE SILENCE (dark scribble patch) ────────────────────────────────────
    ax.add_patch(Ellipse((14, 87), 14, 10, facecolor='#243450',
                         edgecolor='#182838', lw=0.5, alpha=0.55, zorder=3))

    # ── SEA MONSTER in The Silence (child can't resist) ───────────────────────
    # body
    ax.add_patch(Ellipse((14, 84), 7, 3.5, facecolor='none',
                         edgecolor='#0a1830', lw=1.4, alpha=0.6, zorder=8))
    # humps
    for hx, hy in [(10, 86), (13, 87.5), (16, 86.5)]:
        ax.add_patch(Ellipse((hx, hy), 2.2, 1.2, facecolor='none',
                             edgecolor='#0a1830', lw=1.2, alpha=0.55, zorder=8))
    # eye
    ax.plot(11.5, 84.5, 'o', color='#0a1830', ms=1.0, zorder=9, alpha=0.7)

    # ── LABELS ────────────────────────────────────────────────────────────────
    # child writes region names in big wobbly letters
    kid_text(48, 88, 'MITTOLO',       fs=11,  color='#1a3a0a', bold=True)
    kid_text(100, 68, 'MORASHEE\nDESERT', fs=8, color='#6a3800', bold=True)
    kid_text(49, 27, 'BOUEN',         fs=7.5, color='#1a3a0a', bold=True)
    kid_text(27, 104,'N AZORA',       fs=6,   color='#1a3a0a')
    kid_text(44, 70, 'W PYROS',       fs=5.5, color='#2a4a10')
    kid_text(83, 93, 'E PYROS',       fs=5.5, color='#5a3800')
    kid_text(82, 76, 'THE PLAYNS',    fs=5.5, color='#5a3800')  # misspelling
    kid_text(32, 78, 'GANOSS',        fs=5.0, color='#2a4a10')

    # northern features
    kid_text(70, 118, 'ICE\nSPEAR',   fs=6.5, color='#1a4a6a', bold=True)
    kid_text(96, 121, 'COLD STONES',  fs=5.5, color='#1a4a6a')
    kid_text(90, 138, 'NOTHERN LAND', fs=9.5, color='#1a4a1a', bold=True)  # misspelling
    kid_text(90, 133, '(nobody goes here)', fs=5.0, color='#3a6a2a')

    # water
    ax.text(150, 80, 'IBEROS SEA', fontsize=9, color='#1a3a6a',
            fontstyle='italic', zorder=10, ha='center', alpha=0.55,
            rotation=rng.uniform(-3, 3))
    ax.text(11, 84, 'HERE BE\nMONSTERS', fontsize=4.5, color='#1a2840',
            zorder=11, ha='center', alpha=0.7)
    ax.text(10, 70, 'BIG\nOCEAN', fontsize=6.5, color='#1a3a6a',
            fontstyle='italic', zorder=10, ha='center', alpha=0.5)
    ax.text(22, 8, 'WARM SEA', fontsize=6.5, color='#1a3a6a',
            fontstyle='italic', zorder=10, ha='center', alpha=0.5)
    ax.text(56, 120, 'COLD SEA', fontsize=6.5, color='#1a3a6a',
            fontstyle='italic', zorder=10, ha='center', alpha=0.5)

    # bay labels (child writes small and slightly wrong)
    ax.text(30, 117, 'Bay of Lol', fontsize=5, color='#1a3a6a',
            fontstyle='italic', zorder=10, ha='center', alpha=0.7,
            rotation=rng.uniform(-4, 4))
    ax.text(81, 115, 'Smunders Bay', fontsize=5, color='#1a3a6a',
            fontstyle='italic', zorder=10, ha='center', alpha=0.7,
            rotation=rng.uniform(-4, 4))

    # southern islands
    kid_text(84, 16,  'BROSERY',     fs=5.5, color='#1a4a1a')   # misspelled
    kid_text(112, 18, 'ADIU',        fs=5.5, color='#1a4a1a')
    kid_text(136, 14, 'GOLZ CITY',   fs=5.5, color='#1a4a1a')
    kid_text(113, 2,  'SOUTHERN ISLANDS', fs=6.5, color='#1a4a1a', bold=True)
    kid_text(74, 26,  'AZNER IS.',   fs=5.0, color='#1a4a1a')
    kid_text(168, 96, 'SUVAL',       fs=5.5, color='#1a4a1a')
    kid_text(155, 108,'PEBBLES',     fs=4.5, color='#1a4a1a')
    kid_text(206, 100,'CANON →',     fs=5.5, color='#1a4a1a')

    # ── CHILD'S TITLE AND SIGNATURE ──────────────────────────────────────────
    ax.text(W/2, H - 3, 'THE HOLE WORLD (CORAV)',
            fontsize=14, color='#1a1a6a', fontweight='bold',
            ha='center', va='top', zorder=13,
            rotation=rng.uniform(-1.5, 1.5))
    ax.text(W/2, H - 10, 'drawed by me for geography class',
            fontsize=6.5, color='#3a3a8a', fontstyle='italic',
            ha='center', va='top', zorder=13)

    # little drawn sun in corner
    sx, sy = 196, 138
    ax.plot(sx, sy, 'o', color='#e8c020', ms=8, zorder=12, alpha=0.85)
    for ang in range(0, 360, 45):
        rad = np.radians(ang)
        ax.plot([sx + 5.5*np.cos(rad), sx + 8*np.cos(rad)],
                [sy + 5.5*np.sin(rad), sy + 8*np.sin(rad)],
                color='#e8c020', lw=1.4, zorder=12, alpha=0.8)

    # page border — slightly uneven, like a child drew it with a ruler
    for lw, al in [(2.8, 0.7), (0.8, 0.35)]:
        ax.add_patch(FancyBboxPatch(
            (1.5, 1.5), W-3, H-3, boxstyle='square,pad=0',
            facecolor='none', edgecolor='#3a3a8a',
            linewidth=lw, zorder=14, alpha=al))

    out = 'azhora_map.png'
    plt.savefig(out, dpi=180, bbox_inches='tight',
                facecolor=fig.get_facecolor())
    print(f"Saved -> {out}")
    plt.show()


if __name__ == '__main__':
    make_map()
