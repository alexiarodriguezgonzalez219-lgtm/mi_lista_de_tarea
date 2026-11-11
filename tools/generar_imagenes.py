"""Genera todas las imagenes de la PWA a partir de icons/icon-source.png.

Uso:  python3 tools/generar_imagenes.py

Crea los iconos (normales, maskable, favicon, tile de Windows, Apple) y las
capturas de pantalla que se muestran en el dialogo de instalacion de Edge/Chrome.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "icons"
SHOTS = ROOT / "screenshots"
SRC = ICONS / "icon-source.png"

ROSA = "#e879a5"
ROSA_OSCURO = "#d65b87"
FONDO = "#fce4ec"
TARJETA = "#fffafd"
FILA = "#fff0f5"
BORDE = "#f2b6cc"
TEXTO = "#805568"
TEXTO_SUAVE = "#b47b91"
COMPLETADA = "#c9a9b8"

FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")
FONT_REG = FONT_DIR / "DejaVuSans.ttf"
FONT_BOLD = FONT_DIR / "DejaVuSans-Bold.ttf"


def fuente(tam, negrita=False):
    """Busca una tipografía disponible tanto en Linux como en Windows/macOS."""
    tamanio = max(1, int(tam))
    candidatos = [
        FONT_BOLD if negrita else FONT_REG,
        "arialbd.ttf" if negrita else "arial.ttf",       # Windows
        "segoeuib.ttf" if negrita else "segoeui.ttf",   # Windows
        "DejaVuSans-Bold.ttf" if negrita else "DejaVuSans.ttf",
    ]
    for candidato in candidatos:
        try:
            return ImageFont.truetype(str(candidato), tamanio)
        except OSError:
            continue
    return ImageFont.load_default(size=tamanio)


def icono_base():
    """Icono elegido, recortado con esquinas redondeadas y sin el borde oscuro."""
    im = Image.open(SRC).convert("RGBA")
    s = im.size[0]
    mascara = Image.new("L", im.size, 0)
    ImageDraw.Draw(mascara).rounded_rectangle(
        [int(s * 0.012), int(s * 0.012), int(s * 0.988), int(s * 0.988)],
        radius=int(s * 0.215),
        fill=255,
    )
    im.putalpha(mascara)
    return im.resize((1024, 1024), Image.LANCZOS)


def sobre_fondo(icono, tam, color=FONDO):
    """Pega un icono con transparencia sobre un lienzo opaco (favicon, tiles...)."""
    lienzo = Image.new("RGBA", (tam, tam), color)
    lienzo.alpha_composite(icono.resize((tam, tam), Image.LANCZOS))
    return lienzo.convert("RGB")


def iconos_normales(base):
    for tam in (192, 512):
        base.resize((tam, tam), Image.LANCZOS).save(
            ICONS / f"icon-{tam}.png", optimize=True
        )

    # Iconos "maskable": fondo completo + la tarjeta centrada en la zona segura.
    # Se aísla solo la tarjeta blanca (con esquinas redondeadas y transparencia)
    # para que nada importante se corte cuando Windows/Android aplican una máscara.
    original = Image.open(SRC).convert("RGBA")
    s = original.size[0]
    tarjeta = original.crop(
        (int(s * 0.228), int(s * 0.228), int(s * 0.772), int(s * 0.772))
    )
    c = tarjeta.size[0]
    mascara = Image.new("L", tarjeta.size, 0)
    ImageDraw.Draw(mascara).rounded_rectangle(
        [int(c * 0.005), int(c * 0.005), int(c * 0.995), int(c * 0.995)],
        radius=int(c * 0.21),
        fill=255,
    )
    tarjeta.putalpha(mascara)

    for tam in (192, 512):
        lienzo = Image.new("RGBA", (tam, tam), FONDO)
        lado = int(tam * 0.62)
        recorte = tarjeta.resize((lado, lado), Image.LANCZOS)
        pos = (tam - lado) // 2
        # sombra suave detrás de la tarjeta
        sombra = Image.new("RGBA", (tam, tam), (0, 0, 0, 0))
        ImageDraw.Draw(sombra).rounded_rectangle(
            [pos, pos + int(tam * 0.008), pos + lado, pos + lado + int(tam * 0.008)],
            radius=int(lado * 0.21), fill=(214, 91, 135, 28),
        )
        lienzo.alpha_composite(sombra)
        lienzo.alpha_composite(recorte, (pos, pos))
        lienzo.convert("RGB").save(
            ICONS / f"icon-maskable-{tam}.png", optimize=True
        )


def iconos_auxiliares(base):
    base.resize((180, 180), Image.LANCZOS).convert("RGB").save(
        ICONS / "apple-touch-icon.png", optimize=True
    )
    sobre_fondo(base, 150).save(ICONS / "mstile-150x150.png", optimize=True)
    sobre_fondo(base, 32).save(ICONS / "favicon-32.png", optimize=True)
    base.resize((64, 64), Image.LANCZOS).save(
        ICONS / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64)],
    )


def redondeado(d, caja, radio, relleno, contorno=None, grosor=1):
    d.rounded_rectangle(caja, radius=radio, fill=relleno, outline=contorno, width=grosor)


def dibujar_app(ancho, alto):
    """Captura ilustrativa de la interfaz real de la app, dibujada a 2x."""
    k = 2
    w, h = ancho * k, alto * k
    im = Image.new("RGB", (w, h), FONDO)
    d = ImageDraw.Draw(im)

    # Decoracion muy suave de fondo
    for cx, cy, r in [(0.08, 0.12, 0.18), (0.93, 0.88, 0.22), (0.9, 0.08, 0.1)]:
        caja = [
            int(w * (cx - r)), int(h * (cy - r)),
            int(w * (cx + r)), int(h * (cy + r)),
        ]
        d.ellipse(caja, fill="#fdeef4")

    cw = min(int(w * 0.44) if ancho > alto else int(w * 0.80), 560 * k)
    pad = int(30 * k)
    ch = int(430 * k)
    x0 = (w - cw) // 2
    y0 = (h - ch) // 2
    x1, y1 = x0 + cw, y0 + ch

    # Sombra y tarjeta
    sombra = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(sombra).rounded_rectangle(
        [x0, y0 + 8 * k, x1, y1 + 8 * k], radius=20 * k, fill=(214, 91, 135, 30)
    )
    im = Image.alpha_composite(im.convert("RGBA"), sombra)
    d = ImageDraw.Draw(im)
    redondeado(d, [x0, y0, x1, y1], 20 * k, TARJETA)

    f = lambda px: int(px * k * (cw / (450 * k)))
    cx = w // 2

    y = y0 + pad + f(18)
    d.text((cx, y), "Mis tareas", font=fuente(f(30), True), fill=ROSA_OSCURO, anchor="mm")
    y += f(46)
    d.text((cx, y), "Organizar mis tareas", font=fuente(f(16)), fill=TEXTO_SUAVE, anchor="mm")

    # Campo de entrada + boton Agregar
    y += f(44)
    alto_fila = f(44)
    ix0, ix1 = x0 + pad, x1 - pad
    ancho_boton = f(96)
    bx0 = ix1 - ancho_boton
    redondeado(d, [ix0, y - alto_fila // 2, bx0 - f(8), y + alto_fila // 2],
               f(10), "#ffffff", BORDE, max(1, k))
    d.text((ix0 + f(14), y), "Escribe una tarea...", font=fuente(f(15)),
           fill=COMPLETADA, anchor="lm")
    redondeado(d, [bx0, y - alto_fila // 2, ix1, y + alto_fila // 2], f(10), ROSA)
    d.text(((bx0 + ix1) // 2, y), "Agregar", font=fuente(f(15), True),
           fill="white", anchor="mm")

    tareas = [
        ("Aprender GitHub", True),
        ("Subir mi primer proyecto", False),
        ("Aprender a hacer commits", False),
    ]
    y += f(58)
    for texto, completada in tareas:
        alto_tarea = f(46)
        caja = [ix0, y - alto_tarea // 2, ix1, y + alto_tarea // 2]
        redondeado(d, caja, f(10), FILA)
        lado_check = f(18)
        check_x = ix0 + f(12)
        check_y = y - lado_check // 2
        if completada:
            redondeado(d, [check_x, check_y, check_x + lado_check, check_y + lado_check],
                       f(5), ROSA)
            d.line(
                [(check_x + f(4), y), (check_x + f(8), y + f(4)), (check_x + f(14), y - f(5))],
                fill="white", width=max(2, f(3)), joint="curve",
            )
        else:
            redondeado(d, [check_x, check_y, check_x + lado_check, check_y + lado_check],
                       f(5), "#ffffff", BORDE, max(2, f(2)))

        color_texto = COMPLETADA if completada else TEXTO
        tx = check_x + lado_check + f(12)
        d.text((tx, y), texto, font=fuente(f(15)), fill=color_texto, anchor="lm")
        if completada:
            ancho_texto = d.textbbox((0, 0), texto, font=fuente(f(15)))[2]
            d.line([(tx, y), (tx + ancho_texto, y)], fill=COMPLETADA, width=max(1, k))

        lado_x = f(30)
        ex0, ex1 = ix1 - f(12) - lado_x, ix1 - f(12)
        redondeado(d, [ex0, y - f(15), ex1, y + f(15)], f(8), "#f3a2bc")
        d.text(((ex0 + ex1) // 2, y), "X", font=fuente(f(14), True),
               fill="white", anchor="mm")
        y += f(56)

    return im.convert("RGB").resize((ancho, alto), Image.LANCZOS)


def capturas():
    SHOTS.mkdir(exist_ok=True)
    dibujar_app(1280, 720).save(SHOTS / "pantalla-escritorio.png", optimize=True)
    dibujar_app(720, 1280).save(SHOTS / "pantalla-movil.png", optimize=True)


def main():
    ICONS.mkdir(exist_ok=True)
    base = icono_base()
    iconos_normales(base)
    iconos_auxiliares(base)
    capturas()
    print("Imagenes generadas en icons/ y screenshots/")


if __name__ == "__main__":
    main()
