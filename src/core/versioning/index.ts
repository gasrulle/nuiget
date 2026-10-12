export {
    compare,
    compareText,
    equals,
    isNewer,
    normalize,
    normalizeId,
    parseVersion,
    selectLatest,
    sortDescending,
} from './NuGetVersion';
export type { NuGetVersion } from './NuGetVersion';
export {
    effectiveInstalledVersion,
    isUpdateCandidate,
    parseVersionSpec,
    resolveFloating,
    satisfies,
    satisfiesText,
    toDomainSpec,
} from './VersionRange';
export type { FloatingPattern, ParsedVersionSpec, VersionSpecKind } from './VersionRange';
