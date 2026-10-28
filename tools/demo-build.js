/* Builds the demo data for Jim's player meeting (Oct 26, 2026).
   Jim: "Build full 7-inning games in the pitch chart and offense chart apps ...
   In the bullpen chart app build full routines using one of the scripts for
   Colten Smith, Colby Hall and Talon Borcherding ... high-school average strike
   percentages ... FB velocities in the upper 80s for Hall and Borcherding and
   low 90s for Smith."  Charted, not filed. Smith starts, Hall and Borcherding relieve.

     cd titans-apps && python3 -m http.server 8807 &
     node tools/demo-build.js            -> tools/demo-data.json

   Every pitch is entered by TAPPING THE REAL APPS (the same buttons a charter
   uses), so the saved data is exactly what the apps themselves write. Seeded,
   so a rebuild gives the same games. */
const { chromium } = require("playwright");
const fs = require("fs");
const BASE = process.env.BASE || "http://localhost:8807";
const SEED = +(process.env.SEED || 7);
/* DECK_SHOTS=<folder>: instead of writing demo-data.json, stop each app part-way
   and screenshot it for the head coach deck (Oct 27). The test-only banners (no
   service worker in this browser) are hidden; the iPad shows "Ready to use offline". */
const SHOTS = process.env.DECK_SHOTS || "";
const GAME_STOP = 11;          /* the 2nd hitter of the 3rd inning, 2 pitches in */
const PEN_STOP = 14;           /* Hall, 14 pitches into his pen, after Smith's full one */
async function shot(pg, name){
  await pg.addStyleTag({ content: "#netBar,#storeBar{display:none !important}" });
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: SHOTS + "/" + name + ".png" });
}

