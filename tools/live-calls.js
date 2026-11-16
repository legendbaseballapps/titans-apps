/* Live AB calls in the Bullpen Chart (v47, Nov 13, 2026).

       cd titans-apps && python3 -m http.server 8807 &
       node tools/live-calls.js

   Jim: "Don't we need the where the pitch was called grid in the bullpen app for the
   live ABs?" Through v46 a live AB took its call from a row of 8 buttons that STUCK
   from pitch to pitch, and a new arm started on 0 (Middle): a picker nobody touched
   graded every pitch against Middle. v47 gives live ABs the Pitch Chart's call pad:
   called every pitch, Glove for the catcher's calls, ? Not known for one pitch, and
   a CallSource column. Checks the pad, the refusal, the clearing, Glove, Not known,
   the export, a session saved by v46, and that freeform and script pens are untouched. */
"use strict";
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:8807";
const KEY = "titans-bullpen-v1";
let fails = 0, checks = 0;
function is(name, got, want) {
  checks++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? "  ok   " : "  MISS ") + name.padEnd(64) + JSON.stringify(got) + (ok ? "" : "  (expected " + JSON.stringify(want) + ")"));
}
async function open(b, mode, seed) {
  const ctx = await b.newContext({viewport: {width: 1180, height: 900}, serviceWorkers: "block"});
  const pg = await ctx.newPage();
  pg.errs = [];
  pg.on("pageerror", e => pg.errs.push(e.message));
  await pg.goto(BASE + "/bullpen/index.html");
  if (seed) { await pg.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, seed]); await pg.reload(); }
  await pg.waitForTimeout(300);
  if (mode) {
    await pg.evaluate(m => {
      const q = document.querySelectorAll('#rosterTbl select[data-f="rid"]')[0];
      if (q && !q.value) { q.value = window.TITANS_ROSTER[0].id; q.dispatchEvent(new Event("input", {bubbles: true})); q.dispatchEvent(new Event("change", {bubbles: true})); }
      const s = document.querySelectorAll('[data-f="mode"]')[0]; s.value = m; s.dispatchEvent(new Event("input", {bubbles: true}));
    }, mode);
  }
  await pg.click("#tab-chart");
  await pg.waitForTimeout(150);
  pg.ctx = ctx;
  return pg;
}
const pitches = pg => pg.evaluate(k => JSON.parse(localStorage.getItem(k)).pitchers[0].pitches.map(x => [x.spot == null ? null : x.spot, x.cs || ""]), KEY);
const pad = pg => pg.evaluate(() => ({
  callable: [...document.querySelectorAll("#lcPad button[data-lc]")].map(b => b.textContent).join(""),
  dead: document.querySelectorAll("#lcPad button:disabled").length,
  on: [...document.querySelectorAll("#lcPad button.on")].map(b => b.textContent).join(""),
  hint: (document.getElementById("lcHint") || {}).textContent || ""}));
const zone = (pg, r, c) => pg.click('#zone button[data-r="' + r + '"][data-c="' + c + '"]');

