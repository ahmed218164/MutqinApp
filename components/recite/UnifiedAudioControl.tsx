/**
 * components/recite/UnifiedAudioControl.tsx
 *
 * SLICE 1 — Floating Sanctuary Dock
 *
 * Architecture:
 *  - Floating pill dock (16px inset, borderRadius: 28)
 *  - Solid opaque background — no transparency/overlap issues
 *  - 3 visual states: collapsed (immersive), standard, record
 *  - Real-time progress ring via RNTP useProgress() hook
 *  - Reciter selection wired to audio engine
 *  - Safe-area-aware bottom padding
 */

import * as React from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
    Platform,
} from 'react-native';
import Animated, {
    FadeIn, FadeOut,
    useSharedValue, useAnimatedStyle, withTiming, withSpring,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
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

// ── Design Tokens (Sanctuary Theme) ───────────────────────────────────────────

const SANCTUARY = {
    dock: {
        bg: '#161B24',          // surface.elevated — solid, opaque
        bgLight: '#FFFFFF',
        border: 'rgba(255,255,255,0.06)',
        borderLight: 'rgba(0,0,0,0.06)',
    },
    text: {
        primary: '#E8E6E1',     // warm white
        secondary: '#6B7A8D',
        primaryLight: '#1A1A2E',
        secondaryLight: '#64748B',
    },
    pill: {
        radius: 28,
        marginH: 16,
        marginBottom: 8,
    },
} as const;

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
    selectedReciter?: Reciter;
    onReciterAvatarPress?: () => void;
    /** Bottom safe area inset — passed from parent */
    bottomInset?: number;
}

