# Mission prop library (Nov 19): the user's downloaded model zips (unpacked into Models/_Inbox/<zip name>/) ->
# public/assets/models/mission/<id>.glb (+ <id>_lod1.glb for props over 2 m) and manifest.json, loaded by
# src/story/props.js. Output frame (glTF): meters, +Y up, x/z centered, y = 0 at the lowest point; long props
# (ships, wreck, bridge) run along Z with the bow / front toward +Z.
#   blender -b --disable-autoexec --python-exit-code 1 --python tools/v2/mission/convert_props.py -- <id ...|all>
# .blend sources open with autoexec off; nothing inside the downloads is executed. Real logos and insignia are
# removed (logo meshes dropped, hull numbers / crests / flags painted out of the textures).
import bpy
import bmesh
import json
import math
import mathutils
import os
import re
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from props_cfg import CFG  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
INBOX = os.path.join(ROOT, "Models", "_Inbox")
OUT = os.path.join(ROOT, "public", "assets", "models", "mission")
SHOTS = os.path.join(ROOT, "docs", "v2", "shots", "mission_props")
SCRATCH = os.environ.get("MISSION_SCRATCH", "/private/tmp/mission_props")


# ---------------------------------------------------------------- scene helpers


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def meshes():
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def bbox(objs):
    mn = mathutils.Vector((1e9,) * 3)
    mx = -mn
    for o in objs:
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            for i in range(3):
                mn[i] = min(mn[i], w[i])
                mx[i] = max(mx[i], w[i])
    return mn, mx


def matches(name, pats):
    return any(re.search(p, name) for p in pats)


def load(src):
    """Imports one source file into the empty scene (format by extension)."""
    low = src.lower()
    if low.endswith(".blend"):
        bpy.ops.wm.open_mainfile(filepath=src, load_ui=False)
        # a .blend saved in edit mode keeps its mesh locked; leave edit mode first
        for o in bpy.data.objects:
            if o.mode != "OBJECT" and o.name in bpy.context.view_layer.objects:
                with bpy.context.temp_override(object=o, active_object=o):
                    bpy.ops.object.mode_set(mode="OBJECT")
    elif low.endswith((".glb", ".gltf")):
        bpy.ops.import_scene.gltf(filepath=src)
    elif low.endswith(".obj"):
        bpy.ops.wm.obj_import(filepath=src)
    elif low.endswith(".dae"):
        # Blender 5 has no Collada importer: convert with assimp into the scratch folder first
        os.makedirs(SCRATCH, exist_ok=True)
        obj = os.path.join(SCRATCH, os.path.basename(src)[:-4] + ".obj")
        subprocess.run(["assimp", "export", src, obj], check=True, capture_output=True)
        bpy.ops.wm.obj_import(filepath=obj)
    else:
        bpy.ops.import_scene.fbx(filepath=src)


def bake_objects():
    """Applies modifiers, parents and transforms so every mesh is in world space with no hierarchy."""
    dg = bpy.context.evaluated_depsgraph_get()
    for o in meshes():
        me = bpy.data.meshes.new_from_object(
            o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg
        )
        mw = o.matrix_world.copy()
        o.modifiers.clear()
        o.data = me
        o.parent = None
        o.data.transform(mw)
        o.matrix_world = mathutils.Matrix.Identity(4)
    for o in [o for o in bpy.context.scene.objects if o.type != "MESH"]:
        bpy.data.objects.remove(o)
    # .blend scenes can hold objects outside the active view layer; keep only linked, visible ones
    for o in list(bpy.data.objects):
        if o.name not in bpy.context.view_layer.objects:
            bpy.data.objects.remove(o)
    for o in meshes():
        o.hide_set(False)
        o.hide_render = False


# ---------------------------------------------------------------- textures


