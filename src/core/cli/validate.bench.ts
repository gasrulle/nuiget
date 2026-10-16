/**
 * Benchmarks for the argument validators of the 2.0 dotnet runner (`src/core/cli/validate.ts`): every package id,
 * version, source name and URL passes through them before a command is built. Replaces the validator cases of the 1.x
 * `utils` benchmark (P8.2a, D8).
 */
import { describe, test } from 'vitest';
import { runBenchmark } from '../../test/benchmarks/benchmark';
import * as validate from './validate';

// Bound once on purpose (see src/core/cache/cache.bench.ts): an imported binding is a getter under Vitest's module runner.
const { isValidPackageId, isValidSourceName, isValidSourceUrl, isValidVersion } = validate;

const PACKAGE_IDS = ['Newtonsoft.Json', 'Microsoft.Extensions.DependencyInjection.Abstractions', 'Serilog', 'NUnit3TestAdapter', '-not-an-id', 'bad id'];
const VERSIONS = ['13.0.3', '8.0.0-preview.7.24375.6+sha.5d3c1b2', '[1.0,2.0)', '1.*', 'not a version;'];

describe('core cli — validators', () => {
    test('package ids (6, two rejected)', async (context) => {
        await runBenchmark(context, 'package ids (6, two rejected)', () => {
            for (const id of PACKAGE_IDS) {
                isValidPackageId(id);
            }
        });
    });

    test('versions (5, one rejected)', async (context) => {
        await runBenchmark(context, 'versions (5, one rejected)', () => {
            for (const version of VERSIONS) {
                isValidVersion(version);
            }
        });
    });

    test('source name and URL', async (context) => {
        await runBenchmark(context, 'source name and URL', () => {
            isValidSourceName('nuget.org');
            isValidSourceUrl('https://api.nuget.org/v3/index.json');
            isValidSourceUrl('C:\\Packages\\local');
            isValidSourceUrl('--configfile');
        });
    });
});
