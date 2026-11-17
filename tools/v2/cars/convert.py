# Southline car converter: one library car (Models/Cars/*) -> public/assets/vehicles/cars/<key>.glb + <key>.json
#
#   blender -b --disable-autoexec --factory-startup -P tools/v2/cars/convert.py -- <src> <outdir> <key> '<cfg json>'
#
# What it does (see tools/v2/cars/README.md):
#   1. loads the source (.blend opened with scripts OFF, or .fbx/.obj/.glb imported), evaluates modifiers, joins every
#      visible mesh into one world-space mesh (per-face source material + source object kept)
#   2. orients it to the game frame (Blender: forward -Y, left +X, up +Z  ==  glTF/three: forward +Z, left +X, up +Y),
#      scales it to the real length of its class (cfg.L), puts the ground at 0 and z = 0 at mid-wheelbase
#   3. finds the wheels by geometry (tire islands touching the ground at the four corners; everything inside each
#      wheel cylinder belongs to the wheel; off-axis one-of-a-kind parts = brake calipers, which do not spin)
#   4. sorts every source material into a slot: paint (recolored per car), trim (everything opaque: vertex color =
#      base color x texture sampled at the corner, alpha = packed roughness/metal), glass (alpha: window 1 / lens 0),
#      lamp (alpha: lamp channel, see LAMP below; plates get the plate channel and a planar UV), or dropped (badges,
#      logos, engine bays that cannot be seen, ground planes)
#   5. LOD0 / LOD1 / LOD2 by collapse decimation (LOD1/LOD2 lose the interior; LOD2 has the wheels baked in)
#   6. exports one Draco GLB (nodes body0 body1 body2 wheel0 wheel1 [wheelR0 wheelR1] [caliper0]) and a manifest
import bpy, bmesh, sys, os, re, json, math, time
import numpy as np
from mathutils import Vector, Matrix

T0 = time.time()
argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUTDIR, KEY = argv[0], argv[1], argv[2]
CFG = json.loads(argv[3]) if len(argv) > 3 and argv[3] else {}
os.makedirs(OUTDIR, exist_ok=True)
def log(*a): print('[cars]', KEY, *a, flush=True)
def rx(s): return re.compile(s, re.I) if s else None

# lamp channels: must match src/vehicles/model/body/mats.js LAMP
LAMP = {'none': 0, 'head': 1, 'drl': 2, 'lens': 3, 'fog': 4, 'tail': 5, 'tailLed': 6, 'reverse': 7, 'blinkL': 8, 'blinkR': 9,
        'red': 10, 'blue': 11, 'sign': 12, 'amber': 13, 'plate': 14}

# ------------------------------------------------------------------ 1. load
low = SRC.lower()
if low.endswith('.blend'):
    bpy.ops.wm.open_mainfile(filepath=SRC, load_ui=False, use_scripts=False)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if low.endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=SRC)
    elif low.endswith('.obj'): bpy.ops.wm.obj_import(filepath=SRC)
    else: bpy.ops.import_scene.gltf(filepath=SRC)
srcdir = os.path.dirname(SRC)
# missing textures: look the file name up anywhere in the car's folder
_files = {}
for r_, _d, fs in os.walk(srcdir):
    for f in fs: _files.setdefault(f.lower(), os.path.join(r_, f))
for im in bpy.data.images:
    try:
        if im.source != 'FILE' or im.packed_file: continue
        ok = im.has_data or (im.size[0] > 0)
        if not ok:
            nm = os.path.basename(bpy.path.abspath(im.filepath)).lower() or im.name.lower()
            cand = _files.get(nm)
            if not cand:
                stem = os.path.splitext(nm)[0]
                cand = next((p for k, p in _files.items() if os.path.splitext(k)[0] == stem and k.endswith(('.png', '.jpg', '.jpeg', '.tga', '.bmp', '.webp', '.tif', '.tiff'))), None)
            if cand: im.filepath = cand; im.reload()
    except Exception as e:
        log('image fix failed', im.name, e)

sc = bpy.context.scene
dg = bpy.context.evaluated_depsgraph_get()
DROP_OBJ = rx(CFG.get('dropObj'))
DROP_MAT = rx(CFG.get('dropMat'))
objs = [o for o in sc.objects if o.type == 'MESH' and o.visible_get() and not o.hide_render and not (DROP_OBJ and DROP_OBJ.search(o.name))]
log('objects', len(objs))

# ------------------------------------------------------------------ material info
def principled(m):
    if not m or not m.use_nodes or not m.node_tree: return None
    return next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
def linked_image(inp):
    if inp is None or not inp.links: return None
    seen = 0; n = inp.links[0].from_node
    while n is not None and seen < 8:
        seen += 1
        if n.type == 'TEX_IMAGE' and n.image: return n.image
        nxt = None
        for i in n.inputs:
            if i.links and i.type in ('RGBA', 'VALUE', 'VECTOR') and i.name not in ('Vector',):
                nxt = i.links[0].from_node; break
        n = nxt
    return None
def linked_channel(inp):
    """(image, channel) feeding a scalar input (Roughness / Metallic), through Separate Color nodes"""
    if inp is None or not inp.links: return None
    l = inp.links[0]; n = l.from_node; ch = 0
    for _ in range(6):
        if n.type == 'TEX_IMAGE' and n.image: return (n.image, ch if l.from_socket.name != 'Alpha' else 3)
        if n.type in ('SEPRGB', 'SEPARATE_COLOR', 'SEPARATE_RGB'):
            ch = {'Red': 0, 'R': 0, 'Green': 1, 'G': 1, 'Blue': 2, 'B': 2}.get(l.from_socket.name, 0)
        nxt = next((i for i in n.inputs if i.links), None)
        if not nxt: return None
        l = nxt.links[0]; n = l.from_node
    return None
_imgcache = {}
def image_array(im, maxs=512):
    """-> float32 array (h, w, 4) linear-ish 0..1 (sRGB as stored; we treat albedo in sRGB space), or None"""
    if im is None: return None
    if im.name in _imgcache: return _imgcache[im.name]
    arr = None
    try:
        if im.size[0] > 0 and im.size[1] > 0:
            c = im.copy()
            s = max(c.size[0], c.size[1])
            if s > maxs: k = maxs / s; c.scale(max(2, int(c.size[0] * k)), max(2, int(c.size[1] * k)))
            w, h = c.size[0], c.size[1]
            buf = np.empty(w * h * 4, dtype=np.float32); c.pixels.foreach_get(buf)
            arr = buf.reshape(h, w, 4).copy()
            if im.colorspace_settings.name.lower().startswith('srgb') and not im.is_float:
                rgb = arr[:, :, :3]; arr[:, :, :3] = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
            bpy.data.images.remove(c)
    except Exception as e:
        log('image read failed', im.name, e)
    _imgcache[im.name] = arr
    return arr
def mat_info(m):
    d = {'name': m.name if m else '', 'base': (0.6, 0.6, 0.6, 1.0), 'metal': 0.0, 'rough': 0.5, 'alpha': 1.0, 'trans': 0.0, 'img': None, 'aimg': False, 'emis': 0.0}
    if m is None: return d
    b = principled(m)
    if b is None:
        dc = tuple(m.diffuse_color); d['base'] = dc; d['alpha'] = dc[3]
        if m.use_nodes and m.node_tree:
            for n_ in m.node_tree.nodes:
                if n_.type in ('BSDF_DIFFUSE', 'BSDF_GLOSSY', 'EMISSION', 'BSDF_TRANSPARENT', 'BSDF_GLASS') and 'Color' in n_.inputs:
                    d['base'] = tuple(n_.inputs['Color'].default_value); d['img'] = linked_image(n_.inputs['Color'])
                    if n_.type in ('BSDF_TRANSPARENT', 'BSDF_GLASS'): d['alpha'] = 0.3
                    if n_.type == 'BSDF_GLOSSY': d['metal'] = 1.0; d['rough'] = n_.inputs['Roughness'].default_value if 'Roughness' in n_.inputs else 0.1
                    break
        d['metal'] = getattr(m, 'metallic', 0.0); d['rough'] = getattr(m, 'roughness', 0.5)
        return d
    g = lambda k: b.inputs[k] if k in b.inputs else None
    d['base'] = tuple(b.inputs['Base Color'].default_value)
    bc = b.inputs['Base Color']
    if bc.links:
        n_ = bc.links[0].from_node
        if n_.type == 'RGB': d['base'] = tuple(n_.outputs[0].default_value)
        elif n_.type in ('GROUP', 'MIX', 'MIX_RGB', 'HUE_SAT', 'BRIGHTCONTRAST', 'GAMMA', 'INVERT', 'VALTORGB'):
            for i in n_.inputs:
                if i.type == 'RGBA' and not i.links: d['base'] = tuple(i.default_value); break
    d['img'] = linked_image(b.inputs['Base Color'])
    d['metal'] = b.inputs['Metallic'].default_value; d['rough'] = b.inputs['Roughness'].default_value
    d['rimg'] = linked_channel(b.inputs['Roughness']); d['mimg'] = linked_channel(b.inputs['Metallic'])
    d['alpha'] = b.inputs['Alpha'].default_value
    d['aimg'] = bool(g('Alpha') and g('Alpha').links)
    tr = g('Transmission Weight') or g('Transmission')
    d['trans'] = tr.default_value if tr else 0.0
    es = g('Emission Strength'); ec = g('Emission Color') or g('Emission')
    if es and ec: d['emis'] = es.default_value * max(ec.default_value[:3]) if not ec.links else es.default_value
    # blend mode alone (alpha blend with alpha 1) does not make glass
    return d

