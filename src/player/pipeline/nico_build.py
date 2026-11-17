# Southline V2 — Nico body build (CHARACTER track).
#   BLENDER_USER_RESOURCES=<dir with MPFB2> blender -b -P nico_build.py -- <workdir> <outdir>
# Builds the protagonist from the MakeHuman / MPFB2 CC0 base mesh with the design in nico_design.py and writes:
#   <workdir>/nico_base.blend     rig + base-density body with every morph (input of the hair / garment stages)
#   <workdir>/nico_mesh.npz       mesh arrays for the texture painter (positions, both UV layouts, triangles, landmarks)
#   <outdir>/nico.glb             rig + body LOD0 (subdivided) .. LOD3, eyes, lashes, brows, teeth, tongue
#   <outdir>/nico_meta.json       landmarks, eye data, morph list, measurements
# Morph targets: 34 facial action units (MakeHuman expression units, CC0) + body change shapes (fat / thin / muscle).
import sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix
from mpfb_util import *
import nico_design as D

argv = sys.argv[sys.argv.index("--") + 1:]
WORK, OUT = argv[0], argv[1]
os.makedirs(OUT, exist_ok=True)
NB = 13380                                   # real body vertices of the hm08 base mesh (helpers come after)
PRE = "mixamorig:"

def log(*a): print("[nico]", *a); sys.stdout.flush()

# ------------------------------------------------------------------ 1. identity + rig + proxies
clear_scene()
body = make_human(D.MACRO, D.DETAILS)
HumanService.add_builtin_rig(body, "mixamo")
PROX = {}
for key, sub, fn, at in [("eyes", "eyes", "high-poly.mhclo", "Eyes"), ("brows", "eyebrows", "eyebrow006.mhclo", "Eyebrows"),
                         ("lashes", "eyelashes", "eyelashes01.mhclo", "Eyelashes"), ("teeth", "teeth", "teeth_base.mhclo", "Teeth"),
                         ("tongue", "tongue", "tongue01.mhclo", "Tongue")]:
    before = set(bpy.data.objects)
    HumanService.add_mhclo_asset(find_asset(fn, sub), body, asset_type=at, material_type="GAMEENGINE")
    PROX[key] = next(o for o in bpy.data.objects if o not in before and o.type == "MESH")
bpy.context.view_layer.update()
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
assert len(body.data.vertices) == 19158
MW = np.array(body.matrix_world)
assert np.allclose(MW, np.eye(4), atol=1e-5), MW

C0 = mix_coords(body)                         # identity, full base mesh incl. helpers
zmin = C0[:NB, 2].min(); SC = D.HEIGHT_M / (C0[:NB, 2].max() - zmin)
def norm(c): c = c.copy(); c[:, 2] -= zmin; return c * SC          # feet at z=0, exact height
all_polys = [tuple(p.vertices) for p in body.data.polygons]
body_pi = [i for i, p in enumerate(all_polys) if max(p) < NB]
body_polys = [all_polys[i] for i in body_pi]
uv_all = loop_uvs(body.data)
loop_start = np.array([p.loop_start for p in body.data.polygons])
uv_body = np.concatenate([uv_all[loop_start[i]:loop_start[i] + len(all_polys[i])] for i in body_pi])
W = group_weights(body, PRE)
W = {k: v[:NB] for k, v in W.items()}
log("body polys", len(body_polys), "groups", len(W), "scale", SC)

# ------------------------------------------------------------------ 2. morph shapes on the base topology
TROOT = os.path.dirname(TargetService.target_full_path("nose-hump-incr")).rsplit(os.sep, 1)[0]
EXDIR = os.path.join(TROOT, "expression", "units", "caucasian")
MORPH = {}                                    # name -> full base mesh coords (normalised like the identity)
for f in sorted(os.listdir(EXDIR)):
    if not f.endswith(".target.gz"): continue
    nm = f[:-len(".target.gz")]
    TargetService.load_target(body, os.path.join(EXDIR, f), weight=1.0, name="X_" + nm)
    bpy.context.view_layer.update()
    MORPH[nm] = norm(mix_coords(body))
    body.shape_key_remove(body.data.shape_keys.key_blocks["X_" + nm])
