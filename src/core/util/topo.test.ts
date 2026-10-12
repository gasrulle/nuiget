import { describe, expect, it } from 'vitest';
import { topologicalSortByDependency } from './topo';

interface Item {
    id: string;
}

const items = (...ids: string[]): Item[] => ids.map(id => ({ id }));
const keyOf = (item: Item): string => item.id.toLowerCase();
const idsOf = (sorted: Item[]): string[] => sorted.map(i => i.id);

describe('topologicalSortByDependency', () => {
    it('places dependencies first for updates', () => {
        // App → Core → Base
        const deps = new Map<string, string[]>([
            ['app', ['core']],
            ['core', ['base']],
            ['base', []],
        ]);
        const sorted = topologicalSortByDependency(items('App', 'Core', 'Base'), keyOf, deps, new Set(['app', 'core', 'base']), true);
        expect(idsOf(sorted)).toEqual(['Base', 'Core', 'App']);
    });

    it('places dependents first for removals', () => {
        const deps = new Map<string, string[]>([
            ['app', ['core']],
            ['core', ['base']],
        ]);
        const sorted = topologicalSortByDependency(items('Base', 'Core', 'App'), keyOf, deps, new Set(['app', 'core', 'base']), false);
        expect(idsOf(sorted)).toEqual(['App', 'Core', 'Base']);
    });

    it('ignores dependencies outside the selected set', () => {
        const deps = new Map<string, string[]>([
            ['app', ['core', 'external']],
            ['core', ['external']],
        ]);
        const sorted = topologicalSortByDependency(items('App', 'Core'), keyOf, deps, new Set(['app', 'core']), true);
        expect(idsOf(sorted)).toEqual(['Core', 'App']);
    });

    it('returns an empty array for no items', () => {
        expect(topologicalSortByDependency([], keyOf, new Map(), new Set(), true)).toEqual([]);
        expect(topologicalSortByDependency([], keyOf, new Map(), new Set(), false)).toEqual([]);
    });

    it('orders a diamond so the shared dependency comes first and the dependent last', () => {
        // D depends on B and C; both depend on A.
        const deps = new Map<string, string[]>([
            ['d', ['b', 'c']],
            ['b', ['a']],
            ['c', ['a']],
            ['a', []],
        ]);
        const selected = new Set(['a', 'b', 'c', 'd']);

        const ids = idsOf(topologicalSortByDependency(items('D', 'C', 'B', 'A'), keyOf, deps, selected, true));
        expect(ids).toHaveLength(4);
        expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('B'));
        expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('C'));
        expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('D'));
        expect(ids.indexOf('C')).toBeLessThan(ids.indexOf('D'));

        const reversed = idsOf(topologicalSortByDependency(items('A', 'B', 'C', 'D'), keyOf, deps, selected, false));
        expect(reversed[0]).toBe('D');
        expect(reversed[3]).toBe('A');
    });

    it('keeps input order for independent items', () => {
        const sorted = topologicalSortByDependency(items('Zeta', 'Alpha', 'Mid'), keyOf, new Map(), new Set(['zeta', 'alpha', 'mid']), true);
        expect(idsOf(sorted)).toEqual(['Zeta', 'Alpha', 'Mid']);
    });

    it('falls back to input order for cycles and still returns every item once', () => {
        const deps = new Map<string, string[]>([
            ['a', ['b']],
            ['b', ['a']],
            ['c', ['a']],
        ]);
        const sorted = topologicalSortByDependency(items('A', 'B', 'C'), keyOf, deps, new Set(['a', 'b', 'c']), true);
        expect(idsOf(sorted).sort()).toEqual(['A', 'B', 'C']);
        expect(sorted).toHaveLength(3);
    });

    it('ignores self-dependencies and unknown map entries', () => {
        const deps = new Map<string, string[]>([
            ['a', ['a', 'ghost']],
            ['ghost', ['a']],
        ]);
        const sorted = topologicalSortByDependency(items('A', 'B'), keyOf, deps, new Set(['a', 'b', 'ghost']), true);
        expect(idsOf(sorted)).toEqual(['A', 'B']);
    });

    it('emits a key only once when the input contains duplicates', () => {
        const sorted = topologicalSortByDependency(items('A', 'a', 'B'), keyOf, new Map(), new Set(['a', 'b']), true);
        expect(idsOf(sorted)).toEqual(['A', 'B']);
    });
});
