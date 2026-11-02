/* Checks cards/sample.html in a phone-sized browser (Nov 2026).
     cd titans-apps && node tools/cards/sample-check.js [shots-folder]
   Pitcher and hitter flows, both cards, the form, "what your coaches see", the flag
   line, no request to anything but the page itself, and a reload with no network. */
"use strict";
const fs = require("fs"), path = require("path"), http = require("http");
const { chromium } = require("playwright");
const ROOT = path.join(__dirname, "..", "..");
const SHOTS = process.argv[2] || "";
const PORT = 8896, BASE = "http://localhost:" + PORT + "/cards/";
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL " + m); } }

const srv = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(new URL(req.url, BASE).pathname));
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": f.endsWith(".js") ? "text/javascript" : "text/html; charset=utf-8" });
  res.end(fs.readFileSync(f));
});
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-proxy-server"] });
  try {
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const pg = await ctx.newPage();
    const errs = [], reqs = [];
    pg.on("pageerror", e => errs.push(String(e)));
    pg.on("request", r => reqs.push(r.url()));
    const shot = async n => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await pg.screenshot({ path: path.join(SHOTS, n + ".png"), fullPage: true }); } };
    await pg.goto(BASE + "sample.html");
    await pg.waitForTimeout(500);
    ok(await pg.evaluate(() => document.documentElement.scrollWidth) <= 390, "fits a phone");
    ok(!(await pg.isVisible("#pitcher")) && !(await pg.isVisible("#hitter")), "starts on the choice");
    await shot("1-start");
    ok(!/Smith|Hazen|Colten|Troy Hazen/.test(await pg.textContent("body")), "no real names");

    await pg.click('[data-show="pitcher"]');
    ok(await pg.isVisible("#c-pen") && !(await pg.isVisible("#c-game")), "pitcher: bullpen card first");
    ok((await pg.textContent("#c-pen")).includes("Jake Miller"), "made-up pitcher name");
    await shot("2-pitcher-pen");
    await pg.click('[data-card="game"]');
    ok(await pg.isVisible("#c-game") && (await pg.textContent("#c-game")).includes("The Deadly Sins"), "game card tab with the Deadly Sins");
    ok((await pg.textContent("#pf")).includes("Last time you said you’d start: Finish the change-up out front"), "the loop question");
    await pg.click('#pf .scale[data-name="did"] button[data-v="Partly"]');
    await pg.click('#pf .scale[data-name="arm"] button[data-v="2"]');
    await pg.click('#pf .scale[data-name="feel"] button[data-v="4"]');
    await pg.click('#pf .scale[data-name="pre"] button[data-v="Most"]');
    await pg.click('#pf .scale[data-name="reset"] button[data-v="Sometimes"]');
    ok(!(await pg.$eval('#hf .scale[data-name="arm"] button[data-v="2"]', e => e.className === "on")), "the 2 forms don't share taps");
    await pg.fill('#pf input[name="start"]', "Long toss twice a week");
    await pg.fill('#pf input[name="stop"]', "Rushing from the stretch");
    await pg.fill('#pf input[name="cont"]', "Attacking with the fastball");
    await pg.click("#pgo");
    await pg.waitForSelector("#pcv .cv");
    const cv = await pg.textContent("#pcv");
    ok(cv.includes("What your coaches see") && cv.includes("Arm2 of 5") && cv.includes("Pre-pitch processMost") && cv.includes("Long toss twice a week"), "coach view shows the answers");
    ok(cv.includes("pitching coach would get an email"), "a 2 shows the flag line");
    ok((await pg.textContent("#pf")).includes("A coach will check in with you"), "the real thank-you line");
    await shot("3-pitcher-reflected");

    await pg.click('[data-show="hitter"]');
    ok(!(await pg.isVisible("#pitcher")) && (await pg.textContent("#hitter")).includes("Ryan Torres"), "hitter: his card, made-up name");
    ok((await pg.textContent("#hf")).includes("How’s your body?"), "hitter form asks about his body");
    for (const [n, v] of [["did", "Yes"], ["arm", "4"], ["feel", "5"], ["pre", "Every pitch"], ["reset", "No yellow lights"]]) await pg.click(`#hf .scale[data-name="${n}"] button[data-v="${v}"]`);
    await pg.fill('#hf input[name="start"]', "a"); await pg.fill('#hf input[name="stop"]', "b"); await pg.fill('#hf input[name="cont"]', "<b>c</b>");
    await pg.click("#hgo");
    await pg.waitForSelector("#hcv .cv");
    const hv = await pg.innerHTML("#hcv");
    ok(!/flag/.test(hv) && hv.includes("&lt;b&gt;c&lt;/b&gt;"), "hitter: no flag at 4 and 5, text escaped");
    await shot("4-hitter-reflected");

    const other = reqs.filter(u => !u.startsWith("http://localhost:" + PORT + "/cards/"));
    ok(other.length === 0, "no request leaves the page: " + other.join(", "));
    /* offline: the service worker serves it again */
    await pg.waitForTimeout(800);
    await ctx.setOffline(true);
    await pg.reload();
    ok((await pg.textContent("h1")).includes("Your player card"), "reloads with no network");
    ok(!errs.length, "no page errors: " + errs.join(" | "));
  } finally { await br.close(); srv.close(); }
  console.log(pass + " sample checks" + (fail ? ", " + fail + " FAILED" : ""));
  if (fail) process.exit(1);
  console.log("ALL SAMPLE CHECKS PASS");
})().catch(e => { console.error(e); srv.close(); process.exit(1); });
