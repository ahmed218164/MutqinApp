/**
 * components/mushaf/SearchModal.tsx
 *
 * Full-featured Arabic Search — wired to SQLite ayat.db
 *
 * Features:
 *   - Arabic normalizer (strips harakat, unifies hamzas) via normalizeArabic()
 *   - Real SQLite LIKE query on text_search column via searchAyat()
 *   - Filter chips: by Surah (1–114) and by Juz (1–30)
 *   - Highlighted matched word in result text (visual feedback)
 *   - Jump-to-page: onResultPress(surah, ayah, page)
 */

import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    TextInput,
    FlatList,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import { X, Search as SearchIcon, Filter } from 'lucide-react-native';
import type * as SQLite from 'expo-sqlite';
import { searchAyat, normalizeArabic, type AyatRow, type SearchOptions } from '../../lib/sqlite-db';
import { SURAHS } from '../../constants/surahs';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SearchJumpTarget {
    surah: number;
    ayah: number;
    page: number;
}

interface SearchModalProps {
    visible: boolean;
    db: SQLite.SQLiteDatabase | null;
    onClose: () => void;
    onResultPress: (target: SearchJumpTarget) => void;
}

// ── Highlight helper ──────────────────────────────────────────────────────────

/**
 * Highlight matching query substring inside raw (harakat) text.
 * Strategy: normalize both, find match position in normalized text,
 * then try to show the original text with approximate highlight region.
 */