EXPR = list(MORPH.keys())
ID = norm(C0)
# keep expression deltas off the body below the collar bones (tiny numeric noise would defeat sparse storage)
for nm in EXPR:
    d = MORPH[nm] - ID; d[np.linalg.norm(d, axis=1) < 2e-5] = 0; MORPH[nm] = ID + d
BODYM = []
for nm, over in D.BODY_VARIANTS.items():
    m = dict(D.MACRO); m.update(over)
    b2 = make_human(m, D.DETAILS)
    c2 = mix_coords(b2); c2 = c2.copy(); c2[:, 2] -= c2[:NB, 2].min(); c2 *= SC      # same scale as the identity: height changes are real
    # body change keeps the skeleton: remove the height drift so joints stay put (weight/muscle macros barely move them)
    c2[:, 2] *= ID[:NB, 2].max() / c2[:NB, 2].max()
    MORPH[nm] = c2; BODYM.append(nm)
    bpy.data.objects.remove(b2, do_unlink=True)
# body change shapes must not move the face (identity stays recognisable) or hands/feet much: fade deltas by region
HEADZ = None
log("morphs", len(EXPR), "expression +", BODYM)

# ------------------------------------------------------------------ 3. rig: scale, extra bones
bpy.ops.object.select_all(action="DESELECT")
arm.select_set(True); bpy.context.view_layer.objects.active = arm
# body is parented to the rig: detach helpers we rebuild ourselves
for o in list(bpy.data.objects):
    if o.type == "MESH": o.parent = None
arm.location = (0, 0, -zmin * SC); arm.scale = (SC, SC, SC)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
def bhead(n): return np.array(arm.data.bones[PRE + n].head_local)
def btail(n): return np.array(arm.data.bones[PRE + n].tail_local)
BONES = [b.name for b in arm.data.bones]
log("bones", len(BONES), "hips", bhead("Hips"), "head", bhead("Head"))

# eye data from the fitted MakeHuman eye proxy (centre + radius per side)
ec = norm(np.array([tuple(v.co) for v in PROX["eyes"].data.vertices]))
EYE = {}
for side, sel in (("L", ec[:, 0] > 0), ("R", ec[:, 0] < 0)):
    p = ec[sel]; c = (p.max(0) + p.min(0)) / 2; r = float(((p.max(0) - p.min(0))[[0, 2]]).mean() / 2)
    EYE[side] = {"c": c, "r": r}
log("eyes", {k: (v["c"].round(4).tolist(), round(v["r"], 4)) for k, v in EYE.items()})
# jaw: pivot at the temporomandibular joint (just in front of / below the ear canal), chin = mid-line vertex that travels most in mouth-open
P_ = ID[:NB]; mo = np.linalg.norm(MORPH["mouth-open"][:NB] - P_, axis=1)
mid = np.abs(P_[:, 0]) < 0.006
cand = np.nonzero(mid & (mo > mo[mid].max() * 0.85))[0]
chin_i = int(cand[np.argmin(P_[cand, 2] + P_[cand, 1])])                       # lowest, most forward of the fast-moving mid-line points
headw = W[PRE + "Head"] > 0.5
ear_x = P_[headw][np.argmax(P_[headw, 0])]                                      # outermost point of the left ear
jaw_p = np.array([0.0, ear_x[1] - 0.022, ear_x[2] - 0.012])
log("jaw pivot", jaw_p.round(4), "chin", ID[chin_i].round(4), "ear", ear_x.round(4))

