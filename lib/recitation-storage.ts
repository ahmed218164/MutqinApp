/**
 * Recitation Storage System
 * Handles audio upload to Supabase Storage and processing via Edge Function
 */

import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system';


// Supabase env vars needed for direct FileSystem.uploadAsync calls
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export interface RecitationAssessment {
    mistakes: Array<{
        text: string;
        correction: string;
        description: string;
        category?: 'tajweed' | 'pronunciation' | 'elongation' | 'waqf' | 'omission';
        severity?: 'minor' | 'moderate' | 'major' | 'critical';
        /** Phonetic characters expected per the reference script (e.g. "اааааа" = 6-count Madd) */
        phonetic_expected?: string;
        /** Phonetic characters actually heard from the user's audio */
        phonetic_heard?: string;
    }>;
    score: number;
    modelUsed?: string;
    error?: string;
}

const MAX_FILE_SIZE_MB = 10;
const UPLOAD_TIMEOUT_MS = 30000; // 30 seconds
const MAX_RETRIES = 2;

/**
 * Check recitation via Storage (avoids 6MB Base64 limit)
 * 
 * Flow:
 * 1. Validate file size
 * 2. Upload audio to Supabase Storage with timeout
 * 3. Call Edge Function with file path only
 * 4. Edge Function downloads, processes, and deletes file
 */
