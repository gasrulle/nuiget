import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
if (!['run', 'save', 'compare'].includes(mode)) {
    throw new Error('Expected benchmark mode: run, save, or compare.');
}

const root = fileURLToPath(new URL('../../../', import.meta.url));
const latestPath = resolve(root, 'benchmarks/latest.json');
const baselinePath = resolve(root, 'benchmarks/baseline.json');

function execute(args, env = {}) {
    const result = spawnSync(process.execPath, args, {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env, ...env },
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

if (mode === 'compare') {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    if (baseline?.version !== 1 || !baseline.benchmarks || typeof baseline.benchmarks !== 'object'
        || Array.isArray(baseline.benchmarks) || !Object.keys(baseline.benchmarks).length) {
        throw new Error('Missing or invalid benchmark baseline; run npm run bench:save.');
    }
}

rmSync(latestPath, { force: true });
execute([
    resolve(root, 'node_modules/vitest/vitest.mjs'),
    'bench', '--run', '--project', 'backend (bench)',
    '--reporter=default', '--reporter=json', '--outputFile.json=benchmarks/latest.json',
    ...process.argv.slice(3),
], {
    NUIGET_BENCHMARK_BASELINE: mode === 'compare' ? baselinePath : '',
});

const report = JSON.parse(readFileSync(latestPath, 'utf8'));
if (!report.success || report.numFailedTests || report.numFailedTestSuites) {
    throw new Error('Benchmark runner reported failures.');
}
const benchmarks = {};
for (const file of report.testResults) {
    const filepath = relative(root, file.name).replaceAll('\\', '/');
    for (const assertion of file.assertionResults) {
        for (const group of assertion.benchmarks) {
            for (const task of group.tasks) {
                if (task.fromStore) {
                    continue;
                }
                const key = JSON.stringify([filepath, assertion.ancestorTitles, assertion.title, task.name]);
                if (Object.hasOwn(benchmarks, key)) {
                    throw new Error(`Duplicate benchmark identity: ${key}`);
                }
                if (!Number.isFinite(task.throughput?.mean) || !Number.isFinite(task.latency?.mean)) {
                    throw new Error(`Invalid benchmark result: ${key}`);
                }
                benchmarks[key] = task;
            }
        }
    }
}
if (!Object.keys(benchmarks).length) {
    throw new Error('No benchmark measurements were produced.');
}
if (mode === 'save') {
    const sorted = Object.fromEntries(Object.entries(benchmarks).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(baselinePath, `${JSON.stringify({ version: 1, benchmarks: sorted }, undefined, 2)}\n`);
    process.stdout.write(`Saved ${Object.keys(sorted).length} benchmark measurements to benchmarks/baseline.json.\n`);
}
