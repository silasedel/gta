# Port Solana V2 — NPC archetype generator (PEOPLE-LOOK track). Blender 5.2 headless + MPFB2 (CC0 MakeHuman assets).
#   BLENDER_USER_RESOURCES=<dir with MPFB2> blender -b -P gen_npc.py -- npc_specs.json <outdir> <workdir> [id,id,...]
# Per archetype writes:
#   <outdir>/<id>.glb   Mixamo-named rig + LOD0 (body+clothes one mesh, hair cards, eyes, brows, lashes, shoes) + LOD1/LOD2
#   <outdir>/<id>.json  meta (heights, tris, materials, texture keys, atlas size, poses, tags)
#   <workdir>/<id>.npz  painter data: every body/garment piece with triangles, atlas UVs, positions, normals, hem distance
# Body and clothes share ONE material and one per-archetype atlas in the MakeHuman body UV layout: garments cut from the
# body keep its UVs (inner layer, page 1); outer layers (jackets, vests, aprons) use the same layout on page 2 (right
# half of a 2:1 atlas); new pieces (skirts, brims, heels) are packed into free space of page 1.
import sys, os, json, math, random
PIPE_PLAYER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "player", "pipeline")
sys.path.insert(0, PIPE_PLAYER)
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mpfb_util import clear_scene, find_asset, HumanService, TargetService, ObjectService, svc
ExportService = svc("services.exportservice", "ExportService")

argv = sys.argv[sys.argv.index("--") + 1:]
SPECS, OUT, WORK = json.load(open(argv[0])), argv[1], argv[2]
ONLY = set(argv[3].split(",")) if len(argv) > 3 and argv[3] else None
os.makedirs(OUT, exist_ok=True); os.makedirs(WORK, exist_ok=True)
PRE = "mixamorig:"
def log(*a): print("[npc]", *a); sys.stdout.flush()
smooth = lambda e0, e1, x: (lambda t: t * t * (3 - 2 * t))(max(0.0, min(1.0, (x - e0) / (e1 - e0))))
MH_HAIR = {"short01", "short02", "short03", "short04", "afro01", "bob01", "bob02", "braid01", "long01", "ponytail01"}
MH_SHOES = {"sneaker_white": "shoes02", "sneaker_gray": "shoes02", "sneaker_black": "shoes02", "sneaker_gold": "shoes02",
            "dress_black": "shoes04", "dress_brown": "shoes01", "boots_black": "shoes03", "boots_tan": "shoes03"}
LONG_HAIR = {"afro01", "bob01", "bob02", "braid01", "long01", "ponytail01", "bun"}

# ------------------------------------------------------------------ garment cut table
# sleeve: arm parameter (0 shoulder joint, 1 elbow, 2 wrist; <0 sleeveless with that armhole margin in m)
# neck: crew height above the neck base (m) / vF: front V depth below the neck base (m) / hem: m below the hip joint (+ lower)
# off: standoff from the body (m), drape: hang straight below the bust, collar: none|stand|shirt|fold|rib, front: none|open(w)
TOPS = {
    "tee":          dict(sleeve=0.48, neck=0.012, hem=0.05, off=0.010, drape=0.8, collar="rib", thick=0.0025),
    "henley":       dict(sleeve=1.95, neck=0.016, hem=0.06, off=0.008, drape=0.5, collar="rib", thick=0.0025, placket=0.11),
    "tank":         dict(sleeve=-0.05, neck=-0.06, hem=0.05, off=0.008, drape=0.7, collar="rib", thick=0.0022, vF=0.05),
    "crop":         dict(sleeve=-0.04, neck=-0.05, hem=-0.13, off=0.006, drape=0.0, collar="rib", thick=0.0022, vF=0.04),
    "polo":         dict(sleeve=0.52, neck=0.02, hem=0.06, off=0.011, drape=0.9, collar="fold", thick=0.003, placket=0.12),
    "camp":         dict(sleeve=0.55, neck=0.0, hem=0.07, off=0.016, drape=1.0, collar="fold", thick=0.003, vF=0.14, buttons=True),
    "guayabera":    dict(sleeve=0.58, neck=0.0, hem=0.09, off=0.018, drape=1.0, collar="fold", thick=0.003, vF=0.12, buttons=True),
    "dress_shirt":  dict(sleeve=1.97, neck=0.028, hem=0.0, off=0.011, drape=0.6, collar="shirt", thick=0.0028, buttons=True, tucked=True),
    "rolled_shirt": dict(sleeve=1.42, neck=0.02, hem=0.0, off=0.012, drape=0.6, collar="shirt", thick=0.0028, buttons=True, tucked=True, vF=0.07, roll=True),
    "blouse":       dict(sleeve=1.55, neck=0.0, hem=0.04, off=0.013, drape=0.9, collar="fold", thick=0.0025, vF=0.11, buttons=True),
    "chef":         dict(sleeve=1.96, neck=0.03, hem=0.12, off=0.016, drape=1.0, collar="stand", thick=0.003, double=True),
    "police_shirt": dict(sleeve=0.5, neck=0.028, hem=0.0, off=0.012, drape=0.6, collar="shirt", thick=0.003, buttons=True, tucked=True, police=True),
    "sports_bra":   dict(sleeve=-0.03, neck=-0.07, hem=-0.2, off=0.004, drape=0.0, collar="rib", thick=0.002, vF=0.03, bra=True),
    # outer layers (page 2)
    "bomber":       dict(sleeve=1.97, neck=0.035, hem=0.0, off=0.026, drape=0.5, collar="stand", thick=0.005, front=0.07, cuff=True, band=True),
    "vest":         dict(sleeve=-0.055, neck=0.0, hem=0.035, off=0.016, drape=0.2, collar="none", thick=0.003, vF=0.25, buttons=True),
    "hivis":        dict(sleeve=-0.07, neck=0.0, hem=0.08, off=0.03, drape=0.9, collar="none", thick=0.003, vF=0.2, front=0.05),
    "blazer":       dict(sleeve=1.96, neck=0.03, hem=0.2, off=0.022, drape=0.8, collar="lapel", thick=0.004, vF=0.26, buttons=True),
}
# leg: leg parameter (0 hip joint, 1 knee, 2 ankle); top: m above the hip joint; flare: extra width toward the hem
BOTTOMS = {
    "jeans":        dict(leg=1.93, top=0.075, off=0.009, flare=0.004, thick=0.003, fly=True),
    "chinos":       dict(leg=1.93, top=0.08, off=0.013, flare=0.012, thick=0.003, fly=True),
    "trousers":     dict(leg=1.95, top=0.09, off=0.015, flare=0.016, thick=0.003, fly=True, crease=True),
    "chef_pants":   dict(leg=1.92, top=0.09, off=0.02, flare=0.02, thick=0.003),
    "cargo_pants":  dict(leg=1.92, top=0.08, off=0.019, flare=0.02, thick=0.003, pockets=True, fly=True),
    "cargo_shorts": dict(leg=1.08, top=0.075, off=0.02, flare=0.035, thick=0.003, pockets=True, fly=True),
    "shorts":       dict(leg=0.62, top=0.075, off=0.012, flare=0.025, thick=0.003, fly=True),
    "boardshorts":  dict(leg=1.0, top=0.05, off=0.016, flare=0.035, thick=0.0025),
    "run_shorts":   dict(leg=0.42, top=0.06, off=0.012, flare=0.03, thick=0.002),
    "leggings":     dict(leg=1.9, top=0.1, off=0.0035, flare=0.0, thick=0.0015),
    "bikini_bottom": dict(leg=0.12, top=0.0, off=0.003, flare=0.0, thick=0.0015, brief=True),
    "overalls":     dict(leg=1.9, top=0.08, off=0.02, flare=0.02, thick=0.003, bib=True),
}
SKIRTS = {   # hemLeg overrides from the spec: leg parameter of the hem
    "mini_skirt":   dict(top=0.06, hemLeg=0.32, flare=0.035, fit=0.012),
    "pencil_skirt": dict(top=0.09, hemLeg=0.95, flare=0.0, fit=0.012),
    "apron":        dict(top=0.08, hemLeg=0.95, flare=0.03, fit=0.03, front=True),
}
DRESSES = {  # bodice (a top) + skirt from the hips
    "knit_dress":  dict(top=dict(sleeve=0.55, neck=0.0, hem=0.02, off=0.006, drape=0.0, collar="rib", thick=0.0025, vF=0.05), skirt=dict(top=0.07, hemLeg=0.42, flare=0.012, fit=0.008)),
    "slip_dress":  dict(top=dict(sleeve=-0.06, neck=-0.08, hem=0.02, off=0.006, drape=0.0, collar="none", thick=0.002, vF=0.07, straps=True), skirt=dict(top=0.07, hemLeg=0.35, flare=0.03, fit=0.01)),
    "sundress":    dict(top=dict(sleeve=-0.07, neck=-0.07, hem=-0.03, off=0.008, drape=0.0, collar="none", thick=0.002, vF=0.06, straps=True), skirt=dict(top=0.05, hemLeg=1.05, flare=0.12, fit=0.012)),
}
BIKINI_TOP = dict(bra=True)

# ------------------------------------------------------------------ helpers
def bone_head(arm, n):
    b = arm.data.bones.get(PRE + n) or arm.data.bones.get(n)
    return arm.matrix_world @ b.head_local if b else None

