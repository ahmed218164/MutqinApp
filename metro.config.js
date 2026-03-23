// metro.config.js
//
// Extends Expo's default Metro config to teach Metro about file types
// that are not part of its built-in asset extension list.
//
// Problem being solved:
//   Metro throws "Unable to resolve" for `require('../assets/database/ayat.realm')`
//   because `.realm` is not in the default assetExts list.  Adding it here
//   makes Metro treat the file as a binary asset (like a .png or .ttf),
//   copy it into the bundle, and let expo-asset resolve its localUri at runtime.
//
// Reference:
//   https://docs.expo.dev/guides/customizing-metro/

const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// ── 1. Add .realm to the list of recognised asset extensions ─────────────────
//
// Metro's default assetExts covers images, fonts, audio, etc.
// We append 'realm' so that:
//   require('./assets/database/ayat.realm')
// is treated as a binary asset (not a JS module) and gets a numeric ID
// that expo-asset can use to call Asset.loadAsync() → localUri.
config.resolver.assetExts.push('realm');
config.resolver.assetExts.push('db');

// ── 2. Ensure sourceExts does NOT accidentally contain 'realm' ───────────────
//
// If 'realm' were in sourceExts Metro would try to parse it as JavaScript
// and fail immediately.  It should only be in assetExts.
config.resolver.sourceExts = config.resolver.sourceExts.filter(
    (ext) => ext !== 'realm',
);

module.exports = config;
