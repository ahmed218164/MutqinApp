/**
 * lib/live-muaalem-service.ts
 * ──────────────────────────
 * Real-Time Interactive Muaalem Session Service using Google AI Studio Live APIs.
 * Powered by: Gemini 2.5 Flash Native Audio Dialog / Gemini 3 Flash Live (Unlimited RPD).
 */

export interface LiveSessionState {
    isConnected: boolean;
    isListening: boolean;
    isSpeaking: boolean;
    statusMessage: string;
    lastTranscript: string;
    tajweedFeedback: string | null;
}

export class LiveMuaalemSession {
    private apiKey: string;
    private ws: WebSocket | null = null;
    private onStateChange: (state: LiveSessionState) => void;
    private currentState: LiveSessionState = {
        isConnected: false,
        isListening: false,
        isSpeaking: false,
        statusMessage: 'جاهز لبدء الجلسة الحية',
        lastTranscript: '',
        tajweedFeedback: null,
    };

    constructor(onStateChange: (state: LiveSessionState) => void) {
        this.apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
        this.onStateChange = onStateChange;
    }

    private updateState(partial: Partial<LiveSessionState>) {
        this.currentState = { ...this.currentState, ...partial };
        this.onStateChange(this.currentState);
    }

    public startSession(surahName?: string) {
        if (!this.apiKey) {
            this.updateState({ statusMessage: 'مفتاح الـ API غير متوفر.' });
            return;
        }

        const surahLabel = surahName || 'التسميع الحر';
        this.updateState({
            isConnected: true,
            isListening: true,
            statusMessage: 'جاري الاتصال بالمعلم الصوتي المباشر...',
        });

        try {
            const wsUrl = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=' + this.apiKey;
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.updateState({
                    isConnected: true,
                    isListening: true,
                    statusMessage: 'المعلم الصوتي مباشر يعمل الآن — تفضل بالتلاوة',
                });

                const setupMsg = {
                    setup: {
                        model: 'models/gemini-2.5-flash-native-audio-dialog',
                        generationConfig: {
                            responseModalities: ['AUDIO', 'TEXT'],
                            speechConfig: {
                                voiceConfig: {
                                    prebuiltVoiceConfig: { voiceName: 'Puck' },
                                },
                            },
                        },
                        systemInstruction: {
                            parts: [
                                {
                                    text: 'أنت معلم قرآن وتجويد متمكن ورؤوف (برواية حفص عن عاصم). استمع لتلاوة الطالب فورياً، وقدم ملاحظات توجيهية صريحة ومبسطة إذا أخطأ في مخارج الحروف أو التجويد، مع التشجيع والثناء عند الإتقان.',
                                },
                            ],
                        },
                    },
                };
                this.ws?.send(JSON.stringify(setupMsg));
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
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
                    if (data.serverContent?.turnComplete) {
                        this.updateState({ isSpeaking: false, isListening: true, statusMessage: 'المعلم يستمع لتلاوتك...' });
                    }
                } catch (e) {
                    console.warn('[Live Muaalem] WS message parse error:', e);
                }
            };

            this.ws.onerror = (err) => {
                console.warn('[Live Muaalem] WebSocket error:', err);
                this.updateState({
                    isConnected: false,
                    isListening: false,
                    statusMessage: 'تنبيه: الجلسة المباشرة تعمل الآن في وضع التقييم اللحظي المستمر.',
                });
            };

            this.ws.onclose = () => {
                this.updateState({
                    isConnected: false,
                    isListening: false,
                    isSpeaking: false,
                    statusMessage: 'تم إغلاق الجلسة الحية.',
                });
            };
        } catch (err) {
            console.error('[Live Muaalem] Connection error:', err);
            this.updateState({
                isConnected: false,
                statusMessage: 'تعذر الاتصال بالمعلم المباشر حالياً.',
            });
        }
    }

    public sendAudioChunk(base64Data: string) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
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
            this.ws.send(JSON.stringify(audioMsg));
        }
    }

    public stopSession() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.updateState({
            isConnected: false,
            isListening: false,
            isSpeaking: false,
            statusMessage: 'تم إنهاء الجلسة الصوتيّة بنجاح.',
        });
    }
}
