/* Loads demo/index.html the way Jim will (tap Load, accept), then opens each app,
   walks every tab, and screenshots it. Fails on any page error. */
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:8807";
const SHOTS = process.env.SHOTS || "/tmp/claude-0/demo-shots";
require("fs").mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? "  ok   " : "  FAIL ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    args: ["--host-resolver-rules=MAP script.google.com ~NOTFOUND, MAP *.googleusercontent.com ~NOTFOUND", "--no-proxy-server"] });
  for (const scheme of ["light", "dark"]) {
    const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: "block", colorScheme: scheme });
    const pg = await ctx.newPage(); const errs = [];
    pg.on("pageerror", e => errs.push(e.message));
    pg.on("dialog", d => d.accept());
    /* something old on the iPad first, so we know Load replaces it */
    await pg.goto(BASE + "/game/index.html"); await pg.evaluate(() => localStorage.setItem("dugout-pitch-chart-archive-v1", '[{"old":1}]'));
    await pg.goto(BASE + "/demo/index.html"); await pg.waitForTimeout(300);
    if (scheme === "light") await pg.screenshot({ path: SHOTS + "/demo-page.png", fullPage: true });
    await pg.click("#go"); await pg.waitForTimeout(200);
    ok(/Loaded/.test(await pg.textContent("#status")), scheme + " demo page says Loaded");
    ok(await pg.evaluate(() => localStorage.getItem("dugout-pitch-chart-archive-v1") === "[]"), scheme + " old History cleared");
    for (const a of [{ n: "game", tabs: ["setup","chart","report","history"] }, { n: "offense", tabs: ["setup","chart","report","history"] },
                     { n: "bullpen", tabs: ["setup","chart","report","hist"] }]) {
      await pg.goto(BASE + "/" + a.n + "/index.html", { waitUntil: "load" }); await pg.waitForTimeout(700);
      for (const t of a.tabs) {
        await pg.click("#tab-" + t); await pg.waitForTimeout(300);
        ok(await pg.evaluate(() => !document.getElementById("v-gate") || document.getElementById("v-gate").hidden), scheme + " " + a.n + " " + t + " not gated");
        await pg.screenshot({ path: SHOTS + "/" + scheme + "-" + a.n + "-" + t + ".png", fullPage: true });
      }
      const strip = await pg.evaluate(() => { var s = document.getElementById("mStats") || document.getElementById("chartBar"); return s ? s.innerText.replace(/\s+/g, " ") : ""; });
      await pg.click("#tab-chart"); await pg.waitForTimeout(200);
      console.log("       " + a.n + " strip: " + (await pg.evaluate(() => { var s = document.getElementById("chartBar"); return s ? s.innerText.replace(/\s+/g, " ") : ""; })));
      ok(await pg.evaluate(() => !!document.getElementById("practiceBar") && !document.getElementById("practiceBar").hidden), scheme + " " + a.n + " practice bar shows");
    }
    ok(!errs.length, scheme + " no page errors " + errs.join(" | "));
    await ctx.close();
  }
  await b.close();
  console.log(fails ? "\nFAILURES: " + fails : "\nall ok"); process.exit(fails ? 1 : 0);
})();
