/**
 * lib/SQLiteProvider.tsx
 *
 * Bootstraps ayat.db from the bundled asset on first launch, then opens
 * it via expo-sqlite and exposes it via a React context.
 *
 * Usage:
 *   // In _layout.tsx, wrap the app with <AyatSQLiteProvider>
 *   // In any component: const db = useAyatDB();
 */

import * as React from 'react';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import * as FileSystem from 'expo-file-system';

interface Props {
    children: React.ReactNode;
}

// Ensure metro resolves the db asset
const AYA_DB_ASSET = require('../assets/database/ayat.db');

export function AyatSQLiteProvider({ children }: Props) {
    // We can show a fallback UI while expo-sqlite natively copies and opens the DB
    return (
        <React.Suspense fallback={
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#10b981" />
            </View>
        }>
            <SQLiteProvider
                databaseName="ayat.db"
                assetSource={{ assetId: AYA_DB_ASSET }}
                useSuspense={true}
            >
                {children}
            </SQLiteProvider>
        </React.Suspense>
    );
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#030712' // Colors.neutral[950] — dark to match app theme
    }
});

/**
 * useAyatDB
 *
 * Returns the open SQLite database instance.
 */
export function useAyatDB() {
    return useSQLiteContext();
}

/**
 * useSQLiteStatus
 *
 * Returns { loading, error } so UI can show a spinner or error screen
 * while the DB is being set up.
 * 
 * Note: With the native Suspense provider, children aren't rendered 
 * until the database is ready, so loading is effectively false inside children.
 */
export function useSQLiteStatus(): { loading: boolean; error: string | null } {
    return { loading: false, error: null };
}
