/* Quality at-bats suite - Offense Chart v43 (E-010).

       cd titans-apps && python3 -m http.server 8807 &
       node tools/qab.js

   Part 1 runs the app's own qabReasons() against hand-built at-bats: every one
   of Jim's 9 rules, and the edge cases his Oct 15 answers settled (an error
   alone is not a QAB, any run counts, a moved runner counts even on an out).

   Part 2 drives the real Chart tab: the chips only appear for a ball in play,
   they go stale when the ball stops being in play, the live line tells the
   charter, the report counts and explains, and the CSV carries the two facts
   in the right columns.

   Exits non-zero if anything fails. */
"use strict";
const { chromium } = require("playwright");
const { FILL_SETUP, FILL_OFFENSE } = require("./game-ready.js");
const BASE = process.env.BASE || "http://localhost:8807";
let fails = 0, checks = 0;
function check(name, got, want) {
  checks++;
  const ok = String(got) === String(want);
  console.log((ok ? "  ok   " : "  MISS ") + name.padEnd(54) + got + (ok ? "" : "   (expected " + want + ")"));
  if (!ok) fails++;
}

/* Pitch shorthand: T = taken (S/B by where it was plotted), F foul, W whiff,
   X in play, H hit by pitch. Row 2 col 2 is the middle of the zone. */
const S = { m: "T", r: 2, c: 2, call: "S" }, B = { m: "T", r: 0, c: 0, call: "B" },
      F = { m: "F", r: 2, c: 2 }, W = { m: "W", r: 2, c: 2 }, X = { m: "X", r: 2, c: 2 },
      H = { m: "H", r: 2, c: 0 };
const pa = (pitches, result, more) => Object.assign({ pitches, result, traj: "", spot: 0 }, more || {});

