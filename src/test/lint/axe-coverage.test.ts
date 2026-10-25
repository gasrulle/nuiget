// @vitest-environment jsdom
import axe from 'axe-core';
import * as fs from 'fs';
import { describe, expect, it, vi } from 'vitest';
import { aggregateAxeLedger, type AxeRunResults, COVERAGE_FIXTURE, coverageVerdict, frontendTestFiles, passedRules, recordFor, wrapAxeRun } from '../axeCoverage';

/**
 * UX-P0.25 (H88): the rule-coverage ledger of the jsdom suite (`src/test/axeCoverage.ts`, the frontend project's global
 * setup, and its recorder in `src/test/setup-frontend.ts`): the pure aggregation and verdict, the recorder's two call forms,
 * and the committed fixture.
 */
const results = (passes: string[], extra: Partial<Record<'violations' | 'incomplete' | 'inapplicable', string[]>> = {}): AxeRunResults => ({
    passes: passes.map(id => ({ id })),
    violations: (extra.violations ?? []).map(id => ({ id })),
    incomplete: (extra.incomplete ?? []).map(id => ({ id })),
    inapplicable: (extra.inapplicable ?? []).map(id => ({ id })),
});

describe('the axe rule-coverage ledger (UX-P0.25)', () => {
    it('records a file\'s rule ids once per outcome over all of its axe runs, and aggregates the files per rule', () => {
        const a = recordFor('src/webview/a.test.tsx', [results(['button-name', 'list'], { inapplicable: ['region'] }), results(['button-name'], { incomplete: ['color-contrast'] })]);
        expect(a).toEqual({ file: 'src/webview/a.test.tsx', passes: ['button-name', 'list'], violations: [], incomplete: ['color-contrast'], inapplicable: ['region'] });
        const b = recordFor('src/webview/b.test.tsx', [results(['region'], { violations: ['list'] })]);
        const c = recordFor('src/webview/c.test.tsx', []);
        expect(aggregateAxeLedger([a, b, c])).toEqual({
            'button-name': { passes: 1, violations: 0, incomplete: 0, inapplicable: 0 },
            list: { passes: 1, violations: 1, incomplete: 0, inapplicable: 0 },
            region: { passes: 1, violations: 0, incomplete: 0, inapplicable: 1 },
            'color-contrast': { passes: 0, violations: 0, incomplete: 1, inapplicable: 0 },
        });
        expect(passedRules([a, b, c])).toEqual(['button-name', 'list', 'region']);
    });

    it('fails a pinned rule that passed nowhere once every file reported, and skips a filtered run', () => {
        const records = [recordFor('a', [results(['button-name'], { inapplicable: ['label'] })]), recordFor('b', [results(['list'])])];
        expect(coverageVerdict(['button-name', 'list'], records, 2)).toEqual({ line: '[axe-coverage] 2 files, 2 rules passed somewhere, 0 missing', missing: [], skipped: false });
        expect(coverageVerdict(['button-name', 'label'], records, 2)).toEqual({ line: '[axe-coverage] 2 files, 2 rules passed somewhere, 1 missing: label', missing: ['label'], skipped: false });
        expect(coverageVerdict(['button-name', 'label'], records, 60)).toEqual({ line: '[axe-coverage] skipped: 2 of 60 frontend files reported', missing: [], skipped: true });
    });

    it('records through both forms of axe.run, the callback jest-axe uses and the promise, and wraps it once', async () => {
        const recorded: string[][] = [];
        const fake = {
            run: vi.fn((...args: unknown[]) => {
                const answer = results(['button-name']);
                const callback = args.find(arg => typeof arg === 'function') as ((error: unknown, value: AxeRunResults) => void) | undefined;
                if (callback) {
                    callback(null, answer);
                    return undefined;
                }
                return Promise.resolve(answer);
            }),
        };
        wrapAxeRun(fake, value => recorded.push(value.passes.map(rule => rule.id)));
        wrapAxeRun(fake, () => recorded.push(['twice']));
        const viaCallback = await new Promise<AxeRunResults>(resolve => {
            (fake.run as unknown as (element: unknown, options: unknown, callback: (error: unknown, value: AxeRunResults) => void) => void)(document.body, {}, (_error, value) => resolve(value));
        });
        const viaPromise = await (fake.run as unknown as (element: unknown) => Promise<AxeRunResults>)(document.body);
        expect(viaCallback.passes).toEqual([{ id: 'button-name' }]);
        expect(viaPromise.passes).toEqual([{ id: 'button-name' }]);
        expect(recorded).toEqual([['button-name'], ['button-name']]);
    });

    it('commits a fixture of rule ids axe-core knows, sorted and unique, over the frontend project\'s test files', () => {
        const fixture = JSON.parse(fs.readFileSync(COVERAGE_FIXTURE, 'utf8')) as string[];
        expect(fixture.length).toBeGreaterThan(30);
        expect(fixture).toEqual([...new Set(fixture)].sort());
        const known = new Set(axe.getRules().map(rule => rule.ruleId));
        expect(fixture.filter(id => !known.has(id))).toEqual([]);
        expect(frontendTestFiles().every(file => /^src\/webview\/.+\.test\.tsx?$/.test(file))).toBe(true);
    });
});
