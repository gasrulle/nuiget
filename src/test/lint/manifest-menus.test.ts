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

    it('view/title shows the sidebar buttons in order and one command of each switch pair by its context key', () => {
        const entries = (menus['view/title'] ?? []).filter(entry => /\bview == nuiget\.sidebarView\b/.test(entry.when ?? ''));
        const position = (entry: MenuEntry): number => Number(/^navigation@(\d+)$/.exec(entry.group ?? '')?.[1] ?? NaN);
        // Restore, prerelease, project, source, refresh, full view: the order of the 1.x title bar.
        const order = [...entries].sort((a, b) => position(a) - position(b)).map(entry => entry.command.replace(/Off$/, ''));
        expect([...new Set(order)]).toEqual([
            'nuiget.sidebar.toggleRestore', 'nuiget.sidebar.togglePrerelease', 'nuiget.sidebar.selectProject',
            'nuiget.sidebar.selectSource', 'nuiget.sidebar.refresh', 'nuiget.sidebar.openFullView',
        ]);
        // Each switch shows one of its two commands: the one that turns it on while the key is false, and back.
        for (const [on, key] of [['nuiget.sidebar.toggleRestore', 'nuiget.restoreEnabled'], ['nuiget.sidebar.togglePrerelease', 'nuiget.prereleaseEnabled']]) {
            expect(entryOf('view/title', on).when).toBe(`view == nuiget.sidebarView && !${key}`);
            expect(entryOf('view/title', `${on}Off`).when).toBe(`view == nuiget.sidebarView && ${key}`);
            expect(entryOf('view/title', on).group).toBe(entryOf('view/title', `${on}Off`).group);
        }
        for (const command of ['nuiget.sidebar.selectProject', 'nuiget.sidebar.selectSource', 'nuiget.sidebar.refresh', 'nuiget.sidebar.openFullView']) {
            expect(entryOf('view/title', command).when).toBe('view == nuiget.sidebarView');
        }
    });

    it('the command palette hides the sidebar-only commands', () => {
        const hidden = (menus.commandPalette ?? []).filter(entry => entry.when === 'false').map(entry => entry.command).sort();
        const sidebarOnly = manifest.contributes.commands.map(entry => entry.command).filter(command => command.startsWith('nuiget.sidebar.'));
        expect(hidden).toEqual([...sidebarOnly, 'nuiget.refreshPackages'].sort());
        // What the palette offers: the manager and the two cache commands.
        const offered = manifest.contributes.commands.map(entry => entry.command).filter(command => !hidden.includes(command));
        expect(offered.sort()).toEqual(['nuiget.clearHttpCache', 'nuiget.clearSdkVersionCache', 'nuiget.openManager']);
    });
});
