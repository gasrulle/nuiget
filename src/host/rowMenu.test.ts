import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { ALL_PROJECTS } from '../protocol';
import type { HostServices } from './services';
import { isRowMenuContext, registerRowMenuCommands } from './rowMenu';

const handlers = vi.hoisted(() => ({
    settleOperation: vi.fn(async () => undefined),
    operations: { install: vi.fn((_s, p) => ({ kind: 'install', ...p })), update: vi.fn((_s, p) => ({ kind: 'update', ...p })), remove: vi.fn((_s, p) => ({ kind: 'remove', ...p })), bulkInstall: vi.fn((_s, p) => ({ kind: 'bulkInstall', ...p })) },
    sourceDirectory: vi.fn(() => '/w'),
}));
vi.mock('./handlers', () => handlers);
const pickers = vi.hoisted(() => ({ pickVersion: vi.fn(async () => '2.0.0'), pickProjectsForInstall: vi.fn(async () => ['/w/A.csproj']), pickSingleProject: vi.fn(async () => '/w/A.csproj') }));
vi.mock('./pickers', () => pickers);
const panel = vi.hoisted(() => ({ MainPanelHost: { navigateToPackage: vi.fn() } }));
vi.mock('./MainPanelHost', () => panel);

const A = '/w/A.csproj';
const row = (changes: Record<string, unknown> = {}) => ({ webviewSection: 'installedRow', packageId: 'Serilog', projectPath: A, installedVersion: '1.0.0', latestVersion: '2.0.0', preventDefaultContextMenuItems: true, webview: 'nugetManager', ...changes });

function setUp(preview?: unknown) {
    const commands = new Map<string, (arg: unknown) => Promise<void>>();
    const warn = vi.fn();
    const services = {
        logger: { warn },
        session: { snapshot: { selectedSource: 'all', includePrerelease: false } },
        catalog: { versions: vi.fn(async () => ({ versions: ['2.0.0'], sourcesUnavailable: false })), projects: vi.fn(async () => ({ value: [{ name: 'A', path: A }] })) },
        mutator: { previewCpmImpact: vi.fn(async () => preview) },
        contextFor: vi.fn(async () => ({})),
    } as unknown as HostServices;
    registerRowMenuCommands(services, (command, handler) => commands.set(command, handler as (arg: unknown) => Promise<void>));
    return { commands, warn, services };
}

