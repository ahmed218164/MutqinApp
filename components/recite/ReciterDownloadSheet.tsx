/**
 * components/recite/ReciterDownloadSheet.tsx
 *
 * Download Manager UI — Bottom Sheet
 *
 * Shows per-surah download progress with real-time updates.
 * Inspired by l4/i0.java (download adapter showing progress).
 *
 * Features:
 *   - Per-surah progress bars with status icons
 *   - "Download All Surahs" button
 *   - "Download Timing DB" button for gapless reciters
 *   - Cancel button while downloading
 *   - Storage used display
 */

import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Alert,
    TouchableWithoutFeedback,
} from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import {
    Download, CheckCircle, AlertCircle, X, WifiOff,
    Database, ChevronDown,
} from 'lucide-react-native';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';
import { Reciter } from '../../lib/audio-reciters';
import {
    DownloadStatus,
    downloadSurahPack,
    downloadAllSurahs,
    cancelSurahDownload,
    cancelAllDownloads,
    getSurahStatus,
} from '../../lib/audio-download-manager';
import { hasTimingDb, downloadTimingDb } from '../../lib/audio-timing-db';
import { SURAHS } from '../../constants/surahs';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Props {
    visible: boolean;
    reciter: Reciter;
    surahAyahCounts: Record<number, number>;  // surah → total ayahs
    onClose: () => void;
}

interface SurahRow {
    surah: number;
    status: DownloadStatus;
    progress: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: DownloadStatus }) {
    switch (status) {
        case 'done':
            return <CheckCircle size={16} color="#10B981" />;
        case 'error':
            return <AlertCircle size={16} color="#EF4444" />;
        case 'cancelled':
            return <X size={16} color="#6B7280" />;
        case 'downloading':
        case 'extracting':
            return <ActivityIndicator size="small" color={Colors.gold[400]} />;
        default:
            return <Download size={16} color={Colors.text.tertiary} />;
    }
}

