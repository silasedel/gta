# ute1 wheel parts: a downloaded 5-spoke rim (barrel = 'Torus', spokes = 'Cylinder') + one tyre of a downloaded wheel set,
# fitted to the ute's wheel frame and saved as one mesh 'wheel' for build_ute1.py (wheel_bm()).
#   frame: axle along X, rim face (spokes / hub) toward +X, tyre outer radius WR, tyre width 2*HW, centred on the origin
#   materials (slot names): U_Tire, U_Rim, U_Drum (dark disc behind the spokes so the empty arch never shows through)
# blender -b --factory-startup --disable-autoexec -P tools/v2/cars/ute1/prep_wheel.py -- <rim2.blend> <tyre.fbx> <wheel_parts.blend>
import bpy, bmesh, sys, math
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
RIM, TYRE, OUT = argv[:3]
WR, HW = 0.322, 0.12                     # tyre outer radius, half width (build_ute1.py then scales by WK / WKX)
TYRE_OBJ = 'tyre rubber.003'
TRIS = {'tyre': 6000, 'barrel': 3500, 'spokes': 4500}
SPOKE_OUT = 0.035                        # push the spoke star outboard (the source dish is very deep)
LOG = lambda *a: print('[wheel]', *a)

bpy.ops.wm.read_factory_settings(use_empty=True)
with bpy.data.libraries.load(RIM, link=False) as (src, dst): dst.objects = ['Cylinder', 'Torus']
for o in dst.objects: bpy.context.scene.collection.objects.link(o); o.matrix_world = Matrix.Identity(4)
bpy.ops.import_scene.fbx(filepath=TYRE)
for o in list(bpy.data.objects):
    if o.name not in ('Cylinder', 'Torus', TYRE_OBJ): bpy.data.objects.remove(o, do_unlink=True)
dg = bpy.context.evaluated_depsgraph_get()

def ev_bm(name):    # evaluated mesh (modifiers applied) in object-local space
    o = bpy.data.objects[name]; bm = bmesh.new(); bm.from_mesh(o.evaluated_get(dg).to_mesh()); return bm
def islands(bm):
    seen, out = set(), []
    for v in bm.verts:
        if v in seen: continue
        st, isl = [v], []; seen.add(v)
        while st:
            x = st.pop(); isl.append(x)
            for e in x.link_edges:
                y = e.other_vert(x)
                if y not in seen: seen.add(y); st.append(y)
        out.append(isl)
    return out
def decimate(bm, n):
    me = bpy.data.meshes.new('t'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('t', me); bpy.context.scene.collection.objects.link(o)
    me.calc_loop_triangles(); t0 = len(me.loop_triangles)
    if t0 > n:
        d = o.modifiers.new('d', 'DECIMATE'); d.ratio = n / t0; d.use_collapse_triangulate = True
    bm2 = bmesh.new(); bm2.from_mesh(o.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh())
    bpy.data.objects.remove(o, do_unlink=True); return bm2
def rad(v): return math.hypot(v.co.y, v.co.z)
# local axis Z -> wheel X (cyclic swap, keeps handedness so normals stay outward): (x, y, z) -> (z, x, y)
SWAP = Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))

# ---- tyre: centre on its own axis (local Z), scale to WR / HW
tb = ev_bm(TYRE_OBJ)
lo = Vector([min(v.co[i] for v in tb.verts) for i in range(3)]); hi = Vector([max(v.co[i] for v in tb.verts) for i in range(3)])
c = (lo + hi) / 2; r0 = ((hi.x - lo.x) + (hi.y - lo.y)) / 4; h0 = (hi.z - lo.z) / 2
bmesh.ops.transform(tb, matrix=Matrix.Diagonal((WR / r0, WR / r0, HW / h0, 1)) @ Matrix.Translation(-c), verts=tb.verts)
bmesh.ops.transform(tb, matrix=SWAP, verts=tb.verts)
bead_r = min(rad(v) for v in tb.verts)
bead_x = max(abs(v.co.x) for v in tb.verts if rad(v) < bead_r + 0.004)
LOG('tyre src r %.3f hw %.3f -> bead r %.3f x %.3f' % (r0, h0, bead_r, bead_x))
for f in tb.faces: f.material_index = 0
tb = decimate(tb, TRIS['tyre'])

