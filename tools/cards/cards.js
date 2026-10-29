/* Player cards: the whole loop on the stand-in Sheet (Oct 28, 2026).

     cd titans-apps && node tools/cards/cards.js

   Reads tools/cards/fixture-sheet.json (the demo game, demo offense game and 3 pens,
   filed through the real apps into the real receiver; rebuild it with fixture.js).
   Runs cards/Code.gs on the stand-in Apps Script runtime. No real email is sent:
   MailApp here only records what would have gone out.

   What it proves:
   - Safety: off sends nothing, test sends only to TEST_TO, old records never card,
     practice rows never card, the page can't start a run, a coach-only note never
     appears, nobody else's name appears on a card.
   - The numbers on each card match the Sheet, worked out separately here.
   - Live mode: real address, parent copied, quota respected and resumed, no repeats.
   - Reminders: 1, a day later, only for his latest card, never after he reflects.
   - The page and reflections: bad links refused, his cards only, the save checks
     everything, flags route by role and level, last time's START closes the loop. */
"use strict";
const fs = require("fs");
const path = require("path");
const { makeRuntime } = require("../receiver/mock-gas");

const ROOT = path.join(__dirname, "..", "..");
const CODE = process.env.CARDS_CODE || path.join(ROOT, "cards", "Code.gs");
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, "fixture-sheet.json"), "utf8"));
const ROSTER = fs.readFileSync(path.join(ROOT, "bullpen", "roster.js"), "utf8");
const ROSTER_URL = "https://legendbaseballapps.github.io/titans-apps/bullpen/roster.js";

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL " + m); } }
function eq(a, b, m) { ok(a === b, m + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }
function text(h) { return h.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;|&middot;/g, " ").replace(/&#8209;/g, "-").replace(/&rarr;/g, ">").replace(/&rsquo;|&#39;/g, "'")
  .replace(/&ndash;/g, "-").replace(/&minus;/g, "-").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(); }
function throws(f, m) { let t = false; try { f(); } catch (e) { t = true; } ok(t, m); }

const SMITH = "ad6bxsq", HALL = "k4dswh3", BORCH = "1ry7wkr", HAZEN = "fro8j13", BOBO = "zvn2wpb", HERBERT = "nlc1j7w";
const T0 = Date.parse("2027-04-06T13:00:00Z");

function world(opts) {
  opts = opts || {};
  const rt = makeRuntime(CODE, { fetch: { [ROSTER_URL]: ROSTER }, quota: opts.quota });
  const b = rt.newBook("S");
  Object.keys(FIX).forEach(n => { b.insertSheet(n).data = JSON.parse(JSON.stringify(FIX[n])); });
  rt.props.SEASON_SHEET_ID = "S";
  let now = T0;
  rt.sandbox.now_ = () => now;
  rt.clock = { set(t) { now = t; }, add(h) { now += h * 3600000; }, get() { return now; } };
  rt.b = b;
  rt.call = (fn, ...a) => rt.sandbox[fn](...a);
  return rt;
}
function tab(rt, n) { return rt.b.getSheetByName(n).records(); }
function setPlayer(rt, id, o) {
  const sh = rt.b.getSheetByName("Players"), h = sh.header();
  const row = sh.data.findIndex((r, i) => i && r[0] === id);
  Object.keys(o).forEach(k => { sh.data[row][h.indexOf(k)] = o[k]; });
}
function ready(rt, mode) {
  rt.call("setup");
  rt.call("addRosterPlayers");
  rt.props.CARDS_FROM = "2026-01-01T00:00:00Z";
  rt.props.SEND_MODE = mode;
  rt.props.TEST_TO = "jim.test@example.com";
  rt.props.PAGE_URL = "https://script.google.com/macros/s/CARDS/exec";
  rt.props.ADMIN_EMAIL = "admin@example.com";
  setPlayer(rt, SMITH, { "Player email": "smith@example.com", "Parent email": "smith.parent@example.com" });
  setPlayer(rt, HALL, { "Player email": "hall@example.com", Send: "No" });
  setPlayer(rt, HAZEN, { "Player email": "hazen@example.com" });
  setPlayer(rt, BOBO, { "Player email": "bobo@example.com", Level: "Varsity" });
  const co = rt.b.getSheetByName("Coaches");
  co.data.push(["Coach A", "a@example.com", "Varsity", "Pitching"]);
  co.data.push(["Coach B", "b@example.com", "Varsity, JV", "Hitting"]);
  co.data.push(["Coach C", "c@example.com", "JV", "Pitching"]);
  co.data.push(["Coach D", "d@example.com", "All", "Both"]);
}
function tokenOf(rt, pid) { const r = tab(rt, "Player_Links").find(x => x.PlayerID === pid); return r && r.Token; }
function cardOf(rt, rid, pid) { return rt.call("previewCard", rid, pid); }

/* ---------------------------------------------------------- expected numbers, worked out here */
function rowsOf(tabName, rid, key, pid) {
  const [h, ...rows] = FIX[tabName];
  return rows.map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))).filter(o => o.RecordID === rid && o[key] === pid);
}
const REC = {}; { const [h, ...rows] = FIX.Records; rows.forEach(r => { const o = Object.fromEntries(h.map((k, i) => [k, r[i]])); REC[o.App + (o.App === "bullpen" ? o.Date : "")] = o.RecordID; }); }
const PEN1 = REC["bullpen2027-01-12"], PEN2 = REC["bullpen2027-01-19"], LIVE = REC["bullpen2027-01-26"], GAME = REC.game, OFF = REC.offense;

