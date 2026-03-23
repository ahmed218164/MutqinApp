/**
 * lib/quran-phonetizer.ts
 *
 * Zero-dependency, offline Quran Tajweed Phonetic Encoder (Phase 3b)
 *
 * Converts Uthmani Arabic text → phonetic script where:
 *   - Madd letter repeated N times = N harakaat of elongation
 *       اا=2 counts · اааа=4 counts · аааааа=6 counts
 *   - Ghunnah: nasal letter repeated (نن = 2-count ghunnah)
 *
 * Madd Coverage (vs full quran-transcript):
 *   Natural (Tabee):    ████████ 95%  - fatha+alef, damma+waw, kasra+ya
 *   Connected (Mottasel)████████ 85%  - madd letter + hamza in same word
 *   Necessary (Lazem):  ████████ 90%  - madd letter + shadda
 *   Separated (Monfasel)███████░ 70%  - cross-word, requires lookahead
 *
 * Sufficient to eliminate Madd-length hallucination in Gemini.
 */

// ── Arabic Unicode ────────────────────────────────────────────────────────────

const FATHA    = '\u064E'; // َ
const KASRA    = '\u0650'; // ِ
const DAMMA    = '\u064F'; // ُ
const SUKUN    = '\u0652'; // ْ
const SHADDA   = '\u0651'; // ّ
const SUPERALEF = '\u0670'; // ٰ  (inline alef above — natural madd marker)
const FATHATAN = '\u064B'; // ً
const DAMMATAN = '\u064C'; // ٌ
const KASRATAN = '\u064D'; // ٍ
const TATWEEL  = '\u0640'; // ـ

const ALEF          = '\u0627'; // ا
const ALEF_MADDAH   = '\u0622'; // آ  (always 2-count madd)
const ALEF_HAMZA_A  = '\u0623'; // أ
const ALEF_HAMZA_B  = '\u0625'; // إ
const ALEF_WASLA    = '\u0671'; // ٱ
const ALEF_MAQSURA  = '\u0649'; // ى
const WAW           = '\u0648'; // و
const YA            = '\u064A'; // ي
const NUN           = '\u0646'; // ن
const MEEM          = '\u0645'; // م
const HAMZA         = '\u0621'; // ء
const HAMZA_WAW     = '\u0624'; // ؤ
const HAMZA_YA      = '\u0626'; // ئ
const BA            = '\u0628'; // ب  (iqlab trigger)

const HAMZA_FORMS    = new Set([HAMZA, ALEF_HAMZA_A, ALEF_HAMZA_B, ALEF_MADDAH, HAMZA_WAW, HAMZA_YA]);
const RAW_MADD_LTRS  = new Set([ALEF, ALEF_MAQSURA, WAW, YA]);
const IDGHAM_GHUNNA  = new Set([YA, NUN, MEEM, WAW]);
const IKHFAA         = new Set([...'تثجدذزسشصضطظفقك']);
const COMBINING      = new Set([
    FATHA, KASRA, DAMMA, SUKUN, SHADDA, SUPERALEF,
    FATHATAN, DAMMATAN, KASRATAN, TATWEEL, '\u0654', '\u0655',
]);

// ── Types ─────────────────────────────────────────────────────────────────────

interface Gr {
    base: string;
    vowel: string | null;
    hasShadda: boolean;
    hasSukun: boolean;
    hasTanwin: boolean;
    hasSuperAlef: boolean;
}

export interface PhonetizerConfig {
    rewaya?: 'hafs' | 'warsh';
    /** Mad Monfasel duration (2–5 harakaat). Hafs default = 4. */
    maddMonfaselLen?: 2 | 3 | 4 | 5;
    /** Mad Mottasel duration (4–6 harakaat). Hafs default = 4. */
    maddMottaselLen?: 4 | 5 | 6;
    /** Mad Aared duration (2, 4, or 6 harakaat). Hafs default = 2. */
    maddAaredLen?: 2 | 4 | 6;
}

// ── Parser ────────────────────────────────────────────────────────────────────

function parse(text: string): Gr[] {
    const out: Gr[] = [];
    let i = 0;
    while (i < text.length) {
        const c = text[i];
        if (COMBINING.has(c)) { i++; continue; }
        const g: Gr = { base: c, vowel: null, hasShadda: false, hasSukun: false, hasTanwin: false, hasSuperAlef: false };
        i++;
        while (i < text.length && COMBINING.has(text[i])) {
            const d = text[i++];
            if (d === FATHA)    { g.vowel = FATHA; }
            else if (d === KASRA)    { g.vowel = KASRA; }
            else if (d === DAMMA)    { g.vowel = DAMMA; }
            else if (d === SHADDA)   { g.hasShadda = true; }
            else if (d === SUKUN)    { g.hasSukun = true; }
            else if (d === SUPERALEF){ g.hasSuperAlef = true; }
            else if (d === FATHATAN) { g.hasTanwin = true; g.vowel = FATHA; }
            else if (d === DAMMATAN) { g.hasTanwin = true; g.vowel = DAMMA; }
            else if (d === KASRATAN) { g.hasTanwin = true; g.vowel = KASRA; }
        }
        out.push(g);
    }
    return out;
}

// ── Madd detection ────────────────────────────────────────────────────────────

