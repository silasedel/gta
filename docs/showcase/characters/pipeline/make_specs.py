import json, random
import sys
SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 20261112
START = int(sys.argv[2]) if len(sys.argv) > 2 else 0
OUT = sys.argv[3] if len(sys.argv) > 3 else 'spec_all.json'
R = random.Random(SEED)
def agev(y):
    return max(0.47, 0.1875 + (y - 11) / 14 * 0.3125) if y < 25 else 0.5 + (y - 25) / 65 * 0.5
RACES = {
  'white': {'caucasian': 0.88, 'african': 0.04, 'asian': 0.08},
  'black': {'caucasian': 0.06, 'african': 0.9, 'asian': 0.04},
  'latino': {'caucasian': 0.6, 'african': 0.2, 'asian': 0.2},
  'latino2': {'caucasian': 0.45, 'african': 0.4, 'asian': 0.15},
  'asian': {'caucasian': 0.08, 'african': 0.02, 'asian': 0.9},
  'mixed': {'caucasian': 0.4, 'african': 0.35, 'asian': 0.25},
}
RACE_POOL = ['latino'] * 5 + ['latino2'] * 3 + ['white'] * 4 + ['black'] * 4 + ['asian'] * 2 + ['mixed'] * 2
def skin_for(gender, years, race):
    b = 'young' if years < 36 else 'middleage' if years < 60 else 'old'
    dom = {'white': 'caucasian', 'black': 'african', 'asian': 'asian', 'latino': 'caucasian', 'latino2': 'african', 'mixed': R.choice(['african', 'caucasian'])}[race]
    s = f"{b}_{dom}_{'male' if gender else 'female'}"
    if s in ('young_caucasian_male', 'young_caucasian_female') and R.random() < 0.5: s += '2'
    return s
def hair_for(gender, years, race):
    if gender:
        if years > 50 and R.random() < 0.35: return None
        if race in ('black', 'latino2') and R.random() < 0.45: return 'afro01' if R.random() < 0.4 else 'short04'
        return R.choice(['short01', 'short02', 'short03', 'short04', 'short02'])
    if race in ('black', 'latino2') and R.random() < 0.4: return R.choice(['afro01', 'braid01'])
    return R.choice(['bob01', 'bob02', 'long01', 'ponytail01', 'braid01', 'long01', 'ponytail01'])
ZONES = [('beach', 16), ('casual', 18), ('business', 10), ('nightlife', 6), ('port', 4), ('sport', 6)]
AGES = {'beach': (18, 55), 'casual': (18, 76), 'business': (24, 62), 'nightlife': (21, 40), 'port': (22, 58), 'sport': (19, 48)}
specs = []
n = START
for zone, count in ZONES:
    for k in range(count):
        g = 1 if (k + START // 60) % 2 == 0 else 0
        if zone == 'port': g = 1 if k < 3 else 0
        lo, hi = AGES[zone]
        years = int(lo + (hi - lo) * (R.random() ** 1.3))
        race = R.choice(RACE_POOL)
        lean = zone in ('beach', 'sport')
        macro = {'gender': 1.0 if g else 0.0, 'age': round(agev(years), 3),
                 'muscle': round(R.uniform(0.35, 0.8) if g else R.uniform(0.25, 0.6), 2),
                 'weight': round(R.uniform(0.2, 0.65) if lean else R.uniform(0.25, 0.92), 2),
                 'height': round(R.uniform(0.3, 0.72) if g else R.uniform(0.12, 0.55), 2), 'proportions': round(R.uniform(0.35, 0.75), 2),
                 'race': RACES[race]}
        if not g:
            macro['cupsize'] = round(R.uniform(0.3, 0.8), 2); macro['firmness'] = round(R.uniform(0.4, 0.75), 2)
        clothes, shells = [], []
        if zone == 'beach':
            if g:
                shells = [{'type': R.choice(['trunks', 'boardshorts', 'boardshorts'])}]
                if R.random() < 0.3: shells.append({'type': 'tank'})
            else:
                shells = [{'type': 'bikini_top'}, {'type': 'briefs'}] if R.random() < 0.8 else [{'type': 'tank'}, {'type': 'shorts'}]
        elif zone == 'casual':
            r = R.random()
            if g and r < 0.35: clothes = [R.choice(['male_casualsuit01', 'male_casualsuit03', 'male_casualsuit05', 'male_casualsuit06']), R.choice(['shoes02', 'shoes05', 'shoes06', 'shoes01'])]
            elif not g and r < 0.25: clothes = ['female_elegantsuit01', R.choice(['shoes04', 'shoes01'])]
            else:
                shells = [{'type': R.choice(['tee', 'tee', 'tank', 'polo'] if g else ['tee', 'tank', 'tank'])}, {'type': R.choice(['shorts', 'boardshorts', 'shorts'])}]
                clothes = [R.choice(['shoes05', 'shoes06', 'shoes02'])]
        elif zone == 'business':
            clothes = ['male_elegantsuit01', R.choice(['shoes04', 'shoes01'])] if g else ['female_elegantsuit01', R.choice(['shoes04', 'shoes01'])]
        elif zone == 'nightlife':
            if g:
                clothes = [R.choice(['male_casualsuit05', 'male_casualsuit03', 'male_elegantsuit01']), 'shoes04']
                if R.random() < 0.3: clothes.append('fedora01')
            else:
                shells = [{'type': 'tank'}, {'type': 'shorts'}] if R.random() < 0.5 else []
                clothes = ['shoes04'] if shells else ['female_elegantsuit01', 'shoes04']
        elif zone == 'port':
            clothes = ['male_worksuit01', 'shoes03'] if g else ['male_worksuit01', 'shoes03']
        elif zone == 'sport':
            if g: shells = [{'type': 'tank'}, {'type': 'shorts'}]; clothes = ['shoes05']
            else: clothes = ['female_sportsuit01', 'shoes05']
        specs.append({'id': f"h{n:02d}_{zone}_{'m' if g else 'f'}", 'zone': zone, 'gender': 'm' if g else 'f', 'years': years, 'race': race,
                      'macro': macro, 'skin': skin_for(g, years, race), 'hair': hair_for(g, years, race),
                      'eyebrows': f"eyebrow{R.randint(1, 12):03d}", 'eyelashes': f"eyelashes0{R.randint(1, 4)}", 'clothes': clothes, 'shells': shells})
        n += 1
if START == 0:
  # the player: original protagonist, late 20s, grounded look
  specs.append({'id': 'player', 'zone': 'player', 'gender': 'm', 'years': 29, 'race': 'latino',
  'macro': {'gender': 1.0, 'age': round(agev(29), 3), 'muscle': 0.68, 'weight': 0.46, 'height': 0.52, 'proportions': 0.62, 'race': {'caucasian': 0.62, 'african': 0.18, 'asian': 0.2}},
  'skin': 'young_caucasian_male2', 'hair': 'short02', 'eyebrows': 'eyebrow003', 'eyelashes': 'eyelashes01', 'clothes': ['male_casualsuit05', 'shoes03'], 'shells': []})
json.dump(specs, open(OUT, 'w'), indent=1)
print(len(specs))