# ---- head sculpt (nico_design.SCULPT): gaussian falloff brushes on the head, identity and every morph alike, so the
# expressions and body shapes keep their deltas. Eyelid rims are protected so the lids still close over the eyeball.
if getattr(D, "SCULPT", None):
    hw = np.zeros(len(ID)); hw[:NB] = np.clip(W.get(PRE + "Head", np.zeros(NB)) + 0.5 * W.get(PRE + "Neck", np.zeros(NB)), 0, 1)
    eye_mid = (EYE["L"]["c"] + EYE["R"]["c"]) / 2
    gon = np.array([ear_x[0] - 0.024, ear_x[1] - 0.030, ID[chin_i][2] + 0.030])
    LM = {"eye": eye_mid, "chin": ID[chin_i], "gonion": gon}
    guard = np.ones(len(ID))
    for sd in "LR":
        de = np.linalg.norm(ID - EYE[sd]["c"], axis=1)
        guard *= np.clip((de - EYE[sd]["r"] - 0.004) / 0.008, 0, 1)
    disp = np.zeros_like(ID)
    for nm_, (lk, off), r, dv, mirror in D.SCULPT:
        for sg in ((1, -1) if mirror else (1,)):
            c = LM[lk] + np.array([off[0] * sg, off[1], off[2]])
            if lk == "gonion":
                c = np.array([gon[0] * sg + off[0] * sg, gon[1] + off[1], gon[2] + off[2]])
            w = np.exp(-(np.linalg.norm(ID - c, axis=1) / r) ** 2 * 2.0) * hw * guard
            disp += w[:, None] * np.array([dv[0] * sg, dv[1], dv[2]])
    ID = ID + disp
    for nm_ in MORPH:
        MORPH[nm_] = MORPH[nm_] + disp
    log("sculpt", len(D.SCULPT), "brushes, max move", round(float(np.linalg.norm(disp, axis=1).max()), 4))

bpy.ops.object.mode_set(mode="EDIT")
eb = arm.data.edit_bones
def add_bone(name, head, tail, parent, roll=0.0):
    b = eb.new(name); b.head = Vector(head); b.tail = Vector(tail); b.roll = roll; b.parent = eb[parent]; b.use_connect = False; b.use_deform = True; return b
for s in "LR":
    c = EYE[s]["c"]; add_bone("Eye" + s, c, c + np.array([0, -0.03, 0]), PRE + "Head")
add_bone("Jaw", jaw_p, ID[chin_i] + np.array([0, -0.005, 0]), PRE + "Head")
for side in ("Left", "Right"):
    a, b = np.array(eb[PRE + side + "ForeArm"].head), np.array(eb[PRE + side + "Hand"].head)
    add_bone(side + "ForeArmRoll", a + (b - a) * 0.5, b, PRE + side + "ForeArm", roll=eb[PRE + side + "ForeArm"].roll)
bpy.ops.object.mode_set(mode="OBJECT")
arm.name = "NicoRig"; arm.data.name = "NicoRig"

# forearm roll weights: hand the distal part of the forearm weight to the roll bone
for side in ("Left", "Right"):
    a, b = bhead(side + "ForeArm"), bhead(side + "Hand"); ax = b - a; L2 = (ax * ax).sum()
    t = ((ID[:NB] - a) @ ax) / L2
    f = np.clip((t - 0.22) / (0.92 - 0.22), 0, 1); f = f * f * (3 - 2 * f)
    w = W[PRE + side + "ForeArm"]
    W[side + "ForeArmRoll"] = (w * f).astype(np.float32); W[PRE + side + "ForeArm"] = (w * (1 - f)).astype(np.float32)

# ------------------------------------------------------------------ 4. head / body split by UV island, head UV re-layout
def uv_islands(polys, uvs):
    par = list(range(len(polys)))
    def find(a):
        while par[a] != a: par[a] = par[par[a]]; a = par[a]
        return a
    edge = {}; li = 0
    for pi, p in enumerate(polys):
        n = len(p)
        for k in range(n):
            a, b = p[k], p[(k + 1) % n]; ua, ub = tuple(np.round(uvs[li + k], 5)), tuple(np.round(uvs[li + (k + 1) % n], 5))
            key = (a, b, ua, ub) if a < b else (b, a, ub, ua)
            if key in edge: par[find(pi)] = find(edge[key])
            else: edge[key] = pi
        li += n
    return np.array([find(i) for i in range(len(polys))])
