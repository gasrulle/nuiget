/**
 * Flat-container (`PackageBaseAddress/3.0.0`) client: version index, nuspec, package size, package
 * download and icon. Paths use the lower-cased id and the lower-cased *normalized* version, as the
 * protocol requires (`1.0` is stored as `1.0.0`).
 */

import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Logger, Transport, TransportResult, TransportSuccess } from '../contracts';
import { normalize } from '../versioning';
import type { FeedsDeps, FlatContainerClient, IconFetch, ResolvedSource } from './types';
import { authHeaders, consoleFallbackLogger, headerValue, pathSegment, redactUrl, trimTrailingSlash } from './wire';

/** Largest .nupkg accepted for readme extraction; bigger packages are not worth a temp-disk round trip. */
export const MAX_PACKAGE_DOWNLOAD_BYTES = 100 * 1024 * 1024;
/** Largest icon body accepted from a feed. */
export const MAX_FLAT_ICON_BYTES = 256 * 1024;

export interface FlatContainerClientOptions {
    maxPackageBytes?: number;
    maxIconBytes?: number;
    /** Directory for downloaded packages (defaults to `os.tmpdir()`). */
    tempDir?: () => string;
}

export interface FlatContainerUrls {
    index: string;
    nuspec: string;
    nupkg: string;
    icon: string;
}

/** Lower-cased, normalized version segment (`1.0` → `1.0.0`); unparsable text is only lower-cased. */
export function versionSegment(version: string): string {
    return encodeURIComponent((normalize(version) ?? version.trim()).toLowerCase());
}

/** The flat-container URLs for one package version under `packageBaseAddress`. */
export function flatContainerUrls(packageBaseAddress: string, packageId: string, version: string): FlatContainerUrls {
    const base = trimTrailingSlash(packageBaseAddress.trim());
    const id = pathSegment(packageId);
    const ver = versionSegment(version);
    return {
        index: `${base}/${id}/index.json`,
        nuspec: `${base}/${id}/${ver}/${id}.nuspec`,
        nupkg: `${base}/${id}/${ver}/${id}.${ver}.nupkg`,
        icon: `${base}/${id}/${ver}/icon`,
    };
}

function isSuccess(result: TransportResult): result is TransportSuccess {
    return result.ok && result.status >= 200 && result.status < 300;
}

function isNotFound(result: TransportResult): boolean {
    return result.ok ? result.status === 404 : result.status === 404;
}

function describe(result: TransportResult): string {
    return result.ok ? `HTTP ${result.status}` : `${result.code}${result.status !== undefined ? ` ${result.status}` : ''}: ${result.message}`;
}

// Feeds that serve icons as octet-stream are accepted so the caller can sniff the image signature.
function isAcceptableIconType(contentType: string | undefined): boolean {
    const mediaType = (contentType ?? '').split(';')[0].trim().toLowerCase();
    return mediaType.startsWith('image/') || mediaType === '' || mediaType === 'application/octet-stream' || mediaType === 'binary/octet-stream';
}

export class DefaultFlatContainerClient implements FlatContainerClient {
    private readonly transport: Transport;
    private readonly logger: Logger;
    private readonly maxPackageBytes: number;
    private readonly maxIconBytes: number;
    private readonly tempDir: () => string;

    constructor(deps: Pick<FeedsDeps, 'transport' | 'logger'>, options: FlatContainerClientOptions = {}) {
        this.transport = deps.transport;
        this.logger = deps.logger ?? consoleFallbackLogger;
        this.maxPackageBytes = options.maxPackageBytes ?? MAX_PACKAGE_DOWNLOAD_BYTES;
        this.maxIconBytes = options.maxIconBytes ?? MAX_FLAT_ICON_BYTES;
        this.tempDir = options.tempDir ?? os.tmpdir;
    }

    /** All versions the feed stores (including unlisted); `[]` when the package is unknown, `undefined` on failure. */
    async versionIndex(source: ResolvedSource, packageId: string, signal?: AbortSignal): Promise<string[] | undefined> {
        const urls = this.urls(source, packageId, '0.0.0');
        if (!urls) {
            return undefined;
        }
        const result = await this.transport.fetchJson<unknown>({ url: urls.index, headers: authHeaders(source), signal });
        if (!result.ok) {
            if (result.status === 404) {
                return [];
            }
            this.logger.debug(`[FlatContainer] Version index failed for ${packageId} at ${redactUrl(urls.index)}: ${describe(result)}`);
            return undefined;
        }
        const data = result.data;
        const versions = typeof data === 'object' && data !== null && Array.isArray((data as { versions?: unknown }).versions)
            ? (data as { versions: unknown[] }).versions
            : undefined;
        if (!versions) {
            this.logger.debug(`[FlatContainer] Version index for ${packageId} at ${redactUrl(urls.index)} has no versions array`);
            return undefined;
        }
        return versions.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
    }

