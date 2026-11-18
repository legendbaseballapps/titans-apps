/* Dashboard 2.0: the model (dashboard/Model.gs) checked against sums worked out here, separately,
   straight from the Sheet rows (Nov 16, 2026).

     cd titans-apps && node tools/dashboard/model.js

   The season is tools/dashboard/season-gen.js: every tab in the receiver's exact columns. Each
   check recomputes a number its own way (no code shared with Model.gs) and compares. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { season } = require("./season-gen");

const ROOT = path.join(__dirname, "..", "..");
const FILES = (process.env.DASH_MODEL ? [path.join(ROOT, "dashboard", "Code.gs"), process.env.DASH_MODEL] : ["Code.gs", "Model.gs"].map((f) => path.join(ROOT, "dashboard", f)));
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; if (fail < 40) console.log("FAIL " + m); } }
function eq(a, b, m) { ok(a === b, m + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }
function near(a, b, m) { ok(a != null && b != null && Math.abs(a - b) < 1e-9, m + " (got " + a + ", want " + b + ")"); }

function load(T, comments, me) {
  const ctx = { console }; vm.createContext(ctx);
  FILES.forEach((f) => vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f }));
  const rows = (n) => { const t = T[n]; if (!t) return []; const h = t[0]; return t.slice(1).map((r) => { const o = {}; h.forEach((k, i) => { o[k] = r[i]; }); return o; }); };
  const ss = { getSheetByName: (n) => (T[n] ? { getLastRow: () => T[n].length, getLastColumn: () => T[n][0].length, getRange: () => ({ getValues: () => T[n] }) } : null) };
  const S = ctx.settings_(ss);
  const cm = {};
  Object.keys(comments || {}).forEach((lv) => { const t = comments[lv], h = t[0]; cm[lv] = t.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]]))); });
  return { M: ctx.buildModel_(rows, { settings: S, today: "2027-04-17", me: me || "coachv@example.com", comments: cm }), rows, S };
}
const G = season();
const T = G.sheet;
const { M, rows, S } = load(T, G.comments);
const recs = new Set(rows("Records").map((r) => r.RecordID));
const kept = (n) => rows(n).filter((r) => recs.has(r.RecordID) && String(r.Practice || "").toUpperCase() !== "Y");
const LV = ["Varsity", "JV", "Sophomore", "Freshman"];
const sum = (a, f) => a.reduce((x, y) => x + f(y), 0);

/* ---------------------------------------------------------------- spring pitching */
{
  const inn = kept("Game_Innings");
  ok(rows("Game_Innings").some((r) => !recs.has(r.RecordID)), "the season has an inning row with no Records row");
  LV.forEach((lv) => {
    const mine = inn.filter((r) => r.Level === lv), pl = M.pit.filter((l) => l.lv === lv);
    [["BattersFaced", "bf"], ["FreeBases", "free"], ["K", "k"], ["Outs", "outs"], ["Pitches", "pitches"], ["Strikes", "strikes"], ["Hits", "hits"], ["Runs", "runs"], ["Earned", "er"],
     ["FirstPitches", "fp"], ["FirstPitchStrikes", "fps"]].forEach(([c, k]) => eq(sum(pl, (l) => l[k]), sum(mine, (r) => +r[c]), lv + " " + k + " = the inning rows"));
    eq(M.games.filter((g) => g.lv === lv).length, new Set(mine.map((r) => r.RecordID)).size, lv + " games");
  });
  /* walks, balls in play, hard contact: at-bats, credited to the pitcher of the first pitch */
  const ab = new Map();
  kept("Game_Pitches").forEach((r) => {
    const k = r.RecordID + "/" + r.Spot + "/" + r.AB;
    if (!ab.has(k)) ab.set(k, { pid: r.PitcherID, rid: r.RecordID, res: "", hard: "" });
    if (r.ABResult) { ab.get(k).res = r.ABResult; ab.get(k).hard = r.HardContact; }
  });
  const BIP = new Set(["GO", "FO", "LO", "PO", "FC", "DP", "SAC", "SF", "1B", "2B", "3B", "HR", "E"]);
  const byLine = {};
  ab.forEach((a) => { const L = byLine[a.rid + "/" + a.pid] = byLine[a.rid + "/" + a.pid] || { bb: 0, bip: 0, hard: 0 }; if (a.res === "BB" || a.res === "IBB") L.bb++; if (BIP.has(a.res)) { L.bip++; if (a.hard === "Y") L.hard++; } });
  let n = 0;
  M.pit.forEach((l) => { const L = byLine[l.rid + "/" + l.id] || { bb: 0, bip: 0, hard: 0 }; if (L.bb === l.bb && L.bip === l.bip && L.hard === l.hard) n++; });
  eq(n, M.pit.length, "every pitcher-game line's walks, balls in play and hard contact");
  /* execution: SPOT or CLOSE of the graded calls, never Glove or Unknown */
  const ex = {};
  kept("Game_Pitches").forEach((r) => { if (!/^(SPOT|CLOSE|MISS)$/.test(r.Execution) || /Glove|Unknown/.test(r.CallSource)) return; const e = ex[r.RecordID + "/" + r.PitcherID] = ex[r.RecordID + "/" + r.PitcherID] || [0, 0]; e[1]++; if (r.Execution !== "MISS") e[0]++; });
  ok(kept("Game_Pitches").some((r) => r.CallSource === "Glove") && kept("Game_Pitches").some((r) => r.CallSource === "Unknown"), "the season has glove and unknown calls");
  n = 0; M.pit.forEach((l) => { const e = ex[l.rid + "/" + l.id] || [0, 0]; if (e[0] === l.xok && e[1] === l.xn) n++; });
  eq(n, M.pit.length, "every pitcher-game line's execution");
  /* the 150 counter, by hand */
  let saved = 0; LV.forEach((lv) => { const pl = M.pit.filter((l) => l.lv === lv); saved += sum(pl, (l) => l.bf) * S.lv[lv].rate / 100 - sum(pl, (l) => l.free); });
  ok(Math.abs(saved) > 1, "the counter has something to count (" + saved.toFixed(1) + ")");
  /* the swing arm: his JV games on a JV line, his home is Sophomore */
  const bk = Object.values(M.people).find((p) => p.name === "Brody Kane");
  eq(bk.home, "Sophomore", "the swing arm's home level is from the Players tab");
  ok(M.pit.some((l) => l.id === bk.id && l.lv === "JV"), "his JV relief outings are JV lines");
  /* notes */
  const gn = kept("Game_Notes").filter((r) => r.ToPitcher || r.CoachOnly);
  eq(gn.filter((r) => M.notes[r.RecordID + "|" + r.PitcherID]).length, gn.length, "every game note");
}
/* ---------------------------------------------------------------- winter */
{
  const bp = kept("Bullpen_Pitches");
  const sessions = {};
  bp.forEach((r) => { const k = r.PitcherID + "|" + r.SessionID + "|" + r.Mode; const s = sessions[k] = sessions[k] || { ok: 0, g: 0, w: [0, 0], n: 0, abs: {} }; s.n++;
    if (/^(Spot|Close|Miss)$/.test(r.Result) && !/Glove|Unknown/.test(r.CallSource)) { s.g++; if (r.Result !== "Miss") s.ok++; if (r.CalledWS === "W" && r.Mode === "Script") { s.w[1]++; if (r.Result !== "Miss") s.w[0]++; } }
    if (r.Mode === "Live" && r.AO3plus) s.abs[r.AB] = r.AO3plus; });
  let n = 0, all = 0;
  Object.keys(M.pens).forEach((pid) => M.pens[pid].forEach((P) => { all++; const s = sessions[pid + "|" + P.sid + "|" + P.mode]; if (s && s.ok === P.ok && s.g === P.g && s.n === P.n && s.w[0] === P.w[0] && s.w[1] === P.w[1]) n++; }));
  eq(n, all, "every pen's execution, wind-up execution and pitch count");
  eq(all, Object.keys(sessions).length, "every pitcher's every pen");
  /* AO3+: ++ 2, +- and -+ 1, -- 0, per batter */
  n = 0; let live = 0;
  Object.keys(M.pens).forEach((pid) => M.pens[pid].filter((P) => P.mode === "Live").forEach((P) => { live++; const s = sessions[pid + "|" + P.sid + "|Live"], v = Object.values(s.abs);
    const pts = v.reduce((a, x) => a + (x === "++" ? 2 : x === "--" ? 0 : 1), 0); if (P.ao3 && P.ao3[0] === pts && P.ao3[1] === v.length) n++; }));
  eq(n, live, "every live session's AO3+ points");
  ok(live > 20, "the season has live AB sessions (" + live + ")");
  /* the situations: 2-0 is graded on the strike, 2-strike chase on finishing out of the zone */
  const t20 = bp.filter((r) => r.Situation === "20"), t2k = bp.filter((r) => r.Situation === "2K");
  const m20 = [0, 0], m2k = [0, 0];
  Object.values(M.pens).forEach((L) => L.forEach((P) => { const a = P.sit["20"], b = P.sit["2K"]; if (a) { m20[0] += a[0]; m20[1] += a[1]; } if (b) { m2k[0] += b[0]; m2k[1] += b[1]; } }));
  eq(m20.join("/"), t20.filter((r) => r.Strike === "Y").length + "/" + t20.length, "2-0 off-speed strike, graded on the strike");
  eq(m2k.join("/"), t2k.filter((r) => r.Strike === "N").length + "/" + t2k.length, "2-strike chase, graded on finishing out of the zone");
  /* pen reflections join on the session */
  const rf = rows("Reflections").filter((r) => r.Kind === "pen");
  eq(sum(Object.values(M.pens), (L) => L.filter((P) => P.refl).length), new Set(rf.map((r) => r.RecordID + "|" + r.PlayerID)).size, "pens with a reflection");
  const fl = rf.filter((r) => r.Flag === "Y");
  ok(fl.length > 0, "the season has an arm flag");
  eq(sum(Object.values(M.pens), (L) => L.filter((P) => P.flag).length), fl.length, "every arm flag reaches its pen");
}
/* ---------------------------------------------------------------- hitting */
{
  const op = kept("Offense_Pitches"), pa = {};
  op.forEach((r) => { (pa[r.RecordID + "|" + r.PA] = pa[r.RecordID + "|" + r.PA] || []).push(r); });
  const want = {};
  Object.values(pa).forEach((rs) => {
    const last = rs[rs.length - 1], res = last.PAResult; if (!res) return;
    const w = want[last.HitterID] = want[last.HitterID] || { pa: 0, qab: 0, k: 0, bb: 0, h: 0, ab: 0, ooz: 0, ch: 0 };
    w.pa++;
    const bip = last.What === "In play", traj = last.Traj || { GO: "GB", FC: "GB", DP: "GB", SAC: "GB", SF: "FB", LO: "LD", FO: "FB", HR: "FB", PO: "PU" }[res];
    const q = /^(1B|2B|3B|HR|BB|IBB|HBP|SAC|SF)$/.test(res) || (bip && traj === "LD") || (bip && last.RunScored === "Y") || rs.length >= 7 ||
              (bip && last.MovedRunner === "Y" && +last.Outs !== 2) || (bip && +last.CountS === 2);
    if (q) w.qab++;
    if (/^Kc?$/.test(res)) w.k++;
    if (/^I?BB$/.test(res)) w.bb++;
    if (/^(1B|2B|3B|HR)$/.test(res)) w.h++;
    if (!/^(BB|IBB|HBP|SAC|SF|CI)$/.test(res)) w.ab++;
    rs.forEach((x) => { if (x.InZone === "N") { w.ooz++; if (x.Chase === "Y") w.ch++; } });
  });
  const got = {};
  M.hit.forEach((h) => { const g = got[h.id] = got[h.id] || { pa: 0, qab: 0, k: 0, bb: 0, h: 0, ab: 0, ooz: 0, ch: 0 }; Object.keys(g).forEach((k) => { g[k] += h[k]; }); });
  let n = 0; Object.keys(want).forEach((id) => { if (JSON.stringify(want[id]) === JSON.stringify(got[id])) n++; });
  eq(n, Object.keys(want).length, "every hitter's PA, quality at-bats, K, walks, hits, at-bats and chases");
  ok(Object.keys(want).length > 30, "the season has hitters (" + Object.keys(want).length + ")");
  const qab = sum(Object.values(want), (w) => w.qab), pas = sum(Object.values(want), (w) => w.pa);
  ok(qab > pas * 0.3 && qab < pas * 0.8, "quality at-bat rate looks like baseball (" + Math.round(qab * 100 / pas) + "%)");
}
/* ---------------------------------------------------------------- scouting */
{
  const op = kept("Offense_Pitches"), gp = kept("Game_Pitches");
  let n = 0, all = 0;
  Object.keys(M.scout).forEach((k) => {
    const o = M.scout[k], key = (r) => r.Level === o.lv && (o.oppId ? r.OpponentID === o.oppId : String(r.Opponent).toLowerCase() === o.opp.toLowerCase());
    all++;
    const ps = new Set(op.filter(key).map((r) => r.Pitcher)), hs = new Set(gp.filter(key).map((r) => r.Batter));
    if (ps.size === o.pit.length && hs.size === o.hit.length && sum(o.pit, (p) => p.n) === op.filter(key).length) n++;
  });
  eq(n, all, "every scouting report's pitchers, hitters and pitch count");
}
/* ---------------------------------------------------------------- GameChanger */
{
  const gc = rows("GameChanger");
  let n = 0, all = 0;
  Object.keys(M.gcp).forEach((pid) => {
    const d = M.gcp[pid].d27; if (!d) return; all++;
    const mine = gc.filter((r) => r.Season === "2027" && r.PlayerID === pid);
    if (sum(mine, (r) => +r["Fld TC"] || 0) === d.tc && sum(mine, (r) => +r["Fld E"] || 0) === d.e && sum(mine, (r) => +r["Outs Total"] || 0) === d.outs) n++;
  });
  eq(n, all, "every player's 2027 chances, errors and innings from GameChanger");
  const t26 = gc.filter((r) => r.Season === "2026" && r.Status === "Team totals");
  eq(t26.length, 4, "4 2026 team lines");
  const v = t26.find((r) => r.Level === "Varsity");
  near(M.base.P.Varsity.free, (v["Pit BB"] + v["Pit HBP"]) * 100 / v["Pit BF"], "Varsity 2026 free bases from GameChanger");
  near(M.base.P.Program.fps, sum(t26, (r) => r["Pit FPS%"] * r["Pit BF"]) / sum(t26, (r) => r["Pit BF"]), "program 2026 first-pitch strikes weighted by batters faced");
  near(M.base.H.JV.obp, (() => { const r = t26.find((x) => x.Level === "JV"); return (r["Bat H"] + r["Bat BB"] + r["Bat HBP"]) / (r["Bat AB"] + r["Bat BB"] + r["Bat HBP"] + r["Bat SF"]); })(), "JV 2026 OBP");
  eq(Object.keys(M.gc).length, 0, "the raw GameChanger rows don't go to the page");
}
/* ---------------------------------------------------------------- reflections, comments, who's looking */
{
  eq(M.refl.length, rows("Reflections").length, "every reflection");
  ok(M.refl.every((r, i) => !i || M.refl[i - 1].date >= r.date), "reflections newest first");
  const cm = sum(Object.values(G.comments), (t) => t.length - 1);
  eq(M.comments.length, cm, "every comment");
  eq(M.comments[0].by, "Coach V", "a comment shows the coach's name, not his email");
  eq(M.me.levels.join(","), "Varsity", "Coach V coaches Varsity");
  eq(load(T, {}, "coachf@example.com").M.me.levels.join(","), "Freshman,Sophomore", "a coach on 2 levels");
  eq(load(T, {}, "jim@example.com").M.me.levels.length, 4, "All = every level");
  eq(load(T, {}, "nobody@example.com").M.me.levels.length, 0, "not on the Coaches tab: no levels");
}
/* ---------------------------------------------------------------- what must never count */
{
  const T2 = JSON.parse(JSON.stringify(T));
  /* a practice pen and a pitch row whose Records row never arrived */
  const h = T2.Bullpen_Pitches[0], row = T2.Bullpen_Pitches[1].slice();
  row[h.indexOf("Practice")] = "Y"; row[h.indexOf("Result")] = "Miss"; T2.Bullpen_Pitches.push(row);
  const row2 = T2.Game_Pitches[1].slice(); row2[0] = "ghost"; T2.Game_Pitches.push(row2);
  const M2 = load(T2, G.comments).M;
  eq(JSON.stringify(M2.pens), JSON.stringify(M.pens), "a practice pitch changes nothing");
  eq(JSON.stringify(M2.pit), JSON.stringify(M.pit), "a pitch from a half-written upload changes nothing");
  /* an empty Sheet builds */
  const E = {}; Object.keys(T).forEach((k) => { E[k] = [T[k][0]]; });
  const M3 = load(E, {}).M;
  eq(M3.pit.length + M3.hit.length + Object.keys(M3.pens).length + M3.games.length, 0, "an empty Sheet builds an empty model");
  eq(M3.base.P.Varsity.era, undefined, "with no 2026 import there is no 2026 line (and no real number in the code)");
  ok(JSON.stringify(M).length < 1500000, "the model stays small (" + Math.round(JSON.stringify(M).length / 1024) + " KB)");
}
console.log(pass + " model checks" + (fail ? ", " + fail + " FAILED" : ""));
if (fail) process.exit(1);
console.log("ALL MODEL CHECKS PASS");
