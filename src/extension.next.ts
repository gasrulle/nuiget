/**
 * Composition root of nUIget 2.0: builds the core services once, wires file watchers, commands and the
 * queue's status bar item, and registers both webview surfaces. Business logic lives in `src/core`;
 * this file only assembles.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { TieredCache } from './core/cache';
import { Catalog } from './core/catalog';
import { DefaultDotnetRunner, type DotnetRunnerOptions } from './core/cli';
import type { Logger } from './core/contracts';
import { redact } from './core/logging';
import { DefaultOperationQueue, PackageWorkflows } from './core/ops';
import { AssetsReader, PROJECT_FILE_GLOB, ProjectContextProvider, StaticProjectInspector, findProjects } from './core/project';
import { DefaultQueryCoordinator } from './core/queries';
import { DefaultSessionStore } from './core/session';
import { DotnetSourceProvider } from './core/sources';
import { isPathInside } from './core/util/paths';
import { sourceDirectory } from './host/handlers';
import { MainPanelHost } from './host/MainPanelHost';
import { HostEvents, createWorkflowDeps, loggerFor, readExtensionConfig, type HostServices } from './host/services';
import { SidebarHost } from './host/SidebarHost';
import type { InvalidationReason, InvalidationScope, Project } from './protocol';

const SDK_CACHE_KEY = 'nuiget.sdkVersionCache.v2';
/** Written by 1.x with another shape; removed at activation. */
const LEGACY_SDK_CACHE_KEY = 'nuiget.sdkVersionCache';

const PROJECT_FILE_NAME = /\.(csproj|fsproj|vbproj)$/i;

/** What a test replaces: the process launcher and the lookup of the `dotnet` executable. */
export type ActivationOverrides = Pick<DotnetRunnerOptions, 'spawn' | 'resolveExecutable'>;

export interface ActivatedExtension {
    services: HostServices;
    /** Settles when the first project discovery and session reconciliation are done. */
    ready: Promise<void>;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    await activateWith(context);
}

export function deactivate(): void {
    // Disposables registered on the extension context handle shutdown.
}

