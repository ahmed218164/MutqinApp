/**
 * components/challenges/MissingWordsModal.tsx
 * ─────────────────────────────────────────────
 * Smart Missing Words Recitation Challenge Component
 * 
 * Interactive UI where key Quranic words are masked.
 * As the user recites into the microphone, Google AI Studio Gemini API
 * evaluates pronunciation & tajweed, revealing masked words with glowing
 * emerald animations and haptic feedback.
 */

import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    ActivityIndicator,
    ScrollView,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    X,
    Mic,
    Sparkles,
    CheckCircle2,
    RotateCcw,
    Award,
    HelpCircle,
    Eye,
} from 'lucide-react-native';
import Animated, {
    FadeIn,
    FadeInDown,
    ZoomIn,
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSequence,
    withSpring,
} from 'react-native-reanimated';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { Colors, Shadows, Typography, Spacing } from '../../constants/theme';
import {
    generateClozeQuestion,
    evaluateClozeRecitation,
    ClozeDifficulty,
    ClozeAyahQuestion,
    ClozeTestResult,
} from '../../lib/cloze-test-engine';
import { lightImpact, successHaptic, errorHaptic } from '../../lib/haptics';
import { useAuth } from '../../lib/auth';
import { useAudioRecorder, RecordingPresets } from 'expo-audio';

export interface MissingWordsModalProps {
    visible: boolean;
    onClose: () => void;
    surahNumber?: number;
    ayahNumber?: number;
    uthmaniText?: string;
}

// Fallback sample verse (Surah Al-Mulk 67:1) if none provided
const SAMPLE_SURAH = {
    number: 67,
    name: 'سورة الملك',
    ayah: 1,
    text: 'تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ',
};

