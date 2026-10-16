import { readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * P5.12b: the `data-testid` hooks of `docs/ux/interaction-model.md` §8 are the ones the 2.0 webviews render. The
 * ExTester and harness tests read these hooks; a hook in the table that no product file renders, or a name listed for
 * a pattern hook (`row-action-<name>` with `install`, …) that is not rendered with the pattern's prefix, fails here
 * instead of in a UI run.
 */
const DOC = 'docs/ux/interaction-model.md';
const ROOTS = ['src/webview/main', 'src/webview/sidebar-next', 'src/webview/shared'];

export interface Hook {
    /** The hook as the table writes it, `<…>` included. */
    id: string;
    /** The names listed in parentheses in the Element column, for a pattern hook. */
    names: string[];
}

/** The hooks of the tables of §8 (from its heading to the next `## ` heading or the end). */
export function hooksOf(markdown: string): Hook[] {
    // A leading newline lets a heading on the first line match like any other.
    const text = `\n${markdown.replace(/\r\n/g, '\n')}`;
    const start = text.indexOf('\n## 8.');
    expect(start, 'the interaction model has a §8').toBeGreaterThanOrEqual(0);
    const next = text.indexOf('\n## ', start + 1);
    const section = text.slice(start, next < 0 ? undefined : next);
    return section.split('\n')
        .filter(line => line.startsWith('| `'))
        .flatMap(line => {
            const [first, element] = line.split('|').slice(1, 3);
            const listed = /\(([^)]*)\)/.exec(element)?.[1] ?? '';
            const names = [...listed.matchAll(/`([a-z0-9][a-z0-9-]*)`/g)].map(match => match[1]);
            return [...first.matchAll(/`([^`]+)`/g)].map(match => ({ id: match[1], names: match[1].includes('<') ? names : [] }));
        });
}

/** A source without its comments, so that an example in a doc comment is not a rendered hook. */
const withoutComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** The expression of a JSX attribute value `{…}` that starts at `open`, braces balanced. */
function expressionAt(source: string, open: number): string {
    let depth = 0;
    for (let index = open; index < source.length; index++) {
        if (source[index] === '{') {
            depth++;
        } else if (source[index] === '}' && --depth === 0) {
            return source.slice(open + 1, index);
        }
    }
    return '';
}

/** The literals and the template prefixes (the text before `${`) of an attribute expression. */
function stringsOf(expression: string): { literals: string[]; prefixes: string[] } {
    const literals = [...expression.matchAll(/'([^']+)'|"([^"]+)"/g)].map(match => match[1] ?? match[2]);
    const templates = [...expression.matchAll(/`([^`]*)`/g)].map(match => match[1]);
    return {
        literals: [...literals, ...templates.filter(template => !template.includes('${'))],
        prefixes: templates.filter(template => template.includes('${')).map(template => template.slice(0, template.indexOf('${'))),
    };
}

/** What a set of 2.0 webview sources renders as test ids: whole ids, and prefixes of ids built at run time. */
export function renderedHooks(sources: string[]): { literals: Set<string>; prefixes: Set<string> } {
    const literals = new Set<string>();
    const prefixes = new Set<string>();
    for (const raw of sources) {
        const source = withoutComments(raw);
        for (const match of source.matchAll(/\b(data-testid|testId|testKey)=(?:"([^"]+)"|\{)/g)) {
            // `SectionHeader` renders `section-header-<testKey>`.
            const prefix = match[1] === 'testKey' ? 'section-header-' : '';
            if (match[2] !== undefined) {
                literals.add(prefix + match[2]);
                continue;
            }
            const found = stringsOf(expressionAt(source, (match.index ?? 0) + match[0].length - 1));
            found.literals.forEach(literal => literals.add(prefix + literal));
            found.prefixes.forEach(start => prefixes.add(prefix + start));
        }
        // Ids handed to a primitive in an object (`Tabs`: `{ id, label, 'data-testid': 'installed-tab' }`).
        for (const match of source.matchAll(/'data-testid':\s*'([^']+)'/g)) {
            literals.add(match[1]);
        }
        // A helper that builds an id (`sourceRowId = (name) => \`source-row-${…}\``).
        for (const match of source.matchAll(/\b\w+Id\s*=\s*\([^)]*\)\s*(?::\s*string\s*)?=>\s*`([^`$]+)\$\{/g)) {
            prefixes.add(match[1]);
        }
    }
    return { literals, prefixes };
}

