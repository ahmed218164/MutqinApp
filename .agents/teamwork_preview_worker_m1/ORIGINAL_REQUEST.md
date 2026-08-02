## 2026-08-02T00:19:42Z
You are teamwork_preview_worker_m1.
Your working directory is: c:\Users\ELBOSTAN\Desktop\MutqinApp\.agents\teamwork_preview_worker_m1
Project root: c:\Users\ELBOSTAN\Desktop\MutqinApp

Your task is to execute Milestone 1: Recitation AI Engine Optimization (Google AI Studio Direct API) and code hardening.

Read the explorer reports in:
- c:\Users\ELBOSTAN\Desktop\MutqinApp\.agents\teamwork_preview_explorer_m1_1_gen5\handoff.md
- c:\Users\ELBOSTAN\Desktop\MutqinApp\.agents\teamwork_preview_explorer_m1_2\handoff.md
- c:\Users\ELBOSTAN\Desktop\MutqinApp\.agents\teamwork_preview_explorer_m1_3\handoff.md

Implement the following:
1. In `lib/gemini.ts`:
   - Replace top-level eager instantiation `const genAI = new GoogleGenerativeAI(process.env.EXPO_PUBLIC_GEMINI_API_KEY!)` with a lazy client getter `getGeminiClient()` that checks for `process.env.EXPO_PUBLIC_GEMINI_API_KEY` when called and throws a clear error if missing.
   - Standardize model names consistently across `lib/gemini.ts` and `lib/ai-models.ts` using valid Gemini Flash models (`gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-1.5-flash`).
   - Ensure dynamic MIME type support in `checkRecitation()`.
   - Verify `lib/muaalem-api.ts` directly uses Google AI Studio Gemini direct API, eliminating any remaining active calls to `dr364873-tajweed-base.hf.space`.
2. In `package.json`:
   - Add scripts: `"typecheck": "tsc --noEmit"`, `"verify": "node verify-production-readiness.js"`, and `"test": "npm run typecheck && npm run verify"`.
3. Audio Engine Preservation:
   - Ensure `lib/audio-engine.ts`, `lib/audio-reciters.ts`, and `react-native-track-player` integration remain completely untouched and fully functional.
4. Run verification commands:
   - `npx tsc --noEmit`
   - `node verify-production-readiness.js`
   - Document passing results in your handoff report.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Write your final handoff report to `c:\Users\ELBOSTAN\Desktop\MutqinApp\.agents\teamwork_preview_worker_m1\handoff.md` following the standard format (Observation, Logic Chain, Caveats, Conclusion, Verification Method).
Then use send_message to notify parent (id: 6d469c43-2076-46cc-9657-c14e42d823d7).
