/**
 * Request handlers shared by both surfaces. Registered on a `WebviewHost` through
 * `registerSharedHandlers(host, services)`. Each handler maps one protocol request onto the catalog,
 * the session store or the operation queue and returns the typed result; the host base guarantees the
 * terminal response.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import type { OperationTicket } from '../core/contracts';
import type { WorkflowOptions } from '../core/ops';
import { ALL_PROJECTS, type BulkOutcome, type OperationOutcome, type OperationProgress, type RequestPayload } from '../protocol';
import { ABORT_DISPOSED, HostRequestError, type WebviewHost } from './WebviewHost';
import type { HostServices } from './services';

type Registrar = Pick<WebviewHost, 'surface' | 'on'>;

export function requireProject(projectPath: string): string {
    if (!projectPath || projectPath === ALL_PROJECTS) {
        throw new HostRequestError('invalid-request', 'A specific project is required for this action');
    }
    return projectPath;
}

/**
 * The directory whose package sources a request without a project means: that of the selected
 * project, else the first workspace folder. Sources resolve per directory (ADR-005); none is guessed.
 */
export function sourceDirectory(services: HostServices): string {
    const selected = services.session.snapshot.selectedProject;
    const directory = selected && selected !== ALL_PROJECTS ? path.dirname(selected) : services.workspaceFolderFor();
    if (directory === undefined) {
        throw new HostRequestError('not-found', 'No project or workspace folder to resolve package sources for');
    }
    return directory;
}

function rejectedOutcome(opId: string, kind: OperationOutcome['kind'], projectPath: string, packageId: string | undefined, version: string | undefined, reason: string): OperationOutcome {
    return { opId, kind, status: 'rejected', projectPath, packageId, version, message: reason };
}

function rejectedBulk(opId: string, reason: string): BulkOutcome {
    return { opId, status: 'rejected', results: [], restores: [], message: reason };
}

const realProject = (projectPath: string): boolean => projectPath.length > 0 && projectPath !== ALL_PROJECTS;

/**
 * One submit function per `ops/*` request. Each validates its payload, takes the restore option as it
 * is at submission, and hands the workflow to the queue; the ticket's `opId` is on every outcome, also
 * when the queue refuses the work. An invalid payload throws before anything is submitted.
 */
