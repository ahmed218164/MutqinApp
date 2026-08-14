/**
 * lib/groq.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * High-Speed Groq Cloud Audio Transcription & Tajweed Reasoning Client
 * Matches official Groq API specifications (OpenAI-compatible endpoints):
 * - Audio Transcription: POST https://api.groq.com/openai/v1/audio/transcriptions
 * - Chat Completion: POST https://api.groq.com/openai/v1/chat/completions
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { getActiveGroqApiKey } from './groq-api-key';

export interface GroqTranscriptionResult {
    text: string;
    duration?: number;
    segments?: Array<{
        id: number;
        start: number;
        end: number;
        text: string;
    }>;
    words?: Array<{
        word: string;
        start: number;
        end: number;
    }>;
    error?: string;
}

/**
 * Transcribe Quran recitation audio using Groq Whisper-Large-v3-Turbo
 * Endpoint: POST https://api.groq.com/openai/v1/audio/transcriptions
 * 
 * @param audioUri Local file URI (.m4a, .wav, .mp3)
 * @param referencePrompt Optional Quranic reference text to guide Whisper orthography
 */
export async function transcribeRecitationWithGroq(
    audioUri: string,
    referencePrompt?: string
): Promise<GroqTranscriptionResult> {
    const apiKey = getActiveGroqApiKey();
    if (!apiKey) {
        return { text: '', error: 'مفتاح Groq API غير متوفر.' };
    }

    try {
        const formData = new FormData();

        const filename = audioUri.split('/').pop() || 'recitation.m4a';
        let mimeType = 'audio/m4a';
        if (filename.endsWith('.wav')) mimeType = 'audio/wav';
        if (filename.endsWith('.mp3')) mimeType = 'audio/mpeg';

        formData.append('file', {
            uri: audioUri,
            name: filename,
            type: mimeType,
        } as any);

        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('language', 'ar');
        formData.append('temperature', '0');
        formData.append('response_format', 'verbose_json');
        formData.append('timestamp_granularities[]', 'word');
        formData.append('timestamp_granularities[]', 'segment');

        if (referencePrompt) {
            formData.append('prompt', `تلاوة قرآنية مجودة برواية حفص عن عاصم: ${referencePrompt}`);
        }

        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            const msg = errBody?.error?.message || `فشل Groq Whisper (HTTP ${response.status})`;
            console.warn('[Groq Whisper]', msg);
            return { text: '', error: msg };
        }

        const data = await response.json();
        return {
            text: data.text?.trim() || '',
            duration: data.duration,
            segments: data.segments,
            words: data.words,
        };
    } catch (err: any) {
        console.error('[Groq Whisper] Request failed:', err);
        return { text: '', error: err?.message || 'تعذّر الاتصال بخدمة Groq Whisper' };
    }
}

/**
 * Perform secondary Tajweed audit and recitation evaluation using Groq LLM
 * Endpoint: POST https://api.groq.com/openai/v1/chat/completions
 * Models: llama-3.3-70b-versatile, qwen/qwen3.6-27b, llama-3.1-8b-instant
 */
export async function auditRecitationWithGroqLLM(
    transcribedText: string,
    referenceText: string,
    phoneticRef?: string,
    modelName: string = 'llama-3.3-70b-versatile'
): Promise<any> {
    const apiKey = getActiveGroqApiKey();
    if (!apiKey) {
        throw new Error('مفتاح Groq API غير متوفر');
    }

    const systemPrompt = `You are an expert Quran Tajweed Examiner and scholar (رواية حفص عن عاصم).
Audit the student's transcribed recitation against the reference Uthmani text.
Detect word omissions, substitutions, Tashkeel (vowel) errors, and Tajweed violations.

Return JSON ONLY with this exact structure:
{
  "score": <number 0-100>,
  "mistakes": [
    {
      "text": "<Arabic word heard incorrectly>",
      "correction": "<correct Uthmani word with tashkeel>",
      "description": "<Detailed Arabic explanation naming the Tajweed rule or recitation error>",
      "category": "tajweed|pronunciation|elongation|waqf|omission",
      "severity": "minor|moderate|major|critical"
    }
  ]
}`;

    const userPrompt = `REFERENCE UTHMANI TEXT (with full Tashkeel):\n${referenceText}\n\n${phoneticRef ? `PHONETIC GROUND TRUTH:\n${phoneticRef}\n\n` : ''}STUDENT'S RECITED TEXT:\n${transcribedText}`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: modelName,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.1,
            response_format: { type: 'json_object' },
        }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error?.message || `فشل Groq LLM (HTTP ${response.status})`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    return JSON.parse(content);
}
