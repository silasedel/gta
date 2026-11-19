# W6 models (airports agent, Nov 19): the user's library jets, cargo jet, widebody airliner and tour helicopter ->
# game GLBs with a far LOD. Same output frame as tools/v2/air/convert_planes.py (glTF: +Z nose, +Y up, +X left wing,
# meters, y = 0 at the lowest wheel / skid, x = 0 centerline, z = 0 at the bounding-box center); spinning parts become
# PROP<n> nodes (origin at the hub), control surfaces AIL_L / AIL_R / ELEV nodes (origin on the hinge line).
#   blender -b --disable-autoexec --python-exit-code 1 --python tools/v2/airport/convert_w6.py -- <key|all>
#   (W6_DL = folder with the user's download zips unpacked, one folder per zip name; nested zips / rars unpacked to source/x)
# Real insignia (roundels, service names, tail codes, flags, type numbers) are painted out of the textures (scrub
# rectangles in texture space, filled with the surrounding paint); tire brand text is downsampled away.
import bpy, bmesh, sys, os, re, math, mathutils, json
import numpy as np
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
M = os.path.join(ROOT, 'Models')
DL = os.environ.get('W6_DL', '/private/tmp/claude-501/sl/dl')   # the unpacked download zips (one folder per zip)
AIR = os.path.join(ROOT, 'public', 'assets', 'vehicles', 'air')
APT = os.path.join(ROOT, 'public', 'assets', 'models', 'airport')
CFG = {
  # Downloaded fighters (Nov 19, the user's ~/Downloads zips, unpacked to $W6_DL): f-16-fighting-falcon-fighter-jet-free,
  # f-22-raptor-fighter-jet-free, f-35-lightning-ii-fighter-jet-free. .blend sources open with autoexec off; geometry-node
  # modifiers are evaluated. Gear-down parts kept, gear-up doors / lights / HUD glass dropped. One 4K atlas each -> 2K.
  'jet_f16': {'src': 'dl:f-16-fighting-falcon-fighter-jet-free/source/F-16.blend', 'out': AIR, 'tris': 18000, 'lod1': 2500, 'scale': 0.1, 'nose': (0, 1),
    'drop': [r'landingOff', r'landingOnLight', r'instrGlass', r'-hud'], 'tex': 2048,
    'scrub': {r'^BaseColor': [[.785, .222, .84, .268], [.035, .597, .09, .643], [.76, .305, .885, .395], [.74, .44, .86, .52], [.22, .635, .26, .675], [.265, .685, .305, .725], [.215, .335, .315, .385]]}},
  'jet_f22': {'src': 'dl:f-22-raptor-fighter-jet-free/source/F22Raptor.blend', 'out': AIR, 'tris': 20000, 'lod1': 2500, 'scale': 0.1, 'nose': (0, 1),
    'drop': [r'landingOff', r'landingOnLight', r'instrGlass', r'-hud'], 'tex': 2048,
    'scrub': {r'^BaseColor': [[.005, .135, .085, .24], [.005, .385, .085, .49], [.785, .24, .845, .305], [.07, .58, .13, .64]]}},
  'jet_f35': {'src': 'dl:f-35-lightning-ii-fighter-jet-free/source/F-35.blend', 'out': AIR, 'tris': 18000, 'lod1': 2500, 'scale': 0.1, 'nose': (0, 1),
    'drop': [r'landingOff', r'landingOnLight', r'instrGlass'], 'tex': 2048},
  # lockheed-martin-c130jsuper-hercules-reupload (fbx, 1/20 scale units): the base's parked C-130 (cockpit interior dropped)
  'c130': {'src': 'dl:lockheed-martin-c130jsuper-hercules-reupload/source/x/Lockheed Martin C-130J _Super Hercules_/C130J.fbx', 'out': APT, 'tris': 22000, 'lod1': 2500, 'col': True,
    'scale': 0.0505, 'nose': (1, -1), 'dropmat': r'^(cockpit|Interior)', 'tex': 1024},
  # Plane 8: parked prop at the base (cockpit / crew-station interior dropped)
  'cargo_jet': {'src': 'Planes/Plane 8 - Weathered Four-Engine Military Cargo Jet/Plane 8.glb', 'out': APT, 'tris': 24000, 'lod1': 2500, 'col': True,
    'drop': [r'^crane', r'^cockpit', r'interior', r'seat'], 'tex': 1024,
    'scrub': {r'^Material Color 27$': [[.15, .12, .32, .17], [0, .3, .14, .36], [.46, .115, .54, .16], [.48, .3, .55, .34], [.08, .09, .21, .15], [.08, .26, .21, .32],
                                       [.63, .6, .8, .73], [0, .76, .23, .94], [0, .77, .08, .84], [.64, .64, .79, .68]],
              r'^Material Color 3$': [[.3, .44, .49, .55]], r'^Material Color 5$': [[.24, .67, .4, .79]], r'^Material Color$': [[.2, .13, .29, .19], [.2, .48, .29, .54]]}},
  # Plane 5: MIA widebody traffic. Its gear parts are misplaced in the source: dropped, simple gear added. Tail logo /
  # type number and nose script painted out; the tail gets the made-up Southline Air colors.
  'airliner_wide': {'src': 'Planes/Plane 5 - Twin-Engine Widebody Airliner/Plane 5.glb', 'out': APT, 'tris': 0, 'lod1': 2500, 'col': True, 'scale': 1.15,
    'dropmat': r'^(Ty|Rim|Greymat|Blackmat)$', 'keepobj': r'^object\.005$', 'maxz': 15, 'tex': 1024, 'wide_livery': True,
    'gear': {'z': -4.2, 'nose': (0, -19.0, 0.42, 2), 'main': [(4.9, 1.0, 0.6), (-4.9, 1.0, 0.6)], 'top': -1.6}},
  # bell-206-jet-ranger (obj, FlightGear model): the Keys tour helicopter (main rotor PROP0, tail rotor PROP1); its blue
  # repainted to the tour teal; cockpit instruments / seats dropped (cabin shell kept behind the windows)
  'heli_tour': {'src': 'dl:bell-206-jet-ranger/source/x/bell206.obj', 'out': AIR, 'tris': 14000, 'lod1': 1800, 'nose': (0, -1),
    'drop': [r'^seat', r'^yoke', r'^fond', r'^vitre', r'^int(?!erieur)', r'^pedal', r'^collective', r'^cyclic'],
    'props': [[r'^blade\d', r'^axe', r'^mainrotor[234]'], [r'^tailrotor', r'^blade_blade', r'^blade\.001_']], 'hubs': [r'^axe', r'^tailrotor1'], 'tex': 1024, 'teal': r'^texture'},
  # us-army-uh-60m-black-hawk-low-poly-model (blend): the base helipad's Black Hawk (flyable); service name / serials painted out
  'heli_blackhawk': {'src': 'dl:us-army-uh-60m-black-hawk-low-poly-model/source/x/UH60M_upload/UH60M.blend', 'out': AIR, 'tris': 0, 'lod1': 1800, 'nose': (1, -1),
    'drop': [r'^Door open'], 'props': [[r'^main rotor'], [r'^TAIL ROTOR']], 'tex': 2048,
    'scrub': {r'UH60M_d': [[.4, .815, .66, .925], [.83, .795, .935, .86], [.83, .255, .935, .32]]}},
  # MIA airline traffic (Nov 19, the user's downloads, free to use). Real airline / maker liveries are neutralized:
  # 'neutral' textures lose every painted (saturated) pixel to the plain body white, 'scrub' rectangles take the dark
  # titles / registrations, and the tail fin gets its own plain 'LiveryTail' material that livery.js tints in the
  # (fictional) operator color. 'len' scales to the real length; 'fin' = (min height m, rear fraction, max |x| m).
  'airliner_737': {'src': 'dl:boeing-737-800/source/Boeing 737-800.glb', 'out': APT, 'tris': 22000, 'lod1': 2500,
    'col': True, 'len': 39.5, 'nose': (1, -1), 'drop': [r'^custom_vis_LIGHT_BEACON'], 'tex': 2048, 'neutral': r'.',
    'fin': (6.4, 0.3, 0.8), 'scrub': {r'^faib_737': [[.17, .785, .215, .806], [.17, .892, .215, .913]]}},
  'airliner_a320': {'src': 'dl:airbus-a320/source/Airbus A320.glb', 'out': APT, 'tris': 22000, 'lod1': 2500,
    'col': True, 'len': 37.6, 'nose': (1, -1), 'drop': [r'^custom_vis_LIGHT'], 'tex': 2048, 'neutral': r'.',
    'fin': (6.6, 0.3, 0.8)},
  'airliner_737max': {'src': 'dl:737-max-lion-air/source/LOW 737 MAX.fbx', 'out': APT, 'tris': 22000, 'lod1': 2500,
    'col': True, 'len': 39.5, 'nose': (1, -1), 'tex': 1024, 'neutral': r'Base Color', 'fin': (6.4, 0.3, 0.8),
    'texfile': {r'^Wings 737': 'textures/Wings_737._Base_Color_Lion.png'},
    'scrub': {r'^Body 737 Base': [[.069, .657, .085, .722], [.101, .638, .124, .756], [.198, .636, .218, .75],
                                  [.235, .662, .251, .723]]}},
  'airliner_a321': {'src': 'dl:vietnam-airlines-airbus-a321-200/source/Airbus_A-321_Vietnam_Airlines.glb', 'out': APT,
    'tris': 22000, 'lod1': 2500, 'col': True, 'len': 44.5, 'tex': 1024, 'neutral': r'_va', 'dark': r'^glass',
    'fin': (6.6, 0.3, 0.8), 'align': (r'^(19|20|21|22)___Default|^m1r$', r'^23___Default$')},
  'airliner_747': {'src': 'dl:boeing-747-131-trans-world-airlines/source/boeing_747-131_trans_world_airlines.fbx',
    'out': APT, 'tris': 22000, 'lod1': 2500, 'col': True, 'len': 70.6, 'nose': (1, -1), 'tex': 2048,
    'texfile': {r'^Image_0': 'textures/twa_800.png'}, 'neutral': r'.', 'fin': (10.6, 0.25, 1.0)},
  'ga_c208': {'src': 'dl:cessna-208/source/ Cessna 208.glb', 'out': APT, 'tris': 18000, 'lod1': 1500, 'col': True,
    'len': 11.5, 'tex': 512, 'fin': (2.45, 0.27, 0.45), 'renormal': True, 'dropfaces': r'^Union2Mtl$', 'lod1_minpart': 0.6, 'whiten': r'^Union10_diff'},
}
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['all']
keys = list(CFG) if args[0] == 'all' else args
def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)
def bbox(objs):
    mn = mathutils.Vector((1e9,) * 3); mx = -mn
    for o in objs:
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            for i in range(3): mn[i] = min(mn[i], w[i]); mx[i] = max(mx[i], w[i])
    return mn, mx
