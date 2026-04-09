/**
 * AyahContextMenu
 * Bottom-sheet style context menu that slides up when the user long-presses
 * an Ayah on the Mushaf. Uses Reanimated withSpring for a 60fps UI-thread animation.
 */

import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TouchableWithoutFeedback,
    Alert,
    Share,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    runOnJS,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import {
    Headphones,
    BookOpen,
    Link2,
    Copy,
    Share2,
    X,
} from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import { lightImpact } from '../../lib/haptics';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AyahContextMenuProps {
    visible: boolean;
    verseKey: string;          // "surah:ayah"
    ayahText?: string;
    onClose: () => void;
    onPlayAyah: (verseKey: string) => void;
    onTafseer?: (verseKey: string) => void;
    onMutashabihat?: (verseKey: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const SHEET_HEIGHT = 345;

const SPRING_CONFIG = {
    damping: 20,
    stiffness: 160,
    mass: 0.8,
};

// ─────────────────────────────────────────────────────────────────────────────
// Menu Row
// ─────────────────────────────────────────────────────────────────────────────

interface MenuRowProps {
    icon: React.ReactNode;
    label: string;
    labelAr: string;
    onPress: () => void;
    tint?: string;
    last?: boolean;
}

function MenuRow({ icon, label, labelAr, onPress, tint = Colors.text.inverse, last }: MenuRowProps) {
    return (
        <>
            <TouchableOpacity style={styles.menuRow} onPress={onPress} activeOpacity={0.7}>
                <View style={[styles.menuRowIcon, { backgroundColor: tint + '22' }]}>
                    {icon}
                </View>
                <View style={styles.menuRowTexts}>
                    <Text style={styles.menuRowLabelAr}>{labelAr}</Text>
                    <Text style={styles.menuRowLabel}>{label}</Text>
                </View>
            </TouchableOpacity>
            {!last && <View style={styles.menuDivider} />}
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AyahContextMenu({
    visible,
    verseKey,
    ayahText,
    onClose,
    onPlayAyah,
    onTafseer,
    onMutashabihat,
}: AyahContextMenuProps) {
    const translateY = useSharedValue(SHEET_HEIGHT + 40);
    const backdropOpacity = useSharedValue(0);
    // `isMounted` drives the null-return guard — updated via runOnJS after slide-out completes.
    // We deliberately do NOT read translateY.value during render (Reanimated strict-mode violation).
    const [isMounted, setIsMounted] = React.useState(visible);

    const [surahNum, ayahNum] = verseKey.split(':');

    // ── Animation: slide in / out ──────────────────────────────────────────────
    React.useEffect(() => {
        if (visible) {
            setIsMounted(true);
            backdropOpacity.value = withTiming(1, { duration: 220 });
            translateY.value = withSpring(0, SPRING_CONFIG);
        } else {
            backdropOpacity.value = withTiming(0, { duration: 180 });
            translateY.value = withSpring(SHEET_HEIGHT + 40, SPRING_CONFIG, () => {
                runOnJS(setIsMounted)(false);
            });
        }
    }, [visible]);

    const sheetStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: backdropOpacity.value,
    }));

    // Guard: don't render anything until mounted, and unmount after slide-out animation
    if (!isMounted) return null;

    // ── Action handlers ────────────────────────────────────────────────────────

    const handlePlay = () => {
        lightImpact();
        onClose();
        onPlayAyah(verseKey);
    };

    const handleTafseer = () => {
        lightImpact();
        onClose();
        if (onTafseer) {
            onTafseer(verseKey);
        } else {
            Alert.alert(
                'التفسير',
                `سيتم إضافة تفسير الآية ${ayahNum} من سورة رقم ${surahNum} في الإصدار القادم.`,
                [{ text: 'حسناً' }]
            );
        }
    };

    const handleMutashabihat = () => {
        lightImpact();
        onClose();
        if (onMutashabihat) {
            onMutashabihat(verseKey);
        } else {
            Alert.alert(
                'المتشابهات',
                `سيتم ربط الآية ${ayahNum} من سورة ${surahNum} بمحرّك المتشابهات في الإصدار القادم.`,
                [{ text: 'حسناً' }]
            );
        }
    };

    const handleCopy = async () => {
        lightImpact();
        const textToCopy = ayahText ?? `${surahNum}:${ayahNum}`;
        onClose();
        try {
            await Clipboard.setStringAsync(textToCopy);
            Alert.alert('تم النسخ ✅', 'تم نسخ نص الآية');
        } catch {
            // Clipboard write failed — fall back silently
        }
    };

    const handleShare = async () => {
        lightImpact();
        const textToShare = ayahText
            ? `﴿${ayahText}﴾\n— سورة ${surahNum} : ${ayahNum}`
            : `${surahNum}:${ayahNum}`;
        onClose();
        try {
            await Share.share({ message: textToShare });
        } catch {
            // User dismissed share sheet — no-op
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">

            {/* Backdrop */}
            <TouchableWithoutFeedback onPress={onClose}>
                <Animated.View style={[styles.backdrop, backdropStyle]} />
            </TouchableWithoutFeedback>

            {/* Sheet */}
            <Animated.View style={[styles.sheet, sheetStyle]}>
                <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />

                {/* Handle + Header */}
                <View style={styles.header}>
                    <View style={styles.handle} />
                    <Text style={styles.headerTitle}>
                        الآية {ayahNum} — سورة {surahNum}
                    </Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <X size={18} color={Colors.text.tertiary} />
                    </TouchableOpacity>
                </View>

                {/* Menu Items */}
                <View style={styles.menuContainer}>
                    <MenuRow
                        icon={<Headphones size={18} color={Colors.gold[400]} />}
                        labelAr="تشغيل هذه الآية"
                        label="Play this Ayah"
                        tint={Colors.gold[400]}
                        onPress={handlePlay}
                    />
                    <MenuRow
                        icon={<BookOpen size={18} color={Colors.emerald[400]} />}
                        labelAr="التفسير"
                        label="Tafseer"
                        tint={Colors.emerald[400]}
                        onPress={handleTafseer}
                    />
                    <MenuRow
                        icon={<Link2 size={18} color="#60a5fa" />}
                        labelAr="المتشابهات"
                        label="Mutashabihat"
                        tint="#60a5fa"
                        onPress={handleMutashabihat}
                    />
                    <MenuRow
                        icon={<Copy size={18} color={Colors.text.secondary} />}
                        labelAr="نسخ الآية"
                        label="Copy Text"
                        tint={Colors.text.secondary}
                        onPress={handleCopy}
                    />
                    <MenuRow
                        icon={<Share2 size={18} color={Colors.gold[300]} />}
                        labelAr="مشاركة الآية"
                        label="Share Ayah"
                        tint={Colors.gold[300]}
                        onPress={handleShare}
                        last
                    />
                </View>
            </Animated.View>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: SHEET_HEIGHT,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
        backgroundColor: 'rgba(15,20,30,0.92)',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.md,
        paddingBottom: Spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.07)',
    },
    handle: {
        position: 'absolute',
        top: 8,
        alignSelf: 'center',
        left: '50%',
        marginLeft: -20,
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    headerTitle: {
        flex: 1,
        fontSize: Typography.fontSize.base,
        fontWeight: '700' as const,
        color: Colors.text.inverse,
        textAlign: 'right',
        marginTop: Spacing.xs,
    },
    closeBtn: {
        padding: Spacing.xs,
        marginLeft: Spacing.sm,
    },
    menuContainer: {
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.md,
    },
    menuRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: Spacing.md,
        gap: Spacing.md,
    },
    menuRowIcon: {
        width: 38,
        height: 38,
        borderRadius: BorderRadius.lg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    menuRowTexts: {
        flex: 1,
        alignItems: 'flex-end',
    },
    menuRowLabelAr: {
        fontSize: Typography.fontSize.base,
        fontWeight: '600' as const,
        color: Colors.text.inverse,
        textAlign: 'right',
    },
    menuRowLabel: {
        fontSize: Typography.fontSize.xs,
        color: Colors.text.tertiary,
        marginTop: 1,
    },
    menuDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginLeft: 52,
    },
});
