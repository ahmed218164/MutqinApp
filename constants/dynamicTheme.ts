import { useSettings } from '../lib/settings';
import { Colors as LightColors } from './theme';

// Dark Mode Colors
const DarkColors = {
    emerald: LightColors.emerald,
    gold: LightColors.gold,
    neutral: {
        50: '#0f172a', // Dark background
        100: '#1e293b',
        200: '#334155',
        300: '#475569',
        400: '#64748b',
        500: '#94a3b8',
        600: '#cbd5e1',
        700: '#e2e8f0',
        800: '#f1f5f9',
        900: '#f8fafc',
    },
    success: LightColors.success,
    warning: LightColors.warning,
    error: LightColors.error,
    info: LightColors.info,
    text: {
        primary: '#f8fafc',
        secondary: '#cbd5e1',
        tertiary: '#94a3b8',
        inverse: '#0f172a',
    },
};

/**
 * Hook للحصول على الألوان حسب الثيم الحالي
 */
export function useThemeColors() {
    const { theme } = useSettings();
    return theme === 'dark' ? DarkColors : LightColors;
}

export { DarkColors, LightColors };
