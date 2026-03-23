/**
 * components/ui/NetworkBanner.tsx
 *
 * Elegant offline/online banner displayed at the top of the screen.
 * Uses NetworkProvider to detect connectivity state.
 */

import * as React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSpring,
} from 'react-native-reanimated';
import { useNetwork } from '../../lib/network';
import { Colors, Typography } from '../../constants/theme';

export default function NetworkBanner() {
    const { isOnline, showOfflineBanner } = useNetwork();
    const translateY = useSharedValue(-60);
    const opacity = useSharedValue(0);

    const [wasOffline, setWasOffline] = React.useState(false);
    const [showOnlineMsg, setShowOnlineMsg] = React.useState(false);

    React.useEffect(() => {
        if (!isOnline) {
            setWasOffline(true);
            setShowOnlineMsg(false);
            // Slide down
            translateY.value = withSpring(0, { damping: 18, stiffness: 180 });
            opacity.value = withTiming(1, { duration: 300 });
        } else if (wasOffline) {
            // Was offline → now online → show success briefly
            setShowOnlineMsg(true);
            translateY.value = withSpring(0, { damping: 18, stiffness: 180 });
            opacity.value = withTiming(1, { duration: 300 });

            const timer = setTimeout(() => {
                hideBanner();
                setWasOffline(false);
                setShowOnlineMsg(false);
            }, 2500);
            return () => clearTimeout(timer);
        }
    }, [isOnline]);

    function hideBanner() {
        translateY.value = withTiming(-60, { duration: 350 });
        opacity.value = withTiming(0, { duration: 350 });
    }

    const animStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
        opacity: opacity.value,
    }));

    if (isOnline && !showOnlineMsg) return null;

    const isOffline = !isOnline;

    return (
        <Animated.View
            style={[styles.banner, isOffline ? styles.offlineBanner : styles.onlineBanner, animStyle]}
            pointerEvents="none"
        >
            <Text style={styles.icon}>{isOffline ? '📡' : '✅'}</Text>
            <Text style={styles.text}>
                {isOffline
                    ? 'أنت غير متصل — ميزات التحليل معطّلة مؤقتاً'
                    : 'عاد الاتصال — سيتم إرسال التسجيلات المعلّقة'}
            </Text>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    banner: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 44 : 24,
        left: 16,
        right: 16,
        zIndex: 9999,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 14,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 10,
    },
    offlineBanner: {
        backgroundColor: '#1f1f1f',
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.4)',
    },
    onlineBanner: {
        backgroundColor: '#0d2e1f',
        borderWidth: 1,
        borderColor: 'rgba(16,185,129,0.4)',
    },
    icon: {
        fontSize: 18,
    },
    text: {
        flex: 1,
        fontSize: Typography.fontSize.sm,
        color: '#e5e7eb',
        fontFamily: 'NotoNaskhArabic_400Regular',
        textAlign: 'right',
        writingDirection: 'rtl',
    },
});
