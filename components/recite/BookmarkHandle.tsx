/**
 * components/recite/BookmarkHandle.tsx
 *
 * A golden ribbon tab that appears on the right edge of the Mushaf
 * when the current page or surah is bookmarked.
 *
 * Reference: bookmark_handle logic from quran_image_fragment.xml
 *
 * Features:
 *   - Appears as a protruding gold ribbon tab on the right edge
 *   - Tapping it toggles the bookmark on/off
 *   - Animated entrance/exit with slide-in from the right
 *   - Shows the bookmark icon filled when active
 */

import * as React from 'react';
import {
    TouchableOpacity,
    StyleSheet,
    View,
    Text,
} from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    FadeIn,
    FadeOut,
} from 'react-native-reanimated';
import { Bookmark } from 'lucide-react-native';
import { mediumImpact } from '../../lib/haptics';

interface BookmarkHandleProps {
    /** Whether this page/surah is currently bookmarked */
    isBookmarked: boolean;
    /** Called when the ribbon is tapped to toggle bookmark */
    onToggle: () => void;
    /** Night mode — adjusts ribbon color */
    nightMode?: boolean;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export default function BookmarkHandle({
    isBookmarked,
    onToggle,
    nightMode = false,
}: BookmarkHandleProps) {
    const slideX = useSharedValue(isBookmarked ? 0 : 40);
    const scale = useSharedValue(1);

    React.useEffect(() => {
        slideX.value = withSpring(isBookmarked ? 0 : 40, {
            damping: 14,
            stiffness: 160,
        });
    }, [isBookmarked]);

    const animStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: slideX.value },
            { scale: scale.value },
        ],
    } as any));

    function handlePress() {
        mediumImpact();
        // Pulse animation
        scale.value = withSpring(1.15, { damping: 6 }, () => {
            scale.value = withSpring(1, { damping: 10 });
        });
        onToggle();
    }

    return (
        <AnimatedTouchable
            style={[
                styles.container,
                nightMode && styles.containerNight,
                animStyle,
            ]}
            onPress={handlePress}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={isBookmarked ? 'إزالة العلامة' : 'وضع علامة'}
        >
            {/* The ribbon shape */}
            <View style={[styles.ribbon, nightMode && styles.ribbonNight]}>
                <Bookmark
                    size={16}
                    color={isBookmarked ? '#D97706' : nightMode ? '#888' : '#B8860B'}
                    fill={isBookmarked ? '#D97706' : 'transparent'}
                />
            </View>

            {/* Ribbon tail notch — creates the V cut at the bottom */}
            <View style={[styles.ribbonTail, nightMode && styles.ribbonTailNight]} />
        </AnimatedTouchable>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        right: -4,
        top: '15%',
        zIndex: 20,
    },
    containerNight: {},
    ribbon: {
        width: 36,
        height: 52,
        backgroundColor: '#FDE68A',
        borderTopLeftRadius: 6,
        borderBottomLeftRadius: 0,
        alignItems: 'center',
        justifyContent: 'center',
        // Shadow for depth
        shadowColor: '#B8860B',
        shadowOffset: { width: -2, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    ribbonNight: {
        backgroundColor: '#44403C',
    },
    ribbonTail: {
        width: 0,
        height: 0,
        alignSelf: 'center',
        borderLeftWidth: 18,
        borderRightWidth: 18,
        borderTopWidth: 10,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: '#FDE68A',
    },
    ribbonTailNight: {
        borderTopColor: '#44403C',
    },
});