function rng(seed){ let a = seed >>> 0; return function(){ a |= 0; a = a + 0x6D2B79F5 | 0;
  let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let R = rng(SEED);
const pick = (arr) => arr[Math.floor(R() * arr.length)];
function wpick(pairs){ let s = 0; pairs.forEach(p => s += p[1]); let x = R() * s;
  for (const p of pairs){ x -= p[1]; if (x <= 0) return p[0]; } return pairs[pairs.length-1][0]; }
const inZone = (r,c) => r>=1 && r<=3 && c>=1 && c<=3;

/* ---------------------------------------------------------------- one PA
   Pitch events: B ball, CS called strike, SW swing and miss, F foul, X in play.
   Rates are a high-school varsity average: about 61% strikes. The PA is redrawn
   until it ends the way the scorebook says it did. */
function simPA(goal){
  const want = goal === "K" ? "K" : goal === "Kc" ? "Kc" : goal === "BB" ? "BB" : "X";
  for (let tries = 0; tries < 5000; tries++){
    let b = 0, s = 0, ev = [], end = null;
    while (!end){
      const two = s === 2, three = b === 3;
      const e = wpick([["B", three ? .30 : .38], ["CS", two ? .07 : .18], ["SW", two ? .13 : .09],
                       ["F", two ? .24 : .17], ["X", two ? .19 : .16]]);
      ev.push(e);
      if (e === "B"){ b++; if (b === 4) end = "BB"; }
      else if (e === "CS"){ s++; if (s === 3) end = "Kc"; }
      else if (e === "SW"){ s++; if (s === 3) end = "K"; }
      else if (e === "F"){ if (s < 2) s++; }
      else end = "X";
      if (ev.length > 10) break;
    }
    if (end === want && ev.length <= 9) return ev;
  }
  throw new Error("no PA for " + goal);
}

/* Location on the 5x5 grid, catcher's view. Inside to a righty is column 0. */
function loc(ev, type, hand, goal){
  const away = hand === "L" ? 0 : 4, inside = hand === "L" ? 4 : 0;
  const soft = type !== "FB";
  if (goal === "HBP") return [1 + Math.floor(R()*2), inside];
  const zone = () => wpick([[[2,2], .5], [[1,1],1],[[1,2],1],[[1,3],1],[[2,1],1.2],[[2,3],1.2],
                            [[3,1],1.1],[[3,2],1.1],[[3,3],1.1]]);
  const ring = () => {
    const cells = [];
    for (let r=0;r<5;r++) for (let c=0;c<5;c++) if (!inZone(r,c)){
      let w = (r===0||r===4) && (c===0||c===4) ? .45 : 1;
      if (r === 4) w *= soft ? 2.4 : 1.1;
      if (r === 0) w *= soft ? .3 : 1.2;
      if (c === away) w *= soft ? 1.5 : 1.1;
      cells.push([[r,c], w]);
    }
    return wpick(cells);
  };
  if (ev === "B") return ring();
  if (ev === "CS") return zone();
  if (ev === "SW") return R() < .55 ? ring() : zone();
  if (ev === "F") return R() < .85 ? zone() : ring();
  return R() < .9 ? zone() : ring();
}
function typeFor(mix, b, s){
  return wpick(mix.map(m => [m[0], m[1] * (s === 2 && m[0] !== "FB" ? 1.6 : 1) * (b > s && m[0] === "FB" ? 1.5 : 1)]));
}
function near(rc){            /* the catcher's call, graded spot / close / miss */
  const k = R(); if (k < .42) return rc;
  const d = k < .76 ? 1 : 2;
  for (;;){ const r = rc[0] + Math.round((R()*2-1)*d), c = rc[1] + Math.round((R()*2-1)*d);
    if (r>=0&&r<5&&c>=0&&c<5 && Math.max(Math.abs(r-rc[0]),Math.abs(c-rc[1])) === d) return [r,c]; }
}

/* Where the ball went. Angle 0 is straight away center, negative is the
   third-base side. A righty pulls to the left side. */
function spray(res, traj, hand){
  const pull = hand === "L" ? 1 : -1;
  const ang = (lo, hi) => (lo + R()*(hi-lo)) * (R() < .6 ? pull : -pull);
  let d, a;
  switch (res){
    case "GO": d = 45+R()*18; a = ang(5, 38); break;
    case "DP": d = 52+R()*8;  a = ang(2, 14); break;
    case "FC": case "E": d = 46+R()*14; a = ang(6, 36); break;
    case "SAC": d = 18+R()*8; a = ang(5, 25); break;
    case "PO": d = 30+R()*28; a = ang(8, 46); break;
    case "LO": d = traj === "LD" && R() < .5 ? 58+R()*12 : 100+R()*18; a = ang(0, 35); break;
    case "FO": d = 105+R()*28; a = ang(0, 38); break;
    case "SF": d = 118+R()*16; a = ang(0, 30); break;
    case "1B": d = traj === "GB" ? 82+R()*12 : 96+R()*20; a = traj === "GB" ? ang(16, 30) : ang(0, 34); break;
    case "2B": d = 128+R()*20; a = R() < .7 ? ang(18, 32) : ang(38, 43); break;
    default: d = 100; a = 0;
  }
  const t = a * Math.PI / 180;
  return { x: Math.round((100 + d*Math.sin(t))*10)/10, y: Math.round((162 - d*Math.cos(t))*10)/10 };
}
const TRAJ_FROM = {GO:"GB",FC:"GB",DP:"GB",SAC:"GB",LO:"LD",FO:"FB",SF:"FB",HR:"FB",PO:"PU"};
function trajFor(res){ if (TRAJ_FROM[res]) return null;
  if (res === "1B") return R() < .5 ? "GB" : "LD";
  if (res === "2B") return R() < .6 ? "LD" : "FB";
  if (res === "E") return "GB";
  return null; }
const OUTS = {K:1,Kc:1,GO:1,FO:1,LO:1,PO:1,FC:1,DP:2,SAC:1,SF:1};

/* ================================================================ the games
   Titans are the visitors and win 5-3, so both charts get a full 7 innings. */
const OPP = "Ridgeview";
const THEM = [   /* their order: name, jersey, position, bats */
  ["Mason Reyes","2","8","R"], ["Tyler Okafor","7","6","R"], ["Jake Brennan","24","3","L"],
  ["Caleb Ortiz","33","5","R"], ["Noah Whitfield","18","7","L"], ["Ethan Kowalski","11","2","R"],
  ["Logan Pierce","5","4","R"], ["Gavin Hughes","21","9","L"], ["Owen Marsh","9","DH","R"]];
const NOTES = { 0: "Leadoff. Jumps on the first-pitch fastball. Start him soft.",
                2: "Best bat in their order. Pull hitter; he chased the curveball down twice.",
                3: "Big swing, long arms. Hard in, then soft away." };
/* Our staff. Pitch mix as [type, share]. */
const STAFF = [
  { rid:"ad6bxsq", mix:[["FB",.58],["CB",.24],["CH",.18]] },   // Smith
  { rid:"k4dswh3", mix:[["FB",.60],["SL",.26],["CH",.14]] },   // Hall
  { rid:"1ry7wkr", mix:[["FB",.66],["CB",.34]] } ];            // Borcherding
/* Inning by inning: who pitched, how each PA ended, and the runs (R, ER). Hard
   contact on the hits that were stung. */
const DEF = [
  { p:0, pas:["GO","K","1B","FO"], r:[0,0] },
  { p:0, pas:["BB","K","DP"], r:[0,0] },
  { p:0, pas:["1B","Kc","2B*","GO","K"], r:[1,1] },
  { p:0, pas:["GO","HBP","FO","LO*"], r:[0,0] },
  { p:1, pas:["K","1B","E","SF","GO"], r:[1,0] },
  { p:1, pas:["BB","K","FC","PO"], r:[0,0] },
  { p:2, pas:["2B*","GO","1B","K","Kc"], r:[1,1] } ];

/* Our order (roster ids) and their two pitchers. */
const US = ["zvn2wpb","nlc1j7w","v78p4nb","fro8j13","ynl4e0v","ks6emdm","ak4pv9w","d9tqdlj","0vxudny"];
const THEIR_P = [ { name:"Cole Barrett", jersey:"14", hand:"R", mix:[["FB",.60],["CB",.22],["CH",.18]] },
                  { name:"Drew Lindqvist", jersey:"27", hand:"L", mix:[["FB",.62],["SL",.28],["CH",.10]] } ];
/* "+run" = a run scored on his ball in play, "+adv" = moved a runner into scoring position. */
const OFF = [
  { p:0, pas:["BB","1B+adv","K","2B*+run","GO","FO"] },
  { p:0, pas:["K","GO","PO"] },
  { p:0, pas:["1B","FO","DP"] },
  { p:0, pas:["2B*","K","1B+run","GO+adv","K"] },
  { p:0, pas:["GO","Kc","LO*"] },
  { p:1, pas:["BB","HBP","1B*+run","SF+run","K","GO"] },
  { p:1, pas:["1B","K","GO+adv","FO"] } ];

function parse(code){ const m = code.match(/^([A-Za-z0-9]+)(\*?)((?:\+\w+)*)$/);
  return { res:m[1], hard:!!m[2], flags:(m[3]||"").split("+").filter(Boolean) }; }

/* Build every pitch of a game up front, then tap it in. */
function planGame(innings, staffMix, hands, extra){
  const out = []; let spot = 0;
  innings.forEach((inn, ii) => {
    let outs = 0;
    inn.pas.forEach((code) => {
      const pa = parse(code), hand = hands[spot];
      const ev = simPA(pa.res === "HBP" ? "HBP" : pa.res);
      let b = 0, s = 0;
      const pitches = ev.map((e, k) => {
        const last = k === ev.length - 1;
        const t = typeFor(staffMix(inn.p), b, s);
        const rc = loc(e, t, hand, last && pa.res === "HBP" ? "HBP" : null);
        if (e === "B") b++; else if (e === "CS" || e === "SW") s++; else if (e === "F" && s < 2) s++;
        const q = { e, t, r:rc[0], c:rc[1] };
        if (extra) extra(q);
        return q;
      });
      const traj = trajFor(pa.res);
      const sp = (OUTS[pa.res] || /^(1B|2B|3B|E)$/.test(pa.res)) && !/^K/.test(pa.res) ? spray(pa.res, traj || TRAJ_FROM[pa.res], hand) : null;
      outs += OUTS[pa.res] || 0;
      out.push({ inn: ii + 1, p: inn.p, spot, res: pa.res, hard: pa.hard, flags: pa.flags, traj, spray: sp, pitches });
      spot = (spot + 1) % 9;
    });
    if (outs !== 3) throw new Error("inning " + (ii+1) + " has " + outs + " outs");
  });
  return out;
}
function strikePct(pas, filt){
  let n = 0, k = 0, fp = 0, fps = 0;
  pas.forEach(a => { if (filt && !filt(a)) return;
    a.pitches.forEach((q, i) => { n++; const st = q.e !== "B" && !(a.res === "HBP" && i === a.pitches.length-1);
      if (st) k++; if (i === 0){ fp++; if (st) fps++; } }); });
  return { n, pct: Math.round(k/n*100), fps: Math.round(fps/fp*100) };
}

/* Redraw until each arm lands in a believable high-school band. */
function goodGame(innings, mixFn, hands, nArms, extra){
  for (let s = SEED; s < SEED + 4000; s++){
    R = rng(s);
    let g; try { g = planGame(innings, mixFn, hands, extra); } catch(e){ continue; }
    let ok = true;
    for (let p = 0; p < nArms; p++){
      const st = strikePct(g, a => a.p === p);
      if (st.pct < 58 || st.pct > 64 || st.fps < 52 || st.fps > 66) ok = false;
    }
    const all = strikePct(g);
    if (ok && all.pct >= 59 && all.pct <= 63) return { g, seed: s };
  }
  throw new Error("no seed");
}

const GAME_PLAN = goodGame(DEF, p => STAFF[p].mix, THEM.map(h => h[3]), 3, q => {
  q.call = near([q.r, q.c]);
});
/* Our hitters' hands come off the roster. */
const ROSTER_SRC = fs.readFileSync(__dirname + "/../offense/roster.js", "utf8");
const HAND = {}; US.forEach(id => { const m = ROSTER_SRC.match(new RegExp('id:"' + id + '"[^}]*bats:"(\\w)"')); HAND[id] = m ? m[1] : "R"; });
const OFF_PLAN = goodGame(OFF, p => THEIR_P[p].mix, US.map(id => HAND[id]), 2, q => {
  /* The umpire. A few takes go against the location, both ways. */
  if (q.e === "CS" && R() < .08){ const cell = pick([[0,2],[2,0],[2,4],[4,2],[4,3]]); q.r = cell[0]; q.c = cell[1]; q.flip = true; }
  else if (q.e === "B" && R() < .05){ const cell = pick([[1,1],[1,3],[3,1],[3,3],[3,2]]); q.r = cell[0]; q.c = cell[1]; q.flip = true; }
});

/* ================================================================ bullpen */
const SPOTS = {0:[2,2],1:[0,2],2:[1,1],3:[3,1],4:[3,3],5:[4,4]};
const PEN = [ { rid:"ad6bxsq", fb:[90,93], sharp:.40 },     // Smith, low 90s
              { rid:"k4dswh3", fb:[86,89], sharp:.36 },     // Hall, upper 80s
              { rid:"1ry7wkr", fb:[87,89], sharp:.34 } ];   // Borcherding, upper 80s
function penPitch(call, arm){
  const t = SPOTS[call.spot];
  const k = R(), d = k < arm.sharp ? 0 : k < arm.sharp + .36 ? 1 : 2;
  let r, c;
  for (;;){ r = t[0] + Math.round((R()*2-1)*d); c = t[1] + Math.round((R()*2-1)*d);
    if (r>=0&&r<5&&c>=0&&c<5 && Math.max(Math.abs(r-t[0]),Math.abs(c-t[1])) === d) break; }
  const fb = arm.fb[0] + Math.floor(R()*(arm.fb[1]-arm.fb[0]+1));
  const ss = call.ws === "SS" ? 1 : 0;
  const velo = call.type === "FB" ? fb - ss : call.type === "CH" ? fb - 8 - Math.floor(R()*3) - ss : fb - 14 - Math.floor(R()*4);
  return { r, c, velo };
}
function planPen(script){
  for (let s = SEED; s < SEED + 4000; s++){
    R = rng(s * 31 + 5);
    const out = PEN.map(arm => script.map(call => penPitch(call, arm)));
    const ok = out.every(list => { const st = list.filter(q => inZone(q.r,q.c)).length / list.length * 100;
      return st >= 58 && st <= 66; });
    if (ok) return out;
  }
  throw new Error("no pen seed");
}

/* ================================================================ tapping */
const HELP = `window.__t = {
  clk: function(sel){ var e = document.querySelector(sel); if(!e) throw new Error("missing " + sel); e.click(); },
  set: function(sel, v, evs){ var e = document.querySelector(sel); if(!e) throw new Error("missing " + sel);
    e.value = v; (evs || ["input","change"]).forEach(function(n){ e.dispatchEvent(new Event(n, {bubbles:true})); }); },
  spray: function(x, y){ var s = document.getElementById("diamond"), r = s.getBoundingClientRect();
    s.dispatchEvent(new MouseEvent("click", {bubbles:true, clientX: r.left + (x + 10) / 220 * r.width,
                                             clientY: r.top + (y + 20) / 196 * r.height})); }
};`;

async function fresh(b, path){
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, serviceWorkers: "block" });
  const pg = await ctx.newPage();
  pg.on("pageerror", e => { throw e; });
  await pg.goto(BASE + path, { waitUntil: "load" }); await pg.waitForTimeout(600);
  await pg.evaluate(HELP);
  return { ctx, pg };
}

