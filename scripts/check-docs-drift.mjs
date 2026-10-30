#!/usr/bin/env node
// Checks the 2.0 documents against the tree they describe (plan item P7.5c): the message names and counts against
// `src/protocol/messages.ts`, the settings, commands and context keys against `package.json`, and every path the
// documents name against the files. Exit 1 with one line per finding. No check reads file sizes or line counts.
//
// Documents: the `## 2.0 Architecture` section of ARCHITECTURE.md, docs/ux/interaction-model.md, the `## 2.0 gotchas`
// section of .github/copilot-instructions.md, and README.md. The code half (the `ExtensionConfig` keys and the
// contributed enum against the manifest) is `src/test/lint/extension-config-settings.test.ts`; it is not repeated here.
//
// The UX documents (UX-P0.30): the paths of docs/plans/RUN-ux.md, docs/design/design-system.md and
// docs/design/judge-rubric.md exist (`FUTURE_PATHS` names the ones a later item creates), and every `DS-*` id that the
// UX plan, RUN-ux.md, src/test/ui/v2/measure.ts or the rubric cites is a rule row of the Design System.
//
// Usage: node scripts/check-docs-drift.mjs
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expandIds } from './check-rule-coverage.mjs';
import { OWNER_SETTINGS, OWNER_SETTINGS_COMMITTED, RETIRE_SENTINEL, SENTINEL } from './hooks/guard.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The lines from the heading that matches `start` up to the next heading of the same level, or `undefined`. */
export function section(text, start) {
    const lines = text.split(/\r?\n/);
    const first = lines.findIndex(line => start.test(line));
    if (first < 0) {
        return undefined;
    }
    const level = /^#+/.exec(lines[first])[0].length;
    const next = lines.findIndex((line, index) => index > first && new RegExp(`^#{1,${level}} `).test(line));
    return lines.slice(first, next < 0 ? undefined : next).join('\n');
}

