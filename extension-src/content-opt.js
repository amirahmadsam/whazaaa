/* پنل شناور چک‌لیست اختیار معامله */
(function () {
  "use strict";
  var OC = window.OptionChecklist, OCC = window.OCCollect;
  if (!OC || !OCC) return;

  // ---- انتخاب متن: فریم‌های داخلی، متن انتخاب‌شده را به فریم اصلی می‌فرستند
  var lastSel = "";
  function selText() {
    try { return String(window.getSelection() || "").trim(); } catch (e) { return ""; }
  }
  if (window.top !== window) {
    document.addEventListener("selectionchange", function () {
      var t = selText();
      if (t) { try { window.top.postMessage({ __ocSel: t }, "*"); } catch (e) {} }
    });
    return;
  }
  if (window.__ocLoaded) return;
  window.__ocLoaded = true;
  window.addEventListener("message", function (e) {
    if (e.data && typeof e.data.__ocSel === "string") lastSel = e.data.__ocSel;
  });
  document.addEventListener("selectionchange", function () {
    var t = selText();
    if (t) lastSel = t;
  });

  // ---- ذخیره‌سازی (chrome.storage یا localStorage)
  var store = {
    get: function (k, cb) {
      try {
        if (window.chrome && chrome.storage && chrome.storage.local) {
          var kk = "O." + k;
          chrome.storage.local.get(kk, function (r) { cb(r && r[kk]); });
          return;
        }
      } catch (e) {}
      try { cb(JSON.parse(localStorage.getItem("oc:" + k))); } catch (e) { cb(null); }
    },
    set: function (k, v) {
      try {
        if (window.chrome && chrome.storage && chrome.storage.local) { var o = {}; o["O." + k] = v; chrome.storage.local.set(o); return; }
      } catch (e) {}
      try { localStorage.setItem("oc:" + k, JSON.stringify(v)); } catch (e) {}
    },
  };

  // ---- اعداد فارسی و ورودی
  function toLatin(s) {
    return String(s)
      .replace(/[۰-۹]/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹".indexOf(d); })
      .replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); })
      .replace(/[٬,،]/g, "").replace(/٫/g, ".");
  }
  function parseNum(s) {
    var t = toLatin(s).replace(/[^\d.\-]/g, "");
    if (t === "" || t === "-" || t === ".") return null;
    var v = Number(t);
    return isFinite(v) ? v : null;
  }

  // ---- تعریف فیلدها
  var STEPS = [
    { n: 0, title: "مشخصات" },
    { n: 1, title: "سهم پایه" },
    { n: 2, title: "بازار اختیار" },
    { n: 3, title: "قیمت و زمان" },
    { n: 4, title: "سود و زیان" },
    { n: 5, title: "اندازه معامله" },
    { n: 6, title: "برنامه خروج" },
  ];
  function isSell(m) { return m === "scall" || m === "sput"; }
  var MODE_LABEL = { call: "خرید Call", put: "خرید Put", scall: "فروش Call", sput: "فروش Put" };
  // a: در هر چهار حالت | sellOnly: فقط فروش | putOnly: فقط خرید Put | بقیه: فقط خرید
  var FIELDS = [
    { k: "capital", step: 0, a: 1, t: "num", l: "سرمایه کل من برای بورس (ریال)", sel: 0 },
    { k: "name_o", step: 0, a: 1, t: "text", l: "نماد اختیار" },
    { k: "S", step: 0, a: 1, t: "num", l: "آخرین معامله سهم پایه (ریال)", sel: 1 },
    { k: "K", step: 0, a: 1, t: "num", l: "قیمت اعمال (ریال)", sel: 1 },
    { k: "ask", step: 0, a: 1, t: "num", sel: 1, l: function (m) { return isSell(m) ? "بهترین قیمت فروش اختیار — قیمتی که فروشنده‌ها می‌خواهند (ریال)" : "بهترین قیمت فروش اختیار — قیمتی که می‌خری (ریال)"; } },
    { k: "bid", step: 0, a: 1, t: "num", sel: 1, l: function (m) { return isSell(m) ? "بهترین قیمت خرید اختیار — قیمتی که اگر همین الان بفروشی می‌گیری (ریال)" : "بهترین قیمت خرید اختیار — قیمتی که می‌فروشی (ریال)"; } },
    { k: "cal_days", step: 0, a: 1, t: "num", l: "روز تقویمی تا سررسید", sel: 1 },
    { k: "tdov", step: 0, a: 1, t: "num", l: "روز معاملاتی تا سررسید (اختیاری، دقیق‌تر)", sel: 1 },
    { k: "q_thesis", step: 1, t: "yn", l: "دلیل مشخص و مکتوب برای حرکت سهم دارم" },
    { k: "q_ok", step: 1, sellOnly: 1, t: "yn", l: function (m) { return m === "scall" ? "حاضرم سهم را به قیمت اعمال بفروشم (و از سود بیشتر سهم بگذرم)" : "حاضرم سهم را به قیمت اعمال بخرم و نگه دارم"; } },
    { k: "q_halt", step: 1, a: 1, t: "yn", l: "سهم پایه الان معامله می‌شود (بسته/متوقف نیست)" },
    { k: "q_queue", step: 1, a: 1, t: "yn", l: "سهم الان در صف قفل سقف/کف است؟" },
    { k: "q_event", step: 1, a: 1, t: "yn", l: "تا سررسید رویداد مهم (مجمع، سود، افزایش سرمایه) دارد؟" },
    { k: "val_u", step: 1, a: 1, t: "num", l: "میانگین ارزش معاملات روزانه سهم پایه (میلیارد ریال)", sel: 1 },
    { k: "vol_o", step: 2, a: 1, t: "num", l: "میانگین حجم روزانه این اختیار (قرارداد)", sel: 1 },
    { k: "T", step: 3, t: "num", l: "قیمت هدف سهم پایه تا سررسید (ریال)", sel: 1 },
    { k: "p", step: 4, t: "pct", l: "احتمال واقع‌بینانه رسیدن سهم به هدف (٪)" },
    { k: "sellp", step: 4, sellOnly: 1, t: "num", l: "قیمتی که می‌خواهم بفروشم (ریال) — خالی = بهترین قیمت خرید" },
    { k: "qty", step: 5, a: 1, t: "num", sel: 1, l: function (m) { return isSell(m) ? "تعداد قراردادی که می‌خواهم بفروشم" : "تعداد قراردادی که می‌خواهم بخرم"; } },
    { k: "bidvol", step: 5, t: "num", l: "حجم صف خرید در بهترین قیمت خرید (قرارداد)", sel: 1 },
    { k: "q_own", step: 5, t: "yn", l: "به اندازه کافی سهم پایه دارم که اعمال کنم", putOnly: true },
    { k: "q_cover", step: 5, sellOnly: 1, t: "yn", l: function (m) { return m === "scall" ? "سهم پایه را به اندازه همه قراردادها دارم (Covered)" : "نقدینگی کامل برای خرید سهم در صورت اعمال را دارم"; } },
    { k: "q_plan", step: 6, a: 1, t: "yn", l: function (m) { return isSell(m) ? "قیمت بازخرید (حد ضرر و حد سود) و زمان تصمیم را نوشتم و اجرا می‌کنم" : "حد ضرر، حد سود و زمان خروج را نوشتم و اجرا می‌کنم"; } },
    { k: "q_lock", step: 6, a: 1, t: "yn", l: function (m) { return isSell(m) ? "می‌دانم اگر سهم قفل شود ممکن است نتوانم اختیار را بخرم و ببندم و می‌پذیرم" : "می‌دانم اگر سهم قفل شود ممکن است نتوانم بفروشم و می‌پذیرم"; } },
    { k: "q_zero", step: 6, a: 1, t: "yn", l: function (m) {
      if (m === "scall") return "می‌پذیرم اگر سهم بالا برود سود بیشتر را از دست بدهم و سهمم به قیمت اعمال فروخته شود";
      if (m === "sput") return "می‌پذیرم اگر سهم بریزد باید به قیمت اعمال بخرم و ضرر کنم";
      return "می‌پذیرم کل پول خرید ممکن است صفر شود"; } },
  ];
  function fieldShown(f, m) {
    if (f.putOnly) return m === "put";
    if (f.sellOnly) return isSell(m);
    if (f.a) return true;
    return !isSell(m);
  }
  function fieldLabel(f, m) { return typeof f.l === "function" ? f.l(m) : f.l; }

  var STATE = { type: "call", inp: {}, st: {}, an: null, open: { 0: true }, collapsed: true, showSettings: false, showThr: false, riskOpen: true, view: "main", cmp: [], vdetOpen: false };
  function legacyKey() { return "draft:" + location.origin + location.pathname + location.search; }
  function keyNow() { var c = OCC.insCodeFromUrl(location.href); return c ? "draft:code:" + c : legacyKey(); }
  var pageKey = keyNow();
  // خواندن با انتقال از کلید قدیمی (بر اساس نشانی صفحه)
  function getDraft(key, cb) {
    store.get(key, function (d) {
      if (d || key === legacyKey()) { cb(d); return; }
      store.get(legacyKey(), function (d2) { if (d2) store.set(key, d2); cb(d2); });
    });
  }

  // ---- فرمت
  function fmt(v, f) {
    if (v === null || v === undefined || (typeof v === "number" && !isFinite(v))) return "—";
    switch (f) {
      case "money": return Math.round(v).toLocaleString("en-US");
      case "int": return String(Math.round(v));
      case "pct0": return (v * 100).toFixed(0) + "٪";
      case "pct1": return (v * 100).toFixed(1) + "٪";
      case "pct2": return (v * 100).toFixed(2) + "٪";
      case "ratio1": return v.toFixed(1) + "×";
      case "ratio2": return v.toFixed(2);
      default: return String(v);
    }
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ---- ظاهر
  var host = document.createElement("div");
  host.id = "oc-checklist-host";
  host.style.cssText = "all:initial;position:fixed;top:12px;left:12px;z-index:2147483647;";
  var root = host.attachShadow({ mode: "open" });
  root.innerHTML =
    '<style>' +
    ':host{all:initial}' +
    '*{box-sizing:border-box;font-family:inherit}' +
    '.panel{' +
    '  --bg:#ffffff;--bg2:#f5f6fb;--fg:#1c2236;--mut:#6a7390;--line:#e7eaf3;--inp:#f1f3f9;--inpf:#ffffff;' +
    '  --acc:#4f46e5;--acc2:#eceeff;--accfg:#ffffff;' +
    '  --ok-bg:#e7f7ee;--ok-fg:#0d6b3b;--bad-bg:#fdebee;--bad-fg:#a3162d;--warn-bg:#fff5dc;--warn-fg:#8a5a00;--wait-bg:#eef0f6;--wait-fg:#59627c;' +
    '  --shadow:0 12px 40px rgba(24,28,60,.22),0 2px 8px rgba(24,28,60,.08);' +
    '  direction:rtl;width:min(560px,96vw);max-height:92vh;display:flex;flex-direction:column;' +
    '  background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);' +
    '  font-size:12.5px;line-height:1.6;overflow:hidden;' +
    '  font-family:"Vazirmatn","Shabnam","Sahel","IBM Plex Sans Arabic","SF Arabic","Segoe UI",system-ui,-apple-system,"Noto Sans Arabic",Tahoma,sans-serif;' +
    '}' +
    '@media (prefers-color-scheme:dark){.panel{' +
    '  --bg:#171b29;--bg2:#10131e;--fg:#e8ebf7;--mut:#98a1be;--line:#2a3047;--inp:#20253a;--inpf:#262c45;' +
    '  --acc:#8b87ff;--acc2:#262a52;--accfg:#12142a;' +
    '  --ok-bg:#12331f;--ok-fg:#7be0a4;--bad-bg:#3a1520;--bad-fg:#ff9aab;--warn-bg:#3a2d10;--warn-fg:#ffd27a;--wait-bg:#232842;--wait-fg:#aab2cf;' +
    '  --shadow:0 12px 40px rgba(0,0,0,.55)}}' +
    'button{cursor:pointer;font-family:inherit}' +
    '.hd{background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;padding:11px 14px;display:flex;align-items:center;gap:6px;cursor:move;user-select:none}' +
    '.hd b{flex:1;font-size:14px;font-weight:700;letter-spacing:.1px}' +
    '.hd button{background:rgba(255,255,255,.18);color:#fff;border:0;border-radius:9px;width:28px;height:28px;font-size:14px;display:grid;place-items:center;padding:0;transition:background .15s}' +
    '.hd button:hover{background:rgba(255,255,255,.32)}' +
    '.verdict{margin:8px 12px 0;padding:9px 12px;font-weight:700;font-size:14px;text-align:center;border-radius:12px;transition:background .2s,color .2s}' +
    '.v-ok{background:var(--ok-bg);color:var(--ok-fg)}.v-bad{background:var(--bad-bg);color:var(--bad-fg)}.v-warn{background:var(--warn-bg);color:var(--warn-fg)}.v-wait{background:var(--wait-bg);color:var(--wait-fg)}' +
    '.tabs{display:flex;gap:3px;background:var(--inp);border-radius:11px;padding:3px;margin:8px 12px 0}' +
    '.tabs button{flex:1;padding:7px 4px;border:0;border-radius:9px;background:transparent;color:var(--mut);font-size:12.5px;font-weight:600;transition:all .15s}' +
    '.tabs button.on{background:var(--bg);color:var(--acc);box-shadow:0 1px 4px rgba(24,28,60,.14)}' +
    '.risk{margin:0 12px 8px;border:1px solid var(--line);border-radius:14px;background:var(--bg);overflow:hidden}' +
    '.risk .rh{display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:pointer;font-weight:700}' +
    '.risk .rh:hover{background:var(--bg2)}' +
    '.risk .rh .num{flex:none;width:23px;height:23px;border-radius:50%;background:var(--acc2);display:grid;place-items:center;font-size:12px}' +
    '.risk .rh .tt{flex:1;font-size:12.5px}' +
    '.risk .rh .rl{color:var(--acc);font-size:12px}' +
    '.risk .rh .cnt{background:var(--acc);color:var(--accfg);border-radius:99px;padding:0 7px;font-size:10.5px}' +
    '.risk .rh::after{content:"‹";color:var(--mut);font-size:16px;transition:transform .2s;transform:rotate(-90deg)}' +
    '.risk.open .rh::after{transform:rotate(90deg)}' +
    '.risk .rbody{display:none;padding:0 12px 11px;border-top:1px solid var(--line)}.risk.open .rbody{display:block}' +
    '.thr .tg{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px 10px}' +
    '.thr .trow{flex-direction:column;align-items:stretch;border-top:0;padding:0;gap:3px}' +
    '.thr .trow label{font-size:11px;color:var(--mut)}.thr .ir{display:flex;gap:4px}.thr .ir input{flex:1;width:auto}' +
    '.sc .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 10px;align-items:end}.sc .grid .full{grid-column:1/-1}' +
    '.risk .rt{display:flex;justify-content:space-between;align-items:baseline;font-weight:700;font-size:12.5px}' +
    '.risk .rt .rl{color:var(--acc);font-weight:700}' +
    '.risk input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:7px;border-radius:99px;direction:ltr;margin:11px 0 5px;outline:none;background:linear-gradient(90deg,#22c55e,#eab308 55%,#ef4444)}' +
    '.risk input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:#fff;border:3px solid var(--acc);box-shadow:0 2px 6px rgba(0,0,0,.3);cursor:grab}' +
    '.risk input[type=range]::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid var(--acc)}' +
    '.risk .ends{display:flex;justify-content:space-between;direction:ltr;font-size:10.5px;color:var(--mut)}' +
    '.risk .rs{font-size:11px;color:var(--mut);line-height:1.8;margin-top:6px}' +
    '.thr-t{margin-top:8px;width:100%;display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border:1px dashed var(--line);border-radius:10px;background:var(--bg);color:var(--acc);font-size:12px;font-weight:600}' +
    '.thr-t:hover{background:var(--acc2)}' +
    '.thr-t .cnt{background:var(--acc);color:var(--accfg);border-radius:99px;padding:0 7px;font-size:10.5px;margin-inline-start:6px}' +
    '.body{overflow:auto;flex:1;padding:8px 0 2px;margin-top:4px}' +
    '.thr{margin:0 12px 10px;padding:8px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:13px}' +
    '.thr .hint{font-size:11px;color:var(--mut);margin:0 0 6px;line-height:1.8}' +
    '.trow{display:flex;align-items:center;gap:6px;padding:4px 0;border-top:1px solid var(--line)}' +
    '.trow:first-of-type{border-top:0}' +
    '.trow label{flex:1;font-size:11.5px;color:var(--fg)}' +
    '.trow input{width:74px;padding:5px 6px;border:1.5px solid transparent;background:var(--inp);color:var(--mut);border-radius:8px;direction:ltr;text-align:center;font-size:12px;font-variant-numeric:tabular-nums;outline:none}' +
    '.trow input.man{color:var(--fg);font-weight:700;border-color:var(--acc);background:var(--inpf)}' +
    '.trow input:focus{border-color:var(--acc);background:var(--inpf);color:var(--fg)}' +
    '.trow .rst{width:22px;height:22px;border:0;border-radius:7px;background:var(--acc2);color:var(--acc);font-size:13px;padding:0;visibility:hidden}' +
    '.trow .rst.show{visibility:visible}' +
    '.thr .all{width:100%;margin-top:6px;padding:6px;border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:9px;font-size:11.5px}' +
    '.step{margin:0 12px 7px;border:1px solid var(--line);border-radius:14px;background:var(--bg);overflow:hidden}' +
    '.step>.sh{display:flex;align-items:center;gap:8px;padding:9px 10px;cursor:pointer;font-weight:700;color:var(--fg)}' +
    '.step>.sh:hover{background:var(--bg2)}' +
    '.step>.sh .num{flex:none;width:23px;height:23px;border-radius:50%;background:var(--acc2);color:var(--acc);display:grid;place-items:center;font-size:11.5px}' +
    '.step>.sh .tt{flex:1;font-size:12.5px}' +
    '.step>.sh .badge{font-size:14px}' +
    '.step>.sh::after{content:"‹";color:var(--mut);font-size:16px;transition:transform .2s;transform:rotate(-90deg)}' +
    '.step.open>.sh::after{transform:rotate(90deg)}' +
    '.sc{padding:2px 12px 10px;display:none;border-top:1px solid var(--line)}.step.open .sc{display:block}' +
    '.fld{margin:7px 0 0}.fld label{display:block;overflow-wrap:anywhere;color:var(--mut);margin-bottom:4px;font-size:11.5px}' +
    '.fld .ctl{display:flex;gap:6px}' +
    '.fld input{flex:1;min-width:0;padding:8px 10px;border:1.5px solid transparent;background:var(--inp);border-radius:10px;font-size:13px;color:var(--fg);direction:ltr;text-align:center;font-variant-numeric:tabular-nums;outline:none;transition:border-color .15s,background .15s}' +
    '.fld input.txt{direction:rtl;text-align:right}' +
    '.fld input:focus{border-color:var(--acc);background:var(--inpf)}' +
    '.fld button.pick{border:0;background:var(--acc2);color:var(--acc);border-radius:10px;padding:0 11px;font-size:15px;transition:background .15s}' +
    '.fld button.pick:hover{filter:brightness(.95)}' +
    '.yn{display:flex;gap:4px;background:var(--inp);padding:3px;border-radius:10px}' +
    '.yn button{flex:1;padding:6px;border:0;border-radius:8px;background:transparent;color:var(--mut);font-size:12.5px;font-weight:600;transition:all .15s}' +
    '.yn button.on[data-v="بله"]{background:var(--ok-bg);color:var(--ok-fg)}' +
    '.yn button.on[data-v="خیر"]{background:var(--bad-bg);color:var(--bad-fg)}' +
    '.calc{margin-top:10px;background:var(--bg2);border-radius:10px;padding:2px 10px}' +
    '.calc:empty{display:none}' +
    '.cr{display:flex;justify-content:space-between;gap:8px;padding:5px 0;font-size:11.5px;border-top:1px solid var(--line)}' +
    '.cr:first-child{border-top:0}' +
    '.cr span:first-child{color:var(--mut)}' +
    '.cr span:last-child{font-weight:700;direction:ltr;white-space:nowrap;font-variant-numeric:tabular-nums}' +
    '.msg{margin:8px 0 0;padding:7px 10px;border-radius:10px;line-height:1.8;font-size:11.5px}' +
    '.msg.h{background:var(--bad-bg);color:var(--bad-fg)}.msg.w{background:var(--warn-bg);color:var(--warn-fg)}.msg.ok{background:var(--ok-bg);color:var(--ok-fg)}.msg.wait{background:var(--wait-bg);color:var(--wait-fg)}' +
    '.set{margin:0 12px 10px;padding:10px 12px;background:var(--bg2);border:1px solid var(--line);border-radius:13px}' +
    '.set h4{margin:0 0 6px;font-size:13px}' +
    '.note{margin:0 12px 7px;padding:6px 10px;font-size:11.5px;color:var(--mut);background:var(--bg2);border-radius:11px;line-height:1.8}' +
    '.set .note{margin:0 0 6px;padding:0;background:none}' +
    '.rep{margin:0 12px 9px;padding:8px 11px;font-size:11.5px;line-height:1.8;background:var(--bg2);border-radius:11px}' +
    '.rep:empty{display:none}' +
    '.rep .o{color:var(--ok-fg)}.rep .x{color:var(--bad-fg)}.rep .t{color:var(--mut)}' +
    '.usep{margin-top:8px;width:100%;padding:8px;border:0;background:var(--acc);color:var(--accfg);border-radius:10px;font-size:12px;font-weight:600}' +
    '.usep:hover{filter:brightness(1.08)}' +
    '.foot{padding:9px 12px;background:var(--bg);border-top:1px solid var(--line);display:flex;gap:6px}' +
    '.foot button{flex:1;padding:8px 4px;border:1px solid var(--line);background:var(--bg2);color:var(--fg);border-radius:10px;font-size:11.5px;font-weight:600;transition:background .15s}' +
    '.foot button:hover{background:var(--acc2);color:var(--acc)}' +
    '.mini{direction:rtl;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;border:0;border-radius:99px;padding:10px 18px;cursor:pointer;font-size:13px;font-weight:700;box-shadow:0 8px 24px rgba(79,70,229,.45);font-family:"Vazirmatn","Shabnam","Sahel","Segoe UI",system-ui,"Noto Sans Arabic",Tahoma,sans-serif}' +
    '.panel.wide{width:min(560px,96vw)}' +
    '.hd button.wide{width:auto;padding:0 9px;font-size:12px;gap:4px;display:flex;align-items:center}' +
    '.hd button.wide .n{background:#fff;color:#4f46e5;border-radius:99px;padding:0 6px;font-size:10.5px;font-weight:700}' +
    '.foot button.pri{background:var(--acc);color:var(--accfg);border-color:var(--acc)}' +
    '.foot button.pri:hover{filter:brightness(1.1);background:var(--acc);color:var(--accfg)}' +
    '.rk{margin:0 12px 8px;display:flex;flex-direction:column;gap:4px}' +
    '.rk .it{display:flex;gap:8px;align-items:center;padding:7px 10px;border-radius:10px;background:var(--bg2);font-size:12px}' +
    '.rk .it:first-child{border:1.5px solid var(--acc)}' +
    '.rk .it .no{flex:none;width:21px;height:21px;border-radius:50%;background:var(--acc2);color:var(--acc);display:grid;place-items:center;font-weight:700;font-size:11px}' +
    '.rk .it .nm{font-weight:700}.rk .it .mt{margin-inline-start:auto;color:var(--mut);font-size:11px}' +
    '.cmp{margin:0 12px 8px;overflow-x:auto;border:1px solid var(--line);border-radius:12px}' +
    '.cmp table{border-collapse:separate;border-spacing:0;width:100%;font-size:11.5px}' +
    '.cmp th,.cmp td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:center;min-width:104px;white-space:nowrap}' +
    '.cmp td.v{direction:ltr;font-variant-numeric:tabular-nums}' +
    '.cmp th.lab,.cmp td.lab{position:sticky;right:0;background:var(--bg);text-align:right;min-width:170px;z-index:1;color:var(--mut);font-weight:600}' +
    '.cmp tr.grp td{background:var(--bg2);color:var(--acc);font-weight:700;text-align:right;position:static}' +
    '.cmp td.best{background:var(--ok-bg);color:var(--ok-fg);font-weight:700}' +
    '.cmp td.worst{background:var(--bad-bg);color:var(--bad-fg)}' +
    '.cmp th{background:var(--bg);vertical-align:top}.cmp th .nm{font-weight:700;font-size:12.5px}.cmp th .sub{font-size:10px;color:var(--mut);font-weight:400}' +
    '.cmp th .ac{display:flex;justify-content:center;gap:5px;margin-top:4px}' +
    '.cmp th .ac a,.cmp th .ac button{width:22px;height:22px;border:0;border-radius:7px;background:var(--inp);color:var(--mut);display:grid;place-items:center;text-decoration:none;font-size:12px;padding:0}' +
    '.cmp th .ac a:hover,.cmp th .ac button:hover{background:var(--acc2);color:var(--acc)}' +
    '.empty{margin:18px 14px;padding:16px;text-align:center;color:var(--mut);background:var(--bg2);border-radius:12px;line-height:2}' +
    '.legend{margin:0 12px 8px;font-size:11px;color:var(--mut);line-height:1.8}' +
    '.tabs button{font-size:11.5px;padding:7px 2px;white-space:nowrap}' +
    '.tabs button.on.sell{color:#c2410c}' +
    '.sg{margin:0 12px 8px;padding:10px 12px;border:1px solid var(--line);border-radius:14px;background:var(--bg)}' +
    '.sg h5{margin:0 0 6px;font-size:12.5px}' +
    '.sg .big{font-size:22px;font-weight:800;color:var(--acc);direction:ltr;display:inline-block;font-variant-numeric:tabular-nums}' +
    '.sg .line{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-top:1px solid var(--line);font-size:11.5px;line-height:1.7}' +
    '.sg .line.bind{color:var(--acc);font-weight:700}' +
    '.sg .line .vv{direction:ltr;white-space:nowrap;font-variant-numeric:tabular-nums;font-weight:700}' +
    '.sgt{margin:0 12px 8px}.sgt th,.sgt td{min-width:0}.sgt th.lab,.sgt td.lab{min-width:120px}' +
    '.body::-webkit-scrollbar{width:8px}.body::-webkit-scrollbar-thumb{background:var(--line);border-radius:99px}' +
    '</style><div id="mount"></div>';
  document.documentElement.appendChild(host);
  var mount = root.getElementById("mount");
  root.querySelector("style").textContent += (window.AdvisorUI ? window.AdvisorUI.CSS : "");
  var SCC = window.SCCollect, CS = window.ComboStore;

  var STEP_TITLES = function () {
    return ["مرحله ۰ — مشخصات", "مرحله ۱ — سهم پایه", "مرحله ۲ — بازار اختیار", "مرحله ۳ — قیمت و زمان", "مرحله ۴ — سود و زیان", "مرحله ۵ — اندازه معامله", "مرحله ۶ — برنامه خروج"];
  };

  function persist() { store.set(pageKey, { type: STATE.type, inp: STATE.inp, an: STATE.an }); }
  function persistUi() { store.set("ui", { riskOpen: STATE.riskOpen }); }
  function persistSettings() { store.set("settings", STATE.st); }


  // ================= مقایسه اختیارها =================
  var CMP_MAX = 20;
  var SYM_BUY = { "✅": "بخر", "⚠": "فعلاً نخر", "❌": "نخر", "⏳": "ناقص" };
  var SYM_SELL = { "✅": "بفروش", "⚠": "فعلاً نفروش", "❌": "نفروش", "⏳": "ناقص" };
  function symLabel(sym, type) { return (isSell(type) ? SYM_SELL : SYM_BUY)[sym]; }
  var SYM_RANK = { "✅": 0, "⚠": 1, "⏳": 2, "❌": 3 };
  function cmpCount() { return fa((STATE.cmp || []).length); }
  function refreshCmpBadge() { var n = root.getElementById("cmpn"); if (n) n.textContent = cmpCount(); }
  function saveCmp(btn) {
    store.get("compare", function (arr) {
      arr = Array.isArray(arr) ? arr : [];
      var ent = {
        key: pageKey, type: STATE.type, url: location.href, at: Date.now(),
        name: STATE.inp.name_o || document.title || "اختیار",
        inp: JSON.parse(JSON.stringify(STATE.inp || {})), an: STATE.an ? JSON.parse(JSON.stringify(STATE.an)) : null,
      };
      var idx = -1;
      arr.forEach(function (x, i) { if (x.key === ent.key) idx = i; });
      if (idx >= 0) arr[idx] = ent; else arr.push(ent);
      if (arr.length > CMP_MAX) arr = arr.slice(-CMP_MAX);
      store.set("compare", arr);
      STATE.cmp = arr;
      refreshCmpBadge();
      if (btn) { var old = btn.textContent; btn.textContent = idx >= 0 ? "✔ به‌روز شد" : "✔ ذخیره شد"; setTimeout(function () { btn.textContent = old; }, 1300); }
    });
  }
  function delCmp(key) {
    store.get("compare", function (arr) {
      arr = (Array.isArray(arr) ? arr : []).filter(function (x) { return x.key !== key; });
      store.set("compare", arr); STATE.cmp = arr; renderCmpBody();
    });
  }
  function numOk(v) { return typeof v === "number" && isFinite(v); }
  // [شناسه، برچسب، تابع مقدار، قالب، بهتر: high|low]
  var CMP_ROWS = [
    { g: "نتیجه" },
    { id: "final", l: "نتیجه نهایی", html: function (it) { return it.r.final.sym + " " + symLabel(it.r.final.sym, it.e.type); } },
    { id: "steps", l: "مرحله‌های ۱ تا ۶", html: function (it) { var o = ""; for (var i = 1; i <= 6; i++) o += it.r.steps[i].status; return o; } },
    { id: "cnt", l: "ردها / هشدارها", html: function (it) { return fa(it.r.nHard) + " رد · " + fa(it.r.nWarn) + " هشدار"; } },
    { g: "مشخصات" },
    { id: "K", l: "قیمت اعمال", v: function (it) { return num0(it.e.inp.K); }, f: "money" },
    { id: "S", l: "قیمت سهم پایه", v: function (it) { return num0(it.e.inp.S); }, f: "money" },
    { id: "ask", l: "بهترین قیمت فروش اختیار (ask)", v: function (it) { return num0(it.e.inp.ask); }, f: "money" },
    { id: "td", l: "روز معاملاتی مانده", v: function (it) { return it.r.R.td; }, f: "int", better: "high" },
    { g: "سلامت بازار" },
    { id: "spread", l: "اسپرد", v: function (it) { return it.r.R.spread; }, f: "pct1", better: "low" },
    { id: "vol_o", l: "میانگین حجم روزانه", v: function (it) { return num0(it.e.inp.vol_o); }, f: "int", better: "high" },
    { id: "volratio", l: "حجم نسبت به تعداد خرید (برابر)", v: function (it) { return it.r.R.volratio; }, f: "int", better: "high" },
    { g: "قیمت و زمان" },
    { id: "tvp", l: "سهم ارزش زمانی از قیمت", v: function (it) { return it.r.R.tvp; }, f: "pct0", better: "low" },
    { id: "rise", l: "حرکت لازم سهم تا سر به سر", v: function (it) { return it.r.R.rise; }, f: "pct1", better: "low" },
    { id: "tgtd", l: "حرکت روزانه لازم برای هدف", v: function (it) { return it.r.R.tgtd; }, f: "pct2", better: "low" },
    { g: "سود و زیان" },
    { id: "rr", l: "نسبت سود به ریسک", v: function (it) { return it.r.R.rr; }, f: "ratio1", better: "high" },
    { id: "ev", l: "امید ریاضی بازده", v: function (it) { return it.r.R.ev; }, f: "pct0", better: "high" },
    { id: "retFlat", l: "بازده اگر سهم بی‌تغییر بماند", v: function (it) { return it.r.R.retFlat; }, f: "pct0", better: "high" },
    { id: "retAdv", l: "بازده اگر سهم ۱۰٪ خلاف نظر برود", v: function (it) { return it.r.R.retAdv; }, f: "pct0", better: "high" },
    { id: "preq", l: "حداقل احتمال لازم برای سر به سر", v: function (it) { return it.r.R.preq; }, f: "pct0", better: "low" },
    { g: "احتمال" },
    { id: "p", l: "احتمال من", v: function (it) { return num0(it.e.inp.p); }, f: "pct0", better: "high" },
    { id: "pModel", l: "احتمال آماری (مدل نوسان)", v: function (it) { return it.r.R.pModel; }, f: "pct0", better: "high" },
    { id: "pEmp", l: "احتمال تاریخی", v: function (it) { return it.r.R.pEmp; }, f: "pct0", better: "high" },
    { g: "فروشنده" },
    { id: "sp", l: "قیمت فروش من / بهترین خرید", v: function (it) { return isSell(it.e.type) ? (num0(it.e.inp.sellp) !== null ? num0(it.e.inp.sellp) : num0(it.e.inp.bid)) : null; }, f: "money" },
    { id: "yield", l: "بازده پریمیوم تا سررسید", v: function (it) { return it.r.R.yield; }, f: "pct1", better: "high" },
    { id: "monthly", l: "بازده معادل ماهانه", v: function (it) { return it.r.R.monthly; }, f: "pct1", better: "high" },
    { id: "pLoss", l: "احتمال زیان فروشنده", v: function (it) { return it.r.R.pLoss; }, f: "pct0", better: "low" },
    { id: "pAssign", l: "احتمال اعمال", v: function (it) { return it.r.R.pAssign; }, f: "pct0", better: "low" },
    { id: "cushion", l: "فاصله سهم تا سر به سر فروشنده", v: function (it) { return it.r.R.cushion; }, f: "pct1", better: "high" },
    { id: "sev", l: "برتری پریمیوم نسبت به ارزش تئوری", v: function (it) { return it.r.R.sev; }, f: "pct0", better: "high" },
    { g: "سرمایه" },
    { id: "cost", l: "هزینه یک قرارداد (ریال)", v: function (it) { return it.r.R.cost; }, f: "money", better: "low" },
    { id: "maxq", l: "حداکثر قرارداد مجاز", v: function (it) { return it.r.R.maxq; }, f: "int", better: "high" },
  ];
  function num0(x) { var n = Number(x); return (x === null || x === undefined || x === "" || !isFinite(n)) ? null : n; }
  function renderCmpBody() {
    var el = root.getElementById("cmpbody");
    if (!el) return;
    var list = STATE.cmp || [];
    refreshCmpBadge();
    if (!list.length) {
      el.innerHTML = '<div class="empty">هنوز اختیاری ذخیره نکرده‌ای.<br>روی صفحه هر اختیار، اطلاعاتش را پر کن و دکمه «ذخیره برای مقایسه» را بزن؛ بعد برو سراغ اختیار بعدی.</div>';
      STATE.tsv = "";
      return;
    }
    var items = list.map(function (e) { return { e: e, r: OC.evaluate(e.type, e.inp, STATE.st, e.an) }; });
    items.sort(function (a, b) {
      var d = SYM_RANK[a.r.final.sym] - SYM_RANK[b.r.final.sym];
      if (d) return d;
      var ea = numOk(a.r.ev) ? a.r.ev : -Infinity, eb = numOk(b.r.ev) ? b.r.ev : -Infinity;
      return eb - ea;
    });
    function nm(it) { return it.e.inp.name_o || it.e.name; }
    var h = '<div class="rk">';
    items.forEach(function (it, i) {
      h += '<div class="it"><span class="no">' + fa(i + 1) + '</span><span class="nm">' + esc(nm(it)) + '</span><span>' + it.r.final.sym + " " + symLabel(it.r.final.sym, it.e.type) + '</span>' +
        '<span class="mt">' + (isSell(it.e.type)
          ? esc(MODE_LABEL[it.e.type]) + ' · بازده پریمیوم ' + esc(fmt(it.r.R.yield, "pct1")) + ' · احتمال زیان ' + esc(fmt(it.r.R.pLoss, "pct0"))
          : esc(MODE_LABEL[it.e.type]) + ' · امید ریاضی ' + esc(fmt(it.r.R.ev, "pct0")) + ' · سود/ریسک ' + esc(fmt(it.r.R.rr, "ratio1"))) + '</span></div>';
    });
    h += '</div><div class="cmp"><table><thead><tr><th class="lab">اختیار</th>';
    items.forEach(function (it, i) {
      var t = new Date(it.e.at), hm = "";
      try { hm = t.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }); } catch (x) {}
      h += '<th><div class="nm">' + fa(i + 1) + '# ' + esc(nm(it)) + '</div><div class="sub">' + esc(MODE_LABEL[it.e.type] || it.e.type) + ' · ذخیره ' + esc(hm) + '</div>' +
        '<div class="ac"><a href="' + esc(it.e.url || "#") + '" target="_blank" rel="noopener" title="باز کردن صفحه این اختیار">↗</a>' +
        '<button data-del="' + esc(it.e.key) + '" title="حذف از مقایسه">✕</button></div></th>';
    });
    h += '</tr></thead><tbody>';
    var tsv = [["اختیار"].concat(items.map(nm)).join("\t")];
    CMP_ROWS.forEach(function (rw) {
      if (rw.g) { h += '<tr class="grp"><td colspan="' + (items.length + 1) + '">' + rw.g + '</td></tr>'; return; }
      var vals = items.map(function (it) { return rw.v ? rw.v(it) : null; });
      var best = null, worst = null;
      if (rw.better) {
        var nums = vals.filter(numOk);
        if (nums.length >= 2) {
          var mn = Math.min.apply(null, nums), mx = Math.max.apply(null, nums);
          if (mn !== mx) { best = rw.better === "high" ? mx : mn; worst = rw.better === "high" ? mn : mx; }
        }
      }
      var cells = [rw.l];
      h += '<tr><td class="lab">' + esc(rw.l) + '</td>';
      items.forEach(function (it, i) {
        var txt = rw.html ? rw.html(it) : fmt(vals[i], rw.f);
        var cls = "v";
        if (best !== null && numOk(vals[i])) { if (vals[i] === best) cls += " best"; else if (vals[i] === worst) cls += " worst"; }
        h += '<td class="' + cls + '">' + esc(txt) + '</td>';
        cells.push(txt);
      });
      h += '</tr>';
      tsv.push(cells.join("\t"));
    });
    h += '</tbody></table></div><div class="legend">سبز = بهترین مقدار در آن ردیف، قرمز = بدترین. رتبه‌بندی اول بر اساس نتیجه نهایی و بعد امید ریاضی است. همه اختیارها با ریسک‌پذیری و آستانه‌های فعلی بالا محاسبه شده‌اند؛ اگر اعداد یک اختیار عوض شد، صفحه‌اش را باز کن و دوباره «ذخیره برای مقایسه» را بزن.</div>';
    STATE.tsv = tsv.join("\n");
    el.innerHTML = h;
    el.querySelectorAll("[data-del]").forEach(function (b) { b.onclick = function () { delCmp(b.dataset.del); }; });
  }

  // ================= دید سهم پایه (نمودار + مالی) برای پیشنهاد =================
  var CSX = window.ComboStore;
  function loadUnderFin(code, cb) {
    if (!code || !CSX) { STATE.underFin = null; if (cb) cb(); return; }
    CSX.get("S.fin:stk:code:" + code, function (f) {
      if (!f) { try { var raw = localStorage.getItem("sc:fin:stk:code:" + code); f = raw ? JSON.parse(raw) : null; } catch (e) { f = null; } }
      STATE.underFin = f || null;
      if (cb) cb();
    });
  }
  function pd2(n) { return (n < 10 ? "0" : "") + n; }
  function tdNow() {
    var I = STATE.inp, t = Number(I.tdov);
    if (t > 0) return t;
    var c = Number(I.cal_days);
    return c > 0 ? Math.round(c * 5 / 7 * 0.92) : null;
  }
  function expDateTxt() {
    if (STATE.inp.exp_date) return STATE.inp.exp_date;
    try { var o = OCC.parseOptionName(pageText()); if (o) return o.jy + "/" + pd2(o.jm) + "/" + pd2(o.jd); } catch (e) {}
    return "";
  }
  function underFinView() {
    var AD = window.OptAdvisor, u = STATE.under || {}, S = Number(STATE.inp.S) > 0 ? Number(STATE.inp.S) : null;
    return (AD && STATE.underFin && S) ? AD.finView(STATE.underFin, S, u.inp || {}) : null;
  }
  function underCtx() {
    var AD = window.OptAdvisor, u = STATE.under || {};
    var an = (u.an && u.an.bars) ? u.an : STATE.an;
    var S = Number(STATE.inp.S) > 0 ? Number(STATE.inp.S) : null, td = tdNow();
    if (!AD || !S || !td || !an) return null;
    var fv = underFinView();
    var v = AD.stockView(an, S, {}, u.inp || {}, fv, 10);
    if (!v || !v.ok) return { v: v, fv: fv, S: S, td: td };
    var ol = AD.outlook(v, S, td, 0.5);
    return { v: v, fv: fv, S: S, td: td, ol: ol, nr: AD.narrative(v, ol, td) };
  }
  // اگر پیش‌بینی سهم درست باشد، همین اختیار در سررسید چه می‌شود؟
  function optScenarioHtml(UC, m) {
    var AD = window.OptAdvisor, I = STATE.inp, st = OC.effective(STATE.st), ol = UC.ol;
    var K = num0(I.K), ask = num0(I.ask), bid = num0(I.bid), sell = isSell(m), call = m === "call" || m === "scall";
    var entry = sell ? (num0(I.sellp) > 0 ? num0(I.sellp) : bid) : ask;
    var h = '<div class="sg"><h5>این اختیار (' + esc(MODE_LABEL[m]) + (K > 0 ? " با قیمت اعمال " + esc(fmt(K, "money")) : "") + ') اگر پیش‌بینی سهم پایه درست باشد</h5>';
    if (!(K > 0) || !(entry > 0)) return h + '<div class="legend">قیمت اعمال یا قیمت ' + (sell ? "خرید (bid)" : "فروش (ask)") + ' اختیار وارد/خوانده نشده؛ «به‌روزرسانی از سایت» را بزن.</div></div>';
    var fo = st.fee_opt, fe = st.fee_ex, fs = st.fee_sell, base = call ? UC.S : K;
    var cost = entry * (1 + fo), prem = entry * (1 - fo);
    function pay(X) { return sell ? (call ? Math.max(X - K, 0) : Math.max(K - X, 0)) : (call ? Math.max(X * (1 - fs) - K * (1 + fe), 0) : Math.max(K * (1 - fs) - X * (1 + fe), 0)); }
    h += '<div class="cmp sgt" style="margin:0 0 6px"><table><thead><tr><th class="lab">سناریوی قیمت سهم در سررسید</th><th>قیمت سهم</th><th>ارزش اختیار</th><th>' + (sell ? "سود/زیان فروشنده" : "سود/زیان خریدار") + '</th></tr></thead><tbody>';
    [["بدبینانه (۲٫۵٪)", ol.low95], ["محتاطانه (۱۶٪)", ol.low68], ["مرکزی", ol.median], ["خوش‌بینانه (۱۶٪)", ol.high68], ["بسیار خوش‌بینانه (۲٫۵٪)", ol.high95]].forEach(function (r, i) {
      var pv = pay(r[1]), pl = sell ? (prem - pv) : (cost > 0 ? pv / cost - 1 : null), good = sell ? (prem - pv) >= 0 : pv > cost;
      h += '<tr' + (i === 2 ? ' style="font-weight:700"' : '') + '><td class="lab">' + esc(r[0]) + '</td><td class="v">' + esc(fmt(r[1], "money")) + '</td><td class="v">' + esc(fmt(pv, "money")) + '</td><td class="v ' + (good ? "best" : "worst") + '">' +
        (sell ? esc(fmt(prem - pv, "money")) + ' (' + esc(fmt((prem - pv) / base, "pct1")) + ')' : esc((pl >= 0 ? "+" : "") + fmt(pl, "pct0"))) + '</td></tr>';
    });
    h += '</tbody></table></div>';
    var o = { strike: K, td: UC.td, ask: sell ? (ask > 0 ? ask : entry) : ask, bid: sell ? entry : bid, vol_o: undefined, last: null };
    var C = AD.evalCand(m, o, UC.S, UC.v.sigma, ol.m, st, UC.v.sigma);
    h += '<div class="line"><span>ارزش مورد انتظار اختیار در سررسید (روی کل توزیع پیش‌بینی)</span><span class="vv">' + esc(fmt(C.E, "money")) + ' ریال</span></div>';
    if (!sell) {
      h += '<div class="line"><span>سقف قیمت خرید سر به سر ریاضی (امید ریاضی صفر)</span><span class="vv">' + esc(fmt(C.E / (1 + fo), "money")) + '</span></div>' +
        '<div class="line"><span>قیمت فعلی فروش (ask) نسبت به آن</span><span class="vv">' + esc(fmt(entry, "money")) + ' — ' + (C.edge > 0 ? "✅ ارزان‌تر از ارزش پیش‌بینی" : "❌ گران‌تر از ارزش پیش‌بینی") + '</span></div>' +
        '<div class="line"><span>احتمال سودآوری در سررسید</span><span class="vv">' + esc(fmt(C.pProfit, "pct0")) + '</span></div>' +
        '<div class="line"><span>سر به سر سهم پایه (' + esc(fmt(C.beMove, "pct1")) + ' حرکت لازم)</span><span class="vv">' + esc(fmt(C.be, "money")) + '</span></div>';
    } else {
      h += '<div class="line"><span>پریمیوم خالص دریافتی</span><span class="vv">' + esc(fmt(C.premium, "money")) + '</span></div>' +
        '<div class="line"><span>برتری مورد انتظار فروشنده (پریمیوم − زیان مورد انتظار)</span><span class="vv">' + esc(fmt(C.edge, "money")) + ' — ' + (C.edge > 0 ? "✅" : "❌") + '</span></div>' +
        '<div class="line"><span>احتمال زیان فروشنده در سررسید (طبق پیش‌بینی)</span><span class="vv">' + esc(fmt(C.pLoss, "pct0")) + (C.pLoss > st.assign ? " ⚠ بیشتر از حد مجاز " + esc(fmt(st.assign, "pct0")) : "") + '</span></div>' +
        '<div class="line"><span>احتمال اعمال شدن</span><span class="vv">' + esc(fmt(C.pAssign, "pct0")) + '</span></div>';
    }
    return h + '<div class="legend" style="margin:6px 0 0">توزیع قیمت سهم همان پیش‌بینی بالاست (مرکزش کمی به‌سمت دید تحلیلی کج شده). خریدار با قیمت ask و فروشنده با bid و با کارمزدهای تنظیمات حساب شده است.</div></div>';
  }

  // ================= تب پیشنهاد =================
  function margOf(q, sell) { return sell ? q.ref / q.limit - 1 : 1 - q.ref / q.limit; }
  function pAbs(g) { return fa(Math.abs(g * 100).toFixed(0)) + "٪"; }
  function pSigned(g) { return (g >= 0 ? "+" : "") + fa((g * 100).toFixed(0)) + "٪"; }
  function enterSug() {
    store.get("compare", function (arr) {
      STATE.cmp = Array.isArray(arr) ? arr : [];
      STATE.view = "sug"; STATE.showSettings = false;
      loadUnderFin(STATE.inp.under_code, function () { renderAll(); });
    });
  }
  function renderSugBody() {
    var el = root.getElementById("sugbody");
    if (!el) return;
    var m = STATE.type, sell = isSell(m);
    // ---- پیش‌بینی سهم پایه (نمودار + مالی) تا تاریخ سررسید: برای قیمت هدف و احتمال، و برای کف قیمت فروش
    var UC = underCtx(), inpQ = STATE.inp, auto = [], call = m === "call" || m === "scall";
    if (!sell && UC && UC.ol) {
      inpQ = Object.assign({}, STATE.inp);
      var T0 = num0(STATE.inp.T), p0 = num0(STATE.inp.p);
      if (!(T0 > 0)) { inpQ.T = Math.round(UC.ol.median); auto.push("قیمت هدف سهم را وارد نکرده‌ای؛ قیمت مرکزی پیش‌بینی افزونه در تاریخ سررسید (" + fmt(inpQ.T, "money") + ") به‌عنوان هدف استفاده شد. توجه: این فقط یک سناریو (میانه) است و اختیار از دم توزیع هم سود می‌برد؛ «سقف قیمت خرید سر به سر ریاضی» در جدول بالا بر پایه‌ی کل توزیع پیش‌بینی است و برای اختیار معمولاً واقع‌بینانه‌تر است."); }
      else auto.push("برای مقایسه: قیمت مرکزی پیش‌بینی افزونه در سررسید " + fmt(Math.round(UC.ol.median), "money") + " است؛ احتمال رسیدن سهم به هدف تو (" + fmt(T0, "money") + ") طبق پیش‌بینی حدود " + fmt(call ? UC.ol.pAbove(T0) : 1 - UC.ol.pAbove(T0), "pct0") + " است.");
      if (p0 === null) {
        var Tn = num0(inpQ.T), pm = call ? UC.ol.pAbove(Tn) : 1 - UC.ol.pAbove(Tn), An = OC.analyze(call, STATE.an, UC.S, Tn, UC.td), pe = An && An.pEmp !== null && An.pEmp !== undefined ? An.pEmp : null;
        inpQ.p = Math.round(Math.min(pm, pe !== null ? pe : pm) * 100) / 100;
        if (T0 > 0) auto.push("احتمال را وارد نکرده‌ای؛ احتمال رسیدن به هدف طبق پیش‌بینی افزونه" + (pe !== null ? " (کمینه‌ی مدل و سابقه‌ی تاریخی)" : "") + " " + fmt(inpQ.p, "pct0") + " گذاشته شد.");
      }
    }
    var q = OC.quote(m, inpQ, STATE.st, STATE.an);
    if (sell && q.ok && UC && UC.ol && q.safeStrike) {
      var st0 = OC.effective(STATE.st), K0 = num0(STATE.inp.K), qF = q.safeStrike * Math.exp(UC.ol.m), pnF = q.call ? qF - K0 : K0 - qF, floorF = Math.max(pnF, 0) / (1 - st0.fee_opt);
      q.parts.push({ label: "برای اینکه با دید تحلیلی سهم پایه (نمودار" + (UC.fv && UC.fv.ok ? " + مالی" : "") + ") هم احتمال زیان از " + fmt(st0.assign, "pct0") + " بیشتر نشود (سر به سر باید " + (q.call ? "بالاتر" : "پایین‌تر") + " از " + fmt(qF, "money") + " باشد)", v: floorF });
      if (floorF > q.limit) {
        q.limit = Math.ceil(floorF);
        q.parts.forEach(function (x) { x.bind = Math.abs(x.v - q.limit) < 1; });
        if (q.ref !== null && q.ref > 0) q.gap = q.ref / q.limit - 1;
        var baseS = q.call ? UC.S : K0;
        q.levels.forEach(function (l) {
          if (l.label === "کف پیشنهادی") { l.price = q.limit; l.yld = q.limit * (1 - st0.fee_opt) / baseS; l.pLoss = null; l.fairr = q.fair > 0 ? q.limit / q.fair : null; }
          l.good = l.price >= q.limit;
        });
        q.note.push("دید تحلیلی سهم پایه (" + UC.v.dirTxt + ") احتمال زیان فروشنده را بالاتر از مدل عادی نشان داد؛ کف قیمت فروش بالاتر رفت.");
      }
    }
    // وقتی هدف از پیش‌بینی خود افزونه آمده (نه از خودت)، سقف خرید را روی کل توزیع پیش‌بینی می‌گذاریم؛ سناریوی تک‌نقطه‌ای میانه برای اختیار (که از دم توزیع هم سود می‌برد) بدبینانه و گمراه‌کننده است
    if (!sell && q.ok && UC && UC.ol && !(num0(STATE.inp.T) > 0)) {
      var stB = OC.effective(STATE.st), KB = num0(STATE.inp.K), askB = num0(STATE.inp.ask), bidB = num0(STATE.inp.bid);
      if (KB > 0 && (askB > 0 || bidB > 0)) {
        var CB = window.OptAdvisor.evalCand(m, { strike: KB, td: UC.td, ask: askB > 0 ? askB : bidB, bid: bidB > 0 ? bidB : askB, vol_o: undefined, last: null }, UC.S, UC.v.sigma, UC.ol.m, stB, UC.v.sigma);
        var mg = stB.margin !== undefined ? stB.margin : 0.08, distLim = Math.floor(Math.max(0, CB.E / (1 + stB.fee_opt) * (1 - mg)));
        q.parts = q.parts.filter(function (x) { return !/^برای نسبت سود به ریسک|^برای اینکه احتمال تو/.test(x.label); });   // این دو شرط، سناریوی تک‌نقطه‌ایِ هدف خودکارند
        q.parts.push({ label: "بر پایه‌ی ارزش مورد انتظار اختیار روی کل توزیع پیش‌بینی سهم پایه (" + fmt(CB.E, "money") + ") منهای حاشیه‌ی امن " + fmt(mg, "pct0"), v: distLim });
        q.limit = distLim;
        q.parts.forEach(function (x) { x.bind = Math.abs(x.v - q.limit) < 1; });
        if (q.limit > 0 && q.ref > 0) q.gap = q.limit / q.ref - 1;
        q.levels = q.levels.filter(function (l) { return l.label !== "سقف پیشنهادی"; });
        q.levels.forEach(function (l) { l.good = l.price <= q.limit; });
        q.note.push("چون هدف را خودت نگذاشتی، سقف قیمت خرید بر پایه‌ی کل توزیع پیش‌بینی گذاشته شد (نه فقط سناریوی میانه).");
      }
    }
    auto.forEach(function (t) { q.note.push(t); });
    if (UC && UC.fv && UC.fv.ok && UC.fv.score < 40) q.note.push("بنیاد سهم پایه ضعیف است (امتیاز مالی " + UC.fv.score + " از ۱۰۰)؛ ریسک افت شدیدتر است.");
    else if (UC && !(UC.fv && UC.fv.ok)) q.note.push("اطلاعات مالی سهم پایه ثبت نشده؛ صفحه‌ی همان سهم را باز کن و تب «🏦 مالی» را بخوان تا در پیشنهاد لحاظ شود.");
    var h = '<div class="note">پیشنهاد برای حالت «' + MODE_LABEL[m] + '» است. حالت را از تب‌های بالا عوض کن.</div>';
    if (UC && UC.ol) {
      h += window.AdvisorUI.outlookHtml({ title: "🔭 دید سهم پایه" + (STATE.inp.base_sym ? " (" + STATE.inp.base_sym + ")" : "") + " تا سررسید", S: UC.S, v: UC.v, ol: UC.ol, nr: UC.nr, expDate: expDateTxt() });
      h += optScenarioHtml(UC, m);
    } else if (UC && UC.v && !UC.v.ok) {
      h += '<div class="sg"><h5>🔭 دید سهم پایه</h5><div class="legend">سابقه قیمت سهم پایه (حداقل ۶۰ روز) خوانده نشده؛ «به‌روزرسانی از سایت» را در صفحه‌ی همین اختیار بزن تا سهم پایه هم خوانده شود.</div></div>';
    } else {
      h += '<div class="sg"><h5>🔭 دید سهم پایه</h5><div class="legend">قیمت سهم پایه یا روز تا سررسید خوانده نشده؛ «به‌روزرسانی از سایت» را بزن.</div></div>';
    }
    if (q.missing.length) {
      h += '<div class="empty">برای محاسبه قیمت پیشنهادی این‌ها لازم است: <b>' + esc(q.missing.join("، ")) + '</b><br>در تب «' + MODE_LABEL[m] + '» پرشان کن (یا «به‌روزرسانی از سایت» را بزن).</div>';
    } else {
      h += '<div class="sg"><h5>' + (sell ? "کمترین قیمت فروش پیشنهادی" : "بیشترین قیمت خرید پیشنهادی") + '</h5>' +
        '<div><span class="big">' + esc(fmt(q.limit, "money")) + '</span> ریال</div>';
      if (q.ref !== null && q.ref > 0 && q.gap !== null) {
        if (q.gap >= 0) h += '<div class="msg ok">✅ قیمت فعلی ' + (sell ? "خرید (که می‌گیری)" : "فروش (که می‌خری)") + ' ' + esc(fmt(q.ref, "money")) + ' است و ' + esc(pAbs(margOf(q, sell))) + ' ' + (sell ? "بالاتر از کف" : "پایین‌تر از سقف") + ' قرار دارد.</div>';
        else h += '<div class="msg h">❌ قیمت فعلی ' + (sell ? "خرید" : "فروش") + ' ' + esc(fmt(q.ref, "money")) + ' است و ' + esc(pAbs(margOf(q, sell))) + ' ' + (sell ? "پایین‌تر از کف" : "بالاتر از سقف") + ' است. ' +
          (sell ? "سفارش فروش را در قیمت ≥ کف در صف بگذار یا صبر کن." : "سفارش خرید را در قیمت ≤ سقف در صف بگذار یا صبر کن.") + '</div>';
      } else if (q.ref === null || q.ref <= 0) {
        h += '<div class="msg wait">قیمت فعلی بازار وارد نشده؛ مقایسه‌ای ممکن نیست.</div>';
      }
      h += '<div style="margin-top:8px">';
      q.parts.forEach(function (x) { h += '<div class="line' + (x.bind ? " bind" : "") + '"><span>' + (x.bind ? "▶ " : "") + esc(x.label) + '</span><span class="vv">' + esc(fmt(Math.round(x.v), "money")) + '</span></div>'; });
      h += '</div><div class="legend" style="margin:6px 0 0">' + (sell ? "کف = بزرگ‌ترین مقدار از شرط‌های بالا (▶ یعنی همان شرط تعیین‌کننده است)." : "سقف = کوچک‌ترین مقدار از شرط‌های بالا (▶ یعنی همان شرط تعیین‌کننده است).") + '</div>';
      if (!sell && q.beAtLimit) h += '<div class="line"><span>اگر در سقف بخری، سر به سر سهم پایه</span><span class="vv">' + esc(fmt(q.beAtLimit, "money")) + (q.moveAtLimit !== undefined ? ' (' + esc(fmt(q.moveAtLimit, "pct1")) + ' حرکت)' : '') + '</span></div>';
      if (sell && q.safeStrike) h += '<div class="line"><span>قیمت اعمال امن‌تر (احتمال اعمال برابر حد مجاز) — اختیار با قیمت اعمال ' + (q.call ? "بالاتر" : "پایین‌تر") + ' از آن</span><span class="vv">' + esc(fmt(q.safeStrike, "money")) + '</span></div>';
      q.note.forEach(function (t) { h += '<div class="msg w">ℹ ' + esc(t) + '</div>'; });
      h += '</div>';

      if (q.levels.length) {
        h += '<div class="cmp sgt"><table><thead><tr><th class="lab">اگر با این قیمت ' + (sell ? "بفروشی" : "بخری") + '</th><th>قیمت</th>' +
          (sell ? '<th>بازده</th><th>احتمال زیان</th><th>به تئوری</th>' : '<th>سود/ریسک</th><th>احتمال لازم</th><th>امید ریاضی</th>') + '<th>وضعیت</th></tr></thead><tbody>';
        q.levels.forEach(function (l) {
          h += '<tr><td class="lab">' + esc(l.label) + '</td><td class="v">' + esc(fmt(l.price, "money")) + '</td>' +
            (sell ? '<td class="v">' + esc(fmt(l.yld, "pct1")) + '</td><td class="v">' + esc(fmt(l.pLoss, "pct0")) + '</td><td class="v">' + esc(fmt(l.fairr, "ratio2")) + '</td>'
                  : '<td class="v">' + esc(fmt(l.rr, "ratio1")) + '</td><td class="v">' + esc(fmt(l.preq, "pct0")) + '</td><td class="v">' + esc(fmt(l.ev, "pct0")) + '</td>') +
            '<td class="' + (l.good ? "v best" : "v worst") + '">' + (l.good ? "✅ می‌ارزد" : "❌ گران" ) + '</td></tr>';
        });
        h += '</tbody></table></div>';
      }
    }

    // ---- کدام اختیار بهتر است؟ (از بین ذخیره‌شده‌ها + همین صفحه)
    var cands = (STATE.cmp || []).filter(function (e) { return e.key !== pageKey && isSell(e.type) === sell; });
    cands.push({ key: pageKey, type: m, inp: STATE.inp, an: STATE.an, name: STATE.inp.name_o || "همین صفحه", current: true });
    var list = [];
    cands.forEach(function (e) {
      var qq = e.current ? q : OC.quote(e.type, e.inp, STATE.st, e.an);   // صفحه‌ی فعلی با پیش‌بینی سهم پایه تنظیم شده است
      if (qq.missing.length || qq.gap === null || !qq.limit) return;
      list.push({ e: e, q: qq });
    });
    list.sort(function (a, b) { return b.q.gap - a.q.gap; });
    h += '<div class="sg"><h5>کدام اختیار ' + (sell ? "فروش" : "خرید") + ' بهتر است؟</h5>';
    if (!list.length) {
      h += '<div class="legend">هنوز اختیار قابل مقایسه‌ای نیست. صفحه اختیارهای دیگر همین سهم را باز کن، اطلاعاتشان را پر کن و «➕ ذخیره برای مقایسه» را بزن؛ اینجا بر اساس فاصله قیمت فعلی تا ' + (sell ? "کف" : "سقف") + ' رتبه‌بندی می‌شوند.</div>';
    } else {
      var best = list[0], bn = best.e.inp.name_o || best.e.name;
      if (best.q.gap >= 0) h += '<div class="msg ok">✅ بهترین گزینه: <b>' + esc(bn) + '</b> (' + esc(MODE_LABEL[best.e.type]) + ') — قیمت فعلی‌اش ' + esc(pAbs(margOf(best.q, sell))) + (sell ? " بالاتر از کف" : " پایین‌تر از سقف") + ' است.</div>';
      else h += '<div class="msg w">هیچ‌کدام با قیمت فعلی نمی‌ارزند. نزدیک‌ترین: <b>' + esc(bn) + '</b>؛ ' + (sell ? "اگر قیمت خریدش به " : "اگر قیمت فروشش به ") + esc(fmt(best.q.limit, "money")) + (sell ? " یا بیشتر برسد" : " یا کمتر برسد") + ' می‌ارزد.</div>';
      h += '<div class="rk" style="margin:6px 0 0">';
      list.forEach(function (x, i) {
        h += '<div class="it"><span class="no">' + fa(i + 1) + '</span><span class="nm">' + esc(x.e.inp.name_o || x.e.name) + (x.e.current ? " (همین صفحه)" : "") + '</span><span>' + (x.q.gap >= 0 ? "✅" : "❌") + '</span>' +
          '<span class="mt">' + esc(MODE_LABEL[x.e.type]) + ' · قیمت ' + esc(fmt(x.q.ref, "money")) + ' / ' + (sell ? "کف " : "سقف ") + esc(fmt(x.q.limit, "money")) + ' · ' + (x.q.gap >= 0 ? "فاصله امن " : "گران‌تر از حد ") + esc(pAbs(margOf(x.q, sell))) + '</span></div>';
      });
      h += '</div>';
    }
    h += '<div class="legend" style="margin:6px 0 0">این پیشنهادها فقط حساب ریاضی بر پایه اعداد و آستانه‌های خودت است (با ریسک‌پذیری فعلی)، نه توصیه سرمایه‌گذاری.</div></div>';
    el.innerHTML = h;
  }

  function enterCmp() {
    store.get("compare", function (arr) {
      STATE.cmp = Array.isArray(arr) ? arr : [];
      STATE.view = "cmp"; STATE.showSettings = false;
      renderAll();
    });
  }
  function renderCmpPage() {
    var html = '<div class="panel wide" id="panel"><div class="hd" id="drag"><b>⚖ مقایسه اختیارها</b>' +
      '<button id="back" class="wide" title="برگشت به چک‌لیست">→ چک‌لیست</button><button id="min" title="کوچک کردن">—</button></div>' +
      '<div class="bodywrap"><div class="body" id="body">' + riskHtml() + '<div id="cmpbody"></div></div><button class="sbtn up" title="بالا" data-sc="-1">▲</button><button class="sbtn dn" title="پایین" data-sc="1">▼</button></div>' +
      '<div class="foot"><button id="cpy">کپی جدول (برای اکسل)</button><button id="clr">پاک کردن همه</button></div></div>';
    mount.innerHTML = html;
    bind();
    updateRiskUi();
    update();
  }

  function riskLabel(a) {
    return a <= 2 ? "خیلی محتاط" : a <= 4 ? "محتاط" : a <= 6 ? "متعادل" : a <= 8 ? "ریسک‌پذیر" : "خیلی ریسک‌پذیر";
  }
  function fa(n) { return String(n).replace(/\d/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[d]; }); }
  function riskKeysMeta() { return OC.SETTINGS_META.filter(function (m) { return !!OC.RISK_KEYS[m[0]]; }); }
  function manualCount() { return Object.keys(OC.RISK_KEYS).filter(function (k) { return STATE.st[k] !== undefined; }).length; }
  function riskHtml() {
    var a = STATE.st.risk !== undefined ? STATE.st.risk : 5;
    return '<div class="risk ' + (STATE.riskOpen ? "open" : "") + '" id="riskcard"><div class="rh" id="rh"><span class="num">🎚</span><span class="tt">ریسک‌پذیری من</span>' +
      '<span class="cnt" id="mcnt"></span><span class="rl"><span id="rv">' + fa(a) + '</span> از ۱۰ — <span id="rl">' + riskLabel(a) + '</span></span></div>' +
      '<div class="rbody"><input type="range" min="1" max="10" step="1" value="' + a + '" id="riskr"><div class="ends"><span>محتاط</span><span>ریسک‌پذیر</span></div>' +
      '<div class="rs" id="rsum"></div>' +
      '<button class="thr-t" id="thrt"><span>تنظیم دستی آستانه‌ها</span><span>' + (STATE.showThr ? "▴" : "▾") + '</span></button>' +
      (STATE.showThr ? thrHtml() : "") + '</div></div>';
  }
  function thrHtml() {
    var h = '<div class="thr"><div class="hint">مقدارها با اسلایدر عوض می‌شوند. هر کدام را خودت تایپ کنی ثابت می‌ماند (با ↺ دوباره خودکار می‌شود).</div><div class="tg">';
    riskKeysMeta().forEach(function (m) {
      h += '<div class="trow"><label>' + esc(m[1]) + '</label><div class="ir"><input data-s="' + m[0] + '" data-kind="' + m[3] + '" data-r="1" inputmode="decimal">' +
        '<button class="rst" data-rst="' + m[0] + '" title="برگرد به خودکار">↺</button></div></div>';
    });
    return h + '</div><button class="all" id="allauto">همه را خودکار کن</button></div>';
  }
  function pctTxt(x) { return +(x * 100).toFixed(1) + "٪"; }
  function updateRiskUi() {
    var eff = OC.effective(STATE.st);
    var rv = root.getElementById("rv"), rl = root.getElementById("rl"), rs = root.getElementById("rsum"), mc = root.getElementById("mcnt");
    if (rv) rv.textContent = fa(eff.risk);
    if (rl) rl.textContent = riskLabel(eff.risk);
    if (rs) rs.textContent = "حداکثر ریسک هر معامله " + pctTxt(eff.riskpct) + " سرمایه · حداقل سود به ریسک " + eff.rrmin + " · حداکثر اسپرد " + pctTxt(eff.spread) +
      " · حاشیه امن احتمال " + pctTxt(eff.margin) + " · تا " + eff.maxwarn + " هشدار";
    if (mc) { var n = manualCount(); mc.textContent = n ? fa(n) + " دستی" : ""; mc.style.display = n ? "" : "none"; }
    var active = root.activeElement;
    root.querySelectorAll("[data-r]").forEach(function (el) {
      var k = el.dataset.s, man = STATE.st[k] !== undefined;
      el.classList.toggle("man", man);
      var rst = root.querySelector('[data-rst="' + k + '"]');
      if (rst) rst.classList.toggle("show", man);
      if (el === active) return;
      var v = man ? STATE.st[k] : eff[k];
      el.value = el.dataset.kind === "pct" ? +(v * 100).toFixed(2) : v;
    });
  }

  // ---- رندر اسکلت (فقط وقتی نوع یا حالت باز/بسته عوض شد)
  function renderAll() {
    if (STATE.collapsed) {
      mount.innerHTML = '<button class="mini" id="expand">' + (window.ComboLogo ? window.ComboLogo(18) : "📋") + ' دیده‌بان · اختیار</button>';
      mount.querySelector("#expand").onclick = function () { STATE.collapsed = false; window.ComboLazy.activate(); renderAll(); if (LZ.kick) LZ.kick(); };
      return;
    }
    if (STATE.view === "cmp") { renderCmpPage(); return; }
    var titles = STEP_TITLES();
    var digits = "۰۱۲۳۴۵۶۷۸۹";
    var html = '<div class="panel' + (STATE.view === "adv" ? " wide" : "") + '" id="panel"><div class="hd" id="drag"><b>' + (window.ComboLogo ? window.ComboLogo(20) : "📋") + 'دیده‌بان بورس · اختیار</b>' +
      '<button id="cmpb" class="wide" title="مقایسه اختیارها">⚖ مقایسه <span class="n" id="cmpn">' + cmpCount() + '</span></button>' +
      '<button id="gear" title="تنظیمات">⚙</button><button id="min" title="کوچک کردن">—</button></div>' +
      (STATE.view === "main" ? '<div class="verdict v-wait" id="verdict"></div>' : '') +
      '<div class="tabs">' + [["call", "خرید Call"], ["put", "خرید Put"], ["scall", "فروش Call"], ["sput", "فروش Put"], ["sug", "💡 پیشنهاد"], ["adv", "🧭 مشاور"]].map(function (t) {
        var vt = t[0] === "sug" || t[0] === "adv";
        var on = vt ? STATE.view === t[0] : (STATE.view !== "sug" && STATE.view !== "adv" && STATE.type === t[0]);
        return '<button data-t="' + t[0] + '" class="' + (on ? "on" : "") + (isSell(t[0]) ? " sell" : "") + '">' + t[1] + '</button>';
      }).join("") + '</div>' +
      '<div class="bodywrap"><div class="body" id="body">' + riskHtml();
    if (STATE.view === "sug") {
      html += '<div id="sugbody"></div>';
    } else if (STATE.view === "adv") {
      html += '<div id="advbody"></div>';
    } else if (STATE.showSettings) {
      html += '<div class="set"><h4>تنظیمات</h4><div class="note">آستانه‌های ریسک از بخش «تنظیم دستی آستانه‌ها» زیر اسلایدر عوض می‌شوند. اینجا فقط کارمزدها و مقدارهای ثابت است. کارمزدها تقریبی‌اند؛ با کارگزاری‌ات تطبیق بده.</div>';
      OC.SETTINGS_META.forEach(function (m) {
        if (OC.RISK_KEYS[m[0]]) return;
        var v = STATE.st[m[0]] !== undefined ? STATE.st[m[0]] : m[2];
        var shown = m[3] === "pct" ? +(v * 100).toFixed(4) : v;
        html += '<div class="trow"><label>' + esc(m[1]) + '</label><input data-s="' + m[0] + '" data-kind="' + m[3] + '" value="' + shown + '"></div>';
      });
      html += '<button class="all" id="resetset">بازگشت همه تنظیمات به پیش‌فرض</button></div>';
    } else {
      html += '<div class="note">اعداد بازار خودکار خوانده می‌شوند. اگر عددی نیامد، آن را روی صفحه انتخاب کن و ⌖ را بزن.</div><div class="rep" id="rep"></div>';
      STEPS.forEach(function (st_, i) {
        html += '<div class="step ' + (STATE.open[i] ? "open" : "") + '" data-n="' + i + '"><div class="sh"><span class="num">' + digits[i] + '</span><span class="tt">' +
          esc(titles[i].replace(/^مرحله [۰-۹]+ — /, "")) + '</span><span class="badge" id="badge' + i + '"></span></div><div class="sc"><div class="grid">';
        FIELDS.forEach(function (f) {
          if (f.step !== i) return;
          if (!fieldShown(f, STATE.type)) return;
          html += '<div class="fld' + (f.t === "yn" ? " full" : "") + '"><label>' + esc(fieldLabel(f, STATE.type)) + '</label>';
          if (f.t === "yn") {
            html += '<div class="yn" data-yn="' + f.k + '"><button data-v="بله">بله</button><button data-v="خیر">خیر</button></div>';
          } else {
            html += '<div class="ctl"><input data-k="' + f.k + '" class="' + (f.t === "text" ? "txt" : "") + '" inputmode="' + (f.t === "text" ? "text" : "decimal") + '">';
            if (f.sel) html += '<button class="pick" data-pick="' + f.k + '" title="پر کردن با عدد انتخاب‌شده روی صفحه">⌖</button>';
            html += '</div>';
          }
          html += '</div>';
        });
        html += '</div><div class="calc" id="calc' + i + '"></div><div id="msgs' + i + '"></div></div></div>';
      });
    }
    html += '</div><button class="sbtn up" title="بالا" data-sc="-1">▲</button><button class="sbtn dn" title="پایین" data-sc="1">▼</button></div><div class="foot"><button id="savecmp" class="pri">➕ ذخیره برای مقایسه</button><button id="reset">پاک کردن ورودی‌ها</button><button id="fill">به‌روزرسانی از سایت</button><button id="diag">گزارش اشکال</button></div></div>';
    mount.innerHTML = html;
    bind();
    hydrateInputs();
    updateRiskUi();
    update();
  }

  function hydrateInputs() {
    root.querySelectorAll("[data-yn]").forEach(function (g) {
      var cur = STATE.inp[g.dataset.yn];
      g.querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === cur); });
    });
    root.querySelectorAll("[data-k]").forEach(function (el) {
      var f = FIELDS.filter(function (x) { return x.k === el.dataset.k; })[0];
      var v = STATE.inp[el.dataset.k];
      if (v === undefined || v === null) { el.value = ""; return; }
      el.value = f.t === "pct" ? +(v * 100).toFixed(4) : v;
    });
  }

  function readField(el) {
    var f = FIELDS.filter(function (x) { return x.k === el.dataset.k; })[0];
    if (f.t === "yn" || f.t === "text") return el.value;
    var n = parseNum(el.value);
    if (n === null) return null;
    return f.t === "pct" ? n / 100 : n;
  }

  function bind() {
    var q = function (s) { return root.querySelector(s); };
    var gear = q("#gear"); if (gear) gear.onclick = function () { STATE.view = "main"; STATE.showSettings = !STATE.showSettings; renderAll(); };
    var min = q("#min"); if (min) min.onclick = function () { STATE.collapsed = true; renderAll(); };
    var vv = q("#verdict"); if (vv) vv.onclick = function () { STATE.vdetOpen = !STATE.vdetOpen; update(); };

    root.querySelectorAll(".tabs button").forEach(function (b) {
      b.onclick = function () {
        var t = b.dataset.t;
        if (t === "sug") { enterSug(); return; }
        if (t === "adv") { STATE.view = "adv"; STATE.showSettings = false; renderAll(); return; }
        STATE.type = t; STATE.view = "main"; persist(); renderAll();
      };
    });
    root.querySelectorAll(".step .sh").forEach(function (h) {
      h.onclick = function () {
        var s = h.parentNode, n = s.dataset.n, willOpen = !STATE.open[n];
        STATE.open = {};
        root.querySelectorAll(".step").forEach(function (x) { x.classList.remove("open"); });
        if (willOpen) { STATE.open[n] = true; s.classList.add("open"); }
      };
    });
    root.querySelectorAll("[data-k]").forEach(function (el) {
      var h = function () { STATE.inp[el.dataset.k] = readField(el); persist(); update(); };
      el.addEventListener("input", h);
      el.addEventListener("change", h);
    });
    root.querySelectorAll("[data-yn]").forEach(function (g) {
      g.querySelectorAll("button").forEach(function (b) {
        b.onclick = function () {
          var k = g.dataset.yn;
          STATE.inp[k] = STATE.inp[k] === b.dataset.v ? "" : b.dataset.v;
          persist(); hydrateInputs(); update();
        };
      });
    });
    var rh = q("#rh"); if (rh) rh.onclick = function () {
      STATE.riskOpen = !STATE.riskOpen; persistUi();
      q("#riskcard").classList.toggle("open", STATE.riskOpen);
    };
    var thrt = q("#thrt"); if (thrt) thrt.onclick = function () { STATE.showThr = !STATE.showThr; renderAll(); };
    var allauto = q("#allauto"); if (allauto) allauto.onclick = function () {
      Object.keys(OC.RISK_KEYS).forEach(function (k) { delete STATE.st[k]; });
      persistSettings(); updateRiskUi(); update();
    };
    root.querySelectorAll("[data-rst]").forEach(function (b) {
      b.onclick = function () { delete STATE.st[b.dataset.rst]; persistSettings(); updateRiskUi(); update(); };
    });
    root.querySelectorAll("[data-pick]").forEach(function (b) {
      b.addEventListener("mousedown", function (e) { e.preventDefault(); });
      b.onclick = function () {
        var n = parseNum(lastSel || selText());
        var input = root.querySelector('[data-k="' + b.dataset.pick + '"]');
        if (n === null) { input.style.outline = "2px solid #c00"; setTimeout(function () { input.style.outline = ""; }, 900); return; }
        input.value = n; STATE.inp[b.dataset.pick] = n; persist(); update();
        input.style.outline = "2px solid #2e9a4a"; setTimeout(function () { input.style.outline = ""; }, 700);
      };
    });
    root.querySelectorAll("[data-s]").forEach(function (el) {
      el.addEventListener("input", function () {
        var k = el.dataset.s, isRisk = !!OC.RISK_KEYS[k];
        var n = parseNum(el.value);
        if (String(el.value).trim() === "") {
          if (isRisk) { delete STATE.st[k]; persistSettings(); updateRiskUi(); update(); }
          return;
        }
        if (n === null) return;
        STATE.st[k] = el.dataset.kind === "pct" ? n / 100 : n;
        persistSettings(); updateRiskUi(); update();
      });
      el.addEventListener("blur", function () { updateRiskUi(); });
    });
    var rr_ = q("#riskr");
    if (rr_) rr_.addEventListener("input", function () {
      STATE.st.risk = Number(rr_.value); persistSettings(); updateRiskUi(); update();
    });
    var rs = q("#resetset"); if (rs) rs.onclick = function () { STATE.st = {}; persistSettings(); renderAll(); };
    if (q("#reset")) q("#reset").onclick = function () { if (confirm("همه ورودی‌های این صفحه پاک شود؟")) { STATE.inp = {}; persist(); renderAll(); } };
    if (q("#fill")) q("#fill").onclick = function () { runAuto(false); };
    if (q("#diag")) q("#diag").onclick = copyDiag;
    var cmpb = q("#cmpb"); if (cmpb) cmpb.onclick = enterCmp;
    var savecmp = q("#savecmp"); if (savecmp) savecmp.onclick = function () { saveCmp(savecmp); };
    var back = q("#back"); if (back) back.onclick = function () { STATE.view = "main"; renderAll(); };
    var cpy = q("#cpy"); if (cpy) cpy.onclick = function () {
      var t = STATE.tsv || "";
      try { navigator.clipboard.writeText(t).then(function () { cpy.textContent = "✔ کپی شد"; setTimeout(function () { cpy.textContent = "کپی جدول (برای اکسل)"; }, 1300); }, function () { prompt("این متن را کپی کن:", t); }); }
      catch (e) { prompt("این متن را کپی کن:", t); }
    };
    var clr = q("#clr"); if (clr) clr.onclick = function () {
      if (confirm("همه اختیارهای ذخیره‌شده برای مقایسه پاک شود؟")) { store.set("compare", []); STATE.cmp = []; renderCmpBody(); }
    };
    // جابه‌جایی پنل
    var drag = q("#drag");
    if (drag) drag.addEventListener("mousedown", function (e) {
      if (e.target.tagName === "BUTTON") return;
      var r = host.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      function mv(ev) { host.style.left = Math.max(0, ev.clientX - dx) + "px"; host.style.top = Math.max(0, ev.clientY - dy) + "px"; }
      function up() { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); }
      document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
    });
  }

  // ---- به‌روزرسانی نتایج (بدون بازسازی ورودی‌ها)
  function update() {
    if (STATE.collapsed) return;
    if (STATE.view === "cmp") { renderCmpBody(); return; }
    if (STATE.showSettings) return;
    var res = OC.evaluate(STATE.type, STATE.inp, STATE.st, STATE.an);
    var v = root.getElementById("verdict");
    if (v) {
      var cls = { "✅": "v-ok", "❌": "v-bad", "⚠": "v-warn", "⏳": "v-wait" }[res.final.sym];
      v.className = "verdict " + cls;
      v.textContent = "«" + MODE_LABEL[STATE.type] + "»: " + res.final.sym + " " + res.final.text;
      window.AdvisorUI.paintVerdict(root, STATE, res, STEP_TITLES());
    }
    if (STATE.view === "sug") { renderSugBody(); return; }
    if (STATE.view === "adv") { var ab = root.getElementById("advbody"); if (ab && !ab.firstChild) advUI.mount(ab); else advUI.refresh(); return; }
    for (var i = 0; i < 7; i++) {
      var badge = root.getElementById("badge" + i);
      var calc = root.getElementById("calc" + i);
      var msgs = root.getElementById("msgs" + i);
      if (!calc) continue;
      var stp = res.steps[i];
      if (badge) badge.textContent = stp ? stp.status : "";
      calc.innerHTML = res.rows.filter(function (r) { return r.step === i; }).map(function (r) {
        return '<div class="cr" title="' + esc(r.help) + '"><span>' + esc(r.label) + '</span><span>' + esc(fmt(r.v, r.fmt)) + '</span></div>';
      }).join("");
      var m = "";
      if (stp) {
        if (stp.missing) m = '<div class="msg wait">⏳ ورودی ناقص — خانه‌های خالی این مرحله را پر کن</div>';
        else {
          stp.hard.forEach(function (t) { m += '<div class="msg h">❌ ' + esc(t) + "</div>"; });
          stp.warn.forEach(function (t) { m += '<div class="msg w">⚠ ' + esc(t) + "</div>"; });
          if (!stp.hard.length && !stp.warn.length) m = '<div class="msg ok">✅ عبور</div>';
        }
      }
      if (i === 4 && res.R.pSug !== null && res.R.pSug !== undefined) {
        var sug = Math.floor(res.R.pSug * 20) / 20;
        m += '<button class="usep" data-usep="' + sug + '">استفاده از احتمال پیشنهادی (' + Math.round(sug * 100) + '٪) به‌عنوان احتمال من</button>';
      }
      msgs.innerHTML = m;
    }
  }

  // ---- خواندن خودکار اعداد از سایت
  var DIAG = [];
  var autoBusy = false;
  function showReport(items) {
    var el = root.getElementById("rep");
    if (!el) return;
    el.innerHTML = items.map(function (r) {
      return '<div class="' + (r.ok === true ? "o" : r.ok === false ? "x" : "t") + '">' + (r.ok === true ? "✔ " : r.ok === false ? "✖ " : "") + esc(r.t) + "</div>";
    }).join("");
  }
  function pageText() {
    return (document.title || "") + "\n" + (document.body ? document.body.innerText : "");
  }
  async function runAuto(silent) {
    if (autoBusy) return;
    autoBusy = true;
    try {
      DIAG = ["url: " + location.href, "time: " + new Date().toISOString()];
      var code = OCC.insCodeFromUrl(location.href);
      var opt = OCC.parseOptionName(pageText());
      DIAG.push("insCode=" + code + " optionName=" + (opt ? JSON.stringify(opt) : "NOT FOUND"));
      if (!code || !opt) {
        if (!silent) showReport([{ ok: false, t: "این صفحه، صفحه نماد اختیار نیست (یا نام نماد هنوز بالا نیامده). صفحه یک اختیار خرید/فروش را باز کن." }]);
        return;
      }
      showReport([{ t: "در حال خواندن از سایت…" }]);
      var res = await OCC.collect(opt, code, DIAG);
      STATE.type = (isSell(STATE.type) ? "s" : "") + opt.type;
      Object.keys(res.inp).forEach(function (k) { STATE.inp[k] = res.inp[k]; });
      if (res.an && (res.an.rets || res.an.power !== undefined)) STATE.an = res.an;
      STATE.inp.base_sym = opt.base;
      STATE.inp.exp_date = opt.jy + "/" + pd2(opt.jm) + "/" + pd2(opt.jd);
      if (res.underCode) {
        STATE.inp.under_code = res.underCode;
        try {
          var sres = await SCC.collect(res.underCode, DIAG);
          STATE.under = { code: res.underCode, inp: sres.inp, an: sres.an };
          CS.set("ctx:" + res.underCode, { at: Date.now(), inp: sres.inp, an: sres.an });
          await new Promise(function (r) { loadUnderFin(res.underCode, r); });
          res.rep.push(sres.an && sres.an.bars
            ? { ok: true, t: "تحلیل تکنیکال سهم پایه آماده شد (" + sres.an.bars.length + " روز سابقه) — در تب «🧭 مشاور» استفاده می‌شود" }
            : { ok: false, t: "سابقه ۲۵۰ روزه‌ی سهم پایه خوانده نشد؛ تحلیل تکنیکال در مشاور محدود می‌شود" });
        } catch (e2) { DIAG.push("UNDER EXCEPTION " + e2); }
      }
      // اندازه قرارداد از صفحه (برچسب «اندازه قرارداد»)
      var sm = pageText().match(/اندازه\s*قرارداد[^\d۰-۹]{0,12}([\d۰-۹٬,]+)/);
      if (sm) {
        var sz = parseNum(sm[1]);
        if (sz && sz !== (STATE.st.size || OC.DEFAULTS.size)) {
          STATE.st.size = sz; persistSettings();
          res.rep.push({ ok: true, t: "اندازه قرارداد " + sz + " (از صفحه؛ در تنظیمات هم اعمال شد)" });
        }
      }
      persist();
      renderAll();
      showReport(res.rep);
    } catch (e) {
      DIAG.push("EXCEPTION " + e);
      showReport([{ ok: false, t: "خطا در خواندن: " + e }]);
    } finally { autoBusy = false; }
  }
  function copyDiag() {
    var txt = DIAG.join("\n");
    try { navigator.clipboard.writeText(txt).then(function () { alert("گزارش کپی شد؛ همین را برای من بفرست."); }, function () { prompt("این متن را کپی کن:", txt); }); }
    catch (e) { prompt("این متن را کپی کن:", txt); }
  }

  root.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest("[data-usep]");
    if (!b) return;
    STATE.inp.p = Number(b.dataset.usep); persist(); hydrateInputs(); update();
  });


  // ================= مشاور ترکیبی (تحلیل سهم پایه + زنجیره اختیارها) =================
  function advCtx() {
    var u = STATE.under || {};
    return {
      S: Number(STATE.inp.S) > 0 ? Number(STATE.inp.S) : null,
      an: (u.an && u.an.bars) ? u.an : STATE.an,
      stockInp: u.inp || {}, stockSt: {}, optSt: STATE.st, fin: underFinView(),
      baseSym: STATE.inp.base_sym || null,
      currentCode: OCC.insCodeFromUrl(location.href),
    };
  }
  function applyAdvice(A) {
    var V = A.view;
    if (isSell(STATE.type)) { alert("خانه‌های هدف و احتمال فقط در حالت‌های خرید هست. برای فروش، جدول مشاور و تب «💡 پیشنهاد» را ببین."); return; }
    if (!V || !V.ok) { alert("تحلیل تکنیکال سهم در دسترس نیست."); return; }
    var call = STATE.type === "call";
    var T = Math.round(call ? V.tUp : V.tDn);
    STATE.inp.T = T;
    var S = Number(STATE.inp.S), td = Number(STATE.inp.tdov) > 0 ? Number(STATE.inp.tdov) : Math.round(Number(STATE.inp.cal_days) * 5 / 7 * 0.92);
    var An = OC.analyze(call, STATE.an, S, T, td);
    if (An && An.pSug !== null && An.pSug !== undefined) STATE.inp.p = Math.round(An.pSug * 100) / 100;
    persist(); STATE.view = "main"; renderAll();
  }
  var advUI = window.AdvisorUI.create(root, { getContext: advCtx, origin: location.origin, onApply: applyAdvice });

  // ---- شروع
  var LZ = { kick: null };
  mount.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest(".sbtn") : null; if (!b) return;
    var bd = root.getElementById("body"); if (bd) bd.scrollBy({ top: Number(b.dataset.sc) * Math.max(120, bd.clientHeight * 0.6), behavior: "smooth" });
  });
  store.get("compare", function (c) { STATE.cmp = Array.isArray(c) ? c : []; refreshCmpBadge(); });
  store.get("ui", function (u) { if (u && u.riskOpen !== undefined) STATE.riskOpen = !!u.riskOpen; });
  store.get("settings", function (s) {
    STATE.st = s || {};
    getDraft(pageKey, function (d) {
      if (d) { STATE.type = d.type || "call"; STATE.inp = d.inp || {}; STATE.an = d.an || null; }
      if (STATE.inp.under_code) CS.get("ctx:" + STATE.inp.under_code, function (u) { if (u && u.an) { STATE.under = { code: STATE.inp.under_code, inp: u.inp, an: u.an }; loadUnderFin(STATE.inp.under_code, function () { if (STATE.view === "adv" || STATE.view === "sug") renderAll(); }); } });
      renderAll();   // پیش‌فرض بسته: فقط دکمه‌ی کوچک؛ خواندن و تحلیل بعد از اولین باز کردن شروع می‌شود
      host.style.display = "none";
      var visible = false, decided = false, checks = 0, pending = true, lastHref = location.href;
      function detect() { visible = !!(OCC.insCodeFromUrl(location.href) && OCC.parseOptionName(pageText())); host.style.display = visible ? "" : "none"; return visible; }
      LZ.kick = function () { if (pending && visible && !STATE.collapsed) { pending = false; runAuto(true); } };
      // یک تایمر سبک: فقط تا وقتی نوع صفحه معلوم نشده متن صفحه را می‌خواند (حداکثر ~۲۰ ثانیه) و بعد از آن هیچ کاری نمی‌کند
      setInterval(function () {
        if (location.href !== lastHref) {
          lastHref = location.href; decided = false; checks = 0;
          if (keyNow() !== pageKey) {
            pageKey = keyNow(); pending = true;
            getDraft(pageKey, function (d) {
              STATE.inp = (d && d.inp) || {}; STATE.type = (d && d.type) || STATE.type; STATE.an = (d && d.an) || null; STATE.under = null; STATE.underFin = null; STATE.view = "main";
              renderAll();
            });
          }
        }
        if (decided) return;
        checks++;
        if (detect()) { decided = true; LZ.kick(); }
        else if (checks > 14) decided = true;
      }, 1500);
    });
  });
})();
