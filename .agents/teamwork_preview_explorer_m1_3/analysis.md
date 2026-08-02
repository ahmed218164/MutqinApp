# Milestone 1: Dependency, Environment Configuration & Test Runner Investigation

**Date**: 2026-08-02  
**Target Milestone**: Milestone 1 — Recitation AI Engine (`@google/generative-ai` integration & optimization)  
**Project Root**: `c:\Users\ELBOSTAN\Desktop\MutqinApp`  
**Working Directory**: `c:\Users\ELBOSTAN\Desktop\MutqinApp\.agents\teamwork_preview_explorer_m1_3`  

---

## Executive Summary

The project is a React Native / Expo application built with TypeScript, targeted at Quran recitation feedback using Google AI Studio (`@google/generative-ai`), Supabase, and `react-native-track-player`. 

`@google/generative-ai` (`^0.24.1`) is already installed in `package.json`. The AI Recitation Engine code in `lib/gemini.ts`, `lib/ai-models.ts`, and `lib/muaalem-api.ts` is already structured around Gemini multimodal base64 evaluation. However, there are missing test scripts, absent Jest/unit test runner packages, loose TypeScript compiler configurations (`"strict": false`), top-level env assertion vulnerabilities, and model identifier inconsistencies across modules.

---

## 1. Project Configuration Inspection

### 1.1 `package.json`
- **Name & Version**: `mutqinapp` v1.0.0 (Expo SDK ~54.0.33, React 19.1.0, React Native 0.81.5)
- **Installed AI & Backend Dependencies**:
  - `@google/generative-ai`: `^0.24.1` (Installed in `dependencies`)
  - `@supabase/supabase-js`: `^2.95.3` (Installed in `dependencies`)
  - `expo-audio`: `~1.1.1`
  - `expo-file-system`: `~19.0.21`
  - `react-native-track-player`: `^4.1.2`
- **Existing Scripts**:
  ```json
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "web": "expo start --web",
    "postinstall": "patch-package"
  }
  ```
- **Script Gaps**:
  - **No `npm test` script** defined.
  - **No test runner** (`jest`, `jest-expo`, `vitest`) installed in `devDependencies`.
  - **No `typecheck` script** (e.g., `tsc --noEmit`) defined.
  - **No `lint` script** defined.

### 1.2 `tsconfig.json`
- **Base**: Extends `"expo/tsconfig.base"`
- **Compiler Options**:
  - `"target": "esnext"`, `"module": "preserve"`, `"moduleResolution": "bundler"`
  - `"jsx": "react-native"`
  - `"strict": false` (⚠️ Loose type checking is active — type errors are suppressed during compilation)
  - `"skipLibCheck": true`, `"resolveJsonModule": true`
  - `"exclude"`: `["node_modules", "supabase/functions"]`

### 1.3 `app.json`
- **App Metadata**: `name`: "مُتقِن", `slug`: "MutqinApp", `version`: "1.5.0", `newArchEnabled`: true
- **Plugins**: `expo-router`, `expo-sqlite`, `expo-font`, `expo-audio`, `expo-av`
- **Permissions**: `RECORD_AUDIO`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `POST_NOTIFICATIONS`, `MODIFY_AUDIO_SETTINGS`, `WAKE_LOCK`