# ---- rim: barrel = Torus (centred on the origin, axis Z, face +Z); spokes = Cylinder minus the cut-off tip islands
bb = ev_bm('Torus')
R_lip = max(math.hypot(v.co.x, v.co.y) for v in bb.verts); Z_lip = max(abs(v.co.z) for v in bb.verts)
ks = (bead_r + 0.004) / R_lip            # lip just over the bead seat, resting against the sidewall
ka = (bead_x + 0.002) / Z_lip
RM = SWAP @ Matrix.Diagonal((ks, ks, ka, 1))
bmesh.ops.transform(bb, matrix=RM, verts=bb.verts)
for f in bb.faces: f.material_index = 1
bb = decimate(bb, TRIS['barrel'])
sb = ev_bm('Cylinder')
isl = islands(sb); big = max(isl, key=len)
bmesh.ops.delete(sb, geom=[v for i in isl if i is not big for v in i], context='VERTS')
bmesh.ops.transform(sb, matrix=Matrix.Translation((SPOKE_OUT, 0, 0)) @ RM, verts=sb.verts)
for f in sb.faces: f.material_index = 1
sb = decimate(sb, TRIS['spokes'])
hub_back = min(v.co.x for v in sb.verts if rad(v) < 0.04)
barrel_in = min(rad(v) for v in bb.verts if abs(v.co.x - hub_back) < 0.03) if any(abs(v.co.x - hub_back) < 0.03 for v in bb.verts) \
    else min(rad(v) for v in bb.verts)
LOG('rim lip r %.3f x %.3f; spokes x %.3f..%.3f; hub back %.3f; barrel inner r %.3f' % (
    R_lip * ks, Z_lip * ka, min(v.co.x for v in sb.verts), max(v.co.x for v in sb.verts), hub_back, barrel_in))

# ---- join + drum disc (faces +X) just behind the hub; it runs into the barrel wall (the overlap hides inside the tyre)
W = bmesh.new()
for part in (tb, bb, sb):
    me = bpy.data.meshes.new('p'); part.to_mesh(me); part.free(); W.from_mesh(me)
N = 48; xd = hub_back - 0.012; rd = bead_r - 0.003
ctr = W.verts.new((xd, 0, 0)); ring = [W.verts.new((xd, rd * math.cos(2 * math.pi * i / N), rd * math.sin(2 * math.pi * i / N))) for i in range(N)]
for i in range(N):
    f = W.faces.new((ctr, ring[i], ring[(i + 1) % N])); f.material_index = 2
    if f.normal.x < 0: f.normal_flip()
# ---- save
me = bpy.data.meshes.new('wheel'); W.to_mesh(me); W.free()
for n in ('U_Tire', 'U_Rim', 'U_Drum'): me.materials.append(bpy.data.materials.new(n))
for p in me.polygons: p.use_smooth = True
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
o = bpy.data.objects.new('wheel', me); bpy.context.scene.collection.objects.link(o)
me.calc_loop_triangles()
cnt = {}
for t in me.loop_triangles: cnt[me.materials[t.material_index].name] = cnt.get(me.materials[t.material_index].name, 0) + 1
xs = [v.co.x for v in me.vertices]; LOG('wheel tris', len(me.loop_triangles), cnt, 'x %.3f..%.3f' % (min(xs), max(xs)),
    'r max %.3f' % max(math.hypot(v.co.y, v.co.z) for v in me.vertices))
for m in list(bpy.data.materials):
    if m.users == 0: bpy.data.materials.remove(m)
bpy.ops.wm.save_as_mainfile(filepath=OUT)
LOG('saved', OUT)
