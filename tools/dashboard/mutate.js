/* Proves the dashboard checks can fail: each mutation puts one bug into a copy of
   dashboard/Code.gs, and tools/dashboard/dashboard.js must catch it.
     node tools/dashboard/mutate.js */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), { spawnSync } = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "dashboard", "Code.gs"), "utf8");
const M = [
  ["skips the Coaches check", 'if (!coach) return', 'if (false) return'],
  ["practice rows count", 'return recs[s_(r.RecordID)] && s_(r.Practice).toUpperCase() !== "Y";', 'return !!recs[s_(r.RecordID)];'],
  ["one rate for every level", 'o.saved = o.bf * L.rate / 100 - o.free;', 'o.saved = o.bf * S.lv.Varsity.rate / 100 - o.free;'],
  ["pace ignores the schedule", 'o.pace = L.share * Math.min(1, o.nGames / L.games);', 'o.pace = L.share * o.nGames / 86;'],
  ["Config goal ignored", 'saveGoal: v(SAVE_GOAL.setting, SAVE_GOAL.v)', 'saveGoal: SAVE_GOAL.v'],
  ["budget is less than", 'g.won = g.free <= S.budget;', 'g.won = g.free < S.budget;'],
  ["HBP counted as a walk", 'if (a.result === "BB" || a.result === "IBB") o.bb++;', 'if (a.result === "BB" || a.result === "IBB" || a.result === "HBP") o.bb++;'],
  ["WHIP leaves out walks", 'whip:   ip ? (o.bb + o.hits) / ip : null,', 'whip:   ip ? o.hits / ip : null,'],
  ["ERA on 9 innings", 'era:    ip ? o.er * 7 / ip : null', 'era:    ip ? o.er * 9 / ip : null'],
  ["hard contact over all at-bats", 'if (INPLAY[a.result]) { o.bip++; if (a.hard) o.hard++; }', 'o.bip++; if (a.hard) o.hard++;'],
  ["unearned share flipped", 'uer:    o.runs ? (o.runs - o.er) * 100 / o.runs', 'uer:    o.runs ? o.er * 100 / o.runs'],
  ["level read from the Record only", 'return levelName_(s_(r.Level) || s_((recs[s_(r.RecordID)] || {}).Team));', 'return levelName_(s_((recs[s_(r.RecordID)] || {}).Team) || "Varsity");'],
  ["met marker backwards for or-less goals", 'var met = g.more ? x >= gv - 1e-9 : x <= gv + 1e-9;', 'var met = x >= gv - 1e-9;'],
  ["Date cells not read as dates", 'if (Object.prototype.toString.call(v) === "[object Date]") {', 'if (false) {'],
  ["phone layout overflows", '".scroll{overflow-x:auto}table{', '"table{']
];
let caught = 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dash-mut-"));
M.forEach(([name, a, b, a2, b2]) => {
  if (!SRC.includes(a) || (a2 && !SRC.includes(a2))) { console.log("MISSING TARGET: " + name); process.exitCode = 1; return; }
  const f = path.join(tmp, "Code.gs");
  let src = SRC.replace(a, b);
  if (a2) src = src.replace(a2, b2);
  fs.writeFileSync(f, src);
  const args = [path.join(__dirname, "dashboard.js")];
  if (name === "phone layout overflows") args.push(path.join(tmp, "shots"));
  const r = spawnSync(process.execPath, args, { env: Object.assign({}, process.env, { DASH_CODE: f }), encoding: "utf8" });
  if (r.status !== 0) caught++; else { console.log("NOT CAUGHT: " + name); process.exitCode = 1; }
});
console.log(caught + " of " + M.length + " mutations caught");
