"""
Generate realistic VS Code mockup screenshots for KiCad Studio extension.
Output: assets/screenshots/*.png  (1280 x 720, 96 dpi)
"""

import os
import math
from PIL import Image, ImageDraw, ImageFont

# ── palette ──────────────────────────────────────────────────────────────────
BG          = "#1e1e1e"
SIDEBAR_BG  = "#252526"
ACTBAR_BG   = "#333333"
PANEL_BG    = "#1e1e2e"
PANEL_HDR   = "#252540"
STATUSBAR   = "#007acc"
EDITOR_BG   = "#1e1e1e"
TAB_ACT     = "#1e1e1e"
TAB_INACT   = "#2d2d2d"
BORDER      = "#3c3c3c"
TEXT        = "#cccccc"
TEXT_DIM    = "#888888"
TEXT_BRIGHT = "#ffffff"
TEXT_BLUE   = "#569cd6"
TEXT_GREEN  = "#4ec9b0"
TEXT_ORANGE = "#ce9178"
TEXT_YELLOW = "#dcdcaa"
TEXT_RED    = "#f44747"
TEXT_CYAN   = "#9cdcfe"
TEXT_PURPLE = "#c586c0"
ACCENT      = "#007acc"
SUCCESS     = "#4caf50"
WARN        = "#ff9800"
ERROR       = "#f44336"
LINE_HL     = "#2a2d2e"
SCROLLBAR   = "#424242"
KICAD_GREEN = "#00b300"

W, H = 1280, 720
ACTBAR_W   = 48
SIDEBAR_W  = 260
TABBAR_H   = 35
STATUSBAR_H= 22
TITLEBAR_H = 28

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "screenshots")
os.makedirs(OUT_DIR, exist_ok=True)

# ── font helpers ─────────────────────────────────────────────────────────────
def _font(size=12, bold=False):
    candidates = [
        "C:/Windows/Fonts/consola.ttf",
        "C:/Windows/Fonts/consolab.ttf" if bold else "C:/Windows/Fonts/consola.ttf",
        "C:/Windows/Fonts/cour.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ]
    for p in candidates:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            pass
    return ImageFont.load_default()

def _sans(size=12, bold=False):
    candidates = [
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/tahoma.ttf",
    ]
    for p in candidates:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            pass
    return ImageFont.load_default()

# ── drawing primitives ───────────────────────────────────────────────────────
def draw_text(d, xy, text, font, color=TEXT, anchor="lt"):
    d.text(xy, text, font=font, fill=color, anchor=anchor)

def draw_rect(d, box, fill=None, outline=None, radius=0, width=1):
    if radius:
        d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)
    else:
        d.rectangle(box, fill=fill, outline=outline, width=width)

def draw_badge(d, xy, text, bg, fg=TEXT_BRIGHT, font=None, pad=4, radius=3):
    if font is None:
        font = _sans(10)
    bbox = font.getbbox(text)
    tw, th = bbox[2]-bbox[0], bbox[3]-bbox[1]
    x, y = xy
    box = [x, y, x + tw + pad*2, y + th + pad*2]
    draw_rect(d, box, fill=bg, radius=radius)
    d.text((x+pad, y+pad), text, font=font, fill=fg)
    return box[2] + 4

