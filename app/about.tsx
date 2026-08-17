import * as React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Linking
} from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { ArrowRight, Heart, Mail } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/theme';
import Card from '../components/ui/Card';

export default function AboutScreen() {
    const router = useRouter();
    const appVersion = Constants.expoConfig?.version ?? '1.0.0';

    const handleLink = (url: string) => {
        Linking.openURL(url);
    };

    return (
        <SafeAreaView style={styles.container}>
            <LinearGradient
                colors={Colors.gradients.header}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.header}
            >
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={styles.backButton}
                    accessibilityRole="button"
                    accessibilityLabel="رجوع"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                    <ArrowRight color={Colors.text.inverse} size={24} />
                </TouchableOpacity>
                <Text style={styles.title}>عن التطبيق</Text>
            </LinearGradient>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.logoContainer}>
                    <View style={styles.logoPlaceholder}>
                        <Text style={styles.logoText}>م</Text>
                    </View>
                    <Text style={styles.appName}>مُتقِن</Text>
                    <Text style={styles.version}>الإصدار {appVersion}</Text>
                </View>

                <Card style={styles.card} variant="glass">
                    <Text style={styles.sectionTitle}>رسالتنا</Text>
                    <Text style={styles.text}>
                        صُمِّم «مُتقِن» لمساعدة المسلمين حول العالم على إتقان حفظ القرآن الكريم وتلاوته
                        باستخدام تقنيات الذكاء الاصطناعي. نؤمن بأن كل مسلم يستحق معلّماً خاصاً للقرآن
                        متاحاً في أي وقت.
                    </Text>
                </Card>

                <Card style={styles.card} variant="glass">
                    <Text style={styles.sectionTitle}>المميزات</Text>
                    <View style={styles.featureRow}>
                        <Text style={styles.bullet}>•</Text>
                        <Text style={styles.featureText}>تحليل التلاوة وتصحيح التجويد بالذكاء الاصطناعي</Text>
                    </View>
                    <View style={styles.featureRow}>
                        <Text style={styles.bullet}>•</Text>
                        <Text style={styles.featureText}>خطط حفظ شخصية وفق مستواك ووقتك</Text>
                    </View>
                    <View style={styles.featureRow}>
                        <Text style={styles.bullet}>•</Text>
                        <Text style={styles.featureText}>تتبع التقدم وإحصائيات مفصلة</Text>
                    </View>
                    <View style={styles.featureRow}>
                        <Text style={styles.bullet}>•</Text>
                        <Text style={styles.featureText}>تجربة تعليمية محفِّزة بالتحديات والشارات</Text>
                    </View>
                </Card>

                <Card style={styles.card} variant="glass">
                    <Text style={styles.sectionTitle}>تواصل معنا</Text>
                    <TouchableOpacity
                        style={styles.linkRow}
                        onPress={() => handleLink('mailto:ahmedelhawashy203033@gmail.com')}
                        accessibilityRole="button"
                        accessibilityLabel="مراسلتنا بالبريد الإلكتروني"
                    >
                        <Mail size={20} color={Colors.emerald[400]} />
                        <Text style={styles.linkText}>ahmedelhawashy203033@gmail.com</Text>
                    </TouchableOpacity>
                </Card>

                <View style={styles.footer}>
                    <Text style={styles.footerText}>صُنع بكل</Text>
                    <Heart size={14} color={Colors.error} style={{ marginHorizontal: 4 }} fill={Colors.error} />
                    <Text style={styles.footerText}>لخدمة كتاب الله</Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.neutral[950],
    },
    header: {
        padding: Spacing.xl,
        paddingTop: Spacing['3xl'],
        paddingBottom: Spacing.xl,
        flexDirection: 'row-reverse',
        alignItems: 'center',
    },
    backButton: {
        padding: Spacing.xs,
    },
    title: {
        fontSize: Typography.fontSize['2xl'],
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        fontFamily: Typography.fontFamily.arabicBold,
        textAlign: 'right',
        flex: 1,
    },
    content: {
        padding: Spacing.lg,
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: Spacing.xl,
        marginTop: Spacing.lg,
    },
    logoPlaceholder: {
        width: 80,
        height: 80,
        borderRadius: 20,
        backgroundColor: Colors.emerald[950],
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.md,
        borderWidth: 1,
        borderColor: 'rgba(251, 191, 36, 0.25)',
    },
    logoText: {
        fontSize: 40,
        fontWeight: 'bold',
        color: Colors.gold[500],
        fontFamily: Typography.fontFamily.arabicBold,
    },
    appName: {
        fontSize: Typography.fontSize['2xl'],
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        fontFamily: Typography.fontFamily.arabicBold,
    },
    version: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.tertiary,
        fontFamily: Typography.fontFamily.arabic,
    },
    card: {
        marginBottom: Spacing.lg,
    },
    sectionTitle: {
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        marginBottom: Spacing.md,
        fontFamily: Typography.fontFamily.arabicBold,
        textAlign: 'right',
    },
    text: {
        fontSize: Typography.fontSize.base,
        color: Colors.text.secondary,
        lineHeight: 28,
        fontFamily: Typography.fontFamily.arabic,
        textAlign: 'right',
    },
    featureRow: {
        flexDirection: 'row-reverse',
        marginBottom: Spacing.sm,
    },
    bullet: {
        fontSize: Typography.fontSize.base,
        color: Colors.gold[400],
        marginStart: Spacing.sm,
    },
    featureText: {
        fontSize: Typography.fontSize.base,
        color: Colors.text.secondary,
        fontFamily: Typography.fontFamily.arabic,
        textAlign: 'right',
        flex: 1,
    },
    linkRow: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        paddingVertical: Spacing.sm,
    },
    linkText: {
        fontSize: Typography.fontSize.base,
        color: Colors.emerald[400],
        marginStart: Spacing.md,
        fontWeight: Typography.fontWeight.medium,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: Spacing.xl,
        marginBottom: Spacing['3xl'],
    },
    footerText: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.tertiary,
        fontFamily: Typography.fontFamily.arabic,
    },
});
