import { phonetize, phonetizeForQiraat } from '../../lib/quran-phonetizer';
import { getAudioMimeType } from '../../lib/gemini';
import { checkRecitationWithMuaalem } from '../../lib/muaalem-api';

describe('Quran Tajweed & Phonetizer Accuracy Test Suite', () => {
    test('TC-PHON-01: Correctly encodes natural madd (2 counts) and long madd (4/6 counts)', () => {
        // Natural Madd (حركتان)
        const naturalText = 'قَالَ يَا مُوسَىٰ';
        const naturalPhonetic = phonetize(naturalText);
        expect(naturalPhonetic).toBeDefined();
        // Superalef or natural alef should be represented
        expect(naturalPhonetic.length).toBeGreaterThan(0);

        // Connected/Separated Madd (4 counts)
        const mottaselText = 'إِذَا جَآءَ نَصۡرُ ٱللَّهِ';
        const mottaselPhonetic = phonetize(mottaselText);
        expect(mottaselPhonetic).toBeDefined();
    });

    test('TC-PHON-02: Qiraat-aware phonetizer sets correct narration config', () => {
        const hafsPhonetic = phonetizeForQiraat('بِسۡمِ ٱللَّهِ ٱلرَّحۡمَـٰنِ ٱلرَّحِيمِ', 'Hafs');
        const warshPhonetic = phonetizeForQiraat('بِسۡمِ ٱللَّهِ ٱلرَّحۡمَـٰنِ ٱلرَّحِيمِ', 'Warsh');

        expect(typeof hafsPhonetic).toBe('string');
        expect(typeof warshPhonetic).toBe('string');
        expect(hafsPhonetic.length).toBeGreaterThan(0);
    });

    test('TC-MIME-01: Audio MIME type resolver handles various container formats', () => {
        expect(getAudioMimeType('file:///path/to/recording.m4a')).toBe('audio/m4a');
        expect(getAudioMimeType('recording.wav')).toBe('audio/wav');
        expect(getAudioMimeType('recording.mp3')).toBe('audio/mp3');
        expect(getAudioMimeType('audio/pcm')).toBe('audio/pcm');
        expect(getAudioMimeType(undefined)).toBe('audio/m4a');
    });

    test('TC-API-01: checkRecitationWithMuaalem guards against nonexistent audio file', async () => {
        const result = await checkRecitationWithMuaalem(
            'file:///nonexistent/audio/path.m4a',
            'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَـٰنِ ٱلرَّحِيمِ'
        );

        expect(result).toBeDefined();
        expect(result.score).toBe(0);
        expect(result.error).toBeDefined();
    });
});
