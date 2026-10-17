import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { mergeConfigChain, NuGetConfigReader, withConfigFiles } from './index';

const reader = new NuGetConfigReader({ env: {} });
const nearPath = path.join('repo', 'src', 'nuget.config');
const midPath = path.join('repo', 'nuget.config');
const farPath = path.join('home', 'NuGet.Config');
const config = (body: string, file: string) => reader.parse(`<configuration>${body}</configuration>`, file);

describe('mergeConfigChain', () => {
    it('merge: a nearer file replaces the patterns of the same source key', () => {
        const far = config('<packageSourceMapping><packageSource key="Feed"><package pattern="Contoso.*" /><package pattern="Fabrikam.*" /></packageSource><packageSource key="Other"><package pattern="*" /></packageSource></packageSourceMapping>', farPath);
        const near = config('<packageSourceMapping><packageSource key="FEED"><package pattern="Contoso.Core" /></packageSource></packageSourceMapping>', nearPath);
        const { mapping } = mergeConfigChain([near, far]);
        // Not a union: Fabrikam.* is gone for this source, and the other source is untouched.
        expect(Object.fromEntries(mapping ?? [])).toEqual({ feed: ['Contoso.Core'], other: ['*'] });
    });

    it.each([
        ['packageSources', (body: string) => `<packageSources>${body}</packageSources>`, (name: string) => `<add key="${name}" value="https://${name}.example/v3/index.json" />`],
        ['disabledPackageSources', (body: string) => `<disabledPackageSources>${body}</disabledPackageSources>`, (name: string) => `<add key="${name}" value="true" />`],
        ['packageSourceCredentials', (body: string) => `<packageSourceCredentials>${body}</packageSourceCredentials>`, (name: string) => `<${name}><add key="Username" value="u" /><add key="ClearTextPassword" value="p" /></${name}>`],
        ['packageSourceMapping', (body: string) => `<packageSourceMapping>${body}</packageSourceMapping>`, (name: string) => `<packageSource key="${name}"><package pattern="*" /></packageSource>`],
    ])('merge: <clear /> discards farther files and earlier elements of the same file (%s)', (sectionName, wrap, item) => {
        const far = config(wrap(item('far')), farPath);
        const mid = config(wrap(`${item('before')}<clear />${item('after')}`), midPath);
        const near = config(wrap(item('near')), nearPath);
        const merged = mergeConfigChain([near, mid, far]);
        const keys = {
            packageSources: Array.from(merged.sources.keys()),
            disabledPackageSources: Array.from(merged.disabled),
            packageSourceCredentials: Array.from(merged.credentials.keys()),
            packageSourceMapping: Array.from(merged.mapping?.keys() ?? []),
        }[sectionName];
        expect(keys?.sort()).toEqual(['after', 'near']);
        // Without the clear, everything accumulates.
        const plain = mergeConfigChain([near, config(wrap(`${item('before')}${item('after')}`), midPath), far]);
        expect(plain.sources.size + plain.disabled.size + plain.credentials.size + (plain.mapping?.size ?? 0)).toBe(4);
    });

    it('merge: configFile is the nearest declaring file', () => {
        const far = config('<packageSources><add key="Shared" value="https://old.example/v3/index.json" /><add key="FarOnly" value="https://far.example/v3/index.json" /></packageSources><packageSourceCredentials><Shared><add key="Username" value="far-user" /><add key="ClearTextPassword" value="far" /></Shared></packageSourceCredentials>', farPath);
        const near = config('<packageSources><add key="shared" value="https://new.example/v3/index.json" /></packageSources><packageSourceCredentials><shared><add key="Username" value="near-user" /><add key="Password" value="QUJD" /></shared></packageSourceCredentials>', nearPath);
        const merged = mergeConfigChain([near, far]);
        expect(merged.sources.get('shared')).toEqual({ key: 'shared', url: 'https://new.example/v3/index.json', configFile: nearPath });
        expect(merged.sources.get('faronly')).toEqual({ key: 'FarOnly', url: 'https://far.example/v3/index.json', configFile: farPath });
        // The nearer credential replaces the farther one whole.
        expect(merged.credentials.get('shared')).toEqual({ username: 'near-user', password: 'QUJD', passwordKind: 'encrypted', configFile: nearPath });

        const listed = [{ name: 'Shared', url: 'https://new.example/v3/index.json', enabled: true }, { name: 'Unknown', url: 'https://x.example/', enabled: false }];
        expect(withConfigFiles(listed, merged)).toEqual([{ ...listed[0], configFile: nearPath }, listed[1]]);
        expect(listed[0]).not.toHaveProperty('configFile');
    });

    it('merge: mapping is undefined without a packageSourceMapping element and empty when it is cleared', () => {
        const sourcesOnly = config('<packageSources><add key="Feed" value="https://feed.example/v3/index.json" /></packageSources>', farPath);
        expect(mergeConfigChain([sourcesOnly]).mapping).toBeUndefined();
        expect('mapping' in mergeConfigChain([])).toBe(false);

        const far = config('<packageSourceMapping><packageSource key="Feed"><package pattern="*" /></packageSource></packageSourceMapping>', farPath);
        const cleared = mergeConfigChain([config('<packageSourceMapping><clear /></packageSourceMapping>', nearPath), far]);
        expect(cleared.mapping).toBeInstanceOf(Map);
        expect(cleared.mapping?.size).toBe(0);
        expect(mergeConfigChain([config('<packageSourceMapping />', nearPath)]).mapping?.size).toBe(0);
    });

    it('lets a nearer file re-enable a source that a farther file disabled', () => {
        const far = config('<disabledPackageSources><add key="Feed" value="true" /><add key="Other" value="true" /></disabledPackageSources>', farPath);
        const near = config('<disabledPackageSources><add key="feed" value="false" /></disabledPackageSources>', nearPath);
        expect(Array.from(mergeConfigChain([near, far]).disabled)).toEqual(['other']);
    });
});