def match(o, pats): return any(re.search(p, o.name) for p in pats)
def mats_of(o): return [s.material.name for s in o.material_slots if s.material]

def img_np(img):
    w, h = img.size; a = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(a); return a.reshape(h, w, 4)
def img_set(img, a): img.pixels.foreach_set(a.astype(np.float32).ravel()); img.update(); img.pack()
def scrub(img, rects):
    a = img_np(img); h, w = a.shape[:2]
    for x0, y0, x1, y1 in rects:   # top-left origin, normalized; Blender rows start at the bottom
        c0, c1 = int(x0 * w), int(x1 * w); r0, r1 = int((1 - y1) * h), int((1 - y0) * h)
        p = 3; ring = np.concatenate([a[max(0, r0 - p):r0, c0:c1].reshape(-1, 4), a[r1:r1 + p, c0:c1].reshape(-1, 4), a[r0:r1, max(0, c0 - p):c0].reshape(-1, 4), a[r0:r1, c1:c1 + p].reshape(-1, 4)])
        if not len(ring): continue
        med = np.median(ring, axis=0)
        # vertical blend between the top and bottom border colors keeps the panel's shading gradient
        top = np.median(a[r1:r1 + p, c0:c1].reshape(-1, 4), axis=0) if r1 + p <= h else med
        bot = np.median(a[max(0, r0 - p):r0, c0:c1].reshape(-1, 4), axis=0) if r0 >= p else med
        t = np.linspace(0, 1, r1 - r0)[:, None, None]
        fill = bot[None, None] * (1 - t) + top[None, None] * t
        fill = fill * 0.5 + med[None, None] * 0.5
        noise = (np.random.rand(r1 - r0, c1 - c0, 1) - 0.5) * 0.012
        a[r0:r1, c0:c1, :3] = np.clip(fill[..., :3] + noise, 0, 1); a[r0:r1, c0:c1, 3] = 1
    img_set(img, a)