export const operations = {
    install(services: HostServices, payload: RequestPayload<'ops/install'>): OperationTicket<OperationOutcome> {
        const projectPath = requireProject(payload.projectPath);
        const options = workflowOptions(services);
        return services.queue.submit(
            `install ${payload.packageId}`,
            run => services.workflows.single(run, { kind: 'install', projectPath, packageId: payload.packageId, version: payload.version, sourceUrl: payload.sourceUrl }, options),
            (reason, opId) => rejectedOutcome(opId, 'install', projectPath, payload.packageId, payload.version, reason),
        );
    },
    update(services: HostServices, payload: RequestPayload<'ops/update'>): OperationTicket<OperationOutcome> {
        const projectPath = requireProject(payload.projectPath);
        const options = workflowOptions(services);
        return services.queue.submit(
            `update ${payload.packageId}`,
            run => services.workflows.single(run, { kind: 'update', projectPath, packageId: payload.packageId, version: payload.version, sourceUrl: payload.sourceUrl }, options),
            (reason, opId) => rejectedOutcome(opId, 'update', projectPath, payload.packageId, payload.version, reason),
        );
    },
    remove(services: HostServices, payload: RequestPayload<'ops/remove'>): OperationTicket<OperationOutcome> {
        const projectPath = requireProject(payload.projectPath);
        const options = workflowOptions(services);
        return services.queue.submit(
            `uninstall ${payload.packageId}`,
            run => services.workflows.single(run, { kind: 'remove', projectPath, packageId: payload.packageId }, options),
            (reason, opId) => rejectedOutcome(opId, 'remove', projectPath, payload.packageId, undefined, reason),
        );
    },
    restore(services: HostServices, payload: RequestPayload<'ops/restore'>): OperationTicket<BulkOutcome> {
        const projects = payload.projectPaths.filter(realProject);
        if (projects.length === 0) {
            throw new HostRequestError('invalid-request', 'No projects to restore');
        }
        return services.queue.submit(
            projects.length === 1 ? `restore ${path.basename(projects[0])}` : `restore ${projects.length} project(s)`,
            run => services.workflows.restore(run, projects),
            (reason, opId) => rejectedBulk(opId, reason),
        );
    },
    bulkInstall(services: HostServices, payload: RequestPayload<'ops/bulkInstall'>): OperationTicket<BulkOutcome> {
        const projects = payload.projectPaths.filter(realProject);
        if (projects.length === 0) {
            throw new HostRequestError('invalid-request', 'No projects selected');
        }
        const options = workflowOptions(services);
        return services.queue.submit(
            `install ${payload.packageId} into ${projects.length} project(s)`,
            run => services.workflows.bulkInstall(run, projects, payload.packageId, payload.version, options),
            (reason, opId) => rejectedBulk(opId, reason),
        );
    },
    bulkUpdate(services: HostServices, payload: RequestPayload<'ops/bulkUpdate'>): OperationTicket<BulkOutcome> {
        const projectPath = requireProject(payload.projectPath);
        requirePackages(payload.packages.length);
        const options = workflowOptions(services);
        return services.queue.submit(
            `update ${payload.packages.length} package(s)`,
            run => services.workflows.bulkUpdate(run, projectPath, payload.packages, options),
            (reason, opId) => rejectedBulk(opId, reason),
        );
    },
    bulkRemove(services: HostServices, payload: RequestPayload<'ops/bulkRemove'>): OperationTicket<BulkOutcome> {
        const projectPath = requireProject(payload.projectPath);
        requirePackages(payload.packages.length);
        const options = workflowOptions(services);
        return services.queue.submit(
            `uninstall ${payload.packages.length} package(s)`,
            run => services.workflows.bulkRemove(run, projectPath, payload.packages, options),
            (reason, opId) => rejectedBulk(opId, reason),
        );
    },
    bulkUpdateAllProjects(services: HostServices, payload: RequestPayload<'ops/bulkUpdateAllProjects'>): OperationTicket<BulkOutcome> {
        const projectUpdates = payload.projectUpdates.filter(entry => realProject(entry.projectPath) && entry.packages.length > 0);
        requirePackages(projectUpdates.length);
        const options = workflowOptions(services);
        return services.queue.submit(
            'update packages across projects',
            run => services.workflows.bulkUpdateAllProjects(run, projectUpdates, options),
            (reason, opId) => rejectedBulk(opId, reason),
        );
    },
    bulkRemoveAllProjects(services: HostServices, payload: RequestPayload<'ops/bulkRemoveAllProjects'>): OperationTicket<BulkOutcome> {
        const projectRemovals = payload.projectRemovals.filter(entry => realProject(entry.projectPath) && entry.packages.length > 0);
        requirePackages(projectRemovals.length);
        const options = workflowOptions(services);
        return services.queue.submit(
            'uninstall packages across projects',
            run => services.workflows.bulkRemoveAllProjects(run, projectRemovals, options),
            (reason, opId) => rejectedBulk(opId, reason),
        );
    },
};

/** An empty batch is a mistake of the caller, not an operation: no ticket and no `ops/completed` for it. */
function requirePackages(count: number): void {
    if (count === 0) {
        throw new HostRequestError('invalid-request', 'No packages selected');
    }
}

/** Wait for a ticket, tell every surface about the outcome and invalidate what it changed. */
export async function settleOperation<T extends OperationOutcome | BulkOutcome>(services: HostServices, ticket: OperationTicket<T>): Promise<T> {
    const outcome = await ticket.completion;
    services.announceOperation(outcome);
    invalidateAfter(services, outcome);
    return outcome;
}

/**
 * Tie a ticket to the request that submitted it: progress of this operation goes to `emit`, and a
 * cancel of the request cancels the operation. A surface that is disposed does not cancel what it
 * queued (N9); the outcome still reaches the other surface through `announceOperation`.
 */
export async function awaitTicket<T extends OperationOutcome | BulkOutcome>(
    ticket: OperationTicket<T>,
    services: HostServices,
    request: { signal: AbortSignal; emit?: (progress: OperationProgress) => void },
): Promise<T> {
    const { signal, emit } = request;
    const forward = emit === undefined ? undefined : services.onOperationProgress(progress => {
        if (progress.opId === ticket.opId) {
            emit(progress);
        }
    });
    const onAbort = (): void => {
        if (signal.reason !== ABORT_DISPOSED) {
            ticket.cancel();
        }
    };
    signal.addEventListener('abort', onAbort, { once: true });
    try {
        emit?.({ opId: ticket.opId, status: ticket.admitted ? 'queued' : 'rejected' });
        return await settleOperation(services, ticket);
    } finally {
        signal.removeEventListener('abort', onAbort);
        forward?.dispose();
    }
}