def vweights(obj):
    names = {g.index: g.name.replace(PRE, "") for g in obj.vertex_groups}
    out = []
    for v in obj.data.vertices:
        d = {}
        for g in v.groups:
            n = names.get(g.group)
            if n: d[n] = d.get(n, 0) + g.weight
        out.append(d)
    return out
ws = lambda d, keys: sum(d.get(k, 0.0) for k in keys)
HANDK = lambda d: sum(v for k, v in d.items() if "Hand" in k)

def chain_t(p, pts):
    """parameter along a joint polyline (0 at pts[0], 1 at pts[1], ...) and the radial distance"""
    best = (1e9, 0.0)
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]; ab = b - a; L2 = ab.length_squared
        t = max(-0.3, min(1.3, (p - a).dot(ab) / L2))
        d = (p - (a + ab * max(0.0, min(1.0, t)))).length
        if d < best[0]: best = (d, i + t)
    return best[1], best[0]

def link(obj): bpy.context.collection.objects.link(obj); return obj
def new_obj(name, me): return link(bpy.data.objects.new(name, me))
def copy_obj(o, name):
    c = o.copy(); c.data = o.data.copy(); c.name = name; link(c); return c
def activate(o):
    bpy.ops.object.select_all(action="DESELECT"); bpy.context.view_layer.objects.active = o; o.select_set(True)
def apply_mod(o, m):
    activate(o)
    while o.modifiers.find(m.name) > 0: bpy.ops.object.modifier_move_up(modifier=m.name)
    bpy.ops.object.modifier_apply(modifier=m.name)

def boundary_dist(bm, maxd=0.12):
    """approximate geodesic distance (m) from the open boundary, Dijkstra over edges"""
    import heapq, itertools
    cnt = itertools.count()
    dist = {v: 9.0 for v in bm.verts}; h = []
    for v in bm.verts:
        if v.is_boundary: dist[v] = 0.0; heapq.heappush(h, (0.0, next(cnt), v))
    while h:
        d, _, v = heapq.heappop(h)
        if d > dist[v] or d > maxd: continue
        for e in v.link_edges:
            o = e.other_vert(v); nd = d + e.calc_length()
            if nd < dist[o]: dist[o] = nd; heapq.heappush(h, (nd, next(cnt), o))
    return dist

def set_group_from(obj, name, values):
    g = obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
    for i, w in enumerate(values): g.add([i], float(max(0.0, min(1.0, w))), "REPLACE")

def relax_boundary(bm, iters=6, k=0.5, keepz=False):
    bverts = [v for v in bm.verts if v.is_boundary]
    for _ in range(iters):
        new = {}
        for v in bverts:
            nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(nb) != 2: continue
            avg = (nb[0].co + nb[1].co) * 0.5
            c = v.co.lerp(avg, k)
            if keepz: c.z = v.co.z
            new[v] = c
        for v, c in new.items(): v.co = c

def bisect(bm, faces, co, no):
    verts = list({v for f in faces for v in f.verts}); edges = list({e for f in faces for e in f.edges})
    if not faces: return
    bmesh.ops.bisect_plane(bm, geom=verts + edges + list(faces), plane_co=co, plane_no=no, clear_inner=True, dist=1e-5)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")

def make_bvh(obj):
    bm = bmesh.new(); bm.from_mesh(obj.data); bm.transform(obj.matrix_world)
    t = BVHTree.FromBMesh(bm); bm.free(); return t

# ------------------------------------------------------------------ landmarks
def landmarks(arm, eb):
    h = lambda n: bone_head(arm, n)
    P = {k: h(k) for k in ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "LeftHand", "RightHand",
                           "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase", "LeftShoulder", "RightShoulder")}
    co = [eb.matrix_world @ v.co for v in eb.data.vertices]
    P["hipZ"] = P["Hips"].z; P["neckZ"] = P["Neck"].z; P["kneeZ"] = (P["LeftLeg"].z + P["RightLeg"].z) / 2; P["ankleZ"] = (P["LeftFoot"].z + P["RightFoot"].z) / 2
    P["crotchZ"] = min(p.z for p in co if abs(p.x) < 0.015 and P["kneeZ"] < p.z < P["hipZ"] and abs(p.y - P["Hips"].y) < 0.08) if co else P["hipZ"] - 0.1
    front = [p for p in co if P["Spine1"].z - 0.04 < p.z < P["Neck"].z - 0.08 and abs(p.x) < 0.2]
    best = min(front, key=lambda p: p.y) if front else P["Spine2"]
    P["bustZ"] = best.z; P["bustY"] = best.y
    P["topZ"] = max(p.z for p in co); P["minZ"] = min(p.z for p in co)
    hv = [p for p in co if p.z > P["Head"].z + 0.06]
    P["backY"] = max(p.y for p in hv) if hv else P["Head"].y + 0.09
    # neck base ring height (where the neck meets the shoulders, at the side)
    P["neckBaseZ"] = P["Neck"].z - 0.02
    P["armL"] = [P["LeftArm"], P["LeftForeArm"], P["LeftHand"]]; P["armR"] = [P["RightArm"], P["RightForeArm"], P["RightHand"]]
    P["legL"] = [P["LeftUpLeg"], P["LeftLeg"], P["LeftFoot"]]; P["legR"] = [P["RightUpLeg"], P["RightLeg"], P["RightFoot"]]
    return P

