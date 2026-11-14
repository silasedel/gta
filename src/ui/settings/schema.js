// PORT SOLANA UI: the settings schema. One flat key per setting (mirrored into game.settings[key]).
// type: 'range' | 'choice' | 'toggle' | 'action' | 'custom'. `owner` says which track applies the value:
//   'ui'   applied by src/ui (store.js) and verified here
//   other  that track reads game.settings[key] or listens to 'settings:changed' { key, value, previous, all }
// Keys already defined by core-systems (dayMinutes, units, clock24h, subtitles, autosaveMinutes, difficulty, aimAssist,
// driveAssist, ...) keep THEIR names so there is exactly one value for each.

const pct = (v) => Math.round(v * 100) + '%';
const mult = (v) => (+v).toFixed(2) + 'x';
const C = (value, label, hint) => ({ value, label, hint });

export const PRESETS = {
  low: { resolutionScale: 0.85, renderDistance: 'near', shadows: 'low', reflections: 'off', antialias: 'fxaa', ambientOcclusion: false, bloom: true, volumetrics: false, motionBlur: false, depthOfField: false, textureQuality: 'medium', vegetation: 'low', trafficDensity: 0.6, pedDensity: 0.6, interiorDetail: 'medium' },
  medium: { resolutionScale: 1, renderDistance: 'medium', shadows: 'medium', reflections: 'low', antialias: 'smaa', ambientOcclusion: true, bloom: true, volumetrics: false, motionBlur: false, depthOfField: false, textureQuality: 'high', vegetation: 'medium', trafficDensity: 0.8, pedDensity: 0.8, interiorDetail: 'high' },
  high: { resolutionScale: 1, renderDistance: 'far', shadows: 'high', reflections: 'high', antialias: 'smaa', ambientOcclusion: true, bloom: true, volumetrics: true, motionBlur: true, depthOfField: true, textureQuality: 'high', vegetation: 'high', trafficDensity: 1, pedDensity: 1, interiorDetail: 'high' },
  ultra: { resolutionScale: 1, renderDistance: 'ultra', shadows: 'ultra', reflections: 'ultra', antialias: 'taa', ambientOcclusion: true, bloom: true, volumetrics: true, motionBlur: true, depthOfField: true, textureQuality: 'ultra', vegetation: 'ultra', trafficDensity: 1.2, pedDensity: 1.2, interiorDetail: 'ultra' },
};
export const PRESET_KEYS = Object.keys(PRESETS.high);
export const RENDER_DISTANCE = { near: 0.6, medium: 1, far: 1.5, ultra: 2.2 };

