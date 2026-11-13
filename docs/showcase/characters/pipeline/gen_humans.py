# Headless MPFB2 human generator for Port Solana (CHARACTER agent).
# blender -b -P gen_humans.py -- spec.json outdir
# Each spec entry: {id, macro:{...}, skin, hair|null, eyebrows, clothes:[...mhclo], shells:[{type,color?}], lods:true}
import importlib, sys, os, json, math
import bpy, bmesh
from mathutils import Vector

def svc(pkg, key):
    return getattr(importlib.import_module("bl_ext.user_default.mpfb." + pkg), key)

HumanService = svc("services.humanservice", "HumanService")
AssetService = svc("services.assetservice", "AssetService")
ExportService = svc("services.exportservice", "ExportService")
ObjectService = svc("services.objectservice", "ObjectService")
TargetService = svc("services.targetservice", "TargetService")

argv = sys.argv[sys.argv.index("--") + 1:]
spec_path, outdir = argv[0], argv[1]
only = argv[2].split(",") if len(argv) > 2 and argv[2] else None
specs = json.load(open(spec_path))
os.makedirs(outdir, exist_ok=True)


def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.images, bpy.data.node_groups):
        for b in list(coll):
            if b.users == 0:
                coll.remove(b)


def find_asset(fname, subdir):
    p = AssetService.find_asset_absolute_path(fname, asset_subdir=subdir)
    if p is None:
        print("MISSING ASSET", subdir, fname)
    return p


def bone_world(arm, name):
    b = arm.data.bones.get("mixamorig:" + name) or arm.data.bones.get(name)
    if not b:
        return None
    return arm.matrix_world @ b.head_local


def group_weights(obj):
    names = {g.index: g.name.replace("mixamorig:", "") for g in obj.vertex_groups}
    out = []
    for v in obj.data.vertices:
        d = {}
        for g in v.groups:
            n = names.get(g.group)
            if n:
                d[n] = d.get(n, 0) + g.weight
        out.append(d)
    return out


def wsum(d, keys):
    return sum(d.get(k, 0.0) for k in keys)


DEBUG = os.environ.get('GDEBUG') == '1'
ARM_L = ("LeftForeArm", "LeftHand", "RightForeArm", "RightHand")
HANDS = tuple(k for k in [] )


