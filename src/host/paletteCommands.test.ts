import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { ALL_PROJECTS, type InstalledPackage, type PackageUpdate } from '../protocol';
import type { HostServices } from './services';
import { registerPaletteCommands } from './paletteCommands';

const handlers = vi.hoisted(() => ({
    submitFromHost: vi.fn(async () => undefined),
    operations: { bulkUpdate: vi.fn((_s, p) => ({ kind: 'bulkUpdate', ...p })), restore: vi.fn((_s, p) => ({ kind: 'restore', ...p })) },
}));
vi.mock('./handlers', () => handlers);
const pickers = vi.hoisted(() => ({ pickSingleProject: vi.fn(async () => '/w/B.csproj') }));
vi.mock('./pickers', () => pickers);
const panel = vi.hoisted(() => ({ MainPanelHost: { createOrShow: vi.fn() } }));
vi.mock('./MainPanelHost', () => panel);
const rowMenu = vi.hoisted(() => ({ runRowAction: vi.fn(async () => true) }));
vi.mock('./rowMenu', () => rowMenu);

const A = '/w/A.csproj';
const B = '/w/B.csproj';
const PROJECTS = [{ name: 'A', path: A }, { name: 'B', path: B }];
const pkg = (id: string, changes: Partial<InstalledPackage> = {}): InstalledPackage => ({ id, version: '1.0.0', versionType: 'standard', declaration: 'project', ...changes });
const update = (id: string, installedVersion: string, latestVersion: string): PackageUpdate => ({ id, installedVersion, latestVersion });

function setUp(options: { selected?: string; packages?: InstalledPackage[]; updates?: PackageUpdate[]; sourcesUnavailable?: boolean; projects?: typeof PROJECTS } = {}) {
    const commands = new Map<string, () => Promise<void> | void>();
    const onDidChange = vi.fn();
    const snapshot = { selectedProject: options.selected ?? A, selectedSource: 'all', includePrerelease: false };
    const services = {
        session: { snapshot, onDidChange },
        catalog: {
            invalidate: vi.fn(),
            projects: vi.fn(async () => ({ value: options.projects ?? PROJECTS })),
            updates: vi.fn(async (projectPath: string) => ({ projectPath, updates: options.updates ?? [], sourcesUnavailable: options.sourcesUnavailable ?? false, generation: 1 })),
            installed: vi.fn(async (projectPath: string) => ({ result: { projectPath, fidelity: 'authoritative', isCpm: false, packages: options.packages ?? [] }, generation: 1 })),
        },
    } as unknown as HostServices;
    registerPaletteCommands(services, (command, handler) => commands.set(command, handler as () => Promise<void>));
    const run = async (command: string) => { await commands.get(command)?.(); };
    return { run, services, snapshot, onDidChange };
}

