/* A whole made-up 2027 season in the season Sheet's exact columns (Nov 16, 2026).

     const { season } = require("./season-gen");  season()  ->  {Records: [head, ...rows], ...}
     node tools/dashboard/season-gen.js [out.json]              (writes it, for a look)

   The dashboard 2.0 tests run on this. Every tab's header is copied from the fixture Sheet
   the REAL apps filed through the REAL receiver (tools/cards/fixture-sheet.json), so a column
   the apps rename breaks this file, not the dashboard. The players and schedules are the
   sandbox's (v36): made-up names, the real 2027 schedules through Apr 17.

   What it makes:
     Players, Coaches, Config
     winter: 10 scripted pens per pitcher on the 4 cumulative routines (the real calls, by
             delivery and situation), 4 live AB sessions, pen reflections
     spring: every game on the 4 schedules through Apr 17 - Game_Pitches with Game_Innings
             summed from them, Offense_Pitches for our hitters, notes, game reflections
     GameChanger: 2026 and 2027 rows for every player plus team totals, as the import stores them
     Comments: the comments spreadsheet's 4 level tabs
   Deterministic: the same seed gives the same Sheet. */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const FIX = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "cards", "fixture-sheet.json"), "utf8"));

const LEVELS = ["Varsity", "JV", "Sophomore", "Freshman"];
const STAFF = {
  Varsity: [["Cole Avery","Jr","R"],["Nate Brennan","Sr","R"],["Evan Hartley","Sr","L"],["Owen Kessler","Jr","R"],["Ryan Delgado","Jr","R"],["Luke Castellano","So","L"],["Jake Whitfield","Sr","R"],["Tyler Moss","So","R","idle"]],
  JV: [["Mason Pryor","So","R"],["Caleb Ruiz","Jr","R"],["Dylan Marsh","So","L"],["Ty Benson","So","R"],["Gavin Cho","Jr","R"],["Wes Harlan","So","R"],["Brody Kane","So","L","swing"]],
  Sophomore: [["Carter Lowe","So","R"],["Eli Navarro","So","R"],["Brody Kane","So","L"],["Sam Ortega","So","R"],["Jace Whitmore","So","R"],["Reid Donovan","So","L"]],
  Freshman: [["Luke Fenton","Fr","R"],["Aiden Brooks","Fr","R"],["Micah Stroud","Fr","L"],["Logan Pierce","Fr","R"],["Henry Vance","Fr","R"],["Cody Walsh","Fr","L"],["Nolan Reyes","Fr","R","idle"]]
};
/* [name, position, class, bats, flag]; a pitcher's name here makes him two-way */
const HITTERS = {
  Varsity: [["Jaxon Reid","C","Sr","R"],["Mateo Silva","SS","Jr","R"],["Ben Holloway","2B","Sr","L"],["Cameron Pike","CF","Jr","L"],["Drew Navarro","3B","Sr","R"],["Isaac Ford","1B","Jr","R"],["Luke Castellano","LF","So","L"],["Evan Hartley","RF","Sr","L"],["Zach Moreno","DH","Jr","R"],["Eli Garner","C","So","R","bench"],["Jake Whitfield","PH","Sr","R","pinch"]],
  JV: [["Parker Lane","SS","So","R"],["Owen Tate","C","Jr","R"],["Liam Ochoa","CF","So","L"],["Grant Hale","3B","So","R"],["Jonah Pratt","1B","Jr","L"],["Reese Kim","2B","So","R"],["Ty Benson","LF","So","R"],["Tanner Cole","RF","Jr","R"],["Miles Dorsey","DH","So","L","bench"]],
  Sophomore: [["Henry Lowell","SS","So","R"],["Caden Briggs","C","So","R"],["Dominic Ray","CF","So","L"],["Asher Webb","2B","So","R"],["Bryce Keller","3B","So","R"],["Colin Shaw","1B","So","L"],["Jace Whitmore","LF","So","R"],["Ian Pruitt","RF","So","R"],["Seth Arden","DH","So","R","bench"]],
  Freshman: [["Jude Carver","SS","Fr","R"],["Wyatt Lin","C","Fr","R"],["Rowan Hayes","CF","Fr","L"],["Theo Banks","2B","Fr","R"],["Felix Grant","3B","Fr","R"],["Hugo Marsh","1B","Fr","L"],["Henry Vance","LF","Fr","R"],["Leo Price","RF","Fr","R"],["Max Ortiz","DH","Fr","R","bench"]]
};
const GAMES = {
  Varsity: [["03-18","Coach Bob Classic"],["03-19","Coach Bob Classic"],["03-19","Coach Bob Classic"],["03-20","Coach Bob Classic"],["03-25","Valor Christian"],["03-27","Cherokee Trail"],["04-03","Cherry Creek"],["04-09","Heritage"],["04-10","Douglas County"],["04-12","Heritage"],["04-14","Mountain Vista"],["04-16","Mountain Vista"]],
  JV: [["03-25","Valor Christian"],["03-27","Cherokee Trail"],["04-03","Cherry Creek"],["04-06","Ponderosa"],["04-10","Heritage"],["04-13","Heritage"],["04-15","Mountain Vista"],["04-17","Mountain Vista"]],
  Sophomore: [["03-11","Ponderosa"],["03-27","Valor Christian"],["03-27","Cherokee Trail"],["04-03","Cherry Creek"],["04-05","Ponderosa"],["04-09","Heritage"],["04-12","Heritage"],["04-14","Mountain Vista"],["04-16","Mountain Vista"]],
  Freshman: [["03-10","Ponderosa"],["03-26","Valor Christian"],["03-27","Cherokee Trail"],["04-03","Cherry Creek"],["04-10","Heritage"],["04-13","Heritage"],["04-15","Mountain Vista"],["04-17","Mountain Vista"]]
};
const OPP_ID = {"Valor Christian": "valor", "Cherokee Trail": "cherokee-trail", "Cherry Creek": "cherry-creek", "Heritage": "heritage",
  "Douglas County": "douglas-county", "Mountain Vista": "mountain-vista", "Ponderosa": "ponderosa"};
const FIRSTS = ["Mason","Tyler","Jake","Caleb","Noah","Ethan","Logan","Gavin","Owen","Cole","Drew","Ryan","Luke","Evan","Chase","Blake","Trey","Hunter","Austin","Cody","Brady","Nolan","Kyle","Zach"];
const LASTS = ["Reyes","Okafor","Brennan","Ortiz","Whitfield","Kowalski","Hughes","Marsh","Barrett","Lindqvist","Sorensen","Delacroix","Pruitt","Vasquez","Holloway","Kimura","Abernathy","Castillo","Fenwick","Mercer","Dawson","Ellison","Tran","Novak"];

/* the bullpen's location numbers (v45) and the 4 cumulative routines (claude/bullpen-winter-scripts.md) */
const SPOTS = {0: [2, 2, "Middle"], 1: [1, 2, "Middle-up"], 2: [1, 1, "Up & in"], 3: [3, 1, "Down & in"], 4: [3, 2, "Middle-down"],
               5: [3, 3, "Down & away"], 6: [4, 2, "Below the zone"], 7: [0, 2, "Above the zone"]};
