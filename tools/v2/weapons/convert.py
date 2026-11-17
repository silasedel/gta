# Blender (-b): one library weapon (.blend from Models/Weapons) -> game GLB + JSON sidecar.
#   blender -b --python-exit-code 1 --python convert.py -- <weapons.json> <key> <out_dir>
# What it does (config per key in weapons.json):
#  - opens the .blend with scripts OFF, keeps the visible meshes (drop regex / drop far-away spare parts)
#  - orients: source `fwd` axis -> game +Z (barrel / business end), source `up` axis -> game +Y; scales to `length` m
#  - decimates to `tris` (default 12000), smooth-by-angle normals
#  - rebuilds every material as a clean PBR set at 1K: base color, normal (DirectX maps flipped), ORM (AO, rough, metal);
#    unlinked/missing maps come from the config; untextured parts get a procedural finish (see finish())
#  - paints out brand text (config `patch` rects in UV space) on color + normal + ORM
#  - origin at the grip (config `grip`, model coords relative to the bbox center after orient+scale)
#  - empties muzzle / eject / sight / lgrip (+ JSON sidecar) relative to the grip
import bpy, bmesh, sys, os, re, json, math, mathutils
import numpy as np

A = sys.argv[sys.argv.index('--') + 1:]
CFG_ALL = json.load(open(A[0])); KEY = A[1]; OUT = A[2]
C = CFG_ALL['models'][KEY]; LIB = CFG_ALL['library']
SRC = os.path.join(LIB, C['dir'], C.get('file', C['dir'].split(' - ')[0] + '.blend'))
TEXDIR = os.path.join(LIB, C['dir'], 'textures')
RES = C.get('res', 1024)
STAGE = A[3] if len(A) > 3 else 'final'   # 'raw' = no grip move (first look)

bpy.ops.wm.open_mainfile(filepath=SRC, load_ui=False, use_scripts=False)
sc = bpy.context.scene
dg = bpy.context.evaluated_depsgraph_get()
drop = re.compile(C['drop']) if C.get('drop') else None
keep = re.compile(C['keep']) if C.get('keep') else None
objs = [o for o in sc.objects if o.type == 'MESH' and not o.hide_render and not o.hide_get() and not (drop and drop.search(o.name)) and not (keep and not keep.search(o.name))]

# ---- join evaluated meshes in world space (config `parts`: {name: object-name regex} -> separate moving nodes)
PARTS = list(C.get('parts', {}).items())
bm = bmesh.new(); bm.faces.layers.int.new('part'); mats = []; mi = {}
for o in objs:
    oe = o.evaluated_get(dg); me0 = bpy.data.meshes.new_from_object(oe, depsgraph=dg)
    if len(me0.polygons) == 0: bpy.data.meshes.remove(me0); continue
    me0.transform(o.matrix_world)
    if o.matrix_world.determinant() < 0: me0.flip_normals()
    if len(me0.uv_layers) == 0: me0.uv_layers.new(name='UVMap')
    uvi = C.get('uvlayer', {}).get(o.name, 0)
    if uvi and uvi < len(me0.uv_layers): me0.uv_layers.active_index = uvi; me0.uv_layers[uvi].active_render = True
    keepuv = me0.uv_layers[uvi].name if uvi < len(me0.uv_layers) else me0.uv_layers[0].name
    for l in [l for l in me0.uv_layers if l.name != keepuv]: me0.uv_layers.remove(l)
    me0.uv_layers[0].name = 'UVMap'
    loc = []
    for s in o.material_slots:
        m = s.material; mn = (C.get('matmap', {}).get(o.name) or (m.name if m else '__none'))
        if mn not in mi: mi[mn] = len(mats); mats.append((mn, m))
        loc.append(mi[mn])
    if not loc:
        mn = C.get('matmap', {}).get(o.name, '__none')
        if mn not in mi: mi[mn] = len(mats); mats.append((mn, None))
        loc = [mi[mn]]
    else:
        ov = C.get('matmap', {}).get(o.name)
        if ov: loc = [mi[ov]] * len(loc)
    pid = 0
    for pi, (pn, prx) in enumerate(PARTS):
        if re.search(prx, o.name): pid = pi + 1
    n0 = len(bm.faces); bm.from_mesh(me0); bm.faces.ensure_lookup_table()
    play = bm.faces.layers.int.get('part') or bm.faces.layers.int.new('part')
    for fi in range(n0, len(bm.faces)): f = bm.faces[fi]; f.material_index = loc[min(f.material_index, len(loc) - 1)]; f[play] = pid
    bpy.data.meshes.remove(me0)
