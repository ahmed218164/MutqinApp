import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Bookmark {
    id: string;
    user_id: string;
    surah: number;
    ayah: number;
    surah_name: string;
    tag_color: string;
    note?: string;
    created_at: string;
}

const BOOKMARK_CACHE_KEY = 'mutqin_bookmarks_cache';

export const TAG_COLORS = {
    gold: '#EAB308',
    emerald: '#10B981',
    blue: '#3B82F6',
    purple: '#A855F7',
    red: '#EF4444',
    pink: '#EC4899',
};

export async function addBookmark(
    userId: string,
    surah: number,
    ayah: number,
    surahName: string,
    tagColor: string,
    note?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { data, error } = await supabase
            .from('bookmarks')
            .insert({
                user_id: userId,
                surah,
                ayah,
                surah_name: surahName,
                tag_color: tagColor,
                note,
            })
            .select()
            .single();

        if (error) throw error;

        await invalidateBookmarkCache();

        return { success: true };
    } catch (error: any) {
        console.error('Error adding bookmark:', error);
        return { success: false, error: error.message };
    }
}

export async function deleteBookmark(bookmarkId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const { error } = await supabase
            .from('bookmarks')
            .delete()
            .eq('id', bookmarkId);

        if (error) throw error;

        await invalidateBookmarkCache();

        return { success: true };
    } catch (error: any) {
        console.error('Error deleting bookmark:', error);
        return { success: false, error: error.message };
    }
}

export async function getUserBookmarks(userId: string): Promise<Bookmark[]> {
    try {
        const cached = await AsyncStorage.getItem(BOOKMARK_CACHE_KEY);
        if (cached) {
            const cachedData = JSON.parse(cached);
            if (cachedData.userId === userId && Date.now() - cachedData.timestamp < 300000) {
                return cachedData.bookmarks;
            }
        }

        const { data, error } = await supabase
            .from('bookmarks')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        await AsyncStorage.setItem(
            BOOKMARK_CACHE_KEY,
            JSON.stringify({
                userId,
                bookmarks: data || [],
                timestamp: Date.now(),
            })
        );

        return data || [];
    } catch (error) {
        console.error('Error fetching bookmarks:', error);
        return [];
    }
}

export async function getAyahBookmark(
    userId: string,
    surah: number,
    ayah: number
): Promise<Bookmark | null> {
    try {
        const { data, error } = await supabase
            .from('bookmarks')
            .select('*')
            .eq('user_id', userId)
            .eq('surah', surah)
            .eq('ayah', ayah)
            .maybeSingle();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching ayah bookmark:', error);
        return null;
    }
}

async function invalidateBookmarkCache() {
    try {
        await AsyncStorage.removeItem(BOOKMARK_CACHE_KEY);
    } catch (error) {
        console.error('Error invalidating bookmark cache:', error);
    }
}