# ------------------------------------------------------------------ tops (and bodices)
def make_top(eb, P, kind, d, bvh, under=None):
    W = vweights(eb); mw = eb.matrix_world
    co = [mw @ v.co for v in eb.data.vertices]
    hemZ = P["hipZ"] - d["hem"] if not d.get("bra") else P["bustZ"] - d.get("under", 0.075); s = d["sleeve"]
    inc = []
    for i, p in enumerate(co):
        w = W[i]
        if HANDK(w) > 0.02 or ws(w, ("Head",)) > 0.5: inc.append(False); continue
        legw = ws(w, ("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"))
        if legw > 0.5 or p.z < hemZ - 0.03: inc.append(False); continue
        armw = ws(w, ("LeftArm", "RightArm", "LeftForeArm", "RightForeArm"))
        if armw > 0.15:
            ch = P["armL"] if p.x > 0 else P["armR"]; t, r = chain_t(p, ch)
            if s < 0: inc.append(t < 0.05 and armw < 0.55); continue
            inc.append(t < s + 0.08); continue
        inc.append(True)
    sh = copy_obj(eb, "G_" + kind); sh.modifiers.clear()
    bm = bmesh.new(); bm.from_mesh(sh.data); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if sum(inc[v.index] for v in f.verts) < len(f.verts)], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    Z = Vector((0, 0, 1))
    # hem and neckline
    bisect(bm, list(bm.faces), Vector((0, 0, hemZ)), Z)
    nz = P["neckBaseZ"] + (0.0 if (d.get("straps") or d.get("bra")) else d["neck"])
    bisect(bm, list(bm.faces), Vector((0, 0, nz)), -Z)
    if d.get("vF"):  # front V: two planes through the V point, front faces only
        cy = P["Neck"].y; zV = P["neckBaseZ"] - d["vF"]; wN = 0.075
        for sgn in (1, -1):
            fs = [f for f in bm.faces if f.calc_center_median().y < cy - 0.01 and f.calc_center_median().x * sgn > -0.002]
            a = Vector((0, cy - 0.2, zV)); b = Vector((sgn * wN, cy - 0.2, nz + 0.01))
            n = (b - a).cross(Vector((0, 1, 0))).normalized()
            if n.z > 0: n = -n
            bisect(bm, fs, a, n)
    # sleeves: cut only faces that belong to the arm (the hanging A-pose arm runs past the torso sides)
    dl = bm.verts.layers.deform.active
    gidx = {g.name.replace(PRE, ""): g.index for g in sh.vertex_groups}
    def armf(f, side):
        names = ("LeftArm", "LeftForeArm") if side > 0 else ("RightArm", "RightForeArm")
        ids = [gidx[n] for n in names if n in gidx]
        return sum(v[dl].get(i, 0) for v in f.verts for i in ids) / len(f.verts) if dl else 0
    if s > 0:
        for side, ch in ((1, P["armL"]), (-1, P["armR"])):
            seg = 0 if s < 1 else 1; t = s - seg
            a, b = ch[seg], ch[seg + 1]; ax = (b - a).normalized(); c = a + (b - a) * t
            fs = [f for f in bm.faces if f.calc_center_median().x * side > 0.1 and armf(f, side) > 0.45]
            bisect(bm, fs, c, -ax)
    elif s < 0:   # sleeveless: armhole plane, tilted so it is a bit higher on the front
        for side, ch in ((1, P["armL"]), (-1, P["armR"])):
            a, b = ch[0], ch[1]; ax = (b - a).normalized()
            c = a + Vector((-side * (-s), 0, 0)) * 1.0
            fs = [f for f in bm.faces if f.calc_center_median().x * side > 0.09 and f.calc_center_median().z > a.z - 0.075]
            n = Vector((-side, 0, 0.22)).normalized()
            bisect(bm, fs, c, n)
    if d.get("front"):   # open front (zip jackets, hi-vis)
        w = d["front"] * 0.5; cy = P["Spine2"].y
        for sgn in (1, -1):
            fs = [f for f in bm.faces if f.calc_center_median().y < cy and f.calc_center_median().x * sgn >= 0]
            bisect(bm, fs, Vector((sgn * w, 0, 0)), Vector((sgn, 0, 0)))
    if d.get("straps") or d.get("bra"):   # spaghetti straps / bra straps: keep only two bands over the shoulders above the bust line
        topZ = P["bustZ"] + (0.06 if d.get("bra") else 0.075)
        sx = 0.085
        kill = []
        for f in bm.faces:
            c = f.calc_center_median()
            if c.z > topZ and abs(abs(c.x) - sx) > 0.013: kill.append(f)
        bmesh.ops.delete(bm, geom=kill, context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bmesh.ops.dissolve_degenerate(bm, dist=0.002, edges=bm.edges[:])
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    relax_boundary(bm, 6, 0.5)
    bm.to_mesh(sh.data); bm.free()
    clothify(sh, eb, bvh, P, d, top=True)
    if under: clear_of(sh, under, 0.007)
    return sh

def clear_of(sh, objs, gap):
    """keep an outer layer at least `gap` outside the layers under it (no shirt poking through a vest)"""
    trees = [make_bvh(o) for o in objs]
    mw = sh.matrix_world; mwi = mw.inverted()
    bm = bmesh.new(); bm.from_mesh(sh.data); bm.normal_update()
    for v in bm.verts:
        p = mw @ v.co
        for t in trees:
            loc, n, _, dist = t.find_nearest(p, 0.05)
            if loc is None: continue
            if (p - loc).dot(n) < gap: p = loc + n * gap
        v.co = mwi @ p
    bm.to_mesh(sh.data); bm.free()

def clothify(sh, eb, bvh, P, d, top=False, bottom=False):
    mw = sh.matrix_world; mwi = mw.inverted()
    bm = bmesh.new(); bm.from_mesh(sh.data); bm.verts.ensure_lookup_table(); bm.normal_update()
    off = d["off"]
    for v in bm.verts: v.co = v.co + v.normal * off
    interior = [v for v in bm.verts if not v.is_boundary]
    for _ in range(8 if (top or bottom) else 3):
        bmesh.ops.smooth_vert(bm, verts=interior, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    dl = bm.verts.layers.deform.active
    gidx = {g.name.replace(PRE, ""): g.index for g in sh.vertex_groups}
    armg = [gidx[n] for n in ("LeftArm", "RightArm", "LeftForeArm", "RightForeArm") if n in gidx]
    armw = [sum(v[dl].get(g, 0) for g in armg) if dl else 0 for v in bm.verts]
    if top and d.get("drape", 0) > 0:
        bz = P["bustZ"]; BIN = 48
        torso = [(mw @ v.co, v) for v in bm.verts if armw[v.index] < 0.25]
        ring = [p for p, v in torso if abs(p.z - bz) < 0.035]
        if ring:
            cx = sum(p.x for p in ring) / len(ring); cy = sum(p.y for p in ring) / len(ring)
            rmax = [0.0] * BIN
            for p in ring:
                a = math.atan2(p.y - cy, p.x - cx); b = int((a + math.pi) / (2 * math.pi) * BIN) % BIN
                rmax[b] = max(rmax[b], math.hypot(p.x - cx, p.y - cy))
            for i in range(BIN):
                if rmax[i] == 0: rmax[i] = max(rmax[(i - 1) % BIN], rmax[(i + 1) % BIN])
            for p, v in torso:
                if p.z >= bz: continue
                t = smooth(bz, bz - 0.12, p.z) * d["drape"]
                if d.get("tucked"): t *= 1 - smooth(P["hipZ"] + 0.12, P["hipZ"] + 0.04, p.z)   # tucked in at the waistband
                a = math.atan2(p.y - cy, p.x - cx); b = int((a + math.pi) / (2 * math.pi) * BIN) % BIN
                r = math.hypot(p.x - cx, p.y - cy); rt = max(r, rmax[b] * 0.975 + 0.004)
                rn = r + (rt - r) * t
                if r > 1e-4: v.co = mwi @ Vector((cx + (p.x - cx) / r * rn, cy + (p.y - cy) / r * rn, p.z))
    if top:  # loose sleeves: push away from the arm axis, flaring to the opening; ribbed cuffs pull in
        for ch in (P["armL"], P["armR"]):
            for v in bm.verts:
                if armw[v.index] < 0.3: continue
                p = mw @ v.co
                if (p.x > 0) != (ch[0].x > 0): continue
                t, r = chain_t(p, ch)
                seg = 0 if t < 1 else 1; a, b = ch[seg], ch[seg + 1]; ax = (b - a).normalized()
                c = a + ax * (p - a).dot(ax); rv = p - c
                if rv.length < 1e-4 or rv.length > 0.13: continue
                extra = 0.006 + 0.01 * min(1.0, t) if d["sleeve"] < 1.2 else 0.004
                if d.get("cuff") and t > d["sleeve"] - 0.12: extra = -0.006
                if d.get("roll") and t > d["sleeve"] - 0.1: extra += 0.006
                v.co = mwi @ (c + rv.normalized() * (rv.length + extra))
        if d.get("band"):   # ribbed waistband pulls in
            for v in bm.verts:
                p = mw @ v.co
                if p.z < P["hipZ"] - d["hem"] + 0.05 and armw[v.index] < 0.2:
                    cx, cy = 0.0, P["Hips"].y; rv = Vector((p.x - cx, p.y - cy, 0))
                    if rv.length > 1e-3: v.co = mwi @ (p - rv.normalized() * 0.008)
    if bottom:
        for ch in (P["legL"], P["legR"]):
            for v in bm.verts:
                p = mw @ v.co
                if (p.x > 0) != (ch[0].x > 0): continue
                t, r = chain_t(p, ch)
                if t < 0.15: continue
                seg = 0 if t < 1 else 1; a, b = ch[seg], ch[seg + 1]; ax = (b - a).normalized()
                c = a + ax * (p - a).dot(ax); rv = p - c; rv.z = 0
                if rv.length < 1e-4: continue
                k = min(1.0, (t - 0.15) / 1.6) ** 1.3
                v.co = mwi @ (c + rv.normalized() * (rv.length + d.get("flare", 0.02) * k) + Vector((0, 0, (p - c).z)))
    # never inside the body
    mind = max(0.004, off * 0.6)
    for v in bm.verts:
        p = mw @ v.co; hit = bvh.find_nearest(p)
        if hit and hit[0] is not None:
            loc, n, _, dist = hit
            if (p - loc).dot(n) < mind: v.co = mwi @ (loc + n * mind)
    if d.get("pockets") and bottom:   # cargo pockets bulge on the outer thigh
        for v in bm.verts:
            p = mw @ v.co
            for ch in (P["legL"], P["legR"]):
                if (p.x > 0) != (ch[0].x > 0): continue
                t, r = chain_t(p, ch)
                side = abs(p.x) - abs(ch[0].x + (ch[1].x - ch[0].x) * min(1, t))
                if 0.42 < t < 0.78 and side > 0.03 and abs(p.y - (ch[0].y + (ch[1].y - ch[0].y) * t)) < 0.06:
                    v.co = v.co + v.normal * 0.009 * smooth(0.42, 0.5, t) * smooth(0.78, 0.7, t)
    bm.normal_update()
    hd = boundary_dist(bm); hl = [min(1.0, hd[v] / 0.1) for v in bm.verts]
    bm.to_mesh(sh.data); bm.free()
    set_group_from(sh, "npc_hem", hl)

# ------------------------------------------------------------------ bottoms
def make_bottom(eb, P, kind, d, bvh):
    W = vweights(eb); mw = eb.matrix_world
    co = [mw @ v.co for v in eb.data.vertices]
    topZ = P["hipZ"] + d["top"]; L = d["leg"]
    inc = []
    for i, p in enumerate(co):
        w = W[i]
        if ws(w, ("LeftArm", "RightArm", "LeftForeArm", "RightForeArm")) + HANDK(w) > 0.05 or ws(w, ("LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase")) > 0.2:
            inc.append(False); continue
        if p.z > topZ + 0.03: inc.append(False); continue
        legw = ws(w, ("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"))
        if legw > 0.3:
            ch = P["legL"] if p.x > 0 else P["legR"]; t, r = chain_t(p, ch)
            inc.append(t < L + 0.1); continue
        inc.append(True)
    sh = copy_obj(eb, "G_" + kind); sh.modifiers.clear()
    bm = bmesh.new(); bm.from_mesh(sh.data); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if sum(inc[v.index] for v in f.verts) < len(f.verts)], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    Z = Vector((0, 0, 1))
    if d.get("brief"):
        # bikini bottom: waist plane low at the front, leg openings as tilted planes high on the hips
        bisect(bm, list(bm.faces), Vector((0, 0, P["hipZ"] - 0.035)), -Z)
        for side, ch in ((1, P["legL"]), (-1, P["legR"])):
            fs = [f for f in bm.faces if f.calc_center_median().x * side > 0.0]
            c = Vector((side * 0.02, P["Hips"].y, P["crotchZ"] + 0.005)); n = Vector((-side * 0.75, 0, 1.0)).normalized()
            bisect(bm, fs, c, n)
    else:
        bisect(bm, list(bm.faces), Vector((0, 0, topZ)), -Z)
        for side, ch in ((1, P["legL"]), (-1, P["legR"])):
            seg = 0 if L < 1 else 1; t = L - seg
            a, b = ch[seg], ch[seg + 1]; ax = (b - a).normalized(); c = a + (b - a) * t
            fs = [f for f in bm.faces if f.calc_center_median().x * side > 0.0 and f.calc_center_median().z < P["crotchZ"] + 0.02]
            bisect(bm, fs, c, -ax)
    bmesh.ops.dissolve_degenerate(bm, dist=0.002, edges=bm.edges[:])
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    relax_boundary(bm, 4, 0.5)
    bm.to_mesh(sh.data); bm.free()
    clothify(sh, eb, bvh, P, d, bottom=True)
    return sh

def make_bib(eb, P, d, bvh):
    """overall bib + straps: chest front panel and two straps over the shoulders to the back"""
    W = vweights(eb); mw = eb.matrix_world; co = [mw @ v.co for v in eb.data.vertices]
    topZ = P["bustZ"] + 0.07; sx = 0.07
    inc = []
    for i, p in enumerate(co):
        w = W[i]
        if ws(w, ("LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "Head")) + HANDK(w) > 0.1 or p.z < P["hipZ"] + 0.04: inc.append(False); continue
        front = p.y < P["Spine2"].y - 0.02
        if front and p.z < topZ and abs(p.x) < 0.13: inc.append(True); continue
        strap = abs(abs(p.x) - sx) < 0.022 and p.z > (topZ - 0.03 if front else P["Spine1"].z)
        inc.append(strap and p.z < P["Neck"].z + 0.01)
    sh = copy_obj(eb, "G_bib"); sh.modifiers.clear()
    bm = bmesh.new(); bm.from_mesh(sh.data); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if sum(inc[v.index] for v in f.verts) < len(f.verts)], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    relax_boundary(bm, 3, 0.5); bm.to_mesh(sh.data); bm.free()
    dd = dict(d); dd["off"] = 0.024
    clothify(sh, eb, bvh, P, dd)
    return sh

# ------------------------------------------------------------------ skirts (cone from the hips), aprons
def make_skirt(eb, arm, P, kind, d, bvh, page):
    mw = eb.matrix_world; Wb = vweights(eb)
    z0 = P["hipZ"] + d["top"]
    ch = P["legL"]; L = d["hemLeg"]; seg = 0 if L < 1 else 1; zH = (ch[seg] + (ch[seg + 1] - ch[seg]) * (L - seg)).z
    BIN, RINGS = 48, 14
    co = [mw @ v.co for i, v in enumerate(eb.data.vertices) if ws(Wb[i], ("LeftArm", "RightArm", "LeftForeArm", "RightForeArm")) + HANDK(Wb[i]) < 0.05]
    cx = 0.0; cy = P["Hips"].y
    def radial_max(zlo, zhi):
        r = [0.0] * BIN
        for p in co:
            if zlo < p.z < zhi and math.hypot(p.x - cx, p.y - cy) < 0.32:
                a = math.atan2(p.y - cy, p.x - cx); b = int((a + math.pi) / (2 * math.pi) * BIN) % BIN
                r[b] = max(r[b], math.hypot(p.x - cx, p.y - cy))
        for i in range(BIN):
            if r[i] == 0: r[i] = max(r[(i - 1) % BIN], r[(i + 1) % BIN], 0.1)
        return r
    rings_r = []
    for k in range(RINGS + 1):
        t = k / RINGS; z = z0 + (zH - z0) * t
        r = radial_max(z - 0.025, z + 0.025)
        rings_r.append((z, t, r))
    # monotone below the widest ring (cloth hangs, it does not follow the thighs back in)
    for b in range(BIN):
        m = 0.0
        for k in range(RINGS + 1):
            z, t, r = rings_r[k]; m = max(m, r[b]); r[b] = max(r[b], m * (0.985 if d["flare"] > 0.01 else 0.97))
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap")
    front_only = d.get("front")
    a0, a1 = (-math.pi * 0.98, -math.pi * 0.02) if front_only else (-math.pi, math.pi)   # front = -Y half
    nb = BIN // 2 if front_only else BIN
    grid = []
    for k in range(RINGS + 1):
        z, t, r = rings_r[k]; ring = []
        for j in range(nb + (1 if front_only else 0)):
            a = a0 + (a1 - a0) * (j / nb)
            b = int((a + math.pi) / (2 * math.pi) * BIN) % BIN
            rr = r[b] + d["fit"] + d["flare"] * (t ** 1.2) + (0.004 + 0.012 * d["flare"] / 0.12) * t * math.sin(a * 11 + k * 0.3)
            ring.append(bm.verts.new((cx + math.cos(a) * rr, cy + math.sin(a) * rr, z)))
        grid.append(ring)
    ncols = nb if not front_only else nb
    for k in range(RINGS):
        for j in range(ncols):
            j2 = (j + 1) % nb if not front_only else j + 1
            v1, v2, v3, v4 = grid[k][j], grid[k][j2], grid[k + 1][j2], grid[k + 1][j]
            f = bm.faces.new((v1, v4, v3, v2))
            for loop, (u, vv) in zip(f.loops, ((j / ncols, 1 - k / RINGS), (j / ncols, 1 - (k + 1) / RINGS), ((j + 1) / ncols, 1 - (k + 1) / RINGS), ((j + 1) / ncols, 1 - k / RINGS))):
                loop[uvl].uv = (u, vv)
    bm.normal_update()
    hd = boundary_dist(bm)
    me = bpy.data.meshes.new("G_" + kind); bm.to_mesh(me)
    hem_vals = [min(1.0, hd[v] / 0.1) for v in bm.verts]
    bm.free()
    obj = new_obj("G_" + kind, me)
    for g in eb.vertex_groups: obj.vertex_groups.new(name=g.name)
    dt = obj.modifiers.new("dt", "DATA_TRANSFER"); dt.object = eb; dt.use_vert_data = True; dt.data_types_verts = {"VGROUP_WEIGHTS"}
    dt.vert_mapping = "POLYINTERP_NEAREST"; dt.layers_vgroup_select_src = "ALL"; dt.layers_vgroup_select_dst = "NAME"
    apply_mod(obj, dt)
    # lower skirt: blend toward hips + the near thigh so it does not tear between the legs
    for v in me.vertices:
        p = v.co; t = max(0.0, min(1.0, (z0 - p.z) / max(0.05, z0 - zH)))
        cur = {obj.vertex_groups[g.group].name: g.weight for g in v.groups}
        side = PRE + ("LeftUpLeg" if p.x > 0 else "RightUpLeg")
        tgt = {PRE + "Hips": 0.55, side: 0.45} if abs(p.x) > 0.02 else {PRE + "Hips": 0.8, PRE + "LeftUpLeg": 0.1, PRE + "RightUpLeg": 0.1}
        blend = min(1.0, t * 1.2)
        new = {n: cur.get(n, 0) * (1 - blend) + tgt.get(n, 0) * blend for n in set(cur) | set(tgt)}
        s = sum(new.values()) or 1
        for g in list(v.groups): obj.vertex_groups[g.group].remove([v.index])
        for n, wv in new.items():
            if wv / s > 0.01: obj.vertex_groups[n].add([v.index], wv / s, "REPLACE")
    set_group_from(obj, "npc_hem", hem_vals)
    circ = 2 * math.pi * (sum(rings_r[-1][2]) / BIN + d["flare"]) * (0.5 if front_only else 1.0)
    page.append((obj, circ, z0 - zH))
    return obj

# ------------------------------------------------------------------ head wear
def make_hat(eb, P, hs, bvh, page):
    W = vweights(eb); mw = eb.matrix_world; co = [mw @ v.co for v in eb.data.vertices]
    head = P["Head"]; top = P["topZ"]
    flat = hs.get("flat"); beanie = hs["type"] == "beanie"
    # crown boundary: around the head above the ears, lower at the back, just above the brows at the front
    brow_z = top - (0.092 if beanie else 0.088); back_z = top - (0.14 if beanie else 0.118)
    fh = [p for p in co if abs(p.x - head.x) < 0.02 and abs(p.z - brow_z) < 0.012]
    foreY = min(p.y for p in fh) if fh else head.y - 0.1
    def edge_z(p):
        f = max(0.0, min(1.0, (p.y - (head.y - 0.09)) / 0.18))    # 0 at the front (-y) .. 1 at the back
        return brow_z + (back_z - brow_z) * f + (0.012 if hs.get("skull") else 0.0)
    inc = [ws(W[i], ("Head",)) > 0.6 and p.z > edge_z(p) - 0.012 for i, p in enumerate(co)]
    sh = copy_obj(eb, "G_hat"); sh.modifiers.clear()
    bm = bmesh.new(); bm.from_mesh(sh.data); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if sum(inc[v.index] for v in f.verts) < len(f.verts)], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    relax_boundary(bm, 6, 0.5)
    bm.normal_update()
    off = 0.017 if beanie else 0.014
    for v in bm.verts:
        p = mw @ v.co
        k = 1.0
        if flat: k = 1.0 + 0.35 * smooth(head.y + 0.02, head.y - 0.08, p.y)
        v.co = v.co + v.normal * off * k
        if beanie and not hs.get("skull"): v.co.z += 0.012 * smooth(top - 0.05, top, p.z)   # a little slouch on top
        if flat: v.co.z -= 0.02 * smooth(top - 0.08, top, p.z)
    interior = [v for v in bm.verts if not v.is_boundary]
    for _ in range(4): bmesh.ops.smooth_vert(bm, verts=interior, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    hd = boundary_dist(bm); hl = [min(1.0, hd[v] / 0.06) for v in bm.verts]
    bm.to_mesh(sh.data); bm.free()
    set_group_from(sh, "npc_hem", hl)
    brim = None
    if hs["type"] == "cap":   # brim: curved plate in front at the brow line
        bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap")
        NU, NV = 12, 4; R = 0.095; Lb = 0.075 if not flat else 0.045
        cyF = foreY + R
        rows = []
        for j in range(NV + 1):
            t = j / NV; row = []
            for i in range(NU + 1):
                a = math.radians(-70 + 140 * i / NU)
                r = R + Lb * t * (0.55 + 0.45 * math.cos(a))
                x = math.sin(a) * r; y = cyF - math.cos(a) * r
                z = brow_z - 0.002 - t * 0.018 - (abs(math.sin(a)) * 0.012 * t)
                row.append(bm.verts.new((head.x + x, y + 0.004, z)))
            rows.append(row)
        for j in range(NV):
            for i in range(NU):
                f = bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
                for loop, (u, vv) in zip(f.loops, ((i / NU, j / NV), ((i + 1) / NU, j / NV), ((i + 1) / NU, (j + 1) / NV), (i / NU, (j + 1) / NV))):
                    loop[uvl].uv = (u, vv)
        bm.normal_update()
        for f in bm.faces:
            if f.normal.z < 0: f.normal_flip()
        me = bpy.data.meshes.new("G_brim"); bm.to_mesh(me); bm.free()
        brim = new_obj("G_brim", me)
        for g in eb.vertex_groups: brim.vertex_groups.new(name=g.name)
        brim.vertex_groups[PRE + "Head"].add(list(range(len(me.vertices))), 1.0, "REPLACE")
        set_group_from(brim, "npc_hem", [1.0] * len(me.vertices))
        page.append((brim, 0.2, 0.08))
    return sh, brim, edge_z

# ------------------------------------------------------------------ footwear: soles (flip-flops, sandals) and heels
def foot_shell(eb, side, test, name):
    W = vweights(eb); mw = eb.matrix_world
    idx = set(i for i, w in enumerate(W) if ws(w, (side + "Foot", side + "ToeBase")) > 0.45 and test(mw @ eb.data.vertices[i].co))
    sh = copy_obj(eb, name); sh.modifiers.clear()
    bm = bmesh.new(); bm.from_mesh(sh.data); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if sum(v.index in idx for v in f.verts) < len(f.verts)], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    return sh, bm

def make_soles(eb, P, kind, page, heel=0.0):
    """sole plate under each foot (flat sandals / flip-flops) plus strap bands cut from the foot surface"""
    mw = eb.matrix_world; W = vweights(eb); out = []
    for side in ("Left", "Right"):
        idx = [i for i, w in enumerate(W) if ws(w, (side + "Foot", side + "ToeBase")) > 0.5]
        pts = [mw @ eb.data.vertices[i].co for i in idx]
        if len(pts) < 10: continue
        zmin = min(p.z for p in pts)
        low = [p for p in pts if p.z < zmin + 0.025]
        cxx = sum(p.x for p in low) / len(low); cyy = sum(p.y for p in low) / len(low)
        bm = bmesh.new()
        flat = [bm.verts.new((cxx + (p.x - cxx) * 1.1, cyy + (p.y - cyy) * 1.05, 0.0)) for p in low]
        bmesh.ops.convex_hull(bm, input=flat)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        for v in bm.verts: v.co.z = 0.0
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.006)
        th = 0.016 if kind == "sandals" else 0.012
        ret = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
        for v in [e for e in ret["geom"] if isinstance(e, bmesh.types.BMVert)]: v.co.z = zmin + th * 0.6
        for v in bm.verts:
            if v.co.z == 0.0: v.co.z = zmin - 0.002
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        uvl = bm.loops.layers.uv.new("UVMap")
        ys = [v.co.y for v in bm.verts]; y0, y1 = min(ys), max(ys)
        for f in bm.faces:
            for l in f.loops: l[uvl].uv = ((l.vert.co.x - cxx) / 0.12 + 0.5, (l.vert.co.y - y0) / max(0.05, y1 - y0))
        me = bpy.data.meshes.new("G_sole" + side); bm.to_mesh(me); bm.free()
        obj = new_obj("G_sole" + side, me)
        for g in eb.vertex_groups: obj.vertex_groups.new(name=g.name)
        obj.vertex_groups[PRE + side + "Foot"].add(list(range(len(me.vertices))), 0.6, "REPLACE")
        obj.vertex_groups[PRE + side + "ToeBase"].add([v.index for v in me.vertices if v.co.y < (y0 + y1) / 2 - 0.03], 0.4, "REPLACE")
        set_group_from(obj, "npc_hem", [1.0] * len(me.vertices))
        page.append((obj, 0.12, 0.27)); out.append(obj)
        # straps: bands of the foot surface
        front = min(p.y for p in pts)
        if kind == "flipflops": test = lambda p, f=front, z=zmin: p.z > z + 0.012 and abs(p.y - (f + 0.07)) < 0.011 + max(0, (z + 0.05 - p.z)) * 0.25
        else: test = lambda p, f=front, z=zmin: p.z > z + 0.01 and (abs(p.y - (f + 0.06)) < 0.012 or abs(p.y - (f + 0.15)) < 0.013)
        st, b2 = foot_shell(eb, side, test, "G_strap" + side)
        b2.normal_update()
        for v in b2.verts: v.co = v.co + v.normal * 0.004
        relax_boundary(b2, 2, 0.4)
        b2.to_mesh(st.data); b2.free()
        set_group_from(st, "npc_hem", [0.0] * len(st.data.vertices))
        out.append(st)
    return out

