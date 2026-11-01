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
