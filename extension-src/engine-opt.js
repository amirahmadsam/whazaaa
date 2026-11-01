/* موتور محاسبات چک‌لیست اختیار معامله — همان منطق فایل اکسل (Call و Put) */
(function (root) {
  "use strict";

  // [key, label, default, kind]  kind: pct => ذخیره به صورت کسر، نمایش به درصد
  var SETTINGS_META = [
    ["size", "حجم هر قرارداد (تعداد سهم)", 1000, "num"],
    ["lim", "دامنه نوسان روزانه سهم پایه (٪)", 0.03, "pct"],
    ["fee_opt", "کارمزد معامله اختیار (٪) ⚠ تقریبی", 0.001, "pct"],
    ["fee_ex", "کارمزد خرید سهم (٪) ⚠ تقریبی", 0.0037, "pct"],
    ["fee_sell", "کارمزد + مالیات فروش سهم (٪) ⚠ تقریبی", 0.0088, "pct"],
    ["atm", "محدوده نزدیک قیمت اعمال - ATM (٪)", 0.02, "pct"],
    ["mindays", "حداقل روز معاملاتی تا سررسید", 10, "num"],
    ["spread", "حداکثر اسپرد مجاز (٪)", 0.05, "pct"],
    ["minvol", "حداقل میانگین حجم روزانه اختیار", 200, "num"],
    ["volx", "حداقل حجم روزانه نسبت به تعداد خرید (برابر)", 20, "num"],
    ["valu", "حداقل ارزش معاملات روزانه سهم پایه (میلیارد ریال)", 100, "num"],
    ["riskpct", "حداکثر درصد سرمایه در خطر هر معامله (٪)", 0.03, "pct"],
    ["rrmin", "حداقل نسبت سود به ریسک (برابر)", 2, "num"],
    ["margin", "حاشیه امن احتمال (٪)", 0.1, "pct"],
    ["dailymax", "میانگین رشد/افت روزانه واقع‌بینانه (٪)", 0.007, "pct"],
    ["tvmax", "حداکثر سهم ارزش زمانی از قیمت اختیار (٪)", 0.7, "pct"],
    ["flatloss", "حداکثر زیان قابل تحمل اگر سهم بی‌تغییر بماند (٪)", 0.5, "pct"],
    ["sl", "حد ضرر - افت از قیمت خرید اختیار (٪)", 0.4, "pct"],
    ["tp", "حد سود اول - رشد از قیمت خرید اختیار (٪)", 0.5, "pct"],
    ["exitdays", "خروج اجباری وقتی روز باقی‌مانده به این عدد برسد", 5, "num"],
    ["maxwarn", "حداکثر تعداد هشدار قبل از «فعلاً نخر»", 3, "num"],
    ["assign", "فروشنده: حداکثر احتمال رسیدن سهم به قیمت سر به سر (٪)", 0.3, "pct"],
    ["minyield", "فروشنده: حداقل بازده پریمیوم نسبت به ارزش پایه تا سررسید (٪)", 0.025, "pct"],
    ["ssl", "فروشنده: حد ضرر - افزایش قیمت اختیار نسبت به قیمت فروش (٪)", 1, "pct"],
    ["stp", "فروشنده: حد سود - کاهش قیمت اختیار نسبت به قیمت فروش (٪)", 0.7, "pct"],
  ];

  // تنظیمات وابسته به ریسک‌پذیری: [خیلی محتاط (۱), متعادل (۵), خیلی ریسک‌پذیر (۱۰)]
  var RISK_KEYS = {
    riskpct: [0.01, 0.03, 0.06], rrmin: [3, 1.5, 0.7], margin: [0.2, 0.1, 0.03],
    spread: [0.03, 0.05, 0.10], minvol: [500, 200, 80], volx: [40, 20, 8],
    mindays: [15, 10, 5], valu: [200, 100, 40], dailymax: [0.005, 0.007, 0.010],
    tvmax: [0.5, 0.7, 0.85], flatloss: [0.3, 0.5, 0.7], sl: [0.25, 0.4, 0.55],
    tp: [0.3, 0.5, 0.8], exitdays: [8, 5, 3], maxwarn: [2, 3, 5],
    assign: [0.15, 0.3, 0.45], minyield: [0.04, 0.025, 0.01], ssl: [0.5, 1, 1.5], stp: [0.5, 0.7, 0.85],
  };
  var INT_KEYS = { minvol: 1, volx: 1, mindays: 1, valu: 1, exitdays: 1, maxwarn: 1 };
  function interp(arr, a) {
    a = Math.min(10, Math.max(1, a));
    if (a <= 5) return arr[0] + (arr[1] - arr[0]) * (a - 1) / 4;
    return arr[1] + (arr[2] - arr[1]) * (a - 5) / 5;
  }
  var DEFAULTS = {};
  SETTINGS_META.forEach(function (m) { DEFAULTS[m[0]] = m[2]; });
  DEFAULTS.risk = 5;
  // تنظیمات مؤثر: مقدار دستی کاربر اگر باشد، وگرنه از روی ریسک‌پذیری (۱ تا ۱۰)
  function effective(user) {
    user = user || {};
    var st = Object.assign({}, DEFAULTS, user);
    var a = Number(st.risk);
    if (!isFinite(a)) a = 5;
    st.risk = Math.min(10, Math.max(1, a));
    Object.keys(RISK_KEYS).forEach(function (k) {
      if (user[k] === undefined || user[k] === null) {
        var v = interp(RISK_KEYS[k], st.risk);
        st[k] = INT_KEYS[k] ? Math.round(v) : Math.round(v * 10000) / 10000;
      }
    });
    return st;
  }

  function ncdf(x) {
    var t = 1 / (1 + 0.2316419 * Math.abs(x));
    var d = 0.3989423 * Math.exp(-x * x / 2);
    var q = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - q : q;
  }
  // تحلیل آماری سهم پایه از روی بازده‌های روزانه (تعدیل‌شده نسبت به قیمت دیروز)
  function analyze(call, an, S, T, td) {
    if (!an || !an.rets || an.rets.length < 20) return null;
    var r = an.rets, n = r.length;
    var rec = r.slice(-60), m = rec.reduce(function (a, b) { return a + b; }, 0) / rec.length;
    var sd = Math.sqrt(rec.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / (rec.length - 1));
    var out = { n: n, sigma: sd, power: an.power === undefined ? null : an.power, pModel: null, pEmp: null, pSug: null, sigTd: null, zscore: null, nWin: 0 };
    var last20 = r.slice(-20), path = [], c = 1;
    last20.forEach(function (x) { c *= 1 + x; path.push(c); });
    out.ret20 = c - 1;
    out.vsma = path[path.length - 1] / (path.reduce(function (a, b) { return a + b; }, 0) / path.length) - 1;
    if (S !== null && T !== null && td !== null && td > 0 && sd > 0) {
      var lt = Math.log(T / S);
      out.sigTd = sd * Math.sqrt(td);
      out.zscore = lt / out.sigTd;
      var z = (lt + 0.5 * sd * sd * td) / out.sigTd;
      out.pModel = call ? 1 - ncdf(z) : ncdf(z);
      var w = Math.round(td), cs = [0];
      r.forEach(function (x) { cs.push(cs[cs.length - 1] + Math.log(1 + x)); });
      if (n - w >= 30) {
        var cnt = 0, tot = 0;
        for (var i = w; i <= n; i++) { var l = cs[i] - cs[i - w]; tot++; if (call ? l >= lt : l <= lt) cnt++; }
        out.pEmp = cnt / tot; out.nWin = tot;
      }
      var cands = [out.pModel, out.pEmp].filter(function (x) { return x !== null; });
      if (cands.length) out.pSug = Math.min.apply(null, cands);
    }
    return out;
  }

  function num(x) {
    if (x === null || x === undefined || x === "") return null;
    var v = Number(x);
    return isFinite(v) ? v : null;
  }
  function f0(x) { return Math.round(x).toLocaleString("en-US"); }
  function pc(x, d) { return (x * 100).toFixed(d === undefined ? 0 : d) + "%"; }

  function evaluate(type, inp, userSt, an) {
    if (type === "scall" || type === "sput") return evaluateSell(type, inp, userSt, an);
    var st = effective(userSt);
    var call = type !== "put";
    var I = {};
    ["capital", "S", "K", "ask", "bid", "cal_days", "tdov", "val_u", "vol_o", "T", "p", "qty", "bidvol"]
      .forEach(function (k) { I[k] = num(inp[k]); });
    var Y = function (k) { return inp[k] || ""; };
    var has = function () {
      for (var i = 0; i < arguments.length; i++) if (arguments[i] === null || arguments[i] === undefined || arguments[i] === "") return false;
      return true;
    };
    var R = {}; // key -> value
    var rows = [];
    function row(step, key, label, v, fmt, help) {
      R[key] = v;
      rows.push({ step: step, key: key, label: label, v: v, fmt: fmt, help: help || "" });
    }

    var S = I.S, K = I.K, ask = I.ask, bid = I.bid, T = I.T, p = I.p;
    var fo = st.fee_opt, fe = st.fee_ex, fs = st.fee_sell, lim = st.lim;

    // ---------- مرحله ۰
    var td = I.tdov !== null ? I.tdov : (I.cal_days !== null ? Math.round(I.cal_days * 5 / 7 * 0.92) : null);
    row(0, "td", "روز معاملاتی تا سررسید (مورد استفاده)", td, "int",
      "اگر وارد نکرده باشی برآورد: روز تقویمی × ۵/۷ منهای ~۸٪ تعطیلات");

    var steps = [];
    function step(n, missing, hard, warn) {
      var status;
      if (missing) { hard = []; warn = []; status = "⏳"; }
      else if (hard.length) status = "❌";
      else if (warn.length) status = "⚠";
      else status = "✅";
      steps[n] = { n: n, status: status, missing: missing, hard: hard, warn: warn };
    }

    // ---------- مرحله ۱
    var m1 = !(Y("q_thesis") && Y("q_halt") && Y("q_queue") && Y("q_event") && I.val_u !== null);
    var h1 = [], w1 = [];
    if (!m1) {
      if (Y("q_thesis") === "خیر") h1.push(call ? "دلیل مشخصی برای صعود سهم نداری؛ بدون دلیل اختیار نخر" : "دلیل مشخصی برای ریزش سهم نداری؛ بدون دلیل اختیار نخر");
      if (Y("q_halt") === "خیر") h1.push("سهم پایه متوقف یا بسته است");
      if (I.val_u < st.valu) h1.push("ارزش معاملات سهم پایه (" + I.val_u + " میلیارد ریال) کمتر از حداقل (" + st.valu + ") است");
      if (Y("q_queue") === "بله") w1.push("سهم الان در صف قفل است؛ قیمت واقعی مشخص نیست و خروج از اختیار می‌تواند سخت شود");
      if (Y("q_event") === "بله") w1.push("رویداد مهم تا سررسید داری؛ قبل از خرید نحوه تعدیل قیمت اعمال را در اطلاعیه‌ها بخوان");
    }
    step(1, m1, h1, w1);

    // ---------- مرحله ۲
    var spread = (has(ask, bid) && ask > 0) ? (ask - bid) / ask : null;
    row(2, "spread", "اسپرد (فاصله قیمت خرید و فروش)", spread, "pct1",
      "اگر همین الان بخری و فوراً بفروشی، این درصد از پولت می‌سوزد");
    var m2 = !has(S, K, ask, bid, I.vol_o);
    var h2 = [], w2 = [];
    if (!m2) {
      if (ask <= 0) h2.push("قیمت فروش اختیار صفر یا نامعتبر است");
      if (bid <= 0) h2.push("هیچ خریداری در بازار اختیار نیست؛ اگر بخری نمی‌توانی بفروشی");
      if (spread !== null && spread > st.spread) h2.push("اسپرد " + pc(spread, 1) + " است؛ بیشتر از حد مجاز (" + pc(st.spread, 1) + ")");
      if (I.vol_o < st.minvol) h2.push("میانگین حجم روزانه (" + I.vol_o + " قرارداد) کمتر از حداقل (" + st.minvol + ") است");
      var iv = call ? S - K : K - S;
      if (ask < iv) w2.push("قیمت اختیار از ارزش ذاتی کمتر است؛ احتمالاً اعداد هم‌زمان نیستند، دوباره بگیر");
    }
    step(2, m2, h2, w2);

    // ---------- مرحله ۳
    var money = null, intr = null, tv = null, tvp = null, be = null, rise = null, maxr = null, dneed = null, tgtd = null;
    if (has(S, K)) {
      money = Math.abs(S / K - 1) <= st.atm ? "نزدیک قیمت اعمال (ATM)" :
        (call ? (S > K ? "در سود (ITM)" : "خارج از سود (OTM)") : (S < K ? "در سود (ITM)" : "خارج از سود (OTM)"));
      intr = call ? Math.max(S - K, 0) : Math.max(K - S, 0);
    }
    if (has(ask, S, K)) { tv = ask - intr; tvp = ask > 0 ? tv / ask : null; }
    if (has(ask, K)) {
      be = call ? ((ask * (1 + fo)) + (K * (1 + fe))) / (1 - fs) : (K * (1 - fs) - ask * (1 + fo)) / (1 + fe);
    }
    if (has(be, S)) {
      rise = call ? be / S - 1 : 1 - be / S;
      dneed = call ? (be <= S ? 0 : Math.ceil(Math.log(be / S) / Math.log(1 + lim)))
                   : (be >= S ? 0 : Math.ceil(Math.log(be / S) / Math.log(1 - lim)));
    }
    if (td !== null) maxr = call ? Math.pow(1 + lim, td) - 1 : 1 - Math.pow(1 - lim, td);
    if (has(T, S, td) && td > 0) tgtd = call ? Math.pow(T / S, 1 / td) - 1 : 1 - Math.pow(T / S, 1 / td);
    row(3, "money", "وضعیت اختیار نسبت به قیمت اعمال", money, "text");
    row(3, "intr", "ارزش ذاتی هر سهم (ریال)", intr, "money");
    row(3, "tv", "ارزش زمانی هر سهم (ریال)", tv, "money", "تا سررسید به صفر می‌رسد");
    row(3, "tvp", "سهم ارزش زمانی از قیمت اختیار", tvp, "pct0", "هرچه بیشتر، پولِ بیشتری «هوا» است");
    row(3, "be", "قیمت سر به سر سهم پایه در سررسید (ریال)", be, "money", "با احتساب کارمزدها");
    row(3, "rise", call ? "رشد لازم سهم تا سر به سر" : "افت لازم سهم تا سر به سر", rise, "pct1");
    row(3, "maxr", call ? "حداکثر رشد ممکن تا سررسید (سقف نوسان)" : "حداکثر افت ممکن تا سررسید (کف نوسان)", maxr, "pct0",
      "اگر هر روز سقف/کف بزند؛ فقط مرز غیرممکن را نشان می‌دهد");
    row(3, "dneed", call ? "حداقل روزِ «سقف پشت‌سرهم» لازم تا سر به سر" : "حداقل روزِ «کف پشت‌سرهم» لازم تا سر به سر", dneed, "int");
    row(3, "tgtd", call ? "میانگین رشد روزانه لازم برای هدف" : "میانگین افت روزانه لازم برای هدف", tgtd, "pct2",
      "بیش از ~۱٪ در روز برای چند هفته بسیار سخت است");
    var m3 = !has(S, K, ask, td, T);
    var h3 = [], w3 = [];
    if (!m3) {
      if (td < st.mindays) h3.push("فقط " + td + " روز معاملاتی مانده؛ حداقل " + st.mindays + " روز لازم است (ارزش زمانی در روزهای آخر تند آب می‌شود)");
      if (call ? T <= be : T >= be) h3.push("هدفت (" + f0(T) + ") از قیمت سر به سر (" + f0(be) + ") " + (call ? "بالاتر" : "پایین‌تر") + " نیست؛ حتی اگر هدفت محقق شود سود نمی‌کنی");
      var lo = S * Math.pow(1 - lim, td), hi = S * Math.pow(1 + lim, td);
      if (call ? T > hi : T < lo) h3.push("هدف با سقف نوسان روزانه در روزهای باقی‌مانده اصلاً قابل رسیدن نیست");
      if (call ? be > hi : be < lo) h3.push("قیمت سر به سر با سقف نوسان روزانه تا سررسید قابل رسیدن نیست");
      if (tgtd !== null && tgtd > st.dailymax) w3.push("برای رسیدن به هدف سهم باید روزانه به‌طور میانگین " + pc(tgtd, 2) + (call ? " رشد" : " افت") + " کند (بیش از " + pc(st.dailymax, 2) + ")");
      if (tvp !== null && tvp > st.tvmax) w3.push("حدود " + pc(tvp, 0) + " قیمت اختیار فقط ارزش زمانی است و تا سررسید صفر می‌شود");
    }
    step(3, m3, h3, w3);

    // ---------- مرحله ۴
    var cost = has(ask) ? ask * st.size * (1 + fo) : null;
    function payoff(x) { // سود خالص هر سهم اگر قیمت سهم x باشد (با اعمال)
      return call ? Math.max(x * (1 - fs) - K * (1 + fe), 0) : Math.max(K * (1 - fs) - x * (1 + fe), 0);
    }
    var pT = has(ask, K, T) ? (payoff(T) - ask * (1 + fo)) * st.size : null;
    var rr = has(cost, pT) ? pT / cost : null;
    var retstock = has(T, S) ? (call ? T / S - 1 : 1 - T / S) : null;
    var lev = has(rr, retstock) ? (retstock <= 0 ? null : rr / retstock) : null;
    function ret(x) { return (payoff(x) - ask * (1 + fo)) / (ask * (1 + fo)); }
    var retMid = has(ask, K, S, T) ? ret(S + (T - S) / 2) : null;
    var retFlat = has(ask, K, S) ? ret(S) : null;
    var retAdv = has(ask, K, S) ? ret(call ? S * 0.9 : S * 1.1) : null;
    var preq = has(cost, pT) ? (pT <= 0 ? 1 : cost / (cost + pT)) : null;
    var ev = has(p, rr) ? p * rr - (1 - p) : null;
    row(4, "cost", "هزینه کل خرید یک قرارداد (ریال)", cost, "money", "این همان پولی است که در خطر است");
    row(4, "pT", "سود خالص یک قرارداد اگر سهم دقیقاً به هدف برسد (ریال)", pT, "money");
    row(4, "rr", "نسبت سود به ریسک (برابر)", rr, "ratio1");
    row(4, "retstock", call ? "بازده خرید خودِ سهم تا همان هدف" : "اندازه افت سهم تا همان هدف", retstock, "pct1");
    row(4, "lev", "اهرم واقعی (برابر)", lev, "ratio1", "ضررها هم به همین اندازه تند است");
    row(4, "retMid", "بازده اگر سهم فقط نصف راه تا هدف را برود", retMid, "pct0");
    row(4, "retFlat", "بازده اگر سهم تا سررسید بی‌تغییر بماند", retFlat, "pct0");
    row(4, "retAdv", call ? "بازده اگر سهم ۱۰٪ بریزد" : "بازده اگر سهم ۱۰٪ بالا برود", retAdv, "pct0");
    row(4, "preq", "حداقل احتمال لازم برای سر به سر شدن ریاضی", preq, "pct0");
    row(4, "ev", "امید ریاضی بازده روی پول خرید", ev, "pct0", "برای رتبه‌بندی بین اختیارها");
    var A = analyze(call, an, S, T, td);
    if (A) {
      row(4, "sigma", "نوسان روزانه سهم پایه (انحراف معیار ۶۰ روز اخیر)", A.sigma, "pct2");
      row(4, "sigTd", "نوسان معمول تا سررسید (±۱ انحراف معیار)", A.sigTd, "pct1", "حدود ۶۸٪ مواقع سهم در این بازه می‌ماند");
      row(4, "ret20", "بازده ۲۰ روز اخیر سهم پایه", A.ret20, "pct1");
      row(4, "vsma", "قیمت نسبت به میانگین ۲۰ روزه", A.vsma, "pct1");
      if (A.power !== null) row(4, "power", "قدرت خریدار حقیقی (بیش از ۱ = خریدار قوی‌تر)", A.power, "ratio2");
      row(4, "pModel", "احتمال آماری رسیدن به هدف (مدل نوسان)", A.pModel, "pct0", "بدون فرض روند؛ فقط از روی نوسان گذشته");
      row(4, "pEmp", "احتمال تاریخی رسیدن به هدف (در سابقه خود سهم)", A.pEmp, "pct0", "چند درصد پنجره‌های هم‌طول در سابقه به هدف رسیده‌اند");
      row(4, "pSug", "احتمال پیشنهادی (کمترِ دو برآورد)", A.pSug, "pct0", "فقط مرجع؛ تصمیم با خودت است");
    }
    var m4 = !has(S, K, ask, T, p);
    var h4 = [], w4 = [];
    if (!m4) {
      if (rr < st.rrmin) h4.push("نسبت سود به ریسک " + rr.toFixed(1) + " برابر است؛ حداقل " + st.rrmin + " برابر لازم است. (یعنی سودِ حالت هدف ÷ کل پول خرید؛ آستانه از تنظیمات ⚙ «حداقل نسبت سود به ریسک» می‌آید و قابل تغییر است)");
      if (p < preq + st.margin) h4.push("احتمال تخمینی تو (" + pc(p, 0) + ") کمتر از حداقل لازم (" + pc(Math.min(1, preq + st.margin), 0) + ") است؛ سر به سر ریاضی " + pc(preq, 0) + " به‌علاوه حاشیه امن");
      if (retFlat < -st.flatloss) w4.push("اگر سهم بی‌تغییر بماند حدود " + pc(-retFlat, 0) + " پول خرید از بین می‌رود");
      if (A) {
        var trendBad = call ? (A.ret20 < -0.03 && A.vsma < 0) : (A.ret20 > 0.03 && A.vsma > 0);
        if (trendBad) w4.push("روند ۲۰ روزه سهم پایه برخلاف نظر توست (بازده " + pc(A.ret20, 1) + "، " + (A.vsma < 0 ? "زیر" : "بالای") + " میانگین ۲۰ روزه)");
        if (A.power !== null && (call ? A.power < 0.7 : A.power > 1.4)) w4.push("قدرت خریدار حقیقی " + A.power.toFixed(2) + " است و با نظر " + (call ? "صعودی" : "نزولی") + " تو نمی‌خواند");
        if (A.pModel !== null && p > A.pModel + 0.15) w4.push("احتمال تخمینی تو (" + pc(p, 0) + ") خیلی بالاتر از احتمال آماری (" + pc(A.pModel, 0) + ") است؛ دوباره فکر کن");
        if (A.zscore !== null && Math.abs(A.zscore) > 2) w4.push("هدف تو " + Math.abs(A.zscore).toFixed(1) + " انحراف معیار با قیمت فعلی فاصله دارد؛ از نظر آماری بسیار بعید است");
      }
    }
    step(4, m4, h4, w4);

    // ---------- مرحله ۵
    var budget = has(I.capital) ? I.capital * st.riskpct : null;
    var maxq = has(budget, cost) ? Math.floor(budget / cost) : null;
    var tot = has(I.qty, cost) ? I.qty * cost : null;
    var costpct = has(tot, I.capital) ? tot / I.capital : null;
    var volratio = has(I.vol_o, I.qty) ? (I.qty <= 0 ? null : I.vol_o / I.qty) : null;
    var cashex = null, sharesneed = null;
    if (call) { if (has(I.qty, K)) cashex = I.qty * st.size * K * (1 + fe); }
    else if (has(I.qty)) sharesneed = I.qty * st.size;
    var swing = has(S, ask) ? lim * S / ask : null;
    var crash = has(S) ? (call ? S * Math.pow(1 - lim, 3) : S * Math.pow(1 + lim, 3)) : null;
    row(5, "budget", "حداکثر پولی که مجازی در این معامله از دست بدهی (ریال)", budget, "money", "سرمایه × درصد ریسک مجاز");
    row(5, "maxq", "حداکثر تعداد قرارداد مجاز", maxq, "int", "از این بیشتر نخر");
    row(5, "tot", "کل پول خرید (ریال)", tot, "money", "بدترین حالت: همه‌اش از بین می‌رود");
    row(5, "costpct", "درصد سرمایه‌ای که در خطر است", costpct, "pct2");
    row(5, "volratio", "حجم روزانه اختیار چند برابر تعداد خرید توست", volratio, "int");
    if (call) row(5, "cashex", "نقدینگی لازم اگر بخواهی اعمال کنی (ریال)", cashex, "money");
    else row(5, "sharesneed", "تعداد سهم لازم برای اعمال", sharesneed, "money", "باید این‌قدر سهم پایه در سبد داشته باشی");
    row(5, "swing", "حداکثر نوسان تقریبی قیمت اختیار در یک روز سقف/کف", swing, "pct0");
    row(5, "crash", call ? "قیمت سهم اگر ۳ روز پشت‌سرهم کف شود" : "قیمت سهم اگر ۳ روز پشت‌سرهم سقف شود", crash, "money",
      "در چنین روزهایی ممکن است نتوانی اختیار را بفروشی");
    var m5 = !(has(I.capital, S, K, ask, I.vol_o, I.qty, I.bidvol) && (call || Y("q_own")));
    var h5 = [], w5 = [];
    if (!m5) {
      if (I.qty < 1) h5.push("تعداد باید حداقل ۱ قرارداد باشد");
      if (maxq !== null && I.qty > maxq) h5.push("تعداد " + I.qty + " از حداکثر مجاز (" + maxq + " قرارداد) بیشتر است؛ بیش از حد ریسک می‌کنی");
      if (volratio !== null && volratio < st.volx) h5.push("حجم روزانه فقط " + Math.round(volratio) + " برابر تعداد خرید توست؛ حداقل " + st.volx + " برابر لازم است");
      if (I.bidvol < I.qty) w5.push("صف خرید (" + I.bidvol + " قرارداد) از تعداد تو کمتر است؛ فروش یکجا ممکن است قیمت را پایین بیاورد");
      if (call && cashex !== null && cashex > I.capital) w5.push("برای اعمال نقدینگی کافی نداری؛ باید قبل از سررسید خودِ اختیار را بفروشی");
      if (!call && Y("q_own") === "خیر") w5.push("سهم کافی برای اعمال نداری؛ باید قبل از سررسید خودِ اختیار را بفروشی (اعمال نکن)");
    }
    step(5, m5, h5, w5);

    // ---------- مرحله ۶
    var slp = has(ask) ? Math.round(ask * (1 - st.sl)) : null;
    var tpp = has(ask) ? Math.round(ask * (1 + st.tp)) : null;
    var fu = td !== null ? Math.max(td - st.exitdays, 0) : null;
    row(6, "slp", "قیمت حد ضرر اختیار (ریال)", slp, "money", "به این رسید یا پایین‌تر، بدون بحث بفروش");
    row(6, "tpp", "قیمت حد سود اول اختیار (ریال)", tpp, "money", "نیمی از قراردادها را بفروش و حد ضرر بقیه را به قیمت خرید ببر");
    row(6, "fu", "خروج اجباری: بعد از این‌قدر روز معاملاتی از امروز", fu, "int", "اگر هنوز بالاتر از سر به سر نیستی، بفروش");
    row(6, "lossm", "ضرر پولی تقریبی در حد ضرر (ریال)", has(tot) ? tot * st.sl : null, "money");
    row(6, "gainm", "سود پولی تقریبی در حد سود اول (ریال)", has(tot) ? tot * st.tp : null, "money");
    var m6 = !(Y("q_plan") && Y("q_lock") && Y("q_zero"));
    var h6 = [], w6 = [];
    if (!m6) {
      if (Y("q_plan") === "خیر") h6.push("هنوز برنامه خروج (حد ضرر، حد سود، زمان خروج) را ننوشته‌ای");
      if (Y("q_lock") === "خیر") h6.push("ریسک قفل شدن سهم در صف را نپذیرفته‌ای");
      if (Y("q_zero") === "خیر") h6.push("آماده از دست رفتن کل پول خرید نیستی؛ این معامله برای تو مناسب نیست");
      if (st.tp < st.sl) w6.push("حد سود از حد ضرر کوچک‌تر است؛ تنظیمات را اصلاح کن");
    }
    step(6, m6, h6, w6);

    // ---------- نتیجه نهایی
    var nHard = 0, nMissing = 0, nWarn = 0;
    for (var i = 1; i <= 6; i++) {
      if (steps[i].status === "❌") nHard++;
      if (steps[i].status === "⏳") nMissing++;
      nWarn += steps[i].warn.length;
    }
    var final;
    if (nHard > 0) final = { sym: "❌", text: "نخر — " + nHard + " مرحله رد شد" };
    else if (nMissing > 0) final = { sym: "⏳", text: "ناقص — " + nMissing + " مرحله کامل نیست" };
    else if (nWarn >= st.maxwarn) final = { sym: "⚠", text: "فعلاً نخر — " + nWarn + " هشدار" };
    else if (nWarn >= 1) final = { sym: "✅", text: "بخر (با احتیاط، طبق برنامه خروج)" };
    else final = { sym: "✅", text: "بخر (طبق برنامه خروج)" };

    return { rows: rows, R: R, steps: steps, final: final, nHard: nHard, nMissing: nMissing, nWarn: nWarn, ev: ev, settings: st };
  }


  // ================= ابزارهای مدل نوسان =================
  function ncinv(p) {
    var lo = -8, hi = 8;
    for (var i = 0; i < 60; i++) { var m = (lo + hi) / 2; if (ncdf(m) < p) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  // نوسان روزانه: از سابقه واقعی؛ اگر نبود تخمین از دامنه نوسان
  function sigmaFor(an, S, td, lim) {
    var A = analyze(true, an, S, null, td);
    if (A && A.sigma > 0) return { sigma: A.sigma, est: false, A: A };
    return { sigma: Math.max(lim * 0.4, 0.001), est: true, A: null };
  }
  // ارزش تئوری اختیار در سررسید (بدون روند، بدون نرخ بهره)
  function fairValue(call, S, K, sigma, td) {
    var s = sigma * Math.sqrt(td);
    if (!(s > 0)) return Math.max(call ? S - K : K - S, 0);
    var d1 = (Math.log(S / K) + 0.5 * s * s) / s, d2 = d1 - s;
    return call ? S * ncdf(d1) - K * ncdf(d2) : K * ncdf(-d2) - S * ncdf(-d1);
  }
  // احتمال اینکه قیمت سهم در سررسید بالاتر (up=true) یا پایین‌تر از x باشد
  function probBeyond(up, S, x, sigma, td) {
    var s = sigma * Math.sqrt(td);
    var z = (Math.log(x / S) + 0.5 * sigma * sigma * td) / s;
    var above = 1 - ncdf(z);
    return up ? above : 1 - above;
  }

  // ================= فروش اختیار (Call/Put) =================
  function evaluateSell(type, inp, userSt, an) {
    var st = effective(userSt);
    var call = type === "scall";
    var I = {};
    ["capital", "S", "K", "ask", "bid", "cal_days", "tdov", "val_u", "vol_o", "sellp", "qty"]
      .forEach(function (k) { I[k] = num(inp[k]); });
    var Y = function (k) { return inp[k] || ""; };
    var has = function () {
      for (var i = 0; i < arguments.length; i++) if (arguments[i] === null || arguments[i] === undefined || arguments[i] === "") return false;
      return true;
    };
    var R = {}, rows = [];
    function row(step, key, label, v, fmt, help) { R[key] = v; rows.push({ step: step, key: key, label: label, v: v, fmt: fmt, help: help || "" }); }
    var S = I.S, K = I.K, ask = I.ask, bid = I.bid;
    var fo = st.fee_opt, lim = st.lim, size = st.size;

    var td = I.tdov !== null ? I.tdov : (I.cal_days !== null ? Math.round(I.cal_days * 5 / 7 * 0.92) : null);
    row(0, "td", "روز معاملاتی تا سررسید (مورد استفاده)", td, "int", "اگر وارد نکرده باشی برآورد: روز تقویمی × ۵/۷ منهای ~۸٪ تعطیلات");
    var sp = I.sellp !== null ? I.sellp : bid;            // قیمتی که با آن می‌فروشم
    var pn = has(sp) ? sp * (1 - fo) : null;               // پریمیوم خالص هر سهم
    var base = has(S, K) ? (call ? S : K) : null;          // ارزش پایه: سهم (Call) یا نقد لازم (Put)

    var steps = [];
    function step(n, missing, hard, warn) {
      var status;
      if (missing) { hard = []; warn = []; status = "⏳"; }
      else if (hard.length) status = "❌";
      else if (warn.length) status = "⚠";
      else status = "✅";
      steps[n] = { n: n, status: status, missing: missing, hard: hard, warn: warn };
    }

    // ---------- مرحله ۱: سهم پایه
    var m1 = !(Y("q_ok") && Y("q_halt") && Y("q_queue") && Y("q_event") && I.val_u !== null);
    var h1 = [], w1 = [];
    if (!m1) {
      if (Y("q_ok") === "خیر") h1.push(call ? "حاضر نیستی سهم را به قیمت اعمال بفروشی؛ پس نباید Call بفروشی" : "حاضر نیستی سهم را به قیمت اعمال بخری و نگه داری؛ پس نباید Put بفروشی");
      if (Y("q_halt") === "خیر") h1.push("سهم پایه متوقف یا بسته است");
      if (I.val_u < st.valu) h1.push("ارزش معاملات سهم پایه (" + I.val_u + " میلیارد ریال) کمتر از حداقل (" + st.valu + ") است");
      if (Y("q_queue") === "بله") w1.push("سهم الان در صف قفل است؛ اگر اوضاع بد شود نمی‌توانی اختیار را بخری و ببندی");
      if (Y("q_event") === "بله") w1.push("رویداد مهم تا سررسید داری؛ تعدیل قیمت اعمال و ریسک شکاف قیمتی را بررسی کن");
    }
    step(1, m1, h1, w1);

    // ---------- مرحله ۲: بازار
    var spread = (has(ask, bid) && ask > 0) ? (ask - bid) / ask : null;
    row(2, "spread", "اسپرد (فاصله قیمت خرید و فروش)", spread, "pct1", "هزینه بستن سریع معامله؛ فروشنده باید بتواند اختیار را پس بخرد");
    var m2 = !has(S, K, ask, bid, I.vol_o);
    var h2 = [], w2 = [];
    if (!m2) {
      if (bid <= 0) h2.push("هیچ خریداری در بازار اختیار نیست؛ نمی‌توانی فوراً بفروشی");
      if (ask <= 0) h2.push("قیمت فروش اختیار صفر یا نامعتبر است");
      if (spread !== null && spread > st.spread) h2.push("اسپرد " + pc(spread, 1) + " است؛ بیشتر از حد مجاز (" + pc(st.spread, 1) + ")");
      if (I.vol_o < st.minvol) h2.push("میانگین حجم روزانه (" + I.vol_o + " قرارداد) کمتر از حداقل (" + st.minvol + ") است؛ بستن معامله سخت می‌شود");
      var iv0 = call ? S - K : K - S;
      if (has(sp) && sp < iv0) w2.push("قیمت فروش از ارزش ذاتی کمتر است؛ احتمالاً اعداد هم‌زمان نیستند، دوباره بگیر");
    }
    step(2, m2, h2, w2);

    // ---------- مرحله ۳: قیمت، زمان و فاصله امن
    var SG = sigmaFor(an, S, td, lim), sigma = SG.sigma, A = SG.A;
    var money = null, intr = null, tv = null, be = null, cushion = null, pAssign = null, pLoss = null, sigTd = null;
    if (has(S, K)) {
      money = Math.abs(S / K - 1) <= st.atm ? "نزدیک قیمت اعمال (ATM)" :
        (call ? (S > K ? "در سود خریدار (ITM)" : "خارج از سود (OTM)") : (S < K ? "در سود خریدار (ITM)" : "خارج از سود (OTM)"));
      intr = Math.max(call ? S - K : K - S, 0);
    }
    if (has(sp, intr)) tv = Math.max(sp - intr, 0);
    if (has(pn, K)) be = call ? K + pn : K - pn;
    if (has(be, S)) cushion = call ? be / S - 1 : 1 - be / S;
    if (has(S, K, td) && td > 0) {
      sigTd = sigma * Math.sqrt(td);
      pAssign = probBeyond(call, S, K, sigma, td);
      if (has(be)) pLoss = probBeyond(call, S, be, sigma, td);
    }
    row(3, "money", "وضعیت اختیار نسبت به قیمت سهم", money, "text");
    row(3, "intr", "ارزش ذاتی (ریال)", intr, "money");
    row(3, "be", call ? "قیمت سر به سر فروشنده (بالاتر از این زیان می‌کنی)" : "قیمت سر به سر فروشنده (پایین‌تر از این زیان می‌کنی)", be, "money");
    row(3, "cushion", "فاصله قیمت فعلی سهم تا سر به سر", cushion, "pct1", "هرچه بیشتر، حاشیه امن بیشتر؛ منفی یعنی همین الان زیان‌دهی");
    row(3, "sigTd", "نوسان معمول تا سررسید (±۱ انحراف معیار)", sigTd, "pct1", SG.est ? "سابقه قیمت نبود؛ از دامنه نوسان تخمین زده شد" : "از ۶۰ روز اخیر");
    row(3, "pAssign", "احتمال اعمال (رسیدن سهم به قیمت اعمال)", pAssign, "pct0", "بدون فرض روند؛ فقط از روی نوسان گذشته");
    row(3, "pLoss", "احتمال زیان فروشنده (رسیدن سهم به سر به سر)", pLoss, "pct0");
    var m3 = !has(S, K, sp, td);
    var h3 = [], w3 = [];
    if (!m3) {
      if (td <= 0) h3.push("سررسید رسیده است");
      if (pLoss !== null && pLoss > st.assign) h3.push("احتمال زیان " + pc(pLoss, 0) + " است؛ بیشتر از حد مجاز (" + pc(st.assign, 0) + "). قیمت اعمال امن‌تر یا قیمت فروش بالاتر لازم است");
      if (pAssign !== null && pAssign > 0.5) w3.push("اختیار الان به نفع خریدار است و احتمال اعمال بالاست");
      if (SG.est) w3.push("سابقه قیمت سهم خوانده نشد؛ احتمال‌ها با نوسان تخمینی محاسبه شده‌اند");
    }
    step(3, m3, h3, w3);

    // ---------- مرحله ۴: سود و زیان
    var premc = has(pn) ? pn * size : null;
    var yld = has(pn, base) ? pn / base : null;
    var monthly = has(yld, td) && td > 0 ? yld / td * 20 : null;
    var fair = has(S, K, td) && td > 0 ? fairValue(call, S, K, sigma, td) : null;
    var fairr = has(sp, fair) && fair > 0 ? sp / fair : null;
    var sev = has(pn, fair) && pn > 0 ? (pn - fair) / pn : null;
    var adv = has(S, K, pn) ? (pn - Math.max(call ? S * 1.1 - K : K - S * 0.9, 0)) * size : null;
    var maxLoss = (!call && has(K, pn)) ? (K - pn) * size : null;
    row(4, "premc", "پریمیوم خالص یک قرارداد (ریال)", premc, "money", "مبلغی که اگر سهم به سر به سر نرسد برای تو می‌ماند");
    row(4, "yield", "بازده پریمیوم نسبت به ارزش پایه تا سررسید", yld, "pct1", call ? "ارزش پایه = قیمت سهم" : "ارزش پایه = قیمت اعمال (نقدی که باید آماده باشد)");
    row(4, "monthly", "بازده معادل ماهانه (۲۰ روز معاملاتی)", monthly, "pct1");
    row(4, "fair", "ارزش تئوری اختیار (مدل نوسان) (ریال)", fair, "money", "اگر خیلی بالاتر از قیمت فروشت باشد، ارزان می‌فروشی");
    row(4, "fairr", "قیمت فروش نسبت به ارزش تئوری (برابر)", fairr, "ratio2");
    row(4, "sev", "برتری پریمیوم نسبت به ارزش تئوری (٪ پریمیوم)", sev, "pct0", "برای رتبه‌بندی بین اختیارها؛ مثبت = گران‌تر از مدل می‌فروشی");
    row(4, "adv", call ? "سود/زیان یک قرارداد اگر سهم ۱۰٪ بالا برود (ریال)" : "سود/زیان یک قرارداد اگر سهم ۱۰٪ بریزد (ریال)", adv, "money");
    row(4, "maxLoss", "بیشترین زیان یک قرارداد (ریال)", call ? "نامحدود" : maxLoss, call ? "text" : "money", call ? "فروش Call بدون سهم ریسک نامحدود دارد" : "اگر سهم به صفر برسد");
    if (A) {
      row(4, "ret20", "بازده ۲۰ روز اخیر سهم پایه", A.ret20, "pct1");
      row(4, "vsma", "قیمت نسبت به میانگین ۲۰ روزه", A.vsma, "pct1");
      if (A.power !== null) row(4, "power", "قدرت خریدار حقیقی (بیش از ۱ = خریدار قوی‌تر)", A.power, "ratio2");
    }
    var m4 = !has(S, K, sp);
    var h4 = [], w4 = [];
    if (!m4) {
      if (yld !== null && yld < st.minyield) h4.push("بازده پریمیوم " + pc(yld, 1) + " است؛ کمتر از حداقل (" + pc(st.minyield, 1) + ") و ارزش ریسک را ندارد");
      if (fairr !== null && fairr < 0.9) w4.push("قیمت فروش (" + f0(sp) + ") از ارزش تئوری مدل (" + f0(fair) + ") کمتر است؛ احتمالاً ارزان می‌فروشی");
      if (A) {
        var trendBad = call ? (A.ret20 > 0.05 && A.vsma > 0.02) : (A.ret20 < -0.05 && A.vsma < -0.02);
        if (trendBad) w4.push("روند ۲۰ روزه سهم برخلاف فروش " + (call ? "Call" : "Put") + " است (بازده " + pc(A.ret20, 1) + ")");
        if (A.power !== null && (call ? A.power > 1.4 : A.power < 0.7)) w4.push("قدرت خریدار حقیقی " + A.power.toFixed(2) + " است و با فروش " + (call ? "Call" : "Put") + " نمی‌خواند");
      }
    }
    step(4, m4, h4, w4);

    // ---------- مرحله ۵: اندازه معامله
    var qty = I.qty;
    var Sbad = has(S) ? (call ? S * Math.pow(1 + lim, 5) : S * Math.pow(1 - lim, 5)) : null;
    var lossBad = has(Sbad, K, pn) ? (Math.max(call ? Sbad - K : K - Sbad, 0) - pn) * size : null;
    var budget = has(I.capital) ? I.capital * st.riskpct : null;
    var maxq = has(lossBad, budget) ? (lossBad > 0 ? Math.floor(budget / lossBad) : null) : null;
    var cashneed = has(qty, K) ? qty * size * K : null;
    var sharesneed = has(qty) ? qty * size : null;
    var capshare = has(cashneed, I.capital) && I.capital > 0 ? cashneed / I.capital : null;
    var volratio = has(I.vol_o, qty) && qty > 0 ? I.vol_o / qty : null;
    var totprem = has(qty, premc) ? qty * premc : null;
    row(5, "budget", "حداکثر زیان مجاز در این معامله (ریال)", budget, "money");
    row(5, "lossBad", "زیان یک قرارداد اگر ۵ روز پشت‌سرهم سهم خلاف نظر برود (ریال)", lossBad, "money", "اگر منفی یا صفر باشد در این سناریو زیان نمی‌کنی");
    row(5, "maxq", "حداکثر تعداد قرارداد مجاز", maxq, "int", maxq === null ? "در سناریوی بد زیانی نیست؛ محدودیتی از این بابت نیست" : "");
    row(5, "totprem", "کل پریمیوم خالص دریافتی (ریال)", totprem, "money");
    if (call) row(5, "sharesneed", "سهم پایه‌ای که باید داشته باشی (تعداد سهم)", sharesneed, "money");
    else { row(5, "cashneed", "نقدی که برای اعمال لازم می‌شود (ریال)", cashneed, "money"); row(5, "capshare", "سهم این نقد از کل سرمایه", capshare, "pct0"); }
    row(5, "volratio", "حجم روزانه نسبت به تعداد فروش (برابر)", volratio, "int");
    var m5 = !(has(I.capital, S, K, sp, I.vol_o, qty) && Y("q_cover"));
    var h5 = [], w5 = [];
    if (!m5) {
      if (qty < 1) h5.push("تعداد قرارداد باید حداقل ۱ باشد");
      if (maxq !== null && qty > maxq) h5.push("تعداد (" + qty + ") بیشتر از حداکثر مجاز (" + maxq + ") است؛ در سناریوی بد بیش از " + pc(st.riskpct, 0) + " سرمایه زیان می‌کنی");
      if (volratio < st.volx) h5.push("حجم روزانه فقط " + volratio.toFixed(0) + " برابر تعداد فروش توست؛ حداقل " + st.volx + " برابر لازم است");
      if (call && Y("q_cover") === "خیر") h5.push("فروش Call بدون داشتن سهم (Naked) ریسک نامحدود دارد؛ ممنوع");
      if (!call && Y("q_cover") === "خیر") w5.push("نقدینگی کامل برای اعمال نداری؛ باید وجه تضمین بلوکه شود و با افت سهم ممکن است مارجین‌کال شوی");
      if (!call && cashneed > I.capital) w5.push("نقد لازم برای اعمال (" + f0(cashneed) + ") از کل سرمایه‌ات بیشتر است");
      else if (!call && capshare > 0.5) w5.push("بیش از ۵۰٪ سرمایه‌ات برای اعمال احتمالی درگیر می‌شود");
    }
    step(5, m5, h5, w5);

    // ---------- مرحله ۶: برنامه خروج
    var slp = has(sp) ? sp * (1 + st.ssl) : null;
    var tpp = has(sp) ? sp * (1 - st.stp) : null;
    var lossm = has(slp, sp, qty) ? (slp - sp) * size * qty : null;
    var gainm = has(tpp, sp, qty) ? (sp - tpp) * size * qty : null;
    row(6, "slp", "قیمت بازخرید برای حد ضرر (ریال)", slp, "money", "اگر قیمت اختیار به اینجا رسید، می‌خری و می‌بندی");
    row(6, "tpp", "قیمت بازخرید برای حد سود (ریال)", tpp, "money");
    row(6, "lossm", "زیان پولی در حد ضرر (ریال)", lossm, "money");
    row(6, "gainm", "سود پولی در حد سود (ریال)", gainm, "money");
    row(6, "fu", "تصمیم قطعی بستن یا پذیرش اعمال وقتی روز باقی‌مانده به این عدد رسید", st.exitdays, "int");
    var m6 = !(Y("q_plan") && Y("q_lock") && Y("q_zero"));
    var h6 = [], w6 = [];
    if (!m6) {
      if (Y("q_plan") === "خیر") h6.push("برنامه بازخرید (حد ضرر، حد سود، زمان) را ننوشته‌ای؛ بدون برنامه نفروش");
      if (Y("q_lock") === "خیر") w6.push("خطر قفل شدن سهم و ناتوانی در بستن معامله را جدی نگرفته‌ای");
      if (Y("q_zero") === "خیر") h6.push(call ? "نمی‌پذیری که با صعود سهم سود بالاتر را از دست بدهی و سهم را به قیمت اعمال بفروشی" : "نمی‌پذیری که با ریزش سهم مجبور شوی به قیمت اعمال بخری و ضرر کنی");
    }
    step(6, m6, h6, w6);

    var nHard = 0, nMissing = 0, nWarn = 0;
    for (var i = 1; i <= 6; i++) {
      if (steps[i].status === "❌") nHard++;
      if (steps[i].status === "⏳") nMissing++;
      nWarn += steps[i].warn.length;
    }
    var final;
    if (nHard > 0) final = { sym: "❌", text: "نفروش — " + nHard + " مرحله رد شد" };
    else if (nMissing > 0) final = { sym: "⏳", text: "ناقص — " + nMissing + " مرحله کامل نیست" };
    else if (nWarn >= st.maxwarn) final = { sym: "⚠", text: "فعلاً نفروش — " + nWarn + " هشدار" };
    else if (nWarn >= 1) final = { sym: "✅", text: "بفروش (با احتیاط، طبق برنامه بازخرید)" };
    else final = { sym: "✅", text: "بفروش (طبق برنامه بازخرید)" };
    return { rows: rows, R: R, steps: steps, final: final, nHard: nHard, nMissing: nMissing, nWarn: nWarn, ev: sev, settings: st };
  }

  // ================= قیمت پیشنهادی =================
  // خرید: سقف قیمتی که هنوز همه شرط‌های سود/ریسک و احتمال را برآورده می‌کند
  // فروش: کف قیمتی که هنوز بازده، احتمال زیان و ارزش تئوری را برآورده می‌کند
  function quote(type, inp, userSt, an) {
    var st = effective(userSt);
    var sell = type === "scall" || type === "sput";
    var call = type === "call" || type === "scall";
    var I = {};
    ["S", "K", "ask", "bid", "cal_days", "tdov", "T", "p", "sellp"].forEach(function (k) { I[k] = num(inp[k]); });
    var S = I.S, K = I.K, fo = st.fee_opt, fe = st.fee_ex, fs = st.fee_sell, lim = st.lim;
    var td = I.tdov !== null ? I.tdov : (I.cal_days !== null ? Math.round(I.cal_days * 5 / 7 * 0.92) : null);
    var out = { sell: sell, call: call, ok: false, missing: [], parts: [], levels: [], limit: null, ref: null, gap: null, fair: null, td: td, note: [] };
    var SG = (S !== null && td !== null && td > 0) ? sigmaFor(an, S, td, lim) : null;
    if (SG) { out.sigmaEst = SG.est; if (S !== null && K !== null) out.fair = fairValue(call, S, K, SG.sigma, td); }

    if (!sell) {
      if (K === null) out.missing.push("قیمت اعمال");
      if (I.T === null) out.missing.push("قیمت هدف سهم");
      if (out.missing.length) return out;
      var payT = call ? Math.max(I.T * (1 - fs) - K * (1 + fe), 0) : Math.max(K * (1 - fs) - I.T * (1 + fe), 0);
      out.payT = payT;
      out.ref = I.ask;
      if (payT <= 0) { out.limit = 0; out.ok = true; out.note.push("با این قیمت هدف، اختیار حتی رایگان هم سود نمی‌دهد؛ هدف باید از قیمت اعمال (و کارمزدها) فراتر برود"); return out; }
      var aRR = payT / ((1 + fo) * (1 + st.rrmin));
      out.parts.push({ label: "برای نسبت سود به ریسک حداقل " + st.rrmin + " برابر", v: aRR });
      var cands = [aRR];
      if (I.p !== null) {
        var aP = payT * Math.max(I.p - st.margin, 0) / (1 + fo);
        out.parts.push({ label: "برای اینکه احتمال تو (" + pc(I.p, 0) + ") از سر به سر ریاضی + حاشیه امن (" + pc(st.margin, 0) + ") بیشتر باشد", v: aP });
        cands.push(aP);
      } else out.note.push("احتمال خودت را (مرحله «سود و زیان») وارد کن تا شرط احتمال هم در سقف قیمت لحاظ شود");
      var lim_ = Math.min.apply(null, cands);
      out.parts.forEach(function (x) { x.bind = Math.abs(x.v - lim_) < 1e-9; });
      out.limit = Math.max(Math.floor(lim_), 0);
      out.ok = true;
      if (out.fair !== null) out.note.push("ارزش تئوری اختیار با مدل نوسان حدود " + f0(out.fair) + " ریال است (فقط مرجع؛ اختیار به هدف تو وابسته نیست)");
      function lvl(label, a) {
        if (a === null || !(a > 0)) return;
        var c = a * (1 + fo), rr = payT / c - 1, preq = c / payT;
        out.levels.push({ label: label, price: a, rr: rr, preq: preq, ev: I.p !== null ? I.p * rr - (1 - I.p) : null, good: a <= out.limit });
      }
      if (I.ask !== null) lvl("خرید فوری (بهترین فروش)", I.ask);
      if (I.ask !== null && I.bid !== null) lvl("میانه", Math.round((I.ask + I.bid) / 2));
      if (I.bid !== null) lvl("سفارش در صف (بهترین خرید)", I.bid);
      if (out.limit > 0) lvl("سقف پیشنهادی", out.limit);
      if (out.limit > 0) {
        var c0 = out.limit * (1 + fo);
        out.beAtLimit = call ? (c0 + K * (1 + fe)) / (1 - fs) : (K * (1 - fs) - c0) / (1 + fe);
        if (S !== null) out.moveAtLimit = call ? out.beAtLimit / S - 1 : 1 - out.beAtLimit / S;
      }
      if (out.ref !== null && out.ref > 0) out.gap = out.limit / out.ref - 1;
      return out;
    }

    // فروشنده
    if (S === null) out.missing.push("قیمت سهم پایه");
    if (K === null) out.missing.push("قیمت اعمال");
    if (td === null || td <= 0) out.missing.push("روز تا سررسید");
    if (out.missing.length) return out;
    var base = call ? S : K, sigma = SG.sigma, s = sigma * Math.sqrt(td);
    out.ref = I.sellp !== null ? I.sellp : I.bid;
    var spY = st.minyield * base / (1 - fo);
    out.parts.push({ label: "برای بازده پریمیوم حداقل " + pc(st.minyield, 1) + " از ارزش پایه", v: spY });
    var q, pnP;
    if (call) { q = S * Math.exp(-0.5 * sigma * sigma * td + s * ncinv(1 - st.assign)); pnP = q - K; }
    else { q = S * Math.exp(-0.5 * sigma * sigma * td + s * ncinv(st.assign)); pnP = K - q; }
    var spP = Math.max(pnP, 0) / (1 - fo);
    out.parts.push({ label: "برای اینکه احتمال زیان از " + pc(st.assign, 0) + " بیشتر نشود (سر به سر باید " + (call ? "بالاتر" : "پایین‌تر") + " از " + f0(q) + " باشد)", v: spP });
    var spF = out.fair !== null ? out.fair / (1 - fo) : null;
    if (spF !== null) out.parts.push({ label: "برای اینکه ارزان‌تر از ارزش تئوری مدل نفروشی", v: spF });
    var lim2 = Math.max.apply(null, out.parts.map(function (x) { return x.v; }));
    out.parts.forEach(function (x) { x.bind = Math.abs(x.v - lim2) < 1e-9; });
    out.limit = Math.ceil(lim2);
    out.ok = true;
    out.safeStrike = q;     // قیمت اعمالی که احتمال اعمالش دقیقاً برابر حد مجاز است
    out.pAssign = probBeyond(call, S, K, sigma, td);
    if (SG.est) out.note.push("سابقه قیمت نبود؛ نوسان از دامنه نوسان تخمین زده شد");
    if ((call && K < q) || (!call && K > q)) out.note.push("قیمت اعمال فعلی (" + f0(K) + ") از قیمت اعمال امن (" + f0(q) + ") " + (call ? "پایین‌تر" : "بالاتر") + " است؛ احتمال اعمال " + pc(out.pAssign, 0) + " است. اختیاری با قیمت اعمال " + (call ? "بالاتر" : "پایین‌تر") + " فروش را امن‌تر می‌کند");
    function slvl(label, a) {
      if (a === null || !(a > 0)) return;
      var pn = a * (1 - fo), be = call ? K + pn : K - pn;
      out.levels.push({ label: label, price: a, yld: pn / base, pLoss: probBeyond(call, S, be, sigma, td), fairr: out.fair > 0 ? a / out.fair : null, good: a >= out.limit });
    }
    if (I.ask !== null) slvl("سفارش در صف (بهترین فروش)", I.ask);
    if (I.ask !== null && I.bid !== null) slvl("میانه", Math.round((I.ask + I.bid) / 2));
    if (I.bid !== null) slvl("فروش فوری (بهترین خرید)", I.bid);
    slvl("کف پیشنهادی", out.limit);
    if (out.ref !== null && out.limit > 0) out.gap = out.ref / out.limit - 1;
    return out;
  }

  var api = { quote: quote, evaluateSell: evaluateSell, fairValue: fairValue, ncinv: ncinv, evaluate: evaluate, DEFAULTS: DEFAULTS, SETTINGS_META: SETTINGS_META, RISK_KEYS: RISK_KEYS, effective: effective, analyze: analyze, ncdf: ncdf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OptionChecklist = api;
})(typeof self !== "undefined" ? self : this);
