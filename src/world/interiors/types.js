// Store type catalogue for Port Solana / Miami interiors (INTERIORS agent). All brand names are made up.
// Each type: names (brand generator parts), hours [open, close], palette, layouts (template keys),
// items [name, price, heal?, action?], demo (patron demographics), patrons (max), busy profile.

export function srng(seed) { let s = (Math.floor(seed) * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];

export const TYPES = {
  grocery: { label: 'Grocery', names: [['Sol', 'Bayside', 'Palmera', 'Coral Way', 'Vecino', 'Brisa'], ['Market', 'Mercado', 'Grocers', 'Fresh Market', 'Supermercado']], hours: [7, 23],
    wall: 0xf3efe0, trim: 0x2a9d8f, neon: '#2ee6a6', floor: ['tile', 'tile2'], layouts: ['aisles-z', 'aisles-x', 'aisles-z'], patrons: 6, busy: 'retail',
    items: [['Cereal', 5, 20], ['Pasta', 3, 15], ['Black Bean Soup', 3, 20], ['Hot Sauce', 4], ['Milk', 4, 15], ['Frozen Empanadas', 7, 25], ['Mangoes', 3, 15], ['Cuban Bread', 3, 20]] },
  convenience: { label: 'Convenience', names: [['24/7', 'Quick', 'Sol', 'Corner', 'NightOwl'], ['Mart', 'Stop', 'Express', 'Shop']], hours: [0, 24],
    wall: 0xf2d37a, trim: 0xe8562e, neon: '#ffb02e', floor: ['tile'], layouts: ['aisles-z', 'perimeter', 'aisles-x'], patrons: 3, busy: 'retail',
    items: [['Chips', 3, 20], ['Soda', 2, 20], ['Candy Bar', 2, 20], ['Energy Drink', 3, 15], ['Instant Noodles', 4, 20], ['Water', 1, 15]] },
  bodega: { label: 'Bodega', names: [['Bodega', 'Mini Market', 'Colmado'], ['Brisa', 'La Esquina', 'El Sol', 'Mi Barrio', 'Caribe']], hours: [7, 2],
    wall: 0x9ad9a0, trim: 0x8a3b2e, neon: '#7dff6a', floor: ['tile', 'checker'], layouts: ['perimeter', 'aisles-z'], patrons: 3, busy: 'retail',
    items: [['Plantain Chips', 3, 20], ['Cafecito Can', 2, 20], ['Guava Pastry', 3, 20], ['Malta', 2, 15], ['Lotto Ticket', 5]] },
  liquor: { label: 'Liquor', names: [['Pelican', 'Bay', 'Ocean', 'Calle Ocho'], ['Liquors', 'Wine & Spirits', 'Package Store', 'Cellars']], hours: [8, 24],
    wall: 0xffd6a5, trim: 0x6a040f, neon: '#ffb703', floor: ['wood', 'concrete'], layouts: ['liquor-a', 'liquor-b'], patrons: 3, busy: 'evening',
    items: [['Reef Rum', 22], ['Malbec', 15], ['Calora Gold Tequila', 34], ['Pelican Gin', 26], ['Lobo Lager 12pk', 16, 10], ['Ice Bag', 3]] },
  pharmacy: { label: 'Pharmacy', names: [['Calora', 'Bay', 'Coastal', 'Brickell'], ['Rx', 'Pharmacy', 'Drugs', 'Farmacia']], hours: [8, 22],
    wall: 0xeef3f6, trim: 0x2a7de1, neon: '#4fa8ff', floor: ['tile'], layouts: ['pharmacy-a', 'pharmacy-b'], patrons: 4, busy: 'retail',
    items: [['Pain Relief', 8, 30], ['Bandages', 6, 30], ['Vitamins', 12, 10], ['Cold Medicine', 9, 20], ['Aloe Gel', 9]] },
  electronics: { label: 'Electronics', names: [['Volt', 'Nexa', 'Pulse', 'Circuit'], ['line', ' Tech', ' Mobile', ' Electronics', ' Store']], hours: [10, 21],
    wall: 0x2f3542, trim: 0x00d2ff, neon: '#00e5ff', floor: ['concrete', 'tile2'], layouts: ['electronics-a', 'electronics-b'], patrons: 4, busy: 'retail', demo: { business: 0.4 },
    items: [['Earbuds', 89], ['X Phone', 699], ['Laptop', 999], ['Game Console', 449], ['Phone Case', 25], ['Fast Charger', 19]] },
  clothing: { label: 'Clothing', names: [['Tide &', 'Linen &', 'Palm &', 'Salt &'], ['Thread', 'Co.', 'Sons', 'Silk']], hours: [10, 21],
    wall: 0xc7b8ea, trim: 0x3a2f5c, neon: '#c58bff', floor: ['wood', 'marble'], layouts: ['clothing-a', 'clothing-b', 'clothing-c'], patrons: 4, busy: 'retail', demo: { female: 0.65 },
    items: [['Linen Shirt', 48], ['Sundress', 62], ['Straw Hat', 25], ['Sneakers', 95], ['Handbag', 120]] },
  beauty: { label: 'Beauty', names: [['Glow', 'Lumi', 'Petal', 'Velvet'], ['Theory', 'Beauty', 'Cosmetics', 'Studio']], hours: [10, 21],
    wall: 0xf7cfe0, trim: 0x2b2233, neon: '#ff7ad9', floor: ['marble'], layouts: ['beauty-a', 'beauty-b'], patrons: 4, busy: 'retail', demo: { female: 0.85 },
    items: [['Lip Gloss', 18], ['Glow Serum', 42], ['Eyeshadow Palette', 36], ['Perfume', 78]] },
  surf: { label: 'Surf', names: [['Saltline', 'Riptide', 'Offshore', 'Glassy'], ['Surf', 'Surf Co.', 'Board Shop']], hours: [9, 21],
    wall: 0x7fd3d0, trim: 0xf6efe0, neon: '#38f2ff', floor: ['wood'], layouts: ['surf-a', 'surf-b'], patrons: 4, busy: 'beach', demo: { beach: 1 },
    items: [['Surf Wax', 6], ['Rash Guard', 35], ['Boardshorts', 45], ['Reef Sunscreen', 15], ['Sunglasses', 29]] },
  souvenir: { label: 'Souvenirs', names: [['Ocean Drive', 'Sunny', 'Flamingo', 'Beach'], ['Gifts', 'Souvenirs', 'Treasures', 'Trading Post']], hours: [9, 23],
    wall: 0xffe08a, trim: 0xff5d8f, neon: '#ff5d8f', floor: ['tile', 'wood'], layouts: ['souvenir-a', 'souvenir-b'], patrons: 4, busy: 'beach', demo: { beach: 0.8 },
    items: [['Flamingo Figurine', 12], ['Snow Globe', 15], ['Postcards', 3], ['Miami Tee', 20], ['Sunglasses', 15]] },
  icecream: { label: 'Ice Cream', names: [['Coco', 'Frosty', 'Gelato', 'Mango'], ['Frío', 'Flamingo', 'Sol', 'Scoops']], hours: [11, 23],
    wall: 0xffd6ec, trim: 0x2ec4b6, neon: '#ff7ad9', floor: ['checker', 'tile'], layouts: ['icecream'], patrons: 4, busy: 'beach', demo: { beach: 0.7 },
    items: [['Mango Gelato', 6, 20], ['Coconut Scoop', 5, 20], ['Guava Sorbet', 5, 20]] },
  cafe: { label: 'Café', names: [['Ola', 'Café', 'Brisa', 'Ventanita'], ['Coffee Bar', 'Café', 'Roasters', 'Cafecito']], hours: [6, 18],
    wall: 0xf7c59f, trim: 0x5b3a29, neon: '#ffd36e', floor: ['wood', 'tile2'], layouts: ['cafe-a', 'cafe-b'], patrons: 6, busy: 'cafe', demo: { business: 0.4 },
    items: [['Cafecito', 2, 20], ['Café con Leche', 4, 20], ['Pastelito', 3, 20], ['Croqueta', 2, 20], ['Iced Latte', 5, 20]] },
  restaurant: { label: 'Restaurant', names: [['Neon Palm', 'Casa', 'La Ventana', 'Mariscos', 'Calle'], ['Diner', 'Cocina', 'Grill', 'Kitchen', 'Bistro']], hours: [11, 23],
    wall: 0xf4a6b8, trim: 0x2fb7a0, neon: '#ff3fa4', floor: ['checker', 'wood', 'tile2'], layouts: ['diner', 'restaurant-a', 'restaurant-b'], patrons: 7, busy: 'meal',
    items: [['Cuban Sandwich', 11, 30], ['Ropa Vieja', 16, 40], ['Key Lime Pie', 6, 20], ['Mojito (virgin)', 6, 10]] },
  bar: { label: 'Bar', names: [['The', 'Low', 'Neon', 'Salty'], ['Pelican', 'Tide', 'Lounge', 'Tap Room', 'Dive']], hours: [16, 3],
    wall: 0x3d2c2e, trim: 0xd4a373, neon: '#ffb703', floor: ['wood', 'dark'], layouts: ['bar-a', 'bar-b'], patrons: 7, busy: 'night',
    items: [['Lager', 6, 5], ['Mojito', 11, 5], ['Rum & Coke', 9, 5], ['Bar Snacks', 5, 15]] },
  club: { label: 'Club', names: [['Club', 'Pulse', 'Velvet', 'Neon'], ['Nocturno', 'Room', 'Tropic', 'Ultra', 'Wave']], hours: [22, 5],
    wall: 0x14101c, trim: 0xff2bd6, neon: '#ff2bd6', floor: ['dark'], layouts: ['club'], patrons: 9, busy: 'club',
    items: [['Bottle Service', 250], ['Vodka Soda', 14, 5], ['Water', 5, 10]] },
  laundromat: { label: 'Laundromat', names: [['Suds', 'Spin', 'Fresh', 'Clean'], ['City', 'Cycle', 'Wash', 'Laundry']], hours: [6, 23],
    wall: 0xbde0fe, trim: 0x1d3557, neon: '#4cc9f0', floor: ['tile'], layouts: ['laundry-a', 'laundry-b'], patrons: 3, busy: 'retail',
    items: [['Detergent', 3], ['Wash Cycle', 4], ['Dryer Cycle', 3]] },
  bank: { label: 'Bank', names: [['Biscayne', 'Coastal', 'Calora', 'Harbor'], ['Bank', 'Savings', 'Trust', 'Credit Union']], hours: [9, 17],
    wall: 0xe5e5e5, trim: 0x14213d, neon: '#fca311', floor: ['marble'], layouts: ['bank'], patrons: 4, busy: 'business', demo: { business: 0.8 },
    items: [['ATM Withdrawal', 0]] },
  barber: { label: 'Barber', names: [['Fade', 'Sharp', 'Clean Cut', 'Royal'], ['Harbor Barbers', 'Barber Shop', 'Cuts', 'Studio']], hours: [9, 20],
    wall: 0xa8dadc, trim: 0xe63946, neon: '#ff4d6d', floor: ['checker'], layouts: ['barber'], patrons: 3, busy: 'retail',
    items: [['Fresh Fade', 25], ['Hot Towel Shave', 18], ['Pomade', 12]] },
  jewelry: { label: 'Jewelry', names: [['Marea', 'Gold Coast', 'Diamond', 'Perla'], ['Fine Jewelry', 'Jewelers', 'Gold & Diamonds']], hours: [10, 20],
    wall: 0xf8f1e5, trim: 0x1d1d1d, neon: '#ffd700', floor: ['marble'], layouts: ['jewelry'], patrons: 2, busy: 'retail', demo: { business: 0.5 },
    items: [['Diamond Ring', 2400, 0, { smash: true }], ['Gold Chain', 1300, 0, { smash: true }], ['Dive Watch', 1800, 0, { smash: true }]] },
  guns: { label: 'Gun Store', names: [['Coastline', 'Everglades', 'Bayfront', 'Gulf'], ['Arms', 'Firearms', 'Outfitters', 'Gun & Range']], hours: [9, 21],
    wall: 0x6b705c, trim: 0x22223b, neon: '#ff3b30', floor: ['concrete'], ceil: 'dark', layouts: ['guns'], patrons: 2, busy: 'retail',
    items: [['Pistol', 400, 0, { gun: 'pistol', ammo: 36 }], ['9mm Ammo x24', 60, 0, { ammo: 'pistol', n: 24 }], ['Pump Shotgun', 900, 0, { gun: 'shotgun', ammo: 16 }], ['Shells x12', 80, 0, { ammo: 'shotgun', n: 12 }], ['SMG', 1500, 0, { gun: 'smg', ammo: 90 }], ['SMG Ammo x60', 120, 0, { ammo: 'smg', n: 60 }], ['Body Armor', 250, 0, { armor: 100 }], ['Baseball Bat', 40, 0, { gun: 'bat', ammo: 0 }]] },
  pawn: { label: 'Pawn', names: [['Gold Coast', 'Second Chance', 'Lucky'], ['Pawn', 'Pawn & Loan', 'Trading']], hours: [9, 19],
    wall: 0xe9c46a, trim: 0x264653, neon: '#f4a261', floor: ['concrete'], ceil: 'dark', layouts: ['pawn'], patrons: 2, busy: 'retail',
    items: [['Used Guitar', 120], ['Vintage Watch', 220], ['Old Phone', 45], ['Gold Chain', 300, 0, { smash: true }]] },
  auto: { label: 'Auto Parts', names: [['TorqueMax', 'Gripline', 'RoadKing'], ['Auto Parts', 'Auto', 'Parts & More']], hours: [7, 21],
    wall: 0xd9d9d9, trim: 0xd00000, neon: '#ff5400', floor: ['concrete'], ceil: 'dark', layouts: ['auto'], patrons: 2, busy: 'retail',
    items: [['Motor Oil', 28], ['Car Battery', 140], ['LED Bulbs', 19], ['Air Freshener', 4]] },
  salon: { label: 'Salon', names: [['Glam', 'Bella', 'Silk', 'Tress'], ['Hair Studio', 'Salon', 'Beauty Bar', 'Blowout']], hours: [9, 20],
    wall: 0xffe5ec, trim: 0x9d4edd, neon: '#ff7ad9', floor: ['marble', 'wood'], layouts: ['barber'], patrons: 4, busy: 'retail', demo: { female: 0.85 },
    items: [['Blowout', 45], ['Manicure', 30], ['Hair Serum', 22]] },
  hardware: { label: 'Hardware', names: [['Palmetto', 'Fix-It', 'Bayside', 'Tool Shed'], ['Hardware', 'Supply', 'Home & Tool']], hours: [7, 20],
    wall: 0xe9edc9, trim: 0xbc4749, neon: '#ffb703', floor: ['concrete'], ceil: 'dark', layouts: ['auto', 'aisles-z'], patrons: 3, busy: 'retail',
    items: [['Duct Tape', 6], ['Paint Can', 28], ['Flashlight', 15], ['Light Bulbs', 9]] },
  fastfood: { label: 'Fast Food', names: [['Burger', 'Crispy', 'Taco', 'Pizza', 'Pollo'], ['Bahía', 'Coast', 'Tide', 'Palma', 'Express']], hours: [9, 24],
    wall: 0xffd166, trim: 0xef476f, neon: '#ff595e', floor: ['tile2', 'checker'], layouts: ['cafe-a', 'cafe-b'], patrons: 6, busy: 'meal',
    items: [['Combo Meal', 9, 35], ['Fries', 3, 15], ['Soda', 2, 10], ['Churros', 4, 15]] },
  sport: { label: 'Sporting Goods', names: [['Reef &', 'Bay &', 'Trail &'], ['Ridge', 'Field', 'Tackle']], hours: [10, 21],
    wall: 0xe9d8a6, trim: 0x2d6a4f, neon: '#ffd166', floor: ['wood'], layouts: ['sport'], patrons: 3, busy: 'retail',
    items: [['Running Shoes', 95], ['Protein Bar', 4, 20], ['Sports Drink', 3, 20], ['Fishing Lure', 8]] },
};

// OSM shop/amenity value -> type
const OSM = {
  supermarket: 'grocery', greengrocer: 'grocery', grocery: 'grocery', deli: 'bodega', butcher: 'grocery', convenience: 'convenience', kiosk: 'convenience', variety_store: 'bodega',
  alcohol: 'liquor', wine: 'liquor', beverages: 'liquor', pharmacy: 'pharmacy', chemist: 'pharmacy', medical_supply: 'pharmacy',
  electronics: 'electronics', mobile_phone: 'electronics', computer: 'electronics', video_games: 'electronics', hifi: 'electronics',
  clothes: 'clothing', boutique: 'clothing', fashion: 'clothing', shoes: 'clothing', bag: 'clothing', fashion_accessories: 'clothing', department_store: 'clothing',
  cosmetics: 'beauty', beauty: 'beauty', perfumery: 'beauty', surf: 'surf', water_sports: 'surf', swimwear: 'surf', gift: 'souvenir', souvenir: 'souvenir', art: 'souvenir',
  ice_cream: 'icecream', cafe: 'cafe', coffee: 'cafe', bakery: 'cafe', pastry: 'cafe', restaurant: 'restaurant', fast_food: 'restaurant', food_court: 'restaurant',
  bar: 'bar', pub: 'bar', biergarten: 'bar', nightclub: 'club', laundry: 'laundromat', dry_cleaning: 'laundromat', bank: 'bank', bureau_de_change: 'bank', money_lender: 'pawn',
  hairdresser: 'barber', barber: 'barber', jewelry: 'jewelry', watches: 'jewelry', weapons: 'guns', pawnbroker: 'pawn', second_hand: 'pawn', car_parts: 'auto', tyres: 'auto',
  sports: 'sport', outdoor: 'sport', fishing: 'sport', bicycle: 'sport', liquor: 'liquor', salon: 'salon', hair: 'salon', nail_salon: 'salon', massage: 'salon', tattoo: 'barber',
  hardware: 'hardware', doityourself: 'hardware', locksmith: 'hardware', paint: 'hardware', trade: 'hardware', construction: 'hardware', lighting: 'hardware',
  fast_food: 'fastfood', confectionery: 'icecream', hotel: 'restaurant', gym: 'sport', fitness_centre: 'sport', clinic: 'pharmacy', doctors: 'pharmacy', optician: 'beauty',
  theatre: 'bar', cinema: 'bar', car: 'auto', car_rental: 'auto', car_repair: 'auto', motorcycle: 'auto', fuel: 'convenience', smoke: 'convenience', tobacco: 'convenience',
  furniture: 'pawn', interior_decoration: 'souvenir', florist: 'souvenir', travel_agency: 'bank', stationery: 'souvenir', copyshop: 'electronics', storage_rental: 'pawn',
  general: 'bodega', mall: 'clothing', charity: 'pawn', cannabis: 'convenience', erotic: 'convenience', frame: 'souvenir', bed: 'pawn', photo: 'electronics', tailor: 'clothing',
  wholesale: 'grocery', ticket: 'souvenir', nutrition_supplements: 'pharmacy', fortune_teller: 'souvenir',
};
const ZONE_TYPES = {
  beach: ['surf', 'souvenir', 'icecream', 'cafe', 'surf', 'souvenir', 'restaurant', 'convenience', 'clothing', 'bar'],
  nightlife: ['bar', 'club', 'restaurant', 'bar', 'restaurant', 'convenience', 'liquor', 'club', 'cafe'],
  business: ['cafe', 'bank', 'pharmacy', 'restaurant', 'cafe', 'electronics', 'convenience', 'clothing', 'jewelry'],
  downtown: ['cafe', 'bank', 'pharmacy', 'restaurant', 'electronics', 'clothing', 'jewelry', 'convenience', 'beauty'],
  residential: ['bodega', 'laundromat', 'barber', 'bodega', 'pharmacy', 'liquor', 'restaurant', 'cafe', 'grocery', 'salon'],
  commercial: ['grocery', 'pharmacy', 'clothing', 'electronics', 'beauty', 'restaurant', 'auto', 'sport', 'pawn', 'guns', 'liquor'],
  industrial: ['auto', 'pawn', 'guns', 'bodega', 'restaurant'],
  port: ['bodega', 'restaurant', 'auto', 'bar'],
  // old-city lot zones
  deco: ['convenience', 'restaurant', 'beauty', 'bodega', 'cafe', 'bar', 'liquor', 'clothing'], mid: ['electronics', 'sport', 'guns', 'pharmacy', 'pawn', 'barber', 'auto', 'jewelry'],
};
// old city lot index -> fixed type (keeps the known stores stable)
export const OLD_LOT_TYPES = ['surf', 'convenience', 'restaurant', 'beauty', 'bodega', 'electronics', 'sport', 'guns', 'liquor', 'pharmacy', 'clothing', 'cafe', 'pawn', 'barber', 'auto', 'jewelry', 'bar', 'club', 'laundromat', 'bank', 'grocery', 'souvenir', 'icecream'];
const OLD_NAMES = { surf: 'Saltline Surf', convenience: '24/7 Sol Mart', restaurant: 'Neon Palm Diner', beauty: 'Glow Theory', bodega: 'Bodega Brisa', electronics: 'Voltline', sport: 'Reef & Ridge Outfitters', guns: 'Coastline Arms', liquor: 'Pelican Liquors', pharmacy: 'Calora Rx', clothing: 'Tide & Thread', cafe: 'Ola Coffee Bar', pawn: 'Gold Coast Pawn', barber: 'Fade Harbor Barbers', auto: 'TorqueMax Auto Parts', jewelry: 'Marea Fine Jewelry' };

export function chooseType(sf, index, zone, seed) {
  const k = (sf.kind || '').toString().toLowerCase();
  if (TYPES[k]) return k;
  if (OSM[k]) return OSM[k];
  const r = srng(seed);
  if (sf.buildingId == null && sf.shell !== true && index < OLD_LOT_TYPES.length && (!k || ZONE_TYPES[k])) return OLD_LOT_TYPES[index];
  const z = ZONE_TYPES[k] ? k : zone;
  return pick(r, ZONE_TYPES[z] || ZONE_TYPES.commercial);
}
export function chooseName(type, sf, index, seed, oldCity) {
  if (sf.name) return sf.name;
  if (oldCity && OLD_NAMES[type] && index < OLD_LOT_TYPES.length && OLD_LOT_TYPES[index] === type) return OLD_NAMES[type];
  const r = srng(seed * 3 + 11); const t = TYPES[type];
  const a = pick(r, t.names[0]), b = pick(r, t.names[1]);
  return b.startsWith(' ') || b === 'line' ? a + b : `${a} ${b}`;
}
export function isOpenAt(h, hrs) { const [o, c] = hrs; if (c - o >= 24) return true; return o < c ? h >= o && h < c : h >= o || h < c; }
export function busyFactor(hour, profile) {
  const h = ((hour % 24) + 24) % 24;
  const meal = (h >= 7 && h < 9.5) || (h >= 12 && h < 14) || (h >= 18.5 && h < 21);
  switch (profile) {
    case 'meal': return meal ? 1 : h >= 22 || h < 7 ? 0.2 : 0.45;
    case 'cafe': return h >= 7 && h < 10 ? 1 : h >= 12 && h < 15 ? 0.8 : 0.45;
    case 'night': return h >= 21 || h < 2 ? 1 : h >= 17 ? 0.6 : 0.25;
    case 'club': return h >= 23 || h < 3 ? 1 : 0.5;
    case 'beach': return h >= 11 && h < 18 ? 1 : h >= 18 && h < 22 ? 0.6 : 0.3;
    case 'business': return h >= 12 && h < 14 ? 1 : 0.6;
    case 'evening': return h >= 17 && h < 22 ? 1 : 0.4;
    default: return (h >= 11 && h < 14) || (h >= 17 && h < 20) ? 1 : h >= 8 && h < 22 ? 0.55 : 0.2;
  }
}
