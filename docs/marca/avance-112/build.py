"""Build Avance 112 motion assets from the existing docs/marca symbol.

Run from the repository root: python3 docs/marca/avance-112/build.py
Requires system PyCairo, PyGObject, Pango and librsvg. Archivo is read from
the project's installed @fontsource-variable/archivo package (OFL-1.1).
"""
from pathlib import Path
import ctypes
import re
import xml.etree.ElementTree as ET

import cairo
import gi

gi.require_version('Pango', '1.0')
gi.require_version('PangoCairo', '1.0')
gi.require_version('Rsvg', '2.0')
from gi.repository import Pango, PangoCairo, Rsvg

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
FONT = REPO / 'node_modules/@fontsource-variable/archivo/files/archivo-latin-wght-normal.woff2'
fc = ctypes.CDLL('libfontconfig.so.1')
fc.FcConfigGetCurrent.restype = ctypes.c_void_p
fc.FcConfigAppFontAddFile.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
if not fc.FcConfigAppFontAddFile(fc.FcConfigGetCurrent(), str(FONT).encode()):
    raise RuntimeError('Install project dependencies to make Archivo available.')


def outline(text, size, weight=700):
    ctx = cairo.Context(cairo.RecordingSurface(cairo.CONTENT_COLOR_ALPHA, None))
    layout = PangoCairo.create_layout(ctx)
    font = Pango.FontDescription.from_string('Archivo SemiBold')
    font.set_absolute_size(size * Pango.SCALE)
    font.set_variations(f'wght={weight}')
    layout.set_font_description(font)
    layout.set_text(text, -1)
    ctx.move_to(0, -layout.get_baseline() / Pango.SCALE)
    PangoCairo.layout_path(ctx, layout)
    codes = {cairo.PATH_MOVE_TO: 'M', cairo.PATH_LINE_TO: 'L',
             cairo.PATH_CURVE_TO: 'C', cairo.PATH_CLOSE_PATH: 'Z'}
    path = ' '.join(codes[k] + ' '.join(f'{n:.3f}'.rstrip('0').rstrip('.')
                                     for n in pts) for k, pts in ctx.copy_path())
    return path, layout.get_size()[0] / Pango.SCALE


CSS = '''<style>
  .avance112{--avance-ink:#15222E;--avance-red:#C61F2B;--avance-amber:#F2A900;outline:none}
  .avance112 .ink{fill:var(--avance-ink)}
  .avance112 .ink-stroke{stroke:var(--avance-ink)}
  .avance112 .red{fill:var(--avance-red)}
  .avance112 .amber{stroke:var(--avance-amber)}
  .avance112 .node-entry{animation:a112-node .7s cubic-bezier(.2,.7,.2,1) var(--delay) backwards}
  .avance112 .link{stroke-dasharray:1;animation:a112-draw .65s ease var(--delay) backwards;transition:opacity .35s}
  .avance112 .ring{stroke-dasharray:1;animation:a112-draw 1.05s cubic-bezier(.3,.6,.25,1) .25s backwards}
  .avance112 .operator{stroke-dasharray:1;animation:a112-draw .6s ease .9s backwards}
  .avance112 .person-entry{animation:a112-person .7s cubic-bezier(.2,.8,.25,1) .6s backwards;transform-origin:38px 32px}
  .avance112 .name{animation:a112-type .75s cubic-bezier(.2,.7,.2,1) .8s backwards}
  .avance112 .number{animation:a112-type .75s cubic-bezier(.2,.7,.2,1) 1s backwards}
  .avance112 .tagline{animation:a112-type .7s ease 1.2s backwards}
  .avance112 .person{transform-origin:38px 32px;transition:transform .4s ease}
  .avance112 .node{transition:transform .4s ease}
  .avance112 .packet{opacity:0;pointer-events:none}
  .avance112:is(:hover,:focus-visible,.engaged) .person{transform:scale(1.12)}
  .avance112:is(:hover,:focus-visible,.engaged) .node{transform:translateX(1px)}
  .avance112:is(:hover,:focus-visible,.engaged) .link{opacity:.8}
  .avance112:is(:hover,:focus-visible,.engaged) .packet{animation:a112-signal 1.7s ease-in-out var(--delay) infinite}
  .avance112:focus-visible .focus-ring{opacity:.55}
  .avance112 .focus-ring{opacity:0;transition:opacity .2s}
  .avance112.paused *{animation-play-state:paused!important}
  .avance112.still *{animation:none!important;transition:none!important}
  .avance112.still .packet{opacity:0!important}
  @keyframes a112-node{from{opacity:0;transform:translate(-13px,0)}to{opacity:1;transform:translate(0,0)}}
  @keyframes a112-draw{from{stroke-dashoffset:1;opacity:0}to{stroke-dashoffset:0}}
  @keyframes a112-person{from{opacity:0;transform:scale(.45)}to{opacity:1;transform:scale(1)}}
  @keyframes a112-type{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  @keyframes a112-signal{0%,12%{opacity:0;transform:translate(0,0)}30%{opacity:.7}72%{opacity:0;transform:translate(var(--dx),var(--dy))}100%{opacity:0;transform:translate(var(--dx),var(--dy))}}
  @media(prefers-reduced-motion:reduce){.avance112 *{animation:none!important;transition:none!important}.avance112 .packet{display:none}.avance112 .person,.avance112 .node{transform:none!important}}
</style>'''


