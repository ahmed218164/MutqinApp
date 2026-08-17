/**
 * scripts/convert-mushaf-webp.mjs
 *
 * Converts the 604 bundled mushaf page PNGs (palette-encoded, ~102MB) to
 * LOSSLESS WebP — identical pixels, typically 25–40% smaller on this kind
 * of flat-color text art. Output is written to assets/mushaf-webp/ first;
 * the caller decides whether to swap it in (keep PNGs untouched as backup).
 *
 * Usage: node scripts/convert-mushaf-webp.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SRC = path.resolve('assets/mushaf');
const DEST = path.resolve('assets/mushaf-webp');

if (!fs.existsSync(SRC)) {
    console.error(`Source folder not found: ${SRC}`);
    process.exit(1);
}
fs.mkdirSync(DEST, { recursive: true });

const files = fs.readdirSync(SRC).filter(f => /^a\d+\.png$/.test(f)).sort(
    (a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1))
);
console.log(`Converting ${files.length} pages…`);

let srcBytes = 0;
let dstBytes = 0;
let mismatched = 0;
const report = [];

async function run() {
    for (let i = 0; i < files.length; i++) {
        const name = files[i];
        const srcPath = path.join(SRC, name);
        const dstPath = path.join(DEST, name.replace(/\.png$/, '.webp'));

        const srcBuf = fs.readFileSync(srcPath);
        const outBuf = await sharp(srcBuf, { failOn: 'none' })
            .webp({ lossless: true, effort: 6 })
            .toBuffer();

        // Sanity check: dimensions must match exactly (lossless pixels).
        const [srcMeta, dstMeta] = await Promise.all([
            sharp(srcBuf).metadata(),
            sharp(outBuf).metadata(),
        ]);
        if (srcMeta.width !== dstMeta.width || srcMeta.height !== dstMeta.height) {
            mismatched++;
            console.warn(`  !! dimension mismatch on ${name} — keeping output anyway`);
        }

        fs.writeFileSync(dstPath, outBuf);
        srcBytes += srcBuf.length;
        dstBytes += outBuf.length;

        if ((i + 1) % 100 === 0) {
            console.log(`  ${i + 1}/${files.length} done…`);
        }
    }

    const saved = ((1 - dstBytes / srcBytes) * 100).toFixed(1);
    console.log('──────────────────────────────');
    console.log(`Pages converted : ${files.length}`);
    console.log(`Dimension issues: ${mismatched}`);
    console.log(`PNG total        : ${(srcBytes / 1048576).toFixed(1)} MB`);
    console.log(`WebP total       : ${(dstBytes / 1048576).toFixed(1)} MB`);
    console.log(`Saved            : ${saved}%`);
    console.log(report.length ? report.join('\n') : '');
}

run().catch(err => {
    console.error('Conversion failed:', err);
    process.exit(1);
});
