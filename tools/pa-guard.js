/* At-bat guard suite - Offense Chart v44 and Pitch Chart v24.

       cd titans-apps && python3 -m http.server 8807 &
       node tools/pa-guard.js

   Jim, Oct 15: "I can indicate an outcome of an at bat without ever selecting
   where the pitch was. We need to force that you can't advance to the next
   hitter without both the pitch type/location and result."

   Pitch type is sticky in both apps, so a plotted pitch always carries one. The
   rule is therefore: no result, no field tap and no Next without a plotted
   pitch. The one exception is IBB, the no-pitch intentional walk high school
   allows; it counts as a walk, and in the Pitch Chart it is charged to the
   pitcher and inning on screen when it was tapped.

   Every tap is a real click on the control a charter would use. Exits non-zero
   if anything fails. */
"use strict";
const { chromium } = require("playwright");
const { FILL_SETUP } = require("./game-ready.js");
const BASE = process.env.BASE || "http://localhost:8807";
let fails = 0, checks = 0;
function check(name, got, want) {
  checks++;
  const ok = String(got) === String(want);
  console.log((ok ? "  ok   " : "  MISS ") + name.padEnd(58) + got + (ok ? "" : "   (expected " + want + ")"));
  if (!ok) fails++;
}
/* v45 / v25: both game apps lock charting until a level is picked for the game.
   Pick one the way a charter would: tap a level on Setup, then go to charting. */
