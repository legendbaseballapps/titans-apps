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
  ["reminder for every old card", 'if (group.indexOf(latest[s_(r.PlayerID)]) < 0) continue;', ''],
  ["reminders repeat", 'if (group.some(function (x) { return s_(x.ReminderAt); })) continue;', ''],
  /* two-way games (Nov 13) */
  ["two-way never bundles", 'if (prec && due(prec)) {', 'if (false) {'],
  ["doubleheader bundles", 'if (same !== 1 || hits.length !== 1) return null;', 'if (!hits.length) return null;'],
  ["late upload bundles after the fact", 'if (c2 && !done[c2.key]) cs =', 'if (c2) cs ='],
  ["2 reminders for a pair", 'if (b) { if (seen[b]) continue; seen[b] = 1; }', ''],
  ["2 forms share their buttons", "f.querySelectorAll('.scale')", "document.querySelectorAll('.scale')"],
  ["last START crosses sides", '|| side(k) !== side(key)) return;', ') return;'],
  ["process box twice", 'c.body.replace(box, "")', 'c.body'],
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
  ["batting order does not wrap", 'var dx = (x.spot - next + n) % n, dy = (y.spot - next + n) % n;', 'var dx = x.spot, dy = y.spot;'],
  ["foul with 2 strikes adds a strike", 'else if (c === "foul" && st < 2) st++;', 'else if (c === "foul") st++;'],
  ["two-out counts outs wrong", 'outs += OUTS_OF[a.result] || 0;', 'outs += 1;'],
  ["IBB not a free base", 'var FREE = {BB: 1, IBB: 1, HBP: 1};', 'var FREE = {BB: 1, HBP: 1};'],
  ["4-pitch walk ignores a strike", 'if (a.result === "BB" && a.pitches === 4 && a.allBalls) o.four++;', 'if (a.result === "BB" && a.pitches >= 4) o.four++;'],
  ["sins guessed without innings", 'if (s_(r.Inning) === "") return null;', ''],
  ["process box missing on the hitter card", 'chased off the plate"));\n  body += processBox_();', 'chased off the plate"));'],
  ["process answers not required", 'if (!ans.pre || !ans.reset) return {ok: false, error: "Answer the pre-pitch and reset questions."};', ''],
  ["any process answer accepted", 'ans.pre = PRE_ANS.indexOf(s_(o.pre)) >= 0 ? s_(o.pre) : "";', 'ans.pre = s_(o.pre);'],
  ["counter uses one rate for every level", 'L.saved = L.bf * d.goals.base[lv] / 100 - L.free;', 'L.saved = L.bf * d.goals.base.Varsity / 100 - L.free;'],
  ["counter counts later games", 'counterLine_(freeSaved_(d, seasonRecs), G.saveGoal)', 'counterLine_(freeSaved_(d, d.byRec), G.saveGoal)'],
  ["counter ignores Config goal", 'o.saveGoal = v(SAVE_GOAL);', 'o.saveGoal = SAVE_GOAL.v;'],
  ["K per walk counts hit batters", 'if (a.result === "BB" || a.result === "IBB") sBB++;', 'if (FREE[a.result]) sBB++;'],
  ["missed goal shows nothing", 'p == null ? "" : (met ? CHECK : RING),', 'p == null ? "" : (met ? CHECK : ""),'],
  ["older Reflections tab not extended", 'sheet_(ss, "Reflections", REFL_HEAD);           /* adds', '/* adds'],
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
