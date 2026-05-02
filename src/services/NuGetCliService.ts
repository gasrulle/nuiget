import * as path from 'path';
import * as vscode from 'vscode';
import { NuGetLogger } from './NuGetLogger';
import { isPerfEnabled, startTimer } from './NuGetPerf';
import { execWithTimeout, isExecError, isValidPackageId, isValidSourceUrl, isValidVersion } from './NuGetUtils';

/**
 * Handles all dotnet CLI operations: install, update, remove, restore,
 * SDK version detection, and NuGet HTTP cache management.
 */
/**
 * Plan 11: cap on the persisted SDK-version map. Each entry is a directory →
 * SDK-major number, ~50–100 bytes after JSON encoding. 256 entries (~25 KB)
 * is plenty for any realistic monorepo while bounding `globalState` growth
 * across long-lived installs that touch many transient project paths.
 */
const SDK_VERSION_CACHE_MAX = 256;

export class NuGetCliService {
    private _sdkVersionCache: Map<string, number> = new Map();
    private _persistStore?: vscode.Memento;
    private _persistKey?: string;
    private _persistVersion?: string;
    /**
     * Plan 11: serialize all `globalState.update()` writes for the SDK cache so
     * concurrent `set()` and `clearSdkVersionCache()` calls cannot race and
     * resurrect a cleared snapshot. Each operation chains onto this promise; we
     * always recompute the snapshot at write time so the latest in-memory state
     * is what gets persisted.
     */
    private _persistChain: Promise<void> = Promise.resolve();
    /**
     * Plan 11 (post-rubber-duck fix): epoch counter incremented by
     * `clearSdkVersionCache()`. In-flight `getSdkMajorVersion()` calls capture
     * the epoch before probing and skip writing back if the epoch changed mid
     * probe. Without this, a slow `dotnet --version` that resolves AFTER a
     * clear would resurrect stale data and re-persist it.
     */
    private _cacheEpoch = 0;

    constructor(private readonly logger: NuGetLogger) { }

    // ── SDK Detection ──────────────────────────────────────────────────

    /**
     * Plan 11: hydrate the in-memory SDK cache from a persisted snapshot and
     * attach the Memento so subsequent writes persist automatically. The
     * snapshot is keyed by `extensionVersion` so that an extension upgrade
     * automatically discards any stale entries (e.g. when a new SDK ships
     * alongside the update). Caller invokes once at activation.
     */
    hydrateSdkVersionCache(store: vscode.Memento, key: string, extensionVersion: string): void {
        this._persistStore = store;
        this._persistKey = key;
        try {
            const raw = store.get<{ v: string; entries: Record<string, number> }>(key);
            if (raw && raw.v === extensionVersion && raw.entries && typeof raw.entries === 'object') {
                // Hydrate up to MAX entries. If the persisted snapshot exceeds the
                // cap (e.g. carry-over from an older build that had no cap), keep
                // the first N — entry order in JSON.parse follows insertion order
                // which mirrors LRU recency from the previous session.
                let count = 0;
                for (const [dir, major] of Object.entries(raw.entries)) {
                    if (count >= SDK_VERSION_CACHE_MAX) { break; }
                    if (typeof major === 'number' && Number.isFinite(major)) {
                        this._sdkVersionCache.set(dir, major);
                        count++;
                    }
                }
            } else if (raw) {
                // Stale snapshot from a different extension version — drop it.
                this._persistChain = this._persistChain
                    .then(() => store.update(key, undefined))
                    .catch(() => { /* best-effort */ });
            }
        } catch {
            // Best-effort hydration; ignore corrupt state.
        }
        // Stamp current version so future writes persist under the new key.
        this._persistVersion = extensionVersion;
    }

    /**
     * Plan 11: enforce LRU cap on the in-memory SDK cache. Map iteration order
     * is insertion order, so the first key is the oldest. We delete-and-reinsert
     * on hits elsewhere if we ever need true LRU; current callers only hit
     * `set()` once per directory per session, so insertion order is good enough.
     */
    private trimSdkCache(): void {
        while (this._sdkVersionCache.size > SDK_VERSION_CACHE_MAX) {
            const oldest = this._sdkVersionCache.keys().next().value;
            if (oldest === undefined) { break; }
            this._sdkVersionCache.delete(oldest);
        }
    }

