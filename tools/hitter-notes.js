/* Offense Chart v52: hitter cards with To the hitter / Coach only notes, and a
   filed game reopened from History with only the notes editable.
     cd titans-apps && python3 -m http.server 8807 &
     node tools/hitter-notes.js
   Uses tools/demo-data.json (the demo game: 30 at-bats, 9 hitters) as the game. */
const { chromium } = require("playwright");
const fs = require("fs");
const BASE = process.env.BASE || "http://localhost:8807";
const SHOTS = process.env.SHOTS || "/tmp/claude-0/hn";
const DEMO = JSON.parse(fs.readFileSync(__dirname + "/demo-data.json", "utf8")).keys;
let fails = 0, checks = 0;
const check = (name, got, want) => { checks++; const ok = String(got) === String(want);
  console.log((ok ? "  ok   " : "  MISS ") + name.padEnd(60) + got + (ok ? "" : "   (expected " + want + ")")); if (!ok) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    args: ["--host-resolver-rules=MAP script.google.com ~NOTFOUND, MAP *.googleusercontent.com ~NOTFOUND", "--no-proxy-server"] });
  for (const scheme of ["light", "dark"]) {
    console.log("\n" + scheme.toUpperCase());
    const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, serviceWorkers: "block", colorScheme: scheme });
    await ctx.addInitScript(d => { if (!sessionStorage.getItem("seeded")) { for (const k in d) if (/offense/.test(k)) localStorage.setItem(k, d[k]); sessionStorage.setItem("seeded", "1"); } }, DEMO);
    const pg = await ctx.newPage(); const errs = []; pg.on("pageerror", e => errs.push(e.message));
    await pg.goto(BASE + "/offense/index.html", { waitUntil: "load" }); await pg.waitForTimeout(700);
    await pg.click("#tab-report"); await pg.waitForTimeout(150);
    check("Report has a Hitter cards chip", await pg.$$eval('[data-rp="H"]', x => x.length), 1);
    check("  and the live game shows no filed-game header", await pg.evaluate(() => document.getElementById("sumHead").hidden), true);
    await pg.click('[data-rp="H"]'); await pg.waitForTimeout(150);
    check("one card per hitter who came up", await pg.$$eval("[data-card]", x => x.length), 9);
    check("each card has 2 note boxes", await pg.$$eval("textarea[data-hn]", x => x.length), 18);
    const first = await pg.evaluate(() => { const c = document.querySelector("[data-card]"); return c.querySelector(".sumwho").textContent + " | " + c.querySelector(".sumread b").textContent; });
    const bobo = await pg.evaluate(() => O.pas.filter(a => a.result && paHitter(a).rid === "zvn2wpb"));
    check("the first card is the leadoff man, with his line", first, "Bobo | " + bobo.map(a => a.result).join(" · "));
    check("pitch chips and the pitcher report are hidden", await pg.evaluate(() => !/What to expect/.test(document.getElementById("rpt").textContent)), true);
    /* type a note: saved on the live game, keyed by roster id, and not redrawn away */
    await pg.fill('textarea[data-hn="zvn2wpb"][data-k="note"]', "Great takes in the first. Stay on the fastball.");
    await pg.fill('textarea[data-hn="zvn2wpb"][data-k="comments"]', "=Talk about the K");
    const live = await pg.evaluate(() => JSON.parse(localStorage.getItem("titans-offense-v1")).hnotes.zvn2wpb);
    check("the note saved on the game in progress", live.note, "Great takes in the first. Stay on the fastball.");
    check("  and the coach-only one too", live.comments, "=Talk about the K");
    await pg.click("#tab-chart"); await pg.click("#tab-report"); await pg.waitForTimeout(150);
    check("Hitter cards stays picked, and the note is still there", await pg.inputValue('textarea[data-hn="zvn2wpb"][data-k="note"]'), "Great takes in the first. Stay on the fastball.");
    await pg.screenshot({ path: SHOTS + "/" + scheme + "-cards-live.png", fullPage: true });
    /* the upload row for it (practice game, so it is built but never sent) */
    const nt = await pg.evaluate(() => { const g = JSON.parse(JSON.stringify(O)); g.practice = false; g.level = "Varsity"; return upPayload(g); });
    check("the upload carries a notes table", Object.keys(nt.tables).join(","), "pitches,notes");
    check("  with the columns in order", nt.tables.notes.columns.join(","), "Level,Date,Opponent,HitterID,Hitter,HitterLast,HitterFirst,Spot,PA,Pitches,ToHitter,CoachOnly,Practice");
    check("  one row per hitter", nt.tables.notes.rows.length, 9);
    const r0 = nt.tables.notes.rows[0];
    check("  the leadoff row", [r0[3], r0[5] + ", " + r0[6], r0[7], r0[8], r0[9], r0[10]].join(" | "), "zvn2wpb | Bobo, Ethan | 1 | " + bobo.length + " | " + bobo.reduce((n, a) => n + a.pitches.length, 0) + " | Great takes in the first. Stay on the fastball.");
    /* file it, then reopen from History */
    await pg.click("#hdrFinish"); await pg.click(".askwrap [data-yes]"); await pg.waitForTimeout(300);
    await pg.click("#tab-history"); await pg.waitForTimeout(150);
    check("History has a Summary button on the filed game", await pg.$$eval("[data-hsum]", x => x.length), 1);
    await pg.click('[data-hsum="0"]'); await pg.waitForTimeout(200);
    check("Summary opens the Report page on the hitter cards", await pg.evaluate(() => tab + " " + sel.rptP + " " + document.querySelectorAll("[data-card]").length), "report H 9");
    check("  with History lit, not Report", await pg.evaluate(() => document.getElementById("tab-history").getAttribute("aria-selected")), "true");
    check("  and the filed-game header", await pg.evaluate(() => !document.getElementById("sumHead").hidden && /Ridgeview/.test(document.getElementById("sumSub").textContent)), true);
    check("  the note came with it", await pg.inputValue('textarea[data-hn="zvn2wpb"][data-k="note"]'), "Great takes in the first. Stay on the fastball.");
    await pg.fill('textarea[data-hn="ynl4e0v"][data-k="note"]', "Line drive in the 4th was the swing.");
    const ar = await pg.evaluate(() => JSON.parse(localStorage.getItem("titans-offense-archive-v1"))[0]);
    check("a note typed on a filed game saves to that filed game", ar.hnotes.ynl4e0v.note, "Line drive in the 4th was the swing.");
    check("  not to the new game", await pg.evaluate(() => JSON.stringify(O.hnotes)), "{}");
    check("  a practice game is never marked to re-send", !!ar.notesDirty, false);
    await pg.screenshot({ path: SHOTS + "/" + scheme + "-cards-filed.png", fullPage: true });
    /* a pitcher chip on the filed game still works */
    await pg.click('[data-rp="0"]'); await pg.waitForTimeout(150);
    check("the filed game's pitcher report draws", await pg.evaluate(() => /Cole Barrett/.test(document.getElementById("rpt").textContent)), true);
    await pg.click("#sumBack"); await pg.waitForTimeout(150);
    check("← History goes back", await pg.evaluate(() => tab + " " + sumIdx + " " + document.getElementById("sumHead").hidden), "history -1 true");
    await pg.click('[data-hsum="0"]'); await pg.click("#tab-report"); await pg.waitForTimeout(150);
    check("tapping Report shows the new game, not the filed one", await pg.evaluate(() => sumIdx + " " + document.getElementById("sumHead").hidden), "-1 true");
    /* an uploaded game: an edit marks it to re-send, and History says so */
    await pg.evaluate(() => { A[0].practice = false; A[0].level = "Varsity"; A[0].rid = A[0].rid || "otest01"; A[0].up = 123; saveArchive(); });
    await pg.click("#tab-history"); await pg.click('[data-hsum="0"]'); await pg.waitForTimeout(150);
    await pg.fill('textarea[data-hn="ynl4e0v"][data-k="comments"]', "Hitting coach to follow up");
    const ar2 = await pg.evaluate(() => JSON.parse(localStorage.getItem("titans-offense-archive-v1"))[0]);
    check("an edit on an uploaded game marks its notes to re-send", !!ar2.notesDirty, true);
    check("  the header pill says notes waiting", await pg.evaluate(() => document.getElementById("sumPill").textContent), "notes waiting");
    const up = await pg.evaluate(() => { const p = upPayload(A[0]); return p.update + " " + Object.keys(p.tables).join(","); });
    check("  and the re-send carries only the notes", up, "notes notes");
    check("  it is back in the upload queue", await pg.evaluate(() => upQueue().length), 1);
    /* clearing pitches clears the notes */
    check("no page errors", errs.join(" | "), "");
    await ctx.close();
  }
  await b.close();
  console.log("\n" + checks + " checks" + (fails ? ", FAILURES: " + fails : ", all ok")); process.exit(fails ? 1 : 0);
})();
