/* Titans Coaches Dashboard
   =========================
   A standalone Apps Script web app that reads the season Sheet the upload receiver
   fills. Page 1 is the Program overview: the 150 free-base counter with its pace line
   and each team's share, the free-base battle game by game, and the 9 program goals
   by level. More pages (team, pitcher card, hitter card, winter, player report) follow.

   It runs AS THE COACH who opens it, like the Reflections page, so two things must both
   be true for a coach to see anything:
     1. the season Sheet is shared with his Google account (Google enforces this), and
     2. his Google account is on the Coaches tab (this script checks).

   Setup, once (full steps in claude/dashboard-google-setup.md, Step 5):
     1. script.google.com, signed in as the program account > New project
        "Titans Coaches Dashboard" > paste this file over Code.gs > Save.
     2. Project Settings: time zone America/Denver. Script property SEASON_SHEET_ID,
        the same ID the receiver and the cards use.
     3. Deploy > New deployment > Web app. Execute as: User accessing the web app.
        Who has access: Anyone with a Google account. Share the /exec URL with the coaches.

   Spring games only. Practice rows never count. Winter bullpens are never graded against
   the program goals. Every number here comes from the Sheet; Config can change any goal,
   any 2026 rate, any team's share of 150 and each level's games on the schedule. */

var VERSION = "dashboard 1.4 (Nov 2026)";

var LEVELS = ["Varsity", "JV", "Sophomore", "Freshman"];

/* The program goal (locked Nov 2026). Same names and math as the player cards. */
var SAVE_GOAL = {setting: "Free bases saved goal", v: 150};
/* games = the 2027 regular-season schedule (Nov 2026): Varsity 23 (4 at the Coach Bob
   Classic + 19), JV 19, Sophomore 19, Freshman 19; scrimmages left out. Playoff games
   still count toward 150; pace simply tops out at each share. */
var DEFAULTS = {
  Varsity:   {rate: 17.9, share: 49, games: 23},
  JV:        {rate: 20.3, share: 43, games: 19},
  Sophomore: {rate: 18.2, share: 34, games: 19},
  Freshman:  {rate: 17.7, share: 24, games: 19}
};
var BUDGET = {setting: "Free base game budget", v: 3};

/* The 9 program goals, every level, spring games only. */
var GOALS = [
  {k: "free",   name: "Free bases",          sub: "walks + HBP, % of batters", setting: "Free bases goal",          v: 13,  more: false, pct: true},
  {k: "fps",    name: "First-pitch strikes", sub: "% of batters",              setting: "First-pitch strikes goal", v: 60,  more: true,  pct: true},
  {k: "strike", name: "Strikes",             sub: "% of pitches",              setting: "Strikes goal",             v: 60,  more: true,  pct: true},
  {k: "k",      name: "Strikeouts",          sub: "% of batters",              setting: "Strikeouts goal",          v: 22,  more: true,  pct: true},
  {k: "kbb",    name: "Strikeouts per walk", sub: "",                          setting: "Strikeouts per walk goal", v: 2.0, more: true,  dec: 1},
  {k: "uer",    name: "Unearned runs",       sub: "% of runs",                 setting: "Unearned goal",            v: 15,  more: false, pct: true},
  {k: "hard",   name: "Hard contact",        sub: "% of balls in play",        setting: "Hard contact goal",        v: 20,  more: false, pct: true},
  {k: "whip",   name: "WHIP",                sub: "",                          setting: "WHIP goal",                v: 1.5, more: false, dec: 2},
  {k: "era",    name: "ERA",                 sub: "7 innings",                 setting: "ERA goal",                 v: 3.5, more: false, dec: 2}
];
var INPLAY = {GO: 1, FO: 1, LO: 1, PO: 1, FC: 1, DP: 1, SAC: 1, SF: 1, "1B": 1, "2B": 1, "3B": 1, HR: 1, E: 1};

/* =========================================================== the page */
function doGet(e) {
  var me = "";
  try { me = String(Session.getActiveUser().getEmail() || "").toLowerCase().trim(); } catch (x) {}
  var ss;
  try { ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("SEASON_SHEET_ID")); }
  catch (x) { return page_(box_("No access", "The season Sheet is not shared with " + e_(me || "this account") + ". Ask Jim to share it.")); }
  var coach = rows_(ss, "Coaches").filter(function (r) { return me && String(r["Google account"] || "").toLowerCase().trim() === me; })[0];
  if (!coach) return page_(box_("No access", e_(me || "This account") + " is not on the Coaches tab. Ask Jim to add it."));
  if (e && e.parameter && e.parameter.p === "import") return page_(importPage_(ss));
  return page_(overview_(compute_(ss), coach) + '<p class="foot"><a href="' + e_(selfUrl_()) + '?p=import">Import GameChanger stats</a></p>');
}

/* =========================================================== the numbers */
function settings_(ss) {
  var cfg = {};
  rows_(ss, "Config").forEach(function (r) { cfg[String(r.Setting || "").trim().toLowerCase()] = r.Value; });
  function v(name, dflt) { var x = Number(cfg[name.toLowerCase()]); return isFinite(x) && x > 0 ? x : dflt; }
  var o = {season: cfg.season || "", saveGoal: v(SAVE_GOAL.setting, SAVE_GOAL.v), budget: v(BUDGET.setting, BUDGET.v), goals: {}, lv: {}};
  GOALS.forEach(function (g) { o.goals[g.k] = v(g.setting, g.v); });
  LEVELS.forEach(function (l) {
    var d = DEFAULTS[l];
    o.lv[l] = {rate: v("2026 free-base rate " + l, d.rate), share: v("Free bases share " + l, d.share),
               games: v("Games scheduled " + l, d.games)};
  });
  return o;
}

function blank_() {
  return {games: {}, pitches: 0, strikes: 0, fp: 0, fps: 0, bf: 0, outs: 0, free: 0, k: 0, hits: 0, runs: 0, er: 0,
          bb: 0, bip: 0, hard: 0, hardCalls: 0};
}