# ------------------------------------------------------------------ 2. join (evaluated meshes, world space)
PRE = CFG.get('preTris', 450000)
_tot = 0
for o in objs:
    try: _tot += sum(len(p.vertices) - 2 for p in o.evaluated_get(dg).data.polygons)
    except Exception: pass
if _tot > PRE * 1.2:
    k = PRE / _tot
    for o in objs:
        n = len(o.data.polygons)
        if n < 1500 or o.data.users > 1: continue
        try:
            bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
            md = o.modifiers.new('pre', 'DECIMATE'); md.ratio = max(0.02, k); md.use_collapse_triangulate = True
        except Exception as e: log('pre-decimate skip', o.name, e)
    dg = bpy.context.evaluated_depsgraph_get(); dg.update()
    log('pre-decimate', _tot, 'ratio', round(k, 3))
bm = bmesh.new()
mats = []; mindex = {}
face_obj = []
uv_name = 'UVMap'
for oi, o in enumerate(objs):
    eo = o.evaluated_get(dg)
    try: me0 = bpy.data.meshes.new_from_object(eo, preserve_all_data_layers=False, depsgraph=dg)
    except Exception as e: log('skip', o.name, e); continue
    if len(me0.polygons) == 0: bpy.data.meshes.remove(me0); continue
    me0.transform(o.matrix_world)
    if o.matrix_world.determinant() < 0: me0.flip_normals()
    while len(me0.uv_layers) > 1: me0.uv_layers.remove(me0.uv_layers[-1])
    if len(me0.uv_layers) == 0: me0.uv_layers.new(name=uv_name)
    me0.uv_layers[0].name = uv_name
    # material slot -> global index (slot list of the evaluated object; mesh-linked fallbacks)
    slots = [s.material for s in eo.material_slots] or list(me0.materials) or [None]
    loc = []
    for m in slots:
        if m not in mindex: mindex[m] = len(mats); mats.append(m)
        loc.append(mindex[m])
    n0 = len(bm.faces)
    bm.from_mesh(me0)
    bm.faces.ensure_lookup_table()
    for fi in range(n0, len(bm.faces)):
        f = bm.faces[fi]; f.material_index = loc[min(f.material_index, len(loc) - 1)]
    face_obj += [oi] * (len(bm.faces) - n0)
    bpy.data.meshes.remove(me0)
log('joined faces', len(bm.faces), 'mats', len(mats))
minfo = [mat_info(m) for m in mats]
for rx_, path in (CFG.get('texOverride') or {}).items():
    for i_, inf in enumerate(minfo):
        if re.search(rx_, inf['name'], re.I) and inf['img'] is not None:
            p_ = os.path.join(os.path.dirname(__file__), path)
            im_ = bpy.data.images.load(p_); inf['img'].filepath = p_; inf['img'].reload(); log('texture override', inf['name'], path)
TEXSLOTS = rx(CFG.get('texSlots'))
objnames = [o.name for o in objs]

# drop faces by material / object regex now (badges, ground planes...), plus hard drops by name
AUTO_DROP = re.compile(r'badge|logo|emblem|manufacturer|manuf\b|\bmanu\b|brand|shadow|decal_brand|^plane$|ground|floor_plane', re.I)
if CFG.get('keepBadges'): AUTO_DROP = re.compile(r'shadow|^plane$|ground', re.I)
bm.faces.ensure_lookup_table()
kill = []
for f in bm.faces:
    mn = minfo[f.material_index]['name']; on = objnames[face_obj[f.index]]
    if AUTO_DROP.search(mn) or (DROP_MAT and DROP_MAT.search(mn)) or (DROP_OBJ and DROP_OBJ.search(on)):
        kill.append(f)
if kill:
    keep_obj = [face_obj[f.index] for f in bm.faces if f not in set(kill)] if False else None
    ks = set(k.index for k in kill)
    face_obj = [face_obj[i] for i in range(len(face_obj)) if i not in ks]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    log('dropped faces (badges/regex)', len(kill))

# ------------------------------------------------------------------ helpers: numpy views
def verts_np(bm_):
    bm_.verts.ensure_lookup_table()
    return np.array([v.co[:] for v in bm_.verts], dtype=np.float64)

# ground planes / huge flat stray objects: faces of an island that is flat and much larger than the car footprint
V = verts_np(bm)
lo, hi = V.min(0), V.max(0)
log('raw dims', np.round(hi - lo, 3).tolist())

# ------------------------------------------------------------------ islands (connected components over edges)
def islands(bm_):
    bm_.verts.ensure_lookup_table(); bm_.edges.ensure_lookup_table(); bm_.faces.ensure_lookup_table()
    nv = len(bm_.verts)
    e = np.array([(ed.verts[0].index, ed.verts[1].index) for ed in bm_.edges], dtype=np.int64).reshape(-1, 2)
    lab = np.arange(nv, dtype=np.int64)
    if len(e):
        for _ in range(200):
            a, b = lab[e[:, 0]], lab[e[:, 1]]
            m = np.minimum(a, b)
            old = lab.copy()
            np.minimum.at(lab, e[:, 0], m); np.minimum.at(lab, e[:, 1], m)
            lab = lab[lab]; lab = lab[lab]
            if np.array_equal(old, lab): break
    return lab
# merge coincident verts first (parts exported as triangle soup would otherwise be one island per triangle)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.00002 * max(1e-6, float(np.max(hi - lo))))

# ------------------------------------------------------------------ 3. orientation + scale
# length axis = longer of X/Y; up = Z (all our sources are Z-up after import)
V = verts_np(bm); lo, hi = V.min(0), V.max(0); ext = hi - lo
lenAx = 0 if ext[0] > ext[1] else 1
# front cue: centroid of front-named vs rear-named material faces along the length axis
FRONT = re.compile(r'head|front|grill|grille|radiat|hl\b|frontglass|windshield|fog|drl', re.I)
REAR = re.compile(r'tail|rear|brake ?light|break ?light|backlight|back ?light|stop|reverse|trunk|exhaust|muffler|rearlamp|tl\b|red ?glass|red ?gls', re.I)
bm.faces.ensure_lookup_table()
fsum = [0.0, 0]; rsum = [0.0, 0]
for f in bm.faces:
    nm = minfo[f.material_index]['name'] + ' ' + objnames[face_obj[f.index]]
    c = f.calc_center_median()[lenAx]
    if FRONT.search(nm) and not REAR.search(nm): fsum[0] += c; fsum[1] += 1
    elif REAR.search(nm) and not FRONT.search(nm): rsum[0] += c; rsum[1] += 1
fwd = CFG.get('fwd')
if not fwd:
    if fsum[1] > 20 and rsum[1] > 20:
        sgn = 1 if fsum[0] / fsum[1] > rsum[0] / rsum[1] else -1
        fwd = ('+' if sgn > 0 else '-') + 'xy'[lenAx]
    else:
        fwd = '-y' if lenAx == 1 else '+x'
    log('auto fwd', fwd, 'front cues', fsum[1], 'rear cues', rsum[1])
