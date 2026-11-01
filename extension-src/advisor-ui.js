/* رابط تب «🧭 مشاور» (مشترک بین پنل سهم و پنل اختیار) */
(function (root) {
  "use strict";
  var AD = root.OptAdvisor, CH = root.OptChain, CS = root.ComboStore;

  var CSS =
    '.tabs{flex-wrap:wrap}.tabs button{flex:1 0 auto}' +
    '.bodywrap{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;padding-left:34px}' +
    '.bodywrap>.body{flex:1;min-height:0}' +
    '.sbtn{position:absolute;left:3px;z-index:5;width:28px;height:28px;border-radius:50%;border:1px solid var(--line);background:var(--bg);color:var(--acc);box-shadow:0 2px 8px rgba(24,28,60,.25);font-size:13px;display:grid;place-items:center;padding:0;opacity:.8;cursor:pointer}' +
    '.sbtn:hover{opacity:1;background:var(--acc2)}.sbtn.up{top:4px}.sbtn.dn{bottom:4px}' +
    '.verdict{cursor:pointer}.verdict .vh{display:block;font-size:10.5px;font-weight:400;opacity:.75;margin-top:1px}' +
    '.vdet{margin:6px 12px 0;padding:8px 10px;border:1px solid var(--line);border-radius:12px;background:var(--bg2);font-size:11.5px;line-height:1.8}' +
    '.vdet .vr{padding:4px 0;border-top:1px solid var(--line)}.vdet .vr:first-child{border-top:0}.vdet .vr div{color:var(--mut)}' +
    '.sm label{display:block;font-size:11.5px;color:var(--mut);margin:6px 0 2px}.sm input[type=text]{width:100%;padding:8px;border:1.5px solid transparent;background:var(--inp);color:var(--fg);border-radius:9px;font-size:13px;direction:ltr;text-align:center;outline:none}' +
    '.sm input[type=text]:focus{border-color:var(--acc);background:var(--inpf)}' +
    '.big{font-size:15px;font-weight:800;text-align:center;padding:10px;border-radius:12px;margin:8px 0}' +
    '.ad .row2{display:flex;gap:6px;flex-wrap:wrap;margin:0 12px 8px}' +
    '.ad .row2 button,.ad .row2 select{flex:1;min-width:120px;padding:7px 8px;border:1px solid var(--line);background:var(--bg2);color:var(--fg);border-radius:10px;font-size:11.5px;font-weight:600;font-family:inherit}' +
    '.ad .row2 button.pri{background:var(--acc);color:var(--accfg);border-color:var(--acc)}' +
    '.ad .row2 label{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--fg);flex:1 1 100%}' +
    '.ad .hero{margin:0 12px 8px;padding:11px 12px;border-radius:14px;border:1.5px solid var(--acc);background:var(--bg)}' +
    '.ad .hero .t{font-size:15px;font-weight:800;color:var(--acc);margin-bottom:2px}' +
    '.ad .hero .s{font-size:11.5px;color:var(--mut);line-height:1.8}' +
    '.ad .hero.none{border-color:var(--line)}.ad .hero.none .t{color:var(--warn-fg)}' +
    '.ad .kv{display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-top:1px solid var(--line);font-size:11.5px;line-height:1.7}' +
    '.ad .kv:first-of-type{border-top:0}.ad .kv .vv{direction:ltr;white-space:nowrap;font-weight:700;font-variant-numeric:tabular-nums}' +
    '.ad .why{margin:6px 0 0;padding:0 16px 0 0;font-size:11.5px;line-height:1.9}' +
    '.ad .mt{display:flex;gap:4px;margin:0 12px 6px}.ad .mt button{flex:1;padding:6px 2px;border:1px solid var(--line);background:var(--bg2);color:var(--mut);border-radius:9px;font-size:11px;font-weight:600;font-family:inherit}' +
    '.ad .mt button.on{background:var(--acc);color:var(--accfg);border-color:var(--acc)}' +
    '.ad .cmp td.l{text-align:right}.ad .cmp tr.cur td{outline:1.5px solid var(--acc);outline-offset:-1.5px}.ad .cmp tr.rej td{opacity:.5}' +
    '.ad .cmp tr.top td{background:var(--ok-bg)}.ad .cmp td.neg{color:var(--bad-fg)}.ad .cmp td.pos{color:var(--ok-fg)}' +
    '.ad .cmp a{color:var(--acc);text-decoration:none}' +
    '.ad .tag{display:inline-block;padding:0 6px;border-radius:99px;font-size:10px;background:var(--acc2);color:var(--acc);margin-inline-start:4px}' +
    '.ad .tag.w{background:var(--warn-bg);color:var(--warn-fg)}';

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function money(x) { return x === null || x === undefined || !isFinite(x) ? "—" : Math.round(x).toLocaleString("en-US"); }
  function p0(x) { return x === null || x === undefined || !isFinite(x) ? "—" : Math.round(x * 100) + "٪"; }
  function p1(x) { return x === null || x === undefined || !isFinite(x) ? "—" : (x * 100).toFixed(1) + "٪"; }
  function sgn(x) { return x === null || x === undefined || !isFinite(x) ? "—" : (x >= 0 ? "+" : "") + Math.round(x * 100) + "٪"; }
  function f2(x) { return x === null || x === undefined || !isFinite(x) ? "—" : x.toFixed(2); }
  function dateOf(c) { return c.jy ? c.jy + "/" + String(c.jm).padStart(2, "0") + "/" + String(c.jd).padStart(2, "0") : "—"; }
  var LBL = { call: "خرید Call", put: "خرید Put", scall: "فروش Call", sput: "فروش Put" };
  var ORDER = ["call", "put", "scall", "sput"];

  function create(rootEl, opts) {
    var el = null, busy = false, prog = "", S_ = { chain: null, rep: [], advice: null, mode: null, showAll: false, prefs: { own: false, k: 0.5 }, optSt: null, log: [], ts: 0 };
    var prefsLoaded = false;

    function ctxNow() { return opts.getContext() || {}; }
    function loadPrefs(cb) {
      if (prefsLoaded) { cb(); return; }
      CS.get("adv.prefs", function (p) {
        if (p) { S_.prefs.own = !!p.own; if (typeof p.k === "number") S_.prefs.k = p.k; }
        CS.get("O.settings", function (s) { S_.optSt = s || {}; prefsLoaded = true; cb(); });
      });
    }
    function savePrefs() { CS.set("adv.prefs", S_.prefs); }

    function compute() {
      var c = ctxNow();
      if (!S_.chain || !S_.chain.length) { S_.advice = null; return; }
      S_.advice = AD.advise({ S: c.S, an: c.an, stockInp: c.stockInp, stockSt: c.stockSt, fin: c.fin || null, optSt: c.optSt || S_.optSt || {}, chain: S_.chain, own: S_.prefs.own, k: S_.prefs.k });
      if (S_.advice && S_.advice.ok) {
        var valid = S_.mode && S_.advice.byMode[S_.mode] && S_.advice.byMode[S_.mode].length;
        if (!valid) S_.mode = S_.advice.best ? S_.advice.best.mode : "call";
      }
    }

    async function run(force) {
      if (busy) return;
      var c = ctxNow();
      if (!c.baseSym) { S_.rep = [{ ok: false, t: "نماد پایه مشخص نیست؛ اول اعداد صفحه را بخوان (دکمه «به‌روزرسانی از سایت»)" }]; render(); return; }
      if (!(c.S > 0)) { S_.rep = [{ ok: false, t: "قیمت سهم پایه هنوز خوانده نشده؛ اول «به‌روزرسانی از سایت» را بزن" }]; render(); return; }
      busy = true; prog = "در حال یافتن اختیارها…"; render();
      var log = ["advisor " + new Date().toISOString(), "base=" + c.baseSym];
      try {
        var res = await CH.load(c.baseSym, c.S, log, function (d, n) { prog = "خواندن قیمت اختیارها: " + d + " از " + n; var pe = el && el.querySelector("[data-prog]"); if (pe) pe.textContent = prog; }, !!force);
        S_.chain = res.rows; S_.rep = res.rep; S_.ts = res.at || Date.now();
        compute();
      } catch (e) { log.push("EXCEPTION " + e); S_.rep = [{ ok: false, t: "خطا: " + e }]; }
      S_.log = log;
      busy = false; prog = ""; render();
    }

    function whyBullets(A) {
      var V = A.view, b = A.best, m = b.mode, h = [];
      if (V.ok) h.push("تحلیل سهم پایه: <b>" + esc(V.dirTxt) + "</b> (" + esc(V.confTxt) + ")؛ " + V.parts.slice(0, 3).map(function (x) { return esc(x.txt); }).join(" | "));
      else h.push("تحلیل تکنیکال سهم در دسترس نیست؛ فقط قیمت‌گذاری بازار نسبت به نوسان سهم سنجیده شد.");
      if (A.ivRatio !== null) h.push("قیمت اختیارها: <b>" + esc(A.priceTxt) + "</b> (نوسان ضمنی ÷ تاریخی = " + f2(A.ivRatio) + ")");
      var d = V.ok ? V.d : 0, rich = A.ivRatio !== null && A.ivRatio > 1.1, cheap = A.ivRatio !== null && A.ivRatio < 0.9;
      if (m === "call") h.push((d > 0.25 ? "نظر صعودی" : "نظر تحلیلی خنثی") + (cheap ? " و اختیار نسبت به نوسان سهم ارزان" : "") + " ⇒ خرید Call؛ حداکثر زیان همان پریمیوم است." + (d <= 0.25 ? " ⚠ برتری بیشتر از قیمت‌گذاری بازار می‌آید تا از جهت سهم." : ""));
      if (m === "put") h.push((d < -0.25 ? "نظر نزولی" : "نظر تحلیلی خنثی") + (cheap ? " و اختیار نسبت به نوسان سهم ارزان" : "") + " ⇒ خرید Put؛ حداکثر زیان همان پریمیوم است." + (d >= -0.25 ? " ⚠ برتری بیشتر از قیمت‌گذاری بازار می‌آید تا از جهت سهم." : ""));
      if (m === "sput") h.push("فروش Put: " + (rich ? "پریمیوم نسبت به نوسان سهم بالاست" : "پریمیوم نسبت به ریسکِ قیمت اعمال انتخاب‌شده کافی است") + (d > 0.25 ? " و نظر تحلیلی صعودی است" : d < -0.25 ? ". ⚠ نظر تحلیلی نزولی است؛ برتری فقط از دور بودن قیمت اعمال می‌آید و در ریزش شدید زیان‌ده است" : "") + ". باید حاضر باشی سهم را به قیمت اعمال بخری و نقدینگی کامل داشته باشی.");
      if (m === "scall") h.push("فروش Call (فقط پوششی، با داشتن سهم): " + (rich ? "پریمیوم نسبت به نوسان سهم بالاست" : "پریمیوم کافی است") + (d < -0.25 ? " و نظر تحلیلی نزولی/محتاط است" : d > 0.25 ? ". ⚠ نظر تحلیلی صعودی است؛ ممکن است سود بیشتر سهم را از دست بدهی" : "") + ".");
      var t = b.top;
      if (t) {
        if (t.sell) h.push("در بهترین گزینه: بازده پریمیوم " + p1(t.yield) + "، احتمال زیان " + p0(t.pLoss) + "، فاصله سهم تا سر به سر " + p1(t.cushion) + "، زیان میانگین در ۵٪ بدترین سناریو " + money(t.tailLoss) + " ریال به‌ازای هر سهم.");
        else h.push("در بهترین گزینه: احتمال سود " + p0(t.pProfit) + "، بازده مورد انتظار مدل " + sgn(t.roi) + "، حرکت لازم سهم تا سر به سر " + p1(t.beMove) + ".");
      }
      if (V.warn && V.warn.length) V.warn.forEach(function (w) { h.push("⚠ " + esc(w)); });
      return h;
    }

    function candLink(c) { return opts.origin + "/InstInfo/" + c.insCode; }

    function idealCard(A, md) {
      var id = A.ideal && A.ideal[md], S = ctxNow().S;
      if (!id) return "";
      var call = md === "call" || md === "scall", sell = md === "scall" || md === "sput";
      var h = '<div class="sg"><h5>🎯 مشخصات ایده‌آل برای «' + LBL[md] + '»</h5>';
      if (id.noEdge) h += '<div class="msg w">در این حالت هیچ قیمت اعمالی با قیمت‌های فعلی بازار برتری مثبت ندارد؛ پایین، نزدیک‌ترین گزینه فقط برای مقایسه است.</div>';
      else if (!id.pass) h += '<div class="msg w">هیچ قیمت اعمالی هم‌زمان شرط ' + (sell ? "احتمال زیان و بازده" : "حداقل احتمال سود (" + p0(id.pmin) + ")") + ' را برآورده نکرد؛ بهترین امتیاز نشان داده شده است.</div>';
      h += '<div class="kv"><span>قیمت اعمال ایده‌آل</span><span class="vv">≈ ' + money(id.K) + ' (' + (id.K >= S ? "+" : "") + Math.round((id.K / S - 1) * 100) + '٪ نسبت به سهم)</span></div>' +
        '<div class="kv"><span>ناحیه‌ی خوب (امتیاز ≥ ۸۵٪ بهترین)</span><span class="vv">' + money(id.Klo) + ' تا ' + money(id.Khi) + '</span></div>' +
        '<div class="kv"><span>سررسید ایده‌آل</span><span class="vv">≈ ' + id.td + ' روز معاملاتی</span></div>' +
        '<div class="kv"><span>قیمت منصفانه‌ی ' + (sell ? "فروش" : "خرید") + ' در این حالت</span><span class="vv">≈ ' + money(id.price) + '</span></div>';
      var n = id.nearest;
      if (n) {
        h += '<div class="kv"><span><b>نزدیک‌ترین اختیار موجود</b></span><span class="vv"><a href="' + esc(candLink(n)) + '" target="_blank">' + esc(n.sym || n.name || ("K=" + n.K)) + '</a></span></div>' +
          '<div class="kv"><span>قیمت اعمال / سررسید</span><span class="vv">' + money(n.K) + ' / ' + dateOf(n) + ' (' + n.td + ' روز)</span></div>' +
          '<div class="kv"><span>' + (sell ? "بهترین قیمت خرید (فروش فوری)" : "بهترین قیمت فروش (خرید فوری)") + '</span><span class="vv">' + money(sell ? n.bid : n.ask) + '</span></div>' +
          '<div class="kv"><span>رتبه‌ی آن بین ' + LBL[md] + 'های واقعی</span><span class="vv">' + id.rankOfNearest + ' از ' + A.byMode[md].filter(function (c) { return c.ok; }).length + '</span></div>';
      } else h += '<div class="msg wait">اختیار واقعی و نقدشونده‌ای نزدیک این مشخصات پیدا نشد.</div>';
      return h + '</div>';
    }

    function tableFor(A, md) {
      var list = A.byMode[md] || [], c0 = ctxNow(), sell = md === "scall" || md === "sput";
      if (!list.length) return '<div class="empty">اختیاری برای این حالت نیست.</div>';
      var show = S_.showAll ? list : list.slice(0, 12);
      var h = '<div class="cmp"><table><thead><tr><th>اختیار</th><th>سررسید</th><th>' + (sell ? "bid" : "ask") + '</th><th>اسپرد</th><th>حجم</th><th>IV÷HV</th>' +
        (sell ? '<th>بازده ماهانه</th><th>احتمال زیان</th><th>فاصله تا سر به سر</th>' : '<th>احتمال سود</th><th>بازده مدل</th><th>حرکت تا سر به سر</th>') + '<th>امتیاز</th></tr></thead><tbody>';
      var firstOk = true;
      show.forEach(function (c) {
        var cls = (c.ok ? "" : "rej ") + (c.insCode && c.insCode === c0.currentCode ? "cur " : "") + (c.ok && firstOk ? "top" : "");
        if (c.ok) firstOk = false;
        h += '<tr class="' + cls + '"' + (c.ok ? "" : ' title="' + esc(c.hard.join(" | ")) + '"') + '><td class="l"><a href="' + esc(candLink(c)) + '" target="_blank">' + esc(c.sym || "—") + '</a> ' + money(c.K) +
          (c.insCode === c0.currentCode ? '<span class="tag">همین صفحه</span>' : '') + (c.warn.length ? '<span class="tag w" title="' + esc(c.warn.join(" | ")) + '">⚠</span>' : '') + '</td>' +
          '<td class="v">' + dateOf(c) + ' (' + c.td + ')</td><td class="v">' + money(sell ? c.bid : c.ask) + '</td><td class="v">' + p1(c.spread) + '</td><td class="v">' + money(c.vol_o) + '</td><td class="v">' + f2(c.ivRatio) + '</td>' +
          (sell ? '<td class="v">' + p1(c.monthly) + '</td><td class="v">' + p0(c.pLoss) + '</td><td class="v">' + p1(c.cushion) + '</td>'
            : '<td class="v">' + p0(c.pProfit) + '</td><td class="v ' + (c.roi > 0 ? "pos" : "neg") + '">' + sgn(c.roi) + '</td><td class="v">' + p1(c.beMove) + '</td>') +
          '<td class="v ' + (c.score > 0 ? "pos" : "neg") + '">' + (c.score * 100).toFixed(0) + '</td></tr>';
      });
      h += '</tbody></table></div>';
      if (list.length > 12) h += '<div class="row2"><button data-act="all">' + (S_.showAll ? "نمایش ۱۲ مورد اول" : "نمایش همه‌ی " + list.length + " اختیار") + '</button><button data-act="copy">کپی جدول (برای اکسل)</button></div>';
      else h += '<div class="row2"><button data-act="copy">کپی جدول (برای اکسل)</button></div>';
      return h;
    }

    function render() {
      if (!el) return;
      var c = ctxNow(), A = S_.advice, h = '<div class="ad">';
      h += '<div class="note">مشاور ترکیبی: تحلیل «' + esc(c.baseSym || "؟") + '» + همه‌ی اختیارهای آن ← بهترین حالت (خرید/فروش Call/Put) و نزدیک‌ترین اختیار به حالت ایده‌آل. حاصل مدل آماری است، نه پیش‌بینی و نه توصیه سرمایه‌گذاری.</div>';
      h += '<div class="row2"><button class="pri" data-act="run">' + (S_.chain ? "🔄 خواندن دوباره‌ی همه‌ی اختیارها" : "🔎 خواندن همه‌ی اختیارهای این سهم") + '</button></div>';
      h += '<div class="row2"><label><input type="checkbox" data-pref="own"' + (S_.prefs.own ? " checked" : "") + '> سهم پایه را دارم (فروش Call پوششی را هم بسنج)</label>' +
        '<select data-pref="k"><option value="0.25"' + (S_.prefs.k === 0.25 ? " selected" : "") + '>نقش تحلیل سهم: کم</option><option value="0.5"' + (S_.prefs.k === 0.5 ? " selected" : "") + '>نقش تحلیل سهم: متوسط</option><option value="0.8"' + (S_.prefs.k === 0.8 ? " selected" : "") + '>نقش تحلیل سهم: زیاد</option><option value="0"' + (S_.prefs.k === 0 ? " selected" : "") + '>بدون نظر (فقط قیمت‌گذاری بازار)</option></select></div>';
      if (busy) h += '<div class="rep" data-prog>' + esc(prog) + '</div>';
      else if (S_.rep.length) h += '<div class="rep">' + S_.rep.map(function (r) { return '<div class="' + (r.ok ? "o" : "x") + '">' + (r.ok ? "✔ " : "✖ ") + esc(r.t) + '</div>'; }).join("") + '</div>';
      if (!A) {
        if (!busy && !S_.chain) h += '<div class="empty">دکمه‌ی بالا را بزن تا همه‌ی اختیارهای این سهم خوانده و با هم مقایسه شوند.<br>(بسته به تعداد اختیارها چند ثانیه تا یک دقیقه طول می‌کشد.)</div>';
        h += '<div class="row2"><button data-act="diag">گزارش اشکال</button></div></div>';
        el.innerHTML = h; return;
      }
      if (!A.ok) {
        h += '<div class="msg w">' + A.notes.map(esc).join("<br>") + '</div></div>'; el.innerHTML = h; return;
      }
      var V = A.view;
      // کارت بهترین حالت
      if (A.best && A.strong) {
        h += '<div class="hero"><div class="t">✅ بهترین حالت فعلی: ' + LBL[A.best.mode] + '</div><div class="s">' + esc(A.strength) + ' · امتیاز ' + (A.best.score * 100).toFixed(0) + (A.second ? " (بعدی: " + LBL[A.second.mode] + " با " + (A.second.score * 100).toFixed(0) + ")" : "") + '</div>' +
          '<ul class="why">' + whyBullets(A).map(function (x) { return "<li>" + x + "</li>"; }).join("") + '</ul></div>';
      } else {
        var why0 = "";
        if (!A.best) {
          var cnt = {};
          (A.cands || []).forEach(function (cc) { cc.hard.forEach(function (x) { var key = x.replace(/[\d.]+/g, "#"); cnt[key] = (cnt[key] || 0) + 1; }); });
          why0 = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, 3).map(function (k) { return k + " (" + cnt[k] + " مورد)"; }).join(" · ");
        }
        h += '<div class="hero none"><div class="t">⏳ فعلاً حالت روشنی برتری ندارد</div><div class="s">' + esc(A.best ? A.strength : "هیچ اختیاری هم‌زمان شرط‌های اسپرد، حجم و سررسید را نداشت" + (why0 ? " — دلیل‌های رایج: " + why0 : "") + ". می‌توانی آستانه‌ها را با اسلایدر ریسک‌پذیری در پنل اختیار آسان‌تر کنی") + '. به جدول‌ها نگاه کن؛ شاید صبر بهتر باشد.</div>' +
          (A.best ? '<ul class="why">' + whyBullets(A).map(function (x) { return "<li>" + x + "</li>"; }).join("") + '</ul>' : '') + '</div>';
      }
      // دید سهم
      h += '<div class="sg"><h5>📊 دید تحلیلی از سهم پایه</h5>';
      if (V.ok) {
        h += '<div class="kv"><span>جهت</span><span class="vv">' + esc(V.dirTxt) + ' (' + (V.d >= 0 ? "+" : "") + V.d.toFixed(2) + ')</span></div><div class="kv"><span>اطمینان</span><span class="vv">' + esc(V.confTxt) + ' (' + p0(V.conf) + ')</span></div>';
        V.parts.forEach(function (x) { h += '<div class="kv"><span>' + esc(x.name) + '</span><span class="vv" style="direction:rtl;white-space:normal;text-align:left">' + (x.d >= 0 ? "▲ " : "▼ ") + x.d.toFixed(2) + '</span></div>'; });
        h += '<div class="kv"><span>حالت بازار</span><span class="vv">' + (V.range ? "نوسانی/بدون روند" : "دارای روند") + (V.adx !== null ? ' (ADX ' + V.adx.toFixed(0) + ')' : '') + '</span></div>';
        h += '<div class="kv"><span>حمایت نزدیک / مقاومت نزدیک</span><span class="vv">' + money(V.sup) + ' / ' + money(V.res) + '</span></div>';
      }
      h += '<div class="kv"><span>نوسان روزانه ۶۰ روزه (HV)</span><span class="vv">' + p1(A.hv) + '</span></div>' +
        '<div class="kv"><span>نوسان ضمنی اختیارهای ATM (IV)</span><span class="vv">' + p1(A.ivAtm) + '</span></div>' +
        '<div class="kv"><span>قیمت اختیارها</span><span class="vv" style="direction:rtl;white-space:normal;text-align:left">' + esc(A.priceTxt) + '</span></div></div>';
      // مقایسه چهار حالت
      h += '<div class="cmp"><table><thead><tr><th>حالت</th><th>بهترین اختیار</th><th>امتیاز</th><th>ایده‌آل (K / روز)</th><th>نزدیک‌ترین واقعی</th></tr></thead><tbody>';
      ORDER.forEach(function (md) {
        var mm = A.modes.filter(function (x) { return x.mode === md; })[0], id = A.ideal[md], t = mm.top;
        h += '<tr' + (A.best && A.best.mode === md ? ' class="top"' : "") + '><td class="l">' + LBL[md] + (mm.skipped ? '<span class="tag w">سهم ندارم</span>' : '') + '</td>' +
          '<td class="v">' + (t ? money(t.K) + " (" + t.td + " روز)" : "—") + '</td><td class="v ' + (t && t.score > 0 ? "pos" : "neg") + '">' + (t ? (t.score * 100).toFixed(0) : "—") + '</td>' +
          '<td class="v">' + (id ? (id.noEdge ? "بدون برتری" : "≈ " + money(id.K) + " / " + id.td) : "—") + '</td><td class="v">' + (id && id.nearest ? esc(id.nearest.sym || "") + " " + money(id.nearest.K) : "—") + '</td></tr>';
      });
      h += '</tbody></table></div><div class="legend">امتیاز = برتری مورد انتظار به‌ازای واحد ریسک (پس از آزمون استرس نوسان)؛ مثبت‌تر بهتر. سطرهای کم‌رنگ شرط نقدشوندگی/اسپرد/سررسید را نداشتند.</div>';
      // انتخاب حالت + کارت ایده‌آل + جدول
      var md = S_.mode || (A.best ? A.best.mode : "call");
      h += '<div class="mt">' + ORDER.map(function (k) { return '<button data-mode="' + k + '" class="' + (k === md ? "on" : "") + '">' + LBL[k] + '</button>'; }).join("") + '</div>';
      h += idealCard(A, md);
      h += tableFor(A, md);
      if (opts.onApply && c.currentCode) h += '<div class="row2"><button class="pri" data-act="apply">اعمال هدف و احتمال این تحلیل روی چک‌لیست همین اختیار</button></div>';
      h += '<div class="row2"><button data-act="diag">گزارش اشکال</button></div></div>';
      el.innerHTML = h;
    }

    function copyTable() {
      var A = S_.advice; if (!A || !A.ok) return;
      var md = S_.mode, sell = md === "scall" || md === "sput";
      var rows = [["نماد", "قیمت اعمال", "سررسید", "روز معاملاتی", sell ? "bid" : "ask", "اسپرد", "حجم", "IV/HV"].concat(sell ? ["بازده ماهانه", "احتمال زیان", "فاصله تا سر به سر"] : ["احتمال سود", "بازده مدل", "حرکت تا سر به سر"]).concat(["امتیاز", "وضعیت"])];
      (A.byMode[md] || []).forEach(function (c) {
        rows.push([c.sym || "", c.K, dateOf(c), c.td, sell ? c.bid : c.ask, c.spread !== null ? +(c.spread * 100).toFixed(1) : "", c.vol_o, c.ivRatio ? +c.ivRatio.toFixed(2) : ""].concat(sell ? [+(c.monthly * 100).toFixed(1), +(c.pLoss * 100).toFixed(0), +(c.cushion * 100).toFixed(1)] : [+(c.pProfit * 100).toFixed(0), +(c.roi * 100).toFixed(0), +(c.beMove * 100).toFixed(1)]).concat([+(c.score * 100).toFixed(0), c.ok ? "" : c.hard.join(" | ")]));
      });
      var txt = rows.map(function (r) { return r.join("\t"); }).join("\n");
      try { navigator.clipboard.writeText(txt); } catch (e) { prompt("این متن را کپی کن:", txt); }
    }

    function handler(e) {
      var t = e.target;
      var b = t.closest && t.closest("[data-act],[data-mode]");
      if (!b) return;
      if (b.dataset.mode) { S_.mode = b.dataset.mode; S_.showAll = false; render(); return; }
      var a = b.dataset.act;
      if (a === "run") run(true);
      else if (a === "all") { S_.showAll = !S_.showAll; render(); }
      else if (a === "copy") copyTable();
      else if (a === "diag") { var txt = (S_.log || []).join("\n"); try { navigator.clipboard.writeText(txt).then(function () { alert("گزارش کپی شد؛ همین را برای من بفرست."); }, function () { prompt("این متن را کپی کن:", txt); }); } catch (er) { prompt("این متن را کپی کن:", txt); } }
      else if (a === "apply" && opts.onApply && S_.advice && S_.advice.ok) opts.onApply(S_.advice);
    }
    function changeHandler(e) {
      var t = e.target, k = t.dataset && t.dataset.pref;
      if (!k) return;
      if (k === "own") S_.prefs.own = !!t.checked;
      if (k === "k") S_.prefs.k = Number(t.value);
      savePrefs(); compute(); render();
    }

    return {
      mount: function (container) {
        el = container;
        el.onclick = handler; el.onchange = changeHandler;
        loadPrefs(function () {
          if (S_.chain && Date.now() - S_.ts < 120000) compute(); // نتیجه‌ی تازه‌ی قبلی
          render();
        });
      },
      refresh: function () { compute(); render(); },
    };
  }



  // ---------- جزئیات «کدام مرحله رد شد» برای بالای پنل ----------
  function verdictInfo(res, titles) {
    var prob = [], okn = [];
    (res.steps || []).forEach(function (s, i) {
      if (!s) return;
      var t = String((titles && titles[i]) || ("مرحله " + i)).replace(/^مرحله [۰-۹]+ — /, "");
      if (s.status === "✅") { okn.push(t); return; }
      var det = [];
      if (s.missing) det.push("ورودی ناقص است؛ خانه‌های خالی این مرحله را پر کن.");
      (s.hard || []).forEach(function (x) { det.push("❌ " + x); });
      (s.warn || []).forEach(function (x) { det.push("⚠ " + x); });
      prob.push({ head: s.status + " " + t, det: det, rank: s.status === "❌" ? 0 : s.status === "⚠" ? 1 : 2 });
    });
    prob.sort(function (a, b) { return a.rank - b.rank; });
    var text = res.final.sym + " " + res.final.text, html = "";
    prob.forEach(function (p) {
      text += "\n" + p.head + p.det.map(function (d) { return "\n   " + d; }).join("");
      html += '<div class="vr"><b>' + esc(p.head) + '</b>' + p.det.map(function (d) { return '<div>' + esc(d) + '</div>'; }).join("") + '</div>';
    });
    if (okn.length) { text += "\n✅ عبور: " + okn.join("، "); html += '<div class="vr"><b>✅ عبور:</b> <span style="color:var(--mut)">' + esc(okn.join("، ")) + '</span></div>'; }
    if (!prob.length) html = '<div class="vr">همه‌ی مرحله‌ها بدون مشکل عبور کرده‌اند.</div>' + html;
    return { text: text, html: html };
  }
  // نمایش جزئیات زیر نوار نتیجه؛ با کلیک باز/بسته می‌شود و با نگه‌داشتن موس هم در tooltip دیده می‌شود
  function paintVerdict(root, STATE, res, titles) {
    var v = root.getElementById("verdict"); if (!v) return;
    var info = verdictInfo(res, titles);
    v.title = info.text;
    if (!v.querySelector(".vh")) { var h = document.createElement("span"); h.className = "vh"; h.textContent = "برای دیدن مرحله‌های ردشده کلیک کن یا موس را نگه دار"; v.appendChild(h); }
    var vd = root.getElementById("vdet");
    if (STATE.vdetOpen) {
      if (!vd) { vd = document.createElement("div"); vd.id = "vdet"; vd.className = "vdet"; v.insertAdjacentElement("afterend", vd); }
      vd.innerHTML = info.html;
    } else if (vd) vd.remove();
  }

  // ---------- بلوک مشترک «جمع‌بندی مسیر نماد» (نمودار + مالی) برای پنل سهم و پنل اختیار ----------
  // o: { title, name, S, v (stockView), ol (outlook), nr (narrative), hDays, expDate, note }
  function faN(x) { return String(x).replace(/\d/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[d]; }); }
  function outlookHtml(o) {
    if (!o || !o.v || !o.v.ok || !o.ol) return '<div class="sg"><h5>' + esc(o && o.title || "🔭 جمع‌بندی") + '</h5><div class="legend">برای جمع‌بندی، سابقه‌ی قیمت سهم (حداقل ۶۰ روز) لازم است؛ «به‌روزرسانی از سایت» را بزن.</div></div>';
    var v = o.v, ol = o.ol, nr = o.nr, S = o.S;
    var h = '<div class="sg"><h5>' + esc(o.title || "🔭 جمع‌بندی: نماد احتمالاً چطور می‌رود؟") + '</h5>';
    h += '<div class="msg ' + nr.cls + '"><b>' + esc(faN(nr.headline)) + '</b></div>';
    nr.lines.forEach(function (t) { h += '<div style="font-size:11.5px;line-height:1.9;margin:4px 0">• ' + esc(faN(t)) + '</div>'; });
    nr.warn.forEach(function (t) { h += '<div class="msg w">⚠ ' + esc(faN(t)) + '</div>'; });
    // قیمت در سررسید / پایان افق
    var lab = o.expDate ? "تا سررسید (" + o.expDate + " — " + ol.td + " روز معاملاتی)" : "تا " + ol.td + " روز معاملاتی آینده";
    h += '<div class="cmp sgt" style="margin:6px 0 0"><table><thead><tr><th class="lab">قیمت سهم ' + esc(faN(lab)) + '</th><th>قیمت</th><th>تغییر</th></tr></thead><tbody>';
    [["بدبینانه (حدود ۲٫۵٪ احتمال پایین‌تر)", ol.low95], ["محتاطانه (حدود ۱۶٪ احتمال پایین‌تر)", ol.low68], ["مرکزی (میانه‌ی پیش‌بینی)", ol.median], ["خوش‌بینانه (حدود ۱۶٪ احتمال بالاتر)", ol.high68], ["بسیار خوش‌بینانه (حدود ۲٫۵٪ احتمال بالاتر)", ol.high95]].forEach(function (r, i) {
      var ch = (r[1] / S - 1) * 100;
      h += '<tr' + (i === 2 ? ' style="font-weight:700"' : '') + '><td class="lab">' + esc(r[0]) + '</td><td class="v">' + esc(faN(Math.round(r[1]).toLocaleString("en-US"))) + '</td><td class="v ' + (ch > 0.05 ? "best" : ch < -0.05 ? "worst" : "") + '">' + esc(faN((ch >= 0 ? "+" : "") + ch.toFixed(1))) + '٪</td></tr>';
    });
    h += '</tbody></table></div>';
    // اجزای دید
    if (v.parts && v.parts.length) {
      h += '<details style="margin:6px 0 0"><summary style="font-size:11.5px;cursor:pointer"><b>این جمع‌بندی از چه چیزهایی ساخته شده؟</b> (جهت ' + esc(faN(Math.round(v.d * 100))) + '٪، اطمینان ' + esc(faN(Math.round(v.conf * 100))) + '٪)</summary>';
      v.parts.forEach(function (c) {
        h += '<div class="kv" style="display:flex;justify-content:space-between;gap:10px;padding:3px 0;border-top:1px solid var(--line);font-size:11px;line-height:1.7"><span>' + (c.d > 0.1 ? "🟢 " : c.d < -0.1 ? "🔴 " : "⚪ ") + esc(faN(c.name)) + ' <span style="color:var(--mut)">(وزن ' + esc(faN(Math.round(c.w * 100))) + '٪)</span></span><span style="color:var(--mut);text-align:left">' + esc(faN(c.txt)) + '</span></div>';
      });
      h += '</details>';
    }
    h += '<div class="legend" style="margin:6px 0 0">' + esc(o.note || "این جمع‌بندی ترکیب آماری نمودار (احتمال شرطی تاریخی، روند، جریان حقیقی/حقوقی) و در صورت وجود تحلیل مالی است. جهت را فقط کمی از ۵۰٪ دور می‌کند؛ پیش‌بینی قطعی یا توصیه‌ی سرمایه‌گذاری نیست.") + '</div></div>';
    return h;
  }

  root.AdvisorUI = { create: create, CSS: CSS, outlookHtml: outlookHtml, verdictInfo: verdictInfo, paintVerdict: paintVerdict };
})(typeof self !== "undefined" ? self : this);