    private persistSdkCache(): void {
        if (!this._persistStore || !this._persistKey || !this._persistVersion) { return; }
        const store = this._persistStore;
        const key = this._persistKey;
        const version = this._persistVersion;
        // Snapshot synchronously so each chained write reflects the cache at the
        // time of scheduling, not the (possibly mutated) cache when the chain
        // drains. This keeps sequential writes deterministic.
        const entries: Record<string, number> = {};
        for (const [dir, major] of this._sdkVersionCache) { entries[dir] = major; }
        const snapshot = { v: version, entries };
        this._persistChain = this._persistChain
            .then(() => store.update(key, snapshot))
            .catch(() => { /* best-effort persistence */ });
    }

    /**
     * Detect the .NET SDK major version for a given project path.
     * Runs `dotnet --version` with cwd set to the project's directory so that
     * directory-local global.json files are respected. Result is cached per directory.
     * Falls back to 9 on any error (old syntax works as aliases on SDK 10+).
     */
    async getSdkMajorVersion(projectPath: string): Promise<number> {
        const projectDir = path.dirname(projectPath);
        const cached = this._sdkVersionCache.get(projectDir);
        if (cached !== undefined) { return cached; }

        // Capture the epoch before the async probe so a concurrent
        // clearSdkVersionCache() can invalidate this in-flight result.
        const startedEpoch = this._cacheEpoch;

        // Cold-path SDK probe: measured separately to validate Plan 02's prewarm gate.
        const t = isPerfEnabled() ? startTimer('sdkProbe', projectPath) : undefined;
        try {
            const { stdout } = await execWithTimeout('dotnet --version', { timeout: 10000, cwd: projectDir });
            const versionStr = stdout.trim();
            const major = parseInt(versionStr.split('.')[0], 10);
            const result = isNaN(major) ? 9 : major;
            if (this._cacheEpoch === startedEpoch) {
                this._sdkVersionCache.set(projectDir, result);
                this.trimSdkCache();
                this.persistSdkCache();
            }
            t?.end({ major: result });
            return result;
        } catch {
            if (this._cacheEpoch === startedEpoch) {
                this._sdkVersionCache.set(projectDir, 9);
                this.trimSdkCache();
                // B3: don't persist failed probes (see clearSdkVersionCache notes).
            }
            t?.end({ major: 9, error: 1 });
            return 9;
        }
    }

    /**
     * Check if the SDK for a project uses noun-first CLI syntax (SDK >= 10).
     */
    async useNounFirstSyntax(projectPath: string): Promise<boolean> {
        return (await this.getSdkMajorVersion(projectPath)) >= 10;
    }

    /** Clear the cached SDK version detection (e.g. after global.json changes). */
    clearSdkVersionCache(): void {
        this._sdkVersionCache.clear();
        // Bump epoch so any in-flight probe started before this clear discards
        // its result instead of resurrecting stale data after a flush.
        this._cacheEpoch++;
        if (this._persistStore && this._persistKey) {
            const store = this._persistStore;
            const key = this._persistKey;
            // Chain through the same queue as persistSdkCache() so a clear
            // cannot race with an in-flight write and resurrect old entries.
            this._persistChain = this._persistChain
                .then(() => store.update(key, undefined))
                .catch(() => { /* best-effort */ });
        }
    }

    /** Test/diagnostic helper: await all pending persistence writes. */
    async flushPersistedSdkCache(): Promise<void> {
        await this._persistChain;
    }

    // ── Package Operations ─────────────────────────────────────────────

    private getNoRestoreFlag(): string {
        const config = vscode.workspace.getConfiguration('nuiget');
        return config.get<boolean>('noRestore', false) ? '--no-restore' : '';
    }