export default function MissingWordsModal({
    visible,
    onClose,
    surahNumber = SAMPLE_SURAH.number,
    ayahNumber = SAMPLE_SURAH.ayah,
    uthmaniText = SAMPLE_SURAH.text,
}: MissingWordsModalProps) {
    const [difficulty, setDifficulty] = React.useState<ClozeDifficulty>('medium');
    const [question, setQuestion] = React.useState<ClozeAyahQuestion | null>(null);
    const [isEvaluating, setIsEvaluating] = React.useState(false);
    const [result, setResult] = React.useState<ClozeTestResult | null>(null);
    const [showHints, setShowHints] = React.useState(false);

    const { user } = useAuth();

    // Audio recorder hook
    const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
    const [isRecording, setIsRecording] = React.useState(false);

    // Initialize or regenerate question when visible or difficulty changes
    React.useEffect(() => {
        if (visible) {
            const q = generateClozeQuestion(surahNumber, ayahNumber, uthmaniText, difficulty);
            setQuestion(q);
            setResult(null);
            setShowHints(false);
        }
    }, [visible, surahNumber, ayahNumber, uthmaniText, difficulty]);

    const handleDifficultyChange = (newDiff: ClozeDifficulty) => {
        lightImpact();
        setDifficulty(newDiff);
    };

    const handleStartRecording = async () => {
        try {
            lightImpact();
            setResult(null);
            await audioRecorder.prepareToRecordAsync();
            audioRecorder.record();
            setIsRecording(true);
        } catch (err) {
            console.error('[MissingWordsModal] Recording start error:', err);
        }
    };

    const handleStopRecording = async () => {
        if (!isRecording || !question) return;
        try {
            setIsRecording(false);
            setIsEvaluating(true);
            await audioRecorder.stop();
            const uri = audioRecorder.uri;

            if (!uri) {
                setIsEvaluating(false);
                return;
            }

            // Read recorded audio file as Base64 string for Gemini API
            const base64Audio = await readAsStringAsync(uri, {
                encoding: EncodingType.Base64,
            });

            // Evaluate via Cloze Engine (Google AI Studio Gemini API) + Gamification XP
            const evalResult = await evaluateClozeRecitation(base64Audio, question, user?.id);
            setResult(evalResult);
            setIsEvaluating(false);

            if (evalResult.passed) {
                successHaptic();
            } else {
                errorHaptic();
            }
        } catch (err) {
            console.error('[MissingWordsModal] Recitation evaluation error:', err);
            setIsEvaluating(false);
        }
    };

    const toggleShowHints = () => {
        lightImpact();
        setShowHints(prev => !prev);
    };

    if (!question) return null;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={false}
            onRequestClose={onClose}
        >
            <SafeAreaView style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                        <X color={Colors.emerald[100]} size={24} />
                    </TouchableOpacity>
                    <View style={styles.headerTitleContainer}>
                        <Sparkles color={Colors.emerald[400]} size={20} />
                        <Text style={styles.headerTitle}>اختبار الكلمات المفقودة</Text>
                    </View>
                    <TouchableOpacity style={styles.hintButton} onPress={toggleShowHints}>
                        <Eye color={showHints ? Colors.gold[400] : Colors.neutral[400]} size={22} />
                    </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={styles.content}>
                    {/* Surah & Ayah Badge */}
                    <View style={styles.metaRow}>
                        <View style={styles.metaBadge}>
                            <Text style={styles.metaText}>
                                {question.surahName} — الآية {question.ayahNumber}
                            </Text>
                        </View>
                        {question.hasMutashabihatTarget && (
                            <View style={styles.mutashabihatBadge}>
                                <Text style={styles.mutashabihatBadgeText}>🎯 اختبار المتشابهات الذكي</Text>
                            </View>
                        )}
                    </View>

                    {/* Difficulty Selector */}
                    <View style={styles.difficultyContainer}>
                        {(['easy', 'medium', 'master'] as ClozeDifficulty[]).map(diff => (
                            <TouchableOpacity
                                key={diff}
                                style={[
                                    styles.difficultyChip,
                                    difficulty === diff && styles.difficultyChipActive,
                                ]}
                                onPress={() => handleDifficultyChange(diff)}
                            >
                                <Text
                                    style={[
                                        styles.difficultyText,
                                        difficulty === diff && styles.difficultyTextActive,
                                    ]}
                                >
                                    {diff === 'easy' ? '🌱 مبتدئ' : diff === 'medium' ? '⚡ متوسط' : '🔥 مُتقِن'}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Quranic Text Canvas with Masked Words */}
                    <View style={styles.quranCard}>
                        <View style={styles.wordsRow}>
                            {question.words.map((item, idx) => {
                                const isMasked = item.isMasked && !item.isRevealed && !showHints;
                                const isRevealed = item.isRevealed;

                                return (
                                    <View key={idx} style={styles.wordWrapper}>
                                        {isMasked ? (
                                            <Animated.View
                                                entering={FadeIn}
                                                style={[
                                                    styles.maskedChip,
                                                    item.isMutashabihat && styles.maskedChipMutashabihat,
                                                ]}
                                            >
                                                <Text style={styles.maskedDots}>•••••</Text>
                                            </Animated.View>
                                        ) : (
                                            <Animated.Text
                                                entering={ZoomIn}
                                                style={[
                                                    styles.quranWordText,
                                                    isRevealed && styles.revealedWordText,
                                                    showHints && item.isMasked && styles.hintWordText,
                                                ]}
                                            >
                                                {item.word}
                                            </Animated.Text>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    </View>

                    {/* Evaluation Result Card */}
                    {isEvaluating && (
                        <View style={styles.evaluatingCard}>
                            <ActivityIndicator size="large" color={Colors.emerald[400]} />
                            <Text style={styles.evaluatingText}>
                                جاري تحليل التسميع بالذكاء الاصطناعي...
                            </Text>
                        </View>
                    )}

                    {result && !isEvaluating && (
                        <Animated.View entering={FadeInDown} style={styles.resultCard}>
                            <View style={styles.resultHeader}>
                                {result.passed ? (
                                    <CheckCircle2 color={Colors.emerald[400]} size={28} />
                                ) : (
                                    <HelpCircle color={Colors.gold[400]} size={28} />
                                )}
                                <Text style={styles.resultTitle}>
                                    {result.passed ? 'تسميع رائع ومُتقِن! 🎉' : 'حاول مرة أخرى لتثبيت الآية 💪'}
                                </Text>
                            </View>

                            <View style={styles.scoreContainer}>
                                <Text style={styles.scoreNumber}>{result.score}%</Text>
                                <Text style={styles.scoreLabel}>درجة التسميع</Text>
                            </View>

                            <Text style={styles.resultSubtext}>
                                تم استكشاف {result.revealedWords} من {result.totalMaskedWords} كلمة مفقودة
                            </Text>

                            {/* Gamification Badge Reward Card */}
                            {result.passed && result.badgeName && (
                                <View style={styles.rewardBanner}>
                                    <Award color={Colors.gold[400]} size={24} />
                                    <View style={styles.rewardTextBlock}>
                                        <Text style={styles.rewardTitle}>{result.badgeName}</Text>
                                        <Text style={styles.rewardXP}>+{result.xpAwarded || 50} XP نقاط إتقان جديدة 🎉</Text>
                                    </View>
                                </View>
                            )}
                        </Animated.View>
                    )}
                </ScrollView>

                {/* Footer Controls */}
                <View style={styles.footer}>
                    {isRecording ? (
                        <TouchableOpacity
                            style={[styles.recordButton, styles.recordButtonActive]}
                            onPress={handleStopRecording}
                        >
                            <View style={styles.pulseIndicator} />
                            <Text style={styles.recordButtonText}>إيقاف وإنهاء التسميع ⏹</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={styles.recordButton}
                            onPress={handleStartRecording}
                            disabled={isEvaluating}
                        >
                            <Mic color="#ffffff" size={24} />
                            <Text style={styles.recordButtonText}>ابدأ التسميع الصوتي الآن 🎙️</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </SafeAreaView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.emerald[950],
    },
    header: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    },
    closeButton: {
        padding: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
    },
    headerTitleContainer: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        gap: 8,
    },
    headerTitle: {
        fontSize: Typography.fontSize.lg,
        color: '#ffffff',
        fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
        fontWeight: '700',
    },
    hintButton: {
        padding: 8,
    },
    content: {
        padding: 20,
        alignItems: 'center',
    },
    metaBadge: {
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: Colors.emerald[600],
        marginBottom: 16,
    },
    metaText: {
        color: Colors.emerald[300],
        fontSize: Typography.fontSize.sm,
        fontWeight: '600',
    },
    difficultyContainer: {
        flexDirection: 'row-reverse',
        gap: 8,
        marginBottom: 24,
    },
    difficultyChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    difficultyChipActive: {
        backgroundColor: Colors.emerald[600],
        borderColor: Colors.emerald[400],
    },
    difficultyText: {
        color: Colors.neutral[300],
        fontSize: Typography.fontSize.xs,
        fontWeight: '600',
    },
    difficultyTextActive: {
        color: '#ffffff',
    },
    quranCard: {
        width: '100%',
        backgroundColor: 'rgba(6, 78, 59, 0.4)',
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(52, 211, 153, 0.2)',
        marginBottom: 24,
        minHeight: 180,
        justifyContent: 'center',
    },
    wordsRow: {
        flexDirection: 'row-reverse',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 10,
        alignItems: 'center',
    },
    wordWrapper: {
        marginVertical: 4,
    },
    quranWordText: {
        fontSize: Typography.fontSize['2xl'],
        color: '#ffffff',
        textAlign: 'center',
        lineHeight: 44,
    },
    maskedChip: {
        backgroundColor: 'rgba(16, 185, 129, 0.25)',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: Colors.emerald[400],
        borderStyle: 'dashed',
    },
    maskedDots: {
        color: Colors.emerald[300],
        fontSize: Typography.fontSize.lg,
        letterSpacing: 2,
    },
    revealedWordText: {
        color: Colors.emerald[300],
        fontWeight: 'bold',
        textShadowColor: 'rgba(52, 211, 153, 0.8)',
        textShadowRadius: 8,
    },
    hintWordText: {
        color: Colors.gold[400],
        textDecorationLine: 'underline',
    },
    evaluatingCard: {
        alignItems: 'center',
        padding: 20,
        gap: 12,
    },
    evaluatingText: {
        color: Colors.emerald[200],
        fontSize: Typography.fontSize.base,
    },
    resultCard: {
        width: '100%',
        backgroundColor: 'rgba(2, 44, 34, 0.8)',
        borderRadius: 20,
        padding: 20,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.emerald[500],
    },
    resultHeader: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        gap: 10,
        marginBottom: 12,
    },
    resultTitle: {
        color: '#ffffff',
        fontSize: Typography.fontSize.base,
        fontWeight: '700',
    },
    scoreContainer: {
        alignItems: 'center',
        marginVertical: 8,
    },
    scoreNumber: {
        fontSize: Typography.fontSize['4xl'],
        color: Colors.emerald[400],
        fontWeight: 'bold',
    },
    scoreLabel: {
        color: Colors.neutral[400],
        fontSize: Typography.fontSize.xs,
    },
    resultSubtext: {
        color: Colors.emerald[200],
        fontSize: Typography.fontSize.sm,
        marginTop: 4,
    },
    footer: {
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.08)',
    },
    recordButton: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.emerald[600],
        paddingVertical: 16,
        borderRadius: 28,
        gap: 12,
        shadowColor: Colors.emerald[500],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 6,
    },
    recordButtonActive: {
        backgroundColor: Colors.error,
    },
    recordButtonText: {
        color: '#ffffff',
        fontSize: Typography.fontSize.base,
        fontWeight: '700',
    },
    pulseIndicator: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#ffffff',
    },
    metaRow: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        justifyContent: 'center',
        marginBottom: 16,
    },
    mutashabihatBadge: {
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: Colors.gold[500],
    },
    mutashabihatBadgeText: {
        color: Colors.gold[300],
        fontSize: Typography.fontSize.xs,
        fontWeight: 'bold',
    },
    maskedChipMutashabihat: {
        borderColor: Colors.gold[400],
        backgroundColor: 'rgba(245, 158, 11, 0.2)',
    },
    rewardBanner: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        gap: 12,
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        borderWidth: 1,
        borderColor: Colors.gold[400],
        borderRadius: 16,
        padding: 12,
        marginTop: 16,
        width: '100%',
    },
    rewardTextBlock: {
        alignItems: 'flex-start',
    },
    rewardTitle: {
        color: Colors.gold[300],
        fontSize: Typography.fontSize.sm,
        fontWeight: 'bold',
    },
    rewardXP: {
        color: '#ffffff',
        fontSize: Typography.fontSize.xs,
        marginTop: 2,
    },
});