async function buildGame(b){
  const { ctx, pg } = await fresh(b, "/game/index.html");
  const g = GAME_PLAN.g;
  await pg.evaluate(({ THEM, OPP, rid }) => {
    __t.clk('[data-lvl="Varsity"]');
    __t.set("#fOpp", OPP);
    __t.set("#fHome", "A");
    var pr = document.getElementById("fPractice"); if(!pr.checked) pr.click();
    __t.set("#suPitcher", rid);
    THEM.forEach(function(h, i){
      var tr = function(){ return document.querySelectorAll("#suRows tr")[i]; };
      ["name","jersey","pos"].forEach(function(f, k){
        var x = tr().querySelector('[data-su="' + f + '"]');
        x.dispatchEvent(new Event("focus")); x.value = h[k];
        x.dispatchEvent(new Event("input", {bubbles:true})); x.dispatchEvent(new Event("change", {bubbles:true}));
      });
      if(h[3] === "L") tr().querySelector('[data-h="L"]').click();
    });
    __t.clk("#suDone");
  }, { THEM, OPP, rid: STAFF[0].rid });
  let curP = 0, noted = {}, idx = -1;
  for (const a of g){
    idx++;
    if (SHOTS && idx === GAME_STOP){
      await pg.evaluate(({ a }) => {
        a.pitches.slice(0, 2).forEach(function(q){
          __t.clk('#types button[data-type="' + q.t + '"]');
          __t.clk("#callPad button:nth-child(" + (q.call[0]*5 + q.call[1] + 1) + ")");
          __t.clk("#zone .cell:nth-child(" + (q.r*5 + q.c + 1) + ")");
          __t.clk('.mods button[data-mod="' + (q.e === "SW" ? "W" : q.e === "F" ? "F" : "T") + '"]');
        });
        __t.clk('#types button[data-type="' + a.pitches[2].t + '"]');
      }, { a });
      await shot(pg, "deck-pitch-chart");
      await ctx.close(); return null;
    }
    if (a.p !== curP){
      await pg.evaluate(({ i, rid }) => { __t.clk("#pitchers .addp"); __t.set('select[data-pick="' + i + '"]', rid, ["change"]); },
                        { i: a.p, rid: STAFF[a.p].rid });
      curP = a.p;
    }
    await pg.evaluate(({ a, note, last }) => {
      if(note){ __t.set("#fNotes", note, ["input"]); }
      a.pitches.forEach(function(q, k){
        var end = (k === a.pitches.length - 1);
        __t.clk('#types button[data-type="' + q.t + '"]');
        __t.clk("#callPad button:nth-child(" + (q.call[0]*5 + q.call[1] + 1) + ")");
        __t.clk("#zone .cell:nth-child(" + (q.r*5 + q.c + 1) + ")");
        if(end && (q.e === "X" || a.res === "HBP")) return;
        __t.clk('.mods button[data-mod="' + (q.e === "SW" ? "W" : q.e === "F" ? "F" : "T") + '"]');
      });
      if(!/^(K|Kc|BB)$/.test(a.res)) __t.clk('#results button[data-res="' + a.res + '"]');
      if(a.traj) __t.clk('#trajRow button[data-traj="' + a.traj + '"]');
      if(a.spray) __t.spray(a.spray.x, a.spray.y);
      if(a.hard) __t.clk("#hardBtn");
      __t.clk("#nextBtn");
    }, { a, note: (!noted[a.spot] && NOTES[a.spot]) || "" });
    noted[a.spot] = 1;
    /* End of the inning: the prompt is up. */
    const inn = DEF[a.inn - 1];
    const lastOfInn = g.filter(x => x.inn === a.inn).slice(-1)[0] === a;
    if (lastOfInn){
      await pg.evaluate(({ r }) => {
        if(!document.getElementById("innOk")) throw new Error("no inning prompt");
        if(!r[0]) __t.clk("#innNoRuns");
        else {
          document.querySelectorAll(".askwrap .inpad")[0].querySelector('[data-v="' + r[0] + '"]').click();
          document.querySelectorAll(".askwrap .inpad")[1].querySelector('[data-v="' + r[1] + '"]').click();
          __t.clk("#innOk");
        }
      }, { r: inn.r });
    }
  }
  const out = await pg.evaluate(() => ({ main: localStorage.getItem("dugout-pitch-chart-v2") }));
  await ctx.close();
  return out;
}

