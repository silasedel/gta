# Port Solana V2 — first wardrobe cuts for Nico (CHARACTER track): camp shirt, shorts, sneakers, built as cloth shells
# over the base body with collar, placket, buttons, hems and body-change morphs.
#   blender -b <work>/nico_base.blend -P garments.py -- <workdir> <outdir>
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
import numpy as np
from mathutils import Vector
from mpfb_util import group_weights, mesh_arrays, new_mesh_object, loop_uvs
WORK, OUT = sys.argv[sys.argv.index("--") + 1:][:2]
PRE = "mixamorig:"
arm = bpy.data.objects["NicoRig"]; body = bpy.data.objects["NicoBody_LOD1"]
co, polys = mesh_arrays(body.data); N = len(co)
W = group_weights(body)
_tot = np.maximum(sum(W.values()), 1e-6); W = {k: v / _tot for k, v in W.items()}      # MPFB weights are not normalised
def ws(*keys):
    out = np.zeros(N, dtype=np.float32)
    for k, v in W.items():
        if any(s in k for s in keys): out += v
    return out
vn = np.zeros(N * 3); body.data.vertices.foreach_get("normal", vn); vn = vn.reshape(-1, 3)
kb = body.data.shape_keys.key_blocks
def shape(nm): a = np.zeros(N * 3); kb[nm].data.foreach_get("co", a); return a.reshape(-1, 3)
BODYM = {nm: shape(nm) for nm in ("fat", "thin", "muscle")}
sm = lambda e0, e1, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - e0) / (e1 - e0), 0, 1))
x, y, z = co[:, 0], co[:, 1], co[:, 2]
wArm = ws("LeftArm", "RightArm"); wFore = ws("ForeArm"); wHand = ws("Hand"); wTorso = ws("Spine", "Hips", "Shoulder", "Neck"); wLeg = ws("UpLeg"); wShin = ws("LeftLeg", "RightLeg"); wFoot = ws("Foot", "Toe"); wHead = ws("Head")
bh = lambda n: np.array(arm.data.bones[PRE + n].head_local)
def arm_t(side):
    a, b = bh(side + "Arm"), bh(side + "ForeArm"); ax = b - a; return ((co - a) @ ax) / (ax @ ax)
tL, tR = arm_t("Left"), arm_t("Right"); tA = np.where(x > 0, tL, tR)
covers = {}

