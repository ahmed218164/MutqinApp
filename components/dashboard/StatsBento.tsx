import * as React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { Flame, Target, Trophy } from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { StaggerDelay } from '../../constants/animations';

interface StatsBentoProps {
    streak: number;
    daysRemaining: number;
    totalXP: number;
    baseDelay?: number;
    activeNarration?: string;
}

// ── Gradient border wrapper ──────────────────────────────────────────────────
function GradientBorderCard({
    children,
    style,
    gradientColors,
    delay = 0,
}: {
    children: React.ReactNode;
    style?: object;
    gradientColors: string[];
    delay?: number;
}) {
    const fadeAnim = useSharedValue(0);
    const translateY = useSharedValue(14);

    React.useEffect(() => {
        setTimeout(() => {
            fadeAnim.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
            translateY.value = withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) });
        }, delay);
    }, []);

    const animStyle = useAnimatedStyle(() => ({
        opacity: fadeAnim.value,
        transform: [{ translateY: translateY.value }],
    }));

    return (
        <Animated.View style={[styles.gradientBorderOuter, style, animStyle]}>
            {/* 1px gradient border rendered as background of outer container */}
            <LinearGradient
                colors={gradientColors as any}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            {/* Inner glass pane — plain background, no BlurView overhead */}
            <View style={styles.gradientBorderInner}>
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(4, 47, 46, 0.93)' }]} />
                {children}
            </View>
        </Animated.View>
    );
}

// ── Static icon wrapper (no animation = no CPU overhead) ────────────────────
function FloatingIcon({ children, glowColor }: { children: React.ReactNode; glowColor: string }) {
    return (
        <View style={[styles.iconGlowContainer, { shadowColor: glowColor, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } }]}>
            {children}
        </View>
    );
}

