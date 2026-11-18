import { useEffect, useRef } from 'react';

// The words of a main-panel first load: the name of its progress bar and the sentence of the live region, one constant
// for both (a11y-first-load-announced, UX-P4.6). Browse announces its own (UX-P5.9).
export const LOADING_INSTALLED = 'Loading installed packages';
export const LOADING_UPDATES = 'Loading updates';
export const LOADING_DETAILS = 'Loading details';
export const LOADING_README = 'Loading the README';

/**
 * Says `text` through the live region when a first load of `key` starts: nothing is shown for the key yet. A
 * revalidation and an answer the store already holds are no first load and say nothing. The key last said is kept, so
 * an effect that runs again (StrictMode, a new `announce`) never says it twice; another key is said again. A `null`
 * key, before the selection is known, says nothing.
 */
export function useFirstLoadAnnouncement(announce: (message: string) => void, text: string, key: string | null, firstLoad: boolean): void {
    const said = useRef<string | null>(null);
    useEffect(() => {
        if (firstLoad && key !== null && said.current !== key) {
            said.current = key;
            announce(text);
        }
    }, [announce, text, key, firstLoad]);
}
