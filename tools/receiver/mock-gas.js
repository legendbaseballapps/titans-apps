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
    if (row < 1 || col < 1 || !(nr >= 1) || !(nc >= 1)) throw new Error("bad range " + [row, col, nr, nc]);
    return new Range(this, row, col, nr, nc);
  }
  setFrozenRows() { return this; }
  deleteRows(start, n) { this.data.splice(start - 1, n); this.book.deletes.push([this.name, start, n]); }
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
}

function makeRuntime(codePath) {
  const books = {};
  const props = {};
  const logs = [];
  let locked = false;
  const sandbox = {
    console,
    SpreadsheetApp: {
      openById(id) { if (!books[id]) throw new Error("no spreadsheet " + id); return books[id]; },
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
    Utilities: { getUuid: () => crypto.randomUUID() },
    Logger: { log: m => logs.push(String(m)) }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(codePath, "utf8"), sandbox, { filename: codePath });
  return {
    sandbox, props, logs,
    newBook(id) { books[id] = new Book(id); return books[id]; },
    book(id) { return books[id]; },
    post(body) { return JSON.parse(sandbox.doPost({ postData: { contents: body, type: "text/plain" } }).getContent()); },
    get() { return JSON.parse(sandbox.doGet({}).getContent()); },
    get locked() { return locked; }
  };
}

module.exports = { makeRuntime };
