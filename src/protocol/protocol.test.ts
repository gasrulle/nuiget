import { describe, expect, it } from 'vitest';
import { resourceKeys, type ExtensionConfig, type InstalledResult } from './domain';
import {
    makeCancel,
    makeError,
    makeEvent,
    makeOk,
    makeRequest,
    makeStream,
    nextRequestId,
    ProtocolRequestError,
} from './envelope';
import {
    EVENT_TYPES,
    isCancelEnvelope,
    isEventEnvelope,
    isEventType,
    isRequestEnvelope,
    isRequestType,
    isResponseEnvelope,
    isStreamEnvelope,
    parseInbound,
    parseOutbound,
    REQUEST_TYPES,
} from './guards';

describe('envelope factories', () => {
    it('produces unique request ids', () => {
        const ids = new Set(Array.from({ length: 1000 }, () => nextRequestId()));
        expect(ids.size).toBe(1000);
        expect(nextRequestId('x').startsWith('x')).toBe(true);
    });

    it('builds the four outbound shapes and the two inbound shapes', () => {
        const request = makeRequest('installed/get', { projectPath: '/p/a.csproj' }, 'r1');
        expect(request).toEqual({ kind: 'request', id: 'r1', type: 'installed/get', payload: { projectPath: '/p/a.csproj' } });
        expect(makeCancel('r1')).toEqual({ kind: 'cancel', id: 'r1' });
        expect(makeStream('r1', 'installed/get', { kind: 'metadata', packages: [] })).toMatchObject({ kind: 'stream', id: 'r1' });
        expect(makeOk('r1', 'package/readme', { readme: null })).toMatchObject({ kind: 'response', ok: true, result: { readme: null } });
        expect(makeError('r1', 'package/readme', { code: 'failed', message: 'x' })).toMatchObject({ kind: 'response', ok: false, error: { code: 'failed' } });
        expect(makeEvent('ui/focusSearch', {})).toEqual({ kind: 'event', type: 'ui/focusSearch', payload: {} });
    });

    it('makeOk carries a generation only when one is given', () => {
        const installed: InstalledResult = { projectPath: '/w/App/App.csproj', packages: [], fidelity: 'provisional', isCpm: false };
        const withGeneration = makeOk('a', 'installed/get', installed, 3);
        expect(withGeneration).toStrictEqual({ kind: 'response', id: 'a', type: 'installed/get', ok: true, result: installed, generation: 3 });
        expect(isResponseEnvelope(withGeneration)).toBe(true);

        // The key is absent, not `undefined`: `postMessage` and strict equality both tell the two apart.
        expect('generation' in makeOk('a', 'projects/list', { projects: [] })).toBe(false);
        expect('generation' in makeOk('a', 'projects/list', { projects: [] }, 0)).toBe(true);
    });

    it('ProtocolRequestError carries the code', () => {
        const error = new ProtocolRequestError('queue-full', 'busy', { waiting: 5 });
        expect(error.code).toBe('queue-full');
        expect(error.message).toBe('busy');
        expect(error.details).toEqual({ waiting: 5 });
        expect(error.name).toBe('ProtocolRequestError');
    });
});

describe('resource keys', () => {
    it('keys the sources of a project directory by that directory', () => {
        expect(resourceKeys.sources('/w/App')).toBe('sources:/w/App');
        expect(resourceKeys.sources('/w/Lib')).not.toBe(resourceKeys.sources('/w/App'));
    });

    it('keys versions and metadata by lower-cased id and source URL', () => {
        expect(resourceKeys.versions('Pkg', undefined, false)).toBe('versions:pkg|all|stable');
        expect(resourceKeys.versions('Pkg', 'https://feed.example.test/v3/index.json', true))
            .toBe('versions:pkg|https://feed.example.test/v3/index.json|pre');
        expect(resourceKeys.metadata('Pkg', '1.0.0-RC1', undefined)).toBe('metadata:pkg@1.0.0-rc1|all');
    });
});

