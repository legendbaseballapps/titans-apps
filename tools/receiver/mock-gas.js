/* A small stand-in for the Google Apps Script runtime, just enough to run
   receiver/Code.gs under Node: SpreadsheetApp, PropertiesService, LockService,
   ContentService, Utilities, Logger.

   It is deliberately PESSIMISTIC about the one thing that matters most - how a
   Sheet treats the text it is given. Like the real thing, a string written
   without a leading apostrophe is parsed: "=..." becomes a FORMULA, "2-1" becomes
   a DATE, "88" becomes a number. Those cells are recorded, so a test can prove
   the receiver never lets one through. An apostrophe-prefixed string is stored
   as plain text with the apostrophe dropped, which is what Sheets does.

   Failure injection: failNext(sheetName) makes the next setValues on that tab
   throw, to rehearse a write that dies halfway. */
"use strict";
const fs = require("fs");
const vm = require("vm");
const crypto = require("crypto");

function parseCell(v, flags) {
  if (typeof v !== "string") return v;
  if (v.charAt(0) === "'") return v.slice(1);                  /* forced text */
  if (v === "") return "";
  if (/^[=+@]/.test(v) || /^-[^0-9.]/.test(v)) { flags.formula++; return { FORMULA: v }; }
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (/^\d{1,2}[-/]\d{1,2}([-/]\d{2,4})?$/.test(v) || /^\d{4}-\d{2}-\d{2}/.test(v)) { flags.date++; return { DATE: v }; }
  return v;
}

class Range {
  constructor(sheet, row, col, nr, nc) { Object.assign(this, { sheet, row, col, nr, nc }); }
  getValues() {
    const out = [];
    for (let r = 0; r < this.nr; r++) {
      const src = this.sheet.data[this.row - 1 + r] || [];
      const line = [];
      for (let c = 0; c < this.nc; c++) {
        const v = src[this.col - 1 + c];
        line.push(v === undefined ? "" : v);
      }
      out.push(line);
    }
    return out;
  }
  setValues(vals) {
    const s = this.sheet;
    if (s.book.failing[s.name]) { delete s.book.failing[s.name]; throw new Error("injected failure on " + s.name); }
    if (vals.length !== this.nr) throw new Error("setValues: " + vals.length + " rows for a " + this.nr + "-row range");
    vals.forEach((line, r) => {
      if (line.length !== this.nc) throw new Error("setValues: row width " + line.length + " vs " + this.nc);
      const i = this.row - 1 + r;
      while (s.data.length <= i) s.data.push([]);
      line.forEach((v, c) => { s.data[i][this.col - 1 + c] = parseCell(v, s.book.flags); });
    });
    return this;
  }
  setFontWeight() { return this; }
  setNumberFormat() { return this; }
  getRow() { return this.row; }
  createTextFinder(text) {
    const range = this;
    let whole = false;
    return {
      matchEntireCell(b) { whole = !!b; return this; },
      findAll() {
        const hits = [];
        const vals = range.getValues();
        vals.forEach((line, r) => line.forEach((v, c) => {
          const s = typeof v === "object" && v ? (v.FORMULA || v.DATE) : String(v);
          if (whole ? s === text : s.indexOf(text) >= 0) hits.push(new Range(range.sheet, range.row + r, range.col + c, 1, 1));
        }));
        return hits;
      },
      findNext() { return this.findAll()[0] || null; }
    };
  }
}

