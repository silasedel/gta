# Nico's main car (ute1): a 1970-style coupe-utility rebuilt on the body shape of a low-poly shell (docs/v2/plan/nico_car/SOURCE.md).
# Only the silhouette / proportions of the source are kept; everything else is rebuilt here:
#   body: one Catmull-Clark level with creased panel edges (rounded, no faceting), the source's panel lines turned into real
#         recessed shut lines (hood, doors, tailgate, fenders), paint = one repaintable slot (yellow + stripe from the game look)
#   chrome bumpers, window trim, drip and bed rails, bullet mirrors, dual exhaust tips; tinted glass; lamp units with lenses
#   bed: ribbed floor, ribbed side walls, bulkhead and tailgate;  cabin: tan leather buckets, console, dash with gauges,
#         3-spoke wheel, door cards, carpet, headliner;  wheels: downloaded 5-spoke chrome rim + tyre (prep_wheel.py), FL FR RL RR
#   front / rear plate recesses (the game mounts a 0.305 m plate there), no lettering or badges anywhere.
# blender -b --factory-startup -P tools/v2/cars/ute1/build_ute1.py -- <source.fbx> <out.blend>
# wheels come from <source dir>/wheel/wheel_parts.blend, made once from the downloaded rim + tyre by:
#   blender -b --factory-startup --disable-autoexec -P tools/v2/cars/ute1/prep_wheel.py -- Models/_Inbox/shiny-rim/source/rim2.blend \
#           Models/_Inbox/tyres/source/tyre.fbx "<source dir>/wheel/wheel_parts.blend"
# Output = a clean source for tools/v2/cars/convert.py (cars.json key ute1: material names U_* -> slots).
import bpy, bmesh, sys, math, os
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC)
for o in list(bpy.data.objects):
    if o.name != 'body': bpy.data.objects.remove(o, do_unlink=True)
SRCO = bpy.data.objects['body']
SRCMAT = [m.name for m in SRCO.data.materials]

# ------------------------------------------------------------------ materials (names map to convert.py slots in cars.json)
def lin(h):
    c = [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255]
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)
MATS = {}
def mat(name, hexc, rough=0.5, metal=0.0, alpha=1.0, trans=0.0, emis=0.0):
    m = bpy.data.materials.new(name)
    if not m.node_tree: m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = lin(hexc); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    b.inputs['Alpha'].default_value = alpha
    if 'Transmission Weight' in b.inputs: b.inputs['Transmission Weight'].default_value = trans
    if emis:
        b.inputs['Emission Color'].default_value = lin(hexc); b.inputs['Emission Strength'].default_value = emis
    m.diffuse_color = lin(hexc)[:3] + (alpha,)
    MATS[name] = m; return m
mat('U_Paint', 0xf2a90f, 0.2)
mat('U_Gap', 0x0a0a0b, 0.7)
mat('U_Chrome', 0xeeeff1, 0.17, 1.0)   # bright neutral: a little blur so it averages sky + ground, not a dark-blue sky mirror
mat('U_Stripe', 0xd8461a, 0.3)
mat('U_Black', 0x141416, 0.6)
mat('U_Under', 0x151515, 0.85)
mat('U_Glass', 0x1a2224, 0.05, 0, 0.35, 1.0)
mat('U_Lens', 0xf4f4f4, 0.05, 0, 0.3, 1.0)
mat('U_Head', 0xfff4dc, 0.2, 0, 1, 0, 2)
mat('U_Tail', 0xb0140c, 0.3, 0, 1, 0, 2)
mat('U_Rev', 0xf0f0f0, 0.3, 0, 1, 0, 2)
mat('U_Amber', 0xe8820e, 0.3, 0, 1, 0, 2)
mat('U_Recess', 0x0c0c0d, 0.7)
mat('U_Leather', 0x8a5634, 0.55)
mat('U_LeatherDk', 0x5a3420, 0.6)
mat('U_Dash', 0x2a1a12, 0.65)
mat('U_Carpet', 0x2e1d14, 0.95)
mat('U_Liner', 0xb49b7a, 0.9)
mat('U_Gauge', 0x0c0c0c, 0.35)
mat('U_IntChrome', 0xc8cacc, 0.15, 1.0)
mat('U_Tire', 0x121212, 0.9)
mat('U_Rim', 0xf3f4f6, 0.09, 1.0)
mat('U_RimDark', 0x1c1d1f, 0.5, 0.0)
mat('U_Drum', 0x262626, 0.7)
ORDER = list(MATS)
MI = {n: i for i, n in enumerate(ORDER)}

