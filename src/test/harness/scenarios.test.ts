import * as fs from 'fs';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MainPanelHost } from '../../host/MainPanelHost';
import { makeEvent, makeOk, resourceKeys, type BulkOutcome, type InstalledResult, type OperationOutcome, type RequestType, type ResponseEnvelope } from '../../protocol';
import { dotnetCalls } from './fakeDotnet';
import { FakeWebview } from './FakeWebview';
import {
    PRIVATE_FEED,
    SHARED_FEED,
    WATCHER_DEBOUNCE_MS,
    centralPropsXml,
    createHarness,
    expectOneResponsePerRequest,
    packagesOf,
    projectXml,
    type Harness,
} from './harness';

const TWO_PROJECTS = {
    'A/A.csproj': projectXml(['Serilog', '3.0.0']),
    'B/B.csproj': projectXml(['Newtonsoft.Json', '13.0.1']),
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The result of an ok response; the scenario fails when the request was answered with an error. */
function resultOf<T extends RequestType>(response: ResponseEnvelope<T>) {
    if (!response.ok) {
        throw new Error(`${response.type} was answered with ${response.error.code}: ${response.error.message}`);
    }
    return response.result;
}

/** A few turns of the real event loop: enough for what is already in flight, nothing a scenario's outcome may depend on. */
async function turns(count = 5): Promise<void> {
    for (let i = 0; i < count; i++) {
        await new Promise<void>(resolve => setImmediate(resolve));
    }
}

const statusOf = (outcome: OperationOutcome | BulkOutcome) => outcome.status;

describe('two-surface harness', () => {
    let h: Harness | undefined;

    afterEach(async () => {
        await h?.teardown();
        h = undefined;
    });

    it('A→B→A ordering: both surfaces follow every session revision and end on the last selection', async () => {
        h = await createHarness({
            tree: TWO_PROJECTS,
            selectedProject: 'A/A.csproj',
            selectedSource: PRIVATE_FEED,
            sources: { A: [PRIVATE_FEED, SHARED_FEED], B: [SHARED_FEED] },
        });
        const [A, B] = [h.path('A/A.csproj'), h.path('B/B.csproj')];
        const sidebar = await h.resolve('sidebar');
        const main = await h.resolve('main');
        await h.expectState({ selectedProject: A, selectedSource: PRIVATE_FEED, projects: [A, B], installed: ['Serilog@3.0.0'] });
        const before = h.services.session.snapshot.rev;

        // The sidebar selects B and the host starts listing B's sources; the main panel selects A again
        // before that listing has answered.
        const listing = h.dotnet.hold(dotnetCalls.listSources(path.dirname(B)));
        await h.selectProject('sidebar', B);
        await h.settle(() => expect(listing.seen).toBeGreaterThanOrEqual(1));
        await h.selectProject('main', A);
        listing.release();

        // Convergence (ADR-001, the condition of the P1.7 ruling): both surfaces equal the host and show A.
        // The source that only A has is still selected: it was never judged against B's list.
        await h.expectState({ selectedProject: A, selectedSource: PRIVATE_FEED, projects: [A, B], installed: ['Serilog@3.0.0'] });
        const last = h.services.session.snapshot.rev;
        expect(last).toBeGreaterThanOrEqual(before + 2);
        for (const webview of [sidebar, main]) {
            // Every revision reached the surface, in order, none skipped.
            const followed = webview.appliedRevs.filter(rev => rev >= before);
            expect(followed, `${webview.surface}: applied revisions`).toEqual(Array.from({ length: last - before + 1 }, (_, index) => before + index));
            expect(webview.session?.selectedSource).toBe(PRIVATE_FEED);
        }
    });

    type Trigger = 'full' | 'scoped' | 'watcher';
    it.each<[Trigger, Trigger, string[]]>([
        ['full', 'scoped', []],
        ['scoped', 'full', []],
        ['full', 'watcher', ['Serilog@3.0.0', 'Foo@1.0.0']],
        ['watcher', 'full', ['Serilog@3.0.0', 'Foo@1.0.0']],
        ['scoped', 'watcher', ['Foo@1.0.0']],
        ['watcher', 'scoped', ['Foo@1.0.0']],
    ])('full/scoped/watcher invalidation both orders: %s, then %s while the first recomputation runs', async (first, second, expected) => {
        const harness = h = await createHarness({ tree: TWO_PROJECTS, selectedProject: 'A/A.csproj' });
        const [A, B] = [harness.path('A/A.csproj'), harness.path('B/B.csproj')];
        const main = await harness.resolve('main');
        await harness.expectState({ selectedProject: A, projects: [A, B], installed: ['Serilog@3.0.0'] });

        const trigger = async (kind: Trigger): Promise<void> => {
            if (kind === 'full') {
                // A manual refresh: scope `workspace`.
                await harness.refresh('main');
            } else if (kind === 'scoped') {
                // An operation: the fake dotnet removes the reference on disk, the host invalidates the project.
                const outcome = resultOf(await harness.operate('main', 'ops/remove', { projectPath: A, packageId: 'Serilog' }).response);
                expect(outcome.status).toBe('completed');
            } else {
                // An edit from outside, seen by the project-file watcher after its debounce.
                harness.files.addReference(A, 'Foo', '1.0.0');
                await harness.advance(WATCHER_DEBOUNCE_MS);
            }
        };

        // Every recomputation of A's packages stalls here until the scenario lets it go.
        const recomputation = harness.dotnet.hold(dotnetCalls.configPaths(path.dirname(A)));
        await trigger(first);
        await harness.settle(() => expect(recomputation.seen).toBe(1));

        // A surface that arrives now asks for the current state itself (N8); the other one hears nothing new about the session.
        const sessionEventsOfMain = main.events('session/changed').length;
        const sidebar = await harness.resolve('sidebar');
        await trigger(second);
        await harness.settle(() => expect(recomputation.seen).toBe(2));
        const released = new Map<FakeWebview, number>([[main, main.received.length], [sidebar, sidebar.received.length]]);
        recomputation.release();

        await harness.expectState({ selectedProject: A, projects: [A, B], installed: expected });
        expect(main.events('session/changed')).toHaveLength(sessionEventsOfMain);
        for (const [webview, position] of released) {
            // Nothing computed before the second invalidation is delivered afterwards, to any request, whether
            // the surface would still show it or not (ADR-002: a result that an invalidation overtook is never an answer).
            const answers = webview.received.slice(position).filter((message): message is ResponseEnvelope<'installed/get'> => message.kind === 'response' && message.type === 'installed/get');
            expect(answers.length, `${webview.surface}: installed/get responses after the release`).toBeGreaterThan(0);
            for (const answer of answers) {
                expect(packagesOf(resultOf(answer)), `${webview.surface}: an installed/get response after the release`).toEqual(expected);
            }
            expect(packagesOf(webview.installedHistory.at(-1)?.result), `${webview.surface}: the list it shows`).toEqual(expected);
        }
        // One computation per generation for both surfaces: the stalled one was abandoned once, not restarted per request.
        expect(recomputation.seen).toBe(2);
    });

    it('queue saturation + exception after admission: the seventh is refused with its ticket, a throwing operation fails and the queue goes on', async () => {
        h = await createHarness({ tree: TWO_PROJECTS, selectedProject: 'A/A.csproj' });
        const [A, B] = [h.path('A/A.csproj'), h.path('B/B.csproj')];
        const sidebar = await h.resolve('sidebar');
        const main = await h.resolve('main');
        await h.expectState({ selectedProject: A, projects: [A, B], installed: ['Serilog@3.0.0'] });

        // Seven installs from both surfaces while the first one is held inside `dotnet package add`.
        const add = h.dotnet.hold(dotnetCalls.packageAdd());
        const ids = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'];
        const requests = ids.map((packageId, index) => h!.operate(index % 2 === 0 ? 'sidebar' : 'main', 'ops/install', { projectPath: A, packageId, version: '1.0.0' }));

        // One running, five waiting: the seventh is answered at once, as an outcome, with the ticket's id.
        const refused = resultOf(await requests[6].response);
        expect(refused).toMatchObject({ status: 'rejected', kind: 'install', projectPath: A, packageId: 'P7', message: 'the operation queue is full (1 running, 5 waiting)' });
        expect(refused.opId).toMatch(UUID);
        expect(sidebar.chunksFor<'ops/install'>(requests[6].id)).toEqual([{ opId: refused.opId, status: 'rejected' }]);
        await h.settle(() => {
            expect(add.seen).toBe(1);
            for (const webview of [sidebar, main]) {
                expect(webview.completed().filter(outcome => outcome.opId === refused.opId).map(statusOf)).toEqual(['rejected']);
            }
        });
        expect(h.statusBar.text).toBe('$(sync~spin) nUIget: 1 running, 5 queued');
        expect(h.statusBar.hide).not.toHaveBeenCalled();

        add.release();
        const outcomes = await Promise.all(requests.slice(0, 6).map(async request => resultOf(await request.response)));
        expect(outcomes.map(outcome => [outcome.packageId, outcome.status])).toEqual(ids.slice(0, 6).map(packageId => [packageId, 'completed']));
        const adds = h.dotnet.calls.filter(dotnetCalls.packageAdd());
        // First in, first out, and only the noun-first form.
        expect(adds.map(call => call.args.slice(0, 5))).toEqual(ids.slice(0, 6).map(packageId => ['package', 'add', packageId, '--project', A]));
        await h.expectState({ selectedProject: A, projects: [A, B], installed: ['Serilog@3.0.0', ...ids.slice(0, 6).map(packageId => `${packageId}@1.0.0`)] });
        for (const webview of [sidebar, main]) {
            // Both surfaces heard about all seven, whoever asked.
            expect(webview.completed().map(statusOf).sort()).toEqual([...Array<string>(6).fill('completed'), 'rejected']);
        }
        expect(h.statusBar.hide).toHaveBeenCalled();

        // A workflow that throws after the queue admitted it: the ticket still settles, as `failed`.
        const thrown = vi.spyOn(h.services.workflows, 'single').mockRejectedValueOnce(new Error('boom at https://user:secret@feed.example/v3/index.json'));
        const failed = resultOf(await h.operate('sidebar', 'ops/remove', { projectPath: A, packageId: 'Serilog' }).response);
        thrown.mockRestore();
        expect(failed).toMatchObject({ status: 'failed', kind: 'remove', projectPath: A, packageId: 'Serilog' });
        expect(failed.message).toContain('boom');
        expect(failed.message).not.toContain('secret');
        await h.settle(() => {
            for (const webview of [sidebar, main]) {
                expect(webview.completed().filter(outcome => outcome.opId === failed.opId).map(statusOf)).toEqual(['failed']);
            }
        });

        // The queue did not stall on it.
        const next = resultOf(await h.operate('main', 'ops/install', { projectPath: A, packageId: 'After', version: '2.0.0' }).response);
        expect(next.status).toBe('completed');
        await h.expectState({ selectedProject: A, projects: [A, B], installed: ['Serilog@3.0.0', ...ids.slice(0, 6).map(packageId => `${packageId}@1.0.0`), 'After@2.0.0'] });
    });

    it('project deletion mid-request: the request is answered once and both surfaces move to the remaining project', async () => {
        h = await createHarness({ tree: TWO_PROJECTS, selectedProject: 'A/A.csproj', selectedSource: SHARED_FEED });
        const [A, B] = [h.path('A/A.csproj'), h.path('B/B.csproj')];

        // Both surfaces ask for A's packages, and the computation they share stalls.
        const computation = h.dotnet.hold(dotnetCalls.configPaths(path.dirname(A)));
        const sidebar = await h.resolve('sidebar');
        const main = await h.resolve('main');
        await h.settle(() => {
            expect(computation.seen).toBe(1);
            expect(sidebar.latestId('installed')).toBeDefined();
            expect(main.latestId('installed')).toBeDefined();
        });

        // The project file disappears while they wait.
        h.files.deleteProject(A);
        await h.advance(WATCHER_DEBOUNCE_MS);
        await h.settle(() => expect(h!.services.session.snapshot.selectedProject).toBe(B));
        computation.release();

        await h.expectState({ selectedProject: B, selectedSource: SHARED_FEED, projects: [B], installed: ['Newtonsoft.Json@13.0.1'] });
        for (const webview of [sidebar, main]) {
            const askedForA = webview.sent.filter(message => message.kind === 'request' && message.type === 'installed/get' && (message.payload as { projectPath: string }).projectPath === A);
            expect(askedForA.length, `${webview.surface}: requests for the deleted project`).toBeGreaterThanOrEqual(1);
            for (const request of askedForA) {
                // Exactly one terminal response each, and it says what happened to the project.
                const responses = webview.responsesFor(request.id);
                expect(responses).toHaveLength(1);
                expect(resultOf(responses[0] as ResponseEnvelope<'installed/get'>).unsupported).toMatchObject({ reason: 'not-found' });
            }
            // The late answers for A were recorded and never shown (R4).
            expect(webview.installedHistory.map(entry => entry.result.projectPath)).toEqual([B]);
            expect(webview.events('projects/changed').at(-1)?.projects.map(project => project.path)).toEqual([B]);
            expect(webview.events('session/changed').at(-1)?.selectedProject).toBe(B);
        }
    });

    it('shared query with one subscriber cancelling: one computation, the other surface is still answered', async () => {
        h = await createHarness({ tree: TWO_PROJECTS, selectedProject: 'A/A.csproj' });
        const A = h.path('A/A.csproj');
        const directory = path.dirname(A);

        const computation = h.dotnet.hold(dotnetCalls.configPaths(directory));
        const main = await h.resolve('main');
        const sidebar = await h.resolve('sidebar');
        await h.settle(() => {
            expect(computation.seen).toBe(1);
            expect(main.latestId('installed')).toBeDefined();
            expect(sidebar.latestId('installed')).toBeDefined();
        });
        const [mainId, sidebarId] = [main.latestId('installed')!, sidebar.latestId('installed')!];

        // The main panel loses interest. The computation belongs to the sidebar as well and goes on.
        h.cancel('main', mainId);
        await turns();
        expect(main.responsesFor(mainId)).toEqual([]);
        expect(sidebar.responsesFor(sidebarId)).toEqual([]);
        computation.release();

        await h.settle(() => {
            expect(main.responsesFor(mainId)).toHaveLength(1);
            expect(sidebar.responsesFor(sidebarId)).toHaveLength(1);
        });
        expect(packagesOf(resultOf(sidebar.responsesFor(sidebarId)[0] as ResponseEnvelope<'installed/get'>))).toEqual(['Serilog@3.0.0']);
        expect(main.responsesFor(mainId)[0]).toMatchObject({ ok: false, error: { code: 'cancelled' } });
        // Computed once for both: one SDK probe, one walk of the config chain (ADR-002 invariant 1).
        expect(h.dotnet.count(dotnetCalls.version(directory))).toBe(1);
        expect(h.dotnet.count(dotnetCalls.configPaths(directory))).toBe(1);
        await h.settle();
        [main, sidebar].forEach(expectOneResponsePerRequest);
    });

    it('surface disposed with pending ops: the operations finish, the other surface hears of them, the closed one hears nothing', async () => {
        h = await createHarness({ tree: TWO_PROJECTS, selectedProject: 'A/A.csproj' });
        const [A, B] = [h.path('A/A.csproj'), h.path('B/B.csproj')];
        const sidebar = await h.resolve('sidebar');
        await h.resolve('main');
        await h.expectState({ selectedProject: A, projects: [A, B], installed: ['Serilog@3.0.0'] });

        // The main panel has a read in flight, an operation running and one waiting.
        const read = h.dotnet.hold(dotnetCalls.configPaths(path.dirname(A)));
        await h.refresh('main');
        await h.settle(() => expect(read.seen).toBe(1));
        const add = h.dotnet.hold(dotnetCalls.packageAdd());
        h.operate('main', 'ops/install', { projectPath: A, packageId: 'Foo', version: '1.0.0' });
        h.operate('main', 'ops/remove', { projectPath: A, packageId: 'Serilog' });
        await h.settle(() => expect(add.seen).toBe(1));
        expect(h.services.queue.pendingCount).toBe(1);

        // The user closes it.
        const closed = h.dispose('main');
        expect(MainPanelHost.instance).toBeUndefined();
        const receivedWhenClosed = closed.received.length;
        add.release();
        read.release();

        // Closing a surface cancels nothing it queued (N9): both edits happened, and the sidebar shows them.
        await h.expectState({ selectedProject: A, projects: [A, B], installed: ['Foo@1.0.0'] });
        expect(h.dotnet.count(dotnetCalls.packageAdd('Foo'))).toBe(1);
        expect(h.dotnet.count(dotnetCalls.packageRemove('Serilog'))).toBe(1);
        expect(sidebar.completed().map(outcome => [(outcome as OperationOutcome).kind, outcome.status])).toEqual([['install', 'completed'], ['remove', 'completed']]);
        expect(h.services.queue.isBusy).toBe(false);
        expect(closed.received).toHaveLength(receivedWhenClosed);

        // A panel opened afterwards is a new surface with the current state.
        const reopened = await h.resolve('main');
        expect(reopened).not.toBe(closed);
        await h.expectState({ selectedProject: A, projects: [A, B], installed: ['Foo@1.0.0'] });
        expect(reopened.session).toEqual(h.services.session.snapshot);
    });

    it('central version change affecting several projects: one props edit reaches both projects on both surfaces', async () => {
        h = await createHarness({
            tree: {
                'Cpm/Directory.Packages.props': centralPropsXml(['Newtonsoft.Json', '13.0.1']),
                'Cpm/C1/C1.csproj': projectXml(['Newtonsoft.Json']),
                'Cpm/C2/C2.csproj': projectXml(['Newtonsoft.Json']),
            },
            selectedProject: 'Cpm/C1/C1.csproj',
        });
        const [C1, C2, props] = [h.path('Cpm/C1/C1.csproj'), h.path('Cpm/C2/C2.csproj'), h.path('Cpm/Directory.Packages.props')];
        // The sidebar shows one project, the main panel all of them.
        const sidebar = await h.resolve('sidebar');
        const main = await h.resolve('main');
        h.showAllProjects('main');
        await h.expectState({
            selectedProject: C1,
            projects: [C1, C2],
            installed: ['Newtonsoft.Json@13.0.1'],
            allProjects: { [C1]: ['Newtonsoft.Json@13.0.1'], [C2]: ['Newtonsoft.Json@13.0.1'] },
        });
        expect(sidebar.installed?.isCpm).toBe(true);
        expect(sidebar.installed?.packages[0]).toMatchObject({ declaration: 'central' });
        const before = new Map([sidebar, main].map(webview => [webview, webview.events('resources/invalidated').length]));

        // The central version changes in the props file; neither project file is touched.
        h.files.writeProps(props, centralPropsXml(['Newtonsoft.Json', '13.0.3']));
        await h.advance(WATCHER_DEBOUNCE_MS - 1);
        await turns();
        for (const [webview, count] of before) {
            expect(webview.events('resources/invalidated'), `${webview.surface}: before the debounce has passed`).toHaveLength(count);
        }
        await h.advance(1);

        await h.expectState({
            selectedProject: C1,
            projects: [C1, C2],
            installed: ['Newtonsoft.Json@13.0.3'],
            allProjects: { [C1]: ['Newtonsoft.Json@13.0.3'], [C2]: ['Newtonsoft.Json@13.0.3'] },
        });
        for (const [webview, count] of before) {
            // One event for the edit, and it names both projects' packages, with their new generations.
            const events = webview.events('resources/invalidated').slice(count);
            expect(events, `${webview.surface}: invalidations for the edit`).toHaveLength(1);
            expect(events[0]).toMatchObject({ scope: { kind: 'workspace' }, reason: 'file-watcher' });
            expect(events[0].keys.map(entry => entry.key)).toEqual(expect.arrayContaining([resourceKeys.installed(C1), resourceKeys.installed(C2)]));
        }
        expect(sidebar.installed?.packages[0]).toMatchObject({ declaration: 'central', definedIn: props });
    });

    it('sidebar: uninstall then watcher invalidation converges', async () => {
        h = await createHarness({ tree: TWO_PROJECTS, selectedProject: 'A/A.csproj' });
        const [A, B] = [h.path('A/A.csproj'), h.path('B/B.csproj')];
        const sidebar = await h.resolve('sidebar');
        const main = await h.resolve('main');
        await h.expectState({ selectedProject: A, projects: [A, B], installed: ['Serilog@3.0.0'] });
        const marks = new Map([sidebar, main].map(webview => [webview, webview.received.length]));

        // The sidebar uninstalls. The reference is out of the project file; the restore after it is still running.
        const restore = h.dotnet.hold(dotnetCalls.restore());
        const request = h.operate('sidebar', 'ops/remove', { projectPath: A, packageId: 'Serilog' });
        await h.settle(() => expect(restore.seen).toBe(1));
        expect(fs.readFileSync(A, 'utf8')).not.toContain('Serilog');
        // The row's spinner: the request was told at once that its operation is in the queue.
        expect(sidebar.chunksFor<'ops/remove'>(request.id)[0]).toMatchObject({ status: 'queued' });

        // The project-file watcher sees the edit the operation made, as it does in VS Code, and its debounce runs out.
        h.files.writeProject(A, fs.readFileSync(A, 'utf8'));
        await h.advance(WATCHER_DEBOUNCE_MS);
        restore.release();
        const outcome = resultOf(await request.response);
        expect(outcome).toMatchObject({ kind: 'remove', status: 'completed', projectPath: A, packageId: 'Serilog' });
        await h.advance(WATCHER_DEBOUNCE_MS);

        // Two invalidations reach both surfaces, the operation's and the watcher's, in whichever order; both
        // surfaces end with the same empty list, and it is the list of the generation the last event listed.
        await h.expectState({ selectedProject: A, projects: [A, B], installed: [] });
        expect(h.dotnet.count(dotnetCalls.packageRemove('Serilog'))).toBe(1);
        for (const webview of [sidebar, main]) {
            const since = webview.received.slice(marks.get(webview));
            const events = since.filter(message => message.kind === 'event' && message.type === 'resources/invalidated').map(message => (message as unknown as { payload: { reason: string; keys: Array<{ key: string; generation: number }> } }).payload);
            expect(new Set(events.map(event => event.reason)), `${webview.surface}: reasons of the invalidations`).toEqual(new Set(['operation', 'file-watcher']));
            expect(webview.completed().map(statusOf), `${webview.surface}: outcomes announced`).toEqual(['completed']);
            expect(webview.installed?.packages, `${webview.surface}: the list that is shown`).toEqual([]);
            const listed = events.flatMap(event => event.keys).filter(entry => entry.key === resourceKeys.installed(A)).at(-1)?.generation;
            const applied = webview.received[webview.installedHistory.at(-1)!.receivedAt] as ResponseEnvelope<'installed/get'> & { ok: true };
            expect(applied.generation, `${webview.surface}: generation of the list that is shown`).toBe(listed);
            // Whatever was answered for an earlier generation was not shown after a newer one (R4, R7).
            expect(webview.installedHistory.map(entry => entry.result.packages.length).slice(-1)).toEqual([0]);
            expectOneResponsePerRequest(webview);
        }
        expect(h.services.queue.isBusy).toBe(false);
    });

    it('generation on responses: every resource response carries the generation the latest invalidation lists for its key, on both surfaces', async () => {
        h = await createHarness({ tree: TWO_PROJECTS, selectedProject: 'A/A.csproj' });
        const [A, B] = [h.path('A/A.csproj'), h.path('B/B.csproj')];
        const surfaces = [await h.resolve('sidebar'), await h.resolve('main')];
        await h.expectState({ selectedProject: A, projects: [A, B], installed: ['Serilog@3.0.0'] });
        const generations = (webview: FakeWebview, type: RequestType, from = 0): Array<number | undefined> => webview.received
            .slice(from)
            .filter((message): message is ResponseEnvelope & { ok: true } => message.kind === 'response' && message.ok && message.type === type)
            .map(message => message.generation);

        // One computation per key for both surfaces, so one generation: both show results of the same number.
        const installedBefore = surfaces.flatMap(webview => generations(webview, 'installed/get'));
        const projectsBefore = surfaces.flatMap(webview => generations(webview, 'projects/list'));
        expect(installedBefore).toEqual([1, 1]);
        expect(projectsBefore).toEqual([1, 1]);

        const marks = surfaces.map(webview => webview.received.length);
        await h.refresh('main');
        await h.expectState({ selectedProject: A, projects: [A, B], installed: ['Serilog@3.0.0'] });
        for (const name of ['sidebar', 'main'] as const) {
            await h.request(name, 'projects/list', {}).response;
        }

        surfaces.forEach((webview, index) => {
            const event = webview.events('resources/invalidated').at(-1);
            const listed = new Map(event?.keys.map(entry => [entry.key, entry.generation]));
            expect(listed.get(resourceKeys.installed(A)), `${webview.surface}: generation listed for the installed packages`).toBe(2);
            expect(listed.get(resourceKeys.projects()), `${webview.surface}: generation listed for the projects`).toBe(2);
            // What the host answers after the event is of exactly the generation the event listed: a webview
            // that compares the two (ADR-008) keeps every one of these and would drop anything older.
            const installedAfter = generations(webview, 'installed/get', marks[index]);
            expect(installedAfter.length, `${webview.surface}: installed/get responses after the refresh`).toBeGreaterThan(0);
            expect(new Set(installedAfter)).toEqual(new Set([listed.get(resourceKeys.installed(A))]));
            expect(new Set(generations(webview, 'projects/list', marks[index]))).toEqual(new Set([listed.get(resourceKeys.projects())]));
            expect(webview.discarded).toEqual([]);
            expectOneResponsePerRequest(webview);
        });
    });
});

describe('fake webview model', () => {
    it('rule 7: a response below the generation an invalidation listed for its key is recorded and not applied', () => {
        const projectPath = '/w/App/App.csproj';
        const resultWith = (id: string): InstalledResult => ({ projectPath, fidelity: 'provisional', isCpm: false, packages: [{ id, version: '1.0.0', versionType: 'standard', declaration: 'project' }] });
        const webview = new FakeWebview('main');
        webview.onDidReceiveMessage(() => undefined);

        const first = webview.request('installed/get', { projectPath });
        void webview.postMessage(makeOk(first.id, 'installed/get', resultWith('Old'), 1));
        expect(packagesOf(webview.installed)).toEqual(['Old@1.0.0']);

        // An invalidation lists generation 3 for the key. No session is applied, so the model asks for nothing itself.
        void webview.postMessage(makeEvent('resources/invalidated', { scope: { kind: 'workspace' }, reason: 'manual-refresh', generation: 9, keys: [{ key: resourceKeys.installed(projectPath), generation: 3 }] }));
        const late = webview.request('installed/get', { projectPath });
        void webview.postMessage(makeOk(late.id, 'installed/get', resultWith('Late'), 2));
        expect(packagesOf(webview.installed)).toEqual(['Old@1.0.0']);
        expect(webview.discarded).toEqual([late.id]);
        expect(webview.responsesFor(late.id)).toHaveLength(1);

        // A result of the listed generation is applied; the event's own `generation` (9) is a sequence number and plays no part.
        const current = webview.request('installed/get', { projectPath });
        void webview.postMessage(makeOk(current.id, 'installed/get', resultWith('New'), 3));
        expect(packagesOf(webview.installed)).toEqual(['New@1.0.0']);
        expect(webview.discarded).toEqual([late.id]);
    });
});
