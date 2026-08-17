/**
 * scripts/codemod-colors.mjs
 *
 * Replaces hardcoded hex color literals that EXACTLY match design-system
 * tokens with their `Colors.*` references, in files that already import
 * `Colors` from constants/theme (as `Colors` or `Colors as StaticColors`).
 * Files without the import are skipped — no import rewriting, zero risk.
 *
 * Only standalone quoted literals ('#10b981' / "#10b981") are replaced;
 * hexes embedded in longer strings (e.g. '#10b98140') stay untouched.
 *
 * Usage: node scripts/codemod-colors.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const TOKENS = {
    '#10b981': 'Colors.emerald[500]',
    '#059669': 'Colors.emerald[600]',
    '#047857': 'Colors.emerald[700]',
    '#065f46': 'Colors.emerald[800]',
    '#064e3b': 'Colors.emerald[900]',
    '#022c22': 'Colors.emerald[950]',
    '#34d399': 'Colors.emerald[400]',
    '#6ee7b7': 'Colors.emerald[300]',
    '#a7f3d0': 'Colors.emerald[200]',
    '#d1fae5': 'Colors.emerald[100]',
    '#ecfdf5': 'Colors.emerald[50]',
    '#fbbf24': 'Colors.gold[400]',
    '#f59e0b': 'Colors.gold[500]',
    '#d97706': 'Colors.gold[600]',
    '#b45309': 'Colors.gold[700]',
    '#92400e': 'Colors.gold[800]',
    '#78350f': 'Colors.gold[900]',
    '#451a03': 'Colors.gold[950]',
    '#fcd34d': 'Colors.gold[300]',
    '#fde68a': 'Colors.gold[200]',
    '#fef3c7': 'Colors.gold[100]',
    '#020617': 'Colors.neutral[950]',
    '#0f172a': 'Colors.neutral[900]',
    '#1e293b': 'Colors.neutral[800]',
    '#334155': 'Colors.neutral[700]',
    '#475569': 'Colors.neutral[600]',
    '#64748b': 'Colors.neutral[500]',
    '#94a3b8': 'Colors.neutral[400]',
    '#cbd5e1': 'Colors.neutral[300]',
    '#e2e8f0': 'Colors.neutral[200]',
    '#f1f5f9': 'Colors.neutral[100]',
    '#f8fafc': 'Colors.neutral[50]',
    '#ef4444': 'Colors.error',
    '#3b82f6': 'Colors.info',
};

const ROOTS = ['app', 'components'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'to_take_in_review', 'modules', 'backup_mushaf_png']);

let totalReplacements = 0;
let filesChanged = 0;
const perFile = [];

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
    }
    return out;
}

for (const root of ROOTS) {
    const rootDir = path.resolve(root);
    if (!fs.existsSync(rootDir)) continue;

    for (const file of walk(rootDir)) {
        const src = fs.readFileSync(file, 'utf8');

        // Only process files that reference Colors from the theme system.
        const usesStatic = /import\s*\{[^}]*\bColors\s+as\s+StaticColors\b[^}]*\}\s*from\s*['"][^"']*theme['"]/.test(src);
        const usesPlain = /import\s*\{[^}]*\bColors\b[^}]*\}\s*from\s*['"][^"']*theme['"]/.test(src) && !usesStatic;
        if (!usesPlain && !usesStatic) continue;
        // Files that declare their own local `Colors` (e.g. from dynamicTheme)
        // and do not import it from theme as `Colors`: only StaticColors refs are safe.
        const localColorsVar = /(?:const|let)\s+Colors\s*=/.test(src);
        const identifier = usesStatic ? 'StaticColors' : (localColorsVar ? null : 'Colors');
        if (!identifier) continue;

        let count = 0;
        let out = src;
        for (const [hex, token] of Object.entries(TOKENS)) {
            const re = new RegExp(`(['"])${hex}\\1`, 'gi');
            out = out.replace(re, () => { count++; return token.replace('Colors.', `${identifier}.`); });
        }

        if (count > 0) {
            fs.writeFileSync(file, out);
            totalReplacements += count;
            filesChanged++;
            perFile.push(`${count}\t${file}`);
        }
    }
}

console.log(`Files changed: ${filesChanged}`);
console.log(`Literals replaced: ${totalReplacements}`);
console.log(perFile.sort((a, b) => parseInt(b) - parseInt(a)).join('\n'));