/* Everything the overview needs, from the Sheet. Exposed for the tests. */
function compute_(ss) {
  var S = settings_(ss);
  var recs = {};
  rows_(ss, "Records").forEach(function (r) { if (s_(r.App) === "game") recs[s_(r.RecordID)] = r; });
  var keep = function (r) { return recs[s_(r.RecordID)] && s_(r.Practice).toUpperCase() !== "Y"; };
  var lv = {}, prog = blank_(), games = {};
  LEVELS.forEach(function (l) { lv[l] = blank_(); });
  function levelOf(r) { return levelName_(s_(r.Level) || s_((recs[s_(r.RecordID)] || {}).Team)); }

  rows_(ss, "Game_Innings").filter(keep).forEach(function (r) {
    var l = levelOf(r);
    if (!l) return;
    var rid = s_(r.RecordID);
    [lv[l], prog].forEach(function (o) {
      o.games[rid] = 1;
      o.pitches += num_(r.Pitches); o.strikes += num_(r.Strikes); o.fp += num_(r.FirstPitches);
      o.fps += num_(r.FirstPitchStrikes); o.bf += num_(r.BattersFaced); o.outs += num_(r.Outs);
      o.free += num_(r.FreeBases); o.k += num_(r.K); o.hits += num_(r.Hits); o.runs += num_(r.Runs);
      o.er += num_(r.Earned);
    });
    var g = games[rid] = games[rid] || {rid: rid, level: l, date: dstr_(r.Date || (recs[rid] || {}).Date),
                                         opp: s_(r.Opponent), bf: 0, free: 0};
    g.bf += num_(r.BattersFaced); g.free += num_(r.FreeBases);
  });

  /* At-bats: walks for WHIP and K per walk, balls in play and hard contact. One at-bat is
     one Spot + AB, credited to the pitcher of its first pitch, as in the apps and the cards. */
  var abs = {}, order = [];
  rows_(ss, "Game_Pitches").filter(keep).forEach(function (r) {
    var k = s_(r.RecordID) + "|" + s_(r.Spot) + "|" + s_(r.AB);
    if (!abs[k]) { abs[k] = {level: levelOf(r), result: "", hard: false}; order.push(k); }
    if (s_(r.ABResult)) { abs[k].result = s_(r.ABResult); abs[k].hard = s_(r.HardContact) === "Y"; }
  });
  order.forEach(function (k) {
    var a = abs[k];
    if (!a.level || !a.result) return;
    [lv[a.level], prog].forEach(function (o) {
      if (a.result === "BB" || a.result === "IBB") o.bb++;
      if (INPLAY[a.result]) { o.bip++; if (a.hard) o.hard++; }
    });
  });

  /* The counter: each level saves its batters faced x its 2026 rate, minus its free bases. */
  var saved = 0, pace = 0;
  LEVELS.forEach(function (l) {
    var o = lv[l], L = S.lv[l];
    o.nGames = Object.keys(o.games).length;
    o.saved = o.bf * L.rate / 100 - o.free;
    o.share = L.share;
    o.pace = L.share * Math.min(1, o.nGames / L.games);
    saved += o.saved; pace += o.pace;
    o.m = metrics_(o);
  });
  prog.nGames = Object.keys(prog.games).length;
  prog.m = metrics_(prog);
  var list = Object.keys(games).map(function (k) {
    var g = games[k];
    g.saved = g.bf * S.lv[g.level].rate / 100 - g.free;
    g.won = g.free <= S.budget;
    return g;
  }).sort(function (a, b) { return a.date === b.date ? (a.level < b.level ? -1 : 1) : (a.date < b.date ? 1 : -1); });
  var scheduled = LEVELS.reduce(function (a, l) { return a + S.lv[l].games; }, 0);
  return {S: S, lv: lv, prog: prog, saved: saved, pace: pace, games: list, scheduled: scheduled,
          won: list.filter(function (g) { return g.won; }).length,
          asOf: list.length ? list[0].date : ""};
}

function metrics_(o) {
  var ip = o.outs / 3;
  return {
    free:   o.bf ? o.free * 100 / o.bf : null,
    fps:    o.fp ? o.fps * 100 / o.fp : null,
    strike: o.pitches ? o.strikes * 100 / o.pitches : null,
    k:      o.bf ? o.k * 100 / o.bf : null,
    kbb:    o.bb ? o.k / o.bb : null,
    uer:    o.runs ? (o.runs - o.er) * 100 / o.runs : (o.bf ? 0 : null),
    hard:   o.bip ? o.hard * 100 / o.bip : null,
    whip:   ip ? (o.bb + o.hits) / ip : null,
    era:    ip ? o.er * 7 / ip : null
  };
}

/* =========================================================== the overview */
function overview_(c, coach) {
  var S = c.S, goal = S.saveGoal;
  var head = '<div class="head"><div class="org">Legend Titans Baseball &middot; Coaches dashboard</div>' +
    "<h1>Program overview</h1><p>" + (S.season ? e_(S.season) + " spring games" : "Spring games") +
    (c.asOf ? " through " + e_(longDate_(c.asOf)) : "") + " &middot; " + c.prog.nGames + " of " + c.scheduled +
    " games charted &middot; signed in as " + e_(coach.Name || coach["Google account"]) + "</p></div>";
  if (!c.prog.nGames) {
    return head + box_("No spring games yet", "The counter, the free-base battle and the goals fill in as soon as the first " +
      "game is filed from an iPad. Practice games never count.");
  }
  /* 1. The counter */
  var n = Math.round(c.saved), p = Math.round(c.pace), diff = n - p;
  var status = diff > 0 ? "<b>" + diff + " ahead</b> of pace" : diff < 0 ? "<b>" + (-diff) + " behind</b> pace" : "<b>Right on</b> pace";
  var big = n >= 0 ? '<span class="num">' + n + '</span><span class="of">of ' + goal + " free bases saved</span>"
                   : '<span class="num neg">' + (-n) + '</span><span class="of">more free bases than 2026\'s rate</span>';
  var counter = '<div class="card hero"><div class="label">Program goal &middot; ' + goal + ' fewer free bases than 2026</div>' +
    '<div class="bigrow">' + big + '</div>' + bar_(n, p, goal, true) +
    '<div class="status">' + status + " (pace: " + p + " by now) &middot; " + c.prog.nGames + (c.prog.nGames === 1 ? " game" : " games") + "</div></div>";

  /* 2. Each team's share */
  var shares = LEVELS.map(function (l) {
    var o = c.lv[l], s = Math.round(o.saved), pc = Math.round(o.pace);
    var txt = o.nGames ? (s >= 0 ? s + " of " + o.share : (-s) + " over 2026's rate") : "No games yet";
    return '<div class="lvrow"><div class="lvname">' + l + '<span>' + o.nGames + " of " + S.lv[l].games + " games</span></div>" +
      '<div class="lvbar">' + bar_(s, pc, o.share, false) + "</div>" +
      '<div class="lvnum">' + txt + (o.nGames ? '<span>pace ' + pc + "</span>" : "") + "</div></div>";
  }).join("");
  var shareCard = '<div class="card"><h2>Each team\'s share of ' + goal + "</h2>" + shares +
    '<p class="note">Saved = batters faced &times; that level\'s 2026 free-base rate, minus the walks and hit batters we gave up. ' +
    "Pace = each share &times; the share of that level's games already played. The marker on each bar is pace.</p></div>";

  /* 3. The free-base battle, game by game */
  var rows = c.games.slice(0, 10).map(function (g) {
    var s = Math.round(g.saved);
    return "<tr><td>" + e_(shortDate_(g.date)) + "</td><td>" + e_(g.level) + "</td><td>" + e_(g.opp || "") + "</td>" +
      '<td class="c">' + g.free + '</td><td class="c">' + g.bf + '</td><td class="c ' + (s >= 0 ? "pos" : "neg") + '">' + (s > 0 ? "+" : "") + s + "</td>" +
      '<td class="c">' + (g.won ? '<span class="ok">&#10003;</span>' : '<span class="ring"></span>') + "</td></tr>";
  }).join("");
  var battle = '<div class="card"><h2>The free-base battle</h2><p class="lead"><b>' + c.won + " of " + c.games.length +
    "</b> games at " + S.budget + " free bases or fewer (2026 average: 5.3)</p>" +
    '<div class="scroll"><table><thead><tr><th>Date</th><th>Team</th><th>Opponent</th><th class="c">Free bases</th>' +
    '<th class="c">Batters</th><th class="c">Saved</th><th class="c">' + S.budget + ' or fewer</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
    (c.games.length > 10 ? '<p class="note">Newest 10 of ' + c.games.length + " games.</p>" : "") + "</div>";

  /* 4. The 9 program goals by level */
  var cols = LEVELS.concat(["Program"]);
  var goalRows = GOALS.map(function (g) {
    var gv = S.goals[g.k];
    var gtxt = (g.pct ? fmt_(gv, 0) + "%" : fmt_(gv, g.dec)) + (g.more ? " or more" : " or less");
    return '<tr><td class="gname"><b>' + e_(g.name) + "</b><span>goal " + gtxt + (g.sub ? " &middot; " + g.sub : "") + "</span></td>" +
      cols.map(function (l) {
        var o = l === "Program" ? c.prog : c.lv[l], x = o.m[g.k];
        if (x == null) return '<td class="c dim' + (l === "Program" ? " prog" : "") + '">&ndash;</td>';
        var met = g.more ? x >= gv - 1e-9 : x <= gv + 1e-9;
        return '<td class="c' + (l === "Program" ? " prog" : "") + '">' + (g.pct ? fmt_(x, 1) + "%" : fmt_(x, g.dec)) + " " +
          (met ? '<span class="ok">&#10003;</span>' : '<span class="ring"></span>') + "</td>";
      }).join("") + "</tr>";
  }).join("");
  var goals = '<div class="card"><h2>The 9 program goals by level</h2><div class="scroll"><table class="goals"><thead><tr><th></th>' +
    cols.map(function (l) { return '<th class="c' + (l === "Program" ? " prog" : "") + '">' + l + "</th>"; }).join("") +
    "</tr></thead><tbody>" + goalRows + "</tbody></table></div>" +
    '<p class="note"><span class="ok">&#10003;</span> met &middot; <span class="ring"></span> not yet &middot; &ndash; no games yet. ' +
    "Hard contact is the charter's call on every ball in play. ERA and WHIP use innings counted from outs the chart sees, so a " +
    "caught stealing or pickoff is missed and they read slightly high; GameChanger stays the official line.</p></div>";

  return head + counter + shareCard + battle + goals +
    '<p class="foot">' + e_(VERSION) + "</p>";
}

