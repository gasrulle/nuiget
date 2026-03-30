/**
 * Unified search query parser for the main panel.
 *
 * Ported from SidebarApp.tsx and extended with @vulnerable prefix.
 * Used by App.tsx to determine search mode and filter text from the
 * unified search bar input.
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
            // Map prefix to mode: '@installed' → 'installed', '@updates' → 'updates', '@vulnerable' → 'vulnerable'
            const mode = prefix.slice(1) as 'installed' | 'updates' | 'vulnerable';
            return { mode, filterText };
        }
    }

    return { mode: 'browse', filterText: trimmed };
}
