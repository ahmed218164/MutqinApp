import * as React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Lightbulb } from 'lucide-react-native';
import Card from '../ui/Card';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';

interface DailyTipCardProps {
    surahName?: string;
    activeNarration?: string;
    delay?: number;
}

const TIPS = [
    {
        hafs: 'البسملة آية في سورة الفاتحة فقط في عد حفص، وتأتي فاصلة في أوائل السور الأخرى.',
        shubah: 'في رواية شعبة تبقى البسملة في الفاتحة موضع عناية، وانتبه لاختلافات العد في بعض المواضع.',
    },
    {
        hafs: 'المد المنفصل في حفص يمد غالبا أربع أو خمس حركات بحسب طريق القراءة.',
        shubah: 'المد المنفصل في شعبة يحتاج ثباتا في المقدار حتى لا تختلط الرواية بغيرها.',
    },
    {
        hafs: 'السكت في حفص له مواضع مشهورة، مثل الكهف ويس والمطففين والقيامة؛ درب أذنك عليها.',
        shubah: 'مواضع السكت في شعبة تختلف عن حفص، فاجعل الاستماع للشيخ مرجعك قبل التسميع.',
    },
    {
        hafs: 'الراء في حفص بين التفخيم والترقيق، وأكثر الأخطاء تأتي من الاستعجال عند الكسرة.',
        shubah: 'انتبه لحالات ترقيق الراء في شعبة، خصوصا عند أواخر الكلمات والوقف.',
    },
    {
        hafs: 'الحروف المقطعة تحتاج نفسا هادئا ومقدارا ثابتا، خاصة العين في مريم والشورى.',
        shubah: 'الحروف المقطعة في أوائل السور موضع ممتاز لضبط النفس والزمن قبل متابعة التلاوة.',
    },
];

export default function DailyTipCard({ activeNarration = 'Hafs', delay = 0 }: DailyTipCardProps) {
    const tipIndex = React.useMemo(() => new Date().getDate() % TIPS.length, []);
    const randomTip = TIPS[tipIndex];
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
                <View style={[styles.iconContainer, { backgroundColor: accentColor + '18' }]}>
                    <Lightbulb color={accentColor} size={20} />
                </View>
                <View style={styles.headerText}>
                    <Text style={styles.title}>فائدة اليوم</Text>
                    <Text style={[styles.subtitle, { color: accentColor }]}>
                        رواية {activeNarration}
                    </Text>
                </View>
            </View>

            <Text style={styles.tip}>{tipText}</Text>
        </Card>
    );
}

const styles = StyleSheet.create({
    card: {
        marginTop: Spacing.xl,
        padding: Spacing.lg,
        borderRadius: BorderRadius.md,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.md,
        gap: Spacing.sm,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerText: {
        flex: 1,
        alignItems: 'flex-end',
    },
    title: {
        fontSize: Typography.fontSize.base,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        textAlign: 'right',
    },
    subtitle: {
        fontSize: Typography.fontSize.xs,
        fontWeight: Typography.fontWeight.semibold,
        marginTop: 2,
        textAlign: 'right',
    },
    tip: {
        fontSize: Typography.fontSize.base,
        color: Colors.neutral[100],
        fontWeight: Typography.fontWeight.medium,
        lineHeight: Typography.fontSize.base * 1.7,
        textAlign: 'right',
    },
});
