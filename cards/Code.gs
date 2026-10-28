/* Titans Player Cards
   ===================
   A standalone Google Apps Script owned by the program account
   (legendbaseballapps@gmail.com). It reads the season Sheet the upload receiver
   fills, and:
     - emails each player his card after a pen (evening) or a game (next morning),
     - sends 1 reminder if he hasn't written his reflection a day later,
     - serves his own page (a private link) with every card and the reflection form,
     - saves each reflection to the Reflections tab, and emails the right coaches
       right away when a reflection is urgent (a 1 or 2 rating, or a flag word).

   Setup, once (full steps in claude/player-cards-setup.md):
     1. script.google.com > New project "Titans Player Cards" > paste this file over Code.gs
     2. Project Settings: time zone America/Denver. Script properties:
          SEASON_SHEET_ID  the same ID the receiver uses
          SEND_MODE        off, test or live (start with test)
          TEST_TO          where every email goes while SEND_MODE is test
          ADMIN_EMAIL      who hears about flags no coach is set up for
     3. Run setup() and approve the prompts. It adds the Players, Player_Links,
        Cards and Reflections tabs and a Notify column on Coaches.
     4. Run addRosterPlayers() to list every rostered player, then fill in emails.
     5. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
        Put the /exec URL in the PAGE_URL script property.
     6. Run installTriggers(): 7 pm (pens) and 7 am (games, and any late pens).

   Safety:
   - SEND_MODE off sends nothing. test sends every email to TEST_TO only, with the
     real address in the subject. live is the only mode that reaches a player.
   - Nothing filed before CARDS_FROM (set by setup) ever gets a card.
   - Practice sessions never reach the Sheet; any row marked Practice Y is skipped too.
   - A player's page shows his own cards only. Coach-only notes are never read here.
   - The web page can call exactly one function, saveReflection. Every other
     function either ends in _ (private) or refuses to run unless it was started
     from the editor or one of this project's own triggers. */

var VERSION = "cards 1 (Oct 2026)";

var PLAYERS_HEAD = ["PlayerID", "Last", "First", "Class", "Level", "Player email", "Parent email", "Send"];
var LINKS_HEAD = ["PlayerID", "Token", "Made"];
var CARDS_HEAD = ["Key", "RecordID", "PlayerID", "Kind", "Date", "Event", "Status", "SentTo", "SentAt",
                  "ReminderAt", "ReflectionAt"];
var REFL_HEAD = ["When", "PlayerID", "Player", "Level", "Kind", "RecordID", "Date", "Event", "Arm/Body", "Feel",
                 "DidLastStart", "LastStart", "Start", "Stop", "Continue", "Bothering", "Flag", "FlaggedTo"];

var DEFAULT_LOGO = "https://legendbaseballapps.github.io/titans-apps/cards/lt-logo.png";
var DEFAULT_ROSTER = "https://legendbaseballapps.github.io/titans-apps/bullpen/roster.js";
var REMIND_HOURS = 20;       /* runs are 12 h apart, so this is the run a day later */
var MAIL_RESERVE = 10;       /* keep this many sends a day for urgent flags */
var TEXT_MAX = 300;          /* characters per reflection answer */

/* Program goals for one outing. Config can override any of them with a row whose
   Setting matches the name here (for example "Strikes goal" / 62). */
var GOALS = [
  {k: "fps",    name: "First-pitch strikes", setting: "First-pitch strikes goal", v: 60, more: true},
  {k: "strike", name: "Strikes",             setting: "Strikes goal",             v: 60, more: true},
  {k: "free",   name: "Free bases (BB+HBP)", setting: "Free bases goal",          v: 13, more: false},
  {k: "k",      name: "Strikeouts",          setting: "Strikeouts goal",          v: 22, more: true},
  {k: "hard",   name: "Hard contact",        setting: "Hard contact goal",        v: 20, more: false}
];
var SEASON_GOALS = [
  {k: "era",  name: "ERA",  setting: "ERA goal",  v: 3.5},
  {k: "whip", name: "WHIP", setting: "WHIP goal", v: 1.5}
];

/* Same names and orders the 3 apps use. */
var TYPE_LONG = {FB: "Fastball", CT: "Cutter", SL: "Slider", CB: "Curveball", CH: "Change-up", SP: "Splitter"};
var TYPE_ORDER = ["FB", "CT", "SL", "CB", "CH", "SP"];
var SPOTS = {0: [2, 2], 1: [0, 2], 2: [1, 1], 3: [3, 1], 4: [3, 3], 5: [4, 4]};   /* row, col, 0-based */
var RES_WORDS = {K: "Strikeout swinging", Kc: "Strikeout looking", BB: "Walk", IBB: "Intentional walk",
  HBP: "Hit by pitch", "1B": "Single", "2B": "Double", "3B": "Triple", HR: "Home run", GO: "Ground out",
  FO: "Fly out", LO: "Line out", PO: "Pop out", FC: "Fielder's choice", E: "Reached on error",
  SAC: "Sacrifice bunt", SF: "Sacrifice fly", DP: "Double play"};
var TRAJ_WORDS = {GB: "ground ball", LD: "line drive", FB: "fly ball", PU: "pop up"};
var HITS = {"1B": 1, "2B": 1, "3B": 1, HR: 1};
var INPLAY = {GO: 1, FO: 1, LO: 1, PO: 1, FC: 1, DP: 1, SAC: 1, SF: 1, "1B": 1, "2B": 1, "3B": 1, HR: 1, E: 1};
var OUTS = {K: 1, Kc: 1, GO: 1, FO: 1, LO: 1, PO: 1, FC: 1, DP: 1, SAC: 1, SF: 1};
var QAB_SHORT = {H: "hit", LD: "line drive", BB: "walk", HBP: "hit by pitch", SAC: "sacrifice",
  RUN: "run scored", P7: "7+ pitches", ADV: "moved a runner", K2: "2-strike contact"};
var QAB_ORDER = ["H", "LD", "BB", "HBP", "SAC", "RUN", "P7", "ADV", "K2"];

/* Flag words. Anything in "Anything bothering you?" is checked against both lists.
   START / STOP / CONTINUE are only checked against the strong ones, because
   "front shoulder" and "tight spin" are ordinary baseball talk there. */
var FLAG_PHYSICAL = ["hurt", "pain", "sore", "tight", "injur", "elbow", "shoulder", "numb", "tingl", "strain",
  "sprain", "dizzy", "headache", "concuss", "swollen", "swelling", "ache", "aching"];
var FLAG_MENTAL = ["stress", "anxious", "anxiety", "depress", "panic", "overwhelm", "can't sleep", "cant sleep",
  "quit", "hopeless", "give up", "bullied", "scared", "alone", "harm myself", "hurt myself", "kill myself", "suicid"];
var FLAG_STRONG_PHYSICAL = ["pain", "injur", "numb", "tingl", "concuss"];
var FLAG_STRONG_MENTAL = ["harm myself", "hurt myself", "kill myself", "suicid"];

/* =========================================================== admin entry points */
function setup() {
  guard_();
  var ss = book_();
  sheet_(ss, "Players", PLAYERS_HEAD);
  sheet_(ss, "Player_Links", LINKS_HEAD);
  sheet_(ss, "Cards", CARDS_HEAD);
  sheet_(ss, "Reflections", REFL_HEAD);
  var co = ss.getSheetByName("Coaches");
  if (co) {
    var h = header_(co);
    if (h.indexOf("Notify") < 0) co.getRange(1, h.length + 1, 1, 1).setValues([["Notify"]]);
  }
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty("CARDS_FROM")) p.setProperty("CARDS_FROM", new Date(now_()).toISOString());
  if (!p.getProperty("SEND_MODE")) p.setProperty("SEND_MODE", "off");
  Logger.log(VERSION + ": tabs ready. Cards start with records received after " + p.getProperty("CARDS_FROM") +
             ". SEND_MODE is " + p.getProperty("SEND_MODE") + ".");
}

/* Adds a Players row for every rostered player not already listed. Emails stay blank. */
function addRosterPlayers() {
  guard_();
  var url = PropertiesService.getScriptProperties().getProperty("ROSTER_URL") || DEFAULT_ROSTER;
  var txt = UrlFetchApp.fetch(url).getContentText();
  var re = /\{id:"([^"]+)",\s*last:"([^"]*)"\s*,\s*first:"([^"]*)"\s*,\s*cls:"([^"]*)"/g, m, add = [];
  var ss = book_(), t = table_(ss, "Players"), have = {};
  t.rows.forEach(function (r) { have[s_(r.PlayerID)] = 1; });
  while ((m = re.exec(txt))) {
    if (have[m[1]]) continue;
    have[m[1]] = 1;
    add.push({PlayerID: m[1], Last: m[2], First: m[3], Class: m[4], Send: "Yes"});
  }
  append_(t.sheet, add);
  Logger.log("Added " + add.length + " players. Fill in Player email (and Parent email if parents get a copy).");
  return add.length;
}

/* Time triggers in the project's time zone. Safe to run again: it replaces its own. */
function installTriggers() {
  guard_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === "runEvening" || f === "runMorning") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("runEvening").timeBased().everyDays(1).atHour(19).create();
  ScriptApp.newTrigger("runMorning").timeBased().everyDays(1).atHour(7).create();
  Logger.log("Triggers set: runEvening about 7 pm, runMorning about 7 am.");
}

/* 7 pm: today's pens. 7 am: yesterday's games, and any pen filed after 7 pm. */
function runEvening(e) { guard_(e); return run_(["bullpen"]); }
function runMorning(e) { guard_(e); return run_(["bullpen", "game", "offense"]); }

/* Builds one card and returns its HTML without sending it. View it from the log,
   or use sendTestCard to see it in a real inbox. */
