import * as React from 'react';
import { StyleSheet, TouchableOpacity, ViewStyle, StyleProp, Platform, View, ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSpring,
    withRepeat,
    withSequence,
    interpolate,
    Easing,
} from 'react-native-reanimated';
import { Colors, BorderRadius, Spacing, Shadows } from '../../constants/theme';
import { GlassCard, GlassCardDark, GlassCardOnGradient } from '../../constants/glassmorphism';
import { lightImpact } from '../../lib/haptics';

interface CardProps extends ViewProps {
    children?: React.ReactNode;
    onPress?: () => void;
    style?: StyleProp<ViewStyle>;
    variant?: 'default' | 'gradient' | 'outlined' | 'glass' | 'glassDark';
    animated?: boolean;
    delay?: number; // stagger delay for list items
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity) as any;

export default function Card({
    children,
    onPress,
    style,
    variant = 'default',
    animated = true,
    delay = 0,
    ...props
}: CardProps) {
    // Entrance animation
    const fadeAnim = useSharedValue(animated ? 0 : 1);
    const translateY = useSharedValue(animated ? 18 : 0);
    // Press feedback
    const scaleAnim = useSharedValue(1);
    // Glow border pulse
    const glowAnim = useSharedValue(0);

    React.useEffect(() => {
        if (animated) {
            setTimeout(() => {
                fadeAnim.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) });
                translateY.value = withTiming(0, { duration: 380, easing: Easing.out(Easing.cubic) });
            }, delay);
        }

        // Removed the infinite breathing glow pulse here for massive performance improvements.
        // It's causing continuous re-rendering and JS thread locking across all Glass Cards.
    }, [animated, variant, delay]);

    const handlePressIn = () => {
        scaleAnim.value = withSpring(0.97, { damping: 14, stiffness: 180 });
    };

    const handlePressOut = () => {
        scaleAnim.value = withSpring(1, { damping: 10, stiffness: 120 });
    };

    const isGlass = variant === 'glass' || variant === 'glassDark' || variant === 'gradient';

    const getGlassConfig = () => {
        switch (variant) {
            case 'glass': return GlassCard;
            case 'glassDark': return GlassCardDark;
            case 'gradient': return GlassCardOnGradient;
            default: return null;
        }
    };

    const glassConfig = getGlassConfig();

    const getBaseStyle = () => {
        if (isGlass && glassConfig) {
            return glassConfig.style;
        }
        switch (variant) {
            case 'outlined': return styles.outlined;
            default: return styles.card;
        }
    };

    // ---- Animated Styles ----
    const entranceStyle = useAnimatedStyle(() => ({
        opacity: fadeAnim.value,
        transform: [{ translateY: translateY.value }] as any,
    }));

    const pressStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scaleAnim.value }],
    }));

    // Animated glowing border via shadow opacity on glass cards
    const glowBorderStyle = useAnimatedStyle(() => {
        if (!isGlass) return {};
        const isGoldVariant = variant === 'gradient';
        const shadowColor = isGoldVariant ? Colors.gold[400] : Colors.emerald[400];
        const glowOpacity = interpolate(glowAnim.value, [0, 1], [0.0, 0.55]);
        const glowRadius = interpolate(glowAnim.value, [0, 1], [12, 26]);

        return {
            shadowColor,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: glowOpacity,
            shadowRadius: glowRadius,
        };
    });

    const cardBaseStyle: StyleProp<ViewStyle>[] = [
        styles.base,
        getBaseStyle(),
        style as ViewStyle,
    ];

    const contentJsx = (
        <>
            {isGlass && glassConfig?.blurProps && Platform.OS !== 'android' ? (
                <BlurView
                    intensity={glassConfig.blurProps.intensity}
                    tint={glassConfig.blurProps.tint}
                    style={StyleSheet.absoluteFill}
                />
            ) : null}
            <View style={{ zIndex: 1 }}>{children}</View>
        </>
    );

    const AnimatedContainer = onPress ? AnimatedTouchableOpacity : Animated.View;
    const containerProps = onPress ? {
        onPress: () => { lightImpact(); onPress(); },
        onPressIn: handlePressIn,
        onPressOut: handlePressOut,
        activeOpacity: 0.9,
        accessibilityRole: 'button',
        accessible: true,
        hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
    } : {};

    return (
        <AnimatedContainer
            style={[
                ...cardBaseStyle,
                entranceStyle,
                pressStyle,
                glowBorderStyle,
            ]}
            {...containerProps}
            {...props}
        >
            {contentJsx}
        </AnimatedContainer>
    );
}

const styles = StyleSheet.create({
    base: {
        borderRadius: BorderRadius['2xl'],
        padding: Spacing.lg,
        // overflow removed here — glass variants add it explicitly via their own config
    },
    card: {
        backgroundColor: Colors.neutral[50],
        borderWidth: 1,
        borderColor: Colors.neutral[200],
        shadowColor: Shadows.base.shadowColor,
        shadowOffset: Shadows.base.shadowOffset,
        shadowOpacity: Shadows.base.shadowOpacity,
        shadowRadius: Shadows.base.shadowRadius,
        elevation: Shadows.base.elevation,
    },
    outlined: {
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderColor: Colors.emerald[200],
    },
});