/* ========================================================== 1. setup, guard, off */
{
  const rt = world();
  rt.call("setup");
  ["Players", "Player_Links", "Cards", "Reflections"].forEach(n => ok(!!rt.b.getSheetByName(n), "setup made " + n));
  ok(rt.b.getSheetByName("Coaches").header().includes("Notify"), "setup added Notify to Coaches");
  eq(rt.props.SEND_MODE, "off", "setup leaves SEND_MODE off");
  ok(Date.parse(rt.props.CARDS_FROM) === T0, "CARDS_FROM set to the moment setup ran");
  rt.call("setup");
  eq(rt.b.getSheetByName("Coaches").header().filter(x => x === "Notify").length, 1, "setup twice adds Notify once");
  eq(rt.b.order.filter(n => n === "Cards").length, 1, "setup twice makes one Cards tab");
  const n = rt.call("addRosterPlayers");
  ok(n > 50, "addRosterPlayers listed the roster (" + n + ")");
  eq(rt.call("addRosterPlayers"), 0, "addRosterPlayers twice adds nobody");
  const sm = tab(rt, "Players").find(p => p.PlayerID === SMITH);
  ok(sm && sm.Last === "Smith" && sm.First === "Colten" && sm.Send === "Yes", "roster row: Smith, Colten, Send Yes");

  /* the page side can't start anything: a visitor is not the owner */
  rt.session.active = "";
  ["setup", "addRosterPlayers", "installTriggers", "runEvening", "runMorning", "previewCard", "sendTestCard", "newLink"]
    .forEach(f => throws(() => rt.call(f), f + " refuses a page visitor"));
  rt.session.active = "someone.else@gmail.com";
  throws(() => rt.call("runMorning"), "runMorning refuses another signed-in account");
  throws(() => rt.call("runMorning", { triggerUid: "1001" }), "a made-up trigger id is refused");
  rt.session.active = "owner@example.com";
  rt.call("installTriggers"); rt.call("installTriggers");
  eq(rt.triggers.length, 2, "installTriggers twice leaves 2 triggers");
  ok(rt.triggers.some(t => t.fn === "runEvening" && t.hour === 19) && rt.triggers.some(t => t.fn === "runMorning" && t.hour === 7), "7 pm pens, 7 am games");
  rt.session.active = "";
  const tr = rt.triggers.find(t => t.fn === "runMorning");
  rt.props.SEND_MODE = "off";
  const o = rt.call("runMorning", { triggerUid: tr.getUniqueId() });
  eq(o.mode, "off", "its own trigger is let in");
  rt.session.active = "owner@example.com";

  /* what google.script.run could reach: every global function not ending in _ */
  const pub = Object.keys(rt.sandbox).filter(k => typeof rt.sandbox[k] === "function" && !/_$/.test(k) &&
    fs.readFileSync(CODE, "utf8").includes("function " + k + "("));
  eq(pub.sort().join(","), "addRosterPlayers,doGet,installTriggers,newLink,previewCard,runEvening,runMorning,saveReflection,sendTestCard,setup",
     "public functions are exactly the known list");

  /* records received before CARDS_FROM never card, even in live */
  rt.props.SEND_MODE = "live";
  setPlayer(rt, SMITH, { "Player email": "smith@example.com" });
  const r = rt.call("runMorning");
  eq(rt.mail.length, 0, "records from before setup get no card");
  eq(tab(rt, "Cards").length, 0, "and leave no Cards rows");
  eq(r.sent, 0, "sent 0");
}

