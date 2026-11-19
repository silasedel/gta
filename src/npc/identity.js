// Who a person is (NPC-AI track). One seed -> a complete, stable individual: name, age, heritage, job, income, home,
// personality traits, likes, habits, voice. Everything else (looks, schedule, reactions, lines) reads from this.
import { rng, clamp, hashInts } from './rand.js';

// ---------------------------------------------------------------- names (all invented combinations of common names)
const FIRST = {
  cuban_m: [
    'Yoel',
    'Reinaldo',
    'Osvaldo',
    'Lazaro',
    'Yunior',
    'Ernesto',
    'Raul',
    'Orlando',
    'Fidelio',
    'Humberto',
    'Roberto',
    'Yasmani',
    'Alexis',
    'Julio',
    'Armando',
    'Ramon',
    'Eduardo',
    'Leonel',
    'Maikel',
    'Dariel',
    'Abel',
    'Nelson',
    'Pedro',
    'Felix',
    'Gilberto',
    'Tomas',
    'Evelio',
    'Rolando',
    'Ismael',
    'Norberto',
    'Cesar',
    'Yandy',
    'Omar',
    'Ruben',
    'Sergio',
    'Agustin',
    'Bernardo',
    'Emilio',
    'Gerardo',
    'Hector',
  ],
  cuban_f: [
    'Yamile',
    'Caridad',
    'Mercedes',
    'Odalys',
    'Yanet',
    'Maritza',
    'Idania',
    'Barbara',
    'Zoila',
    'Daymi',
    'Mirta',
    'Lourdes',
    'Niurka',
    'Yusleidy',
    'Marisol',
    'Xiomara',
    'Elena',
    'Daisy',
    'Migdalia',
    'Aleida',
    'Belkis',
    'Dulce',
    'Esperanza',
    'Gladys',
    'Hilda',
    'Iraida',
    'Juana',
    'Leticia',
    'Magaly',
    'Noemi',
    'Olga',
    'Raquel',
    'Teresa',
    'Vivian',
    'Yolanda',
    'Zenaida',
    'Ana Maria',
    'Beatriz',
    'Carmen',
    'Dayana',
  ],
  latino_m: [
    'Mateo',
    'Santiago',
    'Andres',
    'Camilo',
    'Diego',
    'Esteban',
    'Felipe',
    'Gustavo',
    'Ivan',
    'Javier',
    'Kevin',
    'Luis',
    'Marco',
    'Nicolas',
    'Oscar',
    'Pablo',
    'Rafael',
    'Sebastian',
    'Tito',
    'Victor',
    'Wilmer',
    'Alejandro',
    'Brayan',
    'Cristian',
    'Daniel',
    'Edgar',
    'Fabian',
    'Giovanni',
    'Hugo',
    'Jairo',
    'Jorge',
    'Leandro',
    'Manuel',
    'Nestor',
    'Ricardo',
    'Samuel',
    'Ulises',
    'Angel',
    'Bruno',
    'Joaquin',
  ],
  latino_f: [
    'Valentina',
    'Camila',
    'Daniela',
    'Estefania',
    'Gabriela',
    'Isabella',
    'Juliana',
    'Karina',
    'Laura',
    'Mariana',
    'Natalia',
    'Paola',
    'Rosa',
    'Sofia',
    'Tatiana',
    'Veronica',
    'Ximena',
    'Yesenia',
    'Adriana',
    'Bianca',
    'Catalina',
    'Diana',
    'Erika',
    'Fernanda',
    'Gloria',
    'Ines',
    'Jimena',
    'Lorena',
    'Monica',
    'Nadia',
    'Pilar',
    'Rocio',
    'Silvia',
    'Viviana',
    'Alondra',
    'Brenda',
    'Cecilia',
    'Luz',
    'Marcela',
    'Paulina',
  ],
  haitian_m: [
    'Jean',
    'Wilner',
    'Frantz',
    'Ricardo',
    'Dieudonne',
    'Evens',
    'Jocelyn',
    'Kervens',
    'Lesly',
    'Makenson',
    'Nesly',
    'Patrick',
    'Reginald',
    'Stanley',
    'Wesner',
    'Yves',
    'Emmanuel',
    'Fritz',
    'Guerby',
    'Herold',
    'Jacques',
    'Junior',
    'Lucson',
    'Marc',
    'Olivier',
    'Pierre',
    'Rony',
    'Samuel',
    'Thierry',
    'Wadner',
  ],
  haitian_f: [
    'Marie',
    'Nadege',
    'Roseline',
    'Guerda',
    'Islande',
    'Fabiola',
    'Darline',
    'Esther',
    'Farah',
    'Ketsia',
    'Lovely',
    'Mirlande',
    'Nathalie',
    'Odette',
    'Phara',
    'Rachelle',
    'Sabine',
    'Tamara',
    'Widline',
    'Yolette',
    'Carline',
    'Djenane',
    'Edwidge',
    'Gina',
    'Jocelyne',
    'Magalie',
    'Myriam',
    'Régine',
    'Solange',
    'Venise',
  ],
  black_m: [
    'Marcus',
    'Darius',
    'Terrence',
    'Andre',
    'Jamal',
    'Malik',
    'Tyrone',
    'DeShawn',
    'Xavier',
    'Isaiah',
    'Jerome',
    'Kendrick',
    'Lamar',
    'Maurice',
    'Nathaniel',
    'Omari',
    'Quincy',
    'Rashad',
    'Tavares',
    'Vernon',
    'Wendell',
    'Antoine',
    'Byron',
    'Cedric',
    'Darnell',
    'Elijah',
    'Franklin',
    'Garrett',
    'Harold',
    'Jalen',
  ],
  black_f: [
    'Keisha',
    'Tamika',
    'Imani',
    'Jasmine',
    'Latoya',
    'Monique',
    'Nia',
    'Renee',
    'Shanice',
    'Tiana',
    'Aaliyah',
    'Brianna',
    'Chantel',
    'Deja',
    'Ebony',
    'Felicia',
    'Gwendolyn',
    'Hattie',
    'Ivory',
    'Janelle',
    'Kiara',
    'Loretta',
    'Maya',
    'Naomi',
    'Odessa',
    'Patrice',
    'Simone',
    'Tanisha',
    'Valencia',
    'Zora',
  ],
  white_m: [
    'Chad',
    'Brett',
    'Kyle',
    'Derek',
    'Scott',
    'Gary',
    'Walt',
    'Dennis',
    'Randy',
    'Todd',
    'Travis',
    'Wade',
    'Cody',
    'Dustin',
    'Glenn',
    'Howard',
    'Jeffrey',
    'Kenneth',
    'Larry',
    'Mitch',
    'Neil',
    'Preston',
    'Russ',
    'Stuart',
    'Trevor',
    'Vince',
    'Warren',
    'Zach',
    'Blake',
    'Colton',
    'Dale',
    'Earl',
    'Frank',
    'Greg',
    'Hank',
    'Ira',
    'Joel',
    'Lenny',
    'Mort',
    'Saul',
  ],
  white_f: [
    'Brittany',
    'Ashley',
    'Courtney',
    'Heather',
    'Tiffany',
    'Linda',
    'Debbie',
    'Sharon',
    'Karen',
    'Becky',
    'Tammy',
    'Wendy',
    'Amber',
    'Brooke',
    'Cheryl',
    'Donna',
    'Eileen',
    'Faith',
    'Gail',
    'Holly',
    'Irene',
    'Jolene',
    'Kelsey',
    'Lacey',
    'Madison',
    'Nora',
    'Paige',
    'Rhonda',
    'Shelby',
    'Trish',
    'Ruth',
    'Sylvia',
    'Estelle',
    'Rivka',
    'Miriam',
    'Dolores',
    'Bonnie',
    'Carla',
    'Darlene',
    'Ginger',
  ],
  asian_m: [
    'Kenji',
    'Minh',
    'Wei',
    'Arjun',
    'Daniel',
    'Hiro',
    'Jin',
    'Kiet',
    'Long',
    'Naveen',
    'Paolo',
    'Quan',
    'Raj',
    'Sanjay',
    'Tuan',
    'Vikram',
    'Winston',
    'Yuto',
    'Bao',
    'Chen',
    'Dae',
    'Eric',
    'Feng',
    'Gabe',
    'Hao',
  ],
  asian_f: [
    'Mei',
    'Linh',
    'Priya',
    'Hana',
    'Jia',
    'Kimiko',
    'Lan',
    'Mina',
    'Nisha',
    'Olivia',
    'Pooja',
    'Rina',
    'Suki',
    'Thuy',
    'Uma',
    'Vanessa',
    'Wen',
    'Xin',
    'Yuki',
    'Anh',
    'Bich',
    'Cindy',
    'Divya',
    'Emi',
    'Grace',
  ],
  euro_m: [
    'Lars',
    'Matteo',
    'Pierre',
    'Jonas',
    'Sven',
    'Luca',
    'Hugo',
    'Dmitri',
    'Anton',
    'Nils',
    'Fabrizio',
    'Gunther',
    'Henrik',
    'Igor',
    'Klaus',
    'Marcel',
    'Olaf',
    'Stefan',
    'Tobias',
    'Viktor',
  ],
  euro_f: [
    'Ingrid',
    'Chiara',
    'Amelie',
    'Katja',
    'Elsa',
    'Giulia',
    'Heidi',
    'Irina',
    'Jana',
    'Lena',
    'Margaux',
    'Nina',
    'Oksana',
    'Petra',
    'Renata',
    'Sanne',
    'Tatjana',
    'Ulla',
    'Vera',
    'Zofia',
  ],
};
const LAST = {
  cuban: [
    'Hernandez',
    'Perez',
    'Gonzalez',
    'Rodriguez',
    'Fernandez',
    'Garcia',
    'Diaz',
    'Alvarez',
    'Valdes',
    'Suarez',
    'Cabrera',
    'Dominguez',
    'Echevarria',
    'Fuentes',
    'Guerra',
    'Iglesias',
    'Lima',
    'Machado',
    'Noriega',
    'Oliva',
    'Pardo',
    'Quintana',
    'Riveron',
    'Sardinas',
    'Tamayo',
    'Urrutia',
    'Vazquez',
    'Zayas',
    'Acosta',
    'Barrios',
    'Cordero',
    'Delgado',
    'Estrada',
    'Ferrer',
    'Galindo',
    'Leyva',
    'Mesa',
    'Pino',
    'Ravelo',
    'Sotolongo',
  ],
  latino: [
    'Ramirez',
    'Torres',
    'Flores',
    'Rivera',
    'Gomez',
    'Morales',
    'Ortiz',
    'Gutierrez',
    'Chavez',
    'Ramos',
    'Castillo',
    'Mendoza',
    'Ruiz',
    'Vargas',
    'Castro',
    'Jimenez',
    'Moreno',
    'Romero',
    'Herrera',
    'Medina',
    'Aguilar',
    'Vega',
    'Soto',
    'Rojas',
    'Contreras',
    'Salazar',
    'Luna',
    'Ortega',
    'Guerrero',
    'Reyes',
    'Cardenas',
    'Zapata',
    'Pineda',
    'Montoya',
    'Restrepo',
    'Bolivar',
    'Quiroga',
    'Arango',
    'Bermudez',
    'Cifuentes',
  ],
  haitian: [
    'Jean-Baptiste',
    'Pierre',
    'Joseph',
    'Louis',
    'Charles',
    'Etienne',
    'Francois',
    'Augustin',
    'Desir',
    'Estime',
    'Fleurimond',
    'Guerrier',
    'Hyppolite',
    'Innocent',
    'Jeune',
    'Laguerre',
    'Michel',
    'Noel',
    'Paul',
    'Remy',
    'Saintil',
    'Toussaint',
    'Vilsaint',
    'Bien-Aime',
    'Celestin',
    'Dorvil',
    'Exantus',
    'Lafontant',
    'Petit-Frere',
    'Sylvain',
  ],
  black: [
    'Washington',
    'Jefferson',
    'Banks',
    'Coleman',
    'Dixon',
    'Ellis',
    'Freeman',
    'Grant',
    'Hayes',
    'Ingram',
    'Jenkins',
    'Knight',
    'Lawson',
    'Mosley',
    'Neal',
    'Owens',
    'Porter',
    'Reed',
    'Simmons',
    'Tucker',
    'Vaughn',
    'Watkins',
    'Booker',
    'Carver',
    'Dorsey',
    'Fields',
    'Gaines',
    'Hollis',
    'Joyner',
    'Mack',
  ],
  white: [
    'Miller',
    'Anderson',
    'Baker',
    'Campbell',
    'Dawson',
    'Erickson',
    'Foster',
    'Gallagher',
    'Hoffman',
    'Irwin',
    'Jacobs',
    'Keller',
    'Lindqvist',
    'Mahoney',
    'Novak',
    "O'Brien",
    'Peterson',
    'Quinn',
    'Rosen',
    'Schwartz',
    'Thornton',
    'Underwood',
    'Vance',
    'Whitaker',
    'Yoder',
    'Zimmerman',
    'Abbott',
    'Birch',
    'Calloway',
    'Drummond',
    'Epstein',
    'Feldman',
    'Goldberg',
    'Hartley',
    'Katz',
    'Lowell',
    'McAllister',
    'Nash',
    'Pruitt',
    'Sterling',
  ],
  asian: [
    'Nguyen',
    'Tran',
    'Chen',
    'Wang',
    'Patel',
    'Shah',
    'Kim',
    'Park',
    'Tanaka',
    'Sato',
    'Santos',
    'Reyes',
    'Lim',
    'Chua',
    'Singh',
    'Rao',
    'Liu',
    'Zhang',
    'Pham',
    'Le',
    'Yamamoto',
    'Kapoor',
    'Mehta',
    'Huang',
    'Dela Cruz',
  ],
  euro: [
    'Lindholm',
    'Rossi',
    'Dubois',
    'Becker',
    'Johansson',
    'Bianchi',
    'Moreau',
    'Volkov',
    'Weber',
    'Nilsson',
    'Conti',
    'Fischer',
    'Novotny',
    'Kowalski',
    'Jansen',
    'Lefevre',
    'Petrov',
    'Schmitt',
    'Van Dijk',
    'Horvat',
  ],
};
// heritage -> which body 'race' tags of the human library fit (weights)
export const HERITAGE = {
  cuban: {
    first: 'cuban',
    last: ['cuban', 'cuban', 'latino'],
    race: { latino: 4, latino2: 2, white: 3, mixed: 2, black: 1 },
  },
  latino: {
    first: 'latino',
    last: ['latino', 'latino', 'cuban'],
    race: { latino: 5, latino2: 4, mixed: 2, white: 1 },
  },
  haitian: { first: 'haitian', last: ['haitian'], race: { black: 9, mixed: 1 } },
  black: { first: 'black', last: ['black', 'black', 'white'], race: { black: 8, mixed: 2 } },
  white: { first: 'white', last: ['white'], race: { white: 9, mixed: 1 } },
  asian: { first: 'asian', last: ['asian'], race: { asian: 9, mixed: 1 } },
  euro: { first: 'euro', last: ['euro'], race: { white: 9, mixed: 1 } },
  mixed: {
    first: ['latino', 'white', 'black'],
    last: ['latino', 'white', 'black', 'cuban'],
    race: { mixed: 6, latino: 2, latino2: 2, black: 1, white: 1 },
  },
};
// who lives / works / visits where (weights by district flavor)
export const DISTRICT_MIX = {
  havana: { cuban: 55, latino: 30, white: 4, black: 4, haitian: 2, mixed: 4, asian: 1 },
  overtown: { black: 50, haitian: 18, latino: 16, cuban: 6, white: 5, mixed: 5 },
  haiti: { haitian: 55, black: 20, latino: 12, cuban: 4, white: 4, mixed: 5 },
  wynwood: { latino: 28, white: 26, cuban: 14, black: 12, mixed: 10, asian: 6, euro: 4 },
  brickell: { latino: 30, white: 24, cuban: 16, euro: 8, asian: 8, mixed: 8, black: 6 },
  downtown: {
    latino: 28,
    cuban: 18,
    white: 18,
    black: 14,
    mixed: 8,
    asian: 7,
    haitian: 4,
    euro: 3,
  },
  beach: { white: 26, latino: 22, euro: 14, cuban: 12, mixed: 10, black: 8, asian: 8 },
  port: { latino: 30, black: 22, cuban: 20, haitian: 10, white: 12, mixed: 6 },
  keys: { white: 50, cuban: 14, latino: 14, black: 8, mixed: 8, euro: 4, asian: 2 },
  suburb: { latino: 28, cuban: 22, white: 22, black: 12, haitian: 5, mixed: 7, asian: 4 },
  rural: { white: 44, latino: 30, black: 14, cuban: 4, mixed: 6, haitian: 2 },
  default: { latino: 26, cuban: 20, white: 20, black: 14, haitian: 6, mixed: 8, asian: 4, euro: 2 },
};

