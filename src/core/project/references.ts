import * as fs from 'fs';
import * as path from 'path';
import { batchedPromiseAll } from '../util/concurrency';
import { fromMsBuildPath, normalizeProjectPath } from '../util/paths';
import { attr, elements, parseMsBuildXml, rootProject } from './xml';

// Bounded so that a very large solution cannot exhaust file handles: a project that could not be
// read has no references here, and that would silently change the order of a bulk operation.
const READ_CONCURRENCY = 24;

// Globs and MSBuild expressions cannot be resolved without evaluating the project.
const UNRESOLVABLE = /[*?]|\$\(|@\(|%\(/;

/**
 * Absolute paths of the projects that `projectPath` references with `<ProjectReference Include>`,
 * in document order and without duplicates. Conditions are not evaluated, so a guarded reference
 * counts. A project that cannot be read or parsed has no references.
 */
export async function getProjectReferences(projectPath: string): Promise<string[]> {
    let project;
    try {
        project = rootProject(parseMsBuildXml(await fs.promises.readFile(projectPath, 'utf-8'), projectPath));
    } catch {
        return [];
    }
    const projectDir = path.dirname(projectPath);
    const seen = new Set<string>();
    const references: string[] = [];
    for (const group of elements(project, 'ItemGroup')) {
        for (const item of elements(group, 'ProjectReference')) {
            for (const include of (attr(item, 'Include') ?? '').split(';')) {
                const relative = include.trim();
                if (relative.length === 0 || UNRESOLVABLE.test(relative)) {
                    continue;
                }
                const absolute = path.resolve(projectDir, fromMsBuildPath(relative));
                const key = normalizeProjectPath(absolute);
                if (!seen.has(key)) {
                    seen.add(key);
                    references.push(absolute);
                }
            }
        }
    }
    return references;
}

/**
 * Project → the projects it references, restricted to `projectPaths` and without self-references.
 * Keys and values are normalized with `normalizeProjectPath`, which is what
 * `topologicalSortByDependency` and `WorkflowDeps.projectDependencies` expect.
 */
export async function getProjectDependencyMap(projectPaths: string[]): Promise<Map<string, string[]>> {
    const known = new Set(projectPaths.map(projectPath => normalizeProjectPath(projectPath)));
    const entries = await batchedPromiseAll(
        projectPaths,
        async (projectPath): Promise<[string, string[]]> => {
            const key = normalizeProjectPath(projectPath);
            const references = (await getProjectReferences(projectPath))
                .map(reference => normalizeProjectPath(reference))
                .filter(reference => known.has(reference) && reference !== key);
            return [key, references];
        },
        READ_CONCURRENCY,
    );
    return new Map(entries);
}