/** Every backticked span of a document. */
export function codeSpans(text) {
    return [...text.matchAll(/`([^`\n]+)`/g)].map(match => match[1]);
}

/** `a/{b,c}/d` → `a/b/d`, `a/c/d`; one brace group at a time, nested groups not supported. */
export function expandBraces(pattern) {
    const match = /\{([^{}]*)\}/.exec(pattern);
    if (!match) {
        return [pattern];
    }
    return match[1].split(',').flatMap(choice => expandBraces(pattern.slice(0, match.index) + choice + pattern.slice(match.index + match[0].length)));
}

/** A path as a document writes it, reduced to what must exist: no `:line` suffix, no trailing `/**` or `/*`. */
export function pathsOf(token) {
    return expandBraces(token.replace(/:\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/, ''))
        .map(candidate => candidate.replace(/\/\*\*?$/, '').replace(/\/$/, ''));
}

const PATH_PREFIXES = ['src/', 'scripts/', 'docs/', '.github/', '.claude/'];

/**
 * The paths no tree holds at rest (plan D6, D29, D44): the two sentinels an item creates and deletes, and the owner's
 * local settings file, never committed. Read from the guard, so a renamed one makes its old name in a document fail.
 */
export const NEVER_IN_TREE = new Set([SENTINEL, RETIRE_SENTINEL, ...OWNER_SETTINGS.filter(file => !OWNER_SETTINGS_COMMITTED.includes(file))]);

/**
 * Paths a document names before the item that creates them lands (UX-P0.30), as `{ path, item }`: skipped while the
 * item's row in docs/plans/STATUS-ux.md is not `done`, reported once it is and the path is still absent. A path under
 * `captures/` (gitignored CI downloads) is never checked: it is no prefix of `PATH_PREFIXES`.
 * @type {ReadonlyArray<{ path: string, item: string }>}
 */
export const FUTURE_PATHS = [];

/** M1: a backticked `group/name` whose group is a message group must be a request or an event. */
export function checkMessageNames(document, name, messages) {
    const groups = new Set(messages.map(message => message.split('/')[0]));
    const known = new Set(messages);
    return codeSpans(document)
        .filter(span => /^[A-Za-z][\w-]*\/[A-Za-z][\w-]*$/.test(span) && groups.has(span.split('/')[0]) && !known.has(span))
        .map(span => `${name}: \`${span}\` is no request or event of src/protocol/messages.ts`);
}

/** M2: "`RequestMap` (N requests" and "`EventMap` (N events" equal the sizes of the two maps. */
export function checkMessageCounts(document, name, requests, events) {
    const findings = [];
    for (const [pattern, expected, what] of [[/`RequestMap` \((\d+) requests/g, requests, 'requests'], [/`EventMap` \((\d+) events/g, events, 'events']]) {
        for (const match of document.matchAll(pattern)) {
            if (Number(match[1]) !== expected) {
                findings.push(`${name}: says ${match[1]} ${what}, src/protocol/messages.ts has ${expected}`);
            }
        }
    }
    return findings;
}

/** The rows of the Markdown table whose header line is `header`, each as its trimmed cells. */
export function tableRows(document, header) {
    const lines = document.split(/\r?\n/);
    const start = lines.findIndex(line => line.trim() === header);
    if (start < 0) {
        return undefined;
    }
    const rows = [];
    for (const line of lines.slice(start + 2)) {
        if (!line.trim().startsWith('|')) {
            break;
        }
        rows.push(line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(cell => cell.trim()));
    }
    return rows;
}

/** A cell's text without the code span or the bold markup around it. */
const unquote = cell => {
    const text = cell.trim();
    const wrapped = /^`([^`]*)`$/.exec(text) ?? /^\*\*(.*)\*\*$/.exec(text);
    return (wrapped ? wrapped[1] : text).trim();
};

/** The contributed settings of the manifest as `[key, schema]`. */
export function contributedSettings(manifest) {
    const configuration = manifest.contributes?.configuration ?? [];
    return (Array.isArray(configuration) ? configuration : [configuration]).flatMap(block => Object.entries(block.properties ?? {}));
}

/** S1: the README settings table has one row per contributed setting with its default; a deprecated one says so. */
export function checkSettingsTable(readme, manifest) {
    const rows = tableRows(readme, '| Setting | Default | Description |');
    if (rows === undefined) {
        return ['README.md: no table with the header "| Setting | Default | Description |"'];
    }
    const findings = [];
    const settings = new Map(contributedSettings(manifest));
    const listed = new Map(rows.map(row => [unquote(row[0]), row]));
    for (const [key, schema] of settings) {
        const row = listed.get(key);
        if (row === undefined) {
            findings.push(`README.md: the settings table has no row for ${key}`);
            continue;
        }
        if (unquote(row[1]) !== String(schema.default)) {
            findings.push(`README.md: ${key} defaults to ${String(schema.default)}, the table says ${unquote(row[1])}`);
        }
        if ((schema.deprecationMessage || schema.markdownDeprecationMessage) && !/Deprecated/.test(row[2] ?? '')) {
            findings.push(`README.md: ${key} is deprecated in the manifest; its row does not say so`);
        }
    }
    for (const key of listed.keys()) {
        if (!settings.has(key)) {
            findings.push(`README.md: the settings table lists ${key}, which the manifest does not contribute`);
        }
    }
    return findings;
}

/** The `nuiget.*` identifiers the manifest uses in `when` clauses (context keys and settings). */
export function contextKeys(manifest) {
    const keys = new Set();
    const visit = value => {
        if (Array.isArray(value)) {
            value.forEach(visit);
        } else if (value && typeof value === 'object') {
            for (const [key, child] of Object.entries(value)) {
                if ((key === 'when' || key === 'enablement') && typeof child === 'string') {
                    for (const match of child.matchAll(/\bnuiget\.[\w.]+/g)) {
                        keys.add(match[0].replace(/^config\./, ''));
                    }
                } else {
                    visit(child);
                }
            }
        }
    };
    visit(manifest.contributes ?? {});
    return keys;
}

const STORAGE_KEYS = ['nuiget.sdkVersionCache', 'nuiget.sdkVersionCache.v2'];
const STORAGE_PREFIXES = ['nuiget.cache.'];

/**
 * S2: every backticked `nuiget.*` name is a contributed setting, command, view or view container, a context key of a
 * `when` clause, or a storage key.
 */
export function checkNuigetNames(document, name, manifest) {
    const known = new Set([
        ...contributedSettings(manifest).map(([key]) => key),
        ...(manifest.contributes?.commands ?? []).map(command => command.command),
        ...Object.values(manifest.contributes?.views ?? {}).flat().map(view => view.id),
        ...Object.values(manifest.contributes?.viewsContainers ?? {}).flat().map(container => container.id),
        ...contextKeys(manifest),
        ...STORAGE_KEYS,
    ]);
    return codeSpans(document)
        .flatMap(span => [...span.matchAll(/\bnuiget\.[A-Za-z][\w.]*/g)].map(match => match[0]))
        .filter(token => !STORAGE_PREFIXES.some(prefix => token.startsWith(prefix)))
        .map(token => token.replace(/\.$/, ''))
        .filter(token => !known.has(token))
        .map(token => `${name}: \`${token}\` is no contributed setting, command, view, context key or storage key`);
}

