# Stage only my hunks of a file other helpers also edit (git add -p without the prompt).
#   python3 -P tools/v2/street-models/stage_hunks.py <file> <regex> [--dry]
# Diffs the working file against the version in the (private) index with a plain no-index diff (fast: no index refresh),
# keeps every -U0 hunk whose added or removed lines match <regex> and applies them with git apply --cached.
import re, subprocess, sys, tempfile, os
f, rx = sys.argv[1], re.compile(sys.argv[2]); dry = '--dry' in sys.argv
old = subprocess.run(['git', 'show', ':' + f], capture_output=True).stdout
with tempfile.NamedTemporaryFile(delete=False) as t: t.write(old); tp = t.name
d = subprocess.run(['git', 'diff', '--no-index', '-U0', '--', tp, f], capture_output=True, text=True).stdout
os.unlink(tp)
head, hunks, cur = [], [], None
for line in d.split('\n'):
    if line.startswith('@@'): cur = [line]; hunks.append(cur)
    elif cur is None: head.append(line)
    else: cur.append(line)
head = [f'diff --git a/{f} b/{f}', f'--- a/{f}', f'+++ b/{f}']
keep = [h for h in hunks if any(rx.search(l) for l in h[1:] if l[:1] in '+-')]
print(f'{f}: {len(keep)}/{len(hunks)} hunks')
if dry:
    for h in hunks: print(('KEEP ' if h in keep else 'SKIP ') + h[0], '|', (h[1] if len(h) > 1 else '')[:140])
    sys.exit(0)
if not keep: sys.exit(0)
patch = '\n'.join(head + [l for h in keep for l in h if l != '\\ No newline at end of file' or True]) + '\n'
r = subprocess.run(['git', 'apply', '--cached', '--unidiff-zero', '-'], input=patch, capture_output=True, text=True)
print(r.stdout, r.stderr)
