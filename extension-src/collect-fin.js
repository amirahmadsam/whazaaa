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
