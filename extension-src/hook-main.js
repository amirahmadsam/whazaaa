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
