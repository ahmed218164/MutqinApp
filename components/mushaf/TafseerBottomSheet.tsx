/**
 * components/mushaf/TafseerBottomSheet.tsx
 *
 * Multi-Source Tafsir Bottom Sheet
 *
 * Features (mirrors q4/z0.java — Tafsir Controller):
 *   - Source switcher tabs: Muyassar / Jalalayn / Tabari / Saadi
 *   - Download button per source when .db not available
 *   - Page-sync: shows all ayahs on the current page sequentially
 *   - Single ayah mode: show just one ayah's tafsir (from long-press)
 *   - All UI strings in Arabic
 */

import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    TouchableWithoutFeedback,
    ActivityIndicator,
    Alert,
} from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    runOnJS,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { X, BookOpen, Download, ChevronDown } from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import {
    TAFSIR_SOURCES,
    TafsirEntry,
    type TafsirSource,
    getAyahTafsir,
    getPageTafsir,
    hasTafsirDb,
    downloadTafsirDb,
    cancelTafsirDownload,
    getActiveTafsirSourceId,
    setActiveTafsirSourceId,
} from '../../lib/tafsir-engine';
import { SURAHS } from '../../constants/surahs';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TafsirAyahRef {
    surah: number;
    ayah: number;
}

interface TafseerBottomSheetProps {
    visible: boolean;
    onClose: () => void;
    /** Single ayah mode (from long-press) */
    targetAyah?: TafsirAyahRef | null;
    /** Page mode: all ayahs on the current Mushaf page */
    pageAyahs?: TafsirAyahRef[];
}

const SHEET_HEIGHT = 520;

// ── Component ─────────────────────────────────────────────────────────────────

