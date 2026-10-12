import { describe, expect, it } from 'vitest';
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

    it('ProtocolRequestError carries the code', () => {
        const error = new ProtocolRequestError('queue-full', 'busy', { waiting: 5 });
        expect(error.code).toBe('queue-full');
        expect(error.message).toBe('busy');
        expect(error.details).toEqual({ waiting: 5 });
        expect(error.name).toBe('ProtocolRequestError');
    });
});

describe('guards', () => {
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
