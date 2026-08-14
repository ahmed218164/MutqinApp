import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'mutqin.gemini_api_key.v1';

let runtimeApiKey: string | null = null;

function normalizeApiKey(value?: string | null): string {
    return value?.trim() ?? '';
}

function isClearlyOAuthToken(value: string): boolean {
    return /^bearer\s|^ya29\./i.test(value);
}

export function getActiveGeminiApiKey(): string {
    return runtimeApiKey || normalizeApiKey(process.env.EXPO_PUBLIC_GEMINI_API_KEY);
}

export async function loadGeminiApiKey(): Promise<boolean> {
    const stored = normalizeApiKey(await AsyncStorage.getItem(STORAGE_KEY));
    runtimeApiKey = stored || null;
    return Boolean(runtimeApiKey);
}

export async function getSavedGeminiApiKey(): Promise<string> {
    return normalizeApiKey(await AsyncStorage.getItem(STORAGE_KEY));
}

export async function saveGeminiApiKey(value: string): Promise<void> {
    const apiKey = normalizeApiKey(value);
    if (!apiKey || isClearlyOAuthToken(apiKey)) {
        throw new Error('أدخل مفتاح Gemini API من Google AI Studio، وليس OAuth access token.');
    }
    await AsyncStorage.setItem(STORAGE_KEY, apiKey);
    runtimeApiKey = apiKey;
}

export async function clearGeminiApiKey(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEY);
    runtimeApiKey = null;
}

export interface GeminiConnectionTest {
    ok: boolean;
    message: string;
    availableModels: string[];
}

/** Tests the same API key and endpoint used by the app without sending user audio. */
export async function testGeminiConnection(value?: string): Promise<GeminiConnectionTest> {
    const apiKey = normalizeApiKey(value) || getActiveGeminiApiKey();
    if (!apiKey || isClearlyOAuthToken(apiKey)) {
        return { ok: false, message: 'أدخل مفتاح Gemini API صالحاً من Google AI Studio.', availableModels: [] };
    }

    try {
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
            headers: { 'x-goog-api-key': apiKey },
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            const apiMessage = body?.error?.message;
            return {
                ok: false,
                message: response.status === 401 || response.status === 403
                    ? 'المفتاح غير صالح أو لا يملك صلاحية Gemini API.'
                    : apiMessage || `تعذّر الاتصال بالخدمة (HTTP ${response.status}).`,
                availableModels: [],
            };
        }

        const models = Array.isArray(body?.models)
            ? body.models
                .map((model: any) => String(model.name || '').replace(/^models\//, ''))
                .filter(Boolean)
            : [];
        return {
            ok: true,
            message: `تم الاتصال بنجاح. وُجد ${models.length} نموذجاً قابلاً للاستخدام.`,
            availableModels: models,
        };
    } catch {
        return { ok: false, message: 'تعذّر الوصول إلى Gemini. تحقق من اتصال الإنترنت ثم أعد المحاولة.', availableModels: [] };
    }
}
