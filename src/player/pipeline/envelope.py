# Port Solana V2 — cloth envelopes for Nico's garments (CHARACTER track).
#   python3 envelope.py <workdir with nico_mesh.npz>
# Woven cloth does not follow anatomy: it spans the spine groove, the cleft between the pecs, the armpit, the crease under
# the seat and the gap at the crotch. This voxelizes the body (5 mm), fills it, and takes a morphological closing of the
# solid with a ball of radius R (everything a ball of radius R cannot reach into becomes "body"). The signed distance to
# each closed solid is written to <workdir>/envelope.npz; garments.py projects the garment shells onto an offset of it.
import sys, os
import numpy as np
from scipy import ndimage as ndi

WORK = sys.argv[1]
d = np.load(os.path.join(WORK, "nico_mesh.npz"))
co = d["co"].astype(np.float64)
pf, pl = d["polys_flat"], d["poly_len"]
H = 0.005
lo = co.min(0) - 0.12
hi = co.max(0) + 0.12
shape = np.ceil((hi - lo) / H).astype(int) + 1
print("[env] grid", shape.tolist(), "voxels", int(np.prod(shape)))

# rasterize the surface: points on every triangle at <= H/2 spacing
tris = []
o = 0
for n in pl:
    p = pf[o:o + n]
    for k in range(1, n - 1):
        tris.append((p[0], p[k], p[k + 1]))
    o += n
tris = np.array(tris)
A, B, C = co[tris[:, 0]], co[tris[:, 1]], co[tris[:, 2]]
L = np.maximum(np.linalg.norm(B - A, axis=1), np.maximum(np.linalg.norm(C - A, axis=1), np.linalg.norm(C - B, axis=1)))
shell = np.zeros(shape, dtype=bool)
for steps in np.unique(np.ceil(L / (H * 0.5)).astype(int) + 1):
    sel = np.ceil(L / (H * 0.5)).astype(int) + 1 == steps
    a, b, c = A[sel], B[sel], C[sel]
    for i in range(steps + 1):
        for j in range(steps + 1 - i):
            u, v = i / steps, j / steps
            p = a + (b - a) * u + (c - a) * v
            ix = np.clip(np.round((p - lo) / H).astype(int), 0, shape - 1)
            shell[ix[:, 0], ix[:, 1], ix[:, 2]] = True
solid = ndi.binary_fill_holes(ndi.binary_dilation(shell, iterations=1))
print("[env] solid voxels", int(solid.sum()))


def closed_sdf(R, Ro=0.0):
    """signed distance (m, + outside) to the morphological closing of the body by a ball of radius R, then an opening
    by a ball of radius Ro (removes small bumps such as nipples that woven cloth would not show)"""
    dist_out = ndi.distance_transform_edt(~solid) * H
    dil = dist_out <= R
    dist_in = ndi.distance_transform_edt(dil) * H              # distance from inside the dilation to its outside
    closed = dist_in > R
    if Ro > 0:
        ero = ndi.distance_transform_edt(closed) * H > Ro
        closed = ndi.distance_transform_edt(~ero) * H <= Ro
    sd = ndi.distance_transform_edt(~closed) * H - ndi.distance_transform_edt(closed) * H
    return sd.astype(np.float32)


out = {"lo": lo, "H": np.array(H), "shape": shape}
for name, R, Ro in (("shirt", 0.045, 0.015), ("tee", 0.012, 0.008), ("pants", 0.03, 0.0)):
    out[name] = closed_sdf(R, Ro)
    print("[env]", name, "R", R)
np.savez_compressed(os.path.join(WORK, "envelope.npz"), **out)
print("[env] wrote", os.path.join(WORK, "envelope.npz"))
