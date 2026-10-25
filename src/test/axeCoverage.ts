/**
 * The rule-coverage ledger of the jsdom suite (UX-P0.25; H88). The frontend project's `globalSetup`: before the run it
 * makes a fresh directory that `src/test/setup-frontend.ts` writes each test file's axe rule outcomes into (`provide` /
 * `inject`, so no record of an earlier run is counted); after the run its teardown aggregates them and fails the run when a
 * rule of `src/test/lint/__fixtures__/axe-rule-coverage.json` passed nowhere, so a property a test pinned cannot vanish
 * silently while every `toHaveNoViolations` still passes. A run that did not report every frontend test file (a filtered
 * run) is not a ledger: it is skipped and says so. `NUIGET_AXE_COVERAGE_WRITE=1` rewrites the fixture from a full run
 * instead of judging it, for the item that removes a rule's last markup on purpose.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
    interface ProvidedContext {
        /** Where each frontend test file writes its axe record; set by this global setup. */
        axeLedgerDir: string;
    }
}

const ROOT = path.resolve(__dirname, '../..');
export const COVERAGE_FIXTURE = path.join(ROOT, 'src/test/lint/__fixtures__/axe-rule-coverage.json');

/** The rule ids of one test file's axe runs, by outcome. */
export interface AxeRecord {
    file: string;
    passes: string[];
    violations: string[];
    incomplete: string[];
    inapplicable: string[];
}

/** What an axe run answers, as far as the ledger reads it. */
export interface AxeRunResults {
    passes: Array<{ id: string }>;
    violations: Array<{ id: string }>;
    incomplete: Array<{ id: string }>;
    inapplicable: Array<{ id: string }>;
}

const KINDS = ['passes', 'violations', 'incomplete', 'inapplicable'] as const;

/** A test file's record from all of its axe runs: each rule id once per outcome, sorted. */
export function recordFor(testPath: string, results: readonly AxeRunResults[]): AxeRecord {
    const ids = (kind: (typeof KINDS)[number]): string[] => [...new Set(results.flatMap(result => (result[kind] ?? []).map(rule => rule.id)))].sort();
    return { file: testPath, passes: ids('passes'), violations: ids('violations'), incomplete: ids('incomplete'), inapplicable: ids('inapplicable') };
}

/** Per rule, the number of files where it passed, was violated, stayed incomplete or did not apply. */
export function aggregateAxeLedger(records: readonly AxeRecord[]): Record<string, Record<(typeof KINDS)[number], number>> {
    const ledger: Record<string, Record<(typeof KINDS)[number], number>> = {};
    for (const record of records) {
        for (const kind of KINDS) {
            for (const id of record[kind]) {
                ledger[id] ??= { passes: 0, violations: 0, incomplete: 0, inapplicable: 0 };
                ledger[id][kind] += 1;
            }
        }
    }
    return ledger;
}

/** The ledger's verdict: skipped unless every frontend file reported; else the fixture's rules that passed nowhere. */
export function coverageVerdict(fixtureRules: readonly string[], records: readonly AxeRecord[], expectedFiles: number): { line: string; missing: string[]; skipped: boolean } {
    if (records.length < expectedFiles) {
        return { line: `[axe-coverage] skipped: ${records.length} of ${expectedFiles} frontend files reported`, missing: [], skipped: true };
    }
    const ledger = aggregateAxeLedger(records);
    const passed = Object.entries(ledger).filter(([, counts]) => counts.passes > 0).map(([id]) => id);
    const missing = fixtureRules.filter(id => (ledger[id]?.passes ?? 0) === 0);
    return { line: `[axe-coverage] ${records.length} files, ${passed.length} rules passed somewhere, ${missing.length} missing${missing.length > 0 ? `: ${missing.join(', ')}` : ''}`, missing, skipped: false };
}

/** The rules that passed in at least one file, sorted: the fixture a full run writes. */
export const passedRules = (records: readonly AxeRecord[]): string[] =>
    Object.entries(aggregateAxeLedger(records)).filter(([, counts]) => counts.passes > 0).map(([id]) => id).sort();

/** An axe-core module whose `run` the recorder patches. */
export interface AxeLike {
    run: (...args: never[]) => unknown;
}

/**
 * Patches `axe.run` once to hand every result to `record`, keeping both forms: jest-axe calls it with a callback
 * (`run(element, options, callback)`), other callers await its promise.
 */
export function wrapAxeRun(axe: AxeLike, record: (results: AxeRunResults) => void): void {
    const current = axe.run as ((...args: unknown[]) => unknown) & { recorded?: boolean };
    if (current.recorded) {
        return;
    }
    const original = current.bind(axe);
    const wrapped = (...args: unknown[]): unknown => {
        const last = args[args.length - 1];
        if (typeof last === 'function') {
            const callback = last as (error: unknown, results?: AxeRunResults) => void;
            return original(...args.slice(0, -1), (error: unknown, results?: AxeRunResults) => {
                if (!error && results) {
                    record(results);
                }
                callback(error, results);
            });
        }
        return (original(...args) as Promise<AxeRunResults>).then(results => {
            record(results);
            return results;
        });
    };
    (wrapped as typeof wrapped & { recorded: boolean }).recorded = true;
    (axe as unknown as { run: unknown }).run = wrapped;
}

/** The frontend project's test files (its `include`, `src/webview/**\/*.test.{ts,tsx}`), relative to the root. */
export function frontendTestFiles(root = ROOT): string[] {
    const found: string[] = [];
    const walk = (dir: string): void => {
        for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
            const child = `${dir}/${entry.name}`;
            if (entry.isDirectory()) {
                walk(child);
            } else if (/\.test\.tsx?$/.test(entry.name)) {
                found.push(child);
            }
        }
    };
    walk('src/webview');
    return found.sort();
}

/** Vitest's global setup of the frontend project: the ledger directory now, the verdict in the returned teardown. */
export async function setup(project: TestProject): Promise<() => void> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuiget-axe-'));
    project.provide('axeLedgerDir', dir);
    return () => {
        try {
            const records = fs.readdirSync(dir).filter(file => file.endsWith('.json')).map(file => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as AxeRecord);
            const expected = frontendTestFiles().length;
            if (process.env.NUIGET_AXE_COVERAGE_WRITE === '1') {
                if (records.length < expected) {
                    console.warn(`[axe-coverage] not written: ${records.length} of ${expected} frontend files reported`);
                    return;
                }
                const rules = passedRules(records);
                fs.writeFileSync(COVERAGE_FIXTURE, JSON.stringify(rules, null, 4) + '\n');
                console.warn(`[axe-coverage] fixture written: ${rules.length} rules passed somewhere in ${records.length} files`);
                return;
            }
            const fixture = JSON.parse(fs.readFileSync(COVERAGE_FIXTURE, 'utf8')) as string[];
            const { line, missing } = coverageVerdict(fixture, records, expected);
            console.warn(line);
            if (missing.length > 0) {
                throw new Error(`${line}: a rule the suite pinned passed in no frontend test file (UX-P0.25, H88)`);
            }
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    };
}
