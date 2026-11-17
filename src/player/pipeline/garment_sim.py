# Southline V2 — garment drape (CHARACTER track). Runs after garments.py:
#   blender -b <work>/garments.blend -P garment_sim.py -- <workdir> <outdir> [render]
# garments.py cuts the pattern shells (collar, placket, hems, pocket, waistband) a little off the body. Here each garment is
# draped with Blender's cloth simulation on Nico's body in the bind pose: gravity pulls the shirt onto the shoulders,
# the sleeves hang, the front panels and hem fall, the pants settle on the hips and break over the shoe. Order: tee on the
# body, cargo pants on the body, shirt on body + tee + pants. Afterwards every garment vertex is bound to the closest body
# triangle: skin weights are interpolated from the body (cleaner than the shell's copied weights) and the body-change
# morphs (fat / thin / muscle) are re-derived from the body's own shapes. Buttons follow the shirt surface they sit on.
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import numpy as np
from mpfb_util import SurfaceBinding, tris_of, group_weights, studio, set_cam, render

argv = sys.argv[sys.argv.index("--") + 1:]
WORK, OUT = argv[0], argv[1]
RENDER = len(argv) > 2 and argv[2] == "render"
PRE = "mixamorig:"
sc = bpy.context.scene
arm = bpy.data.objects["NicoRig"]
body = bpy.data.objects["NicoBody_LOD1"]


class RigidBinding(SurfaceBinding):
    """like SurfaceBinding, but the offset rides in an orthonormal triangle frame: finishing layers (hem turn-backs,
    collar fall) keep their real thickness even where the draped triangle stretched"""
    @staticmethod
    def _frame(e1, e2):
        t = e1 / np.maximum(np.linalg.norm(e1, axis=1, keepdims=True), 1e-12)
        n = np.cross(e1, e2)
        n = n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
        b = np.cross(n, t)
        return np.stack([t, b, n], axis=2)


def obj(name):
    """garments.py objects may carry a .001 suffix (the runtime strips it)"""
    return bpy.data.objects.get(name) or bpy.data.objects.get(name + ".001")


def log(*a):
    print("[sim]", *a)
    sys.stdout.flush()


def coords(ob, key=None):
    me = ob.data
    a = np.zeros(len(me.vertices) * 3)
    if key is None:
        me.vertices.foreach_get("co", a)
    else:
        me.shape_keys.key_blocks[key].data.foreach_get("co", a)
    return a.reshape(-1, 3)


