import { NativeEventEmitter, NativeModules, Platform, type EmitterSubscription } from 'react-native';

type PcmData = { data: string; sampleRate: number };

type NativePcmRecorder = {
    start(sampleRate: number): Promise<boolean>;
    stop(): Promise<boolean>;
    addListener(eventName: string): void;
    removeListeners(count: number): void;
};

const nativeRecorder = NativeModules.MutqinPcmRecorder as NativePcmRecorder | undefined;

/** Native PCM capture is deliberately Android-only until the iOS module ships. */
export function isPcmStreamingSupported(): boolean {
    return Platform.OS === 'android' && Boolean(nativeRecorder);
}

export async function startPcmStreaming(
    onData: (chunk: PcmData) => void,
    onError: (message: string) => void,
): Promise<() => Promise<void>> {
    if (!isPcmStreamingSupported() || !nativeRecorder) {
        throw new Error('البث الصوتي PCM يحتاج نسخة Android مخصّصة من التطبيق.');
    }

    const emitter = new NativeEventEmitter(nativeRecorder as any);
    const subscriptions: EmitterSubscription[] = [
        emitter.addListener('mutqinPcmData', onData),
        emitter.addListener('mutqinPcmError', onError),
    ];

    try {
        await nativeRecorder.start(16000);
    } catch (error) {
        subscriptions.forEach(subscription => subscription.remove());
        throw error;
    }

    return async () => {
        subscriptions.forEach(subscription => subscription.remove());
        await nativeRecorder.stop().catch(() => undefined);
    };
}