function previewCard(recordId, playerId) {
  guard_();
  var c = build_(load_(book_()), s_(recordId), s_(playerId));
  if (!c) throw new Error("No card for " + playerId + " in " + recordId);
  return emailDoc_(c, "#", "#");
}
/* Sends one card to TEST_TO (never to the player), whatever SEND_MODE is. */
function sendTestCard(recordId, playerId) {
  guard_();
  var cfg = cfg_(), d = load_(book_());
  var c = build_(d, s_(recordId), s_(playerId));
  if (!c) throw new Error("No card for " + playerId + " in " + recordId);
  if (!cfg.testTo) throw new Error("Set the TEST_TO script property first.");
  var link = cfg.pageUrl ? cfg.pageUrl + "?t=preview" : "#";
  MailApp.sendEmail({to: cfg.testTo, subject: "[TEST] " + c.subject, htmlBody: emailDoc_(c, link, link),
                     body: c.subject, name: "Legend Titans Baseball"});
  return cfg.testTo;
}
/* A new private link for one player (the old one stops working). */
function newLink(playerId) {
  guard_();
  var ss = book_();
  return token_(ss, s_(playerId), true);
}

/* =========================================================== the run */
function run_(apps) {
  var cfg = cfg_(), out = {sent: 0, test: 0, skipped: 0, reminders: 0, waiting: 0, mode: cfg.mode};
  if (cfg.mode === "off") { Logger.log("SEND_MODE is off: nothing sent."); return out; }
  if (cfg.mode === "test" && !cfg.testTo) { Logger.log("SEND_MODE is test but TEST_TO is empty: nothing sent."); return out; }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log("Another run is still going."); return out; }
  try {
    var ss = book_(), d = load_(ss);
    var log = table_(ss, "Cards"), done = {};
    log.rows.forEach(function (r) { done[s_(r.Key)] = r; });
    var from = cfg.cardsFrom ? Date.parse(cfg.cardsFrom) : 0;
    var budget = quota_() - MAIL_RESERVE;
    var recs = d.records.filter(function (r) {
      return apps.indexOf(s_(r.App)) >= 0 && !done[s_(r.RecordID) + "|*|done"] &&
             (!from || Date.parse(s_(r.ReceivedAt)) >= from);
    });
    recs.sort(function (a, b) { return s_(a.ReceivedAt) < s_(b.ReceivedAt) ? -1 : 1; });
    for (var i = 0; i < recs.length; i++) {
      var rec = recs[i], rid = s_(rec.RecordID), ids = playersIn_(d, rec), finished = true;
      for (var j = 0; j < ids.length; j++) {
        var c = build_(d, rid, ids[j]);
        if (!c || done[c.key]) continue;
        var who = d.players[ids[j]] || null;
        var row = {Key: c.key, RecordID: rid, PlayerID: ids[j], Kind: c.kind, Date: c.date, Event: c.event};
        var to = who ? s_(who["Player email"]).trim() : "", cc = who ? s_(who["Parent email"]).trim() : "";
        if (!who) row.Status = "not on Players";
        else if (/^no/i.test(s_(who.Send))) row.Status = "Send is No";
        else if (!to) row.Status = "no email";
        if (row.Status) { out.skipped++; append_(log.sheet, [row]); done[c.key] = row; continue; }
        var cost = cfg.mode === "live" ? (cc ? 2 : 1) : 1;
        if (budget < cost) { finished = false; out.waiting++; continue; }
        var tok = token_(ss, ids[j], false);
        var page = cfg.pageUrl ? cfg.pageUrl + "?t=" + tok : "";
        var html = emailDoc_(c, page ? page + "&r=" + encodeURIComponent(rid) + "&k=" + c.kind : "", page);
        mail_(cfg, {to: to, cc: cc, subject: c.subject, htmlBody: html,
                    body: plain_(c, page ? page + "&r=" + encodeURIComponent(rid) + "&k=" + c.kind : "")});
        budget -= cost;
        row.Status = cfg.mode === "live" ? "sent" : "test";
        row.SentTo = to + (cc ? ", " + cc : "");
        row.SentAt = new Date(now_()).toISOString();
        append_(log.sheet, [row]); done[c.key] = row;
        out[row.Status]++;
      }
      if (finished) append_(log.sheet, [{Key: rid + "|*|done", RecordID: rid, Status: "done",
                                         SentAt: new Date(now_()).toISOString()}]);
    }
    out.reminders = remind_(ss, d, cfg, Math.max(0, budget));
  } finally { lock.releaseLock(); }
  Logger.log(JSON.stringify(out));
  return out;
}

/* One nudge per card, a day after it went out, if he hasn't reflected and hasn't
   had a newer card since. */
function remind_(ss, d, cfg, budget) {
  var log = table_(ss, "Cards"), refl = reflectedKeys_(ss), latest = {}, n = 0;
  log.rows.forEach(function (r) {
    if (!/^(sent|test)$/.test(s_(r.Status))) return;
    var p = s_(r.PlayerID);
    if (!latest[p] || s_(r.SentAt) > s_(latest[p].SentAt)) latest[p] = r;
  });
  var nowMs = now_();
  for (var i = 0; i < log.rows.length; i++) {
    var r = log.rows[i], st = s_(r.Status);
    if (!/^(sent|test)$/.test(st) || s_(r.ReminderAt) || s_(r.ReflectionAt) || refl[s_(r.Key)]) continue;
    if (latest[s_(r.PlayerID)] !== r) continue;
    if (nowMs - Date.parse(s_(r.SentAt)) < REMIND_HOURS * 3600000) continue;
    if (st === "test" && cfg.mode === "live") continue;      /* never remind a real kid about a test card */
    if (budget < 1) break;
    var who = d.players[s_(r.PlayerID)];
    if (!who || /^no/i.test(s_(who.Send)) || !s_(who["Player email"]).trim()) continue;
    var tok = token_(ss, s_(r.PlayerID), false);
    var link = cfg.pageUrl ? cfg.pageUrl + "?t=" + tok + "&r=" + encodeURIComponent(s_(r.RecordID)) + "&k=" + s_(r.Kind) : "";
    var subj = "Reminder: your reflection for " + s_(r.Event);
    mail_(cfg, {to: s_(who["Player email"]).trim(), subject: subj, htmlBody: reminderDoc_(cfg, who, r, link),
                body: "Your coaches haven't seen your reflection for " + s_(r.Event) + " yet. " + link});
    setCells_(log.sheet, r._row, {ReminderAt: new Date(nowMs).toISOString()});
    budget--; n++;
  }
  return n;
}

/* =========================================================== reading the Sheet */
function load_(ss) {
  var d = {
    records: table_(ss, "Records").rows,
    pen: table_(ss, "Bullpen_Pitches").rows, penNotes: table_(ss, "Bullpen_Notes").rows,
    game: table_(ss, "Game_Pitches").rows, inn: table_(ss, "Game_Innings").rows, gameNotes: table_(ss, "Game_Notes").rows,
    off: table_(ss, "Offense_Pitches").rows, offNotes: table_(ss, "Offense_Notes").rows,
    players: {}, goals: goals_(ss)
  };
  table_(ss, "Players").rows.forEach(function (r) { if (s_(r.PlayerID)) d.players[s_(r.PlayerID)] = r; });
  ["pen", "game", "inn", "off"].forEach(function (k) {
    d[k] = d[k].filter(function (r) { return s_(r.Practice).toUpperCase() !== "Y"; });
  });
  d.byRec = {};
  d.records.forEach(function (r) { d.byRec[s_(r.RecordID)] = r; });
  return d;
}
function goals_(ss) {
  var cfg = {}, t = table_(ss, "Config");
  t.rows.forEach(function (r) { cfg[s_(r.Setting).trim().toLowerCase()] = r.Value; });
  function v(g) { var x = Number(cfg[g.setting.toLowerCase()]); return isFinite(x) && x > 0 ? x : g.v; }
  var o = {};
  GOALS.concat(SEASON_GOALS).forEach(function (g) { o[g.k] = v(g); });
  return o;
}
/* Who gets a card from one record, in the order they appear. */
function playersIn_(d, rec) {
  var rid = s_(rec.RecordID), app = s_(rec.App), seen = {}, out = [];
  function add(id) { id = s_(id); if (id && !seen[id]) { seen[id] = 1; out.push(id); } }
  if (app === "bullpen") d.pen.forEach(function (r) { if (s_(r.RecordID) === rid) add(r.PitcherID); });
  if (app === "game") d.game.forEach(function (r) { if (s_(r.RecordID) === rid) add(r.PitcherID); });
  if (app === "offense") d.off.forEach(function (r) { if (s_(r.RecordID) === rid) add(r.HitterID); });
  return out;
}

/* =========================================================== card math */
function build_(d, rid, pid) {
  var rec = d.byRec[rid];
  if (!rec) return null;
  var app = s_(rec.App);
  if (app === "bullpen") return penCard_(d, rec, pid);
  if (app === "game") return pitchCard_(d, rec, pid);
  if (app === "offense") return hitCard_(d, rec, pid);
  return null;
}
function rowsOf_(list, rid, key, pid) {
  return list.filter(function (r) { return s_(r.RecordID) === rid && s_(r[key]) === pid; });
}
function noteOf_(list, rid, key, pid, field) {
  for (var i = 0; i < list.length; i++)
    if (s_(list[i].RecordID) === rid && s_(list[i][key]) === pid) return s_(list[i][field]).trim();
  return "";
}

