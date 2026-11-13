/* Titans opponents, released by Jim. The same file sits in game/ and offense/.

   Data, not code: the apps check the server for this file first, every time they
   open (with a 2.5 second limit, then the copy they already have), so a change here
   reaches the iPads with no version bump. Same rule as roster.js.

   One row per team:
     id     PERMANENT. Never change it, never reuse it. The dashboard and the Pull
            buttons match games on it, so a new id splits a team in two.
     name   The full name the apps show and export. Fix a spelling here freely.
     short  What fits in the header (about 14 letters; the header box is 128px). Optional.
     aka    Other ways it gets written, e.g. on our schedules. When a coach types
            one of these under "Other team", the app picks the team for him.
   Add a team: copy a row, give it a new id (lowercase, dashes), push.
   A team we stop playing stays in the list, so old games keep their name. */
window.TITANS_OPPONENTS_STAMP = "2027 schedules, Nov 13 2026";
window.TITANS_OPPONENTS = [
  {id: "castle-view",       name: "Castle View",       short: "Castle View",     aka: ["CV"]},
  {id: "chaparral",         name: "Chaparral",         short: "Chaparral",       aka: ["CHAP"]},
  {id: "chatfield",         name: "Chatfield",         short: "Chatfield",       aka: []},
  {id: "cherokee-trail",    name: "Cherokee Trail",    short: "Cherokee Trail",  aka: []},
  {id: "cherry-creek",      name: "Cherry Creek",      short: "Cherry Creek",    aka: ["CREEK"]},
  {id: "cheyenne-mountain", name: "Cheyenne Mountain", short: "Cheyenne Mtn",    aka: []},
  {id: "douglas-county",    name: "Douglas County",    short: "Douglas County",  aka: ["DCHS"]},
  {id: "eaglecrest",        name: "Eaglecrest",        short: "Eaglecrest",      aka: []},
  {id: "grandview",         name: "Grandview",         short: "Grandview",       aka: []},
  {id: "heritage",          name: "Heritage",          short: "Heritage",        aka: []},
  {id: "highlands-ranch",   name: "Highlands Ranch",   short: "Highlands Rch",   aka: ["HRHS"]},
  {id: "lakewood",          name: "Lakewood",          short: "Lakewood",        aka: []},
  {id: "legacy",            name: "Legacy",            short: "Legacy",          aka: []},
  {id: "mountain-vista",    name: "Mountain Vista",    short: "Mountain Vista",  aka: []},
  {id: "ponderosa",         name: "Ponderosa",         short: "Ponderosa",       aka: ["PONDO"]},
  {id: "regis-jesuit",      name: "Regis Jesuit",      short: "Regis Jesuit",    aka: ["Regis"]},
  {id: "rock-canyon",       name: "Rock Canyon",       short: "Rock Canyon",     aka: []},
  {id: "thunderridge",      name: "ThunderRidge",      short: "ThunderRidge",    aka: ["T-RIDGE"]},
  {id: "valor-christian",   name: "Valor Christian",   short: "Valor Christian", aka: ["Valor"]}
];
