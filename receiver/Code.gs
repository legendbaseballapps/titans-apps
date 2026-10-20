/* Titans Upload Receiver
   =====================
   A standalone Google Apps Script web app owned by the program account
   (legendbaseballapps@gmail.com). The three charting apps send each filed
   session or game here; this writes it into the current season's Sheet.

   Setup, once (full steps in claude/dashboard-google-setup.md):
     1. script.google.com > New project > paste this file over Code.gs
     2. Project Settings > Script properties > add SEASON_SHEET_ID
        (the long ID in the season Sheet's address, between /d/ and /edit)
     3. Run setup() once and approve the permission prompt. It builds the tabs
        and creates UPLOAD_KEY. View > Logs (or the Execution log) shows the key.
     4. Deploy > New deployment > Web app
          Execute as:      Me
          Who has access:  Anyone
        The web app URL and the key go into each app's UPLOAD_URL / UPLOAD_KEY.

   Each new season: make the new season Sheet and change SEASON_SHEET_ID.
   The URL never changes, so the apps never need a new address.

   What it will and will not do:
   - It only WRITES. doGet answers "I'm here" and nothing else; no request can
     read a single row back out. That is the real protection - the key is printed
     in public app code, so it only keeps stray requests out.
   - It ignores a session it already has (same RecordID), so the apps can retry
     as often as they like. The one exception (receiver 3): an upload marked
     update:"notes" for a record it already has REPLACES that record's note rows
     and touches nothing else - a coach can change a note after the game is in.
   - It writes the pitch rows first and the Records row last. A record is only
     "in" once its Records row exists. If a write dies halfway, the retry first
     clears that record's own half-written rows, then writes it again whole.
   - It never touches any other rows, and never touches Coaches or Config.
   - Text is stored as text: nothing an app sends can become a formula. */

var VERSION = "receiver 3 (Oct 2026)";

/* Which tables each app may send, and the tab each one lands on. */
var APPS = {
  bullpen: { pitches: "Bullpen_Pitches", notes: "Bullpen_Notes" },   /* notes: receiver 2, bullpen v36 */
  game:    { pitches: "Game_Pitches", innings: "Game_Innings", notes: "Game_Notes" },   /* notes: receiver 3, game v27 */
  offense: { pitches: "Offense_Pitches" }
};
var SCHEMAS = [1];

var RECORDS = "Records";
var RECORDS_HEAD = ["RecordID", "App", "Build", "Schema", "Mound", "Team", "Date", "Coach",
                    "Template", "ScriptID", "FiledAt", "ReceivedAt", "Rows"];
var LOG = "Log";
var LOG_HEAD = ["When", "Result", "App", "RecordID", "Build", "Detail"];
var LOG_CAP = 5000;            /* stop logging rejects past this - a flood is not news */

var MAX_BODY = 3000000;        /* characters; a whole game is ~150 KB */
var MAX_ROWS = 5000;           /* per table, per upload */
var MAX_COLS = 200;
var LOCK_WAIT = 25000;

/* ---------------------------------------------------------------- setup */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("SEASON_SHEET_ID");
  if (!id) throw new Error("Add SEASON_SHEET_ID in Project Settings > Script properties first.");
  var ss = SpreadsheetApp.openById(id);

  sheet_(ss, RECORDS, RECORDS_HEAD);
  Object.keys(APPS).forEach(function (app) {
    var t = APPS[app];
    Object.keys(t).forEach(function (k) { sheet_(ss, t[k], ["RecordID"]); });
  });
  sheet_(ss, LOG, LOG_HEAD);
  /* Jim fills these two by hand. Created only if missing; never rewritten. */
  if (!ss.getSheetByName("Coaches")) sheet_(ss, "Coaches", ["Name", "Google account", "Level(s)"]);
  if (!ss.getSheetByName("Config")) {
    var cfg = sheet_(ss, "Config", ["Setting", "Value", "Notes"]);
    cfg.getRange(2, 1, 1, 3).setValues([["Season", "2027", "Program goals and execution goals go below"]]);
  }

  var key = props.getProperty("UPLOAD_KEY");
  if (!key) {
    key = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "").slice(0, 40);
    props.setProperty("UPLOAD_KEY", key);
  }
  Logger.log("Season Sheet: " + ss.getName());
  Logger.log("UPLOAD_KEY: " + key);
  return key;
}

/* ---------------------------------------------------------------- web app */
function doGet() {
  return reply_({ ok: true, service: "titans-upload-receiver", version: VERSION, schemas: SCHEMAS });
}