/* ========================================================== 2. off and test modes */
{
  const rt = world();
  ready(rt, "off");
  rt.call("runEvening"); rt.call("runMorning");
  eq(rt.mail.length, 0, "off: no email");
  eq(tab(rt, "Cards").length, 0, "off: no Cards rows");

  rt.props.SEND_MODE = "test"; rt.props.TEST_TO = "";
  rt.call("runMorning");
  eq(rt.mail.length + tab(rt, "Cards").length, 0, "test with no TEST_TO: nothing at all");
  rt.props.TEST_TO = "jim.test@example.com";

  const ev = rt.call("runEvening");
  ok(rt.mail.every(m => m.to === "jim.test@example.com" && !m.cc), "test: every email to TEST_TO only, no cc");
  eq(rt.mail.length, 3, "evening: Smith's 3 pens (Hall is Send No, Borcherding has no email)");
  ok(rt.mail.every(m => /^\[TEST for smith@example\.com cc smith\.parent@example\.com\] Your pen card/.test(m.subject)), "test subject names the real addresses");
  const cards = tab(rt, "Cards");
  ok(!cards.some(c => c.Kind === "pitch" || c.Kind === "hit"), "evening run carded no games");
  eq(cards.filter(c => c.PlayerID === HALL && c.Kind === "pen").map(c => c.Status).join(), "Send is No,Send is No", "Hall: Send is No on both his pens, logged");
  eq(cards.filter(c => c.PlayerID === BORCH && c.Kind === "pen").map(c => c.Status)[0], "no email", "Borcherding: no email, logged");
  eq(cards.filter(c => /\|\*\|done$/.test(c.Key)).length, 3, "3 pen records marked done");
  eq(ev.test, 3, "run summary counts 3 test sends");

  rt.mail.length = 0;
  rt.call("runMorning");
  eq(rt.mail.length, 3, "morning: Smith's game card, Hazen and Bobo");
  const subj = rt.mail.map(m => m.subject).join(" | ");
  ok(/smith@example\.com.*Your game card: vs Ridgeview, Apr 6/.test(subj), "pitcher game card subject");
  ok(/hazen@example\.com\] Your game card: at Ridgeview, Apr 6/.test(subj), "hitter card subject (away game)");
  eq(tab(rt, "Cards").filter(c => c.Kind === "hit" && c.Status === "no email").length, 7, "7 hitters with no email logged");
  rt.mail.length = 0;
  rt.call("runMorning"); rt.call("runEvening");
  eq(rt.mail.length, 0, "running again sends nothing new");
  const keys = tab(rt, "Cards").map(c => c.Key);
  eq(new Set(keys).size, keys.length, "no Cards key twice");

  /* tokens: one per player who got a card, 40 hex characters */
  const links = tab(rt, "Player_Links");
  eq(links.length, 3, "a private link for each player carded (Smith, Hazen, Bobo)");
  ok(links.every(l => /^[0-9a-f]{40}$/.test(l.Token)), "links are 40 random hex characters");
}

