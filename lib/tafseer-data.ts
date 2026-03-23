export interface TafseerEntry {
    surah: number;
    ayah: number;
    tafseerArabic: string;
    tafseerEnglish: string;
}

const TAFSEER_CACHE: { [key: string]: TafseerEntry } = {
    '1:1': {
        surah: 1,
        ayah: 1,
        tafseerArabic: 'بِسْمِ اللَّهِ: ابتدأت بتسمية الله تعالى، وهو الاسم الجامع لجميع الأسماء الحسنى. الرَّحْمَٰنِ: اسم يدل على سعة رحمته التي وسعت كل شيء. الرَّحِيمِ: اسم يدل على الرحمة الخاصة بالمؤمنين يوم القيامة.',
        tafseerEnglish: 'In the name of Allah: I begin with the name of Allah, which encompasses all His beautiful names. The Most Merciful: A name indicating His vast mercy that encompasses everything. The Especially Merciful: A name indicating His special mercy for the believers on the Day of Judgment.'
    },
    '1:2': {
        surah: 1,
        ayah: 2,
        tafseerArabic: 'الحمد لله رب العالمين: الثناء على الله بصفاته التي كلُّها أوصاف كمال، وله الحمد في الأولى والآخرة. رب العالمين: مالك جميع الخلق من الإنس والجن والملائكة، وهو المتصرف فيهم.',
        tafseerEnglish: 'All praise is for Allah, Lord of all worlds: Praising Allah for His attributes, which are all attributes of perfection. He deserves all praise in this life and the Hereafter. Lord of all worlds: The owner of all creation - humans, jinn, and angels - and He is the one who controls them.'
    },
    '2:1': {
        surah: 2,
        ayah: 1,
        tafseerArabic: 'الم: من الحروف المقطعة التي افتُتحت بها بعض سور القرآن، وهي من المتشابه الذي استأثر الله بعلمه، وقيل هي أسماء للسور، وقيل: هي تحدٍّ للعرب أن يأتوا بمثل هذا القرآن المؤلف من مثل هذه الحروف.',
        tafseerEnglish: 'Alif Lam Meem: These are disjointed letters with which some chapters of the Quran begin. They are among the ambiguous verses whose knowledge Allah has kept to Himself. Some say they are names for the chapters. Others say they are a challenge to the Arabs to produce something like this Quran composed of such letters.'
    },
    '2:2': {
        surah: 2,
        ayah: 2,
        tafseerArabic: 'ذلك الكتاب: أي هذا القرآن العظيم. لا ريب فيه: لا شك فيه أنه من عند الله لوضوح دلائله وآياته. هدى للمتقين: إرشاد وبيان للمؤمنين الذين يتقون الشرك والمعاصي.',
        tafseerEnglish: 'That is the Book: This great Quran. About which there is no doubt: There is no doubt that it is from Allah due to the clarity of its signs and proofs. A guidance for the righteous: Direction and clarification for believers who avoid shirk and sins.'
    }
};

export async function fetchTafseer(surah: number, ayah: number): Promise<TafseerEntry | null> {
    const key = `${surah}:${ayah}`;
    
    if (TAFSEER_CACHE[key]) {
        return TAFSEER_CACHE[key];
    }

    return {
        surah,
        ayah,
        tafseerArabic: 'التفسير غير متوفر حاليًا. سيتم إضافة المزيد من التفاسير قريبًا إن شاء الله.',
        tafseerEnglish: 'Tafseer not available currently. More tafseers will be added soon, insha\'Allah.'
    };
}

export interface SearchResult {
    surah: number;
    ayah: number;
    text: string;
    surahName: string;
    matchedWord: string;
}

export function searchQuranText(query: string): SearchResult[] {
    if (!query || query.trim().length < 2) return [];

    const results: SearchResult[] = [];
    const normalizedQuery = query.trim().toLowerCase();

    const sampleResults: SearchResult[] = [
        {
            surah: 2,
            ayah: 2,
            text: 'ذَٰلِكَ الْكِتَابُ لَا رَيْبَ ۛ فِيهِ ۛ هُدًى لِّلْمُتَّقِينَ',
            surahName: 'Al-Baqarah',
            matchedWord: 'الكتاب'
        },
        {
            surah: 2,
            ayah: 185,
            text: 'شَهْرُ رَمَضَانَ الَّذِي أُنزِلَ فِيهِ الْقُرْآنُ هُدًى لِّلنَّاسِ',
            surahName: 'Al-Baqarah',
            matchedWord: 'رمضان'
        },
        {
            surah: 3,
            ayah: 3,
            text: 'نَزَّلَ عَلَيْكَ الْكِتَابَ بِالْحَقِّ مُصَدِّقًا لِّمَا بَيْنَ يَدَيْهِ',
            surahName: 'Aal-E-Imran',
            matchedWord: 'الكتاب'
        }
    ];

    return sampleResults.filter(result => 
        result.text.toLowerCase().includes(normalizedQuery) ||
        result.matchedWord.toLowerCase().includes(normalizedQuery)
    );
}
