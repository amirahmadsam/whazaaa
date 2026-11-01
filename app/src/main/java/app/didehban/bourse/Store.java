package app.didehban.bourse;

import android.content.Context;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** جایگزین chrome.storage.local: هر کلید یک فایل JSON (رشته‌ی خام) در حافظه‌ی اپ. خواندن از حافظه، نوشتن روی دیسک پس‌زمینه. */
final class Store {
    private final File dir;
    private final Map<String, String> mem = new HashMap<>();
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    Store(Context c) {
        dir = new File(c.getFilesDir(), "store");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        File[] fs = dir.listFiles();
        if (fs == null) return;
        for (File f : fs) {
            String n = f.getName();
            if (!n.endsWith(".json")) continue;
            try {
                String key = URLDecoder.decode(n.substring(0, n.length() - 5), "UTF-8");
                mem.put(key, new String(readAll(f), StandardCharsets.UTF_8));
            } catch (Exception ignored) {
            }
        }
    }

    private static byte[] readAll(File f) throws IOException {
        try (FileInputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int r;
            while ((r = in.read(buf)) > 0) out.write(buf, 0, r);
            return out.toByteArray();
        }
    }

    private File fileFor(String key) throws IOException {
        return new File(dir, URLEncoder.encode(key, "UTF-8") + ".json");
    }

    /** keys == null یعنی همه. خروجی: {"items":{key: "<json>"}} */
    synchronized String getJson(Iterable<String> keys) {
        JSONObject items = new JSONObject();
        try {
            if (keys == null) {
                for (Map.Entry<String, String> e : mem.entrySet()) items.put(e.getKey(), e.getValue());
            } else {
                for (String k : keys) {
                    String v = mem.get(k);
                    if (v != null) items.put(k, v);
                }
            }
            return new JSONObject().put("items", items).toString();
        } catch (JSONException e) {
            return "{\"items\":{}}";
        }
    }

    synchronized void set(final String key, final String json) {
        mem.put(key, json);
        io.execute(() -> {
            try (FileOutputStream out = new FileOutputStream(fileFor(key))) {
                out.write(json.getBytes(StandardCharsets.UTF_8));
            } catch (IOException ignored) {
            }
        });
    }

    synchronized void remove(final String key) {
        mem.remove(key);
        io.execute(() -> {
            try {
                //noinspection ResultOfMethodCallIgnored
                fileFor(key).delete();
            } catch (IOException ignored) {
            }
        });
    }

    synchronized void clear() {
        mem.clear();
        io.execute(() -> {
            File[] fs = dir.listFiles();
            if (fs == null) return;
            for (File f : fs) //noinspection ResultOfMethodCallIgnored
                f.delete();
        });
    }
}
