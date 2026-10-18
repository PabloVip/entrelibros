"""Genera ilustraciones SVG provisionales para cada producto (public/img/productos/<slug>.svg).
Uso: python3 tools/generar_ilustraciones.py
Se sustituirán por fotografías propias o con licencia libre antes de la entrega."""
from pathlib import Path
import random

OUT = Path(__file__).resolve().parent.parent / "public" / "img" / "productos"

# (slug, título, tipo, paleta: cielo arriba, cielo abajo, fachada, acento/luz)
PRODUCTS = [
    ("callejon-kioto-sakura", "Callejón de Kioto", "kit", ("#2b1d3a", "#c76b8f", "#5a3a2a", "#ffb7c9")),
    ("tienda-ramen-nocturna", "Ramen nocturno", "kit", ("#0d1430", "#3a2a6b", "#2a2a3a", "#ff5a5a")),
    ("biblioteca-infinita", "Biblioteca infinita", "kit", ("#2a1a10", "#6b4a2a", "#4a2e1a", "#ffd27a")),
    ("archivo-del-alquimista", "Archivo del alquimista", "kit", ("#1a2420", "#3e5a4a", "#3a2a1a", "#9fe0a0")),
    ("cafeteria-paris-1920", "Café de París", "kit", ("#7aa0c8", "#e8d8c0", "#8a3a3a", "#ffe08a")),
    ("libreria-esquina-lluvia", "Librería bajo la lluvia", "kit", ("#3a4656", "#7a8a9a", "#2e4a3a", "#ffcf6a")),
    ("bosque-de-las-hadas", "Bosque de las hadas", "kit", ("#102a1e", "#3a7a4a", "#2a4a2a", "#e8ff8a")),
    ("torre-del-dragon", "Torre del dragón", "kit", ("#1a0e0e", "#6a2a1a", "#4a4a52", "#ff8a3a")),
    ("callejon-praga", "Callejón de Praga", "kit", ("#2a3a5a", "#d8a07a", "#a85a3a", "#ffd88a")),
    ("despacho-detective-victoriano", "Despacho victoriano", "kit", ("#1e1e24", "#4a4a5a", "#3a2418", "#ffb85a")),
    ("kit-led-usb-universal", "Kit LED USB", "accesorio", ("#1e2a3a", "#3a4a6a", "#2a2a2a", "#fff2a8")),
    ("set-libros-miniatura", "Libros en miniatura", "accesorio", ("#efe6d8", "#d8c8b0", "#8a4b2a", "#c84a3a")),
    ("cupula-antipolvo", "Cubierta antipolvo", "accesorio", ("#dde8ef", "#b8c8d8", "#8a9aaa", "#ffffff")),
    ("set-pintura-acabados", "Set de pintura", "accesorio", ("#f0e8dc", "#d8c8b0", "#6a4a3a", "#3a7ac8")),
    ("recambio-farolillos-papel", "Farolillos de papel", "recambio", ("#2b1d3a", "#5a3a5a", "#5a3a2a", "#ff7a5a")),
    ("recambio-tira-led-30", "Tira LED 30 cm", "recambio", ("#1e2a3a", "#2a3a4a", "#2a2a2a", "#fff2a8")),
    ("recambio-ventanas-acetato", "Ventanas de acetato", "recambio", ("#dde8ef", "#c8d8e4", "#6a7a8a", "#a8d8ff")),
    ("recambio-piezas-praga", "Piezas de Praga", "recambio", ("#e8dcc8", "#d0bfa0", "#a85a3a", "#5a3a2a")),
]

SPINES = ["#7a2e2e", "#2e4a7a", "#3a6a3a", "#8a6a2a", "#5a3a6a", "#2a5a5a", "#9a4a2a"]


