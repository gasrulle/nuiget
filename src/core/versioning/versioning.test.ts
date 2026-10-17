import { describe, expect, it } from 'vitest';
import {
    compare,
    compareText,
    effectiveInstalledVersion,
    equals,
    isNewer,
    isUpdateCandidate,
    normalize,
    normalizeId,
    parseVersion,
    parseVersionSpec,
    resolveFloating,
    satisfies,
    satisfiesText,
    selectLatest,
    sortDescending,
    toDomainSpec,
} from './index';

describe('parseVersion / normalize', () => {
    it.each([
        ['1.0', '1.0.0'],
        ['1', '1.0.0'],
        ['1.0.0.0', '1.0.0'],
        ['1.0.0.1', '1.0.0.1'],
        ['01.02.03', '1.2.3'],
        ['1.0.0-Beta', '1.0.0-Beta'],
        ['1.0.0+build', '1.0.0'],
        ['1.0.0-beta.1+sha.abc', '1.0.0-beta.1'],
        ['13.0.3', '13.0.3'],
        ['2.0.0-preview.1.24101.2', '2.0.0-preview.1.24101.2'],
    ])('normalizes %s → %s', (input, expected) => {
        expect(normalize(input)).toBe(expected);
    });

    it.each(['unknown', '', '   ', '1.0.*', '[1.0.0]', '1.a.0', 'v1.0.0', '1.0.0-', '1..0', '1.0.0.0.0', '1.0.0+', '1.0.0-beta..1', '1 .0.0'])(
        'rejects %j',
        input => {
            expect(parseVersion(input)).toBeUndefined();
        },
    );

    it('trims surrounding whitespace but keeps the original text', () => {
        expect(parseVersion(' 1.0.0 ')).toMatchObject({ normalized: '1.0.0', original: ' 1.0.0 ' });
    });

    it('exposes components and flags', () => {
        const v = parseVersion('1.2.3.4-rc.1+meta');
        expect(v).toMatchObject({ major: 1, minor: 2, patch: 3, revision: 4, release: ['rc', '1'], metadata: 'meta', isPrerelease: true, isLegacy: true });
        expect(parseVersion('1.2.3')).toMatchObject({ revision: 0, isPrerelease: false, isLegacy: false, release: [] });
    });
});

describe('compare', () => {
    const ascending = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.0.0.1', '1.9.9', '2.0.0', '9.0.0', '10.0.0'];

    it('orders the SemVer precedence chain', () => {
        for (let i = 1; i < ascending.length; i++) {
            expect(compareText(ascending[i - 1], ascending[i]), `${ascending[i - 1]} < ${ascending[i]}`).toBe(-1);
            expect(compareText(ascending[i], ascending[i - 1])).toBe(1);
        }
    });

    it('treats prerelease labels case-insensitively and ignores metadata', () => {
        expect(compareText('1.0.0-RC.1', '1.0.0-rc.1')).toBe(0);
        expect(compareText('1.0.0+a', '1.0.0+b')).toBe(0);
        expect(equals('1.0', '1.0.0.0')).toBe(true);
    });

    it('returns undefined when either side is unparsable', () => {
        expect(compareText('1.0.0', 'unknown')).toBeUndefined();
        expect(compareText('unknown', '1.0.0')).toBeUndefined();
    });

    it('compare() on parsed values is total', () => {
        const a = parseVersion('1.0.0-beta');
        const b = parseVersion('1.0.0');
        expect(a && b && compare(a, b)).toBe(-1);
        expect(a && b && compare(b, a)).toBe(1);
        expect(a && compare(a, a)).toBe(0);
    });
});

describe('isNewer / sortDescending / selectLatest', () => {
    it('isNewer compares precedence and refuses unparsable input', () => {
        expect(isNewer('13.0.3', '13.0.1')).toBe(true);
        expect(isNewer('13.0.1', '13.0.3')).toBe(false);
        expect(isNewer('13.0.3', 'unknown')).toBe(false);
        expect(isNewer('unknown', '13.0.1')).toBe(false);
        expect(isNewer('1.0.0', '1.0.0-beta')).toBe(true);
        expect(isNewer('1.0.0-beta', '1.0.0')).toBe(false);
        expect(isNewer('10.0.0', '9.0.0')).toBe(true);
    });

    it('sorts descending with unparsable entries last in original order', () => {
        expect(sortDescending(['1.0.0', 'junk', '2.0.0-beta', '2.0.0', 'also-junk', '1.0.0-alpha'])).toEqual([
            '2.0.0', '2.0.0-beta', '1.0.0', '1.0.0-alpha', 'junk', 'also-junk',
        ]);
    });

    it('selectLatest honours the prerelease flag', () => {
        const versions = ['1.0.0', '2.0.0-beta.1', '1.5.0', 'unknown'];
        expect(selectLatest(versions, { includePrerelease: false })).toBe('1.5.0');
        expect(selectLatest(versions, { includePrerelease: true })).toBe('2.0.0-beta.1');
        expect(selectLatest([], { includePrerelease: true })).toBeUndefined();
        expect(selectLatest(['unknown'], { includePrerelease: true })).toBeUndefined();
    });
});

