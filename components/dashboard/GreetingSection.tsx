import * as React from 'react';
import { StyleSheet, View, Text, Animated } from 'react-native';
import { Colors, Typography, Spacing } from '../../constants/theme';
import { createFadeIn, createSlideUp, AnimationDuration } from '../../constants/animations';

interface GreetingSectionProps {
    userName: string;
    activeNarration?: string;
    delay?: number;
}

export default function GreetingSection({ userName, activeNarration = 'Hafs', delay = 0 }: GreetingSectionProps) {
    const fadeAnim = React.useRef(new Animated.Value(0)).current;
    const slideAnim = React.useRef(new Animated.Value(20)).current;

    React.useEffect(() => {
        Animated.parallel([
            createFadeIn(fadeAnim, delay),
            createSlideUp(slideAnim, delay),
        ]).start();
    }, [delay]);

    const getGreeting = () => {
        const hour = new Date().getHours();
        let timeGreeting = 'Good Morning';
        if (hour >= 12 && hour < 18) timeGreeting = 'Good Afternoon';
        else if (hour >= 18) timeGreeting = 'Good Evening';

        return `${timeGreeting},`;
    };

    const getMotivation = () => {
        if (activeNarration === 'Shubah') {
            return "Mastering the nuances of Shu'bah elevates your recitation.";
        }
        return "Consistency in Hafs builds a foundation of light.";
    };

    return (
        <Animated.View style={[
            styles.container,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
        ]}>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.name}>{userName}</Text>
            <Text style={styles.motivation}>{getMotivation()}</Text>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: Spacing.xl,
        paddingHorizontal: Spacing.md,
    },
    greeting: {
        fontSize: Typography.fontSize.xl,
        color: Colors.emerald[100],
        marginBottom: Spacing.xs,
        fontWeight: Typography.fontWeight.medium,
    },
    name: {
        fontSize: Typography.fontSize['4xl'],
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        letterSpacing: -0.5,
        marginBottom: Spacing.sm,
    },
    motivation: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.tertiary,
        fontStyle: 'italic',
    },
});
