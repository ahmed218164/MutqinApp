import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
    TouchableOpacity,
    RefreshControl,
    Alert,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useFocusEffect } from 'expo-router';
import { AlertCircle, Trash2 } from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import { useThemeColors } from '../../constants/dynamicTheme';
import Card from '../../components/ui/Card';
import ModernBackground from '../../components/ui/ModernBackground';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import EmptyState from '../../components/ui/EmptyState';
import SkeletonLoader from '../../components/ui/SkeletonLoader';
import { StaggerDelay } from '../../constants/animations';
import { detectMutashabihat } from '../../lib/mutashabihat-engine';
import MutashabihatCard from '../../components/mistakes/MutashabihatCard';
import { getSurahByNumber } from '../../constants/surahs';

interface Mistake {
    id: string;
    // Actual DB columns from mistake_log table:
    surah: number;               // surah number (integer)
    verse: number;               // verse number (integer)
    error_description: string;   // format: "word → correction: details" or free text
    created_at: string;
    // These columns are NOT in the DB — we derive them:
    surah_name?: string;         // derived
    mistake_type?: string;       // derived from error_description
    mistake_details?: string;    // derived from error_description
}

/**
 * Parses the `error_description` field stored as:
 *   "word → correction: description"
 * into a structured object.
 */
function parseErrorDescription(raw: string): { mistakeType: string; mistakeDetails: string } {
    if (!raw) return { mistakeType: 'غير محدد', mistakeDetails: '' };
    // Try to split on the first colon following an arrow
    const arrowIdx = raw.indexOf('→');
    const colonIdx = raw.indexOf(':', arrowIdx > -1 ? arrowIdx : 0);

    if (arrowIdx > -1 && colonIdx > arrowIdx) {
        // Format: "word → correction: some description"
        const typePart = raw.substring(0, colonIdx).trim();   // "word → correction"
        const detailPart = raw.substring(colonIdx + 1).trim(); // "some description"
        return { mistakeType: typePart, mistakeDetails: detailPart };
    }
    // Plain format — treat entire string as type
    return { mistakeType: raw.trim(), mistakeDetails: '' };
}

