// The before/after page of an owner checkpoint (plan Appendix C, touchpoint 5):
//   node scripts/contact-sheet.mjs <checkpoint> --before docs/ux/reference-2.0 --after captures/<run-id> [--tree <sha>] [--out <dir>]
//
// UX-P2.10, UX-P7.4. Per named state of the checkpoint (`slice-1`: the Installed tab; `release`: every state) it shows each
// capture of `--after` beside the capture of the same name in `--before` at 1:1, the judge verdict from
// `docs/plans/judge-log/` and the measurement summary from the run's logs beneath, and one question, "better" or "not
// better". It writes `<out>/<checkpoint>.html`, one file with the images inside, and `<out>/<checkpoint>.png`, the same pairs
// in the same order as pixels alone (no text: this script has no way to draw a font). A capture without a "before" says
// so; nothing stands in for it, and no image is ever scaled. It reads only what CI wrote and the committed judge logs.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

export { PNG };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const USAGE = 'usage: node scripts/contact-sheet.mjs <checkpoint> --before <dir> --after <dir> [--tree <sha>] [--out <dir>]';

/** The named states each checkpoint shows. */
export const CHECKPOINTS = {
    'slice-1': /^main-(installed|transitive)-/,
    release: /./,
};

const GUTTER = 24;
const SHEET_BG = 0x80;

/** @param {string[]} argv */
export function parseArgs(argv) {
    const [checkpoint, ...rest] = argv;
    if (checkpoint === undefined || !(checkpoint in CHECKPOINTS)) {
        throw new Error(`${USAGE}\n<checkpoint> is one of ${Object.keys(CHECKPOINTS).join(', ')}`);
    }
    const values = { '--out': path.join(ROOT, 'docs/design/contact-sheets') };
    for (let i = 0; i < rest.length; i += 2) {
        if (!['--before', '--after', '--tree', '--out'].includes(rest[i]) || rest[i + 1] === undefined) {
            throw new Error(`${USAGE}\nunknown or incomplete argument ${rest[i]}`);
        }
        values[rest[i]] = rest[i + 1];
    }
    if (values['--before'] === undefined || values['--after'] === undefined) {
        throw new Error(`${USAGE}\n--before and --after are required`);
    }
    return { checkpoint, before: values['--before'], after: values['--after'], tree: values['--tree'], out: values['--out'] };
}

const stateOf = fileName => fileName.split('.')[0];
const cellOf = fileName => fileName.replace(/\.png$/, '');

/** A state's cells, the primary look and theme first, then the widest first; a cell's name ends in its width. */
function compareCells(a, b) {
    const [, themeA, widthA] = cellOf(a).split('.');
    const [, themeB, widthB] = cellOf(b).split('.');
    const rank = theme => (theme === 'dark-modern' ? 0 : 1);
    return rank(themeA) - rank(themeB) || themeA.localeCompare(themeB) || Number(widthB) - Number(widthA);
}

/**
 * The checkpoint's states and cells. Only names of the form `<state>.<theme>.<width>.png` count: the two round-1 crops of
 * the reference set are named otherwise and pair with nothing.
 * @param {string} checkpoint
 * @param {string[]} afterNames
 * @param {string[]} beforeNames
 */
export function pairCells(checkpoint, afterNames, beforeNames) {
    const isCell = name => /^[a-z0-9-]+\.[a-z0-9-]+\.\d+\.png$/.test(name);
    const before = new Set(beforeNames.filter(isCell));
    const states = new Map();
    for (const name of afterNames.filter(isCell).filter(file => CHECKPOINTS[checkpoint].test(stateOf(file)))) {
        const cells = states.get(stateOf(name)) ?? [];
        cells.push({ file: name, cell: cellOf(name), hasBefore: before.has(name) });
        states.set(stateOf(name), cells);
    }
    return [...states.keys()].sort().map(state => ({
        state,
        cells: states.get(state).sort((a, b) => compareCells(a.file, b.file)),
    }));
}

/**
 * The state's latest verdict: logs in execution order (the tracker's), a log's runs in order, the last run whose captures
 * name the state. A state no panel judged says so.
 * @param {string} state
 * @param {Array<{ item: string, runs: any[] }>} logs
 */
