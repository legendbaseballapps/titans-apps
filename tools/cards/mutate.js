/* Proves the card checks can fail: each mutation reintroduces one bug in a copy of
   cards/Code.gs, and tools/cards/cards.js must catch it.   node tools/cards/mutate.js */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), { spawnSync } = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "cards", "Code.gs"), "utf8");
const M = [
  ["test mode emails the player", 'msg = {to: cfg.testTo, subject: "[TEST for "', 'msg = {to: m.to, subject: "[TEST for "'],
  ["admin guard always lets in", 'function guard_(e) {', 'function guard_(e) { return;'],
  ["old records card", '(!from || Date.parse(s_(r.ReceivedAt)) >= from)', 'true'],
  ["practice rows card", 'return s_(r.Practice).toUpperCase() !== "Y";', 'return true;'],
  ["coach-only note on the pitcher card", 'noteOf_(d.gameNotes, rid, "PitcherID", pid, "ToPitcher")', 'noteOf_(d.gameNotes, rid, "PitcherID", pid, "CoachOnly")'],
  ["coach-only note on the hitter card", 'noteOf_(d.offNotes, rid, "HitterID", pid, "ToHitter")', 'noteOf_(d.offNotes, rid, "HitterID", pid, "CoachOnly")'],
  ["save skips the ownership check", 'if (!card) return {ok: false, error: "Card not found."};', 'card = card || {};'],
  ["text not forced", 'return v === "" ? "" : "\'" + v;', 'return v;'],
  ["reminder for every old card", 'if (latest[s_(r.PlayerID)] !== r) continue;', ''],
  ["reminders repeat", 'if (!/^(sent|test)$/.test(st) || s_(r.ReminderAt) ||', 'if (!/^(sent|test)$/.test(st) ||'],
  ["quota ignored", 'if (budget < cost) { finished = false; out.waiting++; continue; }', ''],
  ["flag ignores level", 'var lvOk = !level ||', 'var lvOk = true ||'],
  ["flag ignores role", 'var roleOk = n.indexOf("both") >= 0', 'var roleOk = true || n.indexOf("both") >= 0'],
  ["token prefix matches", 'if (s_(rows[i].Token) === tok)', 'if (s_(rows[i].Token).slice(0, 39) === tok.slice(0, 39))'],
  ["parent not copied", 'if (m.cc) msg.cc = m.cc;', ''],
  ["Send No ignored", 'else if (/^no/i.test(s_(who.Send))) row.Status = "Send is No";', ''],
  ["last pen is the wrong one", 'if (!prev || before_(prev, r)) prev = r;', 'if (!prev) prev = r;'],
  ["first-pitch strikes miscounted", 'if (s_(f.Strike) === "Y" ||', 'if ('],
  ["one reflection per card not enforced", 'if (have[key]) return {ok: true, already: true};', ''],
  ["ratings unchecked", 'if (!(arm >= 1 && arm <= 5 && arm % 1 === 0) ||', 'if ('],
  ["off mode sends", 'if (cfg.mode === "off") return false;', ''],
  ["records re-sent", 'if (!c || done[c.key]) continue;', 'if (!c) continue;'],
  ["front shoulder flags", 'has(ssc, FLAG_STRONG_PHYSICAL)', 'has(ssc, FLAG_PHYSICAL)'],
  ["page shows other players' cards", 'return s_(r.PlayerID) === pid && /^(sent|test)$/.test(s_(r.Status));', 'return /^(sent|test)$/.test(s_(r.Status));']
];
const RSRC = fs.readFileSync(path.join(ROOT, "cards", "Reflections.gs"), "utf8");
const RM = [
  ["coaches page skips the Coaches tab check", 'if (!coaches.length) return', 'if (false) return'],
  ["coaches page prints raw text", 'line_("START", r.Start)', '"<div>" + r.Start + "</div>"'],
  ["coaches page ignores the flag filter", '&& (!flagged || String(r.Flag))', '']
];
let caught = 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cards-mut-"));
M.forEach(([name, a, b]) => {
  if (!SRC.includes(a)) { console.log("MISSING TARGET: " + name); process.exitCode = 1; return; }
  const f = path.join(tmp, "Code.gs");
  fs.writeFileSync(f, SRC.replace(a, b));
  const r = spawnSync(process.execPath, [path.join(__dirname, "cards.js")], { env: Object.assign({}, process.env, { CARDS_CODE: f }), encoding: "utf8" });
  if (r.status !== 0) caught++; else { console.log("NOT CAUGHT: " + name); process.exitCode = 1; }
});
RM.forEach(([name, a, b]) => {
  if (!RSRC.includes(a)) { console.log("MISSING TARGET: " + name); process.exitCode = 1; return; }
  const f = path.join(tmp, "Reflections.gs");
  fs.writeFileSync(f, RSRC.replace(a, b));
  const r = spawnSync(process.execPath, [path.join(__dirname, "cards.js")], { env: Object.assign({}, process.env, { CARDS_REFL: f }), encoding: "utf8" });
  if (r.status !== 0) caught++; else { console.log("NOT CAUGHT: " + name); process.exitCode = 1; }
});
console.log(caught + " of " + (M.length + RM.length) + " mutations caught");
