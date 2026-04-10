import * as path from 'path';
import * as vscode from 'vscode';
import { NuGetLogger } from './NuGetLogger';
import { execWithTimeout, isExecError, isValidPackageId, isValidSourceUrl, isValidVersion } from './NuGetUtils';

/**
 * Handles all dotnet CLI operations: install, update, remove, restore,
 * SDK version detection, and NuGet HTTP cache management.
 */
export class NuGetCliService {
    private _sdkVersionCache: Map<string, number> = new Map();

    constructor(private readonly logger: NuGetLogger) { }

    // ── SDK Detection ──────────────────────────────────────────────────

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

        try {
            const { stdout } = await execWithTimeout('dotnet --version', { timeout: 10000, cwd: projectDir });
            const versionStr = stdout.trim();
            const major = parseInt(versionStr.split('.')[0], 10);
            const result = isNaN(major) ? 9 : major;
            this._sdkVersionCache.set(projectDir, result);
            return result;
        } catch {
            this._sdkVersionCache.set(projectDir, 9);
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