/* A bar from 0 to max: the fill is saved, the marker is pace. Below zero shows an empty
   bar in orange outline. */
function bar_(v, pace, max, big) {
  var w = max > 0 ? Math.max(0, Math.min(100, v * 100 / max)) : 0, pw = max > 0 ? Math.max(0, Math.min(100, pace * 100 / max)) : 0;
  return '<div class="bar' + (big ? " big" : "") + (v < 0 ? " under" : "") + '"><div class="fill" style="width:' + w.toFixed(1) + '%"></div>' +
    '<div class="pace" style="left:' + pw.toFixed(1) + '%"></div></div>';
}

/* =========================================================== helpers */
function rows_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues(), h = v[0].map(function (x) { return String(x).trim(); });
  return v.slice(1).map(function (r) { var o = {}; h.forEach(function (k, i) { if (k) o[k] = r[i]; }); return o; });
}
function levelName_(s) {
  s = String(s || "").trim().toLowerCase();
  if (/^v/.test(s)) return "Varsity";
  if (/^j/.test(s)) return "JV";
  if (/^so/.test(s)) return "Sophomore";
  if (/^f/.test(s)) return "Freshman";
  return "";
}
function s_(v) {
  if (v == null) return "";
  if (Object.prototype.toString.call(v) === "[object Date]") return dstr_(v);
  return String(v);
}
function num_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function fmt_(x, d) { return Number(x).toFixed(d || 0); }
function dstr_(v) {
  if (Object.prototype.toString.call(v) === "[object Date]") {
    return v.getFullYear() + "-" + ("0" + (v.getMonth() + 1)).slice(-2) + "-" + ("0" + v.getDate()).slice(-2);
  }
  var m = String(v || "").match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : String(v || "");
}
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate_(d) { var m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? MONTHS[+m[2] - 1] + " " + (+m[3]) : String(d); }
function longDate_(d) { var m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? MONTHS[+m[2] - 1] + " " + (+m[3]) + ", " + m[1] : String(d); }
function e_(v) {
  return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function box_(title, msg) { return '<div class="card"><h2>' + e_(title) + "</h2><p>" + msg + "</p></div>"; }
function page_(inner) {
  var html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Titans Coaches Dashboard</title><base target="_top"><style>' +
    "body{margin:0;background:#ECEFF5;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;color:#16233A}" +
    ".wrap{max-width:1120px;margin:0 auto;padding:14px 16px 40px}" +
    ".head,.card{background:#fff;border:1px solid #D2D9E6;border-radius:10px;padding:16px 18px;margin-top:12px}" +
    ".org{font-weight:700;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#C85C1C}" +
    "h1{font-size:28px;text-transform:uppercase;color:#16305C;margin:4px 0}.head p{margin:2px 0;color:#5A6781;font-size:14px}" +
    "h2{font-size:16px;letter-spacing:.6px;text-transform:uppercase;color:#16305C;margin:0 0 10px}" +
    ".hero .label{font-size:13px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#C85C1C}" +
    ".bigrow{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:6px 0 10px}" +
    ".num{font-size:72px;font-weight:800;line-height:1;color:#16305C}.num.neg{color:#C85C1C}.of{font-size:20px;color:#16233A}" +
    ".status{margin-top:10px;font-size:16px}" +
    ".bar{position:relative;height:14px;background:#E3E8EF;border-radius:7px}.bar.big{height:26px;border-radius:13px}" +
    ".bar .fill{position:absolute;left:0;top:0;bottom:0;background:#2B6CB0;border-radius:inherit}" +
    ".bar.under{background:#FBE9DF}.bar .pace{position:absolute;top:-4px;bottom:-4px;width:3px;margin-left:-1px;background:#16233A}" +
    ".lvrow{display:grid;grid-template-columns:120px 1fr 120px;gap:12px;align-items:center;margin:12px 0}" +
    "@media(max-width:500px){.lvrow{grid-template-columns:92px 1fr 84px;gap:8px}}" +
    ".lvname{font-weight:700}.lvname span,.lvnum span{display:block;font-size:12px;font-weight:400;color:#5A6781}.lvnum{text-align:right;font-weight:700}" +
    ".note{font-size:12.5px;color:#5A6781;margin:10px 0 0;line-height:1.45}.lead{margin:0 0 8px}.foot{font-size:11px;color:#8A93A6;text-align:right}" +
    ".scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}" +
    "th{font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:#5A6781;text-align:left;padding:6px;border-bottom:1px solid #D2D9E6}" +
    "td{padding:7px 6px;border-bottom:1px solid #F4F6FA;white-space:nowrap}.c{text-align:center}" +
    ".pos{color:#1F7A4A;font-weight:700}.neg{color:#C85C1C;font-weight:700}.dim{color:#8A93A6}" +
    ".gname span{display:block;font-size:12px;color:#5A6781;white-space:normal}.prog{background:#F4F6FA}" +
    ".ok{display:inline-block;width:18px;height:18px;line-height:18px;border-radius:50%;background:#1F7A4A;color:#fff;font-size:12px;font-weight:700;text-align:center;vertical-align:middle}" +
    ".ring{display:inline-block;width:12px;height:12px;border:3px solid #16305C;border-radius:50%;vertical-align:middle}" +
    "@media print{body{background:#fff}.card,.head{break-inside:avoid;border-color:#bbb}}" +
    '</style></head><body><div class="wrap">' + inner + "</div></body></html>";
  return HtmlService.createHtmlOutput(html).setTitle("Titans Coaches Dashboard").addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/* =========================================================== GameChanger import
   Nov 12, 2026. Season totals from GameChanger, one row per player per level, for the
   exit report: defense (every level keeps its book in GameChanger) and a baseline for
   2026, the season before the apps. Jim: "Yes, let's go ahead and import the 2026 season
   for a baseline."

   The page (?p=import) reads the file IN THE BROWSER (SheetJS) and sends each sheet as a
   grid; everything else happens here so the tests can run it:
     importPreview_  finds the header, reads each column BY NAME inside its group
                     (Batting / Pitching / Fielding: SB, CS, PIK and CI are in more than
                     one), matches names to the Players tab, and lists what needs a coach.
     importCommit    writes the GameChanger tab (replacing that season's rows for those
                     levels) and remembers every link on GC_Links.
   Rules: match on last + first name only (numbers change between levels); never guess,
   a row it can't match waits for a coach to pick; a row with no last name is skipped;
   Totals becomes the TEAM row; Glossary and blank rows are ignored. Writing needs edit
   access to the season Sheet, so a coach who can only view it can preview but not save.
   Annual reset: keep the GameChanger and GC_Links tabs in the new season's Sheet.
   1.4 (Nov 13): a second GameChanger row for the same player on one level (GameChanger
   listed him twice, e.g. "Lythgoe, Landon" #12 and "Lythgoe" #13) can be ADDED to his row:
   counts are summed and the rates worked out again, one row is written. Such a choice, a
   skip of a duplicate row, a changed answer, or a name that got different answers on two
   levels is remembered for that season and level only (GC_Links Season + Level); every
   other pick is remembered for the name, as before. Remembered rows can be changed. */

var GC_TAB = "GameChanger", GC_LINKS = "GC_Links";
var GC_NOT = "NOT ON ROSTER", GC_SKIP = "SKIP", GC_ADD = "ADD:";
/* [stored column, group, GameChanger header (any spelling), kind]; kind "outs" = innings in
   baseball notation (39.2 = 39 and 2/3) stored as outs. QAB is left out on purpose:
   GameChanger's definition is not ours. */
var GC_COLS = [
  ["Bat GP", "Batting", "GP"], ["Bat PA", "Batting", "PA"], ["Bat AB", "Batting", "AB"], ["Bat H", "Batting", "H"],
  ["Bat 1B", "Batting", "1B"], ["Bat 2B", "Batting", "2B"], ["Bat 3B", "Batting", "3B"], ["Bat HR", "Batting", "HR"],
  ["Bat RBI", "Batting", "RBI"], ["Bat R", "Batting", "R"], ["Bat BB", "Batting", "BB"], ["Bat SO", "Batting", "SO"],
  ["Bat HBP", "Batting", "HBP"], ["Bat SAC", "Batting", "SAC"], ["Bat SF", "Batting", "SF"], ["Bat SB", "Batting", "SB"],
  ["Bat CS", "Batting", "CS"], ["Bat AVG", "Batting", "AVG"], ["Bat OBP", "Batting", "OBP"], ["Bat SLG", "Batting", "SLG"],
  ["Bat OPS", "Batting", "OPS"],
  ["Pit Outs", "Pitching", "IP", "outs"], ["Pit GP", "Pitching", "GP"], ["Pit GS", "Pitching", "GS"], ["Pit BF", "Pitching", "BF"],
  ["Pit Pitches", "Pitching", "#P"], ["Pit W", "Pitching", "W"], ["Pit L", "Pitching", "L"], ["Pit SV", "Pitching", "SV"],
  ["Pit H", "Pitching", "H"], ["Pit R", "Pitching", "R"], ["Pit ER", "Pitching", "ER"], ["Pit BB", "Pitching", "BB"],
  ["Pit SO", "Pitching", "SO"], ["Pit HBP", "Pitching", "HBP"], ["Pit WP", "Pitching", "WP"], ["Pit ERA", "Pitching", "ERA"],
  ["Pit WHIP", "Pitching", "WHIP"], ["Pit Strike%", "Pitching", "S%"], ["Pit FPS%", "Pitching", "FPS%"],
  ["Fld TC", "Fielding", "TC"], ["Fld PO", "Fielding", "PO"], ["Fld A", "Fielding", "A"], ["Fld E", "Fielding", "E"],
  ["Fld FPCT", "Fielding", "FPCT"], ["Fld DP", "Fielding", "DP"], ["Fld TP", "Fielding", "TP"],
  ["Catch Outs", "Fielding", "INN", "outs"], ["Catch PB", "Fielding", "PB"], ["Catch SB", "Fielding", "SB"],
  ["Catch SB Att", "Fielding", "SBATT", "att"], ["Catch CS", "Fielding", "CS"], ["Catch CS%", "Fielding", "CS%"],
  ["Catch PIK", "Fielding", "PIK"], ["Catch CI", "Fielding", "CI"],
  ["Outs P", "Fielding", "P", "outs"], ["Outs C", "Fielding", "C", "outs"], ["Outs 1B", "Fielding", "1B", "outs"],
  ["Outs 2B", "Fielding", "2B", "outs"], ["Outs 3B", "Fielding", "3B", "outs"], ["Outs SS", "Fielding", "SS", "outs"],
  ["Outs LF", "Fielding", "LF", "outs"], ["Outs CF", "Fielding", "CF", "outs"], ["Outs RF", "Fielding", "RF", "outs"],
  ["Outs SF", "Fielding", "SF", "outs"], ["Outs Total", "Fielding", "TOTAL", "outs"]
];
var GC_HEAD = ["Season", "Level", "PlayerID", "Last", "First", "Number", "Status", "ImportedAt", "ImportedBy"]
  .concat(GC_COLS.map(function (c) { return c[0]; }));
var GC_LINK_HEAD = ["Last", "First", "PlayerID", "Linked by", "Linked at", "Season", "Level"];
/* Rates are worked out again when 2 rows are added together; everything else is summed. */
var GC_RATE = {"Bat AVG": 1, "Bat OBP": 1, "Bat SLG": 1, "Bat OPS": 1, "Pit ERA": 1, "Pit WHIP": 1, "Pit Strike%": 1, "Pit FPS%": 1, "Fld FPCT": 1, "Catch CS%": 1};

/* "Freshmen", "Legend JV Stats.csv", "Junior Varsity", "Soph" -> the level; "" when it can't tell. */
function gcLevel_(name) {
  var t = " " + String(name || "").toLowerCase().replace(/[^a-z]+/g, " ") + " ";
  if (/ (jv|junior varsity) /.test(t)) return "JV";
  if (/ varsity /.test(t) || / v /.test(t)) return "Varsity";
  if (/ (soph|sophomores?) /.test(t)) return "Sophomore";
  if (/ (fresh|freshm[ae]n|frosh) /.test(t)) return "Freshman";
  return "";
}
function gcHead_(v) { return String(v == null ? "" : v).toUpperCase().replace(/[\s\-_]/g, ""); }
function gcKey_(last, first) {
  var k = function (v) { return String(v == null ? "" : v).toLowerCase().replace(/[^a-z]/g, ""); };
  return k(last) + "|" + k(first);
}
/* "-", "N/A", "0-0" and blanks are no value; innings in baseball notation become outs.
   Steal attempts come 2 ways: a count (SBATT), or "stolen-attempts" (SB-ATT, "13-18" = 18),
   and Excel turns a "1-1" into the date Jan 1, which reaches us as a date serial number. */
function gcVal_(v, kind) {
  if (v === null || v === undefined) return "";
  var t = String(v).trim();
  if (kind === "att") {
    var a = t.match(/^(\d+)-(\d+)$/);
    if (a) return +a[2];
    if (/^\d{5}(\.0+)?$/.test(t)) return new Date((+t - 25569) * 86400000).getUTCDate();
  }
  if (t === "" || t === "-" || /^n\/?a$/i.test(t) || /^\d+-\d+$/.test(t)) return "";
  var n = Number(t);
  if (!isFinite(n)) return "";
  if (kind === "outs") {
    var m = t.match(/^(\d+)(?:\.(\d))?$/);
    if (!m || +(m[2] || 0) > 2) return "";
    return +m[1] * 3 + +(m[2] || 0);
  }
  return n;
}
function gcOutsText_(o) { return o === "" || o == null ? "" : Math.floor(o / 3) + (o % 3 ? "." + (o % 3) : ""); }

/* One sheet's grid -> its rows. Throws a plain-English message if it isn't a stats export. */
function gcParse_(grid) {
  var hr = -1;
  for (var i = 0; i < Math.min(grid.length, 10); i++) {
    var h = (grid[i] || []).map(gcHead_);
    if (h.indexOf("LAST") >= 0 && h.indexOf("FIRST") >= 0) { hr = i; break; }
  }
  if (hr < 1) throw new Error("no Number / Last / First header with Batting, Pitching and Fielding labels above it");
  var head = grid[hr].map(gcHead_), labels = grid[hr - 1] || [], group = [], cur = "";
  for (var c = 0; c < head.length; c++) {
    var lab = String(labels[c] == null ? "" : labels[c]).trim();
    if (lab) cur = lab.charAt(0).toUpperCase() + lab.slice(1).toLowerCase();
    group.push(cur);
  }
  ["Batting", "Pitching", "Fielding"].forEach(function (g) {
    if (group.indexOf(g) < 0) throw new Error("no " + g + " columns");
  });
  var at = {};
  head.forEach(function (h, c) { var k = group[c] + "|" + h; if (!(k in at)) at[k] = c; });
  var colOf = {}, missing = [];
  GC_COLS.forEach(function (d) {
    var k = d[1] + "|" + gcHead_(d[2]);
    if (k in at) colOf[d[0]] = at[k]; else missing.push(d[1] + " " + d[2]);
  });
  var iNum = head.indexOf("NUMBER"), iLast = head.indexOf("LAST"), iFirst = head.indexOf("FIRST");
  var rows = [];
  for (var r = hr + 1; r < grid.length; r++) {
    var row = grid[r] || [], first0 = String(row[0] == null ? "" : row[0]).trim();
    if (/^glossary$/i.test(first0)) break;
    var last = String(row[iLast] == null ? "" : row[iLast]).trim(), first = String(row[iFirst] == null ? "" : row[iFirst]).trim();
    var num = iNum >= 0 ? String(row[iNum] == null ? "" : row[iNum]).trim() : "";
    var team = /^totals?$/i.test(first0);
    var empty = row.every(function (v) { return v === null || v === undefined || String(v).trim() === ""; });
    if (empty) continue;
    var vals = {};
    GC_COLS.forEach(function (d) { vals[d[0]] = d[0] in colOf ? gcVal_(row[colOf[d[0]]], d[3]) : ""; });
    rows.push({line: r + 1, team: team, number: team ? "" : num, last: team ? "" : last, first: team ? "" : first, vals: vals});
  }
  return {rows: rows, missing: missing};
}

function gcPlayers_(ss) {
  return rows_(ss, "Players").filter(function (p) { return s_(p.PlayerID); }).map(function (p) {
    return {id: s_(p.PlayerID), last: s_(p.Last), first: s_(p.First), cls: s_(p.Class)};
  });
}
/* name: "last|first" -> answer, for any season and level; at: "season|level|last|first" -> answer
   for that season and level only, which wins. */
function gcLinks_(ss) {
  var m = {name: {}, at: {}};
  rows_(ss, GC_LINKS).forEach(function (r) {
    if (!s_(r.PlayerID)) return;
    var k = gcKey_(r.Last, r.First), se = s_(r.Season).trim(), lv = s_(r.Level).trim();
    if (se && lv) m.at[se + "|" + lv + "|" + k] = s_(r.PlayerID); else m.name[k] = s_(r.PlayerID);
  });
  return m;
}
/* Two GameChanger rows for one player on one level -> one row: counts summed, rates again. */
function gcAdd_(a, b) {
  var o = {}, n = function (x) { return x === "" || x == null ? 0 : Number(x); }, has = function (k) { return a[k] !== "" && a[k] != null || b[k] !== "" && b[k] != null; };
  GC_COLS.forEach(function (c) { var k = c[0]; if (!GC_RATE[k]) o[k] = has(k) ? n(a[k]) + n(b[k]) : ""; });
  var div = function (x, y, d) { return y > 0 ? Math.round(x / y * Math.pow(10, d)) / Math.pow(10, d) : ""; };
  var wavg = function (k, w) {          /* GameChanger's own rate, weighted, keeps its conventions */
    var t = 0, ww = 0;
    [a, b].forEach(function (r) { if (r[k] !== "" && r[k] != null && n(r[w]) > 0) { t += n(r[k]) * n(r[w]); ww += n(r[w]); } });
    return ww ? Math.round(t / ww * 1000) / 1000 : "";
  };
  var H = n(o["Bat H"]), AB = n(o["Bat AB"]), obpD = AB + n(o["Bat BB"]) + n(o["Bat HBP"]) + n(o["Bat SF"]);
  o["Bat AVG"] = div(H, AB, 3);
  o["Bat OBP"] = div(H + n(o["Bat BB"]) + n(o["Bat HBP"]), obpD, 3);
  o["Bat SLG"] = div(n(o["Bat 1B"]) + 2 * n(o["Bat 2B"]) + 3 * n(o["Bat 3B"]) + 4 * n(o["Bat HR"]), AB, 3);
  o["Bat OPS"] = o["Bat OBP"] === "" || o["Bat SLG"] === "" ? "" : Math.round((o["Bat OBP"] + o["Bat SLG"]) * 1000) / 1000;
  o["Pit ERA"] = wavg("Pit ERA", "Pit Outs");
  o["Pit WHIP"] = div(n(o["Pit BB"]) + n(o["Pit H"]), n(o["Pit Outs"]) / 3, 3);
  o["Pit Strike%"] = wavg("Pit Strike%", "Pit Pitches");
  o["Pit FPS%"] = wavg("Pit FPS%", "Pit BF");
  o["Fld FPCT"] = div(n(o["Fld PO"]) + n(o["Fld A"]), n(o["Fld TC"]), 3);
  o["Catch CS%"] = n(o["Catch SB Att"]) > 0 ? Math.round(n(o["Catch CS"]) / n(o["Catch SB Att"]) * 10000) / 100 : "";
  return o;
}
/* A spelling a coach might mean: same last name, or same first name with a close last name. */
function gcSuggest_(players, last, first) {
  var L = gcKey_(last, "").split("|")[0], F = gcKey_("", first).split("|")[1];
  function close(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 2) return false;
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length] <= 2;
  }
  return players.filter(function (p) {
    var pl = gcKey_(p.last, "").split("|")[0], pf = gcKey_("", p.first).split("|")[1];
    if (pl === L) return !F || !pf || pf.charAt(0) === F.charAt(0);
    return close(pl, L) && (!F || pf === F || pf.charAt(0) === F.charAt(0));
  }).slice(0, 3);
}

