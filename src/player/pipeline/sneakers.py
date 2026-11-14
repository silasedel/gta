# Port Solana V2 — Nico's low-top sneakers, modeled (CHARACTER track). Called from garments.py.
# Parametric per foot, fitted to the foot of the body mesh (outline and instep height measured from its vertices):
#   sole: cupsole with a rounded bottom edge, toe spring and a heel bevel (vertex color r = 1)
#   upper: lofted sections from heel to toe, boxy walls, a padded collar opening at the ankle, toe box
#   tongue, five crossing lace pairs (flat ribbons, a = 1) and an eyestay strip with eyelets drawn in the shader
# Vertex color: r = panel (0 quarter, 0.33 toe cap, 0.5 heel counter, 0.66 eyestay / tongue, 1 sole), g = edge band
# (collar rim), b = 0 (no flutter), a = lace. uv0 = (s heel->toe 0..1, arch 0 outer base .. 1 inner base), uv1 = meters.
import math
import numpy as np
import bpy
import bmesh
from mathutils import Vector

sm = lambda e0, e1, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - e0) / (e1 - e0), 0, 1))


def _smooth1(a, it=3):
    a = a.copy()
    for _ in range(it):
        a[1:-1] = a[1:-1] * 0.5 + (a[:-2] + a[2:]) * 0.25
    return a


