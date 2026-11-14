// THE ONE PLACE the game's name lives for the whole front end (the user is still choosing the final name).
// Change it here and the wordmark, title screen, pause header, loading screen, phone, credits and every title string
// follow. The wordmark is drawn from original letterforms in core/logo.js for the letters it knows
// (A L N O P R S T); any other letter makes the wordmark fall back to bold condensed type next to the tide-sun emblem.
export const BRAND = {
  name: 'Southline',            // plain-text name (window title, credits, messages)
  line1: '',                    // small top row of the lockup ('' for a one-word name)
  line2: 'SOUTHLINE',           // the big word
  sunLetter: -1,                 // index of the letter in line2 replaced by the tide sun (-1 = none; must be an O to read well)
  tagline: 'AN OPEN-WORLD FLORIDA STORY',
  coords: '25°46′N  80°11′W',
  phoneOS: 'TideOS',            // the phone's operating system name
  studio: 'Southline project',
};
export const gameName = () => BRAND.name;
export const gameNameUpper = () => BRAND.name.toUpperCase();
