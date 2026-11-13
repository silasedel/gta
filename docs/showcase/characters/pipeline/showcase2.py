# Showcase v2 renders (merged one-mesh characters with atlases). blender -b -P showcase2.py -- spec.json outdir layout.json atlasdir
import os, sys, math, json, random
os.environ["GEN_IMPORT_ONLY"] = "1"
HERE = os.path.dirname(os.path.abspath(__file__))
_argv = sys.argv[sys.argv.index("--") + 1:]
sys.argv = sys.argv[:sys.argv.index("--") + 1] + [_argv[0], os.path.join(HERE, 'sc_out'), _argv[2]]
exec(open(os.path.join(HERE, "gen_humans2.py")).read())
import bpy
from mathutils import Vector
outdir = _argv[1]; ATL = _argv[3]
os.makedirs(outdir, exist_ok=True)
byid = {s["id"]: s for s in specs}
LINEUP = ["h00_beach_m", "h01_beach_f", "h18_casual_m", "h21_casual_f", "h34_business_m", "h37_business_f",
          "h44_nightlife_m", "h55_sport_f", "h28_casual_m", "h50_port_m", "h09_beach_f", "h31_casual_f", "h62_beach_m", "player"]
LINEUP = [i for i in LINEUP if i in byid]
def clear_nonkeep():
    for o in list(bpy.data.objects):
        if not o.name.startswith("K"): bpy.data.objects.remove(o, do_unlink=True)
globals()["clear_scene"] = clear_nonkeep
imgS = bpy.data.images.load(os.path.join(ATL, "atlasS.jpg")); imgC = bpy.data.images.load(os.path.join(ATL, "atlasC.webp"))
PAL = [(0.85, 0.32, 0.25), (0.18, 0.5, 0.55), (0.9, 0.85, 0.7), (0.55, 0.48, 0.36), (0.12, 0.35, 0.65), (0.75, 0.18, 0.2), (0.9, 0.55, 0.15), (0.95, 0.95, 0.93), (0.2, 0.22, 0.26), (0.6, 0.75, 0.55)]
HAIRC = [(0.06, 0.045, 0.035), (0.16, 0.1, 0.06), (0.35, 0.25, 0.14), (0.02, 0.02, 0.02)]
def setup_mats(obj, rnd):
    me = obj.data; col = me.color_attributes["Col"]
    tint = me.color_attributes.new("Tint", "FLOAT_COLOR", "POINT")
    pal = {s: PAL[rnd.randrange(len(PAL))] for s in range(3, 12)}; pal[2] = HAIRC[rnd.randrange(len(HAIRC))]
    for i, c in enumerate(col.data):
        slot = int(round(c.color[0] * 16)); t = pal.get(slot)
        if slot == 2: t = (1, 1, 1)
        tint.data[i].color = (*(t if t else (1, 1, 1)), 1)
    for m in me.materials:
        if m.get("_done"): continue
        m["_done"] = 1; m.use_nodes = True; nt = m.node_tree
        bsdf = nt.nodes["Principled BSDF"]; tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = imgS if m.name.startswith("skinS") else imgC
        uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = "UVMap"; nt.links.new(uvn.outputs[0], tex.inputs[0])
        ca = nt.nodes.new("ShaderNodeVertexColor"); ca.layer_name = "Tint"
        mul = nt.nodes.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"; mul.inputs[0].default_value = 1.0
        nt.links.new(tex.outputs[0], mul.inputs[6]); nt.links.new(ca.outputs[0], mul.inputs[7]); nt.links.new(mul.outputs[2], bsdf.inputs["Base Color"])
        if m.name.startswith("atlasC"):
            nt.links.new(tex.outputs[1], bsdf.inputs["Alpha"])
            try: m.surface_render_method = "DITHERED"
            except Exception: m.blend_method = "HASHED"
        bsdf.inputs["Roughness"].default_value = 0.7
chars = []
for i, cid in enumerate(LINEUP):
    arm, lod0 = build(byid[cid])
    for o in list(bpy.data.objects):
        if o.name.startswith("human_LOD") and o != lod0: bpy.data.objects.remove(o, do_unlink=True)
    setup_mats(lod0, random.Random(i * 7 + 1))
    for o in (arm, lod0): o.name = "K%02d_%s" % (i, o.name)
    chars.append((cid, arm, [lod0]))
clear_nonkeep()
n = len(chars)
SP = 0.72
for i, (cid, arm, meshes) in enumerate(chars):
    arm.location.x += (i - (n - 1) / 2) * SP
    arm.rotation_euler.z += math.radians((i % 3 - 1) * 6)

scene = bpy.context.scene
for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
    try:
        scene.render.engine = eng
        break
    except Exception:
        pass
scene.render.resolution_x, scene.render.resolution_y = 1600, 760
scene.render.film_transparent = False
try:
    scene.eevee.use_shadows = True
    scene.eevee.taa_render_samples = 64
except Exception:
    pass
