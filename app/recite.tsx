import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    ActivityIndicator,
    Alert,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Audio } from 'expo-av';
import { setAudioModeAsync } from 'expo-audio';
import { audioEngine } from '../lib/audio-engine';
import { ArrowLeft, Mic, Square, Play, AlertCircle, Settings as SettingsIcon, Bookmark, Plus, Minus, Moon, Sun } from 'lucide-react-native';
import { Colors as StaticColors, Typography, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { useThemeColors } from '../constants/dynamicTheme';
import ErrorBoundary from '../components/ui/ErrorBoundary';
import Card from '../components/ui/Card';
import { checkRecitation } from '../lib/gemini'; // Keep RecitationAssessment from gemini as it's the primary source
import { checkRecitationViaStorage, RecitationAssessment, checkRecitationDirect } from '../lib/recitation-storage';
import { phonetizeForQiraat } from '../lib/quran-phonetizer';
import { getSurahByNumber } from '../constants/surahs';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings';
import { updateReviewSchedule } from '../lib/planner';
import { mediumImpact } from '../lib/haptics';
import { awardXP, checkAchievements, updateStreak, XP_REWARDS } from '../lib/gamification';
import { sendGoalCompletionNotification } from '../lib/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FeedbackModal from '../components/recite/FeedbackModal';
import { offlineQueue } from '../lib/offline-queue';
import { checkConnectivity } from '../lib/network';
import MushafPager from '../components/recite/MushafPager';
import UnifiedAudioControl, { AudioMode } from '../components/recite/UnifiedAudioControl';
import RangeSelector from '../components/recite/RangeSelector';
import AyahContextMenu from '../components/recite/AyahContextMenu';
import BookmarkHandle from '../components/recite/BookmarkHandle';
import HifzCover from '../components/recite/HifzCover';
import TafseerBottomSheet from '../components/mushaf/TafseerBottomSheet';
import { fetchTafseer, TafseerEntry } from '../lib/tafseer-data';
import { fetchSurahHeatmap, HeatmapData } from '../lib/heatmap-data';
import { useAyatDB } from '../lib/SQLiteProvider';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
} from 'react-native-reanimated';

// Minimum recording duration before analysis (seconds)
const MIN_RECORDING_SECONDS = 3;

interface Ayah {
    number: number;
    text: string;
    numberInSurah: number;
    page: number; // Added page number
    juz: number;
    manzil: number;
    ruku: number;
    hizbQuarter: number;
    sajda: boolean;
}

