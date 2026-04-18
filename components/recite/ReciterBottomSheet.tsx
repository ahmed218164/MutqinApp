/**
 * components/recite/ReciterBottomSheet.tsx
 *
 * Professional reciter selection sheet using @gorhom/bottom-sheet.
 * 
 * Two tabs:
 *   - "متصل" (Gapless) — Surah-level reciters with timing DB
 *   - "آيات" (Ayah-by-Ayah) — Per-verse reciters
 *
 * Mirrors the native Android reference app's "اختر القارئ" sheet.
 *
 * BUG FIX: renderReciterItem now correctly captures the latest onSelect
 * via a ref, preventing stale closure issues that caused taps to do nothing.
 */

import * as React from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Music, Check, X, Radio, Layers } from 'lucide-react-native';
import { Colors } from '../../constants/theme';
import { RECITERS_LIBRARY, Reciter, getRecitersByQiraat } from '../../lib/audio-reciters';

// ── Props ────────────────────────────────────────────────────────────────────

interface ReciterBottomSheetProps {
    /** Ref to imperatively open/close the sheet */
    sheetRef: React.RefObject<BottomSheet>;
    onSelect: (reciter: Reciter) => void;
    currentReciterId?: string;
    qiraat?: 'Hafs' | 'Warsh' | 'Qaloon';
}

type AudioTab = 'gapless' | 'ayah';

// ── Component ────────────────────────────────────────────────────────────────

