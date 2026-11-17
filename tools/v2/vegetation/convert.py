# Library plant (.blend from Models/Trees, Models/Plants) -> game GLBs: <key>.glb (LOD0, textures) + <key>_lod1.glb (no textures,
# same material names; the runtime reuses the LOD0 maps). Driven by one entry of tools/v2/vegetation/species.json.
#   blender -b --factory-startup --disable-autoexec --python-exit-code 1 -P convert.py -- <species.json> <key> <outdir> [report.json]
# Steps: pick objects -> apply modifiers + world transform -> join -> meters, trunk base at the origin, +Y up on export ->
# per material: clean RGBA color (alpha from the source alpha map / color alpha / white-background key), color bleed into the
# transparent texels (no dark or white halos in the mip chain), HSV grade toward the species palette (green texels only, so
# bark, flowers and fruit keep their own colors), optional flower recolor and a bloom variant on a share of the leaf cards ->
# one material per family ('bark*' opaque, 'leaf*' alpha-tested) -> LOD0: bark collapse-decimated, leaf cards thinned (whole
# cards removed at random, the kept ones grown a little to hold the crown's coverage) -> LOD1 the same, harder.
import bpy, bmesh, sys, os, json, math, re, random, mathutils
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
SPEC_ALL = json.load(open(argv[0])); KEY = argv[1]; OUT = argv[2]; REPORT = argv[3] if len(argv) > 3 else None
S = dict(SPEC_ALL['defaults']); S.update(SPEC_ALL['species'][KEY])
ROOT = os.path.abspath(os.path.join(os.path.dirname(argv[0]), '..', '..', '..'))
SRC = os.path.join(ROOT, S['src'])
TMP = os.path.join(OUT, '_tmp_' + KEY); os.makedirs(TMP, exist_ok=True)
rnd = random.Random(S.get('seed', 7))
log = lambda *a: print('[veg]', KEY, *a, flush=True)

bpy.ops.wm.open_mainfile(filepath=SRC, load_ui=False, use_scripts=False)
sc = bpy.context.scene; dg = bpy.context.evaluated_depsgraph_get()

# ---------------- pick + bake objects ----------------
pick = S.get('pick', {})
def bbox_center(o):
    cs = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    return sum(cs, mathutils.Vector()) / 8
cands = []
for o in sc.objects:
    if o.type != 'MESH' or not o.visible_get(): continue
    if 'names' in pick and not re.search(pick['names'], o.name): continue
    if 'exclude' in pick and re.search(pick['exclude'], o.name): continue
    if 'box' in pick:
        c = bbox_center(o); b = pick['box']
        if not (b[0] <= c.x <= b[1] and b[2] <= c.y <= b[3]): continue
    cands.append(o)
assert cands, 'no objects picked'
objs = []
for o in cands:
    e = o.evaluated_get(dg); me = bpy.data.meshes.new_from_object(e, preserve_all_data_layers=False, depsgraph=dg); me.transform(o.matrix_world)
    if not len(me.polygons): continue
    n = bpy.data.objects.new(o.name + '_w', me); sc.collection.objects.link(n); objs.append(n)
for o in list(sc.objects):
    if o not in objs: bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
for o in objs: o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
if len(objs) > 1: bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active; me = ob.data
# keep only the first uv map, no color attributes
while len(me.uv_layers) > 1: me.uv_layers.remove(me.uv_layers[-1])
for a in list(me.color_attributes): me.color_attributes.remove(a)

# ---------------- normalize: meters, base at the origin ----------------
co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
_bx = S.get('bark', '^$'); _bs = [i for i, sl in enumerate(ob.material_slots) if sl.material and re.search(_bx, sl.material.name) and not (S.get('drop') and re.search(S['drop'], sl.material.name))]
_bv = set()
if _bs:
    for p in me.polygons:
        if p.material_index in _bs: _bv.update(p.vertices)
