// Resolves the token spec against the six probe theme dumps and writes the committed tokens.json, the artifact's
// tokens.json. Usage: node build.mjs <scratchpad>
// The probe dumps it reads are not tracked: a regeneration runs from the research scratchpad only.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GROUPS, TOKENS } from './spec.mjs';

const S = process.argv[2];
const NOW = process.argv[3] ?? new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const THEMES = [
    ['dark-modern', 'Dark Modern'], ['light-modern', 'Light Modern'], ['dark-high-contrast', 'Dark High Contrast'],
    ['light-high-contrast', 'Light High Contrast'], ['dark-2026', 'Dark 2026'], ['light-2026', 'Light 2026'],
];
const vars = Object.fromEntries(THEMES.map(([slug]) => [slug, JSON.parse(readFileSync(join(S, 'probe/out/themes', `${slug}.json`), 'utf8')).vars]));
// The Modern UI run dumped identical --vscode-* values (checked: 0 differences in all six themes).
for (const [slug] of THEMES) {
    const modern = JSON.parse(readFileSync(join(S, 'probe/out-modern/themes', `${slug}.json`), 'utf8')).vars;
    const diff = Object.keys({ ...modern, ...vars[slug] }).filter(k => modern[k] !== vars[slug][k]);
    if (diff.length) throw new Error(`${slug}: Modern UI dump differs in ${diff.length} keys`);
}
const byName = new Map(TOKENS.map(t => [t.name, t]));

/** Splits `var(--a, fallback)` into [name, fallback | undefined]; returns null for anything else. */
function parseVar(text) {
    const s = text.trim();
    if (!s.startsWith('var(') || !s.endsWith(')')) return null;
    const inner = s.slice(4, -1);
    let depth = 0;
    for (let i = 0; i < inner.length; i++) {
        const c = inner[i];
        if (c === '(') depth++;
        else if (c === ')') depth--;
        else if (c === ',' && depth === 0) return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()];
    }
    return [inner.trim(), undefined];
}

/** Resolves a CSS value in a theme and a look; returns { value, steps } where steps is the chain walked. */
function resolve(text, theme, look, steps = []) {
    const v = parseVar(text);
    if (!v) return { value: text.trim(), steps: [...steps, `literal ${text.trim()}`] };
    const [name, fallback] = v;
    if (name.startsWith('--vscode-')) {
        const got = vars[theme][name];
        if (got !== undefined && got !== '') return { value: got, steps: [...steps, `${name}`] };
        if (fallback === undefined) return { value: undefined, steps: [...steps, `${name} (unset, no fallback)`] };
        return resolve(fallback, theme, look, [...steps, `${name} (unset)`]);
    }
    if (name.startsWith('--nuiget-')) {
        const t = byName.get(name.slice('--nuiget-'.length));
        if (!t) throw new Error(`unknown token ${name}`);
        const src = look === 'modern' && t.modern ? t.modern : t.value;
        return resolve(src, theme, look, [...steps, name]);
    }
    throw new Error(`unexpected var ${name}`);
}

function toHex(value) {
    if (value === undefined) return undefined;
    const s = value.trim().toLowerCase();
    if (s === 'transparent') return '#00000000';
    if (/^#[0-9a-f]{3}$/.test(s)) return '#' + [...s.slice(1)].map(c => c + c).join('');
    if (/^#[0-9a-f]{6}$/.test(s)) return s;
    if (/^#[0-9a-f]{8}$/.test(s)) return s.endsWith('ff') ? s.slice(0, 7) : s;
    const m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/);
    if (m) {
        const h = n => Math.round(Number(n)).toString(16).padStart(2, '0');
        let a = m[4] === undefined ? 1 : (m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]));
        const rgb = '#' + h(m[1]) + h(m[2]) + h(m[3]);
        return a >= 1 ? rgb : rgb + h(a * 255);
    }
    throw new Error(`not a colour: ${value}`);
}

const resolvedTokens = TOKENS.map(t => {
    const entry = {
        name: `--nuiget-${t.name}`, kind: t.kind, group: t.group, value: t.value,
        ...(t.modern ? { modernValue: t.modern } : {}),
    };
    if (t.kind === 'color') {
        const role = parseVar(t.value)?.[0];
        entry.role = role && role.startsWith('--vscode-') ? role.replace('--vscode-', '').replace(/-/g, '.').replace(/^(\w+)\.(\w+)$/, '$1.$2') : null;
        entry.fallbackChain = chainOf(t.value);
        if (t.modern) entry.modernFallbackChain = chainOf(t.modern);
        entry.resolved = {};
        for (const [slug] of THEMES) {
            const c = resolve(t.value, slug, 'classic');
            const r = { hex: toHex(c.value), from: c.steps[c.steps.length - 1] };
            if (c.steps.length > 1) r.chain = c.steps;
            if (t.modern) {
                const m = resolve(t.modern, slug, 'modern');
                r.modernHex = toHex(m.value);
                r.modernFrom = m.steps[m.steps.length - 1];
            }
            entry.resolved[slug] = r;
        }
        if (t.forced) entry.forcedColors = t.forced;
    } else {
        const c = resolve(t.value, 'dark-modern', 'classic').value;
        const m = resolve(t.modern ?? t.value, 'dark-modern', 'modern').value;
        entry.resolved = t.modern ? { classic: c, modern: m } : { all: c };
        // Size tokens are identical in all six themes (rules-bound.json workbench.tokens; modern-ui.md §3); assert it.
        for (const [slug] of THEMES) {
            if (resolve(t.value, slug, 'classic').value !== c) throw new Error(`${t.name} differs in ${slug}`);
        }
    }
    entry.usage = t.usage;
    entry.rules = t.rules;
    return entry;
});

