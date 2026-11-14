// What people say (NPC-AI track), first slice. Original short lines organized by voice group x situation,
// English with Miami Spanish / Spanglish (and some Haitian Kreyol) flavor. A picker avoids repeats per person and
// across the whole street (a ring of recently spoken lines). Lines are separated by '|'. '{name}' is replaced by
// the speaker's first name, '{car}' by a word for the player's vehicle.
import { hashInts, rng } from './rand.js';

// voice (identity.voice) -> line group
export const VOICE_GROUP = {
  warm: 'warm', kreyol: 'kreyol', kid: 'warm', tourist: 'tourist', elder_cuban: 'elder', gruff: 'gruff', tough: 'gruff',
  anxious: 'anxious', chill: 'chill', bro: 'chill', worker: 'chill', artsy: 'chill', drunk: 'chill',
  pro: 'pro', snob: 'pro', hustler: 'slick', flirty: 'slick', influencer: 'slick',
};
export const SITUATIONS = ['greet', 'bumped', 'honked', 'weapon', 'crash', 'gunfire', 'rain', 'heat', 'carPraise', 'carInsult', 'chat', 'call911'];

const BANK = {
  warm: {
    greet: 'Morning! Beautiful day, huh?|Hey there, take it easy.|Buenas, how you doing?|Hi! Love your energy today.|Hey neighbor, stay cool out here.|Afternoon! Don\'t let the sun get you.',
    bumped: 'Oh! Sorry, my bad.|Whoa, careful there, papi.|No worries, we\'re good.|Excuse me, I didn\'t see you.|Ay, perdón, all good.|Easy, there\'s room for both of us.',
    honked: 'Okay, okay, I\'m moving!|Sorry, sorry, going!|You scared me half to death!|Alright, no need for that.|Ay, I\'m crossing, I\'m crossing.',
    weapon: 'Hey, put that away, please.|Whoa, nobody needs that today.|Ay Dios mío, is that real?|Please, I don\'t want trouble.|Okay, I\'m just going to walk away.',
    crash: 'Is everybody okay in there?|Oh no, somebody call for help!|Don\'t move, you might be hurt!|Ay, that was bad. You alright?|I\'ll stay with you till help comes.',
    gunfire: 'Get down, everybody down!|Oh my God, run!|Was that a gun? Run!|Kids, inside, now!',
    rain: 'Here it comes again, typical.|Five minutes of rain, then sauna.|Forgot my umbrella, of course.',
    heat: 'It\'s like walking through soup today.|I need a cafecito with ice.|This heat is no joke, drink water.',
    carPraise: 'That {car} is gorgeous!|Ooh, nice ride, congrats.|Now that\'s a {car}. Qué lindo.|Clean car, you take care of it.',
    carInsult: 'That {car} has seen better days.|Is that thing safe to drive?|Your {car} is crying for a wash.|Bless your heart, that {car}.',
    chat: 'My sister finally called me back.|We should do brunch Sunday.|The new bakery on the corner is amazing.|My abuela says hi, by the way.|Did you see the sunset yesterday?|I\'m trying to walk more, doctor\'s orders.',
  },
  kreyol: {
    greet: 'Sak pase! Everything good?|Bonjou, have a blessed day.|Hey, n\'ap boule, you?|Good morning, my friend.|Bonswa, take care of yourself.|Hey, God is good today.',
    bumped: 'Eh, gade! Watch where you go.|Pardon, pardon, no problem.|Easy, easy, my friend.|Mezanmi, you\'re in a hurry.|No stress, we\'re fine.|Watch the shoulder, cheri.',
    honked: 'Eh! Patience, patience!|I see you, I see you!|Why you honking at me?|Calm down, I\'m walking.|Bondye, these drivers!',
    weapon: 'Bondye! Put that away!|No, no, I don\'t want problems.|Mezanmi, he has a gun!|Okay, I\'m going, I\'m going.|Please, I have family.',
    crash: 'Mezanmi! Somebody help!|Don\'t move him, wait!|Call 911, quick quick!|Bondye, you okay in there?|I saw it, I saw everything.',
    gunfire: 'Bondye! Everybody run!|Kouri! Kouri!|Get down! Down!|Lord have mercy, shooting!',
    rain: 'Lapli again! Every day.|The rain comes, the street floods.|Run, run, it\'s coming down!',
    heat: 'Cho! The sun is angry today.|Even the iguanas are hiding.|I need shade, cheri.',
    carPraise: 'Ooh, that {car} is nice, wi!|Bel machin! Very clean.|You doing good, my friend!|Nice {car}, God bless.',
    carInsult: 'That {car} is tired, my friend.|Eh, it still runs? Miracle.|Your {car} needs a mechanic and a prayer.|Pa fè sa, that {car} is sad.',
    chat: 'My cousin is coming from Port-au-Prince.|Church was full Sunday.|You going to the market later?|The griot at that place is the best.|My son passed his exam!|I work double shift again tomorrow.',
  },
  tourist: {
    greet: 'Hi! Is the beach this way?|Hello! Gorgeous weather, right?|Hey! First time in Southline!|Morning! Where\'s good for breakfast?|Hi there! Love this town.|Excuse me, is this Ocean Drive?',
    bumped: 'Oh gosh, so sorry!|Oops, my fault, I was looking up.|Sorry! Busy sidewalk.|Whoa! No harm done.|Sorry, I\'m lost, ha.|Pardon me!',
    honked: 'Sorry! Are we in the bike lane?|Yikes, okay, moving!|Is that for us?|Wow, drivers here are intense.|Oh! Okay, okay.',
    weapon: 'Is that a real gun?!|Honey, let\'s go back to the hotel.|Nobody told us about this part.|Oh no no no.|We\'re just tourists, please!',
    crash: 'Did you see that?! Oh my gosh!|Should we call someone? What\'s the number here?|Is he okay? Somebody help!|I got it on video, if they need it.|That was so fast!',
    gunfire: 'Were those fireworks?|Run! Back to the hotel!|Get down, get down!|Oh my God, that was a gun!',
    rain: 'Where did this rain come from?!|It was sunny five minutes ago!|Well, there goes the beach day.',
    heat: 'I\'m melting. Literally melting.|Is it always this humid?|Need more sunscreen, I\'m a lobster.',
    carPraise: 'Wow, can I take a picture with that {car}?|Now THAT is a Miami car!|Look at that {car}! So cool.|We have nothing like that back home.',
    carInsult: 'Is that a rental? Ha.|That {car} looks like ours back home.|Yikes, someone\'s {car} had a rough year.|Bet that {car} has stories.',
    chat: 'We should do the boat tour tomorrow.|I want to try a real Cuban sandwich.|The hotel pool closes at eight?|Did you put on sunscreen?|Let\'s find that rooftop bar.|My feet hurt, but I don\'t care.',
  },
  elder: {
    greet: 'Buenos días, mijo.|Oye, qué bolá?|Saludos, young man.|Buenas tardes, cuídate.|Ey, you look like my nephew.|Hola, hola, que Dios te bendiga.',
    bumped: 'Oye, cuidado! I\'m old, not invisible.|Ay, mijo, slow down!|Qué falta de respeto!|In my day we said excuse me.|Mira, mira, watch it!|Despacio, the street is for everybody.',
    honked: 'Toca, toca, I\'m not moving faster!|Qué escándalo! I have legs of seventy years!|Calma, chico, calma!|Honk at your mother like that?|Ay, no me apures.',
    weapon: 'Guarda eso, muchacho!|Ay Virgen, a pistol!|I saw worse in my time. Put it away.|Ay, ay, I\'m going home.|Muchacho, que tu madre te vea!',
    crash: 'Ay Dios mío! Llamen a alguien!|I told you, everybody drives crazy here!|No lo muevan, wait for the ambulance!|Ave María Purísima!|I saw it, the other one ran the light!',
    gunfire: 'Ay, tiros! Everybody inside!|Al piso, al piso!|Virgen santísima!|Corran, muchachos!',
    rain: 'Aguacero! Like in Havana.|Ya viene el agua, vámonos.|My knee told me this morning.',
    heat: 'Qué calor, my God.|This is not heat, this is punishment.|A guarapo frío right now, ay.',
    carPraise: 'Qué carro más lindo!|Eso es un carro de verdad.|Mijo, you must work hard. Nice {car}.|Ah, that {car}, que elegante.',
    carInsult: 'That {car} is older than me.|Ese carro es una cafetera!|In Cuba we fix that with a spoon.|Mijo, sell that {car} for parts.',
    chat: 'The coffee here is not like before.|My grandson is studying to be a doctor.|Dominoes at four, don\'t be late.|The price of everything, my God!|Did you hear? Rosita\'s getting married.|When I came in \'62 this was all different.',
  },
  gruff: {
    greet: 'Yeah, what?|Mm. Hey.|You need something?|Don\'t block the sidewalk.|Keep walking, buddy.|Morning. Whatever.',
    bumped: 'Hey! Watch it!|You blind or what?|Back off, man.|Again with this? Walk straight.|Touch me again, see what happens.|Eyes up, genius.',
    honked: 'Honk again, I dare you!|Yeah, I heard you, idiot!|Get outta here with that!|You want a problem?|Lean on that horn one more time.',
    weapon: 'Oh, you\'re tough now?|Put it down and say that.|I\'m not scared of you.|Big man with a gun, huh?|Walk away, I\'m warning you.',
    crash: 'Learn to drive, clown!|That\'s what you get speeding.|Someone call it in, I\'m busy.|Unbelievable. Every day here.|Ha, nice parking.',
    gunfire: 'Everybody down, now!|Who\'s shooting?!|Get behind the car!|Move, move!',
    rain: 'Great. Just great.|Rain again. Figures.|Get off the sidewalk, it\'s pouring.',
    heat: 'Hot as hell out here.|Don\'t talk to me in this heat.|This humidity is killing me.',
    carPraise: 'Hm. Not bad.|Okay, that {car} I respect.|Nice. You probably didn\'t pay for it.|Decent {car}. Drive it right.',
    carInsult: 'That {car} is garbage.|You\'re driving that? Seriously?|Get that junk off my street.|Pathetic {car}, man.',
    chat: 'Landlord raised the rent again.|Team blew the game in the last minute.|Don\'t get me started on traffic.|My boss is a clown.|Nobody signals anymore.|I\'m not doing overtime again.',
  },
  anxious: {
    greet: 'Oh! Um, hi.|H-hey. Sorry.|Hi... nice day, I guess.|Oh, hello, didn\'t see you.|Um, hey there.|Hi! Okay, bye.',
    bumped: 'Sorry! Sorry, my fault!|Oh no, are you mad?|I\'m sorry, I\'m sorry!|Please don\'t, I didn\'t mean it!|Ah! You scared me.|Oh gosh, excuse me.',
    honked: 'Ah! Sorry!|Oh my God, my heart!|I\'m going, I\'m going!|Sorry, I thought it was green!|Please don\'t hit me!',
    weapon: 'Oh no, oh no, oh no.|Please don\'t shoot!|I didn\'t see anything!|I just want to go home.|Somebody help, he has a gun!',
    crash: 'Oh my God, is he dead?|I can\'t look, I can\'t look.|Somebody do something!|I\'m shaking, I\'m shaking.|Should I call? I should call.',
    gunfire: 'No no no no!|Help! Somebody help!|I don\'t want to die!|Hide, hide!',
    rain: 'Is that thunder? I hate thunder.|My phone is going to get wet.|I knew I should have stayed home.',
    heat: 'I think I\'m getting heatstroke.|Is it normal to sweat this much?|I need to sit down somewhere.',
    carPraise: 'Oh, that\'s a nice {car}.|Wow, um, cool car.|That must be expensive.|Please don\'t scratch it near me.',
    carInsult: 'Is that {car} going to explode?|That doesn\'t look safe.|Um, your car is smoking? Maybe?|I wouldn\'t get in that.',
    chat: 'Did I lock the door? I think I did.|I have that interview tomorrow.|Do you think it\'s going to storm?|I read about a shark sighting.|My rent is due Friday, ugh.|I can\'t sleep lately.',
  },
  chill: {
    greet: 'Yo, what\'s good?|Ey, wassup, bro.|Hey, all good?|Dale, how you been?|Sup, man. Easy day.|Wepa! What\'s up?',
    bumped: 'Whoa, easy, bro.|Hey, chill, man.|All good, all good.|Watch the kicks, bro.|Dude, you good?|Relax, we got the whole sidewalk.',
    honked: 'Bro, chill with the horn.|Dale, dale, I\'m moving.|Damn, relax.|What\'s the rush, man?|Yo, I see you.',
    weapon: 'Yo, put that away, bro.|Nah man, not today.|Whoa, whoa, easy with that.|Bro, no. Just no.|I\'m out, man.',
    crash: 'Yo! That was crazy!|Bro, you okay?|Dude got wrecked.|Somebody check on him.|Damn, that was loud.',
    gunfire: 'Yo, run, run!|Get down, bro!|Nah, I\'m out!|Shots, move!',
    rain: 'Rain\'s here, bro, find a roof.|Free shower, ha.|Classic Miami, five minutes and done.',
    heat: 'It\'s hot hot today, bro.|Need a smoothie, like, now.|Sun\'s cooking me.',
    carPraise: 'Yo, that {car} is fire!|Sick ride, bro.|Dale! That {car} is clean.|Respect, that {car} goes hard.',
    carInsult: 'Bro, that {car} is rough.|Yo, what is that, a toaster?|That {car} needs a miracle, man.|Ha, nice hoopty.',
    chat: 'You going to the thing tonight?|Waves were decent this morning.|Bro, that taco truck is back.|Gym later? Nah, beach.|My cousin got a new boat.|Need a nap, honestly.',
  },
  pro: {
    greet: 'Morning.|Hi. Excuse me, in a hurry.|Good afternoon.|Hello. Can\'t talk.|Hey. Running late.|Morning, have a good one.',
    bumped: 'Excuse me! Watch your step.|Do you mind?|Unbelievable. This is a new suit.|Look where you\'re walking.|Seriously? I\'m late.|Personal space, please.',
    honked: 'I have the right of way!|Some of us have meetings!|Really? Really.|I\'m reporting your plate.|Learn the rules of the road.',
    weapon: 'I\'m calling the police right now.|This is unacceptable.|Security! Somebody!|Don\'t point that at me.|I\'m leaving. Now.',
    crash: 'I\'m calling it in.|Typical. Nobody can drive here.|I saw the whole thing, I\'ll be a witness.|Are you insured?|Get that off the road.',
    gunfire: 'Everyone inside the building!|Call 911, now!|Get away from the windows!|Go, go, go!',
    rain: 'Perfect. Before my meeting.|My shoes are ruined.|Where\'s a rideshare when you need one.',
    heat: 'This heat is unprofessional.|I\'m sweating through my shirt.|Air conditioning, please.',
    carPraise: 'Nice {car}. Leased?|Respectable choice.|Not bad. Mine\'s in the shop.|That {car} holds its value.',
    carInsult: 'That {car} lowers property values.|You should really upgrade.|Is that street legal?|Please don\'t park that near my building.',
    chat: 'The Q3 numbers are a mess.|I have back-to-back calls till six.|They moved the closing to Friday.|My trainer says I need more cardio.|We\'re looking at a condo in Brickell.|I haven\'t had a day off in weeks.',
  },
  slick: {
    greet: 'Hey gorgeous, how\'s it going?|Ey, look at you!|Hey hey, what\'s up, star?|Hola guapo, you lost?|What\'s good, my friend?|Ey! Long time, no see. Kidding.',
    bumped: 'Ooh, if you wanted my number, just ask.|Careful, these are new.|Easy, handsome.|Hey, watch the merch!|Ay, that\'s one way to say hi.|You owe me a drink for that.',
    honked: 'Honk all you want, still cute.|Was that for me? Thanks!|Okay, okay, I\'m going, papi.|Wow, rude! But okay.|Save the horn for the club.',
    weapon: 'Whoa, I\'m not filming, I swear.|That\'s not a vibe.|Okay, deal\'s off, deal\'s off!|Nope, nope, bye!|Babe, put it away, people are looking.',
    crash: 'Wait, I\'m going live.|This is going viral.|Oh no, is he okay? Wait, hold on, recording.|Insane! Did you get that?|Somebody call someone!',
    gunfire: 'Nope! I\'m out!|Run, run, run!|Get down, babe!|Oh my God, that was real!',
    rain: 'My hair! No, no, no!|Rain ruins the lighting.|Ugh, not the outfit!',
    heat: 'Glowing, not sweating.|Perfect tan weather.|Golden hour can\'t come fast enough.',
    carPraise: 'Ooh, take me for a ride in that {car}!|Now that\'s a content car.|Clean {car}! Want to sell it?|That {car} fits the vibe.',
    carInsult: 'That {car} is not it.|Bro, park that around the corner.|I can get you a better {car}, cheap.|That ride is killing your image.',
    chat: 'I got a guy for that, trust me.|Twenty-three k followers, almost there.|That party last night? Insane.|I can get you in, VIP.|We need content at the beach today.|You still owe me fifty, by the way.',
  },
};
// what callers say on the phone to dispatch (any voice)
const CALL911 = 'Yes, hi, I want to report shots fired.|There\'s a guy with a gun on the street, please hurry.|Hello? There\'s been a crash, someone\'s hurt.|I\'m on the corner, I can see him right now.|He ran that way! Please send someone.|Somebody\'s fighting out here, it\'s bad.|I need police, there\'s shooting.|An accident, two cars, send an ambulance.|I think somebody got hit.|I don\'t know, he\'s just walking around with a gun.|Yes, I\'m safe. I\'m hiding behind a car.|Please hurry, there are kids here.';

