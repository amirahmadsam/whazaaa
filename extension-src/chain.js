/* خواندن همه‌ی اختیارهای یک نماد پایه از TSETMC و دریافت قیمت‌های هرکدام */
(function (root) {
  "use strict";
  var OCC = root.OCCollect;
  if (typeof module !== "undefined" && module.exports) OCC = OCC || require("./collect-opt.js");
  var BASES = ["https://cdn.tsetmc.com/api/", "https://cdn.tsetmc.ir/api/"];
  var fa = OCC.fa;

  function bg(url) {
    return new Promise(function (res) {
      try {
        chrome.runtime.sendMessage({ t: "fetch", url: url }, function (r) {
          if (chrome.runtime.lastError) res({ ok: false, err: chrome.runtime.lastError.message });
          else res(r || { ok: false, err: "بدون پاسخ" });
        });
      } catch (e) { res({ ok: false, err: String(e) }); }
    });
  }
  async function api(path, log) {
    for (var i = 0; i < BASES.length; i++) {
      var url = BASES[i] + path, r = await bg(url);
      log.push((r.ok ? "OK " : "FAIL ") + url + (r.status ? " [" + r.status + "]" : "") + (r.err ? " " + r.err : "") + (!r.ok && r.snippet ? " :: " + r.snippet : ""));
      if (r.ok) return r.json;
    }
    return null;
  }
  function pick(row, re) { for (var k in row) if (re.test(k)) return row[k]; return undefined; }
  function N(x) { var n = Number(x); return isFinite(n) ? n : null; }
  function avg(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }

  // از هر ساختار JSON، همه‌ی اختیارها را بیرون می‌کشد (کلیدهای نامشخص: با شکل نام نماد شناسایی می‌شوند)
  function extractOptions(json, log) {
    var out = [], seen = {}, firstKeys = null;
    function addFrom(rec) {
      var found = false;
      for (var k in rec) {
        var v = rec[k];
        if (typeof v !== "string") continue;
        var o = OCC.parseOptionName(v);
        if (!o) continue;
        var m = k.match(/[_-]([CP])$/i), suf = m ? m[0] : "";
        var code = null;
        for (var kk in rec) {
          if (/^ins?code/i.test(kk) && (suf ? kk.slice(-suf.length).toLowerCase() === suf.toLowerCase() : !/[_-][CP]$/i.test(kk))) { code = String(rec[kk]); break; }
        }
        if (!code || !/^\d{6,}$/.test(code)) continue;
        if (seen[code]) { found = true; continue; }
        seen[code] = 1; found = true;
        o.insCode = code; o.name = v;
        out.push(o);
      }
      return found;
    }
    (function walk(x, depth) {
      if (depth > 6 || x === null || typeof x !== "object") return;
      if (Array.isArray(x)) { x.forEach(function (e) { walk(e, depth + 1); }); return; }
      if (!firstKeys) firstKeys = Object.keys(x).slice(0, 12).join(",");
      if (!addFrom(x)) for (var k in x) if (x[k] && typeof x[k] === "object") walk(x[k], depth + 1);
    })(json, 0);
    if (!out.length && firstKeys) log.push("ساختار ناشناخته‌ی بازار اختیار؛ کلیدهای اولین رکورد: " + firstKeys);
    return out;
  }

  async function listChain(base, log) {
    var nb = fa(base), list = [], src = "";
    var paths = ["Instrument/GetInstrumentOptionMarketWatch/0", "Instrument/GetInstrumentOptionMarketWatch/1"];
    for (var i = 0; i < paths.length && !list.length; i++) {
      var j = await api(paths[i], log);
      if (j) {
        list = extractOptions(j, log).filter(function (o) { return fa(o.base) === nb; });
        if (list.length) src = "دیده‌بان بازار اختیار";
      }
    }
    if (!list.length) {   // راه دوم: جستجوی نام
      var seen = {};
      for (var t = 0; t < 2; t++) {
        var q = (t === 0 ? "اختیارخ " : "اختیارف ") + base;
        var s = await api("Instrument/GetInstrumentSearch/" + encodeURIComponent(q), log);
        var arr = s && (s.instrumentSearch || s);
        if (Array.isArray(arr)) arr.forEach(function (it) {
          var code = String(it.insCode || "");
          if (!/^\d{6,}$/.test(code) || seen[code]) return;
          for (var k in it) {
            if (typeof it[k] !== "string") continue;
            var o = OCC.parseOptionName(it[k]);
            if (o && fa(o.base) === nb) { o.insCode = code; o.name = it[k]; seen[code] = 1; list.push(o); break; }
          }
        });
      }
      if (list.length) src = "جستجوی نام نماد";
    }
    return { list: list, src: src };
  }

  async function quoteOne(o, log) {
    var r = await Promise.all([api("BestLimits/" + o.insCode, log), api("ClosingPrice/GetClosingPriceDailyList/" + o.insCode + "/30", log)]);
    var bl = r[0], dl = r[1] && r[1].closingPriceDaily, q = { ask: null, bid: null, bidvol: null, askvol: null, vol_o: null, last: null };
    var rows = bl && (bl.bestLimits || bl.bestLimit);
    if (rows && rows.length) {
      var r1 = rows.filter(function (x) { return pick(x, /^number$/i) === 1; })[0] || rows[0];
      q.ask = N(pick(r1, /^pMeOf$/i)); q.bid = N(pick(r1, /^pMeDem$/i));
      q.bidvol = N(pick(r1, /^qTitMeDem$/i)); q.askvol = N(pick(r1, /^qTitMeOf$/i));
    }
    if (dl && dl.length) {
      dl = dl.slice().sort(function (a, b) { return b.dEven - a.dEven; });
      var vols = dl.map(function (x) { return N(x.qTotTran5J); }).filter(function (x) { return x > 0; }).slice(0, 20);
      q.vol_o = vols.length ? Math.round(avg(vols)) : 0;
      var lastRow = dl.filter(function (x) { return N(x.pClosing) > 0; })[0];
      if (lastRow) q.last = N(lastRow.pClosing);
    }
    return q;
  }

  async function pool(items, n, fn, onProg) {
    var i = 0, done = 0, res = new Array(items.length);
    async function worker() {
      while (i < items.length) {
        var k = i++;
        try { res[k] = await fn(items[k]); } catch (e) { res[k] = null; }
        done++; if (onProg) onProg(done, items.length);
      }
    }
    var ws = []; for (var w = 0; w < n; w++) ws.push(worker());
    await Promise.all(ws);
    return res;
  }

  var cache = {};
  // base: نماد پایه (مثل «فملی»)، S: قیمت سهم (برای حذف قیمت اعمال‌های بسیار دور)
  async function load(base, S, log, onProg, force) {
    var key = fa(base), hit = cache[key];
    if (!force && hit && Date.now() - hit.t < 120000) return hit.val;
    var L = await listChain(base, log), rep = [];
    var list = L.list;
    if (!list.length) return { rows: [], rep: [{ ok: false, t: "هیچ اختیاری برای «" + base + "» پیدا نشد (ساختار API شاید فرق دارد؛ «گزارش اشکال» را بزن)" }], src: "" };
    rep.push({ ok: true, t: list.length + " اختیار برای «" + base + "» پیدا شد (" + L.src + ")" });
    var alive = list.filter(function (o) { o.cal_days = OCC.daysUntil(o.jy, o.jm, o.jd); return o.cal_days > 0; });
    if (alive.length < list.length) rep.push({ ok: true, t: (list.length - alive.length) + " اختیار سررسیدگذشته کنار گذاشته شد" });
    if (S > 0) {
      var near = alive.filter(function (o) { return o.strike >= S * 0.5 && o.strike <= S * 1.6; });
      if (near.length < alive.length) rep.push({ ok: true, t: (alive.length - near.length) + " اختیار با قیمت اعمال بسیار دور از قیمت سهم (کمتر از ۵۰٪ یا بیش از ۱۶۰٪) بررسی نشد" });
      alive = near;
    }
    if (alive.length > 80) {
      alive.sort(function (a, b) { return Math.abs(Math.log(a.strike / S)) - Math.abs(Math.log(b.strike / S)); });
      rep.push({ ok: true, t: "فقط ۸۰ اختیار نزدیک‌تر به قیمت سهم بررسی شد" });
      alive = alive.slice(0, 80);
    }
    var qs = await pool(alive, 5, function (o) { return quoteOne(o, log); }, onProg);
    var rows = [], noq = 0;
    alive.forEach(function (o, i) {
      var q = qs[i];
      if (!q) { noq++; return; }
      rows.push(Object.assign({}, o, q));
    });
    if (noq) rep.push({ ok: false, t: "قیمت " + noq + " اختیار خوانده نشد" });
    rep.push({ ok: true, t: "قیمت و حجم " + rows.length + " اختیار خوانده شد" });
    var val = { rows: rows, rep: rep, src: L.src, at: Date.now() };
    cache[key] = { t: Date.now(), val: val };
    return val;
  }

  root.OptChain = { load: load, extractOptions: extractOptions };
  if (typeof module !== "undefined" && module.exports) module.exports = root.OptChain;
})(typeof self !== "undefined" ? self : this);