export async function activateWith(context: vscode.ExtensionContext, overrides: ActivationOverrides = {}): Promise<ActivatedExtension> {
    const output = vscode.window.createOutputChannel('nUIget', { log: true });
    context.subscriptions.push(output);
    output.info('nUIget is activating');
    // The only logger the core and the surfaces get: nothing reaches the channel unredacted.
    const logger = redactingLogger(loggerFor(output));

    // ── core ──
    const runner = new DefaultDotnetRunner({ logger, ...overrides });
    runner.hydrate(context.globalState, SDK_CACHE_KEY, String(context.extension.packageJSON.version ?? '0.0.0'));
    if (context.globalState.get(LEGACY_SDK_CACHE_KEY) !== undefined) {
        void context.globalState.update(LEGACY_SDK_CACHE_KEY, undefined);
    }
    const cache = new TieredCache({ store: context.workspaceState, logger });
    const sources = new DotnetSourceProvider({ runner, logger });
    const assets = new AssetsReader();
    // The inspector and the context provider keep this array: a workspace-folder change refills it in place.
    const stopDirs: string[] = workspaceRoots();
    const inspector = new StaticProjectInspector({ assets, stopDirs });
    const contexts = new ProjectContextProvider({ runner, sources, stopDirs, logger });
    const coordinator = new DefaultQueryCoordinator({ logger });
    const session = new DefaultSessionStore(context.workspaceState, logger);
    const queue = new DefaultOperationQueue({ maxWaiting: 5, logger });
    // REMOVAL GATE: P4.9 (feeds, the transport and its proxy predicate, credentials and outbound policy per project context, icons through the cache)
    const catalog = new Catalog({
        coordinator, inspector, contexts, sources, assets, logger,
        discoverProjects: () => findProjects(
            async (include, exclude, max) => (await vscode.workspace.findFiles(include, exclude, max)).map(uri => uri.fsPath),
            (vscode.workspace.workspaceFolders ?? []).map(folder => ({ name: folder.name, fsPath: folder.uri.fsPath })),
        ),
    });
    const workflows = new PackageWorkflows(createWorkflowDeps({
        runner, catalog, inspector, queue, logger,
        onCommand: (argv, exitCode, stdout, stderr, durationMs) => {
            logger.info(`$ ${argv.join(' ')}  (exit ${exitCode}, ${durationMs} ms)`);
            if (stdout.trim()) {
                logger.debug(stdout.trimEnd());
            }
            if (stderr.trim()) {
                logger[exitCode === 0 ? 'debug' : 'warn'](stderr.trimEnd());
            }
        },
    }));

    // ── services both surfaces share ──
    const events = new HostEvents();
    const services: HostServices = {
        context, logger, session, catalog, queue, workflows, sources,
        onOperationCompleted: events.operationCompleted.event,
        onOperationProgress: queue.onProgress,
        onConfigChanged: events.configChanged.event,
        onProjectsChanged: events.projectsChanged.event,
        invalidate: (scope, reason) => catalog.invalidate(scope, reason),
        announceOperation: outcome => events.operationCompleted.fire(outcome),
        config: readExtensionConfig,
        workspaceFolderFor,
    };
    const sidebar = new SidebarHost(services);
    context.subscriptions.push(
        events, queue, coordinator, session, sidebar,
        vscode.window.registerWebviewViewProvider(SidebarHost.viewType, sidebar, { webviewOptions: { retainContextWhenHidden: true } }),
        { dispose: () => MainPanelHost.instance?.dispose() },
    );

    // ── projects and session: the selection is checked against the real project and source lists ──
    let lastReconciledProject: string | undefined;
    let lastListing: { directory: string; urls: string[] } | undefined;

    /** The enabled sources of the selected project. A list that cannot be found out is not an empty one: the selection is kept. */
    const enabledSourceUrls = async (): Promise<string[]> => {
        let directory: string | undefined;
        try {
            directory = sourceDirectory(services);
            const urls = (await catalog.sources(directory)).filter(source => source.enabled).map(source => source.url);
            lastListing = { directory, urls };
            return urls;
        } catch (error) {
            logger.warn(`Package sources could not be listed, the selected source is kept: ${describe(error)}`);
            if (directory !== undefined && lastListing?.directory === directory) {
                return lastListing.urls;
            }
            const selected = session.snapshot.selectedSource;
            return selected === 'all' ? [] : [selected];
        }
    };

    const refreshProjectsAndSession = async (): Promise<void> => {
        // Set first, so that the change `reconcile` commits for this project does not ask for another run.
        lastReconciledProject = session.snapshot.selectedProject;
        let projects: Project[];
        try {
            projects = await catalog.projects();
        } catch (error) {
            logger.warn(`Project discovery failed: ${describe(error)}`);
            return;
        }
        events.projectsChanged.fire(projects);
        await vscode.commands.executeCommand('setContext', 'nuiget.hasProjectFiles', projects.length > 0);
        await session.reconcile(projects, await enabledSourceUrls());
    };

    let inFlight: Promise<void> | undefined;
    let rerun = false;
    /** One refresh at a time; requests that arrive while it runs are answered by one more run. */
    const requestRefresh = (): Promise<void> => {
        if (inFlight) {
            rerun = true;
            return inFlight;
        }
        inFlight = (async () => {
            try {
                do {
                    rerun = false;
                    await refreshProjectsAndSession();
                } while (rerun);
            } catch (error) {
                logger.warn(`Refreshing projects and session failed: ${describe(error)}`);
            } finally {
                inFlight = undefined;
            }
        })();
        return inFlight;
    };

    context.subscriptions.push(
        coordinator.onDidInvalidate(event => {
            sidebar.notifyInvalidated(event);
            MainPanelHost.instance?.notifyInvalidated(event);
            // `package` and `metadata` scopes reach neither the project list nor a source list.
            if (event.scope.kind === 'workspace' || event.scope.kind === 'project' || event.scope.kind === 'sources') {
                void requestRefresh();
            }
        }),
        // Sources are per project directory, so another selected project is another source list (ADR-001, ADR-005).
        session.onDidChange(snapshot => {
            if (snapshot.selectedProject !== lastReconciledProject) {
                void requestRefresh();
            }
        }),
    );
    // REMOVAL GATE: P4.9 (the source health monitor starts here and reports to notifySourceHealth of both surfaces)

    // ── queue status ──
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    context.subscriptions.push(statusBar, queue.onDidChange(({ active, pending }) => {
        if (active + pending === 0) {
            statusBar.hide();
            return;
        }
        statusBar.text = pending > 0
            ? `$(sync~spin) nUIget: ${active} running, ${pending} queued`
            : '$(sync~spin) nUIget: operation running';
        statusBar.show();
    }));

    // ── watchers → invalidation ──
    type ScopeFor = (fsPath: string) => InvalidationScope | undefined | Promise<InvalidationScope | undefined>;
    const watch = (glob: string, scopeFor: ScopeFor, reason: InvalidationReason, debounceMs: number) => {
        const watcher = vscode.workspace.createFileSystemWatcher(glob);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const pending = new Set<string>();
        const flush = async (): Promise<void> => {
            const paths = [...pending];
            pending.clear();
            if (queue.isBusy) {
                // The running operation invalidates what it changed; waiting keeps an edit from outside from being lost.
                await queue.waitIdle();
            }
            // All scopes first, so that the coordinator folds the invalidations into one event.
            const scopes = await Promise.all(paths.map(fsPath => scopeFor(fsPath)));
            for (const scope of scopes) {
                if (scope) {
                    catalog.invalidate(scope, reason);
                }
            }
        };
        const fire = (uri: vscode.Uri) => {
            pending.add(uri.fsPath);
            if (timer) {
                clearTimeout(timer);
            }
            timer = setTimeout(() => {
                timer = undefined;
                flush().catch(error => logger.warn(`File watcher for ${glob} failed: ${describe(error)}`));
            }, debounceMs);
        };
        watcher.onDidChange(fire);
        watcher.onDidCreate(fire);
        watcher.onDidDelete(fire);
        context.subscriptions.push(watcher, { dispose: () => { if (timer) { clearTimeout(timer); } } });
    };
    const projectScope = (projectPath: string | undefined): InvalidationScope | undefined =>
        projectPath === undefined ? undefined : { kind: 'project', projectPaths: [projectPath] };
    const workspaceScope = (): InvalidationScope => ({ kind: 'workspace' });
    watch(PROJECT_FILE_GLOB, projectScope, 'file-watcher', 1500);
    watch('**/Directory.{Build,Packages}.{props,targets}', workspaceScope, 'file-watcher', 1500);
    watch('**/{nuget.config,NuGet.Config,NuGet.config}', () => ({ kind: 'sources' }), 'file-watcher', 1000);
    watch('**/global.json', () => { runner.clearSdkCache(); return workspaceScope(); }, 'file-watcher', 1000);
    watch('**/packages.lock.json', async lockPath => projectScope(await projectFileIn(path.dirname(lockPath))), 'file-watcher', 1500);
    watch('**/obj/project.assets.json', async assetsPath => projectScope(await projectFileIn(path.dirname(path.dirname(assetsPath)))), 'restore', 2000);
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            stopDirs.splice(0, stopDirs.length, ...workspaceRoots());
            catalog.invalidate({ kind: 'workspace' }, 'workspace-folders');
        }),
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('nuiget') || e.affectsConfiguration('workbench.tree.indent')) {
                events.configChanged.fire(readExtensionConfig());
            }
            // REMOVAL GATE: P4.9 (a change under `http` rebuilds the transport here)
        }),
    );

    // ── commands ──
    const register = (command: string, handler: (...args: unknown[]) => unknown) =>
        context.subscriptions.push(vscode.commands.registerCommand(command, handler));
    register('nuiget.openManager', (arg?: unknown) => {
        MainPanelHost.createOrShow(services, { projectPath: projectPathFromCommandArg(arg), initialTab: 'installed' });
    });
    register('nuiget.refreshPackages', () => catalog.invalidate({ kind: 'workspace' }, 'manual-refresh'));
    register('nuiget.sidebar.selectSource', () => sidebar.showSourcePicker());
    register('nuiget.sidebar.selectProject', () => sidebar.showProjectPicker());
    register('nuiget.sidebar.togglePrerelease', () => sidebar.togglePrerelease());
    register('nuiget.sidebar.togglePrereleaseOff', () => sidebar.togglePrerelease());
    register('nuiget.sidebar.toggleRestore', () => sidebar.toggleRestore());
    register('nuiget.sidebar.toggleRestoreOff', () => sidebar.toggleRestore());
    register('nuiget.sidebar.refresh', () => sidebar.refresh());
    register('nuiget.sidebar.openFullView', () => {
        MainPanelHost.createOrShow(services);
    });
    register('nuiget.clearHttpCache', async () => {
        await runner.clearHttpCache();
        cache.clear('network');
        catalog.invalidate({ kind: 'workspace' }, 'manual-refresh');
        void vscode.window.showInformationMessage('nUIget: NuGet HTTP cache cleared.');
    });
    register('nuiget.clearSdkVersionCache', async () => {
        runner.clearSdkCache();
        await runner.flush();
        // Cached package lists carry `unsupported` from the SDK that was detected before.
        catalog.invalidate({ kind: 'workspace' }, 'manual-refresh');
        void vscode.window.showInformationMessage('nUIget: SDK version cache cleared.');
    });

    const ready = requestRefresh();
    output.info('nUIget is active');
    return { services, ready };
}

