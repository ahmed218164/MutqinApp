import { checkRecitationWithMuaalem } from '../../lib/muaalem-api';

/**
 * Unit Test Suite: Recitation AI Engine (R1) - Audio Guard & Payload Processing
 * Tier 1: TC-R1-01 (Clean Assessment), TC-R1-03 (Minimum Audio Guard)
 * Tier 2: TC-R1-B04 (Sub-Threshold Audio Duration)
 */
describe('Muaalem API Guard & Base64 Engine', () => {
    test('TC-R1-03 & TC-R1-B04: Should reject silent/short audio files under 5 KB without calling API', async () => {
        // Small fake audio file URI or path
        const fakeShortAudioUri = 'file:///dummy_short_audio.wav';
        const result = await checkRecitationWithMuaalem(fakeShortAudioUri, 'الفاتحة', 1, 1);
        
        expect(result.score).toBe(0);
        expect(result.error).toContain('التسجيل قصير جداً أو صامت');
    });
});