def build(name, sel, off, panel, hem_fn, flutter_fn, smooth_it=6, extra=None, r_fn=None):
    keep = [i for i, p in enumerate(polys) if all(sel[v] for v in p)]
    used = sorted({v for i in keep for v in polys[i]}); remap = {v: k for k, v in enumerate(used)}; used = np.array(used)
    pl = [tuple(remap[v] for v in polys[i]) for i in keep]
    base = co[used] + vn[used] * off[used][:, None]
    shapes = {nm: BODYM[nm][used] + vn[used] * off[used][:, None] for nm in BODYM}
    wts = {k: v[used] for k, v in W.items() if v[used].max() > 0.01}
    if name == "camp_shirt":                              # an untucked hem hangs from the hips; only half follows the thighs
        hk = next((k for k in wts if k.endswith("Hips")), None)
        for k in list(wts):
            if hk and "UpLeg" in k:
                give = wts[k] * 0.5
                wts[k] = wts[k] - give
                wts[hk] = wts[hk] + give
    ob = new_mesh_object(name, base, pl, weights=wts, shapes=shapes)
    me = ob.data
    # attributes ride through the subdivision as vertex groups (0..1 floats)
    rv = r_fn(used) if r_fn else np.ones(len(used))
    for gname, vals in (("_hem", hem_fn(used)), ("_flut", flutter_fn(used)), ("_panel", panel[used]), ("_r", rv)):
        g = ob.vertex_groups.new(name=gname)
        for i, v in enumerate(vals):
            if v > 0.001: g.add([i], float(min(1, v)), "REPLACE")
    # smooth every shape the same way (Laplacian) so the cloth hides anatomy; boundaries stay
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    nb = [[e.other_vert(v).index for e in v.link_edges] for v in bm.verts]; isb = np.array([v.is_boundary for v in bm.verts]); bm.free()
    def lap(c):
        c = c.copy()
        for _ in range(smooth_it):
            m = np.array([c[n].mean(0) if n else c[i] for i, n in enumerate(nb)]); c = np.where(isb[:, None], c, c * 0.45 + m * 0.55)
        return c
    def clear(c, bodyc):                                   # smoothing must never pull the cloth under the skin (spine groove, crotch)
        floor = ({"camp_shirt": 0.45, "camp_shirt_open": 0.45, "sneakers": 0.25}.get(name, 0.8)) * off[used]
        if name in ("camp_shirt", "camp_shirt_open"):
            floor = np.maximum(floor, 0.011)               # always clear of the tee underneath (tee sits <= 7 mm)
        dist = ((c - bodyc) * vn[used]).sum(1); need = np.maximum(0.0, floor - dist)
        c = c + vn[used] * need[:, None]
        if name in ("camp_shirt", "camp_shirt_open", "tee"):
            # smoothing bridges the dip between the neck and the shoulder: cloth must lie on the trapezius, not float over it
            dist = ((c - bodyc) * vn[used]).sum(1)
            cap = off[used] * 1.2 + 0.006
            over = np.maximum(0.0, dist - cap) * sm(1.28, 1.36, bodyc[:, 2])
            if name == "tee":
                over = np.maximum(over, np.maximum(0.0, dist - 0.007) * sm(1.08, 1.18, bodyc[:, 2]))
            c = c - vn[used] * over[:, None]
        return c
    c0 = clear(lap(base), co[used]); me.vertices.foreach_set("co", c0.reshape(-1)); me.shape_keys.key_blocks[0].data.foreach_set("co", c0.reshape(-1))
    for nm in BODYM: me.shape_keys.key_blocks[nm].data.foreach_set("co", clear(lap(shapes[nm]), BODYM[nm][used]).reshape(-1))
    if extra: extra(ob, c0, used)
    # subdivide once (shape keys evaluated one by one)
    sub = ob.modifiers.new("s", "SUBSURF"); sub.levels = 1
    def ev():
        dg = bpy.context.evaluated_depsgraph_get(); dg.update(); return dg
    for k in me.shape_keys.key_blocks: k.value = 0
    dg = ev(); me2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    n2 = len(me2.vertices); b0 = np.zeros(n2 * 3); me2.vertices.foreach_get("co", b0)
    out = bpy.data.objects.new(name, me2); bpy.context.scene.collection.objects.link(out)
    for g in ob.vertex_groups: out.vertex_groups.new(name=g.name)
    out.shape_key_add(name="Basis", from_mix=False); buf = np.zeros(n2 * 3)
    for nm in BODYM:
        for k in me.shape_keys.key_blocks: k.value = 1.0 if k.name == nm else 0.0
        dg = ev(); ob.evaluated_get(dg).data.vertices.foreach_get("co", buf)
        k2 = out.shape_key_add(name=nm, from_mix=False); k2.data.foreach_set("co", buf.copy()); k2.value = 0
    bpy.data.objects.remove(ob, do_unlink=True)
    # vertex color + fabric UVs from the helper groups, then drop them
    gi = {g.name: g.index for g in out.vertex_groups}
    def gv(nm):
        a = np.zeros(n2, dtype=np.float32)
        for v in me2.vertices:
            for g in v.groups:
                if g.group == gi[nm]: a[v.index] = g.weight
        return a
    hem, flut, pan, rr = gv("_hem"), gv("_flut"), gv("_panel"), gv("_r")
    c = b0.reshape(-1, 3); me2.update()
    nrm = np.zeros(n2 * 3); me2.vertices.foreach_get("normal", nrm); nrm = nrm.reshape(-1, 3)
    col = me2.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="POINT")
    back = (nrm[:, 1] > 0.15).astype(np.float32)
    rgba = np.stack([rr, hem, flut, np.round(pan * 8) / 8 if pan.max() > 0 else back / 8.0], 1)
    col.data.foreach_set("color", rgba.reshape(-1))
    uv1 = me2.uv_layers.new(name="Fabric") if len(me2.uv_layers) else None
    if uv1 is None: me2.uv_layers.new(name="UVMap"); uv1 = me2.uv_layers.new(name="Fabric")
    sleeve = pan > 0.2
    for l in me2.loops:
        i = l.vertex_index; p = c[i]
        if sleeve[i]: u, v = p[1] + 0.5, p[2] + (abs(p[0]) - 0.2) * 0.9
        else: u, v = (p[0] if nrm[i, 1] < 0.15 else -p[0] + 0.31), p[2]
        uv1.data[l.index].uv = (u, v); me2.uv_layers[0].data[l.index].uv = (u % 1.0, v % 1.0)
    for nm in ("_hem", "_flut", "_panel", "_r"): out.vertex_groups.remove(out.vertex_groups[nm])
    me2.polygons.foreach_set("use_smooth", [True] * len(me2.polygons))
    out.parent = arm; md = out.modifiers.new("Armature", "ARMATURE"); md.object = arm
    # body cover: selected vertices at least two rings inside the garment edge
    inner = sel.copy(); adj = [[] for _ in range(N)]
    for p in polys:
        for k in range(len(p)): adj[p[k]].append(p[(k + 1) % len(p)]); adj[p[(k + 1) % len(p)]].append(p[k])
    for _ in range(1 if name == 'sneakers' else 2): inner = np.array([inner[i] and all(inner[j] for j in adj[i]) for i in range(N)])
    covers[name] = inner
    print("[garment]", name, "verts", n2); return out

