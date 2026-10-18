package top.izuna.foliamajor;

import android.content.res.Configuration;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Landscape playback hides both system bars; rotation and app resume reapply the current policy.
@CapacitorPlugin(name = "FoliaShell")
public class FoliaShellPlugin extends Plugin {
    private boolean playerView = false;

    @PluginMethod
    public void setPlayerView(PluginCall call) {
        boolean active = Boolean.TRUE.equals(call.getBoolean("active", false));
        getActivity().runOnUiThread(() -> {
            playerView = active;
            applySystemBars();
            call.resolve();
        });
    }

    private void applySystemBars() {
        Window window = getActivity().getWindow();
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        boolean landscape = getActivity().getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        if (playerView && landscape) {
            controller.hide(WindowInsetsCompat.Type.systemBars());
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars());
        }
    }

    @Override
    protected void handleOnConfigurationChanged(Configuration newConfig) {
        applySystemBars();
    }

    @Override
    protected void handleOnResume() {
        applySystemBars();
    }
}
