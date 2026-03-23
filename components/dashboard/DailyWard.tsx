import * as React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Play, Mic, Lock, CheckCircle } from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import { getSurahByNumber } from '../../constants/surahs';
import Card from '../ui/Card';
import { lightImpact } from '../../lib/haptics';

interface DailyWardProps {
    dayNumber: number;
    versesRange: {
        surah: number;
        from_ayah: number;
        to_ayah: number;
    };
    taskType: 'Memorize' | 'Review';
    isUnlocked: boolean;
    isCompleted: boolean;
    estimatedTime?: number;
    onListen: () => void;
    onRecite: () => void;
}

export default function DailyWard({
    dayNumber,
    versesRange,
    taskType,
    isUnlocked,
    isCompleted,
    estimatedTime,
    onListen,
    onRecite,
}: DailyWardProps) {
    const handleListen = () => {
        lightImpact();
        if (!isUnlocked) {
            Alert.alert('مغلق', 'يجب إكمال الأوراد السابقة أولاً');
            return;
        }
        onListen();
    };

    const handleRecite = () => {
        lightImpact();
        if (!isUnlocked) {
            Alert.alert('مغلق', 'يجب إكمال الأوراد السابقة أولاً');
            return;
        }
        onRecite();
    };

    const getTaskTypeColor = () => {
        return taskType === 'Memorize' ? Colors.emerald[500] : Colors.gold[500];
    };

    const getTaskTypeIcon = () => {
        return taskType === 'Memorize' ? '📖' : '🔄';
    };

    return (
        <Card style={styles.container} variant="glass">
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.dayInfo}>
                    <Text style={styles.dayNumber}>اليوم {dayNumber}</Text>
                    <View style={[styles.taskTypeBadge, { backgroundColor: getTaskTypeColor() + '20' }]}>
                        <Text style={styles.taskTypeEmoji}>{getTaskTypeIcon()}</Text>
                        <Text style={[styles.taskTypeText, { color: getTaskTypeColor() }]}>
                            {taskType === 'Memorize' ? 'حفظ' : 'مراجعة'}
                        </Text>
                    </View>
                </View>

                {/* Status Badge */}
                {isCompleted ? (
                    <View style={styles.completedBadge}>
                        <CheckCircle size={20} color={Colors.emerald[500]} />
                        <Text style={styles.completedText}>مكتمل</Text>
                    </View>
                ) : !isUnlocked ? (
                    <View style={styles.lockedBadge}>
                        <Lock size={16} color={Colors.neutral[500]} />
                    </View>
                ) : null}
            </View>

            {/* Verses Info */}
            <View style={styles.versesInfo}>
                <Text style={styles.surahName}>سورة {getSurahName(versesRange.surah)}</Text>
                <Text style={styles.ayahRange}>
                    الآيات {versesRange.from_ayah} - {versesRange.to_ayah}
                </Text>
                {estimatedTime && (
                    <Text style={styles.estimatedTime}>⏱️ {estimatedTime} دقيقة تقريباً</Text>
                )}
            </View>

            {/* Action Buttons */}
            <View style={styles.actions}>
                <TouchableOpacity
                    style={[styles.button, styles.listenButton, !isUnlocked && styles.buttonDisabled]}
                    onPress={handleListen}
                    disabled={!isUnlocked}
                >
                    <Play size={20} color={isUnlocked ? Colors.text.inverse : Colors.neutral[600]} />
                    <Text style={[styles.buttonText, !isUnlocked && styles.buttonTextDisabled]}>
                        استمع
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.button, styles.reciteButton, !isUnlocked && styles.buttonDisabled]}
                    onPress={handleRecite}
                    disabled={!isUnlocked}
                >
                    <Mic size={20} color={isUnlocked ? Colors.text.inverse : Colors.neutral[600]} />
                    <Text style={[styles.buttonText, !isUnlocked && styles.buttonTextDisabled]}>
                        سمّع
                    </Text>
                </TouchableOpacity>
            </View>

            {!isUnlocked && (
                <Text style={styles.lockMessage}>
                    🔒 أكمل الأوراد السابقة لفتح هذا الورد
                </Text>
            )}
        </Card>
    );
}

// Helper function to get Surah name
function getSurahName(surahNumber: number): string {
    const surah = getSurahByNumber(surahNumber);
    return surah?.name || `سورة رقم ${surahNumber}`;
}

const styles = StyleSheet.create({
    container: {
        marginBottom: Spacing.lg,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    dayInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    dayNumber: {
        fontSize: Typography.fontSize.xl,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
    },
    taskTypeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.full,
    },
    taskTypeEmoji: {
        fontSize: Typography.fontSize.sm,
    },
    taskTypeText: {
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.semibold,
    },
    completedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xs,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderRadius: BorderRadius.full,
    },
    completedText: {
        fontSize: Typography.fontSize.sm,
        color: Colors.emerald[500],
        fontWeight: Typography.fontWeight.semibold,
    },
    lockedBadge: {
        padding: Spacing.sm,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: BorderRadius.full,
    },
    versesInfo: {
        marginBottom: Spacing.lg,
    },
    surahName: {
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.semibold,
        color: Colors.text.inverse,
        marginBottom: Spacing.xs,
    },
    ayahRange: {
        fontSize: Typography.fontSize.base,
        color: Colors.text.secondary,
        marginBottom: Spacing.xs,
    },
    estimatedTime: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.tertiary,
    },
    actions: {
        flexDirection: 'row',
        gap: Spacing.md,
    },
    button: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.lg,
    },
    listenButton: {
        backgroundColor: Colors.emerald[600],
    },
    reciteButton: {
        backgroundColor: Colors.gold[600],
    },
    buttonDisabled: {
        backgroundColor: Colors.neutral[800],
        opacity: 0.5,
    },
    buttonText: {
        fontSize: Typography.fontSize.base,
        fontWeight: Typography.fontWeight.semibold,
        color: Colors.text.inverse,
    },
    buttonTextDisabled: {
        color: Colors.neutral[600],
    },
    lockMessage: {
        marginTop: Spacing.md,
        fontSize: Typography.fontSize.sm,
        color: Colors.text.tertiary,
        textAlign: 'center',
    },
});
