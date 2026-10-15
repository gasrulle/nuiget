/**
 * A scripted NuGet V3 feed for the harness: the service index, the search service (`packageid:` lookups), the registration
 * and the flat container of `SHARED_FEED` and `PRIVATE_FEED`, answered from what a scenario `publish`es. While `down` is
 * true every request fails with a network error. Requests are recorded by URL. Nothing here reaches the network.
 */

import type { TransportRequest, TransportResult } from '../../core/contracts';
import { fail, json, type FakeHandler } from '../../core/feeds/testSupport';
import { normalizeId, sortDescending } from '../../core/versioning';

const FEED_INDEX = /^(https:\/\/[^/]+)\/v3\/index\.json$/;

export interface FakeFeed {
    handler: FakeHandler;
    /** Make `versions` of `id` known to every feed; the newest is the latest. */
    publish(id: string, versions: string[]): void;
    /** While true, every request fails with a network error. */
    down: boolean;
    readonly requests: string[];
}

export function createFakeFeed(): FakeFeed {
    const published = new Map<string, { id: string; versions: string[] }>();
    const feed: FakeFeed = {
        down: false,
        requests: [],
        publish(id, versions) {
            published.set(normalizeId(id), { id, versions: [...versions] });
        },
        handler: (request: TransportRequest): TransportResult => {
            feed.requests.push(request.url);
            if (feed.down) {
                return fail('network');
            }
            return answer(new URL(request.url), request.url);
        },
    };

    const answer = (url: URL, raw: string): TransportResult => {
        const index = FEED_INDEX.exec(raw);
        if (index) {
            const base = index[1];
            return json({
                version: '3.0.0',
                resources: [
                    { '@id': `${base}/query`, '@type': 'SearchQueryService' },
                    { '@id': `${base}/registration/`, '@type': 'RegistrationsBaseUrl/3.6.0' },
                    { '@id': `${base}/flat/`, '@type': 'PackageBaseAddress/3.0.0' },
                ],
            });
        }
        const segments = url.pathname.split('/').filter(Boolean);
        if (url.pathname === '/query') {
            const q = url.searchParams.get('q') ?? '';
            const known = q.toLowerCase().startsWith('packageid:') ? published.get(normalizeId(q.slice('packageid:'.length))) : undefined;
            if (!known) {
                return json({ data: [] });
            }
            const versions = sortDescending(known.versions);
            return json({ data: [{ id: known.id, version: versions[0], versions: versions.map(version => ({ version })), description: `${known.id} package`, authors: ['Harness'] }] });
        }
        if (segments[0] === 'flat' && segments.length === 3 && segments[2] === 'index.json') {
            const known = published.get(normalizeId(segments[1]));
            return known ? json({ versions: known.versions }) : fail('http-error', 404);
        }
        if (segments[0] === 'registration' && segments.length === 3) {
            const known = published.get(normalizeId(segments[1]));
            if (!known) {
                return fail('http-error', 404);
            }
            const entries = known.versions.map(version => ({ catalogEntry: { id: known.id, version, description: `${known.id} package`, authors: 'Harness' } }));
            if (segments[2] === 'index.json') {
                return json({ items: [{ items: entries }] });
            }
            const version = segments[2].replace(/\.json$/, '');
            const leaf = entries.find(entry => entry.catalogEntry.version.toLowerCase() === version);
            return leaf ? json(leaf) : fail('http-error', 404);
        }
        return fail('http-error', 404);
    };
    return feed;
}