me = bpy.data.meshes.new(KEY); bm.to_mesh(me); bm.free()
for mn_, m_ in mats: me.materials.append(m_ or bpy.data.materials.new('ph_' + mn_))   # keep face material indices valid through decimation
for o in list(sc.objects): bpy.data.objects.remove(o, do_unlink=True)
ob = bpy.data.objects.new(KEY, me); sc.collection.objects.link(ob)
bpy.context.view_layer.objects.active = ob; ob.select_set(True)

# ---- orient + scale (game: +Z forward, +Y up  ==  Blender: -Y forward, +Z up)
AX = {'x': 0, 'y': 1, 'z': 2}
def axv(s): v = mathutils.Vector((0, 0, 0)); v[AX[s[1]]] = -1 if s[0] == '-' else 1; return v
co = np.empty(len(me.vertices) * 3, dtype=np.float64); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
ext = co.max(0) - co.min(0); order = list(np.argsort(-ext))
fwd = axv(C['fwd']) if C.get('fwd') else axv('+' + 'xyz'[order[0]])
up = axv(C['up']) if C.get('up') else axv('+' + 'xyz'[order[1]])
side = fwd.cross(up)
src = mathutils.Matrix((fwd, up, side)).transposed()           # columns fwd, up, side (source)
dst = mathutils.Matrix(((0, -1, 0), (0, 0, 1), (-1, 0, 0))).transposed()  # where they go in Blender (fwd->-Y, up->+Z, side=fwd x up -> -X)
R = (dst @ src.inverted()).to_4x4()
me.transform(R)
co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
lo, hi = co.min(0), co.max(0)
k = C['length'] / (hi[1] - lo[1])
ctr = (lo + hi) / 2
me.transform(mathutils.Matrix.Scale(k, 4) @ mathutils.Matrix.Translation(-mathutils.Vector(ctr)))
if C.get('mirror'): me.transform(mathutils.Matrix.Scale(-1, 4, (1, 0, 0))); me.flip_normals()

# ---- clean + decimate
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=C.get('weld', 0.00005)); bpy.ops.mesh.quads_convert_to_tris(); bpy.ops.object.mode_set(mode='OBJECT')
tris0 = len(me.polygons); target = C.get('tris', 12000)
for _ in range(6):
    t = len(me.polygons)
    if t <= target * 1.15: break
    md = ob.modifiers.new('dec', 'DECIMATE'); md.ratio = max(0.01, target / t); md.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='dec')
try: bpy.ops.object.shade_smooth_by_angle(angle=math.radians(C.get('smooth', 35)))
except Exception: bpy.ops.object.shade_smooth()
for mod in [m for m in ob.modifiers]:
    try: bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception: pass

# ---- materials
def tex(name):
    if not name: return None
    p = name if os.path.isabs(name) else os.path.join(TEXDIR, name)
    if not os.path.exists(p): print('MISSING', p); return None
    im = bpy.data.images.load(p, check_existing=True)
    return im
def px(im, ch=None):  # float pixels RES x RES x 4 (linear values as stored)
    im2 = im.copy()
    if im2.size[0] != RES or im2.size[1] != RES: im2.scale(RES, RES)
    a = np.empty(RES * RES * 4, dtype=np.float32); im2.pixels.foreach_get(a); bpy.data.images.remove(im2)
    return a.reshape(RES, RES, 4)
def upstream_image(sock, depth=0):
    if depth > 6 or not sock.is_linked: return None, None
    l = sock.links[0]; n = l.from_node
    if n.type == 'TEX_IMAGE': return n.image, ('A' if l.from_socket.name == 'Alpha' else None)
    if n.type in ('SEPARATE_COLOR', 'SEPRGB', 'SEPARATE_RGB'):
        im, _ = upstream_image(n.inputs[0], depth + 1); return im, l.from_socket.name
    if n.type == 'NORMAL_MAP': return upstream_image(n.inputs['Color'], depth + 1)
    if n.type == 'INVERT': im, ch = upstream_image(n.inputs['Color'], depth + 1); return im, ('inv', ch)
    for i in n.inputs:
        if i.is_linked: return upstream_image(i, depth + 1)
    return None, None
