"""OSM tags -> game types. Types only: real business and brand names never leave this module.

`classify(tags)` returns None or a dict:
  kind    V1-compatible storefront kind (e.g. 'clothes', 'restaurant', 'fuel', 'hotel', 'gym')
  osm     the raw OSM key=value it came from (e.g. 'shop=shoes', 'amenity=fuel', 'tourism=hotel')
  sub     finer type where OSM has one (cuisine for food, sport for gyms, religion/denomination, clothes type ...)
  tier    'luxury' | 'premium' | 'mid' | 'budget' (from a private brand lookup or tags such as stars; never the name)
  use     land-use class for the whole building or site (see USES)
"""
import re

# land-use classes carried on buildings and site polygons (BIG_UPDATE 1 / 1b "real land use per block")
USES = ['fuel', 'hotel', 'school', 'university', 'kindergarten', 'worship', 'parking_garage', 'office', 'hospital',
        'clinic', 'police', 'fire_station', 'supermarket', 'car_dealer', 'car_repair', 'car_wash', 'car_rental',
        'laundromat', 'gym', 'marina', 'bank', 'pharmacy', 'restaurant', 'fast_food', 'cafe', 'bar', 'nightclub',
        'retail', 'mall', 'cinema', 'theatre', 'museum', 'library', 'courthouse', 'townhall', 'post_office',
        'community', 'stadium', 'sports', 'arena', 'convention', 'cruise_terminal', 'ferry_terminal', 'station',
        'warehouse', 'industrial', 'storage', 'apartments', 'house', 'government', 'social', 'attraction',
        'lifeguard', 'toilets', 'utility', 'construction', 'cemetery', 'prison', 'arts', 'venue', 'nursing_home',
        'veterinary', 'childcare', 'shelter', 'kiosk', 'bus_station', 'helipad']

