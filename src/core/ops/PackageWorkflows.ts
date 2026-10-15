/**
 * Package workflows — orchestration of install / update / remove / restore over the CLI runner.
 *
 * Pure orchestration (ADR-003): no VS Code UI, no messaging. Each workflow returns a typed outcome
 * with the reference edit and the restore reported separately and observes the operation's abort
 * signal between steps. Bulk workflows order work by project/package dependencies and run one
 * restore per changed project after all edits.
 *
 * Every reference edit passes one admission gate first: the project mutator decides it from the edit's execution
 * context (ADR-004 tier 3, D7, D13), and the command is built from that decision alone (`isCpm`, N51). A Central
 * Package Management add runs without `--no-restore`, so its implicit restore runs whatever the restore toggle says;
 * its preview is taken before the edit, and the projects that share the central entry are restored after the edited
 * ones and reported as `affectedProjects`. Restores are never gated.
 */

import * as path from 'path';
import type { DotnetResult, DotnetRunner, Logger, MutationKind, OperationRunContext, ProjectExecutionContext, ProjectMutator } from '../contracts';
import type { BulkOutcome, OperationKind, OperationOutcome, OperationProgress, OperationStatus, StepOutcome } from '../../protocol/domain';
import { addPackageArgs, removePackageArgs, restoreArgs, RESTORE_TIMEOUT_MS } from '../cli';
import { redact, redactArgv } from '../logging';
import { topologicalSortByDependency } from '../util/topo';
import { normalizeProjectPath } from '../util/paths';
import { normalizeId } from '../versioning';

export interface WorkflowDeps {
    runner: DotnetRunner;
    /** Package → dependency ids (lower-cased) for a project, used to order bulk edits. */
    packageDependencies: (projectPath: string) => Promise<Map<string, string[]>>;
    /** Project → referenced project paths (normalized) for the given set, used to order multi-project work. */
    projectDependencies: (projectPaths: string[]) => Promise<Map<string, string[]>>;
    /** Decides every reference edit and previews the projects a Central Package Management edit reaches (ADR-004 tier 3). */
    mutator: ProjectMutator;
    /** The context of the mutation decision, built by the host without the config chain and memoized per project for one operation. */
    contextFor: (projectPath: string) => Promise<ProjectExecutionContext>;
    logger?: Logger;
    /** Hook for the host to log the CLI transcript to the output channel. Argv and output arrive redacted. */
    onCommand?: (argv: string[], exitCode: number, stdout: string, stderr: string, durationMs: number) => void;
}

export interface WorkflowOptions {
    /** Skip the post-edit restore (the user's "Restore after operations" toggle, snapshotted at submission). */
    skipRestore: boolean;
}

/** One reference edit: a package added to, updated in or removed from one project. */
export interface EditRequest {
    kind: MutationKind;
    projectPath: string;
    packageId: string;
    version?: string;
    sourceUrl?: string;
}

type ProjectRestore = BulkOutcome['restores'][number];

/** The step of one edit, and the other projects whose central entry it changed (a CPM install or update). */
interface EditStep {
    step: StepOutcome;
    affected: string[];
}

type Admission = { ok: true; context: ProjectExecutionContext; isCpm: boolean } | { ok: false; refusal: StepOutcome };

/** The fields every progress report carries, so a surface that did not start the operation can mark rows busy. */
type ProgressScope = Required<Pick<OperationProgress, 'kind' | 'projectPaths' | 'packageIds'>>;

const EDIT_TIMEOUT_MS = 120_000;
const CANCELLED = 'cancelled';

export class PackageWorkflows {
    constructor(private readonly deps: WorkflowDeps) {}

