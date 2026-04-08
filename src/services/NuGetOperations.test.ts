import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
    executeBulkInstall,
    executeBulkRemoveAllProjects,
    executeBulkRemovePackages,
    executeBulkUpdateAllProjects,
    executeBulkUpdatePackages,
    executeSingleOperation,
    queryAllProjectsInstalled,
    queryAllProjectsUpdates,
    resolveAllProjectsIcons,
    type OperationContext,
} from '../services/NuGetOperations';

// ──────────────────────────────────────────────
// Mock factories
// ──────────────────────────────────────────────
function createMockNuGetService() {
    return {
        installPackage: vi.fn().mockResolvedValue(true),
        updatePackage: vi.fn().mockResolvedValue(true),
        removePackage: vi.fn().mockResolvedValue(true),
        restoreProject: vi.fn().mockResolvedValue(true),
        setupOutputChannel: vi.fn(),
        logBulkOperationHeader: vi.fn(),
        getProjectDependencyMap: vi.fn().mockResolvedValue(new Map()),
        getPackageDependencies: vi.fn().mockResolvedValue(new Map()),
    } as unknown as OperationContext['nugetService'];
}

function createMockCtx(nugetService?: OperationContext['nugetService']): OperationContext {
    return {
        nugetService: nugetService ?? createMockNuGetService(),
        postMessage: vi.fn(),
        notifyOtherPanel: vi.fn(),
    };
}


const mockWithProgress = () => {
    (vscode.window.withProgress as any) = vi.fn(
        (_opts: unknown, task: (progress: { report: ReturnType<typeof vi.fn> }) => Promise<unknown>) =>
            task({ report: vi.fn() })
    );
};

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

describe('executeSingleOperation', () => {
    let ctx: OperationContext;

    beforeEach(() => {
        ctx = createMockCtx();
        // withProgress executes the callback
        mockWithProgress();
    });

    // ---- install ----
    it('install success: posts result and notifies', async () => {
        const result = await executeSingleOperation(ctx, 'install', '/proj.csproj', 'Newtonsoft.Json', '13.0.3', 'https://api.nuget.org');
        expect(result).toBe(true);
        expect(ctx.nugetService.installPackage).toHaveBeenCalledWith('/proj.csproj', 'Newtonsoft.Json', '13.0.3', { sourceUrl: 'https://api.nuget.org' });
        expect(ctx.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'installResult', success: true, packageId: 'Newtonsoft.Json' }));
        expect(ctx.notifyOtherPanel).toHaveBeenCalledWith(expect.objectContaining({ type: 'install', packageId: 'Newtonsoft.Json' }));
    });

    it('install failure: posts result, does NOT notify', async () => {
        vi.mocked(ctx.nugetService.installPackage).mockResolvedValue(false);
        const result = await executeSingleOperation(ctx, 'install', '/proj.csproj', 'BadPkg');
        expect(result).toBe(false);
        expect(ctx.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'installResult', success: false }));
        expect(ctx.notifyOtherPanel).not.toHaveBeenCalled();
    });

    // ---- update ----
    it('update success: calls updatePackage with version', async () => {
        const result = await executeSingleOperation(ctx, 'update', '/proj.csproj', 'Serilog', '4.0.0');
        expect(result).toBe(true);
        expect(ctx.nugetService.updatePackage).toHaveBeenCalledWith('/proj.csproj', 'Serilog', '4.0.0', { sourceUrl: undefined });
        expect(ctx.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'updateResult', success: true }));
        expect(ctx.notifyOtherPanel).toHaveBeenCalled();
    });

    it('update throws when version is missing', async () => {
        await expect(executeSingleOperation(ctx, 'update', '/proj.csproj', 'Serilog'))
            .rejects.toThrow('Update operation requires a target version');
    });

    // ---- remove ----
    it('remove success: calls removePackage', async () => {
        const result = await executeSingleOperation(ctx, 'remove', '/proj.csproj', 'Obsolete.Pkg');
        expect(result).toBe(true);
        expect(ctx.nugetService.removePackage).toHaveBeenCalledWith('/proj.csproj', 'Obsolete.Pkg');
        expect(ctx.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'removeResult', success: true }));
        expect(ctx.notifyOtherPanel).toHaveBeenCalled();
    });

    it('remove failure: does not notify', async () => {
        vi.mocked(ctx.nugetService.removePackage).mockResolvedValue(false);
        const result = await executeSingleOperation(ctx, 'remove', '/proj.csproj', 'Locked.Pkg');
        expect(result).toBe(false);
        expect(ctx.notifyOtherPanel).not.toHaveBeenCalled();
    });
});

