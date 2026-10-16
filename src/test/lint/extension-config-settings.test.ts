import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ExtensionConfig } from '../../protocol';

/**
 * P5.13: what the 2.0 surfaces read as settings (`ExtensionConfig`, built by `readExtensionConfig` in
 * `src/host/services.ts`) is what the manifest contributes. A key that no setting backs, a `searchDebounceMode` value
 * that the manifest does not offer (finding N57: 2.0 once expected `fullsearch` while the manifest offers `full`), or
 * a deprecated setting that 2.0 still reads fails here.
 */
interface SettingSchema { enum?: string[]; deprecationMessage?: string }

const manifest = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
    contributes: { configuration: { properties: Record<string, SettingSchema> } };
};
const settings = manifest.contributes.configuration.properties;

// `satisfies`: tsc fails here when the interface gains a key or loses one, so the list below cannot fall behind it.
const CONFIG = { searchDebounceMode: 'quicksearch', quickSearchResultsPerSource: 5, searchResultLimit: 20, enablePerformanceLogging: false, treeIndent: 8, isWindows: false } satisfies ExtensionConfig;

/** Keys of `ExtensionConfig` that no `nuiget.*` setting backs: `workbench.tree.indent` and the platform. */
const NOT_SETTINGS = new Set<keyof ExtensionConfig>(['treeIndent', 'isWindows']);

const settingKeys = (Object.keys(CONFIG) as Array<keyof ExtensionConfig>).filter(key => !NOT_SETTINGS.has(key));

describe('ExtensionConfig and the contributed settings', () => {
    it('ExtensionConfig keys ⊆ contributed settings', () => {
        expect(settingKeys.length).toBeGreaterThan(0);
        expect(settingKeys.filter(key => settings[`nuiget.${key}`] === undefined)).toEqual([]);
    });

    it('searchDebounceMode values equal the contributed enum', () => {
        const values = ['quicksearch', 'full', 'off'] as const satisfies readonly ExtensionConfig['searchDebounceMode'][];
        expect([...values].sort()).toEqual([...(settings['nuiget.searchDebounceMode'].enum ?? [])].sort());
    });

    it('contributes no deprecated setting', () => {
        const deprecated = Object.keys(settings).filter(name => settings[name].deprecationMessage !== undefined);
        expect(deprecated).toEqual([]);
    });
});