def find_file(folder, name):
    """Finds a texture by basename anywhere under the zip folder (sources often keep absolute author paths)."""
    stem = os.path.splitext(name)[0].lower()
    hits = []
    for dirpath, _, files in os.walk(folder):
        for f in files:
            if os.path.splitext(f)[0].lower() == stem:
                hits.append(os.path.join(dirpath, f))
    hits.sort(key=lambda p: -os.path.getsize(p))
    return hits[0] if hits else None


def relink_images(folder):
    for img in bpy.data.images:
        if img.source != "FILE" or img.packed_file:
            continue
        if img.size[0] > 0:
            continue
        path = find_file(folder, os.path.basename(img.filepath.replace("\\", "/")) or img.name)
        if path:
            img.filepath = path
            img.reload()


def load_image(path):
    img = bpy.data.images.load(os.path.join(INBOX, path), check_existing=True)
    return img


def tex_node(nt, path, non_color=False):
    n = nt.nodes.new("ShaderNodeTexImage")
    n.image = load_image(path)
    if non_color:
        n.image.colorspace_settings.name = "Non-Color"
    return n


def pbr_material(name, spec):
    """Builds a Principled material from a texture set: base, normal, rough, metal, alpha (paths in the inbox)
    or flat values: color (rgb), roughness, metallic, alpha_value."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    if spec.get("base"):
        t = tex_node(nt, spec["base"])
        nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
        if spec.get("base_alpha"):
            nt.links.new(t.outputs["Alpha"], bsdf.inputs["Alpha"])
    if spec.get("color"):
        bsdf.inputs["Base Color"].default_value = list(spec["color"]) + [1]
        m.diffuse_color = list(spec["color"]) + [1]
    if spec.get("normal"):
        t = tex_node(nt, spec["normal"], True)
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(t.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if spec.get("rough"):
        t = tex_node(nt, spec["rough"], True)
        nt.links.new(t.outputs["Color"], bsdf.inputs["Roughness"])
    else:
        bsdf.inputs["Roughness"].default_value = spec.get("roughness", 0.7)
    if spec.get("metal"):
        t = tex_node(nt, spec["metal"], True)
        nt.links.new(t.outputs["Color"], bsdf.inputs["Metallic"])
    else:
        bsdf.inputs["Metallic"].default_value = spec.get("metallic", 0.0)
    if spec.get("alpha"):
        t = tex_node(nt, spec["alpha"], True)
        nt.links.new(t.outputs["Color"], bsdf.inputs["Alpha"])
    if "alpha_value" in spec:
        bsdf.inputs["Alpha"].default_value = spec["alpha_value"]
    if spec.get("alpha") or spec.get("base_alpha") or "alpha_value" in spec:
        m.blend_method = "BLEND" if "alpha_value" in spec else "CLIP"
    return m


def diffuse_only():
    """Drops every image except the base color (game-rip specular / normal sheets the exporter cannot write)."""
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        nt = m.node_tree
        for n in list(nt.nodes):
            if n.type != "TEX_IMAGE":
                continue
            feeds_color = any(l.to_socket.name == "Base Color" for out in n.outputs for l in out.links)
            if not feeds_color:
                nt.nodes.remove(n)


def assign_materials(c):
    """Replaces materials matching a regex (or all with '*') by a built PBR material."""
    for pat, spec in c.get("pbr", {}).items():
        mat = pbr_material(c["id"] + "_" + re.sub(r"\W", "", pat)[:12], spec)
        for o in meshes():
            if not o.material_slots:
                if pat == "*" or matches(o.name, [pat]):
                    o.data.materials.append(mat)
                continue
            for s in o.material_slots:
                name = s.material.name if s.material else ""
                if pat == "*" or re.search(pat, name):
                    s.material = mat


def img_np(img):
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def img_set(img, a):
    img.pixels.foreach_set(a.astype(np.float32).ravel())
    img.update()
    img.pack()


def scrub(img, rects):
    """Paints rectangles (normalized, top-left origin) with the surrounding paint: hull numbers, names, crests."""
    a = img_np(img)
    h, w = a.shape[:2]
    for x0, y0, x1, y1 in rects:
        c0, c1 = int(x0 * w), int(x1 * w)
        r0, r1 = int((1 - y1) * h), int((1 - y0) * h)
        p = 4
        ring = np.concatenate(
            [
                a[max(0, r0 - p) : r0, c0:c1].reshape(-1, 4),
                a[r1 : r1 + p, c0:c1].reshape(-1, 4),
                a[r0:r1, max(0, c0 - p) : c0].reshape(-1, 4),
                a[r0:r1, c1 : c1 + p].reshape(-1, 4),
            ]
        )
        med = np.median(ring, axis=0)
        noise = (np.random.rand(r1 - r0, c1 - c0, 1) - 0.5) * 0.015
        a[r0:r1, c0:c1, :3] = np.clip(med[None, None, :3] + noise, 0, 1)
    img_set(img, a)


def tint(img, rgb, keep=0.25):
    """Repaints a texture to one plain color, keeping its shading (the dive tank's sci-fi paint)."""
    a = img_np(img)
    lum = a[..., 0] * 0.3 + a[..., 1] * 0.59 + a[..., 2] * 0.11
    shade = np.clip(lum / max(1e-3, float(np.median(lum))), 0.35, 1.4)
    for i in range(3):
        a[..., i] = np.clip(rgb[i] * shade * (1 - keep) + a[..., i] * keep, 0, 1)
    img_set(img, a)


def cap_textures(cap):
    for img in bpy.data.images:
        if img.size[0] == 0:
            continue
        limit = cap
        if re.search(r"(?i)normal|_n\b|nrm", img.name):
            limit = min(cap, 1024)
        if max(img.size) > limit:
            f = limit / max(img.size)
            img.scale(max(1, int(img.size[0] * f)), max(1, int(img.size[1] * f)))
        try:
            if not img.packed_file:
                img.pack()
        except RuntimeError:
            pass


# ---------------------------------------------------------------- geometry


def decimate(target, planar=False, weld=1e-4, passes=3):
    """Collapses the meshes toward a triangle budget, spread by each mesh's share. With planar, flat regions are
    dissolved first (hard-surface ships keep rails and edges far better than with collapse alone)."""
    objs = meshes()
    tot = sum(tris(o) for o in objs)
    if tot <= target * 1.05:
        return
    for o in objs:
        b = bmesh.new()
        b.from_mesh(o.data)
        bmesh.ops.remove_doubles(b, verts=b.verts, dist=weld)
        b.to_mesh(o.data)
        b.free()
        if planar and tris(o) > 64:
            md = o.modifiers.new("p", "DECIMATE")
            md.decimate_type = "DISSOLVE"
            md.angle_limit = math.radians(3)
            md.delimit = {"UV"}
            apply_modifiers(o)
            tri = o.modifiers.new("t", "TRIANGULATE")
            apply_modifiers(o)
    # a few passes: small parts stop at their floor, so the big ones take the rest of the cut
    for _ in range(passes):
        tot = sum(tris(o) for o in objs)
        if tot <= target * 1.05:
            break
        for o in objs:
            n = tris(o)
            if n < 64:
                continue
            want = max(24, n * target / tot)
            if n > want * 1.1:
                md = o.modifiers.new("d", "DECIMATE")
                md.ratio = max(0.0005, want / n)
                md.use_collapse_triangulate = True
                apply_modifiers(o)


def apply_modifiers(o):
    """Bakes the modifier stack into the mesh without operators (no UI context after opening a .blend)."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    o.modifiers.clear()
    o.data = me


def transform_all(m):
    for o in meshes():
        o.data.transform(m)


def normalize(c):
    """Rotation, scale to real size, then bottom-center origin."""
    rot = c.get("rot")
    if rot:
        e = mathutils.Euler([math.radians(v) for v in rot], "XYZ")
        transform_all(e.to_matrix().to_4x4())
    mn, mx = bbox(meshes())
    if c.get("len"):
        transform_all(mathutils.Matrix.Scale(c["len"] / max(mx - mn), 4))
    elif c.get("height"):
        transform_all(mathutils.Matrix.Scale(c["height"] / (mx[2] - mn[2]), 4))
    elif c.get("scale"):
        transform_all(mathutils.Matrix.Scale(c["scale"], 4))
    mn, mx = bbox(meshes())
    off = (-(mn[0] + mx[0]) / 2, -(mn[1] + mx[1]) / 2, -mn[2] + c.get("lift", 0))
    transform_all(mathutils.Matrix.Translation(off))


def filter_objects(c):
    keep = c.get("keep")
    drop = c.get("drop", [])
    dropmat = c.get("dropmat")
    for o in meshes():
        mats = [s.material.name for s in o.material_slots if s.material]
        bad = keep and not matches(o.name, keep)
        bad = bad or matches(o.name, drop) or tris(o) == 0
        bad = bad or (dropmat and any(re.search(dropmat, n) for n in mats))
        if bad:
            bpy.data.objects.remove(o)
    if c.get("dropfaces"):
        drop_faces(c["dropfaces"])
    band = c.get("band")
    if band:
        # sources with several copies in a row: keep the objects whose centers fall in one slice of the row
        axis, lo, hi = band
        i = "xyz".index(axis)
        mn, mx = bbox(meshes())
        for o in meshes():
            a, b = bbox([o])
            t = ((a[i] + b[i]) / 2 - mn[i]) / (mx[i] - mn[i])
            if not lo <= t <= hi:
                bpy.data.objects.remove(o)
    if c.get("cut_islands"):
        cut_islands(*c["cut_islands"])
    half = c.get("half")
    if half:
        # sources with two copies side by side: keep the objects on one side of the scene center
        axis, side = half
        i = "xyz".index(axis)
        mn, mx = bbox(meshes())
        mid = (mn[i] + mx[i]) / 2
        for o in meshes():
            a, b = bbox([o])
            ctr = (a[i] + b[i]) / 2
            if (ctr < mid) != (side == "<"):
                bpy.data.objects.remove(o)


def drop_faces(pat):
    """Deletes the faces whose material name matches (parts baked into one mesh with the hull)."""
    for o in meshes():
        bad = {i for i, s in enumerate(o.material_slots) if s.material and re.search(pat, s.material.name)}
        if not bad:
            continue
        b = bmesh.new()
        b.from_mesh(o.data)
        bmesh.ops.delete(b, geom=[f for f in b.faces if f.material_index in bad], context="FACES")
        b.to_mesh(o.data)
        b.free()
        if not o.data.polygons:
            bpy.data.objects.remove(o)


def islands(b):
    """Loose parts of a bmesh as vertex lists."""
    b.verts.ensure_lookup_table()
    seen = set()
    out = []
    for v0 in b.verts:
        if v0.index in seen:
            continue
        island = [v0]
        seen.add(v0.index)
        k = 0
        while k < len(island):
            for e in island[k].link_edges:
                w = e.other_vert(island[k])
                if w.index not in seen:
                    seen.add(w.index)
                    island.append(w)
            k += 1
        out.append(island)
    return out


def drop_thin(limit):
    """Deletes rod-like loose parts (rail posts and bars, wires) thinner than limit in two axes: decimation turns
    them into floating shards, and at prop distance a ship reads fine without them."""
    for o in meshes():
        b = bmesh.new()
        b.from_mesh(o.data)
        doomed = []
        for island in islands(b):
            ext = sorted(max(v.co[i] for v in island) - min(v.co[i] for v in island) for i in range(3))
            if ext[1] < limit:
                doomed += island
        bmesh.ops.delete(b, geom=doomed, context="VERTS")
        b.to_mesh(o.data)
        b.free()


def cut_islands(axis, lo, hi):
    """Deletes loose mesh pieces whose centers fall outside a slice of the scene (stray bills next to a stack)."""
    i = "xyz".index(axis)
    mn, mx = bbox(meshes())
    for o in meshes():
        b = bmesh.new()
        b.from_mesh(o.data)
        b.verts.ensure_lookup_table()
        seen = set()
        doomed = []
        for v0 in b.verts:
            if v0.index in seen:
                continue
            island = [v0]
            seen.add(v0.index)
            k = 0
            while k < len(island):
                for e in island[k].link_edges:
                    w = e.other_vert(island[k])
                    if w.index not in seen:
                        seen.add(w.index)
                        island.append(w)
                k += 1
            ctr = sum((v.co[i] for v in island)) / len(island)
            t = (ctr - mn[i]) / (mx[i] - mn[i])
            if not lo <= t <= hi:
                doomed += island
        bmesh.ops.delete(b, geom=doomed, context="VERTS")
        b.to_mesh(o.data)
        b.free()


def join_all(name):
    objs = meshes()
    with bpy.context.temp_override(active_object=objs[0], object=objs[0], selected_objects=objs, selected_editable_objects=objs):
        if len(objs) > 1:
            bpy.ops.object.join()
    o = objs[0]
    o.name = name
    return o


# ---------------------------------------------------------------- generated props


def apply_scale(o):
    o.data.transform(mathutils.Matrix.Diagonal(list(o.scale) + [1]))
    o.scale = (1, 1, 1)


def gen_package():
    """The waterproof drug package: four bricks shrink-wrapped in black plastic, crossed with tan tape."""
    wrap = pbr_material("package_wrap", {"color": (0.025, 0.03, 0.03), "roughness": 0.35})
    tape = pbr_material("package_tape", {"color": (0.62, 0.52, 0.33), "roughness": 0.6})
    w, d, h = 0.46, 0.32, 0.2
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, h / 2))
    body = bpy.context.active_object
    body.scale = (w, d, h)
    apply_scale(body)
    bev = body.modifiers.new("b", "BEVEL")
    bev.width = 0.035
    bev.segments = 3
    sub = body.modifiers.new("s", "SIMPLE_DEFORM")
    sub.deform_method = "BEND"
    sub.angle = math.radians(4)
    body.data.materials.append(wrap)
    apply_modifiers(body)
    bands = [(w + 0.012, 0.06, h + 0.012, 0, -0.08), (w + 0.012, 0.06, h + 0.012, 0, 0.08)]
    bands += [(0.06, d + 0.012, h + 0.012, -0.12, 0), (0.06, d + 0.012, h + 0.012, 0.12, 0)]
    for bx, by, bz, x, y in bands:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, h / 2))
        t = bpy.context.active_object
        t.scale = (bx, by, bz)
        apply_scale(t)
        bv = t.modifiers.new("b", "BEVEL")
        bv.width = 0.03
        bv.segments = 2
        t.data.materials.append(tape)
        apply_modifiers(t)


def gen_dive_tank():
    """A plain aluminium scuba cylinder with a valve: the sci-fi tank download reads as a prop gun canister."""
    paint = pbr_material("tank_paint", {"color": (0.85, 0.62, 0.05), "roughness": 0.35})
    chrome = pbr_material("tank_valve", {"color": (0.75, 0.75, 0.76), "metallic": 1, "roughness": 0.25})
    black = pbr_material("tank_boot", {"color": (0.03, 0.03, 0.03), "roughness": 0.8})
    r, body_h = 0.092, 0.56
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=r, depth=body_h, location=(0, 0, body_h / 2 + 0.03))
    c = bpy.context.active_object
    c.data.materials.append(paint)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=12, radius=r, location=(0, 0, body_h + 0.03))
    s = bpy.context.active_object
    s.scale = (1, 1, 0.75)
    apply_scale(s)
    bm = bmesh.new()
    bm.from_mesh(s.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-4], context="VERTS")
    bm.to_mesh(s.data)
    bm.free()
    s.data.materials.append(paint)
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=r + 0.006, depth=0.1, location=(0, 0, 0.05))
    bpy.context.active_object.data.materials.append(black)
    top = body_h + 0.03 + r * 0.75
    parts = [(0.02, 0.05, (0, 0, top + 0.02), (0, 0, 0)), (0.026, 0.05, (0, 0, top + 0.06), (math.pi / 2, 0, 0))]
    parts += [(0.012, 0.05, (0.04, 0, top + 0.06), (0, math.pi / 2, 0))]
    for rad, depth, loc, rot in parts:
        bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=rad, depth=depth, location=loc, rotation=rot)
        bpy.context.active_object.data.materials.append(chrome)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.03, minor_radius=0.006, location=(0, -0.045, top + 0.06), rotation=(math.pi / 2, 0, 0))
    bpy.context.active_object.data.materials.append(black)


def bill_box(mat, band, loc, yaw):
    """One banded bundle of bills: a box whose top / bottom show the bill image and whose sides show paper edge."""
    w, d, h = 0.156, 0.066, 0.011
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=(0, 0, yaw))
    o = bpy.context.active_object
    o.scale = (w, d, h)
    apply_scale(o)
    o.data.materials.append(mat)
    uv = o.data.uv_layers.active.data
    for poly in o.data.polygons:
        for li in poly.loop_indices:
            co = o.data.vertices[o.data.loops[li].vertex_index].co
            if abs(poly.normal.z) > 0.5:
                # the source image is mirrored: flip U on the top face
                u = 0.5 - co.x / w if poly.normal.z > 0 else 0.5 + co.x / w
                uv[li].uv = (u, 0.5 + co.y / d)
            else:
                # sides: a sliver of the pale bill border reads as stacked paper edges
                uv[li].uv = (0.02 + 0.01 * (co.x / w + co.y / d), 0.5 + co.z / h * 0.9)
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=(0, 0, yaw))
    b = bpy.context.active_object
    b.scale = (0.032, d + 0.002, h + 0.002)
    apply_scale(b)
    b.data.materials.append(band)


def gen_cash_stack():
    """Banded 20 dollar bundles (the download's stack is thousands of loose quads): 2 x 2 bundles, 3 layers."""
    mat = pbr_material("bill20", {"base": "money-stacks-20-usd/textures/gltf_embedded_0.png", "roughness": 0.85})
    band = pbr_material("bill_band", {"color": (0.82, 0.78, 0.66), "roughness": 0.8})
    for layer in range(3):
        for ix in (-1, 1):
            for iy in (-1, 1):
                if layer == 2 and ix == 1 and iy == 1:
                    continue
                jitter = ((ix + 2 * iy + layer * 3) % 5 - 2) * 0.02
                loc = (ix * 0.081, iy * 0.036, 0.0055 + layer * 0.0115)
                bill_box(mat, band, loc, jitter)


GENERATORS = {"package": gen_package, "dive_tank": gen_dive_tank, "cash_stack": gen_cash_stack}


# ---------------------------------------------------------------- export and thumbnails


def export(path):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_image_format="WEBP",
        export_image_quality=82,
        export_yup=True,
        export_apply=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_materials="EXPORT",
    )


def thumbnail(path):
    """Workbench render (textures, studio light) from a 3/4 view framing the bounding box."""
    sc = bpy.context.scene
    mn, mx = bbox(meshes())
    ctr = (mn + mx) / 2
    rad = max((mx - mn).length / 2, 0.01)
    cam_data = bpy.data.cameras.new("thumb")
    cam_data.lens = 50
    cam_data.clip_start = rad * 0.01
    cam_data.clip_end = rad * 50
    cam = bpy.data.objects.new("thumb", cam_data)
    sc.collection.objects.link(cam)
    d = mathutils.Vector([float(v) for v in os.environ.get("THUMB_DIR", "1,-1.25,0.8").split(",")]).normalized()
    cam.location = ctr + d * rad * 2.7
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "TEXTURE"
    sc.display.shading.show_cavity = True
    sc.render.resolution_x = sc.render.resolution_y = 480
    sc.render.image_settings.file_format = "PNG"
    sc.render.filepath = path
    sc.world = bpy.data.worlds.new("thumb")
    sc.world.color = (0.05, 0.05, 0.05)
    sc.display.shading.background_type = "WORLD"
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)


