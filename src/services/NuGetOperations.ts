import * as path from 'path';
import * as vscode from 'vscode';
import type { NuGetService } from './NuGetService';
import type { InstalledPackage } from './NuGetTypes';
import { batchedPromiseAll, topologicalSortByDependency } from './NuGetUtils';

// --- Shared types ---

/** Panel-agnostic context for executing NuGet operations. */
export interface OperationContext {
    nugetService: NuGetService;
    postMessage: (message: unknown) => void;
    notifyOtherPanel: (operation: { type: string; packageId?: string; packageIds?: string[]; projectPath?: string; version?: string }) => void;
}

type SingleOperationType = 'install' | 'update' | 'remove';

const singleOpConfig: Record<SingleOperationType, {
    serviceMethod: 'installPackage' | 'updatePackage' | 'removePackage';
    progressVerb: string;
    resultType: string;
}> = {
    install: { serviceMethod: 'installPackage', progressVerb: 'Installing', resultType: 'installResult' },
    update: { serviceMethod: 'updatePackage', progressVerb: 'Updating', resultType: 'updateResult' },
    remove: { serviceMethod: 'removePackage', progressVerb: 'Removing', resultType: 'removeResult' },
};

// --- Single operations ---

/**
 * Execute a single install/update/remove operation.
 * Returns true if the operation succeeded.
 */
export async function executeSingleOperation(
    ctx: OperationContext,
    operationType: SingleOperationType,
    projectPath: string,
    packageId: string,
    version?: string,
    sourceUrl?: string
): Promise<boolean> {
    const config = singleOpConfig[operationType];
    let success = false;

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `${config.progressVerb} ${packageId}...`,
        cancellable: false
    }, async () => {
        if (operationType === 'install') {
            success = await ctx.nugetService.installPackage(projectPath, packageId, version, { sourceUrl });
        } else if (operationType === 'update') {
            if (!version) {
                throw new Error(`Update operation requires a target version for ${packageId}`);
            }
            success = await ctx.nugetService.updatePackage(projectPath, packageId, version, { sourceUrl });
        } else {
            success = await ctx.nugetService.removePackage(projectPath, packageId);
        }
        ctx.postMessage({
            type: config.resultType,
            success,
            packageId,
            projectPath,
            version
        });
    });

    if (success) {
        ctx.notifyOtherPanel({ type: operationType, packageId, projectPath, version });
    }

    return success;
}

// --- Bulk Install (main panel only) ---