def heel_pose(arm, meshes, P, height=0.075):
    """raise the heels (foot pitched, toes flat) and make that the rest pose, then lift everything so the shoe sits on z=0"""
    activate(arm); bpy.ops.object.mode_set(mode="POSE")
    for side in ("Left", "Right"):
        foot = arm.pose.bones[PRE + side + "Foot"]; toe = arm.pose.bones[PRE + side + "ToeBase"]
        foot.rotation_mode = "XYZ"; toe.rotation_mode = "XYZ"
        foot.rotation_euler = (0, 0, 0); toe.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()
    # find the pitch sign: heel up = toe base goes down relative to the ankle
    def toe_z(side): return (arm.matrix_world @ arm.pose.bones[PRE + side + "ToeBase"].head).z
    z0 = toe_z("Left")
    arm.pose.bones[PRE + "LeftFoot"].rotation_euler = (0.3, 0, 0); bpy.context.view_layer.update()
    sgn = 1.0 if toe_z("Left") < z0 else -1.0
    ang = math.radians(27)
    for side in ("Left", "Right"):
        arm.pose.bones[PRE + side + "Foot"].rotation_euler = (sgn * ang, 0, 0)
        arm.pose.bones[PRE + side + "ToeBase"].rotation_euler = (-sgn * ang * 0.95, 0, 0)
    bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")
    for o in meshes:
        m = next((m for m in o.modifiers if m.type == "ARMATURE"), None)
        if not m: continue
        activate(o)
        bpy.ops.object.modifier_apply(modifier=m.name)
    activate(arm); bpy.ops.object.mode_set(mode="POSE"); bpy.ops.pose.armature_apply(selected=False); bpy.ops.object.mode_set(mode="OBJECT")
    for o in meshes:
        am = o.modifiers.new("Armature", "ARMATURE"); am.object = arm
    # lift so the toes are on the sole top (sole 0.012) -> heel tip at z=0
    bpy.context.view_layer.update()
    zmin = min((o.matrix_world @ v.co).z for o in meshes[:1] for v in o.data.vertices)
    dz = -zmin + 0.012
    log("heel pose sign", sgn, "lift", round(dz, 4), "toe z after", round(toe_z("Left"), 4))
    for o in meshes: o.data.transform(Matrix.Translation((0, 0, dz)))
    activate(arm); bpy.ops.object.mode_set(mode="EDIT")
    for b in arm.data.edit_bones: b.head.z += dz; b.tail.z += dz
    bpy.ops.object.mode_set(mode="OBJECT"); bpy.context.view_layer.update()
    return dz