def evaluated_coords(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    a = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("co", a)
    ev.to_mesh_clear()
    return a.reshape(-1, 3)


# ---------------------------------------------------------------- body: rest shape, triangles, weights, morphs
bco = coords(body, "Basis") if body.data.shape_keys else coords(body)
btris, _ = tris_of([tuple(p.vertices) for p in body.data.polygons])
BW = group_weights(body, PRE)
BMORPH = {}
for nm in ("fat", "thin", "muscle"):
    if body.data.shape_keys and nm in body.data.shape_keys.key_blocks:
        BMORPH[nm] = coords(body, nm)
log("body verts", len(bco), "groups", len(BW), "morphs", list(BMORPH))

# collision proxy: a static copy of the body (no armature, no shape keys) so the solver sees one fixed surface
col_me = body.data.copy()
col = bpy.data.objects.new("NicoCollider", col_me)
sc.collection.objects.link(col)
if col.data.shape_keys:
    col.shape_key_clear()
col.data.vertices.foreach_set("co", bco.reshape(-1))
cm = col.modifiers.new("col", "COLLISION")
col.collision.thickness_outer = 0.002
col.collision.thickness_inner = 0.004
col.collision.cloth_friction = 4.0
col.collision.damping = 0.6


def make_static_collider(ob, name):
    me = ob.data.copy()
    o = bpy.data.objects.new(name, me)
    sc.collection.objects.link(o)
    if o.data.shape_keys:
        o.shape_key_clear()
    o.data.vertices.foreach_set("co", coords(ob).reshape(-1))
    o.modifiers.new("col", "COLLISION")
    o.collision.thickness_outer = 0.0025
    o.collision.thickness_inner = 0.003
    o.collision.cloth_friction = 8.0
    return o


def hem_band(ob):
    """vertex color green = hem / edge finishing band (written by garments.py)"""
    ca = ob.data.color_attributes.get("Color")
    if ca is None or ca.domain != "POINT":
        return np.zeros(len(ob.data.vertices))
    a = np.zeros(len(ca.data) * 4)
    ca.data.foreach_get("color", a)
    return a.reshape(-1, 4)[:, 1]


def drape(ob, pin, preset, frames=48, band=0.3):
    """Drape ob in the bind pose; pin: (N,) 0..1 goal weights. Returns the settled coords of every vertex.
    The cloth solved is a copy without the finishing band (hem turn-backs, double layers: vertex color green > band).
    Those layers would interpenetrate and crumple, so they are rebuilt afterwards on the draped surface: each keeps its
    offset in the frame of the nearest single-layer cloth triangle."""
    import bmesh
    me = ob.data
    for md in list(ob.modifiers):
        ob.modifiers.remove(md)
    if me.shape_keys:
        ob.shape_key_clear()
    rest = coords(ob)
    hem = hem_band(ob)
    keep = hem <= band
    # small separate islands (the chest pocket patch) ride on the cloth like the finishing layers
    bmi = bmesh.new()
    bmi.from_mesh(me)
    bmi.verts.ensure_lookup_table()
    island = np.full(len(bmi.verts), -1)
    sizes = []
    for v in bmi.verts:
        if island[v.index] >= 0:
            continue
        stack = [v]
        island[v.index] = len(sizes)
        n = 0
        while stack:
            q = stack.pop()
            n += 1
            for e in q.link_edges:
                o_ = e.other_vert(q)
                if island[o_.index] < 0:
                    island[o_.index] = len(sizes)
                    stack.append(o_)
        sizes.append(n)
    bmi.free()
    sizes = np.array(sizes)
    keep &= sizes[island] >= 1000
    kidx = np.nonzero(keep)[0]
    # single-layer copy
    tme = me.copy()
    tmp = bpy.data.objects.new(ob.name + "_sim", tme)
    sc.collection.objects.link(tmp)
    for vg in ob.vertex_groups:
        tmp.vertex_groups.new(name=vg.name)
    bm = bmesh.new()
    bm.from_mesh(tme)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[int(i)] for i in np.nonzero(~keep)[0]], context="VERTS")
    bm.to_mesh(tme)
    bm.free()
    assert len(tme.vertices) == len(kidx), (len(tme.vertices), len(kidx))
    ktris, _ = tris_of([tuple(p.vertices) for p in tme.polygons])
    g = tmp.vertex_groups.new(name="_pin")
    for k, i in enumerate(kidx):
        if pin[i] > 0.001:
            g.add([k], float(min(1.0, pin[i])), "REPLACE")
    col.collision.thickness_outer = preset.get("gap", 0.002)       # stand-off from the body (layers underneath)
    cl = tmp.modifiers.new("cloth", "CLOTH")
    s = cl.settings
    s.quality = preset.get("quality", 8)
    s.mass = preset.get("mass", 0.15)
    s.air_damping = 1.0
    s.tension_stiffness = preset.get("tension", 15)
    s.compression_stiffness = preset.get("tension", 15)
    s.shear_stiffness = preset.get("shear", 5)
    s.bending_stiffness = preset.get("bending", 0.5)
    s.tension_damping = 5
    s.compression_damping = 5
    s.shear_damping = 5
    s.bending_damping = 0.5
    s.vertex_group_mass = "_pin"
    s.pin_stiffness = preset.get("pin_stiffness", 1.0)
    s.shrink_min = preset.get("shrink", 0.0)
    c = cl.collision_settings
    c.collision_quality = 5
    c.distance_min = preset.get("dist", 0.004)
    c.use_self_collision = False
    cl.point_cache.frame_start = 1
    cl.point_cache.frame_end = frames
    sc.frame_start = 1
    sc.frame_end = frames
    for f in range(1, frames + 1):
        sc.frame_set(f)
    kco = evaluated_coords(tmp)
    sc.frame_set(1)
    bpy.data.objects.remove(tmp, do_unlink=True)
    out = rest.copy()
    out[kidx] = kco
    if (~keep).any():
        fb = RigidBinding(rest[kidx], ktris, rest[~keep])
        out[~keep] = fb.apply(kco)
    log(ob.name, "solved", len(kidx), "rebuilt finishing verts", int((~keep).sum()))
    return out


