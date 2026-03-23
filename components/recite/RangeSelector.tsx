import * as React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { ChevronDown, X } from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { lightImpact } from '../../lib/haptics';

interface RangeSelectorProps {
    totalVerses: number;
    selectedRange: { from: number; to: number };
    onRangeChange: (range: { from: number; to: number }) => void;
    surahName?: string;
}

type PresetType = 'full' | 'first-half' | 'second-half' | 'custom';

export default function RangeSelector({
    totalVerses,
    selectedRange,
    onRangeChange,
    surahName = 'Surah',
}: RangeSelectorProps) {
    const [showPicker, setShowPicker] = React.useState(false);
    const [tempRange, setTempRange] = React.useState(selectedRange);
    const [pickerType, setPickerType] = React.useState<'from' | 'to' | null>(null);

    const estimatedMinutes = Math.ceil((selectedRange.to - selectedRange.from + 1) * 0.5);

    const applyPreset = (preset: PresetType) => {
        lightImpact();
        let newRange = { ...selectedRange };

        switch (preset) {
            case 'full':
                newRange = { from: 1, to: totalVerses };
                break;
            case 'first-half':
                newRange = { from: 1, to: Math.ceil(totalVerses / 2) };
                break;
            case 'second-half':
                newRange = { from: Math.ceil(totalVerses / 2) + 1, to: totalVerses };
                break;
        }

        setTempRange(newRange);
        onRangeChange(newRange);
    };

    const handleOpenPicker = (type: 'from' | 'to') => {
        lightImpact();
        setPickerType(type);
        setShowPicker(true);
    };

    const handleSelectValue = (value: number) => {
        lightImpact();
        const newRange = {
            ...tempRange,
            [pickerType as string]: value,
        };

        // Validate range
        if (newRange.from > newRange.to) {
            if (pickerType === 'from') {
                newRange.to = newRange.from;
            } else {
                newRange.from = newRange.to;
            }
        }

        setTempRange(newRange);
    };

    const handleApply = () => {
        lightImpact();
        onRangeChange(tempRange);
        setShowPicker(false);
        setPickerType(null);
    };

    const handleCancel = () => {
        lightImpact();
        setTempRange(selectedRange);
        setShowPicker(false);
        setPickerType(null);
    };

    const verseCount = selectedRange.to - selectedRange.from + 1;

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Recitation Range</Text>

            {/* Range Display */}
            <View style={styles.rangeDisplay}>
                <TouchableOpacity
                    style={styles.rangeButton}
                    onPress={() => handleOpenPicker('from')}
                    accessibilityRole="button"
                    accessibilityLabel={`From Ayah ${selectedRange.from}`}
                >
                    <Text style={styles.rangeLabel}>From</Text>
                    <View style={styles.rangeValue}>
                        <Text style={styles.rangeValueText}>Ayah {selectedRange.from}</Text>
                        <ChevronDown size={16} color={Colors.neutral[400]} />
                    </View>
                </TouchableOpacity>

                <View style={styles.rangeSeparator}>
                    <Text style={styles.rangeSeparatorText}>→</Text>
                </View>

                <TouchableOpacity
                    style={styles.rangeButton}
                    onPress={() => handleOpenPicker('to')}
                    accessibilityRole="button"
                    accessibilityLabel={`To Ayah ${selectedRange.to}`}
                >
                    <Text style={styles.rangeLabel}>To</Text>
                    <View style={styles.rangeValue}>
                        <Text style={styles.rangeValueText}>Ayah {selectedRange.to}</Text>
                        <ChevronDown size={16} color={Colors.neutral[400]} />
                    </View>
                </TouchableOpacity>
            </View>

            {/* Quick Presets */}
            <View style={styles.presetsContainer}>
                <TouchableOpacity
                    style={[
                        styles.presetButton,
                        selectedRange.from === 1 && selectedRange.to === totalVerses && styles.activePreset,
                    ]}
                    onPress={() => applyPreset('full')}
                >
                    <Text style={styles.presetText}>Full {surahName}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.presetButton,
                        selectedRange.from === 1 &&
                        selectedRange.to === Math.ceil(totalVerses / 2) &&
                        styles.activePreset,
                    ]}
                    onPress={() => applyPreset('first-half')}
                >
                    <Text style={styles.presetText}>First Half</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.presetButton,
                        selectedRange.from === Math.ceil(totalVerses / 2) + 1 &&
                        selectedRange.to === totalVerses &&
                        styles.activePreset,
                    ]}
                    onPress={() => applyPreset('second-half')}
                >
                    <Text style={styles.presetText}>Second Half</Text>
                </TouchableOpacity>
            </View>

            {/* Range Info */}
            <View style={styles.infoContainer}>
                <Text style={styles.infoText}>
                    Selected: {verseCount} Ayah{verseCount !== 1 ? 's' : ''} (~{estimatedMinutes} min)
                </Text>
            </View>

            {/* Picker Modal */}
            <Modal visible={showPicker} transparent animationType="fade" onRequestClose={handleCancel}>
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={handleCancel}
                >
                    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.modalContent}>
                        <BlurView intensity={80} tint="dark" style={styles.pickerContainer}>
                            <View style={styles.pickerHeader}>
                                <Text style={styles.pickerTitle}>
                                    Select {pickerType === 'from' ? 'Starting' : 'Ending'} Ayah
                                </Text>
                                <TouchableOpacity onPress={handleCancel}>
                                    <X size={24} color={Colors.neutral[400]} />
                                </TouchableOpacity>
                            </View>

                            <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                                {[...Array(totalVerses)].map((_, i) => {
                                    const value = i + 1;
                                    const isSelected =
                                        pickerType === 'from'
                                            ? value === tempRange.from
                                            : value === tempRange.to;

                                    return (
                                        <TouchableOpacity
                                            key={value}
                                            style={[
                                                styles.pickerOption,
                                                isSelected && styles.pickerOptionSelected,
                                            ]}
                                            onPress={() => handleSelectValue(value)}
                                        >
                                            <Text
                                                style={[
                                                    styles.pickerOptionText,
                                                    isSelected && styles.pickerOptionTextSelected,
                                                ]}
                                            >
                                                Ayah {value}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>

                            <View style={styles.pickerActions}>
                                <TouchableOpacity
                                    style={[styles.pickerButton, styles.cancelButton]}
                                    onPress={handleCancel}
                                >
                                    <Text style={styles.cancelButtonText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.pickerButton, styles.applyButton]}
                                    onPress={handleApply}
                                >
                                    <Text style={styles.applyButtonText}>Apply</Text>
                                </TouchableOpacity>
                            </View>
                        </BlurView>
                    </Animated.View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginBottom: Spacing.md,
    },
    title: {
        fontSize: Typography.fontSize.base,
        fontWeight: Typography.fontWeight.semibold,
        color: Colors.neutral[200],
        marginBottom: Spacing.sm,
    },
    rangeDisplay: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginBottom: Spacing.md,
    },
    rangeButton: {
        flex: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: BorderRadius.md,
        padding: Spacing.sm,
    },
    rangeLabel: {
        fontSize: Typography.fontSize.xs,
        color: Colors.neutral[400],
        marginBottom: 2,
    },
    rangeValue: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    rangeValueText: {
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.semibold,
        color: Colors.neutral[200],
    },
    rangeSeparator: {
        paddingHorizontal: Spacing.xs,
    },
    rangeSeparatorText: {
        fontSize: Typography.fontSize.lg,
        color: Colors.neutral[500],
    },
    presetsContainer: {
        flexDirection: 'row',
        gap: Spacing.xs,
        marginBottom: Spacing.sm,
    },
    presetButton: {
        flex: 1,
        paddingVertical: Spacing.xs,
        paddingHorizontal: Spacing.sm,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    activePreset: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        borderColor: Colors.emerald[500],
    },
    presetText: {
        fontSize: Typography.fontSize.xs,
        color: Colors.neutral[300],
        textAlign: 'center',
    },
    infoContainer: {
        alignItems: 'center',
    },
    infoText: {
        fontSize: Typography.fontSize.xs,
        color: Colors.neutral[400],
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '80%',
        maxHeight: '70%',
    },
    pickerContainer: {
        borderRadius: BorderRadius.xl,
        overflow: 'hidden',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
    },
    pickerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: Spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    },
    pickerTitle: {
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.neutral[200],
    },
    pickerScroll: {
        maxHeight: 300,
    },
    pickerOption: {
        padding: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    pickerOptionSelected: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
    },
    pickerOptionText: {
        fontSize: Typography.fontSize.base,
        color: Colors.neutral[300],
        textAlign: 'center',
    },
    pickerOptionTextSelected: {
        color: Colors.emerald[400],
        fontWeight: Typography.fontWeight.bold,
    },
    pickerActions: {
        flexDirection: 'row',
        gap: Spacing.sm,
        padding: Spacing.lg,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.1)',
    },
    pickerButton: {
        flex: 1,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
    },
    cancelButton: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    applyButton: {
        backgroundColor: Colors.emerald[600],
    },
    cancelButtonText: {
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.semibold,
        color: Colors.neutral[300],
    },
    applyButtonText: {
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.semibold,
        color: Colors.text.inverse,
    },
});
