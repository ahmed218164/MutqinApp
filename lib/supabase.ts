import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '❌ Supabase configuration missing!\n\n' +
    'Please ensure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set in your .env file.\n' +
    'Example:\n' +
    'EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co\n' +
    'EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key'
  );
}

const customFetch = async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
  const maxRetries = 3;
  let lastError: Error | null = null;
  // Only retry idempotent/safe methods — retrying POST/DELETE/PATCH can cause
  // duplicate achievements, double XP awards, or other data corruption.
  const method = (options?.method ?? 'GET').toUpperCase();
  const isSafeToRetry = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error: any) {
      lastError = error;
      const isNetworkError = 
        error.message?.includes('network') ||
        error.message?.includes('timeout') ||
        error.message?.includes('fetch');

      if (isNetworkError && isSafeToRetry && attempt < maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error('Network request failed after retries');
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: customFetch,
  },
  db: {
    schema: 'public',
  },
});
