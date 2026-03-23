import * as React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Book, Repeat, ChevronRight } from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { lightImpact } from '../../lib/haptics';

interface NarrationSwitcherProps {
    userId: string;
    onNarrationChange?: (newNarration: string) => void;
    activeNarration?: string; // Opt-in forcing a value
}

export default function NarrationSwitcher({ userId, onNarrationChange, activeNarration: propNarration }: NarrationSwitcherProps) {
    const [narration, setNarration] = React.useState<string>('Hafs');
    const [loading, setLoading] = React.useState(false);

    React.useEffect(() => {
        if (propNarration) {
            setNarration(propNarration);
        } else {
            fetchNarration();
        }
    }, [userId, propNarration]);

    async function fetchNarration() {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('qiraat')
                .eq('id', userId)
                .single();

            if (data) {
                setNarration(data.qiraat || 'Hafs');
            }
        } catch (error) {
            console.error('Error fetching narration:', error);
        }
    }

    async function toggleNarration() {
        lightImpact();
        const newNarration = narration === 'Hafs' ? 'Shubah' : 'Hafs';

        // Optimistic update
        setNarration(newNarration);
        setLoading(true);

        try {
            const { error } = await supabase
                .from('profiles')
                .update({ qiraat: newNarration })
                .eq('id', userId);

            if (error) throw error;

            if (onNarrationChange) {
                onNarrationChange(newNarration);
            }
        } catch (error) {
            console.error('Error updating narration:', error);
            // Revert on error
            setNarration(narration);
        } finally {
            setLoading(false);
        }
    }

    const isHafs = narration === 'Hafs';

    return (
        <TouchableOpacity
            activeOpacity={0.9}
            onPress={toggleNarration}
            style={styles.container}
        >
            <BlurView intensity={30} tint="dark" style={styles.glassContainer}>
                <LinearGradient
                    colors={isHafs
                        ? ['rgba(16, 185, 129, 0.15)', 'rgba(5, 150, 105, 0.05)'] // Emerald for Hafs
                        : ['rgba(245, 158, 11, 0.15)', 'rgba(217, 119, 6, 0.05)']  // Amber for Shubah
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.gradient}
                >
                    <View style={styles.content}>
                        <View style={styles.iconContainer}>
                            <Book size={20} color={isHafs ? Colors.emerald[400] : Colors.gold[400]} />
                        </View>

                        <View style={styles.textContainer}>
                            <Text style={styles.label}>Active Narration</Text>
                            <View style={styles.row}>
                                <Text style={styles.value}>{narration}</Text>
                                {loading && <ActivityIndicator size="small" color={Colors.neutral[400]} style={{ marginLeft: 8 }} />}
                            </View>
                        </View>

                        <View style={styles.actionIcon}>
                            <Repeat size={18} color={Colors.neutral[400]} />
                        </View>
                    </View>
                </LinearGradient>
            </BlurView>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        borderRadius: BorderRadius.xl,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        marginBottom: Spacing.md,
    },
    glassContainer: {
        width: '100%',
    },
    gradient: {
        padding: Spacing.md,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: BorderRadius.full,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    textContainer: {
        flex: 1,
    },
    label: {
        fontSize: Typography.fontSize.xs,
        color: Colors.neutral[400],
        marginBottom: 2,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    value: {
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    actionIcon: {
        padding: Spacing.xs,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: BorderRadius.full,
    },
});
