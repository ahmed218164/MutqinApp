import * as React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
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
    selectedReciter?: Reciter;
    onSurahEnd?: () => void;
}

export default function AudioPlayerControls({
    surahNumber,
    verses,
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

    const soundRef = React.useRef<AudioPlayer | null>(null);
    const nextSoundRef = React.useRef<AudioPlayer | null>(null);
    const statusSubscriptionRef = React.useRef<{ remove: () => void } | null>(null);

    const reciter = selectedReciter ?? getDefaultReciter();
    const qariName = reciter.nameArabic
        ? `${reciter.name} · ${reciter.nameArabic}`
        : reciter.name;

    const releasePlayer = React.useCallback((player: AudioPlayer | null) => {
        if (!player) return;
        try {
            player.pause();
            player.remove();
        } catch {
            // Best-effort cleanup.
        }
    }, []);

    const resolveUri = React.useCallback(async (index: number): Promise<string | null> => {
        const verse = verses[index];
        if (!verse) return null;
        return getAyahAudioUrl(surahNumber, verse.numberInSurah, reciter);
    }, [reciter, surahNumber, verses]);

    const preBufferNext = React.useCallback(async (nextIndex: number) => {
        if (nextIndex >= verses.length || nextSoundRef.current) return;

        try {
            prefetchAyahAudio(surahNumber, verses[nextIndex].numberInSurah);

            const uri = await resolveUri(nextIndex);
            if (!uri) return;

            const preloaded = createAudioPlayer(uri, { updateInterval: 250 });
            preloaded.setPlaybackRate(playbackSpeed);
            nextSoundRef.current = preloaded;
        } catch {
            // The normal playback path will load the verse if pre-buffering fails.
        }
    }, [playbackSpeed, resolveUri, surahNumber, verses]);

    const loadAndPlayVerse = React.useCallback(async (index: number) => {
        if (index >= verses.length) {
            setIsPlaying(false);
            return;
        }

        try {
            setIsLoading(true);

            let newSound: AudioPlayer;

            if (nextSoundRef.current) {
                newSound = nextSoundRef.current;
                nextSoundRef.current = null;
            } else {
                releasePlayer(soundRef.current);
                soundRef.current = null;

                const uri = await resolveUri(index);
                if (!uri) throw new Error('Could not resolve audio URL');

                newSound = createAudioPlayer(uri, { updateInterval: 250 });
            }

            if (soundRef.current && soundRef.current !== newSound) {
                releasePlayer(soundRef.current);
            }

            statusSubscriptionRef.current?.remove();
            statusSubscriptionRef.current = null;

            newSound.setPlaybackRate(playbackSpeed);
            newSound.play();
            soundRef.current = newSound;

            setCurrentVerseIndex(index);
            onVerseChange(index);
            setIsPlaying(true);
            preBufferNext(index + 1);

            statusSubscriptionRef.current = newSound.addListener('playbackStatusUpdate', (status) => {
                if (!status.isLoaded || !status.didJustFinish) return;

                if (learningMode) {
                    setIsPlaying(false);
                    onLearningStepComplete?.();
                    return;
                }

                const nextIndex = index + 1;
                if (nextIndex < verses.length) {
                    loadAndPlayVerse(nextIndex);
                } else {
                    setIsPlaying(false);
                    onSurahEnd?.();
                }
            });
        } catch (error) {
            console.error('[AudioPlayerControls] Error playing audio:', error);
            setIsPlaying(false);
        } finally {
            setIsLoading(false);
        }
    }, [
        learningMode,
        onLearningStepComplete,
        onSurahEnd,
        onVerseChange,
        playbackSpeed,
        preBufferNext,
        releasePlayer,
        resolveUri,
        verses.length,
    ]);

    const togglePlayback = async () => {
        lightImpact();
        if (soundRef.current) {
            if (isPlaying) {
                soundRef.current.pause();
                setIsPlaying(false);
            } else {
                soundRef.current.play();
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
        soundRef.current?.setPlaybackRate(newSpeed);
        lightImpact();
    };

    React.useEffect(() => {
        loadAndPlayVerse(0);
        return () => {
            statusSubscriptionRef.current?.remove();
            releasePlayer(soundRef.current);
            releasePlayer(nextSoundRef.current);
            soundRef.current = null;
            nextSoundRef.current = null;
        };
    }, []);

    const reciterIdRef = React.useRef(reciter.id);
    React.useEffect(() => {
        if (reciterIdRef.current === reciter.id) return;
        reciterIdRef.current = reciter.id;
        releasePlayer(nextSoundRef.current);
        nextSoundRef.current = null;
        loadAndPlayVerse(currentVerseIndex);
    }, [currentVerseIndex, loadAndPlayVerse, reciter.id, releasePlayer]);

    return (
        <View style={styles.container}>
            <View style={styles.infoContainer}>
                <Text style={styles.verseText}>
                    الآية {currentVerseIndex + 1} من {verses.length}
                </Text>
                <Text style={[styles.reciterText, { color: accentColor }]} numberOfLines={1}>
                    {qariName}
                </Text>
            </View>

            <View style={styles.controlsContainer}>
                <TouchableOpacity
                    onPress={playPreviousVerse}
                    disabled={currentVerseIndex === 0}
                    accessibilityRole="button"
                    accessibilityLabel="الآية السابقة"
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
                    accessibilityLabel={isPlaying ? 'إيقاف مؤقت' : 'تشغيل'}
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
                    accessibilityLabel="الآية التالية"
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

            <View style={styles.bottomRow}>
                <TouchableOpacity onPress={toggleSpeed} style={styles.speedButton}>
                    <Text style={[styles.speedText, { color: accentColor }]}>
                        {playbackSpeed}x
                    </Text>
                </TouchableOpacity>

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
                    استمع للآية ثم سجّل تلاوتك
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
