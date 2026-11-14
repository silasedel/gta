// Line bank specification (NPC-AI track). Single source of truth for writers, the validator and the picker.
//
// FILE FORMAT (one file per group of voices):  src/npc/lines/voice_<name>.js
//   export default {
//     <voice>: {
//       <context>: [
//         'A plain line.',
//         ['A line that only fits some situations.', 'night rain'],     // second item: condition tokens, space separated
//       ],
//     },
//   };
// - A line is a string, or [string, 'tokens']. ALL tokens must hold for the line to be eligible; lines with more
//   matching tokens are preferred, so write specific lines where a situation deserves one.
// - Keep lines short enough for a subtitle: 3 to 16 words. One or two sentences.
// - Slots (optional, use sparingly, never required for the line to make sense):
//     {district} current neighborhood   {street} nearest street     {car} the player's vehicle type ("sedan", "pickup", "sports car")
//     {carColor} its color              {top} what the player wears on top ("teal shirt")   {name} the player's first name (only with token 'known' or 'friend')
//     {me} the speaker's first name     {job} the speaker's job title (lowercase)           {hour} spoken time ("three in the morning")
//
// CONDITION TOKENS
export const TOKENS = {
  time: ['dawn', 'morning', 'noon', 'afternoon', 'evening', 'night', 'latenight'],
  weather: ['hot', 'rain', 'storm', 'clear', 'windy', 'chilly'],
  relation: ['stranger', 'known', 'friend', 'enemy', 'regular'],
  place: ['beach', 'downtown', 'brickell', 'havana', 'wynwood', 'overtown', 'port', 'keys', 'glades', 'suburb', 'airport', 'park', 'nightlife'],
  player: ['armed', 'shirtless', 'suited', 'fancycar', 'beatercar', 'bloody', 'wanted', 'wet', 'running'],
  self: ['old', 'young', 'rich', 'poor', 'working', 'offduty'],
};
// VOICES: how a person talks. Every person in the world gets one voice from their identity.
export const VOICES = {
  warm: 'Friendly neighbor. Open, kind, asks about you, easy laugh.',
  gruff: 'Grumpy and impatient. Short sentences, complains, no time for you.',
  flirty: 'Playful, confident, teasing. Charming, never crude.',
  anxious: 'Nervous over-thinker. Apologizes, worries, trails off.',
  tough: 'Street-hard and fearless. Calm threats, dry, does not scare.',
  chill: 'Laid-back beach cadence. Unbothered, slow, amused by everything.',
  hustler: 'Always working an angle. Fast talker, sells, flatters, bargains.',
  elder_cuban: 'Cuban grandmother or grandfather of Little Havana. Heavy Spanglish, opinions on everything, feeds or scolds you.',
  tourist: 'Out-of-towner. Amazed, sunburned, lost, loud about prices and heat.',
  influencer: 'Lives on camera. Talks to "chat", content brain, brand-speak for made-up things only.',
  bro: 'Loud gym and party guy or girl. Hype, protein, "bro", big energy.',
  pro: 'Busy professional. Clipped, on the clock, polite until delayed.',
  kid: 'Child of 7 to 12. Blunt, curious, clean language, random facts.',
  kreyol: 'Haitian-American of Little Haiti. English with natural Haitian Creole phrases, proverbs, proud and warm.',
  drunk: 'Had a few. Slurry, sentimental, overconfident, loses the thread.',
  snob: 'Wealthy and condescending. Judges your car, your shoes, the neighborhood.',
  worker: 'Blue-collar trades and service. Dry humor, tired, practical, union break energy.',
  artsy: 'Wynwood creative. Earnest about murals, vinyl, oat milk, "the scene".',
};
// CONTEXTS: when a line is said. Writers cover every context for every voice (3 to 5 lines each, more is welcome).
export const CONTEXTS = {
  // ---- passing by the player
  greet: 'Says hi to a stranger passing on the street.',
  greet_known: 'Greets the player, whom they have met before (may use {name}).',
  greet_friend: 'Greets the player as a friend.',
  greet_enemy: 'Sees the player, whom they dislike or fear from a past run-in.',
  farewell: 'Ends a conversation.',
  remark_weather_hot: 'Comment on brutal heat and humidity.',
  remark_weather_rain: 'Comment on rain.',
  remark_weather_storm: 'Comment on a thunderstorm or approaching hurricane weather.',
  remark_nice_day: 'Comment on a beautiful day or evening.',
  remark_late_night: 'Comment on being out very late.',
  remark_early_morning: 'Comment on being up at dawn.',
  remark_outfit_good: 'Compliments what the player wears (may use {top}).',
  remark_outfit_bad: 'Mocks or questions what the player wears.',
  remark_outfit_shirtless: 'Reacts to the player walking around shirtless away from the beach.',
  remark_outfit_suit: 'Reacts to the player in a suit.',
  remark_car_fancy: 'Reacts to the player getting out of or driving an expensive car (may use {car}, {carColor}).',
  remark_car_beater: 'Reacts to the player in a rusty, beat-up car.',
  remark_car_loud: 'Reacts to a loud engine or revving.',
  remark_player_running: 'Player sprints past them on the sidewalk.',
  remark_player_wet: 'Player walks by dripping wet from the water.',
  remark_player_bloody: 'Player walks by visibly hurt or bloody.',
  remark_player_armed: 'Sees the player holding a gun, before anything happens. Wary, not yet panicking.',
  // ---- reactions
  bump_light: 'Player brushes against them.',
  bump_hard: 'Player shoves into them at a run.',
  honked_startle: 'A car horn right behind them makes them jump.',
  honked_angry: 'Yells back at a driver who honked at them.',
  near_miss_car: 'A car almost hits them.',
  gunfire_flee: 'Gunshots nearby: they run. Shouted, short.',
  gunfire_freeze: 'Gunshots nearby: they freeze or duck. Whispered or panicked.',
  gunfire_fight: 'Gunshots nearby: they stand their ground or go at the shooter.',
  gun_pointed_at: 'The player aims a gun at them.',
  call_911: 'On the phone with the emergency operator, describing what is happening.',
  filming: 'Filming an incident on their phone, narrating.',
  crash_gawk: 'Standing at a car crash, looking on.',
  help_injured: 'Kneeling by an injured person, helping.',
  see_fight: 'Watching a fistfight.',
  see_theft: 'Saw the player steal a car or something from a store.',
  see_corpse: 'Comes upon a body on the ground.',
  explosion: 'Something just blew up.',
  hit_by_player: 'The player just punched them.',
  threat_backdown: 'The player threatened them and they give in.',
  threat_standup: 'The player threatened them and they refuse to be scared.',
  intruder_scream: 'Finds the player inside their home. Terrified.',
  intruder_confront: 'Finds the player inside their home. Grabs a bat, stands their ground.',
  tell_police: 'Telling an arriving police officer what they saw.',
  // ---- approaching the player with a purpose
  offer_job: 'Tells the player their workplace is hiring or offers a quick paid errand (may use {job}).',
  offer_deal: 'Offers to sell something, buy something or a discount.',
  flirt_open: 'Opens a flirt with the player.',
  ask_help: 'Asks the player for a small favor or help.',
  warn_player: 'Warns the player about something nearby: police, a bad block, a scam, weather.',
  ask_directions: 'Asks the player for directions.',
  compliment: 'A sincere compliment to the player, not about clothes.',
  // ---- answers to the dialogue wheel
  reply_friendly: 'The player said something friendly.',
  reply_rude: 'The player was rude to them.',
  reply_ask_area: 'The player asked what is good around here (may use {district}).',
  reply_ask_self: 'The player asked about them (may use {job}, {me}).',
  reply_ask_rumor: 'The player asked if they heard anything interesting lately. Local gossip, small mysteries.',
  reply_flirt_yes: 'The player flirted and they like it.',
  reply_flirt_no: 'The player flirted and they are not interested.',
  reply_accept: 'They are glad the player accepted their offer.',
  reply_decline: 'The player turned their offer down.',
  reply_job_info: 'The player asked for details about the job they mentioned.',
  reply_thanks: 'The player helped them; they are grateful.',
  reply_refuse_service: 'They refuse to deal with the player because of what the player did before.',
  reply_regular: 'They know the player as a regular and remember the usual.',
  // ---- alone
  phone_call: 'One side of a phone call overheard on the street.',
  mutter: 'Talking to themselves.',
  idle_wait: 'Waiting in a line or at a bus stop, making a remark to nobody in particular.',
  selfie: 'Taking a selfie or filming themselves.',
};
// ROLE BANK (file roles.js): lines tied to what a person is doing for work, any voice.  { <role>: { <context>: [lines] } }
export const ROLES = {
  fruit_vendor: ['pitch', 'price', 'thanks', 'slow_day', 'haggle'],
  hotdog_vendor: ['pitch', 'price', 'thanks', 'slow_day', 'order_up'],
  coconut_vendor: ['pitch', 'price', 'thanks'],
  icecream_vendor: ['pitch', 'price', 'thanks'],
  churro_vendor: ['pitch', 'price', 'thanks'],
  coffee_window: ['call_order', 'greet_regular', 'take_order', 'banter', 'closing'],
  lifeguard: ['whistle_warning', 'all_clear', 'chat', 'rescue', 'tower_off_limits'],
  street_performer: ['patter', 'thanks_tip', 'heckled', 'between_songs'],
  construction: ['banter', 'warn_keep_back', 'lunch', 'complain_boss'],
  delivery_driver: ['in_a_hurry', 'blocked', 'banter', 'wrong_address'],
  car_washer: ['working', 'pitch', 'banter'],
  domino_player: ['slam', 'trash_talk', 'accuse', 'politics_free_banter', 'invite'],
  fisherman: ['patience', 'brag', 'nothing_biting', 'advice'],
  shop_owner_opening: ['hosing_sidewalk', 'greet_morning', 'complain_rent', 'invite_in'],
  garbage_crew: ['banter', 'early', 'warn'],
  paramedic: ['arrive', 'treating', 'crowd_back', 'leaving'],
  bouncer: ['line_control', 'dress_code', 'refuse', 'vip'],
  club_line: ['waiting', 'excited', 'cold_feet'],
  jogger: ['passing', 'out_of_breath'],
  dog_walker: ['to_dog', 'to_player_about_dog', 'apologize_dog'],
  parent: ['to_kid', 'tired', 'proud'],
  bus_rider: ['late_bus', 'small_talk', 'boarding'],
  smoker_break: ['venting', 'small_talk', 'back_to_work'],
  tourist_guide: ['spiel', 'herding', 'fun_fact'],
  security_guard: ['notice', 'warn', 'bored'],
  beachgoer: ['sunscreen', 'water_cold', 'volleyball_call', 'relaxing'],
  bartender_patio: ['last_call', 'banter', 'cut_off'],
  preacher_corner: ['calling', 'blessing', 'ignored'],
  food_truck: ['call_number', 'pitch', 'sold_out'],
  valet: ['greet', 'careful_promise', 'tip_hint'],
};
// Writers: no real brands, celebrities, sports teams, song lyrics or anything from another game. No slurs. Mild swearing only.
export const BANNED = ['Vice City', 'Leonida', 'Grassrivers', 'Kalaga', 'Port Gellhorn', 'Ambrosia', 'Watson Bay', 'Key Lento', 'Hamlet', 'Rusty Anchor', 'Wonder Whale', 'Dinka', 'Vapid', 'Schafter', 'Rockstar', 'GTA', 'Los Santos', 'Liberty City'];