// ---------------------------------------------------------------- jobs
// kind: office | service | trade | street | care | none.  shift [start, end] in hours (end may pass 24).
// outfit: wardrobe archetype (look.js). street: activity performed outdoors during the shift (activities.js), if any.
// income: 0 low .. 2 high.  ages: [min, max].  w: weights by zone flavor (see zoneFlavor()).
export const JOBS = {
  accountant: { t: 'accountant', kind: 'office', shift: [9, 17.5], outfit: 'business', income: 2 },
  paralegal: { t: 'paralegal', kind: 'office', shift: [8.5, 17.5], outfit: 'business', income: 1 },
  attorney: { t: 'attorney', kind: 'office', shift: [9, 19], outfit: 'business', income: 2 },
  analyst: {
    t: 'financial analyst',
    kind: 'office',
    shift: [8, 18.5],
    outfit: 'business',
    income: 2,
  },
  broker: { t: 'yacht broker', kind: 'office', shift: [10, 18], outfit: 'business', income: 2 },
  realtor: {
    t: 'real estate agent',
    kind: 'office',
    shift: [10, 18],
    outfit: 'business',
    income: 2,
  },
  receptionist: {
    t: 'receptionist',
    kind: 'office',
    shift: [8.5, 17],
    outfit: 'business',
    income: 1,
  },
  itsupport: { t: 'IT technician', kind: 'office', shift: [9, 17.5], outfit: 'smart', income: 1 },
  teller: { t: 'bank teller', kind: 'office', shift: [8.5, 16.5], outfit: 'business', income: 1 },
  architect: { t: 'architect', kind: 'office', shift: [9.5, 18.5], outfit: 'smart', income: 2 },
  adjuster: {
    t: 'insurance adjuster',
    kind: 'office',
    shift: [8.5, 17],
    outfit: 'smart',
    income: 1,
  },
  barista: { t: 'barista', kind: 'service', shift: [6, 14], outfit: 'service', income: 0 },
  cook: { t: 'line cook', kind: 'service', shift: [10, 22], outfit: 'kitchen', income: 0 },
  server: { t: 'server', kind: 'service', shift: [11, 21], outfit: 'service', income: 0 },
  bartender: { t: 'bartender', kind: 'service', shift: [17, 27], outfit: 'night', income: 1 },
  housekeeper: {
    t: 'hotel housekeeper',
    kind: 'service',
    shift: [7, 15.5],
    outfit: 'scrubs',
    income: 0,
  },
  frontdesk: {
    t: 'hotel front desk clerk',
    kind: 'service',
    shift: [7, 15],
    outfit: 'business',
    income: 1,
  },
  cashier: { t: 'cashier', kind: 'service', shift: [9, 18], outfit: 'service', income: 0 },
  retail: { t: 'sales associate', kind: 'service', shift: [10, 19], outfit: 'smart', income: 0 },
  barber: { t: 'barber', kind: 'service', shift: [9, 19], outfit: 'casual', income: 1 },
  nailtech: { t: 'nail technician', kind: 'service', shift: [10, 19], outfit: 'casual', income: 0 },
  pharmtech: {
    t: 'pharmacy technician',
    kind: 'care',
    shift: [8, 17],
    outfit: 'scrubs',
    income: 1,
  },
  nurse: { t: 'nurse', kind: 'care', shift: [7, 19.5], outfit: 'scrubs', income: 1 },
  nurse_night: {
    t: 'night-shift nurse',
    kind: 'care',
    shift: [19, 31.5],
    outfit: 'scrubs',
    income: 1,
  },
  doctor: { t: 'physician', kind: 'care', shift: [8, 18], outfit: 'scrubs', income: 2 },
  dental: { t: 'dental hygienist', kind: 'care', shift: [8, 16.5], outfit: 'scrubs', income: 1 },
  teacher: { t: 'teacher', kind: 'office', shift: [7.25, 15.5], outfit: 'smart', income: 1 },
  guard: {
    t: 'security guard',
    kind: 'street',
    shift: [7, 19],
    outfit: 'guard',
    income: 0,
    street: 'guard_post',
  },
  guard_night: {
    t: 'night security guard',
    kind: 'street',
    shift: [19, 31],
    outfit: 'guard',
    income: 0,
    street: 'guard_post',
  },
  valet: {
    t: 'valet',
    kind: 'street',
    shift: [11, 23],
    outfit: 'valet',
    income: 0,
    street: 'valet_stand',
  },
  bouncer: {
    t: 'bouncer',
    kind: 'street',
    shift: [21, 28.5],
    outfit: 'bouncer',
    income: 1,
    street: 'club_door',
  },
  promoter: {
    t: 'club promoter',
    kind: 'street',
    shift: [20, 26],
    outfit: 'night',
    income: 1,
    street: 'flyers',
  },
  dj: { t: 'DJ', kind: 'service', shift: [21, 28], outfit: 'night', income: 1 },
  laborer: {
    t: 'construction laborer',
    kind: 'street',
    shift: [6.5, 15],
    outfit: 'construction',
    income: 0,
    street: 'construction',
  },
  foreman: {
    t: 'site foreman',
    kind: 'street',
    shift: [6.5, 15.5],
    outfit: 'construction',
    income: 1,
    street: 'construction',
  },
  electrician: { t: 'electrician', kind: 'trade', shift: [7, 16], outfit: 'trade', income: 1 },
  landscaper: {
    t: 'landscaper',
    kind: 'street',
    shift: [7, 15],
    outfit: 'trade',
    income: 0,
    street: 'landscape',
  },
  painter: { t: 'house painter', kind: 'trade', shift: [7.5, 16], outfit: 'trade', income: 0 },
  dockworker: {
    t: 'dock worker',
    kind: 'street',
    shift: [6, 15],
    outfit: 'construction',
    income: 1,
    street: 'dock_work',
  },
  mechanic: { t: 'mechanic', kind: 'trade', shift: [8, 17.5], outfit: 'trade', income: 1 },
  delivery: {
    t: 'delivery driver',
    kind: 'street',
    shift: [7, 16.5],
    outfit: 'delivery',
    income: 0,
    street: 'unload',
  },
  garbage: {
    t: 'sanitation worker',
    kind: 'street',
    shift: [4.5, 11.5],
    outfit: 'construction',
    income: 1,
    street: 'garbage',
  },
  sweeper: {
    t: 'street cleaner',
    kind: 'street',
    shift: [5.5, 13],
    outfit: 'construction',
    income: 0,
    street: 'sweep',
  },
  mail: {
    t: 'mail carrier',
    kind: 'street',
    shift: [8, 16],
    outfit: 'mail',
    income: 1,
    street: 'mail_route',
  },
  fruit: {
    t: 'fruit vendor',
    kind: 'street',
    shift: [8.5, 18],
    outfit: 'vendor',
    income: 0,
    street: 'vend_fruit',
  },
  hotdog: {
    t: 'hot dog vendor',
    kind: 'street',
    shift: [10.5, 20],
    outfit: 'vendor',
    income: 0,
    street: 'vend_hotdog',
  },
  coconut: {
    t: 'coconut vendor',
    kind: 'street',
    shift: [10, 18.5],
    outfit: 'vendor',
    income: 0,
    street: 'vend_coconut',
  },
  icecream: {
    t: 'ice cream vendor',
    kind: 'street',
    shift: [11, 19.5],
    outfit: 'vendor',
    income: 0,
    street: 'vend_icecream',
  },
  performer: {
    t: 'street musician',
    kind: 'street',
    shift: [12, 22],
    outfit: 'artsy',
    income: 0,
    street: 'perform',
  },
  lifeguard: {
    t: 'lifeguard',
    kind: 'street',
    shift: [9, 18.5],
    outfit: 'lifeguard',
    income: 1,
    street: 'lifeguard',
  },
  chairs: {
    t: 'beach chair attendant',
    kind: 'street',
    shift: [8.5, 18],
    outfit: 'beachstaff',
    income: 0,
    street: 'beach_rental',
  },
  trainer: {
    t: 'personal trainer',
    kind: 'street',
    shift: [6, 12],
    outfit: 'sport',
    income: 1,
    street: 'train',
  },
  dogwalker: {
    t: 'dog walker',
    kind: 'street',
    shift: [8, 17],
    outfit: 'casual',
    income: 0,
    street: 'dogwalk_pro',
  },
  guide: {
    t: 'tour guide',
    kind: 'street',
    shift: [9.5, 17],
    outfit: 'guide',
    income: 0,
    street: 'tour',
  },
  paramedic: { t: 'paramedic', kind: 'care', shift: [7, 19], outfit: 'medic', income: 1 },
  rideshare: { t: 'rideshare driver', kind: 'trade', shift: [15, 26], outfit: 'casual', income: 0 },
  yachtcrew: { t: 'yacht deckhand', kind: 'trade', shift: [7, 17], outfit: 'crew', income: 1 },
  fisher: {
    t: 'charter fisherman',
    kind: 'street',
    shift: [5, 13],
    outfit: 'fishing',
    income: 1,
    street: 'fish',
  },
  artist: {
    t: 'muralist',
    kind: 'street',
    shift: [11, 19],
    outfit: 'artsy',
    income: 0,
    street: 'paint_mural',
  },
  influencer: {
    t: 'content creator',
    kind: 'street',
    shift: [11, 20],
    outfit: 'influencer',
    income: 1,
    street: 'stream',
  },
  hustler: {
    t: 'reseller',
    kind: 'street',
    shift: [12, 24],
    outfit: 'casual',
    income: 0,
    street: 'hustle',
  },
  student: { t: 'student', kind: 'none', shift: [8, 15], outfit: 'casual', income: 0 },
  college: { t: 'college student', kind: 'none', shift: [10, 16], outfit: 'casual', income: 0 },
  retired: { t: 'retiree', kind: 'none', shift: [0, 0], outfit: 'retiree', income: 1 },
  parent: { t: 'stay-at-home parent', kind: 'none', shift: [0, 0], outfit: 'casual', income: 1 },
  unemployed: { t: 'between jobs', kind: 'none', shift: [0, 0], outfit: 'casual', income: 0 },
  tourist: { t: 'on vacation', kind: 'none', shift: [0, 0], outfit: 'tourist', income: 1 },
  heir: { t: 'living off investments', kind: 'none', shift: [0, 0], outfit: 'resort', income: 2 },
};
const JOB_W = {
  // flavor: weights
  business: {
    analyst: 9,
    attorney: 6,
    accountant: 7,
    paralegal: 5,
    receptionist: 5,
    itsupport: 5,
    teller: 4,
    architect: 3,
    realtor: 5,
    broker: 3,
    adjuster: 3,
    guard: 3,
    barista: 3,
    server: 3,
    retail: 3,
    valet: 2,
    delivery: 2,
    sweeper: 1,
    mail: 1,
    cashier: 2,
    frontdesk: 2,
    laborer: 2,
  },
  beach: {
    server: 7,
    bartender: 6,
    housekeeper: 6,
    frontdesk: 4,
    lifeguard: 3,
    chairs: 3,
    retail: 5,
    valet: 3,
    cook: 5,
    barista: 3,
    influencer: 3,
    performer: 2,
    trainer: 3,
    realtor: 2,
    dj: 2,
    promoter: 2,
    bouncer: 2,
    guide: 2,
    hustler: 2,
    college: 3,
    heir: 2,
    yachtcrew: 2,
    coconut: 1,
    icecream: 1,
    hotdog: 1,
  },
  nightlife: {
    bartender: 8,
    server: 6,
    bouncer: 4,
    promoter: 4,
    dj: 3,
    cook: 4,
    valet: 3,
    retail: 3,
    influencer: 3,
    rideshare: 3,
    hustler: 2,
    college: 3,
    barista: 2,
    guard_night: 2,
  },
  latin: {
    cook: 6,
    cashier: 6,
    barber: 4,
    nailtech: 4,
    laborer: 6,
    landscaper: 5,
    painter: 4,
    mechanic: 5,
    delivery: 4,
    barista: 5,
    server: 4,
    housekeeper: 5,
    fruit: 2,
    retired: 14,
    parent: 6,
    student: 8,
    nurse: 3,
    pharmtech: 2,
    teacher: 3,
    electrician: 3,
    rideshare: 3,
    mail: 1,
    dental: 1,
    unemployed: 2,
    coconut: 1,
    performer: 1,
  },
  working: {
    laborer: 7,
    cashier: 6,
    cook: 6,
    housekeeper: 5,
    delivery: 5,
    mechanic: 4,
    guard: 4,
    guard_night: 3,
    nurse: 3,
    garbage: 2,
    sweeper: 2,
    barber: 3,
    dockworker: 3,
    student: 8,
    retired: 8,
    parent: 5,
    unemployed: 4,
    rideshare: 4,
    teacher: 2,
    painter: 3,
    landscaper: 3,
    hustler: 2,
    mail: 1,
    electrician: 3,
  },
  arts: {
    artist: 5,
    barista: 6,
    server: 5,
    bartender: 5,
    retail: 5,
    influencer: 4,
    performer: 3,
    college: 6,
    itsupport: 3,
    architect: 3,
    cook: 4,
    dj: 2,
    delivery: 3,
    laborer: 2,
    hustler: 1,
    promoter: 1,
  },
  port: {
    dockworker: 14,
    delivery: 6,
    mechanic: 5,
    guard: 5,
    guard_night: 3,
    electrician: 3,
    laborer: 5,
    yachtcrew: 3,
    foreman: 2,
    cook: 2,
  },
  suburb: {
    teacher: 5,
    nurse: 5,
    nurse_night: 2,
    accountant: 4,
    electrician: 4,
    mechanic: 4,
    cashier: 5,
    retail: 5,
    parent: 9,
    student: 12,
    retired: 9,
    landscaper: 4,
    delivery: 3,
    paramedic: 2,
    dental: 2,
    pharmtech: 2,
    realtor: 3,
    adjuster: 3,
    itsupport: 3,
    rideshare: 2,
    mail: 1,
    painter: 2,
    college: 4,
    unemployed: 2,
  },
  keys: {
    fisher: 8,
    bartender: 7,
    server: 6,
    cook: 5,
    yachtcrew: 5,
    retired: 12,
    guide: 3,
    mechanic: 3,
    cashier: 3,
    housekeeper: 3,
    parent: 3,
    student: 4,
    performer: 2,
    artist: 2,
    landscaper: 2,
    coconut: 1,
    unemployed: 2,
    electrician: 2,
  },
  rural: {
    landscaper: 6,
    mechanic: 5,
    cashier: 4,
    delivery: 4,
    retired: 8,
    student: 6,
    parent: 4,
    cook: 3,
    fisher: 3,
    teacher: 2,
    laborer: 5,
    electrician: 2,
    unemployed: 2,
    nurse: 2,
  },
};
const OUTDOOR_JOBS = Object.keys(JOBS).filter((k) => JOBS[k].street);