/** The commands a user can run from the palette: those without a `commandPalette` entry whose `when` is `false`. */
export function paletteCommands(manifest) {
    const hidden = new Set((manifest.contributes?.menus?.commandPalette ?? []).filter(entry => entry.when === 'false').map(entry => entry.command));
    return (manifest.contributes?.commands ?? []).filter(command => !hidden.has(command.command));
}

/** C1: the README commands table names every palette command by its title, and no other. */
export function checkCommandsTable(readme, manifest) {
    const rows = tableRows(readme, '| Command | Description |');
    if (rows === undefined) {
        return ['README.md: no table with the header "| Command | Description |"'];
    }
    const findings = [];
    const listed = new Set(rows.map(row => unquote(row[0])));
    const titles = new Set();
    for (const command of paletteCommands(manifest)) {
        const names = [command.title, command.category ? `${command.category}: ${command.title}` : undefined].filter(Boolean);
        names.forEach(title => titles.add(title));
        if (!names.some(title => listed.has(title))) {
            findings.push(`README.md: the commands table does not list "${names.at(-1)}" (${command.command})`);
        }
    }
    for (const title of listed) {
        if (!titles.has(title)) {
            findings.push(`README.md: the commands table lists "${title}", which is no command of the palette`);
        }
    }
    return findings;
}

/** The paths of the `### Module map` table, each cell expanded. */
export function moduleMapPaths(architecture) {
    const map = section(architecture, /^### Module map/);
    const rows = map === undefined ? undefined : tableRows(map, '| Path | Role | Since |');
    return rows?.map(row => ({ cell: unquote(row[0]), paths: pathsOf(unquote(row[0])) }));
}

/** P1 and P2: every path of the module map exists, and every 2.0 module has a row of its own. */
export function checkModuleMap(architecture, exists, required) {
    const rows = moduleMapPaths(architecture);
    if (rows === undefined) {
        return ['ARCHITECTURE.md: no "### Module map" table with the header "| Path | Role | Since |"'];
    }
    const findings = [];
    for (const { cell, paths } of rows) {
        for (const candidate of paths) {
            if (!exists(candidate)) {
                findings.push(`ARCHITECTURE.md: the module map names ${candidate} (${cell}), which does not exist`);
            }
        }
    }
    const listed = rows.flatMap(row => row.paths);
    for (const wanted of required) {
        if (!listed.some(candidate => candidate === wanted || candidate.startsWith(`${wanted}/`))) {
            findings.push(`ARCHITECTURE.md: the module map has no row for ${wanted}`);
        }
    }
    return findings;
}

/**
 * P3: every backticked path under `src/`, `scripts/`, `docs/`, `.github/` or `.claude/` exists; patterns, placeholders and
 * the paths of `NEVER_IN_TREE` are skipped, and so is a `future` path while `statuses` has its item other than `done`.
 * @param {string} document
 * @param {string} name
 * @param {(file: string) => boolean} exists
 * @param {{ future?: ReadonlyArray<{ path: string, item: string }>, statuses?: Map<string, string> }} [planned]
 * @returns {string[]}
 */
export function checkPaths(document, name, exists, { future = [], statuses = new Map() } = {}) {
    const findings = [];
    for (const span of new Set(codeSpans(document))) {
        if (!PATH_PREFIXES.some(prefix => span.startsWith(prefix)) || /\s/.test(span)) {
            continue;
        }
        for (const candidate of pathsOf(span)) {
            if (/[*<>?]/.test(candidate) || candidate.includes('…') || NEVER_IN_TREE.has(candidate) || exists(candidate)) {
                continue;
            }
            const planned = future.find(entry => entry.path === candidate);
            if (planned === undefined) {
                findings.push(`${name}: \`${span}\` names ${candidate}, which does not exist`);
            } else if (statuses.get(planned.item) === 'done') {
                findings.push(`${name}: \`${span}\` names ${candidate}, which ${planned.item} creates; ${planned.item} is done and the path does not exist`);
            }
        }
    }
    return findings;
}

/** The rule ids the Design System defines: its `| DS-…-n |` rows (a row `DS-GRID-2` covers the cited parts `DS-GRID-2a`, `-2b`). */
export const ruleIds = designSystem => new Set([...designSystem.matchAll(/^\| (DS-[A-Z]+-\d+)[a-z]? \|/gm)].map(match => match[1]));

/** R1: every `DS-*` id a document cites (`DS-HEIGHT-1..11` and `DS-STATE-1/2` expanded) is a rule row of the Design System. */
export function checkRuleIds(document, name, defined) {
    return [...new Set(expandIds(document))]
        .filter(id => !defined.has(id.replace(/[a-z]$/, '')))
        .map(id => `${name}: \`${id}\` is no rule of docs/design/design-system.md`);
}

/** The status of each item row of the UX tracker (`| ID | Phase | Item | Status | … |`), by item id. */
export function trackerStatuses(tracker) {
    const rows = tableRows(tracker, '| ID | Phase | Item | Status | Commit | Date | Notes |') ?? [];
    return new Map(rows.map(cells => [cells[0], cells[3]]));
}

/** The request and event names of `src/protocol/messages.ts`, read with the TypeScript compiler. */
export function messageNames(file) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const names = mapName => {
        const declaration = source.statements.find(statement => ts.isInterfaceDeclaration(statement) && statement.name.text === mapName);
        if (!declaration) {
            throw new Error(`interface ${mapName} not found in ${file}`);
        }
        return declaration.members.map(member => member.name.text);
    };
    return { requests: names('RequestMap'), events: names('EventMap') };
}

