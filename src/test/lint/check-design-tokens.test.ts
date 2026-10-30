import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALLOWANCE, blockOf, ruleDefects, ruleRows, tokenDefects, trackerStatuses } from '../../../scripts/check-design-tokens.mjs';

/** UX-P1.5: the design reference check on the tree and on planted defects. */
const CSS = `
/* A comment { --nuiget-a: wrong; } */
:root {
    --nuiget-a: var(--vscode-a, 1px);
    --nuiget-b: 2px;
    --nuiget-held: 24px;
}

:root[data-look="modern"] {
    --nuiget-b: 3px;
}

@media (forced-colors: active) {
    :root {
        --nuiget-a: Canvas;
    }
}
`;
const token = (name: string, value: string, more: Record<string, string> = {}) => ({ name, value, ...more });
const REFERENCE = { tokens: [token('--nuiget-a', 'var(--vscode-a, 1px)', { forcedColors: 'Canvas' }), token('--nuiget-b', '2px', { modernValue: '3px' }), token('--nuiget-held', '22px')] };
const OWNER = { '--nuiget-held': 'P9.9' };

describe('check-design-tokens', () => {
    it('the tree holds', () => {
        const reference = JSON.parse(readFileSync('docs/design/tokens.json', 'utf8')) as typeof REFERENCE;
        const tracker = readFileSync('docs/plans/STATUS-ux.md', 'utf8');
        expect(tokenDefects(reference, readFileSync('src/webview/shared/tokens.css', 'utf8'), trackerStatuses(tracker))).toEqual([]);
        const rows = ruleRows(readFileSync('docs/design/design-system.md', 'utf8'));
        expect(rows.length).toBeGreaterThan(0);
        expect(ruleDefects(rows)).toEqual([]);
        // Every allowance names an item the tracker knows.
        expect(Object.values(ALLOWANCE).filter(item => !trackerStatuses(tracker).has(item))).toEqual([]);
    });

    it('reads a block, comments left out, the media block through its nested root', () => {
        expect(blockOf(CSS, ':root {')?.get('--nuiget-a')).toBe('var(--vscode-a, 1px)');
        expect(blockOf(CSS, ':root[data-look="modern"] {')?.get('--nuiget-b')).toBe('3px');
        expect(blockOf(CSS, '@media (forced-colors: active) {')?.get('--nuiget-a')).toBe('Canvas');
        expect(blockOf(CSS, 'body.nothing {')).toBeUndefined();
    });

    it('accepts the reference and an allowed difference', () => {
        expect(tokenDefects(REFERENCE, CSS, new Map([['P9.9', 'open']]), OWNER)).toEqual([]);
    });

    it('finds a token that differs in any block, one that is absent and one the reference lacks', () => {
        const statuses = new Map([['P9.9', 'open']]);
        expect(tokenDefects(REFERENCE, CSS.replace('var(--vscode-a, 1px)', 'var(--vscode-a, 9px)'), statuses, OWNER)).toEqual(['--nuiget-a :root: tokens.css var(--vscode-a, 9px), tokens.json var(--vscode-a, 1px)']);
        expect(tokenDefects(REFERENCE, CSS.replace('--nuiget-b: 3px;', '--nuiget-b: 4px;'), statuses, OWNER)).toEqual(['--nuiget-b Modern UI: tokens.css 4px, tokens.json 3px']);
        expect(tokenDefects(REFERENCE, CSS.replace('--nuiget-a: Canvas;', '--nuiget-a: Field;'), statuses, OWNER)).toEqual(['--nuiget-a forced colours: tokens.css Field, tokens.json Canvas']);
        expect(tokenDefects(REFERENCE, CSS.replace('    --nuiget-b: 2px;\n', ''), statuses, OWNER)).toEqual(['--nuiget-b :root: tokens.css has none, tokens.json 2px']);
        expect(tokenDefects(REFERENCE, CSS.replace('--nuiget-b: 2px;', '--nuiget-b: 2px;\n    --nuiget-extra: 1px;'), statuses, OWNER)).toEqual(['--nuiget-extra :root: not in tokens.json']);
    });

    it('an allowance fails once the tokens agree, once its item is done, and for a token that is gone', () => {
        const open = new Map([['P9.9', 'open']]);
        expect(tokenDefects(REFERENCE, CSS.replace('--nuiget-held: 24px', '--nuiget-held: 22px'), open, OWNER)).toEqual(['--nuiget-held: tokens.css agrees with tokens.json, remove its allowance (P9.9)']);
        expect(tokenDefects(REFERENCE, CSS, new Map([['P9.9', 'done']]), OWNER)).toEqual(['--nuiget-held: its allowance names P9.9, which is done']);
        expect(tokenDefects(REFERENCE, CSS, open, { ...OWNER, '--nuiget-gone': 'P9.9' })).toEqual(['--nuiget-gone: an allowance for a token tokens.json does not have']);
    });

    it('reads the tracker row whatever its notes hold', () => {
        const statuses = trackerStatuses('| P1.1 | P1 | `tokens` | done | abc | 2026-10-30 | Notes \\| with a bar |\r\n| P1.5a | P1 | Item | open |  |  |  |\n| Rule | Helper |\n');
        expect([...statuses]).toEqual([['P1.1', 'done'], ['P1.5a', 'open']]);
    });

    it('reads the rules of section 1 only, and finds a repeated id and a rule without a measurement', () => {
        const markdown = ['', '## 1. Rules', '| Id | Rule | Measurement |', '| DS-A-1 | Rule | Lint \\| reads it |', '| DS-A-2 | Rule | — |', '| DS-A-1 | Rule |  |', '## 2. Other', '| DS-A-9 | Not a rule row | x |'].join('\n');
        const rows = ruleRows(markdown);
        expect(rows.map(row => row.id)).toEqual(['DS-A-1', 'DS-A-2', 'DS-A-1']);
        expect(ruleDefects(rows)).toEqual(['DS-A-2: no measurement line', 'DS-A-1: the id is repeated', 'DS-A-1: no measurement line']);
    });
});