export async function executeBulkInstall(
    ctx: OperationContext,
    projectPaths: string[],
    packageId: string,
    version?: string
): Promise<void> {
    if (!projectPaths || projectPaths.length === 0) {
        console.warn('[nUIget] bulkInstall received empty projectPaths array');
        ctx.postMessage({ type: 'bulkInstallResult', packageId, version, results: [] });
        return;
    }

    // Topological sort: install to dependency projects first
    const projectDepMap = await ctx.nugetService.getProjectDependencyMap(projectPaths);
    const isWindows = process.platform === 'win32';
    const normalizeProjectPath = (p: string) => {
        const normalized = path.normalize(p);
        return isWindows ? normalized.toLowerCase() : normalized;
    };
    const selectedProjectKeys = new Set(projectPaths.map(normalizeProjectPath));
    const sortedProjectPaths = topologicalSortByDependency(
        projectPaths,
        p => normalizeProjectPath(p),
        projectDepMap,
        selectedProjectKeys,
        true // dependenciesFirst
    );

    ctx.nugetService.setupOutputChannel();
    ctx.nugetService.logBulkOperationHeader(`Installing ${packageId} to ${sortedProjectPaths.length} project${sortedProjectPaths.length !== 1 ? 's' : ''}...`, 0);

    const results: { projectPath: string; projectName: string; success: boolean }[] = [];

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Installing ${packageId} to ${projectPaths.length} projects...`,
        cancellable: false
    }, async (progress) => {
        for (let i = 0; i < sortedProjectPaths.length; i++) {
            const projPath = sortedProjectPaths[i];
            const projectName = projPath.split(/[\\/]/).pop() || projPath;
            progress.report({
                message: `(${i + 1}/${sortedProjectPaths.length}) ${projectName}`,
                increment: (100 / sortedProjectPaths.length)
            });

            const success = await ctx.nugetService.installPackage(projPath, packageId, version,
                { skipChannelSetup: true, skipRestore: true });
            results.push({ projectPath: projPath, projectName, success });
        }

        const successCount = results.filter(r => r.success).length;
        const failCount = results.length - successCount;

        // Run a single restore after all installs
        if (successCount > 0) {
            progress.report({ message: 'Restoring projects...' });
            for (const r of results) {
                if (r.success) {
                    await ctx.nugetService.restoreProject(r.projectPath);
                }
            }
        }

        if (failCount === 0) {
            vscode.window.showInformationMessage(`Successfully installed ${packageId} to ${successCount} project${successCount !== 1 ? 's' : ''}.`);
        } else {
            vscode.window.showWarningMessage(`Installed ${packageId} to ${successCount}/${sortedProjectPaths.length} projects, ${failCount} failed.`);
        }
    });

    ctx.postMessage({ type: 'bulkInstallResult', packageId, version, results });
    if (results.some(r => r.success)) {
        const successProjectPaths = results.filter(r => r.success).map(r => r.projectPath);
        ctx.notifyOtherPanel({ type: 'bulkInstall', packageId, projectPath: successProjectPaths[0] });
    }
}

// --- Bulk Update Packages (single project) ---

export async function executeBulkUpdatePackages(
    ctx: OperationContext,
    packages: { id: string; version: string; sourceUrl?: string }[],
    projectPath: string
): Promise<void> {
    if (!packages || packages.length === 0) {
        console.warn('[nUIget] bulkUpdatePackages received empty packages array');
        ctx.postMessage({ type: 'bulkUpdateResult', projectPath, failedPackageIds: [] });
        return;
    }

    // Topological sort: dependencies first
    const dependencyMap = await ctx.nugetService.getPackageDependencies(projectPath);
    const packagesToUpdate = new Set(packages.map(p => p.id.toLowerCase()));
    const sortedPackages = topologicalSortByDependency(
        packages,
        p => p.id.toLowerCase(),
        dependencyMap,
        packagesToUpdate,
        true // dependenciesFirst
    );

    ctx.nugetService.setupOutputChannel();
    ctx.nugetService.logBulkOperationHeader('Updating', sortedPackages.length);

    const failedPackageIds: string[] = [];
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Updating ${sortedPackages.length} packages...`,
        cancellable: false
    }, async (progress) => {
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < sortedPackages.length; i++) {
            const pkg = sortedPackages[i];
            progress.report({
                message: `(${i + 1}/${sortedPackages.length}) ${pkg.id}`,
                increment: 100 / sortedPackages.length
            });

            const success = await ctx.nugetService.updatePackage(
                projectPath, pkg.id, pkg.version,
                { skipChannelSetup: true, skipNotification: true, skipRestore: true, sourceUrl: pkg.sourceUrl }
            );

            if (success) { successCount++; } else { failCount++; failedPackageIds.push(pkg.id); }
        }

        // Run a single restore after all packages are updated
        if (successCount > 0) {
            progress.report({ message: 'Restoring project...' });
            await ctx.nugetService.restoreProject(projectPath);
        }

        if (failCount === 0) {
            vscode.window.showInformationMessage(`Successfully updated ${successCount} packages.`);
        } else {
            vscode.window.showWarningMessage(`Updated ${successCount} packages, ${failCount} failed.`);
        }
    });

    ctx.postMessage({ type: 'bulkUpdateResult', projectPath, failedPackageIds });
    if (failedPackageIds.length < packages.length) {
        const successIds = packages.map(p => p.id).filter(id => !failedPackageIds.includes(id));
        ctx.notifyOtherPanel({ type: 'bulkUpdate', packageIds: successIds, projectPath });
    }
}

// --- Bulk Remove Packages (single project) ---

