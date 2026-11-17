// Writes the Design System artifact's `project/tokens.json` from `docs/design/tokens.json`.
// Usage: node docs/design/tools/artifact-tokens.mjs <docs/design/tokens.json> <current project/tokens.json> <out>
// The list families (color, spacing, radius, size) are regenerated; `type` is kept from the current page copy, since
// its styles are written from design-system.md §5 by hand. See docs/design/artifacts.md for the refresh procedure.
import fs from 'node:fs';

const [repoPath, pagePath, outPath] = process.argv.slice(2);
if (!repoPath || !pagePath || !outPath) {
    console.error('usage: node artifact-tokens.mjs <docs/design/tokens.json> <current project/tokens.json> <out>');
    process.exit(2);
}
const repo = JSON.parse(fs.readFileSync(repoPath, 'utf8'));
const page = JSON.parse(fs.readFileSync(pagePath, 'utf8'));
const FAMILY = { color: 'color', space: 'spacing', radius: 'radius', size: 'size' };
const out = {
    name: page.name,
    version: page.version,
    color: { themes: repo.themes, tokens: [] },
    type: page.type,
    spacing: { tokens: [] },
    radius: { tokens: [] },
    size: { tokens: [] },
};
const seen = new Set();
for (const token of repo.tokens) {
    const family = FAMILY[token.kind];
    if (!family) {
        continue;
    }
    const name = token.name.replace(/^--nuiget-/, '');
    if (seen.has(name)) {
        throw new Error(`duplicate token name ${name}`);
    }
    seen.add(name);
    let value;
    let usage;
    if (token.kind === 'color') {
        value = {};
        for (const theme of repo.themes) {
            const resolved = token.resolved[theme.id];
            value[theme.id] = resolved.modernHex ?? resolved.hex;
        }
        usage = (token.role ? `Role ${token.role}. ` : '') + token.usage;
        if (token.modernValue) {
            usage += ` Modern UI value shown; classic uses ${token.role}.`;
        }
        const unset = repo.themes.map(theme => theme.id).filter(id => 'chain' in token.resolved[id]);
        if (unset.length > 0) {
            const steps = token.resolved[unset[0]].chain.map(step => step.replace(/ \(unset\)$/, '').replace(/^literal /, ''));
            usage += ` Unset in ${unset.join(', ')}: falls back along ${steps.join(' -> ')}.`;
        }
    } else if ('all' in token.resolved) {
        value = token.resolved.all;
        usage = token.usage;
    } else {
        value = token.resolved.modern;
        usage = token.usage + (token.resolved.classic !== token.resolved.modern ? ` Modern UI value shown; classic ${token.resolved.classic}.` : '');
    }
    out[family].tokens.push({ name, value, usage });
}
fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.warn(`${outPath}: ${['color', 'spacing', 'radius', 'size'].map(family => `${family} ${out[family].tokens.length}`).join(', ')}`);