export function judgeVerdict(state, logs) {
    for (const log of [...logs].reverse()) {
        for (const run of [...log.runs].reverse()) {
            if (run.captures?.[state] === undefined) {
                continue;
            }
            const findings = (run.findings ?? []).filter(finding => finding.state === state);
            const refuted = (run.refuted ?? []).filter(finding => finding.state === state).length;
            const blocking = findings.filter(finding => finding.severity === 'blocking').length;
            const owners = [...new Set(findings.map(finding => finding.owner).filter(Boolean))].sort();
            const rules = [...new Set(findings.map(finding => finding.rule).filter(rule => rule && rule !== 'judge-only'))].sort();
            return {
                judged: true,
                text: `Judge (UX-${log.item}, run ${run.runId}): ${findings.length} standing, ${blocking} blocking, ${refuted} refuted`
                    + (rules.length > 0 ? `; rules ${rules.join(', ')}` : '')
                    + (owners.length > 0 ? `; owners ${owners.join(', ')}` : ''),
            };
        }
    }
    return { judged: false, text: 'Judge: no panel scored this state' };
}

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The measurement summary of a state, counted from the run's logs.
 * @param {string} state
 * @param {string} log the run's `ui-output.txt` and `ui-classic-output.txt`
 */
export function measurementSummary(state, log) {
    const name = escapeRegExp(state);
    const measure = new RegExp(`^\\[measure\\] [^@ ]+@${name}(?:/[^:]*)?:`);
    const lines = log.split(/\r?\n/);
    const measured = lines.filter(line => measure.test(line));
    const hard = measured.filter(line => line.endsWith('(hard)')).length;
    const owners = [...new Set(measured.map(line => /\(pending ([^)]+)\)$/.exec(line)?.[1]).filter(Boolean))].sort();
    const pending = measured.filter(line => /\(pending [^)]+\)$/.test(line)).length;
    const parts = [`Measurements: ${hard} hard; ${pending} pending${owners.length > 0 ? ` (${owners.join(', ')})` : ''}`];
    const axe = lines.find(line => line.startsWith(`[axe] ${state}: `) && line.includes('violations,'));
    if (axe !== undefined) {
        parts.push(axe.slice('[axe] '.length).replace(`${state}: `, 'axe: ').replace(/ \(.*$/, ''));
    }
    const aria = lines.find(line => line.startsWith(`[aria] ${state}: `));
    if (aria !== undefined) {
        parts.push(aria.slice('[aria] '.length).replace(`${state}: `, 'ARIA: '));
    }
    return parts.join('. ');
}

/** The cell's self-regression line of `ui-diff.txt`, without its tag and name. */
export function diffLine(cell, diffLog) {
    const line = diffLog.split(/\r?\n/).find(entry => entry.startsWith(`[diff] ${cell}: `));
    return line === undefined ? 'no golden line' : line.slice(`[diff] ${cell}: `.length);
}

const escapeHtml = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

function figure(label, image) {
    const size = `width="${image.width}" height="${image.height}"`;
    return `<figure><figcaption>${escapeHtml(label)}<br><code>${image.sha256}</code></figcaption>`
        + `<img ${size} alt="${escapeHtml(label)}" src="data:image/png;base64,${image.bytes.toString('base64')}"></figure>`;
}

function missingFigure(after) {
    return `<figure><figcaption>Before<br>No 2.0 capture: this state was not captured on the 2.0 tree</figcaption>`
        + `<div class="missing" data-testid="no-before" style="--w:${after.width}px;--h:${after.height}px"></div></figure>`;
}