/* ---- pen */
function penStats_(rows) {
  var o = {n: 0, graded: 0, spot: 0, close: 0, strike: 0, miss: 0, up: 0, down: 0, inn: 0, out: 0, by: {},
           grid: blankGrid_(0), spots: {}, live: false, abs: []};
  rows.forEach(function (r) {
    var t = s_(r.CalledType) || "FB", res = s_(r.Result);
    o.n++;
    if (s_(r.Mode) === "Live") o.live = true;
    if (!o.by[t]) o.by[t] = {n: 0, graded: 0, spot: 0, close: 0, strike: 0, vn: 0, vsum: 0, vtop: 0};
    var b = o.by[t]; b.n++;
    if (s_(r.Strike) === "Y") { o.strike++; b.strike++; }
    if (res) {
      o.graded++; b.graded++;
      if (res === "Spot") { o.spot++; b.spot++; }
      if (res === "Close") { o.close++; b.close++; }
      if (res !== "Spot") {
        o.miss++;
        if (s_(r.MissVert) === "up") o.up++; else if (s_(r.MissVert) === "down") o.down++;
        if (s_(r.MissHoriz) === "in") o.inn++; else if (s_(r.MissHoriz) === "out") o.out++;
      }
    }
    var v = Number(r.Velo);
    if (r.Velo !== "" && isFinite(v) && v > 0) { b.vn++; b.vsum += v; if (v > b.vtop) b.vtop = v; }
    var gr = Number(r.ActualRow) - 1, gc = Number(r.ActualCol) - 1;
    if (gr >= 0 && gr < 5 && gc >= 0 && gc < 5) o.grid[gr][gc]++;
    if (s_(r.CalledSpot) !== "" && SPOTS[s_(r.CalledSpot)]) o.spots[s_(r.CalledSpot)] = 1;
    var ab = Number(r.AB);
    if (r.AB !== "" && ab > 0) {
      if (!o.abs[ab - 1]) o.abs[ab - 1] = {rows: [], result: "", ao3: ""};
      var a = o.abs[ab - 1];
      a.rows.push(r);
      if (s_(r.ABResult)) a.result = s_(r.ABResult);
      if (s_(r.AO3plus)) a.ao3 = s_(r.AO3plus);
    }
  });
  o.abs = o.abs.filter(function (a) { return a && a.result; });
  return o;
}
function penCard_(d, rec, pid) {
  var rid = s_(rec.RecordID), rows = rowsOf_(d.pen, rid, "PitcherID", pid);
  if (!rows.length) return null;
  var st = penStats_(rows), who = person_(d, pid, rows[0], "PitcherLast", "PitcherFirst");
  var date = dstr_(rec.Date), tpl = s_(rec.Template);
  /* Last pen: his most recent earlier bullpen record. */
  var prev = null;
  d.records.forEach(function (r) {
    if (s_(r.App) !== "bullpen" || s_(r.RecordID) === rid) return;
    if (!before_(r, rec)) return;
    if (!d.pen.some(function (x) { return s_(x.RecordID) === s_(r.RecordID) && s_(x.PitcherID) === pid; })) return;
    if (!prev || before_(prev, r)) prev = r;
  });
  var ps = prev ? penStats_(rowsOf_(d.pen, s_(prev.RecordID), "PitcherID", pid)) : null;
  var event = (st.live ? "Live at-bats" : "Bullpen") + ", " + shortDate_(date);
  var sub = (st.live ? "Live at-bats" : "Winter bullpen") + " &middot; " + e_(longDate_(date)) +
            (tpl && !st.live ? " &middot; " + e_(tpl) : "") + " &middot; " + st.n + " pitches";
  var body = "";
  var note = noteOf_(d.penNotes, rid, "PitcherID", pid, "ToPitcher");
  if (note) body += note_(note);
  if (st.live) {
    var fps = 0, free = 0, ahead = 0;
    st.abs.forEach(function (a) {
      var f = a.rows[0];
      if (s_(f.Strike) === "Y" || (a.rows.length === 1 && a.result !== "HBP")) fps++;
      if (a.result === "BB" || a.result === "HBP") free++;
      if (a.ao3.charAt(0) === "+") ahead++;
    });
    body += section_("Your at-bats", tiles_([[st.abs.length, "Hitters"], [fps + " of " + st.abs.length, "First-pitch strikes"],
                                            [free, "Free bases"], [ahead + " of " + st.abs.length, "Ahead after 3"]]) +
      table_html_(["", "How it ended", "Pitches"], st.abs.map(function (a, i) {
        return [String(i + 1), "<b>" + e_(RES_WORDS[a.result] || a.result) + "</b>", String(a.rows.length)];
      }), ["center", "left", "center"]) +
      read_("Ahead after 3: he was out within 3 pitches, or you had more strikes than balls after 3."));
  }
  if (st.graded) {
    var spotTiles = [[st.spot, "On the spot"], [st.spot + st.close, "Spot or next to it"], [st.strike, "Strikes"]];
    var cmp = "";
    if (ps && ps.n) {
      cmp = table_html_(["", "Today", "Last pen", "Change"], [
        cmpRow_("On the spot", pct_(st.spot, st.graded), ps.graded ? pct_(ps.spot, ps.graded) : null),
        cmpRow_("Spot or next to it", pct_(st.spot + st.close, st.graded), ps.graded ? pct_(ps.spot + ps.close, ps.graded) : null),
        cmpRow_("Strikes", pct_(st.strike, st.n), pct_(ps.strike, ps.n))], ["left", "center", "center", "center"]);
    } else {
      cmp = table_html_(["", "Today"], [["On the spot", pct_(st.spot, st.graded) + "%"],
        ["Spot or next to it", pct_(st.spot + st.close, st.graded) + "%"], ["Strikes", pct_(st.strike, st.n) + "%"]],
        ["left", "center"]);
    }
    body += section_("Hitting your spot", tiles_(spotTiles) + cmp + read_(missRead_(st)));
  } else {
    body += section_("Your pen", tiles_([[st.n, "Pitches"], [st.strike, "Strikes"]]));
  }
  var anyVelo = false;
  var types = TYPE_ORDER.filter(function (t) { return st.by[t]; }).concat(Object.keys(st.by).filter(function (t) {
    return TYPE_ORDER.indexOf(t) < 0; }));
  types.forEach(function (t) { if (st.by[t].vn) anyVelo = true; });
  var head = ["Pitch", "Thrown", "Spot", "Spot or next"].concat(anyVelo ? ["Velo avg / top"] : []);
  body += section_("By pitch", table_html_(head, types.map(function (t) {
    var b = st.by[t];
    return [nb_(TYPE_LONG[t] || t), String(b.n), b.graded ? String(b.spot) : "&ndash;",
            b.graded ? String(b.spot + b.close) : "&ndash;"]
      .concat(anyVelo ? [b.vn ? Math.round(b.vsum / b.vn) + " / " + b.vtop : "&ndash;"] : []);
  })));
  body += section_("Where it went", penGrid_(st));
  var pre = st.graded ? st.spot + " of " + st.graded + " on the spot" + (ps && ps.graded ? " (" + ps.spot + " last pen)." : ".")
          : st.n + " pitches, " + st.strike + " strikes.";
  return {key: rid + "|" + pid + "|pen", kind: "pen", rid: rid, pid: pid, who: who, date: date, event: event,
          subject: "Your pen card: " + shortDate_(date) + (tpl && !st.live ? ", " + tpl : (st.live ? ", Live at-bats" : "")),
          preheader: who.full + " · " + pre + (note ? " A note from your coaches inside." : ""),
          label: st.live ? "Live at-bats card" : "Bullpen card", sub: sub, body: body,
          level: s_((d.players[pid] || {}).Level), role: "pitching", more: "See all your pens"};
}
function cmpRow_(label, today, last) {
  var ch = last == null ? "&ndash;" : today - last;
  var chTxt = last == null ? ch : (ch > 0 ? '<b style="color:#1F7A4A">+' + ch + "</b>" : (ch < 0 ? "&minus;" + (-ch) : "same"));
  return [label, today + "%", last == null ? "&ndash;" : last + "%", chTxt];
}
/* The apps' own miss read, in words. */
function missRead_(o) {
  if (!o.miss) return "Every graded pitch was on the spot.";
  var bits = [];
  if (o.up > o.down) bits.push("<b>" + o.up + " were up</b>");
  else if (o.down > o.up) bits.push("<b>" + o.down + " were down</b>");
  if (o.inn > o.out) bits.push("<b>" + o.inn + " went to the arm side</b> (in)");
  else if (o.out > o.inn) bits.push("<b>" + o.out + " went to the glove side</b> (away)");
  return o.miss + (o.miss === 1 ? " pitch" : " pitches") + " missed the spot." +
         (bits.length ? " " + bits.join(" and ") + "." : " No one direction stood out.");
}
function penGrid_(st) {
  var shades = ["#FFFFFF", "#E3EAF6", "#C5D3EC", "#9CB4DE", "#6F8FCB"], cells = blankGrid_(null), spotAt = {};
  Object.keys(st.spots).forEach(function (k) { spotAt[SPOTS[k][0] + "," + SPOTS[k][1]] = k; });
  for (var r = 0; r < 5; r++) for (var c = 0; c < 5; c++) {
    var n = st.grid[r][c], sp = spotAt[r + "," + c], dark = n >= 5;
    var t = (n ? (dark ? '<span style="color:#FFFFFF">' + n + "</span>" : String(n)) : "") +
            (sp != null ? '<div style="font-size:10px;color:' + (dark ? "#FFFFFF" : "#C85C1C") + '">spot ' + sp + "</div>" : "");
    cells[r][c] = [t, n ? shades[Math.min(4, Math.floor((n + 1) / 2))] : null, sp != null ? "2px solid #C85C1C" : null];
  }
  return grid_(cells, "Catcher&rsquo;s view &middot; how many pitches landed in each box &middot; orange boxes are the called spots");
}