def auto_spec(m):
    s = {}
    if not m or not m.use_nodes: return s
    b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not b: return s
    for k, sock in (('color', 'Base Color'), ('rough', 'Roughness'), ('metal', 'Metallic'), ('normal', 'Normal')):
        im, ch = upstream_image(b.inputs[sock])
        if im: s[k] = (im, ch)
    if 'color' not in s: s['colorv'] = list(b.inputs['Base Color'].default_value)[:3]
    if 'rough' not in s: s['roughv'] = b.inputs['Roughness'].default_value
    if 'metal' not in s: s['metalv'] = b.inputs['Metallic'].default_value
    return s
def chan(a, ch):
    idx = {'Red': 0, 'R': 0, 'Green': 1, 'G': 1, 'Blue': 2, 'B': 2, 'Alpha': 3, 'A': 3}
    if ch is None: return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722 if False else a[..., 0]
    if isinstance(ch, tuple): return 1 - chan(a, ch[1])
    return a[..., idx.get(ch, 0)]
rng = np.random.default_rng(7)
def fbm(n=RES, oct=5, seed=1):
    r = np.random.default_rng(seed); out = np.zeros((n, n), np.float32); amp = 1; tot = 0
    for o in range(oct):
        s = 4 * 2 ** o; g = r.random((s + 1, s + 1)).astype(np.float32)
        xi = np.linspace(0, s, n, endpoint=False); i0 = xi.astype(int); f = xi - i0; f = f * f * (3 - 2 * f)
        a = g[i0][:, i0] * (1 - f)[None, :] + g[i0][:, i0 + 1] * f[None, :]
        b = g[i0 + 1][:, i0] * (1 - f)[None, :] + g[i0 + 1][:, i0 + 1] * f[None, :]
        out += amp * (a * (1 - f)[:, None] + b * f[:, None]); tot += amp; amp *= 0.55
    return out / tot
