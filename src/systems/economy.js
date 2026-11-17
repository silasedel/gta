// Core systems: the economy data sheet and the world services built on it: district income levels, price indexes,
// job income rates, price anchors for cars / boats / property, and shop opening hours.
// `economy.md` in this folder is GENERATED from this file (node src/systems/tests/gen_economy.mjs): edit numbers here.
import { clamp, hash01, slug } from './util.js';
import { clockText } from './time.js';

// ---------------------------------------------------------------------------------------------------------------------
// Districts. Ids match src/design/brands/define.js DISTRICTS. `income` 0..1 is the level other tracks read:
// what cars park there, what the apartments look like, how big the tips are.
// Median household incomes are rounded, plausible figures for the real neighborhoods and invented ones for ours.
export const DISTRICTS = {
  'bay-islands': { name: 'Bay Islands', income: 1.0, medianIncome: 410000, priceIndex: 1.6, rentIndex: 3.4, tourist: 0.15, nightlife: 0.05, crime: 0.05 },
  'south-beach': { name: 'South Beach', income: 0.72, medianIncome: 78000, priceIndex: 1.35, rentIndex: 1.9, tourist: 1.0, nightlife: 1.0, crime: 0.45 },
  'mid-beach': { name: 'Mid-Beach', income: 0.8, medianIncome: 112000, priceIndex: 1.3, rentIndex: 2.0, tourist: 0.7, nightlife: 0.5, crime: 0.2 },
  brickell: { name: 'Brickell', income: 0.85, medianIncome: 124000, priceIndex: 1.3, rentIndex: 2.1, tourist: 0.35, nightlife: 0.7, crime: 0.2 },
  downtown: { name: 'Downtown', income: 0.62, medianIncome: 71000, priceIndex: 1.15, rentIndex: 1.6, tourist: 0.5, nightlife: 0.55, crime: 0.5 },
  edgewater: { name: 'Edgewater', income: 0.7, medianIncome: 86000, priceIndex: 1.15, rentIndex: 1.7, tourist: 0.2, nightlife: 0.3, crime: 0.3 },
  'design-district': { name: 'Design District', income: 0.82, medianIncome: 98000, priceIndex: 1.45, rentIndex: 1.8, tourist: 0.55, nightlife: 0.35, crime: 0.25 },
  wynwood: { name: 'Wynwood', income: 0.55, medianIncome: 62000, priceIndex: 1.15, rentIndex: 1.5, tourist: 0.65, nightlife: 0.8, crime: 0.5 },
  'little-havana': { name: 'Little Havana', income: 0.3, medianIncome: 36000, priceIndex: 0.88, rentIndex: 0.95, tourist: 0.4, nightlife: 0.35, crime: 0.55 },
  overtown: { name: 'Overtown', income: 0.18, medianIncome: 27000, priceIndex: 0.85, rentIndex: 0.8, tourist: 0.05, nightlife: 0.15, crime: 0.8 },
  port: { name: 'PortMiami', income: 0.45, medianIncome: 52000, priceIndex: 1.0, rentIndex: 1.0, tourist: 0.3, nightlife: 0.0, crime: 0.4 },
  airport: { name: 'Miami International Airport', income: 0.45, medianIncome: 50000, priceIndex: 1.25, rentIndex: 1.0, tourist: 0.6, nightlife: 0.05, crime: 0.3 },
  'south-suburbs': { name: 'South Suburbs', income: 0.5, medianIncome: 64000, priceIndex: 0.98, rentIndex: 1.1, tourist: 0.05, nightlife: 0.1, crime: 0.3 },
  'north-suburbs': { name: 'North Suburbs', income: 0.48, medianIncome: 59000, priceIndex: 0.96, rentIndex: 1.05, tourist: 0.05, nightlife: 0.1, crime: 0.35 },
  everglades: { name: 'Everglades', income: 0.22, medianIncome: 31000, priceIndex: 0.92, rentIndex: 0.6, tourist: 0.3, nightlife: 0.0, crime: 0.3 },
  'key-paloma': { name: 'Key Paloma', income: 0.38, medianIncome: 44000, priceIndex: 1.05, rentIndex: 1.1, tourist: 0.45, nightlife: 0.3, crime: 0.25 },
  'middle-keys': { name: 'Middle Keys', income: 0.42, medianIncome: 48000, priceIndex: 1.1, rentIndex: 1.2, tourist: 0.55, nightlife: 0.25, crime: 0.15 },
  'tern-key': { name: 'Tern Key', income: 0.58, medianIncome: 67000, priceIndex: 1.2, rentIndex: 1.5, tourist: 0.8, nightlife: 0.6, crime: 0.2 },
  'lake-amaro': { name: 'Lake Amaro', income: 0.35, medianIncome: 41000, priceIndex: 0.9, rentIndex: 0.75, tourist: 0.2, nightlife: 0.05, crime: 0.25 },
  'citrus-flats': { name: 'Citrus Flats', income: 0.25, medianIncome: 33000, priceIndex: 0.86, rentIndex: 0.6, tourist: 0.02, nightlife: 0.02, crime: 0.3 },
  'sawpalm-ridge': { name: 'Sawpalm Ridge', income: 0.4, medianIncome: 46000, priceIndex: 0.95, rentIndex: 0.7, tourist: 0.35, nightlife: 0.0, crime: 0.1 },
  'port-cassia': { name: 'Port Cassia', income: 0.5, medianIncome: 57000, priceIndex: 1.0, rentIndex: 1.0, tourist: 0.35, nightlife: 0.3, crime: 0.2 },
};
// Names the city modules report (city.districtAt) -> district id.
const ALIASES = {
  'miami-beach': 'south-beach', 'south-pointe': 'south-beach', flamingo: 'south-beach', 'flamingo-lummus': 'south-beach', 'city-center': 'south-beach',
  'lincoln-road': 'south-beach', 'ocean-drive': 'south-beach', 'bayshore': 'mid-beach', 'oceanfront': 'mid-beach', 'nautilus': 'mid-beach', 'la-gorce': 'mid-beach',
  'star-island': 'bay-islands', 'palm-island': 'bay-islands', 'hibiscus-island': 'bay-islands', 'fisher-island': 'bay-islands', 'venetian-islands': 'bay-islands',
  'san-marco-island': 'bay-islands', 'di-lido-island': 'bay-islands', 'rivo-alto-island': 'bay-islands', 'belle-isle': 'bay-islands', 'sunset-islands': 'bay-islands',
  'brickell-key': 'brickell', 'the-roads': 'brickell', 'port-of-miami': 'port', portmiami: 'port', 'dodge-island': 'port', 'lummus-island': 'port', 'watson-island': 'downtown',
  'park-west': 'downtown', 'omni': 'edgewater', 'arts-and-entertainment-district': 'edgewater', 'midtown': 'wynwood', 'allapattah': 'overtown', 'east-little-havana': 'little-havana',
  'west-little-havana': 'little-havana', 'riverside': 'little-havana', 'shenandoah': 'little-havana', 'calle-ocho': 'little-havana', 'buena-vista': 'design-district',
  'little-haiti': 'overtown', 'coconut-grove': 'brickell', 'coral-way': 'south-suburbs', 'central-wetlands': 'everglades', 'the-keys': 'middle-keys',
  'tern-key-airfield': 'tern-key', 'solana-international-airport': 'airport', 'sawpalm-ridge-state-park': 'sawpalm-ridge',
};
const DEFAULT_DISTRICT = { id: 'unknown', name: 'Southline', income: 0.5, medianIncome: 58000, priceIndex: 1.0, rentIndex: 1.0, tourist: 0.2, nightlife: 0.2, crime: 0.35 };
export const tierOf = (income) => (income >= 0.92 ? 'luxury' : income >= 0.66 ? 'high' : income >= 0.34 ? 'mid' : 'low');

