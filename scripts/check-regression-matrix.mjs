/**
 * `npm run check:matrix` (plan item P10.0a): the regression coverage matrix in `docs/plans/regression-matrix.md`
 * cites tests that exist. Every row has an id `R<n>` (unique), a kind and a status; a `covered` row names a test file
 * that exists and a test title that the file declares; a `gap` row names the file and the title of the test to write;
 * a `manual-credentials` row may cite the test that covers its automated part, and that citation must hold too.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MATRIX = 'docs/plans/regression-matrix.md';
const STATUSES = new Set(['covered', 'gap', 'manual-credentials']);
const KINDS = new Set(['ui', 'e2e', 'harness', 'unit']);
const COLUMNS = ['id', 'area', 'behaviour', 'surface', 'kind', 'file', 'title', 'status'];

/** The rows of the matrix table: every line that starts with `| R`, split into the eight columns. */
export function parseMatrix(markdown) {
    return markdown
        .split('\n')
        .filter(line => /^\|\s*R/.test(line))
        .map(line => {
            const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
            const row = Object.fromEntries(COLUMNS.map((name, index) => [name, cells[index] ?? '']));
            row.cells = cells.length;
            row.file = row.file.replace(/^`|`$/g, '');
            return row;
        });
}

/**
 * The titles a test file declares: the first string argument of `it(`, `test(` and their `.each(…)`, `.skipIf(…)`
 * and `.runIf(…)` forms, unescaped. A title written as a template keeps its `${…}` placeholders.
 */
export function declaredTitles(source) {
    const pattern = /\b(?:it|test)(?:\.(?:each|skipIf|runIf)\((?:[^()]|\([^()]*\))*\))?\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
    return [...source.matchAll(pattern)].map(match => match[2].replace(/\\(['"`\\])/g, '$1'));
}

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether a cited title is one of the declared ones: equal, or matching a template whose `${…}` or `%s` is any text. */
export function titleDeclared(title, titles) {
    return titles.some(declared => {
        if (declared === title) {
            return true;
        }
        if (!/\$\{[^}]*\}|%[sdjio]/.test(declared)) {
            return false;
        }
        const parts = declared.split(/\$\{[^}]*\}|%[sdjio]/).map(escapeRegExp);
        return new RegExp(`^${parts.join('.+')}$`).test(title);
    });
}

/** One line per defect of the matrix; `read` and `exists` take repository-relative paths. */
export function checkMatrix(markdown, read, exists) {
    const rows = parseMatrix(markdown);
    const findings = [];
    if (rows.length === 0) {
        findings.push(`${MATRIX}: no rows`);
    }
    const seen = new Set();
    for (const row of rows) {
        const where = `${MATRIX}: ${row.id || '(no id)'}`;
        if (row.cells !== COLUMNS.length) {
            findings.push(`${where}: ${row.cells} columns, expected ${COLUMNS.length}`);
            continue;
        }
        if (!/^R\d+$/.test(row.id)) {
            findings.push(`${where}: the id is not R<n>`);
        } else if (seen.has(row.id)) {
            findings.push(`${where}: duplicate id`);
        }
        seen.add(row.id);
        if (!STATUSES.has(row.status)) {
            findings.push(`${where}: status "${row.status}" is not covered, gap or manual-credentials`);
        }
        if (!KINDS.has(row.kind)) {
            findings.push(`${where}: kind "${row.kind}" is not ui, e2e, harness or unit`);
        }
        const cited = row.file !== '' && row.file !== '—';
        if ((row.status === 'covered' || row.status === 'gap') && (!cited || row.title === '' || row.title === '—')) {
            findings.push(`${where}: a ${row.status} row names a test file and a test title`);
            continue;
        }
        if (row.status === 'gap' || !cited) {
            continue;
        }
        if (!exists(row.file)) {
            findings.push(`${where}: ${row.file} does not exist`);
            continue;
        }
        if (!titleDeclared(row.title, declaredTitles(read(row.file)))) {
            findings.push(`${where}: ${row.file} declares no test "${row.title}"`);
        }
    }
    return { rows, findings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const read = file => readFileSync(path.join(repoRoot, file), 'utf8');
    const exists = file => existsSync(path.join(repoRoot, file));
    const { rows, findings } = checkMatrix(read(MATRIX), read, exists);
    for (const finding of findings) {
        console.error(finding);
    }
    const count = status => rows.filter(row => row.status === status).length;
    console.log(`check:matrix — ${rows.length} rows: ${count('covered')} covered, ${count('gap')} gap, ${count('manual-credentials')} manual-credentials; ${findings.length} finding(s).`);
    process.exitCode = findings.length === 0 ? 0 : 1;
}