def finish(ob, new_co, keep_groups=()):
    """Set the draped shape as rest, rebind weights + body-change morphs from the body, re-add the armature."""
    me = ob.data
    me.vertices.foreach_set("co", new_co.reshape(-1))
    me.update()
    bind = SurfaceBinding(bco, btris, new_co)
    # skin weights: barycentric from the body, top 4, normalised (cloth far from the body gets its closest body part)
    names = list(BW.keys())
    W = bind.interp(np.stack([BW[n] for n in names], 1))
    W[W < 0.01] = 0
    top = np.argsort(-W, axis=1)[:, :4]
    W2 = np.zeros_like(W)
    rows = np.arange(len(W))[:, None]
    W2[rows, top] = W[rows, top]
    W2 /= np.maximum(W2.sum(1, keepdims=True), 1e-6)
    for vg in list(ob.vertex_groups):
        if vg.name.startswith(PRE):
            ob.vertex_groups.remove(vg)
    for k, n in enumerate(names):
        idx = np.nonzero(W2[:, k] > 1e-4)[0]
        if not len(idx):
            continue
        vg = ob.vertex_groups.new(name=n)
        for i in idx:
            vg.add([int(i)], float(W2[i, k]), "REPLACE")
    # body-change morphs follow the body surface
    ob.shape_key_add(name="Basis", from_mix=False)
    for nm, mc in BMORPH.items():
        k = ob.shape_key_add(name=nm, from_mix=False)
        k.data.foreach_set("co", bind.apply(mc).reshape(-1))
        k.value = 0
    md = ob.modifiers.new("Armature", "ARMATURE")
    md.object = arm
    ob.parent = arm
    return bind


def pin_weights(co, fn):
    return np.clip(fn(co), 0, 1)


sm = lambda e0, e1, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - e0) / (e1 - e0), 0, 1))
# body distance (for pins: cloth lying on the shoulders / hips is held, loose cloth falls)
from mathutils.bvhtree import BVHTree
from mathutils import Vector
BVH = BVHTree.FromPolygons([tuple(c) for c in bco], [tuple(int(i) for i in t) for t in btris])


def body_dist(co):
    d = np.zeros(len(co))
    for i, p in enumerate(co):
        l, n, idx, dd = BVH.find_nearest(Vector(p))
        d[i] = dd if dd is not None else 1.0
    return d