async function buildOffense(b){
  const { ctx, pg } = await fresh(b, "/offense/index.html");
  const g = OFF_PLAN.g;
  await pg.evaluate(({ OPP, US, P0 }) => {
    __t.clk('#lvlRow [data-lvl="Varsity"]');
    __t.set("#fOpp", OPP);
    __t.set("#fHome", "A");
    var pr = document.getElementById("fPractice"); if(!pr.checked) pr.click();
    __t.set('[data-pi="0"] input[data-pf="name"]', P0.name, ["input"]);
    __t.set('[data-pi="0"] input[data-pf="jersey"]', P0.jersey, ["input"]);
    __t.set('[data-pi="0"] select[data-pf="hand"]', P0.hand, ["input","change"]);
    while(document.querySelectorAll('select[data-lf="rid"]').length < US.length) __t.clk("#luPlus");
    US.forEach(function(id, i){ __t.set('[data-li="' + i + '"] select[data-lf="rid"]', id); });
    __t.clk("#btnStart");
  }, { OPP, US, P0: THEIR_P[0] });
  let curP = 0;
  for (const a of g){
    if (a.p !== curP){
      await pg.evaluate(({ P }) => {
        __t.clk("#mChips [data-newp]");
        drawPitchersSetup();                 /* the Setup rows redraw when that tab opens */
        __t.set('[data-pi="1"] input[data-pf="name"]', P.name, ["input"]);
        __t.set('[data-pi="1"] input[data-pf="jersey"]', P.jersey, ["input"]);
        __t.set('[data-pi="1"] select[data-pf="hand"]', P.hand, ["input","change"]);
      }, { P: THEIR_P[a.p] });
      curP = a.p;
    }
    await pg.evaluate(({ a }) => {
      var TY = ["FB","CT","SL","CB","CH","SP"];
      a.pitches.forEach(function(q, k){
        var end = (k === a.pitches.length - 1);
        __t.clk('#types [data-ty="' + TY.indexOf(q.t) + '"]');
        __t.clk('#zone [data-r="' + q.r + '"][data-c="' + q.c + '"]');
        if(q.flip) __t.clk("#umpFlip");
        if(end && (q.e === "X" || a.res === "HBP")) return;
        if(q.e === "SW") __t.clk('#mods [data-mod="W"]');
        else if(q.e === "F") __t.clk('#mods [data-mod="F"]');
      });
      if(!/^(K|Kc|BB)$/.test(a.res)) __t.clk('#results [data-res="' + a.res + '"]');
      if(a.traj) __t.clk('#trajRow [data-tr="' + a.traj + '"]');
      if(a.spray) __t.spray(a.spray.x, a.spray.y);
      if(a.hard) __t.clk("#hardBtn");
      a.flags.forEach(function(f){ __t.clk('[data-qf="' + f + '"]'); });
      var shown = JSON.parse(localStorage.getItem("titans-offense-v1")).pas.slice(-1)[0];
      if(shown.result !== a.res) throw new Error("PA ended " + shown.result + ", wanted " + a.res);
      __t.clk("#btnNextPA");
    }, { a });
  }
  if (SHOTS){
    await pg.click("#tab-report"); await pg.click('[data-rp="0"]');
    await shot(pg, "deck-offense-report");
  }
  const out = await pg.evaluate(() => ({ main: localStorage.getItem("titans-offense-v1"),
                                         lineup: localStorage.getItem("titans-offense-lineup-v1") }));
  await ctx.close();
  return out;
}

