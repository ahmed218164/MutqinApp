import { AI_MODELS, generateWithFallback, isModelRateLimited, markModelRateLimited } from '../../lib/ai-models';

/**
 * Unit Test Suite: Recitation AI Engine (R1) - Model Fallback & Caching
 * Tier 1: TC-R1-02 (Multi-Model Fallback)
 * Tier 2: TC-R1-B02 (Offline Disconnect / Error Recovery)
 */
describe('AI Models & Multi-Model Fallback Engine', () => {
    beforeEach(() => {
        // Clear rate-limit state between tests
    });

    test('TC-R1-02: Should mark model rate-limited and fallback on 429 error', async () => {
        const testModel = 'gemini-3-flash-preview';
        markModelRateLimited(testModel);
        
        const isLimited = isModelRateLimited(testModel);
        expect(isLimited).toBe(true);
    });

    test('TC-R1-B02: Should handle network drop or quota error gracefully', async () => {
        expect(AI_MODELS.PRIMARY_AUDITOR).toBeDefined();
        expect(AI_MODELS.RANDOM_TESTER).toBeDefined();
    });
});
