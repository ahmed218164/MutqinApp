# Project: MutqinApp Development & AI Optimization

## Architecture
MutqinApp is a React Native / Expo application built with TypeScript, integrated with Google AI Studio (Gemini 2.5 Flash / 3.5 Flash) for instant recitation feedback, Supabase for auth & database storage, and react-native-track-player for Quran audio recitation playback.

### Code Layout
- `lib/ai-models.ts`, `lib/gemini.ts`, `lib/muaalem-api.ts`: Recitation & AI evaluation engine
- `lib/audio-engine.ts`, `lib/audio-reciters.ts`: Quran audio playback & reciter selection
- `lib/supabase.ts`, `supabase/`: Supabase client & database schema/RLS migrations
- `app/`, `components/`: UI screens & components (Home, Mushaf, Recite, Plan Setup)
- `constants/Colors.ts`, `constants/`: Design tokens, colors, styles

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Recitation AI Engine | Replace Hugging Face with Google AI Studio API (`@google/generative-ai` or direct REST Base64), target 1-2s response, preserve audio system | None | IN_PROGRESS |
| 2 | Islamic Emerald UI/UX | Modernize screens (`app/(tabs)/index.tsx`, `mushaf.tsx`, `recite.tsx`, `plan-setup.tsx`) with emerald palette (`#10b981`, `#064e3b`, `#022c22`) | M1 | PLANNED |
| 3 | Supabase RLS Audit | Audit database tables (`profiles`, `daily_logs`, `mistake_log`, `qiraat_metadata`) and enforce security RLS policies | None | PLANNED |
| 4 | Final Verification & Hardening | Run E2E test suite, adversarial coverage check (Tier 5), forensic integrity audit | M1, M2, M3 | PLANNED |

## E2E Testing Track
- `TEST_INFRA.md`: Requirement-driven test suite plan (Tiers 1-4)
- `TEST_READY.md`: Execution signal and coverage report

## Interface Contracts
### AI Recitation Engine ↔ Audio Engine & Reciter UI
- Recitation analysis returns structured Tajweed/mistake payload within 1-3 seconds.
- Base64 audio buffer processed via Gemini Flash multimodal audio API.
- Audio player (`lib/audio-engine.ts`) remains intact and functional without regression.
