/**
 * components/recite/PlaybackScopeSheet.tsx
 *
 * SLICE 2 — "Playback Scope" Bottom Sheet
 *
 * Shown when the user taps "استماع" (Play). Lets the user pick
 * what range to listen to before audio starts playing.
 *
 * Options:
 *  1. Current Page
 *  2. Full Surah
 *  3. Current Juz
 *  4. Full Quran (disabled — coming soon)
 *  5. Custom Range (inline RangeSelector)
 *
 * Design: Solid backgrounds, 44pt targets, grey drag pill, 8dp rhythm.
 */

import * as React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { BookOpen, FileText, Layers, Globe, SlidersHorizontal, ChevronRight } from 'lucide-react-native';
import { Colors } from '../../constants/theme';

// ── Design Tokens ─────────────────────────────────────────────────────────────

const SANCTUARY = {
    bg: '#161B24',
    bgLight: '#FFFFFF',
    text: { primary: '#E8E6E1', secondary: '#6B7A8D', primaryLight: '#1A1A2E', secondaryLight: Colors.neutral[500] },
    border: 'rgba(255,255,255,0.06)',
    borderLight: 'rgba(0,0,0,0.06)',
    dragPill: '#4B5563',
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export type PlaybackScope = 'page' | 'surah' | 'juz' | 'quran' | 'custom';

interface PlaybackScopeSheetProps {
    sheetRef: React.RefObject<BottomSheetModal>;
    nightMode: boolean;
    accentColor: string;
    surahName: string;
    currentPage: number;
    currentJuz: number;
    totalVerses: number;
    onScopeSelect: (scope: PlaybackScope) => void;
}

// ── Juz boundaries — shared via constants/juz ─────────────────────────────────
import { JUZ_PAGES, getJuzEndPage } from '../../constants/juz';

// ── Component ─────────────────────────────────────────────────────────────────

export default function PlaybackScopeSheet({
    sheetRef,
    nightMode,
    accentColor,
    surahName,
    currentPage,
    currentJuz,
    totalVerses,
    onScopeSelect,
}: PlaybackScopeSheetProps) {
    const snapPoints = React.useMemo(() => ['48%'], []);

    const bg = nightMode ? SANCTUARY.bg : SANCTUARY.bgLight;
    const textPrimary = nightMode ? SANCTUARY.text.primary : SANCTUARY.text.primaryLight;
    const textSecondary = nightMode ? SANCTUARY.text.secondary : SANCTUARY.text.secondaryLight;
    const borderColor = nightMode ? SANCTUARY.border : SANCTUARY.borderLight;

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

    const handleSelect = React.useCallback((scope: PlaybackScope) => {
        onScopeSelect(scope);
        sheetRef.current?.dismiss();
    }, [onScopeSelect, sheetRef]);

    const options: { scope: PlaybackScope; icon: React.ReactNode; label: string; subtitle: string; disabled?: boolean }[] = [
        {
            scope: 'page',
            icon: <FileText size={20} color={accentColor} />,
            label: 'الصفحة الحالية',
            subtitle: `صفحة ${currentPage}`,
        },
        {
            scope: 'surah',
            icon: <BookOpen size={20} color={accentColor} />,
            label: 'السورة كاملة',
            subtitle: `${surahName} · ${totalVerses} آية`,
        },
        {
            scope: 'juz',
            icon: <Layers size={20} color={accentColor} />,
            label: 'الجزء',
            subtitle: `الجزء ${currentJuz} · ص ${JUZ_PAGES[currentJuz - 1]}–${getJuzEndPage(currentJuz)}`,
        },
        {
            scope: 'quran',
            icon: <Globe size={20} color={textSecondary} />,
            label: 'القرآن كاملاً',
            subtitle: 'قريباً',
            disabled: true,
        },
        {
            scope: 'custom',
            icon: <SlidersHorizontal size={20} color={accentColor} />,
            label: 'نطاق مخصص',
            subtitle: 'اختر آيات محددة',
        },
    ];

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
                {/* Header */}
                <Text style={[styles.title, { color: textPrimary }]}>
                    نطاق الاستماع
                </Text>

                {/* Options list */}
                {options.map((opt) => (
                    <TouchableOpacity
                        key={opt.scope}
                        style={[
                            styles.optionRow,
                            { borderBottomColor: borderColor },
                            opt.disabled && styles.optionDisabled,
                        ]}
                        onPress={() => !opt.disabled && handleSelect(opt.scope)}
                        activeOpacity={opt.disabled ? 1 : 0.7}
                        accessibilityRole="button"
                        accessibilityLabel={opt.label}
                        accessibilityState={{ disabled: opt.disabled }}
                    >
                        <View style={[styles.iconBox, { backgroundColor: accentColor + '12' }]}>
                            {opt.icon}
                        </View>
                        <View style={styles.optionText}>
                            <Text style={[
                                styles.optionLabel,
                                { color: opt.disabled ? textSecondary : textPrimary },
                            ]}>
                                {opt.label}
                            </Text>
                            <Text style={[styles.optionSubtitle, { color: textSecondary }]}>
                                {opt.subtitle}
                            </Text>
                        </View>
                        {!opt.disabled && (
                            <ChevronRight size={16} color={textSecondary} />
                        )}
                    </TouchableOpacity>
                ))}
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
    optionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: 16,
        minHeight: 56,
    },
    optionDisabled: {
        opacity: 0.4,
    },
    iconBox: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    optionText: {
        flex: 1,
        gap: 2,
    },
    optionLabel: {
        fontSize: 16,
        fontWeight: '600',
    },
    optionSubtitle: {
        fontSize: 12,
        fontWeight: '500',
    },
});
