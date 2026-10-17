import { describe, expect, it } from 'vitest';
import {
    checkCommandsTable,
    checkMessageCounts,
    checkMessageNames,
    checkModuleMap,
    checkNuigetNames,
    checkPaths,
    checkRepository,
    checkSettingsTable,
    expandBraces,
    pathsOf,
    section,
} from '../../../scripts/check-docs-drift.mjs';

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

    it('reads a section to the next heading of its level and expands brace groups', () => {
        expect(section('# A\n## 2.0 Architecture (x)\ntext\n### Sub\nmore\n## Next\nno', /^## 2\.0 Architecture/)).toBe('## 2.0 Architecture (x)\ntext\n### Sub\nmore');
        expect(expandBraces('src/{a,b}/{c,d}.ts')).toEqual(['src/a/c.ts', 'src/a/d.ts', 'src/b/c.ts', 'src/b/d.ts']);
        expect(pathsOf('src/core/**')).toEqual(['src/core']);
        expect(pathsOf('src/host/handlers.ts:295')).toEqual(['src/host/handlers.ts']);
    });
});