    /** Install, update or remove one package in one project, then restore unless skipped. */
    async single(ctx: OperationRunContext, request: EditRequest, options: WorkflowOptions): Promise<OperationOutcome> {
        const scope: ProgressScope = { kind: request.kind, projectPaths: [request.projectPath], packageIds: [request.packageId] };
        ctx.report({ status: 'running', ...scope, detail: `${verb(request.kind)} ${request.packageId}` });
        const { step: edit, affected } = await this.edit(ctx, request);
        let restore: StepOutcome | undefined;
        if (edit.ok) {
            const steps = [{ projectPath: request.projectPath, step: await this.restoreStep(ctx, request.projectPath, options, scope) }];
            for (const consumer of affected) {
                steps.push({ projectPath: consumer, step: await this.restoreStep(ctx, consumer, options, { ...scope, projectPaths: [consumer] }) });
            }
            restore = steps.length === 1 ? steps[0].step : combineRestores(steps);
        }
        const outcome: OperationOutcome = {
            opId: ctx.opId,
            kind: request.kind,
            status: outcomeStatus(edit, restore),
            projectPath: request.projectPath,
            packageId: request.packageId,
            version: request.version,
            edit,
            restore,
            message: edit.ok ? restore?.error : edit.error,
        };
        if (affected.length > 0) {
            outcome.affectedProjects = affected;
        }
        return outcome;
    }

    /** Restore one or more projects (used by the explicit Restore actions). */
    async restore(ctx: OperationRunContext, projectPaths: string[]): Promise<BulkOutcome> {
        const results: OperationOutcome[] = [];
        const restores: ProjectRestore[] = [];
        let index = 0;
        for (const projectPath of projectPaths) {
            index++;
            if (ctx.signal.aborted) {
                restores.push({ projectPath, ok: false, skipped: true, error: CANCELLED });
                continue;
            }
            ctx.report({ status: 'restoring', kind: 'restore', projectPaths: [projectPath], packageIds: [], current: index, total: projectPaths.length, detail: path.basename(projectPath) });
            const step = await this.runRestore(ctx, projectPath);
            restores.push({ projectPath, ...step });
            results.push({ opId: ctx.opId, kind: 'restore', status: stepStatus(step), projectPath, restore: step, message: step.error });
        }
        return { opId: ctx.opId, status: bulkStatus(results, restores), results, restores };
    }

    /** Install one package into several projects (dependency projects first), then restore each changed project. */
    async bulkInstall(ctx: OperationRunContext, projectPaths: string[], packageId: string, version: string | undefined, options: WorkflowOptions): Promise<BulkOutcome> {
        const ordered = await this.orderProjects(projectPaths, true);
        const results = await this.editSequence(ctx, 'install', ordered.map(projectPath => ({ kind: 'install' as const, projectPath, packageId, version })));
        const restores = await this.restoreChanged(ctx, 'install', results, options, ordered);
        return { opId: ctx.opId, status: bulkStatus(results, restores), results, restores };
    }

    /** Update several packages in one project (dependencies first), single restore afterwards. */
    async bulkUpdate(ctx: OperationRunContext, projectPath: string, packages: Array<{ id: string; version: string; sourceUrl?: string }>, options: WorkflowOptions): Promise<BulkOutcome> {
        const ordered = await this.orderPackages(projectPath, packages, p => p.id, true);
        const results = await this.editSequence(ctx, 'update', ordered.map(p => ({ kind: 'update' as const, projectPath, packageId: p.id, version: p.version, sourceUrl: p.sourceUrl })));
        const restores = await this.restoreChanged(ctx, 'update', results, options, [projectPath]);
        return { opId: ctx.opId, status: bulkStatus(results, restores), results, restores };
    }

    /** Remove several packages from one project (dependents first), single restore afterwards. */
    async bulkRemove(ctx: OperationRunContext, projectPath: string, packageIds: string[], options: WorkflowOptions): Promise<BulkOutcome> {
        const ordered = await this.orderPackages(projectPath, packageIds, id => id, false);
        const results = await this.editSequence(ctx, 'remove', ordered.map(id => ({ kind: 'remove' as const, projectPath, packageId: id })));
        const restores = await this.restoreChanged(ctx, 'remove', results, options, [projectPath]);
        return { opId: ctx.opId, status: bulkStatus(results, restores), results, restores };
    }

