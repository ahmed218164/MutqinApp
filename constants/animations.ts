import { Animated, Easing } from 'react-native';

// ✨ Animation System for Mutqin 2026

// Timing constants
export const AnimationDuration = {
    instant: 100,
    fast: 200,
    normal: 300,
    slow: 500,
    xslow: 800,
} as const;

// Spring configs for natural-feeling animations
export const SpringConfig = {
    gentle: { friction: 10, tension: 40 },
    bouncy: { friction: 6, tension: 80 },
    snappy: { friction: 8, tension: 120 },
    stiff: { friction: 12, tension: 200 },
} as const;

// Easing functions
export const AnimationEasing = {
    easeInOut: Easing.bezier(0.4, 0, 0.2, 1),
    easeOut: Easing.bezier(0, 0, 0.2, 1),
    easeIn: Easing.bezier(0.4, 0, 1, 1),
    sharp: Easing.bezier(0.4, 0, 0.6, 1),
    decelerate: Easing.out(Easing.ease),
    accelerate: Easing.in(Easing.ease),
} as const;

// Pre-built animation configs
export const FadeIn = {
    duration: AnimationDuration.normal,
    easing: AnimationEasing.easeOut,
};

export const ScalePress = {
    duration: AnimationDuration.fast,
    scale: 0.96,
};

export const SlideIn = {
    duration: AnimationDuration.normal,
    easing: AnimationEasing.easeOut,
};

// Stagger delay for list items
export const StaggerDelay = 50; // ms between each item

/**
 * Create a fade-in animation
 */
export function createFadeIn(animValue: Animated.Value, delay: number = 0) {
    return Animated.timing(animValue, {
        toValue: 1,
        duration: AnimationDuration.normal,
        delay,
        easing: AnimationEasing.easeOut,
        useNativeDriver: true,
    });
}

/**
 * Create a slide-up animation  
 */
export function createSlideUp(animValue: Animated.Value, delay: number = 0) {
    return Animated.timing(animValue, {
        toValue: 0,
        duration: AnimationDuration.normal,
        delay,
        easing: AnimationEasing.decelerate,
        useNativeDriver: true,
    });
}

/**
 * Create a spring scale animation
 */
export function createSpringScale(animValue: Animated.Value, toValue: number = 1) {
    return Animated.spring(animValue, {
        toValue,
        ...SpringConfig.bouncy,
        useNativeDriver: true,
    });
}

/**
 * Create a pulse animation (for notifications/badges)
 */
export function createPulse(animValue: Animated.Value) {
    return Animated.loop(
        Animated.sequence([
            Animated.timing(animValue, {
                toValue: 1.08,
                duration: 600,
                easing: AnimationEasing.easeInOut,
                useNativeDriver: true,
            }),
            Animated.timing(animValue, {
                toValue: 1,
                duration: 600,
                easing: AnimationEasing.easeInOut,
                useNativeDriver: true,
            }),
        ])
    );
}
