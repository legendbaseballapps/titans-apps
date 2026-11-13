/* Builds cards/sample.html: the sample player card and reflection for the player
   meeting (Nov 2026). Players open it from a QR code on their phones.

     cd titans-apps && node tools/cards/sample-page.js

   The cards are made by the REAL card code (cards/Code.gs) from the stand-in Sheet
   (tools/cards/fixture-sheet.json), with made-up names in place of the roster names.
   The reflection form is the real one too. The only difference: nothing is saved or
   sent. Submitting shows "what your coaches see" right on the phone.

   One file, the logo inside it, no network calls, so it works on 1 bar of signal and,
   with cards/sample-sw.js, keeps working offline once it has loaded. */
"use strict";
const fs = require("fs");
const path = require("path");
const { makeRuntime } = require("../receiver/mock-gas");

const ROOT = path.join(__dirname, "..", "..");
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, "fixture-sheet.json"), "utf8"));
const ROSTER = fs.readFileSync(path.join(ROOT, "bullpen", "roster.js"), "utf8");
const LOGO = "data:image/jpeg;base64," + require("child_process").execFileSync("python3", ["-c", "import sys,io;from PIL import Image;im=Image.open(sys.argv[1]).convert(\"RGB\").resize((160,79),Image.LANCZOS);b=io.BytesIO();im.save(b,\"JPEG\",quality=85,optimize=True);sys.stdout.buffer.write(b.getvalue())", path.join(ROOT, "cards", "lt-logo.png")]).toString("base64");
const PITCHER = { id: "ad6bxsq", first: "Jake", last: "Miller" };
const HITTER = { id: "fro8j13", first: "Ryan", last: "Torres" };
const VERSION = "sample 6 (Nov 2026)";

const rt = makeRuntime(path.join(ROOT, "cards", "Code.gs"), { fetch: { "https://legendbaseballapps.github.io/titans-apps/bullpen/roster.js": ROSTER } });
const b = rt.newBook("S");
Object.keys(FIX).forEach(n => { b.insertSheet(n).data = JSON.parse(JSON.stringify(FIX[n])); });
rt.props.SEASON_SHEET_ID = "S";
rt.sandbox.setup(); rt.sandbox.addRosterPlayers();
rt.props.LOGO_URL = LOGO;
const P = b.getSheetByName("Players"), h = P.header();
[PITCHER, HITTER].forEach(x => { const r = P.data.find(r => r[0] === x.id); r[h.indexOf("First")] = x.first; r[h.indexOf("Last")] = x.last; });

/* Nov 12: show every mark on the sample hitter's zone. The demo hitter never swung and
   missed, so his 2 fouls before 2 strikes become swings and misses here (same count, same
   strike, same at-bat results); he keeps 1 foul and 2 balls in play as contact, and 4 takes. */
(function () {
  const O = b.getSheetByName("Offense_Pitches"), oh = O.header(), c = k => oh.indexOf(k);
  let n = 0;
  O.data.forEach((r, i) => {
    if (i && r[c("HitterID")] === HITTER.id && r[c("What")] === "Foul" && +r[c("CountS")] < 2) { r[c("What")] = "Swing & miss"; n++; }
  });
  if (n !== 2) throw new Error("expected 2 early fouls to turn into swings and misses, got " + n);
})();
const S = rt.sandbox, d = S.load_(b);
const rec = (app, date) => b.getSheetByName("Records").records().find(r => r.App === app && (!date || r.Date === date)).RecordID;
const pen = S.build_(d, rec("bullpen", "2027-01-19"), PITCHER.id);
const game = S.build_(d, rec("game"), PITCHER.id);
const hit = S.build_(d, rec("offense"), HITTER.id);
[pen, game, hit].forEach(c => { if (!c) throw new Error("a sample card did not build"); });
/* no real names anywhere on the cards */
const ROSTER_NAMES = ["Smith", "Colten", "Hazen", "Troy", "Hall", "Borcherding", "Bobo"];

function cardTable(c) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card">' + S.cardTop_(c) + c.body + "</table>";
}
/* The real form, made private to its section (2 forms share one page). */
function form(prefix, c, last) {
  let f = S.formHtml_("sample", c, last);
  f = f.replace('id="f"', 'id="' + prefix + 'f"').replace('id="msg"', 'id="' + prefix + 'msg"').replace('id="go"', 'id="' + prefix + 'go"')
    .replace("getElementById('f')", "getElementById('" + prefix + "f')").replace("getElementById('msg')", "getElementById('" + prefix + "msg')")
    .replace("getElementById('go')", "getElementById('" + prefix + "go')")
    .replace("document.querySelectorAll('.scale')", "document.querySelectorAll('#" + prefix + "f .scale')");
  return f + '<div id="' + prefix + 'cv"></div>';
}
const extraCss = `
.intro p{margin:6px 0 0}.sample{display:inline-block;margin-top:10px;background:#FDF3EC;color:#C85C1C;font-weight:700;font-size:13px;padding:5px 10px;border-radius:12px}
.pick{display:flex;gap:10px;margin-top:12px}.pick button,.tabs button{flex:1;padding:14px 8px;border:1px solid #D2D9E6;border-radius:10px;background:#fff;font:inherit;font-weight:700;color:#16305C}
.pick button.on,.tabs button.on{background:#16305C;color:#fff;border-color:#16305C}.tabs{display:flex;gap:8px;margin:12px 0}
.hide{display:none}.jump{display:block;text-align:center;margin:12px 0;padding:14px;border-radius:8px;background:#C85C1C;color:#fff;text-decoration:none;font-weight:700;letter-spacing:1px;text-transform:uppercase}
.cv{background:#fff;border:2px solid #16305C;border-radius:10px;padding:16px 18px;margin-top:12px}.cv h2{margin-top:0}.cv p{margin:6px 0}.cv .lab{color:#5A6781;font-size:13px;text-transform:uppercase;letter-spacing:.8px}
.flag{background:#FBE3D2;color:#C85C1C;font-weight:700;padding:8px 10px;border-radius:8px}`;