function productSources(): string[] {
    return ROOTS.flatMap(root => (readdirSync(root, { recursive: true }) as string[])
        .map(entry => path.join(root, entry))
        .filter(file => /\.tsx?$/.test(file) && !/\.(test|bench)\.tsx?$/.test(file) && path.basename(file) !== 'testSupport.ts'))
        .map(file => readFileSync(file, 'utf8'));
}

/** The hooks of the table that nothing renders, one line each. */
export function unrenderedHooks(hooks: Hook[], rendered: { literals: Set<string>; prefixes: Set<string> }): string[] {
    return hooks.flatMap(hook => {
        if (!hook.id.includes('<')) {
            return rendered.literals.has(hook.id) ? [] : [`${hook.id}: rendered by no 2.0 webview file`];
        }
        const prefix = hook.id.slice(0, hook.id.indexOf('<'));
        const covered = [...rendered.literals, ...rendered.prefixes].some(id => id.startsWith(prefix));
        return covered ? [] : [`${hook.id}: no rendered id starts with "${prefix}"`];
    });
}

/** The names listed for pattern hooks that are not rendered with the pattern's prefix, one line each. */
export function unrenderedNames(hooks: Hook[], rendered: { literals: Set<string>; prefixes: Set<string> }): string[] {
    return hooks.flatMap(hook => hook.names
        .map(name => `${hook.id.slice(0, hook.id.indexOf('<'))}${name}`)
        .filter(id => !rendered.literals.has(id))
        .map(id => `${id} (listed for ${hook.id}): rendered by no 2.0 webview file`));
}

describe('interaction model §8 and the rendered test ids', () => {
    const hooks = hooksOf(readFileSync(DOC, 'utf8'));
    const rendered = renderedHooks(productSources());

    it('every §8 hook is rendered by a 2.0 webview file', () => {
        // The scan has something to look at: the tables and the sources are where this test expects them.
        expect(hooks.length).toBeGreaterThan(40);
        expect(rendered.literals.has('nuiget-app')).toBe(true);
        expect(unrenderedHooks(hooks, rendered)).toEqual([]);
    });

    it('every name enumerated for a pattern hook is rendered', () => {
        expect(hooks.find(hook => hook.id === 'row-action-<name>')?.names.length).toBeGreaterThan(0);
        expect(unrenderedNames(hooks, rendered)).toEqual([]);
    });

    it('the scan reports a hook and a listed name that nothing renders, and resolves the indirect forms', () => {
        const table = [
            '## 8. Hooks', '', '| Test id | Element |', '|---|---|',
            '| `kept`, `gone` | Two hooks |',
            '| `row-action-<name>` | Actions (`install`, `more`) |',
            '| `section-header-<name>` | Toggles (`installed`) |',
            '| `source-row-<name>` | Sources |',
            '| `installed-tab` | A tab |',
            '## 9. Next',
            '| `outside` | Not in §8 |',
        ].join('\n');
        const sources = [
            '/* data-testid="gone" in a comment is no hook */ <div data-testid="kept" />',
            '<IconButton data-testid="row-action-install" />',
            '<SectionHeader testKey="installed" /> <SectionHeader testKey={`project-${name}`} />',
            'export const sourceRowId = (name: string): string => `source-row-${name.toLowerCase()}`;',
            "const tabs = [{ id: 'installed', 'data-testid': 'installed-tab' }];",
        ];
        const planted = hooksOf(table);
        expect(planted.map(hook => hook.id)).toEqual(['kept', 'gone', 'row-action-<name>', 'section-header-<name>', 'source-row-<name>', 'installed-tab']);
        const found = renderedHooks(sources);
        expect(unrenderedHooks(planted, found)).toEqual(['gone: rendered by no 2.0 webview file']);
        expect(unrenderedNames(planted, found)).toEqual(['row-action-more (listed for row-action-<name>): rendered by no 2.0 webview file']);
        expect(found.prefixes.has('section-header-project-')).toBe(true);
    });
});