def new_obj(name, bm):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for n in ORDER: me.materials.append(MATS[n])
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); return o

# ------------------------------------------------------------------ source shell: classify, drop the old wheels / badges
bm = bmesh.new(); bm.from_mesh(SRCO.data); bm.transform(SRCO.matrix_world)
import os
if not os.environ.get('NODBL'): bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0002)
bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
def islands(bm_):
    seen, out = set(), []
    for f0 in bm_.faces:
        if f0.index in seen: continue
        st, comp = [f0], []; seen.add(f0.index)
        while st:
            f = st.pop(); comp.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g.index not in seen: seen.add(g.index); st.append(g)
        out.append(comp)
    return out
ISL = islands(bm)
def bbox(fs):
    P = [v.co for f in fs for v in f.verts]
    return Vector([min(p[i] for p in P) for i in range(3)]), Vector([max(p[i] for p in P) for i in range(3)])
kill = set(); role = {}
main = max(ISL, key=len)
for comp in ISL:
    lo, hi = bbox(comp); sz = hi - lo
    if lo.z < 0.02 and sz.z > 0.55 and sz.x < 0.3: kill.update(comp); continue          # source wheels (rebuilt below)
    r = 'main' if comp is main else 'part'
    if abs(lo.y) > 2.2 and abs(hi.y) > 2.2 and sz.x > 1.5 and sz.z < 0.3 and len(comp) < 400: r = 'bumper'
    if 0.75 < abs((lo.x + hi.x) / 2) < 0.95 and -0.75 < lo.y < -0.55 and sz.z < 0.12: r = 'mirror'
    for f in comp: role[f.index] = r
SRCN = lambda f: SRCMAT[f.material_index] if f.material_index < len(SRCMAT) else ''
for f in bm.faces:
    if f in kill: continue
    n = SRCN(f); c = f.calc_center_median(); r = role.get(f.index)
    if n == 'Logo': kill.add(f); continue
    if r == 'bumper': m = 'U_Black' if f.normal.z < -0.6 else 'U_Chrome'
    elif r == 'mirror': m = 'U_Chrome'
    elif n in ('Paint', 'Paint2'): m = 'U_Paint'
    elif n == 'Chrome': m = 'U_Chrome'
    elif n == 'Black': m = 'U_Gap'
    elif n == 'Plastic': m = 'U_Under' if c.z < 0.3 or f.normal.z < -0.5 else 'U_Black'
    elif n == 'Glass': m = 'U_Glass'
    elif n == 'Taillights': m = 'U_Tail' if c.y > 0 else 'U_Amber'
    elif n == 'Lights': m = 'U_Head' if c.y < 0 else 'U_Rev'
    elif n == 'Indicator': m = 'U_Amber'
    elif n == 'Plate': m = 'U_Recess'
    else: m = 'U_Black'
    f.material_index = MI[m]
bmesh.ops.delete(bm, geom=list(kill), context='FACES')
# split: the main body shell gets the subdivision, small parts (grille, lamps, bumpers) keep their hard edges
bm.faces.ensure_lookup_table()
ISL = islands(bm)
main = set(max(ISL, key=len))
bm_shell = bm.copy(); bm_parts = bm
bm_shell.faces.ensure_lookup_table()
mset = {f.index for f in main}
bmesh.ops.delete(bm_shell, geom=[f for f in bm_shell.faces if f.index not in mset], context='FACES')
bm_parts.faces.ensure_lookup_table()
bmesh.ops.delete(bm_parts, geom=[f for f in bm_parts.faces if f.index in mset], context='FACES')

# ------------------------------------------------------------------ shell: creases -> Catmull-Clark x1 -> recessed shut lines
cr = bm_shell.edges.layers.float.new('crease_edge')
for e in bm_shell.edges:
    lf = e.link_faces
    if len(lf) != 2: e[cr] = 1.0; continue
    a, b = lf
    ang = a.normal.angle(b.normal, 0)
    if a.material_index != b.material_index: e[cr] = 1.0
    elif ang > math.radians(55): e[cr] = 0.85
    elif ang > math.radians(32): e[cr] = 0.45
