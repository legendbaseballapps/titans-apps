/* GameChanger import (dashboard 1.3, Nov 2026), on the stand-in Apps Script runtime.

     cd titans-apps && node tools/dashboard/gc-import.js

   Builds made-up GameChanger exports the way the real ones come: a Batting / Pitching /
   Fielding label row over the header, SB, CS, PIK and CI in more than one group, innings in
   baseball notation, "-", "N/A" and "0-0" for no value, a Totals row, a Glossary, a player
   with no name, and a Freshmen sheet laid out differently (its own column order, "SB-ATT").
   No real player's stats are in this file. Checks the reading, the matching, the picks,
   the GameChanger and GC_Links tabs, re-imports, and who can save. */
"use strict";
const fs = require("fs");
const path = require("path");
const { makeRuntime } = require("../receiver/mock-gas");

const ROOT = path.join(__dirname, "..", "..");
const CODE = process.env.DASH_CODE || path.join(ROOT, "dashboard", "Code.gs");
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL " + m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }
function throws(f, re, m) { let t = ""; try { f(); } catch (e) { t = String(e.message); } ok(t && (!re || re.test(t)), m + (t ? " [" + t + "]" : " [no error]")); }

/* ---------------------------------------------------------------- made-up exports */
const BAT = ["GP", "PA", "AB", "AVG", "OBP", "OPS", "SLG", "H", "1B", "2B", "3B", "HR", "RBI", "R", "BB", "SO", "HBP", "SAC", "SF", "SB", "CS", "PIK", "QAB", "CI"];
const PIT = ["IP", "GP", "GS", "BF", "#P", "W", "L", "SV", "H", "R", "ER", "BB", "SO", "HBP", "ERA", "WHIP", "PIK", "CS", "SB", "WP", "S%", "FPS%"];
const FLD = ["TC", "A", "PO", "FPCT", "E", "DP", "TP", "INN", "PB", "SB", "SBATT", "CS", "CS%", "PIK", "CI", "P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "SF", "Total"];
function sheet(players, opts) {
  opts = opts || {};
  const fld = opts.fld || FLD, pit = opts.pit || PIT;
  const head = ["Number", "Last", "First"].concat(BAT, pit, fld);
  const lab = head.map((_, i) => i === 3 ? "Batting" : i === 3 + BAT.length ? "Pitching" : i === 3 + BAT.length + pit.length ? "Fielding" : null);
  const g = [lab, head];
  players.forEach(p => {
    const row = [p.n, p.last, p.first];
    BAT.forEach(k => row.push(p.bat && k in p.bat ? p.bat[k] : 0));
    pit.forEach(k => row.push(p.pit && k in p.pit ? p.pit[k] : (opts.na ? "N/A" : "-")));
    fld.forEach(k => row.push(p.fld && k in p.fld ? p.fld[k] : (k === "SB-ATT" ? "0-0" : 0)));
    g.push(row);
  });
  g.push(["Totals", null, null].concat(BAT.map((k, i) => k === "GP" ? 20 : i), pit.map(k => k === "IP" ? "120.1" : 1), fld.map(k => k === "TC" ? 500 : k === "Total" ? "840.2" : 2)));
  g.push([]);
  g.push(["Glossary", null, null, "GP = Games played"]);
  return g;
}
const FR_FLD = ["TC", "A", "PO", "FPCT", "E", "DP", "INN", "PB", "SB", "SB-ATT", "CS", "CS%", "PIK", "CI", "P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "SF", "Total"];  /* no TP */
const FR_PIT = ["IP", "GP", "GS", "BF", "#P", "W", "L", "SV", "H", "R", "ER", "BB", "SO", "HBP", "ERA", "WHIP", "WP", "CS", "SB", "PIK", "FPS%", "S%"];  /* its own order */
function wb() {
  return {
    season: "2026",
    sheets: [
      {name: "Varsity", grid: sheet([
        {n: 4, last: "Archer", first: "Nolan", bat: {AVG: 0.312, H: 15, SB: 6, CS: 1, PIK: 2, CI: 0}, fld: {TC: 40, PO: 30, A: 8, E: 2, FPCT: 0.95, SS: "44.1", Total: "50.2", SB: 0, CS: 0}},
        {n: 22, last: "Brandt", first: "Cole", pit: {IP: "39.2", ER: 12, ERA: 2.118, "S%": 61.5, CS: 3, SB: 9, PIK: 4}, fld: {INN: "20.1", PB: 3, SB: 11, SBATT: 15, CS: 4, "CS%": 26.67, C: "20.1", P: "39.2"}},
        {n: 9, last: "Delgado", first: "Sam"},            /* swing player: also on JV with another number */
        {n: 31, last: "Fenwick", first: "Owen"},          /* graduated: not on the roster */
        {n: 25, last: "Graysen", first: "Luke"},          /* roster spells it Grayson */
        {n: 8, last: null, first: null, fld: {TC: 3}}     /* GameChanger player with no name */
      ])},
      {name: "JV", grid: sheet([
        {n: 15, last: "Delgado", first: "Sam", bat: {H: 4}},
        {n: 2, last: "Holloway", first: "B"},              /* initial only: Ben Holloway */
        {n: 13, last: "Kerr", first: null}                 /* no first name, 2 Kerrs on the roster */
      ])},
      {name: "Freshmen", grid: sheet([
        {n: 1, last: "Lindgren", first: "Max", fld: {"SB-ATT": "13-18", TC: 35, E: 5, FPCT: 0.857, CF: "37.2", Total: "97.2"}, pit: {IP: "0", ERA: "N/A"}}
      ], {fld: FR_FLD, pit: FR_PIT, na: true})},
      {name: "Sheet1", grid: sheet([{n: 3, last: "Archer", first: "Nolan"}])}
    ]
  };
}
const ROSTER = [
  ["p-arch", "Archer", "Nolan", "Jr"], ["p-bran", "Brandt", "Cole", "Sr"], ["p-delg", "Delgado", "Sam", "Jr"],
  ["p-gray", "Grayson", "Luke", "Sr"], ["p-holl", "Holloway", "Ben", "Jr"], ["p-kerA", "Kerr", "Adam", "Fr"],
  ["p-kerB", "Kerr", "Ty", "Jr"], ["p-lind", "Lindgren", "Max", "So"]
];
function world() {
  const rt = makeRuntime(CODE);
  const b = rt.newBook("S");
  b.insertSheet("Players").data = [["PlayerID", "Last", "First", "Class", "Level", "Player email", "Parent email", "Send"]].concat(ROSTER.map(r => r.concat(["", "", "", "Yes"])));
  b.insertSheet("Coaches").data = [["Name", "Google account", "Level(s)", "Notify"], ["Jim Vaughn", "jim@example.com", "All", "Both"]];
  rt.props.SEASON_SHEET_ID = "S";
  rt.session.active = "jim@example.com";
  rt.b = b;
  return rt;
}
const tab = (rt, n) => (rt.b.getSheetByName(n) ? rt.b.getSheetByName(n).records() : []);

/* ---------------------------------------------------------------- reading */
{
  const rt = world(), S = rt.sandbox;
  const pv = S.importPreview(wb());
  eq(pv.sheets.map(s => s.level), ["Varsity", "JV", "Freshman", ""], "levels from the sheet names (Freshmen = Freshman), Sheet1 unknown");
  ok(/level/i.test(pv.sheets[3].error || ""), "an unnamed sheet asks for its level");
  ok(!pv.rows.some(r => r.sheet === 3), "nothing read from a sheet until its level is picked");
  eq(pv.sheets[2].missing, ["Fielding TP"], "Freshmen: the one missing column is named");
  ok(!("vals" in pv.rows[0]), "the page gets names and statuses, not the stats");
  const full = S.importPreview_(rt.b, wb()), V = full.rows.filter(r => r.level === "Varsity");
  eq(full.rows.filter(r => r.status === "team").map(r => r.level), ["Varsity", "JV", "Freshman"], "a TEAM row per level from Totals");
  ok(!full.rows.some(r => /glossary/i.test(r.number)), "Glossary is not a row");
  const ar = V.find(r => r.last === "Archer").vals, br = V.find(r => r.last === "Brandt").vals;
  eq([ar["Bat SB"], ar["Bat CS"], ar["Catch SB"], ar["Catch CS"]], [6, 1, 0, 0], "Batting SB/CS stay apart from catching SB/CS");
  eq([br["Pit Outs"], br["Catch Outs"], br["Outs C"], br["Outs P"]], [119, 61, 61, 119], "innings to outs: 39.2 = 119, 20.1 = 61");
  eq([br["Catch SB"], br["Catch SB Att"], br["Catch CS"], br["Catch CS%"]], [11, 15, 4, 26.67], "catcher block read by name in the Fielding group");
  eq([ar["Fld TC"], ar["Fld FPCT"], ar["Outs SS"], ar["Outs Total"]], [40, 0.95, 133, 152], "fielding and innings by position");
  eq(br["Pit ERA"], 2.118, "pitching ERA");
  const fr = full.rows.find(r => r.last === "Lindgren").vals;
  eq([fr["Catch SB Att"], fr["Pit ERA"], fr["Fld TP"], fr["Outs CF"], fr["Fld E"]], [18, "", "", 113, 5], "Freshmen: SB-ATT 13-18 = 18 attempts, N/A and a missing column are blank, its own column order reads right");
  eq([S.gcVal_("0-0", "att"), S.gcVal_(46023, "att"), S.gcVal_(3, "att"), S.gcVal_("0-0", "")], [0, 1, 3, ""], "steal attempts: 0-0, Excel's date for 1-1, a plain count; 0-0 elsewhere is blank");
  const team = full.rows.find(r => r.status === "team" && r.level === "Varsity").vals;
  eq([team["Fld TC"], team["Outs Total"], team["Pit Outs"]], [500, 2522, 361], "TEAM row values");
  throws(() => S.importPreview({season: "", sheets: []}), /season/i, "a season is required");
  const junk = S.importPreview({season: "2026", sheets: [{name: "Varsity", grid: [["a", "b"], [1, 2]]}]});
  ok(/Not a GameChanger stats export/.test(junk.sheets[0].error || ""), "a sheet that isn't an export says so");
}

/* ---------------------------------------------------------------- matching */
{
  const rt = world(), S = rt.sandbox, pv = S.importPreview(wb()), st = {};
  pv.rows.forEach(r => { st[r.level + " " + (r.last || "#" + r.number)] = r; });
  eq(["Varsity Archer", "Varsity Brandt", "Varsity Delgado", "JV Delgado", "Freshman Lindgren"].map(k => st[k].status), ["match", "match", "match", "match", "match"], "exact names match on their own");
  eq([st["Varsity Delgado"].playerId, st["JV Delgado"].playerId], ["p-delg", "p-delg"], "a swing player matches on both levels, numbers ignored");
  eq(st["Varsity #8"].status, "skip", "no name: skipped");
  eq(st["Varsity Fenwick"].status, "pick", "not on the roster: waits for a coach, never guessed");
  eq([st["Varsity Graysen"].status, st["Varsity Graysen"].suggest], ["pick", ["p-gray"]], "a close spelling is suggested, not matched");
  eq([st["JV Holloway"].status, st["JV Holloway"].suggest], ["pick", ["p-holl"]], "an initial is suggested, not matched");
  eq([st["JV Kerr"].status, st["JV Kerr"].suggest], ["pick", ["p-kerA", "p-kerB"]], "no first name: both Kerrs offered");
}

/* ---------------------------------------------------------------- saving */
{
  const rt = world(), S = rt.sandbox, data = wb();
  data.sheets[3].level = "Varsity";                                     /* coach picks Sheet1's level */
  const pv0 = S.importPreview(data);
  const dupe = pv0.rows.filter(r => r.status === "pick" && r.sheet === 3 || (r.sheet === 3 && r.last === "Archer"));
  ok(dupe.some(r => /Already matched/.test(r.reason || "") || r.status === "match"), "a second Archer row on Varsity is caught");
  data.sheets.pop();                                                   /* drop it; one Varsity sheet */
  const pv = S.importPreview(data), key = n => pv.rows.find(r => r.last === n).key;
  throws(() => S.importCommit(data, {}), /Still to pick/, "nothing saves while names are still to pick");
  ok(!rt.b.getSheetByName("GameChanger"), "and no tab was written");
  const picks = {[key("Fenwick")]: "NOT ON ROSTER", [key("Graysen")]: "p-gray", [key("Holloway")]: "p-holl", [key("Kerr")]: "p-kerB"};
  throws(() => S.importCommit(data, Object.assign({}, picks, {[key("Kerr")]: "nobody"})), /Still to pick/, "a pick that isn't a roster player is refused");
  throws(() => S.importCommit(data, Object.assign({}, picks, {[key("Graysen")]: "p-arch"})), /same player/, "two Varsity rows can't both be Archer");
  const res = S.importCommit(data, picks);
  eq([res.players, res.notOnRoster, res.team, res.skipped, res.links], [8, 1, 3, 1, 4], "commit summary");
  const g = tab(rt, "GameChanger");
  eq(g.length, 12, "12 rows written (8 players, 1 not on roster, 3 team rows)");
  eq(g.filter(r => r.PlayerID === "p-delg").map(r => r.Level), ["Varsity", "JV"], "the swing player has a row per level");
  const brandt = g.find(r => r.PlayerID === "p-brand" || r.PlayerID === "p-bran");
  eq([String(brandt.Season), brandt.Status, brandt["Pit Outs"], brandt["Catch SB Att"], brandt.ImportedBy], ["2026", "Matched", 119, 15, "jim@example.com"], "Brandt's row");
  eq(g.find(r => r.Last === "Fenwick").PlayerID, "", "not on roster: kept with no PlayerID");
  eq(g.find(r => r.Last === "Graysen").Status, "Linked", "a picked player says Linked");
  ok(!g.some(r => r.Number === 8 || r.Number === "8"), "the nameless row is not written");
  eq(g.filter(r => r.PlayerID === "TEAM").length, 3, "3 TEAM rows");
  const L = tab(rt, "GC_Links");
  eq(L.map(r => r.Last + ">" + r.PlayerID).sort(), ["Fenwick>NOT ON ROSTER", "Graysen>p-gray", "Holloway>p-holl", "Kerr>p-kerB"], "every pick is remembered");

  /* the same file again: everything is known now, and nothing doubles */
  const pv2 = S.importPreview(data);
  eq(pv2.rows.filter(r => r.status === "pick").length, 0, "second time: nothing to pick");
  eq(pv2.rows.find(r => r.last === "Graysen").status, "linked", "the link is used");
  eq(pv2.rows.find(r => r.last === "Fenwick").status, "not", "not-on-roster is remembered");
  S.importCommit(data, {});
  eq(tab(rt, "GameChanger").length, 12, "re-import replaces that season's rows, no doubles");
  eq(tab(rt, "GC_Links").length, 4, "links aren't duplicated");

  /* a corrected JV file replaces only JV 2026 */
  const jv = {season: "2026", sheets: [wb().sheets[1]]};
  jv.sheets[0].grid[2][jv.sheets[0].grid[1].indexOf("AB")] = 99;   /* Delgado's AB on JV */
  S.importCommit(jv, {});
  const g3 = tab(rt, "GameChanger");
  eq(g3.length, 12, "re-importing JV alone keeps Varsity and Freshman");
  eq(g3.find(r => r.Level === "JV" && r.PlayerID === "p-delg")["Bat AB"], 99, "JV row updated");

  /* 2027 sits beside 2026 */
  const y27 = wb(); y27.season = "2027"; y27.sheets.pop();
  S.importCommit(y27, {});
  const g4 = tab(rt, "GameChanger");
  eq([g4.filter(r => String(r.Season) === "2026").length, g4.filter(r => String(r.Season) === "2027").length], [12, 12], "2027 import leaves 2026 alone");

  /* the page */
  const page = S.doGet({parameter: {p: "import"}}).getContent();
  ok(/Import GameChanger Stats/.test(page) && /id="file"/.test(page), "import page renders with a file picker");
  ok(/xlsx\/0\.18\.5\/xlsx\.full\.min\.js/.test(page), "SheetJS pinned to 0.18.5");
  ok(/2026<\/td><td>Varsity<\/td><td class="c">4</.test(page), "Already imported: 2026 Varsity, 4 roster players");
  ok(/<option selected>2026<\/option>/.test(page) || /<option selected>/.test(page), "a season is preselected");
}

/* ---------------------------------------------------------------- who can */
{
  const rt = world(), S = rt.sandbox;
  rt.session.active = "stranger@example.com";
  throws(() => S.importPreview(wb()), /Coaches tab/, "someone not on the Coaches tab can't preview");
  throws(() => S.importCommit(wb(), {}), /Coaches tab/, "or save");
  const page = S.doGet({parameter: {p: "import"}}).getContent();
  ok(/No access/.test(page) && !/id="file"/.test(page), "or open the page");

  const rv = world(), V = rv.sandbox, d = {season: "2026", sheets: [wb().sheets[2]]};
  V.importCommit(d, {});   /* creates the tab */
  const sh = rv.b.getSheetByName("GameChanger"), orig = sh.getRange.bind(sh);
  sh.getRange = function () { const r = orig.apply(null, arguments); r.setValues = () => { throw new Error("You do not have permission to access the requested document."); }; return r; };
  throws(() => V.importCommit(d, {}), /edit access/, "a coach who can only view the Sheet is told he needs edit access");
}

/* ---------------------------------------------------------------- the overview links to it */
{
  const rt = world();
  rt.b.insertSheet("Records").data = [["RecordID", "App", "Build", "Schema", "Device", "Charter", "Date", "Opponent", "HomeAway", "Team", "ReceivedAt", "FiledAt", "Rows"]];
  const page = rt.sandbox.doGet({parameter: {}}).getContent();
  ok(/\?p=import">Import GameChanger stats</.test(page), "the overview footer links to the import page");
}

console.log(pass + fail + " import checks" + (fail ? ", " + fail + " FAILED" : ""));
console.log(fail ? "SOME IMPORT CHECKS FAILED" : "ALL IMPORT CHECKS PASS");
process.exit(fail ? 1 : 0);