// ──────────────────────────────────────────────
// executeBulkInstall
// ──────────────────────────────────────────────
describe('executeBulkInstall', () => {
    let ctx: OperationContext;

    beforeEach(() => {
        ctx = createMockCtx();
        mockWithProgress();
    });

    it('installs to multiple projects and restores', async () => {
        await executeBulkInstall(ctx, ['/a.csproj', '/b.csproj'], 'Newtonsoft.Json', '13.0.3');

        expect(ctx.nugetService.installPackage).toHaveBeenCalledTimes(2);
        expect(ctx.nugetService.restoreProject).toHaveBeenCalledTimes(2);
        expect(ctx.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'bulkInstallResult',
            packageId: 'Newtonsoft.Json',
            results: expect.arrayContaining([
                expect.objectContaining({ success: true }),
            ]),
        }));
        expect(ctx.notifyOtherPanel).toHaveBeenCalledWith(expect.objectContaining({ type: 'bulkInstall' }));
    });

    it('handles partial failure', async () => {
        vi.mocked(ctx.nugetService.installPackage)
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false);

        await executeBulkInstall(ctx, ['/a.csproj', '/b.csproj'], 'TestPkg');

        // Only successful project gets restored
        expect(ctx.nugetService.restoreProject).toHaveBeenCalledTimes(1);
        expect(vscode.window.showWarningMessage).toHaveBeenCalled();
        // Still notifies since at least one succeeded
        expect(ctx.notifyOtherPanel).toHaveBeenCalled();
    });

    it('shows info message on full success', async () => {
        await executeBulkInstall(ctx, ['/proj.csproj'], 'Serilog', '4.0.0');
        expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });

    it('sends empty result for empty projectPaths', async () => {
        await executeBulkInstall(ctx, [], 'Serilog');
        expect(ctx.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'bulkInstallResult',
            results: [],
        }));
        expect(ctx.notifyOtherPanel).not.toHaveBeenCalled();
    });

    it('does not notify if all installs fail', async () => {
        vi.mocked(ctx.nugetService.installPackage).mockResolvedValue(false);
        await executeBulkInstall(ctx, ['/a.csproj'], 'BadPkg');
        expect(ctx.notifyOtherPanel).not.toHaveBeenCalled();
    });
});

