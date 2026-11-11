/* Builds dashboard/sample.html: the Program overview on a made-up 2027 season, for the
   head coach to look over before any real game is charted (Nov 2026).

     cd titans-apps && node tools/dashboard/sample-page.js

   The page is made by the REAL dashboard code (dashboard/Code.gs) on a stand-in Sheet
   filled with a made-up season: every 2027 game on the real schedules through Apr 17,
   about what each level might look like by then. Some teams ahead of pace, some behind,
   some goals met and some not, so every part of the page has something to show.
   No player names, no Google calls, one file. tools/dashboard/sample-check.js checks it. */
"use strict";
const fs = require("fs");
const path = require("path");
const { makeRuntime } = require("../receiver/mock-gas");

const ROOT = path.join(__dirname, "..", "..");
const VERSION = "dashboard sample 1 (Nov 2026)";
const THROUGH = "2027-04-17";

/* The 2027 schedules (Jim, Nov 6), games through Apr 17. */
const GAMES = {
  Varsity: [["2027-03-18", "Coach Bob Classic"], ["2027-03-19", "Coach Bob Classic"], ["2027-03-19", "Coach Bob Classic"], ["2027-03-20", "Coach Bob Classic"],
            ["2027-03-25", "Valor Christian"], ["2027-03-27", "Cherokee Trail"], ["2027-04-03", "Cherry Creek"], ["2027-04-09", "Heritage"],
            ["2027-04-10", "Douglas County"], ["2027-04-12", "Heritage"], ["2027-04-14", "Mountain Vista"], ["2027-04-16", "Mountain Vista"]],
  JV: [["2027-03-25", "Valor Christian"], ["2027-03-27", "Cherokee Trail"], ["2027-04-03", "Cherry Creek"], ["2027-04-06", "Ponderosa"],
       ["2027-04-10", "Heritage"], ["2027-04-13", "Heritage"], ["2027-04-15", "Mountain Vista"], ["2027-04-17", "Mountain Vista"]],
  Sophomore: [["2027-03-11", "Ponderosa"], ["2027-03-27", "Valor Christian"], ["2027-03-27", "Cherokee Trail"], ["2027-04-03", "Cherry Creek"],
              ["2027-04-05", "Ponderosa"], ["2027-04-09", "Heritage"], ["2027-04-12", "Heritage"], ["2027-04-14", "Mountain Vista"], ["2027-04-16", "Mountain Vista"]],
  Freshman: [["2027-03-10", "Ponderosa"], ["2027-03-26", "Valor Christian"], ["2027-03-27", "Cherokee Trail"], ["2027-04-03", "Cherry Creek"],
             ["2027-04-10", "Heritage"], ["2027-04-13", "Heritage"], ["2027-04-15", "Mountain Vista"], ["2027-04-17", "Mountain Vista"]]
};
/* What each level looks like so far, per batter: free bases, strikeouts, hits, errors;
   first-pitch strikes and strike rate; hard contact per ball in play. */
const LOOK = {
  Varsity:   {free: 0.122, k: 0.215, hit: 0.190, err: 0.030, fps: 0.595, str: 0.605, hard: 0.21},
  JV:        {free: 0.185, k: 0.285, hit: 0.185, err: 0.040, fps: 0.560, str: 0.585, hard: 0.24},
  Sophomore: {free: 0.140, k: 0.210, hit: 0.200, err: 0.045, fps: 0.575, str: 0.595, hard: 0.19},
  Freshman:  {free: 0.105, k: 0.255, hit: 0.185, err: 0.035, fps: 0.615, str: 0.612, hard: 0.17}
};

/* A repeatable random stream, so the page is the same every build. */
let seed = 20270417;
function rnd() {   /* mulberry32 */
  seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}

const IH = ["RecordID", "Level", "Date", "Opponent", "Inning", "Partial", "Pitcher", "PitcherID", "PitcherLast", "PitcherFirst", "Pitches", "Strikes",
  "StrikePct", "FirstPitches", "FirstPitchStrikes", "BattersFaced", "Outs", "FreeBases", "K", "Hits", "Runs", "Earned", "Unearned"];
const PH = ["RecordID", "Level", "Date", "Opponent", "Inning", "Spot", "AB", "Pitch", "PitcherID", "ABResult", "HardContact"];
const RH = ["RecordID", "App", "Build", "Schema", "Mound", "Team", "Date", "Coach", "Template", "ScriptID", "FiledAt", "ReceivedAt", "Rows"];
const S = { Records: [RH], Game_Innings: [IH], Game_Pitches: [PH], Coaches: [["Name", "Google account", "Level(s)"], ["Sample Coach", "sample@example.com", "All"]],
            Config: [["Setting", "Value", "Notes"], ["Season", 2027, ""]] };

