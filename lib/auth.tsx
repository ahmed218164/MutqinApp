import * as React from 'react';
import { supabase } from './supabase';
import { checkHasPlan } from './plan-check';
import { Session, User } from '@supabase/supabase-js';
import { useRouter, useSegments } from 'expo-router';

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

    React.useEffect(() => {
        let mounted = true;

        async function initializeAuth() {
            try {
                console.log('🔐 Initializing auth...');
                
                // Get initial session from AsyncStorage
                const { data: { session: initialSession }, error } = await supabase.auth.getSession();
                
                if (error) {
                    console.error('Error getting session:', error);
                } else if (initialSession && mounted) {
                    console.log('✅ Session restored from storage');
                    setSession(initialSession);
                    setUser(initialSession.user);
                } else {
                    console.log('ℹ️ No existing session found');
                }
            } catch (error) {
                console.error('Error initializing auth:', error);
            } finally {
                if (mounted) {
                    setLoading(false);
                    setInitializing(false);
                }
            }
        }

        initializeAuth();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, newSession) => {
                console.log('🔄 Auth state changed:', event);
                
                if (mounted) {
                    setSession(newSession);
                    setUser(newSession?.user ?? null);
                    setLoading(false);
                }

                // Auto-navigate based on auth state
                if (event === 'SIGNED_IN' && newSession) {
                    console.log('✅ User signed in, checking for plan...');

                    const hasPlan = await checkHasPlan(newSession.user.id);

                    if (hasPlan) {
                        console.log('✅ User has plan, navigating to dashboard');
                        router.replace('/(tabs)');
                    } else {
                        console.log('⚠️ No plan found, redirecting to plan screen');
                        router.replace('/(tabs)/plan');
                    }
                } else if (event === 'SIGNED_OUT') {
                    console.log('👋 User signed out, navigating to login');
                    router.replace('/login');
                } else if (event === 'TOKEN_REFRESHED') {
                    console.log('🔄 Token refreshed');
                }
            }
        );

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    // Protected route navigation — only handles the SIGN-OUT guard.
    // SIGN-IN navigation is handled by onAuthStateChange above to avoid
    // a race condition where both fire simultaneously and cause double-navigation.
    React.useEffect(() => {
        if (initializing) return;

        const isAuthPage = segments[0] === 'login' || segments[0] === 'signup';

        if (!user && !isAuthPage) {
            // User is not signed in but trying to access protected routes
            router.replace('/login');
        }
        // Note: we intentionally do NOT redirect signed-in users away from auth pages
        // here — that's already handled by onAuthStateChange('SIGNED_IN').
    }, [user, segments, initializing]);

    const signIn = async (email: string, password: string) => {
        setLoading(true);
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                let friendlyMessage = 'فشل تسجيل الدخول. يرجى التحقق من البريد الإلكتروني وكلمة المرور.';
                
                if (error.message.includes('Invalid login credentials')) {
                    friendlyMessage = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
                } else if (error.message.includes('Email not confirmed')) {
                    friendlyMessage = 'يرجى تأكيد بريدك الإلكتروني أولاً.';
                } else if (error.message.includes('network')) {
                    friendlyMessage = 'مشكلة في الاتصال بالإنترنت. يرجى المحاولة مرة أخرى.';
                }

                throw new Error(friendlyMessage);
            }

            console.log('✅ Sign in successful');
        } catch (error) {
            setLoading(false);
            throw error;
        }
    };

    const signUp = async (email: string, password: string) => {
        setLoading(true);
        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
            });

            if (error) {
                let friendlyMessage = 'فشل إنشاء الحساب. يرجى المحاولة مرة أخرى.';
                
                if (error.message.includes('already registered')) {
                    friendlyMessage = 'البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول.';
                } else if (error.message.includes('Password should be')) {
                    friendlyMessage = 'كلمة المرور ضعيفة جداً. يجب أن تكون 6 أحرف على الأقل.';
                } else if (error.message.includes('network')) {
                    friendlyMessage = 'مشكلة في الاتصال بالإنترنت. يرجى المحاولة مرة أخرى.';
                }

                throw new Error(friendlyMessage);
            }

            // Create profile for new user
            if (data.user) {
                try {
                    const { error: profileError } = await supabase.from('profiles').insert({
                        id: data.user.id,
                        created_at: new Date().toISOString(),
                    });

                    if (profileError && !profileError.message.includes('duplicate')) {
                        console.warn('Profile creation warning:', profileError);
                    }
                } catch (profileError) {
                    console.warn('Profile creation error:', profileError);
                }
            }

            console.log('✅ Sign up successful');
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
            console.log('👋 Sign out successful');
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