// ---------------------------------------------------------------------------------------------------------------------
// Jobs. `realHour` is the expected take per REAL hour of playing that job well at Standard difficulty (the balance target);
// the per-task numbers are what job code actually pays through game.economy.wageFor / game.wallet.wage.
// tips are cash; base pay of payroll jobs is direct-deposited.
export const JOBS = {
  delivery:    { name: 'Package and food delivery', kind: 'task', perTask: [14, 34], tasksPerRealHour: 26, tipRate: 0.22, payroll: false, realHour: 760, unlock: 'start' },
  taxi:        { name: 'Taxi driver', kind: 'task', perTask: [16, 58], tasksPerRealHour: 20, tipRate: 0.18, payroll: false, realHour: 870, unlock: 'start' },
  rideshare:   { name: 'Rideshare driver', kind: 'task', perTask: [11, 46], tasksPerRealHour: 24, tipRate: 0.14, payroll: true, realHour: 780, unlock: 'own a car' },
  valet:       { name: 'Hotel valet', kind: 'shift', hourly: 16, tipsPerTask: [3, 20], tasksPerRealHour: 34, payroll: true, realHour: 640, unlock: 'start' },
  lifeguard:   { name: 'Lifeguard shift', kind: 'shift', hourly: 21, bonusPerRescue: [60, 140], rescuesPerRealHour: 4, payroll: true, realHour: 620, unlock: 'start' },
  tow_truck:   { name: 'Tow truck operator', kind: 'task', perTask: [55, 130], tasksPerRealHour: 13, tipRate: 0.05, payroll: false, realHour: 1260, unlock: 'tow truck' },
  boat_tours:  { name: 'Boat tour captain', kind: 'task', perTask: [140, 320], tasksPerRealHour: 6, tipRate: 0.2, payroll: false, realHour: 1650, unlock: 'own a boat' },
  ambulance:   { name: 'Paramedic', kind: 'task', perTask: [70, 150], tasksPerRealHour: 12, tipRate: 0, payroll: true, realHour: 1320, unlock: 'ambulance' },
  firefighter: { name: 'Firefighter', kind: 'task', perTask: [110, 240], tasksPerRealHour: 8, tipRate: 0, payroll: true, realHour: 1400, unlock: 'fire truck' },
  vigilante:   { name: 'Bounty work', kind: 'task', perTask: [150, 420], tasksPerRealHour: 6, tipRate: 0, payroll: false, realHour: 1710, unlock: 'police contact' },
  fishing:     { name: 'Selling your catch', kind: 'task', perTask: [6, 95], tasksPerRealHour: 22, tipRate: 0, payroll: false, realHour: 720, unlock: 'rod' },
  street_race: { name: 'Street races', kind: 'prize', buyIn: [100, 2500], prizeMul: 3.2, eventsPerRealHour: 7, winRate: 0.45, realHour: 2600, unlock: 'fast car' },
  boat_race:   { name: 'Boat races', kind: 'prize', buyIn: [250, 5000], prizeMul: 3.0, eventsPerRealHour: 5, winRate: 0.45, realHour: 3300, unlock: 'fast boat' },
  store_robbery: { name: 'Robbing a store register', kind: 'crime', perTask: [180, 950], tasksPerRealHour: 5, realHour: 2400, unlock: 'weapon', heat: 'high' },
  mugging:     { name: 'Mugging', kind: 'crime', perTask: [20, 260], tasksPerRealHour: 14, realHour: 1500, unlock: 'start', heat: 'medium' },
  car_theft_fence: { name: 'Stolen cars to a chop shop', kind: 'crime', perTask: [350, 9000], tasksPerRealHour: 4, realHour: 4200, unlock: 'chop shop contact', heat: 'medium' },
  heist_small: { name: 'Small heist (jewelry store, armored truck)', kind: 'heist', take: [40000, 140000], crewCut: 0.45, realHoursEach: 1.2, realHour: 42000, unlock: 'story act 1' },
  heist_big:   { name: 'Big heist (bank vault, port, yacht, casino)', kind: 'heist', take: [350000, 2400000], crewCut: 0.5, realHoursEach: 2.2, realHour: 310000, unlock: 'story act 2' },
};

