/**
 * scripts/codemod-colors-fix-jsx.mjs
 * Wraps bare `attr=Colors.token` JSX attributes (produced by the codemod)
 * in braces: attr={Colors.token}.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['app', 'components'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'to_take_in_review', 'modules']);

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
    }
    return out;
}

// attr=Colors.x[..] or attr=Colors.error — not already inside braces
const RE = /([A-Za-z_$][\w$]*)=((?:Static)?Colors\.(?:emerald|gold|neutral)\[\d{2,3}\]|(?:Static)?Colors\.(?:error|info|success|warning))(?![\w$])/g;

let total = 0;
for (const root of ROOTS) {
    const rootDir = path.resolve(root);
    if (!fs.existsSync(rootDir)) continue;
    for (const file of walk(rootDir)) {
        const src = fs.readFileSync(file, 'utf8');
        let count = 0;
        const out = src.replace(RE, (m, attr, token) => {
            count++;
            return `${attr}={${token}}`;
        });
        if (count) {
            fs.writeFileSync(file, out);
            total += count;
            console.log(`${count}\t${file}`);
        }
    }
}
console.log(`Wrapped: ${total}`);
