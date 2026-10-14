/**
 * NuGet V3 wire types and the small shape helpers every feed client needs.
 *
 * Field names vary across server implementations (nuget.org, BaGet, Nexus, ProGet, Azure
 * Artifactory, GitHub Packages): camelCase on nuget.org, PascalCase on several third-party
 * servers, and a bare array instead of `{ data: [] }` on others. Readers here accept every
 * known spelling so the clients can stay free of vendor branching.
 */

import type { Logger } from '../contracts';
import type { ResolvedSource } from './types';

// ─── Service index ───────────────────────────────────────────────────────────

export interface NuGetServiceIndexResource {
    '@id'?: string;
    '@type'?: string | string[];
    comment?: string;
}

export interface NuGetServiceIndex {
    version?: string;
    resources?: NuGetServiceIndexResource[];
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface NuGetSearchVersionEntry {
    version?: string;
    downloads?: number;
    '@id'?: string;
}

/** A single package entry in a NuGet search response. */
export interface NuGetSearchEntry {
    id?: string;
    Id?: string;
    version?: string;
    Version?: string;
    description?: string;
    Description?: string;
    summary?: string;
    Summary?: string;
    authors?: string | string[];
    Authors?: string | string[];
    owner?: string;
    Owner?: string;
    totalDownloads?: number;
    TotalDownloads?: number;
    versions?: NuGetSearchVersionEntry[];
    Versions?: NuGetSearchVersionEntry[];
    iconUrl?: string;
    IconUrl?: string;
    verified?: boolean;
    Verified?: boolean;
    packageTypes?: Array<{ name?: string }>;
    licenseExpression?: string;
    LicenseExpression?: string;
    licenseUrl?: string;
    LicenseUrl?: string;
    projectUrl?: string;
    ProjectUrl?: string;
}

/** NuGet search API response; nuget.org uses `data`, some servers `Data` or a root array. */
export interface NuGetSearchResponse {
    data?: NuGetSearchEntry[];
    Data?: NuGetSearchEntry[];
    totalHits?: number;
    TotalHits?: number;
}

export interface NuGetAutocompleteResponse {
    data?: string[];
    Data?: string[];
    totalHits?: number;
}

// ─── Registration ────────────────────────────────────────────────────────────

export interface NuGetRegistrationDependency {
    id?: string;
    range?: string;
    version?: string;
    '@id'?: string;
}

export interface NuGetRegistrationDependencyGroup {
    targetFramework?: string;
    '@id'?: string;
    dependencies?: NuGetRegistrationDependency[];
}

/** A catalog entry or registration leaf; may appear inline or behind a `catalogEntry` URL. */
export interface NuGetRegistrationEntry {
    '@id'?: string;
    id?: string;
    version?: string;
    description?: string;
    authors?: string | string[];
    summary?: string;
    title?: string;
    catalogEntry?: string | NuGetRegistrationEntry;
    dependencyGroups?: NuGetRegistrationDependencyGroup[];
    listed?: boolean;
    published?: string;
    packageContent?: string;
    licenseExpression?: string;
    licenseUrl?: string;
    projectUrl?: string;
    iconUrl?: string;
    items?: NuGetRegistrationPage[];
}

/** A page in a registration index; pages may inline items or require a fetch via `@id`. */
export interface NuGetRegistrationPage {
    '@id'?: string;
    items?: NuGetRegistrationEntry[];
    lower?: string;
    upper?: string;
    count?: number;
}

// ─── Flat container ──────────────────────────────────────────────────────────

export interface NuGetFlatContainerIndex {
    versions?: string[];
}

// ─── Vulnerability info ──────────────────────────────────────────────────────

export interface NuGetVulnerabilityIndexEntry {
    '@name'?: string;
    '@id'?: string;
    '@updated'?: string;
}

export interface NuGetVulnerabilityRecord {
    severity?: number;
    url?: string;
    versions?: string;
}

/** A vulnerability page: lower-cased package id → advisories. */
export type NuGetVulnerabilityPage = Record<string, NuGetVulnerabilityRecord[]>;

// ─── dotnet package search --format json ─────────────────────────────────────

export interface CliSearchProblem {
    text?: string;
    problemType?: string;
}

export interface CliSearchPackage {
    id?: string;
    /** Present for ordinary searches. */
    latestVersion?: string;
    /** Present for `--exact-match` (one entry per version). */
    version?: string;
    owners?: string;
    totalDownloads?: number;
}

export interface CliSearchSourceResult {
    sourceName?: string;
    problems?: CliSearchProblem[];
    packages?: CliSearchPackage[];
}

export interface CliSearchOutput {
    version?: number;
    problems?: CliSearchProblem[];
    searchResult?: CliSearchSourceResult[];
}

// ─── Shape helpers ───────────────────────────────────────────────────────────

/** Entries from a search payload regardless of `data` / `Data` / root-array spelling. */
export function readSearchEntries(payload: unknown): NuGetSearchEntry[] {
    if (Array.isArray(payload)) {
        return payload.filter(isRecord) as NuGetSearchEntry[];
    }
    if (!isRecord(payload)) {
        return [];
    }
    const data = payload.data ?? payload.Data;
    return Array.isArray(data) ? (data.filter(isRecord) as NuGetSearchEntry[]) : [];
}

/** Autocomplete ids regardless of `data` / `Data` / root-array spelling. */
export function readAutocompleteIds(payload: unknown): string[] {
    const list = Array.isArray(payload) ? payload : isRecord(payload) ? (payload.data ?? payload.Data) : undefined;
    return Array.isArray(list) ? list.filter((value): value is string => typeof value === 'string' && value.length > 0) : [];
}

export function entryId(entry: NuGetSearchEntry): string | undefined {
    return asString(entry.id) ?? asString(entry.Id);
}

export function entryVersion(entry: NuGetSearchEntry): string | undefined {
    return asString(entry.version) ?? asString(entry.Version);
}

export function entryDescription(entry: NuGetSearchEntry): string {
    return asString(entry.description) ?? asString(entry.Description) ?? asString(entry.summary) ?? asString(entry.Summary) ?? '';
}

/** Authors as a single comma-separated string (servers emit arrays, strings or only an owner). */
export function entryAuthors(entry: NuGetSearchEntry): string {
    const raw = entry.authors ?? entry.Authors;
    if (Array.isArray(raw)) {
        return raw.filter((value): value is string => typeof value === 'string').map(value => value.trim()).filter(Boolean).join(', ');
    }
    if (typeof raw === 'string' && raw.trim()) {
        return raw.trim();
    }
    return asString(entry.owner) ?? asString(entry.Owner) ?? '';
}

export function entryDownloads(entry: NuGetSearchEntry): number | undefined {
    const raw = entry.totalDownloads ?? entry.TotalDownloads;
    return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : undefined;
}

export function entryVersions(entry: NuGetSearchEntry): string[] {
    const raw = entry.versions ?? entry.Versions;
    if (!Array.isArray(raw)) {
        return [];
    }
    return raw.map(item => (isRecord(item) ? asString(item.version) : undefined)).filter((value): value is string => value !== undefined);
}

export function entryIconUrl(entry: NuGetSearchEntry): string | undefined {
    const raw = asString(entry.iconUrl) ?? asString(entry.IconUrl);
    return raw && isRemoteSourceUrl(raw) ? raw : undefined;
}

export function entryVerified(entry: NuGetSearchEntry): boolean | undefined {
    const raw = entry.verified ?? entry.Verified;
    return typeof raw === 'boolean' ? raw : undefined;
}

/** Authors from a registration entry (string or array). */
export function registrationAuthors(entry: NuGetRegistrationEntry): string {
    const raw = entry.authors;
    if (Array.isArray(raw)) {
        return raw.filter((value): value is string => typeof value === 'string').map(value => value.trim()).filter(Boolean).join(', ');
    }
    return typeof raw === 'string' ? raw.trim() : '';
}

// ─── URL / request helpers ───────────────────────────────────────────────────

/** True for `http(s)` source URLs; everything else is a file-system source without an API. */
export function isRemoteSourceUrl(url: string): boolean {
    return /^https?:\/\//i.test(url.trim());
}

export function trimTrailingSlash(url: string): string {
    return url.replace(/\/+$/, '');
}

/** Lower-cased id for flat-container / registration paths. */
export function pathSegment(value: string): string {
    return encodeURIComponent(value.trim().toLowerCase());
}

/** Request headers carrying the source's `Authorization` value, when any. */
export function authHeaders(source: Pick<ResolvedSource, 'authHeader'>): Record<string, string> | undefined {
    return source.authHeader ? { Authorization: source.authHeader } : undefined;
}

/** Case-insensitive response-header lookup. */
export function headerValue(headers: Record<string, string>, name: string): string | undefined {
    const direct = headers[name] ?? headers[name.toLowerCase()];
    if (direct !== undefined) {
        return direct;
    }
    const wanted = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === wanted) {
            return value;
        }
    }
    return undefined;
}

/** Strip credentials and query strings from a URL before logging it. */
export function redactUrl(url: string): string {
    try {
        const parsed = new URL(url);
        parsed.username = '';
        parsed.password = '';
        parsed.search = '';
        parsed.hash = '';
        return parsed.toString();
    } catch {
        return url.replace(/\/\/[^/@]+@/, '//');
    }
}

/** Run `fn` over `items` with at most `limit` in flight; results keep input order. */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array<R>(items.length);
    let next = 0;
    const worker = async (): Promise<void> => {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index], index);
        }
    };
    const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => worker());
    await Promise.all(workers);
    return results;
}

/** Logger used when the host does not provide one: warnings and errors still reach the console. */
export const consoleFallbackLogger: Logger = {
    trace: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: (message, ...args) => console.warn(message, ...args),
    error: (message, ...args) => console.error(message, ...args),
};

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}
