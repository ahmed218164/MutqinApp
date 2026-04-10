/**
 * components/recite/UnifiedAudioControl.tsx
 *
 * Phase 2 — RNTP Docked Bottom Player + Immersive Mode
 *
 * Architecture:
 *  - Full-width "Docked Bottom Player" (not a pill) matching native Android ref
 *  - Reciter's initial avatar circle, Play/Pause with circular progress ring,
 *    Stop, Next, Prev transport buttons
 *  - Reciter selection via @gorhom/bottom-sheet with Gapless/Ayah tabs
 *  - RecordingControls nested inside the same docked bar when in record mode
 *  - Immersive mode: parent Animated.View slides this entire bar offscreen
 *
 * The engine logic is managed via audioEngine singleton (RNTP-backed).
 */

import * as React from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import BottomSheet from '@gorhom/bottom-sheet';
import {
    Headphones, Mic, X, Music2,
    Play, Pause, SkipBack, SkipForward, Square,
    Repeat, Gauge, Timer,
} from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
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
    meterHistory?: number[];
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
// A thin SVG ring around the play button showing verse progress through the range.

const RING_SIZE = 56;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ProgressRing({ progress, color }: { progress: number; color: string }) {
    const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);
    return (
        <Svg width={RING_SIZE} height={RING_SIZE} style={styles.progressRing}>
            {/* Background track */}
            <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke="rgba(255,255,255,0.12)"
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

    // Reciter selection state
    const [selectedReciter, setSelectedReciter] = React.useState<Reciter>(getDefaultReciter());
    const reciterSheetRef = React.useRef<BottomSheet>(null);

    // Live engine state
    const engineState = useAudioEngine();

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

    // Reciter change mid-session
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

    const progress = rangedVerses.length > 0
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
                style={styles.container}
            >
                {/* ── Mode Tabs ── */}
                <View style={styles.modeTabsRow}>
                    <TouchableOpacity
                        style={[styles.modeTab, mode === 'listen' && styles.modeTabActive]}
                        onPress={() => { lightImpact(); onModeChange('listen'); }}
                    >
                        <Headphones size={16} color={mode === 'listen' ? accentColor : Colors.neutral[500]} />
                        <Text style={[styles.modeTabText, mode === 'listen' && { color: accentColor }]}>
                            استماع
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.modeTab, mode === 'record' && styles.modeTabActive]}
                        onPress={() => { lightImpact(); onModeChange('record'); }}
                    >
                        <Mic size={16} color={mode === 'record' ? accentColor : Colors.neutral[500]} />
                        <Text style={[styles.modeTabText, mode === 'record' && { color: accentColor }]}>
                            تسميع
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.closeBtn}
                        onPress={() => { lightImpact(); onModeChange('closed'); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <X size={18} color={Colors.neutral[500]} />
                    </TouchableOpacity>
                </View>

                {/* ══════════════════════════════════════════════════════════ */}
                {/* ██  LISTEN MODE — Docked Bottom Player                  ██ */}
                {/* ══════════════════════════════════════════════════════════ */}
                {mode === 'listen' && (
                    <View style={styles.playerContainer}>
                        {/* ── Top row: reciter info + transport ── */}
                        <View style={styles.transportRow}>
                            {/* Reciter avatar */}
                            <TouchableOpacity
                                style={styles.reciterAvatar}
                                onPress={() => { lightImpact(); reciterSheetRef.current?.snapToIndex(0); }}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.reciterAvatarText}>
                                    {selectedReciter.nameArabic.charAt(0)}
                                </Text>
                            </TouchableOpacity>

                            {/* Reciter name + verse info */}
                            <TouchableOpacity
                                style={styles.infoBlock}
                                onPress={() => { lightImpact(); reciterSheetRef.current?.snapToIndex(0); }}
                                activeOpacity={0.8}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={styles.reciterNameText} numberOfLines={1}>
                                        {selectedReciter.nameArabic}
                                    </Text>
                                    {engineState.isGaplessMode && (
                                        <View style={styles.gaplessBadge}>
                                            <Text style={styles.gaplessBadgeText}>متصل</Text>
                                        </View>
                                    )}
                                </View>
                                <Text style={styles.verseInfoText}>
                                    آية {engineState.currentIndex + 1} من {rangedVerses.length}
                                </Text>
                            </TouchableOpacity>

                            {/* Transport: Prev · Play/Pause · Next · Stop */}
                            <View style={styles.transportButtons}>
                                {/* Prev */}
                                <TouchableOpacity
                                    onPress={() => { lightImpact(); audioEngine.skipPrev(); }}
                                    disabled={engineState.currentIndex === 0}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <SkipBack
                                        size={20}
                                        color={engineState.currentIndex === 0
                                            ? Colors.neutral[700] : Colors.neutral[300]}
                                    />
                                </TouchableOpacity>

                                {/* Play/Pause with progress ring */}
                                <TouchableOpacity
                                    style={styles.playBtn}
                                    onPress={() => { mediumImpact(); audioEngine.togglePlayback(); }}
                                >
                                    <ProgressRing progress={progress} color={accentColor} />
                                    <View style={[styles.playBtnInner, { backgroundColor: accentColor }]}>
                                        {engineState.isLoading ? (
                                            <ActivityIndicator color="#fff" size="small" />
                                        ) : engineState.isPlaying ? (
                                            <Pause size={20} color="#fff" fill="#fff" />
                                        ) : (
                                            <Play size={20} color="#fff" fill="#fff" />
                                        )}
                                    </View>
                                </TouchableOpacity>

                                {/* Next */}
                                <TouchableOpacity
                                    onPress={() => { lightImpact(); audioEngine.skipNext(); }}
                                    disabled={engineState.currentIndex >= rangedVerses.length - 1}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <SkipForward
                                        size={20}
                                        color={engineState.currentIndex >= rangedVerses.length - 1
                                            ? Colors.neutral[700] : Colors.neutral[300]}
                                    />
                                </TouchableOpacity>

                                {/* Stop */}
                                <TouchableOpacity
                                    onPress={() => {
                                        mediumImpact();
                                        audioEngine.stop();
                                        onModeChange('closed');
                                    }}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <Square size={18} color={Colors.neutral[400]} fill={Colors.neutral[400]} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* ── Bottom row: speed · repeat · delay chips ── */}
                        <View style={styles.chipsRow}>
                            {/* Speed */}
                            <TouchableOpacity
                                onPress={() => {
                                    lightImpact();
                                    const idx = SPEEDS.indexOf(engineState.playbackSpeed);
                                    audioEngine.setSpeed(SPEEDS[(idx + 1) % SPEEDS.length]);
                                }}
                                style={styles.chip}
                            >
                                <Gauge size={11} color={accentColor} />
                                <Text style={[styles.chipText, { color: accentColor }]}>
                                    {engineState.playbackSpeed}×
                                </Text>
                            </TouchableOpacity>

                            {/* Repeat */}
                            <TouchableOpacity
                                onPress={() => { mediumImpact(); audioEngine.cycleRepeat(); }}
                                style={[
                                    styles.chip,
                                    isRepeatActive && { backgroundColor: accentColor + '18' },
                                ]}
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

                            {/* Ayah Delay */}
                            <TouchableOpacity
                                onPress={() => { lightImpact(); audioEngine.cycleAyahDelay(); }}
                                style={[
                                    styles.chip,
                                    engineState.ayahDelay > 0 && { backgroundColor: accentColor + '18' },
                                ]}
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

                            {/* Progress bar (fills remaining space) */}
                            <View style={styles.progressTrack}>
                                <View style={[
                                    styles.progressFill,
                                    { width: `${progress * 100}%`, backgroundColor: accentColor },
                                ]} />
                            </View>
                        </View>

                        {learningMode && (
                            <Text style={styles.learningHint}>
                                🎓 وضع التعلّم: استمع ثم سجّل تلاوتك
                            </Text>
                        )}
                    </View>
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
                            meterHistory={meterHistory}
                            chunksSent={chunksSent}
                            chunksCompleted={chunksCompleted}
                            isFinishing={isFinishing}
                        />
                    </View>
                )}
            </Animated.View>

            {/* Reciter Selection Bottom Sheet */}
            <ReciterBottomSheet
                sheetRef={reciterSheetRef}
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
        backgroundColor: 'rgba(8, 12, 20, 0.92)',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.08)',
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        overflow: 'hidden',
        ...Shadows.xl,
    },

    // ── Mode Tabs ──
    modeTabsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 6,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    modeTab: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 7,
        paddingHorizontal: 14,
        borderRadius: 10,
    },
    modeTabActive: {
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    modeTabText: {
        fontSize: 13,
        fontWeight: '600',
        color: Colors.neutral[500],
    },
    closeBtn: {
        marginLeft: 'auto',
        padding: 6,
    },

    // ── Player (Listen) ──
    playerContainer: {
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 16,
        gap: 10,
    },

    // ── Transport Row ──
    transportRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    reciterAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    reciterAvatarText: {
        fontSize: 18,
        fontWeight: '700',
        color: Colors.gold[400],
    },
    infoBlock: {
        flex: 1,
        gap: 2,
    },
    reciterNameText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#fff',
    },
    verseInfoText: {
        fontSize: 11,
        color: Colors.neutral[400],
        fontWeight: '500',
    },
    gaplessBadge: {
        backgroundColor: Colors.gold[400] + '18',
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 5,
    },
    gaplessBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: Colors.gold[400],
    },

    // ── Transport buttons ──
    transportButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
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

    // ── Chips Row ──
    chipsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    chipText: {
        fontSize: 11,
        fontWeight: '700',
    },

    // ── Progress ──
    progressTrack: {
        flex: 1,
        height: 3,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 2,
    },

    // ── Learning mode ──
    learningHint: {
        fontSize: 12,
        color: Colors.gold[400],
        textAlign: 'center',
    },

    // ── Record ──
    recordContainer: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        paddingBottom: 16,
    },
});