const SIT = {R1: "Runner on 1B", R2: "Runner on 2B", "2K": "2 strikes, chase", "20": "2-0 O/S strike"};
/* [type, spot, delivery, situation, reps, first routine (1-4)] */
const CALLS = [["FB",5,"W","",4,1],["FB",3,"W","",4,1],["FB",2,"W","",4,1],["CH",5,"W","",2,1],["CH",3,"W","",2,1],["CB",5,"S","",3,2],["CH",5,"SS","",3,4],
  ["CH",0,"W","20",3,1],["CB",0,"S","20",2,4],["FB",5,"S","R1",2,2],["FB",5,"SS","R2",3,3],["CH",6,"W","2K",3,1],["CB",6,"S","2K",2,3],["FB",7,"W","2K",3,1]];
const ROUTINES = [["Fastball Command", "3G1CMX"], ["Breaking Ball & Stretch", "7B354P"], ["Holding Runners", "J68J7Z"], ["Hitter's Counts", "8P0C46"]];
const PEN_DATES = ["2027-01-08","2027-01-13","2027-01-20","2027-01-27","2027-02-03","2027-02-10","2027-02-17","2027-02-24","2027-02-27","2027-03-03"];
const ROUTINE_OF = [0, 0, 1, 1, 2, 2, 3, 3, 3, 3];
const LIVE_DATES = ["2027-02-10", "2027-02-17", "2027-02-24", "2027-03-03"];
const LOOK = {
  Varsity:   {free: 0.124, k: 0.215, hit: 0.190, err: 0.030, fps: 0.595, str: 0.605, hard: 0.21},
  JV:        {free: 0.182, k: 0.285, hit: 0.185, err: 0.040, fps: 0.560, str: 0.585, hard: 0.24},
  Sophomore: {free: 0.142, k: 0.210, hit: 0.200, err: 0.045, fps: 0.575, str: 0.595, hard: 0.19},
  Freshman:  {free: 0.108, k: 0.255, hit: 0.185, err: 0.035, fps: 0.615, str: 0.612, hard: 0.17}
};
const POSNUM = {P: 1, C: 2, "1B": 3, "2B": 4, "3B": 5, SS: 6, LF: 7, CF: 8, RF: 9, DH: 10};
const OUTS1 = {K: 1, Kc: 1, GO: 1, FO: 1, LO: 1, PO: 1, FC: 1, SAC: 1, SF: 1}, HITS = {"1B": 1, "2B": 1, "3B": 1, HR: 1};

