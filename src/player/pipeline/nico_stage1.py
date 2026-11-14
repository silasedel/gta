# Stage 1: design check. Builds Nico's body + face from nico_design.py with MPFB proxies and renders studio previews.
#   blender -b -P nico_stage1.py -- <workdir>
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mpfb_util import *
import nico_design as D
work = sys.argv[sys.argv.index("--") + 1]
clear_scene()
body = make_human(D.MACRO, D.DETAILS)
HumanService.set_character_skin(find_asset(D.SKIN + ".mhmat", "skins"), body, skin_type="GAMEENGINE")
HumanService.add_builtin_rig(body, "mixamo")
for sub, fn, at in [("eyes", "high-poly.mhclo", "Eyes"), ("eyebrows", "eyebrow006.mhclo", "Eyebrows"), ("eyelashes", "eyelashes01.mhclo", "Eyelashes"),
                    ("teeth", "teeth_base.mhclo", "Teeth"), ("tongue", "tongue01.mhclo", "Tongue"), ("hair", "short02.mhclo", "Hair")]:
    p = find_asset(fn, sub)
    if p: HumanService.add_mhclo_asset(p, body, asset_type=at, material_type="GAMEENGINE")
bpy.context.view_layer.update()
co = mix_coords(body)
print("NICO verts", len(co), "height", co[:, 2].max() - co[:, 2].min(), "objs", [(o.name, o.type, len(o.data.vertices) if o.type == "MESH" else 0) for o in bpy.data.objects])
print("VGROUPS", len(body.vertex_groups), [g.name for g in body.vertex_groups][:400])
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
hb = arm.data.bones.get("mixamorig:Head"); hz = (arm.matrix_world @ hb.head_local).z; top = co[:, 2].max() * body.matrix_world.to_scale().z
eye = 0
for o in bpy.data.objects:
    if "high-poly" in o.name and o.type == "MESH":
        zs = [(o.matrix_world @ v.co).z for v in o.data.vertices]; eye = sum(zs) / len(zs)
print("HEAD z", hz, "eye z", eye)
studio((0, -1.1, eye), (0, 0, eye), lens=85)
for name, loc, tgt in [("face_front", (0, -1.05, eye + 0.01), (0, 0, eye - 0.015)), ("face_34", (0.72, -0.78, eye + 0.03), (0, 0, eye - 0.015)),
                       ("face_side", (1.08, 0.02, eye), (0, 0.02, eye - 0.015))]:
    set_cam(loc, tgt); render(os.path.join(work, "s1_" + name + ".png"))
bpy.context.scene.camera.data.lens = 50
set_cam((0, -4.4, 0.95), (0, 0, 0.92)); render(os.path.join(work, "s1_body_front.png"))
set_cam((3.1, -3.1, 1.0), (0, 0, 0.92)); render(os.path.join(work, "s1_body_34.png"))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(work, "nico_stage1.blend"))