scene.view_settings.view_transform = "AgX"
world = bpy.data.worlds.new("W"); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes["Background"]; bg.inputs[0].default_value = (0.62, 0.68, 0.78, 1); bg.inputs[1].default_value = 0.9
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
floor = bpy.context.active_object
fm = bpy.data.materials.new("floor"); fm.use_nodes = True
fb = fm.node_tree.nodes["Principled BSDF"]; fb.inputs["Base Color"].default_value = (0.32, 0.31, 0.3, 1); fb.inputs["Roughness"].default_value = 0.6
floor.data.materials.append(fm)
sun = bpy.data.lights.new("sun", "SUN"); sun.energy = 3.2; sun.angle = math.radians(4)
so = bpy.data.objects.new("sun", sun); scene.collection.objects.link(so); so.rotation_euler = (math.radians(50), math.radians(10), math.radians(-35))
fill = bpy.data.lights.new("fill", "AREA"); fill.energy = 600; fill.size = 6
fo = bpy.data.objects.new("fill", fill); scene.collection.objects.link(fo); fo.location = (0, -7, 3.5); fo.rotation_euler = (math.radians(65), 0, 0)
rim = bpy.data.lights.new("rim", "AREA"); rim.energy = 500; rim.size = 5; rim.color = (1.0, 0.85, 0.7)
ro = bpy.data.objects.new("rim", rim); scene.collection.objects.link(ro); ro.location = (3, 5, 4); ro.rotation_euler = (math.radians(-55), 0, math.radians(150))
cam = bpy.data.cameras.new("cam"); co = bpy.data.objects.new("cam", cam); scene.collection.objects.link(co); scene.camera = co

def look(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

def render(name):
    scene.render.filepath = os.path.join(outdir, name)
    bpy.ops.render.render(write_still=True)
    print("RENDERED", name)

# 1. lineup
cam.lens = 50
width = n * SP + 0.6
dist = width * 50 / 36 * 0.78
co.location = (0, -dist, 1.05); look(co, (0, 0, 0.92))
render("lineup.png")

# 2. portrait of the player + a second face
def head_of(arm):
    b = arm.data.bones.get("mixamorig:Head")
    return arm.matrix_world @ b.head_local if b else arm.location + Vector((0, 0, 1.65))
scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
cam.lens = 85
for (cid, arm, meshes) in chars:
    if cid in ("player", "h21_casual_f"):
        h = head_of(arm) + Vector((0, 0, 0.07))
        co.location = h + Vector((0.18, -0.95, 0.02)); look(co, h)
        render("portrait_%s.png" % cid)

# 3. wireframe / topology: clay + wire overlay on two characters
clay = bpy.data.materials.new("clay"); clay.use_nodes = True
cb = clay.node_tree.nodes["Principled BSDF"]; cb.inputs["Base Color"].default_value = (0.75, 0.72, 0.68, 1); cb.inputs["Roughness"].default_value = 0.6
wire = bpy.data.materials.new("wire"); wire.use_nodes = True
wb = wire.node_tree.nodes["Principled BSDF"]; wb.inputs["Base Color"].default_value = (0.05, 0.25, 0.45, 1)
sel = [c for c in chars if c[0] in ("player", "h03_beach_f")]
saved = {}
for (cid, arm, meshes) in sel:
    for o in meshes:
        saved[o.name] = [m for m in o.data.materials]
        for k in range(len(o.data.materials)):
            o.data.materials[k] = clay
        w = o.copy(); w.data = o.data.copy(); w.name = "W_" + o.name; scene.collection.objects.link(w)
        wm = w.modifiers.new("wf", "WIREFRAME"); wm.thickness = 0.0016; wm.use_replace = True
        # wireframe must come before the armature so it deforms with the rig
        bpy.context.view_layer.objects.active = w
        while w.modifiers.find("wf") > 0:
            bpy.ops.object.modifier_move_up(modifier="wf")
        w.data.materials.clear(); w.data.materials.append(wire)
xs = [arm.location.x for (_, arm, _) in sel]
cx = sum(xs) / len(xs)
others = [c for c in chars if c not in sel]
for (_, arm, meshes) in others:
    for o in meshes: o.hide_render = True
co.location = (cx + 0.4, -3.4, 1.1); cam.lens = 50; look(co, (cx, 0, 0.95))
scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
render("wireframe.png")

# 4. rig / skeleton view of the player
for o in list(bpy.data.objects):
    if o.name.startswith("W_"): bpy.data.objects.remove(o, do_unlink=True)
for (cid, arm, meshes) in chars:
    for o in meshes: o.hide_render = cid != "player"
pl = next(c for c in chars if c[0] == "player")
ghost = bpy.data.materials.new("ghost"); ghost.use_nodes = True
gb = ghost.node_tree.nodes["Principled BSDF"]; gb.inputs["Base Color"].default_value = (0.7, 0.75, 0.8, 1); gb.inputs["Alpha"].default_value = 0.18
try: ghost.surface_render_method = "BLENDED"
except Exception: ghost.blend_method = "BLEND"
for o in pl[2]:
    for k in range(len(o.data.materials)): o.data.materials[k] = ghost
bonem = bpy.data.materials.new("bone"); bonem.use_nodes = True
bb = bonem.node_tree.nodes["Principled BSDF"]; bb.inputs["Base Color"].default_value = (1.0, 0.45, 0.1, 1)
try: bb.inputs["Emission Color"].default_value = (1.0, 0.45, 0.1, 1); bb.inputs["Emission Strength"].default_value = 2.0
except Exception: pass
arm = pl[1]
for b in arm.data.bones:
    h = arm.matrix_world @ b.head_local; t = arm.matrix_world @ b.tail_local
    L = (t - h).length
    if L < 1e-4: continue
    bpy.ops.mesh.primitive_cylinder_add(radius=0.006 if "Hand" in b.name and b.name[-1].isdigit() else 0.011, depth=L, location=(h + t) / 2)
    cyl = bpy.context.active_object
    cyl.rotation_euler = (t - h).to_track_quat("Z", "Y").to_euler(); cyl.data.materials.append(bonem)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.016 if not b.name[-1].isdigit() else 0.008, location=h)
    bpy.context.active_object.data.materials.append(bonem)
co.location = (arm.location.x + 0.9, -2.6, 1.15); look(co, (arm.location.x, 0, 0.95))
render("rig.png")
print("SHOWCASE DONE")