shell = new_obj('shell_src', bm_shell)
sub = shell.modifiers.new('cc', 'SUBSURF'); sub.levels = sub.render_levels = 0 if os.environ.get('NOSUB') else 1; sub.quality = 3
dg = bpy.context.evaluated_depsgraph_get()
me2 = bpy.data.meshes.new_from_object(shell.evaluated_get(dg))
bpy.data.objects.remove(shell, do_unlink=True)
bm = bmesh.new(); bm.from_mesh(me2)
# wheel wells: the dark liners pushed out to 4 cm around the new tires (the game reads the free room above each tire)
WELL_R = 0.376
for v in bm.verts:
    if not v.link_faces or any(f.material_index == MI['U_Paint'] or f.material_index == MI['U_Chrome'] for f in v.link_faces): continue
    for cy in (-1.65, 1.27):
        if abs(abs(v.co.x) - 0.765) > 0.15: continue
        d = Vector((0, v.co.y - cy, v.co.z - 0.335))
        if d.length < WELL_R and v.co.z > 0.335: v.co = Vector((v.co.x, cy, 0.335)) + d.normalized() * WELL_R
# racing stripe (mock-up): a wide band across the rear of the hood that wraps down each front fender behind the wheel
# (a slanted hockey stick) and runs back along both flanks.  Cut into the paint, its own glossy orange-red region.
SZ0, SZ1 = 0.50, 0.60                     # flank band height
HB0, HB1 = -1.52, -0.98                   # hood band (Blender y; front = -y)
SK = 0.43
def stick(c): return c.y + SK * c.z      # hockey stick: y + SK z in [ST0, ST1] (behind the front arch, leans forward going up)
ST0, ST1 = -1.085, -0.915
for co, no in (((0, 0, SZ0), (0, 0, 1)), ((0, 0, SZ1), (0, 0, 1)), ((0, HB0, 0), (0, 1, 0)), ((0, HB1, 0), (0, 1, 0)),
               ((0, ST0, 0), (0, 1, SK)), ((0, ST1, 0), (0, 1, SK))):
    pf = [f for f in bm.faces if f.material_index == MI['U_Paint']]
    ge = list({e for f in pf for e in f.edges}) + list({v for f in pf for v in f.verts}) + pf
    bmesh.ops.bisect_plane(bm, geom=ge, plane_co=Vector(co), plane_no=Vector(no).normalized())
nst = 0
for f in bm.faces:
    if f.material_index != MI['U_Paint']: continue
    c, n = f.calc_center_median(), f.normal
    side = abs(n.x) > 0.45 and abs(c.x) > 0.8
    hood = n.z > 0.55 and c.z > 0.72 and HB0 < c.y < HB1 and abs(c.x) < 0.84
    stk = side and ST0 < stick(c) < ST1 and SZ0 < c.z < 0.95 and c.y < -0.9
    flank = side and SZ0 < c.z < SZ1 and stick(c) > ST0 and c.y < 2.2
    if hood or stk or flank: f.material_index = MI['U_Stripe']; nst += 1
print('[ute1] stripe faces', nst)
# shut lines: thin dark strips (the source's drawn panel lines) become 6 mm deep grooves
gaps = [f for f in bm.faces if f.material_index == MI['U_Gap'] and f.calc_area() < 0.004]
gset = set(gaps)
# keep only strips that sit between paint faces (panel lines), not the arch liners / window surrounds
def is_line(f):
    return sum(1 for e in f.edges for g in e.link_faces if g is not f and g.material_index in (MI['U_Paint'], MI['U_Stripe'])) >= 1
gl = [f for f in gaps if is_line(f)]
if gl: bmesh.ops.inset_region(bm, faces=gl, thickness=0.0012, depth=-0.006, use_even_offset=True)
log_gap = len(gl)
bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if f.material_index == MI['U_Glass']])
# winding: a face whose front side is blocked by the body while its back looks out into the open is flipped (the source has
# ~15 % inverted paint panels; the game's paint is single sided)
bm.faces.ensure_lookup_table(); _bv = BVHTree.FromBMesh(bm); nflip = 0
for f in bm.faces:
    c, n = f.calc_center_median(), f.normal.copy()
    if n.length < 0.5: continue
    hp = _bv.ray_cast(c + n * 0.003, n, 3.0)[0]; hn = _bv.ray_cast(c - n * 0.003, -n, 3.0)[0]
    if hp is not None and hn is None: f.normal_flip(); nflip += 1