def make_shell(body, arm, kind, mat_name, P):
    """Duplicate a region of the body as a fitted garment shell with straight, plane-cut hems."""
    mw = body.matrix_world
    mwi = mw.inverted()
    W = group_weights(body)
    co = [mw @ v.co for v in body.data.vertices]
    hipZ, neckZ, kneeZ, crotchZ, bustZ = P["hipZ"], P["neckZ"], P["kneeZ"], P["crotchZ"], P["bustZ"]
    sh = P["shoulders"]
    long_leg = kind in ("shorts", "boardshorts", "skirt")
    # cut planes (world): list of (point, normal) where normal points to the KEPT side
    Z = Vector((0, 0, 1))
    planes, arm_planes = [], []
    if kind in ("tee", "tank", "polo"):
        shZ = (sh[0][0].z + sh[1][0].z) * 0.5
        planes = [(Vector((0, 0, hipZ - 0.045)), Z), (Vector((0, 0, shZ + (0.05 if kind == "tank" else 0.06 if kind == "tee" else 0.075))), -Z)]
        for a, f in sh:
            ax = (f - a); L = ax.length; ax.normalize()
            arm_planes.append((a + ax * L * (0.42 if kind == "tee" else 0.48 if kind == "polo" else -0.07), -ax))
    elif kind in ("shorts", "boardshorts", "skirt"):
        planes = [(Vector((0, 0, hipZ + 0.07)), -Z), (Vector((0, 0, kneeZ + (0.15 if kind == "shorts" else 0.07))), Z)]
    elif kind == "trunks":
        planes = [(Vector((0, 0, hipZ + 0.025)), -Z), (Vector((0, 0, crotchZ - 0.075)), Z)]
    elif kind == "briefs":
        planes = [(Vector((0, 0, hipZ - 0.015)), -Z), (Vector((0, 0, crotchZ - 0.03)), Z)]
    elif kind == "bikini_top":
        planes = [(Vector((0, 0, bustZ - 0.065)), Z), (Vector((0, 0, bustZ + 0.05)), -Z)]
    if DEBUG: print("DBGP", kind, {k: (round(v, 3) if isinstance(v, float) else None) for k, v in P.items()}, [(round(p.z, 3), tuple(round(x, 2) for x in n)) for p, n in planes])
    zlo = min(p.z for p, n in planes if n.z > 0) if any(n.z > 0 for p, n in planes) else -9
    zhi = max(p.z for p, n in planes if n.z < 0) if any(n.z < 0 for p, n in planes) else 9

    def region(i, margin):
        w = W[i]; p = co[i]
        armw = wsum(w, ("LeftArm", "RightArm"))
        forew = wsum(w, ARM_L) + sum(v for k, v in w.items() if "Hand" in k)
        headw = wsum(w, ("Neck", "Head"))
        legw = wsum(w, ("LeftLeg", "RightLeg", "LeftFoot", "RightFoot"))
        if p.z < zlo - margin or p.z > zhi + margin:
            return False
        if kind in ("tee", "polo"):
            return forew < 0.25 and headw < 0.6
        if kind == "tank":
            return forew < 0.05 and headw < 0.5
        if kind in ("shorts", "boardshorts", "skirt", "trunks", "briefs"):
            return armw + forew < 0.05 and legw < (0.6 if long_leg else 0.15)
        if kind == "bikini_top":
            return armw + forew < 0.1 and headw < 0.1
        return False

    inc = [region(i, 0.03) for i in range(len(co))]
    inner_ok = [region(i, -0.02) for i in range(len(co))]
    shell = body.copy(); shell.data = body.data.copy()
    shell.name = body.name.replace("_export", "") + "_" + kind
    bpy.context.collection.objects.link(shell)
    bm = bmesh.new(); bm.from_mesh(shell.data)
    bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    keepf = set(f.index for f in bm.faces if any(inc[v.index] for v in f.verts) and sum(inc[v.index] for v in f.verts) >= 2)
    if len(keepf) < 20:
        bm.free(); bpy.data.objects.remove(shell, do_unlink=True); print("SHELL EMPTY", kind); return None
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keepf], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    loc = lambda p: mwi @ p
    nrm_l = lambda n: (mwi.to_3x3() @ n).normalized()

    def cut(geom_faces, pco, pno):
        lp, ln = loc(pco), nrm_l(pno)
        verts = list({v for f in geom_faces for v in f.verts}); edges = list({e for f in geom_faces for e in f.edges})
        bmesh.ops.bisect_plane(bm, geom=verts + edges + list(geom_faces), plane_co=lp, plane_no=ln, clear_inner=True, dist=1e-5)
    for pco, pno in planes:
        cut(list(bm.faces), pco, pno)
    # sleeve cuts only on arm geometry
    if arm_planes:
        dl = bm.verts.layers.deform.active
        gidx = {g.name.replace("mixamorig:", ""): g.index for g in shell.vertex_groups}
        armg = [gidx.get(n) for n in ("LeftArm", "RightArm", "LeftForeArm", "RightForeArm") if gidx.get(n) is not None]
        for side, (pco, pno) in enumerate(arm_planes):
            sideg = [gidx.get(("LeftArm", "RightArm")[side]), gidx.get(("LeftForeArm", "RightForeArm")[side])]
            sideg = [g for g in sideg if g is not None]
            fs = [f for f in bm.faces if dl and sum(f.verts[0][dl].get(g, 0) for g in sideg) + sum(v[dl].get(g, 0) for v in f.verts for g in sideg) / len(f.verts) > (0.15 if kind == "tank" else 0.35)]
            if fs:
                cut(fs, pco, pno)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.normal_update()
    off = {"tee": 0.0045, "tank": 0.004, "polo": 0.005, "shorts": 0.010, "boardshorts": 0.013, "trunks": 0.005, "briefs": 0.0025, "bikini_top": 0.003, "skirt": 0.012}[kind]
    for v in bm.verts:
        o = off
        if kind in ("shorts", "boardshorts"):
            zz = (mw @ v.co).z
            t = max(0.0, min(1.0, (hipZ - zz) / max(0.05, hipZ - kneeZ)))
            o = off + 0.018 * t * t
        v.co = v.co + v.normal * o
    bm.to_mesh(shell.data); bm.free()
    if DEBUG:
        zz = [(shell.matrix_world @ v.co).z for v in shell.data.vertices]
        print("DBGS", kind, "verts", len(zz), "zmin", round(min(zz), 3), "zmax", round(max(zz), 3), "mw scale", tuple(round(x, 3) for x in shell.matrix_world.to_scale()))
    shell.data.materials.clear()
    m = bpy.data.materials.new(mat_name); m.use_nodes = True
    shell.data.materials.append(m)
    for poly in shell.data.polygons:
        poly.material_index = 0
    # remove body faces fully hidden under the garment
    if kind not in ("bikini_top", "briefs", "trunks"):
        bb = bmesh.new(); bb.from_mesh(body.data); bb.faces.ensure_lookup_table()
        def inside(p):
            return all((p - pc).dot(pn) > 0.018 for pc, pn in planes) and all((p - pc).dot(pn) > 0.02 for pc, pn in arm_planes if (p - pc).length < 0.25)
        hid = [f for f in bb.faces if all(inner_ok[v.index] and inside(mw @ v.co) for v in f.verts)]
        if kind in ("tee", "polo", "tank"):
            hid = [f for f in hid if all(wsum(W[v.index], ("LeftArm", "RightArm")) < 0.3 for v in f.verts)]
        bmesh.ops.delete(bb, geom=hid, context="FACES")
        bmesh.ops.delete(bb, geom=[v for v in bb.verts if not v.link_faces], context="VERTS")
        bb.to_mesh(body.data); bb.free()
    return shell


