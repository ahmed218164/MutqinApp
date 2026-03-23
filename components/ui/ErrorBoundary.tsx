import * as React from 'react';
/* eslint-disable no-undef */
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';

interface ErrorBoundaryProps {
    children: any;
    fallback?: any;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { hasError: false, error: null };

    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: any) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <View style={styles.container}>
                    <Text style={styles.emoji}>⚠️</Text>
                    <Text style={styles.title}>حدث خطأ غير متوقع</Text>
                    <Text style={styles.message}>
                        عذراً، حدث خطأ في التطبيق. يرجى المحاولة مرة أخرى.
                    </Text>
                    {__DEV__ && this.state.error && (
                        <View style={styles.errorDetails}>
                            <Text style={styles.errorText}>{this.state.error.message}</Text>
                        </View>
                    )}
                    <TouchableOpacity style={styles.button} onPress={this.handleReset}>
                        <Text style={styles.buttonText}>إعادة المحاولة</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        return this.props.children;
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing['2xl'],
        backgroundColor: Colors.neutral[50],
    },
    emoji: {
        fontSize: 64,
        marginBottom: Spacing.lg,
    },
    title: {
        fontSize: Typography.fontSize['2xl'],
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.primary,
        marginBottom: Spacing.md,
        textAlign: 'center',
    },
    message: {
        fontSize: Typography.fontSize.base,
        color: Colors.text.secondary,
        textAlign: 'center',
        marginBottom: Spacing.xl,
        lineHeight: 24,
    },
    errorDetails: {
        backgroundColor: Colors.neutral[100],
        padding: Spacing.md,
        borderRadius: BorderRadius.lg,
        marginBottom: Spacing.xl,
        width: '100%',
    },
    errorText: {
        fontSize: Typography.fontSize.sm,
        color: Colors.error,
        fontFamily: 'monospace',
    },
    button: {
        backgroundColor: Colors.emerald[600],
        paddingHorizontal: Spacing['2xl'],
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.lg,
    },
    buttonText: {
        color: Colors.text.inverse,
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.bold,
    },
});

export default ErrorBoundary as any;
