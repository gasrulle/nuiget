/** Items by workspace folder, in the order the folders first appear; an item without one is under "Other". */
export function groupByFolder<T extends { workspaceFolder?: string }>(items: readonly T[]): Array<[string, T[]]> {
    const groups = new Map<string, T[]>();
    for (const item of items) {
        const folder = item.workspaceFolder ?? 'Other';
        groups.set(folder, [...(groups.get(folder) ?? []), item]);
    }
    return [...groups];
}

/** The prefix of a project's group row id in an All Projects tree (interaction model §8, `group-row-project-<name>`). */
export const PROJECT_GROUP = 'project-';

/**
 * Each project's group row id in an All Projects tree, by project path: `project-<name>`, unique though a project's name is
 * not (then `project-<folder>/<name>`, then `project-<path>`); the part after the prefix names the project's markers. The
 * Installed and Updates tabs share it, so a project's group row has one id on both (D48, UX-P3.1b).
 */
export function projectGroupIds(sections: ReadonlyArray<{ projectPath: string; projectName: string; workspaceFolder?: string }>): ReadonlyMap<string, string> {
    const ids = new Map<string, string>();
    const seen = new Set<string>();
    const folders = groupByFolder(sections);
    const assign = (section: (typeof sections)[number], folder: string | undefined): void => {
        const name = section.projectName.toLowerCase();
        const id = [`${PROJECT_GROUP}${name}`, `${PROJECT_GROUP}${(folder ?? section.workspaceFolder ?? '').toLowerCase()}/${name}`].find(candidate => !seen.has(candidate)) ?? `${PROJECT_GROUP}${section.projectPath.toLowerCase()}`;
        seen.add(id);
        ids.set(section.projectPath, id);
    };
    if (folders.length < 2) {
        sections.forEach(section => assign(section, undefined));
    } else {
        folders.forEach(([folder, members]) => members.forEach(section => assign(section, folder)));
    }
    return ids;
}