print('[ute1] flipped shell faces', nflip)
shellO = new_obj('body_shell', bm)
for p in shellO.data.polygons: p.use_smooth = True
BVH_bm = bmesh.new(); BVH_bm.from_mesh(shellO.data); BVH_bm.faces.ensure_lookup_table()
BVH = BVHTree.FromBMesh(BVH_bm)
def ray(p, d, dist=4.0):
    h = BVH.ray_cast(Vector(p), Vector(d).normalized(), dist)
    if h[0] is None: return None
    return h[0], BVH_bm.faces[h[2]].normal.copy(), BVH_bm.faces[h[2]].material_index

# small parts: bumpers bevelled, smooth shaded by angle
partsO = new_obj('body_parts', bm_parts)
bv = partsO.modifiers.new('bv', 'BEVEL'); bv.width = 0.006; bv.segments = 2; bv.limit_method = 'ANGLE'; bv.angle_limit = math.radians(40)
for p in partsO.data.polygons: p.use_smooth = True

# ------------------------------------------------------------------ helpers for new parts
class MB:   # mesh builder
    def __init__(s): s.bm = bmesh.new()
    def face(s, pts, m):
        vs = [s.bm.verts.new(Vector(p)) for p in pts]
        f = s.bm.faces.new(vs); f.material_index = MI[m]; f.smooth = True; return f
    def box(s, c, size, m, bevel=0.0, rot=None):
        g = bmesh.ops.create_cube(s.bm, size=1.0)
        vs = g['verts']
        M_ = Matrix.Translation(Vector(c)) @ (rot.to_4x4() if rot else Matrix.Identity(4)) @ Matrix.Diagonal(Vector(size).to_4d())
        bmesh.ops.transform(s.bm, matrix=M_, verts=vs)
        fs = list({f for v in vs for f in v.link_faces})
        for f in fs: f.material_index = MI[m]; f.smooth = False
        if bevel > 0:
            es = list({e for v in vs for e in v.link_edges})
            bmesh.ops.bevel(s.bm, geom=es, offset=bevel, segments=2, affect='EDGES', profile=0.5)
        return vs
    def lathe(s, prof, n, m, axis_x=True, close=False, a0=0.0, a1=2 * math.pi, M_=None):
        # prof: [(r, x)], revolve about the X axis (wheel frame)
        rings = []
        full = abs(a1 - a0 - 2 * math.pi) < 1e-6
        cnt = n if full else n + 1
        for i in range(cnt):
            a = a0 + (a1 - a0) * i / n
            ring = []
            for r, x in prof:
                p = Vector((x, r * math.cos(a), r * math.sin(a)))
                if M_: p = M_ @ p
                ring.append(s.bm.verts.new(p))
            rings.append(ring)
        for i in range(n if full else n):
            A, B = rings[i], rings[(i + 1) % cnt]
            for j in range(len(prof) - 1):
                f = s.bm.faces.new((A[j], B[j], B[j + 1], A[j + 1])); f.material_index = MI[m]; f.smooth = True
        return rings
    def tube(s, path, rad, m, seg=10, closed=False):   # sweep a circle along a polyline
        rings = []
        for i, p in enumerate(path):
            p = Vector(p)
            t = (Vector(path[min(i + 1, len(path) - 1)]) - Vector(path[max(i - 1, 0)])).normalized() if not closed else (Vector(path[(i + 1) % len(path)]) - Vector(path[i - 1])).normalized()
            u = t.cross(Vector((0, 0, 1))) if abs(t.z) < 0.9 else t.cross(Vector((1, 0, 0)))
            u.normalize(); w = t.cross(u)
            rings.append([s.bm.verts.new(p + (u * math.cos(a) + w * math.sin(a)) * rad) for a in [2 * math.pi * k / seg for k in range(seg)]])
        L = len(rings)
        for i in range(L if closed else L - 1):
            A, B = rings[i], rings[(i + 1) % L]
            for k in range(seg):
                f = s.bm.faces.new((A[k], A[(k + 1) % seg], B[(k + 1) % seg], B[k])); f.material_index = MI[m]; f.smooth = True
        return rings
    def obj(s, name):
        bmesh.ops.recalc_face_normals(s.bm, faces=s.bm.faces)
        return new_obj(name, s.bm)