// ---------------------------------------------------------------------------------------------------------------------
// Price anchors. Every track that sells one of these should start from the anchor and vary around it (±15%).
export const ANCHORS = {
  cars: {
    beater: { label: 'Used beater (20-year-old sedan, high miles)', price: 3200 },
    compact: { label: 'Compact / hatchback', price: 21500 },
    sedan: { label: 'Family sedan', price: 28500 },
    taxi: { label: 'Retired taxi', price: 9500 },
    van: { label: 'Work van', price: 38000 },
    pickup: { label: 'Pickup truck', price: 44000 },
    suv: { label: 'SUV', price: 48000 },
    muscle: { label: 'Muscle car', price: 56000 },
    sports: { label: 'Sports car', price: 92000 },
    luxury_sedan: { label: 'Luxury sedan', price: 118000 },
    super_orange: { label: 'Orange mid-engine supercar', price: 315000 },
    hero_suv: { label: 'Green super-SUV (hero)', price: 248000 },
    hero_v10: { label: 'Red V10 supercar (hero)', price: 268000 },
    hero_v12: { label: 'Graphite V12 flagship (hero)', price: 640000 },
    hero_hyper: { label: 'Purple two-tone hypercar (hero)', price: 3400000 },
    dirt_bike: { label: 'Dirt bike', price: 6800 },
    scooter: { label: 'Scooter', price: 2900 },
  },
  boats: {
    skiff: { label: 'Flats skiff with a small outboard', price: 8500 },
    jet_ski: { label: 'Jet ski', price: 14500 },
    center_console: { label: 'Center console, 24 ft', price: 96000 },
    speedboat: { label: 'Speedboat, 30 ft', price: 185000 },
    sailboat: { label: 'Sailboat, 34 ft', price: 125000 },
    fishing_boat: { label: 'Sport-fishing boat, 36 ft', price: 265000 },
    cruiser_40: { label: 'Cruiser yacht, 40 ft', price: 660000 },
    yacht_80: { label: 'Motor yacht, 80 ft', price: 4600000 },
    superyacht_120: { label: 'Superyacht, 120 ft', price: 18500000 },
  },
  aircraft: {
    small_plane: { label: 'Single-engine plane', price: 420000 },
    seaplane: { label: 'Seaplane', price: 780000 },
    helicopter: { label: 'Light helicopter', price: 1950000 },
  },
  property: {
    apartment_low: { label: 'Run-down one-bedroom (Overtown, Little Havana)', price: 148000, rentPerWeek: 340 },
    apartment_mid: { label: 'Two-bedroom apartment (Little Havana, suburbs)', price: 295000, rentPerWeek: 540 },
    loft: { label: 'Warehouse loft (Wynwood)', price: 485000, rentPerWeek: 820 },
    condo: { label: 'Bayfront condo (Edgewater)', price: 730000, rentPerWeek: 1150 },
    highrise: { label: 'High-rise condo (Brickell, Downtown)', price: 1150000, rentPerWeek: 1700 },
    art_deco: { label: 'Art Deco apartment (South Beach)', price: 870000, rentPerWeek: 1450 },
    canal_house: { label: 'Canal house (South Suburbs)', price: 640000, rentPerWeek: 980 },
    keys_house: { label: 'Keys waterfront house', price: 890000, rentPerWeek: 1300 },
    penthouse: { label: 'Penthouse (Brickell)', price: 4900000, rentPerWeek: 6800 },
    mansion: { label: 'Bay island mansion with a dock', price: 22500000, rentPerWeek: null },
    garage_2: { label: 'Two-car garage unit', price: 46000, rentPerWeek: 95 },
    garage_6: { label: 'Six-car garage', price: 185000, rentPerWeek: 320 },
    garage_12: { label: 'Twelve-car showroom garage', price: 660000, rentPerWeek: null },
    slip_small: { label: 'Marina slip up to 30 ft', price: 19000, rentPerWeek: 125 },
    slip_large: { label: 'Marina slip up to 90 ft', price: 98000, rentPerWeek: 620 },
    slip_super: { label: 'Superyacht berth', price: 420000, rentPerWeek: 2600 },
    hangar: { label: 'Airfield hangar', price: 310000, rentPerWeek: 900 },
  },
  hotelNight: { motel: 79, budget: 119, mid: 199, boutique: 329, luxury: 640, suite: 1850 },
  businesses: { convenience: 120000, car_wash: 185000, garage: 430000, restaurant: 660000, marina: 1950000, nightclub: 2850000 },
  clothing: { budget_tee: 12, mid_shirt: 48, designer_shirt: 420, budget_shoes: 35, running_shoes: 130, sneaker_drop: 260, luxury_shoes: 890, luxury_bag: 3400, suit_mid: 380, suit_luxury: 3200, watch_luxury: 14500 },
  services: { haircut_barber: 28, haircut_salon: 85, tattoo_small: 120, tattoo_large: 650, gym_day: 15, gym_month: 49, car_wash: 14, car_repair_minor: 180, car_repair_major: 1400, respray: 650, fuel_per_gallon: 3.45, taxi_base: 2.95, taxi_per_mile: 2.4, rideshare_per_mile: 1.55, bus_fare: 2.25, scooter_unlock: 1, scooter_per_minute: 0.39, hospital_bill: 850, bail_per_star: 450, impound_fee: 180, impound_per_day: 35, bribe_one_star: 400 },
  fines: { parking: 45, littering: 100, red_light: 158, speeding_base: 129, speeding_per_mph: 11, reckless: 500, no_insurance: 150, dui: 1000, late_fee: 0.25 },
  food: { cafecito: 1.25, hot_dog: 4.5, slice: 4, burger_combo: 11.5, cuban_sandwich: 10.5, sushi_roll: 9, steak_dinner: 58, coffee: 3.75, soda: 2.29, water: 1.79, beer_store: 2.5, beer_bar: 8, cocktail: 16, bottle_service: 450, coconut: 5, churros: 4, ice_cream: 5.5 },
};

