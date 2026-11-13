# Port Solana human generator v2 (CHARACTER agent) — MPFB2 bodies + MakeHuman CC0 assets + modelled garments,
# merged into ONE skinned mesh per LOD with shared texture atlases.
#   blender -b -P gen_humans2.py -- spec.json outdir atlas_layout.json [ids,comma,separated]
# Output per person: <id>.glb (armature + LOD0 [materials skinS + atlasC] + LOD1/LOD2 [atlasC only]) and <id>.json.
# Vertex colour COLOR_0: R = tint slot/16 (1 skin, 2 hair, 3.. garments), G = hem/seam band, B = fabric/16, A = panel mask.
# TEXCOORD_0 = atlas UV, TEXCOORD_1 = original body/cloth UV (fabric pattern space).
import importlib, sys, os, json, math, random
import bpy, bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

def svc(pkg, key):
    return getattr(importlib.import_module("bl_ext.user_default.mpfb." + pkg), key)
HumanService = svc("services.humanservice", "HumanService")
AssetService = svc("services.assetservice", "AssetService")
ExportService = svc("services.exportservice", "ExportService")
ObjectService = svc("services.objectservice", "ObjectService")
TargetService = svc("services.targetservice", "TargetService")

argv = sys.argv[sys.argv.index("--") + 1:]
spec_path, outdir, layout_path = argv[0], argv[1], argv[2]
only = argv[3].split(",") if len(argv) > 3 and argv[3] else None
specs = json.load(open(spec_path))
LAYOUT = json.load(open(layout_path))
os.makedirs(outdir, exist_ok=True)
FABRIC = {"skin": 0, "knit": 1, "denim": 2, "linen": 3, "lycra": 4, "hivis": 5, "canvas": 6, "guayabera": 7, "rubber": 8, "chiffon": 9, "uniform": 10}

# garment definitions: base region, offsets (m), tint slot, fabric, extras
G = {
    "tee":         dict(base="top", sleeve=0.42, off=0.012, slot=3, fabric="knit", drape=1.0, thick=0.0035, hem=0.0),
    "tank":        dict(base="top", sleeve=-0.07, off=0.010, slot=3, fabric="knit", drape=1.0, thick=0.0035, hem=0.0, neck=0.05),
    "polo":        dict(base="top", sleeve=0.46, off=0.013, slot=3, fabric="knit", drape=1.0, thick=0.004, hem=0.0, collar=True),
    "guayabera":   dict(base="top", sleeve=0.48, off=0.018, slot=3, fabric="guayabera", drape=1.0, thick=0.004, hem=0.05, collar=True),
    "shirt":       dict(base="top", sleeve=0.50, off=0.024, slot=5, fabric="linen", drape=1.0, thick=0.004, hem=0.06, collar=True, slit=0.06),
    "vest":        dict(base="top", sleeve=-0.10, off=0.055, slot=5, fabric="hivis", drape=1.0, thick=0.005, hem=0.0, slit=0.05, neck=0.07),
    "bodice":      dict(base="top", sleeve=-0.09, off=0.008, slot=6, fabric="linen", drape=0.0, thick=0.003, hem=-0.12, neck=0.07),
    "copshirt":    dict(base="top", sleeve=0.40, off=0.013, slot=3, fabric="uniform", drape=1.0, thick=0.004, hem=0.0, collar=True, marks="shirt"),
    "coptrousers": dict(base="bottom", knee=-0.40, off=0.013, flare=0.015, slot=4, fabric="uniform", thick=0.004, marks="trousers"),
    "shorts":      dict(base="bottom", knee=0.15, off=0.014, flare=0.03, slot=4, fabric="canvas", thick=0.004),
    "cargo":       dict(base="bottom", knee=0.03, off=0.02, flare=0.04, slot=4, fabric="canvas", thick=0.004, pockets=True),
    "boardshorts": dict(base="bottom", knee=0.07, off=0.016, flare=0.035, slot=4, fabric="lycra", thick=0.003),
    "trousers":    dict(base="bottom", knee=-0.40, off=0.012, flare=0.02, slot=4, fabric="linen", thick=0.004),
    "trunks":      dict(base="swim_low", off=0.004, slot=4, fabric="lycra", thick=0.0025),
    "briefs":      dict(base="briefs", off=0.003, slot=4, fabric="lycra", thick=0.002),
    "bikini_top":  dict(base="bikini", off=0.003, slot=3, fabric="lycra", thick=0.002),
    "dress":       dict(base="skirt", top=0.03, hemk=-0.04, flare=0.13, slot=6, fabric="linen"),
    "maxi":        dict(base="skirt", top=0.03, hemk=-0.38, flare=0.22, slot=6, fabric="chiffon"),
    "sarong":      dict(base="skirt", top=-0.03, hemk=-0.22, flare=0.10, slot=7, fabric="chiffon", slitDeg=(-28, 4)),
    "flipflops":   dict(base="sole", slot=8, fabric="rubber", strap="thong"),
    "sandals":     dict(base="sole", slot=8, fabric="canvas", strap="sandal"),
}


def clear_scene():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.images, bpy.data.node_groups):
        for b in list(coll):
            if b.users == 0: coll.remove(b)

def find_asset(fname, subdir):
    p = AssetService.find_asset_absolute_path(fname, asset_subdir=subdir)
    if p is None: print("MISSING ASSET", subdir, fname)
    return p

