/* The player page in a real browser (Oct 28, 2026): taps the reflection form the way
   a kid would on a phone, and saves screenshots of every card and page.

     cd titans-apps && node tools/cards/page-check.js [shots-folder]

   google.script.run is stood in for by a tiny shim that posts to this test server,
   which calls saveReflection on the stand-in runtime. Nothing leaves this machine. */
"use strict";
const fs = require("fs"), path = require("path"), http = require("http");
const { chromium } = require("playwright");
const { makeRuntime } = require("../receiver/mock-gas");
const ROOT = path.join(__dirname, "..", "..");
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, "fixture-sheet.json"), "utf8"));
const ROSTER = fs.readFileSync(path.join(ROOT, "bullpen", "roster.js"), "utf8");
const SHOTS = process.argv[2] || "";
const PORT = 8897, BASE = "http://localhost:" + PORT;

const rt = makeRuntime(path.join(ROOT, "cards", "Code.gs"), { fetch: { "https://legendbaseballapps.github.io/titans-apps/bullpen/roster.js": ROSTER } });
const b = rt.newBook("S");
Object.keys(FIX).forEach(n => { b.insertSheet(n).data = JSON.parse(JSON.stringify(FIX[n])); });
Object.assign(rt.props, { SEASON_SHEET_ID: "S" });
rt.sandbox.setup(); rt.sandbox.addRosterPlayers();
Object.assign(rt.props, { CARDS_FROM: "2026-01-01T00:00:00Z", SEND_MODE: "test", TEST_TO: "t@example.com", PAGE_URL: BASE + "/exec",
  LOGO_URL: BASE + "/logo.png", ADMIN_EMAIL: "admin@example.com" });
const P = b.getSheetByName("Players"), h = P.header();
[["ad6bxsq", "smith@example.com"], ["fro8j13", "hazen@example.com"]].forEach(([id, em]) => {
  P.data.find(r => r[0] === id)[h.indexOf("Player email")] = em; });
rt.sandbox.runEvening(); rt.sandbox.runMorning();
const tok = id => b.getSheetByName("Player_Links").records().find(r => r.PlayerID === id).Token;
const recs = b.getSheetByName("Records").records();
const rid = (app, date) => recs.find(r => r.App === app && (!date || r.Date === date)).RecordID;