export default function StatsBento({ streak, daysRemaining, totalXP, baseDelay = 0, activeNarration = 'Hafs' }: StatsBentoProps) {
    const isHafs = activeNarration === 'Hafs';
    const accentColor = isHafs ? Colors.emerald[400] : Colors.gold[400];
    const gradientEnd = isHafs ? Colors.neon.teal : Colors.gold[500];
    const primaryGradient: string[] = isHafs
        ? [Colors.neon.emerald, Colors.neon.teal, 'rgba(4,120,87,0.3)']
        : [Colors.neon.gold, Colors.gold[500], 'rgba(180,83,9,0.3)'];

    return (
        <View style={styles.container}>
            {/* ─── Large Streak Card ─── */}
            <GradientBorderCard
                style={styles.largeCardWrapper}
                gradientColors={primaryGradient}
                delay={baseDelay + StaggerDelay * 0}
            >
                {/* Mesh gradient overlay for the hero card */}
                <LinearGradient
                    colors={isHafs
                        ? ['rgba(4,47,46,0.95)', 'rgba(4,120,87,0.6)', 'rgba(6,78,59,0.9)']
                        : ['rgba(69,26,3,0.95)', 'rgba(120,53,15,0.6)', 'rgba(146,64,14,0.9)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />

                <FloatingIcon glowColor={accentColor}>
                    <View style={[styles.iconRing, { borderColor: accentColor + '60', backgroundColor: accentColor + '18' }]}>
                        <Flame color={accentColor} size={30} fill={accentColor + '30'} />
                    </View>
                </FloatingIcon>

                <View style={styles.statContent}>
                    <Text style={[styles.statValueHero, { color: accentColor }]}>
                        {streak}
                    </Text>
                    <Text style={styles.statLabelHero}>Day Streak 🔥</Text>

                    {/* Small "Keep going" bar */}
                    <View style={styles.streakBarBg}>
                        <LinearGradient
                            colors={[accentColor, gradientEnd]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={[styles.streakBarFill, { width: `${Math.min(100, (streak % 7) / 7 * 100)}%` }]}
                        />
                    </View>
                    <Text style={styles.streakBarLabel}>{7 - (streak % 7)} days to next milestone</Text>
                </View>
            </GradientBorderCard>

            {/* ─── Right Column ─── */}
            <View style={styles.column}>
                {/* Days Left */}
                <GradientBorderCard
                    style={styles.smallCardWrapper}
                    gradientColors={['rgba(52,211,153,0.8)', 'rgba(20,184,166,0.4)', 'rgba(52,211,153,0.1)']}
                    delay={baseDelay + StaggerDelay * 1}
                >
                    <View style={styles.smallCardRow}>
                        <FloatingIcon glowColor={Colors.emerald[400]}>
                            <Target color={Colors.emerald[300]} size={22} />
                        </FloatingIcon>
                        <View style={styles.smallStatContent}>
                            <Text style={[styles.smallStatValue, { color: Colors.emerald[300] }]}>
                                {daysRemaining}
                            </Text>
                            <Text style={styles.smallStatLabel}>Days Left</Text>
                        </View>
                    </View>
                </GradientBorderCard>

                {/* Total XP */}
                <GradientBorderCard
                    style={styles.smallCardWrapper}
                    gradientColors={['rgba(251,191,36,0.8)', 'rgba(245,158,11,0.4)', 'rgba(251,191,36,0.1)']}
                    delay={baseDelay + StaggerDelay * 2}
                >
                    <View style={styles.smallCardRow}>
                        <FloatingIcon glowColor={Colors.gold[400]}>
                            <Trophy color={Colors.gold[300]} size={22} />
                        </FloatingIcon>
                        <View style={styles.smallStatContent}>
                            <Text style={[styles.smallStatValue, { color: Colors.gold[300] }]}>
                                {totalXP >= 1000 ? `${(totalXP / 1000).toFixed(1)}k` : totalXP}
                            </Text>
                            <Text style={styles.smallStatLabel}>Total XP</Text>
                        </View>
                    </View>
                </GradientBorderCard>
            </View>
        </View>
    );
}

const BORDER_WIDTH = 1.5;

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        gap: Spacing.md,
        marginBottom: Spacing.xl,
    },
    // ── Large card
    largeCardWrapper: {
        flex: 1,
        aspectRatio: 0.85,
        borderRadius: BorderRadius['2xl'],
        padding: BORDER_WIDTH,
        overflow: 'hidden',
        ...Shadows.glowEmerald,
    },
    // ── Small cards
    smallCardWrapper: {
        flex: 1,
        borderRadius: BorderRadius['2xl'],
        padding: BORDER_WIDTH,
        overflow: 'hidden',
    },
    column: {
        flex: 1,
        gap: Spacing.md,
    },
    // Gradient border structure
    gradientBorderOuter: {
        // gradient fills this as background
    },
    gradientBorderInner: {
        flex: 1,
        borderRadius: BorderRadius['2xl'] - BORDER_WIDTH,
        margin: BORDER_WIDTH,
        overflow: 'hidden',
        padding: Spacing.base,
        justifyContent: 'space-between',
    },
    // Icon
    iconGlowContainer: {
        alignSelf: 'flex-start',
    },
    iconRing: {
        width: 52,
        height: 52,
        borderRadius: BorderRadius.full,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Large card text
    statContent: {
        marginTop: Spacing.sm,
    },
    statValueHero: {
        fontSize: 52,
        fontWeight: '800' as const,
        lineHeight: 56,
        letterSpacing: -1,
    },
    statLabelHero: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.tertiary,
        marginTop: Spacing.xs,
        marginBottom: Spacing.md,
        letterSpacing: 0.3,
    },
    streakBarBg: {
        height: 5,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: BorderRadius.full,
        overflow: 'hidden',
        marginBottom: Spacing.xs,
    },
    streakBarFill: {
        height: '100%',
        borderRadius: BorderRadius.full,
    },
    streakBarLabel: {
        fontSize: 10,
        color: Colors.text.tertiary,
        letterSpacing: 0.2,
    },
    // Small card
    smallCardRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        flex: 1,
    },
    smallStatContent: {
        flex: 1,
    },
    smallStatValue: {
        fontSize: Typography.fontSize['2xl'],
        fontWeight: '800' as const,
        letterSpacing: -0.5,
    },
    smallStatLabel: {
        fontSize: Typography.fontSize.xs,
        color: Colors.text.tertiary,
        marginTop: 2,
        letterSpacing: 0.3,
    },
});