const STYLE = `
:root { color-scheme: light dark; --bg: #f7f7f7; --fg: #1f1f1f; --muted: #5c5c5c; --line: #c8c8c8; --answer: #ffffff; }
@media (prefers-color-scheme: dark) { :root { --bg: #181818; --fg: #e4e4e4; --muted: #a6a6a6; --line: #3c3c3c; --answer: #242424; } }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 14px/1.5 system-ui, sans-serif; }
h1 { font-size: 20px; margin: 0 0 8px; } h2 { font-size: 16px; margin: 0 0 8px; }
section { border-top: 1px solid var(--line); padding: 24px 0; }
.pair { display: flex; gap: 24px; margin: 16px 0 4px; width: max-content; }
.scroll { overflow-x: auto; }
figure { margin: 0; } figcaption { color: var(--muted); font-size: 12px; margin-bottom: 4px; }
code { font-size: 11px; word-break: break-all; }
img { display: block; max-width: none; image-rendering: pixelated; }
.missing { width: var(--w); height: var(--h); border: 1px dashed var(--line); box-sizing: border-box; }
.facts { color: var(--muted); margin: 4px 0; }
.answer { background: var(--answer); border: 1px solid var(--line); padding: 8px 12px; margin-top: 12px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
.answer strong { margin-right: 8px; }
textarea { width: 100%; max-width: 640px; height: 160px; font: 12px monospace; box-sizing: border-box; }
button { font: inherit; padding: 4px 12px; margin-top: 8px; }
`;

// A per-viewer draft: the answers count once they are pasted back, so a blocked store only loses the draft.
const SCRIPT = `
const key = 'nuiget-contact-sheet-' + document.body.dataset.checkpoint;
const read = () => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } };
const write = value => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* the draft stays on this page */ } };
const answers = read();
const output = document.getElementById('answers');
const render = () => {
    const names = [...new Set([...document.querySelectorAll('input[type=radio]')].map(input => input.dataset.state))];
    const done = names.filter(name => answers[name]).length;
    document.getElementById('progress').textContent = done + ' of ' + names.length + ' answered';
    output.value = names.map(name => name + ': ' + (answers[name] || '-')).join('\\n');
};
for (const input of document.querySelectorAll('input[type=radio]')) {
    input.checked = answers[input.dataset.state] === input.value;
    input.addEventListener('change', () => { answers[input.dataset.state] = input.value; write(answers); render(); });
}
document.getElementById('copy').addEventListener('click', () => { output.select(); navigator.clipboard?.writeText(output.value); });
render();
`;

/**
 * @param {{ checkpoint: string, runId: string, tree?: string, states: Array<{ state: string, verdict: string, summary: string,
 *   cells: Array<{ cell: string, diff: string, before?: object, after: object }> }> }} model
 */
