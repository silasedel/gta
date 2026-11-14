# Shared helpers for the Blender/MPFB2 character pipeline (CHARACTER track). Run inside Blender 5.2 with the MPFB2
# extension installed in BLENDER_USER_RESOURCES (see docs/v2/reports/character.md for the setup).
import importlib, os, sys, math
import bpy
import numpy as np

def svc(pkg, key):
    return getattr(importlib.import_module("bl_ext.user_default.mpfb." + pkg), key)
HumanService = svc("services.humanservice", "HumanService")
AssetService = svc("services.assetservice", "AssetService")
ObjectService = svc("services.objectservice", "ObjectService")
TargetService = svc("services.targetservice", "TargetService")

def clear_scene():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.images, bpy.data.node_groups, bpy.data.curves):
        for b in list(coll):
            if b.users == 0: coll.remove(b)

def find_asset(fname, subdir):
    p = AssetService.find_asset_absolute_path(fname, asset_subdir=subdir)
    if p is None: print("MISSING ASSET", subdir, fname)
    return p

def make_human(macro_over, details, scale=0.1):
    macro = TargetService.get_default_macro_info_dict()
    for k, v in macro_over.items(): macro[k] = v
    body = HumanService.create_human(macro_detail_dict=macro, scale=scale)
    for name, w in details.items():
        p = TargetService.target_full_path(name)
        if not p: print("MISSING TARGET", name); continue
        TargetService.load_target(body, p, weight=w, name=name)
    bpy.context.view_layer.update()
    return body

def mix_coords(obj):
    """current shape-key mix as an (N,3) float64 array in object space"""
    dg = bpy.context.evaluated_depsgraph_get()
    n = len(obj.data.vertices)
    co = np.zeros(n * 3, dtype=np.float64)
    if obj.data.shape_keys:
        kb = obj.data.shape_keys.key_blocks
        basis = np.zeros(n * 3); kb[0].data.foreach_get("co", basis)
        co[:] = basis
        tmp = np.zeros(n * 3)
        for k in kb[1:]:
            if abs(k.value) < 1e-6: continue
            k.data.foreach_get("co", tmp); co += (tmp - basis) * k.value
    else:
        obj.data.vertices.foreach_get("co", co)
    return co.reshape(n, 3)

def studio(cam_loc, cam_tgt, lens=85, res=(900, 1100), world=0.22):
    sc = bpy.context.scene
    for e in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try: sc.render.engine = e; break
        except Exception: pass
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    if not sc.world: sc.world = bpy.data.worlds.new("W")
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get("Background"); bg.inputs[0].default_value = (0.62, 0.66, 0.72, 1); bg.inputs[1].default_value = world
    for o in [o for o in bpy.data.objects if o.type in ("LIGHT", "CAMERA")]: bpy.data.objects.remove(o, do_unlink=True)
    def light(name, loc, energy, size, col=(1, 1, 1)):
        L = bpy.data.lights.new(name, "AREA"); L.energy = energy; L.size = size; L.color = col
        o = bpy.data.objects.new(name, L); sc.collection.objects.link(o); o.location = loc
        d = (np.array(cam_tgt) - np.array(loc)); from mathutils import Vector
        o.rotation_euler = Vector(d).to_track_quat("-Z", "Y").to_euler(); return o
    light("key", (1.6, -2.2, 2.6), 110, 1.2, (1, 0.96, 0.9)); light("fill", (-2.2, -1.6, 1.4), 22, 2.0, (0.85, 0.92, 1)); light("rim", (-0.8, 2.4, 2.4), 90, 1.0)
    cd = bpy.data.cameras.new("cam"); cd.lens = lens; cam = bpy.data.objects.new("cam", cd); sc.collection.objects.link(cam); sc.camera = cam
    set_cam(cam_loc, cam_tgt)
    try: sc.view_settings.view_transform = "Filmic"
    except Exception:
        try: sc.view_settings.view_transform = "AgX"
        except Exception: pass
    return cam

def set_cam(loc, tgt):
    from mathutils import Vector
    cam = bpy.context.scene.camera; cam.location = loc
    cam.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()

