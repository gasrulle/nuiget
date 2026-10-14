import { describe, expect, it } from 'vitest';
import {
    entryAuthors, entryDescription, entryDownloads, entryIconUrl, entryId, entryVerified, entryVersion, entryVersions, headerValue,
    isRemoteSourceUrl, mapWithConcurrency, pathSegment, readAutocompleteIds, readSearchEntries, redactUrl, registrationAuthors, trimTrailingSlash,
} from './wire';

describe('feed wire helpers', () => {
    it('reads search entries from data, Data or a root array, and drops what is no object', () => {
        expect(readSearchEntries({ data: [{ id: 'A' }, 3, null] })).toEqual([{ id: 'A' }]);
        expect(readSearchEntries({ Data: [{ Id: 'B' }] })).toEqual([{ Id: 'B' }]);
        expect(readSearchEntries([{ id: 'C' }, 'x'])).toEqual([{ id: 'C' }]);
        expect(readSearchEntries('nonsense')).toEqual([]);
        expect(readAutocompleteIds({ data: ['Serilog', '', 4] })).toEqual(['Serilog']);
        expect(readAutocompleteIds(['A', 'B'])).toEqual(['A', 'B']);
    });

    it('reads entries in camel case (nuget.org) and Pascal case (BaGet, ProGet)', () => {
        const camel = { id: 'Serilog', version: '3.1.1', description: 'Logging', totalDownloads: 10, verified: true, versions: [{ version: '3.1.0' }, { version: '3.1.1' }, {}] };
        const pascal = { Id: 'Serilog', Version: '3.1.1', Summary: 'Logging', TotalDownloads: 10, Verified: false, Versions: [{ version: '3.1.1' }] };
        expect([entryId(camel), entryVersion(camel), entryDescription(camel), entryDownloads(camel), entryVerified(camel), entryVersions(camel)])
            .toEqual(['Serilog', '3.1.1', 'Logging', 10, true, ['3.1.0', '3.1.1']]);
        expect([entryId(pascal), entryVersion(pascal), entryDescription(pascal), entryDownloads(pascal), entryVerified(pascal), entryVersions(pascal)])
            .toEqual(['Serilog', '3.1.1', 'Logging', 10, false, ['3.1.1']]);
        expect(entryDownloads({ totalDownloads: -1 })).toBeUndefined();
        expect(entryVerified({ verified: 'yes' } as never)).toBeUndefined();
    });

    it('joins authors from an array or a string and falls back to the owner', () => {
        expect(entryAuthors({ authors: [' Serilog Contributors ', 3, ''] } as never)).toBe('Serilog Contributors');
        expect(entryAuthors({ Authors: 'A, B' })).toBe('A, B');
        expect(entryAuthors({ owner: 'nuget' })).toBe('nuget');
        expect(registrationAuthors({ authors: ['A', 'B'] } as never)).toBe('A, B');
        expect(registrationAuthors({ authors: ' C ' } as never)).toBe('C');
        expect(registrationAuthors({} as never)).toBe('');
    });

    it('keeps an icon URL only when it is http or https', () => {
        expect(entryIconUrl({ iconUrl: 'https://api.nuget.org/icon.png' })).toBe('https://api.nuget.org/icon.png');
        expect(entryIconUrl({ IconUrl: 'file:///C:/icon.png' })).toBeUndefined();
        expect(entryIconUrl({})).toBeUndefined();
    });

    it('builds request pieces: remote sources, path segments, headers', () => {
        expect([isRemoteSourceUrl('https://feed/v3/'), isRemoteSourceUrl(' HTTP://feed'), isRemoteSourceUrl('C:\\packages'), isRemoteSourceUrl('/var/feed')]).toEqual([true, true, false, false]);
        expect(trimTrailingSlash('https://feed/v3///')).toBe('https://feed/v3');
        expect(pathSegment(' My.Package+Extra ')).toBe('my.package%2Bextra');
        expect(headerValue({ 'Content-Type': 'image/png' }, 'content-type')).toBe('image/png');
        expect(headerValue({ 'content-length': '5' }, 'Content-Length')).toBe('5');
        expect(headerValue({}, 'x')).toBeUndefined();
    });

    it('redacts credentials, query and fragment from a URL before it is logged', () => {
        expect(redactUrl('https://user:secret@feed.example/v3/index.json?code=abc#x')).toBe('https://feed.example/v3/index.json');
        expect(redactUrl('not a url with //user:secret@host/path')).toBe('not a url with //host/path');
    });

    it('maps with a limit on what runs at once and keeps the order', async () => {
        let running = 0;
        let most = 0;
        const result = await mapWithConcurrency([30, 10, 20, 5], 2, async (delay, index) => {
            running++;
            most = Math.max(most, running);
            await new Promise(resolve => setTimeout(resolve, delay));
            running--;
            return index * 10;
        });
        expect(result).toEqual([0, 10, 20, 30]);
        expect(most).toBe(2);
        expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
    });
});