function doPost(e) {
  var body = (e && e.postData && e.postData.contents) || "";
  if (body.length > MAX_BODY) return reject_(null, "too large");

  var p;
  try { p = JSON.parse(body); } catch (err) { return reject_(null, "not JSON"); }

  var why = check_(p);
  if (why) return reject_(p, why);

  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("SEASON_SHEET_ID");
  if (!id) return fail_(p, "receiver has no SEASON_SHEET_ID");

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT)) return reply_({ ok: false, error: "busy", retry: true });
  try {
    var ss = SpreadsheetApp.openById(id);
    var rec = ss.getSheetByName(RECORDS);
    if (!rec) return fail_(p, "season Sheet is not set up - run setup()");
    var rid = p.record.id;

    var tabs = APPS[p.app], total = 0;
    if (find_(rec, rid).length) {
      if (p.update === "notes") {
        var nsh = ss.getSheetByName(tabs.notes) || sheet_(ss, tabs.notes, ["RecordID"]);
        removeRows_(nsh, rid);
        var nn = write_(nsh, rid, p.tables.notes);
        SpreadsheetApp.flush();
        return reply_({ ok: true, status: "notes updated", id: rid, rows: nn });
      }
      return reply_({ ok: true, status: "duplicate", id: rid });
    }
    /* A notes update for a record that is not in yet: the full upload carries the
       notes, so this only happens out of order. Retry later. */
    if (p.update === "notes") return reply_({ ok: false, error: "not on the dashboard yet", retry: true });

    var keys = Object.keys(p.tables);
    for (var i = 0; i < keys.length; i++) {
      /* receiver 2: a tab added in a later version (Bullpen_Notes) is made on first
         use, so a Sheet set up by an earlier receiver needs no second setup() run. */
      var sh = ss.getSheetByName(tabs[keys[i]]) || sheet_(ss, tabs[keys[i]], ["RecordID"]);
      clearOrphans_(sh, rid);
      total += write_(sh, rid, p.tables[keys[i]]);
    }

    var r = p.record;
    appendRows_(rec, [["'" + rid, p.app, p.build || "", p.schema, r.mound || "", r.team || "", r.date || "",
                       r.coach || "", r.template || "", r.scriptId || "", r.filedAt || "",
                       new Date().toISOString(), total]]);
    SpreadsheetApp.flush();
    return reply_({ ok: true, status: "stored", id: rid, rows: total });
  } catch (err) {
    return fail_(p, "server error: " + (err && err.message ? err.message : String(err)));
  } finally {
    lock.releaseLock();
  }
}

/* ---------------------------------------------------------------- checks */
function check_(p) {
  if (!p || typeof p !== "object") return "not an upload";
  var key = PropertiesService.getScriptProperties().getProperty("UPLOAD_KEY");
  if (!key || p.key !== key) return "wrong key";
  if (SCHEMAS.indexOf(p.schema) < 0) return "unknown upload version " + p.schema;
  if (!APPS.hasOwnProperty(p.app)) return "unknown app";
  var r = p.record;
  if (!r || typeof r !== "object") return "no record";
  if (typeof r.id !== "string" || !/^[A-Za-z0-9_-]{4,64}$/.test(r.id)) return "bad record id";
  if (!p.tables || typeof p.tables !== "object") return "no tables";
  var keys = Object.keys(p.tables);
  if (!keys.length) return "no tables";
  if (p.update !== undefined) {
    if (p.update !== "notes") return "unknown update " + String(p.update).slice(0, 20);
    if (!APPS[p.app].hasOwnProperty("notes")) return "unknown table notes";
    if (keys.length !== 1 || keys[0] !== "notes") return "a notes update carries only notes";
  }
  for (var i = 0; i < keys.length; i++) {
    if (!APPS[p.app].hasOwnProperty(keys[i])) return "unknown table " + keys[i];
    var t = p.tables[keys[i]];
    if (!t || !Array.isArray(t.columns) || !Array.isArray(t.rows)) return "bad table " + keys[i];
    if (t.columns.length > MAX_COLS) return "too many columns";
    if (t.rows.length > MAX_ROWS) return "too many rows";
    var seen = {};
    for (var c = 0; c < t.columns.length; c++) {
      var name = t.columns[c];
      if (typeof name !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name)) return "bad column name";
      if (name === "RecordID") return "RecordID is set by the receiver";
      if (seen[name]) return "duplicate column " + name;
      seen[name] = 1;
    }
    for (var j = 0; j < t.rows.length; j++) {
      if (!Array.isArray(t.rows[j]) || t.rows[j].length !== t.columns.length) return "row " + (j + 1) + " does not match the columns";
    }
  }
  return "";
}

