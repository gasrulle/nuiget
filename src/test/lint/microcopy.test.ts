import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hostLabelsOf, hostTextsOf, isHostLabel, isName, isNotification, isSentence, isTitleCase, labelsOf, lintHostSource, lintSource, OPENS_UI } from './microcopy';

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
/** UX-P3.11b: every non-test source of `src/host` and the composition root. */
const HOST_FILES = [...sources(path.join(ROOT, 'src/host')), path.join(ROOT, 'src/extension.ts')].map(file => ({ file: path.relative(ROOT, file), text: readFileSync(file, 'utf8') }));

describe('the webviews\' microcopy (DS-COPY-1, DS-COPY-4; UX-P3.11)', () => {
    it('reads every non-test source of src/webview', () => {
        expect(FILES.length).toBeGreaterThan(90);
    });

    it('writes labels in Title Case, sentences with a capital and a period, names with a capital; no U+2026; one failure form', () => {
        const findings = FILES.flatMap(({ file, text }) => lintSource(file, text)).map(finding => `${finding.file}:${finding.line} ${finding.kind} ${JSON.stringify(finding.text)}`);
        expect(findings).toEqual([]);
    });

    it('ends every label that opens further UI with three periods, and only those (DS-COPY-4)', () => {
        const labels = new Set([...FILES.flatMap(({ file, text }) => labelsOf(file, text)), ...HOST_FILES.flatMap(({ file, text }) => hostLabelsOf(file, text))]);
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

describe('the host\'s microcopy (DS-COPY-1, DS-COPY-3, DS-COPY-4, DS §10 item 10; UX-P3.11b)', () => {
    it('reads every non-test source of src/host and src/extension.ts', () => {
        expect(HOST_FILES.length).toBeGreaterThan(8);
        expect(HOST_FILES.map(({ file }) => file)).toEqual(expect.arrayContaining(['src/host/feedback.ts', 'src/host/pickers.ts', 'src/host/rowMenu.ts', 'src/host/SidebarHost.ts', 'src/extension.ts']));
    });

    it('labels in Title Case, prompts and fragments without a period, notifications as prefixed sentences; no U+2026', () => {
        const findings = HOST_FILES.flatMap(({ file, text }) => lintHostSource(file, text)).map(finding => `${finding.file}:${finding.line} ${finding.kind} ${JSON.stringify(finding.text)}`);
        expect(findings).toEqual([]);
    });

    it('reads the composed toasts, the progress titles, the pickers\' prompts and the status texts (no vacuous pass)', () => {
        const texts = (file: string): string[] => hostTextsOf(file, HOST_FILES.find(entry => entry.file === file)!.text).map(entry => `${entry.kind} ${entry.text}`);
        const feedback = texts('src/host/feedback.ts');
        expect(feedback).toEqual(expect.arrayContaining([
            'notification nUIget: Uninstall of ${} from ${} failed: ${}.',
            'notification nUIget: Install of ${} in ${} was not started: ${}.',
            'notification nUIget: Uninstalled ${} from ${}.',
            'notification nUIget: Updated ${} to ${} in ${}, but the restore failed: ${}.',
            'notification nUIget: Updated ${} ${}; ${} failed.',
            'name nUIget: Installing packages',
            'label Show Output',
        ]));
        expect(texts('src/host/rowMenu.ts')).toEqual(expect.arrayContaining(['label nUIget — ${}', 'prompt Select the project to uninstall from', 'prompt Select the project to change the version in', 'label Update Central Version']));
        expect(texts('src/host/SidebarHost.ts')).toEqual(expect.arrayContaining(['notification nUIget: Pre-release versions are ${}.', 'notification nUIget: Restore after operations is ${}.']));
        expect(texts('src/extension.ts')).toEqual(expect.arrayContaining(['name $(sync~spin) nUIget: operation running']));
        expect(texts('src/host/pickers.ts')).toEqual(expect.arrayContaining(['label $(gear) Manage Package Sources...', 'prompt Select project', 'label nUIget — ${} Versions']));
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

    it('reads a function imported into a shown text as data, and the same function of the same file by its returns', () => {
        // Architecture-advisor follow-up 1 of UX-P3.11b: a text the host shows is composed in the file that shows it.
        const imported = ['import { describeIt } from \'./describe\';', 'items.push({ label: describeIt() });'].join('\n');
        expect(lintHostSource('imported.ts', imported)).toEqual([]);
        const local = ['function describeIt(): string { return \'view details\'; }', 'items.push({ label: describeIt() });'].join('\n');
        expect(lintHostSource('local.ts', local).map(finding => `${finding.line} ${finding.kind}`)).toEqual(['2 label']);
        // A notification is never a bare imported value: it must end in its own period, so it is composed where it is shown.
        expect(lintHostSource('message.ts', ['import { describeIt } from \'./describe\';', 'void vscode.window.showInformationMessage(describeIt());'].join('\n')).map(finding => finding.kind)).toEqual(['notification', 'prefix']);
    });

    it('tells a host label (codicon and dash aside) and a notification (its own final punctuation)', () => {
        expect(isHostLabel('$(gear) Manage Package Sources...')).toBe(true);
        expect(isHostLabel('nUIget — ${} Versions')).toBe(true);
        expect(isHostLabel('$(eye) View package details')).toBe(false);
        expect(isNotification('nUIget: Copied "${}" to the clipboard.')).toBe(true);
        expect(isNotification('nUIget: Install of ${} in ${} failed: ${}')).toBe(false);
        expect(isNotification('nUIget: No versions found')).toBe(false);
    });

    it('reports a host label in lower case, a notification without the prefix or its period, a prompt with a period, a fragment in lower case and U+2026', () => {
        const source = [
            'const PREFIX = \'nUIget: \';',
            'const warn = (text: string) => vscode.window.showWarningMessage(PREFIX + text, \'Show output\');',
            'warn(`Install of ${id} failed: ${reason}`);',
            'void vscode.window.showInformationMessage(\'Copied.\');',
            'items.push({ label: \'$(eye) View package details\', description: \'open it.\' });',
            'void vscode.window.showQuickPick(items, { placeHolder: \'Select a version.\', title: \'nUIget — versions\' });',
            'items.push({ label: \'$(list-ordered) Change version…\' });',
            'vscode.window.setStatusBarMessage(`Copied ${id}`, 2000);',
            'void vscode.window.showWarningMessage(\'Update it?\', { modal: true, detail: \'it moves.\' }, \'Update it\');',
            'const picker = vscode.window.createQuickPick();',
            'picker.title = \'nUIget — project\';',
            'void vscode.window.showInformationMessage(mystery);',
        ].join('\n');
        const kinds = lintHostSource('probe.ts', source).map(finding => `${finding.line} ${finding.kind}`);
        expect(kinds).toEqual(expect.arrayContaining(['2 label', '2 notification', '4 prefix', '5 label', '5 fragment', '6 prompt', '6 label', '7 ellipsis', '7 label', '8 prefix', '8 notification', '9 sentence', '9 label', '11 label', '12 unclassified']));
        // Data shows as a slot, never unclassified: a destructured name, an import, a parameter, a property.
        expect(lintHostSource('data.ts', [
            'import { projectName } from \'./names\';',
            'const { version } = options;',
            'items.push({ label: \'$(add) Install\', description: version });',
            'void vscode.window.showInformationMessage(`nUIget: Installed in ${projectName}.`);',
        ].join('\n'))).toEqual([]);
        // A modal message carries no prefix; a clean toast composed through a local function passes.
        expect(lintHostSource('clean.ts', [
            'const PREFIX = \'nUIget: \';',
            'const inform = (text: string) => vscode.window.showInformationMessage(PREFIX + text);',
            'function done(id: string): string { return `Installed ${id}`; }',
            'inform(`${done(id)}.`);',
            'void vscode.window.showWarningMessage(\'Update the central version?\', { modal: true }, \'Update Central Version\');',
        ].join('\n'))).toEqual([]);
    });
});
