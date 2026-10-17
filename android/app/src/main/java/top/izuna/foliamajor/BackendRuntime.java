package top.izuna.foliamajor;

import android.content.Context;
import android.content.res.AssetManager;
import android.util.Log;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.concurrent.CompletableFuture;

// Owns one Node runtime per app process, independently of Activity recreation.
final class BackendRuntime {
    private static CompletableFuture<Integer> startup;
    private static String token;
    private static volatile Integer exitCode;
    private static native int startNode(String[] arguments);

    // Uses API-24-compatible streams rather than newer java.nio convenience methods.
    static byte[] readBytes(InputStream input) throws java.io.IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int length;
        while ((length = input.read(buffer)) != -1) output.write(buffer, 0, length);
        return output.toByteArray();
    }

    static synchronized String token() { return token; }

    static synchronized CompletableFuture<Integer> ensureStarted(Context context) {
        if (startup != null) return startup;
        Context app = context.getApplicationContext();
        startup = CompletableFuture.supplyAsync(() -> {
            try {
                System.loadLibrary("node");
                System.loadLibrary("folia_node");
                AssetManager assets = app.getAssets();
                JSONObject manifest;
                try (var input = assets.open("folia-backend/manifest.json")) {
                    manifest = new JSONObject(new String(readBytes(input), StandardCharsets.UTF_8));
                }
                String buildId = manifest.getString("buildId");
                if (!buildId.matches("[a-f0-9]{64}")) throw new IllegalStateException("Invalid backend manifest");
                File code = new File(app.getNoBackupFilesDir(), "folia-backend/" + buildId);
                if (!new File(code, ".ready").isFile()) {
                    JSONArray files = manifest.getJSONArray("files");
                    for (int i = 0; i < files.length(); i++) {
                        String relative = files.getString(i);
                        File destination = new File(code, relative);
                        if (!destination.getCanonicalPath().startsWith(code.getCanonicalPath() + File.separator)) {
                            throw new IllegalStateException("Unsafe backend asset path");
                        }
                        File parent = destination.getParentFile();
                        if (!parent.isDirectory() && !parent.mkdirs()) throw new IllegalStateException("Cannot create backend directory");
                        try (var input = assets.open("folia-backend/" + relative); var output = new FileOutputStream(destination)) {
                            byte[] buffer = new byte[8192];
                            int length;
                            while ((length = input.read(buffer)) != -1) output.write(buffer, 0, length);
                        }
                    }
                    try (var output = new FileOutputStream(new File(code, ".ready"))) {
                        output.write(buildId.getBytes(StandardCharsets.UTF_8));
                    }
                }
                File data = new File(app.getNoBackupFilesDir(), "folia-backend-data");
                if (!data.isDirectory() && !data.mkdirs()) throw new IllegalStateException("Cannot create backend data directory");
                File state = new File(data, "runtime-state.json");
                if (state.exists() && !state.delete()) throw new IllegalStateException("Cannot clear stale backend state");
                byte[] secret = new byte[32];
                new SecureRandom().nextBytes(secret);
                StringBuilder hex = new StringBuilder();
                for (byte value : secret) hex.append(String.format("%02x", value & 255));
                synchronized (BackendRuntime.class) { token = hex.toString(); }
                Thread thread = new Thread(() -> {
                    int result = startNode(new String[]{"node", new File(code, "main.cjs").getAbsolutePath(), data.getAbsolutePath(), token});
                    exitCode = result;
                    Log.e("FoliaBackend", "Embedded runtime exited: " + result);
                }, "FoliaNode");
                thread.start();
                long deadline = System.currentTimeMillis() + 60_000;
                while (System.currentTimeMillis() < deadline) {
                    if (exitCode != null) throw new IllegalStateException("Embedded runtime exited: " + exitCode);
                    if (state.isFile()) {
                        JSONObject status;
                        try (var input = new FileInputStream(state)) {
                            status = new JSONObject(new String(readBytes(input), StandardCharsets.UTF_8));
                        }
                        int port = status.getInt("port");
                        if (port > 0 && port <= 65535) return port;
                    }
                    Thread.sleep(100);
                }
                throw new IllegalStateException("Embedded backend startup timed out");
            } catch (Exception | UnsatisfiedLinkError error) {
                Log.e("FoliaBackend", "Cannot start embedded backend", error);
                throw new IllegalStateException("Cannot start embedded music backend", error);
            }
        });
        return startup;
    }
}
