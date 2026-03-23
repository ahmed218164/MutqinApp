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

    // Morphing highlight pill behind the icon
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

    // Active glowing dot below icon
    const dotStyle = useAnimatedStyle(() => {
        const opacity = interpolate(focusProgress.value, [0, 1], [0, 1]);
        const scaleD = interpolate(focusProgress.value, [0, 1], [0, 1]);
        return {
            opacity,
            transform: [{ scale: scaleD }],
        };
    });

    // Icon color interpolation (gold when active, muted when not)
    const iconContainerStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scaleVal.value }],
    }));

    // Label opacity
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
            {/* Glow halo behind active tab */}
            {Platform.OS === 'ios' && (
                <Animated.View
                    style={[
                        styles.glowHalo,
                        highlightStyle,
                    ]}
                />
            )}

            {/* Morphing highlight pill (visible on Android too) */}
            <Animated.View style={[styles.iconHighlight, highlightStyle]}>
                <View style={StyleSheet.absoluteFill} />
            </Animated.View>

            {/* Icon */}
            <Animated.View style={[styles.iconWrapper, iconContainerStyle]}>
                {Icon && Icon({
                    focused: isFocused,
                    color: isFocused ? Colors.gold[400] : Colors.neutral[500],
                    size: 22,
                })}
            </Animated.View>

            {/* Label fades in below icon for active tab */}
            <Animated.Text style={[styles.label, labelStyle]}>
                {typeof label === 'string' ? label : ''}
            </Animated.Text>

            {/* Glowing active indicator dot */}
            <Animated.View style={[styles.activeDot, dotStyle]} />
        </AnimatedTouchableOpacity>
    );
}

export default function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
    // Sliding "active pill" that moves between tabs — "Dynamic Island" morphing pill
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
        borderRadius: BorderRadius['3xl'],
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(52, 211, 153, 0.18)', // subtle emerald border
        // Soft glow shadow
        shadowColor: Colors.emerald[400],
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
    },
    containerElevation: {
        elevation: 24,
    },
    androidFallback: {
        backgroundColor: 'rgba(4, 47, 46, 0.97)',
    },
    innerRing: {
        position: 'absolute',
        top: 1,
        left: 1,
        right: 1,
        bottom: 1,
        borderRadius: BorderRadius['3xl'] - 1,
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
    glowHalo: {
        position: 'absolute',
        top: '50%',
        alignSelf: 'center',
        marginTop: -18,
        backgroundColor: 'rgba(251, 191, 36, 0.12)',
        borderRadius: 21,
    },
    iconHighlight: {
        position: 'absolute',
        alignSelf: 'center',
        top: 12,
        backgroundColor: 'rgba(251, 191, 36, 0.14)',
        borderRadius: 21,
    },
    iconWrapper: {
        zIndex: 2,
        marginTop: 2,
    },
    label: {
        fontSize: 10.5,
        color: Colors.gold[400],
        fontWeight: '700' as const,
        marginTop: 3,
        letterSpacing: 0.1,
        zIndex: 2,
        // Removed textTransform: 'uppercase' — breaks Arabic text rendering
    },
    activeDot: {
        position: 'absolute',
        bottom: 8,
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: Colors.gold[400],
        // Small shadow on the dot itself
        shadowColor: Colors.gold[400],
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 5,
    },
});
