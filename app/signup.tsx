import * as React from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Animated,
} from 'react-native';

import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { UserPlus, Mail, Lock, Eye, EyeOff, ArrowLeft, AlertCircle, CheckCircle } from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/theme';
import { AnimationDuration, AnimationEasing, SpringConfig } from '../constants/animations';
import { useAuth } from '../lib/auth';
import GradientButton from '../components/ui/GradientButton';

export default function SignupScreen() {
    const router = useRouter();
    const { signUp } = useAuth();
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [confirmPassword, setConfirmPassword] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [showPassword, setShowPassword] = React.useState(false);
    const [focusedField, setFocusedField] = React.useState<'email' | 'password' | 'confirm' | null>(null);
    const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
    const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

    // Animations
    const headerOpacity = React.useRef(new Animated.Value(0)).current;
    const formSlide = React.useRef(new Animated.Value(50)).current;
    const formOpacity = React.useRef(new Animated.Value(0)).current;
    const errorOpacity = React.useRef(new Animated.Value(0)).current;
    const errorSlide = React.useRef(new Animated.Value(-8)).current;

    React.useEffect(() => {
        Animated.sequence([
            Animated.timing(headerOpacity, {
                toValue: 1,
                duration: AnimationDuration.normal,
                useNativeDriver: true,
            }),
            Animated.parallel([
                Animated.timing(formSlide, {
                    toValue: 0,
                    duration: AnimationDuration.normal,
                    easing: AnimationEasing.decelerate,
                    useNativeDriver: true,
                }),
                Animated.timing(formOpacity, {
                    toValue: 1,
                    duration: AnimationDuration.normal,
                    useNativeDriver: true,
                }),
            ]),
        ]).start();
    }, []);

    // Animate error in/out
    React.useEffect(() => {
        if (errorMsg) {
            errorOpacity.setValue(0);
            errorSlide.setValue(-8);
            Animated.parallel([
                Animated.timing(errorOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
                Animated.spring(errorSlide, { toValue: 0, ...SpringConfig.snappy, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.timing(errorOpacity, { toValue: 0, duration: 180, useNativeDriver: true }).start();
        }
    }, [errorMsg]);

    async function handleSignup() {
        setErrorMsg(null);
        setSuccessMsg(null);

        if (!email || !password || !confirmPassword) {
            setErrorMsg('يرجى ملء جميع الحقول للمتابعة.');
            return;
        }
        if (!email.includes('@')) {
            setErrorMsg('يرجى إدخال بريد إلكتروني صحيح.');
            return;
        }
        if (password !== confirmPassword) {
            setErrorMsg('كلمتا المرور غير متطابقتين. يرجى المحاولة مرة أخرى.');
            return;
        }
        if (password.length < 6) {
            setErrorMsg('يجب أن تكون كلمة المرور 6 أحرف على الأقل.');
            return;
        }

        setLoading(true);
        try {
            await signUp(email, password);
            setSuccessMsg('تم إنشاء الحساب! تحقق من بريدك الإلكتروني للتفعيل، ثم سجّل دخولك.');
            setTimeout(() => router.replace('/login'), 2500);
        } catch (error: any) {
            const msg = error?.message || 'فشل إنشاء الحساب. يرجى المحاولة مرة أخرى.';
            setErrorMsg(
                msg.includes('already registered')
                    ? 'هذا البريد الإلكتروني مسجّل مسبقاً. جرّب تسجيل الدخول.'
                    : 'فشل إنشاء الحساب. يرجى المحاولة مرة أخرى.'
            );
        } finally {
            setLoading(false);
        }
    }

    const getBorderColor = (field: 'email' | 'password' | 'confirm') => {
        if (focusedField === field) return Colors.emerald[400];
        return 'rgba(255,255,255,0.12)';
    };

    return (
        <LinearGradient
            colors={['#042f2e', '#0d534f', '#115e59', '#042f2e']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradient}
        >
            <SafeAreaView style={styles.container}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.content}
                    enabled={Platform.OS === 'ios'}
                >
                    {/* Decorative circles */}
                    <View style={styles.decorCircle1} />
                    <View style={styles.decorCircle2} />

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                        {/* Back Button */}
                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel="الرجوع للخلف"
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={() => router.back()}
                            style={styles.backButton}
                        >
                            <ArrowLeft color="rgba(255,255,255,0.6)" size={24} />
                        </TouchableOpacity>

                        {/* Header */}
                        <Animated.View style={[styles.header, { opacity: headerOpacity }]}>
                            <View style={styles.iconContainer}>
                                <UserPlus color={Colors.gold[400]} size={32} strokeWidth={2} />
                            </View>
                            <Text style={styles.title}>إنشاء حساب جديد</Text>
                            <Text style={styles.subtitle}>ابدأ رحلتك مع حفظ القرآن الكريم</Text>
                        </Animated.View>

                        {/* Form */}
                        <Animated.View style={[
                            styles.form,
                            {
                                opacity: formOpacity,
                                transform: [{ translateY: formSlide }],
                            }
                        ]}>
                            {/* Email */}
                            <View style={[
                                styles.inputContainer,
                                { borderColor: getBorderColor('email') },
                                focusedField === 'email' && styles.inputContainerFocused,
                            ]}>
                                <Mail
                                    color={focusedField === 'email' ? Colors.emerald[400] : 'rgba(255,255,255,0.5)'}
                                    size={20}
                                    style={styles.inputIcon}
                                />
                                <TextInput
                                    style={styles.input}
                                    placeholder="البريد الإلكتروني"
                                    placeholderTextColor="rgba(255,255,255,0.35)"
                                    value={email}
                                    onChangeText={(t) => { setEmail(t); setErrorMsg(null); }}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                    editable={!loading}
                                    onFocus={() => setFocusedField('email')}
                                    onBlur={() => setFocusedField(null)}
                                />
                            </View>

                            {/* Password */}
                            <View style={[
                                styles.inputContainer,
                                { borderColor: getBorderColor('password') },
                                focusedField === 'password' && styles.inputContainerFocused,
                            ]}>
                                <Lock
                                    color={focusedField === 'password' ? Colors.emerald[400] : 'rgba(255,255,255,0.5)'}
                                    size={20}
                                    style={styles.inputIcon}
                                />
                                <TextInput
                                    style={styles.input}
                                    placeholder="كلمة المرور (6 أحرف على الأقل)"
                                    placeholderTextColor="rgba(255,255,255,0.35)"
                                    value={password}
                                    onChangeText={(t) => { setPassword(t); setErrorMsg(null); }}
                                    secureTextEntry={!showPassword}
                                    editable={!loading}
                                    onFocus={() => setFocusedField('password')}
                                    onBlur={() => setFocusedField(null)}
                                />
                                <TouchableOpacity
                                    accessibilityRole="button"
                                    accessibilityLabel={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    onPress={() => setShowPassword(!showPassword)}
                                    style={styles.eyeIcon}
                                >
                                    {showPassword ? (
                                        <EyeOff color="rgba(255,255,255,0.5)" size={20} />
                                    ) : (
                                        <Eye color="rgba(255,255,255,0.5)" size={20} />
                                    )}
                                </TouchableOpacity>
                            </View>

                            {/* Confirm Password */}
                            <View style={[
                                styles.inputContainer,
                                { borderColor: getBorderColor('confirm') },
                                focusedField === 'confirm' && styles.inputContainerFocused,
                            ]}>
                                <Lock
                                    color={focusedField === 'confirm' ? Colors.emerald[400] : 'rgba(255,255,255,0.5)'}
                                    size={20}
                                    style={styles.inputIcon}
                                />
                                <TextInput
                                    style={styles.input}
                                    placeholder="تأكيد كلمة المرور"
                                    placeholderTextColor="rgba(255,255,255,0.35)"
                                    value={confirmPassword}
                                    onChangeText={(t) => { setConfirmPassword(t); setErrorMsg(null); }}
                                    secureTextEntry={!showPassword}
                                    editable={!loading}
                                    onFocus={() => setFocusedField('confirm')}
                                    onBlur={() => setFocusedField(null)}
                                />
                            </View>

                            {/* ── Inline error banner ── */}
                            {errorMsg && (
                                <Animated.View style={[
                                    styles.errorBanner,
                                    { opacity: errorOpacity, transform: [{ translateY: errorSlide }] }
                                ]}>
                                    <AlertCircle color="#f87171" size={16} />
                                    <Text style={styles.errorText}>{errorMsg}</Text>
                                </Animated.View>
                            )}

                            {/* ── Success banner ── */}
                            {successMsg && (
                                <View style={styles.successBanner}>
                                    <CheckCircle color={Colors.emerald[400]} size={16} />
                                    <Text style={styles.successText}>{successMsg}</Text>
                                </View>
                            )}

                            {/* Create Account Button — uses GradientButton */}
                            <GradientButton
                                title={loading ? 'جارٍ إنشاء الحساب...' : 'إنشاء الحساب'}
                                onPress={handleSignup}
                                disabled={loading}
                                colors={['#d4af37', '#b8941e', '#d4af37']}
                                style={styles.gradientButton}
                                textStyle={{ color: Colors.emerald[950] }}
                                accessibilityLabel="إنشاء الحساب"
                            />

                            {/* Sign In Link */}
                            <TouchableOpacity
                                accessibilityRole="button"
                                accessibilityLabel="الذهاب لتسجيل الدخول"
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                style={styles.linkButton}
                                onPress={() => router.back()}
                                disabled={loading}
                            >
                                <Text style={styles.linkText}>
                                    لديك حساب بالفعل؟{' '}
                                    <Text style={styles.linkTextBold}>سجّل دخولك</Text>
                                </Text>
                            </TouchableOpacity>
                        </Animated.View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    gradient: { flex: 1 },
    container: { flex: 1 },
    content: { flex: 1 },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: Spacing.xl,
    },
    decorCircle1: {
        position: 'absolute',
        width: 250,
        height: 250,
        borderRadius: 125,
        backgroundColor: 'rgba(20, 184, 166, 0.06)',
        top: -60,
        left: -80,
    },
    decorCircle2: {
        position: 'absolute',
        width: 180,
        height: 180,
        borderRadius: 90,
        backgroundColor: 'rgba(212, 175, 55, 0.05)',
        bottom: -30,
        right: -50,
    },
    backButton: {
        position: 'absolute',
        top: 0,
        left: 0,
        padding: Spacing.sm,
        zIndex: 10,
    },
    header: {
        alignItems: 'center',
        marginBottom: Spacing['2xl'],
    },
    iconContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(212, 175, 55, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(212, 175, 55, 0.25)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.lg,
    },
    title: {
        fontSize: Typography.fontSize['3xl'],
        fontWeight: Typography.fontWeight.extrabold,
        color: Colors.gold[400],
        letterSpacing: 1,
    },
    subtitle: {
        fontSize: Typography.fontSize.base,
        color: 'rgba(255, 255, 255, 0.4)',
        marginTop: Spacing.sm,
        textAlign: 'center',
    },
    form: {
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderRadius: BorderRadius['2xl'],
        padding: Spacing.xl,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.07)',
        borderRadius: BorderRadius.lg,
        borderWidth: 1.5,
        marginBottom: Spacing.md,
        paddingHorizontal: Spacing.md,
    },
    inputContainerFocused: {
        backgroundColor: 'rgba(52, 211, 153, 0.06)',
    },
    inputIcon: { marginRight: Spacing.md },
    input: {
        flex: 1,
        paddingVertical: Spacing.lg,
        fontSize: Typography.fontSize.base,
        color: '#ffffff',
    },
    eyeIcon: { padding: Spacing.sm },
    // Error / Success banners
    errorBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.25)',
        borderRadius: BorderRadius.base,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.md,
        marginBottom: Spacing.md,
    },
    errorText: {
        flex: 1,
        fontSize: Typography.fontSize.sm,
        color: '#f87171',
    },
    successBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        backgroundColor: 'rgba(52, 211, 153, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(52, 211, 153, 0.25)',
        borderRadius: BorderRadius.base,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.md,
        marginBottom: Spacing.md,
    },
    successText: {
        flex: 1,
        fontSize: Typography.fontSize.sm,
        color: Colors.emerald[400],
    },
    gradientButton: {
        marginTop: Spacing.md,
        width: '100%',
        shadowColor: Colors.gold[400],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    linkButton: {
        marginTop: Spacing.xl,
        alignItems: 'center',
    },
    linkText: {
        fontSize: Typography.fontSize.base,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    linkTextBold: {
        fontWeight: Typography.fontWeight.bold,
        color: Colors.gold[400],
    },
});
