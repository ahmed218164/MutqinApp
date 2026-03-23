/**
 * audio-reciters.ts
 *
 * Expanded reciter library with 80+ reciters from h3/c.java enum.
 *
 * Two audio architectures:
 *   - Gapless (type=1, _sura):  Single surah file → seekTo() for verse nav
 *   - Ayah-by-Ayah (type=2, _ayat): Per-verse files → A/B swap pipeline
 *
 * Audio sources (in priority order):
 *   1. elmushaf.com   — 80+ reciters (gapless + ayah)
 *   2. quranapi.pages.dev — 5 reciters (ayah-by-ayah, JSON API)
 *   3. cdn.islamic.network — fallback (ayah-by-ayah, direct URL)
 */

export interface Reciter {
    id: string;
    name: string;
    nameArabic: string;
    qiraat: 'Hafs' | 'Warsh' | 'Qaloon' | 'Shoba' | 'Dory' | 'Soosi';
    quality: '64kbps' | '128kbps' | '192kbps';
    style: 'Murattal' | 'Mujawwad' | 'Muallim';
    baseUrl: string;
    /**
     * The reciter's ID in quranapi.pages.dev API.
     * Only available for a few reciters.
     */
    apiId?: number;
    /**
     * Audio type: 'gapless' = surah-level files, 'ayah' = per-verse files.
     * From h3.java: f7227g = 1 (gapless/sura) or 2 (ayah).
     */
    audioType: 'gapless' | 'ayah';
    /**
     * elmushaf.com server path, e.g. "/mushaf/audio/mishari_alafasy_sura/"
     */
    elmushafPath?: string;
    icon?: string;
}

// ── GAPLESS RECITERS (type=1) — surah-level files ────────────────────────────
// From h3.java: names ending in _sura
// File format: {SSS}.mp3 (e.g. 001.mp3 = Al-Fatiha)