base = co[sorted(_bv)] if len(_bv) > 8 else co
z0, z1 = float(base[:, 2].min()), float(co[:, 2].max())
H = float(S['height']); s = H / (z1 - z0)
if S.get('width'): s = float(S['width']) / float(max(np.ptp(co[:, 0]), np.ptp(co[:, 1])))
sz = (float(S['zheight']) / (z1 - z0)) if S.get('zheight') else s  # flat source (agave): its own vertical scale
pz = z0 + (z1 - z0) * S.get('baseBand', 0.03)
low = base[base[:, 2] <= pz]
cx, cy = (float(low[:, 0].mean()), float(low[:, 1].mean())) if len(low) else (float(co[:, 0].mean()), float(co[:, 1].mean()))
if 'pivot' in S: cx, cy = S['pivot']
if S.get('pivotBox'): cx, cy = float((co[:, 0].min() + co[:, 0].max()) / 2), float((co[:, 1].min() + co[:, 1].max()) / 2)
co[:, 0] = (co[:, 0] - cx) * s; co[:, 1] = (co[:, 1] - cy) * s; co[:, 2] = (co[:, 2] - z0) * sz - S.get('sink', 0.0) * H
if S.get('rotZ'): a = math.radians(S['rotZ']); c, sn = math.cos(a), math.sin(a); x = co[:, 0].copy(); co[:, 0] = x * c - co[:, 1] * sn; co[:, 1] = x * sn + co[:, 1] * c
me.vertices.foreach_set('co', co.ravel()); me.update()

# ---------------- textures ----------------
def find_tex(mat, sockets):
    if not (mat and mat.use_nodes and mat.node_tree): return None
    def up(node, depth=0):  # first image node upstream
        if node.type == 'TEX_IMAGE' and node.image: return node
        if depth > 6: return None
        for i in node.inputs:
            for l in i.links:
                r = up(l.from_node, depth + 1)
                if r: return r
        return None
    for n in mat.node_tree.nodes:
        if n.type != 'BSDF_PRINCIPLED': continue
        for sk in sockets:
            inp = n.inputs.get(sk)
            if inp and inp.links:
                r = up(inp.links[0].from_node)
                if r: return r, inp.links[0].from_socket.name
    return None

def load_px(img, maxpx):
    img.reload() if img.packed_file is None and img.filepath and not img.has_data else None
    w, h = img.size
    if not w: return None
    f = min(1.0, maxpx / max(w, h))
    if f < 1: img.scale(max(4, int(w * f)), max(4, int(h * f)))
    w, h = img.size; px = np.empty(w * h * 4, np.float32); img.pixels.foreach_get(px)
    return px.reshape(h, w, 4)

def img_file(path):
    p = os.path.join(os.path.dirname(SRC), path) if not os.path.isabs(path) else path
    return bpy.data.images.load(p, check_existing=True)

def resize_to(a, h, w):  # nearest-ish box resize with numpy (alpha maps of another size)
    if a.shape[0] == h and a.shape[1] == w: return a
    yi = (np.arange(h) * a.shape[0] / h).astype(int); xi = (np.arange(w) * a.shape[1] / w).astype(int)
    return a[yi][:, xi]

def rgb2hsv(c):
    r, g, b = c[..., 0], c[..., 1], c[..., 2]; mx = np.max(c[..., :3], -1); mn = np.min(c[..., :3], -1); d = mx - mn + 1e-6
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6.0
    return h % 1.0, np.where(mx > 1e-5, (mx - mn) / (mx + 1e-6), 0), mx
def hsv2rgb(h, s, v):
    i = np.floor(h * 6) % 6; f = h * 6 - np.floor(h * 6); p = v * (1 - s); q = v * (1 - f * s); t = v * (1 - (1 - f) * s)
    r = np.choose(i.astype(int), [v, q, p, p, t, v]); g = np.choose(i.astype(int), [t, v, v, q, p, p]); b = np.choose(i.astype(int), [p, p, t, v, v, q])
    return np.stack([r, g, b], -1)

def sstep(a, b, x): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def green_w(hh, ss):  # foliage texels: yellow-green .. blue-green with some saturation
    dh = np.abs(((hh * 360 - 100 + 180) % 360) - 180)
    return (1 - sstep(55, 80, dh)) * sstep(0.06, 0.16, ss)