# rotation that maps the source forward to -Y (Blender), keeping Z up
ang = {'-y': 0.0, '+y': math.pi, '+x': -math.pi / 2, '-x': math.pi / 2}[fwd]
# rotate about Z: a vector along +x rotated by -90 deg -> -y. (Rz(theta) * (1,0,0) = (cos, sin, 0)); theta = -pi/2 -> (0,-1,0)
R = Matrix.Rotation(ang, 4, 'Z')
bm.transform(R)
if CFG.get('cropToPaint'):
    PR_ = rx(CFG.get('paint')) or re.compile(r'paint', re.I)
    bm.faces.ensure_lookup_table()
    pv = np.array([v.co[:] for f in bm.faces if PR_.search(minfo[f.material_index]['name']) for v in f.verts])
    if len(pv):
        plo, phi = pv.min(0), pv.max(0)
        lab_ = islands(bm); V_ = verts_np(bm); u_, inv_ = np.unique(lab_, return_inverse=True)
        mn_ = np.full((len(u_), 3), 1e9); mx_ = np.full((len(u_), 3), -1e9); np.minimum.at(mn_, inv_, V_); np.maximum.at(mx_, inv_, V_)
        ax = 1 if (phi[1] - plo[1]) > (phi[0] - plo[0]) else 0
        bad_ = (mx_[:, 2] > phi[2] + 0.06) | (mn_[:, ax] < plo[ax] - 0.15) | (mx_[:, ax] > phi[ax] + 0.15)
        dead = [f for f in bm.faces if bad_[inv_[f.verts[0].index]]]
        ks = set(f.index for f in dead); face_obj = [face_obj[i] for i in range(len(face_obj)) if i not in ks]
        bmesh.ops.delete(bm, geom=dead, context='FACES'); log('cropped to paint box, faces', len(dead))
V = verts_np(bm); lo, hi = V.min(0), V.max(0)
L0 = hi[1] - lo[1]
L = CFG.get('L')
s = (L / L0) if L else 1.0
if CFG.get('scale'): s = CFG['scale']
bm.transform(Matrix.Scale(s, 4))
V = verts_np(bm); lo, hi = V.min(0), V.max(0)
bm.transform(Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, 0)))  # center in X / Y before the wheel search
V = verts_np(bm); lo, hi = V.min(0), V.max(0)
log('fwd', fwd, 'scale', round(s, 5), 'dims', np.round(hi - lo, 3).tolist())

# ------------------------------------------------------------------ static props (a car under a cover): no wheels, one trim slot
if CFG.get('static'):
    V = verts_np(bm); lo, hi = V.min(0), V.max(0)
    bm.transform(Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2])))
    uvl = bm.loops.layers.uv.get(uv_name) or bm.loops.layers.uv.verify()
    cl = bm.loops.layers.float_color.new('SLcol')
    for f in bm.faces:
        info = minfo[f.material_index]; arr = image_array(info['img']) if info['img'] is not None else None
        ra = image_array(info['rimg'][0]) if info.get('rimg') else None
        for lp in f.loops:
            uv = lp[uvl].uv
            if arr is not None:
                h_, w_ = arr.shape[0], arr.shape[1]; t = arr[int((uv[1] % 1) * h_) % h_, int((uv[0] % 1) * w_) % w_]
            else: t = (1, 1, 1, 1)
            b = info['base']; rough = info['rough']
            if ra is not None: h_, w_ = ra.shape[0], ra.shape[1]; rough = float(ra[int((uv[1] % 1) * h_) % h_, int((uv[0] % 1) * w_) % w_][info['rimg'][1]])
            lp[cl] = (b[0] * t[0], b[1] * t[1], b[2] * t[2], min(1.0, max(0.02, rough)) * 0.49)
        f.material_index = 2
    sm = []
    for nm in ['S_paint', 'S_glass', 'S_trim', 'S_lamp']:
        m = bpy.data.materials.new(nm); m.use_nodes = True; sm.append(m)
    me_ = bpy.data.meshes.new('body'); [me_.materials.append(m) for m in sm]; bm.to_mesh(me_); bm.free()
    src_o = bpy.data.objects.new('src', me_); sc.collection.objects.link(src_o)
    for o in list(sc.objects):
        if o is not src_o: bpy.data.objects.remove(o, do_unlink=True)
    def _tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)
    outs = []
    for i, tgt in enumerate(CFG.get('tris') or [16000, 4000, 900]):
        o = bpy.data.objects.new('body%d' % i, me_.copy()); sc.collection.objects.link(o)
        if _tris(o) > tgt * 1.1:
            bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
            md = o.modifiers.new('d', 'DECIMATE'); md.ratio = tgt / _tris(o); bpy.ops.object.modifier_apply(modifier='d')
            md = o.modifiers.new('tn', 'DATA_TRANSFER'); md.object = src_o; md.use_loop_data = True; md.data_types_loops = {'CUSTOM_NORMAL'}; md.loop_mapping = 'POLYINTERP_NEAREST'
            bpy.ops.object.modifier_apply(modifier='tn')
        o.data.color_attributes.active_color = o.data.color_attributes.get('SLcol'); outs.append(o)
    bpy.data.objects.remove(src_o, do_unlink=True)
    P = np.array([v.co[:] for v in outs[0].data.vertices]); lo0, hi0 = P.min(0), P.max(0)
    out = os.path.join(OUTDIR, KEY + '.glb')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_yup=True, export_texcoords=True, export_normals=True, export_materials='EXPORT',
        export_vertex_color='NAME', export_vertex_color_name='SLcol', export_all_vertex_colors=False, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
        export_animations=False, export_image_format='NONE')
    man = {'key': KEY, 'static': True, 'dims': {'L': round(float(hi0[1] - lo0[1]), 3), 'W': round(float(hi0[0] - lo0[0]), 3), 'H': round(float(hi0[2]), 3)},
           'tris': {'lod%d' % i: _tris(o) for i, o in enumerate(outs)}, 'bytes': os.path.getsize(out), 'cfg': CFG}
    json.dump(man, open(os.path.join(OUTDIR, KEY + '.json'), 'w'), indent=1)
    log('DONE static', json.dumps(man['dims']), man['tris'])
    raise SystemExit(0)

# ------------------------------------------------------------------ 4. wheels
lab = islands(bm)
V = verts_np(bm)
uniq, inv = np.unique(lab, return_inverse=True)
nI = len(uniq)
imin = np.full((nI, 3), 1e9); imax = np.full((nI, 3), -1e9)
np.minimum.at(imin, inv, V); np.maximum.at(imax, inv, V)
icnt = np.bincount(inv, minlength=nI)
gz = V[:, 2].min()
isz = imax - imin
# tire candidates: wheel-sized, round in side view (Y ~ Z extent), narrow in X, touching the ground, off center
cand = []
for i in range(nI):
    dx, dy, dz = isz[i]
    if not (0.42 < dz < 1.5): continue
    if not (0.8 < dy / dz < 1.2): continue
    if not (0.08 < dx < (1.05 if dz > 0.75 else 0.75)): continue
    if imin[i, 2] > gz + 0.12 * dz: continue
    cx = (imin[i, 0] + imax[i, 0]) / 2
    if abs(cx) < 0.25: continue
    cand.append(i)
# merge candidates whose centers coincide (tire made of several islands) into wheel clusters
wheels = []
for i in sorted(cand, key=lambda k: -isz[k, 2]):
    c = (imin[i] + imax[i]) / 2
    for w in wheels:
        if np.linalg.norm(w['c'][[0, 1]] - c[[0, 1]]) < 0.35 * w['r'] * 2:
            w['isl'].append(i); w['lo'] = np.minimum(w['lo'], imin[i]); w['hi'] = np.maximum(w['hi'], imax[i]); break
    else:
        wheels.append({'c': c.copy(), 'r': isz[i, 2] / 2, 'isl': [i], 'lo': imin[i].copy(), 'hi': imax[i].copy()})
for w in wheels:
    w['c'] = (w['lo'] + w['hi']) / 2; w['r'] = (w['hi'][2] - w['lo'][2]) / 2; w['w'] = w['hi'][0] - w['lo'][0]
# keep the ones near the ground with plausible size, both sides
rmed = float(np.median([w['r'] for w in wheels])) if wheels else 0
wheels = [w for w in wheels if abs(w['r'] - rmed) < 0.25 * rmed]
log('wheel clusters', len(wheels), [(round(w['c'][0], 2), round(w['c'][1], 2), round(w['r'], 3)) for w in wheels])
if len(wheels) == 2:  # one axle found: the other is a tandem / dual block in one island -> virtual physics wheels, tires stay on the body
    for i in range(nI):
        dx, dy, dz = isz[i]
        if not (0.42 < dz < 1.5 and 1.5 < dy / dz < 3.2 and 0.1 < dx < 0.9 and imin[i, 2] < gz + 0.12 * dz): continue
        c_ = (imin[i] + imax[i]) / 2
        if abs(c_[0]) < 0.25 or abs(c_[1] - wheels[0]['c'][1]) < 1.0: continue
        wheels.append({'c': c_.copy(), 'r': dz / 2, 'isl': [], 'lo': imin[i].copy(), 'hi': imax[i].copy(), 'virtual': True})
    for w in wheels: w.setdefault('w', w['hi'][0] - w['lo'][0])
    log('virtual wheels', sum(1 for w in wheels if w.get('virtual')))
