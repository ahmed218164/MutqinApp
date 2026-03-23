# 📱 Build APK Guide - Mutqin App

## Prerequisites ✅
- [x] EAS CLI installed globally (`npm install -g eas-cli`)
- [x] Expo account (https://expo.dev)
- [x] `eas.json` configured
- [x] `app.json` configured with Android package

## Quick Build Instructions 🚀

### Step 1: Login to EAS
```bash
eas login
```
Enter your Expo credentials when prompted.

### Step 2: Build Preview APK
```bash
eas build -p android --profile preview
```

**What this does:**
- Builds an APK (not AAB) that can be installed directly on any Android device
- Uses the "preview" profile from `eas.json`
- Generates a download link when complete (~10-15 minutes)

### Step 3: Download & Install
1. EAS will provide a download link when the build completes
2. Download the APK to your phone
3. Enable "Install from Unknown Sources" in Settings
4. Install the APK

## Build Profiles Explained 📋

### Preview (Recommended for Testing)
```bash
eas build -p android --profile preview
```
- **Output:** APK file (easy to share and install)
- **Use case:** Testing on your devices, sharing with testers
- **Size:** Slightly larger (~50MB)

### Production (For Google Play Store)
```bash
eas build -p android --profile production
```
- **Output:** AAB file (Android App Bundle)
- **Use case:** Uploading to Google Play Store
- **Size:** Smaller, optimized

### Development (For Development Clients)
```bash
eas build -p android --profile development
```
- **Output:** Development build with expo-dev-client
- **Use case:** Development and debugging

## Check Build Status 🔍
```bash
eas build:list
```

## Environment Variables 🔐

Make sure to add these secrets to your EAS project:
```bash
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value "your-supabase-url"
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "your-anon-key"
eas secret:create --name EXPO_PUBLIC_GEMINI_API_KEY --value "your-gemini-key"
```

Or use the EAS dashboard: https://expo.dev/accounts/ahmedzaki254/projects/MutqinApp/secrets

## Logo Guide 🎨

### For the App Icon:
1. **Create a 1024x1024px icon** with these specifications:
   - **Theme:** Islamic/Quran memorization
   - **Colors:** Emerald green (#10b981), teal, gold accents
   - **Elements:** Open Quran book, Arabic calligraphy, geometric patterns
   - **Style:** Modern, clean, glassmorphism effect

2. **Generate icon files:**
   ```bash
   npx expo prebuild --clean
   ```

3. **Or use an online tool:**
   - https://www.appicon.co/
   - Upload your 1024x1024 image
   - Download Android adaptive icons

### Icon Files to Replace:
- `assets/icon.png` - Main icon (1024x1024)
- `assets/adaptive-icon.png` - Android adaptive icon (1024x1024)
- `assets/splash-icon.png` - Splash screen icon

## Logo Design Specs 🎨

**Recommended Design:**
```
┌─────────────────────┐
│   ╭─────────────╮   │
│   │  ═══════    │   │  <- Open Quran book
│   │  ═══════    │   │
│   │  ═══════    │   │
│   ╰─────────────╯   │
│                     │
│  Circular gradient  │  <- Emerald to teal gradient
│  Islamic patterns   │  <- Subtle geometric background
└─────────────────────┘
```

**Color Palette:**
- Primary: `#10b981` (Emerald)
- Secondary: `#059669` (Dark Emerald)
- Accent: `#fbbf24` (Gold)
- Background: `#14b8a6` (Teal)

## Troubleshooting 🔧

### Build Failed?
1. Check logs: `eas build:list` then view details
2. Verify all dependencies are in `package.json`
3. Check for TypeScript errors: `npm run tsc`

### APK Won't Install?
1. Enable "Install from Unknown Sources"
2. Ensure Android version ≥ 8.0
3. Clear previous installation if upgrading

### App Crashes on Startup?
1. Check environment variables are set in EAS
2. Verify Supabase permissions and RLS policies
3. Check device logs with `adb logcat`

## Next Steps After Build ✨

1. **Test thoroughly** on different devices
2. **Collect feedback** from beta testers
3. **Fix bugs** and iterate
4. **Build production AAB** for Play Store
5. **Submit to Google Play Store**

## Submit to Play Store (Future)

```bash
eas submit -p android --profile production
```

Requires:
- Google Play Console account ($25 one-time fee)
- Production AAB build
- App listing details (description, screenshots, etc.)

---

**Good luck with your build! 🎉**
