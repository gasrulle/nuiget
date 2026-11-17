import type { ExtensionConfig } from '../../protocol';

type Look = Pick<ExtensionConfig, 'look' | 'density' | 'uppercaseViewHeaders' | 'alwaysShowHeaderActions'>;

/**
 * Writes the host's look onto the document element (ADR-011 Decision 2), as `renderWebviewHtml` does for the first
 * paint, so a portalled dialog inherits it. Each entry runs it on `config/changed`; a boolean attribute is present when
 * true and removed when false, never written with a value.
 */
export function applyLook(config: Look, root: HTMLElement = document.documentElement): void {
    root.setAttribute('data-look', config.look);
    root.setAttribute('data-density', config.density);
    root.toggleAttribute('data-uppercase-headers', config.uppercaseViewHeaders);
    root.toggleAttribute('data-always-show-header-actions', config.alwaysShowHeaderActions);
}