if len(wheels) == 3:  # one tire merged into something else: mirror its axle partner (its parts stay on the body)
    ys = [w['c'][1] for w in wheels]
    for w in list(wheels):
        partner = [o for o in wheels if o is not w and abs(o['c'][1] - w['c'][1]) < 0.3]
        if not partner:
            m_ = {k: (v.copy() if hasattr(v, 'copy') else v) for k, v in w.items()}
            m_['c'][0] = -m_['c'][0]; lo_, hi_ = w['lo'].copy(), w['hi'].copy(); m_['lo'] = np.array([-hi_[0], lo_[1], lo_[2]]); m_['hi'] = np.array([-lo_[0], hi_[1], hi_[2]]); m_['isl'] = []
            wheels.append(m_); log('mirrored a missing wheel'); break
if len(wheels) < 4:
    raise SystemExit(f'[cars] {KEY} FAIL: found {len(wheels)} wheels')
# axles: group by Y
wheels.sort(key=lambda w: w['c'][1])
axles = []
for w in wheels:
    if axles and abs(axles[-1][0]['c'][1] - w['c'][1]) < 0.4: axles[-1].append(w)
    else: axles.append([w])
axles = [a for a in axles if any(w['c'][0] > 0 for w in a) and any(w['c'][0] < 0 for w in a)]
if len(axles) < 2: raise SystemExit(f'[cars] {KEY} FAIL: axles {len(axles)}')
frontAx = axles[0]          # most negative Y = front (forward is -Y)
rearAxes = axles[1:]
yF = float(np.mean([w['c'][1] for w in frontAx]))
yR = float(np.mean([w['c'][1] for a in rearAxes for w in a]))
# members of each wheel: islands entirely inside its cylinder
inside_isl = {}
ic = (imin + imax) / 2
for wi, w in enumerate(wheels):
    c = w['c']; r = w['r']; hw = max(w['w'] / 2, 0.05)
    # island bbox fully inside the cylinder (radial test on the bbox corners in YZ), x within tire span (+ inward room for hubs/calipers)
    xin = max(hw + 0.16, 0.2)
    for i in range(nI):
        if i in inside_isl: continue
        if imin[i, 0] < c[0] - xin and c[0] > 0 and imin[i, 0] < c[0] - hw - 0.16: continue
        if imax[i, 0] > c[0] + xin and c[0] < 0 and imax[i, 0] > c[0] + hw + 0.16: continue
        if imin[i, 0] < c[0] - hw - 0.18 or imax[i, 0] > c[0] + hw + 0.18: continue
        dy = max(abs(imin[i, 1] - c[1]), abs(imax[i, 1] - c[1])); dz = max(abs(imin[i, 2] - c[2]), abs(imax[i, 2] - c[2]))
        if math.hypot(dy, dz) > r * 1.06 and (dy > r * 1.03 or dz > r * 1.03): continue
        if dy > r * 1.03 or dz > r * 1.03: continue
        inside_isl[i] = wi
# calipers: inside a wheel, not around the axis, not part of a rotational repeat (spokes / lug nuts repeat >= 3 times)
caliper = set()
for wi, w in enumerate(wheels):
    c = w['c']; r = w['r']
    mem = [i for i, k in inside_isl.items() if k == wi]
    offax = []
    for i in mem:
        around = imin[i, 1] < c[1] - 0.02 * r and imax[i, 1] > c[1] + 0.02 * r and imin[i, 2] < c[2] - 0.02 * r and imax[i, 2] > c[2] + 0.02 * r
        if around: continue
        rad = math.hypot(ic[i, 1] - c[1], ic[i, 2] - c[2])
        size = float(np.max(isz[i]))
        offax.append((i, rad, size, icnt[i]))
    groups = {}
    for (i, rad, size, n) in offax: groups.setdefault((n, round(rad / max(r * 0.06, 0.005))), []).append(i)
    for (i, rad, size, n) in offax:
        g = groups[(n, round(rad / max(r * 0.06, 0.005)))]
        if len(g) <= 2 and size > 0.05 and rad > 0.2 * r and size > 0.12 * r: caliper.add(i)
# per vertex: wheel id or -1, caliper flag
vw = np.full(len(V), -1, dtype=np.int64); vcal = np.zeros(len(V), dtype=bool)
isl_w = np.full(nI, -1); isl_c = np.zeros(nI, dtype=bool)
for i, wi in inside_isl.items(): isl_w[i] = wi; isl_c[i] = i in caliper
vw = isl_w[inv]; vcal = isl_c[inv]
log('wheel members', {wi: sum(1 for k in inside_isl.values() if k == wi) for wi in range(len(wheels))}, 'calipers', len(caliper))

# ------------------------------------------------------------------ frame: ground 0, mid-wheelbase 0, centered in X
xc = float(np.mean([w['c'][0] for w in wheels]))
ymid = (yF + yR) / 2
gz = min(float(w['lo'][2]) for w in wheels)
bm.transform(Matrix.Translation((-xc, -ymid, -gz)))
for w in wheels:
    w['c'] = w['c'] - np.array([xc, ymid, gz]); w['lo'] -= np.array([xc, ymid, gz]); w['hi'] -= np.array([xc, ymid, gz])
yF -= ymid; yR -= ymid
V = verts_np(bm)

# ------------------------------------------------------------------ 5. material slots
PAINT = rx(CFG.get('paint')) or re.compile(r'car ?paint|body ?paint|bodypaint|^paint|paint$|paint color|paint mat|main paint|\bpaint\b|primary$|^primary|exterior colou?r|^coloured|coloured material|^body$|^ext$|carpaint', re.I)
GLASS = re.compile(r'glass|window|windscreen|windshield|\bgls\b|glas\b|vidrio|r_glass|film', re.I)
LENSY = re.compile(r'light|lamp|head|tail|rear|lens|red|orange|amber|oraange|fog|indicator|signal|brake|break|reverse|reflect', re.I)
HEAD = re.compile(r'head|front ?light|frontlamp|hl\b|projector|\bled\b|drl|white ?light|light ?f\b', re.I)
TAIL = re.compile(r'tail|rear ?light|rearlamp|rear ?lamp|back ?light|backlight|stop|brake ?light|break ?light|breaklight|brakelight|rearlight|\btl\b|red', re.I)
REV = re.compile(r'reverse|backup', re.I)
IND = re.compile(r'indicator|signal|blinker|turn|amber|orange|oraange|indi\b|side ?marker', re.I)
FOG = re.compile(r'fog', re.I)
LIGHT = re.compile(r'light|lamp|lens|\bled\b|\bdrl\b', re.I)
PLATE = re.compile(r'plate|license|licence|platnomor|number', re.I)
CHROME = re.compile(r'chrome|crom|alum|silver|polish|mirror|miroir|hg\b|metal|steel|exhaust|muffler', re.I)
RUBBER = re.compile(r'tire|tyre|rubber|tread|seal', re.I)
INTER = re.compile(r'interior|inerior|\bint\b|seat|leather|cuero|dash|steer|fabric|fablic|cloth|carpet|tapete|tela|stitch|costura|belt|chair|silla|monitor|lcd|screen|button|speaker|needle|wood|cabin|sieges|roof ?lining|lining|suit ', re.I)
ENGINE = re.compile(r'engine|motor', re.I)
over = [(re.compile(k, re.I), v) for k, v in (CFG.get('slots') or {}).items()]
def lum(c): return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
def tex_avg(info):
    a = image_array(info['img'])
    if a is None: return None
    return a.reshape(-1, 4).mean(0)
