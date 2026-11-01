import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * a11y-hint-truthful (UX-P2.9a; interaction model §5, "every key is named in the hint of the list it works in"): a key a
 * list's hint names is one its file handles. Read from the source: a hint is description text no capture records.
 */
const ROOT = path.join(process.cwd(), 'src/webview');
const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
});
const product = walk(ROOT).filter(file => file.endsWith('.tsx') && !file.endsWith('.test.tsx') && !file.endsWith(`${path.sep}Listbox.tsx`));

/** Every string of a list's hint: the literal of its `hint=` or of the constant it names, both branches of a ternary. */
export function hintsOf(source: string): string[] {
    const hints: string[] = [];
    for (const match of source.matchAll(/\bhint=(?:"([^"]*)"|\{([\s\S]*?)\}\n)/g)) {
        if (match[1] !== undefined) {
            hints.push(match[1]);
            continue;
        }
        const named = /^\s*([A-Z_a-z]+)\s*$/.exec(match[2]);
        const expression = named ? new RegExp(`const ${named[1]} = ('(?:[^'\\\\]|\\\\.)*')`).exec(source)?.[1] ?? '' : match[2];
        hints.push(...[...expression.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(literal => literal[1]));
    }
    return hints;
}

/** What each key named in a hint needs in the file; "Shift+F10" needs a row with a menu context, here or in a row component it uses. */
export function hintProblems(hints: readonly string[], source: string, neighbours: string): string[] {
    const needs: ReadonlyArray<readonly [RegExp, RegExp, string]> = [
        [/Ctrl\+Enter/, /onSecondaryActivate=/, 'onSecondaryActivate'],
        [/(^|[^+])\bEnter\b/, /onActivate=|groups=/, 'onActivate or groups'],
        [/\bDelete\b/, /onDelete=/, 'onDelete'],
        [/\bSpace\b/, /selectedIds=/, 'selectedIds'],
        [/\bLeft\b|\bRight\b/, /groups=/, 'groups'],
        [/Shift\+F10/, /vscodeContext=/, 'vscodeContext'],
    ];
    return hints.flatMap(hint => needs.flatMap(([key, handler, name]) => {
        const haystack = name === 'vscodeContext' ? source + neighbours : source;
        return key.test(hint) && !handler.test(haystack) ? [`names ${key.source} without ${name}: ${hint}`] : [];
    }));
}

describe('a11y-hint-truthful (UX-P2.9a)', () => {
    const listing = product.filter(file => /<Listbox\b/.test(readFileSync(file, 'utf8')));

    it('reads every list of both surfaces', () => {
        expect(listing.length).toBeGreaterThanOrEqual(6);
        expect(listing.filter(file => hintsOf(readFileSync(file, 'utf8')).length === 0).map(file => path.relative(ROOT, file))).toEqual([]);
    });

    it('a key a hint names is a key its list handles', () => {
        const problems = listing.flatMap(file => {
            const source = readFileSync(file, 'utf8');
            // The row components a list imports from its own folder, or from a sibling feature: the file that renders its rows.
            const neighbours = [...source.matchAll(/from '(\.[^']+)'/g)].map(match => path.resolve(path.dirname(file), `${match[1]}.tsx`)).filter(other => product.includes(other)).map(other => readFileSync(other, 'utf8')).filter(other => !other.includes('<Listbox')).join('\n');
            return hintProblems(hintsOf(source), source, neighbours).map(problem => `${path.relative(ROOT, file)}: ${problem}`);
        });
        expect(problems).toEqual([]);
    });

    it('hintProblems reports a named key without its handler', () => {
        const hint = 'Enter updates it. Shift+F10 opens the actions menu.';
        expect(hintProblems([hint], 'onActivate={run}', '')).toEqual([expect.stringContaining('vscodeContext')]);
        expect(hintProblems([hint], 'onActivate={run}', '<Row vscodeContext={context}')).toEqual([]);
        expect(hintProblems(['Delete uninstalls it.'], '', '')).toEqual([expect.stringContaining('onDelete')]);
        expect(hintProblems(['Ctrl+Enter installs it.'], 'onSecondaryActivate={run}', '')).toEqual([]);
    });

    it('reads a named constant and both branches of a ternary', () => {
        expect(hintsOf("const HINT = 'One; two.';\n<Listbox\n hint={HINT}\n")).toEqual(['One; two.']);
        expect(hintsOf("<Listbox\n hint={ready\n ? 'A.'\n : 'B.'}\n")).toEqual(['A.', 'B.']);
    });
});
