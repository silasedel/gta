# Fit hit-zone / ragdoll capsules to the rigged hero mesh (rest T-pose): for every limb segment (bone A -> bone B) take
# the vertices that mostly belong to that limb and measure their distance from the segment; radius = 85th percentile
# (the capsule hugs the body, loose cloth sticks out a little). Head: center / radius / top relative to the Head joint.
# Writes JSON (meters, Blender Z-up rest pose; also as fractions of body height for other characters).
#   blender -b <rig.blend> --python-exit-code 1 -P tools/v2/player/measure.py -- <out.json>
import bpy, sys, json
import numpy as np
out = sys.argv[sys.argv.index('--') + 1:][0]
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
ob = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('LOD0'))
J = {b.name.replace('mixamorig:', ''): np.array(rig.matrix_world @ b.head_local) for b in rig.data.bones}
gname = {g.index: g.name.replace('mixamorig:', '') for g in ob.vertex_groups}
P = np.array([ob.matrix_world @ v.co for v in ob.data.vertices])
dom = []
for v in ob.data.vertices:
    best = max(v.groups, key=lambda g: g.weight, default=None)
    dom.append(gname.get(best.group) if best else None)
dom = np.array(dom, dtype=object)
HT = P[:, 2].max()
LIMBS = {   # key: (A, B, bones whose vertices belong to it)
    'neck': ('Neck', 'Head', ['Neck']),
    'torso_upper': ('Spine2', 'Neck', ['Spine2', 'LeftShoulder', 'RightShoulder']),
    'torso_lower': ('Hips', 'Spine2', ['Hips', 'Spine', 'Spine1']),
    'upperarm_l': ('LeftArm', 'LeftForeArm', ['LeftArm']), 'forearm_l': ('LeftForeArm', 'LeftHand', ['LeftForeArm']),
    'upperarm_r': ('RightArm', 'RightForeArm', ['RightArm']), 'forearm_r': ('RightForeArm', 'RightHand', ['RightForeArm']),
    'thigh_l': ('LeftUpLeg', 'LeftLeg', ['LeftUpLeg']), 'shin_l': ('LeftLeg', 'LeftFoot', ['LeftLeg']),
    'thigh_r': ('RightUpLeg', 'RightLeg', ['RightUpLeg']), 'shin_r': ('RightLeg', 'RightFoot', ['RightLeg']),
    'hand_l': ('LeftHand', None, ['LeftHand']), 'hand_r': ('RightHand', None, ['RightHand']),
    'foot_l': ('LeftFoot', 'LeftToeBase', ['LeftFoot', 'LeftToeBase']), 'foot_r': ('RightFoot', 'RightToeBase', ['RightFoot', 'RightToeBase']),
}
res = {'height': float(HT), 'limbs': {}}
def segdist(p, a, b):
    ab = b - a; t = np.clip(((p - a) @ ab) / max(1e-9, ab @ ab), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1), t
for k, (A, B, bones) in LIMBS.items():
    m = np.isin(dom, bones); q = P[m]
    if not len(q): continue
    if B is None:      # hand: center + radius of the vertex cloud
        c = q.mean(0); r = np.percentile(np.linalg.norm(q - c, axis=1), 85)
        res['limbs'][k] = {'a': A, 'center_off': (c - J[A]).round(4).tolist(), 'r': round(float(r), 4), 'n': int(len(q))}; continue
    d, t = segdist(q, J[A], J[B])
    inner = (t > 0.05) & (t < 0.95)
    r = float(np.percentile(d[inner] if inner.sum() > 20 else d, 85))
    res['limbs'][k] = {'a': A, 'b': B, 'r': round(r, 4), 'r_h': round(r / HT, 5), 'len': round(float(np.linalg.norm(J[B] - J[A])), 4), 'n': int(len(q))}
# head: everything above the neck joint that belongs to the head
hq = P[(dom == 'Head')]
top = hq[:, 2].max(); bot = hq[:, 2].min(); front = hq[:, 1].min(); back = hq[:, 1].max()
c = np.array([(hq[:, 0].max() + hq[:, 0].min()) / 2, (front + back) / 2, (top + bot) / 2])
r = float(np.percentile(np.linalg.norm(hq - c, axis=1), 90))
res['head'] = {'joint': J['Head'].round(4).tolist(), 'top': round(float(top), 4), 'chin': round(float(bot), 4), 'center_off': (c - J['Head']).round(4).tolist(),
               'r': round(r, 4), 'r_h': round(r / HT, 5), 'depth': round(float(back - front), 4), 'width': round(float(hq[:, 0].max() - hq[:, 0].min()), 4)}
# body width / depth for the player capsule (arms down): torso + upper arms at shoulder height, hips
sh = P[(np.abs(P[:, 2] - J['LeftArm'][2]) < 0.03) & (np.abs(P[:, 0]) < 0.3)]
res['body'] = {'shoulderHalfWidth': round(float(np.abs(sh[:, 0]).max()), 4), 'chestDepth': round(float(sh[:, 1].max() - sh[:, 1].min()), 4),
               'joints': {k: np.round(v, 4).tolist() for k, v in J.items() if 'Hand' not in k or k.endswith('Hand')}}
json.dump(res, open(out, "w"), indent=1, default=float)
print('[measure]', json.dumps({k: v['r'] for k, v in res['limbs'].items()}), 'head', res['head'])
