import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    Sparkles,
    TrendingUp,
    AlertCircle,
    BookOpen,
    RefreshCw,
    ChevronDown,
    ChevronUp,
} from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import { WeeklyReport } from '../../lib/weekly-report';

interface WeeklyReportCardProps {
    report: WeeklyReport | null;
    loading: boolean;
    onGenerate: () => void;
    isGenerating: boolean;
}

interface StatPillProps {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    color: string;
}

function StatPill({ icon, label, value, color }: StatPillProps) {
    return (
        <View style={[styles.statPill, { borderColor: color + '40', backgroundColor: color + '14' }]}>
            <View style={styles.statIcon}>{icon}</View>
            <View style={styles.statText}>
                <Text style={[styles.statValue, { color }]} numberOfLines={1}>{value}</Text>
                <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
            </View>
        </View>
    );
}

function formatWeekRange(startDate: string, endDate: string) {
    const format = (value: string) =>
        new Date(value).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });

    return `${format(startDate)} - ${format(endDate)}`;
}

export default function WeeklyReportCard({
    report,
    loading,
    onGenerate,
    isGenerating,
}: WeeklyReportCardProps) {
    const [expanded, setExpanded] = React.useState(true);

    if (loading) {
        return (
            <View style={styles.skeletonWrapper}>
                <View style={styles.skeletonHeader} />
                <View style={[styles.skeletonLine, { width: '92%' }]} />
                <View style={[styles.skeletonLine, { width: '76%' }]} />
                <View style={[styles.skeletonLine, { width: '84%' }]} />
            </View>
        );
    }

    if (!report) {
        return (
            <LinearGradient
                colors={['#06251f', '#0f3a31', '#162219']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.emptyCard}
            >
                <View style={styles.emptyIcon}>
                    <Sparkles color={Colors.gold[300]} size={24} />
                </View>
                <View style={styles.emptyCopy}>
                    <Text style={styles.emptyTitle}>تقرير الأسبوع</Text>
                    <Text style={styles.emptySubtitle}>
                        ملخص ذكي يوضح تقدمك، أكثر المواضع التي تحتاج عناية، واقتراحًا عمليًا للأسبوع القادم.
                    </Text>
                </View>
                <TouchableOpacity
                    style={styles.generateButton}
                    onPress={onGenerate}
                    activeOpacity={0.85}
                    disabled={isGenerating}
                >
                    {isGenerating ? (
                        <ActivityIndicator color={Colors.neutral[950]} size="small" />
                    ) : (
                        <>
                            <Sparkles size={16} color={Colors.neutral[950]} />
                            <Text style={styles.generateButtonText}>توليد التقرير</Text>
                        </>
                    )}
                </TouchableOpacity>
            </LinearGradient>
        );
    }

    const stats = report.stats;
    const dateLabel = formatWeekRange(report.week_start, report.week_end);

    return (
        <View style={styles.card}>
            <LinearGradient
                colors={['#061712', '#0d211c', '#101826']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            <View style={styles.topAccent} />

            <TouchableOpacity
                style={styles.header}
                onPress={() => setExpanded((value) => !value)}
                activeOpacity={0.82}
            >
                <View style={styles.headerText}>
                    <View style={styles.badge}>
                        <Sparkles size={13} color={Colors.gold[300]} />
                        <Text style={styles.badgeText}>تقرير ذكي</Text>
                    </View>
                    <Text style={styles.weekLabel}>{dateLabel}</Text>
                </View>
                <View style={styles.chevronButton}>
                    {expanded ? (
                        <ChevronUp size={18} color={Colors.neutral[200]} />
                    ) : (
                        <ChevronDown size={18} color={Colors.neutral[200]} />
                    )}
                </View>
            </TouchableOpacity>

            {expanded && (
                <>
                    <View style={styles.statsRow}>
                        <StatPill
                            icon={<BookOpen size={15} color={Colors.emerald[300]} />}
                            label="الصفحات"
                            value={stats.totalPages}
                            color={Colors.emerald[300]}
                        />
                        <StatPill
                            icon={<TrendingUp size={15} color={Colors.gold[300]} />}
                            label="متوسط النتيجة"
                            value={`${stats.avgScore}%`}
                            color={Colors.gold[300]}
                        />
                        <StatPill
                            icon={<AlertCircle size={15} color={Colors.error} />}
                            label="الأخطاء"
                            value={stats.mistakesCount}
                            color={Colors.error}
                        />
                    </View>

                    <View style={styles.divider} />

                    <Text style={styles.reportText}>{report.report_text}</Text>

                    <TouchableOpacity
                        style={styles.regenerateButton}
                        onPress={onGenerate}
                        disabled={isGenerating}
                        activeOpacity={0.75}
                    >
                        {isGenerating ? (
                            <ActivityIndicator size="small" color={Colors.neutral[300]} />
                        ) : (
                            <RefreshCw size={14} color={Colors.neutral[300]} />
                        )}
                        <Text style={styles.regenerateText}>
                            {isGenerating ? 'جاري التوليد...' : 'إعادة التوليد'}
                        </Text>
                    </TouchableOpacity>
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: BorderRadius.xl,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(148, 163, 184, 0.16)',
        marginBottom: Spacing.lg,
        padding: Spacing.lg,
        position: 'relative',
        backgroundColor: Colors.neutral[950],
    },
    topAccent: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        backgroundColor: Colors.emerald[400],
        opacity: 0.9,
    },
    header: {
        flexDirection: 'row-reverse',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: Spacing.md,
        marginBottom: Spacing.md,
    },
    headerText: {
        flex: 1,
        alignItems: 'flex-end',
        gap: 6,
    },
    badge: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        gap: 5,
        backgroundColor: 'rgba(251, 191, 36, 0.12)',
        paddingHorizontal: Spacing.sm,
        paddingVertical: 4,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: 'rgba(251, 191, 36, 0.22)',
    },
    badgeText: {
        fontSize: Typography.fontSize.xs,
        fontWeight: '700' as const,
        color: Colors.gold[200],
    },
    weekLabel: {
        fontSize: Typography.fontSize.sm,
        fontWeight: '700' as const,
        color: Colors.neutral[50],
        textAlign: 'right',
    },
    chevronButton: {
        width: 34,
        height: 34,
        borderRadius: BorderRadius.lg,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    statsRow: {
        flexDirection: 'row-reverse',
        gap: Spacing.sm,
        marginBottom: Spacing.md,
    },
    statPill: {
        flex: 1,
        minHeight: 66,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        padding: Spacing.sm,
        alignItems: 'flex-end',
        justifyContent: 'space-between',
    },
    statIcon: {
        alignSelf: 'flex-end',
    },
    statText: {
        alignItems: 'flex-end',
        gap: 1,
    },
    statValue: {
        fontSize: Typography.fontSize.lg,
        fontWeight: '800' as const,
        lineHeight: 22,
        textAlign: 'right',
    },
    statLabel: {
        fontSize: Typography.fontSize.xs,
        color: Colors.neutral[300],
        fontWeight: '600' as const,
        textAlign: 'right',
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        marginVertical: Spacing.md,
    },
    reportText: {
        fontSize: Typography.fontSize.sm,
        color: Colors.neutral[200],
        lineHeight: 24,
        textAlign: 'right',
        writingDirection: 'rtl',
    },
    regenerateButton: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        gap: Spacing.xs,
        marginTop: Spacing.md,
        alignSelf: 'flex-start',
        paddingHorizontal: Spacing.sm,
        paddingVertical: 6,
        borderRadius: BorderRadius.full,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
    },
    regenerateText: {
        fontSize: Typography.fontSize.xs,
        color: Colors.neutral[300],
        fontWeight: '600' as const,
    },
    emptyCard: {
        borderRadius: BorderRadius.xl,
        overflow: 'hidden',
        marginBottom: Spacing.lg,
        borderWidth: 1,
        borderColor: 'rgba(52, 211, 153, 0.18)',
        padding: Spacing.lg,
        alignItems: 'flex-end',
        gap: Spacing.md,
    },
    emptyIcon: {
        width: 48,
        height: 48,
        borderRadius: BorderRadius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(251, 191, 36, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(251, 191, 36, 0.2)',
    },
    emptyCopy: {
        alignItems: 'flex-end',
        gap: 6,
    },
    emptyTitle: {
        fontSize: Typography.fontSize.xl,
        fontWeight: '800' as const,
        color: Colors.neutral[50],
        textAlign: 'right',
    },
    emptySubtitle: {
        fontSize: Typography.fontSize.sm,
        color: Colors.neutral[300],
        textAlign: 'right',
        lineHeight: 22,
        writingDirection: 'rtl',
    },
    generateButton: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
        backgroundColor: Colors.gold[400],
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.full,
        alignSelf: 'stretch',
    },
    generateButtonText: {
        fontSize: Typography.fontSize.base,
        fontWeight: '800' as const,
        color: Colors.neutral[950],
    },
    skeletonWrapper: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: BorderRadius.xl,
        padding: Spacing.lg,
        marginBottom: Spacing.lg,
        gap: Spacing.sm,
        borderWidth: 1,
        borderColor: 'rgba(148, 163, 184, 0.12)',
    },
    skeletonHeader: {
        height: 22,
        width: '48%',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: BorderRadius.base,
        alignSelf: 'flex-end',
        marginBottom: Spacing.sm,
    },
    skeletonLine: {
        height: 14,
        backgroundColor: 'rgba(255, 255, 255, 0.07)',
        borderRadius: BorderRadius.base,
        alignSelf: 'flex-end',
    },
});
