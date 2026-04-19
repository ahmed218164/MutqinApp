/**
 * components/recite/UnifiedAudioControl.tsx
 *
 * Phase 3 — Premium Docked Bottom Player
 *
 * Architecture:
 *  - Single sleek BlurView bar with translucent background
 *  - Compact horizontal layout: Avatar | Transport | Chips
 *  - Real-time progress ring via RNTP useProgress() hook
 *  - Reciter selection properly wired to audio engine
 *  - Immersive mode: parent Animated.View slides bar offscreen
 */

import * as React from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
    Platform,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import BottomSheet from '@gorhom/bottom-sheet';
import { useProgress } from 'react-native-track-player';
import {
    Headphones, Mic, X,
    Play, Pause, SkipBack, SkipForward,
    Repeat, Gauge, Timer, ChevronDown,
} from 'lucide-react-native';
import { Colors, Spacing, Shadows } from '../../constants/theme';
import { lightImpact, mediumImpact } from '../../lib/haptics';
import RecordingControls from './RecordingControls';
import ReciterBottomSheet from './ReciterBottomSheet';
import { Reciter, getDefaultReciter } from '../../lib/audio-reciters';
import {
    audioEngine, useAudioEngine, repeatLabel, configureAudioSession,
} from '../../lib/audio-engine';
import { getStorageCdnUrl } from '../../lib/quran-audio-api';

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
    uploadStep?: 'idle' | 'uploading' | 'analyzing' | 'saving';
    recordingDuration?: number;
    // VAD props
    meterHistoryShared?: SharedValue<number[]>;
    chunksSent?: number;
    chunksCompleted?: number;
    isFinishing?: boolean;
    // Learning mode
    learningMode?: boolean;
    onLearningStepComplete?: () => void;
    onSurahEnd?: () => void;
    onSheikhClipReady?: (url: string | null) => void;
}

// ── Circular Progress Ring ────────────────────────────────────────────────────
// Real-time SVG ring around the play button showing RNTP audio progress.

