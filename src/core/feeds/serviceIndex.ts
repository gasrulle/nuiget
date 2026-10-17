/**
 * NuGet V3 service index discovery: which URLs a source exposes for search, registration,
 * flat-container content, autocomplete, vulnerability data and readmes.
 *
 * Discovery is cached per source (10 minutes on success) and failures are remembered for a short
 * TTL through `SourceHealth`, so an unreachable feed costs one timed-out request per TTL instead
 * of one per package.
 */

import type { Logger, Transport, TransportFailure } from '../contracts';
import type { NuGetSource } from '../../protocol/domain';
import { SourceHealthTracker } from './health';
import type { FeedsDeps, ResolvedSource, ServiceEndpoints, ServiceIndexClient, SourceHealth } from './types';
import { asString, consoleFallbackLogger, isRecord, isRemoteSourceUrl, redactUrl } from './wire';

export const SERVICE_INDEX_SUCCESS_TTL_MS = 10 * 60_000;
export const SERVICE_INDEX_FAILURE_TTL_MS = 120_000;
/** Discovery is the first request to a feed; a slow answer here would stall every other query. */
export const SERVICE_INDEX_TIMEOUT_MS = 5_000;

export interface ServiceIndexClientOptions {
    successTtlMs?: number;
    failureTtlMs?: number;
    timeoutMs?: number;
    now?: () => number;
    /** Shared health tracker; a private one (with `failureTtlMs`) is created when omitted. */
    health?: SourceHealth;
}