describe('parseVersionSpec', () => {
    it('parses a bare version as an inclusive minimum', () => {
        const spec = parseVersionSpec('1.0');
        expect(spec.kind).toBe('minimum');
        expect(spec.min?.normalized).toBe('1.0.0');
        expect(spec.minInclusive).toBe(true);
        expect(toDomainSpec(spec)).toEqual({ type: 'standard', original: '1.0' });
    });

    it('parses exact and interval ranges', () => {
        expect(parseVersionSpec('[1.0.0]')).toMatchObject({ kind: 'exact', minInclusive: true, maxInclusive: true });
        expect(parseVersionSpec('[1.0,2.0)')).toMatchObject({ kind: 'range', minInclusive: true, maxInclusive: false });
        expect(parseVersionSpec('(,2.0]')).toMatchObject({ kind: 'range', min: undefined, maxInclusive: true });
        expect(parseVersionSpec('[1.0,)')).toMatchObject({ kind: 'range', max: undefined, minInclusive: true });
        expect(parseVersionSpec('(1.0,2.0)')).toMatchObject({ kind: 'range', minInclusive: false, maxInclusive: false });
        expect(toDomainSpec(parseVersionSpec('[1.0.0]')).type).toBe('exact');
        expect(toDomainSpec(parseVersionSpec('[1.0,2.0)')).type).toBe('range');
    });

    it.each(['[1.0', '1.0)', '(1.0.0)', '[2.0,1.0]', '(,)', '[1.0,2.0,3.0]', '[a,b]', '', 'unknown', '$(Version)'])('rejects %j', input => {
        const spec = parseVersionSpec(input);
        expect(spec.kind).toBe('invalid');
        expect(toDomainSpec(spec).type).toBe('unresolved');
    });

    it.each([
        ['*', { prefix: '', depth: 0, prerelease: false, isAlwaysLatest: true }],
        ['*-*', { prefix: '', depth: 0, prerelease: true, isAlwaysLatest: true }],
        ['1.*', { prefix: '1', depth: 1, prerelease: false, isAlwaysLatest: false }],
        ['1.0.*', { prefix: '1.0', depth: 2, prerelease: false, isAlwaysLatest: false }],
        ['1.0.0.*', { prefix: '1.0.0', depth: 3, prerelease: false, isAlwaysLatest: false }],
        ['1.0.*-*', { prefix: '1.0', depth: 2, prerelease: true, releasePrefix: '', isAlwaysLatest: false }],
        ['1.0.0-*', { prefix: '1.0.0', depth: 4, prerelease: true, releasePrefix: '', isAlwaysLatest: false }],
        ['1.0.0-beta*', { prefix: '1.0.0', depth: 4, prerelease: true, releasePrefix: 'beta', isAlwaysLatest: false }],
        ['1.0.0-beta.*', { prefix: '1.0.0', depth: 4, prerelease: true, releasePrefix: 'beta.', isAlwaysLatest: false }],
    ])('parses floating %s', (input, expected) => {
        const spec = parseVersionSpec(input);
        expect(spec.kind).toBe('floating');
        expect(spec.floating).toMatchObject(expected);
        const domain = toDomainSpec(spec);
        expect(domain.type).toBe('floating');
        expect(domain.isAlwaysLatest).toBe(expected.isAlwaysLatest);
        expect(domain.floatingDepth).toBe(expected.depth);
    });
});

describe('satisfies', () => {
    it('applies interval bounds', () => {
        expect(satisfiesText('[1.0,2.0)', '1.0.0')).toBe(true);
        expect(satisfiesText('[1.0,2.0)', '1.9.9')).toBe(true);
        expect(satisfiesText('[1.0,2.0)', '2.0.0')).toBe(false);
        expect(satisfiesText('(1.0,2.0]', '1.0.0')).toBe(false);
        expect(satisfiesText('(1.0,2.0]', '2.0.0')).toBe(true);
        expect(satisfiesText('(,2.0]', '0.1.0')).toBe(true);
        expect(satisfiesText('[1.0.0]', '1.0.0')).toBe(true);
        expect(satisfiesText('[1.0.0]', '1.0.1')).toBe(false);
        expect(satisfiesText('1.0', '0.9.0')).toBe(false);
        expect(satisfiesText('1.0', '1.0.0')).toBe(true);
        expect(satisfiesText('1.0', '7.0.0')).toBe(true);
    });

    it('applies floating patterns', () => {
        const v = (text: string) => {
            const parsed = parseVersion(text);
            if (!parsed) {
                throw new Error(text);
            }
            return parsed;
        };
        expect(satisfies(parseVersionSpec('1.*'), v('1.9.3'))).toBe(true);
        expect(satisfies(parseVersionSpec('1.*'), v('2.0.0'))).toBe(false);
        expect(satisfies(parseVersionSpec('1.*'), v('1.9.3-beta'))).toBe(false);
        expect(satisfies(parseVersionSpec('1.*-*'), v('1.9.3-beta'))).toBe(true);
        expect(satisfies(parseVersionSpec('1.0.0-beta*'), v('1.0.0-beta.2'))).toBe(true);
        expect(satisfies(parseVersionSpec('1.0.0-beta*'), v('1.0.0-rc.1'))).toBe(false);
        expect(satisfies(parseVersionSpec('1.0.0-beta*'), v('1.0.0'))).toBe(false);
        expect(satisfies(parseVersionSpec('*'), v('99.0.0'))).toBe(true);
        expect(satisfies(parseVersionSpec('bogus'), v('1.0.0'))).toBe(false);
        expect(satisfiesText('1.*', 'unknown')).toBe(false);
    });
});