    /** Update packages across projects: dependency projects first, all edits, then restores in the same order. */
    async bulkUpdateAllProjects(ctx: OperationRunContext, projectUpdates: Array<{ projectPath: string; packages: Array<{ id: string; version: string; sourceUrl?: string }> }>, options: WorkflowOptions): Promise<BulkOutcome> {
        const orderedProjects = await this.orderProjects(projectUpdates.map(pu => pu.projectPath), true);
        const byPath = new Map(projectUpdates.map(pu => [normalizeProjectPath(pu.projectPath), pu]));
        const requests: EditRequest[] = [];
        for (const projectPath of orderedProjects) {
            const pu = byPath.get(normalizeProjectPath(projectPath));
            if (!pu) {
                continue;
            }
            const ordered = await this.orderPackages(pu.projectPath, pu.packages, p => p.id, true);
            requests.push(...ordered.map(p => ({ kind: 'update' as const, projectPath: pu.projectPath, packageId: p.id, version: p.version, sourceUrl: p.sourceUrl })));
        }
        const results = await this.editSequence(ctx, 'update', requests);
        const restores = await this.restoreChanged(ctx, 'update', results, options, orderedProjects);
        return { opId: ctx.opId, status: bulkStatus(results, restores), results, restores };
    }

    /** Remove packages across projects: dependent projects first, all edits, then restores dependencies-first. */
    async bulkRemoveAllProjects(ctx: OperationRunContext, projectRemovals: Array<{ projectPath: string; packages: string[] }>, options: WorkflowOptions): Promise<BulkOutcome> {
        const orderedProjects = await this.orderProjects(projectRemovals.map(pr => pr.projectPath), false);
        const byPath = new Map(projectRemovals.map(pr => [normalizeProjectPath(pr.projectPath), pr]));
        const requests: EditRequest[] = [];
        for (const projectPath of orderedProjects) {
            const pr = byPath.get(normalizeProjectPath(projectPath));
            if (!pr) {
                continue;
            }
            const ordered = await this.orderPackages(pr.projectPath, pr.packages, id => id, false);
            requests.push(...ordered.map(id => ({ kind: 'remove' as const, projectPath: pr.projectPath, packageId: id })));
        }
        const results = await this.editSequence(ctx, 'remove', requests);
        const restores = await this.restoreChanged(ctx, 'remove', results, options, [...orderedProjects].reverse());
        return { opId: ctx.opId, status: bulkStatus(results, restores), results, restores };
    }

    // ─── steps ──────────────────────────────────────────────────────────────

    /** Runs the edits of one bulk in order. A refused or failed request does not stop the others; an abort marks the rest cancelled. */
    private async editSequence(ctx: OperationRunContext, kind: MutationKind, requests: EditRequest[]): Promise<OperationOutcome[]> {
        ctx.report({ status: 'running', kind, projectPaths: unique(requests.map(r => r.projectPath)), packageIds: unique(requests.map(r => r.packageId)) });
        const results: OperationOutcome[] = [];
        let index = 0;
        for (const request of requests) {
            index++;
            if (ctx.signal.aborted) {
                results.push(cancelledOutcome(ctx, request));
                continue;
            }
            ctx.report({ status: 'running', kind, projectPaths: [request.projectPath], packageIds: [request.packageId], current: index, total: requests.length, detail: `${path.basename(request.projectPath)}: ${request.packageId}` });
            const { step: edit, affected } = await this.edit(ctx, request);
            const result: OperationOutcome = { opId: ctx.opId, kind: request.kind, status: stepStatus(edit), projectPath: request.projectPath, packageId: request.packageId, version: request.version, edit, message: edit.error };
            if (affected.length > 0) {
                result.affectedProjects = affected;
            }
            results.push(result);
        }
        return results;
    }

