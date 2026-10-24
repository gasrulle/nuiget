// Compares the capture suite's webview crops with their goldens, one `[diff]` line per crop:
//   node scripts/compare-goldens.mjs <screenshots dir> [--golden <dir>] [--diff <dir>]
// Adopts a green CI run's crops as goldens (their sidecars beside them, `index.json` recording status, run and the
// sha256 of each PNG and its sidecar, whose masks the diff applies):
//   node scripts/compare-goldens.mjs --adopt <screenshots dir> --run <run id> --status baseline|approved [--golden <dir>]
//
// UX-P0.15 (plan MS-9; H27, H76, H78). A crop is `<state>.<theme>.<width>.png` at the root of the screenshots folder with
// its sidecar `<state>.<theme>.<width>.json` (`src/test/ui/v2/golden.ts`): the state's masks as rectangles, its tolerance
// in percent and a text-metrics fingerprint. A PNG without a sidecar, at a device pixel ratio other than 1, or wider than
// its name says (an uncropped window PNG) is refused: goldens are CI-to-CI only. The diff paints the union of the crop's
// and the golden's masks as ignored, then counts mismatched pixels with pixelmatch (threshold 0.1, anti-aliasing
// ignored). A fingerprint that differs from the golden's (another font, host or VS Code) is printed beside the count: such
// a diff is not a regression signal. The comparison is informational: the exit code is 0 unless the usage is wrong or an
// adopted file is refused. The default golden folder is `src/test/ui/v2/golden`.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GOLDEN_DIR = path.join(ROOT, 'src/test/ui/v2/golden');

/** pixelmatch's options (plan P0.15): the perceptual threshold and anti-aliased pixels left out. */
export const MATCH = { threshold: 0.1, includeAA: false };

/** The fingerprint keys a golden and a crop must share for a diff to mean a regression. */
const FINGERPRINT_KEYS = ['fontFamily', 'font', 'referenceWidth', 'dpr', 'vscode', 'chromium', 'image'];

/** `<state>.<theme>.<width>.png`, the theme part `<theme>` or `<theme>-classic`; undefined for any other name. */
export function parseCapture(file) {
    const match = /^([a-z0-9-]+)\.([a-z0-9-]+)\.(\d+)\.png$/.exec(file);
    return match ? { state: match[1], theme: match[2], width: Number(match[3]) } : undefined;
}

/** A crop and its sidecar from a folder; the sidecar is undefined when it is missing. */
export function readCapture(dir, file) {
    const png = PNG.sync.read(readFileSync(path.join(dir, file)));
    const sidecarPath = path.join(dir, file.replace(/\.png$/, '.json'));
    const sidecar = existsSync(sidecarPath) ? JSON.parse(readFileSync(sidecarPath, 'utf8')) : undefined;
    return { file, png, sidecar };
}

/** Why a PNG cannot be compared or adopted (not a CI crop), or undefined. */
export function refusal(capture) {
    const name = parseCapture(capture.file);
    if (name === undefined) {
        return 'not a <state>.<theme>.<width>.png name';
    }
    if (capture.sidecar === undefined) {
        return 'no sidecar';
    }
    if (capture.sidecar.fingerprint?.dpr !== 1) {
        return `DPR ${capture.sidecar.fingerprint?.dpr}, not 1: goldens are CI-to-CI only`;
    }
    if (capture.png.width !== name.width) {
        return `${capture.png.width} px wide, not ${name.width}: not a crop`;
    }
    return undefined;
}

/** One value per pixel, non-zero inside any of the rectangles: pixelmatch's `ignoreMask`. */
export function maskOf(width, height, rects) {
    const mask = new Uint8Array(width * height);
    for (const rect of rects) {
        for (let y = Math.max(0, rect.y); y < Math.min(height, rect.y + rect.h); y++) {
            mask.fill(1, y * width + Math.max(0, rect.x), y * width + Math.min(width, rect.x + rect.w));
        }
    }
    return mask;
}

const rectsOf = sidecar => (sidecar?.masks ?? []).flatMap(mask => mask.rects);

/** The fingerprint keys whose values differ, as `key a → b`. */
export function fingerprintChanges(capture, golden) {
    return FINGERPRINT_KEYS
        .filter(key => capture.sidecar?.fingerprint?.[key] !== golden.sidecar?.fingerprint?.[key])
        .map(key => `${key} ${golden.sidecar?.fingerprint?.[key]} → ${capture.sidecar?.fingerprint?.[key]}`);
}

/** A crop against its golden: mismatched pixels, their share, the verdict against the crop's tolerance, the diff image. */
export function compare(capture, golden) {
    const { width, height } = capture.png;
    const tolerance = capture.sidecar?.tolerance ?? 0;
    const changes = fingerprintChanges(capture, golden);
    if (golden.png.width !== width || golden.png.height !== height) {
        return { size: `${width}x${height} against the golden's ${golden.png.width}x${golden.png.height}`, tolerance, changes, pass: false };
    }
    const ignoreMask = maskOf(width, height, [...rectsOf(capture.sidecar), ...rectsOf(golden.sidecar)]);
    const diff = new PNG({ width, height });
    const pixels = pixelmatch(capture.png.data, golden.png.data, diff.data, width, height, { ...MATCH, ignoreMask });
    const masked = ignoreMask.reduce((sum, value) => sum + (value === 0 ? 0 : 1), 0);
    const percent = (pixels / (width * height)) * 100;
    return { pixels, percent, masked, tolerance, changes, pass: percent <= tolerance, diff };
}