// ---------------------------------------------------------------- likes / quirks (feed small talk and decisions)
const LIKES = [
  'dominoes',
  'fishing',
  'baseball',
  'salsa nights',
  'the gym',
  'cafecito',
  'boats',
  'old cars',
  'gardening',
  'true crime shows',
  'cooking',
  'thrifting',
  'surfing',
  'vinyl records',
  'soccer',
  'church',
  'dogs',
  'cats',
  'video games',
  'reggaeton',
  'jazz',
  'karaoke',
  'the lottery',
  'astrology',
  'yoga',
  'poker',
  'bird watching',
  'motorcycles',
  'bachata',
  'street food',
  'photography',
  'kayaking',
  'bingo',
  'crosswords',
  'beach volleyball',
  'sneakers',
  'horror movies',
  'telenovelas',
  'grilling',
  'chess',
];
const DISLIKES = [
  'traffic',
  'tourists',
  'humidity',
  'mosquitoes',
  'loud exhausts',
  'electric scooters',
  'iguanas',
  'parking tickets',
  'slow walkers',
  'cruise ship crowds',
  'rent prices',
  'cold weather',
  'small talk',
  'reckless drivers',
  'litter',
  'the HOA',
  'spring break',
  'construction noise',
  'rain',
  'early mornings',
];
const QUIRKS = [
  'hums while walking',
  'checks watch constantly',
  'talks to pigeons',
  'always has gum',
  'counts steps',
  'superstitious about black cats',
  'never crosses on red',
  'waves at every bus driver',
  'narrates own day',
  'collects bottle caps',
  'afraid of iguanas',
  'knows every dog by name',
  'tips big',
  'never tips',
  'wears lucky socks',
  'whistles off-key',
  'keeps a toothpick in',
  'photographs every meal',
  'power walker',
  'always running late',
];