// ---------------------------------------------------------------------------------------------------------------------
// Shop hours. A schedule has 7 entries, Sunday first. Each entry is null (closed), [open, close] or a list of ranges.
// `close` may pass 24 (a bar open until 3 AM is [16, 27]). Hours are clock hours (17.5 = 5:30 PM).
const all = (o, c) => Array.from({ length: 7 }, () => [o, c]);
const week = (sun, mon, tue, wed, thu, fri, sat) => [sun, mon, tue, wed, thu, fri, sat];
const wk = (weekday, sat, sun) => week(sun, weekday, weekday, weekday, weekday, weekday, sat);
export const OPEN_24H = all(0, 24);
export const HOURS = {
  convenience: all(6, 24), fuel: OPEN_24H, supermarket: all(7, 22), pharmacy: wk([8, 22], [9, 21], [10, 18]), 'liquor-store': wk([10, 22], [10, 23], [12, 20]),
  bank: wk([9, 17], [9, 13], null), 'post-office': wk([9, 17], [9, 13], null), courthouse: wk([8.5, 16.5], null, null), 'lottery-office': wk([8, 17], null, null),
  restaurant: week([11, 22], [11.5, 22], [11.5, 22], [11.5, 22], [11.5, 23], [11.5, 24], [11, 24]),
  'fast-food': all(6, 25), 'drive-thru': OPEN_24H, coffee: wk([6, 20], [7, 20], [7, 18]), 'cuban-cafe': all(6, 21), bakery: wk([6, 19], [6, 19], [7, 15]),
  'ice-cream': all(11, 23), 'juice-bar': wk([7, 19], [8, 19], [8, 17]), 'street-vendor': all(10, 19), 'food-truck': all(11, 23),
  bar: week([14, 26], [16, 26], [16, 26], [16, 26], [16, 27], [15, 29], [13, 29]),
  nightclub: week([22, 29], null, null, null, [22, 28], [22, 29], [22, 29]),
  gaming: week([10, 28], [10, 26], [10, 26], [10, 26], [10, 26], [10, 28], [10, 28]),
  hotel: OPEN_24H, hospital: OPEN_24H, police: OPEN_24H, 'fire-station': OPEN_24H, airport: OPEN_24H, marina: all(7, 19), impound: all(7, 22),
  fashion: wk([10, 21], [10, 21], [12, 18]), 'shoe-store': wk([10, 21], [10, 21], [11, 19]), sportswear: wk([10, 21], [10, 21], [11, 19]), jewelry: wk([10, 19], [10, 19], [12, 17]),
  'department-store': wk([10, 21], [10, 21], [11, 19]), 'discount-store': all(8, 22), 'electronics-store': wk([10, 21], [10, 21], [11, 19]), phone: wk([10, 20], [10, 20], [11, 18]),
  salon: week(null, [9, 19], [9, 19], [9, 19], [9, 20], [9, 20], [9, 18]), barber: week(null, null, [9, 19], [9, 19], [9, 20], [9, 20], [8, 18]), tattoo: week([12, 20], null, [12, 22], [12, 22], [12, 22], [12, 24], [12, 24]),
  gym: wk([5, 23], [7, 21], [8, 20]), 'gun-store': wk([10, 19], [10, 18], null), laundromat: all(6, 23), pawn: wk([9, 19], [9, 18], [11, 16]),
  'hardware-store': wk([7, 20], [7, 20], [9, 18]), 'car-dealer': wk([9, 20], [9, 20], [11, 18]), garage: wk([8, 18], [8, 15], null), 'car-wash': all(8, 19), 'auto-parts': wk([8, 21], [8, 21], [9, 19]),
  bookstore: wk([9, 21], [9, 21], [10, 19]), 'pet-store': wk([9, 20], [9, 20], [10, 18]), florist: wk([8, 18], [8, 17], [9, 14]), 'smoke-shop': all(9, 24), souvenir: all(9, 23),
  'dry-cleaner': wk([7, 19], [8, 16], null), thrift: wk([10, 19], [10, 19], [11, 17]), botanica: wk([9, 19], [9, 19], [10, 15]), optical: wk([9, 18], [9, 16], null),
  tackle: all(5.5, 19), 'dive-shop': all(7, 18), 'surf-shop': all(9, 20), 'marine-supply': wk([7, 18], [7, 17], [8, 14]), 'bike-shop': wk([10, 19], [10, 18], [11, 16]),
  church: week([7, 20], [8, 18], [8, 18], [8, 20], [8, 18], [8, 18], [8, 19]), school: wk([7.5, 15.5], null, null), office: wk([8, 18], null, null), medical: wk([8, 18], [9, 13], null),
  cinema: all(11, 25), entertainment: week([10, 24], [11, 23], [11, 23], [11, 23], [11, 24], [11, 26], [10, 26]), gallery: week([11, 17], null, [10, 18], [10, 18], [10, 18], [10, 20], [10, 20]),
  attraction: all(9, 19), storage: all(6, 22), 'real-estate': wk([9, 18], [10, 16], [11, 15]), insurance: wk([9, 17.5], null, null), legal: wk([9, 18], null, null),
  'car-rental': all(7, 23), 'home-store': wk([10, 20], [10, 20], [11, 18]), toys: wk([10, 20], [10, 20], [11, 18]), 'music-store': wk([10, 20], [10, 20], [12, 18]),
  'party-store': wk([9, 20], [9, 20], [10, 18]), finance: wk([8, 19], [9, 17], null), 'warehouse-club': wk([10, 20.5], [9.5, 18], [10, 18]), towing: OPEN_24H, default: all(9, 21),
};
// Chance that one particular shop of a type is a 24-hour location.
const ALWAYS_OPEN_CHANCE = { convenience: 0.45, pharmacy: 0.15, gym: 0.25, 'fast-food': 0.2, supermarket: 0.08, laundromat: 0.2, 'smoke-shop': 0.1 };
const TYPE_ALIASES = { gas: 'fuel', gas_station: 'fuel', 'gas-station': 'fuel', store: 'convenience', bodega: 'convenience', mart: 'convenience', liquor: 'liquor-store', guns: 'gun-store', clothing: 'fashion',
  clothes: 'fashion', shoes: 'shoe-store', electronics: 'electronics-store', club: 'nightclub', cafe: 'coffee', diner: 'restaurant', grocery: 'supermarket', hardware: 'hardware-store',
  barbershop: 'barber', dealer: 'car-dealer', dealership: 'car-dealer', carwash: 'car-wash', car_wash: 'car-wash', pawnshop: 'pawn', casino: 'gaming', clinic: 'medical', vendor: 'street-vendor', cart: 'street-vendor' };