/* ========================================================== 3. what is on each card */
{
  const rt = world();
  ready(rt, "test");
  rt.call("runEvening"); rt.call("runMorning");

  /* -- pen card, Smith, Jan 19, vs Jan 12 */
  const pen = cardOf(rt, PEN2, SMITH), pt = text(pen);
  const R2 = rowsOf("Bullpen_Pitches", PEN2, "PitcherID", SMITH), R1 = rowsOf("Bullpen_Pitches", PEN1, "PitcherID", SMITH);
  const g = rs => rs.filter(r => r.Result !== ""), spot = rs => rs.filter(r => r.Result === "Spot").length,
        near = rs => rs.filter(r => r.Result === "Spot" || r.Result === "Close").length, str = rs => rs.filter(r => r.Strike === "Y").length;
  const p = (a, b) => Math.round(a * 100 / b);
  ok(pt.includes("Colten Smith"), "pen card: his name");
  ok(pt.includes("Winter bullpen Tue, Jan 19 Hitter's Counts " + R2.length + " pitches"), "pen card: date, template, pitches");
  ok(pt.includes(spot(R2) + " On the spot " + near(R2) + " Spot or next to it " + str(R2) + " Strikes"), "pen card: spot / next / strikes tiles");
  ok(pt.includes("On the spot " + p(spot(R2), g(R2).length) + "% " + p(spot(R1), g(R1).length) + "%"), "pen card: on the spot today vs last pen");
  ok(pt.includes("Strikes " + p(str(R2), R2.length) + "% " + p(str(R1), R1.length) + "%"), "pen card: strikes today vs last pen");
  ok(pt.includes("The change-up was on the spot 4 of 13. Finish it out front."), "pen card: the note to him");
  ok(/From your coaches/.test(pt), "pen card: note labelled From your coaches");
  const miss = g(R2).filter(r => r.Result !== "Spot");
  ok(pt.includes(miss.length + " pitches missed the spot."), "pen card: miss count");
  const fbRows = R2.filter(r => r.CalledType === "FB"), velos = fbRows.map(r => r.Velo).filter(v => v !== "");
  ok(pt.includes("Fastball " + fbRows.length + " " + spot(fbRows) + " " + near(fbRows) + " " +
     Math.round(velos.reduce((a, b) => a + b, 0) / velos.length) + " / " + Math.max(...velos)), "pen card: fastball row with velo");
  const cnt = {}; R2.forEach(r => { const k = r.ActualRow + "," + r.ActualCol; cnt[k] = (cnt[k] || 0) + 1; });
  ok(Object.values(cnt).reduce((a, b) => a + b, 0) === R2.length, "grid accounts for every pitch (sanity)");
  ok(!/Hall|Borcherding/.test(pt), "pen card: no other pitcher's name");
  const first = cardOf(rt, PEN1, SMITH);
  ok(!/Last pen/.test(text(first)), "first pen of the winter: no last-pen column");
  ok(!/From your coaches/.test(text(first)), "no note written: no note box");

  /* -- live ABs card */
  const lv = text(cardOf(rt, LIVE, SMITH));
  ok(lv.includes("Live at-bats Tue, Jan 26 24 pitches"), "live card: header");
  ok(lv.includes("6 Hitters"), "live card: 6 hitters");
  const LR = rowsOf("Bullpen_Pitches", LIVE, "PitcherID", SMITH), abs = {};
  LR.forEach(r => { (abs[r.AB] = abs[r.AB] || []).push(r); });
  const A = Object.values(abs);
  const fps = A.filter(a => a[0].Strike === "Y" || (a.length === 1 && a[0].ABResult !== "HBP")).length;
  const free = A.filter(a => a[0].ABResult === "BB" || a[0].ABResult === "HBP").length;
  const ahead = A.filter(a => String(a[0].AO3plus).charAt(0) === "+").length;
  ok(lv.includes(fps + " of 6 First-pitch strikes"), "live card: first-pitch strikes " + fps + " of 6");
  ok(lv.includes(free + " Free bases"), "live card: free bases " + free);
  ok(lv.includes(ahead + " of 6 Ahead after 3"), "live card: ahead after 3 " + ahead + " of 6");
  ok(/1 Strikeout swinging 5 2 Ground out 3 3 Walk 6 4 Single 2 5 Fly out 4 6 Strikeout looking 4/.test(lv), "live card: each at-bat in order");
  ok(lv.includes("Good tempo all day."), "live card: note");
  const LG = LR.filter(r => r.Result !== "");
  ok(lv.includes("On the spot " + p(spot(LR), LG.length) + "% " + p(spot(R2), g(R2).length) + "%"), "live card: compared with the Jan 19 pen, his latest before it");

  /* -- pitcher game card */
  const gc = cardOf(rt, GAME, SMITH), gt = text(gc);
  const inn = rowsOf("Game_Innings", GAME, "PitcherID", SMITH), sum = k => inn.reduce((a, r) => a + r[k], 0);
  const outs = sum("Outs");
  ok(gt.includes("Varsity vs Ridgeview Tue, Apr 6 Starter"), "game card: level, opponent, date, role");
  ok(gt.includes(Math.floor(outs / 3) + "." + (outs % 3) + " Innings " + sum("Pitches") + " Pitches " + sum("BattersFaced") + " Batters " + sum("Runs") + " / " + sum("Earned") + " Runs / ER"), "game card: outing tiles");
  ok(gt.includes("First-pitch strikes goal 60% " + sum("FirstPitchStrikes") + " of " + sum("FirstPitches")), "game card: first-pitch strikes today");
  ok(gt.includes("Strikes goal 60% " + sum("Strikes") + " of " + sum("Pitches")), "game card: strikes today");
  ok(gt.includes("Strikeouts goal 22% " + sum("K") + " of " + sum("BattersFaced")), "game card: strikeouts today");
  const ip = outs / 3;
  ok(gt.includes("ERA goal 3.50 " + (sum("Earned") * 7 / ip).toFixed(2)), "game card: season ERA");
  ok(gt.includes("Fastball command was there all day."), "game card: note to him");
  ok(!gt.includes("tempo with runners"), "game card: coach-only note never shown");
  ok(!/Hall|Borcherding|Reyes/.test(gt), "game card: no other names");
  ok(gt.includes("Season: 1 game, " + Math.floor(outs / 3) + "." + (outs % 3) + " innings"), "game card: season line");
  const GR = rowsOf("Game_Pitches", GAME, "PitcherID", SMITH), called = GR.filter(r => r.Execution !== "");
  ok(gt.includes(called.filter(r => r.Execution === "SPOT").length + " Right on the spot " +
     called.filter(r => r.Execution !== "MISS").length + " of " + called.length), "game card: execution against the call");

  /* -- hitter game card */
  const hz = text(cardOf(rt, OFF, HAZEN));
  const HR = rowsOf("Offense_Pitches", OFF, "HitterID", HAZEN), pas = {};
  HR.forEach(r => { (pas[r.PA] = pas[r.PA] || []).push(r); });
  const P = Object.values(pas), results = P.map(a => a[a.length - 1].PAResult);
  ok(hz.includes("Troy Hazen"), "hitter card: name");
  ok(hz.includes("Varsity at Ridgeview Tue, Apr 6 Batting 4th"), "hitter card: header");
  ok(hz.includes("Both doubles came on pitches you could drive."), "hitter card: note");
  const W = { "2B": "Double", HBP: "Hit by pitch", "1B": "Single", GO: "Ground out", K: "Strikeout swinging", FO: "Fly out", BB: "Walk" };
  results.forEach((r, i) => ok(hz.includes((i + 1) + " " + W[r]), "hitter card: at-bat " + (i + 1) + " is " + r));
  ok(hz.includes(HR.length / P.length === 0 ? "" : (Math.round(HR.length * 10 / P.length) / 10).toFixed(1) + " Pitches per at-bat"), "hitter card: pitches per at-bat");
  const oz = HR.filter(r => r.InZone === "N").length, ch = HR.filter(r => r.Chase === "Y").length;
  ok(hz.includes((oz ? ch + " of " + oz : "0") + " Chased"), "hitter card: chased");
  const bobo = text(cardOf(rt, OFF, BOBO));
  ok(bobo.includes("Great takes in the first."), "Bobo: note to him");
  ok(!bobo.includes("2-strike approach"), "Bobo: coach-only note never shown");
  ok(!/Hazen|Herbert|Pistorius/.test(bobo), "Bobo: no other hitter's name");

  /* -- the email around the card */
  const m = rt.mail.find(x => /hazen/.test(x.subject));
  ok(m.htmlBody.includes("https://script.google.com/macros/s/CARDS/exec?t=" + tokenOf(rt, HAZEN) + "&amp;r=" + OFF + "&amp;k=hit"), "email: reflection link carries his token and this card");
  ok(m.htmlBody.includes("lt-logo.png"), "email: logo from the site");
  ok(!/<script/i.test(m.htmlBody), "email: no script");
  ok(m.body.includes("Write your reflection"), "email: plain-text part has the link");
  ok(/These are your numbers only/.test(m.htmlBody), "email: footer");
}