/* ---------------------------------------------------------------- writing */
/* Map the upload's columns onto the tab's header by NAME, adding any column the
   tab has not seen yet at the right-hand end. So an app can add a column in a
   later build without breaking a Sheet that already has rows, and two builds
   can upload into the same tab. Column A is always RecordID. */
function write_(sh, rid, t) {
  if (!t.rows.length) return 0;
  var lastCol = sh.getLastColumn();
  var head = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
  if (head[0] !== "RecordID") {
    if (head.length === 0 || (head.length === 1 && head[0] === "")) head = ["RecordID"];
    else throw new Error(sh.getName() + " column A is not RecordID");
  }
  var at = {}, grew = false;
  head.forEach(function (h, i) { at[h] = i; });
  t.columns.forEach(function (c) {
    if (!at.hasOwnProperty(c)) { at[c] = head.length; head.push(c); grew = true; }
  });
  if (grew || sh.getLastColumn() === 0) {
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  var out = t.rows.map(function (row) {
    var o = [];
    for (var k = 0; k < head.length; k++) o.push("");
    o[0] = "'" + rid;     /* always text: an all-digit id must not lose a leading zero */
    for (var c = 0; c < t.columns.length; c++) o[at[t.columns[c]]] = row[c];
    return o;
  });
  appendRows_(sh, out);
  return out.length;
}

function appendRows_(sh, rows) {
  var clean = rows.map(function (r) { return r.map(cell_); });
  sh.getRange(sh.getLastRow() + 1, 1, clean.length, clean[0].length).setValues(clean);
}

/* Numbers and booleans as they are. Any other text is forced to stay text with
   a leading apostrophe (Sheets hides it): no "=..." from an app can become a
   formula, an AO3+ of "+-" is not parsed as one, and a count like "2-1" is not
   turned into February 1st. A string that is a plain number becomes the number. */
function cell_(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return isFinite(v) ? v : "";
  if (typeof v === "boolean") return v;
  var s = String(v);
  if (s.length > 5000) s = s.slice(0, 5000);
  if (s === "") return "";
  if (s.charAt(0) === "'") return s;          /* already marked as text */
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return "'" + s;
}

/* Rows in column A carrying this RecordID. */
function find_(sh, rid) {
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).createTextFinder(rid).matchEntireCell(true).findAll()
    .map(function (r) { return r.getRow(); });
}

/* A record whose Records row is missing but whose pitch rows exist died halfway
   through a write. Clear exactly those rows before writing it again - they are
   always one contiguous block, because each table is written in one call. */
function clearOrphans_(sh, rid) {
  var rows = find_(sh, rid);
  if (!rows.length) return;
  rows.sort(function (a, b) { return a - b; });
  sh.deleteRows(rows[0], rows[rows.length - 1] - rows[0] + 1);
}

/* Every row in column A carrying this RecordID, bottom up so the row numbers
   still hold as each one goes. */
function removeRows_(sh, rid) {
  var rows = find_(sh, rid).sort(function (a, b) { return b - a; });
  rows.forEach(function (r) { sh.deleteRows(r, 1); });
}

/* ---------------------------------------------------------------- replies */
function reply_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function reject_(p, why) {
  log_("rejected", p, why);
  return reply_({ ok: false, error: why });
}
function fail_(p, why) {
  log_("error", p, why);
  return reply_({ ok: false, error: why, retry: true });
}
function log_(result, p, detail) {
  try {
    var id = PropertiesService.getScriptProperties().getProperty("SEASON_SHEET_ID");
    if (!id) return;
    var sh = SpreadsheetApp.openById(id).getSheetByName(LOG);
    if (!sh || sh.getLastRow() > LOG_CAP) return;
    var app = p && typeof p.app === "string" ? p.app.slice(0, 20) : "";
    var rid = p && p.record && typeof p.record.id === "string" ? p.record.id.slice(0, 64) : "";
    var build = p && typeof p.build === "string" ? p.build.slice(0, 20) : "";
    appendRows_(sh, [[new Date().toISOString(), result, app, rid, build, String(detail).slice(0, 300)]]);
  } catch (err) { /* logging must never turn a reply into a failure */ }
}

/* ---------------------------------------------------------------- helpers */
function sheet_(ss, name, head) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}