def books(x0, width, rnd):
    parts, x = [], x0
    while x < x0 + width - 6:
        w = rnd.randint(14, 26)
        w = min(w, x0 + width - x)
        h = rnd.randint(250, 300)
        c = rnd.choice(SPINES)
        parts.append(f'<rect x="{x}" y="{340 - h}" width="{w - 2}" height="{h}" rx="2" fill="{c}"/>')
        parts.append(f'<rect x="{x + 3}" y="{360 - h}" width="{w - 8}" height="4" fill="#e8d8a8" opacity=".6"/>')
        x += w
    return "".join(parts)


def scene_kit(pal, rnd):
    top, bottom, wall, light = pal
    s = [f'<rect x="120" y="40" width="160" height="300" fill="url(#sky)"/>']
    # fachadas a ambos lados con ventanas iluminadas
    for side, x in (("l", 120), ("r", 220)):
        y = rnd.randint(70, 110)
        s.append(f'<rect x="{x}" y="{y}" width="60" height="{340 - y}" fill="{wall}"/>')
        for row in range(5):
            for col in range(2):
                if rnd.random() < .75:
                    s.append(f'<rect x="{x + 10 + col * 24}" y="{130 + row * 38}" width="14" height="20" rx="2" fill="{light}" opacity="{rnd.uniform(.6, 1):.2f}"/>')
    # suelo y farolas
    s.append('<polygon points="120,340 280,340 230,280 170,280" fill="#00000040"/>')
    for x in (150, 250):
        s.append(f'<rect x="{x}" y="230" width="3" height="60" fill="#222"/><circle cx="{x + 1.5}" cy="228" r="7" fill="{light}"/>')
        s.append(f'<circle cx="{x + 1.5}" cy="228" r="20" fill="{light}" opacity=".18"/>')
    return "".join(s)


def scene_item(pal, kind):
    top, bottom, main, accent = pal
    if kind == "accesorio":
        return (f'<rect x="120" y="40" width="160" height="300" fill="url(#sky)"/>'
                f'<rect x="150" y="150" width="100" height="120" rx="8" fill="{main}"/>'
                f'<rect x="150" y="150" width="100" height="26" rx="8" fill="{accent}"/>'
                f'<circle cx="200" cy="225" r="22" fill="{accent}" opacity=".85"/>')
    return (f'<rect x="120" y="40" width="160" height="300" fill="url(#sky)"/>'
            f'<rect x="145" y="140" width="110" height="140" rx="4" fill="#fffaf0" stroke="{main}" stroke-width="3" stroke-dasharray="6 4"/>'
            f'<circle cx="180" cy="190" r="16" fill="{accent}"/><rect x="205" y="178" width="34" height="24" fill="{main}"/>'
            f'<rect x="165" y="228" width="70" height="30" fill="{accent}" opacity=".6"/>')


def svg(slug, title, kind, pal):
    rnd = random.Random(slug)
    top, bottom, *_ = pal
    scene = scene_kit(pal, rnd) if kind == "kit" else scene_item(pal, kind)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 420" role="img" aria-label="{title}">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{top}"/><stop offset="1" stop-color="{bottom}"/></linearGradient></defs>
<rect width="400" height="420" fill="#f3ece2"/>
<rect x="0" y="340" width="400" height="80" fill="#c9a77c"/><rect x="0" y="340" width="400" height="8" fill="#b08a5c"/>
{books(10, 110, rnd)}{books(280, 110, rnd)}
{scene}
<rect x="118" y="38" width="164" height="304" fill="none" stroke="#3a2a1a" stroke-width="4"/>
<text x="200" y="392" text-anchor="middle" font-family="Georgia, serif" font-size="20" fill="#3a2a1a">{title}</text>
</svg>
'''


OUT.mkdir(parents=True, exist_ok=True)
for slug, title, kind, pal in PRODUCTS:
    (OUT / f"{slug}.svg").write_text(svg(slug, title, kind, pal), encoding="utf-8")
print(f"{len(PRODUCTS)} ilustraciones generadas en {OUT}")
