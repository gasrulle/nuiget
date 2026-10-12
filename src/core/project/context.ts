import * as path from 'path';
import type { DotnetRunner, Logger, ProjectExecutionContext, SdkInfo, SourceProvider } from '../contracts';
import { redact } from '../logging';
import { computeRevision, revisionInputs } from './revision';

export interface ProjectContextDeps {
    runner: DotnetRunner;
    sources: SourceProvider;
    /** Directories at which the walk up to the props and targets files stops (the workspace folders). */
    stopDirs?: readonly string[];
    logger?: Logger;
}

export interface ProjectContextResult {
    context: ProjectExecutionContext;
    /** Set when the SDK that the project resolves is below 10: the project is read-only (D13). */
    unsupported?: { reason: 'sdk-too-old'; message: string };
}

export const SDK_TOO_OLD_MESSAGE = 'requires .NET SDK 10 or newer';

const CONFIG_PATHS_ARGS: readonly string[] = ['nuget', 'config', 'paths'];
const CONFIG_PATHS_TIMEOUT_MS = 15_000;

/**
 * Builds the `ProjectExecutionContext` of a project (ADR-005): the SDK that applies in its
 * directory, its `nuget.config` chain, the sources enabled for it, and a revision of its input files.
 */
export class ProjectContextProvider {
    constructor(private readonly deps: ProjectContextDeps) {}

    /**
     * An SDK that cannot be detected and a config chain that cannot be listed leave `sdk` and
     * `configFiles` empty; neither makes the project unsupported. A failure of the source provider
     * rejects: an empty source list would read as "no sources", which is a different fact.
     */
    async get(projectPath: string, workspaceFolder?: string): Promise<ProjectContextResult> {
        const projectDir = path.dirname(projectPath);
        const [sdk, configFiles, sources] = await Promise.all([
            this.sdk(projectDir),
            this.configFiles(projectDir),
            this.deps.sources.listSources(projectDir),
        ]);
        const context: ProjectExecutionContext = {
            projectPath,
            projectDir,
            configFiles,
            sourceUrls: sources.filter(source => source.enabled).map(source => source.url),
            revision: await computeRevision(await revisionInputs(projectPath, configFiles, this.deps.stopDirs)),
        };
        if (workspaceFolder !== undefined) {
            context.workspaceFolder = workspaceFolder;
        }
        if (sdk !== undefined) {
            context.sdk = sdk;
        }
        return sdk !== undefined && !sdk.supported
            ? { context, unsupported: { reason: 'sdk-too-old', message: SDK_TOO_OLD_MESSAGE } }
            : { context };
    }

    private async sdk(projectDir: string): Promise<SdkInfo | undefined> {
        try {
            return await this.deps.runner.sdkVersion(projectDir);
        } catch (error) {
            this.deps.logger?.warn(redact(`SDK detection failed for ${projectDir}: ${describe(error)}`));
            return undefined;
        }
    }

    /** `dotnet nuget config paths` prints the effective config files, one per line, nearest first. */
    private async configFiles(projectDir: string): Promise<string[]> {
        try {
            const result = await this.deps.runner.run([...CONFIG_PATHS_ARGS], { cwd: projectDir, timeoutMs: CONFIG_PATHS_TIMEOUT_MS });
            if (result.exitCode !== 0 || result.cancelled || result.timedOut) {
                this.deps.logger?.warn(redact(`dotnet nuget config paths failed for ${projectDir} (exit code ${result.exitCode})`));
                return [];
            }
            return result.stdout.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
        } catch (error) {
            this.deps.logger?.warn(redact(`dotnet nuget config paths could not be started for ${projectDir}: ${describe(error)}`));
            return [];
        }
    }
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
