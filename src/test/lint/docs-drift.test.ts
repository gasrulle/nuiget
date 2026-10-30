import { describe, expect, it } from 'vitest';
import {
    checkCommandsTable,
    checkMessageCounts,
    checkMessageNames,
    checkModuleMap,
    checkNuigetNames,
    checkPaths,
    checkRepository,
    checkRuleIds,
    checkSettingsTable,
    expandBraces,
    NEVER_IN_TREE,
    pathsOf,
    ruleIds,
    section,
    trackerStatuses,
} from '../../../scripts/check-docs-drift.mjs';
import { OWNER_SETTINGS, OWNER_SETTINGS_COMMITTED, RETIRE_SENTINEL, SENTINEL } from '../../../scripts/hooks/guard.mjs';

const manifest = {
    contributes: {
        configuration: { properties: { 'nuiget.searchResultLimit': { default: 20 }, 'nuiget.recentSearchesLimit': { default: 5, deprecationMessage: 'gone' } } },
        commands: [
            { command: 'nuiget.openManager', title: 'nUIget: Manage NuGet Packages' },
            { command: 'nuiget.sidebar.refresh', title: 'nUIget: Refresh Sidebar' },
        ],
        menus: { commandPalette: [{ command: 'nuiget.sidebar.refresh', when: 'false' }], 'view/title': [{ command: 'nuiget.sidebar.refresh', when: 'view == nuiget.sidebar && nuiget.restoreEnabled' }] },
        views: { nuiget: [{ id: 'nuiget.sidebar', name: 'Packages' }] },
    },
};
const settingsTable = (rows: string[]): string => ['| Setting | Default | Description |', '|---|---|---|', ...rows].join('\n');
const exists = (file: string): boolean => ['src/core/cli', 'src/core/cli/sdk.ts', 'src/host', 'src/protocol'].includes(file);