const GAPLESS_RECITERS: Reciter[] = [
    // ── Hafs ──
    { id: 'shatry_sura', name: 'Abu Bakr Al-Shatri', nameArabic: 'أبو بكر الشاطري', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.shaatree', apiId: 2, audioType: 'gapless', elmushafPath: '/mushaf/audio/shatry_sura/' },
    { id: 'allajamy_sura', name: 'Ahmad Al-Ajamy', nameArabic: 'أحمد العجمي', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/allajamy_sura/' },
    { id: 'ahmed_nauina_sura', name: 'Ahmad Nauina', nameArabic: 'أحمد نعينع', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/ahmed_nauina_sura/' },
    { id: 'akram_al_alaqmi_sura', name: 'Akram Al-Alaqmi', nameArabic: 'أكرم العلاقمي', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/akram_al_alaqmi_sura/' },
    { id: 'bandar_baleela_sura', name: 'Bandar Baleela', nameArabic: 'بندر بليلة', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/bandar_baleela_sura/' },
    { id: 'khalid_al_qahtane_sura', name: 'Khalid Al-Qahtani', nameArabic: 'خالد القحطاني', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/khalid_al_qahtane_sura/' },
    { id: 'khalifa_tanji_sura', name: 'Khalifa Al-Tunaiji', nameArabic: 'خليفة الطنيجي', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/khalifa_tanji_sura/' },
    { id: 'sa3d_alghamidi_sura', name: 'Saad Al-Ghamidi', nameArabic: 'سعد الغامدي', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.saadalghamadi', audioType: 'gapless', elmushafPath: '/mushaf/audio/sa3d_alghamidi_sura/' },
    { id: 'shuraym_sura', name: 'Saud Ash-Shuraim', nameArabic: 'سعود الشريم', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.shuraim', audioType: 'gapless', elmushafPath: '/mushaf/audio/shuraym_sura/' },
    { id: 'sahl_yaseen_sura', name: 'Sahl Yaseen', nameArabic: 'سهل ياسين', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/sahl_yaseen_sura/' },
    { id: 'salah_budair_sura', name: 'Salah Al-Budair', nameArabic: 'صلاح البدير', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/salah_budair_sura/' },
    { id: 'salah_abdrahman_sura', name: 'Salah Abdurrahman', nameArabic: 'صلاح عبدالرحمن', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/salah_abdrahman_sura/' },
    { id: 'abdulbaset_mujawwad_sura', name: 'Abdul Basit (Mujawwad)', nameArabic: 'عبد الباسط عبد الصمد (مجوّد)', qiraat: 'Hafs', quality: '128kbps', style: 'Mujawwad', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.abdulbasitmurattal', audioType: 'gapless', elmushafPath: '/mushaf/audio/abdulbaset_mujawwad_sura/' },
    { id: 'abdulbaset_murattal_sura', name: 'Abdul Basit (Murattal)', nameArabic: 'عبد الباسط عبد الصمد (مرتّل)', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.abdulbasitmurattal', audioType: 'gapless', elmushafPath: '/mushaf/audio/abdulbaset_murattal_sura/' },
    { id: 'abdurrashid_sufi_sura', name: 'Abdurrashid Sufi', nameArabic: 'عبد الرشيد صوفي', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/abdurrashid_sufi_sura/' },
    { id: 'sudais_murattal_sura', name: 'As-Sudais (Murattal)', nameArabic: 'عبد الرحمن السديس (مرتّل)', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.sudais', audioType: 'gapless', elmushafPath: '/mushaf/audio/sudais_murattal_sura/' },
    { id: 'sudais_high_quality_sura', name: 'As-Sudais (HQ)', nameArabic: 'عبد الرحمن السديس (جودة عالية)', qiraat: 'Hafs', quality: '192kbps', style: 'Murattal', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.sudais', audioType: 'gapless', elmushafPath: '/mushaf/audio/sudais_high_quality_sura/' },
    { id: 'abdrahman_alshahat_sura', name: 'Abdurrahman Al-Shahat', nameArabic: 'عبد الرحمن الشحات', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/abdrahman_alshahat_sura/' },
    { id: 'abdulaziz_zahrani_sura', name: 'Abdul Aziz Az-Zahrani', nameArabic: 'عبد العزيز الزهراني', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/abdulaziz_zahrani_sura/' },
    { id: 'abdullah_basfar_sura', name: 'Abdullah Basfar', nameArabic: 'عبد الله بصفر', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/abdullah_basfar_sura/' },
    { id: 'abdullah_juhayne_sura', name: 'Abdullah Al-Juhany', nameArabic: 'عبد الله الجهني', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/abdullah_juhayne_sura/' },
    { id: 'abdullah_matroud_sura', name: 'Abdullah Al-Matroud', nameArabic: 'عبد الله المطرود', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/abdullah_matroud_sura/' },
    { id: 'abdullah_almousa_sura', name: 'Abdullah Al-Mousa', nameArabic: 'عبد الله الموسى', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/abdullah_almousa_sura/' },
    { id: 'aziz_alili_sura', name: 'Aziz Alili', nameArabic: 'عزيز عليلي', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/aziz_alili_sura/' },
    { id: 'ali_hajjaj_alsouasi_sura', name: 'Ali Hajjaj Al-Souasi', nameArabic: 'علي حجاج السويسي', qiraat: 'Hafs', quality: '128kbps', style: 'Mujawwad', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/ali_hajjaj_alsouasi_sura/' },
    { id: 'abad_sura', name: 'Abad', nameArabic: 'عباد', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/abad_sura/' },
    { id: 'muhsin_alqasim_sura', name: 'Muhsin Al-Qasim', nameArabic: 'محسن القاسم', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/muhsin_alqasim_sura/' },
    { id: 'mohamed_altablawi_sura', name: 'Mohamed Al-Tablawi', nameArabic: 'محمد الطبلاوي', qiraat: 'Hafs', quality: '128kbps', style: 'Mujawwad', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/mohamed_altablawi_sura/' },
    { id: 'mohamed_jibreel_sura', name: 'Muhammad Jibreel', nameArabic: 'محمد جبريل', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/mohamed_jibreel_sura/' },
    { id: 'mohamed_ayoub_sura', name: 'Muhammad Ayyub', nameArabic: 'محمد أيوب', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/mohamed_ayoub_sura/' },
    { id: 'minshawi_murattal_sura', name: 'Al-Minshawi (Murattal)', nameArabic: 'محمد صديق المنشاوي (مرتّل)', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.minshawi', audioType: 'gapless', elmushafPath: '/mushaf/audio/minshawi_murattal_sura/' },
    { id: 'husary_sura', name: 'Al-Husary', nameArabic: 'محمود خليل الحصري', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.husary', audioType: 'gapless', elmushafPath: '/mushaf/audio/husary_sura/' },
    { id: 'husary_iza3a_sura', name: 'Al-Husary (Radio)', nameArabic: 'الحصري (إذاعة)', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/husary_iza3a_sura/' },
    { id: 'mahmoud_ali_albana_sura', name: 'Mahmoud Ali Al-Banna', nameArabic: 'محمود علي البنا', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/mahmoud_ali_albana_sura/' },
    { id: 'mishari_alafasy_sura', name: 'Mishary Rashid Alafasy', nameArabic: 'مشاري بن راشد العفاسي', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy', apiId: 1, audioType: 'gapless', elmushafPath: '/mushaf/audio/mishari_alafasy_sura/' },
    { id: 'mishari_alafasy_cali_sura', name: 'Mishary Alafasy (HQ)', nameArabic: 'العفاسي (جودة عالية)', qiraat: 'Hafs', quality: '192kbps', style: 'Murattal', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy', audioType: 'gapless', elmushafPath: '/mushaf/audio/mishari_alafasy_cali_sura/' },
    { id: 'mostafa_ismaeel_sura', name: 'Mostafa Ismail', nameArabic: 'مصطفى إسماعيل', qiraat: 'Hafs', quality: '128kbps', style: 'Mujawwad', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/mostafa_ismaeel_sura/' },
    { id: 'naser_qatami_sura', name: 'Nasser Al-Qatami', nameArabic: 'ناصر القطامي', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.qatami', apiId: 3, audioType: 'gapless', elmushafPath: '/mushaf/audio/naser_qatami_sura/' },
    { id: 'hani_rifai_sura', name: 'Hani Ar-Rifai', nameArabic: 'هاني الرفاعي', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.hanirifa', apiId: 5, audioType: 'gapless', elmushafPath: '/mushaf/audio/hani_rifai_sura/' },
    { id: 'yasser_dussary_sura', name: 'Yasser Al-Dosari', nameArabic: 'ياسر الدوسري', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.yasserdossari', apiId: 4, audioType: 'gapless', elmushafPath: '/mushaf/audio/yasser_dussary_sura/' },
    { id: 'abdulrahman_aloosi_sura', name: 'Abdulrahman Al-Oosi', nameArabic: 'عبد الرحمن العوسي', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/abdulrahman_aloosi_sura/' },
    { id: 'ali_jaber_sura', name: 'Ali Jaber', nameArabic: 'علي جابر', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/ali_jaber_sura/' },
    { id: 'alzain_mohammad_ahmad_sura', name: 'Al-Zain Mohammad Ahmad', nameArabic: 'الزين محمد أحمد', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/alzain_mohammad_ahmad_sura/' },
    { id: 'husary_muallim_sura', name: 'Al-Husary (Muallim)', nameArabic: 'الحصري (معلّم)', qiraat: 'Hafs', quality: '128kbps', style: 'Muallim', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/husary_muallim_sura/' },
    { id: 'maher_muratal_sura', name: 'Maher Al-Muaiqly (Murattal)', nameArabic: 'ماهر المعيقلي (مرتّل)', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/maher_muratal_sura/' },
    { id: 'maher_sura', name: 'Maher Al-Muaiqly (Haram)', nameArabic: 'ماهر المعيقلي (الحرم)', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/maher_sura/' },
    { id: 'mokhtasar_asmari_sura', name: 'Mokhtasar Al-Asmari', nameArabic: 'مختصر الأسمري', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/mokhtasar_asmari_sura/' },
    { id: 'muhammad_rashad_shereef_sura', name: 'Muhammad Rashad Shareef', nameArabic: 'محمد رشاد الشريف', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/muhammad_rashad_shereef_sura/' },
    { id: 'yasser_salama_hadr_sura', name: 'Yasser Salama (Hadr)', nameArabic: 'ياسر سلامة (حدر)', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/yasser_salama_hadr_sura/' },
    { id: 'haram_1425_sura', name: 'Haram 1425H', nameArabic: 'الحرم ١٤٢٥هـ', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/haram_1425_sura/' },
    { id: 'haram_1440_sura', name: 'Haram 1440H', nameArabic: 'الحرم ١٤٤٠هـ', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/haram_1440_sura/' },
    // ── Warsh ──
    { id: 'yaseen_warsh_sura', name: 'Yassin Al-Jazairi (Warsh)', nameArabic: 'ياسين الجزائري (ورش)', qiraat: 'Warsh', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/yaseen_warsh_sura/' },
    { id: 'mohamed_abdullkarem_warsh_sura', name: 'Mohamed Abdulkareem (Warsh)', nameArabic: 'محمد عبد الكريم (ورش)', qiraat: 'Warsh', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/mohamed_abdullkarem_warsh_sura/' },
    { id: 'belashea_warsh_azrak_sura', name: 'Belashea (Warsh Azrak)', nameArabic: 'بلعشية (ورش الأزرق)', qiraat: 'Warsh', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/belashea_warsh_azrak_sura/' },
    { id: 'belashea_warsh_asbhani_sura', name: 'Belashea (Warsh Asbahani)', nameArabic: 'بلعشية (ورش الأصبهاني)', qiraat: 'Warsh', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/belashea_warsh_asbhani_sura/' },
    { id: 'hasan_saleh_warsh_azrak_sura', name: 'Hasan Saleh (Warsh)', nameArabic: 'حسن صالح (ورش الأزرق)', qiraat: 'Warsh', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/hasan_saleh_warsh_azrak_sura/' },
    // ── Qaloon ──
    { id: 'attarabolsi_qaloon_sura', name: 'Al-Tarabolsi (Qaloon)', nameArabic: 'الطرابلسي (قالون)', qiraat: 'Qaloon', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'gapless', elmushafPath: '/mushaf/audio/attarabolsi_qaloon_sura/' },
];

// ── AYAH-BY-AYAH RECITERS (type=2) — per-verse files ─────────────────────────
// From h3.java: names ending in _ayat
// File format: {SSSAAA}.mp3 (e.g. 001002.mp3 = Fatiha verse 2)

const AYAH_RECITERS: Reciter[] = [
    // ── Hafs ──
    { id: 'shatry_ayat', name: 'Abu Bakr Al-Shatri', nameArabic: 'أبو بكر الشاطري', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.shaatree', apiId: 2, audioType: 'ayah', elmushafPath: '/mushaf/audio/shatry_ayat/' },
    { id: 'allajamy_ayat', name: 'Ahmad Al-Ajamy', nameArabic: 'أحمد العجمي', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'ayah', elmushafPath: '/mushaf/audio/allajamy_ayat/' },
    { id: 'ghamedy_ayat', name: 'Saad Al-Ghamidi', nameArabic: 'سعد الغامدي', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.saadalghamadi', audioType: 'ayah', elmushafPath: '/mushaf/audio/ghamedy_ayat/' },
    { id: 'sherem_ayat', name: 'Saud Ash-Shuraim', nameArabic: 'سعود الشريم', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.shuraim', audioType: 'ayah', elmushafPath: '/mushaf/audio/sherem_ayat/' },
    { id: 'basset_mojwad_ayat', name: 'Abdul Basit (Mujawwad)', nameArabic: 'عبد الباسط (مجوّد)', qiraat: 'Hafs', quality: '128kbps', style: 'Mujawwad', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.abdulbasitmurattal', audioType: 'ayah', elmushafPath: '/mushaf/audio/basset_mojwad_ayat/' },
    { id: 'basset_ayat', name: 'Abdul Basit (Murattal)', nameArabic: 'عبد الباسط (مرتّل)', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.abdulbasitmurattal', audioType: 'ayah', elmushafPath: '/mushaf/audio/basset_ayat/' },
    { id: 'sodis_ayat', name: 'Abdurrahman As-Sudais', nameArabic: 'عبد الرحمن السديس', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.sudais', audioType: 'ayah', elmushafPath: '/mushaf/audio/sodis_ayat/' },
    { id: 'johany_ayat', name: 'Abdullah Al-Juhany', nameArabic: 'عبد الله الجهني', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'ayah', elmushafPath: '/mushaf/audio/johany_ayat/' },
    { id: 'basefr_mojwad_ayat', name: 'Abdullah Basfar (Mujawwad)', nameArabic: 'عبد الله بصفر (مجوّد)', qiraat: 'Hafs', quality: '128kbps', style: 'Mujawwad', baseUrl: '', audioType: 'ayah', elmushafPath: '/mushaf/audio/basefr_mojwad_ayat/' },
    { id: 'basefr_ayat', name: 'Abdullah Basfar', nameArabic: 'عبد الله بصفر', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'ayah', elmushafPath: '/mushaf/audio/basefr_ayat/' },
    { id: 'hothefe_ayat', name: 'Ali Hudhaify', nameArabic: 'علي حذيفي', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'ayah', elmushafPath: '/mushaf/audio/hothefe_ayat/' },
    { id: 'ali_hajaj_mojwad_ayat', name: 'Ali Hajjaj (Mujawwad)', nameArabic: 'علي حجاج السويسي (مجوّد)', qiraat: 'Hafs', quality: '128kbps', style: 'Mujawwad', baseUrl: '', audioType: 'ayah', elmushafPath: '/mushaf/audio/ali_hajaj_mojwad_ayat/' },
    { id: 'abad_ayat', name: 'Abad', nameArabic: 'عباد', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'ayah', elmushafPath: '/mushaf/audio/abad_ayat/' },
    { id: 'muaiqly_ayat', name: 'Maher Al-Muaiqly', nameArabic: 'ماهر المعيقلي', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'ayah', elmushafPath: '/mushaf/audio/muaiqly_ayat/' },
    { id: 'ayoob_ayat', name: 'Muhammad Ayyub', nameArabic: 'محمد أيوب', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'ayah', elmushafPath: '/mushaf/audio/ayoob_ayat/' },
    { id: 'jepreel_ayat', name: 'Muhammad Jibreel', nameArabic: 'محمد جبريل', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'ayah', elmushafPath: '/mushaf/audio/jepreel_ayat/' },
    { id: 'menshawy_ayat', name: 'Al-Minshawi (Mujawwad)', nameArabic: 'المنشاوي (مجوّد)', qiraat: 'Hafs', quality: '128kbps', style: 'Mujawwad', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.minshawi', audioType: 'ayah', elmushafPath: '/mushaf/audio/menshawy_ayat/' },
    { id: 'menshawy_moaleem_ayat', name: 'Al-Minshawi (Muallim)', nameArabic: 'المنشاوي (معلّم)', qiraat: 'Hafs', quality: '128kbps', style: 'Muallim', baseUrl: '', audioType: 'ayah', elmushafPath: '/mushaf/audio/menshawy_moaleem_ayat/' },
    { id: 'hosary_mojwad_ayat', name: 'Al-Husary (Mujawwad)', nameArabic: 'الحصري (مجوّد)', qiraat: 'Hafs', quality: '128kbps', style: 'Mujawwad', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.husary', audioType: 'ayah', elmushafPath: '/mushaf/audio/hosary_mojwad_ayat/' },
    { id: 'hosary_ayat', name: 'Al-Husary', nameArabic: 'الحصري', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.husary', audioType: 'ayah', elmushafPath: '/mushaf/audio/hosary_ayat/' },
    { id: 'hosary_moaleem_ayat', name: 'Al-Husary (Muallim)', nameArabic: 'الحصري (معلّم)', qiraat: 'Hafs', quality: '128kbps', style: 'Muallim', baseUrl: '', audioType: 'ayah', elmushafPath: '/mushaf/audio/hosary_moaleem_ayat/' },
    { id: 'banna_ayat', name: 'Mahmoud Ali Al-Banna', nameArabic: 'محمود علي البنا', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'ayah', elmushafPath: '/mushaf/audio/banna_ayat/' },
    { id: 'efassy_ayat', name: 'Mishary Rashid Alafasy', nameArabic: 'مشاري العفاسي', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy', apiId: 1, audioType: 'ayah', elmushafPath: '/mushaf/audio/efassy_ayat/' },
    { id: 'mustafa_ismail_ayat', name: 'Mostafa Ismail', nameArabic: 'مصطفى إسماعيل', qiraat: 'Hafs', quality: '128kbps', style: 'Mujawwad', baseUrl: '', audioType: 'ayah', elmushafPath: '/mushaf/audio/mustafa_ismail_ayat/' },
    { id: 'Nasser_ayat', name: 'Nasser Al-Qatami', nameArabic: 'ناصر القطامي', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.qatami', apiId: 3, audioType: 'ayah', elmushafPath: '/mushaf/audio/Nasser_ayat/' },
    { id: 'dosary_ayat', name: 'Yasser Al-Dosari', nameArabic: 'ياسر الدوسري', qiraat: 'Hafs', quality: '128kbps', style: 'Murattal', baseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.yasserdossari', apiId: 4, audioType: 'ayah', elmushafPath: '/mushaf/audio/dosary_ayat/' },
    // ── Warsh ──
    { id: 'dosary_ibraheem_ayat', name: 'Ibrahim Al-Dosari (Warsh)', nameArabic: 'إبراهيم الدوسري (ورش)', qiraat: 'Warsh', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'ayah', elmushafPath: '/mushaf/audio/dosary_ibraheem_ayat/' },
    { id: 'basset_warsh_ayat', name: 'Abdul Basit (Warsh)', nameArabic: 'عبد الباسط (ورش)', qiraat: 'Warsh', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'ayah', elmushafPath: '/mushaf/audio/basset_warsh_ayat/' },
    { id: 'husary_warsh_ayat', name: 'Al-Husary (Warsh)', nameArabic: 'الحصري (ورش)', qiraat: 'Warsh', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'ayah', elmushafPath: '/mushaf/audio/husary_warsh_ayat/' },
    { id: 'yaseen_warsh_ayat', name: 'Yassin (Warsh)', nameArabic: 'ياسين (ورش)', qiraat: 'Warsh', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'ayah', elmushafPath: '/mushaf/audio/yaseen_warsh_ayat/' },
    // ── Qaloon ──
    { id: 'hosary_kaloon_ayat', name: 'Al-Husary (Qaloon)', nameArabic: 'الحصري (قالون)', qiraat: 'Qaloon', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'ayah', elmushafPath: '/mushaf/audio/hosary_kaloon_ayat/' },
    { id: 'ali_hothaify_kaloon_ayat', name: 'Ali Hudhaify (Qaloon)', nameArabic: 'علي حذيفي (قالون)', qiraat: 'Qaloon', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'ayah', elmushafPath: '/mushaf/audio/ali_hothaify_kaloon_ayat/' },
    { id: 'al_tarabulsi_kaloon_ayat', name: 'Al-Tarabolsi (Qaloon)', nameArabic: 'الطرابلسي (قالون)', qiraat: 'Qaloon', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'ayah', elmushafPath: '/mushaf/audio/al_tarabulsi_kaloon_ayat/' },
    // ── Shoba ──
    { id: 'foad_alkhamri_shoba_ayat', name: 'Foad Al-Khamri (Shoba)', nameArabic: 'فؤاد الخامري (شعبة)', qiraat: 'Shoba', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'ayah', elmushafPath: '/mushaf/audio/foad_alkhamri_shoba_ayat/' },
    // ── Dory ──
    { id: 'moftah_alsultany_dory_ayat', name: 'Moftah Al-Sultany (Dory)', nameArabic: 'مفتاح السلطني (الدوري)', qiraat: 'Dory', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'ayah', elmushafPath: '/mushaf/audio/moftah_alsultany_dory_ayat/' },
    // ── Soosi ──
    { id: 'abdu_rashid_sufi_soosi_ayat', name: 'Abdurrashid Sufi (Soosi)', nameArabic: 'عبد الرشيد صوفي (السوسي)', qiraat: 'Soosi', quality: '128kbps', style: 'Murattal', baseUrl: '', audioType: 'ayah', elmushafPath: '/mushaf/audio/abdu_rashid_sufi_soosi_ayat/' },
];

// ── Combined library ──────────────────────────────────────────────────────────

export const RECITERS_LIBRARY: Reciter[] = [...GAPLESS_RECITERS, ...AYAH_RECITERS];

// ── Query helpers ─────────────────────────────────────────────────────────────

export function getRecitersByQiraat(qiraat: string): Reciter[] {
    return RECITERS_LIBRARY.filter(r => r.qiraat === qiraat);
}

export function getRecitersByType(audioType: 'gapless' | 'ayah'): Reciter[] {
    return RECITERS_LIBRARY.filter(r => r.audioType === audioType);
}

export function getGaplessReciters(): Reciter[] {
    return GAPLESS_RECITERS;
}

export function getAyahReciters(): Reciter[] {
    return AYAH_RECITERS;
}

export function getReciterById(id: string): Reciter | undefined {
    return RECITERS_LIBRARY.find(r => r.id === id);
}

export function getDefaultReciter(): Reciter {
    // Default is Mishary Alafasy — ayah-by-ayah (best for verse-tracking)
    return AYAH_RECITERS.find(r => r.id === 'efassy_ayat') ?? AYAH_RECITERS[0];
}
