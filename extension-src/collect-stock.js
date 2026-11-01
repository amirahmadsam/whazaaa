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