isl = uv_islands(body_polys, uv_body)
pstart = np.concatenate([[0], np.cumsum([len(p) for p in body_polys])])
neck_z = bhead("Neck")[2]
pcz = np.array([ID[list(p), 2].min() for p in body_polys])
head_poly = np.zeros(len(body_polys), dtype=bool); info = []
for i in np.unique(isl):
    sel = np.nonzero(isl == i)[0]
    if pcz[sel].min() > neck_z - 0.03:
        head_poly[sel] = True
        luv = np.concatenate([uv_body[pstart[j]:pstart[j + 1]] for j in sel])
        info.append((i, len(sel), luv.min(0), luv.max(0)))
info.sort(key=lambda t: -t[1])
log("head islands", [(n, mn.round(3).tolist(), mx.round(3).tolist()) for _, n, mn, mx in info])
# new head layout: main island scaled to fill the height, the small ones (mouth cavity, eye interior...) shelved on the right
uv_head = uv_body.copy()
main = info[0]; mn, mx = main[2], main[3]; ext = mx - mn
s_main = 0.96 / max(ext[1], ext[0]); HEAD_UV = {"main": [float(mn[0]), float(mn[1]), float(s_main), 0.02, 0.02]}
x_free = 0.02 + ext[0] * s_main + 0.02; cur_y = 0.02; col_w = 0; cur_x = x_free
T_isl = {main[0]: (mn, s_main, np.array([0.02, 0.02]))}
for i, n, a, b in info[1:]:
    e = b - a; s = min(s_main * 1.6, (0.98 - x_free) / max(e[0], 1e-6) * 0.48)
    if cur_y + e[1] * s > 0.98: cur_y = 0.02; cur_x += col_w + 0.012; col_w = 0
    T_isl[i] = (a, s, np.array([cur_x, cur_y])); cur_y += e[1] * s + 0.012; col_w = max(col_w, e[0] * s)
for pi in np.nonzero(head_poly)[0]:
    a, s, o = T_isl[isl[pi]]
    uv_head[pstart[pi]:pstart[pi + 1]] = (uv_body[pstart[pi]:pstart[pi + 1]] - a) * s + o
assert uv_head[np.repeat(head_poly, [len(p) for p in body_polys])].max() <= 1.0001
log("head polys", int(head_poly.sum()), "of", len(body_polys), "main scale", round(float(s_main), 3))

# body-change deltas fade out on the face (identity stays), full on neck/torso/limbs
face_fade = np.clip((ID[:, 2] - (jaw_p[2] - 0.035)) / 0.05, 0, 1) * np.clip((-ID[:, 1] + jaw_p[1] + 0.02) / 0.03, 0, 1)   # 1 on the face front above the jaw
for nm in BODYM:
    d = MORPH[nm] - ID; d *= (1 - 0.75 * face_fade)[:, None]; MORPH[nm] = ID + d

# ------------------------------------------------------------------ 5. materials (placeholders: the game builds its own shaders by name)
def mat(name, col):
    m = bpy.data.materials.new(name); m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*col, 1); return m
M_HEAD, M_BODY, M_FAR = mat("skin_head", (0.72, 0.5, 0.4)), mat("skin_body", (0.7, 0.5, 0.4)), mat("skin_far", (0.7, 0.5, 0.4))
M_EYE, M_LASH, M_BROW, M_TEETH, M_TONGUE = mat("eye", (0.9, 0.9, 0.9)), mat("lashes", (0.05, 0.04, 0.03)), mat("brows", (0.08, 0.06, 0.05)), mat("teeth", (0.9, 0.88, 0.8)), mat("tongue", (0.7, 0.3, 0.3))

def bind_rig(ob):
    ob.parent = arm; md = ob.modifiers.new("Armature", "ARMATURE"); md.object = arm
ALLM = EXPR + BODYM

# ------------------------------------------------------------------ 6. body LOD1 (base density) and LOD0 (one Catmull-Clark level)
uv_final = np.where(np.repeat(head_poly, [len(p) for p in body_polys])[:, None], uv_head, uv_body)
lod1 = new_mesh_object("NicoBody_LOD1", ID[:NB], body_polys, uv_loops=uv_final, weights=W,
                       shapes={nm: MORPH[nm][:NB] for nm in ALLM}, materials=[M_HEAD, M_BODY], poly_mat=(~head_poly).astype(int))
