import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    SafeAreaView,
    TouchableOpacity,
    Image,
    Linking
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Heart, Github, Globe, Mail } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors as StaticColors, Typography, Spacing, BorderRadius } from '../constants/theme';
import Card from '../components/ui/Card';

export default function AboutScreen() {
    const router = useRouter();

    const handleLink = (url: string) => {
        Linking.openURL(url);
    };

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
                <Text style={styles.title}>About Mutqin</Text>
            </LinearGradient>

            <ScrollView style={styles.content}>
                <View style={styles.logoContainer}>
                    <View style={styles.logoPlaceholder}>
                        <Text style={styles.logoText}>M</Text>
                    </View>
                    <Text style={styles.appName}>Mutqin App</Text>
                    <Text style={styles.version}>Version 1.0.0</Text>
                </View>

                <Card style={styles.card}>
                    <Text style={styles.sectionTitle}>Our Mission</Text>
                    <Text style={styles.text}>
                        Mutqin is designed to help Muslims around the world perfect their Quran memorization and recitation using advanced AI technology. We believe that everyone deserves a personal Quran tutor available 24/7.
                    </Text>
                </Card>

                <Card style={styles.card}>
                    <Text style={styles.sectionTitle}>Features</Text>
                    <View style={styles.featureRow}>
                        <Text style={styles.bullet}>•</Text>
                        <Text style={styles.featureText}>AI Tajweed Analysis</Text>
                    </View>
                    <View style={styles.featureRow}>
                        <Text style={styles.bullet}>•</Text>
                        <Text style={styles.featureText}>Personalized Memorization Plans</Text>
                    </View>
                    <View style={styles.featureRow}>
                        <Text style={styles.bullet}>•</Text>
                        <Text style={styles.featureText}>Progress Tracking & Analytics</Text>
                    </View>
                    <View style={styles.featureRow}>
                        <Text style={styles.bullet}>•</Text>
                        <Text style={styles.featureText}>Gamified Learning Experience</Text>
                    </View>
                </Card>

                <Card style={styles.card}>
                    <Text style={styles.sectionTitle}>Contact Us</Text>
                    <TouchableOpacity style={styles.linkRow} onPress={() => handleLink('mailto:support@mutqin.app')}>
                        <Mail size={20} color={StaticColors.emerald[600]} />
                        <Text style={styles.linkText}>ahmedelhawashy203033@gmail.com</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.linkRow} onPress={() => handleLink('https://github.com/mutqin')}>
                        <Github size={20} color={StaticColors.emerald[600]} />
                        <Text style={styles.linkText}>GitHub Repository</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.linkRow} onPress={() => handleLink('https://mutqin.app')}>
                        <Globe size={20} color={StaticColors.emerald[600]} />
                        <Text style={styles.linkText}>Visit Website</Text>
                    </TouchableOpacity>
                </Card>

                <View style={styles.footer}>
                    <Text style={styles.footerText}>Made by Ahmed Zaki</Text>
                    <Heart size={14} color={StaticColors.error} style={{ marginHorizontal: 4 }} fill={StaticColors.error} />
                    <Text style={styles.footerText}>for the Ummah</Text>
                </View>
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
    logoContainer: {
        alignItems: 'center',
        marginBottom: Spacing.xl,
        marginTop: Spacing.lg,
    },
    logoPlaceholder: {
        width: 80,
        height: 80,
        borderRadius: 20,
        backgroundColor: StaticColors.emerald[950],
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    logoText: {
        fontSize: 40,
        fontWeight: 'bold',
        color: StaticColors.gold[500],
    },
    appName: {
        fontSize: Typography.fontSize['2xl'],
        fontWeight: Typography.fontWeight.bold,
        color: StaticColors.emerald[950],
    },
    version: {
        fontSize: Typography.fontSize.sm,
        color: StaticColors.text.tertiary,
    },
    card: {
        marginBottom: Spacing.lg,
    },
    sectionTitle: {
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.bold,
        color: StaticColors.text.primary,
        marginBottom: Spacing.md,
    },
    text: {
        fontSize: Typography.fontSize.base,
        color: StaticColors.text.secondary,
        lineHeight: 24,
    },
    featureRow: {
        flexDirection: 'row',
        marginBottom: Spacing.xs,
    },
    bullet: {
        fontSize: Typography.fontSize.base,
        color: StaticColors.gold[600],
        marginRight: Spacing.sm,
    },
    featureText: {
        fontSize: Typography.fontSize.base,
        color: StaticColors.text.secondary,
    },
    linkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: Spacing.sm,
    },
    linkText: {
        fontSize: Typography.fontSize.base,
        color: StaticColors.emerald[600],
        marginLeft: Spacing.md,
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
        color: StaticColors.text.tertiary,
    },
});
