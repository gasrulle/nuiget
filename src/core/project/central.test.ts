import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { fixture } from './__fixtures__/scratch';
import { BUILD_PROPS_FILE, CENTRAL_PROPS_FILE, findCentralPropsPath, findFilesUpwards, findNearestFile, nearestStopDir, parseBooleanProperty, parseCentralPackageVersions } from './central';
import { parseMsBuildXml, XmlParseError } from './xml';

const cpmRoot = fixture('cpm');
const cpmProps = fixture('cpm', CENTRAL_PROPS_FILE);
const nestedProps = fixture('cpm', 'Nested', CENTRAL_PROPS_FILE);
const propsPath = path.join(path.resolve('/w'), CENTRAL_PROPS_FILE);

const versionsOf = (itemGroups: string) => parseCentralPackageVersions(`<Project>${itemGroups}</Project>`, propsPath);

describe('parseBooleanProperty', () => {
    it.each([
        ['true', true], ['True', true], [' TRUE ', true], ['false', false], ['False', false], ['\tfalse\n', false],
        ['', undefined], ['1', undefined], ['yes', undefined], ['$(Flag)', undefined], [undefined, undefined],
    ] as const)('%j → %j', (value, expected) => {
        expect(parseBooleanProperty(value)).toBe(expected);
    });
});

describe('finding props files', () => {
    it('finds the nearest Directory.Packages.props, which is the only one MSBuild imports', async () => {
        expect(await findCentralPropsPath(fixture('cpm', 'App'), [cpmRoot])).toBe(cpmProps);
        expect(await findCentralPropsPath(fixture('cpm', 'Lib'), [cpmRoot])).toBe(cpmProps);
        expect(await findCentralPropsPath(fixture('cpm', 'Nested', 'Inner'), [cpmRoot])).toBe(nestedProps);
        expect(await findCentralPropsPath(cpmRoot, [cpmRoot])).toBe(cpmProps);
    });

    it('stops at the stop directory, inclusively', async () => {
        expect(await findCentralPropsPath(fixture('cpm', 'App'), [fixture('cpm', 'App')])).toBeUndefined();
        expect(await findCentralPropsPath(fixture('sdk'), [fixture('sdk')])).toBeUndefined();
        expect(await findCentralPropsPath(fixture('cpm', 'Nested', 'Inner'), [fixture('cpm', 'Nested')])).toBe(nestedProps);
    });

    it('lists every match on the way up, nearest first, up to the limit', async () => {
        const inner = fixture('cpm', 'Nested', 'Inner');
        expect(await findFilesUpwards(inner, CENTRAL_PROPS_FILE, [cpmRoot])).toEqual([nestedProps, cpmProps]);
        expect(await findFilesUpwards(inner, CENTRAL_PROPS_FILE, [cpmRoot], 1)).toEqual([nestedProps]);
        expect(await findFilesUpwards(inner, 'No.Such.File', [cpmRoot])).toEqual([]);
        expect(await findNearestFile(fixture('props', 'Proj'), BUILD_PROPS_FILE, [fixture('props')])).toBe(fixture('props', BUILD_PROPS_FILE));
        expect(await findNearestFile(fixture('multitfm', 'App'), BUILD_PROPS_FILE, [fixture('multitfm')])).toBe(fixture('multitfm', BUILD_PROPS_FILE));
    });

    it('picks the deepest stop directory that contains the start', () => {
        const stops = [fixture(), cpmRoot, fixture('sdk')];
        expect(nearestStopDir(fixture('cpm', 'Nested', 'Inner'), stops)).toBe(cpmRoot);
        expect(nearestStopDir(fixture('props', 'Proj'), stops)).toBe(fixture());
        expect(nearestStopDir(path.resolve('/elsewhere'), stops)).toBeUndefined();
        expect(nearestStopDir(cpmRoot, undefined)).toBeUndefined();
    });
});

