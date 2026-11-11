/* Outs and the inning in the Offense Chart (v53, Nov 2026).

       cd titans-apps && python3 -m http.server 8807 &
       node tools/offense-innings.js

   Jim, Nov 11: "Let's add the outs and inning to the offense chart." Same rules
   as the Pitch Chart: outs come from the result, a dot is tapped only for an out
   the result can't see, and the third out rolls the inning at Next hitter.
   Every tap here is a real click on the control a charter would touch.
   Exits non-zero if anything fails. */
"use strict";
const { chromium } = require("playwright");
const { FILL_OFFENSE } = require("./game-ready.js");
const BASE = process.env.BASE || "http://localhost:8807";
let fails = 0, checks = 0;
function check(name, got, want) {
  checks++;
  const ok = String(got) === String(want);
  console.log((ok ? "  ok   " : "  MISS ") + name.padEnd(60) + got + (ok ? "" : "   (expected " + want + ")"));
  if (!ok) fails++;
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" });
  const pg = await ctx.newPage();
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(BASE + "/offense/index.html", { waitUntil: "load" });
  await pg.waitForTimeout(800);
  await pg.evaluate(() => { const l = document.querySelector('[data-lvl="Varsity"]'); if (l && !l.classList.contains("on")) l.click(); });
  await pg.evaluate(FILL_OFFENSE);
  await pg.evaluate(() => document.getElementById("tab-chart").click());
  await pg.waitForTimeout(200);

  const tap = sel => pg.click(sel, { timeout: 3000 });
  const plot = (r, c) => tap('#v-chart [data-r="' + r + '"][data-c="' + c + '"]');
  const res = k => tap('#results [data-res="' + k + '"]');
  const mod = m => tap('#v-chart [data-mod="' + m + '"]');
  const next = () => tap("#btnNextPA");
  const dot = n => tap('#outs [data-out="' + n + '"]');
  const st = () => pg.evaluate(() => ({
    inn: document.getElementById("innNow").textContent,
    dots: document.querySelectorAll("#outs .outdot.on").length,
    outs: O.outs, inning: O.inning, btn: document.getElementById("btnNextPA").textContent.trim(),
    pa: { inn: curPA().inn, outs: curPA().outs }
  }));

  console.log("\nA FRESH GAME");
  let s = await st();
  check("starts in inning 1", s.inn, "1");
  check("with no out dots lit", s.dots, 0);
  check("the first hitter is stamped inning 1, 0 outs", s.pa.inn + "/" + s.pa.outs, "1/0");
  check("the dots sit in the hitter strip beside the count", await pg.evaluate(() => !!document.querySelector(".batstrip .sitbox #outs") && !!document.querySelector(".batstrip #innNow")), true);

  console.log("\nOUTS FOLLOW THE RESULT");
  await plot(2, 2); await res("GO");
  check("a ground out lights 1 dot", (await st()).dots, 1);
  await res("GO");                                   /* take it back */
  check("taking the result off takes the out back", (await st()).dots, 0);
  await res("1B"); await tap('#trajRow [data-tr="GB"]');
  check("a single adds no out", (await st()).dots, 0);
  await res("1B"); await res("FO");
  check("changing 1B to FO adds the out", (await st()).dots, 1);
  await next();
  s = await st();
  check("the next hitter came up with 1 out", s.pa.inn + "/" + s.pa.outs, "1/1");
  /* a strikeout closes itself from the count */
  await plot(2, 2); await plot(2, 2); await plot(2, 2);
  check("strike 3 is a K and the second out", (await st()).dots, 2);
  await tap("#btnUndo");
  check("undoing strike 3 takes the out back", (await st()).dots, 1);
  await plot(2, 2);
  check("and charting it again puts it back", (await st()).dots, 2);
  await next();

  console.log("\nMOVED A RUNNER NEEDS FEWER THAN 2 OUTS");
  s = await st();
  check("this hitter came up with 2 outs", s.pa.outs, 2);
  await plot(2, 2); await res("GO");
  check("the chip is dimmed", await pg.evaluate(() => document.getElementById("qfAdv").className), "off");
  await tap("#qfAdv");
  check("and refuses the tap", await pg.evaluate(() => !!curPA().adv), false);
  check("a stray flag still wouldn't count", await pg.evaluate(() => qabReasons(Object.assign({}, curPA(), { adv: true })).indexOf("ADV")), -1);

  console.log("\nTHE THIRD OUT ROLLS THE INNING");
  s = await st();
  check("3 dots lit after the third out", s.dots, 3);
  check("the button says End the inning", s.btn, "End the inning →");
  check("the inning hasn't moved yet (spray still to come)", s.inn, "1");
  await next();
  s = await st();
  check("now inning 2", s.inn, "2");
  check("with nobody out", s.dots, 0);
  check("the button is Next hitter again", s.btn, "Next hitter →");
  check("the leadoff man is stamped inning 2, 0 outs", s.pa.inn + "/" + s.pa.outs, "2/0");
  check("the moved-runner chip works again with 0 outs", await pg.evaluate(() => (curPA().outs)), 0);

  console.log("\nA DOUBLE PLAY IS 2 OUTS");
  await plot(2, 2); await res("1B"); await tap('#trajRow [data-tr="LD"]'); await next();
  await plot(2, 2); await res("DP");
  check("DP lights 2 dots", (await st()).dots, 2);
  await next();

  console.log("\nDOTS ARE FOR OUTS THE RESULT CAN'T SEE");
  check("this hitter came up with 2 outs", (await st()).pa.outs, 2);
  await dot(2);                                       /* tapping the lit dot takes one back */
  s = await st();
  check("tapping the lit 2nd dot takes it back to 1", s.dots, 1);
  check("a hitter with no pitch yet moves with it", s.pa.outs, 1);
  await dot(2);
  await dot(3);                                       /* caught stealing ends the inning */
  s = await st();
  check("a 3rd out on the bases before a pitch rolls the inning now", s.inn, "3");
  check("nobody out", s.dots, 0);
  check("and he leads off inning 3", s.pa.inn + "/" + s.pa.outs, "3/0");

  console.log("\nTHE INN BOX FIXES IT");
  await tap("#innUp");
  s = await st();
  check("+ moves on an inning", s.inn, "4");
  check("and starts it at 0 outs", s.dots, 0);
  check("the hitter at the plate moves with it", s.pa.inn, 4);
  await tap("#innDown"); await tap("#innDown"); await tap("#innDown"); await tap("#innDown");
  check("− never goes below 1", (await st()).inn, "1");
  await tap("#innUp"); await tap("#innUp");
  check("back to 3", (await st()).inn, "3");

  console.log("\nREVIEWING AN EARLIER AT-BAT");
  await pg.evaluate(() => gotoPA(1));
  s = await st();
  check("the Inn box shows HIS inning", s.inn, "1");
  check("and the outs he came up with", s.dots, 1);
  check("the review bar says it", await pg.evaluate(() => /inning 1, 1 out/.test(document.getElementById("reviewBar").textContent)), true);
  await dot(3);
  check("a dot tap changes nothing while reviewing", await pg.evaluate(() => O.outs + "/" + O.inning), "0/3");
  await pg.evaluate(() => { O.cur = O.pas.length - 1; render(); });

  console.log("\nIT SURVIVES A REFRESH");
  await pg.reload({ waitUntil: "load" }); await pg.waitForTimeout(700);
  await pg.evaluate(() => document.getElementById("tab-chart").click()); await pg.waitForTimeout(150);
  s = await st();
  check("still inning 3, 0 outs", s.inn + "/" + s.dots, "3/0");

  console.log("\nTHE EXPORT");
  const t = await pg.evaluate(() => { const x = tableOf(O); return { head: x.head, rows: x.rows }; });
  const ci = t.head.indexOf("Inning"), co = t.head.indexOf("Outs");
  check("Inning and Outs are the last 2 columns", t.head.slice(-2).join(","), "Inning,Outs");
  check("the columns before them didn't move", t.head.indexOf("Practice"), t.head.length - 3);
  const byPA = {}; t.rows.forEach(r => { byPA[r[t.head.indexOf("PA")]] = r[ci] + "/" + r[co]; });
  check("PA 1: inning 1, 0 outs", byPA[1], "1/0");
  check("PA 2: inning 1, 1 out", byPA[2], "1/1");
  check("PA 3: inning 1, 2 outs", byPA[3], "1/2");
  check("PA 4: inning 2, 0 outs", byPA[4], "2/0");
  /* a game charted before v53 never knew: blank, never a made-up value */
  const old = await pg.evaluate(() => { const g = JSON.parse(JSON.stringify(O)); g.pas.forEach(a => { delete a.inn; delete a.outs; }); const x = tableOf(g); return x.rows[0].slice(-2).join("|"); });
  check("a pre-v53 game exports blank, not 0", old, "|");
  check("the upload carries the same columns", await pg.evaluate(() => upPayload(Object.assign({}, O, { rid: "x" })).tables.pitches.columns.slice(-2).join(",")), "Inning,Outs");

  console.log("\nA NEW GAME STARTS OVER");
  const fresh = await pg.evaluate(() => { const g = freshGame(); return g.inning + "/" + g.outs + "/" + g.pas[0].inn + "/" + g.pas[0].outs; });
  check("freshGame is inning 1, 0 outs, and so is its first hitter", fresh, "1/0/1/0");
  check("no page errors", errs.length, 0);

  await b.close();
  console.log("\n" + checks + " inning and outs checks" + (fails ? ", " + fails + " FAILED" : ""));
  if (fails) process.exit(1);
  console.log("ALL INNING AND OUTS CHECKS PASS");
})();
