/**
 * Two-surface harness: the real 2.0 composition root (`activateWith`) with the real sidebar and main panel
 * hosts, each over a `FakeWebview`, a fake `dotnet` that edits project files in a scratch workspace, and
 * a driver for what a user or the file system does. Nothing here builds host services by hand: what a
 * scenario observes is what the extension would send.
 *
 * Timers: `setTimeout` and `clearTimeout` are fake from the moment the root is ready (watcher debounces);
 * microtasks, `setImmediate` and file I/O are real. A scenario waits with `settle` or `expectState` and
 * moves the clock with `advance`; it never sleeps.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { expect, vi, type Mock } from 'vitest';
import { createScratchDir, writeTree } from '../../core/project/__fixtures__/scratch';
import { activateWith, type ActivatedExtension } from '../../extension.next';
import type { InstalledResult, RequestPayload, RequestType, SessionSnapshot } from '../../protocol';
import { commands as mockCommands, createMockExtensionContext, resetAllMocks, window as mockWindow, workspace as mockWorkspace } from '../__mocks__/vscode';
import { addPackageReference, createFakeDotnet, type FakeDotnet } from './fakeDotnet';
import { FakeWebview, type SentRequest } from './FakeWebview';

export type SurfaceName = 'sidebar' | 'main';
type OperationType = Extract<RequestType, `ops/${string}`>;
type Toggle = 'includePrerelease' | 'restoreEnabled';
interface DisposableLike { dispose(): void }

export const PRIVATE_FEED = 'https://private.example/v3/index.json';
export const SHARED_FEED = 'https://shared.example/v3/index.json';

const PROJECT_GLOB = '**/*.{csproj,fsproj,vbproj}';
const PROPS_GLOB = '**/Directory.{Build,Packages}.{props,targets}';
/** Debounce of the project-file and props watchers in the composition root. */
export const WATCHER_DEBOUNCE_MS = 1500;

const defaultFolders = mockWorkspace.workspaceFolders;

/** An SDK-style project with the given references; a reference without a version is a central one. */
export function projectXml(...references: Array<[id: string, version?: string]>): string {
    const items = references.map(([id, version]) => version === undefined
        ? `    <PackageReference Include="${id}" />`
        : `    <PackageReference Include="${id}" Version="${version}" />`);
    return ['<Project Sdk="Microsoft.NET.Sdk">', '  <PropertyGroup>', '    <TargetFramework>net10.0</TargetFramework>', '  </PropertyGroup>', '  <ItemGroup>', ...items, '  </ItemGroup>', '</Project>', ''].join('\n');
}

/** A `Directory.Packages.props` that switches Central Package Management on. */
export function centralPropsXml(...versions: Array<[id: string, version: string]>): string {
    const items = versions.map(([id, version]) => `    <PackageVersion Include="${id}" Version="${version}" />`);
    return ['<Project>', '  <PropertyGroup>', '    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>', '  </PropertyGroup>', '  <ItemGroup>', ...items, '  </ItemGroup>', '</Project>', ''].join('\n');
}

/** `id@version` of every package, in the order the project declares them. */
export function packagesOf(result: InstalledResult | undefined): string[] | undefined {
    return result?.packages.map(pkg => `${pkg.id}@${pkg.version}`);
}

export interface HarnessOptions {
    /** Files of the workspace, relative path → content. Every `*.csproj` among them is a project. */
    tree: Record<string, string>;
    /** The persisted selection, as a path relative to the workspace root. */
    selectedProject?: string;
    /** The persisted source selection (`'all'` when absent). */
    selectedSource?: string;
    /** Enabled sources per directory (relative to the workspace root); every other directory has the shared feed. */
    sources?: Record<string, string[]>;
}

export interface ExpectedState {
    selectedProject: string;
    selectedSource?: string;
    /** Project paths in the order the host lists them (by name). */
    projects: string[];
    /** `id@version` of the selected project's packages, on every surface that shows one project. */
    installed?: string[];
    /** Project path → `id@version` list, on every surface in all-projects mode. */
    allProjects?: Record<string, string[]>;
}

interface LiveSurface {
    webview: FakeWebview;
    dispose(): void;
}