def grade(rgb, a, target, fam, k, every=False):
    hh, ss, vv = rgb2hsv(rgb)
    m = a > 0.5
    if every: w = m.astype(np.float32)
    elif fam == 'bark':
        w = (1 - green_w(hh, ss)) * m
    else:
        w = green_w(hh, ss) * m
    if w.sum() < 50: return rgb, None
    # circular mean hue
    ang = hh * 2 * np.pi; mh = math.atan2(float((np.sin(ang) * w).sum()), float((np.cos(ang) * w).sum())) / (2 * np.pi) % 1
    ms = float((ss * w).sum() / w.sum()); mv = float((vv * w).sum() / w.sum())
    th, ts, tv = target[0] / 360.0, target[1], target[2]
    dh = ((th - mh + 0.5) % 1) - 0.5
    fs = np.clip(ts / max(ms, 1e-3), 0.55, 1.8); fv = np.clip(tv / max(mv, 1e-3), 0.55, 1.9 if fam != 'bark' else 3.0)
    ww = (np.ones_like(hh) if every else green_w(hh, ss) if fam != 'bark' else (1 - green_w(hh, ss))) * k
    h2 = (hh + dh * ww) % 1; s2 = np.clip(ss * (1 + (fs - 1) * ww), 0, 1); v2 = np.clip(vv * (1 + (fv - 1) * ww), 0, 1)
    out = hsv2rgb(h2, s2, v2)
    w2 = w; ang2 = h2 * 2 * np.pi; ah = math.atan2(float((np.sin(ang2) * w2).sum()), float((np.cos(ang2) * w2).sum())) / (2 * np.pi) % 1
    return out, {'before': [round(mh * 360, 1), round(ms, 3), round(mv, 3)], 'after': [round(ah * 360, 1), round(float((s2 * w2).sum() / w2.sum()), 3), round(float((v2 * w2).sum() / w2.sum()), 3)], 'target': target}

