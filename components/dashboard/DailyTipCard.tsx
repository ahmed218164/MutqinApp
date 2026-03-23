import * as React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Lightbulb } from 'lucide-react-native';
import Card from '../ui/Card';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import { StaggerDelay } from '../../constants/animations';

interface DailyTipCardProps {
    surahName?: string;
    activeNarration?: string;
    delay?: number;
}

const TIPS = [
    {
        hafs: "Basmalah counts as verse 1 in Surah Al-Fatihah only. In all other surahs, it is a separator and not numbered as a verse.",
        shubah: "Basmalah is also verse 1 in Surah Al-Fatihah in the Shu'bah narration, but its counting in other surahs may differ from Hafs."
    },
    {
        hafs: "Madd Al-Munfasil (separated prolongation) is extended 4 or 5 harakahs in Hafs, depending on the chosen level of recitation.",
        shubah: "Shu'bah typically extends Madd Al-Munfasil 4 harakahs, which is a key distinction from some Hafs recitations."
    },
    {
        hafs: "Sakt (brief silent pause without breathing) is required in Hafs in 4 places: Al-Mutaffifin:14, Al-Qiyamah:27, Ya-Sin:52, and Al-Kahf:1-2.",
        shubah: "In Shu'bah, the Sakt rules differ — some of these locations use continuation instead of a pause."
    },
    {
        hafs: "The letter Ra (ر) is pronounced heavy (Tafkhim) by default in Hafs, with specific cases where it becomes light (Tarqiq), such as when preceded by a kasrah.",
        shubah: "Shu'bah has more cases of Tarqiq (light) Ra than Hafs, particularly in certain word endings — pay special attention to these differences."
    },
    {
        hafs: "In Hafs, 'Ayn (ع) at the beginning of Surahs 19 and 42 is prolonged for 6 harakahs as it is a letter of opening (Muqatta'at).",
        shubah: "The Muqatta'at letters at surah openings follow the same 6-harakah prolongation rule in Shu'bah as in Hafs."
    },
];

export default function DailyTipCard({ surahName, activeNarration = 'Hafs', delay = 0 }: DailyTipCardProps) {
    const randomTip = TIPS[Math.floor(Math.random() * TIPS.length)];
    const isHafs = activeNarration === 'Hafs';
    const accentColor = isHafs ? Colors.emerald[400] : Colors.gold[400];
    const tipText = isHafs ? randomTip.hafs : randomTip.shubah;

    return (
        <Card
            variant="glass"
            style={styles.card}
            animated={true}
            delay={delay}
        >
            <View style={styles.header}>
                <View style={[styles.iconContainer, { backgroundColor: accentColor + '20' }]}>
                    <Lightbulb color={accentColor} size={20} />
                </View>
                <Text style={styles.title}>Daily Tip</Text>
            </View>

            <Text style={styles.content}>
                Did you know? In <Text style={{ color: accentColor, fontWeight: 'bold' }}>{activeNarration}</Text>:
            </Text>
            <Text style={styles.tip}>{tipText}</Text>
        </Card>
    );
}

const styles = StyleSheet.create({
    card: {
        marginTop: Spacing.xl,
        padding: Spacing.lg,
        // No fixed height — let content dictate the height
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.md,
        gap: Spacing.sm,
    },
    iconContainer: {
        padding: Spacing.xs,
        borderRadius: BorderRadius.full,
    },
    title: {
        fontSize: Typography.fontSize.base,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
    },
    content: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.secondary,
        marginBottom: Spacing.xs,
    },
    tip: {
        fontSize: Typography.fontSize.base,
        color: Colors.text.inverse,
        fontWeight: Typography.fontWeight.medium,
        lineHeight: Typography.fontSize.base * 1.65, // explicit pixel lineHeight
        flexShrink: 1,
    },
});
