import * as React from 'react';
import { TouchableOpacity, Text, StyleSheet, Animated, ViewStyle, TextStyle, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, BorderRadius, Shadows } from '../../constants/theme';
import { mediumImpact } from '../../lib/haptics';

 

interface GradientButtonProps {
    title: string;
    onPress: () => void;
    style?: ViewStyle;
    textStyle?: TextStyle;
    disabled?: boolean;
    variant?: 'primary' | 'secondary';
    colors?: readonly [string, string, string] | readonly string[];
    accessibilityLabel?: string;
}

export default function GradientButton({
    title,
    onPress,
    style,
    textStyle,
    disabled = false,
    variant = 'primary',
    colors,
    accessibilityLabel,
}: GradientButtonProps) {
    const scaleAnim = React.useRef(new Animated.Value(1)).current;

    const defaultColors = variant === 'primary'
        ? [Colors.emerald[600], Colors.emerald[700], Colors.emerald[800]]
        : [Colors.gold[500], Colors.gold[600], Colors.gold[700]];

    const gradientColors = colors || defaultColors;

    const handlePressIn = () => {
        if (disabled) return;
        mediumImpact();
        Animated.spring(scaleAnim, {
            toValue: 0.95,
            useNativeDriver: true,
            friction: 3,
            tension: 100,
        }).start();
    };

    const handlePressOut = () => {
        if (disabled) return;
        Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            friction: 3,
            tension: 100,
        }).start();
    };

    return (
        <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
            <TouchableOpacity
                onPress={onPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                disabled={disabled}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel={disabled ? `${title} (Disabled)` : (accessibilityLabel ?? title)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
                <LinearGradient
                    colors={disabled ? [Colors.neutral[300], Colors.neutral[400]] : (gradientColors as any)}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.gradient, disabled && styles.disabled]}
                >
                    <Text style={[styles.text, textStyle, disabled && styles.disabledText]}>
                        {title}
                    </Text>
                </LinearGradient>
            </TouchableOpacity>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    gradient: {
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: BorderRadius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        ...Shadows.md,
    },
    text: {
        color: Colors.neutral[50],
        fontSize: Typography.fontSize.base,
        fontWeight: '700',
    },
    disabled: {
        opacity: 0.5,
    },
    disabledText: {
        color: Colors.neutral[500],
    },
});
