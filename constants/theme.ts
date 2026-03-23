// Design System - Theme Constants (Mutqin 2026 — Spatial Islamic UI)
export const Colors = {
    // Primary Brand Colors (Deep Emerald & Teal)
    emerald: {
        50: '#ecfdf5',
        100: '#d1fae5',
        200: '#a7f3d0',
        300: '#6ee7b7',
        400: '#34d399',
        500: '#10b981',
        600: '#059669',
        700: '#047857',
        800: '#065f46',
        900: '#064e3b',
        950: '#022c22', // Deepest Emerald
    },

    // Accent Colors (Luxurious Gold)
    gold: {
        50: '#fffbeb',
        100: '#fef3c7',
        200: '#fde68a',
        300: '#fcd34d',
        400: '#fbbf24',
        500: '#f59e0b',
        600: '#d97706',
        700: '#b45309',
        800: '#92400e',
        900: '#78350f',
        950: '#451a03',
    },

    // Modern Neutrals (Slate/Zinc)
    neutral: {
        50: '#f8fafc',
        100: '#f1f5f9',
        200: '#e2e8f0',
        300: '#cbd5e1',
        400: '#64748b', // Improved contrast ratio: 4.73:1 on neutral[900]
        500: '#64748b',
        600: '#475569',
        700: '#334155',
        800: '#1e293b',
        900: '#0f172a',
        950: '#020617', // Almost Black
    },

    // Semantic Colors
    success: '#10b981', // Emerald 500
    warning: '#f59e0b', // Amber 500
    error: '#ef4444',   // Red 500
    info: '#3b82f6',    // Blue 500

    // Text Colors
    text: {
        primary: '#020617',   // Slate 950
        secondary: '#475569', // Slate 600
        tertiary: '#94a3b8',  // Slate 400
        inverse: '#ffffff',
        gold: '#d97706',      // Gold 600
    },

    // ✨ Neon Glow Accent Colors (New — for glowing borders and halos)
    neon: {
        emerald: 'rgba(52, 211, 153, 1)',      // Pure neon emerald
        emeraldGlow: 'rgba(52, 211, 153, 0.35)', // Glow aura
        emeraldMid: 'rgba(16, 185, 129, 0.5)',
        gold: 'rgba(251, 191, 36, 1)',          // Pure neon gold
        goldGlow: 'rgba(251, 191, 36, 0.35)',    // Glow aura
        goldMid: 'rgba(245, 158, 11, 0.5)',
        teal: 'rgba(20, 184, 166, 1)',
        tealGlow: 'rgba(20, 184, 166, 0.3)',
    },

    // Gradients (for 2026 aesthetics)
    gradients: {
        primary: ['#042f2e', '#0f766e', '#14b8a6'] as const, // Deep Emerald -> Teal
        gold: ['#78350f', '#d97706', '#fbbf24'] as const,    // Dark Gold -> Bright Gold
        dark: ['#020617', '#0f172a', '#1e293b'] as const,    // Deep Slate
        mesh: ['#022c22', '#115e59', '#0d9488', '#0f766e', '#042f2e'] as const, // Organic Mesh
        // ✨ New hero gradients
        heroEmerald: ['#011c1a', '#022c22', '#065f46', '#0f766e', '#115e59'] as const,
        heroGold: ['#1c0e00', '#451a03', '#78350f', '#b45309', '#d97706'] as const,
        bentoEmerald: ['#022c22', '#047857', '#059669'] as const,
        bentoGold: ['#451a03', '#b45309', '#d97706'] as const,
    }
};

export const Typography = {
    // Font Sizes (Scaled for readability)
    fontSize: {
        xs: 12,
        sm: 14,
        base: 16,
        lg: 18,
        xl: 20,
        '2xl': 24,
        '3xl': 30,
        '4xl': 36,
        '5xl': 48,
        '6xl': 60,
    },

    // Font Families
    fontFamily: {
        arabic: 'NotoNaskhArabic_400Regular',
        arabicBold: 'NotoNaskhArabic_700Bold',
        latin: undefined as string | undefined, // system default
    },

    // Font Weights
    fontWeight: {
        normal: '400' as const,
        medium: '500' as const,
        semibold: '600' as const,
        bold: '700' as const,
        extrabold: '800' as const,
    },

    // Line Heights
    lineHeight: {
        tight: 1.25,
        normal: 1.5,
        relaxed: 1.75,
        loose: 2,
    },
};

export const Spacing = {
    xs: 4,
    sm: 8,
    md: 12,
    base: 16,
    lg: 20,
    xl: 24,
    '2xl': 32,
    '3xl': 40,
    '4xl': 48,
    '5xl': 64,
    '6xl': 80,
};

export const BorderRadius = {
    none: 0,
    sm: 6,
    base: 10,
    md: 14,
    lg: 18,
    xl: 24,
    '2xl': 32,
    '3xl': 40,
    full: 9999,
};

export const Shadows = {
    sm: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
    },
    base: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 4,
    },
    md: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
        elevation: 8,
    },
    lg: {
        shadowColor: Colors.emerald[900], // Colored shadow for depth
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
        elevation: 12,
    },
    xl: {
        shadowColor: Colors.emerald[950],
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.2,
        shadowRadius: 32,
        elevation: 20,
    },
    // ✨ Neon glow shadows
    glowEmerald: {
        shadowColor: Colors.emerald[400],
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 20,
        elevation: 16,
    },
    glowGold: {
        shadowColor: Colors.gold[400],
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 20,
        elevation: 16,
    },
    glowEmeraldStrong: {
        shadowColor: Colors.emerald[300],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.8,
        shadowRadius: 28,
        elevation: 20,
    },
    glowGoldStrong: {
        shadowColor: Colors.gold[300],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.8,
        shadowRadius: 28,
        elevation: 20,
    },
};

export const Theme = {
    colors: Colors,
    typography: Typography,
    spacing: Spacing,
    borderRadius: BorderRadius,
    shadows: Shadows,
};

export default Theme;
