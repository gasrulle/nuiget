/**
 * The webview side of the protocol for the two-surface harness: a recorder of every envelope plus a small
 * client model. The model follows the seven rules that the real message bus and store of the webviews
 * implement later (plan item P3.3; ARCHITECTURE.md, "Two-surface harness"):
 *
 * R1 On start it asks `session/get` and `projects/list`. A snapshot (from a `session/get` or `session/set`
 *    response or a `session/changed` event) is applied only when its `rev` is above the last applied one.
 * R2 `projects/changed` and the `projects/list` response replace the project list.
 * R3 When the applied snapshot selects another real project, it asks `installed/get` for it, and asks again
 *    when `resources/invalidated` names that project's key. In all-projects mode it asks
 *    `allProjects/installed` instead, again when the event names `projects` or any `installed:` key, and
 *    keeps the `project` chunks by project path.
 * R4 The latest request wins per slot (`session`, `projects`, `installed`, `allProjects`): a response or
 *    chunk of an earlier request of that slot is recorded and not applied.
 * R5 Progress, chunks, `ops/completed` and terminal responses are recorded; `pending()` lists the requests
 *    without a terminal response.
 * R6 Every envelope is kept verbatim in `sent` and `received`; other events are recorded only.
 * R7 An ok response of the `projects`, `installed` or `updates` slot carries `generation`; it is applied only when that
 *    generation is not below the one the latest `resources/invalidated` event listed for its key (`projects`,
 *    `installed:<path>`, `updates:<path>|…`); a lower one is recorded and not applied. Rule 4 is unchanged; chunks are
 *    never compared.
 * R8 `checkUpdates` asks `updates/get` for the selected project; once asked, the model asks again when
 *    `resources/invalidated` names that `updates:` key, and when an applied snapshot of the same project carries
 *    another `includePrerelease` (another flag is another resource). Every `sources/health` payload is kept in `health`.
 */

import {
    ALL_PROJECTS,
    makeCancel,
    makeRequest,
    resourceKeys,
    type BulkOutcome,
    type EventPayload,
    type EventType,
    type FailedSource,
    type InboundEnvelope,
    type InstalledResult,
    type OperationOutcome,
    type PackageUpdate,
    type OutboundEnvelope,
    type Project,
    type RequestChunk,
    type RequestPayload,
    type RequestType,
    type ResourceKey,
    type ResponseEnvelope,
    type SessionSnapshot,
    type StreamEnvelope,
} from '../../protocol';

type Slot = 'session' | 'projects' | 'installed' | 'allProjects' | 'updates';
type Listener = (message: unknown) => void;
interface DisposableLike { dispose(): void }

const SLOT_OF: Partial<Record<RequestType, Slot>> = {
    'session/get': 'session',
    'session/set': 'session',
    'projects/list': 'projects',
    'installed/get': 'installed',
    'updates/get': 'updates',
    'allProjects/installed': 'allProjects',
};

export interface SentRequest<T extends RequestType = RequestType> {
    id: string;
    type: T;
    /** Resolves with the terminal response of this request, ok or error. */
    response: Promise<ResponseEnvelope<T>>;
}

export interface AppliedInstalled {
    /** Position in `received` of the response that was applied. */
    receivedAt: number;
    result: InstalledResult;
}

const isRealProject = (projectPath: string): boolean => projectPath !== '' && projectPath !== ALL_PROJECTS;

export class FakeWebview {
    // ── what `vscode.Webview` offers and the hosts use ──
    html = '';
    options: unknown = {};
    readonly cspSource = 'https://harness.test';
    readonly asWebviewUri = <T>(uri: T): T => uri;

    // ── recorder (R5, R6) ──
    readonly sent: InboundEnvelope[] = [];
    readonly received: OutboundEnvelope[] = [];

    // ── model ──
    session: SessionSnapshot | undefined;
    /** The revisions that were applied, in order. */
    readonly appliedRevs: number[] = [];
    projects: Project[] | undefined;
    installed: InstalledResult | undefined;
    readonly installedHistory: AppliedInstalled[] = [];
    /** All-projects mode: the last `project` chunk per project path. */
    readonly allProjects = new Map<string, InstalledResult | { error: string }>();
    allProjectsMode = false;