/** The var() chain of a value as a list of keys and the final literal. */
function chainOf(text) {
    const out = [];
    let cur = text;
    for (;;) {
        const v = parseVar(cur);
        if (!v) { out.push(cur.trim()); break; }
        out.push(v[0]);
        if (v[1] === undefined) break;
        cur = v[1];
    }
    return out;
}

for (const e of resolvedTokens) {
    if (e.role) {
        // role key as VS Code writes it: `--vscode-list-activeSelectionBackground` -> `list.activeSelectionBackground`.
        const raw = parseVar(e.value)[0].slice('--vscode-'.length);
        e.role = raw.replace(/-/, '.');
        if (!raw.includes('-')) e.role = raw;
    }
}

// ------------------------------------------------------------------ committed tokens.json
const committed = {
    $comment: [
        'nUIget Design System token reference (docs/design/tokens.json). Generated from the token spec of the design session; src/webview/shared/tokens.css was copied from the same spec at UX-P1.1 and is checked against this file.',
        'Schema: tokens[] has one entry per --nuiget-* custom property of the proposed src/webview/shared/tokens.css.',
        '  name: the custom property. kind: space | radius | size | type | weight | motion | opacity | z | color. group: the tokens.css section.',
        '  value: the declaration in :root (the classic look, and every host from the 1.90 floor below VS Code 1.139). modernValue: the declaration in :root[data-look="modern"] when Modern UI differs.',
        '  resolved (non-colour): { all } when both looks agree, else { classic, modern }, evaluated with the probe dumps of VS Code 1.142.0 (size tokens are identical in all six themes and both looks).',
        '  role (colour): the --vscode-* key the token stands for, written as VS Code writes it (list.activeSelectionBackground).',
        '  fallbackChain (colour): the keys tried in order and the final literal; modernFallbackChain when the Modern UI declaration differs.',
        '  resolved (colour): per theme slug { hex, from, chain?, modernHex?, modernFrom? }: hex is #rrggbb or #rrggbbaa (transparent = #00000000); from names the key that answered or "literal x"; chain lists the steps when a key was unset in that theme.',
        '  forcedColors: the system colour under @media (forced-colors: active). usage: where the token goes. rules: the DS-* ids it serves (docs/design/design-system.md).',
        'Source: probe/out/themes/<slug>.json and probe/out-modern/themes/<slug>.json (`vars`, VS Code 1.142.0, ExTester, 2026-10-22/23); the two runs differ in no --vscode-* value. Generator: docs/design/tools/spec.mjs (the token spec) and docs/design/tools/build.mjs (committed; docs/design/README.md). Regenerate the dumps with the probe test, then this file; never edit by hand.',
    ].join('\n'),
    version: 1,
    generated: NOW,
    host: { vscode: '1.142.0', probe: 'ExTester local run, macOS, DPR 2, classic look in probe/out, Modern UI in probe/out-modern' },
    themes: THEMES.map(([id, name]) => ({ id, name })),
    looks: {
        classic: ':root (default; every host below 1.139 and every host with workbench.experimental.modernUI false)',
        modern: ':root[data-look="modern"] (the host mirrors workbench.experimental.modernUI: true onto <html>; DS-LOOK-1)',
    },
    counts: {
        total: resolvedTokens.length,
        byKind: resolvedTokens.reduce((a, t) => ((a[t.kind] = (a[t.kind] ?? 0) + 1), a), {}),
        lookSwitched: resolvedTokens.filter(t => t.modernValue).length,
    },
    tokens: resolvedTokens,
};
writeFileSync(join(S, 'repo/docs/design/tokens.json'), JSON.stringify(committed, null, 2) + '\n');

