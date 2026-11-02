/* Checks the "Load the 7th inning" button on demo/index.html (Nov 2026, players' deck).
     cd titans-apps && python3 -m http.server 8807 &   node tools/demo-live-check.js [shots]
   Loads it, then in the Pitch Chart charts a full at-bat the way the room will, and in
   the Offense Chart charts one pitch. Fails on any page error. */
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:8807", SHOTS = process.argv[2] || "";
let fails = 0; const ok = (c, m) => { console.log((c ? "  ok   " : "  FAIL ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    args: ["--host-resolver-rules=MAP script.google.com ~NOTFOUND, MAP *.googleusercontent.com ~NOTFOUND", "--no-proxy-server"] });
  const ctx = await b.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: "block" });
  const pg = await ctx.newPage(); const errs = [];
  pg.on("pageerror", e => errs.push(e.message)); pg.on("dialog", d => d.accept());
  await pg.goto(BASE + "/demo/index.html"); await pg.waitForTimeout(300);
  const who = await pg.textContent("#liveWho");
  ok(/Borcherding on to finish it, Gavin Hughes up/.test(who) && /Ryan Dieker up against Drew Lindqvist/.test(who), "page names who is up: " + who);
  await pg.click("#goLive"); await pg.waitForTimeout(200);
  ok(/Loaded at the 7th/.test(await pg.textContent("#statusLive")), "says Loaded at the 7th");
  ok(await pg.evaluate(() => JSON.parse(localStorage.getItem("titans-bullpen-v1")).pitchers.filter(p => p.pitches.length).length === 3), "bullpen pens loaded too");

  await pg.goto(BASE + "/game/index.html", { waitUntil: "load" }); await pg.waitForTimeout(700);
  await pg.click("#tab-chart"); await pg.waitForTimeout(300);
  const bar = await pg.evaluate(() => document.body.innerText + " " + [].map.call(document.querySelectorAll("select"), s => s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : "").join(" "));
  ok(/Borcherding/i.test(bar) && /Gavin Hughes/i.test(bar), "Pitch Chart: Borcherding on, Hughes up");
  ok(await pg.evaluate(() => document.querySelector('#types button.on, #types button[aria-pressed="true"]') ? document.querySelector('#types button.on, #types button[aria-pressed="true"]').dataset.type === "FB" : true), "fastball preselected");
  if (SHOTS) await pg.screenshot({ path: SHOTS + "/live-game.png" });
  /* the room's at-bat: FB called strike, CB in the dirt, FB fouled, CB swinging strike 3 */
  const ab = [["FB", [2,2], [2,1], "T"], ["CB", [3,2], [4,2], "T"], ["FB", [1,3], [1,3], "F"], ["CB", [3,2], [4,1], "W"]];
  await pg.evaluate((ab) => {
    function c(s){ var e = document.querySelector(s); if(!e) throw new Error("missing " + s); e.click(); }
    ab.forEach(function(q){
      c('#types button[data-type="' + q[0] + '"]');
      c("#callPad button:nth-child(" + (q[1][0]*5 + q[1][1] + 1) + ")");
      c("#zone .cell:nth-child(" + (q[2][0]*5 + q[2][1] + 1) + ")");
      c('.mods button[data-mod="' + q[3] + '"]');
    });
  }, ab);
  await pg.waitForTimeout(300);
  const G = await pg.evaluate(() => JSON.parse(localStorage.getItem("dugout-pitch-chart-v2")));
  const man = G.lineup[7].men.slice(-1)[0], done = man.abs.filter(a => a.result);
  ok(done.length === 3 && done[2].result === "K" && done[2].pitches.length === 4, "Hughes struck out on 4 pitches: " + (done[2] && done[2].result));
  ok(G.outs === 1 && G.inning === 7, "1 out in the 7th");
  if (SHOTS) await pg.screenshot({ path: SHOTS + "/live-game-after.png" });

  await pg.goto(BASE + "/offense/index.html", { waitUntil: "load" }); await pg.waitForTimeout(700);
  await pg.click("#tab-chart"); await pg.waitForTimeout(300);
  ok(/Dieker/.test(await pg.evaluate(() => document.body.innerText)) && /Lindqvist/.test(await pg.evaluate(() => document.body.innerText)), "Offense Chart: Dieker up against Lindqvist");
  await pg.evaluate(() => { document.querySelector('#types [data-ty="0"]').click(); document.querySelector('#zone [data-r="2"][data-c="2"]').click(); });
  const O = await pg.evaluate(() => JSON.parse(localStorage.getItem("titans-offense-v1")));
  ok(O.pas.slice(-1)[0].pitches.length === 1, "Offense Chart: first pitch charted");
  if (SHOTS) await pg.screenshot({ path: SHOTS + "/live-offense.png" });
  ok(!errs.length, "no page errors " + errs.join(" | "));
  await b.close();
  console.log(fails ? "\nFAILURES: " + fails : "\nall ok"); process.exit(fails ? 1 : 0);
})();
