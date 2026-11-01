/* خواندن خودکار اعداد از TSETMC: نام نماد (قیمت اعمال/سررسید) + APIهای cdn.tsetmc.com */
(function (root) {
  "use strict";

  var BASES = ["https://cdn.tsetmc.com/api/", "https://cdn.tsetmc.ir/api/"];

  function fa(s) {
    return String(s || "").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[‌‎‏]/g, "").trim();
  }
  function latin(s) {
    return String(s).replace(/[۰-۹]/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹".indexOf(d); })
      .replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); });
  }

  // تبدیل تاریخ جلالی به میلادی
  function j2g(jy, jm, jd) {
    jy += 1595;
    var days = -355668 + (365 * jy) + (~~(jy / 33)) * 8 + ~~(((jy % 33) + 3) / 4) + jd + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
    var gy = 400 * ~~(days / 146097);
    days %= 146097;
    if (days > 36524) { gy += 100 * ~~(--days / 36524); days %= 36524; if (days >= 365) days++; }
    gy += 4 * ~~(days / 1461);
    days %= 1461;
    if (days > 365) { gy += ~~((days - 1) / 365); days = (days - 1) % 365; }
    var gd = days + 1;
    var sal = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    var gm;
    for (gm = 0; gm < 13 && gd > sal[gm]; gm++) gd -= sal[gm];
    return [gy, gm, gd];
  }
  function daysUntil(jy, jm, jd, now) {
    now = now || new Date();
    var g = j2g(jy, jm, jd);
    var a = Date.UTC(g[0], g[1] - 1, g[2]);
    var b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((a - b) / 86400000);
  }

  // مثال: «اختیارخ فملی-16000-1405/10/09 (ضملی1000)»
  function parseOptionName(text) {
    var t = fa(latin(text));
    var m = t.match(/اختیار\s*([خف])\s*([^\s\-()]+)\s*-\s*(\d+(?:\.\d+)?)\s*-\s*(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s*[(（]\s*([^()（）\n]{1,30}?)\s*[)）])?/);
    if (!m) return null;
    return { type: m[1] === "خ" ? "call" : "put", base: m[2], strike: Number(m[3]), jy: +m[4], jm: +m[5], jd: +m[6], sym: m[7] || null };
  }
  function insCodeFromUrl(href) {
    var m = String(href).match(/instinfo\/(\d{6,})/i) || String(href).match(/[?&]i=(\d{6,})/i);
    return m ? m[1] : null;
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

  function pick(row, re) {
    for (var k in row) if (re.test(k)) return row[k];
    return undefined;
  }
  function avg(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }

  async function collect(opt, insCode, log) {
    var inp = {}, rep = [], an = {};
    function ok(t) { rep.push({ ok: true, t: t }); }
    function bad(t) { rep.push({ ok: false, t: t }); }

    if (opt.sym) { inp.name_o = opt.sym; ok("نماد اختیار " + opt.sym + " (از داخل پرانتز کنار تاریخ)"); }
    inp.K = opt.strike;
    ok("قیمت اعمال " + opt.strike + " (از نام نماد)");
    var d = daysUntil(opt.jy, opt.jm, opt.jd);
    inp.cal_days = d;
    ok("سررسید " + opt.jy + "/" + opt.jm + "/" + opt.jd + " → " + d + " روز تقویمی");
    if (d < 0) bad("تاریخ سررسید گذشته است");

    var results = await Promise.all([
      api("BestLimits/" + insCode, log),
      api("ClosingPrice/GetClosingPriceDailyList/" + insCode + "/30", log),
      api("Instrument/GetInstrumentSearch/" + encodeURIComponent(opt.base), log),
    ]);
    var bl = results[0], dl = results[1], se = results[2];

    // دفتر سفارش اختیار
    var rows = bl && (bl.bestLimits || bl.bestLimit);
    if (rows && rows.length) {
      var r1 = rows.filter(function (r) { return pick(r, /^number$/i) === 1; })[0] || rows[0];
      var ask = pick(r1, /^pMeOf$/i), bid = pick(r1, /^pMeDem$/i), bv = pick(r1, /^qTitMeDem$/i);
      if (ask !== undefined && bid !== undefined) {
        inp.ask = Number(ask); inp.bid = Number(bid);
        ok("بهترین فروش " + inp.ask + " | بهترین خرید " + inp.bid);
        if (bv !== undefined) { inp.bidvol = Number(bv); ok("حجم صف خرید " + inp.bidvol); }
      } else { bad("ساختار دفتر سفارش ناشناخته بود (کلیدها: " + Object.keys(r1).join(",") + ")"); }
    } else bad("دفتر سفارش اختیار خوانده نشد");

    // حجم روزانه اختیار
    var list = dl && dl.closingPriceDaily;
    if (list && list.length) {
      list = list.slice().sort(function (a, b) { return b.dEven - a.dEven; });
      var vols = list.map(function (x) { return Number(x.qTotTran5J); }).filter(function (x) { return x > 0; }).slice(0, 20);
      if (vols.length) { inp.vol_o = Math.round(avg(vols)); ok("میانگین حجم روزانه اختیار " + inp.vol_o + " (روزهای معامله‌شده، تا ۲۰ روز اخیر)"); }
      else bad("سابقه حجم اختیار خالی بود");
    } else bad("سابقه معاملات اختیار خوانده نشد");

    // سهم پایه
    var under = null;
    if (se && se.instrumentSearch) {
      var nb = fa(opt.base);
      var c = se.instrumentSearch.filter(function (x) { return fa(x.lVal18AFC) === nb; });
      under = c[0] || null;
    }
    if (!under) { bad("سهم پایه «" + opt.base + "» پیدا نشد"); return { inp: inp, rep: rep, an: an }; }
    ok("سهم پایه: " + opt.base);
    var underCode = under.insCode;
    var u = await Promise.all([
      api("ClosingPrice/GetClosingPriceInfo/" + under.insCode, log),
      api("ClosingPrice/GetClosingPriceDailyList/" + under.insCode + "/250", log),
      api("ClientType/GetClientType/" + under.insCode + "/1/0", log),
    ]);
    var ui = u[0] && u[0].closingPriceInfo;
    if (ui) {
      var S = Number(ui.pDrCotVal) > 0 ? Number(ui.pDrCotVal) : Number(ui.pClosing);
      if (S > 0) { inp.S = S; ok("آخرین معامله سهم پایه " + S); } else bad("قیمت سهم پایه صفر بود");
      var et = ui.instrumentState && ui.instrumentState.cEtaval;
      if (et) {
        if (/^A/.test(et)) { inp.q_halt = "بله"; ok("وضعیت سهم پایه مجاز (" + et + ")"); }
        else if (/^I/.test(et)) { inp.q_halt = "خیر"; bad("سهم پایه ممنوع/متوقف است (" + et + ")"); }
      }
    } else bad("قیمت سهم پایه خوانده نشد");
    var ul = u[1] && u[1].closingPriceDaily;
    if (ul && ul.length) ul = ul.slice().sort(function (a, b) { return b.dEven - a.dEven; });
    if (ul && ul.length) {
      // بازده روزانه نسبت به قیمت پایه دیروز (مقاوم در برابر افزایش سرمایه/تعدیل)
      var rets = [];
      ul.slice().reverse().forEach(function (x) {
        var c = Number(x.pClosing), y = Number(x.priceYesterday);
        if (c > 0 && y > 0 && Math.abs(c / y - 1) < 0.25) rets.push(c / y - 1);
      });
      an.rets = rets;
      var vals = ul.map(function (x) { return Number(x.qTotCap) / 1e9; }).filter(function (x) { return x > 0; }).slice(0, 20);
      if (vals.length) { inp.val_u = Math.round(avg(vals)); ok("میانگین ارزش معاملات روزانه سهم پایه " + inp.val_u + " میلیارد ریال"); }
      if (an.rets && an.rets.length >= 20) ok("سابقه " + an.rets.length + " روز سهم پایه برای تحلیل آماری خوانده شد");
      else bad("سابقه سهم پایه برای تحلیل آماری کافی نیست");
    } else bad("سابقه معاملات سهم پایه خوانده نشد");
    var ct = u[2] && u[2].clientType;
    if (ct && Number(ct.buy_CountI) > 0 && Number(ct.sell_CountI) > 0 && Number(ct.sell_I_Volume) > 0) {
      an.power = (Number(ct.buy_I_Volume) / Number(ct.buy_CountI)) / (Number(ct.sell_I_Volume) / Number(ct.sell_CountI));
      ok("قدرت خریدار حقیقی " + an.power.toFixed(2));
    } else bad("اطلاعات حقیقی/حقوقی خوانده نشد");
    return { inp: inp, rep: rep, an: an, underCode: underCode };
  }

  root.OCCollect = { collect: collect, parseOptionName: parseOptionName, insCodeFromUrl: insCodeFromUrl, daysUntil: daysUntil, j2g: j2g, fa: fa };
  if (typeof module !== "undefined" && module.exports) module.exports = root.OCCollect;
})(typeof self !== "undefined" ? self : this);