def symbol():
    # The source coordinates and colours are retained, including opacities.
    source = ET.parse(ROOT.parent / 'simbolo.svg').getroot()
    shapes = list(source[0])
    nodes = []
    for i, shape in enumerate(shapes):
        attrs = dict(shape.attrib)
        tag = shape.tag.split('}')[-1]
        if i < 3:
            attrs.update({'class': 'node ink'})
            body = f'<{tag} ' + ' '.join(f'{k}="{v}"' for k, v in attrs.items()) + '/>'
            nodes.append(f'<g class="node-entry" style="--delay:{i*.12:.2f}s">{body}</g>')
        else:
            attrs['class'] = ('link ink-stroke' if i == 3 else 'ring ink-stroke' if i == 4
                              else 'operator amber' if i == 5 else 'person red')
            if i in (3, 4, 5):
                attrs['pathLength'] = '1'
            if i == 3:
                attrs['style'] = '--delay:.25s'
            element = f'<{tag} ' + ' '.join(f'{k}="{v}"' for k, v in attrs.items()) + '/>'
            if i == 4:
                # Start drawing at twelve o'clock. The final circle is unchanged.
                element = f'<g transform="rotate(-90 38 32)">{element}</g>'
            if i == 6:
                element = f'<g class="person-entry">{element}</g>'
            nodes.append(element)
    for i, (x, y, dx, dy) in enumerate([(10,16,12,9),(9,32,11,0),(10,48,12,-9)]):
        nodes.append(f'<circle class="packet ink" cx="{x}" cy="{y}" r="1.2" '
                     f'style="--dx:{dx}px;--dy:{dy}px;--delay:{i*.18}s"/>')
    return ''.join(nodes)


def artwork(animated=True, dark=False, icon=False):
    title = 'Avance 112 — llamadas que convergen en un incidente'
    description = ('Tres llamadas convergen en un anillo. El arco ámbar representa la decisión humana '
                   'y el centro rojo a la persona en peligro. ' +
                   ('Entrada animada; las señales se activan al pasar el cursor o enfocar con el teclado.'
                    if animated else 'Versión estática con fondo transparente.'))
    name, width = outline('Avance', 92)
    number, _ = outline('112', 92)
    tagline, _ = outline('La IA propone. El operador decide.', 26, 400)
    if icon:
        content = symbol()
        viewbox, w, h = '0 0 64 64', 256, 256
    else:
        content = f'''<g transform="translate(65 46) scale(3.2)">{symbol()}</g>
<g transform="translate(340 170)"><g class="name"><path class="ink" fill="#15222E" d="{name}"/></g>
<g transform="translate({width+25:.3f} 0)"><g class="number"><path class="red" fill="#C61F2B" d="{number}"/></g></g></g>
<g transform="translate(343 222)"><g class="tagline"><path class="ink" fill="#15222E" opacity=".72" d="{tagline}"/></g></g>
<rect class="focus-ring ink-stroke" x="24" y="24" width="1052" height="252" rx="20" fill="none" stroke-width="2"/>'''
        viewbox, w, h = '0 0 1100 300', 1100, 300
    if dark:
        content = content.replace('#15222E', '#E9EDF0').replace('#C61F2B', '#E24B55')
    if not animated:
        # Static masters also work in renderers without CSS variables/pathLength.
        content = re.sub(r'<circle class="packet[^>]*/>', '', content)
        content = re.sub(r'<rect class="focus-ring[^>]*/>', '', content)
        content = re.sub(r' (class|style|pathLength)="[^"]*"', '', content)
    theme = ' style="--avance-ink:#E9EDF0;--avance-red:#E24B55"' if dark and animated else ''
    interactive = ' tabindex="0"' if animated else ''
    classes = 'avance112' + ('' if animated else ' still')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" width="{w}" height="{h}" class="{classes}" role="img" aria-labelledby="a112-title a112-desc"{interactive}{theme}>
<title id="a112-title">{title}</title><desc id="a112-desc">{description}</desc>
{CSS if animated else ''}
{content}
</svg>
'''


def render(source, output, width, height):
    handle = Rsvg.Handle.new_from_file(str(source))
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, width, height)
    ctx = cairo.Context(surface)
    viewport = Rsvg.Rectangle()
    viewport.x, viewport.y, viewport.width, viewport.height = 0, 0, width, height
    handle.render_document(ctx, viewport)
    surface.write_to_png(str(output))


def build():
    for filename, animated, dark, icon in [
        ('avance-112-animado.svg', True, False, False),
        ('avance-112-animado-oscuro.svg', True, True, False),
        ('avance-112.svg', False, False, False),
        ('avance-112-oscuro.svg', False, True, False),
        ('avance-112-simbolo.svg', False, False, True),
    ]:
        (ROOT / filename).write_text(artwork(animated, dark, icon), encoding='utf-8')
    render(ROOT/'avance-112.svg', ROOT/'avance-112.png', 2200, 600)
    render(ROOT/'avance-112-oscuro.svg', ROOT/'avance-112-oscuro.png', 2200, 600)
    html = (ROOT/'preview.template.html').read_text(encoding='utf-8')
    (ROOT/'index.html').write_text(html.replace('{{LOGO}}', artwork()), encoding='utf-8')
    print('SVGs, outlined Archivo wordmark, transparent PNGs and preview generated.')


if __name__ == '__main__':
    build()
