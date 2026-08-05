import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    ActivityIndicator,
    ScrollView,
    Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Mic, MicOff, Volume2, X, Sparkles, Radio } from 'lucide-react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withSequence,
    Easing,
} from 'react-native-reanimated';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import { LiveMuaalemSession, LiveSessionState } from '../../lib/live-muaalem-service';
import { lightImpact, successHaptic } from '../../lib/haptics';

interface Props {
    visible: boolean;
    onClose: () => void;
    surahName?: string;
}

export default function LiveMuaalemModal({ visible, onClose, surahName }: Props) {
    const [sessionState, setSessionState] = React.useState<LiveSessionState>({
        isConnected: false,
        isListening: false,
        isSpeaking: false,
        statusMessage: 'جاهز لبدء جلسة التسميع الصوتية المباشرة',
        lastTranscript: '',
        tajweedFeedback: null,
    });

    const sessionRef = React.useRef<LiveMuaalemSession | null>(null);
    const pulseAnim = useSharedValue(1);

    React.useEffect(() => {
        if (visible) {
            pulseAnim.value = withRepeat(
                withSequence(
                    withTiming(1.2, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
                    withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
                ),
                -1,
                true
            );
        }
    }, [visible]);

    const pulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulseAnim.value }],
    }));

    const handleStartSession = () => {
        lightImpact();
        if (!sessionRef.current) {
            sessionRef.current = new LiveMuaalemSession((newState) => {
                setSessionState(newState);
            });
        }
        sessionRef.current.startSession(surahName);
    };

    const handleStopSession = () => {
        successHaptic();
        if (sessionRef.current) {
            sessionRef.current.stopSession();
        }
    };

    const handleClose = () => {
        if (sessionRef.current) {
            sessionRef.current.stopSession();
        }
        onClose();
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
            <View style={styles.overlay}>
                <View style={styles.modalCard}>
                    <LinearGradient
                        colors={['#064e3b', '#022c22']}
                        style={StyleSheet.absoluteFill}
                    />
                    {Platform.OS !== 'android' ? (
                        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                    ) : null}

                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.badgeRow}>
                            <View style={styles.liveTag}>
                                <Radio color="#10b981" size={14} />
                                <Text style={styles.liveTagText}>جلسة حية بدون حدود (Live API)</Text>
                            </View>
                        </View>
                        <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                            <X color="#ffffff" size={20} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView contentContainerStyle={styles.content}>
                        <Text style={styles.title}>المعلم الصوتي المباشر</Text>
                        <Text style={styles.subtitle}>
                            {surahName ? `تسميع مباشر لسورة ${surahName}` : 'تسميع حر ومباشر مع المعلم الآلي'}
                        </Text>

                        {/* Animated Visualizer Circle */}
                        <View style={styles.visualizerContainer}>
                            <Animated.View style={[styles.pulseCircle, pulseStyle]} />
                            <TouchableOpacity
                                style={styles.micCircle}
                                onPress={sessionState.isConnected ? handleStopSession : handleStartSession}
                            >
                                <LinearGradient
                                    colors={sessionState.isConnected ? ['#10b981', '#059669'] : ['#d97706', '#b45309']}
                                    style={styles.micGradient}
                                >
                                    {sessionState.isSpeaking ? (
                                        <Volume2 color="#ffffff" size={40} />
                                    ) : sessionState.isConnected ? (
                                        <Mic color="#ffffff" size={40} />
                                    ) : (
                                        <Radio color="#ffffff" size={40} />
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>

                        {/* Status Message */}
                        <Text style={styles.statusText}>{sessionState.statusMessage}</Text>

                        {/* Feedback Card */}
                        {sessionState.tajweedFeedback ? (
                            <View style={styles.feedbackCard}>
                                <View style={styles.feedbackHeader}>
                                    <Sparkles color="#f59e0b" size={18} />
                                    <Text style={styles.feedbackTitle}>توجيه المعلم اللحظي</Text>
                                </View>
                                <Text style={styles.feedbackContent}>{sessionState.tajweedFeedback}</Text>
                            </View>
                        ) : null}

                        {/* Action Buttons */}
                        <View style={styles.actionContainer}>
                            {!sessionState.isConnected ? (
                                <TouchableOpacity style={styles.startBtn} onPress={handleStartSession}>
                                    <LinearGradient
                                        colors={['#10b981', '#059669']}
                                        style={styles.btnGradient}
                                    >
                                        <Radio color="#ffffff" size={20} />
                                        <Text style={styles.btnText}>بدء الجلسة الصوتية المباشرة</Text>
                                    </LinearGradient>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity style={styles.stopBtn} onPress={handleStopSession}>
                                    <LinearGradient
                                        colors={['#ef4444', '#dc2626']}
                                        style={styles.btnGradient}
                                    >
                                        <MicOff color="#ffffff" size={20} />
                                        <Text style={styles.btnText}>إنهاء الجلسة الصوتيّة</Text>
                                    </LinearGradient>
                                </TouchableOpacity>
                            )}
                        </View>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        justifyContent: 'flex-end',
    },
    modalCard: {
        height: '75%',
        borderTopLeftRadius: BorderRadius['2xl'],
        borderTopRightRadius: BorderRadius['2xl'],
        overflow: 'hidden',
        padding: Spacing.lg,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    badgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    liveTag: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        paddingHorizontal: Spacing.sm,
        paddingVertical: 4,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: '#10b981',
        gap: 6,
    },
    liveTagText: {
        color: '#10b981',
        fontSize: 12,
        fontFamily: Typography.fontFamily.arabicBold,
    },
    closeBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        alignItems: 'center',
        paddingBottom: Spacing['2xl'],
    },
    title: {
        color: '#ffffff',
        fontSize: 22,
        fontFamily: Typography.fontFamily.arabicBold,
        marginTop: Spacing.sm,
    },
    subtitle: {
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: 14,
        fontFamily: Typography.fontFamily.arabic,
        marginTop: 4,
        marginBottom: Spacing.xl,
    },
    visualizerContainer: {
        width: 140,
        height: 140,
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: Spacing.lg,
    },
    pulseCircle: {
        position: 'absolute',
        width: 130,
        height: 130,
        borderRadius: 65,
        backgroundColor: 'rgba(16, 185, 129, 0.25)',
    },
    micCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        overflow: 'hidden',
        elevation: 8,
    },
    micGradient: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statusText: {
        color: '#f59e0b',
        fontSize: 15,
        fontFamily: Typography.fontFamily.arabic,
        textAlign: 'center',
        marginVertical: Spacing.md,
    },
    feedbackCard: {
        width: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.3)',
        marginVertical: Spacing.md,
    },
    feedbackHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
    },
    feedbackTitle: {
        color: '#f59e0b',
        fontSize: 14,
        fontFamily: Typography.fontFamily.arabicBold,
    },
    feedbackContent: {
        color: '#ffffff',
        fontSize: 14,
        fontFamily: Typography.fontFamily.arabic,
        lineHeight: 20,
        textAlign: 'right',
    },
    actionContainer: {
        width: '100%',
        marginTop: Spacing.lg,
    },
    startBtn: {
        borderRadius: BorderRadius.lg,
        overflow: 'hidden',
    },
    stopBtn: {
        borderRadius: BorderRadius.lg,
        overflow: 'hidden',
    },
    btnGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        gap: 8,
    },
    btnText: {
        color: '#ffffff',
        fontSize: 16,
        fontFamily: Typography.fontFamily.arabicBold,
    },
});
