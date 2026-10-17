/**
 * The modes of the unified search box (interaction model §2), ported unchanged from 1.x
 * (`src/webview/app/utils/parseSearchQuery.ts`, which the import fence keeps out of reach). An empty box is
 * `default`; `@installed`, `@updates` and `@vulnerable` followed by nothing or a space filter a list; anything
 * else is a `browse` search. A surface decides which modes it offers: the sidebar leaves out `@vulnerable`.
 */

export type SearchMode = 'default' | 'browse' | 'installed' | 'updates' | 'vulnerable';

export interface ParsedSearchQuery {
    mode: SearchMode;
    filterText: string;
}

export const FILTER_PREFIXES = ['@installed', '@updates', '@vulnerable'] as const;

export function parseSearchQuery(query: string): ParsedSearchQuery {
    const trimmed = query.trim();
    if (!trimmed) { return { mode: 'default', filterText: '' }; }

    const lower = trimmed.toLowerCase();
    for (const prefix of FILTER_PREFIXES) {
        if (lower === prefix || lower.startsWith(prefix + ' ')) {
            const filterText = trimmed.slice(prefix.length).trim();
            // '@installed' → 'installed', '@updates' → 'updates', '@vulnerable' → 'vulnerable'
            const mode = prefix.slice(1) as 'installed' | 'updates' | 'vulnerable';
            return { mode, filterText };
        }
    }

    return { mode: 'browse', filterText: trimmed };
}
