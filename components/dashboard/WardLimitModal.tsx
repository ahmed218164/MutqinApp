import * as React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { AlertCircle, Coffee, Zap } from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import { BlurView } from 'expo-blur';
import { mediumImpact } from '../../lib/haptics';

interface WardLimitModalProps {
    visible: boolean;
    wardsCompleted: number;
    onRest: () => void;
    onContinue: () => void;
}

export default function WardLimitModal({
    visible,
    wardsCompleted,
    onRest,
    onContinue,
}: WardLimitModalProps) {
    const handleRest = () => {
        mediumImpact();
        onRest();
    };

    const handleContinue = () => {
        mediumImpact();
        onContinue();
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={handleRest}
        >
            <View style={styles.overlay}>
                <BlurView intensity={20} tint="dark" style={styles.blurView}>
                    <View style={styles.modal}>
                        {/* Medical Icon */}
                        <View style={styles.iconContainer}>
                            <View style={styles.iconCircle}>
                                <AlertCircle size={48} color={Colors.gold[500]} />
                            </View>
                        </View>

                        {/* Title */}
                        <Text style={styles.title}>أحسنت يا دكتور! 🩺</Text>

                        {/* Message */}
                        <Text style={styles.message}>
                            لقد أكملت <Text style={styles.highlight}>{wardsCompleted} أوراد</Text> اليوم.
                            {'\n\n'}
                            من المهم أخذ قسط من الراحة لتثبيت الحفظ في الذاكرة طويلة المدى.
                        </Text>

                        {/* Warning Box */}
                        <View style={styles.warningBox}>
                            <Zap size={16} color={Colors.gold[400]} />
                            <Text style={styles.warningText}>
                                إذا اخترت المتابعة، سيتم اختبارك عشوائياً من أوراد اليوم
                            </Text>
                        </View>

                        {/* Buttons */}
                        <View style={styles.buttons}>
                            {/* Rest Button (Recommended) */}
                            <TouchableOpacity
                                style={[styles.button, styles.restButton]}
                                onPress={handleRest}
                            >
                                <Coffee size={20} color={Colors.text.inverse} />
                                <Text style={styles.restButtonText}>استرح (موصى به)</Text>
                            </TouchableOpacity>

                            {/* Continue Button */}
                            <TouchableOpacity
                                style={[styles.button, styles.continueButton]}
                                onPress={handleContinue}
                            >
                                <Zap size={20} color={Colors.gold[700]} />
                                <Text style={styles.continueButtonText}>تابع الاختبار</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Footer Note */}
                        <Text style={styles.footerNote}>
                            💡 الدراسات تُظهر أن الراحة تُحسّن الاحتفاظ بالمعلومات بنسبة 40%
                        </Text>
                    </View>
                </BlurView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    blurView: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modal: {
        width: '90%',
        maxWidth: 400,
        backgroundColor: Colors.neutral[900],
        borderRadius: BorderRadius['2xl'],
        padding: Spacing['2xl'],
        borderWidth: 1,
        borderColor: Colors.gold[500] + '40',
    },
    iconContainer: {
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    iconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: Colors.gold[500] + '20',
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: Typography.fontSize['2xl'],
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        textAlign: 'center',
        marginBottom: Spacing.md,
    },
    message: {
        fontSize: Typography.fontSize.base,
        color: Colors.text.secondary,
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: Spacing.lg,
    },
    highlight: {
        color: Colors.gold[400],
        fontWeight: Typography.fontWeight.bold,
    },
    warningBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        backgroundColor: Colors.gold[500] + '10',
        padding: Spacing.md,
        borderRadius: BorderRadius.lg,
        borderLeftWidth: 3,
        borderLeftColor: Colors.gold[500],
        marginBottom: Spacing.xl,
    },
    warningText: {
        flex: 1,
        fontSize: Typography.fontSize.sm,
        color: Colors.gold[300],
        lineHeight: 20,
    },
    buttons: {
        gap: Spacing.md,
        marginBottom: Spacing.md,
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.lg,
    },
    restButton: {
        backgroundColor: Colors.emerald[600],
    },
    restButtonText: {
        fontSize: Typography.fontSize.base,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
    },
    continueButton: {
        backgroundColor: Colors.gold[500] + '20',
        borderWidth: 1,
        borderColor: Colors.gold[500],
    },
    continueButtonText: {
        fontSize: Typography.fontSize.base,
        fontWeight: Typography.fontWeight.semibold,
        color: Colors.gold[400],
    },
    footerNote: {
        fontSize: Typography.fontSize.xs,
        color: Colors.text.tertiary,
        textAlign: 'center',
        lineHeight: 18,
    },
});
