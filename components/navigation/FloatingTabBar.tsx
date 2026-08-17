import * as React from 'react';
import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    interpolate,
} from 'react-native-reanimated';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';
import { GlassTabBar } from '../../constants/glassmorphism';
import { lightImpact } from '../../lib/haptics';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity) as any;

function TabItem({
    route,
    index,
    isFocused,
    options,
    onPress,
    onLongPress,
}: {
    route: any;
    index: number;
    isFocused: boolean;
    options: any;
    onPress: () => void;
    onLongPress: () => void;
}) {
    const Icon = options.tabBarIcon;
    const label =
        options.tabBarLabel !== undefined
            ? options.tabBarLabel
            : options.title !== undefined
                ? options.title
                : route.name;

    // Per-tab animation values
    const focusProgress = useSharedValue(isFocused ? 1 : 0);
    const scaleVal = useSharedValue(1);

    React.useEffect(() => {
        focusProgress.value = withSpring(isFocused ? 1 : 0, {
            damping: 18,
            stiffness: 200,
            mass: 0.8,
        });
    }, [isFocused]);

    const handlePressIn = () => {
        scaleVal.value = withSpring(0.88, { damping: 12, stiffness: 260 });
    };
    const handlePressOut = () => {
        scaleVal.value = withSpring(1, { damping: 10, stiffness: 180 });
    };

    const highlightStyle = useAnimatedStyle(() => {
        const scale = interpolate(focusProgress.value, [0, 1], [0.6, 1]);
        const opacity = interpolate(focusProgress.value, [0, 1], [0, 1]);
        const width = interpolate(focusProgress.value, [0, 1], [32, 52]);
        const height = interpolate(focusProgress.value, [0, 1], [32, 42]);
        return {
            opacity,
            transform: [{ scale }],
            width,
            height,
            borderRadius: 21,
        };
    });

    const dotStyle = useAnimatedStyle(() => {
        const opacity = interpolate(focusProgress.value, [0, 1], [0, 1]);
        const scaleD = interpolate(focusProgress.value, [0, 1], [0, 1]);
        return {
            opacity,
            transform: [{ scale: scaleD }],
        };
    });

    const iconContainerStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scaleVal.value }],
    }));

    const labelStyle = useAnimatedStyle(() => ({
        opacity: interpolate(focusProgress.value, [0, 1], [0, 1]),
        transform: [{ translateY: interpolate(focusProgress.value, [0, 1], [4, 0]) }],
    }));

    if (options.href === null) return null;

    return (
        <AnimatedTouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            testID={options.tabBarTestID}
            onPress={onPress}
            onLongPress={onLongPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            style={styles.tabItem}
            activeOpacity={1}
        >
            <Animated.View style={[styles.iconHighlight, highlightStyle]}>
                <View style={StyleSheet.absoluteFill} />
            </Animated.View>

            <Animated.View style={[styles.iconWrapper, iconContainerStyle]}>
                {Icon && Icon({
                    focused: isFocused,
                    color: isFocused ? Colors.emerald[300] : Colors.neutral[500],
                    size: 22,
                })}
            </Animated.View>

            <Animated.Text style={[styles.label, labelStyle]} maxFontSizeMultiplier={1.15}>
                {typeof label === 'string' ? label : ''}
            </Animated.Text>

            <Animated.View style={[styles.activeDot, dotStyle]} />
        </AnimatedTouchableOpacity>
    );
}

export default function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
    // Active pill position between visible tabs.
    const pillX = useSharedValue(0);
    const tabCount = state.routes.filter(r => (descriptors[r.key].options as any).href !== null).length;

    const visibleRoutes = state.routes.filter(r => (descriptors[r.key].options as any).href !== null);

    React.useEffect(() => {
        const visibleIndex = visibleRoutes.findIndex(r => r.key === state.routes[state.index]?.key);
        if (visibleIndex >= 0) {
            pillX.value = withSpring(visibleIndex, {
                damping: 22,
                stiffness: 220,
                mass: 0.7,
            });
        }
    }, [state.index, visibleRoutes.length]);

    return (
        <View style={[styles.container, Platform.OS === 'android' && styles.containerElevation]}>
            {/* Background layer */}
            {Platform.OS === 'ios' ? (
                <BlurView
                    intensity={GlassTabBar.blurProps?.intensity}
                    tint={GlassTabBar.blurProps?.tint}
                    style={StyleSheet.absoluteFill}
                />
            ) : (
                <View style={[StyleSheet.absoluteFill, styles.androidFallback]} />
            )}

            {/* Inner border glow ring */}
            <View style={styles.innerRing} />

            {/* Tab items */}
            <View style={styles.content}>
                {visibleRoutes.map((route, visibleIndex) => {
                    const options = descriptors[route.key].options as any;
                    const isFocused = state.routes[state.index]?.key === route.key;

                    const onPress = () => {
                        const event = navigation.emit({
                            type: 'tabPress',
                            target: route.key,
                            canPreventDefault: true,
                        });
                        if (!isFocused && !event.defaultPrevented) {
                            lightImpact();
                            navigation.navigate(route.name, route.params);
                        }
                    };

                    const onLongPress = () => {
                        navigation.emit({
                            type: 'tabLongPress',
                            target: route.key,
                        });
                    };

                    return (
                        <TabItem
                            key={route.key}
                            route={route}
                            index={visibleIndex}
                            isFocused={isFocused}
                            options={options}
                            onPress={onPress}
                            onLongPress={onLongPress}
                        />
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: Spacing.lg,
        left: Spacing.xl,
        right: Spacing.xl,
        height: 72,
        borderRadius: BorderRadius.xl,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(148, 163, 184, 0.18)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.28,
        shadowRadius: 18,
    },
    containerElevation: {
        // High elevations force an expensive shadow pass on Android; 8 keeps
        // the lift visible at a fraction of the overdraw cost of 24.
        elevation: 8,
    },
    androidFallback: {
        backgroundColor: 'rgba(8, 13, 24, 0.97)',
    },
    innerRing: {
        position: 'absolute',
        top: 1,
        left: 1,
        right: 1,
        bottom: 1,
        borderRadius: BorderRadius.xl - 1,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.06)',
        pointerEvents: 'none',
    },
    content: {
        flexDirection: 'row',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingHorizontal: Spacing.sm,
    },
    tabItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        position: 'relative',
        paddingBottom: 8,
    },
    iconHighlight: {
        position: 'absolute',
        alignSelf: 'center',
        top: 12,
        backgroundColor: 'rgba(16, 185, 129, 0.16)',
        borderRadius: 21,
    },
    iconWrapper: {
        zIndex: 2,
        marginTop: 2,
    },
    label: {
        fontSize: 12,
        color: Colors.emerald[200],
        fontWeight: '700' as const,
        marginTop: 3,
        letterSpacing: 0,
        fontFamily: Typography.fontFamily.arabicBold,
        zIndex: 2,
        // Removed textTransform: 'uppercase' — breaks Arabic text rendering
    },
    activeDot: {
        position: 'absolute',
        bottom: 8,
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: Colors.emerald[300],
        shadowColor: Colors.emerald[300],
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 5,
    },
});
