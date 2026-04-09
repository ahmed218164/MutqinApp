/**
 * components/recite/UnifiedAudioControl.tsx
 *
 * Phase 1 Upgrade — AudioEngine replaces AudioPlayerControls
 *
 * Key design decisions:
 *  - Imports audioEngine singleton (expo-audio backed, background-capable)
 *  - Engine is configured + started when listen mode is first entered
 *  - Verse changes are mapped from ranged-index → full-verses-index → onVerseChange
 *    so highlightedVerseKey and activePage always track the correct ayah
 *  - Learning mode: engine stops after each verse; component advances on re-entry
 *  - Audio session handoff: pauses engine when mode → 'record'
 */

import * as React from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import {
    Headphones, Mic, X, Music2,
    Play, Pause, SkipBack, SkipForward, Repeat, Gauge, Timer,
} from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { lightImpact, mediumImpact } from '../../lib/haptics';
import RecordingControls from './RecordingControls';
import ReciterSelectionModal from './ReciterSelectionModal';
import { Reciter, getDefaultReciter } from '../../lib/audio-reciters';
import {
    audioEngine, useAudioEngine, repeatLabel, configureAudioSession,
} from '../../lib/audio-engine';
import { getAyahAudioUrl } from '../../lib/quran-audio-api';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AudioMode = 'listen' | 'record' | 'closed';

interface Ayah {
    number: number;
    text: string;
    numberInSurah: number;
    page: number;
}

