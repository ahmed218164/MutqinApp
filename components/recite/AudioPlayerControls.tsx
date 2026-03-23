import * as React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import { lightImpact } from '../../lib/haptics';
import { Reciter, getDefaultReciter } from '../../lib/audio-reciters';
import { getAyahAudioUrl, prefetchAyahAudio } from '../../lib/quran-audio-api';

interface Ayah {
    number: number;
    text: string;
    numberInSurah: number;
    page: number;
}

interface AudioPlayerControlsProps {
    surahNumber: number;
    verses: Ayah[];
    activeQiraat: string;
    onVerseChange: (index: number) => void;
    accentColor: string;
    learningMode?: boolean;
    onLearningStepComplete?: () => void;
    /** The currently selected reciter; falls back to Mishary Alafasy if omitted. */
    selectedReciter?: Reciter;
    onSurahEnd?: () => void;
}

export default function AudioPlayerControls({
    surahNumber,
    verses,
    activeQiraat,
    onVerseChange,
    accentColor,
    learningMode = false,
    onLearningStepComplete,
    selectedReciter,
    onSurahEnd,
}: AudioPlayerControlsProps) {
    const [isPlaying, setIsPlaying] = React.useState(false);
    const [currentVerseIndex, setCurrentVerseIndex] = React.useState(0);
    const [isLoading, setIsLoading] = React.useState(false);
    const [playbackSpeed, setPlaybackSpeed] = React.useState(1.0);

    const soundRef = React.useRef<Audio.Sound | null>(null);
    const nextSoundRef = React.useRef<Audio.Sound | null>(null);

    // Resolve the effective reciter
    const reciter = selectedReciter ?? getDefaultReciter();

    // Display name shown below the verse counter
    const qariName = reciter.nameArabic
        ? `${reciter.name} · ${reciter.nameArabic}`
        : reciter.name;

    // ── Helpers ──────────────────────────────────────────────────────────────

    async function resolveUri(index: number): Promise<string | null> {
        const verse = verses[index];
        if (!verse) return null;
        return getAyahAudioUrl(surahNumber, verse.numberInSurah, reciter);
    }

    /** Silently load the next verse into memory so playback is instant. */
    const preBufferNext = React.useCallback(
        async (nextIndex: number) => {
            if (nextIndex >= verses.length) return;
            if (nextSoundRef.current) return; // already buffered

            try {
                // Fire-and-forget prefetch of the JSON response
                prefetchAyahAudio(surahNumber, verses[nextIndex].numberInSurah);

                const uri = await resolveUri(nextIndex);
                if (!uri) return;

                const { sound: preloaded } = await Audio.Sound.createAsync(
                    { uri },
                    { shouldPlay: false, rate: playbackSpeed }
                );
                nextSoundRef.current = preloaded;
            } catch {
                // Silently ignore pre-buffer errors — will fall back to normal load
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [verses, surahNumber, playbackSpeed, reciter]
    );

    // ── Core Playback ─────────────────────────────────────────────────────────

    const loadAndPlayVerse = async (index: number) => {
        if (index >= verses.length) {
            setIsPlaying(false);
            return;
        }

        try {
            setIsLoading(true);

            let newSound: Audio.Sound;

            if (nextSoundRef.current) {
                // Use pre-buffered sound — instant playback
                newSound = nextSoundRef.current;
                nextSoundRef.current = null;
                await newSound.setRateAsync(playbackSpeed, true);
                await newSound.playAsync();
            } else {
                // Unload previous sound
                if (soundRef.current) {
                    try { await soundRef.current.stopAsync(); } catch { }
                    try { await soundRef.current.unloadAsync(); } catch { }
                    soundRef.current = null;
                }

                const uri = await resolveUri(index);
                if (!uri) throw new Error('Could not resolve audio URL');

                const { sound: loaded } = await Audio.Sound.createAsync(
                    { uri },
                    { shouldPlay: true, rate: playbackSpeed }
                );
                newSound = loaded;
            }

            // Unload the old sound (if we swapped from pre-buffer)
            if (soundRef.current && soundRef.current !== newSound) {
                try { await soundRef.current.unloadAsync(); } catch { }
            }

            soundRef.current = newSound;
            setCurrentVerseIndex(index);
            onVerseChange(index);
            setIsPlaying(true);

            // Start pre-buffering the NEXT verse immediately
            preBufferNext(index + 1);

            newSound.setOnPlaybackStatusUpdate((status) => {
                if (status.isLoaded && status.didJustFinish) {
                    if (learningMode) {
                        setIsPlaying(false);
                        onLearningStepComplete?.();
                    } else {
                        const nextIndex = index + 1;
                        if (nextIndex < verses.length) {
                            loadAndPlayVerse(nextIndex);
                        } else {
                            setIsPlaying(false);
                            onSurahEnd?.();
                        }
                    }
                }
            });
        } catch (error) {
            console.error('[AudioPlayerControls] Error playing audio:', error);
            setIsPlaying(false);
        } finally {
            setIsLoading(false);
        }
    };

    // ── Controls ──────────────────────────────────────────────────────────────

    const togglePlayback = async () => {
        lightImpact();
        if (soundRef.current) {
            if (isPlaying) {
                await soundRef.current.pauseAsync();
                setIsPlaying(false);
            } else {
                await soundRef.current.playAsync();
                setIsPlaying(true);
            }
        } else {
            loadAndPlayVerse(currentVerseIndex);
        }
    };

    const playNextVerse = () => {
        lightImpact();
        if (currentVerseIndex < verses.length - 1) {
            loadAndPlayVerse(currentVerseIndex + 1);
        }
    };

    const playPreviousVerse = () => {
        lightImpact();
        if (currentVerseIndex > 0) {
            loadAndPlayVerse(currentVerseIndex - 1);
        }
    };

    const toggleSpeed = async () => {
        const speeds = [1.0, 1.25, 1.5, 0.75];
        const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
        const newSpeed = speeds[nextIdx];
        setPlaybackSpeed(newSpeed);
        if (soundRef.current) {
            await soundRef.current.setRateAsync(newSpeed, true);
        }
        lightImpact();
    };

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    // Auto-play on mount
    React.useEffect(() => {
        loadAndPlayVerse(0);
        return () => {
            soundRef.current?.unloadAsync().catch(() => { });
            nextSoundRef.current?.unloadAsync().catch(() => { });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // When reciter changes mid-session, reload current verse with the new reciter
    const reciterIdRef = React.useRef(reciter.id);
    React.useEffect(() => {
        if (reciterIdRef.current === reciter.id) return;
        reciterIdRef.current = reciter.id;
        // Clear pre-buffered sound for previous reciter
        nextSoundRef.current?.unloadAsync().catch(() => { });
        nextSoundRef.current = null;
        // Restart from current verse with the new reciter
        loadAndPlayVerse(currentVerseIndex);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reciter.id]);

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <View style={styles.container}>
            {/* Info Section */}
            <View style={styles.infoContainer}>
                <Text style={styles.verseText}>
                    Verse {currentVerseIndex + 1} of {verses.length}
                </Text>
                <Text style={[styles.reciterText, { color: accentColor }]} numberOfLines={1}>
                    {qariName}
                </Text>
            </View>

            {/* Playback Controls */}
            <View style={styles.controlsContainer}>
                <TouchableOpacity
                    onPress={playPreviousVerse}
                    disabled={currentVerseIndex === 0}
                    accessibilityRole="button"
                    accessibilityLabel="Previous verse"
                >
                    <SkipBack
                        size={24}
                        color={currentVerseIndex === 0 ? Colors.neutral[600] : Colors.neutral[200]}
                    />
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.playButton, { backgroundColor: accentColor }]}
                    onPress={togglePlayback}
                    accessibilityRole="button"
                    accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
                >
                    {isLoading ? (
                        <ActivityIndicator color={Colors.text.inverse} size="small" />
                    ) : isPlaying ? (
                        <Pause size={24} color={Colors.text.inverse} fill={Colors.text.inverse} />
                    ) : (
                        <Play size={24} color={Colors.text.inverse} fill={Colors.text.inverse} />
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={playNextVerse}
                    disabled={currentVerseIndex === verses.length - 1}
                    accessibilityRole="button"
                    accessibilityLabel="Next verse"
                >
                    <SkipForward
                        size={24}
                        color={
                            currentVerseIndex === verses.length - 1
                                ? Colors.neutral[600]
                                : Colors.neutral[200]
                        }
                    />
                </TouchableOpacity>
            </View>

            {/* Speed Toggle & Progress */}
            <View style={styles.bottomRow}>
                <TouchableOpacity onPress={toggleSpeed} style={styles.speedButton}>
                    <Text style={[styles.speedText, { color: accentColor }]}>
                        {playbackSpeed}x
                    </Text>
                </TouchableOpacity>

                {/* Progress Bar */}
                <View style={styles.progressBarBg}>
                    <View
                        style={[
                            styles.progressBarFill,
                            {
                                width: `${((currentVerseIndex + 1) / verses.length) * 100}%`,
                                backgroundColor: accentColor,
                            },
                        ]}
                    />
                </View>
            </View>

            {learningMode && (
                <Text style={styles.learningModeHint}>
                    🎓 Learning Mode: Listen, then record your recitation
                </Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
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
        gap: Spacing.md,
    },
    speedButton: {
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xs,
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: BorderRadius.sm,
    },
    speedText: {
        fontSize: Typography.fontSize.xs,
        fontWeight: Typography.fontWeight.bold,
    },
    progressBarBg: {
        flex: 1,
        height: 3,
        backgroundColor: 'rgba(255,255,255,0.2)',
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
