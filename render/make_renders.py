"""Subvocal Lidar: glasses pod (Bluetooth) and in-temple module (wired), modelled and rendered by Blender.

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P render/make_renders.py -- [--renders] [--only=hero,exploded,wired]

Needs render/build/{bt,wired}_geometry.json and textures (render/export_board.mjs, render/make_textures.py).
Writes bluetooth/enclosure/stl/*.stl (printable pod shell, cover, button cap), render/subvocal-lidar.blend and
renders/*.png. Blender unit = 1 mm. World: X forward (lenses at X ~ 0..+4), Y left, Z up; the right temple is at Y = -70.
"""
import bpy, bmesh, json, math, os, sys
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
B = os.path.join(HERE, 'build')
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
GBT = json.load(open(os.path.join(B, 'bt_geometry.json')))
GW = json.load(open(os.path.join(B, 'wired_geometry.json')))
T = 0.8                                  # board thickness

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.unit_settings.system = 'METRIC'; sc.unit_settings.scale_length = 0.001; sc.unit_settings.length_unit = 'MILLIMETERS'

# ------------------------------------------------------------------ helpers
def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

def material(name, color, metallic=0.0, rough=0.5, transmission=0.0, coat=0.0, image=None, emission=None, estrength=3.0, alpha=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    def setin(k, v):
        if k in bsdf.inputs: bsdf.inputs[k].default_value = v
    setin('Base Color', (*color, 1)); setin('Metallic', metallic); setin('Roughness', rough)
    setin('Transmission Weight', transmission); setin('Coat Weight', coat); setin('Alpha', alpha)
    if emission: setin('Emission Color', (*emission, 1)); setin('Emission Strength', estrength)
    if image:
        tex = m.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(image)
        m.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    return m

def apply(ob, mod):
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier=mod.name)

def bevel(ob, width, segments=5, angle=60):
    bv = ob.modifiers.new('bevel', 'BEVEL'); bv.width = width; bv.segments = segments; bv.limit_method = 'ANGLE'; bv.angle_limit = math.radians(angle)
    apply(ob, bv); return ob

def link(ob, coll):
    coll.objects.link(ob); return ob

def box(name, x0, x1, y0, y1, z0, z1, mat=None, bev=0.0, coll=None):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(x1 - x0, y1 - y0, z1 - z0), verts=bm.verts)
    bmesh.ops.translate(bm, vec=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), verts=bm.verts)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); (coll or sc.collection).objects.link(ob)
    if mat: ob.data.materials.append(mat)
    if bev > 0: bevel(ob, bev)
    return ob

def cyl(name, r, h, mat=None, seg=48, coll=None, r2=None):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); (coll or sc.collection).objects.link(ob)
    if mat: ob.data.materials.append(mat)
    return ob

def boolean(ob, other, op='DIFFERENCE', delete=True):
    m = ob.modifiers.new('b', 'BOOLEAN'); m.operation = op; m.object = other; m.solver = 'EXACT'
    apply(ob, m)
    if delete: bpy.data.objects.remove(other, do_unlink=True)

def set_parent(obs, parent):
    for o in obs: o.parent = parent

