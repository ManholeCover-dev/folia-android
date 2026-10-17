package top.izuna.foliamajor;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import android.util.Base64;
import java.util.concurrent.Executors;

// Keeps the authenticated loopback service behind a native bridge, avoiding WebView CORS and mixed content.
@CapacitorPlugin(name = "FoliaBackend")
public class FoliaBackendPlugin extends Plugin {
    private final java.util.concurrent.ExecutorService requests = Executors.newFixedThreadPool(6);

    @PluginMethod
    public void request(PluginCall call) {
        String route = call.getString("path", "");
        String method = call.getString("method", "GET");
        if (!(route.startsWith("/netease/") || route.startsWith("/kugou/") || route.equals("/_health") || route.startsWith("/lyric-proxy?"))
                || route.contains("\\") || route.contains("#") || route.contains("\r") || route.contains("\n")
                || !(method.equals("GET") || method.equals("POST"))) {
            call.reject("Unsupported embedded backend request");
            return;
        }
        BackendRuntime.ensureStarted(getContext()).whenComplete((port, startupError) -> {
            if (startupError != null) {
                call.reject("Embedded music backend could not start", "BACKEND_START_FAILED");
                return;
            }
            requests.execute(() -> {
                HttpURLConnection connection = null;
                try {
                    URI uri = new URI("http://127.0.0.1:" + port + route);
                    if (!"127.0.0.1".equals(uri.getHost()) || uri.getPort() != port) throw new IllegalArgumentException("Invalid backend route");
                    connection = (HttpURLConnection) uri.toURL().openConnection();
                    connection.setInstanceFollowRedirects(false);
                    connection.setConnectTimeout(5_000);
                    connection.setReadTimeout(60_000);
                    connection.setRequestMethod(method);
                    JSObject headers = call.getObject("headers", new JSObject());
                    for (var iterator = headers.keys(); iterator.hasNext();) {
                        String name = iterator.next();
                        String normalized = name.toLowerCase(java.util.Locale.ROOT);
                        if (java.util.Arrays.asList("user-agent", "accept", "kg-rec", "kg-rc", "kg-clienttimems", "mid", "x-router").contains(normalized)) {
                            connection.setRequestProperty(name, headers.getString(name));
                        }
                    }
                    connection.setRequestProperty("X-Folia-Token", BackendRuntime.token());
                    if (method.equals("POST")) {
                        connection.setDoOutput(true);
                        connection.setRequestProperty("Content-Type", call.getString("contentType", "application/json"));
                        try (var output = connection.getOutputStream()) {
                            output.write(call.getString("body", "").getBytes(StandardCharsets.UTF_8));
                        }
                    }
                    int status = connection.getResponseCode();
                    byte[] body;
                    try (var input = status >= 400 ? connection.getErrorStream() : connection.getInputStream()) {
                        body = input == null ? new byte[0] : BackendRuntime.readBytes(input);
                    }
                    JSObject result = new JSObject();
                    result.put("status", status);
                    result.put("bodyBase64", Base64.encodeToString(body, Base64.NO_WRAP));
                    result.put("contentType", connection.getContentType());
                    result.put("retryAfter", connection.getHeaderField("Retry-After"));
                    call.resolve(result);
                } catch (Exception error) {
                    call.reject("Embedded music backend request failed", "BACKEND_REQUEST_FAILED", error);
                } finally {
                    if (connection != null) connection.disconnect();
                }
            });
        });
    }

    @Override
    protected void handleOnDestroy() {
        requests.shutdown();
    }
}
