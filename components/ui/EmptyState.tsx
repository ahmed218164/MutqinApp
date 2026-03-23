import * as React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Typography, Spacing } from '../../constants/theme';

interface EmptyStateProps {
    title: string;
    message: string;
    icon?: React.ReactNode;
    style?: ViewStyle;
}

export default function EmptyState({ title, message, icon, style }: EmptyStateProps) {
    return (
        <View style={[styles.container, style]}>
            {icon && <View style={styles.iconContainer}>{icon}</View>}
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.xl,
    },
    iconContainer: {
        marginBottom: Spacing.lg,
        opacity: 0.8,
    },
    title: {
        fontSize: Typography.fontSize.xl,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        marginBottom: Spacing.sm,
        textAlign: 'center',
    },
    message: {
        fontSize: Typography.fontSize.base,
        color: Colors.text.tertiary,
        textAlign: 'center',
        maxWidth: 280,
    },
});
