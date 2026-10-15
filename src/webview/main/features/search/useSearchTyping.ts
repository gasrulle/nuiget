import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useMessageBus } from '../../../shared/bus/useMessageBus';
import type { Suggestion } from '../../../shared/search/SearchBox';
import { useConfig } from '../../../shared/store/config';
import { useSearch } from '../../../shared/store/search';
import { useSources } from '../../../shared/store/sources';

/** How long typing pauses before a quick-search, and before a full search when the setting asks for one. */
export const QUICK_SEARCH_DELAY_MS = 150;
export const FULL_SEARCH_DELAY_MS = 300;
const MIN_LENGTH = 2;

export interface SearchTypingInput {
    /** The text in the box. */
    text: string;
    setText: (text: string) => void;
    /** The text is a browse search (no filter prefix). */
    browsing: boolean;
    /** The box has focus: suggestions are asked for only while the user is in it. */
    focused: boolean;
}

export interface SearchTyping {
    suggestions: readonly Suggestion[];
    /** Enter: search now; the pending timer and the suggestions go. */
    submit: (text: string) => void;
    /** A suggestion was chosen: the box shows the id and the package is searched for exactly. */
    pick: (suggestion: Suggestion) => void;
}

/**
 * What typing in the main panel's search box does (interaction model §2), by the setting `searchDebounceMode`:
 * `quicksearch` asks the search slice for suggestions 150 ms after the last key from two characters on, while the box
 * has focus; `full` runs the search itself 300 ms after the last key; `off` runs nothing while typing. Enter always
 * searches at once. The timers are the feature's; the requests are the slice's. `ui/navigateToPackage` fills the box
 * with the id and searches for it exactly. On mount it enables the config and sources slices, whose answers the first
 * keystroke needs.
 */
export function useSearchTyping({ text, setText, browsing, focused }: SearchTypingInput): SearchTyping {
    const bus = useMessageBus();
    const { search, suggest, suggestions, clearSuggestions } = useSearch();
    const { config, enable: enableConfig } = useConfig();
    const { enable: enableSources } = useSources();
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    // The text that was searched for by Enter, a pick or a navigation: it asks nothing more while it stays.
    const handled = useRef<string | null>(null);

    useEffect(() => {
        enableConfig();
        enableSources();
    }, [enableConfig, enableSources]);

    const mode = config?.searchDebounceMode;
    useEffect(() => {
        clearTimeout(timer.current);
        const trimmed = text.trim();
        if (!browsing || trimmed.length < MIN_LENGTH || mode === undefined) {
            clearSuggestions();
            return undefined;
        }
        if (handled.current === text) {
            return undefined;
        }
        handled.current = null;
        if (mode === 'off') {
            clearSuggestions();
            return undefined;
        }
        if (mode === 'full') {
            timer.current = setTimeout(() => search(trimmed), FULL_SEARCH_DELAY_MS);
        } else if (focused) {
            timer.current = setTimeout(() => suggest(trimmed), QUICK_SEARCH_DELAY_MS);
        }
        return () => clearTimeout(timer.current);
    }, [text, browsing, focused, mode, search, suggest, clearSuggestions]);

    const goTo = useCallback((packageId: string): void => {
        clearTimeout(timer.current);
        clearSuggestions();
        handled.current = packageId;
        setText(packageId);
        search(packageId, { exactMatch: true });
    }, [clearSuggestions, setText, search]);

    useEffect(() => bus.onEvent('ui/navigateToPackage', ({ packageId }) => goTo(packageId)), [bus, goTo]);

    const submit = useCallback((value: string): void => {
        clearTimeout(timer.current);
        clearSuggestions();
        handled.current = value;
        search(value);
    }, [clearSuggestions, search]);

    const pick = useCallback((suggestion: Suggestion): void => goTo(suggestion.id), [goTo]);

    const flat = useMemo<Suggestion[]>(
        () => suggestions.flatMap(group => group.packageIds.map(id => ({ id, sourceName: group.sourceName }))),
        [suggestions],
    );
    return { suggestions: browsing ? flat : [], submit, pick };
}
