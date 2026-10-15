import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    COMMANDS,
    EVALUATED_PROPERTIES,
    FIXTURE_DIR,
    TAIL_LINES,
    compareProbes,
    computeVerdict,
    pickFixture,
    redact,
    stripWellKnownMetadata,
    tail,
    targetFrameworks,
} from '../../../scripts/probe-sdk.mjs';

const fixtureFiles = readdirSync(FIXTURE_DIR).filter(file => file.endsWith('.json'));
const readFixture = (file: string) => JSON.parse(readFileSync(path.join(FIXTURE_DIR, file), 'utf8'));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe('SDK probe script', () => {
    it('tracks the probe inputs it reads', () => {
        expect(fixtureFiles).toContain('10.0.401.json');
        for (const input of ['Directory.Packages.props', 'nuget.config', path.join('App', 'App.csproj')]) {
            expect(readFileSync(path.join(FIXTURE_DIR, 'cpm', input), 'utf8')).not.toBe('');
        }
    });

    describe.each(fixtureFiles)('tracked fixture %s', file => {
        const fixture = readFixture(file);

        it('has the rows of the script in its order', () => {
            expect(fixture.commands.map((row: { id: string }) => row.id)).toEqual(COMMANDS.map(command => command.id));
        });

        it('has a verdict that follows from its command rows', () => {
            expect(computeVerdict(fixture.commands)).toEqual(fixture.verdict);
        });

        it('agrees with itself', () => {
            expect(compareProbes(fixture, fixture)).toEqual([]);
        });

        it('contains no machine path', () => {
            const text = JSON.stringify(fixture);
            expect(text).not.toMatch(/\/Users\/|\/home\/|\/private\/|\/var\/folders\/|[A-Z]:\\\\/);
        });
    });

    describe('computeVerdict', () => {
        const base = readFixture('10.0.401.json').commands;

        it('reports the SDK 8 behaviour when --no-restore writes a Version into the project (N1)', () => {
            const commands = clone(base);
            const row = commands.find((command: { id: string }) => command.id === 'add-newer-version-no-restore');
            row.projectDiff = '--- a/App/App.csproj\n+++ b/App/App.csproj\n@@ -9 +9,3 @@\n-    <PackageReference Include="Serilog" />\n+    <PackageReference Include="Serilog">\n+      <Version>4.1.0</Version>\n';
            expect(computeVerdict(commands).noRestoreWritesProjectVersion).toBe(true);
        });

        it('reports a failed restore after a --no-restore add as writing the project version', () => {
            const commands = clone(base);
            commands.find((command: { id: string }) => command.id === 'restore-after-no-restore-add').exitCode = 1;
            expect(computeVerdict(commands).noRestoreWritesProjectVersion).toBe(true);
        });

        it('does not call add CPM-aware when the central version stays', () => {
            const commands = clone(base);
            commands.find((command: { id: string }) => command.id === 'add-newer-version').propsDiff = '';
            expect(computeVerdict(commands).addUpdatesCentralVersion).toBe(false);
        });

        it('notices a remove that deletes the central entry', () => {
            const commands = clone(base);
            commands.find((command: { id: string }) => command.id === 'remove').propsDiff =
                '--- a/Directory.Packages.props\n+++ b/Directory.Packages.props\n@@ -9 +8,0 @@\n-    <PackageVersion Include="Serilog" Version="4.0.0" />\n';
            expect(computeVerdict(commands).removeKeepsCentralEntry).toBe(false);
        });

        it('throws when a row is missing', () => {
            expect(() => computeVerdict(base.filter((command: { id: string }) => command.id !== 'remove')))
                .toThrow('probe row remove is missing');
        });
    });

    describe('compareProbes', () => {
        const fixture = readFixture('10.0.401.json');

        it('ignores the SDK patch, the date, the platform, the output tails and SDK paths in evaluations', () => {
            const other = clone(fixture);
            other.sdk = '10.0.402';
            other.probedOn = '2027-01-01';
            other.platform = 'linux-x64';
            for (const row of other.commands) {
                row.stdoutTail = 'log  : Restored <probe>/App/App.csproj (in 999 ms).';
            }
            const json = JSON.stringify(other.evaluations).replace(/<dotnet-root>\/sdk\/10\.0\.401\//g, '<dotnet-root>/sdk/10.0.402/');
            other.evaluations = JSON.parse(json);
            expect(compareProbes(other, fixture)).toEqual([]);
        });

        it('reports a changed diff, exit code and evaluation by path', () => {
            const other = clone(fixture);
            other.commands[0].propsDiff = '';
            other.commands[4].exitCode = 1;
            other.evaluations[0].output.Properties.ManagePackageVersionsCentrally = 'false';
            const differences = compareProbes(other, fixture);
            expect(differences).toEqual(expect.arrayContaining([
                expect.stringMatching(/^probe\.commands\[0\]\.propsDiff: expected "--- a\/Directory\.Packages\.props/),
                'probe.commands[4].exitCode: expected 0, got 1',
                'probe.evaluations[0].output.Properties.ManagePackageVersionsCentrally: expected "true", got "false"',
                'probe.verdict.noRestoreWritesProjectVersion: expected false, got true',
            ]));
        });

        it('reports a missing evaluation', () => {
            const other = clone(fixture);
            other.evaluations.pop();
            expect(compareProbes(other, fixture).some(line => line.startsWith(`probe.evaluations[${fixture.evaluations.length - 1}]`))).toBe(true);
        });
    });

    describe('pickFixture', () => {
        const files = ['10.0.100.json', '10.0.401.json', '10.0.99.json', '11.0.100.json', 'cpm'];

        it('takes the file of the exact version', () => {
            expect(pickFixture('10.0.100', files)).toBe('10.0.100.json');
        });

        it('falls back to the newest file of the same major', () => {
            expect(pickFixture('10.0.402', files)).toBe('10.0.401.json');
            expect(pickFixture('11.0.200-preview.1', files)).toBe('11.0.100.json');
        });

        it('returns undefined for a major without a fixture', () => {
            expect(pickFixture('12.0.100', files)).toBeUndefined();
        });
    });

    describe('helpers', () => {
        it('redacts the longest path first', () => {
            expect(redact('/home/u/tmp/p/App and /home/u/x', [['/home/u', '<home>'], ['/home/u/tmp/p', '<probe>'], ['', '<none>']]))
                .toBe('<probe>/App and <home>/x');
        });

        it(`keeps the last ${TAIL_LINES} lines without trailing whitespace`, () => {
            const lines = Array.from({ length: TAIL_LINES + 3 }, (_, index) => `line ${index}`);
            expect(tail(`${lines.join('\r\n')}\r\n\n`)).toBe(lines.slice(3).join('\n'));
            expect(tail(' \n')).toBe('');
        });

        it('drops well-known item metadata and keeps the rest', () => {
            expect(stripWellKnownMetadata({
                Items: {
                    PackageReference: [{
                        Identity: 'Serilog',
                        VersionOverride: '3.1.1',
                        FullPath: '/x/Serilog',
                        ModifiedTime: '',
                        DefiningProjectFullPath: '<probe>/App/App.csproj',
                        DefiningProjectName: 'App',
                    }],
                },
            })).toEqual({
                Items: { PackageReference: [{ Identity: 'Serilog', VersionOverride: '3.1.1', DefiningProjectFullPath: '<probe>/App/App.csproj' }] },
            });
            expect(stripWellKnownMetadata({ Properties: { TargetFramework: 'net8.0' } })).toEqual({ Properties: { TargetFramework: 'net8.0' } });
        });

        it('reads the target frameworks of a properties run', () => {
            expect(targetFrameworks({ TargetFramework: '', TargetFrameworks: 'net8.0; netstandard2.0;net8.0;' })).toEqual(['net8.0', 'netstandard2.0']);
            expect(targetFrameworks({ TargetFramework: 'net8.0', TargetFrameworks: '' })).toEqual(['net8.0']);
            expect(targetFrameworks({})).toEqual([]);
        });

        it('asks the properties run for the ADR-004 list and the override switch', () => {
            expect(EVALUATED_PROPERTIES).toEqual(['TargetFramework', 'TargetFrameworks', 'ManagePackageVersionsCentrally', 'CentralPackageVersionOverrideEnabled']);
        });
    });
});
