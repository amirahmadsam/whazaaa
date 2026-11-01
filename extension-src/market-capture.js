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
