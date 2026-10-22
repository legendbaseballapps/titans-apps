/* Readability check for all 3 apps, light AND dark mode (Oct 22, 2026).
   Jim: "In the Pitch Chart app, the text for the Starting Pitcher dropdown is
   black and not readable. Fix it and evaluate the other two apps."

     cd titans-apps && python3 -m http.server 8807 &
     node tools/contrast.js            (add --list to print every failure)

   Walks every visible element that draws text (form controls included) on every
   tab, in both color schemes, works out the real background behind it (walking up
   through transparent parents), and computes the WCAG contrast ratio. Fails under
   3:1, the floor for large text and controls; anything under 4.5:1 is listed as a
   warning. A dark iPad is the case that bit: a <select> does not inherit the page's
   text color, so it came out black on a dark box. */
const { chromium } = require("playwright");
const { FILL_SETUP, FILL_OFFENSE } = require("./game-ready.js");
const BASE = process.env.BASE || "http://localhost:8807";
const LIST = process.argv.includes("--list");
const APPS = [
  { name: "bullpen", path: "/bullpen/index.html", hist: "tab-hist" },
  { name: "game",    path: "/game/index.html",    hist: "tab-history" },
  { name: "offense", path: "/offense/index.html", hist: "tab-history" },
];

/* Runs in the page. Returns [{sel, text, ratio, fg, bg}] for low-contrast text. */
const AUDIT = `(function(){
  function rgba(s){ var m = s.match(/rgba?\\(([^)]+)\\)/); if(!m) return null;
    var p = m[1].split(",").map(function(x){ return parseFloat(x); });
    return {r:p[0], g:p[1], b:p[2], a: p.length > 3 ? p[3] : 1}; }
  function lum(c){ function ch(v){ v/=255; return v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); }
    return .2126*ch(c.r) + .7152*ch(c.g) + .0722*ch(c.b); }
  function blend(top, under){ var a = top.a; return {r: top.r*a + under.r*(1-a), g: top.g*a + under.g*(1-a), b: top.b*a + under.b*(1-a), a:1}; }
  /* The background actually behind the text: semi-transparent layers blended down
     to the first solid one. A gradient counts as its first color stop. Also says
     which element supplied the solid base, so opacity above it (which fades the
     box and the text together) is not counted against the text. */
  var baseEl = null;
  function bgOf(el){
    var layers = []; baseEl = null;
    for(var e = el; e; e = e.parentElement){
      var cs = getComputedStyle(e);
      var c = rgba(cs.backgroundColor);
      if((!c || c.a === 0) && cs.backgroundImage && cs.backgroundImage !== "none") c = rgba(cs.backgroundImage);
      if(c && c.a > 0){ layers.push(c); if(c.a >= 1){ baseEl = e; break; } }
    }
    var base = layers.length && layers[layers.length-1].a >= 1 ? layers.pop() : rgba(getComputedStyle(document.body).backgroundColor) || {r:255,g:255,b:255,a:1};
    if(base.a < 1) base = blend(base, {r:255,g:255,b:255,a:1});
    for(var i = layers.length-1; i >= 0; i--) base = blend(layers[i], base);
    return base;
  }
  function visible(el){
    var r = el.getBoundingClientRect(); if(!r.width || !r.height) return false;
    for(var e = el; e; e = e.parentElement){ var c = getComputedStyle(e);
      if(c.display === "none" || c.visibility === "hidden" || +c.opacity === 0) return false; }
    return true;
  }
  function label(el){ var s = el.tagName.toLowerCase(); if(el.id) s += "#" + el.id;
    else if(el.className && typeof el.className === "string") s += "." + el.className.trim().split(/\\s+/).slice(0,2).join(".");
    var p = el.parentElement; if(p && p.id) s = "#" + p.id + " > " + s; return s; }
  var out = [], seen = {};
  var all = document.querySelectorAll("body *");
  for(var i = 0; i < all.length; i++){
    var el = all[i], tag = el.tagName;
    if(tag === "SCRIPT" || tag === "STYLE" || tag === "OPTION" || tag === "svg" || el.closest("svg")) continue;
    var control = /^(SELECT|INPUT|TEXTAREA|BUTTON)$/.test(tag);
    var own = "";
    if(control){
      if(tag === "INPUT" && /^(checkbox|radio|hidden|range|color|file)$/.test(el.type)) continue;
      own = tag === "SELECT" ? ((el.options[el.selectedIndex] || {}).text || "") : (el.value || el.placeholder || el.textContent || "");
    } else {
      for(var k = 0; k < el.childNodes.length; k++){ var n = el.childNodes[k]; if(n.nodeType === 3) own += n.textContent; }
    }
    own = own.replace(/\\s+/g, " ").trim();
    if(!own || !visible(el)) continue;
    if(el.disabled || el.closest("[disabled]")) continue;          /* disabled is meant to look faint */
    var cs = getComputedStyle(el);
    var fg = rgba(cs.color); if(!fg) continue;
    var bg = bgOf(el);
    var op = 1; for(var e = el; e && e !== baseEl; e = e.parentElement) op *= +getComputedStyle(e).opacity;
    fg = blend({r:fg.r, g:fg.g, b:fg.b, a:fg.a * op}, bg);
    var L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1,L2) + .05) / (Math.min(L1,L2) + .05);
    if(ratio < 4.5){
      var key = label(el) + "|" + Math.round(ratio*10);
      if(seen[key]) continue; seen[key] = 1;
      out.push({sel: label(el), text: own.slice(0, 40), ratio: Math.round(ratio*100)/100,
        fg: "rgb(" + [fg.r,fg.g,fg.b].map(Math.round).join(",") + ")", bg: "rgb(" + [bg.r,bg.g,bg.b].map(Math.round).join(",") + ")"});
    }
  }
  return out;
})()`;

