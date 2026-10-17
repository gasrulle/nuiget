/**
 * The image a package row shows (ADR-006, P9.1): the host's `data:` URI of the package's icon, or the bundled default
 * icon that the host puts on the webview's root as `data-package-icon` (`renderWebviewHtml`). Only `data:` URIs pass for
 * a package's own icon: the webview's CSP allows no other image origin than its own resources.
 */

let defaultIcon: string | undefined;

/** The bundled default icon, read from the root once it is found; `undefined` before a root carries one. */
export function defaultPackageIcon(): string | undefined {
    if (defaultIcon === undefined) {
        const value = document.querySelector<HTMLElement>('[data-package-icon]')?.dataset.packageIcon;
        defaultIcon = value === '' ? undefined : value;
    }
    return defaultIcon;
}

/** `iconUrl` when it is a `data:` URI, the bundled default icon otherwise. */
export function packageIconSrc(iconUrl: string | undefined): string | undefined {
    return iconUrl?.startsWith('data:') ? iconUrl : defaultPackageIcon();
}
