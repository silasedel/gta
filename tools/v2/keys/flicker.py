#!/usr/bin/env python3
# flicker.py base.png f1.png f2.png ... -> out.png : temporal std-dev heat map over the frames (a still camera must not crawl)
import sys
from PIL import Image
import numpy as np
out, ins = sys.argv[1], sys.argv[2:]
fr = np.stack([np.asarray(Image.open(p).convert('L'), dtype=np.float32) for p in ins])
sd = fr.std(0)
base = np.asarray(Image.open(ins[0]).convert('RGB'), dtype=np.float32) * 0.45
heat = np.clip(sd * 12, 0, 255)
base[..., 0] = np.clip(base[..., 0] + heat, 0, 255)
Image.fromarray(base.astype(np.uint8)).save(out)
print('mean std', round(float(sd.mean()), 3), 'p99', round(float(np.percentile(sd, 99)), 2), 'pixels>6', int((sd > 6).sum()))
