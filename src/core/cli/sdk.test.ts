import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { MIN_SUPPORTED_SDK_MAJOR, capabilitiesFor, parseSdkVersion, sdkInfoFromVersion } from './sdk';

describe('parseSdkVersion', () => {
    it.each<[string, string, { major: number; minor: number; patch: number; prerelease?: string }]>([
        ['a release', '10.0.401\n', { major: 10, minor: 0, patch: 401 }],
        ['a preview', '10.0.100-preview.7.24407.12\n', { major: 10, minor: 0, patch: 100, prerelease: 'preview.7.24407.12' }],
        ['a release candidate', '11.0.100-rc.1.25451.107\n', { major: 11, minor: 0, patch: 100, prerelease: 'rc.1.25451.107' }],
        ['build metadata', '10.0.401+sha.5d3c1b2\n', { major: 10, minor: 0, patch: 401 }],
        ['a preview with build metadata', '10.0.100-preview.1+abc\n', { major: 10, minor: 0, patch: 100, prerelease: 'preview.1' }],
        ['Windows line endings', '10.0.401\r\n', { major: 10, minor: 0, patch: 401 }],
        ['surrounding spaces', '   8.0.425  \n', { major: 8, minor: 0, patch: 425 }],
    ])('parses %s', (_label, output, expected) => {
        const parsed = parseSdkVersion(output);
        expect(parsed).toMatchObject(expected);
        expect(parsed?.version).toBe(output.trim());
        if (expected.prerelease === undefined) {
            expect(parsed?.prerelease).toBeUndefined();
        }
    });

    it('skips a first-run banner and takes the first line that is a version', () => {
        const banner = [
            'Welcome to .NET 10.0!',
            '---------------------',
            'SDK Version: see below',
            '',
            '10.0.401',
            '9.0.100',
        ].join('\r\n');
        expect(parseSdkVersion(banner)).toMatchObject({ version: '10.0.401', major: 10 });
    });

    it.each(['', '\n\n', 'Welcome to .NET!', '10.0', '10', 'v10.0.401', '10.0.401 extra', 'A compatible .NET SDK was not found.'])(
        'returns undefined for %j',
        output => {
            expect(parseSdkVersion(output)).toBeUndefined();
        },
    );
});

describe('capabilitiesFor', () => {
    it('supports SDK 10 and newer and nothing below (boundary 9, 10, 11)', () => {
        expect(MIN_SUPPORTED_SDK_MAJOR).toBe(10);
        expect(capabilitiesFor(9).supported).toBe(false);
        expect(capabilitiesFor(10).supported).toBe(true);
        expect(capabilitiesFor(11).supported).toBe(true);
        expect(capabilitiesFor(8).supported).toBe(false);
        expect(capabilitiesFor(0).supported).toBe(false);
    });

    it('calls the CPM behaviour verified only where a probe fixture exists', () => {
        expect(capabilitiesFor(10)).toEqual({ supported: true, cpmAwareAdd: true, cpmAwareAddProvenance: 'verified' });
        // Supported, but nothing proves what `package add` does there: the mutator must refuse CPM edits.
        expect(capabilitiesFor(11)).toEqual({ supported: true, cpmAwareAdd: false, cpmAwareAddProvenance: 'unverified' });
        expect(capabilitiesFor(9)).toEqual({ supported: false, cpmAwareAdd: false, cpmAwareAddProvenance: 'unverified' });
        expect(capabilitiesFor(8)).toEqual({ supported: false, cpmAwareAdd: false, cpmAwareAddProvenance: 'unverified' });
    });

    it('agrees with every tracked probe fixture', () => {
        const fixtureDir = path.join(__dirname, '__fixtures__', 'sdk-probes');
        const files = fs.readdirSync(fixtureDir).filter(file => file.endsWith('.json'));
        expect(files).toContain('10.0.401.json');

        for (const file of files) {
            const fixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, file), 'utf8')) as {
                sdk: string;
                verdict: { addUpdatesCentralVersion: boolean };
            };
            const major = parseSdkVersion(fixture.sdk)?.major;
            expect(major, `${file}: sdk is a version`).toBeDefined();
            expect(capabilitiesFor(major as number), file).toEqual({
                supported: (major as number) >= MIN_SUPPORTED_SDK_MAJOR,
                cpmAwareAdd: fixture.verdict.addUpdatesCentralVersion,
                cpmAwareAddProvenance: 'verified',
            });
        }
    });
});

describe('sdkInfoFromVersion', () => {
    it('combines the parsed version with the capabilities of its major', () => {
        expect(sdkInfoFromVersion('10.0.401\n')).toEqual({
            version: '10.0.401',
            major: 10,
            supported: true,
            cpmAwareAdd: true,
            cpmAwareAddProvenance: 'verified',
        });
    });

    it('describes an SDK below the floor instead of returning undefined', () => {
        expect(sdkInfoFromVersion('9.0.305')).toEqual({
            version: '9.0.305',
            major: 9,
            supported: false,
            cpmAwareAdd: false,
            cpmAwareAddProvenance: 'unverified',
        });
    });

    it('has no syntax flag: every supported SDK uses the noun-first commands', () => {
        expect(Object.keys(sdkInfoFromVersion('10.0.401') ?? {}).sort())
            .toEqual(['cpmAwareAdd', 'cpmAwareAddProvenance', 'major', 'supported', 'version']);
    });

    it('returns undefined when the text is not a version', () => {
        expect(sdkInfoFromVersion('Welcome to .NET!')).toBeUndefined();
        expect(sdkInfoFromVersion('')).toBeUndefined();
    });
});