describe('docs drift check', () => {
    it('the repository documents agree with the tree', () => {
        expect(checkRepository()).toEqual([]);
    });

    it('M1: a message name of a known group that is no request or event is reported', () => {
        const text = 'Asks `ops/install`, then `ops/nothing`; `src/core` and `features/details` are paths.';
        expect(checkMessageNames(text, 'doc', ['ops/install', 'session/get'])).toEqual(['doc: `ops/nothing` is no request or event of src/protocol/messages.ts']);
    });

    it('M2: a request or event count that differs from the maps is reported', () => {
        const text = '`RequestMap` (44 requests, …) and `EventMap` (12 events)';
        expect(checkMessageCounts(text, 'doc', 44, 11)).toEqual(['doc: says 12 events, src/protocol/messages.ts has 11']);
    });

    it('S1: a missing row, a wrong default and an unmarked deprecated setting are reported, and so is a row the manifest lacks', () => {
        expect(checkSettingsTable(settingsTable(['| `nuiget.searchResultLimit` | `20` | Results |', '| `nuiget.recentSearchesLimit` | `5` | Deprecated: none |']), manifest)).toEqual([]);
        expect(checkSettingsTable(settingsTable(['| `nuiget.searchResultLimit` | `50` | Results |', '| `nuiget.recentSearchesLimit` | `5` | Recent searches |', '| `nuiget.noRestore` | `false` | Old |']), manifest)).toEqual([
            'README.md: nuiget.searchResultLimit defaults to 20, the table says 50',
            'README.md: nuiget.recentSearchesLimit is deprecated in the manifest; its row does not say so',
            'README.md: the settings table lists nuiget.noRestore, which the manifest does not contribute',
        ]);
        expect(checkSettingsTable(settingsTable(['| `nuiget.searchResultLimit` | `20` | Results |']), manifest)).toEqual(['README.md: the settings table has no row for nuiget.recentSearchesLimit']);
    });

    it('S2: a nuiget.* name that is no setting, command, view, context key or storage key is reported', () => {
        const text = '`nuiget.searchResultLimit`, `nuiget.openManager`, `nuiget.sidebar`, `nuiget.restoreEnabled`, `nuiget.cache.<kind>`, `nuiget.noRestore`';
        expect(checkNuigetNames(text, 'doc', manifest)).toEqual(['doc: `nuiget.noRestore` is no contributed setting, command, view, context key or storage key']);
    });

    it('C1: the commands table lists every palette command and no hidden or unknown one', () => {
        const table = (rows: string[]): string => ['| Command | Description |', '|---|---|', ...rows].join('\n');
        expect(checkCommandsTable(table(['| `nUIget: Manage NuGet Packages` | Open |']), manifest)).toEqual([]);
        expect(checkCommandsTable(table(['| `nUIget: Refresh Sidebar` | Refresh |']), manifest)).toEqual([
            'README.md: the commands table does not list "nUIget: Manage NuGet Packages" (nuiget.openManager)',
            'README.md: the commands table lists "nUIget: Refresh Sidebar", which is no command of the palette',
        ]);
    });

    it('P1 and P2: a module map path that does not exist and a module without a row are reported', () => {
        const map = ['### Module map', '', '| Path | Role | Since |', '| --- | --- | --- |', '| `src/core/{cli,gone}/**` | x | P1.6 |', '| `src/host/**` | y | P2.9 |'].join('\n');
        expect(checkModuleMap(map, exists, ['src/core/cli', 'src/host', 'src/protocol'])).toEqual([
            'ARCHITECTURE.md: the module map names src/core/gone (src/core/{cli,gone}/**), which does not exist',
            'ARCHITECTURE.md: the module map has no row for src/protocol',
        ]);
    });

    it('P3: a backticked path that does not exist is reported; line suffixes, patterns and placeholders are not', () => {
        const text = '`src/core/cli/sdk.ts:12-40`, `src/core/cli/<sdk>.json`, `src/**/*.test.ts`, `src/core/{cli,host}`, `src/core/nothing.ts`';
        expect(checkPaths(text, 'doc', exists)).toEqual([
            'doc: `src/core/{cli,host}` names src/core/host, which does not exist',
            'doc: `src/core/nothing.ts` names src/core/nothing.ts, which does not exist',
        ]);
    });

    it('P4 (UX-P0.30): a missing path under .claude/ is reported, the guard\'s never-in-tree paths and capture downloads are not', () => {
        const nothing = (): boolean => false;
        const [localSettings] = OWNER_SETTINGS.filter(file => !OWNER_SETTINGS_COMMITTED.includes(file));
        expect([...NEVER_IN_TREE].sort()).toEqual([SENTINEL, RETIRE_SENTINEL, localSettings].sort());
        const text = `\`${SENTINEL}\`, \`${RETIRE_SENTINEL}\`, \`${localSettings}\`, \`captures/40111706433/main-installed-single.dark-modern.1200.png\`, \`.claude/.other-sentinel\``;
        expect(checkPaths(text, 'docs/plans/RUN-ux.md', nothing)).toEqual(['docs/plans/RUN-ux.md: `.claude/.other-sentinel` names .claude/.other-sentinel, which does not exist']);
        expect(checkPaths('If a merge touches `.claude/hooks/**`, stop.', 'docs/plans/RUN-ux.md', nothing)).toEqual(['docs/plans/RUN-ux.md: `.claude/hooks/**` names .claude/hooks, which does not exist']);
    });

    it('P5 (UX-P0.30): a FUTURE_PATHS entry is skipped while its item is open and reported once the item is done', () => {
        const text = 'The artboard `docs/design/artboards/main-updates.spec.json` and `docs/design/nothing.md`.';
        const future = [{ path: 'docs/design/artboards/main-updates.spec.json', item: 'P3.1a' }];
        const tracker = ['| ID | Phase | Item | Status | Commit | Date | Notes |', '|---|---|---|---|---|---|---|', '| P3.1a | P3 | Updates tab | open |  |  |  |', '| P0.30 | P0 | Docs drift | done | abc | 2026-10-30 | note |'].join('\r\n');
        const statuses = trackerStatuses(tracker);
        expect(statuses).toEqual(new Map([['P3.1a', 'open'], ['P0.30', 'done']]));
        expect(checkPaths(text, 'doc', () => false, { future, statuses })).toEqual(['doc: `docs/design/nothing.md` names docs/design/nothing.md, which does not exist']);
        statuses.set('P3.1a', 'done');
        expect(checkPaths(text, 'doc', () => false, { future, statuses })).toEqual([
            'doc: `docs/design/artboards/main-updates.spec.json` names docs/design/artboards/main-updates.spec.json, which P3.1a creates; P3.1a is done and the path does not exist',
            'doc: `docs/design/nothing.md` names docs/design/nothing.md, which does not exist',
        ]);
    });

    it('R1 (UX-P0.30): a DS id that is no rule row of the Design System is reported; parts and ranges resolve', () => {
        const designSystem = ['| Rule | Text |', '|---|---|', '| DS-GRID-1 | ramp |', '| DS-GRID-2 | (a) blocks (b) proximity |', '| DS-HEIGHT-1 | a |', '| DS-HEIGHT-2 | b |', '| DS-HEIGHT-3 | c |'].join('\n');
        const defined = ruleIds(designSystem);
        expect([...defined]).toEqual(['DS-GRID-1', 'DS-GRID-2', 'DS-HEIGHT-1', 'DS-HEIGHT-2', 'DS-HEIGHT-3']);
        expect(checkRuleIds('`DS-GRID-2a` and DS-GRID-2b, DS-HEIGHT-1..3, DS-GRID-1/2', 'plan', defined)).toEqual([]);
        expect(checkRuleIds('DS-GRID-9 and DS-HEIGHT-1..4', 'measure.ts', defined)).toEqual([
            'measure.ts: `DS-GRID-9` is no rule of docs/design/design-system.md',
            'measure.ts: `DS-HEIGHT-4` is no rule of docs/design/design-system.md',
        ]);
    });

    it('reads a section to the next heading of its level and expands brace groups', () => {
        expect(section('# A\n## 2.0 Architecture (x)\ntext\n### Sub\nmore\n## Next\nno', /^## 2\.0 Architecture/)).toBe('## 2.0 Architecture (x)\ntext\n### Sub\nmore');
        expect(expandBraces('src/{a,b}/{c,d}.ts')).toEqual(['src/a/c.ts', 'src/a/d.ts', 'src/b/c.ts', 'src/b/d.ts']);
        expect(pathsOf('src/core/**')).toEqual(['src/core']);
        expect(pathsOf('src/host/handlers.ts:295')).toEqual(['src/host/handlers.ts']);
    });
});
