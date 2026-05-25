import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { audioEngine, configureAudioSession } from '../lib/audio-engine';
import { ArrowLeft, Mic, Play, AlertCircle, Settings as SettingsIcon, Bookmark } from 'lucide-react-native';
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
import ReciterBottomSheet from '../components/recite/ReciterBottomSheet';
import PlaybackScopeSheet, { PlaybackScope } from '../components/recite/PlaybackScopeSheet';
import UnifiedOptionsSheet from '../components/recite/UnifiedOptionsSheet';
import BottomSheet from '@gorhom/bottom-sheet';
import { Reciter, getDefaultReciter } from '../lib/audio-reciters';
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

// ── Juz page boundaries (standard Mushaf) ─────────────────────────────────────
const JUZ_PAGES: number[] = [
    1,22,42,62,82,102,121,142,162,182,
    201,222,242,262,282,302,322,342,362,382,
    402,422,442,462,482,502,522,542,562,582,
];

function getJuzForPage(page: number): number {
    for (let j = JUZ_PAGES.length - 1; j >= 0; j--) {
        if (page >= JUZ_PAGES[j]) return j + 1;
    }
    return 1;
}

// ── Design Tokens (Sanctuary Theme) ─────────────────────────────────────────
const SANCTUARY = {
    surface: {
        primary: '#0C0F14',       // deep obsidian
        primaryLight: '#FDFBF7',  // warm parchment
        elevated: '#161B24',      // ink
        elevatedLight: '#FFFFFF',
    },
    header: {
        bg: 'rgba(12, 15, 20, 0.92)',        // glass header dark
        bgLight: 'rgba(253, 251, 247, 0.92)', // glass header light
        borderColor: 'rgba(255,255,255,0.06)',
        borderColorLight: 'rgba(0,0,0,0.06)',
    },
    text: {
        primary: '#E8E6E1',
        secondary: '#6B7A8D',
        primaryLight: '#1A1A2E',
        secondaryLight: '#64748B',
    },
} as const;

