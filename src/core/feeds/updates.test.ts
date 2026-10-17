import { describe, expect, it, vi } from 'vitest';
import type { Logger, OutboundPolicy } from '../contracts';
import type { InstalledPackage } from '../../protocol/domain';
import { DefaultUpdateChecker } from './updates';
import { silentLogger } from './testSupport';
import type { RegistrationClient, ResolvedSource } from './types';

const allowAll: OutboundPolicy = { allowedSourcesFor: (_id, candidates) => candidates };

function source(name: string): ResolvedSource {
    return { source: { name, url: `https://${name}.example/v3/index.json`, enabled: true }, endpoints: { searchQueryService: `https://${name}.example/query` } };
}

function pkg(id: string, version: string, changes: Partial<InstalledPackage> = {}): InstalledPackage {
    return { id, version, versionType: 'standard', declaration: 'project', ...changes };
}

type Answer = string[] | undefined | Promise<string[] | undefined> | Error;

/** Listed versions per `<source name>/<id>`; unknown pairs answer `[]`. */
function registration(answers: Record<string, Answer>): RegistrationClient & { versions: ReturnType<typeof vi.fn> } {
    return {
        versions: vi.fn(async (src: ResolvedSource, id: string) => {
            const answer = answers[`${src.source.name}/${id}`];
            if (answer instanceof Error) {
                throw answer;
            }
            return answer === undefined && !(`${src.source.name}/${id}` in answers) ? [] : answer;
        }),
        metadata: vi.fn(),
    };
}

function checker(reg: RegistrationClient, policy: OutboundPolicy = allowAll, logger: Logger = silentLogger): DefaultUpdateChecker {
    return new DefaultUpdateChecker({ policy, logger }, reg);
}