export async function checkRecitationViaStorage(
    audioUri: string,
    referenceText: string,
    userId: string,
    sheikhClipUrl?: string,          // Phase 3a: URL of sheikh's first ayah for Makhraj reference
    phoneticRef?: string,            // Phase 3b: deterministic phonetic string from quran_phonetizer
): Promise<RecitationAssessment> {
    let uploadedFileName: string | null = null;

    try {
        console.log('📤 Starting recitation upload...');

        // Step 1: Validate file size
        const fileInfo = await FileSystem.getInfoAsync(audioUri);
        if (!fileInfo.exists) {
            throw new Error('ملف التسجيل غير موجود');
        }

        const fileSizeMB = fileInfo.size / (1024 * 1024);
        console.log(`📊 File size: ${fileSizeMB.toFixed(2)} MB`);

        if (fileSizeMB > MAX_FILE_SIZE_MB) {
            throw new Error(
                `التسجيل طويل جداً (${fileSizeMB.toFixed(1)} MB). الحد الأقصى: ${MAX_FILE_SIZE_MB} MB.\n\nيرجى الالتزام بالورد اليومي فقط.`
            );
        }

        // Step 2: Build storage upload URL and get auth token
        const fileName = `${userId}/${Date.now()}.m4a`;
        uploadedFileName = fileName;

        // Get current session token (fall back to anon key for RLS)
        const { data: sessionData } = await supabase.auth.getSession();
        const authToken = sessionData?.session?.access_token ?? SUPABASE_ANON_KEY;

        // Step 3: Upload using FileSystem.uploadAsync (streams file directly — works on Android)
        let uploadSuccess = false;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                console.log(`📤 Upload attempt ${attempt}/${MAX_RETRIES}...`);

                const uploadUrl = `${SUPABASE_URL}/storage/v1/object/audio-recordings/${fileName}`;

                const uploadResult = await Promise.race([
                    FileSystem.uploadAsync(uploadUrl, audioUri, {
                        httpMethod: 'POST',
                        // @ts-ignore
                        uploadType: FileSystem.FileSystemUploadType?.BINARY_CONTENT ?? 0,
                        headers: {
                            'Authorization': `Bearer ${authToken}`,
                            'apikey': SUPABASE_ANON_KEY,
                            'x-upsert': 'false',
                            'Content-Type': 'audio/m4a', // 👈 تمت إضافة هذا السطر لحل مشكلة 415
                        },
                    }),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('Upload timeout')), UPLOAD_TIMEOUT_MS)
                    ),
                ]);

                if (uploadResult.status !== 200 && uploadResult.status !== 201) {
                    throw new Error(`Upload HTTP ${uploadResult.status}: ${uploadResult.body}`);
                }

                console.log('✅ Audio uploaded:', fileName);
                uploadSuccess = true;
                break;

            } catch (error: any) {
                console.warn(`⚠️ Upload attempt ${attempt} failed:`, error.message);

                const isRetryable =
                    error.message?.includes('network') ||
                    error.message?.includes('timeout') ||
                    error.message?.includes('fetch') ||
                    error.message?.includes('ECONNREFUSED');

                if (!isRetryable || attempt === MAX_RETRIES) {
                    throw error;
                }

                const delay = Math.pow(2, attempt - 1) * 1000;
                console.log(`⏳ Waiting ${delay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        if (!uploadSuccess) {
            throw new Error('فشل رفع التسجيل بعد عدة محاولات');
        }

        // Step 4: Call Edge Function with path only (lightweight)
        console.log('🧠 Processing with AI...');
        const { data, error } = await supabase.functions.invoke('check-recitation-v2', {
            body: {
                audioPath: fileName,
                referenceText,
                userId,
                sheikhClipUrl: sheikhClipUrl ?? null,
                phoneticRef:   phoneticRef   ?? null,   // Phase 3b: phonetic ground-truth
            }
        });

        if (error) {
            // Extract the actual response body for better diagnostics
            let detail = error.message;
            try {
                if (typeof (error as any).context?.json === 'function') {
                    const body = await (error as any).context.json();
                    detail = body?.error || body?.message || JSON.stringify(body);
                }
            } catch (_) { /* ignore parse errors */ }
            console.error('Edge Function error:', detail);
            throw new Error(`فشل تحليل التلاوة: ${detail}`);
        }

        console.log('✅ Analysis complete:', JSON.stringify(data).substring(0, 80));
        return data as RecitationAssessment;

    } catch (error: any) {
        console.error('Error in checkRecitationViaStorage:', error);

        // Cleanup partial upload on error
        if (uploadedFileName) {
            try {
                console.log('🗑️ Cleaning up partial upload...');
                await supabase.storage
                    .from('audio-recordings')
                    .remove([uploadedFileName]);
            } catch (cleanupError) {
                console.warn('Failed to cleanup partial upload:', cleanupError);
            }
        }

        // Return user-friendly error
        let errorMessage = error.message || 'فشل في تحليل التلاوة. يرجى المحاولة مرة أخرى.';

        // Categorize errors
        if (error.message?.includes('timeout')) {
            errorMessage = 'انتهت مهلة الرفع. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.';
        } else if (error.message?.includes('network')) {
            errorMessage = 'مشكلة في الاتصال بالإنترنت. يرجى التحقق من الشبكة والمحاولة مرة أخرى.';
        } else if (error.message?.includes('quota')) {
            errorMessage = 'تم تجاوز حد الاستخدام المسموح به. يرجى المحاولة لاحقاً.';
        }

        return {
            mistakes: [],
            score: 0,
            error: errorMessage
        };
    }
}

/**
 * Legacy function - kept for backward compatibility
 * Will be deprecated once all code migrates to Storage approach
 */
export async function checkRecitationLegacy(
    audioBase64: string,
    referenceText: string
): Promise<RecitationAssessment> {
    console.warn('⚠️ Using legacy Base64 approach. Consider migrating to Storage.');

    try {
        const { data, error } = await supabase.functions.invoke('check-recitation-legacy', {
            body: {
                audioBase64,
                referenceText
            }
        });

        if (error) throw error;
        return data as RecitationAssessment;
    } catch (error: any) {
        return {
            mistakes: [],
            score: 0,
            error: error.message || 'فشل في تحليل التلاوة'
        };
    }
}

/**
 * Check recitation by sending Base64 audio directly to Edge Function
 * (Faster, bypasses Supabase Storage)
 */
export async function checkRecitationDirect(
    userAudioBase64: string,
    referenceText: string,
    userId: string,
    sheikhAudioBase64?: string,
    sheikhMimeType?: string,
    phoneticRef?: string,
): Promise<RecitationAssessment> {
    try {
        console.log('🧠 Processing with AI via direct Base64...');
        
        const payload = {
            userAudioBase64,
            referenceText,
            userId,
            sheikhAudioBase64: sheikhAudioBase64 ?? null,
            sheikhMimeType: sheikhMimeType ?? null,
            phoneticRef: phoneticRef ?? null,
        };

        const { data, error } = await supabase.functions.invoke('check-recitation-v2', {
            body: payload
        });

        if (error) {
            let detail = error.message;
            try {
                if (typeof (error as any).context?.json === 'function') {
                    const body = await (error as any).context.json();
                    detail = body?.error || body?.message || JSON.stringify(body);
                }
            } catch (_) {}
            console.error('Edge Function error:', detail);
            throw new Error(`فشل تحليل التلاوة: ${detail}`);
        }

        console.log('✅ Analysis complete:', JSON.stringify(data).substring(0, 80));
        return data as RecitationAssessment;

    } catch (error: any) {
        console.error('Error in checkRecitationDirect:', error);
        let errorMessage = error.message || 'فشل في تحليل التلاوة. يرجى المحاولة مرة أخرى.';
        
        // Categorize errors
        if (error.message?.includes('timeout')) {
            errorMessage = 'انتهت مهلة الرفع. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.';
        } else if (error.message?.includes('network')) {
            errorMessage = 'مشكلة في الاتصال بالإنترنت. يرجى التحقق من الشبكة والمحاولة مرة أخرى.';
        } else if (error.message?.includes('quota') || error.message?.includes('429')) {
            errorMessage = 'تم تجاوز حد الاستخدام المسموح به. يرجى المحاولة لاحقاً.';
        } else if (error.message?.includes('payload too large') || error.message?.includes('413')) {
            errorMessage = 'التسجيل طويل جداً. يرجى تسجيل آيات أقل والمحاولة مرة أخرى.';
        }

        return {
            mistakes: [],
            score: 0,
            error: errorMessage
        };
    }
}