/* ---- pitcher, game */
function abList_(rows) {
  /* One at-bat = one Spot + AB. Credited to the pitcher of its first pitch, as in the apps. */
  var by = {}, order = [];
  rows.forEach(function (r) {
    var k = s_(r.RecordID) + "|" + s_(r.Spot) + "|" + s_(r.AB);
    if (!by[k]) { by[k] = {rows: [], pid: s_(r.PitcherID), result: "", hard: false}; order.push(k); }
    by[k].rows.push(r);
    if (s_(r.ABResult)) { by[k].result = s_(r.ABResult); by[k].hard = s_(r.HardContact) === "Y"; }
  });
  return order.map(function (k) { return by[k]; });
}
function innSum_(rows) {
  var o = {pitches: 0, strikes: 0, fp: 0, fps: 0, bf: 0, outs: 0, free: 0, k: 0, hits: 0, runs: 0, er: 0, games: {}};
  rows.forEach(function (r) {
    o.pitches += num_(r.Pitches); o.strikes += num_(r.Strikes); o.fp += num_(r.FirstPitches);
    o.fps += num_(r.FirstPitchStrikes); o.bf += num_(r.BattersFaced); o.outs += num_(r.Outs);
    o.free += num_(r.FreeBases); o.k += num_(r.K); o.hits += num_(r.Hits); o.runs += num_(r.Runs);
    o.er += num_(r.Earned); o.games[s_(r.RecordID)] = 1;
  });
  return o;
}
function ip_(outs) { return Math.floor(outs / 3) + "." + (outs % 3); }
function pitchCard_(d, rec, pid) {
  var rid = s_(rec.RecordID), rows = rowsOf_(d.game, rid, "PitcherID", pid);
  var inns = rowsOf_(d.inn, rid, "PitcherID", pid);
  if (!rows.length && !inns.length) return null;
  var first = rows[0] || inns[0], who = person_(d, pid, first, "PitcherLast", "PitcherFirst");
  var date = dstr_(rec.Date), opp = s_(first.Opponent), level = s_(first.Level) || s_(rec.Team);
  var role = "";
  d.gameNotes.forEach(function (n) { if (s_(n.RecordID) === rid && s_(n.PitcherID) === pid) role = s_(n.Role); });
  var t = innSum_(inns);
  var mine = abList_(d.game.filter(function (r) { return s_(r.RecordID) === rid; }))
    .filter(function (a) { return a.pid === pid && a.result; });
  var bip = 0, hard = 0;
  mine.forEach(function (a) { if (INPLAY[a.result]) { bip++; if (a.hard) hard++; } });
  /* Season to date: every game of his on or before this one. */
  var seasonRecs = {};
  d.records.forEach(function (r) { if (s_(r.App) === "game" && (s_(r.RecordID) === rid || before_(r, rec))) seasonRecs[s_(r.RecordID)] = 1; });
  var sInn = innSum_(d.inn.filter(function (r) { return seasonRecs[s_(r.RecordID)] && s_(r.PitcherID) === pid; }));
  var sAbs = abList_(d.game.filter(function (r) { return seasonRecs[s_(r.RecordID)]; }))
    .filter(function (a) { return a.pid === pid && a.result; });
  var sBip = 0, sHard = 0, sBB = 0;
  sAbs.forEach(function (a) {
    if (INPLAY[a.result]) { sBip++; if (a.hard) sHard++; }
    if (a.result === "BB" || a.result === "IBB") sBB++;
  });
  var G = d.goals, ip = sInn.outs / 3;
  var today = {fps: [t.fps, t.fp], strike: [t.strikes, t.pitches], free: [t.free, t.bf], k: [t.k, t.bf], hard: [hard, bip]};
  var season = {fps: [sInn.fps, sInn.fp], strike: [sInn.strikes, sInn.pitches], free: [sInn.free, sInn.bf],
                k: [sInn.k, sInn.bf], hard: [sHard, sBip]};
  var CHECK = '<span style="color:#1F7A4A;font-weight:700">&#10003;</span>', DOT = '<span style="color:#5A6781">&middot;</span>';
  var goalRows = GOALS.map(function (g) {
    var a = today[g.k], s = season[g.k], gv = G[g.k];
    var p = a[1] ? Math.round(a[0] * 100 / a[1]) : null;
    var met = p != null && (g.more ? p >= gv : p <= gv);
    return ["<b>" + e_(g.name) + '</b><div style="font-size:12px;color:#5A6781">goal ' + gv + "%" + (g.more ? "" : " or less") + "</div>",
            a[1] ? a[0] + " of " + a[1] + '<div style="font-size:12px;color:#5A6781">' + p + "%</div>" : "&ndash;",
            p == null ? "" : (met ? CHECK : DOT),
            s[1] ? Math.round(s[0] * 100 / s[1]) + "%" : "&ndash;"];
  });
  goalRows.push(["<b>ERA</b><div style=\"font-size:12px;color:#5A6781\">goal " + G.era.toFixed(2) + "</div>", "", "",
                 ip ? (sInn.er * 7 / ip).toFixed(2) : "&ndash;"]);
  goalRows.push(["<b>WHIP</b><div style=\"font-size:12px;color:#5A6781\">goal " + G.whip.toFixed(2) + "</div>", "", "",
                 ip ? ((sBB + sInn.hits) / ip).toFixed(2) : "&ndash;"]);
  var nGames = Object.keys(sInn.games).length;
  var body = "";
  var note = noteOf_(d.gameNotes, rid, "PitcherID", pid, "ToPitcher");
  if (note) body += note_(note);
  body += section_("Your outing", tiles_([[ip_(t.outs), "Innings"], [t.pitches, "Pitches"], [t.bf, "Batters"],
                                          [t.runs + " / " + t.er, "Runs / ER"]]));
  body += section_("Nothing Free: program goals", table_html_(["", "Today", "", "Season"], goalRows,
      ["left", "center", "center", "center"]) +
    '<div style="font-size:12px;color:#5A6781;margin:6px 2px 0">' + CHECK + " met the goal today. Season: " + nGames +
    (nGames === 1 ? " game, " : " games, ") + ip_(sInn.outs) + " innings.</div>");
  /* Execution against the call */
  var ex = {called: 0, spot: 0, close: 0, miss: 0, up: 0, down: 0, inn: 0, out: 0, by: {}};
  rows.forEach(function (r) {
    var t2 = s_(r.Type) || "FB", g = s_(r.Execution).toUpperCase(), call = s_(r.Call);
    if (!ex.by[t2]) ex.by[t2] = {n: 0, strike: 0, called: 0, good: 0};
    var b = ex.by[t2]; b.n++;
    if (call && call !== "ball" && call !== "hbp") b.strike++;
    if (!g) return;
    ex.called++; b.called++;
    if (g === "SPOT") { ex.spot++; b.good++; }
    else if (g === "CLOSE") { ex.close++; b.good++; }
    if (g !== "SPOT") {
      ex.miss++;
      if (s_(r.MissV).toUpperCase() === "UP") ex.up++; else if (s_(r.MissV).toUpperCase() === "DOWN") ex.down++;
      if (s_(r.MissH).toUpperCase() === "IN") ex.inn++; else if (s_(r.MissH).toUpperCase() === "OUT") ex.out++;
    }
  });
  if (ex.called) {
    body += section_("Hitting your spot", tiles_([[ex.spot, "Right on the spot"],
        [(ex.spot + ex.close) + " of " + ex.called, "Spot or next to it &middot; " + pct_(ex.spot + ex.close, ex.called) + "%"]]) +
      read_(missRead_(ex)));
  }
  var types = TYPE_ORDER.filter(function (k) { return ex.by[k]; });
  if (types.length) body += section_("By pitch", table_html_(["Pitch", "Thrown", "Strikes", "Spot or next"], types.map(function (k) {
    var b = ex.by[k];
    return [nb_(TYPE_LONG[k] || k), String(b.n), pct_(b.strike, b.n) + "%", b.called ? pct_(b.good, b.called) + "%" : "&ndash;"];
  })));
  var where = opp ? (" vs " + opp) : "";
  return {key: rid + "|" + pid + "|pitch", kind: "pitch", rid: rid, pid: pid, who: who, date: date,
          event: (opp ? "vs " + opp + ", " : "") + shortDate_(date),
          subject: "Your game card:" + where + ", " + shortDate_(date),
          preheader: who.full + " · " + ip_(t.outs) + " innings, " + t.pitches + " pitches, " + t.k +
                     (t.k === 1 ? " strikeout." : " strikeouts.") + (note ? " A note from your coaches inside." : ""),
          label: "Pitcher game card",
          sub: [e_(level), opp ? "vs " + e_(opp) : "", e_(longDate_(date)), e_(role)].filter(Boolean).join(" &middot; "),
          body: body, level: level, role: "pitching", more: "See all your games and pens"};
}

