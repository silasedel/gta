# Nico's house r11 (playtest Nov 19: "the plants look terrible"): the user's plant downloads -> game GLBs.
#
#   blender -b -Y --python-exit-code 1 --python tools/v2/keys/r11/plants11.py -- \
#       Models/_Inbox public/assets/models/keys/plants <asset>
#
# Each asset: import, keep the wanted meshes, apply transforms, fix the up axis, decimate to a budget, rebuild
# the materials from the shipped textures (1K color, 512 normal, leaves alpha-tested = glTF MASK, double sided),
# put the base at y = 0 centered on the pot, export a GLB with WEBP textures.
# The downloads are data only: the .blend sources are opened with scripts disabled (-Y).
import bpy
import math
import os
import sys

import mathutils
import numpy as np

ARGS = sys.argv[sys.argv.index("--") + 1 :]
INBOX, OUTDIR, ASSET = ARGS[0], ARGS[1], ARGS[2]

COLOR_SIZE = 1024
NORMAL_SIZE = 512

# mats: imported material name -> spec. spec keys:
#   color, alpha ('self' = the color's own alpha, or a grayscale file merged in), normal, rough (constant)
#   keep: keep the imported material as it is (only its images get resized)
ASSETS = {
    "snake_pot": {
        "src": "snake-plant-in-pot/source/Sansevieria in pot.usdz",
        "tris": {"*": 9000},
        "keep_imported": True,
    },
    "monstera_pot": {
        "src": "monstera-b02/source/MZRa_Monstera_B02.fbx",
        "tex": "monstera-b02/textures",
        "mats": {
            "MI_MZRa_Monstera_B02a": {
                "color": "T_MZRa_Monstera_B02a_BC.png",
                "alpha": "self",
                "normal": "T_MZRa_Monstera_B02a_N.png",
                "rough": 0.55,
            },
            "MI_MZRa_Monstera_B02b": {
                "color": "T_MZRa_Monstera_B02b_BC.png",
                "normal": "T_MZRa_Monstera_B02b_N.png",
                "rough": 0.6,
            },
        },
    },
    "sansevieria_tall": {
        "src": "potted-plant/source/flowerLP.fbx",
        "tex": "potted-plant/textures",
        "mats": {
            "flowerLP": {
                "color": "flowerLP_flowerLP_BaseColor.png",
                "normal": "flowerLP_flowerLP_Normal.png",
                "rough": 0.6,
            },
        },
    },
    "rubber_pot": {
        "src": "potted-plant-1/source/potted_plant-1.fbx",
        "tex": "potted-plant-1/textures",
        "pot": "pot",
        "mats": {
            "01 - Default": {"color": "foliage_0.png", "alpha": "self", "rough": 0.55},
            "01 - Default.001": {"color": "flower_pot-1.png", "rough": 0.8},
        },
    },
    "caladium_bowl": {
        "src": "potted-plant-01/source/potted_plant.fbx",
        "tex": "potted-plant-01/textures",
        "drop": ["ground"],
        "pot": "pot",
        "tris": {"pot": 2000, "leaves": 9000},
        "mats": {
            "leaves": {"color": "leaves_diffuse.jpg", "normal": "leaves_normal.jpg", "rough": 0.55},
            "pot": {"color": "pot_diffuse.jpg", "normal": "pot_normal.jpg", "rough": 0.7},
        },
    },
    "flower_urn": {
        "src": "potted-plant-03/source/potted_plant_3.fbx",
        "tex": "potted-plant-03/textures",
        "pot": "pot",
        "tris": {"leaves": 9000, "pebbles": 700, "pot": 2000, "stem": 1500},
        "mats": {
            "leaves": {"color": "leaves_diffuse.jpg", "normal": "leaves_normal.jpg", "rough": 0.55},
            "pot": {"color": "pot_diffuse.jpg", "normal": "pot_normal.jpg", "rough": 0.7},
        },
    },
    "croton_pot": {
        "src": "croton-plant/source/Croton.fbx",
        "tex": "croton-plant/textures",
        "pot": "Pot2",
        "mats": {
            "lambert1": {
                "color": "PlantCroton_albedo.jpg",
                "alpha": "PlantCroton_opacity.jpg",
                "normal": "LeafCrotonPlant_PlantCroton_Normal.png",
                "rough": 0.5,
            },
            "standardSurface1": {"color": "POT_Base_color.png", "normal": "POT_Normal.png", "rough": 0.6},
        },
    },
    "croton_garden": {
        # a 3.8M-triangle vertex-colored scan, upside down and 3.3 m tall: decimated, colors baked to a texture
        "src": "garden-croton-plant/source/x/v1_full.ply",
        "rot_x": 180,
        "height": 0.95,
        "bake": 16000,
    },
    "tropical_shrub": {
        "src": "tropical-plant-2/trop2.obj",   # made from the FBX 6.1 ASCII file by fbx6_to_obj.py
        "tex": "tropical-plant-2/textures",
        "height": 1.9,
        "mats": {
            "Tree_0": {"color": "plant03.png", "normal": "plant03_normal.png", "rough": 0.8},
            "Tree_1": {"color": "leaf tropical02.png", "alpha": "self", "rough": 0.55},
        },
    },
    "elephant_ear": {
        "src": "tropical-plant/source/trop_leav 4.blend1",
        "tex": "tropical-plant/textures",
        "keep": ["trop_leav 4"],
        "height": 1.3,
        "mats": {"*": {"color": "trop_leav_4.png", "alpha": "self", "rough": 0.55}},
    },
    "banana": {
        "src": "tropical-plants-pack-m02p/source/MZRa_Pack_M02P.fbx",
        "tex": "tropical-plants-pack-m02p/textures",
        "keep": ["SM_MZRa_Banana_B091"],
        "mats": {
            "MI_MZRa_Banana_B09a": {"color": "T_MZRa_Banana_B09a_BC.png", "alpha": "self", "rough": 0.55},
            "MI_MZRa_Banana_B09b": {
                "color": "T_MZRa_Banana_B09_BC.png",
                "normal": "T_MZRa_Banana_B09_N.png",
                "rough": 0.7,
            },
        },
    },
    "fern": {
        "src": "tropical-plants-pack-m02p/source/MZRa_Pack_M02P.fbx",
        "tex": "tropical-plants-pack-m02p/textures",
        "keep": ["SM_MZRa_Fern_B052"],
        "mats": {"MI_MZRa_Fern_B052": {"color": "T_MZRa_Fern_B052_BC.png", "alpha": "self", "rough": 0.6}},
    },
    "monstera_yard": {
        "src": "tropical-plants-pack-m02p/source/MZRa_Pack_M02P.fbx",
        "tex": "tropical-plants-pack-m02p/textures",
        "keep": ["tree.006SM_MZRa_Monstera_B071"],
        "mats": {
            "MI_MZRa_Monstera_B07a1": {"color": "MI_MZRa_Monstera_B07a1_BC.png", "alpha": "self", "rough": 0.5},
            "MI_MZRa_Monstera_B07a2": {"color": "MI_MZRa_Monstera_B07a2_BC.png", "alpha": "self", "rough": 0.5},
            "MI_MZRa_Monstera_B07b": {
                "color": "T_MZRa_Monstera_B07b_BC.png",
                "normal": "T_MZRa_Monstera_B07b_N.png",
                "rough": 0.6,
            },
        },
    },
}