let gid = 0;
Object.keys(GAMES).forEach(level => {
  const L = LOOK[level];
  GAMES[level].forEach(([date, opp]) => {
    const rid = "sample-" + (++gid);
    S.Records.push([rid, "game", "v34", 1, "", level, date, "Sample", "", "", date + "T2" + (gid % 10) + ":00:00Z", date + "T2" + (gid % 10) + ":00:01Z", 0]);
    const spotAb = {};
    let spot = 0;
    const relief = 4 + Math.floor(rnd() * 2);                 /* starter goes 4 or 5 */
    const last = rnd() < 0.45 ? 6 : 7;                         /* some games we don't pitch the 7th */
    for (let inn = 1; inn <= last; inn++) {
      const pid = inn <= relief ? "S" : "R";
      const o = { pitches: 0, strikes: 0, fps: 0, bf: 0, outs: 0, free: 0, k: 0, hits: 0, runners: 0, err: false, hr: 0 };
      while (o.outs < 3 && o.bf < 12) {
        spot = spot % 9 + 1; spotAb[spot] = (spotAb[spot] || 0) + 1;
        const r = rnd(); let res;
        if (r < L.free) res = rnd() < 0.78 ? "BB" : "HBP";
        else if (r < L.free + L.k) res = rnd() < 0.75 ? "K" : "Kc";
        else if (r < L.free + L.k + L.hit) { const h = rnd(); res = h < 0.70 ? "1B" : h < 0.90 ? "2B" : h < 0.95 ? "3B" : "HR"; }
        else if (r < L.free + L.k + L.hit + L.err) res = "E";
        else res = ["GO", "GO", "FO", "LO", "PO"][Math.floor(rnd() * 5)];
        o.bf++;
        const n = res === "BB" ? 5 + Math.floor(rnd() * 2) : res === "HBP" ? 1 + Math.floor(rnd() * 3) : /^K/.test(res) ? 4 + Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 4);
        o.pitches += n;
        if (rnd() < L.fps) o.fps++;
        if (res === "BB" || res === "HBP") { o.free++; o.runners++; }
        else if (/^K/.test(res)) { o.k++; o.outs++; }
        else if (["1B", "2B", "3B", "HR"].includes(res)) { o.hits++; o.runners++; if (res === "HR") o.hr++; }
        else if (res === "E") { o.runners++; o.err = true; }
        else o.outs++;
        const bip = !["BB", "HBP", "K", "Kc"].includes(res);
        S.Game_Pitches.push([rid, level, date, opp, inn, spot, spotAb[spot], 1, pid, res, bip && rnd() < L.hard ? "Y" : ""]);
      }
      o.strikes = Math.round(o.pitches * (L.str + (rnd() - 0.5) * 0.06));
      const runs = Math.max(0, o.runners - 2) + o.hr;
      const unearned = o.err && rnd() < 0.85 ? Math.min(runs, 1 + Math.floor(rnd() * 2)) : 0;
      S.Game_Innings.push([rid, level, date, opp, inn, "", pid === "S" ? "Starter" : "Reliever", "p" + gid + pid, "Pitcher", pid === "S" ? "Starter" : "Reliever",
        o.pitches, o.strikes, Math.round(o.strikes * 100 / o.pitches), o.bf, o.fps, o.bf, o.outs, o.free, o.k, o.hits, runs, runs - unearned, unearned]);
    }
  });
});

const rt = makeRuntime(path.join(ROOT, "dashboard", "Code.gs"));
const b = rt.newBook("S");
Object.keys(S).forEach(n => { b.insertSheet(n).data = S[n]; });
rt.props.SEASON_SHEET_ID = "S";
rt.session.active = "sample@example.com";
let html = rt.sandbox.doGet({ parameter: {} }).getContent();

const banner = '<div class="sample">Sample data &middot; a made-up 2027 season through Apr 17, every game on the real schedules &middot; built with the real dashboard code</div>';
html = html
  .replace("<head>", "<head><!-- " + VERSION + " · built by tools/dashboard/sample-page.js -->")
  .replace('<base target="_top">', "")
  .replace("<title>Titans Coaches Dashboard</title>", "<title>Titans Coaches Dashboard · sample</title>")
  .replace("<h1>Program overview</h1>", "<h1>Program overview</h1>" + banner)
  .replace(" &middot; signed in as Sample Coach", "")
  .replace("</style>", ".sample{display:inline-block;margin:6px 0 4px;background:#FDF3EC;color:#C85C1C;font-weight:700;font-size:13px;padding:5px 10px;border-radius:12px}</style>");
if (/script\.google\.com|googleusercontent/.test(html)) throw new Error("sample page must not call Google");
if (!/Sample data/.test(html)) throw new Error("no sample banner");
fs.writeFileSync(path.join(ROOT, "dashboard", "sample.html"), html);
fs.writeFileSync(path.join(__dirname, "sample-season.json"), JSON.stringify(S));
console.log("dashboard/sample.html " + Math.round(html.length / 1024) + " KB, " + gid + " games through " + THROUGH);
