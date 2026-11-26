import { describe, expect, it, vi } from 'vitest';
import type { OutboundPolicy } from '../contracts';
import type { PackageMetadataLite } from '../../protocol/domain';
import { DefaultMetadataEnricher } from './enricher';
import { silentLogger } from './testSupport';
import type { DeprecationFetch, IconResolver, RegistrationClient, ResolvedSource, VulnerabilityClient, VulnerabilityOutcome } from './types';

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
        vulnerableAmong: vi.fn(() => undefined),
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

    it('an abort mid-batch starts no further lookup and the rest of the entries stay bare', async () => {
        const controller = new AbortController();
        const lookup = search({ 'a/First': { id: 'First', version: '1.0.0', authors: 'Ada' } });
        lookup.lookup.mockImplementationOnce(async () => {
            controller.abort();
            return { id: 'First', version: '1.0.0', authors: 'Ada' };
        });
        const iconResolver = icons();
        const logger = { ...silentLogger, warn: vi.fn() };
        const subject = new DefaultMetadataEnricher({ policy: allowAll, logger }, lookup, iconResolver, vulnerabilities(), { concurrency: 1 });

        const entries = await subject.enrich([source('a')], [{ id: 'First', version: '1.0.0' }, { id: 'Second', version: '2.0.0' }, { id: 'Third', version: '3.0.0' }], controller.signal);

        expect(lookup.lookup).toHaveBeenCalledTimes(1);
        expect(iconResolver.icon).toHaveBeenCalledTimes(1);
        expect(entries.slice(1)).toEqual([{ id: 'Second', version: '2.0.0' }, { id: 'Third', version: '3.0.0' }]);
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('a lookup that fails because the request was cancelled is not logged as a failure', async () => {
        const controller = new AbortController();
        const lookup = search({});
        lookup.lookup.mockImplementation(async () => {
            controller.abort();
            throw new Error('The operation was aborted');
        });
        const logger = { ...silentLogger, warn: vi.fn() };
        const subject = new DefaultMetadataEnricher({ policy: allowAll, logger }, lookup, icons(), vulnerabilities());

        const entries = await subject.enrich([source('a')], [{ id: 'Gone', version: '1.0.0' }], controller.signal);

        expect(entries).toEqual([{ id: 'Gone', version: '1.0.0' }]);
        expect(logger.warn).not.toHaveBeenCalled();
    });
});