def bleed(rgb, a):  # fill transparent texels with the average of nearby opaque ones (pyramid push-pull)
    levels = []; c = rgb * a[..., None]; w = a.copy()
    while min(c.shape[:2]) > 4:
        levels.append((c, w)); h2, w2 = c.shape[0] // 2 * 2, c.shape[1] // 2 * 2
        c = c[:h2, :w2].reshape(h2 // 2, 2, w2 // 2, 2, 3).sum((1, 3)); w = w[:h2, :w2].reshape(h2 // 2, 2, w2 // 2, 2).sum((1, 3))
    fill = c / np.maximum(w, 1e-6)[..., None]
    for c0, w0 in reversed(levels):
        up = np.repeat(np.repeat(fill, 2, 0), 2, 1); up = np.pad(up, ((0, c0.shape[0] - up.shape[0]), (0, c0.shape[1] - up.shape[1]), (0, 0)), mode='edge')
        cur = c0 / np.maximum(w0, 1e-6)[..., None]; t = np.clip(w0, 0, 1)[..., None]
        fill = cur * t + up * (1 - t)
    return np.where(a[..., None] > 0.02, rgb, fill)

def save_img(name, arr, alpha=True):
    h, w = arr.shape[:2]
    im = bpy.data.images.new(name, w, h, alpha=alpha)
    px = np.ones((h, w, 4), np.float32); px[..., :arr.shape[2]] = arr
    im.pixels.foreach_set(px.ravel()); p = os.path.join(TMP, name + '.png'); im.filepath_raw = p; im.file_format = 'PNG'; im.save()
    return im

texfix = S.get('texfix', {})
def fix_for(name):
    for rx, f in texfix.items():
        if re.search(rx, name): return f
    return {}

# ---------------- materials -> families ----------------
bark_rx = S.get('bark', '^$'); drop_rx = S.get('drop')
grades = {}; newmats = {}; slot_map = {}; leaf_slots = set(); drop_slots = set()
proc_cache = {}
def processed(fam, cimg, aimg, akind, nimg, fx):
    key = (fam, cimg.name if cimg else None, aimg.name if aimg else None, akind, nimg.name if nimg else None, json.dumps(fx, sort_keys=True))
    if key in proc_cache: return proc_cache[key]
    maxpx = S['texLeaf'] if fam == 'leaf' else S['texBark']
    px = load_px(cimg, maxpx) if cimg else None
    if px is None: px = np.ones((8, 8, 4), np.float32) * np.array([0.35, 0.3, 0.25, 1], np.float32)
    rgb = px[..., :3].copy(); a = np.ones(rgb.shape[:2], np.float32)
    if fam == 'leaf':
        if akind == 'colorA': a = px[..., 3].copy()
        elif akind == 'map' and aimg is not None:
            ap = load_px(aimg, maxpx); a = resize_to(ap[..., :3].mean(-1) if ap[..., 3].min() > 0.99 else ap[..., 3], *rgb.shape[:2]).astype(np.float32)
        elif akind == 'lumakey':
            lum = rgb.mean(-1); a = 1 - sstep(fx.get('keyLo', 0.72), fx.get('keyHi', 0.9), lum)
            rgb = np.clip((rgb - (1 - a[..., None])) / np.maximum(a[..., None], 0.05), 0, 1)
        elif akind == 'blackkey':
            lum = rgb.max(-1); a = sstep(0.03, 0.12, lum)
    if 'tint' in fx:  # recolor (white flowers -> bougainvillea magenta / hibiscus red)
        t = np.array(fx['tint'], np.float32); lum = rgb.mean(-1, keepdims=True)
        rgb = np.clip(t * (lum / max(float(lum[a > 0.5].mean()) if (a > 0.5).any() else 0.5, 0.05)) * fx.get('tintGain', 0.9), 0, 1)
    tgt = fx.get('grade') or (S['gradeLeaf'] if fam == 'leaf' else S['gradeBark'])
    if tgt and not fx.get('nograde'):
        rgb, st = grade(rgb, a, tgt, fam, fx.get('gradeK', S.get('gradeK', 0.85)), bool(fx.get('gradeAll')))
        if st: grades[(cimg.name if cimg else '?') + ':' + fam] = st
    if fam == 'leaf': rgb = bleed(rgb, a)
    nm = ('leaf' if fam == 'leaf' else 'bark') + '_' + str(len(proc_cache))
    out_c = save_img(nm + '_c', np.concatenate([rgb, a[..., None]], -1) if fam == 'leaf' else rgb, alpha=(fam == 'leaf'))
    out_n = None
    if nimg is not None and S.get('normals', True):
        np_ = load_px(nimg, S['texNormal'])
        if np_ is not None: out_n = save_img(nm + '_n', np_[..., :3], alpha=False); out_n.colorspace_settings.name = 'Non-Color'
    proc_cache[key] = (nm, out_c, out_n)
    return proc_cache[key]

def build_mat(nm, cimg, nimg, fam):
    if nm in newmats: return newmats[nm]
    m = bpy.data.materials.new(nm); m.use_nodes = True; nt = m.node_tree; bs = nt.nodes.get('Principled BSDF')
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = cimg; nt.links.new(t.outputs['Color'], bs.inputs['Base Color'])
    if fam == 'leaf': nt.links.new(t.outputs['Alpha'], bs.inputs['Alpha'])
    if nimg is not None:
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = nimg; nm_ = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(tn.outputs['Color'], nm_.inputs['Color']); nt.links.new(nm_.outputs['Normal'], bs.inputs['Normal'])
    bs.inputs['Roughness'].default_value = 0.85 if fam == 'bark' else 0.7
    newmats[nm] = m; return m

for i, sl in enumerate(ob.material_slots):
    mt = sl.material; name = mt.name if mt else 'none'
    if drop_rx and re.search(drop_rx, name): drop_slots.add(i); continue
    fx = fix_for(name)
    fam = fx.get('fam') or ('bark' if re.search(bark_rx, name) else 'leaf')
    c = find_tex(mt, ['Base Color']); cimg = img_file(fx['color']) if 'color' in fx else (c[0].image if c else None)
    akind = fx.get('alpha'); aimg = None
    if fam == 'leaf' and akind is None:
        r = find_tex(mt, ['Alpha'])
        if r and r[0].image == cimg and r[1] == 'Alpha': akind = 'colorA'
        elif r: akind = 'map'; aimg = r[0].image
        else: akind = 'colorA' if cimg and cimg.channels == 4 else 'none'
    elif fam == 'leaf' and akind not in ('colorA', 'lumakey', 'blackkey', 'none'): aimg = img_file(akind); akind = 'map'
    n = find_tex(mt, ['Normal']); nimg = img_file(fx['normal']) if 'normal' in fx else (n[0].image if n else None)
    nm, oc, on = processed(fam, cimg, aimg, akind, nimg, {k: v for k, v in fx.items() if k in ('tint', 'tintGain', 'grade', 'nograde', 'keyLo', 'keyHi', 'gradeAll', 'gradeK')})
    slot_map[i] = build_mat(nm, oc, on, fam)
    if fam == 'leaf': leaf_slots.add(i)
    log('mat', name, '->', nm, fam, akind, cimg.name if cimg else None, cimg.size[:] if cimg else None)

# bloom variant (poinciana): a tinted copy of the leaf material on a share of the leaf cards
bloom = S.get('bloom')
bloom_mat = None
if bloom:
    base_i = min(leaf_slots); base = slot_map[base_i]; bimg = base.node_tree.nodes['Image Texture'].image
    px = np.empty(bimg.size[0] * bimg.size[1] * 4, np.float32); bimg.pixels.foreach_get(px); px = px.reshape(bimg.size[1], bimg.size[0], 4)
    rgb = px[..., :3]; hh, ss, vv = rgb2hsv(rgb); w = green_w(hh, ss)[..., None]; lum = rgb.mean(-1, keepdims=True)
    t = np.array(bloom['tint'], np.float32); var = 0.75 + 0.5 * np.clip(lum / max(float(lum.mean()), 0.05), 0, 2) * 0.5
    if bloom.get('clusters'):  # flower clusters with green leaflets between them (not a full red shell): a blobby mask in texture space
        rs = np.random.RandomState(S.get('seed', 7) + 11); g = rs.rand(28, 28).astype(np.float32); H, Wd = rgb.shape[:2]
        yi = np.linspace(0, 27, H); xi = np.linspace(0, 27, Wd); y0 = np.floor(yi).astype(int); x0 = np.floor(xi).astype(int); y1 = np.minimum(y0 + 1, 27); x1 = np.minimum(x0 + 1, 27); fy = (yi - y0)[:, None]; fx = (xi - x0)[None, :]
        up = g[y0][:, x0] * (1 - fy) * (1 - fx) + g[y0][:, x1] * (1 - fy) * fx + g[y1][:, x0] * fy * (1 - fx) + g[y1][:, x1] * fy * fx
        c = float(bloom['clusters']); m = np.clip((up - (1 - c) + 0.08) / 0.16, 0, 1)
        w = w * m[..., None]
    rgb2 = rgb * (1 - w * bloom.get('amount', 0.92)) + np.clip(t * var, 0, 1) * w * bloom.get('amount', 0.92)
    bi = save_img('leafbloom_c', np.concatenate([rgb2, px[..., 3:4]], -1), alpha=True)
    bloom_mat = build_mat('leafbloom', bi, base.node_tree.nodes.get('Image Texture.001').image if base.node_tree.nodes.get('Image Texture.001') else None, 'leaf')

# rebuild the slot list: one slot per new material
uniq = []
for i in sorted(slot_map):
    if slot_map[i] not in uniq: uniq.append(slot_map[i])
if bloom_mat: uniq.append(bloom_mat)
idx_of = {m.name: k for k, m in enumerate(uniq)}
remap = {i: idx_of[slot_map[i].name] for i in slot_map}
mi = np.empty(len(me.polygons), np.int32); me.polygons.foreach_get('material_index', mi)
keep_poly = np.array([i not in drop_slots for i in mi])
if (~keep_poly).any():
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[k] for k in np.nonzero(~keep_poly)[0]], context='FACES'); bm.to_mesh(me); bm.free()
    mi = np.empty(len(me.polygons), np.int32); me.polygons.foreach_get('material_index', mi)