export default function ReciterBottomSheet({
    sheetRef,
    onSelect,
    currentReciterId,
    qiraat = 'Hafs',
}: ReciterBottomSheetProps) {
    const [activeTab, setActiveTab] = React.useState<AudioTab>('ayah');

    // ── FIX: Use a ref to always have the latest onSelect callback ────────
    // This prevents the stale closure in renderReciterItem's useCallback
    const onSelectRef = React.useRef(onSelect);
    onSelectRef.current = onSelect;

    // Build filtered lists based on Qiraat + audio type
    const reciters = React.useMemo(() => {
        const all = qiraat ? getRecitersByQiraat(qiraat) : RECITERS_LIBRARY;
        return {
            gapless: all.filter(r => r.audioType === 'gapless'),
            ayah:    all.filter(r => r.audioType === 'ayah'),
        };
    }, [qiraat]);

    const currentList = activeTab === 'gapless' ? reciters.gapless : reciters.ayah;

    // Auto-select tab based on current reciter
    React.useEffect(() => {
        const current = RECITERS_LIBRARY.find(r => r.id === currentReciterId);
        if (current) {
            setActiveTab(current.audioType === 'gapless' ? 'gapless' : 'ayah');
        }
    }, [currentReciterId]);

    const snapPoints = React.useMemo(() => ['60%', '85%'], []);

    const renderBackdrop = React.useCallback(
        (props: any) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
                opacity={0.6}
            />
        ),
        [],
    );

    // ── FIX: handleSelect uses the ref so it never goes stale ─────────────
    const handleSelect = React.useCallback((reciter: Reciter) => {
        onSelectRef.current(reciter);
        sheetRef.current?.close();
    }, [sheetRef]);

    const renderReciterItem = React.useCallback(({ item }: { item: Reciter }) => {
        const isSelected = item.id === currentReciterId;
        return (
            <TouchableOpacity
                style={[styles.reciterCard, isSelected && styles.reciterCardSelected]}
                onPress={() => handleSelect(item)}
                activeOpacity={0.7}
            >
                {/* Avatar circle with initial */}
                <View style={[
                    styles.avatar,
                    isSelected && { backgroundColor: Colors.emerald[500] },
                ]}>
                    <Text style={[
                        styles.avatarText,
                        isSelected && { color: '#fff' },
                    ]}>
                        {item.nameArabic.charAt(0)}
                    </Text>
                </View>

                <View style={styles.reciterInfo}>
                    <Text style={styles.reciterName} numberOfLines={1}>
                        {item.nameArabic}
                    </Text>
                    <Text style={styles.reciterSubName} numberOfLines={1}>
                        {item.name}
                    </Text>
                    <View style={styles.badges}>
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{item.style}</Text>
                        </View>
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{item.quality}</Text>
                        </View>
                    </View>
                </View>

                {isSelected && (
                    <View style={styles.checkmark}>
                        <Check size={18} color="#fff" />
                    </View>
                )}
            </TouchableOpacity>
        );
    }, [currentReciterId, handleSelect]);

    return (
        <BottomSheet
            ref={sheetRef}
            index={-1}
            snapPoints={snapPoints}
            enablePanDownToClose
            backdropComponent={renderBackdrop}
            backgroundStyle={styles.sheetBackground}
            handleIndicatorStyle={styles.handleIndicator}
        >
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <Music size={22} color={Colors.gold[400]} />
                    <Text style={styles.headerTitle}>اختر القارئ</Text>
                </View>
                <TouchableOpacity
                    onPress={() => sheetRef.current?.close()}
                    style={styles.closeButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <X size={22} color={Colors.neutral[400]} />
                </TouchableOpacity>
            </View>

            {/* Tab bar: Gapless / Ayah-by-Ayah */}
            <View style={styles.tabBar}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'ayah' && styles.tabActive]}
                    onPress={() => setActiveTab('ayah')}
                >
                    <Layers
                        size={16}
                        color={activeTab === 'ayah' ? Colors.emerald[400] : Colors.neutral[500]}
                    />
                    <Text style={[
                        styles.tabText,
                        activeTab === 'ayah' && styles.tabTextActive,
                    ]}>
                        آيات
                    </Text>
                    <Text style={[
                        styles.tabCount,
                        activeTab === 'ayah' && styles.tabCountActive,
                    ]}>
                        {reciters.ayah.length}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.tab, activeTab === 'gapless' && styles.tabActive]}
                    onPress={() => setActiveTab('gapless')}
                >
                    <Radio
                        size={16}
                        color={activeTab === 'gapless' ? Colors.gold[400] : Colors.neutral[500]}
                    />
                    <Text style={[
                        styles.tabText,
                        activeTab === 'gapless' && styles.tabTextActive,
                        activeTab === 'gapless' && { color: Colors.gold[400] },
                    ]}>
                        متصل
                    </Text>
                    <Text style={[
                        styles.tabCount,
                        activeTab === 'gapless' && styles.tabCountActive,
                        activeTab === 'gapless' && { color: Colors.gold[400], backgroundColor: Colors.gold[400] + '18' },
                    ]}>
                        {reciters.gapless.length}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Reciter list */}
            <BottomSheetFlatList
                data={currentList}
                keyExtractor={item => item.id}
                renderItem={renderReciterItem}
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
            />
        </BottomSheet>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    sheetBackground: {
        backgroundColor: '#0d1117',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
    },
    handleIndicator: {
        backgroundColor: Colors.neutral[600],
        width: 40,
    },

    // ── Header ──
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 4,
        paddingBottom: 12,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
        fontFamily: 'System',
    },
    closeButton: {
        padding: 6,
    },

    // ── Tabs ──
    tabBar: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginBottom: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 4,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: 10,
    },
    tabActive: {
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    tabText: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.neutral[500],
    },
    tabTextActive: {
        color: Colors.emerald[400],
    },
    tabCount: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.neutral[600],
        backgroundColor: 'rgba(255,255,255,0.06)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
        overflow: 'hidden',
    },
    tabCountActive: {
        color: Colors.emerald[400],
        backgroundColor: Colors.emerald[400] + '18',
    },

    // ── List ──
    list: {
        paddingHorizontal: 16,
        paddingBottom: 40,
    },

    // ── Reciter Card ──
    reciterCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 14,
        padding: 14,
        marginBottom: 8,
        borderWidth: 1.5,
        borderColor: 'transparent',
    },
    reciterCardSelected: {
        borderColor: Colors.emerald[500] + '60',
        backgroundColor: Colors.emerald[500] + '08',
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    avatarText: {
        fontSize: 18,
        fontWeight: '700',
        color: Colors.neutral[400],
    },
    reciterInfo: {
        flex: 1,
    },
    reciterName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 2,
    },
    reciterSubName: {
        fontSize: 12,
        color: Colors.neutral[400],
        marginBottom: 6,
    },
    badges: {
        flexDirection: 'row',
        gap: 6,
    },
    badge: {
        backgroundColor: 'rgba(234, 179, 8, 0.12)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    badgeText: {
        fontSize: 11,
        color: Colors.gold[400],
        fontWeight: '600',
    },
    checkmark: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: Colors.emerald[500],
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
    },
});