/* ---- hitter, game */
function paList_(rows) {
  var by = {}, order = [];
  rows.forEach(function (r) {
    var k = s_(r.PA);
    if (!by[k]) { by[k] = {rows: []}; order.push(k); }
    by[k].rows.push(r);
  });
  return order.map(function (k) {
    var a = by[k], last = a.rows[a.rows.length - 1];
    a.result = s_(last.PAResult); a.n = a.rows.filter(function (r) { return s_(r.What) !== ""; }).length;
    a.bip = s_(last.What) === "In play"; a.last = last;
    return a;
  }).filter(function (a) { return a.result; });
}
function qab_(a) {
  var r = [];
  if (HITS[a.result]) r.push("H");
  if (a.bip && s_(a.last.Traj) === "LD") r.push("LD");
  if (a.result === "BB" || a.result === "IBB") r.push("BB");
  if (a.result === "HBP") r.push("HBP");
  if (a.result === "SAC" || a.result === "SF") r.push("SAC");
  if (a.bip && s_(a.last.RunScored) === "Y") r.push("RUN");
  if (a.n >= 7) r.push("P7");
  if (a.bip && s_(a.last.MovedRunner) === "Y") r.push("ADV");
  if (a.bip && a.n && num_(a.last.CountS) === 2) r.push("K2");
  return r;
}
function paWords_(a) {
  var w = "<b>" + e_(RES_WORDS[a.result] || a.result) + "</b>", L = a.last;
  if (a.n && s_(L.Pitch)) {
    var b = num_(L.CountB), s = num_(L.CountS), p = (TYPE_LONG[s_(L.Pitch)] || s_(L.Pitch)).toLowerCase();
    w += (b === 0 && s === 0) ? " on a first-pitch " + nb_(p) : " on " + (b === 0 ? "an " : "a ") + b + "-" + s + " " + nb_(p);
  }
  if (HITS[a.result] && TRAJ_WORDS[s_(L.Traj)]) w += ", " + TRAJ_WORDS[s_(L.Traj)];
  if (a.bip && s_(L.HardContact) === "Y") w += ", hit hard";
  var extra = [];
  if (a.bip && s_(L.RunScored) === "Y") extra.push("a run scored");
  if (a.bip && s_(L.MovedRunner) === "Y") extra.push("moved a runner");
  if (extra.length) w += '<div style="font-size:12px;color:#5A6781">' + extra.join(", ") + "</div>";
  return w;
}
function hitCard_(d, rec, pid) {
  var rid = s_(rec.RecordID), rows = rowsOf_(d.off, rid, "HitterID", pid);
  var pas = paList_(rows);
  if (!pas.length) return null;
  var first = rows[0], who = person_(d, pid, first, "HitterLast", "HitterFirst");
  var date = dstr_(rec.Date), opp = s_(first.Opponent), level = s_(first.Level) || s_(rec.Team);
  var ha = s_(first.HomeAway).toUpperCase() === "A" ? "at " : "vs ";
  var spot = num_(first.Spot);
  var o = {qpa: pas.length, qab: 0, why: {}, n: 0, oz: 0, ozsw: 0, ip: 0, hard: 0, k: 0, free: 0, hits: 0};
  pas.forEach(function (a) {
    var q = qab_(a); if (q.length) o.qab++;
    q.forEach(function (k) { o.why[k] = (o.why[k] || 0) + 1; });
    o.n += a.n;
    if (a.bip) { o.ip++; if (s_(a.last.HardContact) === "Y") o.hard++; }
    if (a.result === "K" || a.result === "Kc") o.k++;
    if (a.result === "BB" || a.result === "IBB" || a.result === "HBP") o.free++;
    if (HITS[a.result]) o.hits++;
  });
  var cells = blankGrid_(null), marks = blankGrid_(null);
  rows.forEach(function (r) {
    if (s_(r.What) === "") return;
    var gr = num_(r.Row) - 1, gc = num_(r.Col) - 1;
    if (gr < 0 || gr > 4 || gc < 0 || gc > 4) return;
    if (s_(r.InZone) === "N") o.oz++;
    if (s_(r.Chase) === "Y") o.ozsw++;
    if (!marks[gr][gc]) marks[gr][gc] = {m: [], chase: false};
    var m = marks[gr][gc];
    if (s_(r.What) === "HBP") m.m.push('<span style="font-size:11px">HBP</span>');
    else m.m.push(s_(r.Swing) === "Y" ? "&#9679;" : "&#9675;");
    if (s_(r.Chase) === "Y") m.chase = true;
  });
  for (var gr = 0; gr < 5; gr++) for (var gc = 0; gc < 5; gc++) {
    var m = marks[gr][gc];
    cells[gr][gc] = m ? [m.m.join(" "), m.chase ? "#FBE3D2" : null, m.chase ? "2px solid #C85C1C" : null] : ["", null, null];
  }
  var why = QAB_ORDER.filter(function (k) { return o.why[k]; }).map(function (k) {
    return "<b>" + QAB_SHORT[k] + "</b>" + (o.why[k] > 1 ? " (" + o.why[k] + ")" : ""); });
  var body = "";
  var note = noteOf_(d.offNotes, rid, "HitterID", pid, "ToHitter");
  if (note) body += note_(note);
  body += section_("Your at-bats", table_html_(["", "How it ended", "Pitches"], pas.map(function (a, i) {
    return [String(i + 1), paWords_(a), String(a.n)]; }), ["center", "left", "center"]));
  body += section_("Quality at-bats", tiles_([[o.qab + " of " + o.qpa, "Quality at-bats"],
                                              [o.qpa ? (Math.round(o.n * 10 / o.qpa) / 10).toFixed(1) : "&ndash;", "Pitches per at-bat"]]) +
    read_(why.length ? "Counted for: " + why.join(", ") + "." : "No quality at-bats this game. Next game is a new start."));
  body += section_("Your swings", tiles_([[o.oz ? o.ozsw + " of " + o.oz : "0", "Chased"], [o.ip ? o.hard + " of " + o.ip : "0", "Hit hard"],
                                          [o.k, "Strikeouts"], [o.free, "Free bases"]]) +
    grid_(cells, "Catcher&rsquo;s view &middot; &#9679; swung &middot; &#9675; took &middot; orange = chased off the plate"));
  return {key: rid + "|" + pid + "|hit", kind: "hit", rid: rid, pid: pid, who: who, date: date,
          event: (opp ? ha + opp + ", " : "") + shortDate_(date),
          subject: "Your game card: " + (opp ? ha + opp + ", " : "") + shortDate_(date),
          preheader: who.full + " · " + pas.length + (pas.length === 1 ? " at-bat, " : " at-bats, ") + o.qab + " of " + o.qpa +
                     " quality at-bats." + (note ? " A note from your coaches inside." : ""),
          label: "Hitter game card",
          sub: [e_(level), opp ? ha + e_(opp) : "", e_(longDate_(date)), spot ? "Batting " + ord_(spot) : ""].filter(Boolean).join(" &middot; "),
          body: body, level: level, role: "hitting", more: "See all your games"};
}

/* =========================================================== HTML (email-safe) */
var NAVY = "#16305C", ORANGE = "#C85C1C", INK = "#16233A", MUTED = "#5A6781", LINE = "#D2D9E6", BG = "#ECEFF5",
    SOFT = "#F4F6FA";
var SANS = "-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif";
var COND = "'Avenir Next Condensed','Arial Narrow',Arial,sans-serif";