/** The one line of plan section 2.8 step 3: `[diff] <capture>: <n> px (<pct> %, tolerance <t> %)`. */
export function formatDiff(name, result) {
    const suffix = `${result.changes.length > 0 ? `; fingerprint differs: ${result.changes.join(', ')}` : ''}`;
    if (result.size !== undefined) {
        return `[diff] ${name}: size ${result.size} (tolerance ${result.tolerance} %, above)${suffix}`;
    }
    const masked = result.masked > 0 ? `, ${result.masked} px masked` : '';
    return `[diff] ${name}: ${result.pixels} px (${result.percent.toFixed(3)} %, tolerance ${result.tolerance} %${masked}, ${result.pass ? 'within' : 'above'})${suffix}`;
}

const crops = dir => readdirSync(dir).filter(file => file.endsWith('.png') && parseCapture(file) !== undefined).sort();
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');

/** The sha256 of a text file with its line ends as LF: the Windows checkout writes the sidecars with CRLF. */
export const textSha256 = file => createHash('sha256').update(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).digest('hex');

/**
 * Compares every crop of `dir`; returns the lines and the counts. Writes a diff PNG per mismatching crop into `diffDir`.
 * @param {string} dir
 * @param {string} [goldenDir]
 * @param {string} [diffDir]
 */
export function compareAll(dir, goldenDir = GOLDEN_DIR, diffDir) {
    const lines = [];
    const counts = { compared: 0, zero: 0, above: 0, noGolden: 0, refused: 0 };
    for (const file of crops(dir)) {
        const name = file.replace(/\.png$/, '');
        try {
            compareOne(dir, goldenDir, diffDir, file, name, lines, counts);
        } catch (error) {
            // A truncated crop, golden or sidecar is reported, never thrown: the comparison stays informational.
            counts.refused++;
            lines.push(`[diff] ${name}: error (${error instanceof Error ? error.message : String(error)})`);
        }
    }
    lines.push(`[diff] summary: ${counts.compared} compared, ${counts.zero} at 0 px, ${counts.above} above tolerance, ${counts.noGolden} without a golden, ${counts.refused} refused`);
    return { lines, counts };
}

/** One crop of `compareAll`: its line and its counts. */
function compareOne(dir, goldenDir, diffDir, file, name, lines, counts) {
    const capture = readCapture(dir, file);
    const refused = refusal(capture);
    if (refused !== undefined) {
        counts.refused++;
        lines.push(`[diff] ${name}: refused (${refused})`);
        return;
    }
    if (!existsSync(path.join(goldenDir, file))) {
        counts.noGolden++;
        lines.push(`[diff] ${name}: no golden`);
        return;
    }
    const result = compare(capture, readCapture(goldenDir, file));
    counts.compared++;
    counts.zero += result.pixels === 0 ? 1 : 0;
    counts.above += result.pass ? 0 : 1;
    lines.push(formatDiff(name, result));
    if (diffDir !== undefined && result.diff !== undefined && result.pixels > 0) {
        mkdirSync(diffDir, { recursive: true });
        writeFileSync(path.join(diffDir, file), PNG.sync.write(result.diff));
    }
}

/** Copies every crop of `dir` and its sidecar into the golden folder and records them in its `index.json`. */
export function adopt(dir, goldenDir, { run, status }) {
    const files = crops(dir);
    const refused = files.map(file => [file, refusal(readCapture(dir, file))]).filter(([, reason]) => reason !== undefined);
    if (refused.length > 0) {
        throw new Error(`refused: ${refused.map(([file, reason]) => `${file} (${reason})`).join('; ')}`);
    }
    mkdirSync(goldenDir, { recursive: true });
    const indexPath = path.join(goldenDir, 'index.json');
    const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : {};
    for (const file of files) {
        copyFileSync(path.join(dir, file), path.join(goldenDir, file));
        copyFileSync(path.join(dir, file.replace(/\.png$/, '.json')), path.join(goldenDir, file.replace(/\.png$/, '.json')));
        index[file] = { status, run, sha256: sha256(path.join(goldenDir, file)), sidecarSha256: textSha256(path.join(goldenDir, file.replace(/\.png$/, '.json'))) };
    }
    const sorted = Object.fromEntries(Object.keys(index).sort().map(key => [key, index[key]]));
    writeFileSync(indexPath, JSON.stringify(sorted, null, 2) + '\n');
    return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const option = name => {
        const at = args.indexOf(name);
        return at < 0 ? undefined : args[at + 1];
    };
    const goldenDir = path.resolve(option('--golden') ?? GOLDEN_DIR);
    const adopting = option('--adopt');
    if (adopting !== undefined) {
        const run = option('--run');
        const status = option('--status');
        if (run === undefined || (status !== 'baseline' && status !== 'approved')) {
            console.error('usage: node scripts/compare-goldens.mjs --adopt <screenshots dir> --run <run id> --status baseline|approved [--golden <dir>]');
            process.exit(2);
        }
        try {
            const files = adopt(path.resolve(adopting), goldenDir, { run, status });
            console.log(`compare-goldens: ${files.length} goldens adopted from run ${run} as ${status}`);
        } catch (error) {
            console.error(`compare-goldens: ${error.message}`);
            process.exit(1);
        }
        process.exit(0);
    }
    const dir = args.find(arg => !arg.startsWith('--') && arg !== option('--golden') && arg !== option('--diff'));
    if (dir === undefined) {
        console.error('usage: node scripts/compare-goldens.mjs <screenshots dir> [--golden <dir>] [--diff <dir>]');
        process.exit(2);
    }
    const diffDir = option('--diff');
    const { lines } = compareAll(path.resolve(dir), goldenDir, diffDir === undefined ? undefined : path.resolve(diffDir));
    for (const line of lines) {
        console.log(line);
    }
}