def bone_world(arm, name):
    b = arm.data.bones.get("mixamorig:" + name) or arm.data.bones.get(name)
    return (arm.matrix_world @ b.head_local) if b else None

def gw(obj):
    names = {g.index: g.name.replace("mixamorig:", "") for g in obj.vertex_groups}
    out = []
    for v in obj.data.vertices:
        d = {}
        for g in v.groups:
            n = names.get(g.group)
            if n: d[n] = d.get(n, 0) + g.weight
        out.append(d)
    return out
ws = lambda d, keys: sum(d.get(k, 0.0) for k in keys)
smooth = lambda e0, e1, x: (lambda t: t * t * (3 - 2 * t))(max(0.0, min(1.0, (x - e0) / (e1 - e0))))

def make_bvh(obj):
    bm = bmesh.new(); bm.from_mesh(obj.data); bm.transform(obj.matrix_world)
    t = BVHTree.FromBMesh(bm); bm.free(); return t

def boundary_rings(bm, rings=3):
    """distance (in edge rings) from the open boundary, for hem/seam bands"""
    dist = {v: 99 for v in bm.verts}
    front = [v for v in bm.verts if v.is_boundary]
    for v in front: dist[v] = 0
    for r in range(1, rings + 1):
        nxt = []
        for v in front:
            for e in v.link_edges:
                o = e.other_vert(v)
                if dist[o] > r: dist[o] = r; nxt.append(o)
        front = nxt
    return dist

