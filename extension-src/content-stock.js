/* پنل شناور چک‌لیست خرید سهام */
(function () {
  "use strict";
  var OC = window.StockChecklist, OCC = window.SCCollect;
  if (!OC || !OCC) return;

  // ---- انتخاب متن: فریم‌های داخلی، متن انتخاب‌شده را به فریم اصلی می‌فرستند
  var lastSel = "";
  function selText() {
    try { return String(window.getSelection() || "").trim(); } catch (e) { return ""; }
  }
  if (window.top !== window) {
    document.addEventListener("selectionchange", function () {
      var t = selText();
      if (t) { try { window.top.postMessage({ __scSel: t }, "*"); } catch (e) {} }
    });
    return;
  }
  if (window.__scLoaded) return;
  window.__scLoaded = true;
  window.addEventListener("message", function (e) {
    if (e.data && typeof e.data.__scSel === "string") lastSel = e.data.__scSel;
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
          var kk = "S." + k;
          chrome.storage.local.get(kk, function (r) { cb(r && r[kk]); });
          return;
        }
      } catch (e) {}
      try { cb(JSON.parse(localStorage.getItem("sc:" + k))); } catch (e) { cb(null); }
    },
    set: function (k, v) {
      try {
        if (window.chrome && chrome.storage && chrome.storage.local) { var o = {}; o["S." + k] = v; chrome.storage.local.set(o); return; }
      } catch (e) {}
      try { localStorage.setItem("sc:" + k, JSON.stringify(v)); } catch (e) {}
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
    { n: 0, title: "مشخصات" }, { n: 1, title: "وضعیت سهم" }, { n: 2, title: "نقدشوندگی" }, { n: 3, title: "تکنیکال" },
    { n: 4, title: "سود و زیان" }, { n: 5, title: "اندازه معامله" }, { n: 6, title: "برنامه خروج" },
  ];
  function isSell() { return false; }
  var MODE_LABEL = { trend: "خرید روندی", pull: "خرید روی اصلاح", "break": "خرید شکست" };
  var FIELDS = [
    { k: "capital", step: 0, t: "num", l: "سرمایه کل من برای بورس (ریال)" },
    { k: "name_o", step: 0, t: "text", l: "نماد سهم" },
    { k: "S", step: 0, t: "num", l: "آخرین معامله (ریال)", sel: 1 },
    { k: "entry", step: 0, t: "num", l: "قیمتی که می‌خواهم با آن بخرم (ریال) — خالی = آخرین معامله", sel: 1 },
    { k: "q_thesis", step: 1, t: "yn", l: "دلیل مشخص و مکتوب برای خرید این سهم دارم" },
    { k: "q_halt", step: 1, t: "yn", l: "سهم الان معامله می‌شود (بسته یا متوقف نیست)" },
    { k: "q_event", step: 1, t: "yn", l: "تا افق نگهداری‌ام رویداد مهم (مجمع، تقسیم سود، افزایش سرمایه) دارد؟" },
    { k: "q_market", step: 1, t: "yn", l: "روند کلی بازار و صنعت این سهم منفی نیست" },
    { k: "q_fund", step: 1, t: "yn", l: "از نظر بنیادی (سودآوری، گزارش‌ها، بدهی) مشکل جدی ندارد" },
    { k: "pe", step: 1, t: "num", l: "P/E سهم (اختیاری)", sel: 1 },
    { k: "pe_sec", step: 1, t: "num", l: "P/E صنعت (اختیاری)", sel: 1 },
    { k: "val_u", step: 2, t: "num", l: "میانگین ارزش معاملات روزانه (میلیارد ریال)", sel: 1 },
    { k: "vol_a", step: 2, t: "num", l: "میانگین حجم روزانه (سهم)", sel: 1 },
    { k: "ask", step: 2, t: "num", l: "بهترین قیمت فروش (ریال)", sel: 1 },
    { k: "bid", step: 2, t: "num", l: "بهترین قیمت خرید (ریال)", sel: 1 },
    { k: "q_sq", step: 2, t: "yn", l: "سهم الان در صف فروش است؟" },
    { k: "q_bq", step: 2, t: "yn", l: "سهم الان در صف خرید قفل است؟" },
    { k: "stop", step: 4, t: "num", l: "حد ضرر من (ریال) — خالی = پیشنهاد خودکار", sel: 1 },
    { k: "target", step: 4, t: "num", l: "هدف من (ریال) — خالی = مقاومت بعدی", sel: 1 },
    { k: "p", step: 4, t: "pct", l: "احتمال واقع‌بینانه رسیدن به هدف پیش از حد ضرر (٪)" },
    { k: "qty", step: 5, t: "num", l: "تعداد سهمی که می‌خواهم بخرم — خالی = حداکثر مجاز", sel: 1 },
    { k: "q_plan", step: 6, t: "yn", l: "حد ضرر، هدف و زمان خروج را نوشتم و اجرا می‌کنم" },
    { k: "q_lock", step: 6, t: "yn", l: "می‌دانم اگر سهم در صف فروش برود حد ضرر اجرا نمی‌شود و می‌پذیرم" },
    { k: "q_time", step: 6, t: "yn", l: "اگر تا چند روز حرکت نکرد، از سهم خارج می‌شوم" },
  ];
  function fieldShown() { return true; }
  function fieldLabel(f) { return f.l; }

  var STATE = { type: "trend", inp: {}, st: {}, an: null, open: { 0: true }, collapsed: true, vdetOpen: false, showSettings: false, showThr: false, riskOpen: true, view: "main", cmp: [], chartCfg: { n: 120, h: 10, fib: 1, sma: 1, bb: 0, sr: 1, rsi: 1, macd: 1, stoch: 0, adx: 0 }, fin: { unit: 1000000, infl: 0.35, y0: {}, y1: {}, manual: {}, tables: {} } };
  function legacyKey() { return "stk:" + location.origin + location.pathname + location.search; }
  function keyNow() { var c = OCC.insCodeFromUrl(location.href); return c ? "stk:code:" + c : legacyKey(); }
  var pageKey = keyNow();
  var FIN_DEF = function () { return { unit: 1000000, infl: 0.35, y0: {}, y1: {}, manual: {}, tables: {}, hist: {}, slots: { bs: null, is: null, cf: null } }; };
  var symLoaded = false;
  var OPEN_D = {};

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
  host.id = "sc-checklist-host";
  host.style.cssText = "all:initial;position:fixed;top:12px;right:12px;z-index:2147483647;display:none;";
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
    '.chips{display:flex;flex-wrap:wrap;gap:5px;margin:0 12px 8px;align-items:center}' +
    '.chips .lb{font-size:11px;color:var(--mut);margin-inline-end:2px}' +
    '.chip{border:1px solid var(--line);background:var(--bg2);color:var(--mut);border-radius:99px;padding:3px 10px;font-size:11px;font-weight:600}' +
    '.chip.on{background:var(--acc);color:var(--accfg);border-color:var(--acc)}' +
    '.cvwrap{margin:0 12px 8px;border:1px solid var(--line);border-radius:12px;background:var(--bg);overflow:hidden}' +
    '.cvwrap canvas{display:block;width:100%}' +
    '.cvinfo{margin:0 12px 6px;font-size:11px;color:var(--mut);min-height:18px;direction:ltr;text-align:left;font-variant-numeric:tabular-nums}' +
    '.pbig{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}' +
    '.pbig .pv{font-size:26px;font-weight:800;color:var(--acc);direction:ltr}' +
    '.pbar{height:8px;border-radius:99px;background:linear-gradient(90deg,#ef4444,#eab308 50%,#22c55e);position:relative;margin:8px 0 2px;direction:ltr}' +
    '.pbar i{position:absolute;top:-3px;width:3px;height:14px;background:var(--fg);border-radius:2px}' +
    '.pbar b{position:absolute;top:2px;height:4px;background:rgba(0,0,0,.35);border-radius:2px}' +
    '.fgrid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr);gap:5px 8px;align-items:center;margin:0 12px 8px}' +
    '.fgrid .h{font-size:11px;color:var(--mut);font-weight:700;text-align:center}' +
    '.fgrid label{font-size:11.5px}' +
    '.fgrid input,.fset input,.fset select{padding:6px 8px;border:1.5px solid transparent;background:var(--inp);border-radius:8px;font-size:12px;color:var(--fg);direction:ltr;text-align:center;font-variant-numeric:tabular-nums;outline:none;width:100%}' +
    '.fgrid input:focus,.fset input:focus{border-color:var(--acc);background:var(--inpf)}' +
    '.fset{margin:0 12px 8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}' +
    '.fset .btn{border:1px solid var(--line);background:var(--bg2);color:var(--fg);border-radius:10px;padding:7px 12px;font-size:11.5px;font-weight:600}' +
    '.fset .btn.pri{background:var(--acc);color:var(--accfg);border-color:var(--acc)}' +
    '.fset .f1{flex:0 0 130px}.fset label{font-size:11px;color:var(--mut)}' +
    '.pio{display:flex;gap:6px;padding:3px 0;font-size:11.5px;border-top:1px solid var(--line)}' +
    '.pio:first-child{border-top:0}' +
    '.body::-webkit-scrollbar{width:8px}.body::-webkit-scrollbar-thumb{background:var(--line);border-radius:99px}' +
    '.panel{border-radius:20px}' +
    '.hd{padding:10px 12px;gap:7px}' +
    '.hd .lg{display:grid;place-items:center;flex:none}' +
    '.hd .ttl{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.4}' +
    '.hd .ttl b{flex:none;font-size:13.5px}' +
    '.hd .ctx{font-size:11px;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500}' +
    '.hd #cmpb{width:auto;min-width:28px;padding:0 7px;gap:3px;display:flex;align-items:center;font-size:13px}' +
    '.hd #cmpb .n{background:#fff;color:#4f46e5;border-radius:99px;padding:0 5px;font-size:10px;font-weight:700;line-height:1.55}' +
    '.verdict{margin:10px 12px 0;border-radius:14px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.05)}' +
    '.seg{display:flex;align-items:center;gap:3px;background:var(--inp);border-radius:12px;padding:3px;margin:8px 12px 0}' +
    '.seg .lb{font-size:10.5px;color:var(--mut);padding:0 9px;font-weight:600;white-space:nowrap}' +
    '.seg button{flex:1;padding:6px 4px;border:0;border-radius:9px;background:transparent;color:var(--mut);font-size:12px;font-weight:700;transition:all .15s}' +
    '.seg button:hover{color:var(--fg)}' +
    '.seg button.on{background:var(--bg);color:var(--acc);box-shadow:0 1px 4px rgba(24,28,60,.16)}' +
    '.body{padding-top:10px}' +
    '.dock{flex:none;border-top:1px solid var(--line);background:var(--bg);padding:7px 8px 8px;display:flex;flex-direction:column;gap:6px;box-shadow:0 -6px 16px rgba(24,28,60,.05)}' +
    '.dock .sub{display:flex;gap:5px;overflow-x:auto;padding:1px 2px;scrollbar-width:none}' +
    '.dock .sub::-webkit-scrollbar{display:none}' +
    '.dock .sub button{flex:1 1 auto;white-space:nowrap;border:1px solid var(--line);background:var(--bg2);color:var(--mut);border-radius:99px;padding:5px 12px;font-size:11.5px;font-weight:600;transition:all .15s}' +
    '.dock .sub button:hover{color:var(--fg);border-color:var(--acc)}' +
    '.dock .sub button.on{background:var(--acc);color:var(--accfg);border-color:var(--acc);box-shadow:0 3px 10px rgba(79,70,229,.32)}' +
    '.dock .nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px}' +
    '.dock .nav button{display:flex;flex-direction:column;align-items:center;gap:1px;border:0;background:transparent;color:var(--mut);padding:5px 2px 4px;border-radius:12px;font-size:10.5px;font-weight:700;transition:all .15s}' +
    '.dock .nav button .ic{font-size:18px;line-height:1.2;filter:grayscale(.6);opacity:.72;transition:all .15s}' +
    '.dock .nav button:hover{background:var(--bg2);color:var(--fg)}' +
    '.dock .nav button.on{color:var(--acc);background:var(--acc2)}' +
    '.dock .nav button.on .ic{filter:none;opacity:1;transform:translateY(-1px) scale(1.1)}' +
    '.foot{padding:8px 12px;gap:6px}' +
    '.sg{box-shadow:0 1px 3px rgba(24,28,60,.05)}' +
    '.sg h5{display:flex;align-items:center;gap:7px;font-size:12.8px;margin:0 0 7px}' +
    '.sg h5::before{content:"";flex:none;width:4px;height:15px;border-radius:3px;background:linear-gradient(180deg,#4f46e5,#7c3aed)}' +
    '.note{border:1px solid var(--line)}' +
    '.sm button,.fset button:not(.btn){border:1px solid var(--line);background:var(--bg2);color:var(--fg);border-radius:11px;padding:9px 10px;font-size:12px;font-weight:600;transition:all .15s}' +
    '.sm button:hover,.fset button:not(.btn):hover{border-color:var(--acc);color:var(--acc)}' +
    '.sm button.pri,.fset button.pri:not(.btn){background:var(--acc);color:var(--accfg);border-color:var(--acc);font-weight:700;box-shadow:0 4px 12px rgba(79,70,229,.28)}' +
    '.sm button.pri:hover{filter:brightness(1.08);color:var(--accfg)}' +
    '.panel button:disabled{opacity:.5;cursor:not-allowed;box-shadow:none}' +
    '.panel button:focus-visible,.panel input:focus-visible{outline:2px solid var(--acc);outline-offset:1px}' +
    '.sm input[type=text],.sm input:not([type]){transition:border-color .15s,background .15s}' +
    '[id$="res"]>.msg,[id$="body"]>.msg{margin:8px 12px 0}' +
    '.g2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 8px}' +
    '.acts{display:flex;gap:6px;margin:4px 12px 14px}' +
    '.acts button{flex:1;padding:9px 4px;border:1px solid var(--line);background:var(--bg2);color:var(--fg);border-radius:11px;font-size:11.5px;font-weight:600;transition:all .15s}' +
    '.acts button:hover{border-color:var(--acc);color:var(--acc)}' +
    '.acts button.pri{background:var(--acc);color:var(--accfg);border-color:var(--acc);font-weight:700;box-shadow:0 4px 12px rgba(79,70,229,.28)}' +
    '.acts button.pri:hover{color:var(--accfg);filter:brightness(1.08)}' +
    '.panel input[type=range]{accent-color:var(--acc)}' +
    '</style><div id="mount"></div>';
  document.documentElement.appendChild(host);
  var mount = root.getElementById("mount");
  root.querySelector("style").textContent += (window.AdvisorUI ? window.AdvisorUI.CSS : "");

  var STEP_TITLES = function () {
    return ["مرحله ۰ — مشخصات", "مرحله ۱ — وضعیت سهم", "مرحله ۲ — نقدشوندگی", "مرحله ۳ — تکنیکال", "مرحله ۴ — سود و زیان", "مرحله ۵ — اندازه معامله", "مرحله ۶ — برنامه خروج"];
  };

  function persist() { if (!symLoaded) return; STATE.at = Date.now(); store.set(pageKey, { type: STATE.type, inp: STATE.inp, an: STATE.an, at: STATE.at }); }
  function persistUi() { store.set("ui", { riskOpen: STATE.riskOpen }); }
  function persistSettings() { store.set("settings", STATE.st); }


  // ================= مقایسه اختیارها =================
  var CMP_MAX = 20;
  var SYM_BUY = { "✅": "بخر", "⚠": "فعلاً نخر", "❌": "نخر", "⏳": "ناقص" };
  function symLabel(sym) { return SYM_BUY[sym]; }
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
    { id: "final", l: "نتیجه نهایی", html: function (it) { return it.r.final.sym + " " + symLabel(it.r.final.sym); } },
    { id: "steps", l: "مرحله‌های ۱ تا ۶", html: function (it) { var o = ""; for (var i = 1; i <= 6; i++) o += it.r.steps[i].status; return o; } },
    { id: "cnt", l: "ردها / هشدارها", html: function (it) { return fa(it.r.nHard) + " رد · " + fa(it.r.nWarn) + " هشدار"; } },
    { g: "قیمت" },
    { id: "S", l: "آخرین معامله", v: function (it) { return num0(it.e.inp.S); }, f: "money" },
    { id: "E", l: "قیمت ورود", v: function (it) { return it.r.R.E; }, f: "money" },
    { g: "تکنیکال" },
    { id: "score", l: "امتیاز تکنیکال (از ۱۰۰)", v: function (it) { return it.r.R.score; }, f: "int", better: "high" },
    { id: "trend", l: "روند", html: function (it) { return it.r.R.trend || "—"; } },
    { id: "rsi", l: "RSI", v: function (it) { return it.r.R.rsi; }, f: "int" },
    { id: "atrp", l: "نوسان روزانه (ATR)", v: function (it) { return it.r.R.atrp; }, f: "pct2" },
    { id: "dHigh", l: "فاصله از سقف یک‌ساله", v: function (it) { return it.r.R.dHigh; }, f: "pct1", better: "high" },
    { id: "ext", l: "فاصله از میانگین ۲۰ (برابر ATR)", v: function (it) { return it.r.R.ext; }, f: "ratio1" },
    { id: "volratio", l: "حجم نسبی امروز", v: function (it) { return it.r.R.volratio; }, f: "ratio1", better: "high" },
    { id: "power", l: "قدرت خریدار حقیقی", v: function (it) { return it.r.R.power; }, f: "ratio2", better: "high" },
    { g: "سود و زیان" },
    { id: "stopPct", l: "فاصله حد ضرر", v: function (it) { return it.r.R.stopPct; }, f: "pct1", better: "low" },
    { id: "tgtPct", l: "فاصله هدف اول", v: function (it) { return it.r.R.tgtPct; }, f: "pct1", better: "high" },
    { id: "rr", l: "نسبت سود به ریسک", v: function (it) { return it.r.R.rr; }, f: "ratio1", better: "high" },
    { id: "pEmp", l: "احتمال تاریخی", v: function (it) { return it.r.R.pEmp; }, f: "pct0", better: "high" },
    { id: "p", l: "احتمال من", v: function (it) { return num0(it.e.inp.p); }, f: "pct0", better: "high" },
    { id: "ev", l: "امید ریاضی (با احتمال من)", v: function (it) { return it.r.ev; }, f: "ratio2", better: "high" },
    { g: "نقدشوندگی و اندازه" },
    { id: "val_u", l: "ارزش معاملات روزانه (میلیارد)", v: function (it) { return num0(it.e.inp.val_u); }, f: "money", better: "high" },
    { id: "spread", l: "اسپرد", v: function (it) { return it.r.R.spread; }, f: "pct2", better: "low" },
    { id: "qMax", l: "حداکثر تعداد مجاز", v: function (it) { return it.r.R.qMax; }, f: "money" },
    { id: "posVal", l: "ارزش پوزیشن (ریال)", v: function (it) { return it.r.R.posVal; }, f: "money" },
  ];
  function num0(x) { var n = Number(x); return (x === null || x === undefined || x === "" || !isFinite(n)) ? null : n; }
  function renderCmpBody() {
    var el = root.getElementById("cmpbody");
    if (!el) return;
    var list = STATE.cmp || [];
    refreshCmpBadge();
    if (!list.length) {
      el.innerHTML = '<div class="empty">هنوز سهمی ذخیره نکرده‌ای.<br>روی صفحه هر سهم، اطلاعاتش را پر کن و دکمه «ذخیره برای مقایسه» را بزن؛ بعد برو سراغ سهم بعدی.</div>';
      STATE.tsv = "";
      return;
    }
    var items = list.map(function (e) { return { e: e, r: OC.evaluate(e.type, e.inp, STATE.st, e.an) }; });
    items.sort(function (a, b) {
      var d = SYM_RANK[a.r.final.sym] - SYM_RANK[b.r.final.sym];
      if (d) return d;
      var ea = numOk(a.r.score) ? a.r.score : -1, eb = numOk(b.r.score) ? b.r.score : -1;
      return eb - ea;
    });
    function nm(it) { return it.e.inp.name_o || it.e.name; }
    var h = '<div class="rk">';
    items.forEach(function (it, i) {
      h += '<div class="it"><span class="no">' + fa(i + 1) + '</span><span class="nm">' + esc(nm(it)) + '</span><span>' + it.r.final.sym + " " + symLabel(it.r.final.sym) + '</span>' +
        '<span class="mt">' + esc(MODE_LABEL[it.e.type] || it.e.type) + ' · امتیاز ' + esc(fmt(it.r.score, "int")) + ' · سود/ریسک ' + esc(fmt(it.r.R.rr, "ratio1")) + '</span></div>';
    });
    h += '</div><div class="cmp"><table><thead><tr><th class="lab">سهم</th>';
    items.forEach(function (it, i) {
      var t = new Date(it.e.at), hm = "";
      try { hm = t.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }); } catch (x) {}
      h += '<th><div class="nm">' + fa(i + 1) + '# ' + esc(nm(it)) + '</div><div class="sub">' + esc(MODE_LABEL[it.e.type] || it.e.type) + ' · ذخیره ' + esc(hm) + '</div>' +
        '<div class="ac"><a href="' + esc(it.e.url || "#") + '" target="_blank" rel="noopener" title="باز کردن صفحه این سهم">↗</a>' +
        '<button data-del="' + esc(it.e.key) + '" title="حذف از مقایسه">✕</button></div></th>';
    });
    h += '</tr></thead><tbody>';
    var tsv = [["سهم"].concat(items.map(nm)).join("\t")];
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
    h += '</tbody></table></div><div class="legend">سبز = بهترین مقدار در آن ردیف، قرمز = بدترین. رتبه‌بندی اول بر اساس نتیجه نهایی و بعد امتیاز تکنیکال است. همه سهم‌ها با ریسک‌پذیری و آستانه‌های فعلی بالا محاسبه شده‌اند؛ اگر اعداد یک سهم عوض شد، صفحه‌اش را باز کن و دوباره «ذخیره برای مقایسه» را بزن.</div>';
    STATE.tsv = tsv.join("\n");
    el.innerHTML = h;
    el.querySelectorAll("[data-del]").forEach(function (b) { b.onclick = function () { delCmp(b.dataset.del); }; });
  }




  // ================= تب «📒 پورتفو و دفتر معاملات» =================
  var PF = { data: null, prices: {}, at: 0, busy: false, msg: "" };
  function pfLoad(cb) {
    if (PF.data) { cb(); return; }
    store.get("portfolio:v1", function (v) { PF.data = v && v.open ? v : { open: [], closed: [] }; cb(); });
  }
  function pfSave() { store.set("portfolio:v1", PF.data); }
  function pfFees() { var ef = OC.effective ? OC.effective(STATE.st || {}) : {}; return { fb: ef.fee_buy || 0.0037, fs: ef.fee_sell || 0.0088, maxpos: ef.maxpos || 0.25 }; }
  function pfRefresh(force) {
    if (PF.busy || !PF.data) return;
    var open = PF.data.open.filter(function (p) { return p.ins; });
    if (!open.length || (!force && Date.now() - PF.at < 45000)) return;
    PF.busy = true; PF.msg = "در حال گرفتن قیمت لحظه‌ای…"; var st0 = root.getElementById("pfstatus"); if (st0) st0.textContent = PF.msg;
    var seen = {}, uniq = open.filter(function (p) { if (seen[p.ins]) return false; seen[p.ins] = 1; return true; });
    Promise.all(uniq.map(function (p) { return SCCollect.quickPrice(p.ins).then(function (r) { if (r && r.S > 0) PF.prices[p.ins] = r; }).catch(function () {}); })).then(function () {
      PF.busy = false; PF.at = Date.now(); PF.msg = "قیمت‌ها به‌روز شد"; if (STATE.view === "pf") renderPfResult();
    });
  }
  function renderPfBody() {
    var el = root.getElementById("pfbody"); if (!el) return;
    pfLoad(function () {
      var code = OCC.insCodeFromUrl(location.href), sym = STATE.inp.name_o || "";
      el.innerHTML = '<div class="note">دفتر خرید و فروش خودت: سهم‌هایی که الان داری را ثبت کن تا سود و زیان خالص (بعد از کارمزد و مالیات)، فاصله تا حد ضرر و هدف، و ریسک کل پرتفو را یک‌جا ببینی؛ و بعد از فروش، آمار واقعی معامله‌هایت (درصد موفقیت، میانگین سود و زیان) را ببینی. داده‌ها فقط روی همین مرورگر ذخیره می‌شوند.</div>' +
        '<div class="sm" id="pfform" style="margin:0 12px 8px"><b style="font-size:12px">ثبت خرید ' + (sym ? "«" + esc(sym) + "»" : "این سهم") + '</b>' +
        '<div class="g2"><div><label>قیمت خرید (ریال)</label><input type="text" inputmode="decimal" id="pf_buy" value="' + esc(STATE.inp.S || "") + '"></div>' +
        '<div><label>تعداد سهم</label><input type="text" inputmode="decimal" id="pf_qty"></div>' +
        '<div><label>حد ضرر (اختیاری)</label><input type="text" inputmode="decimal" id="pf_stop"></div>' +
        '<div><label>هدف فروش (اختیاری)</label><input type="text" inputmode="decimal" id="pf_tgt"></div></div>' +
        '<div style="display:flex;gap:6px;margin-top:8px"><button id="pfadd" class="pri" style="flex:2"' + (code ? "" : " disabled") + '>➕ ثبت در پورتفو</button><button id="pffill" style="flex:2">⚡ حد ضرر/هدف از طرح نوسان‌گیری</button></div>' +
        (code ? "" : '<div class="legend" style="margin:6px 0 0">برای ثبت، صفحه‌ی خود سهم (InstInfo) باید باز باشد.</div>') + '</div>' +
        '<div id="pfstatus" class="legend" style="margin:0 12px 6px">' + esc(PF.msg || "") + '</div><div id="pfres"></div>';
      var val = function (id) { var e = root.getElementById(id); var n = parseNum(e ? e.value : ""); return n; };
      root.getElementById("pfadd").onclick = function () {
        var buy = val("pf_buy"), qty = val("pf_qty"), stop = val("pf_stop"), tgt = val("pf_tgt");
        if (!(buy > 0) || !(qty >= 1)) { PF.msg = "قیمت خرید و تعداد (حداقل ۱) را درست وارد کن."; var s = root.getElementById("pfstatus"); if (s) s.textContent = PF.msg; return; }
        if (stop && stop >= buy) { PF.msg = "حد ضرر باید کمتر از قیمت خرید باشد."; root.getElementById("pfstatus").textContent = PF.msg; return; }
        if (tgt && tgt <= buy) { PF.msg = "هدف باید بیشتر از قیمت خرید باشد."; root.getElementById("pfstatus").textContent = PF.msg; return; }
        PF.data.open.push({ id: Date.now(), ins: code, sym: sym || ("نماد " + code), buy: buy, qty: Math.floor(qty), stop: stop || null, target: tgt || null, date: new Date().toISOString().slice(0, 10) });
        pfSave(); PF.msg = "ثبت شد ✅"; ["pf_qty", "pf_stop", "pf_tgt"].forEach(function (k) { root.getElementById(k).value = ""; });
        PF.at = 0; renderPfResult(); pfRefresh(true);
      };
      root.getElementById("pffill").onclick = function () {
        try {
          if (!STATE.an || !STATE.an.bars) throw new Error("سابقه‌ی قیمت هنوز خوانده نشده");
          var ef = OC.effective ? OC.effective(STATE.st || {}) : {};
          var A = window.SwingTrade.analyze({ bars: STATE.an.bars, S: num0(STATE.inp.S), fb: ef.fee_buy, fs: ef.fee_sell, lim: ef.lim, minVal: num0(STATE.inp.scr_min) || 20, ev: swtEvents() });
          if (!A.ok) throw new Error(A.err);
          root.getElementById("pf_stop").value = Math.round(A.plan.stop); root.getElementById("pf_tgt").value = Math.round(A.plan.t1);
          PF.msg = "حد ضرر و هدف اول طرح نوسان‌گیری پر شد؛ قیمت خرید و تعداد را خودت وارد کن."; root.getElementById("pfstatus").textContent = PF.msg;
        } catch (e) { root.getElementById("pfstatus").textContent = "نشد: " + (e.message || e); }
      };
      root.getElementById("pfres").addEventListener("click", function (ev) {
        var b = ev.target.closest("[data-act]"); if (!b) return;
        var id = Number(b.dataset.id), act = b.dataset.act, p = PF.data.open.filter(function (x) { return x.id === id; })[0];
        if (act === "refresh") { pfRefresh(true); return; }
        if (act === "csv") {
          var rows = [["نماد", "تاریخ خرید", "تاریخ فروش", "تعداد", "قیمت خرید", "قیمت فروش", "سود خالص ریال", "سود خالص درصد"]].concat(PF.data.closed.map(function (t) { return [t.sym, t.date, t.closeDate, t.qty, t.buy, t.sell, Math.round(t.net), (t.netPct * 100).toFixed(2)]; }));
          var csv = rows.map(function (r) { return r.join(","); }).join("\n");
          try { navigator.clipboard.writeText(csv); PF.msg = "دفتر معاملات (CSV) کپی شد."; } catch (e) { PF.msg = "کپی نشد."; }
          var s2 = root.getElementById("pfstatus"); if (s2) s2.textContent = PF.msg; return;
        }
        if (act === "wipe") { if (confirm("کل پورتفو و دفتر معاملات پاک شود؟ (برگشت‌ناپذیر)")) { PF.data = { open: [], closed: [] }; pfSave(); renderPfResult(); } return; }
        if (!p) return;
        var f = pfFees();
        if (act === "del") { if (confirm("«" + p.sym + "» بدون ثبت در دفتر معاملات حذف شود؟")) { PF.data.open = PF.data.open.filter(function (x) { return x.id !== id; }); pfSave(); renderPfResult(); } return; }
        if (act === "close") {
          var live = PF.prices[p.ins] && PF.prices[p.ins].S, ans = prompt("قیمت فروش «" + p.sym + "» (ریال):", live ? Math.round(live) : "");
          var sp = parseNum(ans || ""); if (!(sp > 0)) return;
          var net = p.qty * (sp * (1 - f.fs) - p.buy * (1 + f.fb)), cost = p.qty * p.buy * (1 + f.fb);
          PF.data.closed.push({ id: p.id, ins: p.ins, sym: p.sym, qty: p.qty, buy: p.buy, sell: sp, date: p.date, closeDate: new Date().toISOString().slice(0, 10), net: net, netPct: net / cost, stop: p.stop, target: p.target });
          PF.data.open = PF.data.open.filter(function (x) { return x.id !== id; }); pfSave(); renderPfResult();
        }
      });
      renderPfResult(); pfRefresh(false);
    });
  }
  function renderPfResult() {
    var el = root.getElementById("pfres"); if (!el || !PF.data) return;
    var f = pfFees(), cap = num0(STATE.inp.capital), D = PF.data, line = function (a, b, cls) { return '<div class="line' + (cls ? " " + cls : "") + '"><span>' + a + '</span><span class="vv">' + b + '</span></div>'; };
    var m = function (x) { return fa(fnum(Math.round(x))); }, col = function (x) { return 'style="color:var(--' + (x >= 0 ? "ok" : "bad") + '-fg)"'; };
    var h = "", tc = 0, tv = 0, tr = 0, nPriced = 0, warns = [];
    if (!D.open.length) h += '<div class="msg wait" style="text-align:center">سهمی در پورتفو نیست. با فرم بالا اولین خرید را ثبت کن.</div>';
    else {
      h += '<div class="sg"><h5>📈 سهم‌های فعلی (' + fa(D.open.length) + ')</h5>';
      D.open.forEach(function (p) {
        var pr = PF.prices[p.ins], S = pr && pr.S, cost = p.qty * p.buy * (1 + f.fb), be = p.buy * (1 + f.fb) / (1 - f.fs);
        tc += cost; if (p.stop) tr += p.qty * (p.buy * (1 + f.fb) - p.stop * (1 - f.fs));
        var badge = "⏳", note = "", net = null, netPct = null;
        if (S) { nPriced++; tv += p.qty * S * (1 - f.fs); net = p.qty * S * (1 - f.fs) - cost; netPct = net / cost;
          if (p.stop && S <= p.stop) { badge = "⛔"; note = "به حد ضرر رسیده یا رد شده؛ طبق برنامه بفروش"; warns.push(p.sym + ": حد ضرر خورد"); }
          else if (p.target && S >= p.target) { badge = "💰"; note = "به هدف رسیده؛ طبق برنامه (بخش یا همه) بفروش"; }
          else if (p.stop && S <= p.stop * 1.015) { badge = "⚠"; note = "کمتر از ۱٫۵٪ تا حد ضرر مانده"; }
          else if (S >= be) badge = "🟢"; else badge = "🟡"; }
        var held = Math.max(0, Math.round((Date.now() - new Date(p.date).getTime()) / 86400000));
        if (cap && cost / cap > f.maxpos) warns.push(p.sym + ": بیش از " + Math.round(f.maxpos * 100) + "٪ سرمایه در یک سهم");
        h += '<div style="border-top:1px solid var(--line);padding:6px 0"><div style="display:flex;justify-content:space-between;align-items:center"><b>' + badge + " " + esc(p.sym) + '</b><span style="font-size:11px;color:var(--mut)">' + fa(fnum(p.qty)) + " سهم · " + fa(held) + ' روز تقویمی</span></div>' +
          line("خرید → الان", m(p.buy) + " → " + (S ? m(S) : "—")) +
          line("سود/زیان خالص", S ? '<span ' + col(net) + '>' + pctS(netPct) + " (" + tmn(net, true) + ")</span>" : "—") +
          line("سر به سر / حد ضرر / هدف", m(be) + " / " + (p.stop ? m(p.stop) : "—") + " / " + (p.target ? m(p.target) : "—")) +
          (S && p.stop ? line("فاصله تا حد ضرر", pctS(p.stop / S - 1)) : "") + (S && p.target ? line("فاصله تا هدف", pctS(p.target / S - 1)) : "") +
          (note ? '<div style="font-size:11.5px;color:var(--mut);margin-top:2px">' + esc(fa(note)) + '</div>' : "") +
          '<div class="fset" style="margin-top:4px"><button class="btn" data-act="close" data-id="' + p.id + '">فروختم (ثبت در دفتر)</button><button class="btn" data-act="del" data-id="' + p.id + '">حذف</button></div></div>';
      });
      h += '</div>';
      h += '<div class="sg"><h5>🧮 جمع پرتفو</h5>' + line("سرمایه‌ی درگیر (با کارمزد خرید)", tmn(tc)) +
        (nPriced ? line("ارزش فعلی بعد از کارمزد و مالیات فروش", tmn(tv)) + line("سود/زیان خالص کل", '<span ' + col(tv - tc) + '>' + pctS((tv - tc) / tc) + " (" + tmn(tv - tc, true) + ")</span>") : line("ارزش فعلی", "قیمت‌ها هنوز نیامده")) +
        (tr > 0 ? line("اگر همه به حد ضرر برسند، زیان کل", tmn(-tr, true) + (cap ? " = " + fa((tr / cap * 100).toFixed(1)) + "٪ سرمایه" : "")) : '<div class="legend" style="margin:4px 0">برای هیچ سهمی حد ضرر ثبت نشده؛ ریسک کل قابل محاسبه نیست.</div>') +
        (cap ? line("نسبت سرمایه‌ی درگیر به کل سرمایه", fa(Math.round(tc / cap * 100)) + "٪") : '<div class="legend" style="margin:4px 0">«سرمایه کل» را در تب چک‌لیست وارد کنی، سهم هر نماد و ریسک کل نسبت به سرمایه هم نشان داده می‌شود.</div>') +
        (warns.length ? '<div class="msg w" style="margin-top:6px;font-size:12px">' + warns.map(function (x) { return "⚠ " + esc(fa(x)); }).join("<br>") + '</div>' : "") +
        '<div class="fset"><button class="btn" data-act="refresh">🔄 قیمت‌ها را به‌روز کن</button></div></div>';
    }
    // آمار دفتر معاملات
    var C = D.closed;
    if (C.length) {
      var w = C.filter(function (t) { return t.net > 0; }), l = C.filter(function (t) { return t.net <= 0; }), avg = function (a, k) { return a.length ? a.reduce(function (s, x) { return s + x[k]; }, 0) / a.length : null; };
      var gw = w.reduce(function (s, x) { return s + x.net; }, 0), gl = -l.reduce(function (s, x) { return s + x.net; }, 0), tot = gw - gl;
      h += '<div class="sg"><h5>📓 آمار واقعی معامله‌های بسته‌شده (' + fa(C.length) + ')</h5>' +
        line("درصد موفقیت", fa(Math.round(w.length / C.length * 100)) + "٪ (" + fa(w.length) + " سود، " + fa(l.length) + " زیان)") +
        line("میانگین سود هر معامله‌ی موفق", avg(w, "netPct") !== null ? pctS(avg(w, "netPct")) : "—") + line("میانگین زیان هر معامله‌ی ناموفق", avg(l, "netPct") !== null ? pctS(avg(l, "netPct")) : "—") +
        line("میانگین خالص هر معامله (امید ریاضی واقعی)", pctS(avg(C, "netPct"), 2)) + line("ضریب سود (جمع سودها ÷ جمع زیان‌ها)", gl > 0 ? fa((gw / gl).toFixed(2)) : "بدون زیان") +
        line("جمع سود/زیان خالص", '<span ' + col(tot) + '>' + tmn(tot, true) + '</span>') +
        '<div style="font-size:11.5px;margin-top:6px"><b>آخرین معامله‌ها</b></div>' + C.slice(-8).reverse().map(function (t) { return line(esc(t.sym) + " — " + esc(fa(t.closeDate)), m(t.buy) + " ← " + m(t.sell) + " (" + pctS(t.netPct) + ")"); }).join("") +
        '<div class="fset"><button class="btn" data-act="csv">📋 کپی دفتر (CSV)</button><button class="btn" data-act="wipe">پاک کردن همه</button></div></div>';
    }
    h += '<div class="legend" style="margin:0 12px 12px">قیمت لحظه‌ای از API خود TSETMC گرفته می‌شود و ممکن است چند دقیقه تأخیر یا خطا داشته باشد. کارمزدها از تنظیمات ⚙ همین سهم می‌آیند. سود و زیان خالص یعنی بعد از کارمزد خرید و کارمزد + مالیات فروش.</div>';
    el.innerHTML = h;
  }

  // ================= تب «🌊 نوسان‌گیری» =================
  function swtEvents() {
    var ev = { loaded: false, err: CDL.err || "", letters: [], agm: null, dps: null, ni: null, eq: null, fin: null };
    try {
      if (CDL.list && CDL.list.length) {
        ev.loaded = true;
        var a = cdlNextAgm();
        if (a) ev.agm = { daysTo: a.daysTo, kind: a.kind, from: jDaysTo(a.from), to: jDaysTo(a.to), date: jStr(a.date) };
        ev.letters = CDL.list.map(function (x) {
          var d = dateOf(toLat(x.date)); if (!d) return null;
          return { cls: cdlCls(x.title), title: String(x.title || "").replace(/[\u200c]/g, " "), ago: -jDaysTo(d), url: x.url };
        }).filter(Boolean);
      }
    } catch (e) { ev.loaded = false; ev.err = String(e); }
    try {
      var y0 = STATE.fin && STATE.fin.y0;
      if (y0) { ev.dps = y0.dps > 0 ? y0.dps : null; ev.ni = y0.ni === undefined ? null : y0.ni; ev.eq = y0.eq === undefined ? null : y0.eq; }
      var fv = finViewNow(); if (fv && fv.ok) ev.fin = { ok: true, score: fv.score, verdict: fv.verdict, bad: fv.bad, good: fv.good, pe: fv.pe, z: fv.z, fscore: fv.fscore };
    } catch (e) {}
    return ev;
  }
  function renderSwtBody() {
    var el = root.getElementById("swtbody"); if (!el) return;
    el.innerHTML = '<div class="note">برای سهمی که الان صفحه‌اش باز است: آیا برای نوسان‌گیری (خرید نزدیک کف بازه و فروش در چند روز نزدیک سقف) مناسب است، دقیقاً با چه قیمتی بخرم، کجا بفروشم و کجا ببُرم. همه‌ی عددها از سابقه‌ی همین سهم محاسبه و روی همان سابقه آزمایش می‌شوند.</div>' +
      '<div class="sm" id="swtform" style="margin:0 12px 8px">' + '<div class="g2"><div>' + holdIn("sw_cap", "سرمایه‌ی این معامله (ریال) — اختیاری", "مثلاً 500000000") + '</div><div>' +
      holdIn("sw_buy", "قیمت خرید من (اگر سهم را داری)", "مثلاً 12500") + '</div></div></div><div id="swtres"></div>';
    readHoldInputs(el); renderSwtResult();
    cdlEnsure(false, function () { if (STATE.view === "swt") renderSwtResult(); });
  }
  function renderSwtResult() {
    var el = root.getElementById("swtres"); if (!el) return;
    var ST = window.SwingTrade;
    if (!ST) { el.innerHTML = '<div class="msg w">موتور نوسان‌گیری بارگذاری نشد؛ افزونه را Reload کن.</div>'; return; }
    if (!STATE.an || !STATE.an.bars || STATE.an.bars.length < 80) { el.innerHTML = '<div class="msg w">سابقه‌ی قیمت این سهم هنوز خوانده نشده (یا کمتر از ۸۰ روز است). چند ثانیه صبر کن؛ اگر نیامد صفحه را Refresh کن.</div>'; return; }
    var ef = OC.effective ? OC.effective(STATE.st || {}) : (STATE.st || {});
    var A = ST.analyze({ bars: STATE.an.bars, S: num0(STATE.inp.S), fb: ef.fee_buy, fs: ef.fee_sell, lim: ef.lim, minVal: num0(STATE.inp.scr_min) || 20, ev: swtEvents() });
    if (!A.ok) { el.innerHTML = '<div class="msg w">' + esc(A.err) + '</div>'; return; }
    var P = A.plan, cap = num0(STATE.inp.sw_cap), E = num0(STATE.inp.sw_buy), HD = E ? ST.holding(A, E) : null;
    var f0 = function (x) { return fa(fnum(Math.round(x))); }, pc = function (x, d) { return pctS(x, d === undefined ? 1 : d); };
    var line = function (a, b, cls) { return '<div class="line' + (cls ? " " + cls : "") + '"><span>' + a + '</span><span class="vv">' + b + '</span></div>'; };
    var h = '<div class="msg ' + A.grade.cls + '" style="font-size:14px;text-align:center"><b>' + A.grade.sym + " " + esc(A.grade.text) + '</b><div style="font-weight:400;font-size:12px;margin-top:3px">' + esc(fa(A.grade.why)) + '</div></div>' +
      '<div class="msg ' + A.timing.cls + '" style="text-align:center"><b>' + A.timing.sym + " " + esc(A.timing.text) + '</b><div style="font-weight:400;font-size:12px;margin-top:3px">' + esc(fa(A.timing.why)) + '</div></div>';
    if (A.hard.length) h += '<div class="msg w" style="font-size:12px">چون «' + esc(A.hard.join("، ")) + '» دیده شد، طرح پایین فقط برای اطلاع است و پیشنهاد معامله نیست.</div>';
    // پوزیشن موجود
    if (HD) {
      h += '<div class="sg"><h5>📍 سهم را داری (خرید ' + f0(E) + ')</h5>' +
        '<div class="msg ' + HD.action.cls + '" style="margin:0 0 6px"><b>' + HD.action.sym + " " + esc(HD.action.text) + '</b><div style="font-weight:400;font-size:12px;margin-top:3px">' + esc(fa(HD.action.why)) + '</div></div>' +
        line("سود/زیان خالص همین الان (بعد از کارمزد و مالیات)", '<span style="color:' + (HD.netNow >= 0 ? "var(--ok-fg)" : "var(--bad-fg)") + '">' + pc(HD.netNow) + '</span>') +
        line("قیمت سر به سر (از آن بالاتر واقعاً سود می‌کنی)", f0(HD.be)) +
        line("هدف ۱ — نصف را بفروش", f0(HD.t1) + " (" + pc(HD.netT1) + ")") + line("هدف ۲ — بقیه را بفروش", f0(HD.t2) + " (" + pc(HD.netT2) + ")") +
        line("حد ضرر", f0(HD.stop) + " (" + pc(HD.netStop) + ")") + '</div>' +
        (HD.eventNote ? '<div class="msg w" style="font-size:12px">📢 ' + esc(fa(HD.eventNote)) + '</div>' : "") + (HD.aboveRange ? '<div class="msg w" style="font-size:12px">قیمت خریدت نزدیک یا بالای سقف بازه‌ی ۲۰ روزه است؛ هدف‌ها بر پایه‌ی حداقل سود بعد از کارمزد گذاشته شده‌اند نه سقف تازه‌ای که قیمت دیده باشد.</div>' : "");
    }
    // سفارش‌ها
    var q1 = cap ? Math.floor(cap * 0.5 / (P.L1 * (1 + A.fb))) : null, q2 = cap ? Math.floor(cap * 0.5 / (P.L2 * (1 + A.fb))) : null;
    h += '<div class="sg"><h5>🧾 طرح سفارش‌ها (برای ورود تازه)</h5>' +
      line("قیمت فعلی", f0(A.S)) +
      line("پله‌ی ۱ خرید (نیمی از سرمایه)", f0(P.L1) + (q1 ? " — " + fa(fnum(q1)) + " سهم" : ""), "bind") +
      line("پله‌ی ۲ خرید (نیم دیگر؛ فقط اگر بیشتر افت کرد)", f0(P.L2) + (q2 ? " — " + fa(fnum(q2)) + " سهم" : ""), "bind") +
      line("میانگین ورود اگر هر دو پر شوند", f0(P.avgIn)) +
      line("حد ضرر (اگر زیرش بسته شد، خارج شو)", f0(P.stop) + " (" + pc(P.netStop) + ")") +
      line("هدف ۱ — فروش ۵۰٪", f0(P.t1) + " (" + pc(P.netT1) + " خالص)") +
      line("هدف ۲ — فروش بقیه", f0(P.t2) + " (" + pc(P.netT2) + " خالص)") +
      line("بعد از رسیدن به هدف ۱، حد ضرر را ببر به", f0(P.be) + " (سر به سر)") +
      line("مهلت نگه‌داری", fa(P.days) + " روز معاملاتی؛ اگر به هدف ۱ نرسید، با قیمت بازار خارج شو") +
      line("سود خالص اگر هر دو هدف بخورند / زیان خالص در حد ضرر", pc(P.netBlend) + " / " + pc(P.netStop)) +
      line("نسبت سود به ریسک", P.rr ? fa(P.rr.toFixed(1)) + " برابر" : "—") +
      (cap ? line("به پول (با سرمایه‌ی واردشده)", tmn(cap * P.netBlend, true) + " سود، یا " + tmn(cap * P.netStop, true) + " زیان") : "") + '</div>';
    // روش اجرا
    h += '<div class="sg"><h5>🪜 چطور اجرا کنم؟</h5><div style="font-size:11.5px;line-height:1.95">' +
      ['۱) پله‌ی ۱ را به‌صورت سفارش حدی (نه بازار) در قیمت بالا بگذار؛ قیمت اگر نیامد، نخر و تعقیبش نکن.',
       '۲) هر روز سفارش‌ها را بازبینی کن: اگر قیمت‌های پیشنهادی (که هر روز با بازه‌ی ۲۰ روزه عوض می‌شوند) تغییر کردند، سفارش قبلی را لغو و تازه بگذار.',
       '۳) بعد از پر شدن، حد ضرر را هم‌زمان بگذار (سفارش شرطی). حد ضرر در بورس ایران همیشه با همان قیمت اجرا نمی‌شود؛ اگر قیمت با شکاف افت کند، بدتر هم می‌شود.',
       '۴) طبق قاعده‌ی رایج، سهمی که امروز می‌خری از روز معاملاتی بعد قابل فروش است (با کارگزاری‌ات تطبیق بده)؛ پس طرح حداقل یک شب ریسک دارد.',
       '۵) به هدف ۱ که رسید نصف را بفروش و حد ضرر را ببر روی سر به سر؛ بقیه برای هدف ۲.',
       '۶) اگر مهلت تمام شد و هدف ۱ نخورد، خارج شو؛ نوسان‌گیری که نوسان نکند، سرمایه‌گذاری ناخواسته می‌شود.'
      ].map(function (t) { return '<div>' + esc(fa(t)) + '</div>'; }).join("") + '</div></div>';
    // رویدادها (کدال + مالی)
    var EVr = A.events, EVin = swtEvents();
    h += '<div class="sg"><h5>📢 رویدادها و بنیاد شرکت (کدال + تب مالی)' + (CDL.loading ? " — در حال دریافت از کدال…" : "") + '</h5>' +
      EVr.lines.map(function (x) { return '<div style="font-size:11.5px;line-height:1.85">' + (x.lv === "ok" ? "✅" : x.lv === "bad" ? "❌" : "⚠") + " " + esc(fa(x.t)) + '</div>'; }).join("");
    var recent = (EVin.letters || []).filter(function (x) { return x.ago >= -1 && x.ago <= 14 && x.cls !== "other"; }).slice(0, 6);
    if (recent.length) h += '<div style="font-size:11.5px;margin-top:5px"><b>اطلاعیه‌های مهم ۱۴ روز اخیر</b></div>' + recent.map(function (x) {
      var nm = (CDL_CLS.filter(function (k) { return k[0] === x.cls; })[0] || [0, "اطلاعیه"])[1];
      return '<div style="font-size:11.5px;line-height:1.8;color:var(--mut)">• ' + esc(fa(nm)) + " — " + (x.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener" style="color:inherit">' : "") + esc(fa(x.title.slice(0, 90))) + (x.url ? "</a>" : "") + " (" + fa(Math.max(0, x.ago)) + " روز پیش)</div>";
    }).join("");
    if (EVin.fin && EVin.fin.bad && EVin.fin.bad.length) h += '<div style="font-size:11.5px;margin-top:5px"><b>نکته‌های ضعف مالی</b></div>' + EVin.fin.bad.map(function (t) { return '<div style="font-size:11.5px;line-height:1.8;color:var(--mut)">• ' + esc(fa(t)) + '</div>'; }).join("");
    h += '</div>';
    // دلیل‌ها
    h += '<div class="sg"><h5>🧮 چرا این حکم؟ (امتیاز ' + fa(A.pct) + ' از ۱۰۰)</h5>' + A.checks.map(function (x) {
      var sym = x.lv === "ok" ? "✅" : x.lv === "bad" ? "❌" : "⚠";
      return '<div style="font-size:11.5px;line-height:1.85">' + sym + " " + esc(fa(x.t)) + (x.max ? ' <span style="color:var(--mut)">(' + fa(x.pts) + "/" + fa(x.max) + ")</span>" : "") + '</div>';
    }).join("") + '</div>';
    // شواهد
    var B = A.best;
    h += '<div class="sg"><h5>📊 آزمون همین قاعده روی سابقه‌ی این سهم (حدود ۸ ماه)</h5>' +
      '<div style="font-size:11.5px;color:var(--mut);line-height:1.8;margin-bottom:4px">قاعده: سفارش خرید حدی در «کف بازه‌ی ۲۰ روزه + k × پهنای بازه»؛ فروش در ۶۰٪ فاصله تا سقف؛ حد ضرر زیر کف؛ مهلت ۸ روز؛ از روز بعد از خرید قابل فروش؛ اگر در یک روز هم حد ضرر هم هدف ممکن بود، ضرر حساب شده؛ کارمزد و مالیات کسر شده. k = عمق ورود.</div>' +
      A.tests.map(function (x) {
        return line("k=" + fa(x.k) + (x.k === B.k ? " (انتخاب‌شده)" : ""), x.n ? fa(x.n) + " معامله | موفق " + fa(Math.round(x.win * 100)) + "٪ | میانگین " + pc(x.exp) + " | هدف/ضرر/مهلت " + fa(x.tg + "/" + x.sp + "/" + x.to) : "سیگنالی نبود", x.k === B.k ? "bind" : "");
      }).join("") +
      line("میانگین سود موفق / میانگین زیان ناموفق (انتخاب‌شده)", (B.avgWin !== null ? pc(B.avgWin) : "—") + " / " + (B.avgLoss !== null ? pc(B.avgLoss) : "—")) +
      line("میانه‌ی روزهای نگه‌داری", B.days !== null ? fa(B.days) + " روز" : "—") +
      line("نوسان روزانه (ATR) / میانگین دامنه‌ی روزانه", pc(A.atrp) + " / " + pc(A.rng20)) +
      line("موج‌های صعودی کامل؛ میانه‌ی دامنه و مدت", fa(A.swings.count) + " مورد؛ " + (A.swings.medAmp ? pc(A.swings.medAmp) + "، " + fa(Math.round(A.swings.medDays)) + " روز" : "—")) +
      line("بازه‌ی ۲۰ روزه (کف تا سقف) / جایگاه قیمت", f0(A.lo20) + " تا " + f0(A.hi20) + " / " + fa(Math.round(A.pos20 * 100)) + "٪ از بازه") +
      line("میانگین ۵۰ / ۲۰۰ روزه", (A.sma50 ? f0(A.sma50) : "—") + " / " + (A.sma200 ? f0(A.sma200) : "—")) +
      line("RSI ۱۴ روزه", A.rsi === null ? "—" : fa(Math.round(A.rsi))) +
      line("کارمزد رفت‌وبرگشت (خرید + فروش و مالیات)", pc(A.rt, 2)) +
      (B.trades.length ? '<div style="font-size:11.5px;margin-top:6px"><b>آخرین معامله‌های شبیه‌سازی‌شده (k انتخاب‌شده)</b></div>' + B.trades.slice(-8).reverse().map(function (x) {
        return line(esc(fa(fmtDate(x.d))) + " — " + (x.why === "target" ? "به هدف" : x.why === "stop" ? "حد ضرر" : "پایان مهلت"), f0(x.fill) + " ← " + f0(x.exit) + " (" + pc(x.net) + "، " + fa(x.days) + " روز)");
      }).join("") : "") + '</div>';
    h += '<div class="legend" style="margin:0 12px 12px">الگوی قیمتی گذشته را می‌خواند و فقط رویدادهایی را که در کدال و تب مالی خوانده شده‌اند (مجمع، افزایش سرمایه، افشای تازه، بنیاد شرکت) لحاظ می‌کند؛ خبرهای غیررسمی، صف، تغییر دامنه‌ی نوسان و حال کل بازار را نمی‌بیند و سود گذشته تضمین سود آینده نیست. کارمزدها تقریبی‌اند و از تنظیمات ⚙ می‌آیند. توصیه‌ی مالی نیست.</div>';
    el.innerHTML = h;
  }

  // ================= تب «دارم؛ بفروشم؟» و تب «ساده» =================
  function tmn(rial, sign) {   // ریال → تومان خوانا
    if (rial === null || rial === undefined || !isFinite(rial)) return "—";
    var t = rial / 10, a = Math.abs(t), txt;
    if (a >= 1e9) txt = (a / 1e9).toFixed(2) + " میلیارد"; else if (a >= 1e6) txt = (a / 1e6).toFixed(1) + " میلیون"; else txt = Math.round(a).toLocaleString("en-US");
    return fa((sign && t > 0 ? "+" : t < 0 ? "−" : "") + txt) + " تومان";
  }
  function pctS(x, d) { return x === null || x === undefined || !isFinite(x) ? "—" : fa((x >= 0 ? "+" : "−") + Math.abs(x * 100).toFixed(d === undefined ? 1 : d)) + "٪"; }
  function holdIn(k, label, ph) { return '<label>' + esc(label) + '</label><input type="text" inputmode="decimal" data-hk="' + k + '" placeholder="' + esc(ph || "") + '" value="' + esc(STATE.inp[k] === undefined || STATE.inp[k] === null ? "" : STATE.inp[k]) + '">'; }
  function readHoldInputs(scope, keys) {
    scope.querySelectorAll("[data-hk]").forEach(function (el) {
      var h = function () { var v = toLat(el.value).replace(/[,٬\s]/g, ""); STATE.inp[el.dataset.hk] = v === "" ? "" : (isFinite(Number(v)) ? Number(v) : STATE.inp[el.dataset.hk]); persist(); (STATE.view === "hold" ? renderHoldResult : STATE.view === "swt" ? renderSwtResult : renderSimpleResult)(); };
      el.addEventListener("input", h);
    });
  }
  function agmForAdvice() { var a = cdlNextAgm(); return a ? { daysTo: a.daysTo, kind: a.kind, text: jStr(a.date) } : null; }

  function renderHoldBody() {
    var el = root.getElementById("holdbody"); if (!el) return;
    var h = '<div class="note">سهم را داری و می‌خواهی بدانی نگه دار یا بفروش، و کی و کجا. فقط قیمت خریدت لازم است؛ بقیه اختیاری‌اند.</div>' +
      '<div class="sm" id="holdform" style="margin:0 12px 8px">' + holdIn("h_buy", "قیمت خرید من (ریال، میانگین اگر چند بار خریدی)", "مثلاً 12500") + holdIn("h_qty", "تعداد سهم (اختیاری — برای محاسبه‌ی سود و زیان کل)", "") +
      holdIn("h_held", "چند روز معاملاتی است نگهش داشته‌ای؟ (اختیاری)", "") + holdIn("h_stop", "حد ضرر خودم (اختیاری — خالی = خودکار)", "") + holdIn("h_target", "هدف خودم (اختیاری — خالی = مقاومت‌ها)", "") + '</div>' +
      '<div id="holdres"></div>';
    el.innerHTML = h; readHoldInputs(el); renderHoldResult();
  }
  function renderHoldResult() {
    var el = root.getElementById("holdres"); if (!el) return;
    var AD = window.OptAdvisor; if (!AD) { el.innerHTML = ""; return; }
    var H = AD.holdAdvice({ S: num0(STATE.inp.S), buy: num0(STATE.inp.h_buy), qty: num0(STATE.inp.h_qty), held: num0(STATE.inp.h_held), userStop: num0(STATE.inp.h_stop), userTarget: num0(STATE.inp.h_target), an: STATE.an, stockSt: STATE.st, inp: STATE.inp, fin: finViewNow(), agm: agmForAdvice() });
    if (!H.ok) { el.innerHTML = H.issues.map(function (t) { return '<div class="msg w">' + esc(t) + '</div>'; }).join(""); return; }
    var V = H.verdict, h = '<div class="msg ' + V.cls + '" style="font-size:14px;text-align:center"><b>' + V.sym + " " + esc(V.text) + '</b><div style="font-weight:400;font-size:12px;margin-top:3px">' + esc(fa(V.why)) + '</div></div>';
    // وضع فعلی
    h += '<div class="sg"><h5>📍 وضعیت فعلی تو</h5>' +
      '<div class="line"><span>قیمت فعلی / قیمت خرید تو</span><span class="vv">' + fa(fnum(H.S)) + " / " + fa(fnum(H.buy)) + '</span></div>' +
      '<div class="line"><span>سود/زیان خالص (بعد از کارمزد و مالیات فروش)</span><span class="vv" style="color:' + (H.pl.netPct >= 0 ? "var(--ok-fg)" : "var(--bad-fg)") + '">' + pctS(H.pl.netPct) + (H.pl.total !== null ? " — " + tmn(H.pl.total, true) : "") + '</span></div>' +
      '<div class="line"><span>قیمتی که بالاتر از آن واقعاً سود می‌کنی (سر به سر)</span><span class="vv">' + fa(fnum(Math.round(H.pl.be))) + '</span></div>' +
      (H.pl.value !== null ? '<div class="line"><span>ارزش فروش الان (خالص)</span><span class="vv">' + tmn(H.pl.value) + '</span></div>' : "") + '</div>';
    // دلیل‌ها
    h += '<div class="sg"><h5>🧮 چرا این حکم؟ (جمع نشانه‌ها: ' + fa(Math.round(H.HS * 100)) + '٪؛ منفی = فشار فروش)</h5>';
    H.signals.forEach(function (x) { h += '<div class="line"><span>' + (x.s > 0.15 ? "🟢 " : x.s < -0.15 ? "🔴 " : "⚪ ") + esc(x.name) + '</span><span class="vv" style="direction:rtl;white-space:normal;text-align:left;font-weight:400">' + esc(fa(x.txt)) + '</span></div>'; });
    h += '</div>';
    // قیمت زیر خط خروج: توضیح اینکه چرا نگه‌داشتن منطقی است یا نیست
    if (H.override) {
      h += '<div class="sg"><h5>🔎 قیمت زیر خط خروج است؛ آیا نگه‌داشتن توجیه دارد؟</h5>';
      H.override.conds.forEach(function (c) { h += '<div style="font-size:11.5px;line-height:1.9;margin:3px 0">' + (c.ok ? "✅ " : "❌ ") + esc(fa(c.ok ? c.yes : c.no)) + '</div>'; });
      h += '<div class="msg ' + (H.override.allOk && !H.override.isUserStop ? "w" : "h") + '" style="margin:6px 0 0;font-size:12px">' + (H.override.allOk ? (H.override.isUserStop ? "همه‌ی شرط‌ها به نفع نگه‌داشتن‌اند، ولی این حد ضرر را خودت گذاشته‌ای؛ اگر استثنا قائل می‌شوی، آگاهانه و با شرط خروج بی‌قید پایین انجام بده." : "هر پنج شرط برقرار است؛ پس شکست احتمالاً نوسان عادی است. نگه‌داشتن فقط با شرط‌های «کی بفروشم» پایین مجاز است.") : "حداقل یکی از شرط‌ها برقرار نیست؛ پس شکست خط خروج جدی گرفته می‌شود و حکم فروش است.") + '</div></div>';
    }
    // کی بفروشم
    h += '<div class="sg"><h5>⏰ کی و کجا بفروشم؟</h5>';
    H.when.forEach(function (w) { h += '<div style="font-size:11.5px;line-height:1.9;margin:4px 0">• ' + esc(fa(w.t)) + '</div>'; });
    h += '</div>';
    // اگر نگه دارم
    if (H.hz) {
      h += '<div class="sg"><h5>🔮 اگر ' + fa(10) + ' روز دیگر هم نگه دارم</h5>' +
        '<div class="line"><span>قیمت مرکزی پیش‌بینی / دامنه‌ی ۶۸٪</span><span class="vv">' + fa(fnum(Math.round(H.hz.median))) + " / " + fa(fnum(Math.round(H.hz.low68))) + " تا " + fa(fnum(Math.round(H.hz.high68))) + '</span></div>' +
        '<div class="line"><span>سود/زیان خالص در سناریوی مرکزی نسبت به قیمت خرید</span><span class="vv">' + pctS(H.hz.medNetPct) + " (بازه: " + pctS(H.hz.lowNetPct, 0) + " تا " + pctS(H.hz.highNetPct, 0) + ')</span></div>' +
        '<div class="line"><span>احتمال اینکه آن موقع در سود خالص باشی</span><span class="vv">' + fa(Math.round(H.hz.pProfit * 100)) + '٪</span></div>' +
        (H.rrHold !== null ? '<div class="line"><span>سود تا هدف اول ÷ ریسک تا خط خروج (از قیمت فعلی)</span><span class="vv">' + fa(H.rrHold.toFixed(1)) + ' برابر ' + (H.rrHold >= 2 ? "✅" : H.rrHold >= 1 ? "⚠" : "❌ نگه‌داشتن ارزش ریسک را ندارد") + '</span></div>' : "") + '</div>';
    }
    h += '<div class="legend" style="margin:6px 12px 8px">این‌ها حساب ریاضی بر پایه‌ی سابقه‌ی قیمت (و تحلیل مالی اگر ثبت شده باشد) هستند؛ پیش‌بینی قطعی یا توصیه‌ی سرمایه‌گذاری نیستند. اگر سهم در صف فروش برود، حد ضرر اجرا نمی‌شود.</div>';
    el.innerHTML = h;
  }

  function renderSimpleBody() {
    var el = root.getElementById("simplebody"); if (!el) return;
    var a = Number(STATE.st.risk) || 5;
    var h = '<div class="note">فقط بگو چقدر پول می‌گذاری و چقدر ریسک‌پذیری؛ بقیه‌ی محاسبات (الگوی ورود، سقف قیمت، حد ضرر، تعداد سهم، سود و زیان) را من انجام می‌دهم.</div>' +
      '<div class="sm" id="simpleform" style="margin:0 12px 8px">' + holdIn("s_cap", "چقدر پول می‌خواهی بگذاری؟ (میلیون تومان)", "مثلاً 200") +
      '<label>ریسک‌پذیری: <b id="srl">' + esc(fa(a)) + " — " + esc(riskLabel(a)) + '</b></label><input type="range" min="1" max="10" step="1" value="' + a + '" id="sriskr" style="width:100%">' +
      '<div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--mut)"><span>محتاط</span><span>ریسک‌پذیر</span></div></div><div id="simpleres"></div>';
    el.innerHTML = h; readHoldInputs(el);
    var r = el.querySelector("#sriskr"); r.addEventListener("input", function () { STATE.st.risk = Number(r.value); persistSettings(); el.querySelector("#srl").textContent = fa(r.value) + " — " + riskLabel(Number(r.value)); renderSimpleResult(); });
    renderSimpleResult();
  }
  function renderSimpleResult() {
    var el = root.getElementById("simpleres"); if (!el) return;
    var AD = window.OptAdvisor; if (!AD) { el.innerHTML = ""; return; }
    var capT = num0(STATE.inp.s_cap);
    var P = AD.simplePlan({ capital: capT > 0 ? capT * 1e7 : null, risk: Number(STATE.st.risk) || 5, S: num0(STATE.inp.S), an: STATE.an, stockSt: STATE.st, inp: STATE.inp, fin: finViewNow() });
    if (!P.ok) { el.innerHTML = P.issues.map(function (t) { return '<div class="msg w">' + esc(t) + '</div>'; }).join(""); return; }
    var D = P.dec, p = P.plan, h = '<div class="msg ' + D.cls + '" style="font-size:16px;text-align:center"><b>' + D.sym + " " + esc(D.text) + '</b></div>';
    h += '<div class="sg"><h5>چرا؟</h5>' + P.why.map(function (t) { return '<div style="font-size:11.5px;line-height:1.9;margin:3px 0">' + esc(fa(t)) + '</div>'; }).join("") + '</div>';
    if (p.qty >= 1) {
      h += '<div class="sg"><h5>📋 برنامه' + (D.cls === "ok" ? "" : " (در صورتی که شرایط درست شد)") + ' — الگوی «' + esc(P.modeLabel) + '»</h5>' +
        '<div class="line"><span>قیمت ورود' + (p.priceOk ? " (همین الان)" : " (منتظر برگشت به این قیمت یا پایین‌تر بمان)") + '</span><span class="vv">' + fa(fnum(Math.round(p.E))) + '</span></div>' +
        '<div class="line"><span>تعداد سهم / مبلغ خرید (' + fa(Math.round(p.investedPct * 100)) + '٪ سرمایه)</span><span class="vv">' + fa(fnum(p.qty)) + " سهم / " + tmn(p.invested) + '</span></div>' +
        '<div class="line"><span>حد ضرر (' + esc(p.stopSrc || "") + ')</span><span class="vv">' + fa(fnum(Math.round(p.stop))) + " (" + pctS(p.stop / p.E - 1) + ')</span></div>' +
        '<div class="line"><span>بیشترین زیان برنامه‌ریزی‌شده اگر حد ضرر بخورد</span><span class="vv" style="color:var(--bad-fg)">' + tmn(-p.riskAmt) + " (" + fa((p.riskPct * 100).toFixed(1)) + '٪ سرمایه)</span></div>' +
        (p.t1 ? '<div class="line"><span>هدف اول (' + esc(p.t1Src || "") + ')</span><span class="vv">' + fa(fnum(Math.round(p.t1))) + " → سود " + tmn(p.gain1, true) + '</span></div>' : "") +
        (p.t2 ? '<div class="line"><span>هدف دوم</span><span class="vv">' + fa(fnum(Math.round(p.t2))) + " → سود " + tmn(p.gain2, true) + '</span></div>' : "") + '</div>';
      h += '<div class="sg"><h5>📊 دامنه‌ی سود و زیان (بعد از کارمزد)</h5>';
      var names = { 10: "۱۰ روز معاملاتی آینده (~۲ هفته)", 21: "یک ماه (~۲۱ روز معاملاتی)", 250: "یک سال (~۲۵۰ روز معاملاتی)" };
      P.ranges.forEach(function (r) {
        h += '<div style="font-size:12px;font-weight:700;margin:8px 0 3px">' + esc(names[r.td] || (r.td + " روز")) + ' — احتمال زیان: ' + fa(Math.round(r.pLoss * 100)) + '٪</div><div class="cmp sgt"><table><thead><tr><th class="lab"></th>' + r.cols.map(function (c) { return '<th>' + esc(c.label) + '</th>'; }).join("") + '</tr></thead><tbody>' +
          '<tr><td class="lab">قیمت سهم</td>' + r.cols.map(function (c) { return '<td class="v">' + fa(fnum(Math.round(c.px))) + '</td>'; }).join("") + '</tr>' +
          '<tr><td class="lab">سود/زیان</td>' + r.cols.map(function (c) { return '<td class="v ' + (c.pl >= 0 ? "best" : "worst") + '">' + pctS(c.pct, 0) + '</td>'; }).join("") + '</tr>' +
          '<tr><td class="lab">به تومان</td>' + r.cols.map(function (c) { return '<td class="v ' + (c.pl >= 0 ? "best" : "worst") + '" style="font-size:10.5px">' + tmn(c.pl, true) + '</td>'; }).join("") + '</tr></tbody></table></div>';
      });
      h += '<div class="legend" style="margin-top:6px">«حداقل/حداکثر محتمل» یعنی ۱٪ بدترین و ۱٪ بهترین حالت طبق مدل نوسان (۹۸٪ حالت‌ها بین این دو است)؛ زیان یا سود واقعی می‌تواند از آن هم فراتر برود (سقوط ناگهانی، صف فروش، دامنه‌ی نوسان). اگر حد ضرر را رعایت کنی و اجرا شود، زیان از «بیشترین زیان برنامه‌ریزی‌شده» بالا نمی‌رود. برای ۱ سال، مدل جهت مشخصی نمی‌دهد و عملاً فقط عرض بازه‌ی نوسان را نشان می‌دهد؛ تورم را هم حساب نکرده است.</div></div>';
    }
    h += '<div class="legend" style="margin:6px 12px 8px">این حالت از همان محاسبات چک‌لیست، پیشنهاد قیمت و دید تحلیلی (نمودار + مالی) استفاده می‌کند، با حساسیت‌هایی که از «ریسک‌پذیری» می‌آید. پیش‌بینی قطعی یا توصیه‌ی سرمایه‌گذاری نیست.</div>';
    el.innerHTML = h;
  }


  // ================= تب «🔍 یافتن سهم» (اسکرینر بازار) =================
  var SCR = { running: false, cancel: false, res: null, prog: "" };
  store.get("scr:last", function (r) { if (r && r.ok) { SCR.res = r; if (STATE.view === "scr") renderScrResult(); } });
  function renderScrBody() {
    var el = root.getElementById("scrbody"); if (!el) return;
    var dp = String(STATE.inp.scr_depth || 80), C = (window.Screener && window.Screener.CRITERIA) || { common: [], swing: [], vol: [] };
    var h = '<div class="note">بدون رفتن به صفحه‌ی هر سهم، کل بازار را با معیارهای ثابت پایین فیلتر می‌کند و نمادهایی را که ارزش بررسی بیشتر دارند فهرست می‌کند: یک فهرست برای خرید و نگهداری، یک فهرست برای نوسان‌گیری. بعد خودت هر کدام را با ابزارهای همین افزونه بررسی کن.</div>' +
      '<div class="sm" id="scrform" style="margin:0 12px 8px">' +
      '<label>عمق جستجو (تعداد پرمعامله‌ترین نمادهایی که کامل تحلیل می‌شوند)</label><select id="scrdepth" style="width:100%;padding:8px;border-radius:9px;border:1.5px solid transparent;background:var(--inp);color:var(--fg);font-family:inherit"><option value="40"' + (dp === "40" ? " selected" : "") + '>سریع (۴۰ نماد)</option><option value="80"' + (dp === "80" ? " selected" : "") + '>معمولی (۸۰ نماد)</option><option value="150"' + (dp === "150" ? " selected" : "") + '>عمیق (۱۵۰ نماد؛ کندتر)</option><option value="2000"' + (dp === "2000" ? " selected" : "") + '>همه‌ی بازار (چند دقیقه؛ کامل‌ترین)</option></select>' +
      holdIn("scr_min", "حداقل میانگین ارزش معاملات روزانه (میلیارد ریال) — پیش‌فرض ۲۰", "20") +
      '<label>فهرست دلخواه (اختیاری؛ نمادها با ویرگول. خالی = کل بازار)</label><input type="text" id="scrlist" placeholder="مثلاً فولاد، فملی، خودرو" value="' + esc(STATE.inp.scr_list || "") + '" style="direction:rtl;text-align:right">' +
      '<div style="display:flex;gap:6px;margin-top:8px"><button id="scrgo" class="pri" style="flex:2">' + (SCR.running ? "در حال جستجو…" : "▶ شروع جستجو") + '</button><button id="scrstop" style="flex:1"' + (SCR.running ? "" : " disabled") + '>توقف</button></div></div>' +
      '<div id="scrsnap" class="legend" style="margin:0 12px 6px"></div>' +
      '<div id="scrprog" class="legend" style="margin:0 12px 6px">' + esc(SCR.prog || "") + '</div><div id="scrres"></div>' +
      '<details style="margin:6px 12px 10px"><summary style="cursor:pointer;font-size:12px"><b>معیارها دقیقاً چیست؟ (برای باز کردن بزن)</b></summary><div style="font-size:11.5px;line-height:1.9">' +
      '<b>مشترک</b>' + C.common.map(function (t) { return '<div>• ' + esc(fa(t)) + '</div>'; }).join("") +
      '<b>خرید و نگهداری / روندی (امتیاز ۰ تا ۱۰۰)</b>' + C.swing.map(function (t) { return '<div>• ' + esc(fa(t)) + '</div>'; }).join("") +
      '<b>نوسان‌گیری (امتیاز ۰ تا ۱۰۰)</b>' + C.vol.map(function (t) { return '<div>• ' + esc(fa(t)) + '</div>'; }).join("") + '</div></details>';
    el.innerHTML = h; readHoldInputs(el);
    root.getElementById("scrdepth").onchange = function () { STATE.inp.scr_depth = Number(this.value); persist(); };
    root.getElementById("scrlist").oninput = function () { STATE.inp.scr_list = this.value; persist(); };
    root.getElementById("scrgo").onclick = scrStart; root.getElementById("scrstop").onclick = function () { SCR.cancel = true; SCR.prog = "در حال توقف…"; var p = root.getElementById("scrprog"); if (p) p.textContent = SCR.prog; };
    renderScrResult();
    try {
      chrome.storage.local.get("mkt:snap", function (r) {
        var sn = r && r["mkt:snap"], e = root.getElementById("scrsnap"); if (!e) return;
        if (sn && sn.arr && sn.arr.length) {
          var m = Math.round((Date.now() - sn.at) / 60000);
          e.textContent = fa("📡 فهرست بازار از صفحه‌ی TSETMC ذخیره شده (" + sn.arr.length + " ردیف، " + (m < 1 ? "همین الان" : m < 90 ? m + " دقیقه پیش" : Math.round(m / 60) + " ساعت پیش") + (sn.dom ? "، فقط نام نمادها" : "") + "). اگر API مستقیم جواب ندهد از همین استفاده می‌شود.");
        } else e.textContent = "📡 اگر «فهرست بازار خوانده نشد» آمد: صفحه‌ی اول TSETMC یا «دیده‌بان بازار» را در یک تب دیگر باز کن تا لود شود، بعد همین‌جا دوباره جستجو را بزن.";
      });
    } catch (e) {}
  }
  function scrStart() {
    if (SCR.running || !window.Screener) return;
    SCR.running = true; SCR.cancel = false; SCR.prog = "شروع…"; renderScrBody();
    window.Screener.run({ stockSt: STATE.st, minVal: num0(STATE.inp.scr_min) > 0 ? num0(STATE.inp.scr_min) : 20, depth: Number(STATE.inp.scr_depth) || 80, list: (STATE.inp.scr_list || "").trim() || null },
      function (p) { SCR.prog = p.msg || ""; var e = root.getElementById("scrprog"); if (e) e.textContent = fa(SCR.prog); },
      function () { return SCR.cancel; }
    ).then(function (r) { SCR.running = false; SCR.res = r; SCR.prog = r.ok ? (r.cancelled ? "متوقف شد؛ نتیجه‌ی بخشی که تحلیل شد:" : "تمام شد.") : ""; if (r.ok) store.set("scr:last", r); if (STATE.view === "scr") renderScrBody(); })
      .catch(function (e) { SCR.running = false; SCR.res = { ok: false, err: "خطای غیرمنتظره: " + e, log: [], diag: {} }; if (STATE.view === "scr") renderScrBody(); });
  }
  function scrCard(r, kind, i) {
    var o = kind === "swing" ? r.swing : r.vol, why = o.why.slice(0, 4), bad = o.bad.slice(0, 2);
    var href = location.origin + "/InstInfo/" + r.ins;
    var h = '<div class="sg"><h5>#' + fa(i + 1) + " " + esc(r.sym) + ' <span style="font-weight:400;color:var(--mut)">' + esc(r.name || "") + '</span> — امتیاز ' + fa(o.pts) + '</h5>' +
      '<div class="line"><span>قیمت / تغییر امروز / نقدشوندگی</span><span class="vv">' + fa(fnum(Math.round(r.S))) + " / " + (r.chg === null || r.chg === undefined ? "—" : pctS(r.chg)) + " / " + fa(r.valB.toFixed(0)) + ' میلیارد</span></div>';
    why.forEach(function (t) { h += '<div style="font-size:11.5px;line-height:1.8">✅ ' + esc(fa(t)) + '</div>'; });
    bad.forEach(function (t) { h += '<div style="font-size:11.5px;line-height:1.8;color:var(--mut)">⚠ ' + esc(fa(t)) + '</div>'; });
    if (kind === "vol") h += '<div class="line"><span>محدوده‌ی ورود / حد ضرر / هدف</span><span class="vv">' + fa(fnum(Math.round(o.entryLo))) + " تا " + fa(fnum(Math.round(o.entryHi))) + " / " + fa(fnum(Math.round(o.stop))) + " / " + fa(fnum(Math.round(o.target))) + '</span></div>';
    else h += '<div class="line"><span>الگو / حد ضرر تقریبی (۲ ATR) / هدف</span><span class="vv">' + esc(o.mode && MODE_LABEL[o.mode] ? MODE_LABEL[o.mode] : "—") + " / " + fa(fnum(Math.round(o.stop))) + " / " + fa(fnum(Math.round(o.target))) + '</span></div>';
    if (kind === "swing" && r.fits && r.fits.length) {
      var ORDER = ["trend", "pull", "break"], WHAT = { trend: "روند صعودی سالم و قیمت نزدیک میانگین ۲۰ روزه", pull: "اصلاح سالم داخل روند صعودی", "break": "عبور از سطح شکست با حجم" };
      h += '<details style="margin:5px 0"><summary style="cursor:pointer;font-size:11.5px"><b>چرا این الگو؟ وضعیت سه الگوی ورود</b></summary><div style="font-size:11.5px;line-height:1.9">';
      ORDER.forEach(function (m) {
        var f = r.fits.filter(function (x) { return x.mode === m; })[0]; if (!f) return;
        var chosen = o.mode === m, why = f.sym === "✅" ? "شرایط برقرار است: " + WHAT[m] : (f.first || "شرایط کامل نیست");
        h += '<div' + (chosen ? ' style="font-weight:700"' : ' style="color:var(--mut)"') + '>' + (chosen ? "◀ " : "• ") + esc(MODE_LABEL[m]) + " " + esc(f.sym || "") + " (امتیاز " + fa(f.score === null || f.score === undefined ? "—" : Math.round(f.score)) + ") — " + esc(fa(why)) + '</div>';
      });
      h += '<div style="color:var(--mut)">الگوی انتخاب‌شده (◀) همان است که کامل‌تر می‌خواند؛ اگر هیچ‌کدام ✅ نباشد، بهترین الگوی دارای هشدار (⚠) نشان داده می‌شود.</div></div></details>';
    }
    return h + '<div style="margin-top:4px"><a href="' + esc(href) + '" target="_blank" rel="noopener" style="color:var(--acc);font-size:12px;font-weight:700">باز کردن صفحه‌ی سهم برای بررسی کامل ↗</a></div></div>';
  }
  function renderScrResult() {
    var el = root.getElementById("scrres"); if (!el) return;
    var r = SCR.res; if (!r) { el.innerHTML = ""; return; }
    if (!r.ok) {
      var dg = []; dg.push(r.err || "ناموفق"); if (r.diag && r.diag.note) dg.push(r.diag.note);
      el.innerHTML = '<div class="msg w">' + esc(dg.join(" — ")) + '</div><div class="legend" style="margin:0 12px 6px">اگر «فهرست دلخواه» را پر کنی (مثلاً چند نماد با ویرگول)، بدون نیاز به فهرست کل بازار هم کار می‌کند. برای رفع اشکال، متن زیر را برای من بفرست:</div>' +
        '<details open style="margin:0 12px"><summary style="cursor:pointer;font-size:11.5px">جزئیات فنی</summary><textarea readonly style="width:100%;height:150px;direction:ltr;font-size:10.5px">' + esc(JSON.stringify({ diag: r.diag, log: r.log }, null, 1)) + '</textarea></details>';
      return;
    }
    var st = r.stats, h = '<div class="legend" style="margin:0 12px 6px">' + esc(fa("آخرین جستجو: " + new Date(r.at).toLocaleString("fa-IR") + " — سهم‌های بازار: " + st.total + "، تحلیل کامل: " + st.stage2 + "، قابل‌قبول برای تحلیل: " + st.analyzed + "، ردشده: " + st.dropped)) + (r.diag && r.diag.note ? ' — ' + esc(r.diag.note) : '') + '</div>';
    h += '<div class="msg ok" style="margin:6px 12px"><b>📈 خرید و نگهداری / روندی — ' + fa(r.swing.length) + ' نماد</b></div>';
    h += r.swing.length ? r.swing.map(function (x, i) { return scrCard(x, "swing", i); }).join("") : '<div class="legend" style="margin:0 12px 8px">امروز نمادی با امتیاز ۵۰ به بالا پیدا نشد؛ یعنی شرایط بازار برای این سبک مناسب نیست یا حداقل ارزش معاملات را کم کن.</div>';
    h += '<div class="msg ok" style="margin:10px 12px 6px"><b>↕ نوسان‌گیری — ' + fa(r.vol.length) + ' نماد</b></div>';
    h += r.vol.length ? r.vol.map(function (x, i) { return scrCard(x, "vol", i); }).join("") : '<div class="legend" style="margin:0 12px 8px">نمادی با شرایط نوسان‌گیری پیدا نشد.</div>';
    if (r.drops && r.drops.length) h += '<details style="margin:6px 12px"><summary style="cursor:pointer;font-size:11.5px">چرا بعضی نمادها حذف شدند؟</summary><div style="font-size:11px;line-height:1.8">' + r.drops.slice(0, 25).map(function (d) { return esc(d.sym) + ": " + esc(d.why); }).join("<br>") + '</div></details>';
    h += '<div class="legend" style="margin:6px 12px 10px">این فهرست فقط «ارزش بررسی بیشتر» را نشان می‌دهد، نه توصیه‌ی خرید. هر نماد را با چک‌لیست، «🎯 ساده» و «📈 نمودار» بررسی کن؛ صف‌ها، اخبار و اطلاعات مالی در این فیلتر لحاظ نشده‌اند.</div>';
    el.innerHTML = h;
  }

  // ================= دید تحلیلی (نمودار + اطلاعات مالی) =================
  function finViewNow() { var AD = window.OptAdvisor; return AD ? AD.finView(STATE.fin, num0(STATE.inp.S), STATE.inp) : null; }
  function outlookCtx(hDays) {
    var AD = window.OptAdvisor;
    if (!AD || !STATE.an || !STATE.an.bars || STATE.an.bars.length < 60) return null;
    var S = num0(STATE.inp.S); if (!(S > 0)) S = STATE.an.bars[STATE.an.bars.length - 1].c;
    var fv = finViewNow();
    var v = AD.stockView(STATE.an, S, STATE.st, STATE.inp, fv, hDays);
    if (!v || !v.ok) return { v: v, S: S, fv: fv };
    var ol = AD.outlook(v, S, hDays, 0.5);
    return { v: v, ol: ol, nr: AD.narrative(v, ol, hDays), S: S, fv: fv, hDays: hDays };
  }
  function outlookBlock(hDays, title) {
    var c = outlookCtx(hDays);
    if (!c || !c.ol) return '<div class="sg"><h5>' + esc(title) + '</h5><div class="legend">سابقه قیمت سهم خوانده نشده است؛ «به‌روزرسانی از سایت» را بزن تا جمع‌بندی ساخته شود.</div></div>';
    return window.AdvisorUI.outlookHtml({ title: title, S: c.S, v: c.v, ol: c.ol, nr: c.nr, hDays: hDays });
  }

  // ================= تب پیشنهاد =================
  function pAbs(g) { return fa(Math.abs(g * 100).toFixed(0)) + "٪"; }
  function enterSug() {
    store.get("compare", function (arr) {
      STATE.cmp = Array.isArray(arr) ? arr : [];
      STATE.view = "sug"; STATE.showSettings = false;
      renderAll();
    });
  }
  function renderSugBody() {
    var el = root.getElementById("sugbody");
    if (!el) return;
    var m = STATE.type;
    // ---- دید تحلیلی (نمودار + مالی): اگر احتمال را خودت وارد نکرده‌ای، از آن ساخته می‌شود؛ دید نزولی سقف قیمت را پایین می‌آورد
    var oc = outlookCtx(10), inpQ = STATE.inp, pNote = null;
    if (num0(STATE.inp.p) === null && oc && oc.v && oc.v.ok) {
      var r0 = OC.evaluate(m, STATE.inp, STATE.st, STATE.an), pr = r0 && r0.R ? r0.R.pSug : null;
      if (pr !== null && pr !== undefined) {
        var tilt = 0.10 * oc.v.d * oc.v.conf, pAdj = Math.round(Math.min(0.95, Math.max(0.05, pr + tilt)) * 100) / 100;
        inpQ = Object.assign({}, STATE.inp, { p: pAdj });
        pNote = "احتمال را خودت وارد نکرده‌ای؛ احتمال مرجع تاریخی (" + fa(Math.round(pr * 100)) + "٪) با دید تحلیلی نمودار" + (oc.fv && oc.fv.ok ? " و تحلیل مالی" : "") + " (" + (tilt >= 0 ? "+" : "−") + fa(Math.abs(tilt * 100).toFixed(0)) + " درصدواحد) به " + fa(Math.round(pAdj * 100)) + "٪ تنظیم و در سقف قیمت استفاده شد.";
      }
    }
    var q = OC.quote(m, inpQ, STATE.st, STATE.an);
    if (q.ok && q.limit !== null && oc && oc.ol && oc.v.d < -0.25 && oc.v.conf >= 0.4) {
      var capV = Math.floor(oc.ol.median);
      q.parts.push({ label: "برای هم‌خوانی با دید تحلیلی نزولی (نمودار" + (oc.fv && oc.fv.ok ? " + مالی" : "") + "): سقف = قیمت مرکزی پیش‌بینی ۱۰ روزه", v: capV });
      if (capV < q.limit) {
        q.limit = capV;
        q.parts.forEach(function (x) { x.bind = Math.abs(x.v - q.limit) < 1e-6; });
        q.gap = q.limit > 0 ? 1 - q.ref / q.limit : null;
        q.levels = q.levels.filter(function (l) { return l.label !== "سقف پیشنهادی"; });
        q.levels.forEach(function (l) { l.good = l.price <= q.limit; });
        q.note.push("دید تحلیلی نزولی است؛ سقف ورود تا قیمت مرکزی پیش‌بینی پایین آمد (معنی‌اش: برای خرید منتظر قیمت پایین‌تر بمان).");
      }
    }
    if (pNote) q.note.push(pNote);
    if (oc && oc.fv && oc.fv.ok && oc.fv.score < 40) q.note.push("بنیاد ضعیف است (امتیاز مالی " + fa(oc.fv.score) + " از ۱۰۰)؛ ریسک افت شدیدتر است، اندازه‌ی معامله را کوچک‌تر بگیر.");
    else if (!(oc && oc.fv && oc.fv.ok)) q.note.push("اطلاعات مالی این سهم ثبت نشده؛ در تب «🏦 مالی» جدول‌ها را بخوان تا در پیشنهاد هم لحاظ شود.");
    var h = '<div class="note">پیشنهاد برای حالت «' + MODE_LABEL[m] + '» است. حالت را از تب‌های بالا عوض کن.</div>';
    h += outlookBlock(10, "🔭 دید تحلیلی (نمودار + مالی) — ۱۰ روز آینده");
    if (q.missing.length) {
      h += '<div class="empty">برای محاسبه این‌ها لازم است: <b>' + esc(q.missing.join("، ")) + '</b><br>«به‌روزرسانی از سایت» را بزن یا در تب «' + MODE_LABEL[m] + '» پرشان کن.</div>';
    } else {
      h += '<div class="sg"><h5>بیشترین قیمت ورود پیشنهادی</h5><div><span class="big">' + esc(fmt(q.limit, "money")) + '</span> ریال</div>';
      if (q.gap !== null) {
        if (q.gap >= 0) h += '<div class="msg ok">✅ آخرین معامله ' + esc(fmt(q.ref, "money")) + ' است و ' + esc(pAbs(q.gap)) + ' پایین‌تر از سقف قرار دارد.</div>';
        else h += '<div class="msg h">❌ آخرین معامله ' + esc(fmt(q.ref, "money")) + ' است و ' + esc(pAbs(q.gap)) + ' بالاتر از سقف است. منتظر اصلاح بمان یا سفارش خرید را در قیمت ≤ سقف بگذار.</div>';
      }
      h += '<div style="margin-top:8px">';
      q.parts.forEach(function (x) { h += '<div class="line' + (x.bind ? " bind" : "") + '"><span>' + (x.bind ? "▶ " : "") + esc(x.label) + '</span><span class="vv">' + esc(fmt(Math.round(x.v), "money")) + '</span></div>'; });
      h += '</div><div class="legend" style="margin:6px 0 0">سقف = کوچک‌ترین مقدار از شرط‌های بالا (▶ یعنی همان شرط تعیین‌کننده است).</div>';
      if (q.zone) {
        var inZone = q.T.px >= q.zone[0] && q.T.px <= q.zone[1];
        h += '<div class="line"><span>منطقه ورود مناسب — ' + esc(q.zoneTxt) + '</span><span class="vv">' + esc(fmt(q.zone[0], "money")) + ' تا ' + esc(fmt(q.zone[1], "money")) + '</span></div>';
        h += '<div class="msg ' + (inZone ? "ok" : "wait") + '">' + (inZone ? "✅ قیمت فعلی داخل منطقه ورود است." : (q.T.px > q.zone[1] ? "⏳ قیمت بالاتر از منطقه ورود است؛ تعقیب نکن، منتظر برگشت بمان." : "⏳ قیمت پایین‌تر از منطقه ورود است؛ ببین چرا از منطقه خارج شده و نشانه برگشت بگیر.")) + '</div>';
      }
      h += '<div class="line"><span>حد ضرر (' + esc(q.targets.stopSrc) + ')</span><span class="vv">' + esc(fmt(q.targets.stop, "money")) + '</span></div>';
      h += '<div class="line"><span>هدف اول (' + esc(q.targets.targetSrc) + ')</span><span class="vv">' + esc(fmt(q.targets.t1, "money")) + '</span></div>';
      if (q.targets.t2) h += '<div class="line"><span>هدف دوم</span><span class="vv">' + esc(fmt(q.targets.t2, "money")) + '</span></div>';
      q.note.forEach(function (t) { h += '<div class="msg w">ℹ ' + esc(t) + '</div>'; });
      h += '</div>';
      if (q.levels.length) {
        h += '<div class="cmp sgt"><table><thead><tr><th class="lab">اگر با این قیمت بخری</th><th>قیمت</th><th>سود/ریسک</th><th>فاصله حد ضرر</th><th>تعداد مجاز</th><th>وضعیت</th></tr></thead><tbody>';
        q.levels.forEach(function (l) {
          h += '<tr><td class="lab">' + esc(l.label) + '</td><td class="v">' + esc(fmt(l.price, "money")) + '</td><td class="v">' + esc(fmt(l.rr, "ratio1")) + '</td><td class="v">' + esc(fmt(l.stopPct, "pct1")) + '</td><td class="v">' + esc(fmt(l.qty, "money")) + '</td>' +
            '<td class="' + (l.good ? "v best" : "v worst") + '">' + (l.good ? "✅ می‌ارزد" : "❌ گران") + '</td></tr>';
        });
        h += '</tbody></table></div>';
      }
      h += '<div class="sg"><h5>این سهم الان به کدام حالت می‌خورد؟</h5>';
      q.fit.forEach(function (f) {
        h += '<div class="line"><span>' + f.sym + " " + esc(MODE_LABEL[f.mode]) + '</span><span style="font-weight:400;color:var(--mut);text-align:left">' + esc(f.first || "تکنیکال این حالت مشکلی ندارد") + '</span></div>';
      });
      h += '<div class="legend" style="margin:6px 0 0">فقط مرحله «تکنیکال» هر حالت بررسی شده است.</div></div>';
    }
    // ---- کدام سهم بهتر است؟
    var cands = (STATE.cmp || []).filter(function (e) { return e.key !== pageKey; });
    cands.push({ key: pageKey, type: m, inp: STATE.inp, an: STATE.an, name: STATE.inp.name_o || "همین صفحه", current: true });
    var list = cands.map(function (e) { return { e: e, r: OC.evaluate(e.type, e.inp, STATE.st, e.an) }; })
      .filter(function (x) { return x.r.R.E !== null && x.r.R.E !== undefined; });
    list.sort(function (a, b) {
      var d = SYM_RANK[a.r.final.sym] - SYM_RANK[b.r.final.sym];
      if (d) return d;
      return (numOk(b.r.score) ? b.r.score : -1) - (numOk(a.r.score) ? a.r.score : -1);
    });
    h += '<div class="sg"><h5>کدام سهم بهتر است؟</h5>';
    if (list.length < 2) h += '<div class="legend">صفحه سهم‌های دیگر را باز کن، اطلاعاتشان را پر کن و «➕ ذخیره برای مقایسه» را بزن؛ اینجا بر اساس نتیجه چک‌لیست و امتیاز تکنیکال رتبه‌بندی می‌شوند.</div>';
    else {
      var best = list[0], bn = best.e.inp.name_o || best.e.name;
      if (best.r.final.sym === "✅") h += '<div class="msg ok">✅ بهترین گزینه: <b>' + esc(bn) + '</b> (' + esc(MODE_LABEL[best.e.type]) + ') با امتیاز تکنیکال ' + esc(fmt(best.r.score, "int")) + '.</div>';
      else h += '<div class="msg w">هیچ‌کدام الان «بخر» نیستند. نزدیک‌ترین: <b>' + esc(bn) + '</b> (' + esc(best.r.final.text) + ').</div>';
      h += '<div class="rk" style="margin:6px 0 0">';
      list.forEach(function (x, i) {
        h += '<div class="it"><span class="no">' + fa(i + 1) + '</span><span class="nm">' + esc(x.e.inp.name_o || x.e.name) + (x.e.current ? " (همین صفحه)" : "") + '</span><span>' + x.r.final.sym + '</span>' +
          '<span class="mt">' + esc(MODE_LABEL[x.e.type]) + ' · امتیاز ' + esc(fmt(x.r.score, "int")) + ' · سود/ریسک ' + esc(fmt(x.r.R.rr, "ratio1")) + '</span></div>';
      });
      h += '</div>';
    }
    h += '<div class="legend" style="margin:6px 0 0">همه پیشنهادها حساب ریاضی بر پایه سابقه قیمت و آستانه‌های خودت هستند، نه پیش‌بینی و نه توصیه سرمایه‌گذاری.</div></div>';
    el.innerHTML = h;
  }


  // ================= تب نمودار =================
  function g2j(gy, gm, gd) {
    var gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334], jy = gy > 1600 ? 979 : 0;
    gy -= gy > 1600 ? 1600 : 621;
    var gy2 = gm > 2 ? gy + 1 : gy;
    var days = 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) - 80 + gd + gdm[gm - 1];
    jy += 33 * Math.floor(days / 12053); days %= 12053;
    jy += 4 * Math.floor(days / 1461); days %= 1461;
    if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
    var jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
    var jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
    return [jy, jm, jd];
  }
  function fmtDate(d) {
    var y = Math.floor(d / 10000), m = Math.floor(d / 100) % 100, dd = d % 100;
    if (y > 1700 && m >= 1 && m <= 12) { var j = g2j(y, m, dd); y = j[0]; m = j[1]; dd = j[2]; }
    return y + "/" + (m < 10 ? "0" : "") + m + "/" + (dd < 10 ? "0" : "") + dd;
  }
  function fnum(x, d) { return (x === null || x === undefined || !isFinite(x)) ? "—" : Number(x).toLocaleString("en-US", { maximumFractionDigits: d === undefined ? 0 : d }); }

  function drawChart(cv, D, cfg, hover) {
    var bars = STATE.an.bars, dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 780;
    var subs = ["rsi", "macd", "stoch", "adx"].filter(function (k) { return cfg[k]; });
    var mainH = 330, subH = 82, H = mainH + subs.length * subH + 20;
    cv.style.height = H + "px"; cv.width = W * dpr; cv.height = H * dpr;
    var ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var cs = getComputedStyle(root.getElementById("panel"));
    var C = { fg: cs.getPropertyValue("--fg").trim() || "#222", mut: cs.getPropertyValue("--mut").trim() || "#777", line: cs.getPropertyValue("--line").trim() || "#ddd", bg: cs.getPropertyValue("--bg").trim() || "#fff", up: "#16a34a", dn: "#dc2626" };
    var nv = Math.min(cfg.n, D.n), i0 = D.n - nv, padL = 6, padR = 62, plotW = W - padL - padR, slot = plotW / nv;
    function X(i) { return padL + (i - i0 + 0.5) * slot; }
    var hi = -Infinity, lo = Infinity, i;
    for (i = i0; i < D.n; i++) { if (bars[i].h > hi) hi = bars[i].h; if (bars[i].l < lo) lo = bars[i].l; }
    if (cfg.bb) for (i = i0; i < D.n; i++) { if (D.series.bbUp[i] > hi) hi = D.series.bbUp[i]; if (D.series.bbLo[i] !== null && D.series.bbLo[i] < lo) lo = D.series.bbLo[i]; }
    var pad = (hi - lo) * 0.06; hi += pad; lo -= pad;
    function Y(p) { return 6 + (mainH - 12) * (1 - (p - lo) / (hi - lo)); }
    ctx.font = "10.5px sans-serif"; ctx.textBaseline = "middle";
    ctx.clearRect(0, 0, W, H);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, mainH); ctx.clip();   // خط‌های خارج از دامنه نمودار اصلی روی زیرنمودارها نیفتند
    // شبکه و برچسب قیمت
    ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.fillStyle = C.mut; ctx.textAlign = "left";
    for (i = 0; i <= 5; i++) { var py = hi - (hi - lo) * i / 5, yy = Y(py); ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke(); ctx.fillText(fnum(py), W - padR + 4, yy); }
    // ناحیه طلایی و فیبوناچی
    var FC = { 0: "#94a3b8", 0.236: "#38bdf8", 0.382: "#22c55e", 0.5: "#eab308", 0.618: "#f97316", 0.786: "#ef4444", 1: "#94a3b8" };
    if (cfg.fib && D.fib) {
      var lv = D.fib.levels, p5 = null, p6 = null;
      lv.forEach(function (l) { if (l.kind === "r" && l.r === 0.5) p5 = l.price; if (l.kind === "r" && l.r === 0.618) p6 = l.price; });
      if (p5 !== null && p6 !== null) { ctx.fillStyle = "rgba(234,179,8,0.13)"; var ya = Y(Math.max(p5, p6)), yb = Y(Math.min(p5, p6)); ctx.fillRect(padL, ya, plotW, yb - ya); }
      lv.forEach(function (l) {
        if (l.price < lo || l.price > hi) return;
        var yy2 = Y(l.price), colr = l.kind === "e" ? "#a855f7" : (FC[l.r] || "#94a3b8");
        ctx.strokeStyle = colr; ctx.setLineDash([5, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, yy2); ctx.lineTo(W - padR, yy2); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = colr; ctx.textAlign = "left"; ctx.fillText((l.kind === "e" ? "×" : "") + (l.r * 100).toFixed(l.r === 0.236 || l.r === 0.382 || l.r === 0.786 || l.kind === "e" ? 1 : 0).replace(".0", "") + "%", padL + 4, yy2 - 6);
      });
      var lg = D.fib.leg;
      if (lg.si >= i0 || lg.ei >= i0) { ctx.strokeStyle = "rgba(100,116,139,.8)"; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(X(Math.max(lg.si, i0)), Y(lg.sp)); ctx.lineTo(X(Math.max(lg.ei, i0)), Y(lg.ep)); ctx.stroke(); ctx.setLineDash([]); }
    }
    // حمایت و مقاومت
    if (cfg.sr && D.sr) {
      D.sr.res.forEach(function (p) { if (p < lo || p > hi) return; ctx.strokeStyle = "rgba(220,38,38,.55)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, Y(p)); ctx.lineTo(W - padR, Y(p)); ctx.stroke(); ctx.fillStyle = "#dc2626"; ctx.textAlign = "right"; ctx.fillText("مقاومت", W - padR - 4, Y(p) - 6); });
      D.sr.sup.forEach(function (p) { if (p < lo || p > hi) return; ctx.strokeStyle = "rgba(22,163,74,.55)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, Y(p)); ctx.lineTo(W - padR, Y(p)); ctx.stroke(); ctx.fillStyle = "#16a34a"; ctx.textAlign = "right"; ctx.fillText("حمایت", W - padR - 4, Y(p) + 8); });
    }
    function line(arr, color, w, dash) {
      ctx.strokeStyle = color; ctx.lineWidth = w; if (dash) ctx.setLineDash(dash); ctx.beginPath(); var st = false;
      for (var k = i0; k < D.n; k++) { if (arr[k] === null || arr[k] === undefined) { st = false; continue; } if (!st) { ctx.moveTo(X(k), Y(arr[k])); st = true; } else ctx.lineTo(X(k), Y(arr[k])); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    if (cfg.bb) { line(D.series.bbUp, "rgba(100,116,139,.8)", 1); line(D.series.bbLo, "rgba(100,116,139,.8)", 1); line(D.series.bbMid, "rgba(100,116,139,.5)", 1, [3, 3]); }
    // شمع‌ها
    var bw = Math.max(1, slot * 0.66);
    for (i = i0; i < D.n; i++) {
      var b = bars[i], up = b.c >= b.o, x = X(i);
      ctx.strokeStyle = up ? C.up : C.dn; ctx.fillStyle = up ? C.up : C.dn; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, Y(b.h)); ctx.lineTo(x, Y(b.l)); ctx.stroke();
      var yo = Y(b.o), yc = Y(b.c); ctx.fillRect(x - bw / 2, Math.min(yo, yc), bw, Math.max(1, Math.abs(yo - yc)));
    }
    if (cfg.sma) { line(D.series.sma20, "#3b82f6", 1.4); line(D.series.sma50, "#f59e0b", 1.4); line(D.series.sma200, "#a855f7", 1.4); }
    // قیمت فعلی
    var yl = Y(D.px); ctx.strokeStyle = C.fg; ctx.globalAlpha = 0.45; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(padL, yl); ctx.lineTo(W - padR, yl); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.fillStyle = C.fg; ctx.fillRect(W - padR, yl - 8, padR - 2, 16); ctx.fillStyle = C.bg; ctx.textAlign = "left"; ctx.fillText(fnum(D.px), W - padR + 3, yl);
    ctx.restore();
    // زیرنمودارها
    var top = mainH;
    function sub(title, series, o) {
      ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.strokeRect(padL, top + 2, plotW, subH - 6);
      var smin = o.min, smax = o.max;
      if (smin === undefined) { smin = Infinity; smax = -Infinity; series.forEach(function (sr) { for (var k = i0; k < D.n; k++) if (sr.a[k] !== null && sr.a[k] !== undefined) { if (sr.a[k] < smin) smin = sr.a[k]; if (sr.a[k] > smax) smax = sr.a[k]; } }); var pp = (smax - smin) * 0.1 || 1; smin -= pp; smax += pp; }
      function SY(v) { return top + 4 + (subH - 10) * (1 - (v - smin) / (smax - smin)); }
      (o.lines || []).forEach(function (lv2) { ctx.strokeStyle = C.mut; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(padL, SY(lv2)); ctx.lineTo(W - padR, SY(lv2)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = C.mut; ctx.textAlign = "left"; ctx.fillText(lv2, W - padR + 4, SY(lv2)); });
      series.forEach(function (sr) {
        if (sr.bars) { for (var k = i0; k < D.n; k++) { if (sr.a[k] === null) continue; ctx.fillStyle = sr.a[k] >= 0 ? "rgba(22,163,74,.6)" : "rgba(220,38,38,.6)"; var y0 = SY(0), y1 = SY(sr.a[k]); ctx.fillRect(X(k) - bw / 2, Math.min(y0, y1), bw, Math.max(1, Math.abs(y1 - y0))); } return; }
        ctx.strokeStyle = sr.c; ctx.lineWidth = 1.3; ctx.beginPath(); var st2 = false;
        for (var k2 = i0; k2 < D.n; k2++) { if (sr.a[k2] === null) { st2 = false; continue; } if (!st2) { ctx.moveTo(X(k2), SY(sr.a[k2])); st2 = true; } else ctx.lineTo(X(k2), SY(sr.a[k2])); }
        ctx.stroke();
      });
      ctx.fillStyle = C.fg; ctx.textAlign = "left"; ctx.fillText(title, padL + 6, top + 12);
      top += subH;
    }
    var Sx = D.series;
    subs.forEach(function (k) {
      if (k === "rsi") sub("RSI (۱۴)", [{ a: Sx.rsi, c: "#8b5cf6" }], { min: 0, max: 100, lines: [30, 70] });
      if (k === "macd") sub("MACD", [{ a: Sx.macdHist, bars: 1 }, { a: Sx.macdLine, c: "#3b82f6" }, { a: Sx.macdSig, c: "#f59e0b" }], {});
      if (k === "stoch") sub("استوکاستیک (۱۴،۳،۳)", [{ a: Sx.stK, c: "#06b6d4" }, { a: Sx.stD, c: "#f97316" }], { min: 0, max: 100, lines: [20, 80] });
      if (k === "adx") sub("ADX و DI (۱۴)", [{ a: Sx.adx, c: C.fg }, { a: Sx.pdi, c: C.up }, { a: Sx.mdi, c: C.dn }], { min: 0, max: 60, lines: [20, 40] });
    });
    // تاریخ‌ها
    ctx.fillStyle = C.mut; ctx.textAlign = "center";
    for (i = 0; i <= 4; i++) { var ix = i0 + Math.round((nv - 1) * i / 4); ctx.fillText(fmtDate(bars[ix].d), Math.min(Math.max(X(ix), 36), W - padR - 30), H - 8); }
    if (hover !== undefined && hover >= i0 && hover < D.n) {
      ctx.strokeStyle = C.fg; ctx.globalAlpha = 0.4; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(hover), 4); ctx.lineTo(X(hover), H - 18); ctx.stroke(); ctx.globalAlpha = 1;
    }
    cv._geo = { padL: padL, slot: slot, i0: i0, n: D.n };
  }
  function renderChartBody() {
    var el = root.getElementById("chartbody");
    if (!el) return;
    var cfg = STATE.chartCfg;
    if (!STATE.an || !STATE.an.bars || STATE.an.bars.length < 60) {
      el.innerHTML = '<div class="empty">سابقه قیمت سهم خوانده نشده است.<br>«به‌روزرسانی از سایت» را بزن (یا مطمئن شو صفحه یک سهم است).</div>';
      return;
    }
    var D = OC.chartData(STATE.an, num0(STATE.inp.S), cfg.h, STATE.st);
    if (!D) { el.innerHTML = '<div class="empty">برای تحلیل نمودار حداقل ۶۰ روز سابقه لازم است.</div>'; return; }
    function chip(attr, key, label, on) { return '<button class="chip' + (on ? " on" : "") + '" data-' + attr + '="' + key + '">' + label + '</button>'; }
    var h = '<div class="chips"><span class="lb">بازه:</span>' + [60, 120, 250].map(function (n) { return chip("cn", n, fa(n) + " روز", cfg.n === n); }).join("") +
      '<span class="lb" style="margin-inline-start:8px">لایه‌ها:</span>' + [["fib", "فیبوناچی"], ["sma", "میانگین‌ها"], ["bb", "بولینگر"], ["sr", "حمایت/مقاومت"]].map(function (x) { return chip("cf", x[0], x[1], cfg[x[0]]); }).join("") + '</div>' +
      '<div class="chips"><span class="lb">زیرنمودار:</span>' + [["rsi", "RSI"], ["macd", "MACD"], ["stoch", "استوکاستیک"], ["adx", "ADX"]].map(function (x) { return chip("cf", x[0], x[1], cfg[x[0]]); }).join("") + '</div>' +
      '<div class="cvinfo" id="cvinfo">&nbsp;</div><div class="cvwrap"><canvas id="cv"></canvas></div>';
    // ---- احتمال جهت
    var P = D.prob, hh = cfg.h;
    h += '<div class="sg"><h5>احتمال جهت در ' + fa(hh) + ' روز معاملاتی آینده</h5><div class="chips" style="margin:0 0 6px">' + [5, 10, 20].map(function (n) { return chip("ch", n, fa(n) + " روز", hh === n); }).join("") + '</div>';
    if (P.p !== undefined) {
      var mid = P.p * 100, l = P.lo * 100, u = P.hi * 100;
      h += '<div class="pbig"><span class="pv">' + fa(mid.toFixed(0)) + '٪ صعود</span><span style="color:var(--mut)">بازه اطمینان ' + fa(l.toFixed(0)) + '٪ تا ' + fa(u.toFixed(0)) + '٪</span></div>' +
        '<div class="pbar"><b style="left:' + l + '%;width:' + Math.max(1, u - l) + '%"></b><i style="left:calc(' + mid + '% - 1px)"></i></div>' +
        '<div class="msg ' + (/معنادار\)$/.test(P.verdict) ? (/صعود/.test(P.verdict) ? "ok" : "h") : "wait") + '"><b>' + esc(P.verdict) + '</b></div>' +
        '<div class="legend" style="margin:6px 0 0">میانگین ' + fa(P.used) + ' سیگنال با نمونه کافی؛ نرخ پایه‌ی صعود در سابقه‌ی همین سهم ' + (P.base !== null ? fa((P.base * 100).toFixed(0)) + '٪' : "—") + '. اگر بازه‌ی اطمینان ۵۰٪ را شامل شود، برتری آماری وجود ندارد.</div>';
    } else h += '<div class="msg wait">' + esc(P.verdict) + '</div>';
    h += '<div class="line"><span>دامنه محتمل قیمت (۶۸٪ احتمال)</span><span class="vv">' + fnum(D.range.low68) + ' تا ' + fnum(D.range.high68) + '</span></div>' +
      '<div class="line"><span>دامنه محتمل قیمت (۹۵٪ احتمال)</span><span class="vv">' + fnum(D.range.low95) + ' تا ' + fnum(D.range.high95) + '</span></div>';
    if (D.divergence) h += '<div class="msg ' + (/مثبت/.test(D.divergence) ? "ok" : "h") + '">' + esc(D.divergence) + '</div>';
    h += '</div>';
    // ---- جدول سیگنال‌ها
    h += '<div class="cmp sgt"><table><thead><tr><th class="lab">سیگنال</th><th>مقدار فعلی</th><th>حالت</th><th>نمونه</th><th>صعود تاریخی</th><th>بازده میانگین</th></tr></thead><tbody>';
    D.signals.forEach(function (sg) {
      var st = sg.stat, low = !st || st.n < 8;
      h += '<tr style="' + (low ? "opacity:.55" : "") + '"><td class="lab">' + esc(sg.name) + '</td><td class="v">' + esc(sg.val) + '</td><td>' + esc(st ? st.state : "—") + '</td><td class="v">' + (st ? fa(st.n) + (low ? " (کم)" : "") : "—") + '</td>' +
        '<td class="v ' + (st && !low && st.p > (st.base || 0.5) + 0.08 ? "best" : st && !low && st.p < (st.base || 0.5) - 0.08 ? "worst" : "") + '">' + (st && st.p !== undefined ? fa((st.p * 100).toFixed(0)) + '٪' : "—") + '</td>' +
        '<td class="v">' + (st && st.avgRet !== undefined ? fa((st.avgRet * 100).toFixed(1)) + '٪' : "—") + '</td></tr>';
    });
    h += '</tbody></table></div>';
    // ---- فیبوناچی
    if (D.fib) {
      var lg = D.fib.leg;
      h += '<div class="sg"><h5>فیبوناچی — آخرین سوینگ ' + (lg.up ? "صعودی" : "نزولی") + (lg.prov ? " (هنوز در جریان)" : "") + ': ' + fnum(lg.sp) + ' ← ' + fnum(lg.ep) + '</h5>';
      if (D.fib.retrPos !== null) h += '<div class="msg ' + (D.fib.golden ? "ok" : "wait") + '">قیمت فعلی ' + fa((D.fib.retrPos * 100).toFixed(0)) + '٪ از این سوینگ را برگردانده است' + (D.fib.golden ? " — داخل ناحیه‌ی طلایی (۵۰ تا ۶۲٫۸٪)" : "") + '.</div>';
      h += '<div class="cmp sgt" style="margin:6px 0 0"><table><thead><tr><th class="lab">سطح</th><th>قیمت</th><th>فاصله از قیمت</th><th>احتمال لمس تا ' + fa(hh) + ' روز</th></tr></thead><tbody>';
      D.fib.levels.slice().sort(function (a, b) { return b.price - a.price; }).forEach(function (lv) {
        var near = Math.abs(lv.price / D.px - 1) < 0.01;
        h += '<tr' + (near ? ' style="font-weight:700"' : '') + '><td class="lab">' + (lv.kind === "e" ? "گسترش " + lv.r : "بازگشت " + fa((lv.r * 100).toFixed(1).replace(".0", "")) + "٪") + '</td><td class="v">' + fnum(lv.price) + '</td><td class="v">' + fa(((lv.price / D.px - 1) * 100).toFixed(1)) + '٪</td><td class="v">' + (lv.pTouch !== null ? fa((lv.pTouch * 100).toFixed(0)) + '٪' : "—") + '</td></tr>';
      });
      h += '</tbody></table></div>';
      if (D.sr) {
        h += '<div class="legend" style="margin:6px 0 0">احتمال لمس حمایت/مقاومت‌ها تا ' + fa(hh) + ' روز: ' +
          D.sr.res.map(function (p, k) { return "مقاومت " + fnum(p) + " ← " + fa((D.sr.resP[k] * 100).toFixed(0)) + "٪"; }).concat(D.sr.sup.map(function (p, k) { return "حمایت " + fnum(p) + " ← " + fa((D.sr.supP[k] * 100).toFixed(0)) + "٪"; })).join(" · ") + '</div>';
      }
      h += '</div>';
    }
    h += outlookBlock(hh, "🔭 جمع‌بندی: نماد احتمالاً چطور می‌رود؟ (" + fa(hh) + " روز آینده)");
    h += '<div class="legend" style="margin:0 12px 8px">احتمال‌ها از شمارش در سابقه‌ی خود سهم (آمار شرطی با انقباض به ۵۰٪ و کاهش نمونه‌ی مؤثر به‌خاطر هم‌پوشانی) و مدل نوسان (احتمال لمس سطح، بدون فرض روند) به‌دست آمده‌اند. سابقه فقط یک سال است، پس عددها نامطمئن‌اند؛ پیش‌بینی یا توصیه‌ی سرمایه‌گذاری نیستند.</div>';
    el.innerHTML = h;
    var cv = root.getElementById("cv");
    drawChart(cv, D, cfg);
    var info = root.getElementById("cvinfo");
    cv.onmousemove = function (e) {
      var g = cv._geo, r = cv.getBoundingClientRect(), x = e.clientX - r.left;
      var idx = Math.min(g.n - 1, Math.max(g.i0, g.i0 + Math.floor((x - g.padL) / g.slot)));
      var b = STATE.an.bars[idx], S2 = D.series;
      info.textContent = fmtDate(b.d) + "  O " + fnum(b.o) + "  H " + fnum(b.h) + "  L " + fnum(b.l) + "  C " + fnum(b.c) + "  V " + fnum(b.v) + "  RSI " + fnum(S2.rsi[idx], 0) + "  MACD " + fnum(S2.macdHist[idx], 1) + "  %K " + fnum(S2.stK[idx], 0);
      drawChart(cv, D, cfg, idx);
    };
    cv.onmouseleave = function () { drawChart(cv, D, cfg); info.innerHTML = "&nbsp;"; };
    el.onclick = function (e) {
      var b = e.target.closest && e.target.closest(".chip");
      if (!b) return;
      if (b.dataset.cn) cfg.n = Number(b.dataset.cn);
      else if (b.dataset.ch) cfg.h = Number(b.dataset.ch);
      else if (b.dataset.cf) cfg[b.dataset.cf] = cfg[b.dataset.cf] ? 0 : 1;
      renderChartBody();
    };
  }


  // ---- جدول‌های مالی خوانده‌شده مستقیم از صفحه‌ی سایت
  var KIND_LABEL = { bs: "ترازنامه", is: "سود و زیان", cf: "جریان وجوه نقد" };
  function dateOf(h) { var m = String(h || "").match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; }
  function mBetween(a, b) { return (b.y - a.y) * 12 + (b.m - a.m); }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  var FLOW = { rev: 1, cogs: 1, opinc: 1, int: 1, ni: 1, cfo: 1 };
  function mapCol(t, j) {
    var o = {};
    (t.rows || []).forEach(function (row) {
      var v = row.v ? row.v[j] : null;
      if (v === null || v === undefined) return;
      var lab = normLabel(row.l);
      if (o.eps === undefined && /^سودزیان(خالص|پایه)?هرسهم/.test(lab)) o.eps = v;
      Object.keys(FIN_PAT).forEach(function (k) {
        if (o[k] !== undefined) return;
        if (!FIN_PAT[k].some(function (re) { return re.test(lab); })) return;
        o[k] = (k === "cogs" || k === "int") ? Math.abs(v) : v;
      });
    });
    return o;
  }
  // ستون اول = جاری، ستون دوم = مقایسه‌ای. دوره‌ی میان‌دوره‌ای: TTM (سال مالی قبل + جاری − مشابه سال قبل) و اگر ممکن نبود ×۱۲/ماه
  function mapTable(t) {
    var c0 = mapCol(t, 0), c1 = mapCol(t, 1), out = { y0: {}, y1: {}, method: "annual" };
    if (c0.eps !== undefined) out.eps = c0.eps;
    var interim = t.months && t.months > 0 && t.months < 12 && (t.kind === "is" || t.kind === "cf");
    var d0 = dateOf(t.cols && t.cols[0]) || dateOf(t.end), d1 = dateOf(t.cols && t.cols[1]), d2 = dateOf(t.cols && t.cols[2]);
    var ttm = interim && t.cols.length >= 3 && d0 && d1 && d2 && mBetween(d1, d0) === 12 && mBetween(d2, d0) === t.months;
    var c2 = ttm ? mapCol(t, 2) : null;
    var mult = (interim && !ttm) ? 12 / t.months : 1;
    if (interim) out.method = ttm ? "ttm" : "x" + (12 / t.months);
    Object.keys(c0).forEach(function (k) {
      if (k === "eps") return;
      if (!FLOW[k]) { out.y0[k] = c0[k]; if (c1[k] !== undefined) out.y1[k] = c1[k]; return; }
      if (ttm && c2[k] !== undefined && c1[k] !== undefined) { out.y0[k] = c2[k] + c0[k] - c1[k]; out.y1[k] = c2[k]; return; }
      out.y0[k] = c0[k] * mult; if (c1[k] !== undefined) out.y1[k] = c1[k] * mult;
    });
    if (t.kind === "is" && t.extra && t.extra.divApproved > 0 && out.y0.cap > 0 && out.y0.dps === undefined) out.y0.dps = Math.round(t.extra.divApproved / out.y0.cap * 1000);
    return out;
  }
  // هر ستون تاریخ‌دار جدول (جاری و مقایسه‌ای‌ها) به‌عنوان یک دوره در تاریخچه ذخیره می‌شود
  function addHist(f, t) {
    f.hist = f.hist || {};
    var d0 = dateOf(t.cols && t.cols[0]) || dateOf(t.end);
    if (!d0) return;
    (t.cols || []).forEach(function (h, j) {
      var d = j === 0 ? d0 : dateOf(h);
      if (!d) return;
      var months = 0;
      if (t.kind !== "bs") {
        if (j === 0) months = t.months || 12;
        else if (t.months === 12) months = 12;
        else if (d.m === d0.m) months = t.months;
        else if (mBetween(d, d0) === t.months) months = 12;
        else return;
      }
      var vals = mapCol(t, j);
      if (Object.keys(vals).length < 2) return;
      var end = d.y + "/" + pad2(d.m) + "/" + pad2(d.d), key = t.kind + "|" + end + "|" + months;
      if (f.hist[key] && f.hist[key].direct && j !== 0) return;
      f.hist[key] = { kind: t.kind, end: end, months: months, vals: vals, direct: j === 0 };
    });
    var ks = Object.keys(f.hist);
    if (ks.length > 80) ks.sort(function (a, b) { return (f.hist[a].direct ? 1 : 0) - (f.hist[b].direct ? 1 : 0) || f.hist[a].end.localeCompare(f.hist[b].end); }).slice(0, ks.length - 80).forEach(function (k) { delete f.hist[k]; });
  }
  function growth(a, b) { return (a === undefined || b === undefined || a === null || b === null || !(b > 0)) ? null : (a / b - 1) * 100; }
  function pctTxt(v) { return v === null ? "—" : (v > 0 ? "+" : "") + Math.round(v) + "٪"; }
  function trendHtml(f) {
    var H = Object.keys(f.hist || {}).map(function (k) { return f.hist[k]; });
    var IS = H.filter(function (h) { return h.kind === "is"; }).sort(function (a, b) { return b.end.localeCompare(a.end) || b.months - a.months; });
    var BS = H.filter(function (h) { return h.kind === "bs"; }).sort(function (a, b) { return b.end.localeCompare(a.end); });
    if (IS.length < 2 && BS.length < 2) return "";
    function prior(h) { var d = dateOf(h.end); return IS.filter(function (x) { var e = dateOf(x.end); return x.months === h.months && e && e.y === d.y - 1 && e.m === d.m; })[0]; }
    var lab = function (h) { return esc(h.end) + (h.months ? " (" + fa(h.months) + "ماهه)" : ""); };
    var h = '<div class="sg"><h5>📈 روند دوره‌ها (از ستون‌های مقایسه‌ای هم ساخته می‌شود)</h5>';
    if (IS.length) {
      h += '<div class="cmp"><table><thead><tr><th class="lab">دوره</th><th>درآمد</th><th>سود عملیاتی</th><th>سود خالص</th><th>رشد درآمد</th><th>رشد سود</th></tr></thead><tbody>';
      IS.slice(0, 10).forEach(function (x) {
        var pr = prior(x);
        h += '<tr><td class="lab">' + lab(x) + '</td><td class="v">' + numFmt(x.vals.rev) + '</td><td class="v">' + numFmt(x.vals.opinc) + '</td><td class="v">' + numFmt(x.vals.ni) + '</td><td class="v">' + pctTxt(pr ? growth(x.vals.rev, pr.vals.rev) : null) + '</td><td class="v">' + pctTxt(pr ? growth(x.vals.ni, pr.vals.ni) : null) + '</td></tr>';
      });
      h += '</tbody></table></div><div class="legend">رشد = نسبت به همان دوره‌ی سال قبل (در صورت موجود بودن).</div>';
    }
    if (BS.length) {
      h += '<div class="cmp"><table><thead><tr><th class="lab">تاریخ ترازنامه</th><th>جمع دارایی‌ها</th><th>جمع بدهی‌ها</th><th>حقوق صاحبان سهام</th></tr></thead><tbody>';
      BS.slice(0, 8).forEach(function (x) { h += '<tr><td class="lab">' + esc(x.end) + '</td><td class="v">' + numFmt(x.vals.ta) + '</td><td class="v">' + numFmt(x.vals.tl) + '</td><td class="v">' + numFmt(x.vals.eq) + '</td></tr>'; });
      h += '</tbody></table></div>';
    }
    return h + '</div>';
  }
  function applyTables(f, tbs, force) {
    f.manual = f.manual || {};
    var n = 0;
    tbs.forEach(function (t) {
      var m = mapTable(t);
      if (m.eps !== undefined) f.epsTbl = m.eps;
      Object.keys(m.y0).forEach(function (k) {
        if (!force && f.manual[k]) return;
        f.y0[k] = m.y0[k];
        if (m.y1[k] !== undefined) f.y1[k] = m.y1[k]; else delete f.y1[k];
        if (force) delete f.manual[k];
        n++;
      });
    });
    return n;
  }
  function sortedTables(f) {
    return Object.keys(f.tables || {}).map(function (k) { return f.tables[k]; })
      .sort(function (a, b) { return String(b.end || "").localeCompare(String(a.end || "")) || String(a.kind).localeCompare(String(b.kind)) || (/نشده/.test(a.audit || "") ? 1 : 0) - (/نشده/.test(b.audit || "") ? 1 : 0) || (b.months || 0) - (a.months || 0); });
  }
  function entityList(f) {
    var m = {};
    sortedTables(f).forEach(function (t) {
      var e = t.ent || "";
      if (!m[e]) m[e] = { ent: e, core: t.core || "", bs: 0, is: 0, end: "" };
      if ((t.end || "") > m[e].end) m[e].end = t.end || "";
    });
    var L = Object.keys(m).map(function (k) { return m[k]; });
    L.forEach(function (x) {   // وجود هر نوع جدول در کل منابع هم‌هسته
      sortedTables(f).forEach(function (t) { if ((t.core || "") === x.core) { if (t.kind === "bs") x.bs++; if (t.kind === "is") x.is++; } });
    });
    return L;
  }
  function pickEntity(f) {
    var L = entityList(f);
    if (!L.length) return "";
    if (f.entity !== undefined && f.entity !== "" && L.some(function (x) { return x.ent === f.entity; })) return f.entity;
    L.forEach(function (x) { x.sc = (x.bs ? 2 : 0) + (x.is ? 2 : 0) + (/تلفیقی/.test(x.ent) ? 1.5 : 0); });
    L.sort(function (a, b) { return b.sc - a.sc || String(b.end).localeCompare(String(a.end)); });
    return L[0].ent;
  }
  function pickTables(f) {
    var S = f.slots || {};
    return { ent: "", warn: [], bs: S.bs || null, is: S.is || null, cf: S.cf || null };
  }
  function autoApplyFin(f) {
    var pk = pickTables(f), list = [pk.bs, pk.is, pk.cf].filter(Boolean);
    f.manual = f.manual || {};
    if (f.srcEnt !== pk.ent) {     // منبع (شرکت/تلفیقی) عوض شد: اعداد خودکار قبلی پاک شوند تا قاطی نشوند
      ["y0", "y1"].forEach(function (y) { Object.keys(f[y]).forEach(function (k) { if (!f.manual[k]) delete f[y][k]; }); });
      delete f.epsTbl; f.srcEnt = pk.ent;
    }
    if (list.length) applyTables(f, list, false);
    f.src = { bs: pk.bs ? pk.bs.key : null, is: pk.is ? pk.is.key : null, cf: pk.cf ? pk.cf.key : null };
  }
  function ttmNote(pk) {
    var t = pk.is || pk.cf; if (!t) return "";
    var m = mapTable(t).method;
    if (m === "ttm") return '<br>ℹ سود و زیان ۱۲ ماهه‌ی منتهی به ' + esc(t.end || "") + ' محاسبه شد: سال مالی قبل + دوره‌ی جاری − همان دوره‌ی سال قبل (TTM).';
    return '<br>⚠ ستون سال مالی قبل در جدول نبود؛ سود و زیان میان‌دوره‌ای به‌صورت سالانه (×' + fa(+(12 / t.months).toFixed(2)) + ') برآورد شد و فصلی بودن سود را نمی‌بیند.';
  }
  function sourceHtml(f) {
    var pk = pickTables(f), parts = [], ann = false;
    var EL = entityList(f), entSel = "";
    if (EL.length > 1) {
      entSel = '<div class="f1"><label>منبع صورت‌های مالی (چند شرکت/تلفیقی روی صفحه هست)</label><select id="finent"><option value="">خودکار</option>' +
        EL.map(function (x) { return '<option value="' + esc(x.ent) + '"' + (f.entity === x.ent ? " selected" : "") + '>' + esc(x.ent || "(بدون نام)") + '</option>'; }).join("") + '</select></div>';
    }
    ["bs", "is", "cf"].forEach(function (k) {
      var t = pk[k]; if (!t) return;
      var i = t.months && t.months < 12 && k !== "bs";
      if (i) ann = true;
      parts.push(esc(KIND_LABEL[k]) + " " + esc(t.end || "") + (i ? " (" + fa(t.months) + " ماهه)" : ""));
    });
    var need = { rev: "is", cogs: "is", opinc: "is", int: "is", ni: "is", ta: "bs", ca: "bs", cl: "bs", tl: "bs", eq: "bs", re: "bs", cfo: "cf", rec: "bs", cap: "is", dps: "is" };
    var miss = OC.FIN_KEYS.filter(function (k) { return f.y0[k[0]] === undefined; });
    var cov = "";
    if (parts.length && miss.length) {
      var missTabs = {}; miss.forEach(function (k) { missTabs[need[k[0]] || "?"] = 1; });
      var noTab = [];
      if (missTabs.bs && !pk.bs) noTab.push("ترازنامه"); if (missTabs.is && !pk.is) noTab.push("سود و زیان"); if (missTabs.cf && !pk.cf) noTab.push("جریان وجوه نقد");
      cov = '<div class="msg w">⚠ ' + fa(miss.length) + ' ردیف خالی: ' + esc(miss.map(function (k) { return k[1]; }).join("، ")) + '.' +
        (noTab.length ? '<br>برای پر شدن، این تب‌ها را روی سایت باز کن: <b>' + esc(noTab.join("، ")) + '</b>' : '<br>جدول‌ها خوانده شده‌اند ولی برچسب این ردیف‌ها روی سایت با الگوهای افزونه نمی‌خواند؛ «کپی گزارش جدول‌ها» را بزن و برایم بفرست.') + '</div>';
    }
    if (pk.warn && pk.warn.length) cov += '<div class="msg w">' + esc(pk.warn.join(" — ")) + '</div>';
    if (!parts.length) return '<div class="note">هنوز جدولی نیامده. صورت مالی خودکار از کدال گرفته می‌شود — وضعیت: ' + esc(CDL.finMsg || CDL.err || (CDL.loading ? 'در حال دریافت فهرست از کدال…' : 'منتظر شروع…')) + ' (برای تلاش دوباره تب «کدال» را باز کن و «به‌روزرسانی» را بزن). نیازی به وارد کردن دستی یا اکسل نیست.</div>';
    return '<div class="note">تحلیل خودکار از جدول‌های خوانده‌شده' + (pk.ent ? ' (منبع: <b>' + esc(pk.ent) + '</b>)' : '') + ': <b>' + parts.join(" + ") + '</b>' + (ann ? ttmNote(pk) : '') + '<br>ستون اول هر جدول = دوره‌ی جاری، ستون دوم = دوره‌ی مقایسه‌ای.</div>' + cov + entSel;
  }
  function numFmt(v) { return v === null || v === undefined ? "—" : (v < 0 ? "-" : "") + Math.abs(Math.round(v)).toLocaleString("en-US"); }
  var SLOT_TAB = { bs: "ترازنامه", is: "سود و زیان", cf: "جریان وجوه نقد" };
  function scrapedHtml(f) {
    var S = f.slots || {};
    var h = "";
    ["bs", "is", "cf"].forEach(function (kind) {
      var t = S[kind];
      h += '<div class="sg"><h5>' + (t ? "✅ " : "⏳ ") + esc(KIND_LABEL[kind]) + (kind === "cf" ? " (اختیاری)" : "") + (t ? ' — ' + esc(t.end || "") + (t.months ? " — " + fa(t.months) + " ماهه" : "") + (t.audit ? " — " + esc(t.audit) : "") + (t.src === "codal" ? " — منبع: کدال" : " — منبع: TSETMC") : "") + '</h5>';
      if (!t) { h += '<div class="legend">«' + esc(SLOT_TAB[kind]) + '» هنوز از کدال نیامده؛ بعد از دریافت اکسل صورت مالی خودکار پر می‌شود.</div></div>'; return; }
      if (t.months && t.months < 12 && kind !== "bs") h += '<div class="msg w">' + (mapTable(t).method === "ttm" ? 'ℹ دوره میان‌دوره‌ای؛ برای تحلیل به ۱۲ ماه TTM تبدیل می‌شود.' : '⚠ دوره میان‌دوره‌ای؛ سالانه‌سازی ×' + fa(+(12 / t.months).toFixed(2))) + '</div>';
      h += '<details style="margin:4px 0" data-dk="s:' + kind + '"' + (OPEN_D["s:" + kind] ? ' open' : '') + '><summary>نمایش جدول (' + fa(t.rows.length) + ' ردیف)' + (t.ent ? ' — ' + esc(t.ent) : '') + '</summary>';
      h += '<div class="cmp"><table><thead><tr><th class="lab">شرح</th>' + t.cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join("") + '<th>درصد تغییر</th></tr></thead><tbody>';
      t.rows.forEach(function (r) {
        h += '<tr><td class="lab">' + esc(r.l) + '</td>' + r.v.map(function (v) { return '<td class="v">' + numFmt(v) + '</td>'; }).join("") + '<td class="v">' + (r.ch === null || r.ch === undefined ? "—" : numFmt(r.ch)) + '</td></tr>';
      });
      h += '</tbody></table></div><div class="fset"><button class="btn" data-clr="' + kind + '">پاک کردن این بخش</button></div></details></div>';
    });
    return h + (CDL.finMsg ? '<div class="legend">' + esc(CDL.finMsg) + '</div>' : '') + '<div class="fset"><button class="usep" id="cdlfin">📥 دریافت آخرین صورت مالی از کدال</button><button class="btn" id="findiag">📋 کپی گزارش جدول‌ها (برای عیب‌یابی)</button></div>';
  }
  function bindScraped(el, f) {
    var cf = el.querySelector("#cdlfin");
    if (cf) cf.onclick = function () {
      cdlEnsure(true, function () {
        var L = cdlFinLetters();
        if (!L.length) { CDL.finMsg = CDL.err || "صورت مالی دارای اکسل در کدال پیدا نشد."; renderFinBody(); return; }
        cdlReadFin(L[0]);
      });
    };
    var dg = el.querySelector("#findiag");
    if (dg) dg.onclick = function () {
      var txt = ["bs", "is", "cf"].map(function (k) { var t = (f.slots || {})[k]; return t ? [k, t.ent, t.end, t.months, t.audit, t.rows.length + " rows", t.cols.join(" ; "), t.rows.slice(0, 4).map(function (r) { return r.l; }).join(" / ")].join(" | ") : k + " | —"; }).join("\n");
      try { navigator.clipboard.writeText(txt).then(function () { alert("کپی شد."); }, function () { prompt("کپی کن:", txt); }); } catch (e) { prompt("کپی کن:", txt); }
    };
    el.querySelectorAll("[data-clr]").forEach(function (b) {
      b.onclick = function () { if (confirm("این بخش پاک شود؟ (با باز کردن دوباره‌ی تب روی سایت دوباره خوانده می‌شود)")) { f.slots[b.dataset.clr] = null; delete f.srcEnt; persistFin(); renderFinBody(); } };
    });
  }
  function handleFin(p, tries) {
    if (window.top !== window) return;
    if (!symLoaded) { if ((tries || 0) < 20) setTimeout(function () { handleFin(p, (tries || 0) + 1); }, 500); return; }
    var f = STATE.fin; f.slots = f.slots || { bs: null, is: null, cf: null }; f.manual = f.manual || {};
    var changed = false;
    ["bs", "is", "cf"].forEach(function (kind) {
      var c = (p.tables || []).filter(function (t) { return t.kind === kind; });
      if (!c.length) return;
      c.sort(function (a, b) {   // جدیدترین دوره، بعد تلفیقی، بعد حسابرسی‌شده، بعد جدول کامل‌تر
        return String(b.end || "").localeCompare(String(a.end || "")) ||
          (/تلفیقی/.test((b.ent || "") + (b.title || "")) ? 1 : 0) - (/تلفیقی/.test((a.ent || "") + (a.title || "")) ? 1 : 0) ||
          (b.src === "codal" ? 1 : 0) - (a.src === "codal" ? 1 : 0) ||
          (/نشده/.test(a.audit || "") ? 1 : 0) - (/نشده/.test(b.audit || "") ? 1 : 0) || b.rows.length - a.rows.length;
      });
      var t = c[0], o = f.slots[kind];
      if (o && o.src === "codal" && t.src !== "codal" && String(o.end || "") === String(t.end || "")) return;   // جدول کدال کامل‌تر است؛ با TSETMC عوض نشود
      if (!o || JSON.stringify([o.cols, o.rows, o.end]) !== JSON.stringify([t.cols, t.rows, t.end])) { f.slots[kind] = t; changed = true; addHist(f, t); }
    });
    if (!changed) return;
    delete f.srcEnt;
    autoApplyFin(f); persistFin();
    var ae = root.activeElement;
    if (STATE.view === "fin" && !(ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName))) renderFinBody();
  }
  window.addEventListener("message", function (e) { if (e.data && e.data.__bcFin) handleFin(e.data.__bcFin, 0); });
  (function startFinScan() {
    if (!window.FinCollect) return;
    function send(payload) { if (window.top === window) handleFin(payload, 0); else { try { window.top.postMessage({ __bcFin: payload }, "*"); } catch (e) {} } }
    var tmr = null;
    function go() { try { window.FinCollect.scan(document, send); } catch (e) {} }
    // فقط بعد از اینکه کاربر پنل را باز کرد (در همه‌ی فریم‌ها) اسکن جدول‌ها شروع می‌شود
    window.ComboLazy.onActive(function () {
      setInterval(go, 3000);
      go();
      try { new MutationObserver(function () { clearTimeout(tmr); tmr = setTimeout(go, 900); }).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
    });
  })();

  // ---- بارگذاری داده‌های ذخیره‌شده‌ی نماد (قیمت‌ها، ورودی‌ها، تحلیل، مالی) با کلید کد نماد
  function loadSymbol(cb) {
    var key = pageKey; symLoaded = false;
    function applyD(d) {
      STATE.inp = (d && d.inp) || {}; STATE.an = (d && d.an) || null; STATE.at = (d && d.at) || null;
      if (d && d.type) STATE.type = d.type;
    }
    function finStep(d) {
      store.get("fin:" + key, function (f) {
        if (key !== pageKey) return;
        function done(ff) {
          STATE.fin = Object.assign(FIN_DEF(), ff || {});
          STATE.fin.y0 = STATE.fin.y0 || {}; STATE.fin.y1 = STATE.fin.y1 || {}; STATE.fin.manual = STATE.fin.manual || {}; STATE.fin.tables = STATE.fin.tables || {};
          var F = STATE.fin; F.slots = F.slots || { bs: null, is: null, cf: null };
          sortedTables(F).forEach(function (t) { if (t.v === 2 && !F.slots[t.kind]) F.slots[t.kind] = t; });   // انتقال از قالب قبلی
          F.tables = {};
          if (!F.hist) { F.hist = {}; ["bs", "is", "cf"].forEach(function (k) { if (F.slots[k]) addHist(F, F.slots[k]); }); }
          symLoaded = true;
          cb(!!(d && d.inp && Number(d.inp.S) > 0));
        }
        if (f || key === legacyKey()) done(f);
        else store.get("fin:" + legacyKey(), function (f2) { if (key !== pageKey) return; if (f2) store.set("fin:" + key, f2); done(f2); });
      });
    }
    store.get(key, function (d) {
      if (key !== pageKey) return;
      if (d || key === legacyKey()) { applyD(d); finStep(d); return; }
      store.get(legacyKey(), function (d2) {   // انتقال از کلید قدیمی (بر اساس نشانی صفحه)
        if (key !== pageKey) return;
        applyD(d2); if (d2) store.set(key, d2); finStep(d2);
      });
    });
  }
  function allStored(cb) {
    try { if (chrome.storage && chrome.storage.local) { chrome.storage.local.get(null, function (r) { cb(r || {}); }); return; } } catch (e) {}
    var o = {};
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf("cb:") === 0) { try { o[k.slice(3)] = JSON.parse(localStorage.getItem(k)); } catch (e) {} } }
    cb(o);
  }
  function restoreStored(data, cb) {
    try { if (chrome.storage && chrome.storage.local) { chrome.storage.local.set(data, cb); return; } } catch (e) {}
    Object.keys(data).forEach(function (k) { try { localStorage.setItem("cb:" + k, JSON.stringify(data[k])); } catch (e) {} });
    cb();
  }
  function cachedNote() {
    if (!STATE.at) return;
    var el = root.getElementById("rep");
    if (el) el.innerHTML = '<div class="t">اطلاعات ذخیره‌شده‌ی این نماد بارگذاری شد (آخرین خواندن: ' + esc(new Date(STATE.at).toLocaleString("fa-IR")) + '). برای به‌روزرسانی «خواندن از سایت» را بزن؛ تا آن موقع چیزی پاک یا جایگزین نمی‌شود.</div>';
  }


  // ================= کدال =================
  var CDL = { sym: null, list: [], at: 0, f: "all", loading: false, err: "", tried: {}, finBusy: null, finMsg: "" };
  var CDL_CLS = [["fin", "صورت مالی", /صورت\s*های\s*مالی|اطلاعات و صورت/], ["mon", "فعالیت ماهانه", /فعالیت\s*ماهانه/], ["imp", "افشای بااهمیت", /بااهمیت|با اهمیت/], ["div", "تقسیم سود", /تقسیم\s*سود|سود\s*نقدی|پرداخت\s*سود/], ["agm", "مجمع", /مجمع/], ["cap", "افزایش سرمایه", /افزایش\s*سرمایه/]];
  function toLat(x) { return String(x || "").replace(/[۰-۹]/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹".indexOf(d); }).replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); }); }
  function cdlCls(title) { var t = String(title || "").replace(/[\u200c]/g, " "); for (var i = 0; i < CDL_CLS.length; i++) if (CDL_CLS[i][2].test(t)) return CDL_CLS[i][0]; return "other"; }
  function cdlAbs(u) { if (!u) return ""; if (/^https?:/.test(u)) return u; return "https://codal.ir" + (u.charAt(0) === "/" ? "" : "/") + u; }
  function cdlSym() { var n = STATE.inp && STATE.inp.name_o; return n ? String(n).replace(/ي/g, "ی").replace(/ك/g, "ک").trim() : ""; }
  function cdlUrl(sym, page) {
    return "https://search.codal.ir/api/search/v2/q?&Audited=true&AuditorRef=-1&Category=-1&Childs=true&CompanyState=-1&CompanyType=-1&Consolidatable=true&IsNotAudited=false&Length=-1&LetterType=-1&Mains=true&NotAudited=true&NotConsolidatable=true&PageNumber=" + page + "&Publisher=false&TracingNo=-1&search=true&Symbol=" + encodeURIComponent(sym);
  }
  function cdlFindUrl(o, re) {
    var ks = Object.keys(o || {});
    for (var i = 0; i < ks.length; i++) { var v = o[ks[i]]; if (typeof v === "string" && /^(https?:)?\/\//.test(v) && re.test(v)) return v; }
    return "";
  }
  function cdlBin(url, cb) {
    try {
      chrome.runtime.sendMessage({ t: "codalbin", url: url }, function (r) {
        if (!r || !r.ok) { cb(null, (r && (r.err || ("HTTP " + r.status))) || (chrome.runtime.lastError && chrome.runtime.lastError.message) || "no response"); return; }
        var bin = atob(r.b64), u = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        cb(u.buffer);
      });
    } catch (e) { cb(null, String(e)); }
  }
  function cdlFinLetters() {
    var L = (CDL.list || []).filter(function (x) { return x.excel && /صورت\s*های\s*مالی/.test(String(x.title).replace(/[\u200c]/g, " ")) && !/توضیحات/.test(x.title); });
    function endOf(x) { var d = dateOf(toLat(x.title)); return d ? d.y + "/" + pad2(d.m) + "/" + pad2(d.d) : ""; }
    var idx = {}; (CDL.list || []).forEach(function (x, i) { idx[x.tn] = i; });
    L.sort(function (a, b) { return endOf(b).localeCompare(endOf(a)) || (idx[a.tn] - idx[b.tn]); });   // جدیدترین دوره؛ در هم‌دوره‌ها آخرین انتشار (اصلاحیه)
    return L.map(function (x) { x.end = endOf(x); return x; });
  }
  function cdlReadFin(letter, cb) {
    if (!window.CodalFin) { CDL.finMsg = "ماژول خواندن اکسل بارگذاری نشده."; cb && cb(false); return; }
    CDL.finBusy = letter.tn; CDL.finMsg = "در حال دریافت و خواندن اکسل کدال…"; if (STATE.view === "cdl") renderCdl();
    cdlBin(letter.excel, function (buf, err) {
      function fail(msg) { CDL.finBusy = null; CDL.finMsg = msg; if (STATE.view === "cdl") renderCdl(); if (STATE.view === "fin") renderFinBody(); cb && cb(false); }
      if (!buf) { fail("دریافت اکسل ناموفق بود (" + err + ")."); return; }
      window.CodalFin.read(buf, window.CodalFin.infoFromTitle(letter.title)).then(function (r) {
        if (!r.tables.length) { fail("از اکسل جدولی نخواندم. " + r.notes.slice(0, 4).join(" | ") + " — فایل نمونه را برایم بفرست."); return; }
        handleFin({ tables: r.tables }, 0);
        if (STATE.fin) { STATE.fin.cdlTn = letter.tn; persistFin(); }
        CDL.finBusy = null; CDL.finMsg = "✔ از کدال خوانده شد: " + r.tables.map(function (t) { return KIND_LABEL[t.kind] + " (" + t.rows.length + " ردیف)"; }).join("، ") + " — دوره‌ی " + (letter.end || "");
        if (STATE.view === "cdl") renderCdl(); if (STATE.view === "fin") renderFinBody();
        cb && cb(true);
      }, function (e) { fail("خواندن فایل اکسل ناموفق بود: " + (e && e.message || e)); });
    });
  }
  function cdlAutoFin() {
    var f = STATE.fin; if (!f || !symLoaded) return;
    var L = cdlFinLetters(); if (!L.length) return;
    var top = L[0], S = f.slots || {};
    var have = ["bs", "is"].map(function (k) { var t = S[k]; return t ? (t.end || "") : ""; });
    var haveEnd = have.slice().sort().pop() || "";
    var need = !S.is || !S.bs || (top.end && top.end > haveEnd) || (top.end === haveEnd && f.cdlTn !== top.tn && ((S.is && S.is.src !== "codal") || (S.bs && S.bs.src !== "codal")));
    if (!need || CDL.tried[top.tn] || CDL.finBusy) return;
    CDL.tried[top.tn] = true;
    cdlReadFin(top);
  }
  function cdlGet(url) {
    return new Promise(function (res) {
      try { chrome.runtime.sendMessage({ t: "codal", url: url }, function (r) { res(r || { ok: false, err: (chrome.runtime.lastError && chrome.runtime.lastError.message) || "no response" }); }); }
      catch (e) { res({ ok: false, err: String(e) }); }
    });
  }
  function cdlEnsure(force, cb) {
    var sym = cdlSym();
    if (!sym) { CDL.err = "نام نماد هنوز خوانده نشده؛ یک بار «خواندن از سایت» را بزن."; cb && cb(); return; }
    function go() {
      var stale = !CDL.at || Date.now() - CDL.at > 6 * 3600 * 1000;
      if (!force && !stale) { cb && cb(); return; }
      if (CDL.loading) return;
      CDL.loading = true; CDL.err = ""; if (STATE.view === "cdl") renderCdl();
      Promise.all([1, 2, 3].map(function (pg) { return cdlGet(cdlUrl(sym, pg)); })).then(function (rs) {
        var seen = {}, list = [], okAny = false, lastErr = "";
        rs.forEach(function (r) {
          if (!r.ok) { lastErr = r.err || ("HTTP " + r.status + " " + (r.snippet || "")); return; }
          okAny = true;
          var L = (r.json && (r.json.Letters || r.json.letters)) || [];
          L.forEach(function (x) {
            var tn = x.TracingNo || x.tracingNo || x.SuperVision && x.SuperVision.TracingNo || (x.Url || x.url || "") + (x.Title || "");
            if (seen[tn]) return; seen[tn] = 1;
            list.push({ tn: tn, title: x.Title || x.title || "", date: x.PublishDateTime || x.SentDateTime || x.publishDateTime || "", comp: x.CompanyName || x.companyName || "", sym: x.Symbol || x.symbol || "", url: cdlAbs(x.Url || x.url), excel: cdlAbs(x.ExcelUrl || x.excelUrl || cdlFindUrl(x, /excel|xls/i)), pdf: cdlAbs(x.PdfUrl || x.pdfUrl), att: cdlAbs(x.AttachmentUrl || x.attachmentUrl), code: x.LetterCode || x.letterCode || "" });
          });
        });
        CDL.loading = false;
        if (!okAny) CDL.err = "اتصال به کدال ناموفق بود (" + lastErr + "). یک‌بار افزونه را ریلود کن تا مجوز دسترسی به کدال را بگیرد.";
        else { CDL.list = list; CDL.at = Date.now(); CDL.sym = sym; store.set("cdl:" + sym, { at: CDL.at, list: list.slice(0, 80) }); if (!list.length) CDL.err = "برای «" + sym + "» اطلاعیه‌ای پیدا نشد؛ ممکن است نام نماد در کدال متفاوت باشد."; }
        cb && cb(); if (STATE.view === "cdl") renderCdl();
      });
    }
    if (CDL.sym !== sym) { CDL.sym = sym; CDL.list = []; CDL.at = 0; store.get("cdl:" + sym, function (d) { if (d && d.list) { CDL.list = d.list; CDL.at = d.at || 0; } go(); }); }
    else go();
  }

  // ================= مجمع بعدی (از روی اطلاعیه‌های کدال) =================
  function jAdd(j, n) {
    var g = window.OCCollect.j2g(j.y, j.m, j.d), t = new Date(Date.UTC(g[0], g[1] - 1, g[2]) + n * 86400000);
    var r = g2j(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
    return { y: r[0], m: r[1], d: r[2] };
  }
  function jStr(j) { return fa(j.y + "/" + pad2(j.m) + "/" + pad2(j.d)); }
  function jDaysTo(j) { return window.OCCollect.daysUntil(j.y, j.m, j.d); }
  // نتیجه: { date, daysTo, kind: "announced" | "estimated", basis, from, to }  یا null
  function cdlNextAgm() {
    var items = (CDL.list || []).map(function (x) {
      var t = String(x.title || "").replace(/[\u200c]/g, " ");
      return { t: t, d: dateOf(toLat(x.date)), x: x };
    }).filter(function (o) { return o.d && /مجمع/.test(o.t); });
    if (!items.length) return null;
    var key = function (d) { return d.y * 10000 + d.m * 100 + d.d; };
    var ago = function (o) { return -jDaysTo(o.d); };
    var inv = items.filter(function (o) { return /دعوت/.test(o.t); });
    var dec = items.filter(function (o) { return /تصمیمات|نتیجه\s*مجمع|برگزار/.test(o.t); });
    // ۱) آگهی دعوتِ اخیر که هنوز خلاصه تصمیمات بعدش نیامده
    var recent = inv.filter(function (o) { return ago(o) >= 0 && ago(o) <= 45; }).sort(function (a, b) { return key(b.d) - key(a.d); })[0];
    if (recent && !dec.some(function (o) { return key(o.d) >= key(recent.d); })) {
      var m = toLat(recent.t).match(/(?:مورخ|تاریخ|روز)[^\d]{0,12}(\d{4}\/\d{1,2}\/\d{1,2})/), md = m ? dateOf(m[1]) : null, kind = "announced", basis, date, from, to;
      if (md && key(md) >= key(recent.d)) { date = md; from = md; to = md; basis = "تاریخ مجمع در عنوان آگهی دعوت (" + jStr(recent.d) + ") آمده است."; }
      else { date = jAdd(recent.d, 15); from = jAdd(recent.d, 10); to = jAdd(recent.d, 40); basis = "آگهی دعوت در " + jStr(recent.d) + " منتشر شده؛ طبق قانون مجمع ۱۰ تا ۴۰ روز بعد از آگهی برگزار می‌شود (تخمین مرکزی ۱۵ روز بعد)."; }
      return { date: date, daysTo: jDaysTo(date), kind: kind, basis: basis, from: from, to: to };
    }
    // ۲) تخمین از روی مجمع سالیانه‌ی سال‌های قبل: همان روز و ماه در سال بعد
    var past = items.filter(function (o) { return /عادی|سالیانه|سالانه/.test(o.t) && !/فوق\s*العاده/.test(o.t) && (/تصمیمات|برگزار|نتیجه/.test(o.t) ? true : /دعوت/.test(o.t)); })
      .map(function (o) { var isDec = /تصمیمات|برگزار|نتیجه/.test(o.t); return { d: isDec ? o.d : jAdd(o.d, 15), t: o.t }; })
      .filter(function (o) { return ago({ d: o.d }) > 60; })
      .sort(function (a, b) { return key(b.d) - key(a.d); });
    if (past.length) {
      var p = past[0], nx = { y: p.d.y + 1, m: p.d.m, d: p.d.d };
      while (jDaysTo(nx) < -5) nx = { y: nx.y + 1, m: nx.m, d: nx.d };
      return { date: nx, daysTo: jDaysTo(nx), kind: "estimated", basis: "تخمین از روی مجمع قبلی (حدود " + jStr(p.d) + ")؛ مجمع سالیانه هر سال تقریباً در همان روزهاست.", from: jAdd(nx, -20), to: jAdd(nx, 20) };
    }
    return null;
  }
  function agmCardHtml() {
    var a = cdlNextAgm();
    if (!a) return '<div class="msg w">مجمع بعدی را از اطلاعیه‌های کدال نتوانستم پیدا کنم (اطلاعیه‌ی مجمع کافی نیست).</div>';
    var st = OC.effective(STATE.st), cal = Math.round(st.hold * 7 / 5), inside = a.daysTo <= cal && a.daysTo >= -3;
    return '<div class="msg ' + (inside ? "w" : "ok") + '"><b>🗓 مجمع بعدی ' + (a.kind === "announced" ? "(اعلام‌شده)" : "(تخمینی)") + ': ' + esc(jStr(a.date)) + '</b> — ' + (a.daysTo >= 0 ? fa(a.daysTo) + " روز دیگر" : fa(-a.daysTo) + " روز پیش") + (a.kind === "estimated" || a.from !== a.to ? ' (بازه‌ی محتمل ' + esc(jStr(a.from)) + ' تا ' + esc(jStr(a.to)) + ')' : '') +
      '<div style="font-weight:400;font-size:11.5px;margin-top:3px">' + esc(a.basis) + ' ' + (inside ? "در افق نگهداری تو (حدود " + fa(cal) + " روز تقویمی) می‌افتد؛ اثر تقسیم سود و حذف حق تقدم روی قیمت را در نظر بگیر." : "خارج از افق نگهداری تو (حدود " + fa(cal) + " روز تقویمی) است.") + '</div></div>';
  }
  // تیک خودکار «رویداد مهم تا افق نگهداری» (اگر خودت دستی انتخاب نکرده باشی)
  function autoEvent() {
    if (!symLoaded) return;
    var a = cdlNextAgm(); if (!a) return;
    var st = OC.effective(STATE.st), cal = Math.round(st.hold * 7 / 5), v = (a.daysTo <= cal && a.daysTo >= -3) ? "بله" : "خیر";
    if (!STATE.inp.q_event_man) STATE.inp.q_event = v;
    STATE.inp.q_event_auto = "کدال: مجمع بعدی " + (a.kind === "announced" ? "(اعلام‌شده) " : "(تخمینی) ") + jStr(a.date) + " — " + (v === "بله" ? "داخل" : "خارج از") + " افق نگهداری" + (STATE.inp.q_event_man ? " (تو دستی «" + STATE.inp.q_event + "» انتخاب کرده‌ای)" : " ← خودکار تیک خورد");
    persist(); if (!STATE.collapsed && STATE.view !== "cmp") { hydrateInputs(); update(); }
  }

  function enterCdl() {
    STATE.view = "cdl"; STATE.showSettings = false; renderAll();
    cdlEnsure(false, function () { if (STATE.view === "cdl") renderCdl(); autoEvent(); });
  }
  function cdlLatestFinEnd() {
    var best = "";
    (CDL.list || []).forEach(function (x) {
      if (cdlCls(x.title) !== "fin") return;
      var d = dateOf(toLat(x.title)); if (!d) return;
      var e = d.y + "/" + pad2(d.m) + "/" + pad2(d.d); if (e > best) best = e;
    });
    return best;
  }
  function cdlBanner(f) {
    if (!CDL.list || !CDL.list.length) return "";
    var ce = cdlLatestFinEnd(); if (!ce) return "";
    var have = ["bs", "is", "cf"].map(function (k) { var t = (f.slots || {})[k]; var d = t && (dateOf(t.end) || dateOf(t.cols && t.cols[0])); return d ? d.y + "/" + pad2(d.m) + "/" + pad2(d.d) : ""; }).sort().pop() || "";
    if (have && ce <= have) return "";
    var it = CDL.list.filter(function (x) { return cdlCls(x.title) === "fin"; })[0];
    return '<div class="msg w">📢 کدال: صورت مالی دوره‌ی منتهی به <b>' + esc(ce) + '</b> منتشر شده' + (have ? '؛ داده‌ی ذخیره‌شده‌ی تو تا ' + esc(have) + ' است' : '') + '. تب ترازنامه و سود و زیان را روی TSETMC باز کن تا به‌روز شود.' + (it && it.url ? ' <a href="' + esc(it.url) + '" target="_blank" rel="noopener" style="color:inherit">مشاهده در کدال</a>' : '') + '</div>';
  }
  function renderCdl() {
    var el = root.getElementById("cdlbody"); if (!el) return;
    var sym = cdlSym();
    var h = '<div class="note">اطلاعیه‌ها و افشای اطلاعات ' + (sym ? "<b>" + esc(sym) + "</b>" : "نماد") + ' از سامانه‌ی کدال' + (CDL.at ? ' — آخرین دریافت: ' + esc(new Date(CDL.at).toLocaleString("fa-IR")) : '') + '</div>';
    h += '<div class="fset"><button class="usep" id="cdlref">' + (CDL.loading ? "در حال دریافت…" : "🔄 دریافت از کدال") + '</button></div>';
    if (CDL.err) h += '<div class="msg w">' + esc(CDL.err) + '</div>';
    if (CDL.list && CDL.list.length) h += agmCardHtml();
    if (CDL.finMsg) h += '<div class="msg ' + (/^✔/.test(CDL.finMsg) ? "ok" : "w") + '">' + esc(CDL.finMsg) + '</div>';
    var cnt = {}; (CDL.list || []).forEach(function (x) { var c = cdlCls(x.title); cnt[c] = (cnt[c] || 0) + 1; });
    h += '<div class="tabs" style="margin:6px 0"><button data-cf="all" class="' + (CDL.f === "all" ? "on" : "") + '">همه (' + fa((CDL.list || []).length) + ')</button>' +
      CDL_CLS.filter(function (c) { return cnt[c[0]]; }).map(function (c) { return '<button data-cf="' + c[0] + '" class="' + (CDL.f === c[0] ? "on" : "") + '">' + esc(c[1]) + ' (' + fa(cnt[c[0]]) + ')</button>'; }).join("") +
      (cnt.other ? '<button data-cf="other" class="' + (CDL.f === "other" ? "on" : "") + '">سایر (' + fa(cnt.other) + ')</button>' : '') + '</div>';
    var L = (CDL.list || []).filter(function (x) { return CDL.f === "all" || cdlCls(x.title) === CDL.f; }).slice(0, 60);
    if (!L.length && !CDL.loading) h += '<div class="empty">' + (CDL.list && CDL.list.length ? "موردی در این دسته نیست." : "هنوز چیزی دریافت نشده.") + '</div>';
    L.forEach(function (x) {
      h += '<div class="sg" style="margin:4px 0"><div class="line"><span><b>' + esc(x.title) + '</b></span><span style="font-weight:400;color:var(--mut);white-space:nowrap">' + esc(toLat(x.date).slice(0, 16)) + '</span></div><div style="font-size:12px;margin-top:2px">' +
        [x.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">مشاهده در کدال</a>' : "", x.excel ? '<a href="' + esc(x.excel) + '" target="_blank" rel="noopener">اکسل</a>' : "", x.pdf ? '<a href="' + esc(x.pdf) + '" target="_blank" rel="noopener">PDF</a>' : "", x.att ? '<a href="' + esc(x.att) + '" target="_blank" rel="noopener">پیوست</a>' : ""].filter(Boolean).join(" · ") +
        (x.excel && cdlCls(x.title) === "fin" && !/توضیحات/.test(x.title) ? ' <button class="usep" data-rf="' + esc(x.tn) + '"' + (CDL.finBusy ? " disabled" : "") + '>📊 خواندن اعداد این صورت مالی</button>' : "") + '</div></div>';
    });
    h += '<div class="legend">فقط فهرست اطلاعیه‌ها خوانده می‌شود؛ عددهای صورت مالی همچنان از جدول‌های TSETMC (تب مالی) گرفته می‌شود. اگر صورت مالی جدیدتری در کدال باشد، در تب مالی هشدار می‌دهد.</div>';
    el.innerHTML = h;
    var rf = el.querySelector("#cdlref"); if (rf) rf.onclick = function () { cdlEnsure(true); };
    el.querySelectorAll("[data-cf]").forEach(function (b) { b.onclick = function () { CDL.f = b.dataset.cf; renderCdl(); }; });
    el.querySelectorAll("[data-rf]").forEach(function (b) { b.onclick = function () { var it = (CDL.list || []).filter(function (x) { return String(x.tn) === b.dataset.rf; })[0]; if (it) { it.end = (cdlFinLetters().filter(function (y) { return y.tn === it.tn; })[0] || {}).end; cdlReadFin(it); } }; });
  }

  // ================= تب تحلیل مالی =================
  function enterFin() {
    STATE.view = "fin"; STATE.showSettings = false; renderAll();
    cdlEnsure(false, function () { if (STATE.view === "fin") { var fb = root.getElementById("finbody"); if (fb) renderFinBody(); } cdlAutoFin(); });
  }
  function persistFin() { if (!symLoaded) return; store.set("fin:" + pageKey, STATE.fin); }
  function normLabel(x) { return String(x).replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[\u200c\u200e\u200f\s()\-–:،,.«»]/g, ""); }
  var FIN_PAT = {
    rev: [/^(جمع)?درآمدهایعملیاتی$/, /^درآمدعملیاتی$/, /^فروشخالص$/, /^درآمدحاصلازفروش/],
    cogs: [/^بهایتمامشده(درآمدهایعملیاتی|درآمدعملیاتی|کالایفروشرفته|فروش)/, /^بهایتمامشدهدرآمد/],
    opinc: [/^سودزیانعملیاتی$/],
    int: [/^هزینه(های)?مالی$/],
    ni: [/^سودزیانخالص$/, /^سودخالص$/],
    ta: [/^جمعداراییها$/, /^جمعکلداراییها$/, /^جمعدارایی$/],
    ca: [/^جمعداراییهایجاری$/],
    cl: [/^جمعبدهیهایجاری$/],
    tl: [/^جمعبدهیها$/, /^جمعکلبدهیها$/],
    eq: [/^جمعحقوق(مالکانه|صاحبانسهام)$/, /^حقوق(مالکانه|صاحبانسهام)$/, /^جمعحقوقمالکانه(متعلقبهمالکان.*)?$/],
    re: [/^سودزیانانباشته$/, /^سودانباشته$/],
    cfo: [/^جریانخالص(ورودخروج)?وجهنقدحاصلازفعالیتهایعملیاتی$/, /وجهنقدحاصلازفعالیتهایعملیاتی$/, /^جریانخالص(ورودخروج)?نقدحاصلازفعالیتهایعملیاتی$/],
    rec: [/^دریافتنیهایتجاریوسایردریافتنیها$/, /^حسابهاواسناددریافتنی/],
    cap: [/^سرمایه$/],
    dps: [/^سودنقدیهرسهم/],
  };
  function parseCell(v) {
    if (typeof v === "number") return v;
    if (v === null || v === undefined) return null;
    var t = String(v).trim().replace(/[۰-۹]/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹".indexOf(d); }).replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); }).replace(/٬/g, ",");
    if (!/^[\(\-]?\s*[\d,]+(\.\d+)?\s*\)?$/.test(t)) return null;
    var neg = /^\(/.test(t) || /^-/.test(t);
    var n = Number(t.replace(/[^\d.]/g, ""));
    return isFinite(n) ? (neg ? -n : n) : null;
  }
  function extractFin(rows) {
    var out = { y0: {}, y1: {} }, found = [];
    rows.forEach(function (row) {
      var li = -1;
      for (var i = 0; i < row.length; i++) { if (typeof row[i] === "string" && normLabel(row[i]).length > 2) { li = i; break; } }
      if (li < 0) return;
      var lab = normLabel(row[li]);
      Object.keys(FIN_PAT).forEach(function (k) {
        if (out.y0[k] !== undefined) return;
        if (!FIN_PAT[k].some(function (re) { return re.test(lab); })) return;
        var nums = [];
        for (var j = li + 1; j < row.length; j++) { var n = parseCell(row[j]); if (n !== null) nums.push(n); }
        if (nums.length >= 3 && Math.abs(nums[0]) <= 60 && Number.isInteger(nums[0])) nums.shift();   // ستون شماره یادداشت
        if (!nums.length) return;
        var ab = (k === "cogs" || k === "int");
        out.y0[k] = ab ? Math.abs(nums[0]) : nums[0]; if (nums.length > 1) out.y1[k] = ab ? Math.abs(nums[1]) : nums[1];
        found.push(String(row[li]).trim());
      });
    });
    return { fin: out, found: found };
  }
  async function inflateRaw(raw) {
    var ds = new DecompressionStream("deflate-raw");
    return new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer());
  }
  async function readXlsx(buf) {
    var u8 = new Uint8Array(buf), dv = new DataView(buf), e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error("فایل xlsx معتبر نیست (اگر .xls است، در اکسل با Save As به xlsx تبدیل کن)");
    var cnt = dv.getUint16(e + 10, true), p = dv.getUint32(e + 16, true), files = {};
    for (var i = 0; i < cnt; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
      var name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen)); p += 46 + nlen + elen + clen;
      if (!/^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(name)) continue;
      var ds = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true), raw = u8.subarray(ds, ds + csize);
      files[name] = new TextDecoder().decode(method === 0 ? raw : await inflateRaw(raw));
    }
    var shared = [];
    if (files["xl/sharedStrings.xml"]) {
      var sd = new DOMParser().parseFromString(files["xl/sharedStrings.xml"], "application/xml");
      sd.querySelectorAll("si").forEach(function (si) { var t = ""; si.querySelectorAll("t").forEach(function (x) { t += x.textContent; }); shared.push(t); });
    }
    var rows = [];
    Object.keys(files).filter(function (n) { return /worksheets/.test(n); }).sort().forEach(function (n) {
      var d = new DOMParser().parseFromString(files[n], "application/xml");
      d.querySelectorAll("row").forEach(function (r) {
        var arr = [];
        r.querySelectorAll("c").forEach(function (c) {
          var ref = c.getAttribute("r") || "", m = ref.match(/^([A-Z]+)/), col = 0;
          if (m) for (var k = 0; k < m[1].length; k++) col = col * 26 + (m[1].charCodeAt(k) - 64);
          col = Math.max(0, col - 1);
          var t = c.getAttribute("t"), v = c.querySelector("v"), val = null;
          if (t === "s" && v) val = shared[Number(v.textContent)];
          else if (t === "inlineStr") val = c.textContent;
          else if (v) { val = t === "str" ? v.textContent : Number(v.textContent); }
          arr[col] = val;
        });
        rows.push(arr);
      });
    });
    return rows;
  }
  function readCsv(text) {
    return text.split(/\r?\n/).map(function (l) { return l.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(function (x) { return x.replace(/^"|"$/g, ""); }); });
  }
  function renderFinBody() {
    var el = root.getElementById("finbody");
    if (!el) return;
    var f = STATE.fin;
    autoApplyFin(f); persistFin();
    var h = cdlBanner(f) + sourceHtml(f) + '<div class="rep" id="finrep" style="display:block"></div><div id="finres"></div>' + trendHtml(f) + scrapedHtml(f) +
      '<details class="sg" data-dk="manual"' + (OPEN_D.manual ? ' open' : '') + '><summary><b>✏️ ویرایش دستی / ورود از اکسل (اختیاری)</b></summary>' +
      '<div class="fset"><button class="btn pri" id="finpick">📂 وارد کردن از فایل اکسل (xlsx) / CSV</button><input type="file" id="finfile" accept=".xlsx,.csv,.tsv,.txt" style="display:none">' +
      '<div class="f1"><label>واحد اعداد</label><select id="finunit"><option value="1">ریال</option><option value="1000000">میلیون ریال</option><option value="1000000000">میلیارد ریال</option></select></div>' +
      '<div class="f1"><label>تورم سالانه (برای رشد واقعی)</label><input id="fininfl" inputmode="decimal" value="' + +(f.infl * 100).toFixed(1) + '"></div>' +
      '<button class="btn" id="finclear">پاک کردن</button></div>' +
      '<div class="fgrid"><span></span><span class="h">سال مالی جاری</span><span class="h">سال قبل</span>';
    OC.FIN_KEYS.forEach(function (k) {
      h += '<label>' + esc(k[1]) + '</label>';
      ["y0", "y1"].forEach(function (y) { h += '<input data-fy="' + y + '" data-fk="' + k[0] + '" inputmode="decimal" value="' + (f[y][k[0]] !== undefined && f[y][k[0]] !== null ? f[y][k[0]] : "") + '">'; });
    });
    h += '</div></details>';
    el.innerHTML = h;
    bindScraped(el, f);
    el.querySelectorAll("details[data-dk]").forEach(function (d) { var sm = d.querySelector("summary"); if (sm) sm.addEventListener("click", function () { OPEN_D[d.dataset.dk] = !d.open; }); });
    var un = root.getElementById("finunit"); un.value = String(f.unit);
    un.onchange = function () { f.unit = Number(un.value); persistFin(); renderFinResult(); };
    root.getElementById("fininfl").oninput = function () { var n = parseNum(this.value); if (n !== null) { f.infl = n / 100; persistFin(); renderFinResult(); } };
    el.querySelectorAll("[data-fk]").forEach(function (inp) {
      inp.oninput = function () { var n = parseNum(inp.value); f.manual = f.manual || {}; f.manual[inp.dataset.fk] = true; if (String(inp.value).trim() === "") delete f[inp.dataset.fy][inp.dataset.fk]; else if (n !== null) f[inp.dataset.fy][inp.dataset.fk] = n; persistFin(); renderFinResult(); };
    });
    root.getElementById("finclear").onclick = function () { if (confirm("همه اعداد مالی این سهم پاک شود؟")) { STATE.fin = { unit: f.unit, infl: f.infl, y0: {}, y1: {}, manual: {}, tables: f.tables || {} }; persistFin(); renderFinBody(); } };
    var fileEl = root.getElementById("finfile");
    root.getElementById("finpick").onclick = function () { fileEl.click(); };
    fileEl.onchange = async function () {
      var file = fileEl.files[0], rep = root.getElementById("finrep");
      if (!file) return;
      try {
        var rows;
        if (/\.xlsx$/i.test(file.name)) rows = await readXlsx(await file.arrayBuffer());
        else if (/\.xls$/i.test(file.name)) throw new Error("فرمت قدیمی xls پشتیبانی نمی‌شود؛ در اکسل با Save As به xlsx تبدیل کن");
        else rows = readCsv(await file.text());
        var r = extractFin(rows), n = Object.keys(r.fin.y0).length;
        if (!n) { rep.innerHTML = '<div class="x">✖ هیچ ردیف شناخته‌شده‌ای پیدا نشد (برچسب‌های صورت‌های مالی فارسی لازم است). اعداد را دستی وارد کن.</div>'; return; }
        f.manual = f.manual || {}; Object.keys(r.fin.y0).forEach(function (k) { f.y0[k] = r.fin.y0[k]; f.manual[k] = true; });
        Object.keys(r.fin.y1).forEach(function (k) { f.y1[k] = r.fin.y1[k]; });
        persistFin(); renderFinBody();
        root.getElementById("finrep").innerHTML = '<div class="o">✔ ' + fa(n) + ' از ' + fa(OC.FIN_KEYS.length) + ' ردیف از فایل خوانده شد: ' + esc(r.found.slice(0, 12).join("، ")) + '</div><div class="t">ستون اول عدد = سال جاری و ستون دوم = سال قبل فرض شده؛ اعداد را با فایل مقایسه کن و اشتباهات را اصلاح کن.</div>';
      } catch (e) { rep.innerHTML = '<div class="x">✖ ' + esc(String(e.message || e)) + '</div>'; }
      fileEl.value = "";
    };
    renderFinResult();
  }
  function renderFinResult() {
    var el = root.getElementById("finres");
    if (!el) return;
    var siteEps = num0(STATE.inp.eps_site), sitePe = num0(STATE.inp.pe);
    if ((siteEps === null || siteEps === undefined) && STATE.fin.epsTbl !== undefined) siteEps = STATE.fin.epsTbl;
    var r = OC.finAnalyze(STATE.fin, num0(STATE.inp.S), STATE.inp.pe_sec, { eps: siteEps, pe: sitePe });
    if (r.score === null && !r.ratios.some(function (x) { return x.v0 !== null; })) { el.innerHTML = '<div class="empty">منتظر صورت مالی از کدال هستم؛ چند ثانیه صبر کن یا تب «کدال» را باز کن.</div>'; return; }
    var cls = r.score >= 70 ? "ok" : r.score >= 50 ? "w" : "h";
    var h = '<div class="sg"><h5>نتیجه تحلیل بنیادی</h5><div class="pbig"><span class="pv">' + (r.score === null ? "—" : fa(r.score) + " از ۱۰۰") + '</span><span class="msg ' + cls + '" style="margin:0"><b>' + esc(r.verdict) + '</b></span></div>';
    if (r.notes.good.length) h += r.notes.good.map(function (t) { return '<div class="msg ok">✔ ' + esc(t) + '</div>'; }).join("");
    if (r.notes.bad.length) h += r.notes.bad.map(function (t) { return '<div class="msg h">✖ ' + esc(t) + '</div>'; }).join("");
    h += '<button class="usep" id="finapply">اعمال روی چک‌لیست (پر کردن «بنیادی مشکل جدی ندارد» و P/E)</button></div>';
    h += '<div class="cmp sgt"><table><thead><tr><th class="lab">نسبت</th><th>سال جاری</th><th>سال قبل</th><th>روند</th></tr></thead><tbody>';
    r.ratios.forEach(function (x) {
      var tr = "";
      if (x.v0 !== null && x.v1 !== null && x.v1 !== undefined) { var d = x.v0 - x.v1; tr = Math.abs(d) < 1e-9 ? "—" : (d > 0) === (x.better > 0) ? "▲ بهتر" : "▼ بدتر"; }
      h += '<tr><td class="lab">' + esc(x.label) + '</td><td class="v">' + esc(fmt(x.v0, x.fmt)) + '</td><td class="v">' + esc(fmt(x.v1, x.fmt)) + '</td><td class="' + (tr[0] === "▲" ? "v best" : tr[0] === "▼" ? "v worst" : "v") + '">' + tr + '</td></tr>';
    });
    h += '</tbody></table></div>';
    var v = r.val;
    if (v.mcap || v.pe || v.eps) {
      h += '<div class="sg"><h5>ارزش‌گذاری (با قیمت فعلی ' + esc(fmt(num0(STATE.inp.S), "money")) + ')</h5>' +
        [["ارزش بازار (ریال)", v.mcap, "money"], ["EPS (از سایت، ریال)", v.eps, "money"], ["P/E (از سایت)", v.pe, "ratio1"], ["P/B", v.pb, "ratio2"], ["P/S", v.ps, "ratio2"], ["بازده سود (۱/PE)", v.ey, "pct1"], ["بازده سود نقدی", v.dy, "pct1"], ["نسبت تقسیم سود", v.payout, "pct0"]]
          .map(function (x) { return '<div class="line"><span>' + x[0] + '</span><span class="vv">' + esc(fmt(x[1], x[2])) + '</span></div>'; }).join("") + '</div>';
    } else h += '<div class="legend" style="margin:0 12px 8px">برای P/E و P/B «سرمایه ثبت‌شده» و قیمت فعلی لازم است (ارزش اسمی هر سهم ۱۰۰۰ ریال فرض شده).</div>';
    h += '<div class="sg"><h5>امتیاز فیوتروسکی' + (r.fscore ? ' — ' + fa(r.fscore.n) + ' از ' + fa(r.fscore.of) : '') + '</h5>' + r.piotroski.map(function (x) { return '<div class="pio"><span>' + (x.ok === null ? "◻" : x.ok ? "✅" : "❌") + '</span><span' + (x.ok === null ? ' style="color:var(--mut)"' : '') + '>' + esc(x.label) + '</span></div>'; }).join("") + '</div>';
    if (r.z) h += '<div class="sg"><h5>آلتمن Z″ (بازارهای نوظهور)</h5><div class="line"><span>امتیاز</span><span class="vv">' + r.z.v.toFixed(2) + '</span></div><div class="msg ' + (r.z.zone === "ایمن" ? "ok" : r.z.zone === "خاکستری" ? "w" : "h") + '">' + esc(r.z.zone) + ' (بالای ۵٫۸۵ ایمن، ۴٫۳۵ تا ۵٫۸۵ خاکستری، زیر آن خطر)</div></div>';
    if (r.dupont) h += '<div class="sg"><h5>تجزیه دوپونت</h5><div class="line"><span>ROE = حاشیه سود خالص × گردش دارایی × اهرم</span><span class="vv">' + fa((r.dupont.nm * 100).toFixed(1)) + '٪ × ' + r.dupont.at.toFixed(2) + ' × ' + r.dupont.em.toFixed(2) + ' = ' + fa((r.dupont.roe * 100).toFixed(1)) + '٪</span></div></div>';
    h += '<div class="legend" style="margin:0 12px 8px">این تحلیل حساب مکانیکی بر پایه اعدادی است که وارد کرده‌ای؛ کیفیت اعداد، یادداشت‌های توضیحی، اظهارنظر حسابرس و رویدادهای یک‌باره را باید خودت بخوانی. در اقتصاد تورمی، ارزش دفتری و سود حسابداری معمولاً کم‌برآورد هستند.</div>';
    el.innerHTML = h;
    var ap = root.getElementById("finapply");
    if (ap) ap.onclick = function () {
      if (r.score !== null) STATE.inp.q_fund = r.score >= 55 ? "بله" : "خیر";
      if (r.val.pe) STATE.inp.pe = +r.val.pe.toFixed(2);
      persist(); ap.textContent = "✔ اعمال شد (" + (STATE.inp.q_fund === "بله" ? "بنیاد قابل قبول" : "بنیاد ضعیف") + ")";
    };
  }

  function enterCmp() {
    store.get("compare", function (arr) {
      STATE.cmp = Array.isArray(arr) ? arr : [];
      STATE.view = "cmp"; STATE.showSettings = false;
      renderAll();
    });
  }
  function renderCmpPage() {
    var html = '<div class="panel wide" id="panel"><div class="hd" id="drag"><b>⚖ مقایسه سهم‌ها</b>' +
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
    if (rs) rs.textContent = "حداکثر ریسک هر معامله " + pctTxt(eff.riskpct) + " سرمایه · حداقل سود به ریسک " + eff.rrmin + " · حداقل امتیاز تکنیکال " + eff.minscore + " · حداکثر سهم در یک سهم " + pctTxt(eff.maxpos) + " · تا " + eff.maxwarn + " هشدار";
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

  // ================= ناوبری: نوار پایین (۵ بخش) + زیرتب‌ها =================
  var NAV = [
    { id: "find", ic: "🔍", lb: "یافتن", items: [["scr", "🔍 یافتن سهم"]] },
    { id: "an", ic: "📊", lb: "تحلیل", items: [["simple", "🎯 ساده"], ["chart", "📈 نمودار"], ["fin", "🏦 مالی"], ["cdl", "📢 کدال"]] },
    { id: "buy", ic: "🛒", lb: "خرید", items: [["main", "✅ چک‌لیست"], ["sug", "💡 پیشنهاد"], ["swt", "🌊 نوسان‌گیری"]] },
    { id: "hold", ic: "📤", lb: "نگهداری", items: [["hold", "📤 دارم؛ بفروشم؟"], ["pf", "📒 پورتفو"]] },
    { id: "opt", ic: "🧭", lb: "اختیار", items: [["adv", "🧭 اختیارها"]] },
  ];
  var NAV_OF = { scr: "find", simple: "an", chart: "an", fin: "an", cdl: "an", main: "buy", sug: "buy", swt: "buy", hold: "hold", pf: "hold", adv: "opt" };
  function ctxText() {
    if (isMktPage()) return "دیده‌بان بازار";
    var n = STATE.inp && STATE.inp.name_o, s = STATE.inp && STATE.inp.S;
    return n ? n + (s ? " · " + fa(fnum(s)) : "") : "نماد خوانده نشده";
  }
  function dockHtml() {
    if (isMktPage()) return "";
    var g = NAV_OF[STATE.view] || "buy", grp = NAV.filter(function (x) { return x.id === g; })[0] || NAV[2];
    var sub = grp.items.length > 1 ? '<div class="sub">' + grp.items.map(function (it) {
      return '<button data-t="' + it[0] + '" class="' + (STATE.view === it[0] ? "on" : "") + '">' + it[1] + '</button>';
    }).join("") + '</div>' : "";
    var nav = '<nav class="nav">' + NAV.map(function (x) {
      return '<button data-g="' + x.id + '" class="' + (x.id === g ? "on" : "") + '"><span class="ic">' + x.ic + '</span><span class="lb2">' + x.lb + '</span></button>';
    }).join("") + '</nav>';
    return '<div class="dock">' + sub + nav + '</div>';
  }
  function goTab(t) {
    if (t === "trend" || t === "pull" || t === "break") { STATE.type = t; if (STATE.view !== "sug") STATE.view = "main"; STATE.showSettings = false; persist(); renderAll(); return; }
    STATE.navLast = STATE.navLast || {}; STATE.navLast[NAV_OF[t] || "buy"] = t;
    if (t === "sug") { enterSug(); return; }
    if (t === "fin") { enterFin(); return; }
    if (t === "cdl") { enterCdl(); return; }
    STATE.view = t; STATE.showSettings = false; renderAll();
  }

  function renderAll() {
    if (STATE.collapsed) {
      mount.innerHTML = '<button class="mini" id="expand">' + (window.ComboLogo ? window.ComboLogo(18) : "📋") + ' دیده‌بان · سهام</button>';
      mount.querySelector("#expand").onclick = function () { STATE.collapsed = false; window.ComboLazy.activate(); renderAll(); if (LZ.kick) LZ.kick(); };
      return;
    }
    if (STATE.view === "cmp") { renderCmpPage(); return; }
    var titles = STEP_TITLES();
    var digits = "۰۱۲۳۴۵۶۷۸۹";
    var html = '<div class="panel' + ((STATE.view === "chart" || STATE.view === "fin" || STATE.view === "adv" || STATE.view === "cdl" || STATE.view === "hold" || STATE.view === "simple" || STATE.view === "scr" || STATE.view === "swt" || STATE.view === "pf") ? " wide" : "") + '" id="panel"><div class="hd" id="drag"><span class="lg">' + (window.ComboLogo ? window.ComboLogo(22) : "📋") + '</span><div class="ttl"><b>دیده‌بان بورس</b><span class="ctx" id="ctx">' + esc(ctxText()) + '</span></div>' +
      (isMktPage() ? "" : '<button id="fill" title="به‌روزرسانی داده‌های سهم از سایت">🔄</button>') +
      '<button id="cmpb" title="مقایسه سهم‌ها">⚖<span class="n" id="cmpn">' + cmpCount() + '</span></button>' +
      '<button id="gear" title="تنظیمات و پشتیبان‌گیری">⚙</button><button id="min" title="کوچک کردن">—</button></div>' +
      (STATE.view === "main" ? '<div class="verdict v-wait" id="verdict"></div>' : '') +
      ((STATE.view === "main" || STATE.view === "sug") && !STATE.showSettings ? '<div class="seg" title="الگوی ورود"><span class="lb">الگوی ورود</span>' + [["trend", "روندی"], ["pull", "اصلاح"], ["break", "شکست"]].map(function (m) {
        return '<button data-t="' + m[0] + '" class="' + (STATE.type === m[0] ? "on" : "") + '">' + m[1] + '</button>';
      }).join("") + '</div>' : '') +
      '<div class="bodywrap"><div class="body" id="body">' + ((STATE.view === "chart" || STATE.view === "fin" || STATE.view === "adv" || STATE.view === "cdl" || STATE.view === "hold" || STATE.view === "simple" || STATE.view === "scr" || STATE.view === "swt" || STATE.view === "pf") ? "" : riskHtml());
    if (STATE.view === "chart") {
      html += '<div id="chartbody"></div>';
    } else if (STATE.view === "cdl") {
      html += '<div id="cdlbody"></div>';
    } else if (STATE.view === "fin") {
      html += '<div id="finbody"></div>';
    } else if (STATE.view === "sug") {
      html += '<div id="sugbody"></div>';
    } else if (STATE.view === "hold") {
      html += '<div id="holdbody"></div>';
    } else if (STATE.view === "scr") {
      html += '<div id="scrbody"></div>';
    } else if (STATE.view === "swt") {
      html += '<div id="swtbody"></div>';
    } else if (STATE.view === "pf") {
      html += '<div id="pfbody"></div>';
    } else if (STATE.view === "simple") {
      html += '<div id="simplebody"></div>';
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
      html += '<div class="note" style="margin-top:8px">💾 پشتیبان‌گیری از همه‌ی اطلاعات ذخیره‌شده‌ی افزونه (نمادها، جدول‌های مالی، تنظیمات). اگر مرورگر پاک شد یا کامپیوتر عوض کردی، از همین فایل برمی‌گردانی.</div><div class="fset"><button class="btn" id="bkexp">خروجی گرفتن</button><button class="btn" id="bkimp">وارد کردن از فایل</button></div><input type="file" id="bkfile" accept=".json,application/json" style="display:none">';
      html += '<button class="all" id="resetset">بازگشت همه تنظیمات به پیش‌فرض</button></div>';
    } else {
      html += '<div class="note">اعداد بازار و سابقه ۲۵۰ روزه خودکار خوانده می‌شوند. اگر عددی نیامد، آن را روی صفحه انتخاب کن و ⌖ را بزن.</div><div class="rep" id="rep"></div>';
      STEPS.forEach(function (st_, i) {
        html += '<div class="step ' + (STATE.open[i] ? "open" : "") + '" data-n="' + i + '"><div class="sh"><span class="num">' + digits[i] + '</span><span class="tt">' +
          esc(titles[i].replace(/^مرحله [۰-۹]+ — /, "")) + '</span><span class="badge" id="badge' + i + '"></span></div><div class="sc"><div class="grid">';
        FIELDS.forEach(function (f) {
          if (f.step !== i) return;
          if (!fieldShown(f, STATE.type)) return;
          html += '<div class="fld' + (f.t === "yn" ? " full" : "") + '"><label>' + esc(fieldLabel(f, STATE.type)) + '</label>';
          if (f.t === "yn") {
            html += '<div class="yn" data-yn="' + f.k + '"><button data-v="بله">بله</button><button data-v="خیر">خیر</button></div>' + (f.k === "q_event" ? '<div class="legend" id="evnote" style="margin:3px 0 0"></div>' : "");
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
    html += '' + (STATE.view === "main" && !isMktPage() ? '<div class="acts"><button id="savecmp" class="pri">➕ ذخیره برای مقایسه</button><button id="reset">پاک کردن ورودی‌ها</button><button id="diag">گزارش اشکال</button></div>' : '') +
      '</div><button class="sbtn up" title="بالا" data-sc="-1">▲</button><button class="sbtn dn" title="پایین" data-sc="1">▼</button></div>' +
      dockHtml() + '</div>';
    mount.innerHTML = html;
    bind();
    hydrateInputs();
    updateRiskUi();
    update();
  }

  function hydrateInputs() {
    var en = root.getElementById("evnote"); if (en) en.textContent = STATE.inp.q_event_auto || "";
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
    root.querySelectorAll(".dock [data-t], .seg [data-t]").forEach(function (b) { b.onclick = function () { goTab(b.dataset.t); }; });
    root.querySelectorAll(".dock [data-g]").forEach(function (b) {
      b.onclick = function () {
        var g = b.dataset.g, grp = NAV.filter(function (x) { return x.id === g; })[0], last = STATE.navLast && STATE.navLast[g];
        var t = grp.items.some(function (it) { return it[0] === last; }) ? last : grp.items[0][0];
        goTab(t);
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
          if (k === "q_event") { STATE.inp.q_event_man = 1; if (!STATE.inp.q_event) { STATE.inp.q_event_man = 0; setTimeout(autoEvent, 0); } }
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
    var bke = q("#bkexp"), bki = q("#bkimp"), bkf = q("#bkfile");
    if (bke) bke.onclick = function () {
      allStored(function (all) {
        var blob = new Blob([JSON.stringify({ app: "bourse-combo", v: 1, at: Date.now(), data: all })], { type: "application/json" });
        var a = document.createElement("a"), d = new Date();
        a.href = URL.createObjectURL(blob); a.download = "bourse-backup-" + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + ".json";
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      });
    };
    if (bki && bkf) {
      bki.onclick = function () { bkf.click(); };
      bkf.onchange = function () {
        var file = bkf.files && bkf.files[0]; if (!file) return;
        var rd = new FileReader();
        rd.onload = function () {
          var j; try { j = JSON.parse(String(rd.result)); } catch (e) { alert("فایل معتبر نیست."); return; }
          if (!j || j.app !== "bourse-combo" || !j.data) { alert("این فایل پشتیبان این افزونه نیست."); return; }
          var n = Object.keys(j.data).length;
          if (!confirm(fa(n) + " مورد از فایل جایگزین اطلاعات هم‌نام فعلی می‌شود. ادامه بدهم؟")) return;
          restoreStored(j.data, function () { alert("بازیابی شد. صفحه دوباره بارگذاری می‌شود."); location.reload(); });
        };
        rd.readAsText(file);
      };
    }
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
      if (confirm("همه سهم‌های ذخیره‌شده برای مقایسه پاک شود؟")) { store.set("compare", []); STATE.cmp = []; renderCmpBody(); }
    };
    // جابه‌جایی پنل
    var drag = q("#drag");
    if (drag) drag.addEventListener("mousedown", function (e) {
      if (e.target.tagName === "BUTTON") return;
      var r = host.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      function mv(ev) { host.style.right = "auto"; host.style.left = Math.max(0, ev.clientX - dx) + "px"; host.style.top = Math.max(0, ev.clientY - dy) + "px"; }
      function up() { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); }
      document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
    });
  }

  // ---- به‌روزرسانی نتایج (بدون بازسازی ورودی‌ها)
  function update() {
    if (STATE.collapsed) return;
    var cx = root.getElementById("ctx"); if (cx) cx.textContent = ctxText();
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
    if (STATE.view === "hold") { if (!root.getElementById("holdform")) renderHoldBody(); else renderHoldResult(); return; }
    if (STATE.view === "scr") { if (!root.getElementById("scrform")) renderScrBody(); return; }
    if (STATE.view === "swt") { if (!root.getElementById("swtform")) renderSwtBody(); else renderSwtResult(); return; }
    if (STATE.view === "pf") { if (!root.getElementById("pfform")) renderPfBody(); return; }
    if (STATE.view === "simple") { if (!root.getElementById("simpleform")) renderSimpleBody(); else renderSimpleResult(); return; }
    if (STATE.view === "adv") { var ab = root.getElementById("advbody"); if (ab && !ab.firstChild) advUI.mount(ab); else advUI.refresh(); return; }
    if (STATE.view === "chart") { renderChartBody(); return; }
    if (STATE.view === "cdl") { renderCdl(); return; }
    if (STATE.view === "fin") { var fb = root.getElementById("finbody"); if (fb && !fb.firstChild) renderFinBody(); else renderFinResult(); return; }
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
        m += '<button class="usep" data-usep="' + sug + '">استفاده از احتمال مرجع (' + Math.round(sug * 100) + '٪) به‌عنوان احتمال من</button>';
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
      DIAG.push("insCode=" + code);
      if (!code) {
        if (!silent) showReport([{ ok: false, t: "این صفحه، صفحه نماد نیست. صفحه یک سهم را باز کن." }]);
        return;
      }
      if (OCC.isOptionText(pageText())) {
        if (!silent) showReport([{ ok: false, t: "این صفحه اختیار معامله است؛ برای آن از افزونه چک‌لیست اختیار استفاده کن." }]);
        return;
      }
      showReport([{ t: "در حال خواندن از سایت…" }]);
      var myKey = pageKey;
      var res = await OCC.collect(code, DIAG);
      if (myKey !== pageKey) return;   // در حین خواندن نماد عوض شد
      Object.keys(res.inp).forEach(function (k) { STATE.inp[k] = res.inp[k]; });
      if (res.an && (res.an.bars || res.an.power !== undefined)) STATE.an = res.an;
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


  // ================= مشاور ترکیبی: اختیارهای همین سهم =================
  function advCtx() {
    return {
      S: Number(STATE.inp.S) > 0 ? Number(STATE.inp.S) : null,
      an: STATE.an, stockInp: STATE.inp, stockSt: STATE.st, optSt: null, fin: finViewNow(),
      baseSym: STATE.inp.name_o || null, currentCode: null,
    };
  }
  var advUI = window.AdvisorUI.create(root, { getContext: advCtx, origin: location.origin, onApply: null });

  // ---- شروع: پنل فقط روی صفحه سهم نشان داده می‌شود (روی صفحه اختیار پنهان است)
  function isMktPage() { return /marketwatch/i.test(location.pathname + location.hash); }
  function isStockPage() { return isMktPage() || (!!OCC.insCodeFromUrl(location.href) && !OCC.isOptionText(pageText())); }
  store.get("compare", function (c) { STATE.cmp = Array.isArray(c) ? c : []; refreshCmpBadge(); });
  store.get("ui", function (u) { if (u && u.riskOpen !== undefined) STATE.riskOpen = !!u.riskOpen; });
  var LZ = { kick: null };
  mount.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest(".sbtn") : null; if (!b) return;
    var bd = root.getElementById("body"); if (bd) bd.scrollBy({ top: Number(b.dataset.sc) * Math.max(120, bd.clientHeight * 0.6), behavior: "smooth" });
  });
  store.get("settings", function (s) {
    STATE.st = s || {};
    loadSymbol(function (cached) {
      if (isMktPage()) STATE.view = "scr";
      renderAll();   // پیش‌فرض بسته: فقط دکمه‌ی کوچک؛ خواندن از سایت بعد از اولین باز کردن شروع می‌شود
      var visible = false, decided = false, checks = 0, stable = 0, ran = cached, lastHref = location.href;
      host.style.display = "none";
      var noted = false;
      LZ.kick = function () { if (!visible || STATE.collapsed) return; if (isMktPage()) { STATE.view = "scr"; if (!root.getElementById("scrform")) renderAll(); return; } if (!ran) { ran = true; runAuto(true).then(function () { cdlEnsure(false, autoEvent); }); } else if (!noted) { noted = true; cachedNote(); cdlEnsure(false, autoEvent); } };
      // تایمر سبک: متن صفحه فقط تا وقتی نوع صفحه معلوم نشده خوانده می‌شود (حداکثر ~۲۵ ثانیه)، بعد از آن هیچ کاری نمی‌کند
      setInterval(function () {
        if (location.href !== lastHref) {
          lastHref = location.href;
          var nk = keyNow();
          if (nk === pageKey) return;      // فقط hash/پارامتر فرعی عوض شده؛ همان نماد
          persist();
          pageKey = nk;
          visible = false; decided = false; checks = 0; stable = 0; ran = false; host.style.display = "none";
          loadSymbol(function (c2) { ran = c2; noted = false; STATE.view = isMktPage() ? "scr" : "main"; renderAll(); });
          return;
        }
        if (!symLoaded || decided) return;
        checks++;
        var should = isStockPage();
        stable = should ? stable + 1 : 0;
        if (should && stable >= 2) { visible = true; decided = true; host.style.display = ""; LZ.kick(); }
        else if (checks > 16) decided = true;
      }, 1500);
    });
  });
})();