def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------- surface binding (proxy / garment / LOD follow)
class SurfaceBinding:
    """Binds points to the closest location on a triangle mesh (barycentric + offset in the triangle's affine frame),
    so the points follow any deformation of that mesh (morph targets, body variants)."""
    def __init__(self, src_co, src_tris, pts):
        from mathutils.bvhtree import BVHTree
        from mathutils import Vector
        src_co = np.asarray(src_co, dtype=np.float64); self.tris = np.asarray(src_tris, dtype=np.int64)
        bvh = BVHTree.FromPolygons([tuple(c) for c in src_co], [tuple(int(i) for i in t) for t in self.tris])
        M = len(pts); self.ti = np.zeros(M, dtype=np.int64); loc = np.zeros((M, 3))
        for i, p in enumerate(pts):
            l, n, idx, d = bvh.find_nearest(Vector(p))
            self.ti[i] = idx; loc[i] = l
        a, b, c = (src_co[self.tris[self.ti, k]] for k in range(3))
        e1, e2 = b - a, c - a
        # barycentric coordinates of loc
        d00 = (e1 * e1).sum(1); d01 = (e1 * e2).sum(1); d11 = (e2 * e2).sum(1)
        v2 = loc - a; d20 = (v2 * e1).sum(1); d21 = (v2 * e2).sum(1)
        den = np.maximum(d00 * d11 - d01 * d01, 1e-20)
        self.v = (d11 * d20 - d01 * d21) / den; self.w = (d00 * d21 - d01 * d20) / den
        F = self._frame(e1, e2)
        self.x = np.linalg.solve(F, (np.asarray(pts) - loc)[:, :, None])[:, :, 0]
        self.dist = np.linalg.norm(np.asarray(pts) - loc, axis=1)
    @staticmethod
    def _frame(e1, e2):
        n = np.cross(e1, e2); ln = np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-20)
        n3 = n / ln * np.sqrt(ln)
        return np.stack([e1, e2, n3], axis=2)
    def apply(self, co):
        co = np.asarray(co, dtype=np.float64)
        a, b, c = (co[self.tris[self.ti, k]] for k in range(3))
        e1, e2 = b - a, c - a
        loc = a + e1 * self.v[:, None] + e2 * self.w[:, None]
        return loc + (self._frame(e1, e2) @ self.x[:, :, None])[:, :, 0]
    def interp(self, vals):
        """barycentric interpolation of per-source-vertex values (N,K)"""
        vals = np.asarray(vals); a, b, c = (vals[self.tris[self.ti, k]] for k in range(3))
        u = 1 - self.v - self.w
        sh = (-1,) + (1,) * (vals.ndim - 1)
        return a * u.reshape(sh) + b * self.v.reshape(sh) + c * self.w.reshape(sh)

def tris_of(polys):
    """fan-triangulate a list of index tuples -> (T,3) array + source polygon index"""
    out = []; src = []
    for pi, p in enumerate(polys):
        for k in range(1, len(p) - 1): out.append((p[0], p[k], p[k + 1])); src.append(pi)
    return np.array(out, dtype=np.int64), np.array(src, dtype=np.int64)

def mesh_arrays(me):
    n = len(me.vertices); co = np.zeros(n * 3); me.vertices.foreach_get("co", co)
    polys = [tuple(p.vertices) for p in me.polygons]
    return co.reshape(n, 3), polys

def group_weights(obj, prefix=None):
    """{group name: (N,) float array} for vertex groups (optionally only names starting with prefix)"""
    n = len(obj.data.vertices); names = {g.index: g.name for g in obj.vertex_groups if prefix is None or g.name.startswith(prefix)}
    out = {nm: np.zeros(n, dtype=np.float32) for nm in names.values()}
    for v in obj.data.vertices:
        for g in v.groups:
            nm = names.get(g.group)
            if nm is not None: out[nm][v.index] = g.weight
    return out

def new_mesh_object(name, co, polys, uv_loops=None, weights=None, shapes=None, smooth=True, materials=None, poly_mat=None):
    """Mesh object from arrays. uv_loops: (L,2) per loop in polygon order; weights: {group: (N,) array}; shapes: {name: (N,3) absolute coords}."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(c) for c in co], [], [tuple(int(i) for i in p) for p in polys]); me.update()
    if uv_loops is not None:
        uvl = me.uv_layers.new(name="UVMap"); uvl.data.foreach_set("uv", np.asarray(uv_loops, dtype=np.float64).reshape(-1))
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    if smooth: me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    if weights:
        for g, w in weights.items():
            idx = np.nonzero(w > 1e-4)[0]
            if not len(idx): continue
            vg = ob.vertex_groups.new(name=g)
            for i in idx: vg.add([int(i)], float(w[i]), "REPLACE")
    if shapes:
        ob.shape_key_add(name="Basis", from_mix=False)
        for nm, sc in shapes.items():
            k = ob.shape_key_add(name=nm, from_mix=False); k.data.foreach_set("co", np.asarray(sc, dtype=np.float64).reshape(-1)); k.value = 0
    if materials:
        for m in materials: me.materials.append(m)
        if poly_mat is not None: me.polygons.foreach_set("material_index", [int(i) for i in poly_mat])
    me.update()
    return ob

def loop_uvs(me):
    uv = np.zeros(len(me.loops) * 2); me.uv_layers.active.data.foreach_get("uv", uv); return uv.reshape(-1, 2)
