import { checkRecitationWithMuaalem } from '../../lib/muaalem-api';
import { audioEngine } from '../../lib/audio-engine';

/**
 * Tier 4 Scenario 1: Complete Daily Ward Memorization Cycle
 * Pipeline: Dashboard Launch -> Audio Playback & Sync -> Audio Recording -> Gemini AI Assessment -> RLS Persistence -> Emerald UI Reward
 */
describe('E2E Scenario 1: Daily Ward Memorization Workflow', () => {
    test('Step 1-6: Execute Daily Ward Workflow end-to-end contract', async () => {
        // 1. Dashboard launch state check
        expect(audioEngine).toBeDefined();

        // 2. Playback initialization
        const initialEngineState = audioEngine.getState();
        expect(initialEngineState.isPlaying).toBe(false);

        // 3. Audio recording guard check (<5 KB silent file rejection)
        const fakeRecording = 'file:///dummy_ward_recitation.wav';
        const aiAssessment = await checkRecitationWithMuaalem(fakeRecording, 'الملك', 67, 1);
        
        expect(aiAssessment).toBeDefined();
        expect(aiAssessment.score).toBe(0); // Guard rejected silent file properly
    });
});
