# Nico's house r11: the user's "kitchen-sink" download (Models/_Inbox/kitchen-sink: a 33 x 22 in double-basin drop-in sink
# with a gooseneck faucet and two handles) -> public/assets/models/keys/kitchen/sink2.glb
#
#   blender -b -Y --python-exit-code 1 --python tools/v2/keys/r11/sink11.py -- \
#       Models/_Inbox/kitchen-sink public/assets/models/keys/kitchen/sink2.glb
#
# Game frame after export: the long side along X, the faucet toward -Z, the flange top at y = 0, centered on the basin.
# Two materials: brushed stainless (the shipped color / roughness / normal maps, 1K) and bright chrome for the faucet.
import bpy
import math
import os
import sys

import mathutils
import numpy as np

ARGS = sys.argv[sys.argv.index("--") + 1 :]
SRC_DIR, OUT = ARGS[0], ARGS[1]
TEX = os.path.join(SRC_DIR, "source", "x")


def load_resized(name, size, non_color=False):
    """A packed size x size copy of a texture (pack() on a loaded image would pack the original file)."""
    im = bpy.data.images.load(os.path.join(TEX, name))
    im.scale(size, size)
    px = np.empty(size * size * 4, dtype=np.float32)
    im.pixels.foreach_get(px)
    out = bpy.data.images.new(name + "_r", size, size, alpha=False)
    if non_color:
        out.colorspace_settings.name = "Non-Color"
    out.pixels.foreach_set(px)
    out.pack()
    return out


def tex_node(nt, img):
    n = nt.nodes.new("ShaderNodeTexImage")
    n.image = img
    return n


def stainless():
    m = bpy.data.materials.new("sink_steel")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    col = tex_node(nt, load_resized("KitchenSink_BaseColor.png", 1024))
    nt.links.new(col.outputs["Color"], bsdf.inputs["Base Color"])
    rough = tex_node(nt, load_resized("KitchenSink_Roughness.png", 512, non_color=True))
    nt.links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
    nor = tex_node(nt, load_resized("KitchenSink_NormalOGL8.png", 1024, non_color=True))
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(nor.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Metallic"].default_value = 1.0
    return m


def chrome():
    m = bpy.data.materials.new("sink_chrome")
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.92, 0.93, 0.95, 1.0)
    bsdf.inputs["Metallic"].default_value = 1.0
    bsdf.inputs["Roughness"].default_value = 0.06
    return m


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.join(TEX, "KitchenSink.fbx"))
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    for o in [o for o in bpy.context.scene.objects if o.type != "MESH"]:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    body = next(o for o in objs if o.name == "KitchenSink")
    faucet = next(o for o in objs if o.name == "KitchenSinkFaucet")
    steel, bright = stainless(), chrome()
    for o in objs:
        o.data.materials.clear()
        o.data.materials.append(steel if o is body else bright)

    def bounds(obs):
        # from the vertices: bound_box is stale after mesh.transform()
        pts = [o.matrix_world @ v.co for o in obs for v in o.data.vertices]
        lo = mathutils.Vector([min(p[i] for p in pts) for i in range(3)])
        hi = mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
        return lo, hi

    # long side (source Y) onto X, then the faucet onto the +Y side (Blender +Y = game -Z)
    rot = mathutils.Matrix.Rotation(math.radians(90), 4, "Z")
    for o in objs:
        o.data.transform(rot)
    fl, fh = bounds([faucet])
    bl, bh = bounds([body])
    if (fl.y + fh.y) / 2 < (bl.y + bh.y) / 2:
        flip = mathutils.Matrix.Rotation(math.pi, 4, "Z")
        for o in objs:
            o.data.transform(flip)
    bl, bh = bounds([body])
    shift = mathutils.Matrix.Translation(-mathutils.Vector(((bl.x + bh.x) / 2, (bl.y + bh.y) / 2, bh.z)))
    for o in objs:
        o.data.transform(shift)
        for p in o.data.polygons:
            p.use_smooth = True
    bl, bh = bounds([body])
    al, ah = bounds(objs)
    print("[sink11] body", [round(v, 3) for v in (bh - bl)], "all", [round(v, 3) for v in (ah - al)], "top", round(ah.z, 3))
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_image_format="WEBP",
        export_image_quality=85,
    )
    print("[sink11] wrote", OUT, os.path.getsize(OUT))


main()