// ── Circular Progress Ring ────────────────────────────────────────────────────

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
                stroke="rgba(255,255,255,0.08)"
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
    selectedReciter: externalSelectedReciter,
    onReciterAvatarPress,
    bottomInset = 0,
}: UnifiedAudioControlProps) {

    const isHafs = activeQiraat === 'Hafs';
    const accentColor = isHafs ? Colors.emerald[500] : Colors.gold[500];
    const accentLight = isHafs ? Colors.emerald[400] : Colors.gold[400];

    // Reciter selection state — supports controlled (via props) or uncontrolled (internal).
    const [internalReciter, setInternalReciter] = React.useState<Reciter>(getDefaultReciter());
    const selectedReciter = externalSelectedReciter ?? internalReciter;
    const setSelectedReciter = React.useCallback((r: Reciter) => {
        if (!externalSelectedReciter) setInternalReciter(r);
    }, [externalSelectedReciter]);
    const internalReciterSheetRef = React.useRef<BottomSheetModal>(null);

    // Live engine state
    const engineState = useAudioEngine();

    // Real-time RNTP progress for the ring
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

    // Reciter change — proper re-configure + play
    const handleReciterSelect = React.useCallback((reciter: Reciter) => {
        setSelectedReciter(reciter);
        lightImpact();

        if (engineInitialized.current) {
            const currentIdx = audioEngine.getSnapshot().currentIndex;
            audioEngine.configure(surahNumber, rangedVerses, reciter);
            audioEngine.play(currentIdx);
        }
        reciterIdRef.current = reciter.id;
    }, [surahNumber, rangedVerses]);

    // Fallback: reciter change from external source
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

    // ── Render: Floating Sanctuary Dock ───────────────────────────────────────

    return (
        <>
            <Animated.View
                entering={FadeIn.duration(300)}
                exiting={FadeOut.duration(200)}
                pointerEvents="box-none"
                style={[
                    styles.dockOuter,
                    { marginBottom: Math.max(bottomInset, SANCTUARY.pill.marginBottom) },
                ]}
            >
                <View style={styles.dockPill}>
                    {/* ── Mode Toggle Row ── */}
                    <View style={styles.modeRow}>
                        <TouchableOpacity
                            style={[
                                styles.modeChip,
                                mode === 'listen' && { backgroundColor: accentColor + '18' },
                            ]}
                            onPress={() => { lightImpact(); onModeChange('listen'); }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Headphones size={14} color={mode === 'listen' ? accentLight : SANCTUARY.text.secondary} />
                            <Text style={[
                                styles.modeChipText,
                                mode === 'listen' && { color: accentLight },
                            ]}>
                                استماع
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.modeChip,
                                mode === 'record' && { backgroundColor: accentColor + '18' },
                            ]}
                            onPress={() => { lightImpact(); onModeChange('record'); }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Mic size={14} color={mode === 'record' ? accentLight : SANCTUARY.text.secondary} />
                            <Text style={[
                                styles.modeChipText,
                                mode === 'record' && { color: accentLight },
                            ]}>
                                تسميع
                            </Text>
                        </TouchableOpacity>

                        {/* Verse counter badge */}
                        {mode === 'listen' && (
                            <View style={styles.verseBadge}>
                                <Text style={styles.verseBadgeText}>
                                    آية {engineState.currentIndex + 1}/{rangedVerses.length}
                                </Text>
                            </View>
                        )}

                        <TouchableOpacity
                            style={styles.closeBtn}
                            onPress={() => { lightImpact(); onModeChange('closed'); }}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        >
                            <X size={16} color={SANCTUARY.text.secondary} />
                        </TouchableOpacity>
                    </View>

                    {/* ══════════════════════════════════════════════════════════ */}
                    {/* ██  LISTEN MODE — Transport Row                        ██ */}
                    {/* ══════════════════════════════════════════════════════════ */}
                    {mode === 'listen' && (
                        <View style={styles.playerRow}>
                            {/* LEFT: Reciter avatar */}
                            <TouchableOpacity
                                style={[styles.reciterAvatar, { borderColor: accentColor + '30' }]}
                                onPress={() => {
                                    lightImpact();
                                    if (onReciterAvatarPress) {
                                        onReciterAvatarPress();
                                    } else {
                                        internalReciterSheetRef.current?.present();
                                    }
                                }}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.reciterAvatarText, { color: accentLight }]}>
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
                                            ? SANCTUARY.text.secondary + '40' : SANCTUARY.text.primary}
                                    />
                                </TouchableOpacity>

                                {/* Play/Pause with progress ring */}
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
                                            ? SANCTUARY.text.secondary + '40' : SANCTUARY.text.primary}
                                    />
                                </TouchableOpacity>
                            </View>

                            {/* RIGHT: Control chips */}
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
                                    <Gauge size={10} color={accentLight} />
                                    <Text style={[styles.miniChipText, { color: accentLight }]}>
                                        {engineState.playbackSpeed}×
                                    </Text>
                                </TouchableOpacity>

                                {/* Repeat */}
                                <TouchableOpacity
                                    onPress={() => { mediumImpact(); audioEngine.cycleRepeat(); }}
                                    style={[
                                        styles.miniChip,
                                        isRepeatActive && { backgroundColor: accentColor + '15' },
                                    ]}
                                >
                                    <Repeat
                                        size={10}
                                        color={isRepeatActive ? accentLight : SANCTUARY.text.secondary}
                                    />
                                    <Text style={[
                                        styles.miniChipText,
                                        { color: isRepeatActive ? accentLight : SANCTUARY.text.secondary },
                                    ]}>
                                        {repeatLabel(engineState.repeatMode)}
                                    </Text>
                                </TouchableOpacity>

                                {/* Delay */}
                                <TouchableOpacity
                                    onPress={() => { lightImpact(); audioEngine.cycleAyahDelay(); }}
                                    style={[
                                        styles.miniChip,
                                        engineState.ayahDelay > 0 && { backgroundColor: accentColor + '15' },
                                    ]}
                                >
                                    <Timer
                                        size={10}
                                        color={engineState.ayahDelay > 0 ? accentLight : SANCTUARY.text.secondary}
                                    />
                                    <Text style={[
                                        styles.miniChipText,
                                        { color: engineState.ayahDelay > 0 ? accentLight : SANCTUARY.text.secondary },
                                    ]}>
                                        {engineState.ayahDelay > 0 ? `${engineState.ayahDelay}ث` : 'تأخير'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {/* ═══ Verse-level progress bar ═══ */}
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
                        <Text style={[styles.learningHint, { color: Colors.gold[400] }]}>
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
            </Animated.View>

            {/* Internal Reciter Bottom Sheet (fallback) */}
            {!onReciterAvatarPress && (
                <ReciterBottomSheet
                    sheetRef={internalReciterSheetRef}
                    onSelect={handleReciterSelect}
                    currentReciterId={selectedReciter.id}
                    qiraat={isHafs ? 'Hafs' : 'Warsh'}
                />
            )}
        </>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    // ── Floating Dock Container ──
    dockOuter: {
        position: 'absolute',
        bottom: 0,
        left: SANCTUARY.pill.marginH,
        right: SANCTUARY.pill.marginH,
        zIndex: 50,
    },
    dockPill: {
        backgroundColor: SANCTUARY.dock.bg,
        borderRadius: SANCTUARY.pill.radius,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: SANCTUARY.dock.border,
        // Elevation shadow for floating effect
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 24,
        elevation: 16,
        overflow: 'hidden',
    },

    // ── Mode Row (top) ──
    modeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 6,
        gap: 6,
    },
    modeChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 12,
        minHeight: 32,
    },
    modeChipText: {
        fontSize: 13,
        fontWeight: '600',
        color: SANCTUARY.text.secondary,
    },
    verseBadge: {
        marginLeft: 'auto',
        marginRight: 4,
        backgroundColor: 'rgba(255,255,255,0.06)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
    },
    verseBadgeText: {
        fontSize: 11,
        fontWeight: '600',
        color: SANCTUARY.text.secondary,
    },
    closeBtn: {
        padding: 6,
        minWidth: 28,
        minHeight: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // ── Player Row ──
    playerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 10,
    },

    // ── Reciter Avatar ──
    reciterAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    reciterAvatarText: {
        fontSize: 17,
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
        borderColor: SANCTUARY.dock.bg,
    },

    // ── Transport Group ──
    transportGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    transportBtn: {
        padding: 6,
        minWidth: 30,
        minHeight: 30,
        alignItems: 'center',
        justifyContent: 'center',
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

    // ── Chip Cluster ──
    chipCluster: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginLeft: 'auto',
    },
    miniChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 7,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    miniChipText: {
        fontSize: 10,
        fontWeight: '700',
    },

    // ── Progress bar ──
    progressTrack: {
        height: 2,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginHorizontal: 16,
        borderRadius: 1,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 1,
    },

    // ── Learning ──
    learningHint: {
        fontSize: 11,
        textAlign: 'center',
        paddingTop: 4,
        paddingBottom: 6,
    },

    // ── Record ──
    recordContainer: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        paddingBottom: 12,
    },
});

const UnifiedAudioControl = React.memo(UnifiedAudioControlInner);
export default UnifiedAudioControl;