    async nuspec(source: ResolvedSource, packageId: string, version: string, signal?: AbortSignal): Promise<string | undefined> {
        const urls = this.urls(source, packageId, version);
        if (!urls) {
            return undefined;
        }
        const result = await this.transport.fetch({ url: urls.nuspec, headers: authHeaders(source), signal });
        if (!isSuccess(result)) {
            if (!isNotFound(result)) {
                this.logger.debug(`[FlatContainer] nuspec failed for ${packageId}@${version}: ${describe(result)}`);
            }
            return undefined;
        }
        const text = result.body.toString('utf8');
        return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    }

    async packageSize(source: ResolvedSource, packageId: string, version: string, signal?: AbortSignal): Promise<number | undefined> {
        const urls = this.urls(source, packageId, version);
        if (!urls) {
            return undefined;
        }
        const result = await this.transport.head({ url: urls.nupkg, headers: authHeaders(source), signal });
        if (!isSuccess(result)) {
            return undefined;
        }
        const length = headerValue(result.headers, 'content-length');
        if (length === undefined || !/^\d+$/.test(length.trim())) {
            return undefined;
        }
        const size = Number.parseInt(length, 10);
        return Number.isSafeInteger(size) && size >= 0 ? size : undefined;
    }

    async downloadPackage(source: ResolvedSource, packageId: string, version: string, signal?: AbortSignal): Promise<string | undefined> {
        const urls = this.urls(source, packageId, version);
        if (!urls) {
            return undefined;
        }
        const result = await this.transport.fetch({ url: urls.nupkg, headers: authHeaders(source), signal, maxBytes: this.maxPackageBytes });
        if (!isSuccess(result)) {
            if (!isNotFound(result)) {
                this.logger.debug(`[FlatContainer] Download failed for ${packageId}@${version}: ${describe(result)}`);
            }
            return undefined;
        }
        if (result.body.length === 0 || result.body.length > this.maxPackageBytes) {
            return undefined;
        }
        const fileName = `nuiget-${pathSegment(packageId)}.${versionSegment(version)}-${randomBytes(6).toString('hex')}.nupkg`;
        const filePath = path.join(this.tempDir(), fileName);
        try {
            await fs.promises.writeFile(filePath, result.body, { flag: 'wx' });
            return filePath;
        } catch (error) {
            this.logger.warn(`[FlatContainer] Cannot write ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }

    async icon(source: ResolvedSource, packageId: string, version: string, signal?: AbortSignal): Promise<IconFetch> {
        const urls = this.urls(source, packageId, version);
        if (!urls) {
            return { kind: 'missing' };
        }
        const result = await this.transport.fetch({ url: urls.icon, headers: authHeaders(source), signal, maxBytes: this.maxIconBytes });
        if (!result.ok) {
            // The feed said there is none (404, 410) or that it is too big to use: definitive. Anything else (network,
            // timeout, cancellation, a server or rate-limit error) says nothing about the icon.
            if (result.code === 'too-large') {
                return { kind: 'missing', unusable: true };
            }
            const notFound = result.code === 'http-error' && (result.status === 404 || result.status === 410);
            return notFound ? { kind: 'missing' } : { kind: 'failed', reason: `${result.code}${result.status === undefined ? '' : ` ${result.status}`}: ${result.message}` };
        }
        const contentType = headerValue(result.headers, 'content-type') ?? '';
        if (result.body.length === 0 || result.body.length > this.maxIconBytes || !isAcceptableIconType(contentType)) {
            return { kind: 'missing', unusable: true };
        }
        return { kind: 'found', contentType, body: result.body };
    }

    private urls(source: ResolvedSource, packageId: string, version: string): FlatContainerUrls | undefined {
        const base = source.endpoints.packageBaseAddress;
        return base ? flatContainerUrls(base, packageId, version) : undefined;
    }
}
