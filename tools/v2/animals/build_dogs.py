# r4-library (Nov 18): the user's Dog 1 (Rigged Doberman, Models/Animals) -> public/assets/models/animals/dog_doberman.glb
# Skinned GLB, rig kept (31-bone quadruped metarig: spine.004-.012, shoulder/front_thigh/front_shin/front_foot/front_toe,
# thigh/shin/foot/toe, .L/.R), rest pose, head facing three.js +Z, feet on y = 0, origin between the four feet,
# withers 0.62 m. No animation in the source: src/npc/dog.js drives a procedural walk / idle on these bones.
#   blender -b --factory-startup --disable-autoexec -P tools/v2/animals/build_dogs.py -- <Dog 1.blend> <out.glb>
# The source .blend holds three copies of the dog in different poses: only "metarig" + "Plane" are kept.
import bpy, sys, os, math, mathutils
src, out = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.open_mainfile(filepath=src, load_ui=False)
sc = bpy.context.scene
A = bpy.data.objects['metarig']; ME = bpy.data.objects['Plane']
for o in list(sc.objects):
    if o not in (A, ME): bpy.data.objects.remove(o, do_unlink=True)
for o in (A, ME):
    o.animation_data_clear()
for pb in A.pose.bones:
    pb.location = (0, 0, 0); pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)
A.data.pose_position = 'POSE'
bpy.context.view_layer.update()
W = A.matrix_world
hd = W @ A.data.bones['spine.012'].head_local; pv = W @ A.data.bones['spine.004'].head_local
fwd = mathutils.Vector((hd.x - pv.x, hd.y - pv.y, 0)).normalized()
ang = math.atan2(fwd.y, fwd.x)  # rotate so fwd -> -Y (Blender) = +Z (three.js)
R = mathutils.Matrix.Rotation(-math.pi / 2 - ang, 4, 'Z')
# rest-pose mesh in world space
dg = bpy.context.evaluated_depsgraph_get(); e = ME.evaluated_get(dg); m = e.to_mesh()
pts = [R @ (ME.matrix_world @ v.co) for v in m.vertices]; e.to_mesh_clear()
zmin = min(p.z for p in pts)
fl = R @ (W @ A.data.bones['front_toe.L'].head_local); hl = R @ (W @ A.data.bones['toe.L'].head_local)
fr = R @ (W @ A.data.bones['front_toe.R'].head_local); hr = R @ (W @ A.data.bones['toe.R'].head_local)
cx = (fl.x + hl.x + fr.x + hr.x) / 4; cy = (fl.y + hl.y + fr.y + hr.y) / 4
sh = R @ (W @ A.data.bones['front_thigh.L'].head_local)
withers = max(p.z for p in pts if abs(p.y - sh.y) < 0.05) - zmin
S = 0.62 / withers
T = mathutils.Matrix.Scale(S, 4) @ mathutils.Matrix.Translation((-cx, -cy, -zmin)) @ R
# apply: unparent, transform both, apply transforms, re-parent
bpy.ops.object.select_all(action='DESELECT')
ME.select_set(True); bpy.context.view_layer.objects.active = ME; bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
for o in (A, ME):
    o.matrix_world = T @ o.matrix_world
bpy.context.view_layer.update()
for o in (A, ME):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.select_all(action='DESELECT'); ME.select_set(True); A.select_set(True); bpy.context.view_layer.objects.active = A
bpy.ops.object.parent_set(type='OBJECT', keep_transform=True)
for md in ME.modifiers:
    if md.type == 'ARMATURE': md.object = A
# material: coat texture (its link was lost in the .blend), 1K, satin fur
tex = os.path.join(os.path.dirname(src), 'textures', 'пес1.png')
img = bpy.data.images.load(tex); img.scale(1024, 1024); img.name = 'dog_doberman_coat'
mat = bpy.data.materials.new('dog_coat'); mat.use_nodes = True; nt = mat.node_tree; b = nt.nodes.get('Principled BSDF')
t = nt.nodes.new('ShaderNodeTexImage'); t.image = img; nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
b.inputs['Roughness'].default_value = 0.62; b.inputs['Metallic'].default_value = 0.0
if 'Specular IOR Level' in b.inputs: b.inputs['Specular IOR Level'].default_value = 0.35
ME.data.materials.clear(); ME.data.materials.append(mat)
# report
vs = [v.co for v in ME.data.vertices]
size = [round(max(v[i] for v in vs) - min(v[i] for v in vs), 3) for i in range(3)]
tris = sum(len(p.vertices) - 2 for p in ME.data.polygons)
os.makedirs(os.path.dirname(out), exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_yup=True, export_skins=True, export_animations=False,
    export_image_format='JPEG', export_jpeg_quality=88, export_materials='EXPORT', export_apply=False, export_def_bones=True)
print('CONVERTED', out, 'tris', tris, 'size', size, 'scale', round(S, 4), 'withers', round(withers * S, 3), 'bones', len(A.data.bones))
for n in ['spine.004', 'spine.011', 'spine.012', 'front_thigh.L', 'thigh.L']:
    print('BONE', n, [round(v, 3) for v in A.data.bones[n].head_local])
