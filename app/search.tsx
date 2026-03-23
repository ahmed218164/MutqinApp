/**
 * app/search.tsx  —  نظام بحث متقدم في القرآن الكريم
 *
 * المميزات:
 *  ① تطبيع الهمزات وتوحيدها (أإآٱ → ا، ة → ه، ى → ي) + حذف الحركات
 *  ② فلتر بالسورة (Picker أنيق)
 *  ③ فلتر بالجزء (1-30)
 *  ④ عداد التكرارات "X مرة في Y آية"
 *  ⑤ حفظ آخر بحث في AsyncStorage
 *  ⑥ نسخ / مشاركة النتائج
 *  ⑦ تمييز النص المطابق بالأخضر مع دعم البحث بتشكيل أو بدونه
 *  ⑧ انتقال سريع للتسميع أو المصحف عند الضغط
 */

import * as React from 'react';
import {
    View, Text, TextInput, StyleSheet, FlatList,
    SafeAreaView, ActivityIndicator, TouchableOpacity,
    Modal, ScrollView, Share, Alert, Clipboard, Platform,
} from 'react-native';
import Animated, {
    FadeIn, FadeInDown, useSharedValue, withTiming, useAnimatedStyle,
} from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import {
    ArrowRight, Search as SearchIcon, X, Filter, BookOpen,
    Copy, Share2, ChevronDown, ChevronUp, Layers,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors, Typography, Spacing, BorderRadius } from '../constants/theme';
import { useAyatDB } from '../lib/SQLiteProvider';
import { searchAyat, countOccurrences, SearchOptions } from '../lib/sqlite-db';
import { SURAHS, getSurahByNumber } from '../constants/surahs';

// ─────────────────────────────────────────────────────────────────────────────
// Arabic helpers
// ─────────────────────────────────────────────────────────────────────────────

/** تطبيع النص العربي: حذف الحركات + توحيد الهمزات + ة/ه + ى/ي */
function normalizeArabic(str: string): string {
    return str
        .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // تشكيل + شدة + طولة
        .replace(/[أإآٱ]/g, 'ا')                      // توحيد الألف
        .replace(/ة/g,  'ه')                           // تاء مربوطة → هاء
        .replace(/ى/g,  'ي')                           // ألف مقصورة → ياء
        .trim();
}

/** عدد مرات ظهور keyword في text (غير متداخل) */
function countInText(text: string, keyword: string): number {
    if (!keyword) return 0;
    let count = 0;
    let idx   = 0;
    while ((idx = text.indexOf(keyword, idx)) !== -1) { count++; idx += keyword.length; }
    return count;
}

const LAST_QUERY_KEY = '@mutqin:last_search_query';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SearchResult {
    id:        number;
    sura:      number;
    aya:       number;
    page:      number;
    goza:      number;
    text:      string;
    textSearch: string;
    surahName: string;
    hits:      number; // عدد مرات الكلمة في هذه الآية
}

// ── Highlight component (memoized) ────────────────────────────────────────────────
const Highlighted = React.memo(function Highlighted(
    { text, normalizedQuery }: { text: string; normalizedQuery: string }
) {
    // Parts computed once per unique (text, normalizedQuery) pair
    const parts = React.useMemo(() => {
        if (!normalizedQuery) return [{ value: text, match: false }];
        const norm = normalizeArabic(text);
        const acc: { value: string; match: boolean }[] = [];
        let searchIdx = 0;
        let origIdx   = 0;
        while (origIdx < text.length) {
            const matchAt = norm.indexOf(normalizedQuery, searchIdx);
            if (matchAt === -1) { acc.push({ value: text.slice(origIdx), match: false }); break; }
            if (matchAt > searchIdx) {
                acc.push({ value: text.slice(origIdx, origIdx + (matchAt - searchIdx)), match: false });
                origIdx += matchAt - searchIdx;
            }
            let len = normalizedQuery.length;
            while (len < text.length - origIdx &&
                   normalizeArabic(text.slice(origIdx, origIdx + len + 1)).length <= normalizedQuery.length) {
                len++;
            }
            acc.push({ value: text.slice(origIdx, origIdx + len), match: true });
            origIdx   += len;
            searchIdx  = matchAt + normalizedQuery.length;
        }
        return acc;
    }, [text, normalizedQuery]);

    return (
        <Text style={styles.ayahText}>
            {parts.map((p, i) =>
                p.match
                    ? <Text key={i} style={styles.highlight}>{p.value}</Text>
                    : <Text key={i}>{p.value}</Text>
            )}
        </Text>
    );
});
// ─────────────────────────────────────────────────────────────────────────────
// Filter picker modal (سور + أجزاء)
// ─────────────────────────────────────────────────────────────────────────────

