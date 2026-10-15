import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { ALL_PROJECTS } from '../protocol';
import { MANAGE_SOURCES, pickContextMenuAction, pickProject, pickProjectsForInstall, pickSingleProject, pickSource, pickVersion } from './pickers';

type Item = vscode.QuickPickItem & { value?: string; action?: string; detail?: string };

const showQuickPick = vi.mocked(vscode.window.showQuickPick);
const createQuickPick = vi.mocked(vscode.window.createQuickPick);
const information = vi.mocked(vscode.window.showInformationMessage);

/** The next `createQuickPick` accepts the item `choose` finds among the items it was given (none: it is hidden). */
function acceptNextQuickPick(choose: (items: Item[]) => Item | undefined): { items: () => Item[]; active: () => Item[] } {
    const create = createQuickPick.getMockImplementation()!;
    let picker: { items: Item[]; activeItems: Item[] } | undefined;
    createQuickPick.mockImplementationOnce(() => {
        const created = create() as unknown as { items: Item[]; activeItems: Item[]; show: () => void; _autoSelect?: Item };
        const show = created.show;
        created.show = () => {
            created._autoSelect = choose(created.items);
            show();
        };
        picker = created;
        return created as never;
    });
    return { items: () => picker?.items ?? [], active: () => picker?.activeItems ?? [] };
}

/** The items the last `showQuickPick` was given. */
const shownItems = (): Item[] => (showQuickPick.mock.calls.at(-1)?.[0] ?? []) as Item[];

afterEach(() => {
    showQuickPick.mockReset();
    information.mockClear();
});

describe('pickProject', () => {
    const projects = [{ name: 'Lib', path: '/w/Lib/Lib.csproj' }, { name: 'App', path: '/w/App/App.csproj' }];

    it('says that there are no projects and answers nothing', async () => {
        await expect(pickProject([], '')).resolves.toBeUndefined();
        expect(information).toHaveBeenCalledWith('No .NET project files found in the workspace.');
    });

    it('several projects: All Projects first, then the projects by name, the current one active; accept answers its value', async () => {
        const picker = acceptNextQuickPick(items => items.find(item => item.label === 'App'));
        await expect(pickProject(projects, '/w/Lib/Lib.csproj')).resolves.toBe('/w/App/App.csproj');
        expect(picker.items().map(item => item.value ?? item.kind)).toEqual([ALL_PROJECTS, vscode.QuickPickItemKind.Separator, '/w/App/App.csproj', '/w/Lib/Lib.csproj']);
        expect(picker.active().map(item => item.value)).toEqual(['/w/Lib/Lib.csproj']);
    });

    it('one project offers no All Projects; hiding the picker answers nothing', async () => {
        const picker = acceptNextQuickPick(() => undefined);
        await expect(pickProject(projects.slice(0, 1), '')).resolves.toBeUndefined();
        expect(picker.items().map(item => item.value)).toEqual(['/w/Lib/Lib.csproj']);
    });
});

describe('pickSource', () => {
    it('offers All Sources, the enabled sources and the settings entry, and answers the value chosen', async () => {
        showQuickPick.mockImplementationOnce(async items => (items as Item[])[1]);
        const sources = [{ name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true }, { name: 'Off', url: 'https://off.example/v3/index.json', enabled: false }];
        await expect(pickSource(sources, 'all')).resolves.toBe('https://api.nuget.org/v3/index.json');
        expect(shownItems().map(item => item.value)).toEqual(['all', 'https://api.nuget.org/v3/index.json', MANAGE_SOURCES]);
        expect(shownItems()[0].picked).toBe(true);
    });
});

describe('pickVersion', () => {
    it('says that there are no versions and answers nothing', async () => {
        await expect(pickVersion('Serilog', [])).resolves.toBeUndefined();
        expect(information).toHaveBeenCalledWith('No versions found for Serilog');
        expect(showQuickPick).not.toHaveBeenCalled();
    });

    it('marks the installed version and answers the version chosen', async () => {
        showQuickPick.mockImplementationOnce(async items => (items as Item[])[0]);
        await expect(pickVersion('Serilog', ['3.1.1', '3.0.0'], '3.0.0')).resolves.toBe('3.1.1');
        expect(shownItems().map(item => item.description)).toEqual(['', '(installed)']);
    });
});

