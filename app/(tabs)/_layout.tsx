import { Tabs } from 'expo-router';
import { Home, BookOpen, Target, AlertCircle, User } from 'lucide-react-native';
import FloatingTabBar from '../../components/navigation/FloatingTabBar';
import * as React from 'react';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { checkHasPlan } from '../../lib/plan-check';

export default function TabLayout() {
    const { user } = useAuth();

    // null = loading | true = has plan | false = no plan
    const [hasPlan, setHasPlan] = React.useState<boolean | null>(null);

    React.useEffect(() => {
        if (!user) return;

        // ── Initial check ─────────────────────────────────────────────────────
        async function checkPlan() {
            const result = await checkHasPlan(user!.id);
            setHasPlan(result);
        }
        checkPlan();

        // ── Realtime subscription: re-check whenever user_plans changes ───────
        const channel = supabase
            .channel(`user-plans-${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'user_plans',
                    filter: `user_id=eq.${user.id}`,
                },
                () => { checkPlan(); }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'memorization_plan',
                    filter: `user_id=eq.${user.id}`,
                },
                () => { checkPlan(); }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user]);

    return (
        <Tabs
            tabBar={(props) => <FloatingTabBar {...props} />}
            screenOptions={{ headerShown: false }}
        >
            {/* ── الرئيسية ──────────────────────────────────────────────── */}
            <Tabs.Screen
                name="index"
                options={{
                    title: 'الرئيسية',
                    tabBarIcon: ({ color, size, focused }) => (
                        <Home color={color} size={size} strokeWidth={focused ? 2.5 : 2} />
                    ),
                }}
            />

            {/* ── خطتي ────────────────────────────────────────────────── */}
            <Tabs.Screen
                name="plan"
                options={{
                    title: 'خطتي',
                    tabBarIcon: ({ color, size, focused }) => (
                        <Target color={color} size={size} strokeWidth={focused ? 2.5 : 2} />
                    ),
                }}
            />

            {/* ── المصحف ────────────────────────────────────────────────── */}
            <Tabs.Screen
                name="mushaf"
                options={{
                    title: 'المصحف',
                    tabBarIcon: ({ color, size, focused }) => (
                        <BookOpen color={color} size={size} strokeWidth={focused ? 2.5 : 2} />
                    ),
                }}
            />

            {/* ── أخطائي ────────────────────────────────────────────────── */}
            <Tabs.Screen
                name="mistakes"
                options={{
                    title: 'أخطائي',
                    tabBarIcon: ({ color, size, focused }) => (
                        <AlertCircle color={color} size={size} strokeWidth={focused ? 2.5 : 2} />
                    ),
                }}
            />

            {/* ── ملفي ──────────────────────────────────────────────────── */}
            <Tabs.Screen
                name="profile"
                options={{
                    title: 'ملفي',
                    tabBarIcon: ({ color, size, focused }) => (
                        <User color={color} size={size} strokeWidth={focused ? 2.5 : 2} />
                    ),
                }}
            />

            {/* Hidden screens (not shown in tab bar) */}
        </Tabs>
    );
}
