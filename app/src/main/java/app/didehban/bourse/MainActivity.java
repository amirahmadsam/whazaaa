package app.didehban.bourse;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * اپ: صفحه‌های خود برنامه (assets/www) داخل WebView باز می‌شوند و اسکریپت‌های افزونه روی همان‌ها اجرا می‌شوند.
 * داده‌ها از API سایت از طریق Bridge (بدون نمایش خود سایت) گرفته می‌شود.
 */
public class MainActivity extends Activity {
    static final String APP_HOST = "appassets.androidplatform.net";
    static final String APP_HOME = "https://" + APP_HOST + "/assets/www/app.html";
    static final String MARKET_WATCH = "https://main.tsetmc.com/MarketWatch";
    private static final Pattern INSTINFO = Pattern.compile("^/InstInfo/(\\d{6,})");
    private static final int REQ_FILE = 71;

    interface MwCallback {
        void done(boolean ok, int n, boolean dom, String err);
    }

    private final Handler ui = new Handler(Looper.getMainLooper());
    private Store store;
    private Bridge bridge;
    private WebViewAssetLoader loader;
    private String script = "";
    private boolean injectionOk;

    private FrameLayout stack;
    private WebView web;
    private ValueCallback<Uri[]> fileCb;

    // خواندن دیده‌بان بازار در وب‌ویوی پنهان
    private WebView mwWeb;
    private MwCallback mwCb;
    private long mwStart;
    private boolean mwSettling;
    private Runnable mwTimeout;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        store = new Store(this);
        bridge = new Bridge(this, store);
        loader = new WebViewAssetLoader.Builder()
                .setDomain(APP_HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        injectionOk = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
                && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER);
        if (injectionOk) script = readAsset("bundle.js");

        if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0)
            WebView.setWebContentsDebuggingEnabled(true);

        stack = new FrameLayout(this);
        web = new WebView(this);
        configure(web, false);
        if (injectionOk) inject(web);
        web.setWebViewClient(new AppClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                try {
                    startActivityForResult(p.createIntent(), REQ_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCb = null;
                    return false;
                }
                return true;
            }
        });
        stack.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(stack);

        if (!injectionOk) {
            new AlertDialog.Builder(this)
                    .setTitle("وب‌ویو قدیمی است")
                    .setMessage("برای اجرای برنامه، «Android System WebView» را از گوگل‌پلی یا بازار به‌روز کن.")
                    .setPositiveButton("باشه", null).show();
        }

        web.loadUrl(b != null && b.getString("url") != null ? b.getString("url") : APP_HOME);
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_FILE && fileCb != null) {
            Uri[] r = null;
            if (res == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    r = new Uri[n];
                    for (int i = 0; i < n; i++) r[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data.getData() != null) r = new Uri[]{data.getData()};
            }
            fileCb.onReceiveValue(r);
            fileCb = null;
            return;
        }
        super.onActivityResult(req, res, data);
    }

    // ------------------------------------------------------------ وب‌ویو
    private void configure(WebView w, boolean desktop) {
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setTextZoom(100);
        if (desktop) {
            s.setUseWideViewPort(true);
            s.setLoadWithOverviewMode(true);
            s.setUserAgentString(Net.DESKTOP_UA);
        }
    }

    private void inject(WebView w) {
        Set<String> rules = new HashSet<>(Arrays.asList(
                "https://" + APP_HOST, "https://tsetmc.com", "https://*.tsetmc.com", "https://tsetmc.ir", "https://*.tsetmc.ir"));
        WebViewCompat.addWebMessageListener(w, "__dbNative", rules, bridge);
        WebViewCompat.addDocumentStartJavaScript(w, script, rules);
    }

    private void openExternal(Uri u) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (Exception e) {
            Toast.makeText(this, "برنامه‌ای برای باز کردن پیدا نشد", Toast.LENGTH_SHORT).show();
        }
    }

    private final class AppClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
            return loader.shouldInterceptRequest(r.getUrl());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            if (!r.isForMainFrame()) return false;
            Uri u = r.getUrl();
            if ("https".equals(u.getScheme()) && APP_HOST.equals(u.getHost())) {
                String path = u.getPath() == null ? "" : u.getPath();
                Matcher m = INSTINFO.matcher(path);
                if (m.find()) {   // لینک «باز کردن صفحه‌ی نماد» داخل پنل ← همان نماد در خود برنامه
                    v.loadUrl(APP_HOME + "?i=" + m.group(1));
                    return true;
                }
                return !path.startsWith("/assets/");
            }
            openExternal(u);   // کدال، اکسل و ... در مرورگر گوشی
            return true;
        }

        @Override
        public void onReceivedSslError(WebView v, SslErrorHandler h, SslError e) {
            h.cancel();
        }
    }

    // ------------------------------------------------------------ دیده‌بان بازار در پس‌زمینه (mwpage)
    void startMarketWatch(final long timeoutMs, final MwCallback cb) {
        if (!injectionOk) { cb.done(false, 0, false, "وب‌ویو قدیمی است"); return; }
        if (mwCb != null) { cb.done(false, 0, false, "خواندن بازار هم‌اکنون در جریان است"); return; }
        mwCb = cb;
        mwStart = System.currentTimeMillis();
        mwSettling = false;
        mwWeb = new WebView(this);
        configure(mwWeb, true);
        inject(mwWeb);
        mwWeb.setWebViewClient(new WebViewClient());
        mwWeb.setAlpha(0.01f);
        stack.addView(mwWeb, 0, new FrameLayout.LayoutParams(-1, -1));
        mwWeb.loadUrl(MARKET_WATCH);
        mwTimeout = () -> finishMw(false, 0, false,
                "تا " + (timeoutMs / 1000) + " ثانیه چیزی از صفحه‌ی دیده‌بان بازار ذخیره نشد");
        ui.postDelayed(mwTimeout, timeoutMs);
    }

    /** هر بار که کلید mkt:snap ذخیره شود */
    void onSnapshotSaved(final String raw) {
        if (mwCb == null) return;
        new Thread(() -> {
            try {
                JSONObject v = new JSONObject(raw);
                final double at = v.optDouble("at", 0);
                JSONArray arr = v.optJSONArray("arr");
                final int n = arr == null ? 0 : arr.length();
                final boolean dom = v.optBoolean("dom");
                ui.post(() -> {
                    if (mwCb != null && !mwSettling && at >= mwStart && n >= 100) {
                        mwSettling = true;
                        ui.postDelayed(() -> finishMw(true, n, dom, null), 300);
                    }
                });
            } catch (Exception ignored) {
            }
        }).start();
    }

    private void finishMw(boolean ok, int n, boolean dom, String err) {
        MwCallback cb = mwCb;
        if (cb == null) return;
        mwCb = null;
        if (mwTimeout != null) ui.removeCallbacks(mwTimeout);
        if (mwWeb != null) {
            mwWeb.stopLoading();
            stack.removeView(mwWeb);
            mwWeb.destroy();
            mwWeb = null;
        }
        cb.done(ok, n, dom, err);
    }

    // ------------------------------------------------------------ چرخه‌ی عمر
    private String readAsset(String name) {
        try (InputStream in = getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[32768];
            int r;
            while ((r = in.read(buf)) > 0) out.write(buf, 0, r);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "";
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle o) {
        super.onSaveInstanceState(o);
        if (web != null && web.getUrl() != null) o.putString("url", web.getUrl());
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (mwWeb != null) { mwWeb.destroy(); mwWeb = null; }
        if (web != null) {
            ViewGroup p = (ViewGroup) web.getParent();
            if (p != null) p.removeView(web);
            web.destroy();
        }
    }
}