class Sheet {
  constructor(book, name) { this.book = book; this.name = name; this.data = []; }
  getName() { return this.name; }
  getLastRow() { return this.data.length; }
  getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); }
  getRange(row, col, nr, nc) {
    if (typeof row === "string") return new Range(this, 1, 1, Math.max(1, this.data.length), 1);   /* "D:D": formatting only */
    if (nc === undefined && nr === undefined && col !== undefined) { nr = 1; nc = 1; }
    if (row < 1 || col < 1 || !(nr >= 1) || !(nc >= 1)) throw new Error("bad range " + [row, col, nr, nc]);
    return new Range(this, row, col, nr, nc);
  }
  setFrozenRows() { return this; }
  deleteRows(start, n) { this.data.splice(start - 1, n); this.book.deletes.push([this.name, start, n]); }
  deleteRow(r) { this.deleteRows(r, 1); }
  appendRow(vals) { this.getRange(this.data.length + 1, 1, 1, vals.length).setValues([vals]); return this; }
  /* sheet protection, as the comments spreadsheet uses it: editors are emails */
  protect() { const p = this.prot = { eds: [], desc: "", domain: true, setDescription(d) { this.desc = d; return this; },
    getEditors() { return this.eds.map(e => ({ getEmail: () => e })); }, addEditors(a) { a.forEach(e => { if (this.eds.indexOf(e) < 0) this.eds.push(e); }); return this; },
    removeEditors(a) { this.eds = this.eds.filter(e => a.indexOf(e) < 0); return this; }, canDomainEdit() { return this.domain; }, setDomainEdit(b) { this.domain = b; return this; } }; return p; }
  getProtections() { return this.prot ? [this.prot] : []; }
  /* test helpers */
  header() { return (this.data[0] || []).map(String); }
  rows() { return this.data.slice(1); }
  records() {
    const h = this.header();
    return this.rows().map(r => { const o = {}; h.forEach((k, i) => { o[k] = r[i]; }); return o; });
  }
}

class Book {
  constructor(id) { this.id = id; this.sheets = {}; this.order = []; this.failing = {}; this.flags = { formula: 0, date: 0 }; this.deletes = []; }
  getName() { return "Titans Charting 2027 (mock " + this.id + ")"; }
  getSheetByName(n) { return this.sheets[n] || null; }
  insertSheet(n) { if (this.sheets[n]) throw new Error("exists " + n); this.sheets[n] = new Sheet(this, n); this.order.push(n); return this.sheets[n]; }
  failNext(n) { this.failing[n] = true; }
  getId() { return this.id; }
  getUrl() { return "https://docs.google.com/spreadsheets/d/" + this.id; }
  getSheets() { return this.order.map(n => this.sheets[n]); }
  deleteSheet(sh) { delete this.sheets[sh.name]; this.order = this.order.filter(n => n !== sh.name); }
  addEditors(a) { this.editors = (this.editors || []).concat(a.filter(e => (this.editors || []).indexOf(e) < 0)); return this; }
}

