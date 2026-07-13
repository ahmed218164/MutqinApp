import * as React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BookOpen, CalendarDays, RotateCcw } from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';

interface TodayFocusStripProps {
    activeNarration: string;
    dailyPages: number;
    dueReviews: number;
    accentColor: string;
}

export default function TodayFocusStrip({
    activeNarration,
    dailyPages,
    dueReviews,
    accentColor,
}: TodayFocusStripProps) {
    const dayLabel = React.useMemo(() => {
        return new Date().toLocaleDateString('ar', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
        });
    }, []);

    const items = [
        {
            icon: <CalendarDays size={17} color={accentColor} />,
            label: dayLabel,
            value: 'ورد اليوم',
        },
        {
            icon: <BookOpen size={17} color={accentColor} />,
            label: `رواية ${activeNarration}`,
            value: `${dailyPages || 1} صفحة`,
        },
        {
            icon: <RotateCcw size={17} color={dueReviews > 0 ? Colors.gold[300] : accentColor} />,
            label: 'المراجعة',
            value: dueReviews > 0 ? `${dueReviews} مستحقة` : 'لا يوجد',
        },
    ];

    return (
        <View style={styles.container}>
            {items.map((item, index) => (
                <View
                    key={item.label}
                    style={[
                        styles.item,
                        index < items.length - 1 && styles.itemDivider,
                    ]}
                >
                    <View style={[styles.iconBox, { backgroundColor: accentColor + '14' }]}>
                        {item.icon}
                    </View>
                    <View style={styles.textBlock}>
                        <Text style={styles.value} numberOfLines={1}>{item.value}</Text>
                        <Text style={styles.label} numberOfLines={1}>{item.label}</Text>
                    </View>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.74)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        borderRadius: BorderRadius.md,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.sm,
        marginBottom: Spacing.lg,
    },
    item: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.xs,
        minWidth: 0,
    },
    itemDivider: {
        borderRightWidth: StyleSheet.hairlineWidth,
        borderRightColor: 'rgba(255,255,255,0.08)',
    },
    iconBox: {
        width: 32,
        height: 32,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    textBlock: {
        flex: 1,
        minWidth: 0,
        alignItems: 'flex-end',
    },
    value: {
        color: Colors.text.inverse,
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.bold,
        textAlign: 'right',
    },
    label: {
        color: Colors.neutral[400],
        fontSize: Typography.fontSize.xs,
        marginTop: 1,
        textAlign: 'right',
    },
});