# ------------------------------------------------------------------ bed: ribbed floor, ribbed walls (paint)
def rib_strip(B, samples, wb, wt, h, m='U_Paint'):
    # samples: [(point, normal, tangent)]: trapezoid rib standing on the surface
    secs = []
    for p, n, t in samples:
        sd = t.cross(n).normalized()
        q = [p - sd * wb / 2 - n * 0.002, p - sd * wt / 2 + n * h, p + sd * wt / 2 + n * h, p + sd * wb / 2 - n * 0.002]
        secs.append([B.bm.verts.new(x) for x in q])
    for a, b in zip(secs, secs[1:]):
        for k in range(3):
            f = B.bm.faces.new((a[k], b[k], b[k + 1], a[k + 1])); f.material_index = MI[m]; f.smooth = False
    for s_, rev in ((secs[0], True), (secs[-1], False)):
        f = B.bm.faces.new(list(reversed(s_)) if rev else s_); f.material_index = MI[m]
def runs(samples, ok):
    out, cur = [], []
    for s_, k in zip(samples, ok):
        if k: cur.append(s_)
        elif cur: out.append(cur); cur = []
    if cur: out.append(cur)
    return [r for r in out if len(r) >= 2]
B = MB()
FLOORZ = 0.635
# floor ribs: lengthwise, between bulkhead (0.34) and tailgate (2.28), only where the floor is flat (tubs excluded)
for xi in range(-7, 8):
    x = xi * 0.088
    S, K = [], []
    for k in range(0, 50):
        y = 0.37 + k * (2.25 - 0.37) / 49
        h = ray((x, y, 1.3), (0, 0, -1))
        ok = h is not None and h[1].z > 0.97 and abs(h[0].z - FLOORZ) < 0.01 and h[2] == MI['U_Paint']
        S.append((h[0] if h else Vector((x, y, FLOORZ)), Vector((0, 0, 1)), Vector((0, 1, 0)))); K.append(ok)
    for r in runs(S, K): rib_strip(B, r, 0.04, 0.026, 0.011)
# side walls: vertical ribs (stamped) on both inner walls, front bulkhead and tailgate inner face
for side in (1, -1):
    for k in range(0, 13):
        y = 0.45 + k * 0.145
        S, K = [], []
        for j in range(12):
            z = FLOORZ + 0.03 + j * 0.022
            h = ray((0, y, z), (side, 0, 0))
            ok = h is not None and h[2] == MI['U_Paint'] and abs(h[1].x) > 0.85 and h[1].x * side < 0
            S.append((h[0] if h else Vector((side * 0.7, y, z)), (h[1] if h else Vector((-side, 0, 0))), Vector((0, 0, 1)))); K.append(ok)
        for r in runs(S, K): rib_strip(B, r, 0.05, 0.032, 0.008)
for yy, d in ((1.2, -1), (1.2, 1)):
    for xi in range(-5, 6):
        x = xi * 0.11
        S, K = [], []
        for j in range(12):
            z = FLOORZ + 0.03 + j * 0.022
            h = ray((x, yy, z), (0, d, 0))
            ok = h is not None and h[2] == MI['U_Paint'] and abs(h[1].y) > 0.9 and h[1].y * d < 0
            S.append((h[0] if h else Vector((x, yy + d, z)), (h[1] if h else Vector((0, -d, 0))), Vector((0, 0, 1)))); K.append(ok)
        for r in runs(S, K): rib_strip(B, r, 0.05, 0.032, 0.008)
B.obj('bed_ribs')

# ------------------------------------------------------------------ exhaust tips, underbody pan
E = MB()
for sx in (0.42, -0.42):
    M_ = Matrix.Translation((sx, 2.44, 0.215)) @ Matrix.Rotation(math.pi / 2, 4, 'Z')
    E.lathe([(0.0, 0.0), (0.024, 0.0), (0.03, 0.0), (0.032, 0.005), (0.032, 0.11)], 16, 'U_Chrome', M_=Matrix.Translation((sx, 2.48, 0.215)) @ Matrix.Rotation(-math.pi / 2, 4, 'Z'))
E.face([(0.6, -2.1, 0.24), (-0.6, -2.1, 0.24), (-0.6, 2.25, 0.24), (0.6, 2.25, 0.24)], 'U_Under')
E.obj('exhaust_under')

# ------------------------------------------------------------------ cabin
C = MB()
FL_Z = 0.30   # carpet
FW_Y, BH_Y = -1.02, 0.315      # firewall, cab back wall
def inner_x(y, z):
    h = ray((0, y, z), (1, 0, 0)); return (h[0].x if h else 0.86) - 0.02
