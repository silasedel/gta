# r2-water: Boat 10 (Mini Fan Airboat) -> public/assets/vehicles/boats/airboat.glb
# blender -b --disable-autoexec "<Boat 10.blend>" --python-exit-code 1 --python airboat_convert.py -- <prepped tex dir> <out.glb>
# - our own script only (the download ships none; auto-run stays off)
# - textures from airboat_tex.py (brand marks removed, 2048 color+cage alpha)
# - scale 1.2 (3.6 m -> 4.3 m, a real small airboat), origin: hull center, keel at y = 0, bow +Z in glTF
# - rigged parts: 'airprop' (pivot on the hub, spins about local Z), 'rudderL' / 'rudderR' (pivot on the hinge, turn about Y)
# - the wire fan cage gets its own 'cage' material (alpha-tested in the game); registration decal keeps 'decal'
import bpy, bmesh, sys, math, numpy as np
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
TEX, OUT = argv[0], argv[1]
SC, YC, ZB = 1.2, -0.0545, -0.429          # scale, hull length center (blender Y), keel bottom (blender Z)
HUB = Vector((0.0, 1.285, 0.467))          # prop hub (pre-transform)
RUD_Y = 1.600                               # rudder hinge line (pre-transform)
ob = [o for o in bpy.data.objects if o.type == 'MESH'][0]
for o in list(bpy.data.objects):
    if o is not ob: bpy.data.objects.remove(o)
bpy.context.view_layer.objects.active = ob; ob.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# ---------------- images -> prepped copies
def img(name, path, colorspace='sRGB'):
    im = bpy.data.images.get(name)
    im.filepath = path; im.reload(); im.colorspace_settings.name = colorspace; return im