uv2 = lod1.data.uv_layers.new(name="UVFull"); uv2.data.foreach_set("uv", uv_body.reshape(-1))     # original MakeHuman layout (far LODs, texture resampling)
bind_rig(lod1)

tmp = new_mesh_object("tmp_sub", ID[:NB], body_polys, uv_loops=uv_final, weights=W, materials=[M_HEAD, M_BODY], poly_mat=(~head_poly).astype(int))
uvt = tmp.data.uv_layers.new(name="UVFull"); uvt.data.foreach_set("uv", uv_body.reshape(-1))
sm = tmp.modifiers.new("sub", "SUBSURF"); sm.levels = 1; sm.render_levels = 1; sm.uv_smooth = "PRESERVE_BOUNDARIES"; sm.boundary_smooth = "PRESERVE_CORNERS"
dg = bpy.context.evaluated_depsgraph_get(); dg.update()
me0 = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
n0 = len(me0.vertices); base0 = np.zeros(n0 * 3); me0.vertices.foreach_get("co", base0)
lod0 = bpy.data.objects.new("NicoBody_LOD0", me0); bpy.context.scene.collection.objects.link(lod0)
for g in tmp.vertex_groups: lod0.vertex_groups.new(name=g.name)
lod0.shape_key_add(name="Basis", from_mix=False)
buf = np.zeros(n0 * 3)
for nm in ALLM:
    tmp.data.vertices.foreach_set("co", MORPH[nm][:NB].reshape(-1)); tmp.data.update()
    dg = bpy.context.evaluated_depsgraph_get(); dg.update()
    tmp.evaluated_get(dg).data.vertices.foreach_get("co", buf)
    d = buf - base0; d = d.reshape(-1, 3); d[np.linalg.norm(d, axis=1) < 1.5e-5] = 0
    k = lod0.shape_key_add(name=nm, from_mix=False); k.data.foreach_set("co", (base0.reshape(-1, 3) + d).reshape(-1)); k.value = 0
bpy.data.objects.remove(tmp, do_unlink=True)
me0.polygons.foreach_set("use_smooth", [True] * len(me0.polygons))
bind_rig(lod0)
log("LOD0 verts", n0, "polys", len(me0.polygons), "LOD1 verts", NB, "polys", len(body_polys))

# ------------------------------------------------------------------ 7. face proxies: lashes, brows (follow the face through a surface binding), teeth, tongue
full_tris, _ = tris_of(all_polys)
def proxy_arrays(o):
    co, polys = mesh_arrays(o.data); return norm(co), polys, loop_uvs(o.data)
def bound_proxy(name, o, material, group):
    co, polys, uv = proxy_arrays(o)
    sb = SurfaceBinding(ID, full_tris, co)
    shapes = {}
    for nm in EXPR:
        c = sb.apply(MORPH[nm]); d = c - co; d[np.linalg.norm(d, axis=1) < 2e-5] = 0
        if np.abs(d).max() > 1e-4: shapes[nm] = co + d
    ob = new_mesh_object(name, co, polys, uv_loops=uv, weights={group: np.ones(len(co), dtype=np.float32)}, shapes=shapes, materials=[material])
    bind_rig(ob); log(name, len(co), "verts,", len(shapes), "morphs, max bind dist", round(float(sb.dist.max()), 4)); return ob
lashes = bound_proxy("NicoLashes", PROX["lashes"], M_LASH, PRE + "Head")
brows = bound_proxy("NicoBrows", PROX["brows"], M_BROW, PRE + "Head")
# teeth: upper arc rides the head, lower arc + tongue ride the jaw bone (the game turns the jaw with the mouth-open morph)
tco, tpolys, tuv = proxy_arrays(PROX["teeth"])
bm = bmesh.new(); bm.from_mesh(PROX["teeth"].data); bm.verts.ensure_lookup_table()
comp = -np.ones(len(bm.verts), dtype=int); nc = 0
for v in bm.verts:
    if comp[v.index] >= 0: continue
    st = [v]; comp[v.index] = nc
    while st:
        x = st.pop()
        for e in x.link_edges:
            y = e.other_vert(x)
            if comp[y.index] < 0: comp[y.index] = nc; st.append(y)
    nc += 1
