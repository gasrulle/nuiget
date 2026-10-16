/**
 * Benchmarks for the 2.0 versioning module (`src/core/versioning`): version parsing and ordering,
 * specification parsing, range checks and floating resolution.
 */
import { test, describe } from 'vitest';
import { runBenchmark } from '../../test/benchmarks/benchmark';
import * as versioning from '../versioning';

// Bound once on purpose. Under Vitest's module runner an imported binding is a getter on the module object;
// calling it inside a benchmark would add that overhead to every sample (Vitest warns about it).
const {
    compare,
    isUpdateCandidate,
    parseVersion,
    parseVersionSpec,
    resolveFloating,
    satisfies,
    selectLatest,
    sortDescending,
} = versioning;

/** A version list of the size a popular package has: 40 releases, each with two prereleases. */
const AVAILABLE_VERSIONS: string[] = Array.from({ length: 40 }, (_, index) => {
    const version = `${1 + Math.floor(index / 10)}.${index % 10}.${index % 3}`;
    return [version, `${version}-preview.${index}`, `${version}-rc.1`];
}).flat();

function requireVersion(text: string): NonNullable<ReturnType<typeof parseVersion>> {
    const parsed = parseVersion(text);
    if (parsed === undefined) {
        throw new Error(`benchmark fixture is not a version: ${text}`);
    }
    return parsed;
}

describe('core versioning — parseVersion', () => {
    test('stable', async (context) => {
        await runBenchmark(context, 'stable', () => {
            parseVersion('13.0.3');
        });
    });

    test('prerelease with build metadata', async (context) => {
        await runBenchmark(context, 'prerelease with build metadata', () => {
            parseVersion('8.0.0-preview.7.24375.6+sha.5d3c1b2');
        });
    });

    test('rejected text', async (context) => {
        await runBenchmark(context, 'rejected text', () => {
            parseVersion('unknown');
        });
    });
});

describe('core versioning — ordering', () => {
    const stable = requireVersion('13.0.3');
    const prerelease = requireVersion('13.0.3-preview.2');

    test('compare stable with prerelease', async (context) => {
        await runBenchmark(context, 'compare stable with prerelease', () => {
            compare(stable, prerelease);
        });
    });

    test('sortDescending over 120 versions', async (context) => {
        await runBenchmark(context, 'sortDescending over 120 versions', () => {
            sortDescending(AVAILABLE_VERSIONS);
        });
    });

    test('selectLatest stable over 120 versions', async (context) => {
        await runBenchmark(context, 'selectLatest stable over 120 versions', () => {
            selectLatest(AVAILABLE_VERSIONS, { includePrerelease: false });
        });
    });
});

describe('core versioning — specifications', () => {
    const range = parseVersionSpec('[2.0.0, 4.0.0)');
    const floating = parseVersionSpec('3.*');
    const candidate = requireVersion('3.4.1');

    test('parseVersionSpec minimum', async (context) => {
        await runBenchmark(context, 'parseVersionSpec minimum', () => {
            parseVersionSpec('13.0.3');
        });
    });

    test('parseVersionSpec range', async (context) => {
        await runBenchmark(context, 'parseVersionSpec range', () => {
            parseVersionSpec('[11.0.0, 12.0.0)');
        });
    });

    test('parseVersionSpec exact', async (context) => {
        await runBenchmark(context, 'parseVersionSpec exact', () => {
            parseVersionSpec('[13.0.3]');
        });
    });

    test('parseVersionSpec floating', async (context) => {
        await runBenchmark(context, 'parseVersionSpec floating', () => {
            parseVersionSpec('8.0.*-*');
        });
    });

    test('satisfies range', async (context) => {
        await runBenchmark(context, 'satisfies range', () => {
            satisfies(range, candidate);
        });
    });

    test('resolveFloating over 120 versions', async (context) => {
        await runBenchmark(context, 'resolveFloating over 120 versions', () => {
            resolveFloating(floating, AVAILABLE_VERSIONS, false);
        });
    });

    test('isUpdateCandidate floating', async (context) => {
        await runBenchmark(context, 'isUpdateCandidate floating', () => {
            isUpdateCandidate(floating, '3.4.1');
        });
    });
});
