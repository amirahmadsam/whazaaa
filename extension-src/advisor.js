/* موتور مشاور: تحلیل سهم پایه + زنجیره‌ی اختیارها ← بهترین حالت (خرید/فروش Call/Put)، مشخصات ایده‌آل و نزدیک‌ترین اختیار */
(function (root) {
  "use strict";
  var SC = root.StockChecklist, OC = root.OptionChecklist;
  if (typeof module !== "undefined" && module.exports) {
    SC = SC || require("./engine-stock.js");
    OC = OC || require("./engine-opt.js");
  }

  function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }
  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function median(a) {
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; }), k = Math.floor(s.length / 2);
    return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
  }
  function num(x) { if (x === null || x === undefined || x === "") return null; var n = Number(x); return isFinite(n) ? n : null; }
  function tdOf(o) { return o.tdov > 0 ? o.tdov : Math.max(0, Math.round(o.cal_days * 5 / 7 * 0.92)); }

  // ---------- توزیع قیمت سهم در سررسید: لگ‌نرمال با کمی انحراف به‌سمت نظر تحلیل ----------
  var ZG = [], WG = [];
  (function () {
    var sum = 0, z;
    for (z = -4; z <= 4.0001; z += 0.05) { ZG.push(z); var w = Math.exp(-z * z / 2); WG.push(w); sum += w; }
    for (var i = 0; i < WG.length; i++) WG[i] /= sum;
  })();
  function dist(S, sigma, td, m) {
    var s = sigma * Math.sqrt(td), mu = Math.log(S) + m - 0.5 * s * s, xs = new Array(ZG.length);
    for (var i = 0; i < ZG.length; i++) xs[i] = Math.exp(mu + s * ZG[i]);
    return xs;
  }

  // ---------- نوسان ضمنی از قیمت (نوسان روزانه، بدون نرخ بهره؛ هم‌خوان با ارزش تئوری موتور اختیار) ----------
  function impliedVol(call, S, K, price, td) {
    if (!(S > 0 && K > 0 && price > 0 && td > 0)) return null;
    var intr = Math.max(call ? S - K : K - S, 0);
    if (!(price > intr + 1e-9)) return null;
    var lo = 1e-4, hi = 0.3;
    if (OC.fairValue(call, S, K, hi, td) < price) return null;
    for (var i = 0; i < 50; i++) { var mid = (lo + hi) / 2; if (OC.fairValue(call, S, K, mid, td) < price) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }

  // ---------- خلاصه‌ی تحلیل مالی (بنیادی) برای ترکیب با نمودار ----------
  // fin: همان شیء ذخیره‌شده‌ی تب «🏦 مالی»؛ inp: ورودی‌های سهم (pe, pe_sec, eps_site)
  function finView(fin, S, inp) {
    var out = { ok: false, d: 0, score: null, verdict: "", good: [], bad: [], pe: null, peSec: null };
    if (!fin || !SC || !SC.finAnalyze) return out;
    var hasAny = (fin.y0 && Object.keys(fin.y0).length) || (fin.y1 && Object.keys(fin.y1).length);
    if (!hasAny) return out;
    inp = inp || {};
    var eps = num(inp.eps_site); if (eps === null && fin.epsTbl !== undefined) eps = num(fin.epsTbl);
    var r;
    try { r = SC.finAnalyze(fin, num(S), inp.pe_sec, { eps: eps, pe: num(inp.pe) }); } catch (e) { return out; }
    if (!r || r.score === null || r.score === undefined) return out;
    out.ok = true; out.score = r.score; out.verdict = r.verdict;
    out.good = (r.notes && r.notes.good || []).slice(0, 4); out.bad = (r.notes && r.notes.bad || []).slice(0, 4);
    out.pe = r.val && r.val.pe ? r.val.pe : null; out.peSec = num(inp.pe_sec);
    out.z = r.z; out.fscore = r.fscore;
    var d = (r.score - 50) / 30;
    if (out.pe && out.pe > 0 && out.peSec > 0) { var ratio = out.pe / out.peSec; if (ratio < 0.7) d += 0.2; else if (ratio > 1.5) d -= 0.2; }
    if (out.pe !== null && out.pe < 0) d -= 0.2;
    out.d = clamp(d, -1, 1);
    return out;
  }

  // ---------- دید تحلیلی از روی سهم پایه ----------
  // خروجی: جهت d در بازه [-1, 1]، اطمینان، حالت بازار، سطوح حمایت/مقاومت و نوسان
  // fin (اختیاری): خروجی finView ؛ h (اختیاری): افق روزِ احتمال شرطی (پیش‌فرض ۱۰)
  function stockView(an, S, stockSt, stockInp, fin, h) {
    h = h || 10;
    var v = { ok: false, d: 0, conf: 0, parts: [], notes: [], warn: [] };
    var bars = an && an.bars;
    // نوسان روزانه (لگاریتمی) از سابقه
    var rets = null;
    if (bars && bars.length > 30) {
      rets = [];
      for (var i = 1; i < bars.length; i++) rets.push(Math.log(bars[i].c / bars[i - 1].c));
    } else if (an && an.rets && an.rets.length >= 20) rets = an.rets.map(function (x) { return Math.log(1 + x); });
    if (rets && rets.length >= 20) {
      var r60 = rets.slice(-60), m60 = mean(r60);
      v.sigma = Math.sqrt(mean(r60.map(function (x) { return (x - m60) * (x - m60); })));
      var mAll = mean(rets);
      v.sigmaAll = Math.sqrt(mean(rets.map(function (x) { return (x - mAll) * (x - mAll); })));
      v.volRegime = v.sigmaAll > 0 ? v.sigma / v.sigmaAll : null;
    }
    if (stockInp) {
      if (stockInp.q_sq === "بله") v.warn.push("سهم در صف فروش است؛ قیمت واقعی سهم و اختیار ممکن است همخوان نباشد");
      if (stockInp.q_bq === "بله") v.warn.push("سهم در صف خرید است؛ قیمت واقعی سهم و اختیار ممکن است همخوان نباشد");
      if (stockInp.q_halt === "خیر") v.warn.push("سهم ممنوع/متوقف است");
    }
    if (!bars || bars.length < 60) { v.notes.push("سابقه قیمت برای تحلیل تکنیکال کافی نیست؛ فقط مدل نوسان به‌کار می‌رود (بدون نظر جهتی)"); return v; }
    var D = SC.chartData(an, S, h, stockSt);
    if (!D) return v;
    var T = D.T;
    v.ok = true; v.D = D; v.T = T;
    v.px = D.px;
    // مؤلفه‌ها (هرکدام در بازه -1..۱)
    var comp = [];
    function add(name, val, w, txt) { if (val === null || val === undefined || !isFinite(val)) return; comp.push({ name: name, d: clamp(val, -1, 1), w: w, txt: txt }); }
    if (D.prob && D.prob.p !== undefined) add("احتمال شرطی تاریخی " + h + " روز", (D.prob.p - 0.5) / 0.12, 0.35, "احتمال صعود " + h + " روزه " + Math.round(D.prob.p * 100) + "٪ (" + D.prob.verdict + ")");
    if (T && T.score !== null) add("امتیاز تکنیکال", (T.score - 50) / 30, 0.25, "امتیاز تکنیکال " + T.score + " از ۱۰۰");
    if (T) add("روند", { "صعودی قوی": 1, "صعودی": 0.5, "نزولی": -1 }[T.trendTxt] || 0, 0.2, "روند: " + T.trendTxt);
    var fl = [];
    if (T && T.netreal !== null) fl.push(T.netreal / 0.3);
    if (T && T.power !== null) fl.push((T.power - 1) / 0.8);
    if (fl.length) add("جریان حقیقی/حقوقی", mean(fl.map(function (x) { return clamp(x, -1, 1); })), 0.1, "خالص خرید حقیقی " + (T.netreal !== null ? (T.netreal * 100).toFixed(0) + "٪" : "—") + " | قدرت خریدار " + (T.power !== null ? T.power.toFixed(2) : "—"));
    var mo = 0;
    if (T && T.rsi !== null) { if (T.rsi > 75) mo -= 0.3; else if (T.rsi < 25) mo += 0.3; }
    if (D.divergence) mo += /مثبت/.test(D.divergence) ? 0.3 : -0.3;
    add("اشباع/واگرایی", mo, 0.1, "RSI " + (T && T.rsi !== null ? T.rsi.toFixed(0) : "—") + (D.divergence ? " | " + D.divergence.split(":")[0] : ""));
    if (fin && fin.ok) add("بنیاد (تحلیل مالی)", fin.d, 0.12, "امتیاز مالی " + fin.score + " از ۱۰۰ (" + fin.verdict + ")" + (fin.pe ? " | P/E " + fin.pe.toFixed(1) : ""));
    v.fin = fin && fin.ok ? fin : null;
    var tw = comp.reduce(function (s, c) { return s + c.w; }, 0);
    v.d = tw > 0 ? comp.reduce(function (s, c) { return s + c.d * c.w; }, 0) / tw : 0;
    v.parts = comp;
    // اطمینان: معناداری آماری + هم‌جهتی مؤلفه‌ها
    var pconf = 0.25;
    if (D.prob && D.prob.p !== undefined) pconf = (D.prob.lo > 0.5 || D.prob.hi < 0.5) ? 0.9 : (Math.abs(D.prob.p - 0.5) >= 0.04 ? 0.6 : 0.35);
    var sg = v.d >= 0 ? 1 : -1, nz = comp.filter(function (c) { return Math.abs(c.d) > 0.1; });
    var agree = nz.length ? nz.filter(function (c) { return (c.d >= 0 ? 1 : -1) === sg; }).length / nz.length : 0.5;
    v.conf = clamp(pconf * (0.5 + 0.5 * agree), 0.1, 1);
    v.agree = agree;
    // حالت بازار
    var adx = D.series && D.series.adx ? D.series.adx[D.series.adx.length - 1] : null;
    v.adx = adx;
    v.range = adx !== null && adx < 20;
    v.dirTxt = v.d > 0.25 ? "صعودی" : v.d < -0.25 ? "نزولی" : "خنثی / نامشخص";
    v.confTxt = v.conf >= 0.7 ? "اطمینان بالا" : v.conf >= 0.4 ? "اطمینان متوسط" : "اطمینان پایین";
    // سطوح
    var sup = D.sr && D.sr.sup.length ? D.sr.sup[0] : null, res = D.sr && D.sr.res.length ? D.sr.res[0] : null;
    var sg10 = (v.sigma || 0.02) * Math.sqrt(10);
    v.sup = sup; v.res = res;
    v.tUp = res || D.px * Math.exp(1.2 * sg10);
    v.tDn = sup || D.px * Math.exp(-1.2 * sg10);
    v.tUpEst = !res; v.tDnEst = !sup;
    v.prob = D.prob;
    v.resP = D.sr && D.sr.resP ? D.sr.resP[0] : null; v.supP = D.sr && D.sr.supP ? D.sr.supP[0] : null;
    v.h = h; v.divergence = D.divergence;
    return v;
  }

  // ---------- پیش‌بینی توزیع قیمت سهم در سررسید (همان توزیعی که اختیارها را با آن می‌سنجیم) ----------
  function outlook(v, S, td, kf) {
    if (!v || !v.sigma || !(S > 0) || !(td > 0)) return null;
    kf = kf === undefined ? 0.5 : kf;
    var kview = v.ok ? kf * v.d * v.conf : 0;
    var m = kview * Math.sqrt(Math.min(td, 20)) * v.sigma;
    var s = v.sigma * Math.sqrt(td), mu = Math.log(S) + m - 0.5 * s * s;
    var o = { td: td, S: S, m: m, s: s, mu: mu, median: Math.exp(mu), mean: S * Math.exp(m), low68: Math.exp(mu - s), high68: Math.exp(mu + s), low95: Math.exp(mu - 1.96 * s), high95: Math.exp(mu + 1.96 * s) };
    o.retMed = o.median / S - 1;
    o.pUp = 1 - OC.ncdf((Math.log(S) - mu) / s);
    o.pAbove = function (X) { return 1 - OC.ncdf((Math.log(X) - mu) / s); };
    return o;
  }


  // =====================================================================
  //  «دارم؛ بفروشم؟»: نگه‌دار / بخشی بفروش / بفروش + کی و کجا
  // =====================================================================
  function holdAdvice(o) {
    var out = { ok: false, issues: [] };
    var S = num(o.S), buy = num(o.buy);
    if (!(S > 0)) out.issues.push("آخرین معامله سهم خوانده نشده؛ «خواندن از سایت» را بزن.");
    if (!(buy > 0)) out.issues.push("قیمت خرید خودت را وارد کن.");
    if (!o.an || !o.an.bars || o.an.bars.length < 60) out.issues.push("سابقه‌ی قیمت (حداقل ۶۰ روز) خوانده نشده؛ «خواندن از سایت» را بزن.");
    if (out.issues.length) return out;
    var us = o.stockSt || {}, st = SC.effective(us), T = SC.tech(o.an, S, st);
    if (!T || !(T.atr > 0)) { out.issues.push("محاسبه‌ی ATR ممکن نشد (سابقه کافی نیست)."); return out; }
    var inp = Object.assign({}, o.inp || {}, { S: S });
    var v = stockView(o.an, S, us, inp, o.fin || null, 10), ol = outlook(v, S, 10, 0.5), D = SC.chartData(o.an, S, 10, us);
    var fb = st.fee_buy, fs = st.fee_sell, atr = T.atr, qty = num(o.qty) > 0 ? num(o.qty) : null;
    var cost = buy * (1 + fb), net = S * (1 - fs) - cost, netPct = net / cost, be = cost / (1 - fs);
    var held = num(o.held), reasons = [], sig = [];
    function add(name, sv, w, txt) { sig.push({ name: name, s: Math.max(-1, Math.min(1, sv)), w: w, txt: txt }); }

    // --- سیگنال‌ها (منفی = فشار فروش، مثبت = دلیل نگه‌داشتن)
    if (v.ok) add("دید تحلیلی (نمودار" + (v.fin ? " + مالی" : "") + ")", v.d * Math.max(0.3, v.conf), 0.35, v.dirTxt + " | " + v.confTxt);
    var trendS = 0, trendTxt = "روند: " + T.trendTxt;
    if (T.sma50 !== null && S < T.sma50) trendS -= 0.8; else if (T.sma50 !== null && S > T.sma50) trendS += 0.4;
    if (T.sma20 !== null && S < T.sma20) trendS -= 0.4; else if (T.sma20 !== null && S > T.sma20) trendS += 0.3;
    if (T.slope50 !== null && T.slope50 < 0) trendS -= 0.2;
    add("روند (میانگین ۲۰ و ۵۰ روزه)", trendS, 0.2, trendTxt);
    var rsiS = 0; if (T.rsi !== null) { rsiS = T.rsi > 80 ? -0.8 : T.rsi > st.maxrsi ? -0.4 : T.rsi < 30 ? 0.2 : 0; add("RSI", rsiS, 0.1, "RSI " + Math.round(T.rsi) + (T.rsi > st.maxrsi ? " (اشباع خرید)" : T.rsi < 30 ? " (اشباع فروش)" : "")); }
    if (T.macd) add("مومنتوم (MACD)", T.macd.hist > 0 ? (T.macd.hist > T.macd.histPrev ? 0.6 : 0.2) : (T.macd.hist < T.macd.histPrev ? -0.6 : -0.2), 0.1, T.macd.hist > 0 ? "هیستوگرام مثبت" : "هیستوگرام منفی");
    if (T.ext !== null) add("فاصله از میانگین ۲۰ روزه", T.ext > st.maxext ? -0.5 : 0, 0.06, "فاصله " + (T.ext).toFixed(1) + " ATR بالای میانگین ۲۰ روزه");
    if (T.power !== null && T.power !== undefined) add("قدرت خریدار حقیقی", T.power < st.minpower ? -0.4 : T.power > 1.3 ? 0.4 : 0, 0.06, "قدرت خریدار " + T.power.toFixed(2));
    if (o.fin && o.fin.ok) add("بنیاد (تحلیل مالی)", o.fin.d, 0.08, "امتیاز مالی " + o.fin.score + " از ۱۰۰");
    var resList = D && D.sr ? D.sr.res : [], resP = D && D.sr ? D.sr.resP : [], supList = D && D.sr ? D.sr.sup : [];
    if (resList.length && (resList[0] - S) / atr < 0.8) add("نزدیکی به مقاومت", -0.4, 0.06, "مقاومت " + fm(resList[0]) + " فقط " + ((resList[0] - S) / atr).toFixed(1) + " ATR بالاتر است");
    if (held !== null && held > st.tstop && Math.abs(netPct) < atr / S * 1.5) add("خروج زمانی", -0.5, 0.05, "بیش از " + st.tstop + " روز نگه داشته‌ای و حرکتی نبوده");
    var tw = 0, ts = 0; sig.forEach(function (x) { tw += x.w; ts += x.w * x.s; });
    var HS = tw > 0 ? ts / tw : 0;

    // --- حد ضرر شناور
    var stopA = (T.hh20 || S) - 2.5 * atr, stopS = supList.length ? supList[0] - 0.3 * atr : null;
    var stop = stopS !== null ? Math.max(stopA, stopS) : stopA, stopSrc = stopS !== null && stopS >= stopA ? "زیر حمایت " + fm(supList[0]) : "۲٫۵ ATR زیر سقف ۲۰ روزه";
    var uStop = num(o.userStop); if (uStop > 0) { stop = uStop; stopSrc = "حد ضرر خودت"; }
    else if (S >= be + 2 * atr && be > stop && be < S) { stop = be; stopSrc = "سر به سر خودت (چون سودت از ۲ ATR بیشتر است)"; }
    var stopHit = S <= stop;
    var stopNet = stop * (1 - fs) / cost - 1;

    // --- هدف‌ها
    var uT = num(o.userTarget), tg = [];
    function tgItem(price, src, pt) {
      var days = Math.log(price / S) / (v.sigma || 0.02); days = Math.min(250, Math.max(1, Math.round(days * days)));
      return { price: price, src: src, pct: price / S - 1, netPct: price * (1 - fs) / cost - 1, p: pt, days: days };
    }
    if (uT > S) tg.push(tgItem(uT, "هدف خودت", null));
    resList.forEach(function (r, i) { if (tg.length < 2 && !(uT > S && Math.abs(r / uT - 1) < 0.01)) tg.push(tgItem(r, "مقاومت " + (i + 1), resP ? resP[i] : null)); });
    if (!tg.length) tg.push(tgItem(S + 3 * atr, "هدف تقریبی ۳ ATR بالاتر (مقاومتی روی نمودار نیست)", null));
    var rrHold = tg.length && S > stop ? (tg[0].price - S) / (S - stop) : null;

    // --- افق ۱۰ روز بعد
    var hz = ol ? { median: ol.median, low68: ol.low68, high68: ol.high68, pUp: ol.pUp, pProfit: ol.pAbove(be), medNetPct: ol.median * (1 - fs) / cost - 1, lowNetPct: ol.low68 * (1 - fs) / cost - 1, highNetPct: ol.high68 * (1 - fs) / cost - 1 } : null;

    // --- حکم
    var nearT = tg.length && (tg[0].price - S) / atr < 0.6, overheated = T.rsi !== null && T.rsi > st.maxrsi;
    var verdict, ov = null;
    if (stopHit) {
      var isUserStop = stopSrc === "حد ضرر خودت", pct0 = function (x) { return Math.round(x * 100) + "٪"; };
      var conds = [
        { ok: v.ok && v.d >= 0.35 && v.conf >= 0.6, yes: "دید تحلیلی (نمودار" + (v.fin ? " + مالی" : "") + ") قوی و مثبت است: جهت " + (v.ok ? pct0(v.d) : "—") + "، اطمینان " + (v.ok ? pct0(v.conf) : "—") + ".", no: "دید تحلیلی به‌اندازه‌ی کافی قوی و مطمئن نیست (باید جهت ≥ ۳۵٪ و اطمینان ≥ ۶۰٪ باشد)." },
        { ok: T.sma50 !== null && S > T.sma50 && (T.slope50 === null || T.slope50 >= 0), yes: "روند میان‌مدت سالم است: قیمت بالای میانگین ۵۰ روزه (" + fm(T.sma50) + ") و شیب آن صعودی/خنثی است.", no: "روند میان‌مدت آسیب دیده: قیمت زیر میانگین ۵۰ روزه است یا شیب آن نزولی است." },
        { ok: stop - S <= atr, yes: "شکست کم‌عمق است: فقط " + ((stop - S) / atr).toFixed(1) + " ATR زیر خط خروج؛ همین‌قدر نوسان در یک روز عادی هم پیش می‌آید.", no: "شکست عمیق است: " + ((stop - S) / atr).toFixed(1) + " ATR زیر خط خروج (بیش از ۱ ATR)." },
        { ok: !o.fin || !o.fin.ok || o.fin.d > -0.2, yes: o.fin && o.fin.ok ? "بنیاد مانعی نیست (امتیاز مالی " + o.fin.score + " از ۱۰۰)." : "اطلاعات مالی ثبت نشده؛ بنیاد خنثی فرض شد.", no: "بنیاد ضعیف است (امتیاز مالی " + (o.fin ? o.fin.score : "—") + " از ۱۰۰) و صعود را شکننده می‌کند." },
        { ok: HS >= 0.10, yes: "بقیه‌ی نشانه‌ها (RSI، MACD، قدرت خریدار و…) در مجموع منفی نیستند (" + Math.round(HS * 100) + "٪).", no: "بقیه‌ی نشانه‌ها (RSI، MACD، قدرت خریدار و…) به‌اندازه‌ی کافی مثبت نیستند (مجموع " + Math.round(HS * 100) + "٪؛ لازم است حداقل ۱۰٪ باشد)." },
      ];
      ov = { conds: conds, allOk: conds.every(function (c) { return c.ok; }), isUserStop: isUserStop, reclaim: stop, hard: stop - atr };
    }
    if (stopHit && ov.allOk && !ov.isUserStop) verdict = { key: "hold_warn", cls: "w", sym: "🟡", text: "از خط خروج پایین‌تری، ولی نگه‌داشتنِ مشروط منطقی است", why: "شکست کم‌عمق است و روند و دید تحلیلی هنوز مثبت‌اند؛ فروش فوری ممکن است به‌خاطر یک نوسان عادی باشد. شرط‌های زیر را جدی بگیر." };
    else if (stopHit) verdict = { key: "sell", cls: "h", sym: "🔴", text: "بفروش", why: "قیمت به/زیر خط خروج (" + fm(stop) + ") رسیده است" + (ov.isUserStop ? " (حد ضرر خودت؛ انضباط یعنی همان را اجرا کنی" + (ov.allOk ? "، هرچند تحلیل ادامه‌ی نگه‌داشتن را توجیه می‌کند" : "") + ")." : " و دلیل کافی برای استثنا وجود ندارد (جزئیات پایین).") };
    else if (HS < -0.30) verdict = { key: "sell", cls: "h", sym: "🔴", text: "بفروش (همه یا بیشترش)", why: "مجموع نشانه‌ها منفی است (" + Math.round(HS * 100) + "٪)." };
    else if (HS < -0.10 || (netPct > 0.04 && (overheated || nearT))) verdict = { key: "part", cls: "w", sym: "🟠", text: "بخشی بفروش (حدود یک‌سوم تا نصف) و بقیه را با حد ضرر شناور نگه دار", why: HS < -0.10 ? "نشانه‌ها متمایل به ضعف‌اند." : (overheated ? "RSI در اشباع خرید است" : "قیمت کنار مقاومت است") + " و در سود هستی؛ بخشی از سود را قفل کن." };
    else if (HS < 0.12) verdict = { key: "hold_c", cls: "w", sym: "🟡", text: "نگه دار، با احتیاط", why: "نشانه‌ها خنثی یا مختلط‌اند؛ حد ضرر شناور را جدی بگیر." };
    else verdict = { key: "hold", cls: "ok", sym: "🟢", text: "نگه دار", why: "نشانه‌ها در مجموع به نفع ادامه‌ی نگه‌داشتن‌اند." };

    // --- کی بفروشم
    var when = [];
    if (verdict.key === "hold_warn") {
      when.push({ k: "ov1", t: "اگر می‌مانی، حجم را حدود نصف کن تا شکست خط خروج ریسک کل را زیاد نکند." });
      when.push({ k: "ov2", t: "مهلت: اگر پایان معامله‌ی همین امروز یا فردا قیمت دوباره بالای " + fm(stop) + " نبست، بفروش (شکست تأیید شده)." });
      when.push({ k: "ov3", t: "خروج بی‌قید: قیمت پایانی زیر " + fm(stop - atr) + " (۱ ATR زیر خط خروج) یعنی شکست عمیق؛ بدون تردید بفروش." });
    }
    if (verdict.key !== "hold_warn") when.push({ k: "stop", t: "خط خروج (حد ضرر شناور): " + fm(stop) + " (" + ((stop / S - 1) * 100).toFixed(1) + "٪ از قیمت فعلی) — منبع: " + stopSrc + ". اگر قیمت پایانی زیر آن آمد، بدون تردید بفروش؛ نتیجه‌ی خالص حدود " + (stopNet >= 0 ? "+" : "") + (stopNet * 100).toFixed(1) + "٪ نسبت به قیمت خرید است. هر روز که سهم بالا می‌رود این خط را هم بالا بیاور." });
    tg.forEach(function (x, i) { when.push({ k: "t" + (i + 1), t: (i === 0 ? "فروش بخشی در " : "فروش باقی‌مانده در ") + x.src + " " + fm(x.price) + " (" + (x.pct >= 0 ? "+" : "") + (x.pct * 100).toFixed(1) + "٪ از الان؛ سود خالص " + (x.netPct >= 0 ? "+" : "") + (x.netPct * 100).toFixed(1) + "٪ نسبت به خرید)" + (x.p !== null && x.p !== undefined ? " — احتمال لمس در ۱۰ روز آینده حدود " + Math.round(x.p * 100) + "٪" : "") + "؛ با نوسان فعلی معمولاً حدود " + x.days + " روز معاملاتی زمان می‌برد." }); });
    if (T.sma20 !== null) when.push({ k: "ma", t: "نشانه‌ی ضعف: اگر قیمت پایانی زیر میانگین ۲۰ روزه (" + fm(T.sma20) + ") بسته شد و حجم بالا بود، حداقل نصف را بفروش." });
    when.push({ k: "time", t: "خروج زمانی: اگر تا " + (held !== null && held < st.tstop ? (st.tstop - held) + " روز معاملاتی دیگر" : st.tstop + " روز معاملاتی") + " قیمت از محدوده‌ی ±" + (atr / S * 100).toFixed(1) + "٪ بیرون نرفت، سرمایه‌ات بی‌حاصل بسته شده؛ جابه‌جا کن." });
    if (o.agm && o.agm.daysTo !== null && o.agm.daysTo >= 0 && o.agm.daysTo <= Math.round(st.hold * 7 / 5)) when.push({ k: "agm", t: "مجمع " + (o.agm.kind === "announced" ? "(اعلام‌شده) " : "(تخمینی) ") + o.agm.text + " — " + o.agm.daysTo + " روز دیگر. اگر تقسیم سود دارد، بعد از مجمع قیمت معمولاً با حذف سود تعدیل می‌شود؛ تکلیف سهمت را قبل از آن روشن کن." });

    out.ok = true; out.S = S; out.buy = buy; out.qty = qty; out.T = T; out.v = v; out.ol = ol; out.st = st;
    out.pl = { cost: cost, net: net, netPct: netPct, be: be, total: qty ? net * qty : null, value: qty ? S * (1 - fs) * qty : null, invested: qty ? cost * qty : null };
    out.HS = HS; out.signals = sig; out.stop = { price: stop, src: stopSrc, hit: stopHit, net: stopNet, loss: qty ? (stop * (1 - fs) - cost) * qty : null };
    out.targets = tg; out.rrHold = rrHold; out.hz = hz; out.verdict = verdict; out.when = when; out.override = ov;
    return out;
  }

  // =====================================================================
  //  حالت ساده: فقط سرمایه + ریسک‌پذیری → بخر/نخر + سود و زیان در ۱۰ روز / ۱ ماه / ۱ سال
  // =====================================================================
  function rangeTable(v, S, E, qty, st, horizons) {
    var rows = [];
    horizons.forEach(function (h) {
      var ol = outlook(v, S, h, 0.5); if (!ol) return;
      var cost = qty * E * (1 + st.fee_buy);
      function pl(px) { return qty * (px * (1 - st.fee_sell) - E * (1 + st.fee_buy)); }
      var cols = [["min", "حداقل محتمل", -2.326], ["bad", "بد", -1.645], ["mid", "میانه", 0], ["good", "خوب", 1.645], ["max", "حداکثر محتمل", 2.326]].map(function (c) {
        var px = Math.exp(ol.mu + c[2] * ol.s), p = pl(px);
        return { k: c[0], label: c[1], px: px, pl: p, pct: cost > 0 ? p / cost : null };
      });
      var be = E * (1 + st.fee_buy) / (1 - st.fee_sell);
      rows.push({ td: h, cols: cols, pLoss: OC.ncdf((Math.log(be) - ol.mu) / ol.s), cost: cost });
    });
    return rows;
  }
  function simplePlan(o) {
    var out = { ok: false, issues: [] };
    var S = num(o.S), cap = num(o.capital);
    if (!(cap > 0)) out.issues.push("مبلغی که می‌خواهی بگذاری را وارد کن.");
    if (!(S > 0)) out.issues.push("آخرین معامله سهم خوانده نشده؛ «خواندن از سایت» را بزن.");
    if (!o.an || !o.an.bars || o.an.bars.length < 60) out.issues.push("سابقه‌ی قیمت (حداقل ۶۰ روز) خوانده نشده؛ «خواندن از سایت» را بزن.");
    if (out.issues.length) return out;
    var risk = Math.min(10, Math.max(1, Number(o.risk) || 5));
    var us = Object.assign({}, o.stockSt || {}, { risk: risk }), st = SC.effective(us);
    var inp = Object.assign({}, o.inp || {}, { S: S, capital: cap });
    ["entry", "stop", "target", "p", "qty"].forEach(function (k) { delete inp[k]; });
    var v = stockView(o.an, S, us, inp, o.fin || null, 10), ol = outlook(v, S, 10, 0.5);
    var qs = {}; ["trend", "pull", "break"].forEach(function (m) { qs[m] = SC.quote(m, inp, us, o.an); });
    if (!qs.trend.ok && !qs.pull.ok) { out.issues.push((qs.trend.missing || []).join("، ") || "داده‌ی کافی نیست."); return out; }
    var fit = (qs.trend.fit && qs.trend.fit.length ? qs.trend.fit : qs.pull.fit) || [];
    var cands = fit.filter(function (f) { return f.sym === "✅" || f.sym === "⚠"; }).sort(function (a, b) { return (a.sym === b.sym ? 0 : a.sym === "✅" ? -1 : 1) || ((b.score || 0) - (a.score || 0)); });
    var best = cands[0] || null, mode = best ? best.mode : "trend", q = qs[mode].ok ? qs[mode] : (qs.trend.ok ? qs.trend : qs.pull);
    var res = SC.evaluate(mode, inp, us, o.an), blockers = [], warns = [];
    [2, 3, 4].forEach(function (i) { var s = res.steps[i]; if (!s) return; if (s.missing) { if (i === 2) warns.push("نقدشوندگی را نتوانستم بسنجم (ارزش/حجم معاملات روزانه خوانده نشده)."); return; } (s.hard || []).forEach(function (x) { blockers.push(x); }); (s.warn || []).forEach(function (x) { warns.push(x); }); });
    var stop = q.targets.stop, t1 = q.targets.t1, t2 = q.targets.t2;
    var priceOk = q.limit > 0 && S <= q.limit, E = priceOk ? S : (q.limit > 0 ? Math.min(S, q.limit) : S);
    var riskPS = E * (1 + st.fee_buy) - stop * (1 - st.fee_sell);
    var qtyR = riskPS > 0 ? Math.floor(cap * st.riskpct / riskPS) : 0, qtyM = Math.floor(cap * st.maxpos / (E * (1 + st.fee_buy)));
    var qty = Math.max(0, Math.min(qtyR, qtyM));
    var dmin = 0.30 - 0.03 * risk, bear = v.ok && v.d < -0.25 && v.conf >= 0.4, fvBad = o.fin && o.fin.ok && o.fin.score < 35;
    var viewOk = v.ok && v.d >= dmin, why = [];
    if (!best) why.push("هیچ‌کدام از سه الگوی ورود (روندی/اصلاح/شکست) الان با نمودار سهم نمی‌خواند.");
    blockers.forEach(function (x) { why.push("❌ " + x); });
    if (bear) why.push("❌ دید تحلیلی نزولی است (" + v.dirTxt + ").");
    if (fvBad) why.push("❌ بنیاد ضعیف است (امتیاز مالی " + o.fin.score + " از ۱۰۰).");
    if (qty < 1) why.push("❌ با این سرمایه و سقف ریسک " + (st.riskpct * 100).toFixed(1) + "٪، حتی یک سهم هم نمی‌شود خرید.");
    var dec;
    if (!best || blockers.length || bear || fvBad || qty < 1) dec = { cls: "h", sym: "❌", text: "نخر" };
    else {
      if (!priceOk) why.push("⏳ قیمت فعلی (" + fm(S) + ") بالاتر از سقف مجاز ورود (" + fm(q.limit) + ") است.");
      if (!viewOk) why.push("⏳ دید تحلیلی هنوز به اندازه‌ی کافی مثبت نیست (جهت " + Math.round(v.d * 100) + "٪؛ برای این سطح ریسک‌پذیری حداقل " + Math.round(dmin * 100) + "٪ لازم است).");
      if (warns.length >= st.maxwarn) why.push("⏳ تعداد هشدارها (" + warns.length + ") از حد مجاز (" + st.maxwarn + ") بیشتر است.");
      if (!priceOk || !viewOk || warns.length >= st.maxwarn) dec = { cls: "w", sym: "⏳", text: "فعلاً صبر کن" };
      else dec = { cls: "ok", sym: "✅", text: warns.length ? "بخر (با احتیاط)" : "بخر" };
    }
    if (dec.cls === "ok") why.push("✅ الگوی «" + (SC.MODE_FIT[mode] || mode) + "»، قیمت زیر سقف مجاز و دید تحلیلی مثبت است.");
    warns.slice(0, 4).forEach(function (x) { why.push("⚠ " + x); });
    if (v.fin) why.push("بنیاد: امتیاز مالی " + v.fin.score + " از ۱۰۰ (" + v.fin.verdict + ")."); else why.push("اطلاعات مالی این سهم ثبت نشده؛ تحلیل فقط بر پایه‌ی نمودار است.");
    var invested = qty * E * (1 + st.fee_buy), riskAmt = qty * Math.max(riskPS, 0);
    function gain(t) { return t ? qty * (t * (1 - st.fee_sell) - E * (1 + st.fee_buy)) : null; }
    out.ok = true; out.risk = risk; out.st = st; out.mode = mode; out.modeLabel = SC.MODE_FIT[mode] || mode; out.v = v; out.ol = ol; out.dec = dec; out.why = why;
    out.plan = { S: S, E: E, limit: q.limit, zone: q.zone, zoneTxt: q.zoneTxt, stop: stop, t1: t1, t2: t2, qty: qty, invested: invested, investedPct: invested / cap, riskAmt: riskAmt, riskPct: riskAmt / cap, gain1: gain(t1), gain2: gain(t2), rr: q.targets ? q.levels && q.levels[0] ? q.levels[0].rr : null : null, stopSrc: q.targets.stopSrc, t1Src: q.targets.targetSrc, priceOk: priceOk };
    out.ranges = qty >= 1 ? rangeTable(v, S, E, qty, st, [10, 21, 250]) : [];
    out.capital = cap;
    return out;
  }

  // ---------- جمع‌بندی متنی: نماد احتمالاً چطور می‌رود؟ ----------
  function fm(x) { return Math.round(x).toLocaleString("en-US"); }
  function narrative(v, ol, hDays) {
    var out = { headline: "", lines: [], cls: "wait", warn: [] };
    if (!v || !v.ok || !ol) { out.headline = "برای جمع‌بندی، سابقه‌ی قیمت (حداقل ۶۰ روز) لازم است."; return out; }
    var up = v.d > 0.25, dn = v.d < -0.25, hi = v.conf >= 0.7, mid = v.conf >= 0.4;
    var pp = function (x) { return Math.round(x * 100) + "٪"; };
    var rngTxt = fm(ol.low68) + " تا " + fm(ol.high68);
    if (up) out.headline = (mid ? "متمایل به صعود" : "کمی متمایل به صعود") + " — " + v.confTxt;
    else if (dn) out.headline = (mid ? "متمایل به نزول" : "کمی متمایل به نزول") + " — " + v.confTxt;
    else out.headline = "خنثی / نوسانی؛ جهت روشنی دیده نمی‌شود — " + v.confTxt;
    out.cls = (up && mid) ? "ok" : (dn && mid) ? "h" : "wait";
    var days = hDays || ol.td;
    out.lines.push("مسیر محتمل تا " + days + " روز معاملاتی آینده: قیمت مرکزی حدود " + fm(ol.median) + " (" + (ol.retMed >= 0 ? "+" : "") + (ol.retMed * 100).toFixed(1) + "٪ نسبت به قیمت فعلی)، و با احتمال حدود ۶۸٪ بین " + rngTxt + ".");
    out.lines.push("احتمال اینکه در پایان این بازه بالاتر از قیمت فعلی باشد: " + pp(ol.pUp) + " (۵۰٪ یعنی هیچ برتری).");
    if (up) {
      if (v.res) out.lines.push("سناریوی اصلی: ادامه صعود به‌سمت مقاومت " + fm(v.res) + (v.resP !== null && v.resP !== undefined ? " (احتمال لمس آن در این بازه حدود " + pp(v.resP) + ")" : "") + (v.sup ? "؛ شکسته شدن حمایت " + fm(v.sup) + " این سناریو را باطل می‌کند." : "."));
      else out.lines.push("سناریوی اصلی: ادامه صعود؛ مقاومت نزدیکی روی نمودار دیده نمی‌شود" + (v.sup ? "؛ شکسته شدن حمایت " + fm(v.sup) + " این سناریو را باطل می‌کند." : "."));
    } else if (dn) {
      if (v.sup) out.lines.push("سناریوی اصلی: ادامه نزول به‌سمت حمایت " + fm(v.sup) + (v.supP !== null && v.supP !== undefined ? " (احتمال لمس آن در این بازه حدود " + pp(v.supP) + ")" : "") + (v.res ? "؛ عبور بالای مقاومت " + fm(v.res) + " این سناریو را باطل می‌کند." : "."));
      else out.lines.push("سناریوی اصلی: ادامه نزول؛ حمایت نزدیکی روی نمودار دیده نمی‌شود" + (v.res ? "؛ عبور بالای مقاومت " + fm(v.res) + " این سناریو را باطل می‌کند." : "."));
    } else {
      out.lines.push("سناریوی اصلی: حرکت در یک دامنه" + (v.sup && v.res ? " بین حمایت " + fm(v.sup) + " و مقاومت " + fm(v.res) : "") + "؛ شکست هرکدام می‌تواند جهت بعدی را مشخص کند.");
    }
    if (v.range) out.lines.push("ADX " + (v.adx !== null && v.adx !== undefined ? Math.round(v.adx) : "—") + " است؛ روند ضعیف و بازار نوسانی است و سیگنال‌های روندی کم‌اعتبارتر می‌شوند.");
    if (v.fin) {
      var f = v.fin;
      out.lines.push("بنیاد: امتیاز مالی " + f.score + " از ۱۰۰ (" + f.verdict + ")" + (f.pe ? "، P/E " + f.pe.toFixed(1) + (f.peSec ? " در برابر صنعت " + f.peSec : "") : "") + ". " + (f.d > 0.2 && up ? "بنیاد با دید نمودار هم‌جهت است." : f.d < -0.2 && up ? "هشدار: نمودار صعودی است ولی بنیاد ضعیف؛ صعود شکننده‌تر است." : f.d > 0.2 && dn ? "نمودار نزولی است ولی بنیاد قوی؛ افت می‌تواند فرصت یا اصلاح موقت باشد، نه لزوماً شروع روند نزولی بلند." : f.d < -0.2 && dn ? "بنیاد ضعیف نزول را تقویت می‌کند." : "اثر بنیاد در افق کوتاه محدود است."));
      f.bad.slice(0, 2).forEach(function (t) { out.warn.push(t); });
    } else {
      out.lines.push("اطلاعات مالی این سهم ثبت نشده؛ در تب «🏦 مالی» جدول‌ها را بخوان تا بنیاد هم در جمع‌بندی بیاید.");
    }
    if (v.divergence) out.lines.push(v.divergence);
    if (v.warn && v.warn.length) v.warn.forEach(function (t) { out.warn.push(t); });
    return out;
  }

  // ---------- ارزیابی یک گزینه (خرید یا فروش) زیر توزیع مدل ----------
  // o: {type, strike, cal_days/tdov, ask, bid, vol_o, last}  mode: call|put|scall|sput
  function evalCand(mode, o, S, sigma, m, st, hv) {
    var sell = mode === "scall" || mode === "sput", call = mode === "call" || mode === "scall";
    var K = o.strike, td = o.td, fo = st.fee_opt, fe = st.fee_ex, fs = st.fee_sell;
    var xs = dist(S, sigma, td, m), n = xs.length, i;
    var C = { mode: mode, sell: sell, call: call, K: K, td: td, ask: o.ask, bid: o.bid, hard: [], warn: [] };
    C.spread = (o.ask > 0 && o.bid >= 0) ? (o.ask - o.bid) / o.ask : null;
    C.vol_o = o.vol_o;
    C.moneyness = call ? S / K - 1 : K / S - 1;                 // مثبت = در سود (ITM)
    C.fair = OC.fairValue(call, S, K, sigma, td);               // ارزش تئوری با نوسان تاریخی، بدون نظر
    var mid = (o.ask > 0 && o.bid > 0) ? (o.ask + o.bid) / 2 : (o.last > 0 ? o.last : null);
    C.iv = mid ? impliedVol(call, S, K, mid, td) : null;
    C.ivRatio = (C.iv && hv) ? C.iv / hv : null;
    var intr = Math.max(call ? S - K : K - S, 0);
    // پرداخت در سررسید برای یک توزیع (σ دلخواه)؛ نتیجه: امید، انحراف معیار، دم ریسک ۵٪ (فقط فروشنده)
    function moments(sg) {
      var X = sg === sigma ? xs : dist(S, sg, td, m), P = new Array(n), e = 0, e2 = 0, k;
      for (k = 0; k < n; k++) {
        P[k] = sell ? (call ? Math.max(X[k] - K, 0) : Math.max(K - X[k], 0))
          : (call ? Math.max(X[k] * (1 - fs) - K * (1 + fe), 0) : Math.max(K * (1 - fs) - X[k] * (1 + fe), 0));
        e += WG[k] * P[k]; e2 += WG[k] * P[k] * P[k];
      }
      var tail = 0;
      if (sell) {   // میانگین پرداخت در بدترین ۵٪ سناریو برای فروشنده
        var acc = 0, need = 0.05;
        for (k = 0; k < n && acc < need; k++) {
          var idx = call ? n - 1 - k : k, w = Math.min(WG[idx], need - acc);
          tail += w * P[idx]; acc += w;
        }
        tail /= need;
      }
      return { P: P, E: e, sd: Math.sqrt(Math.max(e2 - e * e, 0)), tail: tail };
    }
    var M0 = moments(sigma), pay = M0.P, E = M0.E, sd = M0.sd;
    if (!sell) {
      if (!(o.ask > 0)) C.hard.push("بهترین قیمت فروش (ask) ندارد؛ نمی‌شود خرید");
      var c = (o.ask > 0 ? o.ask : 0) * (1 + fo);
      var Ml = moments(sigma * 0.8);                                // آزمون استرس: نوسان کمتر به ضرر خریدار است
      C.cost = c; C.E = E; C.edge = E - c; C.sd = sd;
      C.edgeW = Math.min(C.edge, Ml.E - c);
      C.sharpe = sd > 0 ? C.edgeW / sd : 0;
      C.roi = c > 0 ? E / c - 1 : null;
      var pp = 0; for (i = 0; i < n; i++) if (pay[i] > c) pp += WG[i];
      C.pProfit = pp;
      C.be = call ? (c + K * (1 + fe)) / (1 - fs) : (K * (1 - fs) - c) / (1 + fe);
      C.beMove = call ? C.be / S - 1 : 1 - C.be / S;
      C.tvp = o.ask > 0 ? Math.max(o.ask - intr, 0) / o.ask : null;
      C.rich = C.fair > 0 && o.ask > 0 ? o.ask / C.fair : null;
      C.pAny = 0; for (i = 0; i < n; i++) if (pay[i] > 0) C.pAny += WG[i];
      if (C.tvp !== null && C.tvp > st.tvmax) C.warn.push("سهم ارزش زمانی از قیمت " + Math.round(C.tvp * 100) + "٪ است (بیشتر از حد " + Math.round(st.tvmax * 100) + "٪)");
    } else {
      if (!(o.bid > 0)) C.hard.push("بهترین قیمت خرید (bid) ندارد؛ نمی‌شود فروخت");
      var pn = (o.bid > 0 ? o.bid : 0) * (1 - fo);
      var Mh = moments(sigma * 1.3);                                // آزمون استرس: نوسان بیشتر به ضرر فروشنده است
      var base = call ? S : K;
      C.premium = pn; C.E = E; C.edge = pn - E; C.sd = sd;
      C.edgeW = Math.min(C.edge, pn - Mh.E);
      C.tailLoss = Math.max(M0.tail - pn, 0);                       // زیان میانگین در بدترین ۵٪ سناریو
      var risk = Math.max(sd, C.tailLoss, 1e-9);
      C.sharpe = C.edgeW / risk;
      C.yield = pn / base; C.monthly = C.yield * 21 / Math.max(td, 1);
      var pl = 0, pa = 0; for (i = 0; i < n; i++) { if (pay[i] > pn) pl += WG[i]; if (pay[i] > 0) pa += WG[i]; }
      C.pLoss = pl; C.pAssign = pa;
      C.be = call ? K + pn : K - pn;
      C.cushion = call ? C.be / S - 1 : 1 - C.be / S;            // فاصله سهم تا سر به سر فروشنده
      C.rich = C.fair > 0 && o.bid > 0 ? o.bid / C.fair : null;
      if (pl > st.assign) C.warn.push("احتمال زیان فروشنده " + Math.round(pl * 100) + "٪ است (بیشتر از حد " + Math.round(st.assign * 100) + "٪)");
      if (C.yield < st.minyield) C.warn.push("بازده پریمیوم " + (C.yield * 100).toFixed(1) + "٪ کمتر از حداقل " + (st.minyield * 100).toFixed(1) + "٪ است");
    }
    if (C.spread !== null && C.spread > st.spread) C.hard.push("اسپرد " + Math.round(C.spread * 100) + "٪ بیشتر از حد مجاز (" + Math.round(st.spread * 100) + "٪)");
    if (o.vol_o !== undefined && o.vol_o !== null && o.vol_o < st.minvol) C.hard.push("میانگین حجم " + Math.round(o.vol_o) + " کمتر از حداقل " + st.minvol);
    if (td < st.mindays) C.hard.push("فقط " + td + " روز معاملاتی تا سررسید (حداقل " + st.mindays + ")");
    var lf = (o.vol_o !== undefined && o.vol_o !== null && st.minvol > 0) ? clamp(o.vol_o / (3 * st.minvol), 0.5, 1) : 1;
    C.score = C.sharpe > 0 ? C.sharpe * lf : C.sharpe;
    C.ok = C.hard.length === 0;
    return C;
  }

  function pminProfit(st) { // حداقل احتمال سودآوری برای خریدار؛ با ریسک‌پذیری آسان‌تر می‌شود
    var a = clamp(st.risk || 5, 1, 10);
    return a <= 5 ? 0.35 + (0.25 - 0.35) * (a - 1) / 4 : 0.25 + (0.15 - 0.25) * (a - 5) / 5;
  }

  // ---------- مشخصات ایده‌آل: جستجو در همه‌ی قیمت‌های اعمال ممکن با قیمت‌گذاری هم‌سطح بازار ----------
  function idealFor(mode, S, sigma, kview, st, expiries, ivM, halfSpread, fLo, fHi) {
    var sell = mode === "scall" || mode === "sput", call = mode === "call" || mode === "scall";
    var best = null, all = [], minPrice = S * 0.003, pmin = pminProfit(st);
    expiries.forEach(function (td) {
      var m = kview * Math.sqrt(Math.min(td, 20)) * sigma;
      for (var f = fLo; f <= fHi + 1e-9; f += 0.01) {
        var K = S * f, fv = OC.fairValue(call, S, K, ivM, td);
        if (!(fv > minPrice)) continue;
        var o = { strike: K, td: td, ask: fv * (1 + halfSpread), bid: fv * (1 - halfSpread), vol_o: null };
        var C = evalCand(mode, o, S, sigma, m, st, sigma);
        C.hard = []; C.ok = true;
        var pass = sell ? (C.pLoss <= st.assign && C.yield >= st.minyield) : (C.pProfit >= pmin);
        C.pass = pass; C.f = f;
        all.push(C);
        if (!best || (pass && !best.pass) || (pass === best.pass && C.score > best.score)) best = C;
      }
    });
    if (!best) return null;
    var band = all.filter(function (x) { return x.td === best.td && x.pass === best.pass && x.score >= best.score * 0.85 && x.score > 0; });
    var Ks = band.map(function (x) { return x.K; });
    return { K: best.K, f: best.f, td: best.td, score: best.score, noEdge: !(best.score > 0), pass: best.pass, price: sell ? best.bid : best.ask, Klo: Ks.length ? Math.min.apply(null, Ks) : best.K, Khi: Ks.length ? Math.max.apply(null, Ks) : best.K, cand: best, pmin: pmin };
  }

  var MODE_LABEL = { call: "خرید Call", put: "خرید Put", scall: "فروش Call", sput: "فروش Put" };

  // ---------- مشاور اصلی ----------
  // ctx: { S, an, stockInp, stockSt, optSt, chain:[...], own:boolean, k:number }
  function advise(ctx) {
    var S = num(ctx.S), out = { ok: false, notes: [], MODE_LABEL: MODE_LABEL };
    var st = OC.effective(ctx.optSt || {});
    out.st = st;
    var view = stockView(ctx.an, S, ctx.stockSt, ctx.stockInp, ctx.fin || null);
    out.view = view;
    if (!(S > 0)) { out.notes.push("قیمت سهم پایه خوانده نشد"); return out; }
    if (!view.sigma) { out.notes.push("سابقه قیمت سهم برای محاسبه نوسان کافی نیست"); return out; }
    var sigma = view.sigma, kf = ctx.k === undefined ? 0.5 : ctx.k;
    var kview = view.ok ? kf * view.d * view.conf : 0;            // انحراف میانه‌ی قیمت به‌ازای هر √روز نوسان
    out.kview = kview;
    var chain = (ctx.chain || []).map(function (o) {
      var x = Object.assign({}, o);
      x.td = tdOf(o);
      return x;
    }).filter(function (o) { return o.td > 0 && o.strike > 0; });
    if (!chain.length) { out.notes.push("زنجیره‌ی اختیارها خالی است"); out.view = view; return out; }

    var cands = [];
    chain.forEach(function (o) {
      var m = kview * Math.sqrt(Math.min(o.td, 20)) * sigma;
      var modes = o.type === "call" ? ["call", "scall"] : ["put", "sput"];
      modes.forEach(function (md) {
        if (md === "scall" && !ctx.own) return;
        var C = evalCand(md, o, S, sigma, m, st, sigma);
        C.o = o; C.insCode = o.insCode; C.sym = o.sym; C.name = o.name; C.type = o.type;
        C.strike = o.strike; C.jy = o.jy; C.jm = o.jm; C.jd = o.jd; C.cal = o.cal_days;
        cands.push(C);
      });
    });
    // نوسان ضمنی ATM
    var ivs = cands.filter(function (c) { return c.iv && Math.abs(c.K / S - 1) < 0.07 && c.td >= st.mindays && c.spread !== null && c.spread < 0.25; }).map(function (c) { return c.iv; });
    if (ivs.length < 2) ivs = cands.filter(function (c) { return c.iv; }).map(function (c) { return c.iv; });
    out.hv = sigma;
    out.ivAtm = median(ivs);
    out.ivRatio = out.ivAtm ? out.ivAtm / sigma : null;
    out.priceTxt = out.ivRatio === null ? "نامشخص" : out.ivRatio > 1.25 ? "گران (نوسان ضمنی بیش از نوسان تاریخی)" : out.ivRatio < 0.85 ? "ارزان (نوسان ضمنی کمتر از نوسان تاریخی)" : "نزدیک به ارزش تئوری";

    var byMode = { call: [], put: [], scall: [], sput: [] };
    cands.forEach(function (c) { byMode[c.mode].push(c); });
    Object.keys(byMode).forEach(function (k) { byMode[k].sort(function (a, b) { return (b.ok - a.ok) || (b.score - a.score); }); });
    out.byMode = byMode; out.cands = cands;
    out.modes = Object.keys(byMode).map(function (k) {
      var list = byMode[k], top = list.filter(function (c) { return c.ok; })[0] || null;
      return { mode: k, label: MODE_LABEL[k], n: list.length, nOk: list.filter(function (c) { return c.ok; }).length, top: top, score: top ? top.score : null, skipped: (k === "scall" && !ctx.own) };
    });
    var avail = out.modes.filter(function (x) { return x.top && !x.skipped; }).sort(function (a, b) { return b.score - a.score; });
    out.best = avail.length ? avail[0] : null;
    out.second = avail.length > 1 ? avail[1] : null;
    if (out.best) {
      var sc = out.best.score;
      out.strength = sc >= 0.10 ? "برتری قابل‌توجه (طبق مدل)" : sc >= 0.04 ? "برتری کم" : "برتری روشنی دیده نمی‌شود؛ ورود با عجله لازم نیست";
      out.strong = sc >= 0.04;
    }

    // مشخصات ایده‌آل برای بهترین حالت (و بقیه حالت‌ها برای مقایسه)
    var expiries = [], seen = {};
    chain.forEach(function (o) { if (o.td >= st.mindays && !seen[o.td]) { seen[o.td] = 1; expiries.push(o.td); } });
    expiries.sort(function (a, b) { return a - b; });
    var sp = cands.filter(function (c) { return c.spread !== null && c.spread < 0.3 && c.ok; }).map(function (c) { return c.spread; });
    var half = clamp((median(sp) || 0.04) / 2, 0.01, 0.08);
    var ivM = out.ivAtm || sigma;
    out.ideal = {};
    var fs_ = chain.map(function (o) { return o.strike / S; });
    var fLo = Math.max(0.6, Math.floor(Math.min.apply(null, fs_) * 100) / 100), fHi = Math.min(1.5, Math.ceil(Math.max.apply(null, fs_) * 100) / 100);
    if (expiries.length) {
      ["call", "put", "scall", "sput"].forEach(function (md) {
        if (md === "scall" && !ctx.own) return;
        var id = idealFor(md, S, sigma, kview, st, expiries, ivM, half, fLo, fHi);
        if (!id) return;
        // نزدیک‌ترین اختیار واقعی به ایده‌آل (هم‌سررسید، فاصله قیمت اعمال به واحد نوسان)
        var sg = sigma * Math.sqrt(id.td), real = byMode[md].filter(function (c) { return c.ok; });
        var near = null;
        real.forEach(function (c) {
          var d = Math.abs(Math.log(c.K / id.K)) / sg + (Math.abs(c.td - id.td) <= 3 ? 0 : 1.5);
          c.dist = d;
          if (!near || d < near.dist) near = c;
        });
        id.nearest = near;
        id.rankOfNearest = near ? byMode[md].filter(function (c) { return c.ok; }).indexOf(near) + 1 : null;
        out.ideal[md] = id;
      });
    }
    out.ok = true;
    return out;
  }

  var api = { advise: advise, stockView: stockView, finView: finView, outlook: outlook, narrative: narrative, holdAdvice: holdAdvice, simplePlan: simplePlan, evalCand: evalCand, impliedVol: impliedVol, MODE_LABEL: MODE_LABEL, dist: dist };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OptAdvisor = api;
})(typeof self !== "undefined" ? self : this);