bm.free()
tb = SurfaceBinding(ID, full_tris, tco); tmove = np.linalg.norm(tb.apply(MORPH["mouth-open"]) - tco, axis=1)
jw = np.clip(tmove / tmove.max(), 0, 1); jw = jw * jw * (3 - 2 * jw)             # per-vertex share of the jaw motion (lower arc 1, upper arc 0)
lower = jw > 0.5
teeth = new_mesh_object("NicoTeeth", tco, tpolys, uv_loops=tuv, weights={PRE + "Head": (1 - jw).astype(np.float32), "Jaw": jw.astype(np.float32)}, materials=[M_TEETH])
bind_rig(teeth)
gco, gpolys, guv = proxy_arrays(PROX["tongue"])
tongue = new_mesh_object("NicoTongue", gco, gpolys, uv_loops=guv, weights={"Jaw": np.ones(len(gco), dtype=np.float32)}, materials=[M_TONGUE])
bind_rig(tongue)
log("teeth comps", nc, "lower verts", int(lower.sum()), "of", len(tco))
# jaw angle that matches the mouth-open morph (chin travel seen from the jaw pivot)
lt = np.nonzero(lower)[0]; fi = lt[np.argmin(tco[lt, 1])]                     # front-most lower tooth point
c0 = tco[fi] - jaw_p; c1 = tb.apply(MORPH["mouth-open"])[fi] - jaw_p
jaw_angle = float(math.atan2(-c1[2], -c1[1]) - math.atan2(-c0[2], -c0[1]))
log("jaw open angle (rad)", round(jaw_angle, 4), "chin travel", (MORPH["mouth-open"][chin_i] - ID[chin_i]).round(4), "tooth travel", (c1 - c0).round(4))

# ------------------------------------------------------------------ 8. eyes: our own geometry (sphere with a cornea bulge), rigid on the eye bones
def eye_mesh(name, c, r, seg=40, rings=28):
    # local frame: origin at the eye centre, pole (pupil) toward -Y (forward). Cornea: a second, smaller sphere blended in.
    verts = []; polys = []; uvs = []
    IR = 0.50                                   # iris angular radius seen from the centre (rad)
    for i in range(rings + 1):
        th = math.pi * (i / rings) ** 1.35       # denser near the pole
        for j in range(seg):
            ph = 2 * math.pi * j / seg
            rr = r
            verts.append((rr * math.sin(th) * math.cos(ph), -rr * math.cos(th), rr * math.sin(th) * math.sin(ph)))
    for i in range(rings):
        for j in range(seg):
            a = i * seg + j; b = i * seg + (j + 1) % seg; c2 = (i + 1) * seg + (j + 1) % seg; d2 = (i + 1) * seg + j
            polys.append((a, d2, c2, b))
    co = np.array(verts)
    for p in polys:
        for vi in p:
            x, y, z = co[vi]; n = co[vi] / np.linalg.norm(co[vi]); th = math.acos(max(-1, min(1, -n[1])))
            rad = th / math.pi; ang = math.atan2(n[2], n[0])
            uvs.append((0.5 + rad * math.cos(ang) * 0.5, 0.5 + rad * math.sin(ang) * 0.5))   # azimuthal: pole at the centre (the shader maps by direction anyway)
    ob = new_mesh_object(name, co, polys, uv_loops=np.array(uvs), materials=[M_EYE])
    ob.location = Vector(c); return ob
eyes = {}
for s in "LR":
    e = eye_mesh("NicoEye" + s, EYE[s]["c"], EYE[s]["r"] * 0.985)
    e.parent = arm; e.parent_type = "BONE"; e.parent_bone = "Eye" + s
    bpy.context.view_layer.update()
    e.matrix_world = Matrix.Translation(Vector(EYE[s]["c"]))
    eyes[s] = e

