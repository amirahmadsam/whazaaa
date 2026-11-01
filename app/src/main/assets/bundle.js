(function(){
if(window.__dbBundle)return;window.__dbBundle=true;
/* شبیه‌ساز chrome.storage و chrome.runtime.sendMessage روی پل بومی اپ اندروید.
   پل: window.__dbNative (با addWebMessageListener ساخته می‌شود) ← postMessage(string) و onmessage. */
(function () {
  if (window.__dbShim) return; window.__dbShim = true;
  var pending = {}, seq = 0, wired = false;

  function nat() {
    var n = window.__dbNative;
    if (n && !wired) {
      wired = true;
      n.onmessage = function (ev) {
        try {
          var m = JSON.parse(ev.data), cb = pending[m.id];
          if (cb) { delete pending[m.id]; cb(m.r); }
        } catch (e) {}
      };
    }
    return n;
  }
  function call(op, p, cb) {
    var id = ++seq, n = nat();
    if (!n) { setTimeout(function () { cb({ err: "پل اپ در دسترس نیست" }); }, 0); return; }
    pending[id] = cb;
    try { n.postMessage(JSON.stringify({ id: id, op: op, p: p })); }
    catch (e) { delete pending[id]; setTimeout(function () { cb({ err: String(e) }); }, 0); }
  }

  var chrome = window.chrome || (window.chrome = {});

  // ---- chrome.storage.local
  function keysOf(k) {
    if (k === null || k === undefined) return null;
    if (typeof k === "string") return [k];
    if (Array.isArray(k)) return k.slice();
    if (typeof k === "object") return Object.keys(k);
    return [];
  }
  function parse(s) { try { return JSON.parse(s); } catch (e) { return undefined; } }
  var local = {
    get: function (k, cb) {
      var ks = keysOf(k), defs = (k && typeof k === "object" && !Array.isArray(k)) ? k : null;
      call("sget", { keys: ks }, function (r) {
        var out = {}, items = (r && r.items) || {};
        if (defs) for (var d in defs) out[d] = defs[d];
        for (var key in items) { var v = parse(items[key]); if (v !== undefined) out[key] = v; }
        if (typeof cb === "function") try { cb(out); } catch (e) { console.error(e); }
      });
    },
    set: function (obj, cb) {
      var items = {};
      for (var k in obj) { var s = JSON.stringify(obj[k]); if (s !== undefined) items[k] = s; }
      call("sset", { items: items }, function () { if (typeof cb === "function") try { cb(); } catch (e) { console.error(e); } });
    },
    remove: function (k, cb) {
      call("sdel", { keys: keysOf(k) || [] }, function () { if (typeof cb === "function") try { cb(); } catch (e) {} });
    }
  };
  chrome.storage = chrome.storage || {};
  chrome.storage.local = local;
  chrome.storage.onChanged = { addListener: function () {}, removeListener: function () {} };

  // ---- chrome.runtime.sendMessage  (همان قالب پاسخ background.js افزونه)
  function textReply(r) {
    if (!r || r.err) return { ok: false, err: (r && r.err) || "بدون پاسخ" };
    var tx = r.text || "", j = null;
    try { j = JSON.parse(tx); } catch (e) {}
    return { ok: r.status >= 200 && r.status < 300 && j !== null, status: r.status, json: j, snippet: tx.slice(0, 120) };
  }
  chrome.runtime = chrome.runtime || {};
  chrome.runtime.lastError = undefined;
  chrome.runtime.sendMessage = function (msg, cb) {
    cb = typeof cb === "function" ? cb : function () {};
    var t = msg && msg.t;
    if (t === "fetch" || t === "codal") {
      call("http", { kind: t, url: String(msg.url || "") }, function (r) { cb(textReply(r)); });
    } else if (t === "codalbin") {
      call("httpbin", { url: String(msg.url || "") }, function (r) {
        if (!r || r.err) cb({ ok: false, err: (r && r.err) || "بدون پاسخ" });
        else if (r.status < 200 || r.status >= 300) cb({ ok: false, status: r.status });
        else cb({ ok: true, size: r.size, b64: r.b64 });
      });
    } else if (t === "mwpage") {
      call("mwpage", { timeout: msg.timeout || 70000 }, function (r) { cb(r || { ok: false, err: "بدون پاسخ" }); });
    } else {
      setTimeout(function () { cb(undefined); }, 0);
    }
  };
  chrome.runtime.getPlatformInfo = function (cb) { if (cb) cb({ os: "android" }); };
})();

;try{
/* اجرا در دنیای خود صفحه (MAIN): پاسخ‌های JSON سایت که فهرست بازار دارند را می‌گیرد و به افزونه می‌دهد.
   هیچ درخواستی نمی‌فرستد؛ فقط همان چیزی را که خود سایت دریافت می‌کند کپی می‌کند. */
(function () {
  if (window.__dbHook) return; window.__dbHook = true;
  var URL_RE = /marketwatch|GetClosingPriceAll|MarketWatchPlus|MarketWatchInit/i;
  function looksLikeMarket(txt) {
    if (!txt || txt.length < 20000) return false;
    var head = txt.slice(0, 4000);
    return /"insCode"/i.test(head) && /"(lva|lVal18AFC|l18)"/i.test(head);
  }
  function offer(url, txt) {
    try {
      if (!(URL_RE.test(url || "") || looksLikeMarket(txt))) return;
      if (!txt || txt.charAt(0) !== "{" && txt.charAt(0) !== "[") return;
      window.postMessage({ __dbMkt: { url: String(url).slice(0, 200), body: txt } }, "*");
    } catch (e) {}
  }
  try {
    var of = window.fetch;
    if (of) window.fetch = function () {
      var a = arguments, u = a[0] && a[0].url ? a[0].url : a[0];
      var p = of.apply(this, a);
      try { p.then(function (r) { try { r.clone().text().then(function (t) { offer(u, t); }).catch(function () {}); } catch (e) {} }).catch(function () {}); } catch (e) {}
      return p;
    };
  } catch (e) {}
  try {
    var oo = XMLHttpRequest.prototype.open, os = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__dbU = u; return oo.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      var x = this;
      x.addEventListener("load", function () { try { if (x.responseType === "" || x.responseType === "text") offer(x.__dbU, x.responseText); } catch (e) {} });
      return os.apply(this, arguments);
    };
  } catch (e) {}
})();

}catch(e){try{console.error('didehban:hook-main.js',e)}catch(_){}}

;try{
/* دنیای افزونه: پاسخ‌های گرفته‌شده توسط hook-main.js را (و در نبودشان جدول خود صفحه را) به‌عنوان «عکس بازار» ذخیره می‌کند
   تا تب «🔍 یافتن سهم» وقتی API مستقیم جواب نمی‌دهد از آن استفاده کند. */
(function () {
  if (window.__dbCap) return; window.__dbCap = true;
  var KEEP = ["insCode", "InsCode", "ins_code", "lva", "lVal18AFC", "l18", "symbol", "lval18afc", "lvc", "lVal30", "l30", "name",
    "pdv", "pDrCotVal", "pl", "last", "lastPrice", "pcl", "pClosing", "pc", "final", "closePrice", "py", "priceYesterday", "yesterday",
    "pf", "priceFirst", "open", "pmx", "priceMax", "max", "high", "pmn", "priceMin", "min", "low",
    "qTotTran5J", "qtj", "tvol", "volume", "vol", "qTotCap", "qtc", "tval", "value", "zTotTran", "ztt", "ntran", "count", "eps"];
  function findArr(j) {
    if (Array.isArray(j)) return j;
    if (!j || typeof j !== "object") return null;
    var pref = ["marketwatch", "marketWatch", "marketWatchList", "closingPriceAll", "data", "result"];
    for (var i = 0; i < pref.length; i++) if (Array.isArray(j[pref[i]])) return j[pref[i]];
    for (var k in j) if (Array.isArray(j[k]) && j[k].length > 50) return j[k];
    return null;
  }
  function save(arr, dom, url) {
    try {
      chrome.storage.local.set({ "mkt:snap": { at: Date.now(), dom: !!dom, url: url || "", from: location.href.slice(0, 120), arr: arr } });
    } catch (e) {}
  }
  var lastSaved = 0;
  window.addEventListener("message", function (e) {
    var d = e.data && e.data.__dbMkt; if (!d || typeof d.body !== "string") return;
    if (Date.now() - lastSaved < 20000) return;   // سایت هر چند ثانیه تازه می‌کند؛ هر ۲۰ ثانیه یک‌بار کافی است
    try {
      var arr = findArr(JSON.parse(d.body));
      if (!arr || arr.length < 100 || typeof arr[0] !== "object") return;
      if (!(arr[0].insCode || arr[0].InsCode || arr[0].ins_code)) return;
      var f0 = arr[0], hasPrice = !!(f0.pdv || f0.pcl || f0.pClosing || f0.pDrCotVal || f0.py || f0.priceYesterday);
      var slim = arr.slice(0, 4000).map(function (r) { var o = {}; KEEP.forEach(function (k) { if (r[k] !== undefined && r[k] !== null) o[k] = r[k]; }); return o; });
      lastSaved = Date.now(); save(slim, !hasPrice, d.url);
    } catch (err) {}
  });

  // ---- خواندن جدول صفحه‌ی دیده‌بان بازار (با اسکرول خودکار برای جدول‌های مجازی‌سازی‌شده)
  function toLatin(s) { return String(s).replace(/[۰-۹]/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹".indexOf(d); }).replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); }).replace(/[٬,،\s]/g, "").replace(/٫/g, "."); }
  function num(t) {
    var s = toLatin(t || ""), m = s.match(/^[-+]?\d+(\.\d+)?/); if (!m) return null;
    var v = parseFloat(m[0]), u = s.slice(m[0].length).toUpperCase();
    if (/^(B|میلیارد)/.test(u)) v *= 1e9; else if (/^(M|میلیون)/.test(u)) v *= 1e6; else if (/^(K|هزار)/.test(u)) v *= 1e3; else if (/^(T)/.test(u)) v *= 1e12;
    return isFinite(v) ? v : null;
  }
  function fixFa(s) { return String(s || "").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[\u200c\u200f\u200e]/g, " ").replace(/\s+/g, " ").trim(); }
  var HEAD = [["sym", /^نماد/], ["name", /^(نام|شرکت)/], ["last", /آخرین/], ["close", /پایانی/], ["val", /^ارزش(?!\s*بازار)/], ["vol", /^حجم(?!\s*مبنا)/], ["cnt", /^تعداد/], ["yest", /دیروز/]];
  function cellsOf(row) {
    var c = row.querySelectorAll(":scope > th, :scope > td, :scope > [role=cell], :scope > [role=gridcell], :scope > [role=columnheader]");
    if (c.length < 3) c = row.children;
    return Array.prototype.map.call(c, function (x) { return fixFa(x.innerText || x.textContent); });
  }
  var COLS = null, ACC = {};
  function scrapeVisible() {
    var rows = document.querySelectorAll("tr, [role=row]");
    for (var i = 0; i < rows.length; i++) {
      var cells = cellsOf(rows[i]); if (cells.length < 4) continue;
      if (!COLS) {
        var cm = {}, hit = 0;
        cells.forEach(function (t, k) { HEAD.forEach(function (h) { if (cm[h[0]] === undefined && h[1].test(t)) { cm[h[0]] = k; hit++; } }); });
        if (cm.sym !== undefined && hit >= 3) { COLS = cm; }
        continue;
      }
      var sym = fixFa(cells[COLS.sym]); if (!sym || sym.length > 22 || /^نماد/.test(sym)) continue;
      var a = rows[i].querySelector('a[href*="nstInfo/"], a[href*="i="]'), mm = a && a.getAttribute("href").match(/(?:nstInfo\/|[?&]i=)(\d{6,})/);
      var o = { insCode: mm ? mm[1] : "", lva: sym, lvc: COLS.name !== undefined ? cells[COLS.name] : "" };
      if (COLS.last !== undefined) o.pdv = num(cells[COLS.last]);
      if (COLS.close !== undefined) o.pcl = num(cells[COLS.close]);
      if (COLS.val !== undefined) o.qtc = num(cells[COLS.val]);
      if (COLS.vol !== undefined) o.qtj = num(cells[COLS.vol]);
      if (COLS.cnt !== undefined) o.ztt = num(cells[COLS.cnt]);
      if (COLS.yest !== undefined) o.py = num(cells[COLS.yest]);
      ACC[sym] = o;
    }
    // بدون سرستون شناخته‌شده: فقط لینک‌های نماد
    var as = document.querySelectorAll('a[href*="nstInfo/"]');
    for (var j = 0; j < as.length; j++) {
      var m2 = as[j].getAttribute("href").match(/nstInfo\/(\d{6,})/), t2 = fixFa(as[j].textContent);
      if (m2 && t2 && t2.length <= 22 && !ACC[t2]) ACC[t2] = { insCode: m2[1], lva: t2, lvc: "" };
    }
  }
  function scroller() {
    var best = null, bs = 0, all = document.querySelectorAll("div,section,main,table,tbody");
    for (var i = 0; i < all.length; i++) { var e = all[i], h = e.scrollHeight - e.clientHeight; if (h > 200 && e.clientHeight > 150) { var st = getComputedStyle(e).overflowY; if ((st === "auto" || st === "scroll" || e.tagName === "MAIN") && h > bs) { best = e; bs = h; } } }
    return best;
  }
  var isMW = /marketwatch/i.test(location.pathname + location.hash);
  window.addEventListener("message", function (e) {   // درخواست خواندن دوباره‌ی همین صفحه (از اسکرینر)
    if (e.data && e.data.__dbRescan && window.top === window) { ACC = {}; COLS = null; lastSaved = 0; runDomLoop(); }
  });
  function runDomLoop() {
    if (window.top !== window) return;
    var stable = 0, prev = 0, it = 0;
    var iv = setInterval(function () {
      it++;
      try { scrapeVisible(); } catch (e) {}
      var n = Object.keys(ACC).length;
      var sc = scroller();
      var atEnd = true;
      if (sc) { var before = sc.scrollTop; sc.scrollTop = before + Math.max(300, sc.clientHeight * 0.8); atEnd = sc.scrollTop === before; }
      else { var y = window.scrollY; window.scrollBy(0, Math.max(400, window.innerHeight * 0.8)); atEnd = window.scrollY === y; }
      stable = n === prev ? stable + 1 : 0; prev = n;
      if ((stable >= 5 && atEnd) || stable >= 12 || it >= 140) {
        clearInterval(iv);
        if (n >= 100 && Date.now() - lastSaved > 120000) save(Object.keys(ACC).map(function (k) { return ACC[k]; }), true, "dom-table");
      }
    }, 700);
  }
  if (isMW) { if (document.readyState === "complete") setTimeout(runDomLoop, 2500); else window.addEventListener("load", function () { setTimeout(runDomLoop, 2500); }); }
})();

}catch(e){try{console.error('didehban:market-capture.js',e)}catch(_){}}

function __dbIdle(){

;try{
/* موتور محاسبات چک‌لیست خرید سهام: تکنیکال + ریسک + اندازه معامله */
(function (root) {
  "use strict";

  // [key, label, default, kind]  kind: pct => ذخیره به صورت کسر، نمایش به درصد
  var SETTINGS_META = [
    ["lim", "دامنه نوسان روزانه سهم (٪)", 0.03, "pct"],
    ["fee_buy", "کارمزد خرید سهم (٪) ⚠ تقریبی", 0.0037, "pct"],
    ["fee_sell", "کارمزد + مالیات فروش سهم (٪) ⚠ تقریبی", 0.0088, "pct"],
    ["tstop", "خروج زمانی: اگر تا این تعداد روز معاملاتی حرکت نکرد", 15, "num"],
    ["hold", "افق بررسی تاریخی احتمال (روز معاملاتی)", 40, "num"],
    ["riskpct", "حداکثر درصد سرمایه در خطر هر معامله (٪)", 0.01, "pct"],
    ["maxpos", "حداکثر درصد سرمایه در یک سهم (٪)", 0.25, "pct"],
    ["rrmin", "حداقل نسبت سود به ریسک (برابر)", 2, "num"],
    ["margin", "حاشیه امن احتمال (٪)", 0.08, "pct"],
    ["minscore", "حداقل امتیاز تکنیکال (از ۱۰۰)", 55, "num"],
    ["maxrsi", "حداکثر RSI برای ورود (حالت روندی)", 72, "num"],
    ["maxext", "حداکثر فاصله بالای میانگین ۲۰ روزه (برابر ATR)", 2.5, "num"],
    ["minstopatr", "حداقل فاصله حد ضرر از قیمت ورود (برابر ATR)", 1.2, "num"],
    ["maxstop", "حداکثر فاصله حد ضرر از قیمت ورود (٪)", 0.1, "pct"],
    ["breakvol", "حداقل حجم نسبی برای شکست (برابر میانگین)", 1.5, "num"],
    ["minpower", "حداقل قدرت خریدار حقیقی (هشدار)", 1, "num"],
    ["minval", "حداقل ارزش معاملات روزانه (میلیارد ریال)", 50, "num"],
    ["maxspread", "حداکثر اسپرد دفتر سفارش (٪)", 0.015, "pct"],
    ["maxpart", "حداکثر سهم سفارش من از حجم روزانه (٪)", 0.01, "pct"],
    ["maxwarn", "حداکثر تعداد هشدار قبل از «فعلاً نخر»", 3, "num"],
  ];
  // [خیلی محتاط (۱), متعادل (۵), خیلی ریسک‌پذیر (۱۰)]
  var RISK_KEYS = {
    riskpct: [0.005, 0.01, 0.02], maxpos: [0.15, 0.25, 0.4], rrmin: [3, 2, 1.5], margin: [0.15, 0.08, 0.03],
    minscore: [68, 55, 42], maxrsi: [66, 72, 80], maxext: [1.5, 2.5, 3.5], minstopatr: [1.6, 1.2, 0.9],
    maxstop: [0.07, 0.1, 0.15], breakvol: [2, 1.5, 1.2], minpower: [1.3, 1, 0.7], minval: [150, 50, 15],
    maxspread: [0.008, 0.015, 0.03], maxpart: [0.005, 0.01, 0.02], maxwarn: [2, 3, 5],
  };
  var INT_KEYS = { minscore: 1, maxrsi: 1, minval: 1, maxwarn: 1 };
  function interp(arr, a) {
    a = Math.min(10, Math.max(1, a));
    if (a <= 5) return arr[0] + (arr[1] - arr[0]) * (a - 1) / 4;
    return arr[1] + (arr[2] - arr[1]) * (a - 5) / 5;
  }
  var DEFAULTS = {};
  SETTINGS_META.forEach(function (m) { DEFAULTS[m[0]] = m[2]; });
  DEFAULTS.risk = 5;
  function effective(user) {
    user = user || {};
    var st = Object.assign({}, DEFAULTS, user);
    var a = Number(st.risk);
    if (!isFinite(a)) a = 5;
    st.risk = Math.min(10, Math.max(1, a));
    Object.keys(RISK_KEYS).forEach(function (k) {
      if (user[k] === undefined || user[k] === null) {
        var v = interp(RISK_KEYS[k], st.risk);
        st[k] = INT_KEYS[k] ? Math.round(v) : Math.round(v * 10000) / 10000;
      }
    });
    return st;
  }

  function num(x) { if (x === null || x === undefined || x === "") return null; var n = Number(x); return isFinite(n) ? n : null; }
  function pc(x, d) { return (x * 100).toFixed(d === undefined ? 0 : d) + "٪"; }
  function f0(x) { return Math.round(x).toLocaleString("en-US"); }
  function has() {
    for (var i = 0; i < arguments.length; i++) if (arguments[i] === null || arguments[i] === undefined || arguments[i] === "" || (typeof arguments[i] === "number" && !isFinite(arguments[i]))) return false;
    return true;
  }
  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }

  // ================= اندیکاتورها =================
  function smaAt(a, n, end) {
    end = end === undefined ? a.length - 1 : end;
    if (end - n + 1 < 0) return null;
    var s = 0;
    for (var i = end - n + 1; i <= end; i++) s += a[i];
    return s / n;
  }
  function emaSeries(a, n) {
    var out = new Array(a.length).fill(null);
    if (a.length < n) return out;
    var k = 2 / (n + 1), e = 0, i;
    for (i = 0; i < n; i++) e += a[i];
    e /= n; out[n - 1] = e;
    for (i = n; i < a.length; i++) { e = a[i] * k + e * (1 - k); out[i] = e; }
    return out;
  }
  function rsiLast(c, n) {
    if (c.length < n + 1) return null;
    var g = 0, l = 0, i, d;
    for (i = 1; i <= n; i++) { d = c[i] - c[i - 1]; if (d >= 0) g += d; else l -= d; }
    g /= n; l /= n;
    for (i = n + 1; i < c.length; i++) { d = c[i] - c[i - 1]; g = (g * (n - 1) + (d > 0 ? d : 0)) / n; l = (l * (n - 1) + (d < 0 ? -d : 0)) / n; }
    return l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  function atrLast(bars, n) {
    if (bars.length < n + 1) return null;
    var trs = [], i;
    for (i = 1; i < bars.length; i++) {
      var h = bars[i].h, l = bars[i].l, pcv = bars[i - 1].c;
      trs.push(Math.max(h - l, Math.abs(h - pcv), Math.abs(l - pcv)));
    }
    var a = mean(trs.slice(0, n));
    for (i = n; i < trs.length; i++) a = (a * (n - 1) + trs[i]) / n;
    return a;
  }
  function macdLast(c) {
    var e12 = emaSeries(c, 12), e26 = emaSeries(c, 26), line = [];
    for (var i = 0; i < c.length; i++) if (e12[i] !== null && e26[i] !== null) line.push(e12[i] - e26[i]);
    if (line.length < 12) return null;
    var sig = emaSeries(line, 9), k = line.length - 1;
    if (sig[k] === null || sig[k - 1] === null) return null;
    return { line: line[k], sig: sig[k], hist: line[k] - sig[k], histPrev: line[k - 1] - sig[k - 1] };
  }
  // نقطه‌های چرخش (fractal) برای حمایت و مقاومت
  function swings(bars, k, lookback) {
    var n = bars.length, start = Math.max(k, n - lookback), hi = [], lo = [], i, j;
    for (i = start; i < n - k; i++) {
      var isH = true, isL = true;
      for (j = 1; j <= k; j++) {
        if (!(bars[i].h > bars[i - j].h && bars[i].h >= bars[i + j].h)) isH = false;
        if (!(bars[i].l < bars[i - j].l && bars[i].l <= bars[i + j].l)) isL = false;
      }
      if (isH) hi.push(bars[i].h);
      if (isL) lo.push(bars[i].l);
    }
    return { highs: hi, lows: lo };
  }

  function tech(an, S, st) {
    var bars = an && an.bars;
    if (!bars || bars.length < 30) return null;
    var n = bars.length, last = n - 1;
    var c = bars.map(function (b) { return b.c; });
    var px = S > 0 ? S : c[last];
    var T = { n: n, px: px, c: c[last] };
    T.sma20 = smaAt(c, 20); T.sma50 = smaAt(c, 50); T.sma200 = n >= 200 ? smaAt(c, 200) : null;
    var s50p = n >= 60 ? smaAt(c, 50, last - 10) : null;
    T.slope50 = (T.sma50 !== null && s50p) ? T.sma50 / s50p - 1 : null;
    T.rsi = rsiLast(c, 14);
    T.macd = macdLast(c);
    T.atr = atrLast(bars, 14);
    T.atrp = T.atr !== null ? T.atr / px : null;
    T.roc20 = n > 20 ? c[last] / c[last - 20] - 1 : null;
    T.roc60 = n > 60 ? c[last] / c[last - 60] - 1 : null;
    var m20 = smaAt(c, 20), sd = 0, i;
    if (m20 !== null) { for (i = n - 20; i < n; i++) sd += (c[i] - m20) * (c[i] - m20); sd = Math.sqrt(sd / 20); T.bbpos = sd > 0 ? (c[last] - (m20 - 2 * sd)) / (4 * sd) : 0.5; }
    var win = bars.slice(-Math.min(250, n));
    T.hh52 = Math.max.apply(null, win.map(function (b) { return b.h; }));
    T.ll52 = Math.min.apply(null, win.map(function (b) { return b.l; }));
    T.dHigh = px / T.hh52 - 1;
    var prior = bars.slice(0, n - 1);
    var p20 = prior.slice(-20), p60 = prior.slice(-60);
    T.hh20p = Math.max.apply(null, p20.map(function (b) { return b.h; }));
    T.ll20p = Math.min.apply(null, p20.map(function (b) { return b.l; }));
    T.hh60p = Math.max.apply(null, p60.map(function (b) { return b.h; }));
    T.ll60p = Math.min.apply(null, p60.map(function (b) { return b.l; }));
    T.hh20 = Math.max.apply(null, bars.slice(-20).map(function (b) { return b.h; }));
    var vavg = mean(p20.map(function (b) { return b.v; }));
    T.volratio = vavg > 0 ? bars[last].v / vavg : null;
    var up = 0, dn = 0;
    for (i = n - 20; i < n; i++) { if (i < 1) continue; if (c[i] >= c[i - 1]) up += bars[i].v; else dn += bars[i].v; }
    T.udv = dn > 0 ? up / dn : null;
    var lb = bars[last];
    T.closeStr = lb.h > lb.l ? (lb.c - lb.l) / (lb.h - lb.l) : null;
    T.upClose = n > 1 ? c[last] > c[last - 1] : null;
    T.ext = (T.atr > 0 && T.sma20 !== null) ? (px - T.sma20) / T.atr : null;
    T.pbDepth = T.atr > 0 ? (T.hh20 - px) / T.atr : null;
    var sw = swings(bars, 3, 160);
    T.sw = sw;
    // روند
    var strong = T.sma50 !== null && px > T.sma50 && (T.sma200 !== null ? T.sma50 > T.sma200 : (T.sma20 > T.sma50)) && T.slope50 !== null && T.slope50 > 0;
    var weak = T.sma50 !== null && px < T.sma50 && T.slope50 !== null && T.slope50 < 0 && (T.sma200 === null || px < T.sma200);
    T.trendTxt = strong ? "صعودی قوی" : (T.sma50 !== null && px > T.sma50 && (T.slope50 === null || T.slope50 >= 0)) ? "صعودی" : weak ? "نزولی" : "خنثی / نامشخص";
    T.power = an.power === undefined ? null : an.power;
    T.netreal = an.netreal === undefined ? null : an.netreal;
    // امتیاز تکنیکال
    var pts = 0, mx = 0, parts = { trend: [0, 0], mom: [0, 0], flow: [0, 0], pos: [0, 0] };
    function add(g, cond, p) { if (cond === null || cond === undefined) return; parts[g][1] += p; mx += p; if (cond) { parts[g][0] += p; pts += p; } }
    function addv(g, v, p, max) { parts[g][1] += max; mx += max; parts[g][0] += v; pts += v; }
    add("trend", T.sma20 !== null ? px > T.sma20 : null, 6);
    add("trend", T.sma50 !== null ? px > T.sma50 : null, 8);
    add("trend", (T.sma20 !== null && T.sma50 !== null) ? T.sma20 > T.sma50 : null, 6);
    add("trend", T.sma200 !== null ? px > T.sma200 : null, 6);
    add("trend", (T.sma50 !== null && T.sma200 !== null) ? T.sma50 > T.sma200 : null, 5);
    add("trend", T.slope50 !== null ? T.slope50 > 0 : null, 4);
    if (T.rsi !== null) { var r = T.rsi; addv("mom", (r >= 50 && r <= 70) ? 8 : (r >= 40 && r < 50) ? 5 : (r > 70 && r <= 80) ? 4 : (r >= 30 && r < 40) ? 2 : 0, 0, 8); }
    if (T.macd) { add("mom", T.macd.hist > 0, 6); add("mom", T.macd.line > 0, 3); }
    add("mom", T.roc20 !== null ? T.roc20 > 0 : null, 4);
    add("mom", T.roc60 !== null ? T.roc60 > 0 : null, 4);
    if (T.udv !== null) addv("flow", T.udv > 1.2 ? 6 : T.udv > 1 ? 3 : 0, 0, 6);
    add("flow", T.volratio !== null ? T.volratio >= 1 : null, 3);
    if (T.power !== null) addv("flow", T.power >= 1.2 ? 6 : T.power >= 1 ? 3 : 0, 0, 6);
    add("flow", T.netreal !== null ? T.netreal > 0 : null, 5);
    addv("pos", T.dHigh >= -0.05 ? 8 : T.dHigh >= -0.15 ? 5 : T.dHigh >= -0.25 ? 2 : 0, 0, 8);
    add("pos", T.ext !== null ? T.ext <= (st ? st.maxext : 2.5) : null, 6);
    add("pos", T.bbpos !== undefined ? (T.bbpos >= 0.2 && T.bbpos <= 0.95) : null, 3);
    add("pos", T.atrp !== null ? T.atrp <= 0.06 : null, 3);
    T.score = mx > 0 ? Math.round(pts / mx * 100) : null;
    T.parts = {};
    Object.keys(parts).forEach(function (g) { T.parts[g] = parts[g][1] > 0 ? Math.round(parts[g][0] / parts[g][1] * 100) : null; });
    return T;
  }

  // احتمال تاریخی: در سابقه خود سهم، با همان درصد هدف و حد ضرر، کدام زودتر لمس شده؟
  function pEmpFor(bars, upPct, dnPct, hold) {
    if (!bars || bars.length < 60 || !(upPct > 0) || !(dnPct > 0)) return null;
    var ups = 0, dns = 0, n = bars.length;
    for (var i = 0; i < n - 1; i++) {
      var base = bars[i].c, up = base * (1 + upPct), dn = base * (1 - dnPct);
      for (var j = i + 1; j <= Math.min(i + hold, n - 1); j++) {
        var hitU = bars[j].h >= up, hitD = bars[j].l <= dn;
        if (hitD) { dns++; break; }       // اگر هر دو در یک روز لمس شد، محافظه‌کارانه حد ضرر
        if (hitU) { ups++; break; }
      }
    }
    if (ups + dns < 20) return null;
    return { p: ups / (ups + dns), n: ups + dns };
  }

  // ================= طرح معامله: ورود، حد ضرر، هدف =================
  function makePlan(mode, inp, st, T, S) {
    var E = num(inp.entry) !== null && num(inp.entry) > 0 ? num(inp.entry) : S;
    if (!has(E) || E <= 0) return null;
    var atr = T && T.atr > 0 ? T.atr : null;
    var P = { E: E, atr: atr, stop: null, stopSrc: "", target: null, targetSrc: "", target2: null, support: null, resistance: null, level: null, valid: false };
    var ut = num(inp.stop), ug = num(inp.target);
    var sups = T ? T.sw.lows.filter(function (x) { return x < E * 0.995; }) : [];
    var minRoom = Math.max(E * 0.005, atr || 0);   // مقاومت نزدیک‌تر از ۱ ATR نویز است، نه هدف
    var ress = T ? T.sw.highs.filter(function (x) { return x > E + minRoom; }).sort(function (a, b) { return a - b; }) : [];
    P.support = sups.length ? Math.max.apply(null, sups) : null;
    P.resistance = ress.length ? ress[0] : null;
    P.res2 = ress.length > 1 ? ress[1] : (T && T.hh52 > E * 1.01 ? T.hh52 : null);
    if (T) {
      P.level = (Math.abs(T.px / T.hh60p - 1) < 0.06) ? T.hh60p : T.hh20p;
      P.levelName = P.level === T.hh60p ? "سقف ۶۰ روزه" : "سقف ۲۰ روزه";
    }
    // حد ضرر
    if (ut !== null && ut > 0 && ut < E) { P.stop = ut; P.stopSrc = "حد ضرر خودت"; }
    else if (atr) {
      var minD = st.minstopatr * atr;
      if (P.support !== null && E - P.support >= minD && E - P.support <= 4 * atr) { P.stop = P.support - 0.25 * atr; P.stopSrc = "زیر حمایت (" + f0(P.support) + ") منهای ۰٫۲۵ ATR"; }
      else { P.stop = E - 2 * atr; P.stopSrc = "۲ برابر ATR زیر ورود"; }
    }
    // هدف: اول = مقاومت بعدی؛ دوم = مقاومت پس از آن. سود/ریسک با میانگین دو هدف سنجیده می‌شود
    // چون برنامه خروج این است که نیمی از پوزیشن در هدف اول و نیمی در هدف دوم فروخته شود
    var t1 = null;
    if (ug !== null && ug > E) { t1 = ug; P.targetSrc = "هدف خودت"; }
    else if (P.resistance !== null) { t1 = P.resistance; P.targetSrc = "مقاومت بعدی"; }
    else if (T && atr) { t1 = E + Math.max(0.5 * (T.hh60p - T.ll60p), 6 * atr); P.targetSrc = "حرکت اندازه‌گیری‌شده (نیمی از دامنه ۶۰ روزه یا ۶ ATR)"; }
    P.target1 = t1;
    P.target2 = (t1 !== null && P.res2 !== null && P.res2 > t1 * 1.005) ? P.res2 : null;
    P.target = t1;
    if (t1 !== null && P.stop !== null && P.stop < E && P.target2 !== null && !(ug !== null && ug > E)) {
      P.target = (t1 + Math.min(P.target2, E + 4 * (E - P.stop))) / 2;
      P.targetSrc = "میانگین هدف اول و دوم (نیمی از پوزیشن در هر کدام)";
    }
    P.valid = P.stop !== null && P.target !== null && P.stop < E && P.target > E;
    return P;
  }
  function rrOf(E, stop, target, st) {
    var win = target * (1 - st.fee_sell) - E * (1 + st.fee_buy);
    var loss = E * (1 + st.fee_buy) - stop * (1 - st.fee_sell);
    return loss > 0 ? { rr: win / loss, win: win, loss: loss } : null;
  }

  var MODE_FIT = { trend: "روندی", pull: "اصلاح", "break": "شکست" };

  // ================= ارزیابی =================
  function evaluate(mode, inp, userSt, an) {
    var st = effective(userSt);
    var I = {};
    ["capital", "S", "entry", "val_u", "vol_a", "ask", "bid", "pe", "pe_sec", "stop", "target", "p", "qty"].forEach(function (k) { I[k] = num(inp[k]); });
    var Y = function (k) { return inp[k] || ""; };
    var R = {}, rows = [];
    function row(step, key, label, v, fmt, help) { R[key] = v; rows.push({ step: step, key: key, label: label, v: v, fmt: fmt, help: help || "" }); }
    var steps = [];
    function step(n, missing, hard, warn) {
      var status;
      if (missing) { hard = []; warn = []; status = "⏳"; }
      else if (hard.length) status = "❌";
      else if (warn.length) status = "⚠";
      else status = "✅";
      steps[n] = { n: n, status: status, missing: missing, hard: hard, warn: warn };
    }
    var S = I.S, fb = st.fee_buy, fs = st.fee_sell;
    var T = tech(an, S, st);
    var plan = has(S) ? makePlan(mode, inp, st, T, S) : null;
    var E = plan ? plan.E : null;

    // ---------- مرحله ۰
    row(0, "E", "قیمت ورود مورد استفاده (ریال)", E, "money", "اگر قیمت ورود وارد نکنی، آخرین معامله استفاده می‌شود");
    if (T) row(0, "chg", "تغییر نسبت به پایانی دیروز", T.n > 1 ? T.px / (an.bars[T.n - 2].c) - 1 : null, "pct1");

    // ---------- مرحله ۱: وضعیت سهم
    var m1 = !(Y("q_thesis") && Y("q_halt") && Y("q_event") && Y("q_market") && Y("q_fund"));
    var h1 = [], w1 = [];
    var perel = has(I.pe, I.pe_sec) && I.pe_sec > 0 ? I.pe / I.pe_sec : null;
    row(1, "pe", "P/E سهم", I.pe, "ratio1");
    row(1, "pe_sec", "P/E صنعت", I.pe_sec, "ratio1");
    row(1, "perel", "P/E سهم نسبت به صنعت (برابر)", perel, "ratio2", "بالاتر از ۱ = گران‌تر از میانگین صنعت");
    if (!m1) {
      if (Y("q_thesis") === "خیر") h1.push("دلیل مشخصی برای خرید این سهم نداری؛ بدون دلیل نخر");
      if (Y("q_halt") === "خیر") h1.push("سهم الان بسته یا متوقف است");
      if (Y("q_event") === "بله") w1.push("تا افق نگهداری‌ات رویداد مهم داری (مجمع، تقسیم سود، افزایش سرمایه)؛ تاریخ و اثر قیمتی‌اش را بررسی کن");
      if (Y("q_market") === "خیر") w1.push("روند کلی بازار یا صنعت منفی است؛ سهم‌های خوب هم در بازار نزولی معمولاً با بازار می‌ریزند");
      if (Y("q_fund") === "خیر") w1.push("از نظر بنیادی مشکل داری (سودآوری، بدهی، گزارش‌ها)؛ فقط با حد ضرر سخت‌گیرانه");
      if (I.pe !== null && I.pe < 0) w1.push("P/E منفی است (شرکت زیان‌ده)");
      else if (perel !== null && perel > 1.5) w1.push("P/E سهم " + perel.toFixed(1) + " برابر صنعت است؛ نسبت به صنعت گران است");
    }
    step(1, m1, h1, w1);

    // ---------- مرحله ۲: نقدشوندگی
    var spread = (has(I.ask, I.bid) && I.ask > 0 && I.bid > 0) ? (I.ask - I.bid) / I.ask : null;
    row(2, "val_u", "میانگین ارزش معاملات روزانه (میلیارد ریال)", I.val_u, "money");
    row(2, "vol_a", "میانگین حجم روزانه (سهم)", I.vol_a, "money");
    row(2, "spread", "اسپرد دفتر سفارش", spread, "pct2", "فاصله بهترین خرید و فروش؛ هزینه ورود و خروج سریع");
    var m2 = !(has(I.val_u) && Y("q_sq") && Y("q_bq"));
    var h2 = [], w2 = [];
    if (!m2) {
      if (Y("q_sq") === "بله") h2.push("سهم در صف فروش است؛ ورود به صف فروش یعنی گرفتن چاقوی در حال سقوط و خروج ممکن نیست");
      if (I.val_u < st.minval) h2.push("ارزش معاملات روزانه (" + f0(I.val_u) + " میلیارد ریال) کمتر از حداقل (" + st.minval + ") است");
      if (spread !== null && spread > st.maxspread) h2.push("اسپرد " + pc(spread, 2) + " بیشتر از حد مجاز (" + pc(st.maxspread, 2) + ") است");
      if (Y("q_bq") === "بله") w2.push("سهم در صف خرید قفل است؛ فقط با ایستادن در صف می‌توانی بخری و نوبتت ممکن است نرسد");
    }
    step(2, m2, h2, w2);

    // ---------- مرحله ۳: تکنیکال
    var m3 = !(T && has(S));
    var h3 = [], w3 = [];
    var Lvl = plan ? plan.level : null;
    var LvlDist = (has(Lvl, S) && T && T.atr > 0) ? (S - Lvl) / T.atr : null;
    if (T) {
      row(3, "trend", "روند", T.trendTxt, "text", "بر پایه میانگین‌های ۲۰ و ۵۰ و ۲۰۰ روزه و شیب میانگین ۵۰");
      row(3, "score", "امتیاز تکنیکال (از ۱۰۰)", T.score, "int", "ترکیب روند، مومنتوم، جریان پول و موقعیت قیمت");
      row(3, "sTrend", "  امتیاز روند (٪)", T.parts.trend, "int");
      row(3, "sMom", "  امتیاز مومنتوم (٪)", T.parts.mom, "int");
      row(3, "sFlow", "  امتیاز جریان پول و حجم (٪)", T.parts.flow, "int");
      row(3, "sPos", "  امتیاز موقعیت قیمت (٪)", T.parts.pos, "int");
      row(3, "sma20", "میانگین ۲۰ روزه (ریال)", T.sma20, "money");
      row(3, "sma50", "میانگین ۵۰ روزه (ریال)", T.sma50, "money");
      row(3, "sma200", "میانگین ۲۰۰ روزه (ریال)", T.sma200, "money", T.sma200 === null ? "سابقه کمتر از ۲۰۰ روز بود" : "");
      row(3, "rsi", "RSI (۱۴)", T.rsi, "int", "بالای ۷۰ داغ، زیر ۳۰ ضعیف");
      row(3, "macd", "هیستوگرام MACD", T.macd ? T.macd.hist : null, "ratio2", "مثبت = مومنتوم صعودی");
      row(3, "roc20", "بازده ۲۰ روز اخیر", T.roc20, "pct1");
      row(3, "atrp", "نوسان روزانه (ATR به درصد قیمت)", T.atrp, "pct2", "دامنه معمول حرکت یک روز");
      row(3, "dHigh", "فاصله از سقف یک‌ساله", T.dHigh, "pct1");
      row(3, "ext", "فاصله از میانگین ۲۰ روزه (برابر ATR)", T.ext, "ratio1", "هرچه بیشتر، ورود دورتر از «قیمت منصفانه کوتاه‌مدت»");
      row(3, "volratio", "حجم امروز نسبت به میانگین ۲۰ روز (برابر)", T.volratio, "ratio1", "اگر بازار باز است، حجم امروز هنوز کامل نیست");
      row(3, "udv", "حجم روزهای صعودی به نزولی (۲۰ روز)", T.udv, "ratio2", "بیش از ۱ = حجم بیشتر در روزهای مثبت");
      if (T.power !== null) row(3, "power", "قدرت خریدار حقیقی (بیش از ۱ = خریدار قوی‌تر)", T.power, "ratio2");
      if (T.netreal !== null) row(3, "netreal", "خالص خرید حقیقی نسبت به کل حجم امروز", T.netreal, "pct1");
      if (mode === "pull") row(3, "pbDepth", "عمق اصلاح از سقف ۲۰ روزه (برابر ATR)", T.pbDepth, "ratio1");
      if (mode === "break") { row(3, "level", "سطح شکست (" + (plan ? plan.levelName : "") + ")", Lvl, "money"); row(3, "levDist", "فاصله قیمت از سطح شکست (برابر ATR)", LvlDist, "ratio1", "منفی = هنوز زیر سطح"); }
    }
    if (!m3) {
      var minsc = mode === "pull" ? st.minscore - 15 : mode === "break" ? st.minscore - 5 : st.minscore;
      if (T.score !== null && T.score < minsc) h3.push("امتیاز تکنیکال " + T.score + " از ۱۰۰ کمتر از حداقل این حالت (" + minsc + ") است");
      if (T.n < 200) w3.push("سابقه فقط " + T.n + " روز است؛ میانگین ۲۰۰ روزه و بخشی از امتیاز محاسبه نشد");
      if (mode === "trend") {
        if (T.sma50 !== null && T.px < T.sma50) h3.push("قیمت زیر میانگین ۵۰ روزه است؛ روند صعودی نیست (برای این حالت لازم است)");
        if (T.rsi !== null && T.rsi > st.maxrsi) h3.push("RSI " + T.rsi.toFixed(0) + " از حد مجاز (" + st.maxrsi + ") بالاتر است؛ خرید در داغی بازار");
        if (T.ext !== null && T.ext > st.maxext + 1.5) h3.push("قیمت " + T.ext.toFixed(1) + " برابر ATR بالای میانگین ۲۰ روزه است؛ بسیار دور از قیمت منصفانه کوتاه‌مدت");
        else if (T.ext !== null && T.ext > st.maxext) w3.push("قیمت " + T.ext.toFixed(1) + " برابر ATR بالای میانگین ۲۰ روزه است؛ منتظر اصلاح کوتاه بمان");
        if (T.slope50 !== null && T.slope50 < 0) w3.push("شیب میانگین ۵۰ روزه رو به پایین است");
        if (T.sma200 !== null && T.px < T.sma200) w3.push("قیمت زیر میانگین ۲۰۰ روزه است");
        if (T.macd && T.macd.hist < 0) w3.push("مومنتوم (MACD) منفی است");
      } else if (mode === "pull") {
        if (T.sma200 !== null && T.px < T.sma200) h3.push("قیمت زیر میانگین ۲۰۰ روزه است؛ روند اصلی صعودی نیست و اصلاح نمی‌تواند خرید باشد");
        if (T.slope50 !== null && T.slope50 < 0) h3.push("شیب میانگین ۵۰ روزه نزولی است؛ این اصلاح نیست، شروع ریزش است");
        if (T.sma50 !== null && T.px < T.sma50 * 0.97) h3.push("قیمت بیش از ۳٪ زیر میانگین ۵۰ روزه شکسته است؛ ناحیه حمایت از دست رفته");
        if (T.pbDepth !== null && T.pbDepth < 1) h3.push("هنوز اصلاحی دیده نمی‌شود (فقط " + T.pbDepth.toFixed(1) + " ATR زیر سقف ۲۰ روزه)");
        if (T.rsi !== null && T.rsi > 58) h3.push("RSI " + T.rsi.toFixed(0) + " هنوز بالاست؛ اصلاح کامل نشده");
        if (T.rsi !== null && T.rsi < 30) w3.push("RSI زیر ۳۰ است؛ شاید اصلاح نیست و ضعف جدی است");
        if (T.upClose === false && T.closeStr !== null && T.closeStr < 0.5) w3.push("هنوز نشانه برگشت (بسته شدن بالاتر از دیروز) دیده نمی‌شود");
      } else if (mode === "break") {
        if (T.sma50 !== null && T.px < T.sma50) h3.push("قیمت زیر میانگین ۵۰ روزه است؛ شکستِ خلاف روند میان‌مدت قابل اعتماد نیست");
        else if (T.sma200 !== null && T.px < T.sma200) w3.push("قیمت هنوز زیر میانگین ۲۰۰ روزه است؛ شکست از پایه‌ی ضعیف‌تر شروع شده");
        if (has(Lvl) && T.px < Lvl * 0.99) h3.push("قیمت هنوز به سطح شکست (" + f0(Lvl) + ") نرسیده است");
        if (LvlDist !== null && LvlDist > 2.5) h3.push("قیمت " + LvlDist.toFixed(1) + " برابر ATR بالای سطح شکست است؛ شکست دیر شده و تعقیب قیمت است");
        else if (LvlDist !== null && LvlDist > 1) w3.push("قیمت " + LvlDist.toFixed(1) + " برابر ATR بالای سطح شکست است؛ ورود کمی دیر است");
        if (T.volratio !== null && T.volratio < 1) h3.push("حجم شکست از میانگین هم کمتر است؛ شکست بی‌پشتوانه معمولاً شکست می‌خورد");
        else if (T.volratio !== null && T.volratio < st.breakvol) w3.push("حجم " + T.volratio.toFixed(1) + " برابر میانگین است؛ برای تأیید شکست حداقل " + st.breakvol + " برابر لازم است");
        if (T.rsi !== null && T.rsi > st.maxrsi + 8) h3.push("RSI " + T.rsi.toFixed(0) + " بیش از حد داغ است");
        if (T.closeStr !== null && T.closeStr < 0.6) w3.push("قیمت پایانی در بخش پایینی دامنه روز بسته شده؛ فشار فروش وجود دارد");
      }
      if (T.power !== null && T.power < st.minpower) w3.push("قدرت خریدار حقیقی " + T.power.toFixed(2) + " کمتر از " + st.minpower + " است");
      if (T.netreal !== null && T.netreal < -0.1) w3.push("حقیقی‌ها خالص فروشنده‌اند (" + pc(T.netreal, 0) + " حجم)");
    }
    step(3, m3, h3, w3);

    // ---------- مرحله ۴: سود و زیان
    var rrr = (plan && plan.valid) ? rrOf(E, plan.stop, plan.target, st) : null;
    var rr = rrr ? rrr.rr : null;
    var stopPct = (plan && plan.valid) ? (E - plan.stop) / E : null;
    var tgtPct = (plan && plan.valid) ? plan.target / E - 1 : null;
    var stopAtr = (plan && plan.valid && plan.atr) ? (E - plan.stop) / plan.atr : null;
    var preq = rrr ? rrr.loss / (rrr.loss + rrr.win) : null;
    var pModel = (plan && plan.valid) ? Math.log(E / plan.stop) / Math.log(plan.target / plan.stop) : null;
    var emp = (plan && plan.valid && an && an.bars) ? pEmpFor(an.bars, tgtPct, stopPct, st.hold) : null;
    var pEmp = emp ? emp.p : null;
    var pSug = pEmp !== null ? pEmp : pModel;
    var ev = has(I.p, rr) ? I.p * rr - (1 - I.p) : null;
    row(4, "stop", "حد ضرر (ریال)", plan ? plan.stop : null, "money", plan ? plan.stopSrc : "");
    row(4, "stopPct", "فاصله حد ضرر از ورود", stopPct, "pct1");
    row(4, "stopAtr", "فاصله حد ضرر (برابر ATR)", stopAtr, "ratio1", "کمتر از ~۱ یعنی در نویز عادی روز خورده می‌شود");
    row(4, "target1", "هدف اول (ریال)", plan ? plan.target1 : null, "money", "نزدیک‌ترین مقاومت معتبر (دورتر از ۱ ATR) یا هدف خودت");
    row(4, "target2", "هدف دوم (ریال)", plan ? plan.target2 : null, "money");
    row(4, "target", "هدف مؤثر برای سود به ریسک (ریال)", plan ? plan.target : null, "money", plan ? plan.targetSrc : "");
    row(4, "tgtPct", "فاصله هدف مؤثر از ورود", tgtPct, "pct1");
    row(4, "rr", "نسبت سود به ریسک (پس از کارمزد)", rr, "ratio1", "سود تا هدف ÷ زیان تا حد ضرر");
    row(4, "preq", "حداقل احتمال لازم برای سر به سر", preq, "pct0");
    row(4, "ev", "امید ریاضی هر معامله (بر حسب ریسک)", ev, "ratio2", "با احتمال خودت؛ مثبت = ارزش‌دار (۱ = برابر کل ریسک)");
    row(4, "pModel", "احتمال آماری رسیدن به هدف پیش از حد ضرر (مدل)", pModel, "pct0", "بدون فرض روند؛ از فاصله‌ها");
    row(4, "pEmp", "احتمال تاریخی (در سابقه خود سهم)", pEmp, "pct0", emp ? ("روی " + emp.n + " نمونه با همان درصد هدف و حد ضرر") : "نمونه کافی نبود");
    row(4, "pSug", "احتمال مرجع (تاریخی؛ اگر نبود مدل)", pSug, "pct0", "فقط مرجع؛ سابقه‌ی صعودی سهم آن را بالا می‌برد. تصمیم با خودت است");
    var m4 = !(plan && plan.valid && has(I.p));
    var h4 = [], w4 = [];
    if (!m4) {
      if (rr <= 0) h4.push("تا هدف (" + f0(plan.target) + ") بعد از کارمزد خرید و فروش سودی نمی‌ماند؛ جای حرکت بالا کم است");
      else if (rr < st.rrmin) h4.push("نسبت سود به ریسک " + rr.toFixed(1) + " برابر است؛ حداقل " + st.rrmin + " برابر لازم است (تا " + (plan.targetSrc || "هدف") + ")");
      if (rr > 0 && I.p < preq + st.margin) h4.push("احتمال تخمینی تو (" + pc(I.p, 0) + ") کمتر از حداقل لازم (" + pc(Math.min(1, preq + st.margin), 0) + ") است؛ سر به سر ریاضی " + pc(preq, 0) + " به‌علاوه حاشیه امن");
      if (stopPct > st.maxstop) h4.push("حد ضرر " + pc(stopPct, 1) + " با قیمت ورود فاصله دارد؛ بیشتر از حداکثر مجاز (" + pc(st.maxstop, 0) + ")");
      if (stopAtr !== null && stopAtr < st.minstopatr) h4.push("حد ضرر فقط " + stopAtr.toFixed(1) + " برابر ATR از ورود فاصله دارد؛ حداقل " + st.minstopatr + " لازم است وگرنه با نوسان عادی خورده می‌شود");
      if (pSug !== null && I.p > pSug + 0.2) w4.push("احتمال تخمینی تو (" + pc(I.p, 0) + ") خیلی بالاتر از احتمال مرجع (" + pc(pSug, 0) + ") است؛ دوباره فکر کن");
      if (plan.targetSrc.indexOf("اندازه") >= 0) w4.push("بالای قیمت مقاومت مشخصی دیده نشد؛ هدف با حرکت اندازه‌گیری‌شده تخمین زده شد");
    }
    step(4, m4, h4, w4);

    // ---------- مرحله ۵: اندازه معامله
    var riskPS = (plan && plan.valid) ? E * (1 + fb) - plan.stop * (1 - fs) : null;
    var budget = has(I.capital) ? I.capital * st.riskpct : null;
    var qRisk = has(riskPS, budget) && riskPS > 0 ? Math.floor(budget / riskPS) : null;
    var qPos = has(I.capital, E) ? Math.floor(I.capital * st.maxpos / (E * (1 + fb))) : null;
    var qVol = has(I.vol_a) ? Math.floor(I.vol_a * st.maxpart) : null;
    var qCands = [qRisk, qPos, qVol].filter(function (x) { return x !== null; });
    var qMax = qCands.length ? Math.min.apply(null, qCands) : null;
    var qty = I.qty !== null ? I.qty : qMax;
    var posVal = has(qty, E) ? qty * E : null;
    var posPct = has(posVal, I.capital) && I.capital > 0 ? posVal / I.capital : null;
    var riskAmt = has(qty, riskPS) ? qty * riskPS : null;
    var riskReal = has(riskAmt, I.capital) && I.capital > 0 ? riskAmt / I.capital : null;
    var exitDays = has(qty, I.vol_a) && I.vol_a > 0 ? qty / (I.vol_a * 0.1) : null;
    var gapLoss = has(posVal) ? posVal * (1 - Math.pow(1 - st.lim, 3)) : null;
    row(5, "budget", "حداکثر زیان مجاز در این معامله (ریال)", budget, "money");
    row(5, "riskPS", "زیان هر سهم در حد ضرر (با کارمزد) (ریال)", riskPS, "money");
    row(5, "qRisk", "حداکثر تعداد بر اساس ریسک", qRisk, "money");
    row(5, "qPos", "حداکثر تعداد بر اساس سهم از سرمایه", qPos, "money");
    row(5, "qVol", "حداکثر تعداد بر اساس حجم روزانه", qVol, "money");
    row(5, "qMax", "حداکثر تعداد مجاز (کمترین)", qMax, "money", "اگر تعداد را وارد نکنی همین استفاده می‌شود");
    row(5, "qty", "تعداد مورد استفاده", qty, "money");
    row(5, "posVal", "ارزش پوزیشن (ریال)", posVal, "money");
    row(5, "posPct", "سهم پوزیشن از سرمایه", posPct, "pct0");
    row(5, "riskReal", "زیان واقعی تا حد ضرر نسبت به سرمایه", riskReal, "pct2");
    row(5, "exitDays", "روز لازم برای خروج (با ۱۰٪ حجم روزانه)", exitDays, "ratio2");
    row(5, "gapLoss", "زیان اگر ۳ روز پشت‌سرهم کف قیمت قفل شود (ریال)", gapLoss, "money", "در صف فروش حد ضرر اجرا نمی‌شود");
    var m5 = !(has(I.capital) && plan && plan.valid);
    var h5 = [], w5 = [];
    if (!m5) {
      if (qMax !== null && qMax < 1) h5.push("با این سرمایه، حد ضرر و آستانه‌ها حتی خرید یک سهم هم مجاز نیست؛ حد ضرر نزدیک‌تر یا سرمایه بیشتر لازم است");
      if (I.qty !== null && I.qty < 1) h5.push("تعداد باید حداقل ۱ باشد");
      if (I.qty !== null && qRisk !== null && I.qty > qRisk) h5.push("تعداد (" + f0(I.qty) + ") بیشتر از حداکثر بر اساس ریسک (" + f0(qRisk) + ") است؛ در حد ضرر بیش از " + pc(st.riskpct, 1) + " سرمایه از دست می‌دهی");
      if (I.qty !== null && qPos !== null && I.qty > qPos) h5.push("ارزش پوزیشن بیش از " + pc(st.maxpos, 0) + " سرمایه می‌شود (حداکثر " + f0(qPos) + " سهم)");
      if (I.qty !== null && qVol !== null && I.qty > qVol) h5.push("تعداد بیش از " + pc(st.maxpart, 1) + " حجم روزانه است؛ خروج سخت می‌شود (حداکثر " + f0(qVol) + " سهم)");
      if (gapLoss !== null && budget !== null && gapLoss > 2 * budget) w5.push("اگر سهم ۳ روز پشت‌سرهم در صف فروش بماند حدود " + f0(gapLoss) + " ریال از دست می‌دهی و حد ضرر اجرا نمی‌شود");
      if (exitDays !== null && exitDays > 1) w5.push("خروج با ۱۰٪ حجم روزانه بیش از یک روز طول می‌کشد");
    }
    step(5, m5, h5, w5);

    // ---------- مرحله ۶: برنامه خروج
    var be1 = plan && plan.valid ? E + (E - plan.stop) : null;
    row(6, "stop6", "حد ضرر (ریال)", plan ? plan.stop : null, "money");
    row(6, "t1", "هدف اول: حدود نیمی از پوزیشن را بفروش (ریال)", plan ? plan.target1 : null, "money");
    row(6, "t2", "هدف دوم (ریال)", plan ? plan.target2 : null, "money");
    row(6, "be1", "وقتی قیمت به این رسید، حد ضرر را به قیمت ورود بیاور (ریال)", be1, "money", "یعنی به اندازه یک برابر ریسک سود کرده‌ای");
    row(6, "tstop", "اگر تا این تعداد روز معاملاتی حرکت نکرد، خارج شو", st.tstop, "int");
    var m6 = !(Y("q_plan") && Y("q_lock") && Y("q_time"));
    var h6 = [], w6 = [];
    if (!m6) {
      if (Y("q_plan") === "خیر") h6.push("حد ضرر، هدف و زمان خروج را ننوشته‌ای؛ بدون برنامه خروج نخر");
      if (Y("q_lock") === "خیر") w6.push("خطر قفل شدن در صف فروش و اجرا نشدن حد ضرر را جدی نگرفته‌ای");
      if (Y("q_time") === "خیر") w6.push("خروج زمانی نداری؛ سرمایه ممکن است ماه‌ها در سهم بی‌حرکت بماند");
    }
    step(6, m6, h6, w6);

    var nHard = 0, nMissing = 0, nWarn = 0;
    for (var i = 1; i <= 6; i++) {
      if (steps[i].status === "❌") nHard++;
      if (steps[i].status === "⏳") nMissing++;
      nWarn += steps[i].warn.length;
    }
    var final;
    if (nHard > 0) final = { sym: "❌", text: "نخر — " + nHard + " مرحله رد شد" };
    else if (nMissing > 0) final = { sym: "⏳", text: "ناقص — " + nMissing + " مرحله کامل نیست" };
    else if (nWarn >= st.maxwarn) final = { sym: "⚠", text: "فعلاً نخر — " + nWarn + " هشدار" };
    else if (nWarn >= 1) final = { sym: "✅", text: "بخر (با احتیاط، طبق برنامه خروج)" };
    else final = { sym: "✅", text: "بخر (طبق برنامه خروج)" };
    return { rows: rows, R: R, steps: steps, final: final, nHard: nHard, nMissing: nMissing, nWarn: nWarn, ev: ev, score: T ? T.score : null, plan: plan, settings: st };
  }

  // ================= پیشنهاد: سقف قیمت ورود، منطقه ورود، تناسب با هر حالت =================
  function quote(mode, inp, userSt, an) {
    var st = effective(userSt);
    var S = num(inp.S), fb = st.fee_buy, fs = st.fee_sell;
    var out = { ok: false, missing: [], parts: [], levels: [], zone: null, limit: null, ref: S, gap: null, note: [], fit: [] };
    if (S === null) out.missing.push("آخرین معامله سهم");
    var T = tech(an, S, st);
    if (!T) out.missing.push("سابقه قیمت سهم (دکمه «به‌روزرسانی از سایت»)");
    if (out.missing.length) return out;
    var plan = makePlan(mode, inp, st, T, S);
    out.plan = plan; out.T = T;
    var atr = T.atr;
    if (!plan || !plan.valid) { out.missing.push("حد ضرر یا هدف قابل محاسبه نیست"); return out; }
    var stop = plan.stop, target = plan.target, p = num(inp.p);
    // سقف قیمت ورود برای رعایت شرط‌ها (حد ضرر و هدف ثابت)
    function maxEntryForRR(rr) { return (1 - fs) * (target + rr * stop) / ((1 + fb) * (1 + rr)); }
    var cands = [], e1 = maxEntryForRR(st.rrmin);
    out.parts.push({ label: "برای نسبت سود به ریسک حداقل " + st.rrmin + " برابر (حد ضرر " + f0(stop) + "، هدف مؤثر " + f0(target) + ")", v: e1 }); cands.push(e1);
    if (p !== null && p - st.margin > 0.02) {
      var rrNeed = 1 / (p - st.margin) - 1;
      var e2 = maxEntryForRR(rrNeed);
      out.parts.push({ label: "برای اینکه احتمال تو (" + pc(p, 0) + ") از سر به سر + حاشیه امن بیشتر باشد", v: e2 }); cands.push(e2);
    } else if (p === null) out.note.push("احتمال خودت را (مرحله «سود و زیان») وارد کن تا شرط احتمال هم در سقف قیمت لحاظ شود");
    var e3 = stop / (1 - st.maxstop);
    out.parts.push({ label: "برای اینکه حد ضرر بیش از " + pc(st.maxstop, 0) + " از ورود فاصله نداشته باشد", v: e3 }); cands.push(e3);
    var lim = Math.min.apply(null, cands);
    out.parts.forEach(function (x) { x.bind = Math.abs(x.v - lim) < 1e-6; });
    out.limit = Math.floor(lim);
    out.ok = true;
    if (out.limit > 0) out.gap = 1 - S / out.limit; // مثبت = قیمت فعلی زیر سقف
    // منطقه ورود بر اساس حالت
    var z = null;
    if (mode === "trend") z = [T.sma20 - 0.25 * atr, T.sma20 + 0.5 * atr];
    else if (mode === "pull") { var lo = Math.max(plan.support !== null ? plan.support : 0, T.sma50 !== null ? T.sma50 : 0); z = [lo, T.sma20 + 0.25 * atr]; }
    else z = [plan.level, plan.level + 0.5 * atr];
    if (z && z[0] > z[1]) z = [z[1], z[0]];
    out.zone = z;
    out.zoneTxt = mode === "trend" ? "نزدیک میانگین ۲۰ روزه (خرید روی اصلاح کوتاه)" : mode === "pull" ? "بین حمایت/میانگین ۵۰ روزه و میانگین ۲۰ روزه" : "بالای سطح شکست (" + plan.levelName + ") تا نیم ATR بالاتر";
    function lvl(label, E) {
      if (!(E > 0)) return;
      var r = rrOf(E, stop, target, st);
      var cap = num(inp.capital);
      var rps = E * (1 + fb) - stop * (1 - fs);
      var qty = (cap !== null && rps > 0) ? Math.min(Math.floor(cap * st.riskpct / rps), Math.floor(cap * st.maxpos / (E * (1 + fb)))) : null;
      out.levels.push({ label: label, price: E, rr: r ? r.rr : null, stopPct: (E - stop) / E, qty: qty, good: E <= out.limit });
    }
    lvl("قیمت فعلی", S);
    if (z) lvl("وسط منطقه ورود", (z[0] + z[1]) / 2);
    lvl("سقف پیشنهادی", out.limit);
    out.targets = { stop: stop, t1: plan.target1, t2: plan.target2, eff: target, stopSrc: plan.stopSrc, targetSrc: plan.targetSrc };
    // تناسب سهم با هر سه حالت
    ["trend", "pull", "break"].forEach(function (m) {
      var r = evaluate(m, inp, userSt, an), s3 = r.steps[3];
      out.fit.push({ mode: m, sym: s3.status, first: s3.hard[0] || s3.warn[0] || "", score: r.score });
    });
    return out;
  }


  // ================= تحلیل نمودار: سری اندیکاتورها، فیبوناچی، احتمال جهت =================
  function ncdf(x) {
    var t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2);
    var p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }
  function smaSeries(a, n) {
    var out = new Array(a.length).fill(null), sum = 0;
    for (var i = 0; i < a.length; i++) { sum += a[i]; if (i >= n) sum -= a[i - n]; if (i >= n - 1) out[i] = sum / n; }
    return out;
  }
  function rsiSeries(c, n) {
    var out = new Array(c.length).fill(null);
    if (c.length < n + 1) return out;
    var g = 0, l = 0, i, d;
    for (i = 1; i <= n; i++) { d = c[i] - c[i - 1]; if (d >= 0) g += d; else l -= d; }
    g /= n; l /= n; out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    for (i = n + 1; i < c.length; i++) { d = c[i] - c[i - 1]; g = (g * (n - 1) + (d > 0 ? d : 0)) / n; l = (l * (n - 1) + (d < 0 ? -d : 0)) / n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
    return out;
  }
  function macdSeries(c) {
    var e12 = emaSeries(c, 12), e26 = emaSeries(c, 26), L = c.length;
    var line = new Array(L).fill(null), sig = new Array(L).fill(null), hist = new Array(L).fill(null), idx = [], vals = [], i;
    for (i = 0; i < L; i++) if (e12[i] !== null && e26[i] !== null) { line[i] = e12[i] - e26[i]; idx.push(i); vals.push(line[i]); }
    var sg = emaSeries(vals, 9);
    for (i = 0; i < idx.length; i++) if (sg[i] !== null) { sig[idx[i]] = sg[i]; hist[idx[i]] = line[idx[i]] - sg[i]; }
    return { line: line, sig: sig, hist: hist };
  }
  function stochSeries(bars, k) {
    var L = bars.length, raw = new Array(L).fill(null), i, j;
    for (i = k - 1; i < L; i++) {
      var hi = -Infinity, lo = Infinity;
      for (j = i - k + 1; j <= i; j++) { if (bars[j].h > hi) hi = bars[j].h; if (bars[j].l < lo) lo = bars[j].l; }
      raw[i] = hi > lo ? (bars[i].c - lo) / (hi - lo) * 100 : 50;
    }
    var K = new Array(L).fill(null), D = new Array(L).fill(null);
    for (i = k + 1; i < L; i++) K[i] = (raw[i] + raw[i - 1] + raw[i - 2]) / 3;
    for (i = k + 3; i < L; i++) D[i] = (K[i] + K[i - 1] + K[i - 2]) / 3;
    return { k: K, d: D };
  }
  function adxSeries(bars, n) {
    var L = bars.length, pdi = new Array(L).fill(null), mdi = new Array(L).fill(null), adx = new Array(L).fill(null);
    if (L < 2 * n + 2) return { pdi: pdi, mdi: mdi, adx: adx };
    var tr = [], pdm = [], mdm = [], i, j;
    for (i = 1; i < L; i++) {
      var up = bars[i].h - bars[i - 1].h, dn = bars[i - 1].l - bars[i].l;
      pdm.push(up > dn && up > 0 ? up : 0); mdm.push(dn > up && dn > 0 ? dn : 0);
      tr.push(Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c)));
    }
    var a = 0, p = 0, m = 0, dx = [];
    for (j = 0; j < n; j++) { a += tr[j]; p += pdm[j]; m += mdm[j]; }
    for (j = n - 1; j < tr.length; j++) {
      if (j > n - 1) { a = a - a / n + tr[j]; p = p - p / n + pdm[j]; m = m - m / n + mdm[j]; }
      var pd = a > 0 ? 100 * p / a : 0, md = a > 0 ? 100 * m / a : 0;
      pdi[j + 1] = pd; mdi[j + 1] = md;
      dx.push([j + 1, (pd + md) > 0 ? 100 * Math.abs(pd - md) / (pd + md) : 0]);
    }
    if (dx.length >= n) {
      var av = 0; for (j = 0; j < n; j++) av += dx[j][1]; av /= n; adx[dx[n - 1][0]] = av;
      for (j = n; j < dx.length; j++) { av = (av * (n - 1) + dx[j][1]) / n; adx[dx[j][0]] = av; }
    }
    return { pdi: pdi, mdi: mdi, adx: adx };
  }
  function bbSeries(c, n) {
    var L = c.length, mid = smaSeries(c, n), up = new Array(L).fill(null), lo = new Array(L).fill(null), pos = new Array(L).fill(null);
    for (var i = n - 1; i < L; i++) {
      var sd = 0; for (var j = i - n + 1; j <= i; j++) sd += (c[j] - mid[i]) * (c[j] - mid[i]);
      sd = Math.sqrt(sd / n); up[i] = mid[i] + 2 * sd; lo[i] = mid[i] - 2 * sd;
      pos[i] = sd > 0 ? (c[i] - lo[i]) / (4 * sd) : 0.5;
    }
    return { mid: mid, up: up, lo: lo, pos: pos };
  }
  // زیگزاگ برای پیدا کردن آخرین سوینگ (پایه فیبوناچی)
  function zigzag(bars, th) {
    var piv = [], dir = 0, eH = { i: 0, p: bars[0].h }, eL = { i: 0, p: bars[0].l };
    for (var i = 1; i < bars.length; i++) {
      var h = bars[i].h, l = bars[i].l;
      if (h > eH.p) eH = { i: i, p: h };
      if (l < eL.p) eL = { i: i, p: l };
      if (dir === 0) {
        if (eH.p >= eL.p * (1 + th) && eH.i > eL.i) { piv.push({ i: eL.i, p: eL.p, t: "L" }); dir = 1; }
        else if (eL.p <= eH.p * (1 - th) && eL.i > eH.i) { piv.push({ i: eH.i, p: eH.p, t: "H" }); dir = -1; }
      } else if (dir === 1) {
        if (l <= eH.p * (1 - th)) { piv.push({ i: eH.i, p: eH.p, t: "H" }); dir = -1; eL = { i: i, p: l }; }
      } else if (h >= eL.p * (1 + th)) { piv.push({ i: eL.i, p: eL.p, t: "L" }); dir = 1; eH = { i: i, p: h }; }
    }
    var prov = dir === 1 ? { i: eH.i, p: eH.p, t: "H" } : dir === -1 ? { i: eL.i, p: eL.p, t: "L" } : null;
    var all = piv.slice(); if (prov) all.push(prov);
    if (all.length < 2) return { pivots: all, leg: null };
    var a = all[all.length - 2], b = all[all.length - 1];
    return { pivots: all, leg: { si: a.i, sp: a.p, ei: b.i, ep: b.p, up: b.p > a.p, prov: !!prov } };
  }
  function wilson(p, n) {
    var z = 1.96, den = 1 + z * z / n, cen = (p + z * z / (2 * n)) / den;
    var half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den;
    return [Math.max(0, cen - half), Math.min(1, cen + half)];
  }
  // آمار شرطی: در گذشته، وقتی این سیگنال در همین حالت بود، قیمت h روز بعد بالاتر بود؟
  function condStats(states, c, h) {
    var cur = states[states.length - 1];
    if (cur === null || cur === undefined) return null;
    var n = 0, w = 0, sumr = 0, nb = 0, wb = 0;
    for (var t = 0; t < c.length - h; t++) {
      if (states[t] === null || states[t] === undefined) continue;
      var up = c[t + h] > c[t]; nb++; if (up) wb++;
      if (states[t] === cur) { n++; if (up) w++; sumr += c[t + h] / c[t] - 1; }
    }
    var out = { state: cur, n: n, base: nb ? wb / nb : null };
    if (n >= 1) { out.wins = w; out.p = w / n; out.pS = (w + 10) / (n + 20); out.avgRet = sumr / n; out.ci = wilson(w / n, Math.max(1, n / h)); out.neff = Math.max(1, n / h); }
    return out;
  }
  function zone(v, cuts, labels) { if (v === null || v === undefined) return null; for (var i = 0; i < cuts.length; i++) if (v < cuts[i]) return labels[i]; return labels[cuts.length]; }

  var FIB_R = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  var FIB_E = [1.272, 1.618];

  function chartData(an, S, h, userSt) {
    var st = effective(userSt), bars = an && an.bars;
    if (!bars || bars.length < 60) return null;
    h = h || 10;
    var n = bars.length, last = n - 1, c = bars.map(function (b) { return b.c; });
    var px = S > 0 ? S : c[last];
    var T = tech(an, S, st);
    var D = { n: n, px: px, h: h, T: T };
    var sma20 = smaSeries(c, 20), sma50 = smaSeries(c, 50), sma200 = smaSeries(c, 200);
    var bb = bbSeries(c, 20), rsi = rsiSeries(c, 14), mc = macdSeries(c), sto = stochSeries(bars, 14), adx = adxSeries(bars, 14);
    D.series = { sma20: sma20, sma50: sma50, sma200: sma200, bbUp: bb.up, bbLo: bb.lo, bbMid: bb.mid, rsi: rsi, macdLine: mc.line, macdSig: mc.sig, macdHist: mc.hist, stK: sto.k, stD: sto.d, pdi: adx.pdi, mdi: adx.mdi, adx: adx.adx };
    // نوسان روزانه
    var rets = []; for (var i = Math.max(1, n - 60); i < n; i++) rets.push(Math.log(c[i] / c[i - 1]));
    var mu = mean(rets), sd = Math.sqrt(mean(rets.map(function (r) { return (r - mu) * (r - mu); })));
    D.sigma = sd;
    var sh = sd * Math.sqrt(h);
    D.range = { low68: px * Math.exp(-sh), high68: px * Math.exp(sh), low95: px * Math.exp(-1.96 * sh), high95: px * Math.exp(1.96 * sh) };
    function pTouch(b) { if (!(b > 0) || !(sh > 0)) return null; var a = Math.abs(Math.log(b / px)); return Math.min(1, 2 * (1 - ncdf(a / sh))); }
    D.pTouch = pTouch;
    // فیبوناچی
    var th = Math.max(0.07, 3 * (T && T.atrp ? T.atrp : 0.02));
    var zz = zigzag(bars, th);
    D.zz = zz;
    if (zz.leg) {
      var lg = zz.leg, diff = lg.ep - lg.sp, lv = [];
      FIB_R.forEach(function (r) { var p = lg.ep - diff * r; lv.push({ kind: "r", r: r, price: p, pTouch: pTouch(p) }); });
      FIB_E.forEach(function (e) { var p = lg.sp + diff * e; lv.push({ kind: "e", r: e, price: p, pTouch: pTouch(p) }); });
      var lo = Math.min(lg.sp, lg.ep), hi = Math.max(lg.sp, lg.ep);
      D.fib = { leg: lg, levels: lv, retrPos: hi > lo ? (lg.up ? (lg.ep - px) / (lg.ep - lg.sp) : (px - lg.ep) / (lg.sp - lg.ep)) : null };
      D.fib.golden = D.fib.retrPos !== null && D.fib.retrPos >= 0.5 && D.fib.retrPos <= 0.618;
    }
    // حمایت و مقاومت
    if (T) {
      D.sr = {
        sup: T.sw.lows.filter(function (x) { return x < px * 0.995; }).sort(function (a, b) { return b - a; }).slice(0, 3),
        res: T.sw.highs.filter(function (x) { return x > px * 1.005; }).sort(function (a, b) { return a - b; }).slice(0, 3),
      };
      D.sr.supP = D.sr.sup.map(function (x) { return pTouch(x); });
      D.sr.resP = D.sr.res.map(function (x) { return pTouch(x); });
    }
    // سیگنال‌ها و احتمال شرطی تاریخی
    var rng60 = new Array(n).fill(null), udv = new Array(n).fill(null), t;
    for (t = 59; t < n; t++) {
      var H = -Infinity, Lw = Infinity;
      for (var j = t - 59; j <= t; j++) { if (bars[j].h > H) H = bars[j].h; if (bars[j].l < Lw) Lw = bars[j].l; }
      rng60[t] = H > Lw ? (H - c[t]) / (H - Lw) : null;       // کسر اصلاح از سقف ۶۰ روزه
    }
    for (t = 20; t < n; t++) {
      var u = 0, d = 0;
      for (var k = t - 19; k <= t; k++) { if (c[k] >= c[k - 1]) u += bars[k].v; else d += bars[k].v; }
      udv[t] = d > 0 ? u / d : null;
    }
    function arr(fn) { var o = new Array(n).fill(null); for (var i2 = 0; i2 < n; i2++) o[i2] = fn(i2); return o; }
    var defs = [
      { id: "trend", name: "روند (میانگین ۲۰ و ۵۰)", val: function () { return sma50[last] !== null ? (px > sma50[last] ? "بالای میانگین ۵۰" : "زیر میانگین ۵۰") : "—"; },
        st: arr(function (i) { return sma50[i] === null ? null : (c[i] > sma50[i] && sma20[i] > sma50[i]) ? "صعودی" : (c[i] < sma50[i] && sma20[i] < sma50[i]) ? "نزولی" : "مختلط"; }) },
      { id: "rsi", name: "RSI (۱۴)", val: function () { return rsi[last] === null ? "—" : rsi[last].toFixed(0); },
        st: arr(function (i) { return zone(rsi[i], [30, 45, 55, 70], ["زیر ۳۰", "۳۰ تا ۴۵", "۴۵ تا ۵۵", "۵۵ تا ۷۰", "بالای ۷۰"]); }) },
      { id: "macd", name: "MACD", val: function () { return mc.hist[last] === null ? "—" : (mc.hist[last] > 0 ? "مثبت" : "منفی") + (mc.hist[last - 1] !== null && mc.hist[last] > mc.hist[last - 1] ? " و رو به بالا" : " و رو به پایین"); },
        st: arr(function (i) { if (mc.hist[i] === null || mc.hist[i - 1] === null || i < 1) return null; return (mc.hist[i] > 0 ? "مثبت" : "منفی") + (mc.hist[i] > mc.hist[i - 1] ? " ↑" : " ↓"); }) },
      { id: "stoch", name: "استوکاستیک (۱۴)", val: function () { return sto.k[last] === null ? "—" : sto.k[last].toFixed(0); },
        st: arr(function (i) { return zone(sto.k[i], [20, 80], ["اشباع فروش (زیر ۲۰)", "میانه", "اشباع خرید (بالای ۸۰)"]); }) },
      { id: "bb", name: "باند بولینگر (موقعیت قیمت)", val: function () { return bb.pos[last] === null ? "—" : (bb.pos[last] * 100).toFixed(0) + "٪ باند"; },
        st: arr(function (i) { return zone(bb.pos[i], [0.1, 0.4, 0.6, 0.9], ["نزدیک باند پایین", "نیمه پایینی", "میانه", "نیمه بالایی", "نزدیک باند بالا"]); }) },
      { id: "adx", name: "قدرت روند (ADX)", val: function () { return adx.adx[last] === null ? "—" : adx.adx[last].toFixed(0) + (adx.pdi[last] > adx.mdi[last] ? " (جهت صعودی)" : " (جهت نزولی)"); },
        st: arr(function (i) { if (adx.adx[i] === null) return null; return adx.adx[i] < 20 ? "روند ضعیف / نوسانی" : (adx.pdi[i] > adx.mdi[i] ? "روند صعودی قوی" : "روند نزولی قوی"); }) },
      { id: "fibz", name: "موقعیت در دامنه ۶۰ روزه (ناحیه فیبوناچی)", val: function () { return rng60[last] === null ? "—" : (rng60[last] * 100).toFixed(0) + "٪ اصلاح از سقف"; },
        st: arr(function (i) { return zone(rng60[i], [0.236, 0.382, 0.5, 0.618, 0.786], ["اصلاح کمتر از ۲۳٪", "۲۳ تا ۳۸٪", "۳۸ تا ۵۰٪", "۵۰ تا ۶۲٪ (ناحیه طلایی)", "۶۲ تا ۷۹٪", "بیش از ۷۹٪"]); }) },
      { id: "flow", name: "جریان حجم (روز صعودی به نزولی)", val: function () { return udv[last] === null ? "—" : udv[last].toFixed(2); },
        st: arr(function (i) { return udv[i] === null ? null : udv[i] > 1.2 ? "حجم بیشتر در روزهای صعودی" : udv[i] < 0.83 ? "حجم بیشتر در روزهای نزولی" : "متعادل"; }) },
    ];
    D.signals = defs.map(function (dd) { var cs = condStats(dd.st, c, h); return { id: dd.id, name: dd.name, val: dd.val(), stat: cs }; });
    // واگرایی RSI در دو کف/سقف اخیر
    D.divergence = null;
    var swL = [], swH = [];
    for (i = 3; i < n - 3; i++) {
      if (rsi[i] === null) continue;
      var isL = true, isH = true;
      for (j = 1; j <= 3; j++) { if (!(bars[i].l < bars[i - j].l && bars[i].l <= bars[i + j].l)) isL = false; if (!(bars[i].h > bars[i - j].h && bars[i].h >= bars[i + j].h)) isH = false; }
      if (isL) swL.push(i); if (isH) swH.push(i);
    }
    if (swL.length >= 2) { var a1 = swL[swL.length - 2], b1 = swL[swL.length - 1]; if (n - b1 <= 25 && bars[b1].l < bars[a1].l && rsi[b1] > rsi[a1] + 2) D.divergence = "واگرایی مثبت (صعودی): قیمت کف پایین‌تر زده ولی RSI کف بالاتر"; }
    if (!D.divergence && swH.length >= 2) { var a2 = swH[swH.length - 2], b2 = swH[swH.length - 1]; if (n - b2 <= 25 && bars[b2].h > bars[a2].h && rsi[b2] < rsi[a2] - 2) D.divergence = "واگرایی منفی (نزولی): قیمت سقف بالاتر زده ولی RSI سقف پایین‌تر"; }
    // ترکیب: میانگین احتمال‌های شرطی (با انقباض به ۵۰٪) روی سیگنال‌های با نمونه کافی
    var used = D.signals.filter(function (x) { return x.stat && x.stat.n >= 8; });
    var base = D.signals.filter(function (x) { return x.stat && x.stat.base !== null; });
    D.prob = { h: h, used: used.length, base: base.length ? mean(base.map(function (x) { return x.stat.base; })) : null };
    if (used.length >= 3) {
      var p = mean(used.map(function (x) { return x.stat.pS; }));
      var ne = used.map(function (x) { return x.stat.neff; }).sort(function (a, b) { return a - b; })[Math.floor(used.length / 2)];
      var ci = wilson(p, Math.max(1, ne));
      D.prob.p = p; D.prob.lo = ci[0]; D.prob.hi = ci[1]; D.prob.neff = ne;
      D.prob.spread = Math.sqrt(mean(used.map(function (x) { return (x.stat.pS - p) * (x.stat.pS - p); })));
      D.prob.verdict = (p >= 0.58 && ci[0] > 0.5) ? "متمایل به صعود (از نظر آماری معنادار)" : (p >= 0.54) ? "کمی متمایل به صعود (معنادار نیست)"
        : (p <= 0.42 && ci[1] < 0.5) ? "متمایل به نزول (از نظر آماری معنادار)" : (p <= 0.46) ? "کمی متمایل به نزول (معنادار نیست)" : "جهت نامشخص؛ برتری آماری دیده نمی‌شود";
    } else D.prob.verdict = "نمونه‌ی تاریخی برای نتیجه‌گیری کافی نیست";
    return D;
  }

  // ================= تحلیل صورت‌های مالی =================
  // f = { unit: ضریب تبدیل به ریال، infl: تورم سالانه، y0: {...}, y1: {...} }
  var FIN_KEYS = [
    ["rev", "درآمد عملیاتی (فروش)"], ["cogs", "بهای تمام‌شده درآمدها"], ["opinc", "سود عملیاتی"], ["int", "هزینه مالی"],
    ["ni", "سود خالص"], ["ta", "جمع دارایی‌ها"], ["ca", "دارایی‌های جاری"], ["cl", "بدهی‌های جاری"],
    ["tl", "جمع بدهی‌ها"], ["eq", "حقوق صاحبان سهام"], ["re", "سود انباشته"], ["cfo", "جریان نقد عملیاتی"],
    ["rec", "حساب‌های دریافتنی"], ["cap", "سرمایه ثبت‌شده"], ["dps", "سود نقدی هر سهم (ریال)"],
  ];
  function finAnalyze(f, price, peSec, site) {
    f = f || {};
    var unit = num(f.unit) || 1e6, infl = num(f.infl); if (infl === null) infl = 0.35;
    var a = f.y0 || {}, b = f.y1 || {}, A = {}, B = {};
    FIN_KEYS.forEach(function (k) { A[k[0]] = num(a[k[0]]); B[k[0]] = num(b[k[0]]); });
    // هزینه‌ها در صورت‌های مالی داخل پرانتز (منفی) می‌آیند؛ همیشه مثبت حساب می‌شوند
    ['cogs', 'int'].forEach(function (k) { if (A[k] !== null) A[k] = Math.abs(A[k]); if (B[k] !== null) B[k] = Math.abs(B[k]); });
    var out = { ratios: [], piotroski: [], notes: { good: [], bad: [] }, score: null, verdict: "", z: null, dupont: null, val: {} };
    function div(x, y) { return (has(x, y) && y !== 0) ? x / y : null; }
    function R(key, label, v0, v1, fmt, better) { out.ratios.push({ key: key, label: label, v0: v0, v1: v1, fmt: fmt, better: better }); return v0; }
    var gm0 = has(A.rev, A.cogs) ? div(A.rev - A.cogs, A.rev) : null, gm1 = has(B.rev, B.cogs) ? div(B.rev - B.cogs, B.rev) : null;
    var om0 = div(A.opinc, A.rev), om1 = div(B.opinc, B.rev), nm0 = div(A.ni, A.rev), nm1 = div(B.ni, B.rev);
    var roa0 = div(A.ni, A.ta), roa1 = div(B.ni, B.ta), roe0 = div(A.ni, A.eq), roe1 = div(B.ni, B.eq);
    var at0 = div(A.rev, A.ta), at1 = div(B.rev, B.ta), em0 = div(A.ta, A.eq);
    var cr0 = div(A.ca, A.cl), cr1 = div(B.ca, B.cl), dr0 = div(A.tl, A.ta), dr1 = div(B.tl, B.ta), de0 = div(A.tl, A.eq);
    var ic0 = has(A.opinc, A.int) && A.int > 0 ? A.opinc / A.int : null;
    var q0 = div(A.cfo, A.ni), q1 = div(B.cfo, B.ni);
    var rg = has(A.rev, B.rev) && B.rev > 0 ? A.rev / B.rev - 1 : null, ng = has(A.ni, B.ni) && B.ni > 0 ? A.ni / B.ni - 1 : null;
    var rrg = rg !== null ? (1 + rg) / (1 + infl) - 1 : null;
    var cm0 = div(A.cfo, A.rev);
    var recg = has(A.rec, B.rec) && B.rec > 0 ? A.rec / B.rec - 1 : null;
    R("gm", "حاشیه سود ناخالص", gm0, gm1, "pct1", 1); R("om", "حاشیه سود عملیاتی", om0, om1, "pct1", 1); R("nm", "حاشیه سود خالص", nm0, nm1, "pct1", 1);
    R("roa", "بازده دارایی‌ها (ROA)", roa0, roa1, "pct1", 1); R("roe", "بازده حقوق صاحبان سهام (ROE)", roe0, roe1, "pct1", 1);
    R("at", "گردش دارایی‌ها (برابر)", at0, at1, "ratio2", 1);
    R("rg", "رشد اسمی درآمد", rg, null, "pct1", 1); R("rrg", "رشد واقعی درآمد (پس از کسر تورم)", rrg, null, "pct1", 1); R("ng", "رشد سود خالص", ng, null, "pct1", 1);
    R("cr", "نسبت جاری", cr0, cr1, "ratio2", 1); R("dr", "نسبت بدهی به دارایی", dr0, dr1, "pct0", -1); R("de", "بدهی به حقوق صاحبان سهام (برابر)", de0, null, "ratio2", -1);
    R("ic", "پوشش هزینه مالی (برابر)", ic0, null, "ratio1", 1);
    R("q", "کیفیت سود (جریان نقد عملیاتی ÷ سود خالص)", q0, q1, "ratio2", 1); R("cm", "جریان نقد عملیاتی به درآمد", cm0, null, "pct1", 1);
    out.dupont = (has(nm0, at0, em0)) ? { nm: nm0, at: at0, em: em0, roe: nm0 * at0 * em0 } : null;
    // ارزش‌گذاری
    var shares = has(A.cap) ? A.cap * unit / 1000 : null;     // ارزش اسمی ۱۰۰۰ ریال
    var v = out.val;
    if (has(shares, price) && price > 0) {
      v.mcap = shares * price; v.eps = has(A.ni) ? A.ni * unit / shares : null;
      v.pe = (v.eps && v.eps !== 0) ? price / v.eps : null;
      v.pb = has(A.eq) && A.eq > 0 ? v.mcap / (A.eq * unit) : null;
      v.ps = has(A.rev) && A.rev > 0 ? v.mcap / (A.rev * unit) : null;
      v.ey = v.pe ? 1 / v.pe : null;
      v.dy = has(A.dps) ? A.dps / price : null; v.payout = (has(A.dps) && v.eps > 0) ? A.dps / v.eps : null;
    }
    // EPS و P/E را خود سایت می‌دهد (درست‌اند)؛ محاسبه‌ی خودمان را با آن‌ها جایگزین می‌کنیم
    site = site || {};
    var okN = function (x) { return x !== null && x !== undefined && isFinite(x); };
    v.eps = okN(site.eps) ? site.eps : null;
    v.pe = okN(site.pe) && site.pe !== 0 ? site.pe : null;
    v.ey = v.pe ? 1 / v.pe : null;
    v.payout = null;
    if (has(A.dps) && v.eps > 0) v.payout = A.dps / v.eps;
    if (has(A.dps) && has(price) && price > 0) v.dy = A.dps / price;
    // فیوتروسکی (۹ معیار؛ هرچه محاسبه‌پذیر باشد)
    var P = out.piotroski;
    function pio(label, cond) { P.push({ label: label, ok: cond }); }
    pio("سود خالص مثبت", has(A.ni) ? A.ni > 0 : null);
    pio("جریان نقد عملیاتی مثبت", has(A.cfo) ? A.cfo > 0 : null);
    pio("ROA نسبت به سال قبل بهتر شده", has(roa0, roa1) ? roa0 > roa1 : null);
    pio("جریان نقد عملیاتی بیشتر از سود خالص (کیفیت سود)", has(A.cfo, A.ni) ? A.cfo > A.ni : null);
    pio("نسبت بدهی به دارایی کمتر شده", has(dr0, dr1) ? dr0 < dr1 : null);
    pio("نسبت جاری بهتر شده", has(cr0, cr1) ? cr0 > cr1 : null);
    pio("سرمایه افزایش نیافته (بدون رقیق‌سازی)", has(A.cap, B.cap) ? A.cap <= B.cap * 1.001 : null);
    pio("حاشیه سود ناخالص بهتر شده", has(gm0, gm1) ? gm0 > gm1 : null);
    pio("گردش دارایی‌ها بهتر شده", has(at0, at1) ? at0 > at1 : null);
    var pk = P.filter(function (x) { return x.ok !== null; });
    out.fscore = pk.length ? { n: pk.filter(function (x) { return x.ok; }).length, of: pk.length } : null;
    // آلتمن Z″ برای بازارهای نوظهور
    if (has(A.ca, A.cl, A.ta, A.re, A.opinc, A.eq, A.tl) && A.ta > 0 && A.tl > 0) {
      var z = 3.25 + 6.56 * (A.ca - A.cl) / A.ta + 3.26 * A.re / A.ta + 6.72 * A.opinc / A.ta + 1.05 * A.eq / A.tl;
      out.z = { v: z, zone: z > 5.85 ? "ایمن" : z >= 4.35 ? "خاکستری" : "خطر ورشکستگی" };
    }
    // پیام‌ها
    function g(t) { out.notes.good.push(t); } function bd(t) { out.notes.bad.push(t); }
    if (has(A.ni)) { if (A.ni < 0) bd("شرکت در سال جاری زیان‌ده است"); }
    if (rrg !== null) { if (rrg > 0.1) g("درآمد در سال جاری بیشتر از تورم رشد کرده (رشد واقعی " + pc(rrg, 0) + ")"); else if (rrg < -0.1) bd("درآمد از تورم عقب مانده (رشد واقعی " + pc(rrg, 0) + ")؛ فروش واقعاً کوچک شده"); }
    if (ng !== null) { if (ng > infl) g("سود خالص " + pc(ng, 0) + " رشد کرده که از تورم بیشتر است"); else if (ng < 0) bd("سود خالص نسبت به سال قبل افت کرده (" + pc(ng, 0) + ")"); }
    if (has(gm0, gm1)) { if (gm0 - gm1 > 0.02) g("حاشیه سود ناخالص بهتر شده (" + pc(gm1, 1) + " ← " + pc(gm0, 1) + ")"); else if (gm1 - gm0 > 0.02) bd("حاشیه سود ناخالص افت کرده (" + pc(gm1, 1) + " ← " + pc(gm0, 1) + ")؛ فشار هزینه یا قیمت فروش"); }
    if (q0 !== null && has(A.ni) && A.ni > 0) { if (q0 < 0.5) bd("فقط " + pc(Math.max(q0, 0), 0) + " سود به نقد تبدیل شده؛ سود حسابداری است نه نقدی"); else if (q0 >= 1) g("سود به نقد تبدیل شده (جریان نقد عملیاتی " + q0.toFixed(1) + " برابر سود)"); }
    if (has(A.cfo) && A.cfo < 0) bd("جریان نقد عملیاتی منفی است");
    if (recg !== null && rg !== null && recg > rg + 0.2) bd("حساب‌های دریافتنی (" + pc(recg, 0) + ") بیشتر از فروش (" + pc(rg, 0) + ") رشد کرده؛ فروش اعتباری یا وصول‌نشده");
    if (dr0 !== null) { if (dr0 > 0.75) bd("بدهی " + pc(dr0, 0) + " دارایی‌هاست؛ اهرم بالا"); else if (dr0 < 0.45) g("اهرم پایین (بدهی " + pc(dr0, 0) + " دارایی‌ها)"); }
    if (cr0 !== null) { if (cr0 < 1) bd("نسبت جاری " + cr0.toFixed(2) + " (کمتر از ۱)؛ فشار نقدینگی کوتاه‌مدت"); else if (cr0 > 1.5) g("نقدینگی کوتاه‌مدت مناسب (نسبت جاری " + cr0.toFixed(2) + ")"); }
    if (ic0 !== null) { if (ic0 < 2) bd("سود عملیاتی فقط " + ic0.toFixed(1) + " برابر هزینه مالی است"); else if (ic0 > 5) g("هزینه مالی به‌راحتی پوشش داده می‌شود (" + ic0.toFixed(1) + " برابر)"); }
    if (roe0 !== null) { if (roe0 > 0.3) g("ROE بالا (" + pc(roe0, 0) + ")"); else if (roe0 < 0.1) bd("ROE پایین (" + pc(roe0, 0) + ") نسبت به تورم"); }
    if (out.z && out.z.zone === "خطر ورشکستگی") bd("مدل آلتمن Z″ در ناحیه خطر است (" + out.z.v.toFixed(1) + ")");
    if (out.z && out.z.zone === "ایمن") g("مدل آلتمن Z″ در ناحیه ایمن است (" + out.z.v.toFixed(1) + ")");
    if (v.pe) { if (v.pe < 0) bd("P/E منفی (زیان)"); else if (num(peSec) > 0 && v.pe > num(peSec) * 1.5) bd("P/E " + v.pe.toFixed(1) + " بیش از ۱٫۵ برابر صنعت (" + peSec + ")"); else if (num(peSec) > 0 && v.pe < num(peSec) * 0.7) g("P/E " + v.pe.toFixed(1) + " ارزان‌تر از صنعت (" + peSec + ")"); }
    if (v.pb && v.pb < 1) g("قیمت زیر ارزش دفتری است (P/B " + v.pb.toFixed(2) + ")؛ ارزش دفتری در شرایط تورمی معمولاً کم‌برآورد است"); else if (v.pb && v.pb > 4) bd("P/B " + v.pb.toFixed(1) + " بالاست");
    if (out.fscore && out.fscore.of >= 6) { if (out.fscore.n >= out.fscore.of * 0.75) g("امتیاز فیوتروسکی " + out.fscore.n + " از " + out.fscore.of + " (قوی)"); else if (out.fscore.n <= out.fscore.of * 0.4) bd("امتیاز فیوتروسکی فقط " + out.fscore.n + " از " + out.fscore.of); }
    // امتیاز ۰ تا ۱۰۰
    var sp = 0, sm = 0;
    function sc(cond, w) { if (cond === null || cond === undefined) return; sm += w; if (cond) sp += w; }
    sc(has(A.ni) ? A.ni > 0 : null, 12); sc(nm0 !== null ? nm0 > 0.08 : null, 6); sc(roe0 !== null ? roe0 > 0.2 : null, 8);
    sc(rrg !== null ? rrg > 0 : null, 8); sc(ng !== null ? ng > infl : null, 8);
    sc(has(gm0, gm1) ? gm0 >= gm1 - 0.01 : null, 5);
    sc(q0 !== null ? q0 >= 0.8 : null, 10); sc(has(A.cfo) ? A.cfo > 0 : null, 8);
    sc(dr0 !== null ? dr0 < 0.65 : null, 8); sc(cr0 !== null ? cr0 >= 1 : null, 6); sc(ic0 !== null ? ic0 >= 3 : null, 5);
    sc(out.z ? out.z.zone !== "خطر ورشکستگی" : null, 6);
    if (out.fscore) { sm += 10; sp += 10 * out.fscore.n / out.fscore.of; }
    out.score = sm > 0 ? Math.round(sp / sm * 100) : null;
    out.verdict = out.score === null ? "داده کافی نیست" : out.score >= 70 ? "بنیاد قوی" : out.score >= 50 ? "بنیاد متوسط" : "بنیاد ضعیف";
    return out;
  }

  var api = { chartData: chartData, finAnalyze: finAnalyze, FIN_KEYS: FIN_KEYS, evaluate: evaluate, quote: quote, tech: tech, pEmpFor: pEmpFor, DEFAULTS: DEFAULTS, SETTINGS_META: SETTINGS_META, RISK_KEYS: RISK_KEYS, effective: effective, MODE_FIT: MODE_FIT };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.StockChecklist = api;
})(typeof self !== "undefined" ? self : this);

}catch(e){try{console.error('didehban:engine-stock.js',e)}catch(_){}}

;try{
/* موتور محاسبات چک‌لیست اختیار معامله — همان منطق فایل اکسل (Call و Put) */
(function (root) {
  "use strict";

  // [key, label, default, kind]  kind: pct => ذخیره به صورت کسر، نمایش به درصد
  var SETTINGS_META = [
    ["size", "حجم هر قرارداد (تعداد سهم)", 1000, "num"],
    ["lim", "دامنه نوسان روزانه سهم پایه (٪)", 0.03, "pct"],
    ["fee_opt", "کارمزد معامله اختیار (٪) ⚠ تقریبی", 0.001, "pct"],
    ["fee_ex", "کارمزد خرید سهم (٪) ⚠ تقریبی", 0.0037, "pct"],
    ["fee_sell", "کارمزد + مالیات فروش سهم (٪) ⚠ تقریبی", 0.0088, "pct"],
    ["atm", "محدوده نزدیک قیمت اعمال - ATM (٪)", 0.02, "pct"],
    ["mindays", "حداقل روز معاملاتی تا سررسید", 10, "num"],
    ["spread", "حداکثر اسپرد مجاز (٪)", 0.05, "pct"],
    ["minvol", "حداقل میانگین حجم روزانه اختیار", 200, "num"],
    ["volx", "حداقل حجم روزانه نسبت به تعداد خرید (برابر)", 20, "num"],
    ["valu", "حداقل ارزش معاملات روزانه سهم پایه (میلیارد ریال)", 100, "num"],
    ["riskpct", "حداکثر درصد سرمایه در خطر هر معامله (٪)", 0.03, "pct"],
    ["rrmin", "حداقل نسبت سود به ریسک (برابر)", 2, "num"],
    ["margin", "حاشیه امن احتمال (٪)", 0.1, "pct"],
    ["dailymax", "میانگین رشد/افت روزانه واقع‌بینانه (٪)", 0.007, "pct"],
    ["tvmax", "حداکثر سهم ارزش زمانی از قیمت اختیار (٪)", 0.7, "pct"],
    ["flatloss", "حداکثر زیان قابل تحمل اگر سهم بی‌تغییر بماند (٪)", 0.5, "pct"],
    ["sl", "حد ضرر - افت از قیمت خرید اختیار (٪)", 0.4, "pct"],
    ["tp", "حد سود اول - رشد از قیمت خرید اختیار (٪)", 0.5, "pct"],
    ["exitdays", "خروج اجباری وقتی روز باقی‌مانده به این عدد برسد", 5, "num"],
    ["maxwarn", "حداکثر تعداد هشدار قبل از «فعلاً نخر»", 3, "num"],
    ["assign", "فروشنده: حداکثر احتمال رسیدن سهم به قیمت سر به سر (٪)", 0.3, "pct"],
    ["minyield", "فروشنده: حداقل بازده پریمیوم نسبت به ارزش پایه تا سررسید (٪)", 0.025, "pct"],
    ["ssl", "فروشنده: حد ضرر - افزایش قیمت اختیار نسبت به قیمت فروش (٪)", 1, "pct"],
    ["stp", "فروشنده: حد سود - کاهش قیمت اختیار نسبت به قیمت فروش (٪)", 0.7, "pct"],
  ];

  // تنظیمات وابسته به ریسک‌پذیری: [خیلی محتاط (۱), متعادل (۵), خیلی ریسک‌پذیر (۱۰)]
  var RISK_KEYS = {
    riskpct: [0.01, 0.03, 0.06], rrmin: [3, 1.5, 0.7], margin: [0.2, 0.1, 0.03],
    spread: [0.03, 0.05, 0.10], minvol: [500, 200, 80], volx: [40, 20, 8],
    mindays: [15, 10, 5], valu: [200, 100, 40], dailymax: [0.005, 0.007, 0.010],
    tvmax: [0.5, 0.7, 0.85], flatloss: [0.3, 0.5, 0.7], sl: [0.25, 0.4, 0.55],
    tp: [0.3, 0.5, 0.8], exitdays: [8, 5, 3], maxwarn: [2, 3, 5],
    assign: [0.15, 0.3, 0.45], minyield: [0.04, 0.025, 0.01], ssl: [0.5, 1, 1.5], stp: [0.5, 0.7, 0.85],
  };
  var INT_KEYS = { minvol: 1, volx: 1, mindays: 1, valu: 1, exitdays: 1, maxwarn: 1 };
  function interp(arr, a) {
    a = Math.min(10, Math.max(1, a));
    if (a <= 5) return arr[0] + (arr[1] - arr[0]) * (a - 1) / 4;
    return arr[1] + (arr[2] - arr[1]) * (a - 5) / 5;
  }
  var DEFAULTS = {};
  SETTINGS_META.forEach(function (m) { DEFAULTS[m[0]] = m[2]; });
  DEFAULTS.risk = 5;
  // تنظیمات مؤثر: مقدار دستی کاربر اگر باشد، وگرنه از روی ریسک‌پذیری (۱ تا ۱۰)
  function effective(user) {
    user = user || {};
    var st = Object.assign({}, DEFAULTS, user);
    var a = Number(st.risk);
    if (!isFinite(a)) a = 5;
    st.risk = Math.min(10, Math.max(1, a));
    Object.keys(RISK_KEYS).forEach(function (k) {
      if (user[k] === undefined || user[k] === null) {
        var v = interp(RISK_KEYS[k], st.risk);
        st[k] = INT_KEYS[k] ? Math.round(v) : Math.round(v * 10000) / 10000;
      }
    });
    return st;
  }

  function ncdf(x) {
    var t = 1 / (1 + 0.2316419 * Math.abs(x));
    var d = 0.3989423 * Math.exp(-x * x / 2);
    var q = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - q : q;
  }
  // تحلیل آماری سهم پایه از روی بازده‌های روزانه (تعدیل‌شده نسبت به قیمت دیروز)
  function analyze(call, an, S, T, td) {
    if (!an || !an.rets || an.rets.length < 20) return null;
    var r = an.rets, n = r.length;
    var rec = r.slice(-60), m = rec.reduce(function (a, b) { return a + b; }, 0) / rec.length;
    var sd = Math.sqrt(rec.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / (rec.length - 1));
    var out = { n: n, sigma: sd, power: an.power === undefined ? null : an.power, pModel: null, pEmp: null, pSug: null, sigTd: null, zscore: null, nWin: 0 };
    var last20 = r.slice(-20), path = [], c = 1;
    last20.forEach(function (x) { c *= 1 + x; path.push(c); });
    out.ret20 = c - 1;
    out.vsma = path[path.length - 1] / (path.reduce(function (a, b) { return a + b; }, 0) / path.length) - 1;
    if (S !== null && T !== null && td !== null && td > 0 && sd > 0) {
      var lt = Math.log(T / S);
      out.sigTd = sd * Math.sqrt(td);
      out.zscore = lt / out.sigTd;
      var z = (lt + 0.5 * sd * sd * td) / out.sigTd;
      out.pModel = call ? 1 - ncdf(z) : ncdf(z);
      var w = Math.round(td), cs = [0];
      r.forEach(function (x) { cs.push(cs[cs.length - 1] + Math.log(1 + x)); });
      if (n - w >= 30) {
        var cnt = 0, tot = 0;
        for (var i = w; i <= n; i++) { var l = cs[i] - cs[i - w]; tot++; if (call ? l >= lt : l <= lt) cnt++; }
        out.pEmp = cnt / tot; out.nWin = tot;
      }
      var cands = [out.pModel, out.pEmp].filter(function (x) { return x !== null; });
      if (cands.length) out.pSug = Math.min.apply(null, cands);
    }
    return out;
  }

  function num(x) {
    if (x === null || x === undefined || x === "") return null;
    var v = Number(x);
    return isFinite(v) ? v : null;
  }
  function f0(x) { return Math.round(x).toLocaleString("en-US"); }
  function pc(x, d) { return (x * 100).toFixed(d === undefined ? 0 : d) + "%"; }

  function evaluate(type, inp, userSt, an) {
    if (type === "scall" || type === "sput") return evaluateSell(type, inp, userSt, an);
    var st = effective(userSt);
    var call = type !== "put";
    var I = {};
    ["capital", "S", "K", "ask", "bid", "cal_days", "tdov", "val_u", "vol_o", "T", "p", "qty", "bidvol"]
      .forEach(function (k) { I[k] = num(inp[k]); });
    var Y = function (k) { return inp[k] || ""; };
    var has = function () {
      for (var i = 0; i < arguments.length; i++) if (arguments[i] === null || arguments[i] === undefined || arguments[i] === "") return false;
      return true;
    };
    var R = {}; // key -> value
    var rows = [];
    function row(step, key, label, v, fmt, help) {
      R[key] = v;
      rows.push({ step: step, key: key, label: label, v: v, fmt: fmt, help: help || "" });
    }

    var S = I.S, K = I.K, ask = I.ask, bid = I.bid, T = I.T, p = I.p;
    var fo = st.fee_opt, fe = st.fee_ex, fs = st.fee_sell, lim = st.lim;

    // ---------- مرحله ۰
    var td = I.tdov !== null ? I.tdov : (I.cal_days !== null ? Math.round(I.cal_days * 5 / 7 * 0.92) : null);
    row(0, "td", "روز معاملاتی تا سررسید (مورد استفاده)", td, "int",
      "اگر وارد نکرده باشی برآورد: روز تقویمی × ۵/۷ منهای ~۸٪ تعطیلات");

    var steps = [];
    function step(n, missing, hard, warn) {
      var status;
      if (missing) { hard = []; warn = []; status = "⏳"; }
      else if (hard.length) status = "❌";
      else if (warn.length) status = "⚠";
      else status = "✅";
      steps[n] = { n: n, status: status, missing: missing, hard: hard, warn: warn };
    }

    // ---------- مرحله ۱
    var m1 = !(Y("q_thesis") && Y("q_halt") && Y("q_queue") && Y("q_event") && I.val_u !== null);
    var h1 = [], w1 = [];
    if (!m1) {
      if (Y("q_thesis") === "خیر") h1.push(call ? "دلیل مشخصی برای صعود سهم نداری؛ بدون دلیل اختیار نخر" : "دلیل مشخصی برای ریزش سهم نداری؛ بدون دلیل اختیار نخر");
      if (Y("q_halt") === "خیر") h1.push("سهم پایه متوقف یا بسته است");
      if (I.val_u < st.valu) h1.push("ارزش معاملات سهم پایه (" + I.val_u + " میلیارد ریال) کمتر از حداقل (" + st.valu + ") است");
      if (Y("q_queue") === "بله") w1.push("سهم الان در صف قفل است؛ قیمت واقعی مشخص نیست و خروج از اختیار می‌تواند سخت شود");
      if (Y("q_event") === "بله") w1.push("رویداد مهم تا سررسید داری؛ قبل از خرید نحوه تعدیل قیمت اعمال را در اطلاعیه‌ها بخوان");
    }
    step(1, m1, h1, w1);

    // ---------- مرحله ۲
    var spread = (has(ask, bid) && ask > 0) ? (ask - bid) / ask : null;
    row(2, "spread", "اسپرد (فاصله قیمت خرید و فروش)", spread, "pct1",
      "اگر همین الان بخری و فوراً بفروشی، این درصد از پولت می‌سوزد");
    var m2 = !has(S, K, ask, bid, I.vol_o);
    var h2 = [], w2 = [];
    if (!m2) {
      if (ask <= 0) h2.push("قیمت فروش اختیار صفر یا نامعتبر است");
      if (bid <= 0) h2.push("هیچ خریداری در بازار اختیار نیست؛ اگر بخری نمی‌توانی بفروشی");
      if (spread !== null && spread > st.spread) h2.push("اسپرد " + pc(spread, 1) + " است؛ بیشتر از حد مجاز (" + pc(st.spread, 1) + ")");
      if (I.vol_o < st.minvol) h2.push("میانگین حجم روزانه (" + I.vol_o + " قرارداد) کمتر از حداقل (" + st.minvol + ") است");
      var iv = call ? S - K : K - S;
      if (ask < iv) w2.push("قیمت اختیار از ارزش ذاتی کمتر است؛ احتمالاً اعداد هم‌زمان نیستند، دوباره بگیر");
    }
    step(2, m2, h2, w2);

    // ---------- مرحله ۳
    var money = null, intr = null, tv = null, tvp = null, be = null, rise = null, maxr = null, dneed = null, tgtd = null;
    if (has(S, K)) {
      money = Math.abs(S / K - 1) <= st.atm ? "نزدیک قیمت اعمال (ATM)" :
        (call ? (S > K ? "در سود (ITM)" : "خارج از سود (OTM)") : (S < K ? "در سود (ITM)" : "خارج از سود (OTM)"));
      intr = call ? Math.max(S - K, 0) : Math.max(K - S, 0);
    }
    if (has(ask, S, K)) { tv = ask - intr; tvp = ask > 0 ? tv / ask : null; }
    if (has(ask, K)) {
      be = call ? ((ask * (1 + fo)) + (K * (1 + fe))) / (1 - fs) : (K * (1 - fs) - ask * (1 + fo)) / (1 + fe);
    }
    if (has(be, S)) {
      rise = call ? be / S - 1 : 1 - be / S;
      dneed = call ? (be <= S ? 0 : Math.ceil(Math.log(be / S) / Math.log(1 + lim)))
                   : (be >= S ? 0 : Math.ceil(Math.log(be / S) / Math.log(1 - lim)));
    }
    if (td !== null) maxr = call ? Math.pow(1 + lim, td) - 1 : 1 - Math.pow(1 - lim, td);
    if (has(T, S, td) && td > 0) tgtd = call ? Math.pow(T / S, 1 / td) - 1 : 1 - Math.pow(T / S, 1 / td);
    row(3, "money", "وضعیت اختیار نسبت به قیمت اعمال", money, "text");
    row(3, "intr", "ارزش ذاتی هر سهم (ریال)", intr, "money");
    row(3, "tv", "ارزش زمانی هر سهم (ریال)", tv, "money", "تا سررسید به صفر می‌رسد");
    row(3, "tvp", "سهم ارزش زمانی از قیمت اختیار", tvp, "pct0", "هرچه بیشتر، پولِ بیشتری «هوا» است");
    row(3, "be", "قیمت سر به سر سهم پایه در سررسید (ریال)", be, "money", "با احتساب کارمزدها");
    row(3, "rise", call ? "رشد لازم سهم تا سر به سر" : "افت لازم سهم تا سر به سر", rise, "pct1");
    row(3, "maxr", call ? "حداکثر رشد ممکن تا سررسید (سقف نوسان)" : "حداکثر افت ممکن تا سررسید (کف نوسان)", maxr, "pct0",
      "اگر هر روز سقف/کف بزند؛ فقط مرز غیرممکن را نشان می‌دهد");
    row(3, "dneed", call ? "حداقل روزِ «سقف پشت‌سرهم» لازم تا سر به سر" : "حداقل روزِ «کف پشت‌سرهم» لازم تا سر به سر", dneed, "int");
    row(3, "tgtd", call ? "میانگین رشد روزانه لازم برای هدف" : "میانگین افت روزانه لازم برای هدف", tgtd, "pct2",
      "بیش از ~۱٪ در روز برای چند هفته بسیار سخت است");
    var m3 = !has(S, K, ask, td, T);
    var h3 = [], w3 = [];
    if (!m3) {
      if (td < st.mindays) h3.push("فقط " + td + " روز معاملاتی مانده؛ حداقل " + st.mindays + " روز لازم است (ارزش زمانی در روزهای آخر تند آب می‌شود)");
      if (call ? T <= be : T >= be) h3.push("هدفت (" + f0(T) + ") از قیمت سر به سر (" + f0(be) + ") " + (call ? "بالاتر" : "پایین‌تر") + " نیست؛ حتی اگر هدفت محقق شود سود نمی‌کنی");
      var lo = S * Math.pow(1 - lim, td), hi = S * Math.pow(1 + lim, td);
      if (call ? T > hi : T < lo) h3.push("هدف با سقف نوسان روزانه در روزهای باقی‌مانده اصلاً قابل رسیدن نیست");
      if (call ? be > hi : be < lo) h3.push("قیمت سر به سر با سقف نوسان روزانه تا سررسید قابل رسیدن نیست");
      if (tgtd !== null && tgtd > st.dailymax) w3.push("برای رسیدن به هدف سهم باید روزانه به‌طور میانگین " + pc(tgtd, 2) + (call ? " رشد" : " افت") + " کند (بیش از " + pc(st.dailymax, 2) + ")");
      if (tvp !== null && tvp > st.tvmax) w3.push("حدود " + pc(tvp, 0) + " قیمت اختیار فقط ارزش زمانی است و تا سررسید صفر می‌شود");
    }
    step(3, m3, h3, w3);

    // ---------- مرحله ۴
    var cost = has(ask) ? ask * st.size * (1 + fo) : null;
    function payoff(x) { // سود خالص هر سهم اگر قیمت سهم x باشد (با اعمال)
      return call ? Math.max(x * (1 - fs) - K * (1 + fe), 0) : Math.max(K * (1 - fs) - x * (1 + fe), 0);
    }
    var pT = has(ask, K, T) ? (payoff(T) - ask * (1 + fo)) * st.size : null;
    var rr = has(cost, pT) ? pT / cost : null;
    var retstock = has(T, S) ? (call ? T / S - 1 : 1 - T / S) : null;
    var lev = has(rr, retstock) ? (retstock <= 0 ? null : rr / retstock) : null;
    function ret(x) { return (payoff(x) - ask * (1 + fo)) / (ask * (1 + fo)); }
    var retMid = has(ask, K, S, T) ? ret(S + (T - S) / 2) : null;
    var retFlat = has(ask, K, S) ? ret(S) : null;
    var retAdv = has(ask, K, S) ? ret(call ? S * 0.9 : S * 1.1) : null;
    var preq = has(cost, pT) ? (pT <= 0 ? 1 : cost / (cost + pT)) : null;
    var ev = has(p, rr) ? p * rr - (1 - p) : null;
    row(4, "cost", "هزینه کل خرید یک قرارداد (ریال)", cost, "money", "این همان پولی است که در خطر است");
    row(4, "pT", "سود خالص یک قرارداد اگر سهم دقیقاً به هدف برسد (ریال)", pT, "money");
    row(4, "rr", "نسبت سود به ریسک (برابر)", rr, "ratio1");
    row(4, "retstock", call ? "بازده خرید خودِ سهم تا همان هدف" : "اندازه افت سهم تا همان هدف", retstock, "pct1");
    row(4, "lev", "اهرم واقعی (برابر)", lev, "ratio1", "ضررها هم به همین اندازه تند است");
    row(4, "retMid", "بازده اگر سهم فقط نصف راه تا هدف را برود", retMid, "pct0");
    row(4, "retFlat", "بازده اگر سهم تا سررسید بی‌تغییر بماند", retFlat, "pct0");
    row(4, "retAdv", call ? "بازده اگر سهم ۱۰٪ بریزد" : "بازده اگر سهم ۱۰٪ بالا برود", retAdv, "pct0");
    row(4, "preq", "حداقل احتمال لازم برای سر به سر شدن ریاضی", preq, "pct0");
    row(4, "ev", "امید ریاضی بازده روی پول خرید", ev, "pct0", "برای رتبه‌بندی بین اختیارها");
    var A = analyze(call, an, S, T, td);
    if (A) {
      row(4, "sigma", "نوسان روزانه سهم پایه (انحراف معیار ۶۰ روز اخیر)", A.sigma, "pct2");
      row(4, "sigTd", "نوسان معمول تا سررسید (±۱ انحراف معیار)", A.sigTd, "pct1", "حدود ۶۸٪ مواقع سهم در این بازه می‌ماند");
      row(4, "ret20", "بازده ۲۰ روز اخیر سهم پایه", A.ret20, "pct1");
      row(4, "vsma", "قیمت نسبت به میانگین ۲۰ روزه", A.vsma, "pct1");
      if (A.power !== null) row(4, "power", "قدرت خریدار حقیقی (بیش از ۱ = خریدار قوی‌تر)", A.power, "ratio2");
      row(4, "pModel", "احتمال آماری رسیدن به هدف (مدل نوسان)", A.pModel, "pct0", "بدون فرض روند؛ فقط از روی نوسان گذشته");
      row(4, "pEmp", "احتمال تاریخی رسیدن به هدف (در سابقه خود سهم)", A.pEmp, "pct0", "چند درصد پنجره‌های هم‌طول در سابقه به هدف رسیده‌اند");
      row(4, "pSug", "احتمال پیشنهادی (کمترِ دو برآورد)", A.pSug, "pct0", "فقط مرجع؛ تصمیم با خودت است");
    }
    var m4 = !has(S, K, ask, T, p);
    var h4 = [], w4 = [];
    if (!m4) {
      if (rr < st.rrmin) h4.push("نسبت سود به ریسک " + rr.toFixed(1) + " برابر است؛ حداقل " + st.rrmin + " برابر لازم است. (یعنی سودِ حالت هدف ÷ کل پول خرید؛ آستانه از تنظیمات ⚙ «حداقل نسبت سود به ریسک» می‌آید و قابل تغییر است)");
      if (p < preq + st.margin) h4.push("احتمال تخمینی تو (" + pc(p, 0) + ") کمتر از حداقل لازم (" + pc(Math.min(1, preq + st.margin), 0) + ") است؛ سر به سر ریاضی " + pc(preq, 0) + " به‌علاوه حاشیه امن");
      if (retFlat < -st.flatloss) w4.push("اگر سهم بی‌تغییر بماند حدود " + pc(-retFlat, 0) + " پول خرید از بین می‌رود");
      if (A) {
        var trendBad = call ? (A.ret20 < -0.03 && A.vsma < 0) : (A.ret20 > 0.03 && A.vsma > 0);
        if (trendBad) w4.push("روند ۲۰ روزه سهم پایه برخلاف نظر توست (بازده " + pc(A.ret20, 1) + "، " + (A.vsma < 0 ? "زیر" : "بالای") + " میانگین ۲۰ روزه)");
        if (A.power !== null && (call ? A.power < 0.7 : A.power > 1.4)) w4.push("قدرت خریدار حقیقی " + A.power.toFixed(2) + " است و با نظر " + (call ? "صعودی" : "نزولی") + " تو نمی‌خواند");
        if (A.pModel !== null && p > A.pModel + 0.15) w4.push("احتمال تخمینی تو (" + pc(p, 0) + ") خیلی بالاتر از احتمال آماری (" + pc(A.pModel, 0) + ") است؛ دوباره فکر کن");
        if (A.zscore !== null && Math.abs(A.zscore) > 2) w4.push("هدف تو " + Math.abs(A.zscore).toFixed(1) + " انحراف معیار با قیمت فعلی فاصله دارد؛ از نظر آماری بسیار بعید است");
      }
    }
    step(4, m4, h4, w4);

    // ---------- مرحله ۵
    var budget = has(I.capital) ? I.capital * st.riskpct : null;
    var maxq = has(budget, cost) ? Math.floor(budget / cost) : null;
    var tot = has(I.qty, cost) ? I.qty * cost : null;
    var costpct = has(tot, I.capital) ? tot / I.capital : null;
    var volratio = has(I.vol_o, I.qty) ? (I.qty <= 0 ? null : I.vol_o / I.qty) : null;
    var cashex = null, sharesneed = null;
    if (call) { if (has(I.qty, K)) cashex = I.qty * st.size * K * (1 + fe); }
    else if (has(I.qty)) sharesneed = I.qty * st.size;
    var swing = has(S, ask) ? lim * S / ask : null;
    var crash = has(S) ? (call ? S * Math.pow(1 - lim, 3) : S * Math.pow(1 + lim, 3)) : null;
    row(5, "budget", "حداکثر پولی که مجازی در این معامله از دست بدهی (ریال)", budget, "money", "سرمایه × درصد ریسک مجاز");
    row(5, "maxq", "حداکثر تعداد قرارداد مجاز", maxq, "int", "از این بیشتر نخر");
    row(5, "tot", "کل پول خرید (ریال)", tot, "money", "بدترین حالت: همه‌اش از بین می‌رود");
    row(5, "costpct", "درصد سرمایه‌ای که در خطر است", costpct, "pct2");
    row(5, "volratio", "حجم روزانه اختیار چند برابر تعداد خرید توست", volratio, "int");
    if (call) row(5, "cashex", "نقدینگی لازم اگر بخواهی اعمال کنی (ریال)", cashex, "money");
    else row(5, "sharesneed", "تعداد سهم لازم برای اعمال", sharesneed, "money", "باید این‌قدر سهم پایه در سبد داشته باشی");
    row(5, "swing", "حداکثر نوسان تقریبی قیمت اختیار در یک روز سقف/کف", swing, "pct0");
    row(5, "crash", call ? "قیمت سهم اگر ۳ روز پشت‌سرهم کف شود" : "قیمت سهم اگر ۳ روز پشت‌سرهم سقف شود", crash, "money",
      "در چنین روزهایی ممکن است نتوانی اختیار را بفروشی");
    var m5 = !(has(I.capital, S, K, ask, I.vol_o, I.qty, I.bidvol) && (call || Y("q_own")));
    var h5 = [], w5 = [];
    if (!m5) {
      if (I.qty < 1) h5.push("تعداد باید حداقل ۱ قرارداد باشد");
      if (maxq !== null && I.qty > maxq) h5.push("تعداد " + I.qty + " از حداکثر مجاز (" + maxq + " قرارداد) بیشتر است؛ بیش از حد ریسک می‌کنی");
      if (volratio !== null && volratio < st.volx) h5.push("حجم روزانه فقط " + Math.round(volratio) + " برابر تعداد خرید توست؛ حداقل " + st.volx + " برابر لازم است");
      if (I.bidvol < I.qty) w5.push("صف خرید (" + I.bidvol + " قرارداد) از تعداد تو کمتر است؛ فروش یکجا ممکن است قیمت را پایین بیاورد");
      if (call && cashex !== null && cashex > I.capital) w5.push("برای اعمال نقدینگی کافی نداری؛ باید قبل از سررسید خودِ اختیار را بفروشی");
      if (!call && Y("q_own") === "خیر") w5.push("سهم کافی برای اعمال نداری؛ باید قبل از سررسید خودِ اختیار را بفروشی (اعمال نکن)");
    }
    step(5, m5, h5, w5);

    // ---------- مرحله ۶
    var slp = has(ask) ? Math.round(ask * (1 - st.sl)) : null;
    var tpp = has(ask) ? Math.round(ask * (1 + st.tp)) : null;
    var fu = td !== null ? Math.max(td - st.exitdays, 0) : null;
    row(6, "slp", "قیمت حد ضرر اختیار (ریال)", slp, "money", "به این رسید یا پایین‌تر، بدون بحث بفروش");
    row(6, "tpp", "قیمت حد سود اول اختیار (ریال)", tpp, "money", "نیمی از قراردادها را بفروش و حد ضرر بقیه را به قیمت خرید ببر");
    row(6, "fu", "خروج اجباری: بعد از این‌قدر روز معاملاتی از امروز", fu, "int", "اگر هنوز بالاتر از سر به سر نیستی، بفروش");
    row(6, "lossm", "ضرر پولی تقریبی در حد ضرر (ریال)", has(tot) ? tot * st.sl : null, "money");
    row(6, "gainm", "سود پولی تقریبی در حد سود اول (ریال)", has(tot) ? tot * st.tp : null, "money");
    var m6 = !(Y("q_plan") && Y("q_lock") && Y("q_zero"));
    var h6 = [], w6 = [];
    if (!m6) {
      if (Y("q_plan") === "خیر") h6.push("هنوز برنامه خروج (حد ضرر، حد سود، زمان خروج) را ننوشته‌ای");
      if (Y("q_lock") === "خیر") h6.push("ریسک قفل شدن سهم در صف را نپذیرفته‌ای");
      if (Y("q_zero") === "خیر") h6.push("آماده از دست رفتن کل پول خرید نیستی؛ این معامله برای تو مناسب نیست");
      if (st.tp < st.sl) w6.push("حد سود از حد ضرر کوچک‌تر است؛ تنظیمات را اصلاح کن");
    }
    step(6, m6, h6, w6);

    // ---------- نتیجه نهایی
    var nHard = 0, nMissing = 0, nWarn = 0;
    for (var i = 1; i <= 6; i++) {
      if (steps[i].status === "❌") nHard++;
      if (steps[i].status === "⏳") nMissing++;
      nWarn += steps[i].warn.length;
    }
    var final;
    if (nHard > 0) final = { sym: "❌", text: "نخر — " + nHard + " مرحله رد شد" };
    else if (nMissing > 0) final = { sym: "⏳", text: "ناقص — " + nMissing + " مرحله کامل نیست" };
    else if (nWarn >= st.maxwarn) final = { sym: "⚠", text: "فعلاً نخر — " + nWarn + " هشدار" };
    else if (nWarn >= 1) final = { sym: "✅", text: "بخر (با احتیاط، طبق برنامه خروج)" };
    else final = { sym: "✅", text: "بخر (طبق برنامه خروج)" };

    return { rows: rows, R: R, steps: steps, final: final, nHard: nHard, nMissing: nMissing, nWarn: nWarn, ev: ev, settings: st };
  }


  // ================= ابزارهای مدل نوسان =================
  function ncinv(p) {
    var lo = -8, hi = 8;
    for (var i = 0; i < 60; i++) { var m = (lo + hi) / 2; if (ncdf(m) < p) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  // نوسان روزانه: از سابقه واقعی؛ اگر نبود تخمین از دامنه نوسان
  function sigmaFor(an, S, td, lim) {
    var A = analyze(true, an, S, null, td);
    if (A && A.sigma > 0) return { sigma: A.sigma, est: false, A: A };
    return { sigma: Math.max(lim * 0.4, 0.001), est: true, A: null };
  }
  // ارزش تئوری اختیار در سررسید (بدون روند، بدون نرخ بهره)
  function fairValue(call, S, K, sigma, td) {
    var s = sigma * Math.sqrt(td);
    if (!(s > 0)) return Math.max(call ? S - K : K - S, 0);
    var d1 = (Math.log(S / K) + 0.5 * s * s) / s, d2 = d1 - s;
    return call ? S * ncdf(d1) - K * ncdf(d2) : K * ncdf(-d2) - S * ncdf(-d1);
  }
  // احتمال اینکه قیمت سهم در سررسید بالاتر (up=true) یا پایین‌تر از x باشد
  function probBeyond(up, S, x, sigma, td) {
    var s = sigma * Math.sqrt(td);
    var z = (Math.log(x / S) + 0.5 * sigma * sigma * td) / s;
    var above = 1 - ncdf(z);
    return up ? above : 1 - above;
  }

  // ================= فروش اختیار (Call/Put) =================
  function evaluateSell(type, inp, userSt, an) {
    var st = effective(userSt);
    var call = type === "scall";
    var I = {};
    ["capital", "S", "K", "ask", "bid", "cal_days", "tdov", "val_u", "vol_o", "sellp", "qty"]
      .forEach(function (k) { I[k] = num(inp[k]); });
    var Y = function (k) { return inp[k] || ""; };
    var has = function () {
      for (var i = 0; i < arguments.length; i++) if (arguments[i] === null || arguments[i] === undefined || arguments[i] === "") return false;
      return true;
    };
    var R = {}, rows = [];
    function row(step, key, label, v, fmt, help) { R[key] = v; rows.push({ step: step, key: key, label: label, v: v, fmt: fmt, help: help || "" }); }
    var S = I.S, K = I.K, ask = I.ask, bid = I.bid;
    var fo = st.fee_opt, lim = st.lim, size = st.size;

    var td = I.tdov !== null ? I.tdov : (I.cal_days !== null ? Math.round(I.cal_days * 5 / 7 * 0.92) : null);
    row(0, "td", "روز معاملاتی تا سررسید (مورد استفاده)", td, "int", "اگر وارد نکرده باشی برآورد: روز تقویمی × ۵/۷ منهای ~۸٪ تعطیلات");
    var sp = I.sellp !== null ? I.sellp : bid;            // قیمتی که با آن می‌فروشم
    var pn = has(sp) ? sp * (1 - fo) : null;               // پریمیوم خالص هر سهم
    var base = has(S, K) ? (call ? S : K) : null;          // ارزش پایه: سهم (Call) یا نقد لازم (Put)

    var steps = [];
    function step(n, missing, hard, warn) {
      var status;
      if (missing) { hard = []; warn = []; status = "⏳"; }
      else if (hard.length) status = "❌";
      else if (warn.length) status = "⚠";
      else status = "✅";
      steps[n] = { n: n, status: status, missing: missing, hard: hard, warn: warn };
    }

    // ---------- مرحله ۱: سهم پایه
    var m1 = !(Y("q_ok") && Y("q_halt") && Y("q_queue") && Y("q_event") && I.val_u !== null);
    var h1 = [], w1 = [];
    if (!m1) {
      if (Y("q_ok") === "خیر") h1.push(call ? "حاضر نیستی سهم را به قیمت اعمال بفروشی؛ پس نباید Call بفروشی" : "حاضر نیستی سهم را به قیمت اعمال بخری و نگه داری؛ پس نباید Put بفروشی");
      if (Y("q_halt") === "خیر") h1.push("سهم پایه متوقف یا بسته است");
      if (I.val_u < st.valu) h1.push("ارزش معاملات سهم پایه (" + I.val_u + " میلیارد ریال) کمتر از حداقل (" + st.valu + ") است");
      if (Y("q_queue") === "بله") w1.push("سهم الان در صف قفل است؛ اگر اوضاع بد شود نمی‌توانی اختیار را بخری و ببندی");
      if (Y("q_event") === "بله") w1.push("رویداد مهم تا سررسید داری؛ تعدیل قیمت اعمال و ریسک شکاف قیمتی را بررسی کن");
    }
    step(1, m1, h1, w1);

    // ---------- مرحله ۲: بازار
    var spread = (has(ask, bid) && ask > 0) ? (ask - bid) / ask : null;
    row(2, "spread", "اسپرد (فاصله قیمت خرید و فروش)", spread, "pct1", "هزینه بستن سریع معامله؛ فروشنده باید بتواند اختیار را پس بخرد");
    var m2 = !has(S, K, ask, bid, I.vol_o);
    var h2 = [], w2 = [];
    if (!m2) {
      if (bid <= 0) h2.push("هیچ خریداری در بازار اختیار نیست؛ نمی‌توانی فوراً بفروشی");
      if (ask <= 0) h2.push("قیمت فروش اختیار صفر یا نامعتبر است");
      if (spread !== null && spread > st.spread) h2.push("اسپرد " + pc(spread, 1) + " است؛ بیشتر از حد مجاز (" + pc(st.spread, 1) + ")");
      if (I.vol_o < st.minvol) h2.push("میانگین حجم روزانه (" + I.vol_o + " قرارداد) کمتر از حداقل (" + st.minvol + ") است؛ بستن معامله سخت می‌شود");
      var iv0 = call ? S - K : K - S;
      if (has(sp) && sp < iv0) w2.push("قیمت فروش از ارزش ذاتی کمتر است؛ احتمالاً اعداد هم‌زمان نیستند، دوباره بگیر");
    }
    step(2, m2, h2, w2);

    // ---------- مرحله ۳: قیمت، زمان و فاصله امن
    var SG = sigmaFor(an, S, td, lim), sigma = SG.sigma, A = SG.A;
    var money = null, intr = null, tv = null, be = null, cushion = null, pAssign = null, pLoss = null, sigTd = null;
    if (has(S, K)) {
      money = Math.abs(S / K - 1) <= st.atm ? "نزدیک قیمت اعمال (ATM)" :
        (call ? (S > K ? "در سود خریدار (ITM)" : "خارج از سود (OTM)") : (S < K ? "در سود خریدار (ITM)" : "خارج از سود (OTM)"));
      intr = Math.max(call ? S - K : K - S, 0);
    }
    if (has(sp, intr)) tv = Math.max(sp - intr, 0);
    if (has(pn, K)) be = call ? K + pn : K - pn;
    if (has(be, S)) cushion = call ? be / S - 1 : 1 - be / S;
    if (has(S, K, td) && td > 0) {
      sigTd = sigma * Math.sqrt(td);
      pAssign = probBeyond(call, S, K, sigma, td);
      if (has(be)) pLoss = probBeyond(call, S, be, sigma, td);
    }
    row(3, "money", "وضعیت اختیار نسبت به قیمت سهم", money, "text");
    row(3, "intr", "ارزش ذاتی (ریال)", intr, "money");
    row(3, "be", call ? "قیمت سر به سر فروشنده (بالاتر از این زیان می‌کنی)" : "قیمت سر به سر فروشنده (پایین‌تر از این زیان می‌کنی)", be, "money");
    row(3, "cushion", "فاصله قیمت فعلی سهم تا سر به سر", cushion, "pct1", "هرچه بیشتر، حاشیه امن بیشتر؛ منفی یعنی همین الان زیان‌دهی");
    row(3, "sigTd", "نوسان معمول تا سررسید (±۱ انحراف معیار)", sigTd, "pct1", SG.est ? "سابقه قیمت نبود؛ از دامنه نوسان تخمین زده شد" : "از ۶۰ روز اخیر");
    row(3, "pAssign", "احتمال اعمال (رسیدن سهم به قیمت اعمال)", pAssign, "pct0", "بدون فرض روند؛ فقط از روی نوسان گذشته");
    row(3, "pLoss", "احتمال زیان فروشنده (رسیدن سهم به سر به سر)", pLoss, "pct0");
    var m3 = !has(S, K, sp, td);
    var h3 = [], w3 = [];
    if (!m3) {
      if (td <= 0) h3.push("سررسید رسیده است");
      if (pLoss !== null && pLoss > st.assign) h3.push("احتمال زیان " + pc(pLoss, 0) + " است؛ بیشتر از حد مجاز (" + pc(st.assign, 0) + "). قیمت اعمال امن‌تر یا قیمت فروش بالاتر لازم است");
      if (pAssign !== null && pAssign > 0.5) w3.push("اختیار الان به نفع خریدار است و احتمال اعمال بالاست");
      if (SG.est) w3.push("سابقه قیمت سهم خوانده نشد؛ احتمال‌ها با نوسان تخمینی محاسبه شده‌اند");
    }
    step(3, m3, h3, w3);

    // ---------- مرحله ۴: سود و زیان
    var premc = has(pn) ? pn * size : null;
    var yld = has(pn, base) ? pn / base : null;
    var monthly = has(yld, td) && td > 0 ? yld / td * 20 : null;
    var fair = has(S, K, td) && td > 0 ? fairValue(call, S, K, sigma, td) : null;
    var fairr = has(sp, fair) && fair > 0 ? sp / fair : null;
    var sev = has(pn, fair) && pn > 0 ? (pn - fair) / pn : null;
    var adv = has(S, K, pn) ? (pn - Math.max(call ? S * 1.1 - K : K - S * 0.9, 0)) * size : null;
    var maxLoss = (!call && has(K, pn)) ? (K - pn) * size : null;
    row(4, "premc", "پریمیوم خالص یک قرارداد (ریال)", premc, "money", "مبلغی که اگر سهم به سر به سر نرسد برای تو می‌ماند");
    row(4, "yield", "بازده پریمیوم نسبت به ارزش پایه تا سررسید", yld, "pct1", call ? "ارزش پایه = قیمت سهم" : "ارزش پایه = قیمت اعمال (نقدی که باید آماده باشد)");
    row(4, "monthly", "بازده معادل ماهانه (۲۰ روز معاملاتی)", monthly, "pct1");
    row(4, "fair", "ارزش تئوری اختیار (مدل نوسان) (ریال)", fair, "money", "اگر خیلی بالاتر از قیمت فروشت باشد، ارزان می‌فروشی");
    row(4, "fairr", "قیمت فروش نسبت به ارزش تئوری (برابر)", fairr, "ratio2");
    row(4, "sev", "برتری پریمیوم نسبت به ارزش تئوری (٪ پریمیوم)", sev, "pct0", "برای رتبه‌بندی بین اختیارها؛ مثبت = گران‌تر از مدل می‌فروشی");
    row(4, "adv", call ? "سود/زیان یک قرارداد اگر سهم ۱۰٪ بالا برود (ریال)" : "سود/زیان یک قرارداد اگر سهم ۱۰٪ بریزد (ریال)", adv, "money");
    row(4, "maxLoss", "بیشترین زیان یک قرارداد (ریال)", call ? "نامحدود" : maxLoss, call ? "text" : "money", call ? "فروش Call بدون سهم ریسک نامحدود دارد" : "اگر سهم به صفر برسد");
    if (A) {
      row(4, "ret20", "بازده ۲۰ روز اخیر سهم پایه", A.ret20, "pct1");
      row(4, "vsma", "قیمت نسبت به میانگین ۲۰ روزه", A.vsma, "pct1");
      if (A.power !== null) row(4, "power", "قدرت خریدار حقیقی (بیش از ۱ = خریدار قوی‌تر)", A.power, "ratio2");
    }
    var m4 = !has(S, K, sp);
    var h4 = [], w4 = [];
    if (!m4) {
      if (yld !== null && yld < st.minyield) h4.push("بازده پریمیوم " + pc(yld, 1) + " است؛ کمتر از حداقل (" + pc(st.minyield, 1) + ") و ارزش ریسک را ندارد");
      if (fairr !== null && fairr < 0.9) w4.push("قیمت فروش (" + f0(sp) + ") از ارزش تئوری مدل (" + f0(fair) + ") کمتر است؛ احتمالاً ارزان می‌فروشی");
      if (A) {
        var trendBad = call ? (A.ret20 > 0.05 && A.vsma > 0.02) : (A.ret20 < -0.05 && A.vsma < -0.02);
        if (trendBad) w4.push("روند ۲۰ روزه سهم برخلاف فروش " + (call ? "Call" : "Put") + " است (بازده " + pc(A.ret20, 1) + ")");
        if (A.power !== null && (call ? A.power > 1.4 : A.power < 0.7)) w4.push("قدرت خریدار حقیقی " + A.power.toFixed(2) + " است و با فروش " + (call ? "Call" : "Put") + " نمی‌خواند");
      }
    }
    step(4, m4, h4, w4);

    // ---------- مرحله ۵: اندازه معامله
    var qty = I.qty;
    var Sbad = has(S) ? (call ? S * Math.pow(1 + lim, 5) : S * Math.pow(1 - lim, 5)) : null;
    var lossBad = has(Sbad, K, pn) ? (Math.max(call ? Sbad - K : K - Sbad, 0) - pn) * size : null;
    var budget = has(I.capital) ? I.capital * st.riskpct : null;
    var maxq = has(lossBad, budget) ? (lossBad > 0 ? Math.floor(budget / lossBad) : null) : null;
    var cashneed = has(qty, K) ? qty * size * K : null;
    var sharesneed = has(qty) ? qty * size : null;
    var capshare = has(cashneed, I.capital) && I.capital > 0 ? cashneed / I.capital : null;
    var volratio = has(I.vol_o, qty) && qty > 0 ? I.vol_o / qty : null;
    var totprem = has(qty, premc) ? qty * premc : null;
    row(5, "budget", "حداکثر زیان مجاز در این معامله (ریال)", budget, "money");
    row(5, "lossBad", "زیان یک قرارداد اگر ۵ روز پشت‌سرهم سهم خلاف نظر برود (ریال)", lossBad, "money", "اگر منفی یا صفر باشد در این سناریو زیان نمی‌کنی");
    row(5, "maxq", "حداکثر تعداد قرارداد مجاز", maxq, "int", maxq === null ? "در سناریوی بد زیانی نیست؛ محدودیتی از این بابت نیست" : "");
    row(5, "totprem", "کل پریمیوم خالص دریافتی (ریال)", totprem, "money");
    if (call) row(5, "sharesneed", "سهم پایه‌ای که باید داشته باشی (تعداد سهم)", sharesneed, "money");
    else { row(5, "cashneed", "نقدی که برای اعمال لازم می‌شود (ریال)", cashneed, "money"); row(5, "capshare", "سهم این نقد از کل سرمایه", capshare, "pct0"); }
    row(5, "volratio", "حجم روزانه نسبت به تعداد فروش (برابر)", volratio, "int");
    var m5 = !(has(I.capital, S, K, sp, I.vol_o, qty) && Y("q_cover"));
    var h5 = [], w5 = [];
    if (!m5) {
      if (qty < 1) h5.push("تعداد قرارداد باید حداقل ۱ باشد");
      if (maxq !== null && qty > maxq) h5.push("تعداد (" + qty + ") بیشتر از حداکثر مجاز (" + maxq + ") است؛ در سناریوی بد بیش از " + pc(st.riskpct, 0) + " سرمایه زیان می‌کنی");
      if (volratio < st.volx) h5.push("حجم روزانه فقط " + volratio.toFixed(0) + " برابر تعداد فروش توست؛ حداقل " + st.volx + " برابر لازم است");
      if (call && Y("q_cover") === "خیر") h5.push("فروش Call بدون داشتن سهم (Naked) ریسک نامحدود دارد؛ ممنوع");
      if (!call && Y("q_cover") === "خیر") w5.push("نقدینگی کامل برای اعمال نداری؛ باید وجه تضمین بلوکه شود و با افت سهم ممکن است مارجین‌کال شوی");
      if (!call && cashneed > I.capital) w5.push("نقد لازم برای اعمال (" + f0(cashneed) + ") از کل سرمایه‌ات بیشتر است");
      else if (!call && capshare > 0.5) w5.push("بیش از ۵۰٪ سرمایه‌ات برای اعمال احتمالی درگیر می‌شود");
    }
    step(5, m5, h5, w5);

    // ---------- مرحله ۶: برنامه خروج
    var slp = has(sp) ? sp * (1 + st.ssl) : null;
    var tpp = has(sp) ? sp * (1 - st.stp) : null;
    var lossm = has(slp, sp, qty) ? (slp - sp) * size * qty : null;
    var gainm = has(tpp, sp, qty) ? (sp - tpp) * size * qty : null;
    row(6, "slp", "قیمت بازخرید برای حد ضرر (ریال)", slp, "money", "اگر قیمت اختیار به اینجا رسید، می‌خری و می‌بندی");
    row(6, "tpp", "قیمت بازخرید برای حد سود (ریال)", tpp, "money");
    row(6, "lossm", "زیان پولی در حد ضرر (ریال)", lossm, "money");
    row(6, "gainm", "سود پولی در حد سود (ریال)", gainm, "money");
    row(6, "fu", "تصمیم قطعی بستن یا پذیرش اعمال وقتی روز باقی‌مانده به این عدد رسید", st.exitdays, "int");
    var m6 = !(Y("q_plan") && Y("q_lock") && Y("q_zero"));
    var h6 = [], w6 = [];
    if (!m6) {
      if (Y("q_plan") === "خیر") h6.push("برنامه بازخرید (حد ضرر، حد سود، زمان) را ننوشته‌ای؛ بدون برنامه نفروش");
      if (Y("q_lock") === "خیر") w6.push("خطر قفل شدن سهم و ناتوانی در بستن معامله را جدی نگرفته‌ای");
      if (Y("q_zero") === "خیر") h6.push(call ? "نمی‌پذیری که با صعود سهم سود بالاتر را از دست بدهی و سهم را به قیمت اعمال بفروشی" : "نمی‌پذیری که با ریزش سهم مجبور شوی به قیمت اعمال بخری و ضرر کنی");
    }
    step(6, m6, h6, w6);

    var nHard = 0, nMissing = 0, nWarn = 0;
    for (var i = 1; i <= 6; i++) {
      if (steps[i].status === "❌") nHard++;
      if (steps[i].status === "⏳") nMissing++;
      nWarn += steps[i].warn.length;
    }
    var final;
    if (nHard > 0) final = { sym: "❌", text: "نفروش — " + nHard + " مرحله رد شد" };
    else if (nMissing > 0) final = { sym: "⏳", text: "ناقص — " + nMissing + " مرحله کامل نیست" };
    else if (nWarn >= st.maxwarn) final = { sym: "⚠", text: "فعلاً نفروش — " + nWarn + " هشدار" };
    else if (nWarn >= 1) final = { sym: "✅", text: "بفروش (با احتیاط، طبق برنامه بازخرید)" };
    else final = { sym: "✅", text: "بفروش (طبق برنامه بازخرید)" };
    return { rows: rows, R: R, steps: steps, final: final, nHard: nHard, nMissing: nMissing, nWarn: nWarn, ev: sev, settings: st };
  }

  // ================= قیمت پیشنهادی =================
  // خرید: سقف قیمتی که هنوز همه شرط‌های سود/ریسک و احتمال را برآورده می‌کند
  // فروش: کف قیمتی که هنوز بازده، احتمال زیان و ارزش تئوری را برآورده می‌کند
  function quote(type, inp, userSt, an) {
    var st = effective(userSt);
    var sell = type === "scall" || type === "sput";
    var call = type === "call" || type === "scall";
    var I = {};
    ["S", "K", "ask", "bid", "cal_days", "tdov", "T", "p", "sellp"].forEach(function (k) { I[k] = num(inp[k]); });
    var S = I.S, K = I.K, fo = st.fee_opt, fe = st.fee_ex, fs = st.fee_sell, lim = st.lim;
    var td = I.tdov !== null ? I.tdov : (I.cal_days !== null ? Math.round(I.cal_days * 5 / 7 * 0.92) : null);
    var out = { sell: sell, call: call, ok: false, missing: [], parts: [], levels: [], limit: null, ref: null, gap: null, fair: null, td: td, note: [] };
    var SG = (S !== null && td !== null && td > 0) ? sigmaFor(an, S, td, lim) : null;
    if (SG) { out.sigmaEst = SG.est; if (S !== null && K !== null) out.fair = fairValue(call, S, K, SG.sigma, td); }

    if (!sell) {
      if (K === null) out.missing.push("قیمت اعمال");
      if (I.T === null) out.missing.push("قیمت هدف سهم");
      if (out.missing.length) return out;
      var payT = call ? Math.max(I.T * (1 - fs) - K * (1 + fe), 0) : Math.max(K * (1 - fs) - I.T * (1 + fe), 0);
      out.payT = payT;
      out.ref = I.ask;
      if (payT <= 0) { out.limit = 0; out.ok = true; out.note.push("با این قیمت هدف، اختیار حتی رایگان هم سود نمی‌دهد؛ هدف باید از قیمت اعمال (و کارمزدها) فراتر برود"); return out; }
      var aRR = payT / ((1 + fo) * (1 + st.rrmin));
      out.parts.push({ label: "برای نسبت سود به ریسک حداقل " + st.rrmin + " برابر", v: aRR });
      var cands = [aRR];
      if (I.p !== null) {
        var aP = payT * Math.max(I.p - st.margin, 0) / (1 + fo);
        out.parts.push({ label: "برای اینکه احتمال تو (" + pc(I.p, 0) + ") از سر به سر ریاضی + حاشیه امن (" + pc(st.margin, 0) + ") بیشتر باشد", v: aP });
        cands.push(aP);
      } else out.note.push("احتمال خودت را (مرحله «سود و زیان») وارد کن تا شرط احتمال هم در سقف قیمت لحاظ شود");
      var lim_ = Math.min.apply(null, cands);
      out.parts.forEach(function (x) { x.bind = Math.abs(x.v - lim_) < 1e-9; });
      out.limit = Math.max(Math.floor(lim_), 0);
      out.ok = true;
      if (out.fair !== null) out.note.push("ارزش تئوری اختیار با مدل نوسان حدود " + f0(out.fair) + " ریال است (فقط مرجع؛ اختیار به هدف تو وابسته نیست)");
      function lvl(label, a) {
        if (a === null || !(a > 0)) return;
        var c = a * (1 + fo), rr = payT / c - 1, preq = c / payT;
        out.levels.push({ label: label, price: a, rr: rr, preq: preq, ev: I.p !== null ? I.p * rr - (1 - I.p) : null, good: a <= out.limit });
      }
      if (I.ask !== null) lvl("خرید فوری (بهترین فروش)", I.ask);
      if (I.ask !== null && I.bid !== null) lvl("میانه", Math.round((I.ask + I.bid) / 2));
      if (I.bid !== null) lvl("سفارش در صف (بهترین خرید)", I.bid);
      if (out.limit > 0) lvl("سقف پیشنهادی", out.limit);
      if (out.limit > 0) {
        var c0 = out.limit * (1 + fo);
        out.beAtLimit = call ? (c0 + K * (1 + fe)) / (1 - fs) : (K * (1 - fs) - c0) / (1 + fe);
        if (S !== null) out.moveAtLimit = call ? out.beAtLimit / S - 1 : 1 - out.beAtLimit / S;
      }
      if (out.ref !== null && out.ref > 0) out.gap = out.limit / out.ref - 1;
      return out;
    }

    // فروشنده
    if (S === null) out.missing.push("قیمت سهم پایه");
    if (K === null) out.missing.push("قیمت اعمال");
    if (td === null || td <= 0) out.missing.push("روز تا سررسید");
    if (out.missing.length) return out;
    var base = call ? S : K, sigma = SG.sigma, s = sigma * Math.sqrt(td);
    out.ref = I.sellp !== null ? I.sellp : I.bid;
    var spY = st.minyield * base / (1 - fo);
    out.parts.push({ label: "برای بازده پریمیوم حداقل " + pc(st.minyield, 1) + " از ارزش پایه", v: spY });
    var q, pnP;
    if (call) { q = S * Math.exp(-0.5 * sigma * sigma * td + s * ncinv(1 - st.assign)); pnP = q - K; }
    else { q = S * Math.exp(-0.5 * sigma * sigma * td + s * ncinv(st.assign)); pnP = K - q; }
    var spP = Math.max(pnP, 0) / (1 - fo);
    out.parts.push({ label: "برای اینکه احتمال زیان از " + pc(st.assign, 0) + " بیشتر نشود (سر به سر باید " + (call ? "بالاتر" : "پایین‌تر") + " از " + f0(q) + " باشد)", v: spP });
    var spF = out.fair !== null ? out.fair / (1 - fo) : null;
    if (spF !== null) out.parts.push({ label: "برای اینکه ارزان‌تر از ارزش تئوری مدل نفروشی", v: spF });
    var lim2 = Math.max.apply(null, out.parts.map(function (x) { return x.v; }));
    out.parts.forEach(function (x) { x.bind = Math.abs(x.v - lim2) < 1e-9; });
    out.limit = Math.ceil(lim2);
    out.ok = true;
    out.safeStrike = q;     // قیمت اعمالی که احتمال اعمالش دقیقاً برابر حد مجاز است
    out.pAssign = probBeyond(call, S, K, sigma, td);
    if (SG.est) out.note.push("سابقه قیمت نبود؛ نوسان از دامنه نوسان تخمین زده شد");
    if ((call && K < q) || (!call && K > q)) out.note.push("قیمت اعمال فعلی (" + f0(K) + ") از قیمت اعمال امن (" + f0(q) + ") " + (call ? "پایین‌تر" : "بالاتر") + " است؛ احتمال اعمال " + pc(out.pAssign, 0) + " است. اختیاری با قیمت اعمال " + (call ? "بالاتر" : "پایین‌تر") + " فروش را امن‌تر می‌کند");
    function slvl(label, a) {
      if (a === null || !(a > 0)) return;
      var pn = a * (1 - fo), be = call ? K + pn : K - pn;
      out.levels.push({ label: label, price: a, yld: pn / base, pLoss: probBeyond(call, S, be, sigma, td), fairr: out.fair > 0 ? a / out.fair : null, good: a >= out.limit });
    }
    if (I.ask !== null) slvl("سفارش در صف (بهترین فروش)", I.ask);
    if (I.ask !== null && I.bid !== null) slvl("میانه", Math.round((I.ask + I.bid) / 2));
    if (I.bid !== null) slvl("فروش فوری (بهترین خرید)", I.bid);
    slvl("کف پیشنهادی", out.limit);
    if (out.ref !== null && out.limit > 0) out.gap = out.ref / out.limit - 1;
    return out;
  }

  var api = { quote: quote, evaluateSell: evaluateSell, fairValue: fairValue, ncinv: ncinv, evaluate: evaluate, DEFAULTS: DEFAULTS, SETTINGS_META: SETTINGS_META, RISK_KEYS: RISK_KEYS, effective: effective, analyze: analyze, ncdf: ncdf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OptionChecklist = api;
})(typeof self !== "undefined" ? self : this);

}catch(e){try{console.error('didehban:engine-opt.js',e)}catch(_){}}

;try{
/* خواندن خودکار اطلاعات سهم از APIهای cdn.tsetmc.com: قیمت، سابقه ۲۵۰ روزه، دفتر سفارش، حقیقی/حقوقی، P/E */
(function (root) {
  "use strict";
  var BASES = ["https://cdn.tsetmc.com/api/", "https://cdn.tsetmc.ir/api/"];

  function fa(s) { return String(s || "").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[‌‎‏]/g, "").trim(); }
  function latin(s) {
    return String(s).replace(/[۰-۹]/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹".indexOf(d); })
      .replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); });
  }
  function insCodeFromUrl(href) {
    var m = String(href).match(/instinfo\/(\d{6,})/i) || String(href).match(/[?&]i=(\d{6,})/i);
    return m ? m[1] : null;
  }
  // صفحه اختیار معامله (این افزونه فقط برای سهم است)
  function isOptionText(text) {
    var t = fa(latin(text));
    return /اختیار\s*[خف]\s*[^\s\-()]+\s*-\s*\d+(?:\.\d+)?\s*-\s*\d{4}\/\d{1,2}\/\d{1,2}/.test(t);
  }

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
      var url = BASES[i] + path;
      var r = await bg(url);
      log.push((r.ok ? "OK " : "FAIL ") + url + (r.status ? " [" + r.status + "]" : "") + (r.err ? " " + r.err : "") + (!r.ok && r.snippet ? " :: " + r.snippet : ""));
      if (r.ok) return r.json;
    }
    return null;
  }
  function pick(row, re) { for (var k in row) if (re.test(k)) return row[k]; return undefined; }
  function avg(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function N(x) { var n = Number(x); return isFinite(n) ? n : null; }

  // تعدیل قیمت‌ها برای افزایش سرمایه و سود نقدی: زنجیره با «قیمت پایانی دیروز» که خود سایت تعدیل می‌کند
  function buildBars(list) {
    var L = list.filter(function (x) { return N(x.pClosing) > 0; }).sort(function (a, b) { return a.dEven - b.dEven; });
    var n = L.length;
    if (n < 2) return [];
    var adj = new Array(n);
    adj[n - 1] = N(L[n - 1].pClosing);
    for (var i = n - 1; i >= 1; i--) {
      var c = N(L[i].pClosing), py = N(L[i].priceYesterday);
      adj[i - 1] = (py > 0 && c > 0) ? adj[i] * py / c : N(L[i - 1].pClosing) * (adj[i] / c);
    }
    return L.map(function (x, i) {
      var c = N(x.pClosing), f = adj[i] / c;
      var hi = N(x.priceMax), lo = N(x.priceMin), op = N(x.priceFirst);
      var cc = adj[i];
      var h = hi > 0 ? hi * f : cc, l = lo > 0 ? lo * f : cc, o = op > 0 ? op * f : cc;
      h = Math.max(h, cc, o); l = Math.min(l, cc, o);
      return { d: x.dEven, o: +o.toFixed(2), h: +h.toFixed(2), l: +l.toFixed(2), c: +cc.toFixed(2), v: N(x.qTotTran5J) || 0, val: N(x.qTotCap) || 0 };
    });
  }

  async function collect(insCode, log) {
    var inp = {}, rep = [], an = {};
    function ok(t) { rep.push({ ok: true, t: t }); }
    function bad(t) { rep.push({ ok: false, t: t }); }
    var r = await Promise.all([
      api("ClosingPrice/GetClosingPriceInfo/" + insCode, log),
      api("ClosingPrice/GetClosingPriceDailyList/" + insCode + "/260", log),
      api("BestLimits/" + insCode, log),
      api("ClientType/GetClientType/" + insCode + "/1/0", log),
      api("Instrument/GetInstrumentInfo/" + insCode, log),
    ]);
    var info = r[0] && r[0].closingPriceInfo, dl = r[1] && r[1].closingPriceDaily, bl = r[2], ct = r[3] && r[3].clientType, ii = r[4] && r[4].instrumentInfo;

    if (ii && ii.lVal18AFC) { inp.name_o = fa(ii.lVal18AFC); ok("نماد " + inp.name_o); }
    var S = null;
    if (info) {
      S = N(info.pDrCotVal) > 0 ? N(info.pDrCotVal) : N(info.pClosing);
      if (S > 0) { inp.S = Math.round(S); ok("آخرین معامله " + inp.S); } else bad("قیمت سهم صفر بود");
      var et = info.instrumentState && info.instrumentState.cEtaval;
      if (et) {
        if (/^A/.test(et)) { inp.q_halt = "بله"; ok("وضعیت نماد مجاز (" + et + ")"); }
        else if (/^I/.test(et)) { inp.q_halt = "خیر"; bad("نماد ممنوع/متوقف است (" + et + ")"); }
      }
    } else bad("قیمت سهم خوانده نشد");

    if (dl && dl.length) {
      var bars = buildBars(dl);
      if (bars.length >= 30) {
        an.bars = bars.slice(-250);
        ok("سابقه " + an.bars.length + " روز معاملاتی (تعدیل‌شده) برای تحلیل تکنیکال خوانده شد");
        var traded = bars.filter(function (b) { return b.v > 0; }).slice(-20);
        var vals = traded.map(function (b) { return b.val / 1e9; }).filter(function (x) { return x > 0; });
        var vols = traded.map(function (b) { return b.v; });
        if (vals.length) { inp.val_u = Math.round(avg(vals)); ok("میانگین ارزش معاملات روزانه " + inp.val_u + " میلیارد ریال"); }
        if (vols.length) { inp.vol_a = Math.round(avg(vols)); ok("میانگین حجم روزانه " + inp.vol_a + " سهم"); }
      } else bad("سابقه قیمت برای تحلیل تکنیکال کافی نیست (" + bars.length + " روز)");
    } else bad("سابقه قیمت سهم خوانده نشد");

    var rows = bl && (bl.bestLimits || bl.bestLimit);
    if (rows && rows.length) {
      var r1 = rows.filter(function (x) { return pick(x, /^number$/i) === 1; })[0] || rows[0];
      var ask = N(pick(r1, /^pMeOf$/i)), bid = N(pick(r1, /^pMeDem$/i));
      if (ask !== null && bid !== null) {
        inp.ask = ask; inp.bid = bid;
        var sq = bid === 0 && ask > 0, bq = ask === 0 && bid > 0;
        inp.q_sq = sq ? "بله" : "خیر"; inp.q_bq = bq ? "بله" : "خیر";
        ok("بهترین فروش " + ask + " | بهترین خرید " + bid + (sq ? " ← صف فروش" : bq ? " ← صف خرید" : ""));
      } else bad("ساختار دفتر سفارش ناشناخته بود (کلیدها: " + Object.keys(r1).join(",") + ")");
    } else bad("دفتر سفارش خالی بود (بازار بسته است؟)؛ وضعیت صف را خودت پر کن");

    if (ct && N(ct.buy_CountI) > 0 && N(ct.sell_CountI) > 0 && N(ct.sell_I_Volume) > 0) {
      an.power = (N(ct.buy_I_Volume) / N(ct.buy_CountI)) / (N(ct.sell_I_Volume) / N(ct.sell_CountI));
      var tot = N(ct.buy_I_Volume) + N(ct.buy_N_Volume);
      if (tot > 0) an.netreal = (N(ct.buy_I_Volume) - N(ct.sell_I_Volume)) / tot;
      ok("قدرت خریدار حقیقی " + an.power.toFixed(2) + (an.netreal !== undefined ? " | خالص خرید حقیقی " + (an.netreal * 100).toFixed(1) + "٪ حجم" : ""));
    } else bad("اطلاعات حقیقی/حقوقی خوانده نشد");

    if (ii && ii.eps) {
      var eps = N(ii.eps.estimatedEPS) !== null && N(ii.eps.estimatedEPS) !== 0 ? N(ii.eps.estimatedEPS) : N(ii.eps.epsValue);
      if (eps) { inp.eps_site = eps; ok("EPS سایت " + eps); }
      if (eps && S > 0) { inp.pe = +(S / eps).toFixed(2); ok("P/E سایت " + inp.pe); }
      var sp = N(ii.eps.sectorPE);
      if (sp > 0) { inp.pe_sec = sp; ok("P/E صنعت " + sp); }
    }
    return { inp: inp, rep: rep, an: an };
  }

  // قیمت لحظه‌ای سبک برای پورتفو (بدون خواندن سابقه)
  async function quickPrice(insCode) {
    var j = await api("ClosingPrice/GetClosingPriceInfo/" + insCode, []);
    var info = j && j.closingPriceInfo; if (!info) return null;
    var S = N(info.pDrCotVal) > 0 ? N(info.pDrCotVal) : N(info.pClosing);
    return S > 0 ? { S: S, close: N(info.pClosing), py: N(info.priceYesterday), at: Date.now() } : null;
  }
  root.SCCollect = { quickPrice: quickPrice, collect: collect, insCodeFromUrl: insCodeFromUrl, isOptionText: isOptionText, buildBars: buildBars, fa: fa };
  if (typeof module !== "undefined" && module.exports) module.exports = root.SCCollect;
})(typeof self !== "undefined" ? self : this);

}catch(e){try{console.error('didehban:collect-stock.js',e)}catch(_){}}

;try{
/* خواندن خودکار اعداد از TSETMC: نام نماد (قیمت اعمال/سررسید) + APIهای cdn.tsetmc.com */
(function (root) {
  "use strict";

  var BASES = ["https://cdn.tsetmc.com/api/", "https://cdn.tsetmc.ir/api/"];

  function fa(s) {
    return String(s || "").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[‌‎‏]/g, "").trim();
  }
  function latin(s) {
    return String(s).replace(/[۰-۹]/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹".indexOf(d); })
      .replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); });
  }

  // تبدیل تاریخ جلالی به میلادی
  function j2g(jy, jm, jd) {
    jy += 1595;
    var days = -355668 + (365 * jy) + (~~(jy / 33)) * 8 + ~~(((jy % 33) + 3) / 4) + jd + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
    var gy = 400 * ~~(days / 146097);
    days %= 146097;
    if (days > 36524) { gy += 100 * ~~(--days / 36524); days %= 36524; if (days >= 365) days++; }
    gy += 4 * ~~(days / 1461);
    days %= 1461;
    if (days > 365) { gy += ~~((days - 1) / 365); days = (days - 1) % 365; }
    var gd = days + 1;
    var sal = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    var gm;
    for (gm = 0; gm < 13 && gd > sal[gm]; gm++) gd -= sal[gm];
    return [gy, gm, gd];
  }
  function daysUntil(jy, jm, jd, now) {
    now = now || new Date();
    var g = j2g(jy, jm, jd);
    var a = Date.UTC(g[0], g[1] - 1, g[2]);
    var b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((a - b) / 86400000);
  }

  // مثال: «اختیارخ فملی-16000-1405/10/09 (ضملی1000)»
  function parseOptionName(text) {
    var t = fa(latin(text));
    var m = t.match(/اختیار\s*([خف])\s*([^\s\-()]+)\s*-\s*(\d+(?:\.\d+)?)\s*-\s*(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s*[(（]\s*([^()（）\n]{1,30}?)\s*[)）])?/);
    if (!m) return null;
    return { type: m[1] === "خ" ? "call" : "put", base: m[2], strike: Number(m[3]), jy: +m[4], jm: +m[5], jd: +m[6], sym: m[7] || null };
  }
  function insCodeFromUrl(href) {
    var m = String(href).match(/instinfo\/(\d{6,})/i) || String(href).match(/[?&]i=(\d{6,})/i);
    return m ? m[1] : null;
  }

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
      var url = BASES[i] + path;
      var r = await bg(url);
      log.push((r.ok ? "OK " : "FAIL ") + url + (r.status ? " [" + r.status + "]" : "") + (r.err ? " " + r.err : "") + (!r.ok && r.snippet ? " :: " + r.snippet : ""));
      if (r.ok) return r.json;
    }
    return null;
  }

  function pick(row, re) {
    for (var k in row) if (re.test(k)) return row[k];
    return undefined;
  }
  function avg(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }

  async function collect(opt, insCode, log) {
    var inp = {}, rep = [], an = {};
    function ok(t) { rep.push({ ok: true, t: t }); }
    function bad(t) { rep.push({ ok: false, t: t }); }

    if (opt.sym) { inp.name_o = opt.sym; ok("نماد اختیار " + opt.sym + " (از داخل پرانتز کنار تاریخ)"); }
    inp.K = opt.strike;
    ok("قیمت اعمال " + opt.strike + " (از نام نماد)");
    var d = daysUntil(opt.jy, opt.jm, opt.jd);
    inp.cal_days = d;
    ok("سررسید " + opt.jy + "/" + opt.jm + "/" + opt.jd + " → " + d + " روز تقویمی");
    if (d < 0) bad("تاریخ سررسید گذشته است");

    var results = await Promise.all([
      api("BestLimits/" + insCode, log),
      api("ClosingPrice/GetClosingPriceDailyList/" + insCode + "/30", log),
      api("Instrument/GetInstrumentSearch/" + encodeURIComponent(opt.base), log),
    ]);
    var bl = results[0], dl = results[1], se = results[2];

    // دفتر سفارش اختیار
    var rows = bl && (bl.bestLimits || bl.bestLimit);
    if (rows && rows.length) {
      var r1 = rows.filter(function (r) { return pick(r, /^number$/i) === 1; })[0] || rows[0];
      var ask = pick(r1, /^pMeOf$/i), bid = pick(r1, /^pMeDem$/i), bv = pick(r1, /^qTitMeDem$/i);
      if (ask !== undefined && bid !== undefined) {
        inp.ask = Number(ask); inp.bid = Number(bid);
        ok("بهترین فروش " + inp.ask + " | بهترین خرید " + inp.bid);
        if (bv !== undefined) { inp.bidvol = Number(bv); ok("حجم صف خرید " + inp.bidvol); }
      } else { bad("ساختار دفتر سفارش ناشناخته بود (کلیدها: " + Object.keys(r1).join(",") + ")"); }
    } else bad("دفتر سفارش اختیار خوانده نشد");

    // حجم روزانه اختیار
    var list = dl && dl.closingPriceDaily;
    if (list && list.length) {
      list = list.slice().sort(function (a, b) { return b.dEven - a.dEven; });
      var vols = list.map(function (x) { return Number(x.qTotTran5J); }).filter(function (x) { return x > 0; }).slice(0, 20);
      if (vols.length) { inp.vol_o = Math.round(avg(vols)); ok("میانگین حجم روزانه اختیار " + inp.vol_o + " (روزهای معامله‌شده، تا ۲۰ روز اخیر)"); }
      else bad("سابقه حجم اختیار خالی بود");
    } else bad("سابقه معاملات اختیار خوانده نشد");

    // سهم پایه
    var under = null;
    if (se && se.instrumentSearch) {
      var nb = fa(opt.base);
      var c = se.instrumentSearch.filter(function (x) { return fa(x.lVal18AFC) === nb; });
      under = c[0] || null;
    }
    if (!under) { bad("سهم پایه «" + opt.base + "» پیدا نشد"); return { inp: inp, rep: rep, an: an }; }
    ok("سهم پایه: " + opt.base);
    var underCode = under.insCode;
    var u = await Promise.all([
      api("ClosingPrice/GetClosingPriceInfo/" + under.insCode, log),
      api("ClosingPrice/GetClosingPriceDailyList/" + under.insCode + "/250", log),
      api("ClientType/GetClientType/" + under.insCode + "/1/0", log),
    ]);
    var ui = u[0] && u[0].closingPriceInfo;
    if (ui) {
      var S = Number(ui.pDrCotVal) > 0 ? Number(ui.pDrCotVal) : Number(ui.pClosing);
      if (S > 0) { inp.S = S; ok("آخرین معامله سهم پایه " + S); } else bad("قیمت سهم پایه صفر بود");
      var et = ui.instrumentState && ui.instrumentState.cEtaval;
      if (et) {
        if (/^A/.test(et)) { inp.q_halt = "بله"; ok("وضعیت سهم پایه مجاز (" + et + ")"); }
        else if (/^I/.test(et)) { inp.q_halt = "خیر"; bad("سهم پایه ممنوع/متوقف است (" + et + ")"); }
      }
    } else bad("قیمت سهم پایه خوانده نشد");
    var ul = u[1] && u[1].closingPriceDaily;
    if (ul && ul.length) ul = ul.slice().sort(function (a, b) { return b.dEven - a.dEven; });
    if (ul && ul.length) {
      // بازده روزانه نسبت به قیمت پایه دیروز (مقاوم در برابر افزایش سرمایه/تعدیل)
      var rets = [];
      ul.slice().reverse().forEach(function (x) {
        var c = Number(x.pClosing), y = Number(x.priceYesterday);
        if (c > 0 && y > 0 && Math.abs(c / y - 1) < 0.25) rets.push(c / y - 1);
      });
      an.rets = rets;
      var vals = ul.map(function (x) { return Number(x.qTotCap) / 1e9; }).filter(function (x) { return x > 0; }).slice(0, 20);
      if (vals.length) { inp.val_u = Math.round(avg(vals)); ok("میانگین ارزش معاملات روزانه سهم پایه " + inp.val_u + " میلیارد ریال"); }
      if (an.rets && an.rets.length >= 20) ok("سابقه " + an.rets.length + " روز سهم پایه برای تحلیل آماری خوانده شد");
      else bad("سابقه سهم پایه برای تحلیل آماری کافی نیست");
    } else bad("سابقه معاملات سهم پایه خوانده نشد");
    var ct = u[2] && u[2].clientType;
    if (ct && Number(ct.buy_CountI) > 0 && Number(ct.sell_CountI) > 0 && Number(ct.sell_I_Volume) > 0) {
      an.power = (Number(ct.buy_I_Volume) / Number(ct.buy_CountI)) / (Number(ct.sell_I_Volume) / Number(ct.sell_CountI));
      ok("قدرت خریدار حقیقی " + an.power.toFixed(2));
    } else bad("اطلاعات حقیقی/حقوقی خوانده نشد");
    return { inp: inp, rep: rep, an: an, underCode: underCode };
  }

  root.OCCollect = { collect: collect, parseOptionName: parseOptionName, insCodeFromUrl: insCodeFromUrl, daysUntil: daysUntil, j2g: j2g, fa: fa };
  if (typeof module !== "undefined" && module.exports) module.exports = root.OCCollect;
})(typeof self !== "undefined" ? self : this);

}catch(e){try{console.error('didehban:collect-opt.js',e)}catch(_){}}

;try{
/* خواندن جدول‌های مالی (ترازنامه، سود و زیان، ...) مستقیم از DOM صفحه‌ی TSETMC.
   در همه‌ی فریم‌ها اجرا می‌شود؛ نتیجه با postMessage به فریم اصلی می‌رود و آنجا ذخیره می‌شود. */
(function (root) {
  "use strict";
  var DATE_RE = /\d{4}\/\d{1,2}\/\d{1,2}/;

  function latin(s) {
    return String(s || "")
      .replace(/[۰-۹]/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹".indexOf(d); })
      .replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); });
  }
  function fa(s) { return String(s || "").replace(/[يى]/g, "ی").replace(/ك/g, "ک"); }
  function clean(s) { return fa(latin(s)).replace(/[\u200c\u200e\u200f\u00a0]/g, " ").replace(/\u00ad/g, "").replace(/\s+/g, " ").trim(); }

  // «106-» و «(106)» و «-106» همه منفی‌اند
  function parseNum(t) {
    t = clean(t).replace(/[٬,،]/g, "").replace(/٫/g, ".");
    if (t === "" || t === "-" || t === "—") return null;
    var m = t.match(/^(\()?\s*(-)?\s*(\d+(?:\.\d+)?)\s*(-)?\s*(\))?$/);
    if (!m) return null;
    var v = Number(m[3]);
    if (!isFinite(v)) return null;
    return (m[1] || m[2] || m[4]) ? -v : v;
  }

  function kindOf(labels) {
    var t = labels.join("|").replace(/[\s\u200c()\-]/g, "");
    if (/جمعداراییها|جمعبدهیها|حقوقمالکانه|حقوقصاحبانسهام|داراییهایجاری/.test(t)) return "bs";
    if (/درآمدهایعملیاتی|بهایتمامشده|سودزیانناخالص|سودزیانخالص|سودزیانعملیاتی/.test(t)) return "is";
    if (/فعالیتهایعملیاتی/.test(t) && /وجهنقد/.test(t)) return "cf";
    return null;
  }

  function pageInfo(doc) {
    var txt = clean((doc.body && doc.body.innerText) || "");
    var title = (txt.match(/اطلاعات و صورت[^\n]{0,120}?\((?:[^)]*)\)/) || txt.match(/اطلاعات و صورت.{0,120}/) || [""])[0];
    var months = (title.match(/دوره\s*(\d+)\s*ماهه/) || [])[1];
    var end = (title.match(/منتهی به\s*(\d{4}\/\d{1,2}\/\d{1,2})/) || [])[1];
    var sym = (txt.match(/\(([^()\s]{2,12})\)\s*-\s*بازار/) || [])[1] || "";
    var scope = (title.match(/تلفیقی|جداگانه|شرکت اصلی/) || [""])[0];
    var audit = (title.match(/حسابرسی\s*(نشده|شده)/) || [])[0] || "";
    var sel = [];
    try {
      Array.prototype.forEach.call(doc.querySelectorAll("select"), function (se) {
        var o = se.options && se.options[se.selectedIndex];
        var t = o ? clean(o.text) : "";
        if (t.length >= 2 && t.length <= 60 && !/\d/.test(t) && !/^(همه|انتخاب)/.test(t)) sel.push(t);
      });
    } catch (e) {}
    return { title: title, months: months ? Number(months) : (title ? 12 : null), end: end || null, sym: sym, scope: scope, audit: audit, sel: sel };
  }

  // نزدیک‌ترین عنوان بالای جدول (نام شرکت/زیرمجموعه)، بدون تاریخ و عددهای دوره
  function nearestLabel(tb) {
    var cap = tb.querySelector && tb.querySelector("caption");
    var ok = function (t) {
      return t.length >= 3 && t.length <= 120 && !/اطلاعات و صورت|^ترازنامه$|^سود و زیان|^جریان|^\d+$/.test(t) && !DATE_RE.test(t);
    };
    if (cap) { var c = clean(cap.innerText || cap.textContent); if (ok(c)) return c; }
    var el = tb;
    for (var up = 0; up < 4 && el; up++, el = el.parentElement) {
      var sib = el.previousElementSibling, n = 0;
      while (sib && n < 4) {
        if (!(sib.querySelector && sib.querySelector("table"))) {
          var t = clean(sib.innerText || sib.textContent || "");
          if (ok(t)) return t;
        }
        sib = sib.previousElementSibling; n++;
      }
    }
    return "";
  }

  // نام منبع نباید به تب (ترازنامه / سود و زیان / ...) وابسته باشد
  function stripKind(t) {
    t = clean(t).replace(/ترازنامه|صورت\s*سود\s*و\s*زیان|سود\s*و\s*زیان|صورت\s*وضعیت\s*مالی|وضعیت\s*مالی|جریان(ها)?ی?\s*وجوه?\s*نقد|صورت\s*(های)?\s*مالی|اطلاعات|میان\s*دوره\s*ای|سالانه|حسابرسی\s*(نشده|شده)/g, " ").replace(/\s+/g, " ").trim();
    return t.length >= 2 ? t : "";
  }

  function readTable(tb, info) {
    var trs = Array.prototype.slice.call(tb.querySelectorAll("tr"));
    if (trs.length < 3) return null;
    var cellsOf = function (tr) { return Array.prototype.slice.call(tr.children).filter(function (c) { return /^(TD|TH)$/i.test(c.tagName); }).map(function (c) { return clean(c.innerText || c.textContent); }); };
    var hi = -1, head = null;
    for (var i = 0; i < Math.min(trs.length, 4); i++) {
      var c = cellsOf(trs[i]);
      if (c.length >= 3 && (c.some(function (x) { return DATE_RE.test(x); }) || c.some(function (x) { return /^شرح/.test(x); }))) { hi = i; head = c; break; }
    }
    if (hi < 0) return null;
    var li = 0, ci = -1;
    head.forEach(function (h, j) { if (/^شرح/.test(h)) li = j; if (/درصد|تغییر/.test(h) && !DATE_RE.test(h)) ci = j; });
    var vcols = [];
    head.forEach(function (h, j) { if (j !== li && j !== ci) vcols.push(j); });
    var rows = [], labels = [], numeric = 0;
    for (var r = hi + 1; r < trs.length; r++) {
      var cs = cellsOf(trs[r]);
      if (cs.length < 1) continue;
      var lab = cs[li];
      if (!lab || parseNum(lab) !== null) continue;
      var vals = vcols.map(function (j) { return cs[j] === undefined ? null : parseNum(cs[j]); });
      var has = vals.some(function (v) { return v !== null; });
      if (has) numeric++;
      else if (cs.length > 2) continue;          // ردیف خالی؛ سطر عنوان‌دار تک‌سلولی نگه داشته می‌شود
      rows.push({ l: lab, v: vals, ch: ci >= 0 && cs[ci] !== undefined ? parseNum(cs[ci]) : null, sec: !has });
      labels.push(lab);
    }
    if (numeric < 3) return null;
    var kind = kindOf(labels);
    if (!kind) return null;
    var cols = vcols.map(function (j) { return head[j]; });
    var firstDate = null;
    cols.forEach(function (h) { var m = h.match(DATE_RE); if (m && !firstDate) firstDate = m[0]; });
    var end = info.end || firstDate || "";
    var near = stripKind(nearestLabel(tb));
    var sel = info.sel.map(stripKind).filter(Boolean).join("/");
    var core = [info.sym, info.scope].filter(Boolean).join(" | ");
    var ent = [core, near, sel].filter(Boolean).join(" | ");
    return { v: 2, kind: kind, title: info.title, months: info.months, end: end, audit: info.audit, ent: ent, core: core, cols: cols, rows: rows, at: Date.now() };
  }

  var lastSig = {};
  function scan(doc, send) {
    var tbs;
    try { tbs = doc.querySelectorAll("table"); } catch (e) { return; }
    if (!tbs.length) return;
    var info = pageInfo(doc), out = [], used = {};
    Array.prototype.forEach.call(tbs, function (tb) {
      if (tb.querySelector("table")) return;     // فقط جدول‌های داخلی
      var t = readTable(tb, info);
      if (!t) return;
      var base = [t.kind, t.ent, t.end, t.months || "", t.audit].join("|");
      used[base] = (used[base] || 0) + 1;
      t.key = used[base] > 1 ? base + "#" + used[base] : base;
      var sig = JSON.stringify([t.cols, t.rows]);
      if (lastSig[t.key] === sig) return;
      lastSig[t.key] = sig;
      out.push(t);
    });
    if (out.length) send({ sym: info.sym, tables: out });
  }

  root.FinCollect = { scan: scan, parseNum: parseNum, clean: clean, kindOf: kindOf, latin: latin };
})(typeof self !== "undefined" ? self : this);

}catch(e){try{console.error('didehban:collect-fin.js',e)}catch(_){}}

;try{
/* خواندن فایل اکسل صورت‌های مالی کدال (بدون کتابخانه‌ی بیرونی) و تبدیل به جدول‌های ترازنامه / سود و زیان / جریان نقد */
(function (root) {
  "use strict";
  var FC = function () { return root.FinCollect; };

  // ---------- zip ----------
  function u16(d, o) { return d[o] | (d[o + 1] << 8); }
  function u32(d, o) { return (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0; }
  function inflateRaw(bytes) {
    var ds = new DecompressionStream("deflate-raw");
    var w = ds.writable.getWriter(); w.write(bytes); w.close();
    return new Response(ds.readable).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function unzip(buf) {
    var d = new Uint8Array(buf), eocd = -1;
    for (var i = d.length - 22; i >= Math.max(0, d.length - 70000); i--) { if (d[i] === 0x50 && d[i + 1] === 0x4b && d[i + 2] === 5 && d[i + 3] === 6) { eocd = i; break; } }
    if (eocd < 0) return Promise.reject(new Error("فایل اکسل معتبر نیست"));
    var n = u16(d, eocd + 10), off = u32(d, eocd + 16), files = {}, jobs = [];
    var dec = new TextDecoder("utf-8");
    for (var k = 0; k < n; k++) {
      if (u32(d, off) !== 0x02014b50) break;
      var method = u16(d, off + 10), csize = u32(d, off + 20), nlen = u16(d, off + 28), elen = u16(d, off + 30), clen = u16(d, off + 32), lho = u32(d, off + 42);
      var name = dec.decode(d.subarray(off + 46, off + 46 + nlen));
      off += 46 + nlen + elen + clen;
      (function (name, method, csize, lho) {
        var ln = u16(d, lho + 26), le = u16(d, lho + 28), st = lho + 30 + ln + le, raw = d.subarray(st, st + csize);
        if (!/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(name)) return;
        jobs.push((method === 0 ? Promise.resolve(raw) : inflateRaw(raw)).then(function (b) { files[name] = dec.decode(b); }));
      })(name, method, csize, lho);
    }
    return Promise.all(jobs).then(function () { return files; });
  }

  // ---------- xml ----------
  function unesc(t) { return String(t).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (_, c) { return String.fromCharCode(+c); }).replace(/&amp;/g, "&"); }
  function textOf(x) { var o = "", re = /<t[^>]*>([\s\S]*?)<\/t>/g, m; while ((m = re.exec(x))) o += m[1]; return unesc(o); }
  function colIdx(ref) { var m = /^([A-Z]+)/.exec(ref), n = 0; if (!m) return 0; for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64); return n - 1; }

  function parseSheet(xml, sst) {
    var rows = [], rr = /<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g, m;
    while ((m = rr.exec(xml))) {
      var body = m[1] || "", row = [], cr = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, c;
      while ((c = cr.exec(body))) {
        var at = c[1], inner = c[2] || "";
        var ref = (/\br="([A-Z]+\d+)"/.exec(at) || [])[1], t = (/\bt="(\w+)"/.exec(at) || [])[1];
        if (!ref) continue;
        var v = (/<v>([\s\S]*?)<\/v>/.exec(inner) || [])[1], val = null;
        if (t === "s") val = v !== undefined ? sst[+v] : null;
        else if (t === "inlineStr") val = textOf(inner);
        else if (t === "str") val = v !== undefined ? unesc(v) : null;
        else if (v !== undefined && v !== "") { var nv = Number(v); val = isFinite(nv) ? nv : unesc(v); }
        row[colIdx(ref)] = val;
      }
      rows.push(row);
    }
    return rows;
  }

  function parse(buf) {
    return unzip(buf).then(function (f) {
      var sst = [], sx = f["xl/sharedStrings.xml"];
      if (sx) { var re = /<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g, m; while ((m = re.exec(sx))) sst.push(textOf(m[1] || "")); }
      var wb = f["xl/workbook.xml"] || "", rels = f["xl/_rels/workbook.xml.rels"] || "", rmap = {};
      var rr = /<Relationship\b[^>]*>/g, m2;
      while ((m2 = rr.exec(rels))) { var id = (/\bId="([^"]+)"/.exec(m2[0]) || [])[1], tg = (/\bTarget="([^"]+)"/.exec(m2[0]) || [])[1]; if (id && tg) rmap[id] = tg.replace(/^\/?(xl\/)?/, ""); }
      var sheets = [], sr = /<sheet\b[^>]*>/g, m3, idx = 0;
      while ((m3 = sr.exec(wb))) {
        idx++;
        var name = unesc((/\bname="([^"]*)"/.exec(m3[0]) || [])[1] || "sheet" + idx), rid = (/\br:id="([^"]+)"/.exec(m3[0]) || [])[1];
        var path = "xl/" + (rmap[rid] || ("worksheets/sheet" + idx + ".xml"));
        if (f[path]) sheets.push({ name: name, rows: parseSheet(f[path], sst) });
      }
      return sheets;
    });
  }

  // ---------- تبدیل شیت‌ها به جدول ----------
  var DATE_RE = /\d{4}\/\d{1,2}\/\d{1,2}/;
  function str(v) { return v === null || v === undefined ? "" : FC().clean(typeof v === "number" ? String(v) : v); }
  function tablesFromSheets(sheets, info) {
    var out = [], notes = [];
    sheets.forEach(function (sh) {
      var rows = sh.rows, hr = -1, hdr = null;
      for (var i = 0; i < Math.min(rows.length, 25); i++) {
        var r = rows[i] || [], dc = [];
        for (var j = 0; j < r.length; j++) { if (r[j] !== null && r[j] !== undefined && DATE_RE.test(str(r[j]))) dc.push(j); }
        if (dc.length >= 2) { hr = i; hdr = dc; break; }
      }
      if (hr < 0) { notes.push(sh.name + ": سرستون تاریخ‌دار پیدا نشد"); return; }
      var cnt = {};
      for (var a = hr + 1; a < Math.min(rows.length, hr + 150); a++) {
        var rw = rows[a] || [];
        for (var c = 0; c < rw.length; c++) { if (hdr.indexOf(c) >= 0) continue; var tv = rw[c]; if (typeof tv === "string" && str(tv).length > 2 && FC().parseNum(tv) === null) cnt[c] = (cnt[c] || 0) + 1; }
      }
      var lc = -1, best = 0; Object.keys(cnt).forEach(function (k) { if (cnt[k] > best) { best = cnt[k]; lc = +k; } });
      if (lc < 0) { notes.push(sh.name + ": ستون عنوان ردیف‌ها پیدا نشد"); return; }
      var res = [], labels = [], numeric = 0;
      for (var b = hr + 1; b < rows.length; b++) {
        var rb = rows[b] || [], lab = str(rb[lc]);
        if (!lab || FC().parseNum(lab) !== null) continue;
        var vals = hdr.map(function (j) { var x = rb[j]; if (typeof x === "number") return x; return x === null || x === undefined ? null : FC().parseNum(String(x)); });
        var has = vals.some(function (x) { return x !== null; });
        if (has) numeric++;
        res.push({ l: lab, v: vals, ch: null, sec: !has }); labels.push(lab);
      }
      if (numeric < 3) { notes.push(sh.name + ": ردیف عددی کافی نبود"); return; }
      var kind = FC().kindOf(labels);
      if (!kind) { notes.push(sh.name + ": نوع جدول شناخته نشد"); return; }
      var cols = hdr.map(function (j) { return str(rows[hr][j]); });
      var d0 = (cols[0].match(DATE_RE) || [])[0];
      out.push({ v: 2, kind: kind, title: info.title, months: kind === "bs" ? info.months : info.months, end: info.end || d0 || "", audit: info.audit || "", ent: sh.name, core: info.core || "", cols: cols, rows: res, src: "codal", at: Date.now() });
    });
    return { tables: out, notes: notes };
  }


  // ---------- فایل «اکسل» کدال: در واقع HTML با پسوند xls (جدول‌های rayanDynamicStatement) ----------
  function headingKind(h) {
    h = FC().clean(h);
    if (/^صورت\s*سود\s*و\s*زیان$/.test(h)) return "is";
    if (/صورت\s*وضعیت\s*مالی/.test(h)) return "bs";
    if (/صورت\s*جریان.*نقد/.test(h)) return "cf";
    return null;
  }
  function readStatementTable(tb) {
    var heads = tb.querySelectorAll("thead tr");
    if (!heads.length) return null;
    var cellsOf = function (tr) { return Array.prototype.map.call(tr.children, function (c) { return FC().clean(c.textContent); }); };
    var h0 = cellsOf(heads[0]), h1 = heads[1] ? cellsOf(heads[1]) : [];
    var ci = -1, vcols = [];
    h0.forEach(function (h, j) { if (j === 0) return; if (/درصد|تغییر/.test(h) && !DATE_RE.test(h)) ci = j; else vcols.push(j); });
    if (vcols.length < 2) return null;
    var rows = [], numeric = 0;
    Array.prototype.forEach.call(tb.querySelectorAll("tbody tr"), function (tr) {
      var cs = cellsOf(tr);
      if (cs.length < 2) return;
      var lab = cs[0];
      if (!lab || FC().parseNum(lab) !== null) return;
      var vals = vcols.map(function (j) { return cs[j] === undefined ? null : FC().parseNum(cs[j]); });
      var has = vals.some(function (x) { return x !== null; });
      if (has) numeric++;
      rows.push({ l: lab, v: vals, ch: ci >= 0 && cs[ci] !== undefined ? FC().parseNum(cs[ci]) : null, sec: !has });
    });
    if (numeric < 3) return null;
    return { cols: vcols.map(function (j) { return h0[j]; }), audits: h1, rows: rows };
  }
  function parseHtml(text, info) {
    var doc = new DOMParser().parseFromString(text, "text/html"), cur = "", out = [], notes = [], seen = {};
    Array.prototype.forEach.call(doc.querySelectorAll("h3, table"), function (n) {
      if (n.tagName === "H3") { cur = FC().clean(n.textContent); return; }
      var kind = headingKind(cur);
      if (!kind || seen[kind]) return;
      var t = readStatementTable(n);
      if (!t) return;
      seen[kind] = 1;
      var d0 = (t.cols[0].match(DATE_RE) || [])[0];
      out.push({ v: 2, kind: kind, title: info.title, months: info.months, end: info.end || d0 || "", audit: (t.audits[0] || info.audit || ""), ent: info.title || cur, core: info.core || "", cols: t.cols, rows: t.rows, src: "codal", at: Date.now() });
    });
    // سود سهام مصوب مجمع سال مالی گذشته (میلیون ریال) از جدول گزارش تفسیری
    var div = null;
    Array.prototype.forEach.call(doc.querySelectorAll("table"), function (tb) {
      if (div !== null) return;
      var th = tb.querySelectorAll("thead tr th");
      var idx = -1;
      Array.prototype.forEach.call(th, function (c, j) { if (idx < 0 && /سود\s*سهام\s*مصوب\s*مجمع/.test(FC().clean(c.textContent))) idx = j; });
      if (idx < 0) return;
      var r = tb.querySelector("tbody tr"); if (!r || !r.children[idx]) return;
      var v = FC().parseNum(r.children[idx].textContent); if (v !== null) div = Math.abs(v);
    });
    if (div !== null) out.forEach(function (t) { if (t.kind === "is") t.extra = { divApproved: div }; });
    ["is", "bs", "cf"].forEach(function (k) { if (!seen[k]) notes.push(k + ": در فایل پیدا نشد"); });
    return { tables: out, notes: notes };
  }
  // ورودی: ArrayBuffer فایل. xlsx واقعی (zip) یا HTML
  function read(buf, info) {
    var d = new Uint8Array(buf);
    if (d[0] === 0x50 && d[1] === 0x4b) return parse(buf).then(function (sh) { return tablesFromSheets(sh, info); });
    var text = new TextDecoder("utf-8").decode(d);
    return Promise.resolve(parseHtml(text, info));
  }

  function infoFromTitle(title) {
    var t = FC().clean(title || ""), L = FC().latin(t);
    var m = (L.match(/(\d+)\s*ماهه/) || [])[1];
    var end = (L.match(/منتهی به\s*(\d{4}\/\d{1,2}\/\d{1,2})/) || [])[1];
    if (end) end = end.replace(/\/(\d)(?=\/|$)/g, "/0$1");
    return { title: t, months: m ? Number(m) : 12, end: end || "", audit: (t.match(/حسابرسی\s*(نشده|شده)/) || [""])[0], core: "کدال" };
  }

  root.CodalFin = { parse: parse, read: read, parseHtml: parseHtml, tablesFromSheets: tablesFromSheets, infoFromTitle: infoFromTitle };
})(typeof self !== "undefined" ? self : this);

}catch(e){try{console.error('didehban:codal-fin.js',e)}catch(_){}}

;try{
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

}catch(e){try{console.error('didehban:chain.js',e)}catch(_){}}

;try{
/* موتور مشاور: تحلیل سهم پایه + زنجیره‌ی اختیارها ← بهترین حالت (خرید/فروش Call/Put)، مشخصات ایده‌آل و نزدیک‌ترین اختیار */
(function (root) {
  "use strict";
  var SC = root.StockChecklist, OC = root.OptionChecklist;
  if (typeof module !== "undefined" && module.exports) {
    SC = SC || require("./engine-stock.js");
    OC = OC || require("./engine-opt.js");
  }

  function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }
  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function median(a) {
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; }), k = Math.floor(s.length / 2);
    return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
  }
  function num(x) { if (x === null || x === undefined || x === "") return null; var n = Number(x); return isFinite(n) ? n : null; }
  function tdOf(o) { return o.tdov > 0 ? o.tdov : Math.max(0, Math.round(o.cal_days * 5 / 7 * 0.92)); }

  // ---------- توزیع قیمت سهم در سررسید: لگ‌نرمال با کمی انحراف به‌سمت نظر تحلیل ----------
  var ZG = [], WG = [];
  (function () {
    var sum = 0, z;
    for (z = -4; z <= 4.0001; z += 0.05) { ZG.push(z); var w = Math.exp(-z * z / 2); WG.push(w); sum += w; }
    for (var i = 0; i < WG.length; i++) WG[i] /= sum;
  })();
  function dist(S, sigma, td, m) {
    var s = sigma * Math.sqrt(td), mu = Math.log(S) + m - 0.5 * s * s, xs = new Array(ZG.length);
    for (var i = 0; i < ZG.length; i++) xs[i] = Math.exp(mu + s * ZG[i]);
    return xs;
  }

  // ---------- نوسان ضمنی از قیمت (نوسان روزانه، بدون نرخ بهره؛ هم‌خوان با ارزش تئوری موتور اختیار) ----------
  function impliedVol(call, S, K, price, td) {
    if (!(S > 0 && K > 0 && price > 0 && td > 0)) return null;
    var intr = Math.max(call ? S - K : K - S, 0);
    if (!(price > intr + 1e-9)) return null;
    var lo = 1e-4, hi = 0.3;
    if (OC.fairValue(call, S, K, hi, td) < price) return null;
    for (var i = 0; i < 50; i++) { var mid = (lo + hi) / 2; if (OC.fairValue(call, S, K, mid, td) < price) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }

  // ---------- خلاصه‌ی تحلیل مالی (بنیادی) برای ترکیب با نمودار ----------
  // fin: همان شیء ذخیره‌شده‌ی تب «🏦 مالی»؛ inp: ورودی‌های سهم (pe, pe_sec, eps_site)
  function finView(fin, S, inp) {
    var out = { ok: false, d: 0, score: null, verdict: "", good: [], bad: [], pe: null, peSec: null };
    if (!fin || !SC || !SC.finAnalyze) return out;
    var hasAny = (fin.y0 && Object.keys(fin.y0).length) || (fin.y1 && Object.keys(fin.y1).length);
    if (!hasAny) return out;
    inp = inp || {};
    var eps = num(inp.eps_site); if (eps === null && fin.epsTbl !== undefined) eps = num(fin.epsTbl);
    var r;
    try { r = SC.finAnalyze(fin, num(S), inp.pe_sec, { eps: eps, pe: num(inp.pe) }); } catch (e) { return out; }
    if (!r || r.score === null || r.score === undefined) return out;
    out.ok = true; out.score = r.score; out.verdict = r.verdict;
    out.good = (r.notes && r.notes.good || []).slice(0, 4); out.bad = (r.notes && r.notes.bad || []).slice(0, 4);
    out.pe = r.val && r.val.pe ? r.val.pe : null; out.peSec = num(inp.pe_sec);
    out.z = r.z; out.fscore = r.fscore;
    var d = (r.score - 50) / 30;
    if (out.pe && out.pe > 0 && out.peSec > 0) { var ratio = out.pe / out.peSec; if (ratio < 0.7) d += 0.2; else if (ratio > 1.5) d -= 0.2; }
    if (out.pe !== null && out.pe < 0) d -= 0.2;
    out.d = clamp(d, -1, 1);
    return out;
  }

  // ---------- دید تحلیلی از روی سهم پایه ----------
  // خروجی: جهت d در بازه [-1, 1]، اطمینان، حالت بازار، سطوح حمایت/مقاومت و نوسان
  // fin (اختیاری): خروجی finView ؛ h (اختیاری): افق روزِ احتمال شرطی (پیش‌فرض ۱۰)
  function stockView(an, S, stockSt, stockInp, fin, h) {
    h = h || 10;
    var v = { ok: false, d: 0, conf: 0, parts: [], notes: [], warn: [] };
    var bars = an && an.bars;
    // نوسان روزانه (لگاریتمی) از سابقه
    var rets = null;
    if (bars && bars.length > 30) {
      rets = [];
      for (var i = 1; i < bars.length; i++) rets.push(Math.log(bars[i].c / bars[i - 1].c));
    } else if (an && an.rets && an.rets.length >= 20) rets = an.rets.map(function (x) { return Math.log(1 + x); });
    if (rets && rets.length >= 20) {
      var r60 = rets.slice(-60), m60 = mean(r60);
      v.sigma = Math.sqrt(mean(r60.map(function (x) { return (x - m60) * (x - m60); })));
      var mAll = mean(rets);
      v.sigmaAll = Math.sqrt(mean(rets.map(function (x) { return (x - mAll) * (x - mAll); })));
      v.volRegime = v.sigmaAll > 0 ? v.sigma / v.sigmaAll : null;
    }
    if (stockInp) {
      if (stockInp.q_sq === "بله") v.warn.push("سهم در صف فروش است؛ قیمت واقعی سهم و اختیار ممکن است همخوان نباشد");
      if (stockInp.q_bq === "بله") v.warn.push("سهم در صف خرید است؛ قیمت واقعی سهم و اختیار ممکن است همخوان نباشد");
      if (stockInp.q_halt === "خیر") v.warn.push("سهم ممنوع/متوقف است");
    }
    if (!bars || bars.length < 60) { v.notes.push("سابقه قیمت برای تحلیل تکنیکال کافی نیست؛ فقط مدل نوسان به‌کار می‌رود (بدون نظر جهتی)"); return v; }
    var D = SC.chartData(an, S, h, stockSt);
    if (!D) return v;
    var T = D.T;
    v.ok = true; v.D = D; v.T = T;
    v.px = D.px;
    // مؤلفه‌ها (هرکدام در بازه -1..۱)
    var comp = [];
    function add(name, val, w, txt) { if (val === null || val === undefined || !isFinite(val)) return; comp.push({ name: name, d: clamp(val, -1, 1), w: w, txt: txt }); }
    if (D.prob && D.prob.p !== undefined) add("احتمال شرطی تاریخی " + h + " روز", (D.prob.p - 0.5) / 0.12, 0.35, "احتمال صعود " + h + " روزه " + Math.round(D.prob.p * 100) + "٪ (" + D.prob.verdict + ")");
    if (T && T.score !== null) add("امتیاز تکنیکال", (T.score - 50) / 30, 0.25, "امتیاز تکنیکال " + T.score + " از ۱۰۰");
    if (T) add("روند", { "صعودی قوی": 1, "صعودی": 0.5, "نزولی": -1 }[T.trendTxt] || 0, 0.2, "روند: " + T.trendTxt);
    var fl = [];
    if (T && T.netreal !== null) fl.push(T.netreal / 0.3);
    if (T && T.power !== null) fl.push((T.power - 1) / 0.8);
    if (fl.length) add("جریان حقیقی/حقوقی", mean(fl.map(function (x) { return clamp(x, -1, 1); })), 0.1, "خالص خرید حقیقی " + (T.netreal !== null ? (T.netreal * 100).toFixed(0) + "٪" : "—") + " | قدرت خریدار " + (T.power !== null ? T.power.toFixed(2) : "—"));
    var mo = 0;
    if (T && T.rsi !== null) { if (T.rsi > 75) mo -= 0.3; else if (T.rsi < 25) mo += 0.3; }
    if (D.divergence) mo += /مثبت/.test(D.divergence) ? 0.3 : -0.3;
    add("اشباع/واگرایی", mo, 0.1, "RSI " + (T && T.rsi !== null ? T.rsi.toFixed(0) : "—") + (D.divergence ? " | " + D.divergence.split(":")[0] : ""));
    if (fin && fin.ok) add("بنیاد (تحلیل مالی)", fin.d, 0.12, "امتیاز مالی " + fin.score + " از ۱۰۰ (" + fin.verdict + ")" + (fin.pe ? " | P/E " + fin.pe.toFixed(1) : ""));
    v.fin = fin && fin.ok ? fin : null;
    var tw = comp.reduce(function (s, c) { return s + c.w; }, 0);
    v.d = tw > 0 ? comp.reduce(function (s, c) { return s + c.d * c.w; }, 0) / tw : 0;
    v.parts = comp;
    // اطمینان: معناداری آماری + هم‌جهتی مؤلفه‌ها
    var pconf = 0.25;
    if (D.prob && D.prob.p !== undefined) pconf = (D.prob.lo > 0.5 || D.prob.hi < 0.5) ? 0.9 : (Math.abs(D.prob.p - 0.5) >= 0.04 ? 0.6 : 0.35);
    var sg = v.d >= 0 ? 1 : -1, nz = comp.filter(function (c) { return Math.abs(c.d) > 0.1; });
    var agree = nz.length ? nz.filter(function (c) { return (c.d >= 0 ? 1 : -1) === sg; }).length / nz.length : 0.5;
    v.conf = clamp(pconf * (0.5 + 0.5 * agree), 0.1, 1);
    v.agree = agree;
    // حالت بازار
    var adx = D.series && D.series.adx ? D.series.adx[D.series.adx.length - 1] : null;
    v.adx = adx;
    v.range = adx !== null && adx < 20;
    v.dirTxt = v.d > 0.25 ? "صعودی" : v.d < -0.25 ? "نزولی" : "خنثی / نامشخص";
    v.confTxt = v.conf >= 0.7 ? "اطمینان بالا" : v.conf >= 0.4 ? "اطمینان متوسط" : "اطمینان پایین";
    // سطوح
    var sup = D.sr && D.sr.sup.length ? D.sr.sup[0] : null, res = D.sr && D.sr.res.length ? D.sr.res[0] : null;
    var sg10 = (v.sigma || 0.02) * Math.sqrt(10);
    v.sup = sup; v.res = res;
    v.tUp = res || D.px * Math.exp(1.2 * sg10);
    v.tDn = sup || D.px * Math.exp(-1.2 * sg10);
    v.tUpEst = !res; v.tDnEst = !sup;
    v.prob = D.prob;
    v.resP = D.sr && D.sr.resP ? D.sr.resP[0] : null; v.supP = D.sr && D.sr.supP ? D.sr.supP[0] : null;
    v.h = h; v.divergence = D.divergence;
    return v;
  }

  // ---------- پیش‌بینی توزیع قیمت سهم در سررسید (همان توزیعی که اختیارها را با آن می‌سنجیم) ----------
  function outlook(v, S, td, kf) {
    if (!v || !v.sigma || !(S > 0) || !(td > 0)) return null;
    kf = kf === undefined ? 0.5 : kf;
    var kview = v.ok ? kf * v.d * v.conf : 0;
    var m = kview * Math.sqrt(Math.min(td, 20)) * v.sigma;
    var s = v.sigma * Math.sqrt(td), mu = Math.log(S) + m - 0.5 * s * s;
    var o = { td: td, S: S, m: m, s: s, mu: mu, median: Math.exp(mu), mean: S * Math.exp(m), low68: Math.exp(mu - s), high68: Math.exp(mu + s), low95: Math.exp(mu - 1.96 * s), high95: Math.exp(mu + 1.96 * s) };
    o.retMed = o.median / S - 1;
    o.pUp = 1 - OC.ncdf((Math.log(S) - mu) / s);
    o.pAbove = function (X) { return 1 - OC.ncdf((Math.log(X) - mu) / s); };
    return o;
  }


  // =====================================================================
  //  «دارم؛ بفروشم؟»: نگه‌دار / بخشی بفروش / بفروش + کی و کجا
  // =====================================================================
  function holdAdvice(o) {
    var out = { ok: false, issues: [] };
    var S = num(o.S), buy = num(o.buy);
    if (!(S > 0)) out.issues.push("آخرین معامله سهم خوانده نشده؛ «خواندن از سایت» را بزن.");
    if (!(buy > 0)) out.issues.push("قیمت خرید خودت را وارد کن.");
    if (!o.an || !o.an.bars || o.an.bars.length < 60) out.issues.push("سابقه‌ی قیمت (حداقل ۶۰ روز) خوانده نشده؛ «خواندن از سایت» را بزن.");
    if (out.issues.length) return out;
    var us = o.stockSt || {}, st = SC.effective(us), T = SC.tech(o.an, S, st);
    if (!T || !(T.atr > 0)) { out.issues.push("محاسبه‌ی ATR ممکن نشد (سابقه کافی نیست)."); return out; }
    var inp = Object.assign({}, o.inp || {}, { S: S });
    var v = stockView(o.an, S, us, inp, o.fin || null, 10), ol = outlook(v, S, 10, 0.5), D = SC.chartData(o.an, S, 10, us);
    var fb = st.fee_buy, fs = st.fee_sell, atr = T.atr, qty = num(o.qty) > 0 ? num(o.qty) : null;
    var cost = buy * (1 + fb), net = S * (1 - fs) - cost, netPct = net / cost, be = cost / (1 - fs);
    var held = num(o.held), reasons = [], sig = [];
    function add(name, sv, w, txt) { sig.push({ name: name, s: Math.max(-1, Math.min(1, sv)), w: w, txt: txt }); }

    // --- سیگنال‌ها (منفی = فشار فروش، مثبت = دلیل نگه‌داشتن)
    if (v.ok) add("دید تحلیلی (نمودار" + (v.fin ? " + مالی" : "") + ")", v.d * Math.max(0.3, v.conf), 0.35, v.dirTxt + " | " + v.confTxt);
    var trendS = 0, trendTxt = "روند: " + T.trendTxt;
    if (T.sma50 !== null && S < T.sma50) trendS -= 0.8; else if (T.sma50 !== null && S > T.sma50) trendS += 0.4;
    if (T.sma20 !== null && S < T.sma20) trendS -= 0.4; else if (T.sma20 !== null && S > T.sma20) trendS += 0.3;
    if (T.slope50 !== null && T.slope50 < 0) trendS -= 0.2;
    add("روند (میانگین ۲۰ و ۵۰ روزه)", trendS, 0.2, trendTxt);
    var rsiS = 0; if (T.rsi !== null) { rsiS = T.rsi > 80 ? -0.8 : T.rsi > st.maxrsi ? -0.4 : T.rsi < 30 ? 0.2 : 0; add("RSI", rsiS, 0.1, "RSI " + Math.round(T.rsi) + (T.rsi > st.maxrsi ? " (اشباع خرید)" : T.rsi < 30 ? " (اشباع فروش)" : "")); }
    if (T.macd) add("مومنتوم (MACD)", T.macd.hist > 0 ? (T.macd.hist > T.macd.histPrev ? 0.6 : 0.2) : (T.macd.hist < T.macd.histPrev ? -0.6 : -0.2), 0.1, T.macd.hist > 0 ? "هیستوگرام مثبت" : "هیستوگرام منفی");
    if (T.ext !== null) add("فاصله از میانگین ۲۰ روزه", T.ext > st.maxext ? -0.5 : 0, 0.06, "فاصله " + (T.ext).toFixed(1) + " ATR بالای میانگین ۲۰ روزه");
    if (T.power !== null && T.power !== undefined) add("قدرت خریدار حقیقی", T.power < st.minpower ? -0.4 : T.power > 1.3 ? 0.4 : 0, 0.06, "قدرت خریدار " + T.power.toFixed(2));
    if (o.fin && o.fin.ok) add("بنیاد (تحلیل مالی)", o.fin.d, 0.08, "امتیاز مالی " + o.fin.score + " از ۱۰۰");
    var resList = D && D.sr ? D.sr.res : [], resP = D && D.sr ? D.sr.resP : [], supList = D && D.sr ? D.sr.sup : [];
    if (resList.length && (resList[0] - S) / atr < 0.8) add("نزدیکی به مقاومت", -0.4, 0.06, "مقاومت " + fm(resList[0]) + " فقط " + ((resList[0] - S) / atr).toFixed(1) + " ATR بالاتر است");
    if (held !== null && held > st.tstop && Math.abs(netPct) < atr / S * 1.5) add("خروج زمانی", -0.5, 0.05, "بیش از " + st.tstop + " روز نگه داشته‌ای و حرکتی نبوده");
    var tw = 0, ts = 0; sig.forEach(function (x) { tw += x.w; ts += x.w * x.s; });
    var HS = tw > 0 ? ts / tw : 0;

    // --- حد ضرر شناور
    var stopA = (T.hh20 || S) - 2.5 * atr, stopS = supList.length ? supList[0] - 0.3 * atr : null;
    var stop = stopS !== null ? Math.max(stopA, stopS) : stopA, stopSrc = stopS !== null && stopS >= stopA ? "زیر حمایت " + fm(supList[0]) : "۲٫۵ ATR زیر سقف ۲۰ روزه";
    var uStop = num(o.userStop); if (uStop > 0) { stop = uStop; stopSrc = "حد ضرر خودت"; }
    else if (S >= be + 2 * atr && be > stop && be < S) { stop = be; stopSrc = "سر به سر خودت (چون سودت از ۲ ATR بیشتر است)"; }
    var stopHit = S <= stop;
    var stopNet = stop * (1 - fs) / cost - 1;

    // --- هدف‌ها
    var uT = num(o.userTarget), tg = [];
    function tgItem(price, src, pt) {
      var days = Math.log(price / S) / (v.sigma || 0.02); days = Math.min(250, Math.max(1, Math.round(days * days)));
      return { price: price, src: src, pct: price / S - 1, netPct: price * (1 - fs) / cost - 1, p: pt, days: days };
    }
    if (uT > S) tg.push(tgItem(uT, "هدف خودت", null));
    resList.forEach(function (r, i) { if (tg.length < 2 && !(uT > S && Math.abs(r / uT - 1) < 0.01)) tg.push(tgItem(r, "مقاومت " + (i + 1), resP ? resP[i] : null)); });
    if (!tg.length) tg.push(tgItem(S + 3 * atr, "هدف تقریبی ۳ ATR بالاتر (مقاومتی روی نمودار نیست)", null));
    var rrHold = tg.length && S > stop ? (tg[0].price - S) / (S - stop) : null;

    // --- افق ۱۰ روز بعد
    var hz = ol ? { median: ol.median, low68: ol.low68, high68: ol.high68, pUp: ol.pUp, pProfit: ol.pAbove(be), medNetPct: ol.median * (1 - fs) / cost - 1, lowNetPct: ol.low68 * (1 - fs) / cost - 1, highNetPct: ol.high68 * (1 - fs) / cost - 1 } : null;

    // --- حکم
    var nearT = tg.length && (tg[0].price - S) / atr < 0.6, overheated = T.rsi !== null && T.rsi > st.maxrsi;
    var verdict, ov = null;
    if (stopHit) {
      var isUserStop = stopSrc === "حد ضرر خودت", pct0 = function (x) { return Math.round(x * 100) + "٪"; };
      var conds = [
        { ok: v.ok && v.d >= 0.35 && v.conf >= 0.6, yes: "دید تحلیلی (نمودار" + (v.fin ? " + مالی" : "") + ") قوی و مثبت است: جهت " + (v.ok ? pct0(v.d) : "—") + "، اطمینان " + (v.ok ? pct0(v.conf) : "—") + ".", no: "دید تحلیلی به‌اندازه‌ی کافی قوی و مطمئن نیست (باید جهت ≥ ۳۵٪ و اطمینان ≥ ۶۰٪ باشد)." },
        { ok: T.sma50 !== null && S > T.sma50 && (T.slope50 === null || T.slope50 >= 0), yes: "روند میان‌مدت سالم است: قیمت بالای میانگین ۵۰ روزه (" + fm(T.sma50) + ") و شیب آن صعودی/خنثی است.", no: "روند میان‌مدت آسیب دیده: قیمت زیر میانگین ۵۰ روزه است یا شیب آن نزولی است." },
        { ok: stop - S <= atr, yes: "شکست کم‌عمق است: فقط " + ((stop - S) / atr).toFixed(1) + " ATR زیر خط خروج؛ همین‌قدر نوسان در یک روز عادی هم پیش می‌آید.", no: "شکست عمیق است: " + ((stop - S) / atr).toFixed(1) + " ATR زیر خط خروج (بیش از ۱ ATR)." },
        { ok: !o.fin || !o.fin.ok || o.fin.d > -0.2, yes: o.fin && o.fin.ok ? "بنیاد مانعی نیست (امتیاز مالی " + o.fin.score + " از ۱۰۰)." : "اطلاعات مالی ثبت نشده؛ بنیاد خنثی فرض شد.", no: "بنیاد ضعیف است (امتیاز مالی " + (o.fin ? o.fin.score : "—") + " از ۱۰۰) و صعود را شکننده می‌کند." },
        { ok: HS >= 0.10, yes: "بقیه‌ی نشانه‌ها (RSI، MACD، قدرت خریدار و…) در مجموع منفی نیستند (" + Math.round(HS * 100) + "٪).", no: "بقیه‌ی نشانه‌ها (RSI، MACD، قدرت خریدار و…) به‌اندازه‌ی کافی مثبت نیستند (مجموع " + Math.round(HS * 100) + "٪؛ لازم است حداقل ۱۰٪ باشد)." },
      ];
      ov = { conds: conds, allOk: conds.every(function (c) { return c.ok; }), isUserStop: isUserStop, reclaim: stop, hard: stop - atr };
    }
    if (stopHit && ov.allOk && !ov.isUserStop) verdict = { key: "hold_warn", cls: "w", sym: "🟡", text: "از خط خروج پایین‌تری، ولی نگه‌داشتنِ مشروط منطقی است", why: "شکست کم‌عمق است و روند و دید تحلیلی هنوز مثبت‌اند؛ فروش فوری ممکن است به‌خاطر یک نوسان عادی باشد. شرط‌های زیر را جدی بگیر." };
    else if (stopHit) verdict = { key: "sell", cls: "h", sym: "🔴", text: "بفروش", why: "قیمت به/زیر خط خروج (" + fm(stop) + ") رسیده است" + (ov.isUserStop ? " (حد ضرر خودت؛ انضباط یعنی همان را اجرا کنی" + (ov.allOk ? "، هرچند تحلیل ادامه‌ی نگه‌داشتن را توجیه می‌کند" : "") + ")." : " و دلیل کافی برای استثنا وجود ندارد (جزئیات پایین).") };
    else if (HS < -0.30) verdict = { key: "sell", cls: "h", sym: "🔴", text: "بفروش (همه یا بیشترش)", why: "مجموع نشانه‌ها منفی است (" + Math.round(HS * 100) + "٪)." };
    else if (HS < -0.10 || (netPct > 0.04 && (overheated || nearT))) verdict = { key: "part", cls: "w", sym: "🟠", text: "بخشی بفروش (حدود یک‌سوم تا نصف) و بقیه را با حد ضرر شناور نگه دار", why: HS < -0.10 ? "نشانه‌ها متمایل به ضعف‌اند." : (overheated ? "RSI در اشباع خرید است" : "قیمت کنار مقاومت است") + " و در سود هستی؛ بخشی از سود را قفل کن." };
    else if (HS < 0.12) verdict = { key: "hold_c", cls: "w", sym: "🟡", text: "نگه دار، با احتیاط", why: "نشانه‌ها خنثی یا مختلط‌اند؛ حد ضرر شناور را جدی بگیر." };
    else verdict = { key: "hold", cls: "ok", sym: "🟢", text: "نگه دار", why: "نشانه‌ها در مجموع به نفع ادامه‌ی نگه‌داشتن‌اند." };

    // --- کی بفروشم
    var when = [];
    if (verdict.key === "hold_warn") {
      when.push({ k: "ov1", t: "اگر می‌مانی، حجم را حدود نصف کن تا شکست خط خروج ریسک کل را زیاد نکند." });
      when.push({ k: "ov2", t: "مهلت: اگر پایان معامله‌ی همین امروز یا فردا قیمت دوباره بالای " + fm(stop) + " نبست، بفروش (شکست تأیید شده)." });
      when.push({ k: "ov3", t: "خروج بی‌قید: قیمت پایانی زیر " + fm(stop - atr) + " (۱ ATR زیر خط خروج) یعنی شکست عمیق؛ بدون تردید بفروش." });
    }
    if (verdict.key !== "hold_warn") when.push({ k: "stop", t: "خط خروج (حد ضرر شناور): " + fm(stop) + " (" + ((stop / S - 1) * 100).toFixed(1) + "٪ از قیمت فعلی) — منبع: " + stopSrc + ". اگر قیمت پایانی زیر آن آمد، بدون تردید بفروش؛ نتیجه‌ی خالص حدود " + (stopNet >= 0 ? "+" : "") + (stopNet * 100).toFixed(1) + "٪ نسبت به قیمت خرید است. هر روز که سهم بالا می‌رود این خط را هم بالا بیاور." });
    tg.forEach(function (x, i) { when.push({ k: "t" + (i + 1), t: (i === 0 ? "فروش بخشی در " : "فروش باقی‌مانده در ") + x.src + " " + fm(x.price) + " (" + (x.pct >= 0 ? "+" : "") + (x.pct * 100).toFixed(1) + "٪ از الان؛ سود خالص " + (x.netPct >= 0 ? "+" : "") + (x.netPct * 100).toFixed(1) + "٪ نسبت به خرید)" + (x.p !== null && x.p !== undefined ? " — احتمال لمس در ۱۰ روز آینده حدود " + Math.round(x.p * 100) + "٪" : "") + "؛ با نوسان فعلی معمولاً حدود " + x.days + " روز معاملاتی زمان می‌برد." }); });
    if (T.sma20 !== null) when.push({ k: "ma", t: "نشانه‌ی ضعف: اگر قیمت پایانی زیر میانگین ۲۰ روزه (" + fm(T.sma20) + ") بسته شد و حجم بالا بود، حداقل نصف را بفروش." });
    when.push({ k: "time", t: "خروج زمانی: اگر تا " + (held !== null && held < st.tstop ? (st.tstop - held) + " روز معاملاتی دیگر" : st.tstop + " روز معاملاتی") + " قیمت از محدوده‌ی ±" + (atr / S * 100).toFixed(1) + "٪ بیرون نرفت، سرمایه‌ات بی‌حاصل بسته شده؛ جابه‌جا کن." });
    if (o.agm && o.agm.daysTo !== null && o.agm.daysTo >= 0 && o.agm.daysTo <= Math.round(st.hold * 7 / 5)) when.push({ k: "agm", t: "مجمع " + (o.agm.kind === "announced" ? "(اعلام‌شده) " : "(تخمینی) ") + o.agm.text + " — " + o.agm.daysTo + " روز دیگر. اگر تقسیم سود دارد، بعد از مجمع قیمت معمولاً با حذف سود تعدیل می‌شود؛ تکلیف سهمت را قبل از آن روشن کن." });

    out.ok = true; out.S = S; out.buy = buy; out.qty = qty; out.T = T; out.v = v; out.ol = ol; out.st = st;
    out.pl = { cost: cost, net: net, netPct: netPct, be: be, total: qty ? net * qty : null, value: qty ? S * (1 - fs) * qty : null, invested: qty ? cost * qty : null };
    out.HS = HS; out.signals = sig; out.stop = { price: stop, src: stopSrc, hit: stopHit, net: stopNet, loss: qty ? (stop * (1 - fs) - cost) * qty : null };
    out.targets = tg; out.rrHold = rrHold; out.hz = hz; out.verdict = verdict; out.when = when; out.override = ov;
    return out;
  }

  // =====================================================================
  //  حالت ساده: فقط سرمایه + ریسک‌پذیری → بخر/نخر + سود و زیان در ۱۰ روز / ۱ ماه / ۱ سال
  // =====================================================================
  function rangeTable(v, S, E, qty, st, horizons) {
    var rows = [];
    horizons.forEach(function (h) {
      var ol = outlook(v, S, h, 0.5); if (!ol) return;
      var cost = qty * E * (1 + st.fee_buy);
      function pl(px) { return qty * (px * (1 - st.fee_sell) - E * (1 + st.fee_buy)); }
      var cols = [["min", "حداقل محتمل", -2.326], ["bad", "بد", -1.645], ["mid", "میانه", 0], ["good", "خوب", 1.645], ["max", "حداکثر محتمل", 2.326]].map(function (c) {
        var px = Math.exp(ol.mu + c[2] * ol.s), p = pl(px);
        return { k: c[0], label: c[1], px: px, pl: p, pct: cost > 0 ? p / cost : null };
      });
      var be = E * (1 + st.fee_buy) / (1 - st.fee_sell);
      rows.push({ td: h, cols: cols, pLoss: OC.ncdf((Math.log(be) - ol.mu) / ol.s), cost: cost });
    });
    return rows;
  }
  function simplePlan(o) {
    var out = { ok: false, issues: [] };
    var S = num(o.S), cap = num(o.capital);
    if (!(cap > 0)) out.issues.push("مبلغی که می‌خواهی بگذاری را وارد کن.");
    if (!(S > 0)) out.issues.push("آخرین معامله سهم خوانده نشده؛ «خواندن از سایت» را بزن.");
    if (!o.an || !o.an.bars || o.an.bars.length < 60) out.issues.push("سابقه‌ی قیمت (حداقل ۶۰ روز) خوانده نشده؛ «خواندن از سایت» را بزن.");
    if (out.issues.length) return out;
    var risk = Math.min(10, Math.max(1, Number(o.risk) || 5));
    var us = Object.assign({}, o.stockSt || {}, { risk: risk }), st = SC.effective(us);
    var inp = Object.assign({}, o.inp || {}, { S: S, capital: cap });
    ["entry", "stop", "target", "p", "qty"].forEach(function (k) { delete inp[k]; });
    var v = stockView(o.an, S, us, inp, o.fin || null, 10), ol = outlook(v, S, 10, 0.5);
    var qs = {}; ["trend", "pull", "break"].forEach(function (m) { qs[m] = SC.quote(m, inp, us, o.an); });
    if (!qs.trend.ok && !qs.pull.ok) { out.issues.push((qs.trend.missing || []).join("، ") || "داده‌ی کافی نیست."); return out; }
    var fit = (qs.trend.fit && qs.trend.fit.length ? qs.trend.fit : qs.pull.fit) || [];
    var cands = fit.filter(function (f) { return f.sym === "✅" || f.sym === "⚠"; }).sort(function (a, b) { return (a.sym === b.sym ? 0 : a.sym === "✅" ? -1 : 1) || ((b.score || 0) - (a.score || 0)); });
    var best = cands[0] || null, mode = best ? best.mode : "trend", q = qs[mode].ok ? qs[mode] : (qs.trend.ok ? qs.trend : qs.pull);
    var res = SC.evaluate(mode, inp, us, o.an), blockers = [], warns = [];
    [2, 3, 4].forEach(function (i) { var s = res.steps[i]; if (!s) return; if (s.missing) { if (i === 2) warns.push("نقدشوندگی را نتوانستم بسنجم (ارزش/حجم معاملات روزانه خوانده نشده)."); return; } (s.hard || []).forEach(function (x) { blockers.push(x); }); (s.warn || []).forEach(function (x) { warns.push(x); }); });
    var stop = q.targets.stop, t1 = q.targets.t1, t2 = q.targets.t2;
    var priceOk = q.limit > 0 && S <= q.limit, E = priceOk ? S : (q.limit > 0 ? Math.min(S, q.limit) : S);
    var riskPS = E * (1 + st.fee_buy) - stop * (1 - st.fee_sell);
    var qtyR = riskPS > 0 ? Math.floor(cap * st.riskpct / riskPS) : 0, qtyM = Math.floor(cap * st.maxpos / (E * (1 + st.fee_buy)));
    var qty = Math.max(0, Math.min(qtyR, qtyM));
    var dmin = 0.30 - 0.03 * risk, bear = v.ok && v.d < -0.25 && v.conf >= 0.4, fvBad = o.fin && o.fin.ok && o.fin.score < 35;
    var viewOk = v.ok && v.d >= dmin, why = [];
    if (!best) why.push("هیچ‌کدام از سه الگوی ورود (روندی/اصلاح/شکست) الان با نمودار سهم نمی‌خواند.");
    blockers.forEach(function (x) { why.push("❌ " + x); });
    if (bear) why.push("❌ دید تحلیلی نزولی است (" + v.dirTxt + ").");
    if (fvBad) why.push("❌ بنیاد ضعیف است (امتیاز مالی " + o.fin.score + " از ۱۰۰).");
    if (qty < 1) why.push("❌ با این سرمایه و سقف ریسک " + (st.riskpct * 100).toFixed(1) + "٪، حتی یک سهم هم نمی‌شود خرید.");
    var dec;
    if (!best || blockers.length || bear || fvBad || qty < 1) dec = { cls: "h", sym: "❌", text: "نخر" };
    else {
      if (!priceOk) why.push("⏳ قیمت فعلی (" + fm(S) + ") بالاتر از سقف مجاز ورود (" + fm(q.limit) + ") است.");
      if (!viewOk) why.push("⏳ دید تحلیلی هنوز به اندازه‌ی کافی مثبت نیست (جهت " + Math.round(v.d * 100) + "٪؛ برای این سطح ریسک‌پذیری حداقل " + Math.round(dmin * 100) + "٪ لازم است).");
      if (warns.length >= st.maxwarn) why.push("⏳ تعداد هشدارها (" + warns.length + ") از حد مجاز (" + st.maxwarn + ") بیشتر است.");
      if (!priceOk || !viewOk || warns.length >= st.maxwarn) dec = { cls: "w", sym: "⏳", text: "فعلاً صبر کن" };
      else dec = { cls: "ok", sym: "✅", text: warns.length ? "بخر (با احتیاط)" : "بخر" };
    }
    if (dec.cls === "ok") why.push("✅ الگوی «" + (SC.MODE_FIT[mode] || mode) + "»، قیمت زیر سقف مجاز و دید تحلیلی مثبت است.");
    warns.slice(0, 4).forEach(function (x) { why.push("⚠ " + x); });
    if (v.fin) why.push("بنیاد: امتیاز مالی " + v.fin.score + " از ۱۰۰ (" + v.fin.verdict + ")."); else why.push("اطلاعات مالی این سهم ثبت نشده؛ تحلیل فقط بر پایه‌ی نمودار است.");
    var invested = qty * E * (1 + st.fee_buy), riskAmt = qty * Math.max(riskPS, 0);
    function gain(t) { return t ? qty * (t * (1 - st.fee_sell) - E * (1 + st.fee_buy)) : null; }
    out.ok = true; out.risk = risk; out.st = st; out.mode = mode; out.modeLabel = SC.MODE_FIT[mode] || mode; out.v = v; out.ol = ol; out.dec = dec; out.why = why;
    out.plan = { S: S, E: E, limit: q.limit, zone: q.zone, zoneTxt: q.zoneTxt, stop: stop, t1: t1, t2: t2, qty: qty, invested: invested, investedPct: invested / cap, riskAmt: riskAmt, riskPct: riskAmt / cap, gain1: gain(t1), gain2: gain(t2), rr: q.targets ? q.levels && q.levels[0] ? q.levels[0].rr : null : null, stopSrc: q.targets.stopSrc, t1Src: q.targets.targetSrc, priceOk: priceOk };
    out.ranges = qty >= 1 ? rangeTable(v, S, E, qty, st, [10, 21, 250]) : [];
    out.capital = cap;
    return out;
  }

  // ---------- جمع‌بندی متنی: نماد احتمالاً چطور می‌رود؟ ----------
  function fm(x) { return Math.round(x).toLocaleString("en-US"); }
  function narrative(v, ol, hDays) {
    var out = { headline: "", lines: [], cls: "wait", warn: [] };
    if (!v || !v.ok || !ol) { out.headline = "برای جمع‌بندی، سابقه‌ی قیمت (حداقل ۶۰ روز) لازم است."; return out; }
    var up = v.d > 0.25, dn = v.d < -0.25, hi = v.conf >= 0.7, mid = v.conf >= 0.4;
    var pp = function (x) { return Math.round(x * 100) + "٪"; };
    var rngTxt = fm(ol.low68) + " تا " + fm(ol.high68);
    if (up) out.headline = (mid ? "متمایل به صعود" : "کمی متمایل به صعود") + " — " + v.confTxt;
    else if (dn) out.headline = (mid ? "متمایل به نزول" : "کمی متمایل به نزول") + " — " + v.confTxt;
    else out.headline = "خنثی / نوسانی؛ جهت روشنی دیده نمی‌شود — " + v.confTxt;
    out.cls = (up && mid) ? "ok" : (dn && mid) ? "h" : "wait";
    var days = hDays || ol.td;
    out.lines.push("مسیر محتمل تا " + days + " روز معاملاتی آینده: قیمت مرکزی حدود " + fm(ol.median) + " (" + (ol.retMed >= 0 ? "+" : "") + (ol.retMed * 100).toFixed(1) + "٪ نسبت به قیمت فعلی)، و با احتمال حدود ۶۸٪ بین " + rngTxt + ".");
    out.lines.push("احتمال اینکه در پایان این بازه بالاتر از قیمت فعلی باشد: " + pp(ol.pUp) + " (۵۰٪ یعنی هیچ برتری).");
    if (up) {
      if (v.res) out.lines.push("سناریوی اصلی: ادامه صعود به‌سمت مقاومت " + fm(v.res) + (v.resP !== null && v.resP !== undefined ? " (احتمال لمس آن در این بازه حدود " + pp(v.resP) + ")" : "") + (v.sup ? "؛ شکسته شدن حمایت " + fm(v.sup) + " این سناریو را باطل می‌کند." : "."));
      else out.lines.push("سناریوی اصلی: ادامه صعود؛ مقاومت نزدیکی روی نمودار دیده نمی‌شود" + (v.sup ? "؛ شکسته شدن حمایت " + fm(v.sup) + " این سناریو را باطل می‌کند." : "."));
    } else if (dn) {
      if (v.sup) out.lines.push("سناریوی اصلی: ادامه نزول به‌سمت حمایت " + fm(v.sup) + (v.supP !== null && v.supP !== undefined ? " (احتمال لمس آن در این بازه حدود " + pp(v.supP) + ")" : "") + (v.res ? "؛ عبور بالای مقاومت " + fm(v.res) + " این سناریو را باطل می‌کند." : "."));
      else out.lines.push("سناریوی اصلی: ادامه نزول؛ حمایت نزدیکی روی نمودار دیده نمی‌شود" + (v.res ? "؛ عبور بالای مقاومت " + fm(v.res) + " این سناریو را باطل می‌کند." : "."));
    } else {
      out.lines.push("سناریوی اصلی: حرکت در یک دامنه" + (v.sup && v.res ? " بین حمایت " + fm(v.sup) + " و مقاومت " + fm(v.res) : "") + "؛ شکست هرکدام می‌تواند جهت بعدی را مشخص کند.");
    }
    if (v.range) out.lines.push("ADX " + (v.adx !== null && v.adx !== undefined ? Math.round(v.adx) : "—") + " است؛ روند ضعیف و بازار نوسانی است و سیگنال‌های روندی کم‌اعتبارتر می‌شوند.");
    if (v.fin) {
      var f = v.fin;
      out.lines.push("بنیاد: امتیاز مالی " + f.score + " از ۱۰۰ (" + f.verdict + ")" + (f.pe ? "، P/E " + f.pe.toFixed(1) + (f.peSec ? " در برابر صنعت " + f.peSec : "") : "") + ". " + (f.d > 0.2 && up ? "بنیاد با دید نمودار هم‌جهت است." : f.d < -0.2 && up ? "هشدار: نمودار صعودی است ولی بنیاد ضعیف؛ صعود شکننده‌تر است." : f.d > 0.2 && dn ? "نمودار نزولی است ولی بنیاد قوی؛ افت می‌تواند فرصت یا اصلاح موقت باشد، نه لزوماً شروع روند نزولی بلند." : f.d < -0.2 && dn ? "بنیاد ضعیف نزول را تقویت می‌کند." : "اثر بنیاد در افق کوتاه محدود است."));
      f.bad.slice(0, 2).forEach(function (t) { out.warn.push(t); });
    } else {
      out.lines.push("اطلاعات مالی این سهم ثبت نشده؛ در تب «🏦 مالی» جدول‌ها را بخوان تا بنیاد هم در جمع‌بندی بیاید.");
    }
    if (v.divergence) out.lines.push(v.divergence);
    if (v.warn && v.warn.length) v.warn.forEach(function (t) { out.warn.push(t); });
    return out;
  }

  // ---------- ارزیابی یک گزینه (خرید یا فروش) زیر توزیع مدل ----------
  // o: {type, strike, cal_days/tdov, ask, bid, vol_o, last}  mode: call|put|scall|sput
  function evalCand(mode, o, S, sigma, m, st, hv) {
    var sell = mode === "scall" || mode === "sput", call = mode === "call" || mode === "scall";
    var K = o.strike, td = o.td, fo = st.fee_opt, fe = st.fee_ex, fs = st.fee_sell;
    var xs = dist(S, sigma, td, m), n = xs.length, i;
    var C = { mode: mode, sell: sell, call: call, K: K, td: td, ask: o.ask, bid: o.bid, hard: [], warn: [] };
    C.spread = (o.ask > 0 && o.bid >= 0) ? (o.ask - o.bid) / o.ask : null;
    C.vol_o = o.vol_o;
    C.moneyness = call ? S / K - 1 : K / S - 1;                 // مثبت = در سود (ITM)
    C.fair = OC.fairValue(call, S, K, sigma, td);               // ارزش تئوری با نوسان تاریخی، بدون نظر
    var mid = (o.ask > 0 && o.bid > 0) ? (o.ask + o.bid) / 2 : (o.last > 0 ? o.last : null);
    C.iv = mid ? impliedVol(call, S, K, mid, td) : null;
    C.ivRatio = (C.iv && hv) ? C.iv / hv : null;
    var intr = Math.max(call ? S - K : K - S, 0);
    // پرداخت در سررسید برای یک توزیع (σ دلخواه)؛ نتیجه: امید، انحراف معیار، دم ریسک ۵٪ (فقط فروشنده)
    function moments(sg) {
      var X = sg === sigma ? xs : dist(S, sg, td, m), P = new Array(n), e = 0, e2 = 0, k;
      for (k = 0; k < n; k++) {
        P[k] = sell ? (call ? Math.max(X[k] - K, 0) : Math.max(K - X[k], 0))
          : (call ? Math.max(X[k] * (1 - fs) - K * (1 + fe), 0) : Math.max(K * (1 - fs) - X[k] * (1 + fe), 0));
        e += WG[k] * P[k]; e2 += WG[k] * P[k] * P[k];
      }
      var tail = 0;
      if (sell) {   // میانگین پرداخت در بدترین ۵٪ سناریو برای فروشنده
        var acc = 0, need = 0.05;
        for (k = 0; k < n && acc < need; k++) {
          var idx = call ? n - 1 - k : k, w = Math.min(WG[idx], need - acc);
          tail += w * P[idx]; acc += w;
        }
        tail /= need;
      }
      return { P: P, E: e, sd: Math.sqrt(Math.max(e2 - e * e, 0)), tail: tail };
    }
    var M0 = moments(sigma), pay = M0.P, E = M0.E, sd = M0.sd;
    if (!sell) {
      if (!(o.ask > 0)) C.hard.push("بهترین قیمت فروش (ask) ندارد؛ نمی‌شود خرید");
      var c = (o.ask > 0 ? o.ask : 0) * (1 + fo);
      var Ml = moments(sigma * 0.8);                                // آزمون استرس: نوسان کمتر به ضرر خریدار است
      C.cost = c; C.E = E; C.edge = E - c; C.sd = sd;
      C.edgeW = Math.min(C.edge, Ml.E - c);
      C.sharpe = sd > 0 ? C.edgeW / sd : 0;
      C.roi = c > 0 ? E / c - 1 : null;
      var pp = 0; for (i = 0; i < n; i++) if (pay[i] > c) pp += WG[i];
      C.pProfit = pp;
      C.be = call ? (c + K * (1 + fe)) / (1 - fs) : (K * (1 - fs) - c) / (1 + fe);
      C.beMove = call ? C.be / S - 1 : 1 - C.be / S;
      C.tvp = o.ask > 0 ? Math.max(o.ask - intr, 0) / o.ask : null;
      C.rich = C.fair > 0 && o.ask > 0 ? o.ask / C.fair : null;
      C.pAny = 0; for (i = 0; i < n; i++) if (pay[i] > 0) C.pAny += WG[i];
      if (C.tvp !== null && C.tvp > st.tvmax) C.warn.push("سهم ارزش زمانی از قیمت " + Math.round(C.tvp * 100) + "٪ است (بیشتر از حد " + Math.round(st.tvmax * 100) + "٪)");
    } else {
      if (!(o.bid > 0)) C.hard.push("بهترین قیمت خرید (bid) ندارد؛ نمی‌شود فروخت");
      var pn = (o.bid > 0 ? o.bid : 0) * (1 - fo);
      var Mh = moments(sigma * 1.3);                                // آزمون استرس: نوسان بیشتر به ضرر فروشنده است
      var base = call ? S : K;
      C.premium = pn; C.E = E; C.edge = pn - E; C.sd = sd;
      C.edgeW = Math.min(C.edge, pn - Mh.E);
      C.tailLoss = Math.max(M0.tail - pn, 0);                       // زیان میانگین در بدترین ۵٪ سناریو
      var risk = Math.max(sd, C.tailLoss, 1e-9);
      C.sharpe = C.edgeW / risk;
      C.yield = pn / base; C.monthly = C.yield * 21 / Math.max(td, 1);
      var pl = 0, pa = 0; for (i = 0; i < n; i++) { if (pay[i] > pn) pl += WG[i]; if (pay[i] > 0) pa += WG[i]; }
      C.pLoss = pl; C.pAssign = pa;
      C.be = call ? K + pn : K - pn;
      C.cushion = call ? C.be / S - 1 : 1 - C.be / S;            // فاصله سهم تا سر به سر فروشنده
      C.rich = C.fair > 0 && o.bid > 0 ? o.bid / C.fair : null;
      if (pl > st.assign) C.warn.push("احتمال زیان فروشنده " + Math.round(pl * 100) + "٪ است (بیشتر از حد " + Math.round(st.assign * 100) + "٪)");
      if (C.yield < st.minyield) C.warn.push("بازده پریمیوم " + (C.yield * 100).toFixed(1) + "٪ کمتر از حداقل " + (st.minyield * 100).toFixed(1) + "٪ است");
    }
    if (C.spread !== null && C.spread > st.spread) C.hard.push("اسپرد " + Math.round(C.spread * 100) + "٪ بیشتر از حد مجاز (" + Math.round(st.spread * 100) + "٪)");
    if (o.vol_o !== undefined && o.vol_o !== null && o.vol_o < st.minvol) C.hard.push("میانگین حجم " + Math.round(o.vol_o) + " کمتر از حداقل " + st.minvol);
    if (td < st.mindays) C.hard.push("فقط " + td + " روز معاملاتی تا سررسید (حداقل " + st.mindays + ")");
    var lf = (o.vol_o !== undefined && o.vol_o !== null && st.minvol > 0) ? clamp(o.vol_o / (3 * st.minvol), 0.5, 1) : 1;
    C.score = C.sharpe > 0 ? C.sharpe * lf : C.sharpe;
    C.ok = C.hard.length === 0;
    return C;
  }

  function pminProfit(st) { // حداقل احتمال سودآوری برای خریدار؛ با ریسک‌پذیری آسان‌تر می‌شود
    var a = clamp(st.risk || 5, 1, 10);
    return a <= 5 ? 0.35 + (0.25 - 0.35) * (a - 1) / 4 : 0.25 + (0.15 - 0.25) * (a - 5) / 5;
  }

  // ---------- مشخصات ایده‌آل: جستجو در همه‌ی قیمت‌های اعمال ممکن با قیمت‌گذاری هم‌سطح بازار ----------
  function idealFor(mode, S, sigma, kview, st, expiries, ivM, halfSpread, fLo, fHi) {
    var sell = mode === "scall" || mode === "sput", call = mode === "call" || mode === "scall";
    var best = null, all = [], minPrice = S * 0.003, pmin = pminProfit(st);
    expiries.forEach(function (td) {
      var m = kview * Math.sqrt(Math.min(td, 20)) * sigma;
      for (var f = fLo; f <= fHi + 1e-9; f += 0.01) {
        var K = S * f, fv = OC.fairValue(call, S, K, ivM, td);
        if (!(fv > minPrice)) continue;
        var o = { strike: K, td: td, ask: fv * (1 + halfSpread), bid: fv * (1 - halfSpread), vol_o: null };
        var C = evalCand(mode, o, S, sigma, m, st, sigma);
        C.hard = []; C.ok = true;
        var pass = sell ? (C.pLoss <= st.assign && C.yield >= st.minyield) : (C.pProfit >= pmin);
        C.pass = pass; C.f = f;
        all.push(C);
        if (!best || (pass && !best.pass) || (pass === best.pass && C.score > best.score)) best = C;
      }
    });
    if (!best) return null;
    var band = all.filter(function (x) { return x.td === best.td && x.pass === best.pass && x.score >= best.score * 0.85 && x.score > 0; });
    var Ks = band.map(function (x) { return x.K; });
    return { K: best.K, f: best.f, td: best.td, score: best.score, noEdge: !(best.score > 0), pass: best.pass, price: sell ? best.bid : best.ask, Klo: Ks.length ? Math.min.apply(null, Ks) : best.K, Khi: Ks.length ? Math.max.apply(null, Ks) : best.K, cand: best, pmin: pmin };
  }

  var MODE_LABEL = { call: "خرید Call", put: "خرید Put", scall: "فروش Call", sput: "فروش Put" };

  // ---------- مشاور اصلی ----------
  // ctx: { S, an, stockInp, stockSt, optSt, chain:[...], own:boolean, k:number }
  function advise(ctx) {
    var S = num(ctx.S), out = { ok: false, notes: [], MODE_LABEL: MODE_LABEL };
    var st = OC.effective(ctx.optSt || {});
    out.st = st;
    var view = stockView(ctx.an, S, ctx.stockSt, ctx.stockInp, ctx.fin || null);
    out.view = view;
    if (!(S > 0)) { out.notes.push("قیمت سهم پایه خوانده نشد"); return out; }
    if (!view.sigma) { out.notes.push("سابقه قیمت سهم برای محاسبه نوسان کافی نیست"); return out; }
    var sigma = view.sigma, kf = ctx.k === undefined ? 0.5 : ctx.k;
    var kview = view.ok ? kf * view.d * view.conf : 0;            // انحراف میانه‌ی قیمت به‌ازای هر √روز نوسان
    out.kview = kview;
    var chain = (ctx.chain || []).map(function (o) {
      var x = Object.assign({}, o);
      x.td = tdOf(o);
      return x;
    }).filter(function (o) { return o.td > 0 && o.strike > 0; });
    if (!chain.length) { out.notes.push("زنجیره‌ی اختیارها خالی است"); out.view = view; return out; }

    var cands = [];
    chain.forEach(function (o) {
      var m = kview * Math.sqrt(Math.min(o.td, 20)) * sigma;
      var modes = o.type === "call" ? ["call", "scall"] : ["put", "sput"];
      modes.forEach(function (md) {
        if (md === "scall" && !ctx.own) return;
        var C = evalCand(md, o, S, sigma, m, st, sigma);
        C.o = o; C.insCode = o.insCode; C.sym = o.sym; C.name = o.name; C.type = o.type;
        C.strike = o.strike; C.jy = o.jy; C.jm = o.jm; C.jd = o.jd; C.cal = o.cal_days;
        cands.push(C);
      });
    });
    // نوسان ضمنی ATM
    var ivs = cands.filter(function (c) { return c.iv && Math.abs(c.K / S - 1) < 0.07 && c.td >= st.mindays && c.spread !== null && c.spread < 0.25; }).map(function (c) { return c.iv; });
    if (ivs.length < 2) ivs = cands.filter(function (c) { return c.iv; }).map(function (c) { return c.iv; });
    out.hv = sigma;
    out.ivAtm = median(ivs);
    out.ivRatio = out.ivAtm ? out.ivAtm / sigma : null;
    out.priceTxt = out.ivRatio === null ? "نامشخص" : out.ivRatio > 1.25 ? "گران (نوسان ضمنی بیش از نوسان تاریخی)" : out.ivRatio < 0.85 ? "ارزان (نوسان ضمنی کمتر از نوسان تاریخی)" : "نزدیک به ارزش تئوری";

    var byMode = { call: [], put: [], scall: [], sput: [] };
    cands.forEach(function (c) { byMode[c.mode].push(c); });
    Object.keys(byMode).forEach(function (k) { byMode[k].sort(function (a, b) { return (b.ok - a.ok) || (b.score - a.score); }); });
    out.byMode = byMode; out.cands = cands;
    out.modes = Object.keys(byMode).map(function (k) {
      var list = byMode[k], top = list.filter(function (c) { return c.ok; })[0] || null;
      return { mode: k, label: MODE_LABEL[k], n: list.length, nOk: list.filter(function (c) { return c.ok; }).length, top: top, score: top ? top.score : null, skipped: (k === "scall" && !ctx.own) };
    });
    var avail = out.modes.filter(function (x) { return x.top && !x.skipped; }).sort(function (a, b) { return b.score - a.score; });
    out.best = avail.length ? avail[0] : null;
    out.second = avail.length > 1 ? avail[1] : null;
    if (out.best) {
      var sc = out.best.score;
      out.strength = sc >= 0.10 ? "برتری قابل‌توجه (طبق مدل)" : sc >= 0.04 ? "برتری کم" : "برتری روشنی دیده نمی‌شود؛ ورود با عجله لازم نیست";
      out.strong = sc >= 0.04;
    }

    // مشخصات ایده‌آل برای بهترین حالت (و بقیه حالت‌ها برای مقایسه)
    var expiries = [], seen = {};
    chain.forEach(function (o) { if (o.td >= st.mindays && !seen[o.td]) { seen[o.td] = 1; expiries.push(o.td); } });
    expiries.sort(function (a, b) { return a - b; });
    var sp = cands.filter(function (c) { return c.spread !== null && c.spread < 0.3 && c.ok; }).map(function (c) { return c.spread; });
    var half = clamp((median(sp) || 0.04) / 2, 0.01, 0.08);
    var ivM = out.ivAtm || sigma;
    out.ideal = {};
    var fs_ = chain.map(function (o) { return o.strike / S; });
    var fLo = Math.max(0.6, Math.floor(Math.min.apply(null, fs_) * 100) / 100), fHi = Math.min(1.5, Math.ceil(Math.max.apply(null, fs_) * 100) / 100);
    if (expiries.length) {
      ["call", "put", "scall", "sput"].forEach(function (md) {
        if (md === "scall" && !ctx.own) return;
        var id = idealFor(md, S, sigma, kview, st, expiries, ivM, half, fLo, fHi);
        if (!id) return;
        // نزدیک‌ترین اختیار واقعی به ایده‌آل (هم‌سررسید، فاصله قیمت اعمال به واحد نوسان)
        var sg = sigma * Math.sqrt(id.td), real = byMode[md].filter(function (c) { return c.ok; });
        var near = null;
        real.forEach(function (c) {
          var d = Math.abs(Math.log(c.K / id.K)) / sg + (Math.abs(c.td - id.td) <= 3 ? 0 : 1.5);
          c.dist = d;
          if (!near || d < near.dist) near = c;
        });
        id.nearest = near;
        id.rankOfNearest = near ? byMode[md].filter(function (c) { return c.ok; }).indexOf(near) + 1 : null;
        out.ideal[md] = id;
      });
    }
    out.ok = true;
    return out;
  }

  var api = { advise: advise, stockView: stockView, finView: finView, outlook: outlook, narrative: narrative, holdAdvice: holdAdvice, simplePlan: simplePlan, evalCand: evalCand, impliedVol: impliedVol, MODE_LABEL: MODE_LABEL, dist: dist };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OptAdvisor = api;
})(typeof self !== "undefined" ? self : this);

}catch(e){try{console.error('didehban:advisor.js',e)}catch(_){}}

;try{
/* ذخیره‌سازی مشترک بین پنل سهم و پنل اختیار (کلیدها دستی و با پیشوند مشخص‌اند) */
(function (root) {
  "use strict";
  root.ComboStore = {
    get: function (k, cb) {
      try {
        if (root.chrome && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get(k, function (r) { cb(r && r[k]); });
          return;
        }
      } catch (e) {}
      try { cb(JSON.parse(localStorage.getItem("cb:" + k))); } catch (e) { cb(null); }
    },
    set: function (k, v) {
      try {
        if (root.chrome && chrome.storage && chrome.storage.local) { var o = {}; o[k] = v; chrome.storage.local.set(o); return; }
      } catch (e) {}
      try { localStorage.setItem("cb:" + k, JSON.stringify(v)); } catch (e) {}
    },
  };
})(typeof self !== "undefined" ? self : this);

/* لوگوی «دیده‌بان بورس» (SVG درون‌خطی برای هدر پنل) */
(function (root) {
  root.ComboLogo = function (size) {
    var s = size || 18;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 100 100" style="vertical-align:-4px;margin-inline-end:4px" aria-hidden="true">' +
      '<defs><linearGradient id="dbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1b3a"/><stop offset=".6" stop-color="#0f766e"/><stop offset="1" stop-color="#14b8a6"/></linearGradient></defs>' +
      '<rect width="100" height="100" rx="23" fill="url(#dbg)"/>' +
      '<g fill="#ecfdfa"><rect x="26.5" y="46" width="2" height="38" rx="1"/><rect x="21" y="55" width="13" height="21" rx="3"/>' +
      '<rect x="49" y="32" width="2" height="44" rx="1"/><rect x="43.5" y="42" width="13" height="25" rx="3"/></g>' +
      '<g fill="#fbbf24"><rect x="71.5" y="16" width="2" height="46" rx="1"/><rect x="66" y="24" width="13" height="30" rx="3"/></g>' +
      '<circle cx="78" cy="78" r="13" fill="#34d399" stroke="#0b1b3a" stroke-width="2"/>' +
      '<path d="M72 78.5l4.4 4.8 8-9.6" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  };
})(typeof self !== "undefined" ? self : this);

/* فعال‌سازی تنبل: تا کاربر پنل را باز نکرده، هیچ اسکن و خواندن سنگینی انجام نمی‌شود (کاهش مصرف CPU).
   پنجره‌ی اصلی با باز شدن پنل به همه‌ی iframeها پیام می‌دهد و آن‌ها هم اسکن جدول‌های مالی را شروع می‌کنند. */
(function (root) {
  var isTop = root.top === root, active = false, cbs = [];
  function run() { var l = cbs.slice(); cbs = []; l.forEach(function (f) { try { f(); } catch (e) {} }); }
  function broadcast(w, msg) {
    try { w.postMessage(msg, "*"); } catch (e) {}
    try { for (var i = 0; i < w.frames.length; i++) broadcast(w.frames[i], msg); } catch (e) {}
  }
  function activate() { if (active) return; active = true; run(); if (isTop) broadcast(root, { __bcOn: 1 }); }
  root.ComboLazy = {
    isActive: function () { return active; },
    activate: activate,
    onActive: function (fn) { if (active) { try { fn(); } catch (e) {} } else cbs.push(fn); },
  };
  root.addEventListener("message", function (e) {
    var d = e && e.data; if (!d || typeof d !== "object") return;
    if (d.__bcOn && !active) { active = true; run(); }
    if (d.__bcAsk && isTop && active) { try { e.source.postMessage({ __bcOn: 1 }, "*"); } catch (x) {} }
  });
  if (!isTop) { try { root.top.postMessage({ __bcAsk: 1 }, "*"); } catch (e) {} }
})(typeof self !== "undefined" ? self : this);

}catch(e){try{console.error('didehban:shared.js',e)}catch(_){}}

;try{
/* رابط تب «🧭 مشاور» (مشترک بین پنل سهم و پنل اختیار) */
(function (root) {
  "use strict";
  var AD = root.OptAdvisor, CH = root.OptChain, CS = root.ComboStore;

  var CSS =
    '.tabs{flex-wrap:wrap}.tabs button{flex:1 0 auto}' +
    '.bodywrap{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;padding-left:34px}' +
    '.bodywrap>.body{flex:1;min-height:0}' +
    '.sbtn{position:absolute;left:3px;z-index:5;width:28px;height:28px;border-radius:50%;border:1px solid var(--line);background:var(--bg);color:var(--acc);box-shadow:0 2px 8px rgba(24,28,60,.25);font-size:13px;display:grid;place-items:center;padding:0;opacity:.8;cursor:pointer}' +
    '.sbtn:hover{opacity:1;background:var(--acc2)}.sbtn.up{top:4px}.sbtn.dn{bottom:4px}' +
    '.verdict{cursor:pointer}.verdict .vh{display:block;font-size:10.5px;font-weight:400;opacity:.75;margin-top:1px}' +
    '.vdet{margin:6px 12px 0;padding:8px 10px;border:1px solid var(--line);border-radius:12px;background:var(--bg2);font-size:11.5px;line-height:1.8}' +
    '.vdet .vr{padding:4px 0;border-top:1px solid var(--line)}.vdet .vr:first-child{border-top:0}.vdet .vr div{color:var(--mut)}' +
    '.sm label{display:block;font-size:11.5px;color:var(--mut);margin:6px 0 2px}.sm input[type=text]{width:100%;padding:8px;border:1.5px solid transparent;background:var(--inp);color:var(--fg);border-radius:9px;font-size:13px;direction:ltr;text-align:center;outline:none}' +
    '.sm input[type=text]:focus{border-color:var(--acc);background:var(--inpf)}' +
    '.big{font-size:15px;font-weight:800;text-align:center;padding:10px;border-radius:12px;margin:8px 0}' +
    '.ad .row2{display:flex;gap:6px;flex-wrap:wrap;margin:0 12px 8px}' +
    '.ad .row2 button,.ad .row2 select{flex:1;min-width:120px;padding:7px 8px;border:1px solid var(--line);background:var(--bg2);color:var(--fg);border-radius:10px;font-size:11.5px;font-weight:600;font-family:inherit}' +
    '.ad .row2 button.pri{background:var(--acc);color:var(--accfg);border-color:var(--acc)}' +
    '.ad .row2 label{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--fg);flex:1 1 100%}' +
    '.ad .hero{margin:0 12px 8px;padding:11px 12px;border-radius:14px;border:1.5px solid var(--acc);background:var(--bg)}' +
    '.ad .hero .t{font-size:15px;font-weight:800;color:var(--acc);margin-bottom:2px}' +
    '.ad .hero .s{font-size:11.5px;color:var(--mut);line-height:1.8}' +
    '.ad .hero.none{border-color:var(--line)}.ad .hero.none .t{color:var(--warn-fg)}' +
    '.ad .kv{display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-top:1px solid var(--line);font-size:11.5px;line-height:1.7}' +
    '.ad .kv:first-of-type{border-top:0}.ad .kv .vv{direction:ltr;white-space:nowrap;font-weight:700;font-variant-numeric:tabular-nums}' +
    '.ad .why{margin:6px 0 0;padding:0 16px 0 0;font-size:11.5px;line-height:1.9}' +
    '.ad .mt{display:flex;gap:4px;margin:0 12px 6px}.ad .mt button{flex:1;padding:6px 2px;border:1px solid var(--line);background:var(--bg2);color:var(--mut);border-radius:9px;font-size:11px;font-weight:600;font-family:inherit}' +
    '.ad .mt button.on{background:var(--acc);color:var(--accfg);border-color:var(--acc)}' +
    '.ad .cmp td.l{text-align:right}.ad .cmp tr.cur td{outline:1.5px solid var(--acc);outline-offset:-1.5px}.ad .cmp tr.rej td{opacity:.5}' +
    '.ad .cmp tr.top td{background:var(--ok-bg)}.ad .cmp td.neg{color:var(--bad-fg)}.ad .cmp td.pos{color:var(--ok-fg)}' +
    '.ad .cmp a{color:var(--acc);text-decoration:none}' +
    '.ad .tag{display:inline-block;padding:0 6px;border-radius:99px;font-size:10px;background:var(--acc2);color:var(--acc);margin-inline-start:4px}' +
    '.ad .tag.w{background:var(--warn-bg);color:var(--warn-fg)}';

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function money(x) { return x === null || x === undefined || !isFinite(x) ? "—" : Math.round(x).toLocaleString("en-US"); }
  function p0(x) { return x === null || x === undefined || !isFinite(x) ? "—" : Math.round(x * 100) + "٪"; }
  function p1(x) { return x === null || x === undefined || !isFinite(x) ? "—" : (x * 100).toFixed(1) + "٪"; }
  function sgn(x) { return x === null || x === undefined || !isFinite(x) ? "—" : (x >= 0 ? "+" : "") + Math.round(x * 100) + "٪"; }
  function f2(x) { return x === null || x === undefined || !isFinite(x) ? "—" : x.toFixed(2); }
  function dateOf(c) { return c.jy ? c.jy + "/" + String(c.jm).padStart(2, "0") + "/" + String(c.jd).padStart(2, "0") : "—"; }
  var LBL = { call: "خرید Call", put: "خرید Put", scall: "فروش Call", sput: "فروش Put" };
  var ORDER = ["call", "put", "scall", "sput"];

  function create(rootEl, opts) {
    var el = null, busy = false, prog = "", S_ = { chain: null, rep: [], advice: null, mode: null, showAll: false, prefs: { own: false, k: 0.5 }, optSt: null, log: [], ts: 0 };
    var prefsLoaded = false;

    function ctxNow() { return opts.getContext() || {}; }
    function loadPrefs(cb) {
      if (prefsLoaded) { cb(); return; }
      CS.get("adv.prefs", function (p) {
        if (p) { S_.prefs.own = !!p.own; if (typeof p.k === "number") S_.prefs.k = p.k; }
        CS.get("O.settings", function (s) { S_.optSt = s || {}; prefsLoaded = true; cb(); });
      });
    }
    function savePrefs() { CS.set("adv.prefs", S_.prefs); }

    function compute() {
      var c = ctxNow();
      if (!S_.chain || !S_.chain.length) { S_.advice = null; return; }
      S_.advice = AD.advise({ S: c.S, an: c.an, stockInp: c.stockInp, stockSt: c.stockSt, fin: c.fin || null, optSt: c.optSt || S_.optSt || {}, chain: S_.chain, own: S_.prefs.own, k: S_.prefs.k });
      if (S_.advice && S_.advice.ok) {
        var valid = S_.mode && S_.advice.byMode[S_.mode] && S_.advice.byMode[S_.mode].length;
        if (!valid) S_.mode = S_.advice.best ? S_.advice.best.mode : "call";
      }
    }

    async function run(force) {
      if (busy) return;
      var c = ctxNow();
      if (!c.baseSym) { S_.rep = [{ ok: false, t: "نماد پایه مشخص نیست؛ اول اعداد صفحه را بخوان (دکمه «به‌روزرسانی از سایت»)" }]; render(); return; }
      if (!(c.S > 0)) { S_.rep = [{ ok: false, t: "قیمت سهم پایه هنوز خوانده نشده؛ اول «به‌روزرسانی از سایت» را بزن" }]; render(); return; }
      busy = true; prog = "در حال یافتن اختیارها…"; render();
      var log = ["advisor " + new Date().toISOString(), "base=" + c.baseSym];
      try {
        var res = await CH.load(c.baseSym, c.S, log, function (d, n) { prog = "خواندن قیمت اختیارها: " + d + " از " + n; var pe = el && el.querySelector("[data-prog]"); if (pe) pe.textContent = prog; }, !!force);
        S_.chain = res.rows; S_.rep = res.rep; S_.ts = res.at || Date.now();
        compute();
      } catch (e) { log.push("EXCEPTION " + e); S_.rep = [{ ok: false, t: "خطا: " + e }]; }
      S_.log = log;
      busy = false; prog = ""; render();
    }

    function whyBullets(A) {
      var V = A.view, b = A.best, m = b.mode, h = [];
      if (V.ok) h.push("تحلیل سهم پایه: <b>" + esc(V.dirTxt) + "</b> (" + esc(V.confTxt) + ")؛ " + V.parts.slice(0, 3).map(function (x) { return esc(x.txt); }).join(" | "));
      else h.push("تحلیل تکنیکال سهم در دسترس نیست؛ فقط قیمت‌گذاری بازار نسبت به نوسان سهم سنجیده شد.");
      if (A.ivRatio !== null) h.push("قیمت اختیارها: <b>" + esc(A.priceTxt) + "</b> (نوسان ضمنی ÷ تاریخی = " + f2(A.ivRatio) + ")");
      var d = V.ok ? V.d : 0, rich = A.ivRatio !== null && A.ivRatio > 1.1, cheap = A.ivRatio !== null && A.ivRatio < 0.9;
      if (m === "call") h.push((d > 0.25 ? "نظر صعودی" : "نظر تحلیلی خنثی") + (cheap ? " و اختیار نسبت به نوسان سهم ارزان" : "") + " ⇒ خرید Call؛ حداکثر زیان همان پریمیوم است." + (d <= 0.25 ? " ⚠ برتری بیشتر از قیمت‌گذاری بازار می‌آید تا از جهت سهم." : ""));
      if (m === "put") h.push((d < -0.25 ? "نظر نزولی" : "نظر تحلیلی خنثی") + (cheap ? " و اختیار نسبت به نوسان سهم ارزان" : "") + " ⇒ خرید Put؛ حداکثر زیان همان پریمیوم است." + (d >= -0.25 ? " ⚠ برتری بیشتر از قیمت‌گذاری بازار می‌آید تا از جهت سهم." : ""));
      if (m === "sput") h.push("فروش Put: " + (rich ? "پریمیوم نسبت به نوسان سهم بالاست" : "پریمیوم نسبت به ریسکِ قیمت اعمال انتخاب‌شده کافی است") + (d > 0.25 ? " و نظر تحلیلی صعودی است" : d < -0.25 ? ". ⚠ نظر تحلیلی نزولی است؛ برتری فقط از دور بودن قیمت اعمال می‌آید و در ریزش شدید زیان‌ده است" : "") + ". باید حاضر باشی سهم را به قیمت اعمال بخری و نقدینگی کامل داشته باشی.");
      if (m === "scall") h.push("فروش Call (فقط پوششی، با داشتن سهم): " + (rich ? "پریمیوم نسبت به نوسان سهم بالاست" : "پریمیوم کافی است") + (d < -0.25 ? " و نظر تحلیلی نزولی/محتاط است" : d > 0.25 ? ". ⚠ نظر تحلیلی صعودی است؛ ممکن است سود بیشتر سهم را از دست بدهی" : "") + ".");
      var t = b.top;
      if (t) {
        if (t.sell) h.push("در بهترین گزینه: بازده پریمیوم " + p1(t.yield) + "، احتمال زیان " + p0(t.pLoss) + "، فاصله سهم تا سر به سر " + p1(t.cushion) + "، زیان میانگین در ۵٪ بدترین سناریو " + money(t.tailLoss) + " ریال به‌ازای هر سهم.");
        else h.push("در بهترین گزینه: احتمال سود " + p0(t.pProfit) + "، بازده مورد انتظار مدل " + sgn(t.roi) + "، حرکت لازم سهم تا سر به سر " + p1(t.beMove) + ".");
      }
      if (V.warn && V.warn.length) V.warn.forEach(function (w) { h.push("⚠ " + esc(w)); });
      return h;
    }

    function candLink(c) { return opts.origin + "/InstInfo/" + c.insCode; }

    function idealCard(A, md) {
      var id = A.ideal && A.ideal[md], S = ctxNow().S;
      if (!id) return "";
      var call = md === "call" || md === "scall", sell = md === "scall" || md === "sput";
      var h = '<div class="sg"><h5>🎯 مشخصات ایده‌آل برای «' + LBL[md] + '»</h5>';
      if (id.noEdge) h += '<div class="msg w">در این حالت هیچ قیمت اعمالی با قیمت‌های فعلی بازار برتری مثبت ندارد؛ پایین، نزدیک‌ترین گزینه فقط برای مقایسه است.</div>';
      else if (!id.pass) h += '<div class="msg w">هیچ قیمت اعمالی هم‌زمان شرط ' + (sell ? "احتمال زیان و بازده" : "حداقل احتمال سود (" + p0(id.pmin) + ")") + ' را برآورده نکرد؛ بهترین امتیاز نشان داده شده است.</div>';
      h += '<div class="kv"><span>قیمت اعمال ایده‌آل</span><span class="vv">≈ ' + money(id.K) + ' (' + (id.K >= S ? "+" : "") + Math.round((id.K / S - 1) * 100) + '٪ نسبت به سهم)</span></div>' +
        '<div class="kv"><span>ناحیه‌ی خوب (امتیاز ≥ ۸۵٪ بهترین)</span><span class="vv">' + money(id.Klo) + ' تا ' + money(id.Khi) + '</span></div>' +
        '<div class="kv"><span>سررسید ایده‌آل</span><span class="vv">≈ ' + id.td + ' روز معاملاتی</span></div>' +
        '<div class="kv"><span>قیمت منصفانه‌ی ' + (sell ? "فروش" : "خرید") + ' در این حالت</span><span class="vv">≈ ' + money(id.price) + '</span></div>';
      var n = id.nearest;
      if (n) {
        h += '<div class="kv"><span><b>نزدیک‌ترین اختیار موجود</b></span><span class="vv"><a href="' + esc(candLink(n)) + '" target="_blank">' + esc(n.sym || n.name || ("K=" + n.K)) + '</a></span></div>' +
          '<div class="kv"><span>قیمت اعمال / سررسید</span><span class="vv">' + money(n.K) + ' / ' + dateOf(n) + ' (' + n.td + ' روز)</span></div>' +
          '<div class="kv"><span>' + (sell ? "بهترین قیمت خرید (فروش فوری)" : "بهترین قیمت فروش (خرید فوری)") + '</span><span class="vv">' + money(sell ? n.bid : n.ask) + '</span></div>' +
          '<div class="kv"><span>رتبه‌ی آن بین ' + LBL[md] + 'های واقعی</span><span class="vv">' + id.rankOfNearest + ' از ' + A.byMode[md].filter(function (c) { return c.ok; }).length + '</span></div>';
      } else h += '<div class="msg wait">اختیار واقعی و نقدشونده‌ای نزدیک این مشخصات پیدا نشد.</div>';
      return h + '</div>';
    }

    function tableFor(A, md) {
      var list = A.byMode[md] || [], c0 = ctxNow(), sell = md === "scall" || md === "sput";
      if (!list.length) return '<div class="empty">اختیاری برای این حالت نیست.</div>';
      var show = S_.showAll ? list : list.slice(0, 12);
      var h = '<div class="cmp"><table><thead><tr><th>اختیار</th><th>سررسید</th><th>' + (sell ? "bid" : "ask") + '</th><th>اسپرد</th><th>حجم</th><th>IV÷HV</th>' +
        (sell ? '<th>بازده ماهانه</th><th>احتمال زیان</th><th>فاصله تا سر به سر</th>' : '<th>احتمال سود</th><th>بازده مدل</th><th>حرکت تا سر به سر</th>') + '<th>امتیاز</th></tr></thead><tbody>';
      var firstOk = true;
      show.forEach(function (c) {
        var cls = (c.ok ? "" : "rej ") + (c.insCode && c.insCode === c0.currentCode ? "cur " : "") + (c.ok && firstOk ? "top" : "");
        if (c.ok) firstOk = false;
        h += '<tr class="' + cls + '"' + (c.ok ? "" : ' title="' + esc(c.hard.join(" | ")) + '"') + '><td class="l"><a href="' + esc(candLink(c)) + '" target="_blank">' + esc(c.sym || "—") + '</a> ' + money(c.K) +
          (c.insCode === c0.currentCode ? '<span class="tag">همین صفحه</span>' : '') + (c.warn.length ? '<span class="tag w" title="' + esc(c.warn.join(" | ")) + '">⚠</span>' : '') + '</td>' +
          '<td class="v">' + dateOf(c) + ' (' + c.td + ')</td><td class="v">' + money(sell ? c.bid : c.ask) + '</td><td class="v">' + p1(c.spread) + '</td><td class="v">' + money(c.vol_o) + '</td><td class="v">' + f2(c.ivRatio) + '</td>' +
          (sell ? '<td class="v">' + p1(c.monthly) + '</td><td class="v">' + p0(c.pLoss) + '</td><td class="v">' + p1(c.cushion) + '</td>'
            : '<td class="v">' + p0(c.pProfit) + '</td><td class="v ' + (c.roi > 0 ? "pos" : "neg") + '">' + sgn(c.roi) + '</td><td class="v">' + p1(c.beMove) + '</td>') +
          '<td class="v ' + (c.score > 0 ? "pos" : "neg") + '">' + (c.score * 100).toFixed(0) + '</td></tr>';
      });
      h += '</tbody></table></div>';
      if (list.length > 12) h += '<div class="row2"><button data-act="all">' + (S_.showAll ? "نمایش ۱۲ مورد اول" : "نمایش همه‌ی " + list.length + " اختیار") + '</button><button data-act="copy">کپی جدول (برای اکسل)</button></div>';
      else h += '<div class="row2"><button data-act="copy">کپی جدول (برای اکسل)</button></div>';
      return h;
    }

    function render() {
      if (!el) return;
      var c = ctxNow(), A = S_.advice, h = '<div class="ad">';
      h += '<div class="note">مشاور ترکیبی: تحلیل «' + esc(c.baseSym || "؟") + '» + همه‌ی اختیارهای آن ← بهترین حالت (خرید/فروش Call/Put) و نزدیک‌ترین اختیار به حالت ایده‌آل. حاصل مدل آماری است، نه پیش‌بینی و نه توصیه سرمایه‌گذاری.</div>';
      h += '<div class="row2"><button class="pri" data-act="run">' + (S_.chain ? "🔄 خواندن دوباره‌ی همه‌ی اختیارها" : "🔎 خواندن همه‌ی اختیارهای این سهم") + '</button></div>';
      h += '<div class="row2"><label><input type="checkbox" data-pref="own"' + (S_.prefs.own ? " checked" : "") + '> سهم پایه را دارم (فروش Call پوششی را هم بسنج)</label>' +
        '<select data-pref="k"><option value="0.25"' + (S_.prefs.k === 0.25 ? " selected" : "") + '>نقش تحلیل سهم: کم</option><option value="0.5"' + (S_.prefs.k === 0.5 ? " selected" : "") + '>نقش تحلیل سهم: متوسط</option><option value="0.8"' + (S_.prefs.k === 0.8 ? " selected" : "") + '>نقش تحلیل سهم: زیاد</option><option value="0"' + (S_.prefs.k === 0 ? " selected" : "") + '>بدون نظر (فقط قیمت‌گذاری بازار)</option></select></div>';
      if (busy) h += '<div class="rep" data-prog>' + esc(prog) + '</div>';
      else if (S_.rep.length) h += '<div class="rep">' + S_.rep.map(function (r) { return '<div class="' + (r.ok ? "o" : "x") + '">' + (r.ok ? "✔ " : "✖ ") + esc(r.t) + '</div>'; }).join("") + '</div>';
      if (!A) {
        if (!busy && !S_.chain) h += '<div class="empty">دکمه‌ی بالا را بزن تا همه‌ی اختیارهای این سهم خوانده و با هم مقایسه شوند.<br>(بسته به تعداد اختیارها چند ثانیه تا یک دقیقه طول می‌کشد.)</div>';
        h += '<div class="row2"><button data-act="diag">گزارش اشکال</button></div></div>';
        el.innerHTML = h; return;
      }
      if (!A.ok) {
        h += '<div class="msg w">' + A.notes.map(esc).join("<br>") + '</div></div>'; el.innerHTML = h; return;
      }
      var V = A.view;
      // کارت بهترین حالت
      if (A.best && A.strong) {
        h += '<div class="hero"><div class="t">✅ بهترین حالت فعلی: ' + LBL[A.best.mode] + '</div><div class="s">' + esc(A.strength) + ' · امتیاز ' + (A.best.score * 100).toFixed(0) + (A.second ? " (بعدی: " + LBL[A.second.mode] + " با " + (A.second.score * 100).toFixed(0) + ")" : "") + '</div>' +
          '<ul class="why">' + whyBullets(A).map(function (x) { return "<li>" + x + "</li>"; }).join("") + '</ul></div>';
      } else {
        var why0 = "";
        if (!A.best) {
          var cnt = {};
          (A.cands || []).forEach(function (cc) { cc.hard.forEach(function (x) { var key = x.replace(/[\d.]+/g, "#"); cnt[key] = (cnt[key] || 0) + 1; }); });
          why0 = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, 3).map(function (k) { return k + " (" + cnt[k] + " مورد)"; }).join(" · ");
        }
        h += '<div class="hero none"><div class="t">⏳ فعلاً حالت روشنی برتری ندارد</div><div class="s">' + esc(A.best ? A.strength : "هیچ اختیاری هم‌زمان شرط‌های اسپرد، حجم و سررسید را نداشت" + (why0 ? " — دلیل‌های رایج: " + why0 : "") + ". می‌توانی آستانه‌ها را با اسلایدر ریسک‌پذیری در پنل اختیار آسان‌تر کنی") + '. به جدول‌ها نگاه کن؛ شاید صبر بهتر باشد.</div>' +
          (A.best ? '<ul class="why">' + whyBullets(A).map(function (x) { return "<li>" + x + "</li>"; }).join("") + '</ul>' : '') + '</div>';
      }
      // دید سهم
      h += '<div class="sg"><h5>📊 دید تحلیلی از سهم پایه</h5>';
      if (V.ok) {
        h += '<div class="kv"><span>جهت</span><span class="vv">' + esc(V.dirTxt) + ' (' + (V.d >= 0 ? "+" : "") + V.d.toFixed(2) + ')</span></div><div class="kv"><span>اطمینان</span><span class="vv">' + esc(V.confTxt) + ' (' + p0(V.conf) + ')</span></div>';
        V.parts.forEach(function (x) { h += '<div class="kv"><span>' + esc(x.name) + '</span><span class="vv" style="direction:rtl;white-space:normal;text-align:left">' + (x.d >= 0 ? "▲ " : "▼ ") + x.d.toFixed(2) + '</span></div>'; });
        h += '<div class="kv"><span>حالت بازار</span><span class="vv">' + (V.range ? "نوسانی/بدون روند" : "دارای روند") + (V.adx !== null ? ' (ADX ' + V.adx.toFixed(0) + ')' : '') + '</span></div>';
        h += '<div class="kv"><span>حمایت نزدیک / مقاومت نزدیک</span><span class="vv">' + money(V.sup) + ' / ' + money(V.res) + '</span></div>';
      }
      h += '<div class="kv"><span>نوسان روزانه ۶۰ روزه (HV)</span><span class="vv">' + p1(A.hv) + '</span></div>' +
        '<div class="kv"><span>نوسان ضمنی اختیارهای ATM (IV)</span><span class="vv">' + p1(A.ivAtm) + '</span></div>' +
        '<div class="kv"><span>قیمت اختیارها</span><span class="vv" style="direction:rtl;white-space:normal;text-align:left">' + esc(A.priceTxt) + '</span></div></div>';
      // مقایسه چهار حالت
      h += '<div class="cmp"><table><thead><tr><th>حالت</th><th>بهترین اختیار</th><th>امتیاز</th><th>ایده‌آل (K / روز)</th><th>نزدیک‌ترین واقعی</th></tr></thead><tbody>';
      ORDER.forEach(function (md) {
        var mm = A.modes.filter(function (x) { return x.mode === md; })[0], id = A.ideal[md], t = mm.top;
        h += '<tr' + (A.best && A.best.mode === md ? ' class="top"' : "") + '><td class="l">' + LBL[md] + (mm.skipped ? '<span class="tag w">سهم ندارم</span>' : '') + '</td>' +
          '<td class="v">' + (t ? money(t.K) + " (" + t.td + " روز)" : "—") + '</td><td class="v ' + (t && t.score > 0 ? "pos" : "neg") + '">' + (t ? (t.score * 100).toFixed(0) : "—") + '</td>' +
          '<td class="v">' + (id ? (id.noEdge ? "بدون برتری" : "≈ " + money(id.K) + " / " + id.td) : "—") + '</td><td class="v">' + (id && id.nearest ? esc(id.nearest.sym || "") + " " + money(id.nearest.K) : "—") + '</td></tr>';
      });
      h += '</tbody></table></div><div class="legend">امتیاز = برتری مورد انتظار به‌ازای واحد ریسک (پس از آزمون استرس نوسان)؛ مثبت‌تر بهتر. سطرهای کم‌رنگ شرط نقدشوندگی/اسپرد/سررسید را نداشتند.</div>';
      // انتخاب حالت + کارت ایده‌آل + جدول
      var md = S_.mode || (A.best ? A.best.mode : "call");
      h += '<div class="mt">' + ORDER.map(function (k) { return '<button data-mode="' + k + '" class="' + (k === md ? "on" : "") + '">' + LBL[k] + '</button>'; }).join("") + '</div>';
      h += idealCard(A, md);
      h += tableFor(A, md);
      if (opts.onApply && c.currentCode) h += '<div class="row2"><button class="pri" data-act="apply">اعمال هدف و احتمال این تحلیل روی چک‌لیست همین اختیار</button></div>';
      h += '<div class="row2"><button data-act="diag">گزارش اشکال</button></div></div>';
      el.innerHTML = h;
    }

    function copyTable() {
      var A = S_.advice; if (!A || !A.ok) return;
      var md = S_.mode, sell = md === "scall" || md === "sput";
      var rows = [["نماد", "قیمت اعمال", "سررسید", "روز معاملاتی", sell ? "bid" : "ask", "اسپرد", "حجم", "IV/HV"].concat(sell ? ["بازده ماهانه", "احتمال زیان", "فاصله تا سر به سر"] : ["احتمال سود", "بازده مدل", "حرکت تا سر به سر"]).concat(["امتیاز", "وضعیت"])];
      (A.byMode[md] || []).forEach(function (c) {
        rows.push([c.sym || "", c.K, dateOf(c), c.td, sell ? c.bid : c.ask, c.spread !== null ? +(c.spread * 100).toFixed(1) : "", c.vol_o, c.ivRatio ? +c.ivRatio.toFixed(2) : ""].concat(sell ? [+(c.monthly * 100).toFixed(1), +(c.pLoss * 100).toFixed(0), +(c.cushion * 100).toFixed(1)] : [+(c.pProfit * 100).toFixed(0), +(c.roi * 100).toFixed(0), +(c.beMove * 100).toFixed(1)]).concat([+(c.score * 100).toFixed(0), c.ok ? "" : c.hard.join(" | ")]));
      });
      var txt = rows.map(function (r) { return r.join("\t"); }).join("\n");
      try { navigator.clipboard.writeText(txt); } catch (e) { prompt("این متن را کپی کن:", txt); }
    }

    function handler(e) {
      var t = e.target;
      var b = t.closest && t.closest("[data-act],[data-mode]");
      if (!b) return;
      if (b.dataset.mode) { S_.mode = b.dataset.mode; S_.showAll = false; render(); return; }
      var a = b.dataset.act;
      if (a === "run") run(true);
      else if (a === "all") { S_.showAll = !S_.showAll; render(); }
      else if (a === "copy") copyTable();
      else if (a === "diag") { var txt = (S_.log || []).join("\n"); try { navigator.clipboard.writeText(txt).then(function () { alert("گزارش کپی شد؛ همین را برای من بفرست."); }, function () { prompt("این متن را کپی کن:", txt); }); } catch (er) { prompt("این متن را کپی کن:", txt); } }
      else if (a === "apply" && opts.onApply && S_.advice && S_.advice.ok) opts.onApply(S_.advice);
    }
    function changeHandler(e) {
      var t = e.target, k = t.dataset && t.dataset.pref;
      if (!k) return;
      if (k === "own") S_.prefs.own = !!t.checked;
      if (k === "k") S_.prefs.k = Number(t.value);
      savePrefs(); compute(); render();
    }

    return {
      mount: function (container) {
        el = container;
        el.onclick = handler; el.onchange = changeHandler;
        loadPrefs(function () {
          if (S_.chain && Date.now() - S_.ts < 120000) compute(); // نتیجه‌ی تازه‌ی قبلی
          render();
        });
      },
      refresh: function () { compute(); render(); },
    };
  }



  // ---------- جزئیات «کدام مرحله رد شد» برای بالای پنل ----------
  function verdictInfo(res, titles) {
    var prob = [], okn = [];
    (res.steps || []).forEach(function (s, i) {
      if (!s) return;
      var t = String((titles && titles[i]) || ("مرحله " + i)).replace(/^مرحله [۰-۹]+ — /, "");
      if (s.status === "✅") { okn.push(t); return; }
      var det = [];
      if (s.missing) det.push("ورودی ناقص است؛ خانه‌های خالی این مرحله را پر کن.");
      (s.hard || []).forEach(function (x) { det.push("❌ " + x); });
      (s.warn || []).forEach(function (x) { det.push("⚠ " + x); });
      prob.push({ head: s.status + " " + t, det: det, rank: s.status === "❌" ? 0 : s.status === "⚠" ? 1 : 2 });
    });
    prob.sort(function (a, b) { return a.rank - b.rank; });
    var text = res.final.sym + " " + res.final.text, html = "";
    prob.forEach(function (p) {
      text += "\n" + p.head + p.det.map(function (d) { return "\n   " + d; }).join("");
      html += '<div class="vr"><b>' + esc(p.head) + '</b>' + p.det.map(function (d) { return '<div>' + esc(d) + '</div>'; }).join("") + '</div>';
    });
    if (okn.length) { text += "\n✅ عبور: " + okn.join("، "); html += '<div class="vr"><b>✅ عبور:</b> <span style="color:var(--mut)">' + esc(okn.join("، ")) + '</span></div>'; }
    if (!prob.length) html = '<div class="vr">همه‌ی مرحله‌ها بدون مشکل عبور کرده‌اند.</div>' + html;
    return { text: text, html: html };
  }
  // نمایش جزئیات زیر نوار نتیجه؛ با کلیک باز/بسته می‌شود و با نگه‌داشتن موس هم در tooltip دیده می‌شود
  function paintVerdict(root, STATE, res, titles) {
    var v = root.getElementById("verdict"); if (!v) return;
    var info = verdictInfo(res, titles);
    v.title = info.text;
    if (!v.querySelector(".vh")) { var h = document.createElement("span"); h.className = "vh"; h.textContent = "برای دیدن مرحله‌های ردشده کلیک کن یا موس را نگه دار"; v.appendChild(h); }
    var vd = root.getElementById("vdet");
    if (STATE.vdetOpen) {
      if (!vd) { vd = document.createElement("div"); vd.id = "vdet"; vd.className = "vdet"; v.insertAdjacentElement("afterend", vd); }
      vd.innerHTML = info.html;
    } else if (vd) vd.remove();
  }

  // ---------- بلوک مشترک «جمع‌بندی مسیر نماد» (نمودار + مالی) برای پنل سهم و پنل اختیار ----------
  // o: { title, name, S, v (stockView), ol (outlook), nr (narrative), hDays, expDate, note }
  function faN(x) { return String(x).replace(/\d/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[d]; }); }
  function outlookHtml(o) {
    if (!o || !o.v || !o.v.ok || !o.ol) return '<div class="sg"><h5>' + esc(o && o.title || "🔭 جمع‌بندی") + '</h5><div class="legend">برای جمع‌بندی، سابقه‌ی قیمت سهم (حداقل ۶۰ روز) لازم است؛ «به‌روزرسانی از سایت» را بزن.</div></div>';
    var v = o.v, ol = o.ol, nr = o.nr, S = o.S;
    var h = '<div class="sg"><h5>' + esc(o.title || "🔭 جمع‌بندی: نماد احتمالاً چطور می‌رود؟") + '</h5>';
    h += '<div class="msg ' + nr.cls + '"><b>' + esc(faN(nr.headline)) + '</b></div>';
    nr.lines.forEach(function (t) { h += '<div style="font-size:11.5px;line-height:1.9;margin:4px 0">• ' + esc(faN(t)) + '</div>'; });
    nr.warn.forEach(function (t) { h += '<div class="msg w">⚠ ' + esc(faN(t)) + '</div>'; });
    // قیمت در سررسید / پایان افق
    var lab = o.expDate ? "تا سررسید (" + o.expDate + " — " + ol.td + " روز معاملاتی)" : "تا " + ol.td + " روز معاملاتی آینده";
    h += '<div class="cmp sgt" style="margin:6px 0 0"><table><thead><tr><th class="lab">قیمت سهم ' + esc(faN(lab)) + '</th><th>قیمت</th><th>تغییر</th></tr></thead><tbody>';
    [["بدبینانه (حدود ۲٫۵٪ احتمال پایین‌تر)", ol.low95], ["محتاطانه (حدود ۱۶٪ احتمال پایین‌تر)", ol.low68], ["مرکزی (میانه‌ی پیش‌بینی)", ol.median], ["خوش‌بینانه (حدود ۱۶٪ احتمال بالاتر)", ol.high68], ["بسیار خوش‌بینانه (حدود ۲٫۵٪ احتمال بالاتر)", ol.high95]].forEach(function (r, i) {
      var ch = (r[1] / S - 1) * 100;
      h += '<tr' + (i === 2 ? ' style="font-weight:700"' : '') + '><td class="lab">' + esc(r[0]) + '</td><td class="v">' + esc(faN(Math.round(r[1]).toLocaleString("en-US"))) + '</td><td class="v ' + (ch > 0.05 ? "best" : ch < -0.05 ? "worst" : "") + '">' + esc(faN((ch >= 0 ? "+" : "") + ch.toFixed(1))) + '٪</td></tr>';
    });
    h += '</tbody></table></div>';
    // اجزای دید
    if (v.parts && v.parts.length) {
      h += '<details style="margin:6px 0 0"><summary style="font-size:11.5px;cursor:pointer"><b>این جمع‌بندی از چه چیزهایی ساخته شده؟</b> (جهت ' + esc(faN(Math.round(v.d * 100))) + '٪، اطمینان ' + esc(faN(Math.round(v.conf * 100))) + '٪)</summary>';
      v.parts.forEach(function (c) {
        h += '<div class="kv" style="display:flex;justify-content:space-between;gap:10px;padding:3px 0;border-top:1px solid var(--line);font-size:11px;line-height:1.7"><span>' + (c.d > 0.1 ? "🟢 " : c.d < -0.1 ? "🔴 " : "⚪ ") + esc(faN(c.name)) + ' <span style="color:var(--mut)">(وزن ' + esc(faN(Math.round(c.w * 100))) + '٪)</span></span><span style="color:var(--mut);text-align:left">' + esc(faN(c.txt)) + '</span></div>';
      });
      h += '</details>';
    }
    h += '<div class="legend" style="margin:6px 0 0">' + esc(o.note || "این جمع‌بندی ترکیب آماری نمودار (احتمال شرطی تاریخی، روند، جریان حقیقی/حقوقی) و در صورت وجود تحلیل مالی است. جهت را فقط کمی از ۵۰٪ دور می‌کند؛ پیش‌بینی قطعی یا توصیه‌ی سرمایه‌گذاری نیست.") + '</div></div>';
    return h;
  }

  root.AdvisorUI = { create: create, CSS: CSS, outlookHtml: outlookHtml, verdictInfo: verdictInfo, paintVerdict: paintVerdict };
})(typeof self !== "undefined" ? self : this);

}catch(e){try{console.error('didehban:advisor-ui.js',e)}catch(_){}}

;try{
/* موتور «نوسان‌گیری» برای یک سهم: مناسب بودن، قیمت خرید، قیمت فروش، حد ضرر، و آزمون همان قاعده روی سابقه‌ی خود سهم.
   ورودی: میله‌های روزانه‌ی تعدیل‌شده {d,o,h,l,c,v,val}. هیچ درخواست شبکه‌ای ندارد. */
(function (root) {
  "use strict";
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function mean(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }
  function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function sma(c, n, end) { if (end + 1 < n) return null; var s = 0; for (var i = end - n + 1; i <= end; i++) s += c[i]; return s / n; }
  function atrAt(b, n, end) {
    if (end < n) return null; var s = 0;
    for (var i = end - n + 1; i <= end; i++) s += Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c));
    return s / n;
  }
  function rsi(c, n) {
    if (c.length < n + 1) return null; var g = 0, l = 0, i;
    for (i = c.length - n; i < c.length; i++) { var d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
    if (g + l === 0) return 50; return 100 - 100 / (1 + g / (l || 1e-9));
  }
  function corr1(r) {   // خودهمبستگی با یک روز تأخیر؛ منفی = برگشت‌پذیر
    if (r.length < 30) return null; var a = r.slice(1), b = r.slice(0, -1), ma = mean(a), mb = mean(b), sa = 0, sb = 0, sab = 0;
    for (var i = 0; i < a.length; i++) { sa += (a[i] - ma) * (a[i] - ma); sb += (b[i] - mb) * (b[i] - mb); sab += (a[i] - ma) * (b[i] - mb); }
    return sa > 0 && sb > 0 ? sab / Math.sqrt(sa * sb) : null;
  }
  // قله و دره‌های پیاپی (زیگزاگ) روی قیمت پایانی با آستانه‌ی thr
  function zigzag(c, thr) {
    var piv = [], dir = 0, lo = { i: 0, p: c[0] }, hi = { i: 0, p: c[0] }, ext = null;
    for (var i = 1; i < c.length; i++) {
      var p = c[i];
      if (dir === 0) {
        if (p < lo.p) lo = { i: i, p: p }; if (p > hi.p) hi = { i: i, p: p };
        if (p >= lo.p * (1 + thr) && lo.i < i) { piv.push({ i: lo.i, p: lo.p, t: "L" }); dir = 1; ext = { i: i, p: p }; }
        else if (p <= hi.p * (1 - thr) && hi.i < i) { piv.push({ i: hi.i, p: hi.p, t: "H" }); dir = -1; ext = { i: i, p: p }; }
      } else if (dir === 1) {
        if (p > ext.p) ext = { i: i, p: p };
        else if (p <= ext.p * (1 - thr)) { piv.push({ i: ext.i, p: ext.p, t: "H" }); dir = -1; ext = { i: i, p: p }; }
      } else {
        if (p < ext.p) ext = { i: i, p: p };
        else if (p >= ext.p * (1 + thr)) { piv.push({ i: ext.i, p: ext.p, t: "L" }); dir = 1; ext = { i: i, p: p }; }
      }
    }
    return piv;
  }
  function rangeAt(b, t, n) { var lo = Infinity, hi = -Infinity; for (var i = t - n + 1; i <= t; i++) { if (b[i].l < lo) lo = b[i].l; if (b[i].h > hi) hi = b[i].h; } return { lo: lo, hi: hi }; }

  // طرح خرید/فروش مبتنی بر بازه‌ی ۲۰ روزه (همان قاعده‌ای که روی سابقه آزمایش می‌شود)
  var FR = { t1: 0.45, t2: 0.85, one: 0.6 };   // سهم هر هدف از فاصله‌ی ورود تا سقف بازه
  function planAt(b, t, k, fb, fs) {
    var rg = rangeAt(b, t, 20), atr = atrAt(b, 14, t), c = b[t].c; if (!(atr > 0) || !(rg.hi > rg.lo)) return null;
    var rt = fb + fs, L = rg.lo + k * (rg.hi - rg.lo);
    return { lo: rg.lo, hi: rg.hi, atr: atr, L: L, rt: rt, c: c, width: rg.hi / rg.lo - 1 };
  }
  function stopFor(fill, lo, atr) {
    var st = lo - 0.3 * atr;                               // زیر کف بازه
    st = Math.min(st, fill * 0.988);                       // حداقل ۱٫۲٪ فاصله
    st = Math.max(st, fill * (1 - Math.max(0.03, 2 * atr / fill)));   // سقف ریسک
    return st;
  }
  function backtest(b, k, fb, fs, H, from) {
    var trades = [], t = Math.max(from, 40), n = b.length;
    while (t < n - 2) {
      var p = planAt(b, t, k, fb, fs);
      if (!p || p.width < 0.04) { t++; continue; }
      var f = t + 1, bf = b[f];
      if (!(bf.v > 0) || bf.l > p.L) { t++; continue; }
      var fill = bf.o <= p.L ? bf.o : p.L;
      var tgt = fill + FR.one * (p.hi - fill);
      if (tgt < fill * (1 + p.rt + 0.012)) { t++; continue; }                // جای سود کافی نبود: سیگنال نیست
      var stop = stopFor(fill, p.lo, p.atr), exitP = null, why = "time", j, end = Math.min(n - 1, f + H);
      for (j = f + 1; j <= end; j++) {
        var x = b[j];
        if (x.o <= stop) { exitP = x.o; why = "stop"; break; }
        if (x.l <= stop) { exitP = stop; why = "stop"; break; }          // اگر هر دو در یک روز ممکن بود، محافظه‌کارانه ضرر
        if (x.o >= tgt) { exitP = x.o; why = "target"; break; }
        if (x.h >= tgt) { exitP = tgt; why = "target"; break; }
      }
      if (exitP === null) { if (f + H > n - 1) break; exitP = b[end].c; j = end; }   // هنوز باز یا پایان مهلت
      trades.push({ d: b[f].d, fill: fill, exit: exitP, why: why, days: j - f, net: exitP * (1 - fs) / (fill * (1 + fb)) - 1 });
      t = Math.max(j, t + 1);
    }
    var w = trades.filter(function (x) { return x.net > 0; }), l = trades.filter(function (x) { return x.net <= 0; });
    return {
      k: k, trades: trades, n: trades.length, win: trades.length ? w.length / trades.length : null,
      avgWin: mean(w.map(function (x) { return x.net; })), avgLoss: mean(l.map(function (x) { return x.net; })),
      exp: trades.length ? mean(trades.map(function (x) { return x.net; })) : null,
      days: median(trades.map(function (x) { return x.days; })),
      tg: trades.filter(function (x) { return x.why === "target"; }).length, sp: trades.filter(function (x) { return x.why === "stop"; }).length, to: trades.filter(function (x) { return x.why === "time"; }).length
    };
  }

  // رویدادهای کدال و وضعیت مالی: مجمع/تقسیم سود، افزایش سرمایه، افشای تازه، بنیاد شرکت
  // ev = { loaded, err, agm:{daysTo,kind,from,to,date}, letters:[{cls,title,ago}], dps, ni, eq, fin:{score,verdict,bad,good,z,fscore,pe} }
  function evalEvents(ev, S, planDays) {
    var R = { pts: 15, max: 15, lines: [], block: null, wait: null, days: null, agmInfo: null };
    if (!ev || !ev.loaded) {
      R.pts = 7; R.unknown = true;
      R.lines.push({ lv: "w", t: "اطلاعیه‌های کدال دریافت نشد" + (ev && ev.err ? " (" + ev.err + ")" : "") + "؛ مجمع، تقسیم سود و افزایش سرمایه در این تحلیل لحاظ نشده‌اند. تب «📢 کدال» را باز کن و «دریافت از کدال» را بزن." });
    } else {
      var a = ev.agm, cal = Math.ceil(planDays * 7 / 5) + 2;
      if (a) {
        var tdays = Math.max(0, Math.round(a.daysTo * 5 / 7)), dropTxt = "";
        if (ev.dps > 0 && S > 0 && ev.dps / S < 0.5) dropTxt = " سود نقدی سال قبل حدود " + (ev.dps / S * 100).toFixed(1) + "٪ قیمت است؛ در روز مجمع قیمت پایه به همین اندازه (اگر همان تقسیم شود) تعدیل می‌شود.";
        R.agmInfo = { daysTo: a.daysTo, kind: a.kind, date: a.date, tdays: tdays, drop: ev.dps > 0 && S > 0 ? ev.dps / S : null };
        if (a.kind === "announced" && a.daysTo >= -1 && a.daysTo <= cal) {
          if (tdays <= 3) { R.pts = 0; R.block = "مجمع اعلام‌شده (" + a.date + ") " + (a.daysTo >= 0 ? a.daysTo + " روز دیگر" : "همین الان") + " است؛ ورود تازه با مهلت چندروزه عملاً از مجمع عبور می‌کند."; R.lines.push({ lv: "bad", t: "مجمع اعلام‌شده " + a.date + " (" + (a.daysTo >= 0 ? a.daysTo + " روز دیگر" : "تازه") + ") داخل افق نوسان‌گیری است؛ از مجمع عبور نکن." + dropTxt }); }
          else { R.pts -= 6; R.days = Math.max(2, tdays - 1); R.lines.push({ lv: "w", t: "مجمع اعلام‌شده " + a.date + " (حدود " + tdays + " روز معاملاتی دیگر)؛ مهلت نگه‌داری تا " + R.days + " روز کوتاه شد تا قبل از مجمع خارج شوی." + dropTxt }); }
        } else if (a.kind === "estimated" && a.to >= 0 && a.from <= cal) {
          R.pts -= 6; R.lines.push({ lv: "w", t: "مجمع بعدی تخمینی است (" + a.date + "؛ بازه‌ی محتمل از " + Math.max(a.from, 0) + " تا " + a.to + " روز دیگر) و ممکن است با افق نوسان‌گیری هم‌پوشانی داشته باشد؛ منتظر آگهی دعوت در کدال باش." + dropTxt });
        } else R.lines.push({ lv: "ok", t: "مجمع بعدی (" + a.date + (a.kind === "estimated" ? "، تخمینی" : "") + ") خارج از افق نوسان‌گیری است." });
      } else R.lines.push({ lv: "w", t: "تاریخ مجمع بعدی از اطلاعیه‌های کدال مشخص نشد." });
      var L = ev.letters || [], pick = function (cls, maxAgo) { return L.filter(function (x) { return x.cls === cls && x.ago >= -1 && x.ago <= maxAgo; }).sort(function (p, q) { return p.ago - q.ago; }); };
      var cap = pick("cap", 60);
      if (cap.length) {
        var rights = cap.filter(function (x) { return /حق\s*تقدم|پذیره/.test(x.title); })[0];
        R.pts -= rights && rights.ago <= 30 ? 6 : 4;
        if (cap[0].ago <= 5) R.wait = R.wait || "اطلاعیه‌ی افزایش سرمایه (" + cap[0].ago + " روز پیش) تازه است؛ قیمت هنوز جا نیفتاده.";
        R.lines.push({ lv: "w", t: "افزایش سرمایه در جریان است: «" + cap[0].title.slice(0, 70) + "» (" + cap[0].ago + " روز پیش). " + (rights ? "حق تقدم/پذیره‌نویسی در راه است؛ روز حذف حق تقدم قیمت پایه تعدیل می‌شود و نوسان بالا می‌رود." : "تا تکلیف تاریخ‌ها مشخص نشده، ریسک خبری بالاتر است.") });
      } else R.lines.push({ lv: "ok", t: "در ۶۰ روز اخیر اطلاعیه‌ی افزایش سرمایه‌ای دیده نشد." });
      var imp = pick("imp", 3);
      if (imp.length) { R.pts -= 4; R.wait = R.wait || "افشای بااهمیت تازه (" + imp[0].ago + " روز پیش) منتشر شده؛ یکی دو روز صبر کن تا واکنش قیمت جا بیفتد."; R.lines.push({ lv: "w", t: "افشای بااهمیت در ۳ روز اخیر: «" + imp[0].title.slice(0, 80) + "» (" + imp[0].ago + " روز پیش)؛ قیمت ممکن است هنوز در حال واکنش باشد." }); }
      var fin = pick("fin", 4);
      if (fin.length) { R.pts -= 3; R.wait = R.wait || "صورت مالی تازه (" + fin[0].ago + " روز پیش) منتشر شده؛ واکنش قیمت هنوز تمام نشده."; R.lines.push({ lv: "w", t: "صورت مالی تازه (" + fin[0].ago + " روز پیش) منتشر شده؛ واکنش قیمت ممکن است ادامه داشته باشد." }); }
      var mon = pick("mon", 2);
      if (mon.length) R.lines.push({ lv: "w", t: "گزارش فعالیت ماهانه تازه منتشر شده (" + mon[0].ago + " روز پیش)؛ اگر خبرش در قیمت نیامده، حرکت جهت‌دار ممکن است." });
    }
    // بنیاد شرکت از تب مالی
    var f = ev && ev.fin, weak = [];
    if (ev && ev.ni !== undefined && ev.ni !== null && ev.ni < 0) weak.push("شرکت در آخرین سال مالی زیان‌ده بوده");
    if (ev && ev.eq !== undefined && ev.eq !== null && ev.eq < 0) weak.push("حقوق صاحبان سهام منفی است");
    var zz = f && f.z, zBad = zz && typeof zz === "object" ? zz.zone === "خطر ورشکستگی" : (typeof zz === "number" && zz < 4.35), zVal = zz && typeof zz === "object" ? zz.v : zz;
    if (zBad) weak.push("مدل آلتمن در ناحیه‌ی خطر ورشکستگی است" + (typeof zVal === "number" ? " (" + Number(zVal).toFixed(1) + ")" : ""));
    if (f && f.score !== null && f.score < 35) weak.push("امتیاز مالی کل پایین است (" + Math.round(f.score) + " از ۱۰۰)");
    R.weakN = weak.length;
    if (weak.length) { R.pts -= weak.length >= 2 ? 7 : 4; R.lines.push({ lv: "w", t: "بنیاد ضعیف (از تب مالی): " + weak.join("؛ ") + ". نوسان‌گیری روی چنین سهمی ریسک خبری و صف فروش بیشتری دارد." }); }
    else if (f && f.ok !== false && f.score !== null) R.lines.push({ lv: f.score >= 55 ? "ok" : "w", t: "وضعیت مالی (تب مالی): امتیاز " + Math.round(f.score) + " از ۱۰۰" + (f.verdict ? " — " + f.verdict : "") + (f.pe ? "؛ P/E حدود " + Number(f.pe).toFixed(1) : "") });
    else R.lines.push({ lv: "w", t: "تب «🏦 مالی» هنوز خوانده نشده؛ بنیاد شرکت در این تحلیل لحاظ نشد (صورت‌های مالی را روی TSETMC باز کن)." });
    R.pts = clamp(R.pts, 0, R.max);
    return R;
  }

  function analyze(P) {
    var b = P.bars || [], n = b.length, fb = P.fb > 0 ? P.fb : 0.0037, fs = P.fs > 0 ? P.fs : 0.0088, minVal = P.minVal > 0 ? P.minVal : 20;
    if (n < 80) return { ok: false, err: "سابقه‌ی قیمت کمتر از ۸۰ روز است؛ برای نوسان‌گیری کافی نیست." };
    var c = b.map(function (x) { return x.c; }), last = b[n - 1], S = P.S > 0 && Math.abs(P.S / last.c - 1) < 0.12 ? P.S : last.c;
    var rt = fb + fs, out = { ok: true, S: S, fb: fb, fs: fs, rt: rt, checks: [], notes: [] };
    // ---- آمار پایه
    var atr = atrAt(b, 14, n - 1), atrp = atr / S, tr20 = b.slice(-20), traded20 = tr20.filter(function (x) { return x.v > 0; });
    var traded60 = b.slice(-60).filter(function (x) { return x.v > 0; }).length;
    var valB = mean(traded20.map(function (x) { return x.val / 1e9; }).filter(function (x) { return x > 0; })) || 0;
    var rng20 = mean(tr20.map(function (x) { return (x.h - x.l) / x.c; }));
    var rets = []; for (var i = 1; i < n; i++) rets.push(c[i] / c[i - 1] - 1);
    var r120 = rets.slice(-120), ac = corr1(r120);
    var maxAbs = Math.max.apply(null, r120.map(Math.abs));
    var lim = P.lim > 0 ? P.lim : clamp(maxAbs, 0.02, 0.06);   // دامنه‌ی نوسان روزانه (تنظیمات سهم؛ در نبودش از خود سابقه)
    var qdays = b.slice(-60).filter(function (x, ix, arr) {
      var prev = ix > 0 ? arr[ix - 1].c : x.o; var ch = prev > 0 ? Math.abs(x.c / prev - 1) : 0;
      if (x.h === x.l && ch >= 0.9 * lim) return true;                       // یک قیمت در تمام روز، روی حد
      var pos = x.h > x.l ? (x.c - x.l) / (x.h - x.l) : 0.5;
      return ch >= 0.9 * lim && (pos > 0.97 || pos < 0.03);                  // نزدیک حد و بسته شدن در انتهای دامنه
    }).length;
    var gaps = b.slice(-60).filter(function (x, ix, arr) { return ix > 0 && Math.abs(x.o / arr[ix - 1].c - 1) > 0.8 * lim; }).length;
    var sma20 = sma(c, 20, n - 1), sma50 = sma(c, 50, n - 1), sma200 = n >= 200 ? sma(c, 200, n - 1) : null, sma50p = sma(c, 50, n - 21);
    var slope50 = sma50 && sma50p ? sma50 / sma50p - 1 : null, rs = rsi(c, 14);
    var cross = 0; for (i = n - 60; i < n; i++) { var m1 = sma(c, 20, i - 1), m2 = sma(c, 20, i); if (m1 && m2 && (c[i - 1] - m1) * (c[i] - m2) < 0) cross++; }   // میانگین متحرک
    var rg20 = rangeAt(b, n - 1, 20), rg60 = rangeAt(b, n - 1, 60), pos20 = rg20.hi > rg20.lo ? (S - rg20.lo) / (rg20.hi - rg20.lo) : 0.5;
    var down = sma50 !== null && (S < sma50 * 0.92 || (S < sma50 && slope50 !== null && slope50 < -0.02 && sma200 !== null && S < sma200));
    Object.assign(out, { lim: lim, atr: atr, atrp: atrp, rng20: rng20, valB: valB, traded20: traded20.length, traded60: traded60, ac: ac, qdays: qdays, gaps: gaps, maxAbs: maxAbs, sma20: sma20, sma50: sma50, sma200: sma200, slope50: slope50, rsi: rs, cross: cross, lo20: rg20.lo, hi20: rg20.hi, lo60: rg60.lo, hi60: rg60.hi, pos20: pos20, down: down });

    // ---- موج‌ها در ۱۶۰ روز اخیر
    var W = c.slice(-Math.min(n, 160)), thr = clamp(1.1 * atrp, 0.03, 0.09), piv = zigzag(W, thr), up = [], upDays = [];
    for (i = 1; i < piv.length; i++) if (piv[i - 1].t === "L" && piv[i].t === "H") { up.push(piv[i].p / piv[i - 1].p - 1); upDays.push(piv[i].i - piv[i - 1].i); }
    var lows = piv.filter(function (x) { return x.t === "L"; }).slice(-4).map(function (x) { return x.p; }), highs = piv.filter(function (x) { return x.t === "H"; }).slice(-4).map(function (x) { return x.p; });
    out.swings = { thr: thr, count: up.length, medAmp: median(up), medDays: median(upDays), lows: lows, highs: highs };

    // ---- آزمون قاعده روی سابقه‌ی خود سهم (۳ حالت عمق ورود)
    var H0 = 8, from = Math.max(40, n - 190), tests = [0.15, 0.25, 0.35].map(function (k) { return backtest(b, k, fb, fs, H0, from); });
    var cand = tests.filter(function (x) { return x.n >= 5; }).sort(function (a, z) { return z.exp - a.exp; });
    var best = cand.length ? cand[0] : tests[1];
    out.tests = tests; out.best = best;
    var Hdays = clamp(Math.round((best.days || 4) * 1.6), 4, H0);   // هم‌خوان با مهلت آزمون

    // ---- طرح امروز
    var k = best.k, deepK = Math.max(0.04, k - 0.12), pl = planAt(b, n - 1, k, fb, fs);
    var L1 = pl.L, L2 = pl.lo + deepK * (pl.hi - pl.lo), avgIn = (L1 + L2) / 2;
    var t1 = avgIn + FR.t1 * (pl.hi - avgIn), t2 = avgIn + FR.t2 * (pl.hi - avgIn);
    var floor1 = avgIn * (1 + rt + 0.012);
    var room = t2 > avgIn * (1 + rt + 0.02);
    t1 = Math.max(t1, floor1); if (t2 < t1) t2 = t1 * 1.01;
    var stop = stopFor(avgIn, pl.lo, pl.atr), net = function (e, x) { return x * (1 - fs) / (e * (1 + fb)) - 1; };
    var beExit = avgIn * (1 + fb) / (1 - fs) * 1.003;
    var plan = {
      k: k, L1: L1, L2: L2, avgIn: avgIn, t1: t1, t2: t2, stop: stop, be: beExit, hi: pl.hi, lo: pl.lo, days: Hdays, room: room,
      netT1: net(avgIn, t1), netT2: net(avgIn, t2), netStop: net(avgIn, stop)
    };
    plan.netBlend = 0.5 * plan.netT1 + 0.5 * plan.netT2;
    plan.rr = plan.netStop < 0 ? plan.netBlend / -plan.netStop : null;
    var EV = evalEvents(P.ev, S, plan.days); out.events = EV;
    if (EV.days) plan.days = Math.min(plan.days, EV.days);
    out.plan = plan;

    // ---- امتیاز مناسب بودن (بدون در نظر گرفتن زمان‌بندی)
    var sc = 0, add = function (pts, max, ok, txt, level) { out.checks.push({ lv: level || (ok ? "ok" : (pts > 0 ? "w" : "bad")), pts: Math.round(pts), max: max, t: txt }); sc += pts; };
    var hard = [];
    var fv = function (x, d) { return Number(x).toFixed(d === undefined ? 1 : d); };
    // نقدشوندگی
    if (valB >= minVal * 1.5) add(15, 15, true, "نقدشوندگی خوب: میانگین ارزش روزانه " + fv(valB, 0) + " میلیارد ریال؛ ورود و خروج سریع ممکن است");
    else if (valB >= minVal) add(8, 15, false, "نقدشوندگی در حد قبول: " + fv(valB, 0) + " میلیارد ریال در روز؛ با حجم بزرگ ممکن است قیمت را جابه‌جا کنی");
    else { add(0, 15, false, "نقدشوندگی کم است (" + fv(valB, 1) + " میلیارد ریال در روز)؛ خروج سریع سخت می‌شود", "bad"); hard.push("نقدشوندگی کم"); }
    // نوسان
    if (atrp >= 0.02 && atrp <= 0.065) add(15, 15, true, "نوسان روزانه مناسب است (ATR حدود " + fv(atrp * 100) + "٪)");
    else if (atrp >= 0.015 && atrp < 0.02) add(7, 15, false, "نوسان روزانه کم است (" + fv(atrp * 100) + "٪)؛ سود هر موج کوچک می‌ماند و کارمزد بخش بزرگی از آن را می‌خورد");
    else if (atrp > 0.065 && atrp <= 0.08) add(8, 15, false, "نوسان روزانه زیاد است (" + fv(atrp * 100) + "٪)؛ حد ضرر باید بازتر باشد و ریسک بالاتر");
    else { add(0, 15, false, atrp < 0.015 ? "نوسان روزانه خیلی کم است (" + fv(atrp * 100) + "٪)" : "نوسان روزانه خیلی زیاد/پرخطر است (" + fv(atrp * 100) + "٪)", "bad"); hard.push("نوسان نامناسب"); }
    // جای سود
    if (room && plan.netT2 >= 0.03) add(15, 15, true, "جای سود کافی است: هدف دوم حدود " + fv(plan.netT2 * 100) + "٪ خالص بعد از کارمزد");
    else if (room && plan.netT2 >= 0.015) add(8, 15, false, "جای سود محدود است: هدف دوم فقط حدود " + fv(plan.netT2 * 100) + "٪ خالص");
    else add(0, 15, false, "تا سقف بازه بعد از کارمزد (حدود " + fv(rt * 100, 2) + "٪ رفت‌وبرگشت) سود قابل‌توجهی نمی‌ماند", "bad");
    // تکرارپذیری موج‌ها
    var sw = out.swings;
    if (sw.count >= 5 && sw.medAmp - rt >= 0.03) add(15, 15, true, sw.count + " موج صعودی کامل در ۸ ماه اخیر؛ میانه‌ی دامنه‌ی هر موج " + fv(sw.medAmp * 100) + "٪ (حدود " + fv(sw.medDays, 0) + " روز)");
    else if (sw.count >= 3) add(8, 15, false, "فقط " + sw.count + " موج صعودی کامل در ۸ ماه اخیر (میانه‌ی دامنه " + fv((sw.medAmp || 0) * 100) + "٪)؛ الگوی نوسان کمتر تکرار شده");
    else add(0, 15, false, "در ۸ ماه اخیر موج صعودی تکرارشونده‌ای دیده نمی‌شود (" + sw.count + " مورد)؛ سهم بیشتر یک‌طرفه حرکت کرده است", "bad");
    // آزمون سابقه
    if (best.n >= 5 && best.exp > 0.005 && best.win >= 0.55) add(20, 20, true, "همین قاعده روی سابقه‌ی خود این سهم: " + best.n + " معامله، " + fv(best.win * 100, 0) + "٪ موفق، میانگین خالص " + fv(best.exp * 100) + "٪ در هر معامله");
    else if (best.n >= 5 && best.exp > 0) add(10, 20, false, "همین قاعده روی سابقه‌ی سهم فقط کم‌سود بوده: " + best.n + " معامله، " + fv(best.win * 100, 0) + "٪ موفق، میانگین خالص " + fv(best.exp * 100) + "٪");
    else if (best.n < 5) add(5, 20, false, "سابقه‌ی کافی برای آزمون نیست (فقط " + best.n + " معامله‌ی قابل‌شبیه‌سازی)", "w");
    else add(0, 20, false, "همین قاعده روی سابقه‌ی خود این سهم سود نداده: " + best.n + " معامله، میانگین خالص " + fv(best.exp * 100) + "٪", "bad");
    // برگشت‌پذیری
    var mr = 0, mrt = [];
    if (cross >= 8) { mr += 5; mrt.push(cross + " بار عبور از میانگین ۲۰ روزه در ۶۰ روز"); }
    if (ac !== null && ac < -0.05) { mr += 5; mrt.push("بازده روزانه تمایل به برگشت دارد (همبستگی " + fv(ac, 2) + ")"); }
    if (mr >= 10) add(10, 10, true, "رفتار رفت‌وبرگشتی: " + mrt.join("؛ ")); else if (mr > 0) add(mr, 10, false, "رفت‌وبرگشت نسبی: " + mrt.join("؛ ")); else add(0, 10, false, "رفتار رفت‌وبرگشتی ضعیف است (" + cross + " عبور از میانگین، همبستگی " + (ac === null ? "—" : fv(ac, 2)) + ")؛ سهم بیشتر روندی است تا نوسانی", "w");
    // روند
    if (down) { add(0, 10, false, "روند نزولی قوی: بیش از ۸٪ زیر میانگین ۵۰ روزه یا زیر میانگین‌های ۵۰ و ۲۰۰ با شیب منفی؛ «کف» در ریزش کف نیست", "bad"); hard.push("روند نزولی"); }
    else if (sma50 && S >= sma50 * 0.97) add(10, 10, true, "روند میان‌مدت سالم است (قیمت نزدیک یا بالای میانگین ۵۰ روزه)");
    else add(5, 10, false, "قیمت زیر میانگین ۵۰ روزه است؛ نوسان‌گیری فقط با احتیاط");
    // رویدادها و بنیاد شرکت (کدال + تب مالی)
    var evOk = EV.pts >= 13 && !EV.unknown;
    add(EV.pts, EV.max, evOk, EV.block ? "رویداد پیش‌رو مانع ورود است (جزئیات پایین، بخش «رویدادها»)" : EV.unknown ? "رویدادهای کدال لحاظ نشد (اطلاعیه‌ها دریافت نشد)" : EV.pts >= 13 ? "رویداد مهمی (مجمع، افزایش سرمایه، افشای تازه) در افق نوسان‌گیری دیده نشد" : "رویداد یا ریسکی در افق نوسان‌گیری هست (جزئیات: بخش «رویدادها»)", EV.block ? "bad" : (evOk ? "ok" : "w"));
    // صف و جهش
    var rp = 0; if (qdays >= 8) { hard.push("صف زیاد"); add(0, 0, false, "در ۶۰ روز اخیر " + qdays + " روز شبیه صف یا قفل شدن در حد نوسان بوده؛ فروش در لحظه‌ی دلخواه تضمین نیست", "bad"); }
    else if (qdays >= 3) add(0, 0, false, qdays + " روز شبیه صف/قفل در ۶۰ روز اخیر؛ مراقب گیر کردن در صف فروش باش", "w");
    if (gaps >= 6) add(0, 0, false, "شکاف قیمتی بازگشایی زیاد است (" + gaps + " روز در ۶۰ روز)؛ حد ضرر ممکن است با قیمت بدتری اجرا شود", "w");
    if (traded60 < 54) add(0, 0, false, "در ۶۰ روز اخیر " + (60 - traded60) + " روز بدون معامله بوده", "w");
    out.score = Math.round(sc);
    var total = out.checks.reduce(function (a, x) { return a + x.max; }, 0);
    out.pct = total ? Math.round(sc / total * 100) : 0;
    out.hard = hard;
    var capWeak = !hard.length && EV.weakN >= 2;
    out.grade = capWeak ? { cls: "w", sym: "⚠", text: "نوسان‌گیری با احتیاط (بنیاد شرکت ضعیف است)", why: "امتیاز " + out.pct + " از ۱۰۰ ولی چند نشانه‌ی ضعف مالی دیده شد؛ حجم کم و حد ضرر را رعایت کن" } : hard.length ? { cls: "h", sym: "⛔", text: "برای نوسان‌گیری مناسب نیست", why: hard.join("، ") } : out.pct >= 70 ? { cls: "ok", sym: "✅", text: "مناسب نوسان‌گیری است", why: "امتیاز " + out.pct + " از ۱۰۰" } : out.pct >= 50 ? { cls: "w", sym: "⚠", text: "نوسان‌گیری با احتیاط", why: "امتیاز " + out.pct + " از ۱۰۰؛ بعضی شرط‌ها ضعیف‌اند" } : { cls: "h", sym: "⛔", text: "مناسب نوسان‌گیری نیست", why: "امتیاز " + out.pct + " از ۱۰۰" };

    // ---- زمان‌بندی: الان کجای طرح هستیم
    var T;
    if (down) T = { cls: "h", sym: "⛔", text: "الان نخر", why: "روند نزولی است؛ منتظر توقف ریزش بمان." };
    else if (S <= stop) T = { cls: "h", sym: "⛔", text: "قیمت زیر حد ضرر طرح است", why: "ساختار بازه شکسته؛ طرح نوسان‌گیری فعلاً باطل است." };
    else if (S <= L2 * 1.005) T = { cls: "ok", sym: "✅", text: "در منطقه‌ی خرید عمیق", why: "هر دو پله‌ی خرید فعال‌اند؛ سفارش‌ها را با حد ضرر هم‌زمان بگذار." };
    else if (S <= L1 * 1.01) T = { cls: "ok", sym: "✅", text: "در منطقه‌ی خرید", why: "پله‌ی اول فعال است؛ پله‌ی دوم را پایین‌تر بگذار." };
    else if (S <= L1 * 1.04) T = { cls: "w", sym: "⏳", text: "کمی بالاتر از منطقه‌ی خرید", why: "تعقیب قیمت نکن؛ سفارش حدی در قیمت‌های پیشنهادی بگذار و بگذار قیمت خودش بیاید." };
    else T = { cls: "wait", sym: "⏳", text: "بالاتر از منطقه‌ی خرید است", why: "الان نخر؛ منتظر برگشت به محدوده‌ی " + Math.round(L2) + " تا " + Math.round(L1) + " بمان." };
    if (EV.block && T.cls !== "h") T = { cls: "h", sym: "⛔", text: "الان وارد نشو؛ رویداد پیش‌رو", why: EV.block };
    else if (EV.wait && (T.cls === "ok" || T.cls === "w")) T = { cls: "w", sym: "⏳", text: "قیمت در منطقه‌ی خرید است ولی صبر کن", why: EV.wait };
    out.timing = T; out.dist = S / L1 - 1;
    return out;
  }

  // وضعیت پوزیشن موجود: قیمت خرید خود کاربر
  function holding(A, E) {
    if (!A || !A.ok || !(E > 0)) return null;
    var p = A.plan, rt = A.rt, S = A.S, fb = A.fb, fs = A.fs;
    var net = function (x) { return x * (1 - fs) / (E * (1 + fb)) - 1; };
    var minT = E * (1 + rt + 0.012), hi = Math.max(p.hi, E);
    var t1 = Math.max(minT, E + FR.t1 * (hi - E)), t2 = Math.max(t1 * 1.01, E + FR.t2 * (hi - E));
    var stop = Math.min(p.stop, E * 0.988), be = E * (1 + fb) / (1 - fs) * 1.003;
    var o = { E: E, t1: t1, t2: t2, stop: stop, be: be, netNow: net(S), netT1: net(t1), netT2: net(t2), netStop: net(stop), aboveRange: E >= p.hi * 0.98 };
    var act;
    if (S <= stop) act = { cls: "h", sym: "⛔", text: "حد ضرر شکسته شد", why: "طبق طرح باید خارج شوی؛ نگه‌داشتن امید است نه طرح." };
    else if (S >= t2) act = { cls: "ok", sym: "💰", text: "به هدف دوم رسیده؛ بقیه را بفروش", why: "سود را ببند؛ طمع کردن سود نوسان‌گیری را به سرمایه‌گذاری ناخواسته تبدیل می‌کند." };
    else if (S >= t1) act = { cls: "ok", sym: "💰", text: "به هدف اول رسیده؛ نصف را بفروش", why: "حد ضرر باقی‌مانده را به قیمت سر به سر (" + Math.round(be) + ") بیاور." };
    else if (S >= be) act = { cls: "w", sym: "⏳", text: "در سود جزئی؛ تا هدف اول نگه دار", why: "هدف اول " + Math.round(t1) + "؛ حد ضرر طبق طرح." };
    else act = { cls: "wait", sym: "⏳", text: "هنوز زیر سر به سر است", why: "تا " + Math.round(be) + " بالا نیامده سود خالص نداری؛ حد ضرر طرح را رعایت کن." };
    o.action = act;
    var ei = A.events && A.events.agmInfo;
    if (ei && ei.kind === "announced" && ei.daysTo >= -1 && ei.tdays <= p.days + 1 && act.cls !== "h") o.eventNote = "مجمع اعلام‌شده (" + ei.date + ") " + ei.daysTo + " روز دیگر است؛ طبق قاعده‌ی نوسان‌گیری قبل از آن خارج شو، حتی اگر به هدف نرسیده باشی." + (ei.drop ? " قیمت پایه‌ی روز مجمع حدود " + (ei.drop * 100).toFixed(1) + "٪ تعدیل می‌شود." : "");
    return o;
  }

  root.SwingTrade = { analyze: analyze, holding: holding, _zigzag: zigzag, _backtest: backtest };
  if (typeof module !== "undefined" && module.exports) module.exports = root.SwingTrade;
})(typeof self !== "undefined" ? self : this);

}catch(e){try{console.error('didehban:swing-trade.js',e)}catch(_){}}

;try{
/* اسکرینر بازار: بدون نیاز به باز کردن صفحه‌ی هر سهم، نمادهای ارزش بررسی را پیدا می‌کند.
   مرحله ۱: یک عکس لحظه‌ای از کل بازار (فیلتر نقدشوندگی و نماد سهمی)
   مرحله ۲: سابقه‌ی ۲۶۰ روزه‌ی نمادهای پرمعامله + همان موتور تکنیکال و دید تحلیلی پنل
   خروجی: دو فهرست «خرید و نگهداری/روندی» و «نوسان‌گیری» با دلیل هر نماد. */
(function (root) {
  var SC = root.StockChecklist, AD = function () { return root.OptAdvisor; };
  var BASES = ["https://cdn.tsetmc.com/api/", "https://cdn.tsetmc.ir/api/"];

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
      if (log) log.push((r.ok ? "OK " : "FAIL ") + url.slice(0, 140) + (r.status ? " [" + r.status + "]" : "") + (r.err ? " " + r.err : "") + (!r.ok && r.snippet ? " :: " + String(r.snippet).slice(0, 80) : ""));
      if (r.ok) return r.json;
    }
    return null;
  }
  function N(x) { var n = Number(x); return isFinite(n) ? n : null; }
  function fixFa(s) { return String(s === undefined || s === null ? "" : s).replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[\u200c\u200f\u200e]/g, " ").replace(/\s+/g, " ").trim(); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  // ---------- مرحله ۱: عکس لحظه‌ای بازار ----------
  // کلیدها بین نسخه‌های سایت فرق می‌کنند؛ برای هر مفهوم چند نام ممکن را امتحان می‌کنیم.
  var MAP = {
    ins: ["insCode", "InsCode", "ins_code"],
    sym: ["lva", "lVal18AFC", "l18", "symbol", "lval18afc"],
    name: ["lvc", "lVal30", "l30", "name"],
    last: ["pdv", "pDrCotVal", "pl", "last", "lastPrice"],
    close: ["pcl", "pClosing", "pc", "final", "closePrice"],
    yest: ["py", "priceYesterday", "yesterday"],
    first: ["pf", "priceFirst", "open"],
    high: ["pmx", "priceMax", "max", "high"],
    low: ["pmn", "priceMin", "min", "low"],
    vol: ["qTotTran5J", "qtj", "tvol", "volume", "vol"],
    val: ["qTotCap", "qtc", "tval", "value"],
    cnt: ["zTotTran", "ztt", "ntran", "count"],
    eps: ["eps"],
  };
  function pickKey(row, keys) { for (var i = 0; i < keys.length; i++) if (row[keys[i]] !== undefined && row[keys[i]] !== null) return keys[i]; return null; }
  function findArray(j) {
    if (Array.isArray(j)) return j;
    if (!j || typeof j !== "object") return null;
    var pref = ["marketwatch", "marketWatch", "marketWatchList", "closingPriceAll", "data", "result"];
    for (var i = 0; i < pref.length; i++) if (Array.isArray(j[pref[i]])) return j[pref[i]];
    for (var k in j) if (Array.isArray(j[k]) && j[k].length > 50) return j[k];
    return null;
  }
  var PT9 = "paperTypes%5B0%5D=1&paperTypes%5B1%5D=2&paperTypes%5B2%5D=3&paperTypes%5B3%5D=4&paperTypes%5B4%5D=5&paperTypes%5B5%5D=6&paperTypes%5B6%5D=7&paperTypes%5B7%5D=8&paperTypes%5B8%5D=9";
  // آدرس‌ها مطابق چیزی است که خود سایت می‌فرستد (با hEven و RefID)
  var MARKET_PATHS = [
    "ClosingPrice/GetMarketWatch?market=0&industrialGroup=&" + PT9 + "&showTraded=false&withBestLimits=true&hEven=0&RefID=0",
    "ClosingPrice/GetMarketWatch?market=0&industrialGroup=&" + PT9 + "&showTraded=false&withBestLimits=false&hEven=0&RefID=0",
    "ClosingPrice/GetMarketWatch?market=0&industrialGroup=&" + PT9 + "&showTraded=false&withBestLimits=false",
    "ClosingPrice/GetMarketWatch?market=0&paperTypes%5B0%5D=1&paperTypes%5B1%5D=2&paperTypes%5B2%5D=3&showTraded=false&withBestLimits=false",
  ];
  // بورس و فرابورس جدا (اگر بازار=۰ جواب نداد، این دو ادغام می‌شوند)
  var MARKET_SPLIT = [1, 2].map(function (m) { return "ClosingPrice/GetMarketWatch?market=" + m + "&industrialGroup=&" + PT9 + "&showTraded=false&withBestLimits=true&hEven=0&RefID=0"; });
  var NOT_STOCK = /صندوق|اختیار|حق\s*تقدم|اوراق|مرابحه|اجاره|سلف|گواهی|سپرده|ETF|اسناد|مشارکت|منفعت|صکوک/;

  // تبدیل آرایه‌ی خام سایت به سطرهای یکدست؛ loose = ذخیره‌ی جدول صفحه (ممکن است قیمت نداشته باشد)
  function rowsFrom(arr, diag, loose) {
    if (!arr || !arr.length) return null;
    var first = arr[0], keys = {};
    Object.keys(MAP).forEach(function (m) { keys[m] = pickKey(first, MAP[m]); });
    diag.rowKeys = Object.keys(first).slice(0, 60); diag.mapped = keys; diag.count = arr.length;
    if (!keys.ins || !keys.sym) { diag.note = "کلید کد نماد/نام نماد در پاسخ شناسایی نشد."; return null; }
    var rows = [], seen = {};
    arr.forEach(function (r) {
      var g = function (m) { return keys[m] ? r[keys[m]] : undefined; };
      var sym = fixFa(g("sym")), name = fixFa(g("name"));
      if (!sym || /\d/.test(sym) || sym.length < 2 || NOT_STOCK.test(name) || NOT_STOCK.test(sym)) return;
      if (/ح$/.test(sym) && sym.length >= 4) return;   // حق تقدم
      var last = N(g("last")), close = N(g("close")), yest = N(g("yest"));
      var S = last > 0 ? last : close;
      if (!(S > 0) && !loose) return;
      var ins = String(g("ins") === undefined || g("ins") === null ? "" : g("ins")), dk = ins || ("s:" + sym); if (seen[dk]) return; seen[dk] = 1;
      if (!ins && !loose) return;
      rows.push({ rank: loose ? N(g("val")) : null, ins: ins, sym: sym, name: name, S: S > 0 ? S : null, close: close, yest: yest, first: N(g("first")), high: N(g("high")), low: N(g("low")), vol: N(g("vol")), val: loose ? null : N(g("val")), cnt: loose ? null : N(g("cnt")), eps: N(g("eps")) });
    });
    diag.stocks = rows.length;
    return rows;
  }
  function readSnap() {
    return new Promise(function (res) {
      try { chrome.storage.local.get("mkt:snap", function (r) { res(r && r["mkt:snap"] ? r["mkt:snap"] : null); }); } catch (e) { res(null); }
    });
  }
  // ساخت فهرست همه‌ی سهم‌ها فقط با «جستجوی نماد» سایت (همان API که با تایپ یک حرف جواب می‌دهد)
  var LETTERS = "آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی".split("");
  function searchArr(j) { return findArray(j) || (j && (j.instrumentSearch || j.instrument)) || []; }
  function fromSearchItem(x) {
    var sym = fixFa(x.lVal18AFC || x.lva), name = fixFa(x.lVal30 || x.lvc || ""), ins = x.insCode || x.InsCode;
    if (!ins || !sym || /\d/.test(sym) || sym.length < 2 || NOT_STOCK.test(name) || NOT_STOCK.test(sym)) return null;
    if (/ح$/.test(sym) && sym.length >= 4) return null;
    if (NOT_STOCK.test(fixFa(x.cgrValCotTitle || "")) || NOT_STOCK.test(fixFa(x.flowTitle || ""))) return null;
    if (x.lastDate && daysOld(x.lastDate) > 10) return null;
    return { ins: String(ins), sym: sym, name: name, S: null, val: null, fromSearch: true };
  }
  async function enumerateBySearch(log, diag, onProgress) {
    var cached = await new Promise(function (res) { try { chrome.storage.local.get("mkt:list", function (r) { res(r && r["mkt:list"]); }); } catch (e) { res(null); } });
    if (cached && cached.rows && cached.rows.length >= 150 && Date.now() - cached.at < 12 * 3600e3) { diag.source = "فهرست ذخیره‌شده از جستجوی نماد (کمتر از ۱۲ ساعت پیش)"; return cached.rows; }
    var all = {}, maxN = 0, raw = {}, reqs = 0, fails = 0;
    async function q(term) {
      reqs++;
      var j = await api("Instrument/GetInstrumentSearch/" + encodeURIComponent(term), reqs <= 2 ? log : null);
      if (!j) { fails++; return -1; }
      var arr = searchArr(j), n = arr.length; raw[term] = n; if (n > maxN) maxN = n;
      arr.forEach(function (x) { var r = fromSearchItem(x); if (r) all[r.ins] = r; });
      return n;
    }
    async function pool(terms, label) {
      var i = 0, done = 0;
      await Promise.all([0, 1, 2, 3].map(async function () {
        while (i < terms.length) { var t = terms[i++]; await q(t); done++; if (onProgress && done % 5 === 0) onProgress({ phase: "market", msg: label + " " + done + " از " + terms.length + " — " + Object.keys(all).length + " سهم پیدا شد…" }); }
      }));
    }
    await pool(LETTERS, "ساخت فهرست بازار با جستجوی حرف‌به‌حرف:");
    // اگر هر حرف حداکثر تعداد ثابتی برمی‌گرداند (سقف نتیجه)، حرف‌های پرنتیجه را دو حرفی می‌کنیم
    var capped = LETTERS.filter(function (l) { return raw[l] >= Math.max(20, maxN * 0.9); });
    if (capped.length && Object.keys(all).length < 1500) {
      var two = []; capped.forEach(function (a) { LETTERS.forEach(function (b) { two.push(a + b); }); });
      await pool(two.slice(0, 700), "جستجوی دو حرفی:");
    }
    var rows = Object.keys(all).map(function (k) { return all[k]; });
    diag.searchInfo = { requests: reqs, failed: fails, maxPerQuery: maxN, cappedLetters: capped.length, found: rows.length };
    if (rows.length >= 150) { try { chrome.storage.local.set({ "mkt:list": { at: Date.now(), rows: rows } }); } catch (e) {} diag.source = "جستجوی نماد (حرف‌به‌حرف)"; return rows; }
    return rows.length >= 30 ? rows : null;
  }
  function askPage(timeout) {
    return new Promise(function (res) {
      try { chrome.runtime.sendMessage({ t: "mwpage", timeout: timeout || 70000 }, function (r) { res(chrome.runtime.lastError ? { ok: false, err: chrome.runtime.lastError.message } : (r || { ok: false, err: "بدون پاسخ" })); }); }
      catch (e) { res({ ok: false, err: String(e) }); }
    });
  }
  async function loadMarket(log, diag, onProgress) {
    var i, j, arr, rows;
    // ۰) صفحه‌ی «دیده‌بان بازار» (main.tsetmc.com/MarketWatch): عکس تازه (کمتر از ۱۵ دقیقه) یا باز کردن آن در تب پس‌زمینه
    var snap0 = await readSnap(), onMW = typeof location !== "undefined" && /marketwatch/i.test(location.pathname + location.hash);
    if (!(snap0 && snap0.arr && snap0.arr.length >= 100 && Date.now() - snap0.at < 15 * 60000) && onMW) {
      // خود همین صفحه دیده‌بان بازار است: دوباره خواندن جدول/پاسخ همین صفحه
      var t0 = Date.now();
      if (onProgress) onProgress({ phase: "market", msg: "در حال خواندن جدول همین صفحه‌ی دیده‌بان بازار (اسکرول خودکار)… تا ۶۰ ثانیه" });
      try { window.postMessage({ __dbRescan: 1 }, "*"); } catch (e) {}
      for (var w = 0; w < 60; w++) {
        await new Promise(function (r) { setTimeout(r, 1000); });
        var sx = await readSnap(); if (sx && sx.at >= t0 && sx.arr && sx.arr.length >= 100) { snap0 = sx; break; }
      }
      diag.mwpage = snap0 && snap0.at >= t0 ? "همین صفحه خوانده شد" : "همین صفحه چیزی ذخیره نکرد";
    } else if (!(snap0 && snap0.arr && snap0.arr.length >= 100 && Date.now() - snap0.at < 15 * 60000)) {
      if (onProgress) onProgress({ phase: "market", msg: "در حال باز کردن صفحه‌ی دیده‌بان بازار (main.tsetmc.com/MarketWatch) در تب پس‌زمینه… (تا ۷۰ ثانیه)" });
      var pr = await askPage(70000); log.push("mwpage: " + JSON.stringify(pr).slice(0, 160));
      diag.mwpage = pr.ok ? "خوانده شد (" + pr.n + " ردیف" + (pr.dom ? "، از جدول صفحه" : ", از پاسخ سایت") + ")" : (pr.err || "ناموفق");
      snap0 = await readSnap();
    }
    if (snap0 && snap0.arr && snap0.arr.length >= 100) {
      rows = rowsFrom(snap0.arr, diag, !!snap0.dom);
      if (!(rows && rows.length >= 60) && !snap0.dom) { diag.snapRetry = "با قیمت کم بود؛ بدون شرط قیمت تلاش شد"; rows = rowsFrom(snap0.arr, diag, true); }
      diag.snap = { n: snap0.arr.length, dom: !!snap0.dom, kept: rows ? rows.length : 0, keys: Object.keys(snap0.arr[0] || {}).slice(0, 20), url: snap0.url || "" };
      if (rows && rows.length >= 60) {
        var ag = Math.round((Date.now() - snap0.at) / 60000);
        diag.source = "صفحه‌ی دیده‌بان بازار TSETMC" + (snap0.dom ? " (جدول صفحه)" : "") + " — " + (ag < 1 ? "همین الان" : ag + " دقیقه پیش");
        return rows;
      }
    }
    for (i = 0; i < MARKET_PATHS.length; i++) {
      j = await api(MARKET_PATHS[i], log);
      if (!j) continue;
      arr = findArray(j);
      diag.topKeys = j && typeof j === "object" && !Array.isArray(j) ? Object.keys(j).slice(0, 12) : ["(آرایه)"];
      if (!arr || !arr.length) { diag.note = "پاسخ آمد ولی آرایه‌ی نمادها پیدا نشد."; continue; }
      rows = rowsFrom(arr, diag, false);
      if (rows && rows.length >= 100) { diag.source = "API سایت"; return rows; }
      if (rows) diag.note = "تعداد نمادهای سهمی بعد از فیلتر خیلی کم بود (" + rows.length + ").";
    }
    // بورس + فرابورس جدا
    var merged = [], got = 0;
    for (i = 0; i < MARKET_SPLIT.length; i++) {
      j = await api(MARKET_SPLIT[i], log); arr = j && findArray(j);
      if (arr && arr.length) { merged = merged.concat(arr); got++; }
    }
    if (got) {
      rows = rowsFrom(merged, diag, false);
      if (rows && rows.length >= 100) { diag.source = "API سایت (بورس + فرابورس)"; return rows; }
    }
    // ذخیره‌ی صفحه‌ی خود TSETMC (افزونه وقتی صفحه‌ی اول/دیده‌بان باز است، پاسخ سایت را نگه می‌دارد)
    var snap = await readSnap();
    if (snap && snap.arr && snap.arr.length) {
      var age = Math.round((Date.now() - snap.at) / 60000);
      rows = rowsFrom(snap.arr, diag, !!snap.dom);
      if (rows && rows.length >= 60) {
        diag.source = snap.dom ? "جدول صفحه‌ی TSETMC (فقط نام نمادها)" : "ذخیره‌ی صفحه‌ی TSETMC";
        diag.note = (diag.note ? diag.note + " " : "") + "API مستقیم جواب نداد؛ فهرست بازار از صفحه‌ی TSETMC که " + (age < 1 ? "همین الان" : age + " دقیقه پیش") + " باز بوده خوانده شد.";
        return rows;
      }
    }
    if (onProgress) onProgress({ phase: "market", msg: "API بازار جواب نداد؛ ساخت فهرست با جستجوی نماد…" });
    var viaSearch = await enumerateBySearch(log, diag, onProgress);
    if (viaSearch) { diag.note = (diag.note ? diag.note + " " : "") + "دیده‌بان بازار جواب نداد؛ فهرست با جستجوی نماد ساخته شد (ترتیب بر اساس نقدشوندگی نیست، پس تعداد بیشتری بررسی می‌شود)."; return viaSearch; }
    diag.note = (diag.note ? diag.note + " " : "") + "راه‌حل: صفحه‌ی اول TSETMC یا «دیده‌بان بازار» را در یک تب باز کن تا کامل بالا بیاید، بعد دوباره جستجو را بزن.";
    return null;
  }
  // فهرست دلخواه: تبدیل نماد به کد با جست‌وجوی سایت
  async function resolveSymbols(text, log) {
    var list = String(text).split(/[,،\s]+/).map(fixFa).filter(Boolean).slice(0, 80), rows = [];
    for (var i = 0; i < list.length; i++) {
      var j = await api("Instrument/GetInstrumentSearch/" + encodeURIComponent(list[i]), log), arr = findArray(j) || (j && j.instrumentSearch) || [];
      var hit = arr.filter(function (x) { return fixFa(x.lVal18AFC || x.lva) === list[i]; })[0] || arr[0];
      if (hit && (hit.insCode || hit.InsCode)) rows.push({ ins: String(hit.insCode || hit.InsCode), sym: fixFa(hit.lVal18AFC || hit.lva || list[i]), name: fixFa(hit.lVal30 || hit.lvc || ""), S: null, val: null, fromList: true });
    }
    return rows;
  }

  async function resolveOne(sym, log) {
    var j = await api("Instrument/GetInstrumentSearch/" + encodeURIComponent(sym), null), arr = searchArr(j) || [];
    var hit = arr.filter(function (x) { return fixFa(x.lVal18AFC || x.lva) === sym; })[0];
    return hit && (hit.insCode || hit.InsCode) ? String(hit.insCode || hit.InsCode) : null;
  }
  // ---------- مرحله ۲: تحلیل یک نماد ----------
  function daysOld(d) {
    var s = String(d); if (s.length !== 8) return 999;
    var t = new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
    return Math.round((Date.now() - t.getTime()) / 86400000);
  }
  function smaAvg(c, end) { if (end < 19) return null; var t = 0; for (var k = end - 19; k <= end; k++) t += c[k]; return t / 20; }
  function analyze(row, dl, opts, st) {
    var out = { ins: row.ins, sym: row.sym, name: row.name, drop: null };
    var bars = root.SCCollect.buildBars(dl || []);
    if (bars.length < 60) { out.drop = "سابقه‌ی کمتر از ۶۰ روز"; return out; }
    if (daysOld(bars[bars.length - 1].d) > 10) { out.drop = "بیش از ۱۰ روز معامله نشده (راکد/متوقف)"; return out; }
    var an = { bars: bars.slice(-250) }, last = an.bars[an.bars.length - 1], S = row.S > 0 ? row.S : last.c;
    // قیمت‌های سابقه تعدیل‌شده‌اند؛ برای اندیکاتورها قیمت آخر خود سابقه را به‌کار می‌بریم تا مقیاس‌ها هم‌خوان باشند
    var Sx = last.c;
    var tr = an.bars.slice(-20), traded = tr.filter(function (b) { return b.v > 0; });
    var vals = traded.map(function (b) { return b.val / 1e9; }).filter(function (x) { return x > 0; });
    var valB = vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : 0;
    var volA = traded.length ? traded.reduce(function (a, b) { return a + b.v; }, 0) / traded.length : 0;
    out.valB = valB; out.tradedDays = traded.length;
    if (traded.length < 18) { out.drop = "فقط " + traded.length + " روز از ۲۰ روز معامله شده"; return out; }
    if (valB < opts.minVal) { out.drop = "ارزش معاملات روزانه (" + valB.toFixed(1) + " میلیارد) کمتر از حداقل"; return out; }
    var T = SC.tech(an, Sx, st);
    if (!T || !(T.atr > 0) || T.rsi === null) { out.drop = "اندیکاتورها محاسبه نشد"; return out; }
    var inp = { S: Sx, capital: 2e9, val_u: Math.round(valB), vol_a: Math.round(volA) };
    var ad = AD(), v = ad.stockView(an, Sx, st, inp, null, 10), ol = v && v.ok ? ad.outlook(v, Sx, 10, 0.5) : null;
    var q = null; try { q = SC.quote("trend", inp, st, an); } catch (e) {}
    var fits = ((q && q.fit) || []).map(function (f) { return { mode: f.mode, sym: f.sym, score: f.score, first: f.first || "" }; });
    var bestFit = fits.filter(function (f) { return f.sym === "✅"; }).sort(function (a, b) { return (b.score || 0) - (a.score || 0); })[0] || fits.filter(function (f) { return f.sym === "⚠"; }).sort(function (a, b) { return (b.score || 0) - (a.score || 0); })[0] || null;
    var chg = row.yest > 0 && S > 0 ? S / row.yest - 1 : (an.bars.length > 1 ? last.c / an.bars[an.bars.length - 2].c - 1 : null);
    var lo20 = Math.min.apply(null, tr.map(function (b) { return b.l; })), hi20 = Math.max.apply(null, tr.map(function (b) { return b.h; }));
    var pos20 = hi20 > lo20 ? (Sx - lo20) / (hi20 - lo20) : 0.5;
    var rng20 = tr.reduce(function (a, b) { return a + (b.h - b.l) / b.c; }, 0) / tr.length;
    // عبور از میانگین ۲۰ روزه‌ی «متحرک» (نه یک خط ثابت)؛ وگرنه سهم روندی هم رفت‌وبرگشتی دیده می‌شد
    var cross = 0, cs = an.bars.map(function (b) { return b.c; }), nB = cs.length;
    for (var i = Math.max(20, nB - 60); i < nB; i++) {
      var m1 = smaAvg(cs, i - 1), m2 = smaAvg(cs, i);
      if (m1 && m2 && (cs[i - 1] - m1) * (cs[i] - m2) < 0) cross++;
    }
    var atrp = T.atrp !== null && T.atrp !== undefined ? T.atrp : T.atr / Sx, atr = T.atr;
    Object.assign(out, { S: Sx, chg: chg, atrp: atrp, rsi: T.rsi, techScore: T.score, fits: fits, bestFit: bestFit, d: v.ok ? v.d : null, conf: v.ok ? v.conf : null, dirTxt: v.ok ? v.dirTxt : "", res: v.res || null, sup: v.sup || null, pos20: pos20, rng20: rng20, ext: T.ext, sma50: T.sma50, sma200: T.sma200, slope50: T.slope50, roc20: T.roc20, volratio: T.volratio, range: !!v.range, ol: ol, hi20: hi20, lo20: lo20, atr: atr, an: null });

    // ---------- امتیاز «خرید و نگهداری / روندی» (۰ تا ۱۰۰) ----------
    var sw = 0, swWhy = [], swBad = [];
    if (bestFit) { var p = bestFit.sym === "✅" ? 30 : 12; sw += p; swWhy.push((bestFit.sym === "✅" ? "الگوی ورود «" + (SC.MODE_FIT ? SC.MODE_FIT[bestFit.mode] : bestFit.mode) + "» با نمودار می‌خواند (امتیاز تکنیکال " + T.score + ")" : "الگوی «" + (SC.MODE_FIT ? SC.MODE_FIT[bestFit.mode] : bestFit.mode) + "» با هشدار می‌خواند")); } else swBad.push("هیچ الگوی ورود (روندی/اصلاح/شکست) الان نمی‌خواند");
    if (v.ok) { var o = 25 * clamp((v.d * v.conf + 0.1) / 0.5, 0, 1); sw += o; if (o >= 10) swWhy.push("دید تحلیلی: " + v.dirTxt + " (جهت " + Math.round(v.d * 100) + "٪، اطمینان " + Math.round(v.conf * 100) + "٪)"); else swBad.push("دید تحلیلی مثبت نیست (" + v.dirTxt + ")"); }
    if (T.sma50 && Sx > T.sma50 && T.slope50 > 0) { sw += 10; swWhy.push("بالای میانگین ۵۰ روزه با شیب صعودی"); } else swBad.push("روند میان‌مدت سالم نیست");
    if (T.sma200 && Sx > T.sma200) { sw += 5; swWhy.push("بالای میانگین ۲۰۰ روزه"); }
    if (T.rsi >= 40 && T.rsi <= st.maxrsi) { sw += 8; } else if (T.rsi > st.maxrsi) swBad.push("RSI " + Math.round(T.rsi) + " (اشباع خرید)");
    if (T.ext !== null && T.ext <= st.maxext) sw += 4; else if (T.ext !== null) swBad.push("قیمت از میانگین ۲۰ روزه دور شده (" + T.ext.toFixed(1) + " ATR)");
    if (T.volratio !== null && T.volratio >= 1.2) { sw += 6; swWhy.push("حجم معاملات از میانگین بیشتر است (" + T.volratio.toFixed(1) + " برابر)"); }
    if (T.roc20 > 0) sw += 4;
    var stopA = Sx - 2 * atr, resA = (v.res && v.res > Sx * 1.005) ? v.res : Sx + 3 * atr, rrS = (resA - Sx) / (2 * atr);   // اگر مقاومتی بالاتر نیست (قیمت در سقف)، هدف تقریبی ۳ ATR بالاتر
    if (rrS >= 2) { sw += 8; swWhy.push("نسبت سود به ریسک تا مقاومت حدود " + rrS.toFixed(1) + " برابر"); } else if (rrS >= 1.5) sw += 4; else swBad.push("تا مقاومت جای کافی نیست (سود به ریسک " + rrS.toFixed(1) + ")");
    sw += clamp(Math.log10(Math.max(valB, 1) / opts.minVal) * 5, 0, 5);
    out.swing = { pts: Math.round(sw), why: swWhy, bad: swBad, mode: bestFit ? bestFit.mode : null, stop: stopA, target: resA };

    // ---------- امتیاز «نوسان‌گیری» ----------
    var vp = 0, vWhy = [], vBad = [], vOK = true;
    if (atrp >= 0.02 && atrp <= 0.065) { vp += 15; vWhy.push("نوسان روزانه مناسب (ATR حدود " + (atrp * 100).toFixed(1) + "٪)"); } else { vOK = false; vBad.push(atrp < 0.02 ? "نوسان روزانه خیلی کم (" + (atrp * 100).toFixed(1) + "٪)" : "نوسان خیلی زیاد/پرخطر (" + (atrp * 100).toFixed(1) + "٪)"); }
    if (rng20 >= 0.025) { vp += 10; vWhy.push("دامنه‌ی میانگین روزانه " + (rng20 * 100).toFixed(1) + "٪ (جا برای سود هست)"); } else { vOK = false; vBad.push("دامنه‌ی روزانه کم است (" + (rng20 * 100).toFixed(1) + "٪)"); }
    if (valB >= opts.minVal * 1.5) { vp += 8; vWhy.push("نقدشوندگی خوب برای ورود و خروج سریع (" + valB.toFixed(0) + " میلیارد ریال در روز)"); } else { vOK = false; vBad.push("نقدشوندگی برای نوسان‌گیری کافی نیست"); }
    if (pos20 <= 0.4) { vp += 22; vWhy.push("نزدیک کف بازه‌ی ۲۰ روزه (" + Math.round(pos20 * 100) + "٪ از بازه)"); } else if (pos20 <= 0.6) vp += 8; else vBad.push("در نیمه‌ی بالای بازه‌ی ۲۰ روزه است (" + Math.round(pos20 * 100) + "٪)");
    if (T.rsi <= 45) { vp += 12; vWhy.push("RSI پایین (" + Math.round(T.rsi) + ") و جا برای برگشت"); } else if (T.rsi <= 55) vp += 5;
    var stopV = Math.max(lo20 - 0.3 * atr, Sx - 1.5 * atr), tgtV = Math.min(hi20, Sx + 3 * atr), rrV = Sx > stopV ? (tgtV - Sx) / (Sx - stopV) : 0;
    if (rrV >= 1.8) { vp += 18; vWhy.push("سود به ریسک تا سقف بازه حدود " + rrV.toFixed(1) + " برابر"); } else if (rrV >= 1.3) vp += 8; else vBad.push("سود به ریسک تا سقف بازه کم است (" + rrV.toFixed(1) + ")");
    if (cross >= 8) { vp += 10; vWhy.push("رفت‌وبرگشت زیاد دور میانگین ۲۰ روزه (" + cross + " بار در ۶۰ روز)؛ نوسان‌گیری‌پذیر"); } else vBad.push("رفت‌وبرگشت کمی دور میانگین دارد (" + cross + " بار)");
    if (v.range) { vp += 5; vWhy.push("بازار نوسانی/خنثی (ADX پایین)"); }
    if (T.sma50 && Sx < T.sma50 * 0.92) { vOK = false; vBad.push("بیش از ۸٪ زیر میانگین ۵۰ روزه؛ روند نزولی قوی"); }
    if (chg !== null && Math.abs(chg) >= 0.9 * (st.lim || 0.03)) { vBad.push("امروز نزدیک حد نوسان (" + (chg * 100).toFixed(1) + "٪)؛ ممکن است صف باشد"); vp -= 8; }
    out.vol = { pts: Math.round(vp), ok: vOK, why: vWhy, bad: vBad, entryLo: lo20, entryHi: Math.min(hi20, lo20 + (hi20 - lo20) * 0.4), stop: stopV, target: tgtV, rr: rrV };
    return out;
  }

  // ---------- اجرای کامل ----------
  async function run(o, onProgress, cancelled) {
    var log = [], diag = {}, st = SC.effective(o.stockSt || {}), stats = { total: 0, analyzed: 0, dropped: 0 };
    var opts = { minVal: o.minVal > 0 ? o.minVal : 20, depth: o.depth || 80 };
    var rows;
    onProgress({ phase: "market", msg: o.list ? "در حال یافتن کد نمادهای فهرست دلخواه…" : "در حال خواندن فهرست کل بازار…" });
    if (o.list) rows = await resolveSymbols(o.list, log); else rows = await loadMarket(log, diag, onProgress);
    if (!rows || !rows.length) return { ok: false, err: o.list ? "هیچ‌کدام از نمادهای فهرست پیدا نشد." : "فهرست بازار خوانده نشد (آدرس یا ساختار پاسخ سایت فرق دارد).", log: log, diag: diag };
    stats.total = rows.length;
    var cand = rows;
    if (!o.list) {
      // پیش‌فیلتر: فقط نمادهای پرمعامله (ارزش امروز) و نه صف قفل‌شده‌ی بی‌معامله
      cand = rows.filter(function (r) { return r.val === null || r.val === undefined ? true : r.val / 1e9 >= opts.minVal * 0.25; }).filter(function (r) { return !(r.cnt !== null && r.cnt !== undefined && r.cnt < 15); });
      if (cand.length < 20 && rows.length >= 60) { cand = rows.slice(); diag.note = (diag.note ? diag.note + " " : "") + "فیلتر اولیه‌ی ارزش/تعداد معامله تقریباً همه را حذف می‌کرد (احتمالاً واحد ستون فرق دارد)؛ فقط بر اساس ترتیب ارزش بررسی شد."; }
      cand.sort(function (a, b) { return (b.val || b.rank || 0) - (a.val || a.rank || 0); });
      var noVal = !cand.some(function (r) { return r.val > 0 || r.rank > 0; });
      cand = cand.slice(0, noVal ? (opts.depth >= 1000 ? 2000 : Math.max(opts.depth * 3, 300)) : opts.depth);   // بدون ارزش معاملات، ترتیب معنا ندارد؛ نمادهای بیشتری بررسی می‌شود
      if (noVal) diag.note = (diag.note ? diag.note + " " : "") + "ارزش معاملات در پاسخ بازار پیدا نشد؛ ترتیب نمادها تصادفی است.";
    }
    stats.stage2 = cand.length;
    var results = [], drops = [], idx = 0, active = 0, done = 0;
    await new Promise(function (resolve) {
      function next() {
        if (cancelled && cancelled()) { if (!active) resolve(); return; }
        while (active < 4 && idx < cand.length) {
          (function (row) {
            active++;
            (row.ins ? Promise.resolve(row.ins) : resolveOne(row.sym, log).then(function (c) { row.ins = c || ""; return c; })).then(function (c) { return c ? api("ClosingPrice/GetClosingPriceDailyList/" + c + "/260", null) : null; }).then(function (j) {
              var dl = j && (j.closingPriceDaily || j.closingPriceDailyList);
              var r = dl ? analyze(row, dl, opts, st) : { ins: row.ins, sym: row.sym, drop: "سابقه خوانده نشد" };
              if (r.drop) drops.push({ sym: row.sym, why: r.drop }); else results.push(r);
            }).catch(function (e) { drops.push({ sym: row.sym, why: "خطا: " + e }); }).then(function () {
              active--; done++;
              onProgress({ phase: "analyze", done: done, total: cand.length, found: results.length, msg: "تحلیل " + done + " از " + cand.length + " نماد…" });
              if (done >= cand.length || (cancelled && cancelled() && !active)) resolve(); else setTimeout(next, 80);
            });
          })(cand[idx++]);
        }
        if (idx >= cand.length && !active) resolve();
      }
      if (!cand.length) resolve(); else next();
    });
    stats.analyzed = results.length; stats.dropped = drops.length;
    var swing = results.filter(function (r) { return r.swing.pts >= 50; }).sort(function (a, b) { return b.swing.pts - a.swing.pts; }).slice(0, 15);
    var vol = results.filter(function (r) { return r.vol.ok && r.vol.pts >= 50; }).sort(function (a, b) { return b.vol.pts - a.vol.pts; }).slice(0, 15);
    results.forEach(function (r) { delete r.an; delete r.ol; });
    return { ok: true, at: Date.now(), stats: stats, opts: opts, swing: swing, vol: vol, drops: drops.slice(0, 40), log: log.slice(-8), diag: diag, cancelled: !!(cancelled && cancelled()) };
  }

  var CRITERIA = {
    common: [
      "فقط سهم (صندوق، اختیار، حق تقدم، اوراق و… حذف می‌شوند).",
      "نقدشوندگی: میانگین ارزش معاملات ۲۰ روز اخیر حداقل مقدار تعیین‌شده، و حداقل ۱۸ روز از ۲۰ روز معامله شده باشد.",
      "نماد راکد یا متوقف (بیش از ۱۰ روز بدون معامله) و سابقه‌ی کمتر از ۶۰ روز حذف می‌شوند.",
    ],
    swing: [
      "الگوی ورود: یکی از سه الگوی «روندی / خرید روی اصلاح / شکست» همین الان با نمودار بخواند (۳۰ امتیاز).",
      "دید تحلیلی نمودار (احتمال شرطی تاریخی، روند، جریان حقیقی/حقوقی و…) مثبت و مطمئن باشد (تا ۲۵ امتیاز).",
      "قیمت بالای میانگین ۵۰ روزه با شیب صعودی (۱۰) و بالای میانگین ۲۰۰ روزه (۵).",
      "RSI بین ۴۰ و سقف مجاز (اشباع خرید نباشد) و قیمت از میانگین ۲۰ روزه خیلی دور نشده باشد (۱۲).",
      "حجم معاملات از میانگین بیشتر (۶) و بازده ۲۰ روزه مثبت (۴).",
      "تا مقاومت جای کافی باشد: سود به ریسک حداقل ۱٫۵ تا ۲ برابر (۸).",
      "نقدشوندگی بالاتر امتیاز کمی بیشتر می‌دهد (تا ۵).",
      "نمایش از امتیاز ۵۰ به بالا، ۱۵ نماد برتر.",
    ],
    vol: [
      "نوسان روزانه (ATR) بین ۲٪ و ۶٫۵٪: نه بی‌حرکت نه پرخطر (۱۵) و میانگین دامنه‌ی روزانه حداقل ۲٫۵٪ (۱۰).",
      "نقدشوندگی حداقل ۱٫۵ برابر حد معمول تا ورود و خروج سریع باشد (۸).",
      "نزدیک کف بازه‌ی ۲۰ روزه باشد (۲۲) و RSI پایین (≤ ۴۵) باشد (۱۲).",
      "سود به ریسک تا سقف بازه‌ی ۲۰ روزه حداقل ۱٫۳ تا ۱٫۸ برابر (۱۸) با حد ضرر زیر کف بازه.",
      "رفت‌وبرگشت زیاد دور میانگین ۲۰ روزه (حداقل ۸ بار در ۶۰ روز) یعنی قیمت عادت به برگشت دارد (۱۰)، و بازار نوسانی بودن (۵).",
      "رد می‌شود اگر بیش از ۸٪ زیر میانگین ۵۰ روزه باشد (روند نزولی قوی). اگر امروز نزدیک حد نوسان باشد امتیاز کم می‌شود.",
      "نمایش از امتیاز ۵۰ به بالا، ۱۵ نماد برتر.",
    ],
  };
  root.Screener = { run: run, analyze: analyze, CRITERIA: CRITERIA, loadMarket: loadMarket };
})(typeof self !== "undefined" ? self : this);

}catch(e){try{console.error('didehban:screener.js',e)}catch(_){}}

;try{
/* پنل شناور چک‌لیست خرید سهام */
(function () {
  "use strict";
  var OC = window.StockChecklist, OCC = window.SCCollect;
  if (!OC || !OCC) return;

  // ---- انتخاب متن: فریم‌های داخلی، متن انتخاب‌شده را به فریم اصلی می‌فرستند
  var lastSel = "";
  function selText() {
    try { return String(window.getSelection() || "").trim(); } catch (e) { return ""; }
  }
  if (window.top !== window) {
    document.addEventListener("selectionchange", function () {
      var t = selText();
      if (t) { try { window.top.postMessage({ __scSel: t }, "*"); } catch (e) {} }
    });
    return;
  }
  if (window.__scLoaded) return;
  window.__scLoaded = true;
  window.addEventListener("message", function (e) {
    if (e.data && typeof e.data.__scSel === "string") lastSel = e.data.__scSel;
  });
  document.addEventListener("selectionchange", function () {
    var t = selText();
    if (t) lastSel = t;
  });

  // ---- ذخیره‌سازی (chrome.storage یا localStorage)
  var store = {
    get: function (k, cb) {
      try {
        if (window.chrome && chrome.storage && chrome.storage.local) {
          var kk = "S." + k;
          chrome.storage.local.get(kk, function (r) { cb(r && r[kk]); });
          return;
        }
      } catch (e) {}
      try { cb(JSON.parse(localStorage.getItem("sc:" + k))); } catch (e) { cb(null); }
    },
    set: function (k, v) {
      try {
        if (window.chrome && chrome.storage && chrome.storage.local) { var o = {}; o["S." + k] = v; chrome.storage.local.set(o); return; }
      } catch (e) {}
      try { localStorage.setItem("sc:" + k, JSON.stringify(v)); } catch (e) {}
    },
  };

  // ---- اعداد فارسی و ورودی
  function toLatin(s) {
    return String(s)
      .replace(/[۰-۹]/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹".indexOf(d); })
      .replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); })
      .replace(/[٬,،]/g, "").replace(/٫/g, ".");
  }
  function parseNum(s) {
    var t = toLatin(s).replace(/[^\d.\-]/g, "");
    if (t === "" || t === "-" || t === ".") return null;
    var v = Number(t);
    return isFinite(v) ? v : null;
  }

  // ---- تعریف فیلدها
  var STEPS = [
    { n: 0, title: "مشخصات" }, { n: 1, title: "وضعیت سهم" }, { n: 2, title: "نقدشوندگی" }, { n: 3, title: "تکنیکال" },
    { n: 4, title: "سود و زیان" }, { n: 5, title: "اندازه معامله" }, { n: 6, title: "برنامه خروج" },
  ];
  function isSell() { return false; }
  var MODE_LABEL = { trend: "خرید روندی", pull: "خرید روی اصلاح", "break": "خرید شکست" };
  var FIELDS = [
    { k: "capital", step: 0, t: "num", l: "سرمایه کل من برای بورس (ریال)" },
    { k: "name_o", step: 0, t: "text", l: "نماد سهم" },
    { k: "S", step: 0, t: "num", l: "آخرین معامله (ریال)", sel: 1 },
    { k: "entry", step: 0, t: "num", l: "قیمتی که می‌خواهم با آن بخرم (ریال) — خالی = آخرین معامله", sel: 1 },
    { k: "q_thesis", step: 1, t: "yn", l: "دلیل مشخص و مکتوب برای خرید این سهم دارم" },
    { k: "q_halt", step: 1, t: "yn", l: "سهم الان معامله می‌شود (بسته یا متوقف نیست)" },
    { k: "q_event", step: 1, t: "yn", l: "تا افق نگهداری‌ام رویداد مهم (مجمع، تقسیم سود، افزایش سرمایه) دارد؟" },
    { k: "q_market", step: 1, t: "yn", l: "روند کلی بازار و صنعت این سهم منفی نیست" },
    { k: "q_fund", step: 1, t: "yn", l: "از نظر بنیادی (سودآوری، گزارش‌ها، بدهی) مشکل جدی ندارد" },
    { k: "pe", step: 1, t: "num", l: "P/E سهم (اختیاری)", sel: 1 },
    { k: "pe_sec", step: 1, t: "num", l: "P/E صنعت (اختیاری)", sel: 1 },
    { k: "val_u", step: 2, t: "num", l: "میانگین ارزش معاملات روزانه (میلیارد ریال)", sel: 1 },
    { k: "vol_a", step: 2, t: "num", l: "میانگین حجم روزانه (سهم)", sel: 1 },
    { k: "ask", step: 2, t: "num", l: "بهترین قیمت فروش (ریال)", sel: 1 },
    { k: "bid", step: 2, t: "num", l: "بهترین قیمت خرید (ریال)", sel: 1 },
    { k: "q_sq", step: 2, t: "yn", l: "سهم الان در صف فروش است؟" },
    { k: "q_bq", step: 2, t: "yn", l: "سهم الان در صف خرید قفل است؟" },
    { k: "stop", step: 4, t: "num", l: "حد ضرر من (ریال) — خالی = پیشنهاد خودکار", sel: 1 },
    { k: "target", step: 4, t: "num", l: "هدف من (ریال) — خالی = مقاومت بعدی", sel: 1 },
    { k: "p", step: 4, t: "pct", l: "احتمال واقع‌بینانه رسیدن به هدف پیش از حد ضرر (٪)" },
    { k: "qty", step: 5, t: "num", l: "تعداد سهمی که می‌خواهم بخرم — خالی = حداکثر مجاز", sel: 1 },
    { k: "q_plan", step: 6, t: "yn", l: "حد ضرر، هدف و زمان خروج را نوشتم و اجرا می‌کنم" },
    { k: "q_lock", step: 6, t: "yn", l: "می‌دانم اگر سهم در صف فروش برود حد ضرر اجرا نمی‌شود و می‌پذیرم" },
    { k: "q_time", step: 6, t: "yn", l: "اگر تا چند روز حرکت نکرد، از سهم خارج می‌شوم" },
  ];
  function fieldShown() { return true; }
  function fieldLabel(f) { return f.l; }

  var STATE = { type: "trend", inp: {}, st: {}, an: null, open: { 0: true }, collapsed: true, vdetOpen: false, showSettings: false, showThr: false, riskOpen: true, view: "main", cmp: [], chartCfg: { n: 120, h: 10, fib: 1, sma: 1, bb: 0, sr: 1, rsi: 1, macd: 1, stoch: 0, adx: 0 }, fin: { unit: 1000000, infl: 0.35, y0: {}, y1: {}, manual: {}, tables: {} } };
  function legacyKey() { return "stk:" + location.origin + location.pathname + location.search; }
  function keyNow() { var c = OCC.insCodeFromUrl(location.href); return c ? "stk:code:" + c : legacyKey(); }
  var pageKey = keyNow();
  var FIN_DEF = function () { return { unit: 1000000, infl: 0.35, y0: {}, y1: {}, manual: {}, tables: {}, hist: {}, slots: { bs: null, is: null, cf: null } }; };
  var symLoaded = false;
  var OPEN_D = {};

  // ---- فرمت
  function fmt(v, f) {
    if (v === null || v === undefined || (typeof v === "number" && !isFinite(v))) return "—";
    switch (f) {
      case "money": return Math.round(v).toLocaleString("en-US");
      case "int": return String(Math.round(v));
      case "pct0": return (v * 100).toFixed(0) + "٪";
      case "pct1": return (v * 100).toFixed(1) + "٪";
      case "pct2": return (v * 100).toFixed(2) + "٪";
      case "ratio1": return v.toFixed(1) + "×";
      case "ratio2": return v.toFixed(2);
      default: return String(v);
    }
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ---- ظاهر
  var host = document.createElement("div");
  host.id = "sc-checklist-host";
  host.style.cssText = "all:initial;position:fixed;top:12px;right:12px;z-index:2147483647;display:none;";
  var root = host.attachShadow({ mode: "open" });
  root.innerHTML =
    '<style>' +
    ':host{all:initial}' +
    '*{box-sizing:border-box;font-family:inherit}' +
    '.panel{' +
    '  --bg:#ffffff;--bg2:#f5f6fb;--fg:#1c2236;--mut:#6a7390;--line:#e7eaf3;--inp:#f1f3f9;--inpf:#ffffff;' +
    '  --acc:#4f46e5;--acc2:#eceeff;--accfg:#ffffff;' +
    '  --ok-bg:#e7f7ee;--ok-fg:#0d6b3b;--bad-bg:#fdebee;--bad-fg:#a3162d;--warn-bg:#fff5dc;--warn-fg:#8a5a00;--wait-bg:#eef0f6;--wait-fg:#59627c;' +
    '  --shadow:0 12px 40px rgba(24,28,60,.22),0 2px 8px rgba(24,28,60,.08);' +
    '  direction:rtl;width:min(560px,96vw);max-height:92vh;display:flex;flex-direction:column;' +
    '  background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);' +
    '  font-size:12.5px;line-height:1.6;overflow:hidden;' +
    '  font-family:"Vazirmatn","Shabnam","Sahel","IBM Plex Sans Arabic","SF Arabic","Segoe UI",system-ui,-apple-system,"Noto Sans Arabic",Tahoma,sans-serif;' +
    '}' +
    '@media (prefers-color-scheme:dark){.panel{' +
    '  --bg:#171b29;--bg2:#10131e;--fg:#e8ebf7;--mut:#98a1be;--line:#2a3047;--inp:#20253a;--inpf:#262c45;' +
    '  --acc:#8b87ff;--acc2:#262a52;--accfg:#12142a;' +
    '  --ok-bg:#12331f;--ok-fg:#7be0a4;--bad-bg:#3a1520;--bad-fg:#ff9aab;--warn-bg:#3a2d10;--warn-fg:#ffd27a;--wait-bg:#232842;--wait-fg:#aab2cf;' +
    '  --shadow:0 12px 40px rgba(0,0,0,.55)}}' +
    'button{cursor:pointer;font-family:inherit}' +
    '.hd{background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;padding:11px 14px;display:flex;align-items:center;gap:6px;cursor:move;user-select:none}' +
    '.hd b{flex:1;font-size:14px;font-weight:700;letter-spacing:.1px}' +
    '.hd button{background:rgba(255,255,255,.18);color:#fff;border:0;border-radius:9px;width:28px;height:28px;font-size:14px;display:grid;place-items:center;padding:0;transition:background .15s}' +
    '.hd button:hover{background:rgba(255,255,255,.32)}' +
    '.verdict{margin:8px 12px 0;padding:9px 12px;font-weight:700;font-size:14px;text-align:center;border-radius:12px;transition:background .2s,color .2s}' +
    '.v-ok{background:var(--ok-bg);color:var(--ok-fg)}.v-bad{background:var(--bad-bg);color:var(--bad-fg)}.v-warn{background:var(--warn-bg);color:var(--warn-fg)}.v-wait{background:var(--wait-bg);color:var(--wait-fg)}' +
    '.tabs{display:flex;gap:3px;background:var(--inp);border-radius:11px;padding:3px;margin:8px 12px 0}' +
    '.tabs button{flex:1;padding:7px 4px;border:0;border-radius:9px;background:transparent;color:var(--mut);font-size:12.5px;font-weight:600;transition:all .15s}' +
    '.tabs button.on{background:var(--bg);color:var(--acc);box-shadow:0 1px 4px rgba(24,28,60,.14)}' +
    '.risk{margin:0 12px 8px;border:1px solid var(--line);border-radius:14px;background:var(--bg);overflow:hidden}' +
    '.risk .rh{display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:pointer;font-weight:700}' +
    '.risk .rh:hover{background:var(--bg2)}' +
    '.risk .rh .num{flex:none;width:23px;height:23px;border-radius:50%;background:var(--acc2);display:grid;place-items:center;font-size:12px}' +
    '.risk .rh .tt{flex:1;font-size:12.5px}' +
    '.risk .rh .rl{color:var(--acc);font-size:12px}' +
    '.risk .rh .cnt{background:var(--acc);color:var(--accfg);border-radius:99px;padding:0 7px;font-size:10.5px}' +
    '.risk .rh::after{content:"‹";color:var(--mut);font-size:16px;transition:transform .2s;transform:rotate(-90deg)}' +
    '.risk.open .rh::after{transform:rotate(90deg)}' +
    '.risk .rbody{display:none;padding:0 12px 11px;border-top:1px solid var(--line)}.risk.open .rbody{display:block}' +
    '.thr .tg{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px 10px}' +
    '.thr .trow{flex-direction:column;align-items:stretch;border-top:0;padding:0;gap:3px}' +
    '.thr .trow label{font-size:11px;color:var(--mut)}.thr .ir{display:flex;gap:4px}.thr .ir input{flex:1;width:auto}' +
    '.sc .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 10px;align-items:end}.sc .grid .full{grid-column:1/-1}' +
    '.risk .rt{display:flex;justify-content:space-between;align-items:baseline;font-weight:700;font-size:12.5px}' +
    '.risk .rt .rl{color:var(--acc);font-weight:700}' +
    '.risk input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:7px;border-radius:99px;direction:ltr;margin:11px 0 5px;outline:none;background:linear-gradient(90deg,#22c55e,#eab308 55%,#ef4444)}' +
    '.risk input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:#fff;border:3px solid var(--acc);box-shadow:0 2px 6px rgba(0,0,0,.3);cursor:grab}' +
    '.risk input[type=range]::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid var(--acc)}' +
    '.risk .ends{display:flex;justify-content:space-between;direction:ltr;font-size:10.5px;color:var(--mut)}' +
    '.risk .rs{font-size:11px;color:var(--mut);line-height:1.8;margin-top:6px}' +
    '.thr-t{margin-top:8px;width:100%;display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border:1px dashed var(--line);border-radius:10px;background:var(--bg);color:var(--acc);font-size:12px;font-weight:600}' +
    '.thr-t:hover{background:var(--acc2)}' +
    '.thr-t .cnt{background:var(--acc);color:var(--accfg);border-radius:99px;padding:0 7px;font-size:10.5px;margin-inline-start:6px}' +
    '.body{overflow:auto;flex:1;padding:8px 0 2px;margin-top:4px}' +
    '.thr{margin:0 12px 10px;padding:8px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:13px}' +
    '.thr .hint{font-size:11px;color:var(--mut);margin:0 0 6px;line-height:1.8}' +
    '.trow{display:flex;align-items:center;gap:6px;padding:4px 0;border-top:1px solid var(--line)}' +
    '.trow:first-of-type{border-top:0}' +
    '.trow label{flex:1;font-size:11.5px;color:var(--fg)}' +
    '.trow input{width:74px;padding:5px 6px;border:1.5px solid transparent;background:var(--inp);color:var(--mut);border-radius:8px;direction:ltr;text-align:center;font-size:12px;font-variant-numeric:tabular-nums;outline:none}' +
    '.trow input.man{color:var(--fg);font-weight:700;border-color:var(--acc);background:var(--inpf)}' +
    '.trow input:focus{border-color:var(--acc);background:var(--inpf);color:var(--fg)}' +
    '.trow .rst{width:22px;height:22px;border:0;border-radius:7px;background:var(--acc2);color:var(--acc);font-size:13px;padding:0;visibility:hidden}' +
    '.trow .rst.show{visibility:visible}' +
    '.thr .all{width:100%;margin-top:6px;padding:6px;border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:9px;font-size:11.5px}' +
    '.step{margin:0 12px 7px;border:1px solid var(--line);border-radius:14px;background:var(--bg);overflow:hidden}' +
    '.step>.sh{display:flex;align-items:center;gap:8px;padding:9px 10px;cursor:pointer;font-weight:700;color:var(--fg)}' +
    '.step>.sh:hover{background:var(--bg2)}' +
    '.step>.sh .num{flex:none;width:23px;height:23px;border-radius:50%;background:var(--acc2);color:var(--acc);display:grid;place-items:center;font-size:11.5px}' +
    '.step>.sh .tt{flex:1;font-size:12.5px}' +
    '.step>.sh .badge{font-size:14px}' +
    '.step>.sh::after{content:"‹";color:var(--mut);font-size:16px;transition:transform .2s;transform:rotate(-90deg)}' +
    '.step.open>.sh::after{transform:rotate(90deg)}' +
    '.sc{padding:2px 12px 10px;display:none;border-top:1px solid var(--line)}.step.open .sc{display:block}' +
    '.fld{margin:7px 0 0}.fld label{display:block;overflow-wrap:anywhere;color:var(--mut);margin-bottom:4px;font-size:11.5px}' +
    '.fld .ctl{display:flex;gap:6px}' +
    '.fld input{flex:1;min-width:0;padding:8px 10px;border:1.5px solid transparent;background:var(--inp);border-radius:10px;font-size:13px;color:var(--fg);direction:ltr;text-align:center;font-variant-numeric:tabular-nums;outline:none;transition:border-color .15s,background .15s}' +
    '.fld input.txt{direction:rtl;text-align:right}' +
    '.fld input:focus{border-color:var(--acc);background:var(--inpf)}' +
    '.fld button.pick{border:0;background:var(--acc2);color:var(--acc);border-radius:10px;padding:0 11px;font-size:15px;transition:background .15s}' +
    '.fld button.pick:hover{filter:brightness(.95)}' +
    '.yn{display:flex;gap:4px;background:var(--inp);padding:3px;border-radius:10px}' +
    '.yn button{flex:1;padding:6px;border:0;border-radius:8px;background:transparent;color:var(--mut);font-size:12.5px;font-weight:600;transition:all .15s}' +
    '.yn button.on[data-v="بله"]{background:var(--ok-bg);color:var(--ok-fg)}' +
    '.yn button.on[data-v="خیر"]{background:var(--bad-bg);color:var(--bad-fg)}' +
    '.calc{margin-top:10px;background:var(--bg2);border-radius:10px;padding:2px 10px}' +
    '.calc:empty{display:none}' +
    '.cr{display:flex;justify-content:space-between;gap:8px;padding:5px 0;font-size:11.5px;border-top:1px solid var(--line)}' +
    '.cr:first-child{border-top:0}' +
    '.cr span:first-child{color:var(--mut)}' +
    '.cr span:last-child{font-weight:700;direction:ltr;white-space:nowrap;font-variant-numeric:tabular-nums}' +
    '.msg{margin:8px 0 0;padding:7px 10px;border-radius:10px;line-height:1.8;font-size:11.5px}' +
    '.msg.h{background:var(--bad-bg);color:var(--bad-fg)}.msg.w{background:var(--warn-bg);color:var(--warn-fg)}.msg.ok{background:var(--ok-bg);color:var(--ok-fg)}.msg.wait{background:var(--wait-bg);color:var(--wait-fg)}' +
    '.set{margin:0 12px 10px;padding:10px 12px;background:var(--bg2);border:1px solid var(--line);border-radius:13px}' +
    '.set h4{margin:0 0 6px;font-size:13px}' +
    '.note{margin:0 12px 7px;padding:6px 10px;font-size:11.5px;color:var(--mut);background:var(--bg2);border-radius:11px;line-height:1.8}' +
    '.set .note{margin:0 0 6px;padding:0;background:none}' +
    '.rep{margin:0 12px 9px;padding:8px 11px;font-size:11.5px;line-height:1.8;background:var(--bg2);border-radius:11px}' +
    '.rep:empty{display:none}' +
    '.rep .o{color:var(--ok-fg)}.rep .x{color:var(--bad-fg)}.rep .t{color:var(--mut)}' +
    '.usep{margin-top:8px;width:100%;padding:8px;border:0;background:var(--acc);color:var(--accfg);border-radius:10px;font-size:12px;font-weight:600}' +
    '.usep:hover{filter:brightness(1.08)}' +
    '.foot{padding:9px 12px;background:var(--bg);border-top:1px solid var(--line);display:flex;gap:6px}' +
    '.foot button{flex:1;padding:8px 4px;border:1px solid var(--line);background:var(--bg2);color:var(--fg);border-radius:10px;font-size:11.5px;font-weight:600;transition:background .15s}' +
    '.foot button:hover{background:var(--acc2);color:var(--acc)}' +
    '.mini{direction:rtl;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;border:0;border-radius:99px;padding:10px 18px;cursor:pointer;font-size:13px;font-weight:700;box-shadow:0 8px 24px rgba(79,70,229,.45);font-family:"Vazirmatn","Shabnam","Sahel","Segoe UI",system-ui,"Noto Sans Arabic",Tahoma,sans-serif}' +
    '.panel.wide{width:min(560px,96vw)}' +
    '.hd button.wide{width:auto;padding:0 9px;font-size:12px;gap:4px;display:flex;align-items:center}' +
    '.hd button.wide .n{background:#fff;color:#4f46e5;border-radius:99px;padding:0 6px;font-size:10.5px;font-weight:700}' +
    '.foot button.pri{background:var(--acc);color:var(--accfg);border-color:var(--acc)}' +
    '.foot button.pri:hover{filter:brightness(1.1);background:var(--acc);color:var(--accfg)}' +
    '.rk{margin:0 12px 8px;display:flex;flex-direction:column;gap:4px}' +
    '.rk .it{display:flex;gap:8px;align-items:center;padding:7px 10px;border-radius:10px;background:var(--bg2);font-size:12px}' +
    '.rk .it:first-child{border:1.5px solid var(--acc)}' +
    '.rk .it .no{flex:none;width:21px;height:21px;border-radius:50%;background:var(--acc2);color:var(--acc);display:grid;place-items:center;font-weight:700;font-size:11px}' +
    '.rk .it .nm{font-weight:700}.rk .it .mt{margin-inline-start:auto;color:var(--mut);font-size:11px}' +
    '.cmp{margin:0 12px 8px;overflow-x:auto;border:1px solid var(--line);border-radius:12px}' +
    '.cmp table{border-collapse:separate;border-spacing:0;width:100%;font-size:11.5px}' +
    '.cmp th,.cmp td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:center;min-width:104px;white-space:nowrap}' +
    '.cmp td.v{direction:ltr;font-variant-numeric:tabular-nums}' +
    '.cmp th.lab,.cmp td.lab{position:sticky;right:0;background:var(--bg);text-align:right;min-width:170px;z-index:1;color:var(--mut);font-weight:600}' +
    '.cmp tr.grp td{background:var(--bg2);color:var(--acc);font-weight:700;text-align:right;position:static}' +
    '.cmp td.best{background:var(--ok-bg);color:var(--ok-fg);font-weight:700}' +
    '.cmp td.worst{background:var(--bad-bg);color:var(--bad-fg)}' +
    '.cmp th{background:var(--bg);vertical-align:top}.cmp th .nm{font-weight:700;font-size:12.5px}.cmp th .sub{font-size:10px;color:var(--mut);font-weight:400}' +
    '.cmp th .ac{display:flex;justify-content:center;gap:5px;margin-top:4px}' +
    '.cmp th .ac a,.cmp th .ac button{width:22px;height:22px;border:0;border-radius:7px;background:var(--inp);color:var(--mut);display:grid;place-items:center;text-decoration:none;font-size:12px;padding:0}' +
    '.cmp th .ac a:hover,.cmp th .ac button:hover{background:var(--acc2);color:var(--acc)}' +
    '.empty{margin:18px 14px;padding:16px;text-align:center;color:var(--mut);background:var(--bg2);border-radius:12px;line-height:2}' +
    '.legend{margin:0 12px 8px;font-size:11px;color:var(--mut);line-height:1.8}' +
    '.tabs button{font-size:11.5px;padding:7px 2px;white-space:nowrap}' +
    '.tabs button.on.sell{color:#c2410c}' +
    '.sg{margin:0 12px 8px;padding:10px 12px;border:1px solid var(--line);border-radius:14px;background:var(--bg)}' +
    '.sg h5{margin:0 0 6px;font-size:12.5px}' +
    '.sg .big{font-size:22px;font-weight:800;color:var(--acc);direction:ltr;display:inline-block;font-variant-numeric:tabular-nums}' +
    '.sg .line{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-top:1px solid var(--line);font-size:11.5px;line-height:1.7}' +
    '.sg .line.bind{color:var(--acc);font-weight:700}' +
    '.sg .line .vv{direction:ltr;white-space:nowrap;font-variant-numeric:tabular-nums;font-weight:700}' +
    '.sgt{margin:0 12px 8px}.sgt th,.sgt td{min-width:0}.sgt th.lab,.sgt td.lab{min-width:120px}' +
    '.chips{display:flex;flex-wrap:wrap;gap:5px;margin:0 12px 8px;align-items:center}' +
    '.chips .lb{font-size:11px;color:var(--mut);margin-inline-end:2px}' +
    '.chip{border:1px solid var(--line);background:var(--bg2);color:var(--mut);border-radius:99px;padding:3px 10px;font-size:11px;font-weight:600}' +
    '.chip.on{background:var(--acc);color:var(--accfg);border-color:var(--acc)}' +
    '.cvwrap{margin:0 12px 8px;border:1px solid var(--line);border-radius:12px;background:var(--bg);overflow:hidden}' +
    '.cvwrap canvas{display:block;width:100%}' +
    '.cvinfo{margin:0 12px 6px;font-size:11px;color:var(--mut);min-height:18px;direction:ltr;text-align:left;font-variant-numeric:tabular-nums}' +
    '.pbig{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}' +
    '.pbig .pv{font-size:26px;font-weight:800;color:var(--acc);direction:ltr}' +
    '.pbar{height:8px;border-radius:99px;background:linear-gradient(90deg,#ef4444,#eab308 50%,#22c55e);position:relative;margin:8px 0 2px;direction:ltr}' +
    '.pbar i{position:absolute;top:-3px;width:3px;height:14px;background:var(--fg);border-radius:2px}' +
    '.pbar b{position:absolute;top:2px;height:4px;background:rgba(0,0,0,.35);border-radius:2px}' +
    '.fgrid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr);gap:5px 8px;align-items:center;margin:0 12px 8px}' +
    '.fgrid .h{font-size:11px;color:var(--mut);font-weight:700;text-align:center}' +
    '.fgrid label{font-size:11.5px}' +
    '.fgrid input,.fset input,.fset select{padding:6px 8px;border:1.5px solid transparent;background:var(--inp);border-radius:8px;font-size:12px;color:var(--fg);direction:ltr;text-align:center;font-variant-numeric:tabular-nums;outline:none;width:100%}' +
    '.fgrid input:focus,.fset input:focus{border-color:var(--acc);background:var(--inpf)}' +
    '.fset{margin:0 12px 8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}' +
    '.fset .btn{border:1px solid var(--line);background:var(--bg2);color:var(--fg);border-radius:10px;padding:7px 12px;font-size:11.5px;font-weight:600}' +
    '.fset .btn.pri{background:var(--acc);color:var(--accfg);border-color:var(--acc)}' +
    '.fset .f1{flex:0 0 130px}.fset label{font-size:11px;color:var(--mut)}' +
    '.pio{display:flex;gap:6px;padding:3px 0;font-size:11.5px;border-top:1px solid var(--line)}' +
    '.pio:first-child{border-top:0}' +
    '.body::-webkit-scrollbar{width:8px}.body::-webkit-scrollbar-thumb{background:var(--line);border-radius:99px}' +
    '.panel{border-radius:20px}' +
    '.hd{padding:10px 12px;gap:7px}' +
    '.hd .lg{display:grid;place-items:center;flex:none}' +
    '.hd .ttl{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.4}' +
    '.hd .ttl b{flex:none;font-size:13.5px}' +
    '.hd .ctx{font-size:11px;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500}' +
    '.hd #cmpb{width:auto;min-width:28px;padding:0 7px;gap:3px;display:flex;align-items:center;font-size:13px}' +
    '.hd #cmpb .n{background:#fff;color:#4f46e5;border-radius:99px;padding:0 5px;font-size:10px;font-weight:700;line-height:1.55}' +
    '.verdict{margin:10px 12px 0;border-radius:14px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.05)}' +
    '.seg{display:flex;align-items:center;gap:3px;background:var(--inp);border-radius:12px;padding:3px;margin:8px 12px 0}' +
    '.seg .lb{font-size:10.5px;color:var(--mut);padding:0 9px;font-weight:600;white-space:nowrap}' +
    '.seg button{flex:1;padding:6px 4px;border:0;border-radius:9px;background:transparent;color:var(--mut);font-size:12px;font-weight:700;transition:all .15s}' +
    '.seg button:hover{color:var(--fg)}' +
    '.seg button.on{background:var(--bg);color:var(--acc);box-shadow:0 1px 4px rgba(24,28,60,.16)}' +
    '.body{padding-top:10px}' +
    '.dock{flex:none;border-top:1px solid var(--line);background:var(--bg);padding:7px 8px 8px;display:flex;flex-direction:column;gap:6px;box-shadow:0 -6px 16px rgba(24,28,60,.05)}' +
    '.dock .sub{display:flex;gap:5px;overflow-x:auto;padding:1px 2px;scrollbar-width:none}' +
    '.dock .sub::-webkit-scrollbar{display:none}' +
    '.dock .sub button{flex:1 1 auto;white-space:nowrap;border:1px solid var(--line);background:var(--bg2);color:var(--mut);border-radius:99px;padding:5px 12px;font-size:11.5px;font-weight:600;transition:all .15s}' +
    '.dock .sub button:hover{color:var(--fg);border-color:var(--acc)}' +
    '.dock .sub button.on{background:var(--acc);color:var(--accfg);border-color:var(--acc);box-shadow:0 3px 10px rgba(79,70,229,.32)}' +
    '.dock .nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px}' +
    '.dock .nav button{display:flex;flex-direction:column;align-items:center;gap:1px;border:0;background:transparent;color:var(--mut);padding:5px 2px 4px;border-radius:12px;font-size:10.5px;font-weight:700;transition:all .15s}' +
    '.dock .nav button .ic{font-size:18px;line-height:1.2;filter:grayscale(.6);opacity:.72;transition:all .15s}' +
    '.dock .nav button:hover{background:var(--bg2);color:var(--fg)}' +
    '.dock .nav button.on{color:var(--acc);background:var(--acc2)}' +
    '.dock .nav button.on .ic{filter:none;opacity:1;transform:translateY(-1px) scale(1.1)}' +
    '.foot{padding:8px 12px;gap:6px}' +
    '.sg{box-shadow:0 1px 3px rgba(24,28,60,.05)}' +
    '.sg h5{display:flex;align-items:center;gap:7px;font-size:12.8px;margin:0 0 7px}' +
    '.sg h5::before{content:"";flex:none;width:4px;height:15px;border-radius:3px;background:linear-gradient(180deg,#4f46e5,#7c3aed)}' +
    '.note{border:1px solid var(--line)}' +
    '.sm button,.fset button:not(.btn){border:1px solid var(--line);background:var(--bg2);color:var(--fg);border-radius:11px;padding:9px 10px;font-size:12px;font-weight:600;transition:all .15s}' +
    '.sm button:hover,.fset button:not(.btn):hover{border-color:var(--acc);color:var(--acc)}' +
    '.sm button.pri,.fset button.pri:not(.btn){background:var(--acc);color:var(--accfg);border-color:var(--acc);font-weight:700;box-shadow:0 4px 12px rgba(79,70,229,.28)}' +
    '.sm button.pri:hover{filter:brightness(1.08);color:var(--accfg)}' +
    '.panel button:disabled{opacity:.5;cursor:not-allowed;box-shadow:none}' +
    '.panel button:focus-visible,.panel input:focus-visible{outline:2px solid var(--acc);outline-offset:1px}' +
    '.sm input[type=text],.sm input:not([type]){transition:border-color .15s,background .15s}' +
    '[id$="res"]>.msg,[id$="body"]>.msg{margin:8px 12px 0}' +
    '.g2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 8px}' +
    '.acts{display:flex;gap:6px;margin:4px 12px 14px}' +
    '.acts button{flex:1;padding:9px 4px;border:1px solid var(--line);background:var(--bg2);color:var(--fg);border-radius:11px;font-size:11.5px;font-weight:600;transition:all .15s}' +
    '.acts button:hover{border-color:var(--acc);color:var(--acc)}' +
    '.acts button.pri{background:var(--acc);color:var(--accfg);border-color:var(--acc);font-weight:700;box-shadow:0 4px 12px rgba(79,70,229,.28)}' +
    '.acts button.pri:hover{color:var(--accfg);filter:brightness(1.08)}' +
    '.panel input[type=range]{accent-color:var(--acc)}' +
    '</style><div id="mount"></div>';
  document.documentElement.appendChild(host);
  var mount = root.getElementById("mount");
  root.querySelector("style").textContent += (window.AdvisorUI ? window.AdvisorUI.CSS : "");

  var STEP_TITLES = function () {
    return ["مرحله ۰ — مشخصات", "مرحله ۱ — وضعیت سهم", "مرحله ۲ — نقدشوندگی", "مرحله ۳ — تکنیکال", "مرحله ۴ — سود و زیان", "مرحله ۵ — اندازه معامله", "مرحله ۶ — برنامه خروج"];
  };

  function persist() { if (!symLoaded) return; STATE.at = Date.now(); store.set(pageKey, { type: STATE.type, inp: STATE.inp, an: STATE.an, at: STATE.at }); }
  function persistUi() { store.set("ui", { riskOpen: STATE.riskOpen }); }
  function persistSettings() { store.set("settings", STATE.st); }


  // ================= مقایسه اختیارها =================
  var CMP_MAX = 20;
  var SYM_BUY = { "✅": "بخر", "⚠": "فعلاً نخر", "❌": "نخر", "⏳": "ناقص" };
  function symLabel(sym) { return SYM_BUY[sym]; }
  var SYM_RANK = { "✅": 0, "⚠": 1, "⏳": 2, "❌": 3 };
  function cmpCount() { return fa((STATE.cmp || []).length); }
  function refreshCmpBadge() { var n = root.getElementById("cmpn"); if (n) n.textContent = cmpCount(); }
  function saveCmp(btn) {
    store.get("compare", function (arr) {
      arr = Array.isArray(arr) ? arr : [];
      var ent = {
        key: pageKey, type: STATE.type, url: location.href, at: Date.now(),
        name: STATE.inp.name_o || document.title || "اختیار",
        inp: JSON.parse(JSON.stringify(STATE.inp || {})), an: STATE.an ? JSON.parse(JSON.stringify(STATE.an)) : null,
      };
      var idx = -1;
      arr.forEach(function (x, i) { if (x.key === ent.key) idx = i; });
      if (idx >= 0) arr[idx] = ent; else arr.push(ent);
      if (arr.length > CMP_MAX) arr = arr.slice(-CMP_MAX);
      store.set("compare", arr);
      STATE.cmp = arr;
      refreshCmpBadge();
      if (btn) { var old = btn.textContent; btn.textContent = idx >= 0 ? "✔ به‌روز شد" : "✔ ذخیره شد"; setTimeout(function () { btn.textContent = old; }, 1300); }
    });
  }
  function delCmp(key) {
    store.get("compare", function (arr) {
      arr = (Array.isArray(arr) ? arr : []).filter(function (x) { return x.key !== key; });
      store.set("compare", arr); STATE.cmp = arr; renderCmpBody();
    });
  }
  function numOk(v) { return typeof v === "number" && isFinite(v); }
  // [شناسه، برچسب، تابع مقدار، قالب، بهتر: high|low]
  var CMP_ROWS = [
    { g: "نتیجه" },
    { id: "final", l: "نتیجه نهایی", html: function (it) { return it.r.final.sym + " " + symLabel(it.r.final.sym); } },
    { id: "steps", l: "مرحله‌های ۱ تا ۶", html: function (it) { var o = ""; for (var i = 1; i <= 6; i++) o += it.r.steps[i].status; return o; } },
    { id: "cnt", l: "ردها / هشدارها", html: function (it) { return fa(it.r.nHard) + " رد · " + fa(it.r.nWarn) + " هشدار"; } },
    { g: "قیمت" },
    { id: "S", l: "آخرین معامله", v: function (it) { return num0(it.e.inp.S); }, f: "money" },
    { id: "E", l: "قیمت ورود", v: function (it) { return it.r.R.E; }, f: "money" },
    { g: "تکنیکال" },
    { id: "score", l: "امتیاز تکنیکال (از ۱۰۰)", v: function (it) { return it.r.R.score; }, f: "int", better: "high" },
    { id: "trend", l: "روند", html: function (it) { return it.r.R.trend || "—"; } },
    { id: "rsi", l: "RSI", v: function (it) { return it.r.R.rsi; }, f: "int" },
    { id: "atrp", l: "نوسان روزانه (ATR)", v: function (it) { return it.r.R.atrp; }, f: "pct2" },
    { id: "dHigh", l: "فاصله از سقف یک‌ساله", v: function (it) { return it.r.R.dHigh; }, f: "pct1", better: "high" },
    { id: "ext", l: "فاصله از میانگین ۲۰ (برابر ATR)", v: function (it) { return it.r.R.ext; }, f: "ratio1" },
    { id: "volratio", l: "حجم نسبی امروز", v: function (it) { return it.r.R.volratio; }, f: "ratio1", better: "high" },
    { id: "power", l: "قدرت خریدار حقیقی", v: function (it) { return it.r.R.power; }, f: "ratio2", better: "high" },
    { g: "سود و زیان" },
    { id: "stopPct", l: "فاصله حد ضرر", v: function (it) { return it.r.R.stopPct; }, f: "pct1", better: "low" },
    { id: "tgtPct", l: "فاصله هدف اول", v: function (it) { return it.r.R.tgtPct; }, f: "pct1", better: "high" },
    { id: "rr", l: "نسبت سود به ریسک", v: function (it) { return it.r.R.rr; }, f: "ratio1", better: "high" },
    { id: "pEmp", l: "احتمال تاریخی", v: function (it) { return it.r.R.pEmp; }, f: "pct0", better: "high" },
    { id: "p", l: "احتمال من", v: function (it) { return num0(it.e.inp.p); }, f: "pct0", better: "high" },
    { id: "ev", l: "امید ریاضی (با احتمال من)", v: function (it) { return it.r.ev; }, f: "ratio2", better: "high" },
    { g: "نقدشوندگی و اندازه" },
    { id: "val_u", l: "ارزش معاملات روزانه (میلیارد)", v: function (it) { return num0(it.e.inp.val_u); }, f: "money", better: "high" },
    { id: "spread", l: "اسپرد", v: function (it) { return it.r.R.spread; }, f: "pct2", better: "low" },
    { id: "qMax", l: "حداکثر تعداد مجاز", v: function (it) { return it.r.R.qMax; }, f: "money" },
    { id: "posVal", l: "ارزش پوزیشن (ریال)", v: function (it) { return it.r.R.posVal; }, f: "money" },
  ];
  function num0(x) { var n = Number(x); return (x === null || x === undefined || x === "" || !isFinite(n)) ? null : n; }
  function renderCmpBody() {
    var el = root.getElementById("cmpbody");
    if (!el) return;
    var list = STATE.cmp || [];
    refreshCmpBadge();
    if (!list.length) {
      el.innerHTML = '<div class="empty">هنوز سهمی ذخیره نکرده‌ای.<br>روی صفحه هر سهم، اطلاعاتش را پر کن و دکمه «ذخیره برای مقایسه» را بزن؛ بعد برو سراغ سهم بعدی.</div>';
      STATE.tsv = "";
      return;
    }
    var items = list.map(function (e) { return { e: e, r: OC.evaluate(e.type, e.inp, STATE.st, e.an) }; });
    items.sort(function (a, b) {
      var d = SYM_RANK[a.r.final.sym] - SYM_RANK[b.r.final.sym];
      if (d) return d;
      var ea = numOk(a.r.score) ? a.r.score : -1, eb = numOk(b.r.score) ? b.r.score : -1;
      return eb - ea;
    });
    function nm(it) { return it.e.inp.name_o || it.e.name; }
    var h = '<div class="rk">';
    items.forEach(function (it, i) {
      h += '<div class="it"><span class="no">' + fa(i + 1) + '</span><span class="nm">' + esc(nm(it)) + '</span><span>' + it.r.final.sym + " " + symLabel(it.r.final.sym) + '</span>' +
        '<span class="mt">' + esc(MODE_LABEL[it.e.type] || it.e.type) + ' · امتیاز ' + esc(fmt(it.r.score, "int")) + ' · سود/ریسک ' + esc(fmt(it.r.R.rr, "ratio1")) + '</span></div>';
    });
    h += '</div><div class="cmp"><table><thead><tr><th class="lab">سهم</th>';
    items.forEach(function (it, i) {
      var t = new Date(it.e.at), hm = "";
      try { hm = t.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }); } catch (x) {}
      h += '<th><div class="nm">' + fa(i + 1) + '# ' + esc(nm(it)) + '</div><div class="sub">' + esc(MODE_LABEL[it.e.type] || it.e.type) + ' · ذخیره ' + esc(hm) + '</div>' +
        '<div class="ac"><a href="' + esc(it.e.url || "#") + '" target="_blank" rel="noopener" title="باز کردن صفحه این سهم">↗</a>' +
        '<button data-del="' + esc(it.e.key) + '" title="حذف از مقایسه">✕</button></div></th>';
    });
    h += '</tr></thead><tbody>';
    var tsv = [["سهم"].concat(items.map(nm)).join("\t")];
    CMP_ROWS.forEach(function (rw) {
      if (rw.g) { h += '<tr class="grp"><td colspan="' + (items.length + 1) + '">' + rw.g + '</td></tr>'; return; }
      var vals = items.map(function (it) { return rw.v ? rw.v(it) : null; });
      var best = null, worst = null;
      if (rw.better) {
        var nums = vals.filter(numOk);
        if (nums.length >= 2) {
          var mn = Math.min.apply(null, nums), mx = Math.max.apply(null, nums);
          if (mn !== mx) { best = rw.better === "high" ? mx : mn; worst = rw.better === "high" ? mn : mx; }
        }
      }
      var cells = [rw.l];
      h += '<tr><td class="lab">' + esc(rw.l) + '</td>';
      items.forEach(function (it, i) {
        var txt = rw.html ? rw.html(it) : fmt(vals[i], rw.f);
        var cls = "v";
        if (best !== null && numOk(vals[i])) { if (vals[i] === best) cls += " best"; else if (vals[i] === worst) cls += " worst"; }
        h += '<td class="' + cls + '">' + esc(txt) + '</td>';
        cells.push(txt);
      });
      h += '</tr>';
      tsv.push(cells.join("\t"));
    });
    h += '</tbody></table></div><div class="legend">سبز = بهترین مقدار در آن ردیف، قرمز = بدترین. رتبه‌بندی اول بر اساس نتیجه نهایی و بعد امتیاز تکنیکال است. همه سهم‌ها با ریسک‌پذیری و آستانه‌های فعلی بالا محاسبه شده‌اند؛ اگر اعداد یک سهم عوض شد، صفحه‌اش را باز کن و دوباره «ذخیره برای مقایسه» را بزن.</div>';
    STATE.tsv = tsv.join("\n");
    el.innerHTML = h;
    el.querySelectorAll("[data-del]").forEach(function (b) { b.onclick = function () { delCmp(b.dataset.del); }; });
  }




  // ================= تب «📒 پورتفو و دفتر معاملات» =================
  var PF = { data: null, prices: {}, at: 0, busy: false, msg: "" };
  function pfLoad(cb) {
    if (PF.data) { cb(); return; }
    store.get("portfolio:v1", function (v) { PF.data = v && v.open ? v : { open: [], closed: [] }; cb(); });
  }
  function pfSave() { store.set("portfolio:v1", PF.data); }
  function pfFees() { var ef = OC.effective ? OC.effective(STATE.st || {}) : {}; return { fb: ef.fee_buy || 0.0037, fs: ef.fee_sell || 0.0088, maxpos: ef.maxpos || 0.25 }; }
  function pfRefresh(force) {
    if (PF.busy || !PF.data) return;
    var open = PF.data.open.filter(function (p) { return p.ins; });
    if (!open.length || (!force && Date.now() - PF.at < 45000)) return;
    PF.busy = true; PF.msg = "در حال گرفتن قیمت لحظه‌ای…"; var st0 = root.getElementById("pfstatus"); if (st0) st0.textContent = PF.msg;
    var seen = {}, uniq = open.filter(function (p) { if (seen[p.ins]) return false; seen[p.ins] = 1; return true; });
    Promise.all(uniq.map(function (p) { return SCCollect.quickPrice(p.ins).then(function (r) { if (r && r.S > 0) PF.prices[p.ins] = r; }).catch(function () {}); })).then(function () {
      PF.busy = false; PF.at = Date.now(); PF.msg = "قیمت‌ها به‌روز شد"; if (STATE.view === "pf") renderPfResult();
    });
  }
  function renderPfBody() {
    var el = root.getElementById("pfbody"); if (!el) return;
    pfLoad(function () {
      var code = OCC.insCodeFromUrl(location.href), sym = STATE.inp.name_o || "";
      el.innerHTML = '<div class="note">دفتر خرید و فروش خودت: سهم‌هایی که الان داری را ثبت کن تا سود و زیان خالص (بعد از کارمزد و مالیات)، فاصله تا حد ضرر و هدف، و ریسک کل پرتفو را یک‌جا ببینی؛ و بعد از فروش، آمار واقعی معامله‌هایت (درصد موفقیت، میانگین سود و زیان) را ببینی. داده‌ها فقط روی همین مرورگر ذخیره می‌شوند.</div>' +
        '<div class="sm" id="pfform" style="margin:0 12px 8px"><b style="font-size:12px">ثبت خرید ' + (sym ? "«" + esc(sym) + "»" : "این سهم") + '</b>' +
        '<div class="g2"><div><label>قیمت خرید (ریال)</label><input type="text" inputmode="decimal" id="pf_buy" value="' + esc(STATE.inp.S || "") + '"></div>' +
        '<div><label>تعداد سهم</label><input type="text" inputmode="decimal" id="pf_qty"></div>' +
        '<div><label>حد ضرر (اختیاری)</label><input type="text" inputmode="decimal" id="pf_stop"></div>' +
        '<div><label>هدف فروش (اختیاری)</label><input type="text" inputmode="decimal" id="pf_tgt"></div></div>' +
        '<div style="display:flex;gap:6px;margin-top:8px"><button id="pfadd" class="pri" style="flex:2"' + (code ? "" : " disabled") + '>➕ ثبت در پورتفو</button><button id="pffill" style="flex:2">⚡ حد ضرر/هدف از طرح نوسان‌گیری</button></div>' +
        (code ? "" : '<div class="legend" style="margin:6px 0 0">برای ثبت، صفحه‌ی خود سهم (InstInfo) باید باز باشد.</div>') + '</div>' +
        '<div id="pfstatus" class="legend" style="margin:0 12px 6px">' + esc(PF.msg || "") + '</div><div id="pfres"></div>';
      var val = function (id) { var e = root.getElementById(id); var n = parseNum(e ? e.value : ""); return n; };
      root.getElementById("pfadd").onclick = function () {
        var buy = val("pf_buy"), qty = val("pf_qty"), stop = val("pf_stop"), tgt = val("pf_tgt");
        if (!(buy > 0) || !(qty >= 1)) { PF.msg = "قیمت خرید و تعداد (حداقل ۱) را درست وارد کن."; var s = root.getElementById("pfstatus"); if (s) s.textContent = PF.msg; return; }
        if (stop && stop >= buy) { PF.msg = "حد ضرر باید کمتر از قیمت خرید باشد."; root.getElementById("pfstatus").textContent = PF.msg; return; }
        if (tgt && tgt <= buy) { PF.msg = "هدف باید بیشتر از قیمت خرید باشد."; root.getElementById("pfstatus").textContent = PF.msg; return; }
        PF.data.open.push({ id: Date.now(), ins: code, sym: sym || ("نماد " + code), buy: buy, qty: Math.floor(qty), stop: stop || null, target: tgt || null, date: new Date().toISOString().slice(0, 10) });
        pfSave(); PF.msg = "ثبت شد ✅"; ["pf_qty", "pf_stop", "pf_tgt"].forEach(function (k) { root.getElementById(k).value = ""; });
        PF.at = 0; renderPfResult(); pfRefresh(true);
      };
      root.getElementById("pffill").onclick = function () {
        try {
          if (!STATE.an || !STATE.an.bars) throw new Error("سابقه‌ی قیمت هنوز خوانده نشده");
          var ef = OC.effective ? OC.effective(STATE.st || {}) : {};
          var A = window.SwingTrade.analyze({ bars: STATE.an.bars, S: num0(STATE.inp.S), fb: ef.fee_buy, fs: ef.fee_sell, lim: ef.lim, minVal: num0(STATE.inp.scr_min) || 20, ev: swtEvents() });
          if (!A.ok) throw new Error(A.err);
          root.getElementById("pf_stop").value = Math.round(A.plan.stop); root.getElementById("pf_tgt").value = Math.round(A.plan.t1);
          PF.msg = "حد ضرر و هدف اول طرح نوسان‌گیری پر شد؛ قیمت خرید و تعداد را خودت وارد کن."; root.getElementById("pfstatus").textContent = PF.msg;
        } catch (e) { root.getElementById("pfstatus").textContent = "نشد: " + (e.message || e); }
      };
      root.getElementById("pfres").addEventListener("click", function (ev) {
        var b = ev.target.closest("[data-act]"); if (!b) return;
        var id = Number(b.dataset.id), act = b.dataset.act, p = PF.data.open.filter(function (x) { return x.id === id; })[0];
        if (act === "refresh") { pfRefresh(true); return; }
        if (act === "csv") {
          var rows = [["نماد", "تاریخ خرید", "تاریخ فروش", "تعداد", "قیمت خرید", "قیمت فروش", "سود خالص ریال", "سود خالص درصد"]].concat(PF.data.closed.map(function (t) { return [t.sym, t.date, t.closeDate, t.qty, t.buy, t.sell, Math.round(t.net), (t.netPct * 100).toFixed(2)]; }));
          var csv = rows.map(function (r) { return r.join(","); }).join("\n");
          try { navigator.clipboard.writeText(csv); PF.msg = "دفتر معاملات (CSV) کپی شد."; } catch (e) { PF.msg = "کپی نشد."; }
          var s2 = root.getElementById("pfstatus"); if (s2) s2.textContent = PF.msg; return;
        }
        if (act === "wipe") { if (confirm("کل پورتفو و دفتر معاملات پاک شود؟ (برگشت‌ناپذیر)")) { PF.data = { open: [], closed: [] }; pfSave(); renderPfResult(); } return; }
        if (!p) return;
        var f = pfFees();
        if (act === "del") { if (confirm("«" + p.sym + "» بدون ثبت در دفتر معاملات حذف شود؟")) { PF.data.open = PF.data.open.filter(function (x) { return x.id !== id; }); pfSave(); renderPfResult(); } return; }
        if (act === "close") {
          var live = PF.prices[p.ins] && PF.prices[p.ins].S, ans = prompt("قیمت فروش «" + p.sym + "» (ریال):", live ? Math.round(live) : "");
          var sp = parseNum(ans || ""); if (!(sp > 0)) return;
          var net = p.qty * (sp * (1 - f.fs) - p.buy * (1 + f.fb)), cost = p.qty * p.buy * (1 + f.fb);
          PF.data.closed.push({ id: p.id, ins: p.ins, sym: p.sym, qty: p.qty, buy: p.buy, sell: sp, date: p.date, closeDate: new Date().toISOString().slice(0, 10), net: net, netPct: net / cost, stop: p.stop, target: p.target });
          PF.data.open = PF.data.open.filter(function (x) { return x.id !== id; }); pfSave(); renderPfResult();
        }
      });
      renderPfResult(); pfRefresh(false);
    });
  }
  function renderPfResult() {
    var el = root.getElementById("pfres"); if (!el || !PF.data) return;
    var f = pfFees(), cap = num0(STATE.inp.capital), D = PF.data, line = function (a, b, cls) { return '<div class="line' + (cls ? " " + cls : "") + '"><span>' + a + '</span><span class="vv">' + b + '</span></div>'; };
    var m = function (x) { return fa(fnum(Math.round(x))); }, col = function (x) { return 'style="color:var(--' + (x >= 0 ? "ok" : "bad") + '-fg)"'; };
    var h = "", tc = 0, tv = 0, tr = 0, nPriced = 0, warns = [];
    if (!D.open.length) h += '<div class="msg wait" style="text-align:center">سهمی در پورتفو نیست. با فرم بالا اولین خرید را ثبت کن.</div>';
    else {
      h += '<div class="sg"><h5>📈 سهم‌های فعلی (' + fa(D.open.length) + ')</h5>';
      D.open.forEach(function (p) {
        var pr = PF.prices[p.ins], S = pr && pr.S, cost = p.qty * p.buy * (1 + f.fb), be = p.buy * (1 + f.fb) / (1 - f.fs);
        tc += cost; if (p.stop) tr += p.qty * (p.buy * (1 + f.fb) - p.stop * (1 - f.fs));
        var badge = "⏳", note = "", net = null, netPct = null;
        if (S) { nPriced++; tv += p.qty * S * (1 - f.fs); net = p.qty * S * (1 - f.fs) - cost; netPct = net / cost;
          if (p.stop && S <= p.stop) { badge = "⛔"; note = "به حد ضرر رسیده یا رد شده؛ طبق برنامه بفروش"; warns.push(p.sym + ": حد ضرر خورد"); }
          else if (p.target && S >= p.target) { badge = "💰"; note = "به هدف رسیده؛ طبق برنامه (بخش یا همه) بفروش"; }
          else if (p.stop && S <= p.stop * 1.015) { badge = "⚠"; note = "کمتر از ۱٫۵٪ تا حد ضرر مانده"; }
          else if (S >= be) badge = "🟢"; else badge = "🟡"; }
        var held = Math.max(0, Math.round((Date.now() - new Date(p.date).getTime()) / 86400000));
        if (cap && cost / cap > f.maxpos) warns.push(p.sym + ": بیش از " + Math.round(f.maxpos * 100) + "٪ سرمایه در یک سهم");
        h += '<div style="border-top:1px solid var(--line);padding:6px 0"><div style="display:flex;justify-content:space-between;align-items:center"><b>' + badge + " " + esc(p.sym) + '</b><span style="font-size:11px;color:var(--mut)">' + fa(fnum(p.qty)) + " سهم · " + fa(held) + ' روز تقویمی</span></div>' +
          line("خرید → الان", m(p.buy) + " → " + (S ? m(S) : "—")) +
          line("سود/زیان خالص", S ? '<span ' + col(net) + '>' + pctS(netPct) + " (" + tmn(net, true) + ")</span>" : "—") +
          line("سر به سر / حد ضرر / هدف", m(be) + " / " + (p.stop ? m(p.stop) : "—") + " / " + (p.target ? m(p.target) : "—")) +
          (S && p.stop ? line("فاصله تا حد ضرر", pctS(p.stop / S - 1)) : "") + (S && p.target ? line("فاصله تا هدف", pctS(p.target / S - 1)) : "") +
          (note ? '<div style="font-size:11.5px;color:var(--mut);margin-top:2px">' + esc(fa(note)) + '</div>' : "") +
          '<div class="fset" style="margin-top:4px"><button class="btn" data-act="close" data-id="' + p.id + '">فروختم (ثبت در دفتر)</button><button class="btn" data-act="del" data-id="' + p.id + '">حذف</button></div></div>';
      });
      h += '</div>';
      h += '<div class="sg"><h5>🧮 جمع پرتفو</h5>' + line("سرمایه‌ی درگیر (با کارمزد خرید)", tmn(tc)) +
        (nPriced ? line("ارزش فعلی بعد از کارمزد و مالیات فروش", tmn(tv)) + line("سود/زیان خالص کل", '<span ' + col(tv - tc) + '>' + pctS((tv - tc) / tc) + " (" + tmn(tv - tc, true) + ")</span>") : line("ارزش فعلی", "قیمت‌ها هنوز نیامده")) +
        (tr > 0 ? line("اگر همه به حد ضرر برسند، زیان کل", tmn(-tr, true) + (cap ? " = " + fa((tr / cap * 100).toFixed(1)) + "٪ سرمایه" : "")) : '<div class="legend" style="margin:4px 0">برای هیچ سهمی حد ضرر ثبت نشده؛ ریسک کل قابل محاسبه نیست.</div>') +
        (cap ? line("نسبت سرمایه‌ی درگیر به کل سرمایه", fa(Math.round(tc / cap * 100)) + "٪") : '<div class="legend" style="margin:4px 0">«سرمایه کل» را در تب چک‌لیست وارد کنی، سهم هر نماد و ریسک کل نسبت به سرمایه هم نشان داده می‌شود.</div>') +
        (warns.length ? '<div class="msg w" style="margin-top:6px;font-size:12px">' + warns.map(function (x) { return "⚠ " + esc(fa(x)); }).join("<br>") + '</div>' : "") +
        '<div class="fset"><button class="btn" data-act="refresh">🔄 قیمت‌ها را به‌روز کن</button></div></div>';
    }
    // آمار دفتر معاملات
    var C = D.closed;
    if (C.length) {
      var w = C.filter(function (t) { return t.net > 0; }), l = C.filter(function (t) { return t.net <= 0; }), avg = function (a, k) { return a.length ? a.reduce(function (s, x) { return s + x[k]; }, 0) / a.length : null; };
      var gw = w.reduce(function (s, x) { return s + x.net; }, 0), gl = -l.reduce(function (s, x) { return s + x.net; }, 0), tot = gw - gl;
      h += '<div class="sg"><h5>📓 آمار واقعی معامله‌های بسته‌شده (' + fa(C.length) + ')</h5>' +
        line("درصد موفقیت", fa(Math.round(w.length / C.length * 100)) + "٪ (" + fa(w.length) + " سود، " + fa(l.length) + " زیان)") +
        line("میانگین سود هر معامله‌ی موفق", avg(w, "netPct") !== null ? pctS(avg(w, "netPct")) : "—") + line("میانگین زیان هر معامله‌ی ناموفق", avg(l, "netPct") !== null ? pctS(avg(l, "netPct")) : "—") +
        line("میانگین خالص هر معامله (امید ریاضی واقعی)", pctS(avg(C, "netPct"), 2)) + line("ضریب سود (جمع سودها ÷ جمع زیان‌ها)", gl > 0 ? fa((gw / gl).toFixed(2)) : "بدون زیان") +
        line("جمع سود/زیان خالص", '<span ' + col(tot) + '>' + tmn(tot, true) + '</span>') +
        '<div style="font-size:11.5px;margin-top:6px"><b>آخرین معامله‌ها</b></div>' + C.slice(-8).reverse().map(function (t) { return line(esc(t.sym) + " — " + esc(fa(t.closeDate)), m(t.buy) + " ← " + m(t.sell) + " (" + pctS(t.netPct) + ")"); }).join("") +
        '<div class="fset"><button class="btn" data-act="csv">📋 کپی دفتر (CSV)</button><button class="btn" data-act="wipe">پاک کردن همه</button></div></div>';
    }
    h += '<div class="legend" style="margin:0 12px 12px">قیمت لحظه‌ای از API خود TSETMC گرفته می‌شود و ممکن است چند دقیقه تأخیر یا خطا داشته باشد. کارمزدها از تنظیمات ⚙ همین سهم می‌آیند. سود و زیان خالص یعنی بعد از کارمزد خرید و کارمزد + مالیات فروش.</div>';
    el.innerHTML = h;
  }

  // ================= تب «🌊 نوسان‌گیری» =================
  function swtEvents() {
    var ev = { loaded: false, err: CDL.err || "", letters: [], agm: null, dps: null, ni: null, eq: null, fin: null };
    try {
      if (CDL.list && CDL.list.length) {
        ev.loaded = true;
        var a = cdlNextAgm();
        if (a) ev.agm = { daysTo: a.daysTo, kind: a.kind, from: jDaysTo(a.from), to: jDaysTo(a.to), date: jStr(a.date) };
        ev.letters = CDL.list.map(function (x) {
          var d = dateOf(toLat(x.date)); if (!d) return null;
          return { cls: cdlCls(x.title), title: String(x.title || "").replace(/[\u200c]/g, " "), ago: -jDaysTo(d), url: x.url };
        }).filter(Boolean);
      }
    } catch (e) { ev.loaded = false; ev.err = String(e); }
    try {
      var y0 = STATE.fin && STATE.fin.y0;
      if (y0) { ev.dps = y0.dps > 0 ? y0.dps : null; ev.ni = y0.ni === undefined ? null : y0.ni; ev.eq = y0.eq === undefined ? null : y0.eq; }
      var fv = finViewNow(); if (fv && fv.ok) ev.fin = { ok: true, score: fv.score, verdict: fv.verdict, bad: fv.bad, good: fv.good, pe: fv.pe, z: fv.z, fscore: fv.fscore };
    } catch (e) {}
    return ev;
  }
  function renderSwtBody() {
    var el = root.getElementById("swtbody"); if (!el) return;
    el.innerHTML = '<div class="note">برای سهمی که الان صفحه‌اش باز است: آیا برای نوسان‌گیری (خرید نزدیک کف بازه و فروش در چند روز نزدیک سقف) مناسب است، دقیقاً با چه قیمتی بخرم، کجا بفروشم و کجا ببُرم. همه‌ی عددها از سابقه‌ی همین سهم محاسبه و روی همان سابقه آزمایش می‌شوند.</div>' +
      '<div class="sm" id="swtform" style="margin:0 12px 8px">' + '<div class="g2"><div>' + holdIn("sw_cap", "سرمایه‌ی این معامله (ریال) — اختیاری", "مثلاً 500000000") + '</div><div>' +
      holdIn("sw_buy", "قیمت خرید من (اگر سهم را داری)", "مثلاً 12500") + '</div></div></div><div id="swtres"></div>';
    readHoldInputs(el); renderSwtResult();
    cdlEnsure(false, function () { if (STATE.view === "swt") renderSwtResult(); });
  }
  function renderSwtResult() {
    var el = root.getElementById("swtres"); if (!el) return;
    var ST = window.SwingTrade;
    if (!ST) { el.innerHTML = '<div class="msg w">موتور نوسان‌گیری بارگذاری نشد؛ افزونه را Reload کن.</div>'; return; }
    if (!STATE.an || !STATE.an.bars || STATE.an.bars.length < 80) { el.innerHTML = '<div class="msg w">سابقه‌ی قیمت این سهم هنوز خوانده نشده (یا کمتر از ۸۰ روز است). چند ثانیه صبر کن؛ اگر نیامد صفحه را Refresh کن.</div>'; return; }
    var ef = OC.effective ? OC.effective(STATE.st || {}) : (STATE.st || {});
    var A = ST.analyze({ bars: STATE.an.bars, S: num0(STATE.inp.S), fb: ef.fee_buy, fs: ef.fee_sell, lim: ef.lim, minVal: num0(STATE.inp.scr_min) || 20, ev: swtEvents() });
    if (!A.ok) { el.innerHTML = '<div class="msg w">' + esc(A.err) + '</div>'; return; }
    var P = A.plan, cap = num0(STATE.inp.sw_cap), E = num0(STATE.inp.sw_buy), HD = E ? ST.holding(A, E) : null;
    var f0 = function (x) { return fa(fnum(Math.round(x))); }, pc = function (x, d) { return pctS(x, d === undefined ? 1 : d); };
    var line = function (a, b, cls) { return '<div class="line' + (cls ? " " + cls : "") + '"><span>' + a + '</span><span class="vv">' + b + '</span></div>'; };
    var h = '<div class="msg ' + A.grade.cls + '" style="font-size:14px;text-align:center"><b>' + A.grade.sym + " " + esc(A.grade.text) + '</b><div style="font-weight:400;font-size:12px;margin-top:3px">' + esc(fa(A.grade.why)) + '</div></div>' +
      '<div class="msg ' + A.timing.cls + '" style="text-align:center"><b>' + A.timing.sym + " " + esc(A.timing.text) + '</b><div style="font-weight:400;font-size:12px;margin-top:3px">' + esc(fa(A.timing.why)) + '</div></div>';
    if (A.hard.length) h += '<div class="msg w" style="font-size:12px">چون «' + esc(A.hard.join("، ")) + '» دیده شد، طرح پایین فقط برای اطلاع است و پیشنهاد معامله نیست.</div>';
    // پوزیشن موجود
    if (HD) {
      h += '<div class="sg"><h5>📍 سهم را داری (خرید ' + f0(E) + ')</h5>' +
        '<div class="msg ' + HD.action.cls + '" style="margin:0 0 6px"><b>' + HD.action.sym + " " + esc(HD.action.text) + '</b><div style="font-weight:400;font-size:12px;margin-top:3px">' + esc(fa(HD.action.why)) + '</div></div>' +
        line("سود/زیان خالص همین الان (بعد از کارمزد و مالیات)", '<span style="color:' + (HD.netNow >= 0 ? "var(--ok-fg)" : "var(--bad-fg)") + '">' + pc(HD.netNow) + '</span>') +
        line("قیمت سر به سر (از آن بالاتر واقعاً سود می‌کنی)", f0(HD.be)) +
        line("هدف ۱ — نصف را بفروش", f0(HD.t1) + " (" + pc(HD.netT1) + ")") + line("هدف ۲ — بقیه را بفروش", f0(HD.t2) + " (" + pc(HD.netT2) + ")") +
        line("حد ضرر", f0(HD.stop) + " (" + pc(HD.netStop) + ")") + '</div>' +
        (HD.eventNote ? '<div class="msg w" style="font-size:12px">📢 ' + esc(fa(HD.eventNote)) + '</div>' : "") + (HD.aboveRange ? '<div class="msg w" style="font-size:12px">قیمت خریدت نزدیک یا بالای سقف بازه‌ی ۲۰ روزه است؛ هدف‌ها بر پایه‌ی حداقل سود بعد از کارمزد گذاشته شده‌اند نه سقف تازه‌ای که قیمت دیده باشد.</div>' : "");
    }
    // سفارش‌ها
    var q1 = cap ? Math.floor(cap * 0.5 / (P.L1 * (1 + A.fb))) : null, q2 = cap ? Math.floor(cap * 0.5 / (P.L2 * (1 + A.fb))) : null;
    h += '<div class="sg"><h5>🧾 طرح سفارش‌ها (برای ورود تازه)</h5>' +
      line("قیمت فعلی", f0(A.S)) +
      line("پله‌ی ۱ خرید (نیمی از سرمایه)", f0(P.L1) + (q1 ? " — " + fa(fnum(q1)) + " سهم" : ""), "bind") +
      line("پله‌ی ۲ خرید (نیم دیگر؛ فقط اگر بیشتر افت کرد)", f0(P.L2) + (q2 ? " — " + fa(fnum(q2)) + " سهم" : ""), "bind") +
      line("میانگین ورود اگر هر دو پر شوند", f0(P.avgIn)) +
      line("حد ضرر (اگر زیرش بسته شد، خارج شو)", f0(P.stop) + " (" + pc(P.netStop) + ")") +
      line("هدف ۱ — فروش ۵۰٪", f0(P.t1) + " (" + pc(P.netT1) + " خالص)") +
      line("هدف ۲ — فروش بقیه", f0(P.t2) + " (" + pc(P.netT2) + " خالص)") +
      line("بعد از رسیدن به هدف ۱، حد ضرر را ببر به", f0(P.be) + " (سر به سر)") +
      line("مهلت نگه‌داری", fa(P.days) + " روز معاملاتی؛ اگر به هدف ۱ نرسید، با قیمت بازار خارج شو") +
      line("سود خالص اگر هر دو هدف بخورند / زیان خالص در حد ضرر", pc(P.netBlend) + " / " + pc(P.netStop)) +
      line("نسبت سود به ریسک", P.rr ? fa(P.rr.toFixed(1)) + " برابر" : "—") +
      (cap ? line("به پول (با سرمایه‌ی واردشده)", tmn(cap * P.netBlend, true) + " سود، یا " + tmn(cap * P.netStop, true) + " زیان") : "") + '</div>';
    // روش اجرا
    h += '<div class="sg"><h5>🪜 چطور اجرا کنم؟</h5><div style="font-size:11.5px;line-height:1.95">' +
      ['۱) پله‌ی ۱ را به‌صورت سفارش حدی (نه بازار) در قیمت بالا بگذار؛ قیمت اگر نیامد، نخر و تعقیبش نکن.',
       '۲) هر روز سفارش‌ها را بازبینی کن: اگر قیمت‌های پیشنهادی (که هر روز با بازه‌ی ۲۰ روزه عوض می‌شوند) تغییر کردند، سفارش قبلی را لغو و تازه بگذار.',
       '۳) بعد از پر شدن، حد ضرر را هم‌زمان بگذار (سفارش شرطی). حد ضرر در بورس ایران همیشه با همان قیمت اجرا نمی‌شود؛ اگر قیمت با شکاف افت کند، بدتر هم می‌شود.',
       '۴) طبق قاعده‌ی رایج، سهمی که امروز می‌خری از روز معاملاتی بعد قابل فروش است (با کارگزاری‌ات تطبیق بده)؛ پس طرح حداقل یک شب ریسک دارد.',
       '۵) به هدف ۱ که رسید نصف را بفروش و حد ضرر را ببر روی سر به سر؛ بقیه برای هدف ۲.',
       '۶) اگر مهلت تمام شد و هدف ۱ نخورد، خارج شو؛ نوسان‌گیری که نوسان نکند، سرمایه‌گذاری ناخواسته می‌شود.'
      ].map(function (t) { return '<div>' + esc(fa(t)) + '</div>'; }).join("") + '</div></div>';
    // رویدادها (کدال + مالی)
    var EVr = A.events, EVin = swtEvents();
    h += '<div class="sg"><h5>📢 رویدادها و بنیاد شرکت (کدال + تب مالی)' + (CDL.loading ? " — در حال دریافت از کدال…" : "") + '</h5>' +
      EVr.lines.map(function (x) { return '<div style="font-size:11.5px;line-height:1.85">' + (x.lv === "ok" ? "✅" : x.lv === "bad" ? "❌" : "⚠") + " " + esc(fa(x.t)) + '</div>'; }).join("");
    var recent = (EVin.letters || []).filter(function (x) { return x.ago >= -1 && x.ago <= 14 && x.cls !== "other"; }).slice(0, 6);
    if (recent.length) h += '<div style="font-size:11.5px;margin-top:5px"><b>اطلاعیه‌های مهم ۱۴ روز اخیر</b></div>' + recent.map(function (x) {
      var nm = (CDL_CLS.filter(function (k) { return k[0] === x.cls; })[0] || [0, "اطلاعیه"])[1];
      return '<div style="font-size:11.5px;line-height:1.8;color:var(--mut)">• ' + esc(fa(nm)) + " — " + (x.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener" style="color:inherit">' : "") + esc(fa(x.title.slice(0, 90))) + (x.url ? "</a>" : "") + " (" + fa(Math.max(0, x.ago)) + " روز پیش)</div>";
    }).join("");
    if (EVin.fin && EVin.fin.bad && EVin.fin.bad.length) h += '<div style="font-size:11.5px;margin-top:5px"><b>نکته‌های ضعف مالی</b></div>' + EVin.fin.bad.map(function (t) { return '<div style="font-size:11.5px;line-height:1.8;color:var(--mut)">• ' + esc(fa(t)) + '</div>'; }).join("");
    h += '</div>';
    // دلیل‌ها
    h += '<div class="sg"><h5>🧮 چرا این حکم؟ (امتیاز ' + fa(A.pct) + ' از ۱۰۰)</h5>' + A.checks.map(function (x) {
      var sym = x.lv === "ok" ? "✅" : x.lv === "bad" ? "❌" : "⚠";
      return '<div style="font-size:11.5px;line-height:1.85">' + sym + " " + esc(fa(x.t)) + (x.max ? ' <span style="color:var(--mut)">(' + fa(x.pts) + "/" + fa(x.max) + ")</span>" : "") + '</div>';
    }).join("") + '</div>';
    // شواهد
    var B = A.best;
    h += '<div class="sg"><h5>📊 آزمون همین قاعده روی سابقه‌ی این سهم (حدود ۸ ماه)</h5>' +
      '<div style="font-size:11.5px;color:var(--mut);line-height:1.8;margin-bottom:4px">قاعده: سفارش خرید حدی در «کف بازه‌ی ۲۰ روزه + k × پهنای بازه»؛ فروش در ۶۰٪ فاصله تا سقف؛ حد ضرر زیر کف؛ مهلت ۸ روز؛ از روز بعد از خرید قابل فروش؛ اگر در یک روز هم حد ضرر هم هدف ممکن بود، ضرر حساب شده؛ کارمزد و مالیات کسر شده. k = عمق ورود.</div>' +
      A.tests.map(function (x) {
        return line("k=" + fa(x.k) + (x.k === B.k ? " (انتخاب‌شده)" : ""), x.n ? fa(x.n) + " معامله | موفق " + fa(Math.round(x.win * 100)) + "٪ | میانگین " + pc(x.exp) + " | هدف/ضرر/مهلت " + fa(x.tg + "/" + x.sp + "/" + x.to) : "سیگنالی نبود", x.k === B.k ? "bind" : "");
      }).join("") +
      line("میانگین سود موفق / میانگین زیان ناموفق (انتخاب‌شده)", (B.avgWin !== null ? pc(B.avgWin) : "—") + " / " + (B.avgLoss !== null ? pc(B.avgLoss) : "—")) +
      line("میانه‌ی روزهای نگه‌داری", B.days !== null ? fa(B.days) + " روز" : "—") +
      line("نوسان روزانه (ATR) / میانگین دامنه‌ی روزانه", pc(A.atrp) + " / " + pc(A.rng20)) +
      line("موج‌های صعودی کامل؛ میانه‌ی دامنه و مدت", fa(A.swings.count) + " مورد؛ " + (A.swings.medAmp ? pc(A.swings.medAmp) + "، " + fa(Math.round(A.swings.medDays)) + " روز" : "—")) +
      line("بازه‌ی ۲۰ روزه (کف تا سقف) / جایگاه قیمت", f0(A.lo20) + " تا " + f0(A.hi20) + " / " + fa(Math.round(A.pos20 * 100)) + "٪ از بازه") +
      line("میانگین ۵۰ / ۲۰۰ روزه", (A.sma50 ? f0(A.sma50) : "—") + " / " + (A.sma200 ? f0(A.sma200) : "—")) +
      line("RSI ۱۴ روزه", A.rsi === null ? "—" : fa(Math.round(A.rsi))) +
      line("کارمزد رفت‌وبرگشت (خرید + فروش و مالیات)", pc(A.rt, 2)) +
      (B.trades.length ? '<div style="font-size:11.5px;margin-top:6px"><b>آخرین معامله‌های شبیه‌سازی‌شده (k انتخاب‌شده)</b></div>' + B.trades.slice(-8).reverse().map(function (x) {
        return line(esc(fa(fmtDate(x.d))) + " — " + (x.why === "target" ? "به هدف" : x.why === "stop" ? "حد ضرر" : "پایان مهلت"), f0(x.fill) + " ← " + f0(x.exit) + " (" + pc(x.net) + "، " + fa(x.days) + " روز)");
      }).join("") : "") + '</div>';
    h += '<div class="legend" style="margin:0 12px 12px">الگوی قیمتی گذشته را می‌خواند و فقط رویدادهایی را که در کدال و تب مالی خوانده شده‌اند (مجمع، افزایش سرمایه، افشای تازه، بنیاد شرکت) لحاظ می‌کند؛ خبرهای غیررسمی، صف، تغییر دامنه‌ی نوسان و حال کل بازار را نمی‌بیند و سود گذشته تضمین سود آینده نیست. کارمزدها تقریبی‌اند و از تنظیمات ⚙ می‌آیند. توصیه‌ی مالی نیست.</div>';
    el.innerHTML = h;
  }

  // ================= تب «دارم؛ بفروشم؟» و تب «ساده» =================
  function tmn(rial, sign) {   // ریال → تومان خوانا
    if (rial === null || rial === undefined || !isFinite(rial)) return "—";
    var t = rial / 10, a = Math.abs(t), txt;
    if (a >= 1e9) txt = (a / 1e9).toFixed(2) + " میلیارد"; else if (a >= 1e6) txt = (a / 1e6).toFixed(1) + " میلیون"; else txt = Math.round(a).toLocaleString("en-US");
    return fa((sign && t > 0 ? "+" : t < 0 ? "−" : "") + txt) + " تومان";
  }
  function pctS(x, d) { return x === null || x === undefined || !isFinite(x) ? "—" : fa((x >= 0 ? "+" : "−") + Math.abs(x * 100).toFixed(d === undefined ? 1 : d)) + "٪"; }
  function holdIn(k, label, ph) { return '<label>' + esc(label) + '</label><input type="text" inputmode="decimal" data-hk="' + k + '" placeholder="' + esc(ph || "") + '" value="' + esc(STATE.inp[k] === undefined || STATE.inp[k] === null ? "" : STATE.inp[k]) + '">'; }
  function readHoldInputs(scope, keys) {
    scope.querySelectorAll("[data-hk]").forEach(function (el) {
      var h = function () { var v = toLat(el.value).replace(/[,٬\s]/g, ""); STATE.inp[el.dataset.hk] = v === "" ? "" : (isFinite(Number(v)) ? Number(v) : STATE.inp[el.dataset.hk]); persist(); (STATE.view === "hold" ? renderHoldResult : STATE.view === "swt" ? renderSwtResult : renderSimpleResult)(); };
      el.addEventListener("input", h);
    });
  }
  function agmForAdvice() { var a = cdlNextAgm(); return a ? { daysTo: a.daysTo, kind: a.kind, text: jStr(a.date) } : null; }

  function renderHoldBody() {
    var el = root.getElementById("holdbody"); if (!el) return;
    var h = '<div class="note">سهم را داری و می‌خواهی بدانی نگه دار یا بفروش، و کی و کجا. فقط قیمت خریدت لازم است؛ بقیه اختیاری‌اند.</div>' +
      '<div class="sm" id="holdform" style="margin:0 12px 8px">' + holdIn("h_buy", "قیمت خرید من (ریال، میانگین اگر چند بار خریدی)", "مثلاً 12500") + holdIn("h_qty", "تعداد سهم (اختیاری — برای محاسبه‌ی سود و زیان کل)", "") +
      holdIn("h_held", "چند روز معاملاتی است نگهش داشته‌ای؟ (اختیاری)", "") + holdIn("h_stop", "حد ضرر خودم (اختیاری — خالی = خودکار)", "") + holdIn("h_target", "هدف خودم (اختیاری — خالی = مقاومت‌ها)", "") + '</div>' +
      '<div id="holdres"></div>';
    el.innerHTML = h; readHoldInputs(el); renderHoldResult();
  }
  function renderHoldResult() {
    var el = root.getElementById("holdres"); if (!el) return;
    var AD = window.OptAdvisor; if (!AD) { el.innerHTML = ""; return; }
    var H = AD.holdAdvice({ S: num0(STATE.inp.S), buy: num0(STATE.inp.h_buy), qty: num0(STATE.inp.h_qty), held: num0(STATE.inp.h_held), userStop: num0(STATE.inp.h_stop), userTarget: num0(STATE.inp.h_target), an: STATE.an, stockSt: STATE.st, inp: STATE.inp, fin: finViewNow(), agm: agmForAdvice() });
    if (!H.ok) { el.innerHTML = H.issues.map(function (t) { return '<div class="msg w">' + esc(t) + '</div>'; }).join(""); return; }
    var V = H.verdict, h = '<div class="msg ' + V.cls + '" style="font-size:14px;text-align:center"><b>' + V.sym + " " + esc(V.text) + '</b><div style="font-weight:400;font-size:12px;margin-top:3px">' + esc(fa(V.why)) + '</div></div>';
    // وضع فعلی
    h += '<div class="sg"><h5>📍 وضعیت فعلی تو</h5>' +
      '<div class="line"><span>قیمت فعلی / قیمت خرید تو</span><span class="vv">' + fa(fnum(H.S)) + " / " + fa(fnum(H.buy)) + '</span></div>' +
      '<div class="line"><span>سود/زیان خالص (بعد از کارمزد و مالیات فروش)</span><span class="vv" style="color:' + (H.pl.netPct >= 0 ? "var(--ok-fg)" : "var(--bad-fg)") + '">' + pctS(H.pl.netPct) + (H.pl.total !== null ? " — " + tmn(H.pl.total, true) : "") + '</span></div>' +
      '<div class="line"><span>قیمتی که بالاتر از آن واقعاً سود می‌کنی (سر به سر)</span><span class="vv">' + fa(fnum(Math.round(H.pl.be))) + '</span></div>' +
      (H.pl.value !== null ? '<div class="line"><span>ارزش فروش الان (خالص)</span><span class="vv">' + tmn(H.pl.value) + '</span></div>' : "") + '</div>';
    // دلیل‌ها
    h += '<div class="sg"><h5>🧮 چرا این حکم؟ (جمع نشانه‌ها: ' + fa(Math.round(H.HS * 100)) + '٪؛ منفی = فشار فروش)</h5>';
    H.signals.forEach(function (x) { h += '<div class="line"><span>' + (x.s > 0.15 ? "🟢 " : x.s < -0.15 ? "🔴 " : "⚪ ") + esc(x.name) + '</span><span class="vv" style="direction:rtl;white-space:normal;text-align:left;font-weight:400">' + esc(fa(x.txt)) + '</span></div>'; });
    h += '</div>';
    // قیمت زیر خط خروج: توضیح اینکه چرا نگه‌داشتن منطقی است یا نیست
    if (H.override) {
      h += '<div class="sg"><h5>🔎 قیمت زیر خط خروج است؛ آیا نگه‌داشتن توجیه دارد؟</h5>';
      H.override.conds.forEach(function (c) { h += '<div style="font-size:11.5px;line-height:1.9;margin:3px 0">' + (c.ok ? "✅ " : "❌ ") + esc(fa(c.ok ? c.yes : c.no)) + '</div>'; });
      h += '<div class="msg ' + (H.override.allOk && !H.override.isUserStop ? "w" : "h") + '" style="margin:6px 0 0;font-size:12px">' + (H.override.allOk ? (H.override.isUserStop ? "همه‌ی شرط‌ها به نفع نگه‌داشتن‌اند، ولی این حد ضرر را خودت گذاشته‌ای؛ اگر استثنا قائل می‌شوی، آگاهانه و با شرط خروج بی‌قید پایین انجام بده." : "هر پنج شرط برقرار است؛ پس شکست احتمالاً نوسان عادی است. نگه‌داشتن فقط با شرط‌های «کی بفروشم» پایین مجاز است.") : "حداقل یکی از شرط‌ها برقرار نیست؛ پس شکست خط خروج جدی گرفته می‌شود و حکم فروش است.") + '</div></div>';
    }
    // کی بفروشم
    h += '<div class="sg"><h5>⏰ کی و کجا بفروشم؟</h5>';
    H.when.forEach(function (w) { h += '<div style="font-size:11.5px;line-height:1.9;margin:4px 0">• ' + esc(fa(w.t)) + '</div>'; });
    h += '</div>';
    // اگر نگه دارم
    if (H.hz) {
      h += '<div class="sg"><h5>🔮 اگر ' + fa(10) + ' روز دیگر هم نگه دارم</h5>' +
        '<div class="line"><span>قیمت مرکزی پیش‌بینی / دامنه‌ی ۶۸٪</span><span class="vv">' + fa(fnum(Math.round(H.hz.median))) + " / " + fa(fnum(Math.round(H.hz.low68))) + " تا " + fa(fnum(Math.round(H.hz.high68))) + '</span></div>' +
        '<div class="line"><span>سود/زیان خالص در سناریوی مرکزی نسبت به قیمت خرید</span><span class="vv">' + pctS(H.hz.medNetPct) + " (بازه: " + pctS(H.hz.lowNetPct, 0) + " تا " + pctS(H.hz.highNetPct, 0) + ')</span></div>' +
        '<div class="line"><span>احتمال اینکه آن موقع در سود خالص باشی</span><span class="vv">' + fa(Math.round(H.hz.pProfit * 100)) + '٪</span></div>' +
        (H.rrHold !== null ? '<div class="line"><span>سود تا هدف اول ÷ ریسک تا خط خروج (از قیمت فعلی)</span><span class="vv">' + fa(H.rrHold.toFixed(1)) + ' برابر ' + (H.rrHold >= 2 ? "✅" : H.rrHold >= 1 ? "⚠" : "❌ نگه‌داشتن ارزش ریسک را ندارد") + '</span></div>' : "") + '</div>';
    }
    h += '<div class="legend" style="margin:6px 12px 8px">این‌ها حساب ریاضی بر پایه‌ی سابقه‌ی قیمت (و تحلیل مالی اگر ثبت شده باشد) هستند؛ پیش‌بینی قطعی یا توصیه‌ی سرمایه‌گذاری نیستند. اگر سهم در صف فروش برود، حد ضرر اجرا نمی‌شود.</div>';
    el.innerHTML = h;
  }

  function renderSimpleBody() {
    var el = root.getElementById("simplebody"); if (!el) return;
    var a = Number(STATE.st.risk) || 5;
    var h = '<div class="note">فقط بگو چقدر پول می‌گذاری و چقدر ریسک‌پذیری؛ بقیه‌ی محاسبات (الگوی ورود، سقف قیمت، حد ضرر، تعداد سهم، سود و زیان) را من انجام می‌دهم.</div>' +
      '<div class="sm" id="simpleform" style="margin:0 12px 8px">' + holdIn("s_cap", "چقدر پول می‌خواهی بگذاری؟ (میلیون تومان)", "مثلاً 200") +
      '<label>ریسک‌پذیری: <b id="srl">' + esc(fa(a)) + " — " + esc(riskLabel(a)) + '</b></label><input type="range" min="1" max="10" step="1" value="' + a + '" id="sriskr" style="width:100%">' +
      '<div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--mut)"><span>محتاط</span><span>ریسک‌پذیر</span></div></div><div id="simpleres"></div>';
    el.innerHTML = h; readHoldInputs(el);
    var r = el.querySelector("#sriskr"); r.addEventListener("input", function () { STATE.st.risk = Number(r.value); persistSettings(); el.querySelector("#srl").textContent = fa(r.value) + " — " + riskLabel(Number(r.value)); renderSimpleResult(); });
    renderSimpleResult();
  }
  function renderSimpleResult() {
    var el = root.getElementById("simpleres"); if (!el) return;
    var AD = window.OptAdvisor; if (!AD) { el.innerHTML = ""; return; }
    var capT = num0(STATE.inp.s_cap);
    var P = AD.simplePlan({ capital: capT > 0 ? capT * 1e7 : null, risk: Number(STATE.st.risk) || 5, S: num0(STATE.inp.S), an: STATE.an, stockSt: STATE.st, inp: STATE.inp, fin: finViewNow() });
    if (!P.ok) { el.innerHTML = P.issues.map(function (t) { return '<div class="msg w">' + esc(t) + '</div>'; }).join(""); return; }
    var D = P.dec, p = P.plan, h = '<div class="msg ' + D.cls + '" style="font-size:16px;text-align:center"><b>' + D.sym + " " + esc(D.text) + '</b></div>';
    h += '<div class="sg"><h5>چرا؟</h5>' + P.why.map(function (t) { return '<div style="font-size:11.5px;line-height:1.9;margin:3px 0">' + esc(fa(t)) + '</div>'; }).join("") + '</div>';
    if (p.qty >= 1) {
      h += '<div class="sg"><h5>📋 برنامه' + (D.cls === "ok" ? "" : " (در صورتی که شرایط درست شد)") + ' — الگوی «' + esc(P.modeLabel) + '»</h5>' +
        '<div class="line"><span>قیمت ورود' + (p.priceOk ? " (همین الان)" : " (منتظر برگشت به این قیمت یا پایین‌تر بمان)") + '</span><span class="vv">' + fa(fnum(Math.round(p.E))) + '</span></div>' +
        '<div class="line"><span>تعداد سهم / مبلغ خرید (' + fa(Math.round(p.investedPct * 100)) + '٪ سرمایه)</span><span class="vv">' + fa(fnum(p.qty)) + " سهم / " + tmn(p.invested) + '</span></div>' +
        '<div class="line"><span>حد ضرر (' + esc(p.stopSrc || "") + ')</span><span class="vv">' + fa(fnum(Math.round(p.stop))) + " (" + pctS(p.stop / p.E - 1) + ')</span></div>' +
        '<div class="line"><span>بیشترین زیان برنامه‌ریزی‌شده اگر حد ضرر بخورد</span><span class="vv" style="color:var(--bad-fg)">' + tmn(-p.riskAmt) + " (" + fa((p.riskPct * 100).toFixed(1)) + '٪ سرمایه)</span></div>' +
        (p.t1 ? '<div class="line"><span>هدف اول (' + esc(p.t1Src || "") + ')</span><span class="vv">' + fa(fnum(Math.round(p.t1))) + " → سود " + tmn(p.gain1, true) + '</span></div>' : "") +
        (p.t2 ? '<div class="line"><span>هدف دوم</span><span class="vv">' + fa(fnum(Math.round(p.t2))) + " → سود " + tmn(p.gain2, true) + '</span></div>' : "") + '</div>';
      h += '<div class="sg"><h5>📊 دامنه‌ی سود و زیان (بعد از کارمزد)</h5>';
      var names = { 10: "۱۰ روز معاملاتی آینده (~۲ هفته)", 21: "یک ماه (~۲۱ روز معاملاتی)", 250: "یک سال (~۲۵۰ روز معاملاتی)" };
      P.ranges.forEach(function (r) {
        h += '<div style="font-size:12px;font-weight:700;margin:8px 0 3px">' + esc(names[r.td] || (r.td + " روز")) + ' — احتمال زیان: ' + fa(Math.round(r.pLoss * 100)) + '٪</div><div class="cmp sgt"><table><thead><tr><th class="lab"></th>' + r.cols.map(function (c) { return '<th>' + esc(c.label) + '</th>'; }).join("") + '</tr></thead><tbody>' +
          '<tr><td class="lab">قیمت سهم</td>' + r.cols.map(function (c) { return '<td class="v">' + fa(fnum(Math.round(c.px))) + '</td>'; }).join("") + '</tr>' +
          '<tr><td class="lab">سود/زیان</td>' + r.cols.map(function (c) { return '<td class="v ' + (c.pl >= 0 ? "best" : "worst") + '">' + pctS(c.pct, 0) + '</td>'; }).join("") + '</tr>' +
          '<tr><td class="lab">به تومان</td>' + r.cols.map(function (c) { return '<td class="v ' + (c.pl >= 0 ? "best" : "worst") + '" style="font-size:10.5px">' + tmn(c.pl, true) + '</td>'; }).join("") + '</tr></tbody></table></div>';
      });
      h += '<div class="legend" style="margin-top:6px">«حداقل/حداکثر محتمل» یعنی ۱٪ بدترین و ۱٪ بهترین حالت طبق مدل نوسان (۹۸٪ حالت‌ها بین این دو است)؛ زیان یا سود واقعی می‌تواند از آن هم فراتر برود (سقوط ناگهانی، صف فروش، دامنه‌ی نوسان). اگر حد ضرر را رعایت کنی و اجرا شود، زیان از «بیشترین زیان برنامه‌ریزی‌شده» بالا نمی‌رود. برای ۱ سال، مدل جهت مشخصی نمی‌دهد و عملاً فقط عرض بازه‌ی نوسان را نشان می‌دهد؛ تورم را هم حساب نکرده است.</div></div>';
    }
    h += '<div class="legend" style="margin:6px 12px 8px">این حالت از همان محاسبات چک‌لیست، پیشنهاد قیمت و دید تحلیلی (نمودار + مالی) استفاده می‌کند، با حساسیت‌هایی که از «ریسک‌پذیری» می‌آید. پیش‌بینی قطعی یا توصیه‌ی سرمایه‌گذاری نیست.</div>';
    el.innerHTML = h;
  }


  // ================= تب «🔍 یافتن سهم» (اسکرینر بازار) =================
  var SCR = { running: false, cancel: false, res: null, prog: "" };
  store.get("scr:last", function (r) { if (r && r.ok) { SCR.res = r; if (STATE.view === "scr") renderScrResult(); } });
  function renderScrBody() {
    var el = root.getElementById("scrbody"); if (!el) return;
    var dp = String(STATE.inp.scr_depth || 80), C = (window.Screener && window.Screener.CRITERIA) || { common: [], swing: [], vol: [] };
    var h = '<div class="note">بدون رفتن به صفحه‌ی هر سهم، کل بازار را با معیارهای ثابت پایین فیلتر می‌کند و نمادهایی را که ارزش بررسی بیشتر دارند فهرست می‌کند: یک فهرست برای خرید و نگهداری، یک فهرست برای نوسان‌گیری. بعد خودت هر کدام را با ابزارهای همین افزونه بررسی کن.</div>' +
      '<div class="sm" id="scrform" style="margin:0 12px 8px">' +
      '<label>عمق جستجو (تعداد پرمعامله‌ترین نمادهایی که کامل تحلیل می‌شوند)</label><select id="scrdepth" style="width:100%;padding:8px;border-radius:9px;border:1.5px solid transparent;background:var(--inp);color:var(--fg);font-family:inherit"><option value="40"' + (dp === "40" ? " selected" : "") + '>سریع (۴۰ نماد)</option><option value="80"' + (dp === "80" ? " selected" : "") + '>معمولی (۸۰ نماد)</option><option value="150"' + (dp === "150" ? " selected" : "") + '>عمیق (۱۵۰ نماد؛ کندتر)</option><option value="2000"' + (dp === "2000" ? " selected" : "") + '>همه‌ی بازار (چند دقیقه؛ کامل‌ترین)</option></select>' +
      holdIn("scr_min", "حداقل میانگین ارزش معاملات روزانه (میلیارد ریال) — پیش‌فرض ۲۰", "20") +
      '<label>فهرست دلخواه (اختیاری؛ نمادها با ویرگول. خالی = کل بازار)</label><input type="text" id="scrlist" placeholder="مثلاً فولاد، فملی، خودرو" value="' + esc(STATE.inp.scr_list || "") + '" style="direction:rtl;text-align:right">' +
      '<div style="display:flex;gap:6px;margin-top:8px"><button id="scrgo" class="pri" style="flex:2">' + (SCR.running ? "در حال جستجو…" : "▶ شروع جستجو") + '</button><button id="scrstop" style="flex:1"' + (SCR.running ? "" : " disabled") + '>توقف</button></div></div>' +
      '<div id="scrsnap" class="legend" style="margin:0 12px 6px"></div>' +
      '<div id="scrprog" class="legend" style="margin:0 12px 6px">' + esc(SCR.prog || "") + '</div><div id="scrres"></div>' +
      '<details style="margin:6px 12px 10px"><summary style="cursor:pointer;font-size:12px"><b>معیارها دقیقاً چیست؟ (برای باز کردن بزن)</b></summary><div style="font-size:11.5px;line-height:1.9">' +
      '<b>مشترک</b>' + C.common.map(function (t) { return '<div>• ' + esc(fa(t)) + '</div>'; }).join("") +
      '<b>خرید و نگهداری / روندی (امتیاز ۰ تا ۱۰۰)</b>' + C.swing.map(function (t) { return '<div>• ' + esc(fa(t)) + '</div>'; }).join("") +
      '<b>نوسان‌گیری (امتیاز ۰ تا ۱۰۰)</b>' + C.vol.map(function (t) { return '<div>• ' + esc(fa(t)) + '</div>'; }).join("") + '</div></details>';
    el.innerHTML = h; readHoldInputs(el);
    root.getElementById("scrdepth").onchange = function () { STATE.inp.scr_depth = Number(this.value); persist(); };
    root.getElementById("scrlist").oninput = function () { STATE.inp.scr_list = this.value; persist(); };
    root.getElementById("scrgo").onclick = scrStart; root.getElementById("scrstop").onclick = function () { SCR.cancel = true; SCR.prog = "در حال توقف…"; var p = root.getElementById("scrprog"); if (p) p.textContent = SCR.prog; };
    renderScrResult();
    try {
      chrome.storage.local.get("mkt:snap", function (r) {
        var sn = r && r["mkt:snap"], e = root.getElementById("scrsnap"); if (!e) return;
        if (sn && sn.arr && sn.arr.length) {
          var m = Math.round((Date.now() - sn.at) / 60000);
          e.textContent = fa("📡 فهرست بازار از صفحه‌ی TSETMC ذخیره شده (" + sn.arr.length + " ردیف، " + (m < 1 ? "همین الان" : m < 90 ? m + " دقیقه پیش" : Math.round(m / 60) + " ساعت پیش") + (sn.dom ? "، فقط نام نمادها" : "") + "). اگر API مستقیم جواب ندهد از همین استفاده می‌شود.");
        } else e.textContent = "📡 اگر «فهرست بازار خوانده نشد» آمد: صفحه‌ی اول TSETMC یا «دیده‌بان بازار» را در یک تب دیگر باز کن تا لود شود، بعد همین‌جا دوباره جستجو را بزن.";
      });
    } catch (e) {}
  }
  function scrStart() {
    if (SCR.running || !window.Screener) return;
    SCR.running = true; SCR.cancel = false; SCR.prog = "شروع…"; renderScrBody();
    window.Screener.run({ stockSt: STATE.st, minVal: num0(STATE.inp.scr_min) > 0 ? num0(STATE.inp.scr_min) : 20, depth: Number(STATE.inp.scr_depth) || 80, list: (STATE.inp.scr_list || "").trim() || null },
      function (p) { SCR.prog = p.msg || ""; var e = root.getElementById("scrprog"); if (e) e.textContent = fa(SCR.prog); },
      function () { return SCR.cancel; }
    ).then(function (r) { SCR.running = false; SCR.res = r; SCR.prog = r.ok ? (r.cancelled ? "متوقف شد؛ نتیجه‌ی بخشی که تحلیل شد:" : "تمام شد.") : ""; if (r.ok) store.set("scr:last", r); if (STATE.view === "scr") renderScrBody(); })
      .catch(function (e) { SCR.running = false; SCR.res = { ok: false, err: "خطای غیرمنتظره: " + e, log: [], diag: {} }; if (STATE.view === "scr") renderScrBody(); });
  }
  function scrCard(r, kind, i) {
    var o = kind === "swing" ? r.swing : r.vol, why = o.why.slice(0, 4), bad = o.bad.slice(0, 2);
    var href = location.origin + "/InstInfo/" + r.ins;
    var h = '<div class="sg"><h5>#' + fa(i + 1) + " " + esc(r.sym) + ' <span style="font-weight:400;color:var(--mut)">' + esc(r.name || "") + '</span> — امتیاز ' + fa(o.pts) + '</h5>' +
      '<div class="line"><span>قیمت / تغییر امروز / نقدشوندگی</span><span class="vv">' + fa(fnum(Math.round(r.S))) + " / " + (r.chg === null || r.chg === undefined ? "—" : pctS(r.chg)) + " / " + fa(r.valB.toFixed(0)) + ' میلیارد</span></div>';
    why.forEach(function (t) { h += '<div style="font-size:11.5px;line-height:1.8">✅ ' + esc(fa(t)) + '</div>'; });
    bad.forEach(function (t) { h += '<div style="font-size:11.5px;line-height:1.8;color:var(--mut)">⚠ ' + esc(fa(t)) + '</div>'; });
    if (kind === "vol") h += '<div class="line"><span>محدوده‌ی ورود / حد ضرر / هدف</span><span class="vv">' + fa(fnum(Math.round(o.entryLo))) + " تا " + fa(fnum(Math.round(o.entryHi))) + " / " + fa(fnum(Math.round(o.stop))) + " / " + fa(fnum(Math.round(o.target))) + '</span></div>';
    else h += '<div class="line"><span>الگو / حد ضرر تقریبی (۲ ATR) / هدف</span><span class="vv">' + esc(o.mode && MODE_LABEL[o.mode] ? MODE_LABEL[o.mode] : "—") + " / " + fa(fnum(Math.round(o.stop))) + " / " + fa(fnum(Math.round(o.target))) + '</span></div>';
    if (kind === "swing" && r.fits && r.fits.length) {
      var ORDER = ["trend", "pull", "break"], WHAT = { trend: "روند صعودی سالم و قیمت نزدیک میانگین ۲۰ روزه", pull: "اصلاح سالم داخل روند صعودی", "break": "عبور از سطح شکست با حجم" };
      h += '<details style="margin:5px 0"><summary style="cursor:pointer;font-size:11.5px"><b>چرا این الگو؟ وضعیت سه الگوی ورود</b></summary><div style="font-size:11.5px;line-height:1.9">';
      ORDER.forEach(function (m) {
        var f = r.fits.filter(function (x) { return x.mode === m; })[0]; if (!f) return;
        var chosen = o.mode === m, why = f.sym === "✅" ? "شرایط برقرار است: " + WHAT[m] : (f.first || "شرایط کامل نیست");
        h += '<div' + (chosen ? ' style="font-weight:700"' : ' style="color:var(--mut)"') + '>' + (chosen ? "◀ " : "• ") + esc(MODE_LABEL[m]) + " " + esc(f.sym || "") + " (امتیاز " + fa(f.score === null || f.score === undefined ? "—" : Math.round(f.score)) + ") — " + esc(fa(why)) + '</div>';
      });
      h += '<div style="color:var(--mut)">الگوی انتخاب‌شده (◀) همان است که کامل‌تر می‌خواند؛ اگر هیچ‌کدام ✅ نباشد، بهترین الگوی دارای هشدار (⚠) نشان داده می‌شود.</div></div></details>';
    }
    return h + '<div style="margin-top:4px"><a href="' + esc(href) + '" target="_blank" rel="noopener" style="color:var(--acc);font-size:12px;font-weight:700">باز کردن صفحه‌ی سهم برای بررسی کامل ↗</a></div></div>';
  }
  function renderScrResult() {
    var el = root.getElementById("scrres"); if (!el) return;
    var r = SCR.res; if (!r) { el.innerHTML = ""; return; }
    if (!r.ok) {
      var dg = []; dg.push(r.err || "ناموفق"); if (r.diag && r.diag.note) dg.push(r.diag.note);
      el.innerHTML = '<div class="msg w">' + esc(dg.join(" — ")) + '</div><div class="legend" style="margin:0 12px 6px">اگر «فهرست دلخواه» را پر کنی (مثلاً چند نماد با ویرگول)، بدون نیاز به فهرست کل بازار هم کار می‌کند. برای رفع اشکال، متن زیر را برای من بفرست:</div>' +
        '<details open style="margin:0 12px"><summary style="cursor:pointer;font-size:11.5px">جزئیات فنی</summary><textarea readonly style="width:100%;height:150px;direction:ltr;font-size:10.5px">' + esc(JSON.stringify({ diag: r.diag, log: r.log }, null, 1)) + '</textarea></details>';
      return;
    }
    var st = r.stats, h = '<div class="legend" style="margin:0 12px 6px">' + esc(fa("آخرین جستجو: " + new Date(r.at).toLocaleString("fa-IR") + " — سهم‌های بازار: " + st.total + "، تحلیل کامل: " + st.stage2 + "، قابل‌قبول برای تحلیل: " + st.analyzed + "، ردشده: " + st.dropped)) + (r.diag && r.diag.note ? ' — ' + esc(r.diag.note) : '') + '</div>';
    h += '<div class="msg ok" style="margin:6px 12px"><b>📈 خرید و نگهداری / روندی — ' + fa(r.swing.length) + ' نماد</b></div>';
    h += r.swing.length ? r.swing.map(function (x, i) { return scrCard(x, "swing", i); }).join("") : '<div class="legend" style="margin:0 12px 8px">امروز نمادی با امتیاز ۵۰ به بالا پیدا نشد؛ یعنی شرایط بازار برای این سبک مناسب نیست یا حداقل ارزش معاملات را کم کن.</div>';
    h += '<div class="msg ok" style="margin:10px 12px 6px"><b>↕ نوسان‌گیری — ' + fa(r.vol.length) + ' نماد</b></div>';
    h += r.vol.length ? r.vol.map(function (x, i) { return scrCard(x, "vol", i); }).join("") : '<div class="legend" style="margin:0 12px 8px">نمادی با شرایط نوسان‌گیری پیدا نشد.</div>';
    if (r.drops && r.drops.length) h += '<details style="margin:6px 12px"><summary style="cursor:pointer;font-size:11.5px">چرا بعضی نمادها حذف شدند؟</summary><div style="font-size:11px;line-height:1.8">' + r.drops.slice(0, 25).map(function (d) { return esc(d.sym) + ": " + esc(d.why); }).join("<br>") + '</div></details>';
    h += '<div class="legend" style="margin:6px 12px 10px">این فهرست فقط «ارزش بررسی بیشتر» را نشان می‌دهد، نه توصیه‌ی خرید. هر نماد را با چک‌لیست، «🎯 ساده» و «📈 نمودار» بررسی کن؛ صف‌ها، اخبار و اطلاعات مالی در این فیلتر لحاظ نشده‌اند.</div>';
    el.innerHTML = h;
  }

  // ================= دید تحلیلی (نمودار + اطلاعات مالی) =================
  function finViewNow() { var AD = window.OptAdvisor; return AD ? AD.finView(STATE.fin, num0(STATE.inp.S), STATE.inp) : null; }
  function outlookCtx(hDays) {
    var AD = window.OptAdvisor;
    if (!AD || !STATE.an || !STATE.an.bars || STATE.an.bars.length < 60) return null;
    var S = num0(STATE.inp.S); if (!(S > 0)) S = STATE.an.bars[STATE.an.bars.length - 1].c;
    var fv = finViewNow();
    var v = AD.stockView(STATE.an, S, STATE.st, STATE.inp, fv, hDays);
    if (!v || !v.ok) return { v: v, S: S, fv: fv };
    var ol = AD.outlook(v, S, hDays, 0.5);
    return { v: v, ol: ol, nr: AD.narrative(v, ol, hDays), S: S, fv: fv, hDays: hDays };
  }
  function outlookBlock(hDays, title) {
    var c = outlookCtx(hDays);
    if (!c || !c.ol) return '<div class="sg"><h5>' + esc(title) + '</h5><div class="legend">سابقه قیمت سهم خوانده نشده است؛ «به‌روزرسانی از سایت» را بزن تا جمع‌بندی ساخته شود.</div></div>';
    return window.AdvisorUI.outlookHtml({ title: title, S: c.S, v: c.v, ol: c.ol, nr: c.nr, hDays: hDays });
  }

  // ================= تب پیشنهاد =================
  function pAbs(g) { return fa(Math.abs(g * 100).toFixed(0)) + "٪"; }
  function enterSug() {
    store.get("compare", function (arr) {
      STATE.cmp = Array.isArray(arr) ? arr : [];
      STATE.view = "sug"; STATE.showSettings = false;
      renderAll();
    });
  }
  function renderSugBody() {
    var el = root.getElementById("sugbody");
    if (!el) return;
    var m = STATE.type;
    // ---- دید تحلیلی (نمودار + مالی): اگر احتمال را خودت وارد نکرده‌ای، از آن ساخته می‌شود؛ دید نزولی سقف قیمت را پایین می‌آورد
    var oc = outlookCtx(10), inpQ = STATE.inp, pNote = null;
    if (num0(STATE.inp.p) === null && oc && oc.v && oc.v.ok) {
      var r0 = OC.evaluate(m, STATE.inp, STATE.st, STATE.an), pr = r0 && r0.R ? r0.R.pSug : null;
      if (pr !== null && pr !== undefined) {
        var tilt = 0.10 * oc.v.d * oc.v.conf, pAdj = Math.round(Math.min(0.95, Math.max(0.05, pr + tilt)) * 100) / 100;
        inpQ = Object.assign({}, STATE.inp, { p: pAdj });
        pNote = "احتمال را خودت وارد نکرده‌ای؛ احتمال مرجع تاریخی (" + fa(Math.round(pr * 100)) + "٪) با دید تحلیلی نمودار" + (oc.fv && oc.fv.ok ? " و تحلیل مالی" : "") + " (" + (tilt >= 0 ? "+" : "−") + fa(Math.abs(tilt * 100).toFixed(0)) + " درصدواحد) به " + fa(Math.round(pAdj * 100)) + "٪ تنظیم و در سقف قیمت استفاده شد.";
      }
    }
    var q = OC.quote(m, inpQ, STATE.st, STATE.an);
    if (q.ok && q.limit !== null && oc && oc.ol && oc.v.d < -0.25 && oc.v.conf >= 0.4) {
      var capV = Math.floor(oc.ol.median);
      q.parts.push({ label: "برای هم‌خوانی با دید تحلیلی نزولی (نمودار" + (oc.fv && oc.fv.ok ? " + مالی" : "") + "): سقف = قیمت مرکزی پیش‌بینی ۱۰ روزه", v: capV });
      if (capV < q.limit) {
        q.limit = capV;
        q.parts.forEach(function (x) { x.bind = Math.abs(x.v - q.limit) < 1e-6; });
        q.gap = q.limit > 0 ? 1 - q.ref / q.limit : null;
        q.levels = q.levels.filter(function (l) { return l.label !== "سقف پیشنهادی"; });
        q.levels.forEach(function (l) { l.good = l.price <= q.limit; });
        q.note.push("دید تحلیلی نزولی است؛ سقف ورود تا قیمت مرکزی پیش‌بینی پایین آمد (معنی‌اش: برای خرید منتظر قیمت پایین‌تر بمان).");
      }
    }
    if (pNote) q.note.push(pNote);
    if (oc && oc.fv && oc.fv.ok && oc.fv.score < 40) q.note.push("بنیاد ضعیف است (امتیاز مالی " + fa(oc.fv.score) + " از ۱۰۰)؛ ریسک افت شدیدتر است، اندازه‌ی معامله را کوچک‌تر بگیر.");
    else if (!(oc && oc.fv && oc.fv.ok)) q.note.push("اطلاعات مالی این سهم ثبت نشده؛ در تب «🏦 مالی» جدول‌ها را بخوان تا در پیشنهاد هم لحاظ شود.");
    var h = '<div class="note">پیشنهاد برای حالت «' + MODE_LABEL[m] + '» است. حالت را از تب‌های بالا عوض کن.</div>';
    h += outlookBlock(10, "🔭 دید تحلیلی (نمودار + مالی) — ۱۰ روز آینده");
    if (q.missing.length) {
      h += '<div class="empty">برای محاسبه این‌ها لازم است: <b>' + esc(q.missing.join("، ")) + '</b><br>«به‌روزرسانی از سایت» را بزن یا در تب «' + MODE_LABEL[m] + '» پرشان کن.</div>';
    } else {
      h += '<div class="sg"><h5>بیشترین قیمت ورود پیشنهادی</h5><div><span class="big">' + esc(fmt(q.limit, "money")) + '</span> ریال</div>';
      if (q.gap !== null) {
        if (q.gap >= 0) h += '<div class="msg ok">✅ آخرین معامله ' + esc(fmt(q.ref, "money")) + ' است و ' + esc(pAbs(q.gap)) + ' پایین‌تر از سقف قرار دارد.</div>';
        else h += '<div class="msg h">❌ آخرین معامله ' + esc(fmt(q.ref, "money")) + ' است و ' + esc(pAbs(q.gap)) + ' بالاتر از سقف است. منتظر اصلاح بمان یا سفارش خرید را در قیمت ≤ سقف بگذار.</div>';
      }
      h += '<div style="margin-top:8px">';
      q.parts.forEach(function (x) { h += '<div class="line' + (x.bind ? " bind" : "") + '"><span>' + (x.bind ? "▶ " : "") + esc(x.label) + '</span><span class="vv">' + esc(fmt(Math.round(x.v), "money")) + '</span></div>'; });
      h += '</div><div class="legend" style="margin:6px 0 0">سقف = کوچک‌ترین مقدار از شرط‌های بالا (▶ یعنی همان شرط تعیین‌کننده است).</div>';
      if (q.zone) {
        var inZone = q.T.px >= q.zone[0] && q.T.px <= q.zone[1];
        h += '<div class="line"><span>منطقه ورود مناسب — ' + esc(q.zoneTxt) + '</span><span class="vv">' + esc(fmt(q.zone[0], "money")) + ' تا ' + esc(fmt(q.zone[1], "money")) + '</span></div>';
        h += '<div class="msg ' + (inZone ? "ok" : "wait") + '">' + (inZone ? "✅ قیمت فعلی داخل منطقه ورود است." : (q.T.px > q.zone[1] ? "⏳ قیمت بالاتر از منطقه ورود است؛ تعقیب نکن، منتظر برگشت بمان." : "⏳ قیمت پایین‌تر از منطقه ورود است؛ ببین چرا از منطقه خارج شده و نشانه برگشت بگیر.")) + '</div>';
      }
      h += '<div class="line"><span>حد ضرر (' + esc(q.targets.stopSrc) + ')</span><span class="vv">' + esc(fmt(q.targets.stop, "money")) + '</span></div>';
      h += '<div class="line"><span>هدف اول (' + esc(q.targets.targetSrc) + ')</span><span class="vv">' + esc(fmt(q.targets.t1, "money")) + '</span></div>';
      if (q.targets.t2) h += '<div class="line"><span>هدف دوم</span><span class="vv">' + esc(fmt(q.targets.t2, "money")) + '</span></div>';
      q.note.forEach(function (t) { h += '<div class="msg w">ℹ ' + esc(t) + '</div>'; });
      h += '</div>';
      if (q.levels.length) {
        h += '<div class="cmp sgt"><table><thead><tr><th class="lab">اگر با این قیمت بخری</th><th>قیمت</th><th>سود/ریسک</th><th>فاصله حد ضرر</th><th>تعداد مجاز</th><th>وضعیت</th></tr></thead><tbody>';
        q.levels.forEach(function (l) {
          h += '<tr><td class="lab">' + esc(l.label) + '</td><td class="v">' + esc(fmt(l.price, "money")) + '</td><td class="v">' + esc(fmt(l.rr, "ratio1")) + '</td><td class="v">' + esc(fmt(l.stopPct, "pct1")) + '</td><td class="v">' + esc(fmt(l.qty, "money")) + '</td>' +
            '<td class="' + (l.good ? "v best" : "v worst") + '">' + (l.good ? "✅ می‌ارزد" : "❌ گران") + '</td></tr>';
        });
        h += '</tbody></table></div>';
      }
      h += '<div class="sg"><h5>این سهم الان به کدام حالت می‌خورد؟</h5>';
      q.fit.forEach(function (f) {
        h += '<div class="line"><span>' + f.sym + " " + esc(MODE_LABEL[f.mode]) + '</span><span style="font-weight:400;color:var(--mut);text-align:left">' + esc(f.first || "تکنیکال این حالت مشکلی ندارد") + '</span></div>';
      });
      h += '<div class="legend" style="margin:6px 0 0">فقط مرحله «تکنیکال» هر حالت بررسی شده است.</div></div>';
    }
    // ---- کدام سهم بهتر است؟
    var cands = (STATE.cmp || []).filter(function (e) { return e.key !== pageKey; });
    cands.push({ key: pageKey, type: m, inp: STATE.inp, an: STATE.an, name: STATE.inp.name_o || "همین صفحه", current: true });
    var list = cands.map(function (e) { return { e: e, r: OC.evaluate(e.type, e.inp, STATE.st, e.an) }; })
      .filter(function (x) { return x.r.R.E !== null && x.r.R.E !== undefined; });
    list.sort(function (a, b) {
      var d = SYM_RANK[a.r.final.sym] - SYM_RANK[b.r.final.sym];
      if (d) return d;
      return (numOk(b.r.score) ? b.r.score : -1) - (numOk(a.r.score) ? a.r.score : -1);
    });
    h += '<div class="sg"><h5>کدام سهم بهتر است؟</h5>';
    if (list.length < 2) h += '<div class="legend">صفحه سهم‌های دیگر را باز کن، اطلاعاتشان را پر کن و «➕ ذخیره برای مقایسه» را بزن؛ اینجا بر اساس نتیجه چک‌لیست و امتیاز تکنیکال رتبه‌بندی می‌شوند.</div>';
    else {
      var best = list[0], bn = best.e.inp.name_o || best.e.name;
      if (best.r.final.sym === "✅") h += '<div class="msg ok">✅ بهترین گزینه: <b>' + esc(bn) + '</b> (' + esc(MODE_LABEL[best.e.type]) + ') با امتیاز تکنیکال ' + esc(fmt(best.r.score, "int")) + '.</div>';
      else h += '<div class="msg w">هیچ‌کدام الان «بخر» نیستند. نزدیک‌ترین: <b>' + esc(bn) + '</b> (' + esc(best.r.final.text) + ').</div>';
      h += '<div class="rk" style="margin:6px 0 0">';
      list.forEach(function (x, i) {
        h += '<div class="it"><span class="no">' + fa(i + 1) + '</span><span class="nm">' + esc(x.e.inp.name_o || x.e.name) + (x.e.current ? " (همین صفحه)" : "") + '</span><span>' + x.r.final.sym + '</span>' +
          '<span class="mt">' + esc(MODE_LABEL[x.e.type]) + ' · امتیاز ' + esc(fmt(x.r.score, "int")) + ' · سود/ریسک ' + esc(fmt(x.r.R.rr, "ratio1")) + '</span></div>';
      });
      h += '</div>';
    }
    h += '<div class="legend" style="margin:6px 0 0">همه پیشنهادها حساب ریاضی بر پایه سابقه قیمت و آستانه‌های خودت هستند، نه پیش‌بینی و نه توصیه سرمایه‌گذاری.</div></div>';
    el.innerHTML = h;
  }


  // ================= تب نمودار =================
  function g2j(gy, gm, gd) {
    var gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334], jy = gy > 1600 ? 979 : 0;
    gy -= gy > 1600 ? 1600 : 621;
    var gy2 = gm > 2 ? gy + 1 : gy;
    var days = 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) - 80 + gd + gdm[gm - 1];
    jy += 33 * Math.floor(days / 12053); days %= 12053;
    jy += 4 * Math.floor(days / 1461); days %= 1461;
    if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
    var jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
    var jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
    return [jy, jm, jd];
  }
  function fmtDate(d) {
    var y = Math.floor(d / 10000), m = Math.floor(d / 100) % 100, dd = d % 100;
    if (y > 1700 && m >= 1 && m <= 12) { var j = g2j(y, m, dd); y = j[0]; m = j[1]; dd = j[2]; }
    return y + "/" + (m < 10 ? "0" : "") + m + "/" + (dd < 10 ? "0" : "") + dd;
  }
  function fnum(x, d) { return (x === null || x === undefined || !isFinite(x)) ? "—" : Number(x).toLocaleString("en-US", { maximumFractionDigits: d === undefined ? 0 : d }); }

  function drawChart(cv, D, cfg, hover) {
    var bars = STATE.an.bars, dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 780;
    var subs = ["rsi", "macd", "stoch", "adx"].filter(function (k) { return cfg[k]; });
    var mainH = 330, subH = 82, H = mainH + subs.length * subH + 20;
    cv.style.height = H + "px"; cv.width = W * dpr; cv.height = H * dpr;
    var ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var cs = getComputedStyle(root.getElementById("panel"));
    var C = { fg: cs.getPropertyValue("--fg").trim() || "#222", mut: cs.getPropertyValue("--mut").trim() || "#777", line: cs.getPropertyValue("--line").trim() || "#ddd", bg: cs.getPropertyValue("--bg").trim() || "#fff", up: "#16a34a", dn: "#dc2626" };
    var nv = Math.min(cfg.n, D.n), i0 = D.n - nv, padL = 6, padR = 62, plotW = W - padL - padR, slot = plotW / nv;
    function X(i) { return padL + (i - i0 + 0.5) * slot; }
    var hi = -Infinity, lo = Infinity, i;
    for (i = i0; i < D.n; i++) { if (bars[i].h > hi) hi = bars[i].h; if (bars[i].l < lo) lo = bars[i].l; }
    if (cfg.bb) for (i = i0; i < D.n; i++) { if (D.series.bbUp[i] > hi) hi = D.series.bbUp[i]; if (D.series.bbLo[i] !== null && D.series.bbLo[i] < lo) lo = D.series.bbLo[i]; }
    var pad = (hi - lo) * 0.06; hi += pad; lo -= pad;
    function Y(p) { return 6 + (mainH - 12) * (1 - (p - lo) / (hi - lo)); }
    ctx.font = "10.5px sans-serif"; ctx.textBaseline = "middle";
    ctx.clearRect(0, 0, W, H);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, mainH); ctx.clip();   // خط‌های خارج از دامنه نمودار اصلی روی زیرنمودارها نیفتند
    // شبکه و برچسب قیمت
    ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.fillStyle = C.mut; ctx.textAlign = "left";
    for (i = 0; i <= 5; i++) { var py = hi - (hi - lo) * i / 5, yy = Y(py); ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke(); ctx.fillText(fnum(py), W - padR + 4, yy); }
    // ناحیه طلایی و فیبوناچی
    var FC = { 0: "#94a3b8", 0.236: "#38bdf8", 0.382: "#22c55e", 0.5: "#eab308", 0.618: "#f97316", 0.786: "#ef4444", 1: "#94a3b8" };
    if (cfg.fib && D.fib) {
      var lv = D.fib.levels, p5 = null, p6 = null;
      lv.forEach(function (l) { if (l.kind === "r" && l.r === 0.5) p5 = l.price; if (l.kind === "r" && l.r === 0.618) p6 = l.price; });
      if (p5 !== null && p6 !== null) { ctx.fillStyle = "rgba(234,179,8,0.13)"; var ya = Y(Math.max(p5, p6)), yb = Y(Math.min(p5, p6)); ctx.fillRect(padL, ya, plotW, yb - ya); }
      lv.forEach(function (l) {
        if (l.price < lo || l.price > hi) return;
        var yy2 = Y(l.price), colr = l.kind === "e" ? "#a855f7" : (FC[l.r] || "#94a3b8");
        ctx.strokeStyle = colr; ctx.setLineDash([5, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, yy2); ctx.lineTo(W - padR, yy2); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = colr; ctx.textAlign = "left"; ctx.fillText((l.kind === "e" ? "×" : "") + (l.r * 100).toFixed(l.r === 0.236 || l.r === 0.382 || l.r === 0.786 || l.kind === "e" ? 1 : 0).replace(".0", "") + "%", padL + 4, yy2 - 6);
      });
      var lg = D.fib.leg;
      if (lg.si >= i0 || lg.ei >= i0) { ctx.strokeStyle = "rgba(100,116,139,.8)"; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(X(Math.max(lg.si, i0)), Y(lg.sp)); ctx.lineTo(X(Math.max(lg.ei, i0)), Y(lg.ep)); ctx.stroke(); ctx.setLineDash([]); }
    }
    // حمایت و مقاومت
    if (cfg.sr && D.sr) {
      D.sr.res.forEach(function (p) { if (p < lo || p > hi) return; ctx.strokeStyle = "rgba(220,38,38,.55)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, Y(p)); ctx.lineTo(W - padR, Y(p)); ctx.stroke(); ctx.fillStyle = "#dc2626"; ctx.textAlign = "right"; ctx.fillText("مقاومت", W - padR - 4, Y(p) - 6); });
      D.sr.sup.forEach(function (p) { if (p < lo || p > hi) return; ctx.strokeStyle = "rgba(22,163,74,.55)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, Y(p)); ctx.lineTo(W - padR, Y(p)); ctx.stroke(); ctx.fillStyle = "#16a34a"; ctx.textAlign = "right"; ctx.fillText("حمایت", W - padR - 4, Y(p) + 8); });
    }
    function line(arr, color, w, dash) {
      ctx.strokeStyle = color; ctx.lineWidth = w; if (dash) ctx.setLineDash(dash); ctx.beginPath(); var st = false;
      for (var k = i0; k < D.n; k++) { if (arr[k] === null || arr[k] === undefined) { st = false; continue; } if (!st) { ctx.moveTo(X(k), Y(arr[k])); st = true; } else ctx.lineTo(X(k), Y(arr[k])); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    if (cfg.bb) { line(D.series.bbUp, "rgba(100,116,139,.8)", 1); line(D.series.bbLo, "rgba(100,116,139,.8)", 1); line(D.series.bbMid, "rgba(100,116,139,.5)", 1, [3, 3]); }
    // شمع‌ها
    var bw = Math.max(1, slot * 0.66);
    for (i = i0; i < D.n; i++) {
      var b = bars[i], up = b.c >= b.o, x = X(i);
      ctx.strokeStyle = up ? C.up : C.dn; ctx.fillStyle = up ? C.up : C.dn; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, Y(b.h)); ctx.lineTo(x, Y(b.l)); ctx.stroke();
      var yo = Y(b.o), yc = Y(b.c); ctx.fillRect(x - bw / 2, Math.min(yo, yc), bw, Math.max(1, Math.abs(yo - yc)));
    }
    if (cfg.sma) { line(D.series.sma20, "#3b82f6", 1.4); line(D.series.sma50, "#f59e0b", 1.4); line(D.series.sma200, "#a855f7", 1.4); }
    // قیمت فعلی
    var yl = Y(D.px); ctx.strokeStyle = C.fg; ctx.globalAlpha = 0.45; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(padL, yl); ctx.lineTo(W - padR, yl); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.fillStyle = C.fg; ctx.fillRect(W - padR, yl - 8, padR - 2, 16); ctx.fillStyle = C.bg; ctx.textAlign = "left"; ctx.fillText(fnum(D.px), W - padR + 3, yl);
    ctx.restore();
    // زیرنمودارها
    var top = mainH;
    function sub(title, series, o) {
      ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.strokeRect(padL, top + 2, plotW, subH - 6);
      var smin = o.min, smax = o.max;
      if (smin === undefined) { smin = Infinity; smax = -Infinity; series.forEach(function (sr) { for (var k = i0; k < D.n; k++) if (sr.a[k] !== null && sr.a[k] !== undefined) { if (sr.a[k] < smin) smin = sr.a[k]; if (sr.a[k] > smax) smax = sr.a[k]; } }); var pp = (smax - smin) * 0.1 || 1; smin -= pp; smax += pp; }
      function SY(v) { return top + 4 + (subH - 10) * (1 - (v - smin) / (smax - smin)); }
      (o.lines || []).forEach(function (lv2) { ctx.strokeStyle = C.mut; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(padL, SY(lv2)); ctx.lineTo(W - padR, SY(lv2)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = C.mut; ctx.textAlign = "left"; ctx.fillText(lv2, W - padR + 4, SY(lv2)); });
      series.forEach(function (sr) {
        if (sr.bars) { for (var k = i0; k < D.n; k++) { if (sr.a[k] === null) continue; ctx.fillStyle = sr.a[k] >= 0 ? "rgba(22,163,74,.6)" : "rgba(220,38,38,.6)"; var y0 = SY(0), y1 = SY(sr.a[k]); ctx.fillRect(X(k) - bw / 2, Math.min(y0, y1), bw, Math.max(1, Math.abs(y1 - y0))); } return; }
        ctx.strokeStyle = sr.c; ctx.lineWidth = 1.3; ctx.beginPath(); var st2 = false;
        for (var k2 = i0; k2 < D.n; k2++) { if (sr.a[k2] === null) { st2 = false; continue; } if (!st2) { ctx.moveTo(X(k2), SY(sr.a[k2])); st2 = true; } else ctx.lineTo(X(k2), SY(sr.a[k2])); }
        ctx.stroke();
      });
      ctx.fillStyle = C.fg; ctx.textAlign = "left"; ctx.fillText(title, padL + 6, top + 12);
      top += subH;
    }
    var Sx = D.series;
    subs.forEach(function (k) {
      if (k === "rsi") sub("RSI (۱۴)", [{ a: Sx.rsi, c: "#8b5cf6" }], { min: 0, max: 100, lines: [30, 70] });
      if (k === "macd") sub("MACD", [{ a: Sx.macdHist, bars: 1 }, { a: Sx.macdLine, c: "#3b82f6" }, { a: Sx.macdSig, c: "#f59e0b" }], {});
      if (k === "stoch") sub("استوکاستیک (۱۴،۳،۳)", [{ a: Sx.stK, c: "#06b6d4" }, { a: Sx.stD, c: "#f97316" }], { min: 0, max: 100, lines: [20, 80] });
      if (k === "adx") sub("ADX و DI (۱۴)", [{ a: Sx.adx, c: C.fg }, { a: Sx.pdi, c: C.up }, { a: Sx.mdi, c: C.dn }], { min: 0, max: 60, lines: [20, 40] });
    });
    // تاریخ‌ها
    ctx.fillStyle = C.mut; ctx.textAlign = "center";
    for (i = 0; i <= 4; i++) { var ix = i0 + Math.round((nv - 1) * i / 4); ctx.fillText(fmtDate(bars[ix].d), Math.min(Math.max(X(ix), 36), W - padR - 30), H - 8); }
    if (hover !== undefined && hover >= i0 && hover < D.n) {
      ctx.strokeStyle = C.fg; ctx.globalAlpha = 0.4; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(hover), 4); ctx.lineTo(X(hover), H - 18); ctx.stroke(); ctx.globalAlpha = 1;
    }
    cv._geo = { padL: padL, slot: slot, i0: i0, n: D.n };
  }
  function renderChartBody() {
    var el = root.getElementById("chartbody");
    if (!el) return;
    var cfg = STATE.chartCfg;
    if (!STATE.an || !STATE.an.bars || STATE.an.bars.length < 60) {
      el.innerHTML = '<div class="empty">سابقه قیمت سهم خوانده نشده است.<br>«به‌روزرسانی از سایت» را بزن (یا مطمئن شو صفحه یک سهم است).</div>';
      return;
    }
    var D = OC.chartData(STATE.an, num0(STATE.inp.S), cfg.h, STATE.st);
    if (!D) { el.innerHTML = '<div class="empty">برای تحلیل نمودار حداقل ۶۰ روز سابقه لازم است.</div>'; return; }
    function chip(attr, key, label, on) { return '<button class="chip' + (on ? " on" : "") + '" data-' + attr + '="' + key + '">' + label + '</button>'; }
    var h = '<div class="chips"><span class="lb">بازه:</span>' + [60, 120, 250].map(function (n) { return chip("cn", n, fa(n) + " روز", cfg.n === n); }).join("") +
      '<span class="lb" style="margin-inline-start:8px">لایه‌ها:</span>' + [["fib", "فیبوناچی"], ["sma", "میانگین‌ها"], ["bb", "بولینگر"], ["sr", "حمایت/مقاومت"]].map(function (x) { return chip("cf", x[0], x[1], cfg[x[0]]); }).join("") + '</div>' +
      '<div class="chips"><span class="lb">زیرنمودار:</span>' + [["rsi", "RSI"], ["macd", "MACD"], ["stoch", "استوکاستیک"], ["adx", "ADX"]].map(function (x) { return chip("cf", x[0], x[1], cfg[x[0]]); }).join("") + '</div>' +
      '<div class="cvinfo" id="cvinfo">&nbsp;</div><div class="cvwrap"><canvas id="cv"></canvas></div>';
    // ---- احتمال جهت
    var P = D.prob, hh = cfg.h;
    h += '<div class="sg"><h5>احتمال جهت در ' + fa(hh) + ' روز معاملاتی آینده</h5><div class="chips" style="margin:0 0 6px">' + [5, 10, 20].map(function (n) { return chip("ch", n, fa(n) + " روز", hh === n); }).join("") + '</div>';
    if (P.p !== undefined) {
      var mid = P.p * 100, l = P.lo * 100, u = P.hi * 100;
      h += '<div class="pbig"><span class="pv">' + fa(mid.toFixed(0)) + '٪ صعود</span><span style="color:var(--mut)">بازه اطمینان ' + fa(l.toFixed(0)) + '٪ تا ' + fa(u.toFixed(0)) + '٪</span></div>' +
        '<div class="pbar"><b style="left:' + l + '%;width:' + Math.max(1, u - l) + '%"></b><i style="left:calc(' + mid + '% - 1px)"></i></div>' +
        '<div class="msg ' + (/معنادار\)$/.test(P.verdict) ? (/صعود/.test(P.verdict) ? "ok" : "h") : "wait") + '"><b>' + esc(P.verdict) + '</b></div>' +
        '<div class="legend" style="margin:6px 0 0">میانگین ' + fa(P.used) + ' سیگنال با نمونه کافی؛ نرخ پایه‌ی صعود در سابقه‌ی همین سهم ' + (P.base !== null ? fa((P.base * 100).toFixed(0)) + '٪' : "—") + '. اگر بازه‌ی اطمینان ۵۰٪ را شامل شود، برتری آماری وجود ندارد.</div>';
    } else h += '<div class="msg wait">' + esc(P.verdict) + '</div>';
    h += '<div class="line"><span>دامنه محتمل قیمت (۶۸٪ احتمال)</span><span class="vv">' + fnum(D.range.low68) + ' تا ' + fnum(D.range.high68) + '</span></div>' +
      '<div class="line"><span>دامنه محتمل قیمت (۹۵٪ احتمال)</span><span class="vv">' + fnum(D.range.low95) + ' تا ' + fnum(D.range.high95) + '</span></div>';
    if (D.divergence) h += '<div class="msg ' + (/مثبت/.test(D.divergence) ? "ok" : "h") + '">' + esc(D.divergence) + '</div>';
    h += '</div>';
    // ---- جدول سیگنال‌ها
    h += '<div class="cmp sgt"><table><thead><tr><th class="lab">سیگنال</th><th>مقدار فعلی</th><th>حالت</th><th>نمونه</th><th>صعود تاریخی</th><th>بازده میانگین</th></tr></thead><tbody>';
    D.signals.forEach(function (sg) {
      var st = sg.stat, low = !st || st.n < 8;
      h += '<tr style="' + (low ? "opacity:.55" : "") + '"><td class="lab">' + esc(sg.name) + '</td><td class="v">' + esc(sg.val) + '</td><td>' + esc(st ? st.state : "—") + '</td><td class="v">' + (st ? fa(st.n) + (low ? " (کم)" : "") : "—") + '</td>' +
        '<td class="v ' + (st && !low && st.p > (st.base || 0.5) + 0.08 ? "best" : st && !low && st.p < (st.base || 0.5) - 0.08 ? "worst" : "") + '">' + (st && st.p !== undefined ? fa((st.p * 100).toFixed(0)) + '٪' : "—") + '</td>' +
        '<td class="v">' + (st && st.avgRet !== undefined ? fa((st.avgRet * 100).toFixed(1)) + '٪' : "—") + '</td></tr>';
    });
    h += '</tbody></table></div>';
    // ---- فیبوناچی
    if (D.fib) {
      var lg = D.fib.leg;
      h += '<div class="sg"><h5>فیبوناچی — آخرین سوینگ ' + (lg.up ? "صعودی" : "نزولی") + (lg.prov ? " (هنوز در جریان)" : "") + ': ' + fnum(lg.sp) + ' ← ' + fnum(lg.ep) + '</h5>';
      if (D.fib.retrPos !== null) h += '<div class="msg ' + (D.fib.golden ? "ok" : "wait") + '">قیمت فعلی ' + fa((D.fib.retrPos * 100).toFixed(0)) + '٪ از این سوینگ را برگردانده است' + (D.fib.golden ? " — داخل ناحیه‌ی طلایی (۵۰ تا ۶۲٫۸٪)" : "") + '.</div>';
      h += '<div class="cmp sgt" style="margin:6px 0 0"><table><thead><tr><th class="lab">سطح</th><th>قیمت</th><th>فاصله از قیمت</th><th>احتمال لمس تا ' + fa(hh) + ' روز</th></tr></thead><tbody>';
      D.fib.levels.slice().sort(function (a, b) { return b.price - a.price; }).forEach(function (lv) {
        var near = Math.abs(lv.price / D.px - 1) < 0.01;
        h += '<tr' + (near ? ' style="font-weight:700"' : '') + '><td class="lab">' + (lv.kind === "e" ? "گسترش " + lv.r : "بازگشت " + fa((lv.r * 100).toFixed(1).replace(".0", "")) + "٪") + '</td><td class="v">' + fnum(lv.price) + '</td><td class="v">' + fa(((lv.price / D.px - 1) * 100).toFixed(1)) + '٪</td><td class="v">' + (lv.pTouch !== null ? fa((lv.pTouch * 100).toFixed(0)) + '٪' : "—") + '</td></tr>';
      });
      h += '</tbody></table></div>';
      if (D.sr) {
        h += '<div class="legend" style="margin:6px 0 0">احتمال لمس حمایت/مقاومت‌ها تا ' + fa(hh) + ' روز: ' +
          D.sr.res.map(function (p, k) { return "مقاومت " + fnum(p) + " ← " + fa((D.sr.resP[k] * 100).toFixed(0)) + "٪"; }).concat(D.sr.sup.map(function (p, k) { return "حمایت " + fnum(p) + " ← " + fa((D.sr.supP[k] * 100).toFixed(0)) + "٪"; })).join(" · ") + '</div>';
      }
      h += '</div>';
    }
    h += outlookBlock(hh, "🔭 جمع‌بندی: نماد احتمالاً چطور می‌رود؟ (" + fa(hh) + " روز آینده)");
    h += '<div class="legend" style="margin:0 12px 8px">احتمال‌ها از شمارش در سابقه‌ی خود سهم (آمار شرطی با انقباض به ۵۰٪ و کاهش نمونه‌ی مؤثر به‌خاطر هم‌پوشانی) و مدل نوسان (احتمال لمس سطح، بدون فرض روند) به‌دست آمده‌اند. سابقه فقط یک سال است، پس عددها نامطمئن‌اند؛ پیش‌بینی یا توصیه‌ی سرمایه‌گذاری نیستند.</div>';
    el.innerHTML = h;
    var cv = root.getElementById("cv");
    drawChart(cv, D, cfg);
    var info = root.getElementById("cvinfo");
    cv.onmousemove = function (e) {
      var g = cv._geo, r = cv.getBoundingClientRect(), x = e.clientX - r.left;
      var idx = Math.min(g.n - 1, Math.max(g.i0, g.i0 + Math.floor((x - g.padL) / g.slot)));
      var b = STATE.an.bars[idx], S2 = D.series;
      info.textContent = fmtDate(b.d) + "  O " + fnum(b.o) + "  H " + fnum(b.h) + "  L " + fnum(b.l) + "  C " + fnum(b.c) + "  V " + fnum(b.v) + "  RSI " + fnum(S2.rsi[idx], 0) + "  MACD " + fnum(S2.macdHist[idx], 1) + "  %K " + fnum(S2.stK[idx], 0);
      drawChart(cv, D, cfg, idx);
    };
    cv.onmouseleave = function () { drawChart(cv, D, cfg); info.innerHTML = "&nbsp;"; };
    el.onclick = function (e) {
      var b = e.target.closest && e.target.closest(".chip");
      if (!b) return;
      if (b.dataset.cn) cfg.n = Number(b.dataset.cn);
      else if (b.dataset.ch) cfg.h = Number(b.dataset.ch);
      else if (b.dataset.cf) cfg[b.dataset.cf] = cfg[b.dataset.cf] ? 0 : 1;
      renderChartBody();
    };
  }


  // ---- جدول‌های مالی خوانده‌شده مستقیم از صفحه‌ی سایت
  var KIND_LABEL = { bs: "ترازنامه", is: "سود و زیان", cf: "جریان وجوه نقد" };
  function dateOf(h) { var m = String(h || "").match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; }
  function mBetween(a, b) { return (b.y - a.y) * 12 + (b.m - a.m); }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  var FLOW = { rev: 1, cogs: 1, opinc: 1, int: 1, ni: 1, cfo: 1 };
  function mapCol(t, j) {
    var o = {};
    (t.rows || []).forEach(function (row) {
      var v = row.v ? row.v[j] : null;
      if (v === null || v === undefined) return;
      var lab = normLabel(row.l);
      if (o.eps === undefined && /^سودزیان(خالص|پایه)?هرسهم/.test(lab)) o.eps = v;
      Object.keys(FIN_PAT).forEach(function (k) {
        if (o[k] !== undefined) return;
        if (!FIN_PAT[k].some(function (re) { return re.test(lab); })) return;
        o[k] = (k === "cogs" || k === "int") ? Math.abs(v) : v;
      });
    });
    return o;
  }
  // ستون اول = جاری، ستون دوم = مقایسه‌ای. دوره‌ی میان‌دوره‌ای: TTM (سال مالی قبل + جاری − مشابه سال قبل) و اگر ممکن نبود ×۱۲/ماه
  function mapTable(t) {
    var c0 = mapCol(t, 0), c1 = mapCol(t, 1), out = { y0: {}, y1: {}, method: "annual" };
    if (c0.eps !== undefined) out.eps = c0.eps;
    var interim = t.months && t.months > 0 && t.months < 12 && (t.kind === "is" || t.kind === "cf");
    var d0 = dateOf(t.cols && t.cols[0]) || dateOf(t.end), d1 = dateOf(t.cols && t.cols[1]), d2 = dateOf(t.cols && t.cols[2]);
    var ttm = interim && t.cols.length >= 3 && d0 && d1 && d2 && mBetween(d1, d0) === 12 && mBetween(d2, d0) === t.months;
    var c2 = ttm ? mapCol(t, 2) : null;
    var mult = (interim && !ttm) ? 12 / t.months : 1;
    if (interim) out.method = ttm ? "ttm" : "x" + (12 / t.months);
    Object.keys(c0).forEach(function (k) {
      if (k === "eps") return;
      if (!FLOW[k]) { out.y0[k] = c0[k]; if (c1[k] !== undefined) out.y1[k] = c1[k]; return; }
      if (ttm && c2[k] !== undefined && c1[k] !== undefined) { out.y0[k] = c2[k] + c0[k] - c1[k]; out.y1[k] = c2[k]; return; }
      out.y0[k] = c0[k] * mult; if (c1[k] !== undefined) out.y1[k] = c1[k] * mult;
    });
    if (t.kind === "is" && t.extra && t.extra.divApproved > 0 && out.y0.cap > 0 && out.y0.dps === undefined) out.y0.dps = Math.round(t.extra.divApproved / out.y0.cap * 1000);
    return out;
  }
  // هر ستون تاریخ‌دار جدول (جاری و مقایسه‌ای‌ها) به‌عنوان یک دوره در تاریخچه ذخیره می‌شود
  function addHist(f, t) {
    f.hist = f.hist || {};
    var d0 = dateOf(t.cols && t.cols[0]) || dateOf(t.end);
    if (!d0) return;
    (t.cols || []).forEach(function (h, j) {
      var d = j === 0 ? d0 : dateOf(h);
      if (!d) return;
      var months = 0;
      if (t.kind !== "bs") {
        if (j === 0) months = t.months || 12;
        else if (t.months === 12) months = 12;
        else if (d.m === d0.m) months = t.months;
        else if (mBetween(d, d0) === t.months) months = 12;
        else return;
      }
      var vals = mapCol(t, j);
      if (Object.keys(vals).length < 2) return;
      var end = d.y + "/" + pad2(d.m) + "/" + pad2(d.d), key = t.kind + "|" + end + "|" + months;
      if (f.hist[key] && f.hist[key].direct && j !== 0) return;
      f.hist[key] = { kind: t.kind, end: end, months: months, vals: vals, direct: j === 0 };
    });
    var ks = Object.keys(f.hist);
    if (ks.length > 80) ks.sort(function (a, b) { return (f.hist[a].direct ? 1 : 0) - (f.hist[b].direct ? 1 : 0) || f.hist[a].end.localeCompare(f.hist[b].end); }).slice(0, ks.length - 80).forEach(function (k) { delete f.hist[k]; });
  }
  function growth(a, b) { return (a === undefined || b === undefined || a === null || b === null || !(b > 0)) ? null : (a / b - 1) * 100; }
  function pctTxt(v) { return v === null ? "—" : (v > 0 ? "+" : "") + Math.round(v) + "٪"; }
  function trendHtml(f) {
    var H = Object.keys(f.hist || {}).map(function (k) { return f.hist[k]; });
    var IS = H.filter(function (h) { return h.kind === "is"; }).sort(function (a, b) { return b.end.localeCompare(a.end) || b.months - a.months; });
    var BS = H.filter(function (h) { return h.kind === "bs"; }).sort(function (a, b) { return b.end.localeCompare(a.end); });
    if (IS.length < 2 && BS.length < 2) return "";
    function prior(h) { var d = dateOf(h.end); return IS.filter(function (x) { var e = dateOf(x.end); return x.months === h.months && e && e.y === d.y - 1 && e.m === d.m; })[0]; }
    var lab = function (h) { return esc(h.end) + (h.months ? " (" + fa(h.months) + "ماهه)" : ""); };
    var h = '<div class="sg"><h5>📈 روند دوره‌ها (از ستون‌های مقایسه‌ای هم ساخته می‌شود)</h5>';
    if (IS.length) {
      h += '<div class="cmp"><table><thead><tr><th class="lab">دوره</th><th>درآمد</th><th>سود عملیاتی</th><th>سود خالص</th><th>رشد درآمد</th><th>رشد سود</th></tr></thead><tbody>';
      IS.slice(0, 10).forEach(function (x) {
        var pr = prior(x);
        h += '<tr><td class="lab">' + lab(x) + '</td><td class="v">' + numFmt(x.vals.rev) + '</td><td class="v">' + numFmt(x.vals.opinc) + '</td><td class="v">' + numFmt(x.vals.ni) + '</td><td class="v">' + pctTxt(pr ? growth(x.vals.rev, pr.vals.rev) : null) + '</td><td class="v">' + pctTxt(pr ? growth(x.vals.ni, pr.vals.ni) : null) + '</td></tr>';
      });
      h += '</tbody></table></div><div class="legend">رشد = نسبت به همان دوره‌ی سال قبل (در صورت موجود بودن).</div>';
    }
    if (BS.length) {
      h += '<div class="cmp"><table><thead><tr><th class="lab">تاریخ ترازنامه</th><th>جمع دارایی‌ها</th><th>جمع بدهی‌ها</th><th>حقوق صاحبان سهام</th></tr></thead><tbody>';
      BS.slice(0, 8).forEach(function (x) { h += '<tr><td class="lab">' + esc(x.end) + '</td><td class="v">' + numFmt(x.vals.ta) + '</td><td class="v">' + numFmt(x.vals.tl) + '</td><td class="v">' + numFmt(x.vals.eq) + '</td></tr>'; });
      h += '</tbody></table></div>';
    }
    return h + '</div>';
  }
  function applyTables(f, tbs, force) {
    f.manual = f.manual || {};
    var n = 0;
    tbs.forEach(function (t) {
      var m = mapTable(t);
      if (m.eps !== undefined) f.epsTbl = m.eps;
      Object.keys(m.y0).forEach(function (k) {
        if (!force && f.manual[k]) return;
        f.y0[k] = m.y0[k];
        if (m.y1[k] !== undefined) f.y1[k] = m.y1[k]; else delete f.y1[k];
        if (force) delete f.manual[k];
        n++;
      });
    });
    return n;
  }
  function sortedTables(f) {
    return Object.keys(f.tables || {}).map(function (k) { return f.tables[k]; })
      .sort(function (a, b) { return String(b.end || "").localeCompare(String(a.end || "")) || String(a.kind).localeCompare(String(b.kind)) || (/نشده/.test(a.audit || "") ? 1 : 0) - (/نشده/.test(b.audit || "") ? 1 : 0) || (b.months || 0) - (a.months || 0); });
  }
  function entityList(f) {
    var m = {};
    sortedTables(f).forEach(function (t) {
      var e = t.ent || "";
      if (!m[e]) m[e] = { ent: e, core: t.core || "", bs: 0, is: 0, end: "" };
      if ((t.end || "") > m[e].end) m[e].end = t.end || "";
    });
    var L = Object.keys(m).map(function (k) { return m[k]; });
    L.forEach(function (x) {   // وجود هر نوع جدول در کل منابع هم‌هسته
      sortedTables(f).forEach(function (t) { if ((t.core || "") === x.core) { if (t.kind === "bs") x.bs++; if (t.kind === "is") x.is++; } });
    });
    return L;
  }
  function pickEntity(f) {
    var L = entityList(f);
    if (!L.length) return "";
    if (f.entity !== undefined && f.entity !== "" && L.some(function (x) { return x.ent === f.entity; })) return f.entity;
    L.forEach(function (x) { x.sc = (x.bs ? 2 : 0) + (x.is ? 2 : 0) + (/تلفیقی/.test(x.ent) ? 1.5 : 0); });
    L.sort(function (a, b) { return b.sc - a.sc || String(b.end).localeCompare(String(a.end)); });
    return L[0].ent;
  }
  function pickTables(f) {
    var S = f.slots || {};
    return { ent: "", warn: [], bs: S.bs || null, is: S.is || null, cf: S.cf || null };
  }
  function autoApplyFin(f) {
    var pk = pickTables(f), list = [pk.bs, pk.is, pk.cf].filter(Boolean);
    f.manual = f.manual || {};
    if (f.srcEnt !== pk.ent) {     // منبع (شرکت/تلفیقی) عوض شد: اعداد خودکار قبلی پاک شوند تا قاطی نشوند
      ["y0", "y1"].forEach(function (y) { Object.keys(f[y]).forEach(function (k) { if (!f.manual[k]) delete f[y][k]; }); });
      delete f.epsTbl; f.srcEnt = pk.ent;
    }
    if (list.length) applyTables(f, list, false);
    f.src = { bs: pk.bs ? pk.bs.key : null, is: pk.is ? pk.is.key : null, cf: pk.cf ? pk.cf.key : null };
  }
  function ttmNote(pk) {
    var t = pk.is || pk.cf; if (!t) return "";
    var m = mapTable(t).method;
    if (m === "ttm") return '<br>ℹ سود و زیان ۱۲ ماهه‌ی منتهی به ' + esc(t.end || "") + ' محاسبه شد: سال مالی قبل + دوره‌ی جاری − همان دوره‌ی سال قبل (TTM).';
    return '<br>⚠ ستون سال مالی قبل در جدول نبود؛ سود و زیان میان‌دوره‌ای به‌صورت سالانه (×' + fa(+(12 / t.months).toFixed(2)) + ') برآورد شد و فصلی بودن سود را نمی‌بیند.';
  }
  function sourceHtml(f) {
    var pk = pickTables(f), parts = [], ann = false;
    var EL = entityList(f), entSel = "";
    if (EL.length > 1) {
      entSel = '<div class="f1"><label>منبع صورت‌های مالی (چند شرکت/تلفیقی روی صفحه هست)</label><select id="finent"><option value="">خودکار</option>' +
        EL.map(function (x) { return '<option value="' + esc(x.ent) + '"' + (f.entity === x.ent ? " selected" : "") + '>' + esc(x.ent || "(بدون نام)") + '</option>'; }).join("") + '</select></div>';
    }
    ["bs", "is", "cf"].forEach(function (k) {
      var t = pk[k]; if (!t) return;
      var i = t.months && t.months < 12 && k !== "bs";
      if (i) ann = true;
      parts.push(esc(KIND_LABEL[k]) + " " + esc(t.end || "") + (i ? " (" + fa(t.months) + " ماهه)" : ""));
    });
    var need = { rev: "is", cogs: "is", opinc: "is", int: "is", ni: "is", ta: "bs", ca: "bs", cl: "bs", tl: "bs", eq: "bs", re: "bs", cfo: "cf", rec: "bs", cap: "is", dps: "is" };
    var miss = OC.FIN_KEYS.filter(function (k) { return f.y0[k[0]] === undefined; });
    var cov = "";
    if (parts.length && miss.length) {
      var missTabs = {}; miss.forEach(function (k) { missTabs[need[k[0]] || "?"] = 1; });
      var noTab = [];
      if (missTabs.bs && !pk.bs) noTab.push("ترازنامه"); if (missTabs.is && !pk.is) noTab.push("سود و زیان"); if (missTabs.cf && !pk.cf) noTab.push("جریان وجوه نقد");
      cov = '<div class="msg w">⚠ ' + fa(miss.length) + ' ردیف خالی: ' + esc(miss.map(function (k) { return k[1]; }).join("، ")) + '.' +
        (noTab.length ? '<br>برای پر شدن، این تب‌ها را روی سایت باز کن: <b>' + esc(noTab.join("، ")) + '</b>' : '<br>جدول‌ها خوانده شده‌اند ولی برچسب این ردیف‌ها روی سایت با الگوهای افزونه نمی‌خواند؛ «کپی گزارش جدول‌ها» را بزن و برایم بفرست.') + '</div>';
    }
    if (pk.warn && pk.warn.length) cov += '<div class="msg w">' + esc(pk.warn.join(" — ")) + '</div>';
    if (!parts.length) return '<div class="note">هنوز جدولی نیامده. صورت مالی خودکار از کدال گرفته می‌شود — وضعیت: ' + esc(CDL.finMsg || CDL.err || (CDL.loading ? 'در حال دریافت فهرست از کدال…' : 'منتظر شروع…')) + ' (برای تلاش دوباره تب «کدال» را باز کن و «به‌روزرسانی» را بزن). نیازی به وارد کردن دستی یا اکسل نیست.</div>';
    return '<div class="note">تحلیل خودکار از جدول‌های خوانده‌شده' + (pk.ent ? ' (منبع: <b>' + esc(pk.ent) + '</b>)' : '') + ': <b>' + parts.join(" + ") + '</b>' + (ann ? ttmNote(pk) : '') + '<br>ستون اول هر جدول = دوره‌ی جاری، ستون دوم = دوره‌ی مقایسه‌ای.</div>' + cov + entSel;
  }
  function numFmt(v) { return v === null || v === undefined ? "—" : (v < 0 ? "-" : "") + Math.abs(Math.round(v)).toLocaleString("en-US"); }
  var SLOT_TAB = { bs: "ترازنامه", is: "سود و زیان", cf: "جریان وجوه نقد" };
  function scrapedHtml(f) {
    var S = f.slots || {};
    var h = "";
    ["bs", "is", "cf"].forEach(function (kind) {
      var t = S[kind];
      h += '<div class="sg"><h5>' + (t ? "✅ " : "⏳ ") + esc(KIND_LABEL[kind]) + (kind === "cf" ? " (اختیاری)" : "") + (t ? ' — ' + esc(t.end || "") + (t.months ? " — " + fa(t.months) + " ماهه" : "") + (t.audit ? " — " + esc(t.audit) : "") + (t.src === "codal" ? " — منبع: کدال" : " — منبع: TSETMC") : "") + '</h5>';
      if (!t) { h += '<div class="legend">«' + esc(SLOT_TAB[kind]) + '» هنوز از کدال نیامده؛ بعد از دریافت اکسل صورت مالی خودکار پر می‌شود.</div></div>'; return; }
      if (t.months && t.months < 12 && kind !== "bs") h += '<div class="msg w">' + (mapTable(t).method === "ttm" ? 'ℹ دوره میان‌دوره‌ای؛ برای تحلیل به ۱۲ ماه TTM تبدیل می‌شود.' : '⚠ دوره میان‌دوره‌ای؛ سالانه‌سازی ×' + fa(+(12 / t.months).toFixed(2))) + '</div>';
      h += '<details style="margin:4px 0" data-dk="s:' + kind + '"' + (OPEN_D["s:" + kind] ? ' open' : '') + '><summary>نمایش جدول (' + fa(t.rows.length) + ' ردیف)' + (t.ent ? ' — ' + esc(t.ent) : '') + '</summary>';
      h += '<div class="cmp"><table><thead><tr><th class="lab">شرح</th>' + t.cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join("") + '<th>درصد تغییر</th></tr></thead><tbody>';
      t.rows.forEach(function (r) {
        h += '<tr><td class="lab">' + esc(r.l) + '</td>' + r.v.map(function (v) { return '<td class="v">' + numFmt(v) + '</td>'; }).join("") + '<td class="v">' + (r.ch === null || r.ch === undefined ? "—" : numFmt(r.ch)) + '</td></tr>';
      });
      h += '</tbody></table></div><div class="fset"><button class="btn" data-clr="' + kind + '">پاک کردن این بخش</button></div></details></div>';
    });
    return h + (CDL.finMsg ? '<div class="legend">' + esc(CDL.finMsg) + '</div>' : '') + '<div class="fset"><button class="usep" id="cdlfin">📥 دریافت آخرین صورت مالی از کدال</button><button class="btn" id="findiag">📋 کپی گزارش جدول‌ها (برای عیب‌یابی)</button></div>';
  }
  function bindScraped(el, f) {
    var cf = el.querySelector("#cdlfin");
    if (cf) cf.onclick = function () {
      cdlEnsure(true, function () {
        var L = cdlFinLetters();
        if (!L.length) { CDL.finMsg = CDL.err || "صورت مالی دارای اکسل در کدال پیدا نشد."; renderFinBody(); return; }
        cdlReadFin(L[0]);
      });
    };
    var dg = el.querySelector("#findiag");
    if (dg) dg.onclick = function () {
      var txt = ["bs", "is", "cf"].map(function (k) { var t = (f.slots || {})[k]; return t ? [k, t.ent, t.end, t.months, t.audit, t.rows.length + " rows", t.cols.join(" ; "), t.rows.slice(0, 4).map(function (r) { return r.l; }).join(" / ")].join(" | ") : k + " | —"; }).join("\n");
      try { navigator.clipboard.writeText(txt).then(function () { alert("کپی شد."); }, function () { prompt("کپی کن:", txt); }); } catch (e) { prompt("کپی کن:", txt); }
    };
    el.querySelectorAll("[data-clr]").forEach(function (b) {
      b.onclick = function () { if (confirm("این بخش پاک شود؟ (با باز کردن دوباره‌ی تب روی سایت دوباره خوانده می‌شود)")) { f.slots[b.dataset.clr] = null; delete f.srcEnt; persistFin(); renderFinBody(); } };
    });
  }
  function handleFin(p, tries) {
    if (window.top !== window) return;
    if (!symLoaded) { if ((tries || 0) < 20) setTimeout(function () { handleFin(p, (tries || 0) + 1); }, 500); return; }
    var f = STATE.fin; f.slots = f.slots || { bs: null, is: null, cf: null }; f.manual = f.manual || {};
    var changed = false;
    ["bs", "is", "cf"].forEach(function (kind) {
      var c = (p.tables || []).filter(function (t) { return t.kind === kind; });
      if (!c.length) return;
      c.sort(function (a, b) {   // جدیدترین دوره، بعد تلفیقی، بعد حسابرسی‌شده، بعد جدول کامل‌تر
        return String(b.end || "").localeCompare(String(a.end || "")) ||
          (/تلفیقی/.test((b.ent || "") + (b.title || "")) ? 1 : 0) - (/تلفیقی/.test((a.ent || "") + (a.title || "")) ? 1 : 0) ||
          (b.src === "codal" ? 1 : 0) - (a.src === "codal" ? 1 : 0) ||
          (/نشده/.test(a.audit || "") ? 1 : 0) - (/نشده/.test(b.audit || "") ? 1 : 0) || b.rows.length - a.rows.length;
      });
      var t = c[0], o = f.slots[kind];
      if (o && o.src === "codal" && t.src !== "codal" && String(o.end || "") === String(t.end || "")) return;   // جدول کدال کامل‌تر است؛ با TSETMC عوض نشود
      if (!o || JSON.stringify([o.cols, o.rows, o.end]) !== JSON.stringify([t.cols, t.rows, t.end])) { f.slots[kind] = t; changed = true; addHist(f, t); }
    });
    if (!changed) return;
    delete f.srcEnt;
    autoApplyFin(f); persistFin();
    var ae = root.activeElement;
    if (STATE.view === "fin" && !(ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName))) renderFinBody();
  }
  window.addEventListener("message", function (e) { if (e.data && e.data.__bcFin) handleFin(e.data.__bcFin, 0); });
  (function startFinScan() {
    if (!window.FinCollect) return;
    function send(payload) { if (window.top === window) handleFin(payload, 0); else { try { window.top.postMessage({ __bcFin: payload }, "*"); } catch (e) {} } }
    var tmr = null;
    function go() { try { window.FinCollect.scan(document, send); } catch (e) {} }
    // فقط بعد از اینکه کاربر پنل را باز کرد (در همه‌ی فریم‌ها) اسکن جدول‌ها شروع می‌شود
    window.ComboLazy.onActive(function () {
      setInterval(go, 3000);
      go();
      try { new MutationObserver(function () { clearTimeout(tmr); tmr = setTimeout(go, 900); }).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
    });
  })();

  // ---- بارگذاری داده‌های ذخیره‌شده‌ی نماد (قیمت‌ها، ورودی‌ها، تحلیل، مالی) با کلید کد نماد
  function loadSymbol(cb) {
    var key = pageKey; symLoaded = false;
    function applyD(d) {
      STATE.inp = (d && d.inp) || {}; STATE.an = (d && d.an) || null; STATE.at = (d && d.at) || null;
      if (d && d.type) STATE.type = d.type;
    }
    function finStep(d) {
      store.get("fin:" + key, function (f) {
        if (key !== pageKey) return;
        function done(ff) {
          STATE.fin = Object.assign(FIN_DEF(), ff || {});
          STATE.fin.y0 = STATE.fin.y0 || {}; STATE.fin.y1 = STATE.fin.y1 || {}; STATE.fin.manual = STATE.fin.manual || {}; STATE.fin.tables = STATE.fin.tables || {};
          var F = STATE.fin; F.slots = F.slots || { bs: null, is: null, cf: null };
          sortedTables(F).forEach(function (t) { if (t.v === 2 && !F.slots[t.kind]) F.slots[t.kind] = t; });   // انتقال از قالب قبلی
          F.tables = {};
          if (!F.hist) { F.hist = {}; ["bs", "is", "cf"].forEach(function (k) { if (F.slots[k]) addHist(F, F.slots[k]); }); }
          symLoaded = true;
          cb(!!(d && d.inp && Number(d.inp.S) > 0));
        }
        if (f || key === legacyKey()) done(f);
        else store.get("fin:" + legacyKey(), function (f2) { if (key !== pageKey) return; if (f2) store.set("fin:" + key, f2); done(f2); });
      });
    }
    store.get(key, function (d) {
      if (key !== pageKey) return;
      if (d || key === legacyKey()) { applyD(d); finStep(d); return; }
      store.get(legacyKey(), function (d2) {   // انتقال از کلید قدیمی (بر اساس نشانی صفحه)
        if (key !== pageKey) return;
        applyD(d2); if (d2) store.set(key, d2); finStep(d2);
      });
    });
  }
  function allStored(cb) {
    try { if (chrome.storage && chrome.storage.local) { chrome.storage.local.get(null, function (r) { cb(r || {}); }); return; } } catch (e) {}
    var o = {};
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf("cb:") === 0) { try { o[k.slice(3)] = JSON.parse(localStorage.getItem(k)); } catch (e) {} } }
    cb(o);
  }
  function restoreStored(data, cb) {
    try { if (chrome.storage && chrome.storage.local) { chrome.storage.local.set(data, cb); return; } } catch (e) {}
    Object.keys(data).forEach(function (k) { try { localStorage.setItem("cb:" + k, JSON.stringify(data[k])); } catch (e) {} });
    cb();
  }
  function cachedNote() {
    if (!STATE.at) return;
    var el = root.getElementById("rep");
    if (el) el.innerHTML = '<div class="t">اطلاعات ذخیره‌شده‌ی این نماد بارگذاری شد (آخرین خواندن: ' + esc(new Date(STATE.at).toLocaleString("fa-IR")) + '). برای به‌روزرسانی «خواندن از سایت» را بزن؛ تا آن موقع چیزی پاک یا جایگزین نمی‌شود.</div>';
  }


  // ================= کدال =================
  var CDL = { sym: null, list: [], at: 0, f: "all", loading: false, err: "", tried: {}, finBusy: null, finMsg: "" };
  var CDL_CLS = [["fin", "صورت مالی", /صورت\s*های\s*مالی|اطلاعات و صورت/], ["mon", "فعالیت ماهانه", /فعالیت\s*ماهانه/], ["imp", "افشای بااهمیت", /بااهمیت|با اهمیت/], ["div", "تقسیم سود", /تقسیم\s*سود|سود\s*نقدی|پرداخت\s*سود/], ["agm", "مجمع", /مجمع/], ["cap", "افزایش سرمایه", /افزایش\s*سرمایه/]];
  function toLat(x) { return String(x || "").replace(/[۰-۹]/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹".indexOf(d); }).replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); }); }
  function cdlCls(title) { var t = String(title || "").replace(/[\u200c]/g, " "); for (var i = 0; i < CDL_CLS.length; i++) if (CDL_CLS[i][2].test(t)) return CDL_CLS[i][0]; return "other"; }
  function cdlAbs(u) { if (!u) return ""; if (/^https?:/.test(u)) return u; return "https://codal.ir" + (u.charAt(0) === "/" ? "" : "/") + u; }
  function cdlSym() { var n = STATE.inp && STATE.inp.name_o; return n ? String(n).replace(/ي/g, "ی").replace(/ك/g, "ک").trim() : ""; }
  function cdlUrl(sym, page) {
    return "https://search.codal.ir/api/search/v2/q?&Audited=true&AuditorRef=-1&Category=-1&Childs=true&CompanyState=-1&CompanyType=-1&Consolidatable=true&IsNotAudited=false&Length=-1&LetterType=-1&Mains=true&NotAudited=true&NotConsolidatable=true&PageNumber=" + page + "&Publisher=false&TracingNo=-1&search=true&Symbol=" + encodeURIComponent(sym);
  }
  function cdlFindUrl(o, re) {
    var ks = Object.keys(o || {});
    for (var i = 0; i < ks.length; i++) { var v = o[ks[i]]; if (typeof v === "string" && /^(https?:)?\/\//.test(v) && re.test(v)) return v; }
    return "";
  }
  function cdlBin(url, cb) {
    try {
      chrome.runtime.sendMessage({ t: "codalbin", url: url }, function (r) {
        if (!r || !r.ok) { cb(null, (r && (r.err || ("HTTP " + r.status))) || (chrome.runtime.lastError && chrome.runtime.lastError.message) || "no response"); return; }
        var bin = atob(r.b64), u = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        cb(u.buffer);
      });
    } catch (e) { cb(null, String(e)); }
  }
  function cdlFinLetters() {
    var L = (CDL.list || []).filter(function (x) { return x.excel && /صورت\s*های\s*مالی/.test(String(x.title).replace(/[\u200c]/g, " ")) && !/توضیحات/.test(x.title); });
    function endOf(x) { var d = dateOf(toLat(x.title)); return d ? d.y + "/" + pad2(d.m) + "/" + pad2(d.d) : ""; }
    var idx = {}; (CDL.list || []).forEach(function (x, i) { idx[x.tn] = i; });
    L.sort(function (a, b) { return endOf(b).localeCompare(endOf(a)) || (idx[a.tn] - idx[b.tn]); });   // جدیدترین دوره؛ در هم‌دوره‌ها آخرین انتشار (اصلاحیه)
    return L.map(function (x) { x.end = endOf(x); return x; });
  }
  function cdlReadFin(letter, cb) {
    if (!window.CodalFin) { CDL.finMsg = "ماژول خواندن اکسل بارگذاری نشده."; cb && cb(false); return; }
    CDL.finBusy = letter.tn; CDL.finMsg = "در حال دریافت و خواندن اکسل کدال…"; if (STATE.view === "cdl") renderCdl();
    cdlBin(letter.excel, function (buf, err) {
      function fail(msg) { CDL.finBusy = null; CDL.finMsg = msg; if (STATE.view === "cdl") renderCdl(); if (STATE.view === "fin") renderFinBody(); cb && cb(false); }
      if (!buf) { fail("دریافت اکسل ناموفق بود (" + err + ")."); return; }
      window.CodalFin.read(buf, window.CodalFin.infoFromTitle(letter.title)).then(function (r) {
        if (!r.tables.length) { fail("از اکسل جدولی نخواندم. " + r.notes.slice(0, 4).join(" | ") + " — فایل نمونه را برایم بفرست."); return; }
        handleFin({ tables: r.tables }, 0);
        if (STATE.fin) { STATE.fin.cdlTn = letter.tn; persistFin(); }
        CDL.finBusy = null; CDL.finMsg = "✔ از کدال خوانده شد: " + r.tables.map(function (t) { return KIND_LABEL[t.kind] + " (" + t.rows.length + " ردیف)"; }).join("، ") + " — دوره‌ی " + (letter.end || "");
        if (STATE.view === "cdl") renderCdl(); if (STATE.view === "fin") renderFinBody();
        cb && cb(true);
      }, function (e) { fail("خواندن فایل اکسل ناموفق بود: " + (e && e.message || e)); });
    });
  }
  function cdlAutoFin() {
    var f = STATE.fin; if (!f || !symLoaded) return;
    var L = cdlFinLetters(); if (!L.length) return;
    var top = L[0], S = f.slots || {};
    var have = ["bs", "is"].map(function (k) { var t = S[k]; return t ? (t.end || "") : ""; });
    var haveEnd = have.slice().sort().pop() || "";
    var need = !S.is || !S.bs || (top.end && top.end > haveEnd) || (top.end === haveEnd && f.cdlTn !== top.tn && ((S.is && S.is.src !== "codal") || (S.bs && S.bs.src !== "codal")));
    if (!need || CDL.tried[top.tn] || CDL.finBusy) return;
    CDL.tried[top.tn] = true;
    cdlReadFin(top);
  }
  function cdlGet(url) {
    return new Promise(function (res) {
      try { chrome.runtime.sendMessage({ t: "codal", url: url }, function (r) { res(r || { ok: false, err: (chrome.runtime.lastError && chrome.runtime.lastError.message) || "no response" }); }); }
      catch (e) { res({ ok: false, err: String(e) }); }
    });
  }
  function cdlEnsure(force, cb) {
    var sym = cdlSym();
    if (!sym) { CDL.err = "نام نماد هنوز خوانده نشده؛ یک بار «خواندن از سایت» را بزن."; cb && cb(); return; }
    function go() {
      var stale = !CDL.at || Date.now() - CDL.at > 6 * 3600 * 1000;
      if (!force && !stale) { cb && cb(); return; }
      if (CDL.loading) return;
      CDL.loading = true; CDL.err = ""; if (STATE.view === "cdl") renderCdl();
      Promise.all([1, 2, 3].map(function (pg) { return cdlGet(cdlUrl(sym, pg)); })).then(function (rs) {
        var seen = {}, list = [], okAny = false, lastErr = "";
        rs.forEach(function (r) {
          if (!r.ok) { lastErr = r.err || ("HTTP " + r.status + " " + (r.snippet || "")); return; }
          okAny = true;
          var L = (r.json && (r.json.Letters || r.json.letters)) || [];
          L.forEach(function (x) {
            var tn = x.TracingNo || x.tracingNo || x.SuperVision && x.SuperVision.TracingNo || (x.Url || x.url || "") + (x.Title || "");
            if (seen[tn]) return; seen[tn] = 1;
            list.push({ tn: tn, title: x.Title || x.title || "", date: x.PublishDateTime || x.SentDateTime || x.publishDateTime || "", comp: x.CompanyName || x.companyName || "", sym: x.Symbol || x.symbol || "", url: cdlAbs(x.Url || x.url), excel: cdlAbs(x.ExcelUrl || x.excelUrl || cdlFindUrl(x, /excel|xls/i)), pdf: cdlAbs(x.PdfUrl || x.pdfUrl), att: cdlAbs(x.AttachmentUrl || x.attachmentUrl), code: x.LetterCode || x.letterCode || "" });
          });
        });
        CDL.loading = false;
        if (!okAny) CDL.err = "اتصال به کدال ناموفق بود (" + lastErr + "). یک‌بار افزونه را ریلود کن تا مجوز دسترسی به کدال را بگیرد.";
        else { CDL.list = list; CDL.at = Date.now(); CDL.sym = sym; store.set("cdl:" + sym, { at: CDL.at, list: list.slice(0, 80) }); if (!list.length) CDL.err = "برای «" + sym + "» اطلاعیه‌ای پیدا نشد؛ ممکن است نام نماد در کدال متفاوت باشد."; }
        cb && cb(); if (STATE.view === "cdl") renderCdl();
      });
    }
    if (CDL.sym !== sym) { CDL.sym = sym; CDL.list = []; CDL.at = 0; store.get("cdl:" + sym, function (d) { if (d && d.list) { CDL.list = d.list; CDL.at = d.at || 0; } go(); }); }
    else go();
  }

  // ================= مجمع بعدی (از روی اطلاعیه‌های کدال) =================
  function jAdd(j, n) {
    var g = window.OCCollect.j2g(j.y, j.m, j.d), t = new Date(Date.UTC(g[0], g[1] - 1, g[2]) + n * 86400000);
    var r = g2j(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
    return { y: r[0], m: r[1], d: r[2] };
  }
  function jStr(j) { return fa(j.y + "/" + pad2(j.m) + "/" + pad2(j.d)); }
  function jDaysTo(j) { return window.OCCollect.daysUntil(j.y, j.m, j.d); }
  // نتیجه: { date, daysTo, kind: "announced" | "estimated", basis, from, to }  یا null
  function cdlNextAgm() {
    var items = (CDL.list || []).map(function (x) {
      var t = String(x.title || "").replace(/[\u200c]/g, " ");
      return { t: t, d: dateOf(toLat(x.date)), x: x };
    }).filter(function (o) { return o.d && /مجمع/.test(o.t); });
    if (!items.length) return null;
    var key = function (d) { return d.y * 10000 + d.m * 100 + d.d; };
    var ago = function (o) { return -jDaysTo(o.d); };
    var inv = items.filter(function (o) { return /دعوت/.test(o.t); });
    var dec = items.filter(function (o) { return /تصمیمات|نتیجه\s*مجمع|برگزار/.test(o.t); });
    // ۱) آگهی دعوتِ اخیر که هنوز خلاصه تصمیمات بعدش نیامده
    var recent = inv.filter(function (o) { return ago(o) >= 0 && ago(o) <= 45; }).sort(function (a, b) { return key(b.d) - key(a.d); })[0];
    if (recent && !dec.some(function (o) { return key(o.d) >= key(recent.d); })) {
      var m = toLat(recent.t).match(/(?:مورخ|تاریخ|روز)[^\d]{0,12}(\d{4}\/\d{1,2}\/\d{1,2})/), md = m ? dateOf(m[1]) : null, kind = "announced", basis, date, from, to;
      if (md && key(md) >= key(recent.d)) { date = md; from = md; to = md; basis = "تاریخ مجمع در عنوان آگهی دعوت (" + jStr(recent.d) + ") آمده است."; }
      else { date = jAdd(recent.d, 15); from = jAdd(recent.d, 10); to = jAdd(recent.d, 40); basis = "آگهی دعوت در " + jStr(recent.d) + " منتشر شده؛ طبق قانون مجمع ۱۰ تا ۴۰ روز بعد از آگهی برگزار می‌شود (تخمین مرکزی ۱۵ روز بعد)."; }
      return { date: date, daysTo: jDaysTo(date), kind: kind, basis: basis, from: from, to: to };
    }
    // ۲) تخمین از روی مجمع سالیانه‌ی سال‌های قبل: همان روز و ماه در سال بعد
    var past = items.filter(function (o) { return /عادی|سالیانه|سالانه/.test(o.t) && !/فوق\s*العاده/.test(o.t) && (/تصمیمات|برگزار|نتیجه/.test(o.t) ? true : /دعوت/.test(o.t)); })
      .map(function (o) { var isDec = /تصمیمات|برگزار|نتیجه/.test(o.t); return { d: isDec ? o.d : jAdd(o.d, 15), t: o.t }; })
      .filter(function (o) { return ago({ d: o.d }) > 60; })
      .sort(function (a, b) { return key(b.d) - key(a.d); });
    if (past.length) {
      var p = past[0], nx = { y: p.d.y + 1, m: p.d.m, d: p.d.d };
      while (jDaysTo(nx) < -5) nx = { y: nx.y + 1, m: nx.m, d: nx.d };
      return { date: nx, daysTo: jDaysTo(nx), kind: "estimated", basis: "تخمین از روی مجمع قبلی (حدود " + jStr(p.d) + ")؛ مجمع سالیانه هر سال تقریباً در همان روزهاست.", from: jAdd(nx, -20), to: jAdd(nx, 20) };
    }
    return null;
  }
  function agmCardHtml() {
    var a = cdlNextAgm();
    if (!a) return '<div class="msg w">مجمع بعدی را از اطلاعیه‌های کدال نتوانستم پیدا کنم (اطلاعیه‌ی مجمع کافی نیست).</div>';
    var st = OC.effective(STATE.st), cal = Math.round(st.hold * 7 / 5), inside = a.daysTo <= cal && a.daysTo >= -3;
    return '<div class="msg ' + (inside ? "w" : "ok") + '"><b>🗓 مجمع بعدی ' + (a.kind === "announced" ? "(اعلام‌شده)" : "(تخمینی)") + ': ' + esc(jStr(a.date)) + '</b> — ' + (a.daysTo >= 0 ? fa(a.daysTo) + " روز دیگر" : fa(-a.daysTo) + " روز پیش") + (a.kind === "estimated" || a.from !== a.to ? ' (بازه‌ی محتمل ' + esc(jStr(a.from)) + ' تا ' + esc(jStr(a.to)) + ')' : '') +
      '<div style="font-weight:400;font-size:11.5px;margin-top:3px">' + esc(a.basis) + ' ' + (inside ? "در افق نگهداری تو (حدود " + fa(cal) + " روز تقویمی) می‌افتد؛ اثر تقسیم سود و حذف حق تقدم روی قیمت را در نظر بگیر." : "خارج از افق نگهداری تو (حدود " + fa(cal) + " روز تقویمی) است.") + '</div></div>';
  }
  // تیک خودکار «رویداد مهم تا افق نگهداری» (اگر خودت دستی انتخاب نکرده باشی)
  function autoEvent() {
    if (!symLoaded) return;
    var a = cdlNextAgm(); if (!a) return;
    var st = OC.effective(STATE.st), cal = Math.round(st.hold * 7 / 5), v = (a.daysTo <= cal && a.daysTo >= -3) ? "بله" : "خیر";
    if (!STATE.inp.q_event_man) STATE.inp.q_event = v;
    STATE.inp.q_event_auto = "کدال: مجمع بعدی " + (a.kind === "announced" ? "(اعلام‌شده) " : "(تخمینی) ") + jStr(a.date) + " — " + (v === "بله" ? "داخل" : "خارج از") + " افق نگهداری" + (STATE.inp.q_event_man ? " (تو دستی «" + STATE.inp.q_event + "» انتخاب کرده‌ای)" : " ← خودکار تیک خورد");
    persist(); if (!STATE.collapsed && STATE.view !== "cmp") { hydrateInputs(); update(); }
  }

  function enterCdl() {
    STATE.view = "cdl"; STATE.showSettings = false; renderAll();
    cdlEnsure(false, function () { if (STATE.view === "cdl") renderCdl(); autoEvent(); });
  }
  function cdlLatestFinEnd() {
    var best = "";
    (CDL.list || []).forEach(function (x) {
      if (cdlCls(x.title) !== "fin") return;
      var d = dateOf(toLat(x.title)); if (!d) return;
      var e = d.y + "/" + pad2(d.m) + "/" + pad2(d.d); if (e > best) best = e;
    });
    return best;
  }
  function cdlBanner(f) {
    if (!CDL.list || !CDL.list.length) return "";
    var ce = cdlLatestFinEnd(); if (!ce) return "";
    var have = ["bs", "is", "cf"].map(function (k) { var t = (f.slots || {})[k]; var d = t && (dateOf(t.end) || dateOf(t.cols && t.cols[0])); return d ? d.y + "/" + pad2(d.m) + "/" + pad2(d.d) : ""; }).sort().pop() || "";
    if (have && ce <= have) return "";
    var it = CDL.list.filter(function (x) { return cdlCls(x.title) === "fin"; })[0];
    return '<div class="msg w">📢 کدال: صورت مالی دوره‌ی منتهی به <b>' + esc(ce) + '</b> منتشر شده' + (have ? '؛ داده‌ی ذخیره‌شده‌ی تو تا ' + esc(have) + ' است' : '') + '. تب ترازنامه و سود و زیان را روی TSETMC باز کن تا به‌روز شود.' + (it && it.url ? ' <a href="' + esc(it.url) + '" target="_blank" rel="noopener" style="color:inherit">مشاهده در کدال</a>' : '') + '</div>';
  }
  function renderCdl() {
    var el = root.getElementById("cdlbody"); if (!el) return;
    var sym = cdlSym();
    var h = '<div class="note">اطلاعیه‌ها و افشای اطلاعات ' + (sym ? "<b>" + esc(sym) + "</b>" : "نماد") + ' از سامانه‌ی کدال' + (CDL.at ? ' — آخرین دریافت: ' + esc(new Date(CDL.at).toLocaleString("fa-IR")) : '') + '</div>';
    h += '<div class="fset"><button class="usep" id="cdlref">' + (CDL.loading ? "در حال دریافت…" : "🔄 دریافت از کدال") + '</button></div>';
    if (CDL.err) h += '<div class="msg w">' + esc(CDL.err) + '</div>';
    if (CDL.list && CDL.list.length) h += agmCardHtml();
    if (CDL.finMsg) h += '<div class="msg ' + (/^✔/.test(CDL.finMsg) ? "ok" : "w") + '">' + esc(CDL.finMsg) + '</div>';
    var cnt = {}; (CDL.list || []).forEach(function (x) { var c = cdlCls(x.title); cnt[c] = (cnt[c] || 0) + 1; });
    h += '<div class="tabs" style="margin:6px 0"><button data-cf="all" class="' + (CDL.f === "all" ? "on" : "") + '">همه (' + fa((CDL.list || []).length) + ')</button>' +
      CDL_CLS.filter(function (c) { return cnt[c[0]]; }).map(function (c) { return '<button data-cf="' + c[0] + '" class="' + (CDL.f === c[0] ? "on" : "") + '">' + esc(c[1]) + ' (' + fa(cnt[c[0]]) + ')</button>'; }).join("") +
      (cnt.other ? '<button data-cf="other" class="' + (CDL.f === "other" ? "on" : "") + '">سایر (' + fa(cnt.other) + ')</button>' : '') + '</div>';
    var L = (CDL.list || []).filter(function (x) { return CDL.f === "all" || cdlCls(x.title) === CDL.f; }).slice(0, 60);
    if (!L.length && !CDL.loading) h += '<div class="empty">' + (CDL.list && CDL.list.length ? "موردی در این دسته نیست." : "هنوز چیزی دریافت نشده.") + '</div>';
    L.forEach(function (x) {
      h += '<div class="sg" style="margin:4px 0"><div class="line"><span><b>' + esc(x.title) + '</b></span><span style="font-weight:400;color:var(--mut);white-space:nowrap">' + esc(toLat(x.date).slice(0, 16)) + '</span></div><div style="font-size:12px;margin-top:2px">' +
        [x.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">مشاهده در کدال</a>' : "", x.excel ? '<a href="' + esc(x.excel) + '" target="_blank" rel="noopener">اکسل</a>' : "", x.pdf ? '<a href="' + esc(x.pdf) + '" target="_blank" rel="noopener">PDF</a>' : "", x.att ? '<a href="' + esc(x.att) + '" target="_blank" rel="noopener">پیوست</a>' : ""].filter(Boolean).join(" · ") +
        (x.excel && cdlCls(x.title) === "fin" && !/توضیحات/.test(x.title) ? ' <button class="usep" data-rf="' + esc(x.tn) + '"' + (CDL.finBusy ? " disabled" : "") + '>📊 خواندن اعداد این صورت مالی</button>' : "") + '</div></div>';
    });
    h += '<div class="legend">فقط فهرست اطلاعیه‌ها خوانده می‌شود؛ عددهای صورت مالی همچنان از جدول‌های TSETMC (تب مالی) گرفته می‌شود. اگر صورت مالی جدیدتری در کدال باشد، در تب مالی هشدار می‌دهد.</div>';
    el.innerHTML = h;
    var rf = el.querySelector("#cdlref"); if (rf) rf.onclick = function () { cdlEnsure(true); };
    el.querySelectorAll("[data-cf]").forEach(function (b) { b.onclick = function () { CDL.f = b.dataset.cf; renderCdl(); }; });
    el.querySelectorAll("[data-rf]").forEach(function (b) { b.onclick = function () { var it = (CDL.list || []).filter(function (x) { return String(x.tn) === b.dataset.rf; })[0]; if (it) { it.end = (cdlFinLetters().filter(function (y) { return y.tn === it.tn; })[0] || {}).end; cdlReadFin(it); } }; });
  }

  // ================= تب تحلیل مالی =================
  function enterFin() {
    STATE.view = "fin"; STATE.showSettings = false; renderAll();
    cdlEnsure(false, function () { if (STATE.view === "fin") { var fb = root.getElementById("finbody"); if (fb) renderFinBody(); } cdlAutoFin(); });
  }
  function persistFin() { if (!symLoaded) return; store.set("fin:" + pageKey, STATE.fin); }
  function normLabel(x) { return String(x).replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[\u200c\u200e\u200f\s()\-–:،,.«»]/g, ""); }
  var FIN_PAT = {
    rev: [/^(جمع)?درآمدهایعملیاتی$/, /^درآمدعملیاتی$/, /^فروشخالص$/, /^درآمدحاصلازفروش/],
    cogs: [/^بهایتمامشده(درآمدهایعملیاتی|درآمدعملیاتی|کالایفروشرفته|فروش)/, /^بهایتمامشدهدرآمد/],
    opinc: [/^سودزیانعملیاتی$/],
    int: [/^هزینه(های)?مالی$/],
    ni: [/^سودزیانخالص$/, /^سودخالص$/],
    ta: [/^جمعداراییها$/, /^جمعکلداراییها$/, /^جمعدارایی$/],
    ca: [/^جمعداراییهایجاری$/],
    cl: [/^جمعبدهیهایجاری$/],
    tl: [/^جمعبدهیها$/, /^جمعکلبدهیها$/],
    eq: [/^جمعحقوق(مالکانه|صاحبانسهام)$/, /^حقوق(مالکانه|صاحبانسهام)$/, /^جمعحقوقمالکانه(متعلقبهمالکان.*)?$/],
    re: [/^سودزیانانباشته$/, /^سودانباشته$/],
    cfo: [/^جریانخالص(ورودخروج)?وجهنقدحاصلازفعالیتهایعملیاتی$/, /وجهنقدحاصلازفعالیتهایعملیاتی$/, /^جریانخالص(ورودخروج)?نقدحاصلازفعالیتهایعملیاتی$/],
    rec: [/^دریافتنیهایتجاریوسایردریافتنیها$/, /^حسابهاواسناددریافتنی/],
    cap: [/^سرمایه$/],
    dps: [/^سودنقدیهرسهم/],
  };
  function parseCell(v) {
    if (typeof v === "number") return v;
    if (v === null || v === undefined) return null;
    var t = String(v).trim().replace(/[۰-۹]/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹".indexOf(d); }).replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); }).replace(/٬/g, ",");
    if (!/^[\(\-]?\s*[\d,]+(\.\d+)?\s*\)?$/.test(t)) return null;
    var neg = /^\(/.test(t) || /^-/.test(t);
    var n = Number(t.replace(/[^\d.]/g, ""));
    return isFinite(n) ? (neg ? -n : n) : null;
  }
  function extractFin(rows) {
    var out = { y0: {}, y1: {} }, found = [];
    rows.forEach(function (row) {
      var li = -1;
      for (var i = 0; i < row.length; i++) { if (typeof row[i] === "string" && normLabel(row[i]).length > 2) { li = i; break; } }
      if (li < 0) return;
      var lab = normLabel(row[li]);
      Object.keys(FIN_PAT).forEach(function (k) {
        if (out.y0[k] !== undefined) return;
        if (!FIN_PAT[k].some(function (re) { return re.test(lab); })) return;
        var nums = [];
        for (var j = li + 1; j < row.length; j++) { var n = parseCell(row[j]); if (n !== null) nums.push(n); }
        if (nums.length >= 3 && Math.abs(nums[0]) <= 60 && Number.isInteger(nums[0])) nums.shift();   // ستون شماره یادداشت
        if (!nums.length) return;
        var ab = (k === "cogs" || k === "int");
        out.y0[k] = ab ? Math.abs(nums[0]) : nums[0]; if (nums.length > 1) out.y1[k] = ab ? Math.abs(nums[1]) : nums[1];
        found.push(String(row[li]).trim());
      });
    });
    return { fin: out, found: found };
  }
  async function inflateRaw(raw) {
    var ds = new DecompressionStream("deflate-raw");
    return new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer());
  }
  async function readXlsx(buf) {
    var u8 = new Uint8Array(buf), dv = new DataView(buf), e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error("فایل xlsx معتبر نیست (اگر .xls است، در اکسل با Save As به xlsx تبدیل کن)");
    var cnt = dv.getUint16(e + 10, true), p = dv.getUint32(e + 16, true), files = {};
    for (var i = 0; i < cnt; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
      var name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen)); p += 46 + nlen + elen + clen;
      if (!/^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(name)) continue;
      var ds = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true), raw = u8.subarray(ds, ds + csize);
      files[name] = new TextDecoder().decode(method === 0 ? raw : await inflateRaw(raw));
    }
    var shared = [];
    if (files["xl/sharedStrings.xml"]) {
      var sd = new DOMParser().parseFromString(files["xl/sharedStrings.xml"], "application/xml");
      sd.querySelectorAll("si").forEach(function (si) { var t = ""; si.querySelectorAll("t").forEach(function (x) { t += x.textContent; }); shared.push(t); });
    }
    var rows = [];
    Object.keys(files).filter(function (n) { return /worksheets/.test(n); }).sort().forEach(function (n) {
      var d = new DOMParser().parseFromString(files[n], "application/xml");
      d.querySelectorAll("row").forEach(function (r) {
        var arr = [];
        r.querySelectorAll("c").forEach(function (c) {
          var ref = c.getAttribute("r") || "", m = ref.match(/^([A-Z]+)/), col = 0;
          if (m) for (var k = 0; k < m[1].length; k++) col = col * 26 + (m[1].charCodeAt(k) - 64);
          col = Math.max(0, col - 1);
          var t = c.getAttribute("t"), v = c.querySelector("v"), val = null;
          if (t === "s" && v) val = shared[Number(v.textContent)];
          else if (t === "inlineStr") val = c.textContent;
          else if (v) { val = t === "str" ? v.textContent : Number(v.textContent); }
          arr[col] = val;
        });
        rows.push(arr);
      });
    });
    return rows;
  }
  function readCsv(text) {
    return text.split(/\r?\n/).map(function (l) { return l.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(function (x) { return x.replace(/^"|"$/g, ""); }); });
  }
  function renderFinBody() {
    var el = root.getElementById("finbody");
    if (!el) return;
    var f = STATE.fin;
    autoApplyFin(f); persistFin();
    var h = cdlBanner(f) + sourceHtml(f) + '<div class="rep" id="finrep" style="display:block"></div><div id="finres"></div>' + trendHtml(f) + scrapedHtml(f) +
      '<details class="sg" data-dk="manual"' + (OPEN_D.manual ? ' open' : '') + '><summary><b>✏️ ویرایش دستی / ورود از اکسل (اختیاری)</b></summary>' +
      '<div class="fset"><button class="btn pri" id="finpick">📂 وارد کردن از فایل اکسل (xlsx) / CSV</button><input type="file" id="finfile" accept=".xlsx,.csv,.tsv,.txt" style="display:none">' +
      '<div class="f1"><label>واحد اعداد</label><select id="finunit"><option value="1">ریال</option><option value="1000000">میلیون ریال</option><option value="1000000000">میلیارد ریال</option></select></div>' +
      '<div class="f1"><label>تورم سالانه (برای رشد واقعی)</label><input id="fininfl" inputmode="decimal" value="' + +(f.infl * 100).toFixed(1) + '"></div>' +
      '<button class="btn" id="finclear">پاک کردن</button></div>' +
      '<div class="fgrid"><span></span><span class="h">سال مالی جاری</span><span class="h">سال قبل</span>';
    OC.FIN_KEYS.forEach(function (k) {
      h += '<label>' + esc(k[1]) + '</label>';
      ["y0", "y1"].forEach(function (y) { h += '<input data-fy="' + y + '" data-fk="' + k[0] + '" inputmode="decimal" value="' + (f[y][k[0]] !== undefined && f[y][k[0]] !== null ? f[y][k[0]] : "") + '">'; });
    });
    h += '</div></details>';
    el.innerHTML = h;
    bindScraped(el, f);
    el.querySelectorAll("details[data-dk]").forEach(function (d) { var sm = d.querySelector("summary"); if (sm) sm.addEventListener("click", function () { OPEN_D[d.dataset.dk] = !d.open; }); });
    var un = root.getElementById("finunit"); un.value = String(f.unit);
    un.onchange = function () { f.unit = Number(un.value); persistFin(); renderFinResult(); };
    root.getElementById("fininfl").oninput = function () { var n = parseNum(this.value); if (n !== null) { f.infl = n / 100; persistFin(); renderFinResult(); } };
    el.querySelectorAll("[data-fk]").forEach(function (inp) {
      inp.oninput = function () { var n = parseNum(inp.value); f.manual = f.manual || {}; f.manual[inp.dataset.fk] = true; if (String(inp.value).trim() === "") delete f[inp.dataset.fy][inp.dataset.fk]; else if (n !== null) f[inp.dataset.fy][inp.dataset.fk] = n; persistFin(); renderFinResult(); };
    });
    root.getElementById("finclear").onclick = function () { if (confirm("همه اعداد مالی این سهم پاک شود؟")) { STATE.fin = { unit: f.unit, infl: f.infl, y0: {}, y1: {}, manual: {}, tables: f.tables || {} }; persistFin(); renderFinBody(); } };
    var fileEl = root.getElementById("finfile");
    root.getElementById("finpick").onclick = function () { fileEl.click(); };
    fileEl.onchange = async function () {
      var file = fileEl.files[0], rep = root.getElementById("finrep");
      if (!file) return;
      try {
        var rows;
        if (/\.xlsx$/i.test(file.name)) rows = await readXlsx(await file.arrayBuffer());
        else if (/\.xls$/i.test(file.name)) throw new Error("فرمت قدیمی xls پشتیبانی نمی‌شود؛ در اکسل با Save As به xlsx تبدیل کن");
        else rows = readCsv(await file.text());
        var r = extractFin(rows), n = Object.keys(r.fin.y0).length;
        if (!n) { rep.innerHTML = '<div class="x">✖ هیچ ردیف شناخته‌شده‌ای پیدا نشد (برچسب‌های صورت‌های مالی فارسی لازم است). اعداد را دستی وارد کن.</div>'; return; }
        f.manual = f.manual || {}; Object.keys(r.fin.y0).forEach(function (k) { f.y0[k] = r.fin.y0[k]; f.manual[k] = true; });
        Object.keys(r.fin.y1).forEach(function (k) { f.y1[k] = r.fin.y1[k]; });
        persistFin(); renderFinBody();
        root.getElementById("finrep").innerHTML = '<div class="o">✔ ' + fa(n) + ' از ' + fa(OC.FIN_KEYS.length) + ' ردیف از فایل خوانده شد: ' + esc(r.found.slice(0, 12).join("، ")) + '</div><div class="t">ستون اول عدد = سال جاری و ستون دوم = سال قبل فرض شده؛ اعداد را با فایل مقایسه کن و اشتباهات را اصلاح کن.</div>';
      } catch (e) { rep.innerHTML = '<div class="x">✖ ' + esc(String(e.message || e)) + '</div>'; }
      fileEl.value = "";
    };
    renderFinResult();
  }
  function renderFinResult() {
    var el = root.getElementById("finres");
    if (!el) return;
    var siteEps = num0(STATE.inp.eps_site), sitePe = num0(STATE.inp.pe);
    if ((siteEps === null || siteEps === undefined) && STATE.fin.epsTbl !== undefined) siteEps = STATE.fin.epsTbl;
    var r = OC.finAnalyze(STATE.fin, num0(STATE.inp.S), STATE.inp.pe_sec, { eps: siteEps, pe: sitePe });
    if (r.score === null && !r.ratios.some(function (x) { return x.v0 !== null; })) { el.innerHTML = '<div class="empty">منتظر صورت مالی از کدال هستم؛ چند ثانیه صبر کن یا تب «کدال» را باز کن.</div>'; return; }
    var cls = r.score >= 70 ? "ok" : r.score >= 50 ? "w" : "h";
    var h = '<div class="sg"><h5>نتیجه تحلیل بنیادی</h5><div class="pbig"><span class="pv">' + (r.score === null ? "—" : fa(r.score) + " از ۱۰۰") + '</span><span class="msg ' + cls + '" style="margin:0"><b>' + esc(r.verdict) + '</b></span></div>';
    if (r.notes.good.length) h += r.notes.good.map(function (t) { return '<div class="msg ok">✔ ' + esc(t) + '</div>'; }).join("");
    if (r.notes.bad.length) h += r.notes.bad.map(function (t) { return '<div class="msg h">✖ ' + esc(t) + '</div>'; }).join("");
    h += '<button class="usep" id="finapply">اعمال روی چک‌لیست (پر کردن «بنیادی مشکل جدی ندارد» و P/E)</button></div>';
    h += '<div class="cmp sgt"><table><thead><tr><th class="lab">نسبت</th><th>سال جاری</th><th>سال قبل</th><th>روند</th></tr></thead><tbody>';
    r.ratios.forEach(function (x) {
      var tr = "";
      if (x.v0 !== null && x.v1 !== null && x.v1 !== undefined) { var d = x.v0 - x.v1; tr = Math.abs(d) < 1e-9 ? "—" : (d > 0) === (x.better > 0) ? "▲ بهتر" : "▼ بدتر"; }
      h += '<tr><td class="lab">' + esc(x.label) + '</td><td class="v">' + esc(fmt(x.v0, x.fmt)) + '</td><td class="v">' + esc(fmt(x.v1, x.fmt)) + '</td><td class="' + (tr[0] === "▲" ? "v best" : tr[0] === "▼" ? "v worst" : "v") + '">' + tr + '</td></tr>';
    });
    h += '</tbody></table></div>';
    var v = r.val;
    if (v.mcap || v.pe || v.eps) {
      h += '<div class="sg"><h5>ارزش‌گذاری (با قیمت فعلی ' + esc(fmt(num0(STATE.inp.S), "money")) + ')</h5>' +
        [["ارزش بازار (ریال)", v.mcap, "money"], ["EPS (از سایت، ریال)", v.eps, "money"], ["P/E (از سایت)", v.pe, "ratio1"], ["P/B", v.pb, "ratio2"], ["P/S", v.ps, "ratio2"], ["بازده سود (۱/PE)", v.ey, "pct1"], ["بازده سود نقدی", v.dy, "pct1"], ["نسبت تقسیم سود", v.payout, "pct0"]]
          .map(function (x) { return '<div class="line"><span>' + x[0] + '</span><span class="vv">' + esc(fmt(x[1], x[2])) + '</span></div>'; }).join("") + '</div>';
    } else h += '<div class="legend" style="margin:0 12px 8px">برای P/E و P/B «سرمایه ثبت‌شده» و قیمت فعلی لازم است (ارزش اسمی هر سهم ۱۰۰۰ ریال فرض شده).</div>';
    h += '<div class="sg"><h5>امتیاز فیوتروسکی' + (r.fscore ? ' — ' + fa(r.fscore.n) + ' از ' + fa(r.fscore.of) : '') + '</h5>' + r.piotroski.map(function (x) { return '<div class="pio"><span>' + (x.ok === null ? "◻" : x.ok ? "✅" : "❌") + '</span><span' + (x.ok === null ? ' style="color:var(--mut)"' : '') + '>' + esc(x.label) + '</span></div>'; }).join("") + '</div>';
    if (r.z) h += '<div class="sg"><h5>آلتمن Z″ (بازارهای نوظهور)</h5><div class="line"><span>امتیاز</span><span class="vv">' + r.z.v.toFixed(2) + '</span></div><div class="msg ' + (r.z.zone === "ایمن" ? "ok" : r.z.zone === "خاکستری" ? "w" : "h") + '">' + esc(r.z.zone) + ' (بالای ۵٫۸۵ ایمن، ۴٫۳۵ تا ۵٫۸۵ خاکستری، زیر آن خطر)</div></div>';
    if (r.dupont) h += '<div class="sg"><h5>تجزیه دوپونت</h5><div class="line"><span>ROE = حاشیه سود خالص × گردش دارایی × اهرم</span><span class="vv">' + fa((r.dupont.nm * 100).toFixed(1)) + '٪ × ' + r.dupont.at.toFixed(2) + ' × ' + r.dupont.em.toFixed(2) + ' = ' + fa((r.dupont.roe * 100).toFixed(1)) + '٪</span></div></div>';
    h += '<div class="legend" style="margin:0 12px 8px">این تحلیل حساب مکانیکی بر پایه اعدادی است که وارد کرده‌ای؛ کیفیت اعداد، یادداشت‌های توضیحی، اظهارنظر حسابرس و رویدادهای یک‌باره را باید خودت بخوانی. در اقتصاد تورمی، ارزش دفتری و سود حسابداری معمولاً کم‌برآورد هستند.</div>';
    el.innerHTML = h;
    var ap = root.getElementById("finapply");
    if (ap) ap.onclick = function () {
      if (r.score !== null) STATE.inp.q_fund = r.score >= 55 ? "بله" : "خیر";
      if (r.val.pe) STATE.inp.pe = +r.val.pe.toFixed(2);
      persist(); ap.textContent = "✔ اعمال شد (" + (STATE.inp.q_fund === "بله" ? "بنیاد قابل قبول" : "بنیاد ضعیف") + ")";
    };
  }

  function enterCmp() {
    store.get("compare", function (arr) {
      STATE.cmp = Array.isArray(arr) ? arr : [];
      STATE.view = "cmp"; STATE.showSettings = false;
      renderAll();
    });
  }
  function renderCmpPage() {
    var html = '<div class="panel wide" id="panel"><div class="hd" id="drag"><b>⚖ مقایسه سهم‌ها</b>' +
      '<button id="back" class="wide" title="برگشت به چک‌لیست">→ چک‌لیست</button><button id="min" title="کوچک کردن">—</button></div>' +
      '<div class="bodywrap"><div class="body" id="body">' + riskHtml() + '<div id="cmpbody"></div></div><button class="sbtn up" title="بالا" data-sc="-1">▲</button><button class="sbtn dn" title="پایین" data-sc="1">▼</button></div>' +
      '<div class="foot"><button id="cpy">کپی جدول (برای اکسل)</button><button id="clr">پاک کردن همه</button></div></div>';
    mount.innerHTML = html;
    bind();
    updateRiskUi();
    update();
  }

  function riskLabel(a) {
    return a <= 2 ? "خیلی محتاط" : a <= 4 ? "محتاط" : a <= 6 ? "متعادل" : a <= 8 ? "ریسک‌پذیر" : "خیلی ریسک‌پذیر";
  }
  function fa(n) { return String(n).replace(/\d/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[d]; }); }
  function riskKeysMeta() { return OC.SETTINGS_META.filter(function (m) { return !!OC.RISK_KEYS[m[0]]; }); }
  function manualCount() { return Object.keys(OC.RISK_KEYS).filter(function (k) { return STATE.st[k] !== undefined; }).length; }
  function riskHtml() {
    var a = STATE.st.risk !== undefined ? STATE.st.risk : 5;
    return '<div class="risk ' + (STATE.riskOpen ? "open" : "") + '" id="riskcard"><div class="rh" id="rh"><span class="num">🎚</span><span class="tt">ریسک‌پذیری من</span>' +
      '<span class="cnt" id="mcnt"></span><span class="rl"><span id="rv">' + fa(a) + '</span> از ۱۰ — <span id="rl">' + riskLabel(a) + '</span></span></div>' +
      '<div class="rbody"><input type="range" min="1" max="10" step="1" value="' + a + '" id="riskr"><div class="ends"><span>محتاط</span><span>ریسک‌پذیر</span></div>' +
      '<div class="rs" id="rsum"></div>' +
      '<button class="thr-t" id="thrt"><span>تنظیم دستی آستانه‌ها</span><span>' + (STATE.showThr ? "▴" : "▾") + '</span></button>' +
      (STATE.showThr ? thrHtml() : "") + '</div></div>';
  }
  function thrHtml() {
    var h = '<div class="thr"><div class="hint">مقدارها با اسلایدر عوض می‌شوند. هر کدام را خودت تایپ کنی ثابت می‌ماند (با ↺ دوباره خودکار می‌شود).</div><div class="tg">';
    riskKeysMeta().forEach(function (m) {
      h += '<div class="trow"><label>' + esc(m[1]) + '</label><div class="ir"><input data-s="' + m[0] + '" data-kind="' + m[3] + '" data-r="1" inputmode="decimal">' +
        '<button class="rst" data-rst="' + m[0] + '" title="برگرد به خودکار">↺</button></div></div>';
    });
    return h + '</div><button class="all" id="allauto">همه را خودکار کن</button></div>';
  }
  function pctTxt(x) { return +(x * 100).toFixed(1) + "٪"; }
  function updateRiskUi() {
    var eff = OC.effective(STATE.st);
    var rv = root.getElementById("rv"), rl = root.getElementById("rl"), rs = root.getElementById("rsum"), mc = root.getElementById("mcnt");
    if (rv) rv.textContent = fa(eff.risk);
    if (rl) rl.textContent = riskLabel(eff.risk);
    if (rs) rs.textContent = "حداکثر ریسک هر معامله " + pctTxt(eff.riskpct) + " سرمایه · حداقل سود به ریسک " + eff.rrmin + " · حداقل امتیاز تکنیکال " + eff.minscore + " · حداکثر سهم در یک سهم " + pctTxt(eff.maxpos) + " · تا " + eff.maxwarn + " هشدار";
    if (mc) { var n = manualCount(); mc.textContent = n ? fa(n) + " دستی" : ""; mc.style.display = n ? "" : "none"; }
    var active = root.activeElement;
    root.querySelectorAll("[data-r]").forEach(function (el) {
      var k = el.dataset.s, man = STATE.st[k] !== undefined;
      el.classList.toggle("man", man);
      var rst = root.querySelector('[data-rst="' + k + '"]');
      if (rst) rst.classList.toggle("show", man);
      if (el === active) return;
      var v = man ? STATE.st[k] : eff[k];
      el.value = el.dataset.kind === "pct" ? +(v * 100).toFixed(2) : v;
    });
  }

  // ---- رندر اسکلت (فقط وقتی نوع یا حالت باز/بسته عوض شد)

  // ================= ناوبری: نوار پایین (۵ بخش) + زیرتب‌ها =================
  var NAV = [
    { id: "find", ic: "🔍", lb: "یافتن", items: [["scr", "🔍 یافتن سهم"]] },
    { id: "an", ic: "📊", lb: "تحلیل", items: [["simple", "🎯 ساده"], ["chart", "📈 نمودار"], ["fin", "🏦 مالی"], ["cdl", "📢 کدال"]] },
    { id: "buy", ic: "🛒", lb: "خرید", items: [["main", "✅ چک‌لیست"], ["sug", "💡 پیشنهاد"], ["swt", "🌊 نوسان‌گیری"]] },
    { id: "hold", ic: "📤", lb: "نگهداری", items: [["hold", "📤 دارم؛ بفروشم؟"], ["pf", "📒 پورتفو"]] },
    { id: "opt", ic: "🧭", lb: "اختیار", items: [["adv", "🧭 اختیارها"]] },
  ];
  var NAV_OF = { scr: "find", simple: "an", chart: "an", fin: "an", cdl: "an", main: "buy", sug: "buy", swt: "buy", hold: "hold", pf: "hold", adv: "opt" };
  function ctxText() {
    if (isMktPage()) return "دیده‌بان بازار";
    var n = STATE.inp && STATE.inp.name_o, s = STATE.inp && STATE.inp.S;
    return n ? n + (s ? " · " + fa(fnum(s)) : "") : "نماد خوانده نشده";
  }
  function dockHtml() {
    if (isMktPage()) return "";
    var g = NAV_OF[STATE.view] || "buy", grp = NAV.filter(function (x) { return x.id === g; })[0] || NAV[2];
    var sub = grp.items.length > 1 ? '<div class="sub">' + grp.items.map(function (it) {
      return '<button data-t="' + it[0] + '" class="' + (STATE.view === it[0] ? "on" : "") + '">' + it[1] + '</button>';
    }).join("") + '</div>' : "";
    var nav = '<nav class="nav">' + NAV.map(function (x) {
      return '<button data-g="' + x.id + '" class="' + (x.id === g ? "on" : "") + '"><span class="ic">' + x.ic + '</span><span class="lb2">' + x.lb + '</span></button>';
    }).join("") + '</nav>';
    return '<div class="dock">' + sub + nav + '</div>';
  }
  function goTab(t) {
    if (t === "trend" || t === "pull" || t === "break") { STATE.type = t; if (STATE.view !== "sug") STATE.view = "main"; STATE.showSettings = false; persist(); renderAll(); return; }
    STATE.navLast = STATE.navLast || {}; STATE.navLast[NAV_OF[t] || "buy"] = t;
    if (t === "sug") { enterSug(); return; }
    if (t === "fin") { enterFin(); return; }
    if (t === "cdl") { enterCdl(); return; }
    STATE.view = t; STATE.showSettings = false; renderAll();
  }

  function renderAll() {
    if (STATE.collapsed) {
      mount.innerHTML = '<button class="mini" id="expand">' + (window.ComboLogo ? window.ComboLogo(18) : "📋") + ' دیده‌بان · سهام</button>';
      mount.querySelector("#expand").onclick = function () { STATE.collapsed = false; window.ComboLazy.activate(); renderAll(); if (LZ.kick) LZ.kick(); };
      return;
    }
    if (STATE.view === "cmp") { renderCmpPage(); return; }
    var titles = STEP_TITLES();
    var digits = "۰۱۲۳۴۵۶۷۸۹";
    var html = '<div class="panel' + ((STATE.view === "chart" || STATE.view === "fin" || STATE.view === "adv" || STATE.view === "cdl" || STATE.view === "hold" || STATE.view === "simple" || STATE.view === "scr" || STATE.view === "swt" || STATE.view === "pf") ? " wide" : "") + '" id="panel"><div class="hd" id="drag"><span class="lg">' + (window.ComboLogo ? window.ComboLogo(22) : "📋") + '</span><div class="ttl"><b>دیده‌بان بورس</b><span class="ctx" id="ctx">' + esc(ctxText()) + '</span></div>' +
      (isMktPage() ? "" : '<button id="fill" title="به‌روزرسانی داده‌های سهم از سایت">🔄</button>') +
      '<button id="cmpb" title="مقایسه سهم‌ها">⚖<span class="n" id="cmpn">' + cmpCount() + '</span></button>' +
      '<button id="gear" title="تنظیمات و پشتیبان‌گیری">⚙</button><button id="min" title="کوچک کردن">—</button></div>' +
      (STATE.view === "main" ? '<div class="verdict v-wait" id="verdict"></div>' : '') +
      ((STATE.view === "main" || STATE.view === "sug") && !STATE.showSettings ? '<div class="seg" title="الگوی ورود"><span class="lb">الگوی ورود</span>' + [["trend", "روندی"], ["pull", "اصلاح"], ["break", "شکست"]].map(function (m) {
        return '<button data-t="' + m[0] + '" class="' + (STATE.type === m[0] ? "on" : "") + '">' + m[1] + '</button>';
      }).join("") + '</div>' : '') +
      '<div class="bodywrap"><div class="body" id="body">' + ((STATE.view === "chart" || STATE.view === "fin" || STATE.view === "adv" || STATE.view === "cdl" || STATE.view === "hold" || STATE.view === "simple" || STATE.view === "scr" || STATE.view === "swt" || STATE.view === "pf") ? "" : riskHtml());
    if (STATE.view === "chart") {
      html += '<div id="chartbody"></div>';
    } else if (STATE.view === "cdl") {
      html += '<div id="cdlbody"></div>';
    } else if (STATE.view === "fin") {
      html += '<div id="finbody"></div>';
    } else if (STATE.view === "sug") {
      html += '<div id="sugbody"></div>';
    } else if (STATE.view === "hold") {
      html += '<div id="holdbody"></div>';
    } else if (STATE.view === "scr") {
      html += '<div id="scrbody"></div>';
    } else if (STATE.view === "swt") {
      html += '<div id="swtbody"></div>';
    } else if (STATE.view === "pf") {
      html += '<div id="pfbody"></div>';
    } else if (STATE.view === "simple") {
      html += '<div id="simplebody"></div>';
    } else if (STATE.view === "adv") {
      html += '<div id="advbody"></div>';
    } else if (STATE.showSettings) {
      html += '<div class="set"><h4>تنظیمات</h4><div class="note">آستانه‌های ریسک از بخش «تنظیم دستی آستانه‌ها» زیر اسلایدر عوض می‌شوند. اینجا فقط کارمزدها و مقدارهای ثابت است. کارمزدها تقریبی‌اند؛ با کارگزاری‌ات تطبیق بده.</div>';
      OC.SETTINGS_META.forEach(function (m) {
        if (OC.RISK_KEYS[m[0]]) return;
        var v = STATE.st[m[0]] !== undefined ? STATE.st[m[0]] : m[2];
        var shown = m[3] === "pct" ? +(v * 100).toFixed(4) : v;
        html += '<div class="trow"><label>' + esc(m[1]) + '</label><input data-s="' + m[0] + '" data-kind="' + m[3] + '" value="' + shown + '"></div>';
      });
      html += '<div class="note" style="margin-top:8px">💾 پشتیبان‌گیری از همه‌ی اطلاعات ذخیره‌شده‌ی افزونه (نمادها، جدول‌های مالی، تنظیمات). اگر مرورگر پاک شد یا کامپیوتر عوض کردی، از همین فایل برمی‌گردانی.</div><div class="fset"><button class="btn" id="bkexp">خروجی گرفتن</button><button class="btn" id="bkimp">وارد کردن از فایل</button></div><input type="file" id="bkfile" accept=".json,application/json" style="display:none">';
      html += '<button class="all" id="resetset">بازگشت همه تنظیمات به پیش‌فرض</button></div>';
    } else {
      html += '<div class="note">اعداد بازار و سابقه ۲۵۰ روزه خودکار خوانده می‌شوند. اگر عددی نیامد، آن را روی صفحه انتخاب کن و ⌖ را بزن.</div><div class="rep" id="rep"></div>';
      STEPS.forEach(function (st_, i) {
        html += '<div class="step ' + (STATE.open[i] ? "open" : "") + '" data-n="' + i + '"><div class="sh"><span class="num">' + digits[i] + '</span><span class="tt">' +
          esc(titles[i].replace(/^مرحله [۰-۹]+ — /, "")) + '</span><span class="badge" id="badge' + i + '"></span></div><div class="sc"><div class="grid">';
        FIELDS.forEach(function (f) {
          if (f.step !== i) return;
          if (!fieldShown(f, STATE.type)) return;
          html += '<div class="fld' + (f.t === "yn" ? " full" : "") + '"><label>' + esc(fieldLabel(f, STATE.type)) + '</label>';
          if (f.t === "yn") {
            html += '<div class="yn" data-yn="' + f.k + '"><button data-v="بله">بله</button><button data-v="خیر">خیر</button></div>' + (f.k === "q_event" ? '<div class="legend" id="evnote" style="margin:3px 0 0"></div>' : "");
          } else {
            html += '<div class="ctl"><input data-k="' + f.k + '" class="' + (f.t === "text" ? "txt" : "") + '" inputmode="' + (f.t === "text" ? "text" : "decimal") + '">';
            if (f.sel) html += '<button class="pick" data-pick="' + f.k + '" title="پر کردن با عدد انتخاب‌شده روی صفحه">⌖</button>';
            html += '</div>';
          }
          html += '</div>';
        });
        html += '</div><div class="calc" id="calc' + i + '"></div><div id="msgs' + i + '"></div></div></div>';
      });
    }
    html += '' + (STATE.view === "main" && !isMktPage() ? '<div class="acts"><button id="savecmp" class="pri">➕ ذخیره برای مقایسه</button><button id="reset">پاک کردن ورودی‌ها</button><button id="diag">گزارش اشکال</button></div>' : '') +
      '</div><button class="sbtn up" title="بالا" data-sc="-1">▲</button><button class="sbtn dn" title="پایین" data-sc="1">▼</button></div>' +
      dockHtml() + '</div>';
    mount.innerHTML = html;
    bind();
    hydrateInputs();
    updateRiskUi();
    update();
  }

  function hydrateInputs() {
    var en = root.getElementById("evnote"); if (en) en.textContent = STATE.inp.q_event_auto || "";
    root.querySelectorAll("[data-yn]").forEach(function (g) {
      var cur = STATE.inp[g.dataset.yn];
      g.querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === cur); });
    });
    root.querySelectorAll("[data-k]").forEach(function (el) {
      var f = FIELDS.filter(function (x) { return x.k === el.dataset.k; })[0];
      var v = STATE.inp[el.dataset.k];
      if (v === undefined || v === null) { el.value = ""; return; }
      el.value = f.t === "pct" ? +(v * 100).toFixed(4) : v;
    });
  }

  function readField(el) {
    var f = FIELDS.filter(function (x) { return x.k === el.dataset.k; })[0];
    if (f.t === "yn" || f.t === "text") return el.value;
    var n = parseNum(el.value);
    if (n === null) return null;
    return f.t === "pct" ? n / 100 : n;
  }

  function bind() {
    var q = function (s) { return root.querySelector(s); };
    var gear = q("#gear"); if (gear) gear.onclick = function () { STATE.view = "main"; STATE.showSettings = !STATE.showSettings; renderAll(); };
    var min = q("#min"); if (min) min.onclick = function () { STATE.collapsed = true; renderAll(); };
    var vv = q("#verdict"); if (vv) vv.onclick = function () { STATE.vdetOpen = !STATE.vdetOpen; update(); };
    root.querySelectorAll(".dock [data-t], .seg [data-t]").forEach(function (b) { b.onclick = function () { goTab(b.dataset.t); }; });
    root.querySelectorAll(".dock [data-g]").forEach(function (b) {
      b.onclick = function () {
        var g = b.dataset.g, grp = NAV.filter(function (x) { return x.id === g; })[0], last = STATE.navLast && STATE.navLast[g];
        var t = grp.items.some(function (it) { return it[0] === last; }) ? last : grp.items[0][0];
        goTab(t);
      };
    });
    root.querySelectorAll(".step .sh").forEach(function (h) {
      h.onclick = function () {
        var s = h.parentNode, n = s.dataset.n, willOpen = !STATE.open[n];
        STATE.open = {};
        root.querySelectorAll(".step").forEach(function (x) { x.classList.remove("open"); });
        if (willOpen) { STATE.open[n] = true; s.classList.add("open"); }
      };
    });
    root.querySelectorAll("[data-k]").forEach(function (el) {
      var h = function () { STATE.inp[el.dataset.k] = readField(el); persist(); update(); };
      el.addEventListener("input", h);
      el.addEventListener("change", h);
    });
    root.querySelectorAll("[data-yn]").forEach(function (g) {
      g.querySelectorAll("button").forEach(function (b) {
        b.onclick = function () {
          var k = g.dataset.yn;
          STATE.inp[k] = STATE.inp[k] === b.dataset.v ? "" : b.dataset.v;
          if (k === "q_event") { STATE.inp.q_event_man = 1; if (!STATE.inp.q_event) { STATE.inp.q_event_man = 0; setTimeout(autoEvent, 0); } }
          persist(); hydrateInputs(); update();
        };
      });
    });
    var rh = q("#rh"); if (rh) rh.onclick = function () {
      STATE.riskOpen = !STATE.riskOpen; persistUi();
      q("#riskcard").classList.toggle("open", STATE.riskOpen);
    };
    var thrt = q("#thrt"); if (thrt) thrt.onclick = function () { STATE.showThr = !STATE.showThr; renderAll(); };
    var allauto = q("#allauto"); if (allauto) allauto.onclick = function () {
      Object.keys(OC.RISK_KEYS).forEach(function (k) { delete STATE.st[k]; });
      persistSettings(); updateRiskUi(); update();
    };
    root.querySelectorAll("[data-rst]").forEach(function (b) {
      b.onclick = function () { delete STATE.st[b.dataset.rst]; persistSettings(); updateRiskUi(); update(); };
    });
    root.querySelectorAll("[data-pick]").forEach(function (b) {
      b.addEventListener("mousedown", function (e) { e.preventDefault(); });
      b.onclick = function () {
        var n = parseNum(lastSel || selText());
        var input = root.querySelector('[data-k="' + b.dataset.pick + '"]');
        if (n === null) { input.style.outline = "2px solid #c00"; setTimeout(function () { input.style.outline = ""; }, 900); return; }
        input.value = n; STATE.inp[b.dataset.pick] = n; persist(); update();
        input.style.outline = "2px solid #2e9a4a"; setTimeout(function () { input.style.outline = ""; }, 700);
      };
    });
    root.querySelectorAll("[data-s]").forEach(function (el) {
      el.addEventListener("input", function () {
        var k = el.dataset.s, isRisk = !!OC.RISK_KEYS[k];
        var n = parseNum(el.value);
        if (String(el.value).trim() === "") {
          if (isRisk) { delete STATE.st[k]; persistSettings(); updateRiskUi(); update(); }
          return;
        }
        if (n === null) return;
        STATE.st[k] = el.dataset.kind === "pct" ? n / 100 : n;
        persistSettings(); updateRiskUi(); update();
      });
      el.addEventListener("blur", function () { updateRiskUi(); });
    });
    var rr_ = q("#riskr");
    if (rr_) rr_.addEventListener("input", function () {
      STATE.st.risk = Number(rr_.value); persistSettings(); updateRiskUi(); update();
    });
    var bke = q("#bkexp"), bki = q("#bkimp"), bkf = q("#bkfile");
    if (bke) bke.onclick = function () {
      allStored(function (all) {
        var blob = new Blob([JSON.stringify({ app: "bourse-combo", v: 1, at: Date.now(), data: all })], { type: "application/json" });
        var a = document.createElement("a"), d = new Date();
        a.href = URL.createObjectURL(blob); a.download = "bourse-backup-" + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + ".json";
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      });
    };
    if (bki && bkf) {
      bki.onclick = function () { bkf.click(); };
      bkf.onchange = function () {
        var file = bkf.files && bkf.files[0]; if (!file) return;
        var rd = new FileReader();
        rd.onload = function () {
          var j; try { j = JSON.parse(String(rd.result)); } catch (e) { alert("فایل معتبر نیست."); return; }
          if (!j || j.app !== "bourse-combo" || !j.data) { alert("این فایل پشتیبان این افزونه نیست."); return; }
          var n = Object.keys(j.data).length;
          if (!confirm(fa(n) + " مورد از فایل جایگزین اطلاعات هم‌نام فعلی می‌شود. ادامه بدهم؟")) return;
          restoreStored(j.data, function () { alert("بازیابی شد. صفحه دوباره بارگذاری می‌شود."); location.reload(); });
        };
        rd.readAsText(file);
      };
    }
    var rs = q("#resetset"); if (rs) rs.onclick = function () { STATE.st = {}; persistSettings(); renderAll(); };
    if (q("#reset")) q("#reset").onclick = function () { if (confirm("همه ورودی‌های این صفحه پاک شود؟")) { STATE.inp = {}; persist(); renderAll(); } };
    if (q("#fill")) q("#fill").onclick = function () { runAuto(false); };
    if (q("#diag")) q("#diag").onclick = copyDiag;
    var cmpb = q("#cmpb"); if (cmpb) cmpb.onclick = enterCmp;
    var savecmp = q("#savecmp"); if (savecmp) savecmp.onclick = function () { saveCmp(savecmp); };
    var back = q("#back"); if (back) back.onclick = function () { STATE.view = "main"; renderAll(); };
    var cpy = q("#cpy"); if (cpy) cpy.onclick = function () {
      var t = STATE.tsv || "";
      try { navigator.clipboard.writeText(t).then(function () { cpy.textContent = "✔ کپی شد"; setTimeout(function () { cpy.textContent = "کپی جدول (برای اکسل)"; }, 1300); }, function () { prompt("این متن را کپی کن:", t); }); }
      catch (e) { prompt("این متن را کپی کن:", t); }
    };
    var clr = q("#clr"); if (clr) clr.onclick = function () {
      if (confirm("همه سهم‌های ذخیره‌شده برای مقایسه پاک شود؟")) { store.set("compare", []); STATE.cmp = []; renderCmpBody(); }
    };
    // جابه‌جایی پنل
    var drag = q("#drag");
    if (drag) drag.addEventListener("mousedown", function (e) {
      if (e.target.tagName === "BUTTON") return;
      var r = host.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      function mv(ev) { host.style.right = "auto"; host.style.left = Math.max(0, ev.clientX - dx) + "px"; host.style.top = Math.max(0, ev.clientY - dy) + "px"; }
      function up() { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); }
      document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
    });
  }

  // ---- به‌روزرسانی نتایج (بدون بازسازی ورودی‌ها)
  function update() {
    if (STATE.collapsed) return;
    var cx = root.getElementById("ctx"); if (cx) cx.textContent = ctxText();
    if (STATE.view === "cmp") { renderCmpBody(); return; }
    if (STATE.showSettings) return;
    var res = OC.evaluate(STATE.type, STATE.inp, STATE.st, STATE.an);
    var v = root.getElementById("verdict");
    if (v) {
      var cls = { "✅": "v-ok", "❌": "v-bad", "⚠": "v-warn", "⏳": "v-wait" }[res.final.sym];
      v.className = "verdict " + cls;
      v.textContent = "«" + MODE_LABEL[STATE.type] + "»: " + res.final.sym + " " + res.final.text;
      window.AdvisorUI.paintVerdict(root, STATE, res, STEP_TITLES());
    }
    if (STATE.view === "sug") { renderSugBody(); return; }
    if (STATE.view === "hold") { if (!root.getElementById("holdform")) renderHoldBody(); else renderHoldResult(); return; }
    if (STATE.view === "scr") { if (!root.getElementById("scrform")) renderScrBody(); return; }
    if (STATE.view === "swt") { if (!root.getElementById("swtform")) renderSwtBody(); else renderSwtResult(); return; }
    if (STATE.view === "pf") { if (!root.getElementById("pfform")) renderPfBody(); return; }
    if (STATE.view === "simple") { if (!root.getElementById("simpleform")) renderSimpleBody(); else renderSimpleResult(); return; }
    if (STATE.view === "adv") { var ab = root.getElementById("advbody"); if (ab && !ab.firstChild) advUI.mount(ab); else advUI.refresh(); return; }
    if (STATE.view === "chart") { renderChartBody(); return; }
    if (STATE.view === "cdl") { renderCdl(); return; }
    if (STATE.view === "fin") { var fb = root.getElementById("finbody"); if (fb && !fb.firstChild) renderFinBody(); else renderFinResult(); return; }
    for (var i = 0; i < 7; i++) {
      var badge = root.getElementById("badge" + i);
      var calc = root.getElementById("calc" + i);
      var msgs = root.getElementById("msgs" + i);
      if (!calc) continue;
      var stp = res.steps[i];
      if (badge) badge.textContent = stp ? stp.status : "";
      calc.innerHTML = res.rows.filter(function (r) { return r.step === i; }).map(function (r) {
        return '<div class="cr" title="' + esc(r.help) + '"><span>' + esc(r.label) + '</span><span>' + esc(fmt(r.v, r.fmt)) + '</span></div>';
      }).join("");
      var m = "";
      if (stp) {
        if (stp.missing) m = '<div class="msg wait">⏳ ورودی ناقص — خانه‌های خالی این مرحله را پر کن</div>';
        else {
          stp.hard.forEach(function (t) { m += '<div class="msg h">❌ ' + esc(t) + "</div>"; });
          stp.warn.forEach(function (t) { m += '<div class="msg w">⚠ ' + esc(t) + "</div>"; });
          if (!stp.hard.length && !stp.warn.length) m = '<div class="msg ok">✅ عبور</div>';
        }
      }
      if (i === 4 && res.R.pSug !== null && res.R.pSug !== undefined) {
        var sug = Math.floor(res.R.pSug * 20) / 20;
        m += '<button class="usep" data-usep="' + sug + '">استفاده از احتمال مرجع (' + Math.round(sug * 100) + '٪) به‌عنوان احتمال من</button>';
      }
      msgs.innerHTML = m;
    }
  }

  // ---- خواندن خودکار اعداد از سایت
  var DIAG = [];
  var autoBusy = false;
  function showReport(items) {
    var el = root.getElementById("rep");
    if (!el) return;
    el.innerHTML = items.map(function (r) {
      return '<div class="' + (r.ok === true ? "o" : r.ok === false ? "x" : "t") + '">' + (r.ok === true ? "✔ " : r.ok === false ? "✖ " : "") + esc(r.t) + "</div>";
    }).join("");
  }
  function pageText() {
    return (document.title || "") + "\n" + (document.body ? document.body.innerText : "");
  }
  async function runAuto(silent) {
    if (autoBusy) return;
    autoBusy = true;
    try {
      DIAG = ["url: " + location.href, "time: " + new Date().toISOString()];
      var code = OCC.insCodeFromUrl(location.href);
      DIAG.push("insCode=" + code);
      if (!code) {
        if (!silent) showReport([{ ok: false, t: "این صفحه، صفحه نماد نیست. صفحه یک سهم را باز کن." }]);
        return;
      }
      if (OCC.isOptionText(pageText())) {
        if (!silent) showReport([{ ok: false, t: "این صفحه اختیار معامله است؛ برای آن از افزونه چک‌لیست اختیار استفاده کن." }]);
        return;
      }
      showReport([{ t: "در حال خواندن از سایت…" }]);
      var myKey = pageKey;
      var res = await OCC.collect(code, DIAG);
      if (myKey !== pageKey) return;   // در حین خواندن نماد عوض شد
      Object.keys(res.inp).forEach(function (k) { STATE.inp[k] = res.inp[k]; });
      if (res.an && (res.an.bars || res.an.power !== undefined)) STATE.an = res.an;
      persist();
      renderAll();
      showReport(res.rep);
    } catch (e) {
      DIAG.push("EXCEPTION " + e);
      showReport([{ ok: false, t: "خطا در خواندن: " + e }]);
    } finally { autoBusy = false; }
  }
  function copyDiag() {
    var txt = DIAG.join("\n");
    try { navigator.clipboard.writeText(txt).then(function () { alert("گزارش کپی شد؛ همین را برای من بفرست."); }, function () { prompt("این متن را کپی کن:", txt); }); }
    catch (e) { prompt("این متن را کپی کن:", txt); }
  }

  root.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest("[data-usep]");
    if (!b) return;
    STATE.inp.p = Number(b.dataset.usep); persist(); hydrateInputs(); update();
  });


  // ================= مشاور ترکیبی: اختیارهای همین سهم =================
  function advCtx() {
    return {
      S: Number(STATE.inp.S) > 0 ? Number(STATE.inp.S) : null,
      an: STATE.an, stockInp: STATE.inp, stockSt: STATE.st, optSt: null, fin: finViewNow(),
      baseSym: STATE.inp.name_o || null, currentCode: null,
    };
  }
  var advUI = window.AdvisorUI.create(root, { getContext: advCtx, origin: location.origin, onApply: null });

  // ---- شروع: پنل فقط روی صفحه سهم نشان داده می‌شود (روی صفحه اختیار پنهان است)
  function isMktPage() { return /marketwatch/i.test(location.pathname + location.hash); }
  function isStockPage() { return isMktPage() || (!!OCC.insCodeFromUrl(location.href) && !OCC.isOptionText(pageText())); }
  store.get("compare", function (c) { STATE.cmp = Array.isArray(c) ? c : []; refreshCmpBadge(); });
  store.get("ui", function (u) { if (u && u.riskOpen !== undefined) STATE.riskOpen = !!u.riskOpen; });
  var LZ = { kick: null };
  mount.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest(".sbtn") : null; if (!b) return;
    var bd = root.getElementById("body"); if (bd) bd.scrollBy({ top: Number(b.dataset.sc) * Math.max(120, bd.clientHeight * 0.6), behavior: "smooth" });
  });
  store.get("settings", function (s) {
    STATE.st = s || {};
    loadSymbol(function (cached) {
      if (isMktPage()) STATE.view = "scr";
      renderAll();   // پیش‌فرض بسته: فقط دکمه‌ی کوچک؛ خواندن از سایت بعد از اولین باز کردن شروع می‌شود
      var visible = false, decided = false, checks = 0, stable = 0, ran = cached, lastHref = location.href;
      host.style.display = "none";
      var noted = false;
      LZ.kick = function () { if (!visible || STATE.collapsed) return; if (isMktPage()) { STATE.view = "scr"; if (!root.getElementById("scrform")) renderAll(); return; } if (!ran) { ran = true; runAuto(true).then(function () { cdlEnsure(false, autoEvent); }); } else if (!noted) { noted = true; cachedNote(); cdlEnsure(false, autoEvent); } };
      // تایمر سبک: متن صفحه فقط تا وقتی نوع صفحه معلوم نشده خوانده می‌شود (حداکثر ~۲۵ ثانیه)، بعد از آن هیچ کاری نمی‌کند
      setInterval(function () {
        if (location.href !== lastHref) {
          lastHref = location.href;
          var nk = keyNow();
          if (nk === pageKey) return;      // فقط hash/پارامتر فرعی عوض شده؛ همان نماد
          persist();
          pageKey = nk;
          visible = false; decided = false; checks = 0; stable = 0; ran = false; host.style.display = "none";
          loadSymbol(function (c2) { ran = c2; noted = false; STATE.view = isMktPage() ? "scr" : "main"; renderAll(); });
          return;
        }
        if (!symLoaded || decided) return;
        checks++;
        var should = isStockPage();
        stable = should ? stable + 1 : 0;
        if (should && stable >= 2) { visible = true; decided = true; host.style.display = ""; LZ.kick(); }
        else if (checks > 16) decided = true;
      }, 1500);
    });
  });
})();

}catch(e){try{console.error('didehban:content-stock.js',e)}catch(_){}}

;try{
/* پنل شناور چک‌لیست اختیار معامله */
(function () {
  "use strict";
  var OC = window.OptionChecklist, OCC = window.OCCollect;
  if (!OC || !OCC) return;

  // ---- انتخاب متن: فریم‌های داخلی، متن انتخاب‌شده را به فریم اصلی می‌فرستند
  var lastSel = "";
  function selText() {
    try { return String(window.getSelection() || "").trim(); } catch (e) { return ""; }
  }
  if (window.top !== window) {
    document.addEventListener("selectionchange", function () {
      var t = selText();
      if (t) { try { window.top.postMessage({ __ocSel: t }, "*"); } catch (e) {} }
    });
    return;
  }
  if (window.__ocLoaded) return;
  window.__ocLoaded = true;
  window.addEventListener("message", function (e) {
    if (e.data && typeof e.data.__ocSel === "string") lastSel = e.data.__ocSel;
  });
  document.addEventListener("selectionchange", function () {
    var t = selText();
    if (t) lastSel = t;
  });

  // ---- ذخیره‌سازی (chrome.storage یا localStorage)
  var store = {
    get: function (k, cb) {
      try {
        if (window.chrome && chrome.storage && chrome.storage.local) {
          var kk = "O." + k;
          chrome.storage.local.get(kk, function (r) { cb(r && r[kk]); });
          return;
        }
      } catch (e) {}
      try { cb(JSON.parse(localStorage.getItem("oc:" + k))); } catch (e) { cb(null); }
    },
    set: function (k, v) {
      try {
        if (window.chrome && chrome.storage && chrome.storage.local) { var o = {}; o["O." + k] = v; chrome.storage.local.set(o); return; }
      } catch (e) {}
      try { localStorage.setItem("oc:" + k, JSON.stringify(v)); } catch (e) {}
    },
  };

  // ---- اعداد فارسی و ورودی
  function toLatin(s) {
    return String(s)
      .replace(/[۰-۹]/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹".indexOf(d); })
      .replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); })
      .replace(/[٬,،]/g, "").replace(/٫/g, ".");
  }
  function parseNum(s) {
    var t = toLatin(s).replace(/[^\d.\-]/g, "");
    if (t === "" || t === "-" || t === ".") return null;
    var v = Number(t);
    return isFinite(v) ? v : null;
  }

  // ---- تعریف فیلدها
  var STEPS = [
    { n: 0, title: "مشخصات" },
    { n: 1, title: "سهم پایه" },
    { n: 2, title: "بازار اختیار" },
    { n: 3, title: "قیمت و زمان" },
    { n: 4, title: "سود و زیان" },
    { n: 5, title: "اندازه معامله" },
    { n: 6, title: "برنامه خروج" },
  ];
  function isSell(m) { return m === "scall" || m === "sput"; }
  var MODE_LABEL = { call: "خرید Call", put: "خرید Put", scall: "فروش Call", sput: "فروش Put" };
  // a: در هر چهار حالت | sellOnly: فقط فروش | putOnly: فقط خرید Put | بقیه: فقط خرید
  var FIELDS = [
    { k: "capital", step: 0, a: 1, t: "num", l: "سرمایه کل من برای بورس (ریال)", sel: 0 },
    { k: "name_o", step: 0, a: 1, t: "text", l: "نماد اختیار" },
    { k: "S", step: 0, a: 1, t: "num", l: "آخرین معامله سهم پایه (ریال)", sel: 1 },
    { k: "K", step: 0, a: 1, t: "num", l: "قیمت اعمال (ریال)", sel: 1 },
    { k: "ask", step: 0, a: 1, t: "num", sel: 1, l: function (m) { return isSell(m) ? "بهترین قیمت فروش اختیار — قیمتی که فروشنده‌ها می‌خواهند (ریال)" : "بهترین قیمت فروش اختیار — قیمتی که می‌خری (ریال)"; } },
    { k: "bid", step: 0, a: 1, t: "num", sel: 1, l: function (m) { return isSell(m) ? "بهترین قیمت خرید اختیار — قیمتی که اگر همین الان بفروشی می‌گیری (ریال)" : "بهترین قیمت خرید اختیار — قیمتی که می‌فروشی (ریال)"; } },
    { k: "cal_days", step: 0, a: 1, t: "num", l: "روز تقویمی تا سررسید", sel: 1 },
    { k: "tdov", step: 0, a: 1, t: "num", l: "روز معاملاتی تا سررسید (اختیاری، دقیق‌تر)", sel: 1 },
    { k: "q_thesis", step: 1, t: "yn", l: "دلیل مشخص و مکتوب برای حرکت سهم دارم" },
    { k: "q_ok", step: 1, sellOnly: 1, t: "yn", l: function (m) { return m === "scall" ? "حاضرم سهم را به قیمت اعمال بفروشم (و از سود بیشتر سهم بگذرم)" : "حاضرم سهم را به قیمت اعمال بخرم و نگه دارم"; } },
    { k: "q_halt", step: 1, a: 1, t: "yn", l: "سهم پایه الان معامله می‌شود (بسته/متوقف نیست)" },
    { k: "q_queue", step: 1, a: 1, t: "yn", l: "سهم الان در صف قفل سقف/کف است؟" },
    { k: "q_event", step: 1, a: 1, t: "yn", l: "تا سررسید رویداد مهم (مجمع، سود، افزایش سرمایه) دارد؟" },
    { k: "val_u", step: 1, a: 1, t: "num", l: "میانگین ارزش معاملات روزانه سهم پایه (میلیارد ریال)", sel: 1 },
    { k: "vol_o", step: 2, a: 1, t: "num", l: "میانگین حجم روزانه این اختیار (قرارداد)", sel: 1 },
    { k: "T", step: 3, t: "num", l: "قیمت هدف سهم پایه تا سررسید (ریال)", sel: 1 },
    { k: "p", step: 4, t: "pct", l: "احتمال واقع‌بینانه رسیدن سهم به هدف (٪)" },
    { k: "sellp", step: 4, sellOnly: 1, t: "num", l: "قیمتی که می‌خواهم بفروشم (ریال) — خالی = بهترین قیمت خرید" },
    { k: "qty", step: 5, a: 1, t: "num", sel: 1, l: function (m) { return isSell(m) ? "تعداد قراردادی که می‌خواهم بفروشم" : "تعداد قراردادی که می‌خواهم بخرم"; } },
    { k: "bidvol", step: 5, t: "num", l: "حجم صف خرید در بهترین قیمت خرید (قرارداد)", sel: 1 },
    { k: "q_own", step: 5, t: "yn", l: "به اندازه کافی سهم پایه دارم که اعمال کنم", putOnly: true },
    { k: "q_cover", step: 5, sellOnly: 1, t: "yn", l: function (m) { return m === "scall" ? "سهم پایه را به اندازه همه قراردادها دارم (Covered)" : "نقدینگی کامل برای خرید سهم در صورت اعمال را دارم"; } },
    { k: "q_plan", step: 6, a: 1, t: "yn", l: function (m) { return isSell(m) ? "قیمت بازخرید (حد ضرر و حد سود) و زمان تصمیم را نوشتم و اجرا می‌کنم" : "حد ضرر، حد سود و زمان خروج را نوشتم و اجرا می‌کنم"; } },
    { k: "q_lock", step: 6, a: 1, t: "yn", l: function (m) { return isSell(m) ? "می‌دانم اگر سهم قفل شود ممکن است نتوانم اختیار را بخرم و ببندم و می‌پذیرم" : "می‌دانم اگر سهم قفل شود ممکن است نتوانم بفروشم و می‌پذیرم"; } },
    { k: "q_zero", step: 6, a: 1, t: "yn", l: function (m) {
      if (m === "scall") return "می‌پذیرم اگر سهم بالا برود سود بیشتر را از دست بدهم و سهمم به قیمت اعمال فروخته شود";
      if (m === "sput") return "می‌پذیرم اگر سهم بریزد باید به قیمت اعمال بخرم و ضرر کنم";
      return "می‌پذیرم کل پول خرید ممکن است صفر شود"; } },
  ];
  function fieldShown(f, m) {
    if (f.putOnly) return m === "put";
    if (f.sellOnly) return isSell(m);
    if (f.a) return true;
    return !isSell(m);
  }
  function fieldLabel(f, m) { return typeof f.l === "function" ? f.l(m) : f.l; }

  var STATE = { type: "call", inp: {}, st: {}, an: null, open: { 0: true }, collapsed: true, showSettings: false, showThr: false, riskOpen: true, view: "main", cmp: [], vdetOpen: false };
  function legacyKey() { return "draft:" + location.origin + location.pathname + location.search; }
  function keyNow() { var c = OCC.insCodeFromUrl(location.href); return c ? "draft:code:" + c : legacyKey(); }
  var pageKey = keyNow();
  // خواندن با انتقال از کلید قدیمی (بر اساس نشانی صفحه)
  function getDraft(key, cb) {
    store.get(key, function (d) {
      if (d || key === legacyKey()) { cb(d); return; }
      store.get(legacyKey(), function (d2) { if (d2) store.set(key, d2); cb(d2); });
    });
  }

  // ---- فرمت
  function fmt(v, f) {
    if (v === null || v === undefined || (typeof v === "number" && !isFinite(v))) return "—";
    switch (f) {
      case "money": return Math.round(v).toLocaleString("en-US");
      case "int": return String(Math.round(v));
      case "pct0": return (v * 100).toFixed(0) + "٪";
      case "pct1": return (v * 100).toFixed(1) + "٪";
      case "pct2": return (v * 100).toFixed(2) + "٪";
      case "ratio1": return v.toFixed(1) + "×";
      case "ratio2": return v.toFixed(2);
      default: return String(v);
    }
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ---- ظاهر
  var host = document.createElement("div");
  host.id = "oc-checklist-host";
  host.style.cssText = "all:initial;position:fixed;top:12px;left:12px;z-index:2147483647;";
  var root = host.attachShadow({ mode: "open" });
  root.innerHTML =
    '<style>' +
    ':host{all:initial}' +
    '*{box-sizing:border-box;font-family:inherit}' +
    '.panel{' +
    '  --bg:#ffffff;--bg2:#f5f6fb;--fg:#1c2236;--mut:#6a7390;--line:#e7eaf3;--inp:#f1f3f9;--inpf:#ffffff;' +
    '  --acc:#4f46e5;--acc2:#eceeff;--accfg:#ffffff;' +
    '  --ok-bg:#e7f7ee;--ok-fg:#0d6b3b;--bad-bg:#fdebee;--bad-fg:#a3162d;--warn-bg:#fff5dc;--warn-fg:#8a5a00;--wait-bg:#eef0f6;--wait-fg:#59627c;' +
    '  --shadow:0 12px 40px rgba(24,28,60,.22),0 2px 8px rgba(24,28,60,.08);' +
    '  direction:rtl;width:min(560px,96vw);max-height:92vh;display:flex;flex-direction:column;' +
    '  background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);' +
    '  font-size:12.5px;line-height:1.6;overflow:hidden;' +
    '  font-family:"Vazirmatn","Shabnam","Sahel","IBM Plex Sans Arabic","SF Arabic","Segoe UI",system-ui,-apple-system,"Noto Sans Arabic",Tahoma,sans-serif;' +
    '}' +
    '@media (prefers-color-scheme:dark){.panel{' +
    '  --bg:#171b29;--bg2:#10131e;--fg:#e8ebf7;--mut:#98a1be;--line:#2a3047;--inp:#20253a;--inpf:#262c45;' +
    '  --acc:#8b87ff;--acc2:#262a52;--accfg:#12142a;' +
    '  --ok-bg:#12331f;--ok-fg:#7be0a4;--bad-bg:#3a1520;--bad-fg:#ff9aab;--warn-bg:#3a2d10;--warn-fg:#ffd27a;--wait-bg:#232842;--wait-fg:#aab2cf;' +
    '  --shadow:0 12px 40px rgba(0,0,0,.55)}}' +
    'button{cursor:pointer;font-family:inherit}' +
    '.hd{background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;padding:11px 14px;display:flex;align-items:center;gap:6px;cursor:move;user-select:none}' +
    '.hd b{flex:1;font-size:14px;font-weight:700;letter-spacing:.1px}' +
    '.hd button{background:rgba(255,255,255,.18);color:#fff;border:0;border-radius:9px;width:28px;height:28px;font-size:14px;display:grid;place-items:center;padding:0;transition:background .15s}' +
    '.hd button:hover{background:rgba(255,255,255,.32)}' +
    '.verdict{margin:8px 12px 0;padding:9px 12px;font-weight:700;font-size:14px;text-align:center;border-radius:12px;transition:background .2s,color .2s}' +
    '.v-ok{background:var(--ok-bg);color:var(--ok-fg)}.v-bad{background:var(--bad-bg);color:var(--bad-fg)}.v-warn{background:var(--warn-bg);color:var(--warn-fg)}.v-wait{background:var(--wait-bg);color:var(--wait-fg)}' +
    '.tabs{display:flex;gap:3px;background:var(--inp);border-radius:11px;padding:3px;margin:8px 12px 0}' +
    '.tabs button{flex:1;padding:7px 4px;border:0;border-radius:9px;background:transparent;color:var(--mut);font-size:12.5px;font-weight:600;transition:all .15s}' +
    '.tabs button.on{background:var(--bg);color:var(--acc);box-shadow:0 1px 4px rgba(24,28,60,.14)}' +
    '.risk{margin:0 12px 8px;border:1px solid var(--line);border-radius:14px;background:var(--bg);overflow:hidden}' +
    '.risk .rh{display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:pointer;font-weight:700}' +
    '.risk .rh:hover{background:var(--bg2)}' +
    '.risk .rh .num{flex:none;width:23px;height:23px;border-radius:50%;background:var(--acc2);display:grid;place-items:center;font-size:12px}' +
    '.risk .rh .tt{flex:1;font-size:12.5px}' +
    '.risk .rh .rl{color:var(--acc);font-size:12px}' +
    '.risk .rh .cnt{background:var(--acc);color:var(--accfg);border-radius:99px;padding:0 7px;font-size:10.5px}' +
    '.risk .rh::after{content:"‹";color:var(--mut);font-size:16px;transition:transform .2s;transform:rotate(-90deg)}' +
    '.risk.open .rh::after{transform:rotate(90deg)}' +
    '.risk .rbody{display:none;padding:0 12px 11px;border-top:1px solid var(--line)}.risk.open .rbody{display:block}' +
    '.thr .tg{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px 10px}' +
    '.thr .trow{flex-direction:column;align-items:stretch;border-top:0;padding:0;gap:3px}' +
    '.thr .trow label{font-size:11px;color:var(--mut)}.thr .ir{display:flex;gap:4px}.thr .ir input{flex:1;width:auto}' +
    '.sc .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 10px;align-items:end}.sc .grid .full{grid-column:1/-1}' +
    '.risk .rt{display:flex;justify-content:space-between;align-items:baseline;font-weight:700;font-size:12.5px}' +
    '.risk .rt .rl{color:var(--acc);font-weight:700}' +
    '.risk input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:7px;border-radius:99px;direction:ltr;margin:11px 0 5px;outline:none;background:linear-gradient(90deg,#22c55e,#eab308 55%,#ef4444)}' +
    '.risk input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:#fff;border:3px solid var(--acc);box-shadow:0 2px 6px rgba(0,0,0,.3);cursor:grab}' +
    '.risk input[type=range]::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid var(--acc)}' +
    '.risk .ends{display:flex;justify-content:space-between;direction:ltr;font-size:10.5px;color:var(--mut)}' +
    '.risk .rs{font-size:11px;color:var(--mut);line-height:1.8;margin-top:6px}' +
    '.thr-t{margin-top:8px;width:100%;display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border:1px dashed var(--line);border-radius:10px;background:var(--bg);color:var(--acc);font-size:12px;font-weight:600}' +
    '.thr-t:hover{background:var(--acc2)}' +
    '.thr-t .cnt{background:var(--acc);color:var(--accfg);border-radius:99px;padding:0 7px;font-size:10.5px;margin-inline-start:6px}' +
    '.body{overflow:auto;flex:1;padding:8px 0 2px;margin-top:4px}' +
    '.thr{margin:0 12px 10px;padding:8px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:13px}' +
    '.thr .hint{font-size:11px;color:var(--mut);margin:0 0 6px;line-height:1.8}' +
    '.trow{display:flex;align-items:center;gap:6px;padding:4px 0;border-top:1px solid var(--line)}' +
    '.trow:first-of-type{border-top:0}' +
    '.trow label{flex:1;font-size:11.5px;color:var(--fg)}' +
    '.trow input{width:74px;padding:5px 6px;border:1.5px solid transparent;background:var(--inp);color:var(--mut);border-radius:8px;direction:ltr;text-align:center;font-size:12px;font-variant-numeric:tabular-nums;outline:none}' +
    '.trow input.man{color:var(--fg);font-weight:700;border-color:var(--acc);background:var(--inpf)}' +
    '.trow input:focus{border-color:var(--acc);background:var(--inpf);color:var(--fg)}' +
    '.trow .rst{width:22px;height:22px;border:0;border-radius:7px;background:var(--acc2);color:var(--acc);font-size:13px;padding:0;visibility:hidden}' +
    '.trow .rst.show{visibility:visible}' +
    '.thr .all{width:100%;margin-top:6px;padding:6px;border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:9px;font-size:11.5px}' +
    '.step{margin:0 12px 7px;border:1px solid var(--line);border-radius:14px;background:var(--bg);overflow:hidden}' +
    '.step>.sh{display:flex;align-items:center;gap:8px;padding:9px 10px;cursor:pointer;font-weight:700;color:var(--fg)}' +
    '.step>.sh:hover{background:var(--bg2)}' +
    '.step>.sh .num{flex:none;width:23px;height:23px;border-radius:50%;background:var(--acc2);color:var(--acc);display:grid;place-items:center;font-size:11.5px}' +
    '.step>.sh .tt{flex:1;font-size:12.5px}' +
    '.step>.sh .badge{font-size:14px}' +
    '.step>.sh::after{content:"‹";color:var(--mut);font-size:16px;transition:transform .2s;transform:rotate(-90deg)}' +
    '.step.open>.sh::after{transform:rotate(90deg)}' +
    '.sc{padding:2px 12px 10px;display:none;border-top:1px solid var(--line)}.step.open .sc{display:block}' +
    '.fld{margin:7px 0 0}.fld label{display:block;overflow-wrap:anywhere;color:var(--mut);margin-bottom:4px;font-size:11.5px}' +
    '.fld .ctl{display:flex;gap:6px}' +
    '.fld input{flex:1;min-width:0;padding:8px 10px;border:1.5px solid transparent;background:var(--inp);border-radius:10px;font-size:13px;color:var(--fg);direction:ltr;text-align:center;font-variant-numeric:tabular-nums;outline:none;transition:border-color .15s,background .15s}' +
    '.fld input.txt{direction:rtl;text-align:right}' +
    '.fld input:focus{border-color:var(--acc);background:var(--inpf)}' +
    '.fld button.pick{border:0;background:var(--acc2);color:var(--acc);border-radius:10px;padding:0 11px;font-size:15px;transition:background .15s}' +
    '.fld button.pick:hover{filter:brightness(.95)}' +
    '.yn{display:flex;gap:4px;background:var(--inp);padding:3px;border-radius:10px}' +
    '.yn button{flex:1;padding:6px;border:0;border-radius:8px;background:transparent;color:var(--mut);font-size:12.5px;font-weight:600;transition:all .15s}' +
    '.yn button.on[data-v="بله"]{background:var(--ok-bg);color:var(--ok-fg)}' +
    '.yn button.on[data-v="خیر"]{background:var(--bad-bg);color:var(--bad-fg)}' +
    '.calc{margin-top:10px;background:var(--bg2);border-radius:10px;padding:2px 10px}' +
    '.calc:empty{display:none}' +
    '.cr{display:flex;justify-content:space-between;gap:8px;padding:5px 0;font-size:11.5px;border-top:1px solid var(--line)}' +
    '.cr:first-child{border-top:0}' +
    '.cr span:first-child{color:var(--mut)}' +
    '.cr span:last-child{font-weight:700;direction:ltr;white-space:nowrap;font-variant-numeric:tabular-nums}' +
    '.msg{margin:8px 0 0;padding:7px 10px;border-radius:10px;line-height:1.8;font-size:11.5px}' +
    '.msg.h{background:var(--bad-bg);color:var(--bad-fg)}.msg.w{background:var(--warn-bg);color:var(--warn-fg)}.msg.ok{background:var(--ok-bg);color:var(--ok-fg)}.msg.wait{background:var(--wait-bg);color:var(--wait-fg)}' +
    '.set{margin:0 12px 10px;padding:10px 12px;background:var(--bg2);border:1px solid var(--line);border-radius:13px}' +
    '.set h4{margin:0 0 6px;font-size:13px}' +
    '.note{margin:0 12px 7px;padding:6px 10px;font-size:11.5px;color:var(--mut);background:var(--bg2);border-radius:11px;line-height:1.8}' +
    '.set .note{margin:0 0 6px;padding:0;background:none}' +
    '.rep{margin:0 12px 9px;padding:8px 11px;font-size:11.5px;line-height:1.8;background:var(--bg2);border-radius:11px}' +
    '.rep:empty{display:none}' +
    '.rep .o{color:var(--ok-fg)}.rep .x{color:var(--bad-fg)}.rep .t{color:var(--mut)}' +
    '.usep{margin-top:8px;width:100%;padding:8px;border:0;background:var(--acc);color:var(--accfg);border-radius:10px;font-size:12px;font-weight:600}' +
    '.usep:hover{filter:brightness(1.08)}' +
    '.foot{padding:9px 12px;background:var(--bg);border-top:1px solid var(--line);display:flex;gap:6px}' +
    '.foot button{flex:1;padding:8px 4px;border:1px solid var(--line);background:var(--bg2);color:var(--fg);border-radius:10px;font-size:11.5px;font-weight:600;transition:background .15s}' +
    '.foot button:hover{background:var(--acc2);color:var(--acc)}' +
    '.mini{direction:rtl;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;border:0;border-radius:99px;padding:10px 18px;cursor:pointer;font-size:13px;font-weight:700;box-shadow:0 8px 24px rgba(79,70,229,.45);font-family:"Vazirmatn","Shabnam","Sahel","Segoe UI",system-ui,"Noto Sans Arabic",Tahoma,sans-serif}' +
    '.panel.wide{width:min(560px,96vw)}' +
    '.hd button.wide{width:auto;padding:0 9px;font-size:12px;gap:4px;display:flex;align-items:center}' +
    '.hd button.wide .n{background:#fff;color:#4f46e5;border-radius:99px;padding:0 6px;font-size:10.5px;font-weight:700}' +
    '.foot button.pri{background:var(--acc);color:var(--accfg);border-color:var(--acc)}' +
    '.foot button.pri:hover{filter:brightness(1.1);background:var(--acc);color:var(--accfg)}' +
    '.rk{margin:0 12px 8px;display:flex;flex-direction:column;gap:4px}' +
    '.rk .it{display:flex;gap:8px;align-items:center;padding:7px 10px;border-radius:10px;background:var(--bg2);font-size:12px}' +
    '.rk .it:first-child{border:1.5px solid var(--acc)}' +
    '.rk .it .no{flex:none;width:21px;height:21px;border-radius:50%;background:var(--acc2);color:var(--acc);display:grid;place-items:center;font-weight:700;font-size:11px}' +
    '.rk .it .nm{font-weight:700}.rk .it .mt{margin-inline-start:auto;color:var(--mut);font-size:11px}' +
    '.cmp{margin:0 12px 8px;overflow-x:auto;border:1px solid var(--line);border-radius:12px}' +
    '.cmp table{border-collapse:separate;border-spacing:0;width:100%;font-size:11.5px}' +
    '.cmp th,.cmp td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:center;min-width:104px;white-space:nowrap}' +
    '.cmp td.v{direction:ltr;font-variant-numeric:tabular-nums}' +
    '.cmp th.lab,.cmp td.lab{position:sticky;right:0;background:var(--bg);text-align:right;min-width:170px;z-index:1;color:var(--mut);font-weight:600}' +
    '.cmp tr.grp td{background:var(--bg2);color:var(--acc);font-weight:700;text-align:right;position:static}' +
    '.cmp td.best{background:var(--ok-bg);color:var(--ok-fg);font-weight:700}' +
    '.cmp td.worst{background:var(--bad-bg);color:var(--bad-fg)}' +
    '.cmp th{background:var(--bg);vertical-align:top}.cmp th .nm{font-weight:700;font-size:12.5px}.cmp th .sub{font-size:10px;color:var(--mut);font-weight:400}' +
    '.cmp th .ac{display:flex;justify-content:center;gap:5px;margin-top:4px}' +
    '.cmp th .ac a,.cmp th .ac button{width:22px;height:22px;border:0;border-radius:7px;background:var(--inp);color:var(--mut);display:grid;place-items:center;text-decoration:none;font-size:12px;padding:0}' +
    '.cmp th .ac a:hover,.cmp th .ac button:hover{background:var(--acc2);color:var(--acc)}' +
    '.empty{margin:18px 14px;padding:16px;text-align:center;color:var(--mut);background:var(--bg2);border-radius:12px;line-height:2}' +
    '.legend{margin:0 12px 8px;font-size:11px;color:var(--mut);line-height:1.8}' +
    '.tabs button{font-size:11.5px;padding:7px 2px;white-space:nowrap}' +
    '.tabs button.on.sell{color:#c2410c}' +
    '.sg{margin:0 12px 8px;padding:10px 12px;border:1px solid var(--line);border-radius:14px;background:var(--bg)}' +
    '.sg h5{margin:0 0 6px;font-size:12.5px}' +
    '.sg .big{font-size:22px;font-weight:800;color:var(--acc);direction:ltr;display:inline-block;font-variant-numeric:tabular-nums}' +
    '.sg .line{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-top:1px solid var(--line);font-size:11.5px;line-height:1.7}' +
    '.sg .line.bind{color:var(--acc);font-weight:700}' +
    '.sg .line .vv{direction:ltr;white-space:nowrap;font-variant-numeric:tabular-nums;font-weight:700}' +
    '.sgt{margin:0 12px 8px}.sgt th,.sgt td{min-width:0}.sgt th.lab,.sgt td.lab{min-width:120px}' +
    '.body::-webkit-scrollbar{width:8px}.body::-webkit-scrollbar-thumb{background:var(--line);border-radius:99px}' +
    '</style><div id="mount"></div>';
  document.documentElement.appendChild(host);
  var mount = root.getElementById("mount");
  root.querySelector("style").textContent += (window.AdvisorUI ? window.AdvisorUI.CSS : "");
  var SCC = window.SCCollect, CS = window.ComboStore;

  var STEP_TITLES = function () {
    return ["مرحله ۰ — مشخصات", "مرحله ۱ — سهم پایه", "مرحله ۲ — بازار اختیار", "مرحله ۳ — قیمت و زمان", "مرحله ۴ — سود و زیان", "مرحله ۵ — اندازه معامله", "مرحله ۶ — برنامه خروج"];
  };

  function persist() { store.set(pageKey, { type: STATE.type, inp: STATE.inp, an: STATE.an }); }
  function persistUi() { store.set("ui", { riskOpen: STATE.riskOpen }); }
  function persistSettings() { store.set("settings", STATE.st); }


  // ================= مقایسه اختیارها =================
  var CMP_MAX = 20;
  var SYM_BUY = { "✅": "بخر", "⚠": "فعلاً نخر", "❌": "نخر", "⏳": "ناقص" };
  var SYM_SELL = { "✅": "بفروش", "⚠": "فعلاً نفروش", "❌": "نفروش", "⏳": "ناقص" };
  function symLabel(sym, type) { return (isSell(type) ? SYM_SELL : SYM_BUY)[sym]; }
  var SYM_RANK = { "✅": 0, "⚠": 1, "⏳": 2, "❌": 3 };
  function cmpCount() { return fa((STATE.cmp || []).length); }
  function refreshCmpBadge() { var n = root.getElementById("cmpn"); if (n) n.textContent = cmpCount(); }
  function saveCmp(btn) {
    store.get("compare", function (arr) {
      arr = Array.isArray(arr) ? arr : [];
      var ent = {
        key: pageKey, type: STATE.type, url: location.href, at: Date.now(),
        name: STATE.inp.name_o || document.title || "اختیار",
        inp: JSON.parse(JSON.stringify(STATE.inp || {})), an: STATE.an ? JSON.parse(JSON.stringify(STATE.an)) : null,
      };
      var idx = -1;
      arr.forEach(function (x, i) { if (x.key === ent.key) idx = i; });
      if (idx >= 0) arr[idx] = ent; else arr.push(ent);
      if (arr.length > CMP_MAX) arr = arr.slice(-CMP_MAX);
      store.set("compare", arr);
      STATE.cmp = arr;
      refreshCmpBadge();
      if (btn) { var old = btn.textContent; btn.textContent = idx >= 0 ? "✔ به‌روز شد" : "✔ ذخیره شد"; setTimeout(function () { btn.textContent = old; }, 1300); }
    });
  }
  function delCmp(key) {
    store.get("compare", function (arr) {
      arr = (Array.isArray(arr) ? arr : []).filter(function (x) { return x.key !== key; });
      store.set("compare", arr); STATE.cmp = arr; renderCmpBody();
    });
  }
  function numOk(v) { return typeof v === "number" && isFinite(v); }
  // [شناسه، برچسب، تابع مقدار، قالب، بهتر: high|low]
  var CMP_ROWS = [
    { g: "نتیجه" },
    { id: "final", l: "نتیجه نهایی", html: function (it) { return it.r.final.sym + " " + symLabel(it.r.final.sym, it.e.type); } },
    { id: "steps", l: "مرحله‌های ۱ تا ۶", html: function (it) { var o = ""; for (var i = 1; i <= 6; i++) o += it.r.steps[i].status; return o; } },
    { id: "cnt", l: "ردها / هشدارها", html: function (it) { return fa(it.r.nHard) + " رد · " + fa(it.r.nWarn) + " هشدار"; } },
    { g: "مشخصات" },
    { id: "K", l: "قیمت اعمال", v: function (it) { return num0(it.e.inp.K); }, f: "money" },
    { id: "S", l: "قیمت سهم پایه", v: function (it) { return num0(it.e.inp.S); }, f: "money" },
    { id: "ask", l: "بهترین قیمت فروش اختیار (ask)", v: function (it) { return num0(it.e.inp.ask); }, f: "money" },
    { id: "td", l: "روز معاملاتی مانده", v: function (it) { return it.r.R.td; }, f: "int", better: "high" },
    { g: "سلامت بازار" },
    { id: "spread", l: "اسپرد", v: function (it) { return it.r.R.spread; }, f: "pct1", better: "low" },
    { id: "vol_o", l: "میانگین حجم روزانه", v: function (it) { return num0(it.e.inp.vol_o); }, f: "int", better: "high" },
    { id: "volratio", l: "حجم نسبت به تعداد خرید (برابر)", v: function (it) { return it.r.R.volratio; }, f: "int", better: "high" },
    { g: "قیمت و زمان" },
    { id: "tvp", l: "سهم ارزش زمانی از قیمت", v: function (it) { return it.r.R.tvp; }, f: "pct0", better: "low" },
    { id: "rise", l: "حرکت لازم سهم تا سر به سر", v: function (it) { return it.r.R.rise; }, f: "pct1", better: "low" },
    { id: "tgtd", l: "حرکت روزانه لازم برای هدف", v: function (it) { return it.r.R.tgtd; }, f: "pct2", better: "low" },
    { g: "سود و زیان" },
    { id: "rr", l: "نسبت سود به ریسک", v: function (it) { return it.r.R.rr; }, f: "ratio1", better: "high" },
    { id: "ev", l: "امید ریاضی بازده", v: function (it) { return it.r.R.ev; }, f: "pct0", better: "high" },
    { id: "retFlat", l: "بازده اگر سهم بی‌تغییر بماند", v: function (it) { return it.r.R.retFlat; }, f: "pct0", better: "high" },
    { id: "retAdv", l: "بازده اگر سهم ۱۰٪ خلاف نظر برود", v: function (it) { return it.r.R.retAdv; }, f: "pct0", better: "high" },
    { id: "preq", l: "حداقل احتمال لازم برای سر به سر", v: function (it) { return it.r.R.preq; }, f: "pct0", better: "low" },
    { g: "احتمال" },
    { id: "p", l: "احتمال من", v: function (it) { return num0(it.e.inp.p); }, f: "pct0", better: "high" },
    { id: "pModel", l: "احتمال آماری (مدل نوسان)", v: function (it) { return it.r.R.pModel; }, f: "pct0", better: "high" },
    { id: "pEmp", l: "احتمال تاریخی", v: function (it) { return it.r.R.pEmp; }, f: "pct0", better: "high" },
    { g: "فروشنده" },
    { id: "sp", l: "قیمت فروش من / بهترین خرید", v: function (it) { return isSell(it.e.type) ? (num0(it.e.inp.sellp) !== null ? num0(it.e.inp.sellp) : num0(it.e.inp.bid)) : null; }, f: "money" },
    { id: "yield", l: "بازده پریمیوم تا سررسید", v: function (it) { return it.r.R.yield; }, f: "pct1", better: "high" },
    { id: "monthly", l: "بازده معادل ماهانه", v: function (it) { return it.r.R.monthly; }, f: "pct1", better: "high" },
    { id: "pLoss", l: "احتمال زیان فروشنده", v: function (it) { return it.r.R.pLoss; }, f: "pct0", better: "low" },
    { id: "pAssign", l: "احتمال اعمال", v: function (it) { return it.r.R.pAssign; }, f: "pct0", better: "low" },
    { id: "cushion", l: "فاصله سهم تا سر به سر فروشنده", v: function (it) { return it.r.R.cushion; }, f: "pct1", better: "high" },
    { id: "sev", l: "برتری پریمیوم نسبت به ارزش تئوری", v: function (it) { return it.r.R.sev; }, f: "pct0", better: "high" },
    { g: "سرمایه" },
    { id: "cost", l: "هزینه یک قرارداد (ریال)", v: function (it) { return it.r.R.cost; }, f: "money", better: "low" },
    { id: "maxq", l: "حداکثر قرارداد مجاز", v: function (it) { return it.r.R.maxq; }, f: "int", better: "high" },
  ];
  function num0(x) { var n = Number(x); return (x === null || x === undefined || x === "" || !isFinite(n)) ? null : n; }
  function renderCmpBody() {
    var el = root.getElementById("cmpbody");
    if (!el) return;
    var list = STATE.cmp || [];
    refreshCmpBadge();
    if (!list.length) {
      el.innerHTML = '<div class="empty">هنوز اختیاری ذخیره نکرده‌ای.<br>روی صفحه هر اختیار، اطلاعاتش را پر کن و دکمه «ذخیره برای مقایسه» را بزن؛ بعد برو سراغ اختیار بعدی.</div>';
      STATE.tsv = "";
      return;
    }
    var items = list.map(function (e) { return { e: e, r: OC.evaluate(e.type, e.inp, STATE.st, e.an) }; });
    items.sort(function (a, b) {
      var d = SYM_RANK[a.r.final.sym] - SYM_RANK[b.r.final.sym];
      if (d) return d;
      var ea = numOk(a.r.ev) ? a.r.ev : -Infinity, eb = numOk(b.r.ev) ? b.r.ev : -Infinity;
      return eb - ea;
    });
    function nm(it) { return it.e.inp.name_o || it.e.name; }
    var h = '<div class="rk">';
    items.forEach(function (it, i) {
      h += '<div class="it"><span class="no">' + fa(i + 1) + '</span><span class="nm">' + esc(nm(it)) + '</span><span>' + it.r.final.sym + " " + symLabel(it.r.final.sym, it.e.type) + '</span>' +
        '<span class="mt">' + (isSell(it.e.type)
          ? esc(MODE_LABEL[it.e.type]) + ' · بازده پریمیوم ' + esc(fmt(it.r.R.yield, "pct1")) + ' · احتمال زیان ' + esc(fmt(it.r.R.pLoss, "pct0"))
          : esc(MODE_LABEL[it.e.type]) + ' · امید ریاضی ' + esc(fmt(it.r.R.ev, "pct0")) + ' · سود/ریسک ' + esc(fmt(it.r.R.rr, "ratio1"))) + '</span></div>';
    });
    h += '</div><div class="cmp"><table><thead><tr><th class="lab">اختیار</th>';
    items.forEach(function (it, i) {
      var t = new Date(it.e.at), hm = "";
      try { hm = t.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }); } catch (x) {}
      h += '<th><div class="nm">' + fa(i + 1) + '# ' + esc(nm(it)) + '</div><div class="sub">' + esc(MODE_LABEL[it.e.type] || it.e.type) + ' · ذخیره ' + esc(hm) + '</div>' +
        '<div class="ac"><a href="' + esc(it.e.url || "#") + '" target="_blank" rel="noopener" title="باز کردن صفحه این اختیار">↗</a>' +
        '<button data-del="' + esc(it.e.key) + '" title="حذف از مقایسه">✕</button></div></th>';
    });
    h += '</tr></thead><tbody>';
    var tsv = [["اختیار"].concat(items.map(nm)).join("\t")];
    CMP_ROWS.forEach(function (rw) {
      if (rw.g) { h += '<tr class="grp"><td colspan="' + (items.length + 1) + '">' + rw.g + '</td></tr>'; return; }
      var vals = items.map(function (it) { return rw.v ? rw.v(it) : null; });
      var best = null, worst = null;
      if (rw.better) {
        var nums = vals.filter(numOk);
        if (nums.length >= 2) {
          var mn = Math.min.apply(null, nums), mx = Math.max.apply(null, nums);
          if (mn !== mx) { best = rw.better === "high" ? mx : mn; worst = rw.better === "high" ? mn : mx; }
        }
      }
      var cells = [rw.l];
      h += '<tr><td class="lab">' + esc(rw.l) + '</td>';
      items.forEach(function (it, i) {
        var txt = rw.html ? rw.html(it) : fmt(vals[i], rw.f);
        var cls = "v";
        if (best !== null && numOk(vals[i])) { if (vals[i] === best) cls += " best"; else if (vals[i] === worst) cls += " worst"; }
        h += '<td class="' + cls + '">' + esc(txt) + '</td>';
        cells.push(txt);
      });
      h += '</tr>';
      tsv.push(cells.join("\t"));
    });
    h += '</tbody></table></div><div class="legend">سبز = بهترین مقدار در آن ردیف، قرمز = بدترین. رتبه‌بندی اول بر اساس نتیجه نهایی و بعد امید ریاضی است. همه اختیارها با ریسک‌پذیری و آستانه‌های فعلی بالا محاسبه شده‌اند؛ اگر اعداد یک اختیار عوض شد، صفحه‌اش را باز کن و دوباره «ذخیره برای مقایسه» را بزن.</div>';
    STATE.tsv = tsv.join("\n");
    el.innerHTML = h;
    el.querySelectorAll("[data-del]").forEach(function (b) { b.onclick = function () { delCmp(b.dataset.del); }; });
  }

  // ================= دید سهم پایه (نمودار + مالی) برای پیشنهاد =================
  var CSX = window.ComboStore;
  function loadUnderFin(code, cb) {
    if (!code || !CSX) { STATE.underFin = null; if (cb) cb(); return; }
    CSX.get("S.fin:stk:code:" + code, function (f) {
      if (!f) { try { var raw = localStorage.getItem("sc:fin:stk:code:" + code); f = raw ? JSON.parse(raw) : null; } catch (e) { f = null; } }
      STATE.underFin = f || null;
      if (cb) cb();
    });
  }
  function pd2(n) { return (n < 10 ? "0" : "") + n; }
  function tdNow() {
    var I = STATE.inp, t = Number(I.tdov);
    if (t > 0) return t;
    var c = Number(I.cal_days);
    return c > 0 ? Math.round(c * 5 / 7 * 0.92) : null;
  }
  function expDateTxt() {
    if (STATE.inp.exp_date) return STATE.inp.exp_date;
    try { var o = OCC.parseOptionName(pageText()); if (o) return o.jy + "/" + pd2(o.jm) + "/" + pd2(o.jd); } catch (e) {}
    return "";
  }
  function underFinView() {
    var AD = window.OptAdvisor, u = STATE.under || {}, S = Number(STATE.inp.S) > 0 ? Number(STATE.inp.S) : null;
    return (AD && STATE.underFin && S) ? AD.finView(STATE.underFin, S, u.inp || {}) : null;
  }
  function underCtx() {
    var AD = window.OptAdvisor, u = STATE.under || {};
    var an = (u.an && u.an.bars) ? u.an : STATE.an;
    var S = Number(STATE.inp.S) > 0 ? Number(STATE.inp.S) : null, td = tdNow();
    if (!AD || !S || !td || !an) return null;
    var fv = underFinView();
    var v = AD.stockView(an, S, {}, u.inp || {}, fv, 10);
    if (!v || !v.ok) return { v: v, fv: fv, S: S, td: td };
    var ol = AD.outlook(v, S, td, 0.5);
    return { v: v, fv: fv, S: S, td: td, ol: ol, nr: AD.narrative(v, ol, td) };
  }
  // اگر پیش‌بینی سهم درست باشد، همین اختیار در سررسید چه می‌شود؟
  function optScenarioHtml(UC, m) {
    var AD = window.OptAdvisor, I = STATE.inp, st = OC.effective(STATE.st), ol = UC.ol;
    var K = num0(I.K), ask = num0(I.ask), bid = num0(I.bid), sell = isSell(m), call = m === "call" || m === "scall";
    var entry = sell ? (num0(I.sellp) > 0 ? num0(I.sellp) : bid) : ask;
    var h = '<div class="sg"><h5>این اختیار (' + esc(MODE_LABEL[m]) + (K > 0 ? " با قیمت اعمال " + esc(fmt(K, "money")) : "") + ') اگر پیش‌بینی سهم پایه درست باشد</h5>';
    if (!(K > 0) || !(entry > 0)) return h + '<div class="legend">قیمت اعمال یا قیمت ' + (sell ? "خرید (bid)" : "فروش (ask)") + ' اختیار وارد/خوانده نشده؛ «به‌روزرسانی از سایت» را بزن.</div></div>';
    var fo = st.fee_opt, fe = st.fee_ex, fs = st.fee_sell, base = call ? UC.S : K;
    var cost = entry * (1 + fo), prem = entry * (1 - fo);
    function pay(X) { return sell ? (call ? Math.max(X - K, 0) : Math.max(K - X, 0)) : (call ? Math.max(X * (1 - fs) - K * (1 + fe), 0) : Math.max(K * (1 - fs) - X * (1 + fe), 0)); }
    h += '<div class="cmp sgt" style="margin:0 0 6px"><table><thead><tr><th class="lab">سناریوی قیمت سهم در سررسید</th><th>قیمت سهم</th><th>ارزش اختیار</th><th>' + (sell ? "سود/زیان فروشنده" : "سود/زیان خریدار") + '</th></tr></thead><tbody>';
    [["بدبینانه (۲٫۵٪)", ol.low95], ["محتاطانه (۱۶٪)", ol.low68], ["مرکزی", ol.median], ["خوش‌بینانه (۱۶٪)", ol.high68], ["بسیار خوش‌بینانه (۲٫۵٪)", ol.high95]].forEach(function (r, i) {
      var pv = pay(r[1]), pl = sell ? (prem - pv) : (cost > 0 ? pv / cost - 1 : null), good = sell ? (prem - pv) >= 0 : pv > cost;
      h += '<tr' + (i === 2 ? ' style="font-weight:700"' : '') + '><td class="lab">' + esc(r[0]) + '</td><td class="v">' + esc(fmt(r[1], "money")) + '</td><td class="v">' + esc(fmt(pv, "money")) + '</td><td class="v ' + (good ? "best" : "worst") + '">' +
        (sell ? esc(fmt(prem - pv, "money")) + ' (' + esc(fmt((prem - pv) / base, "pct1")) + ')' : esc((pl >= 0 ? "+" : "") + fmt(pl, "pct0"))) + '</td></tr>';
    });
    h += '</tbody></table></div>';
    var o = { strike: K, td: UC.td, ask: sell ? (ask > 0 ? ask : entry) : ask, bid: sell ? entry : bid, vol_o: undefined, last: null };
    var C = AD.evalCand(m, o, UC.S, UC.v.sigma, ol.m, st, UC.v.sigma);
    h += '<div class="line"><span>ارزش مورد انتظار اختیار در سررسید (روی کل توزیع پیش‌بینی)</span><span class="vv">' + esc(fmt(C.E, "money")) + ' ریال</span></div>';
    if (!sell) {
      h += '<div class="line"><span>سقف قیمت خرید سر به سر ریاضی (امید ریاضی صفر)</span><span class="vv">' + esc(fmt(C.E / (1 + fo), "money")) + '</span></div>' +
        '<div class="line"><span>قیمت فعلی فروش (ask) نسبت به آن</span><span class="vv">' + esc(fmt(entry, "money")) + ' — ' + (C.edge > 0 ? "✅ ارزان‌تر از ارزش پیش‌بینی" : "❌ گران‌تر از ارزش پیش‌بینی") + '</span></div>' +
        '<div class="line"><span>احتمال سودآوری در سررسید</span><span class="vv">' + esc(fmt(C.pProfit, "pct0")) + '</span></div>' +
        '<div class="line"><span>سر به سر سهم پایه (' + esc(fmt(C.beMove, "pct1")) + ' حرکت لازم)</span><span class="vv">' + esc(fmt(C.be, "money")) + '</span></div>';
    } else {
      h += '<div class="line"><span>پریمیوم خالص دریافتی</span><span class="vv">' + esc(fmt(C.premium, "money")) + '</span></div>' +
        '<div class="line"><span>برتری مورد انتظار فروشنده (پریمیوم − زیان مورد انتظار)</span><span class="vv">' + esc(fmt(C.edge, "money")) + ' — ' + (C.edge > 0 ? "✅" : "❌") + '</span></div>' +
        '<div class="line"><span>احتمال زیان فروشنده در سررسید (طبق پیش‌بینی)</span><span class="vv">' + esc(fmt(C.pLoss, "pct0")) + (C.pLoss > st.assign ? " ⚠ بیشتر از حد مجاز " + esc(fmt(st.assign, "pct0")) : "") + '</span></div>' +
        '<div class="line"><span>احتمال اعمال شدن</span><span class="vv">' + esc(fmt(C.pAssign, "pct0")) + '</span></div>';
    }
    return h + '<div class="legend" style="margin:6px 0 0">توزیع قیمت سهم همان پیش‌بینی بالاست (مرکزش کمی به‌سمت دید تحلیلی کج شده). خریدار با قیمت ask و فروشنده با bid و با کارمزدهای تنظیمات حساب شده است.</div></div>';
  }

  // ================= تب پیشنهاد =================
  function margOf(q, sell) { return sell ? q.ref / q.limit - 1 : 1 - q.ref / q.limit; }
  function pAbs(g) { return fa(Math.abs(g * 100).toFixed(0)) + "٪"; }
  function pSigned(g) { return (g >= 0 ? "+" : "") + fa((g * 100).toFixed(0)) + "٪"; }
  function enterSug() {
    store.get("compare", function (arr) {
      STATE.cmp = Array.isArray(arr) ? arr : [];
      STATE.view = "sug"; STATE.showSettings = false;
      loadUnderFin(STATE.inp.under_code, function () { renderAll(); });
    });
  }
  function renderSugBody() {
    var el = root.getElementById("sugbody");
    if (!el) return;
    var m = STATE.type, sell = isSell(m);
    // ---- پیش‌بینی سهم پایه (نمودار + مالی) تا تاریخ سررسید: برای قیمت هدف و احتمال، و برای کف قیمت فروش
    var UC = underCtx(), inpQ = STATE.inp, auto = [], call = m === "call" || m === "scall";
    if (!sell && UC && UC.ol) {
      inpQ = Object.assign({}, STATE.inp);
      var T0 = num0(STATE.inp.T), p0 = num0(STATE.inp.p);
      if (!(T0 > 0)) { inpQ.T = Math.round(UC.ol.median); auto.push("قیمت هدف سهم را وارد نکرده‌ای؛ قیمت مرکزی پیش‌بینی افزونه در تاریخ سررسید (" + fmt(inpQ.T, "money") + ") به‌عنوان هدف استفاده شد. توجه: این فقط یک سناریو (میانه) است و اختیار از دم توزیع هم سود می‌برد؛ «سقف قیمت خرید سر به سر ریاضی» در جدول بالا بر پایه‌ی کل توزیع پیش‌بینی است و برای اختیار معمولاً واقع‌بینانه‌تر است."); }
      else auto.push("برای مقایسه: قیمت مرکزی پیش‌بینی افزونه در سررسید " + fmt(Math.round(UC.ol.median), "money") + " است؛ احتمال رسیدن سهم به هدف تو (" + fmt(T0, "money") + ") طبق پیش‌بینی حدود " + fmt(call ? UC.ol.pAbove(T0) : 1 - UC.ol.pAbove(T0), "pct0") + " است.");
      if (p0 === null) {
        var Tn = num0(inpQ.T), pm = call ? UC.ol.pAbove(Tn) : 1 - UC.ol.pAbove(Tn), An = OC.analyze(call, STATE.an, UC.S, Tn, UC.td), pe = An && An.pEmp !== null && An.pEmp !== undefined ? An.pEmp : null;
        inpQ.p = Math.round(Math.min(pm, pe !== null ? pe : pm) * 100) / 100;
        if (T0 > 0) auto.push("احتمال را وارد نکرده‌ای؛ احتمال رسیدن به هدف طبق پیش‌بینی افزونه" + (pe !== null ? " (کمینه‌ی مدل و سابقه‌ی تاریخی)" : "") + " " + fmt(inpQ.p, "pct0") + " گذاشته شد.");
      }
    }
    var q = OC.quote(m, inpQ, STATE.st, STATE.an);
    if (sell && q.ok && UC && UC.ol && q.safeStrike) {
      var st0 = OC.effective(STATE.st), K0 = num0(STATE.inp.K), qF = q.safeStrike * Math.exp(UC.ol.m), pnF = q.call ? qF - K0 : K0 - qF, floorF = Math.max(pnF, 0) / (1 - st0.fee_opt);
      q.parts.push({ label: "برای اینکه با دید تحلیلی سهم پایه (نمودار" + (UC.fv && UC.fv.ok ? " + مالی" : "") + ") هم احتمال زیان از " + fmt(st0.assign, "pct0") + " بیشتر نشود (سر به سر باید " + (q.call ? "بالاتر" : "پایین‌تر") + " از " + fmt(qF, "money") + " باشد)", v: floorF });
      if (floorF > q.limit) {
        q.limit = Math.ceil(floorF);
        q.parts.forEach(function (x) { x.bind = Math.abs(x.v - q.limit) < 1; });
        if (q.ref !== null && q.ref > 0) q.gap = q.ref / q.limit - 1;
        var baseS = q.call ? UC.S : K0;
        q.levels.forEach(function (l) {
          if (l.label === "کف پیشنهادی") { l.price = q.limit; l.yld = q.limit * (1 - st0.fee_opt) / baseS; l.pLoss = null; l.fairr = q.fair > 0 ? q.limit / q.fair : null; }
          l.good = l.price >= q.limit;
        });
        q.note.push("دید تحلیلی سهم پایه (" + UC.v.dirTxt + ") احتمال زیان فروشنده را بالاتر از مدل عادی نشان داد؛ کف قیمت فروش بالاتر رفت.");
      }
    }
    // وقتی هدف از پیش‌بینی خود افزونه آمده (نه از خودت)، سقف خرید را روی کل توزیع پیش‌بینی می‌گذاریم؛ سناریوی تک‌نقطه‌ای میانه برای اختیار (که از دم توزیع هم سود می‌برد) بدبینانه و گمراه‌کننده است
    if (!sell && q.ok && UC && UC.ol && !(num0(STATE.inp.T) > 0)) {
      var stB = OC.effective(STATE.st), KB = num0(STATE.inp.K), askB = num0(STATE.inp.ask), bidB = num0(STATE.inp.bid);
      if (KB > 0 && (askB > 0 || bidB > 0)) {
        var CB = window.OptAdvisor.evalCand(m, { strike: KB, td: UC.td, ask: askB > 0 ? askB : bidB, bid: bidB > 0 ? bidB : askB, vol_o: undefined, last: null }, UC.S, UC.v.sigma, UC.ol.m, stB, UC.v.sigma);
        var mg = stB.margin !== undefined ? stB.margin : 0.08, distLim = Math.floor(Math.max(0, CB.E / (1 + stB.fee_opt) * (1 - mg)));
        q.parts = q.parts.filter(function (x) { return !/^برای نسبت سود به ریسک|^برای اینکه احتمال تو/.test(x.label); });   // این دو شرط، سناریوی تک‌نقطه‌ایِ هدف خودکارند
        q.parts.push({ label: "بر پایه‌ی ارزش مورد انتظار اختیار روی کل توزیع پیش‌بینی سهم پایه (" + fmt(CB.E, "money") + ") منهای حاشیه‌ی امن " + fmt(mg, "pct0"), v: distLim });
        q.limit = distLim;
        q.parts.forEach(function (x) { x.bind = Math.abs(x.v - q.limit) < 1; });
        if (q.limit > 0 && q.ref > 0) q.gap = q.limit / q.ref - 1;
        q.levels = q.levels.filter(function (l) { return l.label !== "سقف پیشنهادی"; });
        q.levels.forEach(function (l) { l.good = l.price <= q.limit; });
        q.note.push("چون هدف را خودت نگذاشتی، سقف قیمت خرید بر پایه‌ی کل توزیع پیش‌بینی گذاشته شد (نه فقط سناریوی میانه).");
      }
    }
    auto.forEach(function (t) { q.note.push(t); });
    if (UC && UC.fv && UC.fv.ok && UC.fv.score < 40) q.note.push("بنیاد سهم پایه ضعیف است (امتیاز مالی " + UC.fv.score + " از ۱۰۰)؛ ریسک افت شدیدتر است.");
    else if (UC && !(UC.fv && UC.fv.ok)) q.note.push("اطلاعات مالی سهم پایه ثبت نشده؛ صفحه‌ی همان سهم را باز کن و تب «🏦 مالی» را بخوان تا در پیشنهاد لحاظ شود.");
    var h = '<div class="note">پیشنهاد برای حالت «' + MODE_LABEL[m] + '» است. حالت را از تب‌های بالا عوض کن.</div>';
    if (UC && UC.ol) {
      h += window.AdvisorUI.outlookHtml({ title: "🔭 دید سهم پایه" + (STATE.inp.base_sym ? " (" + STATE.inp.base_sym + ")" : "") + " تا سررسید", S: UC.S, v: UC.v, ol: UC.ol, nr: UC.nr, expDate: expDateTxt() });
      h += optScenarioHtml(UC, m);
    } else if (UC && UC.v && !UC.v.ok) {
      h += '<div class="sg"><h5>🔭 دید سهم پایه</h5><div class="legend">سابقه قیمت سهم پایه (حداقل ۶۰ روز) خوانده نشده؛ «به‌روزرسانی از سایت» را در صفحه‌ی همین اختیار بزن تا سهم پایه هم خوانده شود.</div></div>';
    } else {
      h += '<div class="sg"><h5>🔭 دید سهم پایه</h5><div class="legend">قیمت سهم پایه یا روز تا سررسید خوانده نشده؛ «به‌روزرسانی از سایت» را بزن.</div></div>';
    }
    if (q.missing.length) {
      h += '<div class="empty">برای محاسبه قیمت پیشنهادی این‌ها لازم است: <b>' + esc(q.missing.join("، ")) + '</b><br>در تب «' + MODE_LABEL[m] + '» پرشان کن (یا «به‌روزرسانی از سایت» را بزن).</div>';
    } else {
      h += '<div class="sg"><h5>' + (sell ? "کمترین قیمت فروش پیشنهادی" : "بیشترین قیمت خرید پیشنهادی") + '</h5>' +
        '<div><span class="big">' + esc(fmt(q.limit, "money")) + '</span> ریال</div>';
      if (q.ref !== null && q.ref > 0 && q.gap !== null) {
        if (q.gap >= 0) h += '<div class="msg ok">✅ قیمت فعلی ' + (sell ? "خرید (که می‌گیری)" : "فروش (که می‌خری)") + ' ' + esc(fmt(q.ref, "money")) + ' است و ' + esc(pAbs(margOf(q, sell))) + ' ' + (sell ? "بالاتر از کف" : "پایین‌تر از سقف") + ' قرار دارد.</div>';
        else h += '<div class="msg h">❌ قیمت فعلی ' + (sell ? "خرید" : "فروش") + ' ' + esc(fmt(q.ref, "money")) + ' است و ' + esc(pAbs(margOf(q, sell))) + ' ' + (sell ? "پایین‌تر از کف" : "بالاتر از سقف") + ' است. ' +
          (sell ? "سفارش فروش را در قیمت ≥ کف در صف بگذار یا صبر کن." : "سفارش خرید را در قیمت ≤ سقف در صف بگذار یا صبر کن.") + '</div>';
      } else if (q.ref === null || q.ref <= 0) {
        h += '<div class="msg wait">قیمت فعلی بازار وارد نشده؛ مقایسه‌ای ممکن نیست.</div>';
      }
      h += '<div style="margin-top:8px">';
      q.parts.forEach(function (x) { h += '<div class="line' + (x.bind ? " bind" : "") + '"><span>' + (x.bind ? "▶ " : "") + esc(x.label) + '</span><span class="vv">' + esc(fmt(Math.round(x.v), "money")) + '</span></div>'; });
      h += '</div><div class="legend" style="margin:6px 0 0">' + (sell ? "کف = بزرگ‌ترین مقدار از شرط‌های بالا (▶ یعنی همان شرط تعیین‌کننده است)." : "سقف = کوچک‌ترین مقدار از شرط‌های بالا (▶ یعنی همان شرط تعیین‌کننده است).") + '</div>';
      if (!sell && q.beAtLimit) h += '<div class="line"><span>اگر در سقف بخری، سر به سر سهم پایه</span><span class="vv">' + esc(fmt(q.beAtLimit, "money")) + (q.moveAtLimit !== undefined ? ' (' + esc(fmt(q.moveAtLimit, "pct1")) + ' حرکت)' : '') + '</span></div>';
      if (sell && q.safeStrike) h += '<div class="line"><span>قیمت اعمال امن‌تر (احتمال اعمال برابر حد مجاز) — اختیار با قیمت اعمال ' + (q.call ? "بالاتر" : "پایین‌تر") + ' از آن</span><span class="vv">' + esc(fmt(q.safeStrike, "money")) + '</span></div>';
      q.note.forEach(function (t) { h += '<div class="msg w">ℹ ' + esc(t) + '</div>'; });
      h += '</div>';

      if (q.levels.length) {
        h += '<div class="cmp sgt"><table><thead><tr><th class="lab">اگر با این قیمت ' + (sell ? "بفروشی" : "بخری") + '</th><th>قیمت</th>' +
          (sell ? '<th>بازده</th><th>احتمال زیان</th><th>به تئوری</th>' : '<th>سود/ریسک</th><th>احتمال لازم</th><th>امید ریاضی</th>') + '<th>وضعیت</th></tr></thead><tbody>';
        q.levels.forEach(function (l) {
          h += '<tr><td class="lab">' + esc(l.label) + '</td><td class="v">' + esc(fmt(l.price, "money")) + '</td>' +
            (sell ? '<td class="v">' + esc(fmt(l.yld, "pct1")) + '</td><td class="v">' + esc(fmt(l.pLoss, "pct0")) + '</td><td class="v">' + esc(fmt(l.fairr, "ratio2")) + '</td>'
                  : '<td class="v">' + esc(fmt(l.rr, "ratio1")) + '</td><td class="v">' + esc(fmt(l.preq, "pct0")) + '</td><td class="v">' + esc(fmt(l.ev, "pct0")) + '</td>') +
            '<td class="' + (l.good ? "v best" : "v worst") + '">' + (l.good ? "✅ می‌ارزد" : "❌ گران" ) + '</td></tr>';
        });
        h += '</tbody></table></div>';
      }
    }

    // ---- کدام اختیار بهتر است؟ (از بین ذخیره‌شده‌ها + همین صفحه)
    var cands = (STATE.cmp || []).filter(function (e) { return e.key !== pageKey && isSell(e.type) === sell; });
    cands.push({ key: pageKey, type: m, inp: STATE.inp, an: STATE.an, name: STATE.inp.name_o || "همین صفحه", current: true });
    var list = [];
    cands.forEach(function (e) {
      var qq = e.current ? q : OC.quote(e.type, e.inp, STATE.st, e.an);   // صفحه‌ی فعلی با پیش‌بینی سهم پایه تنظیم شده است
      if (qq.missing.length || qq.gap === null || !qq.limit) return;
      list.push({ e: e, q: qq });
    });
    list.sort(function (a, b) { return b.q.gap - a.q.gap; });
    h += '<div class="sg"><h5>کدام اختیار ' + (sell ? "فروش" : "خرید") + ' بهتر است؟</h5>';
    if (!list.length) {
      h += '<div class="legend">هنوز اختیار قابل مقایسه‌ای نیست. صفحه اختیارهای دیگر همین سهم را باز کن، اطلاعاتشان را پر کن و «➕ ذخیره برای مقایسه» را بزن؛ اینجا بر اساس فاصله قیمت فعلی تا ' + (sell ? "کف" : "سقف") + ' رتبه‌بندی می‌شوند.</div>';
    } else {
      var best = list[0], bn = best.e.inp.name_o || best.e.name;
      if (best.q.gap >= 0) h += '<div class="msg ok">✅ بهترین گزینه: <b>' + esc(bn) + '</b> (' + esc(MODE_LABEL[best.e.type]) + ') — قیمت فعلی‌اش ' + esc(pAbs(margOf(best.q, sell))) + (sell ? " بالاتر از کف" : " پایین‌تر از سقف") + ' است.</div>';
      else h += '<div class="msg w">هیچ‌کدام با قیمت فعلی نمی‌ارزند. نزدیک‌ترین: <b>' + esc(bn) + '</b>؛ ' + (sell ? "اگر قیمت خریدش به " : "اگر قیمت فروشش به ") + esc(fmt(best.q.limit, "money")) + (sell ? " یا بیشتر برسد" : " یا کمتر برسد") + ' می‌ارزد.</div>';
      h += '<div class="rk" style="margin:6px 0 0">';
      list.forEach(function (x, i) {
        h += '<div class="it"><span class="no">' + fa(i + 1) + '</span><span class="nm">' + esc(x.e.inp.name_o || x.e.name) + (x.e.current ? " (همین صفحه)" : "") + '</span><span>' + (x.q.gap >= 0 ? "✅" : "❌") + '</span>' +
          '<span class="mt">' + esc(MODE_LABEL[x.e.type]) + ' · قیمت ' + esc(fmt(x.q.ref, "money")) + ' / ' + (sell ? "کف " : "سقف ") + esc(fmt(x.q.limit, "money")) + ' · ' + (x.q.gap >= 0 ? "فاصله امن " : "گران‌تر از حد ") + esc(pAbs(margOf(x.q, sell))) + '</span></div>';
      });
      h += '</div>';
    }
    h += '<div class="legend" style="margin:6px 0 0">این پیشنهادها فقط حساب ریاضی بر پایه اعداد و آستانه‌های خودت است (با ریسک‌پذیری فعلی)، نه توصیه سرمایه‌گذاری.</div></div>';
    el.innerHTML = h;
  }

  function enterCmp() {
    store.get("compare", function (arr) {
      STATE.cmp = Array.isArray(arr) ? arr : [];
      STATE.view = "cmp"; STATE.showSettings = false;
      renderAll();
    });
  }
  function renderCmpPage() {
    var html = '<div class="panel wide" id="panel"><div class="hd" id="drag"><b>⚖ مقایسه اختیارها</b>' +
      '<button id="back" class="wide" title="برگشت به چک‌لیست">→ چک‌لیست</button><button id="min" title="کوچک کردن">—</button></div>' +
      '<div class="bodywrap"><div class="body" id="body">' + riskHtml() + '<div id="cmpbody"></div></div><button class="sbtn up" title="بالا" data-sc="-1">▲</button><button class="sbtn dn" title="پایین" data-sc="1">▼</button></div>' +
      '<div class="foot"><button id="cpy">کپی جدول (برای اکسل)</button><button id="clr">پاک کردن همه</button></div></div>';
    mount.innerHTML = html;
    bind();
    updateRiskUi();
    update();
  }

  function riskLabel(a) {
    return a <= 2 ? "خیلی محتاط" : a <= 4 ? "محتاط" : a <= 6 ? "متعادل" : a <= 8 ? "ریسک‌پذیر" : "خیلی ریسک‌پذیر";
  }
  function fa(n) { return String(n).replace(/\d/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[d]; }); }
  function riskKeysMeta() { return OC.SETTINGS_META.filter(function (m) { return !!OC.RISK_KEYS[m[0]]; }); }
  function manualCount() { return Object.keys(OC.RISK_KEYS).filter(function (k) { return STATE.st[k] !== undefined; }).length; }
  function riskHtml() {
    var a = STATE.st.risk !== undefined ? STATE.st.risk : 5;
    return '<div class="risk ' + (STATE.riskOpen ? "open" : "") + '" id="riskcard"><div class="rh" id="rh"><span class="num">🎚</span><span class="tt">ریسک‌پذیری من</span>' +
      '<span class="cnt" id="mcnt"></span><span class="rl"><span id="rv">' + fa(a) + '</span> از ۱۰ — <span id="rl">' + riskLabel(a) + '</span></span></div>' +
      '<div class="rbody"><input type="range" min="1" max="10" step="1" value="' + a + '" id="riskr"><div class="ends"><span>محتاط</span><span>ریسک‌پذیر</span></div>' +
      '<div class="rs" id="rsum"></div>' +
      '<button class="thr-t" id="thrt"><span>تنظیم دستی آستانه‌ها</span><span>' + (STATE.showThr ? "▴" : "▾") + '</span></button>' +
      (STATE.showThr ? thrHtml() : "") + '</div></div>';
  }
  function thrHtml() {
    var h = '<div class="thr"><div class="hint">مقدارها با اسلایدر عوض می‌شوند. هر کدام را خودت تایپ کنی ثابت می‌ماند (با ↺ دوباره خودکار می‌شود).</div><div class="tg">';
    riskKeysMeta().forEach(function (m) {
      h += '<div class="trow"><label>' + esc(m[1]) + '</label><div class="ir"><input data-s="' + m[0] + '" data-kind="' + m[3] + '" data-r="1" inputmode="decimal">' +
        '<button class="rst" data-rst="' + m[0] + '" title="برگرد به خودکار">↺</button></div></div>';
    });
    return h + '</div><button class="all" id="allauto">همه را خودکار کن</button></div>';
  }
  function pctTxt(x) { return +(x * 100).toFixed(1) + "٪"; }
  function updateRiskUi() {
    var eff = OC.effective(STATE.st);
    var rv = root.getElementById("rv"), rl = root.getElementById("rl"), rs = root.getElementById("rsum"), mc = root.getElementById("mcnt");
    if (rv) rv.textContent = fa(eff.risk);
    if (rl) rl.textContent = riskLabel(eff.risk);
    if (rs) rs.textContent = "حداکثر ریسک هر معامله " + pctTxt(eff.riskpct) + " سرمایه · حداقل سود به ریسک " + eff.rrmin + " · حداکثر اسپرد " + pctTxt(eff.spread) +
      " · حاشیه امن احتمال " + pctTxt(eff.margin) + " · تا " + eff.maxwarn + " هشدار";
    if (mc) { var n = manualCount(); mc.textContent = n ? fa(n) + " دستی" : ""; mc.style.display = n ? "" : "none"; }
    var active = root.activeElement;
    root.querySelectorAll("[data-r]").forEach(function (el) {
      var k = el.dataset.s, man = STATE.st[k] !== undefined;
      el.classList.toggle("man", man);
      var rst = root.querySelector('[data-rst="' + k + '"]');
      if (rst) rst.classList.toggle("show", man);
      if (el === active) return;
      var v = man ? STATE.st[k] : eff[k];
      el.value = el.dataset.kind === "pct" ? +(v * 100).toFixed(2) : v;
    });
  }

  // ---- رندر اسکلت (فقط وقتی نوع یا حالت باز/بسته عوض شد)
  function renderAll() {
    if (STATE.collapsed) {
      mount.innerHTML = '<button class="mini" id="expand">' + (window.ComboLogo ? window.ComboLogo(18) : "📋") + ' دیده‌بان · اختیار</button>';
      mount.querySelector("#expand").onclick = function () { STATE.collapsed = false; window.ComboLazy.activate(); renderAll(); if (LZ.kick) LZ.kick(); };
      return;
    }
    if (STATE.view === "cmp") { renderCmpPage(); return; }
    var titles = STEP_TITLES();
    var digits = "۰۱۲۳۴۵۶۷۸۹";
    var html = '<div class="panel' + (STATE.view === "adv" ? " wide" : "") + '" id="panel"><div class="hd" id="drag"><b>' + (window.ComboLogo ? window.ComboLogo(20) : "📋") + 'دیده‌بان بورس · اختیار</b>' +
      '<button id="cmpb" class="wide" title="مقایسه اختیارها">⚖ مقایسه <span class="n" id="cmpn">' + cmpCount() + '</span></button>' +
      '<button id="gear" title="تنظیمات">⚙</button><button id="min" title="کوچک کردن">—</button></div>' +
      (STATE.view === "main" ? '<div class="verdict v-wait" id="verdict"></div>' : '') +
      '<div class="tabs">' + [["call", "خرید Call"], ["put", "خرید Put"], ["scall", "فروش Call"], ["sput", "فروش Put"], ["sug", "💡 پیشنهاد"], ["adv", "🧭 مشاور"]].map(function (t) {
        var vt = t[0] === "sug" || t[0] === "adv";
        var on = vt ? STATE.view === t[0] : (STATE.view !== "sug" && STATE.view !== "adv" && STATE.type === t[0]);
        return '<button data-t="' + t[0] + '" class="' + (on ? "on" : "") + (isSell(t[0]) ? " sell" : "") + '">' + t[1] + '</button>';
      }).join("") + '</div>' +
      '<div class="bodywrap"><div class="body" id="body">' + riskHtml();
    if (STATE.view === "sug") {
      html += '<div id="sugbody"></div>';
    } else if (STATE.view === "adv") {
      html += '<div id="advbody"></div>';
    } else if (STATE.showSettings) {
      html += '<div class="set"><h4>تنظیمات</h4><div class="note">آستانه‌های ریسک از بخش «تنظیم دستی آستانه‌ها» زیر اسلایدر عوض می‌شوند. اینجا فقط کارمزدها و مقدارهای ثابت است. کارمزدها تقریبی‌اند؛ با کارگزاری‌ات تطبیق بده.</div>';
      OC.SETTINGS_META.forEach(function (m) {
        if (OC.RISK_KEYS[m[0]]) return;
        var v = STATE.st[m[0]] !== undefined ? STATE.st[m[0]] : m[2];
        var shown = m[3] === "pct" ? +(v * 100).toFixed(4) : v;
        html += '<div class="trow"><label>' + esc(m[1]) + '</label><input data-s="' + m[0] + '" data-kind="' + m[3] + '" value="' + shown + '"></div>';
      });
      html += '<button class="all" id="resetset">بازگشت همه تنظیمات به پیش‌فرض</button></div>';
    } else {
      html += '<div class="note">اعداد بازار خودکار خوانده می‌شوند. اگر عددی نیامد، آن را روی صفحه انتخاب کن و ⌖ را بزن.</div><div class="rep" id="rep"></div>';
      STEPS.forEach(function (st_, i) {
        html += '<div class="step ' + (STATE.open[i] ? "open" : "") + '" data-n="' + i + '"><div class="sh"><span class="num">' + digits[i] + '</span><span class="tt">' +
          esc(titles[i].replace(/^مرحله [۰-۹]+ — /, "")) + '</span><span class="badge" id="badge' + i + '"></span></div><div class="sc"><div class="grid">';
        FIELDS.forEach(function (f) {
          if (f.step !== i) return;
          if (!fieldShown(f, STATE.type)) return;
          html += '<div class="fld' + (f.t === "yn" ? " full" : "") + '"><label>' + esc(fieldLabel(f, STATE.type)) + '</label>';
          if (f.t === "yn") {
            html += '<div class="yn" data-yn="' + f.k + '"><button data-v="بله">بله</button><button data-v="خیر">خیر</button></div>';
          } else {
            html += '<div class="ctl"><input data-k="' + f.k + '" class="' + (f.t === "text" ? "txt" : "") + '" inputmode="' + (f.t === "text" ? "text" : "decimal") + '">';
            if (f.sel) html += '<button class="pick" data-pick="' + f.k + '" title="پر کردن با عدد انتخاب‌شده روی صفحه">⌖</button>';
            html += '</div>';
          }
          html += '</div>';
        });
        html += '</div><div class="calc" id="calc' + i + '"></div><div id="msgs' + i + '"></div></div></div>';
      });
    }
    html += '</div><button class="sbtn up" title="بالا" data-sc="-1">▲</button><button class="sbtn dn" title="پایین" data-sc="1">▼</button></div><div class="foot"><button id="savecmp" class="pri">➕ ذخیره برای مقایسه</button><button id="reset">پاک کردن ورودی‌ها</button><button id="fill">به‌روزرسانی از سایت</button><button id="diag">گزارش اشکال</button></div></div>';
    mount.innerHTML = html;
    bind();
    hydrateInputs();
    updateRiskUi();
    update();
  }

  function hydrateInputs() {
    root.querySelectorAll("[data-yn]").forEach(function (g) {
      var cur = STATE.inp[g.dataset.yn];
      g.querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === cur); });
    });
    root.querySelectorAll("[data-k]").forEach(function (el) {
      var f = FIELDS.filter(function (x) { return x.k === el.dataset.k; })[0];
      var v = STATE.inp[el.dataset.k];
      if (v === undefined || v === null) { el.value = ""; return; }
      el.value = f.t === "pct" ? +(v * 100).toFixed(4) : v;
    });
  }

  function readField(el) {
    var f = FIELDS.filter(function (x) { return x.k === el.dataset.k; })[0];
    if (f.t === "yn" || f.t === "text") return el.value;
    var n = parseNum(el.value);
    if (n === null) return null;
    return f.t === "pct" ? n / 100 : n;
  }

  function bind() {
    var q = function (s) { return root.querySelector(s); };
    var gear = q("#gear"); if (gear) gear.onclick = function () { STATE.view = "main"; STATE.showSettings = !STATE.showSettings; renderAll(); };
    var min = q("#min"); if (min) min.onclick = function () { STATE.collapsed = true; renderAll(); };
    var vv = q("#verdict"); if (vv) vv.onclick = function () { STATE.vdetOpen = !STATE.vdetOpen; update(); };

    root.querySelectorAll(".tabs button").forEach(function (b) {
      b.onclick = function () {
        var t = b.dataset.t;
        if (t === "sug") { enterSug(); return; }
        if (t === "adv") { STATE.view = "adv"; STATE.showSettings = false; renderAll(); return; }
        STATE.type = t; STATE.view = "main"; persist(); renderAll();
      };
    });
    root.querySelectorAll(".step .sh").forEach(function (h) {
      h.onclick = function () {
        var s = h.parentNode, n = s.dataset.n, willOpen = !STATE.open[n];
        STATE.open = {};
        root.querySelectorAll(".step").forEach(function (x) { x.classList.remove("open"); });
        if (willOpen) { STATE.open[n] = true; s.classList.add("open"); }
      };
    });
    root.querySelectorAll("[data-k]").forEach(function (el) {
      var h = function () { STATE.inp[el.dataset.k] = readField(el); persist(); update(); };
      el.addEventListener("input", h);
      el.addEventListener("change", h);
    });
    root.querySelectorAll("[data-yn]").forEach(function (g) {
      g.querySelectorAll("button").forEach(function (b) {
        b.onclick = function () {
          var k = g.dataset.yn;
          STATE.inp[k] = STATE.inp[k] === b.dataset.v ? "" : b.dataset.v;
          persist(); hydrateInputs(); update();
        };
      });
    });
    var rh = q("#rh"); if (rh) rh.onclick = function () {
      STATE.riskOpen = !STATE.riskOpen; persistUi();
      q("#riskcard").classList.toggle("open", STATE.riskOpen);
    };
    var thrt = q("#thrt"); if (thrt) thrt.onclick = function () { STATE.showThr = !STATE.showThr; renderAll(); };
    var allauto = q("#allauto"); if (allauto) allauto.onclick = function () {
      Object.keys(OC.RISK_KEYS).forEach(function (k) { delete STATE.st[k]; });
      persistSettings(); updateRiskUi(); update();
    };
    root.querySelectorAll("[data-rst]").forEach(function (b) {
      b.onclick = function () { delete STATE.st[b.dataset.rst]; persistSettings(); updateRiskUi(); update(); };
    });
    root.querySelectorAll("[data-pick]").forEach(function (b) {
      b.addEventListener("mousedown", function (e) { e.preventDefault(); });
      b.onclick = function () {
        var n = parseNum(lastSel || selText());
        var input = root.querySelector('[data-k="' + b.dataset.pick + '"]');
        if (n === null) { input.style.outline = "2px solid #c00"; setTimeout(function () { input.style.outline = ""; }, 900); return; }
        input.value = n; STATE.inp[b.dataset.pick] = n; persist(); update();
        input.style.outline = "2px solid #2e9a4a"; setTimeout(function () { input.style.outline = ""; }, 700);
      };
    });
    root.querySelectorAll("[data-s]").forEach(function (el) {
      el.addEventListener("input", function () {
        var k = el.dataset.s, isRisk = !!OC.RISK_KEYS[k];
        var n = parseNum(el.value);
        if (String(el.value).trim() === "") {
          if (isRisk) { delete STATE.st[k]; persistSettings(); updateRiskUi(); update(); }
          return;
        }
        if (n === null) return;
        STATE.st[k] = el.dataset.kind === "pct" ? n / 100 : n;
        persistSettings(); updateRiskUi(); update();
      });
      el.addEventListener("blur", function () { updateRiskUi(); });
    });
    var rr_ = q("#riskr");
    if (rr_) rr_.addEventListener("input", function () {
      STATE.st.risk = Number(rr_.value); persistSettings(); updateRiskUi(); update();
    });
    var rs = q("#resetset"); if (rs) rs.onclick = function () { STATE.st = {}; persistSettings(); renderAll(); };
    if (q("#reset")) q("#reset").onclick = function () { if (confirm("همه ورودی‌های این صفحه پاک شود؟")) { STATE.inp = {}; persist(); renderAll(); } };
    if (q("#fill")) q("#fill").onclick = function () { runAuto(false); };
    if (q("#diag")) q("#diag").onclick = copyDiag;
    var cmpb = q("#cmpb"); if (cmpb) cmpb.onclick = enterCmp;
    var savecmp = q("#savecmp"); if (savecmp) savecmp.onclick = function () { saveCmp(savecmp); };
    var back = q("#back"); if (back) back.onclick = function () { STATE.view = "main"; renderAll(); };
    var cpy = q("#cpy"); if (cpy) cpy.onclick = function () {
      var t = STATE.tsv || "";
      try { navigator.clipboard.writeText(t).then(function () { cpy.textContent = "✔ کپی شد"; setTimeout(function () { cpy.textContent = "کپی جدول (برای اکسل)"; }, 1300); }, function () { prompt("این متن را کپی کن:", t); }); }
      catch (e) { prompt("این متن را کپی کن:", t); }
    };
    var clr = q("#clr"); if (clr) clr.onclick = function () {
      if (confirm("همه اختیارهای ذخیره‌شده برای مقایسه پاک شود؟")) { store.set("compare", []); STATE.cmp = []; renderCmpBody(); }
    };
    // جابه‌جایی پنل
    var drag = q("#drag");
    if (drag) drag.addEventListener("mousedown", function (e) {
      if (e.target.tagName === "BUTTON") return;
      var r = host.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      function mv(ev) { host.style.left = Math.max(0, ev.clientX - dx) + "px"; host.style.top = Math.max(0, ev.clientY - dy) + "px"; }
      function up() { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); }
      document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
    });
  }

  // ---- به‌روزرسانی نتایج (بدون بازسازی ورودی‌ها)
  function update() {
    if (STATE.collapsed) return;
    if (STATE.view === "cmp") { renderCmpBody(); return; }
    if (STATE.showSettings) return;
    var res = OC.evaluate(STATE.type, STATE.inp, STATE.st, STATE.an);
    var v = root.getElementById("verdict");
    if (v) {
      var cls = { "✅": "v-ok", "❌": "v-bad", "⚠": "v-warn", "⏳": "v-wait" }[res.final.sym];
      v.className = "verdict " + cls;
      v.textContent = "«" + MODE_LABEL[STATE.type] + "»: " + res.final.sym + " " + res.final.text;
      window.AdvisorUI.paintVerdict(root, STATE, res, STEP_TITLES());
    }
    if (STATE.view === "sug") { renderSugBody(); return; }
    if (STATE.view === "adv") { var ab = root.getElementById("advbody"); if (ab && !ab.firstChild) advUI.mount(ab); else advUI.refresh(); return; }
    for (var i = 0; i < 7; i++) {
      var badge = root.getElementById("badge" + i);
      var calc = root.getElementById("calc" + i);
      var msgs = root.getElementById("msgs" + i);
      if (!calc) continue;
      var stp = res.steps[i];
      if (badge) badge.textContent = stp ? stp.status : "";
      calc.innerHTML = res.rows.filter(function (r) { return r.step === i; }).map(function (r) {
        return '<div class="cr" title="' + esc(r.help) + '"><span>' + esc(r.label) + '</span><span>' + esc(fmt(r.v, r.fmt)) + '</span></div>';
      }).join("");
      var m = "";
      if (stp) {
        if (stp.missing) m = '<div class="msg wait">⏳ ورودی ناقص — خانه‌های خالی این مرحله را پر کن</div>';
        else {
          stp.hard.forEach(function (t) { m += '<div class="msg h">❌ ' + esc(t) + "</div>"; });
          stp.warn.forEach(function (t) { m += '<div class="msg w">⚠ ' + esc(t) + "</div>"; });
          if (!stp.hard.length && !stp.warn.length) m = '<div class="msg ok">✅ عبور</div>';
        }
      }
      if (i === 4 && res.R.pSug !== null && res.R.pSug !== undefined) {
        var sug = Math.floor(res.R.pSug * 20) / 20;
        m += '<button class="usep" data-usep="' + sug + '">استفاده از احتمال پیشنهادی (' + Math.round(sug * 100) + '٪) به‌عنوان احتمال من</button>';
      }
      msgs.innerHTML = m;
    }
  }

  // ---- خواندن خودکار اعداد از سایت
  var DIAG = [];
  var autoBusy = false;
  function showReport(items) {
    var el = root.getElementById("rep");
    if (!el) return;
    el.innerHTML = items.map(function (r) {
      return '<div class="' + (r.ok === true ? "o" : r.ok === false ? "x" : "t") + '">' + (r.ok === true ? "✔ " : r.ok === false ? "✖ " : "") + esc(r.t) + "</div>";
    }).join("");
  }
  function pageText() {
    return (document.title || "") + "\n" + (document.body ? document.body.innerText : "");
  }
  async function runAuto(silent) {
    if (autoBusy) return;
    autoBusy = true;
    try {
      DIAG = ["url: " + location.href, "time: " + new Date().toISOString()];
      var code = OCC.insCodeFromUrl(location.href);
      var opt = OCC.parseOptionName(pageText());
      DIAG.push("insCode=" + code + " optionName=" + (opt ? JSON.stringify(opt) : "NOT FOUND"));
      if (!code || !opt) {
        if (!silent) showReport([{ ok: false, t: "این صفحه، صفحه نماد اختیار نیست (یا نام نماد هنوز بالا نیامده). صفحه یک اختیار خرید/فروش را باز کن." }]);
        return;
      }
      showReport([{ t: "در حال خواندن از سایت…" }]);
      var res = await OCC.collect(opt, code, DIAG);
      STATE.type = (isSell(STATE.type) ? "s" : "") + opt.type;
      Object.keys(res.inp).forEach(function (k) { STATE.inp[k] = res.inp[k]; });
      if (res.an && (res.an.rets || res.an.power !== undefined)) STATE.an = res.an;
      STATE.inp.base_sym = opt.base;
      STATE.inp.exp_date = opt.jy + "/" + pd2(opt.jm) + "/" + pd2(opt.jd);
      if (res.underCode) {
        STATE.inp.under_code = res.underCode;
        try {
          var sres = await SCC.collect(res.underCode, DIAG);
          STATE.under = { code: res.underCode, inp: sres.inp, an: sres.an };
          CS.set("ctx:" + res.underCode, { at: Date.now(), inp: sres.inp, an: sres.an });
          await new Promise(function (r) { loadUnderFin(res.underCode, r); });
          res.rep.push(sres.an && sres.an.bars
            ? { ok: true, t: "تحلیل تکنیکال سهم پایه آماده شد (" + sres.an.bars.length + " روز سابقه) — در تب «🧭 مشاور» استفاده می‌شود" }
            : { ok: false, t: "سابقه ۲۵۰ روزه‌ی سهم پایه خوانده نشد؛ تحلیل تکنیکال در مشاور محدود می‌شود" });
        } catch (e2) { DIAG.push("UNDER EXCEPTION " + e2); }
      }
      // اندازه قرارداد از صفحه (برچسب «اندازه قرارداد»)
      var sm = pageText().match(/اندازه\s*قرارداد[^\d۰-۹]{0,12}([\d۰-۹٬,]+)/);
      if (sm) {
        var sz = parseNum(sm[1]);
        if (sz && sz !== (STATE.st.size || OC.DEFAULTS.size)) {
          STATE.st.size = sz; persistSettings();
          res.rep.push({ ok: true, t: "اندازه قرارداد " + sz + " (از صفحه؛ در تنظیمات هم اعمال شد)" });
        }
      }
      persist();
      renderAll();
      showReport(res.rep);
    } catch (e) {
      DIAG.push("EXCEPTION " + e);
      showReport([{ ok: false, t: "خطا در خواندن: " + e }]);
    } finally { autoBusy = false; }
  }
  function copyDiag() {
    var txt = DIAG.join("\n");
    try { navigator.clipboard.writeText(txt).then(function () { alert("گزارش کپی شد؛ همین را برای من بفرست."); }, function () { prompt("این متن را کپی کن:", txt); }); }
    catch (e) { prompt("این متن را کپی کن:", txt); }
  }

  root.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest("[data-usep]");
    if (!b) return;
    STATE.inp.p = Number(b.dataset.usep); persist(); hydrateInputs(); update();
  });


  // ================= مشاور ترکیبی (تحلیل سهم پایه + زنجیره اختیارها) =================
  function advCtx() {
    var u = STATE.under || {};
    return {
      S: Number(STATE.inp.S) > 0 ? Number(STATE.inp.S) : null,
      an: (u.an && u.an.bars) ? u.an : STATE.an,
      stockInp: u.inp || {}, stockSt: {}, optSt: STATE.st, fin: underFinView(),
      baseSym: STATE.inp.base_sym || null,
      currentCode: OCC.insCodeFromUrl(location.href),
    };
  }
  function applyAdvice(A) {
    var V = A.view;
    if (isSell(STATE.type)) { alert("خانه‌های هدف و احتمال فقط در حالت‌های خرید هست. برای فروش، جدول مشاور و تب «💡 پیشنهاد» را ببین."); return; }
    if (!V || !V.ok) { alert("تحلیل تکنیکال سهم در دسترس نیست."); return; }
    var call = STATE.type === "call";
    var T = Math.round(call ? V.tUp : V.tDn);
    STATE.inp.T = T;
    var S = Number(STATE.inp.S), td = Number(STATE.inp.tdov) > 0 ? Number(STATE.inp.tdov) : Math.round(Number(STATE.inp.cal_days) * 5 / 7 * 0.92);
    var An = OC.analyze(call, STATE.an, S, T, td);
    if (An && An.pSug !== null && An.pSug !== undefined) STATE.inp.p = Math.round(An.pSug * 100) / 100;
    persist(); STATE.view = "main"; renderAll();
  }
  var advUI = window.AdvisorUI.create(root, { getContext: advCtx, origin: location.origin, onApply: applyAdvice });

  // ---- شروع
  var LZ = { kick: null };
  mount.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest(".sbtn") : null; if (!b) return;
    var bd = root.getElementById("body"); if (bd) bd.scrollBy({ top: Number(b.dataset.sc) * Math.max(120, bd.clientHeight * 0.6), behavior: "smooth" });
  });
  store.get("compare", function (c) { STATE.cmp = Array.isArray(c) ? c : []; refreshCmpBadge(); });
  store.get("ui", function (u) { if (u && u.riskOpen !== undefined) STATE.riskOpen = !!u.riskOpen; });
  store.get("settings", function (s) {
    STATE.st = s || {};
    getDraft(pageKey, function (d) {
      if (d) { STATE.type = d.type || "call"; STATE.inp = d.inp || {}; STATE.an = d.an || null; }
      if (STATE.inp.under_code) CS.get("ctx:" + STATE.inp.under_code, function (u) { if (u && u.an) { STATE.under = { code: STATE.inp.under_code, inp: u.inp, an: u.an }; loadUnderFin(STATE.inp.under_code, function () { if (STATE.view === "adv" || STATE.view === "sug") renderAll(); }); } });
      renderAll();   // پیش‌فرض بسته: فقط دکمه‌ی کوچک؛ خواندن و تحلیل بعد از اولین باز کردن شروع می‌شود
      host.style.display = "none";
      var visible = false, decided = false, checks = 0, pending = true, lastHref = location.href;
      function detect() { visible = !!(OCC.insCodeFromUrl(location.href) && OCC.parseOptionName(pageText())); host.style.display = visible ? "" : "none"; return visible; }
      LZ.kick = function () { if (pending && visible && !STATE.collapsed) { pending = false; runAuto(true); } };
      // یک تایمر سبک: فقط تا وقتی نوع صفحه معلوم نشده متن صفحه را می‌خواند (حداکثر ~۲۰ ثانیه) و بعد از آن هیچ کاری نمی‌کند
      setInterval(function () {
        if (location.href !== lastHref) {
          lastHref = location.href; decided = false; checks = 0;
          if (keyNow() !== pageKey) {
            pageKey = keyNow(); pending = true;
            getDraft(pageKey, function (d) {
              STATE.inp = (d && d.inp) || {}; STATE.type = (d && d.type) || STATE.type; STATE.an = (d && d.an) || null; STATE.under = null; STATE.underFin = null; STATE.view = "main";
              renderAll();
            });
          }
        }
        if (decided) return;
        checks++;
        if (detect()) { decided = true; LZ.kick(); }
        else if (checks > 14) decided = true;
      }, 1500);
    });
  });
})();

}catch(e){try{console.error('didehban:content-opt.js',e)}catch(_){}}

}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',function(){setTimeout(__dbIdle,0)});}else{setTimeout(__dbIdle,0);}
})();