function makeRuntime(codePath, opts) {
  opts = opts || {};
  const codePaths = Array.isArray(codePath) ? codePath : [codePath];
  const cache = {};
  const books = {};
  const props = {};
  const logs = [];
  let locked = false;
  /* Card-script extras (Oct 2026): mail, pages, triggers, who is running it, fetch. */
  const mail = [];
  const triggers = [];
  const session = { active: "owner@example.com", effective: "owner@example.com" };
  const fetchMap = opts.fetch || {};
  let quota = opts.quota == null ? 100 : opts.quota;
  let trigN = 0;
  const sandbox = {
    console,
    SpreadsheetApp: {
      openById(id) { if (!books[id]) throw new Error("no spreadsheet " + id); if (opts.canOpen && !opts.canOpen(id, session.active)) throw new Error("no access to " + id); return books[id]; },
      create(name) { const id = "BOOK" + (Object.keys(books).length + 1); const b = books[id] = new Book(id); b.title = name; b.insertSheet("Sheet1"); return b; },
      ProtectionType: { SHEET: "SHEET", RANGE: "RANGE" },
      flush() {}
    },
    PropertiesService: {
      getScriptProperties() {
        return { getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } };
      }
    },
    LockService: {
      getScriptLock() {
        return {
          tryLock() { if (locked) return false; locked = true; return true; },
          waitLock() { if (locked) throw new Error("lock timeout"); locked = true; },
          releaseLock() { locked = false; }
        };
      }
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput(s) { return { content: s, setMimeType() { return this; }, getContent() { return this.content; } }; }
    },
    Utilities: { getUuid: () => crypto.randomUUID(),
      formatDate(d, tz, f) { const x = opts.now ? new Date(opts.now) : d; const iso = x.toISOString(); return f === "yyyy-MM-dd" ? iso.slice(0, 10) : iso.slice(0, 16).replace("T", " "); } },
    CacheService: { getScriptCache() { return {
      get: k => (k in cache ? cache[k] : null), getAll: ks => { const o = {}; ks.forEach(k => { if (k in cache) o[k] = cache[k]; }); return o; },
      putAll: (o) => { Object.assign(cache, o); }, put: (k, v) => { cache[k] = v; } }; } },
    Logger: { log: m => logs.push(String(m)) },
    MailApp: {
      sendEmail(m) { if (quota <= 0) throw new Error("Service invoked too many times for one day: email."); mail.push(JSON.parse(JSON.stringify(m))); quota -= 1 + (m.cc ? String(m.cc).split(",").length : 0); },
      getRemainingDailyQuota() { return quota; }
    },
    HtmlService: {
      createHtmlOutput(h) { return { content: h, title: "", setTitle(t) { this.title = t; return this; }, addMetaTag() { return this; }, getContent() { return this.content; } }; },
      /* a template: only <?!= name ?> (printed as is) is supported, which is all the dashboard uses; and like the
         real thing, the file's HTML comments are gone by the time it is served */
      createTemplateFromFile(name) {
        const src = fs.readFileSync(require("path").join(require("path").dirname(codePaths[0]), name + ".html"), "utf8");
        const t = { evaluate() { return sandbox.HtmlService.createHtmlOutput(src.replace(/<!--[^]*?-->/g, "").replace(/<\?!=\s*(\w+)\s*\?>/g, (m, k) => String(t[k]))); } };
        return t;
      },
      createHtmlOutputFromFile(name) { return sandbox.HtmlService.createHtmlOutput(fs.readFileSync(require("path").join(require("path").dirname(codePaths[0]), name + ".html"), "utf8").replace(/<!--[^]*?-->/g, "")); }
    },
    ScriptApp: {
      getProjectTriggers() { return triggers.slice(); },
      deleteTrigger(t) { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
      newTrigger(fn) {
        const t = { fn, hour: null, uid: String(1000 + (++trigN)), getHandlerFunction() { return this.fn; }, getUniqueId() { return this.uid; } };
        const b = { timeBased() { return b; }, everyDays() { return b; }, atHour(h) { t.hour = h; return b; }, create() { triggers.push(t); return t; } };
        return b;
      },
      getService() { return { getUrl: () => "https://script.google.com/macros/s/MOCK/exec" }; }
    },
    Session: {
      getActiveUser() { return { getEmail: () => session.active }; },
      getEffectiveUser() { return { getEmail: () => session.effective }; },
      getScriptTimeZone() { return "America/Denver"; }
    },
    UrlFetchApp: {
      fetch(url) { if (!(url in fetchMap)) throw new Error("mock fetch: no " + url); return { getContentText: () => fetchMap[url] }; }
    }
  };
  vm.createContext(sandbox);
  codePaths.forEach(f => vm.runInContext(fs.readFileSync(f, "utf8"), sandbox, { filename: f }));
  return {
    sandbox, props, logs, mail, triggers, session, cache,
    setQuota(n) { quota = n; },
    get quota() { return quota; },
    newBook(id) { books[id] = new Book(id); return books[id]; },
    book(id) { return books[id]; },
    post(body) { return JSON.parse(sandbox.doPost({ postData: { contents: body, type: "text/plain" } }).getContent()); },
    get() { return JSON.parse(sandbox.doGet({}).getContent()); },
    get locked() { return locked; }
  };
}

module.exports = { makeRuntime };
