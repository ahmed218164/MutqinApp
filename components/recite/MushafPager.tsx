import * as React from 'react';
import { StyleSheet, View, Text, Image, TextInput, TouchableOpacity, Keyboard } from 'react-native';
import PagerView from 'react-native-pager-view';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay } from 'react-native-reanimated';
import MushafPage, { getPageSource } from './MushafPage';
import { Typography, Spacing, BorderRadius, Colors } from '../../constants/theme';
import { SURAHS } from '../../constants/surahs';

// ── Juz start pages (1-indexed, standard Mushaf) ──────────────────────────────
const JUZ_PAGES: number[] = [
    1,22,42,62,82,102,121,142,162,182,
    201,222,242,262,282,302,322,342,362,382,
    402,422,442,462,482,502,522,542,562,582,
];

function getJuzForPage(page: number): number {
    for (let j = JUZ_PAGES.length - 1; j >= 0; j--) {
        if (page >= JUZ_PAGES[j]) return j + 1;
    }
    return 1;
}

function getSurahForPage(page: number): string {
    for (let i = SURAHS.length - 1; i >= 0; i--) {
        if (page >= SURAHS[i].page) return SURAHS[i].name;
    }
    return SURAHS[0].name;
}

interface Props {
    startPage: number;
    endPage: number;
    currentPage: number;
    onPageChange: (page: number) => void;
    /** Audio-driven highlight ("surah:ayah") — gold overlay. */
    highlightedVerseKey?: string;
    /** Manual long-press highlight — emerald overlay. */
    longPressedVerseKey?: string;
    qiraat?: string;
    onVersePress?: (verseKey: string) => void;
    /** Fired when user long-presses an Ayah. */
    onVerseLongPress?: (verseKey: string) => void;
    /** Immersive state (controlled from parent recite.tsx). */
    immersive?: boolean;
    onImmersiveChange?: (immersive: boolean) => void;
    nightMode?: boolean;
    /**
     * Map of verseKey → page number, used for audio-sync auto page-flip.
     * Provided by recite.tsx from the `verses` array.
     */
    versePageMap?: Record<string, number>;
    heatmapData?: Record<string, string>;
    /** Ref callback for the PagerView (allows external page jumps). */
    goToPage?: number;
}