const inner =
  '<div class="head intro"><div class="org">Legend Titans Baseball</div><h1>Your player card</h1>' +
  "<p>After every pen and game, you get a card like this by email, then you write a 2-minute reflection.</p>" +
  '<span class="sample">Sample only &middot; made-up player &middot; nothing you enter is saved or sent</span>' +
  '<div class="pick"><button type="button" data-show="pitcher">I&rsquo;m a pitcher</button><button type="button" data-show="hitter">I&rsquo;m a hitter</button></div></div>' +
  '<section id="pitcher" class="hide"><div class="tabs"><button type="button" class="on" data-card="pen">Bullpen card</button><button type="button" data-card="game">Game card</button></div>' +
  '<div id="c-pen">' + cardTable(pen) + "</div>" + '<div id="c-game" class="hide">' + cardTable(game) + "</div>" +
  '<a class="jump" href="#pf">Write your reflection &darr;</a>' + form("p", pen, "Finish the change-up out front") + "</section>" +
  '<section id="hitter" class="hide">' + cardTable(hit) + '<a class="jump" href="#hf">Write your reflection &darr;</a>' +
  form("h", hit, "Get my front foot down early") + "</section>" +
  `<script>(function(){
function $(s){return document.querySelector(s);}
document.querySelectorAll('.pick button').forEach(function(b){b.addEventListener('click',function(){
  document.querySelectorAll('.pick button').forEach(function(x){x.className='';});b.className='on';
  ['pitcher','hitter'].forEach(function(id){document.getElementById(id).className=(id===b.getAttribute('data-show'))?'':'hide';});
  document.getElementById(b.getAttribute('data-show')).scrollIntoView({behavior:'smooth'});});});
document.querySelectorAll('.tabs button').forEach(function(b){b.addEventListener('click',function(){
  document.querySelectorAll('.tabs button').forEach(function(x){x.className='';});b.className='on';
  ['pen','game'].forEach(function(k){document.getElementById('c-'+k).className=(k===b.getAttribute('data-card'))?'':'hide';});});});
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
/* Stands in for the real save. Nothing leaves the phone. */
window.google={script:{run:(function(){function R(s,f){this.s=s;this.f=f;}
R.prototype.withSuccessHandler=function(s){return new R(s,this.f);};
R.prototype.withFailureHandler=function(f){return new R(this.s,f);};
R.prototype.saveReflection=function(o){var hitter=o.k==='hit',flag=o.arm<=2||o.feel<=2,s=this.s;
  var line=function(l,v){return v?'<p><span class="lab">'+l+'</span><br>'+esc(v)+'</p>':'';};
  var html='<div class="cv"><h2>What your coaches see</h2>'+
    (flag?'<p class="flag">You rated a 1 or 2, so your '+(hitter?'hitting':'pitching')+' coach would get an email right away to check in with you.</p>':'')+
    line(hitter?'Body':'Arm',o.arm+' of 5')+line('Feel about today',o.feel+' of 5')+line('Pre-pitch process',o.pre)+line('Reset at a yellow light',o.reset)+
    line('Did you start it?',o.did)+line('START',o.start)+line('STOP',o.stop)+line('CONTINUE',o.cont)+line('Bothering you',o.bother)+
    '<p style="color:#5A6781;font-size:13px">Sample only: this stayed on your phone. Starting Jan 8 the real one goes to your coaches.</p></div>';
  setTimeout(function(){document.getElementById((hitter?'h':'p')+'cv').innerHTML=html;s&&s({ok:true,flag:flag});
    document.getElementById((hitter?'h':'p')+'cv').scrollIntoView({behavior:'smooth'});},250);};
return new R();})()}};
if('serviceWorker' in navigator){navigator.serviceWorker.register('sample-sw.js').catch(function(){});}
})();</script>`;

let html = S.pageDoc_("Your player card · sample", inner)
  .replace("</style>", extraCss + "</style>")
  .replace('<base target="_top">', "")
  .replace("<head>", "<head><!-- " + VERSION + " · built by tools/cards/sample-page.js -->");
ROSTER_NAMES.forEach(n => { if (new RegExp("\\b" + n + "\\b").test(html.replace(/data:image[^"]+/g, ""))) throw new Error("real roster name on the sample page: " + n); });
if (/script\.google\.com|googleusercontent/.test(html)) throw new Error("sample page must not call Google");
fs.writeFileSync(path.join(ROOT, "cards", "sample.html"), html);
fs.writeFileSync(path.join(ROOT, "cards", "sample-sw.js"),
`/* ${VERSION}: keeps the sample card page working with no signal once it has loaded. */
var CACHE = "titans-sample-${VERSION.split(" ")[1]}";
self.addEventListener("install", function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(["sample.html"]); })); self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(caches.keys().then(function (k) { return Promise.all(k.filter(function (n) { return n.indexOf("titans-sample-") === 0 && n !== CACHE; }).map(function (n) { return caches.delete(n); })); })); });
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then(function (r) { var c = r.clone(); caches.open(CACHE).then(function (x) { x.put(e.request, c); }); return r; })
    .catch(function () { return caches.match(e.request, { ignoreSearch: true }); }));
});
`);
console.log("cards/sample.html " + Math.round(html.length / 1024) + " KB");