# ------------------------------------------------------------------ shells (tops / bottoms / swimwear)
def region_shell(body, P, kind, d):
    mw = body.matrix_world; mwi = mw.inverted()
    W = gw(body); co = [mw @ v.co for v in body.data.vertices]
    hipZ, kneeZ, crotchZ, bustZ = P["hipZ"], P["kneeZ"], P["crotchZ"], P["bustZ"]
    sh = P["shoulders"]; shZ = (sh[0][0].z + sh[1][0].z) * 0.5
    Z = Vector((0, 0, 1)); planes, arm_planes = [], []
    base = d["base"]
    if base == "top":
        planes = [(Vector((0, 0, hipZ - 0.045 - d.get("hem", 0.0))), Z), (Vector((0, 0, shZ + d.get("neck", 0.06 if kind != "polo" else 0.075))), -Z)]
        for a, f in sh:
            ax = (f - a); L = ax.length; ax.normalize()
            arm_planes.append((a + ax * L * d["sleeve"], -ax))
    elif base == "bottom":
        top = hipZ + 0.07
        bot = kneeZ + d["knee"] if d["knee"] > -0.3 else P["ankleZ"] + 0.04
        planes = [(Vector((0, 0, top)), -Z), (Vector((0, 0, bot)), Z)]
    elif base == "swim_low":
        planes = [(Vector((0, 0, hipZ + 0.025)), -Z), (Vector((0, 0, crotchZ - 0.075)), Z)]
    elif base == "briefs":
        planes = [(Vector((0, 0, hipZ - 0.015)), -Z), (Vector((0, 0, crotchZ - 0.03)), Z)]
    elif base == "bikini":
        planes = [(Vector((0, 0, bustZ - 0.065)), Z), (Vector((0, 0, bustZ + 0.05)), -Z)]
    zlo = min([p.z for p, n in planes if n.z > 0] or [-9]); zhi = max([p.z for p, n in planes if n.z < 0] or [9])
    def region(i, m):
        w = W[i]; p = co[i]
        armw = ws(w, ("LeftArm", "RightArm")); forew = ws(w, ("LeftForeArm", "RightForeArm")) + sum(v for k, v in w.items() if "Hand" in k)
        headw = ws(w, ("Neck", "Head")); legw = ws(w, ("LeftLeg", "RightLeg", "LeftFoot", "RightFoot"))
        if p.z < zlo - m or p.z > zhi + m: return False
        if base == "top": return forew < 0.03 and headw < 0.6 and (d["sleeve"] > 0 or armw < 0.5)
        if base == "bottom": return armw + forew < 0.05 and legw < (0.6 if d["knee"] > -0.3 else 1.1) and ws(w, ("LeftFoot", "RightFoot")) < 0.3
        if base in ("swim_low", "briefs"): return armw + forew < 0.05 and legw < 0.15
        if base == "bikini": return armw + forew < 0.1 and headw < 0.1
        return False
    inc = [region(i, 0.03) for i in range(len(co))]
    shell = body.copy(); shell.data = body.data.copy(); shell.name = "G_" + kind
    bpy.context.collection.objects.link(shell)
    bm = bmesh.new(); bm.from_mesh(shell.data); bm.faces.ensure_lookup_table()
    keep = set(f.index for f in bm.faces if sum(inc[v.index] for v in f.verts) >= 2)
    if len(keep) < 20:
        bm.free(); bpy.data.objects.remove(shell, do_unlink=True); print("SHELL EMPTY", kind); return None
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    loc = lambda p: mwi @ p; nl = lambda n: (mwi.to_3x3() @ n).normalized()
    def cut(fs, pco, pno):
        verts = list({v for f in fs for v in f.verts}); edges = list({e for f in fs for e in f.edges})
        bmesh.ops.bisect_plane(bm, geom=verts + edges + list(fs), plane_co=loc(pco), plane_no=nl(pno), clear_inner=True, dist=1e-5)
    for pco, pno in planes: cut(list(bm.faces), pco, pno)
    if arm_planes:
        dl = bm.verts.layers.deform.active
        gidx = {g.name.replace("mixamorig:", ""): g.index for g in shell.vertex_groups}
        for side, (pco, pno) in enumerate(arm_planes):
            sg = [gidx.get(("LeftArm", "RightArm")[side]), gidx.get(("LeftForeArm", "RightForeArm")[side])]
            sg = [g for g in sg if g is not None]
            fs = [f for f in bm.faces if dl and sum(v[dl].get(g, 0) for v in f.verts for g in sg) / len(f.verts) > (0.15 if d["sleeve"] < 0.1 else 0.35)]
            if fs: cut(fs, pco, pno)
    if d.get("slit"):  # open front (shirts / vests): remove a vertical strip at the front centre
        fs = [f for f in bm.faces if all(abs((mw @ v.co).x) < d["slit"] * 0.5 + 0.004 and (mw @ v.co).y < 0 for v in f.verts)]
        bmesh.ops.delete(bm, geom=fs, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(shell.data); bm.free()
    return shell, planes, arm_planes

def clothify(shell, body_bvh, P, kind, d, armw_fn):
    """inflate, smooth out anatomy, drape tops straight below the chest, loosen sleeves / leg openings"""
    mw = shell.matrix_world; mwi = mw.inverted()
    bm = bmesh.new(); bm.from_mesh(shell.data); bm.verts.ensure_lookup_table(); bm.normal_update()
    off = d["off"]
    for v in bm.verts: v.co = v.co + v.normal * off
    interior = [v for v in bm.verts if not v.is_boundary]
    iters = 10 if d["base"] in ("top", "bottom") else 3
    for _ in range(iters):
        bmesh.ops.smooth_vert(bm, verts=interior, factor=0.55, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    # drape: below the chest the cloth hangs straight down from the widest ring
    W = armw_fn(bm)
    if d["base"] == "top" and d.get("drape", 0) > 0:
        bz = P["bustZ"]; BIN = 48
        pts = [(mw @ v.co, v) for v in bm.verts]
        torso = [(p, v) for p, v in pts if W[v.index] < 0.25]
        ring = [p for p, v in torso if abs(p.z - bz) < 0.035]
        if ring:
            cx = sum(p.x for p in ring) / len(ring); cy = sum(p.y for p in ring) / len(ring)
            rmax = [0.0] * BIN
            for p in ring:
                a = math.atan2(p.y - cy, p.x - cx); b = int((a + math.pi) / (2 * math.pi) * BIN) % BIN
                rmax[b] = max(rmax[b], math.hypot(p.x - cx, p.y - cy))
            for i in range(BIN):  # fill gaps
                if rmax[i] == 0: rmax[i] = max(rmax[(i - 1) % BIN], rmax[(i + 1) % BIN])
            for p, v in torso:
                if p.z >= bz: continue
                t = smooth(bz, bz - 0.12, p.z) * d["drape"]
                a = math.atan2(p.y - cy, p.x - cx); b = int((a + math.pi) / (2 * math.pi) * BIN) % BIN
                r = math.hypot(p.x - cx, p.y - cy); rt = max(r, rmax[b] * 0.985 + 0.006)
                rn = r + (rt - r) * t
                if r > 1e-4:
                    q = Vector((cx + (p.x - cx) / r * rn, cy + (p.y - cy) / r * rn, p.z))
                    v.co = mwi @ q
        # loose sleeves: push away from the upper-arm axis, flaring toward the cuff
        for (a, f) in P["shoulders"]:
            ax = (f - a); L = ax.length; axn = ax / L
            for v in bm.verts:
                if W[v.index] < 0.3: continue
                p = mw @ v.co; t = (p - a).dot(axn)
                if t < 0 or t > L * 0.6: continue
                c = a + axn * t; rv = p - c
                if rv.length < 1e-4 or rv.length > 0.12: continue
                v.co = mwi @ (c + rv.normalized() * (rv.length + 0.008 + 0.014 * t / (L * 0.5)))
    if d["base"] == "bottom":
        for side, leg in (("Left", P["legL"]), ("Right", P["legR"])):
            a, f = leg; ax = f - a; L = ax.length; axn = ax / L
            for v in bm.verts:
                p = mw @ v.co
                if (p.x > 0) != (a.x > 0): continue
                t = (p - a).dot(axn)
                if t < 0.05: continue
                c = a + axn * t; rv = p - c; rv.z = 0
                if rv.length < 1e-4: continue
                k = min(1.0, (t - 0.05) / max(0.1, (L * 0.9))) ** 1.4
                v.co = mwi @ (c + rv.normalized() * (rv.length + d.get("flare", 0.02) * k) + Vector((0, 0, (p - c).z)))
    # never inside the body: re-project anything closer than the minimum standoff
    mind = {"top": 0.007, "bottom": 0.008}.get(d["base"], 0.0022)
    for v in bm.verts:
        p = mw @ v.co
        hit = body_bvh.find_nearest(p)
        if hit and hit[0] is not None:
            loc, n, _, dist = hit
            if (p - loc).dot(n) < mind: v.co = mwi @ (loc + n * mind)
    bm.normal_update()
    # cargo pockets: bulge patches on the outer thigh, marked in the panel mask
    pocket = set()
    if d.get("pockets"):
        for v in bm.verts:
            p = mw @ v.co
            if abs(p.x) > 0.06 and P["kneeZ"] + 0.12 < p.z < P["kneeZ"] + 0.28 and abs(p.y - P["legL"][0].y) < 0.05 and abs(p.x) > abs(P["legL"][0].x) + 0.02:
                v.co = v.co + v.normal * 0.008; pocket.add(v.index)
    dist = boundary_rings(bm, 3)
    bm.to_mesh(shell.data); bm.free()
    return dist, pocket

def uniform_marks(obj, P, which):
    """police uniform details as panel-mask values: badge (1.0), shoulder patches (0.66), trouser side stripe (0.33)"""
    mw = obj.matrix_world; out = {}
    for v in obj.data.vertices:
        p = mw @ v.co
        if which == "shirt":
            # badge on the wearer's left chest (front = -Y, wearer's left = +X)
            if p.y < 0 and math.hypot(p.x - 0.085, p.z - (P["bustZ"] + 0.05)) < 0.032: out[v.index] = 1.0
            for (a, f) in P["shoulders"]:
                ax = f - a; L = ax.length; t = (p - a).dot(ax) / (L * L)
                c = a + ax * t
                if 0.12 < t < 0.33 and (p - c).length < 0.12 and abs(p.x) > abs(c.x) - 0.005 and abs(p.y - c.y) < 0.045: out[v.index] = 0.66
        else:
            for leg in (P["legL"], P["legR"]):
                a = leg[0]
                if (p.x > 0) == (a.x > 0) and abs(abs(p.x) - (abs(a.x) + 0.075)) < 0.022 and abs(p.y - a.y) < 0.03: out[v.index] = 0.33
    return out

def finish_garment(obj, kind, d, dist=None, pocket=None, uv1_from_uv=True):
    """solidify (hem / collar thickness), tint slot + fabric + hem band in vertex colours, atlas UV -> white texel"""
    me = obj.data
    # vertex colour attribute
    if "Col" not in me.color_attributes: me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    col = me.color_attributes["Col"]
    fab = FABRIC[d["fabric"]]
    for i in range(len(me.vertices)):
        band = 0.0
        if dist is not None: r = dist.get(i, 99) if isinstance(dist, dict) else 99; band = max(0.0, 1.0 - r / 3.0)
        pv = (pocket.get(i, 0.0) if isinstance(pocket, dict) else (1.0 if pocket and i in pocket else 0.0))
        col.data[i].color = (d["slot"] / 16.0, band, fab / 16.0, pv)
    # UVs: keep the body UV as pattern space (UV1), atlas UV -> white texel
    if uv1_from_uv and me.uv_layers:
        src = me.uv_layers[0]
        if "UV1" not in me.uv_layers:
            u1 = me.uv_layers.new(name="UV1")
            for i, l in enumerate(src.data): u1.data[i].uv = l.uv
    if not me.uv_layers: me.uv_layers.new(name="UVMap")
    w = LAYOUT["C"]["white"]; cu, cv = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2
    me.uv_layers[0].name = "UVMap"
    for l in me.uv_layers[0].data: l.uv = (cu, cv)
    # thickness with rims (hems, collar edges)
    t = d.get("thick", 0.003)
    if t > 0:
        m = obj.modifiers.new("solid", "SOLIDIFY"); m.thickness = t; m.offset = -1.0; m.use_rim = True; m.use_even_offset = True
        bpy.context.view_layer.objects.active = obj
        while obj.modifiers.find("solid") > 0: bpy.ops.object.modifier_move_up(modifier="solid")
        bpy.ops.object.modifier_apply(modifier="solid")
    me.color_attributes.active_color = me.color_attributes["Col"]
    obj.data.materials.clear(); obj.data.materials.append(mat_c())

def make_skirt(body, P, kind, d, arm):
    """procedural skirt (dress / maxi / sarong): cone from the hips with flare, weights transferred from the body"""
    mw = body.matrix_world
    z0 = P["hipZ"] + d["top"]; zH = (P["kneeZ"] + d["hemk"]) if d["hemk"] > -0.3 else (P["ankleZ"] + 0.05)
    if kind == "maxi": zH = P["ankleZ"] + 0.06
    BIN, RINGS = 40, 12
    Wb = gw(body)
    co = [mw @ v.co for i, v in enumerate(body.data.vertices) if ws(Wb[i], ("LeftArm", "RightArm", "LeftForeArm", "RightForeArm")) + sum(x for k, x in Wb[i].items() if "Hand" in k) < 0.05]
    slab = [p for p in co if abs(p.z - z0) < 0.03]
    cx = sum(p.x for p in slab) / len(slab); cy = sum(p.y for p in slab) / len(slab)
    rmax = [0.0] * BIN
    for p in slab:
        a = math.atan2(p.y - cy, p.x - cx); b = int((a + math.pi) / (2 * math.pi) * BIN) % BIN
        rmax[b] = max(rmax[b], math.hypot(p.x - cx, p.y - cy))
    for i in range(BIN):
        if rmax[i] == 0: rmax[i] = max(rmax[(i - 1) % BIN], rmax[(i + 1) % BIN], 0.12)
    # widest point below (hips/thighs) so the skirt clears the body
    for p in co:
        if zH < p.z < z0 and math.hypot(p.x - cx, p.y - cy) < 0.3:
            a = math.atan2(p.y - cy, p.x - cx); b = int((a + math.pi) / (2 * math.pi) * BIN) % BIN
            rmax[b] = max(rmax[b], math.hypot(p.x - cx, p.y - cy) * (1.0 if p.z > z0 - 0.15 else 0.0) or rmax[b])
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap")
    rings = []
    for k in range(RINGS + 1):
        t = k / RINGS; z = z0 + (zH - z0) * t; ring = []
        for b in range(BIN):
            a = -math.pi + (b + 0.5) / BIN * 2 * math.pi
            r = rmax[b] + 0.012 + d["flare"] * (t ** 1.15)
            # soft folds
            r += 0.006 * t * math.sin(a * 9 + k * 0.4)
            ring.append(bm.verts.new((cx + math.cos(a) * r, cy + math.sin(a) * r, z)))
        rings.append(ring)
    slit = d.get("slitDeg")
    for k in range(RINGS):
        for b in range(BIN):
            a = -180 + (b + 0.5) / BIN * 360
            if slit and k > RINGS * 0.35 and slit[0] <= (a + 90) <= slit[1]: continue  # front-side slit
            v1, v2, v3, v4 = rings[k][b], rings[k][(b + 1) % BIN], rings[k + 1][(b + 1) % BIN], rings[k + 1][b]
            f = bm.faces.new((v1, v4, v3, v2))
            for loop, (u, vv) in zip(f.loops, ((b / BIN, 1 - k / RINGS), (b / BIN, 1 - (k + 1) / RINGS), ((b + 1) / BIN, 1 - (k + 1) / RINGS), ((b + 1) / BIN, 1 - k / RINGS))):
                loop[uvl].uv = (u, vv)
    bm.normal_update()
    dist = boundary_rings(bm, 3)
    me = bpy.data.meshes.new("G_" + kind); bm.to_mesh(me); bm.free()
    obj = bpy.data.objects.new("G_" + kind, me); bpy.context.collection.objects.link(obj)
    obj.matrix_world = mw.copy() if False else obj.matrix_world
    # weights from the body (nearest surface), then soften the lower skirt toward the pelvis to limit stretching
    for g in body.vertex_groups: obj.vertex_groups.new(name=g.name)
    dt = obj.modifiers.new("dt", "DATA_TRANSFER"); dt.object = body; dt.use_vert_data = True; dt.data_types_verts = {"VGROUP_WEIGHTS"}
    dt.vert_mapping = "POLYINTERP_NEAREST"; dt.layers_vgroup_select_src = "ALL"; dt.layers_vgroup_select_dst = "NAME"
    bpy.context.view_layer.objects.active = obj; bpy.ops.object.modifier_apply(modifier="dt")
    hips = obj.vertex_groups.get("mixamorig:Hips"); ul = obj.vertex_groups.get("mixamorig:LeftUpLeg"); ur = obj.vertex_groups.get("mixamorig:RightUpLeg")
    for v in me.vertices:
        p = v.co; t = max(0.0, min(1.0, (z0 - p.z) / max(0.05, z0 - zH)))
        cur = {obj.vertex_groups[g.group].name: g.weight for g in v.groups}
        blend = min(1.0, t * 1.1)
        side = ul if p.x > cx else ur
        tgt = {"mixamorig:Hips": 0.6, side.name: 0.4} if side else {"mixamorig:Hips": 1.0}
        new = {}
        for n in set(cur) | set(tgt): new[n] = cur.get(n, 0) * (1 - blend) + tgt.get(n, 0) * blend
        s = sum(new.values()) or 1
        for g in list(v.groups): obj.vertex_groups[g.group].remove([v.index])
        for n, wv in new.items():
            if wv / s > 0.01: obj.vertex_groups[n].add([v.index], wv / s, "REPLACE")
    obj.parent = arm
    am = obj.modifiers.new("Armature", "ARMATURE"); am.object = arm
    dd = dict(d); dd["thick"] = 0.003
    finish_garment(obj, kind, dd, dist, None)
    return obj

def make_sole(body, P, kind, d, arm):
    """flip-flop / sandal soles from the foot sole outline + straps cut from the foot surface"""
    mw = body.matrix_world
    W = gw(body)
    out = []
    for side in ("Left", "Right"):
        idx = [i for i, w in enumerate(W) if ws(w, (side + "Foot", side + "ToeBase")) > 0.5]
        pts = [mw @ body.data.vertices[i].co for i in idx]
        if len(pts) < 10: continue
        low = [p for p in pts if p.z < 0.03]
        cxx = sum(p.x for p in low) / len(low); cyy = sum(p.y for p in low) / len(low)
        bm = bmesh.new()
        flat = [bm.verts.new((cxx + (p.x - cxx) * 1.12, cyy + (p.y - cyy) * 1.06, 0.0)) for p in low]
        hull = bmesh.ops.convex_hull(bm, input=flat)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        # flatten to a single top face, then extrude thickness
        for v in bm.verts: v.co.z = 0.0
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.004)
        faces = bm.faces[:]
        if faces:
            ret = bmesh.ops.extrude_face_region(bm, geom=faces)
            for v in [e for e in ret["geom"] if isinstance(e, bmesh.types.BMVert)]: v.co.z = 0.018 if kind == "sandals" else 0.013
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        # strap(s): bands cut from the foot surface just above the sole
        fz = 0.02
        strap_pts = []
        front = min(p.y for p in pts)
        for i in idx:
            p = mw @ body.data.vertices[i].co
            if kind == "flipflops":
                ok = p.z > 0.012 and abs(p.y - (front + 0.065)) < 0.012 + max(0, (0.05 - p.z)) * 0.3
            else:
                ok = p.z > 0.012 and (abs(p.y - (front + 0.06)) < 0.011 or abs(p.y - (front + 0.14)) < 0.012)
            if ok: strap_pts.append(i)
        me = bpy.data.meshes.new("sole"); bm.to_mesh(me); bm.free()
        obj = bpy.data.objects.new("G_" + kind + side, me); bpy.context.collection.objects.link(obj)
        for g in body.vertex_groups: obj.vertex_groups.new(name=g.name)
        dt = obj.modifiers.new("dt", "DATA_TRANSFER"); dt.object = body; dt.use_vert_data = True; dt.data_types_verts = {"VGROUP_WEIGHTS"}
        dt.vert_mapping = "NEAREST"; dt.layers_vgroup_select_src = "ALL"; dt.layers_vgroup_select_dst = "NAME"
        bpy.context.view_layer.objects.active = obj; bpy.ops.object.modifier_apply(modifier="dt")
        obj.parent = arm; am = obj.modifiers.new("Armature", "ARMATURE"); am.object = arm
        me.uv_layers.new(name="UVMap")
        dd = dict(d); dd["thick"] = 0
        finish_garment(obj, kind, dd, None, None, uv1_from_uv=False)
        out.append(obj)
        # strap shell
        if strap_pts:
            sset = set(strap_pts)
            st = body.copy(); st.data = body.data.copy(); st.name = "G_strap" + side
            bpy.context.collection.objects.link(st)
            b2 = bmesh.new(); b2.from_mesh(st.data); b2.faces.ensure_lookup_table()
            bmesh.ops.delete(b2, geom=[f for f in b2.faces if sum(v.index in sset for v in f.verts) < 2], context="FACES")
            bmesh.ops.delete(b2, geom=[v for v in b2.verts if not v.link_faces], context="VERTS")
            b2.normal_update()
            for v in b2.verts: v.co = v.co + v.normal * 0.004
            b2.to_mesh(st.data); b2.free()
            dd2 = dict(d); dd2["thick"] = 0.003
            finish_garment(st, kind, dd2, None, None)
            out.append(st)
    return out

# ------------------------------------------------------------------ atlas UV remap
def remap_uv(obj, rect, uvname="UVMap"):
    me = obj.data
    if not me.uv_layers: return
    if "UV1" not in me.uv_layers:
        u1 = me.uv_layers.new(name="UV1")
        for i, l in enumerate(me.uv_layers[0].data): u1.data[i].uv = l.uv
    uv = me.uv_layers[0]; uv.name = "UVMap"
    x0, y0, x1, y1 = rect
    for l in uv.data:
        u, v = l.uv
        u = min(1.0, max(0.0, u)); v = min(1.0, max(0.0, v))
        l.uv = (x0 + u * (x1 - x0), y0 + v * (y1 - y0))

def set_col(obj, slot, fabric=0):
    me = obj.data
    if "Col" not in me.color_attributes: me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    c = me.color_attributes["Col"]
    for i in range(len(me.vertices)): c.data[i].color = (slot / 16.0, 0.0, fabric / 16.0, 0.0)
    me.color_attributes.active_color = c

def mat_s():
    m = bpy.data.materials.get('skinS') or bpy.data.materials.new('skinS'); m.use_fake_user = True; return m
def mat_c():
    m = bpy.data.materials.get('atlasC') or bpy.data.materials.new('atlasC'); m.use_fake_user = True; return m
MAT_S = MAT_C = None
def materials():
    global MAT_S, MAT_C
    MAT_S = bpy.data.materials.get("skinS") or bpy.data.materials.new("skinS")
    MAT_C = bpy.data.materials.get("atlasC") or bpy.data.materials.new("atlasC")

def asset_key(matname, spec):
    n = matname.lower()
    if n.endswith(".body") or n == "human.body": return None
    for pre, keys in (("hair:", "hair"), ("brow:", "eyebrows"), ("lash:", "eyelashes")):
        pass
    import re as _re
    base = n.split(".")[-1]
    for k in LAYOUT["C"]:
        kk = k.split(":", 1)[1].lower() if ":" in k else k
        if kk == base and not k.startswith("skinlow:"): return k
    if "low-poly" in n or "high-poly" in n: return "eye:" + spec.get("eye", "brown")
    return None

# ------------------------------------------------------------------ build one person
def build(spec):
    clear_scene(); materials()
    macro = TargetService.get_default_macro_info_dict()
    for k, v in spec["macro"].items(): macro[k] = v
    body = HumanService.create_human(macro_detail_dict=macro, scale=0.1)
    sp = find_asset(spec["skin"] + ".mhmat", "skins")
    if sp: HumanService.set_character_skin(sp, body, skin_type="GAMEENGINE")
    HumanService.add_builtin_rig(body, "mixamo")
    assets = [("eyes", "low-poly.mhclo", "Eyes"), ("eyebrows", spec.get("eyebrows", "eyebrow001") + ".mhclo", "Eyebrows"), ("eyelashes", spec.get("eyelashes", "eyelashes01") + ".mhclo", "Eyelashes")]
    if spec.get("hair"): assets.append(("hair", spec["hair"] + ".mhclo", "Hair"))
    for c in spec.get("clothes", []): assets.append(("clothes", c + ".mhclo", "Clothes"))
    for sub, fn, at in assets:
        p = find_asset(fn, sub)
        if p: HumanService.add_mhclo_asset(p, body, asset_type=at, material_type="GAMEENGINE")
    root = ExportService.create_character_copy(body, name_suffix="_export")
    eb = ObjectService.find_object_of_type_amongst_nearest_relatives(root, "Basemesh")
    ExportService.bake_modifiers_remove_helpers(eb, bake_masks=True, bake_subdiv=True, remove_helpers=True, also_proxy=True)
    arm = root if root.type == "ARMATURE" else next((o for o in bpy.data.objects if o.type == "ARMATURE" and o.name.endswith("_export")), None)
    for o in [x for x in bpy.data.objects if x.type == "MESH" and x.data.shape_keys]:
        bpy.ops.object.select_all(action="DESELECT"); bpy.context.view_layer.objects.active = o; o.select_set(True)
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    bpy.context.view_layer.update()
    hz = lambda n: (bone_world(arm, n) or Vector((0, 0, 0)))
    P = {"hipZ": hz("Hips").z, "spineZ": hz("Spine1").z, "chestZ": (hz("Spine2").z + hz("Spine1").z) * 0.5 + 0.02, "neckZ": hz("Neck").z,
         "kneeZ": (hz("LeftLeg").z + hz("RightLeg").z) * 0.5, "crotchZ": (hz("LeftUpLeg").z + hz("RightUpLeg").z) * 0.5 - 0.05,
         "ankleZ": (hz("LeftFoot").z + hz("RightFoot").z) * 0.5,
         "shoulders": [(hz("LeftArm"), hz("LeftForeArm")), (hz("RightArm"), hz("RightForeArm"))],
         "legL": (hz("LeftUpLeg"), hz("LeftLeg")), "legR": (hz("RightUpLeg"), hz("RightLeg"))}
    bw = eb.matrix_world; best = None
    for v in eb.data.vertices:
        p = bw @ v.co
        if P["spineZ"] - 0.05 < p.z < P["neckZ"] - 0.08 and abs(p.x) < 0.2 and (best is None or p.y < best.y): best = p
    P["bustZ"] = best.z if best is not None else P["chestZ"]
    body_bvh = make_bvh(eb)
    # ---- garments (built from the intact body; body faces hidden under opaque garments are removed afterwards)
    garments = []; hide_planes = []
    for gs in spec.get("garments", []):
        kind = gs["type"]; d = dict(G[kind])
        if gs.get("fabric"): d["fabric"] = gs["fabric"]
        if d["base"] == "skirt":
            o = make_skirt(eb, P, kind, d, arm); garments.append((o, kind, d)); continue
        if d["base"] == "sole":
            for o in make_sole(eb, P, kind, d, arm): garments.append((o, kind, d))
            continue
        r = region_shell(eb, P, kind, d)
        if not r: continue
        sh, planes, arm_planes = r
        def armw_fn(bm, sh=sh):
            dl = bm.verts.layers.deform.active
            gidx = {g.name.replace("mixamorig:", ""): g.index for g in sh.vertex_groups}
            ia = [gidx.get(n) for n in ("LeftArm", "RightArm", "LeftForeArm", "RightForeArm")]
            ia = [i for i in ia if i is not None]
            bm.verts.ensure_lookup_table()
            return [sum(v[dl].get(i, 0) for i in ia) if dl else 0 for v in bm.verts]
        dist, pocket = clothify(sh, body_bvh, P, kind, d, armw_fn)
        if d.get("marks"): pocket = uniform_marks(sh, P, d["marks"])
        finish_garment(sh, kind, d, dist, pocket)
        garments.append((sh, kind, d))
        if kind not in ("bikini_top", "briefs", "trunks", "vest", "shirt"): hide_planes.append((planes, arm_planes, d))
    # remove body faces fully covered by opaque garments (prevents poke-through, saves triangles)
    if hide_planes:
        bm = bmesh.new(); bm.from_mesh(eb.data); mw = eb.matrix_world
        W = gw(eb)
        def covered(i, p):
            for planes, arm_planes, d in hide_planes:
                if all((p - pc).dot(pn) > 0.02 for pc, pn in planes) and all((p - pc).dot(pn) > 0.03 for pc, pn in arm_planes if (p - pc).length < 0.25):
                    if d["base"] == "top" and ws(W[i], ("LeftArm", "RightArm")) > 0.3 and d["sleeve"] < 0.1: continue
                    if d["base"] == "top" and ws(W[i], ("Neck", "Head")) > 0.3: continue
                    if d["base"] == "top" and (ws(W[i], ("LeftForeArm", "RightForeArm")) + sum(v for k, v in W[i].items() if "Hand" in k)) > 0.02: continue
                    if d["base"] == "top" and ws(W[i], ("LeftArm", "RightArm")) > 0.2 and d["sleeve"] < 0.3: continue
                    if d["base"] == "bottom" and ws(W[i], ("LeftFoot", "RightFoot")) > 0.1: continue
                    return True
            return False
        bm.verts.ensure_lookup_table()
        cov = [covered(v.index, mw @ v.co) for v in bm.verts]
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(cov[v.index] for v in f.verts)], context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        bm.to_mesh(eb.data); bm.free()
    # ---- atlas UVs + tint slots for MakeHuman meshes
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.parent == arm and not o.name.startswith("G_")]
    for o in meshes:
        mn = o.data.materials[0].name if o.data.materials else ""
        if o == eb:
            remap_uv(o, LAYOUT["S"]["skin:" + spec["skin"]]); set_col(o, 1, 0)
            o.data.materials.clear(); o.data.materials.append(mat_s()); continue
        key = asset_key(mn, spec)
        if not key: print("NO ATLAS KEY", mn); key = "white"
        remap_uv(o, LAYOUT["C"][key])
        set_col(o, 2 if key.startswith(("hair:", "brow:")) else 0, 0)
        o.data.materials.clear(); o.data.materials.append(mat_c())
    for (o, kind, d) in garments: o.parent = arm
    all_meshes = meshes + [g[0] for g in garments]
    # make every mesh carry the same layers so join keeps them
    for o in all_meshes:
        me = o.data
        if "UV1" not in me.uv_layers:
            u1 = me.uv_layers.new(name="UV1")
            for i, l in enumerate(me.uv_layers[0].data): u1.data[i].uv = l.uv
        while len(me.uv_layers) > 2:
            me.uv_layers.remove(me.uv_layers[[l.name for l in me.uv_layers].index(next(n for n in [l.name for l in me.uv_layers] if n not in ("UVMap", "UV1")))])
        if me.uv_layers[0].name != "UVMap": me.uv_layers[0].name = "UVMap"
        for ca in list(me.color_attributes):
            if ca.name != "Col": me.color_attributes.remove(ca)
    # ---- join into ONE skinned mesh (LOD0)
    bpy.ops.object.select_all(action="DESELECT")
    for o in all_meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = eb
    bpy.ops.object.join()
    lod0 = eb; lod0.name = "human_LOD0"
    lod0.data.color_attributes.active_color = lod0.data.color_attributes["Col"]
    try: lod0.data.color_attributes.render_color_index = lod0.data.color_attributes.active_color_index
    except Exception: pass
    # ---- LOD1 / LOD2: decimated, body UVs moved to the low-res skin in atlas C -> single material
    lods = []
    S = LAYOUT["S"]["skin:" + spec["skin"]]; Cs = LAYOUT["C"]["skinlow:" + spec["skin"]]
    for lvl, ratio in ((1, 0.30), (2, 0.10)):
        c = lod0.copy(); c.data = lod0.data.copy(); c.name = "human_LOD%d" % lvl
        bpy.context.collection.objects.link(c)
        dm = c.modifiers.new("dec", "DECIMATE"); dm.ratio = ratio; dm.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = c
        while c.modifiers.find("dec") > 0: bpy.ops.object.modifier_move_up(modifier="dec")
        bpy.ops.object.modifier_apply(modifier="dec")
        me = c.data; sidx = [i for i, m in enumerate(me.materials) if m and m.name.startswith("skinS")]
        uv = me.uv_layers["UVMap"]
        for poly in me.polygons:
            if poly.material_index in sidx:
                for li in poly.loop_indices:
                    u, v = uv.data[li].uv
                    uv.data[li].uv = (Cs[0] + (u - S[0]) / (S[2] - S[0]) * (Cs[2] - Cs[0]), Cs[1] + (v - S[1]) / (S[3] - S[1]) * (Cs[3] - Cs[1]))
        ci = [i for i, m in enumerate(me.materials) if m and m.name.startswith("atlasC")][0]
        for poly in me.polygons: poly.material_index = ci
        while len(me.materials) > 1:
            j = 0 if me.materials[0].name.startswith("skinS") else 1
            if len(me.materials) > j and me.materials[j].name.startswith("skinS"):
                me.materials.pop(index=j)
            else: break
        lods.append(c)
    # stats + export
    zs = [(lod0.matrix_world @ v.co).z for v in lod0.data.vertices]
    bpy.ops.object.select_all(action="DESELECT")
    for o in [arm, lod0] + lods: o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    out = os.path.join(outdir, spec["id"] + ".glb")
    bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_format="GLB", export_animations=False, export_morph=False,
                              export_apply=True, export_yup=True, export_image_format="NONE", export_skins=True, export_influence_nb=4,
                              export_vertex_color="ACTIVE", export_all_vertex_colors=False,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                              export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12,
                              export_draco_color_quantization=10, export_draco_generic_quantization=12, export_tangents=False)
    meta = {"id": spec["id"], "file": spec["id"] + ".glb", "height": max(zs) - min(zs), "verts": [len(o.data.vertices) for o in [lod0] + lods],
            "tris": [sum(len(p.vertices) - 2 for p in o.data.polygons) for o in [lod0] + lods],
            "garments": [{"kind": k, "slot": d["slot"], "fabric": d["fabric"]} for (o, k, d) in garments], "spec": spec}
    json.dump(meta, open(os.path.join(outdir, spec["id"] + ".json"), "w"), indent=1)
    print("WROTE", out, os.path.getsize(out), "verts", meta["verts"])
    return arm, lod0

if not os.environ.get("GEN_IMPORT_ONLY"):
    for s in specs:
        if only and s["id"] not in only: continue
        try: build(s)
        except Exception as e:
            import traceback; traceback.print_exc(); print("FAILED", s["id"], e)