// ---------------------------------------------------------------- voice and animation persona
// v1 animation personas (src/npc/personality.js) keyed by voice
export const VOICE_PERSONA = {
  warm: 'friendly',
  gruff: 'rude',
  flirty: 'flirty',
  anxious: 'nervous',
  tough: 'tough',
  chill: 'calm',
  hustler: 'chatty',
  elder_cuban: 'chatty',
  tourist: 'friendly',
  influencer: 'flirty',
  bro: 'friendly',
  pro: 'busy',
  kid: 'friendly',
  kreyol: 'friendly',
  drunk: 'drunk',
  snob: 'rude',
  worker: 'calm',
  artsy: 'calm',
};

export function zoneFlavor(zone, district = '') {
  const d = district.toLowerCase();
  if (/havana|flagami|allapattah|shenandoah/.test(d)) return 'latin';
  if (/haiti|overtown|liberty|brownsville/.test(d)) return 'working';
  if (/wynwood|design|edgewater|midtown/.test(d)) return 'arts';
  if (/key|paloma|tern/.test(d)) return 'keys';
  if (/brickell|downtown|financial|omni|park west/.test(d))
    return zone === 'nightlife' ? 'nightlife' : 'business';
  if (/citrus|glades|sawpalm|amaro|ranch|farm/.test(d)) return 'rural';
  switch (zone) {
    case 'beach':
      return 'beach';
    case 'nightlife':
      return 'nightlife';
    case 'downtown':
    case 'business':
      return 'business';
    case 'port':
    case 'industrial':
      return 'port';
    case 'commercial':
      return 'beach';
    default:
      return 'suburb';
  }
}
export function districtKey(zone, district = '') {
  const d = district.toLowerCase();
  if (/havana|flagami|shenandoah/.test(d)) return 'havana';
  if (/overtown|liberty|brownsville|allapattah/.test(d)) return 'overtown';
  if (/haiti/.test(d)) return 'haiti';
  if (/wynwood|design|edgewater|midtown/.test(d)) return 'wynwood';
  if (/brickell/.test(d)) return 'brickell';
  if (/downtown|omni|park west|financial/.test(d)) return 'downtown';
  if (
    /beach|collins|ocean|fisher|star island|venetian|sunset|bay harbor/.test(d) ||
    zone === 'beach'
  )
    return 'beach';
  if (/port|dodge|watson/.test(d) || zone === 'port') return 'port';
  if (/key|paloma|tern/.test(d)) return 'keys';
  if (/citrus|glades|sawpalm|amaro/.test(d)) return 'rural';
  if (/airport|solana international/.test(d)) return 'airport';
  return 'suburb';
}
// line-bank place token for a location
export function placeToken(zone, district = '') {
  const k = districtKey(zone, district);
  if (zone === 'park') return 'park';
  if (zone === 'nightlife') return 'nightlife';
  return (
    {
      havana: 'havana',
      overtown: 'overtown',
      haiti: 'overtown',
      wynwood: 'wynwood',
      brickell: 'brickell',
      downtown: 'downtown',
      beach: 'beach',
      port: 'port',
      keys: 'keys',
      rural: 'glades',
      airport: 'airport',
      suburb: 'suburb',
    }[k] || 'suburb'
  );
}