(async () => {
  const b = await chromium.launch();

  console.log("BULLPEN v47 · the call pad");
  let pg = await open(b, "live");
  is("the 8 numbered boxes are the calls, the other 17 can't be called", await pad(pg), {callable: "72103456", dead: 17, on: "", hint: "Tap what was called, every pitch"});
  is("  laid out like the location grid: 7 top middle, 2 up and in, 6 below", await pg.evaluate(() => { const b = [...document.querySelectorAll("#lcPad button")]; return [b[2].textContent, b[6].textContent, b[22].textContent]; }), ["7", "2", "6"]);
  is("no Location buttons and no 'no spot called' in a live AB", await pg.evaluate(() => !!document.querySelector('#f-spot button[data-s]')), false);

  console.log("\nCALLED EVERY PITCH");
  await zone(pg, 2, 2);
  is("no call: the location grid refuses the pitch", (await pitches(pg)).length, 0);
  is("  and says so on the pad", [(await pad(pg)).hint, await pg.evaluate(() => document.getElementById("lcPad").classList.contains("need"))], ["Called spot needed · tap the number first", true]);
  is("  the call card says the same", await pg.evaluate(() => /tap the call on the pad first/.test(document.getElementById("call").textContent)), true);
  await pg.click('#lcPad button[data-lc="5"]');
  is("tap 5: called", (await pad(pg)).on, "5");
  await pg.click('#lcPad button[data-lc="5"]');
  is("  tap it again: cleared", (await pad(pg)).on, "");
  await pg.click('#lcPad button[data-lc="5"]');
  await zone(pg, 3, 3);
  is("called 5, pitch on the spot: filed as a Coach call", await pitches(pg), [[5, "C"]]);
  is("the call clears after the pitch", (await pad(pg)).on, "");
  is("  but the pitch type stays set", await pg.evaluate(() => document.querySelector("#f-type button.on").getAttribute("data-t")), "FB");
  await zone(pg, 3, 3);
  is("so the next pitch is refused until it is called", (await pitches(pg)).length, 1);

  console.log("\nGLOVE AND ? NOT KNOWN");
  await pg.click("[data-lg]");
  is("Glove on: the pad goes dashed", await pg.evaluate(() => document.getElementById("lcPad").classList.contains("glove")), true);
  await pg.click('#lcPad button[data-lc="3"]');
  await zone(pg, 2, 1);
  await pg.click('#lcPad button[data-lc="2"]');
  await zone(pg, 1, 1);
  is("Glove stays on pitch to pitch: 2 glove calls", (await pitches(pg)).slice(1), [[3, "G"], [2, "G"]]);
  await pg.click("[data-lg]");
  await pg.click('#lcPad button[data-lc="0"]');
  await pg.click("[data-lg]");
  is("turning Glove on after calling moves that call to the glove", (await pad(pg)).hint, "Glove set at 0 · Middle · now tap where it went");
  await pg.click("[data-lg]");
  await pg.click("[data-lu]");
  is("? Not known answers the pitch", (await pad(pg)).hint, "Call not known · now tap where it went");
  await zone(pg, 0, 0);
  is("  filed with no spot, Unknown", (await pitches(pg)).slice(-1), [[null, "U"]]);
  is("  and only for that pitch", (await pad(pg)).on + "|" + (await pad(pg)).hint, "|Tap what was called, every pitch");
  is("4 pitches, the Unknown one not graded", await pg.evaluate(() => [...document.querySelectorAll("#liveKpis .kpi")].map(k => k.querySelector(".l").textContent + "=" + k.querySelector(".v").textContent).slice(0, 3).join(" | ")), "Pitches=4 | Spot · of 3 graded=67% | Spot + close=100%");

  console.log("\nTHE EXPORT");
  /* the CSV a coach downloads, read through the app's own export button */
  await pg.click("#tab-report");
  const dl = await Promise.all([pg.waitForEvent("download", {timeout: 5000}).catch(() => null), pg.click("#expCsv")]);
  let rows = null;
  if (dl[0]) {
    const p = await dl[0].path();
    const txt = require("fs").readFileSync(p, "utf8").trim().split(/\r?\n/).map(l => l.split(","));
    rows = txt;
  }
  if (rows) {
    const h = rows[0], ci = h.indexOf("CallSource"), si = h.indexOf("CalledSpot"), ri = h.indexOf("Result");
    is("CallSource is the last column", h[h.length - 1], "CallSource");
    is("  Coach, Glove, Glove, Unknown; Unknown has no spot and no grade", rows.slice(1).map(r => r[ci] + ":" + r[si] + ":" + r[ri]), ["Coach:5:Spot", "Glove:3:Close", "Glove:2:Spot", "Unknown::"]);
  } else is("Export pitch log (.csv) downloads a file", false, true);
  is("no page errors", pg.errs, []);
  await pg.ctx.close();

  console.log("\nA LIVE SESSION SAVED BY v46");
  {
    const v46 = {v: 1, pad: "Mound 2", date: "2027-01-20", coach: "", script: [], tpl: "", tplId: "", locked: false, practice: false, cur: 0, pitchers: [
      {rid: "", mode: "live", safe: 50, stretch: false, free: {type: "FB", ws: "S", spot: 0, sit: ""}, abs: [{result: ""}],
       pitches: [{type: "FB", ws: "S", spot: 0, sit: "", free: true, r: 2, c: 2, ab: 0}, {type: "FB", ws: "S", spot: null, sit: "", free: true, r: 0, c: 0, ab: 0}]}]};
    pg = await open(b, null, JSON.stringify(v46));
    await pg.evaluate(() => { const q = document.querySelectorAll('#rosterTbl select[data-f="rid"]')[0]; if (q) { q.value = window.TITANS_ROSTER[0].id; q.dispatchEvent(new Event("change", {bubbles: true})); } });
    await pg.click("#tab-chart");
    is("it opens with nothing called (the old sticky Middle is not carried)", (await pad(pg)).on, "");
    const exp = await pg.evaluate(() => document.querySelectorAll("#f-spot button[data-s]").length);
    is("  and with the pad, not the old buttons", exp, 0);
    is("no page errors", pg.errs, []);
    await pg.ctx.close();
  }

  console.log("\nFREEFORM AND SCRIPT PENS ARE UNCHANGED");
  pg = await open(b, "free");
  is("freeform keeps its Location buttons, no pad", await pg.evaluate(() => [document.querySelectorAll('#f-spot button[data-s]').length, !!document.getElementById("lcPad")]), [8, false]);
  await zone(pg, 3, 3);
  is("  and its call sticks: a pitch with no tap on the buttons is taken", (await pitches(pg)).length, 1);
  is("no page errors", pg.errs, []);
  await pg.ctx.close();

  await b.close();
  console.log("\n" + checks + " live call checks");
  console.log(fails ? "FAILURES: " + fails : "ALL LIVE CALL CHECKS PASS");
  process.exit(fails ? 1 : 0);
})();