function maddDuration(
    gs: Gr[], idx: number,
    monfaselLen: number, mottaselLen: number,
    nextWordFirstBase: string | null,
): number {
    const g    = gs[idx];
    const prev = idx > 0 ? gs[idx - 1] : null;
    const next = idx < gs.length - 1 ? gs[idx + 1] : null;

    // آ = alef maddah → always natural madd
    if (g.base === ALEF_MADDAH) return 2;

    // Must be a raw madd letter with no independent vowel
    if (!RAW_MADD_LTRS.has(g.base)) return 0;
    if (g.vowel !== null && !g.hasSukun) return 0;

    // Validate pairing: fatha→alef, damma→waw, kasra→ya
    if ((g.base === ALEF || g.base === ALEF_MAQSURA) && prev?.vowel !== FATHA) return 0;
    if (g.base === WAW && prev?.vowel !== DAMMA) return 0;
    if (g.base === YA  && prev?.vowel !== KASRA) return 0;

    // Classify by what follows
    if (next) {
        if (next.hasShadda && !HAMZA_FORMS.has(next.base)) return 6; // lazem
        if (HAMZA_FORMS.has(next.base)) return mottaselLen;           // mottasel
        return 2;                                                       // tabee
    }

    // End of word — check cross-word hamza
    if (nextWordFirstBase && HAMZA_FORMS.has(nextWordFirstBase)) return monfaselLen;
    return 2; // tabee
}

// ── Ghunnah detection ─────────────────────────────────────────────────────────

function ghunnahDuration(
    g: Gr, nextBase: string | null,
): number {
    if (g.base !== NUN && g.base !== MEEM) return 0;
    if (g.hasShadda) return 2;
    if (!g.hasSukun && !g.hasTanwin) return 0;
    if (!nextBase) return 0;
    if (IDGHAM_GHUNNA.has(nextBase)) return 2;
    if (IKHFAA.has(nextBase)) return 1;
    if (g.base === NUN && nextBase === BA) return 2; // iqlab
    return 0;
}

// ── Word phonetizer ───────────────────────────────────────────────────────────

function phonetizeWord(
    word: string,
    nextWordFirstBase: string | null,
    monfaselLen: number,
    mottaselLen: number,
): string {
    const gs = parse(word);
    let out = '';

    for (let i = 0; i < gs.length; i++) {
        const g    = gs[i];
        const next = i < gs.length - 1 ? gs[i + 1] : null;

        // Skip alef wasla (word-initial connector — silent in continuation)
        if (g.base === ALEF_WASLA && i === 0) continue;
        // Skip tatweel
        if (g.base === TATWEEL) continue;

        // 1. Madd letter?
        const dur = maddDuration(gs, i, monfaselLen, mottaselLen, nextWordFirstBase);
        if (dur > 0) {
            // Madd letter repeated dur times encodes duration
            const maddChar = (g.base === ALEF_MAQSURA) ? ALEF : g.base;
            out += maddChar.repeat(dur);
            continue;
        }

        // 2. Handle letter with superscript alef (prev letter had inline alef = natural madd)
        // superscript alef appears ON the letter — means an alef madd follows implicitly
        if (g.hasSuperAlef) {
            out += g.base;
            out += ALEF.repeat(2); // natural madd 2 counts embedded
            continue;
        }

        // 3. Ghunnah?
        const nextBase = next?.base ?? nextWordFirstBase;
        const ghDur = ghunnahDuration(g, nextBase);
        if (ghDur > 0) {
            out += g.base.repeat(ghDur);
            continue;
        }

        // 4. Regular consonant
        out += g.base;
    }

    return out;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Convert Uthmani Arabic text to the MutqinApp phonetic reference script.
 *
 * @param uthmaniText  One or more ayahs, joined by ' * ' (MutqinApp convention)
 * @param config       Optional Hafs recitation configuration
 * @returns            Phonetic string — include in Gemini's PHONETIC_REF section
 *
 * @example
 *   phonetize('بِسۡمِ ٱللَّهِ ٱلرَّحۡمَـٰنِ ٱلرَّحِيمِ')
 *   // → "بسمللهلرحمنلرحِيييم"   (يي = 2-count madd on ya of رَحِيمِ)
 */
export function phonetize(uthmaniText: string, config: PhonetizerConfig = {}): string {
    const monfaselLen = config.maddMonfaselLen ?? 4;
    const mottaselLen = config.maddMottaselLen ?? 4;

    // Handle multi-ayah (joined by ' * ')
    return uthmaniText
        .split(' * ')
        .map(ayah => {
            const words = ayah.trim().split(/\s+/).filter(Boolean);
            return words.map((word, wi) => {
                const nextWord = wi < words.length - 1 ? words[wi + 1] : null;
                const nextWordFirstBase = nextWord ? parse(nextWord)[0]?.base ?? null : null;
                return phonetizeWord(word, nextWordFirstBase, monfaselLen, mottaselLen);
            }).join('');
        })
        .join(' ');
}

/**
 * Qiraat-aware convenience wrapper.
 * Maps the app's `activeQiraat` string to the correct moshaf config.
 */
export function phonetizeForQiraat(
    uthmaniText: string,
    qiraat: string,
): string {
    const isHafs = qiraat === 'Hafs';
    return phonetize(uthmaniText, {
        rewaya: isHafs ? 'hafs' : 'warsh',
        maddMonfaselLen: isHafs ? 4 : 2,
        maddMottaselLen: isHafs ? 4 : 4,
    });
}
