import LiveAudioStream, { isAvailable, isStreaming, startStreaming, stopStreaming } from '../../modules/live-audio-stream';
import { LiveMuaalemSession } from '../../lib/live-muaalem-service';

describe('Live Audio Streamer Native Module & Live Muaalem Service', () => {
    test('TC-LAS-01: Module functions should be defined and handle unlinked/test environments safely', () => {
        expect(typeof isAvailable).toBe('function');
        expect(typeof isStreaming).toBe('function');
        expect(typeof startStreaming).toBe('function');
        expect(typeof stopStreaming).toBe('function');

        // In test/node environment, native module should return false gracefully without crashing
        expect(isAvailable()).toBe(false);
        expect(isStreaming()).toBe(false);
    });

    test('TC-LAS-02: startStreaming should return false when native module is unavailable', async () => {
        const onChunk = jest.fn();
        const success = await startStreaming({ sampleRate: 16000 }, onChunk);
        expect(success).toBe(false);
        expect(onChunk).not.toHaveBeenCalled();
    });

    test('TC-LAS-03: stopStreaming should resolve safely even without native module', async () => {
        await expect(stopStreaming()).resolves.toBeUndefined();
    });

    test('TC-LAS-04: LiveMuaalemSession initializes and handles fallback mode correctly', () => {
        const stateCallback = jest.fn();
        const session = new LiveMuaalemSession(stateCallback);

        expect(typeof session.startSession).toBe('function');
        expect(typeof session.stopSession).toBe('function');
        expect(typeof session.reviewRecordedAudio).toBe('function');
        expect(typeof session.isNativeStreamSupported).toBe('function');

        // Verify native stream detection in test environment
        expect(session.isNativeStreamSupported()).toBe(false);

        // Start session — should automatically switch to HTTP fallback without error
        session.startSession('الفاتحة');
        expect(stateCallback).toHaveBeenCalledWith(
            expect.objectContaining({
                isConnected: true,
                isListening: true,
                isLiveStreamMode: false,
            })
        );

        // Stop session cleanly
        session.stopSession();
        expect(stateCallback).toHaveBeenCalledWith(
            expect.objectContaining({
                isConnected: false,
                isListening: false,
                isSpeaking: false,
            })
        );
    });
});