# carpet floor with a transmission tunnel
C.face([(0.8, FW_Y, FL_Z), (0.8, BH_Y, FL_Z), (0.12, BH_Y, FL_Z), (0.12, FW_Y, FL_Z)][::-1], 'U_Carpet')
C.face([(-0.8, FW_Y, FL_Z), (-0.8, BH_Y, FL_Z), (-0.12, BH_Y, FL_Z), (-0.12, FW_Y, FL_Z)], 'U_Carpet')
C.box((0, (FW_Y + BH_Y) / 2, FL_Z + 0.06), (0.26, BH_Y - FW_Y, 0.12), 'U_Carpet', bevel=0.03)
# toe board / firewall
C.face([(0.82, FW_Y - 0.02, FL_Z), (-0.82, FW_Y - 0.02, FL_Z), (-0.82, FW_Y + 0.18, 0.62), (0.82, FW_Y + 0.18, 0.62)], 'U_Carpet')
# cab back wall (behind the seats) and headliner
C.face([(0.84, BH_Y, FL_Z), (-0.84, BH_Y, FL_Z), (-0.8, BH_Y, 0.98), (0.8, BH_Y, 0.98)], 'U_LeatherDk')
# headliner: a grid 3 cm under the roof skin (rays up), only under the roof panel
NXL, NYL = 9, 8
LG = [[None] * NYL for _ in range(NXL)]
for i in range(NXL):
    for j in range(NYL):
        x, y = -0.66 + 1.32 * i / (NXL - 1), -0.62 + 0.9 * j / (NYL - 1)
        h = ray((x, y, 1.0), (0, 0, 1))
        LG[i][j] = Vector((x, y, (h[0].z - 0.03) if h and h[0].z > 1.2 else 1.3))
for i in range(NXL - 1):
    for j in range(NYL - 1):
        C.face([LG[i][j], LG[i][j + 1], LG[i + 1][j + 1], LG[i + 1][j]], 'U_Liner')
# door cards with arm rests and chrome handles
for s in (1, -1):
    x0 = min(inner_x(-0.3, 0.6), inner_x(-0.3, 0.85)) - 0.01
    pts = [(s * x0, -0.95, 0.33), (s * x0, 0.28, 0.33), (s * x0, 0.28, 0.97), (s * x0, -0.95, 0.97)]
    C.face(pts if s < 0 else pts[::-1], 'U_Leather')
    C.box((s * (x0 - 0.035), -0.25, 0.64), (0.07, 0.5, 0.05), 'U_LeatherDk', bevel=0.012)
    C.box((s * (x0 - 0.012), -0.62, 0.78), (0.02, 0.09, 0.025), 'U_IntChrome', bevel=0.005)
    # kick panel / sill
    C.box((s * (x0 - 0.04), -0.33, FL_Z + 0.03), (0.08, 1.25, 0.06), 'U_LeatherDk', bevel=0.01)
# bucket seats: cushion + backrest built from pleated rolls, bolsters, low backs
def bucket(cx):
    cy, cz = 0.0, 0.47      # cushion top centre
    W, D, NP = 0.5, 0.5, 5
    pw = (W - 0.14) / NP
    C.box((cx, cy, cz - 0.06), (W, D, 0.11), 'U_LeatherDk', bevel=0.03)                 # base cushion
    for k in range(NP):                                                                    # pleated insert (rolls touch)
        C.box((cx - W / 2 + 0.07 + pw * (k + 0.5), cy - 0.01, cz), (pw * 1.02, D - 0.08, 0.03), 'U_Leather', bevel=0.012)
    for s in (1, -1): C.box((cx + s * (W / 2 - 0.035), cy, cz + 0.01), (0.07, D, 0.06), 'U_Leather', bevel=0.025)   # bolsters
    rot = Matrix.Rotation(math.radians(-14), 3, 'X')
    bc = Vector((cx, cy + D / 2 - 0.03, cz + 0.3))
    C.box(bc, (W, 0.1, 0.62), 'U_LeatherDk', bevel=0.035, rot=rot)                        # back shell
    fwd = rot @ Vector((0, -1, 0))
    for k in range(NP):
        C.box(bc + fwd * 0.055 + Vector((-W / 2 + 0.07 + pw * (k + 0.5), 0, 0)), (pw * 1.02, 0.03, 0.54), 'U_Leather', bevel=0.012, rot=rot)
    for s in (1, -1): C.box(bc + fwd * 0.04 + Vector((s * (W / 2 - 0.035), 0, 0)), (0.07, 0.06, 0.6), 'U_Leather', bevel=0.025, rot=rot)
    C.box((cx, cy + 0.02, FL_Z + 0.06), (0.36, 0.36, 0.12), 'U_Black', bevel=0.01)       # seat frame
