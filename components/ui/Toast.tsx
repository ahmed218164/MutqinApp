/**
 * components/ui/Toast.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Lightweight non-blocking toast notifications (replaces most Alert.alert calls
 * that were mere notifications, not confirmations).
 *
 * Usage:
 *   1. Mount <ToastProvider> once near the app root (inside _layout).
 *   2. Call from ANYWHERE (components, hooks, even plain lib modules):
 *        import { toast } from '../components/ui/Toast';
 *        toast.success('تم الحفظ');
 *        toast.error('فشل الاتصال');
 *        toast.info('أنت غير متصل');
 *
 * Design: dark glass card, colored accent icon, Arabic font, slides in from
 * the top below the status bar, auto-dismisses. Accessibility-aware.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import * as React from 'react';
import { StyleSheet, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSpring,
    withDelay,
    runOnJS,
    Easing,
} from 'react-native-reanimated';
import { CheckCircle2, XCircle, Info } from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import { lightImpact } from '../../lib/haptics';

export type ToastType = 'success' | 'error' | 'info';

interface ToastOptions {
    /** Message body (Arabic UI text). */
    message: string;
    type?: ToastType;
    /** Time until auto-dismiss (ms). Default 3000. */
    duration?: number;
}

// ── Global singleton bridge ──────────────────────────────────────────────────
// Lets non-React modules (hooks, lib services) trigger toasts without context.
let globalShow: ((options: ToastOptions) => void) | null = null;

export const toast = {
    show(options: ToastOptions) {
        globalShow?.(options);
    },
    success(message: string, duration?: number) {
        globalShow?.({ message, type: 'success', duration });
    },
    error(message: string, duration?: number) {
        globalShow?.({ message, type: 'error', duration: duration ?? 4000 });
    },
    info(message: string, duration?: number) {
        globalShow?.({ message, type: 'info', duration });
    },
};

// ── Visual config ─────────────────────────────────────────────────────────────
const TOAST_CONFIG: Record<ToastType, {
    icon: typeof Info;
    color: string;
}> = {
    success: { icon: CheckCircle2, color: Colors.emerald[400] },
    error: { icon: XCircle, color: Colors.error },
    info: { icon: Info, color: Colors.gold[400] },
};

interface ActiveToast extends Required<Omit<ToastOptions, 'duration'>> {
    duration: number;
    id: number;
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function ToastProvider({ children }: { children: React.ReactNode }) {
    const insets = useSafeAreaInsets();
    const [active, setActive] = React.useState<ActiveToast | null>(null);
    const idRef = React.useRef(0);
    const hideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const translateY = useSharedValue(-120);
    const opacity = useSharedValue(0);

    const hide = React.useCallback(() => {
        opacity.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.quad) });
        translateY.value = withTiming(-120, { duration: 240, easing: Easing.in(Easing.quad) });
    }, []);

    const show = React.useCallback((options: ToastOptions) => {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        const id = ++idRef.current;
        const next: ActiveToast = {
            message: options.message,
            type: options.type ?? 'info',
            duration: options.duration ?? 3000,
            id,
        };
        setActive(next);
        lightImpact();

        // Slide in on the UI thread, then schedule auto-dismiss.
        translateY.value = -120;
        opacity.value = 0;
        translateY.value = withSpring(0, { damping: 16, stiffness: 220, mass: 0.7 });
        opacity.value = withTiming(1, { duration: 160 });

        hideTimerRef.current = setTimeout(() => {
            hide();
            // Give the exit animation time before clearing state.
            setTimeout(() => {
                setActive(prev => (prev?.id === id ? null : prev));
            }, 300);
        }, next.duration);
    }, [hide]);

    React.useEffect(() => {
        globalShow = show;
        return () => {
            globalShow = null;
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        };
    }, [show]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
        opacity: opacity.value,
    }));

    const config = active ? TOAST_CONFIG[active.type] : TOAST_CONFIG.info;
    const Icon = config.icon;

    return (
        <>
            {children}
            {active && (
                <Animated.View
                    key={active.id}
                    pointerEvents="none"
                    accessibilityLiveRegion="polite"
                    accessibilityRole="alert"
                    style={[
                        styles.toast,
                        animatedStyle,
                        { top: insets.top + 12 },
                    ]}
                >
                    <View style={styles.toastInner}>
                        <Icon size={22} color={config.color} />
                        <Text
                            style={styles.message}
                            numberOfLines={4}
                            maxFontSizeMultiplier={1.4}
                        >
                            {active.message}
                        </Text>
                    </View>
                    <View style={[styles.accentBar, { backgroundColor: config.color }]} />
                </Animated.View>
            )}
        </>
    );
}

const styles = StyleSheet.create({
    toast: {
        position: 'absolute',
        start: Spacing.lg,
        end: Spacing.lg,
        borderRadius: BorderRadius.lg,
        backgroundColor: Platform.OS === 'android' ? 'rgba(8, 13, 24, 0.97)' : 'rgba(15, 23, 42, 0.92)',
        borderWidth: 1,
        borderColor: 'rgba(148, 163, 184, 0.18)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 18,
        elevation: 10,
        overflow: 'hidden',
        zIndex: 9999,
    },
    toastInner: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.base,
        paddingVertical: Spacing.md,
    },
    message: {
        flex: 1,
        fontSize: Typography.fontSize.sm,
        lineHeight: 22,
        color: Colors.text.inverse,
        fontFamily: Typography.fontFamily.arabic,
        textAlign: 'right',
        fontWeight: '500',
    },
    accentBar: {
        position: 'absolute',
        top: Spacing.sm,
        bottom: Spacing.sm,
        start: 0,
        width: 3,
        borderRadius: 2,
    },
});