# ---- camp shirt: short sleeves, straight untucked hem, open camp collar (stand + fall), placket, chest pocket, buttons.
# The shell stands well off the body below the chest so it hangs like woven cloth instead of hugging the waist.
hem_z = 0.915
neck = ((z > 1.50) & (np.abs(x) < 0.062)) | (z > 1.57)
selS = (z > 0.925) & ~neck & (wHead < 0.1) & (wFore < 0.4) & (wHand < 0.05) & ~((wArm > 0.4) & (tA >= 0.60))
V_Z0 = 1.385
vhalf = lambda zz: 0.010 + (zz - V_Z0) * 0.42
vopen = (np.abs(x) < vhalf(z)) & (z > V_Z0) & (y < 0)            # open V at the chest (top button undone)
selS &= ~vopen
offS = (0.009
        + 0.034 * sm(1.30, 0.98, z) * (wTorso > 0.3)
        + 0.006 * sm(0.35, 0.6, tA) * sm(0.25, 0.55, wArm)
        + 0.006 * (y > 0)
        + 0.012 * (y > 0) * sm(1.12, 0.92, z) * (wTorso + wLeg > 0.3))
HEM_TARGET = 0.905


OPEN_FRONT = False


def shirt_extra(ob, c0, used):
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    sk = bm.verts.layers.shape
    keys = list(sk.keys())
    dl = bm.verts.layers.deform.verify()
    g_hem = ob.vertex_groups["_hem"].index
    g_flut = ob.vertex_groups["_flut"].index
    neck_g = [ob.vertex_groups[n].index for n in (PRE + "Neck", PRE + "Head") if n in ob.vertex_groups]
    sp2_g = ob.vertex_groups[PRE + "Spine2"].index if (PRE + "Spine2") in ob.vertex_groups else None

    def move(v, mv):
        v.co += mv
        for k in keys:
            v[sk[k]] = v[sk[k]] + mv

    def clone(ex, pos):
        nv = bm.verts.new(pos, ex)          # copies deform weights and shape layers
        d = pos - ex.co
        for k in keys:
            nv[sk[k]] = ex[sk[k]] + d
        return nv

    def face(vs, want):
        f = bm.faces.new(vs)
        f.normal_update()
        if f.normal.dot(want) < 0:
            f.normal_flip()
        return f

    # 0) hang: below the waist the cloth falls straight from the widest girth above instead of following the hips in
    arm_g = [ob.vertex_groups[n].index for n in (PRE + "LeftArm", PRE + "RightArm", PRE + "LeftShoulder", PRE + "RightShoulder") if n in ob.vertex_groups]

    def armw(v):
        dv = v[dl]
        return sum(dv.get(g, 0.0) for g in arm_g)

    tv = [v for v in bm.verts if v.co.z < 1.36 and abs(v.co.x) < 0.24 and armw(v) < 0.15]
    yc = float(np.mean([v.co.y for v in tv])) if tv else 0.0
    NB = 72
    rmax = np.zeros(NB)
    for v in tv:
        if 0.88 < v.co.z < 1.32:
            th = math.atan2(v.co.y - yc, v.co.x)
            b = int((th + math.pi) / (2 * math.pi) * NB) % NB
            rmax[b] = max(rmax[b], math.hypot(v.co.x, v.co.y - yc))
    for _ in range(3):
        rmax = np.maximum(rmax, (np.roll(rmax, 1) + np.roll(rmax, -1)) * 0.5 * 0.995)
    for v in tv:
        if v.co.z >= 1.30:
            continue
        th = math.atan2(v.co.y - yc, v.co.x)
        b = int((th + math.pi) / (2 * math.pi) * NB) % NB
        r = math.hypot(v.co.x, v.co.y - yc)
        want = rmax[b] * (0.99 + 0.03 * (1.30 - v.co.z) / 0.42)
        k = sm(1.30, 1.16, np.array([v.co.z]))[0]
        if r > 1e-4 and want > r:
            f = (r + (want - r) * k) / r
            move(v, Vector((v.co.x * (f - 1), (v.co.y - yc) * (f - 1), 0)))

    # 0b) cloth bridges the chest: relax the front between the armpits (hides nipples and pec edges), and the shoulder caps
    bnd0 = {v for v in bm.verts if v.is_boundary}
    reg = [v for v in bm.verts if v not in bnd0 and (1.12 < v.co.z < 1.43 and v.co.y < yc and abs(v.co.x) < 0.17)]
    bm.normal_update()
    for _ in range(14):
        newp = {}
        for v in reg:
            nb = [e.other_vert(v).co for e in v.link_edges]
            m = sum(nb, Vector((0, 0, 0))) / len(nb)
            d = (m - v.co) * 0.5
            dn = d.dot(v.normal)
            if dn < 0:
                d = d - v.normal * dn                           # never move inward (skin would show through)
            newp[v] = v.co + d
        for v, q in newp.items():
            move(v, q - v.co)

    if OPEN_FRONT:
        for v in bm.verts:
            if v.co.y < yc and abs(v.co.x) < 0.12 and v.co.z < V_Z0 + 0.06:
                k = sm(V_Z0 + 0.06, 1.15, np.array([v.co.z]))[0] * (1 - abs(v.co.x) / 0.12)
                move(v, Vector((math.copysign(0.05 * k, v.co.x), -0.008 * k, 0)))
                v[dl][g_flut] = max(v[dl].get(g_flut, 0.0), 0.65 * sm(0.13, 0.015, np.array([abs(v.co.x)]))[0] * sm(1.42, 1.05, np.array([v.co.z]))[0])
        bm.normal_update()

    # 1) straighten the hem and the V edges (the poly selection leaves them stepped)
    for v in bm.verts:
        if not v.is_boundary:
            continue
        if v.co.z < 0.95 and abs(v.co.x) < 0.30:
            move(v, Vector((0, 0, HEM_TARGET - v.co.z)))
        elif not OPEN_FRONT and v.co.y < 0 and V_Z0 - 0.02 < v.co.z < 1.50 and abs(v.co.x) < 0.10:
            want = max(0.004, vhalf(v.co.z))
            move(v, Vector((math.copysign(want, v.co.x) - v.co.x, 0, 0)))
    bm.normal_update()

    def inward(v):                          # direction into the fabric, tangent to the surface
        acc = Vector((0, 0, 0))
        for e in v.link_edges:
            o = e.other_vert(v)
            if not o.is_boundary:
                acc += o.co - v.co
        if acc.length < 1e-6:
            acc = Vector((0, 0, -1))
        n = v.normal
        acc = acc - n * acc.dot(n)
        return acc.normalized()

    bnd_edges = [e for e in bm.edges if e.is_boundary]
    ring_e = [e for e in bnd_edges if all(v.co.z > V_Z0 - 0.03 and abs(v.co.x) < 0.14 for v in e.verts)]
    hem_e = [e for e in bnd_edges if e not in ring_e]
    ring_v = {v for e in ring_e for v in e.verts}
    hem_v = {v for e in hem_e for v in e.verts}
    ring_pairs = [tuple(e.verts) for e in ring_e]
    hem_pairs = [tuple(e.verts) for e in hem_e]
    # neckline and hems come out of the poly selection stepped: relax them along their rings (keep the V point and hem height)
    ring_set, hem_set = set(ring_e), set(hem_e)
    nbr = {v: [e.other_vert(v) for e in v.link_edges if e in ring_set] for v in ring_v}
    nbr.update({v: [e.other_vert(v) for e in v.link_edges if e in hem_set] for v in hem_v})
    vpt = min(ring_v, key=lambda v: v.co.z)
    for _ in range(40):
        newp = {}
        for v in ring_v | hem_v:
            if v is vpt or len(nbr[v]) != 2:
                continue
            m = (nbr[v][0].co + nbr[v][1].co) * 0.5
            newp[v] = v.co * 0.4 + m * 0.6
        for v, q in newp.items():
            if v in hem_v and v.co.z < 0.95:
                q.z = HEM_TARGET
            move(v, q - v.co)
    bm.normal_update()
    info = {v: (v.co.copy(), v.normal.copy(), inward(v)) for v in ring_v | hem_v}
    for _ in range(30):
        sm_info = {}
        for v in ring_v | hem_v:
            if len(nbr[v]) != 2:
                continue
            p, n, d = info[v]
            n2 = (n * 2 + info[nbr[v][0]][1] + info[nbr[v][1]][1]).normalized()
            d2 = (d * 2 + info[nbr[v][0]][2] + info[nbr[v][1]][2])
            d2 = (d2 - n2 * d2.dot(n2)).normalized()
            sm_info[v] = (p, n2, d2)
        info.update(sm_info)

    # 2) camp collar: stand rises out of the neckline, folds over, the fall lies on the shirt (lapels along the V)
    rows = {}
    for v in ring_v:
        p, n, d = info[v]
        lap = sm(V_Z0 - 0.005, V_Z0 + 0.07, np.array([p.z]))[0]       # 0 at the V point, 1 at the neck
        h = 0.004 + 0.013 * lap
        w = 0.010 + 0.054 * lap
        s = p - d * h + n * 0.0008
        f = s + n * 0.0020
        c = p + d * w + n * 0.0040
        e = c + n * -0.0015 + d * -0.001
        rows[v] = [v] + [clone(v, q) for q in (s, f, c, e)]
        for k, nv in enumerate(rows[v][1:]):
            # the fall lies on the shirt: it follows the chest/back, not the neck (else it lifts off like a board
            # when the head moves forward)
            share = (0.5, 0.6, 1.0, 1.0)[k]
            moved = 0.0
            for gi in neck_g:
                w = nv[dl].get(gi, 0.0)
                if w > 0:
                    nv[dl][gi] = w * (1 - share)
                    moved += w * share
            if moved > 0 and sp2_g is not None:
                nv[dl][sp2_g] = nv[dl].get(sp2_g, 0.0) + moved
            nv[dl][g_hem] = (0.0, 0.0, 0.9, 1.0)[k]
            nv[dl][g_flut] = (0.0, 0.05, 0.3, 0.4)[k] * (0.4 + 0.6 * lap)        # collar tips and lapel edges lift in the air
    for ed in ring_e:
        a, b = ed.verts
        ra, rb = rows[a], rows[b]
        na, da = info[a][1], info[a][2]
        wants = (na, -da, na, da)
        for k in range(4):
            face([ra[k], rb[k], rb[k + 1], ra[k + 1]], wants[k])

    # 3) hem turn-back (double layer at the shirt hem and the sleeve hems, gives the edge real thickness)
    trows = {}
    for v in hem_v:
        p, n, d = info[v]
        t = p + d * 0.0015 - n * 0.0016
        u = p + d * 0.0150 - n * 0.0016
        trows[v] = [v, clone(v, t), clone(v, u)]
        for nv in trows[v][1:]:
            nv[dl][g_hem] = 1.0
    for ed in hem_e:
        a, b = ed.verts
        na, da = info[a][1], info[a][2]
        face([trows[a][0], trows[b][0], trows[b][1], trows[a][1]], -da)
        face([trows[a][1], trows[b][1], trows[b][2], trows[a][2]], -na)

    try:
        clc = bm.edges.layers.float.get("crease_edge") or bm.edges.layers.float.new("crease_edge")
        for a, b in ring_pairs:
            for k in (0, 2, 4):
                eg = bm.edges.get([rows[a][k], rows[b][k]])
                if eg:
                    eg[clc] = 1.0
        for a, b in hem_pairs:
            for k in (0, 1):
                eg = bm.edges.get([trows[a][k], trows[b][k]])
                if eg:
                    eg[clc] = 1.0
    except Exception as ex:
        print("[garment] fold crease skipped", ex)

    # 4) chest pocket on the wearer's left (+x), a separate patch laid 2.5 mm over the front
    front = [v for v in bm.verts if v.co.y < 0 and v.co.z > 1.1 and v.co.z < 1.42 and 0.02 < v.co.x < 0.22 and v not in ring_v]
    fco = np.array([v.co[:] for v in front])
    PX0, PX1, PZ0, PZ1 = 0.040, 0.142, 1.196, 1.330
    nx, nz = 7, 8
    grid = []
    for j in range(nz):
        rowv = []
        for i in range(nx):
            gx = PX0 + (PX1 - PX0) * i / (nx - 1)
            gz = PZ0 + (PZ1 - PZ0) * j / (nz - 1)
            if j == 0:                                   # slightly pointed pocket bottom
                gz -= 0.010 * (1 - abs(i / (nx - 1) * 2 - 1))
            k = int(np.argmin((fco[:, 0] - gx) ** 2 + (fco[:, 2] - gz) ** 2))
            ex = front[k]
            pos = Vector((gx, ex.co.y, gz)) + ex.normal * 0.0026
            nv = clone(ex, pos)
            edge = i in (0, nx - 1) or j in (0, nz - 1)
            nv[dl][g_hem] = 1.0 if edge else 0.0
            nv[dl][g_flut] = 0.0
            rowv.append(nv)
        grid.append(rowv)
    for j in range(nz - 1):
        for i in range(nx - 1):
            face([grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]], Vector((0, -1, 0)))
    # pocket walls: the patch edge turns down to the shirt (real thickness, a shadow line under the mouth)
    ring_ij = [(0, i) for i in range(nx)] + [(j, nx - 1) for j in range(1, nz)] + [(nz - 1, i) for i in range(nx - 2, -1, -1)] + [(j, 0) for j in range(nz - 2, 0, -1)]
    wall = {}
    for (j, i) in ring_ij:
        g = grid[j][i]
        wall[(j, i)] = clone(g, g.co - Vector((0, -1, 0)) * 0.0 + Vector((0, 0.0026, 0)))
    for a, b in zip(ring_ij, ring_ij[1:] + ring_ij[:1]):
        out = (grid[a[0]][a[1]].co + grid[b[0]][b[1]].co) * 0.5 - Vector(((PX0 + PX1) / 2, grid[a[0]][a[1]].co.y, (PZ0 + PZ1) / 2))
        out.y = 0
        try:
            face([grid[a[0]][a[1]], grid[b[0]][b[1]], wall[b], wall[a]], out)
        except ValueError:
            pass
    try:
        cl = bm.edges.layers.float.get("crease_edge") or bm.edges.layers.float.new("crease_edge")
        for e in bm.edges:
            if e.is_boundary and all(v in {q for r in grid for q in r} for v in e.verts):
                e[cl] = 0.8
    except Exception as ex:
        print("[garment] crease skipped", ex)
    for k in keys:
        pass
    bm.to_mesh(me)
    bm.free()