slot_of = []
for mi, info in enumerate(minfo):
    n = info['name']; sl = None
    for r_, v in over:
        if r_.search(n):
            sl = v
            if '#' in v:
                sl, hx = v.split('#'); c_ = int(hx, 16)
                lin = lambda x: (x / 255) / 12.92 if x / 255 <= 0.04045 else (((x / 255) + 0.055) / 1.055) ** 2.4
                info['base'] = (lin(c_ >> 16 & 255), lin(c_ >> 8 & 255), lin(c_ & 255), 1.0); info['img'] = None
            break
    if sl is None:
        isglass = info['alpha'] < 0.92 or (info['trans'] > 0.3 and not SRC.lower().endswith('.obj')) or GLASS.search(n)
        if PLATE.search(n) and not GLASS.search(n): sl = 'plate'
        elif isglass and LENSY.search(n) and not re.search(r'window|windscreen|windshield|frontglass|rearglass|side glass|dark glass|^glass$', n, re.I):
            base = info['base']; ta = tex_avg(info) if info['img'] else None
            col = ta if ta is not None else base
            redish = col[0] > col[1] * 1.6 and col[0] > 0.25 and col[0] > col[2] * 1.6
            orang = col[0] > 0.35 and col[1] > 0.15 and col[1] < col[0] * 0.8 and col[2] < col[1] * 0.6
            sl = 'lamp:tail' if (redish or re.search(r'red|tail|rear|brake|break', n, re.I)) and not IND.search(n) else 'lamp:amber' if (orang or IND.search(n)) else 'lens'
        elif isglass: sl = 'glass'
        elif ENGINE.search(n) and not CFG.get('keepEngine'): sl = 'drop'
        elif PAINT.search(n) and not INTER.search(n): sl = 'paint'
        elif LIGHT.search(n) or HEAD.search(n) and not INTER.search(n):
            sl = 'lamp:auto'
        elif REV.search(n): sl = 'lamp:reverse'
        elif IND.search(n) and not INTER.search(n): sl = 'lamp:amber'
        elif RUBBER.search(n): sl = 'trim:rubber'
        elif CHROME.search(n) and not INTER.search(n): sl = 'trim:chrome'
        elif INTER.search(n): sl = 'trim:interior'
        else: sl = 'trim'
    slot_of.append(sl)
# paint by area when no material matched by name: the largest opaque, non-dark exterior material above the wheel centers
bm.faces.ensure_lookup_table()
area = np.zeros(len(minfo)); hz = np.zeros(len(minfo))
rW = float(np.mean([w['r'] for w in wheels]))
for f in bm.faces:
    a_ = f.calc_area(); area[f.material_index] += a_; hz[f.material_index] += a_ * f.calc_center_median()[2]
# untextured near-white trim: a large exterior one is body paint split into several materials (roof, bumpers), a small one is
# an unset 3ds Max / FBX default -> black plastic (real cars have almost no white trim)
if not CFG.get('keepWhite') and not CFG.get('textured'):
    for mi, info in enumerate(minfo):
        if slot_of[mi] != 'trim' or info['img'] is not None or any(r_.search(info['name']) for r_, _ in over): continue
        if lum(info['base']) < 0.55 or info['metal'] > 0.5: continue
        if area[mi] > CFG.get('whitePaintArea', 0.5) and hz[mi] / max(area[mi], 1e-6) > rW * 1.2: slot_of[mi] = 'paint'
        else: info['base'] = (0.025, 0.025, 0.027, 1.0); info['rough'] = max(info['rough'], 0.55)
    log('white trim fixed')
if (not any(s == 'paint' for s in slot_of) and not CFG.get('textured') and not CFG.get('noPaint')) or CFG.get('paintByArea'):
    best, ba = None, 0
    for mi, info in enumerate(minfo):
        if not slot_of[mi].startswith('trim') or slot_of[mi] in ('trim:rubber', 'trim:interior'): continue
        if area[mi] <= 0 or hz[mi] / area[mi] < rW * 1.4: continue
        col = info['base']; ta = tex_avg(info) if info['img'] else None
        if ta is not None: col = [col[k] * ta[k] for k in range(3)]
        if lum(col) < 0.06 and not CFG.get('paintDark'): continue
        if area[mi] > ba: ba, best = area[mi], mi
    if best is not None:
        for mi in range(len(minfo)):
            if mi == best: slot_of[mi] = 'paint'
        log('paint by area ->', minfo[best]['name'])
log('slots', {minfo[i]['name']: (slot_of[i], round(float(area[i]), 2), 'img' if minfo[i]['img'] else '', 'aimg' if minfo[i]['aimg'] else '', round(minfo[i]['metal'],2), round(minfo[i]['rough'],2)) for i in range(len(minfo)) if area[i] > 0})

# ------------------------------------------------------------------ per-corner colors (rgb = albedo, a = packed param)
uvl = bm.loops.layers.uv.get(uv_name) or bm.loops.layers.uv.verify()
for _l in list(bm.loops.layers.float_color.keys()) + list(bm.loops.layers.color.keys()) if hasattr(bm.loops.layers, 'color') else []: pass
col_layer = bm.loops.layers.float_color.new('SLcol')
SLOTS = ['paint', 'trim', 'glass', 'lamp']
L_ = hi[1] - lo[1]
halfL = (max(v[1] for v in [w['c'] for w in wheels]) - min(v[1] for v in [w['c'] for w in wheels])) / 2
def sample(arr, u, v):
    h, w_ = arr.shape[0], arr.shape[1]
    x = int((u % 1.0) * w_) % w_; y = int((v % 1.0) * h) % h
    return arr[y, x]
def pack_rm(rough, metal):
    rough = min(1.0, max(0.02, rough))
    return 0.5 + rough * 0.49 if metal > 0.5 else rough * 0.49
kill = []
plate_faces = []
TOPZ = float(verts_np(bm)[:, 2].max())
TEXTURED = bool(CFG.get('textured')); tex_slot = {}
if CFG.get('recalcNormals'):  # sources with flipped panels (rendered from behind -> invisible / black)
    bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if slot_of[f.material_index] in ('paint',) or slot_of[f.material_index].startswith('trim')])
    log('normals recalculated')
_pin, _ptot = 0.0, 1e-9
for f in bm.faces:
    if slot_of[f.material_index] != 'paint': continue
    a_ = f.calc_area(); _ptot += a_; n_ = f.normal; c_ = f.calc_center_median()
    if (abs(n_[0]) > 0.6 and n_[0] * c_[0] < 0 and abs(c_[0]) > 0.45) or (n_[2] < -0.6 and c_[2] > 0.62 * TOPZ): _pin += a_
