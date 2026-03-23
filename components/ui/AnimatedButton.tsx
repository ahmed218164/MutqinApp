import * as React from 'react';
import {
    TouchableOpacity,
    Animated,
    StyleSheet,
    ViewStyle,
    TextStyle,
    Text,
} from 'react-native';
import { lightImpact } from '../../lib/haptics';
import { AnimationDuration } from '../../constants/animations';

interface AnimatedButtonProps {
    onPress: () => void;
    children: React.ReactNode;
    style?: ViewStyle;
    textStyle?: TextStyle;
    disabled?: boolean;
}

export default function AnimatedButton({
    onPress,
    children,
    style,
    textStyle,
    disabled = false,
}: AnimatedButtonProps) {
    const scaleAnim = React.useRef(new Animated.Value(1)).current;

    const handlePressIn = () => {
        lightImpact();
        Animated.spring(scaleAnim, {
            toValue: 0.95,
            useNativeDriver: true,
            speed: 50,
        }).start();
    };

    const handlePressOut = () => {
        Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            speed: 50,
        }).start();
    };

    return (
        <TouchableOpacity
            onPress={onPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={disabled}
            activeOpacity={0.8}
        >
            <Animated.View
                style={[
                    styles.button,
                    style,
                    {
                        transform: [{ scale: scaleAnim }],
                        opacity: disabled ? 0.5 : 1,
                    },
                ]}
            >
                {typeof children === 'string' ? (
                    <Text style={[styles.text, textStyle]}>{children}</Text>
                ) : (
                    children
                )}
            </Animated.View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    button: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        fontSize: 16,
        fontWeight: '600',
    },
});
