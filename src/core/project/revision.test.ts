import * as fs from 'fs';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { createScratchDir, fixture, writeTree, type ScratchDir } from './__fixtures__/scratch';
import { computeRevision, GLOBAL_JSON_FILE, revisionInputs } from './revision';

const scratches: ScratchDir[] = [];
async function tree(files: Record<string, string>): Promise<string> {
    const scratch = await createScratchDir('revision');
    scratches.push(scratch);
    await writeTree(scratch.dir, files);
    return scratch.dir;
}
const touch = (file: string, seconds: number) => fs.promises.utimes(file, new Date(seconds * 1000), new Date(seconds * 1000));
/** A `global.json` above the repository would be found too; the tests that list inputs leave it out. */
const withoutGlobalJson = (files: string[]) => files.filter(file => path.basename(file) !== GLOBAL_JSON_FILE);

afterEach(async () => {
    await Promise.all(scratches.splice(0).map(scratch => scratch.cleanup()));
});

describe('computeRevision', () => {
    it('is a short hex string that is stable while nothing changes, whatever the order of the files', async () => {
        const dir = await tree({ 'a.csproj': '<Project />', 'nuget.config': '<configuration />' });
        const files = [path.join(dir, 'a.csproj'), path.join(dir, 'nuget.config')];
        const revision = await computeRevision(files);
        expect(revision).toMatch(/^[0-9a-f]{16}$/);
        expect(await computeRevision(files)).toBe(revision);
        expect(await computeRevision([...files].reverse())).toBe(revision);
    });

    it('changes when a file is modified, when its size changes, and when the list changes', async () => {
        const dir = await tree({ 'a.csproj': '<Project />', 'b.props': '<Project />' });
        const a = path.join(dir, 'a.csproj');
        const b = path.join(dir, 'b.props');
        await touch(a, 1_700_000_000);
        await touch(b, 1_700_000_000);
        const before = await computeRevision([a, b]);

        await touch(a, 1_700_000_100);
        const modified = await computeRevision([a, b]);
        expect(modified).not.toBe(before);

        await fs.promises.writeFile(b, '<Project></Project>', 'utf-8');
        await touch(b, 1_700_000_000);
        expect(await computeRevision([a, b])).not.toBe(modified);
        expect(await computeRevision([a])).not.toBe(await computeRevision([a, b]));
    });

    it('counts a file that cannot be read as missing, and notices when it appears', async () => {
        const dir = await tree({ 'a.csproj': '<Project />' });
        const files = [path.join(dir, 'a.csproj'), path.join(dir, 'Directory.Packages.props')];
        const missing = await computeRevision(files);
        expect(await computeRevision(files)).toBe(missing);
        await fs.promises.writeFile(files[1], '<Project />', 'utf-8');
        expect(await computeRevision(files)).not.toBe(missing);
        expect(await computeRevision([])).toMatch(/^[0-9a-f]{16}$/);
    });
});

describe('revisionInputs', () => {
    it('lists the project, the nearest props files and the config files, each once', async () => {
        const project = fixture('cpm', 'App', 'App.csproj');
        const config = path.join(path.resolve('/home'), 'nuget.config');
        expect(withoutGlobalJson(await revisionInputs(project, [config, config], [fixture('cpm')]))).toEqual([project, fixture('cpm', 'Directory.Packages.props'), config]);
        const multi = fixture('multitfm', 'App', 'App.csproj');
        expect(withoutGlobalJson(await revisionInputs(multi, [], [fixture('multitfm')]))).toEqual([multi, fixture('multitfm', 'Directory.Build.props'), fixture('multitfm', 'Directory.Packages.props')]);
    });

    it('finds Directory.Build.targets and the nearest global.json', async () => {
        const dir = await tree({ 'Directory.Build.targets': '<Project />', 'global.json': '{}', [path.join('App', 'global.json')]: '{}', [path.join('App', 'App.csproj')]: '<Project />' });
        const project = path.join(dir, 'App', 'App.csproj');
        expect(await revisionInputs(project, [], [dir])).toEqual([project, path.join(dir, 'Directory.Build.targets'), path.join(dir, 'App', GLOBAL_JSON_FILE)]);
        // global.json is honoured above the stop directory too, as the SDK does.
        expect(await revisionInputs(project, [], [path.join(dir, 'App')])).toEqual([project, path.join(dir, 'App', GLOBAL_JSON_FILE)]);
        expect(await revisionInputs(fixture('sdk8', 'App', 'App.csproj'), [], [fixture('sdk8')])).toEqual([fixture('sdk8', 'App', 'App.csproj'), fixture('sdk8', GLOBAL_JSON_FILE)]);
    });
});
