/**
 * Package metadata from the NuGet global-packages folder, for when no source answers. The answer is marked `offline` and
 * never cached, so live metadata replaces it as soon as a source is reachable again.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Logger } from '../contracts';
import type { PackageMetadata } from '../../protocol/domain';
import { isValidPackageId, isValidVersion } from '../cli/validate';
import { normalize } from '../versioning';
import { MAX_NUSPEC_CHARS, nuspecToMetadata, parseNuspec } from './nuspec';
import { consoleFallbackLogger } from './wire';

export interface OfflineMetadataReaderOptions {
    /**
     * The global-packages folder (`DefaultDotnetRunner.globalPackagesFolder` in the composition root); `undefined` when
     * there is none. The `DotnetRunner` contract does not carry it, so it is injected.
     */
    globalPackagesFolder: () => Promise<string | undefined>;
    maxBytes?: number;
    logger?: Logger;
}

/**
 * The nuspec path of one package version in the global-packages folder (`<id>/<normalized version>/<id>.nuspec`, all
 * lower case), or `undefined` when the id or version is not one NuGet accepts or the path would leave the folder.
 */
export function offlineNuspecPath(folder: string, packageId: string, version: string): string | undefined {
    if (!isValidPackageId(packageId) || !isValidVersion(version)) {
        return undefined;
    }
    const normalized = normalize(version);
    if (normalized === undefined) {
        return undefined;
    }
    const id = packageId.toLowerCase();
    const root = path.resolve(folder);
    const nuspecPath = path.resolve(root, id, normalized.toLowerCase(), `${id}.nuspec`);
    const relative = path.relative(root, nuspecPath);
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative) && relative.split(path.sep).length === 3
        ? nuspecPath
        : undefined;
}

export class OfflineMetadataReader {
    private readonly globalPackagesFolder: () => Promise<string | undefined>;
    private readonly maxBytes: number;
    private readonly logger: Logger;

    constructor(options: OfflineMetadataReaderOptions) {
        this.globalPackagesFolder = options.globalPackagesFolder;
        this.maxBytes = options.maxBytes ?? MAX_NUSPEC_CHARS;
        this.logger = options.logger ?? consoleFallbackLogger;
    }

    /** Metadata of a package version restored on this machine, or `undefined` when it is not there or cannot be read. */
    async metadata(packageId: string, version: string): Promise<PackageMetadata | undefined> {
        let folder: string | undefined;
        try {
            folder = await this.globalPackagesFolder();
        } catch (error) {
            this.logger.debug(`[Offline] No global-packages folder: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
        if (!folder) {
            return undefined;
        }
        const nuspecPath = offlineNuspecPath(folder, packageId, version);
        if (!nuspecPath) {
            return undefined;
        }
        try {
            const stat = await fs.promises.stat(nuspecPath);
            if (!stat.isFile() || stat.size > this.maxBytes) {
                return undefined;
            }
            const nuspec = parseNuspec(await fs.promises.readFile(nuspecPath, 'utf8'));
            if (!nuspec) {
                this.logger.debug(`[Offline] ${nuspecPath} is not a readable nuspec`);
                return undefined;
            }
            return nuspecToMetadata(nuspec, { offline: true });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                this.logger.debug(`[Offline] Cannot read ${nuspecPath}: ${error instanceof Error ? error.message : String(error)}`);
            }
            return undefined;
        }
    }
}