INNER_OK = not CFG.get('keepInner') and _pin / _ptot < 0.3
log('inner paint share', round(_pin / _ptot, 3), 'removing' if INNER_OK else 'kept')
for f in bm.faces:
    mi = f.material_index; info = minfo[mi]; sl = slot_of[mi]
    if sl == 'drop': kill.append(f); continue
    _wf = int(vw[f.verts[0].index]) if f.verts[0].index < len(vw) else -1
    if sl == 'paint' and _wf >= 0: sl = 'trim'                      # wheels are never body paint
    if sl == 'paint' and INNER_OK:
        n_ = f.normal; c_ = f.calc_center_median()
        if (abs(n_[0]) > 0.6 and n_[0] * c_[0] < 0 and abs(c_[0]) > 0.45) or (n_[2] < -0.6 and c_[2] > 0.62 * TOPZ):
            kill.append(f); continue                                 # inner skins of doors / roof: hidden, poke through after decimation
    arr = image_array(info['img']) if info['img'] is not None and sl not in ('paint',) else None
    base = info['base']
    cz = f.calc_center_median()
    wfi = int(vw[f.verts[0].index]) if f.verts[0].index < len(vw) else -1
    if sl == 'plate':
        plate_faces.append(f); slot = 'lamp'
    if arr is not None and sl.startswith('trim') and info['aimg']:
        al = sum(sample(arr, lp[uvl].uv[0], lp[uvl].uv[1])[3] for lp in f.loops) / len(f.loops)
        if al < 0.06: kill.append(f); continue          # fully cut out (decal holes)
        if al < 0.85: sl = 'glass'
    for lp in f.loops:
        if arr is not None:
            uv = lp[uvl].uv; t = sample(arr, uv[0], uv[1])
            rgb = (base[0] * t[0], base[1] * t[1], base[2] * t[2]); ta = t[3]
        else:
            rgb = (base[0], base[1], base[2]); ta = 1.0
        if wfi >= 0 and sl.startswith('trim') and lum(rgb) > 0.4 and not sl.endswith('chrome'):
            wc_ = wheels[wfi]['c']; rad_ = math.hypot(lp.vert.co[1] - wc_[1], lp.vert.co[2] - wc_[2])
            if rad_ > 0.8 * wheels[wfi]['r']: rgb = (0.03, 0.03, 0.032); sl = 'trim:rubber'   # an unset white tire
        if sl == 'paint': a = 0.0; rgb = (1, 1, 1)
        elif sl.startswith('trim'):
            rough, metal = info['rough'], info['metal']
            uv = lp[uvl].uv
            if info.get('rimg'):
                ra = image_array(info['rimg'][0]); rough = float(sample(ra, uv[0], uv[1])[info['rimg'][1]]) if ra is not None else rough
            if info.get('mimg'):
                ma = image_array(info['mimg'][0]); metal = float(sample(ma, uv[0], uv[1])[info['mimg'][1]]) if ma is not None else metal
            if sl == 'trim:chrome': rough, metal = min(rough, 0.18), 1.0
            elif sl == 'trim:rubber': rough, metal = max(rough, 0.82), 0.0; rgb = tuple(min(c, 0.06) for c in rgb)
            elif sl == 'trim:interior': rough = max(rough, 0.55); metal = min(metal, 0.3)
            if metal > 0.5 and lum(rgb) < 0.25 and sl == 'trim:chrome': rgb = (0.75, 0.76, 0.78)
            a = pack_rm(rough, metal)
        elif sl == 'glass': a = 1.0
        elif sl == 'lens': a = 0.0
        elif sl == 'plate': a = LAMP['plate'] / 16.0; rgb = (1, 1, 1)
        else:  # lamp:<kind>
            kind = sl.split(':')[1]
            gy = -cz[1]  # game z (forward +)
            if kind == 'auto':
                redish = rgb[0] > rgb[1] * 1.5 and rgb[0] > rgb[2] * 1.5 and rgb[0] > 0.2
                orang = rgb[0] > 0.3 and rgb[1] > 0.12 and rgb[1] < rgb[0] * 0.75 and rgb[2] < rgb[1] * 0.55
                if orang: kind = 'amber'
                elif gy < 0: kind = 'tail' if redish or TAIL.search(info['name']) else 'reverse' if lum(rgb) > 0.55 else 'tail'
                else: kind = 'fog' if FOG.search(info['name']) else 'head'
            if cz[2] > TOPZ - 0.32 and CFG.get('police'):  # roof light bar / beacons: red and blue strobes, amber = sign
                blu = rgb[2] > rgb[0] * 1.4 and rgb[2] > 0.15
                red = rgb[0] > rgb[2] * 1.4 and rgb[0] > 0.15
                kind = 'blue' if blu else 'red' if red else ('red' if cz[0] > 0 else 'blue') if CFG.get('police') else kind
            if kind == 'amber': kind = 'blinkL' if cz[0] > 0 else 'blinkR'
            if kind == 'tail' and gy > 0: kind = 'blinkL' if cz[0] > 0 else 'blinkR'  # red/amber lens at the front = side marker
            a = LAMP.get(kind, LAMP['head']) / 16.0
            if kind in ('tail', 'tailLed'): rgb = (max(rgb[0], 0.35), rgb[1] * 0.5, rgb[2] * 0.5)
        lp[col_layer] = (rgb[0], rgb[1], rgb[2], a)
    f.material_index = {'paint': 0, 'glass': 1, 'lens': 1}.get(sl.split(':')[0], 3 if sl.startswith('lamp') or sl == 'plate' else 2)
    if (TEXTURED or (TEXSLOTS and TEXSLOTS.search(info['name']))) and f.material_index == 2 and info['img'] is not None and vw[f.verts[0].index] < 0:
        if mi not in tex_slot: tex_slot[mi] = 4 + len(tex_slot)
        f.material_index = tex_slot[mi]
        for lp in f.loops:
            c_ = lp[col_layer]; lp[col_layer] = (1.0, 1.0, 1.0, c_[3])
# remap: 0 paint, 1 glass, 2 trim, 3 lamp
if kill:
    ks = set(f.index for f in kill)
    vkeep = None
    bmesh.ops.delete(bm, geom=kill, context='FACES')
# planar UV for plates (plate region of the decal sheet is mapped in JS: uv 0..1 over the plate)
if plate_faces:
    pf = [f for f in plate_faces if f.is_valid]
    groups = {'f': [f for f in pf if f.calc_center_median()[1] < 0], 'r': [f for f in pf if f.calc_center_median()[1] >= 0]}
    for side, fs in groups.items():
        if not fs: continue
        P = np.array([lp.vert.co[:] for f in fs for lp in f.loops])
        x0, x1 = P[:, 0].min(), P[:, 0].max(); z0, z1 = P[:, 2].min(), P[:, 2].max()
        for f in fs:
            for lp in f.loops:
                u = (lp.vert.co[0] - x0) / max(1e-4, x1 - x0); v = (lp.vert.co[2] - z0) / max(1e-4, z1 - z0)
                if side == 'f': u = 1 - u  # front plate is seen from +game z: mirror so text reads left to right
                lp[uvl].uv = (u, v)
# lamp faces that are not plates: uv -> -1 (JS maps them to the white texel of the decal sheet)
pset = set(f for f in plate_faces if f.is_valid)
for f in bm.faces:
    if f.material_index == 3 and f not in pset:
        for lp in f.loops: lp[uvl].uv = (-1.0, -1.0)

# ------------------------------------------------------------------ split: body / wheels / calipers
slotmats = []
for nm in ['S_paint', 'S_glass', 'S_trim', 'S_lamp']:
    m = bpy.data.materials.new(nm); m.use_nodes = True; slotmats.append(m)
me_all = bpy.data.meshes.new('all')
for m in slotmats: me_all.materials.append(m)
for mi, si in sorted(tex_slot.items(), key=lambda x: x[1]):
    m = mats[mi].copy(); m.name = 'T_%d' % (si - 4)
    im = minfo[mi]['img']
    if im is not None and max(im.size) > 1024:
        k_ = 1024 / max(im.size); im.scale(max(4, int(im.size[0] * k_)), max(4, int(im.size[1] * k_)))
    me_all.materials.append(m)
bm.to_mesh(me_all); bm.free()
ob_all = bpy.data.objects.new('all', me_all); sc.collection.objects.link(ob_all)
# vertex -> wheel id (positions moved by the frame transform; recompute membership by island again on the final mesh)
bm2 = bmesh.new(); bm2.from_mesh(me_all)
lab2 = islands(bm2); V2 = verts_np(bm2)
u2, inv2 = np.unique(lab2, return_inverse=True); n2 = len(u2)
mn2 = np.full((n2, 3), 1e9); mx2 = np.full((n2, 3), -1e9)
np.minimum.at(mn2, inv2, V2); np.maximum.at(mx2, inv2, V2)
cnt2 = np.bincount(inv2, minlength=n2)
c2 = (mn2 + mx2) / 2
# match islands to the wheel membership found before by their bbox center (same geometry, translated)
old_c = ic - np.array([xc, ymid, gz])
key_old = {}
for i in range(nI):
    key_old.setdefault((int(icnt[i]), tuple(np.round(old_c[i], 3))), i)
isl2_w = np.full(n2, -1); isl2_c = np.zeros(n2, dtype=bool)
for j in range(n2):
    i = key_old.get((int(cnt2[j]), tuple(np.round(c2[j], 3))))
    if i is not None and isl_w[i] >= 0: isl2_w[j] = isl_w[i]; isl2_c[j] = isl_c[i]