function workflowOptions(services: HostServices): WorkflowOptions {
    return { skipRestore: !services.session.snapshot.restoreEnabled };
}

function affectedScope(outcome: OperationOutcome | BulkOutcome): { projectPaths: string[]; packageIds: string[] } {
    if ('results' in outcome) {
        const projectPaths = new Set<string>();
        const packageIds = new Set<string>();
        for (const r of outcome.results) {
            if (r.edit?.ok || r.kind === 'restore') {
                projectPaths.add(r.projectPath);
            }
            if (r.packageId && r.edit?.ok) {
                packageIds.add(r.packageId);
            }
        }
        for (const r of outcome.restores) {
            projectPaths.add(r.projectPath);
        }
        return { projectPaths: [...projectPaths], packageIds: [...packageIds] };
    }
    const changed = outcome.edit?.ok || outcome.restore?.ok;
    return { projectPaths: changed ? [outcome.projectPath] : [], packageIds: outcome.packageId && outcome.edit?.ok ? [outcome.packageId] : [] };
}

/** Invalidate what an operation changed; restores widen to the project, edits to the package. */
export function invalidateAfter(services: HostServices, outcome: OperationOutcome | BulkOutcome): void {
    const { projectPaths, packageIds } = affectedScope(outcome);
    if (projectPaths.length === 0) {
        return;
    }
    services.invalidate({ kind: 'project', projectPaths }, 'operation');
    if (packageIds.length > 0) {
        services.invalidate({ kind: 'metadata', packageIds }, 'operation');
    }
}