export interface UnifiedAudioControlProps {
    mode: AudioMode;
    onModeChange: (mode: AudioMode) => void;
    // Listen props
    surahNumber: number;
    verses: Ayah[];
    selectedRange: { from: number; to: number };
    activeQiraat: string;
    onVerseChange: (index: number) => void;
    // Record props
    recording: boolean;
    onStartRecording: () => void;
    onStopRecording: () => void;
    analyzing: boolean;
    /** Detailed upload progress state for user feedback */
    uploadStep?: 'idle' | 'uploading' | 'analyzing' | 'saving';
    recordingDuration?: number;
    // VAD props (from useVADRecorder)
    /** Real-time metering history (0-1 normalised), 20 values */
    meterHistory?: number[];
    /** Number of VAD chunks sent to Muaalem API */
    chunksSent?: number;
    /** Number of VAD chunks that finished analysis */
    chunksCompleted?: number;
    /** Whether VAD is finishing (waiting for last chunks) */
    isFinishing?: boolean;
    // Learning mode
    learningMode?: boolean;
    onLearningStepComplete?: () => void;
    onSurahEnd?: () => void;
    /** Called when we know the sheikh's first-ayah URL — used as Makhraj reference in Edge Function */
    onSheikhClipReady?: (url: string | null) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function UnifiedAudioControl({
    mode,
    onModeChange,
    surahNumber,
    verses,
    selectedRange,
    activeQiraat,
    onVerseChange,
    recording,
    onStartRecording,
    onStopRecording,
    analyzing,
    uploadStep = 'idle',
    recordingDuration = 0,
    meterHistory,
    chunksSent = 0,
    chunksCompleted = 0,
    isFinishing = false,
    learningMode = false,
    onLearningStepComplete,
    onSurahEnd,
    onSheikhClipReady,
}: UnifiedAudioControlProps) {

    const isHafs = activeQiraat === 'Hafs';
    const accentColor = isHafs ? Colors.emerald[500] : Colors.gold[500];

    // Reciter selection (owned locally — no need to lift to recite.tsx)
    const [selectedReciter, setSelectedReciter] = React.useState<Reciter>(getDefaultReciter());
    const [reciterModalVisible, setReciterModalVisible] = React.useState(false);

    // Live engine state via useSyncExternalStore
    const engineState = useAudioEngine();

    // Verses filtered to the selected range
    const rangedVerses = React.useMemo(
        () => verses.filter(v =>
            v.numberInSurah >= selectedRange.from && v.numberInSurah <= selectedRange.to
        ),
        [verses, selectedRange]
    );

    // ── Engine lifecycle: configure & start on first listen entry ─────────────

    const engineInitialized = React.useRef(false);
    const reciterIdRef = React.useRef(selectedReciter.id);

    // ── Sheikh clip URL prefetch (for Makhraj reference) ─────────────────────
    // Fires onSheikhClipReady whenever the reciter or surah changes.
    // recite.tsx caches this URL and passes it to checkRecitationViaStorage.
    React.useEffect(() => {
        const firstVerse = rangedVerses[0];
        if (!firstVerse) { onSheikhClipReady?.(null); return; }
        let cancelled = false;
        getAyahAudioUrl(surahNumber, firstVerse.numberInSurah, selectedReciter)
            .then(url => { if (!cancelled) onSheikhClipReady?.(url ?? null); })
            .catch(() => { if (!cancelled) onSheikhClipReady?.(null); });
        return () => { cancelled = true; };
    }, [selectedReciter.id, surahNumber, rangedVerses[0]?.numberInSurah]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sync learningMode → engine whenever it or mode changes
    React.useEffect(() => {
        audioEngine.setLearningMode(learningMode && mode === 'listen');
    }, [learningMode, mode]);

    // Track previous mode to detect record → listen transitions
    const prevModeRef = React.useRef(mode);

    // Main mode-transition effect
    React.useEffect(() => {
        const prevMode = prevModeRef.current;
        prevModeRef.current = mode;

        if (mode === 'listen') {
            // Restore audio session to playback mode (cross-platform).
            // Critical after recording: the audio category was switched to
            // allowsRecording=true, which on iOS routes output to earpiece.
            if (prevMode === 'record') {
                configureAudioSession(true).catch(err =>
                    console.warn('[UnifiedAudio] session restore failed:', err)
                );
            }

            if (!engineInitialized.current) {
                // First entry: configure and start from verse 0
                audioEngine.configure(surahNumber, rangedVerses, selectedReciter);
                audioEngine.play(0);
                engineInitialized.current = true;
            } else {
                const snap = audioEngine.getSnapshot();
                if (learningMode && snap.didCompleteVerse) {
                    // User just finished recording a verse → advance to next
                    audioEngine.playNext();
                } else if (!snap.isPlaying && !snap.isLoading) {
                    // Returning from record without completing a verse → resume
                    audioEngine.togglePlayback();
                }
                // If already playing (switching back from a momentary tab click), do nothing
            }
        } else if (engineInitialized.current) {
            // Leaving listen mode → pause to free the audio session for recording
            const snap = audioEngine.getSnapshot();
            if (snap.isPlaying) audioEngine.togglePlayback();
        }
    }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

    // Reciter change mid-session
    React.useEffect(() => {
        if (reciterIdRef.current === selectedReciter.id) return;
        reciterIdRef.current = selectedReciter.id;
        if (engineInitialized.current) {
            audioEngine.configure(surahNumber, rangedVerses, selectedReciter);
            audioEngine.play(engineState.currentIndex);
        }
    }, [selectedReciter.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Verse-change sync → parent (highlight + page flip) ───────────────────
    //
    // The engine tracks indexes within rangedVerses (0-based within the range).
    // recite.tsx needs the index within the full `verses` array.
    // We map: rangedVerse.numberInSurah → verses.findIndex(...).

    const lastNotifiedIndexRef = React.useRef(-1);
    React.useEffect(() => {
        if (!engineInitialized.current) return;
        if (engineState.currentIndex === lastNotifiedIndexRef.current) return;
        lastNotifiedIndexRef.current = engineState.currentIndex;

        const rangedVerse = rangedVerses[engineState.currentIndex];
        if (!rangedVerse) return;
        const fullIdx = verses.findIndex(v => v.numberInSurah === rangedVerse.numberInSurah);
        if (fullIdx !== -1) {
            onVerseChange(fullIdx); // → setActiveVerseIndex → highlightedVerseKey + page flip
        }
    }, [engineState.currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Detect natural completion (surah end or learning-mode verse end) ───────

    const wasPlayingRef = React.useRef(false);
    React.useEffect(() => {
        const stoppedNaturally =
            wasPlayingRef.current &&
            !engineState.isPlaying &&
            !engineState.isLoading &&
            engineState.didCompleteVerse &&
            engineInitialized.current &&
            mode === 'listen';

        if (stoppedNaturally) {
            if (learningMode) {
                onLearningStepComplete?.();
            } else {
                // No more verses in range → surah/range end
                onSurahEnd?.();
            }
        }
        wasPlayingRef.current = engineState.isPlaying;
    }, [engineState.isPlaying, engineState.isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Cleanup on unmount ────────────────────────────────────────────────────

    React.useEffect(() => {
        return () => {
            audioEngine.stop();
            engineInitialized.current = false;
        };
    }, []);

    // ── Derived UI values ─────────────────────────────────────────────────────

    const isRepeatActive = engineState.repeatMode !== 1;
    const progress = rangedVerses.length > 0
        ? (engineState.currentIndex + 1) / rangedVerses.length
        : 0;
    const currentVerse = rangedVerses[engineState.currentIndex];
    const SPEEDS = [1.0, 0.75, 1.25, 1.5];

    if (mode === 'closed') return null;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <>
            <Animated.View
                entering={FadeIn.duration(300)}
                exiting={FadeOut.duration(200)}
                style={styles.container}
            >
                <BlurView
                    intensity={80}
                    tint="dark"
                    style={[styles.blurContainer, { borderTopColor: accentColor + '40' }]}
                >
                    {/* ── Mode Tabs ── */}
                    <View style={styles.tabsContainer}>
                        <TouchableOpacity
                            style={[styles.tab, mode === 'listen' && styles.activeTab]}
                            onPress={() => { lightImpact(); onModeChange('listen'); }}
                            accessibilityRole="tab"
                            accessibilityLabel="Listen Mode"
                            accessibilityState={{ selected: mode === 'listen' }}
                        >
                            <Headphones size={18} color={mode === 'listen' ? accentColor : Colors.neutral[400]} />
                            <Text style={[styles.tabText, mode === 'listen' && { color: accentColor }]}>
                                استماع
                            </Text>
                        </TouchableOpacity>

                        {/* Reciter pill — only in listen mode */}
                        {mode === 'listen' && (
                            <TouchableOpacity
                                style={styles.reciterButton}
                                onPress={() => { lightImpact(); setReciterModalVisible(true); }}
                                accessibilityRole="button"
                                accessibilityLabel={`Reciter: ${selectedReciter.name}`}
                            >
                                <Music2 size={14} color={Colors.gold[400]} />
                                <Text style={styles.reciterButtonText} numberOfLines={1}>
                                    {selectedReciter.name}
                                </Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            style={[styles.tab, mode === 'record' && styles.activeTab]}
                            onPress={() => { lightImpact(); onModeChange('record'); }}
                            accessibilityRole="tab"
                            accessibilityLabel="Record Mode"
                            accessibilityState={{ selected: mode === 'record' }}
                        >
                            <Mic size={18} color={mode === 'record' ? accentColor : Colors.neutral[400]} />
                            <Text style={[styles.tabText, mode === 'record' && { color: accentColor }]}>
                                تسميع
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={() => { lightImpact(); onModeChange('closed'); }}
                            accessibilityRole="button"
                            accessibilityLabel="Close audio controls"
                        >
                            <X size={20} color={Colors.neutral[400]} />
                        </TouchableOpacity>
                    </View>

                    {/* ── Mode Content ── */}
                    <View style={styles.contentContainer}>

                        {/* ── LISTEN MODE ── */}
                        {mode === 'listen' && (
                            <View style={styles.listenContainer}>
                                {/* Verse info */}
                                <View style={styles.infoContainer}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Text style={styles.verseText}>
                                            آية {engineState.currentIndex + 1} من {rangedVerses.length}
                                        </Text>
                                        {engineState.isGaplessMode && (
                                            <Text style={{
                                                fontSize: 10,
                                                fontWeight: '700' as const,
                                                color: Colors.gold[400],
                                                backgroundColor: Colors.gold[400] + '18',
                                                paddingHorizontal: 5,
                                                paddingVertical: 1,
                                                borderRadius: 4,
                                            }}>
                                                Gapless ∞
                                            </Text>
                                        )}
                                    </View>
                                    <Text
                                        style={[styles.reciterText, { color: accentColor }]}
                                        numberOfLines={1}
                                    >
                                        {selectedReciter.nameArabic} · {selectedReciter.name}
                                    </Text>
                                </View>

                                {/* Transport */}
                                <View style={styles.controlsContainer}>
                                    <TouchableOpacity
                                        onPress={() => { lightImpact(); audioEngine.skipPrev(); }}
                                        disabled={engineState.currentIndex === 0}
                                        accessibilityRole="button"
                                        accessibilityLabel="Previous verse"
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    >
                                        <SkipBack
                                            size={24}
                                            color={engineState.currentIndex === 0
                                                ? Colors.neutral[600] : Colors.neutral[200]}
                                        />
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={[styles.playButton, { backgroundColor: accentColor }]}
                                        onPress={() => { lightImpact(); audioEngine.togglePlayback(); }}
                                        accessibilityRole="button"
                                        accessibilityLabel={engineState.isPlaying ? 'Pause' : 'Play'}
                                    >
                                        {engineState.isLoading ? (
                                            <ActivityIndicator color={Colors.text.inverse} size="small" />
                                        ) : engineState.isPlaying ? (
                                            <Pause size={24} color={Colors.text.inverse} fill={Colors.text.inverse} />
                                        ) : (
                                            <Play size={24} color={Colors.text.inverse} fill={Colors.text.inverse} />
                                        )}
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        onPress={() => { lightImpact(); audioEngine.skipNext(); }}
                                        disabled={engineState.currentIndex >= rangedVerses.length - 1}
                                        accessibilityRole="button"
                                        accessibilityLabel="Next verse"
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    >
                                        <SkipForward
                                            size={24}
                                            color={engineState.currentIndex >= rangedVerses.length - 1
                                                ? Colors.neutral[600] : Colors.neutral[200]}
                                        />
                                    </TouchableOpacity>
                                </View>

                                {/* Bottom row: speed · progress · repeat */}
                                <View style={styles.bottomRow}>
                                    <TouchableOpacity
                                        onPress={() => {
                                            lightImpact();
                                            const idx = SPEEDS.indexOf(engineState.playbackSpeed);
                                            audioEngine.setSpeed(SPEEDS[(idx + 1) % SPEEDS.length]);
                                        }}
                                        style={styles.chipButton}
                                        accessibilityRole="button"
                                        accessibilityLabel="Change playback speed"
                                    >
                                        <Gauge size={11} color={accentColor} />
                                        <Text style={[styles.chipText, { color: accentColor }]}>
                                            {engineState.playbackSpeed}×
                                        </Text>
                                    </TouchableOpacity>

                                    <View style={styles.progressBarBg}>
                                        <View style={[
                                            styles.progressBarFill,
                                            { width: `${progress * 100}%`, backgroundColor: accentColor },
                                        ]} />
                                    </View>

                                    <TouchableOpacity
                                        onPress={() => { mediumImpact(); audioEngine.cycleRepeat(); }}
                                        style={[
                                            styles.chipButton,
                                            isRepeatActive && { backgroundColor: accentColor + '22' },
                                        ]}
                                        accessibilityRole="button"
                                        accessibilityLabel="Cycle repeat mode"
                                    >
                                        <Repeat
                                            size={11}
                                            color={isRepeatActive ? accentColor : Colors.neutral[500]}
                                        />
                                        <Text style={[
                                            styles.chipText,
                                            { color: isRepeatActive ? accentColor : Colors.neutral[500] },
                                        ]}>
                                            {repeatLabel(engineState.repeatMode)}
                                        </Text>
                                    </TouchableOpacity>

                                    {/* Per-ayah delay (from reference: delayBetweenAyatButton) */}
                                    <TouchableOpacity
                                        onPress={() => { lightImpact(); audioEngine.cycleAyahDelay(); }}
                                        style={[
                                            styles.chipButton,
                                            engineState.ayahDelay > 0 && { backgroundColor: accentColor + '22' },
                                        ]}
                                        accessibilityRole="button"
                                        accessibilityLabel="تأخير بين الآيات"
                                    >
                                        <Timer
                                            size={11}
                                            color={engineState.ayahDelay > 0 ? accentColor : Colors.neutral[500]}
                                        />
                                        <Text style={[
                                            styles.chipText,
                                            { color: engineState.ayahDelay > 0 ? accentColor : Colors.neutral[500] },
                                        ]}>
                                            {engineState.ayahDelay > 0 ? `${engineState.ayahDelay}ث` : 'تأخير'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                {learningMode && (
                                    <Text style={styles.learningModeHint}>
                                        🎓 وضع التعلّم: استمع ثم سجّل تلاوتك
                                    </Text>
                                )}
                            </View>
                        )}

                        {/* ── RECORD MODE ── */}
                        {mode === 'record' && (
                            <RecordingControls
                                recording={recording}
                                onStartRecording={onStartRecording}
                                onStopRecording={onStopRecording}
                                analyzing={analyzing}
                                uploadStep={uploadStep}
                                recordingDuration={recordingDuration}
                                accentColor={accentColor}
                                meterHistory={meterHistory}
                                chunksSent={chunksSent}
                                chunksCompleted={chunksCompleted}
                                isFinishing={isFinishing}
                            />
                        )}
                    </View>
                </BlurView>
            </Animated.View>

            {/* Reciter Selection Modal */}
            <ReciterSelectionModal
                visible={reciterModalVisible}
                onClose={() => setReciterModalVisible(false)}
                onSelect={(reciter) => {
                    setSelectedReciter(reciter);
                    lightImpact();
                }}
                currentReciterId={selectedReciter.id}
                qiraat={isHafs ? 'Hafs' : 'Warsh'}
            />
        </>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
    },
    blurContainer: {
        borderTopWidth: 1,
        borderTopLeftRadius: BorderRadius['2xl'],
        borderTopRightRadius: BorderRadius['2xl'],
        overflow: 'hidden',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        ...Shadows.xl,
    },
    // ── Tabs ──
    tabsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingTop: Spacing.md,
        paddingBottom: Spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.1)',
        gap: Spacing.xs,
    },
    tab: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.xs,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.md,
        borderRadius: BorderRadius.lg,
    },
    activeTab: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    tabText: {
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.semibold,
        color: Colors.neutral[400],
    },
    reciterButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(234, 179, 8, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(234, 179, 8, 0.3)',
        borderRadius: BorderRadius.full,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 5,
        overflow: 'hidden',
    },
    reciterButtonText: {
        flex: 1,
        fontSize: Typography.fontSize.xs,
        fontWeight: Typography.fontWeight.semibold,
        color: Colors.gold[300],
    },
    closeButton: {
        padding: Spacing.sm,
    },
    // ── Content ──
    contentContainer: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        paddingBottom: Spacing.xl,
    },
    // ── Listen mode ──
    listenContainer: {
        gap: Spacing.md,
    },
    infoContainer: {
        alignItems: 'center',
    },
    verseText: {
        fontSize: Typography.fontSize.sm,
        color: Colors.neutral[200],
        fontWeight: Typography.fontWeight.bold,
    },
    reciterText: {
        fontSize: Typography.fontSize.xs,
        marginTop: 2,
    },
    controlsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.xl,
    },
    playButton: {
        width: 48,
        height: 48,
        borderRadius: BorderRadius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
    bottomRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    chipButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 7,
        paddingVertical: 4,
        borderRadius: BorderRadius.sm,
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    chipText: {
        fontSize: 11,
        fontWeight: Typography.fontWeight.bold,
    },
    progressBarBg: {
        flex: 1,
        height: 3,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: BorderRadius.full,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: BorderRadius.full,
    },
    learningModeHint: {
        fontSize: Typography.fontSize.xs,
        color: Colors.gold[400],
        textAlign: 'center',
        marginTop: Spacing.xs,
    },
});
