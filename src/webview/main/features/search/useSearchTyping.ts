import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMessageBus } from '../../../shared/bus/useMessageBus';
import type { Suggestion, SuggestionVersions } from '../../../shared/search/SearchBox';
import { useConfig } from '../../../shared/store/config';
import { useSearch } from '../../../shared/store/search';
import { useSession } from '../../../shared/store/session';
import { useSources } from '../../../shared/store/sources';
import { useInstallAction, type InstallAction } from '../details/useInstallAction';

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
    /** Says in the live region why a quick install did not happen. */
    announce: (message: string) => void;
}

export interface SearchTyping {
    suggestions: readonly Suggestion[];
    /** Enter: search now; the pending timer and the suggestions go. */
    submit: (text: string) => void;
    /** A suggestion was chosen: the box shows the id and the package is searched for exactly. */
    pick: (suggestion: Suggestion) => void;
    /** Suggestions are on their way. */
    suggesting: boolean;
    /** The versions of the expanded suggestion (ArrowRight), five at most. */
    expanded: SuggestionVersions | undefined;
    expand: (suggestion: Suggestion) => void;
    collapse: () => void;
    /** A version was chosen: the details show the package at that version. */
    pickVersion: (suggestion: Suggestion, version: string) => void;
    /** Ctrl+Enter: installs the version, or the suggestion's newest one, into the selected project. */
    quickInstall: (suggestion: Suggestion, version?: string) => void;
    /** The preview dialog of a quick install into a Central Package Management project. */
    install: Pick<InstallAction, 'preview' | 'closePreview' | 'confirmPreview'>;
}

/** How many versions the versions level shows, newest first. */
const VERSION_LIMIT = 5;

/**
 * What typing in the main panel's search box does (interaction model §2), by the setting `searchDebounceMode`:
 * `quicksearch` asks the search slice for suggestions 150 ms after the last key from two characters on, while the box
 * has focus; `full` runs the search itself 300 ms after the last key; `off` runs nothing while typing. Enter always
 * searches at once. The timers are the feature's; the requests are the slice's. `ui/navigateToPackage` fills the box
 * with the id and searches for it exactly, carrying the version it names to the details. On mount it enables the config and sources slices, whose answers the first
 * keystroke needs.
 */
export function useSearchTyping({ text, setText, browsing, focused, announce }: SearchTypingInput): SearchTyping {
    const bus = useMessageBus();
    const { search, suggest, suggestions, suggesting, clearSuggestions } = useSearch();
    const includePrerelease = useSession().committed?.includePrerelease ?? false;
    const installAction = useInstallAction(announce);
    const [expanded, setExpanded] = useState<SuggestionVersions | undefined>();
    const versionsAsk = useRef<AbortController | undefined>(undefined);
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

    const collapse = useCallback((): void => {
        versionsAsk.current?.abort();
        versionsAsk.current = undefined;
        setExpanded(undefined);
    }, []);
    useEffect(() => () => versionsAsk.current?.abort(), []);
    // Typing leaves the versions level.
    useEffect(() => collapse(), [text, collapse]);

    /** The versions of a suggestion on its own source, newest first, under the committed prerelease flag. */
    const versionsOf = useCallback((suggestion: Suggestion, signal: AbortSignal): Promise<readonly string[]> =>
        bus.request('package/versions', { packageId: suggestion.id, sourceUrl: suggestion.sourceUrl, includePrerelease }, { signal }).then(answer => answer.result.versions),
    [bus, includePrerelease]);

    const expand = useCallback((suggestion: Suggestion): void => {
        versionsAsk.current?.abort();
        const controller = new AbortController();
        versionsAsk.current = controller;
        setExpanded({ suggestion, status: 'loading', versions: [] });
        versionsOf(suggestion, controller.signal).then(
            versions => setExpanded({ suggestion, status: 'ready', versions: versions.slice(0, VERSION_LIMIT) }),
            (error: unknown) => {
                if (!controller.signal.aborted) {
                    setExpanded({ suggestion, status: 'error', versions: [], message: error instanceof Error ? error.message : String(error) });
                }
            },
        );
    }, [versionsOf]);

    const goTo = useCallback((packageId: string, version?: string): void => {
        clearTimeout(timer.current);
        collapse();
        clearSuggestions();
        handled.current = packageId;
        setText(packageId);
        search(packageId, { exactMatch: true, version });
    }, [collapse, clearSuggestions, setText, search]);

    useEffect(() => bus.onEvent('ui/navigateToPackage', ({ packageId, version }) => goTo(packageId, version)), [bus, goTo]);

    const submit = useCallback((value: string): void => {
        clearTimeout(timer.current);
        collapse();
        clearSuggestions();
        handled.current = value;
        search(value);
    }, [collapse, clearSuggestions, search]);

    const pick = useCallback((suggestion: Suggestion): void => goTo(suggestion.id), [goTo]);
    const pickVersion = useCallback((suggestion: Suggestion, version: string): void => goTo(suggestion.id, version), [goTo]);

    const quickInstall = (suggestion: Suggestion, version?: string): void => {
        const install = (chosen: string): void => {
            clearTimeout(timer.current);
            clearSuggestions();
            collapse();
            handled.current = text;
            installAction.install({ packageId: suggestion.id, version: chosen, sourceUrl: suggestion.sourceUrl });
        };
        const same = expanded !== undefined && expanded.suggestion.id === suggestion.id && expanded.suggestion.sourceUrl === suggestion.sourceUrl;
        const listed = same && expanded.status === 'ready' ? expanded.versions[0] : undefined;
        const known = version ?? listed;
        if (!installAction.check(suggestion.id)) {
            return;
        }
        if (known !== undefined) {
            install(known);
            return;
        }
        // The newest version of the suggestion's source: an install always names its version.
        versionsOf(suggestion, new AbortController().signal).then(versions => {
            if (versions.length === 0) {
                announce(`No version of ${suggestion.id} was found.`);
            } else {
                install(versions[0]);
            }
        }, (error: unknown) => announce(`Versions of ${suggestion.id} could not be listed: ${error instanceof Error ? error.message : String(error)}`));
    };

    const flat = useMemo<Suggestion[]>(
        () => suggestions.flatMap(group => group.packageIds.map(id => ({ id, sourceName: group.sourceName, sourceUrl: group.sourceUrl }))),
        [suggestions],
    );
    const { preview, closePreview, confirmPreview } = installAction;
    return {
        suggestions: browsing ? flat : [],
        submit,
        pick,
        suggesting: browsing && suggesting,
        expanded: browsing ? expanded : undefined,
        expand,
        collapse,
        pickVersion,
        quickInstall,
        install: { preview, closePreview, confirmPreview },
    };
}
