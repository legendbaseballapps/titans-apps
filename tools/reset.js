/* Clear pitches / Start over: the same pair on the Setup tab of all 3 apps
   (Pitch Chart v31, Offense Chart v47, Bullpen v39).

     cd titans-apps && python3 -m http.server 8807 &
     node tools/reset.js

   Clear pitches keeps everything on Setup and clears everything charted; Start over
   goes back to a blank Setup. Both ask first and never touch History. Google's
   script hosts are blocked, so nothing here reaches the real receiver. */
const { chromium } = require("playwright");
const { FILL_SETUP, FILL_OFFENSE } = require("./game-ready.js");
const TODAY = (d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"))(new Date());
const BASE = process.env.BASE || "http://localhost:8807";
let fail = 0, n = 0;
function is(name, got, want) {
  n++;
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log((ok ? "  ok   " : "  MISS ") + name.padEnd(58) + JSON.stringify(got) + (ok ? "" : "  (expected " + JSON.stringify(want) + ")"));
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
  const asked = pg => ev(pg, '(function(){ var p=document.querySelector(".askwrap p"); return p ? p.textContent : ""; })()');
  const yes = pg => pg.click(".askwrap [data-yes]");
  const no = pg => pg.click(".askwrap [data-no]");

  /* ------------------------------------------------------------ Pitch Chart */
  console.log("\nPITCH CHART v32");
  {
    const pg = await open("/game/index.html");
    const G = () => ev(pg, 'JSON.parse(localStorage.getItem("dugout-pitch-chart-v2"))');
    const pitches = g => g.lineup.reduce((t, sp) => t + sp.men.reduce((u, m) => u + m.abs.reduce((v, a) => v + a.pitches.length, 0), 0), 0);
    is("Discard this game is gone from the Report tab", await ev(pg, '!document.getElementById("btnClear")'), true);
    is("both buttons are on Setup", await ev(pg, '!!document.querySelector("#v-setup #btnClearPitches") && !!document.querySelector("#v-setup #btnReset")'), true);
    await pg.click("#btnClearPitches");
    is("nothing charted: Clear pitches says so, no dialog", (await asked(pg)) + "|" + await ev(pg, 'document.getElementById("setupNote").textContent'), "|Nothing charted yet, so there is nothing to clear.");
    await pg.click('[data-lvl="JV"]');
    await ev(pg, '(function(){ var set=function(id,v){ var e=document.getElementById(id); e.value=v; e.dispatchEvent(new Event("input",{bubbles:true})); }; set("fOpp","Ponderosa"); var d=document.getElementById("fDate"); d.value="2027-04-18"; d.dispatchEvent(new Event("change",{bubbles:true})); })()');
    await ev(pg, FILL_SETUP);
    await pg.click("#fPractice");
    await pg.click("#suDone");
    await pg.click("#zone .cell:nth-child(13)"); await pg.click('#results button[data-res="GO"]'); await pg.click("#nextBtn");
    await pg.click("#zone .cell:nth-child(13)");
    await pg.click("#pitchers .addp");
    await ev(pg, '(function(){ var s=document.querySelector(\'#pitchers select[data-pick="1"]\'); s.value=s.options[2].value; s.dispatchEvent(new Event("change",{bubbles:true})); })()');
    await pg.click("#tab-report");
    await pg.fill('#sumArms textarea[data-k="note"]', "Good tempo");
    is("charted: 2 pitches, a reliever, a note", pitches(await G()) + " " + (await G()).shown + " " + (await G()).pitchers[0].note, "2 2 Good tempo");
    await pg.click("#tab-setup");
    await pg.click("#btnClearPitches");
    is("Clear pitches asks first, naming the count", /^Clear the pitches\?\s+2 charted pitches/.test(await asked(pg)), true);
    await no(pg);
    is("  Cancel clears nothing", pitches(await G()), 2);
    await pg.click("#btnClearPitches"); await yes(pg);
    let g = await G();
    is("  yes: no pitches, no at-bat results", pitches(g) + " " + g.lineup.filter(sp => sp.men[0].abs.some(a => a.result)).length, "0 0");
    is("  reliever gone, starter kept", g.shown + " " + (g.pitchers[1].rid || "-") + " " + (g.pitchers[0].rid === await ev(pg, 'window.TITANS_ROSTER[0].id')), "1 - true");
    is("  innings and outs back to the start", g.inning + " " + g.innings.length + " " + g.outs, "1 0 0");
    is("  the pitcher note is cleared", g.pitchers[0].note || "", "");
    is("  Setup kept: level, date, opponent, practice", [g.level, g.date, g.opp, g.practice].join(" "), "JV 2027-04-18 Ponderosa true");
    is("  Setup kept: the lineup", g.lineup[0].men[0].name + " #" + g.lineup[0].men[0].jersey, "Hitter 1 #40");
    is("  lands on Setup, says what happened", await ev(pg, '!document.getElementById("v-setup").hidden && /Pitches cleared/.test(document.getElementById("setupNote").textContent)'), true);
    is("  and is ready to chart again", /^✓ Ready/.test(await ev(pg, 'document.getElementById("readyMsg").textContent')), true);
    await pg.click("#suDone"); await pg.click("#zone .cell:nth-child(13)");
    is("  charting works again", pitches(await G()), 1);
    is("History untouched", await ev(pg, 'JSON.parse(localStorage.getItem("dugout-pitch-chart-archive-v1")||"[]").length'), 0);
    await pg.click("#tab-setup");
    await pg.click("#btnReset");
    is("Start over asks first", /^Start over\?\s+1 charted pitch will be gone/.test(await asked(pg)), true);
    await yes(pg);
    g = await G();
    is("  yes: level and opponent cleared, the date back to today", JSON.stringify([g.level, g.opp, g.date === TODAY]), '["","",true]');
    is("  the lineup cleared", g.lineup[0].men[0].name + "|" + g.lineup[0].men[0].jersey, "|");
    is("  the starter stays", g.pitchers[0].rid === await ev(pg, 'window.TITANS_ROSTER[0].id'), true);
    is("  practice off, no pitches", g.practice + " " + pitches(g), "false 0");
    is("  locked again until Setup is done", /^Not yet/.test(await ev(pg, 'document.getElementById("readyMsg").textContent')), true);
    is("no page errors", pg.errs.join("|"), "");
    await pg.ctx.close();
  }

  /* ------------------------------------------------------------ Offense Chart */
  console.log("\nOFFENSE CHART v48");
  {
    const pg = await open("/offense/index.html");
    const O = () => ev(pg, 'JSON.parse(localStorage.getItem("titans-offense-v1"))');
    const pitches = o => o.pas.reduce((t, a) => t + a.pitches.length, 0);
    is("both buttons are on Setup", await ev(pg, '!!document.querySelector("#v-setup #btnClearPitches") && !!document.querySelector("#v-setup #btnReset")'), true);
    await pg.click('[data-lvl="JV"]');
    await ev(pg, '(function(){ var set=function(id,v){ var e=document.getElementById(id); e.value=v; e.dispatchEvent(new Event("input",{bubbles:true})); e.dispatchEvent(new Event("change",{bubbles:true})); }; set("fDate","2027-04-18"); set("fOpp","Ponderosa"); var p=document.querySelector(\'[data-pi="0"] input[data-pf="name"]\'); p.value="Lefty Starter"; p.dispatchEvent(new Event("input",{bubbles:true})); })()');
    await ev(pg, FILL_OFFENSE);   /* v48: all of Setup */
    await pg.click("#btnStart");
    await pg.click('#v-chart [data-r="2"][data-c="2"]'); await pg.click('#v-chart [data-r="2"][data-c="2"]');
    is("fixture: a real hitter in spot 1, their starter named", !!(await O()).lineup[0].men[0].rid + " " + (await O()).pitchers[0].name, "true Lefty Starter");
    const line0 = JSON.stringify((await O()).lineup.map(sp => sp.men[0]));
    is("charted: 2 pitches", pitches(await O()), 2);
    await pg.click("#tab-setup");
    await pg.click("#btnClearPitches");
    is("Clear pitches asks first, naming the count", /^Clear the pitches\?\s+2 charted pitches/.test(await asked(pg)), true);
    await no(pg);
    is("  Cancel clears nothing", pitches(await O()), 2);
    await pg.click("#btnClearPitches"); await yes(pg);
    let o = await O();
    is("  yes: no pitches, one fresh at-bat", pitches(o) + " " + o.pas.length, "0 1");
    is("  Setup kept: level, date, opponent", [o.level, o.date, o.opp].join(" "), "JV 2027-04-18 Ponderosa");
    is("  Setup kept: our lineup", JSON.stringify(o.lineup.map(sp => sp.men[0])), line0);
    is("  Setup kept: their pitcher", o.pitchers[0].name, "Lefty Starter");
    is("  lands on Setup, says what happened", await ev(pg, '!document.getElementById("v-setup").hidden && /Pitches cleared/.test(document.getElementById("setupNote").textContent)'), true);
    await pg.click("#btnStart"); await pg.click('#v-chart [data-r="2"][data-c="2"]');
    is("  charting works again", pitches(await O()), 1);
    await pg.click("#tab-setup");
    await pg.click("#btnReset");
    is("Start over asks first", /^Start over\?\s+1 charted pitch will be gone/.test(await asked(pg)), true);
    await yes(pg);
    o = await O();
    is("  yes: level and opponent cleared, the date back to today", JSON.stringify([o.level, o.opp, o.date === TODAY]), '["","",true]');
    is("  our lineup stays", JSON.stringify(o.lineup.map(sp => sp.men[0])), line0);
    is("  their pitchers cleared", o.pitchers.map(p => p.name).join(",") , "");
    is("  no pitches", pitches(o), 0);
    is("History untouched", await ev(pg, 'JSON.parse(localStorage.getItem("titans-offense-archive-v1")||"[]").length'), 0);
    is("no page errors", pg.errs.join("|"), "");
    await pg.ctx.close();
  }

  /* ------------------------------------------------------------ Bullpen */
  console.log("\nBULLPEN v40");
  {
    const pg = await open("/bullpen/index.html");
    const S = () => ev(pg, 'JSON.parse(localStorage.getItem("titans-bullpen-v1"))');
    const pitches = s => s.pitchers.reduce((t, p) => t + p.pitches.length, 0);
    is("Reset this session is now Start over, beside Clear pitches", await ev(pg, 'document.getElementById("btnReset").textContent + " | " + document.getElementById("btnClearPitches").textContent'), "Start over | Clear pitches");
    await ev(pg, '(function(){ var s=document.querySelectorAll(\'#rosterTbl select[data-f="rid"]\'); var R=window.TITANS_ROSTER; [0,1].forEach(function(i){ s[i].value=R[i].id; s[i].dispatchEvent(new Event("input",{bubbles:true})); s[i].dispatchEvent(new Event("change",{bubbles:true})); }); var t=document.getElementById("tplPick"); t.value=t.options[1].value; t.dispatchEvent(new Event("change",{bubbles:true})); document.getElementById("tplLoad").click(); var y=document.querySelector(".askwrap [data-yes]"); if(y) y.click(); })()');
    await pg.click("#btnClearPitches");
    is("nothing charted: Clear pitches says so, no dialog", await asked(pg), "");
    await pg.click("#btnStart");
    for (let i = 0; i < 3; i++) await ev(pg, 'document.querySelector(\'#zone button[data-r="2"][data-c="2"]\').click()');
    await pg.fill("#note", "Stay tall");
    const s0 = await S();
    is("charted: 3 pitches and a note", pitches(s0) + " " + s0.pitchers[0].note, "3 Stay tall");
    await pg.click("#tab-setup");
    await pg.click("#btnClearPitches");
    is("Clear pitches asks first, naming the count", /^Clear the pitches\?\s+3 charted pitches/.test(await asked(pg)), true);
    await no(pg);
    is("  Cancel clears nothing", pitches(await S()), 3);
    await pg.click("#btnClearPitches"); await yes(pg);
    let s = await S();
    is("  yes: no pitches, no notes", pitches(s) + " " + JSON.stringify(s.pitchers[0].note), '0 ""');
    is("  Setup kept: names, script, template", [s.pitchers[0].rid === s0.pitchers[0].rid, s.script.length === s0.script.length && s.script.length > 0, s.tpl === s0.tpl].join(" "), "true true true");
    is("  a new session id (a new session to the dashboard)", s.sid !== s0.sid, true);
    is("  and it is ready to chart again", /^✓ Ready/.test(await ev(pg, 'document.getElementById("readyMsg").textContent')), true);
    await pg.click("#btnStart");
    await ev(pg, 'document.querySelector(\'#zone button[data-r="2"][data-c="2"]\').click()');
    is("  charting works again", pitches(await S()), 1);
    await pg.click("#tab-setup");
    await pg.click("#btnReset");
    is("Start over asks first", /^Start over\?\s+1 charted pitch will be gone/.test(await asked(pg)), true);
    await yes(pg);
    s = await S();
    is("  yes: script, template and names cleared", [s.script.length, s.tpl, s.pitchers.filter(p => p.rid || p.name).length].join(" "), "0  0");
    is("  the mound name stays", s.pad, s0.pad);
    is("History untouched", await ev(pg, 'JSON.parse(localStorage.getItem("titans-bullpen-archive-v1")||"[]").length'), 0);
    is("no page errors", pg.errs.join("|"), "");
    await pg.ctx.close();
  }

  await b.close();
  console.log("\n" + n + " reset checks" + (fail ? "\nFAILURES: " + fail : "\nall good"));
  process.exit(fail ? 1 : 0);
})();
