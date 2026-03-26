/**
 * components/recite/RecordingControls.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Recording UI component with:
 *   - Real-time waveform driven by actual metering data (no more Math.random())
 *   - VAD chunk indicator showing how many chunks have been sent/completed
 *   - Finish button that stops the session and triggers aggregated feedback
 * ──────────────────────────────────────────────────────────────────────────────
 */

import * as React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withSequence,
} from 'react-native-reanimated';
import { Mic, Square, CheckCircle } from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import { mediumImpact } from '../../lib/haptics';

interface RecordingControlsProps {
    recording: boolean;
    onStartRecording: () => void;
    onStopRecording: () => void;
    analyzing: boolean;
    /** Detailed upload progress step for user feedback */
    uploadStep?: 'idle' | 'uploading' | 'analyzing' | 'saving';
    recordingDuration?: number;
    accentColor: string;
    /** Real-time metering history (0-1 normalised), 20 values from useVADRecorder */
    meterHistory?: number[];
    /** Number of VAD chunks sent to Muaalem API */
    chunksSent?: number;
    /** Number of VAD chunks that finished analysis */
    chunksCompleted?: number;
    /** Whether VAD finishing (waiting for last chunks) */
    isFinishing?: boolean;
}

export default function RecordingControls({
    recording,
    onStartRecording,
    onStopRecording,
    analyzing,
    uploadStep = 'idle',
    recordingDuration = 0,
    accentColor,
    meterHistory,
    chunksSent = 0,
    chunksCompleted = 0,
    isFinishing = false,
}: RecordingControlsProps) {
    const pulseScale = useSharedValue(1);

    // Pulse animation for recording state
    React.useEffect(() => {
        if (recording) {
            pulseScale.value = withRepeat(
                withSequence(
                    withTiming(1.1, { duration: 800 }),
                    withTiming(1, { duration: 800 })
                ),
                -1,
                false
            );
        } else {
            pulseScale.value = withTiming(1, { duration: 300 });
        }
    }, [recording]);

    const pulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulseScale.value }],
    }));

    const handleRecordPress = () => {
        mediumImpact();
        if (recording) {
            onStopRecording();
        } else if (!analyzing && !isFinishing) {
            onStartRecording();
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // ── Finishing state (waiting for chunk results) ───────────────────────────
    if (isFinishing) {
        return (
            <View style={styles.analyzingContainer}>
                <Text style={styles.analyzingIcon}>{'🔄'}</Text>
                <ActivityIndicator size="large" color={accentColor} />
                <Text style={[styles.analyzingText, { color: accentColor }]}>
                    جارٍ تجميع نتائج التحليل...
                </Text>
                <Text style={styles.analyzingHint}>
                    تم تحليل {chunksCompleted} من {chunksSent} مقاطع
                </Text>
                {/* Chunk progress bar */}
                <View style={styles.chunkProgressBar}>
                    <View
                        style={[
                            styles.chunkProgressFill,
                            {
                                width: chunksSent > 0
                                    ? `${(chunksCompleted / chunksSent) * 100}%`
                                    : '0%',
                                backgroundColor: accentColor,
                            },
                        ]}
                    />
                </View>
            </View>
        );
    }

    // ── Analyzing state (legacy single-shot or final save) ───────────────────
    if (analyzing) {
        const stepConfig = {
            uploading: {
                icon: '☁️',
                title: 'جارٍ رفع التسجيل...',
                hint: 'يتم رفع الملف الصوتي بأمان',
            },
            analyzing: {
                icon: '🧠',
                title: 'يحلل Muaalem تلاوتك...',
                hint: 'يجري تحليل التجويد والنطق والمخارج',
            },
            saving: {
                icon: '✅',
                title: 'يحفظ التقدم...',
                hint: 'يتم تحديث خطتك ونقاط XP',
            },
            idle: {
                icon: '⏳',
                title: 'يجهز التحليل...',
                hint: 'الرجاء الانتظار',
            },
        };
        const step = stepConfig[uploadStep] ?? stepConfig.idle;

        return (
            <View style={styles.analyzingContainer}>
                <Text style={styles.analyzingIcon}>{step.icon}</Text>
                <ActivityIndicator size="large" color={accentColor} />
                <Text style={[styles.analyzingText, { color: accentColor }]}>
                    {step.title}
                </Text>
                <Text style={styles.analyzingHint}>
                    {step.hint}
                </Text>
                {/* Step dots */}
                <View style={styles.stepDots}>
                    {(['uploading', 'analyzing', 'saving'] as const).map((s) => (
                        <View
                            key={s}
                            style={[
                                styles.stepDot,
                                {
                                    backgroundColor:
                                        uploadStep === s ? accentColor
                                        : uploadStep === 'saving' && s !== 'saving' ? accentColor + '80'
                                        : uploadStep === 'analyzing' && s === 'uploading' ? accentColor + '80'
                                        : 'rgba(255,255,255,0.15)',
                                },
                            ]}
                        />
                    ))}
                </View>
            </View>
        );
    }

    // ── Main recording / idle UI ─────────────────────────────────────────────

    return (
        <View style={styles.container}>
            {/* Real waveform from metering data */}
            {recording && (
                <View style={styles.waveformContainer}>
                    {(meterHistory || new Array(20).fill(0)).map((level, i) => (
                        <View
                            key={i}
                            style={[
                                styles.waveformBar,
                                {
                                    // Real metering: map 0-1 → 4px to 40px height
                                    height: Math.max(4, level * 40),
                                    backgroundColor: accentColor,
                                    opacity: 0.5 + level * 0.5,
                                },
                            ]}
                        />
                    ))}
                </View>
            )}

            {/* VAD chunk indicator */}
            {recording && chunksSent > 0 && (
                <View style={styles.chunkIndicator}>
                    <CheckCircle size={12} color={Colors.success} />
                    <Text style={styles.chunkIndicatorText}>
                        {chunksCompleted}/{chunksSent} مقاطع تم تحليلها
                    </Text>
                </View>
            )}

            {/* Recording Button */}
            <View style={styles.recordButtonContainer}>
                {recording && (
                    <Animated.View
                        style={[
                            styles.pulseRing,
                            pulseStyle,
                            { borderColor: Colors.error },
                        ]}
                        pointerEvents="none"
                    />
                )}
                <TouchableOpacity
                    style={[
                        styles.recordButton,
                        recording && { backgroundColor: Colors.error },
                        !recording && { backgroundColor: accentColor },
                    ]}
                    onPress={handleRecordPress}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityLabel={recording ? 'إنهاء التسجيل' : 'بدء التسجيل'}
                >
                    {recording ? (
                        <Square color={Colors.text.inverse} size={32} fill={Colors.text.inverse} />
                    ) : (
                        <Mic color={Colors.text.inverse} size={32} />
                    )}
                </TouchableOpacity>
            </View>

            {/* Recording Status */}
            <View style={styles.statusContainer}>
                <Text style={styles.statusText}>
                    {recording ? `تسجيل: ${formatTime(recordingDuration)}` : 'اضغط للتسجيل'}
                </Text>
                {recording && (
                    <Text style={styles.hintText}>
                        يتم تقطيع الصوت تلقائياً عند السكوت • اضغط ■ للإنهاء
                    </Text>
                )}
                {!recording && (
                    <Text style={styles.hintText}>
                        اقرأ الآيات المحددة بصوت واضح
                    </Text>
                )}
            </View>

            {/* Recording Tips */}
            {!recording && (
                <View style={styles.tipsContainer}>
                    <Text style={styles.tipsTitle}>📝 نصائح التسجيل:</Text>
                    <Text style={styles.tipText}>• ابحث عن بيئة هادئة</Text>
                    <Text style={styles.tipText}>• تحدث بوضوح وبسرعة معتدلة</Text>
                    <Text style={styles.tipText}>• امسك جهازك بثبات</Text>
                    <Text style={styles.tipText}>• التقطيع التلقائي يعمل عند السكوت 1.5 ثانية</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        gap: Spacing.md,
    },
    waveformContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        height: 44,
        marginBottom: Spacing.sm,
    },
    waveformBar: {
        width: 3,
        borderRadius: 2,
        minHeight: 4,
    },
    chunkIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        paddingHorizontal: Spacing.sm,
        paddingVertical: 3,
        borderRadius: BorderRadius.full,
    },
    chunkIndicatorText: {
        fontSize: Typography.fontSize.xs,
        color: Colors.success,
        fontWeight: Typography.fontWeight.semibold,
    },
    recordButtonContainer: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
        width: 88,
        height: 88,
    },
    pulseRing: {
        position: 'absolute',
        width: 88,
        height: 88,
        borderRadius: 44,
        borderWidth: 3,
        opacity: 0.5,
    },
    recordButton: {
        width: 72,
        height: 72,
        borderRadius: 36,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    statusContainer: {
        alignItems: 'center',
        gap: Spacing.xs,
    },
    statusText: {
        fontSize: Typography.fontSize.base,
        fontWeight: Typography.fontWeight.semibold,
        color: Colors.neutral[200],
    },
    hintText: {
        fontSize: Typography.fontSize.xs,
        color: Colors.neutral[400],
        textAlign: 'center',
    },
    analyzingContainer: {
        alignItems: 'center',
        gap: Spacing.sm,
        paddingVertical: Spacing.lg,
    },
    analyzingIcon: {
        fontSize: 36,
    },
    analyzingText: {
        fontSize: Typography.fontSize.base,
        fontWeight: Typography.fontWeight.bold,
        textAlign: 'center',
    },
    analyzingHint: {
        fontSize: Typography.fontSize.sm,
        color: Colors.neutral[400],
        textAlign: 'center',
    },
    stepDots: {
        flexDirection: 'row',
        gap: 8,
        marginTop: Spacing.xs,
    },
    stepDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    chunkProgressBar: {
        width: '60%',
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 2,
        overflow: 'hidden',
        marginTop: Spacing.sm,
    },
    chunkProgressFill: {
        height: '100%',
        borderRadius: 2,
    },
    tipsContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        width: '100%',
        marginTop: Spacing.sm,
    },
    tipsTitle: {
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.semibold,
        color: Colors.neutral[200],
        marginBottom: Spacing.xs,
    },
    tipText: {
        fontSize: Typography.fontSize.xs,
        color: Colors.neutral[400],
        marginBottom: 2,
        textAlign: 'right',
    },
});