const CASES = [
  /* the 9 rules, one at a time, each in a count where no other rule fires */
  ["a single",                          pa([X], "1B", { traj: "GB" }),          "H"],
  ["a home run",                        pa([B, X], "HR"),                       "H"],
  ["a line-drive out (LO)",             pa([X], "LO"),                          "LD"],
  ["a fly out the charter marked Line", pa([B, X], "FO", { traj: "LD" }),       "LD"],
  ["a walk",                            pa([B, B, B, B], "BB"),                 "BB"],
  ["hit by pitch",                      pa([H], "HBP"),                         "HBP"],
  ["sac bunt",                          pa([X], "SAC"),                         "SAC"],
  ["sac fly",                           pa([S, X], "SF"),                       "SAC"],
  ["groundout, run scored",             pa([X], "GO", { run: true }),           "RUN"],
  ["groundout, runner moved",           pa([X], "GO", { adv: true }),           "ADV"],
  ["K looking on pitch 7",              pa([B, B, S, F, F, B, S], "Kc"),        "P7"],
  ["groundout with 2 strikes",          pa([S, W, X], "GO"),                    "K2"],
  ["fouls keep it at 2 strikes",        pa([S, F, F, F, X], "PO"),              "K2"],
  /* Jim's answers */
  ["error alone is not a QAB",          pa([X], "E", { traj: "GB" }),           ""],
  ["error with 2 strikes is",           pa([S, S, X], "E", { traj: "GB" }),     "K2"],
  ["error that scores a run is",        pa([X], "E", { traj: "GB", run: true }), "RUN"],
  ["fielder's choice, run scored",      pa([X], "FC", { run: true }),           "RUN"],
  ["double play, run scored",           pa([X], "DP", { run: true }),           "RUN"],
  ["moved a runner on an out counts",   pa([B, X], "FO", { adv: true }),        "ADV"],
  /* the not-a-QAB side */
  ["routine fly out, 1-1",              pa([B, S, X], "FO"),                    ""],
  ["3-pitch strikeout",                 pa([S, S, W], "K"),                     ""],
  ["6 pitches is not 7",                pa([B, B, S, F, F, W], "K"),            ""],
  ["a stray Run flag on a K is ignored",pa([S, S, W], "K", { run: true }),      ""],
  ["a stray Moved flag on a walk is ignored", pa([B, B, B, B], "BB", { adv: true }), "BB"],
  /* several at once */
  ["2-strike line-drive single",        pa([S, S, X], "1B", { traj: "LD" }),    "H,LD,K2"],
  ["8-pitch walk",                      pa([B, S, F, F, B, F, B, B], "BB"),     "BB,P7"],
  ["sac fly with 2 strikes, run in",    pa([S, S, X], "SF", { run: true }),     "SAC,RUN,K2"],
];

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
  /* v48: and so does the Offense Chart. */
  if (/\/offense\//.test(path)) await pg.evaluate(FILL_OFFENSE);
  await pg.evaluate((isGame) => {
    /* v28: the Pitch Chart has the same Chart tab as the other two apps. */
    const t = document.getElementById("tab-chart"); if (t) t.click();
  }, /\/game\//.test(path));
  await pg.waitForTimeout(150);
}

async function part1(b) {
  console.log("\nRULES · qabReasons() on hand-built at-bats");
  const pg = await (await b.newContext({ serviceWorkers: "block" })).newPage();
  await pg.goto(BASE + "/offense/index.html", { waitUntil: "load" });
  await pg.waitForTimeout(800);
  const got = await pg.evaluate(cs => cs.map(([, a]) => {
    const r = qabReasons(a); return r === null ? "OPEN" : r.join(",");
  }), CASES);
  CASES.forEach(([name, , want], i) => check(name, got[i] === "" ? "(none)" : got[i], want === "" ? "(none)" : want));
  check("an open at-bat is neither", await pg.evaluate(() => qabReasons({ pitches: [{ m: "T", r: 2, c: 2, call: "S" }], result: "" })), null);
  check("SF is on the result pad, beside SAC", await pg.evaluate(() => RESULTS.slice(RESULTS.indexOf("SAC"), RESULTS.indexOf("SAC") + 2).join(" ")), "SAC SF");
  check("SF means a fly ball", await pg.evaluate(() => TRAJ_FROM_RESULT.SF), "FB");
  await pg.context().close();
}

/* ---------------------------------------------------------------- the UI */
async function part2(b) {
  console.log("\nCHART TAB · the chips, the line, the report, the export");
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" });
  const pg = await ctx.newPage();
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(BASE + "/offense/index.html", { waitUntil: "load" });
  await pg.waitForTimeout(900);
  await pickLevel(pg, "/offense/index.html");
  await pg.waitForTimeout(200);

  /* every tap is a real click on the control a charter would touch */
  const tap = sel => pg.click(sel, { timeout: 3000 });
  const plot = (r, c) => tap('#v-chart [data-r="' + r + '"][data-c="' + c + '"]');
  const res = k => tap('#results [data-res="' + k + '"]');
  const state = () => pg.evaluate(() => {
    const a = curPA();
    return { wrap: document.getElementById("qabWrap").hidden, run: !!a.run, adv: !!a.adv,
             line: document.getElementById("qabNow").textContent,
             runOn: document.getElementById("qfRun").className, advOn: document.getElementById("qfAdv").className };
  });

  /* PA 1: a pitch in the zone, then GO. Chips appear; tap Run scored. */
  await plot(2, 2);
  let st = await state();
  check("chips hidden while the ball is not in play", st.wrap, true);
  await res("GO");
  st = await state();
  check("chips appear once the result is a ball in play", st.wrap, false);
  check("a plain groundout says so", st.line, "Not a quality at-bat");
  await tap("#qfRun");
  st = await state();
  check("Run scored lights up and is stored", st.runOn + " " + st.run, "on true");
  check("the live line names the reason", st.line, "Quality at-bat · run scored");
  /* change the result to a strikeout: the fact no longer applies and must go */
  await res("GO");                                /* toggle GO off */
  await tap('#v-chart [data-mod="W"]');           /* the pitch was a whiff after all */
  st = await state();
  check("a ball no longer in play drops the run flag", st.run, false);
  await pg.evaluate(() => { const a = curPA(); a.pitches = []; a.result = ""; render(); save(); });

  /* PA 1 again, for real: 0-2 then grounds out, moving the runner. */
  await plot(2, 2); await tap('#v-chart [data-mod="W"]');
  await plot(2, 2); await tap('#v-chart [data-mod="W"]');
  await plot(2, 2); await res("GO"); await tap("#qfAdv");
  st = await state();
  check("two reasons at once, in rule order", st.line, "Quality at-bat · moved a runner, 2-strike contact");
  await tap("#btnNextPA");

  /* PA 2: first-pitch fly out. Not a QAB, and the chips are a refusal on a K. */
  await plot(2, 2); await res("FO");
  check("first-pitch fly out", (await state()).line, "Not a quality at-bat");
  await tap("#btnNextPA");

  /* PA 3: three called strikes. The chips must not be tappable into the record. */
  await plot(2, 2); await plot(2, 2); await plot(2, 2);
  st = await state();
  check("a strikeout closes itself and hides the chips", st.wrap, true);
  const forced = await pg.evaluate(() => { toggleQF("run"); return !!curPA().run; });
  check("toggleQF refuses a strikeout", forced, false);
  await tap("#btnNextPA");

  /* PA 4: sac fly. */
  await plot(2, 2); await res("SF");
  check("SF fills in the fly-ball trajectory", await pg.evaluate(() => trajOf(curPA())), "FB");
  check("sac fly is a QAB", (await state()).line, "Quality at-bat · sacrifice");
  await tap("#btnNextPA");

  /* ---- report */
  await pg.evaluate(() => { sel.rptP = "T"; document.getElementById("tab-report").click(); });
  await pg.waitForTimeout(300);
  const rpt = await pg.evaluate(() => {
    const p = [...document.querySelectorAll("#rpt .panel")].find(x => /Quality at-bats/.test(x.textContent));
    if (!p) return null;
    const rows = {};
    p.querySelectorAll("tbody tr").forEach(tr => { rows[tr.cells[0].textContent] = tr.cells[1].textContent; });
    const hdr = [...document.querySelectorAll("#rpt th")].map(t => t.textContent);
    return { head: p.querySelector(".phead").textContent, rows, hasCol: hdr.indexOf("QAB") >= 0 };
  });
  check("the report has a Quality at-bats panel", !!rpt, true);
  if (rpt) {
    check("team total", rpt.head.replace(/\s+/g, " ").trim(), "Quality at-bats2 of 4 · 50%".replace("bats2", "bats2"));
    check("moved a runner counted once", rpt.rows["Moved a runner into scoring position"], "1");
    check("2-strike contact counted once", rpt.rows["Ball in play with 2 strikes"], "1");
    check("the sac fly counted", rpt.rows["Sac bunt or fly"], "1");
    check("no hits, shown as a dash", rpt.rows["Hit"], "—");
    check("Our hitters has a QAB column", rpt.hasCol, true);
  }

  /* ---- export */
  const csv = await pg.evaluate(() => csvOf(O).split("\n"));
  const head = csv[0].split(",");
  /* Found by name: v45 appended Level and Practice after them. */
  const iRun = head.indexOf("RunScored"), iAdv = head.indexOf("MovedRunner");
  check("export has RunScored, MovedRunner side by side", (iRun > 0 && iAdv === iRun + 1), true);
  check("  appended after SprayDepth", iRun, head.indexOf("SprayDepth") + 1);
  check("every older column kept its place", head.indexOf("SprayDepth"), 34);
  const lastOf = n => csv.filter(l => l.split(",")[10] === String(n)).slice(-1)[0].split(",");
  const pick = (row) => row[iRun] + "/" + row[iAdv];
  check("PA 1, in play with a moved runner", pick(lastOf(1)), "N/Y");
  check("PA 2, in play, nothing tapped", pick(lastOf(2)), "N/N");
  check("PA 3, a strikeout: blank, not N", pick(lastOf(3)), "/");
  check("PA 4 result is SF", lastOf(4)[head.indexOf("PAResult")], "SF");
  const early = csv.filter(l => l.split(",")[10] === "1");
  check("only the last pitch of a PA carries the facts", pick(early[0].split(",")), "/");

  /* ---- an at-bat filed before v43 has no flags at all */
  const old = await pg.evaluate(() => qabReasons({ pitches: [{ m: "X", r: 2, c: 2 }], result: "GO", traj: "GB" }));
  check("a pre-v43 at-bat reads as no run, no runner", old.join(","), "");

  check("no page errors", errs.join(" | "), "");
  /* render() catches its own errors and shows a banner instead, so a broken
     draw never reaches pageerror. That is how a name clash with a local
     "inPlay" hid the chips during this build. Check the banner too. */
  check("no \"Something went wrong\" banner", await pg.evaluate(() => document.getElementById("noJs").hidden), true);
  await ctx.close();
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    args: ["--host-resolver-rules=MAP script.google.com ~NOTFOUND, MAP *.googleusercontent.com ~NOTFOUND", "--no-proxy-server"] });
  try { await part1(b); } catch (e) { console.log("  x  part 1 threw: " + e.stack); fails++; }
  try { await part2(b); } catch (e) { console.log("  x  part 2 threw: " + e.stack); fails++; }
  await b.close();
  console.log("\n" + checks + " QAB checks");
  console.log(fails ? "FAILURES: " + fails : "ALL QAB CHECKS PASS");
  process.exit(fails ? 1 : 0);
})();