describe('guards', () => {
    it('accepts the readme/image request', () => {
        expect(REQUEST_TYPES).toContain('readme/image');
        expect(isRequestEnvelope(makeRequest('readme/image', { url: 'https://example.test/a.png' }))).toBe(true);
        expect(isResponseEnvelope(makeOk('r1', 'readme/image', { url: 'https://example.test/a.png', dataUri: null }))).toBe(true);
    });

    it('recognizes every declared request and event type and nothing else', () => {
        for (const type of REQUEST_TYPES) {
            expect(isRequestType(type)).toBe(true);
        }
        for (const type of EVENT_TYPES) {
            expect(isEventType(type)).toBe(true);
        }
        expect(isRequestType('getInstalledPackages')).toBe(false);
        expect(isEventType('refresh')).toBe(false);
        expect(isRequestType(42)).toBe(false);
    });

    it('validates request envelopes strictly', () => {
        expect(isRequestEnvelope(makeRequest('projects/list', {}))).toBe(true);
        expect(isRequestEnvelope({ kind: 'request', id: '', type: 'projects/list', payload: {} })).toBe(false);
        expect(isRequestEnvelope({ kind: 'request', id: 'a', type: 'nope', payload: {} })).toBe(false);
        expect(isRequestEnvelope({ kind: 'request', id: 'a', type: 'projects/list', payload: 'x' })).toBe(false);
        expect(isRequestEnvelope({ type: 'projects/list' })).toBe(false);
        expect(isRequestEnvelope(null)).toBe(false);
    });

    it('validates cancel, stream, response and event envelopes', () => {
        expect(isCancelEnvelope(makeCancel('a'))).toBe(true);
        expect(isCancelEnvelope({ kind: 'cancel' })).toBe(false);
        expect(isStreamEnvelope(makeStream('a', 'updates/get', { kind: 'found', update: { id: 'x', installedVersion: '1', latestVersion: '2' } }))).toBe(true);
        expect(isStreamEnvelope({ kind: 'stream', id: 'a', type: 'updates/get' })).toBe(false);
        expect(isResponseEnvelope(makeOk('a', 'projects/list', { projects: [] }))).toBe(true);
        expect(isResponseEnvelope(makeError('a', 'projects/list', { code: 'failed', message: 'm' }))).toBe(true);
        expect(isResponseEnvelope({ kind: 'response', id: 'a', type: 'projects/list', ok: false, error: {} })).toBe(false);
        expect(isResponseEnvelope({ kind: 'response', id: 'a', type: 'projects/list', ok: true })).toBe(false);
        expect(isEventEnvelope(makeEvent('ui/focusSearch', {}))).toBe(true);
        expect(isEventEnvelope({ kind: 'event', type: 'nope', payload: {} })).toBe(false);
    });

    it('parseInbound / parseOutbound reject foreign shapes', () => {
        expect(parseInbound(makeRequest('projects/list', {}))).toBeDefined();
        expect(parseInbound(makeCancel('a'))).toBeDefined();
        expect(parseInbound(makeOk('a', 'projects/list', { projects: [] }))).toBeUndefined();
        expect(parseInbound({ type: 'getProjects' })).toBeUndefined();
        expect(parseOutbound(makeOk('a', 'projects/list', { projects: [] }))).toBeDefined();
        expect(parseOutbound(makeEvent('ui/focusSearch', {}))).toBeDefined();
        expect(parseOutbound(makeRequest('projects/list', {}))).toBeUndefined();
        expect(parseOutbound('string')).toBeUndefined();
    });
});

describe('shapes changed by plan item P2.9', () => {
    it('resources/invalidated carries per-key generations', () => {
        const event = makeEvent('resources/invalidated', { scope: { kind: 'workspace' }, reason: 'manual-refresh', generation: 3, keys: [{ key: resourceKeys.projects(), generation: 2 }] });
        expect(parseOutbound(event)).toBeDefined();
        expect(isEventEnvelope(event)).toBe(true);
        expect(event.payload.keys[0].generation).toBe(2);
        expect(event.payload.keys[0].key).toBe('projects');
        // The event's own generation numbers the events; it is not the generation of a key.
        expect(event.payload.generation).toBe(3);
    });

    it('ExtensionConfig has enablePerformanceLogging and no recentSearchesLimit', () => {
        const config = { searchDebounceMode: 'quicksearch', quickSearchResultsPerSource: 5, searchResultLimit: 20, enablePerformanceLogging: false, treeIndent: 16, isWindows: false } satisfies ExtensionConfig;
        expect(Object.keys(config).sort()).toEqual(['enablePerformanceLogging', 'isWindows', 'quickSearchResultsPerSource', 'searchDebounceMode', 'searchResultLimit', 'treeIndent']);
        expect('recentSearchesLimit' in config).toBe(false);
    });
});
