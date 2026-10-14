/**
 * Relevance ordering for search results merged from several origins.
 *
 * Each feed ranks its own results, but once results from two feeds (or a feed plus the CLI)
 * are merged there is no shared score, so a private package whose id matches the query exactly
 * could end up behind popular nuget.org packages that only match loosely. The five tiers below
 * put name matches first and use download counts only as the tie-breaker.
 */

/** 0 = exact id, 1 = id prefix, 2 = id substring, 3 = every query token in an id segment, 4 = rest. */
export type RelevanceTier = 0 | 1 | 2 | 3 | 4;

/** Lower-cased query tokens split on dots and whitespace (`Microsoft.Extensions Logging` → three tokens). */
export function tokenizeQuery(query: string): string[] {
    return query.toLowerCase().split(/[\s.]+/).filter(token => token.length > 0);
}

/** Relevance tier of a package id for a query (both compared case-insensitively). */
export function relevanceTier(id: string, query: string, tokens: string[] = tokenizeQuery(query)): RelevanceTier {
    const idLower = id.trim().toLowerCase();
    const queryLower = query.trim().toLowerCase();
    if (queryLower.length === 0) {
        return 4;
    }
    if (idLower === queryLower) {
        return 0;
    }
    if (idLower.startsWith(queryLower)) {
        return 1;
    }
    if (idLower.includes(queryLower)) {
        return 2;
    }
    if (tokens.length > 1) {
        const segments = idLower.split('.');
        if (tokens.every(token => segments.some(segment => segment.includes(token)))) {
            return 3;
        }
    }
    return 4;
}

/**
 * Stable sort by relevance tier, then total downloads (descending). Returns a new array; the
 * input is not modified. Entries with equal tier and downloads keep their relative order.
 */
export function sortByRelevance<T extends { id: string; totalDownloads?: number }>(results: readonly T[], query: string): T[] {
    const tokens = tokenizeQuery(query);
    const ranked = results.map((item, index) => ({ item, index, tier: relevanceTier(item.id, query, tokens) }));
    ranked.sort((a, b) => {
        if (a.tier !== b.tier) {
            return a.tier - b.tier;
        }
        const downloads = (b.item.totalDownloads ?? 0) - (a.item.totalDownloads ?? 0);
        return downloads !== 0 ? downloads : a.index - b.index;
    });
    return ranked.map(entry => entry.item);
}