def srgb2lin(c): c = np.asarray(c, np.float32); return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
FIN = {  # procedural finishes for untextured parts: base sRGB, rough, metal, grain
    'gunmetal': ([0.105, 0.11, 0.118], 0.42, 0.9, 0.10), 'blued': ([0.07, 0.075, 0.085], 0.36, 0.95, 0.08),
    'polymer': ([0.075, 0.075, 0.078], 0.62, 0.0, 0.06), 'stainless': ([0.62, 0.62, 0.6], 0.3, 1.0, 0.06),
    'parkerized': ([0.16, 0.165, 0.16], 0.7, 0.75, 0.12), 'anodized': ([0.12, 0.122, 0.13], 0.5, 0.85, 0.07),
    'brass': ([0.72, 0.55, 0.28], 0.32, 1.0, 0.06), 'rubber': ([0.05, 0.05, 0.05], 0.85, 0.0, 0.05),
    'glass': ([0.02, 0.03, 0.04], 0.05, 0.0, 0.0), 'wood': ([0.36, 0.2, 0.1], 0.6, 0.0, 0.15), 'steel': ([0.42, 0.42, 0.42], 0.45, 1.0, 0.1),
    'rust': ([0.32, 0.17, 0.09], 0.85, 0.3, 0.2), 'tape': ([0.06, 0.06, 0.065], 0.9, 0.0, 0.1), 'tan': ([0.55, 0.45, 0.32], 0.65, 0.0, 0.08),
    'whitepaint': ([0.82, 0.8, 0.76], 0.5, 0.0, 0.08), 'redpaint': ([0.5, 0.06, 0.04], 0.45, 0.2, 0.1), 'gloss': ([0.03, 0.03, 0.035], 0.18, 0.2, 0.04),
}
def build_material(name, src, spec):
    """returns a new principled material with RES images (color sRGB, normal, ORM)"""
    a = auto_spec(src) if spec.get('auto', True) else {}
    def get(kind):
        v = spec.get(kind)
        if isinstance(v, str): im = tex(v); return (im, spec.get(kind + 'Ch')) if im else None
        return a.get(kind)
    fin = FIN.get(spec.get('finish', ''), None)
    # color
    c = get('color')
    if c: col = px(c[0], 'srgb')[..., :3]; col_lin = c[0].colorspace_settings.name != 'sRGB'
    else:
        base = spec.get('base') or (fin[0] if fin else None)
        n = fbm(seed=hash(name) % 1000)
        if base is None: base = [float(x) for x in np.clip(np.array(a.get('colorv', [0.5, 0.5, 0.5])), 0, 1) ** (1 / 2.2)]
        g = (fin[3] if fin else 0.06)
        col = np.clip(np.array(base, np.float32)[None, None, :] * (1 + (n[..., None] - 0.5) * 2 * g), 0, 1); col_lin = False
    if spec.get('desat'): lum = (col @ np.array([0.2126, 0.7152, 0.0722], np.float32))[..., None]; col = col * (1 - spec['desat']) + lum * spec['desat']
    if spec.get('tint'): col = np.clip(col * np.array(spec['tint'], np.float32), 0, 1)
    if spec.get('gain'): col = np.clip(col * spec['gain'], 0, 1)
    # rough / metal / ao (stored linear)
    def scalar(kind, default):
        t = get(kind)
        if t: return chan(px(t[0]), t[1])
        v = spec.get(kind + 'v'); v = v if v is not None else (fin[{'rough': 1, 'metal': 2}[kind]] if fin and kind in ('rough', 'metal') else a.get(kind + 'v', default))
        arr = np.full((RES, RES), v, np.float32)
        if kind == 'rough' and not t: arr = np.clip(arr + (fbm(seed=99) - 0.5) * 0.18, 0.03, 1)
        return arr
    if spec.get('smooth'): t = tex(spec['smooth']); rough = 1 - chan(px(t), spec.get('smoothCh', 'R'))
    elif spec.get('gloss'): t = tex(spec['gloss']); rough = 1 - chan(px(t), spec.get('glossCh', 'A'))
    else: rough = scalar('rough', 0.5)
    metal = scalar('metal', 0.0)
    if spec.get('metalScale') is not None: metal = metal * spec['metalScale']
    if spec.get('roughAdd'): rough = np.clip(rough + spec['roughAdd'], 0.02, 1)
    if spec.get('roughMul'): rough = np.clip(rough * spec['roughMul'], 0.02, 1)
    ao = chan(px(tex(spec['ao'])), 'R') if spec.get('ao') and tex(spec['ao']) else np.ones((RES, RES), np.float32)
    nt = get('normal'); nrm = px(nt[0])[..., :3] if nt else None
    if nrm is not None and spec.get('dx'): nrm[..., 1] = 1 - nrm[..., 1]
    if nrm is not None and spec.get('normalStrength'):
        s = spec['normalStrength']; v = nrm * 2 - 1; v[..., :2] *= s; v /= np.linalg.norm(v, axis=-1, keepdims=True) + 1e-6; nrm = v * 0.5 + 0.5
    # brand / text removal: fill rects (uv 0..1, v up) with surrounding median + texture of a donor offset
    for p in spec.get('patch', []):
        u0, v0, u1, v1 = p[:4]; x0, x1 = int(u0 * RES), int(u1 * RES); y0, y1 = int(v0 * RES), int(v1 * RES)
        dx = int(p[4] * RES) if len(p) > 4 else 0; dy = int(p[5] * RES) if len(p) > 5 else 0
        sl = (slice(y0, y1), slice(x0, x1)); dn = (slice(y0 + dy, y1 + dy), slice(x0 + dx, x1 + dx))
        if dx or dy:
            col[sl] = col[dn]; rough[sl] = rough[dn]; metal[sl] = metal[dn]; ao[sl] = ao[dn]
            if nrm is not None: nrm[sl] = nrm[dn]
        else:
            ring = np.concatenate([col[max(0, y0 - 4):y0, x0:x1].reshape(-1, 3), col[y1:y1 + 4, x0:x1].reshape(-1, 3)])
            col[sl] = np.median(ring, axis=0) if len(ring) else col[sl].mean(axis=(0, 1))
            if nrm is not None: nrm[sl] = [0.5, 0.5, 1.0]
            rough[sl] = np.median(rough[sl]); metal[sl] = np.median(metal[sl])
    # images
    def mkimg(nm, arr3, srgb):
        im = bpy.data.images.new(nm, RES, RES, alpha=False, float_buffer=False)
        im.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
        rgba = np.ones((RES, RES, 4), np.float32); rgba[..., :3] = arr3
        im.pixels.foreach_set(rgba.ravel()); im.pack(); return im
    # px() of an sRGB image returns display values for 8-bit images (Blender keeps byte buffers in sRGB)
    imc = mkimg(KEY + '_' + name + '_c', col, True)
    orm = np.stack([ao, np.clip(rough, 0.02, 1), np.clip(metal, 0, 1)], -1)
    imo = mkimg(KEY + '_' + name + '_orm', orm, False)
    imn = mkimg(KEY + '_' + name + '_n', nrm, False) if nrm is not None else None
    m = bpy.data.materials.new(KEY + '_' + name); m.use_nodes = True; T = m.node_tree; N = T.nodes
    b = N['Principled BSDF']
    tc = N.new('ShaderNodeTexImage'); tc.image = imc; T.links.new(tc.outputs[0], b.inputs['Base Color'])
    uvsel = None
    if spec.get('uv'): uvsel = N.new('ShaderNodeUVMap'); uvsel.uv_map = spec['uv']; T.links.new(uvsel.outputs[0], tc.inputs['Vector'])
    to = N.new('ShaderNodeTexImage'); to.image = imo; sp = N.new('ShaderNodeSeparateColor')
    if uvsel: T.links.new(uvsel.outputs[0], to.inputs['Vector'])
    T.links.new(to.outputs[0], sp.inputs[0]); T.links.new(sp.outputs['Green'], b.inputs['Roughness']); T.links.new(sp.outputs['Blue'], b.inputs['Metallic'])
    if spec.get('ao') or spec.get('aoPack'):
        try:
            gs = N.new('ShaderNodeGroup')
        except Exception: pass
    if imn:
        tn = N.new('ShaderNodeTexImage'); tn.image = imn; nm = N.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = 1.0
        if uvsel: T.links.new(uvsel.outputs[0], tn.inputs['Vector']); nm.uv_map = spec['uv']
        T.links.new(tn.outputs[0], nm.inputs['Color']); T.links.new(nm.outputs[0], b.inputs['Normal'])
    if spec.get('emissive'):
        b.inputs['Emission Color'].default_value = spec['emissive'] + [1]; b.inputs['Emission Strength'].default_value = spec.get('emissiveStrength', 2)
    return m, {'rough': float(np.mean(rough)), 'metal': float(np.mean(metal)), 'col': [float(x) for x in col.reshape(-1, 3).mean(0)]}