# ── VS Code chrome ────────────────────────────────────────────────────────────
def make_base(title="KiCad Studio - VS Code"):
    img = Image.new("RGB", (W, H), BG)
    d   = ImageDraw.Draw(img)

    # title bar
    draw_rect(d, [0, 0, W, TITLEBAR_H], fill="#323233")
    draw_text(d, (W//2, TITLEBAR_H//2), title, _sans(11), TEXT_DIM, anchor="mm")
    # traffic lights (Windows style)
    for i, col in enumerate(["#888", "#888", "#888"]):
        bx = W - 46 + i*16
        draw_rect(d, [bx, 6, bx+14, TITLEBAR_H-6], fill=col)

    # activity bar
    draw_rect(d, [0, TITLEBAR_H, ACTBAR_W, H-STATUSBAR_H], fill=ACTBAR_BG)

    # sidebar
    draw_rect(d, [ACTBAR_W, TITLEBAR_H, ACTBAR_W+SIDEBAR_W, H-STATUSBAR_H], fill=SIDEBAR_BG)
    draw_rect(d, [ACTBAR_W+SIDEBAR_W, TITLEBAR_H, ACTBAR_W+SIDEBAR_W+1, H-STATUSBAR_H], fill=BORDER)

    # status bar
    draw_rect(d, [0, H-STATUSBAR_H, W, H], fill=STATUSBAR)

    return img, d

def draw_activity_icons(d, active_index=0):
    icons = ["⬡", "⎇", "🔍", "⚙", "🔌"]
    labels = ["Explorer", "Source Control", "Search", "Extensions", "KiCad"]
    for i, (ic, _) in enumerate(zip(icons, labels)):
        y = TITLEBAR_H + 8 + i * 48
        if i == active_index:
            draw_rect(d, [0, y-4, 2, y+36], fill=ACCENT)
            draw_rect(d, [0, y-4, ACTBAR_W, y+36], fill="#2a2d2e")
        draw_text(d, (ACTBAR_W//2, y+14), ic, _sans(16), TEXT if i != active_index else TEXT_BRIGHT, anchor="mm")

def draw_statusbar_items(d, items):
    x = 6
    for text, color in items:
        f = _sans(10)
        draw_text(d, (x, H-STATUSBAR_H+4), text, f, TEXT_BRIGHT)
        bbox = f.getbbox(text)
        x += bbox[2]-bbox[0] + 14
    # right side items
    rx = W - 6
    for text in ["UTF-8", "LF", "Python", "Ln 42, Col 8"]:
        f = _sans(10)
        bbox = f.getbbox(text)
        rx -= bbox[2]-bbox[0] + 14
        draw_text(d, (rx, H-STATUSBAR_H+4), text, f, TEXT_BRIGHT)

def draw_tabbar(d, tabs, active=0, x_start=None):
    if x_start is None:
        x_start = ACTBAR_W + SIDEBAR_W + 1
    x = x_start
    for i, (name, modified) in enumerate(tabs):
        f = _sans(11)
        bbox = f.getbbox(name)
        tw = bbox[2]-bbox[0] + 32
        bg = TAB_ACT if i == active else TAB_INACT
        draw_rect(d, [x, TITLEBAR_H, x+tw, TITLEBAR_H+TABBAR_H], fill=bg)
        if i == active:
            draw_rect(d, [x, TITLEBAR_H, x+tw, TITLEBAR_H+1], fill=ACCENT)
        draw_rect(d, [x+tw, TITLEBAR_H, x+tw+1, TITLEBAR_H+TABBAR_H], fill=BORDER)
        color = TEXT if i == active else TEXT_DIM
        dot = " ●" if modified else "  ✕"
        draw_text(d, (x+12, TITLEBAR_H+10), name + dot, f, color)
        x += tw
    # fill rest
    draw_rect(d, [x, TITLEBAR_H, W, TITLEBAR_H+TABBAR_H], fill=TAB_INACT)
    draw_rect(d, [x_start, TITLEBAR_H+TABBAR_H-1, W, TITLEBAR_H+TABBAR_H], fill=BORDER)

def draw_sidebar_header(d, title, x=ACTBAR_W+4, y=TITLEBAR_H+4):
    draw_text(d, (x, y), title.upper(), _sans(10, bold=True), TEXT_DIM)
    return y + 20

def draw_tree_item(d, x, y, icon, text, color=TEXT, indent=0, selected=False):
    f = _sans(11)
    if selected:
        draw_rect(d, [ACTBAR_W, y-1, ACTBAR_W+SIDEBAR_W, y+17], fill="#094771")
    draw_text(d, (x + indent*14, y), icon + "  " + text, f, color)
    return y + 18

# ── editor area helpers ───────────────────────────────────────────────────────
def editor_area():
    return (ACTBAR_W + SIDEBAR_W + 1, TITLEBAR_H + TABBAR_H, W, H - STATUSBAR_H)

def fill_editor(d, color=EDITOR_BG):
    x0, y0, x1, y1 = editor_area()
    draw_rect(d, [x0, y0, x1, y1], fill=color)

def draw_line_numbers(d, x, y, count=20, start=1):
    f = _font(11)
    for i in range(count):
        draw_text(d, (x, y + i*18), str(start+i).rjust(3), f, "#5a5a5a")

def draw_code_line(d, x, y, tokens):
    """tokens = [(text, color), ...]"""
    f = _font(11)
    cx = x
    for text, color in tokens:
        d.text((cx, y), text, font=f, fill=color)
        bbox = f.getbbox(text)
        cx += bbox[2]-bbox[0]

def draw_minimap(d):
    x1 = W - 1
    x0 = x1 - 60
    _, y0, _, y1 = editor_area()
    draw_rect(d, [x0, y0, x1, y1], fill="#1a1a2e")
    # tiny lines
    for i in range(40):
        lw = 20 + (i % 7) * 5
        lc = "#333355" if i % 3 else "#2a4a6a"
        draw_rect(d, [x0+4, y0+4+i*13, x0+4+lw, y0+8+i*13], fill=lc)

# ─────────────────────────────────────────────────────────────────────────────
#  1. SCHEMATIC VIEWER
# ─────────────────────────────────────────────────────────────────────────────
def make_schematic_viewer():
    img, d = make_base("arduino_uno.kicad_sch — KiCad Studio")
    draw_activity_icons(d, active_index=0)

    # sidebar: explorer tree
    y = draw_sidebar_header(d, "KICAD STUDIO EXPLORER")
    y = draw_tree_item(d, ACTBAR_W+8, y, "▼", "arduino_uno", TEXT_BRIGHT, indent=0)
    y = draw_tree_item(d, ACTBAR_W+8, y, "📄", "arduino_uno.kicad_sch", TEXT_CYAN, indent=1, selected=True)
    y = draw_tree_item(d, ACTBAR_W+8, y, "📋", "arduino_uno.kicad_pcb", TEXT, indent=1)
    y = draw_tree_item(d, ACTBAR_W+8, y, "⚙", "arduino_uno.kicad_pro", TEXT_DIM, indent=1)
    y = draw_tree_item(d, ACTBAR_W+8, y, "📂", "fp-lib-table", TEXT_DIM, indent=1)
    y += 6
    draw_rect(d, [ACTBAR_W+4, y, ACTBAR_W+SIDEBAR_W-4, y+1], fill=BORDER)
    y += 8
    y = draw_sidebar_header(d, "BILL OF MATERIALS", y=y)
    headers = [("Ref", 60), ("Value", 100), ("Qty", 30)]
    hx = ACTBAR_W + 8
    for hdr, w in headers:
        draw_text(d, (hx, y), hdr, _sans(10, bold=True), TEXT_DIM)
        hx += w
    y += 16
    bom_items = [
        ("C1,C2", "100nF", "2"),
        ("R1-R4", "10kΩ", "4"),
        ("U1", "ATmega328P", "1"),
        ("U2", "CH340G", "1"),
        ("J1", "USB-B", "1"),
        ("X1", "16MHz", "1"),
    ]
    for ref, val, qty in bom_items:
        hx = ACTBAR_W + 8
        draw_text(d, (hx, y),    ref,  _sans(10), TEXT_CYAN)
        draw_text(d, (hx+60, y), val,  _sans(10), TEXT)
        draw_text(d, (hx+160, y), qty, _sans(10), TEXT_DIM)
        y += 16

    # tabs
    draw_tabbar(d, [("arduino_uno.kicad_sch", False), ("arduino_uno.kicad_pcb", False)], active=0)

    # editor: schematic canvas
    ex, ey, ew, eh = editor_area()
    fill_editor(d, "#fafafa")

    # schematic background with grid
    grid = 20
    for gx in range(ex, ew, grid):
        draw_rect(d, [gx, ey, gx+1, eh], fill="#e8e8e8")
    for gy in range(ey, eh, grid):
        draw_rect(d, [ex, gy, ew, gy+1], fill="#e8e8e8")

    # draw a simple schematic circuit
    cx = (ex + ew) // 2
    cy = (ey + eh) // 2

    def wire(x1, y1, x2, y2):
        d.line([(x1, y1), (x2, y2)], fill="#006600", width=2)

    def component_box(x, y, w, h, label, ref, pins_l=None, pins_r=None):
        draw_rect(d, [x, y, x+w, y+h], outline="#000066", fill="#fffff0")
        d.text((x+w//2, y+h//2-8), label, font=_sans(10, bold=True), fill="#000066", anchor="mm")
        d.text((x+w//2, y+h//2+8), ref,   font=_sans(9),             fill="#cc0000", anchor="mm")
        if pins_l:
            for i, pname in enumerate(pins_l):
                py = y + 16 + i * 20
                wire(x-20, py, x, py)
                d.text((x-22, py-6), pname, font=_font(9), fill="#333333", anchor="rt")
        if pins_r:
            for i, pname in enumerate(pins_r):
                py = y + 16 + i * 20
                wire(x+w, py, x+w+20, py)
                d.text((x+w+22, py-6), pname, font=_font(9), fill="#333333")

    # ATmega328P
    component_box(cx-60, cy-80, 120, 160, "ATmega328P", "U1",
                  pins_l=["PC0","PC1","PC2","PC3","VCC","GND"],
                  pins_r=["PB0","PB1","PB2","PB3","PB4","PB5"])

    # Crystal
    component_box(cx+200, cy-30, 60, 40, "16MHz", "X1")
    wire(cx+60, cy-64, cx+200, cy-10)

    # Capacitors
    for i, ref in enumerate(["C1", "C2"]):
        draw_text(d, (cx+180+i*40, cy+40), ref, _sans(9), "#cc0000", anchor="mm")
        draw_rect(d, [cx+168+i*40, cy+45, cx+192+i*40, cy+47], fill="#000099")
        draw_rect(d, [cx+168+i*40, cy+50, cx+192+i*40, cy+52], fill="#000099")
        wire(cx+180+i*40, cy+52, cx+180+i*40, cy+70)
        draw_text(d, (cx+180+i*40, cy+78), "GND", _font(9), "#000000", anchor="mm")
        d.line([(cx+172+i*40, cy+76),(cx+188+i*40, cy+76)], fill="#000000", width=2)
        d.line([(cx+175+i*40, cy+79),(cx+185+i*40, cy+79)], fill="#000000", width=2)
        d.line([(cx+178+i*40, cy+82),(cx+182+i*40, cy+82)], fill="#000000", width=2)

    # Power symbols
    wire(cx-80, cy-64, cx-120, cy-64)
    draw_text(d, (cx-120, cy-72), "VCC", _font(10), "#cc0000")
    d.polygon([(cx-114,cy-60),(cx-120,cy-72),(cx-126,cy-60)], fill="#cc0000")

    wire(cx-80, cy+56, cx-120, cy+56)
    draw_text(d, (cx-120, cy+60), "GND", _font(10), "#000000")
    d.line([(cx-114,cy+64),(cx-126,cy+64)], fill="#000000", width=2)
    d.line([(cx-117,cy+67),(cx-123,cy+67)], fill="#000000", width=2)
    d.line([(cx-119,cy+70),(cx-121,cy+70)], fill="#000000", width=2)

    # USB connector block
    component_box(cx-280, cy-60, 80, 100, "USB-B", "J1",
                  pins_r=["D+","D-","VBUS","GND","Shield"])

    wire(cx-200, cy-44, cx-160, cy-44)
    wire(cx-200, cy-24, cx-160, cy-24)

    # ERC badge (no errors)
    draw_badge(d, (ex+8, ey+8), "ERC: 0 errors", SUCCESS)
    draw_badge(d, (ex+120, ey+8), "KiCad 10", ACCENT)

    # zoom controls
    for i, lbl in enumerate(["−", "+", "⊡"]):
        bx = ew - 36
        by = ey + 8 + i * 28
        draw_rect(d, [bx, by, bx+26, by+22], fill="#cccccc", outline="#999999", radius=3)
        draw_text(d, (bx+13, by+11), lbl, _sans(13), "#333333", anchor="mm")

    # minimap area (schematic thumbnail)
    draw_rect(d, [ew-100, eh-100, ew-4, eh-4], fill="#f0f0f0", outline="#cccccc")
    draw_rect(d, [ew-100, eh-100, ew-4, eh-4+1], fill="#cccccc")
    draw_text(d, (ew-52, eh-52), "⊠", _sans(24), "#999999", anchor="mm")

    draw_statusbar_items(d, [
        ("✔ KiCad Studio", TEXT_BRIGHT),
        ("⬡ kicad-mcp-pro 3.0.2", TEXT_BRIGHT),
        ("ERC: 0", TEXT_BRIGHT),
    ])

    img.save(os.path.join(OUT_DIR, "schematic-viewer.png"), dpi=(96,96))
    print("✓ schematic-viewer.png")

# ─────────────────────────────────────────────────────────────────────────────
#  2. PCB VIEWER
# ─────────────────────────────────────────────────────────────────────────────
def make_pcb_viewer():
    img, d = make_base("arduino_uno.kicad_pcb — KiCad Studio")
    draw_activity_icons(d, active_index=0)

    # sidebar: layer panel
    y = draw_sidebar_header(d, "PCB LAYERS")
    layers = [
        ("●", "F.Cu",       "#cc0000", True),
        ("●", "B.Cu",       "#0000cc", True),
        ("●", "F.Silkscreen","#00cccc", True),
        ("●", "B.Silkscreen","#cc00cc", False),
        ("●", "F.Mask",     "#cc6666", True),
        ("●", "B.Mask",     "#6666cc", False),
        ("●", "Edge.Cuts",  "#ffff00", True),
        ("●", "F.Courtyard","#ff00ff", False),
        ("●", "User.1",     "#888888", False),
    ]
    for dot, name, col, visible in layers:
        eye = "👁" if visible else "○"
        draw_text(d, (ACTBAR_W+8, y), dot, _sans(12), col)
        draw_text(d, (ACTBAR_W+22, y), name, _sans(11), TEXT if visible else TEXT_DIM)
        draw_text(d, (ACTBAR_W+SIDEBAR_W-20, y), eye, _sans(11), TEXT_DIM)
        y += 18
    y += 4
    draw_rect(d, [ACTBAR_W+4, y, ACTBAR_W+SIDEBAR_W-4, y+1], fill=BORDER)
    y += 8
    y = draw_sidebar_header(d, "DESIGN RULES", y=y)
    dru_items = [
        ("Min track width",  "0.2 mm",  SUCCESS),
        ("Min via drill",    "0.3 mm",  SUCCESS),
        ("Min clearance",    "0.15 mm", SUCCESS),
        ("Board area",       "68×53 mm",ACCENT),
    ]
    for lbl, val, col in dru_items:
        draw_text(d, (ACTBAR_W+8, y),  lbl, _sans(10), TEXT_DIM)
        draw_text(d, (ACTBAR_W+160, y), val, _sans(10), col)
        y += 16

    # tabs
    draw_tabbar(d, [("arduino_uno.kicad_sch", False), ("arduino_uno.kicad_pcb", False)], active=1)

    # editor: PCB canvas (dark background)
    ex, ey, ew, eh = editor_area()
    fill_editor(d, "#1a1a1a")

    # PCB board outline (Arduino Uno shape)
    bx0 = ex + 100
    by0 = ey + 60
    bx1 = bx0 + 520
    by1 = by0 + 380

    # Board silhouette
    draw_rect(d, [bx0, by0, bx1, by1], fill="#0d2d0d", outline="#ffff00", width=2)

    # Copper pours (red = F.Cu zone)
    draw_rect(d, [bx0+10, by0+10, bx1-10, by0+120], fill="#3d0000")
    draw_rect(d, [bx0+10, by1-80, bx1-10, by1-10],  fill="#00003d")

    # Traces F.Cu
    for i in range(6):
        x_tr = bx0 + 60 + i * 70
        d.line([(x_tr, by0+30),(x_tr, by1-30)], fill="#cc3333", width=2)
    for i in range(4):
        y_tr = by0 + 80 + i * 70
        d.line([(bx0+30, y_tr),(bx1-30, y_tr)], fill="#cc3333", width=2)

    # Traces B.Cu
    for i in range(3):
        x_tr = bx0 + 100 + i * 110
        d.line([(x_tr, by0+50),(x_tr, by1-50)], fill="#3333cc", width=2)

    # Vias
    via_positions = [(bx0+130,by0+120),(bx0+260,by0+180),(bx0+390,by0+120),
                     (bx0+200,by1-140),(bx0+350,by1-140)]
    for vx, vy in via_positions:
        d.ellipse([vx-6,vy-6,vx+6,vy+6], fill="#888888", outline="#ffffff", width=1)
        d.ellipse([vx-2,vy-2,vx+2,vy+2], fill="#1a1a1a")

    # Components (footprint courtyard boxes)
    components = [
        (bx0+160, by0+140, 80, 100, "U1\nATmega328P", "#00cccc"),
        (bx0+300, by0+60,  60, 40,  "U2\nCH340G",     "#00cccc"),
        (bx0+420, by0+100, 40, 60,  "J1\nUSB",        "#00cc00"),
        (bx0+60,  by0+200, 30, 15,  "C1",             "#00cccc"),
        (bx0+100, by0+200, 30, 15,  "C2",             "#00cccc"),
        (bx0+60,  by0+230, 30, 15,  "R1",             "#00cccc"),
        (bx0+100, by0+230, 30, 15,  "R2",             "#00cccc"),
        (bx0+300, by0+160, 50, 20,  "X1\n16MHz",      "#cccc00"),
    ]
    for cx, cy, cw, ch, label, col in components:
        draw_rect(d, [cx, cy, cx+cw, cy+ch], outline=col, fill="#0d200d")
        lines = label.split("\n")
        for li, ln in enumerate(lines):
            d.text((cx+cw//2, cy+ch//2-4+li*10), ln, font=_sans(8), fill=col, anchor="mm")

    # Pin headers along edge
    for i in range(14):
        px = bx0 + 10
        py = by0 + 40 + i*22
        d.ellipse([px-4, py-4, px+4, py+4], fill="#888888", outline="#cccc00", width=1)
    for i in range(6):
        px = bx0 + 10
        py = by0 + 350 + i*5
        d.ellipse([px-4, py-4, px+4, py+4], fill="#888888", outline="#cccc00", width=1)

    # Silkscreen labels
    d.text((bx0+160, by0+20), "ARDUINO UNO R3", font=_sans(10, bold=True), fill="#00cccc")
    d.text((bx0+20,  by0+20), "REV3",           font=_sans(9),             fill="#00cccc")

    # DRC badge
    draw_badge(d, (ex+8, ey+8), "DRC: 0 errors", SUCCESS)
    draw_badge(d, (ex+120, ey+8), "F.Cu active", "#cc3333")
    draw_badge(d, (ex+220, ey+8), "68 × 53 mm", ACCENT)

    # Zoom controls
    for i, lbl in enumerate(["−", "+", "⊡", "⊞"]):
        bx = ew - 36
        by = ey + 8 + i * 28
        draw_rect(d, [bx, by, bx+26, by+22], fill="#2a2a2a", outline="#555555", radius=3)
        draw_text(d, (bx+13, by+11), lbl, _sans(13), TEXT, anchor="mm")

    draw_statusbar_items(d, [
        ("✔ KiCad Studio", TEXT_BRIGHT),
        ("⬡ kicad-mcp-pro 3.0.2", TEXT_BRIGHT),
        ("DRC: 0", TEXT_BRIGHT),
        ("68×53 mm", TEXT_BRIGHT),
    ])

    img.save(os.path.join(OUT_DIR, "pcb-viewer.png"), dpi=(96,96))
    print("✓ pcb-viewer.png")

# ─────────────────────────────────────────────────────────────────────────────
#  3. DRC RESULTS
# ─────────────────────────────────────────────────────────────────────────────
def make_drc_results():
    img, d = make_base("DRC Results — KiCad Studio")
    draw_activity_icons(d, active_index=0)

    # sidebar: project tree
    y = draw_sidebar_header(d, "KICAD STUDIO EXPLORER")
    y = draw_tree_item(d, ACTBAR_W+8, y, "▼", "arduino_uno",       TEXT_BRIGHT, indent=0)
    y = draw_tree_item(d, ACTBAR_W+8, y, "📄", "arduino_uno.kicad_sch", TEXT, indent=1)
    y = draw_tree_item(d, ACTBAR_W+8, y, "📋", "arduino_uno.kicad_pcb", TEXT_CYAN, indent=1, selected=True)
    y = draw_tree_item(d, ACTBAR_W+8, y, "⚙",  "arduino_uno.kicad_pro",TEXT_DIM, indent=1)
    y += 10
    y = draw_sidebar_header(d, "DRC SUMMARY", y=y)
    draw_text(d, (ACTBAR_W+8, y),    "Errors:",   _sans(10), TEXT_DIM)
    draw_text(d, (ACTBAR_W+120, y),  "3",         _sans(10, bold=True), ERROR)
    y += 16
    draw_text(d, (ACTBAR_W+8, y),    "Warnings:", _sans(10), TEXT_DIM)
    draw_text(d, (ACTBAR_W+120, y),  "5",         _sans(10, bold=True), WARN)
    y += 16
    draw_text(d, (ACTBAR_W+8, y),    "Unconnected:", _sans(10), TEXT_DIM)
    draw_text(d, (ACTBAR_W+120, y),  "0",         _sans(10, bold=True), SUCCESS)
    y += 20
    draw_rect(d, [ACTBAR_W+4, y, ACTBAR_W+SIDEBAR_W-4, y+1], fill=BORDER)
    y += 8
    y = draw_sidebar_header(d, "QUICK ACTIONS", y=y)
    btns = ["▶ Run DRC Again", "📋 Export Report", "🔍 Jump to Error"]
    for btn in btns:
        draw_rect(d, [ACTBAR_W+8, y, ACTBAR_W+SIDEBAR_W-8, y+22], fill=ACCENT, radius=3)
        draw_text(d, (ACTBAR_W+14, y+4), btn, _sans(10), TEXT_BRIGHT)
        y += 28

    # tabs
    draw_tabbar(d, [("arduino_uno.kicad_pcb", False), ("DRC Results", False)], active=1)

    # editor: problems / DRC panel
    ex, ey, ew, eh = editor_area()
    fill_editor(d)

    # panel tabs at top
    panel_tabs = ["PROBLEMS", "OUTPUT", "TERMINAL", "DEBUG CONSOLE"]
    tx = ex + 8
    for i, pt in enumerate(panel_tabs):
        color = TEXT_BRIGHT if i == 0 else TEXT_DIM
        draw_text(d, (tx, ey+8), pt, _sans(10, bold=(i==0)), color)
        bbox = _sans(10).getbbox(pt)
        if i == 0:
            draw_rect(d, [tx, ey+TABBAR_H-4, tx+bbox[2]-bbox[0], ey+TABBAR_H-2], fill=ACCENT)
        tx += bbox[2]-bbox[0] + 24
    draw_rect(d, [ex, ey+TABBAR_H, ew, ey+TABBAR_H+1], fill=BORDER)

    py = ey + TABBAR_H + 8

    # filter bar
    draw_rect(d, [ex+8, py, ex+300, py+22], fill="#3c3c3c", radius=3)
    draw_text(d, (ex+14, py+4), "🔍  Filter (e.g. text, !exclude)", _sans(10), TEXT_DIM)
    draw_text(d, (ex+310, py+4), "3 Errors  5 Warnings", _sans(10), TEXT_DIM)
    py += 30

    # DRC errors
    drc_items = [
        (ERROR, "error",   "Clearance violation: track too close to via",      "arduino_uno.kicad_pcb", "line 2847"),
        (ERROR, "error",   "Silkscreen clipped by solder mask",                "arduino_uno.kicad_pcb", "line 3102"),
        (ERROR, "error",   "Footprint courtyard overlap: U1 vs C3",            "arduino_uno.kicad_pcb", "line 4215"),
        (WARN,  "warning", "Track width below recommended minimum (0.18 mm)",  "arduino_uno.kicad_pcb", "line 1988"),
        (WARN,  "warning", "Via drill size below fab minimum (0.25 mm)",       "arduino_uno.kicad_pcb", "line 2101"),
        (WARN,  "warning", "Missing 3D model for footprint: R3",               "arduino_uno.kicad_pcb", "line 5233"),
        (WARN,  "warning", "Pad not connected to any net: J1 pin 5",           "arduino_uno.kicad_pcb", "line 3987"),
        (WARN,  "warning", "Reference designator overlap: C1 / C2",            "arduino_uno.kicad_pcb", "line 4512"),
    ]

    for col, severity, msg, fname, loc in drc_items:
        icon = "⊗" if severity == "error" else "⚠"
        draw_rect(d, [ex, py-1, ew, py+17], fill=LINE_HL if (drc_items.index((col,severity,msg,fname,loc))%2)==0 else EDITOR_BG)
        draw_text(d, (ex+12, py), icon, _sans(12), col)
        draw_text(d, (ex+30, py), msg, _sans(11), TEXT)
        draw_text(d, (ew-300, py), fname, _sans(10), TEXT_DIM)
        draw_text(d, (ew-120, py), loc,   _sans(10), TEXT_BLUE)
        py += 22

    # scrollbar
    draw_rect(d, [ew-8, ey+TABBAR_H, ew, eh], fill=SCROLLBAR)
    draw_rect(d, [ew-8, ey+TABBAR_H+20, ew, ey+TABBAR_H+80], fill="#666666", radius=2)

    draw_statusbar_items(d, [
        ("✔ KiCad Studio", TEXT_BRIGHT),
        ("⬡ kicad-mcp-pro 3.0.2", TEXT_BRIGHT),
        ("⊗ 3  ⚠ 5", TEXT_BRIGHT),
    ])

    img.save(os.path.join(OUT_DIR, "drc-results.png"), dpi=(96,96))
    print("✓ drc-results.png")

# ─────────────────────────────────────────────────────────────────────────────
#  4. BOM TABLE
# ─────────────────────────────────────────────────────────────────────────────
def make_bom_table():
    img, d = make_base("BOM — arduino_uno — KiCad Studio")
    draw_activity_icons(d, active_index=0)

    # sidebar
    y = draw_sidebar_header(d, "KICAD STUDIO EXPLORER")
    y = draw_tree_item(d, ACTBAR_W+8, y, "▼", "arduino_uno", TEXT_BRIGHT)
    y = draw_tree_item(d, ACTBAR_W+8, y, "📄", "arduino_uno.kicad_sch", TEXT, indent=1)
    y = draw_tree_item(d, ACTBAR_W+8, y, "📋", "arduino_uno.kicad_pcb", TEXT, indent=1)
    y += 10
    y = draw_sidebar_header(d, "VARIANTS", y=y)
    variants = [("Default",  True), ("Production", False), ("Dev-Debug", False)]
    for vname, active in variants:
        icon = "◉" if active else "○"
        col  = ACCENT if active else TEXT_DIM
        draw_text(d, (ACTBAR_W+8, y), icon + "  " + vname, _sans(11), col)
        y += 18
    y += 8
    draw_rect(d, [ACTBAR_W+4, y, ACTBAR_W+SIDEBAR_W-4, y+1], fill=BORDER)
    y += 8
    y = draw_sidebar_header(d, "EXPORT", y=y)
    for fmt in ["CSV", "JSON", "XLSX", "IPC-2581"]:
        draw_rect(d, [ACTBAR_W+8, y, ACTBAR_W+SIDEBAR_W-8, y+22], fill="#3c3c3c", radius=3)
        draw_text(d, (ACTBAR_W+14, y+4), "↓  Export " + fmt, _sans(10), TEXT)
        y += 28

    # tabs
    draw_tabbar(d, [("BOM — Default", False), ("BOM — Production", False)], active=0)

    # editor: BOM webview
    ex, ey, ew, eh = editor_area()
    fill_editor(d, "#1e1e2e")

    # Toolbar
    draw_rect(d, [ex, ey, ew, ey+36], fill="#252540")
    draw_text(d, (ex+12, ey+10), "Bill of Materials — Default variant", _sans(12, bold=True), TEXT_BRIGHT)
    draw_text(d, (ex+12, ey+10), "Bill of Materials — Default variant", _sans(12, bold=True), TEXT_BRIGHT)
    for i, lbl in enumerate(["Group by Value", "Show DNP", "Highlight Mismatches"]):
        bx = ew - 360 + i * 120
        bg = ACCENT if i == 0 else "#3c3c3c"
        draw_rect(d, [bx, ey+6, bx+110, ey+28], fill=bg, radius=3)
        draw_text(d, (bx+55, ey+17), lbl, _sans(9), TEXT_BRIGHT, anchor="mm")

    # Table header
    col_widths = [60, 60, 180, 80, 120, 80, 80, 80]
    col_names  = ["#", "Qty", "References", "Value", "Footprint", "LCSC", "Stock", "Price"]
    draw_rect(d, [ex, ey+36, ew, ey+58], fill="#1a1a3a")
    hx = ex + 4
    for cn, cw in zip(col_names, col_widths):
        draw_text(d, (hx+cw//2, ey+45), cn, _sans(10, bold=True), TEXT_DIM, anchor="mm")
        hx += cw

    bom = [
        ("1",  "2",  "C1, C2",       "100nF",      "C_0402",          "C14663",  "✔ 4821", "$0.02"),
        ("2",  "3",  "C3, C4, C5",   "10µF",       "C_0805",          "C15850",  "✔ 1203", "$0.08"),
        ("3",  "4",  "R1-R4",        "10kΩ",       "R_0402",          "C25804",  "✔ 9900", "$0.01"),
        ("4",  "1",  "U1",           "ATmega328P", "QFP-32_7x7mm",    "C14877",  "✔  320", "$3.20"),
        ("5",  "1",  "U2",           "CH340G",     "SOP-16_3.9x9.9mm","C14969",  "✔  850", "$0.58"),
        ("6",  "1",  "J1",           "USB-B",      "USB_B_THT",       "C46398",  "✔  200", "$0.45"),
        ("7",  "1",  "X1",           "16MHz",      "Crystal_SMD_3225","C13738",  "✔ 2100", "$0.25"),
        ("8",  "1",  "D1",           "LED_Green",  "LED_0603",        "C72043",  "✔ 5000", "$0.03"),
        ("9",  "3",  "J2-J4",        "Conn_1x08",  "PinHeader_2.54mm","C124375", "✔  450", "$0.12"),
    ]
    row_y = ey + 58
    for ri, row in enumerate(bom):
        bg = "#252538" if ri % 2 == 0 else "#1e1e2e"
        draw_rect(d, [ex, row_y, ew, row_y+22], fill=bg)
        rx = ex + 4
        colors = [TEXT_DIM, TEXT_BRIGHT, TEXT_CYAN, TEXT, TEXT_DIM, TEXT_BLUE, SUCCESS, TEXT_GREEN]
        for val, cw, col in zip(row, col_widths, colors):
            draw_text(d, (rx+cw//2, row_y+5), val, _sans(10), col, anchor="mt")
            rx += cw
        row_y += 22

    # Totals row
    draw_rect(d, [ex, row_y, ew, row_y+26], fill="#1a1a3a")
    draw_text(d, (ex+12, row_y+6), "Total: 18 components  |  Estimated cost: $4.74 / board", _sans(10, bold=True), TEXT_BRIGHT)

    draw_statusbar_items(d, [
        ("✔ KiCad Studio", TEXT_BRIGHT),
        ("⬡ kicad-mcp-pro 3.0.2", TEXT_BRIGHT),
        ("18 components", TEXT_BRIGHT),
    ])

    img.save(os.path.join(OUT_DIR, "bom-table.png"), dpi=(96,96))
    print("✓ bom-table.png")

# ─────────────────────────────────────────────────────────────────────────────
#  5. COMPONENT SEARCH
# ─────────────────────────────────────────────────────────────────────────────
def make_component_search():
    img, d = make_base("Component Search — KiCad Studio")
    draw_activity_icons(d, active_index=3)

    # sidebar: search filters
    y = draw_sidebar_header(d, "COMPONENT SEARCH")
    draw_rect(d, [ACTBAR_W+8, y, ACTBAR_W+SIDEBAR_W-8, y+26], fill="#3c3c3c", radius=4)
    draw_text(d, (ACTBAR_W+14, y+6), "🔍  ATmega328P", _sans(11), TEXT_BRIGHT)
    y += 34
    y = draw_sidebar_header(d, "FILTERS", y=y)
    filters = [
        ("Source",  ["LCSC", "Octopart", "Local Libs"]),
        ("Package", ["QFP", "DIP", "BGA", "SMD"]),
        ("Stock",   ["In Stock Only"]),
    ]
    for fname, opts in filters:
        draw_text(d, (ACTBAR_W+8, y), fname, _sans(10, bold=True), TEXT_DIM)
        y += 16
        for opt in opts:
            draw_rect(d, [ACTBAR_W+8, y, ACTBAR_W+18, y+10], fill=ACCENT if opt in ["LCSC","In Stock Only"] else "#3c3c3c", radius=2)
            draw_text(d, (ACTBAR_W+22, y), opt, _sans(10), TEXT)
            y += 16
        y += 4

    # tabs
    draw_tabbar(d, [("Component Search", False)], active=0)

    # editor: search results
    ex, ey, ew, eh = editor_area()
    fill_editor(d, "#1e1e2e")

    # Search bar
    draw_rect(d, [ex+8, ey+8, ew-8, ey+38], fill="#3c3c3c", radius=4)
    draw_text(d, (ex+18, ey+16), "🔍  ATmega328P", _sans(13), TEXT_BRIGHT)
    draw_text(d, (ew-80, ey+16), "Search", _sans(11), TEXT_DIM)
    draw_rect(d, [ew-90, ey+12, ew-10, ey+34], fill=ACCENT, radius=3)
    draw_text(d, (ew-50, ey+23), "Search", _sans(10), TEXT_BRIGHT, anchor="mm")

    # Results header
    draw_rect(d, [ex+8, ey+46, ew-8, ey+66], fill="#252540")
    cols = [("Part Number", 200), ("Manufacturer", 160), ("Description", 260), ("Package", 100), ("Price", 80), ("Stock", 80)]
    hx = ex + 12
    for cn, cw in cols:
        draw_text(d, (hx, ey+54), cn, _sans(10, bold=True), TEXT_DIM)
        hx += cw

    results = [
        ("ATmega328P-AU",    "Microchip", "8-bit AVR MCU, 32KB Flash, 2KB RAM", "TQFP-32",  "$3.20", "✔ 320"),
        ("ATmega328P-PU",    "Microchip", "8-bit AVR MCU, DIP-28, 5V",          "DIP-28",   "$4.50", "✔  85"),
        ("ATmega328P-MU",    "Microchip", "8-bit AVR MCU, MLF-32 pkg",           "QFN-32",   "$3.10", "⚠  12"),
        ("ATmega328PB-AU",   "Microchip", "8-bit AVR MCU, enhanced, TQFP-32",   "TQFP-32",  "$3.45", "✔ 150"),
        ("ATmega328-AU",     "Microchip", "8-bit AVR MCU (non-P variant)",       "TQFP-32",  "$2.90", "✔ 480"),
    ]
    row_y = ey + 66
    for ri, (pn, mfr, desc, pkg, price, stock) in enumerate(results):
        bg = "#252538" if ri % 2 == 0 else "#1e1e2e"
        sel = ri == 0
        if sel:
            bg = "#094771"
        draw_rect(d, [ex+8, row_y, ew-8, row_y+26], fill=bg, radius=2 if sel else 0)
        rx = ex + 12
        vals = [pn, mfr, desc, pkg, price, stock]
        clrs = [TEXT_CYAN, TEXT, TEXT_DIM, TEXT_ORANGE, TEXT_GREEN, SUCCESS if "✔" in stock else WARN]
        for val, cw, col in zip(vals, [c[1] for c in cols], clrs):
            draw_text(d, (rx, row_y+7), val, _sans(10), col)
            rx += cw
        row_y += 26

    # Detail panel for selected component
    detail_y = row_y + 10
    draw_rect(d, [ex+8, detail_y, ew-8, eh-8], fill="#252540", radius=4)
    draw_text(d, (ex+18, detail_y+8),  "ATmega328P-AU", _sans(13, bold=True), TEXT_CYAN)
    draw_text(d, (ex+18, detail_y+28), "Microchip Technology | LCSC: C14877", _sans(10), TEXT_DIM)
    detail_fields = [
        ("Package",     "TQFP-32 (7×7mm, 0.8mm pitch)"),
        ("Supply",      "1.8V – 5.5V"),
        ("Flash",       "32 KB"),
        ("SRAM",        "2 KB"),
        ("EEPROM",      "1 KB"),
        ("Max Freq",    "20 MHz @ 5V"),
        ("Price (100+)","$2.80 ea"),
        ("LCSC Stock",  "320 units"),
    ]
    dx = ex + 18
    dy = detail_y + 48
    for lbl, val in detail_fields:
        draw_text(d, (dx, dy),      lbl+":", _sans(10), TEXT_DIM)
        draw_text(d, (dx+130, dy),  val,     _sans(10), TEXT)
        dy += 18

    draw_rect(d, [ew-200, detail_y+8, ew-16, detail_y+32], fill=ACCENT, radius=3)
    draw_text(d, (ew-108, detail_y+20), "Add to Schematic", _sans(10), TEXT_BRIGHT, anchor="mm")
    draw_rect(d, [ew-200, detail_y+40, ew-16, detail_y+64], fill="#3c3c3c", radius=3)
    draw_text(d, (ew-108, detail_y+52), "Copy Footprint ID", _sans(10), TEXT, anchor="mm")

    draw_statusbar_items(d, [
        ("✔ KiCad Studio", TEXT_BRIGHT),
        ("⬡ kicad-mcp-pro 3.0.2", TEXT_BRIGHT),
        ("5 results", TEXT_BRIGHT),
    ])

    img.save(os.path.join(OUT_DIR, "component-search.png"), dpi=(96,96))
    print("✓ component-search.png")

# ─────────────────────────────────────────────────────────────────────────────
#  6. GIT DIFF
# ─────────────────────────────────────────────────────────────────────────────
def make_git_diff():
    img, d = make_base("arduino_uno.kicad_sch ↔ HEAD — KiCad Studio")
    draw_activity_icons(d, active_index=1)

    # sidebar: source control
    y = draw_sidebar_header(d, "SOURCE CONTROL")
    draw_rect(d, [ACTBAR_W+8, y, ACTBAR_W+SIDEBAR_W-8, y+26], fill=ACCENT, radius=3)
    draw_text(d, (ACTBAR_W+14, y+6), "↑ Commit (3 changes)", _sans(10), TEXT_BRIGHT)
    y += 34
    y = draw_sidebar_header(d, "CHANGES", y=y)
    changes = [
        ("M", "arduino_uno.kicad_sch", WARN),
        ("M", "arduino_uno.kicad_pcb", WARN),
        ("A", "docs/rev3_changes.md",  SUCCESS),
    ]
    for status, fname, col in changes:
        draw_rect(d, [ACTBAR_W+8, y, ACTBAR_W+16, y+14], fill=col, radius=2)
        draw_text(d, (ACTBAR_W+12, y), status, _sans(8), TEXT_BRIGHT, anchor="mm")
        draw_text(d, (ACTBAR_W+22, y), fname, _sans(10), TEXT)
        y += 18
    y += 8
    draw_rect(d, [ACTBAR_W+4, y, ACTBAR_W+SIDEBAR_W-4, y+1], fill=BORDER)
    y += 8
    y = draw_sidebar_header(d, "COMMIT MESSAGE", y=y)
    draw_rect(d, [ACTBAR_W+8, y, ACTBAR_W+SIDEBAR_W-8, y+54], fill="#3c3c3c", radius=3)
    draw_text(d, (ACTBAR_W+12, y+6),  "fix: correct R3 footprint to", _sans(10), TEXT)
    draw_text(d, (ACTBAR_W+12, y+22), "standard 0402 package", _sans(10), TEXT)
    draw_text(d, (ACTBAR_W+12, y+40), "REFS: #42", _sans(10), TEXT_DIM)
    y += 62
    y = draw_sidebar_header(d, "BRANCH", y=y)
    draw_text(d, (ACTBAR_W+8, y), "⎇  feat/r3-footprint-fix", _sans(10), TEXT_CYAN)

    # tabs
    draw_tabbar(d, [("arduino_uno.kicad_sch ↔ HEAD", False)], active=0)

    # editor: diff view
    ex, ey, ew, eh = editor_area()
    mid = (ex + ew) // 2

    fill_editor(d)

    # diff header
    draw_rect(d, [ex, ey, ew, ey+24], fill="#252526")
    draw_text(d, (ex+12, ey+6), "arduino_uno.kicad_sch", _sans(11), TEXT_DIM)
    draw_text(d, (ex+280, ey+6), "↔", _sans(11), TEXT_DIM)
    draw_text(d, (ex+310, ey+6), "HEAD~1 (schematic before R3 change)", _sans(11), TEXT_DIM)
    draw_rect(d, [ex, ey+24, ew, ey+25], fill=BORDER)
    draw_rect(d, [mid, ey, mid+1, eh], fill=BORDER)

    # line numbers + code
    ln_w = 40
    code_x_l = ex + ln_w + 4
    code_x_r = mid + ln_w + 4

    diff_lines = [
        (None, "  (kicad_sch (version 20231120)", "  (kicad_sch (version 20231120)"),
        (None, "  ...",                            "  ..."),
        ("del","  (symbol (lib_id \"R:R\"))",      None),
        ("add",None,                               "  (symbol (lib_id \"Device:R\"))"),
        (None, "    (at 120.65 87.63)",            "    (at 120.65 87.63)"),
        (None, "    (unit 1)",                     "    (unit 1)"),
        ("del","    (footprint \"R_THT:R_Axial\")",None),
        ("add",None,                               "    (footprint \"R_SMD:R_0402\")"),
        (None, "    (property \"Reference\" \"R3\"","    (property \"Reference\" \"R3\""),
        (None, "      (at 120.65 85.73))",         "      (at 120.65 85.73))"),
        (None, "    (property \"Value\" \"10k\")",  "    (property \"Value\" \"10k\")"),
        (None, "    (pin 1 (net 15))",             "    (pin 1 (net 15))"),
        (None, "    (pin 2 (net 0))",              "    (pin 2 (net 0))"),
        (None, "  )",                              "  )"),
        (None, "  ...",                            "  ..."),
    ]

    lnum_l = 42
    lnum_r = 42
    for row_idx, (kind, left, right) in enumerate(diff_lines):
        ry = ey + 28 + row_idx * 20

        # left side
        if kind == "del":
            draw_rect(d, [ex, ry, mid, ry+20], fill="#3d1515")
        elif kind is None:
            draw_rect(d, [ex, ry, mid, ry+20], fill=EDITOR_BG if row_idx%2==0 else LINE_HL)
        if left:
            draw_text(d, (ex+4, ry+3), str(lnum_l).rjust(3), _font(10), "#5a5a5a")
            col = "#f44747" if kind=="del" else TEXT
            draw_text(d, (code_x_l, ry+3), left, _font(10), col)
            lnum_l += 1

        # right side
        if kind == "add":
            draw_rect(d, [mid+1, ry, ew, ry+20], fill="#153d15")
        elif kind is None:
            draw_rect(d, [mid+1, ry, ew, ry+20], fill=EDITOR_BG if row_idx%2==0 else LINE_HL)
        if right:
            draw_text(d, (mid+4, ry+3), str(lnum_r).rjust(3), _font(10), "#5a5a5a")
            col = "#4ec9b0" if kind=="add" else TEXT
            draw_text(d, (code_x_r, ry+3), right, _font(10), col)
            lnum_r += 1

    # diff summary
    sby = eh - 30
    draw_rect(d, [ex, sby, ew, eh-STATUSBAR_H+STATUSBAR_H], fill="#1a2a1a")
    draw_text(d, (ex+12, sby+8), "+2 lines  −2 lines  |  Footprint updated: R_THT:R_Axial → R_SMD:R_0402", _sans(10), TEXT_DIM)

    draw_statusbar_items(d, [
        ("⎇ feat/r3-footprint-fix", TEXT_BRIGHT),
        ("✔ KiCad Studio", TEXT_BRIGHT),
        ("3 changes", TEXT_BRIGHT),
    ])

    img.save(os.path.join(OUT_DIR, "git-diff.png"), dpi=(96,96))
    print("✓ git-diff.png")

# ─────────────────────────────────────────────────────────────────────────────
#  7. AI ASSISTANT
# ─────────────────────────────────────────────────────────────────────────────
def make_ai_assistant():
    img, d = make_base("AI Chat — KiCad Studio")
    draw_activity_icons(d, active_index=4)

    # sidebar
    y = draw_sidebar_header(d, "AI ASSISTANT")
    draw_text(d, (ACTBAR_W+8, y), "Provider:", _sans(10), TEXT_DIM)
    draw_badge(d, (ACTBAR_W+80, y), "Claude 3.5 Sonnet", "#7c3aed", pad=4)
    y += 22
    draw_rect(d, [ACTBAR_W+4, y, ACTBAR_W+SIDEBAR_W-4, y+1], fill=BORDER)
    y += 8
    y = draw_sidebar_header(d, "CONTEXT", y=y)
    ctx_items = [
        ("📄", "arduino_uno.kicad_sch", True),
        ("📋", "arduino_uno.kicad_pcb", True),
        ("⊗", "DRC: 3 errors",          True),
        ("⚑", "Variant: Default",       True),
    ]
    for icon, lbl, on in ctx_items:
        col = TEXT_GREEN if on else TEXT_DIM
        draw_text(d, (ACTBAR_W+8, y), icon + "  " + lbl, _sans(10), col)
        y += 16
    y += 8
    draw_rect(d, [ACTBAR_W+4, y, ACTBAR_W+SIDEBAR_W-4, y+1], fill=BORDER)
    y += 8
    y = draw_sidebar_header(d, "TOOLS ENABLED", y=y)
    tools = ["run_drc", "export_gerber", "open_file", "search_component", "read_context", "switch_variant"]
    for t in tools:
        draw_text(d, (ACTBAR_W+8, y), "✔  " + t, _sans(9), TEXT_DIM)
        y += 14

    # tabs
    draw_tabbar(d, [("AI Chat", False)], active=0)

    # editor: chat UI
    ex, ey, ew, eh = editor_area()
    fill_editor(d, "#1a1a2e")

    # Chat history area
    chat_h = eh - ey - 80
    draw_rect(d, [ex, ey, ew, ey+chat_h], fill="#1a1a2e")

    messages = [
        ("user", "What are the DRC errors in my board and how can I fix them?"),
        ("assistant",
         "I found 3 DRC errors in arduino_uno.kicad_pcb:\n\n"
         "1. Clearance violation (line 2847) — Track too close to via near U1 pin 3.\n"
         "   Fix: Increase clearance to ≥0.15 mm or re-route the track.\n\n"
         "2. Silkscreen clipped by solder mask (line 3102) — C3 reference overlaps mask.\n"
         "   Fix: Move the C3 reference designator 0.5 mm up.\n\n"
         "3. Courtyard overlap: U1 vs C3 (line 4215) — Footprints overlap by 0.3 mm.\n"
         "   Fix: Move C3 1 mm to the right.\n\n"
         "Would you like me to generate a fix script or jump to each error location?"),
        ("user", "Yes, jump to the clearance violation."),
        ("assistant", "Opening arduino_uno.kicad_pcb at line 2847 — clearance violation near U1 pin 3."),
    ]

    my = ey + 8
    for role, text in messages:
        is_user = role == "user"
        bg = "#252550" if is_user else "#1e2e1e"
        icon = "👤" if is_user else "✦"
        name = "You" if is_user else "Claude 3.5 Sonnet"
        name_col = TEXT_CYAN if is_user else TEXT_GREEN

        lines = text.split("\n")
        line_h = 16
        box_h = 28 + len(lines) * line_h
        box_h = min(box_h, chat_h - my - 4)

        draw_rect(d, [ex+8, my, ew-8, my+box_h], fill=bg, radius=6)
        draw_text(d, (ex+18, my+8), icon + "  " + name, _sans(10, bold=True), name_col)
        ty = my + 24
        for line in lines:
            if ty + line_h > my + box_h - 4:
                break
            draw_text(d, (ex+18, ty), line, _sans(10), TEXT if not is_user else TEXT_BRIGHT)
            ty += line_h
        my += box_h + 8

    # Input area
    input_y = eh - 72
    draw_rect(d, [ex, input_y-4, ew, eh-STATUSBAR_H+STATUSBAR_H], fill="#12122a")
    draw_rect(d, [ex+8, input_y, ew-8, input_y+44], fill="#252540", radius=6)
    draw_text(d, (ex+18, input_y+14), "Ask KiCad Studio AI…  (⇧↵ for new line)", _sans(11), TEXT_DIM)
    # send button
    draw_rect(d, [ew-52, input_y+8, ew-14, input_y+36], fill=ACCENT, radius=4)
    draw_text(d, (ew-33, input_y+22), "↑", _sans(14), TEXT_BRIGHT, anchor="mm")

    draw_statusbar_items(d, [
        ("✔ KiCad Studio", TEXT_BRIGHT),
        ("✦ Claude 3.5 Sonnet", "#7c3aed"),
        ("Context: sch+pcb+drc", TEXT_BRIGHT),
    ])

    img.save(os.path.join(OUT_DIR, "ai-assistant.png"), dpi=(96,96))
    print("✓ ai-assistant.png")

# ─────────────────────────────────────────────────────────────────────────────
#  8. QUALITY GATES
# ─────────────────────────────────────────────────────────────────────────────
def make_quality_gates():
    img, d = make_base("Quality Gates — KiCad Studio")
    draw_activity_icons(d, active_index=4)

    # sidebar: gate summary
    y = draw_sidebar_header(d, "QUALITY GATES")
    gates = [
        ("Project",       SUCCESS, "PASS"),
        ("Placement",     WARN,    "WARN"),
        ("Transfer",      SUCCESS, "PASS"),
        ("Manufacturing", ERROR,   "FAIL"),
    ]
    for gname, col, status in gates:
        bx = ACTBAR_W + 8
        draw_rect(d, [bx, y, bx+12, y+14], fill=col, radius=2)
        draw_text(d, (bx+18, y), gname, _sans(11), TEXT)
        draw_text(d, (ACTBAR_W+SIDEBAR_W-50, y), status, _sans(10, bold=True), col)
        y += 20
    y += 8
    draw_rect(d, [ACTBAR_W+4, y, ACTBAR_W+SIDEBAR_W-4, y+1], fill=BORDER)
    y += 8
    y = draw_sidebar_header(d, "MCP STATUS", y=y)
    draw_text(d, (ACTBAR_W+8, y), "●  kicad-mcp-pro 3.0.2", _sans(10), SUCCESS)
    y += 16
    draw_text(d, (ACTBAR_W+8, y), "Profile: full", _sans(10), TEXT_DIM)
    y += 20
    draw_rect(d, [ACTBAR_W+8, y, ACTBAR_W+SIDEBAR_W-8, y+22], fill=ACCENT, radius=3)
    draw_text(d, (ACTBAR_W+14, y+4), "▶ Run All Gates", _sans(10), TEXT_BRIGHT)
    y += 28
    draw_rect(d, [ACTBAR_W+8, y, ACTBAR_W+SIDEBAR_W-8, y+22], fill="#3c3c3c", radius=3)
    draw_text(d, (ACTBAR_W+14, y+4), "↓ Export Report", _sans(10), TEXT)

    # tabs
    draw_tabbar(d, [("Quality Gates", False), ("MCP Log", False)], active=0)

    # editor: quality gates webview
    ex, ey, ew, eh = editor_area()
    fill_editor(d, "#1e1e2e")

    # Header
    draw_rect(d, [ex, ey, ew, ey+48], fill="#252540")
    draw_text(d, (ex+16, ey+10), "Manufacturing Release Gates", _sans(14, bold=True), TEXT_BRIGHT)
    draw_text(d, (ex+16, ey+30), "arduino_uno  |  kicad-mcp-pro 3.0.2  |  Last run: just now", _sans(10), TEXT_DIM)
    # overall badge
    draw_rect(d, [ew-150, ey+8, ew-8, ey+40], fill="#3d1515", radius=4)
    draw_text(d, (ew-79, ey+24), "⊗  NOT READY", _sans(11, bold=True), ERROR, anchor="mm")

    gate_panels = [
        {
            "name": "Project Gate",
            "status": "PASS",
            "col": SUCCESS,
            "items": [
                (SUCCESS, "✔", "KiCad project file valid"),
                (SUCCESS, "✔", "Schematic synced with PCB netlist"),
                (SUCCESS, "✔", "All symbols have footprints"),
                (SUCCESS, "✔", "No missing library references"),
            ]
        },
        {
            "name": "Placement Gate",
            "status": "WARN",
            "col": WARN,
            "items": [
                (SUCCESS, "✔", "All components placed inside board edge"),
                (WARN,    "⚠", "Thermal relief incomplete on 2 pads"),
                (SUCCESS, "✔", "High-speed pairs within skew tolerance"),
                (WARN,    "⚠", "Decoupling cap C3 >2.0 mm from U1 pin 32"),
            ]
        },
        {
            "name": "Transfer Gate",
            "status": "PASS",
            "col": SUCCESS,
            "items": [
                (SUCCESS, "✔", "Gerber files generated (18 layers)"),
                (SUCCESS, "✔", "Drill file generated (.excellon)"),
                (SUCCESS, "✔", "IPC-2581 export clean"),
                (SUCCESS, "✔", "BOM exported (18 unique parts)"),
            ]
        },
        {
            "name": "Manufacturing Gate",
            "status": "FAIL",
            "col": ERROR,
            "items": [
                (ERROR,   "⊗", "Min track width violation: 0.12 mm < 0.15 mm fab limit"),
                (ERROR,   "⊗", "Silkscreen on copper: J1 reference overlaps pad"),
                (SUCCESS, "✔", "Via drill sizes within fab tolerance"),
                (SUCCESS, "✔", "Board edge clearance OK"),
            ]
        },
    ]

    gx_start = ex + 12
    gy = ey + 56
    gw = (ew - ex - 28) // 2

    for gi, gate in enumerate(gate_panels):
        gx = gx_start + (gi % 2) * (gw + 8)
        if gi == 2:
            gy += 170

        col = gate["col"]
        draw_rect(d, [gx, gy, gx+gw, gy+155], fill="#252538", radius=6)
        draw_rect(d, [gx, gy, gx+gw, gy+32], fill="#1a1a3a", radius=6)
        # header
        status_bg = {"PASS": "#153d15", "WARN": "#3d3d00", "FAIL": "#3d1515"}[gate["status"]]
        draw_rect(d, [gx+gw-80, gy+6, gx+gw-4, gy+26], fill=status_bg, radius=3)
        draw_text(d, (gx+gw-42, gy+16), gate["status"], _sans(10, bold=True), col, anchor="mm")
        draw_text(d, (gx+12, gy+10), gate["name"], _sans(11, bold=True), TEXT_BRIGHT)
        # items
        iy = gy + 36
        for icol, icon, msg in gate["items"]:
            draw_text(d, (gx+10, iy), icon, _sans(11), icol)
            draw_text(d, (gx+26, iy), msg, _sans(10), TEXT if icol==SUCCESS else (TEXT_BRIGHT if icol==ERROR else TEXT))
            iy += 26

    draw_statusbar_items(d, [
        ("✔ KiCad Studio", TEXT_BRIGHT),
        ("⬡ kicad-mcp-pro 3.0.2", SUCCESS),
        ("Gates: 2/4 passed", WARN),
    ])

    img.save(os.path.join(OUT_DIR, "quality-gates.png"), dpi=(96,96))
    print("✓ quality-gates.png")

# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    make_schematic_viewer()
    make_pcb_viewer()
    make_drc_results()
    make_bom_table()
    make_component_search()
    make_git_diff()
    make_ai_assistant()
    make_quality_gates()
    print("\nAll screenshots saved to assets/screenshots/")