let fails = 0, warns = 0;
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    args: ["--host-resolver-rules=MAP script.google.com ~NOTFOUND, MAP *.googleusercontent.com ~NOTFOUND", "--no-proxy-server"] });
  for (const scheme of ["light", "dark"]) {
    for (const a of APPS) {
      const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, serviceWorkers: "block", colorScheme: scheme });
      const pg = await ctx.newPage();
      await pg.goto(BASE + a.path, { waitUntil: "load" }); await pg.waitForTimeout(700);
      const states = [];
      const grab = async (label) => { states.push([label, await pg.evaluate(AUDIT)]); };
      await grab("setup (fresh)");
      await pg.click("#tab-chart"); await pg.waitForTimeout(150); await grab("chart (not ready)");
      await pg.click("#tab-setup");
      if (a.name === "bullpen") {
        await pg.evaluate('(function(){ var R=window.TITANS_ROSTER; [0,1].forEach(function(i){ var q=document.querySelectorAll(\'#rosterTbl select[data-f="rid"]\')[i]; q.value=R[i].id; q.dispatchEvent(new Event("input",{bubbles:true})); q.dispatchEvent(new Event("change",{bubbles:true})); }); var t=document.getElementById("tplPick"); t.value=t.options[1].value; t.dispatchEvent(new Event("change",{bubbles:true})); document.getElementById("tplLoad").click(); var y=document.querySelector(".askwrap [data-yes]"); if(y) y.click(); })()');
      } else if (a.name === "game") {
        await pg.click('[data-lvl="JV"]'); await pg.evaluate(FILL_SETUP);
      } else {
        await pg.click('[data-lvl="JV"]'); await pg.evaluate(FILL_OFFENSE);
      }
      await grab("setup (filled)");
      await pg.click(a.name === "game" ? "#suDone" : "#btnStart"); await pg.waitForTimeout(150);
      if (a.name === "bullpen") for (let i = 0; i < 3; i++) await pg.evaluate('document.querySelector(\'#zone button[data-r="2"][data-c="2"]\').click()');
      if (a.name === "game") { await pg.click("#zone .cell:nth-child(13)"); await pg.click('#results button[data-res="GO"]'); }
      if (a.name === "offense") { await pg.click('#v-chart [data-r="2"][data-c="2"]'); await pg.click('#v-chart [data-r="1"][data-c="3"]'); }
      await grab("chart");
      await pg.click("#tab-report"); await pg.waitForTimeout(150); await grab("report");
      await pg.click("#hdrFinish"); await pg.waitForTimeout(150);
      if (await pg.$("#innNoRuns")) { await grab("inning prompt"); await pg.click("#innNoRuns"); await pg.waitForTimeout(150); if (await pg.$("#innOk")) await pg.click("#innOk"); await pg.waitForTimeout(150); }
      await grab("finish dialog");
      if (await pg.$(".askwrap [data-yes]")) await pg.click(".askwrap [data-yes]");
      await pg.waitForTimeout(250);
      await pg.click("#" + a.hist); await pg.waitForTimeout(150); await grab("history");
      let f = 0, w = 0;
      for (const [label, list] of states) for (const x of list) {
        const bad = x.ratio < 3;
        if (bad) f++; else w++;
        if (bad || LIST) console.log("  " + (bad ? "FAIL" : "warn") + " " + scheme.padEnd(5) + " " + a.name.padEnd(7) + " " + label.padEnd(17) + " " + String(x.ratio).padEnd(5) + " " + x.sel + "  \"" + x.text + "\"  " + x.fg + " on " + x.bg);
      }
      console.log((f ? "  MISS " : "  ok   ") + (scheme + " · " + a.name).padEnd(20) + f + " unreadable (under 3:1), " + w + " faint (3 to 4.5:1)");
      fails += f; warns += w;
      await ctx.close();
    }
  }
  await b.close();
  console.log("\n" + fails + " unreadable, " + warns + " faint" + (fails ? "\nFAILURES: " + fails : "\nall readable"));
  process.exit(fails ? 1 : 0);
})();