const usedNames = new Map(); // full name -> seed (global registry: no two people share a full name)
export function nameRegistrySize() {
  return usedNames.size;
}
function makeName(r, heritage, gender, seed) {
  const H = HERITAGE[heritage] || HERITAGE.mixed;
  for (let tries = 0; tries < 40; tries++) {
    const fk = Array.isArray(H.first) ? r.pick(H.first) : H.first;
    const first = r.pick(FIRST[fk + '_' + gender]);
    let last = r.pick(LAST[r.pick(H.last)]);
    // double surnames are common for Cuban and Latino families
    if ((heritage === 'cuban' || heritage === 'latino') && r.chance(0.22)) {
      const l2 = r.pick(LAST[r.pick(H.last)]);
      if (l2 !== last) last = last + ' ' + l2;
    }
    let full = first + ' ' + last;
    if (tries > 6) full = first + ' ' + String.fromCharCode(65 + r.int(0, 25)) + '. ' + last;
    const prev = usedNames.get(full);
    if (prev === undefined || prev === seed) {
      usedNames.set(full, seed);
      return { first, last, full };
    }
  }
  const first = r.pick(FIRST[(Array.isArray(H.first) ? H.first[0] : H.first) + '_' + gender]);
  const full = first + ' ' + r.pick(LAST[H.last[0]]) + ' ' + (seed % 9973);
  usedNames.set(full, seed);
  return { first, last: full.slice(first.length + 1), full };
}

