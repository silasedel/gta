import json, glob, os, subprocess, sys, shutil
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(dst, 'tex'), exist_ok=True)
done = {}
def conv(path, alpha, size, normal=False):
    if not path or not os.path.exists(path):
        return None
    base = os.path.splitext(os.path.basename(path))[0].replace(' ', '_')
    ext = 'png' if alpha else 'jpg'
    name = f"{base}.{ext}"
    if name in done: return done[name]
    out = os.path.join(dst, 'tex', name)
    args = ['sips', '-Z', str(size)]
    if not alpha: args += ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82']
    else: args += ['-s', 'format', 'png']
    subprocess.run(args + [path, '--out', out], check=True, capture_output=True)
    done[name] = 'tex/' + name
    return done[name]
def kind_of(mat):
    n = mat.lower()
    if 'body' in n: return 'skin'
    if 'garment_' in n: return 'garment'
    if 'eyebrow' in n: return 'brow'
    if 'eyelash' in n: return 'lash'
    if 'low-poly' in n or 'high-poly' in n: return 'eye'
    if any(h in n for h in ('short0', 'bob0', 'long0', 'ponytail', 'braid', 'afro')): return 'hair'
    if 'shoes' in n: return 'shoes'
    if 'fedora' in n: return 'hat'
    return 'cloth'
people = []
for f in sorted(glob.glob(os.path.join(src, '*.json'))):
    d = json.load(open(f)); s = d['spec']
    mats = {}
    for mn, info in d['materials'].items():
        k = kind_of(mn)
        e = {'k': k, 'r': round(info.get('roughness', 0.6), 2)}
        dif = info.get('diffuse')
        if dif:
            alpha = k in ('hair', 'brow', 'lash')
            size = {'skin': 1024, 'hair': 1024, 'brow': 256, 'lash': 256, 'eye': 256, 'shoes': 512, 'hat': 512, 'cloth': 1024}.get(k, 512)
            e['d'] = conv(dif, alpha, size)
            nrm = dif.replace('_diffuse', '_normal')
            if nrm != dif and os.path.exists(nrm) and k in ('cloth', 'shoes', 'hat', 'hair'):
                e['n'] = conv(nrm, False, 512)
        mats[mn] = e
    shutil.copy(os.path.join(src, d['file']), os.path.join(dst, d['file']))
    people.append({'id': d['id'], 'file': d['file'], 'zone': s.get('zone'), 'gender': s.get('gender'), 'years': s.get('years'), 'race': s.get('race'),
                   'hmacro': s['macro'].get('height', 0.5), 'height': round(d['height'], 3), 'hair': s.get('hair'), 'clothes': s.get('clothes'),
                   'shells': [x['type'] for x in s.get('shells', [])], 'materials': mats})
json.dump({'version': 1, 'people': people}, open(os.path.join(dst, 'humans.json'), 'w'), separators=(',', ':'))
print(len(people), 'people', len(done), 'textures')
