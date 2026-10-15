/**
 * In-process stand-in for the `dotnet` executable: a `SpawnFunction` that starts no process. It answers
 * the commands the 2.0 core issues and makes `package add` and `package remove` real by editing the
 * project file on disk, so that what an operation did can be read back by the project inspector. On a
 * Central Package Management project `package add --version` writes the central version instead, as the
 * SDK 10 probe recorded (`src/core/cli/__fixtures__/sdk-probes/10.0.401.json`). `msbuild` answers from the
 * project files only when a scenario asks for it (`msbuild = 'files'`); otherwise it prints nothing and every
 * evaluation fails, which leaves the installed lists provisional.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { PassThrough } from 'stream';
import type { SpawnFunction } from '../../core/cli';

export interface DotnetCall {
    args: string[];
    cwd: string;
    /** The arguments joined with spaces, for matching and for messages. */
    line: string;
}

export interface DotnetAnswer {
    code?: number;
    stdout?: string;
    stderr?: string;
    /** Emitted instead of `spawn`: the process could not be started (`ENOENT`, `EMFILE`, …). */
    spawnError?: NodeJS.ErrnoException;
    /** Emitted after `spawn`, before the normal exit. */
    lateError?: Error;
}

export type CallMatcher = (call: DotnetCall) => boolean;

/** Calls that match wait until `release()`; later calls pass again. */
export interface Hold {
    /** How many calls have reached the hold so far. */
    readonly seen: number;
    release(): void;
}

/**
 * A child process that starts nothing: its streams and events are what `DefaultDotnetRunner` reads. Shared by the
 * harness, the runner's own test (`src/core/cli/DotnetRunner.test.ts`) and the composition root's test
 * (`src/extension.next.test.ts`; finding N59).
 */
export class FakeChild extends EventEmitter {
    readonly stdout = new PassThrough();
    readonly stderr = new PassThrough();
    exitCode: number | null = null;
    signalCode: NodeJS.Signals | null = null;

    get ended(): boolean {
        return this.exitCode !== null || this.signalCode !== null;
    }

    kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
        if (this.ended) {
            return false;
        }
        this.signalCode = signal;
        setImmediate(() => this.finish(null, signal));
        return true;
    }

    finish(code: number | null, signal: NodeJS.Signals | null): void {
        this.stdout.end();
        this.stderr.end();
        this.emit('exit', code, signal);
        setImmediate(() => this.emit('close', code, signal));
    }

    /** Plays `answer`: the spawn error alone, or `spawn`, a late error, the output and the exit. */
    answer(answer: DotnetAnswer): void {
        if (answer.spawnError) {
            this.emit('error', answer.spawnError);
            return;
        }
        this.emit('spawn');
        if (answer.lateError) {
            this.emit('error', answer.lateError);
        }
        if (answer.stdout) {
            this.stdout.write(answer.stdout);
        }
        if (answer.stderr) {
            this.stderr.write(answer.stderr);
        }
        this.exitCode = answer.code ?? 0;
        this.finish(this.exitCode, null);
    }
}

const sameDirectory = (a: string, b: string): boolean => path.resolve(a) === path.resolve(b);

/** Matchers for the commands a scenario holds or counts. A directory narrows the match to that working directory. */
export const dotnetCalls = {
    version: (directory?: string): CallMatcher => call => call.args[0] === '--version' && (directory === undefined || sameDirectory(call.cwd, directory)),
    listSources: (directory?: string): CallMatcher => call => call.line.startsWith('nuget list source') && (directory === undefined || sameDirectory(call.cwd, directory)),
    configPaths: (directory?: string): CallMatcher => call => call.line === 'nuget config paths' && (directory === undefined || sameDirectory(call.cwd, directory)),
    packageAdd: (packageId?: string): CallMatcher => call => call.line.startsWith('package add ') && (packageId === undefined || call.args[2] === packageId),
    packageRemove: (packageId?: string): CallMatcher => call => call.line.startsWith('package remove ') && (packageId === undefined || call.args[2] === packageId),
    restore: (): CallMatcher => call => call.args[0] === 'restore',
    msbuild: (projectPath?: string): CallMatcher => call => call.args[0] === 'msbuild' && (projectPath === undefined || sameDirectory(path.dirname(call.args[1]), path.dirname(projectPath))),
};

/** What `dotnet nuget list source --format detailed` prints for enabled sources. */
function listing(urls: readonly string[]): string {
    return ['Registered Sources:', ...urls.flatMap((url, index) => [`  ${index + 1}.  Feed ${index + 1} [Enabled]`, `      ${url}`]), ''].join('\n');
}