# ---- untextured parts: bake a worn PBR finish (Cycles): base + noise, worn bright edges (bevel vs. geometry normal),
#      cavity darkening (AO), rounded-edge normals; all procedural parts share one atlas on a new UV map 'BakeUV'
def bake_procedural():
    specs0 = C.get('mats', {})
    proc = [i for i, (mn, m) in enumerate(mats) if specs0.get(mn, specs0.get('*', {})).get('finish')]
    if not proc: return
    import tempfile
    td = tempfile.mkdtemp(prefix='wbake_')
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = int(C.get('bakeSamples', 24)); sc.cycles.use_denoising = False
    sc.render.bake.margin = 6; sc.render.bake.use_clear = True
    me.materials.clear()
    for mn, m in mats: me.materials.append(m or bpy.data.materials.new('ph_' + mn))
    uv = me.uv_layers.new(name='BakeUV'); me.uv_layers['UVMap'].active_render = True
    me.uv_layers.active = uv
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
    for p in me.polygons: p.select = p.material_index in proc
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.004, area_weight=0.0, scale_to_bounds=True); bpy.ops.object.mode_set(mode='OBJECT')
    RESB = C.get('bakeRes', 1024)
    imgs = {k: bpy.data.images.new('bake_' + k, RESB, RESB, alpha=False, float_buffer=k == 'normal') for k in ('color', 'rough', 'metal', 'normal')}
    for k in ('rough', 'metal', 'normal'): imgs[k].colorspace_settings.name = 'Non-Color'
    # temporary bake materials (one per procedural source material)
    saved = [s.material for s in ob.material_slots]
    wear = C.get('wear', 0.55)
    bmats = {}
    for i in proc:
        mn = mats[i][0]; sp = specs0.get(mn, specs0.get('*', {})); fin = FIN[sp['finish']]
        base = sp.get('base') or fin[0]; rough = sp.get('roughv', fin[1]); metal = sp.get('metalv', fin[2]); ew = sp.get('wear', wear)
        bare = sp.get('bare', [0.52, 0.52, 0.54] if metal > 0.3 else [min(1, base[0] * 1.9 + 0.05), min(1, base[1] * 1.9 + 0.05), min(1, base[2] * 1.9 + 0.05)])
        m = bpy.data.materials.new('bk_' + mn); m.use_nodes = True; T = m.node_tree; N = T.nodes; L = T.links
        for n in list(N): N.remove(n)
        out = N.new('ShaderNodeOutputMaterial'); em = N.new('ShaderNodeEmission'); pb = N.new('ShaderNodeBsdfPrincipled')
        uvn = N.new('ShaderNodeUVMap'); uvn.uv_map = 'BakeUV'
        geo = N.new('ShaderNodeNewGeometry'); bev = N.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = sp.get('bevel', C.get('bevel', 0.0012)); bev.samples = 8
        dot = N.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; L.new(bev.outputs[0], dot.inputs[0]); L.new(geo.outputs['Normal'], dot.inputs[1])
        e1 = N.new('ShaderNodeMath'); e1.operation = 'SUBTRACT'; e1.inputs[0].default_value = 1.0; L.new(dot.outputs['Value'], e1.inputs[1])
        e2 = N.new('ShaderNodeMath'); e2.operation = 'MULTIPLY'; e2.inputs[1].default_value = 28.0; e2.use_clamp = True; L.new(e1.outputs[0], e2.inputs[0])
        tc = N.new('ShaderNodeTexCoord'); nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 140.0; nz.inputs['Detail'].default_value = 6.0
        L.new(tc.outputs['Object'], nz.inputs['Vector'])
        nz2 = N.new('ShaderNodeTexNoise'); nz2.inputs['Scale'].default_value = 22.0; nz2.inputs['Detail'].default_value = 3.0; L.new(tc.outputs['Object'], nz2.inputs['Vector'])
        # wear mask = edge * (noise breakup)
        br = N.new('ShaderNodeMapRange'); br.inputs['From Min'].default_value = 0.42; br.inputs['From Max'].default_value = 0.62; L.new(nz.outputs['Fac'], br.inputs['Value'])
        wm = N.new('ShaderNodeMath'); wm.operation = 'MULTIPLY'; wm.use_clamp = True; L.new(e2.outputs[0], wm.inputs[0]); L.new(br.outputs['Result'], wm.inputs[1])
        wk = N.new('ShaderNodeMath'); wk.operation = 'MULTIPLY'; wk.use_clamp = True; wk.inputs[1].default_value = ew; L.new(wm.outputs[0], wk.inputs[0])
        ao = N.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = sp.get('aoDist', 0.012); ao.samples = 8
        aor = N.new('ShaderNodeMapRange'); aor.inputs['To Min'].default_value = 0.55; L.new(ao.outputs['AO'], aor.inputs['Value'])
        # color = mix(base * (0.92 .. 1.08 by macro noise), bare, wear) * cavity
        bc = N.new('ShaderNodeRGB'); bc.outputs[0].default_value = tuple(srgb2lin(base).tolist()) + (1,)
        bm_ = N.new('ShaderNodeRGB'); bm_.outputs[0].default_value = tuple(srgb2lin(bare).tolist()) + (1,)
        mv = N.new('ShaderNodeMapRange'); mv.inputs['To Min'].default_value = 0.88; mv.inputs['To Max'].default_value = 1.12; L.new(nz2.outputs['Fac'], mv.inputs['Value'])
        mul = N.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
        L.new(bc.outputs[0], mul.inputs[6]); cm = N.new('ShaderNodeCombineColor'); [L.new(mv.outputs['Result'], cm.inputs[j]) for j in range(3)]; L.new(cm.outputs[0], mul.inputs[7])
        mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; L.new(wk.outputs[0], mx.inputs['Factor']); L.new(mul.outputs[2], mx.inputs[6]); L.new(bm_.outputs[0], mx.inputs[7])
        cav = N.new('ShaderNodeMix'); cav.data_type = 'RGBA'; cav.blend_type = 'MULTIPLY'; cav.inputs['Factor'].default_value = 1.0
        L.new(mx.outputs[2], cav.inputs[6]); cm2 = N.new('ShaderNodeCombineColor'); [L.new(aor.outputs['Result'], cm2.inputs[j]) for j in range(3)]; L.new(cm2.outputs[0], cav.inputs[7])
        # rough / metal
        rr = N.new('ShaderNodeMapRange'); rr.inputs['To Min'].default_value = max(0.05, rough - 0.08); rr.inputs['To Max'].default_value = min(1, rough + 0.1); L.new(nz2.outputs['Fac'], rr.inputs['Value'])
        rw = N.new('ShaderNodeMix'); rw.data_type = 'FLOAT'; L.new(wk.outputs[0], rw.inputs['Factor']); L.new(rr.outputs['Result'], rw.inputs[2]); rw.inputs[3].default_value = 0.3
        mw = N.new('ShaderNodeMix'); mw.data_type = 'FLOAT'; L.new(wk.outputs[0], mw.inputs['Factor']); mw.inputs[2].default_value = metal; mw.inputs[3].default_value = 1.0 if metal > 0.3 else metal
        tex_ = N.new('ShaderNodeTexImage'); tex_.select = True; N.active = tex_
        L.new(bev.outputs[0], pb.inputs['Normal'])
        bmats[i] = (m, em, out, pb, {'color': cav.outputs[2], 'rough': rw.outputs[0], 'metal': mw.outputs[0]}, tex_, uvn)
        L.new(uvn.outputs[0], tex_.inputs['Vector'])
    for slot_i, s in enumerate(ob.material_slots):
        if slot_i in bmats: s.material = bmats[slot_i][0]
    # faces of textured materials must not write into the atlas: give them a dummy material with an unrelated image
    dummy_img = bpy.data.images.new('bake_dummy', 8, 8)
    for slot_i, s in enumerate(ob.material_slots):
        if slot_i not in bmats:
            dm = bpy.data.materials.new('bk_dummy%d' % slot_i); dm.use_nodes = True; tn = dm.node_tree.nodes.new('ShaderNodeTexImage'); tn.image = dummy_img; dm.node_tree.nodes.active = tn; s.material = dm
    for k in ('color', 'rough', 'metal', 'normal'):
        for i, (m, em, out, pb, socks, tex_, uvn) in bmats.items():
            T = m.node_tree; tex_.image = imgs[k]; T.nodes.active = tex_
            for l in list(out.inputs['Surface'].links): T.links.remove(l)
            if k == 'normal': T.links.new(pb.outputs[0], out.inputs['Surface'])
            else:
                for l in list(em.inputs['Color'].links): T.links.remove(l)
                T.links.new(socks[k], em.inputs['Color']); T.links.new(em.outputs[0], out.inputs['Surface'])
        bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
        if k == 'normal': bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', uv_layer='BakeUV')
        else: bpy.ops.object.bake(type='EMIT', uv_layer='BakeUV')
        path = os.path.join(td, k + '.png'); imgs[k].filepath_raw = path; imgs[k].file_format = 'PNG'; imgs[k].save()
    for slot_i, s in enumerate(ob.material_slots): s.material = saved[slot_i]
    # every procedural source material now maps onto one baked atlas material
    atlas = '__bake'
    C.setdefault('mats', {})[atlas] = {'auto': False, 'color': os.path.join(td, 'color.png'), 'rough': os.path.join(td, 'rough.png'), 'metal': os.path.join(td, 'metal.png'),
                                       'normal': os.path.join(td, 'normal.png'), 'uv': 'BakeUV'}
    for i in proc:
        mn = mats[i][0]; C['mats'].setdefault(mn, {})
        C['mats'][mn] = dict(C['mats'][mn]); C['mats'][mn]['same'] = atlas
    if atlas not in [x[0] for x in mats]: mats.append((atlas, None))
    print('BAKED', len(proc), 'procedural materials ->', td)
