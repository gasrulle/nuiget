/**
 * README extraction for the package details panel. nuget.org publishes READMEs through the
 * service index's `ReadmeUriTemplate`; most private feeds do not, so the fallback downloads the
 * .nupkg and reads the README the nuspec points at (or a conventionally named file) out of the
 * archive. Published package versions are immutable, so extracted texts are cached without expiry.
 */

import AdmZip from 'adm-zip';
import * as fs from 'fs';
import { cacheKeys } from '../cache/CachePolicy';
import { LruMap } from '../cache/LruMap';
import type { Logger, Transport } from '../contracts';
import { normalize } from '../versioning';
import type { FlatContainerClient, ResolvedSource } from './types';
import { authHeaders, consoleFallbackLogger, redactUrl } from './wire';

export interface ReadmeExtractorOptions {
    /** READMEs kept in memory (never expire). */
    cacheCapacity?: number;
    /** Largest README or nuspec read from a template response or an archive entry. */
    maxEntryBytes?: number;
    /** Deadline for the `ReadmeUriTemplate` request. */
    timeoutMs?: number;
    logger?: Logger;
}

export const DEFAULT_README_CACHE_CAPACITY = 100;
/** A README is prose; anything larger is a mis-declared binary or an attempt to exhaust memory. */
export const MAX_README_BYTES = 2 * 1024 * 1024;
const DEFAULT_TEMPLATE_TIMEOUT_MS = 10_000;

/** Conventional README entry names (lower-cased) tried when the nuspec declares none. */
const CONVENTIONAL_README_NAMES = ['readme.md', 'docs/readme.md'];

/** Found: text to render. None: the source definitively has no README. Unavailable: could not tell (not cached). */
export type ReadmeOutcome = { kind: 'found'; text: string } | { kind: 'none' } | { kind: 'unavailable' };

/** Expand a service-index `ReadmeUriTemplate` (`{lower_id}`, `{lower_version}`, `{id}`, `{version}`). */
export function expandReadmeTemplate(template: string, packageId: string, version: string): string {
    const id = packageId.trim();
    const lowerVersion = (normalize(version) ?? version.trim()).toLowerCase();
    const values: Record<string, string> = {
        lower_id: id.toLowerCase(),
        lower_version: lowerVersion,
        id,
        version: version.trim(),
    };
    return template.replace(/\{(lower_id|lower_version|id|version)\}/gi, (_match, name: string) => encodeURIComponent(values[name.toLowerCase()]));
}

/** Reject archive paths that could escape the extraction root (zip-slip) or hide behind backslash tricks. */
export function isSafeArchivePath(entryName: string): boolean {
    return entryName.length > 0 && !entryName.includes('..') && !entryName.startsWith('/') && !entryName.includes('\\');
}

/**
 * README path declared by the nuspec `<readme>` element, normalized to forward slashes (the
 * nuspec reference's own example uses `docs\readme.md`) and rejected when it is not a safe path.
 */
export function declaredReadmePath(nuspecXml: string): string | undefined {
    const match = /<readme(?:\s[^>]*)?>([^<]+)<\/readme>/i.exec(nuspecXml);
    if (!match) {
        return undefined;
    }
    const candidate = match[1].trim().replace(/\\/g, '/');
    return isSafeArchivePath(candidate) ? candidate : undefined;
}

function decodeText(body: Buffer): string {
    return body.toString('utf8').replace(/^\uFEFF/, '');
}

export class ReadmeExtractor {
    private readonly cache: LruMap<string, string | null>;
    private readonly maxEntryBytes: number;
    private readonly timeoutMs: number;
    private readonly logger: Logger;

    constructor(
        private readonly transport: Transport,
        private readonly flat: FlatContainerClient,
        options: ReadmeExtractorOptions = {},
    ) {
        this.cache = new LruMap(options.cacheCapacity ?? DEFAULT_README_CACHE_CAPACITY);
        this.maxEntryBytes = options.maxEntryBytes ?? MAX_README_BYTES;
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TEMPLATE_TIMEOUT_MS;
        this.logger = options.logger ?? consoleFallbackLogger;
    }