def mat_textures(m):
    info = {"name": m.name}
    if not m.use_nodes:
        return info
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf:
        try:
            info["roughness"] = float(bsdf.inputs["Roughness"].default_value)
        except Exception:
            pass

    def src_image(sock, depth=0):
        if not sock.is_linked or depth > 4:
            return None
        n = sock.links[0].from_node
        if n.type == "TEX_IMAGE" and n.image:
            return bpy.path.abspath(n.image.filepath) or n.image.name
        for i in n.inputs:
            r = src_image(i, depth + 1)
            if r:
                return r
        return None
    if bsdf:
        info["diffuse"] = src_image(bsdf.inputs["Base Color"])
        info["normal"] = src_image(bsdf.inputs["Normal"])
        a = bsdf.inputs.get("Alpha")
        if a is not None and a.is_linked:
            info["alpha"] = True
    return info


def build(spec, export=True):
    clear_scene()
    macro = TargetService.get_default_macro_info_dict()
    for k, v in spec["macro"].items():
        macro[k] = v
    body = HumanService.create_human(macro_detail_dict=macro, scale=0.1)
    sp = find_asset(spec["skin"] + ".mhmat", "skins")
    if sp:
        HumanService.set_character_skin(sp, body, skin_type="GAMEENGINE")
    HumanService.add_builtin_rig(body, "mixamo")
    assets = [("eyes", "low-poly.mhclo", "Eyes"), ("eyebrows", spec.get("eyebrows", "eyebrow001") + ".mhclo", "Eyebrows"),
              ("eyelashes", spec.get("eyelashes", "eyelashes01") + ".mhclo", "Eyelashes")]
    if spec.get("hair"):
        assets.append(("hair", spec["hair"] + ".mhclo", "Hair"))
    for c in spec.get("clothes", []):
        assets.append(("clothes", c + ".mhclo", "Clothes"))
    for sub, fn, at in assets:
        p = find_asset(fn, sub)
        if p:
            HumanService.add_mhclo_asset(p, body, asset_type=at, material_type="GAMEENGINE")
    root = ExportService.create_character_copy(body, name_suffix="_export")
    eb = ObjectService.find_object_of_type_amongst_nearest_relatives(root, "Basemesh")
    ExportService.bake_modifiers_remove_helpers(eb, bake_masks=True, bake_subdiv=True, remove_helpers=True, also_proxy=True)
    arm = root if root.type == "ARMATURE" else next((o for o in bpy.data.objects if o.type == "ARMATURE" and o.name.endswith("_export")), None)
    # bake the phenotype shape keys into the body BEFORE building garment shells (shells must use final vertex positions)
    for o in [x for x in bpy.data.objects if x.type == "MESH" and x.data.shape_keys]:
        bpy.ops.object.select_all(action="DESELECT")
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    bpy.context.view_layer.update()
    P = {}
    hz = lambda n: (bone_world(arm, n) or Vector((0, 0, 0)))
    P["hipZ"] = hz("Hips").z
    P["spineZ"] = hz("Spine1").z
    P["chestZ"] = (hz("Spine2").z + hz("Spine1").z) * 0.5 + 0.02
    P["neckZ"] = hz("Neck").z
    P["kneeZ"] = (hz("LeftLeg").z + hz("RightLeg").z) * 0.5
    P["crotchZ"] = (hz("LeftUpLeg").z + hz("RightUpLeg").z) * 0.5 - 0.05
    P["shoulders"] = [(hz("LeftArm"), hz("LeftForeArm")), (hz("RightArm"), hz("RightForeArm"))]
    # bust height: most forward (-Y) torso point between Spine1 and the neck
    bw = eb.matrix_world
    best = None
    for v in eb.data.vertices:
        p = bw @ v.co
        if P["spineZ"] - 0.05 < p.z < P["neckZ"] - 0.08 and abs(p.x) < 0.2:
            if best is None or p.y < best.y:
                best = p
    P["bustZ"] = best.z if best is not None else P["chestZ"]
    shells = []
    for s in spec.get("shells", []):
        sh = make_shell(eb, arm, s["type"], "garment_" + s["type"], P)
        if sh:
            shells.append(sh)
    # collect export objects
    objs = [arm] + [o for o in bpy.data.objects if o.type == "MESH" and (o.parent == arm or o.name.endswith("_export") or o in shells)]
    objs = [o for o in objs if o is not None]
    meshes = [o for o in objs if o.type == "MESH"]
    # make sure shells are parented to the armature and use it
    for sh in shells:
        sh.parent = arm
        sh.matrix_parent_inverse = eb.matrix_parent_inverse.copy()
    if not export:
        return arm, [o for o in bpy.data.objects if o.type == "MESH" and (o.parent == arm or o in shells)]
    # bake shape keys (MPFB proxies/eyes may carry some)
    for o in meshes:
        if o.data.shape_keys:
            bpy.ops.object.select_all(action="DESELECT")
            bpy.context.view_layer.objects.active = o
            o.select_set(True)
            bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    # LODs
    lod_objs = []
    if spec.get("lods", True):
        for lvl, ratio in ((1, 0.32), (2, 0.1)):
            for o in meshes:
                n = o.name.lower()
                if any(k in n for k in ("eye", "lash", "brow", "low-poly")):
                    continue
                c = o.copy()
                c.data = o.data.copy()
                c.name = o.name + "__LOD%d" % lvl
                bpy.context.collection.objects.link(c)
                d = c.modifiers.new("dec", "DECIMATE")
                d.ratio = ratio if "hair" not in n and "short" not in n else max(ratio, 0.25)
                d.use_collapse_triangulate = True
                # put decimate before armature
                bpy.context.view_layer.objects.active = c
                while c.modifiers.find("dec") > 0:
                    bpy.ops.object.modifier_move_up(modifier="dec")
                bpy.ops.object.modifier_apply(modifier="dec")
                lod_objs.append(c)
    # sidecar materials
    mats = {}
    for o in meshes + lod_objs:
        for m in o.data.materials:
            if m and m.name not in mats:
                mats[m.name] = mat_textures(m)
    # height
    zs = [(o.matrix_world @ v.co).z for o in meshes for v in o.data.vertices]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs + lod_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    out = os.path.join(outdir, spec["id"] + ".glb")
    bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_format="GLB", export_animations=False, export_morph=False,
                              export_apply=True, export_yup=True, export_image_format="NONE", export_skins=True, export_influence_nb=4,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                              export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12,
                              export_draco_generic_quantization=12, export_tangents=False)
    meta = {"id": spec["id"], "file": spec["id"] + ".glb", "materials": mats, "height": max(zs) - min(zs), "spec": spec}
    json.dump(meta, open(os.path.join(outdir, spec["id"] + ".json"), "w"), indent=1)
    print("WROTE", out, os.path.getsize(out), "h=%.2f" % meta["height"])


for s in ([] if os.environ.get("GEN_IMPORT_ONLY") else specs):
    if only and s["id"] not in only:
        continue
    try:
        build(s)
    except Exception as e:
        import traceback
        traceback.print_exc()
        print("FAILED", s["id"], e)