describe('DefaultUpdateChecker', () => {
    it('skips unresolved declarations, invalid specs, exact pins and floating or range specs without a resolved version (N6)', async () => {
        const reg = registration({ 'a/Pinned': ['9.0.0'], 'a/Unresolved': ['9.0.0'], 'a/Invalid': ['9.0.0'], 'a/Floating': ['9.0.0'], 'a/Range': ['9.0.0'], 'a/AlwaysLatest': ['9.0.0'], 'a/Plain': ['9.0.0'] });

        const result = await checker(reg).check([source('a')], [
            pkg('Pinned', '[1.0.0]', { versionType: 'exact' }),
            pkg('Unresolved', '1.0.0', { declaration: 'unresolved' }),
            pkg('Invalid', 'not-a-version'),
            pkg('Floating', '1.*', { versionType: 'floating' }),
            pkg('Range', '[1.0.0, 2.0.0)', { versionType: 'range' }),
            pkg('AlwaysLatest', '*', { versionType: 'floating', resolvedVersion: '1.0.0' }),
            pkg('Plain', '1.0.0'),
        ], false);

        expect(result).toEqual({ updates: [{ id: 'Plain', installedVersion: '1.0.0', latestVersion: '9.0.0', sourceUrl: 'https://a.example/v3/index.json' }], sourcesUnavailable: false });
        expect(reg.versions.mock.calls.map(call => call[1])).toEqual(['Plain']);
    });

    it('compares against the resolved version of a floating spec and reports it as installedVersion', async () => {
        const reg = registration({ 'a/Floating': ['1.4.0', '1.3.0'], 'a/Current': ['1.4.0'], 'a/Range': ['2.5.0'] });

        const result = await checker(reg).check([source('a')], [
            pkg('Floating', '1.*', { versionType: 'floating', resolvedVersion: '1.3.0' }),
            pkg('Current', '1.*', { versionType: 'floating', resolvedVersion: '1.4.0' }),
            pkg('Range', '[2.0.0, 3.0.0)', { versionType: 'range', resolvedVersion: '2.1.0' }),
        ], false);

        expect(result.updates).toEqual([
            { id: 'Floating', installedVersion: '1.3.0', latestVersion: '1.4.0', sourceUrl: 'https://a.example/v3/index.json' },
            { id: 'Range', installedVersion: '2.1.0', latestVersion: '2.5.0', sourceUrl: 'https://a.example/v3/index.json' },
        ]);
        expect(reg.versions).toHaveBeenCalledWith(expect.anything(), 'Floating', { includePrerelease: false, listedOnly: true, signal: undefined });
    });

    it('takes the newest version across every allowed source and names the source that has it, ties to the first-listed source', async () => {
        const reg = registration({ 'a/Lib': ['1.5.0'], 'b/Lib': ['2.0.0', '1.5.0'], 'c/Lib': ['1.9.0'], 'a/Tie': ['3.0'], 'b/Tie': ['3.0.0'] });

        const result = await checker(reg).check([source('a'), source('b'), source('c')], [pkg('Lib', '1.0.0'), pkg('Tie', '1.0.0')], true);

        expect(result.updates).toEqual([
            { id: 'Lib', installedVersion: '1.0.0', latestVersion: '2.0.0', sourceUrl: 'https://b.example/v3/index.json' },
            { id: 'Tie', installedVersion: '1.0.0', latestVersion: '3.0', sourceUrl: 'https://a.example/v3/index.json' },
        ]);
        expect(reg.versions).toHaveBeenCalledWith(expect.anything(), 'Lib', expect.objectContaining({ includePrerelease: true }));
    });

    it('waits for every allowed source instead of the first non-empty answer', async () => {
        let releaseSlow: (versions: string[]) => void = () => undefined;
        const slow = new Promise<string[]>(resolve => {
            releaseSlow = resolve;
        });
        const reg = registration({ 'fast/Lib': ['1.1.0'], 'slow/Lib': slow });
        let settled = false;

        const pending = checker(reg).check([source('fast'), source('slow')], [pkg('Lib', '1.0.0')], false).then(result => {
            settled = true;
            return result;
        });
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(settled).toBe(false);

        releaseSlow(['3.0.0']);
        await expect(pending).resolves.toMatchObject({ updates: [{ latestVersion: '3.0.0', sourceUrl: 'https://slow.example/v3/index.json' }] });
    });

    it('reports sourcesUnavailable when an allowed source failed even though another source produced an update', async () => {
        const reg = registration({ 'a/Lib': ['2.0.0'], 'b/Lib': undefined });

        const result = await checker(reg).check([source('a'), source('b')], [pkg('Lib', '1.0.0')], false);

        expect(result).toEqual({ updates: [expect.objectContaining({ latestVersion: '2.0.0' })], sourcesUnavailable: true });
        await expect(checker(registration({ 'a/Lib': undefined })).check([source('a')], [pkg('Lib', '1.0.0')], false)).resolves.toEqual({ updates: [], sourcesUnavailable: true });
    });

    it('does not report sourcesUnavailable for an unknown package or a package no source is allowed for', async () => {
        const reg = registration({});
        const refuseSecret: OutboundPolicy = { allowedSourcesFor: (id, candidates) => (id === 'Secret' ? [] : candidates) };

        await expect(checker(reg, refuseSecret).check([source('a')], [pkg('Unknown', '1.0.0'), pkg('Secret', '1.0.0')], false)).resolves.toEqual({ updates: [], sourcesUnavailable: false });
        await expect(checker(reg).check([], [pkg('Unknown', '1.0.0')], false)).resolves.toEqual({ updates: [], sourcesUnavailable: false });
        expect(reg.versions.mock.calls.map(call => call[1])).toEqual(['Unknown']);
    });

    it('asks only the sources the policy allows for each id', async () => {
        const reg = registration({ 'private/Contoso.Lib': ['2.0.0'], 'public/Other.Lib': ['2.0.0'] });
        const mapping: OutboundPolicy = { allowedSourcesFor: (id, candidates) => candidates.filter(candidate => (id.startsWith('Contoso.') ? candidate.name === 'private' : true)) };

        const result = await checker(reg, mapping).check([source('public'), source('private')], [pkg('Contoso.Lib', '1.0.0'), pkg('Other.Lib', '1.0.0')], false);

        expect(reg.versions.mock.calls.map(call => `${(call[0] as ResolvedSource).source.name}/${call[1]}`).sort()).toEqual(['private/Contoso.Lib', 'private/Other.Lib', 'public/Other.Lib']);
        expect(result.updates.map(update => update.sourceUrl)).toEqual(['https://private.example/v3/index.json', 'https://public.example/v3/index.json']);
    });

    it('streams each update through onFound and returns them in installed order', async () => {
        let releaseFirst: (versions: string[]) => void = () => undefined;
        const reg = registration({
            'a/First': new Promise<string[]>(resolve => {
                releaseFirst = resolve;
            }),
            'a/Second': ['2.0.0'],
        });
        const found: string[] = [];

        const pending = checker(reg).check([source('a')], [pkg('First', '1.0.0'), pkg('Second', '1.0.0')], false, update => found.push(update.id));
        await vi.waitFor(() => expect(found).toEqual(['Second']));
        releaseFirst(['2.0.0']);
        const result = await pending;

        expect(found).toEqual(['Second', 'First']);
        expect(result.updates.map(update => update.id)).toEqual(['First', 'Second']);
    });

    it('one failing package does not fail the check', async () => {
        const lines: string[] = [];
        const logger = { ...silentLogger, warn: (line: string) => lines.push(line) };
        const reg = registration({ 'a/Broken': new Error('boom https://user:s3cret@feed.example'), 'a/Fine': ['2.0.0'] });

        const result = await checker(reg, allowAll, logger).check([source('a')], [pkg('Broken', '1.0.0'), pkg('Fine', '1.0.0')], false);

        expect(result).toEqual({ updates: [expect.objectContaining({ id: 'Fine' })], sourcesUnavailable: true });
        expect(lines.join('\n')).toContain('Broken');
        expect(lines.join('\n')).not.toContain('s3cret');
    });

    it('a cancelled check resolves with what it found and sourcesUnavailable', async () => {
        const controller = new AbortController();
        const reg = registration({ 'a/First': ['2.0.0'], 'a/Second': ['2.0.0'] });
        const found: string[] = [];

        const result = await new DefaultUpdateChecker({ policy: allowAll, logger: silentLogger }, reg, { concurrency: 1 })
            .check([source('a')], [pkg('First', '1.0.0'), pkg('Second', '1.0.0')], false, update => {
                found.push(update.id);
                controller.abort();
            }, controller.signal);

        expect(result).toEqual({ updates: [expect.objectContaining({ id: 'First' })], sourcesUnavailable: true });
        expect(reg.versions.mock.calls.map(call => call[1])).toEqual(['First']);
        expect(reg.versions.mock.calls[0][2]).toMatchObject({ signal: controller.signal });
    });
});
