import * as path from 'path';
import type { Project } from '../../protocol/domain';
import { isPathInside, normalizeProjectPath } from '../util/paths';

/** Workspace-wide file search (`vscode.workspace.findFiles` shape, without the VS Code types). */
export type FileSearch = (include: string, exclude: string, maxResults?: number) => Promise<string[]>;

export interface WorkspaceFolderInfo {
    name: string;
    fsPath: string;
}

export type ProjectKind = 'sdk-style' | 'legacy' | 'packages-config' | 'unknown';

export const PROJECT_FILE_GLOB = '**/*.{csproj,fsproj,vbproj}';
export const PROJECT_FILE_EXCLUDE = '**/{bin,obj,node_modules,.git,.vs}/**';

/**
 * Discover project files across every workspace folder with a single search, attribute each
 * file to the folder that contains it, and return a stable (name, then path) ordering.
 */
export async function findProjects(search: FileSearch, folders: WorkspaceFolderInfo[]): Promise<Project[]> {
    if (folders.length === 0) {
        return [];
    }

    const files = await search(PROJECT_FILE_GLOB, PROJECT_FILE_EXCLUDE);
    const seen = new Set<string>();
    const projects: Project[] = [];

    for (const file of files) {
        const key = normalizeProjectPath(file);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);

        const folder = containingFolder(file, folders);
        projects.push({
            name: path.basename(file),
            path: file,
            workspaceFolder: folder?.name,
        });
    }

    projects.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.path.localeCompare(b.path));
    return projects;
}

function containingFolder(file: string, folders: WorkspaceFolderInfo[]): WorkspaceFolderInfo | undefined {
    let best: WorkspaceFolderInfo | undefined;
    for (const folder of folders) {
        if (isPathInside(file, folder.fsPath) && (best === undefined || folder.fsPath.length > best.fsPath.length)) {
            best = folder;
        }
    }
    return best;
}

const PROJECT_ROOT_TAG = /<Project(?=[\s>/])([^>]*)>/i;
const SDK_ATTRIBUTE = /(?:^|\s)Sdk\s*=/i;
const SDK_ELEMENT = /<Sdk\s[^>]*\bName\s*=/i;
const SDK_IMPORT = /<Import\s[^>]*\bSdk\s*=/i;
const TOOLS_VERSION = /(?:^|\s)ToolsVersion\s*=/i;
const MSBUILD_2003_NAMESPACE = /xmlns\s*=\s*["']http:\/\/schemas\.microsoft\.com\/developer\/msbuild\/2003["']/i;

/**
 * Classify a project file from its raw text. A `packages.config` beside the project wins
 * because that restore style is unsupported regardless of the project format.
 */
export function classifyProject(projectPath: string, xmlText: string, hasPackagesConfig: boolean): ProjectKind {
    if (hasPackagesConfig) {
        return 'packages-config';
    }

    const rootTag = PROJECT_ROOT_TAG.exec(xmlText);
    const rootAttributes = rootTag?.[1] ?? '';

    if (SDK_ATTRIBUTE.test(rootAttributes) || SDK_ELEMENT.test(xmlText) || SDK_IMPORT.test(xmlText)) {
        return 'sdk-style';
    }

    if (TOOLS_VERSION.test(rootAttributes) || MSBUILD_2003_NAMESPACE.test(rootAttributes) || importsLegacyLanguageTargets(projectPath, xmlText)) {
        return 'legacy';
    }

    return 'unknown';
}

const LEGACY_TARGETS_BY_EXTENSION: Record<string, string> = {
    '.csproj': 'Microsoft\\.CSharp\\.targets',
    '.fsproj': 'Microsoft\\.FSharp\\.targets',
    '.vbproj': 'Microsoft\\.VisualBasic\\.targets',
};

function importsLegacyLanguageTargets(projectPath: string, xmlText: string): boolean {
    const targets = LEGACY_TARGETS_BY_EXTENSION[path.extname(projectPath).toLowerCase()];
    if (targets === undefined) {
        return false;
    }
    return new RegExp(`<Import\\s[^>]*\\bProject\\s*=\\s*["'][^"']*${targets}["']`, 'i').test(xmlText);
}
