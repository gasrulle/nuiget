import { describe, expect, it, vi } from 'vitest';
import type { OutboundPolicy } from '../contracts';
import type { PackageMetadataLite } from '../../protocol/domain';
import { DefaultMetadataEnricher } from './enricher';
import { silentLogger } from './testSupport';
import type { IconResolver, ResolvedSource, VulnerabilityClient, VulnerabilityOutcome } from './types';

const allowAll: OutboundPolicy = { allowedSourcesFor: (_id, candidates) => candidates };

function source(name: string): ResolvedSource {
    return { source: { name, url: `https://${name}.example/v3/index.json`, enabled: true }, endpoints: { searchQueryService: `https://${name}.example/query` } };
}

/** `lookup` answers per `<source name>/<id>`; anything else is unknown. */
function search(answers: Record<string, PackageMetadataLite | Error>) {
    return {
        lookup: vi.fn(async (src: ResolvedSource, id: string, _signal?: AbortSignal): Promise<PackageMetadataLite | undefined> => {
            const answer = answers[`${src.source.name}/${id}`];
            if (answer instanceof Error) {
                throw answer;
            }
            return answer;
        }),
    };
}

function icons(map: Record<string, string> = {}): IconResolver & { icon: ReturnType<typeof vi.fn> } {
    return { icon: vi.fn(async (_sources: ResolvedSource[], id: string) => map[id]) };
}

function vulnerabilities(map: Record<string, VulnerabilityOutcome> = {}): VulnerabilityClient & { forPackage: ReturnType<typeof vi.fn> } {
    return {
        forPackage: vi.fn(async (_sources: ResolvedSource[], id: string) => map[id] ?? { vulnerabilities: [], sourcesUnavailable: false }),
        clear: vi.fn(),
    };
}

function enricher(lookup = search({}), iconResolver = icons(), vulnerabilityClient = vulnerabilities(), policy: OutboundPolicy = allowAll): DefaultMetadataEnricher {
    return new DefaultMetadataEnricher({ policy, logger: silentLogger }, lookup, iconResolver, vulnerabilityClient);
}

describe('DefaultMetadataEnricher', () => {
    it('echoes the asked id and version on every entry', async () => {
        const lookup = search({ 'a/Contoso.Lib': { id: 'contoso.lib', version: '9.9.9', authors: 'Ada' } });

        const entries = await enricher(lookup).enrich([source('a')], [{ id: 'Contoso.Lib', version: '1.0.0' }, { id: 'Unknown', version: '2.0.0' }]);

        expect(entries).toEqual([
            { id: 'Contoso.Lib', version: '1.0.0', authors: 'Ada', vulnerabilities: [] },
            { id: 'Unknown', version: '2.0.0', vulnerabilities: [] },
        ]);
    });

    it('takes verified, authors and description from the first allowed source that knows the id, in source order', async () => {
        const lookup = search({
            'b/Lib': { id: 'Lib', version: '1.0.0', verified: true, authors: 'From B', description: 'B' },
            'c/Lib': { id: 'Lib', version: '1.0.0', verified: false, authors: 'From C', description: 'C' },
        });

        const [entry] = await enricher(lookup).enrich([source('a'), source('b'), source('c')], [{ id: 'Lib', version: '1.0.0' }]);

        expect(entry).toMatchObject({ verified: true, authors: 'From B', description: 'B' });
        expect(lookup.lookup.mock.calls.map(call => (call[0] as ResolvedSource).source.name)).toEqual(['a', 'b']);
        const [unverified] = await enricher(search({ 'a/Lib': { id: 'Lib', version: '1.0.0', verified: false } })).enrich([source('a')], [{ id: 'Lib', version: '1.0.0' }]);
        expect(unverified.verified).toBe(false);
    });

    it('asks lookup only of sources the policy allows and still resolves the icon and vulnerabilities', async () => {
        const lookup = search({ 'public/Contoso.Lib': { id: 'Contoso.Lib', version: '1.0.0', authors: 'Leaked' } });
        const iconResolver = icons({ 'Contoso.Lib': 'data:image/png;base64,AAAA' });
        const known = vulnerabilities({ 'Contoso.Lib': { vulnerabilities: [{ advisoryUrl: 'https://advisories.example/1', severity: 'High' }], sourcesUnavailable: false } });
        const privateOnly: OutboundPolicy = { allowedSourcesFor: (_id, candidates) => candidates.filter(candidate => candidate.name === 'private') };
        const sources = [source('public'), source('private')];
        const signal = new AbortController().signal;

        const [entry] = await enricher(lookup, iconResolver, known, privateOnly).enrich(sources, [{ id: 'Contoso.Lib', version: '1.0.0' }], signal);

        expect(lookup.lookup.mock.calls.map(call => (call[0] as ResolvedSource).source.name)).toEqual(['private']);
        expect(entry).toEqual({ id: 'Contoso.Lib', version: '1.0.0', iconUrl: 'data:image/png;base64,AAAA', vulnerabilities: [{ advisoryUrl: 'https://advisories.example/1', severity: 'High' }] });
        expect(iconResolver.icon).toHaveBeenCalledWith(sources, 'Contoso.Lib', '1.0.0', signal);
        expect(known.forPackage).toHaveBeenCalledWith(sources, 'Contoso.Lib', '1.0.0', signal);
    });

    it('leaves vulnerabilities absent when the data was unavailable and [] when none apply', async () => {
        const known = vulnerabilities({ Partial: { vulnerabilities: [{ advisoryUrl: 'https://advisories.example/2', severity: 'Low' }], sourcesUnavailable: true } });

        const [partial, clean] = await enricher(search({}), icons(), known).enrich([source('a')], [{ id: 'Partial', version: '1.0.0' }, { id: 'Clean', version: '1.0.0' }]);

        expect(partial).not.toHaveProperty('vulnerabilities');
        expect(clean.vulnerabilities).toEqual([]);
    });

    it('one failing package yields a bare entry and the others are enriched', async () => {
        const lookup = search({ 'a/Broken': new Error('boom'), 'a/Fine': { id: 'Fine', version: '1.0.0', authors: 'Ada' } });

        const entries = await enricher(lookup, icons({ Broken: 'data:image/png;base64,AAAA', Fine: 'data:image/png;base64,BBBB' })).enrich([source('a')], [{ id: 'Broken', version: '1.0.0' }, { id: 'Fine', version: '2.0.0' }]);

        expect(entries).toEqual([
            { id: 'Broken', version: '1.0.0' },
            { id: 'Fine', version: '2.0.0', authors: 'Ada', iconUrl: 'data:image/png;base64,BBBB', vulnerabilities: [] },
        ]);
    });
});