shirt = build("camp_shirt", selS, offS, np.zeros(N, dtype=np.float32),
              lambda u: np.maximum(sm(hem_z + 0.03, hem_z, co[u, 2]), 0.0) + sm(0.5, 0.6, tA[u]) * (wArm[u] > 0.4),
              lambda u: sm(1.02, hem_z, co[u, 2]) * 0.9 + sm(0.42, 0.6, tA[u]) * (wArm[u] > 0.4) * 0.6,
              smooth_it=16, extra=shirt_extra, r_fn=lambda u: np.clip(0.5 + tA[u], 0.001, 1.0))
# open variant (worn open over a tee): the front is cut from the neck to the hem
OPEN_FRONT = True
selO = selS & ~((np.abs(x) < 0.011) & (y < 0))
shirt_open = build("camp_shirt_open", selO, offS, np.zeros(N, dtype=np.float32),
                   lambda u: np.maximum(sm(hem_z + 0.03, hem_z, co[u, 2]), 0.0) + sm(0.5, 0.6, tA[u]) * (wArm[u] > 0.4),
                   lambda u: sm(1.02, hem_z, co[u, 2]) * 0.9 + sm(0.42, 0.6, tA[u]) * (wArm[u] > 0.4) * 0.6,
                   smooth_it=16, extra=shirt_extra, r_fn=lambda u: np.clip(0.5 + tA[u], 0.001, 1.0))
