/**
 * Runtime validation at the protocol boundary.
 *
 * `postMessage` payloads are untyped at runtime; these guards turn `unknown` into
 * the typed envelopes (or reject them) so neither side ever switches on an
 * unchecked `message.type`.
 */

import type { CancelEnvelope, EventEnvelope, InboundEnvelope, OutboundEnvelope, RequestEnvelope, ResponseEnvelope, StreamEnvelope } from './envelope';
import type { EventType, RequestType } from './messages';

// The type names exist only at compile time, so the runtime lists are written out by hand. Writing them as
// records checked with `satisfies` makes the compiler reject a key that `RequestMap` / `EventMap` lacks and
// a key that is missing here; a plain array would accept an incomplete list, and the guards would then
// drop a valid message.
const REQUEST_TYPE_RECORD = {
    'session/get': true, 'session/set': true,
    'config/get': true, 'layout/get': true, 'layout/set': true,
    'projects/list': true,
    'installed/get': true, 'updates/get': true, 'transitive/get': true, 'transitive/metadata': true,
    'allProjects/installed': true, 'allProjects/updates': true, 'allProjects/transitive': true,
    'search/query': true, 'search/autocomplete': true,
    'package/versions': true, 'package/metadata': true, 'package/readme': true, 'package/prewarm': true,
    'sources/list': true, 'sources/refresh': true, 'sources/configFiles': true, 'sources/add': true,
    'sources/remove': true, 'sources/enable': true, 'sources/disable': true,
    'ops/install': true, 'ops/update': true, 'ops/remove': true, 'ops/restore': true,
    'ops/bulkInstall': true, 'ops/bulkUpdate': true, 'ops/bulkRemove': true,
    'ops/bulkUpdateAllProjects': true, 'ops/bulkRemoveAllProjects': true,
    'refresh/all': true,
    'ui/contextMenu': true, 'ui/openSourceSettings': true, 'ui/viewPackage': true, 'ui/copyToClipboard': true,
    'ui/openExternal': true,
    'perf/mark': true,
} satisfies Record<RequestType, true>;

const EVENT_TYPE_RECORD = {
    'session/changed': true, 'projects/changed': true, 'resources/invalidated': true, 'sources/health': true,
    'ops/progress': true, 'ops/completed': true, 'config/changed': true,
    'ui/navigateToPackage': true, 'ui/openSourceSettings': true, 'ui/focusSearch': true, 'ui/selectProject': true,
} satisfies Record<EventType, true>;

export const REQUEST_TYPES: readonly RequestType[] = Object.keys(REQUEST_TYPE_RECORD) as RequestType[];

export const EVENT_TYPES: readonly EventType[] = Object.keys(EVENT_TYPE_RECORD) as EventType[];

const requestTypeSet: ReadonlySet<string> = new Set(REQUEST_TYPES);
const eventTypeSet: ReadonlySet<string> = new Set(EVENT_TYPES);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function isRequestType(value: unknown): value is RequestType {
    return typeof value === 'string' && requestTypeSet.has(value);
}

export function isEventType(value: unknown): value is EventType {
    return typeof value === 'string' && eventTypeSet.has(value);
}

export function isRequestEnvelope(value: unknown): value is RequestEnvelope {
    return isRecord(value)
        && value.kind === 'request'
        && typeof value.id === 'string' && value.id.length > 0
        && isRequestType(value.type)
        && isRecord(value.payload);
}

export function isCancelEnvelope(value: unknown): value is CancelEnvelope {
    return isRecord(value) && value.kind === 'cancel' && typeof value.id === 'string' && value.id.length > 0;
}

export function isStreamEnvelope(value: unknown): value is StreamEnvelope {
    return isRecord(value)
        && value.kind === 'stream'
        && typeof value.id === 'string'
        && isRequestType(value.type)
        && 'chunk' in value;
}

export function isResponseEnvelope(value: unknown): value is ResponseEnvelope {
    if (!isRecord(value) || value.kind !== 'response' || typeof value.id !== 'string' || !isRequestType(value.type)) {
        return false;
    }
    if (value.ok === true) {
        return 'result' in value;
    }
    return value.ok === false && isRecord(value.error) && typeof value.error.code === 'string' && typeof value.error.message === 'string';
}

export function isEventEnvelope(value: unknown): value is EventEnvelope {
    return isRecord(value) && value.kind === 'event' && isEventType(value.type) && 'payload' in value;
}

/** Parse a message received by the host. Returns `undefined` for anything that is not a valid inbound envelope. */
export function parseInbound(value: unknown): InboundEnvelope | undefined {
    if (isRequestEnvelope(value) || isCancelEnvelope(value)) {
        return value;
    }
    return undefined;
}

/** Parse a message received by a webview. Returns `undefined` for anything that is not a valid outbound envelope. */
export function parseOutbound(value: unknown): OutboundEnvelope | undefined {
    if (isStreamEnvelope(value) || isResponseEnvelope(value) || isEventEnvelope(value)) {
        return value;
    }
    return undefined;
}