/* payload = {season, sheets: [{name, level, grid}]}. Returns everything the page shows. */
function importPreview_(ss, payload) {
  var season = String(payload && payload.season || "").trim();
  if (!/^20\d\d$/.test(season)) throw new Error("Pick the season the stats are from.");
  var players = gcPlayers_(ss), links = gcLinks_(ss), byName = {}, byId = {};
  players.forEach(function (p) { (byName[gcKey_(p.last, p.first)] = byName[gcKey_(p.last, p.first)] || []).push(p); byId[p.id] = p; });
  var out = {season: season, sheets: [], rows: [], players: players.map(function (p) { return {id: p.id, name: p.first + " " + p.last, cls: p.cls}; })
               .sort(function (a, b) { return a.name.localeCompare(b.name); })};
  (payload.sheets || []).forEach(function (sh, si) {
    var level = gcLevel_(sh.level || sh.name), info = {i: si, name: String(sh.name || "Sheet " + (si + 1)), level: level};
    out.sheets.push(info);
    try { var p = gcParse_(sh.grid || []); } catch (x) { info.error = "Not a GameChanger stats export: " + x.message + "."; return; }
    info.missing = p.missing;
    if (!level) { info.error = "Which level is this sheet? Pick one."; return; }
    var seen = {}, rs = [];
    p.rows.forEach(function (r) {
      var row = {key: si + ":" + r.line, sheet: si, level: level, line: r.line, number: r.number, last: r.last, first: r.first, team: r.team};
      if (r.team) { row.status = "team"; row.playerId = "TEAM"; }
      else if (!r.last) { row.status = "skip"; row.reason = "No name in GameChanger" + (r.number ? " (#" + r.number + ")" : ""); }
      else {
        var k = gcKey_(r.last, r.first), hit = byName[k] || [], ak = season + "|" + level + "|" + k, ln = links.at[ak] || links.name[k];
        if (ln) {
          row.playerId = ln; row.remembered = true; if (links.at[ak]) row.here = true;
          row.status = ln === GC_NOT ? "not" : ln === GC_SKIP ? "skip" : byId[ln] ? "linked" : "pick";
          if (row.status === "skip") row.reason = "Skipped before";
          if (row.status === "pick") row.remembered = false;
        } else if (hit.length === 1) { row.status = "match"; row.playerId = hit[0].id; }
        else { row.status = "pick"; row.suggest = gcSuggest_(players, r.last, r.first).map(function (q) { return q.id; }); }
        if (row.status === "pick") row.playerId = "";
        if (hit.length > 1 && !ln) row.reason = "2 players on the roster have this name";
      }
      row.vals = r.vals;
      rs.push(row);
    });
    /* one row per player per level; a row remembered for this season and level that points at
       a player already on the sheet is his second GameChanger row, added to the first */
    var ply = function (x) { return x.playerId && x.playerId !== GC_NOT && x.playerId !== GC_SKIP && x.playerId !== "TEAM"; };
    rs.forEach(function (x) {
      if (!ply(x) || x.here) return;
      if (seen[x.playerId]) { x.status = "pick"; x.reason = "Already matched to row " + seen[x.playerId] + " on this sheet"; x.playerId = ""; x.remembered = false; x.dup = true; }
      else seen[x.playerId] = x.line;
    });
    rs.forEach(function (x) {
      if (!ply(x) || !x.here) return;
      if (seen[x.playerId]) { x.status = "add"; x.addTo = seen[x.playerId]; x.reason = "Added to row " + seen[x.playerId]; }
      else seen[x.playerId] = x.line;
    });
    rs.forEach(function (x) { out.rows.push(x); });
  });
  return out;
}
function importPreview(payload) { return gcPublic_(importPreview_(gcBook_(), payload)); }
/* The page gets names and statuses, not every stat. */
function gcPublic_(o) {
  return {season: o.season, sheets: o.sheets, players: o.players,
          rows: o.rows.map(function (r) { var x = {}; for (var k in r) if (k !== "vals") x[k] = r[k]; return x; })};
}
function gcBook_() {
  var me = "";
  try { me = String(Session.getActiveUser().getEmail() || "").toLowerCase().trim(); } catch (x) {}
  var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("SEASON_SHEET_ID"));
  var coach = rows_(ss, "Coaches").filter(function (r) { return me && String(r["Google account"] || "").toLowerCase().trim() === me; })[0];
  if (!coach) throw new Error("This account is not on the Coaches tab.");
  return ss;
}