OPEN_FRONT = False


def make_buttons(shirt_ob, name, open_front):
    sc = np.array([v.co for v in shirt_ob.data.vertices])
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    for bz in np.linspace(1.335, 0.955, 5):
        if open_front:                                    # on the right front panel, 12 mm in from its edge
            cand = sc[(sc[:, 0] < 0) & (sc[:, 1] < 0) & (np.abs(sc[:, 2] - bz) < 0.012)]
            if not len(cand):
                continue
            e = cand[np.argmax(cand[:, 0])]
            near = cand[np.argmin(np.abs(cand[:, 0] - (e[0] - 0.013)) + np.abs(cand[:, 2] - bz))]
            cx = near[0]
        else:
            front = sc[(np.abs(sc[:, 0]) < 0.02) & (sc[:, 1] < 0) & (sc[:, 2] < 1.36)]
            near = front[np.argmin(np.abs(front[:, 2] - bz) + np.abs(front[:, 0]) * 2)]
            cx = 0.0
        r = bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.0056, radius2=0.0050, depth=0.0021)
        for v in r["verts"]:
            for l in v.link_loops:                        # planar UV across the face: (0.5, 0.5) = button center
                l[uvl].uv = (0.5 + v.co.x / 0.0112, 0.5 + v.co.y / 0.0112)
            v.co = Vector((v.co.x, v.co.z - 0.0016, v.co.y)) + Vector((cx, near[1] - 0.0002, bz))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    kd = [(np.argmin(((sc - np.array(v.co)) ** 2).sum(1))) for v in me.vertices]
    for g in shirt_ob.vertex_groups:
        ob.vertex_groups.new(name=g.name)
    for i, j in enumerate(kd):
        for g in shirt_ob.data.vertices[j].groups:
            ob.vertex_groups[g.group].add([i], g.weight, "REPLACE")
    ob.parent = arm
    md = ob.modifiers.new("Armature", "ARMATURE")
    md.object = arm
    return ob


