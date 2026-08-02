import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Modal,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import Card from '../ui/Card';
import { RecitationAssessment } from '../../lib/recitation-storage';

interface FeedbackModalProps {
    visible: boolean;
    onClose: () => void;
    feedback: RecitationAssessment | null;
    saving: boolean;
    localSaved?: boolean;
}

export default function FeedbackModal({ visible, onClose, feedback, saving, localSaved = false }: FeedbackModalProps) {
    if (!feedback) return null;

    function getModelDisplayName(modelId?: string): string {
        switch (modelId) {
            case 'muaalem-api': return 'Muaalem Tajweed AI';
            case 'gemini-3.5-flash': return 'Gemini 3.5 Flash';
            case 'gemini-2.5-flash': return 'Gemini 2.5 Flash';
            case 'gemini-2.5-flash-lite': return 'Gemini 2.5 Flash Lite';
            default: return modelId || 'AI';
        }
    }

    function getSeverityColor(severity?: string) {
        switch (severity) {
            case 'critical': return Colors.error;
            case 'major': return Colors.error;
            case 'moderate': return Colors.warning;
            case 'minor': return Colors.gold[600];
            default: return Colors.neutral[500];
        }
    }

    function getCategoryLabel(category?: string) {
        switch (category) {
            case 'tajweed': return 'تجويد';
            case 'pronunciation': return 'نطق';
            case 'elongation': return 'مد';
            case 'waqf': return 'وقف';
            case 'omission': return 'حذف / نقص';
            default: return 'عام';
        }
    }

    function getSeverityLabel(severity?: string) {
        switch (severity) {
            case 'critical': return 'مهم جدًا';
            case 'major': return 'كبير';
            case 'moderate': return 'متوسط';
            case 'minor': return 'خفيف';
            default: return 'خفيف';
        }
    }

    const omissionMistakes = feedback.mistakes?.filter(m => m.category === 'omission') ?? [];
    const tajweedMistakes = feedback.mistakes?.filter(m => m.category !== 'omission') ?? [];
    const hasOmissions = omissionMistakes.length > 0;
    const totalMistakes = feedback.mistakes?.length ?? 0;
    const earnedXP = 10 + (totalMistakes === 0 ? 20 : 0);
    const masteryLabel = totalMistakes === 0
        ? 'متقن'
        : feedback.score >= 85
            ? 'جيد'
            : feedback.score >= 70
                ? 'قيد التثبيت'
                : 'يحتاج عناية';

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>تقييم التجويد</Text>

                    {/* AI Model Indicator */}
                    {feedback.modelUsed && (
                        <View style={styles.modelIndicator}>
                            <Text style={styles.modelIndicatorText}>
                                🧠 تم التقييم بواسطة {getModelDisplayName(feedback.modelUsed)}
                            </Text>
                        </View>
                    )}

                    {/* Saving Indicator */}
                    {saving && (
                        <View style={styles.savingContainer}>
                            <ActivityIndicator size="small" color={Colors.gold[600]} />
                            <Text style={styles.savingText}>جارٍ حفظ التقدم...</Text>
                        </View>
                    )}

                    {localSaved && (
                        <View style={styles.localSavedContainer}>
                            <Text style={styles.localSavedText}>
                                تم حفظ النتيجة على الجهاز وستتم المزامنة عند عودة الاتصال
                            </Text>
                        </View>
                    )}

                    <ScrollView showsVerticalScrollIndicator={false}>
                        <View style={styles.summaryGrid}>
                            <View style={styles.summaryItem}>
                                <Text style={styles.summaryValue}>{masteryLabel}</Text>
                                <Text style={styles.summaryLabel}>حالة الإتقان</Text>
                            </View>
                            <View style={styles.summaryItem}>
                                <Text style={styles.summaryValue}>{totalMistakes}</Text>
                                <Text style={styles.summaryLabel}>الأخطاء</Text>
                            </View>
                            <View style={styles.summaryItem}>
                                <Text style={styles.summaryValue}>+{earnedXP}</Text>
                                <Text style={styles.summaryLabel}>نقاط متوقعة</Text>
                            </View>
                        </View>

                        {/* Score */}
                        <View style={styles.scoreContainer}>
                            <View style={[styles.scoreCircle, { borderColor: feedback.score >= 90 ? Colors.success : feedback.score >= 70 ? Colors.warning : Colors.error }]}>
                                <Text style={[styles.scoreText, { color: feedback.score >= 90 ? Colors.success : feedback.score >= 70 ? Colors.warning : Colors.error }]}>
                                    {feedback.score}%
                                </Text>
                            </View>
                            <Text style={styles.scoreLabel}>
                                {hasOmissions ? 'الإتمام × الدقة' : 'الدقة الكلية'}
                            </Text>
                        </View>

                        {/* Omission Warning Banner */}
                        {hasOmissions && (
                            <View style={styles.omissionBanner}>
                                <AlertTriangle color="#fff" size={20} />
                                <Text style={styles.omissionBannerText}>
                                    لم تكتمل التلاوة — {omissionMistakes.length} آية/آيات ناقصة
                                </Text>
                            </View>
                        )}

                        {/* Omission Mistakes (shown first, prominently) */}
                        {omissionMistakes.map((mistake, index) => (
                            <View key={`omission-${index}`} style={styles.omissionCard}>
                                <View style={styles.omissionCardHeader}>
                                    <AlertTriangle color="#fff" size={16} />
                                    <Text style={styles.omissionCardTitle}>نقص في التلاوة</Text>
                                    <View style={styles.criticalBadge}>
                                        <Text style={styles.criticalBadgeText}>مهم</Text>
                                    </View>
                                </View>
                                <Text style={styles.omissionCardMissing}>{mistake.text}</Text>
                                <Text style={styles.omissionCardDesc}>{mistake.description}</Text>
                            </View>
                        ))}

                        {/* Tajweed Mistakes */}
                        {tajweedMistakes.length > 0 ? (
                            <View style={styles.mistakesSection}>
                                <Text style={styles.sectionTitle}>أخطاء التجويد:</Text>
                                {tajweedMistakes.map((mistake, index) => (
                                    <Card key={index} style={styles.mistakeCard}>
                                        <View style={styles.mistakeHeader}>
                                            <View style={[styles.categoryBadge, { backgroundColor: getSeverityColor(mistake.severity) + '20' }]}>
                                                <Text style={[styles.categoryText, { color: getSeverityColor(mistake.severity) }]}>
                                                    {getCategoryLabel(mistake.category)}
                                                </Text>
                                            </View>
                                            <View style={[styles.severityBadge, { backgroundColor: getSeverityColor(mistake.severity) }]}>
                                                <Text style={styles.severityText}>{getSeverityLabel(mistake.severity)}</Text>
                                            </View>
                                        </View>
                                        <Text style={styles.mistakeText}>
                                            <Text style={{ fontWeight: 'bold' }}>خطأ: </Text>
                                            {mistake.text}
                                        </Text>
                                        <Text style={styles.correctionText}>
                                            <Text style={{ fontWeight: 'bold' }}>الصواب: </Text>
                                            {mistake.correction}
                                        </Text>
                                        <Text style={styles.descriptionText}>{mistake.description}</Text>
                                    </Card>
                                ))}
                            </View>
                        ) : !hasOmissions ? (
                            <View style={styles.perfectContainer}>
                                <CheckCircle color={Colors.success} size={64} />
                                <Text style={styles.perfectText}>ما شاء الله!</Text>
                                <Text style={styles.perfectSubtext}>تلاوة ممتازة</Text>
                            </View>
                        ) : null}

                        {/* Close Button */}
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={onClose}
                        >
                            <Text style={styles.closeButtonText}>إغلاق</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#ffffff',
        borderTopLeftRadius: BorderRadius['2xl'],
        borderTopRightRadius: BorderRadius['2xl'],
        padding: Spacing.xl,
        maxHeight: '85%',
    },
    modalTitle: {
        fontSize: Typography.fontSize['2xl'],
        fontWeight: Typography.fontWeight.bold,
        color: Colors.emerald[950],
        textAlign: 'center',
        marginBottom: Spacing.xl,
    },
    modelIndicator: {
        backgroundColor: Colors.emerald[50],
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.full,
        alignSelf: 'center',
        marginBottom: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.emerald[200],
    },
    modelIndicatorText: {
        fontSize: Typography.fontSize.xs,
        color: Colors.emerald[700],
        fontWeight: Typography.fontWeight.medium,
    },
    savingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.lg,
        padding: Spacing.sm,
        backgroundColor: Colors.gold[50],
        borderRadius: BorderRadius.base,
    },
    savingText: {
        marginLeft: Spacing.sm,
        color: Colors.gold[700],
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.medium,
    },
    localSavedContainer: {
        backgroundColor: Colors.emerald[50],
        borderColor: Colors.emerald[200],
        borderWidth: 1,
        borderRadius: BorderRadius.base,
        padding: Spacing.sm,
        marginBottom: Spacing.md,
    },
    localSavedText: {
        color: Colors.emerald[800],
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.medium,
        textAlign: 'center',
    },
    summaryGrid: {
        flexDirection: 'row',
        gap: Spacing.sm,
        marginBottom: Spacing.lg,
    },
    summaryItem: {
        flex: 1,
        backgroundColor: Colors.neutral[100],
        borderRadius: BorderRadius.base,
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.sm,
        alignItems: 'center',
    },
    summaryValue: {
        color: Colors.emerald[800],
        fontSize: Typography.fontSize.base,
        fontWeight: Typography.fontWeight.bold,
        textAlign: 'center',
    },
    summaryLabel: {
        color: Colors.text.secondary,
        fontSize: Typography.fontSize.xs,
        marginTop: 4,
        textAlign: 'center',
    },
    scoreContainer: {
        alignItems: 'center',
        marginBottom: Spacing.xl,
    },
    scoreCircle: {
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    scoreText: {
        fontSize: Typography.fontSize['3xl'],
        fontWeight: Typography.fontWeight.bold,
    },
    scoreLabel: {
        fontSize: Typography.fontSize.base,
        color: Colors.text.secondary,
    },
    mistakesSection: {
        marginBottom: Spacing.xl,
    },
    sectionTitle: {
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.primary,
        marginBottom: Spacing.md,
    },
    mistakeCard: {
        marginBottom: Spacing.md,
    },
    mistakeHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: Spacing.sm,
    },
    categoryBadge: {
        paddingHorizontal: Spacing.sm,
        paddingVertical: 2,
        borderRadius: BorderRadius.sm,
    },
    categoryText: {
        fontSize: Typography.fontSize.xs,
        fontWeight: Typography.fontWeight.bold,
    },
    severityBadge: {
        paddingHorizontal: Spacing.sm,
        paddingVertical: 2,
        borderRadius: BorderRadius.full,
    },
    severityText: {
        color: Colors.text.inverse,
        fontSize: Typography.fontSize.xs,
        textTransform: 'capitalize',
    },
    mistakeText: {
        fontSize: Typography.fontSize.base,
        color: Colors.error,
        marginBottom: 2,
    },
    correctionText: {
        fontSize: Typography.fontSize.base,
        color: Colors.success,
        marginBottom: Spacing.xs,
    },
    descriptionText: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.secondary,
        fontStyle: 'italic',
    },
    perfectContainer: {
        alignItems: 'center',
        padding: Spacing.xl,
    },
    perfectText: {
        fontSize: Typography.fontSize['2xl'],
        fontWeight: Typography.fontWeight.bold,
        color: Colors.success,
        marginTop: Spacing.md,
        marginBottom: Spacing.xs,
    },
    perfectSubtext: {
        fontSize: Typography.fontSize.base,
        color: Colors.text.secondary,
    },
    omissionBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        backgroundColor: '#991b1b',
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginBottom: Spacing.md,
    },
    omissionBannerText: {
        color: '#fff',
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.bold,
        flex: 1,
        textAlign: 'right',
    },
    omissionCard: {
        backgroundColor: '#fef2f2',
        borderWidth: 2,
        borderColor: '#ef4444',
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginBottom: Spacing.md,
    },
    omissionCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        backgroundColor: '#dc2626',
        borderRadius: BorderRadius.base,
        padding: Spacing.sm,
        marginBottom: Spacing.sm,
    },
    omissionCardTitle: {
        color: '#fff',
        fontWeight: Typography.fontWeight.bold,
        fontSize: Typography.fontSize.sm,
        flex: 1,
        textAlign: 'right',
    },
    criticalBadge: {
        backgroundColor: '#7f1d1d',
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.xs,
        paddingVertical: 2,
    },
    criticalBadgeText: {
        color: '#fca5a5',
        fontSize: Typography.fontSize.xs,
        fontWeight: Typography.fontWeight.bold,
    },
    omissionCardMissing: {
        color: '#991b1b',
        fontSize: Typography.fontSize.base,
        fontWeight: Typography.fontWeight.bold,
        textAlign: 'right',
        marginBottom: Spacing.xs,
    },
    omissionCardDesc: {
        color: '#b91c1c',
        fontSize: Typography.fontSize.sm,
        textAlign: 'right',
    },
    closeButton: {
        backgroundColor: Colors.emerald[950],
        padding: Spacing.lg,
        borderRadius: BorderRadius.lg,
        alignItems: 'center',
        marginTop: Spacing.lg,
        marginBottom: Spacing.xl,
    },
    closeButtonText: {
        color: Colors.text.inverse,
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.bold,
    },
});