export const SCHEMA = [
  { id: 'graphics', label: 'Graphics', icon: 'display', sections: [
    { title: 'Quality', items: [
      { key: 'gfxPreset', label: 'Preset', type: 'choice', default: 'high', owner: 'ui', options: [C('low', 'Low'), C('medium', 'Medium'), C('high', 'High'), C('ultra', 'Ultra'), C('custom', 'Custom')], desc: 'Sets everything below at once. Changing any single option switches to Custom.' },
      { key: 'gfxAutoDetect', label: 'Auto-detect', type: 'action', action: 'detect', button: 'Detect best settings', desc: 'Looks at your graphics chip and the measured frame rate, then picks a preset.' },
      { key: 'resolutionScale', label: 'Resolution scale', type: 'range', min: 0.5, max: 1.5, step: 0.05, default: 1, fmt: pct, owner: 'ui', desc: 'Renders the 3D world at a fraction of the window size. Lower is faster and softer.' },
      { key: 'renderDistance', label: 'Draw distance', type: 'choice', default: 'far', owner: 'ui', options: [C('near', 'Near'), C('medium', 'Medium'), C('far', 'Far'), C('ultra', 'Ultra')], desc: 'How far full-detail buildings, cars and trees are drawn.' },
      { key: 'shadows', label: 'Shadows', type: 'choice', default: 'high', owner: 'ui', options: [C('off', 'Off'), C('low', 'Low'), C('medium', 'Medium'), C('high', 'High'), C('ultra', 'Ultra')] },
      { key: 'reflections', label: 'Reflections', type: 'choice', default: 'high', owner: 'environment', options: [C('off', 'Off'), C('low', 'Low'), C('high', 'High'), C('ultra', 'Ultra')], desc: 'Water, wet roads, glass and car paint.' },
      { key: 'antialias', label: 'Anti-aliasing', type: 'choice', default: 'smaa', owner: 'environment', options: [C('off', 'Off'), C('fxaa', 'FXAA'), C('smaa', 'SMAA'), C('taa', 'TAA')] },
      { key: 'textureQuality', label: 'Texture quality', type: 'choice', default: 'high', owner: 'city-look', options: [C('medium', 'Medium'), C('high', 'High'), C('ultra', 'Ultra')] },
      { key: 'vegetation', label: 'Vegetation', type: 'choice', default: 'high', owner: 'city-look', options: [C('low', 'Low'), C('medium', 'Medium'), C('high', 'High'), C('ultra', 'Ultra')] },
      { key: 'interiorDetail', label: 'Interior detail', type: 'choice', default: 'high', owner: 'interiors-engine', options: [C('medium', 'Medium'), C('high', 'High'), C('ultra', 'Ultra')] },
    ] },
    { title: 'Effects', items: [
      { key: 'ambientOcclusion', label: 'Ambient occlusion', type: 'toggle', default: true, owner: 'environment' },
      { key: 'bloom', label: 'Bloom and neon glow', type: 'toggle', default: true, owner: 'environment' },
      { key: 'volumetrics', label: 'Volumetric fog and light rays', type: 'toggle', default: true, owner: 'environment' },
      { key: 'motionBlur', label: 'Motion blur at speed', type: 'toggle', default: true, owner: 'ui' },
      { key: 'depthOfField', label: 'Depth of field', type: 'toggle', default: true, owner: 'ui', desc: 'Soft focus on the title screen, the wardrobe and arrival intros.' },
      { key: 'lensFlare', label: 'Lens flare', type: 'toggle', default: true, owner: 'ui', desc: 'Sun ghosts and a soft streak when the camera looks toward the sun.' },
      { key: 'filmGrain', label: 'Film grain', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5, fmt: pct, owner: 'ui' },
    ] },
    { title: 'World', items: [
      { key: 'trafficDensity', label: 'Traffic density', type: 'range', min: 0.2, max: 1.5, step: 0.1, default: 1, fmt: pct, owner: 'vehicles-core' },
      { key: 'pedDensity', label: 'Pedestrian density', type: 'range', min: 0.2, max: 1.5, step: 0.1, default: 1, fmt: pct, owner: 'npc-ai' },
    ] },
    { title: 'Camera and window', items: [
      { key: 'fov', label: 'Field of view', type: 'range', min: 50, max: 100, step: 1, default: 62, fmt: (v) => Math.round(v) + '°', owner: 'ui' },
      { key: 'cameraShake', label: 'Camera shake', type: 'range', min: 0, max: 1, step: 0.05, default: 1, fmt: pct, owner: 'lead' },
      { key: 'fullscreen', label: 'Fullscreen', type: 'toggle', default: false, owner: 'ui', volatile: true },
      { key: 'fpsLimit', label: 'Frame rate limit', type: 'choice', default: 0, owner: 'ui', options: [C(60, '60'), C(120, '120'), C(0, 'Unlimited')] },
      { key: 'showFps', label: 'Show frame rate', type: 'toggle', default: false, owner: 'ui' },
    ] },
  ] },
  { id: 'audio', label: 'Audio', icon: 'speaker', sections: [
    { title: 'Levels', items: [
      { key: 'volMaster', label: 'Master', type: 'range', min: 0, max: 1, step: 0.01, default: 0.9, fmt: pct, owner: 'ui', bus: 'master' },
      { key: 'volMusic', label: 'Music and score', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8, fmt: pct, owner: 'audio', bus: 'music' },
      { key: 'volRadio', label: 'Car radio', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8, fmt: pct, owner: 'audio', bus: 'radio' },
      { key: 'volSfx', label: 'Effects', type: 'range', min: 0, max: 1, step: 0.01, default: 1, fmt: pct, owner: 'audio', bus: 'sfx' },
      { key: 'volVehicles', label: 'Engines and vehicles', type: 'range', min: 0, max: 1, step: 0.01, default: 1, fmt: pct, owner: 'audio', bus: 'vehicles' },
      { key: 'volAmbience', label: 'Ambience and weather', type: 'range', min: 0, max: 1, step: 0.01, default: 0.9, fmt: pct, owner: 'audio', bus: 'ambience' },
      { key: 'volVoice', label: 'Dialogue', type: 'range', min: 0, max: 1, step: 0.01, default: 1, fmt: pct, owner: 'audio', bus: 'voice' },
      { key: 'volUi', label: 'Menu and phone', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8, fmt: pct, owner: 'audio', bus: 'ui' },
      { key: 'volVoiceChat', label: 'Voice chat (multiplayer)', type: 'range', min: 0, max: 1, step: 0.01, default: 1, fmt: pct, owner: 'multiplayer', bus: 'voiceChat' },
    ] },
    { title: 'Output', items: [
      { key: 'audioOutput', label: 'Speaker setup', type: 'choice', default: 'headphones', owner: 'audio', options: [C('headphones', 'Headphones'), C('speakers', 'Speakers'), C('tv', 'TV'), C('mono', 'Mono')] },
      { key: 'dynamicRange', label: 'Dynamic range', type: 'choice', default: 'full', owner: 'audio', options: [C('full', 'Full'), C('medium', 'Medium'), C('night', 'Night')], desc: 'Night keeps loud and quiet sounds closer together.' },
      { key: 'muteOnFocusLoss', label: 'Mute when the window is in the background', type: 'toggle', default: true, owner: 'ui' },
      { key: 'menuMusic', label: 'Menu music', type: 'toggle', default: true, owner: 'audio' },
    ] },
  ] },
  { id: 'controls', label: 'Controls', icon: 'gamepad', sections: [
    { title: 'Mouse', items: [
      { key: 'mouseSens', label: 'Mouse sensitivity', type: 'range', min: 0.2, max: 3, step: 0.05, default: 1, fmt: mult, owner: 'ui' },
      { key: 'aimSens', label: 'Aiming sensitivity', type: 'range', min: 0.2, max: 2, step: 0.05, default: 0.8, fmt: mult, owner: 'combat', desc: 'Multiplier while aiming down sights.' },
      { key: 'invertY', label: 'Invert vertical look', type: 'toggle', default: false, owner: 'ui' },
    ] },
    { title: 'Hold or toggle', items: [
      { key: 'sprintMode', label: 'Sprint', type: 'choice', default: 'hold', owner: 'ui', options: [C('hold', 'Hold'), C('toggle', 'Toggle')] },
      { key: 'aimMode', label: 'Aim', type: 'choice', default: 'hold', owner: 'ui', options: [C('hold', 'Hold'), C('toggle', 'Toggle')] },
      { key: 'crouchMode', label: 'Crouch', type: 'choice', default: 'hold', owner: 'ui', options: [C('hold', 'Hold'), C('toggle', 'Toggle')] },
    ] },
    { title: 'Keyboard and mouse bindings', items: [{ key: 'bindings', type: 'custom', widget: 'bindings' }] },
    { title: 'Controller', items: [
      { key: 'padLayout', label: 'Layout', type: 'choice', default: 'standard', owner: 'ui', options: [C('standard', 'Standard'), C('bumper', 'Bumper drive'), C('classic', 'Face-button drive'), C('southpaw', 'Southpaw')] },
      { key: 'padDiagram', type: 'custom', widget: 'padDiagram' },
      { key: 'padSens', label: 'Stick look sensitivity', type: 'range', min: 0.3, max: 3, step: 0.05, default: 1, fmt: mult, owner: 'ui' },
      { key: 'padDeadzone', label: 'Stick dead zone', type: 'range', min: 0.05, max: 0.4, step: 0.01, default: 0.18, fmt: pct, owner: 'ui' },
      { key: 'padInvertY', label: 'Invert vertical look (stick)', type: 'toggle', default: false, owner: 'ui' },
      { key: 'vibration', label: 'Vibration', type: 'toggle', default: true, owner: 'ui' },
    ] },
    { title: 'Assists', items: [
      { key: 'aimAssist', label: 'Aim assist', type: 'choice', default: 'light', owner: 'core-systems', options: [C('off', 'Off'), C('light', 'Light'), C('full', 'Full')] },
      { key: 'driveAssist', label: 'Driving assist', type: 'choice', default: 'light', owner: 'core-systems', options: [C('off', 'Off'), C('light', 'Light'), C('full', 'Full')] },
      { key: 'cameraAutoCenter', label: 'Auto-center the driving camera', type: 'toggle', default: true, owner: 'lead' },
    ] },
  ] },
  { id: 'display', label: 'HUD', icon: 'hud', sections: [
    { title: 'Layout', items: [
      { key: 'uiScale', label: 'HUD and menu scale', type: 'range', min: 0.8, max: 1.5, step: 0.05, default: 1, fmt: pct, owner: 'ui' },
      { key: 'safeZone', label: 'Screen edge margin', type: 'range', min: 0, max: 0.1, step: 0.005, default: 0, fmt: (v) => (v * 100).toFixed(1) + '%', owner: 'ui', desc: 'Moves the HUD in from the edges (TVs, curved screens).' },
      { key: 'letterbox', label: 'Cinematic letterbox', type: 'toggle', default: true, owner: 'ui', desc: 'Black bars on the title screen and arrival intros.' },
      { key: 'hudCentered', label: 'Keep the HUD in the middle 16:9 on ultrawide', type: 'toggle', default: false, owner: 'ui' },
      { key: 'minimapMode', label: 'Minimap', type: 'choice', default: 'rotate', owner: 'ui', options: [C('rotate', 'Rotates'), C('north', 'North up')] },
      { key: 'minimapSize', label: 'Minimap size', type: 'choice', default: 'medium', owner: 'ui', options: [C('small', 'Small'), C('medium', 'Medium'), C('large', 'Large')] },
      { key: 'mapTheme', label: 'Map style', type: 'choice', default: 'dusk', owner: 'ui', options: [C('dusk', 'Dusk chart'), C('day', 'Daylight')] },
    ] },
    { title: 'Elements', items: [
      { key: 'hudMode', label: 'HUD', type: 'choice', default: 'full', owner: 'ui', options: [C('full', 'Full'), C('minimal', 'Minimal'), C('off', 'Off')], desc: 'Minimal hides everything except warnings, prompts and the minimap.' },
      { key: 'showObjective', label: 'Objective tracker', type: 'toggle', default: true, owner: 'ui' },
      { key: 'showNotifications', label: 'Notifications feed', type: 'toggle', default: true, owner: 'ui' },
      { key: 'showStreetNames', label: 'Street and district names', type: 'toggle', default: true, owner: 'ui' },
      { key: 'showHints', label: 'Tips and the controls card', type: 'toggle', default: true, owner: 'ui' },
      { key: 'crosshair', label: 'Crosshair', type: 'choice', default: 'dynamic', owner: 'ui', options: [C('dynamic', 'Dynamic'), C('simple', 'Simple dot'), C('off', 'Off')] },
    ] },
    { title: 'Subtitles', items: [
      { key: 'subtitles', label: 'Subtitles', type: 'toggle', default: true, owner: 'ui' },
      { key: 'subtitleSize', label: 'Size', type: 'choice', default: 'medium', owner: 'ui', options: [C('small', 'Small'), C('medium', 'Medium'), C('large', 'Large'), C('xl', 'Extra large')] },
      { key: 'subtitleBackground', label: 'Background', type: 'choice', default: 'soft', owner: 'ui', options: [C('none', 'None'), C('soft', 'Soft'), C('solid', 'Solid')] },
      { key: 'subtitleSpeaker', label: 'Speaker names', type: 'toggle', default: true, owner: 'ui' },
      { key: 'subtitleAmbient', label: 'Subtitles for people on the street', type: 'toggle', default: true, owner: 'ui' },
      { key: 'subtitlePreview', type: 'custom', widget: 'subtitlePreview' },
    ] },
  ] },
  { id: 'access', label: 'Accessibility', icon: 'access', sections: [
    { title: 'Vision', items: [
      { key: 'colorblind', label: 'Color palette', type: 'choice', default: 'off', owner: 'ui', options: [C('off', 'Standard'), C('deuter', 'Deuteranopia'), C('protan', 'Protanopia'), C('tritan', 'Tritanopia')], desc: 'Changes HUD, map and marker colors so danger, police, health and routes stay distinct.' },
      { key: 'highContrast', label: 'High-contrast HUD', type: 'toggle', default: false, owner: 'ui' },
      { key: 'palettePreview', type: 'custom', widget: 'palettePreview' },
    ] },
    { title: 'Motion', items: [
      { key: 'reducedMotion', label: 'Reduce interface motion', type: 'toggle', default: false, owner: 'ui', desc: 'Menus and the phone fade instead of sliding; the menu camera stops drifting.' },
      { key: 'reduceFlashes', label: 'Reduce flashes', type: 'toggle', default: false, owner: 'ui', desc: 'Softens muzzle flashes, lightning and the police light bar on the HUD.' },
    ] },
    { title: 'Input', items: [
      { key: 'holdToConfirm', label: 'Hold to confirm important actions', type: 'toggle', default: true, owner: 'ui' },
      { key: 'phoneWalk', label: 'Keep walking while the phone is up', type: 'toggle', default: true, owner: 'ui' },
      { key: 'accessNote', type: 'custom', widget: 'accessNote' },
    ] },
  ] },
  { id: 'game', label: 'Game', icon: 'compass', sections: [
    { title: 'World', items: [
      { key: 'dayMinutes', label: 'Length of a full day', type: 'choice', default: 144, owner: 'core-systems', options: [C(24, '24 min'), C(48, '48 min'), C(96, '96 min'), C(144, '144 min'), C(288, '288 min'), C(1440, 'Real time')], desc: '144 minutes is the default: one game minute every six seconds.' },
      { key: 'units', label: 'Units', type: 'choice', default: 'imperial', owner: 'ui', options: [C('imperial', 'Miles, mph, °F'), C('metric', 'Kilometers, km/h, °C')] },
      { key: 'clock24h', label: '24-hour clock', type: 'toggle', default: false, owner: 'ui' },
    ] },
    { title: 'Language', items: [
      { key: 'language', label: 'Text language', type: 'choice', default: 'en', owner: 'ui', options: [C('en', 'English'), C('es', 'Español (preview)')], desc: 'Spanish is a preview: menus and the HUD are translated, the story is not yet.' },
    ] },
    { title: 'Saving', items: [
      { key: 'autosaveMinutes', label: 'Autosave every', type: 'choice', default: 3, owner: 'core-systems', options: [C(1, '1 min'), C(3, '3 min'), C(5, '5 min'), C(10, '10 min'), C(0, 'Off')] },
      { key: 'saveTools', type: 'custom', widget: 'saveTools' },
    ] },
    { title: 'More options', items: [{ key: 'externalSettings', type: 'custom', widget: 'externalSettings' }] },
    { title: 'Reset', items: [{ key: 'resetAll', label: 'Restore every setting to its default', type: 'action', action: 'resetAll', button: 'Restore defaults', danger: true }] },
  ] },
];

/** Flat list of real (value-carrying) settings. */
export function allItems() { const out = []; for (const t of SCHEMA) for (const s of t.sections) for (const it of s.items) if (it.type !== 'custom' && it.type !== 'action') out.push({ ...it, tab: t.id, section: s.title }); return out; }
export const DEFAULTS = Object.fromEntries(allItems().map((i) => [i.key, i.default]));