const JUZUK = Array.from({ length: 30 }, (_, i) => i + 1);

interface FilterModalProps {
    visible: boolean;
    suraFilter: number | null;
    juzFilter:  number | null;
    onApply: (sura: number | null, juz: number | null) => void;
    onClose: () => void;
}

function FilterModal({ visible, suraFilter, juzFilter, onApply, onClose }: FilterModalProps) {
    const [localSura, setLocalSura] = React.useState<number | null>(suraFilter);
    const [localJuz,  setLocalJuz]  = React.useState<number | null>(juzFilter);
    const [tab, setTab] = React.useState<'sura' | 'juz'>('sura');

    React.useEffect(() => {
        if (visible) {
            setLocalSura(suraFilter);
            setLocalJuz(juzFilter);
            setTab('sura');
        }
    }, [visible]);

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={filterStyles.overlay}>
                <View style={filterStyles.sheet}>
                    {/* Header */}
                    <View style={filterStyles.sheetHeader}>
                        <Text style={filterStyles.sheetTitle}>تصفية النتائج</Text>
                        <TouchableOpacity onPress={onClose} style={filterStyles.closeBtn}>
                            <X size={20} color={Colors.neutral[400]} />
                        </TouchableOpacity>
                    </View>

                    {/* Tabs */}
                    <View style={filterStyles.tabs}>
                        {(['sura', 'juz'] as const).map(t => (
                            <TouchableOpacity
                                key={t}
                                style={[filterStyles.tab, tab === t && filterStyles.tabActive]}
                                onPress={() => setTab(t)}
                            >
                                <Text style={[filterStyles.tabText, tab === t && filterStyles.tabTextActive]}>
                                    {t === 'sura' ? '📖 السورة' : '📑 الجزء'}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* List */}
                    <ScrollView style={filterStyles.list} showsVerticalScrollIndicator={false}>
                        {/* كل الخيارات */}
                        <TouchableOpacity
                            style={[
                                filterStyles.item,
                                (tab === 'sura' ? localSura === null : localJuz === null) && filterStyles.itemActive,
                            ]}
                            onPress={() => tab === 'sura' ? setLocalSura(null) : setLocalJuz(null)}
                        >
                            <Text style={filterStyles.itemText}>الكل</Text>
                        </TouchableOpacity>

                        {tab === 'sura'
                            ? SURAHS.map(s => (
                                <TouchableOpacity
                                    key={s.number}
                                    style={[filterStyles.item, localSura === s.number && filterStyles.itemActive]}
                                    onPress={() => setLocalSura(localSura === s.number ? null : s.number)}
                                >
                                    <Text style={filterStyles.itemNumber}>{s.number}</Text>
                                    <Text style={filterStyles.itemText}>{s.name}</Text>
                                    <Text style={filterStyles.itemSub}>{s.transliteration}</Text>
                                </TouchableOpacity>
                            ))
                            : JUZUK.map(j => (
                                <TouchableOpacity
                                    key={j}
                                    style={[filterStyles.item, localJuz === j && filterStyles.itemActive]}
                                    onPress={() => setLocalJuz(localJuz === j ? null : j)}
                                >
                                    <Text style={filterStyles.itemText}>الجزء {j}</Text>
                                </TouchableOpacity>
                            ))
                        }
                    </ScrollView>

                    {/* Actions */}
                    <View style={filterStyles.actions}>
                        <TouchableOpacity
                            style={filterStyles.resetBtn}
                            onPress={() => { setLocalSura(null); setLocalJuz(null); }}
                        >
                            <Text style={filterStyles.resetText}>إعادة تعيين</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={filterStyles.applyBtn}
                            onPress={() => { onApply(localSura, localJuz); onClose(); }}
                        >
                            <LinearGradient
                                colors={['#059669', '#047857']}
                                style={filterStyles.applyGrad}
                            >
                                <Text style={filterStyles.applyText}>تطبيق</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────

// ── Memoized search result card ──────────────────────────────────────────────
// KEY PERFORMANCE FIX: By extracting into React.memo, FlatList only re-renders
// the specific item that changed, not all 60 items at once.
interface SearchResultItemProps {
    item: SearchResult;
    normalizedQuery: string;
    onPress: (item: SearchResult) => void;
}

const SearchResultItem = React.memo(function SearchResultItem(
    { item, normalizedQuery, onPress }: SearchResultItemProps
) {
    return (
        <TouchableOpacity
            style={styles.resultCard}
            onPress={() => onPress(item)}
            activeOpacity={0.75}
        >
            {/* Meta row */}
            <View style={styles.resultMeta}>
                <View style={styles.surahBadge}>
                    <BookOpen size={11} color={Colors.emerald[400]} />
                    <Text style={styles.surahLabel}>{item.surahName}</Text>
                </View>
                <View style={styles.rightMeta}>
                    {item.hits > 1 && (
                        <View style={styles.hitsBadge}>
                            <Text style={styles.hitsText}>{item.hits}×</Text>
                        </View>
                    )}
                    <Text style={styles.pageBadge}>آية {item.aya} • ص {item.page}</Text>
                </View>
            </View>

            {/* Ayah text with highlighting */}
            <Highlighted text={item.text} normalizedQuery={normalizedQuery} />

            {/* Juz chip */}
            <Text style={styles.juzChip}>الجزء {item.goza}</Text>
        </TouchableOpacity>
    );
});

export default function SearchScreen() {
    const router  = useRouter();
    const db      = useAyatDB();

    const [query,      setQuery]      = React.useState('');
    const [results,    setResults]    = React.useState<SearchResult[]>([]);
    const [searching,  setSearching]  = React.useState(false);
    const [totalHits,  setTotalHits]  = React.useState(0);
    const [suraFilter, setSuraFilter] = React.useState<number | null>(null);
    const [juzFilter,  setJuzFilter]  = React.useState<number | null>(null);
    const [showFilter, setShowFilter] = React.useState(false);

    const inputRef     = React.useRef<TextInput>(null);
    const debounceRef  = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // ── حمّل آخر بحث عند الفتح ──────────────────────────────────────────────
    React.useEffect(() => {
        (async () => {
            try {
                const saved = await AsyncStorage.getItem(LAST_QUERY_KEY);
                if (saved && saved.trim().length >= 2) {
                    setQuery(saved);
                } else {
                    setTimeout(() => inputRef.current?.focus(), 200);
                }
            } catch {
                setTimeout(() => inputRef.current?.focus(), 200);
            }
        })();
    }, []);

    // ── بحث مع debounce ─────────────────────────────────────────────────────
    React.useEffect(() => {
        clearTimeout(debounceRef.current);
        const trimmed = query.trim();
        if (trimmed.length < 2) {
            setResults([]);
            setTotalHits(0);
            return;
        }
        setSearching(true);
        debounceRef.current = setTimeout(async () => {
            try {
                const normalized = normalizeArabic(trimmed);
                const opts: SearchOptions = {
                    suraFilter: suraFilter ?? undefined,
                    juzFilter:  juzFilter  ?? undefined,
                    limit: 60,
                };

                const rows = searchAyat(db, normalized, opts);
                const totalCount = countOccurrences(db, normalized, {
                    suraFilter: opts.suraFilter,
                    juzFilter:  opts.juzFilter,
                });

                const mapped: SearchResult[] = rows.map(row => ({
                    id:        row.id,
                    sura:      row.sura,
                    aya:       row.aya,
                    page:      row.page,
                    goza:      row.goza,
                    text:      row.text ?? '',
                    textSearch: row.text_search ?? '',
                    surahName: getSurahByNumber(row.sura)?.name ?? `سورة ${row.sura}`,
                    hits:      countInText(row.text_search ?? '', normalized),
                }));

                setResults(mapped);
                setTotalHits(totalCount);

                // احفظ آخر بحث
                await AsyncStorage.setItem(LAST_QUERY_KEY, trimmed);
            } catch (err) {
                console.error('[Search]', err);
                setResults([]);
                setTotalHits(0);
            } finally {
                setSearching(false);
            }
        }, 350);
        return () => clearTimeout(debounceRef.current);
    }, [query, suraFilter, juzFilter]);

    // ── إجراءات ──────────────────────────────────────────────────────────────

    function handleResultPress(item: SearchResult) {
        router.push({
            pathname: '/recite',
            params: {
                surahNumber: item.sura.toString(),
                surahName:   item.surahName,
                fromAyah:    item.aya.toString(),
                toAyah:      item.aya.toString(),
            },
        });
    }

    async function handleShare() {
        if (results.length === 0) return;
        const lines = results.map(r =>
            `[${r.surahName}: ${r.aya}] ${r.text}\n`
        ).join('\n');
        const body = `نتائج البحث عن: "${query}"\n${totalHits} مرة في ${results.length} آية\n\n${lines}\n— تطبيق مُتقِن`;
        await Share.share({ message: body, title: `بحث: ${query}` });
    }

    function handleCopy() {
        const lines = results.map(r => `[${r.surahName}: ${r.aya}] ${r.text}`).join('\n');
        Clipboard.setString(lines);
        Alert.alert('✅ تم النسخ', `تم نسخ ${results.length} آية`);
    }

    const hasFilters = suraFilter !== null || juzFilter !== null;
    const normalizedQuery = normalizeArabic(query.trim());
    const activeFilterLabel = [
        suraFilter !== null ? getSurahByNumber(suraFilter)?.name : null,
        juzFilter  !== null ? `الجزء ${juzFilter}` : null,
    ].filter(Boolean).join(' • ');

    // renderItem — useCallback prevents recreation on every parent render.
    // SearchResultItem is React.memo, so only re-renders when its own props change.
    const renderItem = React.useCallback(
        ({ item }: { item: SearchResult }) => (
            <SearchResultItem
                item={item}
                normalizedQuery={normalizedQuery}
                onPress={handleResultPress}
            />
        ),
        [normalizedQuery] // recreates only when query changes (whole list replaces anyway)
    );


    // ─────────────────────────────────────────────────────────────────────────
    // JSX
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <SafeAreaView style={styles.container}>
            {/* ── Header ──────────────────────────────────────────────── */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <ArrowRight color={Colors.neutral[200]} size={22} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>البحث في القرآن</Text>
                {results.length > 0 && (
                    <View style={styles.headerActions}>
                        <TouchableOpacity onPress={handleCopy} style={styles.iconBtn}>
                            <Copy size={17} color={Colors.neutral[400]} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleShare} style={styles.iconBtn}>
                            <Share2 size={17} color={Colors.neutral[400]} />
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {/* ── Search bar ───────────────────────────────────────────── */}
            <View style={styles.searchRow}>
                <View style={styles.searchBar}>
                    <SearchIcon color={Colors.neutral[400]} size={18} />
                    <TextInput
                        ref={inputRef}
                        style={styles.input}
                        placeholder="ابحث عن كلمة أو آية..."
                        placeholderTextColor={Colors.neutral[500]}
                        value={query}
                        onChangeText={setQuery}
                        returnKeyType="search"
                        textAlign="right"
                        autoCorrect={false}
                    />
                    {query.length > 0 && (
                        <TouchableOpacity
                            onPress={() => { setQuery(''); setResults([]); setTotalHits(0); }}
                        >
                            <X color={Colors.neutral[400]} size={16} />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Filter button */}
                <TouchableOpacity
                    style={[styles.filterBtn, hasFilters && styles.filterBtnActive]}
                    onPress={() => setShowFilter(true)}
                >
                    <Filter size={18} color={hasFilters ? Colors.emerald[400] : Colors.neutral[400]} />
                    {hasFilters && <View style={styles.filterDot} />}
                </TouchableOpacity>
            </View>

            {/* ── Active filter chip ───────────────────────────────────── */}
            {hasFilters && (
                <Animated.View entering={FadeIn} style={styles.activeFilterRow}>
                    <Text style={styles.activeFilterText}>{activeFilterLabel}</Text>
                    <TouchableOpacity
                        onPress={() => { setSuraFilter(null); setJuzFilter(null); }}
                        style={styles.clearFilterBtn}
                    >
                        <X size={12} color={Colors.emerald[300]} />
                    </TouchableOpacity>
                </Animated.View>
            )}

            {/* ── Results stats bar ────────────────────────────────────── */}
            {results.length > 0 && !searching && (
                <Animated.View entering={FadeIn} style={styles.statsBar}>
                    <Text style={styles.statsText}>
                        <Text style={styles.statsHighlight}>{query}</Text>
                        {' — '}
                        <Text style={styles.statsHighlight}>{totalHits}</Text>
                        {' مرة في '}
                        <Text style={styles.statsHighlight}>{results.length}</Text>
                        {' آية'}
                        {results.length === 60 ? ' (أُظهرت أول 60)' : ''}
                    </Text>
                </Animated.View>
            )}

            {/* ── Content ──────────────────────────────────────────────── */}
            {searching ? (
                <View style={styles.center}>
                    <ActivityIndicator color={Colors.emerald[400]} size="large" />
                    <Text style={styles.hint}>جارٍ البحث...</Text>
                </View>
            ) : query.trim().length >= 2 && results.length === 0 ? (
                <View style={styles.center}>
                    <Text style={{ fontSize: 40 }}>🔍</Text>
                    <Text style={styles.noResult}>لا توجد نتائج لـ «{query}»</Text>
                    {hasFilters && (
                        <TouchableOpacity onPress={() => { setSuraFilter(null); setJuzFilter(null); }}>
                            <Text style={styles.clearHint}>جرّب إزالة الفلاتر</Text>
                        </TouchableOpacity>
                    )}
                </View>
            ) : query.trim().length < 2 && query.trim().length > 0 ? (
                <View style={styles.center}>
                    <Text style={styles.hint}>اكتب حرفين على الأقل للبحث</Text>
                </View>
            ) : query.trim().length === 0 ? (
                <View style={styles.center}>
                    <Text style={{ fontSize: 48, marginBottom: Spacing.md }}>📖</Text>
                    <Text style={styles.hint}>ابحث في القرآن الكريم</Text>
                    <Text style={[styles.hint, { fontSize: 11, marginTop: 6 }]}>
                        يمكنك الكتابة بالتشكيل أو بدونه
                    </Text>
                </View>
            ) : (
                <View style={{ flex: 1 }}>
                    <FlashList
                        data={results}
                        keyExtractor={item => item.id.toString()}
                        renderItem={renderItem}
                        contentContainerStyle={styles.list}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                        estimatedItemSize={130}
                    />
                </View>
            )}

            {/* ── Filter Modal ─────────────────────────────────────────── */}
            <FilterModal
                visible={showFilter}
                suraFilter={suraFilter}
                juzFilter={juzFilter}
                onApply={(s, j) => { setSuraFilter(s); setJuzFilter(j); }}
                onClose={() => setShowFilter(false)}
            />
        </SafeAreaView>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#080d18',
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingTop: Platform.OS === 'android' ? Spacing.xl : Spacing.sm,
        paddingBottom: Spacing.sm,
        gap: Spacing.sm,
    },
    backBtn: { padding: Spacing.sm },
    headerTitle: {
        flex: 1,
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.neutral[100],
        textAlign: 'right',
        fontFamily: 'NotoNaskhArabic_700Bold',
    },
    headerActions: {
        flexDirection: 'row',
        gap: 6,
    },
    iconBtn: {
        padding: 8,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 10,
    },

    // Search bar row
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: Spacing.lg,
        marginBottom: Spacing.sm,
        gap: Spacing.sm,
    },
    searchBar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        backgroundColor: '#151e2e',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.xl,
        borderWidth: 1,
        borderColor: 'rgba(16,185,129,0.25)',
    },
    input: {
        flex: 1,
        fontSize: Typography.fontSize.base,
        color: Colors.neutral[100],
        fontFamily: 'NotoNaskhArabic_400Regular',
        paddingVertical: 4,
    },
    filterBtn: {
        width: 46,
        height: 46,
        backgroundColor: '#151e2e',
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    filterBtnActive: {
        borderColor: Colors.emerald[500],
        backgroundColor: 'rgba(16,185,129,0.12)',
    },
    filterDot: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: Colors.emerald[400],
    },

    // Active filter chip
    activeFilterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: Spacing.lg,
        marginBottom: Spacing.sm,
        backgroundColor: 'rgba(16,185,129,0.1)',
        borderRadius: BorderRadius.full,
        paddingHorizontal: Spacing.md,
        paddingVertical: 5,
        borderWidth: 1,
        borderColor: 'rgba(16,185,129,0.3)',
        alignSelf: 'flex-start',
        gap: Spacing.xs,
    },
    activeFilterText: {
        fontSize: Typography.fontSize.sm,
        color: Colors.emerald[300],
        fontFamily: 'NotoNaskhArabic_400Regular',
    },
    clearFilterBtn: { padding: 2 },

    // Stats bar
    statsBar: {
        marginHorizontal: Spacing.lg,
        marginBottom: Spacing.sm,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: BorderRadius.lg,
        paddingHorizontal: Spacing.md,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    statsText: {
        fontSize: Typography.fontSize.sm,
        color: Colors.neutral[400],
        textAlign: 'right',
        fontFamily: 'NotoNaskhArabic_400Regular',
    },
    statsHighlight: {
        color: Colors.emerald[300],
        fontWeight: Typography.fontWeight.bold,
    },

    // Result card
    list: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: 120,
    },
    resultCard: {
        backgroundColor: '#111827',
        borderRadius: BorderRadius.xl,
        padding: Spacing.md,
        marginBottom: Spacing.sm,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        gap: Spacing.xs,
        // subtle glow on bottom border
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
    },
    resultMeta: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    surahBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(16,185,129,0.12)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: BorderRadius.full,
    },
    surahLabel: {
        fontSize: 11,
        color: Colors.emerald[400],
        fontWeight: '700',
        fontFamily: 'NotoNaskhArabic_700Bold',
    },
    rightMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    hitsBadge: {
        backgroundColor: 'rgba(251,191,36,0.15)',
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    hitsText: {
        fontSize: 10,
        color: '#fbbf24',
        fontWeight: '700',
    },
    pageBadge: {
        fontSize: 10,
        color: Colors.neutral[500],
    },
    ayahText: {
        fontSize: Typography.fontSize.base,
        color: Colors.neutral[200],
        fontFamily: 'NotoNaskhArabic_400Regular',
        textAlign: 'right',
        lineHeight: 30,
    },
    highlight: {
        backgroundColor: 'rgba(16,185,129,0.22)',
        color: '#6ee7b7',
        fontWeight: '700',
        borderRadius: 3,
    },
    juzChip: {
        fontSize: 10,
        color: Colors.neutral[600],
        textAlign: 'right',
        marginTop: 2,
    },

    // Empty / states
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
    },
    hint: {
        fontSize: Typography.fontSize.sm,
        color: Colors.neutral[500],
        fontFamily: 'NotoNaskhArabic_400Regular',
        textAlign: 'center',
    },
    noResult: {
        fontSize: Typography.fontSize.base,
        color: Colors.neutral[400],
        fontFamily: 'NotoNaskhArabic_400Regular',
        textAlign: 'center',
    },
    clearHint: {
        fontSize: Typography.fontSize.sm,
        color: Colors.emerald[400],
        textDecorationLine: 'underline',
        marginTop: 4,
    },
});