/* picks = {rowKey: PlayerID | "NOT ON ROSTER" | "SKIP" | "ADD:" + PlayerID} for every row the
   preview left to a coach, plus any remembered row a coach changed. */
function importCommit(payload, picks) { return importCommit_(gcBook_(), payload, picks || {}); }
function importCommit_(ss, payload, picks) {
  var pv = importPreview_(ss, payload), me = "";
  try { me = String(Session.getActiveUser().getEmail() || "").toLowerCase().trim(); } catch (x) {}
  var bad = pv.sheets.filter(function (s) { return s.error; });
  if (bad.length) throw new Error(bad.map(function (s) { return s.name + ": " + s.error; }).join(" "));
  var ids = {};
  pv.players.forEach(function (p) { ids[p.id] = 1; });
  var waiting = [], newLinks = [], used = {}, adds = [];
  var nm = function (r) { return r.last + (r.first ? ", " + r.first : "") + " (" + r.level + ")"; };
  pv.rows.forEach(function (r) {
    var pick = String(picks[r.key] || "");
    var change = pick && r.remembered && (r.status === "linked" || r.status === "not" || r.status === "skip" || r.status === "add");
    if (r.status === "pick" || change) {
      var add = pick.indexOf(GC_ADD) === 0 ? pick.slice(GC_ADD.length) : "";
      if (!(ids[pick] || pick === GC_NOT || pick === GC_SKIP || ids[add])) { waiting.push(nm(r)); return; }
      r.playerId = add || pick; r.status = add ? "add" : pick === GC_NOT ? "not" : pick === GC_SKIP ? "skip" : "linked";
      /* for this season and level only: an added row, a duplicate's answer, a changed answer */
      newLinks.push({last: r.last, first: r.first, id: add || pick, here: !!(add || r.dup || change), season: pv.season, level: r.level});
    }
  });
  pv.rows.forEach(function (r) {   /* one row per player per level; an added row needs one to go into */
    if (!ids[r.playerId] || r.status === "add") return;
    var u = r.level + "|" + r.playerId;
    if (used[u]) waiting.push(r.last + ", " + r.first + " (" + r.level + "): same player as " + used[u].last + ", " + used[u].first + ". To put both rows together, pick Add to " + used[u].first + " " + used[u].last);
    else used[u] = r;
  });
  pv.rows.forEach(function (r) {
    if (r.status !== "add") return;
    var t = used[r.level + "|" + r.playerId];
    if (!t) waiting.push(nm(r) + ": no other row for that player on " + r.level + " to add it to");
    else adds.push([r, t]);
  });
  if (waiting.length) throw new Error("Still to pick: " + waiting.join("; ") + ".");
  /* a name that got different answers on 2 levels is remembered per level, not for the name */
  var ans = {};
  newLinks.forEach(function (l) { if (!l.here) { var k = gcKey_(l.last, l.first); (ans[k] = ans[k] || {})[l.id] = 1; } });
  newLinks.forEach(function (l) { if (!l.here && Object.keys(ans[gcKey_(l.last, l.first)]).length > 1) l.here = true; });
  adds.forEach(function (x) {
    x[1].vals = gcAdd_(x[1].vals, x[0].vals);
    x[1].number = [x[1].number, x[0].number].filter(function (v) { return v !== "" && v != null; }).join(", ");
  });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var now = new Date().toISOString(), levels = {};
    pv.sheets.forEach(function (s) { levels[s.level] = 1; });
    var add = pv.rows.filter(function (r) { return r.status !== "skip" && r.status !== "add"; }).map(function (r) {
      var st = {match: "Matched", linked: "Linked", not: "Not on roster", team: "Team totals"}[r.status];
      return [pv.season, r.level, r.playerId === GC_NOT ? "" : r.playerId, r.last, r.first, r.number, st, now, me]
        .concat(GC_COLS.map(function (c) { return r.vals[c[0]]; }));
    });
    var sh = gcTab_(ss, GC_TAB, GC_HEAD), keep = [], old = 0;
    if (sh.getLastRow() > 1) {
      var have = sh.getRange(1, 1, sh.getLastRow(), GC_HEAD.length).getValues();
      old = have.length - 1;
      keep = have.slice(1).filter(function (r) { return !(String(r[0]) === pv.season && levels[String(r[1])]); });
    }
    var all = keep.concat(add);
    if (all.length) sh.getRange(2, 1, all.length, GC_HEAD.length).setValues(all);
    if (old > all.length) sh.deleteRows(2 + all.length, old - all.length);
    if (newLinks.length) {
      var lk = gcTab_(ss, GC_LINKS, GC_LINK_HEAD);
      lk.getRange(1, 1, 1, GC_LINK_HEAD.length).setValues([GC_LINK_HEAD]);   /* a 1.3 tab gains Season and Level */
      var cur = lk.getLastRow() > 1 ? lk.getRange(1, 1, lk.getLastRow(), GC_LINK_HEAD.length).getValues().slice(1) : [];
      var at = {}, akey = function (last, first, se, lv) { return (se && lv ? s_(se) + "|" + lv : "") + "#" + gcKey_(last, first); };
      cur.forEach(function (r, i) { at[akey(r[0], r[1], String(r[5] || "").trim(), String(r[6] || "").trim())] = i; });
      newLinks.forEach(function (l) {
        var row = [l.last, l.first, l.here ? l.id : l.id, me, now, l.here ? l.season : "", l.here ? l.level : ""], k = akey(l.last, l.first, row[5], row[6]);
        if (k in at) cur[at[k]] = row; else { at[k] = cur.length; cur.push(row); }
      });
      lk.getRange(2, 1, cur.length, GC_LINK_HEAD.length).setValues(cur);
    }
  } catch (x) {
    if (/permission|access|denied|edit/i.test(String(x && x.message))) throw new Error("Saving needs edit access to the season Sheet. Ask Jim.");
    throw x;
  } finally { lock.releaseLock(); }
  var count = function (st) { return add.filter(function (r) { return r[6] === st; }).length; };
  return {season: pv.season, levels: Object.keys(levels), players: count("Matched") + count("Linked"),
          notOnRoster: count("Not on roster"), team: count("Team totals"), skipped: pv.rows.length - add.length - adds.length, added: adds.length, links: newLinks.length};
}
function gcTab_(ss, name, head) {
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); }
  if (sh.getLastRow() < 1) { sh.getRange(1, 1, 1, head.length).setValues([head]); sh.setFrozenRows(1); }
  return sh;
}

