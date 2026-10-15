/**
 * Static project inspection (ADR-004 tier 1): what a project references, read from the project
 * file, the nearest `Directory.Build.props` and the nearest `Directory.Packages.props` without
 * evaluating MSBuild. Everything that would need evaluation — a property in a version, a condition
 * other than a plain target-framework test — is reported as `unresolved` rather than guessed.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ProjectInspector } from '../contracts';
import type { InstalledPackage, InstalledResult, UnsupportedProjectReason } from '../../protocol/domain';
import { fileExists } from '../util/fs';
import type { AssetsReader } from './assets';
import { BUILD_PROPS_FILE, findCentralPropsPath, findNearestFile, parseBooleanProperty, parseCentralPackageVersions, type CentralPackageVersion } from './central';
import { classifyProject } from './discovery';
import { resolvedRow, unresolvedRow } from './rows';
import { attr, childText, elements, lastPropertyValue, parseMsBuildXml, rootProject, type XmlObject } from './xml';

export interface InspectorOptions {
    assets: AssetsReader;
    /** Directories at which the walk up to `Directory.Build.props` and `Directory.Packages.props` stops (the workspace folders). */
    stopDirs?: readonly string[];
}

/** Shown with an unsupported project. No path and no parser text: `projectPath` already names the file. */
export const UNSUPPORTED_MESSAGES: Record<Exclude<UnsupportedProjectReason, 'sdk-too-old'>, string> = {
    'packages-config': 'packages.config projects are not supported',
    'non-sdk-style': 'only SDK-style projects are supported',
    'parse-failed': 'the project file or an imported props file could not be read or parsed',
    'not-found': 'the project file was not found',
};

type SourceFile = 'props' | 'project';

/** One `PackageReference` while the files are being read. */
interface Reference {
    id: string;
    /** The file that declares the item. */
    file: SourceFile;
    version?: string;
    /** The file of the last write to `version`. */
    versionFile: SourceFile;
    versionOverride?: string;
    isImplicit: boolean;
    /** Target frameworks the item is limited to; `undefined` means all. */
    frameworks?: string[];
    /** A condition that tier 1 cannot decide applies to the item or to an update of it. */
    uncertain: boolean;
}

interface ItemCondition {
    frameworks?: string[];
    /** A condition other than `'$(TargetFramework)' == 'x'`. */
    unknown: boolean;
    /** Two framework conditions that exclude each other. */
    never: boolean;
}

