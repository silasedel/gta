# Wardrobe region mask for the scanned Nico: which texels are the shirt (R), the pants (G) and the shoes (B), so other
# outfits can recolor the baked clothes (src/player/nicoTripo/outfit.js). Per-face labels from the albedo color plus the
# body height of the face, cleaned with neighbor votes on the mesh (the palm print inside the shirt joins the shirt),
# then rasterized into UV space and dilated over the seams.
#   blender -b <rig.blend> --python-exit-code 1 -P tools/v2/player/regions.py -- <albedo_1k.png> <out regions.npz> [<check dir>]
#   python3 tools/v2/player/regions_raster.py <regions.npz> <regions.webp>
import bpy, bmesh, sys, os, colorsys, math
import numpy as np
argv = sys.argv[sys.argv.index('--') + 1:]
ALB, OUT = argv[0], argv[1]
CHECK = argv[2] if len(argv) > 2 else None
ob = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('LOD0'))
img = bpy.data.images.load(ALB)
W, H = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)[..., :3]   # bottom-up rows, linear? -> treat as display
if img.colorspace_settings.name != 'sRGB':
    pass
me = ob.data
bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
uvl = bm.loops.layers.uv.active
Z = np.array([max(v.co.z for v in f.verts) for f in bm.faces]); Zmin = np.array([min(v.co.z for v in f.verts) for f in bm.faces])
HT = max(v.co.z for v in bm.verts)
def sample(u, v):
    x = min(W - 1, max(0, int(u * W))); y = min(H - 1, max(0, int(v * H)))
    return px[y, x]
lab = np.zeros(len(bm.faces), np.int8)   # 0 skin/other, 1 teal, 2 tan(print or skin), 3 white, 4 brown/dark
cols = np.zeros((len(bm.faces), 3), np.float32)
for f in bm.faces:
    uvs = [l[uvl].uv for l in f.loops]
    cu = sum(u.x for u in uvs) / len(uvs); cv = sum(u.y for u in uvs) / len(uvs)
    c = np.mean([sample(cu, cv)] + [sample(u.x * 0.6 + cu * 0.4, u.y * 0.6 + cv * 0.4) for u in uvs], axis=0)
    cols[f.index] = c
    h, s, v = colorsys.rgb_to_hsv(*[float(x) for x in c])
    hd = h * 360
    if 150 <= hd <= 215 and s > 0.18: lab[f.index] = 1
    elif s < 0.16 and v > 0.5: lab[f.index] = 3
    elif (15 <= hd <= 70 and v < 0.42) or v < 0.18: lab[f.index] = 4
    elif 8 <= hd <= 50: lab[f.index] = 2
    else: lab[f.index] = 0
# neighbor votes (face adjacency through edges), 2-ring
nb = [[e2.index for e in f.edges for e2 in e.link_faces if e2.index != f.index] for f in bm.faces]
shirt = (lab == 1) & (Z > 0.45 * HT)
for it in range(10):
    s2 = shirt.copy()
    for i in range(len(nb)):
        if shirt[i] or Z[i] < 0.45 * HT or lab[i] == 3: continue
        n = nb[i]
        if n and sum(shirt[j] for j in n) >= max(1, len(n) * 0.5) and lab[i] in (1, 2, 4, 0): s2[i] = True
    # drop isolated teal specks (on skin)
    for i in range(len(nb)):
        if s2[i] and nb[i] and sum(s2[j] for j in nb[i]) == 0: s2[i] = False
    shirt = s2
pants = (~shirt) & (lab == 4) & (Z < 0.62 * HT) & (Zmin > 0.035 * HT)
for it in range(6):
    p2 = pants.copy()
    for i in range(len(nb)):
        if pants[i] or shirt[i] or Z[i] > 0.62 * HT or Zmin[i] < 0.035 * HT: continue
        n = nb[i]
        if n and sum(pants[j] for j in n) >= len(n) * 0.5 and lab[i] in (2, 4, 0): p2[i] = True
    pants = p2
