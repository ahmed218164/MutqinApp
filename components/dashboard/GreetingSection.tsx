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
        let timeGreeting = 'صباح الخير';
        if (hour >= 12 && hour < 18) timeGreeting = 'مساء الخير';
        else if (hour >= 18) timeGreeting = 'ليلة مباركة';

        return `${timeGreeting},`;
    };

    const getMotivation = () => {
        if (activeNarration === 'Shubah') {
            return 'إتقان الفروق الدقيقة في رواية شعبة يرفع جودة تلاوتك.';
        }
        return 'القليل الثابت مع القرآن يبني حفظًا راسخًا بإذن الله.';
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
        fontSize: Typography.fontSize.base,
        color: Colors.emerald[300],
        marginBottom: Spacing.xs,
        fontWeight: Typography.fontWeight.medium,
        textAlign: 'right',
    },
    name: {
        fontSize: Typography.fontSize['3xl'],
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        letterSpacing: 0,
        marginBottom: Spacing.sm,
        textAlign: 'right',
    },
    motivation: {
        fontSize: Typography.fontSize.sm,
        color: Colors.neutral[300],
        lineHeight: 21,
        textAlign: 'right',
    },
});
