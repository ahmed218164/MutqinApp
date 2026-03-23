import * as React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import Card from '../ui/Card';
import { LinearGradient } from 'expo-linear-gradient';

import { ViewProps } from 'react-native';

interface ChallengeCardProps extends ViewProps {
    name: string;
    description: string;
    currentValue: number;
    targetValue: number;
    xpReward: number;
    type: 'daily' | 'weekly';
    delay?: number;
}

export default function ChallengeCard({
    name,
    description,
    currentValue,
    targetValue,
    xpReward,
    type,
    delay = 0,
}: ChallengeCardProps) {
    const progress = (currentValue / targetValue) * 100;
    const isCompleted = currentValue >= targetValue;

    return (
        <Card style={styles.container} variant="glass" animated={true} delay={delay}>
            <View style={styles.header}>
                <View style={{ flex: 1 }}>
                    <View style={styles.typeRow}>
                        <View style={[styles.typeBadge, type === 'daily' ? styles.dailyBadge : styles.weeklyBadge]}>
                            <Text style={[styles.typeText, type === 'daily' ? styles.dailyText : styles.weeklyText]}>
                                {type === 'daily' ? 'Daily' : 'Weekly'}
                            </Text>
                        </View>
                        {isCompleted && <Text style={styles.completedBadge}>Completed</Text>}
                    </View>
                    <Text style={styles.name}>{name}</Text>
                    <Text style={styles.description}>{description}</Text>
                </View>
                <View style={styles.xpBadge}>
                    <Text style={styles.xpText}>+{xpReward} XP</Text>
                </View>
            </View>

            <View style={styles.progressContainer}>
                <View style={styles.progressHeader}>
                    <Text style={styles.progressText}>
                        {currentValue} / {targetValue}
                    </Text>
                    <Text style={styles.percentageText}>{Math.floor(progress)}%</Text>
                </View>
                <View style={styles.progressBarBackground}>
                    <LinearGradient
                        colors={isCompleted
                            ? [Colors.emerald[400], Colors.emerald[500]]
                            : [Colors.gold[400], Colors.gold[500]]
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.progressBarFill, { width: `${Math.min(progress, 100)}%` }]}
                    />
                </View>
            </View>
        </Card>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: Spacing.md,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: Spacing.md,
    },
    typeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.xs,
        gap: Spacing.sm,
    },
    typeBadge: {
        paddingHorizontal: Spacing.sm,
        paddingVertical: 4,
        borderRadius: BorderRadius.sm,
    },
    dailyBadge: {
        backgroundColor: 'rgba(16, 185, 129, 0.15)', // Emerald with opacity
    },
    weeklyBadge: {
        backgroundColor: 'rgba(245, 158, 11, 0.15)', // Gold with opacity
    },
    typeText: {
        fontSize: Typography.fontSize.xs,
        fontWeight: Typography.fontWeight.bold,
    },
    dailyText: {
        color: Colors.emerald[300],
    },
    weeklyText: {
        color: Colors.gold[300],
    },
    completedBadge: {
        fontSize: Typography.fontSize.xs,
        color: Colors.emerald[400],
        fontWeight: Typography.fontWeight.bold,
    },
    name: {
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        marginBottom: Spacing.xs,
    },
    description: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.tertiary,
    },
    xpBadge: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.lg,
        alignSelf: 'flex-start',
    },
    xpText: {
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.gold[400],
    },
    progressContainer: {
        marginTop: Spacing.sm,
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: Spacing.xs,
    },
    progressText: {
        fontSize: Typography.fontSize.xs,
        fontWeight: Typography.fontWeight.medium,
        color: Colors.text.tertiary,
    },
    percentageText: {
        fontSize: Typography.fontSize.xs,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
    },
    progressBarBackground: {
        width: '100%',
        height: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: BorderRadius.full,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: BorderRadius.full,
    },
});
