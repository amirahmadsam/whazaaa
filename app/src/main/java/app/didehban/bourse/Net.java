package app.didehban.bourse;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Pattern;

/** درخواست‌های شبکه‌ی اپ (جایگزین fetch در background.js افزونه؛ بدون CORS). فقط نشانی‌های مجازِ همان افزونه. */
final class Net {
    static final String DESKTOP_UA =
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

    private static final Pattern TSETMC_API = Pattern.compile("^https://cdn\\.tsetmc\\.(com|ir)/api/");
    private static final Pattern CODAL_SEARCH = Pattern.compile("^https://search\\.codal\\.ir/api/search/v2/q\\?");
    private static final Pattern CODAL_ANY = Pattern.compile("^https://([a-z0-9-]+\\.)*codal\\.ir/", Pattern.CASE_INSENSITIVE);
    private static final int MAX_BYTES = 30 * 1024 * 1024;

    static final class Resp {
        int status;
        byte[] body = new byte[0];
        String err;
    }

    static boolean allowedJson(String kind, String url) {
        if ("fetch".equals(kind)) return TSETMC_API.matcher(url).find();
        if ("codal".equals(kind)) return CODAL_SEARCH.matcher(url).find();
        return false;
    }

    static boolean allowedBin(String url) {
        return CODAL_ANY.matcher(url).find();
    }

    static Resp get(String url, String accept) {
        Resp r = new Resp();
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(20000);
            c.setReadTimeout(60000);
            c.setRequestMethod("GET");
            c.setRequestProperty("User-Agent", DESKTOP_UA);
            c.setRequestProperty("Accept-Language", "fa-IR,fa;q=0.9,en;q=0.5");
            if (accept != null) c.setRequestProperty("Accept", accept);
            if (url.contains("codal.ir")) {
                c.setRequestProperty("Origin", "https://codal.ir");
                c.setRequestProperty("Referer", "https://codal.ir/");
            }
            r.status = c.getResponseCode();
            InputStream in = r.status >= 400 ? c.getErrorStream() : c.getInputStream();
            if (in != null) {
                try {
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buf = new byte[16384];
                    int n, total = 0;
                    while ((n = in.read(buf)) > 0) {
                        total += n;
                        if (total > MAX_BYTES) throw new IOException("پاسخ بیش از حد بزرگ است");
                        out.write(buf, 0, n);
                    }
                    r.body = out.toByteArray();
                } finally {
                    in.close();
                }
            }
        } catch (Exception e) {
            r.err = String.valueOf(e);
        } finally {
            if (c != null) c.disconnect();
        }
        return r;
    }
}
