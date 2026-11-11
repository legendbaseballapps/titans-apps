/* Checks dashboard/sample.html, the made-up season page for the head coach (Nov 2026).

     cd titans-apps && node tools/dashboard/sample-check.js [screenshot-folder]

   - It says Sample data, names no players or coaches, and never calls Google.
   - The counter, pace and free-base battle match the made-up season worked out here,
     separately, from tools/dashboard/sample-season.json.
   - It fits a laptop and a phone with no sideways scroll, and every goal cell has a marker. */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(ROOT, "dashboard", "sample.html"), "utf8");
const S = JSON.parse(fs.readFileSync(path.join(__dirname, "sample-season.json"), "utf8"));
const OUT = process.argv[2] || "";

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL " + m); } }
const text = h => h.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&middot;/g, "·").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const t = text(html);

ok(/Sample data · a made-up 2027 season through Apr 17/.test(t), "Sample data banner");
ok(!/script\.google\.com|googleusercontent|<script/.test(html), "no Google calls, no scripts");
ok(!/signed in as|sample@example\.com|Sample Coach/.test(html), "no coach name or account");
ok(!/Starter|Reliever/.test(t), "no pitcher names or roles on the overview");

/* worked out here */
const rows = n => S[n].slice(1).map(r => Object.fromEntries(S[n][0].map((h, i) => [h, r[i]])));
const RATE = { Varsity: 17.9, JV: 20.3, Sophomore: 18.2, Freshman: 17.7 }, SHARE = { Varsity: 49, JV: 43, Sophomore: 34, Freshman: 24 },
      SCHED = { Varsity: 23, JV: 19, Sophomore: 19, Freshman: 19 };
const lv = {}, games = {};
rows("Game_Innings").forEach(r => {
  const o = lv[r.Level] = lv[r.Level] || { bf: 0, free: 0, g: new Set() };
  o.bf += r.BattersFaced; o.free += r.FreeBases; o.g.add(r.RecordID);
  const g = games[r.RecordID] = games[r.RecordID] || { free: 0 }; g.free += r.FreeBases;
});
let saved = 0, pace = 0;
Object.keys(lv).forEach(l => { const o = lv[l]; o.saved = o.bf * RATE[l] / 100 - o.free; o.pace = SHARE[l] * Math.min(1, o.g.size / SCHED[l]); saved += o.saved; pace += o.pace; });
const n = Math.round(saved), p = Math.round(pace), d = n - p;
ok(Object.keys(games).length === 37 && t.includes("37 of 80 games charted"), "37 games through Apr 17, of 80");
ok(t.includes(n + " of 150 free bases saved"), "counter " + n + " of 150");
ok(t.includes((d > 0 ? d + " ahead of pace" : d < 0 ? (-d) + " behind pace" : "Right on pace") + " (pace: " + p + " by now)"), "pace " + p + ", " + d);
Object.keys(lv).forEach(l => { const s = Math.round(lv[l].saved);
  ok(t.includes(l + " " + lv[l].g.size + " of " + SCHED[l] + " games " + (s >= 0 ? s + " of " + SHARE[l] : (-s) + " over 2026's rate")), l + " share " + s); });
const won = Object.values(games).filter(g => g.free <= 3).length;
ok(t.includes(won + " of 37 games at 3 free bases or fewer"), "free-base battle " + won + " of 37");
const goals = html.match(/<table class="goals">[\s\S]*?<\/table>/)[0];
const cells = goals.split("<tbody>")[1].split("<td").slice(1).filter(c => !/gname/.test(c));
ok(cells.length === 45 && cells.every(c => /class="ok"|class="ring"/.test(c)), "all 45 goal cells carry a check or a ring");
ok(/class="ok"/.test(goals) && /class="ring"/.test(goals), "the sample shows both met and not-yet goals");
ok(d < 0 && Object.values(lv).some(o => o.saved > o.pace), "the story: program behind pace, at least one team ahead");

(async () => {
  const { chromium } = require("playwright");
  const br = await chromium.launch();
  for (const [name, vp] of [["dash-sample-laptop", { width: 1280, height: 900 }], ["dash-sample-phone", { width: 390, height: 844 }]]) {
    const pg = await br.newPage({ viewport: vp });
    const reqs = [];
    pg.on("request", r => { if (!r.url().startsWith("data:") && r.url() !== "about:blank") reqs.push(r.url()); });
    await pg.setContent(html);
    ok(!(await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), name + ": no sideways scroll");
    ok(reqs.length === 0, name + ": no outside requests");
    if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await pg.screenshot({ path: path.join(OUT, name + ".png"), fullPage: true }); }
    await pg.close();
  }
  await br.close();
  console.log(pass + " sample checks" + (fail ? ", " + fail + " FAILED" : ""));
  if (fail) process.exit(1);
  console.log("ALL SAMPLE CHECKS PASS");
})();