    /** README text for a package version from the first of `sources` (already policy-filtered) that has one. */
    async extract(sources: ResolvedSource[], packageId: string, version: string, signal?: AbortSignal): Promise<string | undefined> {
        const pending: ResolvedSource[] = [];
        for (const source of sources) {
            const cached = this.cache.get(cacheKeys.readme(packageId, version, source.source.url));
            if (typeof cached === 'string') {
                return cached;
            }
            if (cached === undefined) {
                pending.push(source);
            }
        }

        for (const source of pending) {
            if (signal?.aborted) {
                return undefined;
            }
            const outcome = await this.fromSource(source, packageId, version, signal);
            const key = cacheKeys.readme(packageId, version, source.source.url);
            if (outcome.kind === 'found') {
                this.cache.set(key, outcome.text);
                return outcome.text;
            }
            if (outcome.kind === 'none') {
                this.cache.set(key, null);
            }
        }
        return undefined;
    }

    clear(): void {
        this.cache.clear();
    }

    private async fromSource(source: ResolvedSource, packageId: string, version: string, signal?: AbortSignal): Promise<ReadmeOutcome> {
        const template = source.endpoints.readmeUriTemplate;
        if (template) {
            const viaTemplate = await this.fromTemplate(template, source, packageId, version, signal);
            if (viaTemplate.kind !== 'unavailable') {
                return viaTemplate;
            }
        }
        return this.fromArchive(source, packageId, version, signal);
    }

    private async fromTemplate(template: string, source: ResolvedSource, packageId: string, version: string, signal?: AbortSignal): Promise<ReadmeOutcome> {
        const url = expandReadmeTemplate(template, packageId, version);
        const result = await this.transport.fetch({
            url,
            headers: authHeaders(source),
            signal,
            timeoutMs: this.timeoutMs,
            maxBytes: this.maxEntryBytes,
        });
        if (result.ok) {
            if (result.status === 404) {
                return { kind: 'none' };
            }
            if (result.status >= 200 && result.status < 300) {
                const text = decodeText(result.body);
                return text.trim().length > 0 ? { kind: 'found', text } : { kind: 'none' };
            }
            return { kind: 'unavailable' };
        }
        if ((result.code === 'http-error' && result.status === 404) || result.code === 'too-large') {
            return { kind: 'none' };
        }
        this.logger.debug(`[readme] template fetch failed for ${redactUrl(url)}: ${result.code}`);
        return { kind: 'unavailable' };
    }

    private async fromArchive(source: ResolvedSource, packageId: string, version: string, signal?: AbortSignal): Promise<ReadmeOutcome> {
        let tempFile: string | undefined;
        try {
            tempFile = await this.flat.downloadPackage(source, packageId, version, signal);
        } catch (error) {
            this.logger.debug(`[readme] package download failed for ${packageId}@${version} from ${redactUrl(source.source.url)}: ${String(error)}`);
            return { kind: 'unavailable' };
        }
        if (!tempFile) {
            return { kind: 'unavailable' };
        }
        try {
            const archive = new AdmZip(await fs.promises.readFile(tempFile));
            return readReadmeFromArchive(archive, this.maxEntryBytes);
        } catch (error) {
            this.logger.debug(`[readme] cannot read ${packageId}@${version} archive: ${String(error)}`);
            return { kind: 'unavailable' };
        } finally {
            await fs.promises.unlink(tempFile).catch(() => undefined);
        }
    }
}

/** Locate and decode the README inside a .nupkg: the nuspec-declared path first, then conventional names. */
export function readReadmeFromArchive(archive: AdmZip, maxEntryBytes: number = MAX_README_BYTES): ReadmeOutcome {
    const entries = archive.getEntries().filter(entry => !entry.isDirectory && isSafeArchivePath(entry.entryName));
    const candidates = [...CONVENTIONAL_README_NAMES];

    const nuspec = entries.find(entry => entry.entryName.toLowerCase().endsWith('.nuspec') && !entry.entryName.includes('/'))
        ?? entries.find(entry => entry.entryName.toLowerCase().endsWith('.nuspec'));
    if (nuspec && nuspec.header.size <= maxEntryBytes) {
        const declared = declaredReadmePath(decodeText(nuspec.getData()));
        if (declared) {
            candidates.unshift(declared.toLowerCase());
        }
    }

    for (const candidate of candidates) {
        const entry = entries.find(item => {
            const name = item.entryName.toLowerCase();
            return name === candidate || name.endsWith(`/${candidate}`);
        });
        if (!entry || entry.header.size > maxEntryBytes) {
            continue;
        }
        const text = decodeText(entry.getData());
        if (text.trim().length > 0) {
            return { kind: 'found', text };
        }
    }
    return { kind: 'none' };
}