# ------------------------------------------------------------------ 9. far LODs: decimated single-material body with welded eyes and transferred body morphs
def far_lod(name, ratio, keep_morphs):
    src = new_mesh_object("tmp_far", ID[:NB], body_polys, uv_loops=uv_body, weights=W, materials=[M_FAR])
    # weld simple eyeballs in (rigid on the head) so the sockets are never empty; their UVs point at an eye patch of the far atlas
    parts = [src]
    for s in "LR":
        c, r = EYE[s]["c"], EYE[s]["r"] * 0.985
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=r, matrix=Matrix.Translation(Vector(c)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
        me = bpy.data.meshes.new("e"); bm.to_mesh(me); bm.free()
        uvl = me.uv_layers.new(name="UVMap")
        for l in me.loops:
            p = np.array(me.vertices[l.vertex_index].co) - c; n = p / np.linalg.norm(p)
            uvl.data[l.index].uv = (0.955 + n[0] * 0.035, 0.955 + n[2] * 0.035)          # eye patch at the top-right corner of the far atlas
        eo = bpy.data.objects.new("e", me); bpy.context.scene.collection.objects.link(eo)
        eo.vertex_groups.new(name=PRE + "Head").add(range(len(me.vertices)), 1.0, "REPLACE"); me.materials.append(M_FAR)
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons)); parts.append(eo)
    nbody = len(src.data.vertices)
    dm = src.modifiers.new("dec", "DECIMATE"); dm.ratio = ratio; dm.use_collapse_triangulate = True
    bpy.ops.object.select_all(action="DESELECT"); src.select_set(True); bpy.context.view_layer.objects.active = src
    bpy.ops.object.modifier_apply(modifier="dec")
    for p in parts: p.select_set(True)
    bpy.ops.object.join()
    src.name = name; src.data.name = name
    co, _ = mesh_arrays(src.data)
    if keep_morphs:
        lod1_tris, _ = tris_of(body_polys)
        # eyeball vertices are far from the skin and must not follow body morphs: bind only skin vertices
        sb = SurfaceBinding(ID[:NB], lod1_tris, co)
        skin = sb.dist < 0.004
        src.shape_key_add(name="Basis", from_mix=False)
        for nm in keep_morphs:
            c = sb.apply(MORPH[nm][:NB]); c[~skin] = co[~skin]
            k = src.shape_key_add(name=nm, from_mix=False); k.data.foreach_set("co", c.reshape(-1)); k.value = 0
    bind_rig(src); log(name, "verts", len(src.data.vertices), "tris", len(src.data.polygons)); return src
lod2 = far_lod("NicoBody_LOD2", 0.30, BODYM)
lod3 = far_lod("NicoBody_LOD3", 0.085, [])

# ------------------------------------------------------------------ 10. landmarks + meta
def vmax(mask, axis, sign=1):
    idx = np.nonzero(mask)[0]; return ID[idx[np.argmax(ID[idx, axis] * sign)]]
headW = W[PRE + "Head"] > 0.5
P = ID[:NB]
head_top = vmax(headW, 2); nose_tip = vmax(headW & (np.abs(P[:, 0]) < 0.01), 1, -1)
ear = {s: vmax(headW & (P[:, 2] > nose_tip[2] - 0.02) & (P[:, 2] < nose_tip[2] + 0.06), 0, sg) for s, sg in (("L", 1), ("R", -1))}
meta = {
    "height": D.HEIGHT_M, "scale": SC,
    "bones": {b.name.replace(PRE, ""): {"head": [round(float(x), 5) for x in b.head_local], "tail": [round(float(x), 5) for x in b.tail_local], "parent": (b.parent.name.replace(PRE, "") if b.parent else None)} for b in arm.data.bones},
    "eyes": {s: {"center": [round(float(x), 5) for x in EYE[s]["c"]], "radius": round(EYE[s]["r"] * 0.985, 5)} for s in "LR"},
    "jaw": {"pivot": [round(float(x), 5) for x in jaw_p], "openAngle": round(jaw_angle, 4)},
    "landmarks": {"headTop": head_top.round(5).tolist(), "noseTip": nose_tip.round(5).tolist(), "earL": ear["L"].round(5).tolist(), "earR": ear["R"].round(5).tolist(), "chin": ID[chin_i].round(5).tolist()},
    "morphs": {"expression": EXPR, "body": BODYM},
    "headUV": {"islands": [{"min": [float(a[0]), float(a[1])], "scale": float(s), "offset": [float(o[0]), float(o[1])]} for (a, s, o) in T_isl.values()]},
    "axes": "Blender: +Z up, -Y forward, +X = character's left. glTF/three: +Y up, +Z forward, +X = character's left.",
}
json.dump(meta, open(os.path.join(OUT, "nico_meta.json"), "w"), indent=1)