const normType = (t) => { const s = slug(t || 'default'); return HOURS[s] ? s : (TYPE_ALIASES[s] || TYPE_ALIASES[String(t)] || (HOURS[s.replace(/s$/, '')] ? s.replace(/s$/, '') : 'default')); };
const ranges = (entry) => (!entry ? [] : Array.isArray(entry[0]) ? entry : [entry]);
const hourLabel = (h) => clockText(h % 24).replace(':00', '');

export function createEconomy(sys) {
  const { host } = sys;
  const custom = {};  // shop types defined by other tracks

  const E = { districts: DISTRICTS, jobs: JOBS, anchors: ANCHORS, tierOf };

  E.districtId = (name) => {
    if (!name) return null;
    const s = slug(name);
    if (DISTRICTS[s]) return s;
    if (ALIASES[s]) return ALIASES[s];
    for (const id of Object.keys(DISTRICTS)) if (s.includes(id) || id.includes(s)) return id;
    for (const a of Object.keys(ALIASES)) if (s.includes(a)) return ALIASES[a];
    return null;
  };
  // district('Brickell') | district('brickell') | district(x, z)
  E.district = (a, z) => {
    let name = a;
    if (typeof a === 'number' && typeof z === 'number') { try { name = host.city?.districtAt?.(a, z) || null; } catch (e) { name = null; } }
    else if (a && typeof a === 'object') { try { name = host.city?.districtAt?.(a.x, a.z) || null; } catch (e) { name = null; } }
    const id = E.districtId(name);
    const d = id ? DISTRICTS[id] : DEFAULT_DISTRICT;
    return { id: id || 'unknown', ...d, name: id ? d.name : (typeof name === 'string' && name ? name : d.name), tier: tierOf(d.income) };
  };
  E.here = () => { const p = host.player?.position; return p ? E.district(p.x, p.z) : E.district(null); };

  // A catalog price as charged in a place: district price index, kind-specific sensitivity, difficulty.
  // kind: 'grocery' barely moves with the neighborhood, 'service' and 'rent' move a lot.
  const SENS = { grocery: 0.35, fuel: 0.25, food: 0.7, drink: 0.8, service: 1.0, retail: 0.5, luxury: 0.15, rent: 1.0, vehicle: 0, fixed: 0 };
  E.price = (base, opts = {}) => {
    const d = opts.district ? (typeof opts.district === 'string' ? E.district(opts.district) : opts.district) : null;
    const sens = SENS[opts.kind] ?? 0.5;
    const idx = d ? 1 + (d.priceIndex - 1) * sens : 1;
    const diff = opts.noDifficulty ? 1 : (sys.settingsStore?.difficulty.priceMul ?? 1);
    const v = Number(base) * idx * diff * (opts.mul ?? 1);
    return v >= 100 ? Math.round(v) : v >= 20 ? Math.round(v * 2) / 2 : Math.round(v * 100) / 100;
  };

  // What a job pays for a piece of work. The caller says what happened; this returns { gross, tips }.
  // opts: { tasks, hours (game hours on shift), performance 0..1, distanceKm, rating 0..1, district, seed }
  E.wageFor = (jobId, opts = {}) => {
    const j = JOBS[jobId];
    if (!j) return { gross: 0, tips: 0 };
    const perf = clamp(opts.performance ?? 0.75), pay = sys.settingsStore?.difficulty.payMul ?? 1;
    const d = opts.district ? E.district(opts.district) : E.here();
    const r = hash01('wage', jobId, opts.seed ?? sys.time?.now ?? 0);
    let gross = 0, tips = 0;
    const tasks = Math.max(0, opts.tasks ?? (j.kind === 'task' || j.kind === 'crime' ? 1 : 0));
    if (j.perTask) {
      const [lo, hi] = j.perTask;
      // longer trips pay toward the top of the range
      const size = opts.distanceKm !== undefined ? clamp(opts.distanceKm / 4) : 0.25 + 0.5 * r;
      gross += tasks * (lo + (hi - lo) * clamp(size * (0.7 + 0.6 * perf)));
    }
    if (j.hourly) gross += j.hourly * Math.max(0, opts.hours ?? 0);
    if (j.tipRate) tips += gross * j.tipRate * (0.4 + 1.2 * perf) * (0.7 + 0.6 * d.income + 0.3 * d.tourist);
    if (j.tipsPerTask) { const [lo, hi] = j.tipsPerTask; tips += tasks * (lo + (hi - lo) * clamp(0.15 + 0.5 * perf * (0.5 + d.income) * (0.6 + 0.8 * r))); }
    if (j.bonusPerRescue && opts.rescues) { const [lo, hi] = j.bonusPerRescue; gross += opts.rescues * (lo + (hi - lo) * perf); }
    return { gross: Math.round(gross * pay * 100) / 100, tips: Math.round(tips * pay * 100) / 100 };
  };

  // ---------------------------------------------------------------- shop hours
  const H = {};
  H.types = () => [...new Set([...Object.keys(HOURS), ...Object.keys(custom)])];
  H.define = (type, schedule) => { custom[slug(type)] = schedule; };
  H.forType = (type) => custom[slug(type || '')] || HOURS[normType(type)];
  // A particular shop: { type, id | seed, hours?, always?: bool, schedule? }. Seeded variation so neighbors differ.
  H.forShop = (shop) => {
    if (!shop || typeof shop === 'string') return H.forType(shop);
    if (shop.schedule) return shop.schedule;
    const type = shop.type || shop.kind || shop.category;
    const key = shop.id ?? shop.seed ?? shop.name ?? `${shop.x},${shop.z}`;
    if (shop.always === true || shop.hours === 24) return OPEN_24H;
    if (Array.isArray(shop.hours) && shop.hours.length === 2 && typeof shop.hours[0] === 'number') return all(shop.hours[0], shop.hours[1] <= shop.hours[0] ? shop.hours[1] + 24 : shop.hours[1]);
    const base = H.forType(type), t = custom[slug(type || '')] ? slug(type) : normType(type);
    if (base === OPEN_24H) return base;
    if (shop.always !== false && hash01('always', key, t) < (ALWAYS_OPEN_CHANCE[t] || 0)) return OPEN_24H;
    // shift opening and closing by -30, 0 or +30 minutes (and +60 for late closers), the same every day for this shop
    const dO = [-0.5, 0, 0, 0.5][Math.floor(hash01('open', key) * 4)], dC = [-0.5, 0, 0, 0.5, 1][Math.floor(hash01('close', key) * 5)];
    return base.map((e) => (e ? ranges(e).map(([o, c]) => [clamp(o + dO, 0, 23.5), Math.max(o + dO + 1, c + dC)]) : null)).map((e) => (e && e.length === 1 ? e[0] : e));
  };
  function evalAt(schedule, now) {
    const DAYM = 1440, dayIdx = Math.floor(now / DAYM), hour = (now - dayIdx * DAYM) / 60;
    const wd = sys.time ? ((sys.time.weekday + (dayIdx - Math.floor(sys.time.now / DAYM))) % 7 + 7) % 7 : 0;
    // open now? today's ranges, or yesterday's ranges that run past midnight
    let closesIn = null;
    for (const [o, c] of ranges(schedule[wd])) if (hour >= o && hour < c) closesIn = Math.max(closesIn ?? 0, (c - hour) * 60);
    for (const [, c] of ranges(schedule[(wd + 6) % 7])) if (c > 24 && hour < c - 24) closesIn = Math.max(closesIn ?? 0, (c - 24 - hour) * 60);
    if (closesIn !== null) {
      // a range that ends exactly when the next begins (24 h places) never really closes
      let always = true;
      for (let i = 0; i < 7; i++) { const r = ranges(schedule[i]); if (!(r.length === 1 && r[0][0] <= 0 && r[0][1] >= 24)) { always = false; break; } }
      return { open: true, closesIn: always ? Infinity : closesIn, opensIn: 0, always };
    }
    let opensIn = Infinity;
    for (let i = 0; i < 8 && opensIn === Infinity; i++) {
      for (const [o] of ranges(schedule[(wd + i) % 7])) { const m = (i * 24 + o - hour) * 60; if (m > 0 && m < opensIn) opensIn = m; }
    }
    return { open: false, closesIn: 0, opensIn, always: false };
  }
  H.isOpen = (shopOrType, now = sys.time?.now ?? 540) => evalAt(H.forShop(shopOrType), now).open;
  H.status = (shopOrType, now = sys.time?.now ?? 540) => {
    const s = evalAt(H.forShop(shopOrType), now);
    const at = (mins) => hourLabel(((now + mins) % 1440) / 60);
    s.text = s.always ? 'Open 24 hours' : s.open ? `Open until ${at(s.closesIn)}` : s.opensIn === Infinity ? 'Closed' : s.opensIn > 1440 ? 'Closed today' : `Closed · opens ${at(s.opensIn)}`;
    return s;
  };
  // One line per day for a door sign: [{ day: 'Sunday', text: '10 AM - 6 PM' }]
  H.sign = (shopOrType) => {
    const sch = H.forShop(shopOrType), names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return sch.map((e, i) => ({ day: names[i], text: !e ? 'Closed' : ranges(e).map(([o, c]) => (o <= 0 && c >= 24 ? 'Open 24 hours' : `${hourLabel(o)} - ${hourLabel(c)}`)).join(', ') }));
  };
  // Rush hour and general street activity 0..1 for traffic and pedestrians (weekday commuter peaks, weekend nights).
  E.activity = (now = sys.time?.now ?? 540) => {
    const DAYM = 1440, hour = ((now % DAYM) + DAYM) % DAYM / 60, wd = sys.time ? sys.time.weekday : 5, weekend = wd === 0 || wd === 6;
    const bump = (c, w) => Math.exp(-((hour - c) * (hour - c)) / (2 * w * w));
    const traffic = weekend ? 0.25 + 0.45 * bump(14, 4) + 0.3 * bump(21.5, 2.5) : 0.18 + 0.75 * bump(8.2, 1.1) + 0.35 * bump(12.5, 1.2) + 0.85 * bump(17.5, 1.4) + 0.15 * bump(21, 2);
    const beach = clamp(bump(13, 2.6) * (weekend ? 1 : 0.7));
    const lateDay = wd === 5 || wd === 6 || (wd === 0 && hour < 6), h2 = hour < 6 ? hour + 24 : hour;
    const nightlife = clamp(Math.exp(-((h2 - 25) * (h2 - 25)) / (2 * 2.2 * 2.2)) * (lateDay ? 1 : 0.55));
    return { traffic: clamp(traffic), rushHour: !weekend && (bump(8.2, 1.1) > 0.6 || bump(17.5, 1.4) > 0.6), beach, nightlife, weekend };
  };

  E.hours = H;
  return E;
}
