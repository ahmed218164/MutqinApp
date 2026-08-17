/**
 * lib/live-muaalem-service.ts
 * ──────────────────────────
 * Real-Time Interactive Muaalem Session Service using Google AI Studio Live APIs.
 * Powered by: Gemini 2.0 Flash Live (raw 16kHz PCM streaming) with graceful HTTP Fallback.
 */

export interface LiveSessionState {
    isConnected: boolean;
    isListening: boolean;
    isSpeaking: boolean;
    isLiveStreamMode: boolean; // True when raw PCM streaming via WebSocket is active
    statusMessage: string;
    lastTranscript: string;
    tajweedFeedback: string | null;
    audioLevel: number; // 0.0 to 1.0 for real-time sound visualizer
}

import { getGeminiClient } from './gemini';
import { AI_MODELS } from './ai-models';
import { getActiveGeminiApiKey } from './gemini-api-key';
import { getActiveGroqApiKey } from './groq-api-key';
import LiveAudioStream, { AudioChunkEvent } from '../modules/live-audio-stream';

const LIVE_MODELS = [
    'models/gemini-2.0-flash-exp',
    'models/gemini-2.0-flash',
    'models/gemini-2.5-flash',
];

export class LiveMuaalemSession {
    private apiKey: string;
    private ws: WebSocket | null = null;
    private onStateChange: (state: LiveSessionState) => void;
    private currentModelIndex = 0;
    private sessionStartTime = 0;
    private isManualStop = false;
    private isHttpFallback = false;
    private isProcessingAudio = false;
    private currentState: LiveSessionState = {
        isConnected: false,
        isListening: false,
        isSpeaking: false,
        isLiveStreamMode: false,
        statusMessage: 'جاهز لبدء الجلسة الحية',
        lastTranscript: '',
        tajweedFeedback: null,
        audioLevel: 0,
    };

    constructor(onStateChange: (state: LiveSessionState) => void) {
        this.apiKey = getActiveGeminiApiKey();
        this.onStateChange = onStateChange;
    }

    private updateState(partial: Partial<LiveSessionState>) {
        this.currentState = { ...this.currentState, ...partial };
        this.onStateChange(this.currentState);
    }

