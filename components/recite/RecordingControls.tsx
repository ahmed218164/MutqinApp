import * as React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withSequence,
} from 'react-native-reanimated';
import { Mic, Square } from 'lucide-react-native';
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
}

export default function RecordingControls({
    recording,
    onStartRecording,
    onStopRecording,
    analyzing,
    uploadStep = 'idle',
    recordingDuration = 0,
    accentColor,
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
            // Immediately call stop - parent handles state
            onStopRecording();
        } else if (!analyzing) {
            onStartRecording();
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (analyzing) {
        // ✔️ Detailed step-by-step feedback
        const stepConfig = {
            uploading: {
                icon: '☁️',
                title: 'جارٍ رفع التسجيل...',
                hint: 'يتم رفع الملف الصوتي بأمان',
            },
            analyzing: {
                icon: '🧠',
                title: 'يحلل Gemini تلاوتك...',
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

    return (
        <View style={styles.container}>
            {recording && (
                <View style={styles.waveformContainer}>
                    {[...Array(20)].map((_, i) => (
                        <Animated.View
                            key={i}
                            style={[
                                styles.waveformBar,
                                {
                                    height: Math.random() * 30 + 10,
                                    backgroundColor: accentColor,
                                },
                            ]}
                        />
                    ))}
                </View>
            )}

            {/* Recording Button — pulse ring is a sibling, NOT a wrapper, to preserve touch hit area */}
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
                    accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
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
                    {recording ? `Recording: ${formatTime(recordingDuration)}` : 'Tap to Record'}
                </Text>
                {!recording && (
                    <Text style={styles.hintText}>
                        Recite the selected verses clearly
                    </Text>
                )}
            </View>

            {/* Recording Tips */}
            {!recording && (
                <View style={styles.tipsContainer}>
                    <Text style={styles.tipsTitle}>📝 Recording Tips:</Text>
                    <Text style={styles.tipText}>• Find a quiet environment</Text>
                    <Text style={styles.tipText}>• Speak clearly and at a moderate pace</Text>
                    <Text style={styles.tipText}>• Hold your device steady</Text>
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
        height: 40,
        marginBottom: Spacing.sm,
    },
    waveformBar: {
        width: 3,
        borderRadius: 2,
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
    },
});