function cardTop_(c) {
  var logo = cfg_().logo;
  return '<tr><td style="padding:14px 18px 12px;border-bottom:4px solid ' + ORANGE + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td width="92" valign="middle"><img src="' + e_(logo) + '" width="80" height="40" alt="LT" style="display:block;border:0"></td>' +
    '<td valign="middle" style="font-family:' + COND + ';font-weight:700;font-size:15px;letter-spacing:1.5px;text-transform:uppercase;color:' + NAVY + '">Legend Titans Baseball<br>' +
    '<span style="font-size:12px;letter-spacing:1.2px;color:' + ORANGE + '">' + e_(c.label) + '</span></td></tr></table></td></tr>' +
    '<tr><td style="background:' + NAVY + ';padding:16px 18px">' +
    '<div style="font-family:' + COND + ';font-weight:700;font-size:26px;line-height:1.1;letter-spacing:.5px;text-transform:uppercase;color:#FFFFFF">' + e_(c.who.full) + '</div>' +
    '<div style="font-size:14px;color:#BFD0EC;margin-top:4px">' + c.sub + '</div></td></tr>';
}
function footer_() {
  return '<tr><td style="padding:14px 18px 18px;border-top:1px solid ' + LINE + ';font-size:12.5px;line-height:1.5;color:' + MUTED + '">' +
    "These are your numbers only. Nobody else gets this card.<br>Don't want these emails? Tell a coach and we'll stop them.</td></tr>";
}
function emailDoc_(c, reflectUrl, pageUrl) {
  var btn = '<tr><td style="padding:14px 18px 18px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">' +
    (reflectUrl ? '<a href="' + e_(reflectUrl) + '" style="display:inline-block;background:' + ORANGE + ';color:#FFFFFF;text-decoration:none;font-family:' + COND + ';font-weight:700;font-size:16px;letter-spacing:1.2px;text-transform:uppercase;padding:14px 26px;border-radius:8px">Write your reflection</a>' +
      '<div style="font-size:13px;color:' + MUTED + ';margin-top:8px">Takes 2 minutes. Your coaches read every one.</div>' : "") +
    (pageUrl ? '<div style="margin-top:12px"><a href="' + e_(pageUrl) + '" style="font-size:14px;color:' + NAVY + ';font-weight:600">' + e_(c.more) + " &rarr;</a></div>" : "") +
    "</td></tr></table></td></tr>";
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light only"><title>' + e_(c.subject) + "</title></head>" +
    '<body style="margin:0;padding:0;background:' + BG + ";font-family:" + SANS + ";color:" + INK + '">' +
    '<div style="display:none;max-height:0;overflow:hidden">' + e_(c.preheader) + "</div>" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + BG + '"><tr><td align="center" style="padding:16px 10px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid ' + LINE + ';border-radius:10px;overflow:hidden">' +
    cardTop_(c) + c.body + btn + footer_() + "</table></td></tr></table></body></html>";
}
function plain_(c, reflectUrl) {
  return c.subject + "\n\n" + c.preheader + "\n\nOpen this email in your mail app to see the card." +
    (reflectUrl ? "\n\nWrite your reflection (2 minutes): " + reflectUrl : "") +
    "\n\nThese are your numbers only. Don't want these emails? Tell a coach.";
}
function reminderDoc_(cfg, who, r, link) {
  var c = {label: "Reflection reminder", who: {full: s_(who.First) + " " + s_(who.Last)}, sub: e_(s_(r.Event))};
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:' + BG + ";font-family:" + SANS + ";color:" + INK + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + BG + '"><tr><td align="center" style="padding:16px 10px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid ' + LINE + ';border-radius:10px;overflow:hidden">' +
    cardTop_(c) + section_("", read_("Your coaches haven't seen your reflection for " + e_(s_(r.Event)) +
      " yet. It takes 2 minutes: how you feel, and one thing to start, stop and keep doing.")) +
    (link ? '<tr><td align="center" style="padding:10px 18px 20px"><a href="' + e_(link) + '" style="display:inline-block;background:' + ORANGE + ';color:#FFFFFF;text-decoration:none;font-family:' + COND + ';font-weight:700;font-size:16px;letter-spacing:1.2px;text-transform:uppercase;padding:14px 26px;border-radius:8px">Write your reflection</a></td></tr>' : "") +
    footer_() + "</table></td></tr></table></body></html>";
}
function section_(title, inner, pad) {
  var t = title ? '<div style="font-family:' + COND + ';font-weight:700;font-size:13px;letter-spacing:1.4px;text-transform:uppercase;color:' + MUTED + ';margin-bottom:8px">' + e_(title) + "</div>" : "";
  return '<tr><td style="padding:' + (pad || "16px 18px 6px") + '">' + t + inner + "</td></tr>";
}
function note_(text) {
  return section_("", '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background:#FDF3EC;border-left:4px solid ' + ORANGE + ';border-radius:6px;padding:12px 14px">' +
    '<div style="font-family:' + COND + ';font-weight:700;font-size:12px;letter-spacing:1.3px;text-transform:uppercase;color:' + ORANGE + ';margin-bottom:4px">From your coaches</div>' +
    '<div style="font-size:16px;line-height:1.45;color:' + INK + '">' + e_(text) + "</div></td></tr></table>", "16px 18px 4px");
}
function tiles_(items) {
  var w = Math.floor(100 / items.length);
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' + items.map(function (it) {
    return '<td width="' + w + '%" valign="top" style="padding:4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
      '<td height="74" align="center" valign="middle" style="background:' + SOFT + ';border-radius:6px;padding:6px 4px">' +
      '<div style="font-family:' + COND + ';font-weight:700;font-size:22px;color:' + NAVY + ';line-height:1.1">' + it[0] + "</div>" +
      '<div style="font-size:11px;line-height:1.3;letter-spacing:.6px;text-transform:uppercase;color:' + MUTED + ';margin-top:3px">' + it[1] + "</div></td></tr></table></td>";
  }).join("") + "</tr></table>";
}
function table_html_(head, rows, align) {
  align = align || [ "left" ].concat(head.slice(1).map(function () { return "center"; }));
  var th = head.map(function (h, i) {
    return '<td align="' + align[i] + '" style="padding:6px 6px;font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:' + MUTED + ";border-bottom:1px solid " + LINE + '">' + e_(h) + "</td>";
  }).join("");
  var tr = rows.map(function (r) {
    return "<tr>" + r.map(function (c, i) {
      var short = i && String(c).replace(/<[^>]+>|&[a-z#0-9]+;/g, "x").length <= 16;
      return '<td align="' + align[i] + '" style="padding:8px 6px;font-size:14.5px;border-bottom:1px solid ' + SOFT + (short ? ";white-space:nowrap" : "") + '">' + c + "</td>";
    }).join("") + "</tr>";
  }).join("");
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' + th + "</tr>" + tr + "</table>";
}
function read_(html) { return '<div style="font-size:14.5px;line-height:1.45;color:' + INK + ';margin:8px 2px 4px">' + html + "</div>"; }
function grid_(cells, legend) {
  var rows = "";
  for (var r = 0; r < 5; r++) {
    var tds = "";
    for (var c = 0; c < 5; c++) {
      var x = cells[r][c] || ["", null, null], zone = r >= 1 && r <= 3 && c >= 1 && c <= 3;
      tds += '<td width="44" height="40" align="center" valign="middle" style="background:' + (x[1] || (zone ? SOFT : "#FFFFFF")) +
        ";border:" + (x[2] || "1px solid " + LINE) + ";font-family:" + COND + ";font-weight:700;font-size:14px;color:" + INK + '">' + x[0] + "</td>";
    }
    rows += "<tr>" + tds + "</tr>";
  }
  return '<table role="presentation" cellpadding="0" cellspacing="2" align="center" style="margin:4px auto 6px">' + rows + "</table>" +
    '<div style="font-size:12px;color:' + MUTED + ';text-align:center">' + legend + "</div>";
}

/* =========================================================== player page */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var ss = book_(), pid = playerOf_(ss, s_(p.t)), cfg = cfg_();
  var base = cfg.pageUrl || ScriptApp.getService().getUrl(), home = base + "?t=" + encodeURIComponent(s_(p.t));
  if (!pid) return out_(pageDoc_("Legend Titans", '<div class="box"><h1>This link isn&rsquo;t active</h1>' +
    "<p>Ask a coach for your current link.</p></div>"));
  var d = load_(ss), who = d.players[pid] || {}, name = (s_(who.First) + " " + s_(who.Last)).trim();
  var mine = myCards_(ss, pid), refl = myReflections_(ss, pid);
  var r = s_(p.r), k = s_(p.k);
  if (r && k) {
    var row = mine.filter(function (x) { return s_(x.RecordID) === r && s_(x.Kind) === k; })[0];
    var c = row ? build_(d, r, pid) : null;
    if (!c) return out_(pageDoc_("Legend Titans", '<div class="box"><h1>Card not found</h1><p><a href="' + e_(home) + '">See all your cards</a></p></div>'));
    var mineR = refl[c.key];
    var last = lastStart_(refl, mine, c.key);
    var html = '<p class="back"><a href="' + e_(home) + '">&larr; All your cards</a></p>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card">' + cardTop_(c) + c.body + "</table>" +
      (mineR ? savedHtml_(mineR) : formHtml_(p.t, c, last));
    return out_(pageDoc_(c.subject, html));
  }
  var list = mine.slice().sort(function (a, b) { return s_(a.Date) < s_(b.Date) ? 1 : (s_(a.Date) > s_(b.Date) ? -1 : (s_(a.SentAt) < s_(b.SentAt) ? 1 : -1)); });
  var items = list.map(function (x) {
    var done = refl[s_(x.Key)];
    return '<a class="item" href="' + e_(home) + "&amp;r=" + encodeURIComponent(s_(x.RecordID)) + "&amp;k=" + e_(s_(x.Kind)) + '">' +
      '<span class="k">' + e_({pen: "Pen", pitch: "Pitching", hit: "Hitting"}[s_(x.Kind)] || "") + "</span>" +
      '<span class="ev">' + e_(s_(x.Event)) + "</span>" +
      (done ? '<span class="ok">Reflected</span>' : '<span class="todo">Write your reflection</span>') + "</a>";
  }).join("");
  var trend = penTrend_(d, pid);
  return out_(pageDoc_("Your cards", '<div class="head"><div class="org">Legend Titans Baseball</div><h1>' + e_(name) + "</h1>" +
    "<p>Every card you&rsquo;ve had this season, newest first. Your numbers only.</p></div>" +
    (trend ? '<div class="box"><h2>Your pens: on the spot</h2>' + trend + "</div>" : "") +
    '<div class="list">' + (items || '<p class="empty">No cards yet. Your first one comes after your next pen or game.</p>') + "</div>"));
}
function penTrend_(d, pid) {
  var recs = d.records.filter(function (r) {
    return s_(r.App) === "bullpen" && d.pen.some(function (x) { return s_(x.RecordID) === s_(r.RecordID) && s_(x.PitcherID) === pid; });
  }).sort(function (a, b) { return before_(a, b) ? -1 : 1; });
  if (recs.length < 2) return "";
  return '<table class="trend"><tr><th>Pen</th><th>On the spot</th><th>Spot or next</th><th>Strikes</th></tr>' + recs.map(function (r) {
    var st = penStats_(rowsOf_(d.pen, s_(r.RecordID), "PitcherID", pid));
    return "<tr><td>" + e_(shortDate_(dstr_(r.Date))) + "</td><td>" + (st.graded ? pct_(st.spot, st.graded) + "%" : "&ndash;") +
      "</td><td>" + (st.graded ? pct_(st.spot + st.close, st.graded) + "%" : "&ndash;") + "</td><td>" + pct_(st.strike, st.n) + "%</td></tr>";
  }).join("") + "</table>";
}
function lastStart_(refl, mine, key) {
  /* His most recent reflection on an EARLIER card, so the loop closes on the next one. */
  var at = null;
  mine.forEach(function (x) { if (s_(x.Key) === key) at = x; });
  var best = null;
  Object.keys(refl).forEach(function (k) {
    var r = refl[k];
    if (k === key || !s_(r.Start)) return;
    if (at && s_(r.Date) > s_(at.Date)) return;
    if (!best || s_(r.When) > s_(best.When)) best = r;
  });
  return best ? s_(best.Start) : "";
}
function formHtml_(t, c, last) {
  var arm = c.role === "pitching" ? "How&rsquo;s your arm?" : "How&rsquo;s your body?";
  function scale(name, labels) {
    return '<div class="scale" data-name="' + name + '">' + [1, 2, 3, 4, 5].map(function (n) {
      return '<button type="button" data-v="' + n + '"><b>' + n + "</b><span>" + labels[n - 1] + "</span></button>";
    }).join("") + "</div>";
  }
  return '<form id="f" class="box" onsubmit="return false">' +
    '<div class="org">Prepare &middot; Compete &middot; Evaluate</div><h2>Your reflection</h2>' +
    (last ? '<div class="q"><p>Last time you said you&rsquo;d start: <b>' + e_(last) + "</b>. Did you?</p>" +
      '<div class="scale small" data-name="did">' + ["Yes", "Partly", "Not yet"].map(function (v) {
        return '<button type="button" data-v="' + v + '"><b>' + v + "</b></button>"; }).join("") + "</div></div>" : "") +
    '<div class="q"><p>' + arm + "</p>" + scale("arm", ["Hurting", "Sore", "OK", "Good", "Great"]) + "</div>" +
    '<div class="q"><p>How do you feel about today?</p>' + scale("feel", ["Rough", "Not great", "OK", "Good", "Great"]) + "</div>" +
    '<div class="q"><label>START <span>one thing to start doing</span><input name="start" maxlength="' + TEXT_MAX + '"></label></div>' +
    '<div class="q"><label>STOP <span>one thing to stop doing</span><input name="stop" maxlength="' + TEXT_MAX + '"></label></div>' +
    '<div class="q"><label>CONTINUE <span>one thing to keep doing</span><input name="cont" maxlength="' + TEXT_MAX + '"></label></div>' +
    '<div class="q"><label>Anything bothering you? <span>optional, on or off the field. Only your coaches see this.</span>' +
    '<textarea name="bother" rows="3" maxlength="' + TEXT_MAX + '"></textarea></label></div>' +
    '<p id="msg" class="msg"></p><button id="go" class="go" type="button">Send to my coaches</button></form>' +
    "<script>(function(){var v={};" +
    "document.querySelectorAll('.scale').forEach(function(s){s.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;" +
    "s.querySelectorAll('button').forEach(function(x){x.className=''});b.className='on';v[s.getAttribute('data-name')]=b.getAttribute('data-v');});});" +
    "var f=document.getElementById('f'),m=document.getElementById('msg'),g=document.getElementById('go');" +
    "g.addEventListener('click',function(){var o={t:" + JSON.stringify(String(t)) + ",r:" + JSON.stringify(c.rid) + ",k:" + JSON.stringify(c.kind) + "," +
    "did:v.did||'',arm:Number(v.arm||0),feel:Number(v.feel||0),start:f.elements['start'].value.trim(),stop:f.elements['stop'].value.trim(),cont:f.elements['cont'].value.trim(),bother:f.elements['bother'].value.trim()};" +
    "if(!o.arm||!o.feel){m.textContent='Pick a number for both questions.';return;}" +
    "if(!o.start||!o.stop||!o.cont){m.textContent='Write one line for START, STOP and CONTINUE.';return;}" +
    "g.disabled=true;m.textContent='Sending...';" +
    "google.script.run.withSuccessHandler(function(r){if(r&&r.ok){f.innerHTML='<h2>Thanks. Your coaches will read it.</h2><p>'+(r.flag?'A coach will check in with you.':'See you at the next one.')+'</p>';}else{g.disabled=false;m.textContent=(r&&r.error)||'That did not save. Try again.';}})" +
    ".withFailureHandler(function(){g.disabled=false;m.textContent='That did not save. Check your signal and try again.';}).saveReflection(o);});})();</script>";
}
function savedHtml_(r) {
  function line(l, v) { return v ? "<p><b>" + l + "</b> " + e_(s_(v)) + "</p>" : ""; }
  return '<div class="box"><div class="org">Prepare &middot; Compete &middot; Evaluate</div><h2>Your reflection</h2>' +
    '<p class="ok">Sent ' + e_(shortDate_(s_(r.When).slice(0, 10))) + ". Your coaches have it.</p>" +
    line("Did you start it?", r.DidLastStart) + line("Arm/body:", r["Arm/Body"] + " of 5") + line("Feel:", r.Feel + " of 5") +
    line("START", r.Start) + line("STOP", r.Stop) + line("CONTINUE", r.Continue) + line("Bothering you:", r.Bothering) + "</div>";
}
function pageDoc_(title, inner) {
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + e_(title) + '</title><base target="_top">' +
    "<style>body{margin:0;background:" + BG + ";font-family:" + SANS + ";color:" + INK + "}" +
    ".wrap{max-width:560px;margin:0 auto;padding:12px 10px 40px}" +
    ".card{background:#fff;border:1px solid " + LINE + ";border-radius:10px;overflow:hidden;border-collapse:separate}" +
    ".box,.head{background:#fff;border:1px solid " + LINE + ";border-radius:10px;padding:16px 18px;margin-top:12px}" +
    ".org{font-family:" + COND + ";font-weight:700;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:" + ORANGE + "}" +
    "h1{font-family:" + COND + ";font-size:28px;text-transform:uppercase;color:" + NAVY + ";margin:4px 0}h2{font-family:" + COND + ";font-size:20px;text-transform:uppercase;color:" + NAVY + ";margin:4px 0 10px}" +
    ".back a,.list a{color:" + NAVY + "}.list{margin-top:12px}.item{display:flex;gap:10px;align-items:center;background:#fff;border:1px solid " + LINE + ";border-radius:10px;padding:12px 14px;margin-top:8px;text-decoration:none}" +
    ".item .k{font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:" + MUTED + ";width:64px}.item .ev{flex:1;font-weight:600;color:" + INK + "}" +
    ".ok{color:#1F7A4A;font-weight:600}.todo{color:" + ORANGE + ";font-weight:600;font-size:14px}.empty{color:" + MUTED + "}" +
    ".q{margin:14px 0}.q p{margin:0 0 6px;font-weight:600}.scale{display:flex;gap:6px}.scale button{flex:1;padding:8px 2px;border:1px solid " + LINE + ";border-radius:8px;background:" + SOFT + ";font:inherit;color:" + INK + "}" +
    ".scale button b{display:block;font-size:18px}.scale button span{display:block;font-size:11px;color:" + MUTED + "}.scale button.on{background:" + NAVY + ";color:#fff;border-color:" + NAVY + "}.scale button.on span{color:#BFD0EC}" +
    "label{display:block;font-weight:700;font-family:" + COND + ";letter-spacing:1px}label span{font-family:" + SANS + ";font-weight:400;letter-spacing:0;color:" + MUTED + ";font-size:13px;margin-left:4px}" +
    "input,textarea{display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:10px;border:1px solid " + LINE + ";border-radius:8px;font:inherit;font-size:16px}" +
    ".go{width:100%;padding:14px;border:0;border-radius:8px;background:" + ORANGE + ";color:#fff;font-family:" + COND + ";font-weight:700;font-size:16px;letter-spacing:1.2px;text-transform:uppercase}" +
    ".msg{color:" + ORANGE + ";min-height:1em}.trend{width:100%;border-collapse:collapse;font-size:14px}.trend th{font-size:11px;text-transform:uppercase;color:" + MUTED + ";text-align:left}.trend td,.trend th{padding:6px 4px;border-bottom:1px solid " + SOFT + "}" +
    '</style></head><body><div class="wrap">' + inner + "</div></body></html>";
}
function out_(html) {
  return HtmlService.createHtmlOutput(html).setTitle("Legend Titans").addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/* The ONE function the page can call. */
function saveReflection(o) {
  o = o || {};
  var ss = book_(), pid = playerOf_(ss, s_(o.t));
  if (!pid) return {ok: false, error: "This link isn't active. Ask a coach for your current link."};
  var kind = s_(o.k), rid = s_(o.r), key = rid + "|" + pid + "|" + kind;
  var card = myCards_(ss, pid).filter(function (x) { return s_(x.Key) === key; })[0];
  if (!card) return {ok: false, error: "Card not found."};
  var arm = Number(o.arm), feel = Number(o.feel);
  if (!(arm >= 1 && arm <= 5 && arm % 1 === 0) || !(feel >= 1 && feel <= 5 && feel % 1 === 0))
    return {ok: false, error: "Pick a number for both questions."};
  function txt(v) { return s_(v).replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, TEXT_MAX); }
  var ans = {start: txt(o.start), stop: txt(o.stop), cont: txt(o.cont), bother: txt(o.bother),
             did: ["Yes", "Partly", "Not yet"].indexOf(s_(o.did)) >= 0 ? s_(o.did) : ""};
  if (!ans.start || !ans.stop || !ans.cont) return {ok: false, error: "Write one line for START, STOP and CONTINUE."};
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var have = myReflections_(ss, pid);
    if (have[key]) return {ok: true, already: true};
    var d = load_(ss), who = d.players[pid] || {}, c = build_(d, rid, pid);
    var flag = flags_(arm, feel, ans), cfg = cfg_(), to = "";
    var mine = myCards_(ss, pid), last = lastStart_(have, mine, key);
    var level = (c && c.level) || s_(who.Level);
    var row = {When: new Date(now_()).toISOString(), PlayerID: pid, Player: (s_(who.First) + " " + s_(who.Last)).trim(),
               Level: level, Kind: kind, RecordID: rid, Date: s_(card.Date), Event: s_(card.Event),
               "Arm/Body": arm, Feel: feel, DidLastStart: last ? ans.did : "", LastStart: last,
               Start: ans.start, Stop: ans.stop, Continue: ans.cont, Bothering: ans.bother, Flag: flag.join(", ")};
    if (flag.length) {
      to = flagTo_(ss, kind === "hit" ? "hitting" : "pitching", level, cfg);
      if (to) mail_(cfg, {to: to, subject: "Heads-up: " + row.Player + ", " + flag.join(" and ").toLowerCase() + " flag after " + row.Event,
                          htmlBody: flagDoc_(row, cfg), body: flagText_(row, cfg)});
      row.FlaggedTo = cfg.mode === "off" ? "(SEND_MODE off) " + to : to;
    }
    var rt = table_(ss, "Reflections");
    append_(rt.sheet, [row]);
    var log = table_(ss, "Cards");
    log.rows.forEach(function (x) { if (s_(x.Key) === key) setCells_(log.sheet, x._row, {ReflectionAt: row.When}); });
    return {ok: true, flag: flag.length > 0};
  } finally { lock.releaseLock(); }
}
function flags_(arm, feel, a) {
  var out = [], all = (a.bother || "").toLowerCase(), ssc = [a.start, a.stop, a.cont].join(" ").toLowerCase();
  function has(text, list) { return list.some(function (w) { return text.indexOf(w) >= 0; }); }
  if (arm <= 2 || has(all, FLAG_PHYSICAL) || has(ssc, FLAG_STRONG_PHYSICAL)) out.push("Physical");
  if (feel <= 2 || has(all, FLAG_MENTAL) || has(ssc, FLAG_STRONG_MENTAL)) out.push("Mental");
  return out;
}
/* Coaches whose Notify covers this role and whose Level(s) cover this level. */
function flagTo_(ss, role, level, cfg) {
  var t = table_(ss, "Coaches"), out = [];
  t.rows.forEach(function (r) {
    var em = s_(r["Google account"]).trim(), n = s_(r.Notify).toLowerCase(), lv = s_(r["Level(s)"]).toLowerCase();
    if (!em || !n) return;
    var roleOk = n.indexOf("both") >= 0 || n.indexOf("all") >= 0 || n.indexOf(role === "hitting" ? "hit" : "pitch") >= 0;
    var lvOk = !level || !lv || lv.indexOf("all") >= 0 ||
      lv.split(/[,\/;]+/).map(function (x) { return x.trim(); }).indexOf(String(level).toLowerCase()) >= 0;
    if (roleOk && lvOk && out.indexOf(em) < 0) out.push(em);
  });
  if (!out.length && cfg.admin) out.push(cfg.admin);
  return out.join(", ");
}
function flagDoc_(r, cfg) {
  function line(l, v) { return v === "" || v == null ? "" : '<tr><td style="padding:6px 8px;color:' + MUTED + ';white-space:nowrap;vertical-align:top">' + l + '</td><td style="padding:6px 8px">' + e_(s_(v)) + "</td></tr>"; }
  return '<div style="font-family:' + SANS + ";color:" + INK + ';max-width:560px">' +
    '<p style="font-size:16px"><b>' + e_(r.Player) + "</b> (" + e_(r.Level || "no level") + ") flagged <b>" + e_(r.Flag.toLowerCase()) +
    "</b> in his reflection after " + e_(r.Event) + ".</p>" +
    '<table style="border-collapse:collapse;font-size:15px">' + line("Arm/body", r["Arm/Body"] + " of 5") + line("Feel", r.Feel + " of 5") +
    line("Bothering him", r.Bothering) + line("START", r.Start) + line("STOP", r.Stop) + line("CONTINUE", r.Continue) + "</table>" +
    '<p style="font-size:15px">Please check in with him today. If you are worried about his safety, follow the school&rsquo;s student support process right away.</p>' +
    (cfg.reflUrl ? '<p><a href="' + e_(cfg.reflUrl) + '">All reflections</a></p>' : "") +
    '<p style="font-size:12px;color:' + MUTED + '">Sent by Titans Player Cards because he rated 1 or 2, or used a flag word.</p></div>';
}
function flagText_(r, cfg) {
  return r.Player + " (" + (r.Level || "no level") + ") flagged " + r.Flag.toLowerCase() + " after " + r.Event + ".\n" +
    "Arm/body " + r["Arm/Body"] + " of 5, feel " + r.Feel + " of 5.\n" + (r.Bothering ? "Bothering him: " + r.Bothering + "\n" : "") +
    "Please check in with him today." + (cfg.reflUrl ? "\n" + cfg.reflUrl : "");
}

