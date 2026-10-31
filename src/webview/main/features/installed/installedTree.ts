import type React from 'react';
import type { InstalledPackage, InstalledResult, PackageMetadataLite } from '../../../../protocol';

/** What a project's rows are built from: one project's list, from the installed slice or from an All Projects chunk. */
export interface Section {
    projectPath: string;
    projectName: string;
    /** The workspace folder of the project, in All Projects. */
    workspaceFolder?: string;
    result: InstalledResult | undefined;
    status: 'idle' | 'loading' | 'ready' | 'error';
    error: string | undefined;
    metadata: ReadonlyMap<string, PackageMetadataLite>;
    revalidating: boolean;
    onRetry: () => void;
}

/** A row of the tab's one tree (D48, ADR-013 Decision 8): a group, a package of a project or a transitive package. */
export type TreeItem =
    | { kind: 'group'; id: string; level: number; title: string; count?: number | string; section?: Section; variant: 'group' | 'level'; tfm?: string }
    | { kind: 'package'; id: string; section: Section; result: InstalledResult; entry: InstalledPackage }
    | { kind: 'transitive'; id: string; scope: { projectPath: string; tfm: string } | { projectPath: null }; entry: { id: string; version: string }; key: string; badges?: React.ReactNode };

/** A row's id: unique across projects, whose paths and ids cannot hold a line break. */
export const rowId = (owner: string, packageId: string): string => `${owner}\n${packageId}`;
export const parseRowId = (id: string): { projectPath: string; packageId: string } => {
    const at = id.lastIndexOf('\n');
    return { projectPath: id.slice(0, at), packageId: id.slice(at + 1) };
};
