import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    SafeAreaView,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Play, Mic } from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/theme';
import Card from '../components/ui/Card';
import ModernBackground from '../components/ui/ModernBackground';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { getSurahByNumber } from '../constants/surahs';

export default function FreeReciteScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const [selectedSurah, setSelectedSurah] = React.useState(1);
    const [fromAyah, setFromAyah] = React.useState(1);
    const [toAyah, setToAyah] = React.useState(7);
    const [loading, setLoading] = React.useState(false);

    const surah = getSurahByNumber(selectedSurah);

    const handleListen = () => {
        router.push(`/recite?surah=${selectedSurah}&from=${fromAyah}&to=${toAyah}&mode=listen`);
    };

    const handleRecite = () => {
        router.push(`/recite?surah=${selectedSurah}&from=${fromAyah}&to=${toAyah}&mode=recite`);
    };

    return (
        <View style={styles.container}>
            <ModernBackground />
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.header}>
                    <Text style={styles.title}>تسميع حر 📖</Text>
                    <Text style={styles.subtitle}>
                        اختر أي نطاق من القرآن للاستماع أو التسميع
                    </Text>
                </View>

                <ScrollView style={styles.content}>
                    <Card style={styles.card} variant="glass">
                        <Text style={styles.label}>السورة</Text>
                        <View style={styles.surahSelector}>
                            <TouchableOpacity
                                style={styles.arrowButton}
                                onPress={() => setSelectedSurah(Math.max(1, selectedSurah - 1))}
                            >
                                <Text style={styles.arrowText}>←</Text>
                            </TouchableOpacity>

                            <View style={styles.surahDisplay}>
                                <Text style={styles.surahNumber}>{selectedSurah}</Text>
                                <Text style={styles.surahName}>{surah?.name || ''}</Text>
                            </View>

                            <TouchableOpacity
                                style={styles.arrowButton}
                                onPress={() => setSelectedSurah(Math.min(114, selectedSurah + 1))}
                            >
                                <Text style={styles.arrowText}>→</Text>
                            </TouchableOpacity>
                        </View>
                    </Card>

                    <Card style={styles.card} variant="glass">
                        <Text style={styles.label}>نطاق الآيات</Text>
                        <View style={styles.rangeSelector}>
                            <View style={styles.rangeInput}>
                                <Text style={styles.rangeLabel}>من</Text>
                                <View style={styles.ayahSelector}>
                                    <TouchableOpacity
                                        style={styles.smallArrow}
                                        onPress={() => setFromAyah(Math.max(1, fromAyah - 1))}
                                    >
                                        <Text style={styles.smallArrowText}>-</Text>
                                    </TouchableOpacity>
                                    <Text style={styles.ayahNumber}>{fromAyah}</Text>
                                    <TouchableOpacity
                                        style={styles.smallArrow}
                                        onPress={() => setFromAyah(Math.min(surah?.verses || 1, fromAyah + 1))}
                                    >
                                        <Text style={styles.smallArrowText}>+</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <View style={styles.rangeInput}>
                                <Text style={styles.rangeLabel}>إلى</Text>
                                <View style={styles.ayahSelector}>
                                    <TouchableOpacity
                                        style={styles.smallArrow}
                                        onPress={() => setToAyah(Math.max(fromAyah, toAyah - 1))}
                                    >
                                        <Text style={styles.smallArrowText}>-</Text>
                                    </TouchableOpacity>
                                    <Text style={styles.ayahNumber}>{toAyah}</Text>
                                    <TouchableOpacity
                                        style={styles.smallArrow}
                                        onPress={() => setToAyah(Math.min(surah?.verses || 1, toAyah + 1))}
                                    >
                                        <Text style={styles.smallArrowText}>+</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Card>

                    <View style={styles.actions}>
                        <TouchableOpacity
                            style={[styles.button, styles.listenButton]}
                            onPress={handleListen}
                        >
                            <Play size={20} color={Colors.text.inverse} />
                            <Text style={styles.buttonText}>استمع</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.button, styles.reciteButton]}
                            onPress={handleRecite}
                        >
                            <Mic size={20} color={Colors.text.inverse} />
                            <Text style={styles.buttonText}>سمّع</Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.note}>
                        💡 التسميع الحر لا يؤثر على تقدمك اليومي
                    </Text>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.neutral[950],
    },
    safeArea: {
        flex: 1,
    },
    header: {
        padding: Spacing.xl,
        paddingTop: Spacing['3xl'],
    },
    title: {
        fontSize: Typography.fontSize['3xl'],
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        marginBottom: Spacing.xs,
    },
    subtitle: {
        fontSize: Typography.fontSize.base,
        color: Colors.text.tertiary,
    },
    content: {
        flex: 1,
        padding: Spacing.lg,
    },
    card: {
        marginBottom: Spacing.lg,
    },
    label: {
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.semibold,
        color: Colors.text.inverse,
        marginBottom: Spacing.md,
    },
    surahSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    arrowButton: {
        width: 50,
        height: 50,
        borderRadius: BorderRadius.full,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    arrowText: {
        fontSize: Typography.fontSize['2xl'],
        color: Colors.text.inverse,
    },
    surahDisplay: {
        flex: 1,
        alignItems: 'center',
    },
    surahNumber: {
        fontSize: Typography.fontSize['4xl'],
        fontWeight: Typography.fontWeight.bold,
        color: Colors.gold[400],
    },
    surahName: {
        fontSize: Typography.fontSize.xl,
        color: Colors.text.secondary,
        marginTop: Spacing.xs,
    },
    rangeSelector: {
        flexDirection: 'row',
        gap: Spacing.lg,
    },
    rangeInput: {
        flex: 1,
    },
    rangeLabel: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.tertiary,
        marginBottom: Spacing.sm,
        textAlign: 'center',
    },
    ayahSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.md,
    },
    smallArrow: {
        width: 36,
        height: 36,
        borderRadius: BorderRadius.full,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    smallArrowText: {
        fontSize: Typography.fontSize.xl,
        color: Colors.text.inverse,
    },
    ayahNumber: {
        fontSize: Typography.fontSize['2xl'],
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        minWidth: 50,
        textAlign: 'center',
    },
    actions: {
        flexDirection: 'row',
        gap: Spacing.md,
        marginTop: Spacing.lg,
    },
    button: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
        paddingVertical: Spacing.lg,
        borderRadius: BorderRadius.lg,
    },
    listenButton: {
        backgroundColor: Colors.emerald[600],
    },
    reciteButton: {
        backgroundColor: Colors.gold[600],
    },
    buttonText: {
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
    },
    note: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.tertiary,
        textAlign: 'center',
        marginTop: Spacing.xl,
        padding: Spacing.md,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: BorderRadius.lg,
    },
});