describe('the palette commands (UX-P5.7a, G7)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);
    });

    it('registers the four commands of the palette', () => {
        const commands: string[] = [];
        registerPaletteCommands({} as HostServices, command => commands.push(command));
        expect(commands).toEqual(['nuiget.checkForUpdates', 'nuiget.updateAllPackages', 'nuiget.installPackage', 'nuiget.restorePackages']);
    });

    it('nuiget.checkForUpdates invalidates the selected project and opens the panel on Updates', async () => {
        const { run, services, snapshot, onDidChange } = setUp();
        const before = { ...snapshot };
        await run('nuiget.checkForUpdates');
        expect(services.catalog.invalidate).toHaveBeenCalledWith({ kind: 'project', projectPaths: [A] }, 'manual-refresh');
        expect(panel.MainPanelHost.createOrShow).toHaveBeenCalledWith(services, { projectPath: A, initialTab: 'updates' });
        expect(snapshot).toEqual(before);
        expect(onDidChange).not.toHaveBeenCalled();
    });

    it('nuiget.checkForUpdates under All Projects invalidates the workspace', async () => {
        const { run, services } = setUp({ selected: ALL_PROJECTS });
        await run('nuiget.checkForUpdates');
        expect(services.catalog.invalidate).toHaveBeenCalledWith({ kind: 'workspace' }, 'manual-refresh');
        expect(panel.MainPanelHost.createOrShow).toHaveBeenCalledWith(services, { projectPath: ALL_PROJECTS, initialTab: 'updates' });
    });

    it('nuiget.updateAllPackages submits the candidates with their versions and leaves a central row out (N76)', async () => {
        vi.mocked(vscode.window.showInformationMessage).mockResolvedValue('Update' as never);
        const { run } = setUp({
            packages: [pkg('Serilog'), pkg('Moq'), pkg('Newtonsoft.Json', { declaration: 'central' })],
            updates: [update('Serilog', '1.0.0', '2.0.0'), update('Moq', '4.0.0', '4.20.0'), update('Newtonsoft.Json', '12.0.1', '13.0.3')],
        });
        await run('nuiget.updateAllPackages');
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Update 2 packages in A?', { modal: true, detail: 'Serilog 1.0.0 → 2.0.0\nMoq 4.0.0 → 4.20.0' }, 'Update');
        expect(handlers.operations.bulkUpdate).toHaveBeenCalledWith(expect.anything(), { projectPath: A, packages: [{ id: 'Serilog', version: '2.0.0', sourceUrl: undefined }, { id: 'Moq', version: '4.20.0', sourceUrl: undefined }] });
        expect(handlers.submitFromHost).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: 'bulkUpdate' }), { kind: 'update', projectPaths: [A], packageIds: ['Serilog', 'Moq'] });
        expect(pickers.pickSingleProject).not.toHaveBeenCalled();
    });

    it('nuiget.updateAllPackages asks one package in the singular and picks the project under All Projects', async () => {
        vi.mocked(vscode.window.showInformationMessage).mockResolvedValue('Update' as never);
        const { run } = setUp({ selected: ALL_PROJECTS, packages: [pkg('Serilog')], updates: [update('Serilog', '1.0.0', '2.0.0')] });
        await run('nuiget.updateAllPackages');
        expect(pickers.pickSingleProject).toHaveBeenCalledWith('nUIget — Update All Packages', 'Select the project to update', [{ projectPath: A, projectName: 'A' }, { projectPath: B, projectName: 'B' }]);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Update 1 package in B?', { modal: true, detail: 'Serilog 1.0.0 → 2.0.0' }, 'Update');
        expect(handlers.operations.bulkUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ projectPath: B }));
    });

    it('nuiget.updateAllPackages under All Projects does nothing when the project picker is cancelled', async () => {
        pickers.pickSingleProject.mockResolvedValueOnce(undefined as never);
        const { run, services } = setUp({ selected: ALL_PROJECTS });
        await run('nuiget.updateAllPackages');
        expect(services.catalog.updates).not.toHaveBeenCalled();
        expect(handlers.submitFromHost).not.toHaveBeenCalled();
    });

    it('nuiget.updateAllPackages submits nothing when the modal is dismissed', async () => {
        const { run } = setUp({ packages: [pkg('Serilog')], updates: [update('Serilog', '1.0.0', '2.0.0')] });
        await run('nuiget.updateAllPackages');
        expect(handlers.submitFromHost).not.toHaveBeenCalled();
    });

    it('nuiget.updateAllPackages lists at most ten packages in the modal and says how many more', async () => {
        const ids = Array.from({ length: 12 }, (_, index) => `P${index}`);
        const { run } = setUp({ packages: ids.map(id => pkg(id)), updates: ids.map(id => update(id, '1.0.0', '2.0.0')) });
        await run('nuiget.updateAllPackages');
        const detail = (vi.mocked(vscode.window.showInformationMessage).mock.calls[0][1] as { detail: string }).detail.split('\n');
        expect(detail).toHaveLength(11);
        expect(detail.at(-1)).toBe('and 2 more');
    });

    it('nuiget.updateAllPackages reads an unreachable source as unknown, not as nothing to update', async () => {
        const { run } = setUp({ packages: [pkg('Serilog')], updates: [], sourcesUnavailable: true });
        await run('nuiget.updateAllPackages');
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('nUIget: The updates for A could not be checked: some package sources could not be reached.');
        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        expect(handlers.submitFromHost).not.toHaveBeenCalled();
    });

    it('nuiget.updateAllPackages says there is nothing to update, and when no update can join a bulk update', async () => {
        await setUp({ packages: [pkg('Serilog')], updates: [] }).run('nuiget.updateAllPackages');
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('nUIget: No updates available for A.');
        vi.clearAllMocks();
        await setUp({ packages: [pkg('Newtonsoft.Json', { declaration: 'central' })], updates: [update('Newtonsoft.Json', '12.0.1', '13.0.3')] }).run('nuiget.updateAllPackages');
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('nUIget: No update for A can join a bulk update. Update them one by one on the Updates tab.');
        expect(handlers.submitFromHost).not.toHaveBeenCalled();
        vi.clearAllMocks();
        await setUp({ selected: ALL_PROJECTS, projects: [] }).run('nuiget.updateAllPackages');
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('nUIget: No .NET projects found in this workspace.');
    });

    it('nuiget.installPackage refuses an invalid id before any Catalog call', async () => {
        vi.mocked(vscode.window.showInputBox).mockResolvedValue('../evil');
        const { run, services } = setUp();
        await run('nuiget.installPackage');
        const options = vi.mocked(vscode.window.showInputBox).mock.calls[0][0]!;
        expect(options).toMatchObject({ title: 'nUIget — Install Package', placeHolder: 'Package ID, for example Newtonsoft.Json', prompt: 'Enter the exact ID of the package to install' });
        expect(options.validateInput?.('')).toBeUndefined();
        expect(options.validateInput?.('   ')).toBeUndefined();
        expect(options.validateInput?.('Newtonsoft.Json')).toBeUndefined();
        expect(options.validateInput?.('../evil')).toBe('Enter a valid package ID, for example Newtonsoft.Json.');
        expect(rowMenu.runRowAction).not.toHaveBeenCalled();
        expect(services.catalog.projects).not.toHaveBeenCalled();
    });

    it('nuiget.installPackage installs the picked version into the selected project', async () => {
        vi.mocked(vscode.window.showInputBox).mockResolvedValue('  Serilog  ');
        const { run, services } = setUp();
        await run('nuiget.installPackage');
        expect(rowMenu.runRowAction).toHaveBeenCalledWith(services, 'install-version', { packageId: 'Serilog', context: 'browse', projectPath: A });
        vi.clearAllMocks();
        vi.mocked(vscode.window.showInputBox).mockResolvedValue(undefined);
        await run('nuiget.installPackage');
        expect(rowMenu.runRowAction).not.toHaveBeenCalled();
    });

    it('nuiget.installPackage asks the central confirmation before a CPM install (N77)', async () => {
        // The install goes through the row menu's flow, which asks the version and confirms a central change; under All Projects
        // it is the browse path, whose projects picker leaves out a target with a central entry. That flow's N77 behaviour is proved
        // in rowMenu.test.ts ("an All Projects install leaves out a project with a central entry and names it"); here nothing is
        // submitted outside it.
        vi.mocked(vscode.window.showInputBox).mockResolvedValue('Serilog');
        const { run, services } = setUp({ selected: ALL_PROJECTS });
        await run('nuiget.installPackage');
        expect(rowMenu.runRowAction).toHaveBeenCalledWith(services, 'install-version', { packageId: 'Serilog', context: 'browse', projectPath: ALL_PROJECTS });
        expect(handlers.submitFromHost).not.toHaveBeenCalled();
    });

    it('nuiget.restorePackages restores the selected project', async () => {
        const { run } = setUp();
        await run('nuiget.restorePackages');
        expect(handlers.operations.restore).toHaveBeenCalledWith(expect.anything(), { projectPaths: [A] });
        expect(handlers.submitFromHost).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: 'restore' }), { kind: 'restore', projectPaths: [A], packageIds: [] });
    });

    it('nuiget.restorePackages under All Projects restores every listed project', async () => {
        const { run } = setUp({ selected: ALL_PROJECTS });
        await run('nuiget.restorePackages');
        expect(handlers.operations.restore).toHaveBeenCalledWith(expect.anything(), { projectPaths: [A, B] });
        vi.clearAllMocks();
        await setUp({ selected: ALL_PROJECTS, projects: [] }).run('nuiget.restorePackages');
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('nUIget: No .NET projects found in this workspace.');
        expect(handlers.submitFromHost).not.toHaveBeenCalled();
    });
});