# ---------------------------------------------------------------- cargo details on the draped pants
def build_cargo_details(pants_ob):
    """side cargo pockets (bellows patch with a flap and a snap), belt loops (pants material) and a leather belt with a
    steel buckle, all laid on the draped pants surface."""
    pco_ = coords(pants_ob, "Basis") if pants_ob.data.shape_keys else coords(pants_ob)
    ptris, _ = tris_of([tuple(p.vertices) for p in pants_ob.data.polygons])
    pbvh = BVHTree.FromPolygons([tuple(c) for c in pco_], [tuple(int(i) for i in t) for t in ptris])
    V, F, C = [], [], []

    def quad_grid(P, color):
        n0 = len(V)
        R, Cc = P.shape[:2]
        for i in range(R):
            for j in range(Cc):
                V.append(tuple(P[i, j]))
                C.append(color)
        for i in range(R - 1):
            for j in range(Cc - 1):
                F.append((n0 + i * Cc + j, n0 + i * Cc + j + 1, n0 + (i + 1) * Cc + j + 1, n0 + (i + 1) * Cc + j))
        return n0

    def hit(side, y, z):
        o = Vector((side * 0.6, y, z))
        loc, nrm, idx, dd = pbvh.ray_cast(o, Vector((-side, 0, 0)), 0.56)      # stop before the other leg
        if loc is None:
            loc, nrm, idx, dd = pbvh.find_nearest(Vector((side * 0.2, y, z)))
            if loc is None:
                return None, None
        return np.array(loc), np.array(nrm) * (1 if np.dot(nrm, [side, 0, 0]) > 0 else -1)

    PAN = (0.0, 0.0, 0.0, 0.0)
    for side in (1, -1):
        # pocket centre front-back: the outer seam of the thigh at pocket height
        band = (pco_[:, 0] * side > 0.05) & (np.abs(pco_[:, 2] - 0.62) < 0.02)
        yc = float(np.average(pco_[band, 1], weights=np.maximum(pco_[band, 0] * side - 0.05, 1e-4) ** 4))
        nu, nv = 11, 13
        us = np.linspace(-0.085, 0.085, nu)
        vs = np.linspace(0.525, 0.705, nv)
        S = np.zeros((nv, nu, 3))
        Nn = np.zeros((nv, nu, 3))
        for i, zz in enumerate(vs):
            for j, uu in enumerate(us):
                h, n = hit(side, yc + uu, zz)
                if h is None:
                    h, n = np.array([side * 0.17, yc + uu, zz]), np.array([side, 0, 0])
                S[i, j], Nn[i, j] = h, n
        U = (us[None, :] + 0.085) / 0.17
        Vv = (vs[:, None] - 0.525) / 0.18
        bul = 0.003 + 0.013 * np.sin(np.pi * U) ** 0.7 * (0.55 + 0.45 * np.sin(np.pi * np.clip(Vv * 0.9, 0, 1)) ** 0.5)
        bul = bul - 0.003 * np.exp(-((U - 0.5) / 0.05) ** 2)          # box pleat down the middle
        top = S + Nn * bul[..., None]
        quad_grid(top, PAN)
        # gusset walls from the pocket edge back to the pants surface (bottom and the two sides)
        for edge in (top[0, :], top[:, 0], top[:, -1]):
            pass
        walls = [(top[0, :], S[0, :] + Nn[0, :] * 0.001), (top[:, 0], S[:, 0] + Nn[:, 0] * 0.001), (top[:, -1], S[:, -1] + Nn[:, -1] * 0.001)]
        for a_, b_ in walls:
            quad_grid(np.stack([b_, a_], 0), PAN)
        # flap: two layers 3 mm apart with a closed edge, overhanging the pocket mouth by 6 mm each side
        fu = np.linspace(-0.091, 0.091, nu)
        fv = np.linspace(0.655, 0.718, 6)
        FL = np.zeros((len(fv), nu, 3))
        FN = np.zeros((len(fv), nu, 3))
        for i, zz in enumerate(fv):
            for j, uu in enumerate(fu):
                h, n = hit(side, yc + uu, zz)
                if h is None:
                    h, n = np.array([side * 0.17, yc + uu, zz]), np.array([side, 0, 0])
                FL[i, j], FN[i, j] = h, n
        lift = np.interp(fv, [0.655, 0.70, 0.718], [0.0185, 0.0165, 0.004])[:, None] * np.ones((1, nu))
        lift *= 0.75 + 0.25 * np.sin(np.pi * (fu[None, :] + 0.091) / 0.182) ** 0.5
        outer = FL + FN * (lift + 0.003)[..., None]
        inner = FL + FN * lift[..., None]
        quad_grid(outer, PAN)
        quad_grid(inner[::-1], PAN)
        for a_, b_ in ((outer[0, :], inner[0, :]), (outer[:, 0], inner[:, 0]), (outer[:, -1], inner[:, -1])):
            quad_grid(np.stack([a_, b_], 0), PAN)
    # belt loops: 1 cm strips standing 2 mm over the belt
    yb = float(np.mean(pco_[(pco_[:, 2] > 1.0) & (pco_[:, 2] < 1.06), 1]))
    ring = (pco_[:, 2] > 1.015) & (pco_[:, 2] < 1.062)
    th = np.arctan2(pco_[ring, 1] - yb, pco_[ring, 0])
    rr = np.hypot(pco_[ring, 0], pco_[ring, 1] - yb)
    NB = 96
    bins = ((th + np.pi) / (2 * np.pi) * NB).astype(int) % NB
    rmax = np.zeros(NB)
    np.maximum.at(rmax, bins, rr)
    for _ in range(3):
        rmax = np.where(rmax <= 0, (np.roll(rmax, 1) + np.roll(rmax, -1)) / 2, rmax)
        rmax = np.maximum(rmax, (np.roll(rmax, 1) + np.roll(rmax, -1)) * 0.5 * 0.997)
    angs = (np.arange(NB) + 0.5) / NB * 2 * np.pi - np.pi

    def ring_pt(a, r_add, zz):
        k = int(((a + np.pi) / (2 * np.pi) * NB)) % NB
        r = rmax[k] + r_add
        return np.array([np.cos(a) * r, yb + np.sin(a) * r, zz])
    front = -np.pi / 2
    for la in (front + 0.42, front - 0.42, np.pi / 2):            # side loops poked through the hanging shirt
        P = np.zeros((2, 4, 3))
        for i, zz in enumerate((1.012, 1.062)):
            for j, (da, dr) in enumerate(((-0.06, 0.0005), (-0.05, 0.0065), (0.05, 0.0065), (0.06, 0.0005))):
                P[i, j] = ring_pt(la + da * 0.6 / max(rmax.mean(), 0.1), dr, zz)
        quad_grid(P, PAN)
    det = new_obj("cargo_pants_detail", V, F, C)
    # belt: 34 mm leather strap, 4 mm thick, steel frame buckle at the front
    BV, BF, BC = [], [], []
    LEA = (0.16, 0.10, 0.065, 0.0)
    STEEL = (0.72, 0.72, 0.73, 1.0)
    n0 = 0
    rows = []
    for zz, dr in ((1.020, 0.0035), (1.020, 0.0075), (1.054, 0.0075), (1.054, 0.0035)):
        row = []
        for a in angs:
            BV.append(tuple(ring_pt(a, dr, zz)))
            BC.append(LEA)
            row.append(len(BV) - 1)
        rows.append(row)
    for r0_, r1_ in ((rows[0], rows[1]), (rows[1], rows[2]), (rows[2], rows[3]), (rows[3], rows[0])):
        for k in range(NB):
            BF.append((r0_[k], r0_[(k + 1) % NB], r1_[(k + 1) % NB], r1_[k]))
    # buckle: a rectangular frame 50 x 42 mm proud of the strap
    fwd = ring_pt(front, 0.0075, 1.037)
    rgt = np.array([1.0, 0, 0])
    nrm = np.array([0, -1.0, 0])
    for (x0, x1, z0, z1) in ((-0.025, 0.025, 0.017, 0.021), (-0.025, 0.025, -0.021, -0.017), (-0.025, -0.020, -0.021, 0.021), (0.020, 0.025, -0.021, 0.021), (-0.002, 0.002, -0.021, 0.021)):
        b0 = len(BV)
        for dz in (0.0, 0.006):
            for (xx, zz) in ((x0, z0), (x1, z0), (x1, z1), (x0, z1)):
                BV.append(tuple(fwd + rgt * xx + np.array([0, 0, zz]) + nrm * (0.001 + dz)))
                BC.append(STEEL)
        for f_ in ((0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
            BF.append(tuple(b0 + i for i in f_))
    belt = new_obj("cargo_pants_belt", BV, BF, BC)
    return det, belt


def new_obj(name, V, F, C):
    me = bpy.data.meshes.new(name)
    me.from_pydata(V, [], F)
    me.update()
    o = bpy.data.objects.new(name, me)
    sc.collection.objects.link(o)
    ca = me.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="POINT")
    ca.data.foreach_set("color", np.array(C, dtype=np.float64).reshape(-1))
    u0 = me.uv_layers.new(name="UVMap")
    u1 = me.uv_layers.new(name="Fabric")
    for l in me.loops:
        p = V[l.vertex_index]
        u0.data[l.index].uv = (p[1] % 1.0, p[2] % 1.0)
        u1.data[l.index].uv = (p[1] + 0.5, p[2])
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    finish(o, coords(o))
    return o



results = {}

# ---- tee: fitted knit, held at the neck and shoulders
tee = obj("tee")
t0 = coords(tee, "Basis") if tee.data.shape_keys else coords(tee)
tee.data.vertices.foreach_set("co", t0.reshape(-1))
# the tee is a fitted knit: it keeps its fitted shell (draping it let the hem flare through the shirt); only rebind
finish(tee, t0)


# ---- cargo pants: twill, held at the waistband; legs fall and break over the shoe
pants = obj("cargo_pants")
p0 = coords(pants, "Basis") if pants.data.shape_keys else coords(pants)
pants.data.vertices.foreach_set("co", p0.reshape(-1))
pin = sm(0.93, 0.99, p0[:, 2])
pco = drape(pants, pin, {"mass": 0.3, "tension": 80, "shear": 30, "bending": 6, "shrink": 0.0, "dist": 0.003, "quality": 10}, 40)
finish(pants, pco)
log("pants draped", len(pco))

# ---- open camp shirt: light woven cotton; held only where it lies on the shoulders (yoke) and at the collar
cargo_det, cargo_belt = build_cargo_details(pants)
log("cargo details", len(cargo_det.data.vertices), "belt", len(cargo_belt.data.vertices))
# the shirt hem falls over the waistband, loops and belt: they collide (static copies)
# the shirt collides with the body only, kept 16 mm off it: enough to clear the waistband, loops and belt it hangs over
# (pants / belt colliders made the hem catch and ride up)
shirt = obj("camp_shirt_open")
s0 = coords(shirt, "Basis") if shirt.data.shape_keys else coords(shirt)
shirt.data.vertices.foreach_set("co", s0.reshape(-1))
btn = obj("camp_shirt_open_buttons")
sbind = None
if btn:
    b0 = coords(btn, "Basis") if btn.data.shape_keys else coords(btn)
    stris, _ = tris_of([tuple(p.vertices) for p in shirt.data.polygons])
    sbind = SurfaceBinding(s0, stris, b0)
pin = np.maximum(sm(1.40, 1.47, s0[:, 2]) * sm(0.05, 0.015, body_dist(s0)) * sm(0.13, 0.20, np.abs(s0[:, 0])), sm(1.47, 1.52, s0[:, 2]))
# sleeves keep their shaped tube (draping them in the A-pose made them hang away from the lowered arm)
pin = np.maximum(pin, 0.55 * sm(0.24, 0.30, np.abs(s0[:, 0])))
sco = drape(shirt, pin, {"mass": 0.15, "tension": 40, "shear": 15, "bending": 1.0, "shrink": 0.0, "dist": 0.004, "quality": 10, "gap": 0.016}, 36)
finish(shirt, sco)
if btn and sbind is not None:
    nb = sbind.apply(sco)
    for md in list(btn.modifiers):
        btn.modifiers.remove(md)
    if btn.data.shape_keys:
        btn.shape_key_clear()
    finish(btn, nb)
log("shirt draped", len(sco))
for o in (col,):
    bpy.data.objects.remove(o, do_unlink=True)

# ---------------------------------------------------------------- export (same layout as garments.py)
bpy.ops.object.select_all(action="DESELECT")
names = ["camp_shirt", "camp_shirt_buttons", "shorts", "sneakers", "camp_shirt_open", "camp_shirt_open_buttons", "tee", "cargo_pants", "cargo_pants_detail", "cargo_pants_belt"]
arm.select_set(True)
for n in names:
    o = obj(n)
    if o:
        o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "garments.glb"), export_format="GLB", use_selection=True, export_animations=False, export_morph=True, export_morph_normal=False,
                          export_skins=True, export_def_bones=False, export_yup=True, export_texcoords=True, export_normals=True, export_materials="NONE", export_vertex_color="ACTIVE", export_all_vertex_colors=True, export_active_vertex_color_when_no_material=True)