btn_open = make_buttons(shirt_open, "camp_shirt_open_buttons", True)


def finish_edges(ob, c0, used, level_below=None, turn=0.018):
    # relax stepped boundary rings into clean edges and turn a hem inside (double layer gives real thickness)
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    sk = bm.verts.layers.shape
    keys = list(sk.keys())

    def move(v, mv):
        v.co += mv
        for k in keys:
            v[sk[k]] = v[sk[k]] + mv

    def clone(ex, pos):
        nv = bm.verts.new(pos, ex)
        d = pos - ex.co
        for k in keys:
            nv[sk[k]] = ex[sk[k]] + d
        return nv

    be = [e for e in bm.edges if e.is_boundary]
    bv = {v for e in be for v in e.verts}
    bs = set(be)
    nbr = {v: [e.other_vert(v) for e in v.link_edges if e in bs] for v in bv}
    levels = {}
    if level_below is not None:
        for side in (1, -1):
            ring = [v for v in bv if v.co.z < level_below and v.co.x * side > 0]
            if ring:
                levels[side] = float(np.mean([v.co.z for v in ring]))
    for _ in range(60):
        newp = {}
        for v in bv:
            if len(nbr[v]) != 2:
                continue
            q = v.co * 0.3 + (nbr[v][0].co + nbr[v][1].co) * 0.35
            if level_below is not None and v.co.z < level_below:
                q.z = q.z * 0.5 + levels.get(1 if v.co.x > 0 else -1, q.z) * 0.5
            newp[v] = q
        for v, q in newp.items():
            move(v, q - v.co)
    bm.normal_update()
    tb = {}
    for v in bv:
        acc = Vector((0, 0, 0))
        for e in v.link_edges:
            o = e.other_vert(v)
            if o not in bv:
                acc += o.co - v.co
        d = acc.normalized() if acc.length > 1e-6 else Vector((0, 0, 1))
        tb[v] = clone(v, v.co + d * turn - v.normal * 0.0025)
    for e in be:
        a, b = e.verts
        f = bm.faces.new([a, b, tb[b], tb[a]])
        f.normal_update()
        if f.normal.dot(-a.normal) < 0:
            f.normal_flip()
    bm.to_mesh(me)
    bm.free()