newmi = np.array([remap.get(int(i), 0) for i in mi], np.int32)
me.materials.clear()
for m in uniq: me.materials.append(m)
me.polygons.foreach_set('material_index', newmi); me.update()
leaf_idx = {idx_of[m.name] for m in uniq if m.name.startswith('leaf')}
bark_idx = {idx_of[m.name] for m in uniq if m.name.startswith('bark')}

# ---------------- leaf cards: components, bloom assignment, thinning ----------------
def tri_count(mesh, idxs=None):
    n = np.empty(len(mesh.polygons), np.int32); mesh.polygons.foreach_get('loop_total', n)
    if idxs is None: return int((n - 2).sum())
    m = np.empty(len(mesh.polygons), np.int32); mesh.polygons.foreach_get('material_index', m)
    return int(((n - 2) * np.isin(m, list(idxs))).sum())

def components(bm, idxs):  # leaf faces grouped by shared vertices
    parent = {}
    def find(x):
        while parent.get(x, x) != x: parent[x] = parent.get(parent[x], parent[x]); x = parent[x]
        return x
    faces = [f for f in bm.faces if f.material_index in idxs]
    for f in faces:
        vs = [v.index for v in f.verts]; r0 = find(vs[0])
        for v in vs[1:]:
            r = find(v)
            if r != r0: parent[r] = r0
    groups = {}
    for f in faces: groups.setdefault(find(f.verts[0].index), []).append(f)
    return list(groups.values())