def teal(img):   # saturated blue -> the Keys Air Tours teal (#137a7f), shading kept
    a = img_np(img); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = (b > r * 1.6) & (b > g * 1.25) & (b > 0.25)
    lum = b[m] / 0.6
    a[..., 0][m] = np.clip(0.075 * lum, 0, 1); a[..., 1][m] = np.clip(0.478 * lum, 0, 1); a[..., 2][m] = np.clip(0.498 * lum, 0, 1)
    img_set(img, a)
def wide_livery(img):   # Plane 5: tail (navy + white type number) -> solid Southline blue; blue nose script / cheatline -> white
    a = img_np(img); h, w = a.shape[:2]; r, g, b = a[..., 0], a[..., 1], a[..., 2]
    navy = (b > r + 0.12) & (b > g + 0.05)
    if navy.mean() > 0.2:   # the tail atlas: fill the whole tail shape (navy + the text inside it)
        from_rows = navy.any(axis=1); out = a.copy()
        for y in np.where(from_rows)[0]:
            xs = np.where(navy[y])[0]
            # runs of navy with gaps (letters) up to 40 % of the width get filled
            x0, x1 = xs.min(), xs.max(); seg = a[y, x0:x1 + 1]
            out[y, x0:x1 + 1, :3] = [0.067, 0.322, 0.42]
        img_set(img, out)
    else:
        m = (b > r + 0.08) & (b > 0.3)
        a[..., 0][m] = a[..., 1][m] = a[..., 2][m] = 0.92
        img_set(img, a)