/** The `index.json` URL for a source URL (`https://feed/v3/` → `https://feed/v3/index.json`). */
export function serviceIndexUrl(sourceUrl: string): string {
    const trimmed = sourceUrl.trim();
    if (/\/index\.json(?:[?#].*)?$/i.test(trimmed)) {
        return trimmed;
    }
    return `${trimmed.replace(/\/+$/, '')}/index.json`;
}

/** True when at least one endpoint that can answer package queries was found. */
export function hasUsableEndpoint(endpoints: ServiceEndpoints): boolean {
    return endpoints.packageBaseAddress !== undefined
        || endpoints.registrationsBaseUrl !== undefined
        || endpoints.searchQueryService !== undefined;
}

interface ResourceCandidate {
    id: string;
    family: string;
    version: string | undefined;
}

const VERSIONLESS = undefined;

function candidates(index: unknown): ResourceCandidate[] {
    if (!isRecord(index) || !Array.isArray(index.resources)) {
        return [];
    }
    const result: ResourceCandidate[] = [];
    for (const resource of index.resources) {
        if (!isRecord(resource)) {
            continue;
        }
        const id = asString(resource['@id']);
        if (!id) {
            continue;
        }
        const rawTypes = resource['@type'];
        const types = Array.isArray(rawTypes) ? rawTypes : [rawTypes];
        for (const type of types) {
            if (typeof type !== 'string' || type.length === 0) {
                continue;
            }
            const slash = type.indexOf('/');
            result.push({
                id,
                family: slash === -1 ? type : type.slice(0, slash),
                version: slash === -1 ? VERSIONLESS : type.slice(slash + 1),
            });
        }
    }
    return result;
}

/** First resource of `family` matching the preferred versions in order, else any member of the family. */
function pick(
    resources: ResourceCandidate[],
    family: string,
    preferredVersions: Array<string | undefined>,
    reject?: (candidate: ResourceCandidate) => boolean,
): string | undefined {
    const members = resources.filter(candidate => candidate.family.toLowerCase() === family.toLowerCase() && !(reject?.(candidate) ?? false));
    for (const version of preferredVersions) {
        const hit = members.find(candidate => candidate.version === version);
        if (hit) {
            return hit.id;
        }
    }
    return members[0]?.id;
}

// nuget.org's `-gz-` registration blobs are served pre-compressed regardless of Accept-Encoding;
// the plain `registration5-semver1` hive is the one every client can read.
const isGzipRegistration = (candidate: ResourceCandidate): boolean =>
    candidate.id.includes('-gz-') || (candidate.version?.toLowerCase().includes('gz') ?? false);

/** Select endpoints from a parsed service index; `{}` when the document is not a V3 index. */
export function selectEndpoints(index: unknown): ServiceEndpoints {
    const resources = candidates(index);
    if (resources.length === 0) {
        return {};
    }
    const endpoints: ServiceEndpoints = {};
    const assign = (key: keyof ServiceEndpoints, value: string | undefined): void => {
        if (value !== undefined) {
            endpoints[key] = value;
        }
    };
    assign('packageBaseAddress', pick(resources, 'PackageBaseAddress', ['3.0.0']));
    assign('registrationsBaseUrl', pick(resources, 'RegistrationsBaseUrl', ['3.6.0', '3.4.0', VERSIONLESS], isGzipRegistration));
    assign('searchQueryService', pick(resources, 'SearchQueryService', ['3.5.0', VERSIONLESS]));
    assign('searchAutocompleteService', pick(resources, 'SearchAutocompleteService', ['3.5.0', VERSIONLESS]));
    assign('vulnerabilityInfoUrl', pick(resources, 'VulnerabilityInfo', ['6.7.0']));
    assign('readmeUriTemplate', pick(resources, 'ReadmeUriTemplate', ['6.13.0']));
    return endpoints;
}

/** `work`, or `{}` as soon as `signal` aborts; `work` itself goes on for whoever else waits for it. */
function untilAborted(work: Promise<ServiceEndpoints>, signal: AbortSignal | undefined): Promise<ServiceEndpoints> {
    if (!signal) {
        return work;
    }
    if (signal.aborted) {
        return Promise.resolve({});
    }
    return new Promise(resolve => {
        const onAbort = (): void => resolve({});
        signal.addEventListener('abort', onAbort, { once: true });
        void work.then(endpoints => {
            signal.removeEventListener('abort', onAbort);
            resolve(endpoints);
        });
    });
}

function describeFailure(failure: TransportFailure): string {
    const status = failure.status !== undefined ? ` ${failure.status}` : '';
    return `${failure.code}${status}: ${failure.message}`;
}

export class DefaultServiceIndexClient implements ServiceIndexClient {
    readonly health: SourceHealth;

    private readonly transport: Transport;
    private readonly getAuthHeader: FeedsDeps['getAuthHeader'];
    private readonly logger: Logger;
    private readonly successTtlMs: number;
    private readonly timeoutMs: number;
    private readonly now: () => number;
    private readonly successCache = new Map<string, { endpoints: ServiceEndpoints; expiresAt: number }>();
    private readonly inFlight = new Map<string, Promise<ServiceEndpoints>>();

    constructor(deps: Pick<FeedsDeps, 'transport' | 'getAuthHeader' | 'logger'>, options: ServiceIndexClientOptions = {}) {
        this.transport = deps.transport;
        this.getAuthHeader = deps.getAuthHeader;
        this.logger = deps.logger ?? consoleFallbackLogger;
        this.successTtlMs = options.successTtlMs ?? SERVICE_INDEX_SUCCESS_TTL_MS;
        this.timeoutMs = options.timeoutMs ?? SERVICE_INDEX_TIMEOUT_MS;
        this.now = options.now ?? Date.now;
        this.health = options.health ?? new SourceHealthTracker({ failureTtlMs: options.failureTtlMs ?? SERVICE_INDEX_FAILURE_TTL_MS, now: this.now });
    }

    endpoints(sourceUrl: string, signal?: AbortSignal): Promise<ServiceEndpoints> {
        return this.discover(sourceUrl, signal, false);
    }

    async resolve(sources: NuGetSource[], signal?: AbortSignal): Promise<ResolvedSource[]> {
        const eligible = sources.filter(source => this.isRemote(source) && this.health.isHealthy(source.url));
        const resolved = await Promise.all(eligible.map(async (source): Promise<ResolvedSource | undefined> => {
            const [endpoints, authHeader] = await Promise.all([this.endpoints(source.url, signal), this.authHeaderFor(source.url)]);
            return hasUsableEndpoint(endpoints) ? { source, endpoints, authHeader } : undefined;
        }));
        return resolved.filter((entry): entry is ResolvedSource => entry !== undefined);
    }

    async probe(sources: NuGetSource[], signal?: AbortSignal): Promise<void> {
        await Promise.all(sources.filter(source => this.isRemote(source)).map(source => this.discover(source.url, signal, true)));
    }

    clearCaches(): void {
        this.successCache.clear();
        this.inFlight.clear();
        this.health.reset();
    }

    private isRemote(source: NuGetSource): boolean {
        return source.enabled && !source.isLocal && isRemoteSourceUrl(source.url);
    }

    private discover(sourceUrl: string, signal: AbortSignal | undefined, bypassCaches: boolean): Promise<ServiceEndpoints> {
        if (!isRemoteSourceUrl(sourceUrl)) {
            return Promise.resolve({});
        }
        if (!bypassCaches) {
            const cached = this.successCache.get(sourceUrl);
            if (cached && cached.expiresAt > this.now()) {
                return Promise.resolve(cached.endpoints);
            }
            if (!this.health.isHealthy(sourceUrl)) {
                return Promise.resolve({});
            }
        }
        let shared = this.inFlight.get(sourceUrl);
        if (!shared) {
            // One discovery serves every caller: it runs without any one caller's signal (its own timeout bounds it),
            // so a caller that gives up does not turn the others' answer into "no endpoints".
            const promise = this.fetchEndpoints(sourceUrl).finally(() => {
                if (this.inFlight.get(sourceUrl) === promise) {
                    this.inFlight.delete(sourceUrl);
                }
            });
            this.inFlight.set(sourceUrl, promise);
            shared = promise;
        }
        return untilAborted(shared, signal);
    }

    private async fetchEndpoints(sourceUrl: string): Promise<ServiceEndpoints> {
        const authHeader = await this.authHeaderFor(sourceUrl);
        const result = await this.transport.fetchJson<unknown>({
            url: serviceIndexUrl(sourceUrl),
            headers: authHeader ? { Authorization: authHeader } : undefined,
            timeoutMs: this.timeoutMs,
        });
        if (!result.ok) {
            if (result.code !== 'cancelled') {
                this.recordFailure(sourceUrl, describeFailure(result));
            }
            return {};
        }
        const endpoints = selectEndpoints(result.data);
        if (!hasUsableEndpoint(endpoints)) {
            this.recordFailure(sourceUrl, 'Not a NuGet V3 service index: no search, registration or package base address resource');
            return {};
        }
        this.successCache.set(sourceUrl, { endpoints, expiresAt: this.now() + this.successTtlMs });
        this.health.markHealthy(sourceUrl);
        return endpoints;
    }

    private recordFailure(sourceUrl: string, error: string): void {
        this.successCache.delete(sourceUrl);
        this.health.markFailed(sourceUrl, error);
        this.logger.warn(`[ServiceIndex] ${redactUrl(sourceUrl)} unavailable: ${error}`);
    }

    private async authHeaderFor(sourceUrl: string): Promise<string | undefined> {
        try {
            return await this.getAuthHeader(sourceUrl);
        } catch (error) {
            this.logger.debug(`[ServiceIndex] No credentials for ${redactUrl(sourceUrl)}: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }
}