bucket(0.38); bucket(-0.38)
# centre console with shifter
C.box((0, -0.12, 0.47), (0.2, 0.62, 0.2), 'U_LeatherDk', bevel=0.03)
C.box((0, -0.12, 0.575), (0.17, 0.55, 0.02), 'U_Leather', bevel=0.008)
C.tube([(0, -0.32, 0.58), (0, -0.34, 0.72)], 0.008, 'U_IntChrome', 8)
C.box((0, -0.345, 0.735), (0.04, 0.04, 0.04), 'U_Black', bevel=0.015)
# dashboard: main body, padded top, gauge pods with chrome bezels, centre stack, glovebox
DY, DZ = -0.78, 0.86
C.box((0, DY - 0.04, DZ - 0.1), (1.64, 0.3, 0.2), 'U_Dash', bevel=0.03)
C.box((0, DY - 0.09, DZ + 0.02), (1.66, 0.3, 0.07), 'U_LeatherDk', bevel=0.03)        # padded top / brow
C.box((0, DY - 0.2, DZ - 0.18), (1.6, 0.2, 0.08), 'U_Dash', bevel=0.02)
RG = Matrix.Rotation(math.radians(-90), 4, 'Z') @ Matrix.Rotation(math.radians(0), 4, 'X')
for gx, gr in ((0.24, 0.058), (0.38, 0.068), (0.52, 0.058)):
    M_ = Matrix.Translation((gx, DY + 0.115, DZ - 0.07)) @ Matrix.Rotation(math.radians(90), 4, 'Z') @ Matrix.Rotation(math.radians(-12), 4, 'Y')
    C.lathe([(0.0, -0.012), (gr - 0.008, -0.012)], 20, 'U_Gauge', M_=M_)                 # dial face
    C.lathe([(gr - 0.008, -0.012), (gr, 0.0), (gr + 0.006, 0.006), (gr + 0.006, -0.004)], 20, 'U_IntChrome', M_=M_)   # bezel
    C.box(M_ @ Vector((-0.011, 0.0, gr * 0.45)), (0.004, 0.004, gr * 0.8), 'U_Liner')     # needle
for gx in (-0.04, 0.06):
    M_ = Matrix.Translation((gx, DY + 0.115, DZ - 0.13)) @ Matrix.Rotation(math.radians(90), 4, 'Z')
    C.lathe([(0.0, -0.008), (0.026, -0.008), (0.032, 0.002), (0.034, -0.004)], 14, 'U_IntChrome', M_=M_)
C.box((0.0, DY + 0.1, DZ - 0.04), (0.2, 0.012, 0.05), 'U_Gauge', bevel=0.004)               # radio face
C.box((0.0, DY + 0.108, DZ - 0.04), (0.16, 0.006, 0.008), 'U_IntChrome')
C.box((-0.42, DY + 0.11, DZ - 0.08), (0.36, 0.012, 0.12), 'U_Dash', bevel=0.01)             # glovebox door
C.box((-0.42, DY + 0.12, DZ - 0.05), (0.06, 0.008, 0.012), 'U_IntChrome')
# steering column + 3-spoke wheel (driver = +X), wood-look dark rim
SW = Vector((0.38, -0.52, 0.86)); tilt = math.radians(28)
Rw = Matrix.Translation(SW) @ Matrix.Rotation(math.radians(90), 4, 'Z') @ Matrix.Rotation(-tilt, 4, 'Y')
ring = [Rw @ Vector((0, 0.19 * math.cos(a), 0.19 * math.sin(a))) for a in [2 * math.pi * k / 36 for k in range(36)]]
C.tube(ring, 0.014, 'U_Black', 10, closed=True)
for a in (math.radians(-90), math.radians(20), math.radians(160)):
    C.tube([Rw @ Vector((0.015, 0, 0)), Rw @ Vector((0.0, 0.182 * math.cos(a), 0.182 * math.sin(a)))], 0.008, 'U_IntChrome', 8)
