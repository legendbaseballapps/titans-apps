/* The 3 apps, held to one shape (Oct 20, 2026; Bullpen v40, Pitch Chart v32,
   Offense v48). Jim: "the more similar we can make the apps the easier the
   learning curve should be for new users."

     cd titans-apps && python3 -m http.server 8807 &
     node tools/consistency.js

   Every check reads the same thing out of all 3 apps and expects one answer. A
   check that fails here means one app has drifted from the other two. */
const { chromium } = require("playwright");
const { FILL_SETUP, FILL_OFFENSE } = require("./game-ready.js");
const BASE = process.env.BASE || "http://localhost:8807";
const APPS = [
  { name: "bullpen", path: "/bullpen/index.html", hist: "tab-hist" },
  { name: "game",    path: "/game/index.html",    hist: "tab-history" },
  { name: "offense", path: "/offense/index.html", hist: "tab-history" },
];
const TODAY = (d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"))(new Date());
let fail = 0, n = 0;
function same(name, got) {
  n++;
  const vals = APPS.map(a => JSON.stringify(got[a.name]));
  const ok = vals.every(v => v === vals[0]);
  if (!ok) fail++;
  console.log((ok ? "  ok   " : "  MISS ") + name.padEnd(52) + (ok ? vals[0] : APPS.map((a, i) => a.name + "=" + vals[i]).join("  ")));
}
function is(name, got, want) {
  n++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log((ok ? "  ok   " : "  MISS ") + name.padEnd(52) + JSON.stringify(got) + (ok ? "" : "  (expected " + JSON.stringify(want) + ")"));
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    args: ["--host-resolver-rules=MAP script.google.com ~NOTFOUND, MAP *.googleusercontent.com ~NOTFOUND", "--no-proxy-server"] });
  const pages = {};
  for (const a of APPS) {
    const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, serviceWorkers: "block" });
    const pg = await ctx.newPage(); pg.errs = []; pg.on("pageerror", e => pg.errs.push(String(e)));
    await pg.goto(BASE + a.path, { waitUntil: "load" }); await pg.waitForTimeout(700);
    pages[a.name] = pg;
  }
  const each = async js => { const o = {}; for (const a of APPS) o[a.name] = await pages[a.name].evaluate(js); return o; };

  console.log("\nHEADER");
  same("brand line 1", await each('document.querySelector(".top .brand h1").textContent'));
  same("brand line 2 names the app, then the build", await each('/^(Bullpen|Pitch|Offense) Chart · v\\d+$/.test(document.querySelector(".top .brand span").textContent.replace(/\\s+/g," ").trim())'));
  same("header order: tabs, Guide, Finish & file", await each('[...document.querySelectorAll(".top .tabs button, .top .topbar2 > *")].map(function(e){ return e.id === "hdrFinish" ? "finish" : (e.id ? (e.id === "tab-hist" ? "tab-history" : e.id) : e.textContent.trim()); }).join(",")'));
  same("tab labels", await each('[...document.querySelectorAll(".top .tabs button")].map(function(e){ return e.textContent.trim(); }).join(",")'));
  same("first header field is a date picker on today", await each(`(function(){ var i=document.querySelector(".top .gamebar input"); return i.type + " " + (i.value === ${JSON.stringify(TODAY)}); })()`));
  same("header colors (bar, selected tab, Finish)", await each('(function(){ var t=getComputedStyle(document.querySelector(".top")).backgroundColor; var s=getComputedStyle(document.querySelector(".top .tabs button[aria-selected=\\"true\\"]")).backgroundColor; var f=getComputedStyle(document.getElementById("hdrFinish")).backgroundColor; return [t,s,f].join(" | "); })()'));
  same("tab font size", await each('getComputedStyle(document.querySelector(".top .tabs button")).fontSize'));
  is("the header fits on one row at iPad width", Object.values(await each('(function(){ var br=document.querySelector(".top .brand").getBoundingClientRect(); return [".top .tabs",".top .topbar2",".top .gamebar"].every(function(s){ var r=document.querySelector(s).getBoundingClientRect(); return r.top < br.bottom && r.right <= innerWidth; }); })()')), [true, true, true]);

  console.log("\nSETUP");
  same("opens on Setup", await each('!document.getElementById("v-setup").hidden'));
  same("the who's pitching strip hides off the Chart tab", await each('getComputedStyle(document.getElementById("chartBar")).display'));
  same("a This game / This session panel holds who's charting and practice", await each('(function(){ var p=[...document.querySelectorAll("#v-setup .panel")].find(function(x){ return /^This (game|session)$/i.test((x.querySelector(".phead .lbl, h2")||{}).textContent||""); }); return !!p && /Who.s charting/i.test(p.textContent) && !!p.querySelector("input[type=checkbox]"); })()'));
  same("Ready to chart is next-to-last, Start over last", await each('(function(){ var t=[...document.querySelectorAll("#v-setup .panel")].map(function(x){ return ((x.querySelector(".phead .lbl, h2")||{}).textContent||"").trim().toLowerCase(); }).filter(Boolean); return t.slice(-2).join(" / "); })()'));
  same("Start over offers Clear pitches and Start over", await each('[...document.querySelectorAll("#btnClearPitches, #btnReset")].map(function(e){ return e.textContent.trim(); }).join(",")'));
  same("panel header look (font size, color, background)", await each('(function(){ var h=document.querySelector("#v-setup .panel .phead .lbl, #v-setup .panel > h2"); var c=getComputedStyle(h), bg=getComputedStyle(h.closest(".phead") || h).backgroundColor; return [c.fontSize, c.color, bg].join(" "); })()'));
  same("Start charting waits until Setup is done", await each('(function(){ var b=document.getElementById("btnStart")||document.getElementById("suDone"); return b.disabled; })()'));
  same("no Finish & file on Setup", await each('!document.querySelector("#v-setup #btnArchive, #v-setup .finishbtn")'));

  console.log("\nNOTICES, BUTTONS, DIALOGS, FOOTER");
  same("offline notice style (with workers blocked)", await each('(function(){ var n=document.getElementById("netBar"); return n.className + " | " + n.querySelector("strong").textContent; })()'));
  same("storage notice on first launch", await each('(function(){ var n=document.getElementById("storeBar"); return n.hidden ? "none" : n.querySelector("strong").textContent; })()'));
  same("button size (Clear pitches)", await each('(function(){ var c=getComputedStyle(document.getElementById("btnClearPitches")); return c.fontSize + " " + c.paddingTop + " " + c.paddingLeft; })()'));
  same("footer format", await each('(document.getElementById("foot").textContent.replace(/\\s+/g," ").trim().match(/^Legend Titans · (Bullpen|Pitch|Offense) Chart v\\d+ · \\d+ pitches charted · \\d+ filed (sessions|games)$/)||[""])[0] ? "ok" : document.getElementById("foot").textContent'));
  same("browser title", await each('/^Titans (Bullpen|Pitch|Offense) Chart$/.test(document.title)'));

  /* get every app to charting, the way a coach would */
  await pages.bullpen.evaluate('(function(){ var s=document.querySelectorAll(\'#rosterTbl select[data-f="rid"]\'); var R=window.TITANS_ROSTER; s[0].value=R[0].id; s[0].dispatchEvent(new Event("input",{bubbles:true})); s[0].dispatchEvent(new Event("change",{bubbles:true})); var t=document.getElementById("tplPick"); t.value=t.options[1].value; t.dispatchEvent(new Event("change",{bubbles:true})); document.getElementById("tplLoad").click(); var y=document.querySelector(".askwrap [data-yes]"); if(y) y.click(); })()');
  await pages.game.click('[data-lvl="JV"]'); await pages.game.evaluate(FILL_SETUP);
  await pages.offense.click('[data-lvl="JV"]'); await pages.offense.evaluate(FILL_OFFENSE);
  same("Ready to chart turns green", await each('document.getElementById("readyPanel").classList.contains("ready")'));
  for (const a of APPS) await pages[a.name].click(a.name === "game" ? "#suDone" : "#btnStart");

  console.log("\nCHART");
  /* Bundle D: the "who's pitching" strip is the header's second row, on the Chart tab only. */
  same("the who's pitching strip shows on the Chart tab", await each('getComputedStyle(document.getElementById("chartBar")).display !== "none" && document.getElementById("chartBar").parentElement.classList.contains("top")'));
  same("  a chip per pitcher, the one throwing in white", await each('(function(){ var on=document.querySelector("#chartBar .pchip.on, #chartBar .mchip.on"); return !!on && getComputedStyle(on).backgroundColor; })()'));
  same("  4 live numbers on the right", await each('document.querySelectorAll("#chartBar .stat, #chartBar .mstat").length'));
  same("  number style", await each('(function(){ var b=document.querySelector("#chartBar .stat b, #chartBar .mstat b"); var c=getComputedStyle(b); return c.fontSize + " " + c.fontWeight; })()'));
  const bpKey = await pages.bullpen.evaluate('(function(){ document.getElementById("tab-setup").click(); var t=[...document.querySelectorAll("#v-setup span")].map(function(x){ return x.textContent.replace(/\\s+/g," ").trim(); }).filter(function(x){ return /^\\d (FB|CT|SL|CB|CH|SP)$/.test(x); }).map(function(x){ return x.split(" ")[1]; }); document.getElementById("tab-chart").click(); return t.join(" "); })()');
  is("bullpen key on Setup: FB CT SL CB CH SP", bpKey, "FB CT SL CB CH SP");
  is("pitch types on the Chart tab, one order", Object.values(await each('(function(){ var b=[...document.querySelectorAll("#types button, #typeRow button, [data-type], [data-t]")].map(function(e){ return (e.getAttribute("data-type")||e.getAttribute("data-t")||e.textContent).replace(/[^A-Z]/g,""); }).filter(function(k){ return /^(FB|CT|SL|CB|CH|SP)$/.test(k); }); var seen=[]; b.forEach(function(k){ if(seen.indexOf(k)<0) seen.push(k); }); return seen.join(" "); })()')).filter(v => v), ["FB CT SL CB CH SP", "FB CT SL CB CH SP"]);
  same("an Undo last pitch button", await each('[...document.querySelectorAll("#v-chart button")].some(function(e){ return e.textContent.trim().toLowerCase() === "undo last pitch"; })'));
  is("both game charts say Next hitter", [await pages.game.evaluate('document.getElementById("nextBtn").textContent'), await pages.offense.evaluate('document.getElementById("btnNextPA").textContent')].map(t => t.trim()), ["Next hitter →", "Next hitter →"]);
  is("both game charts offer SF", [await pages.game.evaluate('!!document.querySelector(\'#results [data-res="SF"]\')'), await pages.offense.evaluate('!!document.querySelector(\'#results [data-res="SF"]\')')], [true, true]);

  await pages.bullpen.evaluate('document.querySelector(\'#zone button[data-r="2"][data-c="2"]\').click()');
  await pages.game.click("#zone .cell:nth-child(13)");
  await pages.offense.click('#v-chart [data-r="2"][data-c="2"]');
  same("1 pitch: Finish & file shows in the header", await each('getComputedStyle(document.getElementById("hdrFinish")).display !== "none"'));

  console.log("\nREPORT AND HISTORY");
  for (const a of APPS) await pages[a.name].click("#tab-report");
  same("Export is the last button on Report", await each('(function(){ var b=[...document.querySelectorAll("#v-report button")].filter(function(x){ return x.offsetParent; }); return /^export/i.test(b[b.length-1].textContent.trim()); })()'));
  same("the Export button style", await each('(function(){ var b=[...document.querySelectorAll("#v-report button")].filter(function(x){ return x.offsetParent && /^export/i.test(x.textContent.trim()); })[0]; var c=getComputedStyle(b); return c.backgroundColor + " " + c.fontSize; })()'));
  for (const a of APPS) await pages[a.name].click("#" + a.hist);
  same("no Delete anywhere in History", await each('![...document.querySelectorAll("button")].some(function(e){ return /^delete$/i.test(e.textContent.trim()); })'));
  for (const a of APPS) {
    const pg = pages[a.name];
    await pg.click("#hdrFinish"); await pg.waitForTimeout(150);
    /* the Pitch Chart asks about an open inning first */
    if (await pg.$("#innNoRuns")) { await pg.click("#innNoRuns"); await pg.waitForTimeout(150); if (await pg.$("#innOk")) await pg.click("#innOk"); await pg.waitForTimeout(150); }
  }
  same("the Finish & file dialog's main button", await each('(function(){ var y=document.querySelector(".askwrap [data-yes]"); var c=getComputedStyle(y); return y.textContent + " " + c.backgroundColor; })()'));
  for (const a of APPS) {
    const pg = pages[a.name];
    if (await pg.$(".askwrap [data-yes]")) await pg.click(".askwrap [data-yes]");
    await pg.waitForTimeout(250);
  }
  same("filing lands on Setup with a Filed note", await each('!document.getElementById("v-setup").hidden && /^Filed\\. 1 (game|session) in History\\./.test(document.getElementById("setupNote").textContent)'));
  for (const a of APPS) await pages[a.name].click("#" + a.hist);
  same("History: the filed list comes first", await each('(function(){ var p=[...document.querySelectorAll("#v-hist .panel, #v-history .panel")][0]; return /^Filed (games|sessions)/i.test(((p.querySelector(".phead .lbl, h2")||{}).textContent||"").trim()); })()'));
  same("History: the upload pill look", await each('(function(){ var p=[...document.querySelectorAll(".pill")].find(function(x){ return x.textContent==="waiting"; }); var c=getComputedStyle(p); return c.textTransform + " " + c.fontSize + " " + c.fontWeight; })()'));
  for (const a of APPS) is(a.name + ": no page errors", pages[a.name].errs.join("|"), "");

  await b.close();
  console.log("\n" + n + " consistency checks" + (fail ? "\nFAILURES: " + fail : "\nall good"));
  process.exit(fail ? 1 : 0);
})();