def import_source(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in (".blend", ".blend1"):
        bpy.ops.wm.open_mainfile(filepath=path, load_ui=False)
        return
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext == ".usdz":
        bpy.ops.wm.usd_import(filepath=path)
    elif ext == ".ply":
        bpy.ops.wm.ply_import(filepath=path)
    elif ext == ".obj":
        bpy.ops.wm.obj_import(filepath=path)


def mesh_objects():
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def keep_only(cfg):
    """Remove lights, cameras and every mesh the asset does not use."""
    keep, drop = cfg.get("keep"), cfg.get("drop", [])
    for o in list(bpy.context.scene.objects):
        unwanted = o.type != "MESH" or o.name in drop or (keep and o.name not in keep)
        if unwanted:
            bpy.data.objects.remove(o, do_unlink=True)


def select(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def apply_transforms(objs):
    select(objs)
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def tri_count(o):
    o.data.calc_loop_triangles()
    return len(o.data.loop_triangles)


def decimate(o, target):
    """Collapse-decimate a mesh to about `target` triangles (no-op when it is already under budget)."""
    n = tri_count(o)
    if n <= target:
        return
    mod = o.modifiers.new("dec", "DECIMATE")
    mod.ratio = target / n
    mod.use_collapse_triangulate = True
    select([o])
    bpy.ops.object.modifier_apply(modifier=mod.name)


def resized_copy(im, size, non_color=False, alpha_px=None):
    """A generated (packed as PNG) size x size copy of an image. pack() on a loaded image packs the original
    file, not the scaled pixels, so every texture goes through a new image."""
    im.scale(size, size)
    px = np.empty(size * size * 4, dtype=np.float32)
    im.pixels.foreach_get(px)
    if alpha_px is not None:
        px[3::4] = alpha_px
    out = bpy.data.images.new(im.name + "_r", size, size, alpha=True)
    if non_color:
        out.colorspace_settings.name = "Non-Color"
    out.pixels.foreach_set(px)
    out.pack()
    return out


def load_image(tex_dir, name, size, alpha=None, non_color=False):
    """Load a texture at size x size, with a grayscale opacity file merged into its alpha."""
    im = bpy.data.images.load(os.path.join(tex_dir, name))
    alpha_px = None
    if alpha and alpha != "self":
        al = bpy.data.images.load(os.path.join(tex_dir, alpha))
        al.scale(size, size)
        ap = np.empty(size * size * 4, dtype=np.float32)
        al.pixels.foreach_get(ap)
        alpha_px = ap[0::4]
    return resized_copy(im, size, non_color=non_color, alpha_px=alpha_px)


def build_material(name, spec, tex_dir):
    """Principled material from the spec; alpha goes through a 0.5 threshold so glTF exports it as MASK."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    color_img = load_image(tex_dir, spec["color"], COLOR_SIZE, alpha=spec.get("alpha"))
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = color_img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if spec.get("alpha"):
        cut = nt.nodes.new("ShaderNodeMath")
        cut.operation = "GREATER_THAN"
        cut.inputs[1].default_value = 0.5
        nt.links.new(tex.outputs["Alpha"], cut.inputs[0])
        nt.links.new(cut.outputs[0], bsdf.inputs["Alpha"])
    if spec.get("normal"):
        nimg = load_image(tex_dir, spec["normal"], NORMAL_SIZE, non_color=True)
        ntex = nt.nodes.new("ShaderNodeTexImage")
        ntex.image = nimg
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(ntex.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Roughness"].default_value = spec.get("rough", 0.6)
    bsdf.inputs["Metallic"].default_value = 0.0
    m.use_backface_culling = False
    return m


def assign_materials(objs, cfg):
    tex_dir = os.path.join(INBOX, cfg["tex"])
    built = {}
    for o in objs:
        for slot in o.material_slots:
            old = slot.material.name if slot.material else ""
            key = old if old in cfg["mats"] else ("*" if "*" in cfg["mats"] else None)
            if key is None:
                key = o.name if o.name in cfg["mats"] else None
            if key is None:
                raise SystemExit(f"[plants11] {ASSET}: no material spec for {old!r} on {o.name}")
            if key not in built:
                built[key] = build_material(f"{ASSET}_{len(built)}", cfg["mats"][key], tex_dir)
            slot.material = built[key]


def shrink_imported_images():
    """keep_imported assets: their own textures at the game sizes (normal maps smaller)."""
    for im in list(bpy.data.images):
        if im.size[0] == 0:
            continue
        is_normal = "norm" in im.name.lower()
        size = NORMAL_SIZE if is_normal else COLOR_SIZE
        im.user_remap(resized_copy(im, min(size, im.size[0]), non_color=is_normal))
    for m in bpy.data.materials:
        m.use_backface_culling = False


def bbox(objs):
    pts = [o.matrix_world @ mathutils.Vector(v) for o in objs for v in o.bound_box]
    lo = mathutils.Vector([min(p[i] for p in pts) for i in range(3)])
    hi = mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
    return lo, hi


def normalize(objs, cfg):
    """Scale to the target height if given, then base at z = 0 and the pot (or the whole plant) centered."""
    if cfg.get("rot_x"):
        for o in objs:
            o.rotation_euler.x += math.radians(cfg["rot_x"])
        apply_transforms(objs)
    if cfg.get("height"):
        lo, hi = bbox(objs)
        k = cfg["height"] / (hi.z - lo.z)
        for o in objs:
            o.scale *= k
        apply_transforms(objs)
    lo, hi = bbox(objs)
    pot = [o for o in objs if o.name == cfg.get("pot")]
    plo, phi = bbox(pot) if pot else (lo, hi)
    shift = mathutils.Vector(((plo.x + phi.x) / 2, (plo.y + phi.y) / 2, lo.z))
    for o in objs:
        o.location -= shift
    apply_transforms(objs)


def bake_scan(cfg):
    """Scan assets: decimate a copy, unwrap it and bake the high mesh's vertex colors onto a 1K texture."""
    high = mesh_objects()[0]
    low = high.copy()
    low.data = high.data.copy()
    bpy.context.scene.collection.objects.link(low)
    decimate(low, cfg["bake"])
    select([low])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")
    img = bpy.data.images.new("croton_bake", COLOR_SIZE, COLOR_SIZE)
    hm = bpy.data.materials.new("scan_src")
    hm.use_nodes = True
    attr = hm.node_tree.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = high.data.color_attributes[0].name
    emit = hm.node_tree.nodes.new("ShaderNodeEmission")
    hm.node_tree.links.new(attr.outputs["Color"], emit.inputs["Color"])
    hm.node_tree.links.new(emit.outputs[0], hm.node_tree.nodes["Material Output"].inputs["Surface"])
    high.data.materials.clear()
    high.data.materials.append(hm)
    lm = bpy.data.materials.new("croton_garden")
    lm.use_nodes = True
    tex = lm.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = img
    bsdf = lm.node_tree.nodes["Principled BSDF"]
    lm.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.6
    lm.use_backface_culling = False
    lm.node_tree.nodes.active = tex
    low.data.materials.clear()
    low.data.materials.append(lm)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 4
    sc.render.bake.use_selected_to_active = True
    sc.render.bake.cage_extrusion = 0.01
    sc.render.bake.max_ray_distance = 0.03
    sc.render.bake.margin = 4
    bpy.ops.object.select_all(action="DESELECT")
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.bake(type="EMIT")
    img.pack()
    bpy.data.objects.remove(high, do_unlink=True)
    return [low]


def main():
    cfg = ASSETS[ASSET]
    import_source(os.path.join(INBOX, cfg["src"]))
    # bake the parents' transforms in first: USD / FBX imports hang the meshes under rotated empties
    apply_transforms([o for o in bpy.context.scene.objects if o.type in ("MESH", "EMPTY")])
    keep_only(cfg)
    objs = mesh_objects()
    if cfg.get("bake"):
        normalize(objs, cfg)
        objs = bake_scan(cfg)
    else:
        budget = cfg.get("tris", {})
        for o in objs:
            target = budget.get(o.name, budget.get("*"))
            if target:
                decimate(o, target)
        if cfg.get("keep_imported"):
            shrink_imported_images()
        else:
            assign_materials(objs, cfg)
        normalize(objs, cfg)
    for o in objs:
        for p in o.data.polygons:
            p.use_smooth = True
    lo, hi = bbox(objs)
    tris = sum(tri_count(o) for o in objs)
    out = os.path.join(OUTDIR, f"{ASSET}.glb")
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        use_selection=False,
        export_yup=True,
        export_apply=True,
        export_image_format="WEBP",
        export_image_quality=85,
    )
    size = [round(v, 3) for v in (hi - lo)]
    print(f"[plants11] {ASSET} tris={tris} size={size} bytes={os.path.getsize(out)}")


main()
