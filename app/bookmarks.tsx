import * as React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, Trash2 } from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/theme';
import ModernBackground from '../components/ui/ModernBackground';
import Card from '../components/ui/Card';
import { useAuth } from '../lib/auth';
import { getUserBookmarks, deleteBookmark, Bookmark, TAG_COLORS } from '../lib/bookmarks';
import EmptyState from '../components/ui/EmptyState';

// ── FlatList optimisation constants ──────────────────────────────────────────
// Card padding(20*2) + cardHeader(24 + marginBottom 8) + surahName(20 + mb 4)
// + ayahNumber(14 + mb 4) + Card marginBottom(12) = ~126px
const BOOKMARK_ITEM_HEIGHT = 126;

// ── Memoised bookmark row ────────────────────────────────────────────────────
interface BookmarkItemProps {
    item: Bookmark;
    onPress: (bookmark: Bookmark) => void;
    onDelete: (bookmark: Bookmark) => void;
}

const BookmarkItem = React.memo(function BookmarkItem(
    { item, onPress, onDelete }: BookmarkItemProps,
) {
    const handlePress = React.useCallback(() => onPress(item), [onPress, item]);
    const handleDelete = React.useCallback(() => onDelete(item), [onDelete, item]);

    return (
        <Card
            style={bookmarkCardStyles.bookmarkCard}
            variant="glass"
            onPress={handlePress}
        >
            <View style={bookmarkCardStyles.cardHeader}>
                <View
                    style={[
                        bookmarkCardStyles.colorTag,
                        { backgroundColor: TAG_COLORS[item.tag_color as keyof typeof TAG_COLORS] || TAG_COLORS.gold }
                    ]}
                />
                <TouchableOpacity
                    onPress={handleDelete}
                    style={bookmarkCardStyles.deleteButton}
                >
                    <Trash2 size={18} color={Colors.error} />
                </TouchableOpacity>
            </View>
            <Text style={bookmarkCardStyles.surahName}>{item.surah_name}</Text>
            <Text style={bookmarkCardStyles.ayahNumber}>
                سورة {item.surah} — الآية {item.ayah}
            </Text>
            {item.note && (
                <Text style={bookmarkCardStyles.note}>{item.note}</Text>
            )}
        </Card>
    );
});

const bookmarkCardStyles = StyleSheet.create({
    bookmarkCard: {
        marginBottom: Spacing.md,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.sm,
    },
    colorTag: {
        width: 24,
        height: 24,
        borderRadius: BorderRadius.full,
    },
    deleteButton: {
        padding: Spacing.xs,
    },
    surahName: {
        fontSize: Typography.fontSize.xl,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        marginBottom: Spacing.xs,
    },
    ayahNumber: {
        fontSize: Typography.fontSize.sm,
        color: Colors.emerald[400],
        fontWeight: Typography.fontWeight.semibold,
        marginBottom: Spacing.xs,
    },
    note: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.secondary,
        marginTop: Spacing.sm,
        fontStyle: 'italic',
    },
});

export default function BookmarksScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const [bookmarks, setBookmarks] = React.useState<Bookmark[]>([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        loadBookmarks();
    }, []);

    async function loadBookmarks() {
        if (!user) return;
        setLoading(true);
        const data = await getUserBookmarks(user.id);
        setBookmarks(data);
        setLoading(false);
    }

    const confirmDelete = React.useCallback((bookmark: Bookmark) => {
        Alert.alert(
            'حذف الإشارة',
            'هل أنت متأكد من حذف هذه الإشارة المرجعية؟',
            [
                { text: 'إلغاء', style: 'cancel' },
                {
                    text: 'حذف',
                    style: 'destructive',
                    onPress: async () => {
                        const result = await deleteBookmark(bookmark.id);
                        if (result.success) {
                            setBookmarks(prev => prev.filter(b => b.id !== bookmark.id));
                        } else {
                            Alert.alert('خطأ', result.error || 'فشل حذف الإشارة المرجعية');
                        }
                    },
                },
            ]
        );
    }, []);

    const handleBookmarkPress = React.useCallback((bookmark: Bookmark) => {
        router.push({
            pathname: '/recite',
            params: {
                surahNumber: bookmark.surah,
                surahName: bookmark.surah_name,
            },
        });
    }, [router]);

    const getItemLayout = React.useCallback(
        (_data: any, index: number) => ({
            length: BOOKMARK_ITEM_HEIGHT,
            offset: BOOKMARK_ITEM_HEIGHT * index,
            index,
        }),
        [],
    );

    const renderBookmark = React.useCallback(
        ({ item }: { item: Bookmark }) => (
            <BookmarkItem
                item={item}
                onPress={handleBookmarkPress}
                onDelete={confirmDelete}
            />
        ),
        [handleBookmarkPress, confirmDelete],
    );

    return (
        <View style={styles.container}>
            <ModernBackground />
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <ChevronLeft size={24} color={Colors.text.inverse} />
                    </TouchableOpacity>
                    <Text style={styles.title}>الإشارات المرجعية</Text>
                    <View style={{ width: 24 }} />
                </View>

                {bookmarks.length === 0 && !loading ? (
                    <EmptyState
                        title="لا توجد إشارات بعد"
                        message="اضغط مطولاً على أي آية في المصحف لإضافة إشارة"
                    />
                ) : (
                    <FlatList
                        data={bookmarks}
                        keyExtractor={item => item.id}
                        contentContainerStyle={styles.list}
                        renderItem={renderBookmark}
                        getItemLayout={getItemLayout}
                        removeClippedSubviews={true}
                        initialNumToRender={12}
                        maxToRenderPerBatch={5}
                        windowSize={5}
                    />
                )}
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.neutral[950],
    },
    safeArea: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: Spacing.lg,
        paddingTop: Spacing.xl,
    },
    backButton: {
        padding: Spacing.xs,
    },
    title: {
        fontSize: Typography.fontSize['2xl'],
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
    },
    list: {
        padding: Spacing.lg,
    },
});