def _blur3(v):
    """3x3 box blur (edges clamped)."""
    p = np.pad(v, ((1, 1), (1, 1), (0, 0)), mode='edge')
    v = (p[:-2] + p[1:-1] + p[2:]) / 3
    return (v[:, :-2] + v[:, 1:-1] + v[:, 2:]) / 3


def smooth_fill(rgb, valid, keep):
    """Push-pull fill: every pixel gets the average of the nearest valid pixels (block averages up to 2^keep px,
    coarser levels only where a hole is bigger), upsampled smoothly. Returns an (h, w, 3) color field."""
    s = rgb * valid[..., None]
    w = valid.astype(np.float32)
    pyr = []
    while True:
        pyr.append((s, w))
        if min(s.shape[:2]) <= 1:
            break
        h2, w2 = s.shape[0] // 2 * 2, s.shape[1] // 2 * 2
        s = s[:h2:2, :w2:2] + s[1:h2:2, :w2:2] + s[:h2:2, 1:w2:2] + s[1:h2:2, 1:w2:2]
        w = w[:h2:2, :w2:2] + w[1:h2:2, :w2:2] + w[:h2:2, 1:w2:2] + w[1:h2:2, 1:w2:2]
    s, w = pyr[-1]
    val = np.where(w[..., None] > 0, s / np.maximum(w, 1e-6)[..., None], 0.9)
    for lv in range(len(pyr) - 2, -1, -1):
        s, w = pyr[lv]
        up = np.repeat(np.repeat(val, 2, axis=0), 2, axis=1)
        up = np.pad(up, ((0, max(0, s.shape[0] - up.shape[0])), (0, max(0, s.shape[1] - up.shape[1])), (0, 0)), mode='edge')
        up = _blur3(up[:s.shape[0], :s.shape[1]])
        if lv >= keep:
            val = np.where(w[..., None] > 0, s / np.maximum(w, 1e-6)[..., None], up)
        else:
            val = up
    return val


def neutral(img):
    """Paint out every painted (saturated) pixel: airline cheatlines, titles, logos, colored registrations.

    The fill is the texture's own plain body white (median of its light, unsaturated pixels), so the result is a
    plain white / grey airframe; the mask grows by 2 px so anti-aliased letter edges go too.
    """
    a = img_np(img)
    rgb = a[..., :3]
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    lum = rgb.mean(axis=2)
    mask = sat > 0.1
    for _ in range(2):
        grown = mask.copy()
        grown[1:] |= mask[:-1]
        grown[:-1] |= mask[1:]
        grown[:, 1:] |= mask[:, :-1]
        grown[:, :-1] |= mask[:, 1:]
        mask = grown
    light = (~mask) & (lum > 0.55)
    # white titles painted on the colored areas would stay as ghosts: near the paint, light pixels are repainted too
    near = mask.copy()
    for _ in range(24):
        grown = near.copy()
        grown[1:] |= near[:-1]
        grown[:-1] |= near[1:]
        grown[:, 1:] |= near[:, :-1]
        grown[:, :-1] |= near[:, 1:]
        near = grown
    mask |= near & light
    # the fill is the local plain paint around each hole (from the light pixels only, so windows / black
    # backgrounds never bleed in): no blotches where the body white shades darker or lighter
    field = smooth_fill(rgb, light & ~mask, 3)
    noise = (np.random.rand(int(mask.sum()), 1) - 0.5) * 0.008
    rgb[mask] = np.clip(field[mask] + noise, 0, 1)
    a[..., :3] = rgb
    fill = np.median(field[mask], axis=0) if mask.any() else np.zeros(3)
    img_set(img, a)
    print('NEUTRAL', img.name, round(float(mask.mean()), 3), [round(float(v), 3) for v in fill])


def darken(img):
    """Colorful (oil-slick) glass texture -> dark tinted glass."""
    a = img_np(img)
    lum = a[..., :3].mean(axis=2, keepdims=True)
    a[..., :3] = np.clip(0.06 + lum * 0.12, 0, 1) * np.array([0.9, 0.95, 1.0])
    img_set(img, a)


