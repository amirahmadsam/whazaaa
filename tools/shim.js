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
