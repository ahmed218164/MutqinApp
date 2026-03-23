import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Switch,
    ScrollView,
    SafeAreaView,
    TouchableOpacity,
    Platform,
    Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Bell, Clock, Award, BookOpen } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors as StaticColors, Typography, Spacing, BorderRadius } from '../constants/theme';
import { useThemeColors } from '../constants/dynamicTheme';
import Card from '../components/ui/Card';
import {
    getNotificationSettings,
    saveNotificationSettings,
    registerForPushNotifications,
    NotificationSettings
} from '../lib/notifications';
import { useAuth } from '../lib/auth';

export default function NotificationSettingsScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const Colors = useThemeColors();
    const [settings, setSettings] = React.useState({
        dailyReminder: true,
        dailyReminderTime: '20:00',
        reviewReminders: true,
        achievementNotifications: true,
    });
    const [loading, setLoading] = React.useState(false);
    const [showTimePicker, setShowTimePicker] = React.useState(false);

    React.useEffect(() => {
        loadSettings();
    }, []);

    async function loadSettings() {
        if (!user) return;
        setLoading(true);
        try {
            const data = await getNotificationSettings(user.id);
            setSettings(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    async function toggleSetting(key: keyof NotificationSettings, value: boolean | string) {
        if (!user) return;

        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);

        // Auto-save on toggle
        await saveNotificationSettings(user.id, newSettings);

        if (key === 'dailyReminder' && value === true) {
            // Ensure permission is granted
            await registerForPushNotifications();
        }
    }

    const formatTime = (time: string) => {
        const [hours, minutes] = time.split(':');
        const h = parseInt(hours);
        const period = h >= 12 ? 'مساءً' : 'صباحًا';
        const h12 = h % 12 || 12;
        return `${h12}:${minutes} ${period}`;
    };

    function adjustHour(delta: number) {
        const [h, m] = settings.dailyReminderTime.split(':').map(Number);
        const newH = (h + delta + 24) % 24;
        const newTime = `${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        toggleSetting('dailyReminderTime', newTime);
    }

    function adjustMinute(delta: number) {
        const [h, m] = settings.dailyReminderTime.split(':').map(Number);
        const newM = (m + delta + 60) % 60;
        const newTime = `${String(h).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
        toggleSetting('dailyReminderTime', newTime);
    }

    return (
        <SafeAreaView style={styles.container}>
            <LinearGradient
                colors={['#042f2e', '#0d534f', '#115e59']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.header}
            >
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft color={StaticColors.text.inverse} size={24} />
                </TouchableOpacity>
                <Text style={styles.title}>الإشعارات</Text>
            </LinearGradient>

            <ScrollView style={styles.content}>
                <Card style={styles.card}>
                    <View style={styles.settingRow}>
                        <View style={styles.settingInfo}>
                            <View style={styles.iconContainer}>
                                <Bell size={24} color={Colors.emerald[600]} />
                            </View>
                            <View>
                                <Text style={styles.settingLabel}>تذكير يومي</Text>
                                <Text style={styles.settingDescription}>تذكّر بتلاوتك اليومية</Text>
                            </View>
                        </View>
                        <Switch
                            value={settings.dailyReminder}
                            onValueChange={(val) => toggleSetting('dailyReminder', val)}
                            trackColor={{ false: Colors.neutral[200], true: Colors.emerald[600] }}
                        />
                    </View>

                    {settings.dailyReminder && (
                        <View style={styles.timePickerContainer}>
                            <View style={styles.settingInfo}>
                                <View style={styles.iconContainer}>
                                    <Clock size={24} color={Colors.gold[600]} />
                                </View>
                                <View>
                                    <Text style={styles.settingLabel}>وقت التذكير</Text>
                                    <Text style={styles.settingDescription}>متى تريد أن نذكّرك؟</Text>
                                </View>
                            </View>

                            {/* Time adjuster */}
                            <View style={styles.timeAdjuster}>
                                {/* Hour control */}
                                <View style={styles.timeUnit}>
                                    <TouchableOpacity onPress={() => adjustHour(1)} style={styles.timeArrow}>
                                        <Text style={styles.timeArrowText}>▲</Text>
                                    </TouchableOpacity>
                                    <Text style={styles.timeText}>
                                        {settings.dailyReminderTime.split(':')[0]}
                                    </Text>
                                    <TouchableOpacity onPress={() => adjustHour(-1)} style={styles.timeArrow}>
                                        <Text style={styles.timeArrowText}>▼</Text>
                                    </TouchableOpacity>
                                </View>

                                <Text style={styles.timeSep}>:</Text>

                                {/* Minute control */}
                                <View style={styles.timeUnit}>
                                    <TouchableOpacity onPress={() => adjustMinute(5)} style={styles.timeArrow}>
                                        <Text style={styles.timeArrowText}>▲</Text>
                                    </TouchableOpacity>
                                    <Text style={styles.timeText}>
                                        {settings.dailyReminderTime.split(':')[1]}
                                    </Text>
                                    <TouchableOpacity onPress={() => adjustMinute(-5)} style={styles.timeArrow}>
                                        <Text style={styles.timeArrowText}>▼</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Period label */}
                                <Text style={[styles.timePeriod, { color: Colors.gold[600] }]}>
                                    {parseInt(settings.dailyReminderTime.split(':')[0]) >= 12 ? 'مساءً' : 'صباحًا'}
                                </Text>
                            </View>
                        </View>
                    )}
                </Card>

                <Card style={styles.card}>
                    <View style={styles.settingRow}>
                        <View style={styles.settingInfo}>
                            <View style={styles.iconContainer}>
                                <BookOpen size={24} color={Colors.emerald[600]} />
                            </View>
                            <View>
                                <Text style={styles.settingLabel}>تذكيرات المراجعة</Text>
                                <Text style={styles.settingDescription}>إشعارات للمراجعات المستحقة</Text>
                            </View>
                        </View>
                        <Switch
                            value={settings.reviewReminders}
                            onValueChange={(val) => toggleSetting('reviewReminders', val)}
                            trackColor={{ false: Colors.neutral[200], true: Colors.emerald[600] }}
                        />
                    </View>
                </Card>

                <Card style={styles.card}>
                    <View style={styles.settingRow}>
                        <View style={styles.settingInfo}>
                            <View style={styles.iconContainer}>
                                <Award size={24} color={Colors.gold[600]} />
                            </View>
                            <View>
                                <Text style={styles.settingLabel}>الإنجازات</Text>
                                <Text style={styles.settingDescription}>احتفل بإنجازاتك ومحطاتك</Text>
                            </View>
                        </View>
                        <Switch
                            value={settings.achievementNotifications}
                            onValueChange={(val) => toggleSetting('achievementNotifications', val)}
                            trackColor={{ false: Colors.neutral[200], true: Colors.emerald[600] }}
                        />
                    </View>
                </Card>

                <TouchableOpacity
                    style={styles.testButton}
                    onPress={async () => {
                        const token = await registerForPushNotifications();
                        if (token) Alert.alert('✅ تم', 'تم تفعيل الإشعارات بنجاح!');
                        else Alert.alert('خطأ', 'تعذّر الحصول على إذن الإشعارات');
                    }}
                >
                    <Text style={styles.testButtonText}>اختبار صلاحيات الإشعارات</Text>
                </TouchableOpacity>

            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: StaticColors.neutral[50],
    },
    header: {
        padding: Spacing.xl,
        paddingTop: Spacing['3xl'],
        paddingBottom: Spacing.xl,
        flexDirection: 'row',
        alignItems: 'center',
    },
    backButton: {
        marginRight: Spacing.md,
    },
    title: {
        fontSize: Typography.fontSize['2xl'],
        fontWeight: Typography.fontWeight.bold,
        color: StaticColors.text.inverse,
    },
    content: {
        padding: Spacing.lg,
    },
    card: {
        marginBottom: Spacing.lg,
    },
    settingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: Spacing.sm,
    },
    settingInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: StaticColors.neutral[100],
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: Spacing.md,
    },
    settingLabel: {
        fontSize: Typography.fontSize.base,
        fontWeight: Typography.fontWeight.semibold,
        color: StaticColors.text.primary,
        marginBottom: 2,
    },
    settingDescription: {
        fontSize: Typography.fontSize.sm,
        color: StaticColors.text.secondary,
    },
    timePickerContainer: {
        marginTop: Spacing.md,
        paddingTop: Spacing.md,
        borderTopWidth: 1,
        borderTopColor: StaticColors.neutral[200],
        flexDirection: 'column',
        gap: Spacing.sm,
    },
    timeAdjuster: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.md,
        marginTop: Spacing.sm,
    },
    timeUnit: {
        alignItems: 'center',
        gap: 4,
    },
    timeArrow: {
        backgroundColor: StaticColors.neutral[100],
        borderRadius: BorderRadius.base,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
    },
    timeArrowText: {
        fontSize: 12,
        color: StaticColors.emerald[700],
        fontWeight: '700' as const,
    },
    timeText: {
        fontSize: Typography.fontSize['2xl'],
        fontWeight: Typography.fontWeight.bold,
        color: StaticColors.emerald[950],
        minWidth: 44,
        textAlign: 'center' as const,
    },
    timeSep: {
        fontSize: Typography.fontSize['2xl'],
        fontWeight: '700' as const,
        color: StaticColors.emerald[900],
        marginBottom: 4,
    },
    timePeriod: {
        fontSize: Typography.fontSize.base,
        fontWeight: '700' as const,
        marginRight: Spacing.sm,
    },
    testButton: {
        marginTop: Spacing.lg,
        padding: Spacing.md,
        alignItems: 'center',
    },
    testButtonText: {
        color: StaticColors.text.tertiary,
        fontSize: Typography.fontSize.sm,
    }
});

