/* The Session summary (bullpen v37) and the Game summary (Pitch Chart v27), E-011.

     cd titans-apps && python3 -m http.server 8807 &
     node tools/summary.js

   The upload side (notes reaching the Sheet, a changed note sent again and
   replaced) is in tools/receiver/upload.js. This suite covers the screens.
   Google's script hosts are blocked, so nothing here reaches the real receiver:
   every filed record stays "waiting", which is the case these checks need. */
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:8807";
let fail = 0, n = 0;
function is(name, got, want) {
  n++;
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log((ok ? "  ok   " : "  MISS ") + name.padEnd(56) + JSON.stringify(got) + (ok ? "" : "  (expected " + JSON.stringify(want) + ")"));
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    args: ["--host-resolver-rules=MAP script.google.com ~NOTFOUND, MAP *.googleusercontent.com ~NOTFOUND", "--no-proxy-server"] });
  const open = async path => {
    const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, serviceWorkers: "block" });
    const pg = await ctx.newPage(); pg.errs = []; pg.on("pageerror", e => pg.errs.push(String(e)));
    await pg.goto(BASE + path, { waitUntil: "load" }); await pg.waitForTimeout(700);
    pg.ctx = ctx; return pg;
  };
  const ev = (pg, s) => pg.evaluate(s);

  /* ------------------------------------------------------------ bullpen */
  console.log("\nBULLPEN v37 · Session summary");
  {
    const pg = await open("/bullpen/index.html");
    await ev(pg, '(function(){ var s=document.querySelectorAll(\'#rosterTbl select[data-f="rid"]\'); var R=window.TITANS_ROSTER; [0,1].forEach(function(i){ s[i].value=R[i].id; s[i].dispatchEvent(new Event("input",{bubbles:true})); s[i].dispatchEvent(new Event("change",{bubbles:true})); }); var t=document.getElementById("tplPick"); t.value=t.options[1].value; t.dispatchEvent(new Event("change",{bubbles:true})); document.getElementById("tplLoad").click(); var y=document.querySelector(".askwrap [data-yes]"); if(y) y.click(); })()');
    await pg.click("#btnStart");
    for (let i = 0; i < 3; i++) await ev(pg, 'document.querySelector(\'#zone button[data-r="2"][data-c="2"]\').click()');
    await pg.click("#tab-report");
    await pg.click("#btnSum");
    is("opens from the Report tab for this session", await ev(pg, '!document.getElementById("v-sum").hidden && document.getElementById("v-report").hidden'), true);
    is("  says it is in progress", await ev(pg, 'document.getElementById("sumPill").textContent'), "in progress");
    is("  one card: only the arm who threw", await ev(pg, 'document.querySelectorAll("#sumBody .rptcard").length'), 1);
    await pg.fill('#sumBody textarea[data-k="note"]', "Stay tall");
    await pg.fill('#sumBody textarea[data-k="comments"]', "Ready for live ABs");
    await pg.click("#sumBack");
    is("Back returns to the Report tab", await ev(pg, '!document.getElementById("v-report").hidden && document.getElementById("v-sum").hidden'), true);
    is("  the Report card shows both notes as text", await ev(pg, '(function(){ var t=document.getElementById("rpt").textContent; return /To the pitcher: Stay tall/.test(t) && /Coach only: Ready for live ABs/.test(t); })()'), true);
    await pg.click("#tab-chart");
    is("  the Chart tab boxes hold the same notes", await ev(pg, 'document.getElementById("note").value + " | " + document.getElementById("comments").value'), "Stay tall | Ready for live ABs");
    /* file, then edit from History while it is still waiting to upload */
    await pg.click("#hdrFinish"); await pg.click(".askwrap [data-yes]");
    is("the next session starts with no notes", await ev(pg, '(function(){ var S=JSON.parse(localStorage.getItem("titans-bullpen-v1")); return S.pitchers.map(function(p){ return (p.note||"")+(p.comments||""); }).join(""); })()'), "");
    await pg.click("#tab-hist");
    await ev(pg, 'document.querySelector("#histList [data-sum]").click()');
    is("opens from History for a filed session", await ev(pg, '!document.getElementById("v-sum").hidden'), true);
    is("  shows its notes", await ev(pg, 'document.querySelector(\'#sumBody textarea[data-k="note"]\').value'), "Stay tall");
    await pg.fill('#sumBody textarea[data-k="note"]', "Stay tall through release");
    const a = await ev(pg, 'JSON.parse(localStorage.getItem("titans-bullpen-archive-v1"))[0]');
    is("  an edit is saved on the filed session", a.pitchers[0].note, "Stay tall through release");
    is("  not yet uploaded, so no separate notes send is queued", !!a.notesDirty, false);
    is("  pill still says waiting", await ev(pg, 'document.getElementById("sumPill").textContent'), "waiting");
    await pg.click("#sumBack");
    is("Back returns to History", await ev(pg, '!document.getElementById("v-hist").hidden'), true);
    is("no page errors", pg.errs.join("|"), "");
    await pg.ctx.close();
  }

  /* ------------------------------------------------------------ Pitch Chart */
  console.log("\nPITCH CHART v27 · Game summary");
  {
    const pg = await open("/game/index.html");
    await pg.click('[data-lvl="JV"]');
    await ev(pg, '(function(){ var s=document.querySelectorAll("#pitchers select[data-pick]")[0]; s.value=window.TITANS_ROSTER[0].id; s.dispatchEvent(new Event("change",{bubbles:true})); var set=function(id,v){ var e=document.getElementById(id); e.value=v; e.dispatchEvent(new Event("input",{bubbles:true})); }; set("fDate","4-18"); set("fOpp","Ponderosa"); })()');
    await pg.click("#btnSetup");
    await pg.click("#zone .cell:nth-child(13)"); await pg.click('#results button[data-res="GO"]'); await pg.click("#nextBtn");
    await pg.click("#zone .cell:nth-child(13)"); await pg.click("#zone .cell:nth-child(13)"); await pg.click('#results button[data-res="1B"]'); await pg.click("#nextBtn");
    await pg.click('#tabs button[data-tab="game"]');
    await pg.click("#btnSummary");
    is("opens full page; charting screen hidden", await ev(pg, '!document.getElementById("v-sum").hidden && document.querySelector(".wrap").style.display === "none"'), true);
    is("  header names the game", await ev(pg, 'document.getElementById("sumSub").textContent'), "vs Ponderosa · 4-18 · JV · 3 pitches");
    is("  card shows counts: first-pitch strikes", await ev(pg, '(function(){ var k=[...document.querySelectorAll("#sumArms .sumkpi")].find(function(x){ return /First-pitch strikes/.test(x.textContent); }); return k ? k.querySelector("b").textContent : "none"; })()'), "2 of 2 100%");
    is("  batters faced", await ev(pg, '(function(){ var k=[...document.querySelectorAll("#sumArms .sumkpi")].find(function(x){ return /Batters/.test(x.textContent); }); return k.querySelector("b").textContent; })()'), "2");
    is("  the inning table is there", await ev(pg, 'document.querySelectorAll("#sumInn tbody tr").length'), 1);
    await pg.fill('#sumArms textarea[data-k="note"]', "Good tempo");
    await pg.fill('#sumArms textarea[data-k="comments"]', "Work on the slide step");
    await pg.click("#sumBack");
    is("Back returns to charting (level is picked)", await ev(pg, 'document.getElementById("v-sum").hidden && document.querySelector(".wrap").style.display === ""'), true);
    await pg.click("#btnExport");
    is("the game export carries both notes", await ev(pg, '(function(){ var t=document.getElementById("exportText").value; return /To the pitcher\\s+Good tempo/.test(t) && /Coach only\\s+Work on the slide step/.test(t); })()'), true);
    await ev(pg, 'document.getElementById("btnCloseExport").click()');
    await pg.click("#hdrFinish");
    if (await pg.$("#innNoRuns")) { await pg.click("#innNoRuns"); await pg.waitForTimeout(150); if (await pg.$("#innOk")) await pg.click("#innOk"); }
    await pg.waitForTimeout(150);
    await pg.click(".askwrap [data-yes]");
    is("the next game starts with no notes", await ev(pg, '(function(){ var G=JSON.parse(localStorage.getItem("dugout-pitch-chart-v2")); return G.pitchers.map(function(p){ return (p.note||"")+(p.comments||""); }).join(""); })()'), "");
    await ev(pg, '(function(){ var row=[...document.querySelectorAll("#histList .hrow")].find(function(r){ return /Ponderosa/.test(r.textContent); }); [...row.querySelectorAll("button")].find(function(x){ return x.textContent==="Summary"; }).click(); })()');
    is("opens from History for a filed game", await ev(pg, '!document.getElementById("v-sum").hidden'), true);
    is("  numbers are read-only: only the 2 notes are inputs", await ev(pg, '[...document.querySelectorAll("#v-sum input, #v-sum textarea, #v-sum select")].map(function(e){ return e.getAttribute("data-k"); }).join(",")'), "note,comments");
    await pg.fill('#sumArms textarea[data-k="note"]', "Good tempo. Trust the changeup.");
    const g = await ev(pg, 'JSON.parse(localStorage.getItem("dugout-pitch-chart-archive-v1")).find(function(x){ return x.opp==="Ponderosa"; })');
    is("  an edit is saved on the filed game", g.pitchers[0].note, "Good tempo. Trust the changeup.");
    is("  not yet uploaded, so no separate notes send is queued", !!g.notesDirty, false);
    await pg.click("#sumBack");
    is("closing with no level picked lands on Setup", await ev(pg, '!document.getElementById("v-setup").hidden'), true);
    is("no page errors", pg.errs.join("|"), "");
    await pg.ctx.close();
  }

  await b.close();
  console.log("\n" + n + " summary checks" + (fail ? "\nFAILURES: " + fail : "\nall good"));
  process.exit(fail ? 1 : 0);
})();
