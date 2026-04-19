/**
 * hooks/useBookmarkManager.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Encapsulates bookmark loading & toggling logic that was inlined in recite.tsx.
 *
 * Supports two paths:
 *  - Authenticated users → Supabase (cross-device sync)
 *  - Guest users → AsyncStorage (local only)
 * ──────────────────────────────────────────────────────────────────────────────
 */

import * as React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

// ── Supabase Mutation Retry Helper (shared with useRecitationSync) ────────────
// Duplicated locally to keep hooks self-contained. The retry helper is small
// enough that sharing via a separate lib/ module is premature abstraction.

type SupabaseMutationFn<T> = () => Promise<{ data: T | null; error: any }>;

interface RetryOptions {
    maxRetries?: number;
    baseDelayMs?: number;
}

const isRetryableError = (error: any): boolean => {
    if (!error) return false;
    const status = error.status ?? error.statusCode;
    if (status === 429 || status === 503) return true;
    if (status >= 500 && status < 600) return true;
    const message = error.message?.toLowerCase() ?? '';
    return message.includes('network') || message.includes('timeout') || message.includes('fetch')
        || message.includes('temporary') || message.includes('try again');
};

async function saveWithRetry<T>(
    mutationFn: SupabaseMutationFn<T>,
    options: RetryOptions = {}
): Promise<{ data: T | null; error: any; success: boolean }> {
    const { maxRetries = 3, baseDelayMs = 1000 } = options;
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await mutationFn();
            if (result.error) {
                lastError = result.error;
                if (!isRetryableError(lastError) || attempt === maxRetries) {
                    return { data: result.data, error: lastError, success: false };
                }
            } else {
                return { data: result.data, error: null, success: true };
            }
        } catch (err: any) {
            lastError = err;
            if (!isRetryableError(lastError) || attempt === maxRetries) {
                return { data: null, error: lastError, success: false };
            }
        }

        if (attempt < maxRetries) {
            const delay = baseDelayMs * Math.pow(2, attempt - 1);
            await new Promise(resolve => setTimeout(() => resolve(undefined), delay));
        }
    }

    return { data: null, error: lastError, success: false };
}

// ── Public types ─────────────────────────────────────────────────────────────

export interface BookmarkManagerResult {
    isBookmarked: boolean;
    toggleBookmark: () => Promise<void>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useBookmarkManager(
    surahNumber: number,
    surahName: string,
    user: User | null | undefined
): BookmarkManagerResult {
    const [isBookmarked, setIsBookmarked] = React.useState(false);

    // Load bookmark state on mount
    React.useEffect(() => {
        async function loadBookmarkState() {
            try {
                if (user) {
                    // Primary: server-side bookmark (cross-device)
                    const { data } = await supabase
                        .from('bookmarks')
                        .select('id')
                        .eq('user_id', user.id)
                        .eq('surah_number', surahNumber)
                        .maybeSingle();
                    setIsBookmarked(!!data);
                } else {
                    // Fallback: local AsyncStorage
                    const stored = await AsyncStorage.getItem('bookmarks');
                    if (stored) {
                        try {
                            setIsBookmarked(JSON.parse(stored).includes(surahNumber));
                        } catch {
                            // Corrupt data — ignore
                        }
                    }
                }
            } catch (e) {
                console.error('Error loading bookmark state:', e);
            }
        }
        loadBookmarkState();
    }, [surahNumber, user?.id]);

    const toggleBookmark = React.useCallback(async () => {
        try {
            if (user) {
                // Primary: sync with Supabase
                if (isBookmarked) {
                    const result = await saveWithRetry(
                        async () => {
                            const { data, error } = await supabase.from('bookmarks').delete()
                                .eq('user_id', user.id)
                                .eq('surah_number', surahNumber);
                            return { data, error };
                        },
                        { maxRetries: 3, baseDelayMs: 1000 }
                    );
                    if (result.success) {
                        setIsBookmarked(false);
                    } else {
                        console.warn('[toggleBookmark] delete failed after retries:', result.error?.message);
                    }
                } else {
                    const result = await saveWithRetry(
                        async () => {
                            const { data, error } = await supabase.from('bookmarks').upsert({
                                user_id: user.id,
                                surah_number: surahNumber,
                                surah_name: surahName,
                                created_at: new Date().toISOString(),
                            }, { onConflict: 'user_id,surah_number' });
                            return { data, error };
                        },
                        { maxRetries: 3, baseDelayMs: 1000 }
                    );
                    if (result.success) {
                        setIsBookmarked(true);
                    } else {
                        console.warn('[toggleBookmark] upsert failed after retries:', result.error?.message);
                    }
                }
            } else {
                // Fallback: local AsyncStorage only
                const stored = await AsyncStorage.getItem('bookmarks');
                let bookmarks: number[] = [];
                if (stored) {
                    try { bookmarks = JSON.parse(stored); } catch { /* corrupt data */ }
                }
                if (isBookmarked) {
                    bookmarks = bookmarks.filter(s => s !== surahNumber);
                    setIsBookmarked(false);
                } else {
                    bookmarks.push(surahNumber);
                    setIsBookmarked(true);
                }
                await AsyncStorage.setItem('bookmarks', JSON.stringify(bookmarks));
            }
        } catch (error) {
            console.error('Error toggling bookmark:', error);
        }
    }, [user, isBookmarked, surahNumber, surahName]);

    return { isBookmarked, toggleBookmark };
}