# mesh arrays for the texture painter (LOD1 topology)
# per-vertex ambient occlusion (cosine-weighted rays against the body + teeth-free head) and smooth normals
from mathutils.bvhtree import BVHTree
_bt, _ = tris_of(body_polys)
_bvh = BVHTree.FromPolygons([tuple(c) for c in ID[:NB]], [tuple(int(i) for i in t) for t in _bt])
lod1.data.update()
VN = np.zeros(NB * 3); lod1.data.vertices.foreach_get("normal", VN); VN = VN.reshape(-1, 3)
rs = np.random.RandomState(7); NR = 56
u1 = rs.rand(NR); u2 = rs.rand(NR); rr = np.sqrt(u1); th = 2 * np.pi * u2
hemi = np.stack([rr * np.cos(th), rr * np.sin(th), np.sqrt(1 - u1)], 1)
AO = np.zeros(NB, dtype=np.float32)
for i in range(NB):
    n = VN[i]; t = np.cross(n, (0, 0, 1) if abs(n[2]) < 0.9 else (1, 0, 0)); t /= np.linalg.norm(t); b = np.cross(n, t)
    o = Vector(ID[i] + n * 0.0015); hit = 0.0
    for k in range(NR):
        d = hemi[k, 0] * t + hemi[k, 1] * b + hemi[k, 2] * n
        h = _bvh.ray_cast(o, Vector(d), 0.22)
        if h[0] is not None: hit += 1.0 - (h[3] / 0.22) ** 2 * 0.6
    AO[i] = 1.0 - hit / NR
log("vertex AO", round(float(AO.min()), 3), round(float(AO.mean()), 3))
t1, tsrc = tris_of(body_polys)
np.savez_compressed(os.path.join(WORK, "nico_mesh.npz"), co=ID[:NB], polys_flat=np.concatenate([np.array(p) for p in body_polys]), poly_len=np.array([len(p) for p in body_polys]),
                    uv_body=uv_body, uv_head=uv_head, head_poly=head_poly, weights_names=np.array(list(W.keys())), weights=np.stack([W[k] for k in W]),
                    eyeL=EYE["L"]["c"], eyeR=EYE["R"]["c"], eye_r=EYE["L"]["r"], jaw=jaw_p, chin=ID[chin_i], nose=nose_tip, head_top=head_top,
                    bone_names=np.array([b.name.replace(PRE, "") for b in arm.data.bones]), bone_heads=np.array([b.head_local for b in arm.data.bones]),
                    morph_names=np.array(ALLM), morphs=np.stack([MORPH[nm][:NB] - ID[:NB] for nm in ALLM]).astype(np.float32),
                    brows_co=mesh_arrays(brows.data)[0], lashes_co=mesh_arrays(lashes.data)[0], ao=AO, vn=VN.astype(np.float32),
                    ear=ear_x)

# ------------------------------------------------------------------ 11. save + export
for o in list(bpy.data.objects):
    if o not in (arm, lod0, lod1, lod2, lod3, lashes, brows, teeth, tongue, eyes["L"], eyes["R"]): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK, "nico_base.blend"))
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "nico.glb"), export_format="GLB", use_selection=True, export_animations=False,
                          export_morph=True, export_morph_normal=True, export_morph_tangent=False, export_try_sparse_sk=True,
                          export_skins=True, export_all_influences=False, export_def_bones=False, export_yup=True, export_apply=False,
                          export_texcoords=True, export_normals=True, export_tangents=False, export_materials="EXPORT", export_image_format="NONE",
                          export_extras=False, export_cameras=False, export_lights=False)
log("exported", os.path.getsize(os.path.join(OUT, "nico.glb")) // 1024, "KB")