shoes = (~pants) & (~shirt) & (Z < 0.085 * HT)
# fill holes: connected components of unlabeled faces enclosed by one region (palm prints in the shirt, highlights /
# stitching in the pants) join that region. Skin (arms, neck V, head) components are large or touch other regions.
def fill(maxn):
    lab2 = np.where(shirt, 1, np.where(pants, 2, np.where(shoes, 3, 0)))
    seen = np.zeros(len(lab2), bool); sizes = []
    for i0 in range(len(lab2)):
        if seen[i0] or lab2[i0]: continue
        comp, st, touch = [], [i0], set(); seen[i0] = True
        while st:
            i = st.pop(); comp.append(i)
            for j in nb[i]:
                if lab2[j]: touch.add(int(lab2[j]))
                elif not seen[j]: seen[j] = True; st.append(j)
        sizes.append(len(comp))
        if len(comp) <= maxn and touch:
            cnt = {}
            for i in comp:
                for j in nb[i]:
                    if lab2[j]: cnt[int(lab2[j])] = cnt.get(int(lab2[j]), 0) + 1
            t = max(cnt, key=cnt.get)
            if t == 3: continue
            for i in comp:
                if t == 1: shirt[i] = True
                elif t == 2: pants[i] = True
    sizes.sort(reverse=True); print('[regions] unlabeled components (largest)', sizes[:12])
fill(2500)
# sleeves: print faces between the shoulder and the sleeve hem are shirt even where they touch the arm skin
X = np.array([sum(v.co.x for v in f.verts) / len(f.verts) for f in bm.faces])
for sd in (1, -1):
    tx = sd * X[shirt & (lab == 1) & (sd * X > 0.15)]
    hem = np.percentile(tx, 99.0) if len(tx) else 0.4
    m = (sd * X > 0.19) & (sd * X < hem - 0.004) & (Z > 0.7 * HT) & (lab != 3)
    shirt |= m
    print('[regions] sleeve hem', sd, round(float(hem), 3), int(m.sum()))
fill(2500)
print('[regions] faces', len(lab), 'shirt', int(shirt.sum()), 'pants', int(pants.sum()), 'shoes', int(shoes.sum()))
# hand the UV triangles + labels to regions_raster.py (Blender's Python has no PIL)
tri, kk = [], []
for f in bm.faces:
    k = 0 if shirt[f.index] else 1 if pants[f.index] else 2 if shoes[f.index] else -1
    if k < 0: continue
    uv = [(l[uvl].uv.x, l[uvl].uv.y) for l in f.loops]
    for j in range(1, len(uv) - 1): tri.append([uv[0], uv[j], uv[j + 1]]); kk.append(k)
np.savez_compressed(OUT, tri=np.array(tri, np.float32), k=np.array(kk, np.int8))
print('[regions] wrote', OUT)
if CHECK:
    os.makedirs(CHECK, exist_ok=True)
    # vertex-color check render: shirt red, pants green, shoes blue
    cl = me.color_attributes.new('reg', 'BYTE_COLOR', 'CORNER')
    for poly in me.polygons:
        c = (1, 0.1, 0.1, 1) if shirt[poly.index] else (0.1, 0.8, 0.1, 1) if pants[poly.index] else (0.1, 0.2, 1, 1) if shoes[poly.index] else (0.85, 0.75, 0.65, 1)
        for li in poly.loop_indices: cl.data[li].color = c
    for o in bpy.data.objects:
        if o.type == 'MESH': o.hide_render = o is not ob
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.color_type = 'VERTEX'
    sc.render.resolution_x = 600; sc.render.resolution_y = 800
    cd = bpy.data.cameras.new('c'); cd.type = 'ORTHO'; cd.ortho_scale = 2.1
    cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
    for nm, loc, rot in (('front', (0, -6, 0.95), (math.radians(90), 0, 0)), ('back', (0, 6, 0.95), (math.radians(90), 0, math.pi))):
        cam.location = loc; cam.rotation_euler = rot; sc.render.filepath = os.path.join(CHECK, 'regions_' + nm + '.png')
        bpy.ops.render.render(write_still=True)