export async function executeBulkRemovePackages(
    ctx: OperationContext,
    packages: string[],
    projectPath: string
): Promise<void> {
    if (!packages || packages.length === 0) {
        console.warn('[nUIget] confirmBulkRemove received empty packages array');
        ctx.postMessage({ type: 'bulkRemoveResult', projectPath, failedPackageIds: [] });
        return;
    }

    // Notify webview that uninstall is starting
    ctx.postMessage({ type: 'bulkRemoveConfirmed', projectPath });

    // Topological sort: dependents first (opposite of update)
    const dependencyMap = await ctx.nugetService.getPackageDependencies(projectPath);
    const packagesToRemove = new Set(packages.map(p => p.toLowerCase()));
    const sortedPackages = topologicalSortByDependency(
        packages,
        p => p.toLowerCase(),
        dependencyMap,
        packagesToRemove,
        false // dependentsFirst
    );

    ctx.nugetService.setupOutputChannel();
    ctx.nugetService.logBulkOperationHeader('Uninstalling', sortedPackages.length);

    const failedPackageIds: string[] = [];
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Uninstalling ${sortedPackages.length} packages...`,
        cancellable: false
    }, async (progress) => {
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < sortedPackages.length; i++) {
            const packageId = sortedPackages[i];
            progress.report({
                message: `(${i + 1}/${sortedPackages.length}) ${packageId}`,
                increment: (100 / sortedPackages.length)
            });

            const success = await ctx.nugetService.removePackage(
                projectPath, packageId,
                { skipChannelSetup: true, skipRestore: true, skipNotification: true }
            );

            if (success) { successCount++; } else { failCount++; failedPackageIds.push(packageId); }
        }

        // Run a single restore after all packages are removed
        if (successCount > 0) {
            progress.report({ message: 'Restoring project...' });
            await ctx.nugetService.restoreProject(projectPath);
        }

        if (failCount === 0) {
            vscode.window.showInformationMessage(`Successfully uninstalled ${successCount} packages.`);
        } else {
            vscode.window.showWarningMessage(`Uninstalled ${successCount} packages, ${failCount} failed.`);
        }
    });

    ctx.postMessage({ type: 'bulkRemoveResult', projectPath, failedPackageIds });
    if (failedPackageIds.length < packages.length) {
        const successIds = packages.filter(id => !failedPackageIds.includes(id));
        ctx.notifyOtherPanel({ type: 'bulkRemove', packageIds: successIds, projectPath });
    }
}

// --- Shared helper for multi-project topo sort ---

function buildProjectTopoSort<T>(
    items: T[],
    getProjectPath: (item: T) => string,
    projectDepMap: Map<string, string[]>,
    dependenciesFirst: boolean
): T[] {
    const isWindows = process.platform === 'win32';
    const normalizeProjectPath = (p: string) => {
        const normalized = path.normalize(p);
        return isWindows ? normalized.toLowerCase() : normalized;
    };
    const allProjectPaths = items.map(item => getProjectPath(item));
    const selectedProjectKeys = new Set(allProjectPaths.map(normalizeProjectPath));

    return topologicalSortByDependency(
        items,
        item => normalizeProjectPath(getProjectPath(item)),
        projectDepMap,
        selectedProjectKeys,
        dependenciesFirst
    );
}

// --- Bulk Update All Projects ---

export async function executeBulkUpdateAllProjects(
    ctx: OperationContext,
    projectUpdates: { projectPath: string; projectName: string; packages: { id: string; version: string; sourceUrl?: string }[] }[]
): Promise<void> {
    if (!projectUpdates || projectUpdates.length === 0) {
        console.warn('[nUIget] bulkUpdateAllProjects received empty projectUpdates array');
        ctx.postMessage({ type: 'bulkUpdateAllProjectsResult', perProjectFailedIds: [] });
        return;
    }

    // Build project-level dependency map and sort
    const allProjectPaths = projectUpdates.map(pu => pu.projectPath);
    const projectDepMap = await ctx.nugetService.getProjectDependencyMap(allProjectPaths);
    const sortedProjectUpdates = buildProjectTopoSort(
        projectUpdates, pu => pu.projectPath, projectDepMap, true // dependenciesFirst
    );

    const totalPackages = sortedProjectUpdates.reduce((sum, pu) => sum + pu.packages.length, 0);
    ctx.nugetService.setupOutputChannel();

    const perProjectFailedIds: { projectPath: string; failedPackageIds: string[] }[] = [];
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Updating ${totalPackages} packages across ${sortedProjectUpdates.length} projects...`,
        cancellable: false
    }, async (progress) => {
        let totalSuccessCount = 0;
        let totalFailCount = 0;
        let completedPackages = 0;
        const projectsWithChanges: { projectPath: string; projectName: string }[] = [];

        // Phase 1: Update all packages across all projects (no restores)
        for (const pu of sortedProjectUpdates) {
            // Topological sort packages within each project (dependencies first)
            const dependencyMap = await ctx.nugetService.getPackageDependencies(pu.projectPath);
            const packagesToUpdate = new Set(pu.packages.map(p => p.id.toLowerCase()));
            const sortedPackages = topologicalSortByDependency(
                pu.packages,
                p => p.id.toLowerCase(),
                dependencyMap,
                packagesToUpdate,
                true // dependenciesFirst
            );

            ctx.nugetService.logBulkOperationHeader(`Updating ${sortedPackages.length} package${sortedPackages.length !== 1 ? 's' : ''} for ${pu.projectName}...`, 0);

            let projectSuccess = false;
            const projectFailedIds: string[] = [];
            for (const pkg of sortedPackages) {
                completedPackages++;
                progress.report({
                    message: `(${completedPackages}/${totalPackages}) ${pu.projectName}: ${pkg.id}`,
                    increment: 100 / totalPackages
                });

                const success = await ctx.nugetService.updatePackage(
                    pu.projectPath, pkg.id, pkg.version,
                    { skipChannelSetup: true, skipNotification: true, skipRestore: true, sourceUrl: pkg.sourceUrl }
                );

                if (success) { totalSuccessCount++; projectSuccess = true; } else { totalFailCount++; projectFailedIds.push(pkg.id); }
            }

            if (projectSuccess) {
                projectsWithChanges.push({ projectPath: pu.projectPath, projectName: pu.projectName });
            }
            if (projectFailedIds.length > 0) {
                perProjectFailedIds.push({ projectPath: pu.projectPath, failedPackageIds: projectFailedIds });
            }
        }

        // Phase 2: Restore all projects in dependency order (after all updates)
        for (const project of projectsWithChanges) {
            progress.report({ message: `Restoring ${project.projectName}...` });
            await ctx.nugetService.restoreProject(project.projectPath);
        }

        if (totalFailCount === 0) {
            vscode.window.showInformationMessage(`Successfully updated ${totalSuccessCount} packages across ${sortedProjectUpdates.length} projects.`);
        } else {
            vscode.window.showWarningMessage(`Updated ${totalSuccessCount} packages, ${totalFailCount} failed across ${sortedProjectUpdates.length} projects.`);
        }
    });

    ctx.postMessage({ type: 'bulkUpdateAllProjectsResult', perProjectFailedIds });
    // Only notify if at least one package succeeded
    const totalFailed = perProjectFailedIds.reduce((sum, p) => sum + p.failedPackageIds.length, 0);
    if (totalFailed < totalPackages) {
        const allFailedIds = new Set(perProjectFailedIds.flatMap(p => p.failedPackageIds));
        const allPackageIds = [...new Set(projectUpdates.flatMap(pu => pu.packages.map(p => p.id)))];
        const successIds = allPackageIds.filter(id => !allFailedIds.has(id));
        ctx.notifyOtherPanel({ type: 'bulkUpdateAllProjects', packageIds: successIds });
    }
}

