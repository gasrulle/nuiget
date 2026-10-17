import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * P10.0d-P10.0h (regression matrix rows R13, R14, R16, R17): where `package.json` places the commands in VS Code's
 * menus. No test can open a VS Code menu, so the manifest is the contract: the entry, its `when` clause and its group.
 */
interface MenuEntry { command: string; when?: string; group?: string }

const manifest = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
    contributes: { commands: { command: string }[]; menus: Record<string, MenuEntry[]> };
};
const menus = manifest.contributes.menus;

/** The regular expression of a `resourceFilename =~ /…/` clause, as VS Code evaluates it. */
function filenamePattern(when: string | undefined): RegExp {
    const match = /^resourceFilename =~ \/(.+)\/([a-z]*)$/.exec(when ?? '');
    expect(match, `a resourceFilename clause: ${when}`).not.toBeNull();
    return new RegExp(match![1], match![2]);
}

const PROJECT_FILES = ['App.csproj', 'Lib.fsproj', 'Legacy.vbproj'];
const OTHER_FILES = ['Program.cs', 'Directory.Packages.props', 'App.sln', 'App.csproj.user', 'nuget.config'];

/** The single entry of `menu` that runs `command`. */
function entryOf(menu: string, command: string): MenuEntry {
    const entries = (menus[menu] ?? []).filter(entry => entry.command === command);
    expect(entries, `${menu} entries of ${command}`).toHaveLength(1);
    return entries[0];
}

describe('package.json menus', () => {
    it('explorer/context offers nuiget.openManager on project files only', () => {
        const entry = entryOf('explorer/context', 'nuiget.openManager');
        expect(entry.group).toBe('navigation');
        const pattern = filenamePattern(entry.when);
        for (const file of PROJECT_FILES) {
            expect(pattern.test(file), file).toBe(true);
        }
        for (const file of OTHER_FILES) {
            expect(pattern.test(file), file).toBe(false);
        }
    });

    it('editor/title offers nuiget.openManager on project files only', () => {
        const entry = entryOf('editor/title', 'nuiget.openManager');
        expect(entry.group).toBe('navigation');
        const pattern = filenamePattern(entry.when);
        for (const file of PROJECT_FILES) {
            expect(pattern.test(file), file).toBe(true);
        }
        for (const file of OTHER_FILES) {
            expect(pattern.test(file), file).toBe(false);
        }
    });
});
