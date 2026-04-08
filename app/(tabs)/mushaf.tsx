import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    TextInput,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { Search, ChevronRight, BookOpen, Bookmark } from 'lucide-react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    useAnimatedScrollHandler,
    withTiming,
    withSpring,
    interpolate,
    Easing,
    Extrapolation,
} from 'react-native-reanimated';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import Card from '../../components/ui/Card';
import ModernBackground from '../../components/ui/ModernBackground';
import { SURAHS, Surah, searchSurahs } from '../../constants/surahs';
import SkeletonLoader from '../../components/ui/SkeletonLoader';
import EmptyState from '../../components/ui/EmptyState';
import { StaggerDelay } from '../../constants/animations';
import SearchModal, { type SearchJumpTarget } from '../../components/mushaf/SearchModal';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList) as any;

// ── Glowing Metallic Ring for Surah Number ─────────────────────────────────
function MetallicNumberRing({ number, accentColor }: { number: number; accentColor: string }) {
    return (
        <View style={[ringStyles.outer, { borderColor: accentColor + '55', shadowColor: accentColor }]}>
            <LinearGradient
                colors={[accentColor + '30', accentColor + '08', 'transparent']}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, { borderRadius: BorderRadius.full }]}
            />
            <Text style={[ringStyles.number, { color: accentColor }]}>{number}</Text>
        </View>
    );
}

const ringStyles = StyleSheet.create({
    outer: {
        width: 46,
        height: 46,
        borderRadius: 23,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
        marginEnd: Spacing.base,  // RTL-safe (was marginLeft)
        overflow: 'hidden',
        // Metallic glow shadow
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
        elevation: 6,
    },
    number: {
        fontSize: Typography.fontSize.sm,
        fontWeight: '700' as const,
        letterSpacing: -0.3,
    },
});

// ── Frosted-glass Surah Row ────────────────────────────────────────────────────
const SurahRow = React.memo(function SurahRow({ item, index, onPress }: { item: Surah; index: number; onPress: () => void }) {
    const scaleVal = useSharedValue(1);
    const opacity = useSharedValue(0);
    const translateX = useSharedValue(-12);

    React.useEffect(() => {
        const delay = StaggerDelay * Math.min(index, 12);
        const timer = setTimeout(() => {
            opacity.value = withTiming(1, { duration: 340, easing: Easing.out(Easing.cubic) });
            translateX.value = withTiming(0, { duration: 340, easing: Easing.out(Easing.cubic) });
        }, delay);
        return () => clearTimeout(timer);
    }, []);

    const handlePressIn = () => { scaleVal.value = withSpring(0.97, { damping: 14, stiffness: 180 }); };
    const handlePressOut = () => { scaleVal.value = withSpring(1, { damping: 10, stiffness: 140 }); };

    const animStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateX: translateX.value }] as any,
    }));

    const pressStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scaleVal.value }],
    }));

    // Alternate accent color: Makki surahs -> emerald, Madani -> gold
    const accentColor = item.type === 'Makki' ? Colors.emerald[400] : Colors.gold[400];

    return (
        <Animated.View style={[rowStyles.wrapper, animStyle, pressStyle]}>
            <TouchableOpacity
                onPress={onPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                activeOpacity={1}
                style={rowStyles.touchable}
                accessibilityRole="button"
                accessibilityLabel={`افتح سورة ${item.name}`}
            >
                {/* Frosted glass backing */}
                {Platform.OS !== 'android' ? (
                    <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
                ) : (
                    <View style={[StyleSheet.absoluteFill, rowStyles.androidBg]} />
                )}

                {/* Subtle left accent line */}
                <View style={[rowStyles.accentLine, { backgroundColor: accentColor }]} />

                {/* Content */}
                <MetallicNumberRing number={item.number} accentColor={accentColor} />

                <View style={rowStyles.info}>
                    <Text style={rowStyles.arabicName}>{item.name}</Text>
                    <Text style={rowStyles.transliteration}>{item.transliteration}</Text>
                    <View style={rowStyles.metaRow}>
                        <View style={[rowStyles.typePill, { backgroundColor: accentColor + '15', borderColor: accentColor + '40' }]}>
                            <Text style={[rowStyles.typePillText, { color: accentColor }]}>{item.type === 'Makki' ? 'مكية' : 'مدنية'}</Text>
                        </View>
                        <Text style={rowStyles.metaDot}>·</Text>
                        <Text style={rowStyles.metaText}>{item.verses} آية</Text>
                    </View>
                </View>

                <ChevronRight color={Colors.neutral[600]} size={17} />
            </TouchableOpacity>
        </Animated.View>
    );
});

