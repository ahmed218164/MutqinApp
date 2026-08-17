/**
 * components/recite/MushafPage.tsx
 *
 * Renders a single Hafs-Default Mushaf page using:
 *   · Layer 1 — Background View (#fdf6e3, Mushaf paper color)
 *   · Layer 2 — Bundled lossless WebP image `assets/mushaf/a{N}.webp` via require()
 *               resizeMode="stretch" to match the 1000-unit per-mille grid
 *   · Layer 3 — Highlight overlays via MushafHighlights (positioned with the
 *                 exact Java formula: screenPx = (dbValue × dim) / 1000)
 *
 * NOTE: The getPageSource switch (lines below) must remain in this file.
 *       Metro's static analyser requires require() calls to live in the same
 *       module where they are used — they cannot be moved to a separate file.
 *
 * Architecture:
 *   - mushaf-page-types.ts     → MushafPageProps interface
 *   - mushaf-page-constants.ts → colors & rendering constants
 *   - MushafHighlights.tsx     → highlight overlay rendering component
 */

import * as React from 'react';
import {
    View,
    Image,
    StyleSheet,
    ActivityIndicator,
    Text,
} from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    runOnJS,
} from 'react-native-reanimated';
import {
    GestureDetector,
    Gesture,
} from 'react-native-gesture-handler';

import { useAyatDB } from '../../lib/SQLiteProvider';
import {
    queryPageCoords,
    hitTestPage,
    AyahBoundingBox,
} from '../../lib/sqlite-db';
import { lightImpact, mediumImpact } from '../../lib/haptics';
import { MushafPageProps } from './mushaf-page-types';
import { MUSHAF_BG } from './mushaf-page-constants';
import { Colors } from '../../constants/theme';
import MushafHighlights from './MushafHighlights';

// ─────────────────────────────────────────────────────────────────────────────
// Mushaf page image map
// All 604 pages are bundled in assets/mushaf/a{N}.webp (lossless WebP —
// identical pixels to the original PNGs at ~17% smaller bundle).
// Metro requires static require() calls, so we pre-build a lookup table.
// ─────────────────────────────────────────────────────────────────────────────

// We import the first few explicitly and use a dynamic helper for the rest.
// Because Metro can't bundle truly dynamic requires, we use a pre-generated map.
// The map below is compact: it reads as require('../assets/mushaf/a1.webp'), etc.
// getPageSource() below handles all 604 pages via a switch statement.
// Metro statically analyses require() calls inside it.

