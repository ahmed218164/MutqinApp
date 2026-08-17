import { Tabs } from 'expo-router';
import { Home, BookOpen, Target, AlertCircle, User } from 'lucide-react-native';
import FloatingTabBar from '../../components/navigation/FloatingTabBar';

export default function TabLayout() {
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

        </Tabs>
    );
}
