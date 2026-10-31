// The design reference against the tree (UX-P1.5): `node scripts/check-design-tokens.mjs` fails when a token of
// `docs/design/tokens.json` is not in `src/webview/shared/tokens.css` with the same alias and fallback, in each of its
// blocks, or when a rule id of `docs/design/design-system.md` is repeated or has no measurement line. A token its owning
// item re-values later is an allowance below: the entry fails once the tokens agree or its item is `done`, so the
// item removes it (design-advisor ruling of UX-P1.1). Rule ids cited elsewhere are `npm run docs:check`'s.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Reference values that wait for the item that builds what uses them: token → that item.
 * @type {Record<string, string>}
 */
export const ALLOWANCE = {
    '--nuiget-row-height-compact': 'P3.7a',
    '--nuiget-color-scrim': 'P3.5',
    '--nuiget-duration-normal': 'P4.5',
};

const LOOK_BLOCK = ':root[data-look="modern"] {';
const FORCED_BLOCK = '@media (forced-colors: active) {';

/** The declarations of the first block opened by `opener`, as `name → value`; undefined when no such block exists. */
export function blockOf(css, opener) {
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\r\n/g, '\n');
    const start = code.indexOf(opener);
    if (start < 0) {
        return undefined;
    }
    const body = code.slice(code.indexOf('{', start + opener.length - 1) + 1);
    // The media block holds one nested `:root {`.
    const inner = opener.startsWith('@media') ? body.slice(body.indexOf('{') + 1) : body;
    return new Map([...inner.slice(0, inner.indexOf('}')).matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]));
}

/** The statuses of the tracker's rows, by item id. */
export function trackerStatuses(markdown) {
    return new Map(markdown.split(/\r?\n/).map(line => /^\| (P[0-9][^ |]*) \| [^|]* \| .* \| (open|in-progress|done|blocked|skipped|owner action) \| [^|]* \| [^|]* \| /.exec(line)).filter(Boolean).map(match => [match[1], match[2]]));
}

/** One defect per line: every token against `tokens.css`, the allowance against the tracker. */
export function tokenDefects(reference, css, statuses, allowance = ALLOWANCE) {
    const root = blockOf(css, ':root {') ?? new Map();
    const look = blockOf(css, LOOK_BLOCK) ?? new Map();
    const forced = blockOf(css, FORCED_BLOCK) ?? new Map();
    const defects = [];
    const compare = (name, block, label, expected) => {
        const actual = block.get(name);
        if (actual !== expected) {
            defects.push(`${name} ${label}: tokens.css ${actual ?? 'has none'}, tokens.json ${expected ?? 'has none'}`);
        }
    };
    for (const token of reference.tokens) {
        const owner = allowance[token.name];
        if (owner !== undefined) {
            if (root.get(token.name) === token.value) {
                defects.push(`${token.name}: tokens.css agrees with tokens.json, remove its allowance (${owner})`);
            }
            if (!root.has(token.name)) {
                defects.push(`${token.name} :root: tokens.css has none`);
            }
            if (statuses.get(owner) === 'done') {
                defects.push(`${token.name}: its allowance names ${owner}, which is done`);
            }
        } else {
            compare(token.name, root, ':root', token.value);
        }
        compare(token.name, look, 'Modern UI', token.modernValue);
        compare(token.name, forced, 'forced colours', token.forcedColors);
    }
    const names = new Set(reference.tokens.map(token => token.name));
    for (const [label, block] of [[':root', root], ['Modern UI', look], ['forced colours', forced]]) {
        for (const name of block.keys()) {
            if (!names.has(name)) {
                defects.push(`${name} ${label}: not in tokens.json`);
            }
        }
    }
    for (const name of Object.keys(allowance)) {
        if (!names.has(name)) {
            defects.push(`${name}: an allowance for a token tokens.json does not have`);
        }
    }
    return defects;
}

/**
 * The rule rows of the Design System's §1.
 * @returns {Array<{ id: string; measurement: string }>}
 */
export function ruleRows(markdown) {
    const text = markdown.replace(/\r\n/g, '\n');
    const start = text.indexOf('\n## 1. Rules');
    const end = text.indexOf('\n## 2.', start);
    return text.slice(start, end).split('\n').filter(line => line.startsWith('| DS-')).map(line => {
        const cells = line.split(/(?<!\\)\|/).map(cell => cell.trim());
        return { id: cells[1], measurement: cells[3] ?? '' };
    });
}

/** One defect per line: a repeated rule id, or a rule without a measurement line. */
export function ruleDefects(rows) {
    const seen = new Set();
    const defects = [];
    for (const { id, measurement } of rows) {
        if (seen.has(id)) {
            defects.push(`${id}: the id is repeated`);
        }
        seen.add(id);
        if (measurement === '' || measurement === '—') {
            defects.push(`${id}: no measurement line`);
        }
    }
    return defects;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const read = file => readFileSync(path.join(ROOT, file), 'utf8');
    const reference = JSON.parse(read('docs/design/tokens.json'));
    const rows = ruleRows(read('docs/design/design-system.md'));
    const defects = [...tokenDefects(reference, read('src/webview/shared/tokens.css'), trackerStatuses(read('docs/plans/STATUS-ux.md'))), ...ruleDefects(rows)];
    for (const defect of defects) {
        console.error(`check-design-tokens: ${defect}`);
    }
    console.log(`check-design-tokens — ${reference.tokens.length} tokens (${Object.keys(ALLOWANCE).length} allowed to differ), ${rows.length} rules; ${defects.length} finding(s).`);
    process.exit(defects.length > 0 ? 1 : 0);
}