describe('resolveFloating', () => {
    const available = ['0.9.0', '1.0.0', '1.5.2', '1.9.3', '1.9.4-beta.1', '2.0.0', '2.1.0-preview.3'];

    it('picks the highest stable match by default', () => {
        expect(resolveFloating(parseVersionSpec('1.*'), available, false)).toBe('1.9.3');
        expect(resolveFloating(parseVersionSpec('1.5.*'), available, false)).toBe('1.5.2');
        expect(resolveFloating(parseVersionSpec('*'), available, false)).toBe('2.0.0');
    });

    it('admits prerelease when the pattern or the flag says so', () => {
        expect(resolveFloating(parseVersionSpec('1.*-*'), available, false)).toBe('1.9.4-beta.1');
        expect(resolveFloating(parseVersionSpec('1.*'), available, true)).toBe('1.9.4-beta.1');
        expect(resolveFloating(parseVersionSpec('*'), available, true)).toBe('2.1.0-preview.3');
        expect(resolveFloating(parseVersionSpec('2.1.0-preview*'), available, false)).toBe('2.1.0-preview.3');
    });

    it('returns undefined without a match or for non-floating specs', () => {
        expect(resolveFloating(parseVersionSpec('3.*'), available, true)).toBeUndefined();
        expect(resolveFloating(parseVersionSpec('1.0.0'), available, true)).toBeUndefined();
        expect(resolveFloating(parseVersionSpec('1.*'), [], true)).toBeUndefined();
    });
});

describe('isUpdateCandidate / effectiveInstalledVersion', () => {
    it('requires a resolved version for floating and range specs', () => {
        expect(isUpdateCandidate(parseVersionSpec('1.*'), undefined)).toBe(false);
        expect(isUpdateCandidate(parseVersionSpec('1.*'), '1.9.3')).toBe(true);
        expect(isUpdateCandidate(parseVersionSpec('*'), '2.0.0')).toBe(false);
        expect(isUpdateCandidate(parseVersionSpec('[1.0,2.0)'), undefined)).toBe(false);
        expect(isUpdateCandidate(parseVersionSpec('[1.0,2.0)'), '1.5.0')).toBe(true);
        expect(isUpdateCandidate(parseVersionSpec('1.0.0'), undefined)).toBe(true);
        expect(isUpdateCandidate(parseVersionSpec('[1.0.0]'), undefined)).toBe(false);
        expect(isUpdateCandidate(parseVersionSpec('unknown'), '1.0.0')).toBe(false);
    });

    it('exact pin is not an update candidate', () => {
        expect(isUpdateCandidate(parseVersionSpec('[1.0.0]'), undefined)).toBe(false);
        expect(isUpdateCandidate(parseVersionSpec('[1.0.0]'), '1.0.0')).toBe(false);
        expect(effectiveInstalledVersion(parseVersionSpec('[1.0.0]'), undefined)).toBe('1.0.0');
    });

    it('prefers the resolved version when it parses', () => {
        expect(effectiveInstalledVersion(parseVersionSpec('1.0.0'), undefined)).toBe('1.0.0');
        expect(effectiveInstalledVersion(parseVersionSpec('1.0.0'), '1.0.2')).toBe('1.0.2');
        expect(effectiveInstalledVersion(parseVersionSpec('1.*'), '1.9.3')).toBe('1.9.3');
        expect(effectiveInstalledVersion(parseVersionSpec('1.*'), undefined)).toBeUndefined();
        expect(effectiveInstalledVersion(parseVersionSpec('1.*'), 'garbage')).toBeUndefined();
    });
});

describe('normalizeId', () => {
    it('lower-cases and trims', () => {
        expect(normalizeId(' Newtonsoft.Json ')).toBe('newtonsoft.json');
    });
});