    updates: { projectPath: string; updates: PackageUpdate[]; sourcesUnavailable?: boolean } | undefined;
    /** Every `sources/health` payload, in order (R8). */
    readonly health: FailedSource[][] = [];
    private updatesAsked: { projectPath: string; includePrerelease: boolean } | undefined;

    /** Request ids whose ok response was below the generation listed for its key (R7). */
    readonly discarded: string[] = [];

    private listener: Listener | undefined;
    /** The generation the latest `resources/invalidated` event listed for a key (R7). */
    private readonly listed = new Map<ResourceKey, number>();
    private readonly latest: Partial<Record<Slot, string>> = {};
    private readonly waiting = new Map<string, (response: ResponseEnvelope) => void>();

    constructor(public readonly surface: 'sidebar' | 'main') {}

    readonly onDidReceiveMessage = (listener: Listener, _thisArg?: unknown, disposables?: DisposableLike[]): DisposableLike => {
        this.listener = listener;
        const registration = { dispose: () => { if (this.listener === listener) { this.listener = undefined; } } };
        disposables?.push(registration);
        return registration;
    };

    readonly postMessage = (message: unknown): Promise<boolean> => {
        this.receive(message as OutboundEnvelope);
        return Promise.resolve(true);
    };

    /** R1: what a webview asks first. */
    start(): void {
        this.request('session/get', {});
        this.request('projects/list', {});
    }

    request<T extends RequestType>(type: T, payload: RequestPayload<T>): SentRequest<T> {
        const envelope = makeRequest(type, payload);
        const slot = SLOT_OF[type];
        if (slot) {
            this.latest[slot] = envelope.id;
        }
        const response = new Promise<ResponseEnvelope<T>>(resolve => {
            this.waiting.set(envelope.id, resolve as (response: ResponseEnvelope) => void);
        });
        this.send(envelope);
        return { id: envelope.id, type, response };
    }

    cancel(id: string): void {
        this.send(makeCancel(id));
    }

    /** R3, all-projects mode: asked by the scenario, kept current by the model. */
    showAllProjects(): SentRequest<'allProjects/installed'> {
        this.allProjectsMode = true;
        return this.request('allProjects/installed', {});
    }

    // ── reading the record ──

    /** Request ids without a terminal response (R5). */
    pending(): string[] {
        return [...this.waiting.keys()];
    }

    latestId(slot: Slot): string | undefined {
        return this.latest[slot];
    }

    responsesFor(id: string): ResponseEnvelope[] {
        return this.received.filter((message): message is ResponseEnvelope => message.kind === 'response' && message.id === id);
    }

    chunksFor<T extends RequestType>(id: string): Array<RequestChunk<T>> {
        return this.received
            .filter((message): message is StreamEnvelope => message.kind === 'stream' && message.id === id)
            .map(message => message.chunk as RequestChunk<T>);
    }

    events<T extends EventType>(type: T): Array<EventPayload<T>> {
        return this.received
            .filter(message => message.kind === 'event' && message.type === type)
            .map(message => (message as unknown as { payload: EventPayload<T> }).payload);
    }

    /** Outcomes announced to this surface (`ops/completed`), whoever started the operation. */
    completed(): Array<OperationOutcome | BulkOutcome> {
        return this.events('ops/completed');
    }

    requestIds(): string[] {
        return this.sent.filter(message => message.kind === 'request').map(message => message.id);
    }

    /** R8: ask the updates of the selected project; the model asks again when an invalidation names that key. */
    checkUpdates(includePrerelease = false): SentRequest<'updates/get'> {
        const projectPath = this.session?.selectedProject ?? '';
        this.updatesAsked = { projectPath, includePrerelease };
        return this.request('updates/get', { projectPath, includePrerelease });
    }

    // ── the model ──

    private send(envelope: InboundEnvelope): void {
        this.sent.push(envelope);
        this.listener?.(envelope);
    }

    private receive(message: OutboundEnvelope): void {
        this.received.push(message);
        if (message.kind === 'event') {
            this.onEvent(message.type, message.payload);
        } else if (message.kind === 'stream') {
            this.onChunk(message);
        } else {
            this.onResponse(message);
            this.waiting.get(message.id)?.(message);
            this.waiting.delete(message.id);
        }
    }

