import { type EventSubscription, requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export interface StreamOptions {
    sampleRate?: number; // default 16000
    chunkDurationMs?: number; // default 100ms
}

export interface AudioChunkEvent {
    data: string; // Base64 16-bit linear PCM (Little-Endian)
    volume: number; // Normalized RMS volume [0.0 - 1.0]
    bytesRead?: number;
    sampleRate?: number;
}

export interface AudioErrorEvent {
    message: string;
}

// Safely obtain native module reference
let NativeLiveAudioStream: any = null;

try {
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
        NativeLiveAudioStream = requireNativeModule('LiveAudioStream');
    }
} catch {
    // Native module not linked or running in Expo Go / Web
    NativeLiveAudioStream = null;
}

/**
 * Check if the raw PCM native audio streaming module is available in this runtime environment.
 * Returns false on Expo Go, Web, or unlinked environments, signaling graceful fallback to HTTP analysis.
 */
export function isAvailable(): boolean {
    return Boolean(
        NativeLiveAudioStream &&
        typeof NativeLiveAudioStream.startStreaming === 'function' &&
        typeof NativeLiveAudioStream.stopStreaming === 'function'
    );
}

/**
 * Check if active PCM streaming is in progress.
 */
export function isStreaming(): boolean {
    if (!isAvailable()) return false;
    try {
        return Boolean(NativeLiveAudioStream.isStreaming?.());
    } catch {
        return false;
    }
}

let activeChunkSubscription: EventSubscription | null = null;
let activeErrorSubscription: EventSubscription | null = null;

/**
 * Start 16kHz 16-bit Mono PCM raw microphone streaming.
 * @param options Streaming options (sampleRate default 16000)
 * @param onChunk Callback receiving raw Base64 PCM chunks
 * @param onError Optional error callback
 */
export async function startStreaming(
    options: StreamOptions = { sampleRate: 16000 },
    onChunk: (event: AudioChunkEvent) => void,
    onError?: (event: AudioErrorEvent) => void
): Promise<boolean> {
    if (!isAvailable()) {
        console.warn('[LiveAudioStream] Native module is not available in current environment.');
        return false;
    }

    stopStreamingSubscriptions();

    if (NativeLiveAudioStream && typeof NativeLiveAudioStream.addListener === 'function') {
        activeChunkSubscription = NativeLiveAudioStream.addListener('onAudioChunk', (event: AudioChunkEvent) => {
            if (onChunk && event?.data) {
                onChunk(event);
            }
        });

        if (onError) {
            activeErrorSubscription = NativeLiveAudioStream.addListener('onError', (event: AudioErrorEvent) => {
                onError(event);
            });
        }
    }

    try {
        const success = await NativeLiveAudioStream.startStreaming({
            sampleRate: options.sampleRate || 16000,
        });
        return Boolean(success);
    } catch (err: any) {
        console.error('[LiveAudioStream] startStreaming error:', err);
        stopStreamingSubscriptions();
        if (onError) {
            onError({ message: err?.message || 'Failed to start PCM streaming' });
        }
        return false;
    }
}

/**
 * Stop live PCM microphone streaming and cleanup subscriptions.
 */
export async function stopStreaming(): Promise<void> {
    stopStreamingSubscriptions();

    if (isAvailable()) {
        try {
            await NativeLiveAudioStream.stopStreaming();
        } catch (err) {
            console.warn('[LiveAudioStream] stopStreaming error:', err);
        }
    }
}

function stopStreamingSubscriptions() {
    if (activeChunkSubscription) {
        try {
            activeChunkSubscription.remove();
        } catch (_) {}
        activeChunkSubscription = null;
    }
    if (activeErrorSubscription) {
        try {
            activeErrorSubscription.remove();
        } catch (_) {}
        activeErrorSubscription = null;
    }
}

export default {
    isAvailable,
    isStreaming,
    startStreaming,
    stopStreaming,
};
