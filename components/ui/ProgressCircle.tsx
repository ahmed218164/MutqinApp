import * as React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Colors, Typography } from '../../constants/theme';

interface ProgressCircleProps {
    progress: number; // 0-100
    size?: number;
    strokeWidth?: number;
    color?: string;
    showPercentage?: boolean;
}

export default function ProgressCircle({
    progress,
    size = 120,
    strokeWidth = 12,
    color = Colors.gold[600],
    showPercentage = true,
}: ProgressCircleProps) {
    const animatedValue = React.useRef(new Animated.Value(0)).current;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;

    React.useEffect(() => {
        Animated.spring(animatedValue, {
            toValue: progress,
            friction: 7,
            tension: 40,
            useNativeDriver: false,
        }).start();
    }, [progress]);

    const strokeDashoffset = animatedValue.interpolate({
        inputRange: [0, 100],
        outputRange: [circumference, 0],
    });

    return (
        <View style={[styles.container, { width: size, height: size }]}>
            {/* Background Circle */}
            <View style={styles.svgContainer}>
                <View
                    style={[
                        styles.circle,
                        {
                            width: size,
                            height: size,
                            borderRadius: size / 2,
                            borderWidth: strokeWidth,
                            borderColor: Colors.neutral[200],
                        },
                    ]}
                />
            </View>

            {/* Progress Circle - Simulated with border */}
            <View style={StyleSheet.absoluteFill}>
                <View
                    style={[
                        styles.circle,
                        {
                            width: size,
                            height: size,
                            borderRadius: size / 2,
                            borderWidth: strokeWidth,
                            borderColor: color,
                            borderTopColor: 'transparent',
                            borderRightColor: 'transparent',
                            transform: [{ rotate: `${(progress / 100) * 360}deg` }],
                        },
                    ]}
                />
            </View>

            {/* Percentage Text */}
            {showPercentage && (
                <View style={styles.textContainer}>
                    <Text style={styles.percentage}>{Math.round(progress)}%</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    svgContainer: {
        position: 'absolute',
    },
    circle: {
        backgroundColor: 'transparent',
    },
    textContainer: {
        position: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
    },
    percentage: {
        fontSize: Typography.fontSize['2xl'],
        fontWeight: Typography.fontWeight.bold,
        color: Colors.emerald[950],
    },
});
