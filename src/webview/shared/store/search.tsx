import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { ProtocolRequestError, type NuGetSource, type PackageMetadataLite, type PackageSearchResult, type QuickSearchSourceResult } from '../../../protocol';
import { useMessageBus } from '../bus/useMessageBus';
import { useConfig } from './config';
import { useSession } from './session';
import { useSources } from './sources';

export interface SearchOptions {
    /** Ask for the id exactly (navigation to a package), not for packages that match the text. */
    exactMatch?: boolean;
}

export interface SearchState {
    /** The text whose results are shown or asked; empty when no search runs. */
    query: string;
    /** The text was asked as an exact package id (a navigation to the package). */
    exactMatch: boolean;
    /** `idle`: no search. `loading`: asked, nothing to show for this text yet. `ready`: `results` answer it. `error`: it failed. */
    status: 'idle' | 'loading' | 'ready' | 'error';
    /** The packages found, each with the lite metadata (icon, verification, authors) that came with the answer. */
    results: readonly PackageSearchResult[];
    /** True when a source could not be searched: the results may be incomplete, and none does not mean "no results". */
    sourcesUnavailable: boolean;
    error: ProtocolRequestError | undefined;
    /** The same text is asked again (another source or prerelease flag, or Retry) while its earlier results stay shown. */
    revalidating: boolean;
    search: (query: string, options?: SearchOptions) => void;
    clear: () => void;
    retry: () => void;
    /** Quick-search: package ids that start with the text, per source, while the user types. */
    suggestions: readonly QuickSearchSourceResult[];
    /** A quick-search is on its way. */
    suggesting: boolean;
    /**
     * Ask the quick-search for the text over the committed source (every enabled source under `all`). Nothing is
     * sent while the source list is unknown or names no source, or when the setting asks for full searches.
     */
    suggest: (query: string) => void;
    clearSuggestions: () => void;
}

interface Asked {
    query: string;
    exactMatch: boolean;
    /** Goes up with every `search` and `retry`, so that asking the same text again asks again. */
    attempt: number;
}

interface Answered {
    query: string;
    results: readonly PackageSearchResult[];
    sourcesUnavailable: boolean;
}

const SearchContext = createContext<SearchState | null>(null);

const NO_RESULTS: readonly PackageSearchResult[] = [];
const NO_SUGGESTIONS: readonly QuickSearchSourceResult[] = [];

/** The sources a quick-search names: the enabled ones under `all`, else the enabled one selected. */
export function quickSearchSources(sources: readonly NuGetSource[], selectedSource: string): Array<{ name: string; url: string }> {
    return sources
        .filter(source => source.enabled && (selectedSource === 'all' || source.url === selectedSource))
        .map(source => ({ name: source.name, url: source.url }));
}

const liteKey = (id: string, version: string): string => `${id.toLowerCase()}@${version.toLowerCase()}`;

/** The results with what the metadata chunk said about each, where the result itself says nothing. */
export function withMetadata(results: readonly PackageSearchResult[], lite: readonly PackageMetadataLite[]): PackageSearchResult[] {
    const byKey = new Map(lite.map(entry => [liteKey(entry.id, entry.version), entry]));
    return results.map(result => {
        const entry = byKey.get(liteKey(result.id, result.version));
        if (entry === undefined) {
            return result;
        }
        const merged: PackageSearchResult = { ...result };
        if (merged.iconUrl === undefined && entry.iconUrl !== undefined) {
            merged.iconUrl = entry.iconUrl;
        }
        if (merged.verified === undefined && entry.verified !== undefined) {
            merged.verified = entry.verified;
        }
        if (!merged.authors && entry.authors) {
            merged.authors = entry.authors;
        }
        if (!merged.description && entry.description) {
            merged.description = entry.description;
        }
        return merged;
    });
}

/**
 * The search slice: one browse search per surface over the sources and prerelease flag the host has committed. A
 * search is keyed by what the user typed, so it is not a resource of the host's coordinator: no generation, and the
 * latest text wins (the request before it is cancelled). The `metadata` chunk precedes the answer and is merged onto
 * its results. A committed change of source or prerelease flag asks the shown text again without blanking the list.
 */
