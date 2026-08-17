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
import { Mic, MicOff, Volume2, X, Sparkles, Radio, Square, Activity } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
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
    surahNumber?: number;
}

export default function LiveMuaalemModal({ visible, onClose, surahName, surahNumber }: Props) {
    const router = useRouter();
    const [sessionState, setSessionState] = React.useState<LiveSessionState>({
        isConnected: false,
        isListening: false,
        isSpeaking: false,
        isLiveStreamMode: false,
        statusMessage: 'جاهز لبدء جلسة التسميع الصوتية المباشرة',
        lastTranscript: '',
        tajweedFeedback: null,
        audioLevel: 0,
    });

    const sessionRef = React.useRef<LiveMuaalemSession | null>(null);
    const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
    const [isRecording, setIsRecording] = React.useState(false);
    const [isReviewing, setIsReviewing] = React.useState(false);
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

    // Animate visualizer based on audioLevel when active
    React.useEffect(() => {
        if (sessionState.audioLevel > 0) {
            const scale = 1 + sessionState.audioLevel * 0.4;
            pulseAnim.value = withTiming(scale, { duration: 100 });
        }
    }, [sessionState.audioLevel]);

    const pulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulseAnim.value }],
    }));

    const handleStartSession = async () => {
        lightImpact();
        if (!sessionRef.current) {
            sessionRef.current = new LiveMuaalemSession((newState) => {
                setSessionState(newState);
            });
        }

        try {
            const permission = await requestRecordingPermissionsAsync();
            if (!permission.granted) {
                setSessionState((current) => ({
                    ...current,
                    statusMessage: 'نحتاج إلى إذن الميكروفون لبدء التسميع.',
                }));
                return;
            }

            await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

            // Start Live Muaalem Session (detects native PCM stream vs HTTP Fallback)
            await sessionRef.current.startSession(surahName);

            const isNative = sessionRef.current.isNativeStreamSupported();
            if (!isNative) {
                // Prepare fallback expo-audio recorder
                await audioRecorder.prepareToRecordAsync();
                audioRecorder.record();
            }

            setIsRecording(true);
        } catch (error) {
            console.warn('[Live Muaalem] Session start failed:', error);
            setSessionState((current) => ({
                ...current,
                statusMessage: 'تعذّر بدء التسجيل. تأكد من إذن الميكروفون ثم حاول مجدداً.',
            }));
        }
    };

    const handleStopSession = async () => {
        successHaptic();
        if (!isRecording) return;

        try {
            setIsRecording(false);
            const isNative = sessionRef.current?.isNativeStreamSupported();

            if (isNative && sessionState.isLiveStreamMode) {
                // In Live PCM mode, stopSession closes stream gracefully
                sessionRef.current?.stopSession();
            } else {
                // In Fallback mode, complete the audio recording and send to review
                setIsReviewing(true);
                await audioRecorder.stop();
                const uri = audioRecorder.uri;
                if (!uri || !sessionRef.current) {
                    setSessionState((current) => ({
                        ...current,
                        statusMessage: 'لم يُحفظ مقطع صوتي صالح. جرّب التسجيل مرة أخرى.',
                    }));
                    return;
                }
                const audio = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
                await sessionRef.current.reviewRecordedAudio(audio, 'audio/m4a', surahName);
            }
        } catch (error) {
            console.warn('[Live Muaalem] Recording review/stop failed:', error);
            setSessionState((current) => ({
                ...current,
                statusMessage: 'تعذّر تحليل المقطع. يمكنك الانتقال إلى وضع التسميع المتقدم.',
            }));
        } finally {
            setIsReviewing(false);
        }
    };

    const handleAdvancedRecitation = () => {
        handleClose();
        if (surahNumber) {
            router.push({
                pathname: '/recite',
                params: { surahNumber: surahNumber.toString(), surahName: surahName ?? '' },
            });
        } else {
            router.push('/free-recite');
        }
    };

    const handleClose = () => {
        if (sessionRef.current) {
            sessionRef.current.stopSession();
        }
        if (isRecording) {
            audioRecorder.stop().catch(() => {});
            setIsRecording(false);
        }
        onClose();
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
            <View style={styles.overlay}>
                <View style={styles.modalCard}>
                    <LinearGradient
                        colors={[Colors.emerald[900], Colors.emerald[950]]}
                        style={StyleSheet.absoluteFill}
                    />
                    {Platform.OS !== 'android' ? (
                        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                    ) : null}

                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.badgeRow}>
                            <View style={[styles.liveTag, sessionState.isLiveStreamMode ? styles.liveTagStreaming : null]}>
                                {sessionState.isLiveStreamMode ? (
                                    <Activity color={Colors.emerald[500]} size={14} />
                                ) : (
                                    <Radio color={Colors.emerald[500]} size={14} />
                                )}
                                <Text style={styles.liveTagText}>
                                    {sessionState.isLiveStreamMode
                                        ? 'بث صوتي خام فوري (Live PCM)'
                                        : 'المعلم المباشر الذكي (Gemini Live)'}
                                </Text>
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
                            <Animated.View
                                style={[
                                    styles.pulseCircle,
                                    pulseStyle,
                                    sessionState.isSpeaking
                                        ? styles.pulseSpeaking
                                        : sessionState.audioLevel > 0.1
                                        ? styles.pulseActive
                                        : null,
                                ]}
                            />
                            <TouchableOpacity
                                style={styles.micCircle}
                                onPress={isRecording ? handleStopSession : handleStartSession}
                                disabled={isReviewing}
                            >
                                <LinearGradient
                                    colors={isRecording ? [Colors.error, '#dc2626'] : [Colors.emerald[500], Colors.emerald[600]]}
                                    style={styles.micGradient}
                                >
                                    {isReviewing ? (
                                        <ActivityIndicator color="#ffffff" size="large" />
                                    ) : sessionState.isSpeaking ? (
                                        <Volume2 color="#ffffff" size={40} />
                                    ) : isRecording ? (
                                        <Square color="#ffffff" size={34} fill="#ffffff" />
                                    ) : (
                                        <Mic color="#ffffff" size={40} />
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>

                        {/* Status Message */}
                        <Text style={styles.statusText}>{sessionState.statusMessage}</Text>

                        <View style={styles.howItWorks}>
                            <Text style={styles.howItWorksTitle}>كيف تعمل الجلسة؟</Text>
                            <Text style={styles.howItWorksText}>
                                {sessionState.isLiveStreamMode
                                    ? 'يتم بث صوتك خاماً 16kHz PCM مباشرة إلى المعلم الذكي مع تلقي التوجيهات الفورية أثناء التلاوة.'
                                    : 'سجّل تلاوتك ثم اضغط إنهاء لتحصل على تحليل تجويدي فوري للمخارج والمدود والوقف.'}
                            </Text>
                        </View>

                        {/* Feedback Card */}
                        {sessionState.tajweedFeedback ? (
                            <View style={styles.feedbackCard}>
                                <View style={styles.feedbackHeader}>
                                    <Sparkles color={Colors.gold[500]} size={18} />
                                    <Text style={styles.feedbackTitle}>توجيه المعلم اللحظي</Text>
                                </View>
                                <Text style={styles.feedbackContent}>{sessionState.tajweedFeedback}</Text>
                            </View>
                        ) : null}

                        {/* Action Buttons */}
                        <View style={styles.actionContainer}>
                            {!isRecording ? (
                                <TouchableOpacity style={styles.startBtn} onPress={handleStartSession}>
                                    <LinearGradient
                                        colors={[Colors.emerald[500], Colors.emerald[600]]}
                                        style={styles.btnGradient}
                                    >
                                        <Radio color="#ffffff" size={20} />
                                        <Text style={styles.btnText}>بدء الجلسة الصوتية المباشرة</Text>
                                    </LinearGradient>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity style={styles.stopBtn} onPress={handleStopSession}>
                                    <LinearGradient
                                        colors={[Colors.error, '#dc2626']}
                                        style={styles.btnGradient}
                                    >
                                        <MicOff color="#ffffff" size={20} />
                                        <Text style={styles.btnText}>إنهاء الجلسة الصوتيّة</Text>
                                    </LinearGradient>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity style={styles.advancedBtn} onPress={handleAdvancedRecitation}>
                                <Text style={styles.advancedBtnText}>فتح وضع التسميع المتقدم</Text>
                            </TouchableOpacity>
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
        borderColor: Colors.emerald[500],
        gap: 6,
    },
    liveTagStreaming: {
        backgroundColor: 'rgba(16, 185, 129, 0.35)',
        borderColor: Colors.emerald[400],
    },
    liveTagText: {
        color: Colors.emerald[500],
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
    pulseActive: {
        backgroundColor: 'rgba(16, 185, 129, 0.45)',
    },
    pulseSpeaking: {
        backgroundColor: 'rgba(245, 158, 11, 0.35)',
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
        color: Colors.gold[500],
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
        color: Colors.gold[500],
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
        gap: Spacing.sm,
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
    howItWorks: {
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginTop: Spacing.sm,
    },
    howItWorksTitle: {
        color: Colors.emerald[200],
        fontSize: Typography.fontSize.sm,
        fontFamily: Typography.fontFamily.arabicBold,
        textAlign: 'right',
        writingDirection: 'rtl',
    },
    howItWorksText: {
        color: Colors.neutral[300],
        fontSize: Typography.fontSize.sm,
        fontFamily: Typography.fontFamily.arabic,
        lineHeight: 21,
        marginTop: 4,
        textAlign: 'right',
        writingDirection: 'rtl',
    },
    advancedBtn: {
        alignItems: 'center',
        paddingVertical: Spacing.md,
        borderWidth: 1,
        borderColor: 'rgba(251,191,36,0.45)',
        borderRadius: BorderRadius.lg,
        backgroundColor: 'rgba(251,191,36,0.08)',
    },
    advancedBtnText: {
        color: Colors.gold[300],
        fontSize: Typography.fontSize.sm,
        fontFamily: Typography.fontFamily.arabicBold,
    },
});
