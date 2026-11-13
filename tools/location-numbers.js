/* The middle snowman (E-024, Nov 13, 2026): bullpen v45 and Pitch Chart v36.

     cd titans-apps && python3 -m http.server 8807 &
     node tools/location-numbers.js

   Jim: "Middle-middle - 0, Middle-Up - 1, Up-In - 2, Down-In - 3, Middle-down - 4,
   Down-away - 5, Below zone/dirt - 6, Up above zone - 7." And for the Pitch Chart:
   "I envision telling whomever is doing the charts what I called in the form of -
   fastball 1 location", plus a way to chart a pitch the catcher called (Glove, ?).

   Proves: the 8 numbers sit in the right boxes in both apps; a session saved under
   the old six moves to the new numbers once and only once (and an untouched
   template keeps its template); the 4 routines carry the new numbers and IDs; the
   Pitch Chart's Glove and "? Not known" calls are charted, exported and graded the
   way the guide says. Google's script hosts are blocked: nothing reaches the receiver. */
const { chromium } = require("playwright");
const { FILL_SETUP } = require("./game-ready.js");
const BASE = process.env.BASE || "http://localhost:8807";
let fail = 0, n = 0;
function is(name, got, want) {
  n++;
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log((ok ? "  ok   " : "  MISS ") + name.padEnd(62) + JSON.stringify(got) + (ok ? "" : "  (expected " + JSON.stringify(want) + ")"));
}
const WANT = { 0: [2, 2], 1: [1, 2], 2: [1, 1], 3: [3, 1], 4: [3, 2], 5: [3, 3], 6: [4, 2], 7: [0, 2] };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    args: ["--host-resolver-rules=MAP script.google.com ~NOTFOUND, MAP *.googleusercontent.com ~NOTFOUND", "--no-proxy-server"] });
  const open = async (path, seed) => {
    const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, serviceWorkers: "block" });
    if (seed) await ctx.addInitScript(s => { if (!sessionStorage.getItem("seeded")) { Object.keys(s).forEach(k => localStorage.setItem(k, s[k])); sessionStorage.setItem("seeded", "1"); } }, seed);
    const pg = await ctx.newPage(); pg.errs = []; pg.on("pageerror", e => pg.errs.push(String(e)));
    await pg.goto(BASE + path, { waitUntil: "load" }); await pg.waitForTimeout(700);
    pg.ctx = ctx; return pg;
  };
  const ev = (pg, s) => pg.evaluate(s);

  /* ------------------------------------------------------------ bullpen */
  /* The bullpen app runs inside a closure, so everything here goes through the page:
     the zone, the key, the template bar and what the app saves. */
  const S_OF = 'JSON.parse(localStorage.getItem("titans-bullpen-v1"))';
  const A_OF = 'JSON.parse(localStorage.getItem("titans-bullpen-archive-v1"))';
  const touch = async pg => { await pg.fill("#s-coach", "Coach Z"); await pg.waitForTimeout(150); };   /* any edit saves */
  console.log("\nBULLPEN v45 · the 8 locations");
  {
    const ready = { v: 1, spotV: 2, sid: "z1", pad: "Mound 1", date: "2027-01-08", coach: "Coach Z", practice: false, tpl: "", tplId: "", locked: false,
      script: [{ id: "r0", type: "FB", ws: "W", spot: 1, sit: "" }], pitchers: [{ id: "p1", name: "Test Arm", pitches: [] }], cur: "p1" };
    const pg = await open("/bullpen/index.html", { "titans-bullpen-v1": JSON.stringify(ready) });
    is("footer says v46 (the mound moved to Setup next)", await ev(pg, "/Bullpen Chart v46/.test(document.getElementById('foot').textContent)"), true);
    await pg.click("#tab-chart"); await pg.waitForTimeout(200);
    const zone = await ev(pg, "[...document.querySelectorAll('#zone button')].filter(function(b){ return b.querySelector('.sn'); }).map(function(b){ return b.querySelector('.sn').textContent+'@'+b.dataset.r+','+b.dataset.c; }).sort().join(' ')");
    is("the zone shows 8 numbers in the snowman boxes", zone, Object.keys(WANT).map(k => k + "@" + WANT[k].join()).sort().join(" "));
    is("the snowman: 7, 1, 0, 4, 6 straight down the middle column", ["7", "1", "0", "4", "6"].map(k => zone.split(" ").find(x => x.startsWith(k + "@")).split("@")[1]).join(" "), "0,2 1,2 2,2 3,2 4,2");
    await pg.click("#tab-setup");
    is("the key on the Setup tab lists all 8", await ev(pg, "(function(){ var t=document.querySelector('.legend').textContent; return /0 Middle/.test(t) && /1 Middle-up/.test(t) && /4 Middle-down/.test(t) && /5 Down & away/.test(t) && /6 Below the zone/.test(t) && /7 Above the zone/.test(t) && !/Below & away/.test(t); })()"), true);
    await touch(pg);
    is("a new session is saved with the new numbering", await ev(pg, S_OF + ".spotV"), 2);
    /* the 4 routines, loaded the way a coach loads them */
    const ids = { "Fastball Command": "3G1CMX · 25", "Breaking Ball & Stretch": "7B354P · 30", "Holding Runners": "J68J7Z · 35", "Hitter's Counts": "8P0C46 · 40" };
    for (const nm of Object.keys(ids)) {
      await pg.selectOption("#tplPick", { label: nm }).catch(async () => { await ev(pg, "(function(){ var s=document.getElementById('tplPick'); [...s.options].forEach(function(o,i){ if(o.textContent.indexOf(" + JSON.stringify(nm) + ")===0) s.selectedIndex=i; }); s.dispatchEvent(new Event('change',{bubbles:true})); })()"); });
      await pg.click("#tplLoad"); await pg.waitForTimeout(150);
      if (await pg.$(".askwrap [data-yes]")) { await pg.click(".askwrap [data-yes]"); await pg.waitForTimeout(150); }
      const bar = await ev(pg, "(document.querySelector('.tplbar .id')||{}).textContent || ''");
      is("routine " + nm + ": new script ID", (bar.match(/ID (\w+) · (\d+)/) || []).slice(1).join(" · "), ids[nm]);
    }
    const spots = await ev(pg, S_OF + ".script.map(function(r){ return r.spot; }).join('')");
    is("Hitter's Counts saved with the new numbers: FB down & away 5555 first", spots.slice(0, 4), "5555");
    is("  ends with the 2-strike chase on 6 and the fastball above the zone on 7", spots.slice(-8), "66666777");
    is("  no old 1 or 4 left", /[14]/.test(spots), false);
    is("no page errors", pg.errs.join("|"), "");
    await pg.ctx.close();
  }
  console.log("\nBULLPEN v45 · a session saved by v44 moves to the new numbers once");
  {
    const p = (spot, row, col) => ({ type: "FB", ws: "W", spot: spot, sit: "", r: row, c: col, res: "" });
    const old = { v: 1, sid: "old1", pad: "Mound 1", date: "2027-01-08", coach: "Coach J", practice: false, tpl: "", tplId: "", locked: false,
      script: [0, 1, 2, 3, 4, 5].map((s, i) => ({ id: "r" + i, type: "FB", ws: "W", spot: s, sit: "" })),
      pitchers: [{ id: "p1", name: "Test Arm", pitches: [p(1, 0, 2), p(4, 3, 3), p(5, 4, 4)], free: { type: "FB", ws: "W", spot: 4, sit: "" } }], cur: "p1" };
    const arch = [JSON.parse(JSON.stringify(old))]; arch[0].sid = "old0";
    const pg = await open("/bullpen/index.html", { "titans-bullpen-v1": JSON.stringify(old), "titans-bullpen-archive-v1": JSON.stringify(arch) });
    is("the filed session is converted and saved straight away", await ev(pg, A_OF + "[0].script.map(function(r){return r.spot;}).join() + ' / ' + " + A_OF + "[0].spotV"), "0,7,2,3,5,6 / 2");
    is("  its pitches too", await ev(pg, A_OF + "[0].pitchers[0].pitches.map(function(q){return q.spot;}).join()"), "7,5,6");
    await touch(pg);
    is("the live session: script 0-5 becomes 0, 7, 2, 3, 5, 6", await ev(pg, S_OF + ".script.map(function(r){return r.spot;}).join()"), "0,7,2,3,5,6");
    is("  each pitch's call moves with it (old 4 down & away is 5, old 5 is 6)", await ev(pg, S_OF + ".pitchers[0].pitches.map(function(q){return q.spot;}).join()"), "7,5,6");
    is("  the freeform picker too", await ev(pg, S_OF + ".pitchers[0].free.spot"), 5);
    await pg.reload({ waitUntil: "load" }); await pg.waitForTimeout(600); await touch(pg);
    is("reopened: not converted a second time", await ev(pg, S_OF + ".script.map(function(r){return r.spot;}).join() + ' / ' + " + A_OF + "[0].script.map(function(r){return r.spot;}).join()"), "0,7,2,3,5,6 / 0,7,2,3,5,6");
    is("no page errors", pg.errs.join("|"), "");
    await pg.ctx.close();
  }
  console.log("\nBULLPEN v45 · a template loaded under v44 is still that template");
  {
    /* Fastball Command as v44 shipped it: its old ID EFTB18. */
    const groups = [[4, "FB", "W", 4, ""], [4, "FB", "W", 3, ""], [4, "FB", "W", 2, ""], [2, "CH", "W", 4, ""], [2, "CH", "W", 3, ""], [3, "CH", "W", 0, "20"], [3, "CH", "W", 5, "2K"], [3, "FB", "W", 1, "2K"]];
    const script = []; groups.forEach(g => { for (let i = 0; i < g[0]; i++) script.push({ id: "x" + script.length, type: g[1], ws: g[2], spot: g[3], sit: g[4] }); });
    const mk = (edit) => { const s = { v: 1, sid: "t1", pad: "Mound 1", date: "2027-01-08", coach: "", practice: false, tpl: "Fastball Command", tplId: "EFTB18", locked: !edit,
      script: JSON.parse(JSON.stringify(script)), pitchers: [], cur: null }; if (edit) { s.script[0].type = "CH"; } return s; };
    let pg = await open("/bullpen/index.html", { "titans-bullpen-v1": JSON.stringify(mk(false)) });
    is("untouched template: still Running Fastball Command, with the new ID", await ev(pg, "document.querySelector('.tplbar').textContent.replace(/\\s+/g,' ').match(/Running: Fastball Command.*ID 3G1CMX/) ? 'yes' : document.querySelector('.tplbar').textContent"), "yes");
    await pg.ctx.close();
    pg = await open("/bullpen/index.html", { "titans-bullpen-v1": JSON.stringify(mk(true)) });
    is("an edited one is still marked modified", await ev(pg, "/Modified from Fastball Command/.test(document.querySelector('.tplbar').textContent)"), true);
    is("no page errors", pg.errs.join("|"), "");
    await pg.ctx.close();
  }

  /* ------------------------------------------------------------ Pitch Chart */
  console.log("\nPITCH CHART v36 · numbers on the call pad, Glove and ? Not known");
  {
    const pg = await open("/game/index.html");
    await pg.click('[data-lvl="JV"]');
    await ev(pg, '(function(){ var s=document.getElementById("suPitcher"); s.value=window.TITANS_ROSTER[0].id; s.dispatchEvent(new Event("change",{bubbles:true})); var set=function(id,v){ var e=document.getElementById(id); e.value=v; e.dispatchEvent(new Event("input",{bubbles:true})); }; set("fOpp","Ponderosa"); var d=document.getElementById("fDate"); d.value="2027-04-18"; d.dispatchEvent(new Event("change",{bubbles:true})); })()');
    await ev(pg, FILL_SETUP);
    await pg.click("#tab-chart");
    is("footer says v37 (E-012 came next)", await ev(pg, "/Pitch Chart v37/.test(document.getElementById('foot').textContent)"), true);
    const nums = await ev(pg, "[...document.querySelectorAll('#callPad > button')].map(function(b,i){ var s=b.querySelector('.snum'); return s ? s.textContent+'@'+Math.floor(i/5)+','+(i%5) : null; }).filter(Boolean).sort().join(' ')");
    is("8 numbered boxes, the same boxes as the bullpen", nums, Object.keys(WANT).map(k => k + "@" + WANT[k].join()).sort().join(" "));
    is("the other 17 boxes have no number", await ev(pg, "document.querySelectorAll('#callPad > button').length - document.querySelectorAll('#callPad .snum').length"), 17);
    const box = k => "#callPad > button:nth-child(" + (WANT[k][0] * 5 + WANT[k][1] + 1) + ")";
    const cell = (r, c) => "#zone .cell:nth-child(" + (r * 5 + c + 1) + ")";
    const PITCHES = '(function(){ var G=JSON.parse(localStorage.getItem("dugout-pitch-chart-v2")), out=[]; G.lineup.forEach(function(sp){ sp.men.forEach(function(b){ b.abs.forEach(function(a){ a.pitches.forEach(function(p){ out.push(p); }); }); }); }); return out; })()';
    /* pitch 1: the coach calls fastball 1, middle-up; it lands right there */
    await pg.click(box(1)); await pg.click(cell(1, 2));
    /* pitch 2: ? Not known, a ball up and in, off the plate */
    await pg.click("#callUnk");
    is("? Not known lights up and the hint says so", await ev(pg, "document.getElementById('callUnk').getAttribute('aria-pressed') + ' / ' + document.getElementById('callHint').textContent"), "true / Call not known · now tap where it crossed");
    await pg.click(cell(0, 0));
    is("  ? answers one pitch only", await ev(pg, "document.getElementById('callUnk').getAttribute('aria-pressed') + ' / ' + document.getElementById('callHint').textContent"), "false / Tap what was called, every pitch");
    /* pitches 3 and 4: Glove on, the catcher sets up down & away (5) twice */
    await pg.click("#callGlove");
    is("Glove stays on: the hint asks where the catcher set up", await ev(pg, "document.getElementById('callGlove').getAttribute('aria-pressed') + ' / ' + document.getElementById('callHint').textContent"), "true / Glove · tap where the catcher set up");
    await pg.click(box(5)); await pg.click(cell(3, 3));
    await pg.click(box(5)); await pg.click(cell(0, 4));
    is("  still on after 2 pitches", await ev(pg, "document.getElementById('callGlove').getAttribute('aria-pressed')"), "true");
    is("  glove calls are dashed on the pad", await ev(pg, "document.querySelectorAll('#callPad .cmk.glv').length"), 2);
    await pg.click("#callGlove");
    /* a pitch with no call at all is still refused */
    const before = (await ev(pg, PITCHES)).length;
    await pg.click(cell(2, 2));
    is("v35 still holds: no call, no pitch", (await ev(pg, PITCHES)).length, before);
    const P = (await ev(pg, PITCHES)).map(p => (p.cu ? "U" : p.cs === "G" ? "G" : p.cr == null ? "-" : "C") + (p.cr == null ? "" : "@" + p.cr + "," + p.cc));
    is("the 4 pitches: coach 1, unknown, glove 5, glove 5", P.join(" "), "C@1,2 U G@3,3 G@3,3");
    await pg.click('#results button[data-res="GO"]');
    is("at-bat closed: Glove can still be switched for the next hitter, ? can't", await ev(pg, "!document.getElementById('callGlove').disabled + ' / ' + document.getElementById('callUnk').disabled"), "true / true");
    await pg.click("#tab-report");
    is("the Report card: the coach's call graded, the glove kept apart, the unknown counted",
      await ev(pg, "document.querySelector('#sumArms .sumread').textContent"),
      "1 of 1 landed on the spot or next to it. On the catcher's glove: 1 of 2 on or next to it. 1 pitch with the call not known, not graded.");
    is("  Execution (spot+close) counts the coach's call only", await ev(pg, "(function(){ var k=[...document.querySelectorAll('#sumArms .sumkpi')].find(function(x){ return /Execution/.test(x.textContent); }); return k.querySelector('b').textContent; })()"), "1 of 1 100%");
    await pg.click("#btnExport");
    const X = await ev(pg, "document.getElementById('exportText').value");
    is("the export carries a CallSource column", /CallSource/.test(X), true);
    is("  Coach, Unknown, Glove, Glove in pitch order", (X.match(/\b(Coach|Unknown|Glove)\b(?=[,\t\s]*$)/gm) || []).join(" "), "Coach Unknown Glove Glove");
    is("no page errors", pg.errs.join("|"), "");
    await pg.ctx.close();
  }

  console.log("\n" + n + " location checks" + (fail ? "\nFAILURES: " + fail : "\nALL LOCATION CHECKS PASS"));
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