log("exported", os.path.getsize(os.path.join(OUT, "garments.glb")) // 1024, "KB")
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK, "garments_draped.blend"))

if RENDER:
    def mat(name, rgb, rough=0.8):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = m.node_tree.nodes.get("Principled BSDF")
        b.inputs["Base Color"].default_value = (*rgb, 1)
        b.inputs["Roughness"].default_value = rough
        return m
    look = {"cargo_pants_detail": mat("pd", (0.32, 0.22, 0.12)), "cargo_pants_belt": mat("bl", (0.12, 0.07, 0.04)), "camp_shirt_open": mat("sh", (0.10, 0.28, 0.26)), "camp_shirt_open_buttons": mat("bt", (0.8, 0.78, 0.7)), "tee": mat("te", (0.85, 0.84, 0.8)),
            "cargo_pants": mat("pa", (0.32, 0.22, 0.12)), "sneakers": mat("sn", (0.8, 0.78, 0.74)), "NicoBody_LOD1": mat("sk", (0.55, 0.36, 0.26), 0.55)}
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        key = o.name.replace(".001", "")
        if key in look:
            o.hide_render = False
            o.data.materials.clear()
            o.data.materials.append(look[key])
        else:
            o.hide_render = True
    studio((0, -4.2, 1.0), (0, 0, 0.92), lens=50, res=(700, 1000))
    for nm, loc in (("front", (0, -4.2, 1.0)), ("side", (4.2, 0, 1.0)), ("back", (0, 4.2, 1.0)), ("34", (2.9, -3.0, 1.1))):
        set_cam(loc, (0, 0, 0.92))
        render(os.path.join(OUT, "studio_" + nm + ".png"))
    log("rendered")
