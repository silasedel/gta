# Palm roll survey (r3-people): the game's clips assume the canonical T-pose with palms DOWN (thumb forward). Some of the
# user's Tripo people were generated with raised, palms-forward arms; the rigger straightened the arms onto +-X but kept
# the roll, so their forearm / hand mesh is supinated: hanging arms show the palms forward and the elbow bend reads as
# "arms out". Measures per side, in the plane across the arm (X = along the arm):
#   thumb: angle of (thumb-vertex centroid - hand centroid) from the forward direction (0 = palm down, +90 = thumb up)
#   flat:  minor axis of the hand vertices (palm normal) from vertical (0 = palm down / up, 90 = palm forward / back)
# Usage: blender -b -P palm_survey.py -- <out.json> <glb>...
import bpy, sys, json, math, os
import numpy as np
args = sys.argv[sys.argv.index('--') + 1:]
out, files = args[0], args[1:]
res = {}
for path in files:
    pid = os.path.basename(path)[:-4]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try: bpy.ops.import_scene.gltf(filepath=path)
    except Exception as e: print('FAIL', pid, e); continue
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    me = max(meshes, key=lambda o: len(o.data.vertices))
    gi = {g.index: g.name.replace('mixamorig:', '') for g in me.vertex_groups}
    mw = me.matrix_world
    pts = {}
    for v in me.data.vertices:
        if not v.groups: continue
        g = max(v.groups, key=lambda x: x.weight)
        if g.weight < 0.5: continue
        n = gi.get(g.group, '')
        for S in ('Left', 'Right'):
            if n.startswith(S + 'Hand'):
                w = mw @ v.co
                pts.setdefault(S + ('Thumb' if 'Thumb' in n else 'Hand'), []).append((w.x, w.y, w.z))
                if 'Thumb' not in n and n != S + 'Hand': pts.setdefault(S + 'Fing', []).append((w.x, w.y, w.z))
            if n == S + 'ForeArm':
                w = mw @ v.co; pts.setdefault(S + 'Fore', []).append((w.x, w.y, w.z))
    r = {}
    for S in ('Left', 'Right'):
        H = np.array(pts.get(S + 'Hand', []) + pts.get(S + 'Thumb', []) + pts.get(S + 'Fing', []))
        T = np.array(pts.get(S + 'Thumb', []))
        if len(H) < 10 or len(T) < 3: continue
        c = H.mean(0); t = T.mean(0) - c
        # Blender Z-up, character faces -Y: forward = -Y, up = +Z
        thumb = math.degrees(math.atan2(t[2], -t[1]))
        q = H[:, 1:] - H[:, 1:].mean(0); w, V = np.linalg.eigh(q.T @ q / len(q)); mn = V[:, 0]   # minor axis in (y, z)
        flat = math.degrees(math.atan2(abs(mn[0]), abs(mn[1])))   # 0 = normal vertical (palm down), 90 = normal horizontal
        r[S[0]] = {'thumb': round(thumb, 1), 'flat': round(flat, 1), 'ratio': round(float(w[0] / max(w[1], 1e-9)), 3)}
    res[pid] = r
    print('PALM', pid, json.dumps(r), flush=True)
json.dump(res, open(out, 'w'), indent=1)