    /** The mutator's decision on one reference edit, with the context it judged. A refusal spawns nothing. */
    private async admit(request: EditRequest): Promise<Admission> {
        let context: ProjectExecutionContext;
        try {
            context = await this.deps.contextFor(request.projectPath);
        } catch (error) {
            return { ok: false, refusal: { ok: false, error: `could not build the execution context for this project: ${redact(describe(error))}` } };
        }
        try {
            const decision = await this.deps.mutator.canMutate(context, { kind: request.kind, packageId: request.packageId, version: request.version });
            return decision.ok ? { ok: true, context, isCpm: decision.isCpm } : { ok: false, refusal: { ok: false, error: decision.error } };
        } catch (error) {
            return { ok: false, refusal: { ok: false, error: `could not decide whether the edit may run: ${redact(describe(error))}` } };
        }
    }

    private async edit(ctx: OperationRunContext, request: EditRequest): Promise<EditStep> {
        const admission = await this.admit(request);
        if (!admission.ok) {
            return { step: admission.refusal, affected: [] };
        }
        const { context, isCpm } = admission;
        let affected: string[] = [];
        if (isCpm && request.kind !== 'remove') {
            // Taken before the edit: afterwards the central entry already has the new version.
            try {
                const preview = await this.deps.mutator.previewCpmImpact(context, request.packageId, request.version ?? '');
                // Every other project once, whatever spelling the preview used.
                const seen = new Set([normalizeProjectPath(request.projectPath)]);
                affected = (preview?.affectedProjects ?? []).filter(projectPath => {
                    const key = normalizeProjectPath(projectPath);
                    if (seen.has(key)) {
                        return false;
                    }
                    seen.add(key);
                    return true;
                });
            } catch (error) {
                return { step: { ok: false, error: `could not preview the Central Package Management impact: ${redact(describe(error))}` }, affected: [] };
            }
        }
        const step = await this.runEdit(ctx, request, isCpm);
        return { step, affected: step.ok ? affected : [] };
    }

    private async runEdit(ctx: OperationRunContext, request: EditRequest, isCpm: boolean): Promise<StepOutcome> {
        const projectDir = path.dirname(request.projectPath);
        let argv: string[];
        try {
            // A CPM add never runs with --no-restore (D7); the builder refuses the pair as well.
            argv = request.kind === 'remove'
                ? removePackageArgs({ projectPath: request.projectPath, packageId: request.packageId })
                : addPackageArgs({ projectPath: request.projectPath, packageId: request.packageId, version: request.version, sourceUrl: request.sourceUrl, noRestore: !isCpm, isCpm });
        } catch (error) {
            return { ok: false, error: redact(describe(error)) };
        }
        try {
            const result = await this.deps.runner.run(argv, { cwd: projectDir, timeoutMs: EDIT_TIMEOUT_MS, signal: ctx.signal });
            this.forwardCommand(result);
            if (result.cancelled) {
                return { ok: false, error: CANCELLED };
            }
            if (result.timedOut) {
                return { ok: false, error: `dotnet timed out after ${EDIT_TIMEOUT_MS / 1000}s` };
            }
            if (result.exitCode !== 0) {
                return { ok: false, error: redact(summarize(result.stderr, result.stdout)) };
            }
            return { ok: true };
        } catch (error) {
            return { ok: false, error: redact(describe(error)) };
        }
    }

    private async restoreStep(ctx: OperationRunContext, projectPath: string, options: WorkflowOptions, scope: ProgressScope): Promise<StepOutcome> {
        // The option decides before the signal: a restore that was switched off cannot have been cancelled.
        if (options.skipRestore) {
            return { ok: true, skipped: true };
        }
        if (ctx.signal.aborted) {
            return { ok: false, skipped: true, error: CANCELLED };
        }
        ctx.report({ status: 'restoring', ...scope, detail: path.basename(projectPath) });
        return this.runRestore(ctx, projectPath);
    }