async function pickLevel(pg, path) {
  if (!/\/(offense|game)\//.test(path)) return;
  await pg.evaluate(() => {
    const b = document.querySelector('[data-lvl="Varsity"]');
    if (b && !b.classList.contains("on")) b.click();
  });
  await pg.waitForTimeout(150);
  /* v29: the Pitch Chart also needs the rest of Setup finished before it charts. */
  if (/\/game\//.test(path)) await pg.evaluate(FILL_SETUP);
  await pg.evaluate((isGame) => {
    /* v28: the Pitch Chart has the same Chart tab as the other two apps. */
    const t = document.getElementById("tab-chart"); if (t) t.click();
  }, /\/game\//.test(path));
  await pg.waitForTimeout(150);
}

async function open(b, path) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" });
  const pg = await ctx.newPage();
  pg.errs = []; pg.on("pageerror", e => pg.errs.push(String(e)));
  await pg.goto(BASE + path, { waitUntil: "load" });
  await pg.waitForTimeout(900);
  await pickLevel(pg, path);
  return pg;
}

/* ================================================================ OFFENSE */
async function offense(b) {
  console.log("\nOFFENSE CHART v44");
  const pg = await open(b, "/offense/index.html");
  await pg.evaluate(() => document.getElementById("tab-chart").click());
  const tap = sel => pg.click(sel, { timeout: 3000 });
  const plot = () => tap('#v-chart [data-r="2"][data-c="2"]');
  const res = k => tap('#results [data-res="' + k + '"]');
  const st = () => pg.evaluate(() => ({ n: O.pas.length, cur: O.cur, res: curPA().result,
    pitches: curPA().pitches.length, spray: !!curPA().spray, hint: document.getElementById("zoneHint").textContent }));

  /* 1. nothing plotted: a result is refused */
  await res("1B");
  let s = await st();
  check("a result with no pitch is refused", s.res === "" ? "refused" : "took " + s.res, "refused");
  check("and the hint says what to do", /Plot the pitch on the grid first/.test(s.hint), true);
  /* 2. the field */
  await tap("#diamond");
  check("a field tap with no pitch is refused", (await st()).spray, false);
  /* 3. Next hitter */
  await tap("#btnNextPA");
  s = await st();
  check("Next hitter with nothing charted stays put", s.n + " PA", "1 PA");
  /* 4. a pitch but no result: still refused */
  await plot();
  await tap("#btnNextPA");
  s = await st();
  check("a pitch but no result: Next hitter refused", s.n + " PA", "1 PA");
  /* 5. both: advances */
  await res("GO");
  await tap("#btnNextPA");
  s = await st();
  check("pitch + result: Next hitter advances", s.n + " PA", "2 PA");

  /* 6. IBB with no pitch */
  await res("IBB");
  s = await st();
  check("IBB is accepted with no pitch", s.res, "IBB");
  check("IBB reads as a walk for QAB", await pg.evaluate(() => qabReasons(curPA()).join(",")), "BB");
  await tap("#btnNextPA");
  s = await st();
  check("IBB with no pitch: Next hitter advances", s.n + " PA", "3 PA");
  /* 7. a mis-tapped IBB can be taken back, and then the guard applies again */
  await res("IBB"); await res("IBB");
  check("tapping IBB again takes it back", (await st()).res, "");
  await res("FO");
  check("after that, a batted result still needs a pitch", (await st()).res, "");
  /* 8. IBB mid-count is still fine and does not touch the last pitch */
  await plot(); await tap('#v-chart [data-mod="T"]');
  await res("IBB");
  check("IBB after a pitch keeps that pitch as thrown",
        await pg.evaluate(() => curPA().pitches[0].m + " " + curPA().result), "T IBB");
  await tap("#btnNextPA");

  /* 9. report + export */
  const rows = await pg.evaluate(() => hitterRows(O).reduce((n, o) => n + o.bb, 0));
  check("both IBBs count in the hitters' BB column", rows, 2);
  const csv = await pg.evaluate(() => csvOf(O).split("\n"));
  const head = csv[0].split(",");
  const ibb = csv.filter(l => l.split(",")[head.indexOf("PAResult")] === "IBB");
  check("the export carries both IBBs", ibb.length, 2);
  const zero = ibb.map(l => l.split(",")).find(r => r[head.indexOf("PitchNo")] === "");
  check("the no-pitch IBB has its own row, pitch columns blank", !!zero, true);
  if (zero) check("  and it names its PA and the count 0-0", zero[head.indexOf("PA")] + " " + zero[head.indexOf("CountB")] + "-" + zero[head.indexOf("CountS")], "2 0-0");
  check("every row has every column", csv.every(l => l.split(",").length >= head.length), true);

  /* 9b. Next hitter is its own guard: a game in progress from before v44 can
     already hold a result with no pitch, which the result guard never sees. */
  await pg.evaluate(() => { const a = curPA(); a.pitches = []; a.result = "1B"; render(); save(); });
  const n0 = (await st()).n;
  await tap("#btnNextPA");
  check("an old pitchless result still cannot go to Next hitter", (await st()).n, n0);
  await pg.evaluate(() => { const a = curPA(); a.result = ""; render(); save(); });

  /* 10. a game filed before v44 with a pitchless result still opens */
  const legacy = await pg.evaluate(() => { try { return qabReasons({ pitches: [], result: "1B" }).join(","); } catch (e) { return "threw " + e.message; } });
  check("a pre-v44 pitchless 1B still reads (as a hit)", legacy, "H");
  check("no page errors", pg.errs.join(" | "), "");
  check("no \"Something went wrong\" banner", await pg.evaluate(() => document.getElementById("noJs").hidden), true);
  await pg.context().close();
}

/* ================================================================ PITCH CHART */
/* The Pitch Chart keeps its functions inside a closure, so this half reads what
   a coach can see: the saved game, the export box and the printed pitcher line. */
async function game(b) {
  console.log("\nPITCH CHART v24");
  const pg = await open(b, "/game/index.html");
  await pg.evaluate(() => {
    const s = document.getElementById("suPitcher");   /* v30: the starter is set on Setup */
    s.value = window.TITANS_ROSTER[0].id; s.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await pg.waitForTimeout(200);
  const tap = sel => pg.click(sel, { timeout: 3000 });
  const zone = () => tap("#zone .cell:nth-child(13)");
  const res = k => tap('#results button[data-res="' + k + '"]');
  /* the saved game: the batter on screen, his live at-bat, and every closed one */
  const st = () => pg.evaluate(() => {
    const G = JSON.parse(localStorage.getItem("dugout-pitch-chart-v2"));
    const men = []; G.lineup.forEach(sp => sp.men.forEach(m => men.push(m)));
    const bat = men[0] && G.lineup[G.liveB] ? G.lineup[G.liveB].men[G.lineup[G.liveB].cur || 0] : null;
    const a = bat ? bat.abs[bat.abs.length - 1] : null;
    return { live: G.liveB, res: a ? a.result : null, pitches: a ? a.pitches.length : 0,
             spray: !!(a && a.spray), ibb: a ? a.ibbP + "/" + a.ibbInn : "" };
  });
  const exportTxt = async () => {
    await pg.evaluate(() => document.getElementById("btnExport").click());
    const t = await pg.evaluate(() => document.getElementById("exportText").value);
    await pg.evaluate(() => document.getElementById("exportPanel").classList.add("hidden"));
    return t;
  };

  await res("1B");
  let s = await st();
  check("a result with no pitch is refused", s.res == null ? "refused" : "took " + s.res, "refused");
  await tap("#diamond");
  check("a spray tap with no pitch is refused", (await st()).spray, false);
  const before = (await st()).live;
  await tap("#nextBtn");
  check("Next Batter with nothing charted stays put", (await st()).live, before);

  await zone();
  await tap("#nextBtn");
  check("a pitch but no result: Next Batter refused", (await st()).live, before);
  await res("GO");
  await tap("#nextBtn");
  s = await st();
  check("pitch + result: Next Batter advances", s.live !== before, true);

  const b2 = s.live;
  await res("IBB");
  s = await st();
  check("IBB is accepted with no pitch", s.res, "IBB");
  check("it is stamped with the pitcher and inning on screen", s.ibb, "0/1");
  await tap("#nextBtn");
  check("IBB with no pitch: Next Batter advances", (await st()).live !== b2, true);

  /* the printed pitcher line and the pitch log */
  const txt = await exportTxt();
  const line = (txt.split("\n").find(l => /^\s+Line\s+IP/.test(l)) || "").replace(/\s+/g, " ").trim();
  check("pitcher line: 2 batters faced, 1 walk", /BF 2 /.test(line) && /BB 1 /.test(line), true);
  const eff = (txt.split("\n").find(l => /<=3 pitches/.test(l)) || "").replace(/\s+/g, " ").trim();
  check("the IBB is not an efficient at-bat (<=3 pitches)", /<=3 pitches 1 /.test(eff), true);
  const log = txt.split("\n"), hi = log.findIndex(l => /^Inning\tSpot\tBatter/.test(l));
  check("found the pitch log", hi >= 0, true);
  if (hi >= 0) {
    const head = log[hi].split("\t");
    const ibbRows = log.slice(hi + 1).filter(l => l.split("\t")[head.indexOf("ABResult")] === "IBB");
    check("the pitch log has a row for the no-pitch IBB", ibbRows.length, 1);
    if (ibbRows[0]) {
      const r = ibbRows[0].split("\t");
      check("  with a full set of columns", r.length, head.length);
      check("  inning 1, a blank pitch, and the pitcher named", r[0] + "|" + r[head.indexOf("Pitch")] + "|" + (r[head.indexOf("Pitcher")] !== ""), "1||true");
    }
  }
  const led = await pg.evaluate(() => document.getElementById("innLedger").textContent);
  check("the inning ledger renders", led.length > 0, true);

  /* Next Batter is its own guard: a game in progress from before v24 can already
     hold a result with no pitch. Seed one into the saved game and reload. */
  await pg.evaluate(() => {
    const G = JSON.parse(localStorage.getItem("dugout-pitch-chart-v2"));
    const sp = G.lineup[G.liveB], m = sp.men[sp.cur || 0], a = m.abs[m.abs.length - 1];
    a.pitches = []; a.result = "1B"; a.auto = false;
    localStorage.setItem("dugout-pitch-chart-v2", JSON.stringify(G));
  });
  await pg.reload({ waitUntil: "load" }); await pg.waitForTimeout(800);
  await pickLevel(pg, "/game/index.html");
  const liveOld = (await st()).live;
  await tap("#nextBtn");
  check("an old pitchless result still cannot go to Next Batter", (await st()).live, liveOld);
  await tap("#btnUndo");

  /* Undo is the way out of a mis-tapped IBB */
  await res("IBB");
  await tap("#btnUndo");
  check("Undo takes a mis-tapped IBB back", (await st()).res, null);
  check("no page errors", pg.errs.join(" | "), "");
  await pg.context().close();
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    args: ["--host-resolver-rules=MAP script.google.com ~NOTFOUND, MAP *.googleusercontent.com ~NOTFOUND", "--no-proxy-server"] });
  try { await offense(b); } catch (e) { console.log("  x  offense threw: " + e.stack); fails++; }
  try { await game(b); } catch (e) { console.log("  x  pitch chart threw: " + e.stack); fails++; }
  await b.close();
  console.log("\n" + checks + " at-bat guard checks");
  console.log(fails ? "FAILURES: " + fails : "ALL AT-BAT GUARD CHECKS PASS");
  process.exit(fails ? 1 : 0);
})();
