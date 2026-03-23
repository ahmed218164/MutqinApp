
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../lib/auth';
import { Colors } from '../constants/theme';
import * as React from 'react';
import { checkHasPlan } from '../lib/plan-check';

export default function Index() {
    const { user, loading } = useAuth();
    const [hasPlan, setHasPlan] = React.useState<boolean | null>(null);
    const [checkingPlan, setCheckingPlan] = React.useState(true);

    React.useEffect(() => {
        if (!user) {
            setCheckingPlan(false);
            return;
        }

        async function checkForPlan() {
            try {
                const result = await checkHasPlan(user!.id);
                setHasPlan(result);
            } catch (error) {
                console.error('Error checking plan:', error);
                setHasPlan(false);
            } finally {
                setCheckingPlan(false);
            }
        }

        checkForPlan();
    }, [user]);

    if (loading || checkingPlan) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color={Colors.gold[600]} />
            </View>
        );
    }

    if (user) {
        if (hasPlan === false) {
            return <Redirect href="/(tabs)/plan" />;
        }
        return <Redirect href="/(tabs)" />;
    }

    return <Redirect href="/login" />;
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.emerald[950],
    },
});