export function getPageSource(page: number): any {
    // Metro requires static string literals inside require().
    // We use a switch over page numbers 1-604.
    switch (page) {
        case 1: return require('../../assets/mushaf/a1.webp');
        case 2: return require('../../assets/mushaf/a2.webp');
        case 3: return require('../../assets/mushaf/a3.webp');
        case 4: return require('../../assets/mushaf/a4.webp');
        case 5: return require('../../assets/mushaf/a5.webp');
        case 6: return require('../../assets/mushaf/a6.webp');
        case 7: return require('../../assets/mushaf/a7.webp');
        case 8: return require('../../assets/mushaf/a8.webp');
        case 9: return require('../../assets/mushaf/a9.webp');
        case 10: return require('../../assets/mushaf/a10.webp');
        case 11: return require('../../assets/mushaf/a11.webp');
        case 12: return require('../../assets/mushaf/a12.webp');
        case 13: return require('../../assets/mushaf/a13.webp');
        case 14: return require('../../assets/mushaf/a14.webp');
        case 15: return require('../../assets/mushaf/a15.webp');
        case 16: return require('../../assets/mushaf/a16.webp');
        case 17: return require('../../assets/mushaf/a17.webp');
        case 18: return require('../../assets/mushaf/a18.webp');
        case 19: return require('../../assets/mushaf/a19.webp');
        case 20: return require('../../assets/mushaf/a20.webp');
        case 21: return require('../../assets/mushaf/a21.webp');
        case 22: return require('../../assets/mushaf/a22.webp');
        case 23: return require('../../assets/mushaf/a23.webp');
        case 24: return require('../../assets/mushaf/a24.webp');
        case 25: return require('../../assets/mushaf/a25.webp');
        case 26: return require('../../assets/mushaf/a26.webp');
        case 27: return require('../../assets/mushaf/a27.webp');
        case 28: return require('../../assets/mushaf/a28.webp');
        case 29: return require('../../assets/mushaf/a29.webp');
        case 30: return require('../../assets/mushaf/a30.webp');
        case 31: return require('../../assets/mushaf/a31.webp');
        case 32: return require('../../assets/mushaf/a32.webp');
        case 33: return require('../../assets/mushaf/a33.webp');
        case 34: return require('../../assets/mushaf/a34.webp');
        case 35: return require('../../assets/mushaf/a35.webp');
        case 36: return require('../../assets/mushaf/a36.webp');
        case 37: return require('../../assets/mushaf/a37.webp');
        case 38: return require('../../assets/mushaf/a38.webp');
        case 39: return require('../../assets/mushaf/a39.webp');
        case 40: return require('../../assets/mushaf/a40.webp');
        case 41: return require('../../assets/mushaf/a41.webp');
        case 42: return require('../../assets/mushaf/a42.webp');
        case 43: return require('../../assets/mushaf/a43.webp');
        case 44: return require('../../assets/mushaf/a44.webp');
        case 45: return require('../../assets/mushaf/a45.webp');
        case 46: return require('../../assets/mushaf/a46.webp');
        case 47: return require('../../assets/mushaf/a47.webp');
        case 48: return require('../../assets/mushaf/a48.webp');
        case 49: return require('../../assets/mushaf/a49.webp');
        case 50: return require('../../assets/mushaf/a50.webp');
        case 51: return require('../../assets/mushaf/a51.webp');
        case 52: return require('../../assets/mushaf/a52.webp');
        case 53: return require('../../assets/mushaf/a53.webp');
        case 54: return require('../../assets/mushaf/a54.webp');
        case 55: return require('../../assets/mushaf/a55.webp');
        case 56: return require('../../assets/mushaf/a56.webp');
        case 57: return require('../../assets/mushaf/a57.webp');
        case 58: return require('../../assets/mushaf/a58.webp');
        case 59: return require('../../assets/mushaf/a59.webp');
        case 60: return require('../../assets/mushaf/a60.webp');
        case 61: return require('../../assets/mushaf/a61.webp');
        case 62: return require('../../assets/mushaf/a62.webp');
        case 63: return require('../../assets/mushaf/a63.webp');
        case 64: return require('../../assets/mushaf/a64.webp');
        case 65: return require('../../assets/mushaf/a65.webp');
        case 66: return require('../../assets/mushaf/a66.webp');
        case 67: return require('../../assets/mushaf/a67.webp');
        case 68: return require('../../assets/mushaf/a68.webp');
        case 69: return require('../../assets/mushaf/a69.webp');
        case 70: return require('../../assets/mushaf/a70.webp');
        case 71: return require('../../assets/mushaf/a71.webp');
        case 72: return require('../../assets/mushaf/a72.webp');
        case 73: return require('../../assets/mushaf/a73.webp');
        case 74: return require('../../assets/mushaf/a74.webp');
        case 75: return require('../../assets/mushaf/a75.webp');
        case 76: return require('../../assets/mushaf/a76.webp');
        case 77: return require('../../assets/mushaf/a77.webp');
        case 78: return require('../../assets/mushaf/a78.webp');
        case 79: return require('../../assets/mushaf/a79.webp');
        case 80: return require('../../assets/mushaf/a80.webp');
        case 81: return require('../../assets/mushaf/a81.webp');
        case 82: return require('../../assets/mushaf/a82.webp');
        case 83: return require('../../assets/mushaf/a83.webp');
        case 84: return require('../../assets/mushaf/a84.webp');
        case 85: return require('../../assets/mushaf/a85.webp');
        case 86: return require('../../assets/mushaf/a86.webp');
        case 87: return require('../../assets/mushaf/a87.webp');
        case 88: return require('../../assets/mushaf/a88.webp');
        case 89: return require('../../assets/mushaf/a89.webp');
        case 90: return require('../../assets/mushaf/a90.webp');
        case 91: return require('../../assets/mushaf/a91.webp');
        case 92: return require('../../assets/mushaf/a92.webp');
        case 93: return require('../../assets/mushaf/a93.webp');
        case 94: return require('../../assets/mushaf/a94.webp');
        case 95: return require('../../assets/mushaf/a95.webp');
        case 96: return require('../../assets/mushaf/a96.webp');
        case 97: return require('../../assets/mushaf/a97.webp');
        case 98: return require('../../assets/mushaf/a98.webp');
        case 99: return require('../../assets/mushaf/a99.webp');
        case 100: return require('../../assets/mushaf/a100.webp');
        case 101: return require('../../assets/mushaf/a101.webp');
        case 102: return require('../../assets/mushaf/a102.webp');
        case 103: return require('../../assets/mushaf/a103.webp');
        case 104: return require('../../assets/mushaf/a104.webp');
        case 105: return require('../../assets/mushaf/a105.webp');
        case 106: return require('../../assets/mushaf/a106.webp');
        case 107: return require('../../assets/mushaf/a107.webp');
        case 108: return require('../../assets/mushaf/a108.webp');
        case 109: return require('../../assets/mushaf/a109.webp');
        case 110: return require('../../assets/mushaf/a110.webp');
        case 111: return require('../../assets/mushaf/a111.webp');
        case 112: return require('../../assets/mushaf/a112.webp');
        case 113: return require('../../assets/mushaf/a113.webp');
        case 114: return require('../../assets/mushaf/a114.webp');
        case 115: return require('../../assets/mushaf/a115.webp');
        case 116: return require('../../assets/mushaf/a116.webp');
        case 117: return require('../../assets/mushaf/a117.webp');
        case 118: return require('../../assets/mushaf/a118.webp');
        case 119: return require('../../assets/mushaf/a119.webp');
        case 120: return require('../../assets/mushaf/a120.webp');
        case 121: return require('../../assets/mushaf/a121.webp');
        case 122: return require('../../assets/mushaf/a122.webp');
        case 123: return require('../../assets/mushaf/a123.webp');
        case 124: return require('../../assets/mushaf/a124.webp');
        case 125: return require('../../assets/mushaf/a125.webp');
        case 126: return require('../../assets/mushaf/a126.webp');
        case 127: return require('../../assets/mushaf/a127.webp');
        case 128: return require('../../assets/mushaf/a128.webp');
        case 129: return require('../../assets/mushaf/a129.webp');
        case 130: return require('../../assets/mushaf/a130.webp');
        case 131: return require('../../assets/mushaf/a131.webp');
        case 132: return require('../../assets/mushaf/a132.webp');
        case 133: return require('../../assets/mushaf/a133.webp');
        case 134: return require('../../assets/mushaf/a134.webp');
        case 135: return require('../../assets/mushaf/a135.webp');
        case 136: return require('../../assets/mushaf/a136.webp');
        case 137: return require('../../assets/mushaf/a137.webp');
        case 138: return require('../../assets/mushaf/a138.webp');
        case 139: return require('../../assets/mushaf/a139.webp');
        case 140: return require('../../assets/mushaf/a140.webp');
        case 141: return require('../../assets/mushaf/a141.webp');
        case 142: return require('../../assets/mushaf/a142.webp');
        case 143: return require('../../assets/mushaf/a143.webp');
        case 144: return require('../../assets/mushaf/a144.webp');
        case 145: return require('../../assets/mushaf/a145.webp');
        case 146: return require('../../assets/mushaf/a146.webp');
        case 147: return require('../../assets/mushaf/a147.webp');
        case 148: return require('../../assets/mushaf/a148.webp');
        case 149: return require('../../assets/mushaf/a149.webp');
        case 150: return require('../../assets/mushaf/a150.webp');
        case 151: return require('../../assets/mushaf/a151.webp');
        case 152: return require('../../assets/mushaf/a152.webp');
        case 153: return require('../../assets/mushaf/a153.webp');
        case 154: return require('../../assets/mushaf/a154.webp');
        case 155: return require('../../assets/mushaf/a155.webp');
        case 156: return require('../../assets/mushaf/a156.webp');
        case 157: return require('../../assets/mushaf/a157.webp');
        case 158: return require('../../assets/mushaf/a158.webp');
        case 159: return require('../../assets/mushaf/a159.webp');
        case 160: return require('../../assets/mushaf/a160.webp');
        case 161: return require('../../assets/mushaf/a161.webp');
        case 162: return require('../../assets/mushaf/a162.webp');
        case 163: return require('../../assets/mushaf/a163.webp');
        case 164: return require('../../assets/mushaf/a164.webp');
        case 165: return require('../../assets/mushaf/a165.webp');
        case 166: return require('../../assets/mushaf/a166.webp');
        case 167: return require('../../assets/mushaf/a167.webp');
        case 168: return require('../../assets/mushaf/a168.webp');
        case 169: return require('../../assets/mushaf/a169.webp');
        case 170: return require('../../assets/mushaf/a170.webp');
        case 171: return require('../../assets/mushaf/a171.webp');
        case 172: return require('../../assets/mushaf/a172.webp');
        case 173: return require('../../assets/mushaf/a173.webp');
        case 174: return require('../../assets/mushaf/a174.webp');
        case 175: return require('../../assets/mushaf/a175.webp');
        case 176: return require('../../assets/mushaf/a176.webp');
        case 177: return require('../../assets/mushaf/a177.webp');
        case 178: return require('../../assets/mushaf/a178.webp');
        case 179: return require('../../assets/mushaf/a179.webp');
        case 180: return require('../../assets/mushaf/a180.webp');
        case 181: return require('../../assets/mushaf/a181.webp');
        case 182: return require('../../assets/mushaf/a182.webp');
        case 183: return require('../../assets/mushaf/a183.webp');
        case 184: return require('../../assets/mushaf/a184.webp');
        case 185: return require('../../assets/mushaf/a185.webp');
        case 186: return require('../../assets/mushaf/a186.webp');
        case 187: return require('../../assets/mushaf/a187.webp');
        case 188: return require('../../assets/mushaf/a188.webp');
        case 189: return require('../../assets/mushaf/a189.webp');
        case 190: return require('../../assets/mushaf/a190.webp');
        case 191: return require('../../assets/mushaf/a191.webp');
        case 192: return require('../../assets/mushaf/a192.webp');
        case 193: return require('../../assets/mushaf/a193.webp');
        case 194: return require('../../assets/mushaf/a194.webp');
        case 195: return require('../../assets/mushaf/a195.webp');
        case 196: return require('../../assets/mushaf/a196.webp');
        case 197: return require('../../assets/mushaf/a197.webp');
        case 198: return require('../../assets/mushaf/a198.webp');
        case 199: return require('../../assets/mushaf/a199.webp');
        case 200: return require('../../assets/mushaf/a200.webp');
        case 201: return require('../../assets/mushaf/a201.webp');
        case 202: return require('../../assets/mushaf/a202.webp');
        case 203: return require('../../assets/mushaf/a203.webp');
        case 204: return require('../../assets/mushaf/a204.webp');
        case 205: return require('../../assets/mushaf/a205.webp');
        case 206: return require('../../assets/mushaf/a206.webp');
        case 207: return require('../../assets/mushaf/a207.webp');
        case 208: return require('../../assets/mushaf/a208.webp');
        case 209: return require('../../assets/mushaf/a209.webp');
        case 210: return require('../../assets/mushaf/a210.webp');
        case 211: return require('../../assets/mushaf/a211.webp');
        case 212: return require('../../assets/mushaf/a212.webp');
        case 213: return require('../../assets/mushaf/a213.webp');
        case 214: return require('../../assets/mushaf/a214.webp');
        case 215: return require('../../assets/mushaf/a215.webp');
        case 216: return require('../../assets/mushaf/a216.webp');
        case 217: return require('../../assets/mushaf/a217.webp');
        case 218: return require('../../assets/mushaf/a218.webp');
        case 219: return require('../../assets/mushaf/a219.webp');
        case 220: return require('../../assets/mushaf/a220.webp');
        case 221: return require('../../assets/mushaf/a221.webp');
        case 222: return require('../../assets/mushaf/a222.webp');
        case 223: return require('../../assets/mushaf/a223.webp');
        case 224: return require('../../assets/mushaf/a224.webp');
        case 225: return require('../../assets/mushaf/a225.webp');
        case 226: return require('../../assets/mushaf/a226.webp');
        case 227: return require('../../assets/mushaf/a227.webp');
        case 228: return require('../../assets/mushaf/a228.webp');
        case 229: return require('../../assets/mushaf/a229.webp');
        case 230: return require('../../assets/mushaf/a230.webp');
        case 231: return require('../../assets/mushaf/a231.webp');
        case 232: return require('../../assets/mushaf/a232.webp');
        case 233: return require('../../assets/mushaf/a233.webp');
        case 234: return require('../../assets/mushaf/a234.webp');
        case 235: return require('../../assets/mushaf/a235.webp');
        case 236: return require('../../assets/mushaf/a236.webp');
        case 237: return require('../../assets/mushaf/a237.webp');
        case 238: return require('../../assets/mushaf/a238.webp');
        case 239: return require('../../assets/mushaf/a239.webp');
        case 240: return require('../../assets/mushaf/a240.webp');
        case 241: return require('../../assets/mushaf/a241.webp');
        case 242: return require('../../assets/mushaf/a242.webp');
        case 243: return require('../../assets/mushaf/a243.webp');
        case 244: return require('../../assets/mushaf/a244.webp');
        case 245: return require('../../assets/mushaf/a245.webp');
        case 246: return require('../../assets/mushaf/a246.webp');
        case 247: return require('../../assets/mushaf/a247.webp');
        case 248: return require('../../assets/mushaf/a248.webp');
        case 249: return require('../../assets/mushaf/a249.webp');
        case 250: return require('../../assets/mushaf/a250.webp');
        case 251: return require('../../assets/mushaf/a251.webp');
        case 252: return require('../../assets/mushaf/a252.webp');
        case 253: return require('../../assets/mushaf/a253.webp');
        case 254: return require('../../assets/mushaf/a254.webp');
        case 255: return require('../../assets/mushaf/a255.webp');
        case 256: return require('../../assets/mushaf/a256.webp');
        case 257: return require('../../assets/mushaf/a257.webp');
        case 258: return require('../../assets/mushaf/a258.webp');
        case 259: return require('../../assets/mushaf/a259.webp');
        case 260: return require('../../assets/mushaf/a260.webp');
        case 261: return require('../../assets/mushaf/a261.webp');
        case 262: return require('../../assets/mushaf/a262.webp');
        case 263: return require('../../assets/mushaf/a263.webp');
        case 264: return require('../../assets/mushaf/a264.webp');
        case 265: return require('../../assets/mushaf/a265.webp');
        case 266: return require('../../assets/mushaf/a266.webp');
        case 267: return require('../../assets/mushaf/a267.webp');
        case 268: return require('../../assets/mushaf/a268.webp');
        case 269: return require('../../assets/mushaf/a269.webp');
        case 270: return require('../../assets/mushaf/a270.webp');
        case 271: return require('../../assets/mushaf/a271.webp');
        case 272: return require('../../assets/mushaf/a272.webp');
        case 273: return require('../../assets/mushaf/a273.webp');
        case 274: return require('../../assets/mushaf/a274.webp');
        case 275: return require('../../assets/mushaf/a275.webp');
        case 276: return require('../../assets/mushaf/a276.webp');
        case 277: return require('../../assets/mushaf/a277.webp');
        case 278: return require('../../assets/mushaf/a278.webp');
        case 279: return require('../../assets/mushaf/a279.webp');
        case 280: return require('../../assets/mushaf/a280.webp');
        case 281: return require('../../assets/mushaf/a281.webp');
        case 282: return require('../../assets/mushaf/a282.webp');
        case 283: return require('../../assets/mushaf/a283.webp');
        case 284: return require('../../assets/mushaf/a284.webp');
        case 285: return require('../../assets/mushaf/a285.webp');
        case 286: return require('../../assets/mushaf/a286.webp');
        case 287: return require('../../assets/mushaf/a287.webp');
        case 288: return require('../../assets/mushaf/a288.webp');
        case 289: return require('../../assets/mushaf/a289.webp');
        case 290: return require('../../assets/mushaf/a290.webp');
        case 291: return require('../../assets/mushaf/a291.webp');
        case 292: return require('../../assets/mushaf/a292.webp');
        case 293: return require('../../assets/mushaf/a293.webp');
        case 294: return require('../../assets/mushaf/a294.webp');
        case 295: return require('../../assets/mushaf/a295.webp');
        case 296: return require('../../assets/mushaf/a296.webp');
        case 297: return require('../../assets/mushaf/a297.webp');
        case 298: return require('../../assets/mushaf/a298.webp');
        case 299: return require('../../assets/mushaf/a299.webp');
        case 300: return require('../../assets/mushaf/a300.webp');
        case 301: return require('../../assets/mushaf/a301.webp');
        case 302: return require('../../assets/mushaf/a302.webp');
        case 303: return require('../../assets/mushaf/a303.webp');
        case 304: return require('../../assets/mushaf/a304.webp');
        case 305: return require('../../assets/mushaf/a305.webp');
        case 306: return require('../../assets/mushaf/a306.webp');
        case 307: return require('../../assets/mushaf/a307.webp');
        case 308: return require('../../assets/mushaf/a308.webp');
        case 309: return require('../../assets/mushaf/a309.webp');
        case 310: return require('../../assets/mushaf/a310.webp');
        case 311: return require('../../assets/mushaf/a311.webp');
        case 312: return require('../../assets/mushaf/a312.webp');
        case 313: return require('../../assets/mushaf/a313.webp');
        case 314: return require('../../assets/mushaf/a314.webp');
        case 315: return require('../../assets/mushaf/a315.webp');
        case 316: return require('../../assets/mushaf/a316.webp');
        case 317: return require('../../assets/mushaf/a317.webp');
        case 318: return require('../../assets/mushaf/a318.webp');
        case 319: return require('../../assets/mushaf/a319.webp');
        case 320: return require('../../assets/mushaf/a320.webp');
        case 321: return require('../../assets/mushaf/a321.webp');
        case 322: return require('../../assets/mushaf/a322.webp');
        case 323: return require('../../assets/mushaf/a323.webp');
        case 324: return require('../../assets/mushaf/a324.webp');
        case 325: return require('../../assets/mushaf/a325.webp');
        case 326: return require('../../assets/mushaf/a326.webp');
        case 327: return require('../../assets/mushaf/a327.webp');
        case 328: return require('../../assets/mushaf/a328.webp');
        case 329: return require('../../assets/mushaf/a329.webp');
        case 330: return require('../../assets/mushaf/a330.webp');
        case 331: return require('../../assets/mushaf/a331.webp');
        case 332: return require('../../assets/mushaf/a332.webp');
        case 333: return require('../../assets/mushaf/a333.webp');
        case 334: return require('../../assets/mushaf/a334.webp');
        case 335: return require('../../assets/mushaf/a335.webp');
        case 336: return require('../../assets/mushaf/a336.webp');
        case 337: return require('../../assets/mushaf/a337.webp');
        case 338: return require('../../assets/mushaf/a338.webp');
        case 339: return require('../../assets/mushaf/a339.webp');
        case 340: return require('../../assets/mushaf/a340.webp');
        case 341: return require('../../assets/mushaf/a341.webp');
        case 342: return require('../../assets/mushaf/a342.webp');
        case 343: return require('../../assets/mushaf/a343.webp');
        case 344: return require('../../assets/mushaf/a344.webp');
        case 345: return require('../../assets/mushaf/a345.webp');
        case 346: return require('../../assets/mushaf/a346.webp');
        case 347: return require('../../assets/mushaf/a347.webp');
        case 348: return require('../../assets/mushaf/a348.webp');
        case 349: return require('../../assets/mushaf/a349.webp');
        case 350: return require('../../assets/mushaf/a350.webp');
        case 351: return require('../../assets/mushaf/a351.webp');
        case 352: return require('../../assets/mushaf/a352.webp');
        case 353: return require('../../assets/mushaf/a353.webp');
        case 354: return require('../../assets/mushaf/a354.webp');
        case 355: return require('../../assets/mushaf/a355.webp');
        case 356: return require('../../assets/mushaf/a356.webp');
        case 357: return require('../../assets/mushaf/a357.webp');
        case 358: return require('../../assets/mushaf/a358.webp');
        case 359: return require('../../assets/mushaf/a359.webp');
        case 360: return require('../../assets/mushaf/a360.webp');
        case 361: return require('../../assets/mushaf/a361.webp');
        case 362: return require('../../assets/mushaf/a362.webp');
        case 363: return require('../../assets/mushaf/a363.webp');
        case 364: return require('../../assets/mushaf/a364.webp');
        case 365: return require('../../assets/mushaf/a365.webp');
        case 366: return require('../../assets/mushaf/a366.webp');
        case 367: return require('../../assets/mushaf/a367.webp');
        case 368: return require('../../assets/mushaf/a368.webp');
        case 369: return require('../../assets/mushaf/a369.webp');
        case 370: return require('../../assets/mushaf/a370.webp');
        case 371: return require('../../assets/mushaf/a371.webp');
        case 372: return require('../../assets/mushaf/a372.webp');
        case 373: return require('../../assets/mushaf/a373.webp');
        case 374: return require('../../assets/mushaf/a374.webp');
        case 375: return require('../../assets/mushaf/a375.webp');
        case 376: return require('../../assets/mushaf/a376.webp');
        case 377: return require('../../assets/mushaf/a377.webp');
        case 378: return require('../../assets/mushaf/a378.webp');
        case 379: return require('../../assets/mushaf/a379.webp');
        case 380: return require('../../assets/mushaf/a380.webp');
        case 381: return require('../../assets/mushaf/a381.webp');
        case 382: return require('../../assets/mushaf/a382.webp');
        case 383: return require('../../assets/mushaf/a383.webp');
        case 384: return require('../../assets/mushaf/a384.webp');
        case 385: return require('../../assets/mushaf/a385.webp');
        case 386: return require('../../assets/mushaf/a386.webp');
        case 387: return require('../../assets/mushaf/a387.webp');
        case 388: return require('../../assets/mushaf/a388.webp');
        case 389: return require('../../assets/mushaf/a389.webp');
        case 390: return require('../../assets/mushaf/a390.webp');
        case 391: return require('../../assets/mushaf/a391.webp');
        case 392: return require('../../assets/mushaf/a392.webp');
        case 393: return require('../../assets/mushaf/a393.webp');
        case 394: return require('../../assets/mushaf/a394.webp');
        case 395: return require('../../assets/mushaf/a395.webp');
        case 396: return require('../../assets/mushaf/a396.webp');
        case 397: return require('../../assets/mushaf/a397.webp');
        case 398: return require('../../assets/mushaf/a398.webp');
        case 399: return require('../../assets/mushaf/a399.webp');
        case 400: return require('../../assets/mushaf/a400.webp');
        case 401: return require('../../assets/mushaf/a401.webp');
        case 402: return require('../../assets/mushaf/a402.webp');
        case 403: return require('../../assets/mushaf/a403.webp');
        case 404: return require('../../assets/mushaf/a404.webp');
        case 405: return require('../../assets/mushaf/a405.webp');
        case 406: return require('../../assets/mushaf/a406.webp');
        case 407: return require('../../assets/mushaf/a407.webp');
        case 408: return require('../../assets/mushaf/a408.webp');
        case 409: return require('../../assets/mushaf/a409.webp');
        case 410: return require('../../assets/mushaf/a410.webp');
        case 411: return require('../../assets/mushaf/a411.webp');
        case 412: return require('../../assets/mushaf/a412.webp');
        case 413: return require('../../assets/mushaf/a413.webp');
        case 414: return require('../../assets/mushaf/a414.webp');
        case 415: return require('../../assets/mushaf/a415.webp');
        case 416: return require('../../assets/mushaf/a416.webp');
        case 417: return require('../../assets/mushaf/a417.webp');
        case 418: return require('../../assets/mushaf/a418.webp');
        case 419: return require('../../assets/mushaf/a419.webp');
        case 420: return require('../../assets/mushaf/a420.webp');
        case 421: return require('../../assets/mushaf/a421.webp');
        case 422: return require('../../assets/mushaf/a422.webp');
        case 423: return require('../../assets/mushaf/a423.webp');
        case 424: return require('../../assets/mushaf/a424.webp');
        case 425: return require('../../assets/mushaf/a425.webp');
        case 426: return require('../../assets/mushaf/a426.webp');
        case 427: return require('../../assets/mushaf/a427.webp');
        case 428: return require('../../assets/mushaf/a428.webp');
        case 429: return require('../../assets/mushaf/a429.webp');
        case 430: return require('../../assets/mushaf/a430.webp');
        case 431: return require('../../assets/mushaf/a431.webp');
        case 432: return require('../../assets/mushaf/a432.webp');
        case 433: return require('../../assets/mushaf/a433.webp');
        case 434: return require('../../assets/mushaf/a434.webp');
        case 435: return require('../../assets/mushaf/a435.webp');
        case 436: return require('../../assets/mushaf/a436.webp');
        case 437: return require('../../assets/mushaf/a437.webp');
        case 438: return require('../../assets/mushaf/a438.webp');
        case 439: return require('../../assets/mushaf/a439.webp');
        case 440: return require('../../assets/mushaf/a440.webp');
        case 441: return require('../../assets/mushaf/a441.webp');
        case 442: return require('../../assets/mushaf/a442.webp');
        case 443: return require('../../assets/mushaf/a443.webp');
        case 444: return require('../../assets/mushaf/a444.webp');
        case 445: return require('../../assets/mushaf/a445.webp');
        case 446: return require('../../assets/mushaf/a446.webp');
        case 447: return require('../../assets/mushaf/a447.webp');
        case 448: return require('../../assets/mushaf/a448.webp');
        case 449: return require('../../assets/mushaf/a449.webp');
        case 450: return require('../../assets/mushaf/a450.webp');
        case 451: return require('../../assets/mushaf/a451.webp');
        case 452: return require('../../assets/mushaf/a452.webp');
        case 453: return require('../../assets/mushaf/a453.webp');
        case 454: return require('../../assets/mushaf/a454.webp');
        case 455: return require('../../assets/mushaf/a455.webp');
        case 456: return require('../../assets/mushaf/a456.webp');
        case 457: return require('../../assets/mushaf/a457.webp');
        case 458: return require('../../assets/mushaf/a458.webp');
        case 459: return require('../../assets/mushaf/a459.webp');
        case 460: return require('../../assets/mushaf/a460.webp');
        case 461: return require('../../assets/mushaf/a461.webp');
        case 462: return require('../../assets/mushaf/a462.webp');
        case 463: return require('../../assets/mushaf/a463.webp');
        case 464: return require('../../assets/mushaf/a464.webp');
        case 465: return require('../../assets/mushaf/a465.webp');
        case 466: return require('../../assets/mushaf/a466.webp');
        case 467: return require('../../assets/mushaf/a467.webp');
        case 468: return require('../../assets/mushaf/a468.webp');
        case 469: return require('../../assets/mushaf/a469.webp');
        case 470: return require('../../assets/mushaf/a470.webp');
        case 471: return require('../../assets/mushaf/a471.webp');
        case 472: return require('../../assets/mushaf/a472.webp');
        case 473: return require('../../assets/mushaf/a473.webp');
        case 474: return require('../../assets/mushaf/a474.webp');
        case 475: return require('../../assets/mushaf/a475.webp');
        case 476: return require('../../assets/mushaf/a476.webp');
        case 477: return require('../../assets/mushaf/a477.webp');
        case 478: return require('../../assets/mushaf/a478.webp');
        case 479: return require('../../assets/mushaf/a479.webp');
        case 480: return require('../../assets/mushaf/a480.webp');
        case 481: return require('../../assets/mushaf/a481.webp');
        case 482: return require('../../assets/mushaf/a482.webp');
        case 483: return require('../../assets/mushaf/a483.webp');
        case 484: return require('../../assets/mushaf/a484.webp');
        case 485: return require('../../assets/mushaf/a485.webp');
        case 486: return require('../../assets/mushaf/a486.webp');
        case 487: return require('../../assets/mushaf/a487.webp');
        case 488: return require('../../assets/mushaf/a488.webp');
        case 489: return require('../../assets/mushaf/a489.webp');
        case 490: return require('../../assets/mushaf/a490.webp');
        case 491: return require('../../assets/mushaf/a491.webp');
        case 492: return require('../../assets/mushaf/a492.webp');
        case 493: return require('../../assets/mushaf/a493.webp');
        case 494: return require('../../assets/mushaf/a494.webp');
        case 495: return require('../../assets/mushaf/a495.webp');
        case 496: return require('../../assets/mushaf/a496.webp');
        case 497: return require('../../assets/mushaf/a497.webp');
        case 498: return require('../../assets/mushaf/a498.webp');
        case 499: return require('../../assets/mushaf/a499.webp');
        case 500: return require('../../assets/mushaf/a500.webp');
        case 501: return require('../../assets/mushaf/a501.webp');
        case 502: return require('../../assets/mushaf/a502.webp');
        case 503: return require('../../assets/mushaf/a503.webp');
        case 504: return require('../../assets/mushaf/a504.webp');
        case 505: return require('../../assets/mushaf/a505.webp');
        case 506: return require('../../assets/mushaf/a506.webp');
        case 507: return require('../../assets/mushaf/a507.webp');
        case 508: return require('../../assets/mushaf/a508.webp');
        case 509: return require('../../assets/mushaf/a509.webp');
        case 510: return require('../../assets/mushaf/a510.webp');
        case 511: return require('../../assets/mushaf/a511.webp');
        case 512: return require('../../assets/mushaf/a512.webp');
        case 513: return require('../../assets/mushaf/a513.webp');
        case 514: return require('../../assets/mushaf/a514.webp');
        case 515: return require('../../assets/mushaf/a515.webp');
        case 516: return require('../../assets/mushaf/a516.webp');
        case 517: return require('../../assets/mushaf/a517.webp');
        case 518: return require('../../assets/mushaf/a518.webp');
        case 519: return require('../../assets/mushaf/a519.webp');
        case 520: return require('../../assets/mushaf/a520.webp');
        case 521: return require('../../assets/mushaf/a521.webp');
        case 522: return require('../../assets/mushaf/a522.webp');
        case 523: return require('../../assets/mushaf/a523.webp');
        case 524: return require('../../assets/mushaf/a524.webp');
        case 525: return require('../../assets/mushaf/a525.webp');
        case 526: return require('../../assets/mushaf/a526.webp');
        case 527: return require('../../assets/mushaf/a527.webp');
        case 528: return require('../../assets/mushaf/a528.webp');
        case 529: return require('../../assets/mushaf/a529.webp');
        case 530: return require('../../assets/mushaf/a530.webp');
        case 531: return require('../../assets/mushaf/a531.webp');
        case 532: return require('../../assets/mushaf/a532.webp');
        case 533: return require('../../assets/mushaf/a533.webp');
        case 534: return require('../../assets/mushaf/a534.webp');
        case 535: return require('../../assets/mushaf/a535.webp');
        case 536: return require('../../assets/mushaf/a536.webp');
        case 537: return require('../../assets/mushaf/a537.webp');
        case 538: return require('../../assets/mushaf/a538.webp');
        case 539: return require('../../assets/mushaf/a539.webp');
        case 540: return require('../../assets/mushaf/a540.webp');
        case 541: return require('../../assets/mushaf/a541.webp');
        case 542: return require('../../assets/mushaf/a542.webp');
        case 543: return require('../../assets/mushaf/a543.webp');
        case 544: return require('../../assets/mushaf/a544.webp');
        case 545: return require('../../assets/mushaf/a545.webp');
        case 546: return require('../../assets/mushaf/a546.webp');
        case 547: return require('../../assets/mushaf/a547.webp');
        case 548: return require('../../assets/mushaf/a548.webp');
        case 549: return require('../../assets/mushaf/a549.webp');
        case 550: return require('../../assets/mushaf/a550.webp');
        case 551: return require('../../assets/mushaf/a551.webp');
        case 552: return require('../../assets/mushaf/a552.webp');
        case 553: return require('../../assets/mushaf/a553.webp');
        case 554: return require('../../assets/mushaf/a554.webp');
        case 555: return require('../../assets/mushaf/a555.webp');
        case 556: return require('../../assets/mushaf/a556.webp');
        case 557: return require('../../assets/mushaf/a557.webp');
        case 558: return require('../../assets/mushaf/a558.webp');
        case 559: return require('../../assets/mushaf/a559.webp');
        case 560: return require('../../assets/mushaf/a560.webp');
        case 561: return require('../../assets/mushaf/a561.webp');
        case 562: return require('../../assets/mushaf/a562.webp');
        case 563: return require('../../assets/mushaf/a563.webp');
        case 564: return require('../../assets/mushaf/a564.webp');
        case 565: return require('../../assets/mushaf/a565.webp');
        case 566: return require('../../assets/mushaf/a566.webp');
        case 567: return require('../../assets/mushaf/a567.webp');
        case 568: return require('../../assets/mushaf/a568.webp');
        case 569: return require('../../assets/mushaf/a569.webp');
        case 570: return require('../../assets/mushaf/a570.webp');
        case 571: return require('../../assets/mushaf/a571.webp');
        case 572: return require('../../assets/mushaf/a572.webp');
        case 573: return require('../../assets/mushaf/a573.webp');
        case 574: return require('../../assets/mushaf/a574.webp');
        case 575: return require('../../assets/mushaf/a575.webp');
        case 576: return require('../../assets/mushaf/a576.webp');
        case 577: return require('../../assets/mushaf/a577.webp');
        case 578: return require('../../assets/mushaf/a578.webp');
        case 579: return require('../../assets/mushaf/a579.webp');
        case 580: return require('../../assets/mushaf/a580.webp');
        case 581: return require('../../assets/mushaf/a581.webp');
        case 582: return require('../../assets/mushaf/a582.webp');
        case 583: return require('../../assets/mushaf/a583.webp');
        case 584: return require('../../assets/mushaf/a584.webp');
        case 585: return require('../../assets/mushaf/a585.webp');
        case 586: return require('../../assets/mushaf/a586.webp');
        case 587: return require('../../assets/mushaf/a587.webp');
        case 588: return require('../../assets/mushaf/a588.webp');
        case 589: return require('../../assets/mushaf/a589.webp');
        case 590: return require('../../assets/mushaf/a590.webp');
        case 591: return require('../../assets/mushaf/a591.webp');
        case 592: return require('../../assets/mushaf/a592.webp');
        case 593: return require('../../assets/mushaf/a593.webp');
        case 594: return require('../../assets/mushaf/a594.webp');
        case 595: return require('../../assets/mushaf/a595.webp');
        case 596: return require('../../assets/mushaf/a596.webp');
        case 597: return require('../../assets/mushaf/a597.webp');
        case 598: return require('../../assets/mushaf/a598.webp');
        case 599: return require('../../assets/mushaf/a599.webp');
        case 600: return require('../../assets/mushaf/a600.webp');
        case 601: return require('../../assets/mushaf/a601.webp');
        case 602: return require('../../assets/mushaf/a602.webp');
        case 603: return require('../../assets/mushaf/a603.webp');
        case 604: return require('../../assets/mushaf/a604.webp');
        default:
            return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

function MushafPageInner({
pageNumber,
    highlightedVerseKey,
    longPressedVerseKey,
    onVersePress,
    onVerseLongPress,
    immersive = false,
    onImmersiveChange,
    isActive = false,
    nightMode = false,
    heatmapData,
}: MushafPageProps) {
    const db = useAyatDB();

    // ── Coordinate data: only load when page is active or adjacent ───────────
    // Avoids hammering SQLite for all 604 pages on initial load.
    const [pageCoords, setPageCoords] = React.useState<AyahBoundingBox[]>([]);
    const [coordsLoaded, setCoordsLoaded] = React.useState(false);

    React.useEffect(() => {
        // Load immediately if active, defer 300ms if adjacent (pre-warm)
        if (!db || coordsLoaded) return;
        const delay = isActive ? 0 : 300;
        const timer = setTimeout(() => {
            try {
                const coords = queryPageCoords(db, pageNumber);
                setPageCoords(coords);
                setCoordsLoaded(true);
            } catch (err) {
                console.error('[MushafPage] coords error:', err);
            }
        }, delay);
        return () => clearTimeout(timer);
    }, [db, pageNumber, isActive, coordsLoaded]);

    // ── Image fade-in: prevents white flash when page first appears ──────────
    const imageOpacity = useSharedValue(0);
    const imageStyle = useAnimatedStyle(() => ({ opacity: imageOpacity.value }));

    function handleImageLoad() {
        imageOpacity.value = withTiming(1, { duration: 180 });
    }


    // ── Rendered image dimensions (set once onLayout fires) ──────────────────
    // These are the actual pixel size of the <Image> on screen.
    const [imgWidth, setImgWidth] = React.useState(0);
    const [imgHeight, setImgHeight] = React.useState(0);

    // ── Zoom (pinch) ─────────────────────────────────────────────────────────
    const scale = useSharedValue(1);
    const savedScale = useSharedValue(1);

    // ── Long-press flash ──────────────────────────────────────────────────────
    const flashAlpha = useSharedValue(0);

    // ── JS callbacks (called via runOnJS from gesture worklets) ───────────────

    const handleTap = React.useCallback(() => {
        lightImpact();
        onImmersiveChange?.(!immersive);
    }, [immersive, onImmersiveChange]);

    /**
     * handleLongPress
     *
     * Converts a raw screen tap (pixels relative to the image container) into
     * per-mille coordinates, then queries Realm to find which ayah was touched.
     *
     * Java equivalent: x4/n.java h() + q4/z.java onTouch ACTION_MOVE:
     *   double dbX = (touchX_px / imageWidth_px)  * 1000
     *   double dbY = (touchY_px / imageHeight_px) * 1000
     *   if (dbY < row.max_y && dbY > row.min_y && dbX > row.min_x && dbX < row.max_x)
     */
    const handleLongPress = React.useCallback(
        (screenX: number, screenY: number) => {
            mediumImpact();
            if (!db || imgWidth === 0 || imgHeight === 0) return;

            // Convert screen pixels → per-mille (0–1000) coordinate space
            // Flip X-axis because the DB uses a Right-to-Left (RTL) coordinate system
            const touchX_pm = 1000 - ((screenX / imgWidth) * 1000);
            const touchY_pm = (screenY / imgHeight) * 1000;

            // Clamp to valid range
            if (touchX_pm < 0 || touchX_pm > 1000 || touchY_pm < 0 || touchY_pm > 1000) return;

            const hit = hitTestPage(db, pageNumber, touchX_pm, touchY_pm);
            if (hit) {
                onVerseLongPress?.(`${hit.sura}:${hit.aya}`);
            }
        },
        [db, imgWidth, imgHeight, pageNumber, onVerseLongPress]
    );

    const handleTapVerse = React.useCallback(
        (screenX: number, screenY: number) => {
            if (!db || imgWidth === 0 || imgHeight === 0) {
                handleTap();
                return;
            }
            // Flip X-axis because the DB uses a Right-to-Left (RTL) coordinate system
            const touchX_pm = 1000 - ((screenX / imgWidth) * 1000);
            const touchY_pm = (screenY / imgHeight) * 1000;
            if (touchX_pm < 0 || touchX_pm > 1000 || touchY_pm < 0 || touchY_pm > 1000) {
                handleTap();
                return;
            }
            const hit = hitTestPage(db, pageNumber, touchX_pm, touchY_pm);
            if (hit) {
                lightImpact();
                onVersePress?.(`${hit.sura}:${hit.aya}`);
            } else {
                handleTap();
            }
        },
        [db, imgWidth, imgHeight, pageNumber, onVersePress, handleTap]
    );

    // ── Gestures ─────────────────────────────────────────────────────────────
    const pinchGesture = Gesture.Pinch()
        .onUpdate((e) => {
            scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 3));
        })
        .onEnd(() => { savedScale.value = scale.value; });

    const longPressGesture = Gesture.LongPress()
        .minDuration(400)
        .onStart((e) => {
            flashAlpha.value = withTiming(1, { duration: 80 }, () => {
                flashAlpha.value = withTiming(0, { duration: 300 });
            });
            runOnJS(handleLongPress)(e.x, e.y);
        });

    const tapGesture = Gesture.Tap()
        .maxDuration(200)
        .numberOfTaps(1)
        .onEnd((e, success) => {
            if (success) runOnJS(handleTapVerse)(e.x, e.y);
        });

    const composedGesture = Gesture.Simultaneous(
        pinchGesture,
        Gesture.Exclusive(longPressGesture, tapGesture)
    );

    // ── Animated styles ───────────────────────────────────────────────────────
    const zoomStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const flashStyle = useAnimatedStyle(() => ({
        ...StyleSheet.absoluteFillObject,
        backgroundColor: `rgba(52,211,153,${flashAlpha.value * 0.18})`,
        pointerEvents: 'none' as const,
    }));

    // ── Night mode tint ───────────────────────────────────────────────────────
    // Kept transparent so the Uthmani Mushaf page remains crisp, bright and authentic
    const nightTint = null;

    // ── Highlights → delegated to MushafHighlights component ─────────────────

    // ── Image source ──────────────────────────────────────────────────────────
    const imageSource = getPageSource(pageNumber);

    if (!imageSource) {
        // Page not in static require map — show placeholder
        return (
            <View style={[styles.root, { backgroundColor: MUSHAF_BG }]}>
                <ActivityIndicator size="large" color={Colors.gold[500]} />
                <Text style={styles.loadingText}>Page {pageNumber}</Text>
            </View>
        );
    }

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <GestureDetector gesture={composedGesture}>
            {/* Layer 1: Background — Mushaf paper color */}
            <Animated.View style={[styles.root, zoomStyle]}>

                {/* Shared image + highlight container.
                    Both the Image and the highlight Animated.Views must share
                    the same parent so absolute positioning is relative to the
                    same origin. Using StyleSheet.absoluteFillObject here means
                    this View takes the full root size and provides the coordinate
                    anchor for all child absolute boxes. */}
                <View style={StyleSheet.absoluteFillObject}>
                    {/* Layer 2: The Mushaf page image — fades in after load */}
                    <Animated.Image
                        source={imageSource}
                        style={[styles.image, imageStyle]}
                        resizeMode="stretch"
                        fadeDuration={0}
                        onLoad={handleImageLoad}
                        onLayout={(e) => {
                            const { width, height } = e.nativeEvent.layout;
                            setImgWidth(width);
                            setImgHeight(height);
                        }}
                    />

                    {/* Layer 3: Highlight overlays — anchored to the same View as the image */}
                    <MushafHighlights
                        pageCoords={pageCoords}
                        imgWidth={imgWidth}
                        imgHeight={imgHeight}
                        highlightedVerseKey={highlightedVerseKey}
                        longPressedVerseKey={longPressedVerseKey}
                        heatmapData={heatmapData}
                    />
                </View>

                {/* Night mode tint layer */}
                {nightMode && <View style={nightTint!} pointerEvents="none" />}

                {/* Long-press feedback flash */}
                <Animated.View style={flashStyle} />

            </Animated.View>
        </GestureDetector>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    /** Layer 1: The Mushaf paper background (#fdf6e3). */
    root: {
        flex: 1,
        backgroundColor: MUSHAF_BG,
    },

    /** Layer 2: Image fills the entire root exactly (stretch). */
    image: {
        flex: 1,
        width: '100%',
        height: '100%',
    },

    loadingText: {
        marginTop: 12,
        color: Colors.gold[400],
        fontSize: 14,
    },
});

// ── Memoize: prevents re-render of all 604 pages when only 1 changes ──────────
export default React.memo(MushafPageInner, (prev, next) => {
    return (
        prev.pageNumber === next.pageNumber &&
        prev.isActive === next.isActive &&
        prev.nightMode === next.nightMode &&
        prev.immersive === next.immersive &&
        prev.highlightedVerseKey === next.highlightedVerseKey &&
        prev.longPressedVerseKey === next.longPressedVerseKey &&
        prev.heatmapData === next.heatmapData
    );
});
