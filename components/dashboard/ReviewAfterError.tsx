import * as React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert } from 'react-native';
import { AlertTriangle, Mic, CheckCircle2 } from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import Card from '../ui/Card';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { lightImpact } from '../../lib/haptics';

interface ErrorLog {
    id: string;
    verse_id: string;
    surah_number: number;
    ayah_number: number;
    error_count: number;
    successful_attempts: number;
    error_details: string;
}

interface ReviewAfterErrorProps {
    onReciteVerse: (surahNumber: number, ayahNumber: number) => void;
}

export default function ReviewAfterError({ onReciteVerse }: ReviewAfterErrorProps) {
    const { user } = useAuth();
    const [errors, setErrors] = React.useState<ErrorLog[]>([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        loadErrors();
    }, []);

    async function loadErrors() {
        try {
            if (!user) return;

            const { data, error } = await supabase
                .from('error_logs')
                .select('*')
                .eq('user_id', user.id)
                .eq('cleared', false)
                .order('error_count', { ascending: false });

            if (error) throw error;
            setErrors(data || []);
        } catch (error) {
            console.error('Error loading error logs:', error);
        } finally {
            setLoading(false);
        }
    }

    const handleRecite = (error: ErrorLog) => {
        lightImpact();
        onReciteVerse(error.surah_number, error.ayah_number);
    };

    const renderError = ({ item }: { item: ErrorLog }) => {
        const progress = item.successful_attempts;
        const needed = 3;
        const progressPercent = (progress / needed) * 100;

        return (
            <Card style={styles.errorCard} variant="glass">
                <View style={styles.errorHeader}>
                    <View style={styles.errorInfo}>
                        <View style={styles.verseId}>
                            <AlertTriangle size={16} color={Colors.error} />
                            <Text style={styles.verseIdText}>
                                {item.verse_id}
                            </Text>
                        </View>
                        <Text style={styles.errorCount}>
                            {item.error_count} {item.error_count === 1 ? 'خطأ' : 'أخطاء'}
                        </Text>
                    </View>

                    <TouchableOpacity
                        style={styles.reciteButton}
                        onPress={() => handleRecite(item)}
                    >
                        <Mic size={18} color={Colors.text.inverse} />
                        <Text style={styles.reciteButtonText}>سمّع</Text>
                    </TouchableOpacity>
                </View>

                {/* Progress Bar */}
                <View style={styles.progressSection}>
                    <Text style={styles.progressLabel}>
                        التقدم: {progress}/3 محاولات ناجحة
                    </Text>
                    <View style={styles.progressBar}>
                        <View
                            style={[
                                styles.progressFill,
                                { width: `${progressPercent}%` },
                            ]}
                        />
                    </View>
                </View>

                {/* Success Indicators */}
                <View style={styles.successIndicators}>
                    {[1, 2, 3].map((num) => (
                        <View
                            key={num}
                            style={[
                                styles.successDot,
                                progress >= num && styles.successDotActive,
                            ]}
                        >
                            {progress >= num && (
                                <CheckCircle2 size={12} color={Colors.emerald[500]} />
                            )}
                        </View>
                    ))}
                </View>
            </Card>
        );
    };

    if (loading) {
        return (
            <Card style={styles.container} variant="glass">
                <Text style={styles.loadingText}>جاري التحميل...</Text>
            </Card>
        );
    }

    if (errors.length === 0) {
        return (
            <Card style={styles.container} variant="glass">
                <View style={styles.emptyState}>
                    <CheckCircle2 size={48} color={Colors.emerald[500]} />
                    <Text style={styles.emptyTitle}>ممتاز! 🎉</Text>
                    <Text style={styles.emptyMessage}>
                        لا توجد أخطاء تحتاج مراجعة
                    </Text>
                </View>
            </Card>
        );
    }

    return (
        <Card style={styles.container} variant="glass">
            <View style={styles.header}>
                <AlertTriangle size={24} color={Colors.gold[500]} />
                <Text style={styles.title}>مراجعة بعد الخطأ</Text>
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>{errors.length}</Text>
                </View>
            </View>

            <Text style={styles.subtitle}>
                سمّع كل آية 3 مرات بشكل صحيح لإزالتها من القائمة
            </Text>

            <FlatList
                data={errors}
                renderItem={renderError}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                contentContainerStyle={styles.list}
            />
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
        gap: Spacing.sm,
        marginBottom: Spacing.sm,
    },
    title: {
        flex: 1,
        fontSize: Typography.fontSize.xl,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
    },
    badge: {
        backgroundColor: Colors.error + '20',
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.full,
    },
    badgeText: {
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.error,
    },
    subtitle: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.secondary,
        marginBottom: Spacing.md,
    },
    list: {
        gap: Spacing.md,
    },
    errorCard: {
        padding: Spacing.md,
    },
    errorHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    errorInfo: {
        flex: 1,
    },
    verseId: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        marginBottom: Spacing.xs,
    },
    verseIdText: {
        fontSize: Typography.fontSize.base,
        fontWeight: Typography.fontWeight.semibold,
        color: Colors.text.inverse,
    },
    errorCount: {
        fontSize: Typography.fontSize.sm,
        color: Colors.error,
    },
    reciteButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        backgroundColor: Colors.gold[600],
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.lg,
    },
    reciteButtonText: {
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.semibold,
        color: Colors.text.inverse,
    },
    progressSection: {
        marginBottom: Spacing.sm,
    },
    progressLabel: {
        fontSize: Typography.fontSize.xs,
        color: Colors.text.tertiary,
        marginBottom: Spacing.xs,
    },
    progressBar: {
        height: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: BorderRadius.full,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: Colors.emerald[500],
        borderRadius: BorderRadius.full,
    },
    successIndicators: {
        flexDirection: 'row',
        gap: Spacing.xs,
    },
    successDot: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    successDotActive: {
        backgroundColor: Colors.emerald[500] + '20',
    },
    loadingText: {
        fontSize: Typography.fontSize.base,
        color: Colors.text.secondary,
        textAlign: 'center',
        padding: Spacing.xl,
    },
    emptyState: {
        alignItems: 'center',
        padding: Spacing.xl,
    },
    emptyTitle: {
        fontSize: Typography.fontSize.xl,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        marginTop: Spacing.md,
        marginBottom: Spacing.xs,
    },
    emptyMessage: {
        fontSize: Typography.fontSize.base,
        color: Colors.text.secondary,
        textAlign: 'center',
    },
});