const SHIM = `<script>window.google={script:{run:(function(){function R(){this.s=null;this.f=null;}
R.prototype.withSuccessHandler=function(f){var r=new R();r.s=f;r.f=this.f;return r;};
R.prototype.withFailureHandler=function(f){var r=new R();r.s=this.s;r.f=f;return r;};
R.prototype.saveReflection=function(o){var s=this.s,f=this.f;fetch('/run',{method:'POST',body:JSON.stringify(o)}).then(function(x){return x.json();}).then(function(v){s&&s(v);},function(e){f&&f(e);});};
return new R();})()}};</script>`;
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, BASE);
  if (u.pathname === "/logo.png") { res.writeHead(200, { "Content-Type": "image/png" }); res.end(fs.readFileSync(path.join(ROOT, "cards", "lt-logo.png"))); return; }
  if (u.pathname === "/run") { let body = ""; req.on("data", c => body += c); req.on("end", () => {
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(rt.sandbox.saveReflection(JSON.parse(body)))); }); return; }
  if (u.pathname === "/exec") {
    const q = Object.fromEntries(u.searchParams);
    const html = rt.sandbox.doGet({ parameter: q }).getContent().replace("<head>", "<head>" + SHIM);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(html); return;
  }
  if (u.pathname.indexOf("/mail/") === 0) {
    const m = rt.mail[Number(u.pathname.slice(6))];
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(m ? m.htmlBody : "none"); return;
  }
  res.writeHead(404); res.end();
});

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL " + m); } }

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-proxy-server"] });
  try {
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", e => errs.push(String(e)));
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    async function shot(name) { if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: true }); }

    /* every email, at phone width, must fit without sideways scrolling */
    for (let i = 0; i < rt.mail.length; i++) {
      await pg.goto(BASE + "/mail/" + i);
      const w = await pg.evaluate(() => document.documentElement.scrollWidth);
      ok(w <= 390, "email " + i + " fits a phone (" + w + "px): " + rt.mail[i].subject);
      const imgs = await pg.evaluate(() => [...document.images].every(im => im.complete && im.naturalWidth > 0));
      ok(imgs, "email " + i + " logo loads");
    }
    const pick = re => rt.mail.findIndex(m => re.test(m.subject));
    for (const [name, re] of [["email-pen", /smith.*pen card: Jan 19/], ["email-live", /smith.*Live at-bats/], ["email-pitcher", /smith.*game card/], ["email-hitter", /hazen.*game card/]]) {
      await pg.goto(BASE + "/mail/" + pick(re)); await shot(name);
    }

    /* the page: his list, then a card, then the form */
    const st = tok("ad6bxsq");
    await pg.goto(BASE + "/exec?t=" + st); await shot("page-home");
    ok(await pg.evaluate(() => document.documentElement.scrollWidth) <= 390, "home page fits a phone");
    ok((await pg.$$(".item")).length === 4, "home lists 4 cards");
    await pg.click(".item >> nth=3");              /* oldest: Jan 12 pen */
    await pg.waitForSelector("#f");
    ok(pg.url().includes("&r=" + rid("bullpen", "2027-01-12")), "tapping a card opens that card");
    await shot("page-card-form");
    await pg.click("#go");
    ok((await pg.textContent("#msg")).includes("Pick a number"), "send with nothing picked: asks for the ratings");
    await pg.click('.scale[data-name="arm"] button[data-v="4"]');
    await pg.click('.scale[data-name="feel"] button[data-v="5"]');
    ok(await pg.$eval('.scale[data-name="arm"] button[data-v="4"]', e => e.className === "on"), "the tapped rating lights up");
    await pg.click("#go");
    ok((await pg.textContent("#msg")).includes("START, STOP and CONTINUE"), "asks for START, STOP and CONTINUE");
    await pg.fill('input[name="start"]', "Finish the change-up out front");
    await pg.fill('input[name="stop"]', "Rushing from the stretch");
    await pg.fill('input[name="cont"]', "Attacking with the fastball");
    await pg.click("#go");
    await pg.waitForFunction(() => /Thanks/.test(document.getElementById("f").textContent));
    await shot("page-thanks");
    const R = b.getSheetByName("Reflections").records();
    ok(R.length === 1 && R[0]["Arm/Body"] === 4 && R[0].Feel === 5 && R[0].Start === "Finish the change-up out front", "the browser save reached the Reflections tab");
    await pg.goto(BASE + "/exec?t=" + st + "&r=" + rid("bullpen", "2027-01-19") + "&k=pen");
    ok((await pg.textContent("#f")).includes("Last time you said you\u2019d start: Finish the change-up out front"), "the next card asks about last time's START");
    await pg.click('.scale[data-name="did"] button[data-v="Partly"]');
    await pg.click('.scale[data-name="arm"] button[data-v="2"]');
    await pg.click('.scale[data-name="feel"] button[data-v="3"]');
    await pg.fill('input[name="start"]', "Long toss on off days");
    await pg.fill('input[name="stop"]', "Skipping the warm-up");
    await pg.fill('input[name="cont"]', "Same routine");
    await pg.fill('textarea[name="bother"]', "Elbow is a little sore");
    await shot("page-card-form-filled");
    await pg.click("#go");
    await pg.waitForFunction(() => /Thanks/.test(document.getElementById("f").textContent));
    ok((await pg.textContent("#f")).includes("A coach will check in with you"), "flagged: tells him a coach will check in");
    const R2 = b.getSheetByName("Reflections").records();
    ok(R2[1].Flag === "Physical" && R2[1].DidLastStart === "Partly", "flag and Did-you saved");
    const heads = rt.mail.filter(m => /Heads-up/.test(m.subject));
    ok(heads.length === 1, "one heads-up email");
    if (SHOTS) { fs.writeFileSync(path.join(SHOTS, "flag-email.html"), heads[0].htmlBody); }
    await pg.goto(BASE + "/exec?t=" + st + "&r=" + rid("bullpen", "2027-01-12") + "&k=pen"); await shot("page-saved");
    ok((await pg.textContent("body")).includes("Your coaches have it"), "a reflected card shows what he sent");
    await pg.goto(BASE + "/exec?t=" + "a".repeat(40)); await shot("page-bad-link");
    ok((await pg.textContent("body")).includes("isn’t active"), "bad link page");
    ok(!errs.length, "no page errors: " + errs.join(" | "));
  } finally { await br.close(); srv.close(); }
  console.log(pass + " page checks" + (fail ? ", " + fail + " FAILED" : ""));
  if (fail) process.exit(1);
  console.log("ALL PAGE CHECKS PASS");
})().catch(e => { console.error(e); srv.close(); process.exit(1); });
