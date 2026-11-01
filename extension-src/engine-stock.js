/* موتور محاسبات چک‌لیست خرید سهام: تکنیکال + ریسک + اندازه معامله */
(function (root) {
  "use strict";

  // [key, label, default, kind]  kind: pct => ذخیره به صورت کسر، نمایش به درصد
  var SETTINGS_META = [
    ["lim", "دامنه نوسان روزانه سهم (٪)", 0.03, "pct"],
    ["fee_buy", "کارمزد خرید سهم (٪) ⚠ تقریبی", 0.0037, "pct"],
    ["fee_sell", "کارمزد + مالیات فروش سهم (٪) ⚠ تقریبی", 0.0088, "pct"],
    ["tstop", "خروج زمانی: اگر تا این تعداد روز معاملاتی حرکت نکرد", 15, "num"],
    ["hold", "افق بررسی تاریخی احتمال (روز معاملاتی)", 40, "num"],
    ["riskpct", "حداکثر درصد سرمایه در خطر هر معامله (٪)", 0.01, "pct"],
    ["maxpos", "حداکثر درصد سرمایه در یک سهم (٪)", 0.25, "pct"],
    ["rrmin", "حداقل نسبت سود به ریسک (برابر)", 2, "num"],
    ["margin", "حاشیه امن احتمال (٪)", 0.08, "pct"],
    ["minscore", "حداقل امتیاز تکنیکال (از ۱۰۰)", 55, "num"],
    ["maxrsi", "حداکثر RSI برای ورود (حالت روندی)", 72, "num"],
    ["maxext", "حداکثر فاصله بالای میانگین ۲۰ روزه (برابر ATR)", 2.5, "num"],
    ["minstopatr", "حداقل فاصله حد ضرر از قیمت ورود (برابر ATR)", 1.2, "num"],
    ["maxstop", "حداکثر فاصله حد ضرر از قیمت ورود (٪)", 0.1, "pct"],
    ["breakvol", "حداقل حجم نسبی برای شکست (برابر میانگین)", 1.5, "num"],
    ["minpower", "حداقل قدرت خریدار حقیقی (هشدار)", 1, "num"],
    ["minval", "حداقل ارزش معاملات روزانه (میلیارد ریال)", 50, "num"],
    ["maxspread", "حداکثر اسپرد دفتر سفارش (٪)", 0.015, "pct"],
    ["maxpart", "حداکثر سهم سفارش من از حجم روزانه (٪)", 0.01, "pct"],
    ["maxwarn", "حداکثر تعداد هشدار قبل از «فعلاً نخر»", 3, "num"],
  ];
  // [خیلی محتاط (۱), متعادل (۵), خیلی ریسک‌پذیر (۱۰)]
  var RISK_KEYS = {
    riskpct: [0.005, 0.01, 0.02], maxpos: [0.15, 0.25, 0.4], rrmin: [3, 2, 1.5], margin: [0.15, 0.08, 0.03],
    minscore: [68, 55, 42], maxrsi: [66, 72, 80], maxext: [1.5, 2.5, 3.5], minstopatr: [1.6, 1.2, 0.9],
    maxstop: [0.07, 0.1, 0.15], breakvol: [2, 1.5, 1.2], minpower: [1.3, 1, 0.7], minval: [150, 50, 15],
    maxspread: [0.008, 0.015, 0.03], maxpart: [0.005, 0.01, 0.02], maxwarn: [2, 3, 5],
  };
  var INT_KEYS = { minscore: 1, maxrsi: 1, minval: 1, maxwarn: 1 };
  function interp(arr, a) {
    a = Math.min(10, Math.max(1, a));
    if (a <= 5) return arr[0] + (arr[1] - arr[0]) * (a - 1) / 4;
    return arr[1] + (arr[2] - arr[1]) * (a - 5) / 5;
  }
  var DEFAULTS = {};
  SETTINGS_META.forEach(function (m) { DEFAULTS[m[0]] = m[2]; });
  DEFAULTS.risk = 5;
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

  function num(x) { if (x === null || x === undefined || x === "") return null; var n = Number(x); return isFinite(n) ? n : null; }
  function pc(x, d) { return (x * 100).toFixed(d === undefined ? 0 : d) + "٪"; }
  function f0(x) { return Math.round(x).toLocaleString("en-US"); }
  function has() {
    for (var i = 0; i < arguments.length; i++) if (arguments[i] === null || arguments[i] === undefined || arguments[i] === "" || (typeof arguments[i] === "number" && !isFinite(arguments[i]))) return false;
    return true;
  }
  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }

  // ================= اندیکاتورها =================
  function smaAt(a, n, end) {
    end = end === undefined ? a.length - 1 : end;
    if (end - n + 1 < 0) return null;
    var s = 0;
    for (var i = end - n + 1; i <= end; i++) s += a[i];
    return s / n;
  }
  function emaSeries(a, n) {
    var out = new Array(a.length).fill(null);
    if (a.length < n) return out;
    var k = 2 / (n + 1), e = 0, i;
    for (i = 0; i < n; i++) e += a[i];
    e /= n; out[n - 1] = e;
    for (i = n; i < a.length; i++) { e = a[i] * k + e * (1 - k); out[i] = e; }
    return out;
  }
  function rsiLast(c, n) {
    if (c.length < n + 1) return null;
    var g = 0, l = 0, i, d;
    for (i = 1; i <= n; i++) { d = c[i] - c[i - 1]; if (d >= 0) g += d; else l -= d; }
    g /= n; l /= n;
    for (i = n + 1; i < c.length; i++) { d = c[i] - c[i - 1]; g = (g * (n - 1) + (d > 0 ? d : 0)) / n; l = (l * (n - 1) + (d < 0 ? -d : 0)) / n; }
    return l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  function atrLast(bars, n) {
    if (bars.length < n + 1) return null;
    var trs = [], i;
    for (i = 1; i < bars.length; i++) {
      var h = bars[i].h, l = bars[i].l, pcv = bars[i - 1].c;
      trs.push(Math.max(h - l, Math.abs(h - pcv), Math.abs(l - pcv)));
    }
    var a = mean(trs.slice(0, n));
    for (i = n; i < trs.length; i++) a = (a * (n - 1) + trs[i]) / n;
    return a;
  }
  function macdLast(c) {
    var e12 = emaSeries(c, 12), e26 = emaSeries(c, 26), line = [];
    for (var i = 0; i < c.length; i++) if (e12[i] !== null && e26[i] !== null) line.push(e12[i] - e26[i]);
    if (line.length < 12) return null;
    var sig = emaSeries(line, 9), k = line.length - 1;
    if (sig[k] === null || sig[k - 1] === null) return null;
    return { line: line[k], sig: sig[k], hist: line[k] - sig[k], histPrev: line[k - 1] - sig[k - 1] };
  }
  // نقطه‌های چرخش (fractal) برای حمایت و مقاومت
  function swings(bars, k, lookback) {
    var n = bars.length, start = Math.max(k, n - lookback), hi = [], lo = [], i, j;
    for (i = start; i < n - k; i++) {
      var isH = true, isL = true;
      for (j = 1; j <= k; j++) {
        if (!(bars[i].h > bars[i - j].h && bars[i].h >= bars[i + j].h)) isH = false;
        if (!(bars[i].l < bars[i - j].l && bars[i].l <= bars[i + j].l)) isL = false;
      }
      if (isH) hi.push(bars[i].h);
      if (isL) lo.push(bars[i].l);
    }
    return { highs: hi, lows: lo };
  }

  function tech(an, S, st) {
    var bars = an && an.bars;
    if (!bars || bars.length < 30) return null;
    var n = bars.length, last = n - 1;
    var c = bars.map(function (b) { return b.c; });
    var px = S > 0 ? S : c[last];
    var T = { n: n, px: px, c: c[last] };
    T.sma20 = smaAt(c, 20); T.sma50 = smaAt(c, 50); T.sma200 = n >= 200 ? smaAt(c, 200) : null;
    var s50p = n >= 60 ? smaAt(c, 50, last - 10) : null;
    T.slope50 = (T.sma50 !== null && s50p) ? T.sma50 / s50p - 1 : null;
    T.rsi = rsiLast(c, 14);
    T.macd = macdLast(c);
    T.atr = atrLast(bars, 14);
    T.atrp = T.atr !== null ? T.atr / px : null;
    T.roc20 = n > 20 ? c[last] / c[last - 20] - 1 : null;
    T.roc60 = n > 60 ? c[last] / c[last - 60] - 1 : null;
    var m20 = smaAt(c, 20), sd = 0, i;
    if (m20 !== null) { for (i = n - 20; i < n; i++) sd += (c[i] - m20) * (c[i] - m20); sd = Math.sqrt(sd / 20); T.bbpos = sd > 0 ? (c[last] - (m20 - 2 * sd)) / (4 * sd) : 0.5; }
    var win = bars.slice(-Math.min(250, n));
    T.hh52 = Math.max.apply(null, win.map(function (b) { return b.h; }));
    T.ll52 = Math.min.apply(null, win.map(function (b) { return b.l; }));
    T.dHigh = px / T.hh52 - 1;
    var prior = bars.slice(0, n - 1);
    var p20 = prior.slice(-20), p60 = prior.slice(-60);
    T.hh20p = Math.max.apply(null, p20.map(function (b) { return b.h; }));
    T.ll20p = Math.min.apply(null, p20.map(function (b) { return b.l; }));
    T.hh60p = Math.max.apply(null, p60.map(function (b) { return b.h; }));
    T.ll60p = Math.min.apply(null, p60.map(function (b) { return b.l; }));
    T.hh20 = Math.max.apply(null, bars.slice(-20).map(function (b) { return b.h; }));
    var vavg = mean(p20.map(function (b) { return b.v; }));
    T.volratio = vavg > 0 ? bars[last].v / vavg : null;
    var up = 0, dn = 0;
    for (i = n - 20; i < n; i++) { if (i < 1) continue; if (c[i] >= c[i - 1]) up += bars[i].v; else dn += bars[i].v; }
    T.udv = dn > 0 ? up / dn : null;
    var lb = bars[last];
    T.closeStr = lb.h > lb.l ? (lb.c - lb.l) / (lb.h - lb.l) : null;
    T.upClose = n > 1 ? c[last] > c[last - 1] : null;
    T.ext = (T.atr > 0 && T.sma20 !== null) ? (px - T.sma20) / T.atr : null;
    T.pbDepth = T.atr > 0 ? (T.hh20 - px) / T.atr : null;
    var sw = swings(bars, 3, 160);
    T.sw = sw;
    // روند
    var strong = T.sma50 !== null && px > T.sma50 && (T.sma200 !== null ? T.sma50 > T.sma200 : (T.sma20 > T.sma50)) && T.slope50 !== null && T.slope50 > 0;
    var weak = T.sma50 !== null && px < T.sma50 && T.slope50 !== null && T.slope50 < 0 && (T.sma200 === null || px < T.sma200);
    T.trendTxt = strong ? "صعودی قوی" : (T.sma50 !== null && px > T.sma50 && (T.slope50 === null || T.slope50 >= 0)) ? "صعودی" : weak ? "نزولی" : "خنثی / نامشخص";
    T.power = an.power === undefined ? null : an.power;
    T.netreal = an.netreal === undefined ? null : an.netreal;
    // امتیاز تکنیکال
    var pts = 0, mx = 0, parts = { trend: [0, 0], mom: [0, 0], flow: [0, 0], pos: [0, 0] };
    function add(g, cond, p) { if (cond === null || cond === undefined) return; parts[g][1] += p; mx += p; if (cond) { parts[g][0] += p; pts += p; } }
    function addv(g, v, p, max) { parts[g][1] += max; mx += max; parts[g][0] += v; pts += v; }
    add("trend", T.sma20 !== null ? px > T.sma20 : null, 6);
    add("trend", T.sma50 !== null ? px > T.sma50 : null, 8);
    add("trend", (T.sma20 !== null && T.sma50 !== null) ? T.sma20 > T.sma50 : null, 6);
    add("trend", T.sma200 !== null ? px > T.sma200 : null, 6);
    add("trend", (T.sma50 !== null && T.sma200 !== null) ? T.sma50 > T.sma200 : null, 5);
    add("trend", T.slope50 !== null ? T.slope50 > 0 : null, 4);
    if (T.rsi !== null) { var r = T.rsi; addv("mom", (r >= 50 && r <= 70) ? 8 : (r >= 40 && r < 50) ? 5 : (r > 70 && r <= 80) ? 4 : (r >= 30 && r < 40) ? 2 : 0, 0, 8); }
    if (T.macd) { add("mom", T.macd.hist > 0, 6); add("mom", T.macd.line > 0, 3); }
    add("mom", T.roc20 !== null ? T.roc20 > 0 : null, 4);
    add("mom", T.roc60 !== null ? T.roc60 > 0 : null, 4);
    if (T.udv !== null) addv("flow", T.udv > 1.2 ? 6 : T.udv > 1 ? 3 : 0, 0, 6);
    add("flow", T.volratio !== null ? T.volratio >= 1 : null, 3);
    if (T.power !== null) addv("flow", T.power >= 1.2 ? 6 : T.power >= 1 ? 3 : 0, 0, 6);
    add("flow", T.netreal !== null ? T.netreal > 0 : null, 5);
    addv("pos", T.dHigh >= -0.05 ? 8 : T.dHigh >= -0.15 ? 5 : T.dHigh >= -0.25 ? 2 : 0, 0, 8);
    add("pos", T.ext !== null ? T.ext <= (st ? st.maxext : 2.5) : null, 6);
    add("pos", T.bbpos !== undefined ? (T.bbpos >= 0.2 && T.bbpos <= 0.95) : null, 3);
    add("pos", T.atrp !== null ? T.atrp <= 0.06 : null, 3);
    T.score = mx > 0 ? Math.round(pts / mx * 100) : null;
    T.parts = {};
    Object.keys(parts).forEach(function (g) { T.parts[g] = parts[g][1] > 0 ? Math.round(parts[g][0] / parts[g][1] * 100) : null; });
    return T;
  }

  // احتمال تاریخی: در سابقه خود سهم، با همان درصد هدف و حد ضرر، کدام زودتر لمس شده؟
  function pEmpFor(bars, upPct, dnPct, hold) {
    if (!bars || bars.length < 60 || !(upPct > 0) || !(dnPct > 0)) return null;
    var ups = 0, dns = 0, n = bars.length;
    for (var i = 0; i < n - 1; i++) {
      var base = bars[i].c, up = base * (1 + upPct), dn = base * (1 - dnPct);
      for (var j = i + 1; j <= Math.min(i + hold, n - 1); j++) {
        var hitU = bars[j].h >= up, hitD = bars[j].l <= dn;
        if (hitD) { dns++; break; }       // اگر هر دو در یک روز لمس شد، محافظه‌کارانه حد ضرر
        if (hitU) { ups++; break; }
      }
    }
    if (ups + dns < 20) return null;
    return { p: ups / (ups + dns), n: ups + dns };
  }

  // ================= طرح معامله: ورود، حد ضرر، هدف =================
  function makePlan(mode, inp, st, T, S) {
    var E = num(inp.entry) !== null && num(inp.entry) > 0 ? num(inp.entry) : S;
    if (!has(E) || E <= 0) return null;
    var atr = T && T.atr > 0 ? T.atr : null;
    var P = { E: E, atr: atr, stop: null, stopSrc: "", target: null, targetSrc: "", target2: null, support: null, resistance: null, level: null, valid: false };
    var ut = num(inp.stop), ug = num(inp.target);
    var sups = T ? T.sw.lows.filter(function (x) { return x < E * 0.995; }) : [];
    var minRoom = Math.max(E * 0.005, atr || 0);   // مقاومت نزدیک‌تر از ۱ ATR نویز است، نه هدف
    var ress = T ? T.sw.highs.filter(function (x) { return x > E + minRoom; }).sort(function (a, b) { return a - b; }) : [];
    P.support = sups.length ? Math.max.apply(null, sups) : null;
    P.resistance = ress.length ? ress[0] : null;
    P.res2 = ress.length > 1 ? ress[1] : (T && T.hh52 > E * 1.01 ? T.hh52 : null);
    if (T) {
      P.level = (Math.abs(T.px / T.hh60p - 1) < 0.06) ? T.hh60p : T.hh20p;
      P.levelName = P.level === T.hh60p ? "سقف ۶۰ روزه" : "سقف ۲۰ روزه";
    }
    // حد ضرر
    if (ut !== null && ut > 0 && ut < E) { P.stop = ut; P.stopSrc = "حد ضرر خودت"; }
    else if (atr) {
      var minD = st.minstopatr * atr;
      if (P.support !== null && E - P.support >= minD && E - P.support <= 4 * atr) { P.stop = P.support - 0.25 * atr; P.stopSrc = "زیر حمایت (" + f0(P.support) + ") منهای ۰٫۲۵ ATR"; }
      else { P.stop = E - 2 * atr; P.stopSrc = "۲ برابر ATR زیر ورود"; }
    }
    // هدف: اول = مقاومت بعدی؛ دوم = مقاومت پس از آن. سود/ریسک با میانگین دو هدف سنجیده می‌شود
    // چون برنامه خروج این است که نیمی از پوزیشن در هدف اول و نیمی در هدف دوم فروخته شود
    var t1 = null;
    if (ug !== null && ug > E) { t1 = ug; P.targetSrc = "هدف خودت"; }
    else if (P.resistance !== null) { t1 = P.resistance; P.targetSrc = "مقاومت بعدی"; }
    else if (T && atr) { t1 = E + Math.max(0.5 * (T.hh60p - T.ll60p), 6 * atr); P.targetSrc = "حرکت اندازه‌گیری‌شده (نیمی از دامنه ۶۰ روزه یا ۶ ATR)"; }
    P.target1 = t1;
    P.target2 = (t1 !== null && P.res2 !== null && P.res2 > t1 * 1.005) ? P.res2 : null;
    P.target = t1;
    if (t1 !== null && P.stop !== null && P.stop < E && P.target2 !== null && !(ug !== null && ug > E)) {
      P.target = (t1 + Math.min(P.target2, E + 4 * (E - P.stop))) / 2;
      P.targetSrc = "میانگین هدف اول و دوم (نیمی از پوزیشن در هر کدام)";
    }
    P.valid = P.stop !== null && P.target !== null && P.stop < E && P.target > E;
    return P;
  }
  function rrOf(E, stop, target, st) {
    var win = target * (1 - st.fee_sell) - E * (1 + st.fee_buy);
    var loss = E * (1 + st.fee_buy) - stop * (1 - st.fee_sell);
    return loss > 0 ? { rr: win / loss, win: win, loss: loss } : null;
  }

  var MODE_FIT = { trend: "روندی", pull: "اصلاح", "break": "شکست" };

  // ================= ارزیابی =================
  function evaluate(mode, inp, userSt, an) {
    var st = effective(userSt);
    var I = {};
    ["capital", "S", "entry", "val_u", "vol_a", "ask", "bid", "pe", "pe_sec", "stop", "target", "p", "qty"].forEach(function (k) { I[k] = num(inp[k]); });
    var Y = function (k) { return inp[k] || ""; };
    var R = {}, rows = [];
    function row(step, key, label, v, fmt, help) { R[key] = v; rows.push({ step: step, key: key, label: label, v: v, fmt: fmt, help: help || "" }); }
    var steps = [];
    function step(n, missing, hard, warn) {
      var status;
      if (missing) { hard = []; warn = []; status = "⏳"; }
      else if (hard.length) status = "❌";
      else if (warn.length) status = "⚠";
      else status = "✅";
      steps[n] = { n: n, status: status, missing: missing, hard: hard, warn: warn };
    }
    var S = I.S, fb = st.fee_buy, fs = st.fee_sell;
    var T = tech(an, S, st);
    var plan = has(S) ? makePlan(mode, inp, st, T, S) : null;
    var E = plan ? plan.E : null;

    // ---------- مرحله ۰
    row(0, "E", "قیمت ورود مورد استفاده (ریال)", E, "money", "اگر قیمت ورود وارد نکنی، آخرین معامله استفاده می‌شود");
    if (T) row(0, "chg", "تغییر نسبت به پایانی دیروز", T.n > 1 ? T.px / (an.bars[T.n - 2].c) - 1 : null, "pct1");

    // ---------- مرحله ۱: وضعیت سهم
    var m1 = !(Y("q_thesis") && Y("q_halt") && Y("q_event") && Y("q_market") && Y("q_fund"));
    var h1 = [], w1 = [];
    var perel = has(I.pe, I.pe_sec) && I.pe_sec > 0 ? I.pe / I.pe_sec : null;
    row(1, "pe", "P/E سهم", I.pe, "ratio1");
    row(1, "pe_sec", "P/E صنعت", I.pe_sec, "ratio1");
    row(1, "perel", "P/E سهم نسبت به صنعت (برابر)", perel, "ratio2", "بالاتر از ۱ = گران‌تر از میانگین صنعت");
    if (!m1) {
      if (Y("q_thesis") === "خیر") h1.push("دلیل مشخصی برای خرید این سهم نداری؛ بدون دلیل نخر");
      if (Y("q_halt") === "خیر") h1.push("سهم الان بسته یا متوقف است");
      if (Y("q_event") === "بله") w1.push("تا افق نگهداری‌ات رویداد مهم داری (مجمع، تقسیم سود، افزایش سرمایه)؛ تاریخ و اثر قیمتی‌اش را بررسی کن");
      if (Y("q_market") === "خیر") w1.push("روند کلی بازار یا صنعت منفی است؛ سهم‌های خوب هم در بازار نزولی معمولاً با بازار می‌ریزند");
      if (Y("q_fund") === "خیر") w1.push("از نظر بنیادی مشکل داری (سودآوری، بدهی، گزارش‌ها)؛ فقط با حد ضرر سخت‌گیرانه");
      if (I.pe !== null && I.pe < 0) w1.push("P/E منفی است (شرکت زیان‌ده)");
      else if (perel !== null && perel > 1.5) w1.push("P/E سهم " + perel.toFixed(1) + " برابر صنعت است؛ نسبت به صنعت گران است");
    }
    step(1, m1, h1, w1);

    // ---------- مرحله ۲: نقدشوندگی
    var spread = (has(I.ask, I.bid) && I.ask > 0 && I.bid > 0) ? (I.ask - I.bid) / I.ask : null;
    row(2, "val_u", "میانگین ارزش معاملات روزانه (میلیارد ریال)", I.val_u, "money");
    row(2, "vol_a", "میانگین حجم روزانه (سهم)", I.vol_a, "money");
    row(2, "spread", "اسپرد دفتر سفارش", spread, "pct2", "فاصله بهترین خرید و فروش؛ هزینه ورود و خروج سریع");
    var m2 = !(has(I.val_u) && Y("q_sq") && Y("q_bq"));
    var h2 = [], w2 = [];
    if (!m2) {
      if (Y("q_sq") === "بله") h2.push("سهم در صف فروش است؛ ورود به صف فروش یعنی گرفتن چاقوی در حال سقوط و خروج ممکن نیست");
      if (I.val_u < st.minval) h2.push("ارزش معاملات روزانه (" + f0(I.val_u) + " میلیارد ریال) کمتر از حداقل (" + st.minval + ") است");
      if (spread !== null && spread > st.maxspread) h2.push("اسپرد " + pc(spread, 2) + " بیشتر از حد مجاز (" + pc(st.maxspread, 2) + ") است");
      if (Y("q_bq") === "بله") w2.push("سهم در صف خرید قفل است؛ فقط با ایستادن در صف می‌توانی بخری و نوبتت ممکن است نرسد");
    }
    step(2, m2, h2, w2);

    // ---------- مرحله ۳: تکنیکال
    var m3 = !(T && has(S));
    var h3 = [], w3 = [];
    var Lvl = plan ? plan.level : null;
    var LvlDist = (has(Lvl, S) && T && T.atr > 0) ? (S - Lvl) / T.atr : null;
    if (T) {
      row(3, "trend", "روند", T.trendTxt, "text", "بر پایه میانگین‌های ۲۰ و ۵۰ و ۲۰۰ روزه و شیب میانگین ۵۰");
      row(3, "score", "امتیاز تکنیکال (از ۱۰۰)", T.score, "int", "ترکیب روند، مومنتوم، جریان پول و موقعیت قیمت");
      row(3, "sTrend", "  امتیاز روند (٪)", T.parts.trend, "int");
      row(3, "sMom", "  امتیاز مومنتوم (٪)", T.parts.mom, "int");
      row(3, "sFlow", "  امتیاز جریان پول و حجم (٪)", T.parts.flow, "int");
      row(3, "sPos", "  امتیاز موقعیت قیمت (٪)", T.parts.pos, "int");
      row(3, "sma20", "میانگین ۲۰ روزه (ریال)", T.sma20, "money");
      row(3, "sma50", "میانگین ۵۰ روزه (ریال)", T.sma50, "money");
      row(3, "sma200", "میانگین ۲۰۰ روزه (ریال)", T.sma200, "money", T.sma200 === null ? "سابقه کمتر از ۲۰۰ روز بود" : "");
      row(3, "rsi", "RSI (۱۴)", T.rsi, "int", "بالای ۷۰ داغ، زیر ۳۰ ضعیف");
      row(3, "macd", "هیستوگرام MACD", T.macd ? T.macd.hist : null, "ratio2", "مثبت = مومنتوم صعودی");
      row(3, "roc20", "بازده ۲۰ روز اخیر", T.roc20, "pct1");
      row(3, "atrp", "نوسان روزانه (ATR به درصد قیمت)", T.atrp, "pct2", "دامنه معمول حرکت یک روز");
      row(3, "dHigh", "فاصله از سقف یک‌ساله", T.dHigh, "pct1");
      row(3, "ext", "فاصله از میانگین ۲۰ روزه (برابر ATR)", T.ext, "ratio1", "هرچه بیشتر، ورود دورتر از «قیمت منصفانه کوتاه‌مدت»");
      row(3, "volratio", "حجم امروز نسبت به میانگین ۲۰ روز (برابر)", T.volratio, "ratio1", "اگر بازار باز است، حجم امروز هنوز کامل نیست");
      row(3, "udv", "حجم روزهای صعودی به نزولی (۲۰ روز)", T.udv, "ratio2", "بیش از ۱ = حجم بیشتر در روزهای مثبت");
      if (T.power !== null) row(3, "power", "قدرت خریدار حقیقی (بیش از ۱ = خریدار قوی‌تر)", T.power, "ratio2");
      if (T.netreal !== null) row(3, "netreal", "خالص خرید حقیقی نسبت به کل حجم امروز", T.netreal, "pct1");
      if (mode === "pull") row(3, "pbDepth", "عمق اصلاح از سقف ۲۰ روزه (برابر ATR)", T.pbDepth, "ratio1");
      if (mode === "break") { row(3, "level", "سطح شکست (" + (plan ? plan.levelName : "") + ")", Lvl, "money"); row(3, "levDist", "فاصله قیمت از سطح شکست (برابر ATR)", LvlDist, "ratio1", "منفی = هنوز زیر سطح"); }
    }
    if (!m3) {
      var minsc = mode === "pull" ? st.minscore - 15 : mode === "break" ? st.minscore - 5 : st.minscore;
      if (T.score !== null && T.score < minsc) h3.push("امتیاز تکنیکال " + T.score + " از ۱۰۰ کمتر از حداقل این حالت (" + minsc + ") است");
      if (T.n < 200) w3.push("سابقه فقط " + T.n + " روز است؛ میانگین ۲۰۰ روزه و بخشی از امتیاز محاسبه نشد");
      if (mode === "trend") {
        if (T.sma50 !== null && T.px < T.sma50) h3.push("قیمت زیر میانگین ۵۰ روزه است؛ روند صعودی نیست (برای این حالت لازم است)");
        if (T.rsi !== null && T.rsi > st.maxrsi) h3.push("RSI " + T.rsi.toFixed(0) + " از حد مجاز (" + st.maxrsi + ") بالاتر است؛ خرید در داغی بازار");
        if (T.ext !== null && T.ext > st.maxext + 1.5) h3.push("قیمت " + T.ext.toFixed(1) + " برابر ATR بالای میانگین ۲۰ روزه است؛ بسیار دور از قیمت منصفانه کوتاه‌مدت");
        else if (T.ext !== null && T.ext > st.maxext) w3.push("قیمت " + T.ext.toFixed(1) + " برابر ATR بالای میانگین ۲۰ روزه است؛ منتظر اصلاح کوتاه بمان");
        if (T.slope50 !== null && T.slope50 < 0) w3.push("شیب میانگین ۵۰ روزه رو به پایین است");
        if (T.sma200 !== null && T.px < T.sma200) w3.push("قیمت زیر میانگین ۲۰۰ روزه است");
        if (T.macd && T.macd.hist < 0) w3.push("مومنتوم (MACD) منفی است");
      } else if (mode === "pull") {
        if (T.sma200 !== null && T.px < T.sma200) h3.push("قیمت زیر میانگین ۲۰۰ روزه است؛ روند اصلی صعودی نیست و اصلاح نمی‌تواند خرید باشد");
        if (T.slope50 !== null && T.slope50 < 0) h3.push("شیب میانگین ۵۰ روزه نزولی است؛ این اصلاح نیست، شروع ریزش است");
        if (T.sma50 !== null && T.px < T.sma50 * 0.97) h3.push("قیمت بیش از ۳٪ زیر میانگین ۵۰ روزه شکسته است؛ ناحیه حمایت از دست رفته");
        if (T.pbDepth !== null && T.pbDepth < 1) h3.push("هنوز اصلاحی دیده نمی‌شود (فقط " + T.pbDepth.toFixed(1) + " ATR زیر سقف ۲۰ روزه)");
        if (T.rsi !== null && T.rsi > 58) h3.push("RSI " + T.rsi.toFixed(0) + " هنوز بالاست؛ اصلاح کامل نشده");
        if (T.rsi !== null && T.rsi < 30) w3.push("RSI زیر ۳۰ است؛ شاید اصلاح نیست و ضعف جدی است");
        if (T.upClose === false && T.closeStr !== null && T.closeStr < 0.5) w3.push("هنوز نشانه برگشت (بسته شدن بالاتر از دیروز) دیده نمی‌شود");
      } else if (mode === "break") {
        if (T.sma50 !== null && T.px < T.sma50) h3.push("قیمت زیر میانگین ۵۰ روزه است؛ شکستِ خلاف روند میان‌مدت قابل اعتماد نیست");
        else if (T.sma200 !== null && T.px < T.sma200) w3.push("قیمت هنوز زیر میانگین ۲۰۰ روزه است؛ شکست از پایه‌ی ضعیف‌تر شروع شده");
        if (has(Lvl) && T.px < Lvl * 0.99) h3.push("قیمت هنوز به سطح شکست (" + f0(Lvl) + ") نرسیده است");
        if (LvlDist !== null && LvlDist > 2.5) h3.push("قیمت " + LvlDist.toFixed(1) + " برابر ATR بالای سطح شکست است؛ شکست دیر شده و تعقیب قیمت است");
        else if (LvlDist !== null && LvlDist > 1) w3.push("قیمت " + LvlDist.toFixed(1) + " برابر ATR بالای سطح شکست است؛ ورود کمی دیر است");
        if (T.volratio !== null && T.volratio < 1) h3.push("حجم شکست از میانگین هم کمتر است؛ شکست بی‌پشتوانه معمولاً شکست می‌خورد");
        else if (T.volratio !== null && T.volratio < st.breakvol) w3.push("حجم " + T.volratio.toFixed(1) + " برابر میانگین است؛ برای تأیید شکست حداقل " + st.breakvol + " برابر لازم است");
        if (T.rsi !== null && T.rsi > st.maxrsi + 8) h3.push("RSI " + T.rsi.toFixed(0) + " بیش از حد داغ است");
        if (T.closeStr !== null && T.closeStr < 0.6) w3.push("قیمت پایانی در بخش پایینی دامنه روز بسته شده؛ فشار فروش وجود دارد");
      }
      if (T.power !== null && T.power < st.minpower) w3.push("قدرت خریدار حقیقی " + T.power.toFixed(2) + " کمتر از " + st.minpower + " است");
      if (T.netreal !== null && T.netreal < -0.1) w3.push("حقیقی‌ها خالص فروشنده‌اند (" + pc(T.netreal, 0) + " حجم)");
    }
    step(3, m3, h3, w3);

    // ---------- مرحله ۴: سود و زیان
    var rrr = (plan && plan.valid) ? rrOf(E, plan.stop, plan.target, st) : null;
    var rr = rrr ? rrr.rr : null;
    var stopPct = (plan && plan.valid) ? (E - plan.stop) / E : null;
    var tgtPct = (plan && plan.valid) ? plan.target / E - 1 : null;
    var stopAtr = (plan && plan.valid && plan.atr) ? (E - plan.stop) / plan.atr : null;
    var preq = rrr ? rrr.loss / (rrr.loss + rrr.win) : null;
    var pModel = (plan && plan.valid) ? Math.log(E / plan.stop) / Math.log(plan.target / plan.stop) : null;
    var emp = (plan && plan.valid && an && an.bars) ? pEmpFor(an.bars, tgtPct, stopPct, st.hold) : null;
    var pEmp = emp ? emp.p : null;
    var pSug = pEmp !== null ? pEmp : pModel;
    var ev = has(I.p, rr) ? I.p * rr - (1 - I.p) : null;
    row(4, "stop", "حد ضرر (ریال)", plan ? plan.stop : null, "money", plan ? plan.stopSrc : "");
    row(4, "stopPct", "فاصله حد ضرر از ورود", stopPct, "pct1");
    row(4, "stopAtr", "فاصله حد ضرر (برابر ATR)", stopAtr, "ratio1", "کمتر از ~۱ یعنی در نویز عادی روز خورده می‌شود");
    row(4, "target1", "هدف اول (ریال)", plan ? plan.target1 : null, "money", "نزدیک‌ترین مقاومت معتبر (دورتر از ۱ ATR) یا هدف خودت");
    row(4, "target2", "هدف دوم (ریال)", plan ? plan.target2 : null, "money");
    row(4, "target", "هدف مؤثر برای سود به ریسک (ریال)", plan ? plan.target : null, "money", plan ? plan.targetSrc : "");
    row(4, "tgtPct", "فاصله هدف مؤثر از ورود", tgtPct, "pct1");
    row(4, "rr", "نسبت سود به ریسک (پس از کارمزد)", rr, "ratio1", "سود تا هدف ÷ زیان تا حد ضرر");
    row(4, "preq", "حداقل احتمال لازم برای سر به سر", preq, "pct0");
    row(4, "ev", "امید ریاضی هر معامله (بر حسب ریسک)", ev, "ratio2", "با احتمال خودت؛ مثبت = ارزش‌دار (۱ = برابر کل ریسک)");
    row(4, "pModel", "احتمال آماری رسیدن به هدف پیش از حد ضرر (مدل)", pModel, "pct0", "بدون فرض روند؛ از فاصله‌ها");
    row(4, "pEmp", "احتمال تاریخی (در سابقه خود سهم)", pEmp, "pct0", emp ? ("روی " + emp.n + " نمونه با همان درصد هدف و حد ضرر") : "نمونه کافی نبود");
    row(4, "pSug", "احتمال مرجع (تاریخی؛ اگر نبود مدل)", pSug, "pct0", "فقط مرجع؛ سابقه‌ی صعودی سهم آن را بالا می‌برد. تصمیم با خودت است");
    var m4 = !(plan && plan.valid && has(I.p));
    var h4 = [], w4 = [];
    if (!m4) {
      if (rr <= 0) h4.push("تا هدف (" + f0(plan.target) + ") بعد از کارمزد خرید و فروش سودی نمی‌ماند؛ جای حرکت بالا کم است");
      else if (rr < st.rrmin) h4.push("نسبت سود به ریسک " + rr.toFixed(1) + " برابر است؛ حداقل " + st.rrmin + " برابر لازم است (تا " + (plan.targetSrc || "هدف") + ")");
      if (rr > 0 && I.p < preq + st.margin) h4.push("احتمال تخمینی تو (" + pc(I.p, 0) + ") کمتر از حداقل لازم (" + pc(Math.min(1, preq + st.margin), 0) + ") است؛ سر به سر ریاضی " + pc(preq, 0) + " به‌علاوه حاشیه امن");
      if (stopPct > st.maxstop) h4.push("حد ضرر " + pc(stopPct, 1) + " با قیمت ورود فاصله دارد؛ بیشتر از حداکثر مجاز (" + pc(st.maxstop, 0) + ")");
      if (stopAtr !== null && stopAtr < st.minstopatr) h4.push("حد ضرر فقط " + stopAtr.toFixed(1) + " برابر ATR از ورود فاصله دارد؛ حداقل " + st.minstopatr + " لازم است وگرنه با نوسان عادی خورده می‌شود");
      if (pSug !== null && I.p > pSug + 0.2) w4.push("احتمال تخمینی تو (" + pc(I.p, 0) + ") خیلی بالاتر از احتمال مرجع (" + pc(pSug, 0) + ") است؛ دوباره فکر کن");
      if (plan.targetSrc.indexOf("اندازه") >= 0) w4.push("بالای قیمت مقاومت مشخصی دیده نشد؛ هدف با حرکت اندازه‌گیری‌شده تخمین زده شد");
    }
    step(4, m4, h4, w4);

    // ---------- مرحله ۵: اندازه معامله
    var riskPS = (plan && plan.valid) ? E * (1 + fb) - plan.stop * (1 - fs) : null;
    var budget = has(I.capital) ? I.capital * st.riskpct : null;
    var qRisk = has(riskPS, budget) && riskPS > 0 ? Math.floor(budget / riskPS) : null;
    var qPos = has(I.capital, E) ? Math.floor(I.capital * st.maxpos / (E * (1 + fb))) : null;
    var qVol = has(I.vol_a) ? Math.floor(I.vol_a * st.maxpart) : null;
    var qCands = [qRisk, qPos, qVol].filter(function (x) { return x !== null; });
    var qMax = qCands.length ? Math.min.apply(null, qCands) : null;
    var qty = I.qty !== null ? I.qty : qMax;
    var posVal = has(qty, E) ? qty * E : null;
    var posPct = has(posVal, I.capital) && I.capital > 0 ? posVal / I.capital : null;
    var riskAmt = has(qty, riskPS) ? qty * riskPS : null;
    var riskReal = has(riskAmt, I.capital) && I.capital > 0 ? riskAmt / I.capital : null;
    var exitDays = has(qty, I.vol_a) && I.vol_a > 0 ? qty / (I.vol_a * 0.1) : null;
    var gapLoss = has(posVal) ? posVal * (1 - Math.pow(1 - st.lim, 3)) : null;
    row(5, "budget", "حداکثر زیان مجاز در این معامله (ریال)", budget, "money");
    row(5, "riskPS", "زیان هر سهم در حد ضرر (با کارمزد) (ریال)", riskPS, "money");
    row(5, "qRisk", "حداکثر تعداد بر اساس ریسک", qRisk, "money");
    row(5, "qPos", "حداکثر تعداد بر اساس سهم از سرمایه", qPos, "money");
    row(5, "qVol", "حداکثر تعداد بر اساس حجم روزانه", qVol, "money");
    row(5, "qMax", "حداکثر تعداد مجاز (کمترین)", qMax, "money", "اگر تعداد را وارد نکنی همین استفاده می‌شود");
    row(5, "qty", "تعداد مورد استفاده", qty, "money");
    row(5, "posVal", "ارزش پوزیشن (ریال)", posVal, "money");
    row(5, "posPct", "سهم پوزیشن از سرمایه", posPct, "pct0");
    row(5, "riskReal", "زیان واقعی تا حد ضرر نسبت به سرمایه", riskReal, "pct2");
    row(5, "exitDays", "روز لازم برای خروج (با ۱۰٪ حجم روزانه)", exitDays, "ratio2");
    row(5, "gapLoss", "زیان اگر ۳ روز پشت‌سرهم کف قیمت قفل شود (ریال)", gapLoss, "money", "در صف فروش حد ضرر اجرا نمی‌شود");
    var m5 = !(has(I.capital) && plan && plan.valid);
    var h5 = [], w5 = [];
    if (!m5) {
      if (qMax !== null && qMax < 1) h5.push("با این سرمایه، حد ضرر و آستانه‌ها حتی خرید یک سهم هم مجاز نیست؛ حد ضرر نزدیک‌تر یا سرمایه بیشتر لازم است");
      if (I.qty !== null && I.qty < 1) h5.push("تعداد باید حداقل ۱ باشد");
      if (I.qty !== null && qRisk !== null && I.qty > qRisk) h5.push("تعداد (" + f0(I.qty) + ") بیشتر از حداکثر بر اساس ریسک (" + f0(qRisk) + ") است؛ در حد ضرر بیش از " + pc(st.riskpct, 1) + " سرمایه از دست می‌دهی");
      if (I.qty !== null && qPos !== null && I.qty > qPos) h5.push("ارزش پوزیشن بیش از " + pc(st.maxpos, 0) + " سرمایه می‌شود (حداکثر " + f0(qPos) + " سهم)");
      if (I.qty !== null && qVol !== null && I.qty > qVol) h5.push("تعداد بیش از " + pc(st.maxpart, 1) + " حجم روزانه است؛ خروج سخت می‌شود (حداکثر " + f0(qVol) + " سهم)");
      if (gapLoss !== null && budget !== null && gapLoss > 2 * budget) w5.push("اگر سهم ۳ روز پشت‌سرهم در صف فروش بماند حدود " + f0(gapLoss) + " ریال از دست می‌دهی و حد ضرر اجرا نمی‌شود");
      if (exitDays !== null && exitDays > 1) w5.push("خروج با ۱۰٪ حجم روزانه بیش از یک روز طول می‌کشد");
    }
    step(5, m5, h5, w5);

    // ---------- مرحله ۶: برنامه خروج
    var be1 = plan && plan.valid ? E + (E - plan.stop) : null;
    row(6, "stop6", "حد ضرر (ریال)", plan ? plan.stop : null, "money");
    row(6, "t1", "هدف اول: حدود نیمی از پوزیشن را بفروش (ریال)", plan ? plan.target1 : null, "money");
    row(6, "t2", "هدف دوم (ریال)", plan ? plan.target2 : null, "money");
    row(6, "be1", "وقتی قیمت به این رسید، حد ضرر را به قیمت ورود بیاور (ریال)", be1, "money", "یعنی به اندازه یک برابر ریسک سود کرده‌ای");
    row(6, "tstop", "اگر تا این تعداد روز معاملاتی حرکت نکرد، خارج شو", st.tstop, "int");
    var m6 = !(Y("q_plan") && Y("q_lock") && Y("q_time"));
    var h6 = [], w6 = [];
    if (!m6) {
      if (Y("q_plan") === "خیر") h6.push("حد ضرر، هدف و زمان خروج را ننوشته‌ای؛ بدون برنامه خروج نخر");
      if (Y("q_lock") === "خیر") w6.push("خطر قفل شدن در صف فروش و اجرا نشدن حد ضرر را جدی نگرفته‌ای");
      if (Y("q_time") === "خیر") w6.push("خروج زمانی نداری؛ سرمایه ممکن است ماه‌ها در سهم بی‌حرکت بماند");
    }
    step(6, m6, h6, w6);

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
    return { rows: rows, R: R, steps: steps, final: final, nHard: nHard, nMissing: nMissing, nWarn: nWarn, ev: ev, score: T ? T.score : null, plan: plan, settings: st };
  }

  // ================= پیشنهاد: سقف قیمت ورود، منطقه ورود، تناسب با هر حالت =================
  function quote(mode, inp, userSt, an) {
    var st = effective(userSt);
    var S = num(inp.S), fb = st.fee_buy, fs = st.fee_sell;
    var out = { ok: false, missing: [], parts: [], levels: [], zone: null, limit: null, ref: S, gap: null, note: [], fit: [] };
    if (S === null) out.missing.push("آخرین معامله سهم");
    var T = tech(an, S, st);
    if (!T) out.missing.push("سابقه قیمت سهم (دکمه «به‌روزرسانی از سایت»)");
    if (out.missing.length) return out;
    var plan = makePlan(mode, inp, st, T, S);
    out.plan = plan; out.T = T;
    var atr = T.atr;
    if (!plan || !plan.valid) { out.missing.push("حد ضرر یا هدف قابل محاسبه نیست"); return out; }
    var stop = plan.stop, target = plan.target, p = num(inp.p);
    // سقف قیمت ورود برای رعایت شرط‌ها (حد ضرر و هدف ثابت)
    function maxEntryForRR(rr) { return (1 - fs) * (target + rr * stop) / ((1 + fb) * (1 + rr)); }
    var cands = [], e1 = maxEntryForRR(st.rrmin);
    out.parts.push({ label: "برای نسبت سود به ریسک حداقل " + st.rrmin + " برابر (حد ضرر " + f0(stop) + "، هدف مؤثر " + f0(target) + ")", v: e1 }); cands.push(e1);
    if (p !== null && p - st.margin > 0.02) {
      var rrNeed = 1 / (p - st.margin) - 1;
      var e2 = maxEntryForRR(rrNeed);
      out.parts.push({ label: "برای اینکه احتمال تو (" + pc(p, 0) + ") از سر به سر + حاشیه امن بیشتر باشد", v: e2 }); cands.push(e2);
    } else if (p === null) out.note.push("احتمال خودت را (مرحله «سود و زیان») وارد کن تا شرط احتمال هم در سقف قیمت لحاظ شود");
    var e3 = stop / (1 - st.maxstop);
    out.parts.push({ label: "برای اینکه حد ضرر بیش از " + pc(st.maxstop, 0) + " از ورود فاصله نداشته باشد", v: e3 }); cands.push(e3);
    var lim = Math.min.apply(null, cands);
    out.parts.forEach(function (x) { x.bind = Math.abs(x.v - lim) < 1e-6; });
    out.limit = Math.floor(lim);
    out.ok = true;
    if (out.limit > 0) out.gap = 1 - S / out.limit; // مثبت = قیمت فعلی زیر سقف
    // منطقه ورود بر اساس حالت
    var z = null;
    if (mode === "trend") z = [T.sma20 - 0.25 * atr, T.sma20 + 0.5 * atr];
    else if (mode === "pull") { var lo = Math.max(plan.support !== null ? plan.support : 0, T.sma50 !== null ? T.sma50 : 0); z = [lo, T.sma20 + 0.25 * atr]; }
    else z = [plan.level, plan.level + 0.5 * atr];
    if (z && z[0] > z[1]) z = [z[1], z[0]];
    out.zone = z;
    out.zoneTxt = mode === "trend" ? "نزدیک میانگین ۲۰ روزه (خرید روی اصلاح کوتاه)" : mode === "pull" ? "بین حمایت/میانگین ۵۰ روزه و میانگین ۲۰ روزه" : "بالای سطح شکست (" + plan.levelName + ") تا نیم ATR بالاتر";
    function lvl(label, E) {
      if (!(E > 0)) return;
      var r = rrOf(E, stop, target, st);
      var cap = num(inp.capital);
      var rps = E * (1 + fb) - stop * (1 - fs);
      var qty = (cap !== null && rps > 0) ? Math.min(Math.floor(cap * st.riskpct / rps), Math.floor(cap * st.maxpos / (E * (1 + fb)))) : null;
      out.levels.push({ label: label, price: E, rr: r ? r.rr : null, stopPct: (E - stop) / E, qty: qty, good: E <= out.limit });
    }
    lvl("قیمت فعلی", S);
    if (z) lvl("وسط منطقه ورود", (z[0] + z[1]) / 2);
    lvl("سقف پیشنهادی", out.limit);
    out.targets = { stop: stop, t1: plan.target1, t2: plan.target2, eff: target, stopSrc: plan.stopSrc, targetSrc: plan.targetSrc };
    // تناسب سهم با هر سه حالت
    ["trend", "pull", "break"].forEach(function (m) {
      var r = evaluate(m, inp, userSt, an), s3 = r.steps[3];
      out.fit.push({ mode: m, sym: s3.status, first: s3.hard[0] || s3.warn[0] || "", score: r.score });
    });
    return out;
  }


  // ================= تحلیل نمودار: سری اندیکاتورها، فیبوناچی، احتمال جهت =================
  function ncdf(x) {
    var t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2);
    var p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }
  function smaSeries(a, n) {
    var out = new Array(a.length).fill(null), sum = 0;
    for (var i = 0; i < a.length; i++) { sum += a[i]; if (i >= n) sum -= a[i - n]; if (i >= n - 1) out[i] = sum / n; }
    return out;
  }
  function rsiSeries(c, n) {
    var out = new Array(c.length).fill(null);
    if (c.length < n + 1) return out;
    var g = 0, l = 0, i, d;
    for (i = 1; i <= n; i++) { d = c[i] - c[i - 1]; if (d >= 0) g += d; else l -= d; }
    g /= n; l /= n; out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    for (i = n + 1; i < c.length; i++) { d = c[i] - c[i - 1]; g = (g * (n - 1) + (d > 0 ? d : 0)) / n; l = (l * (n - 1) + (d < 0 ? -d : 0)) / n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
    return out;
  }
  function macdSeries(c) {
    var e12 = emaSeries(c, 12), e26 = emaSeries(c, 26), L = c.length;
    var line = new Array(L).fill(null), sig = new Array(L).fill(null), hist = new Array(L).fill(null), idx = [], vals = [], i;
    for (i = 0; i < L; i++) if (e12[i] !== null && e26[i] !== null) { line[i] = e12[i] - e26[i]; idx.push(i); vals.push(line[i]); }
    var sg = emaSeries(vals, 9);
    for (i = 0; i < idx.length; i++) if (sg[i] !== null) { sig[idx[i]] = sg[i]; hist[idx[i]] = line[idx[i]] - sg[i]; }
    return { line: line, sig: sig, hist: hist };
  }
  function stochSeries(bars, k) {
    var L = bars.length, raw = new Array(L).fill(null), i, j;
    for (i = k - 1; i < L; i++) {
      var hi = -Infinity, lo = Infinity;
      for (j = i - k + 1; j <= i; j++) { if (bars[j].h > hi) hi = bars[j].h; if (bars[j].l < lo) lo = bars[j].l; }
      raw[i] = hi > lo ? (bars[i].c - lo) / (hi - lo) * 100 : 50;
    }
    var K = new Array(L).fill(null), D = new Array(L).fill(null);
    for (i = k + 1; i < L; i++) K[i] = (raw[i] + raw[i - 1] + raw[i - 2]) / 3;
    for (i = k + 3; i < L; i++) D[i] = (K[i] + K[i - 1] + K[i - 2]) / 3;
    return { k: K, d: D };
  }
  function adxSeries(bars, n) {
    var L = bars.length, pdi = new Array(L).fill(null), mdi = new Array(L).fill(null), adx = new Array(L).fill(null);
    if (L < 2 * n + 2) return { pdi: pdi, mdi: mdi, adx: adx };
    var tr = [], pdm = [], mdm = [], i, j;
    for (i = 1; i < L; i++) {
      var up = bars[i].h - bars[i - 1].h, dn = bars[i - 1].l - bars[i].l;
      pdm.push(up > dn && up > 0 ? up : 0); mdm.push(dn > up && dn > 0 ? dn : 0);
      tr.push(Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c)));
    }
    var a = 0, p = 0, m = 0, dx = [];
    for (j = 0; j < n; j++) { a += tr[j]; p += pdm[j]; m += mdm[j]; }
    for (j = n - 1; j < tr.length; j++) {
      if (j > n - 1) { a = a - a / n + tr[j]; p = p - p / n + pdm[j]; m = m - m / n + mdm[j]; }
      var pd = a > 0 ? 100 * p / a : 0, md = a > 0 ? 100 * m / a : 0;
      pdi[j + 1] = pd; mdi[j + 1] = md;
      dx.push([j + 1, (pd + md) > 0 ? 100 * Math.abs(pd - md) / (pd + md) : 0]);
    }
    if (dx.length >= n) {
      var av = 0; for (j = 0; j < n; j++) av += dx[j][1]; av /= n; adx[dx[n - 1][0]] = av;
      for (j = n; j < dx.length; j++) { av = (av * (n - 1) + dx[j][1]) / n; adx[dx[j][0]] = av; }
    }
    return { pdi: pdi, mdi: mdi, adx: adx };
  }
  function bbSeries(c, n) {
    var L = c.length, mid = smaSeries(c, n), up = new Array(L).fill(null), lo = new Array(L).fill(null), pos = new Array(L).fill(null);
    for (var i = n - 1; i < L; i++) {
      var sd = 0; for (var j = i - n + 1; j <= i; j++) sd += (c[j] - mid[i]) * (c[j] - mid[i]);
      sd = Math.sqrt(sd / n); up[i] = mid[i] + 2 * sd; lo[i] = mid[i] - 2 * sd;
      pos[i] = sd > 0 ? (c[i] - lo[i]) / (4 * sd) : 0.5;
    }
    return { mid: mid, up: up, lo: lo, pos: pos };
  }
  // زیگزاگ برای پیدا کردن آخرین سوینگ (پایه فیبوناچی)
  function zigzag(bars, th) {
    var piv = [], dir = 0, eH = { i: 0, p: bars[0].h }, eL = { i: 0, p: bars[0].l };
    for (var i = 1; i < bars.length; i++) {
      var h = bars[i].h, l = bars[i].l;
      if (h > eH.p) eH = { i: i, p: h };
      if (l < eL.p) eL = { i: i, p: l };
      if (dir === 0) {
        if (eH.p >= eL.p * (1 + th) && eH.i > eL.i) { piv.push({ i: eL.i, p: eL.p, t: "L" }); dir = 1; }
        else if (eL.p <= eH.p * (1 - th) && eL.i > eH.i) { piv.push({ i: eH.i, p: eH.p, t: "H" }); dir = -1; }
      } else if (dir === 1) {
        if (l <= eH.p * (1 - th)) { piv.push({ i: eH.i, p: eH.p, t: "H" }); dir = -1; eL = { i: i, p: l }; }
      } else if (h >= eL.p * (1 + th)) { piv.push({ i: eL.i, p: eL.p, t: "L" }); dir = 1; eH = { i: i, p: h }; }
    }
    var prov = dir === 1 ? { i: eH.i, p: eH.p, t: "H" } : dir === -1 ? { i: eL.i, p: eL.p, t: "L" } : null;
    var all = piv.slice(); if (prov) all.push(prov);
    if (all.length < 2) return { pivots: all, leg: null };
    var a = all[all.length - 2], b = all[all.length - 1];
    return { pivots: all, leg: { si: a.i, sp: a.p, ei: b.i, ep: b.p, up: b.p > a.p, prov: !!prov } };
  }
  function wilson(p, n) {
    var z = 1.96, den = 1 + z * z / n, cen = (p + z * z / (2 * n)) / den;
    var half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den;
    return [Math.max(0, cen - half), Math.min(1, cen + half)];
  }
  // آمار شرطی: در گذشته، وقتی این سیگنال در همین حالت بود، قیمت h روز بعد بالاتر بود؟
  function condStats(states, c, h) {
    var cur = states[states.length - 1];
    if (cur === null || cur === undefined) return null;
    var n = 0, w = 0, sumr = 0, nb = 0, wb = 0;
    for (var t = 0; t < c.length - h; t++) {
      if (states[t] === null || states[t] === undefined) continue;
      var up = c[t + h] > c[t]; nb++; if (up) wb++;
      if (states[t] === cur) { n++; if (up) w++; sumr += c[t + h] / c[t] - 1; }
    }
    var out = { state: cur, n: n, base: nb ? wb / nb : null };
    if (n >= 1) { out.wins = w; out.p = w / n; out.pS = (w + 10) / (n + 20); out.avgRet = sumr / n; out.ci = wilson(w / n, Math.max(1, n / h)); out.neff = Math.max(1, n / h); }
    return out;
  }
  function zone(v, cuts, labels) { if (v === null || v === undefined) return null; for (var i = 0; i < cuts.length; i++) if (v < cuts[i]) return labels[i]; return labels[cuts.length]; }

  var FIB_R = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  var FIB_E = [1.272, 1.618];

  function chartData(an, S, h, userSt) {
    var st = effective(userSt), bars = an && an.bars;
    if (!bars || bars.length < 60) return null;
    h = h || 10;
    var n = bars.length, last = n - 1, c = bars.map(function (b) { return b.c; });
    var px = S > 0 ? S : c[last];
    var T = tech(an, S, st);
    var D = { n: n, px: px, h: h, T: T };
    var sma20 = smaSeries(c, 20), sma50 = smaSeries(c, 50), sma200 = smaSeries(c, 200);
    var bb = bbSeries(c, 20), rsi = rsiSeries(c, 14), mc = macdSeries(c), sto = stochSeries(bars, 14), adx = adxSeries(bars, 14);
    D.series = { sma20: sma20, sma50: sma50, sma200: sma200, bbUp: bb.up, bbLo: bb.lo, bbMid: bb.mid, rsi: rsi, macdLine: mc.line, macdSig: mc.sig, macdHist: mc.hist, stK: sto.k, stD: sto.d, pdi: adx.pdi, mdi: adx.mdi, adx: adx.adx };
    // نوسان روزانه
    var rets = []; for (var i = Math.max(1, n - 60); i < n; i++) rets.push(Math.log(c[i] / c[i - 1]));
    var mu = mean(rets), sd = Math.sqrt(mean(rets.map(function (r) { return (r - mu) * (r - mu); })));
    D.sigma = sd;
    var sh = sd * Math.sqrt(h);
    D.range = { low68: px * Math.exp(-sh), high68: px * Math.exp(sh), low95: px * Math.exp(-1.96 * sh), high95: px * Math.exp(1.96 * sh) };
    function pTouch(b) { if (!(b > 0) || !(sh > 0)) return null; var a = Math.abs(Math.log(b / px)); return Math.min(1, 2 * (1 - ncdf(a / sh))); }
    D.pTouch = pTouch;
    // فیبوناچی
    var th = Math.max(0.07, 3 * (T && T.atrp ? T.atrp : 0.02));
    var zz = zigzag(bars, th);
    D.zz = zz;
    if (zz.leg) {
      var lg = zz.leg, diff = lg.ep - lg.sp, lv = [];
      FIB_R.forEach(function (r) { var p = lg.ep - diff * r; lv.push({ kind: "r", r: r, price: p, pTouch: pTouch(p) }); });
      FIB_E.forEach(function (e) { var p = lg.sp + diff * e; lv.push({ kind: "e", r: e, price: p, pTouch: pTouch(p) }); });
      var lo = Math.min(lg.sp, lg.ep), hi = Math.max(lg.sp, lg.ep);
      D.fib = { leg: lg, levels: lv, retrPos: hi > lo ? (lg.up ? (lg.ep - px) / (lg.ep - lg.sp) : (px - lg.ep) / (lg.sp - lg.ep)) : null };
      D.fib.golden = D.fib.retrPos !== null && D.fib.retrPos >= 0.5 && D.fib.retrPos <= 0.618;
    }
    // حمایت و مقاومت
    if (T) {
      D.sr = {
        sup: T.sw.lows.filter(function (x) { return x < px * 0.995; }).sort(function (a, b) { return b - a; }).slice(0, 3),
        res: T.sw.highs.filter(function (x) { return x > px * 1.005; }).sort(function (a, b) { return a - b; }).slice(0, 3),
      };
      D.sr.supP = D.sr.sup.map(function (x) { return pTouch(x); });
      D.sr.resP = D.sr.res.map(function (x) { return pTouch(x); });
    }
    // سیگنال‌ها و احتمال شرطی تاریخی
    var rng60 = new Array(n).fill(null), udv = new Array(n).fill(null), t;
    for (t = 59; t < n; t++) {
      var H = -Infinity, Lw = Infinity;
      for (var j = t - 59; j <= t; j++) { if (bars[j].h > H) H = bars[j].h; if (bars[j].l < Lw) Lw = bars[j].l; }
      rng60[t] = H > Lw ? (H - c[t]) / (H - Lw) : null;       // کسر اصلاح از سقف ۶۰ روزه
    }
    for (t = 20; t < n; t++) {
      var u = 0, d = 0;
      for (var k = t - 19; k <= t; k++) { if (c[k] >= c[k - 1]) u += bars[k].v; else d += bars[k].v; }
      udv[t] = d > 0 ? u / d : null;
    }
    function arr(fn) { var o = new Array(n).fill(null); for (var i2 = 0; i2 < n; i2++) o[i2] = fn(i2); return o; }
    var defs = [
      { id: "trend", name: "روند (میانگین ۲۰ و ۵۰)", val: function () { return sma50[last] !== null ? (px > sma50[last] ? "بالای میانگین ۵۰" : "زیر میانگین ۵۰") : "—"; },
        st: arr(function (i) { return sma50[i] === null ? null : (c[i] > sma50[i] && sma20[i] > sma50[i]) ? "صعودی" : (c[i] < sma50[i] && sma20[i] < sma50[i]) ? "نزولی" : "مختلط"; }) },
      { id: "rsi", name: "RSI (۱۴)", val: function () { return rsi[last] === null ? "—" : rsi[last].toFixed(0); },
        st: arr(function (i) { return zone(rsi[i], [30, 45, 55, 70], ["زیر ۳۰", "۳۰ تا ۴۵", "۴۵ تا ۵۵", "۵۵ تا ۷۰", "بالای ۷۰"]); }) },
      { id: "macd", name: "MACD", val: function () { return mc.hist[last] === null ? "—" : (mc.hist[last] > 0 ? "مثبت" : "منفی") + (mc.hist[last - 1] !== null && mc.hist[last] > mc.hist[last - 1] ? " و رو به بالا" : " و رو به پایین"); },
        st: arr(function (i) { if (mc.hist[i] === null || mc.hist[i - 1] === null || i < 1) return null; return (mc.hist[i] > 0 ? "مثبت" : "منفی") + (mc.hist[i] > mc.hist[i - 1] ? " ↑" : " ↓"); }) },
      { id: "stoch", name: "استوکاستیک (۱۴)", val: function () { return sto.k[last] === null ? "—" : sto.k[last].toFixed(0); },
        st: arr(function (i) { return zone(sto.k[i], [20, 80], ["اشباع فروش (زیر ۲۰)", "میانه", "اشباع خرید (بالای ۸۰)"]); }) },
      { id: "bb", name: "باند بولینگر (موقعیت قیمت)", val: function () { return bb.pos[last] === null ? "—" : (bb.pos[last] * 100).toFixed(0) + "٪ باند"; },
        st: arr(function (i) { return zone(bb.pos[i], [0.1, 0.4, 0.6, 0.9], ["نزدیک باند پایین", "نیمه پایینی", "میانه", "نیمه بالایی", "نزدیک باند بالا"]); }) },
      { id: "adx", name: "قدرت روند (ADX)", val: function () { return adx.adx[last] === null ? "—" : adx.adx[last].toFixed(0) + (adx.pdi[last] > adx.mdi[last] ? " (جهت صعودی)" : " (جهت نزولی)"); },
        st: arr(function (i) { if (adx.adx[i] === null) return null; return adx.adx[i] < 20 ? "روند ضعیف / نوسانی" : (adx.pdi[i] > adx.mdi[i] ? "روند صعودی قوی" : "روند نزولی قوی"); }) },
      { id: "fibz", name: "موقعیت در دامنه ۶۰ روزه (ناحیه فیبوناچی)", val: function () { return rng60[last] === null ? "—" : (rng60[last] * 100).toFixed(0) + "٪ اصلاح از سقف"; },
        st: arr(function (i) { return zone(rng60[i], [0.236, 0.382, 0.5, 0.618, 0.786], ["اصلاح کمتر از ۲۳٪", "۲۳ تا ۳۸٪", "۳۸ تا ۵۰٪", "۵۰ تا ۶۲٪ (ناحیه طلایی)", "۶۲ تا ۷۹٪", "بیش از ۷۹٪"]); }) },
      { id: "flow", name: "جریان حجم (روز صعودی به نزولی)", val: function () { return udv[last] === null ? "—" : udv[last].toFixed(2); },
        st: arr(function (i) { return udv[i] === null ? null : udv[i] > 1.2 ? "حجم بیشتر در روزهای صعودی" : udv[i] < 0.83 ? "حجم بیشتر در روزهای نزولی" : "متعادل"; }) },
    ];
    D.signals = defs.map(function (dd) { var cs = condStats(dd.st, c, h); return { id: dd.id, name: dd.name, val: dd.val(), stat: cs }; });
    // واگرایی RSI در دو کف/سقف اخیر
    D.divergence = null;
    var swL = [], swH = [];
    for (i = 3; i < n - 3; i++) {
      if (rsi[i] === null) continue;
      var isL = true, isH = true;
      for (j = 1; j <= 3; j++) { if (!(bars[i].l < bars[i - j].l && bars[i].l <= bars[i + j].l)) isL = false; if (!(bars[i].h > bars[i - j].h && bars[i].h >= bars[i + j].h)) isH = false; }
      if (isL) swL.push(i); if (isH) swH.push(i);
    }
    if (swL.length >= 2) { var a1 = swL[swL.length - 2], b1 = swL[swL.length - 1]; if (n - b1 <= 25 && bars[b1].l < bars[a1].l && rsi[b1] > rsi[a1] + 2) D.divergence = "واگرایی مثبت (صعودی): قیمت کف پایین‌تر زده ولی RSI کف بالاتر"; }
    if (!D.divergence && swH.length >= 2) { var a2 = swH[swH.length - 2], b2 = swH[swH.length - 1]; if (n - b2 <= 25 && bars[b2].h > bars[a2].h && rsi[b2] < rsi[a2] - 2) D.divergence = "واگرایی منفی (نزولی): قیمت سقف بالاتر زده ولی RSI سقف پایین‌تر"; }
    // ترکیب: میانگین احتمال‌های شرطی (با انقباض به ۵۰٪) روی سیگنال‌های با نمونه کافی
    var used = D.signals.filter(function (x) { return x.stat && x.stat.n >= 8; });
    var base = D.signals.filter(function (x) { return x.stat && x.stat.base !== null; });
    D.prob = { h: h, used: used.length, base: base.length ? mean(base.map(function (x) { return x.stat.base; })) : null };
    if (used.length >= 3) {
      var p = mean(used.map(function (x) { return x.stat.pS; }));
      var ne = used.map(function (x) { return x.stat.neff; }).sort(function (a, b) { return a - b; })[Math.floor(used.length / 2)];
      var ci = wilson(p, Math.max(1, ne));
      D.prob.p = p; D.prob.lo = ci[0]; D.prob.hi = ci[1]; D.prob.neff = ne;
      D.prob.spread = Math.sqrt(mean(used.map(function (x) { return (x.stat.pS - p) * (x.stat.pS - p); })));
      D.prob.verdict = (p >= 0.58 && ci[0] > 0.5) ? "متمایل به صعود (از نظر آماری معنادار)" : (p >= 0.54) ? "کمی متمایل به صعود (معنادار نیست)"
        : (p <= 0.42 && ci[1] < 0.5) ? "متمایل به نزول (از نظر آماری معنادار)" : (p <= 0.46) ? "کمی متمایل به نزول (معنادار نیست)" : "جهت نامشخص؛ برتری آماری دیده نمی‌شود";
    } else D.prob.verdict = "نمونه‌ی تاریخی برای نتیجه‌گیری کافی نیست";
    return D;
  }

  // ================= تحلیل صورت‌های مالی =================
  // f = { unit: ضریب تبدیل به ریال، infl: تورم سالانه، y0: {...}, y1: {...} }
  var FIN_KEYS = [
    ["rev", "درآمد عملیاتی (فروش)"], ["cogs", "بهای تمام‌شده درآمدها"], ["opinc", "سود عملیاتی"], ["int", "هزینه مالی"],
    ["ni", "سود خالص"], ["ta", "جمع دارایی‌ها"], ["ca", "دارایی‌های جاری"], ["cl", "بدهی‌های جاری"],
    ["tl", "جمع بدهی‌ها"], ["eq", "حقوق صاحبان سهام"], ["re", "سود انباشته"], ["cfo", "جریان نقد عملیاتی"],
    ["rec", "حساب‌های دریافتنی"], ["cap", "سرمایه ثبت‌شده"], ["dps", "سود نقدی هر سهم (ریال)"],
  ];
  function finAnalyze(f, price, peSec, site) {
    f = f || {};
    var unit = num(f.unit) || 1e6, infl = num(f.infl); if (infl === null) infl = 0.35;
    var a = f.y0 || {}, b = f.y1 || {}, A = {}, B = {};
    FIN_KEYS.forEach(function (k) { A[k[0]] = num(a[k[0]]); B[k[0]] = num(b[k[0]]); });
    // هزینه‌ها در صورت‌های مالی داخل پرانتز (منفی) می‌آیند؛ همیشه مثبت حساب می‌شوند
    ['cogs', 'int'].forEach(function (k) { if (A[k] !== null) A[k] = Math.abs(A[k]); if (B[k] !== null) B[k] = Math.abs(B[k]); });
    var out = { ratios: [], piotroski: [], notes: { good: [], bad: [] }, score: null, verdict: "", z: null, dupont: null, val: {} };
    function div(x, y) { return (has(x, y) && y !== 0) ? x / y : null; }
    function R(key, label, v0, v1, fmt, better) { out.ratios.push({ key: key, label: label, v0: v0, v1: v1, fmt: fmt, better: better }); return v0; }
    var gm0 = has(A.rev, A.cogs) ? div(A.rev - A.cogs, A.rev) : null, gm1 = has(B.rev, B.cogs) ? div(B.rev - B.cogs, B.rev) : null;
    var om0 = div(A.opinc, A.rev), om1 = div(B.opinc, B.rev), nm0 = div(A.ni, A.rev), nm1 = div(B.ni, B.rev);
    var roa0 = div(A.ni, A.ta), roa1 = div(B.ni, B.ta), roe0 = div(A.ni, A.eq), roe1 = div(B.ni, B.eq);
    var at0 = div(A.rev, A.ta), at1 = div(B.rev, B.ta), em0 = div(A.ta, A.eq);
    var cr0 = div(A.ca, A.cl), cr1 = div(B.ca, B.cl), dr0 = div(A.tl, A.ta), dr1 = div(B.tl, B.ta), de0 = div(A.tl, A.eq);
    var ic0 = has(A.opinc, A.int) && A.int > 0 ? A.opinc / A.int : null;
    var q0 = div(A.cfo, A.ni), q1 = div(B.cfo, B.ni);
    var rg = has(A.rev, B.rev) && B.rev > 0 ? A.rev / B.rev - 1 : null, ng = has(A.ni, B.ni) && B.ni > 0 ? A.ni / B.ni - 1 : null;
    var rrg = rg !== null ? (1 + rg) / (1 + infl) - 1 : null;
    var cm0 = div(A.cfo, A.rev);
    var recg = has(A.rec, B.rec) && B.rec > 0 ? A.rec / B.rec - 1 : null;
    R("gm", "حاشیه سود ناخالص", gm0, gm1, "pct1", 1); R("om", "حاشیه سود عملیاتی", om0, om1, "pct1", 1); R("nm", "حاشیه سود خالص", nm0, nm1, "pct1", 1);
    R("roa", "بازده دارایی‌ها (ROA)", roa0, roa1, "pct1", 1); R("roe", "بازده حقوق صاحبان سهام (ROE)", roe0, roe1, "pct1", 1);
    R("at", "گردش دارایی‌ها (برابر)", at0, at1, "ratio2", 1);
    R("rg", "رشد اسمی درآمد", rg, null, "pct1", 1); R("rrg", "رشد واقعی درآمد (پس از کسر تورم)", rrg, null, "pct1", 1); R("ng", "رشد سود خالص", ng, null, "pct1", 1);
    R("cr", "نسبت جاری", cr0, cr1, "ratio2", 1); R("dr", "نسبت بدهی به دارایی", dr0, dr1, "pct0", -1); R("de", "بدهی به حقوق صاحبان سهام (برابر)", de0, null, "ratio2", -1);
    R("ic", "پوشش هزینه مالی (برابر)", ic0, null, "ratio1", 1);
    R("q", "کیفیت سود (جریان نقد عملیاتی ÷ سود خالص)", q0, q1, "ratio2", 1); R("cm", "جریان نقد عملیاتی به درآمد", cm0, null, "pct1", 1);
    out.dupont = (has(nm0, at0, em0)) ? { nm: nm0, at: at0, em: em0, roe: nm0 * at0 * em0 } : null;
    // ارزش‌گذاری
    var shares = has(A.cap) ? A.cap * unit / 1000 : null;     // ارزش اسمی ۱۰۰۰ ریال
    var v = out.val;
    if (has(shares, price) && price > 0) {
      v.mcap = shares * price; v.eps = has(A.ni) ? A.ni * unit / shares : null;
      v.pe = (v.eps && v.eps !== 0) ? price / v.eps : null;
      v.pb = has(A.eq) && A.eq > 0 ? v.mcap / (A.eq * unit) : null;
      v.ps = has(A.rev) && A.rev > 0 ? v.mcap / (A.rev * unit) : null;
      v.ey = v.pe ? 1 / v.pe : null;
      v.dy = has(A.dps) ? A.dps / price : null; v.payout = (has(A.dps) && v.eps > 0) ? A.dps / v.eps : null;
    }
    // EPS و P/E را خود سایت می‌دهد (درست‌اند)؛ محاسبه‌ی خودمان را با آن‌ها جایگزین می‌کنیم
    site = site || {};
    var okN = function (x) { return x !== null && x !== undefined && isFinite(x); };
    v.eps = okN(site.eps) ? site.eps : null;
    v.pe = okN(site.pe) && site.pe !== 0 ? site.pe : null;
    v.ey = v.pe ? 1 / v.pe : null;
    v.payout = null;
    if (has(A.dps) && v.eps > 0) v.payout = A.dps / v.eps;
    if (has(A.dps) && has(price) && price > 0) v.dy = A.dps / price;
    // فیوتروسکی (۹ معیار؛ هرچه محاسبه‌پذیر باشد)
    var P = out.piotroski;
    function pio(label, cond) { P.push({ label: label, ok: cond }); }
    pio("سود خالص مثبت", has(A.ni) ? A.ni > 0 : null);
    pio("جریان نقد عملیاتی مثبت", has(A.cfo) ? A.cfo > 0 : null);
    pio("ROA نسبت به سال قبل بهتر شده", has(roa0, roa1) ? roa0 > roa1 : null);
    pio("جریان نقد عملیاتی بیشتر از سود خالص (کیفیت سود)", has(A.cfo, A.ni) ? A.cfo > A.ni : null);
    pio("نسبت بدهی به دارایی کمتر شده", has(dr0, dr1) ? dr0 < dr1 : null);
    pio("نسبت جاری بهتر شده", has(cr0, cr1) ? cr0 > cr1 : null);
    pio("سرمایه افزایش نیافته (بدون رقیق‌سازی)", has(A.cap, B.cap) ? A.cap <= B.cap * 1.001 : null);
    pio("حاشیه سود ناخالص بهتر شده", has(gm0, gm1) ? gm0 > gm1 : null);
    pio("گردش دارایی‌ها بهتر شده", has(at0, at1) ? at0 > at1 : null);
    var pk = P.filter(function (x) { return x.ok !== null; });
    out.fscore = pk.length ? { n: pk.filter(function (x) { return x.ok; }).length, of: pk.length } : null;
    // آلتمن Z″ برای بازارهای نوظهور
    if (has(A.ca, A.cl, A.ta, A.re, A.opinc, A.eq, A.tl) && A.ta > 0 && A.tl > 0) {
      var z = 3.25 + 6.56 * (A.ca - A.cl) / A.ta + 3.26 * A.re / A.ta + 6.72 * A.opinc / A.ta + 1.05 * A.eq / A.tl;
      out.z = { v: z, zone: z > 5.85 ? "ایمن" : z >= 4.35 ? "خاکستری" : "خطر ورشکستگی" };
    }
    // پیام‌ها
    function g(t) { out.notes.good.push(t); } function bd(t) { out.notes.bad.push(t); }
    if (has(A.ni)) { if (A.ni < 0) bd("شرکت در سال جاری زیان‌ده است"); }
    if (rrg !== null) { if (rrg > 0.1) g("درآمد در سال جاری بیشتر از تورم رشد کرده (رشد واقعی " + pc(rrg, 0) + ")"); else if (rrg < -0.1) bd("درآمد از تورم عقب مانده (رشد واقعی " + pc(rrg, 0) + ")؛ فروش واقعاً کوچک شده"); }
    if (ng !== null) { if (ng > infl) g("سود خالص " + pc(ng, 0) + " رشد کرده که از تورم بیشتر است"); else if (ng < 0) bd("سود خالص نسبت به سال قبل افت کرده (" + pc(ng, 0) + ")"); }
    if (has(gm0, gm1)) { if (gm0 - gm1 > 0.02) g("حاشیه سود ناخالص بهتر شده (" + pc(gm1, 1) + " ← " + pc(gm0, 1) + ")"); else if (gm1 - gm0 > 0.02) bd("حاشیه سود ناخالص افت کرده (" + pc(gm1, 1) + " ← " + pc(gm0, 1) + ")؛ فشار هزینه یا قیمت فروش"); }
    if (q0 !== null && has(A.ni) && A.ni > 0) { if (q0 < 0.5) bd("فقط " + pc(Math.max(q0, 0), 0) + " سود به نقد تبدیل شده؛ سود حسابداری است نه نقدی"); else if (q0 >= 1) g("سود به نقد تبدیل شده (جریان نقد عملیاتی " + q0.toFixed(1) + " برابر سود)"); }
    if (has(A.cfo) && A.cfo < 0) bd("جریان نقد عملیاتی منفی است");
    if (recg !== null && rg !== null && recg > rg + 0.2) bd("حساب‌های دریافتنی (" + pc(recg, 0) + ") بیشتر از فروش (" + pc(rg, 0) + ") رشد کرده؛ فروش اعتباری یا وصول‌نشده");
    if (dr0 !== null) { if (dr0 > 0.75) bd("بدهی " + pc(dr0, 0) + " دارایی‌هاست؛ اهرم بالا"); else if (dr0 < 0.45) g("اهرم پایین (بدهی " + pc(dr0, 0) + " دارایی‌ها)"); }
    if (cr0 !== null) { if (cr0 < 1) bd("نسبت جاری " + cr0.toFixed(2) + " (کمتر از ۱)؛ فشار نقدینگی کوتاه‌مدت"); else if (cr0 > 1.5) g("نقدینگی کوتاه‌مدت مناسب (نسبت جاری " + cr0.toFixed(2) + ")"); }
    if (ic0 !== null) { if (ic0 < 2) bd("سود عملیاتی فقط " + ic0.toFixed(1) + " برابر هزینه مالی است"); else if (ic0 > 5) g("هزینه مالی به‌راحتی پوشش داده می‌شود (" + ic0.toFixed(1) + " برابر)"); }
    if (roe0 !== null) { if (roe0 > 0.3) g("ROE بالا (" + pc(roe0, 0) + ")"); else if (roe0 < 0.1) bd("ROE پایین (" + pc(roe0, 0) + ") نسبت به تورم"); }
    if (out.z && out.z.zone === "خطر ورشکستگی") bd("مدل آلتمن Z″ در ناحیه خطر است (" + out.z.v.toFixed(1) + ")");
    if (out.z && out.z.zone === "ایمن") g("مدل آلتمن Z″ در ناحیه ایمن است (" + out.z.v.toFixed(1) + ")");
    if (v.pe) { if (v.pe < 0) bd("P/E منفی (زیان)"); else if (num(peSec) > 0 && v.pe > num(peSec) * 1.5) bd("P/E " + v.pe.toFixed(1) + " بیش از ۱٫۵ برابر صنعت (" + peSec + ")"); else if (num(peSec) > 0 && v.pe < num(peSec) * 0.7) g("P/E " + v.pe.toFixed(1) + " ارزان‌تر از صنعت (" + peSec + ")"); }
    if (v.pb && v.pb < 1) g("قیمت زیر ارزش دفتری است (P/B " + v.pb.toFixed(2) + ")؛ ارزش دفتری در شرایط تورمی معمولاً کم‌برآورد است"); else if (v.pb && v.pb > 4) bd("P/B " + v.pb.toFixed(1) + " بالاست");
    if (out.fscore && out.fscore.of >= 6) { if (out.fscore.n >= out.fscore.of * 0.75) g("امتیاز فیوتروسکی " + out.fscore.n + " از " + out.fscore.of + " (قوی)"); else if (out.fscore.n <= out.fscore.of * 0.4) bd("امتیاز فیوتروسکی فقط " + out.fscore.n + " از " + out.fscore.of); }
    // امتیاز ۰ تا ۱۰۰
    var sp = 0, sm = 0;
    function sc(cond, w) { if (cond === null || cond === undefined) return; sm += w; if (cond) sp += w; }
    sc(has(A.ni) ? A.ni > 0 : null, 12); sc(nm0 !== null ? nm0 > 0.08 : null, 6); sc(roe0 !== null ? roe0 > 0.2 : null, 8);
    sc(rrg !== null ? rrg > 0 : null, 8); sc(ng !== null ? ng > infl : null, 8);
    sc(has(gm0, gm1) ? gm0 >= gm1 - 0.01 : null, 5);
    sc(q0 !== null ? q0 >= 0.8 : null, 10); sc(has(A.cfo) ? A.cfo > 0 : null, 8);
    sc(dr0 !== null ? dr0 < 0.65 : null, 8); sc(cr0 !== null ? cr0 >= 1 : null, 6); sc(ic0 !== null ? ic0 >= 3 : null, 5);
    sc(out.z ? out.z.zone !== "خطر ورشکستگی" : null, 6);
    if (out.fscore) { sm += 10; sp += 10 * out.fscore.n / out.fscore.of; }
    out.score = sm > 0 ? Math.round(sp / sm * 100) : null;
    out.verdict = out.score === null ? "داده کافی نیست" : out.score >= 70 ? "بنیاد قوی" : out.score >= 50 ? "بنیاد متوسط" : "بنیاد ضعیف";
    return out;
  }

  var api = { chartData: chartData, finAnalyze: finAnalyze, FIN_KEYS: FIN_KEYS, evaluate: evaluate, quote: quote, tech: tech, pEmpFor: pEmpFor, DEFAULTS: DEFAULTS, SETTINGS_META: SETTINGS_META, RISK_KEYS: RISK_KEYS, effective: effective, MODE_FIT: MODE_FIT };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.StockChecklist = api;
})(typeof self !== "undefined" ? self : this);
