import * as React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import Card from '../ui/Card';
import { AlertTriangle, ArrowRight } from 'lucide-react-native';
import { MutashabihatPair } from '../../lib/mutashabihat-engine';

interface MutashabihatCardProps {
    pair: MutashabihatPair;
    currentAyah: { surah: number; ayah: number };
}

export default function MutashabihatCard({ pair, currentAyah }: MutashabihatCardProps) {
    const isCurrent1 = pair.ayah1.surah === currentAyah.surah && pair.ayah1.ayah === currentAyah.ayah;
    const current = isCurrent1 ? pair.ayah1 : pair.ayah2;
    const confused = isCurrent1 ? pair.ayah2 : pair.ayah1;

    return (
        <Card style={styles.container} variant="glass">
            <View style={styles.header}>
                <AlertTriangle size={20} color={Colors.gold[400]} />
                <Text style={styles.headerTitle}>Mutashabihat Detected</Text>
            </View>

            <Text style={styles.similarity}>{pair.similarity}</Text>

            <View style={styles.ayahContainer}>
                <View style={styles.labelRow}>
                    <Text style={styles.label}>Your Ayah</Text>
                    <Text style={styles.reference}>
                        {current.surah}:{current.ayah}
                    </Text>
                </View>
                <View style={styles.ayahBox}>
                    <Text style={styles.ayahText}>{current.text}</Text>
                </View>
            </View>

            <View style={styles.arrowContainer}>
                <ArrowRight size={24} color={Colors.gold[400]} />
            </View>

            <View style={styles.ayahContainer}>
                <View style={styles.labelRow}>
                    <Text style={styles.label}>Often Confused With</Text>
                    <Text style={styles.reference}>
                        {confused.surah}:{confused.ayah}
                    </Text>
                </View>
                <View style={[styles.ayahBox, styles.confusedBox]}>
                    <Text style={styles.ayahText}>{confused.text}</Text>
                </View>
            </View>

            {pair.differences.length > 0 && (
                <View style={styles.differencesContainer}>
                    <Text style={styles.differencesTitle}>Key Differences:</Text>
                    {pair.differences.map((diff, idx) => (
                        <View key={idx} style={styles.differenceRow}>
                            <View style={styles.diffItem}>
                                <Text style={styles.diffLabel}>Your Ayah:</Text>
                                <Text style={styles.diffText}>{diff.word1}</Text>
                            </View>
                            <View style={styles.diffItem}>
                                <Text style={styles.diffLabel}>Confused:</Text>
                                <Text style={[styles.diffText, styles.confusedText]}>{diff.word2}</Text>
                            </View>
                        </View>
                    ))}
                </View>
            )}
        </Card>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: Spacing.lg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    headerTitle: {
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.gold[400],
        marginLeft: Spacing.sm,
    },
    similarity: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.secondary,
        marginBottom: Spacing.lg,
        fontStyle: 'italic',
    },
    ayahContainer: {
        marginBottom: Spacing.md,
    },
    labelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.sm,
    },
    label: {
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.semibold,
        color: Colors.text.primary,
    },
    reference: {
        fontSize: Typography.fontSize.xs,
        color: Colors.emerald[400],
        fontWeight: Typography.fontWeight.bold,
    },
    ayahBox: {
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)',
        borderRadius: BorderRadius.base,
        padding: Spacing.md,
    },
    confusedBox: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderColor: 'rgba(239, 68, 68, 0.3)',
    },
    ayahText: {
        fontSize: Typography.fontSize.xl,
        color: Colors.text.inverse,
        textAlign: 'right',
        lineHeight: Typography.fontSize.xl * 1.8,
    },
    arrowContainer: {
        alignItems: 'center',
        marginVertical: Spacing.sm,
    },
    differencesContainer: {
        marginTop: Spacing.md,
        paddingTop: Spacing.md,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.1)',
    },
    differencesTitle: {
        fontSize: Typography.fontSize.base,
        fontWeight: Typography.fontWeight.semibold,
        color: Colors.text.inverse,
        marginBottom: Spacing.sm,
    },
    differenceRow: {
        marginBottom: Spacing.md,
    },
    diffItem: {
        marginBottom: Spacing.xs,
    },
    diffLabel: {
        fontSize: Typography.fontSize.xs,
        color: Colors.text.tertiary,
        marginBottom: 2,
    },
    diffText: {
        fontSize: Typography.fontSize.base,
        color: Colors.emerald[400],
        fontWeight: Typography.fontWeight.bold,
    },
    confusedText: {
        color: Colors.error,
    },
});