# ---- white crew-neck tee under the open shirt: fitted, short sleeves hidden under the shirt's, hem at the belt
neckT = (z > 1.505) | ((y < 0) & (z > 1.465) & (np.abs(x) < 0.07)) | ((y >= 0) & (z > 1.49) & (np.abs(x) < 0.07))
selT = (z > 0.93) & ~neckT & (wHead < 0.1) & (wFore < 0.4) & (wHand < 0.05) & ~((wArm > 0.4) & (tA >= 0.42))
offT = 0.004 + 0.010 * sm(1.25, 0.98, z) * (wTorso > 0.3) + 0.003 * (y > 0)
tee = build("tee", selT, offT, np.zeros(N, dtype=np.float32),
            lambda u: np.maximum(sm(0.96, 0.93, co[u, 2]), sm(1.46, 1.50, co[u, 2]) * (np.abs(co[u, 0]) < 0.09)),
            lambda u: sm(1.0, 0.93, co[u, 2]) * 0.3, smooth_it=10,
            extra=lambda ob, c0, used: finish_edges(ob, c0, used, level_below=0.99, turn=0.016))

# buttons: five pearl buttons down the placket, below the open top (the V point)
btn = make_buttons(shirt, "camp_shirt_buttons", False)

# ---- shorts: sit on the hips, end above the knee, legs stand off the thigh
selP = (z > 0.585) & (z < 1.06) & ((wLeg > 0.3) | (wTorso > 0.4)) & (wHand < 0.05) & (wFore < 0.05) & (wArm < 0.05)
offP = 0.012 + 0.016 * sm(0.80, 0.60, z) + 0.016 * sm(0.07, 0.0, np.abs(x)) * sm(1.0, 0.92, z)
def shorts_extra(ob, c0, used):
    # leg openings: relax the stepped boundary into a clean level hem, then turn a 2.5 cm hem inside (real thickness)
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    sk = bm.verts.layers.shape
    keys = list(sk.keys())

    def move(v, mv):
        v.co += mv
        for k in keys:
            v[sk[k]] = v[sk[k]] + mv

    def clone(ex, pos):
        nv = bm.verts.new(pos, ex)
        d = pos - ex.co
        for k in keys:
            nv[sk[k]] = ex[sk[k]] + d
        return nv

    hem_e = [e for e in bm.edges if e.is_boundary and all(v.co.z < 0.75 for v in e.verts)]
    hem_v = {v for e in hem_e for v in e.verts}
    hs = set(hem_e)
    nbr = {v: [e.other_vert(v) for e in v.link_edges if e in hs] for v in hem_v}
    for side in (1, -1):
        ring = [v for v in hem_v if v.co.x * side > 0]
        if not ring:
            continue
        zt = float(np.mean([v.co.z for v in ring]))
        for _ in range(30):
            newp = {}
            for v in ring:
                if len(nbr[v]) != 2:
                    continue
                m = (nbr[v][0].co + nbr[v][1].co) * 0.5
                q = v.co * 0.4 + m * 0.6
                q.z = q.z * 0.5 + zt * 0.5
                newp[v] = q
            for v, q in newp.items():
                move(v, q - v.co)
    bm.normal_update()
    tb = {}
    for v in hem_v:
        acc = Vector((0, 0, 0))
        for e in v.link_edges:
            o = e.other_vert(v)
            if o not in hem_v:
                acc += o.co - v.co
        d = acc.normalized() if acc.length > 1e-6 else Vector((0, 0, 1))
        tb[v] = clone(v, v.co + d * 0.025 - v.normal * 0.003)
    for e in hem_e:
        a, b = e.verts
        f = bm.faces.new([a, b, tb[b], tb[a]])
        f.normal_update()
        if f.normal.dot(-a.normal) < 0:
            f.normal_flip()
    bm.to_mesh(me)
    bm.free()


