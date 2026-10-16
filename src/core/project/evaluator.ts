/**
 * MSBuild evaluation of a project (ADR-004 tier 2): one combined run of the four properties and the two item types
 * with no global property, whose items stand when `TargetFrameworks` is empty; a cross-targeting project's first run
 * is the outer build, whose items lack the conditional and SDK-implicit references (probe row `multitfm-combined`), so
 * they are discarded for one item run per target framework. The items are read into the same rows the static
 * inspection produces, with `fidelity: 'authoritative'`. Successes are cached per project and revision; a failure is
 * never cached.
 */

import * as path from 'path';
import type { DotnetResult, DotnetRunner, Logger, ProjectEvaluator, ProjectExecutionContext } from '../contracts';
import type { Fidelity, InstalledPackage, InstalledResult } from '../../protocol/domain';
import { DEFAULT_TIMEOUT_MS, msbuildGetArgs } from '../cli';
import { redact } from '../logging';
import { normalizeProjectPath } from '../util/paths';
import { findCentralPropsPath, parseBooleanProperty } from './central';
import { resolvedRow, unresolvedRow } from './rows';

export interface EvaluatorDeps {
    runner: DotnetRunner;
    /** Directories at which the walk up to `Directory.Packages.props` stops (the workspace folders). */
    stopDirs?: readonly string[];
    logger?: Logger;
}

/** An evaluation run that failed, timed out, was cancelled or printed no JSON. */
export class EvaluationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EvaluationError';
    }
}

/**
 * Always the four properties of the SDK probe, asked together with the items in the first run: `-getProperty` with a
 * single name prints the bare value, not JSON. `CentralPackageVersionOverrideEnabled` is `""` when unset, which means
 * enabled.
 */
const PROPERTIES = ['TargetFramework', 'TargetFrameworks', 'ManagePackageVersionsCentrally', 'CentralPackageVersionOverrideEnabled'];
const ITEMS = ['PackageReference', 'PackageVersion'];
const PROPERTY_REFERENCE = '$(';
const STDERR_TAIL = 500;

type Metadata = Record<string, string | undefined>;

interface ItemRun {
    framework: string | undefined;
    references: Metadata[];
    versions: Metadata[];
}

export class MsBuildProjectEvaluator implements ProjectEvaluator {
    private readonly cache = new Map<string, { revision: string; result: Promise<InstalledResult> }>();

    constructor(private readonly deps: EvaluatorDeps) {}

    /**
     * The runs are bound to no caller's signal: the coordinator aborts a stale computation, and the next computation of
     * the same revision joins the promise in flight instead of restarting 1+N runs (ADR-002, N79); each run is bounded
     * by its timeout. A caller already cancelled starts nothing.
     */
    evaluate(context: ProjectExecutionContext, signal?: AbortSignal): Promise<InstalledResult> {
        if (signal?.aborted) {
            return Promise.reject(new EvaluationError(`MSBuild evaluation of ${path.basename(context.projectPath)} was cancelled before it started`));
        }
        const key = normalizeProjectPath(context.projectPath);
        const cached = this.cache.get(key);
        if (cached !== undefined && cached.revision === context.revision) {
            return cached.result;
        }
        // Two callers of one revision share one evaluation; a rejection leaves the cache so the next call evaluates again.
        const result = this.run(context);
        const entry = { revision: context.revision, result };
        this.cache.set(key, entry);
        result.catch(() => {
            if (this.cache.get(key) === entry) {
                this.cache.delete(key);
            }
        });
        return result;
    }

    /**
     * `'authoritative'` when an evaluation of the project is cached at any revision. Whether it is current is the
     * Catalog's to know (it holds the context and its revision).
     */
    cachedFidelity(projectPath: string): Fidelity | undefined {
        return this.cache.has(normalizeProjectPath(projectPath)) ? 'authoritative' : undefined;
    }

    private async run(context: ProjectExecutionContext): Promise<InstalledResult> {
        const { projectPath } = context;
        const first = await this.json(context, msbuildGetArgs(projectPath, ITEMS, PROPERTIES));
        const properties = asStrings(record(first, 'Properties'));
        const frameworks = targetFrameworks(properties);
        const runs: ItemRun[] = [];
        if ((properties.TargetFrameworks ?? '').trim() === '') {
            const items = record(first, 'Items');
            runs.push({ framework: frameworks[0], references: itemList(items.PackageReference), versions: itemList(items.PackageVersion) });
        } else {
            for (const framework of frameworks) {
                const items = record(await this.json(context, msbuildGetArgs(projectPath, ITEMS, [], { TargetFramework: framework })), 'Items');
                runs.push({ framework, references: itemList(items.PackageReference), versions: itemList(items.PackageVersion) });
            }
        }

        const isCpm = parseBooleanProperty(properties.ManagePackageVersionsCentrally) === true;
        const overridesEnabled = parseBooleanProperty(properties.CentralPackageVersionOverrideEnabled) !== false;
        const packages = mergeFrameworks(runs.map(run => ({
            framework: run.framework,
            rows: run.references.map(item => describe(item, projectPath, isCpm, overridesEnabled, run.versions)),
        })));

        const result: InstalledResult = { projectPath, packages, fidelity: 'authoritative', isCpm };
        if (isCpm) {
            const centralPropsPath = runs.flatMap(run => run.versions).find(item => item.DefiningProjectFullPath)?.DefiningProjectFullPath
                ?? await findCentralPropsPath(context.projectDir, this.deps.stopDirs);
            if (centralPropsPath !== undefined) {
                result.centralPropsPath = centralPropsPath;
            }
        }
        return result;
    }

