/* پوسته‌ی اپ: جستجوی نماد، و تمام‌صفحه کردن پنل افزونه. داده‌ها از API سایت (از طریق پل اپ) گرفته می‌شود. */
(function () {
  "use strict";
  var P = new URLSearchParams(location.search), code = P.get("i") || "", name = P.get("n") || "";
  var MW = /marketwatch/i.test(location.pathname), HDR = 52;
  function $(s) { return document.querySelector(s); }
  function api(path, cb) {
    try { chrome.runtime.sendMessage({ t: "fetch", url: "https://cdn.tsetmc.com/api/" + path }, function (r) { cb(r || { ok: false }); }); }
    catch (e) { cb({ ok: false, err: String(e) }); }
  }
  function go(c, n) {
    var rec = [];
    chrome.storage.local.get("app:recent", function (o) {
      rec = (o && o["app:recent"]) || [];
      rec = [{ i: c, n: n }].concat(rec.filter(function (x) { return x.i !== c; })).slice(0, 12);
      chrome.storage.local.set({ "app:recent": rec }, function () {
        location.href = "app.html?i=" + encodeURIComponent(c) + "&n=" + encodeURIComponent(n);
      });
    });
  }
  function addBtn(box, c, sym, full) {
    var b = document.createElement("button"); b.className = "it";
    var s = document.createElement("b"); s.textContent = sym || full || c;
    var f = document.createElement("span"); f.textContent = sym && full ? full : "";
    b.appendChild(s); b.appendChild(f);
    b.onclick = function () { go(c, full || sym); };
    box.appendChild(b);
  }

  $("#bSearch").onclick = function () { location.href = "app.html"; };
  $("#bMkt").onclick = function () { location.href = "marketwatch.html"; };

  if (!window.__dbNative) {
    var h = $("#home"); h.hidden = false;
    $("#msg").textContent = "پل برنامه فعال نیست. «Android System WebView» را به‌روز کن و برنامه را دوباره باز کن.";
    $("#q").hidden = true; return;
  }

  // ---------- صفحه‌ی جستجو
  function showHome() {
    $("#home").hidden = false;
    var q = $("#q"), res = $("#res"), msg = $("#msg"), timer = null, seq = 0;
    chrome.storage.local.get("app:recent", function (o) {
      var rec = (o && o["app:recent"]) || [];
      if (!rec.length) return;
      $("#recT").hidden = false;
      rec.forEach(function (x) { addBtn($("#rec"), x.i, "", x.n); });
    });
    msg.textContent = "نام نماد یا سهم را بنویس. اختیار معامله را هم با نامش (مثل «ضفولاد» یا «طفولاد») پیدا می‌کنی.";
    function norm(s) { return s.replace(/ي/g, "ی").replace(/ك/g, "ک").trim(); }
    function arab(s) { return s.replace(/ی/g, "ي").replace(/ک/g, "ك"); }
    function items(r) { var j = r && r.json, a = j && (j.instrumentSearch || j.instrument || j); return Array.isArray(a) ? a : []; }
    function run(t) {
      var my = ++seq;
      function show(a, r) {
        if (my !== seq) return;
        res.textContent = "";
        if (!a.length) { msg.textContent = r && r.ok ? "چیزی پیدا نشد." : "خطا در دریافت از سایت: " + ((r && (r.err || r.status)) || "بدون پاسخ"); return; }
        msg.textContent = "";
        a.slice(0, 40).forEach(function (x) { addBtn(res, String(x.insCode), x.lVal18AFC, x.lVal30); });
      }
      msg.textContent = "در حال جستجو…";
      api("Instrument/GetInstrumentSearch/" + encodeURIComponent(norm(t)), function (r) {
        var a = items(r);
        if (a.length || !(r && r.ok)) return show(a, r);
        api("Instrument/GetInstrumentSearch/" + encodeURIComponent(arab(norm(t))), function (r2) { show(items(r2), r2); });
      });
    }
    q.oninput = function () {
      clearTimeout(timer);
      var t = q.value.trim();
      if (t.length < 2) { res.textContent = ""; return; }
      timer = setTimeout(function () { run(t); }, 450);
    };
  }

  // ---------- نام نماد (برای تشخیص اختیار/سهم، پنل متن صفحه را می‌خواند)
  function resolveName() {
    $("#title").textContent = "…";
    api("Instrument/GetInstrumentInfo/" + code, function (r) {
      var ii = r && r.json && r.json.instrumentInfo, n = ii && (ii.lVal30 || ii.lVal18AFC);
      if (n) location.replace("app.html?i=" + encodeURIComponent(code) + "&n=" + encodeURIComponent(n));
      else { $("#title").textContent = "نماد " + code; $("#wait").hidden = false; $("#wait").textContent = "نام نماد خوانده نشد: " + ((r && (r.err || r.status)) || ""); }
    });
  }

  // ---------- تمام‌صفحه کردن پنل
  var CSS = ":host{display:block}" +
    ".panel{width:100% !important;max-width:none !important;height:calc(100vh - " + HDR + "px) !important;max-height:none !important;" +
    "border-radius:0 !important;border:0 !important;box-shadow:none !important}" +
    "#min{display:none !important}";
  function tune() {
    ["sc-checklist-host", "oc-checklist-host"].forEach(function (id) {
      var h = document.getElementById(id); if (!h || !h.shadowRoot) return;
      if (!h.__t) { h.__t = 1; var st = document.createElement("style"); st.textContent = CSS; h.shadowRoot.appendChild(st); }
      var pos = { top: HDR + "px", left: "0", right: "0", bottom: "0" };
      for (var k in pos) h.style.setProperty(k, pos[k], "important");
      if (h.style.display !== "none") {
        $("#wait").hidden = true;
        var ex = h.shadowRoot.querySelector("#expand");
        if (ex && !h.__x) { h.__x = 1; ex.click(); }
      }
    });
  }

  if (MW) { $("#title").textContent = "دیده‌بان بازار"; $("#wait").hidden = false; setInterval(tune, 400); }
  else if (code) {
    if (!name) resolveName();
    else {
      $("#title").textContent = name; document.title = name;
      $("#wait").hidden = false; setInterval(tune, 400);
    }
  } else showHome();
})();
