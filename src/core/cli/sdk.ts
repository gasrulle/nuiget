import type { CapabilityProvenance, SdkInfo } from '../contracts';

/** Parsed `dotnet --version` output. */
export interface ParsedSdkVersion {
    version: string;
    major: number;
    minor: number;
    patch: number;
    prerelease?: string;
}

const VERSION_LINE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * Parse the output of `dotnet --version`. The first line that is a complete `major.minor.patch`
 * version wins, so stray first-run or diagnostics lines are ignored. Returns `undefined` when no
 * such line exists (missing SDK, `global.json` pointing at an uninstalled SDK, localized errors).
 */
export function parseSdkVersion(output: string): ParsedSdkVersion | undefined {
    for (const rawLine of output.split(/\r?\n/)) {
        const line = rawLine.trim();
        const match = VERSION_LINE.exec(line);
        if (!match) {
            continue;
        }
        return {
            version: line,
            major: Number(match[1]),
            minor: Number(match[2]),
            patch: Number(match[3]),
            prerelease: match[4],
        };
    }
    return undefined;
}

/** Oldest .NET SDK major that 2.0 works with (plan decision D13). Below it a project is read-only. */
export const MIN_SUPPORTED_SDK_MAJOR = 10;

/** What 2.0 may rely on for one SDK major. */
export interface SdkCapabilities {
    /** `major >= MIN_SUPPORTED_SDK_MAJOR`. */
    supported: boolean;
    /** `dotnet package add` writes the central version of a Central Package Management project. */
    cpmAwareAdd: boolean;
    cpmAwareAddProvenance: CapabilityProvenance;
}

/**
 * SDK majors for which a tracked probe fixture (`__fixtures__/sdk-probes/<version>.json`) proves what
 * `dotnet package add` does to a Central Package Management project. The value is the fixture's verdict
 * `addUpdatesCentralVersion`; `sdk.test.ts` fails when this table and the fixtures disagree. The fixtures are
 * read by that test, not by this module, so no test data is bundled into the extension.
 *
 * An SDK major without a fixture is `'unverified'` and treated as not CPM-aware, whatever its documentation
 * says: only a fixture counts as evidence (ADR-004 and its SDK probes supplement).
 */
const PROBED_CPM_AWARE_ADD: ReadonlyMap<number, boolean> = new Map([
    [10, true],
]);

/** Static capabilities of an SDK major version. */
export function capabilitiesFor(major: number): SdkCapabilities {
    const supported = major >= MIN_SUPPORTED_SDK_MAJOR;
    const probed = PROBED_CPM_AWARE_ADD.get(major);
    return probed === undefined
        ? { supported, cpmAwareAdd: false, cpmAwareAddProvenance: 'unverified' }
        : { supported, cpmAwareAdd: probed, cpmAwareAddProvenance: 'verified' };
}

/** Build the `SdkInfo` for a version string; `undefined` when the string is not a version. */
export function sdkInfoFromVersion(version: string): SdkInfo | undefined {
    const parsed = parseSdkVersion(version);
    if (!parsed) {
        return undefined;
    }
    return { version: parsed.version, major: parsed.major, ...capabilitiesFor(parsed.major) };
}