vw2 = isl2_w[inv2]; vc2 = isl2_c[inv2]
bm2.free()
log('wheel verts', int((vw2 >= 0).sum()), 'caliper verts', int(vc2.sum()))
# brand badges modeled as geometry: small metal islands on the centerline of the nose / tail (grille star, trunk lettering)
if not CFG.get('keepBadges'):
    b3 = bmesh.new(); b3.from_mesh(me_all); b3.faces.ensure_lookup_table(); cl3 = b3.loops.layers.float_color.get('SLcol')
    fz_front, fz_rear = float(-V2[:, 1].min()), float(-V2[:, 1].max())
    metal = np.zeros(n2); cntf = np.zeros(n2); trimf = np.zeros(n2)
    for f in b3.faces:
        j = inv2[f.verts[0].index]
        a = sum(lp[cl3][3] for lp in f.loops) / len(f.loops)
        cntf[j] += 1; trimf[j] += f.material_index == 2; metal[j] += (a >= 0.5 and f.material_index == 2)
    diag = np.linalg.norm(mx2 - mn2, axis=1)
    gzc = -c2[:, 1]
    bad = (isl2_w < 0) & (diag < CFG.get('badgeMax', 0.26)) & ((np.abs(c2[:, 0]) < 0.33) | ((diag < 0.2) & (np.abs(c2[:, 0]) < 0.62))) & ((gzc > fz_front - 0.75) | (gzc < fz_rear + 0.75)) & (cntf > 0) & (metal > 0.6 * np.maximum(cntf, 1)) & (c2[:, 2] > 0.25)
    if bad.any():
        dead = [f for f in b3.faces if bad[inv2[f.verts[0].index]]]
        bmesh.ops.delete(b3, geom=dead, context='FACES'); b3.to_mesh(me_all)
        log('badge islands removed', int(bad.sum()), 'faces', len(dead))
        # vertex arrays changed: recompute per-vertex wheel ids on the new mesh by position match
        b3.free(); b4 = bmesh.new(); b4.from_mesh(me_all); lab4 = islands(b4); V4 = verts_np(b4)
        u4, inv4 = np.unique(lab4, return_inverse=True); n4 = len(u4)
        mn4 = np.full((n4, 3), 1e9); mx4 = np.full((n4, 3), -1e9); np.minimum.at(mn4, inv4, V4); np.maximum.at(mx4, inv4, V4)
        cnt4 = np.bincount(inv4, minlength=n4); c4 = (mn4 + mx4) / 2
        k2 = {(int(cnt2[j]), tuple(np.round(c2[j], 3))): j for j in range(n2)}
        w4 = np.full(n4, -1); cc4 = np.zeros(n4, dtype=bool)
        for j in range(n4):
            jj = k2.get((int(cnt4[j]), tuple(np.round(c4[j], 3))))
            if jj is not None: w4[j] = isl2_w[jj]; cc4[j] = isl2_c[jj]
        vw2 = w4[inv4]; vc2 = cc4[inv4]; b4.free()
    else: b3.free()

def extract(name, mask_v):
    """new object with the faces whose verts are all in mask_v"""
    b = bmesh.new(); b.from_mesh(me_all); b.verts.ensure_lookup_table()
    dead = [f for f in b.faces if not all(mask_v[v.index] for v in f.verts)]
    bmesh.ops.delete(b, geom=dead, context='FACES')
    loose = [v for v in b.verts if not v.link_faces]
    bmesh.ops.delete(b, geom=loose, context='VERTS')
    m = bpy.data.meshes.new(name); b.to_mesh(m); b.free()
    for mt in me_all.materials: m.materials.append(mt)
    o = bpy.data.objects.new(name, m); sc.collection.objects.link(o)
    return o
for nm in SLOTS: pass
# the four material slots on every output mesh

# front-left wheel = left (+X) and front (-Y)
def wid(front, left):
    best = None
    for i, w in enumerate(wheels):
        if (w['c'][0] > 0) != left: continue
        isf = abs(w['c'][1] - yF) < 0.4
        if isf != front: continue
        if best is None or (w['c'][1] < wheels[best]['c'][1] if not front else False): best = i
        if best is None: best = i
    return best
iFL, iFR, iRL, iRR = wid(True, True), wid(True, False), wid(False, True), wid(False, False)
if None in (iFL, iFR, iRL, iRR): raise SystemExit(f'[cars] {KEY} FAIL: wheel corners {iFL} {iFR} {iRL} {iRR}')
body = extract('body', vw2 < 0)
whl = extract('wheel', (vw2 == iFL) & ~vc2)
cal = extract('caliper', (vw2 == iFL) & vc2) if vc2[(vw2 == iFL)].any() else None
wFL = wheels[iFL]; rF = float(wFL['r']); rR = float(wheels[iRL]['r'])
hubF = Vector(wFL['c'].tolist())
whl.data.transform(Matrix.Translation(-hubF))
if cal: cal.data.transform(Matrix.Translation(-hubF))
whlR = None
if abs(rR - rF) > 0.03 * rF:
    whlR = extract('wheelR', (vw2 == iRL) & ~vc2); whlR.data.transform(Matrix.Translation(-Vector(wheels[iRL]['c'].tolist())))
bpy.data.objects.remove(ob_all)

def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)
def decimate(o, target):
    n = tris(o)
    if n <= target * 1.08: return
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    welded = False
    for _ in range(8):
        n = tris(o)
        if n <= target * 1.08: break
        md = o.modifiers.new('d', 'DECIMATE'); md.ratio = max(0.001, target / n); md.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier='d')
        if tris(o) > n * 0.9 and not welded:  # triangle soup cannot collapse: weld coincident verts, try again
            b_ = bmesh.new(); b_.from_mesh(o.data); bmesh.ops.remove_doubles(b_, verts=b_.verts, dist=0.0015); b_.to_mesh(o.data); b_.free(); welded = True
        elif tris(o) > n * 0.9 and welded:
            b_ = bmesh.new(); b_.from_mesh(o.data); bmesh.ops.remove_doubles(b_, verts=b_.verts, dist=0.006); b_.to_mesh(o.data); b_.free()
def transfer_normals(dst, src):
    """decimated mesh gets the source's shading (custom normals sampled from the nearest source face)"""
    try:
        for p in dst.data.polygons: p.use_smooth = True
        bpy.ops.object.select_all(action='DESELECT'); dst.select_set(True); bpy.context.view_layer.objects.active = dst
        md = dst.modifiers.new('tn', 'DATA_TRANSFER'); md.object = src; md.use_loop_data = True
        md.data_types_loops = {'CUSTOM_NORMAL'}; md.loop_mapping = 'POLYINTERP_NEAREST'
        bpy.ops.object.modifier_apply(modifier='tn')
    except Exception as e:
        log('normal transfer failed', dst.name, e); smooth(dst)
def smooth(o, deg=38):
    for p in o.data.polygons: p.use_smooth = True
    try: o.data.set_sharp_from_angle(angle=math.radians(deg))
    except Exception: pass
def dup(o, name):
    m = o.data.copy(); n = bpy.data.objects.new(name, m); sc.collection.objects.link(n); return n
def drop_faces(o, pred):
    b = bmesh.new(); b.from_mesh(o.data); cl = b.loops.layers.float_color.get('SLcol')
    dead = [f for f in b.faces if pred(f, cl)]
    bmesh.ops.delete(b, geom=dead, context='FACES'); b.to_mesh(o.data); b.free()

T = CFG.get('tris') or [80000, 10000, 2200]
WT = CFG.get('wheelTris') or [3600, 500]
raw = tris(body)
# interior faces for LOD1/2: trim faces whose material was interior -> we no longer know the material; use geometry:
# faces fully inside the glass box (below roof, above belt, inside the side walls) are dropped from LOD1/2 by an inset test
B = np.array([v.co[:] for v in body.data.vertices])
blo, bhi = B.min(0), B.max(0)
def split_slots(o, keep):
    n = dup(o, o.name + '_part')
    b = bmesh.new(); b.from_mesh(n.data)
    bmesh.ops.delete(b, geom=[f for f in b.faces if f.material_index not in keep], context='FACES')
    b.to_mesh(n.data); b.free(); return n
def join(objs_, name):
    objs_ = [o for o in objs_ if o and len(o.data.polygons)]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs_: o.select_set(True)
    bpy.context.view_layer.objects.active = objs_[0]
    bpy.ops.object.join(); objs_[0].name = name; return objs_[0]
# LOD0: the paint shell is decimated gently (double-skinned panels poke through when it is collapsed hard), the rest
# (interior, underbody, trim) takes the cut
pp = split_slots(body, {0}); rest = split_slots(body, set(range(1, 64)))
tp, tr_ = tris(pp), tris(rest)
pb = min(tp, max(int(T[0] * 0.8), int(CFG.get('paintTris', 0)) or 0, T[0] - tr_))
if tp > pb * 1.08: decimate(pp, pb); transfer_normals(pp, body)
if tr_ > (T[0] - tris(pp)) * 1.08: decimate(rest, max(T[0] - tris(pp), int(T[0] * 0.3))); transfer_normals(rest, body)
b0 = join([pp, rest], 'body0')
b1 = dup(b0, 'body1')
inset = 0.16
def inner(f, cl):
    c = f.calc_center_median()
    return (abs(c[0]) < bhi[0] - inset - 0.1 and c[2] > rW * 1.5 and c[2] < bhi[2] - 0.12 and blo[1] + 0.6 < c[1] < bhi[1] - 0.6 and f.material_index == 2)