# ------------------------------------------------------------------ materials
M = dict(
    bt_top=material('bt_top', (1, 1, 1), rough=0.35, coat=0.3, image=os.path.join(B, 'bt_top.png')),
    bt_bot=material('bt_bottom', (1, 1, 1), rough=0.35, coat=0.3, image=os.path.join(B, 'bt_bottom.png')),
    w_top=material('wired_top', (1, 1, 1), rough=0.35, coat=0.3, image=os.path.join(B, 'wired_top.png')),
    w_bot=material('wired_bottom', (1, 1, 1), rough=0.35, coat=0.3, image=os.path.join(B, 'wired_bottom.png')),
    edge=material('pcb_edge', srgb('#C9C1A0'), rough=0.6),
    ic=material('ic', srgb('#1B1C1F'), rough=0.45),
    tin=material('tin', srgb('#C9CCD1'), metallic=1.0, rough=0.3),
    gold=material('gold', srgb('#D8B45A'), metallic=1.0, rough=0.25),
    cap=material('cap', srgb('#B48A5A'), rough=0.5),
    res=material('res', srgb('#1E1E20'), rough=0.5),
    ceramic=material('ceramic', srgb('#EDEAE2'), rough=0.4),
    led_red=material('led_red', srgb('#E0302A'), rough=0.15, transmission=0.6, emission=srgb('#FF3A2A')),
    led_yel=material('led_yellow', srgb('#E8B82A'), rough=0.15, transmission=0.6, emission=srgb('#FFC83A')),
    steel=material('steel', srgb('#D7DADF'), metallic=1.0, rough=0.18),
    glass=material('window_glass', srgb('#9FB7C9'), rough=0.05, transmission=0.9),
    nylon=material('nylon', srgb('#EDE6D6'), rough=0.6),
    fpc=material('fpc', srgb('#C8782A'), rough=0.35, coat=0.4),
    battery=material('battery', srgb('#C8CCD2'), metallic=0.6, rough=0.35),
    shell=material('pod_shell', srgb('#1E2228'), rough=0.38, coat=0.3),
    cover=material('pod_cover', srgb('#2A2F37'), rough=0.3, coat=0.4),
    accent=material('accent', srgb('#0E8A82'), rough=0.35, coat=0.3),
    frame=material('frame', srgb('#15171A'), rough=0.3, coat=0.5),
    lens=material('lens', srgb('#DDE6EE'), rough=0.02, transmission=0.95),
    temple=material('smart_temple', srgb('#2B2F36'), rough=0.4, coat=0.2),
    beam=material('beam', srgb('#FF2A1A'), rough=1.0, transmission=0.0, emission=srgb('#FF3A20'), estrength=6.0, alpha=0.35),
    floor=material('floor', srgb('#E6E8EB'), rough=0.85),
)
for k in ('beam',):
    M[k].blend_method = 'BLEND' if hasattr(M[k], 'blend_method') else None

