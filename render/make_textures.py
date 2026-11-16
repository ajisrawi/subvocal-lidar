"""Board textures for the Blender renders, drawn from the routed layouts (render/build/*_geometry.json):
green solder mask, copper traces under the mask, ENIG pads, tented vias, white silkscreen corner marks.
    python render/make_textures.py   ->  render/build/{bt,wired}_top.png, _bottom.png
"""
import json, os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
B = os.path.join(HERE, 'build')
PX = 40
MASK, TRACE, GOLD, VIA, VIAH, SILK = (24, 86, 54), (36, 112, 70), (214, 178, 84), (44, 120, 78), (20, 60, 38), (236, 238, 232)


def draw(g, W, H, side):
    im = Image.new('RGB', (int(W * PX), int(H * PX)), MASK)
    d = ImageDraw.Draw(im)
    P = lambda x, y: (x * PX, (H - y) * PX)
    layer = 'F.Cu' if side == 'front' else 'B.Cu'
    for t in g['traces']:
        if t['layer'] != layer: continue
        pts = [P(q['x'], q['y']) for q in t['points']]
        w = max(2, int(t['width'] * PX))
        d.line(pts, fill=TRACE, width=w, joint='curve')
        for q in pts: d.ellipse((q[0] - w / 2, q[1] - w / 2, q[0] + w / 2, q[1] + w / 2), fill=TRACE)
    for p in g['pads']:
        if p['side'] != side and not p['th']: continue
        if p.get('npth'): continue
        x, y = P(p['x'], p['y']); w, h = p['w'] * PX / 2, p['h'] * PX / 2
        if p['shape'] == 'circle': d.ellipse((x - w, y - h, x + w, y + h), fill=GOLD)
        else: d.rounded_rectangle((x - w, y - h, x + w, y + h), radius=min(w, h) * 0.25, fill=GOLD)
    for v in g['vias']:
        x, y = P(v['x'], v['y']); r = v['d'] * PX / 2; rh = v['drill'] * PX / 2
        d.ellipse((x - r, y - r, x + r, y + r), fill=VIA)
        d.ellipse((x - rh, y - rh, x + rh, y + rh), fill=VIAH)
    if side == 'front':
        for c in g['components']:
            if c['side'] != 'front' or not c['ref'].startswith(('U', 'Q', 'X', 'Y')): continue
            bw, bh = c['body']['w'], c['body']['h']
            if int(round(c['rot'])) % 180 == 90: bw, bh = bh, bw
            x, y = P(c['x'], c['y']); hw, hh = bw * PX / 2 + 3, bh * PX / 2 + 3
            for (ax, ay, bx, by) in ((x - hw, y - hh, x - hw + 14, y - hh), (x - hw, y - hh, x - hw, y - hh + 14),
                                     (x + hw, y + hh, x + hw - 14, y + hh), (x + hw, y + hh, x + hw, y + hh - 14)):
                d.line((ax, ay, bx, by), fill=SILK, width=3)
    return im


for name, W, H in (('bt', 62.0, 12.0), ('wired', 41.0, 11.0)):
    g = json.load(open(os.path.join(B, f'{name}_geometry.json')))
    draw(g, W, H, 'front').save(os.path.join(B, f'{name}_top.png'))
    draw(g, W, H, 'back').transpose(Image.FLIP_LEFT_RIGHT).save(os.path.join(B, f'{name}_bottom.png'))
    print(name, 'textures', int(W * PX), int(H * PX))