def paint_fin(body, fin):
    """Tail fin faces -> their own plain 'LiveryTail' material (livery.js tints it in the operator color).

    fin = (min height m, rear fraction of the length, max |x| m); the frame here has the nose toward -Y.
    """
    zmin, rear, xmax = fin
    me = body.data
    ys = [v.co.y for v in me.vertices]
    y0 = max(ys) - rear * (max(ys) - min(ys))
    mat = bpy.data.materials.new('LiveryTail')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (0.86, 0.86, 0.85, 1)
    bsdf.inputs['Roughness'].default_value = 0.45
    me.materials.append(mat)
    idx = len(me.materials) - 1
    n = 0
    for p in me.polygons:
        c = p.center
        if c.z > zmin and c.y > y0 and abs(c.x) < xmax:
            p.material_index = idx
            n += 1
    print('FIN', body.name, n, 'faces')


def align(meshes, body_mats, wing_mats):
    """Sources that sit banked / yawed in their file: level them from their own geometry.

    The fuselage axis is the principal axis of the fuselage-material vertices (-> Y), the span the principal
    axis of the wing vertices across it (-> X); up (-> Z) points to the fin (the side reaching further out).
    """
    def pts(pat):
        out = []
        for o in meshes:
            for p in o.data.polygons:
                m = o.data.materials[p.material_index] if o.data.materials else None
                if m and re.search(pat, m.name):
                    out.extend(o.data.vertices[i].co[:] for i in p.vertices)
        return np.array(out)
    def axis(p):
        p = p - p.mean(axis=0)
        return np.linalg.eigh(p.T @ p)[1][:, -1]
    body = pts(body_mats)
    ax_y = axis(body)
    wing = pts(wing_mats)
    wing = wing - np.outer(wing @ ax_y, ax_y)
    ax_x = axis(wing)
    ax_x -= ax_y * (ax_x @ ax_y)
    ax_x /= np.linalg.norm(ax_x)
    ax_z = np.cross(ax_x, ax_y)
    allp = np.array([v.co[:] for o in meshes for v in o.data.vertices])
    h = (allp - body.mean(axis=0)) @ ax_z
    if -h.min() > h.max():
        ax_z, ax_x = -ax_z, -ax_x
    R = mathutils.Matrix([list(ax_x) + [0], list(ax_y) + [0], list(ax_z) + [0], [0, 0, 0, 1]])
    for o in meshes:
        o.data.transform(R)
    print('ALIGN', [round(float(v), 3) for v in (*ax_x, *ax_y, *ax_z)])


def find_texture(img, src, c):
    """Path of an image the source file references but does not resolve (other folder, '_' for ' ', remapped)."""
    d0 = os.path.dirname(src)
    for pat, rel in c.get('texfile', {}).items():
        if re.search(pat, img.name):
            return os.path.join(os.path.dirname(d0), rel)
    nm = os.path.basename(bpy.path.abspath(img.filepath))
    up3 = os.path.dirname(os.path.dirname(os.path.dirname(d0)))
    dirs = [d0, os.path.join(d0, 'textures'), os.path.join(os.path.dirname(d0), 'textures'), os.path.join(up3, 'textures')]
    for d in dirs:
        for n in (nm, nm.replace(' ', '_')):
            if n and os.path.isfile(os.path.join(d, n)):
                return os.path.join(d, n)
    return None


def decimate(objs, target, renormal=False):
    tot = sum(tris(o) for o in objs)
    if not target or tot <= target * 1.1: return
    for o in objs:
        n = tris(o)
        if n < 400: continue
        if o.data.users > 1: o.data = o.data.copy()
        b_ = bmesh.new(); b_.from_mesh(o.data); bmesh.ops.remove_doubles(b_, verts=b_.verts, dist=0.0015); b_.to_mesh(o.data); b_.free()
        want = max(120, n * target / tot)
        if n > want * 1.2:
            bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
            if renormal and o.data.has_custom_normals:
                # imported custom normals do not survive a collapse (black streaks): drop them, re-derive by angle
                bpy.ops.mesh.customdata_custom_splitnormals_clear()
            md = o.modifiers.new('d', 'DECIMATE'); md.ratio = max(0.01, want / n); bpy.ops.object.modifier_apply(modifier='d')
            if renormal:
                bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))

def export(path, objs_sel=None):
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_image_format='WEBP', export_image_quality=82, export_yup=True, export_apply=True,
                              export_animations=False, export_cameras=False, export_lights=False, export_materials='EXPORT')

