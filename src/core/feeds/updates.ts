/**
 * Update check for installed packages. A reference is a candidate only when its specification allows a newer version
 * (`isUpdateCandidate`: never an exact pin, a floating or range spec only with a resolved version). Every source the
 * policy allows for the id is asked for its listed versions and all answers are awaited, so the newest version across
 * them wins and a source that could not answer is reported (`sourcesUnavailable`) instead of read as "no update". Rows are
 * bare; icons, authors and verification come from the enricher.
 */

import type { Logger } from '../contracts';
import type { InstalledPackage, PackageUpdate } from '../../protocol/domain';
import { redact } from '../logging';
import { compareText, effectiveInstalledVersion, isNewer, isUpdateCandidate, parseVersionSpec } from '../versioning';
import { filterAllowedSources, type FeedsDeps, type RegistrationClient, type ResolvedSource, type UpdateChecker } from './types';
import { consoleFallbackLogger, mapWithConcurrency } from './wire';

export const UPDATE_CHECK_CONCURRENCY = 16;

export interface UpdateCheckerOptions {
    concurrency?: number;
}

interface PackageCheck {
    update?: PackageUpdate;
    unavailable: boolean;
}

export class DefaultUpdateChecker implements UpdateChecker {
    private readonly deps: Pick<FeedsDeps, 'policy'>;
    private readonly logger: Logger;
    private readonly concurrency: number;

    constructor(deps: Pick<FeedsDeps, 'policy' | 'logger'>, private readonly registration: RegistrationClient, options: UpdateCheckerOptions = {}) {
        this.deps = deps;
        this.logger = deps.logger ?? consoleFallbackLogger;
        this.concurrency = options.concurrency ?? UPDATE_CHECK_CONCURRENCY;
    }

    async check(
        sources: ResolvedSource[],
        installed: InstalledPackage[],
        includePrerelease: boolean,
        onFound?: (update: PackageUpdate) => void,
        signal?: AbortSignal,
    ): Promise<{ updates: PackageUpdate[]; sourcesUnavailable: boolean }> {
        const checks = await mapWithConcurrency(installed, this.concurrency, async (pkg): Promise<PackageCheck> => {
            try {
                return await this.checkPackage(sources, pkg, includePrerelease, onFound, signal);
            } catch (error) {
                this.logger.warn(`[Updates] Checking ${pkg.id} failed: ${redact(error instanceof Error ? error.message : String(error))}`);
                return { unavailable: true };
            }
        });
        const updates = checks.flatMap(check => (check.update ? [check.update] : []));
        return { updates, sourcesUnavailable: checks.some(check => check.unavailable) || signal?.aborted === true };
    }

    private async checkPackage(
        sources: ResolvedSource[],
        pkg: InstalledPackage,
        includePrerelease: boolean,
        onFound: ((update: PackageUpdate) => void) | undefined,
        signal: AbortSignal | undefined,
    ): Promise<PackageCheck> {
        if (pkg.declaration === 'unresolved' || signal?.aborted) {
            return { unavailable: false };
        }
        const spec = parseVersionSpec(pkg.version);
        if (!isUpdateCandidate(spec, pkg.resolvedVersion)) {
            return { unavailable: false };
        }
        const installedVersion = effectiveInstalledVersion(spec, pkg.resolvedVersion);
        const allowed = filterAllowedSources(this.deps.policy, pkg.id, sources);
        if (installedVersion === undefined || allowed.length === 0) {
            return { unavailable: false };
        }

        const answers = await Promise.all(allowed.map(source =>
            this.registration.versions(source, pkg.id, { includePrerelease, listedOnly: true, signal })));
        let newest: { version: string; source: ResolvedSource } | undefined;
        answers.forEach((versions, index) => {
            const top = versions?.[0];
            if (top !== undefined && (newest === undefined || compareText(top, newest.version) === 1)) {
                newest = { version: top, source: allowed[index] };
            }
        });
        const unavailable = answers.some(versions => versions === undefined);
        if (newest === undefined || !isNewer(newest.version, installedVersion)) {
            return { unavailable };
        }
        const update: PackageUpdate = { id: pkg.id, installedVersion, latestVersion: newest.version, sourceUrl: newest.source.source.url };
        onFound?.(update);
        return { update, unavailable };
    }
}