img('Hull Color', f'{TEX}/airboat_col.png')
img('Hull Normal', f'{TEX}/airboat_nrm.png', 'Non-Color')
img('Hull Roughness', f'{TEX}/airboat_rgh.png', 'Non-Color')
img('Hull Metallic', f'{TEX}/airboat_mtl.png', 'Non-Color')
img('Registration Decal Color', f'{TEX}/airboat_reg.png')
for n in ('Hull Color', 'Hull Normal', 'Hull Roughness', 'Hull Metallic', 'Registration Decal Color'): bpy.data.images[n].name = 'airboat_' + n.split()[-1].lower() if n != 'Registration Decal Color' else 'airboat_reg'
hull = bpy.data.materials['Hull']; hull.name = 'hull'
dec = bpy.data.materials['Registration Decal']; dec.name = 'decal'
def link_alpha(m):
    nt = m.node_tree; bs = [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'][0]
    tex = [n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image and n.image.name in ('airboat_color', 'airboat_reg')][0]
    nt.links.new(tex.outputs['Alpha'], bs.inputs['Alpha'])
cage = hull.copy(); cage.name = 'cage'; link_alpha(cage); link_alpha(dec)
ob.data.materials.append(cage); CAGE = len(ob.data.materials) - 1
HULL = list(ob.data.materials).index(hull)

# ---------------- cage faces: UV centroid inside the wire-mesh region of the alpha (blurred alpha well between 0 and 1)
im = bpy.data.images['airboat_color']; W, H = im.size
px = np.empty(W * H * 4, dtype=np.float32); im.pixels.foreach_get(px); A = px.reshape(H, W, 4)[:, :, 3]
R = 12; ii = np.pad(A, ((1, 0), (1, 0))).cumsum(0).cumsum(1)
def boxmean(u, v):
    x = min(max(int(u * W), R), W - R - 1); y = min(max(int(v * H), R), H - R - 1)
    s = ii[y + R + 1, x + R + 1] - ii[y - R, x + R + 1] - ii[y + R + 1, x - R] + ii[y - R, x - R]
    return s / ((2 * R + 1) ** 2)
bm = bmesh.new(); bm.from_mesh(ob.data); uvl = bm.loops.layers.uv.active
nc = 0
for f in bm.faces:
    if f.material_index != HULL: continue
    u = sum(l[uvl].uv.x for l in f.loops) / len(f.loops); v = sum(l[uvl].uv.y for l in f.loops) / len(f.loops)
    m = boxmean(u % 1.0, v % 1.0)
    if 0.04 < m < 0.9: f.material_index = CAGE; nc += 1
print('cage faces', nc)

# ---------------- transform: center, keel at 0, scale
for v in bm.verts: v.co = Vector(((v.co.x) * SC, (v.co.y - YC) * SC, (v.co.z - ZB) * SC))
hub = Vector((HUB.x * SC, (HUB.y - YC) * SC, (HUB.z - ZB) * SC)); rudY = (RUD_Y - YC) * SC
# ---------------- loose parts -> prop / rudders
bm.verts.ensure_lookup_table(); seen = set(); groups = {'airprop': [], 'rudderL': [], 'rudderR': []}
y0, y1 = (1.245 - YC) * SC, (1.337 - YC) * SC
for v in bm.verts:
    if v.index in seen: continue
    st = [v]; comp = []; seen.add(v.index)
    while st:
        a = st.pop(); comp.append(a)
        for e in a.link_edges:
            b = e.other_vert(a)
            if b.index not in seen: seen.add(b.index); st.append(b)
    xs = [p.co.x for p in comp]; ys = [p.co.y for p in comp]; zs = [p.co.z for p in comp]
    if min(ys) >= y0 and max(ys) <= y1 and max(math.hypot(p.co.x - hub.x, p.co.z - hub.z) for p in comp) < 0.78 * SC: groups['airprop'] += comp
    elif len(comp) == 80 and min(ys) > (1.55 - YC) * SC and max(ys) > (1.9 - YC) * SC and 0.16 * SC < abs(sum(xs) / len(xs)) < 0.2 * SC:
        groups['rudderL' if sum(xs) > 0 else 'rudderR'] += comp
groups = {k: [v.index for v in vs] for k, vs in groups.items()}
print({k: len(v) for k, v in groups.items()})
bm.to_mesh(ob.data); bm.free(); ob.name = 'hull'; ob.data.name = 'hull'
# separate each group into its own object with a pivot origin (index sets taken once, before any deletion)
sets = {k: set(vs) for k, vs in groups.items() if vs}
def pivot_of(k):
    if k == 'airprop': return hub
    cs = [ob.data.vertices[i].co for i in sets[k]]
    return Vector(((min(c.x for c in cs) + max(c.x for c in cs)) / 2, rudY, (min(c.z for c in cs) + max(c.z for c in cs)) / 2))
pivots = {k: pivot_of(k).copy() for k in sets}
def keep_only(o, keep):
    b2 = bmesh.new(); b2.from_mesh(o.data); b2.verts.ensure_lookup_table()
    bmesh.ops.delete(b2, geom=[v for v in b2.verts if (v.index in keep) is False], context='VERTS'); b2.to_mesh(o.data); b2.free()
for k, sset in sets.items():
    n = ob.copy(); n.data = ob.data.copy(); n.name = k; n.data.name = k; bpy.context.scene.collection.objects.link(n)
    keep_only(n, sset)
    bpy.ops.object.select_all(action='DESELECT'); n.select_set(True); bpy.context.view_layer.objects.active = n
    bpy.context.scene.cursor.location = pivots[k]; bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
allg = set().union(*sets.values()) if sets else set()
keep_only(ob, set(range(len(ob.data.vertices))) - allg)
for o in bpy.data.objects: print('OUT', o.name, len(o.data.vertices), [round(x, 3) for x in o.location])
# hull bounds for the game
hb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
print('HULLBB', [round(min(p[i] for p in hb), 3) for i in range(3)], [round(max(p[i] for p in hb), 3) for i in range(3)])
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
    export_image_format='WEBP', export_image_quality=90, export_materials='EXPORT', export_animations=False, export_extras=False)
print('EXPORTED', OUT)