### 1.4 Environment Variable Handling (`.env`, `eas.json`, `lib/`)
- **Key Environment Variables**:
  - `EXPO_PUBLIC_GEMINI_API_KEY`: Used in `lib/gemini.ts` and `lib/ai-models.ts`
  - `EXPO_PUBLIC_SUPABASE_URL`: Used in `lib/supabase.ts` and `lib/recitation-storage.ts`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`: Used in `lib/supabase.ts` and `lib/recitation-storage.ts`
  - `EXPO_PUBLIC_EAS_PROJECT_ID`: Used in `lib/notifications.ts`
- **Fallback Configuration**: `eas.json` defines fallback build values for `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_GEMINI_API_KEY` across `development`, `preview`, and `production` build profiles.
- **Runtime Validation Audit**:
  - `lib/supabase.ts` (lines 9–17) enforces runtime presence of `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`, throwing a human-readable error if missing.
  - `lib/ai-models.ts` (lines 135–140) checks `if (!apiKey) throw new Error('Gemini API key not found');`.
  - ⚠️ **Vulnerability in `lib/gemini.ts` (line 3)**:
    `const genAI = new GoogleGenerativeAI(process.env.EXPO_PUBLIC_GEMINI_API_KEY!);`
    This executes at module load time with a non-null assertion (`!`). If `EXPO_PUBLIC_GEMINI_API_KEY` is undefined when `lib/gemini.ts` is imported, it initializes the SDK with `undefined`, which will fail silently until API invocation or crash early.

---

## 2. Dependencies & TypeScript Configuration Issues

### 2.1 Installed Package Verification
| Package | Version in `package.json` | Status | Purpose |
|---|---|---|---|
| `@google/generative-ai` | `^0.24.1` | Installed | Primary AI SDK for Gemini models |
| `@supabase/supabase-js` | `^2.95.3` | Installed | Database & Auth client |
| `expo-audio` | `~1.1.1` | Installed | Audio recording & playback |
| `expo-file-system` | `~19.0.21` | Installed | Base64 file reading for Gemini |
| `patch-package` | `^8.0.1` | Installed (`devDependencies`) | Post-install patch application |
| `typescript` | `^5.3.3` | Installed (`devDependencies`) | Static type checking |
| `jest` / `jest-expo` | None | ❌ Missing | Unit testing framework |

### 2.2 Model Name Discrepancy Across AI Files
Inconsistencies exist between model names used across the codebase:
- `lib/gemini.ts` (lines 37–41):
  - `'gemini-3-flash-preview'`
  - `'gemini-2.5-flash'`
  - `'gemini-3.1-flash-lite-preview'`
- `lib/ai-models.ts` (lines 11–15):
  - `PLAN_ARCHITECT`: `'gemini-2.5-flash-lite'`
  - `PRIMARY_AUDITOR`: `'gemini-flash-latest'`
  - `RANDOM_TESTER`: `'gemini-2.5-flash'`

*Recommendation for Implementation Worker*: Standardize model identifiers to use official Google AI Studio production endpoint models (e.g. `gemini-2.5-flash` / `gemini-1.5-flash` / `gemini-2.0-flash`) and centralize model constants in a single module.

---

## 3. Test Runner & Verification Infrastructure

### 3.1 Current Test Readiness
- **No unit test framework** (Jest / Mocha) is currently configured in `package.json`.
- **Existing Verification Script**: `verify-production-readiness.js` exists in the project root. It executes 17 static inspection checks verifying code structure, error boundaries, network retries, and offline queue setups.

### 3.2 Required Test & Build Scripts to Add
To ensure build and test readiness for Milestone 1, the following scripts should be added to `package.json`:
```json
"scripts": {
  "start": "expo start",
  "android": "expo run:android",
  "ios": "expo run:ios",
  "web": "expo start --web",
  "typecheck": "tsc --noEmit",
  "verify": "node verify-production-readiness.js",
  "test": "npm run typecheck && npm run verify",
  "postinstall": "patch-package"
}
```

---

## 4. Concrete Execution Steps for Implementation Worker

### Step 1: Add Scripts to `package.json`
Add `"typecheck": "tsc --noEmit"`, `"verify": "node verify-production-readiness.js"`, and `"test": "npm run typecheck && npm run verify"` to `package.json`.

### Step 2: Fix Top-Level `GoogleGenerativeAI` Instantiation in `lib/gemini.ts`
Refactor `lib/gemini.ts` line 3 to lazily initialize or validate `process.env.EXPO_PUBLIC_GEMINI_API_KEY` before calling `new GoogleGenerativeAI(...)`.

### Step 3: Model Identifier Alignment
Unify model string definitions between `lib/gemini.ts` and `lib/ai-models.ts` to ensure consistent Gemini 2.5 Flash / Flash Lite model invocation.

### Step 4: Verification Commands
1. Run Type Check:
   ```bash
   npx tsc --noEmit
   ```
2. Run Production Readiness Check:
   ```bash
   node verify-production-readiness.js
   ```
3. Run App Start Verification:
   ```bash
   npx expo start
   ```
