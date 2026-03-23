import * as React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import { Play, Pause, SkipBack, SkipForward, Music } from 'lucide-react-native';
import Card from '../ui/Card';
import ReciterSelectionModal from './ReciterSelectionModal';
import { Reciter, getDefaultReciter, getReciterById } from '../../lib/audio-reciters';

interface EnhancedAudioPlayerProps {
    isPlaying: boolean;
    currentAyah: number;
    totalAyahs: number;
    onPlay: () => void;
    onPause: () => void;
    onNext: () => void;
    onPrevious: () => void;
    onReciterChange: (reciter: Reciter) => void;
    selectedReciterId?: string;
    qiraat?: 'Hafs' | 'Warsh' | 'Qaloon';
}

export default function EnhancedAudioPlayer({
    isPlaying,
    currentAyah,
    totalAyahs,
    onPlay,
    onPause,
    onNext,
    onPrevious,
    onReciterChange,
    selectedReciterId,
    qiraat = 'Hafs',
}: EnhancedAudioPlayerProps) {
    const [reciterModalVisible, setReciterModalVisible] = React.useState(false);
    const selectedReciter = selectedReciterId 
        ? getReciterById(selectedReciterId) || getDefaultReciter()
        : getDefaultReciter();

    return (
        <>
            <Card style={styles.container} variant="glass">
                <TouchableOpacity
                    onPress={() => setReciterModalVisible(true)}
                    style={styles.reciterButton}
                >
                    <Music size={18} color={Colors.gold[400]} />
                    <View style={styles.reciterInfo}>
                        <Text style={styles.reciterName}>{selectedReciter.name}</Text>
                        <Text style={styles.reciterStyle}>{selectedReciter.style}</Text>
                    </View>
                </TouchableOpacity>

                <View style={styles.progressInfo}>
                    <Text style={styles.progressText}>
                        Ayah {currentAyah} of {totalAyahs}
                    </Text>
                </View>

                <View style={styles.controls}>
                    <TouchableOpacity
                        onPress={onPrevious}
                        style={styles.controlButton}
                        disabled={currentAyah <= 1}
                    >
                        <SkipBack
                            size={24}
                            color={currentAyah <= 1 ? Colors.neutral[600] : Colors.text.inverse}
                        />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={isPlaying ? onPause : onPlay}
                        style={styles.playButton}
                    >
                        {isPlaying ? (
                            <Pause size={32} color={Colors.neutral[950]} />
                        ) : (
                            <Play size={32} color={Colors.neutral[950]} />
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={onNext}
                        style={styles.controlButton}
                        disabled={currentAyah >= totalAyahs}
                    >
                        <SkipForward
                            size={24}
                            color={currentAyah >= totalAyahs ? Colors.neutral[600] : Colors.text.inverse}
                        />
                    </TouchableOpacity>
                </View>
            </Card>

            <ReciterSelectionModal
                visible={reciterModalVisible}
                onClose={() => setReciterModalVisible(false)}
                onSelect={onReciterChange}
                currentReciterId={selectedReciterId}
                qiraat={qiraat}
            />
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: Spacing.lg,
    },
    reciterButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(234, 179, 8, 0.1)',
        padding: Spacing.md,
        borderRadius: BorderRadius.base,
        marginBottom: Spacing.md,
        gap: Spacing.sm,
    },
    reciterInfo: {
        flex: 1,
    },
    reciterName: {
        fontSize: Typography.fontSize.base,
        fontWeight: Typography.fontWeight.semibold,
        color: Colors.text.inverse,
    },
    reciterStyle: {
        fontSize: Typography.fontSize.xs,
        color: Colors.text.tertiary,
    },
    progressInfo: {
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    progressText: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.secondary,
    },
    controls: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: Spacing.xl,
    },
    controlButton: {
        padding: Spacing.md,
    },
    playButton: {
        width: 64,
        height: 64,
        borderRadius: BorderRadius.full,
        backgroundColor: Colors.gold[500],
        justifyContent: 'center',
        alignItems: 'center',
    },
});
