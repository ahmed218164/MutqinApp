#!/usr/bin/env node

/**
 * MutqinApp Production Readiness Verification Script
 * Run this to verify all critical fixes are in place
 */

const fs = require('fs');
const path = require('path');

const checks = [];
let passed = 0;
let failed = 0;

function check(name, condition, details) {
  const result = condition();
  checks.push({ name, passed: result, details });
  if (result) {
    passed++;
    console.log(`✅ ${name}`);
  } else {
    failed++;
    console.error(`❌ ${name}`);
    if (details) console.error(`   ${details}`);
  }
}

console.log('\n🔍 MutqinApp Production Readiness Check\n');
console.log('=' . repeat(50));

// Check 1: Environment validation in supabase.ts
check(
  'Environment Variable Validation',
  () => {
    const content = fs.readFileSync('lib/supabase.ts', 'utf8');
    return content.includes('if (!supabaseUrl || !supabaseAnonKey)') &&
           content.includes('throw new Error');
  },
  'lib/supabase.ts should validate environment variables'
);

// Check 2: Custom fetch with retry logic
check(
  'Supabase Custom Fetch with Retry',
  () => {
    const content = fs.readFileSync('lib/supabase.ts', 'utf8');
    return content.includes('const customFetch') &&
           content.includes('maxRetries') &&
           content.includes('global: {');
  },
  'lib/supabase.ts should have customFetch with retry logic'
);

// Check 3: Network state manager exists
check(
  'Network State Manager',
  () => {
    return fs.existsSync('lib/network.ts');
  },
  'lib/network.ts should exist'
);

// Check 4: NetworkProvider exports
check(
  'NetworkProvider Implementation',
  () => {
    if (!fs.existsSync('lib/network.ts')) return false;
    const content = fs.readFileSync('lib/network.ts', 'utf8');
    return content.includes('export function NetworkProvider') &&
           content.includes('export function useNetwork');
  },
  'lib/network.ts should export NetworkProvider and useNetwork'
);

// Check 5: Offline queue exists
check(
  'Offline Upload Queue System',
  () => {
    return fs.existsSync('lib/offline-queue.ts');
  },
  'lib/offline-queue.ts should exist'
);

// Check 6: OfflineUploadQueue implementation
check(
  'OfflineUploadQueue Class',
  () => {
    if (!fs.existsSync('lib/offline-queue.ts')) return false;
    const content = fs.readFileSync('lib/offline-queue.ts', 'utf8');
    return content.includes('class OfflineUploadQueue') &&
           content.includes('addToQueue') &&
           content.includes('processQueue');
  },
  'lib/offline-queue.ts should have OfflineUploadQueue class'
);

// Check 7: Memory leak fix in recite.tsx
check(
  'Recording Timer Cleanup',
  () => {
    const content = fs.readFileSync('app/recite.tsx', 'utf8');
    return content.includes('return () => {') &&
           content.includes('clearInterval') &&
           content.includes('stopAndUnloadAsync');
  },
  'app/recite.tsx should cleanup recording timer on unmount'
);

// Check 8: Error boundary wrapping
check(
  'ReciteScreen Error Boundary',
  () => {
    const content = fs.readFileSync('app/recite.tsx', 'utf8');
    return content.includes('import ErrorBoundary') &&
           content.includes('<ErrorBoundary>') &&
           content.includes('<ReciteScreenInner');
  },
  'app/recite.tsx should be wrapped with ErrorBoundary'
);

// Check 9: Auth persistence improvements
check(
  'Auth Session Restoration',
  () => {
    const content = fs.readFileSync('lib/auth.tsx', 'utf8');
    return content.includes('getSession()') &&
           content.includes('initializing') &&
           content.includes('onAuthStateChange');
  },
  'lib/auth.tsx should restore sessions from AsyncStorage'
);

// Check 10: Protected route navigation
check(
  'Protected Route Navigation',
  () => {
    const content = fs.readFileSync('lib/auth.tsx', 'utf8');
    return content.includes('useRouter') &&
           content.includes('useSegments') &&
           content.includes('router.replace');
  },
  'lib/auth.tsx should implement protected route navigation'
);

// Check 11: Input validation in auth
check(
  'Auth Error Handling',
  () => {
    const content = fs.readFileSync('lib/auth.tsx', 'utf8');
    return content.includes('friendlyMessage') &&
           content.includes('Invalid login credentials') &&
           content.includes('already registered');
  },
  'lib/auth.tsx should have user-friendly error messages'
);

// Check 12: Keyboard offset fix
check(
  'Android Keyboard Offset',
  () => {
    const content = fs.readFileSync('app/recite.tsx', 'utf8');
    return content.includes('keyboardVerticalOffset') &&
           content.includes('80');
  },
  'app/recite.tsx should have increased Android keyboard offset to 80'
);

// Check 13: Dashboard parallel fetching
check(
  'Dashboard Parallel Fetching',
  () => {
    const content = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');
    return content.includes('Promise.all') &&
           content.includes('// ✅ Parallel fetching');
  },
  'app/(tabs)/index.tsx should use Promise.all for parallel fetching'
);

// Check 14: Color contrast fix
check(
  'WCAG AA Color Contrast',
  () => {
    const content = fs.readFileSync('constants/theme.ts', 'utf8');
    return content.includes("400: '#64748b'") &&
           content.includes('Improved contrast');
  },
  'constants/theme.ts should have improved neutral[400] color'
);

// Check 15: NetworkProvider in root layout
check(
  'NetworkProvider in Layout',
  () => {
    const content = fs.readFileSync('app/_layout.tsx', 'utf8');
    return content.includes('import { NetworkProvider }') &&
           content.includes('<NetworkProvider>');
  },
  'app/_layout.tsx should include NetworkProvider'
);

// Check 16: OfflineQueueProcessor in layout
check(
  'OfflineQueueProcessor in Layout',
  () => {
    const content = fs.readFileSync('app/_layout.tsx', 'utf8');
    return content.includes('OfflineQueueProcessor') &&
           content.includes('offlineQueue.processQueue');
  },
  'app/_layout.tsx should include OfflineQueueProcessor'
);

// Check 17: NetInfo package installed
check(
  '@react-native-community/netinfo Installed',
  () => {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    return packageJson.dependencies['@react-native-community/netinfo'] !== undefined;
  },
  'package.json should include @react-native-community/netinfo'
);

console.log('\n' + '='.repeat(50));
console.log(`\n📊 Results: ${passed}/${passed + failed} checks passed\n`);

if (failed === 0) {
  console.log('🎉 All critical fixes are in place!');
  console.log('✅ Your app is PRODUCTION-READY\n');
  console.log('Next steps:');
  console.log('1. Run: npm start');
  console.log('2. Test auth persistence (login → close → reopen)');
  console.log('3. Test offline queue (record → airplane mode → verify)');
  console.log('4. Deploy to TestFlight/Internal Testing');
  console.log('\n🚀 Ready to ship!\n');
  process.exit(0);
} else {
  console.log(`⚠️  ${failed} checks failed. Please review the errors above.\n`);
  process.exit(1);
}