export function renderHtml(model) {
    const sections = model.states.map(({ state, verdict, summary, cells }) => {
        const pairs = cells.map(({ cell, diff, before, after }) => `<h3 class="facts">${escapeHtml(cell)} (${after.width}×${after.height}); against its golden: ${escapeHtml(diff)}</h3>`
            + `<div class="scroll"><div class="pair">${before === undefined ? missingFigure(after) : figure('Before (2.0)', before)}${figure('After', after)}</div></div>`).join('\n');
        const radio = value => `<label><input type="radio" name="${escapeHtml(state)}" data-state="${escapeHtml(state)}" value="${value}"> ${value}</label>`;
        // A state without any "before" has nothing to be better than: it is shown, and nothing is asked.
        const question = cells.some(cell => cell.before !== undefined)
            ? `<div class="answer"><strong>${escapeHtml(state)}</strong>${radio('better')}${radio('not better')}</div>`
            : '<p class="facts">Nothing to compare, so no question for this state.</p>';
        return `<section data-state="${escapeHtml(state)}"><h2>${escapeHtml(state)}</h2>\n${pairs}\n`
            + `<p class="facts">${escapeHtml(verdict)}</p><p class="facts">${escapeHtml(summary)}</p>${question}</section>`;
    }).join('\n');
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>nUIget ${escapeHtml(model.checkpoint)} before and after</title><style>${STYLE}</style></head>
<body data-checkpoint="${escapeHtml(model.checkpoint)}">
<h1>nUIget ${escapeHtml(model.checkpoint)}: before and after</h1>
<p>Each image is at 1:1, never scaled, so scroll sideways on a narrow window. After: CI run ${escapeHtml(model.runId)}${model.tree === undefined ? '' : ` on ${escapeHtml(model.tree)}`}. For each state with a 2.0 capture, answer the one question: better, or not better. Nothing else is asked of you. At the end, copy your answers and paste them into the session.</p>
${sections}
<section><h2>Your answers</h2><p id="progress" class="facts"></p><textarea id="answers" readonly aria-label="Your answers"></textarea><br><button id="copy" type="button">Copy answers</button></section>
<script>${SCRIPT}</script>
</body></html>
`;
}

/**
 * The pairs in page order as one PNG at 1:1: "before" on the left, "after" on the right, one row per cell; a cell without a
 * "before" leaves its place empty.
 * @param {Array<{ before?: { png: PNG }, after: { png: PNG } }>} rows
 */
export function composeSheet(rows) {
    const leftWidth = Math.max(...rows.map(row => row.before?.png.width ?? row.after.png.width));
    const rightWidth = Math.max(...rows.map(row => row.after.png.width));
    const height = rows.reduce((sum, row) => sum + Math.max(row.before?.png.height ?? 0, row.after.png.height) + GUTTER, GUTTER);
    const sheet = new PNG({ width: GUTTER * 3 + leftWidth + rightWidth, height });
    sheet.data.fill(SHEET_BG);
    for (let i = 3; i < sheet.data.length; i += 4) {
        sheet.data[i] = 0xff;
    }
    let y = GUTTER;
    for (const { before, after } of rows) {
        if (before !== undefined) {
            PNG.bitblt(before.png, sheet, 0, 0, before.png.width, before.png.height, GUTTER, y);
        }
        PNG.bitblt(after.png, sheet, 0, 0, after.png.width, after.png.height, GUTTER * 2 + leftWidth, y);
        y += Math.max(before?.png.height ?? 0, after.png.height) + GUTTER;
    }
    return sheet;
}

function loadImage(file) {
    const bytes = readFileSync(file);
    const png = PNG.sync.read(bytes);
    return { bytes, png, width: png.width, height: png.height, sha256: sha256(bytes) };
}

const readIfThere = file => (existsSync(file) ? readFileSync(file, 'utf8') : '');

/** The judge logs in the tracker's order, the order the items ran in. */
function loadJudgeLogs() {
    const dir = path.join(ROOT, 'docs/plans/judge-log');
    const names = new Set(readdirSync(dir).filter(name => name.endsWith('.json')).map(name => name.replace(/\.json$/, '')));
    const tracker = readFileSync(path.join(ROOT, 'docs/plans/STATUS-ux.md'), 'utf8');
    const order = [...tracker.matchAll(/^\| (P[0-9][^ |]*) \|/gm)].map(match => match[1]).filter(id => names.has(id));
    return order.map(id => JSON.parse(readFileSync(path.join(dir, `${id}.json`), 'utf8')));
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const states = pairCells(options.checkpoint, readdirSync(options.after), readdirSync(options.before));
    const logs = loadJudgeLogs();
    const log = readIfThere(path.join(options.after, 'ui-output.txt')) + '\n' + readIfThere(path.join(options.after, 'ui-classic-output.txt'));
    const diffLog = readIfThere(path.join(options.after, 'ui-diff.txt'));
    const rows = [];
    const model = states.map(({ state, cells }) => ({
        state,
        verdict: judgeVerdict(state, logs).text,
        summary: measurementSummary(state, log),
        cells: cells.map(({ file, cell, hasBefore }) => {
            const after = loadImage(path.join(options.after, file));
            const before = hasBefore ? loadImage(path.join(options.before, file)) : undefined;
            rows.push({ before, after });
            return { cell, diff: diffLine(cell, diffLog), before, after };
        }),
    }));
    mkdirSync(options.out, { recursive: true });
    const html = path.join(options.out, `${options.checkpoint}.html`);
    const png = path.join(options.out, `${options.checkpoint}.png`);
    writeFileSync(html, renderHtml({ checkpoint: options.checkpoint, runId: path.basename(path.resolve(options.after)), tree: options.tree, states: model }));
    const sheet = composeSheet(rows);
    writeFileSync(png, PNG.sync.write(sheet, { deflateLevel: 9 }));
    const missing = rows.filter(row => row.before === undefined).length;
    console.log(`[contact-sheet] ${options.checkpoint}: ${model.length} states, ${rows.length} cells, ${missing} without a 2.0 capture`);
    console.log(`[contact-sheet] ${path.relative(ROOT, html)} ${readFileSync(html).length} bytes; ${path.relative(ROOT, png)} ${sheet.width}x${sheet.height} ${readFileSync(png).length} bytes`);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        main();
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