const RING_SIZE = 52;
const RING_STROKE = 2.5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ProgressRing({ progress, color }: { progress: number; color: string }) {
    const clampedProgress = Math.min(1, Math.max(0, progress));
    const strokeDashoffset = RING_CIRCUMFERENCE * (1 - clampedProgress);
    return (
        <Svg width={RING_SIZE} height={RING_SIZE} style={styles.progressRing}>
            {/* Background track */}
            <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke="rgba(255,255,255,0.10)"
                strokeWidth={RING_STROKE}
                fill="transparent"
            />
            {/* Progress arc */}
            <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke={color}
                strokeWidth={RING_STROKE}
                fill="transparent"
                strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                rotation="-90"
                origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
            />
        </Svg>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

function UnifiedAudioControlInner({
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
    meterHistoryShared,
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

    // Reciter selection state
    const [selectedReciter, setSelectedReciter] = React.useState<Reciter>(getDefaultReciter());
    const reciterSheetRef = React.useRef<BottomSheet>(null);

    // Live engine state
    const engineState = useAudioEngine();

    // ── BUG FIX #2: Real-time RNTP progress for the ring ──────────────────
    // Poll every 250ms for smooth ring animation
    const rntp = useProgress(250);
    const trackProgress = rntp.duration > 0 ? rntp.position / rntp.duration : 0;

    // Verses filtered to the selected range
    const rangedVerses = React.useMemo(
        () => verses.filter(v =>
            v.numberInSurah >= selectedRange.from && v.numberInSurah <= selectedRange.to
        ),
        [verses, selectedRange]
    );

    // ── Engine lifecycle ──────────────────────────────────────────────────────

    const engineInitialized = React.useRef(false);
    const reciterIdRef = React.useRef(selectedReciter.id);

    // Sheikh clip URL for Makhraj reference
    React.useEffect(() => {
        const firstVerse = rangedVerses[0];
        if (!firstVerse) { onSheikhClipReady?.(null); return; }
        try {
            let url: string | null = null;
            if (selectedReciter.elmushafPath) {
                url = getStorageCdnUrl(
                    selectedReciter.id, selectedReciter.audioType,
                    surahNumber, firstVerse.numberInSurah,
                );
            } else if (selectedReciter.baseUrl) {
                const s = surahNumber.toString().padStart(3, '0');
                const a = firstVerse.numberInSurah.toString().padStart(3, '0');
                url = `${selectedReciter.baseUrl}/${s}${a}.mp3`;
            }
            onSheikhClipReady?.(url);
        } catch {
            onSheikhClipReady?.(null);
        }
    }, [selectedReciter.id, surahNumber, rangedVerses[0]?.numberInSurah]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sync learningMode → engine
    React.useEffect(() => {
        audioEngine.setLearningMode(learningMode && mode === 'listen');
    }, [learningMode, mode]);

    // Track previous mode for record → listen transitions
    const prevModeRef = React.useRef(mode);

    // Main mode-transition effect
    React.useEffect(() => {
        const prevMode = prevModeRef.current;
        prevModeRef.current = mode;

        if (mode === 'listen') {
            if (prevMode === 'record') {
                configureAudioSession(true).catch(err =>
                    console.warn('[UnifiedAudio] session restore failed:', err)
                );
            }

            if (!engineInitialized.current) {
                audioEngine.configure(surahNumber, rangedVerses, selectedReciter);
                audioEngine.play(0);
                engineInitialized.current = true;
            } else {
                const snap = audioEngine.getSnapshot();
                if (learningMode && snap.didCompleteVerse) {
                    audioEngine.playNext();
                } else if (!snap.isPlaying && !snap.isLoading) {
                    audioEngine.togglePlayback();
                }
            }
        } else if (engineInitialized.current) {
            const snap = audioEngine.getSnapshot();
            if (snap.isPlaying) audioEngine.togglePlayback();
        }
    }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── BUG FIX #1: Reciter change — proper re-configure + play ───────────
    const handleReciterSelect = React.useCallback((reciter: Reciter) => {
        setSelectedReciter(reciter);
        lightImpact();

        // Immediately reconfigure the engine with the new reciter
        if (engineInitialized.current) {
            const currentIdx = audioEngine.getSnapshot().currentIndex;
            audioEngine.configure(surahNumber, rangedVerses, reciter);
            audioEngine.play(currentIdx);
        }
        // Update the ref so the useEffect guard below doesn't double-fire
        reciterIdRef.current = reciter.id;
    }, [surahNumber, rangedVerses]);

    // Fallback: reciter change from external source (not the sheet)
    React.useEffect(() => {
        if (reciterIdRef.current === selectedReciter.id) return;
        reciterIdRef.current = selectedReciter.id;
        if (engineInitialized.current) {
            audioEngine.configure(surahNumber, rangedVerses, selectedReciter);
            audioEngine.play(engineState.currentIndex);
        }
    }, [selectedReciter.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Verse-change sync → parent ────────────────────────────────────────────

    const lastNotifiedIndexRef = React.useRef(-1);
    React.useEffect(() => {
        if (!engineInitialized.current) return;
        if (engineState.currentIndex === lastNotifiedIndexRef.current) return;
        lastNotifiedIndexRef.current = engineState.currentIndex;

        const rangedVerse = rangedVerses[engineState.currentIndex];
        if (!rangedVerse) return;
        const fullIdx = verses.findIndex(v => v.numberInSurah === rangedVerse.numberInSurah);
        if (fullIdx !== -1) {
            onVerseChange(fullIdx);
        }
    }, [engineState.currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Natural completion detection ──────────────────────────────────────────

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
                onSurahEnd?.();
            }
        }
        wasPlayingRef.current = engineState.isPlaying;
    }, [engineState.isPlaying, engineState.isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Cleanup ───────────────────────────────────────────────────────────────

    React.useEffect(() => {
        return () => {
            audioEngine.stop();
            engineInitialized.current = false;
        };
    }, []);

    // ── Derived UI ────────────────────────────────────────────────────────────

    const verseProgress = rangedVerses.length > 0
        ? (engineState.currentIndex + 1) / rangedVerses.length
        : 0;
    const isRepeatActive = engineState.repeatMode !== 1;
    const SPEEDS = [1.0, 0.75, 1.25, 1.5];

    if (mode === 'closed') return null;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <>
            <Animated.View
                entering={FadeIn.duration(250)}
                exiting={FadeOut.duration(200)}
                style={styles.outerContainer}
            >
                <BlurView
                    intensity={Platform.OS === 'ios' ? 80 : 0}
                    tint="dark"
                    style={styles.blurContainer}
                >
                    <View style={styles.innerContainer}>
                        {/* ── Mode Toggle Row (slim) ── */}
                        <View style={styles.modeRow}>
                            <TouchableOpacity
                                style={[styles.modeChip, mode === 'listen' && { backgroundColor: accentColor + '20' }]}
                                onPress={() => { lightImpact(); onModeChange('listen'); }}
                            >
                                <Headphones size={13} color={mode === 'listen' ? accentColor : Colors.neutral[500]} />
                                <Text style={[styles.modeChipText, mode === 'listen' && { color: accentColor }]}>
                                    استماع
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.modeChip, mode === 'record' && { backgroundColor: accentColor + '20' }]}
                                onPress={() => { lightImpact(); onModeChange('record'); }}
                            >
                                <Mic size={13} color={mode === 'record' ? accentColor : Colors.neutral[500]} />
                                <Text style={[styles.modeChipText, mode === 'record' && { color: accentColor }]}>
                                    تسميع
                                </Text>
                            </TouchableOpacity>

                            {/* Verse counter */}
                            {mode === 'listen' && (
                                <Text style={styles.verseCounter}>
                                    آية {engineState.currentIndex + 1}/{rangedVerses.length}
                                </Text>
                            )}

                            <TouchableOpacity
                                style={styles.closeBtn}
                                onPress={() => { lightImpact(); onModeChange('closed'); }}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <X size={16} color={Colors.neutral[500]} />
                            </TouchableOpacity>
                        </View>

                        {/* ══════════════════════════════════════════════════════════ */}
                        {/* ██  LISTEN MODE — Single-line transport               ██ */}
                        {/* ══════════════════════════════════════════════════════════ */}
                        {mode === 'listen' && (
                            <View style={styles.playerRow}>
                                {/* LEFT: Reciter avatar — opens sheet */}
                                <TouchableOpacity
                                    style={[styles.reciterAvatar, { borderColor: accentColor + '40' }]}
                                    onPress={() => { lightImpact(); reciterSheetRef.current?.snapToIndex(0); }}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.reciterAvatarText, { color: accentColor }]}>
                                        {selectedReciter.nameArabic.charAt(0)}
                                    </Text>
                                    <View style={[styles.avatarBadge, { backgroundColor: accentColor }]}>
                                        <ChevronDown size={8} color="#fff" />
                                    </View>
                                </TouchableOpacity>

                                {/* CENTER: Transport controls */}
                                <View style={styles.transportGroup}>
                                    {/* Prev */}
                                    <TouchableOpacity
                                        onPress={() => { lightImpact(); audioEngine.skipPrev(); }}
                                        disabled={engineState.currentIndex === 0}
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                        style={styles.transportBtn}
                                    >
                                        <SkipBack
                                            size={18}
                                            color={engineState.currentIndex === 0
                                                ? Colors.neutral[700] : Colors.neutral[300]}
                                        />
                                    </TouchableOpacity>

                                    {/* Play/Pause with REAL progress ring */}
                                    <TouchableOpacity
                                        style={styles.playBtn}
                                        onPress={() => { mediumImpact(); audioEngine.togglePlayback(); }}
                                    >
                                        <ProgressRing progress={trackProgress} color={accentColor} />
                                        <View style={[styles.playBtnInner, { backgroundColor: accentColor }]}>
                                            {engineState.isLoading ? (
                                                <ActivityIndicator color="#fff" size="small" />
                                            ) : engineState.isPlaying ? (
                                                <Pause size={18} color="#fff" fill="#fff" />
                                            ) : (
                                                <Play size={18} color="#fff" fill="#fff" />
                                            )}
                                        </View>
                                    </TouchableOpacity>

                                    {/* Next */}
                                    <TouchableOpacity
                                        onPress={() => { lightImpact(); audioEngine.skipNext(); }}
                                        disabled={engineState.currentIndex >= rangedVerses.length - 1}
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                        style={styles.transportBtn}
                                    >
                                        <SkipForward
                                            size={18}
                                            color={engineState.currentIndex >= rangedVerses.length - 1
                                                ? Colors.neutral[700] : Colors.neutral[300]}
                                        />
                                    </TouchableOpacity>
                                </View>

                                {/* RIGHT: Compact chip cluster */}
                                <View style={styles.chipCluster}>
                                    {/* Speed */}
                                    <TouchableOpacity
                                        onPress={() => {
                                            lightImpact();
                                            const idx = SPEEDS.indexOf(engineState.playbackSpeed);
                                            audioEngine.setSpeed(SPEEDS[(idx + 1) % SPEEDS.length]);
                                        }}
                                        style={styles.miniChip}
                                    >
                                        <Gauge size={10} color={accentColor} />
                                        <Text style={[styles.miniChipText, { color: accentColor }]}>
                                            {engineState.playbackSpeed}×
                                        </Text>
                                    </TouchableOpacity>

                                    {/* Repeat */}
                                    <TouchableOpacity
                                        onPress={() => { mediumImpact(); audioEngine.cycleRepeat(); }}
                                        style={[
                                            styles.miniChip,
                                            isRepeatActive && { backgroundColor: accentColor + '18' },
                                        ]}
                                    >
                                        <Repeat
                                            size={10}
                                            color={isRepeatActive ? accentColor : Colors.neutral[500]}
                                        />
                                        <Text style={[
                                            styles.miniChipText,
                                            { color: isRepeatActive ? accentColor : Colors.neutral[500] },
                                        ]}>
                                            {repeatLabel(engineState.repeatMode)}
                                        </Text>
                                    </TouchableOpacity>

                                    {/* Delay */}
                                    <TouchableOpacity
                                        onPress={() => { lightImpact(); audioEngine.cycleAyahDelay(); }}
                                        style={[
                                            styles.miniChip,
                                            engineState.ayahDelay > 0 && { backgroundColor: accentColor + '18' },
                                        ]}
                                    >
                                        <Timer
                                            size={10}
                                            color={engineState.ayahDelay > 0 ? accentColor : Colors.neutral[500]}
                                        />
                                        <Text style={[
                                            styles.miniChipText,
                                            { color: engineState.ayahDelay > 0 ? accentColor : Colors.neutral[500] },
                                        ]}>
                                            {engineState.ayahDelay > 0 ? `${engineState.ayahDelay}ث` : 'تأخير'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {/* ══════════════════════════════════════════════════════════ */}
                        {/* ██  Thin progress bar (verse-level)                    ██ */}
                        {/* ══════════════════════════════════════════════════════════ */}
                        {mode === 'listen' && (
                            <View style={styles.progressTrack}>
                                <View style={[
                                    styles.progressFill,
                                    { width: `${verseProgress * 100}%`, backgroundColor: accentColor },
                                ]} />
                            </View>
                        )}

                        {/* Learning mode hint */}
                        {mode === 'listen' && learningMode && (
                            <Text style={styles.learningHint}>
                                🎓 وضع التعلّم: استمع ثم سجّل تلاوتك
                            </Text>
                        )}

                        {/* ══════════════════════════════════════════════════════════ */}
                        {/* ██  RECORD MODE                                         ██ */}
                        {/* ══════════════════════════════════════════════════════════ */}
                        {mode === 'record' && (
                            <View style={styles.recordContainer}>
                                <RecordingControls
                                    recording={recording}
                                    onStartRecording={onStartRecording}
                                    onStopRecording={onStopRecording}
                                    analyzing={analyzing}
                                    uploadStep={uploadStep}
                                    recordingDuration={recordingDuration}
                                    accentColor={accentColor}
                                    meterHistoryShared={meterHistoryShared}
                                    chunksSent={chunksSent}
                                    chunksCompleted={chunksCompleted}
                                    isFinishing={isFinishing}
                                />
                            </View>
                        )}
                    </View>
                </BlurView>
            </Animated.View>

            {/* Reciter Selection Bottom Sheet */}
            <ReciterBottomSheet
                sheetRef={reciterSheetRef}
                onSelect={handleReciterSelect}
                currentReciterId={selectedReciter.id}
                qiraat={isHafs ? 'Hafs' : 'Warsh'}
            />
        </>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const INNER_BG = 'rgba(14, 17, 24, 0.85)';

const styles = StyleSheet.create({
    outerContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
    },
    blurContainer: {
        overflow: 'hidden',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
    },
    innerContainer: {
        backgroundColor: INNER_BG,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(255,255,255,0.10)',
        paddingBottom: Platform.OS === 'ios' ? 20 : 8,
    },

    // ── Mode Row (top slim bar) ──
    modeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 4,
        gap: 6,
    },
    modeChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 8,
    },
    modeChipText: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.neutral[500],
    },
    verseCounter: {
        fontSize: 11,
        fontWeight: '600',
        color: Colors.neutral[500],
        marginLeft: 'auto',
        marginRight: 4,
    },
    closeBtn: {
        padding: 4,
    },

    // ── Player Row (single line: avatar + transport + chips) ──
    playerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        gap: 10,
    },

    // ── Reciter Avatar ──
    reciterAvatar: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    reciterAvatarText: {
        fontSize: 16,
        fontWeight: '800',
    },
    avatarBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 14,
        height: 14,
        borderRadius: 7,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: INNER_BG,
    },

    // ── Transport Group ──
    transportGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    transportBtn: {
        padding: 4,
    },

    // ── Play button with ring ──
    playBtn: {
        width: RING_SIZE,
        height: RING_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    playBtnInner: {
        position: 'absolute',
        width: RING_SIZE - RING_STROKE * 2 - 6,
        height: RING_SIZE - RING_STROKE * 2 - 6,
        borderRadius: (RING_SIZE - RING_STROKE * 2 - 6) / 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    progressRing: {
        position: 'absolute',
    },

    // ── Compact Chip Cluster ──
    chipCluster: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginLeft: 'auto',
    },
    miniChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 6,
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    miniChipText: {
        fontSize: 10,
        fontWeight: '700',
    },

    // ── Progress (verse-level thin bar) ──
    progressTrack: {
        height: 2,
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginHorizontal: 12,
        borderRadius: 1,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 1,
    },

    // ── Learning mode ──
    learningHint: {
        fontSize: 11,
        color: Colors.gold[400],
        textAlign: 'center',
        paddingTop: 4,
        paddingBottom: 2,
    },

    // ── Record ──
    recordContainer: {
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
});

const UnifiedAudioControl = React.memo(UnifiedAudioControlInner);
export default UnifiedAudioControl;