# ------------------------------------------------------------------ boards
def board_mesh(name, outline, W, H, mats, coll):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new((p['x'], p['y'], 0.0)) for p in outline]
    f = bm.faces.new(vs); bmesh.ops.recalc_face_normals(bm, faces=[f])
    if f.normal.z > 0: f.normal_flip()
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, vec=(0, 0, T), verts=[v for v in ext['geom'] if isinstance(v, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.normal_update()
    uv = bm.loops.layers.uv.new()
    for face in bm.faces:
        n = face.normal
        face.material_index = 0 if n.z > 0.5 else (1 if n.z < -0.5 else 2)
        for lp in face.loops:
            u = lp.vert.co.x / W
            lp[uv].uv = (u if n.z >= -0.5 else 1 - u, lp.vert.co.y / H)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); coll.objects.link(ob)
    for m in mats: ob.data.materials.append(m)
    return ob

BODY = {
    'QFN-48-1EP_6x6mm_P0.4mm_EP4.6x4.6mm': (6.0, 6.0, 0.85, 'ic'),
    'Crystal_SMD_2016-4Pin_2.0x1.6mm': (2.0, 1.6, 0.5, 'tin'),
    'SOT-363_SC-70-6': (1.25, 2.0, 0.95, 'ic'), 'SOT-23-5': (1.6, 2.9, 1.1, 'ic'), 'SOT-23': (1.3, 2.9, 1.0, 'ic'),
    'VSSOP-8_3x3mm_P0.65mm': (3.0, 3.0, 1.0, 'ic'), 'VSSOP-8_2.3x2mm_P0.5mm': (2.0, 2.3, 0.9, 'ic'),
    'C_0402_1005Metric': (1.0, 0.5, 0.5, 'cap'), 'R_0402_1005Metric': (1.0, 0.5, 0.35, 'res'), 'L_0402_1005Metric': (1.0, 0.5, 0.5, 'res'),
    'C_0603_1608Metric': (1.6, 0.8, 0.8, 'cap'), 'LED_0603_1608Metric': (1.6, 0.8, 0.6, 'led'),
    'Antenna_W3008': (3.2, 1.6, 1.1, 'ceramic'),
}

def at(c, dx, dy):
    a = math.radians(c['rot']); ca, sa = round(math.cos(a)), round(math.sin(a))
    return c['x'] + dx * ca - dy * sa, c['y'] + dx * sa + dy * ca

def lbox(name, c, x0, x1, y0, y1, z0, z1, mat, coll, bev=0.0):
    pts = [at(c, x, y) for x in (x0, x1) for y in (y0, y1)]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return box(name, min(xs), max(xs), min(ys), max(ys), z0, z1, mat, bev, coll)

def build_board(prefix, g, W, H, top, bot, coll, laser_xy):
    obs = [board_mesh(prefix + '_pcb', g['outline'], W, H, (top, bot, M['edge']), coll)]
    for c in g['components']:
        if c['side'] != 'front': continue
        fp = c['footprint']
        if fp in BODY:
            w, h, z, mat = BODY[fp]
            if mat == 'led': mat = 'led_red' if c['value'] == 'red' else 'led_yel'
            if int(round(c['rot'])) % 180 == 90: w, h = h, w
            obs.append(box(prefix + c['ref'], c['x'] - w / 2, c['x'] + w / 2, c['y'] - h / 2, c['y'] + h / 2, T, T + z, M[mat], min(0.06, z * 0.12), coll))
        elif fp.startswith('USB_C'):
            sh = lbox(prefix + 'J1_shell', c, -4.47, 4.47, -3.65, 3.7, T, T + 3.26, M['steel'], coll)
            bevel(sh, 1.2, 8)
            m = lbox('mouth', c, -4.0, 4.0, -4.2, 2.6, T + 0.3, T + 2.96, None, coll); boolean(sh, m)
            obs += [sh, lbox(prefix + 'J1_tongue', c, -3.3, 3.3, -3.2, 2.6, T + 1.28, T + 1.98, M['ic'], coll)]
        elif fp.startswith('Jushuo'):
            obs.append(lbox(prefix + 'J1_body', c, -4.3, 4.3, -3.65, 0.75, T, T + 2.0, M['ic'], coll, 0.08))
            obs.append(lbox(prefix + 'J1_lid', c, -3.7, 3.7, -3.65, -2.3, T + 2.0, T + 2.25, M['nylon'], coll, 0.05))
        elif fp.startswith('SW_SPST_TS-1088'):
            obs.append(lbox(prefix + 'SW_body', c, -1.95, 1.95, -1.5, 1.5, T, T + 2.0, M['ic'], coll, 0.08))
            obs.append(lbox(prefix + 'SW_act', c, -0.8, 0.8, 1.5, 2.25, T + 0.5, T + 1.5, M['steel'], coll, 0.08))
    # TO-56 laser in the notch / cut-out, window pointing down (-y), leads up to the pads
    lx, ly = laser_xy
    flange = cyl(prefix + 'LD_flange', 2.8, 1.2, M['gold'], coll=coll); flange.rotation_euler = (math.radians(90), 0, 0); flange.location = (lx, ly - 0.6, T / 2)
    can = cyl(prefix + 'LD_can', 2.25, 3.4, M['steel'], coll=coll); can.rotation_euler = (math.radians(90), 0, 0); can.location = (lx, ly - 1.2 - 1.7, T / 2)
    win = cyl(prefix + 'LD_lens', 1.0, 0.3, M['glass'], coll=coll); win.rotation_euler = (math.radians(90), 0, 0); win.location = (lx, ly - 4.6 - 0.15, T / 2)
    obs += [flange, can, win]
    for k, dx in enumerate((-2.25, -0.75, 0.75, 2.25)):
        lead = box(prefix + f'LD_lead{k}', lx + dx * 0.55 - 0.2, lx + dx * 0.55 + 0.2, ly - 0.1, ly + 1.2, T, T + 0.25, M['tin'], coll=coll)
        obs.append(lead)
    return obs

BTC = bpy.data.collections.new('BluetoothPod'); sc.collection.children.link(BTC)
WC = bpy.data.collections.new('WiredModule'); sc.collection.children.link(WC)
GC = bpy.data.collections.new('Glasses'); sc.collection.children.link(GC)
TC = bpy.data.collections.new('SmartTemple'); sc.collection.children.link(TC)

BT_LASER = (20.4, 6.4)        # notch centre x, notch top y (bluetooth/hardware/scripts/make_board.mjs)
W_LASER = (3.6, 6.0)          # cut-out centre x, cut-out top y (wired)
bt_board = build_board('bt_', GBT, 62.0, 12.0, M['bt_top'], M['bt_bot'], BTC, BT_LASER)
w_board = build_board('w_', GW, 41.0, 11.0, M['w_top'], M['w_bot'], WC, W_LASER)

# ------------------------------------------------------------------ pod shell (board coordinates: x along, y up, z out)
X0, X1, Y0, Y1 = -1.6, 63.6, -1.2, 13.4
ZB, ZF = -5.8, 5.4             # battery side, component side
def pod_parts():
    back = box('PodBack', X0, X1, Y0, Y1, ZB - 1.8, 0.8, M['shell'], 1.6, BTC)
    boolean(back, box('c_cav', -0.25, 62.25, -0.6, 12.25, ZB, 0.81, coll=BTC))                       # board + battery cavity
    boolean(back, box('c_groove', X0 - 1, X1 + 1, 2.9, 9.5, ZB - 1.81, ZB - 0.15, coll=BTC))          # slides onto the temple (3 mm)
    front = box('PodCover', X0, X1, Y0, Y1, 0.8, ZF, M['cover'], 1.6, BTC)
    boolean(front, box('c_cav2', -0.25, 62.25, -0.6, 12.25, 0.79, ZF - 1.2, coll=BTC))
    for ob in (back, front):
        boolean(ob, box('c_usb', X0 - 2, 1.0, 1.6, 10.4, -0.6, 4.6, coll=BTC))                       # USB-C opening, rear end
        boolean(ob, box('c_ptt', 30.6, 35.4, 11.6, Y1 + 2, 0.6, 3.2, coll=BTC))                       # push-to-talk button
        win = cyl('c_laser', 2.9, 8, coll=BTC); win.rotation_euler = (math.radians(90), 0, 0); win.location = (BT_LASER[0], -1.5, T / 2)
        boolean(ob, win)                                                                               # laser window
    stripe = box('PodStripe', 8, 58, Y1 - 0.02, Y1 + 0.25, 1.6, 3.6, M['accent'], 0.1, BTC)
    btn = box('PodButton', 31.0, 35.0, 12.4, Y1 + 0.9, 0.9, 2.9, M['accent'], 0.5, BTC)
    bat = box('Battery_401030', 15.0, 47.0, 1.2, 11.0, ZB + 0.1, -0.4, M['battery'], 0.5, BTC)
    return back, front, stripe, btn, bat

back, front, stripe, btn, bat = pod_parts()

# STL export (in board coordinates, before placing on the glasses)
stl_dir = os.path.join(ROOT, 'bluetooth', 'enclosure', 'stl'); os.makedirs(stl_dir, exist_ok=True)
def export(ob, path):
    for o in bpy.context.view_layer.objects: o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.wm.stl_export(filepath=path, export_selected_objects=True, global_scale=1.0, apply_modifiers=True)
export(back, os.path.join(stl_dir, 'subvocal-lidar-pod-back.stl'))
export(front, os.path.join(stl_dir, 'subvocal-lidar-pod-cover.stl'))
export(btn, os.path.join(stl_dir, 'subvocal-lidar-pod-button.stl'))
print('POD', [round(v, 2) for v in back.dimensions], [round(v, 2) for v in front.dimensions])

# ------------------------------------------------------------------ glasses
def glasses():
    obs = []
    for side in (1, -1):
        rim = bpy.data.meshes.new('rim'); bm = bmesh.new()
        bmesh.ops.create_circle(bm, cap_ends=False, segments=64, radius=1.0)
        for v in bm.verts: v.co.x *= 27; v.co.y *= 21
        bm.to_mesh(rim); bm.free()
        o = bpy.data.objects.new('Rim', rim); GC.objects.link(o)
        o.rotation_euler = (math.radians(90), 0, math.radians(90)); o.location = (2.0, side * 33.0, 0)
        so = o.modifiers.new('sk', 'SKIN')
        for v in o.data.skin_vertices[0].data: v.radius = (2.4, 2.4)
        sub = o.modifiers.new('ss', 'SUBSURF'); sub.levels = 2; sub.render_levels = 2
        o.data.materials.append(M['frame'])
        obs.append(o)
        lens = cyl('Lens', 1.0, 1.6, M['lens'], 64, GC); lens.scale = (1, 1, 1)
        me = lens.data
        for v in me.vertices: v.co.x *= 26; v.co.y *= 20
        lens.rotation_euler = (0, math.radians(90), 0); lens.location = (2.0, side * 33.0, 0)
        obs.append(lens)
        temple = box('Temple', -138, 4, side * 70 - 1.5, side * 70 + 1.5, -3.0, 3.0, M['frame'], 1.0, GC)
        tip = box('TempleTip', -168, -132, side * 70 - 1.5, side * 70 + 1.5, -3.0, 3.0, M['frame'], 1.0, GC)
        tip.rotation_euler = (0, math.radians(-28), 0); tip.location = (-14, 0, -14)
        hinge = box('Hinge', 0, 6, side * 70 - 3.2 if side > 0 else side * 70 - 1.8, side * 70 + 1.8 if side > 0 else side * 70 + 3.2, -4, 4, M['frame'], 1.2, GC)
        endp = box('EndPiece', 2, 6, side * 60, side * 70 + 1.5 * side, -6, 6, M['frame'], 1.5, GC) if side > 0 else box('EndPiece', 2, 6, side * 70 - 1.5, side * 60, -6, 6, M['frame'], 1.5, GC)
        obs += [temple, tip, hinge, endp]
    bridge = box('Bridge', 1.0, 3.6, -7, 7, 6, 9.5, M['frame'], 1.2, GC)
    obs.append(bridge)
    return obs

glasses_obs = glasses()

# place the pod on the outer side of the right temple (local z -> world -Y, local y -> world Z)
POD = bpy.data.objects.new('PodAssembly', None); BTC.objects.link(POD)
set_parent(bt_board + [back, front, stripe, btn, bat], POD)
POD.rotation_euler = (math.radians(90), 0, 0)
POD.location = (-68.0, -70 - 1.5 + ZB + 1.8 - 1.8, -6.2)
# the (invisible) 1550 nm beam, drawn for illustration: down and slightly towards the cheek
beam = cyl('Beam', 0.25, 34, M['beam'], 24, BTC, r2=1.4)
beam.parent = POD
beam.location = (BT_LASER[0], -1.4 - 17, T / 2 - 6.0)
beam.rotation_euler = (math.radians(90 + 20), 0, 0)

# ------------------------------------------------------------------ smart-glasses temple with the wired module inside
def smart_temple():
    arm = box('SmartTemple', -6, 150, -4.0, 4.0, -7.0, 7.0, M['temple'], 2.5, TC)
    boolean(arm, box('c_inside', 2, 142, -2.9, 2.9, -6.0, 6.0, coll=TC))
    boolean(arm, box('c_cutaway', 20, 90, -5, -1.0, -5.0, 5.0, coll=TC))                       # cutaway to show the module
    win = cyl('c_lwin', 2.6, 6, coll=TC); win.location = (24.5, 0, -7.0); boolean(arm, win)     # laser window underneath
    return arm

arm = smart_temple()
WM = bpy.data.objects.new('WiredAssembly', None); WC.objects.link(WM)
set_parent(w_board, WM)
WM.rotation_euler = (math.radians(90), 0, 0)
WM.location = (21.0, 0.6, -5.5)
fpc = box('FPC_cable', 62, 140, -0.2, 0.2, -2.0, 2.0, M['fpc'], 0.05, TC)
fpc_b = box('FPC_fold', 60.5, 62.5, -1.4, 0.2, -2.0, 2.0, M['fpc'], 0.05, TC)
SMART = bpy.data.objects.new('SmartTempleAssembly', None); TC.objects.link(SMART)
set_parent([arm, WM, fpc, fpc_b], SMART)
SMART.location = (0, 400, 0)

# ------------------------------------------------------------------ renders
def look_at(cam, target):
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', 'Y').to_euler()

def setup():
    sc.render.engine = 'CYCLES'
    dev = os.environ.get('SUBVOCAL_GPU')
    if dev:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = dev; prefs.get_devices()
        for d in prefs.devices: d.use = True
        sc.cycles.device = 'GPU'
    sc.cycles.samples = 64; sc.cycles.use_denoising = True; sc.cycles.use_adaptive_sampling = True
    sc.render.resolution_x, sc.render.resolution_y = 1920, 1200
    if os.environ.get('SUBVOCAL_PREVIEW'): sc.cycles.samples = 8; sc.render.resolution_percentage = 33
    sc.view_settings.view_transform = 'AgX'
    w = bpy.data.worlds.new('studio'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (*srgb('#EEF1F4'), 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.9
    for name, rot, strength, angle in (('key', (math.radians(50), 0, math.radians(35)), 3.2, 12), ('rim', (math.radians(60), 0, math.radians(200)), 1.6, 6)):
        L = bpy.data.lights.new(name, 'SUN'); L.energy = strength; L.angle = math.radians(angle)
        o = bpy.data.objects.new(name, L); o.rotation_euler = rot; sc.collection.objects.link(o)
    cam_d = bpy.data.cameras.new('cam'); cam_d.lens = 70; cam_d.clip_start = 1; cam_d.clip_end = 8000
    cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
    floor = box('Floor', -2000, 2000, -2000, 2000, -60, -40, M['floor'])
    return cam, floor

def show(colls):
    for c in (BTC, WC, GC, TC):
        c.hide_render = c not in colls

def shot(name, loc, target, lens=70):
    sc.camera.location = loc; sc.camera.data.lens = lens; look_at(sc.camera, target)
    sc.render.filepath = os.path.join(ROOT, 'renders', name); bpy.ops.render.render(write_still=True)

if '--renders' in ARGS:
    cam, floor = setup()
    os.makedirs(os.path.join(ROOT, 'renders'), exist_ok=True)
    only = [a for a in ARGS if a.startswith('--only=')]
    want = only[0][7:].split(',') if only else ['hero', 'exploded', 'wired']
    if 'hero' in want:
        show([BTC, GC]); floor.location.z = -10
        shot('glasses-pod.png', Vector((95, -300, 95)), (-42, -40, -4), 52)
    if 'exploded' in want:
        show([BTC]); beam.hide_render = True
        for o, dz in ((front, 14), (btn, 22), (stripe, 14), (bat, -12), (back, -20)):
            o.location.z += dz
        shot('pod-exploded.png', Vector((40, -230, 60)), (-36, -80, 0), 60)
        for o, dz in ((front, 14), (btn, 22), (stripe, 14), (bat, -12), (back, -20)):
            o.location.z -= dz
        beam.hide_render = False
    if 'wired' in want:
        show([WC, TC])
        shot('wired-in-temple.png', Vector((150, 290, 85)), (58, 400, -3), 45)

bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'subvocal-lidar.blend'))
print('DONE')
