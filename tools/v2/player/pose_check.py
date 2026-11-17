# Deformation check for the rigged hero: poses the armature (arms down, elbows bent, squat/sit, stride, aim, twist)
# and renders front + side (Workbench, textured) so shoulders / elbows / hips / knees can be judged by eye.
#   blender -b <rig.blend> --python-exit-code 1 -P tools/v2/player/pose_check.py -- <basecolor.png> <outdir>
import bpy, sys, math, os
from mathutils import Euler, Vector, Matrix
argv = sys.argv[sys.argv.index('--') + 1:]
TEX, OUT = argv[0], argv[1]
os.makedirs(OUT, exist_ok=True)
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in meshes: o.hide_render = not o.name.startswith('LOD0')
img = bpy.data.images.load(TEX)
for m in bpy.data.materials:
    m.use_nodes = True; nt = m.node_tree
    bs = nt.nodes.get('Principled BSDF') or nt.nodes.new('ShaderNodeBsdfPrincipled')
    ti = nt.nodes.new('ShaderNodeTexImage'); ti.image = img
    nt.links.new(ti.outputs['Color'], bs.inputs['Base Color'])
    out = nt.nodes.get('Material Output') or nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(bs.outputs[0], out.inputs[0])
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
sc.render.resolution_x = 520; sc.render.resolution_y = 760
cam_d = bpy.data.cameras.new('c'); cam_d.type = 'ORTHO'; cam_d.ortho_scale = 2.15
cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
pb = rig.pose.bones
def B(n): return pb['mixamorig:' + n]
def reset():
    for b in pb: b.rotation_mode = 'XYZ'; b.rotation_euler = (0, 0, 0); b.location = (0, 0, 0)
def rot(n, axis, deg):
    """rotate bone n about a WORLD axis by deg (applied in pose space)"""
    b = B(n); bpy.context.view_layer.update()
    m = b.matrix.copy(); h = m.to_translation()
    R = Matrix.Rotation(math.radians(deg), 4, Vector(axis))
    b.matrix = Matrix.Translation(h) @ R @ Matrix.Translation(-h) @ m
    bpy.context.view_layer.update()
POSES = {
  'rest': [],
  'armsdown': [('LeftArm', (0, 1, 0), 72), ('RightArm', (0, 1, 0), -72)],
  'elbows': [('LeftArm', (0, 1, 0), 60), ('RightArm', (0, 1, 0), -60), ('LeftForeArm', (0, 0, 1), 100), ('RightForeArm', (0, 0, 1), -100)],
  'armsup': [('LeftArm', (0, 1, 0), -60), ('RightArm', (0, 1, 0), 60)],
  'aim': [('RightArm', (0, 0, 1), -80), ('LeftArm', (0, 0, 1), 70), ('LeftForeArm', (0, 0, 1), 40), ('LeftArm', (0, 1, 0), 15)],
  'sit': [('LeftUpLeg', (1, 0, 0), 85), ('RightUpLeg', (1, 0, 0), 85), ('LeftLeg', (1, 0, 0), -90), ('RightLeg', (1, 0, 0), -90), ('LeftArm', (0, 1, 0), 70), ('RightArm', (0, 1, 0), -70)],
  'stride': [('LeftUpLeg', (1, 0, 0), 35), ('RightUpLeg', (1, 0, 0), -25), ('RightLeg', (1, 0, 0), -45), ('LeftArm', (0, 1, 0), 70), ('RightArm', (0, 1, 0), -70), ('LeftArm', (1, 0, 0), -20), ('RightArm', (1, 0, 0), 20)],
  'twist': [('Spine1', (0, 0, 1), 25), ('Spine2', (0, 0, 1), 20), ('Neck', (0, 0, 1), 30), ('LeftArm', (0, 1, 0), 72), ('RightArm', (0, 1, 0), -72), ('LeftHand', (1, 0, 0), 70)],
}
want = argv[2].split(',') if len(argv) > 2 else list(POSES)
for name in want:
    reset(); bpy.context.view_layer.update()
    for n, ax, d in POSES[name]: rot(n, ax, d)
    for view, loc, r in (('front', (0, -6, 0.95), (math.radians(90), 0, 0)), ('side', (6, 0, 0.95), (math.radians(90), 0, math.radians(90))), ('q', (4.2, -4.2, 1.2), (math.radians(88), 0, math.radians(45)))):
        cam.location = loc; cam.rotation_euler = r
        sc.render.filepath = os.path.join(OUT, f'{name}_{view}.png')
        bpy.ops.render.render(write_still=True)
print('[pose_check] done', want)