export function SearchProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const bus = useMessageBus();
    const committed = useSession().committed;
    const [asked, setAsked] = useState<Asked>();
    const [answered, setAnswered] = useState<Answered>();
    const [failure, setFailure] = useState<{ attempt: number; error: ProtocolRequestError }>();
    const [requesting, setRequesting] = useState(false);
    const { sources } = useSources();
    const { config } = useConfig();
    const [suggested, setSuggested] = useState<{ groups: readonly QuickSearchSourceResult[]; pending: boolean }>({ groups: NO_SUGGESTIONS, pending: false });
    const suggestion = useRef<AbortController>(undefined);

    const ready = committed !== undefined;
    const includePrerelease = committed?.includePrerelease ?? false;
    const source = committed?.selectedSource ?? 'all';

    useEffect(() => {
        if (asked === undefined || !ready) {
            return undefined;
        }
        const controller = new AbortController();
        let lite: PackageMetadataLite[] = [];
        setRequesting(true);
        setFailure(undefined);
        bus.request('search/query', {
            query: asked.query,
            sourceUrls: source === 'all' ? undefined : [source],
            includePrerelease,
            exactMatch: asked.exactMatch || undefined,
        }, {
            signal: controller.signal,
            onChunk: chunk => {
                lite = [...lite, ...chunk.packages];
            },
        }).then(
            ({ result }) => {
                setAnswered({ query: asked.query, results: withMetadata(result.results, lite), sourcesUnavailable: result.sourcesUnavailable === true });
                setRequesting(false);
            },
            (error: unknown) => {
                if (controller.signal.aborted) {
                    return;
                }
                setFailure({ attempt: asked.attempt, error: error instanceof ProtocolRequestError ? error : new ProtocolRequestError('failed', String(error)) });
                setRequesting(false);
            },
        );
        return () => controller.abort();
    }, [bus, asked, ready, source, includePrerelease]);

    const search = useCallback((query: string, options: SearchOptions = {}): void => {
        const text = query.trim();
        if (text.length === 0) {
            setAsked(undefined);
            return;
        }
        setAsked(previous => ({ query: text, exactMatch: options.exactMatch === true, attempt: (previous?.attempt ?? 0) + 1 }));
    }, []);
    const clear = useCallback((): void => {
        setAsked(undefined);
        setAnswered(undefined);
        setFailure(undefined);
        setRequesting(false);
    }, []);
    const retry = useCallback((): void => setAsked(previous => (previous === undefined ? previous : { ...previous, attempt: previous.attempt + 1 })), []);

    const clearSuggestions = useCallback((): void => {
        suggestion.current?.abort();
        suggestion.current = undefined;
        setSuggested({ groups: NO_SUGGESTIONS, pending: false });
    }, []);
    const suggest = useCallback((query: string): void => {
        clearSuggestions();
        const text = query.trim();
        const named = committed === undefined || sources === undefined ? [] : quickSearchSources(sources, committed.selectedSource);
        if (text.length === 0 || named.length === 0 || config?.searchDebounceMode === 'full' || config?.searchDebounceMode === 'off') {
            return;
        }
        const controller = new AbortController();
        suggestion.current = controller;
        setSuggested({ groups: NO_SUGGESTIONS, pending: true });
        bus.request('search/autocomplete', { query: text, sources: named, includePrerelease: committed?.includePrerelease ?? false }, { signal: controller.signal }).then(
            ({ result }) => setSuggested({ groups: result.groups, pending: false }),
            () => {
                if (!controller.signal.aborted) {
                    setSuggested({ groups: NO_SUGGESTIONS, pending: false });
                }
            },
        );
    }, [bus, committed, sources, config, clearSuggestions]);
    // Nothing is left asking when the surface goes.
    useEffect(() => () => suggestion.current?.abort(), []);

    const state = useMemo<SearchState>(() => {
        const quick = { suggestions: suggested.groups, suggesting: suggested.pending, suggest, clearSuggestions };
        if (asked === undefined) {
            return { query: '', exactMatch: false, status: 'idle', results: NO_RESULTS, sourcesUnavailable: false, error: undefined, revalidating: false, search, clear, retry, ...quick };
        }
        const shown = answered !== undefined && answered.query === asked.query ? answered : undefined;
        const error = failure?.attempt === asked.attempt ? failure.error : undefined;
        let status: SearchState['status'] = 'loading';
        if (shown !== undefined) {
            status = 'ready';
        } else if (error !== undefined) {
            status = 'error';
        }
        return {
            query: asked.query,
            exactMatch: asked.exactMatch,
            status,
            results: shown?.results ?? NO_RESULTS,
            sourcesUnavailable: shown?.sourcesUnavailable ?? false,
            error,
            revalidating: shown !== undefined && requesting,
            search,
            clear,
            retry,
            ...quick,
        };
    }, [asked, answered, failure, requesting, search, clear, retry, suggested, suggest, clearSuggestions]);

    return <SearchContext.Provider value={state}>{children}</SearchContext.Provider>;
}

export function useSearch(): SearchState {
    const state = useContext(SearchContext);
    if (state === null) {
        throw new Error('useSearch needs a SearchProvider above it');
    }
    return state;
}
