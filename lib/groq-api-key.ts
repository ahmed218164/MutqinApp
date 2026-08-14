import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'mutqin.groq_api_key.v1';

let runtimeApiKey: string | null = null;

function normalizeApiKey(value?: string | null): string {
    return value?.trim() ?? '';
}

export function getActiveGroqApiKey(): string {
    return runtimeApiKey || normalizeApiKey(process.env.EXPO_PUBLIC_GROQ_API_KEY);
}

export async function loadGroqApiKey(): Promise<boolean> {
    const stored = normalizeApiKey(await AsyncStorage.getItem(STORAGE_KEY));
    runtimeApiKey = stored || null;
    return Boolean(runtimeApiKey);
}

export async function getSavedGroqApiKey(): Promise<string> {
    return normalizeApiKey(await AsyncStorage.getItem(STORAGE_KEY));
}

export async function saveGroqApiKey(value: string): Promise<void> {
    const apiKey = normalizeApiKey(value);
    if (!apiKey) {
        throw new Error('أدخل مفتاح Groq API صالحاً (gsk_...).');
    }
    await AsyncStorage.setItem(STORAGE_KEY, apiKey);
    runtimeApiKey = apiKey;
}

export async function clearGroqApiKey(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEY);
    runtimeApiKey = null;
}

export interface GroqConnectionTest {
    ok: boolean;
    message: string;
    availableModels: string[];
}

/** Tests the Groq API key and verifies available Whisper and LLM models. */
export async function testGroqConnection(value?: string): Promise<GroqConnectionTest> {
    const apiKey = normalizeApiKey(value) || getActiveGroqApiKey();
    if (!apiKey) {
        return { ok: false, message: 'أدخل مفتاح Groq API صالحاً من console.groq.com.', availableModels: [] };
    }

    try {
        const response = await fetch('https://api.groq.com/openai/v1/models', {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            const apiMessage = body?.error?.message;
            return {
                ok: false,
                message: response.status === 401
                    ? 'المفتاح غير صالح أو منتهي الصلاحية في Groq.'
                    : apiMessage || `تعذّر الاتصال بـ Groq (HTTP ${response.status}).`,
                availableModels: [],
            };
        }

        const models = Array.isArray(body?.data)
            ? body.data.map((m: any) => String(m.id || '')).filter(Boolean)
            : [];

        return {
            ok: true,
            message: `تم الاتصال بـ Groq بنجاح. النماذج المتاحة: ${models.length}`,
            availableModels: models,
        };
    } catch {
        return {
            ok: false,
            message: 'تعذّر الوصول إلى خدمة Groq. تحقق من اتصال الإنترنت ثم أعد المحاولة.',
            availableModels: [],
        };
    }
}