/* What's loaded, by season and level, for the page. */
function gcLoaded_(ss) {
  var m = {};
  rows_(ss, GC_TAB).forEach(function (r) {
    var k = s_(r.Season) + "|" + s_(r.Level), x = m[k] = m[k] || {season: s_(r.Season), level: s_(r.Level), players: 0, at: s_(r.ImportedAt)};
    if (s_(r.Status) === "Matched" || s_(r.Status) === "Linked") x.players++;
  });
  return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) {
    return a.season === b.season ? LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) : b.season.localeCompare(a.season); });
}
function selfUrl_() { try { return ScriptApp.getService().getUrl(); } catch (x) { return ""; } }

function importPage_(ss) {
  var yr = new Date().getFullYear(), seasons = [yr + 1, yr, yr - 1];
  var loaded = gcLoaded_(ss);
  var have = loaded.length ? "<table><tr><th>Season</th><th>Level</th><th class=\"c\">Players</th><th>Imported</th></tr>" +
    loaded.map(function (x) { return "<tr><td>" + e_(x.season) + "</td><td>" + e_(x.level) + '</td><td class="c">' + x.players +
      "</td><td>" + e_(shortDate_(dstr_(x.at))) + "</td></tr>"; }).join("") + "</table>"
    : '<p class="note">Nothing imported yet.</p>';
  var head = '<div class="head"><div class="org">Legend Titans &middot; Coaches</div><h1>Import GameChanger Stats</h1>' +
    '<p>Season totals for every player, from a GameChanger Export Stats file (.csv) or a workbook with one sheet per level.</p>' +
    '<p><a href="' + e_(selfUrl_()) + '">&larr; Back to the dashboard</a></p></div>';
  var form = '<div class="card"><h2>1 &middot; Pick the file</h2>' +
    '<p class="lead">Export from GameChanger with <b>no filters on</b> (no home/away or wins/losses). Name each sheet after its level, or pick the level below.</p>' +
    '<p><label>Season <select id="season">' + seasons.map(function (y) { return "<option" + (y === yr - 1 ? " selected" : "") + ">" + y + "</option>"; }).join("") +
    '</select></label></p><p><input type="file" id="file" accept=".xlsx,.xls,.csv"></p><p id="msg" class="note"></p></div>' +
    '<div id="review"></div>' +
    '<div class="card"><h2>Already imported</h2>' + have + "</div>" +
    '<p class="foot">' + e_(VERSION) + "</p>";
  var css = "<style>.st{display:inline-block;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:700}" +
    ".st.match,.st.linked,.st.add{background:#E2F2E9;color:#1B7043}select.chg{display:block;font-size:12px;padding:2px;margin-top:4px;max-width:100%}.st.pick{background:#FBE3D2;color:#B83227}.st.not,.st.skip,.st.team{background:#ECEFF5;color:#5A6781}" +
    "select{font-size:14px;padding:4px}button{font-size:15px;font-weight:700;padding:10px 18px;border-radius:8px;border:0;background:#16305C;color:#fff;cursor:pointer}" +
    "button.alt{background:#fff;color:#16305C;border:1px solid #16305C}button[disabled]{opacity:.4;cursor:default}.err{color:#B83227;font-weight:700}</style>";
  var js = '<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script><script>' + IMPORT_JS + "</script>";
  return css + head + form + js;
}