function ReciteScreenInner() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const { user } = useAuth();
    const { fontSize, theme, toggleTheme } = useSettings();
    const Colors = useThemeColors();
    // ✔️ Local SQLite DB — always available, no internet needed
    const db = useAyatDB();
    const surahNumber = parseInt(params.surahNumber as string) || 1;
    const surahName = params.surahName as string || 'الفاتحة';
    const surah = getSurahByNumber(surahNumber);
    const activeQiraat = params.activeNarration as string || 'Hafs';

    // API States
    const [verses, setVerses] = React.useState<Ayah[]>([]);
    const [loadingVerses, setLoadingVerses] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    // Unified Audio Control States
    const [audioMode, setAudioMode] = React.useState<AudioMode>('closed');
    const [activeVerseIndex, setActiveVerseIndex] = React.useState<number | null>(null);

    // Range Selection States
    const [selectedRange, setSelectedRange] = React.useState({ from: 1, to: 1 });
    const [learningMode, setLearningMode] = React.useState(false);
    const [recordingDuration, setRecordingDuration] = React.useState(0);
    const [showRangeSelector, setShowRangeSelector] = React.useState(false);

    // Pager State
    const [activePage, setActivePage] = React.useState<number>(1);

    // Recording States
    const [recording, setRecording] = React.useState<Audio.Recording | null>(null);
    const [analyzing, setAnalyzing] = React.useState(false);
    // ✔️ Upload progress step for clear user feedback
    const [uploadStep, setUploadStep] = React.useState<
        'idle' | 'uploading' | 'analyzing' | 'saving'
    >('idle');
    const [feedback, setFeedback] = React.useState<RecitationAssessment | null>(null);
    const [modalVisible, setModalVisible] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [permissionResponse, requestPermission] = Audio.usePermissions();
    const stoppingRef = React.useRef(false);
    const startingRef = React.useRef(false);
    // Sheikh's first-ayah URL — pre-fetched by UnifiedAudioControl, used as Makhraj reference
    const sheikhClipUrlRef = React.useRef<string | null>(null);

    // Reader Settings
    const [settingsVisible, setSettingsVisible] = React.useState(false);
    const [currentFontSize, setCurrentFontSize] = React.useState(fontSize || 24);
    const nightMode = theme === 'dark';
    const setNightMode = (value: boolean) => {
        if (value !== nightMode) toggleTheme();
    };
    const [isBookmarked, setIsBookmarked] = React.useState(false);

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
    const [tafseerData, setTafseerData] = React.useState<TafseerEntry | null>(null);
    const [tafseerLoading, setTafseerLoading] = React.useState(false);

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
    const handleTafseerRequest = React.useCallback(async (verseKey: string) => {
        const [surahStr, ayahStr] = verseKey.split(':');
        const surahNum = parseInt(surahStr);
        const ayahNum = parseInt(ayahStr);
        setTafseerVisible(true);
        setTafseerLoading(true);
        setTafseerData(null);
        try {
            const entry = await fetchTafseer(surahNum, ayahNum);
            setTafseerData(entry);
        } catch {
            setTafseerData(null);
        } finally {
            setTafseerLoading(false);
        }
    }, []);

    // Cleanup recording timer on unmount to prevent memory leak
    React.useEffect(() => {
        return () => {
            if (recording) {
                const timerInterval = (recording as any)._timerInterval;
                if (timerInterval) {
                    clearInterval(timerInterval);
                }
                recording.stopAndUnloadAsync().catch(console.warn);
            }
        };
    }, [recording]);

    // Load bookmark state — Supabase (synced) with AsyncStorage fallback
    React.useEffect(() => {
        loadBookmarkState();
    }, [surahNumber, user]);

    async function loadBookmarkState() {
        try {
            if (user) {
                // Primary: server-side bookmark (cross-device)
                const { data } = await supabase
                    .from('bookmarks')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('surah_number', surahNumber)
                    .maybeSingle();
                setIsBookmarked(!!data);
            } else {
                // Fallback: local AsyncStorage
                const stored = await AsyncStorage.getItem('bookmarks');
                if (stored) {
                    setIsBookmarked(JSON.parse(stored).includes(surahNumber));
                }
            }
        } catch (e) {
            console.error('Error loading bookmark state:', e);
        }
    }

    // Fetch verses on mount
    React.useEffect(() => {
        fetchSurah(surahNumber);
    }, [surahNumber]);

    // Fetch Heatmap
    React.useEffect(() => {
        if (user && surahNumber) {
            fetchSurahHeatmap(user.id, surahNumber).then(setHeatmapData);
        }
    }, [user, surahNumber]);

    // Initialize range when verses are loaded
    React.useEffect(() => {
        if (verses.length > 0) {
            // Check for Daily Ward params
            const fromAyah = parseInt(params.fromAyah as string) || 1;
            const toAyah = parseInt(params.toAyah as string) || verses.length;
            setSelectedRange({ from: fromAyah, to: toAyah });
        }
    }, [verses, params.fromAyah, params.toAyah]);

    // ✔️ fetchSurah: reads from LOCAL SQLite DB (ayat.db) — fully offline, instant
    // Previously called api.alquran.cloud every time (needs internet, can fail).
    async function fetchSurah(number: number) {
        setLoadingVerses(true);
        setError(null);
        try {
            // Query all ayahs of this surah from the bundled DB
            const rows = db.getAllSync<{
                id: number;
                sura: number;
                aya: number;
                goza: number;
                page: number;
                type: number;
                hizb: number | null;
                text: string | null;
            }>(
                'SELECT id, sura, aya, goza, page, type, hizb, text FROM Ayat WHERE sura = ? ORDER BY aya',
                [number]
            );

            if (rows.length === 0) {
                throw new Error(`لم يتم العثور على سورة ${number}`);
            }

            // Map DB rows → Ayah shape expected by the rest of the screen
            const ayahs = rows.map(row => ({
                number:        row.id,
                numberInSurah: row.aya,
                text:          row.text ?? '',
                page:          row.page,
                juz:           row.goza,
                manzil:        0,
                ruku:          0,
                hizbQuarter:   row.hizb ?? 0,
                sajda:         false,
            }));

            setVerses(ayahs);
            if (ayahs.length > 0) {
                setActivePage(ayahs[0].page);
                setActiveVerseIndex(0);
            }

            console.log(`[fetchSurah] Loaded ${ayahs.length} ayahs for surah ${number} from local DB ✔️`);
        } catch (err) {
            console.error('Error fetching surah from DB:', err);
            setError('فشل تحميل الآيات من قاعدة البيانات المحلية.');
        } finally {
            setLoadingVerses(false);
        }
    }

    // ── Navigation Logic ───────────────────────────────────────────
    const handleNextSurah = React.useCallback(() => {
        const nextSurahNumber = surahNumber + 1;
        if (nextSurahNumber <= 114) {
            const nextSurah = getSurahByNumber(nextSurahNumber);
            if (nextSurah) {
                router.setParams({
                    surahNumber: nextSurahNumber.toString(),
                    surahName: nextSurah.name,
                    activeNarration: activeQiraat
                });
            }
        }
    }, [surahNumber, activeQiraat, router]);

    // Sync Active Page when verse changes (Audio Playback)
    React.useEffect(() => {
        if (verses.length > 0 && activeVerseIndex !== null) {
            const verse = verses[activeVerseIndex];
            if (verse && verse.page !== activePage) {
                setActivePage(verse.page);
            }
        }
    }, [activeVerseIndex]); // Depend on verse index change

    // Helper function to convert audio URI to Base64
    const uriToBase64 = async (uri: string) => {
        const response = await fetch(uri);
        const blob = await response.blob();
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64data = (reader.result as string).split(',')[1];
                resolve(base64data);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    async function startRecording() {
        if (startingRef.current || stoppingRef.current || analyzing) return;

        try {
            startingRef.current = true;
            mediumImpact(); // Haptic feedback

            // ✅ FORCED CLEANUP - Ensure any existing recording is fully released
            if (recording) {
                try {
                    await recording.stopAndUnloadAsync();
                } catch (cleanupError) {
                    console.warn('Cleanup warning:', cleanupError);
                }
                setRecording(null);
            }

            const permission = await Audio.requestPermissionsAsync();
            if (!permission.granted) {
                Alert.alert('إذن مطلوب', 'يرجى السماح بالوصول إلى الميكروفون');
                return;
            }

            // Phase 2: Pause AudioEngine before switching iOS session to recording mode.
            // Without this, expo-av's allowsRecordingIOS=true kills the expo-audio playback session.
            const engineSnap = audioEngine.getSnapshot();
            if (engineSnap.isPlaying) {
                audioEngine.togglePlayback();
            }

            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });

            // Use HIGH_QUALITY for accurate phonetics
            const { recording: newRecording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            setRecording(newRecording);

            // Start recording timer
            const startTime = Date.now();
            const interval = setInterval(() => {
                setRecordingDuration(Math.floor((Date.now() - startTime) / 1000));
            }, 1000);
            (newRecording as any)._timerInterval = interval;
        } catch (err) {
            console.error('Failed to start recording', err);
            Alert.alert('خطأ', 'فشل بدء التسجيل. حاول مرة أخرى.');
        } finally {
            startingRef.current = false;
        }
    }

    async function stopRecording() {
        // Guard against double-invocation
        if (stoppingRef.current) return;

        // Capture recording reference before nulling
        const currentRecording = recording;

        if (!currentRecording) return;
        if (!user) {
            Alert.alert('خطأ', 'يجب تسجيل الدخول أولاً');
            return;
        }

        stoppingRef.current = true;

        // ✔️ Guard: minimum recording duration (prevents accidental tap analysis)
        if (recordingDuration < MIN_RECORDING_SECONDS) {
            stoppingRef.current = false;
            // Stop the recording cleanly without analyzing
            try {
                await currentRecording.stopAndUnloadAsync();
            } catch (_) {}
            setRecording(null);
            setRecordingDuration(0);
            Alert.alert(
                'التسجيل قصير جداً',
                `يرجى الاستمرار في التسجيل لمدة ${MIN_RECORDING_SECONDS} ثوانٍ على الأقل.`
            );
            return;
        }

        // Immediate UI update
        setRecording(null);
        setRecordingDuration(0);
        setAnalyzing(true);
        setUploadStep('uploading');

        try {
            mediumImpact();

            if ((currentRecording as any)._timerInterval) {
                clearInterval((currentRecording as any)._timerInterval);
            }

            console.log('🎤 Stopping recording...');

            try {
                const status = await currentRecording.getStatusAsync();
                if (status.canRecord || status.isRecording) {
                    await currentRecording.stopAndUnloadAsync();
                }
            } catch (stopError) {
                console.warn('Recording stop warning (may already be stopped):', stopError);
            }

            const uri = currentRecording.getURI();

            if (!uri) {
                throw new Error('لم يتم الحصول على ملف التسجيل');
            }

            console.log('📤 Uploading to Storage and analyzing...');

            // Only analyze verses in selected range
            const rangedVerses = verses.filter(
                v => v.numberInSurah >= selectedRange.from && v.numberInSurah <= selectedRange.to
            );
            const referenceText = rangedVerses.map(ayah => ayah.text).join(' * ');

            // ✅ TIMEOUT for large files
            const UPLOAD_TIMEOUT = 30000; // 30 seconds timeout

            // ✅ Convert User Audio to Base64 directly
            console.log('📤 Converting user audio to Base64...');
            const userAudioBase64 = await uriToBase64(uri) as string;

            // ✅ Convert Sheikh Audio to Base64 directly (if URL is present)
            let sheikhAudioBase64: string | undefined;
            let sheikhMimeType: string | undefined;
            
            if (sheikhClipUrlRef.current) {
                console.log(`🕌 Fetching sheikh clip for local conversion: ${sheikhClipUrlRef.current}`);
                try {
                    sheikhAudioBase64 = await uriToBase64(sheikhClipUrlRef.current) as string;
                    sheikhMimeType = sheikhClipUrlRef.current.endsWith('.mp3') ? 'audio/mp3' : 'audio/mp4';
                    console.log(`✅ Local Sheikh clip ready (${(sheikhAudioBase64.length / 1024).toFixed(1)} KB Base64)`);
                } catch (e) {
                    console.warn('⚠️ Failed to fetch sheikh audio for base64 locally:', e);
                }
            }

            // Phase 3b: Generate phonetic reference ON-DEVICE (zero latency, fully offline).
            let phoneticRef: string | undefined;
            try {
                phoneticRef = phonetizeForQiraat(referenceText, activeQiraat);
                if (__DEV__) {
                    console.log(`📜 Phonetic ref (local): ${phoneticRef.length} chars`);
                }
            } catch (phErr) {
                console.warn('[Phonetizer] Local phonetization failed (non-fatal):', phErr);
                phoneticRef = undefined;
            }

            // Call to client-side zero-cost Gemini
            console.log('📤 Sending Base64 payload directly to AI locally...');
            const uploadPromise = checkRecitation(
                userAudioBase64,
                referenceText,
                sheikhAudioBase64,
                sheikhMimeType,
                phoneticRef,
            );

            setUploadStep('analyzing');

            // ✔️ Check connectivity before spending 30s timeout
            const isOnline = await checkConnectivity();
            if (!isOnline) {
                // Queue for later — user recorded, don't lose it
                await offlineQueue.addToQueue(uri, referenceText, user.id, surahNumber);
                Alert.alert(
                    'لا يوجد اتصال 📡',
                    'تم حفظ تسجيلك وسيرسل تلقائياً عند عودة الاتصال.',
                    [{ text: 'حسناً' }]
                );
                return; // finally block will reset states
            }

            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('TIMEOUT')), UPLOAD_TIMEOUT)
            );

            let result;
            try {
                result = await Promise.race([uploadPromise, timeoutPromise]) as any;
            } catch (error: any) {
                if (error.message === 'TIMEOUT') {
                    throw new Error('الملف كبير جداً أو الشبكة بطيئة. يرجى تسجيل تلاوة أقصر (أقل من دقيقتين).');
                }
                throw error;
            }

            console.log('✅ Analysis complete:', result);

            if (result.error) {
                Alert.alert('خطأ في التحليل', result.error);
            } else {
                setUploadStep('saving');
                setFeedback(result);
                setModalVisible(true);

                // Save results and handle progression
                await saveResults(result);

                // ✔️ Learning mode: advance on minor-only errors OR no errors
                // Previously: only advanced when mistakes array was EMPTY (0 errors)
                // Now: also advances when ALL errors are 'minor' severity
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
            }
        } catch (error: any) {
            console.error('Failed to process recording:', error);

            // ✅ CLEAR ERROR MESSAGES
            let errorMessage = 'فشل في تحليل التلاوة. يرجى المحاولة مرة أخرى.';

            if (error.message?.includes('كبير جداً') || error.message?.includes('أقصر')) {
                errorMessage = error.message;
            } else if (error.message?.includes('network') || error.message?.includes('timeout')) {
                errorMessage = 'مشكلة في الاتصال بالإنترنت. يرجى التحقق من الشبكة.';
            }

            Alert.alert('خطأ', errorMessage);
        } finally {
            // ✅ ALWAYS reset states - even if upload fails
            setAnalyzing(false);
            setUploadStep('idle');
            stoppingRef.current = false;

            // Phase 2: Restore expo-audio session after recording.
            // This re-enables background playback + AudioFocus for the engine.
            try {
                await setAudioModeAsync({
                    playsInSilentMode: true,
                    shouldPlayInBackground: true,
                    interruptionMode: 'doNotMix',
                    allowsRecording: false,
                });
            } catch (sessionErr) {
                console.warn('[Audio] Session restore warning:', sessionErr);
            }
        }
    }

    async function saveResults(assessment: RecitationAssessment) {
        setSaving(true);
        try {
            if (!user) return;
            const userId = user.id;

            if (assessment.mistakes && assessment.mistakes.length > 0) {
                const mistakesToSave = assessment.mistakes.map(mistake => ({
                    user_id: userId,
                    surah: surahNumber,
                    verse: selectedRange.from,
                    error_description: `${mistake.text} → ${mistake.correction}: ${mistake.description}`,
                    created_at: new Date().toISOString(),
                }));

                await supabase.from('mistake_log').insert(mistakesToSave);
            }

            // ── ✅ FIXED: Save daily log with surah_number + verse range ──────────────
            // Previously: always +1 page, no surah_number → completion never detected
            // Now: compute unique pages from actual verse data, save surah/verse info
            const versePages = verses
                .filter(v => v.numberInSurah >= selectedRange.from && v.numberInSurah <= selectedRange.to)
                .map(v => v.page);
            const uniquePages = versePages.length > 0 ? new Set(versePages).size : 1;

            const today = new Date().toISOString().split('T')[0];
            const { data: existingLog } = await supabase
                .from('daily_logs')
                .select('id, pages_completed')
                .eq('user_id', userId)
                .eq('date', today)
                .eq('surah_number', surahNumber)
                .maybeSingle();

            if (existingLog) {
                await supabase.from('daily_logs').update({
                    pages_completed: (existingLog.pages_completed || 0) + uniquePages,
                    verse_from: selectedRange.from,
                    verse_to:   selectedRange.to,
                    score:      assessment.score ?? null,
                    updated_at: new Date().toISOString(),
                }).eq('id', existingLog.id);
            } else {
                await supabase.from('daily_logs').insert({
                    user_id:         userId,
                    date:            today,
                    surah_number:    surahNumber,
                    verse_from:      selectedRange.from,
                    verse_to:        selectedRange.to,
                    pages_completed: uniquePages,
                    score:           assessment.score ?? null,
                    created_at:      new Date().toISOString(),
                });
            }

            // SM-2: pass the 0-100 score — planner converts it to quality 0-5 internally
            await updateReviewSchedule(userId, surahNumber, assessment.score ?? 0);

            // ✔️ Update streak AFTER saving the daily_log (correct order)
            const streakStatus = await updateStreak(userId);
            if (streakStatus === 'incremented') {
                await awardXP(userId, XP_REWARDS.DAILY_STREAK, 'Daily Streak');
            }

            await awardXP(userId, XP_REWARDS.PAGE_COMPLETED, 'Page Recitation');

            if (!assessment.mistakes || assessment.mistakes.length === 0) {
                await awardXP(userId, XP_REWARDS.PERFECT_RECITATION, 'Perfect Recitation');
            }

            await checkAchievements(userId);

            // ── ✅ FIXED: Surah completion via server RPC ─────────────────────
            // upsert_surah_progress accumulates verse ranges and returns
            // out_completed=true only when ALL verses have been practised.
            const surahData = getSurahByNumber(surahNumber);
            if (surahData && surahData.verses > 0) {
                const { data: progressData, error: progressError } = await supabase
                    .rpc('upsert_surah_progress', {
                        p_user_id:      userId,
                        p_surah:        surahNumber,
                        p_verse_from:   selectedRange.from,
                        p_verse_to:     selectedRange.to,
                        p_total_verses: surahData.verses,
                    });

                if (progressError) {
                    // RPC not yet deployed — graceful degradation, no crash
                    console.warn('[saveResults] upsert_surah_progress unavailable:', progressError.message);
                } else {
                    const result = Array.isArray(progressData) ? progressData[0] : progressData;
                    const isSurahCompleted: boolean = result?.out_completed ?? false;
                    const versesDone: number        = result?.out_verses_done ?? 0;

                    console.log(`[saveResults] Surah ${surahNumber}: ${versesDone}/${surahData.verses} verses (completed=${isSurahCompleted})`);

                    if (isSurahCompleted) {
                        await sendGoalCompletionNotification(surahName);

                        const nextSurahNumber = surahNumber + 1;
                        if (nextSurahNumber <= 114) {
                            const nextSurah = getSurahByNumber(nextSurahNumber);
                            if (nextSurah) {
                                setTimeout(() => {
                                    setModalVisible(false);
                                    handleNextSurah();
                                }, 2500);
                            }
                        }
                    }
                }
            }

            Alert.alert('تم الحفظ ✅', 'تم حفظ تقدمك! تمت إضافة نقاط XP 🎉');
        } catch (error) {
            console.error('Error saving results:', error);
            Alert.alert('خطأ', 'فشل حفظ النتائج. يرجى المحاولة مرة أخرى.');
        } finally {
            setSaving(false);
        }
    }

    async function toggleBookmark() {
        try {
            if (user) {
                // Primary: sync with Supabase
                if (isBookmarked) {
                    await supabase
                        .from('bookmarks')
                        .delete()
                        .eq('user_id', user.id)
                        .eq('surah_number', surahNumber);
                    setIsBookmarked(false);
                } else {
                    await supabase.from('bookmarks').upsert({
                        user_id: user.id,
                        surah_number: surahNumber,
                        surah_name: surahName,
                        created_at: new Date().toISOString(),
                    }, { onConflict: 'user_id,surah_number' });
                    setIsBookmarked(true);
                }
            } else {
                // Fallback: local AsyncStorage only
                const stored = await AsyncStorage.getItem('bookmarks');
                let bookmarks: number[] = stored ? JSON.parse(stored) : [];
                if (isBookmarked) {
                    bookmarks = bookmarks.filter(s => s !== surahNumber);
                    setIsBookmarked(false);
                } else {
                    bookmarks.push(surahNumber);
                    setIsBookmarked(true);
                }
                await AsyncStorage.setItem('bookmarks', JSON.stringify(bookmarks));
            }
        } catch (error) {
            console.error('Error toggling bookmark:', error);
        }
    }

    function increaseFontSize() {
        if (currentFontSize < 48) setCurrentFontSize(prev => prev + 2);
    }

    function decreaseFontSize() {
        if (currentFontSize > 16) setCurrentFontSize(prev => prev - 2);
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
                                onPress={() => fetchSurah(surahNumber)}
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
                        recording={recording !== null}
                        onStartRecording={startRecording}
                        onStopRecording={stopRecording}
                        analyzing={analyzing}
                        uploadStep={uploadStep}
                        recordingDuration={recordingDuration}
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
                <TafseerBottomSheet
                    visible={tafseerVisible}
                    onClose={() => setTafseerVisible(false)}
                    tafseer={tafseerData}
                    loading={tafseerLoading}
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
    floatingActions: {
        // Kept so old references compile; the FAB UI is now in the footer action bar
        display: 'none' as any,
    },
    fab: {
        width: 56,
        height: 56,
        borderRadius: 28,
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
        ...Shadows.xl,
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
        backgroundColor: '#fff',
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
        backgroundColor: '#fff',
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
