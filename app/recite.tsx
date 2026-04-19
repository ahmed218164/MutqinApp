import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { audioEngine, configureAudioSession } from '../lib/audio-engine';
import { ArrowLeft, Mic, Play, AlertCircle, Settings as SettingsIcon, Bookmark, Plus, Minus, Moon, Sun } from 'lucide-react-native';
import { Colors as StaticColors, Typography, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { useThemeColors } from '../constants/dynamicTheme';
import ErrorBoundary from '../components/ui/ErrorBoundary';
// Muaalem API replaces Gemini — called internally by useVADRecorder
import { useVADRecorder } from '../hooks/useVADRecorder';
import { AyahRange, wakeUpMuaalemSpace } from '../lib/muaalem-api';
// Keep RecitationAssessment type for backward compat with FeedbackModal
import { RecitationAssessment } from '../lib/recitation-storage';
import { getSurahByNumber } from '../constants/surahs';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings';
import { mediumImpact } from '../lib/haptics';
import { fetchPlan, MemorizationPlan } from '../lib/ward';
import FeedbackModal from '../components/recite/FeedbackModal';
import MushafPager from '../components/recite/MushafPager';
import UnifiedAudioControl, { AudioMode } from '../components/recite/UnifiedAudioControl';
import RangeSelector from '../components/recite/RangeSelector';
import AyahContextMenu from '../components/recite/AyahContextMenu';
import BookmarkHandle from '../components/recite/BookmarkHandle';
import HifzCover from '../components/recite/HifzCover';
import TafseerBottomSheet from '../components/mushaf/TafseerBottomSheet';
import { fetchSurahHeatmap, HeatmapData } from '../lib/heatmap-data';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
} from 'react-native-reanimated';
// ── Extracted custom hooks ──────────────────────────────────────────────────
import { useSurahFetcher } from '../hooks/useSurahFetcher';
import { useBookmarkManager } from '../hooks/useBookmarkManager';
import { useRecitationSync } from '../hooks/useRecitationSync';

