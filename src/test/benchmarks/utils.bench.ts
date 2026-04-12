/**
 * Benchmarks for NuGetUtils validators, parsers, and utility functions.
 */
import { bench, describe } from 'vitest';
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
    bench('isValidPackageId — valid ID', () => {
        isValidPackageId('Newtonsoft.Json');
    });

    bench('isValidPackageId — invalid ID', () => {
        isValidPackageId('invalid package; rm -rf /');
    });

    bench('isValidVersion — standard', () => {
        isValidVersion('13.0.3');
    });

    bench('isValidVersion — prerelease', () => {
        isValidVersion('8.0.0-preview.7.24375.6');
    });

    bench('isValidSourceName', () => {
        isValidSourceName('My Custom NuGet Feed');
    });

    bench('isValidSourceUrl — HTTPS', () => {
        isValidSourceUrl('https://api.nuget.org/v3/index.json');
    });

    bench('isValidSourceUrl — local path', () => {
        isValidSourceUrl('C:\\LocalPackages');
    });
});

describe('parseVersionSpec', () => {
    bench('standard version', () => {
        parseVersionSpec('13.0.3');
    });

    bench('floating version (wildcard)', () => {
        parseVersionSpec('4.*');
    });

    bench('range version', () => {
        parseVersionSpec('[11.0.0, 12.0.0)');
    });

    bench('prerelease version', () => {
        parseVersionSpec('8.0.0-preview.1');
    });
});

describe('LRUMap', () => {
    bench('set + get (100 entries, capacity 50)', () => {
        const map = new LRUMap<string, number>(50);
        for (let i = 0; i < 100; i++) {
            map.set(`key-${i}`, i);
        }
        for (let i = 50; i < 100; i++) {
            map.get(`key-${i}`);
        }
    });

    bench('set + eviction (1000 entries, capacity 200)', () => {
        const map = new LRUMap<string, number>(200);
        for (let i = 0; i < 1000; i++) {
            map.set(`key-${i}`, i);
        }
    });

    bench('deleteByKeyPrefix', () => {
        const map = new LRUMap<string, number>(100);
        for (let i = 0; i < 100; i++) {
            map.set(`pkg:item-${i}`, i);
        }
        map.deleteByKeyPrefix('pkg:item-5');
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

    bench('5-node dependency graph — deps first', () => {
        topologicalSortByDependency(items, (i) => i.name, depMap, selected, true);
    });

    bench('5-node dependency graph — dependents first', () => {
        topologicalSortByDependency(items, (i) => i.name, depMap, selected, false);
    });
});