    async installPackage(projectPath: string, packageId: string, version?: string, options?: { skipChannelSetup?: boolean; skipRestore?: boolean; sourceUrl?: string }): Promise<boolean> {
        if (!isValidPackageId(packageId)) {
            vscode.window.showErrorMessage(`Invalid package ID: ${packageId}`);
            return false;
        }
        if (version && !isValidVersion(version)) {
            vscode.window.showErrorMessage(`Invalid version: ${version}`);
            return false;
        }

        this.logger.setupOutputChannel(options?.skipChannelSetup);

        try {
            const versionArg = version ? `--version ${version}` : '';
            const noRestoreArg = options?.skipRestore ? '--no-restore' : this.getNoRestoreFlag();
            const sourceArg = options?.sourceUrl && isValidSourceUrl(options.sourceUrl) ? `--source "${options.sourceUrl}"` : '';
            const projectDir = path.dirname(projectPath);
            const nounFirst = await this.useNounFirstSyntax(projectPath);
            const command = nounFirst
                ? `dotnet package add ${packageId} --project "${projectPath}" ${versionArg} ${sourceArg} ${noRestoreArg}`.trim()
                : `dotnet add "${projectPath}" package ${packageId} ${versionArg} ${sourceArg} ${noRestoreArg}`.trim();
            const { stdout, stderr } = await execWithTimeout(command, { cwd: projectDir });

            const hasError = stderr && /\berror\b/i.test(stderr);
            if (hasError) {
                this.logger.logOutput(command, stdout, stderr, false);
                this.logger.logError(`Failed to install ${packageId}`);
                vscode.window.showErrorMessage(`Failed to install ${packageId}: ${stderr}`);
                return false;
            }

            this.logger.logOutput(command, stdout, stderr, true);
            this.logger.logSuccess(`Successfully installed ${packageId}`);
            vscode.window.showInformationMessage(`Successfully installed ${packageId}`);
            return true;
        } catch (error) {
            const nounFirst = this._sdkVersionCache.get(path.dirname(projectPath)) ?? 9;
            const command = nounFirst >= 10
                ? `dotnet package add ${packageId} --project "${projectPath}" ${version ? `--version ${version}` : ''}`.trim()
                : `dotnet add "${projectPath}" package ${packageId} ${version ? `--version ${version}` : ''}`.trim();
            const errorOutput = isExecError(error) ? (error.stderr || error.stdout || String(error)) : String(error);
            this.logger.logOutput(command, isExecError(error) ? (error.stdout || '') : '', errorOutput, false);
            this.logger.logError(`Failed to install ${packageId}`);
            vscode.window.showErrorMessage(`Failed to install ${packageId}: ${errorOutput}`);
            return false;
        }
    }

    async updatePackage(projectPath: string, packageId: string, version: string, options?: { skipChannelSetup?: boolean; skipNotification?: boolean; skipRestore?: boolean; sourceUrl?: string }): Promise<boolean> {
        if (!isValidPackageId(packageId)) {
            vscode.window.showErrorMessage(`Invalid package ID: ${packageId}`);
            return false;
        }
        if (!isValidVersion(version)) {
            vscode.window.showErrorMessage(`Invalid version: ${version}`);
            return false;
        }

        this.logger.setupOutputChannel(options?.skipChannelSetup);

        try {
            const noRestoreArg = options?.skipRestore ? '--no-restore' : this.getNoRestoreFlag();
            const sourceArg = options?.sourceUrl && isValidSourceUrl(options.sourceUrl) ? `--source "${options.sourceUrl}"` : '';
            const projectDir = path.dirname(projectPath);
            const nounFirst = await this.useNounFirstSyntax(projectPath);
            const command = nounFirst
                ? `dotnet package add ${packageId} --project "${projectPath}" --version ${version} ${sourceArg} ${noRestoreArg}`.trim()
                : `dotnet add "${projectPath}" package ${packageId} --version ${version} ${sourceArg} ${noRestoreArg}`.trim();
            const { stdout, stderr } = await execWithTimeout(command, { cwd: projectDir });

            const hasError = stderr && /\berror\b/i.test(stderr);
            if (hasError) {
                this.logger.logOutput(command, stdout, stderr, false);
                this.logger.logError(`Failed to update ${packageId}`);
                if (!options?.skipNotification) {
                    vscode.window.showErrorMessage(`Failed to update ${packageId}: ${stderr}`);
                }
                return false;
            }

            this.logger.logOutput(command, stdout, stderr, true);
            this.logger.logSuccess(`Successfully updated ${packageId}`);
            if (!options?.skipNotification) {
                vscode.window.showInformationMessage(`Successfully updated ${packageId}`);
            }
            return true;
        } catch (error) {
            const nounFirst = this._sdkVersionCache.get(path.dirname(projectPath)) ?? 9;
            const command = nounFirst >= 10
                ? `dotnet package add ${packageId} --project "${projectPath}" --version ${version}`
                : `dotnet add "${projectPath}" package ${packageId} --version ${version}`;
            const errorOutput = isExecError(error) ? (error.stderr || error.stdout || String(error)) : String(error);
            this.logger.logOutput(command, isExecError(error) ? (error.stdout || '') : '', errorOutput, false);
            this.logger.logError(`Failed to update ${packageId}`);
            if (!options?.skipNotification) {
                vscode.window.showErrorMessage(`Failed to update ${packageId}: ${errorOutput}`);
            }
            return false;
        }
    }

