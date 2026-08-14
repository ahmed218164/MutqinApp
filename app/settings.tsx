import * as React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Switch,
    Alert,
    TextInput,
    ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Moon, Sun, Type, LogOut, Bell, Trash2, KeyRound, CheckCircle2, CircleAlert } from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/theme';
import { useThemeColors } from '../constants/dynamicTheme';
import Card from '../components/ui/Card';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings';
import { getSavedGeminiApiKey, saveGeminiApiKey, testGeminiConnection } from '../lib/gemini-api-key';
import { MUTQIN_MODEL_ROUTES, MutqinModelTask } from '../lib/ai-models';

const MODEL_ROUTE_LABELS: Record<MutqinModelTask, string> = {
    dailyText: 'التخطيط والمساعدة اليومية',
    detailedRecitation: 'تحليل التسميع المسجل',
    liveAudio: 'المعلم الصوتي المباشر',
    spokenFeedback: 'التغذية الراجعة الصوتية',
    semanticSearch: 'البحث الذكي في المحتوى',
};

export default function SettingsScreen() {
    const router = useRouter();
    const { user, signOut } = useAuth();
    const { theme, fontSize, toggleTheme, setFontSize } = useSettings();
    const DynColors = useThemeColors();
    const [loading, setLoading] = React.useState(false);
    const [geminiKey, setGeminiKey] = React.useState('');
    const [hasSavedGeminiKey, setHasSavedGeminiKey] = React.useState(false);
    const [testingGemini, setTestingGemini] = React.useState(false);
    const [geminiStatus, setGeminiStatus] = React.useState<{ ok: boolean; text: string } | null>(null);
    const [availableCapabilities, setAvailableCapabilities] = React.useState<MutqinModelTask[]>([]);

    React.useEffect(() => {
        getSavedGeminiApiKey()
            .then(key => setHasSavedGeminiKey(Boolean(key)))
            .catch(() => setHasSavedGeminiKey(false));
    }, []);

    async function handleSaveGeminiKey() {
        try {
            await saveGeminiApiKey(geminiKey);
            setGeminiKey('');
            setHasSavedGeminiKey(true);
            setGeminiStatus({ ok: true, text: 'تم حفظ المفتاح محلياً. اختبر الاتصال للتأكد من صلاحيته.' });
        } catch (error) {
            setGeminiStatus({ ok: false, text: error instanceof Error ? error.message : 'تعذّر حفظ المفتاح.' });
        }
    }

    async function handleTestGeminiConnection() {
        setTestingGemini(true);
        const result = await testGeminiConnection(geminiKey);
        setTestingGemini(false);
        setGeminiStatus({ ok: result.ok, text: result.message });
        setAvailableCapabilities(result.ok
            ? (Object.keys(MUTQIN_MODEL_ROUTES) as MutqinModelTask[]).filter(task =>
                MUTQIN_MODEL_ROUTES[task].some(model => result.availableModels.includes(model)))
            : []);
        if (result.ok && geminiKey.trim()) {
            try {
                await saveGeminiApiKey(geminiKey);
                setGeminiKey('');
                setHasSavedGeminiKey(true);
            } catch {
                // The connection already succeeded; keep the result visible.
            }
        }
    }

    async function handleClearCache() {
        Alert.alert(
            'إعادة تشغيل التطبيق',
            'الصور مدمجة في التطبيق ولا تحتاج لمسح. لإصلاح أي مشكلة في العرض، أغلق التطبيق وأعد فتحه.',
            [{ text: 'حسناً' }]
        );
    }

    async function handleSignOut() {
        Alert.alert(
            'تسجيل الخروج',
            'هل أنت متأكد من تسجيل الخروج؟',
            [
                { text: 'إلغاء', style: 'cancel' },
                {
                    text: 'خروج',
                    style: 'destructive',
                    onPress: async () => {
                        setLoading(true);
                        try {
                            await signOut();
                            router.replace('/login');
                        } catch (error) {
                            Alert.alert('خطأ', 'فشل تسجيل الخروج');
                        } finally {
                            setLoading(false);
                        }
                    },
                },
            ]
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: DynColors.neutral[50] }]}>
            {/* Header */}
            <LinearGradient
                colors={['#042f2e', '#0d534f', '#115e59']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.header}
            >
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft color={Colors.text.inverse} size={24} />
                </TouchableOpacity>
                <Text style={styles.title}>الإعدادات</Text>
                <View style={{ width: 24 }} />
            </LinearGradient>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Theme Setting */}
                <Card style={styles.settingCard}>
                    <View style={styles.settingHeader}>
                        <View style={styles.settingIcon}>
                            {theme === 'dark' ? (
                                <Moon color={Colors.emerald[600]} size={24} />
                            ) : (
                                <Sun color={Colors.gold[600]} size={24} />
                            )}
                        </View>
                        <View style={styles.settingInfo}>
                            <Text style={styles.settingTitle}>السمة</Text>
                            <Text style={styles.settingDescription}>
                                {theme === 'dark' ? 'الوضع الليلي' : 'الوضع النهاري'}
                            </Text>
                        </View>
                        <Switch
                            value={theme === 'dark'}
                            onValueChange={toggleTheme}
                            trackColor={{ false: Colors.neutral[300], true: Colors.emerald[600] }}
                            thumbColor={Colors.neutral[50]}
                        />
                    </View>
                </Card>

                <Text style={styles.sectionTitle}>الذكاء الاصطناعي</Text>
                <Card style={styles.settingCard}>
                    <View style={styles.settingHeader}>
                        <View style={styles.settingIcon}>
                            <KeyRound color={Colors.emerald[600]} size={24} />
                        </View>
                        <View style={styles.settingInfo}>
                            <Text style={styles.settingTitle}>مفتاح Gemini API</Text>
                            <Text style={styles.settingDescription}>
                                {hasSavedGeminiKey ? 'تم حفظ مفتاح محلياً على هذا الجهاز' : 'أدخل مفتاحاً من Google AI Studio'}
                            </Text>
                        </View>
                    </View>
                    <TextInput
                        style={styles.apiKeyInput}
                        value={geminiKey}
                        onChangeText={text => {
                            setGeminiKey(text);
                            setGeminiStatus(null);
                        }}
                        placeholder={hasSavedGeminiKey ? 'أدخل مفتاحاً جديداً للاستبدال' : 'ألصق مفتاح Gemini API هنا'}
                        placeholderTextColor={Colors.neutral[400]}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry
                        textContentType="password"
                    />
                    <View style={styles.apiKeyActions}>
                        <TouchableOpacity
                            style={[styles.apiKeyButton, styles.testButton]}
                            onPress={handleTestGeminiConnection}
                            disabled={testingGemini}
                        >
                            {testingGemini ? <ActivityIndicator color={Colors.emerald[700]} /> : <Text style={styles.testButtonText}>اختبار الاتصال</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.apiKeyButton, styles.saveButton, !geminiKey.trim() && styles.buttonDisabled]}
                            onPress={handleSaveGeminiKey}
                            disabled={!geminiKey.trim()}
                        >
                            <Text style={styles.saveButtonText}>حفظ المفتاح</Text>
                        </TouchableOpacity>
                    </View>
                    {geminiStatus && (
                        <View style={[styles.apiStatus, geminiStatus.ok ? styles.apiStatusSuccess : styles.apiStatusError]}>
                            {geminiStatus.ok ? <CheckCircle2 color={Colors.success} size={17} /> : <CircleAlert color={Colors.error} size={17} />}
                            <Text style={[styles.apiStatusText, { color: geminiStatus.ok ? Colors.emerald[800] : Colors.error }]}>{geminiStatus.text}</Text>
                        </View>
                    )}
                    {geminiStatus?.ok && (
                        <View style={styles.capabilityList}>
                            <Text style={styles.capabilityTitle}>القدرات المتاحة لهذا المفتاح</Text>
                            {(Object.keys(MODEL_ROUTE_LABELS) as MutqinModelTask[]).map(task => {
                                const available = availableCapabilities.includes(task);
                                return (
                                    <View key={task} style={styles.capabilityRow}>
                                        <Text style={styles.capabilityText}>{MODEL_ROUTE_LABELS[task]}</Text>
                                        <Text style={[styles.capabilityState, { color: available ? Colors.success : Colors.neutral[500] }]}>
                                            {available ? 'متاح' : 'غير ظاهر في حسابك'}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    )}
                </Card>

                {/* Font Size Setting */}
                <Card style={styles.settingCard}>
                    <View style={styles.settingHeader}>
                        <View style={styles.settingIcon}>
                            <Type color={Colors.emerald[600]} size={24} />
                        </View>
                        <View style={styles.settingInfo}>
                            <Text style={styles.settingTitle}>حجم خط القرآن</Text>
                            <Text style={styles.settingDescription}>{fontSize} نقطة</Text>
                        </View>
                    </View>
                    <View style={styles.fontSizeControls}>
                        <TouchableOpacity
                            style={styles.fontSizeButton}
                            onPress={() => setFontSize(Math.max(14, fontSize - 2))}
                        >
                            <Text style={styles.fontSizeButtonText}>-</Text>
                        </TouchableOpacity>
                        <View style={styles.fontSizePreview}>
                            <Text style={[styles.previewText, { fontSize }]}>بِسْمِ اللَّهِ</Text>
                        </View>
                        <TouchableOpacity
                            style={styles.fontSizeButton}
                            onPress={() => setFontSize(Math.min(48, fontSize + 2))}
                        >
                            <Text style={styles.fontSizeButtonText}>+</Text>
                        </TouchableOpacity>
                    </View>
                </Card>

                {/* About & Support */}
                <Text style={styles.sectionTitle}>⚙️ التخزين والمتقدم</Text>

                <TouchableOpacity onPress={handleClearCache}>
                    <Card style={styles.menuCard}>
                        <View style={styles.menuRow}>
                            <View style={styles.menuIcon}>
                                <Trash2 color={Colors.neutral[500]} size={24} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.menuText}>صور المصحف</Text>
                                <Text style={{ fontSize: 12, color: Colors.neutral[500] }}>الصور مدمجة في التطبيق — بدون تحميل خارجي ✅</Text>
                            </View>
                        </View>
                    </Card>
                </TouchableOpacity>

                <Text style={styles.sectionTitle}>ℹ️ حول التطبيق</Text>

                <TouchableOpacity onPress={() => router.push('/notifications')}>
                    <Card style={styles.menuCard}>
                        <View style={styles.menuRow}>
                            <View style={styles.menuIcon}>
                                <Bell color={Colors.emerald[600]} size={24} />
                            </View>
                            <Text style={styles.menuText}>إعدادات الإشعارات</Text>
                            <ArrowLeft style={{ transform: [{ rotate: '180deg' }] }} color={Colors.neutral[400]} size={20} />
                        </View>
                    </Card>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => router.push('/about')}>
                    <Card style={styles.menuCard}>
                        <View style={styles.menuRow}>
                            <View style={styles.menuIcon}>
                                <LogOut color={Colors.emerald[600]} size={24} />
                                {/* Using LogOut icon temporarily as About icon, or Info if available */}
                            </View>
                            <Text style={styles.menuText}>حول مُتقِن</Text>
                            <ArrowLeft style={{ transform: [{ rotate: '180deg' }] }} color={Colors.neutral[400]} size={20} />
                        </View>
                    </Card>
                </TouchableOpacity>

                {/* Sign Out Button */}
                <TouchableOpacity
                    style={styles.signOutButton}
                    onPress={handleSignOut}
                    disabled={loading}
                >
                    <LogOut color={Colors.text.inverse} size={20} />
                    <Text style={styles.signOutText}>تسجيل الخروج</Text>
                </TouchableOpacity>

                <Text style={styles.version}>الإصدار ١٫٠ تجريبي</Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.neutral[50],
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: Spacing.xl,
        paddingTop: Spacing['3xl'],
    },
    backButton: {
        padding: Spacing.sm,
    },
    title: {
        fontSize: Typography.fontSize['2xl'],
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
    },
    content: {
        flex: 1,
        padding: Spacing.lg,
    },
    settingCard: {
        marginBottom: Spacing.lg,
    },
    settingHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    settingIcon: {
        marginRight: Spacing.md,
    },
    settingInfo: {
        flex: 1,
    },
    settingTitle: {
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.semibold,
        color: Colors.emerald[950],
        marginBottom: Spacing.xs,
    },
    settingDescription: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.secondary,
    },
    apiKeyInput: {
        marginTop: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.neutral[300],
        borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.md,
        color: Colors.text.primary,
        fontSize: Typography.fontSize.sm,
        writingDirection: 'ltr',
        textAlign: 'left',
    },
    apiKeyActions: {
        flexDirection: 'row-reverse',
        gap: Spacing.sm,
        marginTop: Spacing.md,
    },
    apiKeyButton: {
        flex: 1,
        alignItems: 'center',
        borderRadius: BorderRadius.md,
        paddingVertical: Spacing.md,
    },
    testButton: {
        borderWidth: 1,
        borderColor: Colors.emerald[500],
        backgroundColor: Colors.emerald[50],
    },
    testButtonText: {
        color: Colors.emerald[700],
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.bold,
    },
    saveButton: {
        backgroundColor: Colors.emerald[700],
    },
    saveButtonText: {
        color: Colors.text.inverse,
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.bold,
    },
    buttonDisabled: {
        opacity: 0.45,
    },
    apiStatus: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        gap: Spacing.xs,
        marginTop: Spacing.md,
        padding: Spacing.sm,
        borderRadius: BorderRadius.base,
    },
    apiStatusSuccess: {
        backgroundColor: Colors.emerald[50],
    },
    apiStatusError: {
        backgroundColor: '#fef2f2',
    },
    apiStatusText: {
        flex: 1,
        fontSize: Typography.fontSize.xs,
        textAlign: 'right',
        writingDirection: 'rtl',
    },
    capabilityList: {
        marginTop: Spacing.md,
        borderTopWidth: 1,
        borderTopColor: Colors.neutral[200],
        paddingTop: Spacing.sm,
    },
    capabilityTitle: {
        color: Colors.text.secondary,
        fontSize: Typography.fontSize.xs,
        fontWeight: Typography.fontWeight.semibold,
        textAlign: 'right',
        writingDirection: 'rtl',
        marginBottom: Spacing.xs,
    },
    capabilityRow: {
        flexDirection: 'row-reverse',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 5,
    },
    capabilityText: {
        color: Colors.text.primary,
        fontSize: Typography.fontSize.sm,
        textAlign: 'right',
        writingDirection: 'rtl',
    },
    capabilityState: {
        fontSize: Typography.fontSize.xs,
        fontWeight: Typography.fontWeight.semibold,
        textAlign: 'left',
        writingDirection: 'rtl',
    },
    fontSizeControls: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: Spacing.lg,
    },
    fontSizeButton: {
        backgroundColor: Colors.emerald[950],
        width: 48,
        height: 48,
        borderRadius: BorderRadius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fontSizeButtonText: {
        fontSize: Typography.fontSize['2xl'],
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
    },
    fontSizePreview: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing.lg,
    },
    previewText: {
        fontWeight: Typography.fontWeight.semibold,
        color: Colors.emerald[950],
    },
    sectionTitle: {
        fontSize: Typography.fontSize.xl,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.emerald[950],
        marginTop: Spacing.lg,
        marginBottom: Spacing.md,
    },
    signOutButton: {
        backgroundColor: Colors.error,
        borderRadius: BorderRadius.lg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.lg,
        marginTop: Spacing.xl,
    },
    signOutText: {
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        marginRight: Spacing.sm,  // RTL: was marginLeft
    },
    version: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.tertiary,
        textAlign: 'center',
        marginTop: Spacing['2xl'],
        marginBottom: Spacing.xl,
    },
    menuCard: {
        marginBottom: Spacing.md,
        padding: Spacing.lg,
    },
    menuRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    menuIcon: {
        marginRight: Spacing.md,
    },
    menuText: {
        flex: 1,
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.semibold,
        color: Colors.text.primary,
    },
});
