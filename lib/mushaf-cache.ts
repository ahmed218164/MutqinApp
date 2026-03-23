/**
 * Mushaf Page Caching System
 * Enables offline reading of Quran pages
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';

const MUSHAF_CDN_BASE = 'https://www.searchtruth.com/quran/images2/';
const CACHE_DIR = `${(FileSystem as any).documentDirectory || ''}mushaf_cache/`;
const CACHE_INDEX_KEY = 'mushaf_cache_index';

interface CacheIndex {
    [page: number]: {
        localUri: string;
        cachedAt: number;
        size: number;
    };
}

/**
 * Initialize cache directory
 */
async function ensureCacheDir(): Promise<void> {
    const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
        console.log('📁 Created Mushaf cache directory');
    }
}

/**
 * Get cache index from AsyncStorage
 */
async function getCacheIndex(): Promise<CacheIndex> {
    try {
        const indexJson = await AsyncStorage.getItem(CACHE_INDEX_KEY);
        return indexJson ? JSON.parse(indexJson) : {};
    } catch (error) {
        console.error('Error reading cache index:', error);
        return {};
    }
}

/**
 * Update cache index
 */
async function updateCacheIndex(index: CacheIndex): Promise<void> {
    try {
        await AsyncStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
    } catch (error) {
        console.error('Error updating cache index:', error);
    }
}

/**
 * Check if a page is cached
 */
export async function isPageCached(pageNumber: number): Promise<boolean> {
    const index = await getCacheIndex();
    if (!index[pageNumber]) return false;

    // Verify file still exists
    const fileInfo = await FileSystem.getInfoAsync(index[pageNumber].localUri);
    return fileInfo.exists;
}

/**
 * Get cached page URI or download if not cached
 */
export async function getMushafPageUri(pageNumber: number): Promise<string> {
    await ensureCacheDir();

    const index = await getCacheIndex();

    // Check if already cached
    if (index[pageNumber]) {
        const fileInfo = await FileSystem.getInfoAsync(index[pageNumber].localUri);
        if (fileInfo.exists) {
            console.log(`✅ Page ${pageNumber} loaded from cache`);
            return index[pageNumber].localUri;
        } else {
            // File was deleted, remove from index
            delete index[pageNumber];
            await updateCacheIndex(index);
        }
    }

    // Download page
    console.log(`📥 Downloading page ${pageNumber}...`);
    const remoteUrl = `${MUSHAF_CDN_BASE}${pageNumber}.jpg`;
    const localUri = `${CACHE_DIR}page_${pageNumber}.jpg`;

    try {
        const downloadResult = await FileSystem.downloadAsync(remoteUrl, localUri);

        if (downloadResult.status === 200) {
            // Get file size
            const fileInfo = await FileSystem.getInfoAsync(localUri);

            // Update index
            index[pageNumber] = {
                localUri,
                cachedAt: Date.now(),
                size: (fileInfo.exists && 'size' in fileInfo) ? fileInfo.size : 0
            };
            await updateCacheIndex(index);

            console.log(`✅ Page ${pageNumber} cached successfully`);
            return localUri;
        } else {
            throw new Error(`Download failed with status ${downloadResult.status}`);
        }
    } catch (error) {
        console.error(`Error downloading page ${pageNumber}:`, error);
        // Return remote URL as fallback (requires internet)
        return remoteUrl;
    }
}

/**
 * Prefetch a range of pages for offline use
 * Useful for caching the current ward before going offline
 */
export async function prefetchPages(
    startPage: number,
    endPage: number,
    onProgress?: (current: number, total: number) => void
): Promise<void> {
    const total = endPage - startPage + 1;
    let completed = 0;

    console.log(`📦 Prefetching pages ${startPage}-${endPage}...`);

    for (let page = startPage; page <= endPage; page++) {
        try {
            await getMushafPageUri(page);
            completed++;
            onProgress?.(completed, total);
        } catch (error) {
            console.error(`Failed to prefetch page ${page}:`, error);
        }
    }

    console.log(`✅ Prefetch complete: ${completed}/${total} pages cached`);
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
    totalPages: number;
    totalSizeMB: number;
    oldestCacheDate: Date | null;
}> {
    const index = await getCacheIndex();
    const pages = Object.values(index);

    const totalPages = pages.length;
    const totalSizeBytes = pages.reduce((sum, page) => sum + page.size, 0);
    const totalSizeMB = totalSizeBytes / (1024 * 1024);

    const oldestCacheDate = pages.length > 0
        ? new Date(Math.min(...pages.map(p => p.cachedAt)))
        : null;

    return {
        totalPages,
        totalSizeMB,
        oldestCacheDate
    };
}

/**
 * Clear cache (for settings/troubleshooting)
 */
export async function clearMushafCache(): Promise<void> {
    try {
        console.log('🗑️ Clearing Mushaf cache...');

        // Delete cache directory
        const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
        if (dirInfo.exists) {
            await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
        }

        // Clear index
        await AsyncStorage.removeItem(CACHE_INDEX_KEY);

        console.log('✅ Cache cleared');
    } catch (error) {
        console.error('Error clearing cache:', error);
        throw error;
    }
}

/**
 * Check if device is online
 */
export async function isOnline(): Promise<boolean> {
    try {
        // Try to fetch a small resource
        const response = await fetch('https://www.google.com/favicon.ico', {
            method: 'HEAD',
            cache: 'no-cache'
        });
        return response.ok;
    } catch {
        return false;
    }
}
