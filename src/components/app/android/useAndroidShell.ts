import { useEffect } from 'react';
import { StatusBar, Style } from '@capacitor/status-bar';
import { isAndroidRuntime } from '../../../services/android/backendFetch';
import './androidShell.css';

// Keeps Android system bars and edge-to-edge safe areas aligned with the app theme.
export function useAndroidShell(isDaylight: boolean): void {
    useEffect(() => {
        if (!isAndroidRuntime()) return;
        document.documentElement.dataset.runtime = 'capacitor-android';
        void StatusBar.setOverlaysWebView({ overlay: true }).catch(error => console.warn('[Android] Cannot configure system bars', error));
        void StatusBar.setStyle({ style: isDaylight ? Style.Dark : Style.Light }).catch(error => console.warn('[Android] Cannot set system bar style', error));
    }, [isDaylight]);
}