/* ========================================================== 4. live mode, quota */
{
  const rt = world({ quota: 3 + 10 });           /* 10 held back for flags */
  ready(rt, "live");
  rt.call("runEvening");
  eq(rt.mail.length, 1, "live, quota 13: Smith's first pen (costs 2 with his parent) and the next would go under the reserve");
  eq(rt.mail[0].to, "smith@example.com", "live: to the player");
  eq(rt.mail[0].cc, "smith.parent@example.com", "live: parent copied");
  ok(!/\[TEST/.test(rt.mail[0].subject), "live: no TEST tag");
  eq(tab(rt, "Cards").filter(c => /done$/.test(c.Key)).length, 1, "only the finished record is marked done");
  rt.setQuota(100);
  rt.call("runEvening");
  eq(rt.mail.length, 3, "next run picks up the 2 that waited");
  const keys = tab(rt, "Cards").map(c => c.Key);
  eq(new Set(keys).size, keys.length, "nothing sent twice");
  eq(tab(rt, "Cards").filter(c => /done$/.test(c.Key)).length, 3, "all 3 pens done");
}

/* ========================================================== 5. practice rows never card */
{
  const rt = world();
  ready(rt, "test");
  const R = rt.b.getSheetByName("Records"), B = rt.b.getSheetByName("Bullpen_Pitches");
  R.data.push(["prac1", "bullpen", "v44", 1, "Mound 1", "", "2027-02-02", "Coach V", "", "", "2027-02-02T20:00:00Z", "2027-02-02T20:00:01Z", 1]);
  const row = B.data[1].slice(); row[0] = "prac1"; row[1] = "prac1"; row[B.header().indexOf("Practice")] = "Y";
  B.data.push(row);
  rt.call("runEvening");
  ok(!tab(rt, "Cards").some(c => c.RecordID === "prac1" && c.PlayerID), "a practice row gets no card");
}

/* ========================================================== 6. reminders */
{
  const rt = world();
  ready(rt, "test");
  rt.call("runEvening");                          /* 3 pens */
  rt.clock.add(12); rt.call("runMorning");        /* game cards, 12 h later */
  const before = rt.mail.length;
  rt.clock.add(12); rt.call("runEvening");        /* pens now 24 h old, game cards 12 h old */
  eq(rt.mail.length - before, 0, "no reminder for an old card once a newer one went out, none for a 12 h card");
  rt.clock.add(12); rt.call("runMorning");        /* game cards 24 h old */
  const rem = rt.mail.slice(before);
  eq(rem.length, 3, "1 reminder each for Smith, Hazen and Bobo's latest card");
  ok(rem.every(m => /Reminder: your reflection for/.test(m.subject) && m.to === "jim.test@example.com"), "reminders, test mode, to TEST_TO");
  ok(rem.some(m => /vs Ridgeview, Apr 6/.test(m.subject)), "Smith's reminder is for his game, his latest card");
  rt.clock.add(12); rt.call("runEvening"); rt.clock.add(12); rt.call("runMorning");
  eq(rt.mail.length - before, 3, "only ever 1 reminder per card");
}

/* ========================================================== 7. the page and reflections */
{
  const rt = world();
  ready(rt, "test");
  rt.call("runEvening"); rt.call("runMorning");
  const get = q => text(rt.call("doGet", { parameter: q }).getContent());
  const raw = q => rt.call("doGet", { parameter: q }).getContent();
  const st = tokenOf(rt, SMITH), ht = tokenOf(rt, HAZEN);

  ok(/This link isn't active/.test(get({})), "page: no token");
  ok(/This link isn't active/.test(get({ t: "abc" })), "page: short token");
  ok(/This link isn't active/.test(get({ t: "f".repeat(40) })), "page: unknown token");
  ok(/This link isn't active/.test(get({ t: st.slice(0, 39) + (st.slice(-1) === "a" ? "b" : "a") })), "page: token off by one character");

  const home = get({ t: st });
  ok(home.includes("Colten Smith") && home.includes("Pitching vs Ridgeview, Apr 6") && (home.match(/Write your reflection/g) || []).length === 4, "page: Smith sees his 4 cards");
  ok(!/Hazen|Bobo|Hall/.test(home), "page: nobody else's cards");
  ok(/Your pens: on the spot/.test(home), "page: pen trend once he has 2 pens");
  ok(raw({ t: st }).includes('<base target="_top">'), "page: links leave the Apps Script frame");
  ok(get({ t: ht, r: GAME, k: "pitch" }).includes("Card not found"), "page: Hazen can't open Smith's game card");
  ok(get({ t: st, r: OFF, k: "hit" }).includes("Card not found"), "page: Smith can't open a hitter card he doesn't have");

  const view = raw({ t: st, r: PEN2, k: "pen" });
  ok(/How&rsquo;s your arm\?/.test(view) && /START/.test(view), "card page: the form, arm question for a pitcher");
  ok(!/Last time you said/.test(view), "card page: no last-START question before any reflection");
  ok(/How&rsquo;s your body\?/.test(raw({ t: ht, r: OFF, k: "hit" })), "card page: body question for a hitter");

  const save = o => rt.call("saveReflection", o);
  const good = { t: st, r: PEN1, k: "pen", arm: 4, feel: 4, start: "Finish the change-up out front", stop: "Rushing from the stretch", cont: "Attacking with the fastball", bother: "" };
  eq(save(Object.assign({}, good, { t: "0".repeat(40) })).ok, false, "save: bad token refused");
  eq(save(Object.assign({}, good, { t: ht })).ok, false, "save: another player's token refused for this card");
  eq(save(Object.assign({}, good, { arm: 0 })).ok, false, "save: rating 0 refused");
  eq(save(Object.assign({}, good, { feel: 6 })).ok, false, "save: rating 6 refused");
  eq(save(Object.assign({}, good, { arm: 3.5 })).ok, false, "save: rating 3.5 refused");
  eq(save(Object.assign({}, good, { stop: "  " })).ok, false, "save: blank STOP refused");
  eq(save(Object.assign({}, good, { r: "nope" })).ok, false, "save: unknown card refused");
  eq(tab(rt, "Reflections").length, 0, "nothing saved by the refusals");
  const mailBefore = rt.mail.length;
  eq(save(good).ok, true, "save: good reflection saved");
  eq(rt.mail.length, mailBefore, "save: arm 4, feel 4, no flag words, no email");
  let R = tab(rt, "Reflections");
  eq(R.length, 1, "one Reflections row");
  eq(R[0].Start, "Finish the change-up out front", "START stored");
  eq(R[0]["Arm/Body"], 4, "arm stored as a number");
  ok(tab(rt, "Cards").find(c => c.Key === PEN1 + "|" + SMITH + "|pen").ReflectionAt, "Cards row stamped ReflectionAt");
  eq(save(good).already, true, "save twice: kept the first");
  eq(tab(rt, "Reflections").length, 1, "still one row");
  ok(/Your coaches have it/.test(get({ t: st, r: PEN1, k: "pen" })), "card page: shows his saved reflection");

  /* the loop: last time's START on the next card */
  const v2 = get({ t: st, r: PEN2, k: "pen" });
  ok(v2.includes("Last time you said you'd start: Finish the change-up out front . Did you?"), "next card asks about last time's START");
  /* formulas and long text */
  eq(save({ t: st, r: PEN2, k: "pen", did: "Partly", arm: 3, feel: 3, start: "=IMPORTXML(\"http://x\")", stop: "+1", cont: "x".repeat(400), bother: "" }).ok, true, "save: odd text accepted");
  R = tab(rt, "Reflections");
  eq(R[1].Start, "=IMPORTXML(\"http://x\")", "a formula-looking START is kept as text");
  eq(rt.b.flags.formula, 0, "no cell became a formula");
  eq(R[1].Continue.length, 300, "answers capped at 300 characters");
  eq(R[1].DidLastStart, "Partly", "Did you? answer stored");
  eq(R[1].LastStart, "Finish the change-up out front", "and what he had said");

  /* flags: pitcher, arm 2 -> pitching coaches; his pen has no level -> every pitching coach */
  rt.mail.length = 0;
  const f1 = save({ t: st, r: LIVE, k: "pen", arm: 2, feel: 4, start: "a", stop: "b", cont: "c", bother: "" });
  eq(f1.flag, true, "arm 2 flags");
  eq(rt.mail.length, 1, "one heads-up email");
  ok(/^\[TEST for a@example\.com, c@example\.com, d@example\.com\] Heads-up: Colten Smith, physical flag/.test(rt.mail[0].subject), "pen flag: every pitching coach (no level on a pen), test redirect");
  ok(rt.mail[0].htmlBody.includes("2 of 5"), "heads-up shows the rating");
  /* pitcher game: Varsity -> Varsity pitching coach + Both */
  rt.mail.length = 0;
  save({ t: st, r: GAME, k: "pitch", arm: 5, feel: 1, start: "a", stop: "b", cont: "c", bother: "" });
  ok(/^\[TEST for a@example\.com, d@example\.com\] Heads-up: Colten Smith, mental flag/.test(rt.mail[0].subject), "game flag: Varsity pitching coaches only");
  /* hitter: flag word in the bothering box -> hitting coaches for his level */
  rt.mail.length = 0;
  const bt = tokenOf(rt, BOBO);
  save({ t: bt, r: OFF, k: "hit", arm: 4, feel: 4, start: "a", stop: "b", cont: "c", bother: "Really stressed about school" });
  ok(/^\[TEST for b@example\.com, d@example\.com\] Heads-up: Ethan Bobo, mental flag/.test(rt.mail[0].subject), "hitter flag word: hitting coaches");
  eq(tab(rt, "Reflections").find(r => r.PlayerID === BOBO).Flag, "Mental", "Flag column says Mental");
  /* baseball talk in START/STOP/CONTINUE is not a flag; pain is */
  rt.mail.length = 0;
  const ft = rt.sandbox.flags_;
  eq(ft(4, 4, { start: "keep my front shoulder in", stop: "tight spin on the slider", cont: "pop up less", bother: "" }).length, 0, "front shoulder, tight spin: no flag");
  eq(ft(4, 4, { start: "pitch through the pain", stop: "", cont: "", bother: "" }).join(), "Physical", "pain in START: physical");
  eq(ft(4, 4, { start: "", stop: "", cont: "", bother: "my elbow is sore" }).join(), "Physical", "sore elbow in bothering: physical");
  eq(ft(4, 4, { start: "", stop: "", cont: "", bother: "i want to quit" }).join(), "Mental", "quit: mental");
  eq(ft(3, 3, { start: "", stop: "", cont: "", bother: "" }).length, 0, "3 and 3: no flag");
  /* off: a flag is still saved, but no email goes anywhere */
  rt.props.SEND_MODE = "off"; rt.mail.length = 0;
  save({ t: ht, r: OFF, k: "hit", arm: 4, feel: 2, start: "a", stop: "b", cont: "c", bother: "" });
  eq(rt.mail.length, 0, "SEND_MODE off: the heads-up is not emailed");
  ok(/^\(SEND_MODE off\)/.test(tab(rt, "Reflections").find(r => r.PlayerID === HAZEN).FlaggedTo), "and FlaggedTo says so");
  rt.b.getSheetByName("Reflections").data = rt.b.getSheetByName("Reflections").data.filter(r => r[1] !== HAZEN);
  rt.props.SEND_MODE = "test";
  /* no coach set up for a role -> the admin */
  const co = rt.b.getSheetByName("Coaches"); co.data = co.data.slice(0, 1);
  rt.mail.length = 0;
  save({ t: ht, r: OFF, k: "hit", arm: 1, feel: 4, start: "a", stop: "b", cont: "c", bother: "" });
  ok(/^\[TEST for admin@example\.com\] Heads-up: Troy Hazen/.test(rt.mail[0].subject), "nobody set to Notify: ADMIN_EMAIL hears it");
  /* reminders stop once he reflects */
  const m0 = rt.mail.length;
  rt.clock.add(30); rt.call("runEvening");
  const rem = rt.mail.slice(m0).filter(m => /Reminder/.test(m.subject));
  ok(!rem.some(m => /Smith|smith@/.test(m.subject)), "no reminder for a card he already reflected on");
}

/* ========================================================== 8. the coaches' Reflections page */
{
  const rt = world();
  ready(rt, "test");
  rt.clock.set(Date.now());
  rt.call("runEvening"); rt.call("runMorning");
  const st = tokenOf(rt, SMITH), bt = tokenOf(rt, BOBO);
  rt.call("saveReflection", { t: st, r: PEN1, k: "pen", arm: 4, feel: 4, start: "<script>alert(1)</script>", stop: "b", cont: "c", bother: "" });
  rt.call("saveReflection", { t: st, r: GAME, k: "pitch", arm: 2, feel: 4, start: "a", stop: "b", cont: "c", bother: "" });
  rt.call("saveReflection", { t: bt, r: OFF, k: "hit", arm: 5, feel: 5, start: "Hunt the fastball", stop: "b", cont: "c", bother: "" });
  const cp = makeRuntime(process.env.CARDS_REFL || path.join(ROOT, "cards", "Reflections.gs"));
  const cb = cp.newBook("S");
  rt.b.order.forEach(n => { cb.insertSheet(n).data = JSON.parse(JSON.stringify(rt.b.getSheetByName(n).data)); });
  cp.props.SEASON_SHEET_ID = "S";
  const view = (who, q) => { cp.session.active = who; return cp.sandbox.doGet({ parameter: q || {} }).getContent(); };
  ok(/No access/.test(view("")), "coaches page: no account, no access");
  ok(/not on the Coaches tab/.test(view("smith@example.com")), "coaches page: a player's account is refused");
  const all = view("A@example.com");
  ok(/Reflections/.test(all) && (all.match(/class="r/g) || []).length === 3, "coaches page: a coach on the tab sees all 3 (email case ignored)");
  ok(!all.includes("<script>alert(1)</script>") && all.includes("&lt;script&gt;"), "coaches page: a player's text is escaped");
  ok(all.indexOf("Hunt the fastball") < all.indexOf("&lt;script&gt;"), "coaches page: newest first");
  eq((view("a@example.com", { flag: "1" }).match(/class="r/g) || []).length, 1, "coaches page: flagged only");
  eq((view("a@example.com", { player: "Ethan Bobo" }).match(/class="r/g) || []).length, 1, "coaches page: one player");
  eq((view("a@example.com", { level: "Varsity" }).match(/class="r/g) || []).length, 2, "coaches page: Varsity only (the pen has no level)");
  ok(/Still waiting/.test(all) && /Live at-bats, Jan 26/.test(all) && /Troy Hazen/.test(all), "coaches page: cards still waiting on a reflection");
  const book = cp.book("S");
  ok(!book.order.some(n => /Player_Links/.test(n)) || !all.includes(st), "coaches page never prints a player's private link");
}

console.log(pass + " card checks" + (fail ? ", " + fail + " FAILED" : ""));
if (fail) process.exit(1);
console.log("ALL CARD CHECKS PASS");