function HighlightedText({ rawText, normalizedQuery }: { rawText: string; normalizedQuery: string }) {
    if (!normalizedQuery || !rawText) {
        return <Text style={styles.ayahText}>{rawText}</Text>;
    }

    // Strip harakat from display text to show clean Arabic
    const cleanText = rawText.replace(/[\u064B-\u065F\u0670]/g, '');
    const normText = normalizeArabic(cleanText);
    const idx = normText.indexOf(normalizedQuery);

    if (idx === -1) {
        return <Text style={styles.ayahText}>{cleanText}</Text>;
    }

    const before = cleanText.slice(0, idx);
    const match  = cleanText.slice(idx, idx + normalizedQuery.length);
    const after  = cleanText.slice(idx + normalizedQuery.length);

    return (
        <Text style={styles.ayahText}>
            {before}
            <Text style={styles.highlight}>{match}</Text>
            {after}
        </Text>
    );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SEARCH_LIMIT = 60;
const SEARCH_DEBOUNCE_MS = 300;

// ── Component ─────────────────────────────────────────────────────────────────

export default function SearchModal({ visible, db, onClose, onResultPress }: SearchModalProps) {
    const [query, setQuery] = React.useState('');
    const [results, setResults] = React.useState<AyatRow[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [showFilters, setShowFilters] = React.useState(false);
    const [suraFilter, setSuraFilter] = React.useState<number | null>(null);
    const [juzFilter, setJuzFilter] = React.useState<number | null>(null);
    const [resultCount, setResultCount] = React.useState(0);

    const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    // Trigger search whenever query or filters change
    React.useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);

        const trimmed = query.trim();
        if (trimmed.length < 2) {
            setResults([]);
            setResultCount(0);
            return;
        }

        debounceRef.current = setTimeout(() => {
            if (!db) return;
            setIsLoading(true);
            try {
                const opts: SearchOptions = {
                    suraFilter: suraFilter,
                    juzFilter: juzFilter,
                    limit: SEARCH_LIMIT,
                };
                const rows = searchAyat(db, trimmed, opts);
                setResults(rows);
                setResultCount(rows.length);
            } catch (e) {
                console.warn('[SearchModal] searchAyat error:', e);
                setResults([]);
            } finally {
                setIsLoading(false);
            }
        }, SEARCH_DEBOUNCE_MS);

        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [query, suraFilter, juzFilter, db]);

    function handleClose() {
        onClose();
        setQuery('');
        setResults([]);
        setSuraFilter(null);
        setJuzFilter(null);
        setShowFilters(false);
    }

    function handleResultPress(item: AyatRow) {
        onResultPress({ surah: item.sura, ayah: item.aya, page: item.page });
        handleClose();
    }

    const normalizedQuery = normalizeArabic(query.trim());
    const hasQuery = query.trim().length >= 2;
    const activeFilters = (suraFilter != null ? 1 : 0) + (juzFilter != null ? 1 : 0);

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={handleClose}
        >
            <View style={styles.container}>

                {/* ── Header ── */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>البحث في القرآن</Text>
                    <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                        <X size={22} color={Colors.text.inverse} />
                    </TouchableOpacity>
                </View>

                {/* ── Search Input Row ── */}
                <View style={styles.inputRow}>
                    <View style={styles.searchContainer}>
                        <SearchIcon color={Colors.text.tertiary} size={18} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="ابحث عن كلمة أو آية..."
                            placeholderTextColor={Colors.neutral[500]}
                            value={query}
                            onChangeText={setQuery}
                            autoFocus
                            textAlign="right"
                            keyboardType="default"
                        />
                        {isLoading && <ActivityIndicator size="small" color={Colors.gold[400]} />}
                        {query.length > 0 && !isLoading && (
                            <TouchableOpacity onPress={() => setQuery('')}>
                                <X size={16} color={Colors.text.tertiary} />
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Filter toggle button */}
                    <TouchableOpacity
                        style={[styles.filterBtn, activeFilters > 0 && styles.filterBtnActive]}
                        onPress={() => setShowFilters(v => !v)}
                    >
                        <Filter size={16} color={activeFilters > 0 ? Colors.gold[400] : Colors.text.tertiary} />
                        {activeFilters > 0 && (
                            <Text style={styles.filterCount}>{activeFilters}</Text>
                        )}
                    </TouchableOpacity>
                </View>

                {/* ── Filter Chips Panel ── */}
                {showFilters && (
                    <View style={styles.filtersPanel}>
                        {/* Surah filter */}
                        <Text style={styles.filterLabel}>السورة</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
                            <TouchableOpacity
                                style={[styles.chip, suraFilter == null && styles.chipActive]}
                                onPress={() => setSuraFilter(null)}
                            >
                                <Text style={[styles.chipText, suraFilter == null && styles.chipTextActive]}>
                                    الكل
                                </Text>
                            </TouchableOpacity>
                            {SURAHS.map(s => (
                                <TouchableOpacity
                                    key={s.number}
                                    style={[styles.chip, suraFilter === s.number && styles.chipActive]}
                                    onPress={() => setSuraFilter(suraFilter === s.number ? null : s.number)}
                                >
                                    <Text style={[styles.chipText, suraFilter === s.number && styles.chipTextActive]}>
                                        {s.name}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {/* Juz filter */}
                        <Text style={styles.filterLabel}>الجزء</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
                            <TouchableOpacity
                                style={[styles.chip, juzFilter == null && styles.chipActive]}
                                onPress={() => setJuzFilter(null)}
                            >
                                <Text style={[styles.chipText, juzFilter == null && styles.chipTextActive]}>
                                    الكل
                                </Text>
                            </TouchableOpacity>
                            {Array.from({ length: 30 }, (_, i) => i + 1).map(juz => (
                                <TouchableOpacity
                                    key={juz}
                                    style={[styles.chip, juzFilter === juz && styles.chipActive]}
                                    onPress={() => setJuzFilter(juzFilter === juz ? null : juz)}
                                >
                                    <Text style={[styles.chipText, juzFilter === juz && styles.chipTextActive]}>
                                        {juz}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* ── Result Count ── */}
                {hasQuery && !isLoading && (
                    <View style={styles.countRow}>
                        <Text style={styles.countText}>
                            {resultCount === 0
                                ? `لا توجد نتائج لـ «${query}»`
                                : `${resultCount} نتيجة${resultCount === SEARCH_LIMIT ? '+' : ''}`
                            }
                        </Text>
                    </View>
                )}

                {/* ── Results List ── */}
                <FlatList
                    data={results}
                    keyExtractor={item => `${item.sura}-${item.aya}`}
                    contentContainerStyle={styles.resultsList}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => {
                        const surahName = SURAHS[item.sura - 1]?.name ?? `سورة ${item.sura}`;
                        return (
                            <TouchableOpacity
                                style={styles.resultCard}
                                onPress={() => handleResultPress(item)}
                                activeOpacity={0.7}
                            >
                                {/* Card header */}
                                <View style={styles.resultHeader}>
                                    <Text style={styles.surahName}>{surahName}</Text>
                                    <View style={styles.ayahBadge}>
                                        <Text style={styles.ayahBadgeText}>
                                            {item.sura}:{item.aya}  ·  ص {item.page}
                                        </Text>
                                    </View>
                                </View>

                                {/* Ayah text with highlight */}
                                <HighlightedText
                                    rawText={item.text ?? ''}
                                    normalizedQuery={normalizedQuery}
                                />
                            </TouchableOpacity>
                        );
                    }}
                    ListEmptyComponent={
                        hasQuery && !isLoading ? (
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyText}>لا توجد نتائج</Text>
                                <Text style={styles.emptyHint}>
                                    جرّب البحث بكلمات أخرى أو بدون تشكيل
                                </Text>
                            </View>
                        ) : null
                    }
                />
            </View>
        </Modal>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.neutral[950],
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.md,
        paddingTop: Spacing['2xl'],
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.08)',
    },
    headerTitle: {
        fontSize: Typography.fontSize.xl,
        fontWeight: '700',
        color: Colors.text.inverse,
    },
    closeButton: { padding: Spacing.xs },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
    },
    searchContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        backgroundColor: 'rgba(255,255,255,0.06)',
        paddingHorizontal: Spacing.md,
        paddingVertical: 10,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    searchInput: {
        flex: 1,
        fontSize: Typography.fontSize.base,
        color: Colors.text.inverse,
        padding: 0,
    },
    filterBtn: {
        width: 40,
        height: 40,
        borderRadius: BorderRadius.md,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    filterBtnActive: {
        borderColor: Colors.gold[500],
        backgroundColor: 'rgba(234,179,8,0.1)',
    },
    filterCount: {
        position: 'absolute',
        top: 3,
        right: 3,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: Colors.gold[500],
        fontSize: 8,
        color: '#000',
        textAlign: 'center',
        lineHeight: 12,
        fontWeight: '700',
    },
    filtersPanel: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.07)',
        paddingVertical: Spacing.sm,
    },
    filterLabel: {
        fontSize: Typography.fontSize.xs,
        color: Colors.text.tertiary,
        marginLeft: Spacing.lg,
        marginTop: Spacing.xs,
        fontWeight: '600',
    },
    chipsRow: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: 6,
    },
    chip: {
        paddingHorizontal: Spacing.md,
        paddingVertical: 5,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        marginRight: Spacing.sm,
    },
    chipActive: {
        backgroundColor: 'rgba(234,179,8,0.15)',
        borderColor: Colors.gold[500],
    },
    chipText: {
        fontSize: Typography.fontSize.xs,
        color: Colors.text.tertiary,
    },
    chipTextActive: {
        color: Colors.gold[400],
        fontWeight: '600',
    },
    countRow: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: 4,
    },
    countText: {
        fontSize: Typography.fontSize.xs,
        color: Colors.text.tertiary,
    },
    resultsList: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },
    resultCard: {
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginTop: Spacing.sm,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
    },
    resultHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.sm,
    },
    surahName: {
        fontSize: Typography.fontSize.sm,
        fontWeight: '700',
        color: Colors.emerald[400],
    },
    ayahBadge: {
        backgroundColor: 'rgba(234,179,8,0.12)',
        paddingHorizontal: Spacing.sm,
        paddingVertical: 2,
        borderRadius: BorderRadius.base,
    },
    ayahBadgeText: {
        fontSize: 11,
        color: Colors.gold[400],
        fontWeight: '600',
    },
    ayahText: {
        fontSize: 18,
        color: Colors.text.inverse,
        lineHeight: 18 * 1.8,
        textAlign: 'right',
    },
    highlight: {
        color: Colors.gold[300],
        backgroundColor: 'rgba(234,179,8,0.2)',
        borderRadius: 2,
    },
    emptyState: {
        alignItems: 'center',
        paddingTop: 60,
        gap: Spacing.sm,
    },
    emptyText: {
        fontSize: Typography.fontSize.lg,
        color: Colors.text.secondary,
        fontWeight: '600',
    },
    emptyHint: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.tertiary,
        textAlign: 'center',
    },
});