C.lathe([(0.0, 0.03), (0.035, 0.03), (0.042, 0.0), (0.03, -0.04)], 16, 'U_Black', M_=Rw)
C.tube([Rw @ Vector((-0.04, 0, 0)), Rw @ Vector((-0.34, 0, 0))], 0.025, 'U_Black', 10)
# pedals
for px, w in ((0.46, 0.06), (0.34, 0.09)):
    C.box((px, FW_Y + 0.17, 0.42), (w, 0.015, 0.07), 'U_Black', bevel=0.004, rot=Matrix.Rotation(math.radians(30), 3, 'X'))
C.obj('cabin')

# ------------------------------------------------------------------ wheels: 15" five-spoke chrome rims, tires with tread
WR, WW = 0.322, 0.235            # tire radius, width
WX, WYF, WYR, WZ = 0.765, -1.65, 1.27, 0.335
WK, WKX = 0.335 / 0.322, 1.1
WHEEL_SRC = os.path.join(os.path.dirname(SRC), 'wheel', 'wheel_parts.blend')   # made by prep_wheel.py (see the top)
with bpy.data.libraries.load(WHEEL_SRC, link=False) as (_s, _d): _d.objects = ['wheel']
WHEEL_O = _d.objects[0]
def wheel_bm():   # downloaded 5-spoke rim + tyre, already in the wheel frame (axle X, face +X, radius WR, x within +-0.12)
    bm = bmesh.new(); bm.from_mesh(WHEEL_O.data)
    remap = [MI[m.name.split('.')[0]] for m in WHEEL_O.data.materials]
    for f in bm.faces: f.material_index = remap[f.material_index]
    return bm
for wid, sx, y in (('FL', 1, WYF), ('FR', -1, WYF), ('RL', 1, WYR), ('RR', -1, WYR)):
    wb = wheel_bm()
    M_ = Matrix.Translation((sx * WX, y, WZ)) @ Matrix.Diagonal((sx * WKX, WK, WK, 1))
    bmesh.ops.transform(wb, matrix=M_, verts=wb.verts)
    if sx < 0: bmesh.ops.reverse_faces(wb, faces=wb.faces)
    new_obj('wheel_' + wid, wb)
_wm = WHEEL_O.data; _wmats = list(_wm.materials); bpy.data.objects.remove(WHEEL_O); bpy.data.meshes.remove(_wm)
for _m in _wmats:
    if _m and _m.users == 0: bpy.data.materials.remove(_m)

# ------------------------------------------------------------------ finish: apply modifiers, shade smooth by angle, save
dg = bpy.context.evaluated_depsgraph_get()
for o in list(bpy.context.scene.objects):
    if o.type != 'MESH' or not o.modifiers: continue
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg)); o.modifiers.clear(); o.data = me
for o in bpy.context.scene.objects:
    if o.type != 'MESH': continue
    bpy.context.view_layer.objects.active = o
    with bpy.context.temp_override(active_object=o, object=o, selected_editable_objects=[o], selected_objects=[o]):
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40) if not o.name.startswith(('cabin', 'bed_ribs')) else math.radians(30))
bpy.data.objects.remove(SRCO, do_unlink=True)
tot = 0
for o in bpy.context.scene.objects:
    if o.type != 'MESH': continue
    o.data.calc_loop_triangles(); n = len(o.data.loop_triangles); tot += n
    print('[ute1]', o.name, n, 'tris')
print('[ute1] total tris', tot, 'gap faces', log_gap)
# plate mounts (game frame: x left, y up, z forward = -Blender y): outer face of each recess, 0.305 m plate
import json
PL = {}
for o in bpy.context.scene.objects:
    if o.type != 'MESH': continue
    for p in o.data.polygons:
        if o.data.materials[p.material_index].name != 'U_Recess': continue
        c = o.matrix_world @ p.center; k = 'front' if c.y < 0 else 'rear'
        PL.setdefault(k, []).append((c, p.area))
plates = {}
for k, L_ in PL.items():
    A = sum(a for _, a in L_); c = sum((c * a for c, a in L_), Vector()) / A
    yo = min(c_.y for c_, _ in L_) if k == 'front' else max(c_.y for c_, _ in L_)
    plates[k] = [round(c.x, 4), round(c.z, 4), round(-yo, 4), 0.305]
json.dump(plates, open(OUT.replace('.blend', '_plates.json'), 'w'))
print('[ute1] plates', plates)
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print('[ute1] saved', OUT)
