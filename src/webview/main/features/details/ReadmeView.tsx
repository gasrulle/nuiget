import { useEffect, useMemo, useRef } from 'react';
import type React from 'react';
import { useMessageBus } from '../../../shared/bus/useMessageBus';
import { Banner, EmptyState, Skeleton } from '../../../shared/primitives';
import { useDetails, useDetailsActions } from '../../../shared/store/details';
import { addCopyButtons, copyCodeOf, renderMarkdownToHtml, rewriteImages } from './markdown';

/**
 * The README tab (interaction model §7): the rendered, sanitized README of the chosen version. Its images are fetched
 * by the host (`readme/image`, with the selection's source for the credential) and shown as `data:` URIs; a copy
 * button over each code block copies its text. No README is an empty state; a failure is an inline Retry.
 */
export function ReadmeView(): React.JSX.Element {
    const bus = useMessageBus();
    const { readme, selection } = useDetails();
    const { retryReadme } = useDetailsActions();
    const container = useRef<HTMLDivElement>(null);
    const html = useMemo(() => (typeof readme.value === 'string' ? renderMarkdownToHtml(readme.value) : null), [readme.value]);
    const sourceUrl = selection?.sourceUrl;

    useEffect(() => {
        const element = container.current;
        if (element === null || html === null) {
            return undefined;
        }
        // The HTML is DOMPurify's output; it is set here, after sanitizing, with the copy buttons added to the DOM.
        element.innerHTML = html;
        addCopyButtons(element);
        const controller = new AbortController();
        void rewriteImages(element, async url => (await bus.request('readme/image', { url, sourceUrl }, { signal: controller.signal })).result.dataUri, controller.signal);
        return () => controller.abort();
    }, [bus, html, sourceUrl]);

    const onClick = (event: React.MouseEvent<HTMLDivElement>): void => {
        const code = copyCodeOf(event.target);
        if (code !== undefined) {
            void navigator.clipboard?.writeText(code);
        }
    };

    if (readme.status === 'loading' || readme.status === 'idle') {
        return <Skeleton density="comfortable" />;
    }
    if (readme.status === 'error') {
        return <Banner severity="error" action={{ label: 'Retry', onClick: retryReadme }}>{`The README could not be loaded: ${readme.error?.message ?? 'unknown error'}`}</Banner>;
    }
    if (html === null) {
        return <EmptyState data-testid="readme-empty" message="No README available." />;
    }
    // The click handler only reacts to the copy buttons inside, which are buttons and reachable by keyboard.
    return <div ref={container} className="nuiget-readme" data-testid="readme-content" onClick={onClick} />;
}