// ──────────────────────────────────────────────
// executeBulkUpdatePackages
// ──────────────────────────────────────────────
describe('executeBulkUpdatePackages', () => {
    let ctx: OperationContext;

    beforeEach(() => {
        ctx = createMockCtx();
        mockWithProgress();
    });

    it('updates all packages and restores once', async () => {
        const packages = [
            { id: 'PkgA', version: '2.0.0' },
            { id: 'PkgB', version: '3.0.0' },
        ];
        await executeBulkUpdatePackages(ctx, packages, '/proj.csproj');

        expect(ctx.nugetService.updatePackage).toHaveBeenCalledTimes(2);
        expect(ctx.nugetService.restoreProject).toHaveBeenCalledTimes(1);
        expect(ctx.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'bulkUpdateResult',
            projectPath: '/proj.csproj',
            failedPackageIds: [],
        }));
        expect(ctx.notifyOtherPanel).toHaveBeenCalled();
    });

    it('tracks failed package IDs', async () => {
        vi.mocked(ctx.nugetService.updatePackage)
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false);

        await executeBulkUpdatePackages(ctx, [
            { id: 'Good', version: '1.0' },
            { id: 'Bad', version: '2.0' },
        ], '/proj.csproj');

        expect(ctx.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'bulkUpdateResult',
            failedPackageIds: ['Bad'],
        }));
    });

    it('sends empty result for empty packages', async () => {
        await executeBulkUpdatePackages(ctx, [], '/proj.csproj');
        expect(ctx.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'bulkUpdateResult',
            failedPackageIds: [],
        }));
    });

    it('does not notify if all fail', async () => {
        vi.mocked(ctx.nugetService.updatePackage).mockResolvedValue(false);
        await executeBulkUpdatePackages(ctx, [{ id: 'Fail', version: '1.0' }], '/proj.csproj');
        expect(ctx.notifyOtherPanel).not.toHaveBeenCalled();
    });

    it('passes skipRestore and skipNotification options', async () => {
        await executeBulkUpdatePackages(ctx, [{ id: 'PkgA', version: '2.0.0', sourceUrl: 'https://custom.feed' }], '/proj.csproj');
        expect(ctx.nugetService.updatePackage).toHaveBeenCalledWith(
            '/proj.csproj', 'PkgA', '2.0.0',
            expect.objectContaining({ skipRestore: true, skipNotification: true, sourceUrl: 'https://custom.feed' })
        );
    });
});

// ──────────────────────────────────────────────
// executeBulkRemovePackages
// ──────────────────────────────────────────────
describe('executeBulkRemovePackages', () => {
    let ctx: OperationContext;

    beforeEach(() => {
        ctx = createMockCtx();
        mockWithProgress();
    });

    it('removes packages and sends confirmed + result', async () => {
        await executeBulkRemovePackages(ctx, ['PkgA', 'PkgB'], '/proj.csproj');

        // bulkRemoveConfirmed is sent first
        expect(ctx.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'bulkRemoveConfirmed' }));
        // Then the result
        expect(ctx.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'bulkRemoveResult',
            failedPackageIds: [],
        }));
        expect(ctx.nugetService.removePackage).toHaveBeenCalledTimes(2);
        expect(ctx.nugetService.restoreProject).toHaveBeenCalledTimes(1);
    });

    it('tracks failed package IDs', async () => {
        vi.mocked(ctx.nugetService.removePackage)
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true);

        await executeBulkRemovePackages(ctx, ['FailPkg', 'GoodPkg'], '/proj.csproj');

        expect(ctx.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'bulkRemoveResult',
            failedPackageIds: ['FailPkg'],
        }));
        expect(ctx.notifyOtherPanel).toHaveBeenCalled();
    });

    it('sends empty result for empty packages', async () => {
        await executeBulkRemovePackages(ctx, [], '/proj.csproj');
        expect(ctx.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'bulkRemoveResult',
            failedPackageIds: [],
        }));
    });

    it('passes skipRestore and skipNotification to removePackage', async () => {
        await executeBulkRemovePackages(ctx, ['PkgA'], '/proj.csproj');
        expect(ctx.nugetService.removePackage).toHaveBeenCalledWith(
            '/proj.csproj', 'PkgA',
            expect.objectContaining({ skipRestore: true, skipNotification: true })
        );
    });
});