    /** One `dotnet msbuild` run in the project directory, read as the JSON object it prints after any prefix lines. */
    private async json(context: ProjectExecutionContext, args: string[]): Promise<unknown> {
        const result = await this.deps.runner.run(args, { cwd: context.projectDir, timeoutMs: DEFAULT_TIMEOUT_MS });
        if (result.exitCode !== 0 || result.cancelled === true || result.timedOut === true) {
            throw this.failure(context, result, result.cancelled === true ? 'was cancelled' : result.timedOut === true ? 'timed out' : `exited with ${result.exitCode}`);
        }
        const document = parseJsonAfterPrefix(result.stdout);
        if (document === undefined) {
            throw this.failure(context, result, 'printed no JSON');
        }
        return document;
    }

    private failure(context: ProjectExecutionContext, result: DotnetResult, what: string): EvaluationError {
        const stderr = result.stderr.trim().slice(-STDERR_TAIL);
        this.deps.logger?.warn(redact(`MSBuild evaluation of ${context.projectPath} ${what}${stderr === '' ? '' : `: ${stderr}`}`));
        return new EvaluationError(`MSBuild evaluation of ${path.basename(context.projectPath)} ${what}`);
    }
}

/** The JSON object of an msbuild run: from the first line that starts with `{` to the end. */
export function parseJsonAfterPrefix(stdout: string): unknown {
    const lines = stdout.replace(/^\uFEFF/, '').split(/\r?\n/);
    const start = lines.findIndex(line => line.trimStart().startsWith('{'));
    if (start < 0) {
        return undefined;
    }
    try {
        const document: unknown = JSON.parse(lines.slice(start).join('\n'));
        return typeof document === 'object' && document !== null && !Array.isArray(document) ? document : undefined;
    } catch {
        return undefined;
    }
}

function record(document: unknown, name: string): Record<string, unknown> {
    const value = (document as Record<string, unknown>)[name];
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asStrings(value: Record<string, unknown>): Metadata {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => typeof entry === 'string')) as Metadata;
}

function itemList(value: unknown): Metadata[] {
    return Array.isArray(value) ? value.filter(item => typeof item === 'object' && item !== null).map(item => asStrings(item as Record<string, unknown>)) : [];
}

/** `TargetFrameworks` split on `;` when set, else `TargetFramework`, else none. */
function targetFrameworks(properties: Metadata): string[] {
    const many = (properties.TargetFrameworks ?? '').split(';').map(framework => framework.trim()).filter(framework => framework.length > 0);
    if (many.length > 0) {
        return [...new Set(many)];
    }
    const one = properties.TargetFramework?.trim();
    return one ? [one] : [];
}

/** A `PackageReference` item as a row, in the order of decisions of the inspection (`inspector.ts`, `describe`). */
function describe(item: Metadata, projectPath: string, isCpm: boolean, overridesEnabled: boolean, versions: Metadata[]): InstalledPackage {
    const id = item.Identity ?? '';
    const defining = item.DefiningProjectFullPath;
    const definedIn = defining !== undefined && defining !== '' && normalizeProjectPath(defining) !== normalizeProjectPath(projectPath) ? defining : undefined;
    const origin = { definedIn, isImplicit: parseBooleanProperty(item.IsImplicitlyDefined) === true };
    const version = nonEmpty(item.Version);
    const versionOverride = nonEmpty(item.VersionOverride);
    if ([version, versionOverride].some(value => value?.includes(PROPERTY_REFERENCE))) {
        return unresolvedRow(id, origin);
    }
    if (isCpm && versionOverride !== undefined) {
        return overridesEnabled ? resolvedRow(id, 'central-override', versionOverride, origin) : unresolvedRow(id, origin);
    }
    if (version !== undefined) {
        return resolvedRow(id, definedIn === undefined ? 'project' : 'props', version, origin);
    }
    const central = isCpm ? versions.find(entry => entry.Identity?.toLowerCase() === id.toLowerCase()) : undefined;
    const centralVersion = nonEmpty(central?.Version);
    if (central === undefined || centralVersion === undefined || centralVersion.includes(PROPERTY_REFERENCE)) {
        return unresolvedRow(id, origin);
    }
    return resolvedRow(id, 'central', centralVersion, { ...origin, definedIn: definedIn ?? nonEmpty(central.DefiningProjectFullPath) });
}

/**
 * Rows merged across frameworks by id, version, declaration and implicitness (the inspection's key). A row present in
 * every framework has no `targetFrameworks`; a row missing from at least one lists the frameworks it is in.
 */
function mergeFrameworks(runs: Array<{ framework: string | undefined; rows: InstalledPackage[] }>): InstalledPackage[] {
    const merged = new Map<string, { pkg: InstalledPackage; frameworks: string[] }>();
    for (const run of runs) {
        for (const pkg of run.rows) {
            const key = `${pkg.id.toLowerCase()}|${pkg.version}|${pkg.declaration}|${pkg.isImplicit === true}`;
            const existing = merged.get(key);
            if (existing === undefined) {
                merged.set(key, { pkg, frameworks: run.framework === undefined ? [] : [run.framework] });
            } else if (run.framework !== undefined && !existing.frameworks.includes(run.framework)) {
                existing.frameworks.push(run.framework);
            }
        }
    }
    const all = runs.map(run => run.framework).filter((framework): framework is string => framework !== undefined);
    return [...merged.values()].map(({ pkg, frameworks }) =>
        frameworks.length < all.length ? { ...pkg, targetFrameworks: frameworks } : pkg);
}

function nonEmpty(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}