export default function TafseerBottomSheet({
    visible,
    onClose,
    targetAyah,
    pageAyahs,
}: TafseerBottomSheetProps) {
    const translateY = useSharedValue(SHEET_HEIGHT + 40);
    const backdropOpacity = useSharedValue(0);
    const [isMounted, setIsMounted] = React.useState(visible);

    const [activeSourceId, setActiveSourceId] = React.useState(getActiveTafsirSourceId);
    const [sourceStatus, setSourceStatus] = React.useState<Record<string, boolean>>({});
    const [downloading, setDownloading] = React.useState<Record<string, number>>({});  // sourceId → pct
    const [entries, setEntries] = React.useState<TafsirEntry[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);

    // ── Animation ─────────────────────────────────────────────────────────────
    React.useEffect(() => {
        if (visible) {
            setIsMounted(true);
            backdropOpacity.value = withTiming(1, { duration: 220 });
            translateY.value = withSpring(0, { damping: 20, stiffness: 160 });
        } else {
            backdropOpacity.value = withTiming(0, { duration: 180 });
            translateY.value = withSpring(SHEET_HEIGHT + 40, { damping: 20, stiffness: 160 }, (finished) => {
                if (finished) {
                    runOnJS(setIsMounted)(false);
                }
            });
        }
    }, [visible]);

    const sheetStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }] as any,
    }));
    const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

    // ── Load source statuses ──────────────────────────────────────────────────
    React.useEffect(() => {
        if (!visible) return;
        async function loadStatus() {
            const status: Record<string, boolean> = {};
            for (const s of TAFSIR_SOURCES) {
                status[s.id] = await hasTafsirDb(s.id);
            }
            setSourceStatus(status);
        }
        loadStatus();
    }, [visible]);

    // ── Load tafsir when source or ayah changes ───────────────────────────────
    React.useEffect(() => {
        if (!visible) return;
        if (!sourceStatus[activeSourceId]) { setEntries([]); return; }

        setIsLoading(true);
        async function load() {
            try {
                if (targetAyah) {
                    const entry = await getAyahTafsir(activeSourceId, targetAyah.surah, targetAyah.ayah);
                    setEntries(entry ? [entry] : []);
                } else if (pageAyahs?.length) {
                    const list = await getPageTafsir(activeSourceId, pageAyahs);
                    setEntries(list);
                } else {
                    setEntries([]);
                }
            } finally {
                setIsLoading(false);
            }
        }
        load();
    }, [visible, activeSourceId, targetAyah, pageAyahs, sourceStatus]);

    // ── Source switch ─────────────────────────────────────────────────────────
    function switchSource(id: string) {
        setActiveSourceId(id);
        setActiveTafsirSourceId(id);
    }

    // ── Download ──────────────────────────────────────────────────────────────
    async function handleDownload(source: TafsirSource) {
        setDownloading(d => ({ ...d, [source.id]: 0 }));
        try {
            await downloadTafsirDb(source.id, pct => {
                setDownloading(d => ({ ...d, [source.id]: pct }));
            });
            setSourceStatus(s => ({ ...s, [source.id]: true }));
        } catch (e: any) {
            Alert.alert('خطأ', `فشل تحميل التفسير: ${e?.message}`);
        } finally {
            setDownloading(d => { const n = { ...d }; delete n[source.id]; return n; });
        }
    }

    function handleCancelDownload(sourceId: string) {
        cancelTafsirDownload(sourceId);
        setDownloading(d => { const n = { ...d }; delete n[sourceId]; return n; });
    }

    if (!isMounted) return null;

    const activeSource = TAFSIR_SOURCES.find(s => s.id === activeSourceId);
    const isSourceAvailable = sourceStatus[activeSourceId];
    const isSourceDownloading = downloading[activeSourceId] !== undefined;

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {/* Backdrop */}
            <TouchableWithoutFeedback onPress={onClose}>
                <Animated.View style={[styles.backdrop, backdropStyle]} />
            </TouchableWithoutFeedback>

            {/* Sheet */}
            <Animated.View style={[styles.sheet, sheetStyle]}>
                <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />

                {/* Handle + Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.handleWrap}>
                        <View style={styles.handle} />
                        <ChevronDown size={16} color={Colors.text.tertiary} />
                    </TouchableOpacity>
                    <View style={styles.titleRow}>
                        <BookOpen size={18} color={Colors.gold[400]} />
                        <Text style={styles.headerTitle}>
                            {targetAyah
                                ? `تفسير آية ${targetAyah.surah}:${targetAyah.ayah}`
                                : 'تفسير الصفحة'}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <X size={18} color={Colors.text.tertiary} />
                    </TouchableOpacity>
                </View>

                {/* Source Tabs */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.tabsScroll}
                    contentContainerStyle={styles.tabsContent}
                >
                    {TAFSIR_SOURCES.map(source => {
                        const isActive = source.id === activeSourceId;
                        const hasDb = sourceStatus[source.id];
                        return (
                            <TouchableOpacity
                                key={source.id}
                                style={[styles.tab, isActive && styles.tabActive]}
                                onPress={() => switchSource(source.id)}
                            >
                                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                                    {source.nameAr}
                                </Text>
                                {!hasDb && (
                                    <View style={styles.tabDot} />
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                {/* Download CTA (if source not available) */}
                {!isSourceAvailable && !isSourceDownloading && (
                    <TouchableOpacity
                        style={styles.downloadCta}
                        onPress={() => activeSource && handleDownload(activeSource)}
                    >
                        <Download size={16} color="#fff" />
                        <Text style={styles.downloadCtaText}>
                            تنزيل {activeSource?.nameAr} ({activeSource?.sizeMb} MB)
                        </Text>
                    </TouchableOpacity>
                )}

                {/* Download Progress */}
                {isSourceDownloading && (
                    <View style={styles.downloadProgress}>
                        <View style={[styles.downloadBar, { width: `${downloading[activeSourceId]}%` }]} />
                        <TouchableOpacity
                            onPress={() => handleCancelDownload(activeSourceId)}
                            style={styles.cancelDownloadBtn}
                        >
                            <Text style={styles.cancelDownloadText}>
                                جاري التنزيل {downloading[activeSourceId]}%  ·  إلغاء
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Content */}
                <ScrollView
                    style={styles.content}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.contentContainer}
                >
                    {isLoading ? (
                        <ActivityIndicator color={Colors.gold[400]} style={{ marginTop: 40 }} />
                    ) : !isSourceAvailable ? (
                        <Text style={styles.unavailableText}>
                            قم بتنزيل هذا التفسير للاستفادة منه بدون إنترنت
                        </Text>
                    ) : entries.length === 0 ? (
                        <Text style={styles.unavailableText}>
                            لا يوجد تفسير لهذه الآية في قاعدة البيانات
                        </Text>
                    ) : (
                        entries.map((entry, idx) => {
                            const surahName = SURAHS[entry.surah - 1]?.name ?? `سورة ${entry.surah}`;
                            return (
                                <View key={`${entry.surah}-${entry.ayah}`} style={styles.entryBlock}>
                                    {/* Reference badge */}
                                    <View style={styles.refBadge}>
                                        <Text style={styles.refText}>{surahName} · آية {entry.ayah}</Text>
                                    </View>
                                    {/* Tafsir text */}
                                    <Text style={styles.tafsirText}>{entry.text}</Text>
                                    {idx < entries.length - 1 && <View style={styles.divider} />}
                                </View>
                            );
                        })
                    )}
                </ScrollView>
            </Animated.View>
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    sheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: SHEET_HEIGHT,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
        backgroundColor: 'rgba(10,14,24,0.96)',
    },
    header: {
        paddingTop: Spacing.md,
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.07)',
    },
    handleWrap: {
        alignItems: 'center',
        marginBottom: 4,
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.2)',
        marginBottom: 2,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
    },
    headerTitle: {
        fontSize: Typography.fontSize.base,
        fontWeight: '700',
        color: Colors.text.inverse,
    },
    closeBtn: {
        position: 'absolute',
        right: Spacing.lg,
        top: Spacing.md,
        padding: 4,
    },
    tabsScroll: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.07)',
    },
    tabsContent: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        gap: Spacing.sm,
    },
    tab: {
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255,255,255,0.04)',
        position: 'relative',
    },
    tabActive: {
        borderColor: Colors.gold[500],
        backgroundColor: 'rgba(234,179,8,0.15)',
    },
    tabText: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.tertiary,
    },
    tabTextActive: {
        color: Colors.gold[400],
        fontWeight: '700',
    },
    tabDot: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: Colors.emerald[500],
    },
    downloadCta: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
        margin: Spacing.md,
        padding: Spacing.md,
        backgroundColor: Colors.emerald[700],
        borderRadius: BorderRadius.lg,
    },
    downloadCtaText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: Typography.fontSize.sm,
    },
    downloadProgress: {
        margin: Spacing.md,
        height: 36,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: BorderRadius.md,
        overflow: 'hidden',
        position: 'relative',
    },
    downloadBar: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        backgroundColor: Colors.gold[700],
        borderRadius: BorderRadius.md,
    },
    cancelDownloadBtn: {
        position: 'absolute',
        inset: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelDownloadText: {
        color: Colors.text.inverse,
        fontSize: Typography.fontSize.xs,
        fontWeight: '600',
    },
    content: { flex: 1 },
    contentContainer: {
        padding: Spacing.lg,
        paddingBottom: 40,
    },
    entryBlock: {
        marginBottom: Spacing.lg,
    },
    refBadge: {
        alignSelf: 'flex-end',
        backgroundColor: 'rgba(234,179,8,0.1)',
        borderLeftWidth: 3,
        borderLeftColor: Colors.gold[500],
        paddingHorizontal: Spacing.md,
        paddingVertical: 4,
        borderRadius: BorderRadius.base,
        marginBottom: Spacing.sm,
    },
    refText: {
        fontSize: Typography.fontSize.sm,
        color: Colors.gold[400],
        fontWeight: '600',
    },
    tafsirText: {
        fontSize: Typography.fontSize.base,
        color: Colors.text.secondary,
        lineHeight: Typography.fontSize.base * 1.85,
        textAlign: 'right',
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.07)',
        marginTop: Spacing.lg,
    },
    unavailableText: {
        fontSize: Typography.fontSize.base,
        color: Colors.text.tertiary,
        textAlign: 'center',
        marginTop: 40,
        lineHeight: 26,
    },
});
