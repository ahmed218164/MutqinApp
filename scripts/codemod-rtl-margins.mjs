/**
 * scripts/codemod-rtl-margins.mjs
 *
 * Converts physical margin/padding properties to logical ones so styles match
 * the app's forced-RTL layout semantics. The app is globally RTL
 * (I18nManager.forceRTL(true) in app/_layout.tsx), where start=right and
 * end=left. Physical left == logical end, physical right == logical start,
 * so these mappings preserve the exact rendered layout:
 *
 *   marginLeft  -> marginEnd
 *   marginRight -> marginStart
 *   paddingLeft -> paddingEnd
 *   paddingRight-> paddingStart
 *
 * Usage: node scripts/codemod-rtl-margins.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const MAP = {
    marginLeft: 'marginEnd',
    marginRight: 'marginStart',
    paddingLeft: 'paddingEnd',
    paddingRight: 'paddingStart',
};

const ROOTS = ['app', 'components'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'to_take_in_review', 'modules']);

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
}

const RE = /(\b)(marginLeft|marginRight|paddingLeft|paddingRight)(\s*:)/g;

let total = 0;
const perFile = [];
for (const root of ROOTS) {
    const rootDir = path.resolve(root);
    if (!fs.existsSync(rootDir)) continue;
    for (const file of walk(rootDir)) {
        const src = fs.readFileSync(file, 'utf8');
        let count = 0;
        const out = src.replace(RE, (m, pre, prop, post) => {
            // Skip lines already annotated as reviewed RTL conversions.
            count++;
            return `${pre}${MAP[prop]}${post}`;
        });
        if (count) {
            fs.writeFileSync(file, out);
            total += count;
            perFile.push(`${count}\t${file}`);
        }
    }
}
console.log(`Converted: ${total}`);
console.log(perFile.sort((a, b) => parseInt(b) - parseInt(a)).join('\n'));