/* =========================================================== tokens and lookups */
function token_(ss, pid, renew) {
  var t = table_(ss, "Player_Links");
  for (var i = 0; i < t.rows.length; i++) {
    if (s_(t.rows[i].PlayerID) !== pid) continue;
    if (!renew) return s_(t.rows[i].Token);
    var nt = newToken_();
    setCells_(t.sheet, t.rows[i]._row, {Token: nt, Made: new Date(now_()).toISOString()});
    return nt;
  }
  var tok = newToken_();
  append_(t.sheet, [{PlayerID: pid, Token: tok, Made: new Date(now_()).toISOString()}]);
  return tok;
}
function newToken_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "").slice(0, 40); }
function playerOf_(ss, tok) {
  if (!tok || tok.length < 32 || !/^[0-9a-f]+$/i.test(tok)) return "";
  var rows = table_(ss, "Player_Links").rows;
  for (var i = 0; i < rows.length; i++) if (s_(rows[i].Token) === tok) return s_(rows[i].PlayerID);
  return "";
}
function myCards_(ss, pid) {
  return table_(ss, "Cards").rows.filter(function (r) { return s_(r.PlayerID) === pid && /^(sent|test)$/.test(s_(r.Status)); });
}
function myReflections_(ss, pid) {
  var o = {};
  table_(ss, "Reflections").rows.forEach(function (r) {
    if (s_(r.PlayerID) === pid) o[s_(r.RecordID) + "|" + pid + "|" + s_(r.Kind)] = r;
  });
  return o;
}
function reflectedKeys_(ss) {
  var o = {};
  table_(ss, "Reflections").rows.forEach(function (r) { o[s_(r.RecordID) + "|" + s_(r.PlayerID) + "|" + s_(r.Kind)] = 1; });
  return o;
}
function person_(d, pid, row, lastK, firstK) {
  var p = d.players[pid] || {};
  var first = s_(p.First) || s_(row[firstK]), last = s_(p.Last) || s_(row[lastK]);
  return {first: first, last: last, full: (first + " " + last).trim() || "Titans player"};
}