/* The page's script: read the file, preview, let the coach pick, then save. */
var IMPORT_JS = [
  "var LEVELS=" + JSON.stringify(["Varsity", "JV", "Sophomore", "Freshman"]) + ",NOT=" + JSON.stringify("NOT ON ROSTER") + ",SKIP=" + JSON.stringify("SKIP") + ",ADD=" + JSON.stringify("ADD:") + ";",
  "var payload=null,pv=null;",
  "function h(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');}",
  "function msg(t,err){var m=document.getElementById('msg');m.innerHTML=t;m.className=err?'note err':'note';}",
  "document.getElementById('file').addEventListener('change',function(ev){",
  " var f=ev.target.files[0];if(!f)return;msg('Reading '+h(f.name)+'&hellip;');",
  " var rd=new FileReader();rd.onload=function(){try{",
  "  var wb=XLSX.read(new Uint8Array(rd.result),{type:'array'});",
  "  payload={season:document.getElementById('season').value,sheets:wb.SheetNames.map(function(n){",
  "   return {name:/\\.csv$/i.test(f.name)&&wb.SheetNames.length===1?f.name:n,level:'',grid:XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:''})};})};",
  "  preview();}catch(e){msg('Could not read that file: '+h(e.message),1);}};rd.readAsArrayBuffer(f);});",
  "document.getElementById('season').addEventListener('change',function(){if(payload){payload.season=this.value;preview();}});",
  "function preview(){msg('Matching names to the roster&hellip;');google.script.run.withSuccessHandler(show).withFailureHandler(function(e){msg(h(e.message||e),1);}).importPreview(payload);}",
  "function pname(id){for(var i=0;i<pv.players.length;i++)if(pv.players[i].id===id)return pv.players[i].name;return id;}",
  "/* the choices for a row: add to another row of the same player (GameChanger listed him twice), close spellings, not on roster, skip, everyone */",
  "function opts(x,rs){var sg=(x.suggest||[]),o='';",
  " var tg=rs.filter(function(y){return y!==x&&(y.status==='match'||y.status==='linked')&&y.playerId;});",
  " var ad=tg.length?'<optgroup label=\"Same player, listed twice in GameChanger\">'+tg.map(function(y){return '<option value=\"'+ADD+h(y.playerId)+'\">Add to '+h(pname(y.playerId))+(y.number!==''?' (#'+h(y.number)+')':'')+'</option>';}).join('')+'</optgroup>':'';",
  " if(x.dup)o+=ad;",
  " if(sg.length)o+='<optgroup label=\"Close spellings\">'+sg.map(function(id){return '<option value=\"'+h(id)+'\">'+h(pname(id))+'</option>';}).join('')+'</optgroup>';",
  " o+='<option value=\"'+NOT+'\">Not on the roster (graduated or left)</option><option value=\"'+SKIP+'\">Skip this row</option>';",
  " if(!x.dup)o+=ad;",
  " return o+'<optgroup label=\"Everyone\">'+pv.players.map(function(p){return '<option value=\"'+h(p.id)+'\">'+h(p.name)+(p.cls?' ('+h(p.cls)+')':'')+'</option>';}).join('')+'</optgroup>';}",
  "function show(r){pv=r;msg('');var o='<div class=\"card\"><h2>2 &middot; Check the names</h2>';",
  " r.sheets.forEach(function(s){var rs=r.rows.filter(function(x){return x.sheet===s.i;});",
  "  o+='<h2 style=\"margin-top:16px\">'+h(s.name)+(s.level?' &middot; '+h(s.level):'')+'</h2>';",
  "  if(s.error&&!s.level&&!/Not a GameChanger/.test(s.error)){o+='<p>Level: <select data-sheet=\"'+s.i+'\" class=\"lvl\"><option value=\"\">Choose&hellip;</option>'+LEVELS.map(function(l){return '<option>'+l+'</option>';}).join('')+'</select></p>';return;}",
  "  if(s.error){o+='<p class=\"err\">'+h(s.error)+'</p>';return;}",
  "  if(s.missing&&s.missing.length)o+='<p class=\"note\">Not in this file (left blank): '+h(s.missing.join(', '))+'</p>';",
  "  var c={};rs.forEach(function(x){c[x.status]=(c[x.status]||0)+1;});",
  "  o+='<p>'+(c.match||0)+' matched &middot; '+(c.linked||0)+' linked before &middot; '+(c.add?c.add+' added to another row &middot; ':'')+(c.not||0)+' not on roster &middot; '+(c.skip||0)+' skipped'+(c.pick?' &middot; <b class=\"err\">'+c.pick+' to pick</b>':'')+'</p>';",
  "  o+='<div class=\"scroll\"><table><tr><th>#</th><th>GameChanger name</th><th>Status</th><th>Roster player</th></tr>';",
  "  rs.forEach(function(x){if(x.status==='team')return;var nm=h(x.last)+(x.first?', '+h(x.first):'');",
  "   var lab={match:'Matched',linked:'Linked',not:'Not on roster',skip:'Skipped',pick:'Pick',add:'Added'}[x.status];var cell='';",
  "   if(x.status==='pick'){cell='<select class=\"pick\" data-key=\"'+h(x.key)+'\"><option value=\"\">Choose&hellip;</option>'+opts(x,rs)+'</select>'+(x.reason?' <span class=\"note\">'+h(x.reason)+'</span>':'');}",
  "   else if(x.status==='add')cell=h(pname(x.playerId))+' <span class=\"note\">'+h(x.reason||'')+'</span>';",
  "   else if(x.playerId&&x.status!=='not'&&x.status!=='skip')cell=h(pname(x.playerId));else cell='<span class=\"dim\">'+h(x.reason||'')+'</span>';",
  "   if(x.remembered)cell+='<select class=\"chg\" data-key=\"'+h(x.key)+'\" title=\"Change what was picked before\"><option value=\"\">Keep</option>'+opts(x,rs)+'</select>';",
  "   o+='<tr><td>'+h(x.number)+'</td><td>'+nm+'</td><td><span class=\"st '+x.status+'\">'+lab+'</span></td><td>'+cell+'</td></tr>';});",
  "  o+='</table></div>';});",
  " var any=r.rows.some(function(x){return x.status==='pick';}),bad=r.sheets.some(function(s){return s.error;});",
  " o+='<p style=\"margin-top:14px\">'+(any?'<button class=\"alt\" id=\"rest\">Mark the rest not on the roster</button> ':'')+'<button id=\"save\">Import '+h(r.season)+'</button></p><p id=\"done\" class=\"note\"></p></div>';",
  " document.getElementById('review').innerHTML=o;",
  " Array.prototype.forEach.call(document.querySelectorAll('select.lvl'),function(s){s.addEventListener('change',function(){payload.sheets[+s.getAttribute('data-sheet')].level=s.value;preview();});});",
  " Array.prototype.forEach.call(document.querySelectorAll('select.pick'),function(s){s.addEventListener('change',ready);});",
  " var rb=document.getElementById('rest');if(rb)rb.addEventListener('click',function(){Array.prototype.forEach.call(document.querySelectorAll('select.pick'),function(s){if(!s.value)s.value=NOT;});ready();});",
  " document.getElementById('save').addEventListener('click',save);document.getElementById('save').disabled=bad;ready();}",
  "function ready(){var b=document.getElementById('save');if(!b)return;var left=Array.prototype.filter.call(document.querySelectorAll('select.pick'),function(s){return !s.value;}).length;",
  " b.disabled=left>0||pv.sheets.some(function(s){return s.error;});document.getElementById('done').innerHTML=left?left+' still to pick.':'';}",
  "function save(){var picks={};Array.prototype.forEach.call(document.querySelectorAll('select.pick,select.chg'),function(s){if(s.value)picks[s.getAttribute('data-key')]=s.value;});",
  " var b=document.getElementById('save');b.disabled=true;document.getElementById('done').innerHTML='Saving&hellip;';",
  " google.script.run.withSuccessHandler(function(x){document.getElementById('done').innerHTML='<b>Imported '+h(x.season)+'</b> ('+h(x.levels.join(', '))+'): '+x.players+' players, '+(x.added?x.added+' added to another row, ':'')+x.notOnRoster+' not on the roster, '+x.skipped+' skipped. Reload to see it under Already imported.';})",
  "  .withFailureHandler(function(e){b.disabled=false;document.getElementById('done').innerHTML='<span class=\"err\">'+h(e.message||e)+'</span>';}).importCommit(payload,picks);}"
].join("\n");