function createFakeView(webview: FakeWebview) {
    const listeners: Array<() => void> = [];
    let disposed = false;
    const registration = (disposables?: DisposableLike[]): DisposableLike => {
        const entry = { dispose: () => undefined };
        disposables?.push(entry);
        return entry;
    };
    return {
        view: {
            webview,
            visible: true,
            title: undefined as string | undefined,
            onDidChangeVisibility: (_listener: () => void, _thisArg?: unknown, disposables?: DisposableLike[]) => registration(disposables),
            onDidDispose: (listener: () => void, _thisArg?: unknown, disposables?: DisposableLike[]) => {
                listeners.push(listener);
                return registration(disposables);
            },
        },
        dispose: () => {
            if (!disposed) {
                disposed = true;
                listeners.forEach(listener => listener());
            }
        },
    };
}

/** A panel that reports its disposal once, as VS Code does; the shared mock's panel does not (finding N58). */
function createFakePanel(webview: FakeWebview) {
    const listeners: Array<() => void> = [];
    let disposed = false;
    return {
        webview,
        iconPath: undefined as unknown,
        reveal: vi.fn(),
        onDidDispose: (listener: () => void, _thisArg?: unknown, disposables?: DisposableLike[]) => {
            listeners.push(listener);
            const entry = { dispose: () => undefined };
            disposables?.push(entry);
            return entry;
        },
        dispose: () => {
            if (!disposed) {
                disposed = true;
                listeners.forEach(listener => listener());
            }
        },
    };
}

/** ADR-007: one terminal response per request, and nothing answered that this surface did not ask. */
export function expectOneResponsePerRequest(webview: FakeWebview): void {
    const ids = webview.requestIds();
    for (const id of ids) {
        expect(webview.responsesFor(id), `${webview.surface}: responses for request ${id}`).toHaveLength(1);
    }
    const correlated = webview.received.flatMap(message => message.kind === 'event' ? [] : [message.id]);
    expect(correlated.filter(id => !ids.includes(id)), `${webview.surface}: envelopes for requests it did not send`).toEqual([]);
}