def make_heels(eb, P, page, color_kind):
    """pumps: a closed shell over the forefoot and heel cup, a sole plate and a slim heel to the ground"""
    out = []; mw = eb.matrix_world; W = vweights(eb)
    for side in ("Left", "Right"):
        pts = [mw @ eb.data.vertices[i].co for i, w in enumerate(W) if ws(w, (side + "Foot", side + "ToeBase")) > 0.45]
        if not pts: continue
        ank = P[side + "Foot"]; toe = P[side + "ToeBase"]
        ymin = min(p.y for p in pts); ymax = max(p.y for p in pts); zmin = min(p.z for p in pts)
        fw = lambda p: (ymax - p.y) / max(0.05, ymax - ymin)      # 0 at the heel .. 1 at the toe (front is -y)
        zhb = min((p.z for p in pts if fw(p) < 0.15), default=zmin); ztb = min((p.z for p in pts if fw(p) > 0.8), default=zmin)
        def test(p):
            f = fw(p); h = p.z - (zhb + (ztb - zhb) * f)
            return h < 0.026 + 0.022 * max(0.0, f - 0.55) / 0.45 + (0.022 if f < 0.15 else 0.0)
        sh, bm = foot_shell(eb, side, test, "G_pump" + side)
        bm.normal_update()
        for v in bm.verts: v.co = v.co + v.normal * 0.0035
        relax_boundary(bm, 3, 0.5)
        hd = boundary_dist(bm); hl = [min(1.0, hd[v] / 0.03) for v in bm.verts]
        bm.to_mesh(sh.data); bm.free()
        set_group_from(sh, "npc_hem", hl)
        out.append(sh)
        # heel: tapered square post from the heel cup to the floor
        heel_pts = [p for p in pts if p.y > ymax - 0.05 and p.z < zmin + 0.03]
        hx = sum(p.x for p in heel_pts) / max(1, len(heel_pts)); hy = ymax - 0.03; hz = min(p.z for p in heel_pts) if heel_pts else zmin
        bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap")
        r0, r1 = 0.016, 0.006; N = 8
        top = [bm.verts.new((hx + math.cos(a) * r0, hy + math.sin(a) * r0 * 1.3, hz + 0.004)) for a in [2 * math.pi * i / N for i in range(N)]]
        bot = [bm.verts.new((hx + math.cos(a) * r1, hy + 0.012 + math.sin(a) * r1, 0.0)) for a in [2 * math.pi * i / N for i in range(N)]]
        for i in range(N):
            f = bm.faces.new((top[i], bot[i], bot[(i + 1) % N], top[(i + 1) % N]))
            for l, (u, vv) in zip(f.loops, ((i / N, 1), (i / N, 0), ((i + 1) / N, 0), ((i + 1) / N, 1))): l[uvl].uv = (u, vv)
        f = bm.faces.new(list(reversed(bot)))
        for l in f.loops: l[uvl].uv = (0.5, 0.0)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        me = bpy.data.meshes.new("G_heel" + side); bm.to_mesh(me); bm.free()
        hobj = new_obj("G_heel" + side, me)
        for g in eb.vertex_groups: hobj.vertex_groups.new(name=g.name)
        hobj.vertex_groups[PRE + side + "Foot"].add(list(range(len(me.vertices))), 1.0, "REPLACE")
        set_group_from(hobj, "npc_hem", [1.0] * len(me.vertices))
        page.append((hobj, 0.05, 0.08)); out.append(hobj)
    return out