const TFM_CONDITION = /^\s*'\$\(TargetFramework\)'\s*==\s*'([^']+)'\s*$/;
// Globs and MSBuild expressions are not a package id.
const UNRESOLVABLE_INCLUDE = /[*?]|\$\(|@\(|%\(/;
const PROPERTY_REFERENCE = '$(';

export class StaticProjectInspector implements ProjectInspector {
    private readonly assets: AssetsReader;
    private readonly stopDirs: readonly string[] | undefined;

    constructor(options: InspectorOptions) {
        this.assets = options.assets;
        this.stopDirs = options.stopDirs;
    }

    /** Never rejects: what cannot be read is reported as `unsupported`. */
    async inspect(projectPath: string): Promise<InstalledResult> {
        try {
            return await this.inspectProject(projectPath);
        } catch {
            return unsupported(projectPath, 'parse-failed');
        }
    }

    private async inspectProject(projectPath: string): Promise<InstalledResult> {
        let text: string;
        try {
            text = await fs.promises.readFile(projectPath, 'utf-8');
        } catch (error) {
            const code = (error as NodeJS.ErrnoException | undefined)?.code;
            return unsupported(projectPath, code === 'ENOENT' || code === 'ENOTDIR' ? 'not-found' : 'parse-failed');
        }

        const projectDir = path.dirname(projectPath);
        const kind = classifyProject(projectPath, text, await fileExists(path.join(projectDir, 'packages.config')));
        if (kind === 'packages-config') {
            return unsupported(projectPath, 'packages-config');
        }
        if (kind !== 'sdk-style') {
            return unsupported(projectPath, 'non-sdk-style');
        }

        // A malformed automatic import fails MSBuild's evaluation too; reporting the project without it
        // could show a Central Package Management project as an ordinary one (D7).
        const buildPropsPath = await findNearestFile(projectDir, BUILD_PROPS_FILE, this.stopDirs);
        const centralPropsFile = await findCentralPropsPath(projectDir, this.stopDirs);
        const project = rootProject(parseMsBuildXml(text, projectPath));
        const buildProps = buildPropsPath === undefined ? undefined : rootProject(parseMsBuildXml(await fs.promises.readFile(buildPropsPath, 'utf-8'), buildPropsPath));
        const centralProps = centralPropsFile === undefined ? undefined : rootProject(parseMsBuildXml(await fs.promises.readFile(centralPropsFile, 'utf-8'), centralPropsFile));

        // MSBuild imports Directory.Build.props, then Directory.Packages.props, then reads the project body.
        const property = (name: string): string | undefined => {
            let value: string | undefined;
            for (const document of [buildProps, centralProps, project]) {
                value = (document === undefined ? undefined : lastPropertyValue(document, name)) ?? value;
            }
            return value;
        };
        const isCpm = centralPropsFile !== undefined && parseBooleanProperty(property('ManagePackageVersionsCentrally')) === true;
        const centralPropsPath = isCpm ? centralPropsFile : undefined;
        const overridesEnabled = parseBooleanProperty(property('CentralPackageVersionOverrideEnabled')) !== false;
        const central = centralPropsPath !== undefined && centralProps !== undefined
            ? parseCentralPackageVersions({ Project: centralProps }, centralPropsPath)
            : new Map<string, CentralPackageVersion>();

        const declared = declaredFrameworks(project) ?? declaredFrameworks(buildProps);
        const references: Reference[] = [];
        collect(buildProps, 'props', references, declared);
        collect(project, 'project', references, declared);

        const packages: InstalledPackage[] = [];
        const byKey = new Map<string, { pkg: InstalledPackage; frameworks: string[] | undefined }>();
        for (const reference of references) {
            const pkg = describe(reference, { isCpm, overridesEnabled, central, buildPropsPath, centralPropsPath });
            const key = `${pkg.id.toLowerCase()}|${pkg.version}|${pkg.declaration}|${pkg.isImplicit === true}`;
            const existing = byKey.get(key);
            if (existing === undefined) {
                byKey.set(key, { pkg, frameworks: reference.frameworks });
                packages.push(pkg);
            } else {
                existing.frameworks = unionFrameworks(existing.frameworks, reference.frameworks);
            }
        }

        const byFramework = await this.assets.getResolvedVersionsByFramework(projectPath);
        let anyFramework: Map<string, string> | undefined;
        for (const { pkg, frameworks } of byKey.values()) {
            const limited = frameworks !== undefined && !(declared !== undefined && coversAll(frameworks, declared));
            if (limited) {
                pkg.targetFrameworks = frameworks;
            }
            const framework = (limited ? frameworks : declared)?.[0];
            const id = pkg.id.toLowerCase();
            let resolved = framework === undefined ? undefined : byFramework.get(framework)?.get(id);
            if (resolved === undefined) {
                anyFramework ??= await this.assets.getResolvedVersions(projectPath);
                resolved = anyFramework.get(id);
            }
            if (resolved !== undefined) {
                pkg.resolvedVersion = resolved;
            }
        }

        return centralPropsPath === undefined
            ? { projectPath, packages, fidelity: 'provisional', isCpm }
            : { projectPath, packages, fidelity: 'provisional', isCpm, centralPropsPath };
    }
}

function unsupported(projectPath: string, reason: keyof typeof UNSUPPORTED_MESSAGES): InstalledResult {
    return { projectPath, packages: [], fidelity: 'provisional', isCpm: false, unsupported: { reason, message: UNSUPPORTED_MESSAGES[reason] } };
}

/** `TargetFrameworks`, else `TargetFramework`, of one file; `undefined` when unset or not a literal. */
function declaredFrameworks(document: XmlObject | undefined): string[] | undefined {
    if (document === undefined) {
        return undefined;
    }
    for (const name of ['TargetFrameworks', 'TargetFramework']) {
        const value = lastPropertyValue(document, name);
        if (value === undefined) {
            continue;
        }
        if (value.includes(PROPERTY_REFERENCE)) {
            return undefined;
        }
        const frameworks = value.split(';').map(framework => framework.trim()).filter(framework => framework.length > 0);
        if (frameworks.length > 0) {
            return frameworks;
        }
    }
    return undefined;
}

/** Reads the `PackageReference` items of one file in document order: `Include` adds rows, `Update` changes earlier ones. */
function collect(document: XmlObject | undefined, file: SourceFile, references: Reference[], declared: string[] | undefined): void {
    for (const group of elements(document, 'ItemGroup')) {
        for (const item of elements(group, 'PackageReference')) {
            const condition = conditionOf(group, item);
            if (condition.never) {
                continue;
            }
            const version = nonEmpty(attr(item, 'Version') ?? childText(item, 'Version'));
            const versionOverride = nonEmpty(attr(item, 'VersionOverride') ?? childText(item, 'VersionOverride'));
            const implicit = parseBooleanProperty(attr(item, 'IsImplicitlyDefined') ?? childText(item, 'IsImplicitlyDefined'));

            const include = attr(item, 'Include');
            if (include !== undefined) {
                for (const id of packageIds(include)) {
                    references.push({ id, file, version, versionFile: file, versionOverride, isImplicit: implicit === true, frameworks: condition.frameworks, uncertain: condition.unknown });
                }
                continue;
            }
            for (const id of packageIds(attr(item, 'Update') ?? '')) {
                for (const reference of references.filter(candidate => candidate.id.toLowerCase() === id.toLowerCase())) {
                    if (!updateApplies(reference, condition, declared)) {
                        continue;
                    }
                    if (version !== undefined) {
                        reference.version = version;
                        reference.versionFile = file;
                    }
                    reference.versionOverride = versionOverride ?? reference.versionOverride;
                    reference.isImplicit = implicit ?? reference.isImplicit;
                }
            }
        }
    }
}

/**
 * Whether a (possibly guarded) `Update` changes `reference`. A guard that covers the frameworks of
 * the reference applies, one that shares none is ignored, and anything in between cannot be
 * decided here: the reference is marked uncertain and nothing is applied.
 */
function updateApplies(reference: Reference, condition: ItemCondition, declared: string[] | undefined): boolean {
    if (condition.unknown) {
        reference.uncertain = true;
        return false;
    }
    if (condition.frameworks === undefined) {
        return true;
    }
    const effective = reference.frameworks ?? declared;
    if (effective === undefined) {
        reference.uncertain = true;
        return false;
    }
    if (coversAll(condition.frameworks, effective)) {
        return true;
    }
    if (effective.some(framework => includesFramework(condition.frameworks ?? [], framework))) {
        reference.uncertain = true;
    }
    return false;
}

function conditionOf(group: XmlObject, item: XmlObject): ItemCondition {
    const result: ItemCondition = { unknown: false, never: false };
    for (const text of [attr(group, 'Condition'), attr(item, 'Condition')]) {
        if (text === undefined) {
            continue;
        }
        const framework = TFM_CONDITION.exec(text)?.[1].trim();
        if (framework === undefined) {
            result.unknown = true;
        } else if (result.frameworks === undefined) {
            result.frameworks = [framework];
        } else if (!includesFramework(result.frameworks, framework)) {
            result.never = true;
        }
    }
    return result;
}

interface ProjectFacts {
    isCpm: boolean;
    overridesEnabled: boolean;
    central: Map<string, CentralPackageVersion>;
    buildPropsPath: string | undefined;
    centralPropsPath: string | undefined;
}

/** Where the version of a reference comes from, and the version when it can be told without evaluation. */
function describe(reference: Reference, facts: ProjectFacts): InstalledPackage {
    // `definedIn` names the file that declares the item when that is not the project file.
    const itemFile = reference.file === 'props' ? facts.buildPropsPath : undefined;
    const from = (definedIn: string | undefined) => ({ definedIn, isImplicit: reference.isImplicit });
    const usesProperty = [reference.version, reference.versionOverride].some(value => value?.includes(PROPERTY_REFERENCE));
    if (reference.uncertain || usesProperty) {
        return unresolvedRow(reference.id, from(itemFile));
    }
    if (facts.isCpm && reference.versionOverride !== undefined) {
        return facts.overridesEnabled ? resolvedRow(reference.id, 'central-override', reference.versionOverride, from(itemFile)) : unresolvedRow(reference.id, from(itemFile));
    }
    if (reference.version !== undefined) {
        return reference.versionFile === 'props'
            ? resolvedRow(reference.id, 'props', reference.version, from(facts.buildPropsPath))
            : resolvedRow(reference.id, 'project', reference.version, from(itemFile));
    }
    const entry = facts.isCpm ? facts.central.get(reference.id.toLowerCase()) : undefined;
    if (entry === undefined) {
        return unresolvedRow(reference.id, from(itemFile));
    }
    if (entry.conditioned || entry.version.includes(PROPERTY_REFERENCE)) {
        return unresolvedRow(reference.id, from(facts.centralPropsPath));
    }
    return resolvedRow(reference.id, 'central', entry.version, from(itemFile ?? facts.centralPropsPath));
}

function packageIds(include: string): string[] {
    return include.split(';').map(part => part.trim()).filter(part => part.length > 0 && !UNRESOLVABLE_INCLUDE.test(part));
}

function nonEmpty(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function includesFramework(frameworks: readonly string[], framework: string): boolean {
    return frameworks.some(candidate => candidate.toLowerCase() === framework.toLowerCase());
}

function coversAll(frameworks: readonly string[], all: readonly string[]): boolean {
    return all.every(framework => includesFramework(frameworks, framework));
}

/** Union that keeps the first spelling; a reference without a limit absorbs a limited one. */
function unionFrameworks(a: string[] | undefined, b: string[] | undefined): string[] | undefined {
    if (a === undefined || b === undefined) {
        return undefined;
    }
    return [...a, ...b.filter(framework => !includesFramework(a, framework))];
}
