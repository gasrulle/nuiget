/**
 * ADR-004 tier 3: whether a reference edit may run, and which projects a Central Package Management edit reaches.
 * The SDK checks (D13) and the provenance check of a CPM add (D7) are decided here and nowhere else. The mutator
 * reads the project files through the static inspection and never writes a file: the edit itself is the CLI's. An
 * override row is edited in place (probe row `add-override`, N74).
 */

import * as fs from 'fs';
import * as path from 'path';
import type { CpmImpactPreview, Logger, MutationDecision, MutationRequest, ProjectExecutionContext, ProjectInspector, ProjectMutator } from '../contracts';
import type { Project } from '../../protocol/domain';
import { redact } from '../logging';
import { normalizeProjectPath } from '../util/paths';
import { parseCentralPackageVersions } from './central';
import { SDK_TOO_OLD_MESSAGE } from './context';

export interface MutatorDeps {
    inspector: ProjectInspector;
    /** Whether the editor holds unsaved changes of `file` (the host's adapter over its open documents). */
    isDirty: (file: string) => boolean;
    /** Every project of the workspace, for the projects a central entry reaches. */
    discoverProjects: () => Promise<Project[]>;
    logger?: Logger;
}

export class DefaultProjectMutator implements ProjectMutator {
    constructor(private readonly deps: MutatorDeps) {}

    async canMutate(context: ProjectExecutionContext, request: MutationRequest): Promise<MutationDecision> {
        const { sdk, projectPath } = context;
        if (sdk === undefined) {
            return refuse('could not detect the .NET SDK for this project');
        }
        if (!sdk.supported) {
            return refuse(SDK_TOO_OLD_MESSAGE);
        }
        if (this.deps.isDirty(projectPath)) {
            return refuse(`${path.basename(projectPath)} has unsaved changes in the editor; save or close it first`);
        }
        const inspected = await this.deps.inspector.inspect(projectPath);
        if (inspected.unsupported) {
            return refuse(`the project could not be inspected: ${inspected.unsupported.message}`);
        }
        const isCpm = inspected.isCpm;
        if (request.kind === 'remove') {
            // A remove edits the project's own reference only (D7): whatever the provenance and the props file's state.
            return { ok: true, isCpm };
        }
        const wanted = request.packageId.toLowerCase();
        const rows = inspected.packages.filter(pkg => pkg.id.toLowerCase() === wanted);
        if (rows.some(row => row.declaration === 'unresolved')) {
            return refuse(`${request.packageId} could not be resolved in the project file; edit it by hand`);
        }
        // An add on a reference whose every row overrides rewrites the override and leaves the props file (probe row
        // `add-override`); an override in some target frameworks only is unprobed.
        const overrides = rows.filter(row => row.declaration === 'central-override');
        if (overrides.length > 0 && overrides.length < rows.length) {
            return refuse(`${request.packageId} overrides the central version in some target frameworks only; edit it by hand`);
        }
        if (!isCpm) {
            return { ok: true, isCpm: false };
        }
        if (sdk.cpmAwareAddProvenance !== 'verified' || !sdk.cpmAwareAdd) {
            return refuse(`Central Package Management edits are not verified for .NET SDK ${sdk.version}`);
        }
        if (request.version === undefined) {
            return refuse('a Central Package Management edit names the version it writes');
        }
        if (inspected.centralPropsPath === undefined) {
            return refuse('the project uses Central Package Management but its Directory.Packages.props was not found');
        }
        if (this.deps.isDirty(inspected.centralPropsPath)) {
            return refuse('Directory.Packages.props has unsaved changes in the editor; save or close it first');
        }
        return { ok: true, isCpm: true };
    }

    async previewCpmImpact(context: ProjectExecutionContext, packageId: string, toVersion: string): Promise<CpmImpactPreview | undefined> {
        const inspected = await this.deps.inspector.inspect(context.projectPath);
        const centralPropsPath = inspected.centralPropsPath;
        if (inspected.unsupported || !inspected.isCpm || centralPropsPath === undefined) {
            return undefined;
        }
        // The asking project overrides the central version: the edit reaches that project alone (N74).
        if (inspected.packages.some(pkg => pkg.id.toLowerCase() === packageId.toLowerCase() && pkg.declaration === 'central-override')) {
            return undefined;
        }
        const entry = parseCentralPackageVersions(await fs.promises.readFile(centralPropsPath, 'utf-8'), centralPropsPath).get(packageId.toLowerCase());
        if (entry === undefined) {
            return undefined;
        }
        const props = normalizeProjectPath(centralPropsPath);
        const wanted = packageId.toLowerCase();
        const projects = await this.deps.discoverProjects();
        const inspections = await Promise.all(projects.map(project => this.deps.inspector.inspect(project.path).catch((error: unknown) => {
            this.deps.logger?.warn(redact(`Central Package Management preview: ${project.path} could not be inspected: ${error instanceof Error ? error.message : String(error)}`));
            return undefined;
        })));
        const seen = new Set<string>();
        const affectedProjects: string[] = [];
        projects.forEach((project, index) => {
            const result = inspections[index];
            const key = normalizeProjectPath(project.path);
            if (result === undefined || result.unsupported || !result.isCpm || result.centralPropsPath === undefined || seen.has(key)) {
                return;
            }
            if (normalizeProjectPath(result.centralPropsPath) !== props) {
                return;
            }
            if (result.packages.some(pkg => pkg.id.toLowerCase() === wanted && pkg.declaration === 'central')) {
                seen.add(key);
                affectedProjects.push(project.path);
            }
        });
        return { centralPropsPath, packageId, fromVersion: entry.version, toVersion, affectedProjects };
    }
}

function refuse(error: string): MutationDecision {
    return { ok: false, error: redact(error) };
}
