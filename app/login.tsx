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
    Animated,
    Dimensions,
} from 'react-native';

import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BookOpen, Mail, Lock, Eye, EyeOff, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/theme';
import { AnimationDuration, AnimationEasing, SpringConfig } from '../constants/animations';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function LoginScreen() {
    const router = useRouter();
    const { signIn } = useAuth();
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [showPassword, setShowPassword] = React.useState(false);
    const [focusedField, setFocusedField] = React.useState<'email' | 'password' | null>(null);
    const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
    const [forgotSent, setForgotSent] = React.useState(false);
    const [showForgot, setShowForgot] = React.useState(false);

    // Animations
    const logoScale = React.useRef(new Animated.Value(0.5)).current;
    const logoOpacity = React.useRef(new Animated.Value(0)).current;
    const formSlide = React.useRef(new Animated.Value(40)).current;
    const formOpacity = React.useRef(new Animated.Value(0)).current;
    const buttonScale = React.useRef(new Animated.Value(1)).current;
    const errorOpacity = React.useRef(new Animated.Value(0)).current;
    const errorSlide = React.useRef(new Animated.Value(-8)).current;

    React.useEffect(() => {
        Animated.sequence([
            Animated.parallel([
                Animated.spring(logoScale, {
                    toValue: 1,
                    ...SpringConfig.bouncy,
                    useNativeDriver: true,
                }),
                Animated.timing(logoOpacity, {
                    toValue: 1,
                    duration: AnimationDuration.slow,
                    useNativeDriver: true,
                }),
            ]),
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

    // Animate error in
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

    async function handleLogin() {
        setErrorMsg(null);
        if (!email || !password) {
            setErrorMsg('يرجى إدخال البريد الإلكتروني وكلمة المرور.');
            return;
        }
        if (!email.includes('@')) {
            setErrorMsg('يرجى إدخال بريد إلكتروني صحيح.');
            return;
        }
        setLoading(true);
        try {
            await signIn(email, password);
            router.replace('/(tabs)');
        } catch (error: any) {
            const msg = error?.message || 'فشل تسجيل الدخول. تحقق من بياناتك.';
            setErrorMsg(
                msg.includes('Invalid login credentials')
                    ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
                    : 'فشل تسجيل الدخول. يرجى المحاولة مرة أخرى.'
            );
        } finally {
            setLoading(false);
        }
    }

    async function handleForgotPassword() {
        setErrorMsg(null);
        if (!email || !email.includes('@')) {
            setErrorMsg('الرجاء إدخال بريدك الإلكتروني أولاً ثم اضغط "نسيت كلمة المرور".');
            return;
        }
        setLoading(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: 'mutqin://reset-password',
            });
            if (error) throw error;
            setForgotSent(true);
        } catch (error: any) {
            setErrorMsg(error?.message || 'فشل إرسال بريد الاستعادة.');
        } finally {
            setLoading(false);
        }
    }

    const getInputBorderColor = (field: 'email' | 'password') => {
        if (focusedField === field) return Colors.emerald[400];
        if (errorMsg && ((field === 'email' && !email) || (field === 'password' && !password)))
            return 'rgba(239,68,68,0.6)';
        return 'rgba(255, 255, 255, 0.12)';
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

                    {/* Logo */}
                    <Animated.View style={[
                        styles.logoContainer,
                        {
                            opacity: logoOpacity,
                            transform: [{ scale: logoScale }],
                        }
                    ]}>
                        <View style={styles.logoIcon}>
                            <BookOpen color={Colors.gold[400]} size={36} strokeWidth={2} />
                        </View>
                        <Text style={styles.title}>مُتقِن</Text>
                        <Text style={styles.tagline}>مساعدك في حفظ القرآن الكريم</Text>
                    </Animated.View>

                    {/* Form */}
                    <Animated.View style={[
                        styles.form,
                        {
                            opacity: formOpacity,
                            transform: [{ translateY: formSlide }],
                        }
                    ]}>
                        {/* Email Input */}
                        <View style={[
                            styles.inputContainer,
                            { borderColor: getInputBorderColor('email') },
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

                        {/* Password Input */}
                        <View style={[
                            styles.inputContainer,
                            { borderColor: getInputBorderColor('password') },
                            focusedField === 'password' && styles.inputContainerFocused,
                        ]}>
                            <Lock
                                color={focusedField === 'password' ? Colors.emerald[400] : 'rgba(255,255,255,0.5)'}
                                size={20}
                                style={styles.inputIcon}
                            />
                            <TextInput
                                style={styles.input}
                                placeholder="كلمة المرور"
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

                        {/* ── Inline error / success messages ── */}
                        {errorMsg && (
                            <Animated.View style={[
                                styles.errorBanner,
                                { opacity: errorOpacity, transform: [{ translateY: errorSlide }] }
                            ]}>
                                <AlertCircle color="#f87171" size={16} />
                                <Text style={styles.errorText}>{errorMsg}</Text>
                            </Animated.View>
                        )}

                        {forgotSent && !errorMsg && (
                            <View style={styles.successBanner}>
                                <CheckCircle color={Colors.emerald[400]} size={16} />
                                <Text style={styles.successBannerText}>
                                    تم إرسال رابط الاستعادة! تحقق من بريدك الإلكتروني.
                                </Text>
                            </View>
                        )}

                        {/* ── Forgot Password ── */}
                        <TouchableOpacity
                            style={styles.forgotButton}
                            onPress={handleForgotPassword}
                            disabled={loading}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Text style={styles.forgotText}>نسيت كلمة المرور؟</Text>
                        </TouchableOpacity>

                        {/* Sign In Button */}
                        <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                            <TouchableOpacity
                                accessibilityRole="button"
                                accessibilityLabel="تسجيل الدخول"
                                style={[styles.button, loading && styles.buttonDisabled]}
                                onPress={handleLogin}
                                onPressIn={() => {
                                    Animated.spring(buttonScale, {
                                        toValue: 0.96,
                                        ...SpringConfig.snappy,
                                        useNativeDriver: true,
                                    }).start();
                                }}
                                onPressOut={() => {
                                    Animated.spring(buttonScale, {
                                        toValue: 1,
                                        ...SpringConfig.bouncy,
                                        useNativeDriver: true,
                                    }).start();
                                }}
                                disabled={loading}
                            >
                                <LinearGradient
                                    colors={['#d4af37', '#b8941e', '#d4af37']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.buttonGradient}
                                >
                                    {loading ? (
                                        <ActivityIndicator color={Colors.emerald[950]} />
                                    ) : (
                                        <View style={styles.buttonInner}>
                                            <Text style={styles.buttonText}>دخول</Text>
                                            <ArrowRight color={Colors.emerald[950]} size={18} />
                                        </View>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>
                        </Animated.View>

                        {/* Sign Up Link */}
                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel="إنشاء حساب جديد"
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={styles.linkButton}
                            onPress={() => router.push('/signup')}
                            disabled={loading}
                        >
                            <Text style={styles.linkText}>
                                ليس لديك حساب؟{' '}
                                <Text style={styles.linkTextBold}>إنشئ حساباً</Text>
                            </Text>
                        </TouchableOpacity>
                    </Animated.View>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    gradient: { flex: 1 },
    container: { flex: 1 },
    content: {
        flex: 1,
        justifyContent: 'center',
        padding: Spacing.xl,
    },
    // Decorative circles
    decorCircle1: {
        position: 'absolute',
        width: 300,
        height: 300,
        borderRadius: 150,
        backgroundColor: 'rgba(20, 184, 166, 0.06)',
        top: -80,
        right: -100,
    },
    decorCircle2: {
        position: 'absolute',
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: 'rgba(212, 175, 55, 0.05)',
        bottom: -50,
        left: -60,
    },
    // Logo
    logoContainer: {
        alignItems: 'center',
        marginBottom: Spacing['3xl'],
    },
    logoIcon: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: 'rgba(212, 175, 55, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(212, 175, 55, 0.25)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.lg,
    },
    title: {
        fontSize: Typography.fontSize['5xl'],
        fontWeight: Typography.fontWeight.extrabold,
        color: Colors.gold[400],
        letterSpacing: 2,
    },
    subtitle: {
        fontSize: Typography.fontSize['2xl'],
        color: 'rgba(255, 255, 255, 0.6)',
        marginTop: Spacing.xs,
        fontFamily: Typography.fontFamily.arabic,
    },
    tagline: {
        fontSize: Typography.fontSize.sm,
        color: 'rgba(255, 255, 255, 0.35)',
        marginTop: Spacing.sm,
        letterSpacing: 1,
    },
    // Form
    form: {
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderRadius: BorderRadius['2xl'],
        padding: Spacing.xl,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    // Input
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.07)',
        borderRadius: BorderRadius.lg,
        borderWidth: 1.5,
        marginBottom: Spacing.md,
        paddingHorizontal: Spacing.md,
        // transition is automatic via re-render borderColor
    },
    inputContainerFocused: {
        backgroundColor: 'rgba(52, 211, 153, 0.06)',
    },
    inputIcon: { marginLeft: Spacing.md },  // RTL: icon on right side
    input: {
        flex: 1,
        paddingVertical: Spacing.lg,
        fontSize: Typography.fontSize.base,
        color: '#ffffff',
    },
    eyeIcon: { padding: Spacing.sm },
    // Error banner
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
    // Success banner
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
    successBannerText: {
        flex: 1,
        fontSize: Typography.fontSize.sm,
        color: Colors.emerald[400],
    },
    // Forgot password
    forgotButton: {
        alignSelf: 'flex-end',
        marginBottom: Spacing.md,
        marginTop: -Spacing.xs,
    },
    forgotText: {
        fontSize: Typography.fontSize.sm,
        color: Colors.gold[400],
        fontWeight: '600',
    },
    // Button
    button: {
        borderRadius: BorderRadius.lg,
        overflow: 'hidden',
        marginTop: Spacing.xs,
        shadowColor: Colors.gold[400],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonGradient: {
        paddingVertical: Spacing.lg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    buttonText: {
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.emerald[950],
        letterSpacing: 0.5,
    },
    // Link
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
