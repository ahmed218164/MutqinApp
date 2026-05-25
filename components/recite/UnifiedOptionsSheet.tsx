/**
 * components/recite/UnifiedOptionsSheet.tsx
 *
 * SLICE 2 — Unified Reader Options Bottom Sheet
 *
 * Replaces the old floating Modal with a proper solid bottom sheet.
 * Sections:
 *  1. Reciter — current reciter name, tap to open ReciterBottomSheet
 *  2. Night Mode — toggle with Sun/Moon icons
 *  3. Font Size — stepper (minus / value / plus)
 *  4. Heatmap — toggle
 *  5. Hifz Cover — toggle
 *
 * Design: Solid backgrounds, grey drag pill, 44pt targets, 8dp rhythm.
 */

import * as React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import {
    User, Sun, Moon, Type, Plus, Minus,
    BarChart3, Eye, ChevronRight,
} from 'lucide-react-native';
import { Colors } from '../../constants/theme';

// ── Design Tokens ─────────────────────────────────────────────────────────────

const SANCTUARY = {
    bg: '#161B24',
    bgLight: '#FFFFFF',
    text: { primary: '#E8E6E1', secondary: '#6B7A8D', primaryLight: '#1A1A2E', secondaryLight: '#64748B' },
    border: 'rgba(255,255,255,0.06)',
    borderLight: 'rgba(0,0,0,0.06)',
    dragPill: '#4B5563',
    toggleOn: '#10B981',
    toggleOff: 'rgba(255,255,255,0.08)',
    toggleOffLight: 'rgba(0,0,0,0.06)',
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface UnifiedOptionsSheetProps {
    sheetRef: React.RefObject<BottomSheetModal>;
    nightMode: boolean;
    accentColor: string;
    /** Current reciter name (Arabic) */
    reciterName: string;
    /** Current font size */
    fontSize: number;
    /** Heatmap toggle state */
    heatmapVisible: boolean;
    /** Hifz cover toggle state */
    hifzCoverVisible: boolean;
    // Callbacks
    onReciterPress: () => void;
    onNightModeToggle: () => void;
    onFontSizeChange: (size: number) => void;
    onHeatmapToggle: () => void;
    onHifzToggle: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function UnifiedOptionsSheet({
    sheetRef,
    nightMode,
    accentColor,
    reciterName,
    fontSize,
    heatmapVisible,
    hifzCoverVisible,
    onReciterPress,
    onNightModeToggle,
    onFontSizeChange,
    onHeatmapToggle,
    onHifzToggle,
}: UnifiedOptionsSheetProps) {
    const snapPoints = React.useMemo(() => ['52%'], []);

    const bg = nightMode ? SANCTUARY.bg : SANCTUARY.bgLight;
    const textPrimary = nightMode ? SANCTUARY.text.primary : SANCTUARY.text.primaryLight;
    const textSecondary = nightMode ? SANCTUARY.text.secondary : SANCTUARY.text.secondaryLight;
    const borderColor = nightMode ? SANCTUARY.border : SANCTUARY.borderLight;
    const toggleOff = nightMode ? SANCTUARY.toggleOff : SANCTUARY.toggleOffLight;

    const renderBackdrop = React.useCallback(
        (props: any) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
                opacity={0.5}
            />
        ),
        [],
    );

    return (
        <BottomSheetModal
            ref={sheetRef}
            snapPoints={snapPoints}
            enablePanDownToClose
            backdropComponent={renderBackdrop}
            backgroundStyle={[styles.sheetBg, { backgroundColor: bg }]}
            handleIndicatorStyle={styles.dragPill}
        >
            <BottomSheetView style={styles.content}>
                {/* Title */}
                <Text style={[styles.title, { color: textPrimary }]}>
                    إعدادات القارئ
                </Text>

                {/* ── Reciter Row ── */}
                <TouchableOpacity
                    style={[styles.row, { borderBottomColor: borderColor }]}
                    onPress={() => {
                        sheetRef.current?.dismiss();
                        // Small delay so the options sheet animates out first
                        setTimeout(onReciterPress, 200);
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="اختيار القارئ"
                >
                    <View style={[styles.iconBox, { backgroundColor: accentColor + '12' }]}>
                        <User size={20} color={accentColor} />
                    </View>
                    <View style={styles.rowText}>
                        <Text style={[styles.rowLabel, { color: textPrimary }]}>القارئ</Text>
                        <Text style={[styles.rowValue, { color: textSecondary }]} numberOfLines={1}>
                            {reciterName}
                        </Text>
                    </View>
                    <ChevronRight size={16} color={textSecondary} />
                </TouchableOpacity>

                {/* ── Night Mode Row ── */}
                <TouchableOpacity
                    style={[styles.row, { borderBottomColor: borderColor }]}
                    onPress={onNightModeToggle}
                    activeOpacity={0.7}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: nightMode }}
                    accessibilityLabel="الوضع الليلي"
                >
                    <View style={[styles.iconBox, { backgroundColor: accentColor + '12' }]}>
                        {nightMode ? (
                            <Moon size={20} color={Colors.gold[400]} />
                        ) : (
                            <Sun size={20} color={Colors.gold[500]} />
                        )}
                    </View>
                    <View style={styles.rowText}>
                        <Text style={[styles.rowLabel, { color: textPrimary }]}>
                            {nightMode ? 'الوضع الليلي' : 'الوضع النهاري'}
                        </Text>
                    </View>
                    <View style={[
                        styles.togglePill,
                        {
                            backgroundColor: nightMode ? SANCTUARY.toggleOn + '20' : toggleOff,
                            borderColor: nightMode ? SANCTUARY.toggleOn + '40' : borderColor,
                        },
                    ]}>
                        <Text style={[
                            styles.toggleText,
                            { color: nightMode ? SANCTUARY.toggleOn : textSecondary },
                        ]}>
                            {nightMode ? 'مفعّل' : 'معطّل'}
                        </Text>
                    </View>
                </TouchableOpacity>

                {/* ── Font Size Row ── */}
                <View style={[styles.row, { borderBottomColor: borderColor }]}>
                    <View style={[styles.iconBox, { backgroundColor: accentColor + '12' }]}>
                        <Type size={20} color={accentColor} />
                    </View>
                    <View style={styles.rowText}>
                        <Text style={[styles.rowLabel, { color: textPrimary }]}>حجم الخط</Text>
                    </View>
                    <View style={styles.stepperGroup}>
                        <TouchableOpacity
                            style={[styles.stepperBtn, { backgroundColor: toggleOff }]}
                            onPress={() => onFontSizeChange(Math.max(14, fontSize - 2))}
                            accessibilityRole="button"
                            accessibilityLabel="تصغير الخط"
                        >
                            <Minus size={16} color={textSecondary} />
                        </TouchableOpacity>
                        <Text style={[styles.stepperValue, { color: textPrimary }]}>
                            {fontSize}
                        </Text>
                        <TouchableOpacity
                            style={[styles.stepperBtn, { backgroundColor: toggleOff }]}
                            onPress={() => onFontSizeChange(Math.min(40, fontSize + 2))}
                            accessibilityRole="button"
                            accessibilityLabel="تكبير الخط"
                        >
                            <Plus size={16} color={textSecondary} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ── Heatmap Row ── */}
                <TouchableOpacity
                    style={[styles.row, { borderBottomColor: borderColor }]}
                    onPress={onHeatmapToggle}
                    activeOpacity={0.7}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: heatmapVisible }}
                    accessibilityLabel="خريطة التجويد"
                >
                    <View style={[styles.iconBox, { backgroundColor: accentColor + '12' }]}>
                        <BarChart3 size={20} color={accentColor} />
                    </View>
                    <View style={styles.rowText}>
                        <Text style={[styles.rowLabel, { color: textPrimary }]}>خريطة التجويد</Text>
                    </View>
                    <View style={[
                        styles.togglePill,
                        {
                            backgroundColor: heatmapVisible ? accentColor + '20' : toggleOff,
                            borderColor: heatmapVisible ? accentColor + '40' : borderColor,
                        },
                    ]}>
                        <Text style={[
                            styles.toggleText,
                            { color: heatmapVisible ? accentColor : textSecondary },
                        ]}>
                            {heatmapVisible ? 'مفعّل' : 'معطّل'}
                        </Text>
                    </View>
                </TouchableOpacity>

                {/* ── Hifz Cover Row ── */}
                <TouchableOpacity
                    style={[styles.row, { borderBottomColor: 'transparent' }]}
                    onPress={onHifzToggle}
                    activeOpacity={0.7}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: hifzCoverVisible }}
                    accessibilityLabel="غطاء الحفظ"
                >
                    <View style={[styles.iconBox, { backgroundColor: accentColor + '12' }]}>
                        <Eye size={20} color={accentColor} />
                    </View>
                    <View style={styles.rowText}>
                        <Text style={[styles.rowLabel, { color: textPrimary }]}>غطاء الحفظ</Text>
                    </View>
                    <View style={[
                        styles.togglePill,
                        {
                            backgroundColor: hifzCoverVisible ? accentColor + '20' : toggleOff,
                            borderColor: hifzCoverVisible ? accentColor + '40' : borderColor,
                        },
                    ]}>
                        <Text style={[
                            styles.toggleText,
                            { color: hifzCoverVisible ? accentColor : textSecondary },
                        ]}>
                            {hifzCoverVisible ? 'مفعّل' : 'معطّل'}
                        </Text>
                    </View>
                </TouchableOpacity>
            </BottomSheetView>
        </BottomSheetModal>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    sheetBg: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    dragPill: {
        backgroundColor: SANCTUARY.dragPill,
        width: 40,
        height: 4,
        borderRadius: 2,
    },
    content: {
        paddingHorizontal: 24,
        paddingBottom: 24,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 16,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: 16,
        minHeight: 56,
    },
    iconBox: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowText: {
        flex: 1,
        gap: 2,
    },
    rowLabel: {
        fontSize: 16,
        fontWeight: '600',
    },
    rowValue: {
        fontSize: 12,
        fontWeight: '500',
    },
    togglePill: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 10,
        borderWidth: 1,
    },
    toggleText: {
        fontSize: 12,
        fontWeight: '600',
    },
    stepperGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    stepperBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    stepperValue: {
        fontSize: 16,
        fontWeight: '700',
        minWidth: 28,
        textAlign: 'center',
    },
});
