import * as React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import Card from '../ui/Card';

interface BadgeCardProps {
    icon: string;
    name: string;
    description: string;
    xpReward: number;
    earnedAt?: string;
    locked?: boolean;
}

export default function BadgeCard({
    icon,
    name,
    description,
    xpReward,
    earnedAt,
    locked = false,
}: BadgeCardProps) {
    const containerStyle = locked ? { opacity: 0.5 } : undefined;

    return (
        <View style={containerStyle}>
            <Card style={styles.container} variant="glass">
                <View style={[styles.iconContainer, locked && styles.lockedIconContainer]}>
                    <Text style={[styles.icon, locked && styles.lockedIcon]}>{icon}</Text>
                </View>
                <View style={styles.content}>
                    <Text style={[styles.name, locked && styles.lockedText]}>{name}</Text>
                    <Text style={[styles.description, locked && styles.lockedText]}>
                        {description}
                    </Text>
                    {!locked && earnedAt && (
                        <Text style={styles.earnedDate}>
                            Earned {new Date(earnedAt).toLocaleDateString()}
                        </Text>
                    )}
                    <View style={styles.xpBadge}>
                        <Text style={styles.xpText}>+{xpReward} XP</Text>
                    </View>
                </View>
            </Card>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    locked: {
        opacity: 0.5,
    },
    iconContainer: {
        width: 60,
        height: 60,
        borderRadius: BorderRadius.full,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: Spacing.md,
    },
    lockedIconContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
    icon: {
        fontSize: 32,
    },
    lockedIcon: {
        opacity: 0.5,
    },
    content: {
        flex: 1,
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
        marginBottom: Spacing.xs,
    },
    lockedText: {
        color: Colors.neutral[500],
    },
    earnedDate: {
        fontSize: Typography.fontSize.xs,
        color: Colors.emerald[400],
        marginBottom: Spacing.xs,
    },
    xpBadge: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(234, 179, 8, 0.15)', // Gold with opacity
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xs / 2,
        borderRadius: BorderRadius.base,
        borderWidth: 1,
        borderColor: 'rgba(234, 179, 8, 0.3)',
    },
    xpText: {
        fontSize: Typography.fontSize.xs,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.gold[400],
    },
});