drop_faces(b1, inner)
decimate(b1, T[1]); transfer_normals(b1, body)
b2 = dup(b1, 'body2')
# bake the four wheels into LOD2 (at rest), low poly
w2 = dup(whl, 'w2tmp'); decimate(w2, 160)
for i in (iFL, iFR, iRL, iRR):
    w = wheels[i]; t = dup(w2, 'w2c');
    M = Matrix.Translation(Vector(w['c'].tolist())) @ (Matrix.Rotation(math.pi, 4, 'Z') if w['c'][0] < 0 else Matrix.Identity(4))
    t.data.transform(M)
    bpy.ops.object.select_all(action='DESELECT'); t.select_set(True); b2.select_set(True); bpy.context.view_layer.objects.active = b2
    bpy.ops.object.join()
bpy.data.objects.remove(w2)
decimate(b2, T[2]); smooth(b2, 45)
w0 = dup(whl, 'wheel0'); decimate(w0, WT[0])
if tris(whl) > WT[0] * 1.08: transfer_normals(w0, whl)
w1 = dup(w0, 'wheel1'); decimate(w1, WT[1]); transfer_normals(w1, whl)
outs = [b0, b1, b2, w0, w1]
if whlR:
    wr0 = dup(whlR, 'wheelR0'); decimate(wr0, WT[0]); wr1 = dup(wr0, 'wheelR1'); decimate(wr1, WT[1]); outs += [wr0, wr1]
if cal:
    c0 = dup(cal, 'caliper0'); decimate(c0, 600); outs.append(c0)
for o in list(sc.objects):
    if o not in outs: bpy.data.objects.remove(o, do_unlink=True)
for o in outs:
    o.data.color_attributes.active_color = o.data.color_attributes.get('SLcol')
    # unused material slots stay (export drops empty primitives)

# ------------------------------------------------------------------ manifest
def bb(o):
    P = np.array([v.co[:] for v in o.data.vertices]) if len(o.data.vertices) else np.zeros((1, 3))
    return P.min(0), P.max(0)
lo0, hi0 = bb(b0)
# glass-derived proportions (game frame: x left, y up, z forward = -blender y)
gl = []
b = bmesh.new(); b.from_mesh(b0.data)
for f in b.faces:
    if f.material_index == 1:
        for v in f.verts: gl.append(v.co[:])
b.free()
gl = np.array(gl) if gl else None
def gz_(y): return -y
wb = abs(yR - yF)
W = float(hi0[0] - lo0[0]); Lm = float(hi0[1] - lo0[1]); H = float(hi0[2])
roofY = H
if gl is not None and len(gl) > 10:
    belt = float(np.percentile(gl[:, 2], 4)); glassTop = float(gl[:, 2].max())
    side = gl[np.abs(gl[:, 0]) > 0.6 * np.abs(gl[:, 0]).max()]
    fz = -gl[:, 1]
    zA = float(fz.max()); zD = float(fz.min())
    hiG = gl[gl[:, 2] > glassTop - 0.12]; zB = float((-hiG[:, 1]).max()) if len(hiG) else zA - 0.6; zC = float((-hiG[:, 1]).min()) if len(hiG) else zD + 0.6
else:
    belt = H * 0.62; zA = wb / 2 - 0.2; zB = 0.1; zC = -0.9; zD = -wb / 2
# underbody height: 5th percentile of body verts between the axles
Bv = np.array([v.co[:] for v in b0.data.vertices])
mid = Bv[(np.abs(Bv[:, 1]) < wb * 0.3)]
yb = float(np.percentile(mid[:, 2], 3)) if len(mid) else rW * 0.6
front = Bv[(-Bv[:, 1]) > (-lo0[1]) - 0.25] if False else Bv[(-Bv[:, 1]) > (hi0[1] * -1 + Lm - 0.3)]
noseY = float(np.percentile(Bv[(-Bv[:, 1]) > (-lo0[1]) - 0.35][:, 2], 95)) if len(Bv) else H * 0.5
tailY = float(np.percentile(Bv[(-Bv[:, 1]) < (-hi0[1]) + 0.35][:, 2], 95)) if len(Bv) else H * 0.6
# hull (convex collider): LOD2 verts without the baked wheels, above 2/3 of the underbody height
B2 = np.array([v.co[:] for v in b1.data.vertices])
hull = B2[B2[:, 2] > max(0.05, yb * 0.7)]
if len(hull) > 1500: hull = hull[np.random.default_rng(1).choice(len(hull), 1500, replace=False)]
# arch gap: free room above each tire (body verts inside the tire footprint), min over the four wheels
ag = []
for i in (iFL, iFR, iRL, iRR):
    w = wheels[i]; c_ = w['c']; r_ = w['r']
    m_ = (np.abs(Bv[:, 0] - c_[0]) < w['w'] / 2) & (np.abs(Bv[:, 1] - c_[1]) < r_ * 0.35) & (Bv[:, 2] > c_[2] + r_ * 0.6)
    if m_.any(): ag.append(float(Bv[m_, 2].min() - (c_[2] + r_)))
archGap = max(0.0, min(ag)) if ag else 0.06
def g(p): return [round(float(p[0]), 4), round(float(p[2]), 4), round(float(-p[1]), 4)]  # blender -> game (x, y, z)
wl = []
for nm_, i in (('FL', iFL), ('FR', iFR), ('RL', iRL), ('RR', iRR)):
    w = wheels[i]; wl.append({'id': nm_, 'pos': g(w['c']), 'r': round(float(w['r']), 4), 'w': round(float(w['w']), 4), **({'virtual': True} if w.get('virtual') else {})})
extra = []
for i, w in enumerate(wheels):
    if i in (iFL, iFR, iRL, iRR): continue
    extra.append({'pos': g(w['c']), 'r': round(float(w['r']), 4), 'side': 1 if w['c'][0] > 0 else -1})
man = {
    'key': KEY, 'src': os.path.relpath(SRC, os.path.join(os.path.dirname(__file__), '..', '..', '..')), 'fwd': fwd, 'scale': s,
    'dims': {'L': round(Lm, 3), 'W': round(W, 3), 'H': round(H, 3)},
    'wb': round(wb, 3), 'track': round(float(abs(wheels[iFL]['c'][0] - wheels[iFR]['c'][0])), 3),
    'r': round(rF, 4), 'rR': round(rR, 4), 'tw': round(float(np.mean([wheels[i]['w'] for i in (iFL, iFR, iRL, iRR)])), 4),
    'archGap': round(archGap, 3), 'wheels': wl, 'extraWheels': extra, 'calipers': bool(cal), 'wheelR': bool(whlR),
    'shape': {'yb': round(yb, 3), 'belt': round(belt, 3), 'roofY': round(roofY, 3), 'noseY': round(noseY, 3), 'tailY': round(tailY, 3),
              'bodyW': round(float(2 * np.abs(Bv[(Bv[:, 2] < belt - 0.05) & (Bv[:, 2] > yb + 0.05)][:, 0]).max()) if ((Bv[:, 2] < belt - 0.05) & (Bv[:, 2] > yb + 0.05)).any() else W, 3), 'zA': round(zA, 3), 'zB': round(zB, 3), 'zC': round(zC, 3), 'zD': round(zD, 3), 'front': round(float(-lo0[1]), 3), 'rear': round(float(-hi0[1]), 3)},
    'tris': {'src': raw, 'lod0': tris(b0), 'lod1': tris(b1), 'lod2': tris(b2), 'wheel0': tris(w0), 'wheel1': tris(w1)},
    'hull': [round(float(x), 3) for p in hull for x in g(p)],
    'cfg': CFG, 'wheelDonor': CFG.get('wheelDonor'),
}
# ------------------------------------------------------------------ export
out = os.path.join(OUTDIR, KEY + '.glb')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
                          export_texcoords=True, export_normals=True, export_materials='EXPORT',
                          export_vertex_color='NAME', export_vertex_color_name='SLcol', export_all_vertex_colors=False,
                          export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
                          export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12,
                          export_draco_color_quantization=10, export_animations=False, export_image_format='WEBP' if (TEXTURED or tex_slot) else 'NONE', export_image_quality=82)
man['bytes'] = os.path.getsize(out)
json.dump(man, open(os.path.join(OUTDIR, KEY + '.json'), 'w'), indent=1)
log('DONE', json.dumps({k: man[k] for k in ('dims', 'wb', 'r', 'tris', 'bytes')}), 'secs', round(time.time() - T0, 1))
