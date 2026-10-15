/**
 * Builders of `InstalledPackage` rows shared by the static inspection (`inspector.ts`) and the MSBuild
 * evaluation (`evaluator.ts`), so that both tiers describe a reference the same way (ADR-004).
 */

import type { InstalledPackage, VersionDeclaration } from '../../protocol/domain';
import { parseVersionSpec, toDomainSpec } from '../versioning';

/** Where a row's item comes from when that is not the project file, and whether the SDK injected it. */
export interface RowOrigin {
    definedIn?: string;
    isImplicit?: boolean;
}

/** A row whose version is known: its type, floating prefix and always-latest flag come from the version text. */
export function resolvedRow(id: string, declaration: Exclude<VersionDeclaration, 'unresolved'>, version: string, origin: RowOrigin): InstalledPackage {
    const spec = toDomainSpec(parseVersionSpec(version));
    const pkg: InstalledPackage = { id, version, versionType: spec.type, declaration };
    if (spec.floatingPrefix !== undefined) {
        pkg.floatingPrefix = spec.floatingPrefix;
    }
    if (spec.isAlwaysLatest !== undefined) {
        pkg.isAlwaysLatest = spec.isAlwaysLatest;
    }
    return withOrigin(pkg, origin);
}

/** A row whose version cannot be told; it is shown as unresolved and left out of update checks. */
export function unresolvedRow(id: string, origin: RowOrigin): InstalledPackage {
    return withOrigin({ id, version: '', versionType: 'unresolved', declaration: 'unresolved' }, origin);
}

function withOrigin(pkg: InstalledPackage, origin: RowOrigin): InstalledPackage {
    if (origin.definedIn !== undefined) {
        pkg.definedIn = origin.definedIn;
    }
    if (origin.isImplicit === true) {
        pkg.isImplicit = true;
    }
    return pkg;
}
