# Tripo FBX (mesh + *.fbm textures) -> a plain GLB with the base color embedded (image named 'baseColor'), the input
# tools/v2/npcs/apose_lifeguard.py expects. Used for Mari, whose scan stands arms down (not a T-pose).
#   blender -b --python-exit-code 1 -P tools/v2/player/fbx_to_glb.py -- <in.fbx> <basecolor.jpg> <out.glb>
# Reads the files as data only.
import bpy
import os
import shutil
import sys

src, color, out = sys.argv[sys.argv.index('--') + 1 :][:3]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src)
for o in list(bpy.data.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o, do_unlink=True)

# the exporter names the glTF image after the file: copy it next to the output as baseColor.jpg
named = os.path.join(os.path.dirname(os.path.abspath(out)), 'baseColor.jpg')
shutil.copyfile(color, named)
img = bpy.data.images.load(named)
img.name = 'baseColor'
mat = bpy.data.materials.new('scan')
mat.use_nodes = True
nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
tex = nt.nodes.new('ShaderNodeTexImage')
tex.image = img
nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])

for o in bpy.data.objects:
    o.data.materials.clear()
    o.data.materials.append(mat)
    o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLB',
    use_selection=True,
    export_animations=False,
    export_image_format='JPEG',
)
print('[fbx2glb] wrote', out)