def thin(mesh, budget, grow_cap, seed, bloom_frac=0.0):
    leaf_t = tri_count(mesh, leaf_idx)
    p = 1.0 if not budget or leaf_t <= budget else budget / leaf_t
    if p >= 1 and not bloom_frac: return leaf_t, leaf_t
    r = random.Random(seed); bm = bmesh.new(); bm.from_mesh(mesh); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    comps = components(bm, leaf_idx)
    # big components (whole crowns as one mesh) cannot be thinned card by card: keep them, thin the rest harder
    big = [c for c in comps if len(c) > max(64, leaf_t * 0.08)]
    small = [c for c in comps if not (len(c) > max(64, leaf_t * 0.08))]
    tb = sum(len(c) for c in big); ts = max(1, sum(len(c) for c in small))
    ps = 1.0 if p >= 1 else max(0.05, min(1.0, (budget - tb) / ts)) if budget > tb else 0.05
    gs = min(grow_cap, ps ** -0.3) if ps < 1 else 1.0
    kill = []
    for c in small:
        if r.random() > ps: kill.extend(c); continue
        vs = {v for f in c for v in f.verts}; ctr = sum((v.co for v in vs), mathutils.Vector()) / len(vs)
        if gs > 1.001:
            for v in vs: v.co = ctr + (v.co - ctr) * gs
        if bloom_frac and r.random() < bloom_frac:
            for f in c: f.material_index = idx_of['leafbloom']
    if bloom_frac:
        for c in big:
            if r.random() < bloom_frac:
                for f in c: f.material_index = idx_of['leafbloom']
    if kill: bmesh.ops.delete(bm, geom=kill, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    if loose: bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(mesh); bm.free(); mesh.update()
    return leaf_t, tri_count(mesh, leaf_idx)

def decimate_bark(o, budget, idxs=None):  # collapse-decimate only the faces of the given materials (split off, decimate, join back)
    idxs = bark_idx if idxs is None else idxs
    bt = tri_count(o.data, idxs)
    if not budget or bt <= budget or not idxs: return bt, bt
    part = o.copy(); part.data = o.data.copy(); sc.collection.objects.link(part)
    def keep_only(mesh, inside):
        bm = bmesh.new(); bm.from_mesh(mesh); kill = [f for f in bm.faces if (f.material_index in idxs) != inside]
        if kill: bmesh.ops.delete(bm, geom=kill, context='FACES')
        loose = [v for v in bm.verts if not v.link_faces]
        if loose: bmesh.ops.delete(bm, geom=loose, context='VERTS')
        bm.to_mesh(mesh); bm.free(); mesh.update()
    keep_only(part.data, True); keep_only(o.data, False)
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = part; part.select_set(True)
    m = part.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = max(0.01, budget / bt); m.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='dec')
    bpy.ops.object.select_all(action='DESELECT'); part.select_set(True); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.join()
    return bt, tri_count(o.data, idxs)