    private async runRestore(ctx: OperationRunContext, projectPath: string): Promise<StepOutcome> {
        try {
            const result = await this.deps.runner.run(restoreArgs(projectPath), { cwd: path.dirname(projectPath), timeoutMs: RESTORE_TIMEOUT_MS, signal: ctx.signal });
            this.forwardCommand(result);
            if (result.cancelled) {
                return { ok: false, error: CANCELLED };
            }
            if (result.timedOut) {
                return { ok: false, error: `dotnet restore timed out after ${RESTORE_TIMEOUT_MS / 1000}s` };
            }
            return result.exitCode === 0 ? { ok: true } : { ok: false, error: redact(summarize(result.stderr, result.stdout)) };
        } catch (error) {
            return { ok: false, error: redact(describe(error)) };
        }
    }

    /** Restore every project that had at least one successful edit, in `order`, unless restores are skipped. */
    private async restoreChanged(ctx: OperationRunContext, kind: MutationKind, results: OperationOutcome[], options: WorkflowOptions, order: string[]): Promise<ProjectRestore[]> {
        const editedIds = new Map<string, string[]>();
        for (const result of results) {
            if (result.edit?.ok && result.packageId !== undefined) {
                const key = normalizeProjectPath(result.projectPath);
                editedIds.set(key, [...(editedIds.get(key) ?? []), result.packageId]);
            }
        }
        // The projects that share a central entry an edit changed, after the edited projects, each once.
        const consumers = new Map<string, { projectPath: string; ids: string[] }>();
        for (const result of results) {
            if (!result.edit?.ok || result.packageId === undefined) {
                continue;
            }
            for (const projectPath of result.affectedProjects ?? []) {
                const key = normalizeProjectPath(projectPath);
                if (editedIds.has(key)) {
                    continue;
                }
                const entry = consumers.get(key) ?? { projectPath, ids: [] };
                if (!entry.ids.includes(result.packageId)) {
                    entry.ids.push(result.packageId);
                }
                consumers.set(key, entry);
            }
        }
        for (const [key, { ids }] of consumers) {
            editedIds.set(key, ids);
        }
        const restores: ProjectRestore[] = [];
        const ordered = [...order.filter(p => editedIds.has(normalizeProjectPath(p)) && !consumers.has(normalizeProjectPath(p))), ...[...consumers.values()].map(entry => entry.projectPath)];
        let index = 0;
        for (const projectPath of ordered) {
            index++;
            if (options.skipRestore) {
                restores.push({ projectPath, ok: true, skipped: true });
                continue;
            }
            if (ctx.signal.aborted) {
                restores.push({ projectPath, ok: false, skipped: true, error: CANCELLED });
                continue;
            }
            ctx.report({ status: 'restoring', kind, projectPaths: [projectPath], packageIds: editedIds.get(normalizeProjectPath(projectPath)) ?? [], current: index, total: ordered.length, detail: path.basename(projectPath) });
            restores.push({ projectPath, ...(await this.runRestore(ctx, projectPath)) });
        }
        return restores;
    }

    /** Hands the redacted transcript to the host. A throwing hook must not turn a finished command into a failed step. */
    private forwardCommand(result: DotnetResult): void {
        try {
            this.deps.onCommand?.(redactArgv(result.argv), result.exitCode, redact(result.stdout), redact(result.stderr), result.durationMs);
        } catch (error) {
            this.deps.logger?.warn(redact(`Command transcript hook failed: ${describe(error)}`));
        }
    }

    private async orderProjects(projectPaths: string[], dependenciesFirst: boolean): Promise<string[]> {
        const distinct = [...new Map(projectPaths.map(p => [normalizeProjectPath(p), p] as const)).values()];
        if (distinct.length <= 1) {
            return distinct;
        }
        try {
            const deps = await this.deps.projectDependencies(distinct);
            return topologicalSortByDependency(distinct, p => normalizeProjectPath(p), deps, new Set(distinct.map(p => normalizeProjectPath(p))), dependenciesFirst);
        } catch (error) {
            this.deps.logger?.warn(redact(`Project dependency ordering failed: ${describe(error)}`));
            return distinct;
        }
    }

