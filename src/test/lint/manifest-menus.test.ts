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

    it('view/title shows four navigation buttons in order and the two actions under `...`; each switch is one command of its pair by its context key', () => {
        const entries = (menus['view/title'] ?? []).filter(entry => /\bview == nuiget\.sidebarView\b/.test(entry.when ?? ''));
        const position = (entry: MenuEntry): number => Number(/^navigation@(\d+)$/.exec(entry.group ?? '')?.[1] ?? NaN);
        // DS-OVERFLOW-4 (UX-P3.7b): four navigation buttons, a switch pair counting once: restore, prerelease, project, source.
        const navigation = entries.filter(entry => /^navigation@/.test(entry.group ?? ''));
        const order = [...navigation].sort((a, b) => position(a) - position(b)).map(entry => entry.command.replace(/Off$/, ''));
        expect([...new Set(order)]).toEqual([
            'nuiget.sidebar.toggleRestore', 'nuiget.sidebar.togglePrerelease', 'nuiget.sidebar.selectProject', 'nuiget.sidebar.selectSource',
        ]);
        expect(new Set(navigation.map(entry => entry.group)).size).toBeLessThanOrEqual(4);
        // Refresh and Open Full Manager are items of the view's `...` menu, one non-navigation group, in that order.
        const more = entries.filter(entry => !/^navigation@/.test(entry.group ?? '')).map(entry => `${entry.group}:${entry.command}`);
        expect(more).toEqual(['1_more@1:nuiget.sidebar.refresh', '1_more@2:nuiget.sidebar.openFullView']);
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

    it('the row menu names both webviews and shows each command on its sections, read-only rows without a write (UX-P2.9a)', () => {
        const entries = (menus as Record<string, Array<{ command: string; when?: string; group?: string }>>)['webview/context'];
        const clause = (command: string): string => entries.find(entry => entry.command === `nuiget.row.${command}`)?.when ?? '';
        const both = "(webviewId == 'nugetManager' || webviewId == 'nuiget.sidebarView') && ";
        const ANY = "(webviewSection == 'installedRow' || webviewSection == 'updateRow' || webviewSection == 'browseRow' || webviewSection == 'transitiveRow')";
        expect(Object.fromEntries(entries.map(entry => [entry.command.replace('nuiget.row.', ''), [entry.when, entry.group]]))).toEqual({
            installLatest: [`${both}webviewSection == 'browseRow' && (!nuiget.installed || nuiget.partial)`, '1_write@1'],
            installVersion: [`${both}webviewSection == 'browseRow' && (!nuiget.installed || nuiget.partial)`, '1_write@2'],
            updateLatest: [`${both}webviewSection == 'updateRow' && !nuiget.floating && !nuiget.readOnly`, '1_write@3'],
            updateVersion: [`${both}webviewSection == 'updateRow' && !nuiget.readOnly`, '1_write@4'],
            changeVersion: [`${both}(webviewSection == 'installedRow' || (webviewSection == 'browseRow' && nuiget.installed)) && !nuiget.readOnly`, '1_write@5'],
            uninstall: [`${both}(webviewSection == 'installedRow' || webviewSection == 'updateRow' || (webviewSection == 'browseRow' && nuiget.installed)) && !nuiget.readOnly`, '1_write@6'],
            copyId: [both + ANY, '2_copy@1'],
            viewDetails: [both + ANY, '3_view@1'],
        });
        expect(clause('uninstall')).toContain('!nuiget.readOnly');
    });

    it('the command palette hides the sidebar-only and row menu commands', () => {
        const hidden = (menus.commandPalette ?? []).filter(entry => entry.when === 'false').map(entry => entry.command).sort();
        const sidebarOnly = manifest.contributes.commands.map(entry => entry.command).filter(command => command.startsWith('nuiget.sidebar.') || command.startsWith('nuiget.row.'));
        expect(hidden).toEqual([...sidebarOnly, 'nuiget.refreshPackages'].sort());
        // What the palette offers: the manager and the two cache commands.
        const offered = manifest.contributes.commands.map(entry => entry.command).filter(command => !hidden.includes(command));
        expect(offered.sort()).toEqual(['nuiget.clearHttpCache', 'nuiget.clearSdkVersionCache', 'nuiget.openManager']);
    });
});
