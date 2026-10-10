/**
 * Benchmarks for NuGetUtils validators, parsers, and utility functions.
 */
import { test, describe } from 'vitest';
import { runBenchmark } from './benchmark';
import {
    isValidPackageId,
    isValidSourceName,
    isValidSourceUrl,
    isValidVersion,
    LRUMap,
    parseVersionSpec,
    topologicalSortByDependency,
} from '../../services/NuGetUtils';

describe('Validators', () => {
    test('isValidPackageId — valid ID', async (context) => {
        await runBenchmark(context, 'isValidPackageId — valid ID', () => {
            isValidPackageId('Newtonsoft.Json');
        });
    });

    test('isValidPackageId — invalid ID', async (context) => {
        await runBenchmark(context, 'isValidPackageId — invalid ID', () => {
            isValidPackageId('invalid package; rm -rf /');
        });
    });

    test('isValidVersion — standard', async (context) => {
        await runBenchmark(context, 'isValidVersion — standard', () => {
            isValidVersion('13.0.3');
        });
    });

    test('isValidVersion — prerelease', async (context) => {
        await runBenchmark(context, 'isValidVersion — prerelease', () => {
            isValidVersion('8.0.0-preview.7.24375.6');
        });
    });

    test('isValidSourceName', async (context) => {
        await runBenchmark(context, 'isValidSourceName', () => {
            isValidSourceName('My Custom NuGet Feed');
        });
    });

    test('isValidSourceUrl — HTTPS', async (context) => {
        await runBenchmark(context, 'isValidSourceUrl — HTTPS', () => {
            isValidSourceUrl('https://api.nuget.org/v3/index.json');
        });
    });

    test('isValidSourceUrl — local path', async (context) => {
        await runBenchmark(context, 'isValidSourceUrl — local path', () => {
            isValidSourceUrl('C:\\LocalPackages');
        });
    });
});

describe('parseVersionSpec', () => {
    test('standard version', async (context) => {
        await runBenchmark(context, 'standard version', () => {
            parseVersionSpec('13.0.3');
        });
    });

    test('floating version (wildcard)', async (context) => {
        await runBenchmark(context, 'floating version (wildcard)', () => {
            parseVersionSpec('4.*');
        });
    });

    test('range version', async (context) => {
        await runBenchmark(context, 'range version', () => {
            parseVersionSpec('[11.0.0, 12.0.0)');
        });
    });

    test('prerelease version', async (context) => {
        await runBenchmark(context, 'prerelease version', () => {
            parseVersionSpec('8.0.0-preview.1');
        });
    });
});

describe('LRUMap', () => {
    test('set + get (100 entries, capacity 50)', async (context) => {
        await runBenchmark(context, 'set + get (100 entries, capacity 50)', () => {
            const map = new LRUMap<string, number>(50);
            for (let i = 0; i < 100; i++) {
                map.set(`key-${i}`, i);
            }
            for (let i = 50; i < 100; i++) {
                map.get(`key-${i}`);
            }
        });
    });

    test('set + eviction (1000 entries, capacity 200)', async (context) => {
        await runBenchmark(context, 'set + eviction (1000 entries, capacity 200)', () => {
            const map = new LRUMap<string, number>(200);
            for (let i = 0; i < 1000; i++) {
                map.set(`key-${i}`, i);
            }
        });
    });

    test('deleteByKeyPrefix', async (context) => {
        await runBenchmark(context, 'deleteByKeyPrefix', () => {
            const map = new LRUMap<string, number>(100);
            for (let i = 0; i < 100; i++) {
                map.set(`pkg:item-${i}`, i);
            }
            map.deleteByKeyPrefix('pkg:item-5');
        });
    });
});

describe('topologicalSortByDependency', () => {
    const items = [
        { name: 'A' },
        { name: 'B' },
        { name: 'C' },
        { name: 'D' },
        { name: 'E' },
    ];
    const depMap = new Map([
        ['A', ['B', 'C']],
        ['B', ['D']],
        ['C', []],
        ['D', ['E']],
        ['E', []],
    ]);
    const selected = new Set(['A', 'B', 'C', 'D', 'E']);

    test('5-node dependency graph — deps first', async (context) => {
        await runBenchmark(context, '5-node dependency graph — deps first', () => {
            topologicalSortByDependency(items, (i) => i.name, depMap, selected, true);
        });
    });

    test('5-node dependency graph — dependents first', async (context) => {
        await runBenchmark(context, '5-node dependency graph — dependents first', () => {
            topologicalSortByDependency(items, (i) => i.name, depMap, selected, false);
        });
    });
});