describe('DefaultMetadataEnricher: the vulnerability leg is bounded once per call (X33, UX-P4.9)', () => {
    const never = (): VulnerabilityClient & { forPackage: ReturnType<typeof vi.fn> } => ({ forPackage: vi.fn(() => new Promise<VulnerabilityOutcome>(() => undefined)), vulnerableAmong: vi.fn(() => undefined), clear: vi.fn() });

    it('a vulnerability read that never settles gives icons and authors at the bound, with vulnerabilities absent', async () => {
        vi.useFakeTimers();
        try {
            const lookup = search({ 'a/Lib': { id: 'Lib', version: '1.0.0', authors: 'Ada' } });
            const subject = new DefaultMetadataEnricher({ policy: allowAll, logger: silentLogger }, lookup, icons({ Lib: 'data:image/png;base64,AAAA' }), never(), { vulnerabilityWaitMs: 5_000 });
            let entries: PackageMetadataLite[] | undefined;
            const done = subject.enrich([source('a')], [{ id: 'Lib', version: '1.0.0' }]).then(result => { entries = result; });
            await vi.advanceTimersByTimeAsync(4_999);
            expect(entries).toBeUndefined();
            // The bound, then the one macrotask a read gets past it.
            await vi.advanceTimersByTimeAsync(2);
            await done;
            expect(entries).toEqual([{ id: 'Lib', version: '1.0.0', authors: 'Ada', iconUrl: 'data:image/png;base64,AAAA' }]);
            expect(entries?.[0]).not.toHaveProperty('vulnerabilities');
        } finally {
            vi.useRealTimers();
        }
    });

    it('a fast vulnerability read is unchanged and the call leaves no timer behind', async () => {
        vi.useFakeTimers();
        try {
            const entries = await enricher(search({}), icons(), vulnerabilities({ Lib: { vulnerabilities: [{ severity: 'High', advisoryUrl: 'https://example.test/a' }], sourcesUnavailable: false } })).enrich([source('a')], [{ id: 'Lib', version: '1.0.0' }]);
            expect(entries).toEqual([{ id: 'Lib', version: '1.0.0', vulnerabilities: [{ severity: 'High', advisoryUrl: 'https://example.test/a' }] }]);
            expect(vi.getTimerCount()).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });

    it('one deadline covers many packages, whatever the concurrency', async () => {
        vi.useFakeTimers();
        try {
            const subject = new DefaultMetadataEnricher({ policy: allowAll, logger: silentLogger }, search({}), icons(), never(), { concurrency: 2, vulnerabilityWaitMs: 5_000 });
            let entries: PackageMetadataLite[] | undefined;
            const done = subject.enrich([source('a')], ['A', 'B', 'C', 'D', 'E', 'F'].map(id => ({ id, version: '1.0.0' }))).then(result => { entries = result; });
            // Three rounds of two under one bound: every entry is answered at 5 s (plus one macrotask per round), not at 15 s.
            await vi.advanceTimersByTimeAsync(5_010);
            await done;
            expect(entries?.map(entry => entry.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
            expect(entries?.every(entry => !('vulnerabilities' in entry))).toBe(true);
            expect(vi.getTimerCount()).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });

    it('a package reached after the bound keeps the vulnerabilities the loaded data set answers at once', async () => {
        vi.useFakeTimers();
        try {
            const slow = {
                lookup: vi.fn((_src: ResolvedSource, id: string) => new Promise<PackageMetadataLite | undefined>(resolve => {
                    // The first package's lookup alone outlasts the bound, so the second is reached after it.
                    setTimeout(() => resolve({ id, version: '1.0.0', authors: 'Ada' }), id === 'First' ? 6_000 : 0);
                })),
            };
            // Answered from data already loaded, through the awaits the real client takes (an async read over a resolved load).
            const advisory = { severity: 'High' as const, advisoryUrl: 'https://example.test/second' };
            const known: VulnerabilityClient = {
                forPackage: vi.fn(async (_sources: ResolvedSource[], id: string) => {
                    const [loaded] = await Promise.all([Promise.resolve(id === 'Second' ? [advisory] : [])]);
                    return { vulnerabilities: loaded, sourcesUnavailable: false };
                }),
                vulnerableAmong: vi.fn(() => undefined),
                clear: vi.fn(),
            };
            const subject = new DefaultMetadataEnricher({ policy: allowAll, logger: silentLogger }, slow, icons(), known, { concurrency: 1, vulnerabilityWaitMs: 5_000 });
            const done = subject.enrich([source('a')], [{ id: 'First', version: '1.0.0' }, { id: 'Second', version: '1.0.0' }]);
            await vi.advanceTimersByTimeAsync(7_000);
            const [first, second] = await done;
            expect(first.vulnerabilities).toEqual([]);
            expect(second.vulnerabilities).toEqual([advisory]);
        } finally {
            vi.useRealTimers();
        }
    });

    it('a read that rejects after the bound is not an unhandled rejection', async () => {
        vi.useFakeTimers();
        const unhandled: unknown[] = [];
        const record = (reason: unknown): void => { unhandled.push(reason); };
        process.on('unhandledRejection', record);
        try {
            let fail!: (error: Error) => void;
            const late: VulnerabilityClient = { forPackage: vi.fn(() => new Promise<VulnerabilityOutcome>((_resolve, reject) => { fail = reject; })), vulnerableAmong: vi.fn(() => undefined), clear: vi.fn() };
            const subject = new DefaultMetadataEnricher({ policy: allowAll, logger: silentLogger }, search({}), icons(), late, { vulnerabilityWaitMs: 5_000 });
            const done = subject.enrich([source('a')], [{ id: 'Lib', version: '1.0.0' }]);
            await vi.advanceTimersByTimeAsync(5_001);
            expect(await done).toEqual([{ id: 'Lib', version: '1.0.0' }]);
            fail(new Error('the data set could not be read'));
            // Real timers for the flush: Node reports an unhandled rejection after the microtask queue drains.
            vi.useRealTimers();
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(unhandled).toEqual([]);
        } finally {
            process.off('unhandledRejection', record);
            vi.useRealTimers();
        }
    });
});

describe('DefaultMetadataEnricher: the installed version\'s deprecation (UX-P5.2a, ADR-009 d.1)', () => {
    const LEGACY = { reasons: ['Legacy'], alternatePackage: { id: 'Lib.Next', range: '*' } };
    /** `deprecation` answers per `<source name>/<id>@<version>`; anything else is missing. */
    function deprecations(answers: Record<string, DeprecationFetch | Error | 'never'>): Pick<RegistrationClient, 'deprecation'> & { deprecation: ReturnType<typeof vi.fn> } {
        return {
            deprecation: vi.fn(async (src: ResolvedSource, id: string, version: string): Promise<DeprecationFetch> => {
                const answer = answers[`${src.source.name}/${id}@${version}`];
                if (answer === 'never') {
                    return new Promise<DeprecationFetch>(() => undefined);
                }
                if (answer instanceof Error) {
                    throw answer;
                }
                return answer ?? { kind: 'missing' };
            }),
        };
    }
    const withLeg = (leg: Pick<RegistrationClient, 'deprecation'>, lookup = search({}), options: { vulnerabilityWaitMs?: number } = {}) =>
        new DefaultMetadataEnricher({ policy: allowAll, logger: silentLogger }, lookup, icons(), vulnerabilities(), { ...options, deprecations: leg });

    it('a lite entry carries the installed version\'s deprecation, not the latest version\'s', async () => {
        // The search lookup answers the latest version (2.0.0), which is not deprecated; the installed 1.0.0 is.
        const lookup = search({ 'a/Lib': { id: 'Lib', version: '2.0.0', authors: 'Ada' } });
        const leg = deprecations({ 'a/Lib@2.0.0': { kind: 'found' }, 'a/Lib@1.0.0': { kind: 'missing' }, 'b/Lib@1.0.0': { kind: 'found', deprecation: LEGACY }, 'a/Current@1.0.0': { kind: 'found' } });

        const entries = await withLeg(leg, lookup).enrich([source('a'), source('b')], [{ id: 'Lib', version: '1.0.0' }, { id: 'Current', version: '1.0.0' }]);

        expect(entries[0]).toEqual({ id: 'Lib', version: '1.0.0', authors: 'Ada', vulnerabilities: [], deprecation: LEGACY });
        expect(entries[1]).not.toHaveProperty('deprecation');
        expect(leg.deprecation.mock.calls.map(call => `${(call[0] as ResolvedSource).source.name}/${call[1]}@${call[2]}`).sort()).toEqual(['a/Current@1.0.0', 'a/Lib@1.0.0', 'b/Lib@1.0.0']);
    });

    it('past the call\'s deadline deprecation stays absent and the icon and authors are kept', async () => {
        vi.useFakeTimers();
        try {
            const lookup = search({ 'a/Lib': { id: 'Lib', version: '1.0.0', authors: 'Ada' } });
            const subject = new DefaultMetadataEnricher({ policy: allowAll, logger: silentLogger }, lookup, icons({ Lib: 'data:image/png;base64,AAAA' }), vulnerabilities(), { vulnerabilityWaitMs: 5_000, deprecations: deprecations({ 'a/Lib@1.0.0': 'never' }) });
            let entries: PackageMetadataLite[] | undefined;
            const done = subject.enrich([source('a')], [{ id: 'Lib', version: '1.0.0' }]).then(result => { entries = result; });
            await vi.advanceTimersByTimeAsync(4_999);
            expect(entries).toBeUndefined();
            await vi.advanceTimersByTimeAsync(2);
            await done;
            expect(entries).toEqual([{ id: 'Lib', version: '1.0.0', authors: 'Ada', iconUrl: 'data:image/png;base64,AAAA', vulnerabilities: [] }]);
            expect(vi.getTimerCount()).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });

    it('a failed registration read leaves deprecation absent', async () => {
        const failed = await withLeg(deprecations({ 'a/Lib@1.0.0': { kind: 'failed' } })).enrich([source('a')], [{ id: 'Lib', version: '1.0.0' }]);
        const thrown = await withLeg(deprecations({ 'a/Lib@1.0.0': new Error('boom') }), search({ 'a/Lib': { id: 'Lib', version: '1.0.0', authors: 'Ada' } })).enrich([source('a')], [{ id: 'Lib', version: '1.0.0' }]);
        // A failed source passes to the next one, which answers.
        const next = await withLeg(deprecations({ 'a/Lib@1.0.0': { kind: 'failed' }, 'b/Lib@1.0.0': { kind: 'found', deprecation: LEGACY } })).enrich([source('a'), source('b')], [{ id: 'Lib', version: '1.0.0' }]);

        expect(failed[0]).not.toHaveProperty('deprecation');
        expect(thrown[0]).toEqual({ id: 'Lib', version: '1.0.0', authors: 'Ada', vulnerabilities: [] });
        expect(next[0].deprecation).toEqual(LEGACY);
    });

    it('an enricher without a deprecation lookup reads no registration', async () => {
        const leg = deprecations({ 'a/Lib@1.0.0': { kind: 'found', deprecation: LEGACY } });
        const entries = await enricher().enrich([source('a')], [{ id: 'Lib', version: '1.0.0' }]);
        const denyAll: OutboundPolicy = { allowedSourcesFor: () => [] };
        const denied = await new DefaultMetadataEnricher({ policy: denyAll, logger: silentLogger }, search({}), icons(), vulnerabilities(), { deprecations: leg }).enrich([source('a')], [{ id: 'Lib', version: '1.0.0' }]);

        expect(entries[0]).not.toHaveProperty('deprecation');
        expect(denied[0]).not.toHaveProperty('deprecation');
        expect(leg.deprecation).not.toHaveBeenCalled();
    });
});
