// SOUTHLINE UI: language scaffold. Strings are written in English in the code and looked up by that text:
//   t('Continue')  ->  'Continuar' when the language setting is 'es' and the dictionary has it, else 'Continue'.
//   t('Day {n}', { n: 3 })
// Add a language: add a dictionary below (or call i18n.add('fr', {...}) from a data file) and an option to the
// `language` setting in settings/schema.js. Missing strings fall back to English, so partial translations are safe.
const DICT = {
  es: {
    'Continue': 'Continuar', 'Story': 'Historia', 'Story / Missions': 'Historia / Misiones', 'Free Roam': 'Modo libre', 'Play with Friends': 'Jugar con amigos',
    'Wardrobe': 'Vestuario', 'Garage': 'Garaje', 'Settings': 'Ajustes', 'Credits': 'Créditos', 'News': 'Novedades', 'Quit': 'Salir', 'Back': 'Atrás', 'Select': 'Elegir',
    'Resume': 'Reanudar', 'Map': 'Mapa', 'Missions': 'Misiones', 'Stats': 'Estadísticas', 'Controls': 'Controles', 'Save': 'Guardar', 'Main menu': 'Menú principal',
    'Graphics': 'Gráficos', 'Audio': 'Sonido', 'HUD': 'HUD', 'Accessibility': 'Accesibilidad', 'Game': 'Juego', 'Language': 'Idioma',
    'Press any key': 'Pulsa cualquier tecla', 'New Game': 'Nueva partida', 'Outfit': 'Atuendo', 'Loading': 'Cargando', 'Paused': 'En pausa',
    'Cash': 'Efectivo', 'Bank': 'Banco', 'Wanted': 'Buscado', 'Waypoint set': 'Destino fijado', 'Waypoint cleared': 'Destino borrado', 'Fast travel': 'Viaje rápido',
    'Legend': 'Leyenda', 'Phone': 'Teléfono', 'Messages': 'Mensajes', 'Contacts': 'Contactos', 'Camera': 'Cámara', 'Gallery': 'Galería', 'Jobs': 'Trabajos',
    'Stocks': 'Bolsa', 'Rides': 'Viajes', 'Music': 'Música', 'Weather': 'Clima', 'Clock': 'Reloj', 'Not available yet': 'Aún no disponible',
    'On': 'Sí', 'Off': 'No', 'Low': 'Bajo', 'Medium': 'Medio', 'High': 'Alto', 'Ultra': 'Ultra', 'Custom': 'Personalizado', 'Restore defaults': 'Restaurar valores',
  },
};
export function createI18n(getLang = () => 'en') {
  const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s);
  const t = (text, vars) => { const d = DICT[getLang()]; return fill((d && d[text]) || text, vars); };
  t.add = (lang, dict) => { DICT[lang] = { ...(DICT[lang] || {}), ...dict }; };
  t.lang = () => getLang();
  t.languages = () => ['en', ...Object.keys(DICT)];
  return t;
}