// ------------------------------------------------------------------ artifact tokens.json (list shape)
const colourTokens = resolvedTokens.filter(t => t.kind === 'color').map(t => {
    const value = {};
    for (const [slug] of THEMES) {
        const r = t.resolved[slug];
        const hex = r.modernHex ?? r.hex;
        if (!hex) throw new Error(`${t.name} unresolved in ${slug}`);
        value[slug] = hex;
    }
    const lookNote = t.modernValue ? ` Modern UI value shown; classic uses ${t.role ?? t.fallbackChain[0]}.` : '';
    const unset = THEMES.filter(([slug]) => t.resolved[slug].chain && t.resolved[slug].chain.some(s => s.includes('(unset'))).map(([slug]) => slug);
    const unsetNote = unset.length ? ` Unset in ${unset.join(', ')}: falls back along ${t.fallbackChain.join(' -> ')}.` : '';
    return { name: t.name.replace('--nuiget-', ''), value, usage: `${t.role ? `Role ${t.role}. ` : ''}${t.usage}${lookNote}${unsetNote}` };
});
const plain = kind => resolvedTokens.filter(t => kind.includes(t.kind) && t.group !== 'type').map(t => ({
    name: t.name.replace('--nuiget-', ''),
    value: t.resolved.modern ?? t.resolved.all,
    usage: t.resolved.modern ? `${t.usage} Modern UI value shown; classic ${t.resolved.classic}.` : t.usage,
}));
const artifactTokens = {
    name: 'nUIget',
    version: 1,
    color: { themes: THEMES.map(([id, name]) => ({ id, name })), tokens: colourTokens },
    type: {
        fonts: [],
        families: {
            ui: "-apple-system, BlinkMacSystemFont, 'Segoe WPC', 'Segoe UI', system-ui, Ubuntu, 'Droid Sans', sans-serif",
            mono: "Menlo, Monaco, 'Courier New', monospace",
        },
        groups: [
            {
                name: 'UI', family: 'ui', styles: [
                    { name: 'heading-details', fontSize: '18px', lineHeight: '25.2px', fontWeight: 600, usage: 'Details title and dialog title (Heading2, DS-TYPE-7).' },
                    { name: 'title-panel', fontSize: '13px', lineHeight: '18.2px', fontWeight: 600, usage: 'Panel title (Body1 semibold, DS-TYPE-7).' },
                    { name: 'body', fontSize: '13px', lineHeight: '18.2px', fontWeight: 400, usage: 'Body text, inputs, selects, tabs (Body1, 1.4 line height, DS-TYPE-4).' },
                    { name: 'row-name', fontSize: '13px', lineHeight: '18.2px', fontWeight: 600, usage: 'Package name in a row (Extensions name 13px/600).' },
                    { name: 'group-header', fontSize: '13px', lineHeight: '22px', fontWeight: 600, usage: 'In-list group header (Direct packages, a project): body size, normal case (DS-TYPE-5).' },
                    { name: 'button', fontSize: '12px', lineHeight: '16px', fontWeight: 400, usage: 'Text button (Label1, line box 16, DS-HEIGHT-6).' },
                    { name: 'section-title', fontSize: '12px', lineHeight: '28px', fontWeight: 600, usage: 'Sidebar section title, Modern UI: 12/600 capitalized in a 28 px header. Classic: 11/700 uppercase in 22 px (DS-TYPE-5).' },
                    { name: 'meta', fontSize: '11px', lineHeight: '15.4px', fontWeight: 400, usage: 'Version, authors, description line (Body2, DS-TYPE-6).' },
                    { name: 'publisher', fontSize: '11px', lineHeight: '15.4px', fontWeight: 600, usage: 'Publisher or author emphasis (Extensions publisher 11px/600).' },
                    { name: 'badge', fontSize: '10px', lineHeight: '11px', fontWeight: 400, usage: 'Count and label badges, Modern UI (Label3). Classic 11 px (DS-HEIGHT-10).' },
                ],
            },
            {
                name: 'Code', family: 'mono', styles: [
                    { name: 'code', fontSize: '12px', lineHeight: '18px', fontWeight: 400, usage: 'README code. Size follows the editor font in the product; shown at 12 px here.' },
                ],
            },
        ],
    },
    spacing: { tokens: plain(['space']) },
    radius: { tokens: plain(['radius']) },
    size: { tokens: plain(['size']) },
};
// Name rule and uniqueness across families.
const names = [...artifactTokens.color.tokens, ...artifactTokens.spacing.tokens, ...artifactTokens.radius.tokens, ...artifactTokens.size.tokens, ...artifactTokens.type.groups.flatMap(g => g.styles)].map(t => t.name);
const bad = names.filter(n => !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(n));
const dup = names.filter((n, i) => names.indexOf(n) !== i);
if (bad.length || dup.length) throw new Error(`artifact names: bad ${bad} dup ${dup}`);
for (const t of artifactTokens.color.tokens) for (const v of Object.values(t.value)) if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(v)) throw new Error(`${t.name}: ${v}`);
writeFileSync(join(S, 'design/ds-artifact/project/tokens.json'), JSON.stringify(artifactTokens, null, 2) + '\n');


console.log(JSON.stringify(committed.counts));
console.log('artifact colour tokens', colourTokens.length, 'spacing', artifactTokens.spacing.tokens.length, 'radius', artifactTokens.radius.tokens.length, 'size', artifactTokens.size.tokens.length);
