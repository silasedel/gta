# Prints what a downloaded model holds (objects, materials, images, triangles, size) before it gets a config entry.
#   blender -b --disable-autoexec --python-exit-code 1 --python tools/v2/mission/probe.py -- <file> [<file> ...]
import bpy
import sys
import mathutils


def load(src):
    low = src.lower()
    if low.endswith(".blend"):
        bpy.ops.wm.open_mainfile(filepath=src, load_ui=False)
    elif low.endswith((".glb", ".gltf")):
        bpy.ops.import_scene.gltf(filepath=src)
    elif low.endswith(".obj"):
        bpy.ops.wm.obj_import(filepath=src)
    elif low.endswith(".dae"):
        bpy.ops.wm.collada_import(filepath=src)
    else:
        bpy.ops.import_scene.fbx(filepath=src)


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


for src in sys.argv[sys.argv.index("--") + 1 :]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        load(src)
    except Exception as e:
        print("PROBE", src, "FAILED", e)
        continue
    dg = bpy.context.evaluated_depsgraph_get()
    mn = mathutils.Vector((1e9,) * 3)
    mx = -mn
    tot = 0
    print("PROBE", src)
    for o in bpy.context.scene.objects:
        if o.type != "MESH":
            continue
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        n = sum(len(p.vertices) - 2 for p in me.polygons)
        tot += n
        for v in me.vertices:
            w = o.matrix_world @ v.co
            for i in range(3):
                mn[i] = min(mn[i], w[i])
                mx[i] = max(mx[i], w[i])
        mats = [s.material.name for s in o.material_slots if s.material]
        print("  obj %-40s tris %7d hidden %d mats %s" % (o.name[:40], n, o.hide_render or o.hide_get(), mats[:4]))
        ev.to_mesh_clear()
    print("  TOTAL tris %d size %s" % (tot, [round(mx[i] - mn[i], 3) for i in range(3)]))
    for img in bpy.data.images:
        print("  img %-50s %s %s" % (img.name[:50], tuple(img.size), img.filepath[-60:]))