const SHEET_HEIGHT = 560;

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReciterDownloadSheet({ visible, reciter, surahAyahCounts, onClose }: Props) {
    const translateY = useSharedValue(SHEET_HEIGHT + 40);
    const backdropOpacity = useSharedValue(0);
    const [isMounted, setIsMounted] = React.useState(visible);

    const [rows, setRows] = React.useState<SurahRow[]>([]);
    const [isDownloadingAll, setIsDownloadingAll] = React.useState(false);
    const [hasDb, setHasDb] = React.useState(false);
    const [dbDownloading, setDbDownloading] = React.useState(false);
    const [downloadedCount, setDownloadedCount] = React.useState(0);

    // ── Animation ─────────────────────────────────────────────────────────────
    React.useEffect(() => {
        if (visible) {
            setIsMounted(true);
            backdropOpacity.value = withTiming(1, { duration: 220 });
            translateY.value = withSpring(0, { damping: 20, stiffness: 160 });
        } else {
            backdropOpacity.value = withTiming(0, { duration: 180 });
            translateY.value = withSpring(SHEET_HEIGHT + 40, { damping: 20, stiffness: 160 }, () => {
                setIsMounted(false);
            });
        }
    }, [visible]);

    const sheetStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }] as any,
    }));
    const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

    // ── Load initial statuses ─────────────────────────────────────────────────
    React.useEffect(() => {
        if (!visible) return;

        async function loadStatuses() {
            const initial: SurahRow[] = Array.from({ length: 114 }, (_, i) => ({
                surah: i + 1,
                status: 'idle',
                progress: 0,
            }));
            setRows(initial);

            // Check each surah status in batches
            for (let surah = 1; surah <= 114; surah++) {
                const ayahCount = surahAyahCounts[surah] ?? 7;
                const status = await getSurahStatus(reciter, surah, ayahCount);
                setRows(prev => {
                    const next = [...prev];
                    next[surah - 1] = { surah, status, progress: status === 'done' ? 100 : 0 };
                    return next;
                });
            }

            // Check timing DB
            const dbExists = await hasTimingDb(reciter);
            setHasDb(dbExists);
        }

        loadStatuses();
    }, [visible, reciter.id]);

    // ── Download progress callback ────────────────────────────────────────────
    function onProgress(surah: number, status: DownloadStatus, progress: number) {
        setRows(prev => {
            const next = [...prev];
            next[surah - 1] = { surah, status, progress };
            if (status === 'done') {
                setDownloadedCount(c => c + 1);
            }
            return next;
        });
    }

    // ── Actions ───────────────────────────────────────────────────────────────
    async function handleDownloadAll() {
        if (isDownloadingAll) {
            cancelAllDownloads(reciter.id);
            setIsDownloadingAll(false);
            return;
        }

        setIsDownloadingAll(true);
        try {
            await downloadAllSurahs(reciter, onProgress, (done, total) => {
                setDownloadedCount(done);
            });
        } catch (e: any) {
            Alert.alert('خطأ', `فشل التنزيل: ${e?.message}`);
        } finally {
            setIsDownloadingAll(false);
        }
    }

    async function handleDownloadSurah(surah: number) {
        const row = rows[surah - 1];
        if (row.status === 'downloading' || row.status === 'extracting') {
            cancelSurahDownload(reciter.id, surah);
            return;
        }
        if (row.status === 'done') return;

        try {
            await downloadSurahPack(reciter, surah, onProgress);
        } catch (e: any) {
            Alert.alert('خطأ', `فشل تنزيل السورة ${surah}: ${e?.message}`);
        }
    }

    async function handleDownloadTimingDb() {
        if (!reciter.elmushafPath) return;
        setDbDownloading(true);
        try {
            await downloadTimingDb(reciter);
            setHasDb(true);
        } catch (e: any) {
            Alert.alert('خطأ', `فشل تنزيل قاعدة التوقيت: ${e?.message}`);
        } finally {
            setDbDownloading(false);
        }
    }

    if (!isMounted) return null;

    const doneCount = rows.filter(r => r.status === 'done').length;

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {/* Backdrop */}
            <TouchableWithoutFeedback onPress={onClose}>
                <Animated.View style={[styles.backdrop, backdropStyle]} />
            </TouchableWithoutFeedback>

            {/* Sheet */}
            <Animated.View style={[styles.sheet, sheetStyle]}>
                <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />

                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.handleBtn}>
                        <View style={styles.handle} />
                        <ChevronDown size={18} color={Colors.text.tertiary} />
                    </TouchableOpacity>

                    <Text style={styles.title}>{reciter.nameArabic}</Text>
                    <Text style={styles.subtitle}>
                        {doneCount} / 114 سورة محفوظة
                    </Text>
                </View>

                {/* Timing DB row (gapless only) */}
                {reciter.audioType === 'gapless' && (
                    <View style={styles.dbRow}>
                        <Database size={16} color={hasDb ? '#10B981' : Colors.gold[400]} />
                        <Text style={styles.dbText}>
                            {hasDb ? 'قاعدة التوقيت: متوفرة ✓' : 'قاعدة التوقيت للتشغيل المتواصل'}
                        </Text>
                        {!hasDb && (
                            <TouchableOpacity
                                style={styles.dbBtn}
                                onPress={handleDownloadTimingDb}
                                disabled={dbDownloading}
                            >
                                {dbDownloading
                                    ? <ActivityIndicator size="small" color="#fff" />
                                    : <Text style={styles.dbBtnText}>تنزيل</Text>
                                }
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* Download All button */}
                <TouchableOpacity
                    style={[styles.downloadAllBtn, isDownloadingAll && styles.cancelBtn]}
                    onPress={handleDownloadAll}
                >
                    {isDownloadingAll
                        ? <WifiOff size={16} color="#fff" />
                        : <Download size={16} color="#fff" />
                    }
                    <Text style={styles.downloadAllText}>
                        {isDownloadingAll ? 'إلغاء التنزيل' : 'تنزيل جميع السور (114)'}
                    </Text>
                </TouchableOpacity>

                {/* Surah list */}
                <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                    {rows.map(row => {
                        const surahName = SURAHS[row.surah - 1]?.name ?? `سورة ${row.surah}`;
                        const isActive = row.status === 'downloading' || row.status === 'extracting';

                        return (
                            <TouchableOpacity
                                key={row.surah}
                                style={styles.surahRow}
                                onPress={() => handleDownloadSurah(row.surah)}
                                activeOpacity={0.7}
                            >
                                {/* Surah number */}
                                <View style={styles.surahNumBadge}>
                                    <Text style={styles.surahNum}>
                                        {row.surah.toString().padStart(3, '0')}
                                    </Text>
                                </View>

                                {/* Surah name + progress */}
                                <View style={styles.surahInfo}>
                                    <Text style={styles.surahName}>{surahName}</Text>
                                    {isActive && (
                                        <View style={styles.progressBarBg}>
                                            <View
                                                style={[
                                                    styles.progressBarFill,
                                                    { width: `${row.progress}%` },
                                                ]}
                                            />
                                        </View>
                                    )}
                                    {row.status === 'extracting' && (
                                        <Text style={styles.extractingText}>جاري الاستخراج…</Text>
                                    )}
                                </View>

                                {/* Status icon + pct */}
                                <View style={styles.surahStatus}>
                                    {isActive && (
                                        <Text style={styles.progressPct}>{row.progress}%</Text>
                                    )}
                                    <StatusIcon status={row.status} />
                                </View>
                            </TouchableOpacity>
                        );
                    })}
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
        backgroundColor: 'rgba(12,17,28,0.95)',
    },
    header: {
        paddingTop: Spacing.md,
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.07)',
    },
    handleBtn: {
        alignItems: 'center',
        marginBottom: 4,
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.2)',
        marginBottom: 4,
    },
    title: {
        fontSize: Typography.fontSize.lg,
        fontWeight: '700',
        color: Colors.text.inverse,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.tertiary,
        textAlign: 'center',
        marginTop: 2,
    },
    dbRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    dbText: {
        flex: 1,
        fontSize: Typography.fontSize.sm,
        color: Colors.text.secondary,
    },
    dbBtn: {
        backgroundColor: Colors.gold[600],
        paddingHorizontal: Spacing.md,
        paddingVertical: 4,
        borderRadius: BorderRadius.md,
    },
    dbBtnText: {
        color: '#fff',
        fontSize: Typography.fontSize.xs,
        fontWeight: '600',
    },
    downloadAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
        backgroundColor: Colors.emerald[600],
        marginHorizontal: Spacing.lg,
        marginVertical: Spacing.sm,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.lg,
    },
    cancelBtn: {
        backgroundColor: '#7f1d1d',
    },
    downloadAllText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: Typography.fontSize.sm,
    },
    list: {
        flex: 1,
    },
    surahRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingVertical: 10,
        gap: Spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    surahNumBadge: {
        width: 36,
        height: 36,
        borderRadius: BorderRadius.md,
        backgroundColor: 'rgba(255,255,255,0.07)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    surahNum: {
        fontSize: 11,
        fontWeight: '600',
        color: Colors.text.tertiary,
        fontFamily: 'monospace',
    },
    surahInfo: {
        flex: 1,
        gap: 4,
    },
    surahName: {
        fontSize: Typography.fontSize.sm,
        fontWeight: '600',
        color: Colors.text.inverse,
        textAlign: 'right',
    },
    progressBarBg: {
        height: 3,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: Colors.gold[400],
        borderRadius: 2,
    },
    extractingText: {
        fontSize: 10,
        color: Colors.gold[400],
    },
    surahStatus: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    progressPct: {
        fontSize: 11,
        color: Colors.gold[400],
        fontFamily: 'monospace',
    },
});