shorts = build("shorts", selP, offP, np.zeros(N, dtype=np.float32), lambda u: np.maximum(sm(0.615, 0.585, co[u, 2]), sm(1.035, 1.06, co[u, 2])), lambda u: sm(0.70, 0.585, co[u, 2]) * 0.5, smooth_it=6, extra=shorts_extra)
# ---- khaki cargo pants: relaxed straight leg, cargo pocket bulge on the outer thigh, hem stacks on the shoe
selC = (z > 0.045) & (z < 1.06) & ((wLeg > 0.3) | (wShin > 0.3) | (wTorso > 0.4) | (wFoot > 0.3) & (z > 0.062)) & (wHand < 0.05) & (wFore < 0.05) & (wArm < 0.05)
side_out = np.clip(vn[:, 0] * np.sign(x), 0, 1)
offC = (0.011 + 0.016 * sm(0.07, 0.0, np.abs(x)) * sm(1.0, 0.92, z)
        + 0.016 * sm(0.80, 0.55, z) + 0.026 * sm(0.50, 0.12, z) + 0.022 * sm(0.16, 0.06, z)
        + 0.024 * sm(0.45, 0.8, side_out) * sm(0.50, 0.56, z) * sm(0.74, 0.68, z))
pants = build("cargo_pants", selC, offC, np.zeros(N, dtype=np.float32),
              lambda u: np.maximum(sm(0.09, 0.062, co[u, 2]), sm(1.035, 1.06, co[u, 2])),
              lambda u: sm(0.30, 0.062, co[u, 2]) * 0.4, smooth_it=8,
              extra=lambda ob, c0, used: finish_edges(ob, c0, used, level_below=0.3, turn=0.035))

# ---- sneakers: shell over the foot, toes merged into a toe box, flat sole
selF = (z < 0.118) & (wFoot + wShin > 0.5)
offF = 0.010 + 0.006 * sm(0.03, 0.0, z) + 0.008 * sm(0.07, 0.02, z)
def sole(ob, c0, used):
    me = ob.data
    # toe box: the toes are separate tubes in the body mesh; push the front of the shell onto a smooth half-ellipsoid
    for k in me.shape_keys.key_blocks:
        a = np.zeros(len(me.vertices) * 3)
        k.data.foreach_get("co", a)
        a = a.reshape(-1, 3)
        for side in (1, -1):
            ft = (a[:, 0] * side > 0)
            if not ft.any():
                continue
            fy = a[ft, 1]
            ymin, ymax = fy.min(), fy.max()
            L = ymax - ymin
            toe = ft & (a[:, 1] < ymin + 0.36 * L)
            if toe.sum() < 10:
                continue
            c = np.array([a[toe, 0].mean(), ymin + 0.36 * L, 0.0])
            rad = np.array([max(1e-3, np.abs(a[toe, 0] - c[0]).max() * 1.08), 0.36 * L * 1.04, max(1e-3, a[toe, 2].max() * 1.12)])
            d = (a[toe] - c) / rad
            r = np.linalg.norm(d, axis=1)
            proj = c + d / np.maximum(r[:, None], 1e-6) * rad
            w = np.clip((ymin + 0.36 * L - a[toe, 1]) / (0.08 * L), 0, 1)[:, None]
            a[toe] = a[toe] * (1 - w) + proj * w
        k.data.foreach_set("co", a.reshape(-1))
    for k in me.shape_keys.key_blocks:
        a = np.zeros(len(me.vertices) * 3); k.data.foreach_get("co", a); a = a.reshape(-1, 3); low = a[:, 2] < 0.022; a[low, 2] = -0.004 + a[low, 2] * 0.2; k.data.foreach_set("co", a.reshape(-1))
    a = np.zeros(len(me.vertices) * 3); me.shape_keys.key_blocks[0].data.foreach_get("co", a); me.vertices.foreach_set("co", a)
shoes = build("sneakers", selF, offF, np.zeros(N, dtype=np.float32), lambda u: sm(0.03, 0.018, co[u, 2]), lambda u: np.zeros(len(u)), smooth_it=30, extra=sole)

np.savez_compressed(os.path.join(WORK, "garment_covers.npz"), **{k: v for k, v in covers.items()})
bpy.ops.object.select_all(action="DESELECT")
for o in (arm, shirt, btn, shorts, shoes, shirt_open, btn_open, tee, pants): o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "garments.glb"), export_format="GLB", use_selection=True, export_animations=False, export_morph=True, export_morph_normal=False,
                          export_skins=True, export_def_bones=False, export_yup=True, export_texcoords=True, export_normals=True, export_materials="NONE", export_vertex_color="ACTIVE", export_all_vertex_colors=True, export_active_vertex_color_when_no_material=True)
print("[garment] exported", os.path.getsize(os.path.join(OUT, "garments.glb")) // 1024, "KB")
