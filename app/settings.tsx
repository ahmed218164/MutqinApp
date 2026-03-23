import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    SafeAreaView,
    TouchableOpacity,
    Switch,
    Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Moon, Sun, Type, LogOut, Bell, Trash2 } from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/theme';
import { useThemeColors } from '../constants/dynamicTheme';
import Card from '../components/ui/Card';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings';

export default function SettingsScreen() {
    const router = useRouter();
    const { user, signOut } = useAuth();
    const { theme, fontSize, toggleTheme, setFontSize } = useSettings();
    const DynColors = useThemeColors();
    const [loading, setLoading] = React.useState(false);

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
