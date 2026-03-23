import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Light haptic feedback for button presses
 */
export const lightImpact = async () => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
};

/**
 * Medium haptic feedback for navigation
 */
export const mediumImpact = async () => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
};

/**
 * Heavy haptic feedback for important actions
 */
export const heavyImpact = async () => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
};

/**
 * Success haptic pattern
 */
export const successHaptic = async () => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
};

/**
 * Error haptic pattern
 */
export const errorHaptic = async () => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
};

/**
 * Warning haptic pattern
 */
export const warningHaptic = async () => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
};

/**
 * Selection haptic for toggles and selections
 */
export const selectionHaptic = async () => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
        await Haptics.selectionAsync();
    }
};