export default function MistakesScreen() {
    const { user } = useAuth();
    const [mistakes, setMistakes] = React.useState<Mistake[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [refreshing, setRefreshing] = React.useState(false);

    useFocusEffect(
        React.useCallback(() => {
            loadMistakes();
        }, [])
    );

    async function loadMistakes() {
        setLoading(true);  // Always reset loading flag on each load
        try {
            if (!user) {
                setLoading(false);
                return;
            }

            const { data, error } = await supabase
                .from('mistake_log')
                .select('id, surah, verse, error_description, created_at')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setMistakes(data || []);
        } catch (error) {
            console.error('Error loading mistakes:', error);
        } finally {
            setLoading(false);
        }
    }

    async function onRefresh() {
        setRefreshing(true);
        await loadMistakes();
        setRefreshing(false);
    }

    function confirmDeleteMistake(id: string) {
        Alert.alert(
            'حذف الخطأ',
            'هل أنت متأكد من حذف هذا الخطأ؟',
            [
                { text: 'إلغاء', style: 'cancel' },
                {
                    text: 'حذف',
                    style: 'destructive',
                    onPress: () => deleteMistake(id),
                },
            ]
        );
    }

    async function deleteMistake(id: string) {
        try {
            const { error } = await supabase
                .from('mistake_log')
                .delete()
                .eq('id', id);

            if (error) throw error;
            setMistakes(mistakes.filter(m => m.id !== id));
        } catch (error) {
            console.error('Error deleting mistake:', error);
        }
    }

    function formatDate(dateString: string) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'للتوّ';
        if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
        if (diffHours < 24) return `منذ ${diffHours} ساعة`;
        if (diffDays === 0) return 'اليوم';
        if (diffDays === 1) return 'أمس';
        if (diffDays < 7) return `منذ ${diffDays} أيام`;
        return date.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function renderMistake({ item, index }: { item: Mistake, index: number }) {
        // Derive display values from actual DB schema
        const surahName = getSurahByNumber(item.surah)?.name || `سورة ${item.surah}`;
        const { mistakeType, mistakeDetails } = parseErrorDescription(item.error_description);

        const mutashabihatPair = item.surah
            ? detectMutashabihat(item.surah, item.verse, mistakeType)
            : null;

        return (
            <View>
                {mutashabihatPair && (
                    <MutashabihatCard
                        pair={mutashabihatPair}
                        currentAyah={{ surah: item.surah, ayah: item.verse }}
                    />
                )}
                <Card style={styles.mistakeCard} variant="glass" animated={true} delay={Math.min(index * StaggerDelay, 400)}>
                    <View style={styles.mistakeHeader}>
                        <View style={styles.mistakeInfo}>
                            <Text style={styles.surahName}>{surahName}</Text>
                            <Text style={styles.ayahNumber}>آية {item.verse}</Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => confirmDeleteMistake(item.id)}
                            style={styles.deleteButton}
                        >
                            <Trash2 size={20} color={Colors.error} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.mistakeDetails}>
                        <View style={styles.mistakeRow}>
                            <Text style={styles.mistakeLabel}>النوع:</Text>
                            <Text style={styles.mistakeValue}>{mistakeType}</Text>
                        </View>

                        {mistakeDetails ? (
                            <View style={styles.mistakeRow}>
                                <Text style={styles.mistakeLabel}>التفاصيل:</Text>
                                <Text style={styles.mistakeValue}>{mistakeDetails}</Text>
                            </View>
                        ) : null}

                        <Text style={styles.timestamp}>
                            {formatDate(item.created_at)}
                        </Text>
                    </View>
                </Card>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ModernBackground />
            <SafeAreaView style={styles.safeArea}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>أخطائي للمراجعة</Text>
                    <Text style={styles.subtitle}>التكرار هو سر الإتقان</Text>
                </View>

                {/* Mistakes List */}
                {loading ? (
                    <View style={styles.listContent}>
                        {[...Array(5)].map((_, index) => (
                            <Card key={index} style={styles.mistakeCard} variant="glass">
                                <SkeletonLoader width="50%" height={20} style={{ marginBottom: Spacing.sm }} />
                                <SkeletonLoader width="30%" height={16} style={{ marginBottom: Spacing.md }} />
                                <SkeletonLoader width="80%" height={14} style={{ marginBottom: Spacing.xs }} />
                                <SkeletonLoader width="40%" height={12} />
                            </Card>
                        ))}
                    </View>
                ) : mistakes.length === 0 ? (
                    <EmptyState
                        title="لا توجد أخطاء بعد! 🎉"
                        message="لم تُسجل أي خطأ حتى الآن. واصل عملك الرائع!"
                        icon={<AlertCircle size={64} color={Colors.emerald[400]} />}
                    />
                ) : (
                    <View style={{ flex: 1, height: '100%', width: '100%' }}>
                        <FlashList
                            data={mistakes}
                            renderItem={renderMistake}
                            // @ts-ignore
                            estimatedItemSize={200}
                            keyExtractor={(item) => item.id}
                            contentContainerStyle={styles.listContent}
                            showsVerticalScrollIndicator={false}
                            refreshControl={
                                <RefreshControl
                                    refreshing={refreshing}
                                    onRefresh={onRefresh}
                                    colors={[Colors.gold[400]]}
                                    tintColor={Colors.gold[400]}
                                />
                            }
                        />
                    </View>
                )}
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.neutral[950],
    },
    safeArea: {
        flex: 1,
    },
    header: {
        padding: Spacing.xl,
        paddingTop: Spacing['3xl'],
        paddingBottom: Spacing.xl,
    },
    title: {
        fontSize: Typography.fontSize['3xl'],
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        marginBottom: Spacing.xs,
    },
    subtitle: {
        fontSize: Typography.fontSize.base,
        color: Colors.text.tertiary,
    },
    listContent: {
        padding: Spacing.lg,
        paddingBottom: 100, // Space for tab bar
    },
    mistakeCard: {
        marginBottom: Spacing.md,
    },
    mistakeHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    mistakeInfo: {
        flex: 1,
    },
    surahName: {
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.semibold,
        color: Colors.text.inverse,
        marginBottom: Spacing.xs,
    },
    ayahNumber: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.tertiary,
        marginBottom: Spacing.sm,
    },
    deleteButton: {
        padding: Spacing.sm,
        borderRadius: BorderRadius.base,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
    },
    mistakeDetails: {
        marginTop: Spacing.sm,
        paddingTop: Spacing.sm,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.1)',
    },
    mistakeRow: {
        flexDirection: 'row',
        marginBottom: Spacing.xs,
        flexWrap: 'wrap',
    },
    mistakeLabel: {
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.semibold,
        color: Colors.text.primary,
        marginLeft: Spacing.sm,   // RTL: was marginRight
        minWidth: 70,
        textAlign: 'right',
    },
    mistakeValue: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.secondary,
        flex: 1,
    },
    timestamp: {
        fontSize: Typography.fontSize.xs,
        color: Colors.text.tertiary,
        marginTop: Spacing.sm,
    },
});
