/**
 * components/recite/SurahAudioPlayer.tsx
 *
 * Phase B UI — Thin shell over AudioEngine
 *
 * All audio logic lives in lib/audio-engine.ts.
 * This component only renders the UI and delegates user actions to the engine.
 *
 * Phases included:
 *   A — Near-gapless (engine uses player.replace() for instant swap)
 *   B — Background / lock screen (engine uses expo-audio + setAudioModeAsync)
 *   C — Disk cache (engine resolves via audio-cache.ts)
 *   D — Ayah repeat (engine manages repeatMode + repeatCount)
 */

import * as React from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, ActivityIndicator
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Play, Pause, SkipBack, SkipForward, X, Repeat, Gauge } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { lightImpact, mediumImpact } from '../../lib/haptics';
import { Reciter, getDefaultReciter } from '../../lib/audio-reciters';
import {
    audioEngine,
    useAudioEngine,
    repeatLabel,
    REPEAT_CYCLE,
} from '../../lib/audio-engine';

// ── Props ─────────────────────────────────────────────────────────────────────

interface SurahAudioPlayerProps {
    surahNumber: number;
    verses: any[];
    activeQiraat: string;
    onClose: () => void;
    onVerseChange: (index: number) => void;
    selectedReciter?: Reciter;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SurahAudioPlayer({
    surahNumber,
    verses,
    activeQiraat,
    onClose,
    onVerseChange,
    selectedReciter,
}: SurahAudioPlayerProps) {
    const reciter = selectedReciter ?? getDefaultReciter();
    const state = useAudioEngine();

    const isHafs = activeQiraat === 'Hafs';
    const accentColor = isHafs ? Colors.emerald[500] : Colors.gold[500];
    const isRepeatActive = state.repeatMode !== 1;
    const progress = verses.length > 0
        ? (state.currentIndex + 1) / verses.length
        : 0;

    // ── Engine bootstrapping ──────────────────────────────────────────────────

    React.useEffect(() => {
        audioEngine.setVerses(surahNumber, verses, reciter);
        audioEngine.play(0);
        return () => { audioEngine.destroy(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Reciter change mid-session
    const reciterIdRef = React.useRef(reciter.id);
    React.useEffect(() => {
        if (reciterIdRef.current === reciter.id) return;
        reciterIdRef.current = reciter.id;
        audioEngine.setVerses(surahNumber, verses, reciter);
        audioEngine.play(state.currentIndex);
    }, [reciter.id]);

    // Notify parent of verse changes
    const lastIndexRef = React.useRef(-1);
    React.useEffect(() => {
        if (state.currentIndex !== lastIndexRef.current) {
            lastIndexRef.current = state.currentIndex;
            onVerseChange(state.currentIndex);
        }
    }, [state.currentIndex]);

    // ── Controls ──────────────────────────────────────────────────────────────

    const togglePlayback = () => { lightImpact(); audioEngine.togglePlayback(); };
    const skipNext = () => { lightImpact(); audioEngine.skipNext(); };
    const skipPrev = () => { lightImpact(); audioEngine.skipPrev(); };
    const cycleRepeat = () => { mediumImpact(); audioEngine.cycleRepeat(); };

    const speeds = [1.0, 0.75, 1.25, 1.5];
    const toggleSpeed = () => {
        lightImpact();
        const next = speeds[(speeds.indexOf(state.playbackSpeed) + 1) % speeds.length];
        audioEngine.setSpeed(next);
    };

    // ── Render ────────────────────────────────────────────────────────────────

    const currentVerse = verses[state.currentIndex];

    return (
        <View style={styles.container}>
            <BlurView
                intensity={40}
                tint="dark"
                style={[styles.blur, { borderColor: accentColor + '55' }]}
            >
                {/* Accent top border */}
                <LinearGradient
                    colors={[accentColor, accentColor + '00']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.topBorder}
                />

                <View style={styles.content}>
                    {/* Left: verse info */}
                    <View style={styles.info}>
                        <Text style={styles.verseText}>
                            آية {currentVerse?.numberInSurah ?? 1}
                            {' / '}
                            {verses.length}
                        </Text>
                        <Text style={[styles.reciterText, { color: accentColor }]} numberOfLines={1}>
                            {reciter.nameArabic}
                        </Text>
                    </View>

                    {/* Centre: transport */}
                    <View style={styles.controls}>
                        <TouchableOpacity
                            onPress={skipPrev}
                            disabled={state.currentIndex === 0}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <SkipBack
                                size={22}
                                color={state.currentIndex === 0
                                    ? 'rgba(255,255,255,0.2)'
                                    : 'rgba(255,255,255,0.8)'}
                            />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.playButton, { backgroundColor: accentColor }]}
                            onPress={togglePlayback}
                            activeOpacity={0.8}
                        >
                            {state.isLoading ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : state.isPlaying ? (
                                <Pause size={22} color="#fff" fill="#fff" />
                            ) : (
                                <Play size={22} color="#fff" fill="#fff" />
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={skipNext}
                            disabled={state.currentIndex >= verses.length - 1}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <SkipForward
                                size={22}
                                color={state.currentIndex >= verses.length - 1
                                    ? 'rgba(255,255,255,0.2)'
                                    : 'rgba(255,255,255,0.8)'}
                            />
                        </TouchableOpacity>
                    </View>

                    {/* Right: speed, repeat, close */}
                    <View style={styles.actions}>
                        {/* Speed */}
                        <TouchableOpacity
                            onPress={toggleSpeed}
                            style={styles.chip}
                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                        >
                            <Gauge size={12} color={accentColor} />
                            <Text style={[styles.chipText, { color: accentColor }]}>
                                {state.playbackSpeed}×
                            </Text>
                        </TouchableOpacity>

                        {/* Repeat */}
                        <TouchableOpacity
                            onPress={cycleRepeat}
                            style={[
                                styles.chip,
                                isRepeatActive && { backgroundColor: accentColor + '22' },
                            ]}
                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                        >
                            <Repeat
                                size={12}
                                color={isRepeatActive ? accentColor : 'rgba(255,255,255,0.5)'}
                            />
                            <Text style={[
                                styles.chipText,
                                { color: isRepeatActive ? accentColor : 'rgba(255,255,255,0.5)' },
                            ]}>
                                {repeatLabel(state.repeatMode)}
                            </Text>
                        </TouchableOpacity>

                        {/* Close */}
                        <TouchableOpacity
                            onPress={onClose}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <X size={18} color="rgba(255,255,255,0.4)" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Progress bar */}
                <View style={styles.progressBg}>
                    <View style={[styles.progressFill, {
                        width: `${progress * 100}%`,
                        backgroundColor: accentColor,
                    }]} />
                </View>
            </BlurView>
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 110,
        left: Spacing.md,
        right: Spacing.md,
        borderRadius: BorderRadius.xl,
        overflow: 'hidden',
        ...Shadows.xl,
        shadowColor: '#000',
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 12,
    },
    blur: {
        borderWidth: 1,
        borderRadius: BorderRadius.xl,
        overflow: 'hidden',
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    topBorder: { height: 1.5 },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        gap: Spacing.sm,
    },
    info: { flex: 1.2, minWidth: 0 },
    verseText: {
        fontSize: Typography.fontSize.sm,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.9)',
    },
    reciterText: { fontSize: Typography.fontSize.xs, marginTop: 1 },
    controls: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.lg,
    },
    playButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 4,
    },
    actions: {
        flex: 1.2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: Spacing.xs,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: BorderRadius.sm,
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    chipText: { fontSize: 11, fontWeight: '700' },
    progressBg: {
        height: 2.5,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    progressFill: { height: '100%' },
});