const rowStyles = StyleSheet.create({
    wrapper: {
        marginBottom: 8,
        borderRadius: BorderRadius.xl,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.07)',
        backgroundColor: 'transparent',
    },
    touchable: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingRight: Spacing.base,
        paddingLeft: 0,
        position: 'relative',
    },
    androidBg: {
        backgroundColor: 'rgba(15, 23, 42, 0.88)',
    },
    accentLine: {
        position: 'absolute',
        left: 0,
        top: 12,
        bottom: 12,
        width: 3,
        borderRadius: 2,
        opacity: 0.8,
    },
    info: {
        flex: 1,
    },
    arabicName: {
        fontSize: Typography.fontSize.lg,
        fontWeight: '700' as const,
        color: Colors.text.inverse,
        marginBottom: 2,
    },
    transliteration: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.tertiary,
        marginBottom: 5,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    typePill: {
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
    },
    typePillText: {
        fontSize: 9,
        fontWeight: '700' as const,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    metaDot: {
        color: Colors.text.tertiary,
        fontSize: Typography.fontSize.sm,
    },
    metaText: {
        fontSize: Typography.fontSize.xs,
        color: Colors.text.tertiary,
    },
});

// ── Main Screen ────────────────────────────────────────────────────────────
export default function MushafScreen() {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = React.useState('');
    const [filteredSurahs, setFilteredSurahs] = React.useState(SURAHS);
    const [loading] = React.useState(false);
    const [searchModalVisible, setSearchModalVisible] = React.useState(false);

    // Sticky header hide/show on scroll
    const scrollY = useSharedValue(0);
    const HEADER_COLLAPSE_HEIGHT = 60;

    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollY.value = event.contentOffset.y;
        },
    });

    // Header title shrinks + fades slightly on scroll
    const headerAnimStyle = useAnimatedStyle(() => {
        const opacity = interpolate(
            scrollY.value,
            [0, HEADER_COLLAPSE_HEIGHT],
            [1, 0.85],
            Extrapolation.CLAMP,
        );
        const scale = interpolate(
            scrollY.value,
            [0, HEADER_COLLAPSE_HEIGHT],
            [1, 0.96],
            Extrapolation.CLAMP,
        );
        return { opacity, transform: [{ scale }] };
    });

    // Search bar blurs into a frosted glass bar on scroll
    const searchBarStyle = useAnimatedStyle(() => {
        const translateY = interpolate(
            scrollY.value,
            [0, HEADER_COLLAPSE_HEIGHT],
            [0, -4],
            Extrapolation.CLAMP,
        );
        return { transform: [{ translateY }] };
    });

    function handleSearch(query: string) {
        setSearchQuery(query);
        if (query.trim() === '') {
            setFilteredSurahs(SURAHS);
        } else {
            setFilteredSurahs(searchSurahs(query));
        }
    }

    function handleSurahPress(surah: Surah) {
        router.push({
            pathname: '/recite',
            params: {
                surahNumber: surah.number,
                surahName: surah.name,
                verses: surah.verses,
            },
        });
    }

    function handleSearchResultPress(result: SearchJumpTarget) {
        // Navigate to the recite screen at the specific surah
        const surah = SURAHS.find(s => s.number === result.surah);
        router.push({
            pathname: '/recite',
            params: {
                surahNumber: result.surah,
                surahName: surah?.name ?? `سورة ${result.surah}`,
                targetPage: result.page,
                targetAyah: result.ayah,
            },
        });
    }

    function renderSurah({ item, index }: { item: Surah; index: number }) {
        return (
            <SurahRow
                item={item}
                index={index}
                onPress={() => handleSurahPress(item)}
            />
        );
    }

    return (
        <View style={styles.container}>
            <ModernBackground />
            <SafeAreaView style={styles.safeArea}>
                {/* ── Sticky Header with backdrop blur ── */}
                <Animated.View style={[styles.stickyHeader, headerAnimStyle]}>
                    {Platform.OS !== 'android' ? (
                        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
                    ) : (
                        <View style={[StyleSheet.absoluteFill, styles.androidHeaderBg]} />
                    )}
                    {/* Bottom border glow */}
                    <LinearGradient
                        colors={['transparent', 'rgba(52,211,153,0.12)', 'transparent']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.headerBorderGlow}
                    />

                    <View style={styles.headerContent}>
                        <View>
                            <Text style={styles.headerLabel}>القرآن الكريم</Text>
                            <Text style={styles.title}>المصحف</Text>
                        </View>
                        <View style={styles.headerActions}>
                            <TouchableOpacity
                                onPress={() => setSearchModalVisible(true)}
                                style={styles.headerButton}
                                accessibilityRole="button"
                                accessibilityLabel="بحث في الآيات"
                            >
                                <Search size={18} color={Colors.gold[400]} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => router.push('/bookmarks')}
                                style={styles.headerButton}
                                accessibilityRole="button"
                                accessibilityLabel="الإشارات المرجعية"
                            >
                                <Bookmark size={18} color={Colors.gold[400]} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Animated search bar embedded in sticky header */}
                    <Animated.View style={[styles.searchContainer, searchBarStyle]}>
                        {Platform.OS !== 'android' ? (
                            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                        ) : null}
                        <Search color={Colors.emerald[400]} size={17} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="ابحث عن سورة..."
                            placeholderTextColor={Colors.neutral[600]}
                            value={searchQuery}
                            onChangeText={handleSearch}
                            returnKeyType="search"
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => handleSearch('')}>
                                <Text style={styles.clearBtn}>✕</Text>
                            </TouchableOpacity>
                        )}
                    </Animated.View>
                </Animated.View>

                {/* ── Surah List ── */}
                {loading ? (
                    <View style={styles.listContent}>
                        {[...Array(10)].map((_, idx) => (
                            <View key={idx} style={[rowStyles.wrapper, { marginBottom: 8, padding: Spacing.base }]}>
                                <SkeletonLoader width={46} height={46} borderRadius={23} />
                                <View style={{ flex: 1, marginLeft: Spacing.base }}>
                                    <SkeletonLoader width="60%" height={18} style={{ marginBottom: 6 }} />
                                    <SkeletonLoader width="40%" height={14} />
                                </View>
                            </View>
                        ))}
                    </View>
                ) : filteredSurahs.length === 0 ? (
                    <EmptyState
                        title="لا توجد نتائج"
                        message={`لا توجد سور لـ "${searchQuery}". جرب بحثاً آخر.`}
                        icon={<BookOpen size={64} color={Colors.emerald[400]} />}
                    />
                ) : (
                    <AnimatedFlatList
                        data={filteredSurahs}
                        renderItem={renderSurah}
                        keyExtractor={(item: Surah) => item.number.toString()}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        initialNumToRender={14}
                        maxToRenderPerBatch={10}
                        windowSize={7}
                        removeClippedSubviews={true}
                        onScroll={scrollHandler}
                        scrollEventThrottle={16}
                    />
                )}

                <SearchModal
                    visible={searchModalVisible}
                    db={null}
                    onClose={() => setSearchModalVisible(false)}
                    onResultPress={handleSearchResultPress}
                />
            </SafeAreaView>
        </View>
    );
}