const AGE_BANDS = [
  ['kid', 6, 12],
  ['teen', 13, 17],
  ['young', 18, 29],
  ['adult', 30, 44],
  ['middle', 45, 62],
  ['senior', 63, 88],
];
export const ageGroupOf = (age) =>
  age < 13
    ? 'kid'
    : age < 18
      ? 'teen'
      : age < 30
        ? 'young'
        : age < 45
          ? 'adult'
          : age < 63
            ? 'middle'
            : 'senior';

/**
 * ctx: { role: 'resident' | 'worker' | 'visitor', zone, district, home: {x,z}, work: {x,z}, job (force), ageGroup (force), gender (force), heritage (force) }
 */
export function makeIdentity(seed, ctx = {}) {
  const r = rng(hashInts(seed, 0x51ed, 7));
  const zone = ctx.zone || 'residential',
    district = ctx.district || '';
  const flavor = ctx.flavor || zoneFlavor(zone, district);
  const dk = districtKey(zone, district);
  const role = ctx.role || 'resident';
  const gender = ctx.gender || (r.chance(0.5) ? 'f' : 'm');
  // heritage: visitors on the beach skew to out-of-towners
  let mix = DISTRICT_MIX[dk] || DISTRICT_MIX.default;
  if (role === 'visitor' && (dk === 'beach' || dk === 'keys'))
    mix = { white: 30, euro: 18, latino: 18, black: 10, asian: 10, mixed: 8, cuban: 6 };
  const heritage = ctx.heritage || r.weighted(mix);
  // job
  let jobKey = ctx.job;
  if (!jobKey) {
    if (role === 'visitor')
      jobKey = r.weighted({
        tourist: dk === 'beach' || dk === 'keys' || dk === 'downtown' ? 8 : 1,
        college: 2,
        retired: 2,
        heir: dk === 'beach' || dk === 'brickell' ? 1 : 0.1,
        unemployed: 1,
        parent: 1,
        influencer: dk === 'beach' || dk === 'wynwood' ? 1.5 : 0.3,
        hustler: 0.6,
        student: 1.5,
      });
    else jobKey = r.weighted(JOB_W[flavor] || JOB_W.suburb);
  }
  let job = JOBS[jobKey] || JOBS.unemployed;
  // age follows the job
  let age;
  if (ctx.age) age = ctx.age;
  else if (ctx.ageGroup) {
    const b = AGE_BANDS.find((x) => x[0] === ctx.ageGroup);
    age = r.int(b[1], b[2]);
  } else if (jobKey === 'student') age = r.int(6, 17);
  else if (jobKey === 'college') age = r.int(18, 24);
  else if (jobKey === 'retired') age = r.int(63, 88);
  else if (jobKey === 'tourist') age = Math.round(clamp(r.norm(38, 16), 18, 78));
  else if (jobKey === 'parent') age = r.int(24, 44);
  else if (jobKey === 'lifeguard' || jobKey === 'influencer' || jobKey === 'promoter')
    age = r.int(19, 34);
  else age = Math.round(clamp(r.norm(job.income === 2 ? 43 : 37, 12), 18, 66));
  const ageGroup = ageGroupOf(age);
  if (ageGroup === 'kid' || ageGroup === 'teen') {
    jobKey = 'student';
    job = JOBS.student;
  }
  const nm = makeName(r, heritage, gender, seed);
  // traits 0..1 (independent draws, then nudged by age, job and place)
  const T = {
    courage: r(),
    honesty: r(),
    talk: r(),
    kindness: r(),
    temper: r(),
    curiosity: r(),
    vanity: r(),
    energy: r(),
    sociability: r(),
    patience: r(),
    nerve: r(),
  };
  if (ageGroup === 'senior') {
    T.energy *= 0.6;
    T.talk = clamp(T.talk + 0.2);
    T.patience = clamp(T.patience + 0.15);
  }
  if (ageGroup === 'kid') {
    T.curiosity = clamp(T.curiosity + 0.35);
    T.energy = clamp(T.energy + 0.3);
    T.courage *= 0.6;
    T.honesty = clamp(T.honesty + 0.25);
  }
  if (ageGroup === 'teen') {
    T.vanity = clamp(T.vanity + 0.2);
    T.energy = clamp(T.energy + 0.15);
  }
  if (
    [
      'bouncer',
      'dockworker',
      'guard',
      'guard_night',
      'foreman',
      'laborer',
      'paramedic',
      'lifeguard',
      'fisher',
      'garbage',
    ].includes(jobKey)
  )
    T.courage = clamp(T.courage * 0.6 + 0.4);
  if (['influencer', 'promoter', 'realtor', 'broker'].includes(jobKey)) {
    T.vanity = clamp(T.vanity * 0.5 + 0.5);
    T.talk = clamp(T.talk * 0.6 + 0.4);
  }
  if (['nurse', 'nurse_night', 'paramedic', 'doctor', 'teacher', 'lifeguard'].includes(jobKey))
    T.kindness = clamp(T.kindness * 0.5 + 0.5);
  if (jobKey === 'hustler') {
    T.honesty *= 0.45;
    T.talk = clamp(T.talk * 0.5 + 0.5);
  }
  const income =
    ctx.income ?? clamp(job.income + (r.chance(0.12) ? 1 : 0) - (r.chance(0.12) ? 1 : 0), 0, 2);
  const drinker =
    ageGroup !== 'kid' && ageGroup !== 'teen'
      ? r() * (flavor === 'nightlife' || flavor === 'beach' || flavor === 'keys' ? 1 : 0.7)
      : 0;
  // voice: how they talk (line bank)
  let voice;
  if (ageGroup === 'kid') voice = 'kid';
  else if (jobKey === 'tourist')
    voice = r.chance(0.75) ? 'tourist' : r.pick(['warm', 'chill', 'bro', 'snob']);
  else if (jobKey === 'influencer') voice = 'influencer';
  else if (jobKey === 'hustler') voice = 'hustler';
  else if (heritage === 'cuban' && age >= 58) voice = r.chance(0.8) ? 'elder_cuban' : 'gruff';
  else if (heritage === 'haitian' && r.chance(0.65)) voice = 'kreyol';
  else if (income === 2 && T.kindness < 0.45 && r.chance(0.7)) voice = 'snob';
  else if (job.kind === 'office' && T.patience < 0.5 && r.chance(0.6)) voice = 'pro';
  else if (
    (job.kind === 'trade' || (job.kind === 'street' && job.outfit === 'construction')) &&
    r.chance(0.6)
  )
    voice = 'worker';
  else if (flavor === 'arts' && T.curiosity > 0.5 && r.chance(0.5)) voice = 'artsy';
  else if (T.courage > 0.78 && T.kindness < 0.5) voice = 'tough';
  else if (T.nerve < 0.2 || (T.courage < 0.22 && T.patience < 0.6)) voice = 'anxious';
  else if (T.temper > 0.72 && T.kindness < 0.55) voice = 'gruff';
  else if (age < 36 && T.energy > 0.7 && T.sociability > 0.55 && r.chance(0.6)) voice = 'bro';
  else if (T.vanity > 0.62 && T.sociability > 0.6 && age < 50 && r.chance(0.6)) voice = 'flirty';
  else if (T.energy < 0.38 && T.temper < 0.5) voice = 'chill';
  else if (T.talk > 0.7 && T.honesty < 0.4 && r.chance(0.5)) voice = 'hustler';
  else voice = T.kindness > 0.45 ? 'warm' : 'gruff';
  const likes = r.shuffle(LIKES).slice(0, 3),
    dislikes = r.shuffle(DISLIKES).slice(0, 2);
  const id = {
    seed,
    id: ctx.id || 'p' + seed.toString(36),
    role,
    first: nm.first,
    last: nm.last,
    name: nm.full,
    gender,
    age,
    ageGroup,
    heritage,
    jobKey,
    job: job.t,
    jobDef: job,
    income,
    flavor,
    districtKey: dk,
    district,
    zone,
    home: ctx.home || null,
    work: ctx.work || null,
    traits: T,
    voice,
    persona: VOICE_PERSONA[voice] || 'calm',
    mood: clamp(0.35 + T.kindness * 0.25 + T.patience * 0.15 + r() * 0.3), // baseline; daily mood varies around it
    likes,
    dislikes,
    quirk: r.pick(QUIRKS),
    smoker: ageGroup !== 'kid' && ageGroup !== 'teen' && r.chance(0.13),
    drinker,
    fit: clamp(
      r() * 0.7 +
        (jobKey === 'trainer' || jobKey === 'lifeguard' ? 0.4 : 0) +
        T.energy * 0.2 -
        (age > 60 ? 0.2 : 0),
    ),
    dogOwner: r.chance(ageGroup === 'kid' ? 0 : 0.2),
    phoneAddict: clamp(r() * 0.8 + (age < 30 ? 0.25 : 0) - (age > 65 ? 0.3 : 0)),
    mobility:
      age >= 74
        ? r.weighted({ none: 5, cane: 2, walker: 1.5, scooter: 1.2 })
        : age >= 63
          ? r.weighted({ none: 12, cane: 1, scooter: 0.4 })
          : r.chance(0.006)
            ? 'wheelchair'
            : 'none',
    lefty: r.chance(0.1),
    // things they can offer the player (dialogue.js decides when)
    offers: {
      hiring:
        !!job.street ||
        [
          'barista',
          'cook',
          'server',
          'retail',
          'cashier',
          'mechanic',
          'delivery',
          'valet',
          'bartender',
        ].includes(jobKey)
          ? r.chance(0.3)
          : false,
      deal: jobKey === 'hustler' || r.chance(0.06),
      flirt: ageGroup !== 'kid' && ageGroup !== 'teen' && T.vanity > 0.55 && T.sociability > 0.55,
    },
  };
  return id;
}
// daily mood: stable per person per day, shifted by weather and events (0 miserable .. 1 great)
export function moodToday(identity, day, weather = 'clear') {
  const r = rng(hashInts(identity.seed, day, 0x77));
  let m = identity.mood + (r() - 0.5) * 0.35;
  if (weather === 'rain' || weather === 'storm') m -= 0.12;
  if (weather === 'hot') m -= identity.dislikes.includes('humidity') ? 0.15 : 0.04;
  return clamp(m);
}
export const isOutdoorJob = (k) => OUTDOOR_JOBS.includes(k);
export { AGE_BANDS };