    private onEvent(type: EventType, payload: unknown): void {
        if (type === 'session/changed') {
            this.applySession(payload as SessionSnapshot);
        } else if (type === 'projects/changed') {
            this.projects = (payload as EventPayload<'projects/changed'>).projects;
        } else if (type === 'resources/invalidated') {
            this.onInvalidated(payload as EventPayload<'resources/invalidated'>);
        } else if (type === 'sources/health') {
            this.health.push((payload as EventPayload<'sources/health'>).failed);
        }
    }

    private onInvalidated(event: EventPayload<'resources/invalidated'>): void {
        const keys = event.keys.map(entry => entry.key);
        for (const entry of event.keys) {
            this.listed.set(entry.key, entry.generation);
        }
        if (this.allProjectsMode) {
            if (keys.some(key => key === resourceKeys.projects() || key.startsWith('installed:'))) {
                this.request('allProjects/installed', {});
            }
            return;
        }
        const selected = this.session?.selectedProject ?? '';
        if (isRealProject(selected) && keys.includes(resourceKeys.installed(selected))) {
            this.request('installed/get', { projectPath: selected });
        }
        const asked = this.updatesAsked;
        if (asked && keys.includes(resourceKeys.updates(asked.projectPath, asked.includePrerelease))) {
            this.request('updates/get', { projectPath: asked.projectPath, includePrerelease: asked.includePrerelease });
        }
    }

    private onChunk(message: StreamEnvelope): void {
        if (message.type !== 'allProjects/installed' || message.id !== this.latest.allProjects) {
            return;
        }
        const chunk = message.chunk as RequestChunk<'allProjects/installed'>;
        if (chunk.kind === 'project') {
            const { projectPath, result, error } = chunk.chunk;
            this.allProjects.set(projectPath, result ?? { error: error ?? 'unknown' });
        }
    }

    private onResponse(message: ResponseEnvelope): void {
        const slot = SLOT_OF[message.type];
        // R4: only the latest request of a slot is applied.
        if (!message.ok || slot === undefined || this.latest[slot] !== message.id) {
            return;
        }
        if (slot === 'session') {
            this.applySession(message.result as SessionSnapshot);
        } else if (slot === 'projects') {
            if (this.isCurrent(message.id, resourceKeys.projects(), message.generation)) {
                this.projects = (message.result as { projects: Project[] }).projects;
            }
        } else if (slot === 'updates') {
            const result = message.result as { projectPath: string; updates: PackageUpdate[]; sourcesUnavailable?: boolean };
            const asked = this.updatesAsked;
            if (this.isCurrent(message.id, resourceKeys.updates(result.projectPath, asked?.includePrerelease ?? false), message.generation)) {
                this.updates = result;
            }
        } else if (slot === 'installed') {
            const result = message.result as InstalledResult;
            if (this.isCurrent(message.id, resourceKeys.installed(result.projectPath), message.generation)) {
                this.installed = result;
                this.installedHistory.push({ receivedAt: this.received.length - 1, result });
            }
        }
    }

    /** R7: a result computed for a generation below the one an invalidation has listed for its key is out of date. */
    private isCurrent(id: string, key: ResourceKey, generation: number | undefined): boolean {
        const listed = this.listed.get(key);
        if (generation !== undefined && listed !== undefined && generation < listed) {
            this.discarded.push(id);
            return false;
        }
        return true;
    }

    private applySession(snapshot: SessionSnapshot): void {
        if (this.session !== undefined && snapshot.rev <= this.session.rev) {
            return;
        }
        const previous = this.session?.selectedProject;
        this.session = snapshot;
        this.appliedRevs.push(snapshot.rev);
        if (!this.allProjectsMode && snapshot.selectedProject !== previous && isRealProject(snapshot.selectedProject)) {
            this.request('installed/get', { projectPath: snapshot.selectedProject });
        }
        // R8: the updates follow the committed prerelease flag.
        const asked = this.updatesAsked;
        if (asked && asked.projectPath === snapshot.selectedProject && asked.includePrerelease !== snapshot.includePrerelease) {
            this.checkUpdates(snapshot.includePrerelease);
        }
    }
}