export async function createHarness(options: HarnessOptions) {
    vi.clearAllMocks();
    const scratch = await createScratchDir('harness');
    const root = scratch.dir;
    const at = (...segments: string[]): string => vscode.Uri.file(path.join(root, ...segments)).fsPath;
    await writeTree(root, options.tree);

    const projectFiles = Object.keys(options.tree).filter(file => file.endsWith('.csproj')).map(file => at(file));
    mockWorkspace.workspaceFolders = [{ uri: vscode.Uri.file(root), name: 'harness', index: 0 }];
    mockWorkspace.findFiles.mockImplementation((async () => projectFiles.map(file => vscode.Uri.file(file))) as unknown as () => Promise<never[]>);

    const dotnet: FakeDotnet = createFakeDotnet();
    const sourcesByDirectory = Object.entries(options.sources ?? {}).map(([directory, urls]) => ({ directory: path.resolve(at(directory)), urls }));
    dotnet.sources = cwd => sourcesByDirectory.find(entry => entry.directory === path.resolve(cwd))?.urls ?? [SHARED_FEED];

    const context = createMockExtensionContext();
    if (options.selectedProject !== undefined) {
        await context.workspaceState.update('nuiget.selectedProject', at(options.selectedProject));
    }
    if (options.selectedSource !== undefined) {
        await context.workspaceState.update('nuiget.selectedSource', options.selectedSource);
    }
    const extension: ActivatedExtension = await activateWith(context as unknown as vscode.ExtensionContext, { spawn: dotnet.spawn, resolveExecutable: () => 'dotnet' });
    await extension.ready;
    const { services } = extension;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const surfaces: Partial<Record<SurfaceName, LiveSurface>> = {};
    const live = (): FakeWebview[] => Object.values(surfaces).map(entry => entry.webview);
    const surface = (name: SurfaceName): FakeWebview => {
        const entry = surfaces[name];
        if (!entry) {
            throw new Error(`The ${name} surface is not resolved`);
        }
        return entry.webview;
    };

    const settle = (condition?: () => void | Promise<void>): Promise<void> => vi.waitFor(condition ?? (() => {
        for (const webview of live()) {
            expect(webview.pending(), `${webview.surface}: requests without a response`).toEqual([]);
        }
        expect(services.queue.isBusy).toBe(false);
    }), { timeout: 5000, interval: 10 });

    const watcher = (glob: string) => {
        const index = vi.mocked(vscode.workspace.createFileSystemWatcher).mock.calls.findIndex(call => call[0] === glob);
        if (index < 0) {
            throw new Error(`No file watcher for ${glob}`);
        }
        const mock = mockWorkspace.createFileSystemWatcher.mock.results[index].value;
        const listenerOf = (register: unknown) => (register as Mock).mock.calls[0][0] as (uri: vscode.Uri) => void;
        return { change: listenerOf(mock.onDidChange), create: listenerOf(mock.onDidCreate), delete: listenerOf(mock.onDidDelete) };
    };

    const harness = {
        root,
        dotnet,
        services,
        context,
        /** Absolute path of a file of the workspace, as the host names it. */
        path: at,
        surface,
        get statusBar() {
            return mockWindow.createStatusBarItem.mock.results.at(-1)!.value;
        },

        // ── surfaces ──

        /** Make a surface visible: the sidebar view is resolved, the main panel opened. Its webview then starts (R1). */
        async resolve(name: SurfaceName, open?: { projectPath?: string }): Promise<FakeWebview> {
            const existing = surfaces[name];
            if (existing) {
                return existing.webview;
            }
            const webview = new FakeWebview(name);
            if (name === 'sidebar') {
                const provider = vi.mocked(vscode.window.registerWebviewViewProvider).mock.calls.at(-1)![1];
                const fake = createFakeView(webview);
                void provider.resolveWebviewView(fake.view as unknown as vscode.WebviewView, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);
                surfaces.sidebar = { webview, dispose: fake.dispose };
            } else {
                const panel = createFakePanel(webview);
                vi.mocked(vscode.window.createWebviewPanel).mockImplementationOnce(() => panel as unknown as vscode.WebviewPanel);
                await mockCommands.executeCommand('nuiget.openManager', open?.projectPath === undefined ? undefined : vscode.Uri.file(open.projectPath));
                surfaces.main = { webview, dispose: panel.dispose };
            }
            webview.start();
            return webview;
        },

        /** The user closes the surface. The webview object stays readable; nothing may reach it afterwards. */
        dispose(name: SurfaceName): FakeWebview {
            const entry = surfaces[name];
            if (!entry) {
                throw new Error(`The ${name} surface is not resolved`);
            }
            delete surfaces[name];
            entry.dispose();
            return entry.webview;
        },

        // ── what a user does on a surface ──

        async selectProject(name: SurfaceName, projectPath: string): Promise<SessionSnapshot> {
            const response = await surface(name).request('session/set', { selectedProject: projectPath }).response;
            expect(response.ok, `session/set from ${name}`).toBe(true);
            return (response as { result: SessionSnapshot }).result;
        },

        async toggle(name: SurfaceName, key: Toggle): Promise<SessionSnapshot> {
            const current = surface(name).session;
            if (!current) {
                throw new Error(`The ${name} surface has no session yet`);
            }
            const response = await surface(name).request('session/set', { [key]: !current[key] }).response;
            expect(response.ok, `session/set from ${name}`).toBe(true);
            return (response as { result: SessionSnapshot }).result;
        },

        /** Start an operation; the caller decides when to wait for `response`. */
        operate<T extends OperationType>(name: SurfaceName, type: T, payload: RequestPayload<T>): SentRequest<T> {
            return surface(name).request(type, payload);
        },

        async refresh(name: SurfaceName): Promise<void> {
            const response = await surface(name).request('refresh/all', {}).response;
            expect(response.ok, `refresh/all from ${name}`).toBe(true);
        },

        request<T extends RequestType>(name: SurfaceName, type: T, payload: RequestPayload<T>): SentRequest<T> {
            return surface(name).request(type, payload);
        },

        cancel(name: SurfaceName, id: string): void {
            surface(name).cancel(id);
        },

        showAllProjects(name: SurfaceName): SentRequest<'allProjects/installed'> {
            return surface(name).showAllProjects();
        },

        /** Run a contributed command (title bar, palette). */
        command(id: string, ...args: unknown[]): Promise<unknown> {
            return mockCommands.executeCommand(id, ...args);
        },

        // ── what happens on disk; each verb also fires the file watcher, without moving the clock ──

        files: {
            writeProject(projectPath: string, xml: string): void {
                const known = projectFiles.includes(projectPath);
                fs.mkdirSync(path.dirname(projectPath), { recursive: true });
                fs.writeFileSync(projectPath, xml, 'utf8');
                if (known) {
                    watcher(PROJECT_GLOB).change(vscode.Uri.file(projectPath));
                } else {
                    projectFiles.push(projectPath);
                    watcher(PROJECT_GLOB).create(vscode.Uri.file(projectPath));
                }
            },
            /** An edit made outside the extension: one more reference in the project file. */
            addReference(projectPath: string, packageId: string, version: string): void {
                addPackageReference(projectPath, packageId, version);
                watcher(PROJECT_GLOB).change(vscode.Uri.file(projectPath));
            },
            deleteProject(projectPath: string): void {
                fs.rmSync(projectPath);
                projectFiles.splice(projectFiles.indexOf(projectPath), 1);
                watcher(PROJECT_GLOB).delete(vscode.Uri.file(projectPath));
            },
            writeProps(propsPath: string, xml: string): void {
                fs.writeFileSync(propsPath, xml, 'utf8');
                watcher(PROPS_GLOB).change(vscode.Uri.file(propsPath));
            },
        },

        // ── time and waiting ──

        /** Move the fake clock, for example past a watcher's debounce. */
        advance(ms: number): Promise<unknown> {
            return vi.advanceTimersByTimeAsync(ms);
        },

        /** Wait until `condition` holds; without one, until no request is unanswered and the queue is idle. */
        settle,

        /**
         * Wait until every visible surface shows the same state as the host and that state is the
         * expected one, then check the envelope rule of ADR-007. The expected lists are literals: the
         * oracle shares no code with what it checks.
         */
        async expectState(expected: ExpectedState): Promise<void> {
            await settle(async () => {
                const host = services.session.snapshot;
                expect(host.selectedProject, 'host: selected project').toBe(expected.selectedProject);
                if (expected.selectedSource !== undefined) {
                    expect(host.selectedSource, 'host: selected source').toBe(expected.selectedSource);
                }
                expect((await services.catalog.projects()).map(project => project.path), 'host: projects').toEqual(expected.projects);
                expect(services.queue.isBusy, 'host: queue busy').toBe(false);
                for (const webview of live()) {
                    const name = webview.surface;
                    expect(webview.pending(), `${name}: requests without a response`).toEqual([]);
                    expect(webview.session, `${name}: session`).toEqual(host);
                    expect(webview.projects?.map(project => project.path), `${name}: projects`).toEqual(expected.projects);
                    if (webview.allProjectsMode) {
                        if (expected.allProjects !== undefined) {
                            const shown = Object.fromEntries([...webview.allProjects].map(([projectPath, result]) => [projectPath, 'error' in result ? [`error: ${result.error}`] : packagesOf(result)]));
                            expect(shown, `${name}: all projects`).toEqual(expected.allProjects);
                        }
                    } else if (expected.installed !== undefined) {
                        expect(webview.installed?.projectPath, `${name}: project of the installed list`).toBe(expected.selectedProject);
                        expect(webview.installed?.fidelity, `${name}: fidelity`).toBe('provisional');
                        expect(packagesOf(webview.installed), `${name}: installed`).toEqual(expected.installed);
                    }
                }
            });
            live().forEach(expectOneResponsePerRequest);
        },

        /** Undo everything: timers, subscriptions, the mock's state and the scratch workspace. */
        async teardown(): Promise<void> {
            vi.useRealTimers();
            for (const subscription of [...context.subscriptions].reverse()) {
                subscription.dispose();
            }
            // Let what the disposal aborted settle before the next scenario starts.
            await new Promise<void>(resolve => setImmediate(resolve));
            mockWorkspace.workspaceFolders = defaultFolders;
            mockWorkspace.findFiles.mockImplementation(async () => []);
            resetAllMocks();
            await scratch.cleanup();
        },
    };
    return harness;
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;
