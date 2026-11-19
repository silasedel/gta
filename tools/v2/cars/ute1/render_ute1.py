# Look check for the ute1 source (EEVEE): yellow gloss paint with the game's stripe boxes (hood box + flank band), views
# matched to the mock-ups (docs/v2/plan/nico_car/mockup_side.webp, mockup_rear.webp).
# blender -b --factory-startup -P tools/v2/cars/ute1/render_ute1.py -- <ute1_src.blend> <outdir> [band_lo band_hi]
import bpy, sys, math
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = a[0], a[1]
BAND = (float(a[2]), float(a[3])) if len(a) > 3 else (0.53, 0.61)
bpy.ops.wm.open_mainfile(filepath=SRC)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE_NEXT'
sc.render.resolution_x, sc.render.resolution_y = 1280, 760
try: sc.eevee.taa_render_samples = 48
except Exception: pass
# paint: clearcoat yellow, orange-red stripe where the game's boxes are
m = bpy.data.materials['U_Paint']; nt = m.node_tree; b = nt.nodes['Principled BSDF']
b.inputs['Coat Weight'].default_value = 1.0; b.inputs['Coat Roughness'].default_value = 0.03; b.inputs['Roughness'].default_value = 0.28
geo = nt.nodes.new('ShaderNodeNewGeometry'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(geo.outputs['Position'], sep.inputs[0])
def cmp(sock, lo, hi):
    g = nt.nodes.new('ShaderNodeMath'); g.operation = 'GREATER_THAN'; g.inputs[1].default_value = lo; nt.links.new(sock, g.inputs[0])
    l = nt.nodes.new('ShaderNodeMath'); l.operation = 'LESS_THAN'; l.inputs[1].default_value = hi; nt.links.new(sock, l.inputs[0])
    mm = nt.nodes.new('ShaderNodeMath'); mm.operation = 'MULTIPLY'; nt.links.new(g.outputs[0], mm.inputs[0]); nt.links.new(l.outputs[0], mm.inputs[1]); return mm.outputs[0]
def mul(x, y):
    mm = nt.nodes.new('ShaderNodeMath'); mm.operation = 'MULTIPLY'; nt.links.new(x, mm.inputs[0]); nt.links.new(y, mm.inputs[1]); return mm.outputs[0]
hood = mul(mul(cmp(sep.outputs['X'], -0.55, 0.55), cmp(sep.outputs['Y'], -2.3, -1.0)), cmp(sep.outputs['Z'], 0.82, 2.0))
band = mul(cmp(sep.outputs['Z'], BAND[0], BAND[1]), cmp(sep.outputs['Y'], -2.3, 2.42))
mx = nt.nodes.new('ShaderNodeMath'); mx.operation = 'MAXIMUM'; nt.links.new(hood, mx.inputs[0]); nt.links.new(band, mx.inputs[1])
mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
mix.inputs[6].default_value = (0.88, 0.40, 0.003, 1); mix.inputs[7].default_value = (0.69, 0.065, 0.012, 1)
mx.inputs[0].default_value = 0; mx.inputs[1].default_value = 0
for l in list(mx.inputs[0].links) + list(mx.inputs[1].links): nt.links.remove(l)
nt.links.new(mx.outputs[0], mix.inputs[0]); nt.links.new(mix.outputs[2], b.inputs['Base Color'])
for n_ in ('U_Glass', 'U_Lens'):
    g = bpy.data.materials[n_]; bb = g.node_tree.nodes['Principled BSDF']; bb.inputs['Roughness'].default_value = 0.02
    try: g.surface_render_method = 'BLENDED'
    except Exception: pass
# ground + light
bpy.ops.mesh.primitive_plane_add(size=40); gp = bpy.context.object
gm = bpy.data.materials.new('ground'); gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.32, 0.29, 0.25, 1); gp.data.materials.append(gm)
w = bpy.data.worlds.new('w'); sc.world = w; w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.7, 0.95, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun); sun.data.energy = 4.0
sun.rotation_euler = (math.radians(50), 0, math.radians(140)); sun.data.angle = math.radians(2)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
VIEWS = {   # Blender frame: front -Y, left +X
    'side34': ((5.2, -3.6, 3.6), (0.0, -0.2, 0.55), 35),     # mock-up side: high front-left 3/4
    'rear': ((0.0, 7.5, 3.4), (0.0, 0.0, 0.7), 40),           # mock-up rear: high from behind
    'profile': ((7.5, 0.0, 0.9), (0.0, 0.0, 0.6), 40),
    'front34': ((-4.6, -5.0, 1.5), (0.0, 0.0, 0.6), 40),
    'cabin': ((1.6, 0.9, 1.75), (0.1, -0.6, 0.8), 28),
    'wheel': ((2.4, -2.6, 0.45), (0.77, -1.65, 0.32), 40),
}
only = a[4].split(',') if len(a) > 4 else list(VIEWS)
for k in only:
    loc, tgt, lens = VIEWS[k]
    cam.location = loc; cam.data.lens = lens
    cam.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{OUT}/ute1_{k}.png'; bpy.ops.render.render(write_still=True)
print('RENDERED')
