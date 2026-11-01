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
