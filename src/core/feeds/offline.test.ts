import * as fs from 'fs';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScratchDir, writeTree, type ScratchDir } from '../project/__fixtures__/scratch';
import { OfflineMetadataReader, offlineNuspecPath } from './offline';
import { silentLogger } from './testSupport';

const NEWTONSOFT = fs.readFileSync(path.join(__dirname, '__fixtures__', 'newtonsoft.json.13.0.3.nuspec'), 'utf8');

function minimal(id: string, version: string, description = ''): string {
    return `<package><metadata><id>${id}</id><version>${version}</version><description>${description}</description></metadata></package>`;
}

describe('offlineNuspecPath', () => {
    it('lower-cases the id and the normalized version under the folder', () => {
        const folder = path.resolve('/packages');
        expect(offlineNuspecPath(folder, 'Newtonsoft.Json', '13.0.3')).toBe(path.join(folder, 'newtonsoft.json', '13.0.3', 'newtonsoft.json.nuspec'));
        expect(offlineNuspecPath(folder, 'Contoso.Lib', '1.0')).toBe(path.join(folder, 'contoso.lib', '1.0.0', 'contoso.lib.nuspec'));
        expect(offlineNuspecPath(folder, 'Contoso.Lib', '2.0.0.0-Beta.1+build')).toBe(path.join(folder, 'contoso.lib', '2.0.0-beta.1', 'contoso.lib.nuspec'));
    });

    it('answers undefined for an id or version that would leave the folder or is not one NuGet accepts', () => {
        const folder = path.resolve('/packages');
        for (const [id, version] of [
            ['..', '1.0.0'], ['.', '1.0.0'], ['../x', '1.0.0'], ['a/b', '1.0.0'], ['a\\b', '1.0.0'], ['/etc', '1.0.0'],
            ['-x', '1.0.0'], ['', '1.0.0'], ['Contoso', '../..'], ['Contoso', '1.*'], ['Contoso', '[1.0,2.0)'], ['Contoso', 'latest'], ['Contoso', ''],
        ]) {
            expect(offlineNuspecPath(folder, id, version), `${id}@${version}`).toBeUndefined();
        }
    });
});

describe('OfflineMetadataReader', () => {
    let scratch: ScratchDir;

    beforeEach(async () => {
        scratch = await createScratchDir('offline');
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await scratch.cleanup();
    });

    function reader(maxBytes?: number): OfflineMetadataReader {
        return new OfflineMetadataReader({ globalPackagesFolder: async () => scratch.dir, maxBytes, logger: silentLogger });
    }

    it('reads a restored package version as offline metadata without a source', async () => {
        await writeTree(scratch.dir, { 'newtonsoft.json/13.0.3/newtonsoft.json.nuspec': NEWTONSOFT });

        const metadata = await reader().metadata('Newtonsoft.Json', '13.0.3');

        expect(metadata).toMatchObject({ id: 'Newtonsoft.Json', version: '13.0.3', authors: 'James Newton-King', license: 'MIT', offline: true });
        expect(metadata?.dependencies).toHaveLength(8);
        expect(metadata).not.toHaveProperty('sourceUrl');
    });

    it('finds the version folder by the normalized version, whatever the case of the request', async () => {
        await writeTree(scratch.dir, { 'contoso.lib/1.0.0-beta/contoso.lib.nuspec': minimal('Contoso.Lib', '1.0.0-beta') });

        await expect(reader().metadata('CONTOSO.LIB', '1.0-BETA')).resolves.toMatchObject({ id: 'Contoso.Lib', offline: true });
        await expect(reader().metadata('contoso.lib', '1.0.0.0-beta')).resolves.toMatchObject({ version: '1.0.0-beta' });
    });

    it('answers undefined when the package is not restored or there is no global-packages folder', async () => {
        await expect(reader().metadata('Not.There', '1.0.0')).resolves.toBeUndefined();
        await expect(new OfflineMetadataReader({ globalPackagesFolder: async () => undefined, logger: silentLogger }).metadata('A', '1.0.0')).resolves.toBeUndefined();
        await expect(new OfflineMetadataReader({ globalPackagesFolder: async () => '', logger: silentLogger }).metadata('A', '1.0.0')).resolves.toBeUndefined();
        await expect(new OfflineMetadataReader({ globalPackagesFolder: () => Promise.reject(new Error('dotnet missing')), logger: silentLogger }).metadata('A', '1.0.0')).resolves.toBeUndefined();
    });

    it('reads nothing for an id or version that would leave the folder', async () => {
        await writeTree(scratch.dir, { 'outside.nuspec': minimal('Outside', '1.0.0') });
        const stat = vi.spyOn(fs.promises, 'stat');
        const readFile = vi.spyOn(fs.promises, 'readFile');

        await expect(reader().metadata('..', '1.0.0')).resolves.toBeUndefined();
        await expect(reader().metadata('../outside', '1.0.0')).resolves.toBeUndefined();
        await expect(reader().metadata('x', '../..')).resolves.toBeUndefined();

        expect(stat).not.toHaveBeenCalled();
        expect(readFile).not.toHaveBeenCalled();
    });

    it('answers undefined for a nuspec over the cap, a malformed nuspec and a directory in its place', async () => {
        await writeTree(scratch.dir, {
            'big/1.0.0/big.nuspec': minimal('Big', '1.0.0', 'x'.repeat(4096)),
            'broken/1.0.0/broken.nuspec': '<package><metadata><id>Broken',
            'dir/1.0.0/dir.nuspec/placeholder.txt': '',
        });
        const capped = reader(1024);
        const readFile = vi.spyOn(fs.promises, 'readFile');

        await expect(capped.metadata('Big', '1.0.0')).resolves.toBeUndefined();
        await expect(capped.metadata('Dir', '1.0.0')).resolves.toBeUndefined();
        expect(readFile).not.toHaveBeenCalled();

        await expect(reader().metadata('Big', '1.0.0')).resolves.toMatchObject({ id: 'Big' });
        await expect(capped.metadata('Broken', '1.0.0')).resolves.toBeUndefined();
    });

    it('caches nothing, so a package restored or changed later is read as it is now', async () => {
        const offline = reader();
        await expect(offline.metadata('Later', '1.0.0')).resolves.toBeUndefined();

        await writeTree(scratch.dir, { 'later/1.0.0/later.nuspec': minimal('Later', '1.0.0', 'first') });
        await expect(offline.metadata('Later', '1.0.0')).resolves.toMatchObject({ description: 'first' });

        await writeTree(scratch.dir, { 'later/1.0.0/later.nuspec': minimal('Later', '1.0.0', 'second') });
        await expect(offline.metadata('Later', '1.0.0')).resolves.toMatchObject({ description: 'second' });
    });
});