def size_gltf():
    mn, mx = bbox(meshes())
    return [round(mx[0] - mn[0], 3), round(mx[2] - mn[2], 3), round(mx[1] - mn[1], 3)]


def convert(key, c):
    c = dict(c, id=key)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if c.get("gen"):
        GENERATORS[c["gen"]]()
    else:
        src = c["src"] if os.path.isabs(c["src"]) else os.path.join(INBOX, c["src"])
        load(src)
        relink_images(os.path.join(INBOX, c["src"].split("/")[0]))
    bake_objects()
    filter_objects(c)
    if c.get("diffuse_only"):
        diffuse_only()
    assign_materials(c)
    normalize(c)
    if c.get("drop_thin"):
        drop_thin(c["drop_thin"])
    if c.get("tris") and not os.environ.get("MISSION_RAW"):
        decimate(c["tris"], c.get("planar", False), c.get("weld", 1e-4), c.get("passes", 3))
    for img in list(bpy.data.images):
        if img.size[0] == 0:
            continue
        for pat, rects in c.get("scrub", {}).items():
            if re.search(pat, img.name) or re.search(pat, img.filepath):
                scrub(img, rects)
                print("SCRUB", key, img.name, len(rects))
        if c.get("tint") and re.search(c["tint"][0], img.name):
            tint(img, c["tint"][1])
    cap_textures(c.get("tex", 1024))
    os.makedirs(OUT, exist_ok=True)
    body = join_all(key)
    entry = {
        "id": key,
        "file": key + ".glb",
        "size": size_gltf(),
        "tris": tris(body),
        "description": c["desc"],
        "use": c["use"],
    }
    export(os.path.join(OUT, key + ".glb"))
    os.makedirs(SHOTS, exist_ok=True)
    thumbnail(os.path.join(SHOTS, key + ".png"))
    if max(entry["size"]) > 2.0:
        # far LOD: one decimated mesh with 256 px textures
        target = c.get("lod1", max(300, entry["tris"] // 8))
        n = tris(body)
        if n > target:
            md = body.modifiers.new("d", "DECIMATE")
            md.ratio = max(0.002, target / n)
            apply_modifiers(body)
        for img in bpy.data.images:
            if img.size[0] > 256 or img.size[1] > 256:
                f = 256 / max(img.size)
                img.scale(max(1, int(img.size[0] * f)), max(1, int(img.size[1] * f)))
        export(os.path.join(OUT, key + "_lod1.glb"))
        entry["lod1"] = {"file": key + "_lod1.glb", "tris": tris(body), "distance": c.get("lod_dist", 60)}
    entry["bytes"] = os.path.getsize(os.path.join(OUT, key + ".glb"))
    if c.get("placement"):
        entry["placement"] = c["placement"]
    print("CONVERTED", json.dumps(entry))
    return entry


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else ["all"]
    keys = list(CFG) if args[0] == "all" else args
    path = os.path.join(OUT, "manifest.json")
    manifest = json.load(open(path)) if os.path.exists(path) else {"props": {}}
    for key in keys:
        manifest["props"][key] = convert(key, CFG[key])
    order = {k: i for i, k in enumerate(CFG)}
    manifest["props"] = dict(sorted(manifest["props"].items(), key=lambda kv: order.get(kv[0], 999)))
    manifest["note"] = "Built by tools/v2/mission/convert_props.py; load through src/story/props.js."
    with open(path, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")


main()