SHOP_KIND = {
    'alcohol': 'liquor', 'wine': 'liquor', 'beverages': 'liquor', 'mobile_phone': 'electronics', 'computer': 'electronics',
    'hairdresser': 'salon', 'beauty': 'salon', 'cosmetics': 'beauty', 'department_store': 'clothes', 'boutique': 'clothes',
    'fashion_accessories': 'clothes', 'bag': 'clothes', 'chemist': 'pharmacy', 'deli': 'convenience', 'kiosk': 'convenience',
    'variety_store': 'convenience', 'tobacco': 'smoke', 'e-cigarette': 'smoke', 'swimwear': 'clothes', 'perfumery': 'beauty',
    'tattoo': 'tattoo',
}
FOOD = ('restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'nightclub', 'ice_cream', 'food_court', 'biergarten')
AMENITY_KIND = {
    'restaurant': 'restaurant', 'cafe': 'cafe', 'bar': 'bar', 'pub': 'bar', 'fast_food': 'fast_food', 'nightclub': 'nightclub',
    'ice_cream': 'ice_cream', 'bank': 'bank', 'pharmacy': 'pharmacy', 'fuel': 'fuel', 'cinema': 'cinema', 'theatre': 'theatre',
    'car_rental': 'car_rental', 'bureau_de_change': 'bureau_de_change', 'stripclub': 'stripclub', 'casino': 'casino',
    'dentist': 'dentist', 'clinic': 'clinic', 'doctors': 'doctors', 'food_court': 'food_court', 'car_wash': 'car_wash',
    'post_office': 'post_office', 'veterinary': 'veterinary', 'money_transfer': 'bureau_de_change', 'boat_rental': 'boat_rental',
    'bicycle_rental': None, 'coworking_space': 'office', 'studio': 'studio', 'arts_centre': 'gallery', 'marketplace': 'market',
    'childcare': 'childcare', 'kindergarten': 'childcare', 'language_school': 'school', 'driving_school': 'school',
    'animal_boarding': 'veterinary', 'events_venue': 'venue', 'conference_centre': 'venue', 'social_facility': 'social',
    'internet_cafe': 'cafe', 'biergarten': 'bar', 'hookah_lounge': 'bar', 'gambling': 'casino', 'payment_centre': 'bank',
}
AMENITY_USE = {
    'fuel': 'fuel', 'school': 'school', 'college': 'university', 'university': 'university', 'kindergarten': 'kindergarten',
    'place_of_worship': 'worship', 'hospital': 'hospital', 'clinic': 'clinic', 'doctors': 'clinic', 'dentist': 'clinic',
    'police': 'police', 'fire_station': 'fire_station', 'bank': 'bank', 'pharmacy': 'pharmacy', 'restaurant': 'restaurant',
    'fast_food': 'fast_food', 'cafe': 'cafe', 'bar': 'bar', 'pub': 'bar', 'nightclub': 'nightclub', 'cinema': 'cinema',
    'theatre': 'theatre', 'library': 'library', 'courthouse': 'courthouse', 'townhall': 'townhall', 'post_office': 'post_office',
    'community_centre': 'community', 'car_wash': 'car_wash', 'car_rental': 'car_rental', 'cruise_terminal': 'cruise_terminal',
    'ferry_terminal': 'ferry_terminal', 'bus_station': 'bus_station', 'arts_centre': 'arts', 'events_venue': 'venue',
    'conference_centre': 'convention', 'exhibition_centre': 'convention', 'concert_hall': 'theatre', 'nursing_home': 'nursing_home',
    'social_facility': 'social', 'veterinary': 'veterinary', 'childcare': 'childcare', 'prison': 'prison', 'grave_yard': 'cemetery',
    'toilets': 'toilets', 'shelter': 'shelter', 'research_institute': 'office', 'stripclub': 'nightclub', 'casino': 'venue',
    'marketplace': 'retail', 'food_court': 'fast_food',
}
BUILDING_USE = {
    'hotel': 'hotel', 'school': 'school', 'university': 'university', 'college': 'university', 'kindergarten': 'kindergarten',
    'church': 'worship', 'cathedral': 'worship', 'chapel': 'worship', 'synagogue': 'worship', 'mosque': 'worship', 'temple': 'worship',
    'hospital': 'hospital', 'office': 'office', 'commercial': 'office', 'retail': 'retail', 'supermarket': 'supermarket',
    'warehouse': 'warehouse', 'industrial': 'industrial', 'apartments': 'apartments', 'residential': 'apartments',
    'condominium': 'apartments', 'dormitory': 'apartments', 'house': 'house', 'detached': 'house', 'semidetached_house': 'house',
    'terrace': 'house', 'bungalow': 'house', 'cabin': 'house', 'train_station': 'station', 'transportation': 'station',
    'cruise_terminal': 'cruise_terminal', 'museum': 'museum', 'library': 'library', 'government': 'government',
    'public': 'government', 'civic': 'government', 'fire_station': 'fire_station', 'police': 'police', 'stadium': 'stadium',
    'grandstand': 'stadium', 'sports_hall': 'sports', 'sports_centre': 'sports', 'parking': 'parking_garage',
    'garages': 'parking_garage', 'lifeguard_tower': 'lifeguard', 'toilets': 'toilets', 'kiosk': 'kiosk', 'service': 'utility',
    'construction': 'construction', 'hangar': 'warehouse', 'storage_tank': 'industrial', 'hut': 'house',
}
SHOP_USE = {'supermarket': 'supermarket', 'car': 'car_dealer', 'car_repair': 'car_repair', 'tyres': 'car_repair',
            'car_parts': 'car_repair', 'motorcycle': 'car_dealer', 'laundry': 'laundromat', 'dry_cleaning': 'laundromat',
            'mall': 'mall', 'department_store': 'mall', 'storage_rental': 'storage', 'wholesale': 'warehouse'}

# ---- private brand -> tier lookup (lower-cased substrings of OSM name/brand). The names stay in this file.
_LUX = ('louis vuitton', 'gucci', 'prada', 'chanel', 'hermes', 'hermès', 'dior', 'fendi', 'cartier', 'tiffany', 'bulgari',
        'bvlgari', 'rolex', 'versace', 'balenciaga', 'saint laurent', 'ysl', 'bottega', 'burberry', 'valentino', 'givenchy',
        'celine', 'loewe', 'tom ford', 'christian louboutin', 'jimmy choo', 'manolo', 'harry winston', 'van cleef',
        'patek', 'audemars', 'hublot', 'richard mille', 'omega', 'panerai', 'iwc', 'breitling', 'tag heuer', 'piaget',
        'chopard', 'graff', 'david yurman', 'moncler', 'off-white', 'alexander mcqueen', 'dolce', 'armani', 'zegna',
        'brunello', 'loro piana', 'goyard', 'salvatore ferragamo', 'ferragamo', 'tod\'s', 'berluti', 'golden goose',
        'ferrari', 'lamborghini', 'bentley', 'rolls', 'mclaren', 'aston martin', 'maserati', 'bugatti', 'porsche',
        'four seasons', 'ritz', 'st. regis', 'st regis', 'mandarin oriental', 'faena', 'setai', 'edition', 'w hotel',
        'w south beach', 'w miami', 'fontainebleau', 'eden roc', 'east miami', 'east, miami', '1 hotel', 'sls', 'delano',
        'shore club', 'the betsy', 'nobu', 'zuma', 'cipriani', 'carbone', 'komodo', 'papi steak', 'prime 112', 'neiman',
        'saks', 'bal harbour', 'equinox', 'soho house', 'acqualina', 'aman', 'bulgari')
_PREMIUM = ('apple', 'tesla', 'lululemon', 'sephora', 'nordstrom', 'bloomingdale', 'coach', 'michael kors', 'tory burch',
            'kate spade', 'ralph lauren', 'hugo boss', 'ted baker', 'all saints', 'allsaints', 'diesel', 'lacoste',
            'anthropologie', 'free people', 'west elm', 'restoration hardware', 'rh ', 'williams-sonoma', 'pottery barn',
            'crate', 'whole foods', 'fresh market', 'bmw', 'mercedes', 'audi', 'lexus', 'land rover', 'jaguar', 'cadillac',
            'volvo', 'infiniti', 'acura', 'marriott', 'jw marriott', 'hilton', 'hyatt', 'intercontinental', 'kimpton',
            'loews', 'conrad', 'sofitel', 'westin', 'sheraton', 'kith', 'supreme', 'bape', 'nike', 'adidas', 'pandora',
            'swarovski', 'tumi', 'montblanc', 'bose', 'sonos', 'lush', 'aesop', 'mac cosmetics', 'pure barre', 'soulcycle',
            'barry', 'orangetheory', 'capital grille', 'morton', 'ruth\'s chris', 'fogo', 'seaspice', 'joe\'s stone',
            'the standard', 'mondrian', 'nautilus', 'gale', 'kayak', 'moxy', 'ac hotel', 'aloft', 'canopy', 'yotel',
            'novotel', 'epic', 'icon', 'gabriel', 'hotel beaux arts', 'me miami', 'atton', 'citizenm', 'arlo')
_BUDGET = ('dollar tree', 'family dollar', 'dollar general', 'ross', 'marshalls', 't.j. maxx', 'tj maxx', 'burlington',
           'walmart', 'aldi', 'payless', 'rainbow', 'dd\'s', 'dds discount', 'five below', 'goodwill', 'salvation army',
           'metro by t-mobile', 'metropcs', 'boost mobile', 'cricket', 'rent-a-center', 'aaron\'s', 'presidente',
           'sedano', 'el bodegon', 'la bodega', 'pawn', 'check cashing', 'cash advance', 'pollo tropical', 'mcdonald',
           'burger king', 'wendy', 'taco bell', 'kfc', 'popeyes', 'subway', 'little caesars', 'domino', 'papa john',
           'checkers', 'church\'s', 'motel 6', 'super 8', 'days inn', 'red roof', 'econo', 'rodeway', 'travelodge',
           'knights inn', 'hostel', 'dunkin', 'wawa', '7-eleven', 'circle k', 'autozone', 'advance auto', 'o\'reilly',
           'pep boys', 'jiffy', 'u-haul', 'planet fitness', 'youfit', 'shoe carnival', 'foot locker', 'famous footwear',
           'dtlr', 'snipes', 'citi trends', 'forman mills', 'value', 'thrift', 'discount', '99 cent', '99c', 'bravo')
_ATHLETIC = ('nike', 'adidas', 'foot locker', 'footlocker', 'finish line', 'champs', 'jd sports', 'snipes', 'dtlr',
             'puma', 'new balance', 'asics', 'skechers', 'under armour', 'reebok', 'hoka', 'on running', 'fleet feet')
_SNEAKER = ('kith', 'supreme', 'bape', 'flight club', 'stadium goods', 'sneaker', 'kicks', 'sole', 'shoe gallery',
            'unknwn', 'solefly', 'concepts', 'undefeated', 'extra butter', 'atmos', 'laced', 'jordan')
_FAMILY_SHOE = ('payless', 'famous footwear', 'shoe carnival', 'dsw', 'rack room', 'shoe dept', 'off broadway', 'aldo',
                'clarks', 'crocs', 'journeys', 'steve madden', 'nine west', 'shoe warehouse', 'zapater')


def _tier(t):
    n = ' '.join(str(t.get(k, '')) for k in ('name', 'brand', 'operator', 'official_name')).lower()
    if n.strip():
        if any(b in n for b in _LUX):
            return 'luxury'
        if any(b in n for b in _BUDGET):
            return 'budget'
        if any(b in n for b in _PREMIUM):
            return 'premium'
    st = t.get('stars')
    if st:
        try:
            s = float(str(st).replace('S', '').split(';')[0])
            return 'luxury' if s >= 5 else 'premium' if s >= 4 else 'mid' if s >= 3 else 'budget'
        except ValueError:
            pass
    if t.get('tourism') in ('hostel', 'motel'):
        return 'budget'
    return None


def _shoe_sub(t):
    n = ' '.join(str(t.get(k, '')) for k in ('name', 'brand')).lower()
    if any(b in n for b in _LUX):
        return 'luxury_salon'
    if any(b in n for b in _SNEAKER):
        return 'sneaker_boutique'
    if any(b in n for b in _ATHLETIC):
        return 'athletic_chain'
    if any(b in n for b in _FAMILY_SHOE):
        return 'family_discount'
    return None


_clean = re.compile(r'[^a-z0-9_;]+')


def _val(v):
    v = _clean.sub('_', str(v).lower()).strip('_')
    return v.split(';')[0][:32] or None


def classify(t):
    """-> dict(kind, osm, sub?, tier?, use?) or None for tags that are not a visitable place."""
    s, a, tr, le, of = t.get('shop'), t.get('amenity'), t.get('tourism'), t.get('leisure'), t.get('office')
    kind = osm = sub = use = None
    if s and s not in ('vacant', 'no'):
        s = _val(s) or 'yes'
        kind = SHOP_KIND.get(s, s if s != 'yes' else 'shop')
        osm = 'shop=' + s
        use = SHOP_USE.get(s, 'retail')
        if s == 'clothes':
            sub = _val(t.get('clothes')) if t.get('clothes') else None
        elif s == 'shoes':
            sub = _shoe_sub(t) or (_val(t.get('shoes')) if t.get('shoes') else None)
        elif s in ('car', 'car_repair', 'motorcycle'):
            sub = _val(t.get('service')) if t.get('service') else None
        elif s == 'supermarket' and t.get('cuisine'):
            sub = _val(t['cuisine'])
    elif a in AMENITY_KIND or a in AMENITY_USE:
        kind = AMENITY_KIND.get(a)
        osm = 'amenity=' + a
        use = AMENITY_USE.get(a)
        if a in FOOD and t.get('cuisine'):
            sub = _val(t['cuisine'])
        elif a == 'place_of_worship':
            sub = _val(t.get('denomination') or t.get('religion') or '') or None
        elif a == 'fuel' and t.get('shop') is None and t.get('car_wash') == 'yes':
            sub = 'car_wash'
        elif a == 'school':
            sub = _val(t.get('isced:level') or t.get('school') or '') or None
        elif a == 'bar' and t.get('lgbtq') in ('primary', 'only'):
            sub = None
        if kind is None and use in ('school', 'university', 'kindergarten', 'worship', 'hospital', 'police', 'fire_station',
                                    'library', 'courthouse', 'townhall', 'community', 'cruise_terminal', 'ferry_terminal',
                                    'bus_station', 'arts', 'convention', 'nursing_home', 'prison'):
            kind = use
    elif tr in ('hotel', 'hostel', 'motel', 'guest_house', 'apartment', 'chalet', 'resort'):
        kind, osm, use = 'hotel', 'tourism=' + tr, 'hotel'
        sub = tr if tr != 'hotel' else None
    elif tr in ('museum', 'gallery', 'attraction', 'theme_park', 'zoo', 'aquarium'):
        kind, osm = ('gallery' if tr == 'gallery' else 'museum' if tr == 'museum' else 'attraction'), 'tourism=' + tr
        use = 'museum' if tr in ('museum', 'gallery') else 'attraction'
    elif le in ('fitness_centre', 'sports_centre', 'dance', 'bowling_alley', 'amusement_arcade', 'escape_game', 'sauna',
                'miniature_golf', 'marina', 'stadium', 'sports_hall', 'ice_rink', 'water_park', 'adult_gaming_centre'):
        kind = {'fitness_centre': 'gym', 'sports_centre': 'gym', 'dance': 'dance_studio', 'amusement_arcade': 'arcade',
                'adult_gaming_centre': 'arcade', 'marina': 'marina', 'stadium': 'stadium', 'sports_hall': 'gym'}.get(le, le)
        osm = 'leisure=' + le
        use = {'fitness_centre': 'gym', 'sports_centre': 'sports', 'marina': 'marina', 'stadium': 'stadium',
               'sports_hall': 'sports', 'dance': 'gym'}.get(le, 'venue')
        if t.get('sport'):
            sub = _val(t['sport'])
    elif of and of != 'no':
        kind, osm, use = 'office', 'office=' + (_val(of) or 'yes'), 'office'
        sub = _val(of) if of != 'yes' else None
    elif t.get('craft'):
        c = _val(t['craft'])
        kind, osm, use = {'tailor': 'clothes', 'shoemaker': 'shoes', 'jeweller': 'jewelry', 'bakery': 'bakery',
                          'brewery': 'bar', 'winery': 'liquor', 'photographer': 'photo', 'key_cutter': 'locksmith',
                          'electronics_repair': 'electronics', 'caterer': 'restaurant'}.get(c, 'workshop'), 'craft=' + c, 'retail'
        sub = c
    elif t.get('healthcare') and t['healthcare'] not in ('no',):
        h = _val(t['healthcare'])
        kind = {'pharmacy': 'pharmacy', 'dentist': 'dentist', 'hospital': 'hospital', 'optometrist': 'optician'}.get(h, 'clinic')
        osm, use = 'healthcare=' + h, ('hospital' if h == 'hospital' else 'pharmacy' if h == 'pharmacy' else 'clinic')
        sub = _val(t.get('healthcare:speciality') or '') or None
    if not kind and not use:
        return None
    r = {'kind': kind, 'osm': osm, 'use': use}
    if sub:
        r['sub'] = sub
    ti = _tier(t)
    if ti:
        r['tier'] = ti
    elif kind in ('hotel',) and tr == 'hotel':
        r['tier'] = 'mid'
    if t.get('drive_through') == 'yes':
        r['driveThrough'] = True
    if t.get('outdoor_seating') in ('yes', 'sidewalk', 'terrace', 'patio', 'parklet', 'pedestrian_zone'):
        r['outdoorSeating'] = True
    if t.get('level') not in (None, '0', '0;1'):
        try:
            r['level'] = int(float(str(t['level']).split(';')[0]))
        except ValueError:
            pass
    return r


def building_use(t):
    """Land-use class for a building from its own tags (None if nothing specific)."""
    c = classify(t)
    if c and c.get('use'):
        return c['use']
    b = t.get('building')
    if b == 'parking' or t.get('amenity') == 'parking' or t.get('parking') in ('multi-storey',):
        return 'parking_garage'
    if b in BUILDING_USE:
        return BUILDING_USE[b]
    if t.get('man_made') in ('wastewater_plant', 'water_works', 'works', 'pumping_station') or t.get('power') in ('substation', 'plant'):
        return 'utility'
    if t.get('aeroway') == 'helipad':
        return 'helipad'
    return None


def site_use(t):
    """Land-use class of a site polygon (school grounds, hospital campus, fuel forecourt, marina basin ...)."""
    c = classify(t)
    if c and c.get('use') in ('fuel', 'school', 'university', 'kindergarten', 'worship', 'hospital', 'police', 'fire_station',
                              'supermarket', 'car_dealer', 'car_repair', 'car_wash', 'car_rental', 'marina', 'mall', 'stadium',
                              'sports', 'cruise_terminal', 'ferry_terminal', 'bus_station', 'convention', 'museum', 'attraction',
                              'hotel', 'cemetery', 'prison', 'library', 'courthouse', 'townhall', 'community', 'storage', 'clinic',
                              'nursing_home', 'arts', 'venue', 'theatre', 'cinema'):
        return c['use']
    if t.get('landuse') == 'religious':
        return 'worship'
    if t.get('landuse') == 'cemetery':
        return 'cemetery'
    if t.get('landuse') == 'military':
        return 'government'
    if t.get('landuse') == 'construction':
        return 'construction'
    if t.get('leisure') == 'golf_course':
        return 'golf'
    if t.get('power') in ('substation', 'plant') or t.get('man_made') in ('wastewater_plant', 'water_works'):
        return 'utility'
    if t.get('amenity') == 'parking':
        return 'parking_garage' if t.get('parking') in ('multi-storey', 'underground') else 'parking'
    return None


def address(t):
    """'1234 Southwest 8th Street' style public street address, or None."""
    hn, st = t.get('addr:housenumber'), t.get('addr:street')
    if hn and st:
        return f'{hn} {st}'[:60]
    return None
