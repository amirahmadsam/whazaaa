package app.didehban.bourse;

import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * پل بین صفحه (shim.js) و اپ. پیام‌ها: {id, op, p} ← پاسخ: {id, r}
 * op: sget / sset / sdel (ذخیره‌سازی) ، http / httpbin (شبکه) ، mwpage (خواندن دیده‌بان بازار در وب‌ویوی پنهان)
 */
final class Bridge implements WebViewCompat.WebMessageListener {
    private final MainActivity act;
    private final Store store;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService net = Executors.newFixedThreadPool(4);

    Bridge(MainActivity act, Store store) {
        this.act = act;
        this.store = store;
    }

    static boolean trustedHost(String host) {
        if (host == null) return false;
        host = host.toLowerCase();
        return host.equals("appassets.androidplatform.net")
                || host.equals("tsetmc.com") || host.endsWith(".tsetmc.com")
                || host.equals("tsetmc.ir") || host.endsWith(".tsetmc.ir");
    }

    @Override
    public void onPostMessage(@NonNull WebView view, @NonNull WebMessageCompat message, @NonNull Uri origin,
                              boolean isMainFrame, @NonNull JavaScriptReplyProxy reply) {
        if (!"https".equals(origin.getScheme()) || !trustedHost(origin.getHost())) return;
        String data = message.getData();
        if (data == null) return;
        final int id;
        final String op;
        final JSONObject p;
        try {
            JSONObject m = new JSONObject(data);
            id = m.optInt("id");
            op = m.optString("op");
            JSONObject pp = m.optJSONObject("p");
            p = pp != null ? pp : new JSONObject();
        } catch (JSONException e) {
            return;
        }
        try {
            switch (op) {
                case "sget": {
                    JSONArray ks = p.optJSONArray("keys");
                    List<String> keys = null;
                    if (ks != null) {
                        keys = new ArrayList<>();
                        for (int i = 0; i < ks.length(); i++) keys.add(ks.optString(i));
                    }
                    send(reply, id, store.getJson(keys), true);
                    break;
                }
                case "sset": {
                    JSONObject items = p.optJSONObject("items");
                    if (items != null) {
                        Iterator<String> it = items.keys();
                        while (it.hasNext()) {
                            String k = it.next();
                            String v = items.optString(k, null);
                            if (v == null) continue;
                            store.set(k, v);
                            if ("mkt:snap".equals(k)) act.onSnapshotSaved(v);
                        }
                    }
                    send(reply, id, "{}", true);
                    break;
                }
                case "sdel": {
                    JSONArray ks = p.optJSONArray("keys");
                    if (ks != null) for (int i = 0; i < ks.length(); i++) store.remove(ks.optString(i));
                    send(reply, id, "{}", true);
                    break;
                }
                case "http": {
                    final String kind = p.optString("kind"), url = p.optString("url");
                    if (!Net.allowedJson(kind, url)) {
                        send(reply, id, err("نشانی مجاز نیست"), true);
                        break;
                    }
                    net.execute(() -> {
                        Net.Resp r = Net.get(url, "application/json");
                        try {
                            JSONObject o = new JSONObject();
                            if (r.err != null) o.put("err", r.err);
                            else {
                                o.put("status", r.status);
                                o.put("text", new String(r.body, StandardCharsets.UTF_8));
                            }
                            send(reply, id, o.toString(), true);
                        } catch (JSONException e) {
                            send(reply, id, err(String.valueOf(e)), true);
                        }
                    });
                    break;
                }
                case "httpbin": {
                    final String url = p.optString("url");
                    if (!Net.allowedBin(url)) {
                        send(reply, id, err("نشانی مجاز نیست"), true);
                        break;
                    }
                    net.execute(() -> {
                        Net.Resp r = Net.get(url, null);
                        try {
                            JSONObject o = new JSONObject();
                            if (r.err != null) o.put("err", r.err);
                            else {
                                o.put("status", r.status);
                                o.put("size", r.body.length);
                                if (r.status >= 200 && r.status < 300)
                                    o.put("b64", Base64.encodeToString(r.body, Base64.NO_WRAP));
                            }
                            send(reply, id, o.toString(), true);
                        } catch (JSONException e) {
                            send(reply, id, err(String.valueOf(e)), true);
                        }
                    });
                    break;
                }
                case "mwpage": {
                    final long timeout = Math.max(5000L, Math.min(180000L, p.optLong("timeout", 70000L)));
                    act.startMarketWatch(timeout, (ok, n, dom, e) -> {
                        try {
                            JSONObject o = new JSONObject();
                            o.put("ok", ok);
                            if (ok) {
                                o.put("n", n);
                                o.put("dom", dom);
                            } else o.put("err", e);
                            send(reply, id, o.toString(), true);
                        } catch (JSONException ex) {
                            send(reply, id, "{\"ok\":false}", true);
                        }
                    });
                    break;
                }
                default:
                    send(reply, id, err("دستور ناشناخته"), true);
            }
        } catch (RuntimeException e) {
            send(reply, id, err(String.valueOf(e)), true);
        }
    }

    private static String err(String m) {
        try {
            return new JSONObject().put("err", m).toString();
        } catch (JSONException e) {
            return "{}";
        }
    }

    /** پاسخ را روی ترد اصلی می‌فرستد: {"id":..,"r":<rJson>} */
    private void send(final JavaScriptReplyProxy rp, int id, String rJson, boolean raw) {
        final String s = "{\"id\":" + id + ",\"r\":" + rJson + "}";
        ui.post(() -> {
            try {
                rp.postMessage(s);
            } catch (Throwable ignored) {
            }
        });
    }
}