    async removePackage(projectPath: string, packageId: string, options?: { skipChannelSetup?: boolean; skipRestore?: boolean; skipNotification?: boolean }): Promise<boolean> {
        if (!isValidPackageId(packageId)) {
            vscode.window.showErrorMessage(`Invalid package ID: ${packageId}`);
            return false;
        }

        this.logger.setupOutputChannel(options?.skipChannelSetup);

        try {
            const projectDir = path.dirname(projectPath);
            const nounFirst = await this.useNounFirstSyntax(projectPath);
            const command = nounFirst
                ? `dotnet package remove ${packageId} --project "${projectPath}"`
                : `dotnet remove "${projectPath}" package ${packageId}`;
            const { stdout, stderr } = await execWithTimeout(command, { cwd: projectDir });

            const hasError = stderr && /\berror\b/i.test(stderr);
            if (hasError) {
                this.logger.logOutput(command, stdout, stderr, false);
                this.logger.logError(`Failed to remove ${packageId}`);
                vscode.window.showErrorMessage(`Failed to remove ${packageId}: ${stderr}`);
                return false;
            }

            this.logger.logOutput(command, stdout, stderr, true);
            this.logger.logSuccess(`Successfully removed ${packageId}`);

            // Run silent restore to update project.assets.json (dotnet remove doesn't trigger restore)
            // Skip for bulk operations (caller will run restore once at the end) or if noRestore setting is enabled
            const noRestoreSetting = this.getNoRestoreFlag() !== '';
            if (!options?.skipRestore && !noRestoreSetting) {
                try {
                    const restoreCommand = `dotnet restore "${projectPath}"`;
                    const { stdout: restoreOut, stderr: restoreErr } = await execWithTimeout(restoreCommand, { cwd: projectDir, timeout: 60000 });
                    this.logger.logOutput(restoreCommand, restoreOut, restoreErr, true);
                } catch (restoreError) {
                    this.logger.logOutput(`dotnet restore "${projectPath}"`, isExecError(restoreError) ? (restoreError.stdout || '') : '', isExecError(restoreError) ? (restoreError.stderr || '') : '', false);
                }
            }

            if (!options?.skipNotification) {
                vscode.window.showInformationMessage(`Successfully removed ${packageId}`);
            }
            return true;
        } catch (error) {
            const nounFirst = this._sdkVersionCache.get(path.dirname(projectPath)) ?? 9;
            const command = nounFirst >= 10
                ? `dotnet package remove ${packageId} --project "${projectPath}"`
                : `dotnet remove "${projectPath}" package ${packageId}`;
            const errorOutput = isExecError(error) ? (error.stderr || error.stdout || String(error)) : String(error);
            this.logger.logOutput(command, isExecError(error) ? (error.stdout || '') : '', errorOutput, false);
            this.logger.logError(`Failed to remove ${packageId}`);
            vscode.window.showErrorMessage(`Failed to remove ${packageId}: ${errorOutput}`);
            return false;
        }
    }

    // ── Restore & Cache ────────────────────────────────────────────────

    async restoreProject(projectPath: string): Promise<boolean> {
        this.logger.setupOutputChannel(true);
        const command = `dotnet restore "${projectPath}"`;

        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const { stdout, stderr } = await execWithTimeout(command, { timeout: 120000, cwd: workspaceFolder });
            this.logger.logOutput(command, stdout, stderr, true);
            this.logger.logSuccess('Project restored successfully');
            return true;
        } catch (error) {
            const errorOutput = isExecError(error) ? (error.stderr || error.stdout || String(error)) : String(error);
            this.logger.logOutput(command, isExecError(error) ? (error.stdout || '') : '', isExecError(error) ? (error.stderr || '') : '', false);
            this.logger.logError(`Failed to restore project: ${errorOutput}`);
            vscode.window.showErrorMessage(`Failed to restore project: ${errorOutput}`);
            return false;
        }
    }

    /**
     * Clear the dotnet NuGet HTTP cache.
     * Runs `dotnet nuget locals http-cache --clear` silently.
     */
    async clearNuGetHttpCache(): Promise<void> {
        try {
            await execWithTimeout('dotnet nuget locals http-cache --clear', { timeout: 15000 });
            this.logger.logSuccess('Cleared dotnet NuGet HTTP cache');
        } catch (err) {
            this.logger.logWarning(`Failed to clear dotnet NuGet HTTP cache: ${String(err)}`);
        }
    }
}
