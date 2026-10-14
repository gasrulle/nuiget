import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { ANY_FRAMEWORK, MAX_NUSPEC_CHARS, nuspecToMetadata, parseNuspec } from './nuspec';

const NEWTONSOFT = fs.readFileSync(path.join(__dirname, '__fixtures__', 'newtonsoft.json.13.0.3.nuspec'), 'utf8');

function nuspec(metadata: string, root = '<package xmlns="http://schemas.microsoft.com/packaging/2013/05/nuspec.xsd">'): string {
    return `<?xml version="1.0" encoding="utf-8"?>\n${root}<metadata><id>Contoso.Lib</id><version>1.0.0</version>${metadata}</metadata></package>`;
}

describe('parseNuspec', () => {
    it('reads a real nuspec with its BOM, namespace, license expression and empty dependency groups', () => {
        expect(NEWTONSOFT.charCodeAt(0)).toBe(0xfeff);
        const parsed = parseNuspec(NEWTONSOFT);

        expect(parsed).toMatchObject({
            id: 'Newtonsoft.Json',
            version: '13.0.3',
            title: 'Json.NET',
            description: 'Json.NET is a popular high-performance JSON framework for .NET',
            authors: 'James Newton-King',
            license: 'MIT',
            licenseUrl: 'https://licenses.nuget.org/MIT',
            projectUrl: 'https://www.newtonsoft.com/json',
            iconUrl: 'https://www.newtonsoft.com/content/images/nugeticon.png',
            readme: 'README.md',
        });
        expect(parsed?.dependencies.map(group => group.targetFramework)).toEqual([
            '.NETFramework2.0', '.NETFramework3.5', '.NETFramework4.0', '.NETFramework4.5',
            '.NETStandard1.0', '.NETStandard1.3', 'net6.0', '.NETStandard2.0',
        ]);
        expect(parsed?.dependencies[0].dependencies).toEqual([]);
        expect(parsed?.dependencies[4].dependencies).toEqual([
            { id: 'Microsoft.CSharp', versionRange: '4.3.0' },
            { id: 'NETStandard.Library', versionRange: '1.6.1' },
            { id: 'System.ComponentModel.TypeConverter', versionRange: '4.3.0' },
            { id: 'System.Runtime.Serialization.Primitives', versionRange: '4.3.0' },
        ]);
        expect(parsed?.dependencies[5].dependencies).toHaveLength(6);
    });

    it('reads a nuspec without a namespace, a single group with a single dependency, and a dependency without a version', () => {
        const parsed = parseNuspec(nuspec(
            '<dependencies><group targetFramework="net8.0"><dependency id="Only.One" /></group></dependencies>',
            '<package>',
        ));

        expect(parsed?.dependencies).toEqual([{ targetFramework: 'net8.0', dependencies: [{ id: 'Only.One', versionRange: '*' }] }]);
    });

    it('puts dependencies outside any group into one Any group, and ignores them when groups exist', () => {
        const ungrouped = parseNuspec(nuspec('<dependencies><dependency id="A" version="1.0" /><dependency id="B" version="[2.0,3.0)" /></dependencies>'));
        expect(ungrouped?.dependencies).toEqual([{ targetFramework: ANY_FRAMEWORK, dependencies: [{ id: 'A', versionRange: '1.0' }, { id: 'B', versionRange: '[2.0,3.0)' }] }]);

        const mixed = parseNuspec(nuspec('<dependencies><dependency id="Stray" version="1.0" /><group><dependency id="C" version="1.0" /></group></dependencies>'));
        expect(mixed?.dependencies).toEqual([{ targetFramework: ANY_FRAMEWORK, dependencies: [{ id: 'C', versionRange: '1.0' }] }]);

        expect(parseNuspec(nuspec('<dependencies />'))?.dependencies).toEqual([]);
        expect(parseNuspec(nuspec(''))?.dependencies).toEqual([]);
        expect(parseNuspec(nuspec('<dependencies><dependency version="1.0" /></dependencies>'))?.dependencies).toEqual([]);
    });

    it('takes a license only from an expression, never from a license file', () => {
        expect(parseNuspec(nuspec('<license type="file">LICENSE.txt</license>'))?.license).toBeUndefined();
        expect(parseNuspec(nuspec('<license>MIT</license>'))?.license).toBeUndefined();
        expect(parseNuspec(nuspec('<license type="expression">Apache-2.0 OR MIT</license>'))?.license).toBe('Apache-2.0 OR MIT');
    });

    it('decodes the XML entities and numeric references in text', () => {
        const parsed = parseNuspec(nuspec('<description>Fast &amp; small &lt;T&gt; &#169; 2026 &#x2014; done</description><authors>A &amp; B</authors>'));

        expect(parsed?.description).toBe('Fast & small <T> © 2026 — done');
        expect(parsed?.authors).toBe('A & B');
    });

    it('defaults a missing description and authors to empty text and leaves missing urls undefined', () => {
        const parsed = parseNuspec(nuspec(''));

        expect(parsed).toEqual({ id: 'Contoso.Lib', version: '1.0.0', description: '', authors: '', dependencies: [],
            title: undefined, license: undefined, licenseUrl: undefined, projectUrl: undefined, iconUrl: undefined, readme: undefined });
    });

    it('refuses a document with a DOCTYPE, so no entity of the package is expanded', () => {
        const bomb = `<?xml version="1.0"?>
<!DOCTYPE package [
  <!ENTITY a "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa">
  <!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">
  <!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">
]>
<package><metadata><id>Bomb</id><version>1.0.0</version><description>&c;</description></metadata></package>`;
        expect(parseNuspec(bomb)).toBeUndefined();
        expect(parseNuspec(nuspec('').replace('<package', '<!doctype package><package'))).toBeUndefined();
    });

    it('answers undefined for malformed XML, a missing id or version, another root, and a document over the cap', () => {
        expect(parseNuspec('<package><metadata><id>X</id>')).toBeUndefined();
        // The parser alone is lenient and reads both of these as package X 1.0.0.
        expect(parseNuspec('<package><metadata><id>X</id><version>1.0.0</version></metdata></package>')).toBeUndefined();
        expect(parseNuspec('<package><metadata><id>X</id><version>1.0.0</version></metadata>')).toBeUndefined();
        expect(parseNuspec('not xml at all')).toBeUndefined();
        expect(parseNuspec('')).toBeUndefined();
        expect(parseNuspec('<package><metadata><version>1.0.0</version></metadata></package>')).toBeUndefined();
        expect(parseNuspec('<package><metadata><id>X</id><version>  </version></metadata></package>')).toBeUndefined();
        expect(parseNuspec('<project><metadata><id>X</id><version>1.0.0</version></metadata></project>')).toBeUndefined();
        expect(parseNuspec('<package><id>X</id><version>1.0.0</version></package>')).toBeUndefined();

        const padded = nuspec(`<description>${'x'.repeat(MAX_NUSPEC_CHARS)}</description>`);
        expect(parseNuspec(padded)).toBeUndefined();
    });
});

describe('nuspecToMetadata', () => {
    it('maps the nuspec to package metadata with its origin', () => {
        const parsed = parseNuspec(NEWTONSOFT)!;

        expect(nuspecToMetadata(parsed, { sourceUrl: 'https://api.nuget.org/v3/index.json' })).toEqual({
            id: 'Newtonsoft.Json',
            version: '13.0.3',
            description: 'Json.NET is a popular high-performance JSON framework for .NET',
            authors: 'James Newton-King',
            license: 'MIT',
            licenseUrl: 'https://licenses.nuget.org/MIT',
            projectUrl: 'https://www.newtonsoft.com/json',
            dependencies: parsed.dependencies,
            sourceUrl: 'https://api.nuget.org/v3/index.json',
        });
        const offline = nuspecToMetadata(parseNuspec(nuspec(''))!, { offline: true });
        expect(offline).toEqual({ id: 'Contoso.Lib', version: '1.0.0', description: '', authors: '', dependencies: [], offline: true });
        expect(Object.keys(nuspecToMetadata(parseNuspec(nuspec(''))!))).toEqual(['id', 'version', 'description', 'authors', 'dependencies']);
    });
});