# ------------------------------------------------------------------ hair: trims and buns
def trim_hair(hair, P, mode, hat_edge=None):
    mw = hair.matrix_world; head = P["Head"]
    bm = bmesh.new(); bm.from_mesh(hair.data); bm.faces.ensure_lookup_table()
    kill = []
    for f in bm.faces:
        c = mw @ f.calc_center_median()
        if mode == "fade":   # remove the sides and back below the parietal ridge; the painted scalp does the fade
            side = abs(c.x - head.x) > 0.058 and c.z < P["topZ"] - 0.062
            back = c.y > head.y + 0.03 and c.z < P["topZ"] - 0.075
            if side or back: kill.append(f)
        if hat_edge is not None and (c.z > hat_edge(c) - 0.004 or c.y < head.y - 0.03): kill.append(f)
    bmesh.ops.delete(bm, geom=list(set(kill)), context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(hair.data); bm.free()

def make_bun(hair, P):
    """turn the ponytail into a high bun: drop the tail cards, add a wound bun of the same strand texture"""
    mw = hair.matrix_world; head = P["Head"]
    bm = bmesh.new(); bm.from_mesh(hair.data); bm.faces.ensure_lookup_table()
    uvl = bm.loops.layers.uv.active
    kill = [f for f in bm.faces if (mw @ f.calc_center_median()).z < P["topZ"] - 0.1 and (mw @ f.calc_center_median()).y > head.y + 0.045]
    # remember a strand UV window from the killed tail cards
    us = [l[uvl].uv.copy() for f in kill for l in f.loops] if uvl else []
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    u0 = min((u.x for u in us), default=0.6); u1 = max((u.x for u in us), default=0.7); v0 = min((u.y for u in us), default=0.2); v1 = max((u.y for u in us), default=0.8)
    # bun: 3 nested wound bands (each a ring of cards), around an axis pointing up-back
    c = Vector((head.x, P["backY"] - 0.004, P["topZ"] - 0.04))
    axis = Vector((0, 0.55, 0.85)).normalized(); t1 = axis.cross(Vector((1, 0, 0))).normalized(); t2 = axis.cross(t1)
    for band in range(4):
        R = 0.034 - band * 0.006; Hh = 0.024 - band * 0.003; N = 18; tilt = band * 0.5
        prev = None; first = None
        for i in range(N + 1):
            a = 2 * math.pi * i / N + tilt
            rad = (t1 * math.cos(a) + t2 * math.sin(a))
            ctr = c + rad * R + axis * (band * 0.004)
            lo = bm.verts.new(ctr - axis * Hh * 0.5 + rad * 0.004); hi = bm.verts.new(ctr + axis * Hh * 0.5 - rad * 0.006)
            if prev:
                f = bm.faces.new((prev[0], lo, hi, prev[1]))
                if uvl:
                    uu0 = u0 + (u1 - u0) * ((i - 1) % 4) / 4; uu1 = u0 + (u1 - u0) * (((i - 1) % 4) + 1) / 4
                    for l, (u, v) in zip(f.loops, ((uu0, v0), (uu1, v0), (uu1, v1), (uu0, v1))): l[uvl].uv = (u, v)
            prev = (lo, hi)
    dl = bm.verts.layers.deform.active
    gi = hair.vertex_groups.get(PRE + "Head")
    if dl and gi:
        for v in bm.verts:
            if len(v[dl]) == 0: v[dl][gi.index] = 1.0
    bm.normal_update(); bm.to_mesh(hair.data); bm.free()

def make_shell_hair(eb, P, layers=3):
    """short top hair for fades: stacked scalp shells with an alpha strand texture (volume), sides are painted"""
    mw = eb.matrix_world; W = vweights(eb); head = P["Head"]; top = P["topZ"]
    def inside(p):
        ang = math.atan2(p.x - head.x, -(p.y - head.y)); ca = math.cos(ang)
        lim = top - 0.046 - 0.024 * max(0.0, ca) + 0.006 * max(0.0, -ca)
        return p.z > lim
    co = [mw @ v.co for v in eb.data.vertices]
    inc = [ws(W[i], ("Head",)) > 0.5 and inside(p) for i, p in enumerate(co)]
    objs = []
    for k in range(layers):
        sh = copy_obj(eb, "G_shell%d" % k); sh.modifiers.clear()
        bm = bmesh.new(); bm.from_mesh(sh.data); bm.faces.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if sum(inc[v.index] for v in f.verts) < len(f.verts)], context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        bm.normal_update()
        relax_boundary(bm, 4, 0.5)
        for v in bm.verts: v.co = v.co + v.normal * (0.003 + k * 0.0045)
        uvl = bm.loops.layers.uv.active or bm.loops.layers.uv.new("UVMap")
        for f in bm.faces:
            for l in f.loops:
                p = mw @ l.vert.co
                l[uvl].uv = ((p.x - head.x) / 0.24 + 0.5 + k * 0.17, (p.y - head.y) / 0.28 + 0.5 + k * 0.11)
        bm.to_mesh(sh.data); bm.free()
        objs.append(sh)
    activate(objs[0])
    for o in objs[1:]: o.select_set(True)
    bpy.ops.object.join(); objs[0].name = "G_shellhair"
    return objs[0]

def trim_shoes(o, P, keep):
    """drop the sock part of a MakeHuman shoe above ankle + keep (dress shoes show no sock, sneakers a low one)"""
    mw = o.matrix_world; lim = P["ankleZ"] + keep
    bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if (mw @ f.calc_center_median()).z > lim], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(o.data); bm.free()
SOCK_KEEP = {"shoes04": 0.004, "shoes01": 0.006, "shoes03": 0.12, "shoes02": 0.04}

# ------------------------------------------------------------------ UV packing for new pieces (free space of page 1)
def free_rects(eb, n=64):
    occ = np.zeros((n, n), dtype=bool)
    uv = eb.data.uv_layers[0].data
    for poly in eb.data.polygons:
        us = [uv[li].uv for li in poly.loop_indices]
        x0 = int(min(u.x for u in us) * n); x1 = int(math.ceil(max(u.x for u in us) * n)); y0 = int(min(u.y for u in us) * n); y1 = int(math.ceil(max(u.y for u in us) * n))
        occ[max(0, y0 - 1):min(n, y1 + 1), max(0, x0 - 1):min(n, x1 + 1)] = True
    return occ

def pack(occ, pieces):
    """pieces: [(obj, width_m, height_m)] -> remap each obj's UVs into a free rectangle (shelf-first fit, keeps aspect)"""
    n = occ.shape[0]; placed = []
    for obj, wm, hm in sorted(pieces, key=lambda p: -p[1] * p[2]):
        # target density about 1 cell per 2.7 cm; shrink until it fits
        for scale in (1.0, 0.8, 0.65, 0.5, 0.4, 0.3, 0.22, 0.16):
            cw = max(2, int(round(wm / 0.027 * scale))); chh = max(2, int(round(hm / 0.027 * scale)))
            if cw > n or chh > n: continue
            spot = None
            for y in range(0, n - chh + 1):
                for x in range(0, n - cw + 1):
                    if not occ[y:y + chh, x:x + cw].any(): spot = (x, y); break
                if spot: break
            if spot: break
        if not spot: log("NO UV SPACE for", obj.name); continue
        x, y = spot; occ[y:y + chh, x:x + cw] = True
        r = ((x + 0.5) / n, (y + 0.5) / n, (x + cw - 0.5) / n, (y + chh - 0.5) / n)
        for l in obj.data.uv_layers[0].data:
            u, v = l.uv; l.uv = (r[0] + max(0, min(1, u)) * (r[2] - r[0]), r[1] + max(0, min(1, v)) * (r[3] - r[1]))
        placed.append((obj.name, r))
    return placed