const STICKY_HEADER_HEIGHT = 140;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.neutral[950],
    },
    safeArea: {
        flex: 1,
    },
    // ── Sticky Header ──
    stickyHeader: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(52, 211, 153, 0.1)',
        paddingTop: Platform.OS === 'android' ? Spacing.lg : Spacing.sm,
        zIndex: 10,
    },
    androidHeaderBg: {
        backgroundColor: 'rgba(2, 6, 23, 0.96)',
    },
    headerBorderGlow: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 1,
    },
    headerContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        paddingHorizontal: Spacing.xl,
        paddingBottom: Spacing.sm,
    },
    headerLabel: {
        fontSize: Typography.fontSize.xs,
        color: Colors.emerald[400],
        fontWeight: '600' as const,
        letterSpacing: 1.8,
        textTransform: 'uppercase',
        marginBottom: 2,
    },
    title: {
        fontSize: Typography.fontSize['4xl'],
        fontWeight: '800' as const,
        color: Colors.text.inverse,
        letterSpacing: -1,
    },
    headerActions: {
        flexDirection: 'row',
        gap: Spacing.sm,
        paddingBottom: 4,
    },
    headerButton: {
        padding: 9,
        borderRadius: BorderRadius.md,
        backgroundColor: 'rgba(251, 191, 36, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(251, 191, 36, 0.2)',
    },
    // ── Search ──
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginHorizontal: Spacing.xl,
        marginBottom: Spacing.base,
        paddingHorizontal: Spacing.base,
        paddingVertical: 10,
        borderRadius: BorderRadius.xl,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(52, 211, 153, 0.18)',
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
    },
    searchInput: {
        flex: 1,
        fontSize: Typography.fontSize.base,
        color: Colors.text.inverse,
        padding: 0,
    },
    clearBtn: {
        color: Colors.neutral[500],
        fontSize: 14,
        paddingHorizontal: 4,
    },
    // ── List ──
    listContent: {
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.base,
        paddingBottom: 120,
    },
});
