# Mari's underarm texture fix, step 1 (Blender, on the rigged T-pose blend): the faces of her inner upper arms and
# armpits. Her scan stood arms down, so the albedo has the arm-against-body shadow baked into the inner arm; raised to
# the T-pose (and swinging in game) that shows as a dark smear. Writes the UV triangles of those faces (inner arm:
# arm-weighted faces facing down in the T-pose; armpit: anything within ARMPIT_R of the armpit point; the chest side
# under the armpit) plus reference
# triangles (outer upper arm skin) as JSON for underarm_fix.py.
#   blender -b <mari.blend> --python-exit-code 1 -P tools/v2/player/underarm.py -- <out.json>
import bpy
import json
import sys

out = sys.argv[sys.argv.index('--') + 1 :][0]
ob = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('LOD0'))
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
me = ob.data
uv = me.uv_layers.active.data
arm_groups = {
    g.index
    for g in ob.vertex_groups
    if any(k in g.name for k in ('LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'))
}
arm_w = [sum(e.weight for e in v.groups if e.group in arm_groups) for v in me.vertices]
pits = []
for side in ('Left', 'Right'):
    b = rig.data.bones.get('mixamorig:' + side + 'Arm')
    if b:
        h = rig.matrix_world @ b.head_local
        pits.append((h.x * 0.92, h.y + 0.01, h.z - 0.07))
ARMPIT_R = 0.11
M = ob.matrix_world
fix, ref = [], []
for p in me.polygons:
    w = sum(arm_w[i] for i in p.vertices) / len(p.vertices)
    c = M @ p.center
    n = (M.to_3x3() @ p.normal).normalized()
    near_pit = any(((c.x - q[0]) ** 2 + (c.y - q[1]) ** 2 + (c.z - q[2]) ** 2) ** 0.5 < ARMPIT_R for q in pits)
    tri = [list(uv[li].uv) for li in p.loop_indices]
    # the side of the chest under each armpit (it was covered by the arm in the scan, so it is shadowed too)
    flank = any(
        w < 0.35 and abs(n.x) > 0.55 and q[2] - 0.2 < c.z < q[2] + 0.03 and abs(c.x) > abs(q[0]) * 0.55
        and abs(c.y - q[1]) < 0.09 and c.x * q[0] > 0
        for q in pits
    )
    if (w > 0.35 and n.z < -0.2) or near_pit or flank:
        fix.append(tri)
    elif w > 0.8 and n.z > 0.35:
        ref.append(tri)
json.dump({'fix': fix, 'ref': ref}, open(out, 'w'))
print('[underarm] faces fix', len(fix), 'ref', len(ref))