function head(tab) { return FIX[tab][0].slice(); }
function rng(seed) {
  let st = seed | 0;
  return function () { st = (st + 0x6D2B79F5) | 0; let x = Math.imul(st ^ (st >>> 15), 1 | st); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

function season(opt) {
  opt = opt || {};
  const r = rng(opt.seed || 20270417);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const T = {};
  ["Records", "Bullpen_Pitches", "Bullpen_Notes", "Game_Pitches", "Game_Innings", "Game_Notes", "Offense_Pitches", "Offense_Notes", "Log", "Coaches", "Config"]
    .forEach((t) => { T[t] = [head(t)]; });
  T.Players = [["PlayerID", "Last", "First", "Class", "Level", "Player email", "Parent email", "Send"]];
  T.Reflections = [["When", "PlayerID", "Player", "Level", "Kind", "RecordID", "Date", "Event", "Arm/Body", "Feel", "PrePitch", "Reset",
                    "DidLastStart", "LastStart", "Start", "Stop", "Continue", "Bothering", "Flag", "FlaggedTo"]];
  const add = (tab, o) => { T[tab].push(T[tab][0].map((c) => (o[c] === undefined ? "" : o[c]))); };

  /* ---------------------------------------------------------- people */
  const P = {}, byName = {}; let n = 0;
  function person(name, cl, lv) {
    if (byName[name]) return byName[name];
    const id = "t" + String(++n).padStart(3, "0"), sp = name.split(" ");
    const o = byName[name] = P[id] = {id, name, first: sp[0], last: sp.slice(1).join(" "), cl, lv, skill: (r() - 0.5) * 2};
    add("Players", {PlayerID: id, Last: o.last, First: o.first, Class: cl, Level: lv});
    return o;
  }
  const staff = {}, lineup = {};
  LEVELS.forEach((lv) => {
    staff[lv] = STAFF[lv].map((s, i) => {
      const o = person(s[0], s[1], s[3] === "swing" ? "Sophomore" : lv);
      o.t = s[2]; o.pitcher = true;
      return {o, idle: s[3] === "idle", swing: s[3] === "swing", tilt: (i < 2 ? -0.03 : i > 4 ? 0.035 : 0) + (r() - 0.5) * 0.04};
    });
  });
  LEVELS.forEach((lv) => {
    lineup[lv] = HITTERS[lv].map((h) => { const o = person(h[0], h[2], lv); o.b = h[3]; o.pos = h[1]; return {o, pos: h[1], bench: h[4] === "bench", pinch: h[4] === "pinch"}; });
  });
  if (!opt.noTwoWayIdle) add("Players", {PlayerID: "t999", Last: "Quinn", First: "Abel", Class: "Fr", Level: "Freshman"});   /* on the roster, never played */

  T.Coaches.push(["Jim Vaughn", "jim@example.com", "All"], ["Coach V", "coachv@example.com", "Varsity"], ["Coach J", "coachj@example.com", "JV"],
                 ["Coach S", "coachs@example.com", "Sophomore"], ["Coach F", "coachf@example.com", "Freshman, Sophomore"]);

  /* ---------------------------------------------------------- winter */
  const arms = {};
  LEVELS.forEach((lv) => staff[lv].forEach((s) => { if (!s.swing) arms[s.o.id] = s; }));
  const armList = Object.keys(arms).map((k) => arms[k]);
  armList.forEach((s) => { s.base = 0.55 + (s.tilt < 0 ? 0.04 : s.tilt > 0.03 ? -0.05 : 0) + (r() - 0.5) * 0.06; });
  function throwAt(spot, p) {   /* -> actual [row, col] 1-based and the grade */
    const t = SPOTS[spot], x = r();
    let dr = 0, dc = 0;
    if (x < p * 0.42) { /* on it */ }
    else if (x < p) { do { dr = pick([-1, 0, 1]); dc = pick([-1, 0, 1]); } while (!dr && !dc); }
    else { do { dr = pick([-2, -1, 0, 1, 2]); dc = pick([-2, -1, 0, 1, 2]); } while (Math.max(Math.abs(dr), Math.abs(dc)) < 2); }
    const row = Math.max(0, Math.min(4, t[0] + dr)), col = Math.max(0, Math.min(4, t[1] + dc));
    const d = Math.max(Math.abs(row - t[0]), Math.abs(col - t[1]));
    return {row: row + 1, col: col + 1, g: d === 0 ? "Spot" : d === 1 ? "Close" : "Miss",
            mv: row < t[0] ? "up" : row > t[0] ? "down" : "", mh: col < t[1] ? "in" : col > t[1] ? "out" : "",
            inz: row >= 1 && row <= 3 && col >= 1 && col <= 3};
  }
  let sid = 0;
  PEN_DATES.forEach((date, s) => {
    const R = ROUTINE_OF[s], calls = CALLS.filter((c) => c[5] <= R + 1), going = armList.filter(() => s === 0 || r() > 0.07);
    for (let m = 0; m < going.length; m += 3) {
      const id = "pen" + String(++sid).padStart(3, "0"), group = going.slice(m, m + 3), mound = "Mound " + (1 + (m / 3) % 4);
      let rows = 0;
      group.forEach((s2) => {
        const o = s2.o, p = s2.base - 0.08 + s * 0.011 + (r() - 0.5) * 0.06;
        let no = 0;
        calls.forEach((c) => {
          for (let k = 0; k < c[4]; k++) {
            const adj = {FB: 0.04, CH: -0.03, CB: -0.06}[c[0]] + (c[2] === "SS" ? -0.06 : c[2] === "S" ? -0.02 : 0);
            const a = throwAt(c[1], p + adj);
            add("Bullpen_Pitches", {RecordID: id, SessionID: id, Mound: mound, Date: date, Coach: "Coach V", Build: "v48", Template: ROUTINES[R][0], ScriptID: ROUTINES[R][1],
              ScriptModified: "N", PitcherID: o.id, Pitcher: o.last, PitcherLast: o.last, PitcherFirst: o.first, Class: o.cl, ClassName: "", Throws: o.t, PitchSafe: 60,
              StretchOnly: "N", Mode: "Script", PitchNo: ++no, CalledType: c[0], CalledWS: c[2], CalledSpot: c[1], SpotName: SPOTS[c[1]][2], Situation: c[3], SituationName: SIT[c[3]] || "",
              OffScript: "N", ActualRow: a.row, ActualCol: a.col, Strike: a.inz ? "Y" : "N", Result: a.g, MissVert: a.g === "Spot" ? "" : a.mv, MissHoriz: a.g === "Spot" ? "" : a.mh,
              Velo: c[0] === "FB" ? 70 + Math.round(r() * 12) : "", Practice: "N", CallSource: "Coach"});
            rows++;
          }
        });
        add("Bullpen_Notes", {RecordID: id, SessionID: id, PitcherID: o.id, Pitcher: o.last, PitcherLast: o.last, PitcherFirst: o.first, Pitches: no, Practice: "N",
                              ToPitcher: r() < 0.3 ? "Good tempo today." : ""});
        if (r() < 0.86) {
          const sore = r() < 0.03;
          add("Reflections", {When: date + "T22:00:00Z", PlayerID: o.id, Player: o.name, Level: o.lv, Kind: "pen", RecordID: id, Date: date, Event: ROUTINES[R][0],
            "Arm/Body": sore ? 2 : 4 + (r() < 0.5 ? 1 : 0), Feel: 3 + Math.floor(r() * 3), PrePitch: pick(["Every pitch", "Most", "Some"]), Reset: pick(["Every time", "Sometimes", "No yellow lights"]),
            Start: pick(["Finishing the change-up down", "Breathing before the stretch reps", "Trusting the glove side"]), Stop: pick(["Rushing out of the stretch", "Aiming the fastball", ""]),
            Continue: pick(["Tempo", "Attacking the call", "My routine between pitches"]), Bothering: sore ? "Elbow a little tight" : "", Flag: sore ? "Y" : ""});
        }
      });
      add("Records", {RecordID: id, App: "bullpen", Build: "v48", Schema: 1, Mound: mound, Team: "", Date: date, Coach: "Coach V", Template: ROUTINES[R][0], ScriptID: ROUTINES[R][1],
                      FiledAt: date + "T20:00:00Z", ReceivedAt: date + "T20:00:02Z", Rows: rows});
    }
  });
  /* live AB sessions: hitters from the lineups, every pitch called on the pad */
  const PAD = ["FB|5", "FB|5", "FB|3", "FB|2", "FB|7", "CH|5", "CH|6", "CB|5", "CB|6"];
  LIVE_DATES.forEach((date, s) => {
    const going = armList.filter((x) => !x.idle || s > 1).filter(() => r() > 0.06);
    for (let m = 0; m < going.length; m += 3) {
      const id = "live" + String(++sid).padStart(3, "0"), group = going.slice(m, m + 3);
      let rows = 0;
      group.forEach((s2) => {
        const o = s2.o, p = s2.base - 0.1 + s * 0.015 + (r() - 0.5) * 0.06;
        let no = 0;
        for (let ab = 1; ab <= 4; ab++) {
          const n2 = 2 + Math.floor(r() * 5), pitches = [];
          for (let k = 0; k < n2; k++) {
            const call = pick(PAD).split("|"), src = r() < 0.06 ? "Glove" : r() < 0.04 ? "Unknown" : "Coach";
            const a = throwAt(+call[1], p + (call[0] === "FB" ? 0.04 : -0.05));
            pitches.push({call, src, a});
          }
          const res = pick(["K", "Kc", "GO", "FO", "1B", "BB", "LO", "PO", "GO", "2B"]), out = OUTS1[res] ? "Y" : "N";
          const first3 = pitches.slice(0, 3), ao3 = pitches.length <= 3 || first3.filter((q) => q.a.inz).length > first3.filter((q) => !q.a.inz).length;
          pitches.forEach((q) => {
            const unk = q.src === "Unknown";
            add("Bullpen_Pitches", {RecordID: id, SessionID: id, Mound: "Mound 1", Date: date, Coach: "Coach V", Build: "v48", Template: "", ScriptID: "", ScriptModified: "N",
              PitcherID: o.id, Pitcher: o.last, PitcherLast: o.last, PitcherFirst: o.first, Class: o.cl, Throws: o.t, StretchOnly: "N", Mode: "Live", PitchNo: ++no,
              CalledType: q.call[0], CalledWS: "W", CalledSpot: unk ? "" : +q.call[1], SpotName: unk ? "" : SPOTS[q.call[1]][2], OffScript: "N",
              ActualRow: q.a.row, ActualCol: q.a.col, Strike: q.a.inz ? "Y" : "N", Result: unk ? "" : q.a.g, MissVert: unk || q.a.g === "Spot" ? "" : q.a.mv,
              MissHoriz: unk || q.a.g === "Spot" ? "" : q.a.mh, AB: ab, ABResult: res, ABOut: out, AO3plus: (ao3 ? "+" : "-") + (out === "Y" ? "+" : "-"), Practice: "N", CallSource: q.src});
            rows++;
          });
        }
      });
      add("Records", {RecordID: id, App: "bullpen", Build: "v48", Schema: 1, Mound: "Mound 1", Team: "", Date: date, Coach: "Coach V", FiledAt: date + "T21:00:00Z", ReceivedAt: date + "T21:00:02Z", Rows: rows});
    }
  });

  /* ---------------------------------------------------------- spring */
  const theirs = {};
  function oppTeam(opp) {
    if (theirs[opp]) return theirs[opp];
    const used = {}, nm = () => { let x; do { x = pick(FIRSTS) + " " + pick(LASTS); } while (used[x]); used[x] = 1; return x; };
    const POSN = ["CF", "SS", "1B", "3B", "LF", "C", "2B", "RF", "DH"];
    return (theirs[opp] = {
      hitters: POSN.map((pos) => ({name: nm(), pos, hand: r() < 0.7 ? "R" : "L", chase: 0.15 + r() * 0.35, fpsw: 0.2 + r() * 0.5})),
      pitchers: [0, 1, 2].map((i) => ({name: nm(), hand: r() < 0.7 ? "R" : "L", fb: 0.5 + r() * 0.2, str: 0.55 + r() * 0.13, types: r() < 0.5 ? ["FB", "CB", "CH"] : ["FB", "SL", "CH"],
                                      tags: [pick(["RUNNABLE", "NOGIVE", "BBSTR", ""])], note: i === 0 ? pick(["Lives on the fastball when he's behind.", "Throws the curve 0-0."]) : ""}))
    });
  }
  let gid = 0;
  const gameStats = {};   /* person id -> {lv: {...}} for the GameChanger rows */
  function gs(id, lv) { const a = gameStats[id] = gameStats[id] || {}; return a[lv] = a[lv] || {bf: 0, outs: 0, pitches: 0, h: 0, r: 0, er: 0, bb: 0, so: 0, hbp: 0, pa: 0, ab: 0, hh: 0, b2: 0, b3: 0, hr: 0, hbb: 0, hk: 0, hhbp: 0, sac: 0, sf: 0, games: {}}; }
  LEVELS.forEach((lv) => {
    const L = LOOK[lv], st = staff[lv];
    GAMES[lv].forEach((gm, gi) => {
      const date = "2027-" + gm[0], opp = gm[1], oid = OPP_ID[opp] || "", rid = "g" + String(++gid).padStart(3, "0"), T2 = oppTeam(opp);
      /* our pitchers, as the sandbox picks them */
      const starter = st[gi % 3 === 2 ? 2 + (gi % 2) : gi % 2], last = r() < 0.45 ? 6 : 7, relief = 4 + Math.floor(r() * 2);
      const pool = st.filter((x) => !x.idle && !x.swing);
      let rel = pool[2 + Math.floor(r() * (pool.length - 2))];
      if (rel === starter) rel = pool[pool.length - 1];
      st.forEach((x) => { if (x.swing && (gi === 2 || gi === 5)) rel = x; });
      let spot = 0, rows = 0;
      const thrown = {}, innRows = {}, abN = {};
      for (let inn = 1; inn <= last; inn++) {
        let s2 = inn <= relief ? starter : rel;
        const cap = (lv === "Varsity" ? 110 : 85) - 22;
        if ((thrown[s2.o.id] || 0) >= cap) s2 = (thrown[rel.o.id] || 0) >= cap ? pool.filter((x) => x !== starter && x !== rel)[inn % Math.max(1, pool.length - 2)] || rel : rel;
        const o = s2.o, lk = {free: Math.max(0.05, L.free + s2.tilt), k: L.k - s2.tilt * 0.8, fps: L.fps - s2.tilt * 1.2, str: L.str - s2.tilt * 0.5};
        const ex = (arms[o.id] || arms[byName[o.name].id] || {base: 0.5}).base - 0.1;
        const I = innRows[inn + "|" + o.id] = innRows[inn + "|" + o.id] || {Inning: inn, o, Pitches: 0, Strikes: 0, FirstPitches: 0, FirstPitchStrikes: 0, BattersFaced: 0, Outs: 0, FreeBases: 0, K: 0, Hits: 0, Runs: 0, Earned: 0};
        let outs = 0, runners = 0, err = false, hr = 0;
        /* now and then an inning ends early for this arm (a walk-off, a pitch-count pull): partial innings, as real games have */
        const capBF = I.BattersFaced + (inn > 3 && r() < 0.25 ? 3 + Math.floor(r() * 3) : 12);
        while (outs < 3 && I.BattersFaced < capBF) {
          const h = T2.hitters[spot % 9], ab = abN[spot % 9] = (abN[spot % 9] || 0) + 1, x = r();
          let res;
          if (x < lk.free) res = r() < 0.8 ? "BB" : "HBP";
          else if (x < lk.free + lk.k) res = r() < 0.75 ? "K" : "Kc";
          else if (x < lk.free + lk.k + L.hit) { const y = r(); res = y < 0.7 ? "1B" : y < 0.9 ? "2B" : y < 0.95 ? "3B" : "HR"; }
          else if (x < lk.free + lk.k + L.hit + L.err) res = "E";
          else res = pick(["GO", "GO", "FO", "LO", "PO", "FC", "GO"]);
          /* now and then a walk is intentional: one row, no pitch, as the Pitch Chart files it (v24) */
          if (res === "BB" && r() < 0.08) {
            add("Game_Pitches", {RecordID: rid, Level: lv, Date: date, Opponent: opp, Inning: inn, Spot: (spot % 9) + 1, Batter: h.name, Hand: h.hand, Pos: POSNUM[h.pos], PosName: h.pos,
              AB: ab, Pitch: "", Pitcher: o.last, PitcherID: o.id, PitcherLast: o.last, PitcherFirst: o.first, Class: o.cl, Throws: o.t, ABResult: "IBB", OpponentID: oid});
            rows++; I.BattersFaced++; I.FreeBases++; runners++;
            const G0 = gs(o.id, lv); G0.bf++; G0.bb++; G0.games[rid] = 1;
            spot++; continue;
          }
          /* the pitches: a count that ends where the result says */
          const seq = [];
          let b = 0, s = 0;
          const strikeOr = (pr) => r() < pr;
          for (;;) {
            const endNow = (res === "BB" && b === 3) || ((res === "K" || res === "Kc") && s === 2) || (res === "HBP" && r() < 0.4) ||
                           (!/^(BB|K|Kc|HBP)$/.test(res) && r() < 0.35);
            if (endNow) {
              seq.push(res === "BB" ? "ball" : res === "K" ? "swing&miss" : res === "Kc" ? "strike" : res === "HBP" ? "ball" : "in play");
              break;
            }
            let c;
            if (res === "BB") c = b < 3 && (s === 2 || r() < 0.65) ? "ball" : pick(["strike", "foul"]);
            else if (res === "K" || res === "Kc") c = s < 2 && strikeOr(0.58) ? pick(["strike", "swing&miss", "foul"]) : (b < 3 ? "ball" : "foul");
            else c = strikeOr(lk.str - 0.12) ? pick(["strike", "foul", "swing&miss"]) : (b < 3 ? "ball" : "foul");
            if (c === "ball") b++; else if (c !== "foul" || s < 2) s = Math.min(2, s + (c === "foul" && s === 2 ? 0 : 1));
            seq.push(c);
            if (seq.length > 11) { seq.push(res === "BB" ? "ball" : "in play"); break; }
          }
          const hard = HITS[res] ? r() < L.hard * 2.2 : (res === "LO" ? r() < 0.5 : !/^(BB|K|Kc|HBP)$/.test(res) && r() < L.hard * 0.7);
          const traj = {GO: "GB", FC: "GB", FO: "FB", LO: "LD", PO: "PU", "1B": pick(["GB", "LD"]), "2B": pick(["LD", "FB"]), "3B": "FB", HR: "FB", E: "GB"}[res] || "";
          const spx = 60 + Math.round(r() * 80), spy = 40 + Math.round(r() * 80);
          seq.forEach((c, k) => {
            const tk = pick(["FB", "FB", "FB", "FB", "CB", "CH", lv === "Varsity" ? "SL" : "FB"]);
            const target = pick(tk === "FB" ? [5, 3, 2, 7, 5, 0] : [5, 6, 3, 0]), src = r() < 0.04 ? "Glove" : r() < 0.03 ? "Unknown" : "Coach";
            const a = throwAt(target, ex + (tk === "FB" ? 0.04 : -0.05));
            const T0 = SPOTS[target];
            const g = a.g.toUpperCase().replace("CLOSE", "CLOSE");
            add("Game_Pitches", {RecordID: rid, Level: lv, Date: date, Opponent: opp, Inning: inn, Spot: (spot % 9) + 1, Batter: h.name, Hand: h.hand, Pos: POSNUM[h.pos], PosName: h.pos,
              AB: ab, Pitch: k + 1, Type: tk, Call: c, ZoneRow: a.row, ZoneCol: a.col, InZone: a.inz ? "Y" : "N",
              CalledRow: src === "Unknown" ? "" : T0[0] + 1, CalledCol: src === "Unknown" ? "" : T0[1] + 1, Execution: src === "Unknown" ? "" : g,
              MissV: src === "Unknown" || g === "SPOT" ? "" : a.mv.toUpperCase(), MissH: src === "Unknown" || g === "SPOT" ? "" : a.mh.toUpperCase(),
              Pitcher: o.last, PitcherID: o.id, PitcherLast: o.last, PitcherFirst: o.first, Class: o.cl, ClassName: "", Throws: o.t,
              ABResult: res, Traj: k === seq.length - 1 ? traj : traj, HardContact: hard ? "Y" : "", SprayX: /^(BB|K|Kc|HBP)$/.test(res) ? "" : spx, SprayY: /^(BB|K|Kc|HBP)$/.test(res) ? "" : spy,
              CallSource: src, OpponentID: oid});
            rows++;
            I.Pitches++; if (c !== "ball") I.Strikes++;
          });
          I.BattersFaced++; I.FirstPitches++; if (seq[0] !== "ball") I.FirstPitchStrikes++;
          if (res === "BB" || res === "HBP") { I.FreeBases++; runners++; }
          else if (res === "K" || res === "Kc") { I.K++; outs++; }
          else if (res === "E") { runners++; err = true; }
          else if (HITS[res]) { I.Hits++; runners++; if (res === "HR") hr++; }
          else outs++;
          const G = gs(o.id, lv); G.bf++; G.pitches += seq.length; G.games[rid] = 1;
          if (res === "BB") G.bb++; if (res === "HBP") G.hbp++; if (HITS[res]) G.h++; if (res === "K" || res === "Kc") G.so++;
          spot++;
        }
        I.Outs += outs;
        const runs = Math.max(0, runners - 2) + hr, er = runs - (err && r() < 0.85 ? Math.min(runs, 1 + Math.floor(r() * 2)) : 0);
        I.Runs += runs; I.Earned += er;
        const G = gs(o.id, lv); G.outs += outs; G.r += runs; G.er += er;
        thrown[o.id] = (thrown[o.id] || 0) + I.Pitches;
      }
      Object.keys(innRows).forEach((k) => {
        const I = innRows[k], o = I.o;
        add("Game_Innings", {RecordID: rid, Level: lv, Date: date, Opponent: opp, Inning: I.Inning, Partial: "", Pitcher: o.last, PitcherID: o.id, PitcherLast: o.last, PitcherFirst: o.first,
          Pitches: I.Pitches, Strikes: I.Strikes, StrikePct: Math.round(I.Strikes * 100 / I.Pitches), FirstPitches: I.FirstPitches, FirstPitchStrikes: I.FirstPitchStrikes,
          BattersFaced: I.BattersFaced, Outs: I.Outs, FreeBases: I.FreeBases, K: I.K, Hits: I.Hits, Runs: I.Runs, Earned: I.Earned, Unearned: I.Runs - I.Earned, OpponentID: oid});
      });
      const who = {};
      Object.keys(innRows).forEach((k) => { who[innRows[k].o.id] = innRows[k].o; });
      Object.keys(who).forEach((id, i) => {
        const o = who[id];
        add("Game_Notes", {RecordID: rid, Level: lv, Date: date, Opponent: opp, PitcherID: id, Pitcher: o.last, PitcherLast: o.last, PitcherFirst: o.first, Role: i ? "Relief 1" : "Starter",
          ToPitcher: r() < 0.5 ? pick(["Fastball command was there all day.", "Lost the zone after the error.", "Best change-up of the year.", "Came in with runners on and stranded both."]) : "",
          CoachOnly: r() < 0.2 ? "Talk about tempo" : "", Practice: "N", OpponentID: oid});
        if (r() < 0.6) add("Reflections", {When: date + "T23:00:00Z", PlayerID: id, Player: o.name, Level: lv, Kind: "pitch", RecordID: rid, Date: date, Event: lv + " vs " + opp,
          "Arm/Body": 4, Feel: 3 + Math.floor(r() * 3), PrePitch: pick(["Every pitch", "Most", "Some"]), Reset: pick(["Every time", "Sometimes", "No yellow lights"]),
          Start: pick(["Getting ahead with the fastball", "Using the reset after an error", "Throwing the curve for strike one"]), Stop: pick(["Rushing after a walk", "Shaking off the change-up", ""]),
          Continue: pick(["Working fast", "Trusting the call", "Attacking the zone"])});
      });
      add("Records", {RecordID: rid, App: "game", Build: "v38", Schema: 1, Team: lv, Date: date, Coach: "Coach " + lv[0], FiledAt: date + "T23:30:00Z", ReceivedAt: date + "T23:30:02Z", Rows: rows});

      /* our hitters against their pitchers */
      const orid = "o" + rid.slice(1), Lh = {Varsity: [0.19, 0.18, 0.33], JV: [0.17, 0.2, 0.4], Sophomore: [0.15, 0.17, 0.39], Freshman: [0.15, 0.2, 0.37]}[lv];
      const reg = lineup[lv].filter((h) => !h.pinch && !h.bench), bench = lineup[lv].filter((h) => h.bench), order = reg.concat(bench).slice(0, 9);
      if (reg.length >= 9 && bench.length && gi % 2) order[8] = bench[0];
      if (lv === "Varsity" && gi % 4 === 1) order[8] = lineup[lv].filter((h) => h.pinch)[0];
      let pa = 0, orows = 0, outs = 0;
      const ohit = {};
      for (let inn = 1; inn <= last; inn++) {
        outs = 0;
        while (outs < 3) {
          const h = order[pa % 9], o = h.o, tp = T2.pitchers[inn <= 4 ? 0 : inn <= 6 ? 1 : 2], t = o.skill;
          const x = r(); let res;
          if (x < Lh[0] - t * 0.04) res = r() < 0.8 ? "K" : "Kc";
          else if (x < Lh[0] + Lh[1] - t * 0.01) res = r() < 0.8 ? "BB" : "HBP";
          else if (x < Lh[0] + Lh[1] + 0.02) res = r() < 0.5 ? "SAC" : "SF";
          else if (r() < Lh[2] + t * 0.04) { const y = r(); res = y < 0.68 ? "1B" : y < 0.9 ? "2B" : y < 0.95 ? "3B" : "HR"; }
          else res = pick(["GO", "GO", "FO", "LO", "PO", "FC", "E", "DP"]);
          const n2 = res === "BB" ? 4 + Math.floor(r() * 4) : res === "HBP" ? 1 + Math.floor(r() * 4) : /^K/.test(res) ? 3 + Math.floor(r() * 5) : 1 + Math.floor(r() * 7);
          let b = 0, s = 0;
          const hard = !/^(BB|HBP|K|Kc)$/.test(res) && r() < 0.3 + t * 0.06, run = !/^(BB|HBP|K|Kc)$/.test(res) && r() < 0.08, adv = !/^(BB|HBP|K|Kc)$/.test(res) && r() < 0.12;
          for (let k = 0; k < n2; k++) {
            const lastP = k === n2 - 1, ty = r() < tp.fb ? "FB" : pick(tp.types.slice(1));
            let what, call = "", inz = r() < tp.str - 0.05;
            if (lastP) what = res === "BB" ? "Took it" : res === "HBP" ? "HBP" : res === "K" ? "Swing & miss" : res === "Kc" ? "Took it" : "In play";
            else what = r() < 0.5 ? "Took it" : pick(["Foul", "Swing & miss", "Foul"]);
            if (what === "Took it") { call = lastP ? (res === "Kc" ? "Strike" : "Ball") : (b < 3 && r() < 0.55 ? "Ball" : "Strike"); inz = call === "Strike"; }
            if (lastP && res === "BB") { call = "Ball"; inz = false; }
            if (!lastP && call === "Ball" && b >= 3) call = "Strike";
            if (!lastP && call === "Strike" && s >= 2) { call = "Ball"; inz = false; }
            const swing = /Foul|Swing|In play/.test(what);
            const row = inz ? 2 + Math.floor(r() * 3) : pick([1, 5]), col = inz ? 2 + Math.floor(r() * 3) : 1 + Math.floor(r() * 5);
            const sitn = b === 0 && s === 0 ? "First pitch" : s === 2 ? "Two strikes" : s > b ? "Ahead" : b > s ? "Behind" : "Even";
            const tags = (tp.tags.join(" ") + (tp.str > 0.62 ? " POUNDS*" : "") + (tp.str < 0.58 ? " WILD*" : "")).trim();
            add("Offense_Pitches", {RecordID: orid, Date: date, Opponent: opp, HomeAway: gi % 2 ? "H" : "A", Charting: "Coach " + lv[0], Build: "v56", Pitcher: tp.name, PitcherHand: tp.hand,
              PitcherTags: tags, PitcherNotes: tp.note, PA: pa + 1, Spot: (pa % 9) + 1, Hitter: o.last, HitterLast: o.last, HitterFirst: o.first, HitterID: o.id, Bats: o.b,
              PitchNo: k + 1, CountB: b, CountS: s, Situation: sitn, Pitch: ty, Row: row, Col: col, InZone: (row >= 2 && row <= 4 && col >= 2 && col <= 4) ? "Y" : "N", What: what, Call: call,
              Swing: swing ? "Y" : "", Chase: swing && !(row >= 2 && row <= 4 && col >= 2 && col <= 4) ? "Y" : "",
              PAResult: lastP ? res : "", Traj: lastP && res === "LO" ? "LD" : lastP && HITS[res] && hard ? "LD" : "", HardContact: lastP && hard ? "Y" : "",
              SprayDir: lastP && what === "In play" ? pick(["Pull", "Middle", "Oppo"]) : "", SprayDepth: lastP && what === "In play" ? pick(["Infield", "Outfield"]) : "",
              RunScored: lastP && what === "In play" ? (run ? "Y" : "N") : "", MovedRunner: lastP && what === "In play" ? (adv ? "Y" : "N") : "",
              Level: lv, Practice: "", Inning: inn, Outs: outs, OpponentID: oid});
            orows++;
            if (what === "Took it" && call === "Ball") b = Math.min(3, b + 1); else if (what !== "Foul" || s < 2) s = Math.min(2, s + 1);
          }
          if (OUTS1[res] || res === "DP") outs = Math.min(3, outs + (res === "DP" ? 2 : 1));
          const G = gs(o.id, lv); G.pa++; G.games[orid] = 1;
          if (!/^(BB|HBP|SAC|SF)$/.test(res)) G.ab++;
          if (HITS[res]) { G.hh++; if (res === "2B") G.b2++; if (res === "3B") G.b3++; if (res === "HR") G.hr++; }
          if (res === "BB") G.hbb++; if (res === "HBP") G.hhbp++; if (/^K/.test(res)) G.hk++; if (res === "SAC") G.sac++; if (res === "SF") G.sf++;
          ohit[o.id] = ohit[o.id] || {o, spot: (pa % 9) + 1, pa: 0, n: 0}; ohit[o.id].pa++; ohit[o.id].n += n2;
          pa++;
        }
      }
      Object.keys(ohit).forEach((id) => {
        const x = ohit[id];
        add("Offense_Notes", {RecordID: orid, Level: lv, Date: date, Opponent: opp, HitterID: id, Hitter: x.o.last, HitterLast: x.o.last, HitterFirst: x.o.first, Spot: x.spot, PA: x.pa, Pitches: x.n,
          ToHitter: r() < 0.3 ? "Good two-strike approach." : "", CoachOnly: "", Practice: "N", OpponentID: oid});
        if (r() < 0.5) add("Reflections", {When: date + "T23:10:00Z", PlayerID: id, Player: x.o.name, Level: lv, Kind: "hit", RecordID: orid, Date: date, Event: lv + " vs " + opp,
          "Arm/Body": 5, Feel: 3 + Math.floor(r() * 3), Start: pick(["Choking up with 2 strikes", "Being ready for the first fastball"]), Stop: pick(["Chasing the high fastball", "Pulling off away"]),
          Continue: pick(["Knowing the plan before I step in", "Taking the close one early"])});
      });
      add("Records", {RecordID: orid, App: "offense", Build: "v56", Schema: 1, Team: lv, Date: date, Coach: "Coach " + lv[0], FiledAt: date + "T23:40:00Z", ReceivedAt: date + "T23:40:02Z", Rows: orows});
    });
  });
  /* a game with no Records row (a write that died halfway): its rows must never count */
  if (!opt.noOrphan) {
    const o = staff.Varsity[0].o;
    add("Game_Innings", {RecordID: "gorphan", Level: "Varsity", Date: "2027-04-08", Opponent: "Heritage", Inning: 1, Pitcher: o.last, PitcherID: o.id, PitcherLast: o.last, PitcherFirst: o.first,
      Pitches: 30, Strikes: 10, FirstPitches: 6, FirstPitchStrikes: 1, BattersFaced: 6, Outs: 1, FreeBases: 5, K: 0, Hits: 0, Runs: 4, Earned: 4});
  }

  /* ---------------------------------------------------------- GameChanger (as the import stores it) */
  const GCH = ["Season", "Level", "PlayerID", "Last", "First", "Number", "Status", "ImportedAt", "ImportedBy"];
  const GCC = ["Bat GP","Bat PA","Bat AB","Bat H","Bat 1B","Bat 2B","Bat 3B","Bat HR","Bat RBI","Bat R","Bat BB","Bat SO","Bat HBP","Bat SAC","Bat SF","Bat SB","Bat CS","Bat AVG","Bat OBP","Bat SLG","Bat OPS",
    "Pit Outs","Pit GP","Pit GS","Pit BF","Pit Pitches","Pit W","Pit L","Pit SV","Pit H","Pit R","Pit ER","Pit BB","Pit SO","Pit HBP","Pit WP","Pit ERA","Pit WHIP","Pit Strike%","Pit FPS%",
    "Fld TC","Fld PO","Fld A","Fld E","Fld FPCT","Fld DP","Fld TP","Catch Outs","Catch PB","Catch SB","Catch SB Att","Catch CS","Catch CS%","Catch PIK","Catch CI",
    "Outs P","Outs C","Outs 1B","Outs 2B","Outs 3B","Outs SS","Outs LF","Outs CF","Outs RF","Outs SF","Outs Total"];
  T.GameChanger = [GCH.concat(GCC)];
  T.GC_Links = [["Last", "First", "PlayerID", "Linked by", "Linked at", "Season", "Level"]];
  const RATES = {Varsity: [0.948, 31, 0.2], JV: [0.917, 25, 0.5], Sophomore: [0.91, 28, 0.45], Freshman: [0.94, 21, 0.62]};   /* made up */
  function gcRow(season, lv, o, v, at) {
    const row = {Season: season, Level: lv, PlayerID: o ? o.id : "", Last: o ? o.last : "", First: o ? o.first : "", Number: o ? String(1 + (+o.id.slice(1) % 40)) : "",
                 Status: o ? "Matched" : "Team totals", ImportedAt: at, ImportedBy: "jim@example.com"};
    T.GameChanger.push(GCH.map((c) => row[c]).concat(GCC.map((c) => (v[c] == null ? "" : v[c]))));
  }
  function fielding(o, lv, outsTeam, season, rr) {
    const v = {}, prim = o.pos && o.pos !== "PH" ? o.pos : (o.pitcher ? "P" : "");
    const share = o.bench ? 0.35 : 0.92;
    if (prim && prim !== "DH") v["Outs " + prim] = Math.round(outsTeam * share * (0.85 + rr() * 0.1));
    if (o.pitcher) v["Outs P"] = (v["Outs P"] || 0) + Math.round(outsTeam * 0.12 * rr());
    if (prim && prim !== "DH" && rr() < 0.4) { const other = {C: "1B", SS: "2B", "2B": "SS", "3B": "1B", "1B": "LF", LF: "RF", RF: "LF", CF: "LF", P: "1B"}[prim]; v["Outs " + other] = Math.round(outsTeam * 0.08 * rr()) + 3; }
    let tot = 0, tc = 0, po = 0, a = 0, e = 0;
    const RATE = {P: [0.22, 0.3], C: [1.0, 0.9], "1B": [1.0, 0.92], "2B": [0.6, 0.45], "3B": [0.45, 0.3], SS: [0.6, 0.4], LF: [0.25, 0.95], CF: [0.3, 0.95], RF: [0.22, 0.95]};
    Object.keys(RATE).forEach((k) => {
      const x = v["Outs " + k]; if (!x) return; tot += x;
      const t = Math.round(x / 3 * RATE[k][0] * (0.8 + rr() * 0.4)), er = Math.round(t * (0.02 + rr() * 0.07)), p2 = Math.round((t - er) * RATE[k][1]);
      tc += t; e += er; po += p2; a += t - er - p2;
    });
    Object.assign(v, {"Fld TC": tc, "Fld PO": po, "Fld A": a, "Fld E": e, "Fld DP": Math.round(tc * 0.03), "Fld FPCT": tc ? +((po + a) / tc).toFixed(3) : "", "Outs Total": tot});
    if (v["Outs C"]) {
      const ci = v["Outs C"] / 3, att = Math.max(2, Math.round(ci / 7 * (1.2 + rr()))), cs = Math.round(att * (0.15 + rr() * 0.27));
      Object.assign(v, {"Catch Outs": v["Outs C"], "Catch SB Att": att, "Catch CS": cs, "Catch SB": att - cs, "Catch CS%": +(cs * 100 / att).toFixed(1), "Catch PB": Math.floor(rr() * ci / 7 * 0.8), "Catch PIK": Math.floor(rr() * 2.5)});
    }
    return v;
  }
  const at27 = "2027-04-15T21:00:00Z", at26 = "2026-11-12T18:00:00Z";
  LEVELS.forEach((lv) => {
    const team = {}, teamOuts = 3 * 6.5 * GAMES[lv].length;
    const sum = (v) => Object.keys(v).forEach((k) => { if (typeof v[k] === "number" && !/FPCT|CS%|AVG|OBP|SLG|OPS|ERA|WHIP|Strike%|FPS%/.test(k)) team[k] = (team[k] || 0) + v[k]; });
    const seen = {};
    lineup[lv].concat(staff[lv].map((s) => ({o: s.o}))).forEach((h) => {
      const o = h.o; if (seen[o.id]) return; seen[o.id] = 1;
      const G = (gameStats[o.id] || {})[lv];
      if (!G && !o.pos) return;
      const rr = rng(+o.id.slice(1) * 97 + lv.length), v = fielding({pos: o.pos && (o.lv === lv || !o.pitcher) ? o.pos : "", pitcher: !!G && G.bf > 0, bench: h.bench}, lv, teamOuts, "2027", rr);
      if (G && G.pa) {
        const sb = G.hh + G.hbb > 0 ? Math.floor(rr() * 4) : 0, cs = rr() < 0.3 ? 1 : 0, tb = G.hh + G.b2 + 2 * G.b3 + 3 * G.hr;
        Object.assign(v, {"Bat GP": Object.keys(G.games).length, "Bat PA": G.pa, "Bat AB": G.ab, "Bat H": G.hh, "Bat 2B": G.b2, "Bat 3B": G.b3, "Bat HR": G.hr, "Bat BB": G.hbb, "Bat SO": G.hk,
          "Bat HBP": G.hhbp, "Bat SAC": G.sac, "Bat SF": G.sf, "Bat SB": sb, "Bat CS": cs, "Bat AVG": G.ab ? +(G.hh / G.ab).toFixed(3) : "",
          "Bat OBP": +((G.hh + G.hbb + G.hhbp) / Math.max(1, G.ab + G.hbb + G.hhbp + G.sf)).toFixed(3), "Bat SLG": G.ab ? +(tb / G.ab).toFixed(3) : ""});
      }
      if (G && G.bf) Object.assign(v, {"Pit Outs": G.outs, "Pit BF": G.bf, "Pit Pitches": G.pitches, "Pit H": G.h, "Pit R": G.r, "Pit ER": G.er, "Pit BB": G.bb, "Pit SO": G.so, "Pit HBP": G.hbp});
      sum(v);
      if (!opt.noGC27) gcRow("2027", lv, o, v, at27);
    });
    const R = RATES[lv];
    team["Fld FPCT"] = team["Fld TC"] ? +((team["Fld PO"] + team["Fld A"]) / team["Fld TC"]).toFixed(3) : "";
    if (!opt.noGC27) gcRow("2027", lv, null, team, at27);
    /* 2026: returning players get a line; team totals carry last year's real rates */
    const bf26 = {Varsity: 1000, JV: 820, Sophomore: 760, Freshman: 700}[lv];
    const t26 = {"Fld TC": 1000, "Fld PO": Math.round(1000 * R[0] * 0.7), "Fld A": Math.round(1000 * R[0]) - Math.round(1000 * R[0] * 0.7), "Fld E": 1000 - Math.round(1000 * R[0]),
                 "Catch SB Att": 100, "Catch CS": Math.round(R[1]), "Catch Outs": 3 * 7 * 100, "Catch PB": Math.round(R[2] * 100),
                 "Pit BF": bf26, "Pit BB": Math.round({Varsity: 140, JV: 150, Sophomore: 120, Freshman: 105}[lv]), "Pit HBP": Math.round({Varsity: 29, JV: 28, Sophomore: 27, Freshman: 27}[lv]),
                 "Pit SO": Math.round({Varsity: 190, JV: 240, Sophomore: 170, Freshman: 180}[lv]), "Pit Outs": 690, "Pit H": 210, "Pit ER": Math.round({Varsity: 130, JV: 160, Sophomore: 170, Freshman: 140}[lv]),
                 "Pit Strike%": {Varsity: 59, JV: 57.5, Sophomore: 58, Freshman: 58.4}[lv], "Pit FPS%": {Varsity: 55, JV: 54, Sophomore: 54.5, Freshman: 57}[lv],
                 "Outs Total": 9 * 3 * 6 * 18, "Bat PA": 1000, "Bat AB": 820, "Bat H": 260, "Bat 2B": 50, "Bat 3B": 8, "Bat HR": 6, "Bat BB": 150, "Bat HBP": 30, "Bat SO": 170, "Bat SF": 8, "Bat SB": 85, "Bat CS": 14};
    gcRow("2026", lv, null, t26, at26);
    Object.keys(seen).forEach((id) => {
      const o = P[id]; if (o.cl === "Fr" || (+id.slice(1)) % 7 === 0) return;
      const lv26 = {Sr: "Varsity", Jr: "JV", So: "Freshman"}[o.cl], rr = rng(+id.slice(1) * 31);
      const v = fielding({pos: o.pos && o.pos !== "PH" ? o.pos : "", pitcher: o.pitcher}, lv26, 3 * 6.5 * 18, "2026", rr);
      if (o.pitcher) Object.assign(v, {"Pit Outs": 30 + Math.floor(rr() * 40), "Pit BF": 60 + Math.floor(rr() * 50), "Pit BB": 8 + Math.floor(rr() * 10), "Pit HBP": Math.floor(rr() * 3), "Pit SO": 10 + Math.floor(rr() * 15),
                                       "Pit H": 12 + Math.floor(rr() * 15), "Pit ER": 5 + Math.floor(rr() * 10), "Pit Strike%": +(54 + rr() * 6).toFixed(1), "Pit FPS%": +(50 + rr() * 8).toFixed(1)});
      if (o.pos && o.pos !== "PH") Object.assign(v, {"Bat PA": 40 + Math.floor(rr() * 40), "Bat AB": 34 + Math.floor(rr() * 30), "Bat H": 9 + Math.floor(rr() * 12), "Bat 2B": Math.floor(rr() * 4), "Bat BB": 4 + Math.floor(rr() * 6),
                                       "Bat HBP": Math.floor(rr() * 3), "Bat SO": 6 + Math.floor(rr() * 8), "Bat SF": Math.floor(rr() * 2), "Bat SB": Math.floor(rr() * 6), "Bat CS": Math.floor(rr() * 2)});
      if (lv === o.lv || !seen.done) gcRow("2026", lv26, o, v, at26);
    });
  });
  /* the same 2026 player can only be written once */
  const k26 = {};
  T.GameChanger = [T.GameChanger[0]].concat(T.GameChanger.slice(1).filter((row) => { if (row[0] !== "2026" || !row[2]) return true; const k = row[2]; if (k26[k]) return false; k26[k] = 1; return true; }));

  /* ---------------------------------------------------------- comments (the comments spreadsheet) */
  const CH = ["PlayerID", "Player", "Role", "Comment", "By", "At"];
  const C = {};
  LEVELS.forEach((lv) => { C[lv] = [CH.slice()]; });
  Object.keys(P).forEach((id, i) => {
    const o = P[id]; if (i % 5 === 2 || !C[o.lv]) return;
    C[o.lv].push([id, o.name, o.pitcher && o.pos ? "Pitching" : "", "Competes every pitch. The next step is a breaking ball he can land for strike one.", "coachv@example.com", "2027-05-10T18:00:00Z"]);
  });
  T.Config.push(["Season", "2027", ""], ["Free base game budget", 3, ""]);
  return {sheet: T, comments: C, people: P};
}

module.exports = { season, LEVELS, ROUTINES, PEN_DATES, LIVE_DATES };
if (require.main === module) {
  const out = season();
  const f = process.argv[2];
  const counts = Object.keys(out.sheet).map((k) => k + " " + (out.sheet[k].length - 1)).join(", ");
  if (f) fs.writeFileSync(f, JSON.stringify(out));
  console.log(counts);
}