// ──────────────────────────────────────────────
// executeBulkUpdateAllProjects
// ──────────────────────────────────────────────
describe('executeBulkUpdateAllProjects', () => {
    let ctx: OperationContext;

    beforeEach(() => {
        ctx = createMockCtx();
        mockWithProgress();
    });

    it('updates packages across multiple projects', async () => {
        const updates = [
            { projectPath: '/a.csproj', projectName: 'a.csproj', packages: [{ id: 'P1', version: '2.0' }] },
            { projectPath: '/b.csproj', projectName: 'b.csproj', packages: [{ id: 'P2', version: '3.0' }] },
        ];
        await executeBulkUpdateAllProjects(ctx, updates);

        expect(ctx.nugetService.updatePackage).toHaveBeenCalledTimes(2);
        expect(ctx.nugetService.restoreProject).toHaveBeenCalledTimes(2);
        expect(ctx.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'bulkUpdateAllProjectsResult',
            perProjectFailedIds: [],
        }));
        expect(ctx.notifyOtherPanel).toHaveBeenCalledWith(expect.objectContaining({ type: 'bulkUpdateAllProjects' }));
    });

    it('tracks per-project failures', async () => {
        vi.mocked(ctx.nugetService.updatePackage)
            .mockResolvedValueOnce(true)  // project 1
            .mockResolvedValueOnce(false); // project 2

        const updates = [
            { projectPath: '/a.csproj', projectName: 'a.csproj', packages: [{ id: 'Good', version: '1.0' }] },
            { projectPath: '/b.csproj', projectName: 'b.csproj', packages: [{ id: 'Bad', version: '2.0' }] },
        ];
        await executeBulkUpdateAllProjects(ctx, updates);

        expect(ctx.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'bulkUpdateAllProjectsResult',
            perProjectFailedIds: [{ projectPath: '/b.csproj', failedPackageIds: ['Bad'] }],
        }));
        // At least one succeeded, so notify
        expect(ctx.notifyOtherPanel).toHaveBeenCalled();
    });

    it('sends empty result for empty input', async () => {
        await executeBulkUpdateAllProjects(ctx, []);
        expect(ctx.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'bulkUpdateAllProjectsResult',
            perProjectFailedIds: [],
        }));
    });

    it('does not notify if all fail', async () => {
        vi.mocked(ctx.nugetService.updatePackage).mockResolvedValue(false);
        const updates = [
            { projectPath: '/a.csproj', projectName: 'a.csproj', packages: [{ id: 'Bad', version: '1.0' }] },
        ];
        await executeBulkUpdateAllProjects(ctx, updates);
        expect(ctx.notifyOtherPanel).not.toHaveBeenCalled();
    });

    it('only restores projects with successful changes', async () => {
        vi.mocked(ctx.nugetService.updatePackage)
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false);

        const updates = [
            { projectPath: '/a.csproj', projectName: 'a.csproj', packages: [{ id: 'OK', version: '1.0' }] },
            { projectPath: '/b.csproj', projectName: 'b.csproj', packages: [{ id: 'Fail', version: '2.0' }] },
        ];
        await executeBulkUpdateAllProjects(ctx, updates);

        expect(ctx.nugetService.restoreProject).toHaveBeenCalledTimes(1);
        expect(ctx.nugetService.restoreProject).toHaveBeenCalledWith('/a.csproj');
    });
});

