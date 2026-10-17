import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import type { NuGetSource } from '../../protocol/domain';
import { DefaultOutboundPolicy, matchMapping, mergeConfigChain, NuGetConfigReader, parseListSourceOutput } from './index';

const publicFeed: NuGetSource = { name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true };
const privateFeed: NuGetSource = { name: 'Private Feed', url: 'https://feed.example/v3/index.json', enabled: true };
const partnerFeed: NuGetSource = { name: 'Partner', url: 'https://partner.example/v3/index.json', enabled: true };
const candidates = [publicFeed, privateFeed, partnerFeed];

const mappingOf = (entries: Record<string, string[]>) => new Map(Object.entries(entries).map(([source, patterns]) => [source.toLowerCase(), patterns]));
const names = (sources: NuGetSource[]) => sources.map(source => source.name);
const allowed = (entries: Record<string, string[]>, packageId: string, from = candidates) => names(new DefaultOutboundPolicy(mappingOf(entries)).allowedSourcesFor(packageId, from));

/** Compared host by host: a substring test would also accept `nuget.org.example`. */
function isPublicGalleryHost(url: string): boolean {
    const host = new URL(url).hostname;
    return host === 'api.nuget.org' || host === 'www.nuget.org' || host === 'nuget.org';
}

describe('DefaultOutboundPolicy', () => {
    it('mapping: exact id beats a prefix pattern of the same length', () => {
        // "contoso.core" as an id and "contoso.cor*" as a prefix both have twelve characters before the star.
        expect(allowed({ 'nuget.org': ['Contoso.Cor*'], 'Private Feed': ['Contoso.Core'] }, 'Contoso.Core')).toEqual(['Private Feed']);
        expect(allowed({ 'nuget.org': ['Contoso.Core*'], 'Private Feed': ['Contoso.Core'] }, 'Contoso.Core')).toEqual(['Private Feed']);
        expect(allowed({ 'nuget.org': ['Contoso.Core*'], 'Private Feed': ['Contoso.Core'] }, 'Contoso.Core.Extensions')).toEqual(['nuget.org']);
    });

    it('mapping: longer prefix beats shorter prefix', () => {
        const mapping = { 'nuget.org': ['Contoso.*'], 'Private Feed': ['Contoso.Internal.*'], Partner: ['Con*'] };
        expect(allowed(mapping, 'Contoso.Internal.Billing')).toEqual(['Private Feed']);
        expect(allowed(mapping, 'Contoso.Public')).toEqual(['nuget.org']);
        expect(allowed(mapping, 'Consul')).toEqual(['Partner']);
    });

    it('mapping: * matches when nothing else does', () => {
        const mapping = { 'nuget.org': ['*'], 'Private Feed': ['Contoso.*'] };
        expect(allowed(mapping, 'Newtonsoft.Json')).toEqual(['nuget.org']);
        expect(allowed(mapping, 'Contoso.Core')).toEqual(['Private Feed']);
    });

    it('mapping: ties allow every source that declares the pattern', () => {
        expect(allowed({ 'nuget.org': ['Shared.*', '*'], 'Private Feed': ['Shared.*'], Partner: ['Sha*'] }, 'Shared.Kernel')).toEqual(['nuget.org', 'Private Feed']);
    });

    it('mapping: configured mapping with no matching pattern yields no source', () => {
        expect(allowed({ 'Private Feed': ['Contoso.*'] }, 'Newtonsoft.Json')).toEqual([]);
        // A mapping that was configured and then emptied allows nothing.
        expect(names(new DefaultOutboundPolicy(new Map()).allowedSourcesFor('Newtonsoft.Json', candidates))).toEqual([]);
    });

    it('mapping: winning pattern whose sources are disabled yields no source (no fallback)', () => {
        const mapping = { 'nuget.org': ['*'], 'Private Feed': ['Contoso.*'], Missing: ['Fabrikam.*'] };
        const withDisabledPrivate = [publicFeed, { ...privateFeed, enabled: false }, partnerFeed];
        expect(allowed(mapping, 'Contoso.Core', withDisabledPrivate)).toEqual([]);
        // The winner names a source that is not among the candidates at all.
        expect(allowed(mapping, 'Fabrikam.Tools')).toEqual([]);
        expect(allowed(mapping, 'Newtonsoft.Json', withDisabledPrivate)).toEqual(['nuget.org']);
    });

    it('mapping: ids and patterns compare case-insensitively', () => {
        expect(allowed({ 'PRIVATE FEED': ['CONTOSO.*'], 'nuget.org': ['*'] }, 'contoso.core')).toEqual(['Private Feed']);
        expect(allowed({ 'private feed': ['contoso.core'] }, 'CONTOSO.CORE')).toEqual(['Private Feed']);
    });

    it('mapping: a pattern with * not at the end is ignored', () => {
        expect(allowed({ 'Private Feed': ['*.Core', 'Con*oso', '*Contoso*', ''], 'nuget.org': ['*'] }, 'Contoso.Core')).toEqual(['nuget.org']);
        expect(Array.from(matchMapping(mappingOf({ a: ['*.Core'] }), 'Contoso.Core'))).toEqual([]);
    });

    it('mapping: without a mapping every enabled candidate is allowed', () => {
        expect(names(new DefaultOutboundPolicy().allowedSourcesFor('Anything', candidates))).toEqual(['nuget.org', 'Private Feed', 'Partner']);
        expect(new DefaultOutboundPolicy().allowedSourcesFor('Anything', [])).toEqual([]);
    });

    it('mapping: disabled candidates are never returned', () => {
        const mixed = [{ ...publicFeed, enabled: false }, privateFeed];
        expect(names(new DefaultOutboundPolicy().allowedSourcesFor('Anything', mixed))).toEqual(['Private Feed']);
        expect(allowed({ 'nuget.org': ['*'], 'Private Feed': ['*'] }, 'Anything', mixed)).toEqual(['Private Feed']);
    });

    it('returns the candidates themselves, in the order given', () => {
        const result = new DefaultOutboundPolicy(mappingOf({ partner: ['*'], 'nuget.org': ['*'] })).allowedSourcesFor('X', candidates);
        expect(result).toEqual([publicFeed, partnerFeed]);
        expect(result[0]).toBe(publicFeed);
    });

    it('private-only configuration never yields nuget.org', () => {
        const reader = new NuGetConfigReader({ env: {} });
        const far = reader.parse('<configuration><packageSources><add key="nuget.org" value="https://api.nuget.org/v3/index.json" /></packageSources></configuration>', path.join('home', 'NuGet.Config'));
        const near = reader.parse(`<configuration>
            <packageSources><clear /><add key="Private Feed" value="https://feed.example/v3/index.json" /></packageSources>
            <packageSourceMapping><packageSource key="Private Feed"><package pattern="*" /></packageSource></packageSourceMapping>
        </configuration>`, path.join('repo', 'nuget.config'));
        const merged = mergeConfigChain([near, far]);

        // What the chain declares.
        expect(Array.from(merged.sources.values()).map(source => source.key)).toEqual(['Private Feed']);
        expect(Array.from(merged.sources.values()).some(source => isPublicGalleryHost(source.url))).toBe(false);

        // What the policy lets through, even when a caller offers the public gallery as a candidate.
        const policy = new DefaultOutboundPolicy(merged.mapping);
        for (const packageId of ['Newtonsoft.Json', 'Contoso.Core', 'nuget.org', 'x']) {
            const sources = policy.allowedSourcesFor(packageId, [publicFeed, privateFeed]);
            expect(names(sources)).toEqual(['Private Feed']);
            expect(sources.some(source => isPublicGalleryHost(source.url))).toBe(false);
        }

        // What the CLI lists for such a configuration (the tracked SDK 10 capture).
        const listed = parseListSourceOutput(fs.readFileSync(path.join(__dirname, '__fixtures__', 'list-source', '10.0.401.txt'), 'utf-8'));
        expect(listed.length).toBe(3);
        expect(listed.filter(source => !source.isLocal).some(source => isPublicGalleryHost(source.url))).toBe(false);
        expect(isPublicGalleryHost(publicFeed.url)).toBe(true);
        expect(isPublicGalleryHost('https://nuget.org.example/v3/index.json')).toBe(false);
    });
});