# ------------------------------------------------------------------ build one archetype
def build(spec):
    t0 = __import__("time").time()
    clear_scene()
    macro = TargetService.get_default_macro_info_dict()
    for k, v in spec["macro"].items(): macro[k] = v
    body = HumanService.create_human(macro_detail_dict=macro, scale=0.1)
    for name, w in spec["details"].items():
        p = TargetService.target_full_path(name)
        if p: TargetService.load_target(body, p, weight=w, name=name)
    bpy.context.view_layer.update()
    HumanService.add_builtin_rig(body, "mixamo")
    hs = spec["hair"]["style"]; hair_src = "ponytail01" if hs == "bun" else hs
    shoe_src = MH_SHOES.get(spec["shoes"])
    proxies = [("eyes", "low-poly.mhclo", "Eyes"), ("eyebrows", spec["brows"] + ".mhclo", "Eyebrows"), ("eyelashes", spec["lashes"] + ".mhclo", "Eyelashes")]
    fade = spec["hair"].get("trim") == "fade"
    if hair_src in MH_HAIR and not fade: proxies.append(("hair", hair_src + ".mhclo", "Hair"))
    if shoe_src: proxies.append(("clothes", shoe_src + ".mhclo", "Clothes"))
    for sub, fn, at in proxies:
        p = find_asset(fn, sub)
        if p: HumanService.add_mhclo_asset(p, body, asset_type=at, material_type="GAMEENGINE")
    before = set(bpy.data.objects)
    root = ExportService.create_character_copy(body, name_suffix="_export")
    eb = ObjectService.find_object_of_type_amongst_nearest_relatives(root, "Basemesh")
    ExportService.bake_modifiers_remove_helpers(eb, bake_masks=True, bake_subdiv=True, remove_helpers=True, also_proxy=True)
    for o in list(before): bpy.data.objects.remove(o, do_unlink=True)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    for o in [x for x in bpy.data.objects if x.type == "MESH" and x.data.shape_keys]:
        activate(o); bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for o in bpy.data.objects:
        if o.type == "MESH":
            for m in list(o.modifiers):
                if m.type == "SUBSURF": o.modifiers.remove(m)
    bpy.context.view_layer.update()
    prox = {}
    for o in bpy.data.objects:
        if o.type != "MESH" or o == eb: continue
        n = o.name.lower()
        k = "eyes" if "low-poly" in n else "brows" if "eyebrow" in n else "lashes" if "eyelash" in n else "hair" if hair_src.lower() in n else "shoes" if shoe_src and shoe_src in n else None
        if k: prox[k] = o
        else: log("unknown proxy", o.name)
    # heels: pitch the feet into the rest pose before anything is fitted
    heels = spec["shoes"].startswith("heels")
    if heels: heel_pose(arm, [eb] + list(prox.values()), None)
    P = landmarks(arm, eb)
    bvh = make_bvh(eb)
    page1 = []          # new pieces needing UV space on page 1
    pieces = []         # (obj, gspec, layer) layer: 'inner' | 'outer'
    for g in spec["garments"]:
        t = g["type"]
        if t in TOPS:
            d = dict(TOPS[t]); d.update({k: v for k, v in g.items() if k in ("sleeve", "fit")})
            if "fit" in g: d["off"] += g["fit"]
            outer = t in ("bomber", "vest", "hivis", "blazer")
            o = make_top(eb, P, t, d, bvh, under=[p[0] for p in pieces if p[2] == "inner"] if outer else None)
            pieces.append((o, g, "outer" if outer else "inner", d))
        elif t in BOTTOMS:
            d = dict(BOTTOMS[t])
            if "legLen" in g: d["leg"] = g["legLen"]
            if "fit" in g: d["off"] += g["fit"]
            o = make_bottom(eb, P, t, d, bvh); pieces.append((o, g, "inner", d))
            if d.get("bib"): pieces.append((make_bib(eb, P, d, bvh), dict(g, part="bib"), "inner", d))
        elif t in SKIRTS:
            d = dict(SKIRTS[t]); d["hemLeg"] = g.get("hemLeg", d["hemLeg"])
            o = make_skirt(eb, arm, P, t, d, bvh, page1); pieces.append((o, g, "custom", d))
        elif t in DRESSES:
            D = DRESSES[t]; dt_ = dict(D["top"]); ds = dict(D["skirt"]); ds["hemLeg"] = g.get("hemLeg", ds["hemLeg"])
            if "sleeve" in g: dt_["sleeve"] = g["sleeve"]
            o = make_top(eb, P, t + "_top", dt_, bvh); pieces.append((o, dict(g, part="bodice"), "inner", dt_))
            o2 = make_skirt(eb, arm, P, t + "_skirt", ds, bvh, page1); pieces.append((o2, dict(g, part="skirt"), "custom", ds))
        elif t == "bikini_top":
            d = dict(TOPS["sports_bra"]); d.update(off=0.003, thick=0.0015, neck=-0.09, hem=-0.24, vF=0.05)
            o = make_top(eb, P, t, d, bvh); pieces.append((o, g, "inner", d))
        else: log("unknown garment", t)
    hat_edge = None
    if spec.get("hat"):
        hsp = spec["hat"]; sh, brim, hat_edge = make_hat(eb, P, hsp, bvh, page1)
        pieces.append((sh, dict(hsp, part="crown"), "inner", {}))
        if brim: pieces.append((brim, dict(hsp, part="brim"), "custom", {}))
    if spec["shoes"] in ("flipflops", "sandals"):
        for o in make_soles(eb, P, spec["shoes"], page1): pieces.append((o, dict(type=spec["shoes"], part="sole" if "sole" in o.name else "strap"), "custom" if "sole" in o.name else "inner", {}))
    if heels:
        for o in make_heels(eb, P, page1, spec["shoes"]): pieces.append((o, dict(type=spec["shoes"], part="heel" if "heel" in o.name else "pump"), "custom" if "heel" in o.name else "inner", {}))
    # hair edits: fades get our own short top shells (no hat) ; socks trimmed off dress shoes
    if fade and not hat_edge:
        sh = make_shell_hair(eb, P); sh.parent = arm
        if not any(m.type == "ARMATURE" for m in sh.modifiers): am = sh.modifiers.new("Armature", "ARMATURE"); am.object = arm
        prox["hair"] = sh
    if "shoes" in prox: trim_shoes(prox["shoes"], P, SOCK_KEEP.get(shoe_src, 0.04))
    if "hair" in prox and not fade:
        if hs == "bun": make_bun(prox["hair"], P)
        if spec["hair"].get("trim") == "fade" or hat_edge: trim_hair(prox["hair"], P, spec["hair"].get("trim") or "", hat_edge)
    # garments: parent, armature, thickness
    for o, g, layer, d in pieces:
        o.parent = arm
        if not any(m.type == "ARMATURE" for m in o.modifiers): am = o.modifiers.new("Armature", "ARMATURE"); am.object = arm
        th = d.get("thick", 0.0025) if d else 0.002
        if g.get("part") in ("brim", "sole", "heel"): th = 0.0035 if g.get("part") == "brim" else 0.0
        if th > 0:
            m = o.modifiers.new("solid", "SOLIDIFY"); m.thickness = th; m.offset = -1.0; m.use_rim = True; m.use_even_offset = False
            apply_mod(o, m)
    # ---- body faces hidden under garments (LOD0: shoes cover the feet too; LOD1/2 keep the feet for painted shoes)
    covers = [(o, g) for o, g, layer, d in pieces if g.get("part") not in ("strap", "brim", "heel", "sole") and g["type"] not in ("apron",)]
    cbvh = []
    for o, g in covers:
        bm = bmesh.new(); bm.from_mesh(o.data); bm.transform(o.matrix_world); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
        hg = o.vertex_groups.get("npc_hem")
        hem = [0.0] * len(o.data.vertices)
        if hg:
            for v in o.data.vertices:
                for gg in v.groups:
                    if gg.group == hg.index: hem[v.index] = gg.weight
        cbvh.append((BVHTree.FromBMesh(bm), [sum(hem[v.index] for v in f.verts) / len(f.verts) for f in bm.faces], g)); bm.free()
    shoe_bvh = make_bvh(prox["shoes"]) if "shoes" in prox else None
    mw = eb.matrix_world
    bmb = bmesh.new(); bmb.from_mesh(eb.data); bmb.verts.ensure_lookup_table(); bmb.normal_update()
    Wb = vweights(eb)
    cov0 = []; cov1 = []; shrink = []
    for v in bmb.verts:
        p = mw @ v.co; n = (mw.to_3x3() @ v.normal).normalized(); c = False
        for tree, hemf, g in cbvh:
            loc, nn, fi, dist = tree.find_nearest(p, 0.06)
            if loc is None: continue
            if hemf[fi] > (0.35 if g.get("part") != "skirt" else 0.6) and (loc - p).dot(n) > -0.004: c = True; break
        cs = c
        if not c and shoe_bvh:
            loc, nn, fi, dist = shoe_bvh.find_nearest(p, 0.03)
            if loc is not None and ws(Wb[v.index], ("LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase")) > 0.5 and p.z < P["ankleZ"] + 0.03: cs = True
        cov0.append(cs); cov1.append(c)
        # skin that stays (near hems) but sits under cloth is pulled in a little so it never pokes through
        if not c:
            for tree, hemf, g in cbvh:
                loc, nn, fi, dist = tree.find_nearest(p, 0.03)
                if loc is not None and (loc - p).dot(n) > -0.002 and g.get("part") != "skirt": shrink.append(v.index); break
    bmb.free()
    if shrink:
        bm = bmesh.new(); bm.from_mesh(eb.data); bm.verts.ensure_lookup_table(); bm.normal_update()
        for i in shrink: bm.verts[i].co -= bm.verts[i].normal * 0.0035
        bm.to_mesh(eb.data); bm.free()
    occ = free_rects(eb)
    lowsrc = copy_obj(eb, "body_lowsrc")
    for obj, cov in ((eb, cov0), (lowsrc, cov1)):
        bm = bmesh.new(); bm.from_mesh(obj.data)
        bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(cov[v.index] for v in f.verts)], context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        bm.to_mesh(obj.data); bm.free()
    # ---- UVs: page 2 for outer layers, packing for new pieces
    outer = any(layer == "outer" for _, _, layer, _ in pieces)
    big = any(wm * hm > 0.15 for (o, wm, hm) in page1)
    page2 = outer or big
    custom = [(o, wm, hm) for (o, wm, hm) in page1]
    if page2:   # new pieces go to page 2 (free space around the outer layers) at full density
        occ2 = np.zeros_like(occ)
        for o, g, layer, d in pieces:
            if layer != "outer": continue
            uvd = o.data.uv_layers[0].data; n = occ2.shape[0]
            for poly in o.data.polygons:
                us = [uvd[li].uv for li in poly.loop_indices]
                x0 = int(min(u.x for u in us) * n); x1 = int(math.ceil(max(u.x for u in us) * n)); y0 = int(min(u.y for u in us) * n); y1 = int(math.ceil(max(u.y for u in us) * n))
                occ2[max(0, y0 - 1):min(n, y1 + 1), max(0, x0 - 1):min(n, x1 + 1)] = True
        placed = pack(occ2, custom)
    else: placed = pack(occ, custom)
    outer = page2
    def squeeze(obj, right):
        for l in obj.data.uv_layers[0].data:
            u, v = l.uv; l.uv = ((0.5 + u * 0.5) if right else u * 0.5, v)
    if outer:
        for o in [eb, lowsrc] + [p[0] for p in pieces]:
            layer = next((p[2] for p in pieces if p[0] == o), "inner")
            squeeze(o, layer == "outer" or (layer == "custom" and page2))
    # ---- materials
    def mat(name):
        m = bpy.data.materials.get(name) or bpy.data.materials.new(name); return m
    for o in [eb, lowsrc] + [p[0] for p in pieces]:
        o.data.materials.clear(); o.data.materials.append(mat("npcBody"))
    if "hair" in prox: prox["hair"].data.materials.clear(); prox["hair"].data.materials.append(mat("npcHair"))
    for k, mn in (("eyes", "npcEye"), ("brows", "npcBrow"), ("lashes", "npcLash"), ("shoes", "npcShoe")):
        if k in prox: prox[k].data.materials.clear(); prox[k].data.materials.append(mat(mn))
    # ---- painter data (before joining): per piece triangles, atlas UVs, positions, normals, hem
    dump = {"names": []}
    allp = [(eb, {"type": "skin"}, "skin"), (lowsrc, {"type": "skin", "part": "low"}, "skinlow")] + [(o, g, layer) for o, g, layer, d in pieces]
    for i, (o, g, layer) in enumerate(allp):
        me = o.data; me.calc_loop_triangles()
        co = np.array([tuple(o.matrix_world @ v.co) for v in me.vertices], dtype=np.float32)
        nor = np.array([tuple((o.matrix_world.to_3x3() @ v.normal).normalized()) for v in me.vertices], dtype=np.float32)
        tri = np.array([tuple(t.vertices) for t in me.loop_triangles], dtype=np.int32).reshape(-1, 3)
        uvd = me.uv_layers[0].data
        tuv = np.array([[tuple(uvd[li].uv) for li in t.loops] for t in me.loop_triangles], dtype=np.float32).reshape(-1, 3, 2)
        hem = np.ones(len(me.vertices), dtype=np.float32)
        hg = o.vertex_groups.get("npc_hem")
        if hg:
            for v in me.vertices:
                for gg in v.groups:
                    if gg.group == hg.index: hem[v.index] = gg.weight
        key = "p%d" % i
        dump[key + "_co"] = co; dump[key + "_n"] = nor; dump[key + "_tri"] = tri; dump[key + "_uv"] = tuv; dump[key + "_hem"] = hem
        dump["names"].append(json.dumps({"type": g.get("type"), "part": g.get("part"), "layer": layer}))
    # landmarks in Blender coordinates
    if "eyes" in prox:
        ev = [prox["eyes"].matrix_world @ v.co for v in prox["eyes"].data.vertices]
        for side, sg in (("eyeL", 1), ("eyeR", -1)):
            vs = [p for p in ev if p.x * sg > 0]
            if vs: P[side] = sum(vs, Vector()) / len(vs)
    Pj = {k: list(v) if isinstance(v, Vector) else ([list(x) for x in v] if isinstance(v, list) else v) for k, v in P.items()}
    np.savez_compressed(os.path.join(WORK, spec["id"] + ".npz"), names=np.array(dump.pop("names")), landmarks=json.dumps(Pj), outer=outer, **dump)
    for o in [eb, lowsrc] + [p[0] for p in pieces] + list(prox.values()):
        g = o.vertex_groups.get("npc_hem")
        if g: o.vertex_groups.remove(g)
    # ---- join LOD0 body + garments; LOD source
    garments = [p[0] for p in pieces]
    def join(objs, name):
        activate(objs[0])
        for o in objs[1:]: o.select_set(True)
        bpy.ops.object.join(); objs[0].name = name; return objs[0]
    low_garments = [copy_obj(o, o.name + "_low") for o in garments]
    lod0 = join([eb] + garments, "LOD0_body")
    lowj = join([lowsrc] + low_garments, "LOD1_body")
    lod2 = copy_obj(lowj, "LOD2_body")
    tris = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)
    for o, target in ((lowj, 7000), (lod2, 1700)):
        r = min(1.0, target / max(1, tris(o)))
        dm = o.modifiers.new("dec", "DECIMATE"); dm.ratio = r; dm.use_collapse_triangulate = True
        apply_mod(o, dm)
    lod2_hair = None
    if "hair" in prox and hs in LONG_HAIR:
        lod2_hair = copy_obj(prox["hair"], "LOD2_hair")
        dm = lod2_hair.modifiers.new("dec", "DECIMATE"); dm.ratio = 0.3; apply_mod(lod2_hair, dm)
    names = {"hair": "LOD0_hair", "eyes": "LOD0_eyes", "brows": "LOD0_brows", "lashes": "LOD0_lashes", "shoes": "LOD0_shoes"}
    for k, o in prox.items(): o.name = names[k]
    for o in bpy.data.objects:
        if o.type == "MESH":
            for a in list(o.data.color_attributes): o.data.color_attributes.remove(a)
            while len(o.data.uv_layers) > 1: o.data.uv_layers.remove(o.data.uv_layers[-1])
    keep = [arm, lod0, lowj, lod2] + list(prox.values()) + ([lod2_hair] if lod2_hair else [])
    for o in list(bpy.data.objects):
        if o not in keep: bpy.data.objects.remove(o, do_unlink=True)
    for o in keep[1:]:
        if o.parent != arm:
            mwo = o.matrix_world.copy(); o.parent = arm; o.matrix_world = mwo
    activate(arm)
    for o in keep: o.select_set(True)
    out = os.path.join(OUT, spec["id"] + ".glb")
    bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_format="GLB", export_animations=False, export_morph=False,
                              export_apply=True, export_yup=True, export_image_format="NONE", export_skins=True, export_influence_nb=4,
                              export_materials="EXPORT", export_vertex_color="NONE",
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                              export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12,
                              export_draco_generic_quantization=12, export_tangents=False)
    zs = [(lod0.matrix_world @ v.co).z for v in lod0.data.vertices]
    hipH = bone_head(arm, "Hips").z
    meta = {"id": spec["id"], "file": spec["id"] + ".glb", "height": max(zs) - min(zs), "minZ": min(zs), "hipH": hipH,
            "tris": {o.name: tris(o) for o in keep[1:]}, "atlas": [2048 if outer else 1024, 1024], "outer": outer,
            "hair": ("shell" if fade else hs) if "hair" in prox else None, "brows": spec["brows"], "lashes": spec["lashes"], "eyes": spec["eyes"], "shoes": spec["shoes"] if shoe_src else None,
            "heels": heels, "hairColor": spec["hair"]["color"], "tone": spec["tone"], "beard": spec.get("beard"), "gender": spec["gender"], "years": spec["years"], "race": spec["race"], "place": spec["place"], "poses": spec.get("poses", []),
            "placed": placed, "secs": round(__import__("time").time() - t0, 1)}
    json.dump(meta, open(os.path.join(OUT, spec["id"] + ".json"), "w"), indent=1)
    log("WROTE", spec["id"], os.path.getsize(out), meta["tris"], meta["secs"], "s")

for s in SPECS:
    if ONLY and s["id"] not in ONLY: continue
    try: build(s)
    except Exception as e:
        import traceback; traceback.print_exc(); log("FAILED", s["id"], e)