if C.get('bake'):
    bake_procedural()

specs = C.get('mats', {})
newm = []; info = {}; sig = {}
remap = []
for i, (mn, m) in enumerate(mats):
    spec = specs.get(mn, specs.get('*', {}))
    if spec.get('same'): remap.append(spec['same']); continue
    remap.append(mn)
for i, (mn, m) in enumerate(mats):
    pass
final = []; fidx = {}
for mn in remap:
    if mn not in fidx: fidx[mn] = len(final); final.append(mn)
src_of = {mn: m for mn, m in mats}
mi_arr = np.empty(len(me.polygons), dtype=np.int32); me.polygons.foreach_get('material_index', mi_arr)
me.materials.clear()
for mn in final:
    spec = specs.get(mn, specs.get('*', {}))
    nm = re.sub(r'[^A-Za-z0-9]+', '', mn)[:16] or 'm'
    m, st = build_material(nm, src_of.get(mn), spec); me.materials.append(m); info[mn] = st
lut = [fidx[mn] for mn in remap]
mi_arr = np.array(lut, dtype=np.int32)[np.clip(mi_arr, 0, len(lut) - 1)]; me.polygons.foreach_set('material_index', mi_arr)
# drop faces of materials flagged 'remove'
rm = [i for i, mn in enumerate(final) if specs.get(mn, {}).get('remove')]
if rm:
    bm2 = bmesh.new(); bm2.from_mesh(me); bad = [f for f in bm2.faces if f.material_index in rm]
    bmesh.ops.delete(bm2, geom=bad, context='FACES'); bm2.to_mesh(me); bm2.free()

