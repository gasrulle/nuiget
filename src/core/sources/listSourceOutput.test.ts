import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parseListSourceOutput } from './index';

const capture = fs.readFileSync(path.join(__dirname, '__fixtures__', 'list-source', '10.0.401.txt'), 'utf-8');

describe('parseListSourceOutput', () => {
    it('listing: parses the tracked SDK 10 capture', () => {
        expect(parseListSourceOutput(capture)).toEqual([
            { name: 'Private Feed', url: 'https://feed.example/v3/index.json', enabled: true },
            { name: 'Disabled Feed', url: 'https://disabled.example/v3/index.json', enabled: false },
            { name: 'Local Packages', url: '{dir}/packages', enabled: true, isLocal: true },
        ]);
    });

    it('listing: tolerates CRLF and skips lines that do not match', () => {
        const output = [
            'Registered Sources:',
            '  1.  nuget.org [Enabled]',
            '      https://api.nuget.org/v3/index.json',
            'warn : something unrelated',
            '  2.  No Address [Enabled]',
            '  3.  Unknown State [Paused]',
            '      https://paused.example/v3/index.json',
            ' 12.  With [Brackets] In Name [Disabled]',
            '      HTTP://UPPER.example/v3/index.json',
            ' 13.  Share [Enabled]',
            '      \\\\server\\share\\packages',
            ' 14.  Last Without Address [Enabled]',
        ].join('\r\n');
        expect(parseListSourceOutput(output)).toEqual([
            { name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true },
            { name: 'With [Brackets] In Name', url: 'HTTP://UPPER.example/v3/index.json', enabled: false },
            { name: 'Share', url: '\\\\server\\share\\packages', enabled: true, isLocal: true },
        ]);
    });

    it('returns nothing for empty output and for a header alone', () => {
        expect(parseListSourceOutput('')).toEqual([]);
        expect(parseListSourceOutput('Registered Sources:\n')).toEqual([]);
        expect(parseListSourceOutput('No sources found.\n')).toEqual([]);
    });
});
