#!/usr/bin/env python3
"""Stage only the hunks of a shared file that match a marker regex (several helpers edit the same files at once).
  python3 tools/v2/roads/stage_hunks.py <file> '<regex>' [--dry]
Uses `git diff -U0`, keeps hunks with at least one +/- line matching the regex, applies them to the index (--unidiff-zero)."""
import re
import subprocess
import sys

f, rx = sys.argv[1], re.compile(sys.argv[2])
dry = '--dry' in sys.argv
d = subprocess.run(['git', 'diff', '-U0', '--', f], capture_output=True, text=True, check=True).stdout
lines = d.split('\n')
head, hunks, cur = [], [], None
for ln in lines:
    if ln.startswith('@@'):
        cur = [ln]; hunks.append(cur)
    elif cur is None:
        head.append(ln)
    else:
        cur.append(ln)
keep = [h for h in hunks if any(rx.search(x) for x in h[1:] if x[:1] in '+-')]
print(f'{f}: {len(keep)} of {len(hunks)} hunks match')
if not keep or dry:
    sys.exit(0)
patch = '\n'.join(head + [x for h in keep for x in h]) + '\n'
r = subprocess.run(['git', 'apply', '--cached', '--unidiff-zero', '-'], input=patch, text=True, capture_output=True)
if r.returncode:
    print(r.stderr); sys.exit(1)