# ---- points (model coords: x left(+)/right, y up, z forward; Blender: X=-x? -> we keep three.js coords in JSON)
co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
G = np.stack([-co[:, 0], co[:, 2], -co[:, 1]], 1)    # Blender -> glTF/three (x, z, -y); side axis: Blender -X == three +X? (export maps X->X)
G[:, 0] = co[:, 0]
lo3, hi3 = G.min(0), G.max(0)
zmax = hi3[2]; front = G[G[:, 2] > zmax - C.get('muzzleDepth', 0.006)]
auto_muzzle = [float((front[:, 0].min() + front[:, 0].max()) / 2), float((front[:, 1].min() + front[:, 1].max()) / 2), float(zmax)]
pts = {'muzzle': C.get('muzzle', auto_muzzle)}
for k2 in ('eject', 'sight', 'lgrip', 'mag'):
    if k2 in C: pts[k2] = C[k2]
grip = C.get('grip', [0, 0, 0]) if STAGE != 'raw' else [0, 0, 0]
off = mathutils.Vector((grip[0], -grip[2], grip[1]))   # three (x,y,z) -> Blender (x, -z, y)
me.transform(mathutils.Matrix.Translation(-off))
rel = {k2: [round(v[0] - grip[0], 4), round(v[1] - grip[1], 4), round(v[2] - grip[2], 4)] for k2, v in pts.items()}
for k2, v in rel.items():
    e = bpy.data.objects.new(k2, None); e.empty_display_size = 0.01; e.location = (v[0], -v[2], v[1]); sc.collection.objects.link(e); e.parent = ob
