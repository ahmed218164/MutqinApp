import * as React from 'react';
import NetInfo from '@react-native-community/netinfo';
import { Session, User } from '@supabase/supabase-js';
import { useRouter, useSegments } from 'expo-router';
import { supabase } from './supabase';
import { checkHasPlan } from './plan-check';
import { isNetworkError, warnNetworkOnce } from './network-errors';

interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<void>;
    signUp: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = React.useState<User | null>(null);
    const [session, setSession] = React.useState<Session | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [initializing, setInitializing] = React.useState(true);
    const router = useRouter();
    const segments = useSegments();
    const navigatingRef = React.useRef(false);

    const navigateSafely = React.useCallback((path: string) => {
        if (navigatingRef.current) return;
        navigatingRef.current = true;
        router.replace(path);
        setTimeout(() => {
            navigatingRef.current = false;
        }, 1000);
    }, [router]);

    React.useEffect(() => {
        let mounted = true;

        async function initializeAuth() {
            try {
                console.log('[Auth] Initializing auth...');

                const network = await NetInfo.fetch();
                if (network.isConnected === false || network.isInternetReachable === false) {
                    console.warn('[Auth] Offline at startup. Skipping remote session refresh.');
                    return;
                }

                const { data: { session: initialSession }, error } = await supabase.auth.getSession();

                if (error) {
                    if (isNetworkError(error)) {
                        warnNetworkOnce('Auth', error);
                    } else {
                        console.error('[Auth] Error getting session:', error);
                    }
                } else if (initialSession && mounted) {
                    console.log('[Auth] Session restored from storage');
                    setSession(initialSession);
                    setUser(initialSession.user);
                } else {
                    console.log('[Auth] No existing session found');
                }
            } catch (error) {
                if (isNetworkError(error)) {
                    warnNetworkOnce('Auth', error);
                } else {
                    console.error('[Auth] Error initializing auth:', error);
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                    setInitializing(false);
                }
            }
        }

        initializeAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, newSession) => {
                console.log('[Auth] State changed:', event);

                if (mounted) {
                    setSession(newSession);
                    setUser(newSession?.user ?? null);
                    setLoading(false);
                }

                if (event === 'SIGNED_IN' && newSession) {
                    console.log('[Auth] User signed in, checking for plan...');
                    const hasPlan = await checkHasPlan(newSession.user.id);

                    if (hasPlan) {
                        navigateSafely('/(tabs)');
                    } else {
                        navigateSafely('/(tabs)');
                    }
                } else if (event === 'SIGNED_OUT') {
                    navigateSafely('/login');
                } else if (event === 'TOKEN_REFRESHED') {
                    console.log('[Auth] Token refreshed');
                }
            }
        );

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, [navigateSafely]);

    React.useEffect(() => {
        if (initializing) return;

        const isAuthPage = segments[0] === 'login' || segments[0] === 'signup';

        if (!user && !isAuthPage) {
            navigateSafely('/login');
        }
    }, [user, segments, initializing, navigateSafely]);

    const signIn = async (email: string, password: string) => {
        setLoading(true);
        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });

            if (error) {
                let friendlyMessage = 'فشل تسجيل الدخول. يرجى التحقق من البريد الإلكتروني وكلمة المرور.';

                if (error.message.includes('Invalid login credentials')) {
                    friendlyMessage = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
                } else if (error.message.includes('Email not confirmed')) {
                    friendlyMessage = 'يرجى تأكيد بريدك الإلكتروني أولًا.';
                } else if (isNetworkError(error)) {
                    friendlyMessage = 'تعذر الاتصال بالإنترنت. تحقق من الشبكة ثم حاول مرة أخرى.';
                }

                throw new Error(friendlyMessage);
            }

            console.log('[Auth] Sign in successful');
        } catch (error) {
            setLoading(false);
            throw error;
        }
    };

    const signUp = async (email: string, password: string) => {
        setLoading(true);
        try {
            const { data, error } = await supabase.auth.signUp({ email, password });

            if (error) {
                let friendlyMessage = 'فشل إنشاء الحساب. يرجى المحاولة مرة أخرى.';

                if (error.message.includes('already registered')) {
                    friendlyMessage = 'البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول.';
                } else if (error.message.includes('Password should be')) {
                    friendlyMessage = 'كلمة المرور ضعيفة جدًا. يجب أن تكون 6 أحرف على الأقل.';
                } else if (isNetworkError(error)) {
                    friendlyMessage = 'تعذر الاتصال بالإنترنت. تحقق من الشبكة ثم حاول مرة أخرى.';
                }

                throw new Error(friendlyMessage);
            }

            if (data.user) {
                try {
                    const { error: profileError } = await supabase.from('profiles').insert({
                        id: data.user.id,
                        created_at: new Date().toISOString(),
                    });

                    if (profileError && !profileError.message.includes('duplicate')) {
                        console.warn('[Auth] Profile creation warning:', profileError);
                    }
                } catch (profileError) {
                    console.warn('[Auth] Profile creation error:', profileError);
                }
            }

            console.log('[Auth] Sign up successful');
        } catch (error) {
            setLoading(false);
            throw error;
        }
    };

    const signOut = async () => {
        setLoading(true);
        try {
            const { error } = await supabase.auth.signOut();
            if (error) {
                throw new Error('فشل تسجيل الخروج. يرجى المحاولة مرة أخرى.');
            }
            console.log('[Auth] Sign out successful');
        } catch (error) {
            setLoading(false);
            throw error;
        }
    };

    return (
        <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = React.useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
