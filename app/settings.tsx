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
import { getSavedGroqApiKey, saveGroqApiKey, testGroqConnection } from '../lib/groq-api-key';
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

    const [groqKey, setGroqKey] = React.useState('');
    const [hasSavedGroqKey, setHasSavedGroqKey] = React.useState(false);
    const [testingGroq, setTestingGroq] = React.useState(false);
    const [groqStatus, setGroqStatus] = React.useState<{ ok: boolean; text: string } | null>(null);
    const [availableGroqModels, setAvailableGroqModels] = React.useState<string[]>([]);

    React.useEffect(() => {
        getSavedGeminiApiKey()
            .then(key => setHasSavedGeminiKey(Boolean(key)))
            .catch(() => setHasSavedGeminiKey(false));

        getSavedGroqApiKey()
            .then(key => setHasSavedGroqKey(Boolean(key)))
            .catch(() => setHasSavedGroqKey(false));
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

    async function handleSaveGroqKey() {
        try {
            await saveGroqApiKey(groqKey);
            setGroqKey('');
            setHasSavedGroqKey(true);
            setGroqStatus({ ok: true, text: 'تم حفظ مفتاح Groq محلياً بنجاح.' });
        } catch (error) {
            setGroqStatus({ ok: false, text: error instanceof Error ? error.message : 'تعذّر حفظ مفتاح Groq.' });
        }
    }

    async function handleTestGroqConnection() {
        setTestingGroq(true);
        const result = await testGroqConnection(groqKey);
        setTestingGroq(false);
        setGroqStatus({ ok: result.ok, text: result.message });
        setAvailableGroqModels(result.ok ? result.availableModels : []);
        if (result.ok && groqKey.trim()) {
            try {
                await saveGroqApiKey(groqKey);
                setGroqKey('');
                setHasSavedGroqKey(true);
            } catch {
                // Ignore save error on successful test
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
                {/* Gemini AI Card */}
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

                {/* Groq Cloud Fast Engine Card */}
                <Card style={styles.settingCard}>
                    <View style={styles.settingHeader}>
                        <View style={styles.settingIcon}>
                            <KeyRound color={Colors.gold[600]} size={24} />
                        </View>
                        <View style={styles.settingInfo}>
                            <Text style={styles.settingTitle}>مفتاح Groq API (فائق السرعة)</Text>
                            <Text style={styles.settingDescription}>
                                {hasSavedGroqKey
                                    ? 'تم تفعيل Whisper-Large-v3-Turbo و Llama-3.3'
                                    : 'اختياري: لتسريع التفريغ والمطابقة الصوتية'}
                            </Text>
                        </View>
                    </View>
                    <TextInput
                        style={styles.apiKeyInput}
                        value={groqKey}
                        onChangeText={text => {
                            setGroqKey(text);
                            setGroqStatus(null);
                        }}
                        placeholder={hasSavedGroqKey ? 'أدخل مفتاح Groq جديد للاستبدال (gsk_...)' : 'ألصق مفتاح Groq API هنا'}
                        placeholderTextColor={Colors.neutral[400]}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry
                        textContentType="password"
                    />
                    <View style={styles.apiKeyActions}>
                        <TouchableOpacity
                            style={[styles.apiKeyButton, styles.testButton]}
                            onPress={handleTestGroqConnection}
                            disabled={testingGroq}
                        >
                            {testingGroq ? <ActivityIndicator color={Colors.emerald[700]} /> : <Text style={styles.testButtonText}>اختبار الاتصال</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.apiKeyButton, styles.saveButton, !groqKey.trim() && styles.buttonDisabled]}
                            onPress={handleSaveGroqKey}
                            disabled={!groqKey.trim()}
                        >
                            <Text style={styles.saveButtonText}>حفظ المفتاح</Text>
                        </TouchableOpacity>
                    </View>
                    {groqStatus && (
                        <View style={[styles.apiStatus, groqStatus.ok ? styles.apiStatusSuccess : styles.apiStatusError]}>
                            {groqStatus.ok ? <CheckCircle2 color={Colors.success} size={17} /> : <CircleAlert color={Colors.error} size={17} />}
                            <Text style={[styles.apiStatusText, { color: groqStatus.ok ? Colors.emerald[800] : Colors.error }]}>{groqStatus.text}</Text>
                        </View>
                    )}
                    {groqStatus?.ok && (
                        <View style={styles.capabilityList}>
                            <Text style={styles.capabilityTitle}>النماذج المتاحة في حساب Groq</Text>
                            {[
                                { name: 'تفريغ التلاوة فائق السرعة', model: 'whisper-large-v3-turbo' },
                                { name: 'التدقيق التجويدي المعمق', model: 'llama-3.3-70b-versatile' },
                                { name: 'الخطط والاختبارات الخاطفة', model: 'llama-3.1-8b-instant' },
                                { name: 'النطق العربي الفصيح للمعلم', model: 'canopylabs/orpheus-arabic-saudi' },
                            ].map(item => {
                                const available = availableGroqModels.includes(item.model) || availableGroqModels.some(m => m.includes(item.model));
                                return (
                                    <View key={item.model} style={styles.capabilityRow}>
                                        <Text style={styles.capabilityText}>{item.name}</Text>
                                        <Text style={[styles.capabilityState, { color: available ? Colors.success : Colors.neutral[500] }]}>
                                            {available ? 'متاح ✅' : 'جاهز'}
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
        justifyContent: 'center',
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.md,
    },
    saveButton: {
        backgroundColor: Colors.emerald[600],
    },
    saveButtonText: {
        color: Colors.text.inverse,
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.bold,
    },
    testButton: {
        backgroundColor: Colors.neutral[100],
        borderWidth: 1,
        borderColor: Colors.neutral[300],
    },
    testButtonText: {
        color: Colors.emerald[800],
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.medium,
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    apiStatus: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        marginTop: Spacing.md,
    },
    apiStatusSuccess: {
        backgroundColor: Colors.emerald[50],
        borderColor: Colors.emerald[200],
        borderWidth: 1,
    },
    apiStatusError: {
        backgroundColor: '#FEF2F2',
        borderColor: '#FCA5A5',
        borderWidth: 1,
    },
    apiStatusText: {
        flex: 1,
        fontSize: Typography.fontSize.sm,
    },
    capabilityList: {
        marginTop: Spacing.md,
        paddingTop: Spacing.md,
        borderTopWidth: 1,
        borderTopColor: Colors.neutral[200],
        gap: Spacing.xs,
    },
    capabilityTitle: {
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.emerald[950],
        marginBottom: Spacing.xs,
    },
    capabilityRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 2,
    },
    capabilityText: {
        fontSize: Typography.fontSize.xs,
        color: Colors.text.primary,
    },
    capabilityState: {
        fontSize: Typography.fontSize.xs,
        fontWeight: Typography.fontWeight.medium,
    },
    fontSizeControls: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: Spacing.lg,
    },
    fontSizeButton: {
        width: 48,
        height: 48,
        borderRadius: BorderRadius.full,
        backgroundColor: Colors.emerald[100],
        alignItems: 'center',
        justifyContent: 'center',
    },
    fontSizeButtonText: {
        fontSize: Typography.fontSize.xl,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.emerald[700],
    },
    fontSizePreview: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
    },
    previewText: {
        color: Colors.emerald[950],
        fontFamily: Typography.fontFamily.arabicBold,
    },
    sectionTitle: {
        fontSize: Typography.fontSize.base,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.neutral[500],
        marginTop: Spacing.xl,
        marginBottom: Spacing.md,
        marginHorizontal: Spacing.xs,
    },
    menuCard: {
        marginBottom: Spacing.sm,
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
        fontSize: Typography.fontSize.base,
        fontWeight: Typography.fontWeight.medium,
        color: Colors.text.primary,
    },
    signOutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
        backgroundColor: Colors.error,
        padding: Spacing.lg,
        borderRadius: BorderRadius.lg,
        marginTop: Spacing['2xl'],
        marginBottom: Spacing.lg,
    },
    signOutText: {
        color: Colors.text.inverse,
        fontSize: Typography.fontSize.base,
        fontWeight: Typography.fontWeight.bold,
    },
    version: {
        textAlign: 'center',
        fontSize: Typography.fontSize.xs,
        color: Colors.neutral[400],
        marginBottom: Spacing['3xl'],
    },
});