partinfo = {}
if PARTS:
    import bmesh as _b
    for pi, (pn, prx) in enumerate(PARTS):
        src = _b.new(); src.from_mesh(me); lay = src.faces.layers.int.get('part')
        if lay is None: break
        other = [f for f in src.faces if f[lay] != pi + 1]
        if len(other) == len(src.faces): src.free(); continue
        _b.ops.delete(src, geom=other, context='FACES')
        pm = bpy.data.meshes.new(pn); src.to_mesh(pm); src.free()
        for mt in me.materials: pm.materials.append(mt)
        po = bpy.data.objects.new(pn, pm); sc.collection.objects.link(po); po.parent = ob
        rest = _b.new(); rest.from_mesh(me); lay = rest.faces.layers.int.get('part')
        _b.ops.delete(rest, geom=[f for f in rest.faces if f[lay] == pi + 1], context='FACES'); rest.to_mesh(me); rest.free()
        pc = np.empty(len(pm.vertices) * 3); pm.vertices.foreach_get('co', pc); pc = pc.reshape(-1, 3)
        partinfo[pn] = {'tris': len(pm.polygons), 'min': [round(float(pc[:, 0].min()), 4), round(float(pc[:, 2].min()), 4), round(float(-pc[:, 1].max()), 4)],
                        'max': [round(float(pc[:, 0].max()), 4), round(float(pc[:, 2].max()), 4), round(float(-pc[:, 1].min()), 4)]}
    if 'part' in me.attributes: me.attributes.remove(me.attributes['part'])
    for c2 in ob.children:
        if c2.type == 'MESH' and 'part' in c2.data.attributes: c2.data.attributes.remove(c2.data.attributes['part'])
ob.name = 'body'
bbx = {'min': [round(float(x - g), 4) for x, g in zip(lo3, grip)], 'max': [round(float(x - g), 4) for x, g in zip(hi3, grip)]}
tris = len(me.polygons)
os.makedirs(OUT, exist_ok=True)
glb = os.path.join(OUT, KEY + '.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_image_format='WEBP', export_image_quality=C.get('quality', 82),
                          export_yup=True, export_texcoords=True, export_normals=True, export_tangents=False, export_materials='EXPORT',
                          export_animations=False, export_apply=True, export_extras=False)
side = {'key': KEY, 'src': C['dir'], 'tris': tris, 'tris_src': tris0, 'length': C['length'], 'bbox': bbx, 'points': rel,
        'materials': info, 'parts': partinfo, 'bytes': os.path.getsize(glb)}
json.dump(side, open(os.path.join(OUT, KEY + '.json'), 'w'), indent=1)
print('WCONV', KEY, 'tris', tris0, '->', tris, 'mats', len(final), 'kb', os.path.getsize(glb) // 1024, 'bbox', bbx, 'muzzle', rel['muzzle'])
