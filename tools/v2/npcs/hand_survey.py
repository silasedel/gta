# Hand survey (r2-people): which finger chain really carries the thumb on each rigged person. The rigger's lane split
# sometimes puts the thumb mesh in the "Index" lane (and the index in "Middle" ...), leaving the Thumb bones empty.
#   blender -b --python-exit-code 1 -P tools/v2/npcs/hand_survey.py -- <person.blend> <out.json>
# Writes { id, sides: { Left: { counts: {Index: n, ..., Thumb: n}, front: {...} }, ... }, thumbIndex: bool }
import bpy, sys, json
a = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.open_mainfile(filepath=a[0])
o = bpy.data.objects.get('LOD1_body') or bpy.data.objects.get('LOD0_body'); rig = bpy.data.objects['Armature']
names = {g.index: g.name.replace('mixamorig:', '') for g in o.vertex_groups}
J = {b.name.replace('mixamorig:', ''): rig.matrix_world @ b.head_local for b in rig.data.bones}
out = {'id': a[0].split('/')[-1].split('.')[0], 'sides': {}}
for S in ('Left', 'Right'):
    cnt = {f: 0 for f in ('Index', 'Middle', 'Ring', 'Pinky', 'Thumb')}; front = {f: 0.0 for f in cnt}; along = {f: 0.0 for f in cnt}
    hx = J[S + 'Hand'].x; sg = 1 if S == 'Left' else -1
    for v in o.data.vertices:
        if not v.groups: continue
        g = max(v.groups, key=lambda e: e.weight); n = names.get(g.group, '')
        if not n.startswith(S + 'Hand') or g.weight < 0.4: continue
        for f in cnt:
            if f in n:
                p = o.matrix_world @ v.co
                cnt[f] += 1; front[f] += -p.y; along[f] += (p.x - hx) * sg
    for f in cnt:
        if cnt[f]: front[f] = round(front[f] / cnt[f], 4); along[f] = round(along[f] / cnt[f], 4)
    out['sides'][S] = {'counts': cnt, 'front': front, 'along': along}
L = out['sides']['Left']['counts']; R = out['sides']['Right']['counts']
out['thumbIndex'] = (L['Thumb'] + R['Thumb']) < 0.25 * (L['Index'] + R['Index'])
json.dump(out, open(a[1], 'w'))
print('[survey]', json.dumps(out))