function ReciteScreenInner() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const { user } = useAuth();
    const { fontSize, theme, toggleTheme } = useSettings();
    const Colors = useThemeColors();
    const surahNumber = parseInt(params.surahNumber as string) || 1;
    const surahName = params.surahName as string || 'الفاتحة';
    const surah = getSurahByNumber(surahNumber);
    const activeQiraat = params.activeNarration as string || 'Hafs';

    // ── Extracted hooks ──────────────────────────────────────────────────────
    const { verses, loadingVerses, error, refetch: refetchSurah } = useSurahFetcher(surahNumber);
    const { isBookmarked, toggleBookmark } = useBookmarkManager(surahNumber, surahName, user);
    const { saving, saveResults } = useRecitationSync();

    // Unified Audio Control States
    const [audioMode, setAudioMode] = React.useState<AudioMode>('closed');
    const [activeVerseIndex, setActiveVerseIndex] = React.useState<number | null>(null);

    // Range Selection States
    const [selectedRange, setSelectedRange] = React.useState({ from: 1, to: 1 });
    const [learningMode, setLearningMode] = React.useState(false);
    const [showRangeSelector, setShowRangeSelector] = React.useState(false);

    // Pager State
    const [activePage, setActivePage] = React.useState<number>(1);

    // ── VAD Recording (replaces manual start/stop + Gemini) ─────────────────
    // Compute reference text for the current range
    const rangedVersesForRef = React.useMemo(() => {
        return verses
            .filter(v => v.numberInSurah >= selectedRange.from && v.numberInSurah <= selectedRange.to)
            .map(a => a.text)
            .join(' * ');
    }, [verses, selectedRange]);

    // Ayah range sent to API so the backend uses Aya class for canonical text
    const ayahRangeForRef = React.useMemo<AyahRange>(() => ({
        surah: surahNumber,
        ayahFrom: selectedRange.from,
        ayahTo: selectedRange.to,
    }), [surahNumber, selectedRange]);

    const vadRecorder = useVADRecorder(rangedVersesForRef, ayahRangeForRef);

    // UI state derived from VAD
    const [analyzing, setAnalyzing] = React.useState(false);
    const [uploadStep, setUploadStep] = React.useState<
        'idle' | 'uploading' | 'analyzing' | 'saving'
    >('idle');
    const [feedback, setFeedback] = React.useState<RecitationAssessment | null>(null);
    const [modalVisible, setModalVisible] = React.useState(false);
    // Sheikh's first-ayah URL — pre-fetched by UnifiedAudioControl, used as Makhraj reference
    const sheikhClipUrlRef = React.useRef<string | null>(null);

    // Reader Settings
    const [settingsVisible, setSettingsVisible] = React.useState(false);
    const [currentFontSize, setCurrentFontSize] = React.useState(fontSize || 24);
    const nightMode = theme === 'dark';
    const setNightMode = (value: boolean) => {
        if (value !== nightMode) toggleTheme();
    };

    // Immersive Mode State (Default to true for clean UX)
    const [immersive, setImmersive] = React.useState(true);

    // Hifz Cover State
    const [hifzCoverVisible, setHifzCoverVisible] = React.useState(false);
    const [pagerHeight, setPagerHeight] = React.useState(0);

    // Heatmap State
    const [heatmapVisible, setHeatmapVisible] = React.useState(false);
    const [heatmapData, setHeatmapData] = React.useState<HeatmapData>({});

    // Context Menu State (long-press Ayah)
    const [longPressedVerseKey, setLongPressedVerseKey] = React.useState<string | null>(null);
    const [contextMenuVisible, setContextMenuVisible] = React.useState(false);

    // Tafseer Bottom Sheet State (Feature I)
    const [tafseerVisible, setTafseerVisible] = React.useState(false);
    const [tafseerTarget, setTafseerTarget] = React.useState<{ surah: number; ayah: number } | null>(null);

    // Immersive Reanimated values (UI-thread, 60fps)
    const headerTranslateY = useSharedValue(0);
    const headerOpacity = useSharedValue(1);
    const footerTranslateY = useSharedValue(0);

    // Update animations whenever immersive toggles
    React.useEffect(() => {
        const DURATION = 250;
        headerOpacity.value = withTiming(immersive ? 0 : 1, { duration: DURATION });
        headerTranslateY.value = withTiming(immersive ? -80 : 0, { duration: DURATION });
        footerTranslateY.value = withTiming(immersive ? 180 : 0, { duration: DURATION });
    }, [immersive]);

    const headerAnimatedStyle = useAnimatedStyle(() => ({
        opacity: headerOpacity.value,
        transform: [{ translateY: headerTranslateY.value }],
        // pointerEvents must be set via props, not style — handled on the Animated.View below
    }));

    const footerAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: footerTranslateY.value }],
    }));

    // ── Feature I: Tafseer handler ────────────────────────────────────────────
    // TafseerBottomSheet fetches its own data internally; we only need to pass
    // the verse coordinates and make the sheet visible.
    const handleTafseerRequest = React.useCallback((verseKey: string) => {
        const [surahStr, ayahStr] = verseKey.split(':');
        const surahNum = parseInt(surahStr, 10);
        const ayahNum = parseInt(ayahStr, 10);
        setTafseerTarget({ surah: surahNum, ayah: ayahNum });
        setTafseerVisible(true);
    }, []);

    // ── Cleanup on unmount: stop audio engine + cancel pending API calls ────
    const abortControllerRef = React.useRef<AbortController>(null!);
    React.useEffect(() => {
        // Create a fresh AbortController each time the effect runs
        // (fixes: permanently aborted controller after remount)
        const controller = new AbortController();
        abortControllerRef.current = controller;
        return () => {
            // Signal all pending fetches to abort
            controller.abort();
            // Stop any audio playback to release resources
            try { audioEngine.stop(); } catch {}
        };
    }, []);

    // Warm up the HF Space on mount
    React.useEffect(() => {
        // Pre-flight: wake the HF Space from sleep so the model boots
        // while the user is browsing / setting up their recitation range.
        wakeUpMuaalemSpace(abortControllerRef.current.signal);
    }, [surahNumber]);

    // Fetch Heatmap
    React.useEffect(() => {
        if (user && surahNumber) {
            fetchSurahHeatmap(user.id, surahNumber).then(setHeatmapData);
        }
    }, [user, surahNumber]);

    // Initialize range when verses are loaded
    // Destructure param strings once so the effect dependency is a stable string, not the
    // whole params object reference (which changes every render from useLocalSearchParams).
    const paramFromAyah = params.fromAyah as string | undefined;
    const paramToAyah  = params.toAyah  as string | undefined;
    React.useEffect(() => {
        if (verses.length > 0) {
            // Check for Daily Ward params
            const fromAyah = parseInt(paramFromAyah ?? '') || 1;
            const toAyah = parseInt(paramToAyah ?? '') || verses.length;
            setSelectedRange({ from: fromAyah, to: toAyah });
        }
    }, [verses.length, paramFromAyah, paramToAyah]);

    // Initialize active page and verse index when verses are loaded by useSurahFetcher
    React.useEffect(() => {
        if (verses.length > 0) {
            setActivePage(verses[0].page);
            setActiveVerseIndex(0);
        }
    }, [verses]);

    // ── Navigation Logic (plan-aware) ──────────────────────────────────────
    // The "next" surah depends on the user's memorization plan direction:
    //   forward:  surah + 1 (1→2→3→114)
    //   backward: surah - 1 (114→113→112→1)
    //   both:     determined by which side this surah belongs to
    const planRef = React.useRef<MemorizationPlan | null>(null);

    // Fetch plan once on mount (lightweight — single row)
    React.useEffect(() => {
        if (user) {
            fetchPlan(user.id).then(p => { planRef.current = p; });
        }
    }, [user?.id]);

    /**
     * Determine which side of the plan this surah belongs to.
     * For 'both' plans: compare current surah to fwd/bwd cursors.
     */
    const getPlanSide = React.useCallback((): 'forward' | 'backward' => {
        const plan = planRef.current;
        if (!plan) return 'forward'; // No plan = default forward
        if (plan.direction === 'forward') return 'forward';
        if (plan.direction === 'backward') return 'backward';
        // 'both': check which cursor matches the current surah
        if (surahNumber === plan.bwdSurah) return 'backward';
        return 'forward'; // default to forward if ambiguous
    }, [surahNumber]);

    const handleNextSurah = React.useCallback(() => {
        const side = getPlanSide();
        let nextSurahNumber: number;

        if (side === 'backward') {
            nextSurahNumber = surahNumber - 1;
            if (nextSurahNumber < 1) {
                // Reached Al-Fatiha going backwards — journey complete
                Alert.alert(
                    '🎉 ما شاء الله!',
                    'لقد أتممت حفظ القرآن الكريم كاملاً!\nبارك الله فيك وجعلك من أهل القرآن.',
                    [{ text: 'الحمد لله', style: 'default' }]
                );
                return;
            }
        } else {
            nextSurahNumber = surahNumber + 1;
            if (nextSurahNumber > 114) {
                Alert.alert(
                    '🎉 ما شاء الله!',
                    'لقد أتممت حفظ القرآن الكريم كاملاً!\nبارك الله فيك وجعلك من أهل القرآن.',
                    [{ text: 'الحمد لله', style: 'default' }]
                );
                return;
            }
        }

        const nextSurah = getSurahByNumber(nextSurahNumber);
        if (nextSurah) {
            router.setParams({
                surahNumber: nextSurahNumber.toString(),
                surahName: nextSurah.name,
                activeNarration: activeQiraat
            });
        }
    }, [surahNumber, activeQiraat, router, getPlanSide]);

    // Sync Active Page when verse changes (Audio Playback)
    React.useEffect(() => {
        if (verses.length > 0 && activeVerseIndex !== null) {
            const verse = verses[activeVerseIndex];
            if (verse && verse.page !== activePage) {
                setActivePage(verse.page);
            }
        }
    }, [activeVerseIndex]); // Depend on verse index change

    // ── VAD-based start/stop ────────────────────────────────────────────────
    // Replaces the old manual startRecording/stopRecording + Gemini pipeline.
    // useVADRecorder handles:
    //   - Metering-driven silence detection
    //   - Auto-chunking (stop → send to Muaalem → restart)
    //   - Aggregation of all chunk results on finish

    const startRecording = React.useCallback(async () => {
        if (vadRecorder.state.isSessionActive || analyzing) return;
        if (!user) {
            Alert.alert('خطأ', 'يجب تسجيل الدخول أولاً');
            return;
        }

        // Pause AudioEngine before switching iOS session to recording mode
        const engineSnap = audioEngine.getSnapshot();
        if (engineSnap.isPlaying) {
            audioEngine.togglePlayback();
        }

        await vadRecorder.startSession();
    }, [vadRecorder, analyzing, user]);

    const stopRecording = React.useCallback(async () => {
        if (!vadRecorder.state.isSessionActive) return;
        if (!user) return;

        setAnalyzing(true);
        setUploadStep('analyzing');

        try {
            mediumImpact();

            // finishSession stops the last chunk, waits for all API calls, aggregates
            const aggregatedResult = await vadRecorder.finishSession();

            if (!aggregatedResult) {
                Alert.alert('خطأ', 'لم يتم الحصول على نتائج.');
                return;
            }

            if (aggregatedResult.error) {
                Alert.alert('خطأ في التحليل', aggregatedResult.error);
                return;
            }

            // Convert Muaalem result to RecitationAssessment for backward compat
            const result: RecitationAssessment = {
                score: aggregatedResult.score,
                mistakes: aggregatedResult.mistakes.map(m => ({
                    text: m.word,
                    correction: m.expected,
                    description: m.description,
                    category: mapMuaalemCategory(m.category),
                    severity: m.severity,
                })),
                modelUsed: 'muaalem-api',
            };

            setUploadStep('saving');
            setFeedback(result);
            setModalVisible(true);

            // Save results via extracted hook and handle progression
            const outcome = await saveResults(result, {
                userId: user.id,
                surahNumber,
                surahName,
                selectedRange,
                verses,
                getPlanSide,
            });

            // Handle surah completion navigation
            if (outcome.isSurahCompleted) {
                if (outcome.hasNextSurah) {
                    setTimeout(() => {
                        setModalVisible(false);
                        handleNextSurah();
                    }, 2500);
                } else {
                    setTimeout(() => {
                        setModalVisible(false);
                        Alert.alert(
                            '🎉 ما شاء الله!',
                            'لقد أتممت حفظ القرآن الكريم كاملاً!\nبارك الله فيك وجعلك من أهل القرآن.',
                            [{ text: 'الحمد لله', style: 'default' }]
                        );
                    }, 2500);
                }
            }

            // Learning mode: advance on minor-only errors OR no errors
            if (learningMode) {
                const hasNonMinorError = result.mistakes?.some(
                    (m: any) => m.severity !== 'minor'
                );
                if (!hasNonMinorError && selectedRange.to < verses.length) {
                    setSelectedRange(prev => ({
                        from: prev.to + 1,
                        to: Math.min(prev.to + 1, verses.length)
                    }));
                }
            }
        } catch (error: any) {
            console.error('Failed to process recording:', error);
            Alert.alert('خطأ', 'فشل في تحليل التلاوة. يرجى المحاولة مرة أخرى.');
        } finally {
            setAnalyzing(false);
            setUploadStep('idle');

            // Restore playback session after recording (RNTP handles audio config)
            try {
                await configureAudioSession(true);
            } catch (sessionErr) {
                console.warn('[Audio] Session restore warning:', sessionErr);
            }
        }
    }, [vadRecorder, user, learningMode, selectedRange, verses, surahNumber, surahName, saveResults, getPlanSide, handleNextSurah]);

    // Map Muaalem Arabic categories to the English categories used by FeedbackModal
    function mapMuaalemCategory(cat: string): 'tajweed' | 'pronunciation' | 'elongation' | 'waqf' | 'omission' {
        switch (cat) {
            case 'تجويد': return 'tajweed';
            case 'نطق': return 'pronunciation';
            case 'مد': return 'elongation';
            case 'وقف': return 'waqf';
            case 'حذف': return 'omission';
            default: return 'tajweed';
        }
    }

    // Page range logic
    const startPage = verses.length > 0 ? verses[0].page : 1;
    const endPage = verses.length > 0 ? verses[verses.length - 1].page : 1;

    // Build verseKey → page map for audio-sync auto page-flip in MushafPager
    const versePageMap = React.useMemo<Record<string, number>>(() => {
        const map: Record<string, number> = {};
        for (const v of verses) {
            map[`${surahNumber}:${v.numberInSurah}`] = v.page;
        }
        return map;
    }, [verses, surahNumber]);

    // Derive highlighted key from active audio verse
    const highlightedVerseKey = React.useMemo(() => {
        if (activeVerseIndex === null) return undefined;
        const v = verses[activeVerseIndex];
        return v ? `${surahNumber}:${v.numberInSurah}` : undefined;
    }, [activeVerseIndex, verses, surahNumber]);

    // Context menu: get ayah text for the long-pressed verse
    const contextMenuAyahText = React.useMemo(() => {
        if (!longPressedVerseKey) return '';
        const [, ayahNumStr] = longPressedVerseKey.split(':');
        const ayahNum = parseInt(ayahNumStr, 10);
        return verses.find(v => v.numberInSurah === ayahNum)?.text ?? '';
    }, [longPressedVerseKey, verses]);

    // Play Ayah from context menu: navigate audio to that verse
    const handlePlayAyahFromMenu = React.useCallback((verseKey: string) => {
        const [, ayahNumStr] = verseKey.split(':');
        const ayahNum = parseInt(ayahNumStr, 10);
        const idx = verses.findIndex(v => v.numberInSurah === ayahNum);
        if (idx !== -1) {
            setActiveVerseIndex(idx);
            if (audioMode === 'closed') setAudioMode('listen');
        }
    }, [verses, audioMode]);

    // Dynamic colors based on Qiraat
    const isHafs = activeQiraat === 'Hafs';
    const accentColor = isHafs ? StaticColors.emerald[500] : StaticColors.gold[500];
    const headerBg = isHafs ? StaticColors.emerald[950] : StaticColors.gold[950];

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 80}
        >
            <SafeAreaView style={[styles.container, nightMode && { backgroundColor: StaticColors.neutral[900] }]}>
                {/* Header with immersive slide animation */}
                <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100 }, headerAnimatedStyle]}
                    pointerEvents={immersive ? 'none' : 'auto'}
                >
                    <View style={[styles.header, { backgroundColor: headerBg }]}>
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel="العودة" onPress={() => router.back()} style={styles.backButton}>
                            <ArrowLeft color={Colors.text.inverse} size={24} />
                        </TouchableOpacity>
                        <View style={styles.headerInfo}>
                            <Text style={styles.headerTitle}>{surah?.name || 'سورة الفاتحة'}</Text>
                            <Text style={styles.headerSubtitle}>صفحة {activePage} • {surah?.transliteration || 'Al-Fatihah'}</Text>
                        </View>
                        <View style={styles.headerActions}>
                            <TouchableOpacity accessibilityRole="button" accessibilityLabel="خريطة التجويد" onPress={() => setHeatmapVisible(v => !v)} style={[styles.iconButton, heatmapVisible && { backgroundColor: 'rgba(239,68,68,0.2)', borderRadius: 8 }]}>
                                <Text style={{ fontSize: 18 }}>🌡️</Text>
                            </TouchableOpacity>
                            <TouchableOpacity accessibilityRole="button" accessibilityLabel="غطاء الحفظ" onPress={() => setHifzCoverVisible(v => !v)} style={[styles.iconButton, hifzCoverVisible && { backgroundColor: 'rgba(52,211,153,0.25)', borderRadius: 8 }]}>
                                <Text style={{ fontSize: 18 }}>📖</Text>
                            </TouchableOpacity>
                            <TouchableOpacity accessibilityRole="button" accessibilityLabel="حفظ السورة" onPress={() => toggleBookmark()} style={styles.iconButton}>
                                <Bookmark
                                    color={isBookmarked ? StaticColors.gold[500] : Colors.text.inverse}
                                    fill={isBookmarked ? StaticColors.gold[500] : 'transparent'}
                                    size={24}
                                />
                            </TouchableOpacity>
                            <TouchableOpacity accessibilityRole="button" accessibilityLabel="الإعدادات" onPress={() => setSettingsVisible(true)} style={styles.iconButton}>
                                <SettingsIcon color={Colors.text.inverse} size={24} />
                            </TouchableOpacity>
                        </View>
                    </View>
                </Animated.View>

                {/* Reader Settings Modal */}
                <Modal
                    animationType="fade"
                    transparent={true}
                    visible={settingsVisible}
                    onRequestClose={() => setSettingsVisible(false)}
                >
                    <TouchableOpacity
                        style={styles.modalOverlay}
                        activeOpacity={1}
                        onPress={() => setSettingsVisible(false)}
                    >
                        <View style={[styles.settingsModal, { backgroundColor: nightMode ? '#1e293b' : '#ffffff' }]}>
                            <Text style={[styles.settingsTitle, { color: nightMode ? '#ffffff' : '#000000' }]}>إعدادات القارئ</Text>

                            {/* وضع الليل */}
                            <View style={styles.settingRow}>
                                <Text style={[styles.settingLabel, { color: nightMode ? '#cbd5e1' : '#475569' }]}>{nightMode ? 'الوضع الليلي' : 'الوضع النهاري'}</Text>
                                <TouchableOpacity onPress={() => setNightMode(!nightMode)}>
                                    {nightMode ? (
                                        <Sun color={StaticColors.gold[500]} size={24} />
                                    ) : (
                                        <Moon color={StaticColors.neutral[400]} size={24} />
                                    )}
                                </TouchableOpacity>
                            </View>

                            {/* حجم الخط */}
                            <View style={styles.settingRow}>
                                <Text style={[styles.settingLabel, { color: nightMode ? '#cbd5e1' : '#475569' }]}>حجم الخط</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                                    <TouchableOpacity
                                        onPress={() => setCurrentFontSize(prev => Math.max(14, prev - 2))}
                                        style={{ padding: Spacing.xs }}
                                    >
                                        <Minus color={nightMode ? '#cbd5e1' : '#475569'} size={20} />
                                    </TouchableOpacity>
                                    <Text style={[styles.settingLabel, { color: nightMode ? '#ffffff' : '#000000', fontWeight: '700', minWidth: 28, textAlign: 'center' }]}>
                                        {currentFontSize}
                                    </Text>
                                    <TouchableOpacity
                                        onPress={() => setCurrentFontSize(prev => Math.min(40, prev + 2))}
                                        style={{ padding: Spacing.xs }}
                                    >
                                        <Plus color={nightMode ? '#cbd5e1' : '#475569'} size={20} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </TouchableOpacity>
                </Modal>

                {/* Content: Pager View */}
                <View style={styles.content}>
                    {loadingVerses ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color={Colors.gold[600]} />
                            <Text style={styles.loadingText}>جارٍ تحميل الصفحات...</Text>
                        </View>
                    ) : error ? (
                        <View style={styles.errorContainer}>
                            <AlertCircle color={Colors.error} size={48} />
                            <Text style={styles.errorText}>{error}</Text>
                            <TouchableOpacity
                                accessibilityRole="button"
                                accessibilityLabel="إعادة المحاولة"
                                style={styles.retryButton}
                                onPress={() => refetchSurah()}
                            >
                                <Text style={styles.retryButtonText}>إعادة المحاولة</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            {/* Compact Range Selector */}
                            <Animated.View style={[styles.compactRangeContainer, { position: 'absolute', top: 90, left: 0, right: 0, zIndex: 90 }, headerAnimatedStyle]}>
                                {showRangeSelector ? (
                                    <View>
                                        <RangeSelector
                                            totalVerses={verses.length}
                                            selectedRange={selectedRange}
                                            onRangeChange={setSelectedRange}
                                            surahName={surah?.name}
                                        />
                                        <TouchableOpacity
                                            style={[styles.learningModeToggle, { borderColor: accentColor }]}
                                            onPress={() => setLearningMode(!learningMode)}
                                            accessibilityRole="switch"
                                            accessibilityState={{ checked: learningMode }}
                                        >
                                            <Text style={[styles.learningModeText, learningMode && { color: accentColor }]}>
                                                🎓 وضع التعلم {learningMode ? '(مفعّل)' : '(معطّل)'}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.collapseButton}
                                            onPress={() => setShowRangeSelector(false)}
                                        >
                                            <Text style={styles.collapseButtonText}>▲ طيّ</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <TouchableOpacity
                                        style={[styles.compactRangeButton, { borderColor: accentColor + '40' }]}
                                        onPress={() => setShowRangeSelector(true)}
                                    >
                                        <Text style={styles.compactRangeText}>
                                            📖 آية {selectedRange.from}-{selectedRange.to}
                                            {learningMode && ' • 🎓 وضع التعلم'}
                                        </Text>
                                        <Text style={[styles.expandText, { color: accentColor }]}>▼</Text>
                                    </TouchableOpacity>
                                )}
                            </Animated.View>

                            {/* Mushaf spanning the full area */}
                            <View
                                style={{ flex: 1, paddingBottom: 0 }}
                                onLayout={(e) => setPagerHeight(e.nativeEvent.layout.height)}
                            >
                                <MushafPager
                                    startPage={startPage}
                                    endPage={endPage}
                                    currentPage={activePage}
                                    onPageChange={setActivePage}
                                    highlightedVerseKey={highlightedVerseKey}
                                    longPressedVerseKey={longPressedVerseKey ?? undefined}
                                    qiraat={activeQiraat}
                                    nightMode={nightMode}
                                    immersive={immersive}
                                    onImmersiveChange={setImmersive}
                                    versePageMap={versePageMap}
                                    heatmapData={heatmapVisible ? heatmapData : undefined}
                                    onVerseLongPress={(key) => {
                                        setLongPressedVerseKey(key);
                                        setContextMenuVisible(true);
                                    }}
                                />

                                {/* Bookmark ribbon handle — appears on right edge */}
                                <BookmarkHandle
                                    isBookmarked={isBookmarked}
                                    onToggle={() => toggleBookmark()}
                                    nightMode={nightMode}
                                />

                                {/* Hifz Cover Overlay */}
                                {hifzCoverVisible && pagerHeight > 0 && (
                                    <HifzCover containerHeight={pagerHeight} />
                                )}
                            </View>
                        </>
                    )}
                </View>

                {/* Unified Audio Control — slides down when immersive */}
                <Animated.View style={footerAnimatedStyle}
                    pointerEvents={immersive ? 'none' : 'auto'}
                >
                    {/* Integrated Action Bar — shown ONLY when audio is closed (replaces floating FABs) */}
                    {audioMode === 'closed' && (
                        <View style={styles.actionBar}>
                            <TouchableOpacity
                                style={[styles.actionBarButton, { borderColor: StaticColors.emerald[500] + '50', backgroundColor: StaticColors.emerald[600] + '20' }]}
                                onPress={() => setAudioMode('listen')}
                                accessibilityRole="button"
                                accessibilityLabel="Open listen mode"
                            >
                                <Play color={StaticColors.emerald[400]} size={20} />
                                <Text style={[styles.actionBarButtonText, { color: StaticColors.emerald[400] }]}>استماع</Text>
                            </TouchableOpacity>

                            <View style={styles.actionBarDivider} />

                            <TouchableOpacity
                                style={[styles.actionBarButton, { borderColor: accentColor + '50', backgroundColor: accentColor + '20' }]}
                                onPress={() => setAudioMode('record')}
                                accessibilityRole="button"
                                accessibilityLabel="Open record mode"
                            >
                                <Mic color={accentColor} size={20} />
                                <Text style={[styles.actionBarButtonText, { color: accentColor }]}>تسميع</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    <UnifiedAudioControl
                        mode={audioMode}
                        onModeChange={setAudioMode}
                        surahNumber={surahNumber}
                        verses={verses}
                        selectedRange={selectedRange}
                        activeQiraat={activeQiraat}
                        onVerseChange={setActiveVerseIndex}
                        recording={vadRecorder.state.isSessionActive}
                        onStartRecording={startRecording}
                        onStopRecording={stopRecording}
                        analyzing={analyzing}
                        uploadStep={uploadStep}
                        recordingDuration={vadRecorder.state.elapsedSeconds}
                        chunksSent={vadRecorder.state.chunksSent}
                        chunksCompleted={vadRecorder.state.chunksCompleted}
                        isFinishing={vadRecorder.state.isFinishing}
                        learningMode={learningMode}
                        onLearningStepComplete={() => {
                            setAudioMode('record');
                        }}
                        onSurahEnd={handleNextSurah}
                        onSheikhClipReady={(url) => { sheikhClipUrlRef.current = url; }}
                    />
                </Animated.View>

                {/* Feedback Modal — outside footer animation */}
                <FeedbackModal
                    visible={modalVisible}
                    onClose={() => setModalVisible(false)}
                    feedback={feedback}
                    saving={saving}
                />

                {/* Ayah Context Menu overlay — at SafeAreaView root level */}
                <AyahContextMenu
                    visible={contextMenuVisible}
                    verseKey={longPressedVerseKey ?? '1:1'}
                    ayahText={contextMenuAyahText}
                    onClose={() => {
                        setContextMenuVisible(false);
                        setLongPressedVerseKey(null);
                    }}
                    onPlayAyah={handlePlayAyahFromMenu}
                    onTafseer={handleTafseerRequest}
                />

                {/* Tafseer Bottom Sheet — Feature I */}
                {/* Props: targetAyah (single ayah from long-press) or pageAyahs (page mode) */}
                <TafseerBottomSheet
                    visible={tafseerVisible}
                    onClose={() => setTafseerVisible(false)}
                    targetAyah={tafseerTarget}
                />

            </SafeAreaView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: StaticColors.neutral[50], // Overridden inline when nightMode is active
    },
    header: {
        // backgroundColor moved to inline style for dynamic color
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: Spacing.lg,
        paddingTop: Spacing['3xl'],
        zIndex: 10,
    },
    backButton: {
        padding: Spacing.sm,
    },
    headerInfo: {
        flex: 1,
        alignItems: 'center',
        marginHorizontal: Spacing.sm,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconButton: {
        padding: Spacing.xs,
        marginEnd: Spacing.sm,  // RTL-safe (was marginLeft)
    },
    headerTitle: {
        fontSize: Typography.fontSize['xl'], // Smaller title
        fontWeight: Typography.fontWeight.bold,
        color: StaticColors.text.inverse,
    },
    headerSubtitle: {
        fontSize: Typography.fontSize.sm,
        color: StaticColors.neutral[300],
    },
    content: {
        flex: 1,
        backgroundColor: StaticColors.neutral[50],
        // Padding removed - UnifiedAudioControl handles its own positioning
    },
    compactRangeContainer: {
        paddingHorizontal: Spacing.md,
        paddingTop: Spacing.sm,
        paddingBottom: Spacing.xs,
    },
    compactRangeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
    },
    compactRangeText: {
        fontSize: Typography.fontSize.sm,
        color: StaticColors.neutral[200],
        fontWeight: Typography.fontWeight.medium,
    },
    expandText: {
        fontSize: Typography.fontSize.xs,
        fontWeight: Typography.fontWeight.bold,
    },
    collapseButton: {
        alignItems: 'center',
        paddingVertical: Spacing.xs,
        marginTop: Spacing.xs,
    },
    collapseButtonText: {
        fontSize: Typography.fontSize.xs,
        color: StaticColors.neutral[400],
    },
    learningModeToggle: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.md,
        borderRadius: BorderRadius.md,
        marginTop: Spacing.sm,
        alignItems: 'center',
        borderWidth: 1,
    },
    learningModeText: {
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.semibold,
        color: StaticColors.neutral[300],
    },
    // ── Integrated Action Bar (replaces floating FABs) ──
    actionBar: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        gap: Spacing.md,
    },
    actionBarButton: {
        flex: 1,
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        gap: Spacing.sm,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.xl,
        borderWidth: 1,
    },
    actionBarButtonText: {
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.semibold,
    },
    actionBarDivider: {
        width: 1,
        height: 28,
        backgroundColor: 'rgba(255,255,255,0.12)',
    },
    // Loading & Error States
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing['3xl'],
        backgroundColor: StaticColors.neutral[950],
    },
    loadingText: {
        marginTop: Spacing.md,
        fontSize: Typography.fontSize.base,
        color: StaticColors.gold[700],
        fontWeight: Typography.fontWeight.semibold,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing['3xl'],
        backgroundColor: StaticColors.neutral[950],
    },
    errorText: {
        marginTop: Spacing.lg,
        fontSize: Typography.fontSize.base,
        color: StaticColors.error,
        textAlign: 'center',
        marginBottom: Spacing.xl,
    },
    retryButton: {
        backgroundColor: StaticColors.emerald[950],
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.lg,
    },
    retryButtonText: {
        fontSize: Typography.fontSize.base,
        fontWeight: Typography.fontWeight.bold,
        color: StaticColors.text.inverse,
    },

    // Settings Modal Styles
    settingsModal: {
        backgroundColor: '#ffffff',
        width: '80%',
        alignSelf: 'center',
        borderRadius: BorderRadius.xl,
        padding: Spacing.xl,
        marginTop: 'auto',
        marginBottom: 'auto',
        ...Shadows.xl,
    },
    settingsTitle: {
        fontSize: Typography.fontSize.xl,
        fontWeight: Typography.fontWeight.bold,
        marginBottom: Spacing.lg,
        textAlign: 'center',
    },
    settingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    settingLabel: {
        fontSize: Typography.fontSize.base,
        fontWeight: Typography.fontWeight.medium,
    },
});

export default function ReciteScreen() {
    return (
        <ErrorBoundary>
            <ReciteScreenInner />
        </ErrorBoundary>
    );
}