const PARSED = {};
for (const g in BANK) { PARSED[g] = {}; for (const s in BANK[g]) PARSED[g][s] = BANK[g][s].split('|'); }
PARSED.call911 = CALL911.split('|');

export function lineCount() { let n = PARSED.call911.length; for (const g in BANK) for (const s in PARSED[g]) n += PARSED[g][s].length; return n; }

const recent = []; const recentSet = new Set(); const RECENT = 80;
let pickN = 0;
/** person: { seed, first, voice } (identity). situation: one of SITUATIONS. Returns a string or null. */
export function pickLine(person, situation, ctx = {}) {
  const g = VOICE_GROUP[person?.voice] || 'warm';
  let arr = situation === 'call911' ? PARSED.call911 : PARSED[g]?.[situation];
  if (situation === 'call911' && ctx.topic) { const re = ctx.topic === 'crash' ? /crash|accident|hit|hurt|ambulance/i : ctx.topic === 'fight' ? /fight|hurt|bad/i : /shot|gun|shoot|hiding|ran|corner|kids/i; const f = arr.filter((s) => re.test(s)); if (f.length) arr = f; }
  if (!arr || !arr.length) return null;
  const said = (person._said ||= new Set());
  const r = rng(hashInts(person.seed || 1, pickN++, situation.length));
  let best = null;
  for (let k = 0; k < 8; k++) {
    const s = arr[(r() * arr.length) | 0];
    if (said.has(s) || recentSet.has(s)) continue;
    best = s; break;
  }
  if (!best) best = arr[(r() * arr.length) | 0];
  said.add(best); if (said.size > 6) said.delete(said.values().next().value);
  recent.push(best); recentSet.add(best); if (recent.length > RECENT) recentSet.delete(recent.shift());
  return best.replace(/\{name\}/g, person.first || '').replace(/\{car\}/g, ctx.car || 'car');
}