report = {}
for key in keys:
    c = CFG[key]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    src = os.path.join(DL, c['src'][3:]) if c['src'].startswith('dl:') else os.path.join(M, c['src'])
    if src.endswith('.blend'):   # never run its scripts: blender is started with --disable-autoexec (see the header)
        bpy.ops.wm.open_mainfile(filepath=src, load_ui=False)
        dg = bpy.context.evaluated_depsgraph_get()
        for o in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
            if o.hide_render or o.hide_get(): bpy.data.objects.remove(o); continue
            me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg); o.modifiers.clear(); o.data = me
    elif src.endswith('.glb'): bpy.ops.import_scene.gltf(filepath=src)
    elif src.endswith('.obj'): bpy.ops.wm.obj_import(filepath=src)
    else: bpy.ops.import_scene.fbx(filepath=src)
    for img in bpy.data.images:   # textures next to the source (obj / fbx / blend paths that do not resolve)
        if img.size[0] == 0 and img.filepath:
            cand = find_texture(img, src, c)
            if cand:
                img.filepath = cand
                img.reload()
    for img in bpy.data.images:
        try:
            if img.size[0] > 0 and not img.packed_file: img.pack()
        except Exception: pass
    sc = bpy.context.scene
    meshes = [o for o in sc.objects if o.type == 'MESH']
    for o in meshes:
        mw = o.matrix_world.copy(); o.parent = None; o.data = o.data.copy(); o.data.transform(mw); o.matrix_world = mathutils.Matrix.Identity(4)
        for md in list(o.modifiers): o.modifiers.remove(md)
    for o in [o for o in sc.objects if o.type != 'MESH']: bpy.data.objects.remove(o)
    dm = re.compile(c['dropmat']) if c.get('dropmat') else None; ko = re.compile(c['keepobj']) if c.get('keepobj') else None
    for o in list(meshes):
        mn, mx = bbox([o]); sz = max(mx - mn)
        bad = match(o, c.get('drop', [])) or (dm and any(dm.search(n) for n in mats_of(o)) and not (ko and ko.search(o.name))) or tris(o) == 0 or (c.get('maxz') and mx[2] - mn[2] > c['maxz']) or (tris(o) > 3000 and sz < 0.3 * (1 / c.get('scale', 1)))
        if bad: meshes.remove(o); bpy.data.objects.remove(o)
    if c.get('dropfaces'):   # faces of these materials go (single-object sources: e.g. a duplicate inner shell)
        for o in meshes:
            bm = bmesh.new()
            bm.from_mesh(o.data)
            names = [m.name if m else '' for m in o.data.materials]
            gone = [f for f in bm.faces if re.search(c['dropfaces'], names[f.material_index] if names else '')]
            bmesh.ops.delete(bm, geom=gone, context='FACES')
            bm.to_mesh(o.data)
            bm.free()
    if c.get('scale'):
        S = mathutils.Matrix.Scale(c['scale'], 4)
        for o in meshes: o.data.transform(S)
    if c.get('align'):
        align(meshes, *c['align'])
    mn, mx = bbox(meshes)
    if c.get('nose'):
        long = c['nose'][0]; noseSign = c['nose'][1]
    else:   # the tail fin is the highest part; the nose is the other end of the long axis
        hi = mx[2] - 0.25 * (mx[2] - mn[2]); acc = [0.0, 0.0]; n = 0
        for o in meshes:
            for v in o.data.vertices:
                if v.co[2] > hi: acc[0] += v.co[0]; acc[1] += v.co[1]; n += 1
        off = [acc[i] / max(1, n) - (mn[i] + mx[i]) / 2 for i in (0, 1)]
        long = 0 if abs(off[0]) / (mx[0] - mn[0]) > abs(off[1]) / (mx[1] - mn[1]) else 1
        noseSign = -1 if acc[long] / max(1, n) > (mn[long] + mx[long]) / 2 else 1
    nose = mathutils.Vector((0, 0, 0)); nose[long] = noseSign
    ang = math.atan2(nose[0], -nose[1]); R = mathutils.Matrix.Rotation(-ang, 4, 'Z')
    if (R @ nose - mathutils.Vector((0, -1, 0))).length > 1e-3: R = mathutils.Matrix.Rotation(ang, 4, 'Z')
    for o in meshes: o.data.transform(R)
    if c.get('len'):   # scale to the real length (nose -> tail along Y now)
        mn, mx = bbox(meshes)
        S = mathutils.Matrix.Scale(c['len'] / (mx[1] - mn[1]), 4)
        for o in meshes:
            o.data.transform(S)
    # simple gear (source frame after rotation: nose -Y): struts + paired wheels
    if c.get('gear'):
        G = c['gear']; s = c.get('scale', 1); gz = G['z'] * s; top = G['top'] * s
        gm = bpy.data.materials.new('GearTire'); gm.diffuse_color = (0.05, 0.05, 0.05, 1)
        gm.use_nodes = True; gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.04, 0.04, 0.045, 1); gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.85
        sm = bpy.data.materials.new('GearStrut'); sm.use_nodes = True; sm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.62, 0.63, 0.65, 1); sm.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = 0.6
        def cyl(r, d, loc, rot, mat):
            bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=r, depth=d, location=loc, rotation=rot); o = bpy.context.active_object; o.data.materials.append(mat)
            o.data.transform(o.matrix_world); o.matrix_world = mathutils.Matrix.Identity(4); meshes.append(o)
        legs = [G['nose']] + [(x, y, r, 4) for x, y, r in G['main']]   # source x / y (nose already toward -Y: no turn)
        for x, y, r, nw in legs:
            x *= s; y *= s; r *= s
            cyl(0.13 * s, top - (gz + r), (x, y, (top + gz + r) / 2), (0, 0, 0), sm)
            pairs = [(-0.32, 0), (0.32, 0)] if nw == 2 else [(-0.4, -0.75), (0.4, -0.75), (-0.4, 0.75), (0.4, 0.75)]
            for dx, dy in pairs: cyl(r, 0.36 * s, (x + dx * s, y + dy * s, gz + r), (0, math.pi / 2, 0), gm)
            if nw == 4: cyl(0.09 * s, 1.7 * s, (x, y, gz + r), (math.pi / 2, 0, 0), sm)
    mn, mx = bbox(meshes)
    T = mathutils.Matrix.Translation((-(mn[0] + mx[0]) / 2, -(mn[1] + mx[1]) / 2, -mn[2]))
    for o in meshes: o.data.transform(T)
    if c.get('planar'):   # dense CAD-style meshes: merge flat faces first (keeps the outline, unlike a collapse)
        for o in meshes:
            bpy.ops.object.select_all(action='DESELECT')
            o.select_set(True)
            bpy.context.view_layer.objects.active = o
            md = o.modifiers.new('p', 'DECIMATE')
            md.decimate_type = 'DISSOLVE'
            md.angle_limit = math.radians(c['planar'])
            md.delimit = {'MATERIAL', 'UV', 'SEAM'}
            bpy.ops.object.modifier_apply(modifier='p')
        print('PLANAR', key, sum(tris(o) for o in meshes))
    decimate(meshes, c.get('tris', 0), c.get('renormal', False))
    nodes = {}
    def group(name, pats, pivot, hub=None):
        objs = [o for o in meshes if match(o, pats)]
        hubs = [o for o in objs if hub and re.search(hub, o.name)]
        hp = None
        if hubs: ha, hb = bbox(hubs); hp = (ha + hb) / 2
        if not objs: return None
        for o in objs: meshes.remove(o)
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs: o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1: bpy.ops.object.join()
        o = bpy.context.view_layer.objects.active; o.name = name
        a, b = bbox([o]); p = (a + b) / 2
        if pivot == 'front': p[1] = a[1]
        if hp is not None: p = hp if name != 'PROP0' else mathutils.Vector((hp[0], hp[1], p[2]))
        o.data.transform(mathutils.Matrix.Translation(-p)); o.location = p
        nodes[name] = [round(p[0], 3), round(p[2], 3), round(-p[1], 3)]
        return o
    for i, pats in enumerate(c.get('props', [])): group('PROP%d' % i, pats, 'center', (c.get('hubs') or [None, None])[i])
    if c.get('ail'): group('AIL_L', [c['ail'][0]], 'front'); group('AIL_R', [c['ail'][1]], 'front')
    if c.get('elev'): group('ELEV', [c['elev']], 'front')
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]; bpy.ops.object.join(); body = bpy.context.view_layer.objects.active; body.name = 'BODY'
    if c.get('fin'):
        paint_fin(body, c['fin'])
    # textures: scrub insignia, repaint, cap sizes
    for img in list(bpy.data.images):
        if img.size[0] == 0: continue
        nm = img.name
        for pat, rects in c.get('scrub', {}).items():
            if re.search(pat, nm): scrub(img, rects); print('SCRUB', key, nm, len(rects))
        if c.get('teal') and re.search(c['teal'] if isinstance(c['teal'], str) else r'Color', nm): teal(img)
        if c.get('wide_livery') and re.search(r'^Material Color (4|5)$', nm): wide_livery(img); print('LIVERY', nm)
        if c.get('neutral') and re.search(c['neutral'], nm) and not re.search(r'nrm|NRM|nmap|Normal|Bump', nm):
            neutral(img)
        if c.get('dark') and re.search(c['dark'], nm):
            darken(img)
        if c.get('whiten') and re.search(c['whiten'], nm):   # olive drab paint -> plain white
            px = img_np(img)
            lum = px[..., :3].mean(axis=2, keepdims=True)
            px[..., :3] = np.clip(0.86 + (lum - lum.mean()) * 0.6, 0, 1)
            img_set(img, px)
        if os.environ.get('W6_TEXDUMP'):   # review copies of the processed textures
            dump = img.copy()
            dump.filepath_raw = os.path.join(os.environ['W6_TEXDUMP'], key + '__' + re.sub(r'\W', '_', nm) + '.png')
            dump.file_format = 'PNG'
            dump.save()
            bpy.data.images.remove(dump)
        cap = c.get('tex', 1024)
        for pat, v in c.get('texcap', {}).items():
            if re.search(pat, nm): cap = min(cap, v)
        if re.search(r'Normal|Height', nm): cap = min(cap, 512)
        if img.size[0] > cap or img.size[1] > cap:
            f = cap / max(img.size); img.scale(max(1, int(img.size[0] * f)), max(1, int(img.size[1] * f)))
    os.makedirs(c['out'], exist_ok=True)
    allm = [o for o in sc.objects if o.type == 'MESH']
    a, b = bbox(allm); tot = sum(tris(o) for o in allm)
    low = []   # ground contacts (glTF frame) for types.js gear: vertices within 4 cm of the floor, clustered
    for o in allm:
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            if w[2] < 0.04: low.append((w[0], -w[1]))
    cl = []
    for x, z in low:
        for k in cl:
            if abs(k[0] / k[2] - x) < 0.6 and abs(k[1] / k[2] - z) < 0.8: k[0] += x; k[1] += z; k[2] += 1; break
        else: cl.append([x, z, 1])
    contacts = [[round(k[0] / k[2], 2), round(k[1] / k[2], 2), k[2]] for k in cl if k[2] > 2][:8]
    out = os.path.join(c['out'], key + '.glb'); export(out)
    rep = {'tris': tot, 'size_xyz_gltf': [round(b[0] - a[0], 2), round(b[2] - a[2], 2), round(b[1] - a[1], 2)], 'nodes': nodes, 'bytes': os.path.getsize(out), 'src': c['src'], 'contacts': contacts,
           'zrange': [round(-b[1], 2), round(-a[1], 2)]}
    if c.get('lod1'):   # far LOD: one decimated mesh (nodes merged; nothing animates that far), 256 px textures
        for o in allm:
            mw = o.matrix_world.copy(); o.data.transform(mw); o.matrix_world = mathutils.Matrix.Identity(4)
        bpy.ops.object.select_all(action='DESELECT')
        for o in allm: o.select_set(True)
        bpy.context.view_layer.objects.active = allm[0]; bpy.ops.object.join(); lo = bpy.context.view_layer.objects.active; lo.name = 'LOD1'
        if c.get('lod1_minpart'):   # many-part CAD sources: small loose parts (bolts, antennas) are not seen that far
            bm = bmesh.new()
            bm.from_mesh(lo.data)
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.02)   # weld the CAD seams so the collapse can work
            bm.faces.index_update()
            seen = set()
            gone = []
            for f0 in bm.faces:
                if f0.index in seen:
                    continue
                part, stack = [], [f0]
                seen.add(f0.index)
                while stack:
                    f = stack.pop()
                    part.append(f)
                    for e in f.edges:
                        for f2 in e.link_faces:
                            if f2.index not in seen:
                                seen.add(f2.index)
                                stack.append(f2)
                co = np.array([v.co[:] for f in part for v in f.verts])
                if np.linalg.norm(co.max(axis=0) - co.min(axis=0)) < c['lod1_minpart']:
                    gone.extend(part)
            bmesh.ops.delete(bm, geom=gone, context='FACES')
            bm.to_mesh(lo.data)
            bm.free()
        n = tris(lo)
        if n > c['lod1']:
            md = lo.modifiers.new('d', 'DECIMATE'); md.ratio = max(0.004, c['lod1'] / n); bpy.ops.object.modifier_apply(modifier='d')
        for img in bpy.data.images:
            if img.size[0] > 256 or img.size[1] > 256: f = 256 / max(img.size); img.scale(max(1, int(img.size[0] * f)), max(1, int(img.size[1] * f)))
        p1 = os.path.join(c['out'], key + '_lod1.glb'); export(p1)
        rep['lod1'] = {'tris': tris(lo), 'bytes': os.path.getsize(p1)}
        if c.get('col'):   # collision soup (no materials)
            md = lo.modifiers.new('d', 'DECIMATE'); md.ratio = max(0.05, 600 / max(1, tris(lo))); bpy.ops.object.modifier_apply(modifier='d')
            lo.data.materials.clear()
            p2 = os.path.join(c['out'], key + '_col.glb')
            bpy.ops.export_scene.gltf(filepath=p2, export_format='GLB', export_yup=True, export_apply=True, export_materials='NONE')
            rep['col'] = {'tris': tris(lo), 'bytes': os.path.getsize(p2)}
    report[key] = rep
    print('CONVERTED', key, json.dumps(rep))
# the manifest of every converted model (merged, so single-key runs keep the others)
manifest_path = os.path.join(ROOT, 'tools', 'v2', 'airport', 'w6_models.json')
manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
manifest.update(report)
json.dump(manifest, open(manifest_path, 'w'), indent=1)