describe('parseCentralPackageVersions', () => {
    it('reads the entries of the fixture, keyed by lower-cased id', () => {
        const versions = parseCentralPackageVersions(fs.readFileSync(cpmProps, 'utf-8'), cpmProps);
        expect(Object.fromEntries(Array.from(versions, ([id, entry]) => [id, entry.version]))).toEqual({
            'newtonsoft.json': '13.0.3',
            serilog: '4.0.0',
            humanizer: '2.*',
            xunit: '2.9.0',
            'stylecop.analyzers': '1.2.0-beta.556',
            pinned: '[1.0.0]',
        });
        expect(versions.get('pinned')).toEqual({ version: '[1.0.0]', definedIn: cpmProps, conditioned: false });
        expect(versions.has('Pinned')).toBe(false);
    });

    it('reads the nested and the multi-target fixtures', () => {
        expect(parseCentralPackageVersions(fs.readFileSync(nestedProps, 'utf-8'), nestedProps).get('newtonsoft.json')?.version).toBe('12.0.1');
        const multi = fixture('multitfm', CENTRAL_PROPS_FILE);
        expect(Array.from(parseCentralPackageVersions(fs.readFileSync(multi, 'utf-8'), multi).keys())).toEqual(['newtonsoft.json', 'serilog']);
    });

    it('accepts a parsed document', () => {
        const doc = parseMsBuildXml('<Project><ItemGroup><PackageVersion Include="A" Version="1.0.0" /></ItemGroup></Project>');
        expect(parseCentralPackageVersions(doc, propsPath).get('a')).toEqual({ version: '1.0.0', definedIn: propsPath, conditioned: false });
    });

    it('lets the last declaration win, and Update only change what Include declared', () => {
        const versions = versionsOf(`
            <ItemGroup>
                <PackageVersion Include="A" Version="1.0.0" />
                <PackageVersion Include="B" Version=" 1.0.0 " />
                <PackageVersion Update="Ghost" Version="9.9.9" />
            </ItemGroup>
            <ItemGroup>
                <PackageVersion Update="a" Version="2.0.0" />
                <PackageVersion Include="B" Version="3.0.0" />
                <PackageVersion Include=" C "><Version>4.0.0</Version></PackageVersion>
                <PackageVersion Include="NoVersion" />
                <PackageVersion Version="5.0.0" />
            </ItemGroup>`);
        expect(Object.fromEntries(Array.from(versions, ([id, entry]) => [id, entry.version]))).toEqual({ a: '2.0.0', b: '3.0.0', c: '4.0.0' });
        expect(Array.from(versions.values()).every(entry => !entry.conditioned && entry.definedIn === propsPath)).toBe(true);
    });

    it('returns a Condition-guarded entry as conditioned, with the last value written', () => {
        const versions = versionsOf(`
            <ItemGroup>
                <PackageVersion Include="OnItem" Version="1.0.0" Condition="'$(TargetFramework)' == 'net8.0'" />
                <PackageVersion Include="Plain" Version="1.0.0" />
                <PackageVersion Include="Overridden" Version="1.0.0" />
                <PackageVersion Include="Settled" Version="1.0.0" Condition="'$(X)' == 'y'" />
                <PackageVersion Include="UpdatedGuard" Version="1.0.0" Condition="'$(X)' == 'y'" />
            </ItemGroup>
            <ItemGroup Condition="'$(TargetFramework)' == 'net6.0'">
                <PackageVersion Include="OnGroup" Version="2.0.0" />
                <PackageVersion Update="Overridden" Version="2.0.0" />
            </ItemGroup>
            <ItemGroup>
                <PackageVersion Include="Settled" Version="3.0.0" />
                <PackageVersion Update="UpdatedGuard" Version="3.0.0" />
            </ItemGroup>`);
        expect(Object.fromEntries(Array.from(versions, ([id, entry]) => [id, [entry.version, entry.conditioned]]))).toEqual({
            onitem: ['1.0.0', true],
            plain: ['1.0.0', false],
            // A guarded update over a plain declaration: which of the two applies is open.
            overridden: ['2.0.0', true],
            // A plain declaration after a guarded one always applies last.
            settled: ['3.0.0', false],
            // A plain update of a guarded declaration only applies when the guard held.
            updatedguard: ['3.0.0', true],
            ongroup: ['2.0.0', true],
        });
    });

    it('returns nothing without a project root and throws for malformed XML', () => {
        expect(parseCentralPackageVersions('<Configuration />', propsPath).size).toBe(0);
        expect(parseCentralPackageVersions('<Project></Project>', propsPath).size).toBe(0);
        expect(() => parseCentralPackageVersions('<Project><ItemGroup></Project>', propsPath)).toThrow(XmlParseError);
    });
});
