import * as React from 'react';
import { View, Animated, StyleSheet, ViewStyle, DimensionValue } from 'react-native';

interface SkeletonLoaderProps {
    width?: DimensionValue;
    height?: number;
    borderRadius?: number;
    style?: ViewStyle;
}

export default function SkeletonLoader({
    width = '100%',
    height = 20,
    borderRadius = 8,
    style,
}: SkeletonLoaderProps) {
    const shimmerAnim = React.useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        const shimmer = Animated.loop(
            Animated.sequence([
                Animated.timing(shimmerAnim, {
                    toValue: 1,
                    duration: 1000,
                    useNativeDriver: false,
                }),
                Animated.timing(shimmerAnim, {
                    toValue: 0,
                    duration: 1000,
                    useNativeDriver: false,
                }),
            ])
        );
        shimmer.start();
        return () => shimmer.stop();
    }, [shimmerAnim]);

    // Dark-mode-friendly: subtle translucent white shimmer visible on dark backgrounds
    const backgroundColor = shimmerAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.14)'],
    });

    return (
        <View style={[{ width, height, borderRadius, overflow: 'hidden' }, style]}>
            <Animated.View
                style={[
                    StyleSheet.absoluteFill,
                    {
                        backgroundColor,
                    },
                ]}
            />
        </View>
    );
}
