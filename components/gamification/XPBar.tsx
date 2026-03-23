import * as React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';

interface XPBarProps {
    currentXP: number;
    xpNeeded: number;
    level: number;
}

export default function XPBar({ currentXP, xpNeeded, level }: XPBarProps) {
    const progress = (currentXP / xpNeeded) * 100;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.levelBadge}>
                    <Text style={styles.levelText}>LVL {level}</Text>
                </View>
                <Text style={styles.xpText}>
                    {currentXP} / {xpNeeded} XP
                </Text>
            </View>

            <View style={styles.barContainer}>
                <View style={styles.barBackground}>
                    <LinearGradient
                        colors={[Colors.gold[500], Colors.gold[600], Colors.gold[700]]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.barFill, { width: `${progress}%` }]}
                    />
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: Spacing.md,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.sm,
    },
    levelBadge: {
        backgroundColor: Colors.emerald[600],
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.full,
    },
    levelText: {
        color: Colors.neutral[50],
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.bold,
    },
    xpText: {
        color: Colors.text.secondary,
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.medium,
    },
    barContainer: {
        width: '100%',
    },
    barBackground: {
        width: '100%',
        height: 12,
        backgroundColor: Colors.neutral[200],
        borderRadius: BorderRadius.full,
        overflow: 'hidden',
    },
    barFill: {
        height: '100%',
        borderRadius: BorderRadius.full,
    },
});