// ──────────────────────────────────────────────
// executeBulkRemoveAllProjects
// ──────────────────────────────────────────────
describe('executeBulkRemoveAllProjects', () => {
    let ctx: OperationContext;

    beforeEach(() => {
        ctx = createMockCtx();
        mockWithProgress();
    });

    it('removes packages across multiple projects', async () => {
        const removals = [
            { projectPath: '/a.csproj', projectName: 'a.csproj', packages: ['PkgA'] },
            { projectPath: '/b.csproj', projectName: 'b.csproj', packages: ['PkgB'] },
        ];
        await executeBulkRemoveAllProjects(ctx, removals);

        // sends confirmed first
        expect(ctx.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'bulkRemoveAllProjectsConfirmed' }));
        expect(ctx.nugetService.removePackage).toHaveBeenCalledTimes(2);
        expect(ctx.nugetService.restoreProject).toHaveBeenCalledTimes(2);
        expect(ctx.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'bulkRemoveAllProjectsResult',
            perProjectFailedIds: [],
        }));
        expect(ctx.notifyOtherPanel).toHaveBeenCalledWith(expect.objectContaining({ type: 'bulkRemoveAllProjects' }));
    });

    it('tracks per-project failures', async () => {
        vi.mocked(ctx.nugetService.removePackage)
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true);

        const removals = [
            { projectPath: '/a.csproj', projectName: 'a.csproj', packages: ['FailPkg'] },
            { projectPath: '/b.csproj', projectName: 'b.csproj', packages: ['GoodPkg'] },
        ];
        await executeBulkRemoveAllProjects(ctx, removals);

        expect(ctx.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'bulkRemoveAllProjectsResult',
            perProjectFailedIds: [{ projectPath: '/a.csproj', failedPackageIds: ['FailPkg'] }],
        }));
    });

    it('sends empty result for empty input', async () => {
        await executeBulkRemoveAllProjects(ctx, []);
        expect(ctx.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'bulkRemoveAllProjectsResult',
            perProjectFailedIds: [],
        }));
    });

    it('does not notify if all fail', async () => {
        vi.mocked(ctx.nugetService.removePackage).mockResolvedValue(false);
        const removals = [
            { projectPath: '/a.csproj', projectName: 'a.csproj', packages: ['FailPkg'] },
        ];
        await executeBulkRemoveAllProjects(ctx, removals);
        expect(ctx.notifyOtherPanel).not.toHaveBeenCalled();
    });

    it('restores projects in reverse dependency order', async () => {
        const restoreCalls: string[] = [];
        vi.mocked(ctx.nugetService.restoreProject).mockImplementation(async (p: string) => {
            restoreCalls.push(p);
            return true;
        });

        const removals = [
            { projectPath: '/a.csproj', projectName: 'a.csproj', packages: ['P1'] },
            { projectPath: '/b.csproj', projectName: 'b.csproj', packages: ['P2'] },
        ];
        await executeBulkRemoveAllProjects(ctx, removals);

        // Restore is called in reverse order of projectsWithChanges
        expect(restoreCalls.length).toBe(2);
        // The last project processed should be restored first (reverse dependency order)
        expect(restoreCalls[0]).toBe(removals[1].projectPath);
        expect(restoreCalls[1]).toBe(removals[0].projectPath);
    });
});

// ──────────────────────────────────────────────
// Shared query functions
// ──────────────────────────────────────────────

describe('queryAllProjectsUpdates', () => {
    function createQueryService() {
        return {
            findProjects: vi.fn().mockResolvedValue([]),
            getInstalledPackages: vi.fn().mockResolvedValue([]),
            checkPackageUpdatesMinimal: vi.fn().mockResolvedValue([]),
        } as any;
    }

    it('returns updates for projects with outdated packages', async () => {
        const svc = createQueryService();
        svc.findProjects.mockResolvedValue([
            { path: '/a.csproj', name: 'A' },
            { path: '/b.csproj', name: 'B' },
        ]);
        svc.getInstalledPackages
            .mockResolvedValueOnce([{ id: 'Pkg', version: '1.0' }])
            .mockResolvedValueOnce([]);
        svc.checkPackageUpdatesMinimal
            .mockResolvedValueOnce([{ id: 'Pkg', installedVersion: '1.0', latestVersion: '2.0' }]);

        const result = await queryAllProjectsUpdates(svc, false, false);

        expect(result).toEqual([{
            projectPath: '/a.csproj',
            projectName: 'A',
            updates: [{ id: 'Pkg', installedVersion: '1.0', latestVersion: '2.0' }],
        }]);
        expect(svc.getInstalledPackages).toHaveBeenCalledWith('/a.csproj', false);
    });

    it('passes liteMode to getInstalledPackages', async () => {
        const svc = createQueryService();
        svc.findProjects.mockResolvedValue([{ path: '/a.csproj', name: 'A' }]);
        svc.getInstalledPackages.mockResolvedValue([]);

        await queryAllProjectsUpdates(svc, true, true);

        expect(svc.getInstalledPackages).toHaveBeenCalledWith('/a.csproj', true);
        expect(svc.checkPackageUpdatesMinimal).not.toHaveBeenCalled();
    });

    it('skips erroring projects and continues', async () => {
        const svc = createQueryService();
        svc.findProjects.mockResolvedValue([
            { path: '/bad.csproj', name: 'Bad' },
            { path: '/good.csproj', name: 'Good' },
        ]);
        svc.getInstalledPackages
            .mockRejectedValueOnce(new Error('fail'))
            .mockResolvedValueOnce([{ id: 'A', version: '1.0' }]);
        svc.checkPackageUpdatesMinimal.mockResolvedValueOnce([]);

        const result = await queryAllProjectsUpdates(svc, false, false);

        expect(result).toEqual([]);
    });
});