describe('the row menu commands (UX-P2.9a)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('registers the eight hidden commands of the manifest', () => {
        expect([...setUp().commands.keys()]).toEqual(['nuiget.row.installLatest', 'nuiget.row.installVersion', 'nuiget.row.uninstall', 'nuiget.row.changeVersion', 'nuiget.row.updateLatest', 'nuiget.row.updateVersion', 'nuiget.row.copyId', 'nuiget.row.viewDetails']);
    });

    it('refuses a malformed context: it is webview input', async () => {
        const { commands, warn } = setUp();
        for (const bad of [undefined, 'x', {}, row({ packageId: 3 }), row({ webviewSection: 'constructor' }), row({ installedProjects: [{ projectPath: 1 }] }), row({ 'nuiget.installed': 'yes' })]) {
            expect(isRowMenuContext(bad)).toBe(false);
            await commands.get('nuiget.row.uninstall')?.(bad);
        }
        expect(warn).toHaveBeenCalledTimes(7);
        expect(handlers.settleOperation).not.toHaveBeenCalled();
    });

    it('each command submits its typed operation', async () => {
        const { commands } = setUp();
        await commands.get('nuiget.row.uninstall')?.(row());
        expect(handlers.operations.remove).toHaveBeenCalledWith(expect.anything(), { projectPath: A, packageId: 'Serilog' });
        await commands.get('nuiget.row.updateLatest')?.(row({ webviewSection: 'updateRow' }));
        expect(handlers.operations.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ projectPath: A, packageId: 'Serilog', version: '2.0.0' }));
        await commands.get('nuiget.row.installLatest')?.(row({ webviewSection: 'browseRow' }));
        expect(handlers.operations.install).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ projectPath: A, version: '2.0.0' }));
        await commands.get('nuiget.row.changeVersion')?.(row());
        expect(pickers.pickVersion).toHaveBeenCalled();
        expect(handlers.settleOperation).toHaveBeenCalledTimes(4);
    });

    it('a central row confirms in a modal naming the projects; Cancel submits nothing', async () => {
        const { commands } = setUp({ fromVersion: '1.0.0', centralPropsPath: '/w/Directory.Packages.props', affectedProjects: [A] });
        const ask = vi.mocked(vscode.window.showWarningMessage);
        ask.mockResolvedValueOnce(undefined);
        await commands.get('nuiget.row.updateLatest')?.(row({ webviewSection: 'updateRow', 'nuiget.central': true }));
        expect(ask).toHaveBeenCalledWith(expect.stringContaining('central version'), expect.objectContaining({ modal: true, detail: expect.stringContaining('A') }), 'Update central version');
        expect(handlers.settleOperation).not.toHaveBeenCalled();
        ask.mockResolvedValueOnce('Update central version' as never);
        await commands.get('nuiget.row.updateLatest')?.(row({ webviewSection: 'updateRow', 'nuiget.central': true }));
        expect(handlers.settleOperation).toHaveBeenCalledTimes(1);
    });

    it('a transitive row copies and shows, and writes nothing', async () => {
        const { commands, warn } = setUp();
        await commands.get('nuiget.row.uninstall')?.(row({ webviewSection: 'transitiveRow' }));
        expect(warn).toHaveBeenCalledTimes(1);
        expect(handlers.settleOperation).not.toHaveBeenCalled();
        await commands.get('nuiget.row.viewDetails')?.(row({ webviewSection: 'transitiveRow' }));
        expect(panel.MainPanelHost.navigateToPackage).toHaveBeenCalledWith(expect.anything(), 'Serilog', '2.0.0');
        await commands.get('nuiget.row.copyId')?.(row({ webviewSection: 'transitiveRow' }));
        expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('Serilog');
    });

    it('a transitive row under All Projects has no project and still copies and shows', async () => {
        const { commands } = setUp();
        const warning = vi.mocked(vscode.window.showWarningMessage);
        await commands.get('nuiget.row.copyId')?.(row({ webviewSection: 'transitiveRow', projectPath: ALL_PROJECTS }));
        await commands.get('nuiget.row.viewDetails')?.(row({ webviewSection: 'transitiveRow', projectPath: ALL_PROJECTS }));
        expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('Serilog');
        expect(panel.MainPanelHost.navigateToPackage).toHaveBeenCalledTimes(1);
        expect(warning).not.toHaveBeenCalled();
    });

    it('a read-only row is refused a write, whatever the menu offered', async () => {
        const { commands, warn } = setUp();
        await commands.get('nuiget.row.uninstall')?.(row({ 'nuiget.readOnly': true }));
        expect(warn).toHaveBeenCalledTimes(1);
        expect(handlers.settleOperation).not.toHaveBeenCalled();
        await commands.get('nuiget.row.copyId')?.(row({ 'nuiget.readOnly': true }));
        expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('Serilog');
    });

    it('an install without a known version submits nothing: it would write a floating version', async () => {
        const { commands } = setUp();
        await commands.get('nuiget.row.installLatest')?.(row({ webviewSection: 'browseRow', latestVersion: undefined }));
        await commands.get('nuiget.row.installLatest')?.(row({ webviewSection: 'browseRow', projectPath: ALL_PROJECTS, latestVersion: undefined }));
        expect(handlers.settleOperation).not.toHaveBeenCalled();
    });

    it('an All Projects install leaves out a project with a central entry and names it', async () => {
        const { commands, services } = setUp();
        const B = '/w/B.csproj';
        pickers.pickProjectsForInstall.mockResolvedValueOnce([A, B]);
        vi.mocked(services.catalog.projects).mockResolvedValue({ value: [{ name: 'A', path: A }, { name: 'B', path: B }] } as never);
        vi.mocked(services.contextFor).mockImplementation(async projectPath => ({ projectPath }) as never);
        vi.mocked(services.mutator.previewCpmImpact).mockImplementation(async (context: unknown) => ((context as { projectPath: string }).projectPath === B ? { affectedProjects: [B] } : undefined) as never);
        await commands.get('nuiget.row.installLatest')?.(row({ webviewSection: 'browseRow', projectPath: ALL_PROJECTS }));
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('Not installed in B'));
        expect(handlers.operations.install).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ projectPath: A }));
        expect(handlers.operations.bulkInstall).not.toHaveBeenCalled();
    });

    it('an All Projects browse row picks its projects; any other row needs a project', async () => {
        const { commands } = setUp();
        await commands.get('nuiget.row.installLatest')?.(row({ webviewSection: 'browseRow', projectPath: ALL_PROJECTS }));
        expect(pickers.pickProjectsForInstall).toHaveBeenCalled();
        expect(handlers.settleOperation).toHaveBeenCalledTimes(1);
        await commands.get('nuiget.row.uninstall')?.(row({ projectPath: ALL_PROJECTS }));
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('Select a specific project for this action.');
        expect(handlers.settleOperation).toHaveBeenCalledTimes(1);
    });
});
