/**
 * components/recite/ArcMenu.tsx
 *
 * Radial "Arc Menu" — appears on Mushaf verse long-press.
 *
 * Reference: arc_menu.xml from MainQuranActivity.java
 *
 * Five circular action buttons burst outward from the touch point
 * using spring-based animations (react-native-reanimated).
 *
 * Actions:
 *   1. 📋 Copy verse text
 *   2. 🔊 Play from this verse
 *   3. 🔖 Bookmark verse
 *   4. 📤 Share verse
 *   5. ✖  Close
 */

import * as React from 'react';
import {
    View,
    TouchableOpacity,
    Text,
    StyleSheet,
    Dimensions,
    Share,
    Alert,
    Clipboard,
} from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withDelay,
    withTiming,
    FadeIn,
    FadeOut,
    runOnJS,
} from 'react-native-reanimated';
import {
    Copy, Volume2, Bookmark, Share2, X,
} from 'lucide-react-native';
import { lightImpact, mediumImpact } from '../../lib/haptics';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ArcMenuProps {
    visible: boolean;
    /** Touch position (screen coordinates) — menu bursts from here */
    anchorX: number;
    anchorY: number;
    /** Verse key "surah:ayah" */
    verseKey: string;
    /** Full verse text (Arabic) for copy/share */
    verseText?: string;
    /** Surah name for sharing context */
    surahName?: string;
    onClose: () => void;
    onPlayFrom?: (verseKey: string) => void;
    onBookmark?: (verseKey: string) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BUTTON_SIZE = 48;
const RADIUS = 85;            // Arc radius from center
const ARC_START = -Math.PI;   // Start angle (left)
const ARC_END = 0;            // End angle (right) → 180° arc across top
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface ArcAction {
    id: string;
    icon: React.ComponentType<any>;
    color: string;
    label: string;
}

const ACTIONS: ArcAction[] = [
    { id: 'copy',     icon: Copy,     color: '#3B82F6', label: 'نسخ' },
    { id: 'play',     icon: Volume2,  color: '#10B981', label: 'تشغيل' },
    { id: 'bookmark', icon: Bookmark, color: '#F59E0B', label: 'حفظ' },
    { id: 'share',    icon: Share2,   color: '#8B5CF6', label: 'مشاركة' },
    { id: 'close',    icon: X,        color: '#EF4444', label: 'إغلاق' },
];

// ── ArcMenuButton ─────────────────────────────────────────────────────────────

function ArcMenuButton({
    action,
    index,
    totalCount,
    anchorX,
    anchorY,
    onPress,
}: {
    action: ArcAction;
    index: number;
    totalCount: number;
    anchorX: number;
    anchorY: number;
    onPress: () => void;
}) {
    const progress = useSharedValue(0);

    const angle = ARC_START + ((ARC_END - ARC_START) / (totalCount - 1)) * index;

    // Compute the target position offset from anchor
    const targetX = Math.cos(angle) * RADIUS;
    const targetY = Math.sin(angle) * RADIUS;

    React.useEffect(() => {
        progress.value = withDelay(
            index * 40,
            withSpring(1, {
                damping: 12,
                stiffness: 180,
                mass: 0.8,
            })
        );
        return () => { progress.value = 0; };
    }, []);

    const animStyle = useAnimatedStyle(() => {
        const p = progress.value;
        const tx = targetX * p;
        const ty = targetY * p;
        return {
            transform: [
                { translateX: tx },
                { translateY: ty },
                { scale: p },
            ] as any,
            opacity: p,
        };
    });

    const IconComponent = action.icon;

    return (
        <Animated.View
            style={[
                styles.arcButton,
                { backgroundColor: action.color },
                animStyle,
            ]}
        >
            <TouchableOpacity
                onPress={() => { lightImpact(); onPress(); }}
                activeOpacity={0.7}
                style={styles.arcButtonInner}
                accessibilityRole="button"
                accessibilityLabel={action.label}
            >
                <IconComponent size={20} color="#fff" />
            </TouchableOpacity>
        </Animated.View>
    );
}

// ── ArcMenu ───────────────────────────────────────────────────────────────────

export default function ArcMenu({
    visible,
    anchorX,
    anchorY,
    verseKey,
    verseText,
    surahName,
    onClose,
    onPlayFrom,
    onBookmark,
}: ArcMenuProps) {
    if (!visible) return null;

    // Clamp anchor to keep the arc on screen
    const safeX = Math.max(RADIUS + BUTTON_SIZE, Math.min(SCREEN_W - RADIUS - BUTTON_SIZE, anchorX));
    const safeY = Math.max(RADIUS + BUTTON_SIZE + 60, Math.min(SCREEN_H - BUTTON_SIZE, anchorY));

    const [suraStr, ayaStr] = verseKey.split(':');
    const verseRef = `{${surahName ?? `سورة ${suraStr}`} : ${ayaStr}}`;

    function handleAction(actionId: string) {
        switch (actionId) {
            case 'copy':
                if (verseText) {
                    Clipboard.setString(`${verseText}\n${verseRef}`);
                    Alert.alert('تم النسخ', 'تم نسخ الآية إلى الحافظة');
                }
                onClose();
                break;
            case 'play':
                onPlayFrom?.(verseKey);
                onClose();
                break;
            case 'bookmark':
                mediumImpact();
                onBookmark?.(verseKey);
                onClose();
                break;
            case 'share':
                if (verseText) {
                    Share.share({
                        message: `${verseText}\n\n${verseRef}`,
                    });
                }
                onClose();
                break;
            case 'close':
                onClose();
                break;
        }
    }

    return (
        <Animated.View
            style={StyleSheet.absoluteFill}
            entering={FadeIn.duration(100)}
            exiting={FadeOut.duration(100)}
        >
            {/* Dismissal backdrop */}
            <TouchableOpacity
                style={styles.backdrop}
                activeOpacity={1}
                onPress={onClose}
            />

            {/* Arc buttons container — positioned at the touch anchor */}
            <View style={[styles.arcCenter, { left: safeX, top: safeY }]}>
                {/* Center dot (touch origin indicator) */}
                <View style={styles.centerDot} />

                {/* Arc action buttons */}
                {ACTIONS.map((action, i) => (
                    <ArcMenuButton
                        key={action.id}
                        action={action}
                        index={i}
                        totalCount={ACTIONS.length}
                        anchorX={safeX}
                        anchorY={safeY}
                        onPress={() => handleAction(action.id)}
                    />
                ))}

                {/* Verse reference label */}
                <Animated.View
                    style={styles.verseLabelContainer}
                    entering={FadeIn.delay(200).duration(200)}
                >
                    <Text style={styles.verseLabel}>
                        الآية {ayaStr}
                    </Text>
                </Animated.View>
            </View>
        </Animated.View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.25)',
    },
    arcCenter: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
        // Zero-size container — buttons burst outward via transforms
        width: 0,
        height: 0,
    },
    centerDot: {
        position: 'absolute',
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: 'rgba(255,255,255,0.8)',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.15)',
    },
    arcButton: {
        position: 'absolute',
        width: BUTTON_SIZE,
        height: BUTTON_SIZE,
        borderRadius: BUTTON_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        // Subtle shadow for depth
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 5,
        elevation: 6,
    },
    arcButtonInner: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    verseLabelContainer: {
        position: 'absolute',
        top: -RADIUS - 40,
        backgroundColor: 'rgba(0,0,0,0.8)',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 16,
    },
    verseLabel: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
    },
});
