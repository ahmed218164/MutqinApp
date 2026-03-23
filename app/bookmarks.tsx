import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
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

    function confirmDelete(bookmark: Bookmark) {
        Alert.alert(
            'حذف الإشارة',
            'هل أنت متأكد من حذف هذه الإشارة المرجعية؟',
            [
                { text: 'إلغاء', style: 'cancel' },
                {
                    text: 'حذف',
                    style: 'destructive',
                    onPress: () => handleDelete(bookmark.id),
                },
            ]
        );
    }

    async function handleDelete(id: string) {
        const result = await deleteBookmark(id);
        if (result.success) {
            setBookmarks(bookmarks.filter(b => b.id !== id));
        } else {
            Alert.alert('خطأ', result.error || 'فشل حذف الإشارة المرجعية');
        }
    }

    function handleBookmarkPress(bookmark: Bookmark) {
        router.push({
            pathname: '/recite',
            params: {
                surahNumber: bookmark.surah,
                surahName: bookmark.surah_name,
            },
        });
    }

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
                        renderItem={({ item }) => (
                            <Card
                                style={styles.bookmarkCard}
                                variant="glass"
                                onPress={() => handleBookmarkPress(item)}
                            >
                                <View style={styles.cardHeader}>
                                    <View
                                        style={[
                                            styles.colorTag,
                                            { backgroundColor: TAG_COLORS[item.tag_color as keyof typeof TAG_COLORS] || TAG_COLORS.gold }
                                        ]}
                                    />
                                    <TouchableOpacity
                                        onPress={() => confirmDelete(item)}
                                        style={styles.deleteButton}
                                    >
                                        <Trash2 size={18} color={Colors.error} />
                                    </TouchableOpacity>
                                </View>
                                <Text style={styles.surahName}>{item.surah_name}</Text>
                                <Text style={styles.ayahNumber}>
                                    سورة {item.surah} — الآية {item.ayah}
                                </Text>
                                {item.note && (
                                    <Text style={styles.note}>{item.note}</Text>
                                )}
                            </Card>
                        )}
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