def prune_bark(o, budget):  # twigs as separate little meshes collapse badly: drop the smallest bark pieces (hidden in the crown) first
    bt = tri_count(o.data, bark_idx)
    if not budget or bt <= budget * 1.15 or not bark_idx: return
    bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
    comps = components(bm, bark_idx)
    def diag(c):
        vs = [v.co for f in c for v in f.verts]; xs = [v.x for v in vs]; ys = [v.y for v in vs]; zs = [v.z for v in vs]
        return (max(xs) - min(xs)) ** 2 + (max(ys) - min(ys)) ** 2 + (max(zs) - min(zs)) ** 2
    comps.sort(key=diag); total = sum(len(f.verts) - 2 for c in comps for f in c); kill = []
    for c in comps:
        if total <= budget: break
        kill.extend(c); total -= sum(len(f.verts) - 2 for f in c)
    if kill: bmesh.ops.delete(bm, geom=kill, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    if loose: bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(o.data); bm.free(); o.data.update()

def triangulate(o):
    bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(o.data); bm.free()

tris_src = tri_count(me)
LM = S.get('leafMode', 'thin')
def leaf_reduce(budget, grow, seed, bf=0):
    if LM == 'none': return thin(ob.data, 0, 1, seed, bf)
    if LM == 'decimate': r = thin(ob.data, 0, 1, seed, bf); return decimate_bark(ob, budget, leaf_idx)
    r = thin(ob.data, budget, grow, seed, bf)
    if budget and r[1] > budget * 1.15: r = (r[0], decimate_bark(ob, budget, leaf_idx)[1])  # crowns made of a few big connected meshes
    return r
lt0 = leaf_reduce(S['leaf0'], S.get('grow0', 1.35), S.get('seed', 7), bloom['fraction'] if bloom else 0)
bt0 = decimate_bark(ob, S['bark0']); prune_bark(ob, S['bark0']); bt0 = (bt0[0], tri_count(ob.data, bark_idx))
triangulate(ob)
tris0 = tri_count(ob.data)

def export(path, images):
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_image_format=('WEBP' if images else 'NONE'),
                              export_image_quality=S.get('webpQ', 88), export_materials='EXPORT', export_yup=True, export_vertex_color='NONE', export_normals=True, export_tangents=False, export_texcoords=True)

def measure(mesh):
    c = np.empty(len(mesh.vertices) * 3, np.float32); mesh.vertices.foreach_get('co', c); c = c.reshape(-1, 3)
    m = np.empty(len(mesh.polygons), np.int32); mesh.polygons.foreach_get('material_index', m)
    lv = set()
    for p in mesh.polygons:
        if p.material_index in leaf_idx or (bloom_mat and p.material_index == idx_of.get('leafbloom')): lv.update(p.vertices)
    lz = c[list(lv), 2] if lv else c[:, 2]
    return {'height': round(float(c[:, 2].max()), 3), 'radius': round(float(np.hypot(c[:, 0], c[:, 1]).max()), 3), 'crownFrom': round(float(np.percentile(lz, 3)) / max(1e-3, float(c[:, 2].max())), 3),
            'bottom': round(float(c[:, 2].min()), 3)}

os.makedirs(OUT, exist_ok=True)
p0 = os.path.join(OUT, KEY + '.glb'); export(p0, True)
info0 = measure(ob.data)
lt1 = leaf_reduce(S['leaf1'], S.get('grow1', 1.6), S.get('seed', 7) + 101)
bt1 = decimate_bark(ob, S['bark1']); prune_bark(ob, S['bark1']); bt1 = (bt1[0], tri_count(ob.data, bark_idx))
triangulate(ob)
tris1 = tri_count(ob.data)
p1 = os.path.join(OUT, KEY + '_lod1.glb'); export(p1, False)
rep = {'key': KEY, 'src': S['src'], 'tris_src': tris_src, 'tris0': tris0, 'tris1': tris1, 'leaf0': lt0, 'bark0': bt0, 'leaf1': lt1, 'bark1': bt1, **info0,
       'mats': [m.name for m in uniq], 'grades': grades, 'kb0': os.path.getsize(p0) // 1024, 'kb1': os.path.getsize(p1) // 1024}
log('DONE', json.dumps(rep))
if REPORT:
    allr = json.load(open(REPORT)) if os.path.exists(REPORT) else {}
    allr[KEY] = rep; json.dump(allr, open(REPORT, 'w'), indent=1)
import shutil; shutil.rmtree(TMP, ignore_errors=True)