/* =========================================================== plumbing */
function cfg_() {
  var p = PropertiesService.getScriptProperties();
  var mode = (p.getProperty("SEND_MODE") || "off").toLowerCase().trim();
  if (["off", "test", "live"].indexOf(mode) < 0) mode = "off";
  return {mode: mode, testTo: (p.getProperty("TEST_TO") || "").trim(), pageUrl: (p.getProperty("PAGE_URL") || "").trim(),
          logo: p.getProperty("LOGO_URL") || DEFAULT_LOGO, admin: (p.getProperty("ADMIN_EMAIL") || "").trim(),
          reflUrl: (p.getProperty("REFLECTIONS_URL") || "").trim(), cardsFrom: p.getProperty("CARDS_FROM") || ""};
}
/* Every email goes through here. off: nothing. test: TEST_TO only. */
function mail_(cfg, m) {
  if (cfg.mode === "off") return false;
  var msg = {to: m.to, subject: m.subject, htmlBody: m.htmlBody, body: m.body, name: "Legend Titans Baseball"};
  if (m.cc) msg.cc = m.cc;
  if (cfg.mode === "test") {
    if (!cfg.testTo) throw new Error("SEND_MODE is test but TEST_TO is empty.");
    msg = {to: cfg.testTo, subject: "[TEST for " + m.to + (m.cc ? " cc " + m.cc : "") + "] " + m.subject,
           htmlBody: m.htmlBody, body: m.body, name: "Legend Titans Baseball"};
  }
  MailApp.sendEmail(msg);
  return true;
}
function quota_() { try { return MailApp.getRemainingDailyQuota(); } catch (x) { return 50; } }
/* Admin functions run from the editor or this project's own triggers, never from the page. */
function guard_(e) {
  if (e && e.triggerUid) {
    var ids = ScriptApp.getProjectTriggers().map(function (t) { return String(t.getUniqueId()); });
    if (ids.indexOf(String(e.triggerUid)) >= 0) return;
  }
  var a = "", f = "";
  try { a = Session.getActiveUser().getEmail(); f = Session.getEffectiveUser().getEmail(); } catch (x) {}
  if (a && f && a.toLowerCase() === f.toLowerCase()) return;
  throw new Error("Run this from the script editor.");
}
function book_() {
  var id = PropertiesService.getScriptProperties().getProperty("SEASON_SHEET_ID");
  if (!id) throw new Error("Set the SEASON_SHEET_ID script property first.");
  return SpreadsheetApp.openById(id);
}
function now_() { return Date.now(); }
function sheet_(ss, name, head) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, head.length).setValues([head]);
    sh.setFrozenRows(1);
    return sh;
  }
  var h = header_(sh), add = head.filter(function (x) { return h.indexOf(x) < 0; });
  if (add.length) sh.getRange(1, h.length + 1, 1, add.length).setValues([add]);
  return sh;
}
function header_(sh) {
  var n = sh.getLastColumn();
  return n ? sh.getRange(1, 1, 1, n).getValues()[0].map(function (x) { return String(x).trim(); }) : [];
}
/* A tab as objects keyed by header name; _row is the sheet row number. */
function table_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) return {sheet: null, head: [], rows: []};
  var nr = sh.getLastRow(), nc = sh.getLastColumn();
  if (nr < 1 || nc < 1) return {sheet: sh, head: [], rows: []};
  var v = sh.getRange(1, 1, nr, nc).getValues(), h = v[0].map(function (x) { return String(x).trim(); });
  var rows = [];
  for (var i = 1; i < v.length; i++) {
    var o = {_row: i + 1}, any = false;
    for (var j = 0; j < h.length; j++) { if (h[j]) { o[h[j]] = v[i][j]; if (v[i][j] !== "" && v[i][j] != null) any = true; } }
    if (any) rows.push(o);
  }
  return {sheet: sh, head: h, rows: rows};
}
function append_(sh, objs) {
  if (!sh || !objs.length) return;
  var h = header_(sh);
  var vals = objs.map(function (o) { return h.map(function (k) { return cell_(o[k]); }); });
  sh.getRange(sh.getLastRow() + 1, 1, vals.length, h.length).setValues(vals);
}
function setCells_(sh, row, obj) {
  var h = header_(sh);
  Object.keys(obj).forEach(function (k) {
    var c = h.indexOf(k);
    if (c >= 0) sh.getRange(row, c + 1, 1, 1).setValues([[cell_(obj[k])]]);
  });
}
/* Text is stored as text, never as a formula or a date. Numbers stay numbers. */
function cell_(v) {
  if (v == null) return "";
  if (typeof v === "number") return isFinite(v) ? v : "";
  if (typeof v === "boolean") return v ? "Y" : "N";
  v = String(v);
  return v === "" ? "" : "'" + v;
}
function s_(v) {
  if (v == null) return "";
  if (Object.prototype.toString.call(v) === "[object Date]") return dstr_(v);
  return String(v);
}
function num_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function pct_(a, b) { return b ? Math.round(a * 100 / b) : 0; }
function e_(v) {
  return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function nb_(s) { return String(s).replace(/-/g, "&#8209;"); }
function ord_(n) { var s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
function blankGrid_(v) { var g = []; for (var r = 0; r < 5; r++) { g.push([]); for (var c = 0; c < 5; c++) g[r].push(v); } return g; }
/* yyyy-mm-dd, from a text date or a Date a person typed into the Sheet. */
function dstr_(v) {
  if (Object.prototype.toString.call(v) === "[object Date]") {
    return v.getFullYear() + "-" + ("0" + (v.getMonth() + 1)).slice(-2) + "-" + ("0" + v.getDate()).slice(-2);
  }
  var m = String(v || "").match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : String(v || "");
}
var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul",
  "Aug", "Sep", "Oct", "Nov", "Dec"];
function ymd_(s) { var m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; }
function shortDate_(s) { var d = ymd_(s); return d ? MONTHS[d.getUTCMonth()] + " " + d.getUTCDate() : s_(s); }
function longDate_(s) { var d = ymd_(s); return d ? DAYS[d.getUTCDay()] + ", " + shortDate_(s) : s_(s); }
/* Is record a before record b? By date, then by when it was filed. */
function before_(a, b) {
  var da = dstr_(a.Date), db = dstr_(b.Date);
  if (da !== db) return da < db;
  return s_(a.FiledAt) < s_(b.FiledAt);
}
