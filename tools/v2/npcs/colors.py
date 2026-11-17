#!/usr/bin/env python3
# Far-crowd palette per person: skin / top / bottom / hair / shoes colors and sleeve / leg cover, read from the person's
# own albedo at the rig's T-pose sample points (rig_person.py writes <id>_probe.npy + _probe.json). The instanced far tier
# (src/npc/crowd.js) then draws the SAME people as the near crowd, just simplified.
#   python3 -I tools/v2/npcs/colors.py <probe dir> <texture dir of the id> <id>   -> prints JSON, writes <probe dir>/<id>_cols.json
import sys, os, json, glob
import numpy as np
from PIL import Image
pdir, tdir, pid = sys.argv[1], sys.argv[2], sys.argv[3]
P = np.load(os.path.join(pdir, pid + '_probe.npy'))
M = json.load(open(os.path.join(pdir, pid + '_probe.json')))
fs = glob.glob(os.path.join(tdir, '*'))
bc = next((f for k in ('basecolor', 'albedo', ' color.', 'color') for f in fs if k in os.path.basename(f).lower()), None)
im = np.asarray(Image.open(bc).convert('RGB').resize((1024, 1024)), dtype=np.float32) / 255.0
H, zArm, headZ = M['H'], M['zArm'], M['headZ']
x, y, z, u, v = P[:, 0], P[:, 1], P[:, 2], P[:, 3], P[:, 4]
px = np.clip((u % 1) * 1023, 0, 1023).astype(int); py = np.clip((1 - (v % 1)) * 1023, 0, 1023).astype(int)
C = im[py, px]
def med(mask):
    q = C[mask]
    return np.median(q, axis=0) if len(q) > 3 else None
def hexc(c): return int(round(c[0] * 255)) << 16 | int(round(c[1] * 255)) << 8 | int(round(c[2] * 255)) if c is not None else None
dist = lambda a, b: float(np.linalg.norm(a - b)) if a is not None and b is not None else 9
sh, wr = np.mean(M['sh']), np.mean(M['wrist'])
# skin from the hands (nearly always bare), falling back to the cheeks
skin = med((np.abs(x) > wr + 0.025 * H) & (z > 0.6 * H))
if skin is None: skin = med((z > headZ - 0.03 * H) & (z < headZ + 0.02 * H) & (y < np.percentile(y[(z > headZ - 0.03 * H) & (z < headZ + 0.02 * H)], 30)) & (np.abs(x) < 0.03 * H))
top = med((z > 0.62 * H) & (z < 0.74 * H) & (np.abs(x) < 0.09 * H) & (y < 0))
bottom = med((z > 0.33 * H) & (z < 0.42 * H))
hair = med(z > H - 0.035 * H)
shoes = med(z < 0.025 * H)
# sleeve: walk from the shoulder to the wrist, the first stretch that matches the skin ends the sleeve
sleeve = 1.0
for k in range(10):
    d = sh + (wr - sh) * (k + 0.5) / 10
    c = med((np.abs(np.abs(x) - d) < 0.012 * H) & (z > 0.6 * H))
    if c is not None and skin is not None and dist(c, skin) < 0.14: sleeve = k / 10; break
torso_skin = top is not None and skin is not None and dist(top, skin) < 0.08 and sleeve == 0
if torso_skin: sleeve = -1
elif sleeve < 0.1: sleeve = 0.0
leg = 1.0
cr = M['crotch']
for k in range(12):
    zz = cr - (cr - 0.06 * H) * (k + 0.5) / 12
    c = med((np.abs(z - zz) < 0.01 * H) & (np.abs(x) > 0.01 * H))
    if c is not None and skin is not None and dist(c, skin) < 0.14: leg = max(0.1, k / 12); break
out = {'skin': hexc(skin), 'top': hexc(top), 'bottom': hexc(bottom), 'hair': hexc(hair), 'shoes': hexc(shoes), 'sleeve': round(sleeve, 2), 'leg': round(leg, 2), 'hat': M.get('hat', 0) > 0.02}
json.dump(out, open(os.path.join(pdir, pid + '_cols.json'), 'w'))
print(pid, json.dumps({k: (hex(v) if isinstance(v, int) and k not in ('sleeve', 'leg') else v) for k, v in out.items()}))
