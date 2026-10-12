import type { NuGetSource } from '../../protocol/domain';
import type { ConfigCredential, ConfigSection, NuGetConfigDocument } from './NuGetConfigReader';

/** What a chain of `nuget.config` files says after merging. Keys are lower-cased names. */
export interface MergedNuGetConfig {
    sources: Map<string, { key: string; url: string; configFile: string }>;
    disabled: Set<string>;
    credentials: Map<string, ConfigCredential & { configFile: string }>;
    /** `undefined`: no file configures a mapping. An empty map: a mapping is configured and allows nothing. */
    mapping?: Map<string, string[]>;
}

/**
 * Merge a config chain given nearest first. One rule for every section: files are applied from the
 * farthest to the nearest, a keyed entry replaces an earlier entry of the same key whole, and
 * `<clear />` discards everything before it. The patterns of a source are therefore those of the
 * nearest file that declares the source, never a union.
 */
export function mergeConfigChain(documents: readonly NuGetConfigDocument[]): MergedNuGetConfig {
    const sources = new Map<string, { key: string; url: string; configFile: string }>();
    const disabled = new Map<string, boolean>();
    const credentials = new Map<string, ConfigCredential & { configFile: string }>();
    let mapping: Map<string, string[]> | undefined;

    for (const document of [...documents].reverse()) {
        apply(document.sources, sources, item => [item.key, { key: item.key, url: item.value, configFile: document.path }]);
        apply(document.disabled, disabled, item => [item.key, item.disabled]);
        apply(document.credentials, credentials, ({ name, username, password, passwordKind }) => {
            const credential: ConfigCredential & { configFile: string } = { passwordKind, configFile: document.path };
            if (username !== undefined) {
                credential.username = username;
            }
            if (password !== undefined) {
                credential.password = password;
            }
            return [name, credential];
        });
        if (document.mapping !== undefined) {
            mapping ??= new Map<string, string[]>();
            apply(document.mapping, mapping, item => [item.key, [...item.patterns]]);
        }
    }

    const merged: MergedNuGetConfig = { sources, disabled: new Set(Array.from(disabled).filter(([, isDisabled]) => isDisabled).map(([key]) => key)), credentials };
    if (mapping !== undefined) {
        merged.mapping = mapping;
    }
    return merged;
}

function apply<T, V>(section: ConfigSection<T>, accumulator: Map<string, V>, entry: (item: T) => [string, V]): void {
    for (const element of section) {
        if (element.kind === 'clear') {
            accumulator.clear();
            continue;
        }
        const [key, value] = entry(element);
        accumulator.set(key.toLowerCase(), value);
    }
}

/** Copies of `sources` that name the config file declaring each of them, where the merged chain knows it. */
export function withConfigFiles(sources: readonly NuGetSource[], merged: MergedNuGetConfig): NuGetSource[] {
    return sources.map(source => {
        const configFile = merged.sources.get(source.name.toLowerCase())?.configFile;
        return configFile === undefined ? { ...source } : { ...source, configFile };
    });
}
