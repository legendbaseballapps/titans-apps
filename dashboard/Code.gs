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

var VERSION = "dashboard 1 (Nov 2026)";

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
  return page_(overview_(compute_(ss), coach));
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
  var rows = c.games.slice(0, 15).map(function (g) {
    var s = Math.round(g.saved);
    return "<tr><td>" + e_(shortDate_(g.date)) + "</td><td>" + e_(g.level) + "</td><td>" + e_(g.opp || "") + "</td>" +
      '<td class="c">' + g.free + '</td><td class="c">' + g.bf + '</td><td class="c ' + (s >= 0 ? "pos" : "neg") + '">' + (s > 0 ? "+" : "") + s + "</td>" +
      '<td class="c">' + (g.won ? '<span class="ok">&#10003;</span>' : '<span class="ring"></span>') + "</td></tr>";
  }).join("");
  var battle = '<div class="card"><h2>The free-base battle</h2><p class="lead"><b>' + c.won + " of " + c.games.length +
    "</b> games at " + S.budget + " free bases or fewer (2026 average: 5.3)</p>" +
    '<div class="scroll"><table><thead><tr><th>Date</th><th>Team</th><th>Opponent</th><th class="c">Free bases</th>' +
    '<th class="c">Batters</th><th class="c">Saved</th><th class="c">' + S.budget + ' or fewer</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
    (c.games.length > 15 ? '<p class="note">Newest 15 of ' + c.games.length + " games.</p>" : "") + "</div>";

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

  return head + counter + '<div class="two">' + shareCard + battle + "</div>" + goals +
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
    ".two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 12px}.two .card{margin-top:12px;min-width:0}" +
    "@media(max-width:860px){.two{grid-template-columns:minmax(0,1fr)}}" +
    ".lvrow{display:grid;grid-template-columns:120px 1fr 120px;gap:12px;align-items:center;margin:12px 0}" +
    "@media(max-width:500px){.lvrow{grid-template-columns:92px 1fr 84px;gap:8px}}" +
    ".lvname{font-weight:700}.lvname span,.lvnum span{display:block;font-size:12px;font-weight:400;color:#5A6781}.lvnum{text-align:right;font-weight:700}" +
    ".note{font-size:12.5px;color:#5A6781;margin:10px 0 0;line-height:1.45}.lead{margin:0 0 8px}.foot{font-size:11px;color:#8A93A6;text-align:right}" +
    ".scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}" +
    "th{font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:#5A6781;text-align:left;padding:6px;border-bottom:1px solid #D2D9E6}" +
    "td{padding:7px 6px;border-bottom:1px solid #F4F6FA;white-space:nowrap}.c{text-align:center}" +
    ".pos{color:#1F7A4A;font-weight:700}.neg{color:#C85C1C;font-weight:700}.dim{color:#8A93A6}" +
    ".gname span{display:block;font-size:12px;color:#5A6781;white-space:normal}.prog{background:#F4F6FA}" +
    ".ok{color:#1F7A4A;font-weight:800}.ring{display:inline-block;width:9px;height:9px;border:2px solid #8FB8E8;border-radius:50%;vertical-align:-1px}" +
    "@media print{body{background:#fff}.card,.head{break-inside:avoid;border-color:#bbb}}" +
    '</style></head><body><div class="wrap">' + inner + "</div></body></html>";
  return HtmlService.createHtmlOutput(html).setTitle("Titans Coaches Dashboard").addMetaTag("viewport", "width=device-width, initial-scale=1");
}
