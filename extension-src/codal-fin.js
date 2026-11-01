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
