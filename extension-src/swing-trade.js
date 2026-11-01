/* موتور «نوسان‌گیری» برای یک سهم: مناسب بودن، قیمت خرید، قیمت فروش، حد ضرر، و آزمون همان قاعده روی سابقه‌ی خود سهم.
   ورودی: میله‌های روزانه‌ی تعدیل‌شده {d,o,h,l,c,v,val}. هیچ درخواست شبکه‌ای ندارد. */
(function (root) {
  "use strict";
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function mean(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }
  function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function sma(c, n, end) { if (end + 1 < n) return null; var s = 0; for (var i = end - n + 1; i <= end; i++) s += c[i]; return s / n; }
  function atrAt(b, n, end) {
    if (end < n) return null; var s = 0;
    for (var i = end - n + 1; i <= end; i++) s += Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c));
    return s / n;
  }
  function rsi(c, n) {
    if (c.length < n + 1) return null; var g = 0, l = 0, i;
    for (i = c.length - n; i < c.length; i++) { var d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
    if (g + l === 0) return 50; return 100 - 100 / (1 + g / (l || 1e-9));
  }
  function corr1(r) {   // خودهمبستگی با یک روز تأخیر؛ منفی = برگشت‌پذیر
    if (r.length < 30) return null; var a = r.slice(1), b = r.slice(0, -1), ma = mean(a), mb = mean(b), sa = 0, sb = 0, sab = 0;
    for (var i = 0; i < a.length; i++) { sa += (a[i] - ma) * (a[i] - ma); sb += (b[i] - mb) * (b[i] - mb); sab += (a[i] - ma) * (b[i] - mb); }
    return sa > 0 && sb > 0 ? sab / Math.sqrt(sa * sb) : null;
  }
  // قله و دره‌های پیاپی (زیگزاگ) روی قیمت پایانی با آستانه‌ی thr
  function zigzag(c, thr) {
    var piv = [], dir = 0, lo = { i: 0, p: c[0] }, hi = { i: 0, p: c[0] }, ext = null;
    for (var i = 1; i < c.length; i++) {
      var p = c[i];
      if (dir === 0) {
        if (p < lo.p) lo = { i: i, p: p }; if (p > hi.p) hi = { i: i, p: p };
        if (p >= lo.p * (1 + thr) && lo.i < i) { piv.push({ i: lo.i, p: lo.p, t: "L" }); dir = 1; ext = { i: i, p: p }; }
        else if (p <= hi.p * (1 - thr) && hi.i < i) { piv.push({ i: hi.i, p: hi.p, t: "H" }); dir = -1; ext = { i: i, p: p }; }
      } else if (dir === 1) {
        if (p > ext.p) ext = { i: i, p: p };
        else if (p <= ext.p * (1 - thr)) { piv.push({ i: ext.i, p: ext.p, t: "H" }); dir = -1; ext = { i: i, p: p }; }
      } else {
        if (p < ext.p) ext = { i: i, p: p };
        else if (p >= ext.p * (1 + thr)) { piv.push({ i: ext.i, p: ext.p, t: "L" }); dir = 1; ext = { i: i, p: p }; }
      }
    }
    return piv;
  }
  function rangeAt(b, t, n) { var lo = Infinity, hi = -Infinity; for (var i = t - n + 1; i <= t; i++) { if (b[i].l < lo) lo = b[i].l; if (b[i].h > hi) hi = b[i].h; } return { lo: lo, hi: hi }; }

  // طرح خرید/فروش مبتنی بر بازه‌ی ۲۰ روزه (همان قاعده‌ای که روی سابقه آزمایش می‌شود)
  var FR = { t1: 0.45, t2: 0.85, one: 0.6 };   // سهم هر هدف از فاصله‌ی ورود تا سقف بازه
  function planAt(b, t, k, fb, fs) {
    var rg = rangeAt(b, t, 20), atr = atrAt(b, 14, t), c = b[t].c; if (!(atr > 0) || !(rg.hi > rg.lo)) return null;
    var rt = fb + fs, L = rg.lo + k * (rg.hi - rg.lo);
    return { lo: rg.lo, hi: rg.hi, atr: atr, L: L, rt: rt, c: c, width: rg.hi / rg.lo - 1 };
  }
  function stopFor(fill, lo, atr) {
    var st = lo - 0.3 * atr;                               // زیر کف بازه
    st = Math.min(st, fill * 0.988);                       // حداقل ۱٫۲٪ فاصله
    st = Math.max(st, fill * (1 - Math.max(0.03, 2 * atr / fill)));   // سقف ریسک
    return st;
  }
  function backtest(b, k, fb, fs, H, from) {
    var trades = [], t = Math.max(from, 40), n = b.length;
    while (t < n - 2) {
      var p = planAt(b, t, k, fb, fs);
      if (!p || p.width < 0.04) { t++; continue; }
      var f = t + 1, bf = b[f];
      if (!(bf.v > 0) || bf.l > p.L) { t++; continue; }
      var fill = bf.o <= p.L ? bf.o : p.L;
      var tgt = fill + FR.one * (p.hi - fill);
      if (tgt < fill * (1 + p.rt + 0.012)) { t++; continue; }                // جای سود کافی نبود: سیگنال نیست
      var stop = stopFor(fill, p.lo, p.atr), exitP = null, why = "time", j, end = Math.min(n - 1, f + H);
      for (j = f + 1; j <= end; j++) {
        var x = b[j];
        if (x.o <= stop) { exitP = x.o; why = "stop"; break; }
        if (x.l <= stop) { exitP = stop; why = "stop"; break; }          // اگر هر دو در یک روز ممکن بود، محافظه‌کارانه ضرر
        if (x.o >= tgt) { exitP = x.o; why = "target"; break; }
        if (x.h >= tgt) { exitP = tgt; why = "target"; break; }
      }
      if (exitP === null) { if (f + H > n - 1) break; exitP = b[end].c; j = end; }   // هنوز باز یا پایان مهلت
      trades.push({ d: b[f].d, fill: fill, exit: exitP, why: why, days: j - f, net: exitP * (1 - fs) / (fill * (1 + fb)) - 1 });
      t = Math.max(j, t + 1);
    }
    var w = trades.filter(function (x) { return x.net > 0; }), l = trades.filter(function (x) { return x.net <= 0; });
    return {
      k: k, trades: trades, n: trades.length, win: trades.length ? w.length / trades.length : null,
      avgWin: mean(w.map(function (x) { return x.net; })), avgLoss: mean(l.map(function (x) { return x.net; })),
      exp: trades.length ? mean(trades.map(function (x) { return x.net; })) : null,
      days: median(trades.map(function (x) { return x.days; })),
      tg: trades.filter(function (x) { return x.why === "target"; }).length, sp: trades.filter(function (x) { return x.why === "stop"; }).length, to: trades.filter(function (x) { return x.why === "time"; }).length
    };
  }

  // رویدادهای کدال و وضعیت مالی: مجمع/تقسیم سود، افزایش سرمایه، افشای تازه، بنیاد شرکت
  // ev = { loaded, err, agm:{daysTo,kind,from,to,date}, letters:[{cls,title,ago}], dps, ni, eq, fin:{score,verdict,bad,good,z,fscore,pe} }
  function evalEvents(ev, S, planDays) {
    var R = { pts: 15, max: 15, lines: [], block: null, wait: null, days: null, agmInfo: null };
    if (!ev || !ev.loaded) {
      R.pts = 7; R.unknown = true;
      R.lines.push({ lv: "w", t: "اطلاعیه‌های کدال دریافت نشد" + (ev && ev.err ? " (" + ev.err + ")" : "") + "؛ مجمع، تقسیم سود و افزایش سرمایه در این تحلیل لحاظ نشده‌اند. تب «📢 کدال» را باز کن و «دریافت از کدال» را بزن." });
    } else {
      var a = ev.agm, cal = Math.ceil(planDays * 7 / 5) + 2;
      if (a) {
        var tdays = Math.max(0, Math.round(a.daysTo * 5 / 7)), dropTxt = "";
        if (ev.dps > 0 && S > 0 && ev.dps / S < 0.5) dropTxt = " سود نقدی سال قبل حدود " + (ev.dps / S * 100).toFixed(1) + "٪ قیمت است؛ در روز مجمع قیمت پایه به همین اندازه (اگر همان تقسیم شود) تعدیل می‌شود.";
        R.agmInfo = { daysTo: a.daysTo, kind: a.kind, date: a.date, tdays: tdays, drop: ev.dps > 0 && S > 0 ? ev.dps / S : null };
        if (a.kind === "announced" && a.daysTo >= -1 && a.daysTo <= cal) {
          if (tdays <= 3) { R.pts = 0; R.block = "مجمع اعلام‌شده (" + a.date + ") " + (a.daysTo >= 0 ? a.daysTo + " روز دیگر" : "همین الان") + " است؛ ورود تازه با مهلت چندروزه عملاً از مجمع عبور می‌کند."; R.lines.push({ lv: "bad", t: "مجمع اعلام‌شده " + a.date + " (" + (a.daysTo >= 0 ? a.daysTo + " روز دیگر" : "تازه") + ") داخل افق نوسان‌گیری است؛ از مجمع عبور نکن." + dropTxt }); }
          else { R.pts -= 6; R.days = Math.max(2, tdays - 1); R.lines.push({ lv: "w", t: "مجمع اعلام‌شده " + a.date + " (حدود " + tdays + " روز معاملاتی دیگر)؛ مهلت نگه‌داری تا " + R.days + " روز کوتاه شد تا قبل از مجمع خارج شوی." + dropTxt }); }
        } else if (a.kind === "estimated" && a.to >= 0 && a.from <= cal) {
          R.pts -= 6; R.lines.push({ lv: "w", t: "مجمع بعدی تخمینی است (" + a.date + "؛ بازه‌ی محتمل از " + Math.max(a.from, 0) + " تا " + a.to + " روز دیگر) و ممکن است با افق نوسان‌گیری هم‌پوشانی داشته باشد؛ منتظر آگهی دعوت در کدال باش." + dropTxt });
        } else R.lines.push({ lv: "ok", t: "مجمع بعدی (" + a.date + (a.kind === "estimated" ? "، تخمینی" : "") + ") خارج از افق نوسان‌گیری است." });
      } else R.lines.push({ lv: "w", t: "تاریخ مجمع بعدی از اطلاعیه‌های کدال مشخص نشد." });
      var L = ev.letters || [], pick = function (cls, maxAgo) { return L.filter(function (x) { return x.cls === cls && x.ago >= -1 && x.ago <= maxAgo; }).sort(function (p, q) { return p.ago - q.ago; }); };
      var cap = pick("cap", 60);
      if (cap.length) {
        var rights = cap.filter(function (x) { return /حق\s*تقدم|پذیره/.test(x.title); })[0];
        R.pts -= rights && rights.ago <= 30 ? 6 : 4;
        if (cap[0].ago <= 5) R.wait = R.wait || "اطلاعیه‌ی افزایش سرمایه (" + cap[0].ago + " روز پیش) تازه است؛ قیمت هنوز جا نیفتاده.";
        R.lines.push({ lv: "w", t: "افزایش سرمایه در جریان است: «" + cap[0].title.slice(0, 70) + "» (" + cap[0].ago + " روز پیش). " + (rights ? "حق تقدم/پذیره‌نویسی در راه است؛ روز حذف حق تقدم قیمت پایه تعدیل می‌شود و نوسان بالا می‌رود." : "تا تکلیف تاریخ‌ها مشخص نشده، ریسک خبری بالاتر است.") });
      } else R.lines.push({ lv: "ok", t: "در ۶۰ روز اخیر اطلاعیه‌ی افزایش سرمایه‌ای دیده نشد." });
      var imp = pick("imp", 3);
      if (imp.length) { R.pts -= 4; R.wait = R.wait || "افشای بااهمیت تازه (" + imp[0].ago + " روز پیش) منتشر شده؛ یکی دو روز صبر کن تا واکنش قیمت جا بیفتد."; R.lines.push({ lv: "w", t: "افشای بااهمیت در ۳ روز اخیر: «" + imp[0].title.slice(0, 80) + "» (" + imp[0].ago + " روز پیش)؛ قیمت ممکن است هنوز در حال واکنش باشد." }); }
      var fin = pick("fin", 4);
      if (fin.length) { R.pts -= 3; R.wait = R.wait || "صورت مالی تازه (" + fin[0].ago + " روز پیش) منتشر شده؛ واکنش قیمت هنوز تمام نشده."; R.lines.push({ lv: "w", t: "صورت مالی تازه (" + fin[0].ago + " روز پیش) منتشر شده؛ واکنش قیمت ممکن است ادامه داشته باشد." }); }
      var mon = pick("mon", 2);
      if (mon.length) R.lines.push({ lv: "w", t: "گزارش فعالیت ماهانه تازه منتشر شده (" + mon[0].ago + " روز پیش)؛ اگر خبرش در قیمت نیامده، حرکت جهت‌دار ممکن است." });
    }
    // بنیاد شرکت از تب مالی
    var f = ev && ev.fin, weak = [];
    if (ev && ev.ni !== undefined && ev.ni !== null && ev.ni < 0) weak.push("شرکت در آخرین سال مالی زیان‌ده بوده");
    if (ev && ev.eq !== undefined && ev.eq !== null && ev.eq < 0) weak.push("حقوق صاحبان سهام منفی است");
    var zz = f && f.z, zBad = zz && typeof zz === "object" ? zz.zone === "خطر ورشکستگی" : (typeof zz === "number" && zz < 4.35), zVal = zz && typeof zz === "object" ? zz.v : zz;
    if (zBad) weak.push("مدل آلتمن در ناحیه‌ی خطر ورشکستگی است" + (typeof zVal === "number" ? " (" + Number(zVal).toFixed(1) + ")" : ""));
    if (f && f.score !== null && f.score < 35) weak.push("امتیاز مالی کل پایین است (" + Math.round(f.score) + " از ۱۰۰)");
    R.weakN = weak.length;
    if (weak.length) { R.pts -= weak.length >= 2 ? 7 : 4; R.lines.push({ lv: "w", t: "بنیاد ضعیف (از تب مالی): " + weak.join("؛ ") + ". نوسان‌گیری روی چنین سهمی ریسک خبری و صف فروش بیشتری دارد." }); }
    else if (f && f.ok !== false && f.score !== null) R.lines.push({ lv: f.score >= 55 ? "ok" : "w", t: "وضعیت مالی (تب مالی): امتیاز " + Math.round(f.score) + " از ۱۰۰" + (f.verdict ? " — " + f.verdict : "") + (f.pe ? "؛ P/E حدود " + Number(f.pe).toFixed(1) : "") });
    else R.lines.push({ lv: "w", t: "تب «🏦 مالی» هنوز خوانده نشده؛ بنیاد شرکت در این تحلیل لحاظ نشد (صورت‌های مالی را روی TSETMC باز کن)." });
    R.pts = clamp(R.pts, 0, R.max);
    return R;
  }

  function analyze(P) {
    var b = P.bars || [], n = b.length, fb = P.fb > 0 ? P.fb : 0.0037, fs = P.fs > 0 ? P.fs : 0.0088, minVal = P.minVal > 0 ? P.minVal : 20;
    if (n < 80) return { ok: false, err: "سابقه‌ی قیمت کمتر از ۸۰ روز است؛ برای نوسان‌گیری کافی نیست." };
    var c = b.map(function (x) { return x.c; }), last = b[n - 1], S = P.S > 0 && Math.abs(P.S / last.c - 1) < 0.12 ? P.S : last.c;
    var rt = fb + fs, out = { ok: true, S: S, fb: fb, fs: fs, rt: rt, checks: [], notes: [] };
    // ---- آمار پایه
    var atr = atrAt(b, 14, n - 1), atrp = atr / S, tr20 = b.slice(-20), traded20 = tr20.filter(function (x) { return x.v > 0; });
    var traded60 = b.slice(-60).filter(function (x) { return x.v > 0; }).length;
    var valB = mean(traded20.map(function (x) { return x.val / 1e9; }).filter(function (x) { return x > 0; })) || 0;
    var rng20 = mean(tr20.map(function (x) { return (x.h - x.l) / x.c; }));
    var rets = []; for (var i = 1; i < n; i++) rets.push(c[i] / c[i - 1] - 1);
    var r120 = rets.slice(-120), ac = corr1(r120);
    var maxAbs = Math.max.apply(null, r120.map(Math.abs));
    var lim = P.lim > 0 ? P.lim : clamp(maxAbs, 0.02, 0.06);   // دامنه‌ی نوسان روزانه (تنظیمات سهم؛ در نبودش از خود سابقه)
    var qdays = b.slice(-60).filter(function (x, ix, arr) {
      var prev = ix > 0 ? arr[ix - 1].c : x.o; var ch = prev > 0 ? Math.abs(x.c / prev - 1) : 0;
      if (x.h === x.l && ch >= 0.9 * lim) return true;                       // یک قیمت در تمام روز، روی حد
      var pos = x.h > x.l ? (x.c - x.l) / (x.h - x.l) : 0.5;
      return ch >= 0.9 * lim && (pos > 0.97 || pos < 0.03);                  // نزدیک حد و بسته شدن در انتهای دامنه
    }).length;
    var gaps = b.slice(-60).filter(function (x, ix, arr) { return ix > 0 && Math.abs(x.o / arr[ix - 1].c - 1) > 0.8 * lim; }).length;
    var sma20 = sma(c, 20, n - 1), sma50 = sma(c, 50, n - 1), sma200 = n >= 200 ? sma(c, 200, n - 1) : null, sma50p = sma(c, 50, n - 21);
    var slope50 = sma50 && sma50p ? sma50 / sma50p - 1 : null, rs = rsi(c, 14);
    var cross = 0; for (i = n - 60; i < n; i++) { var m1 = sma(c, 20, i - 1), m2 = sma(c, 20, i); if (m1 && m2 && (c[i - 1] - m1) * (c[i] - m2) < 0) cross++; }   // میانگین متحرک
    var rg20 = rangeAt(b, n - 1, 20), rg60 = rangeAt(b, n - 1, 60), pos20 = rg20.hi > rg20.lo ? (S - rg20.lo) / (rg20.hi - rg20.lo) : 0.5;
    var down = sma50 !== null && (S < sma50 * 0.92 || (S < sma50 && slope50 !== null && slope50 < -0.02 && sma200 !== null && S < sma200));
    Object.assign(out, { lim: lim, atr: atr, atrp: atrp, rng20: rng20, valB: valB, traded20: traded20.length, traded60: traded60, ac: ac, qdays: qdays, gaps: gaps, maxAbs: maxAbs, sma20: sma20, sma50: sma50, sma200: sma200, slope50: slope50, rsi: rs, cross: cross, lo20: rg20.lo, hi20: rg20.hi, lo60: rg60.lo, hi60: rg60.hi, pos20: pos20, down: down });

    // ---- موج‌ها در ۱۶۰ روز اخیر
    var W = c.slice(-Math.min(n, 160)), thr = clamp(1.1 * atrp, 0.03, 0.09), piv = zigzag(W, thr), up = [], upDays = [];
    for (i = 1; i < piv.length; i++) if (piv[i - 1].t === "L" && piv[i].t === "H") { up.push(piv[i].p / piv[i - 1].p - 1); upDays.push(piv[i].i - piv[i - 1].i); }
    var lows = piv.filter(function (x) { return x.t === "L"; }).slice(-4).map(function (x) { return x.p; }), highs = piv.filter(function (x) { return x.t === "H"; }).slice(-4).map(function (x) { return x.p; });
    out.swings = { thr: thr, count: up.length, medAmp: median(up), medDays: median(upDays), lows: lows, highs: highs };

    // ---- آزمون قاعده روی سابقه‌ی خود سهم (۳ حالت عمق ورود)
    var H0 = 8, from = Math.max(40, n - 190), tests = [0.15, 0.25, 0.35].map(function (k) { return backtest(b, k, fb, fs, H0, from); });
    var cand = tests.filter(function (x) { return x.n >= 5; }).sort(function (a, z) { return z.exp - a.exp; });
    var best = cand.length ? cand[0] : tests[1];
    out.tests = tests; out.best = best;
    var Hdays = clamp(Math.round((best.days || 4) * 1.6), 4, H0);   // هم‌خوان با مهلت آزمون

    // ---- طرح امروز
    var k = best.k, deepK = Math.max(0.04, k - 0.12), pl = planAt(b, n - 1, k, fb, fs);
    var L1 = pl.L, L2 = pl.lo + deepK * (pl.hi - pl.lo), avgIn = (L1 + L2) / 2;
    var t1 = avgIn + FR.t1 * (pl.hi - avgIn), t2 = avgIn + FR.t2 * (pl.hi - avgIn);
    var floor1 = avgIn * (1 + rt + 0.012);
    var room = t2 > avgIn * (1 + rt + 0.02);
    t1 = Math.max(t1, floor1); if (t2 < t1) t2 = t1 * 1.01;
    var stop = stopFor(avgIn, pl.lo, pl.atr), net = function (e, x) { return x * (1 - fs) / (e * (1 + fb)) - 1; };
    var beExit = avgIn * (1 + fb) / (1 - fs) * 1.003;
    var plan = {
      k: k, L1: L1, L2: L2, avgIn: avgIn, t1: t1, t2: t2, stop: stop, be: beExit, hi: pl.hi, lo: pl.lo, days: Hdays, room: room,
      netT1: net(avgIn, t1), netT2: net(avgIn, t2), netStop: net(avgIn, stop)
    };
    plan.netBlend = 0.5 * plan.netT1 + 0.5 * plan.netT2;
    plan.rr = plan.netStop < 0 ? plan.netBlend / -plan.netStop : null;
    var EV = evalEvents(P.ev, S, plan.days); out.events = EV;
    if (EV.days) plan.days = Math.min(plan.days, EV.days);
    out.plan = plan;

    // ---- امتیاز مناسب بودن (بدون در نظر گرفتن زمان‌بندی)
    var sc = 0, add = function (pts, max, ok, txt, level) { out.checks.push({ lv: level || (ok ? "ok" : (pts > 0 ? "w" : "bad")), pts: Math.round(pts), max: max, t: txt }); sc += pts; };
    var hard = [];
    var fv = function (x, d) { return Number(x).toFixed(d === undefined ? 1 : d); };
    // نقدشوندگی
    if (valB >= minVal * 1.5) add(15, 15, true, "نقدشوندگی خوب: میانگین ارزش روزانه " + fv(valB, 0) + " میلیارد ریال؛ ورود و خروج سریع ممکن است");
    else if (valB >= minVal) add(8, 15, false, "نقدشوندگی در حد قبول: " + fv(valB, 0) + " میلیارد ریال در روز؛ با حجم بزرگ ممکن است قیمت را جابه‌جا کنی");
    else { add(0, 15, false, "نقدشوندگی کم است (" + fv(valB, 1) + " میلیارد ریال در روز)؛ خروج سریع سخت می‌شود", "bad"); hard.push("نقدشوندگی کم"); }
    // نوسان
    if (atrp >= 0.02 && atrp <= 0.065) add(15, 15, true, "نوسان روزانه مناسب است (ATR حدود " + fv(atrp * 100) + "٪)");
    else if (atrp >= 0.015 && atrp < 0.02) add(7, 15, false, "نوسان روزانه کم است (" + fv(atrp * 100) + "٪)؛ سود هر موج کوچک می‌ماند و کارمزد بخش بزرگی از آن را می‌خورد");
    else if (atrp > 0.065 && atrp <= 0.08) add(8, 15, false, "نوسان روزانه زیاد است (" + fv(atrp * 100) + "٪)؛ حد ضرر باید بازتر باشد و ریسک بالاتر");
    else { add(0, 15, false, atrp < 0.015 ? "نوسان روزانه خیلی کم است (" + fv(atrp * 100) + "٪)" : "نوسان روزانه خیلی زیاد/پرخطر است (" + fv(atrp * 100) + "٪)", "bad"); hard.push("نوسان نامناسب"); }
    // جای سود
    if (room && plan.netT2 >= 0.03) add(15, 15, true, "جای سود کافی است: هدف دوم حدود " + fv(plan.netT2 * 100) + "٪ خالص بعد از کارمزد");
    else if (room && plan.netT2 >= 0.015) add(8, 15, false, "جای سود محدود است: هدف دوم فقط حدود " + fv(plan.netT2 * 100) + "٪ خالص");
    else add(0, 15, false, "تا سقف بازه بعد از کارمزد (حدود " + fv(rt * 100, 2) + "٪ رفت‌وبرگشت) سود قابل‌توجهی نمی‌ماند", "bad");
    // تکرارپذیری موج‌ها
    var sw = out.swings;
    if (sw.count >= 5 && sw.medAmp - rt >= 0.03) add(15, 15, true, sw.count + " موج صعودی کامل در ۸ ماه اخیر؛ میانه‌ی دامنه‌ی هر موج " + fv(sw.medAmp * 100) + "٪ (حدود " + fv(sw.medDays, 0) + " روز)");
    else if (sw.count >= 3) add(8, 15, false, "فقط " + sw.count + " موج صعودی کامل در ۸ ماه اخیر (میانه‌ی دامنه " + fv((sw.medAmp || 0) * 100) + "٪)؛ الگوی نوسان کمتر تکرار شده");
    else add(0, 15, false, "در ۸ ماه اخیر موج صعودی تکرارشونده‌ای دیده نمی‌شود (" + sw.count + " مورد)؛ سهم بیشتر یک‌طرفه حرکت کرده است", "bad");
    // آزمون سابقه
    if (best.n >= 5 && best.exp > 0.005 && best.win >= 0.55) add(20, 20, true, "همین قاعده روی سابقه‌ی خود این سهم: " + best.n + " معامله، " + fv(best.win * 100, 0) + "٪ موفق، میانگین خالص " + fv(best.exp * 100) + "٪ در هر معامله");
    else if (best.n >= 5 && best.exp > 0) add(10, 20, false, "همین قاعده روی سابقه‌ی سهم فقط کم‌سود بوده: " + best.n + " معامله، " + fv(best.win * 100, 0) + "٪ موفق، میانگین خالص " + fv(best.exp * 100) + "٪");
    else if (best.n < 5) add(5, 20, false, "سابقه‌ی کافی برای آزمون نیست (فقط " + best.n + " معامله‌ی قابل‌شبیه‌سازی)", "w");
    else add(0, 20, false, "همین قاعده روی سابقه‌ی خود این سهم سود نداده: " + best.n + " معامله، میانگین خالص " + fv(best.exp * 100) + "٪", "bad");
    // برگشت‌پذیری
    var mr = 0, mrt = [];
    if (cross >= 8) { mr += 5; mrt.push(cross + " بار عبور از میانگین ۲۰ روزه در ۶۰ روز"); }
    if (ac !== null && ac < -0.05) { mr += 5; mrt.push("بازده روزانه تمایل به برگشت دارد (همبستگی " + fv(ac, 2) + ")"); }
    if (mr >= 10) add(10, 10, true, "رفتار رفت‌وبرگشتی: " + mrt.join("؛ ")); else if (mr > 0) add(mr, 10, false, "رفت‌وبرگشت نسبی: " + mrt.join("؛ ")); else add(0, 10, false, "رفتار رفت‌وبرگشتی ضعیف است (" + cross + " عبور از میانگین، همبستگی " + (ac === null ? "—" : fv(ac, 2)) + ")؛ سهم بیشتر روندی است تا نوسانی", "w");
    // روند
    if (down) { add(0, 10, false, "روند نزولی قوی: بیش از ۸٪ زیر میانگین ۵۰ روزه یا زیر میانگین‌های ۵۰ و ۲۰۰ با شیب منفی؛ «کف» در ریزش کف نیست", "bad"); hard.push("روند نزولی"); }
    else if (sma50 && S >= sma50 * 0.97) add(10, 10, true, "روند میان‌مدت سالم است (قیمت نزدیک یا بالای میانگین ۵۰ روزه)");
    else add(5, 10, false, "قیمت زیر میانگین ۵۰ روزه است؛ نوسان‌گیری فقط با احتیاط");
    // رویدادها و بنیاد شرکت (کدال + تب مالی)
    var evOk = EV.pts >= 13 && !EV.unknown;
    add(EV.pts, EV.max, evOk, EV.block ? "رویداد پیش‌رو مانع ورود است (جزئیات پایین، بخش «رویدادها»)" : EV.unknown ? "رویدادهای کدال لحاظ نشد (اطلاعیه‌ها دریافت نشد)" : EV.pts >= 13 ? "رویداد مهمی (مجمع، افزایش سرمایه، افشای تازه) در افق نوسان‌گیری دیده نشد" : "رویداد یا ریسکی در افق نوسان‌گیری هست (جزئیات: بخش «رویدادها»)", EV.block ? "bad" : (evOk ? "ok" : "w"));
    // صف و جهش
    var rp = 0; if (qdays >= 8) { hard.push("صف زیاد"); add(0, 0, false, "در ۶۰ روز اخیر " + qdays + " روز شبیه صف یا قفل شدن در حد نوسان بوده؛ فروش در لحظه‌ی دلخواه تضمین نیست", "bad"); }
    else if (qdays >= 3) add(0, 0, false, qdays + " روز شبیه صف/قفل در ۶۰ روز اخیر؛ مراقب گیر کردن در صف فروش باش", "w");
    if (gaps >= 6) add(0, 0, false, "شکاف قیمتی بازگشایی زیاد است (" + gaps + " روز در ۶۰ روز)؛ حد ضرر ممکن است با قیمت بدتری اجرا شود", "w");
    if (traded60 < 54) add(0, 0, false, "در ۶۰ روز اخیر " + (60 - traded60) + " روز بدون معامله بوده", "w");
    out.score = Math.round(sc);
    var total = out.checks.reduce(function (a, x) { return a + x.max; }, 0);
    out.pct = total ? Math.round(sc / total * 100) : 0;
    out.hard = hard;
    var capWeak = !hard.length && EV.weakN >= 2;
    out.grade = capWeak ? { cls: "w", sym: "⚠", text: "نوسان‌گیری با احتیاط (بنیاد شرکت ضعیف است)", why: "امتیاز " + out.pct + " از ۱۰۰ ولی چند نشانه‌ی ضعف مالی دیده شد؛ حجم کم و حد ضرر را رعایت کن" } : hard.length ? { cls: "h", sym: "⛔", text: "برای نوسان‌گیری مناسب نیست", why: hard.join("، ") } : out.pct >= 70 ? { cls: "ok", sym: "✅", text: "مناسب نوسان‌گیری است", why: "امتیاز " + out.pct + " از ۱۰۰" } : out.pct >= 50 ? { cls: "w", sym: "⚠", text: "نوسان‌گیری با احتیاط", why: "امتیاز " + out.pct + " از ۱۰۰؛ بعضی شرط‌ها ضعیف‌اند" } : { cls: "h", sym: "⛔", text: "مناسب نوسان‌گیری نیست", why: "امتیاز " + out.pct + " از ۱۰۰" };

    // ---- زمان‌بندی: الان کجای طرح هستیم
    var T;
    if (down) T = { cls: "h", sym: "⛔", text: "الان نخر", why: "روند نزولی است؛ منتظر توقف ریزش بمان." };
    else if (S <= stop) T = { cls: "h", sym: "⛔", text: "قیمت زیر حد ضرر طرح است", why: "ساختار بازه شکسته؛ طرح نوسان‌گیری فعلاً باطل است." };
    else if (S <= L2 * 1.005) T = { cls: "ok", sym: "✅", text: "در منطقه‌ی خرید عمیق", why: "هر دو پله‌ی خرید فعال‌اند؛ سفارش‌ها را با حد ضرر هم‌زمان بگذار." };
    else if (S <= L1 * 1.01) T = { cls: "ok", sym: "✅", text: "در منطقه‌ی خرید", why: "پله‌ی اول فعال است؛ پله‌ی دوم را پایین‌تر بگذار." };
    else if (S <= L1 * 1.04) T = { cls: "w", sym: "⏳", text: "کمی بالاتر از منطقه‌ی خرید", why: "تعقیب قیمت نکن؛ سفارش حدی در قیمت‌های پیشنهادی بگذار و بگذار قیمت خودش بیاید." };
    else T = { cls: "wait", sym: "⏳", text: "بالاتر از منطقه‌ی خرید است", why: "الان نخر؛ منتظر برگشت به محدوده‌ی " + Math.round(L2) + " تا " + Math.round(L1) + " بمان." };
    if (EV.block && T.cls !== "h") T = { cls: "h", sym: "⛔", text: "الان وارد نشو؛ رویداد پیش‌رو", why: EV.block };
    else if (EV.wait && (T.cls === "ok" || T.cls === "w")) T = { cls: "w", sym: "⏳", text: "قیمت در منطقه‌ی خرید است ولی صبر کن", why: EV.wait };
    out.timing = T; out.dist = S / L1 - 1;
    return out;
  }

  // وضعیت پوزیشن موجود: قیمت خرید خود کاربر
  function holding(A, E) {
    if (!A || !A.ok || !(E > 0)) return null;
    var p = A.plan, rt = A.rt, S = A.S, fb = A.fb, fs = A.fs;
    var net = function (x) { return x * (1 - fs) / (E * (1 + fb)) - 1; };
    var minT = E * (1 + rt + 0.012), hi = Math.max(p.hi, E);
    var t1 = Math.max(minT, E + FR.t1 * (hi - E)), t2 = Math.max(t1 * 1.01, E + FR.t2 * (hi - E));
    var stop = Math.min(p.stop, E * 0.988), be = E * (1 + fb) / (1 - fs) * 1.003;
    var o = { E: E, t1: t1, t2: t2, stop: stop, be: be, netNow: net(S), netT1: net(t1), netT2: net(t2), netStop: net(stop), aboveRange: E >= p.hi * 0.98 };
    var act;
    if (S <= stop) act = { cls: "h", sym: "⛔", text: "حد ضرر شکسته شد", why: "طبق طرح باید خارج شوی؛ نگه‌داشتن امید است نه طرح." };
    else if (S >= t2) act = { cls: "ok", sym: "💰", text: "به هدف دوم رسیده؛ بقیه را بفروش", why: "سود را ببند؛ طمع کردن سود نوسان‌گیری را به سرمایه‌گذاری ناخواسته تبدیل می‌کند." };
    else if (S >= t1) act = { cls: "ok", sym: "💰", text: "به هدف اول رسیده؛ نصف را بفروش", why: "حد ضرر باقی‌مانده را به قیمت سر به سر (" + Math.round(be) + ") بیاور." };
    else if (S >= be) act = { cls: "w", sym: "⏳", text: "در سود جزئی؛ تا هدف اول نگه دار", why: "هدف اول " + Math.round(t1) + "؛ حد ضرر طبق طرح." };
    else act = { cls: "wait", sym: "⏳", text: "هنوز زیر سر به سر است", why: "تا " + Math.round(be) + " بالا نیامده سود خالص نداری؛ حد ضرر طرح را رعایت کن." };
    o.action = act;
    var ei = A.events && A.events.agmInfo;
    if (ei && ei.kind === "announced" && ei.daysTo >= -1 && ei.tdays <= p.days + 1 && act.cls !== "h") o.eventNote = "مجمع اعلام‌شده (" + ei.date + ") " + ei.daysTo + " روز دیگر است؛ طبق قاعده‌ی نوسان‌گیری قبل از آن خارج شو، حتی اگر به هدف نرسیده باشی." + (ei.drop ? " قیمت پایه‌ی روز مجمع حدود " + (ei.drop * 100).toFixed(1) + "٪ تعدیل می‌شود." : "");
    return o;
  }

  root.SwingTrade = { analyze: analyze, holding: holding, _zigzag: zigzag, _backtest: backtest };
  if (typeof module !== "undefined" && module.exports) module.exports = root.SwingTrade;
})(typeof self !== "undefined" ? self : this);
