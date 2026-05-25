import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    FlatList,
    Dimensions,
} from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import { X, Check, Music } from 'lucide-react-native';
import { RECITERS_LIBRARY, Reciter, getRecitersByQiraat } from '../../lib/audio-reciters';
import Card from '../ui/Card';

// ── Memoised reciter row ─────────────────────────────────────────────────────
interface ReciterItemProps {
    item: Reciter;
    isSelected: boolean;
    onSelect: (reciter: Reciter) => void;
}

const ReciterItem = React.memo(function ReciterItem(
    { item, isSelected, onSelect }: ReciterItemProps,
) {
    const handlePress = React.useCallback(() => onSelect(item), [onSelect, item]);

    return (
        <Card
            style={[
                reciterItemStyles.reciterCard,
                isSelected && reciterItemStyles.reciterCardSelected,
            ]}
            variant="glass"
            onPress={handlePress}
        >
            <View style={reciterItemStyles.reciterInfo}>
                <Text style={reciterItemStyles.reciterName}>{item.name}</Text>
                <Text style={reciterItemStyles.reciterNameArabic}>{item.nameArabic}</Text>
                <View style={reciterItemStyles.badges}>
                    <View style={reciterItemStyles.badge}>
                        <Text style={reciterItemStyles.badgeText}>{item.qiraat}</Text>
                    </View>
                    <View style={reciterItemStyles.badge}>
                        <Text style={reciterItemStyles.badgeText}>{item.style}</Text>
                    </View>
                    <View style={reciterItemStyles.badge}>
                        <Text style={reciterItemStyles.badgeText}>{item.quality}</Text>
                    </View>
                </View>
            </View>
            {isSelected && (
                <View style={reciterItemStyles.checkmark}>
                    <Check size={20} color={Colors.emerald[950]} />
                </View>
            )}
        </Card>
    );
});

const reciterItemStyles = StyleSheet.create({
    reciterCard: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.md,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    reciterCardSelected: {
        borderColor: Colors.emerald[400],
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
    },
    reciterInfo: {
        flex: 1,
    },
    reciterName: {
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        marginBottom: Spacing.xs,
    },
    reciterNameArabic: {
        fontSize: Typography.fontSize.base,
        color: Colors.text.secondary,
        marginBottom: Spacing.sm,
    },
    badges: {
        flexDirection: 'row',
        gap: Spacing.xs,
        flexWrap: 'wrap',
    },
    badge: {
        backgroundColor: 'rgba(234, 179, 8, 0.15)',
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.base,
    },
    badgeText: {
        fontSize: Typography.fontSize.xs,
        color: Colors.gold[400],
        fontWeight: Typography.fontWeight.semibold,
    },
    checkmark: {
        width: 32,
        height: 32,
        borderRadius: BorderRadius.full,
        backgroundColor: Colors.emerald[400],
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: Spacing.md,
    },
});

interface ReciterSelectionModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (reciter: Reciter) => void;
    currentReciterId?: string;
    qiraat?: 'Hafs' | 'Warsh' | 'Qaloon';
}

const SCREEN_HEIGHT = Dimensions.get('window').height;

export default function ReciterSelectionModal({
    visible,
    onClose,
    onSelect,
    currentReciterId,
    qiraat = 'Hafs',
}: ReciterSelectionModalProps) {
    // Filter to ayah-by-ayah reciters only — the engine doesn't support
    // gapless (surah-level) playback yet (requires timing DB + seekTo).
    const reciters = (qiraat ? getRecitersByQiraat(qiraat) : RECITERS_LIBRARY)
        .filter(r => r.audioType === 'ayah');

    const handleSelect = React.useCallback((reciter: Reciter) => {
        onSelect(reciter);
        onClose();
    }, [onSelect, onClose]);

    const renderReciter = React.useCallback(
        ({ item }: { item: Reciter }) => (
            <ReciterItem
                item={item}
                isSelected={item.id === currentReciterId}
                onSelect={handleSelect}
            />
        ),
        [currentReciterId, handleSelect],
    );

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={onClose}
        >
            {/* Force dark background on all platforms so text is always readable */}
            <View style={styles.container}>
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Music size={24} color={Colors.gold[400]} />
                        <Text style={styles.headerTitle}>Select Reciter</Text>
                    </View>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                        <X size={24} color={Colors.text.inverse} />
                    </TouchableOpacity>
                </View>

                <FlatList
                    data={reciters}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.list}
                    renderItem={renderReciter}
                    removeClippedSubviews={true}
                    initialNumToRender={12}
                    maxToRenderPerBatch={5}
                    windowSize={5}
                />
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // Force a consistent dark background on both Android and iOS (pageSheet)
        backgroundColor: '#0d1117',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.lg,
        paddingTop: Spacing['2xl'],
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    headerTitle: {
        fontSize: Typography.fontSize.xl,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
    },
    closeButton: {
        padding: Spacing.xs,
    },
    list: {
        padding: Spacing.lg,
    },

});