export default function MushafPager({
    startPage,
    endPage,
    currentPage,
    onPageChange,
    highlightedVerseKey,
    longPressedVerseKey,
    qiraat,
    onVersePress,
    onVerseLongPress,
    immersive = false,
    onImmersiveChange,
    nightMode = false,
    versePageMap,
    heatmapData,
    goToPage,
}: Props) {
    const pagerRef = React.useRef<PagerView>(null);

    // Page indicator fade state
    const indicatorOpacity = useSharedValue(0);
    const indicatorStyle = useAnimatedStyle(() => ({ opacity: indicatorOpacity.value }));

    const pages = React.useMemo(
        () => Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i),
        [startPage, endPage]
    );

    const initialIndex = Math.max(0, Math.min(currentPage - startPage, pages.length - 1));

    // ── Sync explicit page changes (e.g. from range selector) ──────────────────
    React.useEffect(() => {
        if (!pagerRef.current) return;
        const targetIndex = currentPage - startPage;
        if (targetIndex >= 0 && targetIndex < pages.length) {
            pagerRef.current.setPage(targetIndex);
        }
    }, [currentPage, startPage, pages.length]);

    // ── Audio-sync: auto page-flip when highlighted verse changes page ─────────
    React.useEffect(() => {
        if (!highlightedVerseKey || !versePageMap || !pagerRef.current) return;
        const versePage = versePageMap[highlightedVerseKey];
        if (versePage && versePage !== currentPage) {
            const targetIndex = versePage - startPage;
            if (targetIndex >= 0 && targetIndex < pages.length) {
                pagerRef.current.setPage(targetIndex);
                onPageChange(versePage);
            }
        }
    }, [highlightedVerseKey]);

    // Images are bundled locally — no network preloading needed.
    // Adjacent pages are pre-decoded via the hidden preload strip below.
    // offscreenPageLimit keeps those pages alive in PagerView's native tree.

    // ── Preload: resolve source references for ±2 adjacent pages ────────────
    // We import getPageSource here (it lives in MushafPage.tsx) but we only
    // need to trigger the native decode, so we re-use getPageSource exported
    // from MushafPage via a named re-export.
    // Simpler approach: render hidden 1×1 Image nodes for adjacent pages.
    const preloadPages = React.useMemo(() => {
        const adjacent: number[] = [];
        for (const delta of [-2, -1, 1, 2]) {
            const p = currentPage + delta;
            if (p >= startPage && p <= endPage) adjacent.push(p);
        }
        return adjacent;
    }, [currentPage, startPage, endPage]);

    // ── Page indicator: flash briefly on page change ───────────────────────
    const flashPageIndicator = React.useCallback(() => {
        indicatorOpacity.value = withTiming(1, { duration: 150 });
        indicatorOpacity.value = withDelay(1200, withTiming(0, { duration: 400 }));
    }, []);

    // ── Go-to-page jump state ──────────────────────────────────────────────
    const [jumpVisible, setJumpVisible] = React.useState(false);
    const [jumpText, setJumpText] = React.useState('');

    const handleJumpSubmit = React.useCallback(() => {
        const target = parseInt(jumpText, 10);
        if (!isNaN(target) && target >= startPage && target <= endPage) {
            const idx = target - startPage;
            pagerRef.current?.setPage(idx);
            onPageChange(target);
        }
        setJumpVisible(false);
        setJumpText('');
        Keyboard.dismiss();
    }, [jumpText, startPage, endPage, onPageChange]);

    // External goToPage prop
    React.useEffect(() => {
        if (goToPage && goToPage >= startPage && goToPage <= endPage) {
            const idx = goToPage - startPage;
            pagerRef.current?.setPageWithoutAnimation(idx);
        }
    }, [goToPage, startPage, endPage]);

    return (
        <View style={[styles.container, nightMode && styles.containerNight]}>
            <PagerView
                ref={pagerRef}
                style={styles.pager}
                initialPage={initialIndex}
                scrollEnabled={true}
                onPageSelected={(e) => {
                    const index = e.nativeEvent.position;
                    const newPage = startPage + index;
                    if (newPage !== currentPage) {
                        onPageChange(newPage);
                        flashPageIndicator();
                    }
                }}
                offscreenPageLimit={2}
                // RTL = swipe right → next page, matching Arabic Mushaf reading direction
                layoutDirection="rtl"
            >
                {pages.map((page) => (
                    <View key={page.toString()} style={styles.pageWrapper}>
                        <MushafPage
                            pageNumber={page}
                            highlightedVerseKey={highlightedVerseKey}
                            longPressedVerseKey={longPressedVerseKey}
                            isActive={
                                page === currentPage ||
                                page === currentPage + 1 ||
                                page === currentPage - 1
                            }
                            onVersePress={onVersePress}
                            onVerseLongPress={onVerseLongPress}
                            immersive={immersive}
                            onImmersiveChange={onImmersiveChange}
                            nightMode={nightMode}
                            heatmapData={heatmapData}
                        />
                    </View>
                ))}
            </PagerView>

            {/* ── Hidden preload strip ────────────────────────────────────
                Renders ±2 adjacent page images off-screen so the native image
                decoder pre-warms them before the user swipes. This eliminates
                the white flash on page transitions.
                1×1 size so it adds zero layout cost.
            ─────────────────────────────────────────────────────────────── */}
            <View style={styles.preloadStrip} pointerEvents="none">
                {preloadPages.map((p) => {
                    const src = getPageSource(p);
                    if (!src) return null;
                    return (
                        <Image
                            key={p}
                            source={src}
                            style={styles.preloadImage}
                            resizeMode="cover"
                            fadeDuration={0}
                        />
                    );
                })}
            </View>

            {/* Page Indicator — tap to jump, auto-hides after 1.5s */}
            {jumpVisible ? (
                <View style={styles.jumpContainer}>
                    <TextInput
                        style={styles.jumpInput}
                        placeholder="رقم الصفحة"
                        placeholderTextColor={Colors.neutral[400]}
                        keyboardType="number-pad"
                        value={jumpText}
                        onChangeText={setJumpText}
                        onSubmitEditing={handleJumpSubmit}
                        autoFocus
                        returnKeyType="go"
                    />
                    <TouchableOpacity onPress={handleJumpSubmit} style={styles.jumpButton}>
                        <Text style={styles.jumpButtonText}>✓</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setJumpVisible(false); setJumpText(''); Keyboard.dismiss(); }} style={styles.jumpButton}>
                        <Text style={styles.jumpButtonText}>✕</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <TouchableOpacity onPress={() => { setJumpVisible(true); flashPageIndicator(); }} activeOpacity={0.7}>
                    <Animated.View style={[styles.pageIndicator, indicatorStyle]} pointerEvents="box-none">
                        <Text style={styles.pageIndicatorText}>
                            {getSurahForPage(currentPage)} · الجزء {getJuzForPage(currentPage)} · ص {currentPage}
                        </Text>
                    </Animated.View>
                </TouchableOpacity>
            )}

            {/* Book-spine shadow — subtle depth on the right edge */}
            <View style={styles.bookSpine} pointerEvents="none" />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fdf6e3',  // Mushaf paper — physical color, not theme
    },
    containerNight: {
        backgroundColor: Colors.neutral[950],
    },
    pager: {
        flex: 1,
    },
    pageWrapper: {
        flex: 1,
    },
    pageIndicator: {
        position: 'absolute',
        bottom: 12,
        alignSelf: 'center',
        backgroundColor: 'rgba(0,0,0,0.55)',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.full,
    },
    pageIndicatorText: {
        color: Colors.text.inverse,
        fontSize: Typography.fontSize.xs,
        fontWeight: '600' as const,
        letterSpacing: 0.3,
    },
    // ── Preload strip: hidden images to pre-warm native image decoder ───────
    preloadStrip: {
        position: 'absolute',
        width: 1,
        height: 1,
        overflow: 'hidden',
        opacity: 0,
        // Place off-screen so it never flashes
        top: -2,
        left: -2,
    },
    preloadImage: {
        width: 1,
        height: 1,
    },
    bookSpine: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        right: 0,
        width: 6,
        backgroundColor: 'transparent',
        shadowColor: '#000',
        shadowOffset: { width: -4, height: 0 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 4,
    },
    jumpContainer: {
        position: 'absolute',
        bottom: 16,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.85)',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 6,
        gap: 8,
    },
    jumpInput: {
        color: Colors.text.inverse,
        fontSize: 16,
        fontFamily: 'System',
        minWidth: 80,
        textAlign: 'center',
        paddingVertical: 4,
        borderBottomWidth: 1,
        borderBottomColor: Colors.neutral[400],
    },
    jumpButton: {
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    jumpButtonText: {
        color: Colors.emerald[400],
        fontSize: 20,
        fontWeight: '700',
    },
});