/** The 2.0 modules that must each have a row of the module map. */
export function requiredModules(root) {
    const core = path.join(root, 'src', 'core');
    const directories = ts.sys.getDirectories(core).filter(directory => !directory.startsWith('_') && !directory.startsWith('.'));
    return [
        'src/protocol', 'src/core/contracts.ts', ...directories.map(directory => `src/core/${directory}`),
        'src/host', 'src/extension.ts', 'src/webview/shared', 'src/webview/main', 'src/webview/sidebar',
    ];
}

export function checkRepository(root = repoRoot) {
    const read = file => readFileSync(path.join(root, file), 'utf8');
    const exists = file => existsSync(path.join(root, file));
    const manifest = JSON.parse(read('package.json'));
    const { requests, events } = messageNames(path.join(root, 'src', 'protocol', 'messages.ts'));
    const architecture = section(read('ARCHITECTURE.md'), /^## 2\.0 Architecture/);
    const gotchas = section(read('.github/copilot-instructions.md'), /^## 2\.0 gotchas/);
    const findings = [];
    if (architecture === undefined) {
        findings.push('ARCHITECTURE.md: no "## 2.0 Architecture" section');
    }
    if (gotchas === undefined) {
        findings.push('.github/copilot-instructions.md: no "## 2.0 gotchas" section');
    }
    const documents = [
        ['ARCHITECTURE.md (2.0)', architecture ?? ''],
        ['docs/ux/interaction-model.md', read('docs/ux/interaction-model.md')],
        ['.github/copilot-instructions.md (2.0 gotchas)', gotchas ?? ''],
        ['README.md', read('README.md')],
    ];
    for (const [name, text] of documents) {
        findings.push(
            ...checkMessageNames(text, name, [...requests, ...events]),
            ...checkMessageCounts(text, name, requests.length, events.length),
            ...checkNuigetNames(text, name, manifest),
            ...checkPaths(text, name, exists),
        );
    }
    // The UX documents (UX-P0.30): their paths, with the planned ones of FUTURE_PATHS, and the rule ids they cite. The
    // plan's own paths are not checked (most name outputs of later items); its rule ids are.
    const designSystem = read('docs/design/design-system.md');
    const defined = ruleIds(designSystem);
    const planned = { future: FUTURE_PATHS, statuses: trackerStatuses(read('docs/plans/STATUS-ux.md')) };
    for (const file of ['docs/plans/RUN-ux.md', 'docs/design/design-system.md', 'docs/design/judge-rubric.md']) {
        findings.push(...checkPaths(read(file), file, exists, planned));
    }
    for (const file of ['docs/plans/2026-10-23-nuiget-ux-execution-plan.md', 'docs/plans/RUN-ux.md', 'src/test/ui/v2/measure.ts', 'docs/design/judge-rubric.md']) {
        findings.push(...checkRuleIds(read(file), file, defined));
    }
    const readme = read('README.md');
    findings.push(...checkSettingsTable(readme, manifest), ...checkCommandsTable(readme, manifest));
    if (architecture !== undefined) {
        findings.push(...checkModuleMap(architecture, exists, requiredModules(root)));
    }
    return findings;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const findings = checkRepository();
    for (const finding of findings) {
        console.error(finding);
    }
    console.log(findings.length === 0 ? 'docs:check — the documents agree with the tree.' : `docs:check — ${findings.length} finding(s).`);
    process.exitCode = findings.length === 0 ? 0 : 1;
}
