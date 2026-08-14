import * as React from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, TextInput, Platform,
} from 'react-native';
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Music, Check, X, Radio, Layers, Search, Mic } from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import { RECITERS_LIBRARY, Reciter, getRecitersByQiraat } from '../../lib/audio-reciters';

// ── Props ────────────────────────────────────────────────────────────────────

interface ReciterBottomSheetProps {
    sheetRef: React.RefObject<BottomSheetModal>;
    onSelect: (reciter: Reciter) => void;
    currentReciterId?: string;
    qiraat?: 'Hafs' | 'Warsh' | 'Qaloon';
}

type AudioTab = 'gapless' | 'ayah';

const ITEM_HEIGHT = 86;

const keyExtractor = (item: Reciter) => item.id;

const getItemLayout = (_: ArrayLike<Reciter> | null | undefined, index: number) => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
});

// ── Memoised row for 60 FPS scrolling ───────────────────────────────────────

interface ReciterItemProps {
    item: Reciter;
    isSelected: boolean;
    onSelect: (reciter: Reciter) => void;
}

const ReciterItem = React.memo<ReciterItemProps>(function ReciterItem({
    item,
    isSelected,
    onSelect,
}: ReciterItemProps) {
    const handlePress = React.useCallback(() => onSelect(item), [item, onSelect]);

    return (
        <TouchableOpacity
            style={[styles.reciterCard, isSelected && styles.reciterCardSelected]}
            onPress={handlePress}
            activeOpacity={0.75}
        >
            <View style={[
                styles.avatar,
                isSelected && { backgroundColor: Colors.emerald[500] },
            ]}>
                <Mic size={20} color={isSelected ? '#ffffff' : Colors.emerald[400]} />
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
});

export default function ReciterBottomSheet({
    sheetRef,
    onSelect,
    currentReciterId,
    qiraat = 'Hafs',
}: ReciterBottomSheetProps) {
    const [activeTab, setActiveTab] = React.useState<AudioTab>('ayah');
    const [searchQuery, setSearchQuery] = React.useState('');
    const deferredSearchQuery = React.useDeferredValue(searchQuery);

    const onSelectRef = React.useRef(onSelect);
    onSelectRef.current = onSelect;

    const reciters = React.useMemo(() => {
        const all = qiraat ? getRecitersByQiraat(qiraat) : RECITERS_LIBRARY;
        const filtered = deferredSearchQuery.trim()
            ? all.filter(r =>
                r.nameArabic.includes(deferredSearchQuery) ||
                r.name.toLowerCase().includes(deferredSearchQuery.toLowerCase())
              )
            : all;
        return {
            gapless: filtered.filter(r => r.audioType === 'gapless'),
            ayah:    filtered.filter(r => r.audioType === 'ayah'),
        };
    }, [qiraat, deferredSearchQuery]);

    const currentList = activeTab === 'gapless' ? reciters.gapless : reciters.ayah;

    React.useEffect(() => {
        const current = RECITERS_LIBRARY.find(r => r.id === currentReciterId);
        if (current) {
            setActiveTab(current.audioType === 'gapless' ? 'gapless' : 'ayah');
        }
    }, [currentReciterId]);

    const snapPoints = React.useMemo(() => ['65%', '90%'], []);

    const renderBackdrop = React.useCallback(
        (props: any) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
                opacity={0.65}
            />
        ),
        [],
    );

    const handleSelect = React.useCallback((reciter: Reciter) => {
        onSelectRef.current(reciter);
        sheetRef.current?.dismiss();
    }, [sheetRef]);

    const handleDismiss = React.useCallback(() => {
        sheetRef.current?.dismiss();
    }, [sheetRef]);

    const renderReciterItem = React.useCallback(({ item }: { item: Reciter }) => (
        <ReciterItem
            item={item}
            isSelected={item.id === currentReciterId}
            onSelect={handleSelect}
        />
    ), [currentReciterId, handleSelect]);

    return (
        <BottomSheetModal
            ref={sheetRef}
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
                    onPress={handleDismiss}
                    style={styles.closeButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <X size={22} color={Colors.neutral[400]} />
                </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View style={styles.searchBox}>
                <Search size={18} color={Colors.emerald[400]} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="ابحث عن قارئ بالاسم..."
                    placeholderTextColor={Colors.neutral[400]}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
                {searchQuery ? (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                        <X size={16} color={Colors.neutral[400]} />
                    </TouchableOpacity>
                ) : null}
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
                keyExtractor={keyExtractor}
                renderItem={renderReciterItem}
                getItemLayout={getItemLayout}
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
                removeClippedSubviews={Platform.OS === 'android'}
                initialNumToRender={8}
                maxToRenderPerBatch={6}
                windowSize={5}
            />
        </BottomSheetModal>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    sheetBackground: {
        backgroundColor: '#06201b',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    handleIndicator: {
        backgroundColor: Colors.emerald[400] + '60',
        width: 44,
        height: 5,
    },
    header: {
        flexDirection: 'row-reverse',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 4,
        paddingBottom: 10,
    },
    headerLeft: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        gap: 10,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
        writingDirection: 'rtl',
    },
    closeButton: {
        padding: 6,
    },
    searchBox: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 10,
        marginHorizontal: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(52, 211, 153, 0.2)',
        gap: 10,
    },
    searchInput: {
        flex: 1,
        color: '#ffffff',
        fontSize: 15,
        textAlign: 'right',
        writingDirection: 'rtl',
    },
    tabBar: {
        flexDirection: 'row-reverse',
        marginHorizontal: 16,
        marginBottom: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 4,
    },
    tab: {
        flex: 1,
        flexDirection: 'row-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: 10,
    },
    tabActive: {
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
    },
    tabText: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.neutral[400],
    },
    tabTextActive: {
        color: Colors.emerald[300],
    },
    tabCount: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.neutral[400],
        backgroundColor: 'rgba(255,255,255,0.06)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
        overflow: 'hidden',
    },
    tabCountActive: {
        color: Colors.emerald[300],
        backgroundColor: Colors.emerald[500] + '25',
    },
    list: {
        paddingHorizontal: 16,
        paddingBottom: 40,
    },
    reciterCard: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 16,
        padding: 14,
        marginBottom: 8,
        borderWidth: 1.5,
        borderColor: 'transparent',
    },
    reciterCardSelected: {
        borderColor: Colors.emerald[400],
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 12,
    },
    reciterInfo: {
        flex: 1,
        alignItems: 'flex-end',
    },
    reciterName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 2,
        textAlign: 'right',
    },
    reciterSubName: {
        fontSize: 12,
        color: Colors.neutral[400],
        marginBottom: 6,
        textAlign: 'right',
    },
    badges: {
        flexDirection: 'row-reverse',
        gap: 6,
    },
    badge: {
        backgroundColor: 'rgba(234, 179, 8, 0.15)',
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
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: Colors.emerald[500],
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
});
