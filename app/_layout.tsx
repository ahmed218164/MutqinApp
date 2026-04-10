import * as React from 'react';
import { Stack } from 'expo-router';
import { LogBox, View, I18nManager } from 'react-native';

// ── Force RTL layout for Arabic interface ────────────────────────────────────
// Must be called before any render — affects the entire app layout direction.
if (!I18nManager.isRTL) {
    I18nManager.forceRTL(true);
}
import { AuthProvider, useAuth } from '../lib/auth';
import { SettingsProvider } from '../lib/settings';
import { NetworkProvider } from '../lib/network';
import ErrorBoundary from '../components/ui/ErrorBoundary';
import NetworkBanner from '../components/ui/NetworkBanner';
import { registerForPushNotifications, savePushToken } from '../lib/notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { offlineQueue } from '../lib/offline-queue';
import { AyatSQLiteProvider } from '../lib/SQLiteProvider';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import TrackPlayer from 'react-native-track-player';
import { PlaybackService } from '../lib/playback-service';

// Register the RNTP background service.
// Must be called at module level (before any component renders).
// Safe to call multiple times — RNTP is idempotent here.
TrackPlayer.registerPlaybackService(() => PlaybackService);

// Keep the splash screen visible while fonts are loading
SplashScreen.preventAutoHideAsync();

// Audio session is configured inside RootLayout via useEffect
// so we can properly log errors and show recovery UI if needed.

// Ignore specific warnings
LogBox.ignoreLogs([
    'expo-notifications: Android Push notifications',
    'No route named "recite" exists'
]);

function NotificationSetup() {
    const { user } = useAuth();

    React.useEffect(() => {
        async function setupNotifications() {
            if (!user) return;
            const token = await registerForPushNotifications();
            if (token) {
                await savePushToken(user.id, token);
            }
        }
        setupNotifications();
    }, [user]);

    return null;
}

function OfflineQueueProcessor() {
    React.useEffect(() => {
        const interval = setInterval(() => {
            offlineQueue.processQueue().catch(console.error);
        }, 30000); // Process queue every 30 seconds

        return () => clearInterval(interval);
    }, []);

    return null;
}

export default function RootLayout() {
    const [fontsLoaded, fontError] = useFonts({
        // Noto Naskh Arabic — premium Arabic calligraphic font
        'NotoNaskhArabic_400Regular': require('../assets/fonts/NotoNaskhArabic-Regular.ttf'),
        'NotoNaskhArabic_700Bold': require('../assets/fonts/NotoNaskhArabic-Bold.ttf'),
    });

    const onLayoutRootView = React.useCallback(async () => {
        if (fontsLoaded || fontError) {
            await SplashScreen.hideAsync();
        }
    }, [fontsLoaded, fontError]);

    // TrackPlayer is initialized inside the audio engine's setup() call.
    // No separate audio session configuration needed — RNTP handles it
    // natively via ExoPlayer (Android) and AVQueuePlayer (iOS).

    // Don't render until fonts are ready (or failed)
    if (!fontsLoaded && !fontError) {
        return null;
    }

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
                <ErrorBoundary>
                    {/* AyatSQLiteProvider bootstraps ayat.db once from bundled assets,
                        then exposes a read-only SQLite instance via useAyatDB() */}
                    <AyatSQLiteProvider>
                        <SettingsProvider>
                            <NetworkProvider>
                                <NetworkBanner />
                                <AuthProvider>
                                    <NotificationSetup />
                                    <OfflineQueueProcessor />
                                    <Stack screenOptions={{ headerShown: false }}>
                                        <Stack.Screen name="login" />
                                        <Stack.Screen name="signup" />
                                        <Stack.Screen name="(tabs)" />
                                        <Stack.Screen name="settings" />
                                        <Stack.Screen name="search" />
                                    </Stack>
                                </AuthProvider>
                            </NetworkProvider>
                        </SettingsProvider>
                    </AyatSQLiteProvider>
                </ErrorBoundary>
            </View>
        </GestureHandlerRootView>
    );
}