function ReciteScreenInner() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const insets = useSafeAreaInsets();
    const { user } = useAuth();
    const { fontSize, theme, toggleTheme } = useSettings();
    const Colors = useThemeColors();
    const surahNumber = parseInt(params.surahNumber as string) || 1;
    const surahName = params.surahName as string || 'الفاتحة';
    const surah = getSurahByNumber(surahNumber);
    const activeQiraat = params.activeNarration as string || 'Hafs';
    const nightMode = theme === 'dark';

    // ── Extracted hooks ──────────────────────────────────────────────────────
    const { verses, loadingVerses, error, refetch: refetchSurah } = useSurahFetcher(surahNumber);
    const { isBookmarked, toggleBookmark } = useBookmarkManager(surahNumber, surahName, user);
    const { saving, saveResults } = useRecitationSync();

    // Unified Audio Control States
    const [audioMode, setAudioMode] = React.useState<AudioMode>('closed');
    const [activeVerseIndex, setActiveVerseIndex] = React.useState<number | null>(null);

    // ── Reciter state ────────────────────────────────────────────────────────
    const [selectedReciter, setSelectedReciter] = React.useState<Reciter>(getDefaultReciter());
    const reciterSheetRef = React.useRef<BottomSheet>(null);

    const handleReciterSelect = React.useCallback((reciter: Reciter) => {
        setSelectedReciter(reciter);
    }, []);

    // Range Selection States
    const [selectedRange, setSelectedRange] = React.useState({ from: 1, to: 1 });
    const [learningMode, setLearningMode] = React.useState(false);
    const [showRangeSelector, setShowRangeSelector] = React.useState(false);

    // Pager State
    const [activePage, setActivePage] = React.useState<number>(1);

    // ── VAD Recording ────────────────────────────────────────────────────────
    const rangedVersesForRef = React.useMemo(() => {
        return verses
            .filter(v => v.numberInSurah >= selectedRange.from && v.numberInSurah <= selectedRange.to)
            .map(a => a.text)
            .join(' * ');
    }, [verses, selectedRange]);

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
    const sheikhClipUrlRef = React.useRef<string | null>(null);

    // Reader Settings — SLICE 2: sheet refs replace modal state
    const optionsSheetRef = React.useRef<BottomSheet>(null);
    const scopeSheetRef = React.useRef<BottomSheet>(null);
    const [currentFontSize, setCurrentFontSize] = React.useState(fontSize || 24);

    // Immersive Mode State (Default to true)
    const [immersive, setImmersive] = React.useState(true);

    // Hifz Cover State
    const [hifzCoverVisible, setHifzCoverVisible] = React.useState(false);
    const [pagerHeight, setPagerHeight] = React.useState(0);

    // Heatmap State
    const [heatmapVisible, setHeatmapVisible] = React.useState(false);
    const [heatmapData, setHeatmapData] = React.useState<HeatmapData>({});

    // Context Menu State
    const [longPressedVerseKey, setLongPressedVerseKey] = React.useState<string | null>(null);
    const [contextMenuVisible, setContextMenuVisible] = React.useState(false);

    // Tafseer Bottom Sheet State
    const [tafseerVisible, setTafseerVisible] = React.useState(false);
    const [tafseerTarget, setTafseerTarget] = React.useState<{ surah: number; ayah: number } | null>(null);

    // ── Immersive Reanimated values ──────────────────────────────────────────
    const headerOpacity = useSharedValue(0);
    const headerTranslateY = useSharedValue(-60);
    const footerTranslateY = useSharedValue(0);

    React.useEffect(() => {
        const DURATION = 280;
        headerOpacity.value = withTiming(immersive ? 0 : 1, { duration: DURATION });
        headerTranslateY.value = withTiming(immersive ? -100 : 0, { duration: DURATION });
        footerTranslateY.value = withTiming(immersive ? 300 : 0, { duration: DURATION });
    }, [immersive]);

    const headerAnimatedStyle = useAnimatedStyle(() => ({
        opacity: headerOpacity.value,
        transform: [{ translateY: headerTranslateY.value }],
    }));

    const footerAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: footerTranslateY.value }],
    }));

    // ── Feature I: Tafseer handler ────────────────────────────────────────────
    const handleTafseerRequest = React.useCallback((verseKey: string) => {
        const [surahStr, ayahStr] = verseKey.split(':');
        const surahNum = parseInt(surahStr, 10);
        const ayahNum = parseInt(ayahStr, 10);
        setTafseerTarget({ surah: surahNum, ayah: ayahNum });
        setTafseerVisible(true);
    }, []);

    // ── Cleanup on unmount ───────────────────────────────────────────────────
    const abortControllerRef = React.useRef<AbortController>(null!);
    React.useEffect(() => {
        const controller = new AbortController();
        abortControllerRef.current = controller;
        return () => {
            controller.abort();
            try { audioEngine.stop(); } catch { }
        };
    }, []);

    // Warm up HF Space
    React.useEffect(() => {
        wakeUpMuaalemSpace(abortControllerRef.current.signal);
    }, [surahNumber]);

    // Fetch Heatmap
    React.useEffect(() => {
        if (user && surahNumber) {
            fetchSurahHeatmap(user.id, surahNumber).then(setHeatmapData);
        }
    }, [user, surahNumber]);

    // Initialize range when verses are loaded
    const paramFromAyah = params.fromAyah as string | undefined;
    const paramToAyah = params.toAyah as string | undefined;
    React.useEffect(() => {
        if (verses.length > 0) {
            const fromAyah = parseInt(paramFromAyah ?? '') || 1;
            const toAyah = parseInt(paramToAyah ?? '') || verses.length;
            setSelectedRange({ from: fromAyah, to: toAyah });
        }
    }, [verses.length, paramFromAyah, paramToAyah]);

    // Initialize active page
    React.useEffect(() => {
        if (verses.length > 0) {
            setActivePage(verses[0].page);
            setActiveVerseIndex(0);
        }
    }, [verses]);

    // ── Navigation Logic (plan-aware) ──────────────────────────────────────
    const planRef = React.useRef<MemorizationPlan | null>(null);

    React.useEffect(() => {
        if (user) {
            fetchPlan(user.id).then(p => { planRef.current = p; });
        }
    }, [user?.id]);

    const getPlanSide = React.useCallback((): 'forward' | 'backward' => {
        const plan = planRef.current;
        if (!plan) return 'forward';
        if (plan.direction === 'forward') return 'forward';
        if (plan.direction === 'backward') return 'backward';
        if (surahNumber === plan.bwdSurah) return 'backward';
        return 'forward';
    }, [surahNumber]);

    const handleNextSurah = React.useCallback(() => {
        const side = getPlanSide();
        let nextSurahNumber: number;

        if (side === 'backward') {
            nextSurahNumber = surahNumber - 1;
            if (nextSurahNumber < 1) {
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

    // Sync Active Page when verse changes
    React.useEffect(() => {
        if (verses.length > 0 && activeVerseIndex !== null) {
            const verse = verses[activeVerseIndex];
            if (verse && verse.page !== activePage) {
                setActivePage(verse.page);
            }
        }
    }, [activeVerseIndex]); // Depend on verse index change

    // ── VAD-based start/stop ────────────────────────────────────────────────
    const startRecording = React.useCallback(async () => {
        if (vadRecorder.state.isSessionActive || analyzing) return;
        if (!user) {
            Alert.alert('خطأ', 'يجب تسجيل الدخول أولاً');
            return;
        }

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

            const aggregatedResult = await vadRecorder.finishSession();

            if (!aggregatedResult) {
                Alert.alert('خطأ', 'لم يتم الحصول على نتائج.');
                return;
            }

            if (aggregatedResult.error) {
                Alert.alert('خطأ في التحليل', aggregatedResult.error);
                return;
            }

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

            const outcome = await saveResults(result, {
                userId: user.id,
                surahNumber,
                surahName,
                selectedRange,
                verses,
                getPlanSide,
            });

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

            try {
                await configureAudioSession(true);
            } catch (sessionErr) {
                console.warn('[Audio] Session restore warning:', sessionErr);
            }
        }
    }, [vadRecorder, user, learningMode, selectedRange, verses, surahNumber, surahName, saveResults, getPlanSide, handleNextSurah]);

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
    const currentJuz = getJuzForPage(activePage);

    // ── SLICE 2: Playback Scope handler ──────────────────────────────────────
    const handleScopeSelect = React.useCallback((scope: PlaybackScope) => {
        switch (scope) {
            case 'page': {
                // Find verses on the current page
                const pageVerses = verses.filter(v => v.page === activePage);
                if (pageVerses.length > 0) {
                    setSelectedRange({
                        from: pageVerses[0].numberInSurah,
                        to: pageVerses[pageVerses.length - 1].numberInSurah,
                    });
                }
                break;
            }
            case 'surah':
                setSelectedRange({ from: 1, to: verses.length });
                break;
            case 'juz':
                // For simplicity, default to full surah (juz boundaries are cross-surah)
                setSelectedRange({ from: 1, to: verses.length });
                break;
            case 'custom':
                setShowRangeSelector(true);
                return; // Don't start playback yet
            default:
                return;
        }
        setAudioMode('listen');
    }, [verses, activePage]);

    // Build verseKey → page map
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

    // Context menu helpers
    const contextMenuAyahText = React.useMemo(() => {
        if (!longPressedVerseKey) return '';
        const [, ayahNumStr] = longPressedVerseKey.split(':');
        const ayahNum = parseInt(ayahNumStr, 10);
        return verses.find(v => v.numberInSurah === ayahNum)?.text ?? '';
    }, [longPressedVerseKey, verses]);

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

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 80}
        >
            <View style={[
                styles.rootContainer,
                { backgroundColor: nightMode ? SANCTUARY.surface.primary : '#FFFFFF' },
            ]}>
                {/* ═══════════════════════════════════════════════════════════════ */}
                {/* ██  MINIMAL GLASS HEADER — Back + Title + Bookmark           ██ */}
                {/* ═══════════════════════════════════════════════════════════════ */}
                <Animated.View
                    style={[
                        styles.headerOuter,
                        { paddingTop: insets.top },
                        headerAnimatedStyle,
                    ]}
                    pointerEvents={immersive ? 'none' : 'box-none'}
                >
                    <View style={[
                        styles.headerInner,
                        {
                            backgroundColor: nightMode
                                ? SANCTUARY.header.bg
                                : SANCTUARY.header.bgLight,
                            borderBottomColor: nightMode
                                ? SANCTUARY.header.borderColor
                                : SANCTUARY.header.borderColorLight,
                        },
                    ]}>
                        {/* Back button */}
                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel="العودة"
                            onPress={() => router.back()}
                            style={styles.headerBtn}
                        >
                            <ArrowLeft
                                color={nightMode ? SANCTUARY.text.primary : SANCTUARY.text.primaryLight}
                                size={22}
                            />
                        </TouchableOpacity>

                        {/* Center: Surah name + page */}
                        <View style={styles.headerCenter}>
                            <Text style={[
                                styles.headerTitle,
                                { color: nightMode ? SANCTUARY.text.primary : SANCTUARY.text.primaryLight },
                            ]}>
                                {surah?.name || 'سورة الفاتحة'}
                            </Text>
                            <Text style={[
                                styles.headerSubtitle,
                                { color: nightMode ? SANCTUARY.text.secondary : SANCTUARY.text.secondaryLight },
                            ]}>
                                صفحة {activePage} · {surah?.transliteration || 'Al-Fatihah'}
                            </Text>
                        </View>

                        {/* Bookmark */}
                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel="حفظ السورة"
                            onPress={() => toggleBookmark()}
                            style={styles.headerBtn}
                        >
                            <Bookmark
                                color={isBookmarked
                                    ? StaticColors.gold[500]
                                    : (nightMode ? SANCTUARY.text.secondary : SANCTUARY.text.secondaryLight)}
                                fill={isBookmarked ? StaticColors.gold[500] : 'transparent'}
                                size={22}
                            />
                        </TouchableOpacity>

                        {/* Settings — SLICE 2: opens UnifiedOptionsSheet */}
                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel="الإعدادات"
                            onPress={() => optionsSheetRef.current?.snapToIndex(0)}
                            style={styles.headerBtn}
                        >
                            <SettingsIcon
                                color={nightMode ? SANCTUARY.text.secondary : SANCTUARY.text.secondaryLight}
                                size={20}
                            />
                        </TouchableOpacity>
                    </View>
                </Animated.View>

                {/* Settings Modal removed — replaced by UnifiedOptionsSheet at bottom */}

                {/* ═══════════════════════════════════════════════════════════════ */}
                {/* ██  CONTENT: MUSHAF PAGER                                   ██ */}
                {/* ═══════════════════════════════════════════════════════════════ */}
                <View style={[styles.content, !nightMode && { backgroundColor: '#FFFFFF' }]}>
                    {loadingVerses ? (
                        <View style={[
                            styles.loadingContainer,
                            { backgroundColor: nightMode ? SANCTUARY.surface.primary : '#FFFFFF' },
                        ]}>
                            <ActivityIndicator size="large" color={accentColor} />
                            <Text style={[styles.loadingText, { color: accentColor }]}>
                                جارٍ تحميل الصفحات...
                            </Text>
                        </View>
                    ) : error ? (
                        <View style={[
                            styles.errorContainer,
                            { backgroundColor: nightMode ? SANCTUARY.surface.primary : '#FFFFFF' },
                        ]}>
                            <AlertCircle color={StaticColors.error} size={48} />
                            <Text style={styles.errorText}>{error}</Text>
                            <TouchableOpacity
                                accessibilityRole="button"
                                accessibilityLabel="إعادة المحاولة"
                                style={[styles.retryButton, { backgroundColor: accentColor }]}
                                onPress={() => refetchSurah()}
                            >
                                <Text style={styles.retryButtonText}>إعادة المحاولة</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            {/* Compact Range Selector (animated with header) */}
                            <Animated.View
                                style={[
                                    styles.compactRangeContainer,
                                    { top: insets.top + 56, zIndex: 90 },
                                    headerAnimatedStyle,
                                ]}
                                pointerEvents={immersive ? 'none' : 'box-none'}
                            >
                                {showRangeSelector ? (
                                    <View style={[
                                        styles.rangeSelectorCard,
                                        { backgroundColor: nightMode ? SANCTUARY.surface.elevated : SANCTUARY.surface.elevatedLight },
                                    ]}>
                                        <RangeSelector
                                            totalVerses={verses.length}
                                            selectedRange={selectedRange}
                                            onRangeChange={setSelectedRange}
                                            surahName={surah?.name}
                                        />
                                        <TouchableOpacity
                                            style={[styles.learningModeToggle, { borderColor: accentColor + '30' }]}
                                            onPress={() => setLearningMode(!learningMode)}
                                            accessibilityRole="switch"
                                            accessibilityState={{ checked: learningMode }}
                                        >
                                            <Text style={[
                                                styles.learningModeText,
                                                learningMode && { color: accentColor },
                                            ]}>
                                                🎓 وضع التعلم {learningMode ? '(مفعّل)' : '(معطّل)'}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.collapseButton}
                                            onPress={() => setShowRangeSelector(false)}
                                        >
                                            <Text style={[styles.collapseButtonText, { color: SANCTUARY.text.secondary }]}>
                                                ▲ طيّ
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <TouchableOpacity
                                        style={[
                                            styles.compactRangeButton,
                                            {
                                                backgroundColor: nightMode
                                                    ? SANCTUARY.surface.elevated
                                                    : SANCTUARY.surface.elevatedLight,
                                                borderColor: accentColor + '20',
                                            },
                                        ]}
                                        onPress={() => setShowRangeSelector(true)}
                                    >
                                        <Text style={[
                                            styles.compactRangeText,
                                            { color: nightMode ? SANCTUARY.text.primary : SANCTUARY.text.primaryLight },
                                        ]}>
                                            📖 آية {selectedRange.from}-{selectedRange.to}
                                            {learningMode && ' · 🎓 تعلم'}
                                        </Text>
                                        <Text style={[styles.expandText, { color: accentColor }]}>▼</Text>
                                    </TouchableOpacity>
                                )}
                            </Animated.View>

                            {/* Mushaf spanning full area */}
                            <View
                                style={{ flex: 1 }}
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

                                {/* Hifz Cover Overlay */}
                                {hifzCoverVisible && pagerHeight > 0 && (
                                    <HifzCover containerHeight={pagerHeight} />
                                )}
                            </View>
                        </>
                    )}
                </View>


                {/* ═══════════════════════════════════════════════════════════════ */}
                {/* ██  FLOATING DOCK — Action Bar (closed) + Unified Control   ██ */}
                {/* ═══════════════════════════════════════════════════════════════ */}

                {/* Immersive-aware footer — absolute positioned, passes touches through to PagerView */}
                <Animated.View
                    style={[styles.footerWrapper, footerAnimatedStyle]}
                    pointerEvents="box-none"
                >
                    {/* Action bar: shown when audio dock is closed */}
                    {audioMode === 'closed' && (
                        <View style={[
                            styles.actionBar,
                            {
                                bottom: Math.max(insets.bottom, 8) + 8,
                                backgroundColor: nightMode ? SANCTUARY.surface.elevated : SANCTUARY.surface.elevatedLight,
                            },
                        ]}>
                            <TouchableOpacity
                                style={[styles.actionBarButton, { backgroundColor: StaticColors.emerald[500] + '1A' }]}
                                onPress={() => scopeSheetRef.current?.snapToIndex(0)}
                                accessibilityRole="button"
                                accessibilityLabel="Open listen mode"
                            >
                                <Play color={StaticColors.emerald[400]} size={22} fill={StaticColors.emerald[400]} />
                                <Text style={[styles.actionBarButtonText, { color: StaticColors.emerald[300] }]}>استماع</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.actionBarButton, { backgroundColor: accentColor + '1A' }]}
                                onPress={() => setAudioMode('record')}
                                accessibilityRole="button"
                                accessibilityLabel="Open record mode"
                            >
                                <Mic color={accentColor} size={22} />
                                <Text style={[styles.actionBarButtonText, { color: isHafs ? StaticColors.emerald[300] : StaticColors.gold[300] }]}>تسميع</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Floating Sanctuary Dock */}
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
                        selectedReciter={selectedReciter}
                        onReciterAvatarPress={() => reciterSheetRef.current?.snapToIndex(0)}
                        bottomInset={insets.bottom}
                    />
                </Animated.View>

                {/* Feedback Modal */}
                <FeedbackModal
                    visible={modalVisible}
                    onClose={() => setModalVisible(false)}
                    feedback={feedback}
                    saving={saving}
                />

                {/* Ayah Context Menu */}
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

                {/* Tafseer Bottom Sheet */}
                <TafseerBottomSheet
                    visible={tafseerVisible}
                    onClose={() => setTafseerVisible(false)}
                    targetAyah={tafseerTarget}
                />
            </View>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* ██  Bottom Sheets — OUTSIDE rootContainer to prevent          ██ */}
            {/* ██  ghost touch interception from idle backdrop containers    ██ */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <ReciterBottomSheet
                sheetRef={reciterSheetRef}
                onSelect={handleReciterSelect}
                currentReciterId={selectedReciter.id}
                qiraat={activeQiraat === 'Hafs' ? 'Hafs' : 'Warsh'}
            />

            <PlaybackScopeSheet
                sheetRef={scopeSheetRef}
                nightMode={nightMode}
                accentColor={accentColor}
                surahName={surah?.name || 'سورة'}
                currentPage={activePage}
                currentJuz={currentJuz}
                totalVerses={verses.length}
                onScopeSelect={handleScopeSelect}
            />

            <UnifiedOptionsSheet
                sheetRef={optionsSheetRef}
                nightMode={nightMode}
                accentColor={accentColor}
                reciterName={selectedReciter.nameArabic}
                fontSize={currentFontSize}
                heatmapVisible={heatmapVisible}
                hifzCoverVisible={hifzCoverVisible}
                onReciterPress={() => reciterSheetRef.current?.snapToIndex(0)}
                onNightModeToggle={toggleTheme}
                onFontSizeChange={setCurrentFontSize}
                onHeatmapToggle={() => setHeatmapVisible(v => !v)}
                onHifzToggle={() => setHifzCoverVisible(v => !v)}
            />
        </KeyboardAvoidingView>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    rootContainer: {
        flex: 1,
    },

    // ── Minimal Glass Header ──
    headerOuter: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
    },
    headerInner: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerBtn: {
        padding: 10,
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
        marginHorizontal: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
    },
    headerSubtitle: {
        fontSize: 12,
        fontWeight: '500',
        marginTop: 1,
    },

    // ── Content ──
    content: {
        flex: 1,
    },

    // ── Footer Wrapper (absolute, touch-transparent) ──
    footerWrapper: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
    },

    // ── Range Selector ──
    compactRangeContainer: {
        position: 'absolute',
        left: 0,
        right: 0,
        paddingHorizontal: 16,
        paddingTop: 6,
        paddingBottom: 4,
    },
    rangeSelectorCard: {
        borderRadius: 16,
        padding: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
    },
    compactRangeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 3,
    },
    compactRangeText: {
        fontSize: 13,
        fontWeight: '600',
    },
    expandText: {
        fontSize: 11,
        fontWeight: '700',
    },
    collapseButton: {
        alignItems: 'center',
        paddingVertical: 6,
        marginTop: 4,
    },
    collapseButtonText: {
        fontSize: 12,
        fontWeight: '500',
    },
    learningModeToggle: {
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 12,
        marginTop: 8,
        alignItems: 'center',
        borderWidth: 1,
    },
    learningModeText: {
        fontSize: 13,
        fontWeight: '600',
        color: SANCTUARY.text.secondary,
    },

    // ── Floating Action Bar (closed state) ──
    actionBar: {
        position: 'absolute',
        left: 16,
        right: 16,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 28,
        paddingHorizontal: 8,
        paddingVertical: 8,
        gap: 8,
        zIndex: 50,
        // Elevation
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 14,
    },
    actionBarButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingVertical: 16,
        borderRadius: 22,
        minHeight: 52,
    },
    actionBarButtonText: {
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: 0.3,
    },

    // ── Loading & Error ──
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    loadingText: {
        marginTop: Spacing.md,
        fontSize: 15,
        fontWeight: '600',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    errorText: {
        marginTop: Spacing.lg,
        fontSize: 15,
        color: StaticColors.error,
        textAlign: 'center',
        marginBottom: Spacing.xl,
    },
    retryButton: {
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.md,
        borderRadius: 16,
    },
    retryButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#fff',
    },
});

export default function ReciteScreen() {
    return (
        <ErrorBoundary>
            <ReciteScreenInner />
        </ErrorBoundary>
    );
}