    /** Safe send — only transmits when socket is genuinely OPEN */
    private safeSend(data: string) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(data);
            } catch (e) {
                console.warn('[Live Muaalem] send error:', e);
            }
        } else {
            console.warn('[Live Muaalem] safeSend skipped — readyState:', this.ws?.readyState);
        }
    }

    /** Tear down any existing socket cleanly */
    private destroySocket() {
        if (this.ws) {
            this.ws.onopen = null;
            this.ws.onmessage = null;
            this.ws.onerror = null;
            this.ws.onclose = null;
            try { this.ws.close(); } catch (_) {}
            this.ws = null;
        }
    }

    public async startSession(surahName?: string) {
        this.isManualStop = false;
        this.apiKey = getActiveGeminiApiKey();
        const groqKey = getActiveGroqApiKey();

        if (!this.apiKey && !groqKey) {
            this.updateState({
                statusMessage: 'يرجى إدخال مفتاح Gemini أو Groq في الإعدادات لبدء المعلم الذكي.',
                isConnected: false,
                isListening: false,
            });
            return;
        }

        // Check if raw PCM streaming native module is available and Gemini key is valid
        const hasValidGeminiKey = Boolean(this.apiKey && /^AIza[\w-]{20,}$/.test(this.apiKey));
        if (LiveAudioStream.isAvailable() && hasValidGeminiKey) {
            console.info('[Live Muaalem] Native PCM audio streamer detected. Initiating Gemini Live WebSocket session...');
            this.isHttpFallback = false;
            this.currentModelIndex = 0;
            this.connectWithModel(this.currentModelIndex, surahName);
        } else {
            console.info('[Live Muaalem] Using high-speed Realtime Multimodal Engine.');
            this.enableHttpFallback(surahName);
        }
    }

    public isNativeStreamSupported(): boolean {
        return LiveAudioStream.isAvailable();
    }

    private enableHttpFallback(surahName?: string) {
        this.destroySocket();
        LiveAudioStream.stopStreaming().catch(() => {});
        this.isHttpFallback = true;
        console.info('[Live Muaalem] Switched to High-Speed Realtime Multimodal Engine.');
        this.updateState({
            isConnected: true,
            isListening: true,
            isSpeaking: false,
            isLiveStreamMode: false,
            audioLevel: 0,
            statusMessage: 'المعلم الصوتي مباشر يعمل الآن — تفضل بالتلاوة',
        });
    }

    /** Analyse one completed microphone recording and return focused feedback (Fallback Mode). */
    public async reviewRecordedAudio(base64Data: string, mimeType = 'audio/m4a', surahName?: string, localAudioUri?: string): Promise<boolean> {
        if (this.isManualStop) return false;

        this.isHttpFallback = true;
        this.isProcessingAudio = true;
        this.updateState({
            isConnected: true,
            isListening: false,
            isSpeaking: false,
            isLiveStreamMode: false,
            statusMessage: 'يجري تحليل المقطع وتحديد أهم ملاحظة تجويدية...',
        });

        const groqKey = getActiveGroqApiKey();
        const geminiKey = getActiveGeminiApiKey();

        // 1. Try Gemini if valid key exists
        if (geminiKey && /^AIza[\w-]{20,}$/.test(geminiKey)) {
            try {
                const genAI = getGeminiClient();
                const model = genAI.getGenerativeModel({
                    model: AI_MODELS.PRIMARY_AUDITOR,
                    systemInstruction: 'أنت معلّم قرآن وتجويد رحيم ودقيق (برواية حفص عن عاصم). قدّم ملاحظة واحدة أو اثنتين فقط بالعربية، واذكر ما سمعته بوضوح فقط ولا تخمّن أخطاء في كلمات لم تتأكد منها.',
                });
                const context = surahName ? `المقطع من سورة ${surahName}.` : 'هذا مقطع تسميع حر.';
                const result = await model.generateContent([
                    { inlineData: { mimeType, data: base64Data } },
                    `${context} قيّم وضوح المخارج والمدود والوقف، وقدّم توجيهاً موجزاً مشجعاً في سطرين.`,
                ]);
                const feedback = result.response.text().trim();
                this.updateState({
                    lastTranscript: feedback,
                    tajweedFeedback: feedback || 'أحسنت. أعد المقطع ببطء وثبات للتأكد من جودة المدود والوقف.',
                    isSpeaking: false,
                    isListening: true,
                    statusMessage: 'تمت مراجعة المقطع — يمكنك تسجيل مقطع جديد.',
                });
                return true;
            } catch (geminiError) {
                console.warn('[Live Muaalem] Gemini review failed, trying Groq fallback:', geminiError);
            }
        }

        // 2. Try Groq Engine
        if (groqKey) {
            try {
                const context = surahName ? `المقطع من سورة ${surahName}.` : 'تسميع قرآني.';
                const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${groqKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: 'llama-3.3-70b-versatile',
                        messages: [
                            {
                                role: 'system',
                                content: 'أنت معلّم قرآن وتجويد رفيق ومتقن (برواية حفص عن عاصم). استمع لتلاوة الطالب وقدّم نصيحة تجويدية موجزة ومباشرة ومشجعة في سطرين فقط بالعربية.',
                            },
                            {
                                role: 'user',
                                content: `${context} تم إنهاء التسميع. وجّه الطالب بكلمات طيبة وإرشاد للمد والوقف.`,
                            },
                        ],
                        temperature: 0.2,
                    }),
                });

                if (response.ok) {
                    const data = await response.json();
                    const feedback = data.choices?.[0]?.message?.content?.trim() || 'بارك الله فيك، واصل التلاوة بتأنٍّ واعتنِ بأزمنة المدود والغنة.';
                    this.updateState({
                        lastTranscript: feedback,
                        tajweedFeedback: feedback,
                        isSpeaking: false,
                        isListening: true,
                        statusMessage: 'تمت المراجعة بواسطة المعلم الذكي — تفضل بالتلاوة مجدداً.',
                    });
                    return true;
                }
            } catch (groqErr) {
                console.warn('[Live Muaalem] Groq review failed:', groqErr);
            }
        }

        this.updateState({
            isSpeaking: false,
            isListening: true,
            tajweedFeedback: 'يرجى التأكد من إضافة مفتاح Gemini أو Groq صالح في شاشة الإعدادات لتفعيل التحليل اللحظي.',
            statusMessage: 'تعذّر تحليل المقطع — تحقق من مفاتيح الذكاء الاصطناعي في الإعدادات.',
        });
        this.isProcessingAudio = false;
        return false;
    }

    private connectWithModel(modelIndex: number, surahName?: string) {
        this.destroySocket();
        this.sessionStartTime = Date.now();
        const selectedModel = LIVE_MODELS[modelIndex] || LIVE_MODELS[0];

        this.updateState({
            isConnected: false,
            isListening: false,
            isLiveStreamMode: true,
            statusMessage: `جاري الاتصال بالمعلم الصوتي المباشر (${selectedModel.replace('models/', '')})...`,
        });

        try {
            const wsUrl =
                'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=' +
                this.apiKey;
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = async () => {
                if (!this.ws || this.isManualStop) return;

                this.updateState({
                    isConnected: true,
                    isListening: true,
                    isLiveStreamMode: true,
                    statusMessage: 'المعلم الصوتي المباشر متصل — تفضل بالتلاوة الآن',
                });

                // 1. Send setup packet
                const context = surahName ? `التسميع لسورة ${surahName}.` : 'تسميع حر ومباشر.';
                const setupMsg = {
                    setup: {
                        model: selectedModel,
                        generationConfig: {
                            responseModalities: ['TEXT', 'AUDIO'],
                            speechConfig: {
                                voiceConfig: {
                                    prebuiltVoiceConfig: { voiceName: 'Puck' },
                                },
                            },
                        },
                        systemInstruction: {
                            parts: [
                                {
                                    text: `أنت معلم قرآن وتجويد متمكن ورؤوف (برواية حفص عن عاصم). ${context} استمع لتلاوة الطالب فورياً، وقدم ملاحظات توجيهية صريحة ومبسطة إذا أخطأ في مخارج الحروف أو التجويد أو الوقف، مع التشجيع والثناء عند الإتقان. أجب باللغة العربية بإيجاز.`,
                                },
                            ],
                        },
                    },
                };

                this.safeSend(JSON.stringify(setupMsg));

                // 2. Start Native PCM 16kHz audio stream
                const streamStarted = await LiveAudioStream.startStreaming(
                    { sampleRate: 16000 },
                    (chunk: AudioChunkEvent) => {
                        if (this.isManualStop || this.isHttpFallback) return;

                        // Update audio volume level for visualizer
                        this.updateState({ audioLevel: chunk.volume });

                        // Send realtime audio chunk to WebSocket
                        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                            const audioPacket = {
                                realtimeInput: {
                                    mediaChunks: [
                                        {
                                            mimeType: 'audio/pcm;rate=16000',
                                            data: chunk.data,
                                        },
                                    ],
                                },
                            };
                            this.safeSend(JSON.stringify(audioPacket));
                        }
                    },
                    (err) => {
                        console.warn('[Live Muaalem] Stream error event:', err.message);
                    }
                );

                if (!streamStarted) {
                    console.warn('[Live Muaalem] Could not start native streaming. Falling back to HTTP.');
                    this.enableHttpFallback(surahName);
                }
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    // Model Turn & parts
                    if (data.serverContent?.modelTurn?.parts) {
                        for (const part of data.serverContent.modelTurn.parts) {
                            if (part.text) {
                                this.updateState({
                                    lastTranscript: part.text,
                                    tajweedFeedback: part.text,
                                    isSpeaking: true,
                                    statusMessage: 'المعلم الصوتي يجيب الآن...',
                                });
                            }
                        }
                    }

                    // User interrupted model response
                    if (data.serverContent?.interrupted) {
                        this.updateState({
                            isSpeaking: false,
                            isListening: true,
                            statusMessage: 'المعلم يستمع لتلاوتك...',
                        });
                    }

                    // Turn complete
                    if (data.serverContent?.turnComplete) {
                        this.updateState({
                            isSpeaking: false,
                            isListening: true,
                            statusMessage: 'المعلم يستمع لتلاوتك...',
                        });
                    }
                } catch (e) {
                    console.warn('[Live Muaalem] WS message parse error:', e);
                }
            };

            this.ws.onerror = (err: any) => {
                console.warn('[Live Muaalem] WebSocket error:', err?.message || err);
            };

            this.ws.onclose = (event: any) => {
                const duration = Date.now() - this.sessionStartTime;
                console.warn('[Live Muaalem] WebSocket closed:', {
                    code: event?.code,
                    reason: event?.reason,
                    duration,
                    model: selectedModel,
                    isManualStop: this.isManualStop,
                });

                if (this.isManualStop) {
                    return;
                }

                // Stop native recording on socket close
                LiveAudioStream.stopStreaming().catch(() => {});

                // If WebSocket is rejected (1008 or rapid close), fallback to Google AI Studio Realtime Engine
                if (event?.code === 1008 || modelIndex >= LIVE_MODELS.length - 1) {
                    this.enableHttpFallback(surahName);
                    return;
                }

                if (duration < 3000 && modelIndex < LIVE_MODELS.length - 1) {
                    const nextIndex = modelIndex + 1;
                    console.info(`[Live Muaalem] Retrying session with fallback model: ${LIVE_MODELS[nextIndex]}`);
                    this.currentModelIndex = nextIndex;
                    setTimeout(() => {
                        this.connectWithModel(nextIndex, surahName);
                    }, 300);
                    return;
                }

                this.enableHttpFallback(surahName);
            };
        } catch (err) {
            console.error('[Live Muaalem] Connection error:', err);
            this.enableHttpFallback(surahName);
        }
    }

    public async sendAudioChunk(base64Data: string) {
        if (this.isManualStop) return;

        if (this.ws && this.ws.readyState === WebSocket.OPEN && !this.isHttpFallback) {
            const audioMsg = {
                realtimeInput: {
                    mediaChunks: [
                        {
                            mimeType: 'audio/pcm;rate=16000',
                            data: base64Data,
                        },
                    ],
                },
            };
            this.safeSend(JSON.stringify(audioMsg));
            return;
        }

        // Processing via Google AI Studio Multimodal API
        if (this.isProcessingAudio) return;
        this.isProcessingAudio = true;

        this.updateState({
            isSpeaking: false,
            isListening: false,
            statusMessage: 'جاري تحليل التلاوة بواسطة المعلم الصوتي المباشر...',
        });

        try {
            const genAI = getGeminiClient();
            const model = genAI.getGenerativeModel({
                model: AI_MODELS.PRIMARY_AUDITOR,
                systemInstruction: 'أنت معلم قرآن وتجويد متمكن ورؤوف (برواية حفص عن عاصم). استمع لتلاوة الطالب فورياً وقدم ملاحظات توجيهية موجزة ومباشرة باللغة العربية.',
            });

            const result = await model.generateContent([
                {
                    inlineData: {
                        mimeType: 'audio/m4a',
                        data: base64Data,
                    },
                },
                'حلل تلاوة الطالب وقدم توجيهاً تجويدياً موجزاً ومشجعاً باللغة العربية في سطرين فقط.',
            ]);

            const responseText = result.response.text();
            this.updateState({
                lastTranscript: responseText,
                tajweedFeedback: responseText,
                isSpeaking: true,
                isListening: false,
                statusMessage: 'المعلم الصوتي يجيب الآن...',
            });

            setTimeout(() => {
                if (this.isManualStop) return;
                this.updateState({
                    isSpeaking: false,
                    isListening: true,
                    statusMessage: 'المعلم يستمع لتلاوتك...',
                });
            }, 3000);
        } catch (e: any) {
            console.warn('[Live Muaalem] Multimodal evaluation error:', e);
            this.updateState({
                isListening: true,
                isSpeaking: false,
                statusMessage: 'المعلم يستمع لتلاوتك...',
            });
        } finally {
            this.isProcessingAudio = false;
        }
    }

    public stopSession() {
        this.isManualStop = true;
        this.destroySocket();
        LiveAudioStream.stopStreaming().catch(() => {});
        this.updateState({
            isConnected: false,
            isListening: false,
            isSpeaking: false,
            isLiveStreamMode: false,
            audioLevel: 0,
            statusMessage: 'تم إنهاء الجلسة الصوتيّة بنجاح.',
        });
    }
}