describe('queryAllProjectsInstalled', () => {
    function createQueryService() {
        return {
            findProjects: vi.fn().mockResolvedValue([]),
            getInstalledPackages: vi.fn().mockResolvedValue([]),
        } as any;
    }

    it('collects installed packages from all projects', async () => {
        const svc = createQueryService();
        svc.findProjects.mockResolvedValue([{ path: '/a.csproj', name: 'A' }]);
        svc.getInstalledPackages.mockResolvedValue([
            { id: 'Pkg', version: '1.0', resolvedVersion: '1.0.0', isImplicit: false },
        ]);

        const result = await queryAllProjectsInstalled(svc);

        expect(result).toEqual([{
            projectPath: '/a.csproj',
            projectName: 'A',
            packages: [{ id: 'Pkg', version: '1.0', resolvedVersion: '1.0.0', isImplicit: false }],
        }]);
        expect(svc.getInstalledPackages).toHaveBeenCalledWith('/a.csproj', true);
    });

    it('skips erroring projects and continues', async () => {
        const svc = createQueryService();
        svc.findProjects.mockResolvedValue([
            { path: '/bad.csproj', name: 'Bad' },
            { path: '/good.csproj', name: 'Good' },
        ]);
        svc.getInstalledPackages
            .mockRejectedValueOnce(new Error('fail'))
            .mockResolvedValueOnce([{ id: 'A', version: '2.0' }]);

        const result = await queryAllProjectsInstalled(svc);

        expect(result).toEqual([{
            projectPath: '/good.csproj',
            projectName: 'Good',
            packages: [{ id: 'A', version: '2.0', resolvedVersion: undefined, isImplicit: undefined }],
        }]);
    });
});

describe('resolveAllProjectsIcons', () => {
    it('deduplicates packages and returns icon map', async () => {
        const svc = createMockNuGetService();
        (svc as any).getPackageIconUrl = vi.fn()
            .mockResolvedValueOnce('https://icon/a.png')
            .mockResolvedValueOnce('https://icon/b.png');

        const result = await resolveAllProjectsIcons(svc as any, [
            { id: 'A', version: '1.0' },
            { id: 'A', version: '1.0' }, // duplicate
            { id: 'B', version: '2.0' },
        ]);

        expect((svc as any).getPackageIconUrl).toHaveBeenCalledTimes(2);
        expect(result).toEqual({
            'A@1.0': 'https://icon/a.png',
            'B@2.0': 'https://icon/b.png',
        });
    });

    it('skips packages with no icon', async () => {
        const svc = createMockNuGetService();
        (svc as any).getPackageIconUrl = vi.fn().mockResolvedValue(undefined);

        const result = await resolveAllProjectsIcons(svc as any, [
            { id: 'A', version: '1.0' },
        ]);

        expect(result).toEqual({});
    });

    it('handles errors gracefully per-package', async () => {
        const svc = createMockNuGetService();
        (svc as any).getPackageIconUrl = vi.fn()
            .mockRejectedValueOnce(new Error('fail'))
            .mockResolvedValueOnce('https://icon/b.png');

        const result = await resolveAllProjectsIcons(svc as any, [
            { id: 'A', version: '1.0' },
            { id: 'B', version: '2.0' },
        ]);

        expect(result).toEqual({
            'B@2.0': 'https://icon/b.png',
        });
    });

    it('returns empty map for empty input', async () => {
        const svc = createMockNuGetService();
        const result = await resolveAllProjectsIcons(svc as any, []);
        expect(result).toEqual({});
    });
});
