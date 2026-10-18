import { useEffect } from 'react';
import { StatusBar, Style } from '@capacitor/status-bar';
import { registerPlugin } from '@capacitor/core';
import { isAndroidRuntime } from '../../../services/android/backendFetch';
import { useAppViewStore } from '../../../stores/useAppViewStore';
import './androidShell.css';

// Keeps Android system bars and edge-to-edge safe areas aligned with the app theme.
const shell = registerPlugin<{ setPlayerView(options: { active: boolean; }): Promise<void>; }>('FoliaShell');

export function useAndroidShell(isDaylight: boolean): void {
    const currentView = useAppViewStore(state => state.view);

    useEffect(() => {
        if (!isAndroidRuntime()) return;
        const setPlayerView = (active: boolean) => {
            void shell.setPlayerView({ active }).catch(error => console.warn('[Android] Cannot configure fullscreen playback', error));
        };
        setPlayerView(currentView === 'player');
        return () => setPlayerView(false);
    }, [currentView]);

    useEffect(() => {
        if (!isAndroidRuntime()) return;
        document.documentElement.dataset.runtime = 'capacitor-android';
        void StatusBar.setOverlaysWebView({ overlay: true }).catch(error => console.warn('[Android] Cannot configure system bars', error));
        void StatusBar.setStyle({ style: isDaylight ? Style.Dark : Style.Light }).catch(error => console.warn('[Android] Cannot set system bar style', error));
    }, [isDaylight]);
}
