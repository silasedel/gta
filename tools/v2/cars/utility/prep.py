# Utility vehicles (crew UTV, sport ATV, single-seat UTV, golf cart, baggage cart): clean the user's downloaded sources before the
# shared car converter (tools/v2/cars/convert.py).
#   blender -b --factory-startup -P tools/v2/cars/utility/prep.py -- <key> <src> <out.blend>
# What it does:
#   - strips the maker's lettering from the textures that carry it (speedometer faces, seat print, the golf cart's decal sheets),
#     so nothing branded survives even where the converter samples texture colors into the mesh; badge / decal meshes are
#     dropped by the converter (cars.json dropMat / dropObj)
#   - bagcart1 (an OBJ without its .mtl): links the cart's texture into its material
import bpy, sys, os, re
import numpy as np

a = sys.argv[sys.argv.index('--') + 1:]
KEY, SRC, OUT = a[0], a[1], a[2]


def log(*x):
    print('[prep]', KEY, *x, flush=True)


if SRC.lower().endswith('.obj'):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.obj_import(filepath=SRC)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=SRC)


def base_image(m):
    """the image feeding the material's Base Color (glTF import: Image Texture -> Principled), or None"""
    if not m or not m.use_nodes:
        return None
    b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not b or not b.inputs['Base Color'].links:
        return None
    n = b.inputs['Base Color'].links[0].from_node
    for _ in range(4):
        if n.type == 'TEX_IMAGE':
            return n.image
        nxt = next((i for i in n.inputs if i.links), None)
        if not nxt:
            return None
        n = nxt.links[0].from_node
    return None


def emissive_image(m):
    b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if m and m.use_nodes else None
    inp = b.inputs.get('Emission Color') if b else None
    if not inp or not inp.links:
        return None
    n = inp.links[0].from_node
    return n.image if n.type == 'TEX_IMAGE' else None


def blank(im, boxes, color=None):
    """paint boxes (x0, y0, x1, y1 as fractions, y from the TOP of the image) with a flat color; color None = the median of
    a thin ring just outside the box (the panel color the lettering sits on)"""
    w, h = im.size
    px = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    for x0, y0, x1, y1 in boxes:
        c0, c1 = int(x0 * w), int(np.ceil(x1 * w))
        r0, r1 = h - int(np.ceil(y1 * h)), h - int(y0 * h)   # Blender rows run bottom -> top
        if color is None:
            g = max(2, int(0.01 * w))
            ring = np.concatenate([
                px[max(0, r0 - g):r0, c0:c1].reshape(-1, 4), px[r1:r1 + g, c0:c1].reshape(-1, 4),
                px[r0:r1, max(0, c0 - g):c0].reshape(-1, 4), px[r0:r1, c1:c1 + g].reshape(-1, 4)])
            col = np.median(ring, axis=0) if len(ring) else np.array([0, 0, 0, 1])
        else:
            col = np.array(list(color) + [1.0])[:4]
        px[r0:r1, c0:c1] = col
    im.pixels.foreach_set(px.ravel())
    im.update()
    im.pack()
    log('blanked', im.name, len(boxes), 'boxes')


# lettering boxes per material (regex on the source material name)
DIAL = [(0.36, 0.16, 0.76, 0.28), (0.42, 0.34, 0.6, 0.45), (0.44, 0.84, 0.6, 0.98)]   # maker name, gauge maker, star logo
BLANK = {
    'utv1': {r'^Speedometer': DIAL},
    'atv1': {r'^Speedometer': DIAL},
    'utv2': {r'^SPSeat': [(0.32, 0.57, 0.48, 0.71)]},   # the model name printed on the seat
    # decal sheets: top row = warnings + maker logo + model name, bottom row = trim-level scripts (the lamp art in between stays)
    'golf1': {r'^ClubCar_02$': [(0, 0, 1, 0.25), (0, 0.75, 1, 1)], r'^ClubCar_14$': [(0, 0, 1, 0.25), (0, 0.75, 1, 1)],
              r'^ClubCar_25$': [(0.03, 0.28, 0.97, 0.72)]},   # maker logo on the seat-back sheet
}
DARK = {'golf1': (0.01, 0.01, 0.01)}   # the golf cart's sheets are black behind the lettering
done = set()
for m in bpy.data.materials:
    for rx_, boxes in BLANK.get(KEY, {}).items():
        if not re.search(rx_, m.name):
            continue
        for im in (base_image(m), emissive_image(m)):
            if im is None or im.name in done:
                continue
            done.add(im.name)
            blank(im, boxes, DARK.get(KEY))

if KEY == 'bagcart1':
    # the OBJ ships without its .mtl: the cart's one texture sits in ../textures
    tex = os.path.join(os.path.dirname(SRC), '..', 'textures', 'airport_baggage_cart.tga.png')
    im = bpy.data.images.load(os.path.abspath(tex))
    im.pack()
    for m in bpy.data.materials:
        m.use_nodes = True
        nt = m.node_tree
        b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if b is None:
            continue
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = im
        nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
        b.inputs['Roughness'].default_value = 0.6
        b.inputs['Metallic'].default_value = 0.0
        log('linked texture', m.name)

for im in bpy.data.images:   # pack what exists (the converter samples textures)
    try:
        if im.source == 'FILE' and not im.packed_file and im.has_data:
            im.pack()
    except Exception:
        log('no pack', im.name)
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True, relative_remap=True)
log('saved', OUT)