async function buildPen(b){
  const { ctx, pg } = await fresh(b, "/bullpen/index.html");
  await pg.evaluate(({ rids }) => {
    var pr = document.getElementById("s-practice"); if(!pr.checked) pr.click();
    rids.forEach(function(id, i){ __t.set('#rosterTbl tr[data-i="' + i + '"] select[data-f="rid"]', id); });
    var t = document.getElementById("tplPick");
    var o = [].slice.call(t.options).filter(function(x){ return /Hitter/.test(x.text); })[0];
    t.value = o.value; t.dispatchEvent(new Event("change", {bubbles:true}));
    __t.clk("#tplLoad");
    var y = document.querySelector(".askwrap [data-yes]"); if(y) y.click();
    __t.clk("#btnStart");
  }, { rids: PEN.map(p => p.rid) });
  const script = await pg.evaluate(() => JSON.parse(localStorage.getItem("titans-bullpen-v1")).script);
  const plan = planPen(script);
  const ids = await pg.evaluate(() => JSON.parse(localStorage.getItem("titans-bullpen-v1")).pitchers.map(p => p.id));
  for (let i = 0; i < PEN.length; i++){
    await pg.evaluate(({ id, list }) => {
      __t.clk('#mChips [data-id="' + id + '"]');
      list.forEach(function(q){
        __t.clk('#zone button[data-r="' + q.r + '"][data-c="' + q.c + '"]');
        __t.clk('#velo button[data-v="' + q.velo + '"]');
      });
    }, { id: ids[i], list: SHOTS && i === 1 ? plan[i].slice(0, PEN_STOP) : plan[i] });
    if (SHOTS && i === 1){ await shot(pg, "deck-bullpen"); await ctx.close(); return null; }
  }
  const out = await pg.evaluate(() => ({ main: localStorage.getItem("titans-bullpen-v1") }));
  await ctx.close();
  return { out, script: script.length };
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    args: ["--host-resolver-rules=MAP script.google.com ~NOTFOUND, MAP *.googleusercontent.com ~NOTFOUND", "--no-proxy-server"] });
  if (SHOTS){ await buildGame(b); await buildOffense(b); await buildPen(b); await b.close(); console.log("shots in " + SHOTS); return; }
  const game = await buildGame(b);
  const off = await buildOffense(b);
  const pen = await buildPen(b);
  await b.close();
  const data = {
    built: new Date().toISOString(),
    keys: {
      "dugout-pitch-chart-v2": game.main, "dugout-pitch-chart-archive-v1": "[]",
      "titans-offense-v1": off.main, "titans-offense-lineup-v1": off.lineup, "titans-offense-archive-v1": "[]",
      "titans-bullpen-v1": pen.out.main, "titans-bullpen-archive-v1": "[]"
    }
  };
  fs.writeFileSync(__dirname + "/demo-data.json", JSON.stringify(data));
  const G = JSON.parse(game.main), O = JSON.parse(off.main), S = JSON.parse(pen.out.main);
  console.log("pitch chart seed " + GAME_PLAN.seed + ", offense seed " + OFF_PLAN.seed + ", pen script " + pen.script + " pitches");
  [0,1,2].forEach(p => { const st = strikePct(GAME_PLAN.g, a => a.p === p); console.log("  ours  p" + p + ": " + st.n + " pitches, " + st.pct + "% strikes, " + st.fps + "% first-pitch strikes"); });
  [0,1].forEach(p => { const st = strikePct(OFF_PLAN.g, a => a.p === p); console.log("  their p" + p + ": " + st.n + " pitches, " + st.pct + "% strikes, " + st.fps + "% first-pitch strikes"); });
  console.log("  game inning " + G.inning + ", innings filed " + G.innings.length + ", outs " + G.outs + ", PAs " + O.pas.length);
  S.pitchers.filter(p => p.pitches.length).forEach(p => {
    const st = p.pitches.filter(q => inZone(q.r,q.c)).length, fb = p.pitches.filter(q => q.type === "FB");
    console.log("  pen " + p.name + ": " + p.pitches.length + " pitches, " + Math.round(st/p.pitches.length*100) + "% strikes, FB avg " +
      (fb.reduce((s,q) => s + q.velo, 0) / fb.length).toFixed(1) + ", top " + Math.max(...fb.map(q => q.velo)));
  });
})().catch(e => { console.error(e); process.exit(1); });
