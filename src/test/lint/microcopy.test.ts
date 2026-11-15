import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isName, isSentence, isTitleCase, labelsOf, lintSource, OPENS_UI } from './microcopy';

/**
 * UX-P3.11 (DS-COPY-1, DS-COPY-4; design-advisor opening ruling of 2026-11-15, DO 6): the webviews' microcopy, read from
 * their sources. No allowance list: a string this item does not change in the same commit fails here.
 */

const ROOT = process.cwd();

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
            return sources(full);
        }
        return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== 'testSupport.ts' && !name.endsWith('.d.ts') ? [full] : [];
    });
}

const FILES = sources(path.join(ROOT, 'src/webview')).map(file => ({ file: path.relative(ROOT, file), text: readFileSync(file, 'utf8') }));

describe('the webviews\' microcopy (DS-COPY-1, DS-COPY-4; UX-P3.11)', () => {
    it('reads every non-test source of src/webview', () => {
        expect(FILES.length).toBeGreaterThan(90);
    });

    it('writes labels in Title Case, sentences with a capital and a period, names with a capital; no U+2026; one failure form', () => {
        const findings = FILES.flatMap(({ file, text }) => lintSource(file, text)).map(finding => `${finding.file}:${finding.line} ${finding.kind} ${JSON.stringify(finding.text)}`);
        expect(findings).toEqual([]);
    });

    it('ends every label that opens further UI with three periods, and only those (DS-COPY-4)', () => {
        const labels = new Set(FILES.flatMap(({ file, text }) => labelsOf(file, text)));
        for (const label of OPENS_UI) {
            expect(label.endsWith('...'), label).toBe(true);
            expect(labels.has(label), `${label} is rendered`).toBe(true);
        }
        // A progress label ("Working...", "Adding...") ends in three periods too, and opens nothing.
        expect([...labels].filter(label => label.endsWith('...') && !/^[A-Z][a-z]+ing\.\.\.$/.test(label) && !OPENS_UI.includes(label))).toEqual([]);
    });

    it('titles the manifest\'s commands in Title Case without U+2026', () => {
        const manifest = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { contributes: { commands: { command: string; title: string }[] } };
        const off = manifest.contributes.commands.filter(({ title }) => !isTitleCase(title.replace(/^nUIget: /, '')) || title.includes('…'));
        expect(off.map(({ command, title }) => `${command}: ${title}`)).toEqual([]);
    });
});

describe('the microcopy rules (negative cases)', () => {
    it('tells Title Case by DS-COPY-1\'s minor words, hyphens, proper nouns and slots', () => {
        expect(isTitleCase('Select All')).toBe(true);
        expect(isTitleCase('Install in Projects...')).toBe(true);
        expect(isTitleCase('Include Pre-Release')).toBe(true);
        expect(isTitleCase('Uninstall Selected (${})')).toBe(true);
        expect(isTitleCase('Manage NuGet Packages')).toBe(true);
        expect(isTitleCase('Select all')).toBe(false);
        expect(isTitleCase('Include Pre-release')).toBe(false);
        expect(isTitleCase('In Projects')).toBe(true);
        expect(isTitleCase('in Projects')).toBe(false);
    });

    it('tells a sentence and a name', () => {
        expect(isSentence('Some package sources could not be checked.')).toBe(true);
        expect(isSentence('${} could not be loaded.')).toBe(true);
        expect(isSentence('Install this version into several projects')).toBe(false);
        expect(isSentence('the list is empty.')).toBe(false);
        expect(isName('Package lists')).toBe(true);
        expect(isName('package lists')).toBe(false);
    });

    it('reports a sentence-case button, an untitled banner, U+2026, a raw failure template and an unclassified label', () => {
        const source = [
            'const a = <Button>Select all</Button>;',
            'const b = <Banner severity="error">the list failed</Banner>;',
            'const c = <IconButton label="Clear search" />;',
            'const d = <Toolbar label="bulk actions" />;',
            'const e = <EmptyState message="Nothing here" action={{ label: \'try again\', onClick }} />;',
            'const f = `Searching…`;',
            'const g = `The updates could not be checked: ${reason}`;',
            'const h = <Banner severity="error">{`Install failed: ${reason}.`}</Banner>;',
            'const i = <Checkbox label="Restore" />;',
            'const j = [{ kind: \'group\', title: \'Direct packages\' }];',
            'const k = <Button title="No reason">Go</Button>;',
        ].join('\n');
        const kinds = lintSource('probe.tsx', source).map(finding => `${finding.line} ${finding.kind}`);
        expect(kinds).toEqual(expect.arrayContaining(['1 label', '2 sentence', '3 label', '4 name', '5 sentence', '5 label', '6 ellipsis', '7 failure-form', '8 failed-in-banner', '9 unclassified', '10 label', '11 sentence']));
        expect(lintSource('clean.tsx', 'const a = <Button title="Updates are being checked.">Update All</Button>;')).toEqual([]);
    });
});