def build_sneakers(arm, co, W, PRE, name="sneakers"):
    verts, faces, col, uv0, uv1, wts = [], [], [], [], [], []

    def V(p, c, u0, u1, w):
        verts.append(tuple(p))
        col.append(c)
        uv0.append(u0)
        uv1.append(u1)
        wts.append(w)
        return len(verts) - 1

    def Q(a, b, c, d):
        faces.append((a, b, c, d))

    bones = arm.data.bones
    for side, sg in (("Left", 1), ("Right", -1)):
        fh = np.array(bones[PRE + side + "Foot"].head_local)
        tt = np.array(bones[PRE + side + "ToeBase"].tail_local)
        th = np.array(bones[PRE + side + "ToeBase"].head_local)
        f = tt - fh
        f[2] = 0
        f /= np.linalg.norm(f)
        lat = np.cross([0, 0, 1], f)                       # +x for a foot pointing -y
        out = lat * sg                                      # toward the outside of this foot
        wf = W.get(PRE + side + "Foot", 0) + W.get(PRE + side + "ToeBase", 0)
        sel = (wf > 0.4) & (co[:, 2] < 0.11)
        P = co[sel]
        along = (P - fh) @ f
        acr = (P - fh) @ out
        heel, toe = along.min() - 0.010, along.max() + 0.014
        L = toe - heel
        s_of = (along - heel) / L
        NS = 40
        sb = np.linspace(0, 1, NS + 1)
        wo, wi, zt = np.zeros(NS + 1), np.zeros(NS + 1), np.zeros(NS + 1)
        for k, s in enumerate(sb):
            m = np.abs(s_of - s) < 0.04
            if m.sum() < 3:
                m = np.abs(s_of - s) < 0.08
            wo[k] = acr[m].max() if m.any() else 0.03
            wi[k] = (-acr[m]).max() if m.any() else 0.03
            zt[k] = P[m, 2].max() if m.any() else 0.06
        wo, wi, zt = _smooth1(wo, 4) + 0.007, _smooth1(wi, 4) + 0.007, _smooth1(zt, 3)
        # sneaker last, not a foot: the toe box keeps the ball-of-foot width and ends in a round toe
        kb = int(0.70 * NS)
        wo[kb:] = np.maximum(wo[kb:], wo[kb] * 0.98)
        wi[kb:] = np.maximum(wi[kb:], wi[kb] * 0.98)
        # rounded heel and toe
        def endk(s):
            x0, x1 = s * L, (1 - s) * L
            k0 = np.sqrt(np.clip(1 - (1 - np.clip(x0 / 0.034, 0, 1)) ** 2, 0, 1))
            k1 = np.sqrt(np.clip(1 - (1 - np.clip(x1 / 0.058, 0, 1)) ** 2, 0, 1))
            return np.maximum(k0 * k1, 0.06)
        # sections: dense at the ends
        NSEC = 34
        ss = (1 - np.cos(np.linspace(0, math.pi, NSEC))) / 2
        Wo = np.interp(ss, sb, wo) * endk(ss)
        Wi = np.interp(ss, sb, wi) * endk(ss)
        spring = 0.011 * sm(0.80, 1.0, ss) ** 1.5 + 0.003 * sm(0.12, 0.0, ss)
        sole_top = 0.025 - 0.005 * ss + spring
        # height above the sole: padded heel collar, high instep under the laces, a rounded toe box
        prof = 0.050 + 0.012 * sm(0.15, 0.40, ss) - 0.027 * sm(0.55, 0.86, ss) - 0.020 * sm(0.90, 1.0, ss)
        top = np.maximum(np.interp(ss, sb, zt) + 0.010, sole_top + prof)
        s_ankle = float(((fh - fh) @ f - heel) / L)
        s_throat = min(0.44, float(((th - fh) @ f - heel) / L) - 0.28)   # collar opening ends, lacing starts
        collar = 0.072 + 0.006 * sm(0.0, 0.25, ss)          # collar rim height (low-top)

        def pt(k, lat_w, z):
            return fh + f * (heel + ss[k] * L) + out * lat_w + np.array([0, 0, z - fh[2]])

        def weights(s):
            tw = float(sm(0.66, 0.80, s))
            return {PRE + side + "Foot": 1 - tw, PRE + side + "ToeBase": tw}

        def panel(s, a, h):
            if s > 0.80:
                return 0.33
            if s < 0.20 and h < 0.06:
                return 0.5
            return 0.0

        # ---- sole: rings around the outline at z levels (bottom inset, bottom, sole top), plus a capped bottom
        NO = 2 * NSEC - 2
        def outline(k_ring, inset, z_of):
            ids = []
            order = list(range(NSEC)) + list(range(NSEC - 2, 0, -1))
            for j, k in enumerate(order):
                outer = j < NSEC
                w = (Wo[k] if outer else -Wi[k])
                w = w - np.sign(w) * inset if abs(w) > inset else w * 0.5
                p = pt(k, w, z_of(k))
                ids.append(V(p, (1.0, 0.0, 0.0, 0.0), (ss[k], -0.1 - 0.05 * k_ring), (ss[k] * L, z_of(k)), weights(ss[k])))
            return ids
        r0 = outline(0, 0.0025, lambda k: spring[k] - 0.001)
        r1 = outline(1, 0.0, lambda k: spring[k] + 0.006)
        r2 = outline(2, 0.0, lambda k: sole_top[k])
        r3 = outline(3, 0.0015, lambda k: sole_top[k] + 0.0015)       # the upper is set in a hair: foxing line
        for ra, rb in ((r0, r1), (r1, r2), (r2, r3)):
            for j in range(NO):
                Q(ra[j], ra[(j + 1) % NO], rb[(j + 1) % NO], rb[j])
        # bottom cap: strips across the outline
        for k in range(NSEC - 1):
            a0 = r0[k]
            b0 = r0[k + 1]
            a1 = r0[(NO - k) % NO] if k > 0 else r0[0]
            b1 = r0[(NO - k - 1) % NO]
            if k == 0:
                faces.append((a0, b1, b0))
            elif k == NSEC - 2:
                faces.append((a0, b0, a1))
            else:
                Q(a1, b1, b0, a0)

        # ---- upper: arches from the outer base over the top to the inner base
        NA = 18
        grid = []
        for k in range(NSEC):
            row = []
            open_k = ss[k] < s_throat and top[k] > collar[k]
            for j in range(NA + 1):
                a = j / NA
                ph = a * math.pi
                c, s_ = math.cos(ph), math.sin(ph)
                w = (Wo[k] - 0.0015) * np.sign(c) * abs(c) ** 0.55 if c >= 0 else -(Wi[k] - 0.0015) * abs(c) ** 0.55
                h = sole_top[k] + 0.0015 + (top[k] - sole_top[k] - 0.0015) * s_ ** 0.6
                edge = 0.0
                if open_k and h > collar[k]:
                    h = collar[k]
                    edge = 1.0
                p = pt(k, w, h)
                pn = panel(ss[k], a, h)
                row.append(V(p, (pn, edge, 0.0, 0.0), (ss[k], a), (ss[k] * L, a * 0.24), weights(ss[k])))
            grid.append(row)
        for k in range(NSEC - 1):
            for j in range(NA):
                ok = not (ss[k] < s_throat and ss[k + 1] <= s_throat + 1e-6 and col[grid[k][j]][1] > 0.5 and col[grid[k][j + 1]][1] > 0.5
                          and col[grid[k + 1][j]][1] > 0.5 and col[grid[k + 1][j + 1]][1] > 0.5)
                if ok:
                    Q(grid[k][j], grid[k + 1][j], grid[k + 1][j + 1], grid[k][j + 1])
        # join the upper's base to the foxing ring (outer side j=0 runs along r3[0..NSEC-1], inner side j=NA along the rest)
        for k in range(NSEC - 1):
            Q(r3[k], r3[k + 1], grid[k + 1][0], grid[k][0])
            ik, ik1 = (NO - k) % NO, (NO - k - 1) % NO
            Q(grid[k][NA], grid[k + 1][NA], r3[ik1], r3[ik])

        # ---- tongue: a padded strip rising from the throat behind the laces
        kt = int(np.searchsorted(ss, s_throat))
        tongue = []
        for i, s in enumerate(np.linspace(max(0.18, s_throat - 0.30), s_throat + 0.02, 8)):
            k = min(NSEC - 1, int(np.searchsorted(ss, s)))
            zt_ = max(top[k], collar[k] + 0.012 * (1 - i / 7)) + 0.004
            rowt = []
            for j, a in enumerate((-0.022, 0.0, 0.022)):
                p = fh + f * (heel + s * L) + out * a + np.array([0, 0, zt_ - 0.003 * abs(a) / 0.022 - fh[2]])
                rowt.append(V(p, (0.66, 0.0 if i else 1.0, 0.0, 0.0), (s, 0.5 + a), (s * L, a), weights(s)))
            tongue.append(rowt)
        for i in range(len(tongue) - 1):
            for j in range(2):
                Q(tongue[i][j], tongue[i + 1][j], tongue[i + 1][j + 1], tongue[i][j + 1])

        # ---- laces: five crossing pairs of flat ribbons over the lace area
        lk = [s_throat + 0.03 + i * 0.055 for i in range(5)]
        for i, s0 in enumerate(lk):
            for dirn in (1, -1):
                sa, sb_ = s0, s0 + 0.035
                k0 = min(NSEC - 1, int(np.searchsorted(ss, sa)))
                k1 = min(NSEC - 1, int(np.searchsorted(ss, sb_)))
                za, zb = top[k0] + 0.008, top[k1] + 0.008
                pa = fh + f * (heel + sa * L) + out * (0.019 * dirn) + np.array([0, 0, za - fh[2] - 0.003])
                pb = fh + f * (heel + sb_ * L) - out * (0.019 * dirn) + np.array([0, 0, zb - fh[2] - 0.003])
                mid = (pa + pb) / 2 + np.array([0, 0, 0.0035 + (0.001 if dirn > 0 else 0)])
                d = pb - pa
                d /= np.linalg.norm(d)
                wv = np.cross(d, [0, 0, 1])
                wv = wv / np.linalg.norm(wv) * 0.0038
                ids = []
                for p in (pa, mid, pb):
                    for q in (p - wv, p + wv):
                        s = sa + (sb_ - sa) * 0.5
                        ids.append(V(q, (0.66, 0.0, 0.0, 1.0), (s, 0.5), (s * L, 0.0), weights(s)))
                Q(ids[0], ids[2], ids[3], ids[1])
                Q(ids[2], ids[4], ids[5], ids[3])

    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ca = me.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="POINT")
    ca.data.foreach_set("color", np.array(col, dtype=np.float64).reshape(-1))
    u0 = me.uv_layers.new(name="UVMap")
    u1 = me.uv_layers.new(name="Fabric")
    for l in me.loops:
        u0.data[l.index].uv = uv0[l.vertex_index]
        u1.data[l.index].uv = uv1[l.vertex_index]
    groups = {}
    for i, w in enumerate(wts):
        for g, v in w.items():
            if v <= 1e-4:
                continue
            if g not in groups:
                groups[g] = ob.vertex_groups.new(name=g)
            groups[g].add([i], float(v), "REPLACE")
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    # sharp sole edges and panel breaks stay crisp under the subdivision
    bm = bmesh.new()
    bm.from_mesh(me)
    cl = bm.edges.layers.float.get("crease_edge") or bm.edges.layers.float.new("crease_edge")
    clr = bm.verts.layers.float_color.get("Color")
    for e in bm.edges:
        a, b = e.verts
        if clr and (a[clr][0] > 0.9) != (b[clr][0] > 0.9):
            e[cl] = 0.7
        if e.is_boundary:
            e[cl] = 1.0
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    sub = ob.modifiers.new("s", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 1
    dg = bpy.context.evaluated_depsgraph_get()
    me2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    out_ob = bpy.data.objects.new(name, me2)
    bpy.context.scene.collection.objects.link(out_ob)
    for g in ob.vertex_groups:
        out_ob.vertex_groups.new(name=g.name)
    # subdivision keeps vertex groups on new_from_object? copy by nearest source vertex as a fallback
    src = np.array(verts)
    gi = {g.name: g.index for g in ob.vertex_groups}
    from mathutils.kdtree import KDTree
    kd = KDTree(len(src))
    for i, p in enumerate(src):
        kd.insert(p, i)
    kd.balance()
    for v in me2.vertices:
        if len(v.groups):
            continue
        _, i, _ = kd.find(v.co)
        for g, w in wts[i].items():
            if w > 1e-4:
                out_ob.vertex_groups[g].add([v.index], float(w), "REPLACE")
    bpy.data.objects.remove(ob, do_unlink=True)
    out_ob.parent = arm
    md = out_ob.modifiers.new("Armature", "ARMATURE")
    md.object = arm
    print("[sneakers] verts", len(me2.vertices), "tris ~", sum(len(p.vertices) - 2 for p in me2.polygons))
    return out_ob