export function registerSharedHandlers(host: Registrar, services: HostServices): void {
    const { catalog, session } = services;

    // ── session / config / layout ──
    host.on('session/get', async () => session.snapshot);
    host.on('session/set', async intent => session.apply(intent, host.surface));
    host.on('config/get', async () => services.config());
    host.on('layout/get', async () => ({
        splitPosition: services.context.globalState.get<number>('nuiget.layout.splitPosition'),
        sidebarSectionSplit: services.context.workspaceState.get<number>('nuiget.layout.sidebarSectionSplit'),
    }));
    host.on('layout/set', async prefs => {
        if (prefs.splitPosition !== undefined) {
            await services.context.globalState.update('nuiget.layout.splitPosition', prefs.splitPosition);
        }
        if (prefs.sidebarSectionSplit !== undefined) {
            await services.context.workspaceState.update('nuiget.layout.sidebarSectionSplit', prefs.sidebarSectionSplit);
        }
        return {
            splitPosition: services.context.globalState.get<number>('nuiget.layout.splitPosition'),
            sidebarSectionSplit: services.context.workspaceState.get<number>('nuiget.layout.sidebarSectionSplit'),
        };
    });

    // ── projects & single-project resources ──
    // A result that is a coordinator resource says which generation it was computed for (ADR-007, ADR-008).
    host.on('projects/list', async (_payload, ctx) => {
        const { value, generation } = await catalog.projects(ctx.signal);
        ctx.generation = generation;
        return { projects: value };
    });
    host.on('installed/get', async ({ projectPath }, ctx) => {
        const { result, upgrade, generation } = await catalog.installed(requireProject(projectPath), chunk => ctx.emit(chunk), ctx.signal);
        ctx.generation = generation;
        // The final result (ADR-009): the authoritative one when an evaluation runs, else the provisional.
        return upgrade ? await upgrade : result;
    });
    host.on('updates/get', async ({ projectPath, includePrerelease }, ctx) => {
        const result = await catalog.updates(requireProject(projectPath), includePrerelease, update => ctx.emit({ kind: 'found', update }), ctx.signal);
        ctx.generation = result.generation;
        return { projectPath: result.projectPath, updates: result.updates, sourcesUnavailable: result.sourcesUnavailable || undefined };
    });
    host.on('transitive/get', async ({ projectPath, forceRestore }, ctx) => {
        const project = requireProject(projectPath);
        if (forceRestore) {
            // The restore runs on the queue like any other (Y3). Its progress travels as `ops/progress`.
            const outcome = await awaitTicket(operations.restore(services, { projectPaths: [project] }), services, { signal: ctx.signal });
            if (outcome.status === 'rejected') {
                throw new HostRequestError('failed', outcome.message ?? 'Restore was not admitted');
            }
        }
        const { value, generation } = await catalog.transitive(project, ctx.signal);
        ctx.generation = generation;
        return value;
    });
    host.on('transitive/metadata', async ({ packages }, ctx) => ({ metadata: await catalog.transitiveMetadata(sourceDirectory(services), packages, ctx.signal) }));

    // ── all projects (streamed; the Catalog emits the protocol's chunk types) ──
    host.on('allProjects/installed', async (_payload, ctx) => catalog.allProjectsInstalled(chunk => ctx.emit(chunk), ctx.signal));
    host.on('allProjects/updates', async ({ includePrerelease }, ctx) => catalog.allProjectsUpdates(includePrerelease, chunk => ctx.emit(chunk), ctx.signal));
    host.on('allProjects/transitive', async (_payload, ctx) => catalog.allProjectsTransitive(chunk => ctx.emit(chunk), ctx.signal));

    // ── search & package details ──
    host.on('search/query', async (payload, ctx) => {
        const found = await catalog.search(
            sourceDirectory(services),
            { query: payload.query, sourceUrls: payload.sourceUrls, includePrerelease: payload.includePrerelease, take: payload.take ?? services.config().searchResultLimit, exactMatch: payload.exactMatch },
            packages => ctx.emit({ kind: 'metadata', packages }),
            ctx.signal,
        );
        return { query: payload.query, results: found.results, sourcesUnavailable: found.sourcesUnavailable };
    });
    host.on('search/autocomplete', async (payload, ctx) => ({ query: payload.query, groups: await catalog.quickSearch(sourceDirectory(services), payload.sources.map(source => source.url), payload.query, payload.includePrerelease, services.config().quickSearchResultsPerSource, ctx.signal) }));
    // `package/versions` and `package/metadata` are fan-outs over per-source resources and carry no generation (N70).
    host.on('package/versions', async (payload, ctx) => {
        const { versions, sourcesUnavailable } = await catalog.versions(sourceDirectory(services), payload.packageId, payload.sourceUrl, payload.includePrerelease, ctx.signal);
        if (versions.length === 0 && sourcesUnavailable) {
            throw new HostRequestError('failed', 'No package source could be reached for this package');
        }
        return { packageId: payload.packageId, versions };
    });
    host.on('package/metadata', async (payload, ctx) => ({ metadata: (await catalog.metadata(sourceDirectory(services), payload.packageId, payload.version, payload.sourceUrl, ctx.signal)) ?? null }));
    host.on('package/readme', async (payload, ctx) => ({ readme: (await catalog.readme(sourceDirectory(services), payload.packageId, payload.version, payload.sourceUrl, ctx.signal)) ?? null }));
    host.on('readme/image', async ({ url, sourceUrl }, ctx) => ({ url, dataUri: await catalog.readmeImage(url, sourceUrl, ctx.signal) }));
    host.on('package/prewarm', async ({ sourceUrl }) => {
        await catalog.prewarm(sourceDirectory(services), sourceUrl);
        return {};
    });

    // ── sources ──
    const listSources = async (signal?: AbortSignal) => {
        const { value, generation } = await catalog.sources(sourceDirectory(services), signal, { configFiles: true });
        return { result: { sources: value, failed: catalog.sourceHealth() }, generation };
    };
    host.on('sources/list', async (_payload, ctx) => {
        const listed = await listSources(ctx.signal);
        ctx.generation = listed.generation;
        return listed.result;
    });
    host.on('sources/refresh', async (_payload, ctx) => {
        services.invalidate({ kind: 'sources' }, 'manual-refresh');
        const listed = await listSources(ctx.signal);
        ctx.generation = listed.generation;
        return listed.result;
    });
    host.on('sources/configFiles', async () => ({ configFiles: services.sources.configFiles(services.workspaceFolderFor()) }));
    /** The sources as they are after the mutation: a fresh read, of the generation the mutation's own invalidation produced. */
    const afterSourceMutation = async () => {
        services.invalidate({ kind: 'sources' }, 'source-changed');
        const { value: sources, generation } = await catalog.sources(sourceDirectory(services), undefined, { configFiles: true });
        await session.reconcile((await catalog.projects()).value, sources.filter(source => source.enabled).map(source => source.url));
        return { sources, generation };
    };
    host.on('sources/add', async (payload, ctx) => {
        const result = await services.sources.add(payload, sourceDirectory(services));
        if (!result.ok) {
            throw new HostRequestError('failed', result.error ?? 'Failed to add source');
        }
        const { sources, generation } = await afterSourceMutation();
        ctx.generation = generation;
        return { sources };
    });
    host.on('sources/remove', async ({ sourceName, configFile }, ctx) => {
        const directory = sourceDirectory(services);
        const removedUrl = (await catalog.sources(directory)).value.find(source => source.name === sourceName)?.url;
        const result = await services.sources.remove(sourceName, directory, configFile);
        if (!result.ok) {
            throw new HostRequestError('failed', result.error ?? 'Failed to remove source');
        }
        const { sources, generation } = await afterSourceMutation();
        ctx.generation = generation;
        return { sources, removedUrl };
    });
    host.on('sources/enable', async ({ sourceName }, ctx) => {
        const result = await services.sources.enable(sourceName, sourceDirectory(services));
        if (!result.ok) {
            throw new HostRequestError('failed', result.error ?? 'Failed to enable source');
        }
        const { sources, generation } = await afterSourceMutation();
        ctx.generation = generation;
        return { sources };
    });
    host.on('sources/disable', async ({ sourceName }, ctx) => {
        const directory = sourceDirectory(services);
        const disabledUrl = (await catalog.sources(directory)).value.find(source => source.name === sourceName)?.url;
        const result = await services.sources.disable(sourceName, directory);
        if (!result.ok) {
            throw new HostRequestError('failed', result.error ?? 'Failed to disable source');
        }
        const { sources, generation } = await afterSourceMutation();
        ctx.generation = generation;
        return { sources, disabledUrl };
    });

    // ── operations (one terminal response per request, from the ticket) ──
    host.on('ops/install', (payload, ctx) => awaitTicket(operations.install(services, payload), services, ctx));
    host.on('ops/update', (payload, ctx) => awaitTicket(operations.update(services, payload), services, ctx));
    host.on('ops/remove', (payload, ctx) => awaitTicket(operations.remove(services, payload), services, ctx));
    host.on('ops/restore', (payload, ctx) => awaitTicket(operations.restore(services, payload), services, ctx));
    host.on('ops/bulkInstall', (payload, ctx) => awaitTicket(operations.bulkInstall(services, payload), services, ctx));
    host.on('ops/bulkUpdate', (payload, ctx) => awaitTicket(operations.bulkUpdate(services, payload), services, ctx));
    host.on('ops/bulkRemove', (payload, ctx) => awaitTicket(operations.bulkRemove(services, payload), services, ctx));
    host.on('ops/bulkUpdateAllProjects', (payload, ctx) => awaitTicket(operations.bulkUpdateAllProjects(services, payload), services, ctx));
    host.on('ops/bulkRemoveAllProjects', (payload, ctx) => awaitTicket(operations.bulkRemoveAllProjects(services, payload), services, ctx));

    // ── refresh & chrome ──
    host.on('refresh/all', async () => {
        services.invalidate({ kind: 'workspace' }, 'manual-refresh');
        return {};
    });
    host.on('ui/copyToClipboard', async ({ text }) => {
        await vscode.env.clipboard.writeText(text);
        vscode.window.setStatusBarMessage(`Copied "${text}" to clipboard`, 2000);
        return {};
    });
    host.on('ui/openExternal', async ({ url }) => {
        const parsed = tryParseUrl(url);
        if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) {
            throw new HostRequestError('invalid-request', 'Only http(s) links can be opened');
        }
        await vscode.env.openExternal(vscode.Uri.parse(parsed.toString()));
        return {};
    });
    host.on('perf/mark', async ({ name, detail }) => {
        const line = `[perf] ${host.surface} ${name}${detail ? ` ${detail}` : ''}`;
        if (services.config().enablePerformanceLogging) {
            services.logger.info(line);
        } else {
            services.logger.debug(line);
        }
        return {};
    });
}

function tryParseUrl(text: string): URL | undefined {
    try {
        return new URL(text);
    } catch {
        return undefined;
    }
}
