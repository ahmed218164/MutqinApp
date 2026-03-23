/**
 * HifzCover — Sliding Memorization Paper
 *
 * A full-width draggable cover that sits on top of the Mushaf page, simulating
 * a physical piece of paper the student slides up/down to reveal or hide lines.
 *
 * Gesture: Pan on the bottom handle → moves cover bottom edge.
 * Physics: withSpring snap to 1/6-height increments on release.
 */

import * as React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import {
    Gesture,
    GestureDetector,
    GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    clamp,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const HANDLE_H = 40;    // height of the drag handle strip
const MIN_COVER = 56;    // minimum visible cover height (px)
const SNAP_DIVISIONS = 8;     // number of snap positions across the page
const SPRING = { damping: 22, stiffness: 220, mass: 0.9 };

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface HifzCoverProps {
    /** Height of the container (MushafPager area) in logical pixels. */
    containerHeight: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function HifzCover({ containerHeight }: HifzCoverProps) {
    const maxCover = containerHeight - HANDLE_H - 8;

    // Starting position: cover the bottom half of the page
    const coverH = useSharedValue(Math.round(containerHeight * 0.5));
    const startH = useSharedValue(coverH.value);

    // ── Gestures ──────────────────────────────────────────────────────────────

    const panGesture = Gesture.Pan()
        .onBegin(() => {
            startH.value = coverH.value;
        })
        .onUpdate((e) => {
            coverH.value = clamp(
                startH.value + e.translationY,
                MIN_COVER,
                maxCover
            );
        })
        .onEnd(() => {
            // Snap to nearest 1/SNAP_DIVISIONS of container height
            const step = containerHeight / SNAP_DIVISIONS;
            const snapped = Math.round(coverH.value / step) * step;
            coverH.value = withSpring(
                clamp(snapped, MIN_COVER, maxCover),
                SPRING
            );
        });

    // ── Animated styles ───────────────────────────────────────────────────────

    /** The opaque cover panel — grows/shrinks from the bottom of the page. */
    const coverStyle = useAnimatedStyle(() => ({
        height: coverH.value,
    }));

    /* The handle strip — tracks the bottom edge of the cover. */
    const handleStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: coverH.value - HANDLE_H / 2 }],
    }));

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <GestureHandlerRootView style={[styles.root, { height: containerHeight }]}>

            {/* ── Cover panel (from top) ── */}
            <Animated.View style={[styles.cover, coverStyle]}>
                <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />

                {/* Paper-style lines for visual feedback */}
                <View style={styles.paperLines} pointerEvents="none">
                    {[...Array(12)].map((_, i) => (
                        <View key={i} style={styles.paperLine} />
                    ))}
                </View>

                {/* Subtle label at top of cover */}
                <View style={styles.labelRow}>
                    <Text style={styles.labelText}>📖  غطاء الحفظ — اسحب الحافة ↕</Text>
                </View>
            </Animated.View>

            {/* ── Drag Handle (sits at bottom edge of cover) ── */}
            <GestureDetector gesture={panGesture}>
                <Animated.View style={[styles.handle, handleStyle]}>
                    {/* Decorative pill */}
                    <View style={styles.handlePill} />
                    {/* Grip dots */}
                    <View style={styles.gripRow}>
                        {[...Array(5)].map((_, i) => (
                            <View key={i} style={styles.gripDot} />
                        ))}
                    </View>
                </Animated.View>
            </GestureDetector>

        </GestureHandlerRootView>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    root: {
        ...StyleSheet.absoluteFillObject,
        top: 0,
        left: 0,
        right: 0,
        pointerEvents: 'box-none',
    },
    cover: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        overflow: 'hidden',
        // Fallback background if BlurView is unavailable
        backgroundColor: 'rgba(15, 23, 42, 0.82)',
    },
    paperLines: {
        position: 'absolute',
        top: 36,
        left: 0,
        right: 0,
        bottom: 0,
        gap: 32,
        paddingHorizontal: 24,
    },
    paperLine: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.07)',
    },
    labelRow: {
        position: 'absolute',
        top: 8,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    labelText: {
        color: 'rgba(255,255,255,0.45)',
        fontSize: 12,
        fontWeight: '500',
        letterSpacing: 0.3,
    },
    handle: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: HANDLE_H,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(30, 41, 59, 0.92)',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderBottomLeftRadius: 2,
        borderBottomRightRadius: 2,
        // Subtle shadow so it "floats" over the Mushaf
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
        elevation: 10,
        gap: 4,
    },
    handlePill: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.35)',
        marginBottom: 2,
    },
    gripRow: {
        flexDirection: 'row',
        gap: 5,
    },
    gripDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
});
