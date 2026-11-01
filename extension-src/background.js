// دریافت JSON از API سایت (در پس‌زمینه تا مشکل CORS نداشته باشد)
chrome.runtime.onMessage.addListener(function (msg, sender, send) {
  if (msg && msg.t === "fetch" && /^https:\/\/cdn\.tsetmc\.(com|ir)\/api\//.test(msg.url)) {
    fetch(msg.url, { headers: { Accept: "application/json" } })
      .then(function (r) {
        return r.text().then(function (tx) {
          var j = null;
          try { j = JSON.parse(tx); } catch (e) {}
          send({ ok: r.ok && j !== null, status: r.status, json: j, snippet: tx.slice(0, 100) });
        });
      })
      .catch(function (e) { send({ ok: false, err: String(e) }); });
    return true;
  }
});

// دریافت فهرست اطلاعیه‌های کدال (فقط API جست‌وجوی خود کدال)
chrome.runtime.onMessage.addListener(function (msg, sender, send) {
  if (msg && msg.t === "codal" && /^https:\/\/search\.codal\.ir\/api\/search\/v2\/q\?/.test(msg.url)) {
    fetch(msg.url, { headers: { Accept: "application/json" } })
      .then(function (r) {
        return r.text().then(function (tx) {
          var j = null;
          try { j = JSON.parse(tx); } catch (e) {}
          send({ ok: r.ok && j !== null, status: r.status, json: j, snippet: tx.slice(0, 120) });
        });
      })
      .catch(function (e) { send({ ok: false, err: String(e) }); });
    return true;
  }
});

// دریافت فایل اکسل صورت مالی از کدال (به‌صورت base64)
chrome.runtime.onMessage.addListener(function (msg, sender, send) {
  if (msg && msg.t === "codalbin" && /^https:\/\/([a-z0-9-]+\.)*codal\.ir\//i.test(msg.url)) {
    fetch(msg.url, { credentials: "omit" })
      .then(function (r) {
        if (!r.ok) { send({ ok: false, status: r.status }); return; }
        return r.arrayBuffer().then(function (buf) {
          var bytes = new Uint8Array(buf), bin = "";
          for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
          send({ ok: true, size: bytes.length, b64: btoa(bin) });
        });
      })
      .catch(function (e) { send({ ok: false, err: String(e) }); });
    return true;
  }
});

// باز کردن صفحه‌ی دیده‌بان بازار در یک تب پس‌زمینه، منتظر ماندن تا افزونه (market-capture.js) جدول/پاسخ آن را ذخیره کند، و بستن تب
chrome.runtime.onMessage.addListener(function (msg, sender, send) {
  if (!msg || msg.t !== "mwpage") return;
  var url = "https://main.tsetmc.com/MarketWatch", start = Date.now(), tabId = null, done = false, keep = null, to = null;
  function finish(ok, info) {
    if (done) return; done = true;
    try { chrome.storage.onChanged.removeListener(on); } catch (e) {}
    clearTimeout(to); clearInterval(keep);
    if (tabId !== null) chrome.tabs.remove(tabId, function () { void chrome.runtime.lastError; });
    send(Object.assign({ ok: ok }, info || {}));
  }
  function on(ch, area) {
    var c = area === "local" && ch["mkt:snap"]; if (!c || !c.newValue) return;
    var v = c.newValue;
    if (v.at >= start && v.arr && v.arr.length >= 100) setTimeout(function () { finish(true, { n: v.arr.length, dom: !!v.dom }); }, 300);
  }
  chrome.storage.onChanged.addListener(on);
  keep = setInterval(function () { try { chrome.runtime.getPlatformInfo(function () { void chrome.runtime.lastError; }); } catch (e) {} }, 20000);
  to = setTimeout(function () { finish(false, { err: "تا " + Math.round((msg.timeout || 70000) / 1000) + " ثانیه چیزی از صفحه‌ی دیده‌بان بازار ذخیره نشد" }); }, msg.timeout || 70000);
  chrome.tabs.create({ url: url, active: false }, function (t) {
    if (chrome.runtime.lastError || !t) finish(false, { err: "باز کردن تب ناموفق: " + (chrome.runtime.lastError ? chrome.runtime.lastError.message : "") });
    else tabId = t.id;
  });
  return true;
});