describe('pickProjectsForInstall', () => {
    const projects = [{ name: 'Lib', path: '/w/Lib/Lib.csproj' }, { name: 'App', path: '/w/App/App.csproj' }];

    it('pre-picks the projects without the package, shows where it is installed, and answers the paths chosen', async () => {
        showQuickPick.mockImplementationOnce(async items => (items as Item[]).filter(item => item.picked) as never);
        const chosen = await pickProjectsForInstall('Serilog', projects, new Map([['/w/App/App.csproj', '3.0.0']]));
        expect(chosen).toEqual(['/w/Lib/Lib.csproj']);
        expect(shownItems().map(item => [item.label, item.description, item.picked])).toEqual([['App', '(installed 3.0.0)', false], ['Lib', '', true]]);
    });

    it('an empty pick, or no projects, answers nothing', async () => {
        showQuickPick.mockImplementationOnce(async () => [] as never);
        await expect(pickProjectsForInstall('Serilog', projects, new Map())).resolves.toBeUndefined();
        await expect(pickProjectsForInstall('Serilog', [], new Map())).resolves.toBeUndefined();
    });
});

describe('pickSingleProject', () => {
    it('one candidate answers without a pick; several are picked by name', async () => {
        await expect(pickSingleProject('t', 'p', [{ projectPath: '/a', projectName: 'A' }])).resolves.toBe('/a');
        expect(showQuickPick).not.toHaveBeenCalled();
        showQuickPick.mockImplementationOnce(async items => (items as Item[])[1]);
        await expect(pickSingleProject('t', 'p', [{ projectPath: '/b', projectName: 'B', version: '2.0.0' }, { projectPath: '/a', projectName: 'A' }])).resolves.toBe('/b');
        expect(shownItems().map(item => [item.label, item.description])).toEqual([['A', ''], ['B', 'v2.0.0']]);
    });
});

describe('pickContextMenuAction', () => {
    const actionsFor = async (options: Parameters<typeof pickContextMenuAction>[0]): Promise<string[]> => {
        showQuickPick.mockImplementationOnce(async () => undefined);
        await pickContextMenuAction(options);
        return shownItems().map(item => item.action ?? '');
    };

    it('the item sets of the three contexts, with a partly installed package and a floating version', async () => {
        expect(await actionsFor({ packageId: 'A', context: 'browse', latestVersion: '2.0.0' })).toEqual(['install-latest', 'install-version', 'copy-id', 'view-details']);
        expect(await actionsFor({ packageId: 'A', context: 'browse', installedVersion: '1.0.0' })).toEqual(['uninstall', 'change-version', 'copy-id', 'view-details']);
        expect(await actionsFor({ packageId: 'A', context: 'browse', installedVersion: '1.0.0', partiallyInstalled: true })).toEqual(['install-latest', 'install-version', 'uninstall', 'change-version', 'copy-id', 'view-details']);
        expect(await actionsFor({ packageId: 'A', context: 'installed', installedVersion: '1.0.0' })).toEqual(['change-version', 'uninstall', 'copy-id', 'view-details']);
        expect(await actionsFor({ packageId: 'A', context: 'updates', latestVersion: '2.0.0' })).toEqual(['update-latest', 'update-version', 'uninstall', 'copy-id', 'view-details']);
        expect(await actionsFor({ packageId: 'A', context: 'updates', latestVersion: '2.0.0', floatingOrRange: true })).toEqual(['update-version', 'uninstall', 'copy-id', 'view-details']);
    });

    it('answers the action chosen', async () => {
        showQuickPick.mockImplementationOnce(async items => (items as Item[]).find(item => item.action === 'view-details'));
        await expect(pickContextMenuAction({ packageId: 'A', context: 'installed', installedVersion: '1.0.0' })).resolves.toBe('view-details');
    });
});
