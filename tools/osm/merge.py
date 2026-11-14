#!/usr/bin/env python3
"""ONE command for the whole merge: real Miami (OSM cache) + tools/world/out/features.json (+ heights.bin)
-> one unified world in public/assets/miami/<build>/, audited, then published atomically.

    tools/osm/.venv/bin/python tools/osm/merge.py            # build, audit, publish only if every check passes
    tools/osm/.venv/bin/python tools/osm/merge.py --force    # publish even if a check fails (the report says which)
    tools/osm/.venv/bin/python tools/osm/merge.py --no-publish

World bounds come from features.json (`bounds`), nothing is hard-coded. Re-run whenever features.json changes.
The live build is whatever public/assets/miami/world.json points at; the running game is never left without data:
a failed build or audit leaves world.json untouched.
"""
import glob, json, os, shutil, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.abspath(os.path.join(HERE, '..', '..'))
ROOT = os.environ.get('MIAMI_OUT') or os.path.join(GAME, 'public', 'assets', 'miami')
WORK = os.environ.get('MIAMI_WORK') or os.path.join(HERE, 'cache', 'v2', 'work')
REPORT = os.path.join(GAME, 'docs', 'v2', 'reports', 'world-osm-audit.json')


def main():
    force, nopub = '--force' in sys.argv, '--no-publish' in sys.argv
    t0 = time.time()
    env = dict(os.environ, MIAMI_NO_PUBLISH='1')
    log = os.path.join(WORK, 'merge_build.log')
    os.makedirs(WORK, exist_ok=True)
    print('[merge] building (log:', log + ')', flush=True)
    with open(log, 'w') as f:
        r = subprocess.run([sys.executable, os.path.join(HERE, 'build.py')], env=env, stdout=f, stderr=subprocess.STDOUT)
    lines = open(log).read().splitlines()
    for ln in lines:
        if any(k in ln for k in ('ingest:', 'stitch:', 'roads:', 'merged land', 'terrain:', 'tiles ', 'Traceback', 'Error')):
            print('  ' + ln[:260])
    if r.returncode != 0:
        print('[merge] BUILD FAILED; the live world is unchanged.\n' + '\n'.join(lines[-12:]))
        return 2
    build = json.load(open(os.path.join(WORK, 'last_build.json')))['build']
    bdir = os.path.join(ROOT, build)
    # audit the staged build through the game's own loader
    stage = tempfile.mkdtemp(prefix='ps-world-stage-')
    os.symlink(bdir, os.path.join(stage, build))
    shutil.copyfile(os.path.join(bdir, 'manifest.json'), os.path.join(stage, 'world.json'))
    print('[merge] auditing', build, flush=True)
    a = subprocess.run(['node', os.path.join(HERE, 'audit.mjs'), '--root', stage, '--out', REPORT], capture_output=True, text=True, cwd=GAME)
    for ln in a.stdout.splitlines():
        if ln.startswith(('PASS', 'FAIL', 'ALL CHECKS', 'FAILED', 'regions')):
            print('  ' + ln[:230])
    shutil.rmtree(stage, ignore_errors=True)
    ok = a.returncode == 0
    if not ok:
        print(a.stderr[-800:])
    if nopub or (not ok and not force):
        print(f'[merge] NOT published ({"--no-publish" if nopub else "audit failed"}). Staged build: {bdir}\n'
              f'        To publish it by hand: copy {build}/manifest.json over world.json (write a temp file, then rename).')
        return 0 if nopub else 1
    man = json.load(open(os.path.join(bdir, 'manifest.json')))
    tmp = os.path.join(ROOT, 'world.json.tmp')
    with open(tmp, 'w') as f:
        json.dump(man, f, separators=(',', ':'))
    os.replace(tmp, os.path.join(ROOT, 'world.json'))
    shutil.copyfile(os.path.join(bdir, 'spots.json'), os.path.join(ROOT, 'spots.json.tmp'))
    os.replace(os.path.join(ROOT, 'spots.json.tmp'), os.path.join(ROOT, 'spots.json'))
    # keep the live build and the one before it (running games may still stream regions from it)
    olds = sorted(p for p in glob.glob(os.path.join(ROOT, 'b2*')) if os.path.isdir(p))
    for p in olds[:-2]:
        shutil.rmtree(p, ignore_errors=True)
    subprocess.run([sys.executable, os.path.join(HERE, 'preview_world.py')], stdout=subprocess.DEVNULL)
    print(f'[merge] PUBLISHED {build} in {time.time() - t0:.0f} s' + ('' if ok else ' (forced; see failed checks above)')
          + f'. Audit: {os.path.relpath(REPORT, GAME)}; preview: docs/v2/shots/world-osm/world_preview.png')
    return 0


if __name__ == '__main__':
    sys.exit(main())