function escapeForPattern(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function referencePattern(packageId: string): RegExp {
    return new RegExp(`[ \\t]*<PackageReference\\s+Include="${escapeForPattern(packageId)}"[^>]*/>\\r?\\n?`, 'i');
}

/** Insert the reference before the last `</ItemGroup>`, or replace the one that is there. */
export function addPackageReference(projectPath: string, packageId: string, version: string): void {
    const xml = fs.readFileSync(projectPath, 'utf8');
    const element = `<PackageReference Include="${packageId}" Version="${version}" />`;
    const existing = referencePattern(packageId);
    let next: string;
    if (existing.test(xml)) {
        next = xml.replace(existing, `    ${element}\n`);
    } else if (xml.includes('</ItemGroup>')) {
        const at = xml.lastIndexOf('</ItemGroup>');
        next = `${xml.slice(0, at).trimEnd()}\n    ${element}\n  ${xml.slice(at)}`;
    } else {
        next = xml.replace('</Project>', `  <ItemGroup>\n    ${element}\n  </ItemGroup>\n</Project>`);
    }
    fs.writeFileSync(projectPath, next, 'utf8');
}

export function removePackageReference(projectPath: string, packageId: string): void {
    const xml = fs.readFileSync(projectPath, 'utf8');
    fs.writeFileSync(projectPath, xml.replace(referencePattern(packageId), ''), 'utf8');
}

function optionValue(args: readonly string[], option: string): string | undefined {
    const index = args.indexOf(option);
    return index < 0 ? undefined : args[index + 1];
}

const CENTRAL_PROPS = 'Directory.Packages.props';

/** The nearest file `name` from `directory` upwards, stopping after `stop` when one is given. */
function nearestFile(directory: string, name: string, stop?: string): string | undefined {
    let current = path.resolve(directory);
    for (;;) {
        const candidate = path.join(current, name);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
        const parent = path.dirname(current);
        if (parent === current || (stop !== undefined && current === path.resolve(stop))) {
            return undefined;
        }
        current = parent;
    }
}

/** The `Directory.Packages.props` that governs a project when it switches Central Package Management on. */
function centralPropsOf(projectPath: string, stop?: string): string | undefined {
    const props = nearestFile(path.dirname(projectPath), CENTRAL_PROPS, stop);
    return props !== undefined && /<ManagePackageVersionsCentrally>\s*true\s*<\/ManagePackageVersionsCentrally>/i.test(fs.readFileSync(props, 'utf8')) ? props : undefined;
}

const attributeOf = (element: string, name: string): string | undefined => new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(element)?.[1];
const itemsOf = (xml: string, type: string): string[] => xml.match(new RegExp(`<${type}\\b[^>]*/>`, 'gi')) ?? [];

/** Set the central version of a package in a props file: the entry is replaced, or added before the last `</ItemGroup>`. */
export function setCentralVersion(propsPath: string, packageId: string, version: string): void {
    const xml = fs.readFileSync(propsPath, 'utf8');
    const element = `<PackageVersion Include="${packageId}" Version="${version}" />`;
    const existing = new RegExp(`<PackageVersion\\s+Include="${escapeForPattern(packageId)}"[^>]*/>`, 'i');
    const next = existing.test(xml)
        ? xml.replace(existing, element)
        : `${xml.slice(0, xml.lastIndexOf('</ItemGroup>')).trimEnd()}\n    ${element}\n  ${xml.slice(xml.lastIndexOf('</ItemGroup>'))}`;
    fs.writeFileSync(propsPath, next, 'utf8');
}

/** A versionless reference in the project, unless the project references the package already (probe row `add-absent`). */
function ensureCentralReference(projectPath: string, packageId: string): void {
    const xml = fs.readFileSync(projectPath, 'utf8');
    if (referencePattern(packageId).test(xml)) {
        return;
    }
    const at = xml.lastIndexOf('</ItemGroup>');
    fs.writeFileSync(projectPath, `${xml.slice(0, at).trimEnd()}\n    <PackageReference Include="${packageId}" />\n  ${xml.slice(at)}`, 'utf8');
}

/** What `dotnet msbuild <project> -getProperty:… | -getItem:…` prints for the project files, in the shapes of the SDK probe. */
function evaluateFromFiles(args: readonly string[], stop?: string): DotnetAnswer {
    const projectPath = args[1];
    const xml = fs.readFileSync(projectPath, 'utf8');
    const props = centralPropsOf(projectPath, stop);
    if (args.some(arg => arg.startsWith('-getProperty:'))) {
        const frameworks = /<TargetFrameworks>([^<]*)<\/TargetFrameworks>/i.exec(xml)?.[1] ?? '';
        const framework = frameworks === '' ? /<TargetFramework>([^<]*)<\/TargetFramework>/i.exec(xml)?.[1] ?? '' : '';
        return { stdout: JSON.stringify({ Properties: { TargetFramework: framework, TargetFrameworks: frameworks, ManagePackageVersionsCentrally: props === undefined ? '' : 'true', CentralPackageVersionOverrideEnabled: '' } }, null, 2) };
    }
    const item = (element: string, definedIn: string, names: string[]) => Object.fromEntries([
        ['Identity', attributeOf(element, 'Include')],
        ...names.map(name => [name, attributeOf(element, name)]),
        ['DefiningProjectFullPath', definedIn],
    ].filter(([, value]) => value !== undefined));
    const references = itemsOf(xml, 'PackageReference').map(element => item(element, projectPath, ['Version', 'VersionOverride']));
    const versions = props === undefined ? [] : itemsOf(fs.readFileSync(props, 'utf8'), 'PackageVersion').map(element => item(element, props, ['Version']));
    return { stdout: JSON.stringify({ Items: { PackageReference: references, PackageVersion: versions } }, null, 2) };
}

/** The version `package add` writes when the request names none. */
export const LATEST_VERSION = '1.0.0';

export function createFakeDotnet() {
    const holds: Array<{ matches: CallMatcher; gate: Promise<void>; seen: number }> = [];
    const failures: Array<{ matches: CallMatcher; answer: DotnetAnswer }> = [];

    const answerFor = (call: DotnetCall): DotnetAnswer => {
        const failure = failures.find(entry => entry.matches(call));
        if (failure) {
            return failure.answer;
        }
        if (call.args[0] === '--version') {
            return { stdout: '10.0.401\n' };
        }
        if (call.line.startsWith('nuget list source')) {
            return { stdout: listing(fake.sources(call.cwd)) };
        }
        if (call.args[0] === 'msbuild' && fake.msbuild === 'files') {
            return evaluateFromFiles(call.args, fake.root);
        }
        const projectPath = optionValue(call.args, '--project');
        if (call.line.startsWith('package add ') && projectPath !== undefined) {
            const version = optionValue(call.args, '--version');
            const props = centralPropsOf(projectPath, fake.root);
            if (props === undefined) {
                addPackageReference(projectPath, call.args[2], version ?? LATEST_VERSION);
            } else if (version !== undefined) {
                // SDK 10 on a CPM project: the central version changes, the project keeps a versionless reference.
                setCentralVersion(props, call.args[2], version);
                ensureCentralReference(projectPath, call.args[2]);
            }
        } else if (call.line.startsWith('package remove ') && projectPath !== undefined) {
            removePackageReference(projectPath, call.args[2]);
        }
        // `nuget config paths`, `restore` and everything else: no output, exit 0.
        return {};
    };

    const fake = {
        /** Every call, in the order the core made them. */
        calls: [] as DotnetCall[],
        /** `'files'`: `msbuild` answers from the project files; `'none'`: it prints nothing and the evaluation fails. */
        msbuild: 'none' as 'none' | 'files',
        /** The workspace root: the walk up to `Directory.Packages.props` stops there. */
        root: undefined as string | undefined,
        /** The enabled sources that `nuget list source` reports for a working directory. */
        sources: (_cwd: string): string[] => [],
        count: (matches: CallMatcher): number => fake.calls.filter(matches).length,
        hold(matches: CallMatcher): Hold {
            let release!: () => void;
            const entry = { matches, gate: new Promise<void>(resolve => { release = resolve; }), seen: 0 };
            holds.push(entry);
            return {
                get seen() { return entry.seen; },
                release: () => {
                    holds.splice(holds.indexOf(entry), 1);
                    release();
                },
            };
        },
        /** Calls that match exit with `answer` (exit code 1 by default) until the returned function is called. */
        fail(matches: CallMatcher, answer: DotnetAnswer = { code: 1, stderr: 'error: the command failed' }): () => void {
            const entry = { matches, answer };
            failures.push(entry);
            return () => { failures.splice(failures.indexOf(entry), 1); };
        },
        spawn: ((_file, args, options) => {
            const call: DotnetCall = { args: [...args], cwd: String(options.cwd), line: args.join(' ') };
            fake.calls.push(call);
            const child = new FakeChild();
            void (async () => {
                for (const hold of holds.filter(entry => entry.matches(call))) {
                    hold.seen++;
                    await hold.gate;
                }
                if (child.ended) {
                    // Killed while it was held (a cancelled operation): the kill already reported the exit.
                    return;
                }
                child.answer(answerFor(call));
            })();
            return child as unknown as ReturnType<SpawnFunction>;
        }) as SpawnFunction,
    };
    return fake;
}

export type FakeDotnet = ReturnType<typeof createFakeDotnet>;