// ─────────────────────────────────────────────────────────────────────────────
// Filter modal styles
// ─────────────────────────────────────────────────────────────────────────────

const filterStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#111827',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '80%',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    sheetHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.lg,
        paddingBottom: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    sheetTitle: {
        fontSize: Typography.fontSize.lg,
        fontWeight: '700',
        color: Colors.neutral[100],
        fontFamily: 'NotoNaskhArabic_700Bold',
    },
    closeBtn: { padding: 4 },
    tabs: {
        flexDirection: 'row',
        marginHorizontal: Spacing.lg,
        marginVertical: Spacing.md,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: BorderRadius.lg,
        padding: 4,
        gap: 4,
    },
    tab: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: BorderRadius.md,
    },
    tabActive: {
        backgroundColor: Colors.emerald[700],
    },
    tabText: {
        fontSize: Typography.fontSize.sm,
        color: Colors.neutral[400],
        fontFamily: 'NotoNaskhArabic_400Regular',
    },
    tabTextActive: { color: '#fff', fontWeight: '700' },
    list: { paddingHorizontal: Spacing.lg, maxHeight: 380 },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: BorderRadius.lg,
        marginBottom: 4,
        gap: 8,
    },
    itemActive: { backgroundColor: 'rgba(16,185,129,0.15)' },
    itemNumber: {
        fontSize: 11,
        color: Colors.neutral[500],
        width: 22,
        textAlign: 'center',
    },
    itemText: {
        flex: 1,
        fontSize: Typography.fontSize.base,
        color: Colors.neutral[200],
        fontFamily: 'NotoNaskhArabic_400Regular',
        textAlign: 'right',
    },
    itemSub: {
        fontSize: 10,
        color: Colors.neutral[600],
    },
    actions: {
        flexDirection: 'row',
        gap: Spacing.md,
        padding: Spacing.lg,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
    },
    resetBtn: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    resetText: {
        color: Colors.neutral[400],
        fontSize: Typography.fontSize.sm,
        fontFamily: 'NotoNaskhArabic_400Regular',
    },
    applyBtn: {
        flex: 1,
        borderRadius: BorderRadius.lg,
        overflow: 'hidden',
    },
    applyGrad: {
        paddingVertical: 12,
        alignItems: 'center',
    },
    applyText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: Typography.fontSize.sm,
        fontFamily: 'NotoNaskhArabic_700Bold',
    },
});
