import { ViewStyle, Platform } from 'react-native';
import { BlurViewProps } from 'expo-blur';

// ✨ Glassmorphism Design System for Mutqin 2026
// Uses native blur (expo-blur) where possible, falls back to translucent layers

interface GlassConfig {
    style: ViewStyle;
    blurProps?: Partial<BlurViewProps>;
}

// Basic glass style (common properties)
const baseGlassStyle: ViewStyle = {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
};

// Light glass card — for light backgrounds
export const GlassCard = {
    style: {
        ...baseGlassStyle,
        backgroundColor: Platform.OS === 'android' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.4)', // Fallback for Android or higher opacity for visibility
        borderColor: 'rgba(255, 255, 255, 0.45)',
        shadowColor: 'rgba(0, 0, 0, 0.06)',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 1,
        shadowRadius: 24,
        elevation: 6,
    } as ViewStyle,
    blurProps: {
        intensity: 80,
        tint: 'light',
    } as Partial<BlurViewProps>,
};

// Dark glass card — for dark backgrounds
export const GlassCardDark = {
    style: {
        ...baseGlassStyle,
        backgroundColor: Platform.OS === 'android' ? 'rgba(15, 23, 42, 0.9)' : 'rgba(15, 23, 42, 0.6)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        shadowColor: 'rgba(0, 0, 0, 0.25)',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 1,
        shadowRadius: 24,
        elevation: 8,
    } as ViewStyle,
    blurProps: {
        intensity: 60,
        tint: 'dark',
    } as Partial<BlurViewProps>,
};

// Glass card on gradient — for emerald/gold gradient backgrounds
export const GlassCardOnGradient = {
    style: {
        ...baseGlassStyle,
        backgroundColor: Platform.OS === 'android' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.15)',
        borderColor: 'rgba(255, 255, 255, 0.25)',
        shadowColor: 'rgba(0, 0, 0, 0.15)',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 16,
        elevation: 4,
    } as ViewStyle,
    blurProps: {
        intensity: 40,
        tint: 'default',
    } as Partial<BlurViewProps>,
};

// Frosted glass for headers/tab bars
export const GlassHeader = {
    style: {
        ...baseGlassStyle,
        backgroundColor: 'rgba(4, 47, 46, 0.75)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.1)',
        shadowColor: 'rgba(0, 0, 0, 0.2)',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 16,
        elevation: 8,
    } as ViewStyle,
    blurProps: {
        intensity: 90,
        tint: 'dark',
    } as Partial<BlurViewProps>,
};

// Glass tab bar
export const GlassTabBar = {
    style: {
        ...baseGlassStyle,
        backgroundColor: 'rgba(4, 47, 46, 0.85)',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.1)',
        shadowColor: 'rgba(0, 0, 0, 0.3)',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 1,
        shadowRadius: 20,
        elevation: 12,
    } as ViewStyle,
    blurProps: {
        intensity: 95,
        tint: 'dark',
    } as Partial<BlurViewProps>,
};