    private async orderPackages<T>(projectPath: string, items: T[], getId: (item: T) => string, dependenciesFirst: boolean): Promise<T[]> {
        if (items.length <= 1) {
            return items;
        }
        try {
            const deps = await this.deps.packageDependencies(projectPath);
            return topologicalSortByDependency(items, item => normalizeId(getId(item)), deps, new Set(items.map(item => normalizeId(getId(item)))), dependenciesFirst);
        } catch (error) {
            this.deps.logger?.warn(redact(`Package dependency ordering failed for ${projectPath}: ${describe(error)}`));
            return items;
        }
    }
}

/** `completed` when the step succeeded, `cancelled` when it was cancelled, otherwise `failed`. */
export function stepStatus(step: StepOutcome): OperationStatus {
    return step.ok ? 'completed' : step.error === CANCELLED ? 'cancelled' : 'failed';
}

/** Status of one edit plus its restore: a failed restore after a successful edit is `partial` (ADR-003). */
export function outcomeStatus(edit: StepOutcome, restore: StepOutcome | undefined): OperationStatus {
    const editStatus = stepStatus(edit);
    if (editStatus !== 'completed' || restore === undefined) {
        return editStatus;
    }
    const restoreStatus = stepStatus(restore);
    return restoreStatus === 'failed' ? 'partial' : restoreStatus;
}

function verb(kind: OperationKind): string {
    switch (kind) {
        case 'install': return 'Installing';
        case 'update': return 'Updating';
        case 'remove': return 'Uninstalling';
        case 'restore': return 'Restoring';
        default: return 'Running';
    }
}

/**
 * The restore of an edit and of the projects that share its central entry, as one step: the edited project's failure
 * first, each failure named by its project; a cancellation without a failure is the cancellation.
 */
function combineRestores(steps: Array<{ projectPath: string; step: StepOutcome }>): StepOutcome {
    if (steps.every(({ step }) => step.ok)) {
        return steps.every(({ step }) => step.skipped) ? { ok: true, skipped: true } : { ok: true };
    }
    const failed = steps.find(({ step }) => !step.ok && step.error !== CANCELLED);
    return failed === undefined
        ? { ok: false, skipped: true, error: CANCELLED }
        : { ok: false, error: `${path.basename(failed.projectPath)}: ${failed.step.error ?? 'failed'}` };
}

/** A cancellation anywhere wins; otherwise the bulk is `completed`, `failed` (nothing completed) or `partial`. */
function bulkStatus(results: OperationOutcome[], restores: ProjectRestore[]): OperationStatus {
    if (results.some(r => r.status === 'cancelled') || restores.some(r => stepStatus(r) === 'cancelled')) {
        return 'cancelled';
    }
    const completed = results.filter(r => r.status === 'completed').length;
    if (completed === results.length && restores.every(r => r.ok)) {
        return 'completed';
    }
    return completed === 0 ? 'failed' : 'partial';
}

function cancelledOutcome(ctx: OperationRunContext, request: EditRequest): OperationOutcome {
    return { opId: ctx.opId, kind: request.kind, status: 'cancelled', projectPath: request.projectPath, packageId: request.packageId, version: request.version, edit: { ok: false, skipped: true, error: CANCELLED }, message: CANCELLED };
}

function unique(values: string[]): string[] {
    return [...new Set(values)];
}

function summarize(stderr: string, stdout: string): string {
    const lines = `${stderr}\n${stdout}`.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const errorLines = lines.filter(l => /\b(error|NU\d{4})\b/i.test(l));
    const chosen = (errorLines.length > 0 ? errorLines : lines).slice(0, 3);
    return chosen.join(' | ') || 'dotnet exited with a non-zero code';
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
