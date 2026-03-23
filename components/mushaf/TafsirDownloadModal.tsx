/**
 * components/mushaf/TafsirDownloadModal.tsx
 *
 * Tafsir Download Manager
 *
 * Lists all 4 tafsir sources with download/delete controls.
 * Mirrors TafsirDownloadActivity.java logic.
 *
 * Storage: {DocumentDirectory}/tafsir/{filename}.db
 */

import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    ScrollView,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { Download, Trash2, Check, X, Database } from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import {
    TAFSIR_SOURCES,
    type TafsirSource,
    hasTafsirDb,
    downloadTafsirDb,
    cancelTafsirDownload,
    deleteTafsirDb,
} from '../../lib/tafsir-engine';

interface TafsirDownloadModalProps {
    visible: boolean;
    onClose: () => void;
}

export default function TafsirDownloadModal({ visible, onClose }: TafsirDownloadModalProps) {
    const [sourceStatus, setSourceStatus] = React.useState<Record<string, boolean>>({});
    const [downloading, setDownloading] = React.useState<Record<string, number>>({});

    // Load statuses on open
    React.useEffect(() => {
        if (!visible) return;
        async function load() {
            const status: Record<string, boolean> = {};
            for (const s of TAFSIR_SOURCES) {
                status[s.id] = await hasTafsirDb(s.id);
            }
            setSourceStatus(status);
        }
        load();
    }, [visible]);

    async function handleDownload(source: TafsirSource) {
        setDownloading(d => ({ ...d, [source.id]: 0 }));
        try {
            await downloadTafsirDb(source.id, pct => {
                setDownloading(d => ({ ...d, [source.id]: pct }));
            });
            setSourceStatus(s => ({ ...s, [source.id]: true }));
        } catch (e: any) {
            Alert.alert('خطأ في التنزيل', e?.message ?? 'فشل التنزيل. تحقق من الاتصال بالإنترنت.');
        } finally {
            setDownloading(d => { const n = { ...d }; delete n[source.id]; return n; });
        }
    }

    function handleCancel(source: TafsirSource) {
        cancelTafsirDownload(source.id);
        setDownloading(d => { const n = { ...d }; delete n[source.id]; return n; });
    }

    async function handleDelete(source: TafsirSource) {
        Alert.alert(
            'حذف التفسير',
            `هل تريد حذف ${source.nameAr}؟`,
            [
                { text: 'إلغاء', style: 'cancel' },
                {
                    text: 'حذف', style: 'destructive', onPress: async () => {
                        await deleteTafsirDb(source.id);
                        setSourceStatus(s => ({ ...s, [source.id]: false }));
                    }
                },
            ]
        );
    }

    const none = Object.keys(downloading).length === 0;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={onClose}
        >
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <Database size={20} color={Colors.gold[400]} />
                    <Text style={styles.headerTitle}>تنزيل كتب التفسير</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <X size={20} color={Colors.text.tertiary} />
                    </TouchableOpacity>
                </View>

                <Text style={styles.intro}>
                    تُخزَّن كتب التفسير في ذاكرة الجهاز وتعمل بدون اتصال بالإنترنت.
                </Text>

                <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                    {TAFSIR_SOURCES.map(source => {
                        const isDownloaded = sourceStatus[source.id];
                        const isDownloading = downloading[source.id] !== undefined;
                        const pct = downloading[source.id] ?? 0;

                        return (
                            <View key={source.id} style={styles.sourceCard}>
                                {/* Source info */}
                                <View style={styles.sourceInfo}>
                                    <Text style={styles.sourceNameAr}>{source.nameAr}</Text>
                                    <Text style={styles.sourceDetails}>
                                        {source.nameEn}  ·  {source.sizeMb} MB
                                    </Text>
                                </View>

                                {/* Action area */}
                                <View style={styles.actions}>
                                    {isDownloaded && !isDownloading ? (
                                        <>
                                            <View style={styles.doneChip}>
                                                <Check size={12} color="#fff" />
                                                <Text style={styles.doneText}>تم</Text>
                                            </View>
                                            <TouchableOpacity
                                                onPress={() => handleDelete(source)}
                                                style={styles.deleteBtn}
                                            >
                                                <Trash2 size={16} color={Colors.error} />
                                            </TouchableOpacity>
                                        </>
                                    ) : isDownloading ? (
                                        <TouchableOpacity
                                            style={styles.cancelBtn}
                                            onPress={() => handleCancel(source)}
                                        >
                                            <ActivityIndicator size="small" color={Colors.gold[400]} />
                                            <Text style={styles.cancelText}>{pct}%</Text>
                                        </TouchableOpacity>
                                    ) : (
                                        <TouchableOpacity
                                            style={styles.downloadBtn}
                                            onPress={() => handleDownload(source)}
                                        >
                                            <Download size={14} color="#fff" />
                                            <Text style={styles.downloadBtnText}>تنزيل</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>

                                {/* Progress bar */}
                                {isDownloading && (
                                    <View style={styles.progressBg}>
                                        <View style={[styles.progressFill, { width: `${pct}%` }]} />
                                    </View>
                                )}
                            </View>
                        );
                    })}
                </ScrollView>

                {/* Download All */}
                {none && Object.values(sourceStatus).some(v => !v) && (
                    <TouchableOpacity
                        style={styles.downloadAllBtn}
                        onPress={() => {
                            TAFSIR_SOURCES
                                .filter(s => !sourceStatus[s.id])
                                .forEach(s => handleDownload(s));
                        }}
                    >
                        <Download size={16} color="#fff" />
                        <Text style={styles.downloadAllText}>تنزيل الكل</Text>
                    </TouchableOpacity>
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.neutral[950],
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.lg,
        paddingTop: Spacing['2xl'],
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.08)',
    },
    headerTitle: {
        flex: 1,
        fontSize: Typography.fontSize.lg,
        fontWeight: '700',
        color: Colors.text.inverse,
    },
    closeBtn: { padding: 4 },
    intro: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.tertiary,
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.md,
        textAlign: 'right',
        lineHeight: 22,
    },
    list: { flex: 1 },
    listContent: { padding: Spacing.lg, gap: Spacing.md },
    sourceCard: {
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        gap: Spacing.sm,
    },
    sourceInfo: { flex: 1, gap: 2 },
    sourceNameAr: {
        fontSize: Typography.fontSize.base,
        fontWeight: '700',
        color: Colors.text.inverse,
        textAlign: 'right',
    },
    sourceDetails: {
        fontSize: Typography.fontSize.xs,
        color: Colors.text.tertiary,
        textAlign: 'right',
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: Spacing.sm,
    },
    doneChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: Colors.emerald[700],
        paddingHorizontal: Spacing.sm,
        paddingVertical: 4,
        borderRadius: 20,
    },
    doneText: { color: '#fff', fontSize: 11, fontWeight: '700' },
    deleteBtn: {
        padding: 6,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.3)',
    },
    downloadBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: Colors.emerald[700],
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        borderRadius: 20,
    },
    downloadBtnText: { color: '#fff', fontSize: Typography.fontSize.xs, fontWeight: '700' },
    cancelBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: Colors.gold[600],
    },
    cancelText: { color: Colors.gold[400], fontSize: Typography.fontSize.xs, fontWeight: '700' },
    progressBg: {
        height: 3,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: Colors.gold[400],
        borderRadius: 2,
    },
    downloadAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
        backgroundColor: Colors.emerald[700],
        margin: Spacing.lg,
        padding: Spacing.md,
        borderRadius: BorderRadius.lg,
    },
    downloadAllText: { color: '#fff', fontWeight: '700', fontSize: Typography.fontSize.base },
});
