/**
 * components/ui/DatePickerModal.tsx
 *
 * A fully JS-based, Expo Go-compatible date picker modal.
 * Uses only core React Native components — zero native modules required.
 *
 * Design: Spatial Islamic UI — dark glassmorphism panel with
 * three scrollable columns (Month | Day | Year), emerald active highlight,
 * and a smooth bottom sheet appearance.
 */

import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    ScrollView,
    Dimensions,
    Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

const MONTHS = [
    'January', 'February', 'March', 'April',
    'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December',
];

function daysInMonth(month: number, year: number): number {
    return new Date(year, month + 1, 0).getDate();
}

// ─── Single column scroll picker ─────────────────────────────────────────────

interface ColumnProps {
    items: string[];
    selectedIndex: number;
    onSelect: (i: number) => void;
    width: number;
}

function Column({ items, selectedIndex, onSelect, width }: ColumnProps) {
    const scrollRef = React.useRef<ScrollView>(null);

    // Scroll to selected index on mount/change
    React.useEffect(() => {
        scrollRef.current?.scrollTo({
            y: selectedIndex * ITEM_HEIGHT,
            animated: false,
        });
    }, [selectedIndex]);

    function onMomentumScrollEnd(e: any) {
        const y = e.nativeEvent.contentOffset.y;
        const index = Math.round(y / ITEM_HEIGHT);
        const clamped = Math.max(0, Math.min(index, items.length - 1));
        onSelect(clamped);
    }

    // Snap to nearest item on scroll end (drag)
    function onScrollEndDrag(e: any) {
        const y = e.nativeEvent.contentOffset.y;
        const index = Math.round(y / ITEM_HEIGHT);
        const clamped = Math.max(0, Math.min(index, items.length - 1));
        scrollRef.current?.scrollTo({ y: clamped * ITEM_HEIGHT, animated: true });
        onSelect(clamped);
    }

    return (
        <View style={[styles.column, { width }]}>
            {/* Fade top */}
            <LinearGradient
                colors={['rgba(2,26,26,1)', 'rgba(2,26,26,0)']}
                style={styles.fade}
                pointerEvents="none"
            />

            <ScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                snapToInterval={ITEM_HEIGHT}
                decelerationRate="fast"
                contentInset={{ top: ITEM_HEIGHT * 2, bottom: ITEM_HEIGHT * 2 }}
                contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * 2 }}
                onMomentumScrollEnd={onMomentumScrollEnd}
                onScrollEndDrag={onScrollEndDrag}
                scrollEventThrottle={16}
            >
                {items.map((item, i) => (
                    <TouchableOpacity
                        key={i}
                        style={styles.item}
                        onPress={() => {
                            scrollRef.current?.scrollTo({ y: i * ITEM_HEIGHT, animated: true });
                            onSelect(i);
                        }}
                        activeOpacity={0.7}
                    >
                        <Text style={[
                            styles.itemText,
                            i === selectedIndex && styles.itemTextActive,
                        ]}>
                            {item}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* Fade bottom */}
            <LinearGradient
                colors={['rgba(2,26,26,0)', 'rgba(2,26,26,1)']}
                style={[styles.fade, styles.fadeBottom]}
                pointerEvents="none"
            />

            {/* Selection highlight band */}
            <View style={styles.selectionBand} pointerEvents="none">
                <LinearGradient
                    colors={['rgba(52,211,153,0.08)', 'rgba(52,211,153,0.14)', 'rgba(52,211,153,0.08)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                />
                <View style={styles.selectionBorderTop} />
                <View style={styles.selectionBorderBottom} />
            </View>
        </View>
    );
}

// ─── Main DatePickerModal ─────────────────────────────────────────────────────

interface DatePickerModalProps {
    visible: boolean;
    value: Date;
    minimumDate?: Date;
    onConfirm: (date: Date) => void;
    onCancel: () => void;
}

export default function DatePickerModal({
    visible,
    value,
    minimumDate,
    onConfirm,
    onCancel,
}: DatePickerModalProps) {
    const minYear = minimumDate
        ? minimumDate.getFullYear()
        : new Date().getFullYear();
    const maxYear = new Date().getFullYear() + 20;

    const years = Array.from(
        { length: maxYear - minYear + 1 },
        (_, i) => (minYear + i).toString()
    );

    const [selectedMonth, setSelectedMonth] = React.useState(value.getMonth());
    const [selectedDay, setSelectedDay] = React.useState(value.getDate() - 1); // 0-based
    const [selectedYear, setSelectedYear] = React.useState(
        Math.max(0, value.getFullYear() - minYear)
    );

    // Recompute days array whenever month/year change
    const currentYear = minYear + selectedYear;
    const totalDays = daysInMonth(selectedMonth, currentYear);
    const days = Array.from({ length: totalDays }, (_, i) =>
        String(i + 1).padStart(2, '0')
    );

    // Clamp day if month change reduces days
    React.useEffect(() => {
        if (selectedDay >= totalDays) {
            setSelectedDay(totalDays - 1);
        }
    }, [selectedMonth, selectedYear]);

    function handleConfirm() {
        const day = selectedDay + 1;
        const month = selectedMonth;
        const year = minYear + selectedYear;
        const date = new Date(year, month, day);
        onConfirm(date);
    }

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            statusBarTranslucent
            onRequestClose={onCancel}
        >
            {/* Backdrop */}
            <TouchableOpacity
                style={styles.backdrop}
                onPress={onCancel}
                activeOpacity={1}
            />

            {/* Panel */}
            <View style={styles.panel}>
                {Platform.OS === 'ios' ? (
                    <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
                ) : (
                    <View style={[StyleSheet.absoluteFill, styles.androidBg]} />
                )}

                {/* Shimmer top border */}
                <LinearGradient
                    colors={[Colors.emerald[400], Colors.gold[400], Colors.emerald[400]]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.topBorder}
                />

                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={styles.headerCancel}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Select Date</Text>
                    <TouchableOpacity onPress={handleConfirm} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={styles.headerConfirm}>Done</Text>
                    </TouchableOpacity>
                </View>

                {/* Column labels */}
                <View style={styles.labels}>
                    <Text style={[styles.columnLabel, { flex: 2 }]}>Month</Text>
                    <Text style={[styles.columnLabel, { flex: 1 }]}>Day</Text>
                    <Text style={[styles.columnLabel, { flex: 1.2 }]}>Year</Text>
                </View>

                {/* Picker columns */}
                <View style={[styles.columnsRow, { height: PICKER_HEIGHT }]}>
                    <Column
                        items={MONTHS}
                        selectedIndex={selectedMonth}
                        onSelect={setSelectedMonth}
                        width={(SCREEN_WIDTH - 48) * 0.45}
                    />
                    <Column
                        items={days}
                        selectedIndex={Math.min(selectedDay, totalDays - 1)}
                        onSelect={setSelectedDay}
                        width={(SCREEN_WIDTH - 48) * 0.25}
                    />
                    <Column
                        items={years}
                        selectedIndex={selectedYear}
                        onSelect={setSelectedYear}
                        width={(SCREEN_WIDTH - 48) * 0.3}
                    />
                </View>

                {/* Confirm button */}
                <TouchableOpacity
                    style={styles.confirmButton}
                    onPress={handleConfirm}
                    activeOpacity={0.85}
                >
                    <LinearGradient
                        colors={[Colors.emerald[600], Colors.emerald[700]]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.confirmGradient}
                    >
                        <Text style={styles.confirmText}>Confirm Date</Text>
                    </LinearGradient>
                </TouchableOpacity>

                {/* iOS safe-area spacer */}
                <View style={{ height: Platform.OS === 'ios' ? 24 : 16 }} />
            </View>
        </Modal>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    panel: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        borderTopLeftRadius: BorderRadius['2xl'],
        borderTopRightRadius: BorderRadius['2xl'],
        overflow: 'hidden',
        borderWidth: 1,
        borderBottomWidth: 0,
        borderColor: 'rgba(52,211,153,0.2)',
        shadowColor: Colors.emerald[400],
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.4,
        shadowRadius: 24,
        elevation: 24,
    },
    androidBg: {
        backgroundColor: '#081c1a',
    },
    topBorder: {
        height: 1.5,
        width: '100%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.xl,
        paddingTop: Spacing.lg,
        paddingBottom: Spacing.md,
    },
    headerTitle: {
        fontSize: Typography.fontSize.base,
        fontWeight: '700',
        color: Colors.text.inverse,
        letterSpacing: 0.3,
    },
    headerCancel: {
        fontSize: Typography.fontSize.base,
        color: 'rgba(255,255,255,0.45)',
        fontWeight: '500',
    },
    headerConfirm: {
        fontSize: Typography.fontSize.base,
        color: Colors.emerald[400],
        fontWeight: '700',
    },
    labels: {
        flexDirection: 'row',
        paddingHorizontal: Spacing.xl,
        marginBottom: Spacing.xs,
    },
    columnLabel: {
        fontSize: Typography.fontSize.xs,
        color: Colors.text.tertiary,
        textAlign: 'center',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
    columnsRow: {
        flexDirection: 'row',
        paddingHorizontal: Spacing.xl,
        gap: Spacing.xs,
    },
    column: {
        position: 'relative',
        overflow: 'hidden',
        borderRadius: BorderRadius.lg,
    },
    item: {
        height: ITEM_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
    },
    itemText: {
        fontSize: Typography.fontSize.base,
        color: 'rgba(255,255,255,0.35)',
        fontWeight: '500',
    },
    itemTextActive: {
        color: Colors.text.inverse,
        fontWeight: '700',
        fontSize: Typography.fontSize.lg,
    },
    fade: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: ITEM_HEIGHT * 2,
        zIndex: 2,
    },
    fadeBottom: {
        top: undefined,
        bottom: 0,
    },
    selectionBand: {
        position: 'absolute',
        top: '50%',
        left: 0,
        right: 0,
        height: ITEM_HEIGHT,
        marginTop: -ITEM_HEIGHT / 2,
        zIndex: 1,
    },
    selectionBorderTop: {
        position: 'absolute',
        top: 0,
        left: 8,
        right: 8,
        height: 1,
        backgroundColor: 'rgba(52,211,153,0.35)',
    },
    selectionBorderBottom: {
        position: 'absolute',
        bottom: 0,
        left: 8,
        right: 8,
        height: 1,
        backgroundColor: 'rgba(52,211,153,0.35)',
    },
    confirmButton: {
        marginHorizontal: Spacing.xl,
        marginTop: Spacing.lg,
        borderRadius: BorderRadius.lg,
        overflow: 'hidden',
        shadowColor: Colors.emerald[400],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    confirmGradient: {
        paddingVertical: Spacing.base,
        alignItems: 'center',
    },
    confirmText: {
        fontSize: Typography.fontSize.base,
        fontWeight: '700',
        color: '#fff',
        letterSpacing: 0.4,
    },
});
