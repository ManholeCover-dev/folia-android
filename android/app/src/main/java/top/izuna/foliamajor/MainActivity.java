package top.izuna.foliamajor;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

// Registers the embedded backend before Capacitor creates its WebView bridge.
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FoliaBackendPlugin.class);
        super.onCreate(savedInstanceState);
        BackendRuntime.ensureStarted(getApplicationContext());
    }
}
