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

def decimate(objs, target):
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
            md = o.modifiers.new('d', 'DECIMATE'); md.ratio = max(0.01, want / n); bpy.ops.object.modifier_apply(modifier='d')

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
            nm = os.path.basename(bpy.path.abspath(img.filepath)); d0 = os.path.dirname(src)
            for cand in [os.path.join(d0, nm), os.path.join(d0, 'textures', nm), os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(d0))), 'textures', nm)]:
                if os.path.exists(cand): img.filepath = cand; img.reload(); break
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
    if c.get('scale'):
        S = mathutils.Matrix.Scale(c['scale'], 4)
        for o in meshes: o.data.transform(S)
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
    decimate(meshes, c.get('tris', 0))
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
    # textures: scrub insignia, repaint, cap sizes
    for img in list(bpy.data.images):
        if img.size[0] == 0: continue
        nm = img.name
        for pat, rects in c.get('scrub', {}).items():
            if re.search(pat, nm): scrub(img, rects); print('SCRUB', key, nm, len(rects))
        if c.get('teal') and re.search(c['teal'] if isinstance(c['teal'], str) else r'Color', nm): teal(img)
        if c.get('wide_livery') and re.search(r'^Material Color (4|5)$', nm): wide_livery(img); print('LIVERY', nm)
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
