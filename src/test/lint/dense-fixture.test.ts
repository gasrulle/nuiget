import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * UX-P0.6 (H28, H72, MULTI-FOLDER): the dense static workspace the capture suite opens. Its named states assert
 * structure, never a live "latest" value, so this test pins the structure they rely on: two workspace folders, one
 * source, a multi-target project, a Central Package Management project, a floating version, prereleases, long ids,
 * one package pinned to a version with a permanent advisory, and a project that resolves SDK 8 (Unsupported).
 */
const ROOT = path.join(process.cwd(), 'src/test/ui/fixtures/dense-workspace');
const read = (relative: string): string => readFileSync(path.join(ROOT, relative), 'utf8');

interface Reference { id: string; version: string | undefined }

/** The `PackageReference` (or `PackageVersion`) items of an MSBuild file, in document order. */
function items(xml: string, element: 'PackageReference' | 'PackageVersion'): Reference[] {
    return [...xml.matchAll(new RegExp(`<${element}\\s+Include="([^"]+)"(?:\\s+Version="([^"]+)")?\\s*/>`, 'g'))]
        .map(match => ({ id: match[1], version: match[2] }));
}

function property(xml: string, name: string): string | undefined {
    return new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1];
}

const GATEWAY = read('app/Gateway/Gateway.csproj');
const CATALOG = read('app/Catalog/Catalog.csproj');
const UTILITY = read('tools/Utility/Utility.csproj');
const PROPS = read('app/Directory.Packages.props');
const centralVersions = new Map(items(PROPS, 'PackageVersion').map(item => [item.id, item.version]));

/** Each SDK 10 project's direct references with the version that applies to it. */
const PROJECTS: Record<string, Reference[]> = {
    Gateway: items(GATEWAY, 'PackageReference'),
    Catalog: items(CATALOG, 'PackageReference').map(item => ({ id: item.id, version: centralVersions.get(item.id) })),
    Utility: items(UTILITY, 'PackageReference'),
};

const isPrerelease = (version: string | undefined): boolean => /^\d+(\.\d+)*-/.test(version ?? '');
const isFloating = (version: string | undefined): boolean => /[*[\](),]/.test(version ?? '');

describe('the dense fixture workspace (UX-P0.6)', () => {
    it('opens two workspace folders, app and tools, over one nuget.org source', () => {
        const workspace = JSON.parse(read('dense.code-workspace')) as { folders: { path: string }[] };
        expect(workspace.folders.map(folder => folder.path)).toEqual(['app', 'tools']);

        const config = read('nuget.config');
        expect(config).toMatch(/<packageSources>\s*<clear\s*\/>/);
        expect([...config.matchAll(/<add key="([^"]+)" value="([^"]+)"/g)].map(match => [match[1], match[2]]))
            .toEqual([['nuget.org', 'https://api.nuget.org/v3/index.json']]);
    });

    it('has a multi-target project, a Central Package Management project and a plain one', () => {
        expect(property(GATEWAY, 'TargetFrameworks')).toBe('net8.0;netstandard2.0');
        expect(property(CATALOG, 'TargetFramework')).toBe('net8.0');
        expect(property(UTILITY, 'TargetFramework')).toBe('net8.0');

        expect(property(PROPS, 'ManagePackageVersionsCentrally')).toBe('true');
        // Gateway sits under the same props file and opts out, so it keeps its own versions.
        expect(property(GATEWAY, 'ManagePackageVersionsCentrally')).toBe('false');
        expect(items(CATALOG, 'PackageReference').filter(item => item.version !== undefined)).toEqual([]);
        expect(PROJECTS.Catalog.filter(item => item.version === undefined).map(item => item.id)).toEqual([]);
    });

    it('gives every SDK 10 project 12 to 15 direct references, a prerelease and three ids of 40 characters or more', () => {
        for (const [name, references] of Object.entries(PROJECTS)) {
            expect(references.length, name).toBeGreaterThanOrEqual(12);
            expect(references.length, name).toBeLessThanOrEqual(15);
            expect(new Set(references.map(item => item.id.toLowerCase())).size, `${name} ids are unique`).toBe(references.length);
            expect(references.filter(item => isPrerelease(item.version)).length, `${name} prereleases`).toBeGreaterThanOrEqual(1);
            expect(references.filter(item => item.id.length >= 40).length, `${name} long ids`).toBeGreaterThanOrEqual(3);
        }
    });

    it('pins every version except one floating version in Utility', () => {
        const floating = Object.entries(PROJECTS)
            .flatMap(([name, references]) => references.filter(item => isFloating(item.version)).map(item => `${name}: ${item.id} ${item.version}`));
        expect(floating).toEqual(['Utility: Serilog 3.*']);
    });

    it('pins Newtonsoft.Json 12.0.1 in Gateway, a version with a permanent advisory', () => {
        expect(PROJECTS.Gateway).toContainEqual({ id: 'Newtonsoft.Json', version: '12.0.1' });
    });

    it('makes the Unsupported project resolve SDK 8.0.425 exactly', () => {
        expect(JSON.parse(read('tools/Unsupported/global.json'))).toEqual({ sdk: { version: '8.0.425', rollForward: 'disable' } });
        expect(property(read('tools/Unsupported/Unsupported.csproj'), 'TargetFramework')).toBe('net8.0');
    });
});