// --- Bulk Remove All Projects ---

export async function executeBulkRemoveAllProjects(
    ctx: OperationContext,
    projectRemovals: { projectPath: string; projectName: string; packages: string[] }[]
): Promise<void> {
    if (!projectRemovals || projectRemovals.length === 0) {
        console.warn('[nUIget] confirmBulkRemoveAllProjects received empty projectRemovals array');
        ctx.postMessage({ type: 'bulkRemoveAllProjectsResult', perProjectFailedIds: [] });
        return;
    }

    // Notify webview that uninstall is starting
    ctx.postMessage({ type: 'bulkRemoveAllProjectsConfirmed' });

    // Build project-level dependency map and sort: dependents first
    const allProjectPaths = projectRemovals.map(pr => pr.projectPath);
    const projectDepMap = await ctx.nugetService.getProjectDependencyMap(allProjectPaths);
    const sortedProjectRemovals = buildProjectTopoSort(
        projectRemovals, pr => pr.projectPath, projectDepMap, false // dependentsFirst
    );

    const totalPackages = sortedProjectRemovals.reduce((sum, pr) => sum + pr.packages.length, 0);
    ctx.nugetService.setupOutputChannel();
    ctx.nugetService.logBulkOperationHeader(`Uninstalling from ${sortedProjectRemovals.length} projects`, 0);

    const perProjectFailedIds: { projectPath: string; failedPackageIds: string[] }[] = [];
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Uninstalling ${totalPackages} packages from ${sortedProjectRemovals.length} projects...`,
        cancellable: false
    }, async (progress) => {
        let successCount = 0;
        let failCount = 0;
        let processed = 0;
        const projectsWithChanges: { projectPath: string; projectName: string }[] = [];

        // Phase 1: Remove all packages across all projects (no restores)
        for (const pr of sortedProjectRemovals) {
            // Per-project package topo sort: dependents first
            const dependencyMap = await ctx.nugetService.getPackageDependencies(pr.projectPath);
            const packagesToRemove = new Set(pr.packages.map(p => p.toLowerCase()));
            const sortedPackages = topologicalSortByDependency(
                pr.packages,
                p => p.toLowerCase(),
                dependencyMap,
                packagesToRemove,
                false // dependentsFirst
            );

            let projectSuccess = false;
            for (const packageId of sortedPackages) {
                processed++;
                progress.report({
                    message: `(${processed}/${totalPackages}) ${pr.projectName}: ${packageId}`,
                    increment: (100 / totalPackages)
                });

                const success = await ctx.nugetService.removePackage(
                    pr.projectPath, packageId,
                    { skipChannelSetup: true, skipRestore: true, skipNotification: true }
                );

                if (success) {
                    successCount++;
                    projectSuccess = true;
                } else {
                    failCount++;
                    let entry = perProjectFailedIds.find(p => p.projectPath === pr.projectPath);
                    if (!entry) {
                        entry = { projectPath: pr.projectPath, failedPackageIds: [] };
                        perProjectFailedIds.push(entry);
                    }
                    entry.failedPackageIds.push(packageId);
                }
            }

            if (projectSuccess) {
                projectsWithChanges.push({ projectPath: pr.projectPath, projectName: pr.projectName });
            }
        }

        // Phase 2: Restore all projects — reverse order so dependencies restore before dependents
        for (const project of [...projectsWithChanges].reverse()) {
            progress.report({ message: `Restoring ${project.projectName}...` });
            await ctx.nugetService.restoreProject(project.projectPath);
        }

        if (failCount === 0) {
            vscode.window.showInformationMessage(`Successfully uninstalled ${successCount} packages from ${sortedProjectRemovals.length} projects.`);
        } else {
            vscode.window.showWarningMessage(`Uninstalled ${successCount} packages, ${failCount} failed across ${sortedProjectRemovals.length} projects.`);
        }
    });

    ctx.postMessage({ type: 'bulkRemoveAllProjectsResult', perProjectFailedIds });
    // Only notify if at least one package succeeded
    const totalFailed = perProjectFailedIds.reduce((sum, p) => sum + p.failedPackageIds.length, 0);
    if (totalFailed < totalPackages) {
        const allFailedIds = new Set(perProjectFailedIds.flatMap(p => p.failedPackageIds));
        const allPackageIds = [...new Set(projectRemovals.flatMap(pr => pr.packages))];
        const successIds = allPackageIds.filter(id => !allFailedIds.has(id));
        ctx.notifyOtherPanel({ type: 'bulkRemoveAllProjects', packageIds: successIds });
    }
}

// --- Shared query functions (used by both main panel and sidebar) ---

export interface ProjectUpdatesResult {
    projectPath: string;
    projectName: string;
    updates: { id: string; installedVersion: string; latestVersion: string; iconUrl?: string }[];
}

export interface ProjectInstalledResult {
    projectPath: string;
    projectName: string;
    packages: InstalledPackage[];
}

/** Per-project chunk emitted during streaming queryAllProjectsInstalled. */
export interface ProjectInstalledChunk {
    projectPath: string;
    projectName: string;
    /** Present when the per-project fetch succeeded (may be empty array). */
    packages?: InstalledPackage[];
    /** Present when the per-project fetch threw. Never both packages and error are set. */
    error?: string;
}

/** Optional streaming options for queryAllProjectsInstalled. */
export interface QueryAllProjectsInstalledStreamOpts {
    /** Called once with the upfront project list before any per-project work begins. */
    onStart?: (projects: { projectPath: string; projectName: string }[]) => void;
    /** Called once per project, in completion order (success or failure). */
    onProject?: (chunk: ProjectInstalledChunk) => void;
    /** Aborts pending emits (in-flight fetches still finish but their chunks are dropped). */
    signal?: AbortSignal;
}

/**
 * Query all projects for available package updates.
 * @param liteMode When true, uses lightweight installed-package retrieval (sidebar). Panel passes false.
 */
export async function queryAllProjectsUpdates(
    nugetService: NuGetService,
    includePrerelease: boolean,
    liteMode: boolean
): Promise<ProjectUpdatesResult[]> {
    const projects = await nugetService.findProjects();
    const results: ProjectUpdatesResult[] = [];

    // Pre-resolve sources once for ALL projects (avoids per-project re-discovery
    // of service endpoints, auth headers, and health checks)
    const resolvedSources = await nugetService.resolveSourcesForBatch();
    if (resolvedSources.length === 0) { return []; }

    // Parallelize per-project fetching (up to 4 concurrent) for faster loading
    await batchedPromiseAll(projects, async (project) => {
        try {
            const installedPackages = await nugetService.getInstalledPackages(project.path, liteMode);
            if (installedPackages.length > 0) {
                const updates = await nugetService.checkPackageUpdatesMinimal(installedPackages, includePrerelease, resolvedSources);
                if (updates.length > 0) {
                    results.push({
                        projectPath: project.path,
                        projectName: project.name,
                        updates,
                    });
                }
            }
        } catch (error) {
            console.error(`[nUIget] Failed to check updates for ${project.name}:`, error);
        }
    }, 4);

    return results;
}

/**
 * Query all projects for installed packages.
 * @param liteMode When true, skips metadata enrichment (sidebar). Panel passes false for full data.
 * @param opts Optional streaming hooks. When provided, onStart fires once with the upfront project list,
 *             onProject fires once per project (success or error), and signal can abort emits mid-flight.
 *             The returned array still contains successful projects (preserves legacy callers).
 */
export async function queryAllProjectsInstalled(
    nugetService: NuGetService,
    liteMode: boolean,
    opts?: QueryAllProjectsInstalledStreamOpts
): Promise<ProjectInstalledResult[]> {
    const projects = await nugetService.findProjects();
    const results: ProjectInstalledResult[] = [];

    if (opts?.onStart && !opts.signal?.aborted) {
        opts.onStart(projects.map(p => ({ projectPath: p.path, projectName: p.name })));
    }

    // Parallelize per-project fetching (up to 4 concurrent) for faster loading
    await batchedPromiseAll(projects, async (project) => {
        let installedPackages: InstalledPackage[] | undefined;
        let errorMessage: string | undefined;
        try {
            installedPackages = await nugetService.getInstalledPackages(project.path, liteMode);
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[nUIget] Failed to get installed packages for ${project.name}:`, error);
        }
        if (installedPackages) {
            results.push({
                projectPath: project.path,
                projectName: project.name,
                packages: installedPackages,
            });
        }
        if (opts?.onProject && !opts.signal?.aborted) {
            opts.onProject({
                projectPath: project.path,
                projectName: project.name,
                packages: installedPackages,
                error: errorMessage,
            });
        }
    }, 4);

    return results;
}

/**
 * Resolve icon URLs for unique packages across all projects.
 * Returns a map of `packageId@version` → `iconUrl`.
 * Uses deduplication to avoid redundant fetches for packages shared across projects.
 */
export async function resolveAllProjectsIcons(
    nugetService: NuGetService,
    packages: Array<{ id: string; version: string }>
): Promise<Record<string, string>> {
    // Deduplicate by packageId@version
    const uniqueKeys = new Map<string, { id: string; version: string }>();
    for (const pkg of packages) {
        const key = `${pkg.id}@${pkg.version}`;
        if (!uniqueKeys.has(key)) {
            uniqueKeys.set(key, pkg);
        }
    }

    const uniquePackages = [...uniqueKeys.values()];
    const iconMap: Record<string, string> = {};

    await batchedPromiseAll(uniquePackages, async (pkg) => {
        try {
            const iconUrl = await nugetService.getPackageIconUrl(pkg.id, pkg.version);
            if (iconUrl) {
                iconMap[`${pkg.id}@${pkg.version}`] = iconUrl;
            }
        } catch {
            // Icon resolution is non-critical — skip failures silently
        }
    }, 10);

    return iconMap;
}
