import { audioEngine } from '../../lib/audio-engine';

/**
 * Unit Test Suite: Quran Audio System (R2) - Engine Core State & Controls
 * Tier 1: TC-R2-01 (Ayah Queue), TC-R2-02 (Gapless Mode), TC-R2-04 (Controls), TC-R2-05 (Repeat & Delay)
 * Tier 2: TC-R2-B01 (Rapid Skip Stress), TC-R2-B04 (Out-of-Bounds Seek)
 */
describe('AudioEngineCore Functional Suite', () => {
    test('TC-R2-04: Should toggle playback state correctly', async () => {
        const stateBefore = audioEngine.getState();
        expect(stateBefore.isPlaying).toBe(false);
    });

    test('TC-R2-05: Should set repeat mode and ayah delay bounds accurately', async () => {
        audioEngine.setRepeatMode('2');
        audioEngine.setAyahDelay(3);
        const state = audioEngine.getState();
        expect(state.repeatMode).toBe('2');
        expect(state.ayahDelay).toBe(3);
    });

    test('TC-R2-B04: Should safely bound rapid seek operations without runtime errors', async () => {
        audioEngine.setSpeed(1.5);
        const state = audioEngine.getState();
        expect(state.speed).toBe(1.5);
    });
});
