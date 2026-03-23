import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    TextInput,
    Alert,
} from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import { X, Bookmark as BookmarkIcon } from 'lucide-react-native';
import { TAG_COLORS, addBookmark } from '../../lib/bookmarks';

interface BookmarkModalProps {
    visible: boolean;
    onClose: () => void;
    userId: string;
    surah: number;
    ayah: number;
    surahName: string;
    onSuccess: () => void;
}

export default function BookmarkModal({
    visible,
    onClose,
    userId,
    surah,
    ayah,
    surahName,
    onSuccess,
}: BookmarkModalProps) {
    const [selectedColor, setSelectedColor] = React.useState<string>('gold');
    const [note, setNote] = React.useState('');
    const [saving, setSaving] = React.useState(false);

    async function handleSave() {
        setSaving(true);
        try {
            const result = await addBookmark(
                userId,
                surah,
                ayah,
                surahName,
                selectedColor,
                note || undefined
            );

            if (result.success) {
                Alert.alert('Success', 'Bookmark added successfully!');
                onSuccess();
                onClose();
                setNote('');
                setSelectedColor('gold');
            } else {
                Alert.alert('Error', result.error || 'Failed to add bookmark');
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to add bookmark');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.backdrop}>
                <View style={styles.modal}>
                    <View style={styles.header}>
                        <View style={styles.headerLeft}>
                            <BookmarkIcon size={24} color={Colors.gold[400]} />
                            <Text style={styles.headerTitle}>Add Bookmark</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <X size={24} color={Colors.text.inverse} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.content}>
                        <View style={styles.ayahReference}>
                            <Text style={styles.referenceText}>
                                {surahName} - Ayah {ayah}
                            </Text>
                        </View>

                        <Text style={styles.label}>Select Tag Color</Text>
                        <View style={styles.colorGrid}>
                            {Object.entries(TAG_COLORS).map(([name, color]) => (
                                <TouchableOpacity
                                    key={name}
                                    style={[
                                        styles.colorOption,
                                        { backgroundColor: color },
                                        selectedColor === name && styles.colorOptionSelected,
                                    ]}
                                    onPress={() => setSelectedColor(name)}
                                >
                                    {selectedColor === name && (
                                        <View style={styles.checkmark} />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={styles.label}>Note (Optional)</Text>
                        <TextInput
                            style={styles.noteInput}
                            placeholder="Add a personal note..."
                            placeholderTextColor={Colors.neutral[400]}
                            value={note}
                            onChangeText={setNote}
                            multiline
                            numberOfLines={3}
                            textAlignVertical="top"
                        />

                        <TouchableOpacity
                            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                            onPress={handleSave}
                            disabled={saving}
                        >
                            <Text style={styles.saveButtonText}>
                                {saving ? 'Saving...' : 'Save Bookmark'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.lg,
    },
    modal: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: Colors.neutral[900],
        borderRadius: BorderRadius['2xl'],
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: Spacing.lg,
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
    content: {
        padding: Spacing.lg,
    },
    ayahReference: {
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        padding: Spacing.md,
        borderRadius: BorderRadius.base,
        marginBottom: Spacing.lg,
    },
    referenceText: {
        fontSize: Typography.fontSize.base,
        fontWeight: Typography.fontWeight.semibold,
        color: Colors.emerald[400],
        textAlign: 'center',
    },
    label: {
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.primary,
        marginBottom: Spacing.sm,
    },
    colorGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.md,
        marginBottom: Spacing.lg,
    },
    colorOption: {
        width: 44,
        height: 44,
        borderRadius: BorderRadius.full,
        justifyContent: 'center',
        alignItems: 'center',
    },
    colorOptionSelected: {
        borderWidth: 3,
        borderColor: Colors.neutral[100],
    },
    checkmark: {
        width: 20,
        height: 20,
        borderRadius: BorderRadius.full,
        backgroundColor: Colors.neutral[100],
    },
    noteInput: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: BorderRadius.base,
        padding: Spacing.md,
        fontSize: Typography.fontSize.base,
        color: Colors.text.inverse,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        minHeight: 80,
        marginBottom: Spacing.lg,
    },
    saveButton: {
        backgroundColor: Colors.gold[500],
        borderRadius: BorderRadius.lg,
        padding: Spacing.base,
        alignItems: 'center',
    },
    saveButtonDisabled: {
        opacity: 0.6,
    },
    saveButtonText: {
        fontSize: Typography.fontSize.base,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.neutral[950],
    },
});