/** Every message, string argument and error passes `redact` before it reaches `inner`. */
function redactingLogger(inner: Logger): Logger {
    const clean = (value: unknown): unknown => {
        if (typeof value === 'string') {
            return redact(value);
        }
        if (value instanceof Error) {
            return redact(value.stack ?? value.message);
        }
        return value;
    };
    return {
        trace: (message, ...args) => inner.trace(redact(message), ...args.map(clean)),
        debug: (message, ...args) => inner.debug(redact(message), ...args.map(clean)),
        info: (message, ...args) => inner.info(redact(message), ...args.map(clean)),
        warn: (message, ...args) => inner.warn(redact(message), ...args.map(clean)),
        error: (message, ...args) => inner.error(message instanceof Error ? redact(message.stack ?? message.message) : redact(message), ...args.map(clean)),
    };
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function workspaceRoots(): string[] {
    return (vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri.fsPath);
}

/** The workspace folder that contains `projectPath` (the deepest one when folders nest); the first folder when no path is given. */
function workspaceFolderFor(projectPath?: string): string | undefined {
    const roots = workspaceRoots();
    if (!projectPath) {
        return roots[0];
    }
    let deepest: string | undefined;
    for (const root of roots) {
        if (isPathInside(projectPath, root) && (deepest === undefined || root.length > deepest.length)) {
            deepest = root;
        }
    }
    return deepest;
}

/** The project file of a directory, for watcher events on files that belong to a project without naming it. */
async function projectFileIn(directory: string): Promise<string | undefined> {
    try {
        const project = (await fs.promises.readdir(directory)).find(entry => PROJECT_FILE_NAME.test(entry));
        return project === undefined ? undefined : path.join(directory, project);
    } catch {
        return undefined;
    }
}

/** The project path in what an explorer, editor-title or Solution Explorer menu passes to a command. */
function projectPathFromCommandArg(arg: unknown): string | undefined {
    if (!arg) {
        return undefined;
    }
    if (arg instanceof vscode.Uri) {
        return arg.fsPath;
    }
    if (typeof arg === 'object') {
        const record = arg as Record<string, unknown>;
        if (record.resourceUri instanceof vscode.Uri) {
            return record.resourceUri.fsPath;
        }
        for (const key of ['fsPath', 'path', 'projectPath', 'filePath']) {
            const value = record[key];
            if (typeof value === 'string') {
                return value;
            }
        }
    }
    return undefined;
}
