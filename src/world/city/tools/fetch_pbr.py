#!/usr/bin/env python3
"""city-look: download CC0 PBR texture sets from Poly Haven (https://polyhaven.com, CC0) and repack them for the game.

  python3 -I src/world/city/tools/fetch_pbr.py <cache_dir> [name ...]

For each set it writes public/assets/city/pbr/<name>_col.jpg (albedo, sRGB), <name>_nrm.jpg (OpenGL normal) and
<name>_arm.jpg (R = ambient occlusion, G = roughness, B = metalness; the layout three.js reads for aoMap /
roughnessMap / metalnessMap), all 1024 px, plus pbr/manifest.json (source URLs for CREDITS.md).
Raw downloads stay in <cache_dir> (outside the repo); nothing downloaded is ever executed.
"""
import json, os, sys, urllib.request
from PIL import Image

SETS = {
    # walls
    'white_stucco': 'wall', 'white_rough_plaster': 'wall', 'painted_plaster_wall': 'wall', 'worn_plaster_wall': 'wall',
    'peeling_painted_wall': 'wall', 'concrete_wall_008': 'wall', 'precast_concrete_wall': 'wall', 'painted_brick': 'wall',
    'red_brick_03': 'wall', 'coral_stone_wall': 'wall', 'square_tiled_wall': 'wall', 'corrugated_iron': 'wall',
    'weathered_plank_siding': 'wall', 'concrete_block_wall': 'wall', 'exterior_wall_cladding': 'wall', 'marble_01': 'wall',
    'rectangular_facade_tiles': 'wall', 'white_planks_clean': 'wall', 'painted_metal_shutter': 'wall', 'container_side': 'wall',
    'yellow_plaster': 'wall', 'blue_plaster_weathered': 'wall', 'granite_tile': 'wall', 'concrete_panels': 'wall',
    # roofs
    'tarred_gravel': 'roof', 'clay_roof_tiles_02': 'roof', 'corrugated_iron_02': 'roof', 'ceramic_roof_01': 'roof',
    'grey_roof_tiles': 'roof', 'rusty_corrugated_iron': 'roof', 'painted_concrete': 'roof', 'gravel_concrete': 'roof',
    # ground
    'asphalt_04': 'ground', 'asphalt_06': 'ground', 'road_damaged': 'ground', 'clean_asphalt': 'ground', 'worn_asphalt': 'ground',
    'concrete_pavement': 'ground', 'cracked_concrete': 'ground', 'brick_pavement_02': 'ground', 'herringbone_pavement': 'ground',
    'terrazzo_tiles': 'ground', 'leafy_grass': 'ground', 'sparse_grass': 'ground', 'dirt': 'ground', 'gravel_floor': 'ground',
    'brown_mud': 'ground', 'forest_leaves_02': 'ground', 'hangar_concrete_floor': 'ground', 'coast_sand_05': 'ground',
    'concrete_pavers': 'ground', 'brushed_concrete': 'ground', 'damp_sand': 'ground', 'rocky_gravel': 'ground',
    'grass_path_2': 'ground', 'sandy_gravel': 'ground', 'forest_ground_04': 'ground', 'coral_gravel': 'ground',
    'asphalt_02': 'ground', 'concrete_floor_worn_001': 'ground', 'concrete_tiles_02': 'ground', 'coast_sand_01': 'ground',
    'aerial_grass_rock': 'ground', 'brown_planks_03': 'ground', 'weathered_planks': 'ground',
    # bark and misc
    'palm_bark': 'flora', 'palm_tree_bark': 'flora', 'bark_brown_02': 'flora', 'bark_willow': 'flora',
    'rusty_metal_02': 'misc', 'metal_plate': 'misc', 'green_metal_rust': 'misc', 'rusty_painted_metal': 'misc',
}

def get(url, dst):
    if os.path.exists(dst) and os.path.getsize(dst) > 1000:
        return
    req = urllib.request.Request(url, headers={'User-Agent': 'PortSolanaV2-city-look/1.0'})
    with urllib.request.urlopen(req, timeout=90) as r, open(dst + '.part', 'wb') as f:
        f.write(r.read())
    os.replace(dst + '.part', dst)

def pick(files, keys, res='1k'):
    for k in keys:
        e = files.get(k)
        if e and res in e:
            for fmt in ('jpg', 'png'):
                if fmt in e[res]:
                    return e[res][fmt]['url']
    return None

def main():
    cache = sys.argv[1]
    only = set(sys.argv[2:])
    os.makedirs(cache, exist_ok=True)
    out = os.path.join('public', 'assets', 'city', 'pbr')
    os.makedirs(out, exist_ok=True)
    man_path = os.path.join(out, 'manifest.json')
    man = json.load(open(man_path)) if os.path.exists(man_path) else {}
    S = 1024
    for name, group in SETS.items():
        if only and name not in only:
            continue
        if name in man and all(os.path.exists(os.path.join(out, f'{name}_{k}.jpg')) for k in ('col', 'nrm', 'arm')):
            continue
        try:
            meta = os.path.join(cache, name + '.json')
            get('https://api.polyhaven.com/files/' + name, meta)
            files = json.load(open(meta))
            urls = {'col': pick(files, ['Diffuse', 'diff', 'Color', 'col_1', 'coll1']), 'nrm': pick(files, ['nor_gl']),
                    'arm': pick(files, ['arm']), 'rough': pick(files, ['Rough', 'rough']), 'ao': pick(files, ['AO', 'ao'])}
            if not urls['col'] or not urls['nrm']:
                print('SKIP (no maps)', name, list(files.keys())); continue
            paths = {}
            for k, u in urls.items():
                if not u:
                    continue
                paths[k] = os.path.join(cache, name + '_' + k + os.path.splitext(u)[1])
                get(u, paths[k])
            col = Image.open(paths['col']).convert('RGB').resize((S, S), Image.LANCZOS)
            nrm = Image.open(paths['nrm']).convert('RGB').resize((S, S), Image.LANCZOS)
            if 'arm' in paths:
                arm = Image.open(paths['arm']).convert('RGB').resize((S, S), Image.LANCZOS)
            else:
                rough = Image.open(paths['rough']).convert('L').resize((S, S), Image.LANCZOS) if 'rough' in paths else Image.new('L', (S, S), 200)
                ao = Image.open(paths['ao']).convert('L').resize((S, S), Image.LANCZOS) if 'ao' in paths else Image.new('L', (S, S), 255)
                arm = Image.merge('RGB', (ao, rough, Image.new('L', (S, S), 0)))
            col.save(os.path.join(out, name + '_col.jpg'), quality=88, subsampling=1)
            nrm.save(os.path.join(out, name + '_nrm.jpg'), quality=90, subsampling=0)
            arm.save(os.path.join(out, name + '_arm.jpg'), quality=86, subsampling=0)
            # mean albedo (linear-ish) lets the game normalize tinted layers
            small = col.resize((8, 8), Image.BOX); px = list(small.getdata())
            mean = [round(sum(p[i] for p in px) / len(px) / 255, 4) for i in range(3)]
            man[name] = {'group': group, 'source': 'https://polyhaven.com/a/' + name, 'license': 'CC0 1.0', 'author': 'Poly Haven', 'mean': mean}
            print('OK', name, mean)
        except Exception as e:  # keep going; report at the end
            print('FAIL', name, repr(e))
        json.dump(man, open(man_path, 'w'), indent=1, sort_keys=True)
    print(len(man), 'sets in manifest')

main()
